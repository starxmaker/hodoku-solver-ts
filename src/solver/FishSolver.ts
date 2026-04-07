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

import type { EntityRef, SolutionStep } from '../Sudoku2';
import { Sudoku2 } from '../Sudoku2';
import { SolutionType } from '../SolutionType';
import type { Digit } from '../types';
import { AbstractSolver } from './AbstractSolver';
import type { TablingSolver } from './TablingSolver';

// ---------------------------------------------------------------------------
// FishSolver — basic fish (X-Wing, Swordfish, Jellyfish) and their finned
// variants.  Mirrors solver/FishSolver.java for the basic + finned cases.
//
// Algorithm (basic fish, rows as base):
//   For digit d, pick k rows ("base lines") such that d appears in at most k
//   columns total.  If it appears in exactly k columns ("cover lines"), every
//   other occurrence of d in those k columns can be eliminated.
//
// Finned fish adds "fins": extra d-cells in the base rows that are NOT
// covered by the cover columns.  A finned fish can only eliminate d from
// cells that (a) would be eliminated by the unfinned fish AND (b) see all
// fins.  The fin cells must all be in one box.
// ---------------------------------------------------------------------------

type LineSet = Set<number>; // column indices covered by a base set

interface FishCandidate {
  baseRows: number[];       // row indices used as base
  coverCols: number[];      // column indices that cover all base cells
  finCells: number[];       // fin cells (extra cells not in cover cols)
}

export class FishSolver extends AbstractSolver {
  private _tabling: TablingSolver | null = null;

  setTablingSolver(ts: TablingSolver): void {
    this._tabling = ts;
  }

  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    // Basic fish (rows/cols only)
    const size = fishSize(type);
    if (size > 0) {
      const sashimi = isSashimiType(type);
      const finned = isFinnedType(type) || sashimi;
      return this._findFish(size, finned, sashimi, type);
    }

    // Franken fish (row/col base + any cover including boxes)
    const frankenSize = frankenFishSize(type);
    if (frankenSize > 0) {
      const finned = isFinnedFrankenType(type);
      return this._findFrankenFish(frankenSize, finned, type);
    }

    // Mutant fish (any house base/cover)
    const mutantSize = mutantFishSize(type);
    if (mutantSize > 0) {
      const finned = isFinnedMutantType(type);
      return this._findMutantFish(mutantSize, finned, type);
    }

    // Kraken fish — finned fish + forcing-chain analysis.
    if (type === SolutionType.KRAKEN_FISH ||
        type === SolutionType.KRAKEN_FISH_TYPE_1 ||
        type === SolutionType.KRAKEN_FISH_TYPE_2) {
      return this._findKrakenFish(type);
    }

