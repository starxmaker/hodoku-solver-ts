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

import type { SolutionStep } from '../Sudoku2';
import { Sudoku2 } from '../Sudoku2';
import { SolutionType } from '../SolutionType';
import type { DifficultyType, SolveRating } from '../types';
import { AbstractSolver } from './AbstractSolver';
import { SimpleSolver } from './SimpleSolver';
import { FishSolver } from './FishSolver';
import { SingleDigitPatternSolver } from './SingleDigitPatternSolver';
import { WingSolver } from './WingSolver';
import { ColoringSolver } from './ColoringSolver';
import { ChainSolver } from './ChainSolver';
import { UniquenessSolver } from './UniquenessSolver';
import { AlsSolver } from './AlsSolver';
import { MiscellaneousSolver } from './MiscellaneousSolver';
import { TablingSolver } from './TablingSolver';
import { TemplateSolver } from './TemplateSolver';
import { BruteForceSolver } from './BruteForceSolver';
import { GiveUpSolver } from './GiveUpSolver';
import { IncompleteSolver } from './IncompleteSolver';

// Technique order from Java Options.DEFAULT_SOLVER_STEPS (sorted by step number)
const TECHNIQUE_ORDER: (typeof SolutionType)[keyof typeof SolutionType][] = [
  SolutionType.FULL_HOUSE,
  SolutionType.NAKED_SINGLE,
  SolutionType.HIDDEN_SINGLE,
  SolutionType.LOCKED_PAIR,
  SolutionType.LOCKED_TRIPLE,
  SolutionType.LOCKED_CANDIDATES_1,
  SolutionType.LOCKED_CANDIDATES_2,
  SolutionType.NAKED_PAIR,
  SolutionType.NAKED_TRIPLE,
  SolutionType.HIDDEN_PAIR,
  SolutionType.HIDDEN_TRIPLE,
  SolutionType.NAKED_QUADRUPLE,
  SolutionType.HIDDEN_QUADRUPLE,
  SolutionType.X_WING,
  SolutionType.SWORDFISH,
  SolutionType.JELLYFISH,
  // SQUIRMBAG, WHALE, LEVIATHAN — Java enabled=false by default (H3)
  SolutionType.REMOTE_PAIR,
  SolutionType.BUG_PLUS_1,             // Java index 2900
  SolutionType.SKYSCRAPER,
  SolutionType.TWO_STRING_KITE,
  // DUAL_TWO_STRING_KITE — Java never adds this to solve order (H2)
  SolutionType.TURBOT_FISH,
  SolutionType.EMPTY_RECTANGLE,
  // DUAL_EMPTY_RECTANGLE — Java never adds this to solve order (H2)
  SolutionType.W_WING,
  SolutionType.XY_WING,
  SolutionType.XYZ_WING,
  SolutionType.UNIQUENESS_1,
  SolutionType.UNIQUENESS_2,
  SolutionType.UNIQUENESS_3,
  SolutionType.UNIQUENESS_4,
  SolutionType.UNIQUENESS_5,
  SolutionType.UNIQUENESS_6,
  SolutionType.HIDDEN_RECTANGLE,
  SolutionType.AVOIDABLE_RECTANGLE_1,
  SolutionType.AVOIDABLE_RECTANGLE_2,
  SolutionType.FINNED_X_WING,
  SolutionType.SASHIMI_X_WING,
  SolutionType.FINNED_SWORDFISH,
  SolutionType.SASHIMI_SWORDFISH,
  SolutionType.FINNED_JELLYFISH,
  SolutionType.SASHIMI_JELLYFISH,
  // FINNED/SASHIMI SQUIRMBAG, WHALE, LEVIATHAN — Java enabled=false by default (H3)
  // Misc, coloring, chains — Java 5300–5650 (cheaper than Franken/Mutant fish)
  SolutionType.SUE_DE_COQ,             // 5300
  SolutionType.SIMPLE_COLORS,          // 5330
  SolutionType.MULTI_COLORS,           // 5360
  SolutionType.X_CHAIN,                // 5400
  SolutionType.XY_CHAIN,               // 5500
  SolutionType.NICE_LOOP,              // 5600
  SolutionType.GROUPED_NICE_LOOP,      // 5650
  // ALS + Death Blossom — Java 5700–6000
  SolutionType.ALS_XZ,
  SolutionType.ALS_XY_WING,
  SolutionType.ALS_XY_CHAIN,
  // DEATH_BLOSSOM — Java enabled=false by default (H3)
  // Franken fish — Java 6100–7200
  SolutionType.FRANKEN_X_WING,
  SolutionType.FRANKEN_SWORDFISH,
  // FRANKEN_JELLYFISH and larger — Java enabled=false by default (H3)
  SolutionType.FINNED_FRANKEN_X_WING,
  SolutionType.FINNED_FRANKEN_SWORDFISH,
  // FINNED_FRANKEN_JELLYFISH and larger — Java enabled=false by default (H3)
  // MUTANT fish — all Java enabled=false by default (H3)
  // KRAKEN_FISH — Java enabled=false by default (H3)
  // Last resort — Java 8500–8900
  SolutionType.FORCING_CHAIN,
  SolutionType.FORCING_NET,
  // TEMPLATE_SET, TEMPLATE_DEL — Java enabled=false by default (H3)
  SolutionType.BRUTE_FORCE,
  SolutionType.GIVE_UP,
];

