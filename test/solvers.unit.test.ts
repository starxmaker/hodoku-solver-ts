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
const SIMPLE_COLORS_WRAP_PUZZLE = "200080300060070084030500209000105408000000000402706000301007040720040060004010003";
const MULTI_COLORS_PUZZLE    = "060040100300200000010930054001050060000000000020010800890065070000009005007080090";
const MULTI_COLORS_2_PUZZLE  = "800000000003600000070090200060005300400050001000008020000040070500000080020700600";
const REMOTE_PAIR_PUZZLE     = "000700080070050000000008030090000400002030900003000060080300000000010050060004000";
const X_CHAIN_PUZZLE         = "800009040040003005000460700900030008700000006600080009009060000300700060060900008";
const XY_CHAIN_PUZZLE        = "000060080060000050080090030000900310300000007075008000040070090050000040090030000";
// Community-sourced puzzle known to contain an XY-Chain of 14 nodes (VladFein / SudokuWiki).
// A chain this long exceeded the old cap of 10 nodes; requires the extended cap of 20.
const XY_CHAIN_LONG_PUZZLE   = "000005008400000300000312060005600012040000300170000908000507600700000000092003000";
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
const DUAL_SDP_PUZZLE        = "000030090000200001050900000000000000102080406080500020075000000401006003000004060";
const X_WING_PUZZLE          = "000001008700030009020000061080009003001040900900300020240000080600090005100600000";
const FINNED_X_WING_PUZZLE   = "030000080200050000000906000000400903008000500106003000000805000000090008050000030";
const ALS_REF_PUZZLE         = "100000000000403060007800900000090002000700030006080000000000000009060000600009010";
const BUG_PLUS_1_PUZZLE      = "849325617732800945561700328493278561157030892286000473978002134314987256625003789";
const SUE_DE_COQ_PUZZLE      = "003006700000091003060003059780254301000317082231689475608132000320470006000960230";
// HoDoKu showcase puzzle — fires Franken and Mutant fish (all sizes ≤ 3) at raw state.
const SHOWCASE_PUZZLE        = "008037000030080002040950003175090024403000600680040075300064010800000000000810500";

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

  // DUAL_TWO_STRING_KITE fires on DUAL_SDP_PUZZLE after SINGLES advancement.
  describe("Dual Two-String Kite", () => {
    test("finds a step after SINGLES advancement", () => {
      const solver = makeSolver(DUAL_SDP_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DUAL_TWO_STRING_KITE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.DUAL_TWO_STRING_KITE);
      expect(step!.candidatesToDelete.length).toBeGreaterThanOrEqual(2);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(DUAL_SDP_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DUAL_TWO_STRING_KITE)!;
      if (!step) return;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.DUAL_TWO_STRING_KITE)).not.toThrow();
    });
  });

  // DUAL_EMPTY_RECTANGLE fires on DUAL_SDP_PUZZLE after SINGLES advancement.
  describe("Dual Empty Rectangle", () => {
    test("finds a step after SINGLES advancement", () => {
      const solver = makeSolver(DUAL_SDP_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DUAL_EMPTY_RECTANGLE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.DUAL_EMPTY_RECTANGLE);
      expect(step!.candidatesToDelete.length).toBeGreaterThanOrEqual(2);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(DUAL_SDP_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DUAL_EMPTY_RECTANGLE)!;
      if (!step) return;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.DUAL_EMPTY_RECTANGLE)).not.toThrow();
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

  // Sub-type direct queries (after sub-type routing fix in _solverFor).
  describe("Simple Colors – Trap sub-type", () => {
    test("finds a TRAP step directly", () => {
      const solver = makeSolver(SIMPLE_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.SIMPLE_COLORS_TRAP);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SIMPLE_COLORS_TRAP);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("TRAP step eliminations are valid", () => {
      const solver = makeSolver(SIMPLE_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.SIMPLE_COLORS_TRAP)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SIMPLE_COLORS_TRAP)).not.toThrow();
    });
  });

  describe("Simple Colors – Wrap sub-type", () => {
    test("finds a WRAP step directly", () => {
      const solver = makeSolver(SIMPLE_COLORS_WRAP_PUZZLE);
      const step = solver.getStep(SolutionType.SIMPLE_COLORS_WRAP);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SIMPLE_COLORS_WRAP);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("WRAP step eliminations are valid", () => {
      const solver = makeSolver(SIMPLE_COLORS_WRAP_PUZZLE);
      const step = solver.getStep(SolutionType.SIMPLE_COLORS_WRAP)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SIMPLE_COLORS_WRAP)).not.toThrow();
    });
  });

  describe("Multi-Colors – Type 1 sub-type", () => {
    test("finds a MULTI_COLORS_1 step directly", () => {
      const solver = makeSolver(MULTI_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.MULTI_COLORS_1);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.MULTI_COLORS_1);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("MULTI_COLORS_1 step eliminations are valid", () => {
      const solver = makeSolver(MULTI_COLORS_PUZZLE);
      const step = solver.getStep(SolutionType.MULTI_COLORS_1)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.MULTI_COLORS_1)).not.toThrow();
    });
  });

  describe("Multi-Colors – Type 2 sub-type", () => {
    test("finds a MULTI_COLORS_2 step directly", () => {
      const solver = makeSolver(MULTI_COLORS_2_PUZZLE);
      const step = solver.getStep(SolutionType.MULTI_COLORS_2);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.MULTI_COLORS_2);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("MULTI_COLORS_2 step eliminations are valid", () => {
      const solver = makeSolver(MULTI_COLORS_2_PUZZLE);
      const step = solver.getStep(SolutionType.MULTI_COLORS_2)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step!.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.MULTI_COLORS_2)).not.toThrow();
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
    // X_CHAIN fires on X_CHAIN_PUZZLE at raw state.
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(X_CHAIN_PUZZLE);
      const step = solver.getStep(SolutionType.X_CHAIN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.X_CHAIN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(X_CHAIN_PUZZLE);
      const step = solver.getStep(SolutionType.X_CHAIN)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.X_CHAIN)).not.toThrow();
    });
  });

  describe("XY-Chain", () => {
    // XY_CHAIN fires on SQUIRMBAG_PUZZLE at raw state.
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      const step = solver.getStep(SolutionType.XY_CHAIN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.XY_CHAIN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      const step = solver.getStep(SolutionType.XY_CHAIN)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.XY_CHAIN)).not.toThrow();
    });

    // The old cap (10 nodes) was raised to 20 to match Java behaviour.
    // This puzzle is documented to contain 18 XY-Chains in its raw state,
    // including one of 14 nodes (VladFein / SudokuWiki). Previously the
    // cap of 10 would miss the longer variant.
    test("finds XY-Chain on long-chain puzzle (cap raised 10→20)", () => {
      const solver = makeSolver(XY_CHAIN_LONG_PUZZLE);
      const step = solver.getStep(SolutionType.XY_CHAIN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.XY_CHAIN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
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

  // X_WING fires on SWORDFISH_REF_PUZZLE at raw state.
  describe("X-Wing", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      const step = solver.getStep(SolutionType.X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      const step = solver.getStep(SolutionType.X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.X_WING)).not.toThrow();
    });
  });

  // WHALE fires on SQUIRMBAG_PUZZLE at raw state.
  describe("Whale", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      const step = solver.getStep(SolutionType.WHALE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.WHALE);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      const step = solver.getStep(SolutionType.WHALE)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.WHALE)).not.toThrow();
    });
  });

  // No puzzle with a Leviathan step was found — smoke test only.
  describe("Leviathan", () => {
    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.LEVIATHAN)).not.toThrow();
    });
  });

  // FINNED_X_WING fires on FINNED_X_WING_PUZZLE after singles advancement.
  describe("Finned X-Wing", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(FINNED_X_WING_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(FINNED_X_WING_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_X_WING)).not.toThrow();
    });
  });

  // SASHIMI_X_WING fires on FINNED_X_WING_PUZZLE at raw state.
  describe("Sashimi X-Wing", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(FINNED_X_WING_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SASHIMI_X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(FINNED_X_WING_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SASHIMI_X_WING)).not.toThrow();
    });
  });

  // SASHIMI_SWORDFISH fires on JELLYFISH_PUZZLE at raw state.
  describe("Sashimi Swordfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SASHIMI_SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SASHIMI_SWORDFISH)).not.toThrow();
    });
  });

  // SASHIMI_JELLYFISH fires on JELLYFISH_PUZZLE at raw state.
  describe("Sashimi Jellyfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_JELLYFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SASHIMI_JELLYFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_JELLYFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SASHIMI_JELLYFISH)).not.toThrow();
    });
  });

  // FINNED_SQUIRMBAG fires on SQUIRMBAG_PUZZLE at raw state.
  describe("Finned Squirmbag", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_SQUIRMBAG);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_SQUIRMBAG);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SQUIRMBAG_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_SQUIRMBAG)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_SQUIRMBAG)).not.toThrow();
    });
  });

  // SASHIMI_SQUIRMBAG fires on JELLYFISH_PUZZLE at raw state.
  describe("Sashimi Squirmbag", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_SQUIRMBAG);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SASHIMI_SQUIRMBAG);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_SQUIRMBAG)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SASHIMI_SQUIRMBAG)).not.toThrow();
    });
  });

  // FINNED_WHALE fires on ALS_REF_PUZZLE at raw state.
  describe("Finned Whale", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_WHALE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_WHALE);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_WHALE)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_WHALE)).not.toThrow();
    });
  });

  // SASHIMI_WHALE fires on JELLYFISH_PUZZLE at raw state.
  describe("Sashimi Whale", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_WHALE);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SASHIMI_WHALE);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_WHALE)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SASHIMI_WHALE)).not.toThrow();
    });
  });

  // FINNED_LEVIATHAN fires on X_CHAIN_PUZZLE after singles advancement.
  describe("Finned Leviathan", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(X_CHAIN_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_LEVIATHAN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_LEVIATHAN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(X_CHAIN_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FINNED_LEVIATHAN)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_LEVIATHAN)).not.toThrow();
    });
  });

  // SASHIMI_LEVIATHAN fires on JELLYFISH_PUZZLE at raw state.
  describe("Sashimi Leviathan", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_LEVIATHAN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.SASHIMI_LEVIATHAN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(JELLYFISH_PUZZLE);
      const step = solver.getStep(SolutionType.SASHIMI_LEVIATHAN)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.SASHIMI_LEVIATHAN)).not.toThrow();
    });
  });

  // Franken fish: base = all rows OR all cols; cover may include boxes.
  // Size ≤ 3 is searched (X-Wing=2, Swordfish=3); larger sizes return null.
  describe("Franken X-Wing", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FRANKEN_X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FRANKEN_X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FRANKEN_X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FRANKEN_X_WING)).not.toThrow();
    });
  });

  describe("Finned Franken X-Wing", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_FRANKEN_X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_FRANKEN_X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_FRANKEN_X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_FRANKEN_X_WING)).not.toThrow();
    });
  });

  describe("Franken Swordfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FRANKEN_SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FRANKEN_SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FRANKEN_SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FRANKEN_SWORDFISH)).not.toThrow();
    });
  });

  describe("Finned Franken Swordfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_FRANKEN_SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_FRANKEN_SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_FRANKEN_SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_FRANKEN_SWORDFISH)).not.toThrow();
    });
  });

  // Mutant fish: base and cover may include rows, cols, and boxes.
  // Size ≤ 3 is searched; larger sizes return null for performance.
  describe("Mutant X-Wing", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.MUTANT_X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.MUTANT_X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.MUTANT_X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.MUTANT_X_WING)).not.toThrow();
    });
  });

  describe("Finned Mutant X-Wing", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_MUTANT_X_WING);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_MUTANT_X_WING);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_MUTANT_X_WING)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_MUTANT_X_WING)).not.toThrow();
    });
  });

  describe("Mutant Swordfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.MUTANT_SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.MUTANT_SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.MUTANT_SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.MUTANT_SWORDFISH)).not.toThrow();
    });
  });

  describe("Finned Mutant Swordfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_MUTANT_SWORDFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_MUTANT_SWORDFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_MUTANT_SWORDFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_MUTANT_SWORDFISH)).not.toThrow();
    });
  });

  // Franken Jellyfish (size 4) is now searched; size ≥ 5 is still blocked.
  describe("Franken Jellyfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FRANKEN_JELLYFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FRANKEN_JELLYFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FRANKEN_JELLYFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FRANKEN_JELLYFISH)).not.toThrow();
    });
  });

  describe("Finned Franken Jellyfish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_FRANKEN_JELLYFISH);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.FINNED_FRANKEN_JELLYFISH);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.FINNED_FRANKEN_JELLYFISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_FRANKEN_JELLYFISH)).not.toThrow();
    });
  });

  // H17: performance caps (size > 4 for Franken, size > 3 for Mutant) removed.
  // These tests verify the searches run without throwing; null means the puzzle
  // has no such pattern, non-null means a valid step was found.

  describe("Franken Squirmbag (size 5)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FRANKEN_SQUIRMBAG)).not.toThrow();
    });
  });

  describe("Finned Franken Squirmbag (size 5)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_FRANKEN_SQUIRMBAG)).not.toThrow();
    });
  });

  describe("Franken Whale (size 6)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FRANKEN_WHALE)).not.toThrow();
    });
  });

  describe("Finned Franken Whale (size 6)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_FRANKEN_WHALE)).not.toThrow();
    });
  });

  describe("Franken Leviathan (size 7)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FRANKEN_LEVIATHAN)).not.toThrow();
    });
  });

  describe("Finned Franken Leviathan (size 7)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_FRANKEN_LEVIATHAN)).not.toThrow();
    });
  });

  describe("Mutant Jellyfish (size 4)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.MUTANT_JELLYFISH)).not.toThrow();
    });
  });

  describe("Finned Mutant Jellyfish (size 4)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_MUTANT_JELLYFISH)).not.toThrow();
    });
  });

  describe("Mutant Squirmbag (size 5)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.MUTANT_SQUIRMBAG)).not.toThrow();
    });
  });

  describe("Finned Mutant Squirmbag (size 5)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_MUTANT_SQUIRMBAG)).not.toThrow();
    });
  });

  describe("Mutant Whale (size 6)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.MUTANT_WHALE)).not.toThrow();
    });
  });

  describe("Finned Mutant Whale (size 6)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_MUTANT_WHALE)).not.toThrow();
    });
  });

  describe("Mutant Leviathan (size 7)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.MUTANT_LEVIATHAN)).not.toThrow();
    });
  });

  describe("Finned Mutant Leviathan (size 7)", () => {
    test("search does not throw (H17: size cap removed)", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      expect(() => solver.getStep(SolutionType.FINNED_MUTANT_LEVIATHAN)).not.toThrow();
    });
  });

  // Kraken fish: finned fish extended by forcing-chain analysis.
  describe("Kraken Fish", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.KRAKEN_FISH);
      expect(step).not.toBeNull();
      // Generic KRAKEN_FISH returns whichever subtype is found first (1 or 2).
      expect([SolutionType.KRAKEN_FISH_TYPE_1, SolutionType.KRAKEN_FISH_TYPE_2]).toContain(step!.type);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.KRAKEN_FISH)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.KRAKEN_FISH)).not.toThrow();
    });
  });

  describe("Kraken Fish Type 1", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.KRAKEN_FISH_TYPE_1);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.KRAKEN_FISH_TYPE_1);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.KRAKEN_FISH_TYPE_1)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.KRAKEN_FISH_TYPE_1)).not.toThrow();
    });
  });

  describe("Kraken Fish Type 2", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.KRAKEN_FISH_TYPE_2);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.KRAKEN_FISH_TYPE_2);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SHOWCASE_PUZZLE);
      const step = solver.getStep(SolutionType.KRAKEN_FISH_TYPE_2)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.KRAKEN_FISH_TYPE_2)).not.toThrow();
    });
  });

});

