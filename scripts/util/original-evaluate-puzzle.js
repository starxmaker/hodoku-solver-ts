const { spawn } = require("child_process");

const regex =
  /^([\.0-9]{81})\s+#\d+\s+(Easy|Medium|Hard|Unfair|Extreme)\s+\((\d+)\)$/;

function runHodoku(puzzle) {
  return new Promise((resolve, reject) => {
    const jarPath = process.env.HODOKU_JAR_PATH;

    if (!jarPath) {
      reject(new Error("Missing HODOKU_JAR_PATH environment variable"));
      return;
    }

    const proc = spawn("java", [
      "-Xmx8192m",
      "-jar",
      jarPath,
      "/o",
      "stdout",
      puzzle,
    ]);

    let buffer = "";

    proc.stdout.on("data", (data) => {
      buffer += data.toString();

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const match = line.trim().match(regex);

        if (match) {
          resolve({
            puzzle: match[1],
            difficulty: match[2],
            score: Number(match[3]),
          });
          return;
        }
      }
    });

    proc.on("close", () => {
      resolve(null); // no match found
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = { runHodoku };