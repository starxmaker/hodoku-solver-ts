/*
 * hodoku-solver-ts â€” TypeScript port of HoDoKu's logical Sudoku solver.
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
// TablingSolver â€” mirrors solver/TablingSolver.java (chain-only subset)
//
// Implements Trebors Tables for:
//   â€¢ Forcing Chain Contradiction  â†’ SolutionType.FORCING_CHAIN
//   â€¢ Forcing Chain Verity         â†’ SolutionType.FORCING_CHAIN
//   â€¢ Nice Loop (Discontinuous)    â†’ SolutionType.NICE_LOOP
//
// Forcing Net is not implemented (requires look-ahead with grid cloning; the
// chain-only table already covers the same practical eliminations).
//
// Chain reconstruction for display is intentionally omitted: the TS
// SolutionStep has no chain field.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TableEntry â€” simplified version of solver/TableEntry.java
//
// Per premise (cellÃ—digit ON or OFF) we track which cells can have a digit
// SET (onSets) or DELETED (offSets) as a consequence.
// ---------------------------------------------------------------------------

const DSIZE = 10; // digit indices 1..9 (index 0 unused)

class TableEntry {
  /** The table-array index this entry lives at (cell*10+digit). Set by the solver. */
  tableIndex = 0;
  /** Whether this is an ON (true) or OFF (false) table entry. */
  isOn = false;

  // Number of conclusions recorded (0 = no implications at all for this premise)
  private _count = 0;
  /** cells that become SET to digit d. */
  readonly onSets: Set<number>[] = Array.from({ length: DSIZE }, () => new Set<number>());
  /** cells from which digit d is DELETED. */
  readonly offSets: Set<number>[] = Array.from({ length: DSIZE }, () => new Set<number>());

  /** Whether this premise exists (cell is unsolved and has the candidate). */
  get populated(): boolean { return this._count > 0; }

  reset(): void {
    this._count = 0;
    for (let d = 0; d < DSIZE; d++) {
      this.onSets[d].clear();
      this.offSets[d].clear();
    }
  }

  addSet(cell: number, d: number): boolean {
    if (this.onSets[d].has(cell)) return false;
    this.onSets[d].add(cell);
    this._count++;
    return true;
  }

  addDel(cell: number, d: number): boolean {
    if (this.offSets[d].has(cell)) return false;
    this.offSets[d].add(cell);
    this._count++;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Static pre-computed data
// ---------------------------------------------------------------------------

/** For each cell, the 3 house indices in Sudoku2.HOUSES. */
const CELL_HOUSES: readonly (readonly number[])[] = (() => {
  const ch: number[][] = Array.from({ length: 81 }, () => []);
  for (let h = 0; h < 27; h++) {
    for (const c of Sudoku2.HOUSES[h]) ch[c].push(h);
  }
  return ch;
})();

const HOUSE_CELLS = Sudoku2.HOUSES as readonly (readonly number[])[];

/** Pre-compute buddy sets for fast membership testing. */
const BUDDY_SETS: readonly Set<number>[] = Sudoku2.BUDDIES.map(b => new Set(b));

// TABLE_SIZE = 81 * 10 = 810 (index = cell*10+digit, digit 1..9)
const TABLE_SIZE = 810;

// ---------------------------------------------------------------------------
// TablingSolver
// ---------------------------------------------------------------------------

export class TablingSolver extends AbstractSolver {
  private readonly _onTable: TableEntry[] = Array.from({ length: TABLE_SIZE }, () => new TableEntry());
  private readonly _offTable: TableEntry[] = Array.from({ length: TABLE_SIZE }, () => new TableEntry());

  // â”€â”€ Public interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  override getStep(type: SolutionType): SolutionStep | null {
    switch (type) {
      case SolutionType.NICE_LOOP:
      case SolutionType.DISCONTINUOUS_NICE_LOOP:
      case SolutionType.CONTINUOUS_NICE_LOOP:
      case SolutionType.AIC:
        return this._getNiceLoop();
      case SolutionType.FORCING_CHAIN:
      case SolutionType.FORCING_CHAIN_CONTRADICTION:
      case SolutionType.FORCING_CHAIN_VERITY:
        return this._getForcingChain();
      case SolutionType.FORCING_NET:
      case SolutionType.FORCING_NET_CONTRADICTION:
      case SolutionType.FORCING_NET_VERITY:
        return this._getForcingNet();
      default:
        return null;
    }
  }

  // â”€â”€ Top-level orchestration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _getNiceLoop(): SolutionStep | null {
    this._fillTables();
    this._expandTables(this._onTable, this._offTable);
    return this._checkNiceLoops(this._onTable)
        ?? this._checkNiceLoops(this._offTable)
        ?? this._checkAics(this._offTable);
  }

  private _getForcingChain(): SolutionStep | null {
    this._fillTables();
    this._expandTables(this._onTable, this._offTable);
    return this._checkForcingChains();
  }

  private _getForcingNet(): SolutionStep | null {
    this._fillTablesForNet();
    this._expandTables(this._onTable, this._offTable);
    const step = this._checkForcingChains();
    if (!step) return null;
    if (step.type === SolutionType.FORCING_CHAIN_CONTRADICTION)
      return { ...step, type: SolutionType.FORCING_NET_CONTRADICTION };
    if (step.type === SolutionType.FORCING_CHAIN_VERITY)
      return { ...step, type: SolutionType.FORCING_NET_VERITY };
    return { ...step, type: SolutionType.FORCING_NET };
  }

  // ── fillTablesForNet() ────────────────────────────────────────────────────
  //
  // Java chainsOnly=false: clone the grid for each premise, propagate naked
  // and hidden singles, record all transitive consequences in the tables.
  // ---------------------------------------------------------------------------

  private _fillTablesForNet(): void {
    for (let i = 0; i < TABLE_SIZE; i++) {
      this._onTable[i].reset();
      this._onTable[i].tableIndex = i;
      this._onTable[i].isOn = true;
      this._offTable[i].reset();
      this._offTable[i].tableIndex = i;
      this._offTable[i].isOn = false;
    }

    const s = this.sudoku;
    const wVals  = new Uint8Array(81);
    const wCands = new Uint16Array(81);

    for (let ci = 0; ci < 81; ci++) {
      if (s.values[ci] !== 0) continue;
      const cellMask = s.candidates[ci];
      if (cellMask === 0) continue;

      for (let d = 1; d <= 9; d++) {
        if ((cellMask >> d & 1) === 0) continue;
        const ti = ci * 10 + d;

        // ON premise: place d in ci, propagate
        for (let k = 0; k < 81; k++) { wVals[k] = s.values[k]; wCands[k] = s.candidates[k]; }
        _netPropagateOn(ci, d, wVals, wCands, this._onTable[ti]);

        // OFF premise: delete d from ci, propagate
        for (let k = 0; k < 81; k++) { wVals[k] = s.values[k]; wCands[k] = s.candidates[k]; }
        _netPropagateOff(ci, d, wVals, wCands, this._offTable[ti]);
      }
    }
  }

  // â”€â”€ fillTables() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // Java chainsOnly=true branch: direct (single-step) implications only.
  // Expansion to deeper chains happens in expandTables().
  // ---------------------------------------------------------------------------

  private _fillTables(): void {
    for (let i = 0; i < TABLE_SIZE; i++) {
      this._onTable[i].reset();
      this._onTable[i].tableIndex = i;
      this._onTable[i].isOn = true;
      this._offTable[i].reset();
      this._offTable[i].tableIndex = i;
      this._offTable[i].isOn = false;
    }

    const s = this.sudoku;
    for (let ci = 0; ci < 81; ci++) {
      if (s.values[ci] !== 0) continue;
      const cellMask = s.candidates[ci];
      const cellCands = _digits(cellMask);
      if (cellCands.length === 0) continue;

      for (const d of cellCands) {
        const ti = ci * 10 + d;

        // â”€â”€ ON premise: d is SET in ci â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const on = this._onTable[ti];
        // All other candidates in cell are deleted
        for (const d2 of cellCands) {
          if (d2 !== d) on.addDel(ci, d2);
        }
        // d deleted from all peers
        for (const peer of Sudoku2.BUDDIES[ci]) {
          if (s.values[peer] === 0 && s.isCandidate(peer, d)) {
            on.addDel(peer, d);
          }
        }

        // â”€â”€ OFF premise: d is DELETED from ci â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const off = this._offTable[ti];
        // Naked single: only 1 other candidate â†’ that must be set
        const others = cellCands.filter(x => x !== d);
        if (others.length === 1) {
          off.addSet(ci, others[0]);
        }
        // Strong house links: if only 1 other position for d in a house
        for (const hIdx of CELL_HOUSES[ci]) {
          const positions = (HOUSE_CELLS[hIdx] as number[]).filter(
            c => c !== ci && s.values[c] === 0 && s.isCandidate(c, d),
          );
          if (positions.length === 1) {
            off.addSet(positions[0], d);
          }
        }
      }
    }
  }

  // â”€â”€ expandTables() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // For each conclusion already in a table, pull in the consequences of that
  // conclusion from the matching base table (BFS-style until convergence).
  //
  // Critical: we must avoid pulling the PREMISE itself back in.  The premise
  // is "d in ci is ON/OFF", so when we pull src = onTable[c*10+d] we skip c==premiseCi.
  // ---------------------------------------------------------------------------

  private _expandTables(onTable: TableEntry[], offTable: TableEntry[]): void {
    // Snapshot direct implications before any expansion so BFS sources are
    // never the live (partially-expanded) tables — prevents spurious loops.
    type SnapEntry = { cell: number; d: number; isOn: boolean };
    const onSnap:  SnapEntry[][] = Array.from({ length: TABLE_SIZE }, () => []);
    const offSnap: SnapEntry[][] = Array.from({ length: TABLE_SIZE }, () => []);

    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const on  = onTable[ti];
      const off = offTable[ti];
      for (let d = 1; d <= 9; d++) {
        for (const c of on.onSets[d])   onSnap[ti].push({ cell: c, d, isOn: true });
        for (const c of on.offSets[d])  onSnap[ti].push({ cell: c, d, isOn: false });
        for (const c of off.onSets[d])  offSnap[ti].push({ cell: c, d, isOn: true });
        for (const c of off.offSets[d]) offSnap[ti].push({ cell: c, d, isOn: false });
      }
    }

    for (const [table, snap] of [[onTable, onSnap], [offTable, offSnap]] as const) {
      for (let ti = 0; ti < TABLE_SIZE; ti++) {
        const dest = table[ti];
        if (!dest.populated) continue;

        const premiseCi = (ti / 10) | 0;
        const premiseD  = ti % 10;

        const queue: SnapEntry[] = [...snap[ti]];
        let qi = 0;
        while (qi < queue.length) {
          const { cell: c, d, isOn } = queue[qi++];
          if (c === premiseCi && d === premiseD) continue;

          const srcTi = c * 10 + d;
          const srcSnap = isOn ? onSnap[srcTi] : offSnap[srcTi];

          for (const { cell: c2, d: d2, isOn: isOn2 } of srcSnap) {
            if (isOn2) {
              if (dest.addSet(c2, d2)) queue.push({ cell: c2, d: d2, isOn: true });
            } else {
              if (dest.addDel(c2, d2)) queue.push({ cell: c2, d: d2, isOn: false });
            }
          }
        }
      }
    }
  }

  private _checkNiceLoops(tables: TableEntry[]): SolutionStep | null {
    const s = this.sudoku;
    const isOnTables = tables === this._onTable;

    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const entry = tables[ti];
      if (!entry.populated) continue;
      const ci = (ti / 10) | 0;
      const d  = ti % 10;
      if (d === 0 || s.values[ci] !== 0 || !s.isCandidate(ci, d)) continue;

      if (isOnTables) {
        // ON premise (STRONG start): chain derived something back to start cell ci
        // Case: onSets[d].has(ci) = last link STRONG, sameCand: Discontinuous, d must be placed
        //   (firstStrong && lastStrong && sameCand) -> eliminate all others from ci
        if (entry.onSets[d].has(ci)) {
          const dels: Candidate[] = s.getCandidates(ci)
            .filter(d2 => d2 !== d)
            .map(d2 => ({ index: ci, value: d2 as Digit }));
          if (dels.length > 0) return _step(SolutionType.DISCONTINUOUS_NICE_LOOP, dels);
        }
        // Case: offSets[d2].has(ci) for d2 != d: last link WEAK, diffCand
        //   (firstStrong && !lastStrong && diffCand) -> eliminate d2 from ci
        for (let d2 = 1; d2 <= 9; d2++) {
          if (d2 !== d && entry.offSets[d2].has(ci) && s.isCandidate(ci, d2)) {
            return _step(SolutionType.DISCONTINUOUS_NICE_LOOP, [{ index: ci, value: d2 as Digit }]);
          }
        }
      } else {
        // OFF premise (WEAK start): chain derived something back to start cell ci
        // Case: offSets[d].has(ci) = last link WEAK, sameCand: Discontinuous
        //   (!firstStrong && !lastStrong && sameCand) -> eliminate d from ci
        if (entry.offSets[d].has(ci) && s.isCandidate(ci, d)) {
          return _step(SolutionType.DISCONTINUOUS_NICE_LOOP, [{ index: ci, value: d as Digit }]);
        }
        // Case: onSets[d2].has(ci) for d2 != d: last link STRONG, diffCand
        //   (!firstStrong && lastStrong && diffCand) -> eliminate d (the weak/start candidate)
        for (let d2 = 1; d2 <= 9; d2++) {
          if (d2 !== d && entry.onSets[d2].has(ci) && s.isCandidate(ci, d)) {
            return _step(SolutionType.DISCONTINUOUS_NICE_LOOP, [{ index: ci, value: d as Digit }]);
          }
        }
      }
    }
    return null;
  }

  // â”€â”€ checkAics() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // AIC Type 1: offTable premise d in startCell, chain ends with d SET in
  // endCell (endCell â‰  startCell, same candidate).  All common buddies of
  // startCell and endCell that have candidate d can be eliminated.
  // ---------------------------------------------------------------------------

  private _checkAics(tables: TableEntry[]): SolutionStep | null {
    const s = this.sudoku;
    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const entry = tables[ti];
      if (!entry.populated) continue;
      const startCell = (ti / 10) | 0;
      const startCand = ti % 10;
      if (startCand === 0 || !s.isCandidate(startCell, startCand)) continue;

      // Type 1: find end cell in onSets[startCand]
      for (const endCell of entry.onSets[startCand]) {
        if (endCell === startCell) continue;
        const dels: Candidate[] = [];
        for (const buddy of Sudoku2.BUDDIES[startCell]) {
          if (buddy !== endCell
              && BUDDY_SETS[endCell].has(buddy)
              && s.isCandidate(buddy, startCand)) {
            dels.push({ index: buddy, value: startCand as Digit });
          }
        }
        if (dels.length >= 1) return _step(SolutionType.AIC, dels);
      }
    }
    return null;
  }

  // â”€â”€ checkForcingChains() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _checkForcingChains(): SolutionStep | null {
    // 1. Single-chain contradictions
    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const r = this._checkOneChain(this._onTable[ti], true)
             ?? this._checkOneChain(this._offTable[ti], false);
      if (r) return r;
    }
    // 2. Two-chain verities (same premise cell, both ON and OFF lead to same conclusion)
    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const r = this._checkTwoChains(this._onTable[ti], this._offTable[ti]);
      if (r) return r;
    }
    // 3. All-candidates-in-cell verity
    const cr = this._checkAllChainsForCells();
    if (cr) return cr;
    // 4. All-positions-in-house verity
    return this._checkAllChainsForHouses();
  }

  // â”€â”€ checkOneChain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _checkOneChain(entry: TableEntry, isOn: boolean): SolutionStep | null {
    if (!entry.populated) return null;
    const s = this.sudoku;
    const ti = entry.tableIndex;
    const ci = (ti / 10) | 0;
    const d  = ti % 10;
    if (d === 0 || s.values[ci] !== 0 || !s.isCandidate(ci, d)) return null;

    const conclude = (): SolutionStep => isOn
      ? _step(SolutionType.FORCING_CHAIN_CONTRADICTION, [{ index: ci, value: d as Digit }])   // ON was wrong → delete d
      : _step(SolutionType.FORCING_CHAIN_CONTRADICTION, [], [{ index: ci, value: d as Digit }]); // OFF was wrong → set d

    // Case 1: premise loops back to its inverse
    if (isOn && entry.offSets[d].has(ci)) return conclude();
    if (!isOn && entry.onSets[d].has(ci)) return conclude();

    // Case 2: same candidate set AND deleted in any cell
    for (let d2 = 1; d2 <= 9; d2++) {
      for (const cell of entry.onSets[d2]) {
        if (entry.offSets[d2].has(cell)) return conclude();
      }
    }

    // Case 3: two different values set in the same cell
    for (let d2 = 1; d2 <= 9; d2++) {
      if (!entry.onSets[d2].size) continue;
      for (let d3 = d2 + 1; d3 <= 9; d3++) {
        if (!entry.onSets[d3].size) continue;
        for (const cell of entry.onSets[d2]) {
          if (entry.onSets[d3].has(cell)) return conclude();
        }
      }
    }

    // Case 4: same value set twice in one house
    for (let d2 = 1; d2 <= 9; d2++) {
      if (entry.onSets[d2].size < 2) continue;
      const setCells = [...entry.onSets[d2]];
      for (let h = 0; h < 27; h++) {
        let count = 0;
        for (const c of setCells) {
          if (_inHouse(c, h)) { count++; if (count >= 2) return conclude(); }
        }
      }
    }

    // Case 5: all positions of a candidate deleted in a house
    for (let d2 = 1; d2 <= 9; d2++) {
      if (!entry.offSets[d2].size) continue;
      for (let h = 0; h < 27; h++) {
        const positions = (HOUSE_CELLS[h] as number[]).filter(
          c => s.values[c] === 0 && s.isCandidate(c, d2),
        );
        if (positions.length === 0) continue;
        if (positions.every(c => entry.offSets[d2].has(c))) return conclude();
      }
    }

    return null;
  }

  // â”€â”€ checkTwoChains â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _checkTwoChains(on: TableEntry, off: TableEntry): SolutionStep | null {
    if (!on.populated || !off.populated) return null;
    const s = this.sudoku;
    for (let d = 1; d <= 9; d++) {
      for (const cell of on.onSets[d]) {
        if (off.onSets[d].has(cell) && s.isCandidate(cell, d)) {
          return _step(SolutionType.FORCING_CHAIN_VERITY, [], [{ index: cell, value: d as Digit }]);
        }
      }
      for (const cell of on.offSets[d]) {
        if (off.offSets[d].has(cell) && s.isCandidate(cell, d)) {
          return _step(SolutionType.FORCING_CHAIN_VERITY, [{ index: cell, value: d as Digit }]);
        }
      }
    }
    return null;
  }

  // â”€â”€ checkAllChainsForCells â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _checkAllChainsForCells(): SolutionStep | null {
    const s = this.sudoku;
    for (let ci = 0; ci < 81; ci++) {
      if (s.values[ci] !== 0) continue;
      const cands = s.getCandidates(ci);
      if (cands.length < 2) continue;
      const entries = cands.map(d => this._onTable[ci * 10 + d]).filter(e => e.populated);
      if (entries.length < 2) continue;
      const r = _firstVerity(_intersect(entries), s);
      if (r) return r;
    }
    return null;
  }

  // â”€â”€ checkAllChainsForHouses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _checkAllChainsForHouses(): SolutionStep | null {
    const s = this.sudoku;
    for (let h = 0; h < 27; h++) {
      for (let d = 1; d <= 9; d++) {
        const positions = (HOUSE_CELLS[h] as number[]).filter(
          c => s.values[c] === 0 && s.isCandidate(c, d),
        );
        if (positions.length < 2) continue;
        const entries = positions.map(c => this._onTable[c * 10 + d]).filter(e => e.populated);
        if (entries.length < 2) continue;
        const r = _firstVerity(_intersect(entries), s);
        if (r) return r;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-level utilities
// ---------------------------------------------------------------------------

function _digits(mask: number): number[] {
  const r: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) r.push(d);
  return r;
}

/** Check whether cell c belongs to house h. */
function _inHouse(c: number, h: number): boolean {
  return (CELL_HOUSES[c] as number[]).includes(h);
}

function _intersect(entries: TableEntry[]): { onSets: Set<number>[]; offSets: Set<number>[] } {
  const onSets: Set<number>[]  = Array.from({ length: DSIZE }, () => new Set<number>());
  const offSets: Set<number>[] = Array.from({ length: DSIZE }, () => new Set<number>());
  for (let d = 1; d <= 9; d++) {
    for (const c of entries[0].onSets[d]) {
      if (entries.every(e => e.onSets[d].has(c))) onSets[d].add(c);
    }
    for (const c of entries[0].offSets[d]) {
      if (entries.every(e => e.offSets[d].has(c))) offSets[d].add(c);
    }
  }
  return { onSets, offSets };
}

function _firstVerity(
  { onSets, offSets }: { onSets: Set<number>[]; offSets: Set<number>[] },
  s: Sudoku2,
): SolutionStep | null {
  for (let d = 1; d <= 9; d++) {
    for (const cell of onSets[d]) {
      if (s.isCandidate(cell, d))
        return _step(SolutionType.FORCING_CHAIN_VERITY, [], [{ index: cell, value: d as Digit }]);
    }
    for (const cell of offSets[d]) {
      if (s.isCandidate(cell, d))
        return _step(SolutionType.FORCING_CHAIN_VERITY, [{ index: cell, value: d as Digit }]);
    }
  }
  return null;
}

function _step(
  type: SolutionType,
  candidatesToDelete: Candidate[],
  placements: { index: number; value: Digit }[] = [],
): SolutionStep {
  return { type, placements, candidatesToDelete };
}

// ---------------------------------------------------------------------------
// Net propagation helpers (module-level for performance).
//
// Both helpers operate on mutable wVals/wCands snapshots; they record all
// resulting placements (addSet) and eliminations (addDel) in the entry.
//
// BFS queue: cells to place as [cell, digit].  When a cell is placed, all
// candidates d are removed from its buddies; if a buddy then has only one
// candidate left it becomes a naked single.  After each round, all 27 houses
// are scanned for hidden singles (digit that can go in only one cell).
// ---------------------------------------------------------------------------

function _netCountBits(mask: number): number {
  let n = 0;
  let m = mask >> 1;   // skip bit 0 (unused)
  while (m) { n += m & 1; m >>= 1; }
  return n;
}

function _netLowestBit(mask: number): number {
  // Return lowest set bit ≥ 1 in a candidate bitmask.
  for (let d = 1; d <= 9; d++) if ((mask >> d & 1) !== 0) return d;
  return 0;
}

function _netApplyPlacement(
  cell: number, digit: number,
  wVals: Uint8Array, wCands: Uint16Array,
  entry: TableEntry,
  queue: number[],
): void {
  if (wVals[cell] !== 0) return;      // already placed
  wVals[cell] = digit;
  entry.addSet(cell, digit);

  // Remove all other candidates from this cell.
  const cmask = wCands[cell];
  for (let d2 = 1; d2 <= 9; d2++) {
    if (d2 !== digit && (cmask >> d2 & 1) !== 0) entry.addDel(cell, d2);
  }
  wCands[cell] = 0;

  // Remove digit from buddies; check for naked singles.
  for (const peer of Sudoku2.BUDDIES[cell]) {
    if (wVals[peer] !== 0 || (wCands[peer] >> digit & 1) === 0) continue;
    wCands[peer] &= ~(1 << digit);
    entry.addDel(peer, digit);
    if (_netCountBits(wCands[peer]) === 1) {
      queue.push(peer * 10 + _netLowestBit(wCands[peer]));
    }
  }
}

function _netScanHiddenSingles(
  wVals: Uint8Array, wCands: Uint16Array,
  entry: TableEntry,
  queue: number[],
): void {
  for (let h = 0; h < 27; h++) {
    const house = HOUSE_CELLS[h] as number[];
    for (let d = 1; d <= 9; d++) {
      let cnt = 0; let pos = -1;
      for (const c of house) {
        if (wVals[c] === 0 && (wCands[c] >> d & 1) !== 0) { cnt++; pos = c; }
      }
      if (cnt === 1 && pos !== -1 && wVals[pos] === 0) {
        queue.push(pos * 10 + d);
      }
    }
  }
}

function _netPropagateOn(
  ci: number, d: number,
  wVals: Uint8Array, wCands: Uint16Array,
  entry: TableEntry,
): void {
  const queue: number[] = [ci * 10 + d];
  let qi = 0;
  while (qi < queue.length) {
    const pack = queue[qi++];
    const cell  = (pack / 10) | 0;
    const digit = pack % 10;
    if (wVals[cell] !== 0) continue;
    _netApplyPlacement(cell, digit, wVals, wCands, entry, queue);
    // Hidden singles scan after each placement (bounded by grid size).
    _netScanHiddenSingles(wVals, wCands, entry, queue);
  }
}

function _netPropagateOff(
  ci: number, d: number,
  wVals: Uint8Array, wCands: Uint16Array,
  entry: TableEntry,
): void {
  if ((wCands[ci] >> d & 1) === 0) return;
  wCands[ci] &= ~(1 << d);
  entry.addDel(ci, d);

  const queue: number[] = [];

  // Naked single in ci after removing d?
  if (_netCountBits(wCands[ci]) === 1) {
    queue.push(ci * 10 + _netLowestBit(wCands[ci]));
  }

  // Hidden single in the houses that contain ci.
  for (const hIdx of CELL_HOUSES[ci]) {
    for (let hd = 1; hd <= 9; hd++) {
      let cnt = 0; let pos = -1;
      for (const c of (HOUSE_CELLS[hIdx] as number[])) {
        if (wVals[c] === 0 && (wCands[c] >> hd & 1) !== 0) { cnt++; pos = c; }
      }
      if (cnt === 1 && pos !== -1 && wVals[pos] === 0) queue.push(pos * 10 + hd);
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const pack = queue[qi++];
    const cell  = (pack / 10) | 0;
    const digit = pack % 10;
    if (wVals[cell] !== 0) continue;
    _netApplyPlacement(cell, digit, wVals, wCands, entry, queue);
    _netScanHiddenSingles(wVals, wCands, entry, queue);
  }
}

