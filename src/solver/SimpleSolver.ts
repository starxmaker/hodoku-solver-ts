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
import type { Candidate, Digit } from '../types';
import { AbstractSolver } from './AbstractSolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count bits 1–9 set in a candidate mask. */
function popcount9(mask: number): number {
  let n = 0;
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) n++;
  return n;
}

/**
 * Yield all size-k combinations from arr[start..].
 * Same iteration order as the nested loops in Java SimpleSolver.
 */
function* combos(arr: number[], k: number, start = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= arr.length - k; i++) {
    for (const rest of combos(arr, k - 1, i + 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// Search order for naked and hidden subsets: blocks (18–26), rows (0–8), cols (9–17).
// Mirrors Java: findNakedXleInEntity(BLOCKS, ...) then ROWS then COLS.
const SUBSET_HOUSE_ORDER = [
  18, 19, 20, 21, 22, 23, 24, 25, 26,  // blocks
   0,  1,  2,  3,  4,  5,  6,  7,  8,  // rows
   9, 10, 11, 12, 13, 14, 15, 16, 17,  // cols
];

// ---------------------------------------------------------------------------
// SimpleSolver — Full House, Naked/Hidden Single, Locked Candidates, Subsets.
// Mirrors solver/SimpleSolver.java.
// ---------------------------------------------------------------------------

export class SimpleSolver extends AbstractSolver {

  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    switch (type) {
      case SolutionType.FULL_HOUSE:          return this._findFullHouse();
      case SolutionType.NAKED_SINGLE:        return this._findNakedSingle();
      case SolutionType.HIDDEN_SINGLE:       return this._findHiddenSingle();
      case SolutionType.LOCKED_PAIR:         return this._findNakedSubset(2, true);
      case SolutionType.LOCKED_TRIPLE:        return this._findNakedSubset(3, true);
      case SolutionType.LOCKED_CANDIDATES_1: return this._findLC1();
      case SolutionType.LOCKED_CANDIDATES_2: return this._findLC2();
      case SolutionType.NAKED_PAIR:          return this._findNakedSubset(2);
      case SolutionType.NAKED_TRIPLE:        return this._findNakedSubset(3);
      case SolutionType.NAKED_QUADRUPLE:     return this._findNakedSubset(4);
      case SolutionType.HIDDEN_PAIR:         return this._findHiddenSubset(2);
      case SolutionType.HIDDEN_TRIPLE:       return this._findHiddenSubset(3);
      case SolutionType.HIDDEN_QUADRUPLE:    return this._findHiddenSubset(4);
      default:                               return null;
    }
  }

  // ------------------------------------------------------------------ //
  // Full House                                                           //
  // ------------------------------------------------------------------ //

  private _findFullHouse(): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;
    for (let h = 0; h < 27; h++) {
      let count = 0;
      let cell  = -1;
      for (const idx of HOUSES[h]) {
        if (this.sudoku.values[idx] === 0) {
          count++;
          cell = idx;
          if (count > 1) break;
        }
      }
      if (count === 1) {
        const cands = this.sudoku.getCandidates(cell);
        if (cands.length === 1) {
          return {
            type: SolutionType.FULL_HOUSE,
            placements: [{ index: cell, value: cands[0] as Digit }],
            candidatesToDelete: [],
          };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  // Naked Single                                                         //
  // ------------------------------------------------------------------ //

  private _findNakedSingle(): SolutionStep | null {
    for (let i = 0; i < 81; i++) {
      if (this.sudoku.values[i] === 0 && this.sudoku.candidateCount(i) === 1) {
        const d = this.sudoku.getCandidates(i)[0] as Digit;
        return {
          type: SolutionType.NAKED_SINGLE,
          placements: [{ index: i, value: d }],
          candidatesToDelete: [],
        };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  // Hidden Single                                                        //
  // ------------------------------------------------------------------ //

  private _findHiddenSingle(): SolutionStep | null {
    const free  = this._computeFree();
    const HOUSES = Sudoku2.HOUSES;
    for (let h = 0; h < 27; h++) {
      for (let d = 1; d <= 9; d++) {
        if (free[h][d] === 1) {
          for (const idx of HOUSES[h]) {
            if (this.sudoku.values[idx] === 0 && this.sudoku.isCandidate(idx, d)) {
              return {
                type: SolutionType.HIDDEN_SINGLE,
                placements: [{ index: idx, value: d as Digit }],
                candidatesToDelete: [],
              };
            }
          }
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  // Locked Candidates 1 — Box → Line (pointing)                         //
  // ------------------------------------------------------------------ //

  private _findLC1(): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;
    for (let b = 0; b < 9; b++) {
      const box = HOUSES[18 + b];
      for (let d = 1; d <= 9; d++) {
        const cells: number[] = [];
        for (const idx of box) {
          if (this.sudoku.values[idx] === 0 && this.sudoku.isCandidate(idx, d))
            cells.push(idx);
        }
        if (cells.length < 2 || cells.length > 3) continue;

        // All in same row?
        const r = Sudoku2.row(cells[0]);
        if (cells.every(i => Sudoku2.row(i) === r)) {
          const del = this._rowColElims(HOUSES[r], cells, d);
          if (del.length > 0) return { type: SolutionType.LOCKED_CANDIDATES_1, placements: [], candidatesToDelete: del };
        }

        // All in same col?
        const c = Sudoku2.col(cells[0]);
        if (cells.every(i => Sudoku2.col(i) === c)) {
          const del = this._rowColElims(HOUSES[9 + c], cells, d);
          if (del.length > 0) return { type: SolutionType.LOCKED_CANDIDATES_1, placements: [], candidatesToDelete: del };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  // Locked Candidates 2 — Line → Box (claiming)                         //
  // ------------------------------------------------------------------ //

  private _findLC2(): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;
    for (let h = 0; h < 18; h++) {   // rows 0–8, then cols 9–17
      const house = HOUSES[h];
      for (let d = 1; d <= 9; d++) {
        const cells: number[] = [];
        for (const idx of house) {
          if (this.sudoku.values[idx] === 0 && this.sudoku.isCandidate(idx, d))
            cells.push(idx);
        }
        if (cells.length < 2 || cells.length > 3) continue;

        const bx = Sudoku2.box(cells[0]);
        if (cells.every(i => Sudoku2.box(i) === bx)) {
          const del = this._rowColElims(HOUSES[18 + bx], cells, d);
          if (del.length > 0) return { type: SolutionType.LOCKED_CANDIDATES_2, placements: [], candidatesToDelete: del };
        }
      }
    }
    return null;
  }

  /** Collect {index, value:d} for all cells in house NOT in skip with candidate d. */
  private _rowColElims(house: readonly number[], skip: number[], d: number): Candidate[] {
    const result: Candidate[] = [];
    for (const idx of house) {
      if (skip.includes(idx)) continue;
      if (this.sudoku.values[idx] === 0 && this.sudoku.isCandidate(idx, d))
        result.push({ index: idx, value: d as Digit });
    }
    return result;
  }

  // ------------------------------------------------------------------ //
  // Naked Subset (Pair / Triple / Quad)                                 //
  // ------------------------------------------------------------------ //

  private _findNakedSubset(n: number, locked = false): SolutionStep | null {
    const typeMap: Record<number, typeof SolutionType[keyof typeof SolutionType]> = {
      2: SolutionType.NAKED_PAIR,
      3: SolutionType.NAKED_TRIPLE,
      4: SolutionType.NAKED_QUADRUPLE,
    };
    const lockedTypeMap: Record<number, typeof SolutionType[keyof typeof SolutionType]> = {
      2: SolutionType.LOCKED_PAIR,
      3: SolutionType.LOCKED_TRIPLE,
    };
    const HOUSES = Sudoku2.HOUSES;

    for (const hIdx of SUBSET_HOUSE_ORDER) {
      const house   = HOUSES[hIdx];
      const isBlock = hIdx >= 18;

      // Cells with 1..n candidates (unsolved)
      const eligible: number[] = [];
      for (const idx of house) {
        if (this.sudoku.values[idx] === 0) {
          const cnt = this.sudoku.candidateCount(idx);
          if (cnt > 0 && cnt <= n) eligible.push(idx);
        }
      }
      if (eligible.length < n) continue;

      for (const combo of combos(eligible, n)) {
        // Union of candidate masks
        const combined = combo.reduce((acc, i) => acc | this.sudoku.candidates[i], 0);
        if (popcount9(combined) !== n) continue;

        const comboSet = new Set(combo);

        // Determine secondary house
        const r0      = Sudoku2.row(combo[0]);
        const c0      = Sudoku2.col(combo[0]);
        const b0      = Sudoku2.box(combo[0]);
        const sameRow = combo.every(i => Sudoku2.row(i) === r0);
        const sameCol = combo.every(i => Sudoku2.col(i) === c0);
        const sameBox = combo.every(i => Sudoku2.box(i) === b0);

        let secondaryIdx = -1;
        if (isBlock) {
          if (sameRow) secondaryIdx = r0;
          else if (sameCol) secondaryIdx = 9 + c0;
        } else {
          if (sameBox) secondaryIdx = 18 + b0;
        }

        // Collect deletions from primary house
        const toDelete: Candidate[] = [];
        let primaryDels   = false;
        let secondaryDels = false;

        for (const idx of house) {
          if (comboSet.has(idx) || this.sudoku.values[idx] !== 0) continue;
          for (let d = 1; d <= 9; d++) {
            if ((combined & (1 << d)) && this.sudoku.isCandidate(idx, d)) {
              toDelete.push({ index: idx, value: d as Digit });
              primaryDels = true;
            }
          }
        }

        // Collect deletions from secondary house (not already in primary)
        if (secondaryIdx >= 0) {
          for (const idx of HOUSES[secondaryIdx]) {
            if (comboSet.has(idx) || this.sudoku.values[idx] !== 0) continue;
            // Avoid double-counting cells already in primary house
            if (!isBlock && house.includes(idx)) continue; // can't happen (row/box disjoint except for combo cells)
            if (isBlock && house.includes(idx)) continue;  // same block cell already done
            for (let d = 1; d <= 9; d++) {
              if ((combined & (1 << d)) && this.sudoku.isCandidate(idx, d)) {
                toDelete.push({ index: idx, value: d as Digit });
                secondaryDels = true;
              }
            }
          }
        }

        if (toDelete.length === 0) continue;

        // LOCKED subset: deletions in BOTH primary and secondary constraint, size < 4.
        // Mirrors Java createSubsetStep isLocked logic.
        const isLocked = n < 4 && secondaryIdx >= 0 && primaryDels && secondaryDels;
        if (isLocked !== locked) continue;

        const stepType = locked ? lockedTypeMap[n] : typeMap[n];
        return { type: stepType, placements: [], candidatesToDelete: toDelete };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  // Hidden Subset (Pair / Triple / Quad)                                //
  // ------------------------------------------------------------------ //

  private _findHiddenSubset(n: number): SolutionStep | null {
    const typeMap: Record<number, typeof SolutionType[keyof typeof SolutionType]> = {
      2: SolutionType.HIDDEN_PAIR,
      3: SolutionType.HIDDEN_TRIPLE,
      4: SolutionType.HIDDEN_QUADRUPLE,
    };
    const HOUSES = Sudoku2.HOUSES;
    const free   = this._computeFree();

    for (const hIdx of SUBSET_HOUSE_ORDER) {
      const house = HOUSES[hIdx];

      // Need more than n unsolved cells for a hidden subset
      let unsolvedCount = 0;
      for (const idx of house) if (this.sudoku.values[idx] === 0) unsolvedCount++;
      if (unsolvedCount <= n) continue;

      // Digits that appear in 1..n unsolved cells in this house
      const eligible: number[] = [];
      for (let d = 1; d <= 9; d++) {
        const f = free[hIdx][d];
        if (f > 0 && f <= n) eligible.push(d);
      }
      if (eligible.length < n) continue;

      for (const candCombo of combos(eligible, n)) {
        // Union of cells containing any of these candidates
        const cellSet = new Set<number>();
        for (const d of candCombo) {
          for (const idx of house) {
            if (this.sudoku.values[idx] === 0 && this.sudoku.isCandidate(idx, d))
              cellSet.add(idx);
          }
        }
        if (cellSet.size !== n) continue;

        // Build elimination list: remove candidates NOT in candCombo from those cells
        const candMask = candCombo.reduce((acc, d) => acc | (1 << d), 0);
        const toDelete: Candidate[] = [];
        for (const idx of cellSet) {
          for (let d = 1; d <= 9; d++) {
            if (!(candMask & (1 << d)) && this.sudoku.isCandidate(idx, d))
              toDelete.push({ index: idx, value: d as Digit });
          }
        }
        if (toDelete.length === 0) continue;

        return { type: typeMap[n], placements: [], candidatesToDelete: toDelete };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  // free[houseIdx][digit] = count of unsolved cells with candidate       //
  // ------------------------------------------------------------------ //

  private _computeFree(): number[][] {
    const free = Array.from({ length: 27 }, () => new Array(10).fill(0));
    for (let i = 0; i < 81; i++) {
      if (this.sudoku.values[i] === 0) {
        const r = Sudoku2.row(i);
        const c = Sudoku2.col(i);
        const b = Sudoku2.box(i);
        for (let d = 1; d <= 9; d++) {
          if (this.sudoku.isCandidate(i, d)) {
            free[r][d]++;
            free[9 + c][d]++;
            free[18 + b][d]++;
          }
        }
      }
    }
    return free;
  }
}
