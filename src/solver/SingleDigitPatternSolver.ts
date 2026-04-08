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
import { Sudoku2 } from "../Sudoku2";
import { SolutionType } from "../SolutionType";
import type { Candidate, Digit } from "../types";
import { AbstractSolver } from "./AbstractSolver";

// ---------------------------------------------------------------------------
// SingleDigitPatternSolver — mirrors solver/SingleDigitPatternSolver.java
// Handles: Skyscraper, Two-String Kite, Turbot Fish, Empty Rectangle.
//
// All four techniques work on a single candidate digit at a time and exploit
// houses with exactly two occurrences of that digit ("strong links").
// ---------------------------------------------------------------------------

export class SingleDigitPatternSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    switch (type) {
      case SolutionType.SKYSCRAPER:             return this._findSkyscraper();
      case SolutionType.TWO_STRING_KITE:        return this._findTwoStringKite();
      case SolutionType.DUAL_TWO_STRING_KITE:   return this._findDualTwoStringKite();
      case SolutionType.TURBOT_FISH:            return this._findTurbotFish();
      case SolutionType.EMPTY_RECTANGLE:        return this._findEmptyRectangle();
      case SolutionType.DUAL_EMPTY_RECTANGLE:   return this._findDualEmptyRectangle();
      default: return null;
    }
  }

  // ── Shared helper: houses with exactly 2 cells for digit d ────────────────
  // Returns array indexed by house (0-26); each entry is the two cell indices
  // or null if there are != 2 occurrences.
  private _only2(d: number): (readonly [number, number] | null)[] {
    const { values, candidates } = this.sudoku;
    return Sudoku2.HOUSES.map(house => {
      const cells = house.filter(c => values[c] === 0 && (candidates[c] & (1 << d)));
      return cells.length === 2 ? [cells[0], cells[1]] as const : null;
    });
  }

  // ── Skyscraper ──────────────────────────────────────────────────────────────
  // Two strong links in the same orientation (both in rows or both in cols)
  // that share one column (or row). The unshared ends form the elimination.

  private _findSkyscraper(): SolutionStep | null {
    for (let d = 1; d <= 9; d++) {
      const only2 = this._only2(d);
      // Try row-base (houses 0-8) paired by shared column, and col-base (9-17) by shared row
      for (const [base1Start, base1End, crossOff] of [[0, 9, 9], [9, 18, 0]] as [number, number, number][]) {
        // col-offset: for row-base rows are 0-8 and crossing lines are cols 9-17
        //             for col-base cols are 9-17 and crossing lines are rows 0-8
        for (let h1 = base1Start; h1 < base1End; h1++) {
          const pair1 = only2[h1]; if (!pair1) continue;
          for (let h2 = h1 + 1; h2 < base1End; h2++) {
            const pair2 = only2[h2]; if (!pair2) continue;

            // The two pairs must share exactly one crossing line
            // For row-base: same column for one cell in each pair
            const cross = (c: number) => base1Start === 0 ? Sudoku2.col(c) : Sudoku2.row(c);

            const c1a = cross(pair1[0]), c1b = cross(pair1[1]);
            const c2a = cross(pair2[0]), c2b = cross(pair2[1]);

            let shared: number, free1: number, free2: number;
            if (c1a === c2a) { shared = c1a; free1 = pair1[1]; free2 = pair2[1]; }
            else if (c1a === c2b) { shared = c1a; free1 = pair1[1]; free2 = pair2[0]; }
            else if (c1b === c2a) { shared = c1b; free1 = pair1[0]; free2 = pair2[1]; }
            else if (c1b === c2b) { shared = c1b; free1 = pair1[0]; free2 = pair2[0]; }
            else continue;

            void shared; // shared crossing line not needed beyond this point
            const del = _commonBuddyElims(free1, free2, d, this.sudoku);
            if (del.length) {
              return { type: SolutionType.SKYSCRAPER, placements: [], candidatesToDelete: del };
            }
          }
        }
      }
    }
    return null;
  }

  // ── Two-String Kite ─────────────────────────────────────────────────────────
  // One strong link in a row, one in a column; they share a cell in the same box.
  // The free end of the row link and the free end of the column link see a common
  // victim cell.

  private _collectTwoStringKites(): { rowConn: number; colConn: number; victim: number; d: number }[] {
    const results: { rowConn: number; colConn: number; victim: number; d: number }[] = [];
    for (let d = 1; d <= 9; d++) {
      const only2 = this._only2(d);
      for (let rh = 0; rh < 9; rh++) {
        const rp = only2[rh]; if (!rp) continue;
        for (let ch = 9; ch < 18; ch++) {
          const cp = only2[ch]; if (!cp) continue;
          let rowFree: number, colFree: number, rowConn: number, colConn: number;
          if (Sudoku2.box(rp[0]) === Sudoku2.box(cp[0]) ||
              Sudoku2.box(rp[0]) === Sudoku2.box(cp[1])) {
            rowConn = rp[0]; rowFree = rp[1];
            const cpConnIsFirst = Sudoku2.box(rp[0]) === Sudoku2.box(cp[0]);
            colConn = cpConnIsFirst ? cp[0] : cp[1];
            colFree = cpConnIsFirst ? cp[1] : cp[0];
          } else if (Sudoku2.box(rp[1]) === Sudoku2.box(cp[0]) ||
                     Sudoku2.box(rp[1]) === Sudoku2.box(cp[1])) {
            rowConn = rp[1]; rowFree = rp[0];
            const cpConnIsFirst = Sudoku2.box(rp[1]) === Sudoku2.box(cp[0]);
            colConn = cpConnIsFirst ? cp[0] : cp[1];
            colFree = cpConnIsFirst ? cp[1] : cp[0];
          } else continue;
          if (rowConn === colConn || rowConn === colFree ||
              rowFree === colConn || rowFree === colFree) continue;
          const victimRow = Sudoku2.row(colFree);
          const victimCol = Sudoku2.col(rowFree);
          const victim = Sudoku2.index(victimRow, victimCol);
          if (victim === rowFree || victim === colFree) continue;
          if (this.sudoku.values[victim] !== 0) continue;
          if (!(this.sudoku.candidates[victim] & (1 << d))) continue;
          results.push({ rowConn, colConn, victim, d });
        }
      }
    }
    return results;
  }

  private _findTwoStringKite(): SolutionStep | null {
    const kites = this._collectTwoStringKites();
    if (kites.length === 0) return null;
    const k = kites[0];
    return {
      type: SolutionType.TWO_STRING_KITE,
      placements: [],
      candidatesToDelete: [{ index: k.victim, value: k.d as Digit }],
    };
  }

  private _findDualTwoStringKite(): SolutionStep | null {
    const kites = this._collectTwoStringKites();
    for (let i = 0; i < kites.length - 1; i++) {
      for (let j = i + 1; j < kites.length; j++) {
        const k1 = kites[i], k2 = kites[j];
        const connMatch =
          (k1.rowConn === k2.rowConn && k1.colConn === k2.colConn) ||
          (k1.rowConn === k2.colConn && k1.colConn === k2.rowConn);
        if (!connMatch) continue;
        if (k1.victim === k2.victim && k1.d === k2.d) continue;
        return {
          type: SolutionType.DUAL_TWO_STRING_KITE,
          placements: [],
          candidatesToDelete: [
            { index: k1.victim, value: k1.d as Digit },
            { index: k2.victim, value: k2.d as Digit },
          ],
        };
      }
    }
    return null;
  }

  // ── Turbot Fish ──────────────────────────────────────────────────────────────
  // An X-Chain of exactly 3 links (strong-weak-strong) for a single digit.
  // Pattern: A =(strong)= B -(weak)- C =(strong)= D
  // A and D are ends; eliminate d from cells seeing both.

  private _findTurbotFish(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    for (let d = 1; d <= 9; d++) {
      const only2 = this._only2(d);

      // Build list of strong links (pairs)
      const strongLinks: [number, number][] = [];
      for (let h = 0; h < 27; h++) {
        const p = only2[h]; if (!p) continue;
        strongLinks.push([p[0], p[1]]);
      }

      // A-B strong link, B-C weak link (share house but not a strong link pair),
      // C-D strong link
      for (const [A, B] of strongLinks) {
        for (const [C, D] of strongLinks) {
          if (C === A || C === B || D === A || D === B) continue;

          // B and C must share a house (be buddies) with d as candidate
          if (values[B] !== 0 || values[C] !== 0) continue;
          if (!(candidates[B] & (1 << d)) || !(candidates[C] & (1 << d))) continue;
          if (!BUDDIES[B].includes(C)) continue;

          // A and D are the free ends
          const del = _commonBuddyElims(A, D, d, this.sudoku);
          if (del.length) {
            return { type: SolutionType.TURBOT_FISH, placements: [], candidatesToDelete: del };
          }
        }
      }
    }
    return null;
  }

  // ── Empty Rectangle ───────────────────────────────────────────────────────────
  // All d-cells in a box lie on a single row OR a single column (the "hinge").
  // Combined with an external conjugate pair, forms a chain leading to an
  // elimination at the conjugate-pair column's intersection with the hinge row.

  private _collectEmptyRectangles(): { box: number; boxCells: number[]; victim: number; d: number }[] {
    const { values, candidates } = this.sudoku;
    const results: { box: number; boxCells: number[]; victim: number; d: number }[] = [];

    for (let d = 1; d <= 9; d++) {
      const only2 = this._only2(d);

      for (let box = 0; box < 9; box++) {
        const boxHouseIdx = 18 + box;
        const boxCells = Sudoku2.HOUSES[boxHouseIdx].filter(
          c => values[c] === 0 && (candidates[c] & (1 << d))
        );
        if (boxCells.length < 2) continue;

        const boxRowSet = new Set(boxCells.map(Sudoku2.row));
        const boxColSet = new Set(boxCells.map(Sudoku2.col));
        const sortedBoxCells = [...boxCells].sort((a, b) => a - b);

        for (const erRow of boxRowSet) {
          for (const erCol of boxColSet) {
            if (!boxCells.every(c => Sudoku2.row(c) === erRow || Sudoku2.col(c) === erCol)) continue;
            if (!boxCells.some(c => Sudoku2.row(c) !== erRow)) continue;
            if (!boxCells.some(c => Sudoku2.col(c) !== erCol)) continue;
            // H19: Java requires ≥2 in AT LEAST ONE arm (not both).
            const rowArmCount = boxCells.filter(c => Sudoku2.row(c) === erRow).length;
            const colArmCount = boxCells.filter(c => Sudoku2.col(c) === erCol).length;
            if (rowArmCount < 2 && colArmCount < 2) continue;

            // Case A: conjugate pair in a column outside the box column band
            for (let colH = 9; colH < 18; colH++) {
              const cp = only2[colH]; if (!cp) continue;
              const col = colH - 9;
              if (Math.floor(col / 3) === Math.floor(erCol / 3)) continue;
              const [cA, cB] = cp;
              let inRow: number, outRow: number;
              if (Sudoku2.row(cA) === erRow)      { inRow = cA; outRow = cB; }
              else if (Sudoku2.row(cB) === erRow) { inRow = cB; outRow = cA; }
              else continue;
              const victim = Sudoku2.index(Sudoku2.row(outRow), erCol);
              if (victim === outRow || victim === inRow) continue;
              if (Sudoku2.box(victim) === box) continue;
              if (values[victim] !== 0) continue;
              if (!(candidates[victim] & (1 << d))) continue;
              results.push({ box, boxCells: sortedBoxCells, victim, d });
            }

            // Case B: conjugate pair in a row outside the box row band
            for (let rowH = 0; rowH < 9; rowH++) {
              const cp = only2[rowH]; if (!cp) continue;
              const row = rowH;
              if (Math.floor(row / 3) === Math.floor(erRow / 3)) continue;
              const [cA, cB] = cp;
              let inCol: number, outCol: number;
              if (Sudoku2.col(cA) === erCol)      { inCol = cA; outCol = cB; }
              else if (Sudoku2.col(cB) === erCol) { inCol = cB; outCol = cA; }
              else continue;
              const victim = Sudoku2.index(erRow, Sudoku2.col(outCol));
              if (victim === outCol || victim === inCol) continue;
              if (Sudoku2.box(victim) === box) continue;
              if (values[victim] !== 0) continue;
              if (!(candidates[victim] & (1 << d))) continue;
              results.push({ box, boxCells: sortedBoxCells, victim, d });
            }
          }
        }
      }
    }
    return results;
  }

  private _findEmptyRectangle(): SolutionStep | null {
    const ers = this._collectEmptyRectangles();
    if (ers.length === 0) return null;
    const er = ers[0];
    return {
      type: SolutionType.EMPTY_RECTANGLE,
      placements: [],
      candidatesToDelete: [{ index: er.victim, value: er.d as Digit }],
    };
  }

  private _findDualEmptyRectangle(): SolutionStep | null {
    const ers = this._collectEmptyRectangles();
    for (let i = 0; i < ers.length - 1; i++) {
      for (let j = i + 1; j < ers.length; j++) {
        const er1 = ers[i], er2 = ers[j];
        if (er1.box !== er2.box) continue;
        if (er1.boxCells.length !== er2.boxCells.length) continue;
        if (!er1.boxCells.every((c, k) => c === er2.boxCells[k])) continue;
        if (er1.victim === er2.victim && er1.d === er2.d) continue;
        return {
          type: SolutionType.DUAL_EMPTY_RECTANGLE,
          placements: [],
          candidatesToDelete: [
            { index: er1.victim, value: er1.d as Digit },
            { index: er2.victim, value: er2.d as Digit },
          ],
        };
      }
    }
    return null;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

/** Cells that are buddies of BOTH a and b and still have digit d as candidate. */
function _commonBuddyElims(a: number, b: number, d: number, sudoku: { values: number[]; candidates: number[] }): Candidate[] {
  const del: Candidate[] = [];
  for (const cell of Sudoku2.BUDDIES[a]) {
    if (cell === b) continue;
    if (sudoku.values[cell] !== 0) continue;
    if (!(sudoku.candidates[cell] & (1 << d))) continue;
    if (!Sudoku2.BUDDIES[b].includes(cell)) continue;
    del.push({ index: cell, value: d as Digit });
  }
  return del;
}
