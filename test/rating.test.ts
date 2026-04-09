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
    async ({ puzzle, difficulty, score }) => {
      const r = await SudokuSolver.rate(puzzle);
      expect(r.solved).toBe(true);
      expect(r.difficulty).toBe(difficulty);
      expect(r.score).toBe(score);
    },
    30_000,
  );
});