/*
 * hodoku-solver-ts — TypeScript port of HoDoKu's logical Sudoku solver.
 * Copyright (C) 2026 starxmaker
 *
 * Ported from HoDoKu (https://sourceforge.net/projects/hodoku/)
 * Original Java implementation Copyright (C) 2008-12 Bernhard Hobiger
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type { SolutionStep } from '../Sudoku2';
import { Sudoku2 } from '../Sudoku2';
import { SolutionType } from '../SolutionType';
import type { Digit } from '../types';
import { AbstractSolver } from './AbstractSolver';

// ---------------------------------------------------------------------------
// Lightweight ALS representation
// ---------------------------------------------------------------------------
interface Als {
  /** Sorted cell indices belonging to this ALS. */
  cells: number[];
  /** Bitmask of digits present in the ALS (bit 1<<d for digit d). */
  candMask: number;
  /**
   * For each digit d (1–9): the set (as number[]) of cells in this ALS that
   * contain d as a candidate.
   */
  cellsFor: number[][];
  /**
   * For each digit d (1–9): the intersection of BUDDIES of all cells in
   * cellsFor[d], intersected with cells that still have d as candidate.
   * These are the cells OUTSIDE the ALS that see every occurrence of d in
   * the ALS.
   */
  buddiesFor: Set<number>[];
}

