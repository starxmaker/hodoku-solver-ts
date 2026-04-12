import qqwingLib from 'qqwing'

export const generate = () =>{
  const q = new qqwingLib()
  q.setLogHistory(false)
  q.setRecordHistory(false)
  q.setPrintStyle(qqwingLib.PrintStyle.ONE_LINE)
  q.generatePuzzle()
  q.setRecordHistory(true)
  q.solve()
  q.setRecordHistory(false)
  return { sudoku: q.getPuzzleString().trim(), difficulty: q.getDifficulty()}
}

export const difficultyOptions = Object.keys(qqwingLib.Difficulty)