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
| `ALL_STEPS_ALS_CHAIN_LENGTH` | `6` | **getStep mode only**: `getStep(ALS_XY_CHAIN)` resets chain to `MAX_RC = 50` (unlimited depth). The `6` limit applies only to `getAllAlses` (find-all) mode. TS caps at 5 RCs — see **H13**. |
| `ALL_STEPS_ALS_CHAIN_FORWARD_ONLY` | `true` | TS builds both-direction adj map but iterates `ai < aj` pairs only — functionally equivalent |
| `ALLOW_DUALS_AND_SIAMESE` | `false` | TS never generates dual/siamese patterns ✓ |
| `MAX_FISH_SIZE` | `4` | TS cap = 4 ✓ |
| `MAX_KRAKEN_FISH_SIZE` | `4` | TS cap = 4 ✓ |
| `MAX_FINS` | `5` | TS uses `size + 4` pre-filter (≤ 4 fin positions); Java limits actual fin cells to 5 — TS may find valid fish with 5+ fin cells that Java prunes |
| `MAX_ENDO_FINS` | `2` | Not tracked in TS at all — see endo-fin note below |

**Fin count difference:** TS pre-filters with `allCrossing.size > size + 4` (at most 4 fin crossing positions). Java checks `finCells.length <= MAX_FINS = 5`. For finned Swordfish/Jellyfish, TS may find correct finned fish with 5+ total fin cells that Java skips for performance. TS is a superset here (more complete, not incorrect).

**Endo-fin correctness gap (Mutant finned fish — potential unsoundness):** Java tracks *endo-fins* — base cells that also appear in a box cover unit. When base set construction accumulates candidate intersections across units, any repeated cells become endo-fins. For the elimination check, Java sets `fins = regular_fins ∪ endo_fins`; elimination cells must see ALL of them.

TS has no endo-fin concept. `_searchGeneralFish` treats all base cells NOT in `coverCells` as regular fins. Cells that are endo-fins in Java's sense (in both base AND a cover box) remain in `coverCells` in TS, so TS does NOT require elimination cells to see them. For Mutant finned fish where the base mixes rows/cols and boxes, TS can produce incorrect eliminations — skipping the endo-fin visibility constraint.

