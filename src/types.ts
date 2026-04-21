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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A cell index in row-major order: 0 (row 0, col 0) … 80 (row 8, col 8).
 * Use {@link cellIndex}, {@link cellRow}, {@link cellCol} to convert.
 */
export type CellIndex = number;

/**
 * A candidate digit in the range 1–9.
 */
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * An 81-element array of cell values.
 * `0` means the cell is unsolved; `1`–`9` is the placed digit.
 */
export type Grid = number[]; // length 81

/**
 * The set of candidates still possible in a single cell (bitmask 1<<digit).
 * Represented as a plain number for performance; helpers in Sudoku2 wrap it.
 */
export type CandidateMask = number;

/**
 * An 81-element array of candidate masks, one per cell.
 */
export type CandidateGrid = CandidateMask[]; // length 81

// ---------------------------------------------------------------------------
// Solution step types
// ---------------------------------------------------------------------------

/**
 * A single candidate to be eliminated from a cell.
 */
export interface Candidate {
  /** Cell index (0–80). */
  index: CellIndex;
  /** Digit to remove (1–9). */
  value: Digit;
}

/**
 * A cell+value pair indicating that a digit has been placed.
 */
export interface Placement {
  /** Cell index (0–80). */
  index: CellIndex;
  /** Digit placed (1–9). */
  value: Digit;
}

/**
 * A solved or partially-solved Sudoku board with both placed values and
 * all current candidate sets.
 */
export interface SudokuState {
  /** Placed cell values; 0 = unsolved. */
  values: Grid;
  /** Candidate masks per cell. */
  candidates: CandidateGrid;
  /** True when all 81 cells have a value. */
  isSolved: boolean;
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/**
 * HoDoKu difficulty rating corresponding to the Java {@code DifficultyType}.
 */
export type DifficultyType =
  | "EASY"
  | "MEDIUM"
  | "HARD"
  | "UNFAIR"
  | "EXTREME";

/**
 * Result returned by {@link SudokuSolver.solveWithRating}.
 * Mirrors the information Java's {@code SudokuSolver.solve(DifficultyLevel, ...)} writes
 * onto the sudoku after a successful solve.
 */
export interface SolveRating {
  /** Whether the puzzle was fully solved. */
  solved: boolean;
  /**
   * Cumulative HoDoKu score (sum of base scores for every applied step).
   * Difficulty ceilings: EASY max 800, MEDIUM max 1000, HARD max 1600,
   * UNFAIR max 1800, EXTREME has no score ceiling. Difficulty is also
   * constrained by the minimum band of any technique used.
   */
  score: number;
  /** Difficulty band determined from score and technique minimums. */
  difficulty: DifficultyType;
}
