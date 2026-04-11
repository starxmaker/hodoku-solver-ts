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
// WingSolver — mirrors solver/WingSolver.java
// Handles: XY-Wing, XYZ-Wing, W-Wing.
// ---------------------------------------------------------------------------

export class WingSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    switch (type) {
      case SolutionType.XY_WING:  return this._findXYWing();
      case SolutionType.XYZ_WING: return this._findXYZWing();
      case SolutionType.W_WING:   return this._findWWing();
      default: return null;
    }
  }

  // ── XY-Wing ───────────────────────────────────────────────────────────────
  // Pivot = bivalue cell {a,b}. Two pincers: bivalue {a,z} and {b,z}.
  // Pivot must see both pincers. Eliminate z from all cells seeing both pincers.

  private _findXYWing(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    // Collect bivalue cells
    const biCells: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (values[i] === 0 && this.sudoku.candidateCount(i) === 2) biCells.push(i);
    }

    const n = biCells.length;
    // Iterate all triples (i < j < k), matching Java's getWing() iteration order.
    // For each valid triple, try all 3 pivot assignments (tries 0/1/2 in Java).
    for (let i = 0; i < n; i++) {
      const ci = biCells[i];
      const mi = candidates[ci];
      for (let j = i + 1; j < n; j++) {
        const cj = biCells[j];
        const mj = candidates[cj];
        // Pre-filter: ci and cj together must have exactly 3 distinct candidates.
        if (_popcount(mi | mj) !== 3) continue;
        for (let k = j + 1; k < n; k++) {
          const ck = biCells[k];
          const mk = candidates[ck];
          // All three together must have exactly 3 distinct candidates.
          if (_popcount(mi | mj | mk) !== 3) continue;
          // No two cells may have identical candidate masks.
          if (mi === mj || mj === mk || mk === mi) continue;
          // Try all 3 pivot assignments, matching Java's tries 0/1/2:
          //   tries=0: pivot=i, pincers=(j,k)
          //   tries=1: pivot=j, pincers=(i,k)
          //   tries=2: pivot=k, pincers=(j,i)
          for (const [pivot, p1, p2, mp, m1, m2] of [
            [ci, cj, ck, mi, mj, mk],
            [cj, ci, ck, mj, mi, mk],
            [ck, cj, ci, mk, mj, mi],
          ] as [number, number, number, number, number, number][]) {
            // Pivot must see both pincers.
            if (!BUDDIES[pivot].includes(p1) || !BUDDIES[pivot].includes(p2)) continue;
            // Pincers must share exactly one candidate z not in pivot.
            const zMask = m1 & m2;
            if (_popcount(zMask) !== 1 || (zMask & mp)) continue;
            const z = _bit(zMask);
            // Eliminate z from cells seeing both pincers.
            const del: Candidate[] = [];
            for (const cell of BUDDIES[p1]) {
              if (cell !== pivot && cell !== p1 && cell !== p2 &&
                  BUDDIES[p2].includes(cell) &&
                  values[cell] === 0 &&
                  (candidates[cell] & (1 << z))) {
                del.push({ index: cell, value: z as Digit });
              }
            }
            if (del.length) {
              return { type: SolutionType.XY_WING, placements: [], candidatesToDelete: del };
            }
          }
        }
      }
    }
    return null;
  }

  // ── XYZ-Wing ─────────────────────────────────────────────────────────────
  // Pivot = trivalue {x,y,z}. Two bivalue pincers: {x,z} and {y,z}.
  // Pivot must see both pincers. Eliminate z from cells seeing ALL THREE.

  private _findXYZWing(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    const biCells: number[] = [];
    const triCells: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (values[i] !== 0) continue;
      const cnt = this.sudoku.candidateCount(i);
      if (cnt === 2) biCells.push(i);
      else if (cnt === 3) triCells.push(i);
    }

    for (const pivot of triCells) {
      const pm = candidates[pivot];
      const pivotBuddies = BUDDIES[pivot];

      for (let qi = 0; qi < biCells.length; qi++) {
        const p1 = biCells[qi];
        if (!pivotBuddies.includes(p1)) continue;
        const m1 = candidates[p1];
        if ((m1 & pm) !== m1) continue; // p1 candidates must be subset of pivot
        // z = shared candidate between p1 and remaining pincer

        for (let ri = qi + 1; ri < biCells.length; ri++) {
          const p2 = biCells[ri];
          if (!pivotBuddies.includes(p2)) continue;
          const m2 = candidates[p2];
          if ((m2 & pm) !== m2) continue;
          if (m1 === m2) continue; // must be different pincers
          const zMask = m1 & m2;
          if (_popcount(zMask) !== 1) continue;
          const z = _bit(zMask);

          // Eliminate z from cells seeing pivot, p1, AND p2
          const del: Candidate[] = [];
          const p2Buddies = BUDDIES[p2];
          for (const cell of pivotBuddies) {
            if (cell === p1 || cell === p2) continue;
            if (values[cell] !== 0) continue;
            if (!(candidates[cell] & (1 << z))) continue;
            if (!p2Buddies.includes(cell)) continue;
            if (!BUDDIES[p1].includes(cell)) continue;
            del.push({ index: cell, value: z as Digit });
          }
          if (del.length) {
            return { type: SolutionType.XYZ_WING, placements: [], candidatesToDelete: del };
          }
        }
      }
    }
    return null;
  }

  // ── W-Wing ────────────────────────────────────────────────────────────────
  // Two bivalue cells i,j with identical candidates {c1,c2}.
  // There exists a strong link of c1 (exactly 2 cells in some house) where
  // BOTH those cells see i (via c1) and j (via c1) respectively — or more
  // precisely: i and j are connected through a c1 strong link in a house
  // they don't both directly belong to.
  // Eliminate c2 from cells seeing both i and j.

  private _findWWing(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;
    const HOUSES = Sudoku2.HOUSES;

    const biCells: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (values[i] === 0 && this.sudoku.candidateCount(i) === 2) biCells.push(i);
    }

    for (let ii = 0; ii < biCells.length; ii++) {
      const ci = biCells[ii];
      const mi = candidates[ci];

      for (let ji = ii + 1; ji < biCells.length; ji++) {
        const cj = biCells[ji];
        if (candidates[cj] !== mi) continue; // must have same bivalue pair
        // Extract c1, c2
        let c1 = 0, c2 = 0;
        for (let d = 1; d <= 9; d++) {
          if (mi & (1 << d)) { if (!c1) c1 = d; else c2 = d; }
        }

        // Try both candidate roles as the "bridge" candidate
        for (const [bridge, elim] of [[c1, c2], [c2, c1]] as [number, number][]) {
          // Find a house where bridge appears exactly twice (strong link).
          // Mirrors Java's free[constr][cand2] == 2: count includes ci/cj if present.
          // If ci or cj is one of the two bridge cells it is not a valid W-Wing.
          for (const house of HOUSES) {
            const totalBridge = house.filter(
              h => values[h] === 0 && (candidates[h] & (1 << bridge))
            ).length;
            if (totalBridge !== 2) continue;
            const bridgeCells = house.filter(
              h => values[h] === 0 && (candidates[h] & (1 << bridge)) && h !== ci && h !== cj
            );
            if (bridgeCells.length !== 2) continue; // ci or cj is a bridge cell → invalid
            const [linkA, linkB] = bridgeCells;
            // One must see ci, one must see cj
            const aSeesI = BUDDIES[ci].includes(linkA);
            const aSeesJ = BUDDIES[cj].includes(linkA);
            const bSeesI = BUDDIES[ci].includes(linkB);
            const bSeesJ = BUDDIES[cj].includes(linkB);
            // A strong-link cell that sees i doesn't also count as seeing j (Java else-if logic)
            if (!((aSeesI && bSeesJ && !bSeesI) || (bSeesI && aSeesJ && !aSeesI))) continue;

            // Eliminate elim from cells seeing both ci and cj
            const del: Candidate[] = [];
            for (const cell of BUDDIES[ci]) {
              // H20: bridge cells (linkA/linkB) are NOT excluded — if they see both ci and cj
              // they are valid elimination targets (Java does not exclude them either).
              if (cell === cj) continue;
              if (values[cell] !== 0) continue;
              if (!(candidates[cell] & (1 << elim))) continue;
              if (!BUDDIES[cj].includes(cell)) continue;
              del.push({ index: cell, value: elim as Digit });
            }
            if (del.length) {
              return { type: SolutionType.W_WING, placements: [], candidatesToDelete: del };
            }
          }
        }
      }
    }
    return null;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function _popcount(mask: number): number {
  let n = 0;
  let m = mask >> 1;
  while (m) { n += m & 1; m >>= 1; }
  return n;
}

/** Returns the digit (1-9) set in a single-bit candidate mask. */
function _bit(mask: number): number {
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) return d;
  return 0;
}