// ---------------------------------------------------------------------------
// Difficulty rating — base scores from Java Options.DEFAULT_SOLVER_STEPS
// and max-score thresholds from Java Options.difficultyLevels.
// ---------------------------------------------------------------------------

/** Score added to the running total each time a technique is applied. */
const STEP_BASE_SCORES: Partial<Record<string, number>> = {
  [SolutionType.FULL_HOUSE]:              4,
  [SolutionType.NAKED_SINGLE]:            4,
  [SolutionType.HIDDEN_SINGLE]:           14,
  [SolutionType.LOCKED_PAIR]:             40,
  [SolutionType.LOCKED_TRIPLE]:           60,
  [SolutionType.LOCKED_CANDIDATES_1]:     50,
  [SolutionType.LOCKED_CANDIDATES_2]:     50,
  [SolutionType.NAKED_PAIR]:              60,
  [SolutionType.NAKED_TRIPLE]:            80,
  [SolutionType.HIDDEN_PAIR]:             70,
  [SolutionType.HIDDEN_TRIPLE]:           100,
  [SolutionType.NAKED_QUADRUPLE]:         120,
  [SolutionType.HIDDEN_QUADRUPLE]:        150,
  [SolutionType.X_WING]:                  140,
  [SolutionType.SWORDFISH]:               150,
  [SolutionType.JELLYFISH]:               160,
  [SolutionType.SQUIRMBAG]:               470,
  [SolutionType.WHALE]:                   470,
  [SolutionType.LEVIATHAN]:               470,
  [SolutionType.REMOTE_PAIR]:             110,
  [SolutionType.BUG_PLUS_1]:              100,
  [SolutionType.SKYSCRAPER]:              130,
  [SolutionType.TWO_STRING_KITE]:         150,
  [SolutionType.DUAL_TWO_STRING_KITE]:    150,
  [SolutionType.TURBOT_FISH]:             120,
  [SolutionType.EMPTY_RECTANGLE]:         120,
  [SolutionType.DUAL_EMPTY_RECTANGLE]:    120,
  [SolutionType.W_WING]:                  150,
  [SolutionType.XY_WING]:                 160,
  [SolutionType.XYZ_WING]:                180,
  [SolutionType.UNIQUENESS_1]:            100,
  [SolutionType.UNIQUENESS_2]:            100,
  [SolutionType.UNIQUENESS_3]:            100,
  [SolutionType.UNIQUENESS_4]:            100,
  [SolutionType.UNIQUENESS_5]:            100,
  [SolutionType.UNIQUENESS_6]:            100,
  [SolutionType.HIDDEN_RECTANGLE]:        100,
  [SolutionType.AVOIDABLE_RECTANGLE_1]:   100,
  [SolutionType.AVOIDABLE_RECTANGLE_2]:   100,
  [SolutionType.FINNED_X_WING]:           130,
  [SolutionType.SASHIMI_X_WING]:          150,
  [SolutionType.FINNED_SWORDFISH]:        200,
  [SolutionType.SASHIMI_SWORDFISH]:       240,
  [SolutionType.FINNED_JELLYFISH]:        250,
  [SolutionType.SASHIMI_JELLYFISH]:       260,
  [SolutionType.FINNED_SQUIRMBAG]:        470,
  [SolutionType.SASHIMI_SQUIRMBAG]:       470,
  [SolutionType.FINNED_WHALE]:            470,
  [SolutionType.SASHIMI_WHALE]:           470,
  [SolutionType.FINNED_LEVIATHAN]:        470,
  [SolutionType.SASHIMI_LEVIATHAN]:       470,
  // Franken fish scores (from Java Options)
  [SolutionType.FRANKEN_X_WING]:          300,
  [SolutionType.FRANKEN_SWORDFISH]:       350,
  [SolutionType.FRANKEN_JELLYFISH]:       370,
  [SolutionType.FRANKEN_SQUIRMBAG]:       470,
  [SolutionType.FRANKEN_WHALE]:           470,
  [SolutionType.FRANKEN_LEVIATHAN]:       470,
  [SolutionType.FINNED_FRANKEN_X_WING]:   390,
  [SolutionType.FINNED_FRANKEN_SWORDFISH]:410,
  [SolutionType.FINNED_FRANKEN_JELLYFISH]:430,
  [SolutionType.FINNED_FRANKEN_SQUIRMBAG]:470,
  [SolutionType.FINNED_FRANKEN_WHALE]:    470,
  [SolutionType.FINNED_FRANKEN_LEVIATHAN]:470,
  // Mutant fish scores
  [SolutionType.MUTANT_X_WING]:           450,
  [SolutionType.MUTANT_SWORDFISH]:        450,
  [SolutionType.MUTANT_JELLYFISH]:        450,
  [SolutionType.MUTANT_SQUIRMBAG]:        470,
  [SolutionType.MUTANT_WHALE]:            470,
  [SolutionType.MUTANT_LEVIATHAN]:        470,
  [SolutionType.FINNED_MUTANT_X_WING]:    470,
  [SolutionType.FINNED_MUTANT_SWORDFISH]: 470,
  [SolutionType.FINNED_MUTANT_JELLYFISH]: 470,
  [SolutionType.FINNED_MUTANT_SQUIRMBAG]: 470,
  [SolutionType.FINNED_MUTANT_WHALE]:     470,
  [SolutionType.FINNED_MUTANT_LEVIATHAN]: 470,
  // Kraken fish scores
  [SolutionType.KRAKEN_FISH]:             500,
  [SolutionType.KRAKEN_FISH_TYPE_1]:      500,
  [SolutionType.KRAKEN_FISH_TYPE_2]:      500,
  [SolutionType.SUE_DE_COQ]:              250,
  [SolutionType.SIMPLE_COLORS]:           150,
  [SolutionType.SIMPLE_COLORS_TRAP]:      150,
  [SolutionType.SIMPLE_COLORS_WRAP]:      150,
  [SolutionType.MULTI_COLORS]:            200,
  [SolutionType.MULTI_COLORS_1]:          200,
  [SolutionType.MULTI_COLORS_2]:          200,
  [SolutionType.X_CHAIN]:                 260,
  [SolutionType.XY_CHAIN]:                260,
  [SolutionType.NICE_LOOP]:               280,
  [SolutionType.ALS_XZ]:                  300,
  [SolutionType.ALS_XY_WING]:             320,
  [SolutionType.ALS_XY_CHAIN]:            340,
  [SolutionType.DEATH_BLOSSOM]:           360,
  [SolutionType.FORCING_CHAIN]:           500,
  [SolutionType.FORCING_NET]:             700,
  [SolutionType.DISCONTINUOUS_NICE_LOOP]: 280,
  [SolutionType.CONTINUOUS_NICE_LOOP]:    280,
  [SolutionType.AIC]:                     280,
  [SolutionType.GROUPED_NICE_LOOP]:       300,
  [SolutionType.GROUPED_CONTINUOUS_NICE_LOOP]:    300,
  [SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP]: 300,
  [SolutionType.GROUPED_AIC]:             300,
  [SolutionType.FORCING_CHAIN_CONTRADICTION]: 500,
  [SolutionType.FORCING_CHAIN_VERITY]:    500,
  [SolutionType.FORCING_NET_CONTRADICTION]: 700,
  [SolutionType.FORCING_NET_VERITY]:      700,
  [SolutionType.TEMPLATE_SET]:            10000,
  [SolutionType.TEMPLATE_DEL]:            10000,
  [SolutionType.BRUTE_FORCE]:             10000,
};

