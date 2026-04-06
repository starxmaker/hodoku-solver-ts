# hodoku-solver-ts

TypeScript port of [HoDoKu](https://sourceforge.net/projects/hodoku/)'s logical Sudoku solver.

Applies human-style techniques — from naked singles up to forcing chains — to solve or analyse a puzzle step by step.

## Installation

```bash
npm install hodoku-solver-ts
```

## Quick start

```ts
import { Sudoku2, SudokuSolver, SolutionType } from "hodoku-solver-ts";

// 81-character string, '0' for empty cells
const puzzle = "483000000000045000000006000000132000000564000000798000000000514000253000000417000";

const sudoku = new Sudoku2();
sudoku.setSudoku(puzzle);

const solver = new SudokuSolver();
solver.setSudoku(sudoku);

// Solve completely
solver.solve();

console.log(sudoku.isSolved);   // true
console.log(sudoku.getValues()); // number[81]
```

## Step-by-step analysis

Instead of solving all at once you can ask for individual steps and inspect or apply them yourself.

```ts
import { Sudoku2, SudokuSolver, SolutionType } from "hodoku-solver-ts";

const sudoku = new Sudoku2();
sudoku.setSudoku("483000000000045000000006000000132000000564000000798000000000514000253000000417000");

const solver = new SudokuSolver();
solver.setSudoku(sudoku);

// Find the next step of any technique
const step = solver.getNextStep(); // returns SolutionStep | null

if (step) {
  console.log(step.type);                // e.g. "NAKED_SINGLE"
  console.log(step.placements);          // [{ index: 3, value: 9 }, ...]
  console.log(step.candidatesToDelete);  // [{ index: 12, value: 4 }, ...]

  // Apply it
  solver.doStep(step);
}
```

### Target a specific technique

```ts
// Ask only for an X-Wing
const step = solver.getStep(SolutionType.X_WING);
```

### Advance simples first

Some advanced techniques only become detectable after all naked/hidden singles have been applied:

```ts
// Apply all naked/hidden singles until none remain
let s: ReturnType<typeof solver.getStep>;
while ((s = solver.getStep(SolutionType.NAKED_SINGLE) ?? solver.getStep(SolutionType.HIDDEN_SINGLE))) {
  solver.doStep(s);
}

// Now look for a harder technique
const ur1 = solver.getStep(SolutionType.UNIQUENESS_1);
```

## API

### `Sudoku2`

Holds the puzzle state.

| Member | Description |
|---|---|
| `setSudoku(clue: string)` | Load an 81-character puzzle string (`'0'` or `'.'` for empty cells). |
| `isSolved` | `true` when all 81 cells are filled. |
| `getValues()` | Returns `number[81]` – placed digits, `0` for unsolved cells. |
| `getCandidates()` | Returns `number[81]` – bitmask of remaining candidates per cell (`1 << digit`). |
| `isCandidate(index, digit)` | Whether `digit` is still a candidate in cell `index`. |

### `SudokuSolver`

Orchestrates all sub-solvers.

| Member | Description |
|---|---|
| `setSudoku(sudoku: Sudoku2)` | Attach a puzzle. Must be called before any solve/step call. |
| `solve()` | Apply techniques in difficulty order until the puzzle is solved or no step is found. |
| `getStep(type: SolutionType)` | Return the next step of the given technique, or `null` if none applies. |
| `doStep(step: SolutionStep)` | Apply a previously retrieved step to the puzzle. |
| `getSudoku()` | Return the attached `Sudoku2` instance. |

### `SolutionStep`

```ts
interface SolutionStep {
  type: SolutionType;           // technique that found this step
  placements: Placement[];      // digits to place: { index, value }
  candidatesToDelete: Candidate[]; // candidates to remove: { index, value }
}
```

Cell indices are 0-based row-major (`0` = row 0 col 0, `80` = row 8 col 8).

### `SolutionType`

All supported techniques, in the order the solver tries them:

| Category | Techniques |
|---|---|
| Singles | `FULL_HOUSE`, `NAKED_SINGLE`, `HIDDEN_SINGLE` |
| Locked candidates | `LOCKED_CANDIDATES_1`, `LOCKED_CANDIDATES_2` |
| Subsets | `NAKED_PAIR`, `NAKED_TRIPLE`, `NAKED_QUADRUPLE`, `HIDDEN_PAIR`, `HIDDEN_TRIPLE`, `HIDDEN_QUADRUPLE` |
| Fish | `X_WING`, `SWORDFISH`, `JELLYFISH`, `SQUIRMBAG`, `FINNED_X_WING`, `FINNED_SWORDFISH`, `FINNED_JELLYFISH`, `FINNED_SQUIRMBAG` |
| Single-digit patterns | `SKYSCRAPER`, `TWO_STRING_KITE`, `TURBOT_FISH`, `EMPTY_RECTANGLE` |
| Wings | `XY_WING`, `XYZ_WING`, `W_WING` |
| Coloring | `SIMPLE_COLORS`, `MULTI_COLORS` |
| Chains | `REMOTE_PAIR`, `X_CHAIN`, `XY_CHAIN`, `NICE_LOOP` |
| Uniqueness | `UNIQUENESS_1`–`UNIQUENESS_6`, `HIDDEN_RECTANGLE`, `AVOIDABLE_RECTANGLE_1`, `AVOIDABLE_RECTANGLE_2`, `BUG_PLUS_1` |
| ALS | `ALS_XZ`, `ALS_XY_WING`, `ALS_CHAIN`, `DEATH_BLOSSOM` |
| Miscellaneous | `SUE_DE_COQ` |
| Forcing | `FORCING_CHAIN`, `FORCING_NET` |

## Building from source

```bash
npm install
npm run build   # outputs CJS + ESM + .d.ts to dist/
npm test        # runs Jest snapshot tests against the Java reference solver
```

## License

GPL-3.0-only — ported from HoDoKu, Copyright © 2008–2012 Bernhard Hobiger.
