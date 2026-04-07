import { Sudoku2, SudokuSolver, SolutionType } from "../src/index";

// ---------------------------------------------------------------------------
// Dedicated unit tests for Phase 1 / Phase 2 solvers.
//
// Approach: call getStep(T) on a puzzle at the right advancement state.
// Activation states are determined empirically (see diagnostic runs).
//
//  "finds a step" -- getStep() returns non-null with valid eliminations.
//  "no-throw"     -- getStep() on an easy puzzle does not crash.
//  "solves"       -- solver.solve() reaches isSolved for the puzzle.
// ---------------------------------------------------------------------------

// -- Puzzle strings (Java reference / snapshot tests) ----------------------

const SKYSCRAPER_PUZZLE      = "097050000050007060004009005000000700579060820008000000700400100080700040000090680";
const TWO_STRING_KITE_PUZZLE = "300000090060050000000900000020000001005030042080270000900600000706000030050008007";
const XY_WING_PUZZLE         = "000600500008000000009003006000000000006050090040080020004700000000006800700001000";
const XYZ_WING_PUZZLE        = "900008050060050030000700060000009001009000070050003600006007040075000083000030000";
const W_WING_PUZZLE          = "010000070000015060870063050000000000009100600000000000040390027080640000090000080";
const SIMPLE_COLORS_PUZZLE   = "000700509000100060050006070900000006004050800600000003080600030060001000709004000";
const MULTI_COLORS_PUZZLE    = "060040100300200000010930054001050060000000000020010800890065070000009005007080090";
const REMOTE_PAIR_PUZZLE     = "000700080070050000000008030090000400002030900003000060080300000000010050060004000";
const X_CHAIN_PUZZLE         = "800009040040003005000460700900030008700000006600080009009060000300700060060900008";
const XY_CHAIN_PUZZLE        = "000060080060000050080090030000900310300000007075008000040070090050000040090030000";
const EASY_PUZZLE            = "003020600900305001001806400008102900700000008006708200002609500800203009005010300";

// New puzzle strings for Phase 3 / Phase 4 solver techniques.
// Advancement: SINGLES = [FULL_HOUSE, NAKED_SINGLE, HIDDEN_SINGLE] only.
const SWORDFISH_REF_PUZZLE   = "900080010050009006003607500010000800002030070300060000500000060080093020004000300";

// Phase 4: unique-solution puzzles for UR2–6, Hidden Rectangle.
// Puzzle sources: Andrew Stuart's SudokuWiki example grids.
// All verified unique via _countSolns — hasUniqueSolution() === true.
const UR2_PUZZLE   = "020000000060000794809060200700003000900102003000500008004020507682000030000000010";
const UR3_PUZZLE   = "000206803002000050060700009003090005050000020100040900500008070030000400807009000";
const UR4_PUZZLE   = "030090000000000604906000350060180700090040020004035010048000205703000000000010030";
const UR6_PUZZLE   = "070903080000020000200407001605000109020000060708000205900205006000070000010309020";
const HR_PUZZLE    = "000503470500800000000090002850000600024607590006000037200060000000008005043902000";
const JELLYFISH_PUZZLE       = "654020071200107546001456002127630450006501207509270160005812000902000015010005020";
const SQUIRMBAG_PUZZLE       = "900000561006010793710096248600021479000000005000040006420058617507102004001000052";
const FINNED_SW_PUZZLE       = "000000000904000500020030040200070030060000010090060007040090020007000608000000000";
const ER_DIRECT_PUZZLE       = "724956138168423597935718624500300810040081750081070240013000072000100085050007061";
const ALS_REF_PUZZLE         = "100000000000403060007800900000090002000700030006080000000000000009060000600009010";
const BUG_PLUS_1_PUZZLE      = "849325617732800945561700328493278561157030892286000473978002134314987256625003789";
const SUE_DE_COQ_PUZZLE      = "003006700000091003060003059780254301000317082231689475608132000320470006000960230";

// -- Helpers ---------------------------------------------------------------