/** Ordered difficulty levels with their cumulative score ceilings. */
const DIFFICULTY_LEVELS: { name: DifficultyType; maxScore: number }[] = [
  { name: "EASY",    maxScore: 800 },
  { name: "MEDIUM",  maxScore: 1000 },
  { name: "HARD",    maxScore: 1600 },
  { name: "UNFAIR",  maxScore: 1800 },
  { name: "EXTREME", maxScore: Number.MAX_SAFE_INTEGER },
];

/**
 * Per-technique minimum difficulty index (0=EASY … 4=EXTREME).
 * Mirrors Java StepConfig#getDifficultyLevel() from Options.DEFAULT_SOLVER_STEPS.
 * A puzzle's difficulty is at least this level whenever that technique is used — even
 * if the cumulative score alone would place it lower.
 * Sub-types (e.g. SIMPLE_COLORS_TRAP) inherit the parent technique's level.
 */
const STEP_MIN_DIFFICULTY_IDX: Partial<Record<string, number>> = {
  // 0 = EASY
  [SolutionType.FULL_HOUSE]:              0,
  [SolutionType.NAKED_SINGLE]:            0,
  [SolutionType.HIDDEN_SINGLE]:           0,
  // 1 = MEDIUM
  [SolutionType.LOCKED_PAIR]:             1,
  [SolutionType.LOCKED_TRIPLE]:           1,
  [SolutionType.LOCKED_CANDIDATES_1]:     1,
  [SolutionType.LOCKED_CANDIDATES_2]:     1,
  [SolutionType.NAKED_PAIR]:              1,
  [SolutionType.NAKED_TRIPLE]:            1,
  [SolutionType.HIDDEN_PAIR]:             1,
  [SolutionType.HIDDEN_TRIPLE]:           1,
  // 2 = HARD
  [SolutionType.NAKED_QUADRUPLE]:         2,
  [SolutionType.HIDDEN_QUADRUPLE]:        2,
  [SolutionType.X_WING]:                  2,
  [SolutionType.SWORDFISH]:               2,
  [SolutionType.JELLYFISH]:               2,
  [SolutionType.REMOTE_PAIR]:             2,
  [SolutionType.BUG_PLUS_1]:              2,
  [SolutionType.SKYSCRAPER]:              2,
  [SolutionType.TWO_STRING_KITE]:         2,
  [SolutionType.TURBOT_FISH]:             2,
  [SolutionType.EMPTY_RECTANGLE]:         2,
  [SolutionType.W_WING]:                  2,
  [SolutionType.XY_WING]:                 2,
  [SolutionType.XYZ_WING]:               2,
  [SolutionType.UNIQUENESS_1]:            2,
  [SolutionType.UNIQUENESS_2]:            2,
  [SolutionType.UNIQUENESS_3]:            2,
  [SolutionType.UNIQUENESS_4]:            2,
  [SolutionType.UNIQUENESS_5]:            2,
  [SolutionType.UNIQUENESS_6]:            2,
  [SolutionType.HIDDEN_RECTANGLE]:        2,
  [SolutionType.AVOIDABLE_RECTANGLE_1]:   2,
  [SolutionType.AVOIDABLE_RECTANGLE_2]:   2,
  [SolutionType.FINNED_X_WING]:           2,
  [SolutionType.SASHIMI_X_WING]:          2,
  [SolutionType.SIMPLE_COLORS]:           2,
  [SolutionType.SIMPLE_COLORS_TRAP]:      2,  // sub-type of SIMPLE_COLORS
  [SolutionType.SIMPLE_COLORS_WRAP]:      2,  // sub-type of SIMPLE_COLORS
  [SolutionType.MULTI_COLORS]:            2,
  [SolutionType.MULTI_COLORS_1]:          2,  // sub-type of MULTI_COLORS
  [SolutionType.MULTI_COLORS_2]:          2,  // sub-type of MULTI_COLORS
  // 3 = UNFAIR
  [SolutionType.SQUIRMBAG]:               3,
  [SolutionType.WHALE]:                   3,
  [SolutionType.LEVIATHAN]:               3,
  [SolutionType.FINNED_SWORDFISH]:        3,
  [SolutionType.SASHIMI_SWORDFISH]:       3,
  [SolutionType.FINNED_JELLYFISH]:        3,
  [SolutionType.SASHIMI_JELLYFISH]:       3,
  [SolutionType.FINNED_SQUIRMBAG]:        3,
  [SolutionType.SASHIMI_SQUIRMBAG]:       3,
  [SolutionType.FINNED_WHALE]:            3,
  [SolutionType.SASHIMI_WHALE]:           3,
  [SolutionType.FINNED_LEVIATHAN]:        3,
  [SolutionType.SASHIMI_LEVIATHAN]:       3,
  [SolutionType.SUE_DE_COQ]:              3,
  [SolutionType.X_CHAIN]:                 3,
  [SolutionType.XY_CHAIN]:                3,
  [SolutionType.NICE_LOOP]:               3,
  [SolutionType.DISCONTINUOUS_NICE_LOOP]: 3,  // sub-type of NICE_LOOP
  [SolutionType.CONTINUOUS_NICE_LOOP]:    3,  // sub-type of NICE_LOOP
  [SolutionType.AIC]:                     3,  // sub-type of NICE_LOOP
  [SolutionType.ALS_XZ]:                  3,
  [SolutionType.ALS_XY_WING]:             3,
  [SolutionType.ALS_XY_CHAIN]:            3,
  [SolutionType.DEATH_BLOSSOM]:           3,
  [SolutionType.FRANKEN_X_WING]:          3,
  [SolutionType.FRANKEN_SWORDFISH]:       3,
  [SolutionType.FRANKEN_JELLYFISH]:       3,
  [SolutionType.FINNED_FRANKEN_X_WING]:   3,
  [SolutionType.FINNED_FRANKEN_SWORDFISH]:3,
  [SolutionType.FINNED_FRANKEN_JELLYFISH]:3,
  [SolutionType.GROUPED_NICE_LOOP]:       3,
  [SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP]: 3,  // sub-type of GROUPED_NICE_LOOP
  [SolutionType.GROUPED_CONTINUOUS_NICE_LOOP]:    3,  // sub-type of GROUPED_NICE_LOOP
  [SolutionType.GROUPED_AIC]:             3,          // sub-type of GROUPED_NICE_LOOP
  // 4 = EXTREME
  [SolutionType.FRANKEN_SQUIRMBAG]:       4,
  [SolutionType.FRANKEN_WHALE]:           4,
  [SolutionType.FRANKEN_LEVIATHAN]:       4,
  [SolutionType.FINNED_FRANKEN_SQUIRMBAG]:4,
  [SolutionType.FINNED_FRANKEN_WHALE]:    4,
  [SolutionType.FINNED_FRANKEN_LEVIATHAN]:4,
  [SolutionType.MUTANT_X_WING]:           4,
  [SolutionType.MUTANT_SWORDFISH]:        4,
  [SolutionType.MUTANT_JELLYFISH]:        4,
  [SolutionType.MUTANT_SQUIRMBAG]:        4,
  [SolutionType.MUTANT_WHALE]:            4,
  [SolutionType.MUTANT_LEVIATHAN]:        4,
  [SolutionType.FINNED_MUTANT_X_WING]:    4,
  [SolutionType.FINNED_MUTANT_SWORDFISH]: 4,
  [SolutionType.FINNED_MUTANT_JELLYFISH]: 4,
  [SolutionType.FINNED_MUTANT_SQUIRMBAG]: 4,
  [SolutionType.FINNED_MUTANT_WHALE]:     4,
  [SolutionType.FINNED_MUTANT_LEVIATHAN]: 4,
  [SolutionType.KRAKEN_FISH]:             4,
  [SolutionType.KRAKEN_FISH_TYPE_1]:      4,
  [SolutionType.KRAKEN_FISH_TYPE_2]:      4,
  [SolutionType.FORCING_CHAIN]:           4,
  [SolutionType.FORCING_CHAIN_CONTRADICTION]: 4,
  [SolutionType.FORCING_CHAIN_VERITY]:    4,
  [SolutionType.FORCING_NET]:             4,
  [SolutionType.FORCING_NET_CONTRADICTION]: 4,
  [SolutionType.FORCING_NET_VERITY]:      4,
  [SolutionType.TEMPLATE_SET]:            4,
  [SolutionType.TEMPLATE_DEL]:            4,
  [SolutionType.BRUTE_FORCE]:             4,
};

