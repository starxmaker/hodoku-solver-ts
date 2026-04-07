# HoDoKu Java → TypeScript Port: Difference Tracker

## Category A — Intentionally Omitted (GUI / display layer)

These exist in Java but are out of scope for the TS solver library.

- All Java GUI classes: `MainFrame`, `SudokuPanel`, `SudokuConsoleFrame`, `SudokuKeyboard`, etc.
- Java puzzle generator: `SudokuGenerator.java` (811 lines), `SudokuGeneratorFactory`, `BackgroundGenerator`, `GeneratorPattern`
- `Chain.java` (748 lines) — full chain encoding used only for human-readable move display
- `Options.java` (2516 lines) — configurable parameters: TS hardcodes Java defaults
- `StepConfig.java` (175 lines) — per-technique configuration object
- `DifficultyLevel.java` (97 lines) — TS uses a plain string union + object literal; note: Java has `INCOMPLETE` as a difficulty type but TS omits it from `DifficultyType` (callers check `solved: false` instead)
- `SudokuUtil.java` (566 lines) — UI drawing helpers, color utilities, cell printing
- `SolutionStep` chain/ALS/coloring display methods — `getForcingChainString()`, `getChainString()`, `getCandidateString()`, etc.
- `FindAllSteps.java` (357 lines) — background worker for "Find All Steps" dialog
- `RegressionTester.java` (717 lines) — Java regression test framework (replaced by Jest tests)
- Java statistics and timing: `printStatistics()`, `getStepsNanoTime()`, per-technique nanosecond timing
- `userCandidates` feature — separate user-editable candidate grid (GUI feature in `Sudoku2.java`)
- `SudokuSinglesQueue.java` (235 lines) — Java optimisation for singles detection; TS uses direct candidate mask checks

---

## Category B — "Find All Steps" API (SudokuStepFinder)