Practical impact: Mutant fish are disabled in Java by default (H3); TS's size cap limits Mutant search to sizes ≤ 3; boards rarely trigger this exact configuration. Low risk but provably unsound.

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
| `TemplateSolver` dispatch (TEMPLATE_SET, TEMPLATE_DEL) | ✅ dispatch only — algorithm is incomplete, see **H6** |
| `AlsSolver` dispatch (ALS_XZ, ALS_XY_WING, ALS_XY_CHAIN depth 6, DEATH_BLOSSOM) | ✅ |
| `UniquenessSolver` dispatch (UNIQUENESS_1–6, HIDDEN_RECTANGLE, AVOIDABLE_RECTANGLE_1/2, BUG_PLUS_1) | ✅ |
| `FishSolver` dispatch — basic/finned/sashimi/franken/mutant sizes 2–7 + KRAKEN_FISH_TYPE_1/2 | ✅ |
| `TablingSolver` dispatch — NICE_LOOP, CONTINUOUS/DISCONTINUOUS_NICE_LOOP, AIC, GROUPED_* variants, FORCING_CHAIN/NET | ✅ |
| `ALLOW_DUALS_AND_SIAMESE = false` — dual patterns never generated | ✅ |
| ALS pair scanning direction — TS `ai < aj` + both-direction adj entries matches Java default | ✅ |
| `Sudoku2._placeDigit` — removes placed digit from all buddy candidates | ✅ |
| `AbstractSolver.doStep` — applies `setValue` for placements, `removeCandidate` for eliminations | ✅ |
| `ColoringSolver` algorithm — WRAP/TRAP logic per component matches Java exactly | ✅ |
| `WingSolver` algorithms — XY-Wing, XYZ-Wing, W-Wing (including `else-if` single-link constraint) match Java | ✅ |
| `MiscellaneousSolver` SUE_DE_COQ algorithm — intersection subsets, line/block enumeration, allowed-cand mask, elimination formulas all match Java | ✅ |
| `UniquenessSolver` UR1–UR6, Hidden Rectangle, Avoidable Rectangle 1/2, BUG+1 — all algorithms verified correct | ✅ |
| `ChainSolver` X-Chain, XY-Chain, Remote Pair — chain length cap (20), DFS structure, elimination rules all match Java | ✅ |
| `AlsSolver` DEATH_BLOSSOM — stem loop, per-candidate ALS assignment, overlap guard, commonMask, elimination formula all match Java | ✅ |
| `FishSolver` basic/finned fish — fin detection, sashimi check (≤1 covered candidate in a base line), elimination filter all match Java | ✅ |
| `SingleDigitPatternSolver` algorithms — Skyscraper, Two-String Kite, Turbot Fish (3-link X-chain), Empty Rectangle all match Java | ✅ |
| `AlsSolver` ALS-XZ doubly-linked (`_doublyLinkedElims`) — leftover-digit ALS lock propagation matches Java | ✅ |
| `SimpleSolver` locked candidates (LC1/LC2) — exactly-2-or-3 filter, row/col/box alignment checks, elimination generation all match Java | ✅ |
| `TablingSolver` `_checkTwoChains` — both-premise verity detection correct (minor: Java removes premise cell from results; TS omits this but checkOneChain runs first and handles the degenerate case) | ✅ (minor divergence documented in H notes) |
| `Sudoku2.setSudoku` — candidate initialisation (fill all candidates, then `_placeDigit` for each given) matches Java's 81-char parse path | ✅ (TS only implements the 81-char format; Java also supports PM grid formats — see Category D) |
| `AlsSolver._collectAlses` — includes 1-cell ALS (k=1), matching Java's default `getAlses(false)` which includes bi-value cells | ✅ |
| `AlsSolver._findAlsXYWing` — hub identification, overlap check (A/B only), RC exclusion mask, elimination generation all match Java | ✅ |
| `TablingSolver._checkAllChainsForCells` / `_checkAllChainsForHouses` — intersection verity logic matches Java's `checkEntryList` for cells and `checkAllChainsForHouse(houseSets)` | ✅ |
| `AlsSolver._collectRCs` — forward-only pair iteration (`i < j`) with max 2 RCs per pair matches Java's `rcOnlyForward=true` collection | ✅ |
| `BruteForceSolver.getStep` — picks middle unsolved cell and reads pre-computed solution; matches Java's `getBruteForce()` logic | ✅ |
| `SudokuSolver.solve()` loop — iterates `TECHNIQUE_ORDER` and calls `doStep` on first hit; structurally matches Java's `getHint` loop (H3/H7 are separate documented bugs) | ✅ |
| `TablingSolver.setSudoku` — properly resets `_krakenFilled` and all table state on each new puzzle; matches Java's `AbstractSolver` chain | ✅ |
| `Sudoku2._countSolns` / `getSolution` — MRV+backtracker is functionally equivalent to Java's Dancing Links for uniqueness detection and solution retrieval | ✅ |
| `TablingSolver._checkTwoChains` premise-cell exclusion — Java removes the premise cell from the onSets/offSets intersection to avoid double-reporting what `_checkOneChain` already catches; TS does not remove it. In practice, any such cell would already be caught by `_checkOneChain` before `_checkTwoChains` runs, so this causes no incorrect results — just a possible duplicate report in a degenerate edge case | ✅ (minor; no action needed) |
| `WingSolver._findXYWing` / `_findXYZWing` / `_findWWing` — all three algorithms match Java (`getWing(false)`, `getWing(true)`, `getWWing`). W-Wing bridge-cell exclusion check (`!bSeesI`) equivalent to Java's `else if` idiom | ✅ |
| `UniquenessSolver` UR1–UR6 / Hidden Rectangle / BUG+1 / Avoidable Rectangle — all elimination rules (`_checkUR`, `_findBugPlus1`, `_findAvoidableRectangle`) match Java's equivalent logic in `checkURForStep` / `getBugPlus1` | ✅ |
| `MiscellaneousSolver` — only implements `SUE_DE_COQ`; Java's `MiscellaneousSolver` also only exposes `SUE_DE_COQ` via `getStep` | ✅ |
| `GiveUpSolver` / `IncompleteSolver` — both trivial sentinels matching Java behaviour exactly | ✅ |
| `ChainSolver` remote-pair, X-chain, XY-chain core detection logic — elimination conditions and traversal rules all match Java (see H16 for chain-length and step-selection divergences) | ✅ |
| `SimpleSolver` naked subsets (NAKED_PAIR/TRIPLE/QUAD) — combo union mask + popcount=n check, primary/secondary house deletion, `isLocked` classification all match Java; `SUBSET_HOUSE_ORDER` = blocks first then rows then cols matches Java's block-first search order | ✅ |
| `SimpleSolver` hidden subsets (HIDDEN_PAIR/TRIPLE/QUAD) — eligible-digit filter (1..n occurrences), cellSet size=n check, non-target-digit deletion all match Java | ✅ |
| `SimpleSolver` locked subsets (LOCKED_PAIR/TRIPLE) — uses same `_findNakedSubset(n, locked=true)` path; minor: TS searches all 27 houses, Java only searches blocks (same eliminations found, possible cosmetic ordering difference) | ✅ |
| `FishSolver` Franken/Mutant fish algorithms — base/cover constraints (Franken: base=rows-only or cols-only, cover has ≥1 box; Mutant: any mix with ≥1 box), fin detection, elimination filter all match Java for the sizes handled (see H17 for size cap divergence) | ✅ |
| `TemplateSolver` single-pass AND/OR template logic — template validation (placed cells included, forbidden cells excluded), `svt`/`dct` accumulation, SET/DEL step generation all match Java (cross-digit iterative refinement missing — see H6) | ✅ |
| `ColoringSolver` MULTI_COLORS_1 algorithm — 4-orientation inner loop `(colorA=a0/a1, colorB=b0/b1)` correctly covers all four `checkMultiColor2` calls Java makes per ordered pair (i,j); elimination logic (cells outside both components seeing BOTH `oppA` AND `oppB`) matches Java's `checkCandidateToDelete`; unordered outer loop `j > i` is fine for MC1 due to 4-orientation symmetry | ✅ |
| `TablingSolver._fillTablesForNet` / `_netPropagateOn` / `_netPropagateOff` — propagates naked singles and hidden singles transitively after each placement; correctly simulates Java's `chainsOnly=false` full-propagation branch for FORCING_NET | ✅ |
| `TablingSolver._expandTablesWithGroups` — group-OFF detection (all group cells present in `offSets[d]`) triggers forced singleton search in row/col/block; matches Java's group-node BFS expansion used for GROUPED_NICE_LOOP | ✅ |
| `TablingSolver._checkForcingChains` — five-case contradiction/verity detection (premise↔inverse, same-candidate set+del, two-values-in-one-cell, same-value-twice-in-house, all-positions-of-digit-deleted-in-house) matches Java's `checkOneChain` / `checkTwoChains` / `checkAllChainsFor*` structure (see H12 for missing case 6, H4/H5/H9 for table-fill divergences) | ✅ |
| `TablingSolver._fillTables` (chainsOnly=true) — ON-premise: deletes all other candidates from cell + deletes d from all peer buddies; OFF-premise: naked-single promotion (1 remaining candidate) + hidden-single-in-house (1 remaining position for d); matches Java's `fillTable(chainsOnly=true)` direct-implication logic | ✅ |
| `TablingSolver._expandTablesWithAls` — BFS post-expansion with ALS fire condition (all entry-digit cells in `offSets[e]` → exit digits deleted from `buddiesFor[z]`); ALS-to-ALS chaining handled transitively by continuing BFS; matches Java's elimination propagation logic (buddy-forcing for ≥3-candidate cells missing — see H18) | ✅ |

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

