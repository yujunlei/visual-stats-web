export const transpose = (matrix: number[][]) => matrix[0].map((_, col) => matrix.map((row) => row[col]))

export const multiply = (left: number[][], right: number[][]) =>
  left.map((row) => right[0].map((_, col) => row.reduce((sum, value, i) => sum + value * right[i][col], 0)))

export const invert = (matrix: number[][]) => {
  const size = matrix.length
  const augmented = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)),
  ])

  for (let col = 0; col < size; col += 1) {
    let pivot = col
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row
    }

    if (Math.abs(augmented[pivot][col]) < 1e-10) {
      throw new Error('模型矩阵不可逆，请减少高度相关的自变量。')
    }

    ;[augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]]
    const pivotValue = augmented[col][col]
    augmented[col] = augmented[col].map((value) => value / pivotValue)

    for (let row = 0; row < size; row += 1) {
      if (row === col) continue
      const factor = augmented[row][col]
      augmented[row] = augmented[row].map((value, i) => value - factor * augmented[col][i])
    }
  }

  return augmented.map((row) => row.slice(size))
}
