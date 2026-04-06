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
// Restricted Common entry: RC digit(s) between two ALS.
// ---------------------------------------------------------------------------
interface RcEntry {
  i:  number;  // index of first ALS
  j:  number;  // index of second ALS
  d1: number;  // first RC digit
  d2: number;  // second RC digit (0 if only one)
}

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
    if (type === SolutionType.ALS_XZ)       return this._findAlsXZ();
    if (type === SolutionType.ALS_XY_WING)  return this._findAlsXYWing();
    if (type === SolutionType.ALS_CHAIN)    return this._findAlsChain();
    if (type === SolutionType.DEATH_BLOSSOM) return this._findDeathBlossom();
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

  // -------------------------------------------------------------------------
  // Precompute all Restricted Commons between ALS pairs.
  // An RC for digit X between A and B: every X-cell in A∪B sees every other.
  // Returns at most 2 RC digits per pair (as per the Java implementation).
  // -------------------------------------------------------------------------
  private _collectRCs(alses: Als[]): RcEntry[] {
    const rcs: RcEntry[] = [];
    const BUDDIES = Sudoku2.BUDDIES;
    for (let i = 0; i < alses.length; i++) {
      for (let j = i + 1; j < alses.length; j++) {
        const A = alses[i];
        const B = alses[j];
        // Require non-overlapping ALS.
        const aSet = new Set(A.cells);
        if (B.cells.some(c => aSet.has(c))) continue;

        const common = A.candMask & B.candMask;
        if (!common) continue;

        const rcDigits: number[] = [];
        for (let x = 1; x <= 9; x++) {
          if (!(common & (1 << x))) continue;
          const allCells = [...A.cellsFor[x], ...B.cellsFor[x]];
          if (allMutualBuddies(allCells, BUDDIES)) {
            rcDigits.push(x);
            if (rcDigits.length === 2) break;
          }
        }
        if (rcDigits.length === 0) continue;
        rcs.push({ i, j, d1: rcDigits[0], d2: rcDigits[1] ?? 0 });
      }
    }
    return rcs;
  }

  // -------------------------------------------------------------------------
  // ALS-XY-Wing: Three ALS A, B, C where A–C share RC digit x1 and B–C share
  // RC digit x2 (x1 ≠ x2).  Common candidates of A and B (minus all RC digits)
  // can be eliminated from cells outside A∪B that see all occurrences.
  // -------------------------------------------------------------------------
  private _findAlsXYWing(): SolutionStep | null {
    const alses = this._collectAlses();
    const rcs   = this._collectRCs(alses);
    const n = rcs.length;

    for (let p = 0; p < n - 1; p++) {
      const rc1 = rcs[p];
      for (let q = p + 1; q < n; q++) {
        const rc2 = rcs[q];

        // Both RCs can't have only the same single digit (would collapse to XZ).
        if (rc1.d2 === 0 && rc2.d2 === 0 && rc1.d1 === rc2.d1) continue;

        // Identify hub C (shared) and endpoints A, B.
        let cIdx = -1, aIdx = -1, bIdx = -1;
        if      (rc1.i === rc2.i && rc1.j !== rc2.j) { cIdx = rc1.i; aIdx = rc1.j; bIdx = rc2.j; }
        else if (rc1.i === rc2.j && rc1.j !== rc2.i) { cIdx = rc1.i; aIdx = rc1.j; bIdx = rc2.i; }
        else if (rc1.j === rc2.i && rc1.i !== rc2.j) { cIdx = rc1.j; aIdx = rc1.i; bIdx = rc2.j; }
        else if (rc1.j === rc2.j && rc1.i !== rc2.i) { cIdx = rc1.j; aIdx = rc1.i; bIdx = rc2.i; }
        else continue;

        const A = alses[aIdx];
        const B = alses[bIdx];

        // A and B must not overlap and neither must be a subset of the other.
        const aSet = new Set(A.cells);
        if (B.cells.some(c => aSet.has(c))) continue;
        const abSize = new Set([...A.cells, ...B.cells]).size;
        if (abSize === A.cells.length || abSize === B.cells.length) continue;

        // Exclude all RC digits from the candidate elimination mask.
        let rcMask = (1 << rc1.d1) | (1 << rc2.d1);
        if (rc1.d2 > 0) rcMask |= (1 << rc1.d2);
        if (rc2.d2 > 0) rcMask |= (1 << rc2.d2);

        const commonZMask = A.candMask & B.candMask & ~rcMask;
        if (!commonZMask) continue;

        const toDelete: { index: number; value: Digit }[] = [];
        const bSet = new Set(B.cells);

        for (let z = 1; z <= 9; z++) {
          if (!(commonZMask & (1 << z))) continue;
          const zCellsA = A.cellsFor[z];
          const zCellsB = B.cellsFor[z];
          if (zCellsA.length === 0 || zCellsB.length === 0) continue;

          const buddiesA = commonBuddies(zCellsA);
          for (const v of buddiesA) {
            if (aSet.has(v) || bSet.has(v)) continue;
            if (!B.buddiesFor[z].has(v)) continue;
            if (this.sudoku.values[v] !== 0 || !this.sudoku.isCandidate(v, z)) continue;
            toDelete.push({ index: v, value: z as Digit });
          }
        }

        const unique = dedupCands(toDelete);
        if (unique.length > 0) {
          return { type: SolutionType.ALS_XY_WING, placements: [], candidatesToDelete: unique };
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // ALS-Chain: A chain of ≥ 4 ALS connected by RCs (like generalized AIC).
  // Eliminations: common candidates of the first and last ALS (excluding ALL
  // RC digits of the chain endpoint links) from cells seeing all instances.
  // Adjacency rule: two consecutive RCs in the chain must use different digits.
  // -------------------------------------------------------------------------
  private _findAlsChain(): SolutionStep | null {
    const alses = this._collectAlses();
    const rcs   = this._collectRCs(alses);

    // Build per-ALS adjacency list.
    // Each entry stores: j (target ALS), d (active RC digit), d2 (partner RC digit, 0 if single).
    const adj = new Map<number, { j: number; d: number; d2: number }[]>();
    for (const rc of rcs) {
      const pairs: [number, number, number, number][] = [
        [rc.i, rc.j, rc.d1, rc.d2],
        [rc.j, rc.i, rc.d1, rc.d2],
      ];
      for (const [ai, aj, d, d2] of pairs) {
        if (!adj.has(ai)) adj.set(ai, []);
        adj.get(ai)!.push({ j: aj, d, d2 });
        // If doubly linked, also add the reverse-active entry.
        if (d2 > 0) adj.get(ai)!.push({ j: aj, d: d2, d2: d });
      }
    }

    // Deduplicate adjacency entries per ALS.
    for (const [, list] of adj) {
      const seen = new Set<string>();
      let wi = 0;
      for (const e of list) {
        const key = `${e.j}:${e.d}`;
        if (!seen.has(key)) { seen.add(key); list[wi++] = e; }
      }
      list.length = wi;
    }

    const chain: number[]               = [];
    const rcInfo: { d: number; d2: number }[] = [];  // RC info for each chain link
    const inChain = new Set<number>();

    for (let start = 0; start < alses.length; start++) {
      chain.length  = 0;
      rcInfo.length = 0;
      inChain.clear();
      chain.push(start);
      inChain.add(start);

      const result = this._alsChainDFS(
        start, 0, chain, rcInfo, inChain, alses, adj,
      );
      if (result) return result;
    }
    return null;
  }

  private _alsChainDFS(
    cur:     number,
    entryD:  number,                          // active RC digit used to reach cur (0 for start)
    chain:   number[],                        // ALS indices in chain
    rcInfo:  { d: number; d2: number }[],     // RC info for each link entering ALS (index 0 = link into chain[1])
    inChain: Set<number>,
    alses:   Als[],
    adj:     Map<number, { j: number; d: number; d2: number }[]>,
  ): SolutionStep | null {
    if (chain.length > 6) return null; // depth limit for performance

    for (const { j, d, d2 } of (adj.get(cur) ?? [])) {
      if (entryD !== 0 && d === entryD) continue; // adjacency rule
      if (inChain.has(j)) continue;

      inChain.add(j);
      chain.push(j);
      rcInfo.push({ d, d2 });

      if (chain.length >= 4) {
        // Exclude ALL digits of first RC link and last RC link.
        const firstRc = rcInfo[0];
        const lastRc  = rcInfo[rcInfo.length - 1];
        const step = this._checkAlsChainElims(
          alses[chain[0]], alses[j],
          firstRc.d, firstRc.d2, lastRc.d, lastRc.d2,
        );
        if (step) {
          inChain.delete(j); chain.pop(); rcInfo.pop();
          return step;
        }
      }

      const result = this._alsChainDFS(j, d, chain, rcInfo, inChain, alses, adj);
      if (result) {
        inChain.delete(j); chain.pop(); rcInfo.pop();
        return result;
      }

      inChain.delete(j); chain.pop(); rcInfo.pop();
    }
    return null;
  }

  private _checkAlsChainElims(
    startAls: Als, endAls: Als,
    firstRcD: number, firstRcD2: number,
    lastRcD:  number, lastRcD2:  number,
  ): SolutionStep | null {
    // Start and end ALS must not share cells.
    const aSet = new Set(startAls.cells);
    if (endAls.cells.some(c => aSet.has(c))) return null;

    // Exclude ALL digits of the first and last RC links.
    let rcMask = (1 << firstRcD) | (1 << lastRcD);
    if (firstRcD2 > 0) rcMask |= (1 << firstRcD2);
    if (lastRcD2  > 0) rcMask |= (1 << lastRcD2);

    const commonZMask = startAls.candMask & endAls.candMask & ~rcMask;
    if (!commonZMask) return null;

    const bSet  = new Set(endAls.cells);
    const toDelete: { index: number; value: Digit }[] = [];

    for (let z = 1; z <= 9; z++) {
      if (!(commonZMask & (1 << z))) continue;
      const zA = startAls.cellsFor[z];
      const zB = endAls.cellsFor[z];
      if (zA.length === 0 || zB.length === 0) continue;

      const cb = commonBuddies(zA);
      for (const v of cb) {
        if (aSet.has(v) || bSet.has(v)) continue;
        if (!endAls.buddiesFor[z].has(v)) continue;
        if (this.sudoku.values[v] !== 0 || !this.sudoku.isCandidate(v, z)) continue;
        toDelete.push({ index: v, value: z as Digit });
      }
    }
    if (toDelete.length === 0) return null;
    return { type: SolutionType.ALS_CHAIN, placements: [], candidatesToDelete: dedupCands(toDelete) };
  }

  // -------------------------------------------------------------------------
  // Death Blossom: a "stem" cell whose every candidate d has an ALS where
  // ALL d-cells in the ALS see the stem.  Common candidates across ALL chosen
  // ALS (minus the petal digits) can be eliminated from cells seeing all
  // occurrences of that candidate in all ALS combined.
  // -------------------------------------------------------------------------
  private _findDeathBlossom(): SolutionStep | null {
    const alses = this._collectAlses();

    for (let stem = 0; stem < 81; stem++) {
      if (this.sudoku.values[stem] !== 0) continue;
      const stemCands: number[] = [];
      for (let d = 1; d <= 9; d++) {
        if (this.sudoku.isCandidate(stem, d)) stemCands.push(d);
      }
      if (stemCands.length < 2) continue;

      // For each stem candidate d, list the ALS indices where all d-cells
      // in the ALS see the stem cell.
      const alsPerCand: number[][] = stemCands.map(() => []);
      for (let ai = 0; ai < alses.length; ai++) {
        const als = alses[ai];
        for (let ci = 0; ci < stemCands.length; ci++) {
          const d = stemCands[ci];
          if (!(als.candMask & (1 << d))) continue;
          if (als.buddiesFor[d].has(stem)) alsPerCand[ci].push(ai);
        }
      }
      if (alsPerCand.some(list => list.length === 0)) continue;

      const chosen   = new Array<number>(stemCands.length).fill(-1);
      const usedCells = new Set<number>();
      const result = this._deathBlossomRec(
        stem, stemCands, alsPerCand, 0, chosen, usedCells, alses,
      );
      if (result) return result;
    }
    return null;
  }

  private _deathBlossomRec(
    stem:      number,
    stemCands: number[],
    alsPerCand: number[][],
    ci:        number,
    chosen:    number[],
    usedCells: Set<number>,
    alses:     Als[],
  ): SolutionStep | null {
    if (ci === stemCands.length) {
      return this._checkDeathBlossomElims(stem, stemCands, chosen, usedCells, alses);
    }
    for (const ai of alsPerCand[ci]) {
      const als = alses[ai];
      if (als.cells.some(c => usedCells.has(c))) continue;

      for (const c of als.cells) usedCells.add(c);
      chosen[ci] = ai;

      const result = this._deathBlossomRec(
        stem, stemCands, alsPerCand, ci + 1, chosen, usedCells, alses,
      );
      if (result) {
        for (const c of als.cells) usedCells.delete(c);
        return result;
      }
      for (const c of als.cells) usedCells.delete(c);
      chosen[ci] = -1;
    }
    return null;
  }

  private _checkDeathBlossomElims(
    stem:      number,
    stemCands: number[],
    chosen:    number[],
    allAlsCells: Set<number>,
    alses:     Als[],
  ): SolutionStep | null {
    // Intersection of candidate masks across all chosen ALS.
    let commonMask = 0x3FE; // bits 1–9
    for (const ai of chosen) commonMask &= alses[ai].candMask;

    // Exclude petal digits (the stem candidates used as RCs).
    for (const d of stemCands) commonMask &= ~(1 << d);
    if (!commonMask) return null;

    const BUDDIES = Sudoku2.BUDDIES;
    const toDelete: { index: number; value: Digit }[] = [];

    for (let z = 1; z <= 9; z++) {
      if (!(commonMask & (1 << z))) continue;

      // Collect all z-cells across every chosen ALS.
      const zCells: number[] = [];
      for (const ai of chosen) zCells.push(...alses[ai].cellsFor[z]);
      if (zCells.length === 0) continue;

      // Common buddies of all z-cells across all ALS.
      let victims = new Set<number>(BUDDIES[zCells[0]]);
      for (let k = 1; k < zCells.length; k++) {
        for (const v of victims) {
          if (!BUDDIES[zCells[k]].includes(v)) victims.delete(v);
        }
      }
      for (const v of victims) {
        if (v === stem || allAlsCells.has(v)) continue;
        if (this.sudoku.values[v] !== 0 || !this.sudoku.isCandidate(v, z)) continue;
        toDelete.push({ index: v, value: z as Digit });
      }
    }
    if (toDelete.length === 0) return null;
    return { type: SolutionType.DEATH_BLOSSOM, placements: [], candidatesToDelete: dedupCands(toDelete) };
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
