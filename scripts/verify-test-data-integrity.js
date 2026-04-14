import { runHodoku } from './util/original-evaluate-puzzle.js'
import * as fs from "fs";
import * as path from "path";

function parseCSV() {
  const csv = fs.readFileSync("./test/test_data.csv", "utf8");
  const lines = csv.trim().split(/\r?\n/).slice(1); // skip header
  return lines.map(line => {
    const parts = line.match(/"([^"]*)"/g).map(s => s.slice(1, -1));
    return {
      puzzle:     parts[0],
      difficulty: parts[1].toUpperCase(),
      score:      parseInt(parts[2], 10),
    };
  });
}

const testData = parseCSV();

console.log("Starting at " + new Date().toISOString())

let difficultyMatch = true
let scoreMatch = true


for (let iteration = 0; iteration < testData.length; iteration++) {
    let testCase = testData[iteration]
    let puzzle = testCase.puzzle
    console.log("\nIteration: " + (iteration + 1))
    console.log("Puzzle:", puzzle)
    
    const originalResult = await runHodoku(puzzle)
    console.log("Original Estimation: " + originalResult.difficulty.toUpperCase() + " (" + originalResult.score + ")")
    console.log("Test Case Estimation: " + testCase.difficulty.toUpperCase() + " (" + testCase.score + ")")
    difficultyMatch = originalResult.difficulty.toUpperCase() === testCase.difficulty.toUpperCase()
    scoreMatch = originalResult.score === testCase.score
    console.log("Match:")
    console.log("  Difficulty: " + (difficultyMatch ? "Yes" : "No"))
    console.log("  Score: " + (scoreMatch ? "Yes" : "No"))
    if ((!difficultyMatch || !scoreMatch)) {
        console.log("Disparity found!")
        break
    }
    
}