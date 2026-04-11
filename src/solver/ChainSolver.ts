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
// Handles: X-Chain, XY-Chain, Remote Pair.
// (Turbot Fish is handled by SingleDigitPatternSolver, matching the TS port's
//  refactoring where single-digit patterns are kept together.)
//
// All three techniques search for alternating strong/weak chains of candidates.
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
    // H16: search all digits/starts and return globally shortest chain (mirrors Java sort-by-length).
    let globalBest: { del: Candidate[]; len: number } | null = null;

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
        const result = this._xChainDFS(d, startCell, strongAdj, values, candidates, BUDDIES,
          globalBest?.len ?? 20);
        if (result && (!globalBest || result.len < globalBest.len)) {
          globalBest = result;
        }
      }
    }
    return globalBest
      ? { type: SolutionType.X_CHAIN, placements: [], candidatesToDelete: globalBest.del }
      : null;
  }

  private _xChainDFS(
    d: number, start: number,
    strongAdj: Map<number, Set<number>>,
    values: number[], candidates: number[],
    BUDDIES: readonly (readonly number[])[],
    maxLen: number, // H16: globally best chain length so far (prune threshold)
  ): { del: Candidate[]; len: number } | null {
    const chain: number[] = [start];
    const visited = new Set<number>([start]);
    let best: { del: Candidate[]; len: number } | null = null;

    const dfs = (cell: number, nextIsStrong: boolean): void => {
      const cap = best ? best.len : maxLen;
      if (chain.length >= cap) return; // H16: prune branches longer than current best
      if (nextIsStrong) {
        // Next link must be a strong link
        for (const next of (strongAdj.get(cell) ?? [])) {
          if (visited.has(next)) continue;
          chain.push(next);
          visited.add(next);
          // Valid end: chain has >=4 nodes (>=3 links) starting and ending strong
          if (chain.length >= 4) {
            const del = _commonBuddyElims(start, next, d, values, candidates, BUDDIES);
            if (del.length && (!best || chain.length < best.len)) {
              best = { del, len: chain.length };
            }
          }
          dfs(next, false);
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
          dfs(next, true);
          chain.pop();
          visited.delete(next);
        }
      }
    };

    dfs(start, true);
    return best;
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

    // Collect ALL valid XY chains, dedup by elimination key (keep shorter chain).
    // Then sort by Java's compareTo: more elims DESC, shorter chain, index sum.
    const deletesMap = new Map<string, { del: Candidate[]; chainLen: number }>();

    const dfs = (
      cell: number, curD: number, startD: number,
      chain: number[], visited: Set<number>,
    ): void => {
      if (chain.length >= 20) return; // max chain length (Java RESTRICT_CHAIN_LENGTH)
      for (const next of biCells) {
        if (visited.has(next)) continue;
        if (!(candidates[next] & (1 << curD))) continue;
        if (!BUDDIES[cell].includes(next)) continue;
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
          if (del.length) {
            const key = _elimKey(del);
            const existing = deletesMap.get(key);
            if (!existing || chain.length < existing.chainLen) {
              deletesMap.set(key, { del: [...del], chainLen: chain.length });
            }
          }
        }

        dfs(next, exitD, startD, chain, visited);
        chain.pop();
        visited.delete(next);
      }
    };

    for (const start of biCells) {
      const startMask = candidates[start];
      let sc1 = 0, sc2 = 0;
      for (let d = 1; d <= 9; d++) {
        if (startMask & (1 << d)) { if (!sc1) sc1 = d; else sc2 = d; }
      }

      // Try each starting candidate as the "entry" candidate at start
      for (const [entryD, exitD] of [[sc1, sc2], [sc2, sc1]] as [number, number][]) {
        dfs(start, exitD, entryD, [start], new Set([start]));
      }
    }
    if (deletesMap.size === 0) return null;

    // Sort by Java's compareTo: more elims DESC, shorter chain, index sum
    const results = [...deletesMap.values()];
    results.sort((a, b) => {
      const elimDiff = b.del.length - a.del.length;
      if (elimDiff !== 0) return elimDiff;
      const chainDiff = a.chainLen - b.chainLen;
      if (chainDiff !== 0) return chainDiff;
      return _indexSum(a.del) - _indexSum(b.del);
    });
    return { type: SolutionType.XY_CHAIN, placements: [], candidatesToDelete: results[0].del };
  }

  // ── Remote Pair ────────────────────────────────────────────────────────────
  // All chain cells have the SAME bivalue pair {c1,c2}.
  // Cells alternate c1/c2 as we follow the chain. Any cell that sees two
  // chain cells at DIFFERENT parities (one even-indexed, one odd-indexed) and
  // at least 3 steps apart can have both c1 and c2 eliminated.
  //
  // Java collects ALL valid chains (min 4 cells), accumulates eliminations from
  // ALL valid pairs (i,j) with diff >= 3 in each chain, then picks the step
  // with the most eliminations (breaking ties by chain length, then index sum).
  // TS mirrors this with a full DFS + sort.

  private _findRemotePair(): SolutionStep | null {
    const { values, candidates } = this.sudoku;
    const BUDDIES = Sudoku2.BUDDIES;

    // Collect bivalue pairs
    const byPair = new Map<number, number[]>(); // mask -> cells
    for (let i = 0; i < 81; i++) {
      if (values[i] !== 0 || this.sudoku.candidateCount(i) !== 2) continue;
      const mask = candidates[i];
      if (!byPair.has(mask)) byPair.set(mask, []);
      byPair.get(mask)!.push(i);
    }

    // Collect all steps from all valid chains across all bivalue pairs
    const allSteps: { del: Candidate[]; chainLen: number }[] = [];
    const deletesMap = new Map<string, number>(); // elimKey -> min chainLen seen

    for (const [mask, cells] of byPair) {
      if (cells.length < 4) continue;
      let c1 = 0, c2 = 0;
      for (let d = 1; d <= 9; d++) {
        if (mask & (1 << d)) { if (!c1) c1 = d; else c2 = d; }
      }
      this._collectRemotePairs(cells, BUDDIES, values, candidates, c1, c2, allSteps, deletesMap);
    }

    if (allSteps.length === 0) return null;

    // Sort per Java's compareTo: most eliminations first, shorter chain first,
    // smaller index sum first (for determinism).
    allSteps.sort((a, b) => {
      const sizeDiff = b.del.length - a.del.length;
      if (sizeDiff !== 0) return sizeDiff;
      const chainDiff = a.chainLen - b.chainLen;
      if (chainDiff !== 0) return chainDiff;
      return _indexSum(a.del) - _indexSum(b.del);
    });

    return { type: SolutionType.REMOTE_PAIR, placements: [], candidatesToDelete: allSteps[0].del };
  }

  private _collectRemotePairs(
    cells: number[],
    BUDDIES: readonly (readonly number[])[],
    values: number[], candidates: number[],
    c1: number, c2: number,
    allSteps: { del: Candidate[]; chainLen: number }[],
    deletesMap: Map<string, number>,
  ): void {
    for (const start of cells) {
      const chain = [start];
      const visited = new Set([start]);

      const dfs = (cell: number): void => {
        for (const next of cells) {
          if (visited.has(next) || !BUDDIES[cell].includes(next)) continue;
          chain.push(next);
          visited.add(next);

          if (chain.length >= 4) {
            // Accumulate victims from ALL valid (i,j) pairs in the chain.
            // Valid pairs: j-i >= 3 AND j-i is odd (opposite parities).
            // This matches Java:
            //   stackLevel == 7 (4 cells): checks only (chain[0], chain[3])
            //   stackLevel > 7 (5+ cells): checks all (i,j) with i even in Java
            //     and j = i+6, i+10, ..., which maps to TS diff = 3, 5, 7, ...
            const n = chain.length;
            const del: Candidate[] = [];
            const seen = new Set<string>();
            for (let ci = 0; ci < n; ci++) {
              for (let cj = ci + 3; cj < n; cj += 2) {
                for (const victim of BUDDIES[chain[ci]]) {
                  if (visited.has(victim) || values[victim] !== 0) continue;
                  if (!BUDDIES[chain[cj]].includes(victim)) continue;
                  const k1 = `${victim}/${c1}`;
                  const k2 = `${victim}/${c2}`;
                  if ((candidates[victim] & (1 << c1)) && !seen.has(k1)) {
                    seen.add(k1); del.push({ index: victim, value: c1 as Digit });
                  }
                  if ((candidates[victim] & (1 << c2)) && !seen.has(k2)) {
                    seen.add(k2); del.push({ index: victim, value: c2 as Digit });
                  }
                }
              }
            }

            if (del.length > 0) {
              // Java chain length = 2 * TS chain length (2 entries per bivalue cell)
              // stackLevel = (Java chain length) - 1 = 2*n - 1
              const stackLevel = n * 2 - 1;
              const elimKey = del.map(c => `${c.index}/${c.value}`).sort().join(',');
              const existing = deletesMap.get(elimKey);
              if (existing === undefined || existing > stackLevel) {
                deletesMap.set(elimKey, stackLevel);
                allSteps.push({ del, chainLen: stackLevel });
              }
            }
          }

          dfs(next);
          chain.pop();
          visited.delete(next);
        }
      };

      dfs(start);
    }
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

/** Build a dedup key from an elimination set (sorted cell/value pairs). */
function _elimKey(del: Candidate[]): string {
  return del.map(c => `${c.index}/${c.value}`).sort().join(',');
}

/** Java's getIndexSumme — deterministic tiebreaker for sorted candidatesToDelete. */
function _indexSum(del: Candidate[]): number {
  const sorted = [...del].sort((a, b) => a.value - b.value || a.index - b.index);
  let sum = 0;
  let offset = 1;
  for (const c of sorted) {
    sum += c.index * offset + c.value;
    offset += 80;
  }
  return sum;
}
