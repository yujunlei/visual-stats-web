import { jStat } from 'jstat'
import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import { invert, multiply, transpose } from './matrix'
import type { InferenceConfig } from '../types'

export type RegressionCoefficient = {
  term: string
  coefficient: number
  stdError: number
  tValue: number
  pValue: number
  ciLow: number
  ciHigh: number
}

export type OlsFit = {
  n: number
  featureNames: string[]
  coefficients: RegressionCoefficient[]
  beta: number[]
  covariance: number[][]
  actual: number[]
  fitted: number[]
  residuals: number[]
  sse: number
  ssModel: number
  sst: number
  dfModel: number
  dfResidual: number
  dfTotal: number
  msModel: number
  mse: number
  msTotal: number
  fValue: number
  fPValue: number
  r2: number
  adjustedR2: number
  rootMse: number
  standardError: InferenceConfig['standardError']
  clusterField?: string
  clusterCount?: number
  warnings: string[]
}

export type LogitFit = {
  n: number
  featureNames: string[]
  coefficients: Array<RegressionCoefficient & { oddsRatio: number }>
  beta: number[]
  covariance: number[][]
  actual: number[]
  probabilities: number[]
  logLikelihood: number
  nullLogLikelihood: number
  pseudoR2: number
  accuracy: number
  positives: number
  negatives: number
}

const coefficientColumns = ['term', 'coefficient', 'stdError', 'tValue', 'pValue', 'ciLow', 'ciHigh']

export const olsCoefficientColumns = coefficientColumns

export const cleanNumericRows = (rows: Row[], target: string, features: string[]) =>
  rows
    .map((row) => ({
      y: toNumber(row[target]),
      x: features.map((feature) => toNumber(row[feature])),
      row,
    }))
    .filter((row): row is { y: number; x: number[]; row: Row } => row.y !== null && row.x.every((value) => value !== null))

const outerProduct = (values: number[]) => values.map((left) => values.map((right) => left * right))

const addMatrices = (left: number[][], right: number[][]) =>
  left.map((row, rowIndex) => row.map((value, columnIndex) => value + right[rowIndex][columnIndex]))

const scaleMatrix = (matrix: number[][], scale: number) => matrix.map((row) => row.map((value) => value * scale))

const zeroMatrix = (size: number) => Array.from({ length: size }, () => Array.from({ length: size }, () => 0))

const sandwichCovariance = (
  x: number[][],
  residuals: number[],
  xtxInverse: number[][],
  inference: InferenceConfig | undefined,
  sourceRows: Row[],
  dfResidual: number,
) => {
  const size = x[0].length
  const n = x.length
  const standardError = inference?.standardError ?? 'ols'

  if (standardError === 'robust') {
    const meat = x.reduce((matrix, row, index) => addMatrices(matrix, scaleMatrix(outerProduct(row), residuals[index] ** 2)), zeroMatrix(size))
    const adjustment = n / Math.max(dfResidual, 1)

    return {
      covariance: scaleMatrix(multiply(multiply(xtxInverse, meat), xtxInverse), adjustment),
      standardError,
      warnings: [] as string[],
    }
  }

  if (standardError === 'cluster' && inference?.clusterField) {
    const groups = new Map<string, number[]>()
    sourceRows.forEach((row, index) => {
      const key = String(row[inference.clusterField] ?? '__missing__')
      groups.set(key, [...(groups.get(key) ?? []), index])
    })

    if (groups.size < 2) {
      return {
        covariance: null,
        standardError: 'ols' as const,
        clusterField: inference.clusterField,
        clusterCount: groups.size,
        warnings: [`聚类字段 ${inference.clusterField} 少于 2 个有效组，已回退为普通标准误。`],
      }
    }

    const meat = Array.from(groups.values()).reduce((matrix, indexes) => {
      const score = indexes.reduce(
        (values, rowIndex) => values.map((value, columnIndex) => value + x[rowIndex][columnIndex] * residuals[rowIndex]),
        Array.from({ length: size }, () => 0),
      )

      return addMatrices(matrix, outerProduct(score))
    }, zeroMatrix(size))
    const groupCount = groups.size
    const adjustment = (groupCount / (groupCount - 1)) * ((n - 1) / Math.max(dfResidual, 1))

    return {
      covariance: scaleMatrix(multiply(multiply(xtxInverse, meat), xtxInverse), adjustment),
      standardError,
      clusterField: inference.clusterField,
      clusterCount: groupCount,
      warnings: [] as string[],
    }
  }

  return {
    covariance: null,
    standardError: 'ols' as const,
    warnings: [] as string[],
  }
}

