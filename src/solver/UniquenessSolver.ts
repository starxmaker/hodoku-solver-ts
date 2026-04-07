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

import type { SolutionStep } from '../Sudoku2';
import { Sudoku2 } from '../Sudoku2';
import { SolutionType } from '../SolutionType';
import type { Digit } from '../types';
import { AbstractSolver } from './AbstractSolver';

// ---------------------------------------------------------------------------
// UniquenessSolver — Unique Rectangles Types 1–6, Hidden Rectangle, BUG+1.
// Mirrors solver/UniquenessSolver.java.
// ---------------------------------------------------------------------------

export class UniquenessSolver extends AbstractSolver {
  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    switch (type) {
      case SolutionType.UNIQUENESS_1:          return this._findUR1();
      case SolutionType.UNIQUENESS_2:
      case SolutionType.UNIQUENESS_3:
      case SolutionType.UNIQUENESS_4:
      case SolutionType.UNIQUENESS_5:
      case SolutionType.UNIQUENESS_6:
      case SolutionType.HIDDEN_RECTANGLE:
        if (!this.sudoku.hasUniqueSolution()) return null;
        return this._findUR(type);
      case SolutionType.AVOIDABLE_RECTANGLE_1:
      case SolutionType.AVOIDABLE_RECTANGLE_2:
        if (!this.sudoku.hasUniqueSolution() || !this.sudoku.hasUniqueGivensSolution()) return null;
        return this._findAvoidableRectangle(type);
      case SolutionType.BUG_PLUS_1:            return this._findBugPlus1();
      default:                                 return null;
    }
  }

  private _findUR1(): SolutionStep | null {
    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 8; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const i11 = r1 * 9 + c1;
            const i12 = r1 * 9 + c2;
            const i21 = r2 * 9 + c1;
            const i22 = r2 * 9 + c2;
            const boxes = new Set([
              Sudoku2.box(i11), Sudoku2.box(i12),
              Sudoku2.box(i21), Sudoku2.box(i22),
            ]);
            if (boxes.size !== 2) continue;
            const corners = [i11, i12, i21, i22];
            for (let a = 1; a <= 8; a++) {
              for (let b = a + 1; b <= 9; b++) {
                const mask = (1 << a) | (1 << b);
                if (!corners.every(i =>
                  this.sudoku.values[i] === 0 &&
                  this.sudoku.isCandidate(i, a) &&
                  this.sudoku.isCandidate(i, b)
                )) continue;
                let twoOnly = 0;
                let extraIndex = -1;
                for (const i of corners) {
                  const hasMask = (this.sudoku.candidates[i] & mask) === mask;
                  const hasExtra = (this.sudoku.candidates[i] & ~mask) !== 0;
                  if (hasMask && !hasExtra) {
                    twoOnly++;
                  } else if (hasMask && hasExtra) {
                    extraIndex = i;
                  }
                }
                if (twoOnly === 3 && extraIndex !== -1) {
                  const toDelete: { index: number; value: Digit }[] = [];
                  if (this.sudoku.isCandidate(extraIndex, a))
                    toDelete.push({ index: extraIndex, value: a as Digit });
                  if (this.sudoku.isCandidate(extraIndex, b))
                    toDelete.push({ index: extraIndex, value: b as Digit });
                  if (toDelete.length > 0) {
                    return {
                      type: SolutionType.UNIQUENESS_1,
                      placements: [],
                      candidatesToDelete: toDelete,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Enumerate all valid UR rectangles and dispatch to the appropriate checker.
  // Mirrors Java's getAllUniquenessInternal: iterate bivalue cells as the anchor
  // corner (i11), then search for i12 in the same box sharing a row or column.
  // -------------------------------------------------------------------------
  private _findUR(targetType: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    const BUDDIES = Sudoku2.BUDDIES;
    const HOUSES  = Sudoku2.HOUSES;

    // allowMissing: allowed[d-1][i]=1 iff values[i]===0 and no buddy has value d.
    // Mirrors Java's getCandidatesAllowed() with allowUniquenessMissingCandidates=true.
    const allowed: Uint8Array[] = [];
    for (let d = 1; d <= 9; d++) {
      const arr = new Uint8Array(81);
      for (let i = 0; i < 81; i++) {
        if (this.sudoku.values[i] !== 0) continue;
        let blocked = false;
        for (const b of BUDDIES[i]) {
          if (this.sudoku.values[b] === d) { blocked = true; break; }
        }
        if (!blocked) arr[i] = 1;
      }
      allowed.push(arr);
    }

    // Rectangle deduplication: skip 4-corner rect already examined this pass.
    const seenRects = new Set<number>();

    // Java-compatible iteration: bivalue cells as anchor (i11), ordered by index.
    for (let i11 = 0; i11 < 81; i11++) {
      if (this.sudoku.values[i11] !== 0) continue;
      if (this.sudoku.candidateCount(i11) !== 2) continue;

      // Extract the two candidates (da < db).
      let da = -1, db = -1;
      for (let d = 1; d <= 9; d++) {
        if (this.sudoku.isCandidate(i11, d)) {
          if (da === -1) da = d; else { db = d; break; }
        }
      }

      const r1   = Sudoku2.row(i11);
      const c1   = Sudoku2.col(i11);
      const box11 = Sudoku2.box(i11);
      const urMask = (1 << da) | (1 << db);

      // Find i12 in the same box as i11, sharing a row OR a column,
      // with both UR candidates present.
      for (const i12 of HOUSES[18 + box11]) {
        if (i12 === i11) continue;
        if (this.sudoku.values[i12] !== 0) continue;
        if (!allowed[da - 1][i12] || !allowed[db - 1][i12]) continue;

        const r12 = Sudoku2.row(i12);
        const c12 = Sudoku2.col(i12);
        const sameRow = r1 === r12;
        const sameCol = c1 === c12;
        if (!sameRow && !sameCol) continue;

        if (sameRow) {
          // i11=(r1,c1), i12=(r1,c12). Complete with rows r2 ≠ r1 in different box.
          const c2 = c12;
          for (let r2 = 0; r2 < 9; r2++) {
            if (r2 === r1) continue;
            const i21 = r2 * 9 + c1;
            const i22 = r2 * 9 + c2;
            if (Sudoku2.box(i21) === box11) continue; // must be a different box
            if (this.sudoku.values[i21] !== 0 || this.sudoku.values[i22] !== 0) continue;
            if (!allowed[da - 1][i21] || !allowed[db - 1][i21]) continue;
            if (!allowed[da - 1][i22] || !allowed[db - 1][i22]) continue;

            const s4 = [i11, i12, i21, i22].slice().sort((a, b) => a - b);
            const rectKey = s4[0] << 21 | s4[1] << 14 | s4[2] << 7 | s4[3];
            if (seenRects.has(rectKey)) continue;
            seenRects.add(rectKey);

            const corners = [i11, i12, i21, i22] as const;
            const twoOnly: number[] = [], withExtra: number[] = [];
            for (const ci of corners) {
              if ((this.sudoku.candidates[ci] & ~urMask) === 0) twoOnly.push(ci);
              else withExtra.push(ci);
            }
            const step = this._checkUR(
              targetType, corners, twoOnly, withExtra,
              da, db, urMask, r1, r2, c1, c2, HOUSES, BUDDIES,
            );
            if (step) return step;
          }
        } else {
          // sameCol: i11=(r1,c1), i12=(r12,c1). Complete with cols c2 ≠ c1.
          const r2 = r12;
          for (let c2 = 0; c2 < 9; c2++) {
            if (c2 === c1) continue;
            const i21 = r1 * 9 + c2;
            const i22 = r2 * 9 + c2;
            if (Sudoku2.box(i21) === box11) continue; // must be a different box
            if (this.sudoku.values[i21] !== 0 || this.sudoku.values[i22] !== 0) continue;
            if (!allowed[da - 1][i21] || !allowed[db - 1][i21]) continue;
            if (!allowed[da - 1][i22] || !allowed[db - 1][i22]) continue;

            const s4 = [i11, i12, i21, i22].slice().sort((a, b) => a - b);
            const rectKey = s4[0] << 21 | s4[1] << 14 | s4[2] << 7 | s4[3];
            if (seenRects.has(rectKey)) continue;
            seenRects.add(rectKey);

            const corners = [i11, i12, i21, i22] as const;
            const twoOnly: number[] = [], withExtra: number[] = [];
            for (const ci of corners) {
              if ((this.sudoku.candidates[ci] & ~urMask) === 0) twoOnly.push(ci);
              else withExtra.push(ci);
            }
            const step = this._checkUR(
              targetType, corners, twoOnly, withExtra,
              da, db, urMask, r1, r2, c1, c2, HOUSES, BUDDIES,
            );
            if (step) return step;
          }
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Per-rectangle type dispatcher.
  // -------------------------------------------------------------------------
  private _checkUR(
    targetType: typeof SolutionType[keyof typeof SolutionType],
    corners:    readonly number[],
    twoOnly:    number[],
    withExtra:  number[],
    da: number, db: number, urMask: number,
    r1: number, r2: number, c1: number, c2: number,
    HOUSES:  readonly (readonly number[])[],
    BUDDIES: readonly (readonly number[])[],
  ): SolutionStep | null {

    const twoSize = twoOnly.length;

    // ── UR Type 1 ──────────────────────────────────────────────────────────
    // 3 pure {da,db} corners → delete da,db from the 4th cell.
    if (targetType === SolutionType.UNIQUENESS_1) {
      if (twoSize !== 3 || withExtra.length !== 1) return null;
      const extra = withExtra[0];
      const toDelete: { index: number; value: Digit }[] = [];
      if (this.sudoku.isCandidate(extra, da)) toDelete.push({ index: extra, value: da as Digit });
      if (this.sudoku.isCandidate(extra, db)) toDelete.push({ index: extra, value: db as Digit });
      if (toDelete.length === 0) return null;
      return { type: SolutionType.UNIQUENESS_1, placements: [], candidatesToDelete: toDelete };
    }

    // ── UR Types 2 & 5 ─────────────────────────────────────────────────────
    // 1 or 2 "pure" corners (so 2 or 3 "extra" corners), all extra corners
    // share exactly ONE additional candidate.  Eliminate it from cells that
    // see every extra corner.
    //   Type 2: the 2 extra corners are in the same row or column.
    //   Type 5: the 2 extra corners are diagonal (or there are 3 extra corners).
    if (targetType === SolutionType.UNIQUENESS_2 || targetType === SolutionType.UNIQUENESS_5) {
      if (twoSize !== 2 && twoSize !== 1) return null;

      let extraMask = 0;
      for (const i of withExtra) extraMask |= (this.sudoku.candidates[i] & ~urMask);

      // Must be exactly one additional candidate across all extra corners.
      let addCand = -1, cnt = 0;
      for (let d = 1; d <= 9; d++) { if (extraMask & (1 << d)) { addCand = d; cnt++; } }
      if (cnt !== 1) return null;

      // Determine actual step type.
      let stepType: typeof SolutionType[keyof typeof SolutionType];
      if (withExtra.length === 2) {
        const [e1, e2] = withExtra;
        stepType = (Sudoku2.row(e1) === Sudoku2.row(e2) || Sudoku2.col(e1) === Sudoku2.col(e2))
          ? SolutionType.UNIQUENESS_2
          : SolutionType.UNIQUENESS_5;
      } else {
        stepType = SolutionType.UNIQUENESS_5;
      }
      if (stepType !== targetType) return null;

      // Common buddies of all extra corners.
      let cb: Set<number> | null = null;
      for (const i of withExtra) {
        if (cb === null) {
          cb = new Set(BUDDIES[i]);
        } else {
          for (const b of cb) { if (!BUDDIES[i].includes(b)) cb.delete(b); }
        }
      }
      const toDelete: { index: number; value: Digit }[] = [];
      for (const v of cb!) {
        if (corners.includes(v)) continue;
        if (this.sudoku.values[v] !== 0) continue;
        if (!this.sudoku.isCandidate(v, addCand)) continue;
        toDelete.push({ index: v, value: addCand as Digit });
      }
      if (toDelete.length === 0) return null;
      return { type: stepType, placements: [], candidatesToDelete: toDelete };
    }

    // ── UR Type 3 ──────────────────────────────────────────────────────────
    // 2 extra corners in the same row/col/box; their extra candidates
    // combine with those of additional cells to form a naked subset.
    if (targetType === SolutionType.UNIQUENESS_3) {
      if (twoSize !== 2 || withExtra.length !== 2) return null;
      const [e1, e2] = withExtra;
      let u3Cands = 0;
      for (const i of withExtra) u3Cands |= (this.sudoku.candidates[i] & ~urMask);

      const cornerSet    = new Set(corners);
      const houseIds: { idx: number; type: number }[] = [];
      if (Sudoku2.row(e1) === Sudoku2.row(e2)) houseIds.push({ idx: Sudoku2.row(e1),              type: 0 });
      if (Sudoku2.col(e1) === Sudoku2.col(e2)) houseIds.push({ idx: 9 + Sudoku2.col(e1),           type: 1 });
      if (Sudoku2.box(e1) === Sudoku2.box(e2)) houseIds.push({ idx: 18 + Sudoku2.box(e1),          type: 2 });

      for (const { idx: hIdx, type: hType } of houseIds) {
        const house   = HOUSES[hIdx];
        const u3Cells: number[] = [];
        for (const i of house) {
          if (cornerSet.has(i)) continue;
          if (this.sudoku.values[i] !== 0) continue;
          if (this.sudoku.isCandidate(i, da) || this.sudoku.isCandidate(i, db)) continue;
          u3Cells.push(i);
        }
        const step = this._checkUR3(house, hType, u3Cells, u3Cands, withExtra, cornerSet);
        if (step) return step;
      }
      return null;
    }

    // ── UR Type 4 ──────────────────────────────────────────────────────────
    // 2 extra corners in the same row or column.  In cells seen by both,
    // if one UR candidate is absent → delete the other from both extra corners.
    if (targetType === SolutionType.UNIQUENESS_4) {
      if (twoSize !== 2 || withExtra.length !== 2) return null;
      const [e1, e2] = withExtra;
      if (Sudoku2.row(e1) !== Sudoku2.row(e2) && Sudoku2.col(e1) !== Sudoku2.col(e2)) return null;

      const e1buds = new Set(BUDDIES[e1]);
      const commonBuds: number[] = [];
      for (const b of BUDDIES[e2]) {
        if (e1buds.has(b) && !corners.includes(b) && this.sudoku.values[b] === 0)
          commonBuds.push(b);
      }

      const aPresent = commonBuds.some(b => this.sudoku.isCandidate(b, da));
      const bPresent = commonBuds.some(b => this.sudoku.isCandidate(b, db));
      let delCand = aPresent ? (bPresent ? -1 : da) : db;
      if (delCand === -1) return null;

      const toDelete: { index: number; value: Digit }[] = [];
      for (const i of withExtra) {
        if (this.sudoku.isCandidate(i, delCand)) toDelete.push({ index: i, value: delCand as Digit });
      }
      if (toDelete.length === 0) return null;
      return { type: SolutionType.UNIQUENESS_4, placements: [], candidatesToDelete: toDelete };
    }

    // ── UR Type 6 ──────────────────────────────────────────────────────────
    // 2 diagonal extra corners.  If one UR candidate is absent from ALL cells
    // in the 4 rows/cols of the extra corners (outside the UR) → delete it.
    if (targetType === SolutionType.UNIQUENESS_6) {
      if (twoSize !== 2 || withExtra.length !== 2) return null;
      const [e1, e2] = withExtra;
      if (Sudoku2.row(e1) === Sudoku2.row(e2) || Sudoku2.col(e1) === Sudoku2.col(e2)) return null;

      const cornerSet = new Set(corners);
      const rows4 = new Set([Sudoku2.row(e1), Sudoku2.row(e2)]);
      const cols4 = new Set([Sudoku2.col(e1), Sudoku2.col(e2)]);

      let aInLines = false, bInLines = false;
      for (let i = 0; i < 81; i++) {
        if (cornerSet.has(i) || this.sudoku.values[i] !== 0) continue;
        if (!rows4.has(Sudoku2.row(i)) && !cols4.has(Sudoku2.col(i))) continue;
        if (this.sudoku.isCandidate(i, da)) aInLines = true;
        if (this.sudoku.isCandidate(i, db)) bInLines = true;
        if (aInLines && bInLines) break;
      }
      const delCand = !aInLines ? da : (!bInLines ? db : -1);
      if (delCand === -1) return null;

      const toDelete: { index: number; value: Digit }[] = [];
      for (const i of withExtra) {
        if (this.sudoku.isCandidate(i, delCand)) toDelete.push({ index: i, value: delCand as Digit });
      }
      if (toDelete.length === 0) return null;
      return { type: SolutionType.UNIQUENESS_6, placements: [], candidatesToDelete: toDelete };
    }

    // ── Hidden Rectangle ───────────────────────────────────────────────────
    // One or two "pure" corners (only {da,db}).  For each pure corner, find
    // the "opposite" row/col.  If one UR candidate appears only within the
    // UR in that row AND that col → delete the other candidate from the
    // intersection cell.
    if (targetType === SolutionType.HIDDEN_RECTANGLE) {
      if (twoSize !== 2 && twoSize !== 1) return null;
      if (twoSize === 2) {
        const [t1, t2] = twoOnly;
        if (Sudoku2.row(t1) === Sudoku2.row(t2) || Sudoku2.col(t1) === Sudoku2.col(t2)) return null;
      }
      const cornerSet = new Set(corners);
      for (const cidx of twoOnly) {
        const cRow = Sudoku2.row(cidx);
        const cCol = Sudoku2.col(cidx);
        const oppRow = cRow === r1 ? r2 : r1;
        const oppCol = cCol === c1 ? c2 : c1;

        const s1 = this._checkHiddenRect(oppRow, oppCol, da, db, cornerSet, HOUSES);
        if (s1) return s1;
        const s2 = this._checkHiddenRect(oppRow, oppCol, db, da, cornerSet, HOUSES);
        if (s2) return s2;
      }
      return null;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // UR3 naked-subset search.
  // -------------------------------------------------------------------------
  private _checkUR3(
    house:     readonly number[],
    houseType: number,          // 0=row, 1=col, 2=box
    u3Cells:   number[],
    u3Cands:   number,
    withExtra: number[],
    cornerSet: Set<number>,
  ): SolutionStep | null {
    const n = withExtra.length; // always 2

    for (let k = 1; k <= u3Cells.length; k++) {
      for (const combo of _combinations(u3Cells, k)) {
        let aktCands = u3Cands;
        for (const i of combo) aktCands |= this.sudoku.candidates[i];

        const aktSize = n + k;
        if (_popcount(aktCands) !== aktSize - 1) continue;

        // For a BOX house: skip if all aktIndices happen to be in the same
        // row or column (that case is already handled by the row/col pass).
        if (houseType === 2) {
          const aktIndices = [...withExtra, ...combo];
          if (_sameRowOrCol(aktIndices)) continue;
        }

        const aktSet = new Set([...withExtra, ...combo]);
        const toDelete: { index: number; value: Digit }[] = [];

        const elim = (h: readonly number[]) => {
          for (const v of h) {
            if (aktSet.has(v) || cornerSet.has(v)) continue;
            if (this.sudoku.values[v] !== 0) continue;
            for (let d = 1; d <= 9; d++) {
              if ((aktCands & (1 << d)) && this.sudoku.isCandidate(v, d))
                toDelete.push({ index: v, value: d as Digit });
            }
          }
        };

        elim(house);

        // For a row/col house, also eliminate from the box if all aktIndices
        // are in the same box (locked subset extension).
        if (houseType === 0 || houseType === 1) {
          const aktIndices = [...withExtra, ...combo];
          const boxSet = new Set(aktIndices.map(i => Sudoku2.box(i)));
          if (boxSet.size === 1) {
            elim(Sudoku2.HOUSES[18 + [...boxSet][0]]);
          }
        }

        const unique = _dedupCands(toDelete);
        if (unique.length > 0) {
          return { type: SolutionType.UNIQUENESS_3, placements: [], candidatesToDelete: unique };
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Hidden Rectangle helper.
  // checkCand must appear ONLY in UR cells in oppRow and oppCol.
  // Then delete delCand from the intersection cell.
  // -------------------------------------------------------------------------
  private _checkHiddenRect(
    oppRow:    number,
    oppCol:    number,
    checkCand: number,
    delCand:   number,
    cornerSet: Set<number>,
    HOUSES:    readonly (readonly number[])[],
  ): SolutionStep | null {
    for (const i of HOUSES[oppRow]) {
      if (cornerSet.has(i) || this.sudoku.values[i] !== 0) continue;
      if (this.sudoku.isCandidate(i, checkCand)) return null;
    }
    for (const i of HOUSES[9 + oppCol]) {
      if (cornerSet.has(i) || this.sudoku.values[i] !== 0) continue;
      if (this.sudoku.isCandidate(i, checkCand)) return null;
    }
    const delIdx = oppRow * 9 + oppCol;
    if (!this.sudoku.isCandidate(delIdx, delCand)) return null;
    return {
      type: SolutionType.HIDDEN_RECTANGLE,
      placements: [],
      candidatesToDelete: [{ index: delIdx, value: delCand as Digit }],
    };
  }

  // -------------------------------------------------------------------------
  // Avoidable Rectangles (AR1 & AR2).
  // -------------------------------------------------------------------------
  private _findAvoidableRectangle(targetType: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    const { values } = this.sudoku;
    const HOUSES  = Sudoku2.HOUSES;
    const BUDDIES = Sudoku2.BUDDIES;

    for (let i11 = 0; i11 < 81; i11++) {
      if (values[i11] === 0 || this.sudoku.isGiven(i11)) continue;
      const cand1 = values[i11];
      const row11 = Sudoku2.row(i11);
      const col11 = Sudoku2.col(i11);
      const box11 = Sudoku2.box(i11);

      // Find i12 in same box, also solved and non-given, sharing row or col with i11.
      for (const i12 of HOUSES[18 + box11]) {
        if (i12 === i11) continue;
        if (values[i12] === 0 || this.sudoku.isGiven(i12)) continue;

        const row12 = Sudoku2.row(i12);
        const col12 = Sudoku2.col(i12);
        const sameRow = row11 === row12;
        const sameCol = col11 === col12;
        if (!sameRow && !sameCol) continue;

        const cand2 = values[i12];

        if (sameRow) {
          // Rectangle columns: col11, col12 — iterate rows rj ≠ row11, different box.
          for (let rj = 0; rj < 9; rj++) {
            if (rj === row11) continue;
            const i21 = rj * 9 + col11;
            const i22 = rj * 9 + col12;
            if (Sudoku2.box(i21) === box11) continue;
            const step = this._checkAR(i11, i12, i21, i22, cand1, cand2, targetType, BUDDIES);
            if (step) return step;
          }
        } else {
          // Rectangle rows: row11, row12 — iterate cols cj ≠ col11, different box.
          for (let cj = 0; cj < 9; cj++) {
            if (cj === col11) continue;
            const i21 = row11 * 9 + cj;
            const i22 = row12 * 9 + cj;
            if (Sudoku2.box(i21) === box11) continue;
            const step = this._checkAR(i11, i12, i21, i22, cand1, cand2, targetType, BUDDIES);
            if (step) return step;
          }
        }
      }
    }
    return null;
  }

  private _checkAR(
    i11: number, i12: number,
    i21: number, i22: number,
    cand1: number, cand2: number,
    targetType: typeof SolutionType[keyof typeof SolutionType],
    BUDDIES: readonly (readonly number[])[],
  ): SolutionStep | null {
    const { values } = this.sudoku;
    const v21 = values[i21];
    const v22 = values[i22];

    if (v21 !== 0 && v22 === 0) {
      // Case 1: i21 solved with cand2 (non-given), i22 unsolved with cand1, 2-cand → AR1.
      if (v21 !== cand2 || this.sudoku.isGiven(i21)) return null;
      if (!this.sudoku.isCandidate(i22, cand1) || this.sudoku.candidateCount(i22) !== 2) return null;
      if (targetType !== SolutionType.AVOIDABLE_RECTANGLE_1) return null;
      return {
        type: SolutionType.AVOIDABLE_RECTANGLE_1,
        placements: [],
        candidatesToDelete: [{ index: i22, value: cand1 as Digit }],
      };

    } else if (v21 === 0 && v22 !== 0) {
      // Case 2: i22 solved with cand1 (non-given), i21 unsolved with cand2, 2-cand → AR1.
      if (v22 !== cand1 || this.sudoku.isGiven(i22)) return null;
      if (!this.sudoku.isCandidate(i21, cand2) || this.sudoku.candidateCount(i21) !== 2) return null;
      if (targetType !== SolutionType.AVOIDABLE_RECTANGLE_1) return null;
      return {
        type: SolutionType.AVOIDABLE_RECTANGLE_1,
        placements: [],
        candidatesToDelete: [{ index: i21, value: cand2 as Digit }],
      };

    } else if (v21 === 0 && v22 === 0) {
      // Case 3: both unsolved, each bivalue with the respective UR candidate → AR2.
      if (!this.sudoku.isCandidate(i21, cand2) || this.sudoku.candidateCount(i21) !== 2) return null;
      if (!this.sudoku.isCandidate(i22, cand1) || this.sudoku.candidateCount(i22) !== 2) return null;
      if (targetType !== SolutionType.AVOIDABLE_RECTANGLE_2) return null;

      // Additional candidate = the non-cand2 candidate of i21.
      let additionalCand = -1;
      for (let d = 1; d <= 9; d++) {
        if (d !== cand2 && this.sudoku.isCandidate(i21, d)) { additionalCand = d; break; }
      }
      if (additionalCand === -1) return null;
      if (!this.sudoku.isCandidate(i22, additionalCand)) return null;

      const buds21 = new Set(BUDDIES[i21]);
      const toDelete: { index: number; value: Digit }[] = [];
      for (const b of BUDDIES[i22]) {
        if (!buds21.has(b)) continue;
        if (values[b] !== 0) continue;
        if (!this.sudoku.isCandidate(b, additionalCand)) continue;
        toDelete.push({ index: b, value: additionalCand as Digit });
      }
      if (toDelete.length === 0) return null;
      return {
        type: SolutionType.AVOIDABLE_RECTANGLE_2,
        placements: [],
        candidatesToDelete: toDelete,
      };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // BUG+1: exactly one cell with 3 candidates; all others ≤ 2.
  // Every unit/candidate pair has ≤ 3 occurrences, and exactly one per
  // constraint type (row/col/box) has exactly 3 — all for the same digit
  // (cand3) — and that constraint triple must match the 3-candidate cell.
  // Elimination: delete all candidates ≠ cand3 from the 3-candidate cell.
  // -------------------------------------------------------------------------
  private _findBugPlus1(): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;

    let index3 = -1;
    for (let i = 0; i < 81; i++) {
      const cnt = this.sudoku.candidateCount(i);
      if (cnt > 3) return null;
      if (cnt === 3) {
        if (index3 !== -1) return null;   // second 3-cand cell → not BUG+1
        index3 = i;
      }
    }
    if (index3 === -1) return null;

    let cand3 = -1;
    const bugConstraints = [-1, -1, -1];  // one entry per constraint type
    for (let h = 0; h < 27; h++) {
      const htype = h < 9 ? 0 : h < 18 ? 1 : 2;
      for (let d = 1; d <= 9; d++) {
        let cnt = 0;
        for (const i of HOUSES[h]) {
          if (this.sudoku.values[i] === 0 && this.sudoku.isCandidate(i, d)) cnt++;
        }
        if (cnt > 3) return null;
        if (cnt === 3) {
          if (bugConstraints[htype] !== -1 || (cand3 !== -1 && cand3 !== d)) return null;
          cand3 = d;
          bugConstraints[htype] = h;
        }
      }
    }
    if (cand3 === -1) return null;
    if (!this.sudoku.isCandidate(index3, cand3)) return null;

    // The three-occurrence constraints must be the constraints of index3.
    if (bugConstraints[0] !== Sudoku2.row(index3))       return null;
    if (bugConstraints[1] !== 9  + Sudoku2.col(index3))  return null;
    if (bugConstraints[2] !== 18 + Sudoku2.box(index3))  return null;

    const toDelete: { index: number; value: Digit }[] = [];
    for (let d = 1; d <= 9; d++) {
      if (d !== cand3 && this.sudoku.isCandidate(index3, d))
        toDelete.push({ index: index3, value: d as Digit });
    }
    if (toDelete.length === 0) return null;
    return { type: SolutionType.BUG_PLUS_1, placements: [], candidatesToDelete: toDelete };
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function _popcount(mask: number): number {
  let n = 0;
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) n++;
  return n;
}

function _sameRowOrCol(cells: number[]): boolean {
  if (cells.length === 0) return false;
  const r0 = Sudoku2.row(cells[0]);
  const c0 = Sudoku2.col(cells[0]);
  return cells.every(i => Sudoku2.row(i) === r0) || cells.every(i => Sudoku2.col(i) === c0);
}

function* _combinations(arr: number[], k: number, start = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= arr.length - k; i++) {
    for (const rest of _combinations(arr, k - 1, i + 1)) yield [arr[i], ...rest];
  }
}

function _dedupCands(
  cands: { index: number; value: number }[],
): { index: number; value: Digit }[] {
  const seen = new Set<number>();
  const result: { index: number; value: Digit }[] = [];
  for (const c of cands) {
    const key = c.index * 10 + c.value;
    if (!seen.has(key)) { seen.add(key); result.push({ index: c.index, value: c.value as Digit }); }
  }
  return result;
}