    return null;
  }

  // ------------------------------------------------------------------ //
  // Core fish search                                                     //
  // ------------------------------------------------------------------ //
  private _findFish(
    size: number,
    finned: boolean,
    sashimi: boolean,
    type: typeof SolutionType[keyof typeof SolutionType]
  ): SolutionStep | null {
    for (let d = 1; d <= 9; d++) {
      // Try rows as base, cols as cover; then cols as base, rows as cover
      const step =
        this._searchFish(d, size, finned, sashimi, type, true) ||
        this._searchFish(d, size, finned, sashimi, type, false);
      if (step) return step;
    }
    return null;
  }

  private _searchFish(
    d: number,
    size: number,
    finned: boolean,
    sashimi: boolean,
    type: typeof SolutionType[keyof typeof SolutionType],
    rowBase: boolean
  ): SolutionStep | null {
    const HOUSES = Sudoku2.HOUSES;

    // Build the list of "lines" (rows 0..8 or cols 0..8) together with the
    // set of crossing-line indices where d still appears.
    // lineOccurrences[i] = sorted array of crossing-line indices
    const lineOccurrences: number[][] = [];
    for (let ln = 0; ln < 9; ln++) {
      const hIdx = rowBase ? ln : 9 + ln;
      const occ: number[] = [];
      for (const cell of HOUSES[hIdx]) {
        if (this.sudoku.values[cell] === 0 && this.sudoku.isCandidate(cell, d)) {
          occ.push(rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell));
        }
      }
      if (occ.length >= 2 && (finned ? occ.length <= size + 4 : occ.length <= size)) {
        // For finned fish the base can have more cells than cover columns
        lineOccurrences.push(occ);
      } else if (finned && occ.length >= 2) {
        lineOccurrences.push(occ);
      } else if (!finned && occ.length >= 2 && occ.length <= size) {
        lineOccurrences.push(occ);
      }
      // overwritten above, simplify:
    }
    // Rebuild cleanly
    const eligibleLines: { ln: number; occ: number[] }[] = [];
    for (let ln = 0; ln < 9; ln++) {
      const hIdx = rowBase ? ln : 9 + ln;
      const occ: number[] = [];
      for (const cell of HOUSES[hIdx]) {
        if (this.sudoku.values[cell] === 0 && this.sudoku.isCandidate(cell, d)) {
          occ.push(rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell));
        }
      }
      if (occ.length >= 2) eligibleLines.push({ ln, occ });
    }

    // Try all combinations of size lines
    for (const baseCombo of kCombos(eligibleLines, size)) {
      const baseLines = baseCombo.map(e => e.ln);

      // Union of crossing positions across all base lines
      const allCrossing = new Set<number>();
      for (const e of baseCombo) { for (const c of e.occ) allCrossing.add(c); }

      if (!finned) {
        // Basic fish: union must equal exactly size
        if (allCrossing.size !== size) continue;

        const coverCols = [...allCrossing];
        const toDelete = this._basicFishElims(d, baseLines, coverCols, rowBase);
        if (toDelete.length > 0) {
          return {
            type, placements: [], candidatesToDelete: toDelete,
            baseEntities: baseLines.map(ln => (rowBase
              ? { type: 'row' as const, index: ln }
              : { type: 'col' as const, index: ln })),
            coverEntities: coverCols.map(ln => (rowBase
              ? { type: 'col' as const, index: ln }
              : { type: 'row' as const, index: ln })),
          };
        }
      } else {
        // Finned fish: look for size-subset of the crossing positions that
        // cover all base line cells; remaining are fins.
        if (allCrossing.size < size || allCrossing.size > size + 4) continue;

        // Try all size-subsets of allCrossing as cover cols
        const crossArr = [...allCrossing];
        for (const coverCombo of kCombos(crossArr, size)) {
          const coverSet = new Set(coverCombo);

          // Find fin cells: cells in base lines NOT in a cover column
          const finCells: number[] = [];
          let valid = true;
          for (const e of baseCombo) {
            const notCovered = e.occ.filter(c => !coverSet.has(c));
            if (notCovered.length === 0) continue;
            // All fin cells must be in the same box
            for (const c of notCovered) {
              const hIdx2 = rowBase ? e.ln : 9 + e.ln;
              for (const cell of HOUSES[hIdx2]) {
                if (this.sudoku.values[cell] !== 0 || !this.sudoku.isCandidate(cell, d)) continue;
                const crossIdx = rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell);
                if (crossIdx === c) finCells.push(cell);
              }
            }
          }
          if (finCells.length === 0) continue;

          // All fins must be in the same box
          const finBox = Sudoku2.box(finCells[0]);
          if (!finCells.every(f => Sudoku2.box(f) === finBox)) continue;

          // Sashimi check: a finned fish is sashimi when at least one base
          // line has ≤ 1 covered candidate (i.e. after removing fins it only
          // has 0-1 cells in the cover columns).
          let isSashimi = false;
          for (const e of baseCombo) {
            if (e.occ.filter(c => coverSet.has(c)).length <= 1) {
              isSashimi = true;
              break;
            }
          }
          if (isSashimi !== sashimi) continue;

          // Get eliminations: cells that (a) the unfinned fish would delete
          //                               (b) see all fins
          const basicElims = this._basicFishElims(d, baseLines, coverCombo, rowBase);
          if (basicElims.length === 0) continue;

          const toDelete = basicElims.filter(c => {
            return finCells.every(f => Sudoku2.BUDDIES[c.index].includes(f));
          });
          if (toDelete.length > 0) {
            return {
              type, placements: [], candidatesToDelete: toDelete,
              fins: finCells.map(c => ({ index: c, value: d as Digit })),
              baseEntities: baseLines.map(ln => (rowBase
                ? { type: 'row' as const, index: ln }
                : { type: 'col' as const, index: ln })),
              coverEntities: coverCombo.map(ln => (rowBase
                ? { type: 'col' as const, index: ln }
                : { type: 'row' as const, index: ln })),
            };
          }
        }
      }
    }
    return null;
  }

  private _basicFishElims(
    d: number,
    baseLines: number[],
    coverLines: number[],
    rowBase: boolean
  ): { index: number; value: Digit }[] {
    const HOUSES = Sudoku2.HOUSES;
    const baseSet = new Set(baseLines);
    const toDelete: { index: number; value: Digit }[] = [];

    for (const cl of coverLines) {
      const hIdx = rowBase ? 9 + cl : cl;  // cover is cols when rowBase, rows when !rowBase
      for (const cell of HOUSES[hIdx]) {
        if (this.sudoku.values[cell] !== 0 || !this.sudoku.isCandidate(cell, d)) continue;
        const baseLine = rowBase ? Sudoku2.row(cell) : Sudoku2.col(cell);
        if (baseSet.has(baseLine)) continue; // part of base
        toDelete.push({ index: cell, value: d as Digit });
      }
    }
    return toDelete;
  }

  // ── Franken fish ─────────────────────────────────────────────────────────
  //
  // Base sets: k rows XOR k columns (not boxes).
  // Cover sets: any k houses from all 27 (rows, cols, boxes),
  //             must include at least 1 box to distinguish from basic fish.
  // Finned variant: fins (base cells not in any cover) must be in ≤1 box.
  // ---------------------------------------------------------------------------

  private _findFrankenFish(
    size: number,
    finned: boolean,
    type: typeof SolutionType[keyof typeof SolutionType]
  ): SolutionStep | null {
    // Limited to size ≤ 4 for performance (size ≥ 5 has enormous search space).
    if (size > 4) return null;
    for (let d = 1; d <= 9; d++) {
      const step = this._searchGeneralFish(d, size, finned, type, 'franken');
      if (step) return step;
    }
    return null;
  }

  // ── Mutant fish ───────────────────────────────────────────────────────────
  //
  // Base and cover can use any mix of rows, cols, and boxes.
  // Must not be reducible to a basic or Franken fish.
  // Limited to size ≤ 3 for performance (size ≥ 4 has enormous search space).
  // ---------------------------------------------------------------------------

  private _findMutantFish(
    size: number,
    finned: boolean,
    type: typeof SolutionType[keyof typeof SolutionType]
  ): SolutionStep | null {
    // Limit search to manageable sizes.
    if (size > 3) return null;
    for (let d = 1; d <= 9; d++) {
      const step = this._searchGeneralFish(d, size, finned, type, 'mutant');
      if (step) return step;
    }
    return null;
  }

  // ── General fish search (Franken or Mutant) ───────────────────────────────
  //
  // fishKind: 'franken' → base must be all rows OR all cols;
  //                        cover must include ≥1 box.
  //           'mutant'  → base may include boxes; cover may be any mix;
  //                        base must not be "all rows" or "all cols"
  //                        (those cases are handled by Franken).
  // ---------------------------------------------------------------------------

  private _searchGeneralFish(
    d: number,
    size: number,
    finned: boolean,
    type: typeof SolutionType[keyof typeof SolutionType],
    fishKind: 'franken' | 'mutant'
  ): SolutionStep | null {
    const s = this.sudoku;

    // Pre-compute cells with d in each house.
    const hCells: number[][] = Array.from({ length: 27 }, (_, h) =>
      (Sudoku2.HOUSES[h] as readonly number[]).filter(
        c => s.values[c] === 0 && s.isCandidate(c, d),
      ),
    );

    // Build base pool.
    let basePool: number[];
    if (fishKind === 'franken') {
      // Rows (0-8) and cols (9-17) as separate base types; try each in turn.
      basePool = []; // will be handled by two passes below
    } else {
      // Mutant: any of the 27 houses.
      basePool = Array.from({ length: 27 }, (_, i) => i)
        .filter(h => hCells[h].length >= 1);
    }

    const allHouses = Array.from({ length: 27 }, (_, i) => i)
      .filter(h => hCells[h].length >= 1);

    const toEntity = (h: number): EntityRef =>
      h < 9  ? { type: 'row', index: h } :
      h < 18 ? { type: 'col', index: h - 9 } :
               { type: 'box', index: h - 18 };

    const doSearch = (bPool: number[]): SolutionStep | null => {
      for (const baseComb of kCombos(bPool, size)) {
        // Franken: at least one cover must be a box.
        // Mutant: allow any cover, but base must not be all-row or all-col
        //         (handled by filtering bPool for mutant).

        // Compute base_cells.
        const baseCells = new Set<number>();
        for (const h of baseComb) for (const c of hCells[h]) baseCells.add(c);
        if (baseCells.size === 0) continue;

        // Cover pool: all houses not in base that have d-candidates.
        const baseSet = new Set(baseComb);
        const coverPool = allHouses.filter(h => !baseSet.has(h));

        for (const coverComb of kCombos(coverPool, size)) {
          // Franken constraint: at least one box (h >= 18) in cover.
          if (fishKind === 'franken' && !coverComb.some(h => h >= 18)) continue;
          // Mutant constraint: at least one box in base OR cover.
          if (fishKind === 'mutant' && !baseComb.some(h => h >= 18) &&
              !coverComb.some(h => h >= 18)) continue;

          const coverCells = new Set<number>();
          for (const h of coverComb) for (const c of hCells[h]) coverCells.add(c);

          if (!finned) {
            // Unfinned: base_cells ⊆ cover_cells.
            if (![...baseCells].every(c => coverCells.has(c))) continue;
            const elims = [...coverCells].filter(
              c => !baseCells.has(c) && s.values[c] === 0 && s.isCandidate(c, d),
            );
            if (elims.length > 0) {
              return {
                type, placements: [],
                candidatesToDelete: elims.map(c => ({ index: c, value: d as Digit })),
                baseEntities: baseComb.map(toEntity),
                coverEntities: coverComb.map(toEntity),
              };
            }
          } else {
            // Finned: fins = base_cells \ cover_cells; must be non-empty, all in same box.
            const fins = [...baseCells].filter(c => !coverCells.has(c));
            if (fins.length === 0) continue;
            const finBox = Sudoku2.box(fins[0]);
            if (!fins.every(f => Sudoku2.box(f) === finBox)) continue;
            // Elims: in cover, not in base, in fin box.
            const elims = [...coverCells].filter(
              c => !baseCells.has(c) && s.values[c] === 0 && s.isCandidate(c, d) &&
                   Sudoku2.box(c) === finBox,
            );
            if (elims.length > 0) {
              return {
                type, placements: [],
                candidatesToDelete: elims.map(c => ({ index: c, value: d as Digit })),
                fins: fins.map(c => ({ index: c, value: d as Digit })),
                baseEntities: baseComb.map(toEntity),
                coverEntities: coverComb.map(toEntity),
              };
            }
          }
        }
      }
      return null;
    };

    if (fishKind === 'franken') {
      // Try rows as base (0-8), then cols (9-17).
      const rowBase = Array.from({ length: 9 }, (_, r) => r).filter(h => hCells[h].length >= 1);
      const colBase = Array.from({ length: 9 }, (_, c) => 9 + c).filter(h => hCells[h].length >= 1);
      return doSearch(rowBase) ?? doSearch(colBase);
    } else {
      // Mutant: exclude combinations that are all-row or all-col (those are handled by Franken).
      // The box-in-base-or-cover constraint handles this in doSearch.
      return doSearch(basePool);
    }
  }

  // ── Kraken fish ───────────────────────────────────────────────────────────
  //
  // Extends finned basic fish (size 2-4) using forcing-chain analysis:
  // a target candidate T is eliminated when, for every fin cell f, placing
  // digit d in f forces d to be removed from T via a chain (ON → OFF).
  //
  // Only Type 1 is implemented (fin-based Kraken).  Type 2 (missed-base)
  // returns null for now.
  // ---------------------------------------------------------------------------

  private _findKrakenFish(
    type: typeof SolutionType[keyof typeof SolutionType],
  ): SolutionStep | null {
    if (!this._tabling) return null;
    if (type === SolutionType.KRAKEN_FISH_TYPE_2) return null;

    const s = this.sudoku;
    const HOUSES = Sudoku2.HOUSES;

    for (let d = 1; d <= 9; d++) {
      for (let size = 2; size <= 4; size++) {
        // Try rows as base, cols as cover; then cols as base, rows as cover
        for (const rowBase of [true, false]) {
          const eligibleLines: { ln: number; occ: number[] }[] = [];
          for (let ln = 0; ln < 9; ln++) {
            const hIdx = rowBase ? ln : 9 + ln;
            const occ: number[] = [];
            for (const cell of HOUSES[hIdx]) {
              if (s.values[cell] === 0 && s.isCandidate(cell, d)) {
                occ.push(rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell));
              }
            }
            if (occ.length >= 2) eligibleLines.push({ ln, occ });
          }

          for (const baseCombo of kCombos(eligibleLines, size)) {
            const baseLines = baseCombo.map(e => e.ln);

            const allCrossing = new Set<number>();
            for (const e of baseCombo) for (const c of e.occ) allCrossing.add(c);
            if (allCrossing.size < size || allCrossing.size > size + 4) continue;

            const crossArr = [...allCrossing];
            for (const coverCombo of kCombos(crossArr, size)) {
              const coverSet = new Set(coverCombo);

              // Find fin cells
              const finCells: number[] = [];
              for (const e of baseCombo) {
                const hIdx = rowBase ? e.ln : 9 + e.ln;
                for (const cell of HOUSES[hIdx]) {
                  if (s.values[cell] !== 0 || !s.isCandidate(cell, d)) continue;
                  const crossIdx = rowBase ? Sudoku2.col(cell) : Sudoku2.row(cell);
                  if (!coverSet.has(crossIdx)) finCells.push(cell);
                }
              }
              if (finCells.length === 0) continue;

              // Collect targets: in cover lines, not in base lines, still have d
              const baseLineSet = new Set(baseLines);
              const toElim: number[] = [];
              for (const cl of coverCombo) {
                const hIdx = rowBase ? 9 + cl : cl;
                for (const cell of HOUSES[hIdx]) {
                  if (s.values[cell] !== 0 || !s.isCandidate(cell, d)) continue;
                  const baseLine = rowBase ? Sudoku2.row(cell) : Sudoku2.col(cell);
                  if (baseLineSet.has(baseLine)) continue;  // part of base
                  // Skip cells already eliminated by normal finned fish
                  const finBox = Sudoku2.box(finCells[0]);
                  if (finCells.every(f => Sudoku2.box(f) === finBox) &&
                      finCells.every(f => Sudoku2.BUDDIES[cell].includes(f))) continue;
                  // Kraken check: from every fin (ON premise), does d get forced off this cell?
                  if (this._tabling!.krakenCheck(finCells, d, cell)) {
                    toElim.push(cell);
                  }
                }
              }
              if (toElim.length > 0) {
                const retType = type === SolutionType.KRAKEN_FISH
                  ? SolutionType.KRAKEN_FISH_TYPE_1 : type;
                return {
                  type: retType,
                  placements: [],
                  candidatesToDelete: toElim.map(c => ({ index: c, value: d as Digit })),
                  fins: finCells.map(c => ({ index: c, value: d as Digit })),
                  baseEntities: baseLines.map(ln => (rowBase
                    ? { type: 'row' as const, index: ln }
                    : { type: 'col' as const, index: ln })),
                  coverEntities: coverCombo.map(ln => (rowBase
                    ? { type: 'col' as const, index: ln }
                    : { type: 'row' as const, index: ln })),
                };
              }
            }
          }
        }
      }
    }
    return null;
  }
}