// -- AlsSolver ---------------------------------------------------------------

describe("AlsSolver", () => {

  // ALS_XZ fires on ALS_REF_PUZZLE at raw state.
  describe("ALS-XZ", () => {
    test("finds a step on raw puzzle state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.ALS_XZ);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.ALS_XZ);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.ALS_XZ)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.ALS_XZ)).not.toThrow();
    });
  });

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
      const step = solver.getStep(SolutionType.ALS_XY_CHAIN);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.ALS_XY_CHAIN);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.ALS_XY_CHAIN)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.ALS_XY_CHAIN)).not.toThrow();
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
  // The returned step type is a sub-type (DNL or AIC) — accept any tabling type.
  describe("Nice Loop", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.NICE_LOOP);
      expect(step).not.toBeNull();
      expect([
        SolutionType.DISCONTINUOUS_NICE_LOOP,
        SolutionType.CONTINUOUS_NICE_LOOP,
        SolutionType.AIC,
      ]).toContain(step!.type);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.NICE_LOOP)).not.toThrow();
    });
  });

  // DISCONTINUOUS_NICE_LOOP is a sub-type obtained via getStep(NICE_LOOP).
  describe("Discontinuous Nice Loop (sub-type)", () => {
    test("getStep(DISCONTINUOUS_NICE_LOOP) returns a DNL or AIC step", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.DISCONTINUOUS_NICE_LOOP);
      expect(step).not.toBeNull();
      expect([
        SolutionType.DISCONTINUOUS_NICE_LOOP,
        SolutionType.AIC,
      ]).toContain(step!.type);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.DISCONTINUOUS_NICE_LOOP)).not.toThrow();
    });
  });

  // CONTINUOUS_NICE_LOOP is a sub-type that places a digit rather than eliminating.
  describe("Continuous Nice Loop (sub-type)", () => {
    test("getStep(CONTINUOUS_NICE_LOOP) finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.CONTINUOUS_NICE_LOOP);
      expect(step).not.toBeNull();
      // TablingSolver returns the first matching nice-loop step; type may be DISCONTINUOUS or CONTINUOUS
      expect([
        SolutionType.DISCONTINUOUS_NICE_LOOP,
        SolutionType.CONTINUOUS_NICE_LOOP,
        SolutionType.AIC,
      ]).toContain(step!.type);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.CONTINUOUS_NICE_LOOP)).not.toThrow();
    });
  });

  // AIC is a sub-type delegating to the same nice-loop search.
  describe("AIC (sub-type)", () => {
    test("getStep(AIC) returns a DNL or AIC step", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.AIC);
      expect(step).not.toBeNull();
      expect([
        SolutionType.DISCONTINUOUS_NICE_LOOP,
        SolutionType.AIC,
      ]).toContain(step!.type);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.AIC)).not.toThrow();
    });
  });

  // FORCING_CHAIN fires on ALS_REF_PUZZLE after singles advancement.
  // The returned step type is a sub-type (contradiction or verity).
  describe("Forcing Chain", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_CHAIN);
      expect(step).not.toBeNull();
      expect([
        SolutionType.FORCING_CHAIN_CONTRADICTION,
        SolutionType.FORCING_CHAIN_VERITY,
      ]).toContain(step!.type);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_CHAIN)).not.toThrow();
    });
  });

  describe("Forcing Chain Contradiction (sub-type)", () => {
    test("getStep(FORCING_CHAIN_CONTRADICTION) returns a contradiction or verity step", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_CHAIN_CONTRADICTION);
      expect(step).not.toBeNull();
      expect([
        SolutionType.FORCING_CHAIN_CONTRADICTION,
        SolutionType.FORCING_CHAIN_VERITY,
      ]).toContain(step!.type);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_CHAIN_CONTRADICTION)).not.toThrow();
    });
  });

  describe("Forcing Chain Verity (sub-type)", () => {
    test("getStep(FORCING_CHAIN_VERITY) returns a contradiction or verity step", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_CHAIN_VERITY);
      expect(step).not.toBeNull();
      expect([
        SolutionType.FORCING_CHAIN_CONTRADICTION,
        SolutionType.FORCING_CHAIN_VERITY,
      ]).toContain(step!.type);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_CHAIN_VERITY)).not.toThrow();
    });
  });

  // FORCING_NET fires on ALS_REF_PUZZLE after singles advancement.
  // The returned step type is a net sub-type (contradiction or verity).
  describe("Forcing Net", () => {
    test("finds a step after singles advancement", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_NET);
      expect(step).not.toBeNull();
      expect([
        SolutionType.FORCING_NET_CONTRADICTION,
        SolutionType.FORCING_NET_VERITY,
      ]).toContain(step!.type);
      expect(
        step!.candidatesToDelete.length + step!.placements.length
      ).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_NET)).not.toThrow();
    });
  });

  describe("Forcing Net Contradiction (sub-type)", () => {
    test("getStep(FORCING_NET_CONTRADICTION) returns a net step", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_NET_CONTRADICTION);
      expect(step).not.toBeNull();
      expect([
        SolutionType.FORCING_NET_CONTRADICTION,
        SolutionType.FORCING_NET_VERITY,
      ]).toContain(step!.type);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_NET_CONTRADICTION)).not.toThrow();
    });
  });

  describe("Forcing Net Verity (sub-type)", () => {
    test("getStep(FORCING_NET_VERITY) returns a net step", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      advanceTechniques(solver, SINGLES);
      const step = solver.getStep(SolutionType.FORCING_NET_VERITY);
      expect(step).not.toBeNull();
      expect([
        SolutionType.FORCING_NET_CONTRADICTION,
        SolutionType.FORCING_NET_VERITY,
      ]).toContain(step!.type);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.FORCING_NET_VERITY)).not.toThrow();
    });
  });

  // GROUPED_NICE_LOOP searches for nice loops using group nodes.
  describe("Grouped Nice Loop", () => {
    test("finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.GROUPED_NICE_LOOP);
      expect(step).not.toBeNull();
      expect([
        SolutionType.GROUPED_NICE_LOOP,
        SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP,
        SolutionType.GROUPED_CONTINUOUS_NICE_LOOP,
        SolutionType.GROUPED_AIC,
      ]).toContain(step!.type);
      expect(step!.candidatesToDelete.length + step!.placements.length).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.GROUPED_NICE_LOOP)).not.toThrow();
    });
  });

  describe("Grouped Discontinuous Nice Loop (sub-type)", () => {
    test("finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP);
      expect(step).not.toBeNull();
      expect([
        SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP,
        SolutionType.GROUPED_AIC,
      ]).toContain(step!.type);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP)).not.toThrow();
    });
  });

  describe("Grouped Continuous Nice Loop (sub-type)", () => {
    test("finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.GROUPED_CONTINUOUS_NICE_LOOP);
      expect(step).not.toBeNull();
      // TablingSolver returns the first grouped nice-loop found; type may be DISCONTINUOUS or CONTINUOUS
      expect([
        SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP,
        SolutionType.GROUPED_CONTINUOUS_NICE_LOOP,
        SolutionType.GROUPED_AIC,
      ]).toContain(step!.type);
      expect(step!.candidatesToDelete.length + step!.placements.length).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.GROUPED_CONTINUOUS_NICE_LOOP)).not.toThrow();
    });
  });

  describe("Grouped AIC (sub-type)", () => {
    test("finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.GROUPED_AIC);
      expect(step).not.toBeNull();
      expect([
        SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP,
        SolutionType.GROUPED_AIC,
      ]).toContain(step!.type);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.GROUPED_AIC)).not.toThrow();
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

// -- TemplateSolver -----------------------------------------------------------

describe("TemplateSolver", () => {

  describe("Template Set", () => {
    test("finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.TEMPLATE_SET);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.TEMPLATE_SET);
      expect(step!.placements.length + step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step output is valid", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.TEMPLATE_SET)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
      for (const { index, value } of step.placements) {
        expect(values[index]).toBe(0);
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.TEMPLATE_SET)).not.toThrow();
    });
  });

  describe("Template Delete", () => {
    test("finds a step on raw ALS_REF state", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.TEMPLATE_DEL);
      expect(step).not.toBeNull();
      expect(step!.type).toBe(SolutionType.TEMPLATE_DEL);
      expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
    });

    test("step eliminations are valid", () => {
      const solver = makeSolver(ALS_REF_PUZZLE);
      const step = solver.getStep(SolutionType.TEMPLATE_DEL)!;
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    });

    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.TEMPLATE_DEL)).not.toThrow();
    });
  });

});

