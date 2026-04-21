import * as fs from "fs";
import * as path from "path";
import { SudokuSolver } from "../src/index";
import type { DifficultyType } from "../src/index";

interface TestCase {
  puzzle: string;
  difficulty: DifficultyType;
  score: number;
}

function parseCSV(): TestCase[] {
  const csv = fs.readFileSync(path.join(__dirname, "test_data.csv"), "utf8");
  const lines = csv.trim().split(/\r?\n/).slice(1); // skip header
  return lines.map(line => {
    const parts = line.match(/"([^"]*)"/g)!.map(s => s.slice(1, -1));
    return {
      puzzle:     parts[0],
      difficulty: parts[1].toUpperCase() as DifficultyType,
      score:      parseInt(parts[2], 10),
    };
  });
}

describe("SudokuSolver.rate() -- CSV regression", () => {
  const cases = parseCSV();
  test.concurrent.each(cases)(
    "puzzle $puzzle -> $difficulty / $score",
    ({ puzzle, difficulty, score }) => {
      const r = SudokuSolver.rate(puzzle);
      expect(r.solved).toBe(true);
      expect(r.difficulty).toBe(difficulty);
      expect(r.score).toBe(score);
    },
    30_000,
  );

  test("keeps the existing difficulty-capped API", () => {
    const caseAboveEasy = cases.find(testCase => testCase.score > 800);

    expect(caseAboveEasy).toBeDefined();

    const byDifficulty = SudokuSolver.rate(caseAboveEasy!.puzzle, "EASY");
    const byScore = SudokuSolver.rateByScore(caseAboveEasy!.puzzle, 800);

    expect(byDifficulty).toEqual(byScore);
  });

  test("can stop when score exceeds a numeric cap", () => {
    const { puzzle, score } = cases[0];

    const r = SudokuSolver.rateByScore(puzzle, 200);

    expect(score).toBeGreaterThan(200);
    expect(r.solved).toBe(false);
    expect(r.score).toBeGreaterThan(200);
    expect(r.score).toBeLessThanOrEqual(score);
  });
});