function fishSize(type: typeof SolutionType[keyof typeof SolutionType]): number {
  switch (type) {
    case SolutionType.X_WING:
    case SolutionType.FINNED_X_WING:
    case SolutionType.SASHIMI_X_WING: return 2;
    case SolutionType.SWORDFISH:
    case SolutionType.FINNED_SWORDFISH:
    case SolutionType.SASHIMI_SWORDFISH: return 3;
    case SolutionType.JELLYFISH:
    case SolutionType.FINNED_JELLYFISH:
    case SolutionType.SASHIMI_JELLYFISH: return 4;
    case SolutionType.SQUIRMBAG:
    case SolutionType.FINNED_SQUIRMBAG:
    case SolutionType.SASHIMI_SQUIRMBAG: return 5;
    case SolutionType.WHALE:
    case SolutionType.FINNED_WHALE:
    case SolutionType.SASHIMI_WHALE: return 6;
    case SolutionType.LEVIATHAN:
    case SolutionType.FINNED_LEVIATHAN:
    case SolutionType.SASHIMI_LEVIATHAN: return 7;
    default: return 0;
  }
}

function isFinnedType(type: typeof SolutionType[keyof typeof SolutionType]): boolean {
  return type === SolutionType.FINNED_X_WING ||
    type === SolutionType.FINNED_SWORDFISH ||
    type === SolutionType.FINNED_JELLYFISH ||
    type === SolutionType.FINNED_SQUIRMBAG ||
    type === SolutionType.FINNED_WHALE ||
    type === SolutionType.FINNED_LEVIATHAN;
}

