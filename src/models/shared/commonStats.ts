import { jStat } from 'jstat'
import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'

export const compactValue = (value: Row[string]) => (value === null || value === undefined || value === '' ? 'NA' : String(value))

export const numericValues = (rows: Row[], column: string) => rows.map((row) => toNumber(row[column])).filter((value): value is number => value !== null)

export const pairedNumericValues = (rows: Row[], left: string, right: string) =>
  rows
    .map((row) => [toNumber(row[left]), toNumber(row[right])] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null)

export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

export const variance = (values: number[]) => {
  if (values.length <= 1) return 0
  const average = mean(values)
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}

export const stdDev = (values: number[]) => Math.sqrt(variance(values))

export const quantile = (values: number[], probability: number) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export const median = (values: number[]) => quantile(values, 0.5)

export const skewness = (values: number[]) => {
  if (values.length < 3) return 0
  const average = mean(values)
  const sd = stdDev(values)
  if (sd === 0) return 0
  return values.reduce((sum, value) => sum + ((value - average) / sd) ** 3, 0) / values.length
}

export const excessKurtosis = (values: number[]) => {
  if (values.length < 4) return 0
  const average = mean(values)
  const sd = stdDev(values)
  if (sd === 0) return 0
  return values.reduce((sum, value) => sum + ((value - average) / sd) ** 4, 0) / values.length - 3
}

export const pearson = (left: number[], right: number[]) => {
  const leftMean = mean(left)
  const rightMean = mean(right)
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0)
  const leftDenominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0))
  const rightDenominator = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0))

  if (leftDenominator === 0 || rightDenominator === 0) return 0
  return numerator / (leftDenominator * rightDenominator)
}

export const twoSidedT = (tValue: number, df: number) => 2 * (1 - jStat.studentt.cdf(Math.abs(tValue), Math.max(df, 1)))

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

export const chiSquarePValue = (chiSquare: number, df: number) => {
  const gammaP = (jStat as unknown as { gammap: (shape: number, value: number) => number }).gammap
  return 1 - gammaP(Math.max(df, 1) / 2, Math.max(chiSquare, 0) / 2)
}

export const normalPValue = (zValue: number) => 2 * (1 - normalCdf(Math.abs(zValue)))

export const rankValues = (values: number[]) => {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value)
  const ranks = Array.from({ length: values.length }, () => 0)
  let cursor = 0

  while (cursor < sorted.length) {
    let end = cursor + 1
    while (end < sorted.length && sorted[end].value === sorted[cursor].value) end += 1
    const averageRank = (cursor + 1 + end) / 2
    sorted.slice(cursor, end).forEach((entry) => {
      ranks[entry.index] = averageRank
    })
    cursor = end
  }

  return ranks
}
