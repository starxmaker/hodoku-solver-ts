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
| `ALL_STEPS_ALS_CHAIN_LENGTH` | `6` | **getStep mode only**: `getStep(ALS_XY_CHAIN)` resets chain to `MAX_RC = 50` (unlimited depth). The `6` limit applies only to `getAllAlses` (find-all) mode. TS caps at 50 RCs (fixed). |
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
| `TECHNIQUE_ORDER` — matches Java `Options.DEFAULT_SOLVER_STEPS`; DUAL types removed; disabled-by-default techniques removed | ✅ |
| `SimpleSolver` dispatch (FULL_HOUSE through HIDDEN_QUAD) | ✅ |
| `ColoringSolver` dispatch (SIMPLE_COLORS _TRAP/_WRAP, MULTI_COLORS _1/_2) | ✅ |
| `WingSolver` dispatch (XY_WING, XYZ_WING, W_WING) | ✅ |
| `SingleDigitPatternSolver` dispatch (SKYSCRAPER, TWO_STRING_KITE, DUAL_…, TURBOT_FISH, EMPTY_RECTANGLE, DUAL_…) | ✅ |
| Turbot Fish chain length = 3 links (matches Java hardcoded `chainMaxLength = 3`) | ✅ |
| `MiscellaneousSolver` dispatch (SUE_DE_COQ) | ✅ |
| `TemplateSolver` dispatch (TEMPLATE_SET, TEMPLATE_DEL) | ✅ dispatch only — algorithm is incomplete, see **H6** |
| `AlsSolver` dispatch (ALS_XZ, ALS_XY_WING, ALS_XY_CHAIN depth 6, DEATH_BLOSSOM) | ✅ |
| `UniquenessSolver` dispatch (UNIQUENESS_1–6, HIDDEN_RECTANGLE, AVOIDABLE_RECTANGLE_1/2, BUG_PLUS_1) | ✅ |
| `FishSolver` dispatch — basic/finned/sashimi/franken/mutant sizes 2–7 + KRAKEN_FISH_TYPE_1/2; H14: Kraken Franken added via `_findKrakenFrankenFish` (base=rows/cols, cover includes ≥1 box, same fin+forcing-chain logic) | ✅ |
| `TablingSolver` dispatch — NICE_LOOP, CONTINUOUS/DISCONTINUOUS_NICE_LOOP, AIC, GROUPED_* variants, FORCING_CHAIN/NET | ✅ |
| `ALLOW_DUALS_AND_SIAMESE = false` — dual patterns never generated | ✅ |
| ALS pair scanning direction — TS `ai < aj` + both-direction adj entries matches Java default | ✅ |
| `Sudoku2._placeDigit` — removes placed digit from all buddy candidates | ✅ |
| `AbstractSolver.doStep` — applies `setValue` for placements, `removeCandidate` for eliminations | ✅ |
| `ColoringSolver` algorithm — WRAP/TRAP dispatch correct; SIMPLE_COLORS_TRAP collects all matching cells (fixed) | ✅ |
| `WingSolver` algorithms — XY-Wing, XYZ-Wing, and W-Wing (bridge-cell exclusion fixed) all match Java | ✅ |
| `MiscellaneousSolver` SUE_DE_COQ algorithm — intersection subsets, line/block enumeration, allowed-cand mask, elimination formulas all match Java | ✅ |
| `UniquenessSolver` UR1–UR6, Hidden Rectangle, Avoidable Rectangle 1/2, BUG+1 — all algorithms verified correct | ✅ |
| `ChainSolver` X-Chain, XY-Chain, Remote Pair — chain length cap (20), DFS structure, elimination rules all match Java | ✅ |
| `AlsSolver` DEATH_BLOSSOM — stem loop, per-candidate ALS assignment, overlap guard, commonMask, elimination formula all match Java | ✅ |
| `FishSolver` basic/finned fish — fin detection, sashimi check (≤1 covered candidate in a base line), elimination filter all match Java | ✅ |
| `SingleDigitPatternSolver` algorithms — Skyscraper, Two-String Kite, Turbot Fish, Empty Rectangle (arm filter fixed) all match Java | ✅ |
| `AlsSolver` ALS-XZ doubly-linked (`_doublyLinkedElims`) — leftover-digit ALS lock propagation matches Java | ✅ |
| `SimpleSolver` locked candidates (LC1/LC2) — exactly-2-or-3 filter, row/col/box alignment checks, elimination generation all match Java | ✅ |
| `TablingSolver` `_checkTwoChains` — both-premise verity detection correct (minor: Java removes premise cell from results; TS omits this but checkOneChain runs first and handles the degenerate case) | ✅ (minor divergence documented in H notes) |
| `Sudoku2.setSudoku` — candidate initialisation (fill all candidates, then `_placeDigit` for each given) matches Java's 81-char parse path | ✅ (TS only implements the 81-char format; Java also supports PM grid formats — see Category D) |
| `AlsSolver._collectAlses` — includes 1-cell ALS (k=1), matching Java's default `getAlses(false)` which includes bi-value cells | ✅ |
| `AlsSolver._findAlsXYWing` — hub identification, overlap check (A/B only), RC exclusion mask, elimination generation all match Java | ✅ |
| `AlsSolver._findAlsChain` — adjacency rule, doubly-linked RC both-direction expansion, depth cap fixed (50), active-RC-only Z-mask exclusion fixed; TS traverses both directions (superset of Java) | ✅ |
| `TablingSolver._checkAllChainsForCells` / `_checkAllChainsForHouses` — intersection verity logic matches Java's `checkEntryList` for cells and `checkAllChainsForHouse(houseSets)` | ✅ |
| `AlsSolver._collectRCs` — forward-only pair iteration (`i < j`) with max 2 RCs per pair matches Java's `rcOnlyForward=true` collection | ✅ |
| `BruteForceSolver.getStep` — picks middle unsolved cell and reads pre-computed solution; matches Java's `getBruteForce()` logic | ✅ |
| `SudokuSolver.solve()` loop — iterates `TECHNIQUE_ORDER` and calls `doStep` on first hit; per-technique difficulty level applied; structurally matches Java's `getHint` loop | ✅ |
| `TablingSolver.setSudoku` — properly resets `_krakenFilled` and all table state on each new puzzle; matches Java's `AbstractSolver` chain | ✅ |
| `Sudoku2._countSolns` / `getSolution` — MRV+backtracker is functionally equivalent to Java's Dancing Links for uniqueness detection and solution retrieval | ✅ |
| `TablingSolver._checkTwoChains` premise-cell exclusion — Java removes the premise cell from the onSets/offSets intersection to avoid double-reporting what `_checkOneChain` already catches; TS does not remove it. In practice, any such cell would already be caught by `_checkOneChain` before `_checkTwoChains` runs, so this causes no incorrect results — just a possible duplicate report in a degenerate edge case | ✅ (minor; no action needed) |
| `WingSolver._findXYWing` / `_findXYZWing` / `_findWWing` — all three algorithms match Java (`getWing(false)`, `getWing(true)`, `getWWing`). W-Wing bridge-cell exclusion check (`!bSeesI`) equivalent to Java's `else if` idiom | ✅ |
| `UniquenessSolver` UR1–UR6 / Hidden Rectangle / BUG+1 / Avoidable Rectangle — all elimination rules (`_checkUR`, `_findBugPlus1`, `_findAvoidableRectangle`) match Java's equivalent logic in `checkURForStep` / `getBugPlus1` | ✅ |
| `MiscellaneousSolver` — only implements `SUE_DE_COQ`; Java's `MiscellaneousSolver` also only exposes `SUE_DE_COQ` via `getStep` | ✅ |
| `GiveUpSolver` / `IncompleteSolver` — both trivial sentinels matching Java behaviour exactly | ✅ |
| `ChainSolver` remote-pair, X-chain, XY-chain core detection logic — returns shortest chain; 20-node cap matches Java default | ✅ |
| `SimpleSolver` naked subsets (NAKED_PAIR/TRIPLE/QUAD) — combo union mask + popcount=n check, primary/secondary house deletion, `isLocked` classification all match Java; `SUBSET_HOUSE_ORDER` = blocks first then rows then cols matches Java's block-first search order | ✅ |
| `SimpleSolver` hidden subsets (HIDDEN_PAIR/TRIPLE/QUAD) — eligible-digit filter (1..n occurrences), cellSet size=n check, non-target-digit deletion all match Java | ✅ |
| `SimpleSolver` locked subsets (LOCKED_PAIR/TRIPLE) — uses same `_findNakedSubset(n, locked=true)` path; minor: TS searches all 27 houses, Java only searches blocks (same eliminations found, possible cosmetic ordering difference) | ✅ |
| `FishSolver` Franken/Mutant fish algorithms — base/cover constraints, fin detection, elimination filter all match Java; size caps removed (sizes 2–7) | ✅ |
| `TemplateSolver` single-pass AND/OR template logic — template validation (placed cells included, forbidden cells excluded), `svt`/`dct` accumulation, SET/DEL step generation all match Java; H6: cross-digit iterative refinement loop added (removes templates conflicting with other digits' forced-cell masks, repeats until stable) | ✅ |
| `ColoringSolver` MULTI_COLORS_1 algorithm — 4-orientation inner loop `(colorA=a0/a1, colorB=b0/b1)` correctly covers all four `checkMultiColor2` calls Java makes per ordered pair (i,j); elimination logic (cells outside both components seeing BOTH `oppA` AND `oppB`) matches Java's `checkCandidateToDelete`; unordered outer loop `j > i` is fine for MC1 due to 4-orientation symmetry | ✅ |
| `TablingSolver._fillTablesForNet` / `_netPropagateOn` / `_netPropagateOff` — propagates naked singles and hidden singles transitively after each placement; correctly simulates Java's `chainsOnly=false` full-propagation branch for FORCING_NET | ✅ |
| `TablingSolver._expandTablesWithGroups` — group-OFF detection: (1) forces singleton ON when remaining.length===1; (2) H21: G1-OFF → G2-ON via chain-state-aware filter when remaining cells form a second group (fires G2-buddy deletions); (3) H22: singleton-OFF → G-ON when singleton + group exhaust house d-candidates (fires G-buddy deletions) | ✅ |
| `TablingSolver._checkForcingChains` — six-case contradiction/verity detection (case 6 added: cell-without-candidates) matches Java's `checkOneChain` / `checkTwoChains` / `checkAllChainsFor*` structure; H5/H9 pending | ✅ |
| `TablingSolver._fillTables` (chainsOnly=true) — ON-premise: deletes all other candidates from cell + deletes d from all peer buddies; OFF-premise: naked-single promotion (1 remaining candidate) + hidden-single-in-house (1 remaining position for d); matches Java's `fillTable(chainsOnly=true)` direct-implication logic | ✅ |
| `TablingSolver._expandTablesWithAls` — BFS post-expansion with ALS fire condition (all entry-digit cells in `offSets[e]` → exit digits deleted from `buddiesFor[z]`); ALS-to-ALS chaining handled transitively by continuing BFS; H18: buddy-forcing for ≥3-candidate cells (if ALS exit-digit deletions reduce a buddy to 1 remaining cand → forced ON) | ✅ |

---

## Category H — Known Bugs / Divergences (actionable fixes)

These are genuine differences in the *implemented* code that produce incorrect or non-Java-equivalent behaviour.





### H5 — TablingSolver: table propagation uses unbounded BFS vs Java's 4-pass limit

Java's `getTableEntry()` propagates forced consequences by running `findAllNakedSingles()` + `findAllHiddenSingles()` exactly `ANZ_TABLE_LOOK_AHEAD = 4` times. TS `_netPropagateOn()` / `_netPropagateOff()` use an unbounded BFS queue that continues until no new singles remain.

**Impact:** TS propagates more consequences per table entry — it discovers more forced implications and potentially finds FORCING_CHAIN / FORCING_NET steps that Java would miss on the same puzzle. TS is a proper superset of Java for this path (more complete, not incorrect).

**Mitigation options:**
1. Accept the divergence (TS is more complete).
2. Add a `MAX_TABLE_LOOK_AHEAD = 4` iteration cap to `_netPropagateOn/Off` to match Java exactly.

---

### H8 — TablingSolver `_checkNiceLoops`: missing chain-length filter causes spurious eliminations (critical)

> ⚠️ **Performance warning:** Fixing H8 and H9 together causes a 10–50× test-suite slowdown.
> Currently, the spurious 1-hop NICE_LOOP "shortcut" accidentally solves puzzles like XY-Wing,
> Remote Pair, and W-Wing in a single step by incorrectly eliminating candidates.
> When H8/H9 are fixed those shortcuts disappear, and those puzzles fall through to
> FORCING_CHAIN / BRUTE_FORCE — which is hundreds of times slower per iteration.
> The fix IS correct behaviour; it just exposes missing performance optimisations
> (table caching, BFS integer encoding, GROUPED pre-check).  Do NOT fix H8/H9
> without also implementing these performance mitigations, or test time jumps
> from ~30 s to ~10 min.  See previous implementation attempt in git history.

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


## Notes on Helper Classes
