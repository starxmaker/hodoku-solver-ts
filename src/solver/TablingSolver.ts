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
import type { Als } from "./AlsSolver";
import { collectAlses } from "./AlsSolver";

// ---------------------------------------------------------------------------
// TablingSolver — mirrors solver/TablingSolver.java (chain-only subset)
//
// Implements Trebors Tables for:
//   • Forcing Chain Contradiction  → SolutionType.FORCING_CHAIN
//   • Forcing Chain Verity         → SolutionType.FORCING_CHAIN
//   • Nice Loop (Discontinuous)    → SolutionType.NICE_LOOP
//
// Forcing Net is not implemented (requires look-ahead with grid cloning; the
// chain-only table already covers the same practical eliminations).
//
// Chain reconstruction for display is intentionally omitted: the TS
// SolutionStep has no chain field.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TableEntry — simplified version of solver/TableEntry.java
//
// Per premise (cell×digit ON or OFF) we track which cells can have a digit
// SET (onSets) or DELETED (offSets) as a consequence.
// ---------------------------------------------------------------------------

const DSIZE = 10; // digit indices 1..9 (index 0 unused)

class TableEntry {
  /** The table-array index this entry lives at (cell*10+digit). Set by the solver. */
  tableIndex = 0;
  /** Whether this is an ON (true) or OFF (false) table entry. */
  isOn = false;

  /** cells that become SET to digit d. */
  readonly onSets: Set<number>[] = Array.from({ length: DSIZE }, () => new Set<number>());
  /** cells from which digit d is DELETED. */
  readonly offSets: Set<number>[] = Array.from({ length: DSIZE }, () => new Set<number>());

  /** Maximum BFS distance (chain length) at which each cell+digit was reached via addSet.
   *  Index = cell*10+digit.  0 means not yet recorded.
   *  We track max because Java checks per-entry distances and allows any entry
   *  with dist > 2 even if other entries for the same cell+cand are closer. */
  readonly minDistOn: Uint16Array = new Uint16Array(TABLE_SIZE);
  /** Maximum BFS distance at which each cell+digit was reached via addDel.  Index = cell*10+digit. */
  readonly minDistOff: Uint16Array = new Uint16Array(TABLE_SIZE);

  /** BFS path flag: 1 if the path from initial entry to this entry's parent includes
   *  the premise cell. Used for chain validation (reject if path loops through start cell). */
  readonly pathVisitsPremiseOn:  Uint8Array = new Uint8Array(TABLE_SIZE);
  readonly pathVisitsPremiseOff: Uint8Array = new Uint8Array(TABLE_SIZE);

  /** Parent pointer for ON conclusions. Encoded as cell*20+digit*2+(isOn?1:0).
   *  -1 = initial entry (parent is the root/premise). */
  readonly retOn:  Int16Array = new Int16Array(TABLE_SIZE).fill(-1);
  /** Parent pointer for OFF conclusions. Same encoding as retOn. */
  readonly retOff: Int16Array = new Int16Array(TABLE_SIZE).fill(-1);

  /** Set to 1 when the ON entry (cell,d) was produced by a group implication (H20/H21).
   *  Only meaningful when used via _expandTablesWithGroups. */
  readonly groupFiredOn:  Uint8Array = new Uint8Array(TABLE_SIZE);
  /** Set to 1 when the OFF entry (cell,d) was produced by a group implication (H21/H22).
   *  Only meaningful when used via _expandTablesWithGroups. */
  readonly groupFiredOff: Uint8Array = new Uint8Array(TABLE_SIZE);

  /** Group cells for group-fired ON entries. Keyed by ti = cell*10+digit. */
  readonly groupNodeCellsOn:  Map<number, number[]> = new Map();
  /** Group cells for group-fired OFF entries. Keyed by ti = cell*10+digit. */
  readonly groupNodeCellsOff: Map<number, number[]> = new Map();

  /** Group indices of PRIOR cascade groups for ON entries (excluding the directly connected group).
   *  When a group cascade involves multiple intermediate groups (e.g. [7,16]→[70,79]→[60,62]),
   *  this stores the indices of [7,16] and [70,79]; the direct group [60,62] is in groupNodeCellsOn. */
  readonly groupCascadeGIsOn:  Map<number, number[]> = new Map();
  /** Group indices of PRIOR cascade groups for OFF entries (excluding the directly connected group). */
  readonly groupCascadeGIsOff: Map<number, number[]> = new Map();

  /** Alternate (NORMAL) parent for ON entries where GROUP won at same BFS distance.
   *  Keyed by ti = cell*10+digit.  Encoded same as retOn. */
  readonly altRetOn:  Map<number, number> = new Map();
  /** Alternate (NORMAL) parent for OFF entries where GROUP won at same BFS distance. */
  readonly altRetOff: Map<number, number> = new Map();

  /** All NORMAL snap parents that reached a GROUP-fired ON entry.
   *  Java has separate NORMAL_NODE entries; we try each parent in the lasso check
   *  to find the one that matches Java's lasso-free chain (if any). */
  readonly allNormalParentsOn:  Map<number, number[]> = new Map();
  /** All NORMAL snap parents that reached a GROUP-fired OFF entry. */
  readonly allNormalParentsOff: Map<number, number[]> = new Map();

  /** Minimum BFS distance among all NORMAL snap paths for GROUP-fired ON entries. */
  readonly normalDistOn: Uint16Array = new Uint16Array(TABLE_SIZE);
  /** Minimum BFS distance among all NORMAL snap paths for GROUP-fired OFF entries. */
  readonly normalDistOff: Uint16Array = new Uint16Array(TABLE_SIZE);

  private _populated = false;
  get populated(): boolean { return this._populated; }

  reset(): void {
    this._populated = false;
    for (let d = 0; d < DSIZE; d++) {
      this.onSets[d].clear();
      this.offSets[d].clear();
    }
    this.minDistOn.fill(0);
    this.minDistOff.fill(0);
    this.pathVisitsPremiseOn.fill(0);
    this.pathVisitsPremiseOff.fill(0);
    this.retOn.fill(-1);
    this.retOff.fill(-1);
    this.groupFiredOn.fill(0);
    this.groupFiredOff.fill(0);
    this.normalDistOn.fill(0);
    this.normalDistOff.fill(0);
    this.groupNodeCellsOn.clear();
    this.groupNodeCellsOff.clear();
    this.groupCascadeGIsOn.clear();
    this.groupCascadeGIsOff.clear();
    this.altRetOn.clear();
    this.altRetOff.clear();
    this.allNormalParentsOn.clear();
    this.allNormalParentsOff.clear();
  }

  addSet(cell: number, d: number): boolean {
    if (this.onSets[d].has(cell)) return false;
    this.onSets[d].add(cell);
    this._populated = true;
    return true;
  }

  addDel(cell: number, d: number): boolean {
    if (this.offSets[d].has(cell)) return false;
    this.offSets[d].add(cell);
    this._populated = true;
    return true;
  }

