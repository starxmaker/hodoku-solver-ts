import * as fs from 'fs';

function parseCSV(filename) {
  const csv = fs.readFileSync(filename, "utf8");
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

export { parseCSV };