// ---------------------------------------------------------------------------
// SudokuSolver — orchestrator delegating to specialised sub-solvers.
// ---------------------------------------------------------------------------

export class SudokuSolver extends AbstractSolver {
  private readonly _simple: SimpleSolver;
  private readonly _fish: FishSolver;
  private readonly _sdp: SingleDigitPatternSolver;
  private readonly _wing: WingSolver;
  private readonly _coloring: ColoringSolver;
  private readonly _chain: ChainSolver;
  private readonly _uniqueness: UniquenessSolver;
  private readonly _als: AlsSolver;
  private readonly _misc: MiscellaneousSolver;
  private readonly _tabling: TablingSolver;
  private readonly _template: TemplateSolver;
  private readonly _bruteForce: BruteForceSolver;
  private readonly _giveUp: GiveUpSolver;
  private readonly _incomplete: IncompleteSolver;
  private readonly _allSolvers: AbstractSolver[];

  constructor() {
    super();
    this._simple     = new SimpleSolver();
    this._fish       = new FishSolver();
    this._sdp        = new SingleDigitPatternSolver();
    this._wing       = new WingSolver();
    this._coloring   = new ColoringSolver();
    this._chain      = new ChainSolver();
    this._uniqueness = new UniquenessSolver();
    this._als        = new AlsSolver();
    this._misc       = new MiscellaneousSolver();
    this._tabling    = new TablingSolver();
    this._template   = new TemplateSolver();
    this._bruteForce = new BruteForceSolver();
    this._giveUp     = new GiveUpSolver();
    this._incomplete = new IncompleteSolver();
    // Wire TablingSolver into FishSolver for Kraken Fish analysis.
    this._fish.setTablingSolver(this._tabling);
    this._allSolvers = [
      this._simple, this._fish, this._sdp, this._wing,
      this._coloring, this._chain, this._uniqueness, this._als,
      this._misc, this._tabling, this._template, this._bruteForce,
      this._giveUp, this._incomplete,
    ];
  }

