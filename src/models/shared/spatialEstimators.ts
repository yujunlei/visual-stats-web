import { jStat } from 'jstat'
import type { Row } from '../../data/types'
import { cleanNumericRows, normalPValue, type RegressionCoefficient } from './regression'
import { invert, multiply, transpose } from './matrix'

export type SpatialMlFit = {
  n: number
  featureNames: string[]
  coefficients: RegressionCoefficient[]
  beta: number[]
  actual: number[]
  fitted: number[]
  residuals: number[]
  sse: number
  logLikelihood: number
  rho?: number
  lambda?: number
  r2: number
  adjustedR2: number
  rootMse: number
  warnings: string[]
}

export type SpatialImpactRow = {
  variable: string
  directEffect: number
  indirectEffect: number
  totalEffect: number
  spilloverShare: number
}

type SpatialLagCandidate = {
  rho: number
  logLik: number
  beta: number[]
  fittedX: number[]
  residuals: number[]
  sse: number
  xtxInverse: number[][]
}

type SpatialErrorCandidate = {
  lambda: number
  logLik: number
  beta: number[]
  fittedOriginal: number[]
  residualsOriginal: number[]
  sse: number
  xtxInverse: number[][]
}

type SpatialCombinedCandidate = {
  rho: number
  lambda: number
  logLik: number
  beta: number[]
  fitted: number[]
  residuals: number[]
  sse: number
  xtxInverse: number[][]
}

const identity = (size: number) => Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)))

const matVec = (matrix: number[][], vector: number[]) => matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0))

const transformVector = (values: number[], weights: number[][], parameter: number) => {
  const lagged = matVec(weights, values)
  return values.map((value, index) => value - parameter * lagged[index])
}

const transformMatrix = (x: number[][], weights: number[][], parameter: number) => {
  const transposed = transpose(x)
  const laggedColumns = transposed.map((column) => matVec(weights, column))
  return x.map((row, rowIndex) => row.map((value, columnIndex) => value - parameter * laggedColumns[columnIndex][rowIndex]))
}

const addDiagonalJitter = (matrix: number[][], jitter = 1e-8) =>
  matrix.map((row, rowIndex) => row.map((value, columnIndex) => (rowIndex === columnIndex ? value + jitter : value)))

const olsArrays = (y: number[], x: number[][]) => {
  const xt = transpose(x)
  const xtxInverse = invert(addDiagonalJitter(multiply(xt, x)))
  const beta = multiply(multiply(xtxInverse, xt), y.map((value) => [value])).map((row) => row[0])
  const fitted = x.map((row) => row.reduce((sum, value, index) => sum + value * beta[index], 0))
  const residuals = y.map((value, index) => value - fitted[index])
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0)

  return { beta, fitted, residuals, sse, xtxInverse }
}

const logAbsDeterminant = (matrix: number[][]) => {
  const working = matrix.map((row) => [...row])
  const size = working.length
  let sign = 1
  let logDet = 0

  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(working[row][column]) > Math.abs(working[pivot][column])) pivot = row
    }

    if (Math.abs(working[pivot][column]) < 1e-12) return Number.NEGATIVE_INFINITY

    if (pivot !== column) {
      ;[working[column], working[pivot]] = [working[pivot], working[column]]
      sign *= -1
    }

    const pivotValue = working[column][column]
    sign *= Math.sign(pivotValue) || 1
    logDet += Math.log(Math.abs(pivotValue))

    for (let row = column + 1; row < size; row += 1) {
      const factor = working[row][column] / pivotValue
      for (let col = column; col < size; col += 1) {
        working[row][col] -= factor * working[column][col]
      }
    }
  }

  return sign === 0 ? Number.NEGATIVE_INFINITY : logDet
}

const spatialLogDet = (weights: number[][], parameter: number) => {
  const size = weights.length
  const transformed = identity(size).map((row, rowIndex) => row.map((value, columnIndex) => value - parameter * weights[rowIndex][columnIndex]))
  return logAbsDeterminant(transformed)
}

const spatialMultiplier = (weights: number[][], rho: number) => {
  const size = weights.length
  const transformed = identity(size).map((row, rowIndex) => row.map((value, columnIndex) => value - rho * weights[rowIndex][columnIndex]))
  return invert(addDiagonalJitter(transformed))
}

const trace = (matrix: number[][]) => matrix.reduce((sum, row, index) => sum + (row[index] ?? 0), 0)

const matrixSum = (matrix: number[][]) => matrix.reduce((sum, row) => sum + row.reduce((rowSum, value) => rowSum + value, 0), 0)

const combineMatrices = (left: number[][], right: number[][], leftScale: number, rightScale: number) =>
  left.map((row, rowIndex) => row.map((value, columnIndex) => leftScale * value + rightScale * right[rowIndex][columnIndex]))

