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
// ChainSolver — mirrors solver/ChainSolver.java
// Handles: X-Chain, XY-Chain, Remote Pair, Turbot Fish.
//
// All four techniques search for alternating strong/weak chains of candidates.
// Strong link: digit d appears exactly twice in some house (only those two cells
//              can be d → if one is false, the other must be true).
// Weak link:   two cells share a house and both have d as candidate.
//
// Chain semantics: if the start is FALSE, propagating along strong links
// gives us that the end is TRUE (odd-length chain). Any candidate that sees
// BOTH ends must therefore be FALSE.
// ---------------------------------------------------------------------------

export class ChainSolver extends AbstractSolver {
  override getStep(type: SolutionType): SolutionStep | null {
    switch (type) {
      case SolutionType.REMOTE_PAIR: return this._findRemotePair();
      case SolutionType.X_CHAIN:    return this._findXChain();
      case SolutionType.XY_CHAIN:   return this._findXYChain();
      default: return null;
    }
  }

  // ── X-Chain ──────────────────────────────────────────────────────────────
  // Alternating chain of strong/weak links for a single digit d.
  // Minimum length: 3 links (= 4 nodes: A -s- B -w- C -s- D).
  // End condition: start and end connected by strong links at both ends.
  // Elimination: cells seeing both A and D have d removed.

  private _findXChain(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;
    const HOUSES = Sudoku2.HOUSES;

    for (let d = 1; d <= 9; d++) {
      // Build strong links: pairs of cells with exactly 2 occurrences in a house
      const strongPairs: [number, number][] = [];
      for (const house of HOUSES) {
        const cells = house.filter(c => values[c] === 0 && (candidates[c] & (1 << d)));
        if (cells.length === 2) strongPairs.push([cells[0], cells[1]]);
      }

      // Build per-cell adjacency for STRONG links (deduped)
      const strongAdj = new Map<number, Set<number>>();
      for (const [a, b] of strongPairs) {
        if (!strongAdj.has(a)) strongAdj.set(a, new Set());
        if (!strongAdj.has(b)) strongAdj.set(b, new Set());
        strongAdj.get(a)!.add(b);
        strongAdj.get(b)!.add(a);
      }

      // DFS: start from each cell in a strong link.
      // Chain alternates: strong, weak, strong, weak, ...
      // Chain must end on a strong link (length >= 3).
      for (const startCell of strongAdj.keys()) {
        const step = this._xChainDFS(d, startCell, strongAdj, values, candidates, BUDDIES);
        if (step) return { type: SolutionType.X_CHAIN, placements: [], candidatesToDelete: step };
      }
    }
    return null;
  }

  private _xChainDFS(
    d: number, start: number,
    strongAdj: Map<number, Set<number>>,
    values: number[], candidates: number[],
    BUDDIES: readonly (readonly number[])[],
  ): Candidate[] | null {
    const chain: number[] = [start];
    const visited = new Set<number>([start]);

    const MAX_CHAIN = 12; // cap to avoid exponential blowup
    const dfs = (cell: number, nextIsStrong: boolean): Candidate[] | null => {
      if (chain.length >= MAX_CHAIN) return null;
      if (nextIsStrong) {
        // Next link must be a strong link
        for (const next of (strongAdj.get(cell) ?? [])) {
          if (visited.has(next)) continue;
          chain.push(next);
          visited.add(next);
          // Valid end: chain has >=4 nodes (>=3 links) starting and ending strong
          if (chain.length >= 4) {
            const del = _commonBuddyElims(start, next, d, values, candidates, BUDDIES);
            if (del.length) return del;
          }
          const res = dfs(next, false);
          if (res) return res;
          chain.pop();
          visited.delete(next);
        }
      } else {
        // Next link is weak: any cell sharing a house
        for (const next of BUDDIES[cell]) {
          if (visited.has(next)) continue;
          if (values[next] !== 0) continue;
          if (!(candidates[next] & (1 << d))) continue;
          chain.push(next);
          visited.add(next);
          const res = dfs(next, true);
          if (res) return res;
          chain.pop();
          visited.delete(next);
        }
      }
      return null;
    };

    return dfs(start, true);
  }

  // ── XY-Chain ──────────────────────────────────────────────────────────────
  // Chain of bivalue cells. Entry into a cell is via one candidate;
  // exit is via the other (strong link within the cell).
  // When start-candidate equals end-candidate, eliminate it from cells
  // seeing both endpoints.

  private _findXYChain(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    const biCells: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (values[i] === 0 && this.sudoku.candidateCount(i) === 2) biCells.push(i);
    }