### H4 — TablingSolver: ALS node expansion incorrectly active for GROUPED_NICE_LOOP, FORCING_CHAIN, and FORCING_NET

Java's default `ALLOW_ALS_IN_TABLING_CHAINS = false` means ALS nodes must **not** be added to tabling tables during the standard single-step `getStep()` mode. Java's `getStep()` dispatch:

| Technique | `withAlsNodes` value |
|---|---|
| `NICE_LOOP` | `false` (hard-coded) ✓ TS matches |
| `GROUPED_NICE_LOOP` | `allowAlsInTablingChains` = `false` ✗ TS unconditional |
| `FORCING_CHAIN` | `allowAlsInTablingChains` = `false` ✗ TS unconditional |
| `FORCING_NET` | `allowAlsInTablingChains` = `false` ✗ TS unconditional |

TS `_getGroupedNiceLoop()`, `_getForcingChain()`, and `_getForcingNet()` all call `_expandTablesWithAls(this._onTable, this._offTable, collectAlses(this.sudoku))` unconditionally. This means TS may find ALS-assisted grouped/forcing chains where Java would not.

**Fix:** Guard the `_expandTablesWithAls(...)` call in those three methods behind a `ALLOW_ALS_IN_TABLING_CHAINS` option (default `false`), matching Java's default behavior.

File: `src/solver/TablingSolver.ts`

---

### H5 — TablingSolver: table propagation uses unbounded BFS vs Java's 4-pass limit

Java's `getTableEntry()` propagates forced consequences by running `findAllNakedSingles()` + `findAllHiddenSingles()` exactly `ANZ_TABLE_LOOK_AHEAD = 4` times. TS `_netPropagateOn()` / `_netPropagateOff()` use an unbounded BFS queue that continues until no new singles remain.

**Impact:** TS propagates more consequences per table entry — it discovers more forced implications and potentially finds FORCING_CHAIN / FORCING_NET steps that Java would miss on the same puzzle. TS is a proper superset of Java for this path (more complete, not incorrect).

