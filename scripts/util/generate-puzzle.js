const { spawn } = require("child_process");

const difficultyOptions = ["SIMPLE", "EASY", "INTERMEDIATE", "EXPERT"];

function generate(quantity, difficulty) {
    if (!quantity || isNaN(quantity) || quantity <= 0) {
        throw new Error("Invalid quantity. Please provide a positive integer.");
    }

    if (difficulty && !difficultyOptions.includes(difficulty.toUpperCase())) {
        throw new Error(`Invalid difficulty level. Valid options are: ${difficultyOptions.join(", ")}`);
    }
    return new Promise((resolve, reject) => {
        const jarPath = process.env.QQWING_JAR_PATH;

        if (!jarPath) {
            reject(new Error("Missing QQWING_JAR_PATH environment variable"));
            return;
        }

        let args = [
            "-Xmx8192m",
            "-jar",
            jarPath,
            "--one-line",
            "--generate",   
            quantity
        ]

        if (difficulty) {
            args.push("--difficulty")
            args.push(difficulty.toUpperCase())
        }

        const proc = spawn("java", args);

        let buffer = "";

        const puzzles = [];

        proc.stdout.on("data", (data) => {
            buffer += data.toString();

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            const newPuzzles = lines.map(line => line.trim()).filter(line => line.length > 0);
            puzzles.push(...newPuzzles);
            process.stdout.write(`Generated ${puzzles.length}/${quantity} puzzles...\r`);
        });

        proc.on("close", () => {
            resolve(puzzles);
        });

        proc.on("error", (err) => {
            reject(err);
        });
    });
}

module.exports = { generate, difficultyOptions };