const profileGrid = (center: number | null, width: number, steps: number) => {
  if (center === null) return Array.from({ length: steps }, (_, index) => -0.95 + (1.9 * index) / (steps - 1))
  const start = Math.max(-0.98, center - width)
  const end = Math.min(0.98, center + width)
  return Array.from({ length: steps }, (_, index) => start + ((end - start) * index) / (steps - 1))
}

const logLikelihood = (logDet: number, sse: number, n: number) => {
  if (!Number.isFinite(logDet) || sse <= 0) return Number.NEGATIVE_INFINITY
  return logDet - (n / 2) * Math.log(sse / n)
}

const curvatureStdError = (center: number, logLik: number, evaluator: (value: number) => number) => {
  const step = Math.max(0.004, Math.min(0.035, (0.98 - Math.abs(center)) / 4))
  const left = evaluator(Math.max(-0.98, center - step))
  const right = evaluator(Math.min(0.98, center + step))
  const secondDerivative = (left - 2 * logLik + right) / step ** 2

  return secondDerivative < 0 ? Math.sqrt(-1 / secondDerivative) : 0
}

const coefficientRows = (terms: string[], beta: number[], covariance: number[][], dfResidual: number) => {
  const tCritical = dfResidual > 0 ? jStat.studentt.inv(0.975, dfResidual) : 1.96

  return terms.map((term, index) => {
    const stdError = Math.sqrt(Math.max(covariance[index]?.[index] ?? 0, 0))
    const tValue = stdError === 0 ? 0 : beta[index] / stdError
    const pValue = dfResidual > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(tValue), dfResidual)) : normalPValue(tValue)
    const coefficient = beta[index]

    return {
      term,
      coefficient,
      stdError,
      tValue,
      pValue,
      ciLow: coefficient - tCritical * stdError,
      ciHigh: coefficient + tCritical * stdError,
    }
  })
}

const buildFit = (
  actual: number[],
  fitted: number[],
  residuals: number[],
  featureNames: string[],
  beta: number[],
  xtxInverse: number[][],
  sse: number,
  logLik: number,
  rho: number | undefined,
  lambda: number | undefined,
  rhoStdError: number | undefined,
  lambdaStdError: number | undefined,
  warnings: string[],
) => {
  const n = actual.length
  const meanY = actual.reduce((sum, value) => sum + value, 0) / n
  const sst = actual.reduce((sum, value) => sum + (value - meanY) ** 2, 0)
  const dfResidual = n - beta.length
  const mse = sse / Math.max(dfResidual, 1)
  const covariance = xtxInverse.map((row) => row.map((value) => value * mse))
  const r2 = sst === 0 ? 0 : 1 - sse / sst
  const adjustedR2 = dfResidual > 0 ? 1 - (1 - r2) * ((n - 1) / dfResidual) : r2
  const spatialCoefficients: RegressionCoefficient[] = []

  if (rho !== undefined) {
    const stdError = rhoStdError ?? 0
    const tValue = stdError === 0 ? 0 : rho / stdError
    spatialCoefficients.push({
      term: 'rho_Wy',
      coefficient: rho,
      stdError,
      tValue,
      pValue: stdError === 0 ? 0 : normalPValue(tValue),
      ciLow: stdError === 0 ? rho : rho - 1.96 * stdError,
      ciHigh: stdError === 0 ? rho : rho + 1.96 * stdError,
    })
  }

  if (lambda !== undefined) {
    const stdError = lambdaStdError ?? 0
    const tValue = stdError === 0 ? 0 : lambda / stdError
    spatialCoefficients.push({
      term: 'lambda_Wu',
      coefficient: lambda,
      stdError,
      tValue,
      pValue: stdError === 0 ? 0 : normalPValue(tValue),
      ciLow: stdError === 0 ? lambda : lambda - 1.96 * stdError,
      ciHigh: stdError === 0 ? lambda : lambda + 1.96 * stdError,
    })
  }

  return {
    n,
    featureNames,
    coefficients: [...spatialCoefficients, ...coefficientRows(featureNames, beta, covariance, dfResidual)],
    beta,
    actual,
    fitted,
    residuals,
    sse,
    logLikelihood: logLik,
    rho,
    lambda,
    r2,
    adjustedR2,
    rootMse: Math.sqrt(mse),
    warnings,
  } satisfies SpatialMlFit
}

