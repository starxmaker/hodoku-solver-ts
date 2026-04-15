const { spawn } = require("child_process");

const regex =
  /^([\.0-9]{81})\s+#\d+\s+(Easy|Medium|Hard|Unfair|Extreme)\s+\((\d+)\)$/;

function runHodoku(puzzles) {
  return new Promise((resolve, reject) => {
    const jarPath = process.env.HODOKU_JAR_PATH;

    if (!jarPath) {
      reject(new Error("Missing HODOKU_JAR_PATH environment variable"));
      return;
    }

    const puzzleFileContent = puzzles.join("\n");
    const tempFilePath = `temp_puzzles_${Date.now()}.txt`;
    const fs = require("fs");
    fs.writeFileSync(tempFilePath, puzzleFileContent);
    const proc = spawn("java", [
      "-Xmx8192m",
      "-jar",
      jarPath,
      "/o",
      "stdout",
      "/bs",
      tempFilePath,
    ]);

    let buffer = "";

    const results = [];
    proc.stdout.on("data", (data) => {
      buffer += data.toString();

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const match = line.trim().match(regex);

        if (match) {
          results.push({
            puzzle: match[1],
            difficulty: match[2],
            score: Number(match[3]),
          });
        }
      }
      process.stdout.write(`Solving ${results.length}/${puzzles.length} puzzles with original library...\r`);
    });

    proc.on("close", () => {
      fs.unlinkSync(tempFilePath);
      resolve(results);
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = { runHodoku };