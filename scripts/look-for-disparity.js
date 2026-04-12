import { generate, difficultyOptions } from './util/generate-puzzle.js'
import { runHodoku } from './util/original-evaluate-puzzle.js'
import { SudokuSolver } from "../dist/index.js";

// arg parsing
const args = process.argv.slice(2);

const positional = [];
const flags = {};

for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    flags[key] = value ?? true;
  } else {
    positional.push(arg);
  }
}

// positional arguments
const input = positional[0] ?? null;
// continuous mode will keep generating puzzles until a disparity is found
// false if an input is provided
const continuous = !input

// flags
const difficulty = flags.difficulty ? flags.difficulty.toUpperCase() : null;
if (difficulty && !difficultyOptions.includes(difficulty)) {
    console.error("Invalid difficulty level. Valid options are: " + difficultyOptions.join(", "))
    process.exit(1)
}
const difficultyValue = difficulty ? difficultyOptions.indexOf(difficulty) : null

// disparity will be stored in test_data for continuous or if the flag is set
const saveDisparity = flags.saveDisparity ?? continuous;

console.log("Starting at " + new Date().toISOString())

let difficultyMatch = true
let scoreMatch = true
let iteration = 0

while (difficultyMatch && scoreMatch) {
    let puzzle
    if (input) {
        puzzle = input.trim()
    } else {
        const generated = generate()
        if (difficultyValue && generated.difficulty !== difficultyValue) {
            continue
        }
        puzzle = generated.sudoku
    }
    console.log("\nIteration: " + (++iteration))
    console.log("Puzzle:", puzzle)
    const originalResult = await runHodoku(puzzle)
    console.log("Original Estimation: " + originalResult.difficulty.toUpperCase() + " (" + originalResult.score + ")")
    const newResult = SudokuSolver.rate(puzzle)
    console.log("New Estimation: " + newResult.difficulty.toUpperCase() + " (" + newResult.score + ")")
    difficultyMatch = originalResult.difficulty.toUpperCase() === newResult.difficulty.toUpperCase()
    scoreMatch = originalResult.score === newResult.score
    console.log("Match:")
    console.log("  Difficulty: " + (difficultyMatch ? "Yes" : "No"))
    console.log("  Score: " + (scoreMatch ? "Yes" : "No"))
    if (saveDisparity && (!difficultyMatch || !scoreMatch)) {
        const fs = await import('fs/promises')
        const line = `\"${puzzle}\",\"${originalResult.difficulty}\",\"${originalResult.score}\"\n`
        await fs.appendFile('./test/test_data.csv', line)
        console.log("Disparity found! Example added to test_data.csv")
    }
    if (!continuous) {
        break
    }
}