**Mitigation options:**
1. Accept the divergence (TS is more complete).
2. Add a `MAX_TABLE_LOOK_AHEAD = 4` iteration cap to `_netPropagateOn/Off` to match Java exactly.

---

### H6 — TemplateSolver: missing cross-digit template refinement

Java's template computation in `SudokuStepFinder.initTemplates()` has an iterative refinement step that runs only in normal `getStep()` mode (not findAll):

1. For each valid template of digit `j`, check whether it overlaps with `setValueTemplates[k]` (= the forced-placement AND-mask) for any other digit `k ≠ j`.
2. If so, remove that template from `j`'s pool (a template that places `j` in a cell forced for `k` is contradictory).
3. Repeat until no more templates are removed.

This refines both `setValueTemplates` (AND of remaining valid templates → cells that MUST contain the digit) and `delCandTemplates` (OR → cells that CAN contain the digit; negated to get elimination candidates).

TS `TemplateSolver` does only the basic single-pass filter (reject templates that miss placed cells or touch forbidden cells). It has no cross-digit refinement loop. As a result:

- **TEMPLATE_SET**: TS finds fewer forced placements (more templates survive → tighter AND).
- **TEMPLATE_DEL**: TS finds fewer eliminations (more templates survive → wider OR → narrower `~OR`).

TS is a strict subset of Java for template steps (less complete, not incorrect).

Practical impact: TEMPLATE_SET and TEMPLATE_DEL are disabled in Java by default (H3). The gap only matters on boards where template solving would be needed.

**Fix:** After the initial filter loop, add an iterative removal pass: for template `t` of digit `j`, compute `andMask[k]` for all `k ≠ j` and remove `t` if `t ∩ andMask[k] ≠ ∅`. Recompute AND/OR masks after each round and repeat until stable.

File: `src/solver/TemplateSolver.ts`

---

### H7 — SudokuSolver: difficulty rating uses only score thresholds; Java also uses per-technique level

Java's `getHint()` loop does two things when a step is found:
1. `score += stepConfig.getBaseScore()` — accumulates the step's score.
2. `level = max(level, stepConfig.getDifficultyLevel())` — immediately promotes the puzzle's difficulty to at least the technique's configured level.

After the loop, Java does an additional `while (score > level.maxScore) level = nextLevel` promotion.

TS `solveWithRating()` does **only** the score-threshold promotion (post-loop). It has no per-technique level. This means:

| Scenario | Java difficulty | TS difficulty |
|---|---|---|
| Puzzle needs FORCING_CHAIN, total score = 1200 | **EXTREME** (technique level = EXTREME) | HARD (1200 < 1600) |
| Puzzle needs X_WING, total score = 400 | **HARD** (technique level = HARD) | EASY (400 < 800) |
| Puzzle needs GROUPED_NICE_LOOP, score = 1500 | **UNFAIR** (technique level = UNFAIR) | HARD (1500 < 1600) |

Any puzzle that requires a technique whose configured level is higher than what the cumulative score alone would imply will be rated at a lower difficulty by TS than by Java.

**Most impactful case:** FORCING_CHAIN and FORCING_NET (level = EXTREME) — on puzzles with few steps these can produce EXTREME in Java but HARD in TS.

**Fix:** Add a per-technique `difficultyLevel` to `STEP_BASE_SCORES` entries (or a separate lookup), and track `level = max(level, techniqueDifficultyLevel)` in `solveWithRating()`.

File: `src/solver/SudokuSolver.ts`

**Minor additional difference:** Java's `solve()` bails out early with `return false` if fewer than 10 cells are set (`(81 - unsolvedCellCount) < 10`). TS has no such guard and will attempt to solve any puzzle regardless of how few cells are given.

---

### H8 — TablingSolver `_checkNiceLoops`: missing chain-length filter causes spurious eliminations (critical)

Java's `checkNiceLoop` starts with:
```java
if (entry.getDistance(entryIndex) <= 2) return; // chain too short
```
TS has no equivalent guard. Two direct consequences:

**Sub-case A — 1-hop trivial: direct `offSets[d2]` match.**
`fillTables` for an ON premise at `(ci, d)` immediately adds `offSets[d2].has(ci)` for every other candidate `d2` in `ci` (placing `d` deletes everything else). Because the ON-table check in `_checkNiceLoops` looks for `entry.offSets[d2].has(ci)` (for `d2 ≠ d`), TS immediately finds a match — distance = 1. For every multi-candidate cell and every ON-table entry, TS generates a spurious `DISCONTINUOUS_NICE_LOOP` step "delete `d2` from `ci`". This is a circular argument: *IF* `d` is placed *then* `d2` is deleted, but the table premise is that assumption, not a proof.

