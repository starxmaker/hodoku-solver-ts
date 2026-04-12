import qqwingLib from 'qqwing'

export const generate = () =>{
  const q = new qqwingLib()
  q.setLogHistory(false)
  q.setRecordHistory(false)
  q.setPrintStyle(qqwingLib.PrintStyle.ONE_LINE)
  q.generatePuzzle()
  return q.getPuzzleString().trim()
}