  override setSudoku(sudoku: Sudoku2): void {
    super.setSudoku(sudoku);
    for (const s of this._allSolvers) s.setSudoku(sudoku);
  }

  /**
   * Solve the puzzle and compute a HoDoKu difficulty rating.
   *
   * Mirrors Java's {@code SudokuSolver.solve(DifficultyLevel, Sudoku2, rejectTooLowScore, ...)}:
   * accumulates a score from each applied step's base score, then determines
   * the difficulty band by walking up the threshold table.
   *
   * @param maxDifficulty  When provided the solve stops as soon as the
   *                       accumulated score exceeds that band's ceiling,
   *                       returning {@code solved: false}.  Omit (or pass
   *                       {@code "EXTREME"}) to always solve to completion.
   */
  solveWithRating(maxDifficulty: DifficultyType = "EXTREME"): SolveRating {
    const maxThreshold = DIFFICULTY_LEVELS.find(d => d.name === maxDifficulty)!.maxScore;
    let score = 0;
    // Minimum difficulty level forced by any technique used (Java per-technique level).
    let minLevelIdx = 0;

    outer: for (let i = 0; i < 10_000 && !this.sudoku.isSolved; i++) {
      const debugSteps = (process.env as any)['HODOKU_DEBUG_STEPS'];
      const debugStepList: string[] = [];
      for (const type of TECHNIQUE_ORDER) {
        const step = this._solverFor(type)?.getStep(type);
        if (debugSteps) debugStepList.push(`${type}=${step ? 'YES' : 'no'}`);
        if (step) {
          const stepScore = STEP_BASE_SCORES[step.type] ?? 0;
          score += stepScore;
          if (debugSteps) {
            process.stderr.write(`[STEP ${i}] ${debugStepList.join(', ')}\n`);
          }
          if ((process.env as any)['HODOKU_TRACE']) {
            const elims = step.candidatesToDelete.map(c => `r${Math.floor(c.index/9)+1}c${c.index%9+1}=${c.value}`).join(',');
            const places = step.placements.map(c => `r${Math.floor(c.index/9)+1}c${c.index%9+1}=${c.value}`).join(',');
            const detail = [elims && `ELIM=[${elims}]`, places && `SET=[${places}]`].filter(Boolean).join(' ');
            process.stdout.write(`${step.type}+${stepScore}=${score}${detail ? ' '+detail : ''}\n`);
          }
          // Track minimum difficulty imposed by this technique (H7).
          const techLevelIdx = STEP_MIN_DIFFICULTY_IDX[step.type] ?? 0;
          if (techLevelIdx > minLevelIdx) minLevelIdx = techLevelIdx;
          this.doStep(step);
          // Mirror Java: when GIVE_UP fires, terminate the loop immediately
          // (Java sets step=null causing while(step!=null) to exit).
          if (step.type === SolutionType.GIVE_UP) break outer;
          if (score > maxThreshold) break outer;
          continue outer;
        }
      }
      break; // no step found
    }

    // Walk up the difficulty ladder by score (mirrors Java's post-loop level promotion).
    let levelIdx = minLevelIdx;
    while (levelIdx < DIFFICULTY_LEVELS.length - 1 && score > DIFFICULTY_LEVELS[levelIdx].maxScore) {
      levelIdx++;
    }
    const difficulty = DIFFICULTY_LEVELS[levelIdx].name;

    return { solved: this.sudoku.isSolved, score, difficulty };
  }