**Sub-case B — 2-hop trivial: conjugate-pair loop.**
When `ci` and `c1` are the only two cells for `d` in some house (conjugate pair), `expandTables` propagates: `offTable[c1*10+d].onSets[d].has(ci) = true` → `onSets[d].add(ci)` for the ON table at `(ci*10+d)`. TS then produces a DISC step "delete all other candidates from `ci`" (distance = 2). This is similarly circular (conjugate pair ≠ proof that `d` must go in `ci`).

**Impact:** `_getNiceLoop()` will always find and return a spurious step immediately in any puzzle with multi-candidate cells before any real nice loop is checked. The returned elimination is logically invalid.

**Why tests still pass:** The 8 snapshot test puzzles are solved entirely by simpler techniques before reaching nice loops. The unit tests for nice loops only check "step is not null and has some deletion" — they do not validate correctness.

**Fix:** Add a minimum-distance filter before entering `_checkNiceLoops` logic. Since TS uses reachability sets rather than explicit chain paths, one approach is to filter out self-referential entries: skip if `onSets[d].has(ci)` was set as a DIRECT (1-step) implication, or track only implications reachable through at least `N` intermediate cells. Simpler: add a per-entry "needs at least 2 intermediate nodes" flag (tracking whether the entry was reached via ≥ 2 hops from the premise).

Alternatively, replicate Java's logic more faithfully: store the minimum number of hops for each `(cell, digit)` reached in the BFS and only use those with hop-count ≥ 3.

File: `src/solver/TablingSolver.ts`, `_checkNiceLoops`, `_expandTables`.

---

### H9 — TablingSolver `_checkNiceLoops`: misclassification of ON-table loop patterns

In Java, the first traversal link from any ON-table premise is **always weak** (placing `d` at `ci` only causes deletions — no direct strong "set" implication). Therefore `firstLinkStrong = entry.isStrong(1) = false` for **all** ON-table entries.

TS treats `isOnTables` as a proxy for `firstLinkStrong`, effectively treating all ON-table entries as if `firstLinkStrong = true`. This leads to two wrong classifications:

| TS case found on ON table | TS output | Correct Java classification | Java output |
|---|---|---|---|
| `onSets[d].has(ci)` (same cand, last=strong) | DISCONTINUOUS: delete all others | `!first && last && sameCand` = **CONTINUOUS** | chain-traversal multi-cell eliminations |
| `offSets[d2].has(ci)` d2≠d (diff cand, last=weak) | DISCONTINUOUS: delete d2 | `!first && !last && diffCand` = **CONTINUOUS** if bivalue, **no-match** otherwise | CONTINUOUS or nothing |

Additionally, TS **never checks** `onSets[d2].has(ci)` for `d2 ≠ d` on ON tables. In Java with `!first && last && diffCand`, this case is **DISCONTINUOUS** → delete `d` from `ci`. TS misses this valid elimination.

TS also **never generates** `CONTINUOUS_NICE_LOOP` for any of these cases.

**Impact (assuming H8 is fixed):** After correcting the 2-hop filter, ON-table nice loop steps would be classified as DISCONTINUOUS instead of CONTINUOUS, producing different (and potentially fewer or wrong) eliminations compared to Java.

**Fix:** For ON-table entries, treat `firstLinkStrong = false` (since ON-table first links are always weak deletions). Rewrite the ON-table branch of `_checkNiceLoops` to match Java's four classification cases:
- `!first && !last && sameCand` → DISC, delete d from ci (this is what the OFF-table branch does — the ON-table version needs to be added)
- `!first && last && sameCand` → CONTINUOUS
- `!first && last && diffCand` (i.e., `onSets[d2].has(ci)`) → DISC, delete d from ci
- `!first && !last && diffCand` (i.e., `offSets[d2].has(ci)` d2≠d) → CONTINUOUS if bivalue, else no-match

File: `src/solver/TablingSolver.ts`, `_checkNiceLoops`.

---

### H10 — TablingSolver `_checkAics`: missing AIC Type 2 (different-candidate AICs)

Java `checkAics` handles two chain types:
- **Type 1** (same start/end candidate `d`): find endCell in `onSets[d]`, eliminate `d` from all common buddies
- **Type 2** (different start `d1` / end `d2`): if endCell sees startCell, endCell has `d1`, and startCell has `d2` → delete `d1` from endCell and `d2` from startCell

TS `_checkAics` iterates only over `onSets[startCand]` (same candidate), so **only Type 1** is implemented. Type 2 steps are never generated.

