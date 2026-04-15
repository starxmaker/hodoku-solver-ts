import { generate, difficultyOptions } from './util/generate-puzzle.js'
import { runHodoku } from './util/original-evaluate-puzzle.js'
import { SudokuSolver } from "../dist/index.js";
import { parseCSV, appendLineToCSV, removeLineFromCSV } from './util/csv-utils.js'

const difficultyLevels = ["EASY", "MEDIUM", "HARD", "UNFAIR", "EXTREME"]

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
let given = parsePositional(0, null);

// flags
const difficulty = parseFlag('difficulty') ? parseFlag('difficulty').toUpperCase() : null;
if (difficulty && !difficultyOptions.includes(difficulty)) {
    console.error("Invalid difficulty level. Valid options are: " + difficultyOptions.join(", "))
    process.exit(1)
}

const saveDisparity = parseBooleanFlag('saveDisparity', !given) ;

let generateValue = parseNumericFlag('generate', given ? 0 : 5000)

let breakOnDisparity = parseBooleanFlag('breakOnDisparity')

let includeKnownCases = parseBooleanFlag('includeKnownCases', !given)

let hideReport = parseBooleanFlag('hideReport', !!given)

// profiles
let profile = parseFlag('profile', 'default')
let knownCasesOnly = profile === 'knownCasesOnly'

if (knownCasesOnly) {
    console.log("Running in known cases only mode. Only puzzles from known_disparities.csv will be tested.")
    generateValue = 0
    hideReport = true
    breakOnDisparity = false
    includeKnownCases = true
    given = null
}

console.log("Configuration:")
console.log("  Profile:", profile)
console.log("  Given puzzle:", given ? "Yes" : "No")
console.log("  Difficulty Filter:", difficulty || "None")
console.log("  Save Disparity:", saveDisparity)
console.log("  Generate:", generateValue || "None")
console.log("  Break on Disparity:", breakOnDisparity)
console.log("  Include Known Cases:", includeKnownCases)
console.log("  Hide Report:", hideReport)

console.log("Starting at " + new Date().toISOString())
const knownIssues = parseCSV("./test/known_disparities.csv");
const knownIssuePuzzles = knownIssues.map(issue => issue.puzzle)

let puzzles = []
if (given) {
    puzzles.push(given.trim())
}
if (generateValue) {
    console.log(`Generating ${generateValue} puzzles...`)
    const generatedPuzzles = await generate(generateValue, difficulty)
    puzzles.push(...generatedPuzzles)
}
if (includeKnownCases) {
    console.log(`Including ${knownIssuePuzzles.length} known issue puzzles...`)
    puzzles.push(...knownIssuePuzzles)
}

const originalSolvedPuzzles = await runHodoku(puzzles)

const disparityMap = difficultyLevels.reduce((map, difficulty) => {
    map[difficulty] = []
    return map
}, {})

for (let i = 0; i < puzzles.length; i++) {
    let puzzle = puzzles[i]
    const originalResult = originalSolvedPuzzles.find(result => result.puzzle === puzzle)
    const newResult = SudokuSolver.rate(puzzle)
    let difficultyMatch = originalResult.difficulty.toUpperCase() === newResult.difficulty.toUpperCase()
    let scoreMatch = originalResult.score === newResult.score
    const line = `\"${puzzle}\",\"${originalResult.difficulty}\",\"${originalResult.score}\"`
    if (!difficultyMatch || !scoreMatch) {
        disparityMap[originalResult.difficulty.toUpperCase()].push({
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
        if (saveDisparity && !knownIssuePuzzles.includes(puzzle)) {
            appendLineToCSV('./test/known_disparities.csv', line)
            console.log("New disparity found! Example added to known_disparities.csv")
        }
        if (breakOnDisparity) {
            console.log("New disparity found! Stopping execution.")
            break;
        }
    } else {
        if (knownIssuePuzzles.includes(puzzle)) {
            removeLineFromCSV('./test/known_disparities.csv', line)
            appendLineToCSV('./test/test_data.csv', line)
            console.log("Previously known disparity now matches for puzzle:", puzzle)
        }
    }
    process.stdout.write(`Solved ${i + 1}/${puzzles.length} puzzles with new library...\r`);
}

const disparityResults = {}

const totalPuzzlesByDifficulty = {}
for (const difficulty of difficultyLevels) {
    totalPuzzlesByDifficulty[difficulty] = puzzles.filter(puzzle => {
        const originalResult = originalSolvedPuzzles.find(result => result.puzzle === puzzle)
        return originalResult.difficulty.toUpperCase() === difficulty
    }).length
}

let totalDifficultyDisparities = 0;
let totalScoreDisparities = 0;
let totalDisparities = 0;

for (const difficulty of difficultyLevels) {
    let difficultyDisparities = 0;
    let scoreDisparities = 0;
    for (const disparity of disparityMap[difficulty]) {
        console.log("\nDisparity Found:")
        console.log("Puzzle:", disparity.puzzle)
        console.log("Original Estimation: " + disparity.original.difficulty.toUpperCase() + " (" + disparity.original.score + ")")
        console.log("New Estimation: " + disparity.new.difficulty.toUpperCase() + " (" + disparity.new.score + ")")
        if (disparity.original.difficulty.toUpperCase() !== disparity.new.difficulty.toUpperCase()) {
            difficultyDisparities++;
            totalDifficultyDisparities++;
        }
        if (disparity.original.score !== disparity.new.score) {
            scoreDisparities++;
            totalScoreDisparities++;
        }
    }
    totalDisparities += disparityMap[difficulty].length;
    disparityResults[difficulty] = {
        total: disparityMap[difficulty].length,
        difficultyDisparities,
        scoreDisparities
    }
}

if (!hideReport) {
    console.log("\nNumber of sudokus analyzed: " + puzzles.length)
    console.log("Total Disparities Found: " + totalDisparities);
    console.log("Difficulty Disparities: " + totalDifficultyDisparities);
    console.log("Score Disparities: " + totalScoreDisparities);
    console.log("Difficulty parity: " + (((puzzles.length - totalDifficultyDisparities) / puzzles.length) * 100).toFixed(2) + "%")
    console.log("Score parity: " + (((puzzles.length - totalScoreDisparities) / puzzles.length) * 100).toFixed(2) + "%")

    console.log("\nDetailed Disparity Results by Difficulty Level:")
    for (const difficulty of difficultyLevels) {
        const results = disparityResults[difficulty]
        console.log("  " + difficulty)
        console.log("   Total Puzzles:", totalPuzzlesByDifficulty[difficulty])
        console.log("   Disparities:", results.total)
        console.log("   Difficulty Disparities:", results.difficultyDisparities)
        console.log("   Score Disparities:", results.scoreDisparities)
        console.log("   Difficulty Parity:", (((totalPuzzlesByDifficulty[difficulty] - results.difficultyDisparities) / totalPuzzlesByDifficulty[difficulty]) * 100).toFixed(2) + "%")
        console.log("   Score Parity:", (((totalPuzzlesByDifficulty[difficulty] - results.scoreDisparities) / totalPuzzlesByDifficulty[difficulty]) * 100).toFixed(2) + "%")
    }
}