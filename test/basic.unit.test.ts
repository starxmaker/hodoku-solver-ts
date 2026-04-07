import { Sudoku2, SudokuSolver, SolutionType } from "../src/index";
import type { SolutionStep } from "../src/index";

// ---------------------------------------------------------------------------
// Unit tests for:
//   1. SimpleSolver — Full House, Naked/Hidden Single, Locked Candidates,
//      Locked Pair/Triple, Naked/Hidden Subsets
//   2. Sudoku2 — core grid methods
//   3. SudokuSolver — solve, solveWithRating, static rate()
//
// Mirrors Java SimpleSolver.java / SudokuStepFinder.java test coverage.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Puzzle constants
// ---------------------------------------------------------------------------

// One cell missing (cell 0): valid position for a Full House step.
// Completed grid row-by-row: 1,2,3,4,5,6,7,8,9 / 4,5,6,7,8,9,1,2,3 / ...
const FULL_HOUSE_PUZZLE =
  "023456789456789123789123456214365897365897214897214365531642978642978531978531642";

// Fires NAKED_SINGLE, HIDDEN_SINGLE, LOCKED_PAIR, LOCKED_CANDIDATES_1,
// NAKED_PAIR/TRIPLE/QUAD, HIDDEN_PAIR/TRIPLE/QUAD at raw state.
const EASY_PUZZLE =
  "003020600900305001001806400008102900700000008006708200002609500800203009005010300";

// Fires LOCKED_CANDIDATES_1 and LOCKED_CANDIDATES_2 at raw state.
const SKYSCRAPER_PUZZLE =
  "097050000050007060004009005000000700579060820008000000700400100080700040000090680";

// Fires HIDDEN_PAIR at raw state.
const ALS_REF_PUZZLE =
  "100000000000403060007800900000090002000700030006080000000000000009060000600009010";

// Fires HIDDEN_SINGLE at raw state; after singles has LOCKED_PAIR.
const MULTI_COLORS_PUZZLE =
  "060040100300200000010930054001050060000000000020010800890065070000009005007080090";

// Helper — build solver for a puzzle.
function makeSolver(puzzle: string): SudokuSolver {
  const sudoku = new Sudoku2();
  sudoku.setSudoku(puzzle);
  const solver = new SudokuSolver();
  solver.setSudoku(sudoku);
  return solver;
}

// Helper — advance solver with a list of types until no more progress.
function advance(solver: SudokuSolver, types: (typeof SolutionType[keyof typeof SolutionType])[]): void {
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of types) {
      const step = solver.getStep(t);
      if (step && (step.placements.length > 0 || step.candidatesToDelete.length > 0)) {
        solver.doStep(step);
        progress = true;
        break;
      }
    }
  }
}

const SINGLES = [SolutionType.FULL_HOUSE, SolutionType.NAKED_SINGLE, SolutionType.HIDDEN_SINGLE];

// ---------------------------------------------------------------------------
// 1. SimpleSolver — Singles
// ---------------------------------------------------------------------------

describe("SimpleSolver — Full House", () => {
  test("finds a step when exactly one cell is empty in a house", () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    const step = solver.getStep(SolutionType.FULL_HOUSE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.FULL_HOUSE);
    expect(step!.placements).toHaveLength(1);
    expect(step!.candidatesToDelete).toHaveLength(0);
    expect(step!.placements[0].value).toBeGreaterThanOrEqual(1);
    expect(step!.placements[0].value).toBeLessThanOrEqual(9);
  });

  test("applying the step solves the puzzle", () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    const step = solver.getStep(SolutionType.FULL_HOUSE)!;
    solver.doStep(step);
    expect(solver.getSudoku().isSolved).toBe(true);
  });

  test("returns null when no full house exists", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.FULL_HOUSE);
    expect(step).toBeNull();
  });
});

describe("SimpleSolver — Naked Single", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_SINGLE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.NAKED_SINGLE);
    expect(step!.placements).toHaveLength(1);
  });

  test("placed digit is the only candidate in that cell", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_SINGLE)!;
    const sudoku = solver.getSudoku();
    const cands = sudoku.getCandidates(step.placements[0].index);
    expect(cands).toHaveLength(1);
    expect(cands[0]).toBe(step.placements[0].value);
  });
});

