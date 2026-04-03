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

import { Sudoku2 } from "../Sudoku2";
import type { SolutionStep } from "../Sudoku2";
import { SolutionType } from "../SolutionType";
import { SimpleSolver } from "./SimpleSolver";
import { FishSolver } from "./FishSolver";
import { SingleDigitPatternSolver } from "./SingleDigitPatternSolver";
import { WingSolver } from "./WingSolver";
import { ColoringSolver } from "./ColoringSolver";
import { ChainSolver } from "./ChainSolver";
import { UniquenessSolver } from "./UniquenessSolver";
import { AlsSolver } from "./AlsSolver";
import { MiscellaneousSolver } from "./MiscellaneousSolver";
import { TablingSolver } from "./TablingSolver";

// ---------------------------------------------------------------------------
// Technique order — mirrors the Java StepConfig ordinal order
// ---------------------------------------------------------------------------
const TECHNIQUE_ORDER: SolutionType[] = [
  SolutionType.FULL_HOUSE,
  SolutionType.HIDDEN_SINGLE,
  SolutionType.NAKED_SINGLE,
  SolutionType.LOCKED_CANDIDATES_1,
  SolutionType.LOCKED_CANDIDATES_2,
  SolutionType.NAKED_PAIR,
  SolutionType.HIDDEN_PAIR,
  SolutionType.NAKED_TRIPLE,
  SolutionType.HIDDEN_TRIPLE,
  SolutionType.NAKED_QUADRUPLE,
  SolutionType.HIDDEN_QUADRUPLE,
  SolutionType.X_WING,
  SolutionType.SWORDFISH,
  SolutionType.JELLYFISH,
  SolutionType.SQUIRMBAG,
  SolutionType.FINNED_X_WING,
  SolutionType.FINNED_SWORDFISH,
  SolutionType.FINNED_JELLYFISH,
  SolutionType.FINNED_SQUIRMBAG,
  SolutionType.SKYSCRAPER,
  SolutionType.TWO_STRING_KITE,
  SolutionType.EMPTY_RECTANGLE,
  SolutionType.TURBOT_FISH,
  SolutionType.XY_WING,
  SolutionType.XYZ_WING,
  SolutionType.W_WING,
  SolutionType.SIMPLE_COLORS,
  SolutionType.MULTI_COLORS,
  SolutionType.REMOTE_PAIR,
  SolutionType.X_CHAIN,
  SolutionType.XY_CHAIN,
  SolutionType.UNIQUENESS_1,
  SolutionType.UNIQUENESS_2,
  SolutionType.UNIQUENESS_3,
  SolutionType.UNIQUENESS_4,
  SolutionType.UNIQUENESS_5,
  SolutionType.UNIQUENESS_6,
  SolutionType.HIDDEN_RECTANGLE,
  SolutionType.AVOIDABLE_RECTANGLE_1,
  SolutionType.AVOIDABLE_RECTANGLE_2,
  SolutionType.BUG_PLUS_1,
  SolutionType.ALS_XZ,
  SolutionType.ALS_XY_WING,
  SolutionType.ALS_CHAIN,
  SolutionType.DEATH_BLOSSOM,
  SolutionType.SUE_DE_COQ,
  SolutionType.NICE_LOOP,
  SolutionType.FORCING_CHAIN,
  SolutionType.FORCING_NET,
  SolutionType.GIVE_UP,
];

// ---------------------------------------------------------------------------
// SudokuSolver — mirrors solver/SudokuSolver.java
// ---------------------------------------------------------------------------

/**
 * Orchestrates all technique-specific solvers, trying them in difficulty order
 * until the puzzle is solved or no more progress can be made.
 */
export class SudokuSolver {
  private sudoku!: Sudoku2;

  private readonly simple = new SimpleSolver();
  private readonly fish = new FishSolver();
  private readonly singleDigit = new SingleDigitPatternSolver();
  private readonly wing = new WingSolver();
  private readonly coloring = new ColoringSolver();
  private readonly chain = new ChainSolver();
  private readonly uniqueness = new UniquenessSolver();
  private readonly als = new AlsSolver();
  private readonly misc = new MiscellaneousSolver();
  private readonly tabling = new TablingSolver();

  /** Steps applied during the last {@link solve} call. */
  steps: SolutionStep[] = [];

