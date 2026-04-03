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

import type { Candidate, CandidateGrid, Grid, Placement } from "./types";
import type { SolutionType } from "./SolutionType";

// ---------------------------------------------------------------------------
// SolutionStep — mirrors sudoku/SolutionStep.java
// ---------------------------------------------------------------------------

/**
 * Describes one logical deduction found by the solver: either a set of
 * candidates to eliminate or a digit to place (or both).
 */
export interface SolutionStep {
  /** Which technique produced this step. */
  type: SolutionType;

  /**
   * Cells where a digit is placed as a direct result of this step.
   * Empty for elimination-only techniques.
   */
  placements: Placement[];

  /**
   * Candidates to remove from cells as a result of this step.
   * Empty for naked-single / full-house (those use {@link placements}).
   */
  candidatesToDelete: Candidate[];
}

// ---------------------------------------------------------------------------
// Sudoku2 — mirrors sudoku/Sudoku2.java
// ---------------------------------------------------------------------------

/** Number of cells in a sudoku grid. */
const LENGTH = 81;

/** All 27 houses: 9 rows + 9 columns + 9 boxes. */
const HOUSES: readonly (readonly number[])[] = (() => {
  const houses: number[][] = [];
  // rows
  for (let r = 0; r < 9; r++) {
    houses.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  }
  // columns
  for (let c = 0; c < 9; c++) {
    houses.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  }
  // boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box: number[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          box.push((br * 3 + r) * 9 + bc * 3 + c);
        }
      }
      houses.push(box);
    }
  }
  return houses;
})();

/** Pre-computed set of buddy indices for every cell (peers that share a house). */
const BUDDIES: readonly (readonly number[])[] = (() => {
  const buddies: Set<number>[] = Array.from({ length: LENGTH }, () => new Set());
  for (const house of HOUSES) {
    for (const a of house) {
      for (const b of house) {
        if (a !== b) buddies[a].add(b);
      }
    }
  }
  return buddies.map((s) => Object.freeze([...s].sort((a, b) => a - b)));
})();

/**
 * Core grid state container — equivalent to the Java {@code Sudoku2} class.
 *
 * Cells are indexed in row-major order 0–80.
 * Candidates are stored as bitmasks: bit {@code (1 << digit)} is set when
 * {@code digit} (1–9) is still possible in that cell.
 */
export class Sudoku2 {
  /** Placed values, 0 = unsolved. */
  readonly values: Grid = new Array(LENGTH).fill(0);

  /** Candidate bitmasks per cell. Bit (1 << d) set ↔ digit d is possible. */
  readonly candidates: CandidateGrid = new Array(LENGTH).fill(0b1111111110); // bits 1-9

  /** How many cells are still unsolved. */
  private _unsolvedCount = LENGTH;

  // ── Static helpers ────────────────────────────────────────────────────────

  static readonly HOUSES = HOUSES;
  static readonly BUDDIES = BUDDIES;

  /** Row of cell index i (0-based). */
  static row(i: number): number { return (i / 9) | 0; }
  /** Column of cell index i (0-based). */
  static col(i: number): number { return i % 9; }
  /** Box index (0-based, row-major box order) of cell index i. */
  static box(i: number): number {
    return (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);
  }
  /** Cell index from row and column (0-based). */
  static index(row: number, col: number): number { return row * 9 + col; }

  // ── Parsing ───────────────────────────────────────────────────────────────

  /**
   * Load a puzzle from an 81-character string.
   * `0` or `.` = unsolved; `1`–`9` = given.
   */
  setSudoku(puzzle: string): void {
    if (puzzle.length !== LENGTH) {
      throw new Error(`Puzzle string must be exactly 81 characters, got ${puzzle.length}`);
    }
    this.values.fill(0);
    this.candidates.fill(0b1111111110);
    this._unsolvedCount = LENGTH;

    for (let i = 0; i < LENGTH; i++) {
      const ch = puzzle[i];
      if (ch !== "0" && ch !== ".") {
        const digit = parseInt(ch, 10);
        if (digit >= 1 && digit <= 9) {
          this._placeDigit(i, digit);
        }
      }
    }
  }

  // ── Candidate helpers ─────────────────────────────────────────────────────

  /** Returns true if digit d (1–9) is still a candidate in cell i. */
  isCandidate(i: number, d: number): boolean {
    return (this.candidates[i] & (1 << d)) !== 0;
  }

  /** Remove digit d from the candidate mask of cell i. */
  removeCandidate(i: number, d: number): void {
    this.candidates[i] &= ~(1 << d);
  }

  /** Returns the list of candidate digits (1–9) for cell i. */
  getCandidates(i: number): number[] {
    const result: number[] = [];
    let mask = this.candidates[i];
    for (let d = 1; d <= 9; d++) {
      if ((mask & (1 << d)) !== 0) result.push(d);
    }
    return result;
  }

  /** Number of remaining candidates in cell i. */
  candidateCount(i: number): number {
    let n = 0;
    let mask = this.candidates[i] >> 1;
    while (mask) { n += mask & 1; mask >>= 1; }
    return n;
  }

  // ── Value helpers ─────────────────────────────────────────────────────────

  /** Place digit d in cell i and propagate removals to all buddies. */
  setValue(i: number, d: number): void {
    this._placeDigit(i, d);
  }

  get isSolved(): boolean { return this._unsolvedCount === 0; }
  get unsolvedCount(): number { return this._unsolvedCount; }

  // ── Serialisation ─────────────────────────────────────────────────────────

  /**
   * Serialize the board as an 81-character string.
   * Unsolved cells are represented as `.`.
   */
  toValueString(): string {
    return this.values.map((v) => (v === 0 ? "." : String(v))).join("");
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _placeDigit(i: number, d: number): void {
    if (this.values[i] !== 0) return; // already set
    this.values[i] = d;
    this.candidates[i] = 0; // no longer has candidates
    this._unsolvedCount--;
    // Remove d from all buddies
    for (const b of BUDDIES[i]) {
      this.candidates[b] &= ~(1 << d);
    }
  }
}