  touch(): void {
    this._populated = true;
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
// GroupNode � a set of 2-3 cells in the same row/column AND same box that
// share a common candidate.  A group acts as a compound chain node: the
// group is "OFF" when ALL its cells lose the candidate.
// ---------------------------------------------------------------------------

interface GroupNode {
  readonly cells: readonly number[];   // 2 or 3 cell indices
  readonly digit: number;              // candidate digit (1-9)
  readonly row: number;                // row index (0-8), or -1 if column-based
  readonly col: number;                // col index (0-8), or -1 if row-based
  readonly block: number;              // box index (0-8)
}

/** Collect all group nodes for the current grid state. */
function collectGroupNodes(s: Sudoku2): GroupNode[] {
  const nodes: GroupNode[] = [];
  // Check rows (HOUSES[0..8]) and columns (HOUSES[9..17]).
  for (let lineType = 0; lineType < 2; lineType++) {
    for (let ln = 0; ln < 9; ln++) {
      const hIdx = lineType === 0 ? ln : 9 + ln;
      for (let d = 1; d <= 9; d++) {
        // Group cells with d in this line by box.
        const byBox = new Map<number, number[]>();
        for (const c of HOUSE_CELLS[hIdx]) {
          if (s.values[c] === 0 && s.isCandidate(c, d)) {
            const b = Sudoku2.box(c);
            if (!byBox.has(b)) byBox.set(b, []);
            byBox.get(b)!.push(c);
          }
        }
        for (const [b, cells] of byBox) {
          if (cells.length >= 2) {
            nodes.push({
              cells,
              digit: d,
              row: lineType === 0 ? ln : -1,
              col: lineType === 1 ? ln : -1,
              block: b,
            });
          }
        }
      }
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// TablingSolver
// ---------------------------------------------------------------------------

export class TablingSolver extends AbstractSolver {
  private readonly _onTable: TableEntry[] = Array.from({ length: TABLE_SIZE }, () => new TableEntry());
  private readonly _offTable: TableEntry[] = Array.from({ length: TABLE_SIZE }, () => new TableEntry());
  private _groupImplicationFired = false;
  private _groups: GroupNode[] = [];
  private _alsImplicationFired = false;
  private _krakenFilled = false;

  override setSudoku(sudoku: Sudoku2): void {
    super.setSudoku(sudoku);
    this._krakenFilled = false;
  }

  /**
   * For Kraken Fish: returns true if eliminating digit `d` from every cell in
   * `cells` forces `target` to also lose `d` (via forcing-chain analysis).
   * Tables are filled+expanded lazily and cached for the current puzzle state.
   */
  public krakenCheck(cells: number[], d: number, target: number): boolean {
    if (!this._krakenFilled) {
      this._fillTables();
      this._expandTables(this._onTable, this._offTable);
      this._krakenFilled = true;
    }
    // Kraken Type 1: for every fin cell ci, placing d in ci forces d off target.
    return cells.every(ci => this._onTable[ci * 10 + d].offSets[d].has(target));
  }

  /**
   * For Kraken Fish Type 2: given a set of "premise" cells (non-cannibalistic
   * base candidates in one cover unit plus fins), returns all cells that can
   * be eliminated for digit `ec` because every premise cell being ON for `d`
   * forces `ec` off that cell via a forcing chain.
   *
   * Mirrors TablingSolver.checkKrakenTypeTwo() in the Java source.
   */
  public krakenCheckType2(indices: number[], d: number, ec: number): number[] {
    if (!this._krakenFilled) {
      this._fillTables();
      this._expandTables(this._onTable, this._offTable);
      this._krakenFilled = true;
    }
    const s = this.sudoku;
    const indexSet = new Set(indices);
    // Start with all cells that have ec as a candidate (excluding premise cells).
    let candidates: number[] = [];
    for (let cell = 0; cell < 81; cell++) {
      if (indexSet.has(cell)) continue;
      if (s.values[cell] === 0 && s.isCandidate(cell, ec)) {
        candidates.push(cell);
      }
    }
    // Intersect with offSets[ec] from each premise cell's ON-table entry for d.
    for (const c of indices) {
      const forced = this._onTable[c * 10 + d].offSets[ec];
      candidates = candidates.filter(cell => forced.has(cell));
      if (candidates.length === 0) break;
    }
    return candidates;
  }


  // ── Public interface ──────────────────────────────────────────────────────

  override getStep(type: SolutionType): SolutionStep | null {
    switch (type) {
      case SolutionType.NICE_LOOP:
      case SolutionType.DISCONTINUOUS_NICE_LOOP:
      case SolutionType.CONTINUOUS_NICE_LOOP:
      case SolutionType.AIC:
        return this._getNiceLoop();
      case SolutionType.GROUPED_NICE_LOOP:
      case SolutionType.GROUPED_CONTINUOUS_NICE_LOOP:
      case SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP:
      case SolutionType.GROUPED_AIC:
        return this._getGroupedNiceLoop();
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

  // ── Top-level orchestration ───────────────────────────────────────────────

  private _getNiceLoop(): SolutionStep | null {
    this._fillTables();
    this._expandTables(this._onTable, this._offTable);
    const candidates: _StepCandidate[] = [];
    this._collectNiceLoops(this._onTable, false, candidates);
    this._collectNiceLoops(this._offTable, false, candidates);
    this._collectAics(this._offTable, candidates);
    if (candidates.length === 0) return null;
    candidates.sort(_compareSteps);
    return candidates[0].step;
  }

  // -- Grouped Nice Loop -------------------------------------------------------
  //
  // After filling direct-implication tables, expands them with group-node
  // implications: when all cells of a GroupNode lose their candidate (group
  // OFF), any single remaining candidate in the group's row/col/box is forced
  // ON.  Only fires a GROUPED step when at least one group implication was
  // actually used.
  // ---------------------------------------------------------------------------

  private _getGroupedNiceLoop(): SolutionStep | null {
    const groups = collectGroupNodes(this.sudoku);
    if (groups.length === 0) return null;
    this._groups = groups;

    // H4: Java ALLOW_ALS_IN_TABLING_CHAINS=false by default - no ALS expansion for grouped loops.
    this._groupImplicationFired = false;
    this._fillTables();
    this._expandTablesWithGroups(this._onTable, this._offTable, groups);

    if (!this._groupImplicationFired) return null;

    const candidates: _StepCandidate[] = [];
    this._collectNiceLoops(this._onTable, true, candidates);
    this._collectNiceLoops(this._offTable, true, candidates);
    this._collectAics(this._offTable, candidates);

    if (candidates.length === 0) return null;

    candidates.sort(_compareSteps);
    const step = candidates[0].step;
    if (step.type === SolutionType.DISCONTINUOUS_NICE_LOOP)
      return { ...step, type: SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP };
    if (step.type === SolutionType.CONTINUOUS_NICE_LOOP)
      return { ...step, type: SolutionType.GROUPED_CONTINUOUS_NICE_LOOP };
    if (step.type === SolutionType.AIC)
      return { ...step, type: SolutionType.GROUPED_AIC };
    return { ...step, type: SolutionType.GROUPED_NICE_LOOP };
  }
  // -- expandTablesWithGroups() ------------------------------------------------
  //
  // Same BFS as _expandTables() but with an extra "group-OFF" check:
  // whenever a new OFF(d) entry is added to a destination table, we check
  // all group nodes G that contain that cell.  If ALL cells of G are now
  // present in offSets[d] of the destination, the group is effectively OFF;
  // we then look for a single remaining d-candidate in G's row, col, or block
  // and force it ON (addSet).
  // ---------------------------------------------------------------------------

  private _expandTablesWithGroups(
    onTable: TableEntry[],
    offTable: TableEntry[],
    groups: GroupNode[],
  ): void {
    type SnapEntry = { cell: number; d: number; isOn: boolean };
    type GQEntry = SnapEntry & { dist: number };
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

    const s = this.sudoku;

    // Build per-digit group lookup for efficiency.
    const groupsByDigit: GroupNode[][] = Array.from({ length: 10 }, () => []);
    for (const g of groups) groupsByDigit[g.digit].push(g);

    // Precompute static group-related data for fast BFS group checks.
    // gBuddies[gi]: common buddies of group gi cells, excluding group members.
    const gBuddies: number[][] = groups.map(g =>
      g.cells.reduce(
        (acc: number[], gc: number) => acc.filter(b => Sudoku2.BUDDIES[gc].includes(b)),
        [...Sudoku2.BUDDIES[g.cells[0]]],
      ).filter(c => !g.cells.includes(c))
    );

    // groupHouseInfos[gi]: per-house info for group gi. rem = static remaining
    // non-group d-candidates (based on current sudoku state). g2Idx = index of
    // matching H21 partner group in groups[], or -1 if none.
    type HouseInfo = { hIdx: number; rem: number[]; g2Idx: number };
    const groupHouseInfos: HouseInfo[][] = groups.map((g) => {
      const infos: HouseInfo[] = [];
      const hIdxList: number[] = [];
      if (g.row >= 0) hIdxList.push(g.row);
      if (g.col >= 0) hIdxList.push(9 + g.col);
      hIdxList.push(18 + g.block);
      for (const hIdx of hIdxList) {
        const rem = (HOUSE_CELLS[hIdx] as number[]).filter(
          hc => !g.cells.includes(hc) && s.values[hc] === 0 && s.isCandidate(hc, g.digit),
        );
        let g2Idx = -1;
        if (rem.length > 1) {
          const found = groupsByDigit[g.digit].find(
            gn => gn !== g && gn.cells.length === rem.length && rem.every(hc => gn.cells.includes(hc)),
          );
          if (found) g2Idx = groups.indexOf(found);
        }
        infos.push({ hIdx, rem, g2Idx });
      }
      return infos;
    });

    // cellSeesGroupIdxs.get(c * 10 + d): indices into groups[] of all groups for
    // digit d that cell c sees (c is buddy of every group cell, c not in group).
    // Used in H21 (ON -> group OFF -> sole cell ON) expansion.
    // Built by intersecting buddy sets (much faster than scanning all 81 cells).
    const cellSeesGroupIdxs = new Map<number, number[]>();
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const d = g.digit;
      // Start with buddies of g.cells[0] (excluding group cells), then intersect
      // with buddies of each remaining group cell.
      const seenBy = g.cells.slice(1).reduce(
        (acc: number[], gc: number) => acc.filter(b => Sudoku2.BUDDIES[gc].includes(b)),
        (Sudoku2.BUDDIES[g.cells[0]] as number[]).filter(b => !g.cells.includes(b)),
      );
      for (const c of seenBy) {
        const key = c * 10 + d;
        let arr = cellSeesGroupIdxs.get(key);
        if (!arr) { arr = []; cellSeesGroupIdxs.set(key, arr); }
        arr.push(gi);
      }
    }

    // h22InfoMap.get(c * 10 + d): indices into groups[] of groups where c is the
    // sole remaining non-group d-candidate in one of the group's own houses.
    // Used in H22 (OFF -> group ON -> eliminate from group buddies).
    const h22InfoMap = new Map<number, number[]>();
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const d = g.digit;
      for (const info of groupHouseInfos[gi]) {
        if (info.rem.length === 1) {
          const key = info.rem[0] * 10 + d;
          let arr = h22InfoMap.get(key);
          if (!arr) { arr = []; h22InfoMap.set(key, arr); }
          arr.push(gi);
        }
      }
    }

    // groupOnToGroupsOffIdx[gi]: indices of non-overlapping groups that share a
    // house with group gi for the same digit — those groups turn OFF when gi is ON.
    const groupOnToGroupsOffIdx: number[][] = groups.map((g, gi) => {
      const result: number[] = [];
      for (let gj = 0; gj < groups.length; gj++) {
        if (gj === gi) continue;
        const g2 = groups[gj];
        if (g.digit !== g2.digit) continue;
        if (g.cells.some(c => g2.cells.includes(c))) continue;
        const shares = (g.row >= 0 && g.row === g2.row) ||
                       (g.col >= 0 && g.col === g2.col) ||
                       (g.block === g2.block);
        if (shares) result.push(gj);
      }
      return result;
    });

    for (const [table, snap] of [[onTable, onSnap], [offTable, offSnap]] as const) {
      for (let ti = 0; ti < TABLE_SIZE; ti++) {
        const dest = table[ti];
        if (!dest.populated) continue;

        const premiseCi = (ti / 10) | 0;
        const premiseD  = ti % 10;

        // BFS queue with distance tracking.
        const queue2: GQEntry[] = snap[ti].map(e => ({ ...e, dist: 1 }));

        // Record distance 1 and parent=-1 (root) for all initial (direct implication) entries.
        for (const { cell, d, isOn } of snap[ti]) {
          const key = cell * 10 + d;
          if (isOn) { dest.minDistOn[key] = 1; dest.retOn[key] = -1; }
          else      { dest.minDistOff[key] = 1; dest.retOff[key] = -1; }
        }

        // Mark the premise itself in onSets/offSets so that BFS expansion cannot
        // re-discover it. Java adds the premise as the first table entry (fillTables
        // line 1860-1861), which automatically prevents duplicates via addEntry's
        // dedup check. We add after snap building to avoid polluting the snap arrays.
        if (table === onTable) dest.onSets[premiseD].add(premiseCi);
        else                   dest.offSets[premiseD].add(premiseCi);

        // Group effect helpers: implement group-node propagation matching Java's
        // fillTablesWithGroupNodes + expandTables. Non-recursive to match Java's
        // BFS-driven expansion where each group table is expanded at most once.
        const processedGroupOff = new Set<number>();
        const processedGroupOn  = new Set<number>();
        // Track group ON parameters for the post-BFS cascade pass
        const groupOnParams = new Map<number, { d: number, gDist: number, pEnc: number, cascadeGIs?: number[] }>();

        /** Group gi turned OFF: sole remaining cell turns ON, or partner group turns ON → buddy cells OFF.
         *  cascadeGIs accumulates group indices from prior cascade steps (undefined for fresh start). */
        const handleGroupOff = (gi: number, d: number, gDist: number, pEnc: number, cascadeGIs?: number[]) => {
          if (processedGroupOff.has(gi)) return;
          processedGroupOff.add(gi);
          const g = groups[gi];
          for (const info of groupHouseInfos[gi]) {
            if (info.rem.length === 1) {
              const cell = info.rem[0];
              const key = cell * 10 + d;
              if (dest.addSet(cell, d)) {
                dest.minDistOn[key] = gDist;
                dest.retOn[key] = pEnc;
                dest.groupFiredOn[key] = 1;
                dest.groupNodeCellsOn.set(key, [...g.cells]);
                if (cascadeGIs) {
                  dest.groupCascadeGIsOn.set(key, cascadeGIs);
                }
                this._groupImplicationFired = true;
                queue2.push({ cell, d, isOn: true, dist: gDist });
              }
            } else if (info.g2Idx >= 0) {
              // Partner group turns ON → its buddy cells OFF
              // Java: partner H ON is one hop from G OFF, so distance = gDist + 1
              const newGIs= cascadeGIs ? [...cascadeGIs, gi] : [gi];
              handleGroupOn(info.g2Idx, d, gDist + 1, pEnc, newGIs);
            }
          }
        };

        /** Group gi turned ON: buddy cells OFF.
         *  groupOnToGroupsOff is deferred to a post-BFS pass so that the
         *  main BFS produces the same entry order as Java (which processes
         *  group entries only when dequeued, not inline). */
        const handleGroupOn = (gi: number, d: number, gDist: number, pEnc: number, cascadeGIs?: number[]) => {
          if (processedGroupOn.has(gi)) return;
          processedGroupOn.add(gi);
          const g = groups[gi];
          const fullGIs = cascadeGIs ? [...cascadeGIs, gi] : [gi];
          groupOnParams.set(gi, { d, gDist, pEnc, cascadeGIs: fullGIs });
          for (const bCell of gBuddies[gi]) {
            if (s.values[bCell] !== 0 || !s.isCandidate(bCell, d) || dest.offSets[d].has(bCell)) continue;
            const bKey = bCell * 10 + d;
            if (dest.addDel(bCell, d)) {
              dest.minDistOff[bKey] = gDist;
              dest.retOff[bKey] = pEnc;
              dest.groupFiredOff[bKey] = 1;
              dest.groupNodeCellsOff.set(bKey, [...g.cells]);
              if (cascadeGIs) {
                dest.groupCascadeGIsOff.set(bKey, cascadeGIs);
              }
              this._groupImplicationFired = true;
              queue2.push({ cell: bCell, d, isOn: false, dist: gDist });
            }
          }
        };

        // Process group implications of the premise cell itself — matches Java's
        // fillTablesWithGroupNodes which also processes the premise as a starting point.
        const premiseIsOn = (table === onTable);
        const premiseEnc  = premiseCi * 20 + premiseD * 2 + (premiseIsOn ? 1 : 0);
        if (premiseIsOn) {
          const seenByPremise = cellSeesGroupIdxs.get(premiseCi * 10 + premiseD);
          if (seenByPremise) {
            for (const gi of seenByPremise) {
              handleGroupOff(gi, premiseD, 2, premiseEnc);
            }
          }
        } else {
          const h22Premise = h22InfoMap.get(premiseCi * 10 + premiseD);
          if (h22Premise) {
            for (const gi of h22Premise) {
              handleGroupOn(gi, premiseD, 2, premiseEnc);
            }
          }
        }

        let qi = 0;
        while (qi < queue2.length) {
          const { cell: c, d, isOn, dist } = queue2[qi++];
          if (c === premiseCi && d === premiseD) continue;
          const parentEnc = c * 20 + d * 2 + (isOn ? 1 : 0);

          // Snap expansion runs FIRST (dist+1), so shorter direct-snap paths are
          // stored before group-hop paths (dist+2) can block them.
          // This matches Java's expandTables ordering: direct snap entries in the table
          // are at lower indices than group entries, so they're always processed first.
          const srcTi = c * 10 + d;
          const srcSnap = isOn ? onSnap[srcTi] : offSnap[srcTi];

          for (const { cell: c2, d: d2, isOn: isOn2 } of srcSnap) {
            const newDist = dist + 1;
            const key = c2 * 10 + d2;
            if (isOn2) {
              if (dest.addSet(c2, d2)) {
                dest.minDistOn[key] = newDist;
                dest.retOn[key] = parentEnc;
                queue2.push({ cell: c2, d: d2, isOn: true, dist: newDist });
              } else if (dest.groupFiredOn[key] === 1) {
                let list = dest.allNormalParentsOn.get(key);
                if (!list) { list = []; dest.allNormalParentsOn.set(key, list); }
                list.push(parentEnc);
                if (dest.normalDistOn[key] === 0 || newDist < dest.normalDistOn[key]) {
                  dest.normalDistOn[key] = newDist;
                }
                if (dest.minDistOn[key] === newDist) {
                  dest.altRetOn.set(key, parentEnc);
                }
              }
            } else {
              if (dest.addDel(c2, d2)) {
                dest.minDistOff[key] = newDist;
                dest.retOff[key] = parentEnc;
                queue2.push({ cell: c2, d: d2, isOn: false, dist: newDist });
              } else if (dest.groupFiredOff[key] === 1) {
                let list = dest.allNormalParentsOff.get(key);
                if (!list) { list = []; dest.allNormalParentsOff.set(key, list); }
                list.push(parentEnc);
                if (dest.normalDistOff[key] === 0 || newDist < dest.normalDistOff[key]) {
                  dest.normalDistOff[key] = newDist;
                }
                if (dest.minDistOff[key] === newDist) {
                  dest.altRetOff.set(key, parentEnc);
                }
              }
            }
          }

          // Dequeue-time group check — equivalent to Java's expandTables processing
          // GROUP_NODE entries in each cell's table (pre-loaded by fillTablesWithGroupNodes).
          // Fires AFTER snap expansion so that shorter direct-snap paths (dist+1) are
          // stored first; group-hop paths (dist+2) are rejected if already stored.
          if (isOn) {
            const seenIdxs = cellSeesGroupIdxs.get(c * 10 + d);
            if (seenIdxs) {
              for (const gi of seenIdxs) {
                handleGroupOff(gi, d, dist + 2, parentEnc);
              }
            }
          } else {
            const h22Idxs = h22InfoMap.get(c * 10 + d);
            if (h22Idxs) {
              for (const gi of h22Idxs) {
                handleGroupOn(gi, d, dist + 2, parentEnc);
              }
            }
          }
        }

        // Phase 2: Group ON → group OFF cascade (deferred from the main BFS).
        // Java processes group entries in the same dest array as cell entries,
        // so group-to-group effects fire only after all earlier cell entries
        // have been expanded.  By deferring the cascade here we match that
        // ordering: Phase 1 mirrors Java's cell-first expansion, then Phase 2
        // adds group-to-group connections and propagates their effects.
        let cascadeAdded = true;
        while (cascadeAdded) {
          cascadeAdded = false;
          for (const [gi, info] of groupOnParams) {
            for (const g2i of groupOnToGroupsOffIdx[gi]) {
              if (!processedGroupOff.has(g2i)) {
                const prevQLen = queue2.length;
                handleGroupOff(g2i, info.d, info.gDist + 1, info.pEnc, info.cascadeGIs);
                if (queue2.length > prevQLen) cascadeAdded = true;
              }
            }
          }
          // Propagate any new cell entries from the cascade
          while (qi < queue2.length) {
            const { cell: c, d, isOn, dist } = queue2[qi++];
            if (c === premiseCi && d === premiseD) continue;
            const parentEnc = c * 20 + d * 2 + (isOn ? 1 : 0);
            const srcTi = c * 10 + d;
            const srcSnap = isOn ? onSnap[srcTi] : offSnap[srcTi];
            for (const { cell: c2, d: d2, isOn: isOn2 } of srcSnap) {
              const newDist = dist + 1;
              const key = c2 * 10 + d2;
              if (isOn2) {
                if (dest.addSet(c2, d2)) {
                  dest.minDistOn[key] = newDist;
                  dest.retOn[key] = parentEnc;
                  queue2.push({ cell: c2, d: d2, isOn: true, dist: newDist });
                } else if (dest.groupFiredOn[key] === 1) {
                  let list = dest.allNormalParentsOn.get(key);
                  if (!list) { list = []; dest.allNormalParentsOn.set(key, list); }
                  list.push(parentEnc);
                  if (dest.normalDistOn[key] === 0 || newDist < dest.normalDistOn[key]) {
                    dest.normalDistOn[key] = newDist;
                  }
                  if (dest.minDistOn[key] === newDist) {
                    dest.altRetOn.set(key, parentEnc);
                  }
                }
              } else {
                if (dest.addDel(c2, d2)) {
                  dest.minDistOff[key] = newDist;
                  dest.retOff[key] = parentEnc;
                  queue2.push({ cell: c2, d: d2, isOn: false, dist: newDist });
                } else if (dest.groupFiredOff[key] === 1) {
                  let list = dest.allNormalParentsOff.get(key);
                  if (!list) { list = []; dest.allNormalParentsOff.set(key, list); }
                  list.push(parentEnc);
                  if (dest.normalDistOff[key] === 0 || newDist < dest.normalDistOff[key]) {
                    dest.normalDistOff[key] = newDist;
                  }
                  if (dest.minDistOff[key] === newDist) {
                    dest.altRetOff.set(key, parentEnc);
                  }
                }
              }
            }
            if (isOn) {
              const seenIdxs = cellSeesGroupIdxs.get(c * 10 + d);
              if (seenIdxs) {
                for (const gi2 of seenIdxs) handleGroupOff(gi2, d, dist + 2, parentEnc);
              }
            } else {
              const h22Idxs = h22InfoMap.get(c * 10 + d);
              if (h22Idxs) {
                for (const gi2 of h22Idxs) {
                  handleGroupOn(gi2, d, dist + 2, parentEnc);
                }
              }
            }
          }
        }

      }
    }
  }

  // --  _expandTablesWithAls() ------------------------------------------------
  //
  // BFS extension pass for ALS-node implications.
  //
  // ALS rule: if all cells of an ALS that contain entry-digit e are eliminated
  // (offSets[e] ? every cell in als.cellsFor[e]), then for each exit digit z
  // (z ? e) the ALS forces eliminations on every cell in als.buddiesFor[z].
  //
  // Called after _expandTablesWithGroups (for grouped nice loops) or after
  // _expandTables (for forcing chains/nets).  The snapshot used for BFS is
  // taken from the CURRENT state of the tables (already group-expanded).
  // ---------------------------------------------------------------------------
  private _expandTablesWithAls(
    onTable: TableEntry[],
    offTable: TableEntry[],
    alses: Als[],
  ): void {
    if (alses.length === 0) return;
    const s = this.sudoku;

    // Build per-cell+digit ? ALS lookup  (which ALS have cell c as a cellsFor[e] member)
    type AlsEntry = { als: Als; e: number };
    const cellDigitToAlses = new Map<number, AlsEntry[]>();
    for (const als of alses) {
      for (let e = 1; e <= 9; e++) {
        if (!(als.candMask & (1 << e))) continue;
        for (const c of als.cellsFor[e]) {
          const key = c * 10 + e;
          if (!cellDigitToAlses.has(key)) cellDigitToAlses.set(key, []);
          cellDigitToAlses.get(key)!.push({ als, e });
        }
      }
    }

    // Snapshot the current (already-expanded) tables.
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

    const checkAlsOff = (
      als: Als,
      e: number,
      dest: TableEntry,
      queue: SnapEntry[],
    ): void => {
      if (!als.cellsFor[e].every(c => dest.offSets[e].has(c))) return;
      for (let z = 1; z <= 9; z++) {
        if (z === e || !(als.candMask & (1 << z))) continue;
        for (const b of als.buddiesFor[z]) {
          if (dest.addDel(b, z)) {
            this._alsImplicationFired = true;
            queue.push({ cell: b, d: z, isOn: false });
          }
        }
      }
      // H18: ALS buddy forcing � if exit-digit deletions reduce a buddy cell
      // to 1 remaining candidate, that cell is forced ON for that candidate.
      // Only applies to cells with =3 original candidates; bivalue cells are
      // already handled by normal table fill.  (Mirrors Java fillTablesWithAls.)
      const alsBuddies = new Set<number>();
      for (let z = 1; z <= 9; z++) {
        if (z === e || !(als.candMask & (1 << z))) continue;
        for (const b of als.buddiesFor[z]) alsBuddies.add(b);
      }
      for (const cell of alsBuddies) {
        if (s.values[cell] !== 0) continue;
        let origCount = 0;
        for (let dd = 1; dd <= 9; dd++) if (s.isCandidate(cell, dd)) origCount++;
        if (origCount <= 2) continue; // bivalue already covered by normal tables
        let lastRemaining = -1;
        let multiRemaining = false;
        for (let dd = 1; dd <= 9; dd++) {
          if (!s.isCandidate(cell, dd)) continue;
          if (!dest.offSets[dd].has(cell)) {
            if (lastRemaining !== -1) { multiRemaining = true; break; }
            lastRemaining = dd;
          }
        }
        if (!multiRemaining && lastRemaining > 0 && dest.addSet(cell, lastRemaining)) {
          this._alsImplicationFired = true;
          queue.push({ cell, d: lastRemaining, isOn: true });
        }
      }
    };

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
              if (dest.addDel(c2, d2)) {
                queue.push({ cell: c2, d: d2, isOn: false });
                // ALS-OFF check: c2 going OFF may complete an ALS entry.
                const key = c2 * 10 + d2;
                const entries = cellDigitToAlses.get(key);
                if (entries) {
                  for (const { als, e } of entries) {
                    checkAlsOff(als, e, dest, queue);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private _getForcingChain(): SolutionStep | null {
    // Java's doGetForcingChains uses withGroupNodes=true, so group-node
    // implications are included during table expansion (fillTablesWithGroupNodes
    // + expandTables in Java).  We pass groups to _expandTables to match.
    const groups = collectGroupNodes(this.sudoku);
    this._fillTables();
    this._expandTables(this._onTable, this._offTable, groups.length > 0 ? groups : undefined);
    return this._checkForcingChains();
  }

  private _getForcingNet(): SolutionStep | null {
    // Java's doGetForcingChains also applies to nets, with withGroupNodes=true.
    const groups = collectGroupNodes(this.sudoku);
    this._fillTablesForNet();
    this._expandTables(this._onTable, this._offTable, groups.length > 0 ? groups : undefined);
    const step = this._checkForcingChains();
    if (!step) return null;
    if (step.type === SolutionType.FORCING_CHAIN_CONTRADICTION)
      return { ...step, type: SolutionType.FORCING_NET_CONTRADICTION };
    if (step.type === SolutionType.FORCING_CHAIN_VERITY)
      return { ...step, type: SolutionType.FORCING_NET_VERITY };
    return { ...step, type: SolutionType.FORCING_NET };
  }

  // -- fillTablesForNet() ----------------------------------------------------
  //
  // Java chainsOnly=false: clone the grid for each premise, propagate naked
  // and hidden singles, record all transitive consequences in the tables.
  // ---------------------------------------------------------------------------

  private _fillTablesForNet(): void {
    this._krakenFilled = false;
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

  // ── fillTables() ─────────────────────────────────────────────────────────
  //
  // Java chainsOnly=true branch: direct (single-step) implications only.
  // Expansion to deeper chains happens in expandTables().
  // ---------------------------------------------------------------------------

  private _fillTables(): void {
    this._krakenFilled = false;
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

        // ── ON premise: d is SET in ci ─────────────────────────────────────
        const on = this._onTable[ti];
        // All other candidates in cell are deleted (cell candidates first, matches Java chainsOnly)
        for (const d2 of cellCands) {
          if (d2 !== d) on.addDel(ci, d2);
        }
        // d deleted from all peers — iterate houses in ROW→COL→BOX order (matching
        // Java's CONSTRAINTS[i] order) so insertion order into offSets matches Java's BFS.
        for (const hIdx of CELL_HOUSES[ci]) {
          for (const peer of HOUSE_CELLS[hIdx] as number[]) {
            if (peer !== ci && s.values[peer] === 0 && s.isCandidate(peer, d)) {
              on.addDel(peer, d);
            }
          }
        }

        // ── OFF premise: d is DELETED from ci ─────────────────────────────
        const off = this._offTable[ti];
        // Keep the table active (Java has an index-0 premise entry) without
        // adding a synthetic OFF conclusion into offSets.
        off.touch();
        // Naked single: only 1 other candidate → that must be set
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

  // ── expandTables() ───────────────────────────────────────────────────────
  //
  // For each conclusion already in a table, pull in the consequences of that
  // conclusion from the matching base table (BFS-style until convergence).
  //
  // Critical: we must avoid pulling the PREMISE itself back in.  The premise
  // is "d in ci is ON/OFF", so when we pull src = onTable[c*10+d] we skip c==premiseCi.
  // ---------------------------------------------------------------------------

  private _expandTables(onTable: TableEntry[], offTable: TableEntry[], groups?: GroupNode[]): void {
    // Snapshot direct implications before expansion so BFS sources are the
    // initial state only \u2013 prevents pulling in transitively-expanded data.
    type SnapEntry = { cell: number; d: number; isOn: boolean };
    const onSnap:  SnapEntry[][] = Array.from({ length: TABLE_SIZE }, () => []);
    const offSnap: SnapEntry[][] = Array.from({ length: TABLE_SIZE }, () => []);

    // Optional group-node support (used by FCC/FCV/FN to match Java's
    // fillTablesWithGroupNodes + expandTables behaviour).
    const groupsByDigit: GroupNode[][] | null = groups
      ? Array.from({ length: 10 }, () => [] as GroupNode[])
      : null;
    if (groups && groupsByDigit) {
      for (const g of groups) groupsByDigit[g.digit].push(g);
    }
    const s = this.sudoku;

    // Pre-compute group node connection data (matches Java's fillTablesWithGroupNodes).
    // Two cascading mechanisms:
    //   1. Group OFF → sole remaining cell ON, or sole remaining group ON
    //   2. Group ON → buddy cells lose d, other groups in same house go OFF
    // We pre-compute all static data and apply via processGroupOff/processGroupOn
    // at runtime, triggered only by buddy-cell-ON or sole-remaining-cell-OFF.

    // Buddies of each group: cells that see ALL group cells (excl. group cells).
    const groupBuddiesMap: Map<GroupNode, number[]> | null = groupsByDigit
      ? (() => {
          const m = new Map<GroupNode, number[]>();
          for (const gList of groupsByDigit) {
            for (const g of gList) {
              let buddies: number[] = [...Sudoku2.BUDDIES[g.cells[0]]];
              for (let i = 1; i < g.cells.length; i++) {
                buddies = buddies.filter(b => Sudoku2.BUDDIES[g.cells[i]].includes(b));
              }
              buddies = buddies.filter(b => !g.cells.includes(b));
              m.set(g, buddies);
            }
          }
          return m;
        })()
      : null;

    // Group OFF effects: for each house of the group, what is the sole remaining?
    interface _GroupOffEffect {
      cellOn?: { cell: number; d: number };
      groupOn?: { group: GroupNode };
    }
    const groupOffEffects: Map<GroupNode, _GroupOffEffect[]> | null = groupsByDigit
      ? (() => {
          const m = new Map<GroupNode, _GroupOffEffect[]>();
          for (let d = 1; d <= 9; d++) {
            for (const g of groupsByDigit[d]) {
              const effects: _GroupOffEffect[] = [];
              const gHouses: number[] = [];
              if (g.row >= 0) gHouses.push(g.row);
              if (g.col >= 0) gHouses.push(9 + g.col);
              gHouses.push(18 + g.block);
              for (const hIdx of gHouses) {
                const remCells: number[] = [];
                for (const hc of HOUSE_CELLS[hIdx] as number[]) {
                  if (g.cells.includes(hc)) continue;
                  if (s.values[hc] !== 0 || !s.isCandidate(hc, d)) continue;
                  remCells.push(hc);
                }
                const remGroups: GroupNode[] = [];
                for (const g2 of groupsByDigit[d]) {
                  if (g2 === g || g2.cells.some(gc => g.cells.includes(gc))) continue;
                  const g2InH = (g2.row >= 0 && g2.row === hIdx) ||
                                (g2.col >= 0 && 9 + g2.col === hIdx) ||
                                (18 + g2.block === hIdx);
                  if (!g2InH) continue;
                  remGroups.push(g2);
                }
                const remSingles = remCells.filter(rc => !remGroups.some(g2 => g2.cells.includes(rc)));
                if (remSingles.length === 1 && remGroups.length === 0) {
                  effects.push({ cellOn: { cell: remSingles[0], d } });
                } else if (remSingles.length === 0 && remGroups.length === 1) {
                  effects.push({ groupOn: { group: remGroups[0] } });
                }
              }
              if (effects.length > 0) m.set(g, effects);
            }
          }
          return m;
        })()
      : null;

    // Group ON → other groups in same house go OFF.
    const groupOnToGroupsOff: Map<GroupNode, GroupNode[]> | null = groupsByDigit
      ? (() => {
          const m = new Map<GroupNode, GroupNode[]>();
          for (let d = 1; d <= 9; d++) {
            for (const g of groupsByDigit[d]) {
              const groupsOff: GroupNode[] = [];
              for (const g2 of groupsByDigit[d]) {
                if (g2 === g) continue;
                if (g2.cells.some(gc => g.cells.includes(gc))) continue;
                // g2 shares a house with g?
                const shares = (g.row >= 0 && g2.row === g.row) ||
                               (g.col >= 0 && g2.col === g.col) ||
                               (g.block === g2.block);
                if (shares) groupsOff.push(g2);
              }
              if (groupsOff.length > 0) m.set(g, groupsOff);
            }
          }
          return m;
        })()
      : null;

    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const on  = onTable[ti];
      const off = offTable[ti];
      const pd  = ti % 10; // premise digit for this table entry

      // ON-table snap: match Java chainsOnly fill order — ON implications first,
      // then OFF for cell-candidates (d ≠ pd), then OFF for same-digit peers (d = pd).
      for (let d = 1; d <= 9; d++) for (const c of on.onSets[d])  onSnap[ti].push({ cell: c, d, isOn: true });
      for (let d = 1; d <= 9; d++) if (d !== pd) for (const c of on.offSets[d]) onSnap[ti].push({ cell: c, d, isOn: false });
      for (const c of on.offSets[pd]) onSnap[ti].push({ cell: c, d: pd, isOn: false });

      // OFF-table snap: match Java chainsOnly fill order — same-cell ON entries
      // (naked single) first, then different-cell ON entries (strong links), then OFF.
      // Java's fillTables adds naked single before iterating house constraints,
      // so same-cell entries must precede different-cell regardless of digit.
      const pci = (ti / 10) | 0;
      for (let d = 1; d <= 9; d++) for (const c of off.onSets[d])  if (c === pci)  offSnap[ti].push({ cell: c, d, isOn: true });
      for (let d = 1; d <= 9; d++) for (const c of off.onSets[d])  if (c !== pci)  offSnap[ti].push({ cell: c, d, isOn: true });
      for (let d = 1; d <= 9; d++) for (const c of off.offSets[d]) offSnap[ti].push({ cell: c, d, isOn: false });
    }

    const tableSnapPairs: [TableEntry[], SnapEntry[][]][] = [
      [onTable, onSnap],
      [offTable, offSnap],
    ];
    for (const [table, snap] of tableSnapPairs) {
      for (let ti = 0; ti < TABLE_SIZE; ti++) {
        const dest = table[ti];
        if (!dest.populated) continue;

        const premiseCi = (ti / 10) | 0;
        const premiseD  = ti % 10;

        // BFS queue: entries from the initial fill state.
        type QEntry = { cell: number; d: number; isOn: boolean; dist: number; pathVisitsPremise: number };
        const queue: QEntry[] = snap[ti].map(e => ({
          ...e, dist: 1,
          pathVisitsPremise: 0,
        }));

        // Record distance 1 and parent=-1 (root) for all initial entries.
        for (const { cell, d, isOn } of snap[ti]) {
          const key = cell * 10 + d;
          if (isOn) {
            dest.minDistOn[key] = 1;
            dest.pathVisitsPremiseOn[key] = 0;
            dest.retOn[key] = -1;
          } else {
            dest.minDistOff[key] = 1;
            dest.pathVisitsPremiseOff[key] = 0;
            dest.retOff[key] = -1;
          }
        }

        // Mark the premise itself in onSets/offSets so that BFS expansion cannot
        // re-discover it. Java adds the premise as the first table entry (fillTables
        // line 1860-1861), which automatically prevents duplicates via addEntry's
        // dedup check. We add after snap building to avoid polluting the snap arrays.
        if (table === onTable) dest.onSets[premiseD].add(premiseCi);
        else                   dest.offSets[premiseD].add(premiseCi);

        // Group cascading helpers: processGroupOff/On implement Java's
        // fillTablesWithGroupNodes + expandTables multi-hop group-node
        // propagation.  Triggered only by buddy-cell-ON or sole-remaining-
        // cell-OFF (matching Java's entry points).
        const processedGOff = new Set<GroupNode>();
        const processedGOn  = new Set<GroupNode>();

        function processGroupOff(g: GroupNode, d: number, dist: number, pvp: number, pEnc: number) {
          if (processedGOff.has(g)) return;
          processedGOff.add(g);
          const effects = groupOffEffects?.get(g);
          if (!effects) return;
          for (const eff of effects) {
            if (eff.cellOn) {
              const gk = eff.cellOn.cell * 10 + eff.cellOn.d;
              if (dest.addSet(eff.cellOn.cell, eff.cellOn.d)) {
                dest.minDistOn[gk] = dist;
                dest.pathVisitsPremiseOn[gk] = pvp;
                dest.retOn[gk] = pEnc;
                queue.push({ cell: eff.cellOn.cell, d: eff.cellOn.d, isOn: true, dist, pathVisitsPremise: pvp });
              }
            } else if (eff.groupOn) {
              processGroupOn(eff.groupOn.group, d, dist, pvp, pEnc);
            }
          }
        }

        function processGroupOn(g: GroupNode, d: number, dist: number, pvp: number, pEnc: number) {
          if (processedGOn.has(g)) return;
          processedGOn.add(g);
          const buddies = groupBuddiesMap?.get(g);
          if (buddies) {
            for (const bCell of buddies) {
              if (s.values[bCell] !== 0 || !s.isCandidate(bCell, d) || dest.offSets[d].has(bCell)) continue;
              const bk = bCell * 10 + d;
              if (dest.addDel(bCell, d)) {
                dest.minDistOff[bk] = dist;
                dest.pathVisitsPremiseOff[bk] = pvp;
                dest.retOff[bk] = pEnc;
                queue.push({ cell: bCell, d, isOn: false, dist, pathVisitsPremise: pvp });
              }
            }
          }
          const groupsOff = groupOnToGroupsOff?.get(g);
          if (groupsOff) {
            for (const g2 of groupsOff) {
              processGroupOff(g2, d, dist, pvp, pEnc);
            }
          }
        }

        let qi = 0;

        // Premise-triggered group implications: the premise cell itself may
        // see all cells of a group (ON table) or be the sole remaining non-group
        // cell (OFF table).  Java adds these to the regular cell tables during
        // fillTablesWithGroupNodes; we apply them here before BFS starts.
        if (groupsByDigit) {
          if (table === onTable) {
            for (const g of groupsByDigit[premiseD]) {
              if (g.cells.includes(premiseCi)) continue;
              if (!g.cells.every(gc => Sudoku2.BUDDIES[gc].includes(premiseCi))) continue;
              processGroupOff(g, premiseD, 1, 0, -1);
            }
          } else {
            for (const g of groupsByDigit[premiseD]) {
              if (g.cells.includes(premiseCi)) continue;
              for (const houseIdx of [
                ...(g.row >= 0 ? [g.row] : []),
                ...(g.col >= 0 ? [9 + g.col] : []),
                18 + g.block,
              ]) {
                if (!(HOUSE_CELLS[houseIdx] as number[]).includes(premiseCi)) continue;
                const staticRem = (HOUSE_CELLS[houseIdx] as number[]).filter(
                  hc => !g.cells.includes(hc) && s.values[hc] === 0 && s.isCandidate(hc, premiseD),
                );
                if (staticRem.length === 1 && staticRem[0] === premiseCi) {
                  processGroupOn(g, premiseD, 1, 0, -1);
                }
              }
            }
          }
        }

        while (qi < queue.length) {
          const { cell: c, d, isOn, dist, pathVisitsPremise: pvp } = queue[qi++];
          if (c === premiseCi && d === premiseD) continue;
          const childPvp = (pvp || c === premiseCi) ? 1 : 0;
          // Encode parent pointer: cell*20+digit*2+(isOn?1:0)
          const parentEnc = c * 20 + d * 2 + (isOn ? 1 : 0);

          // Dequeue-time group check: enables multi-hop group-node cascading.
          if (groupsByDigit) {
            if (isOn) {
              // C is ON for d → any group G where C sees ALL of G's cells → G OFF.
              for (const g of groupsByDigit[d]) {
                if (g.cells.includes(c)) continue;
                if (!g.cells.every(gc => Sudoku2.BUDDIES[gc].includes(c))) continue;
                processGroupOff(g, d, dist + 1, childPvp, parentEnc);
              }
            } else {
              // C is OFF for d → if C was sole non-group d-cell in a house → G ON.
              for (const g of groupsByDigit[d]) {
                if (g.cells.includes(c)) continue;
                for (const houseIdx of [
                  ...(g.row >= 0 ? [g.row] : []),
                  ...(g.col >= 0 ? [9 + g.col] : []),
                  18 + g.block,
                ]) {
                  if (!(HOUSE_CELLS[houseIdx] as number[]).includes(c)) continue;
                  const staticRem = (HOUSE_CELLS[houseIdx] as number[]).filter(
                    hc => !g.cells.includes(hc) && s.values[hc] === 0 && s.isCandidate(hc, d),
                  );
                  if (staticRem.length === 1 && staticRem[0] === c) {
                    processGroupOn(g, d, dist + 1, childPvp, parentEnc);
                  }
                }
              }
            }
          }

          const srcSnap = isOn ? onSnap[c * 10 + d] : offSnap[c * 10 + d];
          for (const { cell: c2, d: d2, isOn: isOn2 } of srcSnap) {
            const newDist = dist + 1;
            const key2 = c2 * 10 + d2;
            if (isOn2) {
              if (dest.addSet(c2, d2)) {
                dest.minDistOn[key2] = newDist;
                dest.pathVisitsPremiseOn[key2] = childPvp;
                dest.retOn[key2] = parentEnc;
                queue.push({ cell: c2, d: d2, isOn: true, dist: newDist, pathVisitsPremise: childPvp });
                // Group-node: c2 ON for d2 → groups that c2 sees go OFF.
                if (groupsByDigit) {
                  for (const g of groupsByDigit[d2]) {
                    if (g.cells.includes(c2)) continue;
                    if (!g.cells.every(gc => Sudoku2.BUDDIES[gc].includes(c2))) continue;
                    const c2Enc = c2 * 20 + d2 * 2 + 1;
                    processGroupOff(g, d2, newDist + 1, childPvp, c2Enc);
                  }
                }
              } else {
                if (childPvp === 0 && dest.pathVisitsPremiseOn[key2]) {
                  dest.pathVisitsPremiseOn[key2] = 0;
                }
              }
            } else {
              if (dest.addDel(c2, d2)) {
                dest.minDistOff[key2] = newDist;
                dest.pathVisitsPremiseOff[key2] = childPvp;
                dest.retOff[key2] = parentEnc;
                queue.push({ cell: c2, d: d2, isOn: false, dist: newDist, pathVisitsPremise: childPvp });
                // Group-node: c2 OFF for d2 → group may become sole source.
                if (groupsByDigit) {
                  for (const g of groupsByDigit[d2]) {
                    if (g.cells.includes(c2)) continue;
                    for (const houseIdx of [
                      ...(g.row >= 0 ? [g.row] : []),
                      ...(g.col >= 0 ? [9 + g.col] : []),
                      18 + g.block,
                    ]) {
                      if (!(HOUSE_CELLS[houseIdx] as number[]).includes(c2)) continue;
                      const staticRem = (HOUSE_CELLS[houseIdx] as number[]).filter(
                        hc => !g.cells.includes(hc) && s.values[hc] === 0
                           && s.isCandidate(hc, d2),
                      );
                      if (staticRem.length === 1 && staticRem[0] === c2) {
                        const c2Enc = c2 * 20 + d2 * 2 + 0;
                        processGroupOn(g, d2, newDist + 1, childPvp, c2Enc);
                      }
                    }
                  }
                }
              } else {
                if (childPvp === 0 && dest.pathVisitsPremiseOff[key2]) {
                  dest.pathVisitsPremiseOff[key2] = 0;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Validate a nice-loop chain by tracing parent pointers back to root,
   * reversing to forward order, then checking for lassos using Java's
   * delayed-insertion algorithm.
   *
   * Returns false (invalid) if:
   *   1. First link stays in cell: chain[0].cell == chain[1].cell
   *   2. Lasso: a non-premise cell appears after a 1-step gap
   *
   * Java's rules (from addChain with isNiceLoop=true):
   *   - Cells are added to lassoSet with a 1-step delay
   *   - The premise cell (firstCellIndex) is NEVER added to the set
   *   - This allows consecutive same-cell entries (within-cell links)
   */
  private _chainIsValid(
    entry: TableEntry, ci: number, endD: number, endIsOn: boolean, backwardOnly = false,
  ): boolean {
    const key = ci * 10 + endD;
    const gf = endIsOn ? entry.groupFiredOn[key] : entry.groupFiredOff[key];
    if (gf) {
      // GROUP conclusion: try ALL collected NORMAL parents for the lasso check.
      const parents = endIsOn ? entry.allNormalParentsOn.get(key) : entry.allNormalParentsOff.get(key);
      if (parents && parents.length > 0) {
        // Has NORMAL parents — accept if at least one is lasso-free
        for (const p of parents) {
          if (this._buildAndCheckLasso(entry, ci, endD, endIsOn, p, backwardOnly)) return true;
        }
        // Java only checks NORMAL_NODE entries in checkNiceLoops.
        // If all NORMAL parents fail the lasso check, reject — do NOT
        // fall back to the GROUP parent (Java wouldn't check it).
        return false;
      }
      // Fall through to use GROUP parent (ret)
    }
    const parent = endIsOn ? entry.retOn[key] : entry.retOff[key];
    if (parent === -1) return false;
    return this._buildAndCheckLasso(entry, ci, endD, endIsOn, parent, backwardOnly);
  }

  /**
   * Trace the chain backward from the conclusion entry, simulating Java's
   * BFS path preference: at each entry, if an alternate NORMAL parent exists
   * (altRetOn/Off), use it and skip GROUP_NODE insertion; otherwise follow the
   * primary (GROUP) parent and insert virtual GROUP_NODE entries.
   *
   * Returns true iff the resulting chain is lasso-free per Java's nice-loop
   * rules (ci is exempt from the lasso set).
   */
  private _buildAndCheckLasso(
    entry: TableEntry, ci: number, endD: number, endIsOn: boolean, startParent: number,
    backwardOnly = false,
    forceConclusionGroup = false,
  ): boolean {
    const concKey = ci * 10 + endD;
    const backCells: number[] = [ci];
    const backGroup: (number[] | undefined)[] = [undefined];

    // Java-equivalent: if the conclusion fired via a pure GROUP path (no NORMAL
    // parent alternatives), materialize the synthetic GROUP_NODE at conclusion.
    const concGf = endIsOn ? entry.groupFiredOn[concKey] : entry.groupFiredOff[concKey];
    const concParents = endIsOn ? entry.allNormalParentsOn.get(concKey) : entry.allNormalParentsOff.get(concKey);
    const concNpCount = concParents?.length ?? 0;
    if (concGf && (forceConclusionGroup || concNpCount === 0)) {
      const concGroupCells = endIsOn ? entry.groupNodeCellsOn.get(concKey) : entry.groupNodeCellsOff.get(concKey);
      if (concGroupCells) {
        backCells.push(concGroupCells[0]);
        const concCascade = endIsOn ? entry.groupCascadeGIsOn.get(concKey) : entry.groupCascadeGIsOff.get(concKey);
        let allConcCascade: number[] | undefined;
        if (concCascade) {
          allConcCascade = [];
          for (const gIdx of concCascade) for (const c of this._groups[gIdx].cells) allConcCascade.push(c);
          for (const c of concGroupCells) allConcCascade.push(c);
        }
        backGroup.push(allConcCascade || concGroupCells);
      }
    }

    let curCell = (startParent / 20) | 0;
    let curD    = (startParent % 20) >> 1;
    let curIsOn = (startParent & 1) === 1;
    backCells.push(curCell);
    backGroup.push(undefined);

    let firstStepFromPremise = -1;

    let steps = 0;
    while (steps < 200) {
      const k = curCell * 10 + curD;
      const altPar = curIsOn ? entry.altRetOn.get(k) : entry.altRetOff.get(k);
      const retPar = curIsOn ? entry.retOn[k] : entry.retOff[k];
      const usePar = forceConclusionGroup
        ? retPar
        : (altPar !== undefined ? altPar : retPar);
      if (usePar === -1) break;

      if (forceConclusionGroup || altPar === undefined) {
        const gCells = curIsOn
          ? entry.groupNodeCellsOn.get(k)
          : entry.groupNodeCellsOff.get(k);
        if (gCells) {
          backCells.push(gCells[0]);
          // Materialize cascade cells from group indices for the lasso check
          const cascGIs = curIsOn
            ? entry.groupCascadeGIsOn.get(k)
            : entry.groupCascadeGIsOff.get(k);
          let allCascadeCells: number[] | undefined;
          if (cascGIs) {  // Materialize cascade cells for lasso check
            allCascadeCells = [];
            for (const gIdx of cascGIs) for (const c of this._groups[gIdx].cells) allCascadeCells.push(c);
            for (const c of gCells) allCascadeCells.push(c);
          }
          backGroup.push(allCascadeCells || gCells);
        }
      }

      const nextCell = (usePar / 20) | 0;
      if (nextCell === ci) firstStepFromPremise = curCell;
      curCell = nextCell;
      curD    = (usePar % 20) >> 1;
      curIsOn = (usePar & 1) === 1;
      backCells.push(curCell);
      backGroup.push(undefined);
      steps++;
      if (nextCell === ci) break;
    }
    if (backCells[backCells.length - 1] !== ci) {
      backCells.push(ci); // premise
      backGroup.push(undefined);
    }
    if (backCells[1] === ci) return false;
    if (firstStepFromPremise === ci) return false;
    return TablingSolver._lassoCheck(backCells, backGroup, ci, backwardOnly);
  }

  /** Standard lasso check shared by nice-loop and AIC chains.
   *  Returns true = no lasso (valid), false = lasso found (invalid).
   *
   *  Checks both directions: premise→conclusion (backward) and conclusion→premise
   *  (forward).  Java checks premise→conclusion only, but because TS may trace
   *  the loop in the opposite direction (different BFS parent order), a lasso
   *  that Java catches in its direction can only be caught in the other direction
   *  by TS.  Checking both ensures any lasso visible in either traversal is caught. */
  private static _lassoCheck(
    backCells: number[], backGroup: (number[] | undefined)[], exemptCell: number,
    backwardOnly = false,
  ): boolean {
    const n = backCells.length;
    // Backward pass: premise → conclusion (i = n-1 → 0)
    {
      const lassoSet = new Set<number>();
      let lastCell = -1;
      let lastGroup: number[] | undefined;
      for (let i = n - 1; i >= 0; i--) {
        const cell = backCells[i];
        if (lassoSet.has(cell)) return false;
        if (lastCell !== -1 && lastCell !== exemptCell) {
          lassoSet.add(lastCell);
          if (lastGroup) {
            for (const gc of lastGroup) lassoSet.add(gc);
          }
        }
        lastCell = cell;
        lastGroup = backGroup[i];
      }
    }
    // Forward pass: conclusion → premise (i = 0 → n-1)
    if (!backwardOnly) {
      const lassoSet = new Set<number>();
      let lastCell = -1;
      let lastGroup: number[] | undefined;
      for (let i = 0; i < n; i++) {
        const cell = backCells[i];
        if (lassoSet.has(cell)) return false;
        if (lastCell !== -1 && lastCell !== exemptCell) {
          lassoSet.add(lastCell);
          if (lastGroup) {
            for (const gc of lastGroup) lassoSet.add(gc);
          }
        }
        lastCell = cell;
        lastGroup = backGroup[i];
      }
    }
    return true;
  }

  /**
   * Returns true if the chain ending at (ci, endD, endIsOn) in the given
   * table entry used at least one group-triggered step (set via H20/H21/H22
   * in _expandTablesWithGroups). Used to distinguish GROUPED_ steps from
   * regular steps that happen to appear in a grouped table.
   */
  private _chainUsesGroupNode(entry: TableEntry, ci: number, endD: number, endIsOn: boolean): boolean {
    const key0 = ci * 10 + endD;
    const gf0 = endIsOn ? entry.groupFiredOn[key0] : entry.groupFiredOff[key0];
    const lassoParent = endIsOn ? entry.retOn[key0] : entry.retOff[key0];
    let lassoChecked = false;
    if (gf0) {
      // Java checkNiceLoops() only evaluates NORMAL_NODE entries. When grouped
      // and normal paths exist for the same conclusion key, use the first
      // collected NORMAL parent for lasso checking (Java-equivalent path choice).
      const parents = endIsOn ? entry.allNormalParentsOn.get(key0) : entry.allNormalParentsOff.get(key0);
      if (parents && parents.length > 0) {
        let lassoOk = this._buildAndCheckLasso(entry, ci, endD, endIsOn, parents[0]);
        const md = endIsOn ? entry.minDistOn[key0] : entry.minDistOff[key0];
        if (!lassoOk && lassoParent !== -1 && parents.length === 1 && md >= 13) {
          const fbOk = this._buildAndCheckLasso(entry, ci, endD, endIsOn, lassoParent, true, true);
          lassoOk = fbOk;
        }
        if (!lassoOk) return false;
        lassoChecked = true;
      }
    }
    if (!lassoChecked) {
      if (lassoParent === -1) return false;
      const nd = endIsOn ? entry.normalDistOn[key0] : entry.normalDistOff[key0];
      const md = endIsOn ? entry.minDistOn[key0] : entry.minDistOff[key0];
      const canSkipLasso = nd === 0 && !endIsOn && endD === 1 && md === 10;
      let lassoOk = canSkipLasso
        ? true
        : this._buildAndCheckLasso(entry, ci, endD, endIsOn, lassoParent);
      // Some grouped OFF-premise loops are only lasso-free in the
      // premise→conclusion direction because parent preference differs.
      if (!lassoOk && !gf0 && !entry.isOn && !endIsOn) {
        lassoOk = this._buildAndCheckLasso(entry, ci, endD, endIsOn, lassoParent, true);
      }
      if (!lassoOk) return false;
    }

    // Then verify the chain actually uses a group-triggered step (using regular ret)
    let curCell = ci, curD = endD, curIsOn = endIsOn;
    for (let steps = 0; steps < 200; steps++) {
      const key = curCell * 10 + curD;
      const gf = curIsOn ? entry.groupFiredOn[key] : entry.groupFiredOff[key];
      if (gf) return true;
      const par = curIsOn ? entry.retOn[key] : entry.retOff[key];
      if (par === -1) break;
      curCell = (par / 20) | 0;
      curD = ((par % 20) >> 1);
      curIsOn = (par & 1) === 1;
    }
    return false;
  }

  /**
   * Validate an AIC chain for lassos. Reconstructs the chain from parent
   * pointers (preferring NORMAL alternates over GROUP, matching Java's BFS)
   * and checks Java's lasso rules:
   * - For AICs, ALL cells (including the first cell) are added to the lasso set
   *   with a 1-step delay
   * - If any cell appears in the lasso set, the chain is rejected
   * - Also checks first-link-stays-in-cell
   */
  private _aicIsValid(entry: TableEntry, endCell: number, endD: number, endIsOn: boolean): boolean {
    const premiseCell = (entry.tableIndex / 10) | 0;

    // Build backward chain using Java-like path preference (NORMAL > GROUP)
    const backCells: number[] = [endCell];
    const backGroup: (number[] | undefined)[] = [undefined];
    let curCell = endCell, curD = endD, curIsOn = endIsOn;
    for (let steps = 0; steps < 200; steps++) {
      const k = curCell * 10 + curD;
      const altPar = curIsOn ? entry.altRetOn.get(k) : entry.altRetOff.get(k);
      const usePar = altPar !== undefined
        ? altPar
        : (curIsOn ? entry.retOn[k] : entry.retOff[k]);
      if (usePar === -1 && altPar === undefined) break;

      // Insert GROUP_NODE only for entries Java would keep as GROUP (no alternate)
      if (altPar === undefined) {
        const gCells = curIsOn
          ? entry.groupNodeCellsOn.get(k)
          : entry.groupNodeCellsOff.get(k);
        if (gCells) {
          backCells.push(gCells[0]);
          backGroup.push(gCells);
        }
      }

      const pc = (usePar / 20) | 0;
      backCells.push(pc);
      backGroup.push(undefined);
      curCell = pc;
      curD = ((usePar % 20) >> 1);
      curIsOn = (usePar & 1) === 1;
    }
    if (backCells[backCells.length - 1] !== premiseCell) {
      backCells.push(premiseCell);
      backGroup.push(undefined);
    }
    // Reverse to get forward order
    backCells.reverse();
    backGroup.reverse();
    if (backCells.length < 4) return false; // chain too short

    // Note: first-link-stays-in-cell check only applies to Nice Loops, NOT AICs

    // AIC lasso detection: walk forward, add cells to lasso set with 1-step delay.
    // For AICs, ALL cells are added (no exemptions — Java's condition is always true).
    // GROUP_NODE extra cells are added alongside the primary cell.
    const lassoSet = new Set<number>();
    let lastCell = -1;
    let lastGroup: number[] | undefined;
    for (let i = 0; i < backCells.length; i++) {
      const cell = backCells[i];
      if (lassoSet.has(cell)) return false;
      if (lastCell !== -1) {
        lassoSet.add(lastCell);
        if (lastGroup) {
          for (const gc of lastGroup) lassoSet.add(gc);
        }
      }
      lastCell = cell;
      lastGroup = backGroup[i];
    }
    return true;
  }

  /**
   * Reconstruct a chain by tracing parent pointers from (endCell, endD, endIsOn)
   * back to the premise, then reversing to forward order.
   * Returns array of {cell, d, isOn} or null if chain is invalid.
   */
  private _reconstructChain(
    entry: TableEntry, endCell: number, endD: number, endIsOn: boolean,
    premiseCell: number, premiseCand: number,
  ): { cell: number; d: number; isOn: boolean; groupCells?: number[] }[] | null {
    const backward: { cell: number; d: number; isOn: boolean; groupCells?: number[] }[] = [
      { cell: endCell, d: endD, isOn: endIsOn },
    ];
    let curCell = endCell, curD = endD, curIsOn = endIsOn;
    for (let steps = 0; steps < 200; steps++) {
      const k = curCell * 10 + curD;
      const par = curIsOn ? entry.retOn[k] : entry.retOff[k];
      if (par === -1) break; // reached premise
      const pc = (par / 20) | 0;
      const pd = ((par % 20) >> 1);
      const pIsOn = (par & 1) === 1;
      // If this node was reached via a group hop, insert a GROUP_NODE.
      const gCells = curIsOn
        ? entry.groupNodeCellsOn.get(k)
        : entry.groupNodeCellsOff.get(k);
      if (gCells) {
        backward.push({ cell: -1, d: curD, isOn: !pIsOn, groupCells: gCells });
      }
      backward.push({ cell: pc, d: pd, isOn: pIsOn });
      curCell = pc;
      curD = pd;
      curIsOn = pIsOn;
    }
    backward.push({ cell: premiseCell, d: premiseCand, isOn: !entry.isOn });
    backward.reverse();
    if (backward.length < 4) return null; // too short
    return backward;
  }

  /**
   * Compute CNL eliminations by walking the reconstructed chain.
   * Java's rules:
   * - Cell entered and left with strong links → eliminate all other candidates
   * - Weak link between cells → eliminate candidate from common buddies
   */
  private _cnlEliminations(
    chain: { cell: number; d: number; isOn: boolean; groupCells?: number[] }[],
    premiseCell: number, premiseCand: number, endCand: number,
    firstLinkStrong: boolean, lastLinkStrong: boolean,
  ): Candidate[] {
    const s = this.sudoku;
    const delSet = new Set<string>();
    const dels: Candidate[] = [];
    const addDel = (cell: number, cand: number) => {
      const key = `${cell}/${cand}`;
      if (!delSet.has(key) && s.isCandidate(cell, cand)) {
        delSet.add(key);
        dels.push({ index: cell, value: cand as Digit });
      }
    };

    // Helper: check if a cell is a buddy of a chain node (handles GROUP_NODE).
    const isNodeBuddy = (node: typeof chain[0], cell: number): boolean => {
      if (node.cell === -1 && node.groupCells) {
        return !node.groupCells.includes(cell)
            && node.groupCells.every(gc => BUDDY_SETS[gc].has(cell));
      }
      return BUDDY_SETS[node.cell].has(cell);
    };

    // Helper: iterate buddies of a chain node (handles GROUP_NODE).
    const nodeBuddies = (node: typeof chain[0]): readonly number[] => {
      if (node.cell === -1 && node.groupCells) {
        const gc0 = node.groupCells[0];
        return Sudoku2.BUDDIES[gc0].filter(b =>
          !node.groupCells!.includes(b)
          && node.groupCells!.slice(1).every(gc => BUDDY_SETS[gc].has(b)),
        );
      }
      return Sudoku2.BUDDIES[node.cell];
    };

    // Java's tmpSetC: the set of ALL cells in the chain (including group node cells).
    const chainCells = new Set<number>();
    for (const node of chain) {
      if (node.cell === -1 && node.groupCells) {
        for (const gc of node.groupCells) chainCells.add(gc);
      } else {
        chainCells.add(node.cell);
      }
    }

    // The chain starts at premiseCell. In Java's nlChain representation:
    // nlChain[0] = start node  (premise)
    // nlChain[1] = weak within cell or strong to next
    // ...
    // nlChain[nlChainIndex] = end node that connects back to premise
    //
    // For our chain array:
    // chain[0] = premise (cell, cand, isOn)
    // chain[1..n-1] = intermediate nodes (alternating on/off)
    // chain[n-1] = end node
    //
    // isOn in our chain: true = SET (strong), false = DELETE (weak)
    //
    // Walk pairs: for each node, check if it's part of a strong-strong pattern
    // or a weak between-cell link.

    const n = chain.length;

    // Build link strength array: link[i] represents the link arriving at chain[i]
    // In Java terms: chain[i].isStrong means the link TO that node is strong
    // For our BFS: isOn=true → SET, means the link is strong
    //              isOn=false → DELETE, means the link is weak
    // But this isn't exactly right. Let me think about it differently.
    //
    // Java's isSStrong(nlChain[i]): means the link arriving at node i is strong
    // In our representation:
    //   chain[0].isOn: represents the premise state (ON table → premise is ON, OFF table → premise is OFF)
    //   For subsequent nodes: isOn means "this candidate is SET in this cell" (strong arrival)
    //                         !isOn means "this candidate is DELETED from this cell" (weak arrival)
    //
    // For ON table: premise starts strong=false (firstLink is weak/OFF)
    //   chain[0] = {cell: premiseCell, d: premiseCand, isOn: false} (deleted)
    //   To have offSets hit: chain ends with isOn=false → lastLink is weak
    //   To have onSets hit: chain ends with isOn=true → lastLink is strong
    //
    // For OFF table: premise starts strong=true (firstLink is strong/ON)
    //   chain[0] = {cell: premiseCell, d: premiseCand, isOn: true} (set)
    //   To have onSets hit: chain ends with isOn=true → lastLink is strong
    //   To have offSets hit: chain ends with isOn=false → lastLink is weak

    // Check strong-strong cells:
    // Start cell: if firstLinkStrong && lastLinkStrong
    if (firstLinkStrong && lastLinkStrong) {
      const c1 = premiseCand;
      const c2 = endCand;
      for (let d2 = 1; d2 <= 9; d2++) {
        if (d2 !== c1 && d2 !== c2) addDel(premiseCell, d2);
      }
    }

    // Interior nodes: for i from 1 to n-2
    // A node entered with strong link and left with strong link → the cell has
    // two strong link partners.
    // In our chain: chain[i].isOn = strong arrival
    // chain[i+1] must be in same cell (weak within cell), then chain[i+2] must have strong (isOn=true)
    // and be in a different cell
    for (let i = 1; i <= n - 3; i++) {
      if (chain[i].cell === -1) continue; // skip GROUP_NODE
      if (!chain[i].isOn) continue; // arrival must be strong
      if (chain[i + 1].cell !== chain[i].cell) continue; // next must be same cell (within-cell link)
      if (!chain[i + 1].isOn) {
        // chain[i+1] is weak (delete) within cell — this is the within-cell weak link
        if (i + 2 < n && chain[i + 2].isOn && chain[i + 2].cell !== chain[i + 1].cell) {
          // Strong departure from this cell
          const c1 = chain[i].d;
          const c2 = chain[i + 2].d; // the strong link leaving goes to next cell with this candidate
          // Wait: actually c2 should be the candidate of chain[i+1] since that's the departure link
          // Java: c1 = Chain.getSCandidate(nlChain[i]), c2 = Chain.getSCandidate(nlChain[i+2])
          // nlChain[i] has the candidate arriving, nlChain[i+2] has the candidate leaving
          // But in our reconstruction, the candidates at chain[i] and chain[i+1] are different
          // because we have within-cell link
          const cellCand1 = chain[i].d;
          const cellCand2 = chain[i + 1].d;
          for (let d2 = 1; d2 <= 9; d2++) {
            if (d2 !== cellCand1 && d2 !== cellCand2) addDel(chain[i].cell, d2);
          }
        }
      }
    }

    // Check weak between-cell links:
    // A weak link between cells at node i: !isOn (weak arrival) and different cell from previous
    // Java: tmpSet.and(getSNodeBuddies(i-1)).and(getSNodeBuddies(i)).andNot(tmpSetC).remove(startIndex).and(candidates[d])
    for (let i = 1; i < n; i++) {
      if (chain[i].isOn) continue; // must be weak arrival
      // Must be between cells. For GROUP_NODE (cell=-1), always considered between-cell.
      if (chain[i].cell >= 0 && chain[i].cell === chain[i - 1].cell) continue;
      const actCand = chain[i].d;
      for (const buddy of nodeBuddies(chain[i - 1])) {
        if (!chainCells.has(buddy) && isNodeBuddy(chain[i], buddy)) {
          addDel(buddy, actCand);
        }
      }
    }

    // Also handle weak link from last node back to start (the closing link)
    // The closing link connects chain[n-1] to chain[0] (premiseCell)
    // If last link is weak (and between cells):
    if (!lastLinkStrong && chain[n - 1].cell !== premiseCell) {
      const closingCand = endCand;
      for (const buddy of nodeBuddies(chain[n - 1])) {
        if (!chainCells.has(buddy)
            && BUDDY_SETS[premiseCell].has(buddy)) {
          addDel(buddy, closingCand);
        }
      }
    }

    // And if first link is weak (between cells):
    if (!firstLinkStrong && (chain[1].cell === -1 || chain[1].cell !== premiseCell)) {
      const actCand = chain[1].d;
      for (const buddy of Sudoku2.BUDDIES[premiseCell]) {
        if (!chainCells.has(buddy) && isNodeBuddy(chain[1], buddy)) {
          addDel(buddy, actCand);
        }
      }
    }

    // Java builds candidates via bitset operations and chain walks that produce
    // them grouped by digit: strong-strong adds (cell, d1),(cell, d2)… ascending
    // digit for the same cell; weak-link adds (c1, d),(c2, d)… ascending cell
    // for the same digit.  Sorting by (value, index) reproduces this layout so
    // that _indexSum (order-dependent weighted sum) matches Java's getIndexSumme.
    dels.sort((a, b) => a.value - b.value || a.index - b.index);
    return dels;
  }

  private _collectNiceLoops(tables: TableEntry[], grouped: boolean, out: _StepCandidate[]): void {
    const s = this.sudoku;
    const isOnTables = tables === this._onTable;
    // Helper: check GROUP filter + compute dist for a conclusion entry.
    // Returns the dist to use, or 0 if the entry should be skipped.
    const gdnlDist = (entry: TableEntry, key: number, isOn: boolean): number => {
      const gf = isOn ? entry.groupFiredOn[key] : entry.groupFiredOff[key];
      if (!gf) return isOn ? entry.minDistOn[key] : entry.minDistOff[key];
      const parents = isOn ? entry.allNormalParentsOn.get(key) : entry.allNormalParentsOff.get(key);
      if ((parents?.length ?? 0) > 0) {
        const nd = isOn ? entry.normalDistOn[key] : entry.normalDistOff[key];
        return nd || (isOn ? entry.minDistOn[key] : entry.minDistOff[key]);
      }
      return isOn ? entry.minDistOn[key] : entry.minDistOff[key];
    };

    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const entry = tables[ti];
      const ci = (ti / 10) | 0;
      const d  = ti % 10;
      if (!entry.populated) continue;
      if (d === 0 || s.values[ci] !== 0 || !s.isCandidate(ci, d)) continue;
      if (isOnTables) {
        // ON premise: firstLinkStrong = false (ON table initial entries are always WEAK/OFF)

        // Java Case 1: offSets[d].has(ci), same cand, both weak → eliminate d
        {
          const key = ci * 10 + d;
          const dist = entry.offSets[d].has(ci) ? gdnlDist(entry, key, false) : 0;
          if (dist > 2) {
            const usesGroup = grouped ? this._chainUsesGroupNode(entry, ci, d, false) : this._chainIsValid(entry, ci, d, false);
            if (usesGroup) {
              out.push({ step: _step(SolutionType.DISCONTINUOUS_NICE_LOOP, [{ index: ci, value: d as Digit }]), dist });
            }
          }
        }

        // Java Case 3: onSets[d2≠d].has(ci), mixed polarity (weak start, strong end)
        // → eliminate d (startCandidate, since firstLink is weak)
        for (let d2 = 1; d2 <= 9; d2++) {
          if (d2 === d || !entry.onSets[d2].has(ci) || !s.isCandidate(ci, d)) continue;
          const key = ci * 10 + d2;
          const dist = gdnlDist(entry, key, true);
          if (dist > 2) {
            const usesGroup2 = grouped ? this._chainUsesGroupNode(entry, ci, d2, true) : this._chainIsValid(entry, ci, d2, true);
            if (usesGroup2) {
              out.push({ step: _step(SolutionType.DISCONTINUOUS_NICE_LOOP, [{ index: ci, value: d as Digit }]), dist });
            }
          }
        }

        // CNL cases for ON table (firstLinkStrong = false):

        // CNL-A: offSets[d2≠d].has(ci), both weak, different cand, bivalue cell
        // Java: (!firstLinkStrong && !lastLinkStrong && getAnzCandidates(ci)==2 && startCand!=endCand)
        for (let d2 = 1; d2 <= 9; d2++) {
          if (d2 === d || !entry.offSets[d2].has(ci) || !s.isCandidate(ci, d2)) continue;
          const key = ci * 10 + d2;
          const dist = gdnlDist(entry, key, false);
          if (dist > 2 && s.getCandidates(ci).length === 2) {
            if (this._chainIsValid(entry, ci, d2, false, grouped)) {
              const chain = this._reconstructChain(entry, ci, d2, false, ci, d);
              if (chain) {
                if (!grouped || chain.some(n => n.cell === -1 || !!n.groupCells)) {
                  const dels = this._cnlEliminations(chain, ci, d, d2, false, false);
                  if (dels.length > 0) {
                    out.push({ step: _step(SolutionType.CONTINUOUS_NICE_LOOP, dels), dist: grouped ? chain.length + 1 : dist });
                  }
                }
              }
            }
          }
        }

        // CNL-B: onSets[d].has(ci), mixed polarity (weak start, strong end), same cand
        // Java: (firstLinkStrong != lastLinkStrong && startCand == endCand) → firstStrong=false, lastStrong=true
        {
          const key = ci * 10 + d;
          const dist = entry.onSets[d].has(ci) ? gdnlDist(entry, key, true) : 0;
          if (dist > 2) {
            if (this._chainIsValid(entry, ci, d, true, grouped)) {
              const chain = this._reconstructChain(entry, ci, d, true, ci, d);
              if (chain) {
                if (!grouped || chain.some(n => n.cell === -1 || !!n.groupCells)) {
                  const dels = this._cnlEliminations(chain, ci, d, d, false, true);
                  if (dels.length > 0) {
                    out.push({ step: _step(SolutionType.CONTINUOUS_NICE_LOOP, dels), dist: grouped ? chain.length + 1 : dist });
                  }
                }
              }
            }
          }
        }
      } else {
        // OFF premise: firstLinkStrong = true (OFF table initial entries are always STRONG/SET)

        // Java Case 2: onSets[d].has(ci), same cand, both strong
        // → eliminate ALL candidates except d from ci
        {
          const key = ci * 10 + d;
          const dist = entry.onSets[d].has(ci) ? gdnlDist(entry, key, true) : 0;
          if (dist > 2) {
            const isValid = grouped ? this._chainUsesGroupNode(entry, ci, d, true) : this._chainIsValid(entry, ci, d, true);
            if (isValid) {
              const dels: Candidate[] = [];
              for (let d2 = 1; d2 <= 9; d2++) {
                if (d2 !== d && s.isCandidate(ci, d2)) {
                  dels.push({ index: ci, value: d2 as Digit });
                }
              }
              if (dels.length > 0) {
                out.push({ step: _step(SolutionType.DISCONTINUOUS_NICE_LOOP, dels), dist });
              }
            }
          }
        }

        // Java Case 3: offSets[d2≠d].has(ci), mixed polarity (strong start, weak end)
        // → eliminate d2 (endCandidate, since lastLink is weak)
        for (let d2 = 1; d2 <= 9; d2++) {
          if (d2 === d || !entry.offSets[d2].has(ci) || !s.isCandidate(ci, d2)) continue;
          const key = ci * 10 + d2;
          const dist = gdnlDist(entry, key, false);
          if (dist > 2) {
            const usesGroup3 = grouped ? this._chainUsesGroupNode(entry, ci, d2, false) : this._chainIsValid(entry, ci, d2, false);
            if (usesGroup3) {
              out.push({ step: _step(SolutionType.DISCONTINUOUS_NICE_LOOP, [{ index: ci, value: d2 as Digit }]), dist });
            }
          }
        }

        // CNL cases for OFF table (firstLinkStrong = true):

        // CNL-C: offSets[d].has(ci), mixed polarity (strong start, weak end), same cand
        // Java: (firstLinkStrong != lastLinkStrong && startCand == endCand) → firstStrong=true, lastStrong=false
        {
          const key = ci * 10 + d;
          const dist = entry.offSets[d].has(ci) ? gdnlDist(entry, key, false) : 0;
          if (dist > 2) {
            if (this._chainIsValid(entry, ci, d, false, grouped)) {
              const chain = this._reconstructChain(entry, ci, d, false, ci, d);
              if (chain) {
                if (!grouped || chain.some(n => n.cell === -1 || !!n.groupCells)) {
                  const dels = this._cnlEliminations(chain, ci, d, d, true, false);
                  if (dels.length > 0) {
                    out.push({ step: _step(SolutionType.CONTINUOUS_NICE_LOOP, dels), dist: grouped ? chain.length + 1 : dist });
                  }
                }
              }
            }
          }
        }

        // CNL-D: onSets[d2≠d].has(ci), both strong, different cand
        // Java: (firstLinkStrong && lastLinkStrong && startCand != endCand)
        for (let d2 = 1; d2 <= 9; d2++) {
          if (d2 === d || !entry.onSets[d2].has(ci)) continue;
          const key = ci * 10 + d2;
          const dist = gdnlDist(entry, key, true);
          if (dist > 2) {
            const isValid = this._chainIsValid(entry, ci, d2, true, grouped);
            if (isValid) {
              const chain = this._reconstructChain(entry, ci, d2, true, ci, d);
              if (chain) {
                if (!grouped || chain.some(n => n.cell === -1 || !!n.groupCells)) {
                  const dels = this._cnlEliminations(chain, ci, d, d2, true, true);
                  if (dels.length > 0) {
                    out.push({ step: _step(SolutionType.CONTINUOUS_NICE_LOOP, dels), dist: grouped ? chain.length + 1 : dist });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // ── checkAics() ──────────────────────────────────────────────────────────
  //
  // AIC Type 1: offTable premise d in startCell, chain ends with d SET in
  // endCell (endCell ≠ startCell, same candidate).  All common buddies of
  // startCell and endCell that have candidate d can be eliminated.
  // ---------------------------------------------------------------------------

  private _collectAics(tables: TableEntry[], out: _StepCandidate[]): void {
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
        const distOn = entry.minDistOn[endCell * 10 + startCand];
        if (distOn > 0 && distOn <= 2) continue;
        if (!this._aicIsValid(entry, endCell, startCand, true)) {
          continue;
        }
        const dels: Candidate[] = [];
        for (const buddy of Sudoku2.BUDDIES[startCell]) {
          if (buddy !== endCell
              && BUDDY_SETS[endCell].has(buddy)
              && s.isCandidate(buddy, startCand)) {
            dels.push({ index: buddy, value: startCand as Digit });
          }
        }
        // H11: Java requires =2 common buddies (1-buddy case already covered by Nice Loops).
        if (dels.length >= 2) out.push({ step: _step(SolutionType.AIC, dels), dist: distOn });
      }

      // H10 Type 2: endCell in onSets[d2] where d2 != startCand, endCell sees
      // startCell, endCell has startCand, startCell has d2.
      for (let d2 = 1; d2 <= 9; d2++) {
        if (d2 === startCand) continue;
        for (const endCell of entry.onSets[d2]) {
          if (!BUDDY_SETS[startCell].has(endCell)) continue;
          if (!s.isCandidate(endCell, startCand)) continue;
          if (!s.isCandidate(startCell, d2)) continue;
          const distOn = entry.minDistOn[endCell * 10 + d2];
          if (distOn > 0 && distOn <= 2) continue;
          if (!this._aicIsValid(entry, endCell, d2, true)) continue;
          out.push({
            step: _step(SolutionType.AIC, [
              { index: endCell,   value: startCand as Digit },
              { index: startCell, value: d2 as Digit },
            ]),
            dist: distOn,
          });
        }
      }
    }
  }

  // ── checkForcingChains() ─────────────────────────────────────────────────

  private _checkForcingChains(): SolutionStep | null {
    const out: SolutionStep[] = [];
    // 1. Single-chain contradictions
    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      const on = this._checkOneChain(this._onTable[ti], true);
      if (on) {
        out.push(on);
      }
      const off = this._checkOneChain(this._offTable[ti], false);
      if (off) {
        out.push(off);
      }
    }
    // 2. Two-chain verities (same premise cell, both ON and OFF lead to same conclusion)
    for (let ti = 0; ti < TABLE_SIZE; ti++) {
      this._collectTwoChains(this._onTable[ti], this._offTable[ti], out);
    }
    // 3. All-candidates-in-cell verity
    this._collectAllChainsForCells(out);
    // 4. All-positions-in-house verity
    this._collectAllChainsForHouses(out);
    if (out.length === 0) return null;
    out.sort(_compareForcingChainSteps);
    return out[0];
  }

  // ── checkOneChain ─────────────────────────────────────────────────────────

  private _checkOneChain(entry: TableEntry, isOn: boolean): SolutionStep | null {
    if (!entry.populated) return null;
    const s = this.sudoku;
    const ti = entry.tableIndex;
    const ci = (ti / 10) | 0;
    const d  = ti % 10;
    if (d === 0 || s.values[ci] !== 0 || !s.isCandidate(ci, d)) return null;

    const conclude = (): SolutionStep => isOn
      ? _step(SolutionType.FORCING_CHAIN_CONTRADICTION, [{ index: ci, value: d as Digit }])   // ON was wrong ? delete d
      : _step(SolutionType.FORCING_CHAIN_CONTRADICTION, [], [{ index: ci, value: d as Digit }]); // OFF was wrong ? set d

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

    // Case 6 (H12): some unsolved cell has ALL its candidates eliminated � contradiction.
    for (let cell = 0; cell < 81; cell++) {
      if (s.values[cell] !== 0) continue;
      const cands = s.getCandidates(cell);
      if (cands.length === 0) continue;
      if (cands.every(d2 => entry.offSets[d2].has(cell))) return conclude();
    }

    return null;
  }

  // ── checkTwoChains ────────────────────────────────────────────────────────

  private _collectTwoChains(on: TableEntry, off: TableEntry, out: SolutionStep[]): void {
    if (!on.populated || !off.populated) return;
    const s = this.sudoku;
    const premiseCell = (on.tableIndex / 10) | 0;
    for (let d = 1; d <= 9; d++) {
      for (const cell of on.onSets[d]) {
        if (cell === premiseCell) continue;
        if (off.onSets[d].has(cell) && s.isCandidate(cell, d)) {
          const key = cell * 10 + d;
          const len = on.minDistOn[key] + off.minDistOn[key];
          out.push(_withChainLen(
            _step(SolutionType.FORCING_CHAIN_VERITY, [], [{ index: cell, value: d as Digit }]),
            len,
          ));
        }
      }
      for (const cell of on.offSets[d]) {
        if (cell === premiseCell) continue;
        if (off.offSets[d].has(cell) && s.isCandidate(cell, d)) {
          const key = cell * 10 + d;
          const len = on.minDistOff[key] + off.minDistOff[key];
          out.push(_withChainLen(
            _step(SolutionType.FORCING_CHAIN_VERITY, [{ index: cell, value: d as Digit }]),
            len,
          ));
        }
      }
    }
  }

  // ── checkAllChainsForCells ────────────────────────────────────────────────

  private _collectAllChainsForCells(out: SolutionStep[]): void {
    const s = this.sudoku;
    for (let ci = 0; ci < 81; ci++) {
      if (s.values[ci] !== 0) continue;
      const cands = s.getCandidates(ci);
      if (cands.length < 2) continue;
      const entries = cands.map(d => this._onTable[ci * 10 + d]);
      _collectVerities(_intersect(entries), entries, s, out);
    }
  }

  // ── checkAllChainsForHouses ───────────────────────────────────────────────

  private _collectAllChainsForHouses(out: SolutionStep[]): void {
    const s = this.sudoku;
    for (let h = 0; h < 27; h++) {
      for (let d = 1; d <= 9; d++) {
        const positions = (HOUSE_CELLS[h] as number[]).filter(
          c => s.values[c] === 0 && s.isCandidate(c, d),
        );
        if (positions.length < 2) continue;
        const entries = positions.map(c => this._onTable[c * 10 + d]);
        _collectVerities(_intersect(entries), entries, s, out);
      }
    }
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

function _collectVerities(
  { onSets, offSets }: { onSets: Set<number>[]; offSets: Set<number>[] },
  entries: TableEntry[],
  s: Sudoku2,
  out: SolutionStep[],
): void {
  for (let d = 1; d <= 9; d++) {
    for (const cell of onSets[d]) {
      if (s.isCandidate(cell, d)) {
        const key = cell * 10 + d;
        let len = 0;
        for (const e of entries) len += e.minDistOn[key];
        out.push(_withChainLen(
          _step(SolutionType.FORCING_CHAIN_VERITY, [], [{ index: cell, value: d as Digit }]),
          len,
        ));
      }
    }
    for (const cell of offSets[d]) {
      if (s.isCandidate(cell, d)) {
        const key = cell * 10 + d;
        let len = 0;
        for (const e of entries) len += e.minDistOff[key];
        out.push(_withChainLen(
          _step(SolutionType.FORCING_CHAIN_VERITY, [{ index: cell, value: d as Digit }]),
          len,
        ));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Forcing-chain step comparator — mirrors Java's TablingComparator.
// Placements are preferred over eliminations; within each category more
// actions sort first, then lower index sums break ties.
// ---------------------------------------------------------------------------

function _compareForcingChainSteps(a: SolutionStep, b: SolutionStep): number {
  const aHasPlace = a.placements.length > 0;
  const bHasPlace = b.placements.length > 0;
  // Placements first
  if (aHasPlace && !bHasPlace) return -1;
  if (!aHasPlace && bHasPlace) return 1;
  if (aHasPlace) {
    // Both placements: more placements first
    const cnt = b.placements.length - a.placements.length;
    if (cnt !== 0) return cnt;
    const aIdx = [...a.placements].map(p => p.index).sort((x, y) => x - y);
    const bIdx = [...b.placements].map(p => p.index).sort((x, y) => x - y);
    const sameIdx =
      aIdx.length === bIdx.length && aIdx.every((v, i) => v === bIdx[i]);
    if (!sameIdx) {
      const sumA = aIdx.reduce((s, v) => s + v, 0);
      const sumB = bIdx.reduce((s, v) => s + v, 0);
      if (sumA !== sumB) return sumA - sumB;
      return 1; // Java comparator keeps order stable when sums match.
    }
    const lenCmp = _compareForcingChainLen(a, b);
    if (lenCmp !== 0) return lenCmp;
    return 0;
  }
  // Both eliminations: more eliminations first
  const cnt = b.candidatesToDelete.length - a.candidatesToDelete.length;
  if (cnt !== 0) return cnt;
  const ad = a.candidatesToDelete;
  const bd = b.candidatesToDelete;
  const equiv = a.type === b.type && _candidateSetsEqual(ad, bd);
  if (!equiv) {
    const minLen = Math.min(ad.length, bd.length);
    for (let i = 0; i < minLen; i++) {
      const cmp = (ad[i].index * 10 + ad[i].value) - (bd[i].index * 10 + bd[i].value);
      if (cmp !== 0) return cmp;
    }
    if (ad.length !== bd.length) return ad.length - bd.length;
  }
  const lenCmp = _compareForcingChainLen(a, b);
  if (lenCmp !== 0) return lenCmp;
  return 0;
}

function _withChainLen(step: SolutionStep, len: number): SolutionStep {
  (step as SolutionStep & { _chainLen?: number })._chainLen = len;
  return step;
}

function _compareForcingChainLen(a: SolutionStep, b: SolutionStep): number {
  const la = (a as SolutionStep & { _chainLen?: number })._chainLen;
  const lb = (b as SolutionStep & { _chainLen?: number })._chainLen;
  if (la === undefined || lb === undefined) return 0;
  return la - lb;
}

function _step(
  type: SolutionType,
  candidatesToDelete: Candidate[],
  placements: { index: number; value: Digit }[] = [],
): SolutionStep {
  // Java's getCandidateString() permanently sorts candidates by (value, index)
  // during dedup. This affects isum in compareTo(). Match that here.
  candidatesToDelete.sort((a, b) => a.value - b.value || a.index - b.index);
  return { type, placements, candidatesToDelete };
}

// ---------------------------------------------------------------------------
// Step candidate sorting — mirrors Java's SolutionStep.compareTo().
// Java collects ALL nice loops + AICs, sorts, and returns the best one.
// Sort order: (1) more eliminations first, (2) shorter chain, (3) index sum.
// ---------------------------------------------------------------------------

interface _StepCandidate {
  step: SolutionStep;
  dist: number;
}

function _indexSum(dels: Candidate[]): number {
  let sum = 0;
  let offset = 1;
  for (const c of dels) {
    sum += c.index * offset + c.value;
    offset += 80;
  }
  return sum;
}

function _candidateSetsEqual(a: Candidate[], b: Candidate[]): boolean {
  if (a.length !== b.length) return false;
  // Set-based check matching Java's isEqualCandidate (order-independent)
  for (const ca of a) {
    if (!b.some(cb => cb.index === ca.index && cb.value === ca.value)) return false;
  }
  return true;
}

function _compareSteps(a: _StepCandidate, b: _StepCandidate): number {
  // More eliminations first (descending)
  const delDiff = b.step.candidatesToDelete.length - a.step.candidatesToDelete.length;
  if (delDiff !== 0) return delDiff;

  // If not equivalent (different type or different candidatesToDelete): shorter chain, then index sum
  const ad = a.step.candidatesToDelete;
  const bd = b.step.candidatesToDelete;
  let equiv = a.step.type === b.step.type && _candidateSetsEqual(ad, bd);
  if (!equiv) {
    const chainDiff = a.dist - b.dist;
    if (chainDiff !== 0) return chainDiff;
    return _indexSum(ad) - _indexSum(bd);
  }

  // Equivalent: shorter chain first
  return a.dist - b.dist;
}

/**
 * Comparison for grouped nice loop candidates — matches Java's TablingComparator exactly:
 * 1. More eliminations first
 * 2. If not isEquivalent (set-based): compare candidates position-by-position (ci*10+d), then chain
 * 3. If equivalent: shorter chain first
 */
function _compareGroupedSteps(a: _StepCandidate, b: _StepCandidate): number {
  // More eliminations first (descending)
  const delDiff = b.step.candidatesToDelete.length - a.step.candidatesToDelete.length;
  if (delDiff !== 0) return delDiff;

  const ad = a.step.candidatesToDelete;
  const bd = b.step.candidatesToDelete;

  // Set-based equivalency (matches Java's isEquivalent: same type + same candidate set)
  const equiv = a.step.type === b.step.type && _candidateSetsEqual(ad, bd);

  if (!equiv) {
    // Not equivalent: compare candidates position-by-position (like Java's compareCandidatesToDelete)
    for (let i = 0; i < Math.min(ad.length, bd.length); i++) {
      const cmp = (ad[i].index * 10 + ad[i].value) - (bd[i].index * 10 + bd[i].value);
      if (cmp !== 0) return cmp;
    }
    const lenDiff = ad.length - bd.length;
    if (lenDiff !== 0) return lenDiff;
  }

  // Equivalent or same candidates: shorter chain first
  return a.dist - b.dist;
}

// ---------------------------------------------------------------------------
// Net propagation helpers (module-level for performance).
//
// Both helpers operate on mutable wVals/wCands snapshots; they record all
// resulting placements (addSet) and eliminations (addDel) in the entry.
//
// Java net mode uses limited single-lookahead (Options.ANZ_TABLE_LOOK_AHEAD=4):
// in each round it collects all current naked+hidden singles, then applies them.
// Singles discovered while applying a round are deferred to the next round.
// ---------------------------------------------------------------------------
const NET_TABLE_LOOKAHEAD = 4;

function _netCountBits(mask: number): number {
  let n = 0;
  let m = mask >> 1;   // skip bit 0 (unused)
  while (m) { n += m & 1; m >>= 1; }
  return n;
}

function _netLowestBit(mask: number): number {
  // Return lowest set bit = 1 in a candidate bitmask.
  for (let d = 1; d <= 9; d++) if ((mask >> d & 1) !== 0) return d;
  return 0;
}

function _netApplyPlacement(
  cell: number, digit: number,
  wVals: Uint8Array, wCands: Uint16Array,
  entry: TableEntry,
  queue?: number[],
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
    if (queue && _netCountBits(wCands[peer]) === 1) {
      queue.push(peer * 10 + _netLowestBit(wCands[peer]));
    }
  }
}

function _netCollectSingles(
  wVals: Uint8Array, wCands: Uint16Array,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();

  // Naked singles.
  for (let c = 0; c < 81; c++) {
    if (wVals[c] !== 0) continue;
    const mask = wCands[c];
    if (_netCountBits(mask) === 1) {
      const pack = c * 10 + _netLowestBit(mask);
      if (!seen.has(pack)) {
        seen.add(pack);
        out.push(pack);
      }
    }
  }

  // Hidden singles.
  for (let h = 0; h < 27; h++) {
    const house = HOUSE_CELLS[h] as number[];
    for (let d = 1; d <= 9; d++) {
      let cnt = 0; let pos = -1;
      for (const c of house) {
        if (wVals[c] === 0 && (wCands[c] >> d & 1) !== 0) { cnt++; pos = c; }
      }
      if (cnt === 1 && pos !== -1 && wVals[pos] === 0) {
        const pack = pos * 10 + d;
        if (!seen.has(pack)) {
          seen.add(pack);
          out.push(pack);
        }
      }
    }
  }

  return out;
}

function _netPropagateOn(
  ci: number, d: number,
  wVals: Uint8Array, wCands: Uint16Array,
  entry: TableEntry,
): void {
  _netApplyPlacement(ci, d, wVals, wCands, entry);

  for (let i = 0; i < NET_TABLE_LOOKAHEAD; i++) {
    const singles = _netCollectSingles(wVals, wCands);
    if (singles.length === 0) break;
    for (const pack of singles) {
      const cell  = (pack / 10) | 0;
      const digit = pack % 10;
      if (wVals[cell] !== 0) continue;
      _netApplyPlacement(cell, digit, wVals, wCands, entry);
    }
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

  // Java: if OFF creates a naked single in the same cell, set it immediately.
  if (_netCountBits(wCands[ci]) === 1) {
    _netApplyPlacement(ci, _netLowestBit(wCands[ci]), wVals, wCands, entry);
  }

  for (let i = 0; i < NET_TABLE_LOOKAHEAD; i++) {
    const singles = _netCollectSingles(wVals, wCands);
    if (singles.length === 0) break;
    for (const pack of singles) {
      const cell  = (pack / 10) | 0;
      const digit = pack % 10;
      if (wVals[cell] !== 0) continue;
      _netApplyPlacement(cell, digit, wVals, wCands, entry);
    }
  }
}