function makeSolver(puzzle: string): SudokuSolver {
  const sudoku = new Sudoku2();
  sudoku.setSudoku(puzzle);
  const solver = new SudokuSolver();
  solver.setSudoku(sudoku);
  return solver;
}

const PHASE_0: SolutionType[] = [
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
];

const SINGLES: SolutionType[] = [
  SolutionType.FULL_HOUSE,
  SolutionType.NAKED_SINGLE,
  SolutionType.HIDDEN_SINGLE,
];

function advanceTechniques(solver: SudokuSolver, types: SolutionType[]): void {
  let progress = true;
  while (progress) {
    progress = false;
    for (const type of types) {
      const step = solver.getStep(type);
      if (step && (step.placements.length > 0 || step.candidatesToDelete.length > 0)) {
        solver.doStep(step);
        progress = true;
        break;
      }
    }
  }
}

// -- SingleDigitPatternSolver -----------------------------------------------

describe("SingleDigitPatternSolver", () => {

  // SKYSCRAPER fires on the raw puzzle state (before any Phase-0 advancement).
  describe("Skyscraper", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SKYSCRAPER_PUZZLE);
      const step = solver.getStep(SolutionType.SKYSCRAPER);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SKYSCRAPER);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SKYSCRAPER_PUZZLE);
      const step = solver.getStep(SolutionType.SKYSCRAPER)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("puzzle solves to completion", async () => {
      const solver = makeSolver(SKYSCRAPER_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SKYSCRAPER)).not.toThrow();
    });
  });

  // TWO_STRING_KITE fires on the SKYSCRAPER puzzle after Phase-0 advancement.
  describe("Two-String Kite", () => {
    test("finds a step after Phase-0 on skyscraper reference puzzle", () => {
      const solver = makeSolver(SKYSCRAPER_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      const step = solver.getStep(SolutionType.TWO_STRING_KITE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.TWO_STRING_KITE);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SKYSCRAPER_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      const step = solver.getStep(SolutionType.TWO_STRING_KITE)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("dedicated puzzle solves to completion", async () => {
      const solver = makeSolver(TWO_STRING_KITE_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);
  });

  // TURBOT_FISH fires on SWORDFISH_REF_PUZZLE after singles advancement.
  describe("Turbot Fish", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.TURBOT_FISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.TURBOT_FISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.TURBOT_FISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.TURBOT_FISH)).not.toThrow();
    });
  });

  // EMPTY_RECTANGLE fires directly on ER_DIRECT_PUZZLE (pre-solved to near-ER state).
  describe("Empty Rectangle", () => {
    test("finds a step on direct puzzle state", () => {
      const solver = makeSolver(ER_DIRECT_PUZZLE);
      const step = solver.getStep(SolutionType.EMPTY_RECTANGLE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.EMPTY_RECTANGLE);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(ER_DIRECT_PUZZLE);
      const step = solver.getStep(SolutionType.EMPTY_RECTANGLE)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.EMPTY_RECTANGLE)).not.toThrow();
    });
  });

});

// -- WingSolver ---------------------------------------------------------------

describe("WingSolver", () => {

  describe("XY-Wing", () => {
    test("puzzle solves to completion", async () => {
      const solver = makeSolver(XY_WING_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.XY_WING)).not.toThrow();
    });
  });

  describe("XYZ-Wing", () => {
    test("puzzle solves to completion", async () => {
      const solver = makeSolver(XYZ_WING_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.XYZ_WING)).not.toThrow();
    });
  });

  describe("W-Wing", () => {
    test("puzzle solves to completion", async () => {
      const solver = makeSolver(W_WING_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.W_WING)).not.toThrow();
    });
  });

});

// -- ColoringSolver -----------------------------------------------------------