  setSudoku(sudoku: Sudoku2): void {
    this.sudoku = sudoku;
    this.steps = [];
    this._propagateSudoku();
  }

  getSudoku(): Sudoku2 {
    return this.sudoku;
  }

  /**
   * Try to find the next logical step.
   * Returns the step, or `null` if no technique applies.
   */
  getStep(type: SolutionType): SolutionStep | null {
    return this._solverFor(type)?.getStep(type) ?? null;
  }

  /**
   * Apply a step to the current grid.
   */
  doStep(step: SolutionStep): void {
    this._solverFor(step.type)?.doStep(step);
    this.steps.push(step);
  }

  /**
   * Solve the puzzle to completion (or until no further progress is possible).
   * Mirrors the Java {@code SudokuSolver.solve()} method.
   */
  solve(): void {
    while (!this.sudoku.isSolved) {
      const step = this._findNextStep();
      if (step === null) break;
      this.doStep(step);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _findNextStep(): SolutionStep | null {
    for (const type of TECHNIQUE_ORDER) {
      const step = this.getStep(type);
      if (step !== null) return step;
    }
    return null;
  }

  private _propagateSudoku(): void {
    const solvers = [
      this.simple, this.fish, this.singleDigit, this.wing,
      this.coloring, this.chain, this.uniqueness,
      this.als, this.misc, this.tabling,
    ];
    for (const s of solvers) s.setSudoku(this.sudoku);
  }

  /** Map a SolutionType to the solver responsible for it. */
  private _solverFor(type: SolutionType) {
    switch (type) {
      case SolutionType.FULL_HOUSE:
      case SolutionType.HIDDEN_SINGLE:
      case SolutionType.NAKED_SINGLE:
      case SolutionType.LOCKED_CANDIDATES_1:
      case SolutionType.LOCKED_CANDIDATES_2:
      case SolutionType.NAKED_PAIR:
      case SolutionType.HIDDEN_PAIR:
      case SolutionType.NAKED_TRIPLE:
      case SolutionType.HIDDEN_TRIPLE:
      case SolutionType.NAKED_QUADRUPLE:
      case SolutionType.HIDDEN_QUADRUPLE:
        return this.simple;

      case SolutionType.X_WING:
      case SolutionType.SWORDFISH:
      case SolutionType.JELLYFISH:
      case SolutionType.SQUIRMBAG:
      case SolutionType.FINNED_X_WING:
      case SolutionType.FINNED_SWORDFISH:
      case SolutionType.FINNED_JELLYFISH:
      case SolutionType.FINNED_SQUIRMBAG:
        return this.fish;

      case SolutionType.SKYSCRAPER:
      case SolutionType.TWO_STRING_KITE:
      case SolutionType.EMPTY_RECTANGLE:
      case SolutionType.TURBOT_FISH:
        return this.singleDigit;

      case SolutionType.XY_WING:
      case SolutionType.XYZ_WING:
      case SolutionType.W_WING:
        return this.wing;

      case SolutionType.SIMPLE_COLORS:
      case SolutionType.MULTI_COLORS:
        return this.coloring;

      case SolutionType.REMOTE_PAIR:
      case SolutionType.X_CHAIN:
      case SolutionType.XY_CHAIN:
        return this.chain;

      case SolutionType.UNIQUENESS_1:
      case SolutionType.UNIQUENESS_2:
      case SolutionType.UNIQUENESS_3:
      case SolutionType.UNIQUENESS_4:
      case SolutionType.UNIQUENESS_5:
      case SolutionType.UNIQUENESS_6:
      case SolutionType.HIDDEN_RECTANGLE:
      case SolutionType.AVOIDABLE_RECTANGLE_1:
      case SolutionType.AVOIDABLE_RECTANGLE_2:
      case SolutionType.BUG_PLUS_1:
        return this.uniqueness;

      case SolutionType.ALS_XZ:
      case SolutionType.ALS_XY_WING:
      case SolutionType.ALS_CHAIN:
      case SolutionType.DEATH_BLOSSOM:
        return this.als;

      case SolutionType.SUE_DE_COQ:
        return this.misc;

      case SolutionType.NICE_LOOP:
      case SolutionType.FORCING_CHAIN:
      case SolutionType.FORCING_NET:
        return this.tabling;

      default:
        return null;
    }
  }
}
