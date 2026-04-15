import { generate, difficultyOptions } from './util/generate-puzzle.js'
import { runHodoku } from './util/original-evaluate-puzzle.js'
import { SudokuSolver } from "../dist/index.js";


const parseFlag = (flag, defaultValue = null) => {
    const arg = process.argv.find(arg => arg.startsWith(`--${flag}=`));
    return arg ? arg.split('=')[1] : defaultValue;
}

const parseBooleanFlag = (flag, defaultValue = false) => {
    const arg = parseFlag(flag);
    return arg ? arg.toLowerCase() === 'true' : defaultValue;
}

const parseNumericFlag = (flag, defaultValue = null) => {
    const value = parseFlag(flag);
    if (value !== null) {
        const num = Number(value);
        if (!isNaN(num)) {
            return num;
        } else {
            console.error(`Invalid value for --${flag}: ${value} is not a number.`);
            process.exit(1);
        }
    }
    return defaultValue;
}

const parsePositional = (index, defaultValue = null) => {
    const positionalArgs = process.argv.filter(arg => !arg.startsWith('--'));
    return positionalArgs[2 + index] || defaultValue;
}


// positional arguments
const given = parsePositional(0, null);

// flags
const difficulty = parseFlag('difficulty') ? parseFlag('difficulty').toUpperCase() : "EXTREME";
if (!given && !difficultyOptions.includes(difficulty)) {
    console.error("Invalid difficulty level. Valid options are: " + difficultyOptions.join(", "))
    process.exit(1)
}

const saveDisparity = parseBooleanFlag('saveDisparity', !given) ;

const limit = parseNumericFlag('limit', 1000)

const breakOnDisparity = parseBooleanFlag('breakOnDisparity')

if (!limit && !breakOnDisparity) {
    console.error("You must specify either a limit or enable breakOnDisparity.");
    process.exit(1);
}

console.log("Configuration:")
console.log("  Input Puzzle:", given ? "Given" : "Generated")
console.log("  Difficulty Filter:", difficulty || "None")
console.log("  Save Disparity:", saveDisparity)
console.log("  Limit:", limit || "None")
console.log("  Break on Disparity:", breakOnDisparity)


console.log("Starting at " + new Date().toISOString())

let puzzles = []
if (given) {
    puzzles.push(given.trim())
} else {
    const quantity = limit || 1000
    console.log(`Generating ${quantity} puzzles with difficulty ${difficulty}...`)
    puzzles = await generate(quantity, difficulty)
}
const originalSolvedPuzzles = await runHodoku(puzzles)

const disparities = []

for (let i = 0; i < puzzles.length; i++) {
    let puzzle = puzzles[i]
    const originalResult = originalSolvedPuzzles.find(result => result.puzzle === puzzle)
    const newResult = SudokuSolver.rate(puzzle)
    let difficultyMatch = originalResult.difficulty.toUpperCase() === newResult.difficulty.toUpperCase()
    let scoreMatch = originalResult.score === newResult.score
    if (!difficultyMatch || !scoreMatch) {
        disparities.push({
            puzzle,
            original: {
                difficulty: originalResult.difficulty,
                score: originalResult.score
            },
            new: {
                difficulty: newResult.difficulty,
                score: newResult.score
            }
        })
        if (saveDisparity) {
            const fs = await import('fs/promises')
            const line = `\"${puzzle}\",\"${originalResult.difficulty}\",\"${originalResult.score}\"\n`
            await fs.appendFile('./test/test_data.csv', line)
            console.log("Disparity found! Example added to test_data.csv")
        }
        if (breakOnDisparity) {
            console.log("Disparity found! Stopping execution.")
            break;
        }
    }
    process.stdout.write(`Solved ${i + 1}/${puzzles.length} puzzles with new library...\r`);
}

let scoreDisparities = 0;
let difficultyDisparities = 0;

for (const disparity of disparities) {
    console.log("\nDisparity Found:")
    console.log("Puzzle:", disparity.puzzle)
    console.log("Original Estimation: " + disparity.original.difficulty.toUpperCase() + " (" + disparity.original.score + ")")
    console.log("New Estimation: " + disparity.new.difficulty.toUpperCase() + " (" + disparity.new.score + ")")
    if (disparity.original.difficulty.toUpperCase() !== disparity.new.difficulty.toUpperCase()) {
        difficultyDisparities++;
    }
    if (disparity.original.score !== disparity.new.score) {
        scoreDisparities++;
    }
}

console.log("\nNumber of sudokus analyzed: " + puzzles.length)
console.log("Total Disparities Found: " + disparities.length);
console.log("Difficulty Disparities: " + difficultyDisparities);
console.log("Score Disparities: " + scoreDisparities);
console.log("Global percentage parity: " + (((puzzles.length - disparities.length) / puzzles.length) * 100).toFixed(2) + "%")
console.log("Difficulty parity: " + (((puzzles.length - difficultyDisparities) / puzzles.length) * 100).toFixed(2) + "%")
console.log("Score parity: " + (((puzzles.length - scoreDisparities) / puzzles.length) * 100).toFixed(2) + "%")