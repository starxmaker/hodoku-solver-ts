/*
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

import type { SolutionStep } from "../Sudoku2";
import { SolutionType } from "../SolutionType";
import type { Digit } from "../types";
import { AbstractSolver } from "./AbstractSolver";

// ---------------------------------------------------------------------------
// BruteForceSolver — mirrors solver/BruteForceSolver.java
//
// Picks the middle unsolved cell and reads its value from the pre-computed
// solution stored on the Sudoku2 instance.  The solution is computed lazily
// via backtracking on first access (see Sudoku2.getSolution).
// ---------------------------------------------------------------------------

export class BruteForceSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    if (type !== SolutionType.BRUTE_FORCE) return null;

    // Collect unsolved cells
    const unsolved: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (this.sudoku.values[i] === 0) unsolved.push(i);
    }
    if (unsolved.length === 0) return null;

    // Pick the middle cell — mirrors Java logic
    const index = unsolved[Math.floor(unsolved.length / 2)];
    const value = this.sudoku.getSolution(index);
    if (value === 0) return null; // no unique solution

    return {
      type: SolutionType.BRUTE_FORCE,
      placements: [{ index, value: value as Digit }],
      candidatesToDelete: [],
    };
  }
}