export const fitOls = (rows: Row[], target: string, features: string[], label = '模型', inference?: InferenceConfig) => {
  if (!target || features.length === 0) {
    throw new Error(`${label}需要选择一个因变量和至少一个自变量。`)
  }

  const cleanRows = cleanNumericRows(rows, target, features)
  if (cleanRows.length <= features.length + 1) {
    throw new Error(`${label}可用观测太少，无法估计。`)
  }

  const x = cleanRows.map((row) => [1, ...row.x])
  const y = cleanRows.map((row) => [row.y])
  const xt = transpose(x)
  const xtx = multiply(xt, x)
  const xtxInverse = invert(xtx)
  const beta = multiply(multiply(xtxInverse, xt), y).map((row) => row[0])
  const fitted = x.map((row) => row.reduce((sum, value, i) => sum + value * beta[i], 0))
  const actual = cleanRows.map((row) => row.y)
  const residuals = actual.map((value, i) => value - fitted[i])
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0)
  const meanY = actual.reduce((sum, value) => sum + value, 0) / actual.length
  const sst = actual.reduce((sum, value) => sum + (value - meanY) ** 2, 0)
  const ssModel = Math.max(sst - sse, 0)
  const dfModel = features.length
  const predictors = features.length + 1
  const dfResidual = cleanRows.length - predictors
  const dfTotal = cleanRows.length - 1
  const msModel = ssModel / Math.max(dfModel, 1)
  const mse = sse / dfResidual
  const msTotal = sst / dfTotal
  const fValue = msModel / mse
  const fPValue = 1 - jStat.centralF.cdf(fValue, dfModel, dfResidual)
  const covariance = xtxInverse.map((row) => row.map((value) => value * mse))
  const robustCovariance = sandwichCovariance(
    x,
    residuals,
    xtxInverse,
    inference,
    cleanRows.map((row) => row.row),
    dfResidual,
  )
  const effectiveCovariance = robustCovariance.covariance ?? covariance
  const useNormalInference = robustCovariance.standardError !== 'ols'
  const tCritical = useNormalInference ? 1.96 : jStat.studentt.inv(0.975, dfResidual)
  const featureNames = ['_cons', ...features]
  const coefficients: RegressionCoefficient[] = featureNames.map((term, i) => {
    const stdError = Math.sqrt(Math.max(effectiveCovariance[i][i], 0))
    const tValue = stdError === 0 ? 0 : beta[i] / stdError
    const pValue = useNormalInference ? normalPValue(tValue) : 2 * (1 - jStat.studentt.cdf(Math.abs(tValue), dfResidual))
    const coefficient = beta[i]

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
  const r2 = sst === 0 ? 0 : 1 - sse / sst
  const adjustedR2 = 1 - (1 - r2) * ((cleanRows.length - 1) / dfResidual)

  return {
    n: cleanRows.length,
    featureNames,
    coefficients,
    beta,
    covariance: effectiveCovariance,
    actual,
    fitted,
    residuals,
    sse,
    ssModel,
    sst,
    dfModel,
    dfResidual,
    dfTotal,
    msModel,
    mse,
    msTotal,
    fValue,
    fPValue,
    r2,
    adjustedR2,
    rootMse: Math.sqrt(mse),
    standardError: robustCovariance.standardError,
    clusterField: robustCovariance.clusterField,
    clusterCount: robustCovariance.clusterCount,
    warnings: robustCovariance.warnings,
  } satisfies OlsFit
}

const variance = (values: number[]) => {
  if (values.length <= 1) return 0
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}

export const fitOlsDroppingCollinear = (rows: Row[], target: string, features: string[], label = '模型', inference?: InferenceConfig) => {
  let activeFeatures = [...features]
  const droppedFeatures: string[] = []

  while (activeFeatures.length > 0) {
    try {
      return {
        fit: fitOls(rows, target, activeFeatures, label, inference),
        features: activeFeatures,
        droppedFeatures,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('不可逆') || activeFeatures.length === 1) throw error

      const varianceByFeature = activeFeatures.map((feature) => ({
        feature,
        variance: variance(rows.map((row) => toNumber(row[feature])).filter((value): value is number => value !== null)),
      }))
      const featureToDrop = varianceByFeature.sort((left, right) => left.variance - right.variance)[0]?.feature ?? activeFeatures.at(-1)

      if (!featureToDrop) throw error
      droppedFeatures.push(featureToDrop)
      activeFeatures = activeFeatures.filter((feature) => feature !== featureToDrop)
    }
  }

  throw new Error(`${label}没有可估计的解释变量。`)
}

export const getCoefficient = (fit: OlsFit, term: string) => {
  const index = fit.featureNames.indexOf(term)
  if (index < 0) throw new Error(`模型中没有找到变量 ${term}。`)
  return {
    index,
    coefficient: fit.beta[index],
    stdError: Math.sqrt(Math.max(fit.covariance[index][index], 0)),
  }
}

const normalCdf = (value: number) => {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const erf =
    sign *
    (1 -
      (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x)))

  return 0.5 * (1 + erf)
}

