# hodoku-solver-ts

TypeScript port of [HoDoKu](https://sourceforge.net/projects/hodoku/)'s logical Sudoku solver, scoped to **difficulty rating only**.

Given an 81-character puzzle string it returns the difficulty score and band that HoDoKu's Java solver would produce.

Please consider that it is far slower than the original Java version. Use this version only if you need JS support.


## Current parity

Take this numbers as reference only, not guaranteed results. If you find a disparity, please report.

These numbers are generated using parity tool, which uses Java QQwing (generation of 5000 puzzles) and original Hodoku (solving). Then the sudokus are solved using current library, and scores are compared.

You can run it using `npm run parity-tool`

Note: the tool excludes known disparities. So also check that file.

| Difficulty            | Difficulty parity     | Score parity       |
|-----------------------|-----------------------|--------------------|
| Easy                  | 100%                  | 100%               |
| Medium                | 100%                  | 100%               |
| Hard                  | 100%                  | 100%               |
| Unfair                | 100%                  | 99.7%              |
| Extreme               | 99.74%                | 97.91%             |

## Scope

**Included:**
- Full logical solver engine (naked singles → forcing chains) — all techniques contribute to scoring
- `SudokuSolver.rate()` — the single public entry point
- Difficulty bands: `EASY`, `MEDIUM`, `HARD`, `UNFAIR`, `EXTREME`
- Scores that match the Java reference implementation

**Not included:**
- Step-by-step API (`getStep`, `doStep`, `solve`)
- Access to the internal grid state (`Sudoku2`, candidates, placed values)
- Solution strings or candidate lists
- Display metadata (fish base/cover sets, fin cells)
- Puzzle generation

## Usage

```ts
import { SudokuSolver } from "hodoku-solver-ts";

const { solved, difficulty, score } = await SudokuSolver.rate(
  "...253..87..1.......1....4...8.94...5.......71.95.8....1......2...785...3.4.2....",
);

console.log(solved);      // true
console.log(difficulty);  // "EASY"
console.log(score);       // 224
```

### Optional difficulty cap

Stop early if the puzzle exceeds a given band:

```ts
const r = await SudokuSolver.rate(puzzle, "HARD");
if (!r.solved) {
  console.log("Puzzle exceeds HARD");
}
```

## API

### `SudokuSolver.rate(puzzle, maxDifficulty?)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `puzzle` | `string` | — | 81-character string; `'0'` or `'.'` for empty cells. |
| `maxDifficulty` | `DifficultyType` | `"EXTREME"` | Stop and return `solved: false` when score exceeds this band. |

Returns `Promise<SolveRating>`:

```ts
interface SolveRating {
  solved:     boolean;        // true when all 81 cells were filled by logic
  score:      number;         // cumulative HoDoKu score
  difficulty: DifficultyType; // "EASY" | "MEDIUM" | "HARD" | "UNFAIR" | "EXTREME"
}
```

Score thresholds (matching Java): EASY ≤ 800, MEDIUM ≤ 1000, HARD ≤ 1600, UNFAIR ≤ 1800, EXTREME = anything above.

## Building from source

```bash
npm install
npm run build   # outputs CJS + ESM + .d.ts to dist/
npm test        # runs Jest regression tests against test/test_data.csv
```

## License

GPL-3.0-only — ported from HoDoKu, Copyright © 2008–2012 Bernhard Hobiger.