**Impact:** Some advanced AIC eliminations are missed. A Type 2 AIC ends at a cell that sees the start cell with a different candidate — a valid but less common pattern.

**Fix:** Add a second loop after the Type 1 search: for each `(endCell, endCand)` found in `onSets[d2]` for `d2 ≠ startCand`, check if `endCell ∈ BUDDIES[startCell]` and if mutual cross-candidates exist, then produce a Type 2 AIC step.

File: `src/solver/TablingSolver.ts`, `_checkAics`.

---

### H11 — TablingSolver `_checkAics`: AIC Type 1 threshold divergence

Java requires `tmpSet.size() >= 2` (the intersection `buddies(start) ∩ buddies(end) ∩ cands[d]` must contain **at least 2 cells**) before calling `checkAic`. Java's comment: *"everything else is already covered by a Nice Loop."*

TS requires only `dels.length >= 1` (at least 1 common buddy). This means TS produces AIC steps for 1-common-buddy cases that Java intentionally skips (treating them as nice loops instead).

**Impact:** Minor classification difference. TS emits `AIC` for steps Java would classify as `DISCONTINUOUS_NICE_LOOP`. Due to H8 breaking nice loops in TS, this may actually help TS find valid steps that H8 would otherwise corrupt.

**Fix (low priority):** Increase TS threshold to `dels.length >= 2` to match Java. Only relevant once H8/H9 are fixed.

File: `src/solver/TablingSolver.ts`, `_checkAics`.

---

### H12 — TablingSolver `_checkOneChain`: missing "cell-without-candidates" contradiction case

Java `checkOneChain` has a 6th contradiction check not present in TS:

```java
// cell without candidates -> assumption false
tmpSet.setAll();
for (int i = 1; i < entry.offSets.length; i++) {
    tmpSet1.set(entry.offSets[i]);
    tmpSet1.orNot(finder.getCandidates()[i]);
    tmpSet.and(tmpSet1);
}
// remove cells where a value is already set, then:
// if tmpSet is non-empty → some cell has ALL its candidates eliminated → contradiction
```

Logic: for every candidate `d`, compute the set `offSets[d] ∪ ~candidates[d]` (cells where `d` is either already eliminated by the chain, or was never a candidate). AND all of these together. Any cell in the result has **all** its candidates eliminated by the chain → the cell becomes empty → the premise is contradictory.

TS `_checkOneChain` has 5 cases (premise-inverse, set+deleted, two-values-in-cell, value-twice-in-house, all-positions-in-house-deleted) but no case covering "the chain leaves a cell with zero remaining candidates."

**Impact:** TS misses some forcing-chain contradiction deductions — specifically, contradictions that arise when a chain collectively wipes out all candidates in some cell but no single digit is both set and deleted there.

**Fix:** Add a sixth case to `_checkOneChain`:
```typescript
// Case 6: some cell has all its candidates eliminated
for (let cell = 0; cell < 81; cell++) {
  if (s.values[cell] !== 0) continue;
  const cands = s.getCandidates(cell);
  if (cands.length === 0) continue;  // already solved
  if (cands.every(d2 => entry.offSets[d2].has(cell))) return conclude();
}
```

File: `src/solver/TablingSolver.ts`, `_checkOneChain`.

---

### H13 — AlsSolver: ALS-XY-Chain depth capped at 5 RCs; Java allows 50 (unlimited) in getStep mode

Java's `AlsSolver.getStep(ALS_XY_CHAIN)` explicitly resets the chain array:
```java
if (chain.length != MAX_RC) chain = new RestrictedCommon[MAX_RC];  // MAX_RC = 50
```
So Java can follow up to **50 RC links** in a single ALS chain during `getStep` mode (effectively unlimited).

TS `_alsChainDFS` returns null when `chain.length > 6`, limiting chains to **5 RCs / 6 ALS nodes**.

Category F previously marked this as "ALS-XY-Chain depth = 6 ✓" — that was incorrect; the `6` default from `ALL_STEPS_ALS_CHAIN_LENGTH` applies only to the `getAllAlses` (find-all) mode, not to `getStep`.

**Additional direction difference:** Java's `getStep` mode calls `finder.setRcOnlyForward(true)`, which means RCs are stored only for pairs where `als1.index < als2.index`. The chain search from any starting ALS can only reach higher-indexed ALS (monotonically increasing). TS adds both `(i→j)` and `(j→i)` directions to the adjacency map, so TS can traverse chains in any order. TS finds a strict superset of Java's ALS-XY-Chain steps (more complete).

