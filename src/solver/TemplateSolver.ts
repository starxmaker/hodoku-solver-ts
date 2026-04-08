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
import { SolutionType } from "../SolutionType";
import type { Digit } from "../types";
import { AbstractSolver } from "./AbstractSolver";

// ---------------------------------------------------------------------------
// Template storage — generated once at module load.
//
// Each "template" is a bitmask representing one valid way to place a single
// digit once in every row of a 9×9 sudoku (satisfying row, column, and box
// uniqueness constraints).  HoDoKu calls these arrays of 46,656 entries.
//
// 81 cells can't fit in one 32-bit integer, so we split across three 27-bit
// chunks stored as plain JS numbers (all safe-integer, all bitwise-op safe):
//   chunk A → cells  0–26  (bit i   = cell i)
//   chunk B → cells 27–53  (bit i   = cell i+27)
//   chunk C → cells 54–80  (bit i   = cell i+54)
// ---------------------------------------------------------------------------

const MASK27 = (1 << 27) - 1; // 0x7FFFFFF — 27 ones

let _TA: Int32Array | null = null; // chunk A for each template
let _TB: Int32Array | null = null; // chunk B
let _TC: Int32Array | null = null; // chunk C
let _TC_LEN = 0;                   // total number of valid templates

/** Lazily generate all 46,656 templates and cache them. */
function ensureTemplates(): void {
  if (_TA !== null) return;
  const ba: number[] = [], bb: number[] = [], bc: number[] = [];
  _genRow(ba, bb, bc, 0, 0, 0, 0, 0, 0);
  _TC_LEN = ba.length;
  _TA = new Int32Array(ba);
  _TB = new Int32Array(bb);
  _TC = new Int32Array(bc);
}

/**
 * Recursive generator: for each row pick a column that hasn't been used and
 * whose box hasn't been used, then set the corresponding bit in the template.
 */
function _genRow(
  ba: number[], bb: number[], bc: number[],
  row: number, colMask: number, boxMask: number,
  a: number, b: number, c: number,
): void {
  if (row === 9) {
    ba.push(a); bb.push(b); bc.push(c);
    return;
  }
  for (let col = 0; col < 9; col++) {
    if (colMask & (1 << col)) continue;
    const box = ((row / 3) | 0) * 3 + ((col / 3) | 0);
    if (boxMask & (1 << box)) continue;
    const idx = row * 9 + col;
    _genRow(
      ba, bb, bc,
      row + 1,
      colMask | (1 << col),
      boxMask  | (1 << box),
      idx < 27 ? a | (1 << idx)        : a,
      idx < 54 ? b | (1 << (idx - 27)) : b,
                 c | (idx >= 54 ? (1 << (idx - 54)) : 0),
    );
  }
}

/**
 * Expand a three-chunk bitmask back to the cell indices that are set.
 * (Used to build placements / candidatesToDelete lists.)
 */
