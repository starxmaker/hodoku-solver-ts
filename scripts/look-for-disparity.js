import { generate } from './util/generate-puzzle.js'
import { runHodoku } from './util/original-evaluate-puzzle.js'
import { SudokuSolver } from "../dist/index.js";

console.log("Starting at " + new Date().toISOString())

let difficultyMatch = true
let scoreMatch = true
let iteration = 0

while (difficultyMatch && scoreMatch) {
    console.log("\nIteration: " + (++iteration))
    const puzzle = generate()
    console.log("Puzzle:", puzzle)
    const originalResult = await runHodoku(puzzle)
    console.log("Original Estimation: " + originalResult.difficulty + " (" + originalResult.score + ")")
    const newResult = SudokuSolver.rate(puzzle)
    console.log("New Estimation: " + newResult.difficulty + " (" + newResult.score + ")")
    difficultyMatch = originalResult.difficulty.toUpperCase() === newResult.difficulty.toUpperCase()
    scoreMatch = originalResult.score === newResult.score
    console.log("Match:")
    console.log("  Difficulty: " + (difficultyMatch ? "Yes" : "No"))
    console.log("  Score: " + (scoreMatch ? "Yes" : "No"))
    if (!difficultyMatch || !scoreMatch) {
        const fs = await import('fs/promises')
        const line = `\"${puzzle}\",\"${originalResult.difficulty}\",\"${originalResult.score}\"\n`
        await fs.appendFile('./test/test_data.csv', line)
        console.log("Disparity found! Example added to test_data.csv")
    }
}