**Impact:** Practical impact low — very long ALS chains are rare. Both divergences make TS simultaneously more restricted (max 5 RCs) and more permissive (bidirectional search) than Java. ALS_XY_CHAIN is disabled in Java's default mode anyway (H3).

**Fix:** Change `if (chain.length > 6) return null` to a configurable limit (default 50), and consider making RC direction configurable (default forward-only).

File: `src/solver/AlsSolver.ts`, `_findAlsChain`, `_alsChainDFS`.

---

### H14 — FishSolver: Kraken fish limited to basic fish; Java default includes Franken Kraken

Java's `KRAKEN_MAX_FISH_TYPE = 1` means the Kraken fish search includes:
- BASIC fish (rows/cols only)
- FRANKEN fish (rows, cols, and one box cover or base)

TS `_findKrakenFish` iterates only `for (const rowBase of [true, false])` with lines 0–8 (rows) and 9–17 (cols). No box-based cover or base candidates are included — TS searches **BASIC Kraken fish only**.

**Impact:** TS misses Kraken Franken fish. Kraken fish is disabled in Java's default solve mode (H3), so this only matters for users who explicitly enable KRAKEN_FISH.

**Fix:** Add a Franken Kraken search path that uses boxes as base or cover units, mirroring `_findFrankenFish` but with Kraken forcing-chain analysis.

File: `src/solver/FishSolver.ts`, `_findKrakenFish`.

---

### H16 — ChainSolver: X-Chain / XY-Chain capped at 20 nodes; Java allows 162. First-found vs best-sorted.

Java `ChainSolver` defines `MAX_CHAIN_LENGTH = 2 * Sudoku2.LENGTH = 162`. TS `_xChainDFS` and `_xyChainDFS` both return null when `chain.length >= 20` (19 nodes maximum).

**Length difference:** TS may miss X-Chains and XY-Chains that require more than 19 nodes (very uncommon in practice, but theoretically possible).

**Step-selection difference:** Java collects *all* valid chains for a technique, sorts them by a custom comparator (shortest first), and returns the best. TS uses DFS and returns the *first* found chain (arbitrary DFS order). TS will return a valid chain, but it may not be the shortest or most "natural" one. This affects:
- Which specific pattern is shown in results (cosmetic)
- Difficulty score consistency: same technique always scores the same, but if TS and Java choose different chains, later techniques may differ (very minor)

**Remote Pair is unaffected:** TS `_remotePairDFS` has no explicit cap (the natural constraint is the number of cells sharing the same bivalue pair), matching Java's `stackLevel >= 7` threshold correctly.

**Impact:** Cosmetic/edge-case. Both differences produce valid (correct) eliminations when they do find a chain.

**Fix:** Change `if (chain.length >= 20) return null` to use a configurable cap (default 162), and optionally collect all chains and return the shortest to match Java's step-selection.

File: `src/solver/ChainSolver.ts`, `_xChainDFS`, `_xyChainDFS`.

---

### H15 — ColoringSolver: MULTI_COLORS_2 detection is too restrictive (two interacting bugs)

Java's `findMultiColorStepsForCandidate` uses ordered pairs `(i, j)` AND `(j, i)` in its outer loop and relies on `checkMultiColor1(set, s21, s22)` which requires "any cell in set sees s21" AND "any cell (possibly different) in set sees s22."

TS `_findMultiColors` has two independent bugs for MULTI_COLORS_2:

**Bug A — single-cell constraint too strict:**
```ts
// TS (too strict):
const typeTwo = colorA.some(cA =>
  colorB.some(cB => BUDDIES[cA].includes(cB)) &&
  oppB.some(cOpp => BUDDIES[cA].includes(cOpp))
);
```
TS requires one **single cell** of `colorA` to see BOTH `colorB` AND `oppB`. Java's `checkMultiColor1` only accumulates `seeS21` and `seeS22` across all cells in the set — the two halves can be seen by **different** cells. TS will miss any Type 2 case where no single cell of colorA sees both halves of the other pair, even though the combined set does.

**Bug B — component j half never eliminated:**
TS outer loop is `j > i` (unordered pairs), with `colorA` cycling only over `{a0, a1}` (halves of component[i]). The elimination target is always `colorA`, so only halves of component[i] can be eliminated. Java processes both ordered pairs `(i,j)` and `(j,i)`, so when processing `(j, i)` it also checks whether halves of component[j] see both halves of component[i] — and eliminates from component[j]. TS never puts component[j]'s halves in the `colorA` role, so it misses these eliminations entirely.

**Impact:** TS may fail to find valid MULTI_COLORS_2 eliminations, leading to weaker solving in multi-colors-heavy puzzles. MULTI_COLORS is disabled in Java's default solve mode (H3), so this only affects users who explicitly enable it.