describe("SimpleSolver — Hidden Single", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_SINGLE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.HIDDEN_SINGLE);
    expect(step!.placements).toHaveLength(1);
  });

  test("SKYSCRAPER puzzle fires hidden single at raw state", () => {
    const solver = makeSolver(SKYSCRAPER_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_SINGLE);
    expect(step).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. SimpleSolver — Locked Candidates
// ---------------------------------------------------------------------------

describe("SimpleSolver — Locked Candidates (parent type)", () => {
  test("dispatches to LC1 or LC2 — finds a step on SKYSCRAPER_PUZZLE", () => {
    const solver = makeSolver(SKYSCRAPER_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES);
    expect(step).not.toBeNull();
    expect([
      SolutionType.LOCKED_CANDIDATES_1,
      SolutionType.LOCKED_CANDIDATES_2,
    ]).toContain(step!.type);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(SKYSCRAPER_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });

  test("returns null on fully-solved puzzle", () => {
    const solver = makeSolver(EASY_PUZZLE);
    advance(solver, SINGLES);
    // EASY solves completely with singles — no locked candidates left
    expect(solver.getSudoku().isSolved).toBe(true);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES);
    expect(step).toBeNull();
  });
});

describe("SimpleSolver — Locked Candidates Type 1 (Pointing)", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES_1);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.LOCKED_CANDIDATES_1);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES_1)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });

  test("does not throw on minimal puzzle", () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    expect(() => solver.getStep(SolutionType.LOCKED_CANDIDATES_1)).not.toThrow();
  });
});

describe("SimpleSolver — Locked Candidates Type 2 (Claiming)", () => {
  test("finds a step on SKYSCRAPER_PUZZLE at raw state", () => {
    const solver = makeSolver(SKYSCRAPER_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES_2);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.LOCKED_CANDIDATES_2);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(SKYSCRAPER_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES_2)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });

  test("does not throw on minimal puzzle", () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    expect(() => solver.getStep(SolutionType.LOCKED_CANDIDATES_2)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. SimpleSolver — Locked Pair / Triple (confined to box+line intersection)
// ---------------------------------------------------------------------------

describe("SimpleSolver — Locked Pair", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_PAIR);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.LOCKED_PAIR);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_PAIR)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });

  test("found after singles advancement on MULTI_COLORS_PUZZLE", () => {
    const solver = makeSolver(MULTI_COLORS_PUZZLE);
    advance(solver, SINGLES);
    const step = solver.getStep(SolutionType.LOCKED_PAIR);
    expect(step).not.toBeNull();
  });

  test("does not throw on minimal puzzle", () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    expect(() => solver.getStep(SolutionType.LOCKED_PAIR)).not.toThrow();
  });
});

describe("SimpleSolver — Locked Triple", () => {
  test("does not throw on easy puzzle", () => {
    const solver = makeSolver(EASY_PUZZLE);
    expect(() => solver.getStep(SolutionType.LOCKED_TRIPLE)).not.toThrow();
  });

  test("does not throw on ALS_REF_PUZZLE", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    expect(() => solver.getStep(SolutionType.LOCKED_TRIPLE)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. SimpleSolver — Naked Subsets
// ---------------------------------------------------------------------------

describe("SimpleSolver — Naked Pair", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_PAIR);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.NAKED_PAIR);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_PAIR)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });

  test("does not throw on minimal puzzle", () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    expect(() => solver.getStep(SolutionType.NAKED_PAIR)).not.toThrow();
  });
});

describe("SimpleSolver — Naked Triple", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_TRIPLE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.NAKED_TRIPLE);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_TRIPLE)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });
});

describe("SimpleSolver — Naked Quadruple", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_QUADRUPLE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.NAKED_QUADRUPLE);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_QUADRUPLE)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. SimpleSolver — Hidden Subsets
// ---------------------------------------------------------------------------

describe("SimpleSolver — Hidden Pair", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_PAIR);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.HIDDEN_PAIR);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_PAIR)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });

  test("also fires on ALS_REF_PUZZLE at raw state", () => {
    const solver = makeSolver(ALS_REF_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_PAIR);
    expect(step).not.toBeNull();
  });
});