export const computeSpatialImpacts = (
  weights: number[][],
  rho: number | undefined,
  effects: Array<{ variable: string; beta: number; theta?: number }>,
): SpatialImpactRow[] => {
  if (weights.length === 0) return []

  const size = weights.length
  const multiplier = rho === undefined ? identity(size) : spatialMultiplier(weights, rho)
  const base = identity(size)

  return effects.map((effect) => {
    const coefficientMatrix = combineMatrices(base, weights, effect.beta, effect.theta ?? 0)
    const impactMatrix = multiply(multiplier, coefficientMatrix)
    const directEffect = trace(impactMatrix) / size
    const totalEffect = matrixSum(impactMatrix) / size
    const indirectEffect = totalEffect - directEffect

    return {
      variable: effect.variable,
      directEffect,
      indirectEffect,
      totalEffect,
      spilloverShare: totalEffect === 0 ? 0 : indirectEffect / totalEffect,
    }
  })
}

export const computeMoransI = (weights: number[][], residuals: number[]) => {
  const n = Math.min(weights.length, residuals.length)
  if (n <= 1) return null

  const centered = residuals.slice(0, n)
  const denominator = centered.reduce((sum, value) => sum + value ** 2, 0)
  const s0 = weights.slice(0, n).reduce((sum, row) => sum + row.slice(0, n).reduce((rowSum, value) => rowSum + value, 0), 0)
  if (denominator === 0 || s0 === 0) return null

  const numerator = centered.reduce((sum, value, rowIndex) => sum + value * weights[rowIndex].slice(0, n).reduce((rowSum, weight, columnIndex) => rowSum + weight * centered[columnIndex], 0), 0)
  const moransI = (n / s0) * (numerator / denominator)

  return {
    moransI,
    expectedI: -1 / (n - 1),
    observations: n,
    weightSum: s0,
  }
}

export const fitSpatialLagMl = (rows: Row[], target: string, features: string[], weights: number[][], label: string) => {
  const cleanRows = cleanNumericRows(rows, target, features)
  if (cleanRows.length <= features.length + 2) throw new Error(`${label}可用观测太少，无法执行空间最大似然估计。`)

  const y = cleanRows.map((row) => row.y)
  const x = cleanRows.map((row) => [1, ...row.x])
  const wy = matVec(weights, y)
  let best: SpatialLagCandidate | null = null

  const search = (grid: number[]) => {
    grid.forEach((rho) => {
      const yRho = y.map((value, index) => value - rho * wy[index])
      const fit = olsArrays(yRho, x)
      const logLik = logLikelihood(spatialLogDet(weights, rho), fit.sse, y.length)
      if (!best || logLik > best.logLik) best = { rho, logLik, beta: fit.beta, fittedX: fit.fitted, residuals: fit.residuals, sse: fit.sse, xtxInverse: fit.xtxInverse }
    })
  }

  search(profileGrid(null, 0, 51))
  search(profileGrid((best as SpatialLagCandidate | null)?.rho ?? 0, 0.08, 41))
  search(profileGrid((best as SpatialLagCandidate | null)?.rho ?? 0, 0.02, 41))

  if (!best) throw new Error(`${label}空间最大似然估计失败，请检查 W 矩阵。`)

  const finalBest = best as SpatialLagCandidate
  const rhoStdError = curvatureStdError(finalBest.rho, finalBest.logLik, (rho) => {
    const yRho = y.map((value, index) => value - rho * wy[index])
    const fit = olsArrays(yRho, x)
    return logLikelihood(spatialLogDet(weights, rho), fit.sse, y.length)
  })
  const fitted = finalBest.fittedX.map((value: number, index: number) => value + finalBest.rho * wy[index])
  return buildFit(y, fitted, y.map((value, index) => value - fitted[index]), ['_cons', ...features], finalBest.beta, finalBest.xtxInverse, finalBest.sse, finalBest.logLik, finalBest.rho, undefined, rhoStdError, undefined, [
    'SAR/SDM 使用集中对数似然估计 rho，并基于 profile likelihood 曲率近似 rho 标准误。',
  ])
}