**Fix:** Change Type 2 check to accumulate `seeHalf1` and `seeHalf2` across all cells (like Java's `checkMultiColor1`), and change the outer loop to iterate all ordered pairs `(i, j)` with `i ≠ j` (or equivalently, after `j > i` loop also check component[j]→component[i]).

File: `src/solver/ColoringSolver.ts`, `_findMultiColors`.

---

### H17 — FishSolver: Franken fish capped at size 4; Mutant fish capped at size 3 (Java allows up to size 6)

`_findFrankenFish` contains an early-return guard:
```ts
if (size > 4) return null;
```
`_findMutantFish` contains a similar guard:
```ts
if (size > 3) return null;
```

Java's `FishSolver` uses `FRANKEN_TYPES` and `MUTANT_TYPES` arrays that include sizes 2–6 (`FRANKEN_LEVIATHAN` / `MUTANT_LEVIATHAN`):
```java
private static final SolutionType[] FRANKEN_TYPES = {
    FRANKEN_X_WING, FRANKEN_SWORDFISH, FRANKEN_JELLYFISH,
    FRANKEN_SQUIRMBAG, FRANKEN_WHALE, FRANKEN_LEVIATHAN  // sizes 2–7
};
```
No size cap guard exists in Java — all sizes are delegated to `getFishes`.

**Impact:** The following techniques are in `TECHNIQUE_ORDER` with dispatched calls but always silently return null:
- Franken size 5: `FRANKEN_SQUIRMBAG`, `FINNED_FRANKEN_SQUIRMBAG`, `SASHIMI_FRANKEN_SQUIRMBAG`
- Franken size 6: `FRANKEN_WHALE`, `FINNED_FRANKEN_WHALE`, `SASHIMI_FRANKEN_WHALE`
- Franken size 7: `FRANKEN_LEVIATHAN`, `FINNED_FRANKEN_LEVIATHAN`, `SASHIMI_FRANKEN_LEVIATHAN`
- Mutant size 4: `MUTANT_JELLYFISH`, `FINNED_MUTANT_JELLYFISH`, `SASHIMI_MUTANT_JELLYFISH`
- Mutant size 5–7: Squirmbag, Whale, Leviathan variants

All of these are disabled in Java's default solve mode (H3), so this only matters when those techniques are explicitly enabled. These are also extremely rare in practice, but the systematic null return is an avoidable divergence.

**Fix:** Remove the `size > 4` guard in `_findFrankenFish` and the `size > 3` guard in `_findMutantFish`, and ensure `_searchGeneralFish` is robust for sizes 5–6.

File: `src/solver/FishSolver.ts`, `_findFrankenFish` (line ~283), `_findMutantFish` (line ~305).

---

### H18 — TablingSolver `_expandTablesWithAls`: missing "buddy forcing" when ALS eliminates all-but-one candidate from a multi-candidate cell

Java's `fillTablesWithAls` includes a final pass over every ALS buddy cell after computing the ALS eliminations:
```java
// if buddy cell has ≥3 candidates and ALS removes all-but-one → force it ON
for (int k = 0; k < als.buddies.size(); k++) {
    ...getCandidateSet(cellIndex, tmpSet1);
    for l in 1..9: if alsEliminations[l].contains(cellIndex): tmpSet1.remove(l);
    if (tmpSet1.size() == 1) offEntry.addEntry(cellIndex, tmpSet1.get(0), ..., true); // forced ON
}
```
(Skips cells with exactly 2 candidates since those are already handled by normal table entries.)

TS `_expandTablesWithAls` only fires ALS exit-digit deletions (`buddiesFor[z]`); it never checks whether those deletions together reduce a buddy cell to a single remaining candidate, so it never generates the corresponding forced-ON implication.

**Impact:** Chains of the form: *[ALS fires → eliminates two candidates from cell X → X is a naked single → X forces further deletions]* are missed in TS. This is an extremely rare scenario (cell must have ≥3 candidates, ALS must eliminate ≥2 of them, and the remaining single candidate must close a pattern). Only relevant for GROUPED_NICE_LOOP and (for TS, unconditionally) GROUPED_DISCONTINUOUS_NICE_LOOP / FORCING_CHAIN / FORCING_NET. All of these are disabled in Java's default mode (H3).

**Fix:** After `checkAlsOff` fires in the BFS, scan the ALS's buddy cells (union of `buddiesFor[z]` for all exit z) and check if total currently-deleted candidates leave exactly 1 remaining candidate in any of them; if so, add a forced-ON (`dest.addSet`) entry.

File: `src/solver/TablingSolver.ts`, `_expandTablesWithAls`.

---

## Notes on Helper Classes