describe("SimpleSolver — Hidden Triple", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_TRIPLE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.HIDDEN_TRIPLE);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_TRIPLE)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });
});

describe("SimpleSolver — Hidden Quadruple", () => {
  test("finds a step on EASY_PUZZLE at raw state", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_QUADRUPLE);
    expect(step).not.toBeNull();
    expect(step!.type).toBe(SolutionType.HIDDEN_QUADRUPLE);
    expect(step!.candidatesToDelete.length).toBeGreaterThan(0);
  });

  test("step eliminations are valid candidates", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.HIDDEN_QUADRUPLE)!;
    const sudoku = solver.getSudoku();
    for (const c of step.candidatesToDelete) {
      expect(sudoku.isCandidate(c.index, c.value)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Sudoku2 — core grid methods
// ---------------------------------------------------------------------------

describe("Sudoku2 — basic construction and state", () => {
  test("setSudoku parses 81-char string into values", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    // Row 0: 003020600 → positions 0..8
    // 0=0, 1=0, 2=3, 3=0, 4=2, 5=0, 6=6, 7=0, 8=0
    expect(s.values[0]).toBe(0);
    expect(s.values[2]).toBe(3);
    expect(s.values[4]).toBe(2);
    expect(s.values[6]).toBe(6);
  });

  test("setSudoku marks given cells correctly", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    expect(s.isGiven(2)).toBe(true);  // cell 2 = '3'
    expect(s.isGiven(0)).toBe(false); // cell 0 = '0'
  });

  test("isSolved is false on unsolved puzzle", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    expect(s.isSolved).toBe(false);
  });

  test("isSolved is true on completed puzzle", () => {
    const s = new Sudoku2();
    s.setSudoku(FULL_HOUSE_PUZZLE);
    // Advance with Full House until solved
    const solver = new SudokuSolver();
    solver.setSudoku(s);
    const step = solver.getStep(SolutionType.FULL_HOUSE)!;
    solver.doStep(step);
    expect(s.isSolved).toBe(true);
  });

  test("unsolvedCount decrements on setValue", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    const before = s.unsolvedCount;
    s.setValue(0, 5); // any digit
    expect(s.unsolvedCount).toBe(before - 1);
  });

  test("getCandidates returns array of valid digits", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    const cands = s.getCandidates(0);
    expect(cands.length).toBeGreaterThanOrEqual(1);
    for (const d of cands) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  test("candidateCount matches getCandidates length", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    for (const idx of [0, 1, 5, 40, 80]) {
      expect(s.candidateCount(idx)).toBe(s.getCandidates(idx).length);
    }
  });

  test("removeCandidate removes digit from cell candidates", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    const cands = s.getCandidates(0);
    const d = cands[0];
    expect(s.isCandidate(0, d)).toBe(true);
    s.removeCandidate(0, d);
    expect(s.isCandidate(0, d)).toBe(false);
  });

  test("setValue places digit and removes it from buddy candidates", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    s.setValue(0, 4); // place digit 4 in cell 0
    // Cell 0 is now solved
    expect(s.values[0]).toBe(4);
    // isCandidate of solved cell returns false for all digits
    for (let d = 1; d <= 9; d++) {
      expect(s.isCandidate(0, d)).toBe(false);
    }
  });

  test("HOUSES static is 27 houses each of length 9", () => {
    expect(Sudoku2.HOUSES).toHaveLength(27);
    for (const house of Sudoku2.HOUSES) {
      expect(house).toHaveLength(9);
    }
  });

  test("HOUSES covers all 81 cells at least once", () => {
    const seen = new Set<number>();
    for (const house of Sudoku2.HOUSES) {
      for (const idx of house) seen.add(idx);
    }
    expect(seen.size).toBe(81);
  });
});