describe("ColoringSolver", () => {

  // SIMPLE_COLORS fires on the raw puzzle state.
  describe("Simple Colors", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SIMPLE_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.SIMPLE_COLORS);
      expect(step).not.toBeNull();
      expect([SolutionType.SIMPLE_COLORS_TRAP, SolutionType.SIMPLE_COLORS_WRAP]).toContain(step!.type);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SIMPLE_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.SIMPLE_COLORS)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SIMPLE_COLORS)).not.toThrow();
    });
  });

  // MULTI_COLORS fires on the raw puzzle state.
  describe("Multi-Colors", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(MULTI_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.MULTI_COLORS);
      expect(step).not.toBeNull();
      expect([SolutionType.MULTI_COLORS_1, SolutionType.MULTI_COLORS_2]).toContain(step!.type);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(MULTI_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.MULTI_COLORS)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.MULTI_COLORS)).not.toThrow();
    });
  });

});

// -- ChainSolver ---------------------------------------------------------------

describe("ChainSolver", () => {

  describe("Remote Pair", () => {
    test("dedicated puzzle solves to completion", async () => {
      const solver = makeSolver(REMOTE_PAIR_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.REMOTE_PAIR)).not.toThrow();
    });
  });

  describe("X-Chain", () => {
    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.X_CHAIN)).not.toThrow();
    });

    test("search does not throw on x-chain puzzle", () => {
      const solver = makeSolver(X_CHAIN_PUZZLE);
      expect(() => solver.getStep(SolutionType.X_CHAIN)).not.toThrow();
    });
  });

  describe("XY-Chain", () => {
    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.XY_CHAIN)).not.toThrow();
    });

    test("search does not throw on xy-chain puzzle", () => {
      const solver = makeSolver(XY_CHAIN_PUZZLE);
      expect(() => solver.getStep(SolutionType.XY_CHAIN)).not.toThrow();
    });
  });

});
// -- FishSolver ---------------------------------------------------------------

describe("FishSolver", () => {

  // SWORDFISH fires on SWORDFISH_REF_PUZZLE after singles advancement.
  describe("Swordfish", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SWORDFISH)).not.toThrow();
    });
  });

  // JELLYFISH fires directly on JELLYFISH_PUZZLE (no advancement needed).
  describe("Jellyfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.JELLYFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.JELLYFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.JELLYFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.JELLYFISH)).not.toThrow();
    });
  });

  // SQUIRMBAG fires on SQUIRMBAG_PUZZLE after singles advancement.
  describe("Squirmbag", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.SQUIRMBAG);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SQUIRMBAG);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.SQUIRMBAG)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SQUIRMBAG)).not.toThrow();
    });
  });

  // FINNED_SWORDFISH fires on FINNED_SW_PUZZLE after singles advancement.
  describe("Finned Swordfish", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(FINNED_SW_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(FINNED_SW_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_SWORDFISH)).not.toThrow();
    });
  });

  // FINNED_JELLYFISH fires on SWORDFISH_REF_PUZZLE after singles advancement.
  describe("Finned Jellyfish", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_JELLYFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_JELLYFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_JELLYFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_JELLYFISH)).not.toThrow();
    });
  });

});

// -- AlsSolver ---------------------------------------------------------------

describe("AlsSolver", () => {

  // ALS_XY_WING fires on ALS_REF_PUZZLE after singles advancement.
  describe("ALS-XY-Wing", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.ALS_XY_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.ALS_XY_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.ALS_XY_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.ALS_XY_WING)).not.toThrow();
    });
  });

  // ALS_CHAIN fires on SWORDFISH_REF_PUZZLE after singles advancement.
  describe("ALS-Chain", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.ALS_CHAIN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.ALS_CHAIN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.ALS_CHAIN)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.ALS_CHAIN)).not.toThrow();
    });
  });

  // DEATH_BLOSSOM fires on SWORDFISH_REF_PUZZLE after singles advancement.
  describe("Death Blossom", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DEATH_BLOSSOM);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.DEATH_BLOSSOM);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DEATH_BLOSSOM)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.DEATH_BLOSSOM)).not.toThrow();
    });
  });

});

// -- TablingSolver ------------------------------------------------------------

