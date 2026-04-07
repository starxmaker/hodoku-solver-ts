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

// ---------------------------------------------------------------------------
// SolutionType — mirrors sudoku/SolutionType.java
// ---------------------------------------------------------------------------

/**
 * Every logical technique the solver knows about, in the order it tries them
 * (cheapest first, matching the Java {@code StepConfig} order).
 */
export const SolutionType = {
  // Singles
  FULL_HOUSE: "FULL_HOUSE",
  HIDDEN_SINGLE: "HIDDEN_SINGLE",
  NAKED_SINGLE: "NAKED_SINGLE",

  // Locked subsets (naked pair/triple confined to a box+line intersection)
  LOCKED_PAIR: "LOCKED_PAIR",
  LOCKED_TRIPLE: "LOCKED_TRIPLE",

  // Locked candidates
  LOCKED_CANDIDATES_1: "LOCKED_CANDIDATES_1",
  LOCKED_CANDIDATES_2: "LOCKED_CANDIDATES_2",

  // Subsets
  NAKED_PAIR: "NAKED_PAIR",
  NAKED_TRIPLE: "NAKED_TRIPLE",
  NAKED_QUADRUPLE: "NAKED_QUADRUPLE",
  HIDDEN_PAIR: "HIDDEN_PAIR",
  HIDDEN_TRIPLE: "HIDDEN_TRIPLE",
  HIDDEN_QUADRUPLE: "HIDDEN_QUADRUPLE",

  // Fish
  X_WING: "X_WING",
  SWORDFISH: "SWORDFISH",
  JELLYFISH: "JELLYFISH",
  SQUIRMBAG: "SQUIRMBAG",
  FINNED_X_WING: "FINNED_X_WING",
  FINNED_SWORDFISH: "FINNED_SWORDFISH",
  FINNED_JELLYFISH: "FINNED_JELLYFISH",
  FINNED_SQUIRMBAG: "FINNED_SQUIRMBAG",

  // Single-digit patterns
  SKYSCRAPER: "SKYSCRAPER",
  TWO_STRING_KITE: "TWO_STRING_KITE",
  EMPTY_RECTANGLE: "EMPTY_RECTANGLE",
  TURBOT_FISH: "TURBOT_FISH",

  // Wings
  XY_WING: "XY_WING",
  XYZ_WING: "XYZ_WING",
  W_WING: "W_WING",

  // Coloring
  SIMPLE_COLORS: "SIMPLE_COLORS",
  MULTI_COLORS: "MULTI_COLORS",

  // Chains
  REMOTE_PAIR: "REMOTE_PAIR",
  X_CHAIN: "X_CHAIN",
  XY_CHAIN: "XY_CHAIN",

  // Uniqueness
  UNIQUENESS_1: "UNIQUENESS_1",
  UNIQUENESS_2: "UNIQUENESS_2",
  UNIQUENESS_3: "UNIQUENESS_3",
  UNIQUENESS_4: "UNIQUENESS_4",
  UNIQUENESS_5: "UNIQUENESS_5",
  UNIQUENESS_6: "UNIQUENESS_6",
  HIDDEN_RECTANGLE: "HIDDEN_RECTANGLE",
  AVOIDABLE_RECTANGLE_1: "AVOIDABLE_RECTANGLE_1",
  AVOIDABLE_RECTANGLE_2: "AVOIDABLE_RECTANGLE_2",
  BUG_PLUS_1: "BUG_PLUS_1",

  // ALS
  ALS_XZ: "ALS_XZ",
  ALS_XY_WING: "ALS_XY_WING",
  ALS_CHAIN: "ALS_CHAIN",
  DEATH_BLOSSOM: "DEATH_BLOSSOM",

  // Miscellaneous
  SUE_DE_COQ: "SUE_DE_COQ",

  // Forcing chains / nice loops (tabling)
  NICE_LOOP: "NICE_LOOP",
  FORCING_CHAIN: "FORCING_CHAIN",
  FORCING_NET: "FORCING_NET",

  // Templates
  TEMPLATE_SET: "TEMPLATE_SET",
  TEMPLATE_DEL: "TEMPLATE_DEL",

  // Last resort
  BRUTE_FORCE: "BRUTE_FORCE",
  GIVE_UP: "GIVE_UP",
  INCOMPLETE: "INCOMPLETE",
} as const;

export type SolutionType = typeof SolutionType[keyof typeof SolutionType];
