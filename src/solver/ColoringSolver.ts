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
      case SolutionType.SIMPLE_COLORS: return this._findSimpleColors();
      case SolutionType.MULTI_COLORS:  return this._findMultiColors();
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

  private _findSimpleColors(): SolutionStep | null {
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
              return { type: SolutionType.SIMPLE_COLORS, placements: [], candidatesToDelete: del };
            }
            void oppCells;
          }
        }

        // Rule 2: Color Trap — uncolored cell sees BOTH colors.
        const allColored = new Set([...c0, ...c1]);
        for (let cell = 0; cell < 81; cell++) {
          if (values[cell] !== 0) continue;
          if (!(candidates[cell] & (1 << d))) continue;
          if (allColored.has(cell)) continue;
          const buddies = BUDDIES[cell];
          const seesC0 = c0.some(c => buddies.includes(c));
          const seesC1 = c1.some(c => buddies.includes(c));
          if (seesC0 && seesC1) {
            return {
              type: SolutionType.SIMPLE_COLORS,
              placements: [],
              candidatesToDelete: [{ index: cell, value: d as Digit }],
            };
          }
        }
      }
    }
    return null;
  }

  // ── Multi-Colors ─────────────────────────────────────────────────────────

  private _findMultiColors(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    for (let d = 1; d <= 9; d++) {
      const components = this._buildComponents(d);

      for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
          const [a0, a1] = components[i];
          const [b0, b1] = components[j];

          // Try all 4 orientation combos of the two components
          for (const [colorA, oppA] of [[a0, a1], [a1, a0]] as [number[], number[]][]) {
            for (const [colorB, oppB] of [[b0, b1], [b1, b0]] as [number[], number[]][]) {
              // Type 2: some cell of colorA sees BOTH colorB and oppB —
              // means colorA can't be true, eliminate all d from colorA
              const typeTwo = colorA.some(cA =>
                colorB.some(cB => BUDDIES[cA].includes(cB)) &&
                oppB.some(cOpp => BUDDIES[cA].includes(cOpp))
              );
              if (typeTwo) {
                const del: Candidate[] = colorA
                  .filter(c => values[c] === 0 && (candidates[c] & (1 << d)))
                  .map(c => ({ index: c, value: d as Digit }));
                if (del.length) {
                  return { type: SolutionType.MULTI_COLORS, placements: [], candidatesToDelete: del };
                }
              }

              // Type 1: some cell of colorA sees some cell of colorB.
              // Then oppA and oppB can't both be false, so cells seeing
              // BOTH oppA and oppB can have d eliminated.
              const hasLink = colorA.some(cA => colorB.some(cB => BUDDIES[cA].includes(cB)));
              if (hasLink) {
                const del: Candidate[] = [];
                for (let cell = 0; cell < 81; cell++) {
                  if (values[cell] !== 0) continue;
                  if (!(candidates[cell] & (1 << d))) continue;
                  const buddies = BUDDIES[cell];
                  if (oppA.some(c => buddies.includes(c)) &&
                      oppB.some(c => buddies.includes(c))) {
                    del.push({ index: cell, value: d as Digit });
                  }
                }
                if (del.length) {
                  return { type: SolutionType.MULTI_COLORS, placements: [], candidatesToDelete: del };
                }
              }
            }
          }
        }
      }
    }
    return null;
  }
}