describe("TablingSolver", () => {

  // NICE_LOOP fires on ALS_REF_PUZZLE after singles advancement.
  describe("Nice Loop", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.NICE_LOOP);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.NICE_LOOP);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.NICE_LOOP)).not.toThrow();
    });
  });

  // FORCING_CHAIN fires on ALS_REF_PUZZLE after singles advancement.
  describe("Forcing Chain", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_CHAIN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FORCING_CHAIN);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_CHAIN)).not.toThrow();
    });
  });

  // FORCING_NET fires on ALS_REF_PUZZLE after singles advancement.
  describe("Forcing Net", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_NET);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FORCING_NET);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_NET)).not.toThrow();
    });
  });

});

// -- UniquenessSolver ---------------------------------------------------------

describe("UniquenessSolver", () => {

  // BUG_PLUS_1 fires directly on BUG_PLUS_1_PUZZLE (no advancement needed).
  describe("BUG+1", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(BUG_PLUS_1_PUZZLE);
      const step = solver.getStep(SolutionType.BUG_PLUS_1);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.BUG_PLUS_1);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(BUG_PLUS_1_PUZZLE);
      const step = solver.getStep(SolutionType.BUG_PLUS_1)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("puzzle solves to completion", async () => {
      const solver = makeSolver(BUG_PLUS_1_PUZZLE);
      await solver.solve();
      expect((solver as any).sudoku.isSolved).toBe(true);
    }, 30_000);

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.BUG_PLUS_1)).not.toThrow();
    });
  });

  // ── Uniqueness Type 1 (UR1) ──────────────────────────────────────────────

  // UR1 fires on UNIQUENESS_1_PUZZLE after advancing with basic techniques.
  // (Positive elimination snapshot is already verified in solver.snapshot.test.ts.)
  describe("Uniqueness Type 1", () => {
    const UNIQUENESS_1_PUZZLE = "000806000200010074009700010006000201300000600020000000030005000002000080810002953";

    test("finds a step after singles advancement", () => {
      const solver = makeSolver(UNIQUENESS_1_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.UNIQUENESS_1);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.UNIQUENESS_1);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(UNIQUENESS_1_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.UNIQUENESS_1)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_1)).not.toThrow();
    });
  });

  // ── Uniqueness Type 2 (UR2) ──────────────────────────────────────────────

  // UR2 fires on UR2_PUZZLE (SWiki_UR2_Fig3) after advancing with singles.
  describe("Uniqueness Type 2", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(UR2_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.UNIQUENESS_2);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.UNIQUENESS_2);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(UR2_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.UNIQUENESS_2)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("returns null on multi-solution puzzle", () => {
      // ALS_REF_PUZZLE has 4 solutions → hasUniqueSolution()=false → guard fires
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_2);
      expect(step).toBeNull();
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_2)).not.toThrow();
    });
  });

  // ── Uniqueness Type 3 (UR3) ──────────────────────────────────────────────

  // UR3 fires on UR3_PUZZLE (SWiki_UR3b) after Phase-0 advancement.
  describe("Uniqueness Type 3", () => {
    test("finds a step after Phase-0 advancement", () => {
      const solver = makeSolver(UR3_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      const step = solver.getStep(SolutionType.UNIQUENESS_3);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.UNIQUENESS_3);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(UR3_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      const step = solver.getStep(SolutionType.UNIQUENESS_3)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_3);
      expect(step).toBeNull();
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_3)).not.toThrow();
    });
  });

  // ── Uniqueness Type 4 (UR4) ──────────────────────────────────────────────

  // UR4 fires on UR4_PUZZLE (SWiki_UR4) immediately (raw state).
  describe("Uniqueness Type 4", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(UR4_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_4);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.UNIQUENESS_4);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(UR4_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_4)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_4);
      expect(step).toBeNull();
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_4)).not.toThrow();
    });
  });

  // ── Uniqueness Type 5 (UR5) ──────────────────────────────────────────────

  // UR5 is a rare diagonal variant of UR2. No confirmed test puzzle available;
  // tests verify the search does not crash and honours the uniqueness guard.
  describe("Uniqueness Type 5", () => {
    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_5);
      expect(step).toBeNull();
    });

    test("search does not throw on unique-solution puzzle", () => {
      const solver = makeSolver(UR2_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_5)).not.toThrow();
      const step = solver.getStep(SolutionType.UNIQUENESS_5);
      if (step !== null) {
        expect(step.type).toBe(SolutionType.UNIQUENESS_5);
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_5)).not.toThrow();
    });
  });

  // ── Uniqueness Type 6 (UR6) ──────────────────────────────────────────────

  // UR6 fires on UR6_PUZZLE (SWiki_UR2_Fig4) after Phase-0 advancement.
  describe("Uniqueness Type 6", () => {
    test("finds a step after Phase-0 advancement", () => {
      const solver = makeSolver(UR6_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      const step = solver.getStep(SolutionType.UNIQUENESS_6);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.UNIQUENESS_6);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(UR6_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      const step = solver.getStep(SolutionType.UNIQUENESS_6)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.UNIQUENESS_6);
      expect(step).toBeNull();
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.UNIQUENESS_6)).not.toThrow();
    });
  });

  // ── Hidden Rectangle (UR hidden) ─────────────────────────────────────────

  // HIDDEN_RECTANGLE fires on HR_PUZZLE (SWiki_UR3) immediately (raw state).
  describe("Hidden Rectangle", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(HR_PUZZLE);
      const step = solver.getStep(SolutionType.HIDDEN_RECTANGLE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.HIDDEN_RECTANGLE);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(HR_PUZZLE);
      const step = solver.getStep(SolutionType.HIDDEN_RECTANGLE)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.HIDDEN_RECTANGLE);
      expect(step).toBeNull();
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.HIDDEN_RECTANGLE)).not.toThrow();
    });
  });

  // ── Avoidable Rectangle Type 1 (AR1) ──────────────────────────────────────

  // AR1 requires both hasUniqueSolution() and hasUniqueGivensSolution().
  // No confirmed positive-test puzzle found; tests verify the guard and no-crash.
  describe("Avoidable Rectangle Type 1", () => {
    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_1);
      expect(step).toBeNull();
    });

    test("search does not throw on unique-solution puzzle", () => {
      const solver = makeSolver(UR2_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      expect(() => solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_1)).not.toThrow();
      const step = solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_1);
      if (step !== null) {
        expect(step.type).toBe(SolutionType.AVOIDABLE_RECTANGLE_1);
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_1)).not.toThrow();
    });
  });

  // ── Avoidable Rectangle Type 2 (AR2) ──────────────────────────────────────

  // AR2 requires both hasUniqueSolution() and hasUniqueGivensSolution().
  // No confirmed positive-test puzzle found; tests verify the guard and no-crash.
  describe("Avoidable Rectangle Type 2", () => {
    test("returns null on multi-solution puzzle", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_2);
      expect(step).toBeNull();
    });

    test("search does not throw on unique-solution puzzle", () => {
      const solver = makeSolver(UR4_PUZZLE);
      advanceTechniques(solver, PHASE_0);
      expect(() => solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_2)).not.toThrow();
      const step = solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_2);
      if (step !== null) {
        expect(step.type).toBe(SolutionType.AVOIDABLE_RECTANGLE_2);
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.AVOIDABLE_RECTANGLE_2)).not.toThrow();
    });
  });

});

// -- MiscellaneousSolver ------------------------------------------------------

describe("MiscellaneousSolver", () => {

  // SUE_DE_COQ fires on SUE_DE_COQ_PUZZLE after singles advancement.
  describe("Sue de Coq", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(SUE_DE_COQ_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.SUE_DE_COQ);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SUE_DE_COQ);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SUE_DE_COQ_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.SUE_DE_COQ)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SUE_DE_COQ)).not.toThrow();
    });
  });

});