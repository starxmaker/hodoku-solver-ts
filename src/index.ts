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

export { Sudoku2 } from "./Sudoku2";
export type { SolutionStep } from "./Sudoku2";
export { SolutionType } from "./SolutionType";
export type { SolutionType as SolutionTypeValue } from "./SolutionType";
export type { Candidate, Placement, Grid, CandidateGrid, SudokuState, DifficultyType, SolveRating } from "./types";
export { SudokuSolver } from "./solver/SudokuSolver";
