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
// UniquenessSolver — Unique Rectangle Type 1 (and stubs for 2–6).
// Mirrors solver/UniquenessSolver.java.
//
// UR Type 1: A rectangle of 4 cells in two rows, two columns, one box each
// (two distinct boxes).  If three of the four cells contain exactly the two
// UR candidates {a,b} (and nothing else), the fourth "extra" cell must NOT
// be solved with both a and b, so those candidates can be removed from it.
// ---------------------------------------------------------------------------

export class UniquenessSolver extends AbstractSolver {
  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    switch (type) {
      case SolutionType.UNIQUENESS_1:
        return this._findUR1();
      default:
        return null;
    }
  }

  private _findUR1(): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;

    // Iterate over every pair of rows
    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        // Iterate over every pair of columns
        for (let c1 = 0; c1 < 8; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const i11 = r1 * 9 + c1;
            const i12 = r1 * 9 + c2;
            const i21 = r2 * 9 + c1;
            const i22 = r2 * 9 + c2;

            // Corners must touch exactly 2 distinct boxes
            const boxes = new Set([
              Sudoku2.box(i11), Sudoku2.box(i12),
              Sudoku2.box(i21), Sudoku2.box(i22),
            ]);
            if (boxes.size !== 2) continue;

            // Collect candidate masks for all four corners
            const corners = [i11, i12, i21, i22];

            // Find the bivalue starting cells: those that have EXACTLY 2 candidates
            // The two UR digits must appear in *all* four corners
            // Strategy: for every pair of digits (a, b), check if:
            //   (a) all four corners contain both a and b as candidates
            //   (b) exactly 3 corners have *only* a and b; the 4th has more
            // That 4th corner can have a and b removed.

            // Collect union of candidates across bivalued corners only (for efficiency)
            // Simpler: iterate over all pairs of digits
            for (let a = 1; a <= 8; a++) {
              for (let b = a + 1; b <= 9; b++) {
                const mask = (1 << a) | (1 << b);

                // All four cells must have both candidates present
                if (!corners.every(i =>
                  this.sudoku.values[i] === 0 &&
                  this.sudoku.isCandidate(i, a) &&
                  this.sudoku.isCandidate(i, b)
                )) continue;

                // Count which cells have ONLY {a,b} vs have extras
                let twoOnly = 0;
                let extraIndex = -1;
                for (const i of corners) {
                  const cands = this.sudoku.candidates[i] >> 1; // shift so bit d = bit d-1
                  const hasMask = (this.sudoku.candidates[i] & mask) === mask;
                  const hasExtra = (this.sudoku.candidates[i] & ~mask) !== 0;
                  if (hasMask && !hasExtra) {
                    twoOnly++;
                  } else if (hasMask && hasExtra) {
                    extraIndex = i;
                  }
                }

                if (twoOnly === 3 && extraIndex !== -1) {
                  // UR Type 1: remove a and b from extraIndex
                  const toDelete = [];
                  if (this.sudoku.isCandidate(extraIndex, a))
                    toDelete.push({ index: extraIndex, value: a as Digit });
                  if (this.sudoku.isCandidate(extraIndex, b))
                    toDelete.push({ index: extraIndex, value: b as Digit });
                  if (toDelete.length > 0) {
                    return {
                      type: SolutionType.UNIQUENESS_1,
                      placements: [],
                      candidatesToDelete: toDelete,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
    return null;
  }
}