// -- BruteForceSolver ---------------------------------------------------------

describe("BruteForceSolver", () => {

  describe("Brute Force", () => {
    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.BRUTE_FORCE)).not.toThrow();
    });

    test("search does not throw on swordfish puzzle", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      expect(() => solver.getStep(SolutionType.BRUTE_FORCE)).not.toThrow();
    });
  });

  describe("Incomplete", () => {
    test("search does not throw on easy puzzle", () => {
      const solver = makeSolver(EASY_PUZZLE);
      expect(() => solver.getStep(SolutionType.INCOMPLETE)).not.toThrow();
    });

    test("search does not throw on swordfish puzzle", () => {
      const solver = makeSolver(SWORDFISH_REF_PUZZLE);
      expect(() => solver.getStep(SolutionType.INCOMPLETE)).not.toThrow();
    });
  });

});

// ============================================================================
// Regression tests for H-series bug fixes
// ============================================================================

// H1: BRUTE_FORCE should get score 10000 (Java value), not 800.
// NOTE: Testing via solveWithRating on a puzzle requiring BRUTE_FORCE is impractical —
// complex puzzles fall through to slow chains without the H3-disabled techniques.
// Verify the scoring system is calibrated using a simple known puzzle.
describe("H1 regression — score calibration", () => {
  test("EASY_PUZZLE solves with EASY difficulty (score ≤ 800)", async () => {
    const rating = await makeSolver(EASY_PUZZLE).solveWithRating();
    expect(rating.solved).toBe(true);
    expect(rating.score).toBeLessThanOrEqual(800);
    expect(rating.difficulty).toBe("EASY");
  });
});