function _bitsToIndices(a: number, b: number, c: number, offset: number[]): number[] {
  const result: number[] = [];
  for (let m of [a, b, c]) {
    const base = offset.shift()!;
    while (m) {
      const lsb = m & -m;          // isolate lowest set bit
      result.push(base + (31 - Math.clz32(lsb)));
      m &= m - 1;                  // clear it
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// TemplateSolver — mirrors solver/TemplateSolver.java
//
// TEMPLATE_SET: cells that appear in the AND of all valid templates for a
//               digit must contain that digit.
// TEMPLATE_DEL: cells that appear in the OR of NO valid template for a digit
//               can have that candidate eliminated.
// ---------------------------------------------------------------------------

export class TemplateSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    if (
      type !== SolutionType.TEMPLATE_SET &&
      type !== SolutionType.TEMPLATE_DEL
    ) {
      return null;
    }

    ensureTemplates();

    const values    = this.sudoku.values;
    const cands     = this.sudoku.candidates;

    // ── Build per-digit masks ─────────────────────────────────────────────

    // setP[d]: cells where digit d is already placed
    // cand[d]: cells where digit d is still a candidate
    const setP_a = new Int32Array(10);
    const setP_b = new Int32Array(10);
    const setP_c = new Int32Array(10);
    const cand_a = new Int32Array(10);
    const cand_b = new Int32Array(10);
    const cand_c = new Int32Array(10);

    for (let i = 0; i < 81; i++) {
      const v = values[i];
      if (v !== 0) {
        if      (i < 27) setP_a[v] |= 1 << i;
        else if (i < 54) setP_b[v] |= 1 << (i - 27);
        else             setP_c[v] |= 1 << (i - 54);
      } else {
        const mask = cands[i];
        for (let d = 1; d <= 9; d++) {
          if (!(mask & (1 << d))) continue;
          if      (i < 27) cand_a[d] |= 1 << i;
          else if (i < 54) cand_b[d] |= 1 << (i - 27);
          else             cand_c[d] |= 1 << (i - 54);
        }
      }
    }

    // forb[d]: cells where d is neither placed nor a candidate — templates
    // that touch these cells are invalid for digit d.
    const forb_a = new Int32Array(10);
    const forb_b = new Int32Array(10);
    const forb_c = new Int32Array(10);
    for (let d = 1; d <= 9; d++) {
      forb_a[d] = ~(setP_a[d] | cand_a[d]) & MASK27;
      forb_b[d] = ~(setP_b[d] | cand_b[d]) & MASK27;
      forb_c[d] = ~(setP_c[d] | cand_c[d]) & MASK27;
    }

    // ── Filter all 46,656 templates for each digit ────────────────────────

    // svt[d] = AND of all valid templates → cells in EVERY valid template
    // dct[d] = OR  of all valid templates → cells in AT LEAST ONE valid template
    // svtInit[d]: whether we've AND-ed at least one template (avoids false
    //             all-ones result when no templates are valid for d).
    const svt_a = new Int32Array(10);
    const svt_b = new Int32Array(10);
    const svt_c = new Int32Array(10);
    const dct_a = new Int32Array(10);
    const dct_b = new Int32Array(10);
    const dct_c = new Int32Array(10);
    const svtInit = new Uint8Array(10);

    const ta = _TA!, tb = _TB!, tc = _TC!;
    const n = _TC_LEN;

    // Collect valid template indices per digit (initial per-digit filter).
    const validIdx: number[][] = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < n; i++) {
      const ia = ta[i], ib = tb[i], ic = tc[i];
      for (let d = 1; d <= 9; d++) {
        // Reject if template misses any already-placed cell of d
        if ((setP_a[d] & ia) !== setP_a[d]) continue;
        if ((setP_b[d] & ib) !== setP_b[d]) continue;
        if ((setP_c[d] & ic) !== setP_c[d]) continue;
        // Reject if template touches a forbidden cell
        if ((forb_a[d] & ia) !== 0) continue;
        if ((forb_b[d] & ib) !== 0) continue;
        if ((forb_c[d] & ic) !== 0) continue;
        validIdx[d].push(i);
      }
    }

    // Recompute svt (AND) and dct (OR) for digit d from its validIdx list.
    const recomputeSvt = (d: number): void => {
      svtInit[d] = 0;
      svt_a[d] = 0; svt_b[d] = 0; svt_c[d] = 0;
      dct_a[d] = 0; dct_b[d] = 0; dct_c[d] = 0;
      for (const i of validIdx[d]) {
        const ia = ta[i], ib = tb[i], ic = tc[i];
        dct_a[d] |= ia; dct_b[d] |= ib; dct_c[d] |= ic;
        if (!svtInit[d]) {
          svt_a[d] = ia; svt_b[d] = ib; svt_c[d] = ic; svtInit[d] = 1;
        } else {
          svt_a[d] &= ia; svt_b[d] &= ib; svt_c[d] &= ic;
        }
      }
    };

    // Initial svt/dct from collected indices.
    for (let d = 1; d <= 9; d++) recomputeSvt(d);

    // ── Cross-digit iterative refinement (H6) ─────────────────────────────
    // A template for digit j that places j in a cell forced to contain
    // another digit k (i.e., the cell is in svt[k]) is contradictory.
    // Remove such templates and repeat until stable.
    // Mirrors Java's SudokuStepFinder.initTemplates() refinement loop.
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 1; j <= 9; j++) {
        const list = validIdx[j];
        let wi = 0;
        for (const i of list) {
          const ia = ta[i], ib = tb[i], ic = tc[i];
          let ok = true;
          for (let k = 1; k <= 9; k++) {
            if (k === j || !svtInit[k]) continue;
            // Template overlaps with cells forced to contain k → contradiction
            if ((svt_a[k] & ia) !== 0 || (svt_b[k] & ib) !== 0 || (svt_c[k] & ic) !== 0) {
              ok = false; break;
            }
          }
          if (ok) list[wi++] = i;
        }
        if (wi < list.length) {
          list.length = wi;
          recomputeSvt(j);
          changed = true;
        }
      }
    }

    // ── Build and return the first step found ─────────────────────────────

    if (type === SolutionType.TEMPLATE_SET) {
      for (let d = 1; d <= 9; d++) {
        if (!svtInit[d]) continue;
        // Cells in every valid template that aren't already placed
        const sa = svt_a[d] & ~setP_a[d] & MASK27;
        const sb = svt_b[d] & ~setP_b[d] & MASK27;
        const sc = svt_c[d] & ~setP_c[d] & MASK27;
        if (!sa && !sb && !sc) continue;
        const placements = _bitsToIndices(sa, sb, sc, [0, 27, 54])
          .map(idx => ({ index: idx, value: d as Digit }));
        return { type: SolutionType.TEMPLATE_SET, placements, candidatesToDelete: [] };
      }
    } else {
      for (let d = 1; d <= 9; d++) {
        if (!svtInit[d]) continue;
        // Candidates not covered by any valid template → eliminate
        const sa = ~dct_a[d] & cand_a[d] & MASK27;
        const sb = ~dct_b[d] & cand_b[d] & MASK27;
        const sc = ~dct_c[d] & cand_c[d] & MASK27;
        if (!sa && !sb && !sc) continue;
        const candidatesToDelete = _bitsToIndices(sa, sb, sc, [0, 27, 54])
          .map(idx => ({ index: idx, value: d as Digit }));
        return { type: SolutionType.TEMPLATE_DEL, placements: [], candidatesToDelete };
      }
    }

    return null;
  }
}
