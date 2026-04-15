import { runHodoku } from './util/original-evaluate-puzzle.js'
import { parseCSV } from './util/csv-utils.js'

const tests = parseCSV("./test/test_data.csv");
const knownCases = parseCSV("./test/known_disparities.csv");
const testData = [...tests, ...knownCases]
const puzzles = testData.map(testCase => testCase.puzzle)
const solvedPuzzles = await runHodoku(puzzles)

console.log("Starting at " + new Date().toISOString())

let difficultyMatch = true
let scoreMatch = true
let disparities = []

for (let iteration = 0; iteration < solvedPuzzles.length; iteration++) {
    const testCase = testData[iteration]
    const originalResult = solvedPuzzles[iteration]
    difficultyMatch = originalResult.difficulty.toUpperCase() === testCase.difficulty.toUpperCase()
    scoreMatch = originalResult.score === testCase.score
    if ((!difficultyMatch || !scoreMatch)) {
        console.log("Disparity found!")
        disparities.push({
            puzzle: testCase.puzzle,
            original: originalResult,
            testCase: testCase
        });
    }
    process.stdout.write(`Verified ${iteration + 1}/${puzzles.length} puzzles with the old library...\r`);
}

for (const disparity of disparities) {
    console.log("\nDisparity Found:")
    console.log("Puzzle:", disparity.puzzle)
    console.log("Original Estimation: " + disparity.original.difficulty.toUpperCase() + " (" + disparity.original.score + ")")
    console.log("Test Case Estimation: " + disparity.testCase.difficulty.toUpperCase() + " (" + disparity.testCase.score + ")")
}
if (disparities.length === 0) {
    console.log("No disparities found! All test cases are consistent with the original library's results.")
}