    for (const start of biCells) {
      const startMask = candidates[start];
      let sc1 = 0, sc2 = 0;
      for (let d = 1; d <= 9; d++) {
        if (startMask & (1 << d)) { if (!sc1) sc1 = d; else sc2 = d; }
      }

      // Try each starting candidate as the "entry" candidate at start
      for (const [entryD, exitD] of [[sc1, sc2], [sc2, sc1]] as [number, number][]) {
        // Start: we "enter" with entryD, which means entryD is false at start.
        // So we exit with exitD (strong within-cell link).
        const chain = [start];
        const visited = new Set([start]);
        const res = this._xyChainDFS(start, exitD, entryD, chain, visited, biCells, values, candidates, BUDDIES);
        if (res) return { type: SolutionType.XY_CHAIN, placements: [], candidatesToDelete: res };
      }
    }
    return null;
  }

  /** DFS for XY-Chain.
   * @param cell       Current cell
   * @param curD       Candidate we are "carrying out" of cell (to propagate)
   * @param startD     The candidate we started with (elimination target)
   * @param chain      Current path
   * @param visited    Visited cells
   */
  private _xyChainDFS(
    cell: number, curD: number, startD: number,
    chain: number[], visited: Set<number>,
    biCells: number[], values: number[], candidates: number[],
    BUDDIES: readonly (readonly number[])[],
  ): Candidate[] | null {
    if (chain.length >= 10) return null; // cap to avoid exponential blowup
    // Look for a bivalue neighbour that has curD as a candidate
    for (const next of biCells) {
      if (visited.has(next)) continue;
      if (!(candidates[next] & (1 << curD))) continue;
      if (!BUDDIES[cell].includes(next)) continue;
      // Enter next with curD; exit with the other candidate
      let exitD = 0;
      const nm = candidates[next];
      for (let d = 1; d <= 9; d++) {
        if ((nm & (1 << d)) && d !== curD) { exitD = d; break; }
      }
      if (!exitD) continue;

      chain.push(next);
      visited.add(next);

      // Check: if chain has >=3 nodes and exitD === startD, we have a valid chain
      if (chain.length >= 3 && exitD === startD) {
        const del = _commonBuddyElims(chain[0], next, startD, values, candidates, BUDDIES);
        if (del.length) return del;
      }

      const res = this._xyChainDFS(next, exitD, startD, chain, visited, biCells, values, candidates, BUDDIES);
      if (res) return res;

      chain.pop();
      visited.delete(next);
    }
    return null;
  }

  // ── Remote Pair ────────────────────────────────────────────────────────────
  // All chain cells have the SAME bivalue pair {c1,c2}.
  // Cells alternate c1/c2 as we follow the chain.  Any cell that sees two
  // chain cells at DIFFERENT parities (one even-indexed, one odd-indexed) must
  // be neither c1 nor c2, because in every possible chain assignment one of
  // those two is the solved value at each endpoint.

  private _findRemotePair(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    // Collect bivalue pairs
    const byPair = new Map<number, number[]>(); // mask -> cells
    for (let i = 0; i < 81; i++) {
      if (values[i] !== 0) continue;
      const cnt = this.sudoku.candidateCount(i);
      if (cnt !== 2) continue;
      const mask = candidates[i];
      if (!byPair.has(mask)) byPair.set(mask, []);
      byPair.get(mask)!.push(i);
    }

    for (const [mask, cells] of byPair) {
      if (cells.length < 4) continue;
      let c1 = 0, c2 = 0;
      for (let d = 1; d <= 9; d++) {
        if (mask & (1 << d)) { if (!c1) c1 = d; else c2 = d; }
      }

      // Build chain: DFS through these cells via buddy connections
      const chainResult = this._remotePairDFS(cells, BUDDIES, values, candidates, c1, c2);
      if (chainResult) return { type: SolutionType.REMOTE_PAIR, placements: [], candidatesToDelete: chainResult };
    }
    return null;
  }

  private _remotePairDFS(
    cells: number[],
    BUDDIES: readonly (readonly number[])[],
    values: number[], candidates: number[],
    c1: number, c2: number,
  ): Candidate[] | null {
    for (const start of cells) {
      const chain = [start];
      const visited = new Set([start]);

      const dfs = (cell: number): Candidate[] | null => {
        for (const next of cells) {
          if (visited.has(next)) continue;
          if (!BUDDIES[cell].includes(next)) continue;
          chain.push(next);
          visited.add(next);

          // Two chain cells at DIFFERENT parities (j - i is odd) form a valid
          // elimination pattern: any cell seeing both must be neither c1 nor c2
          // because in both possible chain assignments, one of the two endpoints
          // holds the value that would conflict with the victim cell.
          if (chain.length >= 4) {
            const j = chain.length - 1; // index of newly added 'next'
            for (let i = j - 1; i >= 0; i -= 2) {
              // (j - i) is odd → different parities
              const del: { index: number; value: Digit }[] = [];
              for (const victim of BUDDIES[chain[i]]) {
                if (visited.has(victim)) continue;
                if (values[victim] !== 0) continue;
                if (!BUDDIES[chain[j]].includes(victim)) continue;
                if (candidates[victim] & (1 << c1))
                  del.push({ index: victim, value: c1 as Digit });
                if (candidates[victim] & (1 << c2))
                  del.push({ index: victim, value: c2 as Digit });
              }
              if (del.length) return del;
            }
          }

          const res = dfs(next);
          if (res) return res;
          chain.pop();
          visited.delete(next);
        }
        return null;
      };

      const res = dfs(start);
      if (res) return res;
    }
    return null;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function _commonBuddyElims(
  a: number, b: number, d: number,
  values: number[], candidates: number[],
  BUDDIES: readonly (readonly number[])[],
): Candidate[] {
  const del: Candidate[] = [];
  for (const cell of BUDDIES[a]) {
    if (cell === b) continue;
    if (values[cell] !== 0) continue;
    if (!(candidates[cell] & (1 << d))) continue;
    if (!BUDDIES[b].includes(cell)) continue;
    del.push({ index: cell, value: d as Digit });
  }
  return del;
}