function isSashimiType(type: typeof SolutionType[keyof typeof SolutionType]): boolean {
  return type === SolutionType.SASHIMI_X_WING ||
    type === SolutionType.SASHIMI_SWORDFISH ||
    type === SolutionType.SASHIMI_JELLYFISH ||
    type === SolutionType.SASHIMI_SQUIRMBAG ||
    type === SolutionType.SASHIMI_WHALE ||
    type === SolutionType.SASHIMI_LEVIATHAN;
}

function frankenFishSize(type: typeof SolutionType[keyof typeof SolutionType]): number {
  switch (type) {
    case SolutionType.FRANKEN_X_WING:
    case SolutionType.FINNED_FRANKEN_X_WING:        return 2;
    case SolutionType.FRANKEN_SWORDFISH:
    case SolutionType.FINNED_FRANKEN_SWORDFISH:     return 3;
    case SolutionType.FRANKEN_JELLYFISH:
    case SolutionType.FINNED_FRANKEN_JELLYFISH:     return 4;
    case SolutionType.FRANKEN_SQUIRMBAG:
    case SolutionType.FINNED_FRANKEN_SQUIRMBAG:     return 5;
    case SolutionType.FRANKEN_WHALE:
    case SolutionType.FINNED_FRANKEN_WHALE:         return 6;
    case SolutionType.FRANKEN_LEVIATHAN:
    case SolutionType.FINNED_FRANKEN_LEVIATHAN:     return 7;
    default: return 0;
  }
}

