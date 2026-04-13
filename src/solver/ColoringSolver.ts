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

import type { SolutionStep } from "../Sudoku2";
import { Sudoku2 } from "../Sudoku2";
import { SolutionType } from "../SolutionType";
import type { Candidate, Digit } from "../types";
import { AbstractSolver } from "./AbstractSolver";

// ---------------------------------------------------------------------------
// ColoringSolver — mirrors solver/ColoringSolver.java
// Handles: Simple Colors (Wrap/Trap), Multi-Colors (Type 1/2).
//
// Coloring works on the conjugate-pair graph: two cells that are the ONLY
// two occurrences of a digit in some house are connected by a strong link.
// Connected components of the strong-link graph are 2-colorable; alternate
// colors represent "if A is the solution, B is not" and vice versa.
// ---------------------------------------------------------------------------

export class ColoringSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    switch (type) {
      case SolutionType.SIMPLE_COLORS:
      case SolutionType.SIMPLE_COLORS_TRAP:
      case SolutionType.SIMPLE_COLORS_WRAP:  return this._findSimpleColors(type);
      case SolutionType.MULTI_COLORS:
      case SolutionType.MULTI_COLORS_1:
      case SolutionType.MULTI_COLORS_2:      return this._findMultiColors(type);
      default: return null;
    }
  }

  // ── Coloring infrastructure ─────────────────────────────────────────────

  /**
   * Builds all 2-colored components for digit d.
   * Returns an array of components; each component is [color0cells, color1cells].
   * color[0] and color[1] are the two opposing sets.
   */
  private _buildComponents(d: number): [number[], number[]][] {
    const { values, candidates } = this.sudoku;
    const HOUSES = Sudoku2.HOUSES;
    const BUDDIES = Sudoku2.BUDDIES;

    // Build adjacency: conjugate pairs
    const adj = new Map<number, number[]>(); // cell -> strongly-linked cells
    for (const house of HOUSES) {
      const cells = house.filter(c => values[c] === 0 && (candidates[c] & (1 << d)));
      if (cells.length !== 2) continue;
      const [a, b] = cells;
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      if (!adj.get(a)!.includes(b)) adj.get(a)!.push(b);
      if (!adj.get(b)!.includes(a)) adj.get(b)!.push(a);
    }

    const visited = new Set<number>();
    const components: [number[], number[]][] = [];

    for (const start of adj.keys()) {
      if (visited.has(start)) continue;
      const color: [number[], number[]] = [[], []];
      // BFS
      const queue: [number, 0 | 1][] = [[start, 0]];
      while (queue.length) {
        const [cell, c] = queue.shift()!;
        if (visited.has(cell)) continue;
        visited.add(cell);
        color[c].push(cell);
        for (const nbr of (adj.get(cell) ?? [])) {
          if (!visited.has(nbr)) queue.push([nbr, (1 - c) as 0 | 1]);
        }
      }
      if (color[0].length + color[1].length >= 2) components.push(color);
    }

    void BUDDIES; // used below in callers
    return components;
  }

  // ── Simple Colors ─────────────────────────────────────────────────────────

  private _findSimpleColors(requestedType: typeof SolutionType[keyof typeof SolutionType] = SolutionType.SIMPLE_COLORS): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    for (let d = 1; d <= 9; d++) {
      const components = this._buildComponents(d);

      for (const [c0, c1] of components) {
        // Rule 1: Color Wrap — two same-color cells see each other.
        // The other color must be the solution; eliminate ALL d from the wrapped color.
        for (const [colorCells, oppCells] of [[c0, c1], [c1, c0]] as [number[], number[]][]) {
          let wrap = false;
          outer:
          for (let i = 0; i < colorCells.length && !wrap; i++) {
            for (let j = i + 1; j < colorCells.length && !wrap; j++) {
              if (BUDDIES[colorCells[i]].includes(colorCells[j])) wrap = true;
            }
          }
          if (wrap) {
            const del: Candidate[] = colorCells
              .filter(c => values[c] === 0 && (candidates[c] & (1 << d)))
              .map(c => ({ index: c, value: d as Digit }));
            if (del.length) {
              if (requestedType === SolutionType.SIMPLE_COLORS_TRAP) continue;
              return { type: SolutionType.SIMPLE_COLORS_WRAP, placements: [], candidatesToDelete: del };
            }
            void oppCells;
          }
        }

        // Rule 2: Color Trap — uncolored cell sees BOTH colors.
        // H23: collect ALL qualifying cells before returning (match Java batch behaviour).
        const allColored = new Set([...c0, ...c1]);
        const trapDels: Candidate[] = [];
        for (let cell = 0; cell < 81; cell++) {
          if (values[cell] !== 0) continue;
          if (!(candidates[cell] & (1 << d))) continue;
          if (allColored.has(cell)) continue;
          const buddies = BUDDIES[cell];
          const seesC0 = c0.some(c => buddies.includes(c));
          const seesC1 = c1.some(c => buddies.includes(c));
          if (seesC0 && seesC1) trapDels.push({ index: cell, value: d as Digit });
        }
        if (trapDels.length > 0) {
          if (requestedType === SolutionType.SIMPLE_COLORS_WRAP) continue;
          return { type: SolutionType.SIMPLE_COLORS_TRAP, placements: [], candidatesToDelete: trapDels };
        }
      }
    }
    return null;
  }

  // ── Multi-Colors ─────────────────────────────────────────────────────────

  private _findMultiColors(requestedType: typeof SolutionType[keyof typeof SolutionType] = SolutionType.MULTI_COLORS): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    // Java accumulates victims from ALL 4 link conditions per (i,j) pair into ONE step.
    // Collect all such combined steps, sort by most-elims, return best.
    const mc1Steps: Candidate[][] = [];

    for (let d = 1; d <= 9; d++) {
      const components = this._buildComponents(d);

      for (let i = 0; i < components.length; i++) {
        for (let j = 0; j < components.length; j++) {
          if (j === i) continue;
          const [a0, a1] = components[i];
          const [b0, b1] = components[j];

          // Type 2 (MULTI_COLORS_2): if colorA sees BOTH halves of component j,
          // eliminate colorA. Java combines set11 and set12 checks into one step;
          // TS returns on first valid check for simplicity (first-found wins for Type 2).
          if (requestedType !== SolutionType.MULTI_COLORS_1) {
            // Java: checkMultiColor1(set11, set21, set22) → eliminate set11
            //       checkMultiColor1(set12, set21, set22) → eliminate set12
            // Combined into one globalStep.
            const del2: Candidate[] = [];
            const checkType2 = (colorA: number[]) => {
              const seesB0 = colorA.some(cA => b0.some(cB => BUDDIES[cA].includes(cB)));
              const seesB1 = colorA.some(cA => b1.some(cB => BUDDIES[cA].includes(cB)));
              if (seesB0 && seesB1) {
                colorA.filter(c => values[c] === 0 && (candidates[c] & (1 << d)))
                  .forEach(c => del2.push({ index: c, value: d as Digit }));
              }
            };
            checkType2(a0);
            checkType2(a1);
            if (del2.length) {
              return { type: SolutionType.MULTI_COLORS_2, placements: [], candidatesToDelete: del2 };
            }
          }

          // Type 1 (MULTI_COLORS_1): some colorA cell sees some colorB cell (link).
          // Victims: cells seeing BOTH oppA AND oppB.
          // Java checks all 4 link combos per (i,j) pair and accumulates into ONE step.
          if (requestedType !== SolutionType.MULTI_COLORS_2) {
            const del1: Candidate[] = [];
            const seen1 = new Set<number>();

            const addVictims = (oppA: number[], oppB: number[]) => {
              for (let cell = 0; cell < 81; cell++) {
                if (values[cell] !== 0 || !(candidates[cell] & (1 << d)) || seen1.has(cell)) continue;
                const buddies = BUDDIES[cell];
                if (oppA.some(c => buddies.includes(c)) && oppB.some(c => buddies.includes(c))) {
                  seen1.add(cell);
                  del1.push({ index: cell, value: d as Digit });
                }
              }
            };

            // Java: if checkMultiColor2(set11,set21) → checkCandidateToDelete(set12,set22)
            if (a0.some(cA => b0.some(cB => BUDDIES[cA].includes(cB)))) addVictims(a1, b1);
            // Java: if checkMultiColor2(set11,set22) → checkCandidateToDelete(set12,set21)
            if (a0.some(cA => b1.some(cB => BUDDIES[cA].includes(cB)))) addVictims(a1, b0);
            // Java: if checkMultiColor2(set12,set21) → checkCandidateToDelete(set11,set22)
            if (a1.some(cA => b0.some(cB => BUDDIES[cA].includes(cB)))) addVictims(a0, b1);
            // Java: if checkMultiColor2(set12,set22) → checkCandidateToDelete(set11,set21)
            if (a1.some(cA => b1.some(cB => BUDDIES[cA].includes(cB)))) addVictims(a0, b0);

            if (del1.length) mc1Steps.push(del1);
          }
        }
      }
    }

    if (mc1Steps.length === 0) return null;
    mc1Steps.sort((a, b) => b.length - a.length);
    return { type: SolutionType.MULTI_COLORS_1, placements: [], candidatesToDelete: mc1Steps[0] };
  }
}