// ---------------------------------------------------------------------------
// Build the buddy set for a set of cell indices: cells seen by ALL of them.
// ---------------------------------------------------------------------------
function commonBuddies(cellSet: number[]): Set<number> {
  if (cellSet.length === 0) return new Set();
  const BUDDIES = Sudoku2.BUDDIES;
  let result = new Set<number>(BUDDIES[cellSet[0]]);
  for (let i = 1; i < cellSet.length; i++) {
    for (const b of result) {
      if (!BUDDIES[cellSet[i]].includes(b)) result.delete(b);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// AlsSolver — ALS-XZ technique.
// Mirrors the core of solver/AlsSolver.java#getAlsXZInt().
//
// ALS-XZ: two Almost-Locked Sets A and B share one (or two) Restricted
// Common(s) X (all occurrences of digit X in A+B see each other).  Any
// digit Z that is common to both A and B (Z ≠ X) can be eliminated from
// cells outside A∪B that see ALL occurrences of Z in A and in B.
// ---------------------------------------------------------------------------

export class AlsSolver extends AbstractSolver {
  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    if (type === SolutionType.ALS_XZ) return this._findAlsXZ();
    return null;
  }

  // ------------------------------------------------------------------ //
  // Collect all ALS in the current grid.                                //
  // An ALS is a set of N unsolved cells in one house that collectively  //
  // contain exactly N+1 distinct candidates.                            //
  // We enumerate ALS of size 1..N-1 inside each of the 27 houses.      //
  // ------------------------------------------------------------------ //
  private _collectAlses(): Als[] {
    const alses: Als[] = [];
    const HOUSES = Sudoku2.HOUSES;
    const seen = new Set<string>();

    for (let h = 0; h < 27; h++) {
      const house = HOUSES[h];
      // Unsolved cells in this house
      const unsolved: number[] = [];
      for (const i of house) {
        if (this.sudoku.values[i] === 0) unsolved.push(i);
      }
      const n = unsolved.length;
      // ALS size k: from 1 to n-1
      for (let k = 1; k < n; k++) {
        // All k-combinations from unsolved
        for (const combo of kCombinations(unsolved, k)) {
          // Union candidate mask
          let mask = 0;
          for (const i of combo) mask |= this.sudoku.candidates[i];
          // Count distinct candidates (bits 1..9)
          if (popcount(mask) !== k + 1) continue;
          // Deduplicate: sort cells and use as key
          const key = combo.slice().sort((a, b) => a - b).join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          // Build als
          const cellsFor: number[][] = new Array(10).fill(null).map(() => []);
          const buddiesFor: Set<number>[] = new Array(10).fill(null).map(() => new Set());
          for (let d = 1; d <= 9; d++) {
            if (!(mask & (1 << d))) continue;
            for (const i of combo) {
              if (this.sudoku.isCandidate(i, d)) cellsFor[d].push(i);
            }
            // buddiesFor[d] = cells outside ALS that see ALL cells in cellsFor[d] with cand d
            if (cellsFor[d].length > 0) {
              const cb = commonBuddies(cellsFor[d]);
              for (const b of cb) {
                if (!combo.includes(b) && this.sudoku.values[b] === 0 && this.sudoku.isCandidate(b, d))
                  buddiesFor[d].add(b);
              }
            }
          }
          const buddies = new Set<number>();
          for (let d = 1; d <= 9; d++) {
            for (const b of buddiesFor[d]) buddies.add(b);
          }
          alses.push({ cells: combo.slice().sort((a, b) => a - b), candMask: mask, cellsFor, buddiesFor });
        }
      }
    }
    return alses;
  }

  // ------------------------------------------------------------------ //
  // ALS-XZ search                                                        //
  // ------------------------------------------------------------------ //
  private _findAlsXZ(): SolutionStep | null {
    const alses = this._collectAlses();
    const n = alses.length;
    const BUDDIES = Sudoku2.BUDDIES;

    for (let i = 0; i < n - 1; i++) {
      const A = alses[i];
      for (let j = i + 1; j < n; j++) {
        const B = alses[j];

        // ALS must not overlap
        const aSet = new Set(A.cells);
        if (B.cells.some(c => aSet.has(c))) continue;

        // Common candidates
        const common = A.candMask & B.candMask;
        if (!common) continue;

        // Find restricted common(s): a digit X whose every occurrence in A
        // and B all see each other.
        const rcs: number[] = [];
        for (let x = 1; x <= 9; x++) {
          if (!(common & (1 << x))) continue;
          const allCells = [...A.cellsFor[x], ...B.cellsFor[x]];
          if (allMutualBuddies(allCells, BUDDIES)) rcs.push(x);
          if (rcs.length === 2) break;
        }
        if (rcs.length === 0) continue;

        // With RC(s) found, look for eliminations.
        // Candidates that can be eliminated: any digit Z common to A and B,
        // Z ≠ all RCs, where cells outside A∪B see all occurrences of Z in both.
        const toDelete: { index: number; value: Digit }[] = [];
        const rcMask = rcs.reduce((m, r) => m | (1 << r), 0);

        // doubly-linked: if 2 RCs, each ALS minus the two RC digits becomes locked
        const doubly = rcs.length === 2;

        if (doubly) {
          // For doubly-linked: candidates of A minus rc1 minus rc2 can be
          // eliminated from outside A that are buddies to ALL those cells in A.
          toDelete.push(...this._doublyLinkedElims(A, B, rcs[0], rcs[1]));
          toDelete.push(...this._doublyLinkedElims(B, A, rcs[0], rcs[1]));
        }

        // Normal Z eliminations (work for both singly and doubly linked)
        for (let z = 1; z <= 9; z++) {
          if (!(common & (1 << z))) continue;
          if (rcMask & (1 << z)) continue; // skip RC digit itself

          // Cells outside A∪B that see ALL z-cells in A and ALL z-cells in B
          const zCellsA = A.cellsFor[z];
          const zCellsB = B.cellsFor[z];
          if (zCellsA.length === 0 || zCellsB.length === 0) continue;

          const buddiesA = commonBuddies(zCellsA);
          for (const b of buddiesA) {
            if (aSet.has(b) || B.cells.includes(b)) continue;
            if (!B.buddiesFor[z].has(b)) continue;
            if (this.sudoku.values[b] !== 0 || !this.sudoku.isCandidate(b, z)) continue;
            toDelete.push({ index: b, value: z as Digit });
          }
        }

        // Deduplicate
        const unique = dedupCands(toDelete);
        if (unique.length > 0) {
          return {
            type: SolutionType.ALS_XZ,
            placements: [],
            candidatesToDelete: unique,
          };
        }
      }
    }
    return null;
  }

  private _doublyLinkedElims(
    A: Als, B: Als,
    rc1: number, rc2: number
  ): { index: number; value: Digit }[] {
    const result: { index: number; value: Digit }[] = [];
    const rcMask = (1 << rc1) | (1 << rc2);
    const leftover = A.candMask & ~rcMask;
    if (!leftover) return result;
    const bCells = new Set(B.cells);
    for (let d = 1; d <= 9; d++) {
      if (!(leftover & (1 << d))) continue;
      // buddies of all d-cells in A, outside both A and B
      for (const b of A.buddiesFor[d]) {
        if (A.cells.includes(b) || bCells.has(b)) continue;
        if (this.sudoku.values[b] !== 0 || !this.sudoku.isCandidate(b, d)) continue;
        result.push({ index: b, value: d as Digit });
      }
    }
    return result;
  }
}

function popcount(mask: number): number {
  let n = 0;
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) n++;
  return n;
}

function* kCombinations(arr: number[], k: number, start = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= arr.length - k; i++) {
    for (const rest of kCombinations(arr, k - 1, i + 1)) {
      yield [arr[i], ...rest];
    }
  }
}

function allMutualBuddies(cells: number[], BUDDIES: readonly (readonly number[])[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (!BUDDIES[cells[i]].includes(cells[j])) return false;
    }
  }
  return true;
}

function dedupCands(cands: { index: number; value: number }[]): { index: number; value: Digit }[] {
  const seen = new Set<number>();
  const result: { index: number; value: Digit }[] = [];
  for (const c of cands) {
    const k = c.index * 10 + c.value;
    if (!seen.has(k)) { seen.add(k); result.push({ index: c.index, value: c.value as Digit }); }
  }
  return result;
}
