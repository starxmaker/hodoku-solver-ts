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

import type { SolutionStep } from "../Sudoku2";
import type { SolutionType } from "../SolutionType";
import { Sudoku2 } from "../Sudoku2";

// ---------------------------------------------------------------------------
// AbstractSolver — mirrors solver/AbstractSolver.java
// ---------------------------------------------------------------------------

/**
 * Base class for all technique-specific solvers.
 * Each subclass implements {@link getStep} and {@link doStep}.
 */
export abstract class AbstractSolver {
  protected sudoku!: Sudoku2;

  /** Set the grid this solver operates on. */
  setSudoku(sudoku: Sudoku2): void {
    this.sudoku = sudoku;
  }

  /**
   * Search for one instance of the technique identified by {@link type}.
   * Returns the first step found, or `null` if the technique doesn't apply.
   */
  abstract getStep(type: SolutionType): SolutionStep | null;

  /**
   * Apply a previously found step to the grid.
   * Subclasses should override if they need to do anything beyond candidate
   * removal / value placement.
   */
  doStep(step: SolutionStep): void {
    for (const p of step.placements) {
      this.sudoku.setValue(p.index, p.value);
    }
    for (const c of step.candidatesToDelete) {
      this.sudoku.removeCandidate(c.index, c.value);
    }
  }
}
