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
// FishSolver — basic fish (X-Wing, Swordfish, Jellyfish) and their finned
// variants.  Mirrors solver/FishSolver.java for the basic + finned cases.
//
// Algorithm (basic fish, rows as base):
//   For digit d, pick k rows ("base lines") such that d appears in at most k
//   columns total.  If it appears in exactly k columns ("cover lines"), every
//   other occurrence of d in those k columns can be eliminated.
//
// Finned fish adds "fins": extra d-cells in the base rows that are NOT
// covered by the cover columns.  A finned fish can only eliminate d from
// cells that (a) would be eliminated by the unfinned fish AND (b) see all
// fins.  The fin cells must all be in one box.
// ---------------------------------------------------------------------------

type LineSet = Set<number>; // column indices covered by a base set

interface FishCandidate {
  baseRows: number[];       // row indices used as base
  coverCols: number[];      // column indices that cover all base cells
  finCells: number[];       // fin cells (extra cells not in cover cols)
}

export class FishSolver extends AbstractSolver {
  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    const size = fishSize(type);
    if (size === 0) return null;
    const finned = isFinnedType(type);
    return this._findFish(size, finned, type);
  }

  // ------------------------------------------------------------------ //
  // Core fish search                                                     //
  // ------------------------------------------------------------------ //
  private _findFish(
    size: number,
    finned: boolean,
    type: typeof SolutionType[keyof typeof SolutionType]
  ): SolutionStep | null {
    for (let d = 1; d <= 9; d++) {
      // Try rows as base, cols as cover; then cols as base, rows as cover
      const step =
        this._searchFish(d, size, finned, type, true) ||
        this._searchFish(d, size, finned, type, false);
      if (step) return step;
    }
    return null;
  }

  private _searchFish(
    d: number,
    size: number,
    finned: boolean,
    type: typeof SolutionType[keyof typeof SolutionType],
    rowBase: boolean
  ): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;

    // Build the list of "lines" (rows 0..8 or cols 0..8) together with the
    // set of crossing-line indices where d still appears.
    // lineOccurrences[i] = sorted array of crossing-line indices
    const lineOccurrences: number[][] = [];
    for (let ln = 0; ln < 9; ln++) {
      const hIdx = rowBase ? ln : 9 + ln;
      const occ: number[] = [];
      for (const cell of HOUSES[hIdx]) {
        if (this.sudoku.values[cell] === 0 && this.sudoku.isCandidate(cell, d)) {
          occ.push(rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell));
        }
      }
      if (occ.length >= 2 && (finned ? occ.length <= size + 4 : occ.length <= size)) {
        // For finned fish the base can have more cells than cover columns
        lineOccurrences.push(occ);
      } else if (finned && occ.length >= 2) {
        lineOccurrences.push(occ);
      } else if (!finned && occ.length >= 2 && occ.length <= size) {
        lineOccurrences.push(occ);
      }
      // overwritten above, simplify:
    }
    // Rebuild cleanly
    const eligibleLines: { ln: number; occ: number[] }[] = [];
    for (let ln = 0; ln < 9; ln++) {
      const hIdx = rowBase ? ln : 9 + ln;
      const occ: number[] = [];
      for (const cell of HOUSES[hIdx]) {
        if (this.sudoku.values[cell] === 0 && this.sudoku.isCandidate(cell, d)) {
          occ.push(rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell));
        }
      }
      if (occ.length >= 2) eligibleLines.push({ ln, occ });
    }

    // Try all combinations of size lines
    for (const baseCombo of kCombos(eligibleLines, size)) {
      const baseLines = baseCombo.map(e => e.ln);

      // Union of crossing positions across all base lines
      const allCrossing = new Set<number>();
      for (const e of baseCombo) { for (const c of e.occ) allCrossing.add(c); }

      if (!finned) {
        // Basic fish: union must equal exactly size
        if (allCrossing.size !== size) continue;

        const coverCols = [...allCrossing];
        const toDelete = this._basicFishElims(d, baseLines, coverCols, rowBase);
        if (toDelete.length > 0) {
          return { type, placements: [], candidatesToDelete: toDelete };
        }
      } else {
        // Finned fish: look for size-subset of the crossing positions that
        // cover all base line cells; remaining are fins.
        if (allCrossing.size < size || allCrossing.size > size + 4) continue;

        // Try all size-subsets of allCrossing as cover cols
        const crossArr = [...allCrossing];
        for (const coverCombo of kCombos(crossArr, size)) {
          const coverSet = new Set(coverCombo);

          // Find fin cells: cells in base lines NOT in a cover column
          const finCells: number[] = [];
          let valid = true;
          for (const e of baseCombo) {
            const notCovered = e.occ.filter(c => !coverSet.has(c));
            if (notCovered.length === 0) continue;
            // All fin cells must be in the same box
            for (const c of notCovered) {
              const hIdx2 = rowBase ? e.ln : 9 + e.ln;
              for (const cell of HOUSES[hIdx2]) {
                if (this.sudoku.values[cell] !== 0 || !this.sudoku.isCandidate(cell, d)) continue;
                const crossIdx = rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell);
                if (crossIdx === c) finCells.push(cell);
              }
            }
          }
          if (finCells.length === 0) continue;

          // All fins must be in the same box
          const finBox = Sudoku2.box(finCells[0]);
          if (!finCells.every(f => Sudoku2.box(f) === finBox)) continue;

          // Get eliminations: cells that (a) the unfinned fish would delete
          //                               (b) see all fins
          const basicElims = this._basicFishElims(d, baseLines, coverCombo, rowBase);
          if (basicElims.length === 0) continue;

          const toDelete = basicElims.filter(c => {
            return finCells.every(f => Sudoku2.BUDDIES[c.index].includes(f));
          });
          if (toDelete.length > 0) {
            return { type, placements: [], candidatesToDelete: toDelete };
          }
        }
      }
    }
    return null;
  }

  private _basicFishElims(
    d: number,
    baseLines: number[],
    coverLines: number[],
    rowBase: boolean
  ): { index: number; value: Digit }[] {
    const HOUSES = Sudoku2.HOUSES;
    const baseSet = new Set(baseLines);
    const toDelete: { index: number; value: Digit }[] = [];

    for (const cl of coverLines) {
      const hIdx = rowBase ? 9 + cl : cl;  // cover is cols when rowBase, rows when !rowBase
      for (const cell of HOUSES[hIdx]) {
        if (this.sudoku.values[cell] !== 0 || !this.sudoku.isCandidate(cell, d)) continue;
        const baseLine = rowBase ? Sudoku2.row(cell) : Sudoku2.col(cell);
        if (baseSet.has(baseLine)) continue; // part of base
        toDelete.push({ index: cell, value: d as Digit });
      }
    }
    return toDelete;
  }
}

function fishSize(type: typeof SolutionType[keyof typeof SolutionType]): number {
  switch (type) {
    case SolutionType.X_WING:
    case SolutionType.FINNED_X_WING: return 2;
    case SolutionType.SWORDFISH:
    case SolutionType.FINNED_SWORDFISH: return 3;
    case SolutionType.JELLYFISH:
    case SolutionType.FINNED_JELLYFISH: return 4;
    default: return 0;
  }
}

function isFinnedType(type: typeof SolutionType[keyof typeof SolutionType]): boolean {
  return type === SolutionType.FINNED_X_WING ||
    type === SolutionType.FINNED_SWORDFISH ||
    type === SolutionType.FINNED_JELLYFISH ||
    type === SolutionType.FINNED_SQUIRMBAG;
}

function* kCombos<T>(arr: T[], k: number, start = 0): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= arr.length - k; i++) {
    for (const rest of kCombos(arr, k - 1, i + 1)) {
      yield [arr[i], ...rest];
    }
  }
}
