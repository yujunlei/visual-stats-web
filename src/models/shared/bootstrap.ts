import type { Row } from '../../data/types'

type BootstrapSummary = {
  estimate: number
  bootCiLow: number
  bootCiHigh: number
  bootstrapReps: number
}

const createRandom = (seed: number) => {
  let value = seed >>> 0

  return () => {
    value = (1664525 * value + 1013904223) >>> 0
    return value / 0x100000000
  }
}

export const hashSeed = (value: string) =>
  value.split('').reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0

export const percentile = (values: number[], probability: number) => {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export const bootstrapRows = <T>(
  rows: Row[],
  iterations: number,
  seed: number,
  estimator: (sampleRows: Row[]) => T,
  collect: (estimate: T) => number,
) => {
  const estimates = bootstrapSamples(rows, iterations, seed, estimator)

  return estimates.map(collect).filter(Number.isFinite)
}

export const bootstrapSamples = <T>(rows: Row[], iterations: number, seed: number, estimator: (sampleRows: Row[]) => T) => {
  const random = createRandom(seed)
  const estimates: T[] = []

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampleRows = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)])

    try {
      estimates.push(estimator(sampleRows))
    } catch {
      // Some resamples can become singular; keep the successful bootstrap draws.
    }
  }

  return estimates
}

export const summarizeBootstrap = (estimate: number, values: number[]): BootstrapSummary => ({
  estimate,
  bootCiLow: percentile(values, 0.025),
  bootCiHigh: percentile(values, 0.975),
  bootstrapReps: values.length,
})
