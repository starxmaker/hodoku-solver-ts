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
// Bit-mask helpers (candidate masks use bits 1-9)
// ---------------------------------------------------------------------------

/** Count how many of bits 1–9 are set in a candidate mask. */
function anzValues(mask: number): number {
  let n = 0;
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) n++;
  return n;
}

/** Return a sorted list of digits (1–9) set in a candidate mask. */
function possibleValues(mask: number): Digit[] {
  const res: Digit[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) res.push(d as Digit);
  return res;
}

/** Bit mask with bits 1–9 all set (0b1_1111_1110 = 0x1FE). */
const MAX_CAND_MASK = 0b1111111110;

// ---------------------------------------------------------------------------
// MiscellaneousSolver — mirrors solver/MiscellaneousSolver.java
// Implements: Sue de Coq (SDC).
//
// Algorithm sketch (Originalkommentar aus Java):
//   Consider unsolved cells C at the intersection of a row/col R and a box B
//   (|C| ≥ 2). Let V = candidates in C, nPlus = |V| − |C| ≥ 2.
//   Find nPlus cells in R\C (set CR, candidates VR) and in B\C (set CB, VB)
//   such that VR ∩ VB = ∅ and both only draw from V plus possible extras.
//   Then eliminate (V\VR) from B\(C∪CB) and (V\VB) from R\(C∪CR).
// ---------------------------------------------------------------------------