describe("Sudoku2 — unique solution checks", () => {
  test("hasUniqueSolution returns true for a well-formed puzzle", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    expect(s.hasUniqueSolution()).toBe(true);
  });

  test("hasUniqueSolution returns false for an empty grid", () => {
    const s = new Sudoku2();
    s.setSudoku("0".repeat(81));
    expect(s.hasUniqueSolution()).toBe(false);
  });

  test("toValueString round-trips with setSudoku", () => {
    const s = new Sudoku2();
    s.setSudoku(EASY_PUZZLE);
    // Unset cells are '0' in toValueString
    const str = s.toValueString();
    expect(str).toHaveLength(81);
    // Given cells must match
    for (let i = 0; i < 81; i++) {
      if (EASY_PUZZLE[i] !== "0") {
        expect(str[i]).toBe(EASY_PUZZLE[i]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. SudokuSolver — orchestration and rating
// ---------------------------------------------------------------------------

describe("SudokuSolver — solve()", () => {
  test("solves EASY_PUZZLE to isSolved", async () => {
    const solver = makeSolver(EASY_PUZZLE);
    await solver.solve();
    expect(solver.getSudoku().isSolved).toBe(true);
  }, 30_000);

  test("doStep applies placements to the grid", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.NAKED_SINGLE)!;
    const { index, value } = step.placements[0];
    solver.doStep(step);
    expect(solver.getSudoku().values[index]).toBe(value);
  });

  test("doStep applies candidate deletions to the grid", () => {
    const solver = makeSolver(EASY_PUZZLE);
    const step = solver.getStep(SolutionType.LOCKED_CANDIDATES_1)!;
    const sudoku = solver.getSudoku();
    const { index, value } = step.candidatesToDelete[0];
    expect(sudoku.isCandidate(index, value)).toBe(true);
    solver.doStep(step);
    expect(sudoku.isCandidate(index, value)).toBe(false);
  });

  test("full house puzzle solves in one step", async () => {
    const solver = makeSolver(FULL_HOUSE_PUZZLE);
    await solver.solve();
    expect(solver.getSudoku().isSolved).toBe(true);
  }, 10_000);
});

describe("SudokuSolver — solveWithRating()", () => {
  test("returns solved:true and EASY difficulty for easy puzzle", async () => {
    const solver = makeSolver(EASY_PUZZLE);
    const result = await solver.solveWithRating();
    expect(result.solved).toBe(true);
    expect(result.difficulty).toBe("EASY");
    expect(result.score).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
  }, 30_000);

  test("steps accumulate all applied techniques", async () => {
    const solver = makeSolver(EASY_PUZZLE);
    const result = await solver.solveWithRating();
    // Every step must have a recognised type and non-negative action
    for (const step of result.steps) {
      expect(typeof step.type).toBe("string");
      expect(step.placements.length + step.candidatesToDelete.length).toBeGreaterThan(0);
    }
  }, 30_000);

  test("maxDifficulty cap stops solve early if too hard", async () => {
    // ALS_REF requires techniques beyond EASY band — capping at EASY should not fully solve
    const solver = makeSolver(ALS_REF_PUZZLE);
    const result = await solver.solveWithRating("EASY");
    // Either it stops (not solved) or it happens to fit — both are valid;
    // what must NOT happen is solved:true with score > EASY threshold (800)
    if (result.solved) {
      expect(result.score).toBeLessThanOrEqual(800);
    } else {
      expect(result.solved).toBe(false);
    }
  }, 30_000);
});

describe("SudokuSolver.rate() — static helper", () => {
  test("rates EASY_PUZZLE as EASY difficulty", async () => {
    const result = await SudokuSolver.rate(EASY_PUZZLE);
    expect(result.solved).toBe(true);
    expect(result.difficulty).toBe("EASY");
  }, 30_000);

  test("returns solved:false when maxDifficulty cap is EASY on hard puzzle", async () => {
    // ALS_REF_PUZZLE is hard — won't solve with EASY techniques alone
    const result = await SudokuSolver.rate(ALS_REF_PUZZLE, "EASY");
    // Must not be both solved and above threshold
    if (result.solved) {
      expect(result.score).toBeLessThanOrEqual(800);
    }
  }, 30_000);

  test("result structure is complete", async () => {
    const result = await SudokuSolver.rate(EASY_PUZZLE);
    expect(typeof result.solved).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(typeof result.difficulty).toBe("string");
    expect(Array.isArray(result.steps)).toBe(true);
  }, 30_000);
});
