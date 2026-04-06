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
  SolutionType.LOCKED_CANDIDATES_1,
  SolutionType.LOCKED_CANDIDATES_2,
  SolutionType.NAKED_PAIR,
  SolutionType.NAKED_TRIPLE,
  SolutionType.HIDDEN_PAIR,
  SolutionType.HIDDEN_TRIPLE,
  SolutionType.NAKED_QUADRUPLE,
  SolutionType.HIDDEN_QUADRUPLE,
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
      expect(step!.type).toBe(SolutionType.SIMPLE_COLORS);
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
      expect(step!.type).toBe(SolutionType.MULTI_COLORS);
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
