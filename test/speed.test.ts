import { SudokuSolver } from "../src/index";

describe("SudokuSolver.rate() -- speed tests", () => {
    test.each([
        ["very easy", 200, "...253..87..1.......1....4...8.94...5.......71.95.8....1......2...785...3.4.2...."],
        ["easy", 200, "....3...9.6.75.........9.8...24.6...4...9..3....5..6.4.2..7.5..8........3..28...."],
        ["medium", 200, ".5.3..2...97...6..1....25...3.2.6..5..59.3...6...1.37......5..2....9......8...7.."],
        ["hard", 200, ".43......5..8...2.1....3.5.....475...2.6......653..7.8......63.28.........7.5...."],
        ["unfair", 600, ".85..6...7..4.1....2..7........2...5.6...7...1..3...7.....34...3..7..8.....8..65."],
        ["extreme", 5000, ".3...6..49....1..2.7.29.6...5...74...1.6...37...9.....6.3.....114.....2...7.2...."]
    ])("should rate a %s puzzle in under %ims", (_, maxTime, puzzle) => {
        const start = performance.now();
        const r = SudokuSolver.rate(puzzle);
        const end = performance.now();expect(r.solved).toBe(true);
        expect(end - start).toBeLessThan(maxTime);
    })
})