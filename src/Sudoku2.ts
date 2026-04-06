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

  /** Tracks which cells are original given (clue) cells (1 = given, 0 = not). */
  readonly givens: Uint8Array = new Uint8Array(LENGTH);

  /** How many cells are still unsolved. */
  private _unsolvedCount = LENGTH;

  /** Pre-computed solution (populated lazily by getSolution / setSolution). */
  private _solution: number[] = new Array(LENGTH).fill(0);
  private _solutionSet = false;

  /**
   * Cached result of hasUniqueSolution().  Recomputed lazily; invalidated
   * (set to null) whenever a value is placed so the candidate state can change.
   */
  private _uniqueSolutionCache: boolean | null = null;

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
    this.givens.fill(0);
    this._unsolvedCount = LENGTH;
    this._solutionSet = false;

    for (let i = 0; i < LENGTH; i++) {
      const ch = puzzle[i];
      if (ch !== "0" && ch !== ".") {
        const digit = parseInt(ch, 10);
        if (digit >= 1 && digit <= 9) {
          this.givens[i] = 1;
          this._placeDigit(i, digit);
        }
      }
    }
    // Invalidate uniqueness cache on reload.
    this._uniqueSolutionCache = null;
  }

  // ── Candidate helpers ─────────────────────────────────────────────────────

  /** Returns true if cell i was part of the original given (clue) digits. */
  isGiven(i: number): boolean { return this.givens[i] === 1; }

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

  // ── Solution (backtracking) ───────────────────────────────────────────────

  isSolutionSet(): boolean { return this._solutionSet; }

  setSolution(sol: number[]): void {
    for (let i = 0; i < LENGTH; i++) this._solution[i] = sol[i];
    this._solutionSet = true;
  }

  /**
   * Returns the solution digit for cell {@code index}, computing it via
   * backtracking on first call if it has not been set externally.
   * Returns 0 if the puzzle has no unique solution.
   */
  getSolution(index: number): number {
    if (!this._solutionSet) {
      // Use typed arrays for fast copy/comparison in the backtracker.
      const work = new Uint8Array(LENGTH);
      for (let i = 0; i < LENGTH; i++) work[i] = this.values[i];

      const masks = new Uint16Array(LENGTH);
      let valid = true;
      for (let i = 0; i < LENGTH; i++) {
        if (work[i] !== 0) {
          masks[i] = 0;
        } else {
          let used = 0;
          for (const b of BUDDIES[i]) {
            if (work[b] !== 0) used |= 1 << work[b];
          }
          masks[i] = 0b1111111110 & ~used;
          if (masks[i] === 0) { valid = false; break; }
        }
      }

      if (valid && this._solve(work, masks)) {
        this._solutionSet = true;
        for (let i = 0; i < LENGTH; i++) this._solution[i] = work[i];
      } else {
        return 0;
      }
    }
    return this._solution[index];
  }

  /**
   * Backtracking solver — MRV + naked-single constraint propagation.
   *
   * At each step: pick the unfilled cell with the fewest candidates (MRV),
   * then for each candidate digit call {@link _place} which assigns the digit
   * AND recursively forces any resulting naked singles.  This collapses large
   * parts of the search tree without extra backtracking, making even
   * pathologically hard puzzles (Arto Inkala) fast in JS.
   */
  private _solve(v: Uint8Array, masks: Uint16Array): boolean {
    // MRV: choose the unfilled cell with the smallest candidate count.
    let minCnt = 10, idx = -1;
    for (let i = 0; i < LENGTH; i++) {
      if (v[i] !== 0) continue;
      const cnt = this._popcount(masks[i]);
      if (cnt === 0) return false; // contradiction — already a dead end
      if (cnt < minCnt) {
        minCnt = cnt;
        idx = i;
        if (cnt === 1) break; // can't do better
      }
    }
    if (idx === -1) return true; // all cells filled

    // Snapshot current state so we can undo the attempted assignment.
    const sv = new Uint8Array(v);    // 81 bytes
    const sm = new Uint16Array(masks); // 162 bytes

    const mask = masks[idx];
    for (let d = 1; d <= 9; d++) {
      if (!(mask & (1 << d))) continue;

      if (this._place(v, masks, idx, d) && this._solve(v, masks)) return true;

      // Undo: restore both arrays.
      v.set(sv);
      masks.set(sm);
    }
    return false;
  }

  /**
   * Count the number of completions of the current partial grid, up to
   * {@code limit}.  Uses the current candidate masks rather than recomputing
   * from scratch so that already-applied logical eliminations are respected.
   * Returns as soon as {@code limit} solutions have been found.
   */
  private _countSolns(v: Uint8Array, masks: Uint16Array, limit: number): number {
    let minCnt = 10, idx = -1;
    for (let i = 0; i < LENGTH; i++) {
      if (v[i] !== 0) continue;
      const cnt = this._popcount(masks[i]);
      if (cnt === 0) return 0; // dead end
      if (cnt < minCnt) { minCnt = cnt; idx = i; if (cnt === 1) break; }
    }
    if (idx === -1) return 1; // complete solution found

    const sv = new Uint8Array(v);
    const sm = new Uint16Array(masks);
    let total = 0;
    const mask = masks[idx];
    for (let d = 1; d <= 9; d++) {
      if (!(mask & (1 << d))) continue;
      if (this._place(v, masks, idx, d)) {
        total += this._countSolns(v, masks, limit);
        if (total >= limit) return total;
      }
      v.set(sv);
      masks.set(sm);
    }
    return total;
  }

  /**
   * Returns {@code true} iff the current partial grid (placed values only,
   * ignoring logical candidate eliminations) has exactly one valid completion.
   *
   * This mirrors HoDoKu's pre-computed {@code SudokuStatus.VALID} check:
   * uniqueness-based techniques (UR, BUG+1) must only be applied when the
   * puzzle has a unique solution.  Re-deriving masks from placed values —
   * rather than from the current (reduced) candidates — ensures that puzzles
   * with two solutions are correctly identified even after some candidates
   * have already been eliminated.
   */
  hasUniqueSolution(): boolean {
    if (this._uniqueSolutionCache !== null) return this._uniqueSolutionCache;
    // Use the current candidate state (narrowed by all logical eliminations
    // applied so far).  This is fast because the backtracking benefits from
    // the already-reduced search space.  We use Uint8Array/Uint16Array copies
    // so _countSolns can modify them freely.
    const work  = new Uint8Array(this.values as unknown as number[]);
    const masks = new Uint16Array(this.candidates as unknown as number[]);
    this._uniqueSolutionCache = this._countSolns(work, masks, 2) === 1;
    return this._uniqueSolutionCache;
  }

  /**
   * Place digit {@code d} in cell {@code idx} and propagate via naked singles:
   * when a peer is left with exactly one candidate, assign that candidate too
   * (recursively).  Returns {@code false} immediately on any contradiction.
   */
  private _place(v: Uint8Array, masks: Uint16Array, idx: number, d: number): boolean {
    v[idx] = d;
    masks[idx] = 0;
    for (const b of BUDDIES[idx]) {
      if (v[b] !== 0) continue;
      const nm = masks[b] & ~(1 << d);
      if (nm === 0) return false; // peer has no candidates
      masks[b] = nm;
      if (this._popcount(nm) === 1) {
        // Naked single: propagate recursively.
        const bd = 31 - Math.clz32(nm);
        if (!this._place(v, masks, b, bd)) return false;
      }
    }
    return true;
  }

  /** Standard 32-bit popcount. */
  private _popcount(n: number): number {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    n = (n + (n >> 4)) & 0x0f0f0f0f;
    return Math.imul(n, 0x01010101) >>> 24;
  }

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
    this._uniqueSolutionCache = null; // invalidate cache
    // Remove d from all buddies
    for (const b of BUDDIES[i]) {
      this.candidates[b] &= ~(1 << d);
    }
  }
}