export class MiscellaneousSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    if (type === SolutionType.SUE_DE_COQ) return this._findSueDeCoq();
    return null;
  }

  // ── Top-level search ───────────────────────────────────────────────────────

  private _findSueDeCoq(): SolutionStep | null {
    // rows × boxes, then cols × boxes (matches Java getSueDeCoqInt call order)
    return this._sueDeCoqForLines(0, 9) ?? this._sueDeCoqForLines(9, 18);
  }

  /**
   * For each line (rows 0–8 or cols 9–17) × each box (18–26): collect the
   * unsolved intersection cells and check for SDC patterns.
   */
  private _sueDeCoqForLines(lineStart: number, lineEnd: number): SolutionStep | null {
    for (let li = lineStart; li < lineEnd; li++) {
      const lineUnsolved = (Sudoku2.HOUSES[li] as number[]).filter(
        i => this.sudoku.values[i] === 0,
      );
      for (let bi = 18; bi < 27; bi++) {
        const boxSet = new Set(
          (Sudoku2.HOUSES[bi] as number[]).filter(i => this.sudoku.values[i] === 0),
        );
        const intersection = lineUnsolved.filter(i => boxSet.has(i));
        if (intersection.length < 2) continue;

        const step = this._checkIntersection(
          intersection, lineUnsolved, [...boxSet],
        );
        if (step) return step;
      }
    }
    return null;
  }

  // ── Intersection subset enumeration ───────────────────────────────────────

  /**
   * Enumerate all 2- and 3-cell subsets of the intersection. Each subset that
   * has nPlus ≥ 2 (more candidates than cells) is passed to the house search.
   */
  private _checkIntersection(
    intersection: number[],
    lineUnsolved: number[],
    boxUnsolved: number[],
  ): SolutionStep | null {
    const n = intersection.length;
    for (let i1 = 0; i1 < n - 1; i1++) {
      const c1 = this.sudoku.candidates[intersection[i1]];
      for (let i2 = i1 + 1; i2 < n; i2++) {
        const cands2 = c1 | this.sudoku.candidates[intersection[i2]];
        const nPlus = anzValues(cands2) - 2;
        if (nPlus >= 2) {
          const step = this._checkHouseSearch(
            [intersection[i1], intersection[i2]], cands2, nPlus,
            lineUnsolved, boxUnsolved,
          );
          if (step) return step;
        }
        // 3-cell subsets
        for (let i3 = i2 + 1; i3 < n; i3++) {
          const cands3 = cands2 | this.sudoku.candidates[intersection[i3]];
          const nPlus3 = anzValues(cands3) - 3;
          if (nPlus3 >= 2) {
            const step = this._checkHouseSearch(
              [intersection[i1], intersection[i2], intersection[i3]], cands3, nPlus3,
              lineUnsolved, boxUnsolved,
            );
            if (step) return step;
          }
        }
      }
    }
    return null;
  }

  // ── House search (line × box combination enumeration) ─────────────────────

  /**
   * For a fixed intersection subset: enumerate all subsets of the remaining
   * line cells using depth-first order (matching Java's stack-based enumeration),
   * then for each valid line selection enumerate all valid subsets of the
   * remaining box cells (also DFS), and test for SDC eliminations.
   *
   * Java uses a stack-based DFS that always goes deeper before trying siblings:
   *   {l0} → {l0,l1} → {l0,l1,l2} → ... backtrack → {l0,l2} → ... → {l1} → ...
   * This differs from bit-mask order ({l0},{l1},{l0,l1},{l2},{l0,l2},...) and
   * must be matched exactly for score parity.
   */
  private _checkHouseSearch(
    intActCells: number[],
    intActCands: number,
    nPlus: number,
    lineUnsolved: number[],
    boxUnsolved: number[],
  ): SolutionStep | null {
    const intActSet = new Set(intActCells);
    const lineSource = lineUnsolved.filter(i => !intActSet.has(i));
    return this._lineSearchDFS(
      0, lineSource, 0, [],
      intActCells, intActCands, nPlus,
      lineUnsolved, boxUnsolved, intActSet,
    );
  }

  /**
   * DFS over line-cell subsets, mirroring Java's stack-based checkHouses
   * (secondCheck=false). Always recurses deeper after processing each cell
   * (matching Java's unconditional level++).
   */
  private _lineSearchDFS(
    start: number,
    lineSource: number[],
    cumCands: number,
    cumCells: number[],
    intActCells: number[],
    intActCands: number,
    nPlus: number,
    lineUnsolved: number[],
    boxUnsolved: number[],
    intActSet: Set<number>,
  ): SolutionStep | null {
    const n = lineSource.length;
    for (let i = start; i < n; i++) {
      const cell = lineSource[i];
      const cands = cumCands | this.sudoku.candidates[cell];
      const cells = [...cumCells, cell];

      const anzContained = anzValues(cands & intActCands);
      const anzExtra     = anzValues(cands & ~intActCands);
      const levelSize    = cells.length;
      const lineFills    = levelSize - anzExtra;

      // Java: anzContained > 0 && level > anzExtra && level - anzExtra < nPlus
      if (anzContained > 0 && levelSize > anzExtra && lineFills < nPlus) {
        const lineSet       = new Set(cells);
        const blockAllowed  = (~(cands & intActCands)) & MAX_CAND_MASK;
        const blockNPlus    = nPlus - lineFills;
        const blockSource   = boxUnsolved.filter(c => !intActSet.has(c) && !lineSet.has(c));

        const step = this._blockSearchDFS(
          0, blockSource, blockAllowed, 0, [],
          intActCells, intActCands, cells, cands, blockNPlus,
          lineUnsolved, boxUnsolved, intActSet,
        );
        if (step) return step;
      }

      // Java: unconditionally go deeper (level++) before trying next sibling
      const step = this._lineSearchDFS(
        i + 1, lineSource, cands, cells,
        intActCells, intActCands, nPlus,
        lineUnsolved, boxUnsolved, intActSet,
      );
      if (step) return step;
    }
    return null;
  }

  /**
   * DFS over block-cell subsets, mirroring Java's stack-based checkHouses
   * (secondCheck=true). Only recurses deeper if gate-1 passes (blockCands
   * within blockAllowed), since gate-1 can never recover once violated.
   */
  private _blockSearchDFS(
    start: number,
    blockSource: number[],
    blockAllowed: number,
    cumCands: number,
    cumCells: number[],
    intActCells: number[],
    intActCands: number,
    lineCells: number[],
    lineCands: number,
    blockNPlus: number,
    lineUnsolved: number[],
    boxUnsolved: number[],
    intActSet: Set<number>,
  ): SolutionStep | null {
    const m = blockSource.length;
    for (let i = start; i < m; i++) {
      const cell  = blockSource[i];
      const cands = cumCands | this.sudoku.candidates[cell];
      const cells = [...cumCells, cell];

      // Gate 1: block candidates must be within blockAllowed
      if ((cands & ~blockAllowed) === 0) {
        const anzContained = anzValues(cands & intActCands);
        const anzExtra     = anzValues(cands & ~intActCands);
        const blockFills   = cells.length - anzExtra;

        // Java: anzContained > 0 && level - anzExtra == nPlus (blockNPlus)
        if (anzContained > 0 && blockFills === blockNPlus) {
          const step = this._computeEliminations(
            intActCells, intActCands,
            lineCells, lineCands,
            cells, cands,
            lineUnsolved, boxUnsolved, intActSet,
          );
          if (step) return step;
        }

        // Go deeper only when gate-1 passes (supersets of invalid sets are also invalid)
        const step = this._blockSearchDFS(
          i + 1, blockSource, blockAllowed, cands, cells,
          intActCells, intActCands, lineCells, lineCands, blockNPlus,
          lineUnsolved, boxUnsolved, intActSet,
        );
        if (step) return step;
      }
    }
    return null;
  }

  // ── Elimination computation ────────────────────────────────────────────────

  /**
   * Given a confirmed SDC pattern, collect all candidates that can be deleted
   * and return a SolutionStep (or null if nothing can be eliminated).
   *
   * From Java checkHouses (secondCheck=true) elimination formulas:
   *   block eliminations: ((intActCands | blockCands) & ~lineCands)  | sharedExtra
   *   line  eliminations: ((intActCands | lineCands)  & ~blockCands) | sharedExtra
   *   where sharedExtra = lineCands & blockCands
   */
  private _computeEliminations(
    intActCells: number[],
    intActCands: number,
    lineCells:   number[],
    lineCands:   number,
    blockCells:  number[],
    blockCands:  number,
    lineUnsolved: number[],
    boxUnsolved:  number[],
    intActSet:    Set<number>,
  ): SolutionStep | null {
    const lineActSet  = new Set(lineCells);
    const blockActSet = new Set(blockCells);

    // Shared extra candidates (appear in both line AND block selections)
    const sharedExtra = lineCands & blockCands;

    // Box cells to eliminate from: boxUnsolved − blockActCells − intActCells
    const blockTarget   = boxUnsolved.filter(i => !blockActSet.has(i) && !intActSet.has(i));
    const blockElimCandMask = ((intActCands | blockCands) & ~lineCands) | sharedExtra;

    // Line cells to eliminate from: lineUnsolved − lineActCells − intActCells
    const lineTarget   = lineUnsolved.filter(i => !lineActSet.has(i) && !intActSet.has(i));
    const lineElimCandMask = ((intActCands | lineCands) & ~blockCands) | sharedExtra;

    const seen = new Set<number>();
    const candidatesToDelete: Candidate[] = [];

    for (const cell of blockTarget) {
      for (const d of possibleValues(this.sudoku.candidates[cell] & blockElimCandMask)) {
        const key = cell * 10 + d;
        if (!seen.has(key)) { seen.add(key); candidatesToDelete.push({ index: cell, value: d }); }
      }
    }
    for (const cell of lineTarget) {
      for (const d of possibleValues(this.sudoku.candidates[cell] & lineElimCandMask)) {
        const key = cell * 10 + d;
        if (!seen.has(key)) { seen.add(key); candidatesToDelete.push({ index: cell, value: d }); }
      }
    }

    if (candidatesToDelete.length === 0) return null;

    return { type: SolutionType.SUE_DE_COQ, placements: [], candidatesToDelete };
  }
}

// ---------------------------------------------------------------------------
// Module-level utility
// ---------------------------------------------------------------------------