export const normalPValue = (zValue: number) => 2 * (1 - normalCdf(Math.abs(zValue)))

export const fitLogit = (rows: Row[], target: string, features: string[], label = 'Logit') => {
  if (!target || features.length === 0) {
    throw new Error(`${label}需要选择一个二分类因变量和至少一个自变量。`)
  }

  const cleanRows = cleanNumericRows(rows, target, features).map((row) => ({
    y: row.y > 0 ? 1 : 0,
    x: [1, ...row.x],
  }))
  const positives = cleanRows.filter((row) => row.y === 1).length
  const negatives = cleanRows.length - positives

  if (cleanRows.length <= features.length + 1) throw new Error(`${label}可用观测太少，无法估计。`)
  if (positives === 0 || negatives === 0) throw new Error(`${label}要求因变量同时包含 0 和 1。`)

  let beta = Array.from({ length: features.length + 1 }, () => 0)
  const sigmoid = (value: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, value))))

  for (let iteration = 0; iteration < 35; iteration += 1) {
    const probabilities = cleanRows.map((row) => sigmoid(row.x.reduce((sum, value, index) => sum + value * beta[index], 0)))
    const weightedX = cleanRows.map((row, rowIndex) => {
      const weight = Math.max(probabilities[rowIndex] * (1 - probabilities[rowIndex]), 1e-6)
      return row.x.map((value) => value * weight)
    })
    const xt = transpose(cleanRows.map((row) => row.x))
    const hessian = multiply(xt, weightedX).map((row, rowIndex) =>
      row.map((value, columnIndex) => (rowIndex === columnIndex ? value + 1e-6 : value)),
    )
    const gradient = xt.map((column) =>
      column.reduce((sum, value, rowIndex) => sum + value * (cleanRows[rowIndex].y - probabilities[rowIndex]), 0),
    )
    const step = multiply(invert(hessian), gradient.map((value) => [value])).map((row) => row[0])
    beta = beta.map((value, index) => value + step[index])

    if (Math.max(...step.map(Math.abs)) < 1e-6) break
  }

  const probabilities = cleanRows.map((row) => sigmoid(row.x.reduce((sum, value, index) => sum + value * beta[index], 0)))
  const weightedX = cleanRows.map((row, rowIndex) => {
    const weight = Math.max(probabilities[rowIndex] * (1 - probabilities[rowIndex]), 1e-6)
    return row.x.map((value) => value * weight)
  })
  const xt = transpose(cleanRows.map((row) => row.x))
  const information = multiply(xt, weightedX).map((row, rowIndex) =>
    row.map((value, columnIndex) => (rowIndex === columnIndex ? value + 1e-6 : value)),
  )
  const covariance = invert(information)
  const featureNames = ['_cons', ...features]
  const coefficients = featureNames.map((term, index) => {
    const stdError = Math.sqrt(Math.max(covariance[index][index], 0))
    const tValue = stdError === 0 ? 0 : beta[index] / stdError
    const pValue = normalPValue(tValue)
    const coefficient = beta[index]

    return {
      term,
      coefficient,
      stdError,
      tValue,
      pValue,
      ciLow: coefficient - 1.96 * stdError,
      ciHigh: coefficient + 1.96 * stdError,
      oddsRatio: Math.exp(coefficient),
    }
  })
  const epsilon = 1e-12
  const logLikelihood = cleanRows.reduce(
    (sum, row, index) => sum + row.y * Math.log(probabilities[index] + epsilon) + (1 - row.y) * Math.log(1 - probabilities[index] + epsilon),
    0,
  )
  const baseRate = positives / cleanRows.length
  const nullLogLikelihood = cleanRows.reduce(
    (sum, row) => sum + row.y * Math.log(baseRate + epsilon) + (1 - row.y) * Math.log(1 - baseRate + epsilon),
    0,
  )
  const accuracy = cleanRows.filter((row, index) => (probabilities[index] >= 0.5 ? 1 : 0) === row.y).length / cleanRows.length

  return {
    n: cleanRows.length,
    featureNames,
    coefficients,
    beta,
    covariance,
    actual: cleanRows.map((row) => row.y),
    probabilities,
    logLikelihood,
    nullLogLikelihood,
    pseudoR2: 1 - logLikelihood / nullLogLikelihood,
    accuracy,
    positives,
    negatives,
  } satisfies LogitFit
}
