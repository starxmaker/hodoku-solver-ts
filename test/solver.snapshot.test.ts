import { Sudoku2, SudokuSolver, SolutionType } from "../src/index";
import * as P from "./puzzles";

// ---------------------------------------------------------------------------
// Snapshot constants captured from the Java reference implementation.
// Source: SolverSnapshotTest.java (Hodoku project).
// ---------------------------------------------------------------------------

// Solution strings — '.' denotes a cell the Java solver could not crack
// with logical techniques alone.
const EASY_SOLUTION         = "483921657967345821251876493548132976729564138136798245372689514814253769695417382";
const UNIQUENESS_1_SOLUTION = "579518243543279618812634975134752896925863754685491322268947531751385469397126587";
const NAKED_PAIR_SOLUTION   = "461572938732894156895316247378629514529481673614753892957248361183967425246135789";
const X_WING_SOLUTION       = "1..9........4.3.6...78..9.....69...2...7...3...638...............9.6....6....9.1.";
const XY_WING_SOLUTION      = "...6..5....8........9..3..6....6......6.5..9..4..8.62...47..........68..7....1...";
const SKYSCRAPER_SOLUTION   = ".97.5.....5...7.6...4..9.75......7..579.6.82...8.7....7..4..1..98.7...4.....9.687";
const REMOTE_PAIR_SOLUTION  = "...7...8..7..5.........8.3..9....4.3..2.3.9....3....6..8.3.........1..5..6...4...";
const ALS_XZ_SOLUTION       = "987523116356487912828916457615798334739145268144768519593674821471252683262351749";

// Step elimination snapshots
const UR1_ELIM_COUNT          = 2;
const UR1_ELIM_0_INDEX        = 12;
const UR1_ELIM_0_VALUE        = 2;

const NAKED_PAIR_ELIM_COUNT   = 2;
const NAKED_PAIR_ELIM_0_INDEX = 31;
const NAKED_PAIR_ELIM_0_VALUE = 8;

const ALS_XZ_ELIM_COUNT       = 3;
const ALS_XZ_ELIM_0_INDEX     = 26;
const ALS_XZ_ELIM_0_VALUE     = 6;

const FINNED_X_WING_ELIM_COUNT   = 1;
const FINNED_X_WING_ELIM_0_INDEX = 11;
const FINNED_X_WING_ELIM_0_VALUE = 9;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSolver(puzzle: string): SudokuSolver {
  const sudoku = new Sudoku2();
  sudoku.setSudoku(puzzle);
  const solver = new SudokuSolver();
  solver.setSudoku(sudoku);
  return solver;
}

function advanceSimples(solver: SudokuSolver): void {
  const simpleTypes = [
    SolutionType.NAKED_SINGLE,
    SolutionType.HIDDEN_SINGLE,
    SolutionType.FULL_HOUSE,
    SolutionType.LOCKED_CANDIDATES_1,
    SolutionType.LOCKED_CANDIDATES_2,
    SolutionType.NAKED_PAIR,
    SolutionType.HIDDEN_PAIR,
  ];
  for (let limit = 0; limit < 500; limit++) {
    let stepped = false;
    for (const type of simpleTypes) {
      const step = solver.getStep(type);
      if (step) { solver.doStep(step); stepped = true; break; }
    }
    if (!stepped) break;
  }
}

// ---------------------------------------------------------------------------
// Solution snapshot tests
// ---------------------------------------------------------------------------

describe("SudokuSolver — solution snapshots", () => {
  test.each([
    ["easy",        P.EASY_PUZZLE,         EASY_SOLUTION],
    ["uniqueness-1",P.UNIQUENESS_1_PUZZLE, UNIQUENESS_1_SOLUTION],
    ["naked-pair",  P.NAKED_PAIR_PUZZLE,   NAKED_PAIR_SOLUTION],
    ["x-wing",      P.X_WING_PUZZLE,       X_WING_SOLUTION],
    ["xy-wing",     P.XY_WING_PUZZLE,      XY_WING_SOLUTION],
    ["skyscraper",  P.SKYSCRAPER_PUZZLE,   SKYSCRAPER_SOLUTION],
    ["remote-pair", P.REMOTE_PAIR_PUZZLE,  REMOTE_PAIR_SOLUTION],
    ["als-xz",      P.ALS_XZ_PUZZLE,       ALS_XZ_SOLUTION],
  ])("%s puzzle matches Java reference output", (_name, puzzle, expected) => {
    const solver = makeSolver(puzzle);
    solver.solve();
    const actual = solver.getSudoku().toValueString();
    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Step elimination snapshot tests
// ---------------------------------------------------------------------------

describe("SudokuSolver — step elimination snapshots", () => {
  test("UR1 elimination matches snapshot", () => {
    const solver = makeSolver(P.UNIQUENESS_1_PUZZLE);
    const step = solver.getStep(SolutionType.UNIQUENESS_1);
    expect(step).not.toBeNull();
    expect(step!.candidatesToDelete).toHaveLength(UR1_ELIM_COUNT);
    expect(step!.candidatesToDelete[0].index).toBe(UR1_ELIM_0_INDEX);
    expect(step!.candidatesToDelete[0].value).toBe(UR1_ELIM_0_VALUE);
  });

  test("Naked Pair elimination matches snapshot", () => {
    const solver = makeSolver(P.NAKED_PAIR_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_PAIR);
    expect(step).not.toBeNull();
    expect(step!.candidatesToDelete).toHaveLength(NAKED_PAIR_ELIM_COUNT);
    expect(step!.candidatesToDelete[0].index).toBe(NAKED_PAIR_ELIM_0_INDEX);
    expect(step!.candidatesToDelete[0].value).toBe(NAKED_PAIR_ELIM_0_VALUE);
  });

  test("ALS-XZ elimination matches snapshot", () => {
    const solver = makeSolver(P.ALS_XZ_PUZZLE);
    const step = solver.getStep(SolutionType.ALS_XZ);
    expect(step).not.toBeNull();
    expect(step!.candidatesToDelete).toHaveLength(ALS_XZ_ELIM_COUNT);
    expect(step!.candidatesToDelete[0].index).toBe(ALS_XZ_ELIM_0_INDEX);
    expect(step!.candidatesToDelete[0].value).toBe(ALS_XZ_ELIM_0_VALUE);
  });

  test("Finned X-Wing elimination matches snapshot", () => {
    const solver = makeSolver(P.FINNED_X_WING_PUZZLE);
    advanceSimples(solver);
    const step = solver.getStep(SolutionType.FINNED_X_WING);
    expect(step).not.toBeNull();
    expect(step!.candidatesToDelete).toHaveLength(FINNED_X_WING_ELIM_COUNT);
    expect(step!.candidatesToDelete[0].index).toBe(FINNED_X_WING_ELIM_0_INDEX);
    expect(step!.candidatesToDelete[0].value).toBe(FINNED_X_WING_ELIM_0_VALUE);
  });
});