function isFinnedFrankenType(type: typeof SolutionType[keyof typeof SolutionType]): boolean {
  return type === SolutionType.FINNED_FRANKEN_X_WING    ||
         type === SolutionType.FINNED_FRANKEN_SWORDFISH ||
         type === SolutionType.FINNED_FRANKEN_JELLYFISH ||
         type === SolutionType.FINNED_FRANKEN_SQUIRMBAG ||
         type === SolutionType.FINNED_FRANKEN_WHALE      ||
         type === SolutionType.FINNED_FRANKEN_LEVIATHAN;
}

function mutantFishSize(type: typeof SolutionType[keyof typeof SolutionType]): number {
  switch (type) {
    case SolutionType.MUTANT_X_WING:
    case SolutionType.FINNED_MUTANT_X_WING:         return 2;
    case SolutionType.MUTANT_SWORDFISH:
    case SolutionType.FINNED_MUTANT_SWORDFISH:      return 3;
    case SolutionType.MUTANT_JELLYFISH:
    case SolutionType.FINNED_MUTANT_JELLYFISH:      return 4;
    case SolutionType.MUTANT_SQUIRMBAG:
    case SolutionType.FINNED_MUTANT_SQUIRMBAG:      return 5;
    case SolutionType.MUTANT_WHALE:
    case SolutionType.FINNED_MUTANT_WHALE:          return 6;
    case SolutionType.MUTANT_LEVIATHAN:
    case SolutionType.FINNED_MUTANT_LEVIATHAN:      return 7;
    default: return 0;
  }
}

function isFinnedMutantType(type: typeof SolutionType[keyof typeof SolutionType]): boolean {
  return type === SolutionType.FINNED_MUTANT_X_WING    ||
         type === SolutionType.FINNED_MUTANT_SWORDFISH ||
         type === SolutionType.FINNED_MUTANT_JELLYFISH ||
         type === SolutionType.FINNED_MUTANT_SQUIRMBAG ||
         type === SolutionType.FINNED_MUTANT_WHALE      ||
         type === SolutionType.FINNED_MUTANT_LEVIATHAN;
}

function* kCombos<T>(arr: T[], k: number, start = 0): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= arr.length - k; i++) {
    for (const rest of kCombos(arr, k - 1, i + 1)) {
      yield [arr[i], ...rest];
    }
  }
}