  override getStep(type: typeof SolutionType[keyof typeof SolutionType]): SolutionStep | null {
    return this._solverFor(type)?.getStep(type) ?? null;
  }

  /**
   * Convenience: load an 81-character puzzle string, solve it, and return
   * the difficulty rating — all in one call, without managing a {@link Sudoku2}
   * instance yourself.
   *
   * ```ts
   * const { solved, score, difficulty } = SudokuSolver.rate("530070000...");
   * ```
   *
   * @param puzzle        81-character string; '0' or '.' for empty cells.
   * @param maxDifficulty Optional cap — same as {@link solveWithRating}.
   */
  static rate(puzzle: string, maxDifficulty: DifficultyType = "EXTREME"): SolveRating {
    const sudoku = new Sudoku2();
    sudoku.setSudoku(puzzle);
    const solver = new SudokuSolver();
    solver.setSudoku(sudoku);
    return solver.solveWithRating(maxDifficulty);
  }

  private _solverFor(type: typeof SolutionType[keyof typeof SolutionType]): AbstractSolver | null {
    switch (type) {
      case SolutionType.FULL_HOUSE:
      case SolutionType.NAKED_SINGLE:
      case SolutionType.HIDDEN_SINGLE:
      case SolutionType.LOCKED_PAIR:
      case SolutionType.LOCKED_TRIPLE:
      case SolutionType.LOCKED_CANDIDATES:
      case SolutionType.LOCKED_CANDIDATES_1:
      case SolutionType.LOCKED_CANDIDATES_2:
      case SolutionType.NAKED_PAIR:
      case SolutionType.NAKED_TRIPLE:
      case SolutionType.NAKED_QUADRUPLE:
      case SolutionType.HIDDEN_PAIR:
      case SolutionType.HIDDEN_TRIPLE:
      case SolutionType.HIDDEN_QUADRUPLE:
        return this._simple;

      case SolutionType.X_WING:
      case SolutionType.SWORDFISH:
      case SolutionType.JELLYFISH:
      case SolutionType.SQUIRMBAG:
      case SolutionType.WHALE:
      case SolutionType.LEVIATHAN:
      case SolutionType.FINNED_X_WING:
      case SolutionType.FINNED_SWORDFISH:
      case SolutionType.FINNED_JELLYFISH:
      case SolutionType.FINNED_SQUIRMBAG:
      case SolutionType.FINNED_WHALE:
      case SolutionType.FINNED_LEVIATHAN:
      case SolutionType.SASHIMI_X_WING:
      case SolutionType.SASHIMI_SWORDFISH:
      case SolutionType.SASHIMI_JELLYFISH:
      case SolutionType.SASHIMI_SQUIRMBAG:
      case SolutionType.SASHIMI_WHALE:
      case SolutionType.SASHIMI_LEVIATHAN:
      // Franken fish
      case SolutionType.FRANKEN_X_WING:
      case SolutionType.FRANKEN_SWORDFISH:
      case SolutionType.FRANKEN_JELLYFISH:
      case SolutionType.FRANKEN_SQUIRMBAG:
      case SolutionType.FRANKEN_WHALE:
      case SolutionType.FRANKEN_LEVIATHAN:
      case SolutionType.FINNED_FRANKEN_X_WING:
      case SolutionType.FINNED_FRANKEN_SWORDFISH:
      case SolutionType.FINNED_FRANKEN_JELLYFISH:
      case SolutionType.FINNED_FRANKEN_SQUIRMBAG:
      case SolutionType.FINNED_FRANKEN_WHALE:
      case SolutionType.FINNED_FRANKEN_LEVIATHAN:
      // Mutant fish
      case SolutionType.MUTANT_X_WING:
      case SolutionType.MUTANT_SWORDFISH:
      case SolutionType.MUTANT_JELLYFISH:
      case SolutionType.MUTANT_SQUIRMBAG:
      case SolutionType.MUTANT_WHALE:
      case SolutionType.MUTANT_LEVIATHAN:
      case SolutionType.FINNED_MUTANT_X_WING:
      case SolutionType.FINNED_MUTANT_SWORDFISH:
      case SolutionType.FINNED_MUTANT_JELLYFISH:
      case SolutionType.FINNED_MUTANT_SQUIRMBAG:
      case SolutionType.FINNED_MUTANT_WHALE:
      case SolutionType.FINNED_MUTANT_LEVIATHAN:
      // Kraken fish
      case SolutionType.KRAKEN_FISH:
      case SolutionType.KRAKEN_FISH_TYPE_1:
      case SolutionType.KRAKEN_FISH_TYPE_2:
        return this._fish;

      case SolutionType.SKYSCRAPER:
      case SolutionType.TWO_STRING_KITE:
      case SolutionType.DUAL_TWO_STRING_KITE:
      case SolutionType.TURBOT_FISH:
      case SolutionType.EMPTY_RECTANGLE:
      case SolutionType.DUAL_EMPTY_RECTANGLE:
        return this._sdp;

      case SolutionType.XY_WING:
      case SolutionType.XYZ_WING:
      case SolutionType.W_WING:
        return this._wing;

      case SolutionType.SIMPLE_COLORS:
      case SolutionType.SIMPLE_COLORS_TRAP:
      case SolutionType.SIMPLE_COLORS_WRAP:
      case SolutionType.MULTI_COLORS:
      case SolutionType.MULTI_COLORS_1:
      case SolutionType.MULTI_COLORS_2:
        return this._coloring;

      case SolutionType.REMOTE_PAIR:
      case SolutionType.X_CHAIN:
      case SolutionType.XY_CHAIN:
        return this._chain;

      case SolutionType.UNIQUENESS_1:
      case SolutionType.UNIQUENESS_2:
      case SolutionType.UNIQUENESS_3:
      case SolutionType.UNIQUENESS_4:
      case SolutionType.UNIQUENESS_5:
      case SolutionType.UNIQUENESS_6:
      case SolutionType.HIDDEN_RECTANGLE:
      case SolutionType.AVOIDABLE_RECTANGLE_1:
      case SolutionType.AVOIDABLE_RECTANGLE_2:
      case SolutionType.BUG_PLUS_1:
        return this._uniqueness;

      case SolutionType.ALS_XZ:
      case SolutionType.ALS_XY_WING:
      case SolutionType.ALS_XY_CHAIN:
      case SolutionType.DEATH_BLOSSOM:
        return this._als;

      case SolutionType.SUE_DE_COQ:
        return this._misc;

      case SolutionType.NICE_LOOP:
      case SolutionType.DISCONTINUOUS_NICE_LOOP:
      case SolutionType.CONTINUOUS_NICE_LOOP:
      case SolutionType.AIC:
      case SolutionType.GROUPED_NICE_LOOP:
      case SolutionType.GROUPED_CONTINUOUS_NICE_LOOP:
      case SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP:
      case SolutionType.GROUPED_AIC:
      case SolutionType.FORCING_CHAIN:
      case SolutionType.FORCING_CHAIN_CONTRADICTION:
      case SolutionType.FORCING_CHAIN_VERITY:
      case SolutionType.FORCING_NET:
      case SolutionType.FORCING_NET_CONTRADICTION:
      case SolutionType.FORCING_NET_VERITY:
        return this._tabling;

      case SolutionType.TEMPLATE_SET:
      case SolutionType.TEMPLATE_DEL:
        return this._template;

      case SolutionType.BRUTE_FORCE:
        return this._bruteForce;

      case SolutionType.GIVE_UP:
        return this._giveUp;

      case SolutionType.INCOMPLETE:
        return this._incomplete;

      default:
        return null;
    }
  }
}