export const fitSpatialErrorMl = (rows: Row[], target: string, features: string[], weights: number[][], label: string) => {
  const cleanRows = cleanNumericRows(rows, target, features)
  if (cleanRows.length <= features.length + 2) throw new Error(`${label}可用观测太少，无法执行空间误差最大似然估计。`)

  const y = cleanRows.map((row) => row.y)
  const x = cleanRows.map((row) => [1, ...row.x])
  let best: SpatialErrorCandidate | null = null

  const search = (grid: number[]) => {
    grid.forEach((lambda) => {
      const yLambda = transformVector(y, weights, lambda)
      const xLambda = transformMatrix(x, weights, lambda)
      const fit = olsArrays(yLambda, xLambda)
      const fittedOriginal = x.map((row) => row.reduce((sum, value, index) => sum + value * fit.beta[index], 0))
      const residualsOriginal = y.map((value, index) => value - fittedOriginal[index])
      const logLik = logLikelihood(spatialLogDet(weights, lambda), fit.sse, y.length)
      if (!best || logLik > best.logLik) best = { lambda, logLik, beta: fit.beta, fittedOriginal, residualsOriginal, sse: fit.sse, xtxInverse: fit.xtxInverse }
    })
  }

  search(profileGrid(null, 0, 51))
  search(profileGrid((best as SpatialErrorCandidate | null)?.lambda ?? 0, 0.08, 41))
  search(profileGrid((best as SpatialErrorCandidate | null)?.lambda ?? 0, 0.02, 41))

  if (!best) throw new Error(`${label}空间误差最大似然估计失败，请检查 W 矩阵。`)

  const finalBest = best as SpatialErrorCandidate
  const lambdaStdError = curvatureStdError(finalBest.lambda, finalBest.logLik, (lambda) => {
    const yLambda = transformVector(y, weights, lambda)
    const xLambda = transformMatrix(x, weights, lambda)
    const fit = olsArrays(yLambda, xLambda)
    return logLikelihood(spatialLogDet(weights, lambda), fit.sse, y.length)
  })
  return buildFit(y, finalBest.fittedOriginal, finalBest.residualsOriginal, ['_cons', ...features], finalBest.beta, finalBest.xtxInverse, finalBest.sse, finalBest.logLik, undefined, finalBest.lambda, undefined, lambdaStdError, [
    'SEM/SDEM 使用集中对数似然估计 lambda，并基于 profile likelihood 曲率近似 lambda 标准误。',
  ])
}

export const fitSpatialCombinedMl = (rows: Row[], target: string, features: string[], weights: number[][], label: string) => {
  const cleanRows = cleanNumericRows(rows, target, features)
  if (cleanRows.length <= features.length + 3) throw new Error(`${label}可用观测太少，无法执行组合空间最大似然估计。`)

  const y = cleanRows.map((row) => row.y)
  const x = cleanRows.map((row) => [1, ...row.x])
  const wy = matVec(weights, y)
  let best: SpatialCombinedCandidate | null = null

  const search = (rhoValues: number[], lambdaValues: number[]) => {
    rhoValues.forEach((rho) => {
      const yRho = y.map((value, index) => value - rho * wy[index])
      lambdaValues.forEach((lambda) => {
        const yTransformed = transformVector(yRho, weights, lambda)
        const xTransformed = transformMatrix(x, weights, lambda)
        const fit = olsArrays(yTransformed, xTransformed)
        const logLik = logLikelihood(spatialLogDet(weights, rho) + spatialLogDet(weights, lambda), fit.sse, y.length)
        const fitted = x.map((row, index) => row.reduce((sum, value, column) => sum + value * fit.beta[column], 0) + rho * wy[index])
        const residuals = y.map((value, index) => value - fitted[index])
        if (!best || logLik > best.logLik) best = { rho, lambda, logLik, beta: fit.beta, fitted, residuals, sse: fit.sse, xtxInverse: fit.xtxInverse }
      })
    })
  }

  search(profileGrid(null, 0, 25), profileGrid(null, 0, 25))
  const coarseBest = best as SpatialCombinedCandidate | null
  search(profileGrid(coarseBest?.rho ?? 0, 0.12, 17), profileGrid(coarseBest?.lambda ?? 0, 0.12, 17))

  if (!best) throw new Error(`${label}组合空间最大似然估计失败，请检查 W 矩阵。`)

  const finalBest = best as SpatialCombinedCandidate
  const rhoStdError = curvatureStdError(finalBest.rho, finalBest.logLik, (rho) => {
    const yRho = y.map((value, index) => value - rho * wy[index])
    const yTransformed = transformVector(yRho, weights, finalBest.lambda)
    const xTransformed = transformMatrix(x, weights, finalBest.lambda)
    const fit = olsArrays(yTransformed, xTransformed)
    return logLikelihood(spatialLogDet(weights, rho) + spatialLogDet(weights, finalBest.lambda), fit.sse, y.length)
  })
  const lambdaStdError = curvatureStdError(finalBest.lambda, finalBest.logLik, (lambda) => {
    const yRho = y.map((value, index) => value - finalBest.rho * wy[index])
    const yTransformed = transformVector(yRho, weights, lambda)
    const xTransformed = transformMatrix(x, weights, lambda)
    const fit = olsArrays(yTransformed, xTransformed)
    return logLikelihood(spatialLogDet(weights, finalBest.rho) + spatialLogDet(weights, lambda), fit.sse, y.length)
  })
  return buildFit(y, finalBest.fitted, finalBest.residuals, ['_cons', ...features], finalBest.beta, finalBest.xtxInverse, finalBest.sse, finalBest.logLik, finalBest.rho, finalBest.lambda, rhoStdError, lambdaStdError, [
    'SAC/GNS 使用二维集中似然网格搜索，并基于 profile likelihood 曲率近似 rho/lambda 标准误。',
  ])
}