`SudokuStepFinder.java` (1383 lines) has no TypeScript equivalent. Its `findAll*()`/`getAll*()` methods enumerate *every* step of a given type across the whole board (used by Java's "Find All Steps" dialog and difficulty analysis). The TS `getStep()` pattern finds only the first/best step.

**Missing methods (all return `List<SolutionStep>`):**

| Java method | Notes |
|---|---|
| `findAllFullHouses()` | |
| `findAllNakedSingles()` | |
| `findAllNakedXle(int size)` | size 2–4 = Pair/Triple/Quad |
| `findAllHiddenSingles()` | |
| `findAllHiddenXle(int size)` | |
| `findAllLockedCandidates()` | calls both LC1 and LC2 |
| `findAllLockedCandidates1()` | Pointing |
| `findAllLockedCandidates2()` | Box-Line Reduction |
| `getAllFishes(minSize, maxSize, maxFins, maxEndoFins, fishType, ...)` | |
| `getAllKrakenFishes(minSize, maxSize, maxFins, ...)` | |
| `findAllEmptyRectangles()` | |
| `findAllSkyScrapers()` | |
| `findAllTwoStringKites()` | |
| `getAllUniqueness()` | |
| `getAllWings()` | XY/XYZ/W-Wing |
| `findAllSimpleColors()` | |
| `findAllMultiColors()` | |
| `getAllChains()` | X-Chain, XY-Chain, Remote Pair |
| `getAllAlses(doXz, doXy, doChain)` | ALS-XZ / ALS-XY-Wing / ALS-XY-Chain |
| `getAllDeathBlossoms()` | |
| `getAllSueDeCoqs()` | |
| `getAllNiceLoops()` | |
| `getAllGroupedNiceLoops()` | |
| `getAllForcingChains()` | |
| `getAllForcingNets()` | |
| `getAllTemplates()` | |

**Missing supporting helpers:**

- `getCandidates()` — list candidates present on board (used by fish/chain finders)
- `getPositions()` — candidate-to-cell index arrays
- `getAlses()` — cached ALS list
- `getRestrictedCommons()` — cached RC list
- `getStartIndices()` / `getEndIndices()` — index boundaries for batch results

---

## Category C — SudokuSolver Missing Public API

`SudokuSolver.java` has a richer public interface than the TS `SudokuSolver` class.

| Java method | Description |
|---|---|
| `solveSinglesOnly(Sudoku2)` | Solve using only naked/hidden singles |
| `solveWithSteps(Sudoku2, StepConfig[])` | Solve with a custom technique configuration |
| `getProgressScore(Sudoku2, List<SolutionStep>)` | Measure how many cells a set of steps clears |
| `getProgressScore(Sudoku2, SolutionStep)` | Single-step version of the above |
| `getHint(Sudoku2, boolean singlesOnly)` | Return next best hint (auto-selects technique) |
| `getAnzSteps()` | Array of step-use counts indexed by technique |
| `getAnzUsedSteps()` | Total steps applied across solve |
| `getState(GuiState)` / `setState(GuiState)` | Save and restore full solver state for undo |
| `getStepsNanoTime()` | Per-technique nanosecond timing array |
| `getStepFinder()` | Expose the `SudokuStepFinder` instance directly |
| `printStatistics()` | Log technique usage statistics to console |

---

## Category D — Sudoku2 Missing Features

| Feature | Notes |
|---|---|
| `userCandidates` (`short[]`) | Separate grid of user-entered candidates (GUI) |
| `free[9][81]` | Per-digit free-cell bitset (TS uses candidate masks instead) |
| `status` / `statusGivens` (`SudokuStatus` enum) | TS derives uniqueness lazily via `_uniqueSolutionCache` |
| `getNsQueue()` / `getHsQueue()` | Naked/hidden singles detection queue (Java perf optimisation) |
| `checkUserCands()` | Validate user-entered candidates against solution |
| `rebuildAllCandidates()` | Full candidate rebuild from scratch |
| `getSudoku(ClipboardMode)` | Export in various clipboard formats (81-char, 729-char, etc.) |
| `setGivens(String)` | Set only the givens, leaving candidate state intact |
| `setNoClues()` | Clear all clues from the grid |
| `getInitialState()` / `setInitialState()` | Save/restore the original puzzle string |
| `getAnzCandidates()` | Count total remaining candidates |
| `getAllCandidates()` variants | Enumerate all candidates in various formats |
| `groupedBuddies` / `groupedBuddiesM1/M2` | Group-node buddy precomputation arrays |
| Bitset template structures | `SudokuSet`-based optimisation for template solver |
| `isCandidateValid()` / `areCandidatesValid()` | Validation helpers that respect user-mode flag |
| Multi-overload `setCell(row, col, value, isFixed, user)` | TS has a single simplified version |

---

## Category E — SolutionStep Missing Fields

The TS `SolutionStep` interface is a minimal subset of Java's `SolutionStep` class. The missing fields are mostly needed for move display in the Java GUI or for the progress-scoring system.

**Missing fields:**

| Java field | Type | Purpose |
|---|---|---|
| `cannibalistic` | `Candidate[]` | Cannibalistic / siamese eliminations |
| `endoFins` | `Candidate[]` | Endo-fins (separate from normal fins) |
| `entity` / `entityNumber` | `int` | Primary entity for display (row/col/box index) |
| `entity2` / `entity2Number` | `int` | Secondary entity for display |
| `colorCandidates` | `Map<int, int>` | Cell color assignments for coloring steps |
| `isSiamese` | `boolean` | Whether step is a dual/siamese pattern |
| `progressScore` | `int` | Normalised score for step ranking |
| `progressScoreSingles` | `int` | Score including downstream singles |
| `progressScoreSinglesOnly` | `int` | Score counting only singles unlocked |
| `potentialEliminations` | `SudokuSet` | All cells this step *could* eliminate |
| `potentialCannibalisticEliminations` | `SudokuSet` | Potential cannibalistic eliminations |
| `alses` | `AlsInSolutionStep[]` | ALS indices + type for display |
| `restrictedCommons` | `RestrictedCommon[]` | RC list for ALS display |
| `chains` | `Chain[]` | Full chain data for move display |
| `subType` | `SolutionType` | E.g. `SIMPLE_COLORS` step has subtype `TRAP` or `WRAP` |

**Missing methods on SolutionStep:**

| Java method | Notes |
|---|---|
| `isForcingChainSet()` | Whether step belongs to the forcing chain/net group |
| `isNet()` | Whether step is a net (vs a chain) |
| `compareChainLengths(other)` | Sort comparator for chain steps |
| `isEqual(other)` | Deep equality check |
| `isEquivalent(other)` | Logical equivalence (same eliminations, different chain) |
| `isSubStep(other)` | Whether this step's eliminations are a subset of another's |
| `getPotentialEliminations()` / `setPotentialEliminations()` | Accessors for potential-eliminations set |
| `getProgressScore()` / `setProgressScore()` etc. | Score accessors |

---

## Category F — Algorithm Options (TS hardcodes Java defaults)

The following Java `Options` fields have no TS equivalent — TS hardcodes the Java default value.

| Java option | Default | TS behaviour |
|---|---|---|
| `RESTRICT_CHAIN_SIZE` | `true` | Chain cap is always applied |
| `RESTRICT_CHAIN_LENGTH` | `20` | X-Chain / XY-Chain / Remote Pair cap = 20 ✓ |
| `RESTRICT_NICE_LOOP_LENGTH` | `10` | Nice Loop cap (getStep mode in ChainSolver is commented out) |
| `ALL_STEPS_ALS_CHAIN_LENGTH` | `6` | ALS-XY-Chain depth = 6 ✓ |
| `ALL_STEPS_ALS_CHAIN_FORWARD_ONLY` | `true` | TS builds both-direction adj map but iterates `ai < aj` pairs only — functionally equivalent |
| `ALLOW_DUALS_AND_SIAMESE` | `false` | TS never generates dual/siamese patterns ✓ |
| `MAX_FISH_SIZE` | `4` | TS cap = 4 ✓ |
| `MAX_KRAKEN_FISH_SIZE` | `4` | TS cap = 4 ✓ |
| `MAX_FINS` | `5` | Not enforced in TS fish solver |
| `MAX_ENDO_FINS` | `2` | Not enforced in TS fish solver |

**Potential gap:** Java's `MAX_FINS = 5` and `MAX_ENDO_FINS = 2` limits are not checked in the TS `FishSolver`. Java uses them to prune the search. TS may generate fish with more fins (unlikely on real puzzles but theoretically possible).

---

## Category G — Confirmed Complete (no gaps found)

The following areas were audited and found equivalent to Java:

| Area | Status |
|---|---|
| `SolutionType` enum — all 60+ Java types | ✅ All present in `SolutionType.ts` |
| `TECHNIQUE_ORDER` — matches Java `Options.DEFAULT_SOLVER_STEPS` | ✅ Order matches; see **H2** (DUAL types) and **H3** (enabled/disabled divergence) for known caveats |
| `SimpleSolver` dispatch (FULL_HOUSE through HIDDEN_QUAD) | ✅ |
| `ColoringSolver` dispatch (SIMPLE_COLORS _TRAP/_WRAP, MULTI_COLORS _1/_2) | ✅ |
| `WingSolver` dispatch (XY_WING, XYZ_WING, W_WING) | ✅ |
| `SingleDigitPatternSolver` dispatch (SKYSCRAPER, TWO_STRING_KITE, DUAL_…, TURBOT_FISH, EMPTY_RECTANGLE, DUAL_…) | ✅ |
| Turbot Fish chain length = 3 links (matches Java hardcoded `chainMaxLength = 3`) | ✅ |
| `MiscellaneousSolver` dispatch (SUE_DE_COQ) | ✅ |
| `TemplateSolver` dispatch (TEMPLATE_SET, TEMPLATE_DEL) | ✅ |
| `AlsSolver` dispatch (ALS_XZ, ALS_XY_WING, ALS_XY_CHAIN depth 6, DEATH_BLOSSOM) | ✅ |
| `UniquenessSolver` dispatch (UNIQUENESS_1–6, HIDDEN_RECTANGLE, AVOIDABLE_RECTANGLE_1/2, BUG_PLUS_1) | ✅ |
| `FishSolver` dispatch — basic/finned/sashimi/franken/mutant sizes 2–7 + KRAKEN_FISH_TYPE_1/2 | ✅ |
| `TablingSolver` dispatch — NICE_LOOP, CONTINUOUS/DISCONTINUOUS_NICE_LOOP, AIC, GROUPED_* variants, FORCING_CHAIN/NET | ✅ |
| `ALLOW_DUALS_AND_SIAMESE = false` — dual patterns never generated | ✅ |
| ALS pair scanning direction — TS `ai < aj` + both-direction adj entries matches Java default | ✅ |

---

## Category H — Known Bugs / Divergences (actionable fixes)

These are genuine differences in the *implemented* code that produce incorrect or non-Java-equivalent behaviour.

### H1 — Wrong base scores for last-resort techniques (difficulty rating bug)

Java `Options.DEFAULT_SOLVER_STEPS` defines the following base scores. TS has different values:

| Technique | Java score | TS score | Java `enabled` | Impact now |
|---|---|---|---|---|
| `BRUTE_FORCE` | **10 000** | 800 | `true` | ❌ Active bug |
| `TEMPLATE_SET` | **10 000** | 320 | `false` | Bug latent until H3 fixed |
| `TEMPLATE_DEL` | **10 000** | 320 | `false` | Bug latent until H3 fixed |
| `KRAKEN_FISH` / `_TYPE_1` / `_TYPE_2` | **500** | 470 | `false` | Bug latent until H3 fixed |

`BRUTE_FORCE` is immediately relevant since Java enables it (`enabled=true`). The others are also disabled by default in Java (see H3), so their wrong scores only affect TS users right now.

File: `src/solver/SudokuSolver.ts`, `STEP_BASE_SCORES` constant.

---

### H2 — DUAL_TWO_STRING_KITE and DUAL_EMPTY_RECTANGLE are tried during normal solving (Java never does this)

Java's `Options.DEFAULT_SOLVER_STEPS` has **no entry** for `DUAL_TWO_STRING_KITE` or `DUAL_EMPTY_RECTANGLE`. These types are only generated by `SudokuStepFinder.findAllSkyScrapers()` / `findAllEmptyRectangles()` (i.e. "find all steps" mode). In Java's sequential solve loop, they are never requested.

TS `TECHNIQUE_ORDER` includes both types between `TWO_STRING_KITE` and `TURBOT_FISH`. This means TS may:
- Apply a dual step where Java would not, changing the solution path and difficulty score.
- Assign difficulty score to a dual step (130/120) that Java would add 0 for.

Fix: remove `SolutionType.DUAL_TWO_STRING_KITE` and `SolutionType.DUAL_EMPTY_RECTANGLE` from `TECHNIQUE_ORDER` (and their entries from `STEP_BASE_SCORES`).

---

### H3 — 31 techniques disabled in Java's default solve mode are all enabled in TS

Java `StepConfig` has an `enabled` flag ("used in solution?"). In `Options.DEFAULT_SOLVER_STEPS`, the following techniques have `enabled = false`, meaning Java's sequential auto-solve loop **never** tries them. TS has no disable concept — all entries in `TECHNIQUE_ORDER` are always tried.

| Technique | Java default `enabled` |
|---|---|
| `SQUIRMBAG` | `false` |
| `WHALE` | `false` |
| `LEVIATHAN` | `false` |
| `FINNED_SQUIRMBAG` | `false` |
| `SASHIMI_SQUIRMBAG` | `false` |
| `FINNED_WHALE` | `false` |
| `SASHIMI_WHALE` | `false` |
| `FINNED_LEVIATHAN` | `false` |
| `SASHIMI_LEVIATHAN` | `false` |
| `DEATH_BLOSSOM` | `false` |
| `FRANKEN_JELLYFISH` | `false` |
| `FRANKEN_SQUIRMBAG` | `false` |
| `FRANKEN_WHALE` | `false` |
| `FRANKEN_LEVIATHAN` | `false` |
| `FINNED_FRANKEN_JELLYFISH` | `false` |
| `FINNED_FRANKEN_SQUIRMBAG` | `false` |
| `FINNED_FRANKEN_WHALE` | `false` |
| `FINNED_FRANKEN_LEVIATHAN` | `false` |
| `MUTANT_X_WING` | `false` |
| `MUTANT_SWORDFISH` | `false` |
| `MUTANT_JELLYFISH` | `false` |
| `MUTANT_SQUIRMBAG` | `false` |
| `MUTANT_WHALE` | `false` |
| `MUTANT_LEVIATHAN` | `false` |
| `FINNED_MUTANT_X_WING` | `false` |
| `FINNED_MUTANT_SWORDFISH` | `false` |
| `FINNED_MUTANT_JELLYFISH` | `false` |
| `FINNED_MUTANT_SQUIRMBAG` | `false` |
| `FINNED_MUTANT_WHALE` | `false` |
| `FINNED_MUTANT_LEVIATHAN` | `false` |
| `KRAKEN_FISH` | `false` |
| `TEMPLATE_SET` | `false` |
| `TEMPLATE_DEL` | `false` |

**Impact:** TS may find a step (e.g. DEATH_BLOSSOM, MUTANT_X_WING) where Java would fall through to FORCING_CHAIN. This changes both the solution path and the cumulative difficulty score for any puzzle that needs one of these techniques. It also means TS may classify a puzzle as EXTREME with a lower numeric score than Java would compute.

**Mitigation options:**
1. Accept the divergence (TS is actually more complete than Java's *default* mode).
2. Add a `defaultEnabled` filter to `TECHNIQUE_ORDER` matching Java's defaults, controlled by a config option.

---

## Notes on Helper Classes
