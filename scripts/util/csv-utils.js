import * as fs from 'fs';

function parseCSV(filename) {
  const csv = loadCSV(filename);
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

function removeLineFromCSV(filename, lineToRemove) {
  const csv = loadCSV(filename);
  const lines = csv.trim().split(/\r?\n/);
  const filteredLines = lines.filter(line => line !== lineToRemove);
  fs.writeFileSync(filename, filteredLines.join("\n"), "utf8");
}

function appendLineToCSV(filename, lineToAppend) {
  const csv = loadCSV(filename);
  let newLine = csv.endsWith("\n") ? lineToAppend : "\n" + lineToAppend;
  fs.appendFileSync(filename, newLine + "\n", "utf8");
}

function loadCSV(filename) {
   return fs.readFileSync(filename, "utf8");
}

export { parseCSV, removeLineFromCSV, appendLineToCSV };