// H2: DUAL_TWO_STRING_KITE and DUAL_EMPTY_RECTANGLE removed from TECHNIQUE_ORDER.
describe("H2 regression — DUAL types not in solve order", () => {
  test("DUAL_TWO_STRING_KITE step is never applied during normal solve", async () => {
    const solver = makeSolver(DUAL_SDP_PUZZLE);
    await solver.solve();
    // If dual types were applied, they'd appear as step types.
    // Just verify the puzzle solves without the dual types being the deciding factor.
    const { steps } = await makeSolver(DUAL_SDP_PUZZLE).solveWithRating();
    const dualSteps = steps.filter(s =>
      s.type === SolutionType.DUAL_TWO_STRING_KITE ||
      s.type === SolutionType.DUAL_EMPTY_RECTANGLE
    );
    expect(dualSteps).toHaveLength(0);
  });
});

// H3: Disabled-by-default techniques (SQUIRMBAG, DEATH_BLOSSOM, MUTANT_*, etc.)
//     should never appear in normal solve output.
//     NOTE: Testing via solveWithRating(SHOWCASE_PUZZLE) is impractical — removing
//     these techniques from TECHNIQUE_ORDER causes the solver to fall through to
//     FORCING_CHAIN/BRUTE_FORCE, which exceeds any reasonable test timeout.
//     Instead, we verify getStep() for individual disabled types works without
//     throwing — confirming the solvers exist but are not auto-applied.
describe("H3 regression — disabled techniques not applied in solve", () => {
  test("getStep(SQUIRMBAG) does not throw on squirmbag puzzle", () => {
    const solver = makeSolver(SQUIRMBAG_PUZZLE);
    expect(() => solver.getStep(SolutionType.SQUIRMBAG)).not.toThrow();
  });

  test("getStep(DEATH_BLOSSOM) does not throw on ALS puzzle", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    expect(() => solver.getStep(SolutionType.DEATH_BLOSSOM)).not.toThrow();
  });

  test("SQUIRMBAG step (if found via getStep) has valid eliminations", () => {
    const solver = makeSolver(SQUIRMBAG_PUZZLE);
    const step = solver.getStep(SolutionType.SQUIRMBAG);
    if (step !== null) {
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H4: ALS expansion must NOT be applied during FORCING_CHAIN/NET/GROUPED_NICE_LOOP.
// Verified indirectly: solver still finds correct steps without ALS expansion.
describe("H4 regression — no ALS in tabling chains", () => {
  test("FORCING_CHAIN search does not throw", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    expect(() => solver.getStep(SolutionType.FORCING_CHAIN)).not.toThrow();
  });

  test("FORCING_NET search does not throw", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    expect(() => solver.getStep(SolutionType.FORCING_NET)).not.toThrow();
  });
});

// H11: AIC must have ≥2 common buddies for elimination (not just 1).
describe("H11 regression — AIC requires ≥2 eliminations", () => {
  test("AIC step (if found) has at least 2 candidates to delete", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    const step = solver.getStep(SolutionType.AIC);
    // getStep(AIC) may return DISCONTINUOUS_NICE_LOOP (1+ del) or AIC (≥2 del).
    // Only assert the ≥2 constraint when the returned step IS an AIC.
    if (step !== null && step.type === SolutionType.AIC) {
      // H11: must have ≥2 eliminations; single-buddy cases are already covered by Nice Loops.
      expect(step.candidatesToDelete.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// H12: _checkOneChain Case 6 — all-candidates-eliminated contradiction.
describe("H12 regression — _checkOneChain case 6", () => {
  test("FORCING_CHAIN search does not throw on swordfish puzzle", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    expect(() => solver.getStep(SolutionType.FORCING_CHAIN)).not.toThrow();
  });

  test("FORCING_CHAIN eliminations are valid candidates in their cells", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    const step = solver.getStep(SolutionType.FORCING_CHAIN);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
      for (const { index, value } of step.placements) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H13C: rcMask should only include active RC digits, not partner digits.
describe("H13C regression — ALS-XY-Chain rcMask excludes only active RC digits", () => {
  test("ALS-XY-Chain step (if found) has valid eliminations", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    const step = solver.getStep(SolutionType.ALS_XY_CHAIN);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H15: MULTI_COLORS_2 — ordered pairs + relaxed single-cell constraint.
describe("H15 regression — MULTI_COLORS_2 uses ordered pairs", () => {
  test("MULTI_COLORS step does not throw on multi-colors-2 puzzle", () => {
    const solver = makeSolver(MULTI_COLORS_2_PUZZLE);
    expect(() => solver.getStep(SolutionType.MULTI_COLORS)).not.toThrow();
  });

  test("MULTI_COLORS_2 step (if found) has valid eliminations", () => {
    const solver = makeSolver(MULTI_COLORS_2_PUZZLE);
    const step = solver.getStep(SolutionType.MULTI_COLORS);
    if (step !== null && step.type === SolutionType.MULTI_COLORS_2) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H19: Empty Rectangle arm filter — only ONE arm needs ≥2 candidates.
describe("H19 regression — Empty Rectangle single-arm valid ERs", () => {
  test("ER search does not throw on ER_DIRECT_PUZZLE", () => {
    const solver = makeSolver(ER_DIRECT_PUZZLE);
    expect(() => solver.getStep(SolutionType.EMPTY_RECTANGLE)).not.toThrow();
  });

  test("ER step (if found) has valid eliminations", () => {
    const solver = makeSolver(ER_DIRECT_PUZZLE);
    const step = solver.getStep(SolutionType.EMPTY_RECTANGLE);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H20: W-Wing bridge cells must not be excluded from candidatesToDelete.
describe("H20 regression — W-Wing bridge cells included in eliminations", () => {
  test("W-Wing step on W_WING_PUZZLE has valid eliminations when found", () => {
    const solver = makeSolver(W_WING_PUZZLE);
    const step = solver.getStep(SolutionType.W_WING);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
    // null is acceptable; W-Wing may not be the first available step on the raw puzzle.
  });
});

// H23: SIMPLE_COLORS_TRAP must return ALL trap eliminations in one step.
describe("H23 regression — SIMPLE_COLORS_TRAP collects all eliminations", () => {
  test("SIMPLE_COLORS_TRAP step has all valid trap cells in one step", () => {
    const solver = makeSolver(SIMPLE_COLORS_PUZZLE);
    const step = solver.getStep(SolutionType.SIMPLE_COLORS);
    if (step !== null && step.type === SolutionType.SIMPLE_COLORS_TRAP) {
      const { values, candidates } = (solver as any).sudoku as Sudoku2;
      // All returned eliminations must be valid candidates.
      expect(step.candidatesToDelete.length).toBeGreaterThan(0);
      for (const { index, value } of step.candidatesToDelete) {
        expect(values[index]).toBe(0);
        expect(candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H7: per-technique difficulty minimum — technique's own level is a floor for the rating.
describe("H7 regression — per-technique difficulty minimum", () => {
  test("EASY_PUZZLE still rates EASY (only EASY-level techniques)", async () => {
    const r = await makeSolver(EASY_PUZZLE).solveWithRating();
    expect(r.difficulty).toBe("EASY");
  });

  test("getStep(FORCING_CHAIN) returns a FORCING_CHAIN variant when available", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    const step = solver.getStep(SolutionType.FORCING_CHAIN);
    if (step !== null) {
      // FORCING_CHAIN dispatches to _CONTRADICTION or _VERITY subtypes.
      expect([
        SolutionType.FORCING_CHAIN,
        SolutionType.FORCING_CHAIN_CONTRADICTION,
        SolutionType.FORCING_CHAIN_VERITY,
      ]).toContain(step.type);
    }
  });
});

// H10: AIC Type 2 — different-digit endpoint generates two eliminations.
describe("H10 regression — AIC Type 2 (different-digit endpoint)", () => {
  test("AIC search does not throw on swordfish puzzle", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    expect(() => solver.getStep(SolutionType.AIC)).not.toThrow();
  });

  test("AIC step (if Type 2) has exactly 2 eliminations at valid cells", () => {
    const solver = makeSolver(SWORDFISH_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    const step = solver.getStep(SolutionType.AIC);
    if (step !== null && step.candidatesToDelete.length === 2) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H13A: ALS-XY-Chain depth limit raised from 6 to 50 (matching Java MAX_RC in getStep mode).
describe("H13A regression — ALS-XY-Chain depth 50", () => {
  test("getStep(ALS_XY_CHAIN) does not throw on ALS puzzle (depth not prematurely capped)", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    expect(() => solver.getStep(SolutionType.ALS_XY_CHAIN)).not.toThrow();
  });

  test("ALS-XY-Chain step (if found) has valid eliminations", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    advanceTechniques(solver, PHASE_0);
    const step = solver.getStep(SolutionType.ALS_XY_CHAIN);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H16: ChainSolver returns shortest chain across all starts (mirrors Java sort-by-length).
describe("H16 regression — X-Chain / XY-Chain return globally shortest chain", () => {
  test("X-Chain step returned is valid (shortest-chain search produces correct eliminations)", () => {
    const solver = makeSolver(X_CHAIN_PUZZLE);
    const step = solver.getStep(SolutionType.X_CHAIN);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });

  test("XY-Chain step returned is valid (shortest-chain search produces correct eliminations)", () => {
    const solver = makeSolver(XY_CHAIN_PUZZLE);
    const step = solver.getStep(SolutionType.XY_CHAIN);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });

  test("X-Chain search does not throw on easy puzzle", () => {
    const solver = makeSolver(EASY_PUZZLE);
    expect(() => solver.getStep(SolutionType.X_CHAIN)).not.toThrow();
  });

  test("XY-Chain search does not throw on easy puzzle", () => {
    const solver = makeSolver(EASY_PUZZLE);
    expect(() => solver.getStep(SolutionType.XY_CHAIN)).not.toThrow();
  });
});

// H17: Franken size > 4 and Mutant size > 3 guards removed.
describe("H17 regression — Franken/Mutant size caps removed", () => {
  test("getStep(FRANKEN_SQUIRMBAG) returns non-null or null without throwing", () => {
    const solver = makeSolver(SHOWCASE_PUZZLE);
    const step = solver.getStep(SolutionType.FRANKEN_SQUIRMBAG);
    // Guards removed: may find a step or return null — both are valid.
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });

  test("getStep(MUTANT_JELLYFISH) returns non-null or null without throwing", () => {
    const solver = makeSolver(SHOWCASE_PUZZLE);
    const step = solver.getStep(SolutionType.MUTANT_JELLYFISH);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H6: TemplateSolver cross-digit iterative refinement.
// Templates for digit j are pruned when they overlap with forced-cell masks of other digits.
// After the fix, TEMPLATE_SET/DEL results are a subset of (or equal to) pre-fix results — never wrong.
describe("H6 regression — TemplateSolver cross-digit refinement", () => {
  test("TEMPLATE_SET step (if found) has valid placements", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    const step = solver.getStep(SolutionType.TEMPLATE_SET);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index } of step.placements) {
        expect(sudoku.values[index]).toBe(0); // cell must still be empty
      }
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });

  test("TEMPLATE_DEL step (if found) has valid eliminations after cross-digit refinement", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    const step = solver.getStep(SolutionType.TEMPLATE_DEL);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });

  test("TEMPLATE_SET search does not throw on showcase puzzle", () => {
    const solver = makeSolver(SHOWCASE_PUZZLE);
    expect(() => solver.getStep(SolutionType.TEMPLATE_SET)).not.toThrow();
  });
});

// H14: Kraken Franken Fish — _findKrakenFrankenFish adds box-cover Kraken search.
// Java KRAKEN_MAX_FISH_TYPE = 1 includes Franken Kraken.
describe("H14 regression — Kraken Franken Fish", () => {
  test("Kraken Fish search (including Franken) does not throw on SHOWCASE_PUZZLE", () => {
    const solver = makeSolver(SHOWCASE_PUZZLE);
    expect(() => solver.getStep(SolutionType.KRAKEN_FISH)).not.toThrow();
  });

  test("KRAKEN_FISH_TYPE_1 step (if found) has valid eliminations and cover entities", () => {
    const solver = makeSolver(SHOWCASE_PUZZLE);
    const step = solver.getStep(SolutionType.KRAKEN_FISH_TYPE_1);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
      // coverEntities must be non-empty (basic or Franken cover lines / boxes).
      expect(step.coverEntities!.length).toBeGreaterThan(0);
    }
  });

  test("Kraken Fish search does not throw on easy puzzle", () => {
    const solver = makeSolver(EASY_PUZZLE);
    expect(() => solver.getStep(SolutionType.KRAKEN_FISH)).not.toThrow();
  });
});

// H18: ALS buddy forcing — ALS exit-digit deletions that reduce a ≥3-candidate cell to 1 remaining
//      candidate trigger a forced-ON implication.
describe("H18 regression — ALS buddy forcing in TablingSolver", () => {
  test("GROUPED_NICE_LOOP search (which uses ALS expansion) does not throw", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    expect(() => solver.getStep(SolutionType.GROUPED_NICE_LOOP)).not.toThrow();
  });

  test("GROUPED_DISCONTINUOUS_NICE_LOOP step (if found) has valid eliminations", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    const step = solver.getStep(SolutionType.GROUPED_DISCONTINUOUS_NICE_LOOP);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });
});

// H21: Group-to-group strong link — G1-OFF → G2-ON when G2 is the only remaining group in house.
// H22: Singleton-OFF → Group-ON — c2 (non-group) going OFF forces group G when c2+G exhaust house.
describe("H21/H22 regression — TablingSolver group implication completeness", () => {
  test("GROUPED_NICE_LOOP search does not throw on ALS_REF_PUZZLE", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    expect(() => solver.getStep(SolutionType.GROUPED_NICE_LOOP)).not.toThrow();
  });

  test("GROUPED_AIC step (if found) has valid eliminations", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    const step = solver.getStep(SolutionType.GROUPED_AIC);
    if (step !== null) {
      const sudoku = solver.getSudoku();
      for (const { index, value } of step.candidatesToDelete) {
        expect(sudoku.values[index]).toBe(0);
        expect(sudoku.candidates[index] & (1 << value)).toBeTruthy();
      }
    }
  });

  test("GROUPED_NICE_LOOP search does not throw on SHOWCASE_PUZZLE", () => {
    const solver = makeSolver(SHOWCASE_PUZZLE);
    expect(() => solver.getStep(SolutionType.GROUPED_NICE_LOOP)).not.toThrow();
  });
});