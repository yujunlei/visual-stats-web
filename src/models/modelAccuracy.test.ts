import { describe, expect, it } from 'vitest'
import type { Row } from '../data/types'
import { getModelPlugin } from './registry'

const metric = (rows: Array<{ label: string; value: string | number }>, label: string) => {
  const value = rows.find((entry) => entry.label === label)?.value
  if (typeof value !== 'number') throw new Error(`Missing numeric metric: ${label}`)
  return value
}

const metricValue = (rows: Array<{ label: string; value: string | number }>, label: string) => {
  const value = rows.find((entry) => entry.label === label)?.value
  if (value === undefined) throw new Error(`Missing metric: ${label}`)
  return value
}

const coefficient = (rows: Array<Record<string, string | number>>, term: string) => {
  const value = rows.find((row) => row.term === term)?.coefficient
  if (typeof value !== 'number') throw new Error(`Missing coefficient: ${term}`)
  return value
}

describe('stable model numeric fixtures', () => {
  it('matches expected OLS coefficients and R-squared on a fixed sample', () => {
    const plugin = getModelPlugin('linear-regression')
    const rows: Row[] = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ]
    const result = plugin.fit({ rows, config: { target: 'y', features: ['x'], params: { target: 'y', features: ['x'], controls: [] } } })
    const coefficients = result.tables.find((table) => table.id === 'coefficients')?.rows ?? []
    const intercept = coefficients.find((row) => row.term === '_cons')
    const slope = coefficients.find((row) => row.term === 'x')

    expect(intercept?.coefficient).toBeCloseTo(2.2, 10)
    expect(slope?.coefficient).toBeCloseTo(0.6, 10)
    expect(metric(result.summary, 'R-squared')).toBeCloseTo(0.6, 10)
    expect(metric(result.summary, 'Number of obs')).toBe(5)
  })

  it('matches expected one-sample t-test fixture values', () => {
    const plugin = getModelPlugin('one-sample-t-test')
    const rows: Row[] = [{ value: 2 }, { value: 4 }, { value: 6 }, { value: 8 }, { value: 10 }]
    const result = plugin.fit({ rows, config: { target: '', features: ['value'], params: { variable: 'value', mu: 5 } } })
    const row = result.tables.find((table) => table.id === 'test')?.rows[0]

    expect(row?.mean).toBeCloseTo(6, 10)
    expect(row?.meanDiff).toBeCloseTo(1, 10)
    expect(row?.stdError).toBeCloseTo(Math.sqrt(2), 10)
    expect(row?.tValue).toBeCloseTo(1 / Math.sqrt(2), 10)
    expect(row?.df).toBe(4)
  })

  it('matches expected chi-square statistic on a fixed 2 by 2 table', () => {
    const plugin = getModelPlugin('crosstab-chi-square')
    const rows: Row[] = [
      ...Array.from({ length: 8 }, () => ({ group: 'A', outcome: 'Yes' })),
      ...Array.from({ length: 2 }, () => ({ group: 'A', outcome: 'No' })),
      ...Array.from({ length: 1 }, () => ({ group: 'B', outcome: 'Yes' })),
      ...Array.from({ length: 9 }, () => ({ group: 'B', outcome: 'No' })),
    ]
    const result = plugin.fit({ rows, config: { target: '', features: ['group', 'outcome'], params: { rowVar: 'group', colVar: 'outcome' } } })

    expect(metric(result.summary, 'N')).toBe(20)
    expect(metric(result.summary, 'Chi-square')).toBeCloseTo(9.8989898989899, 10)
    expect(metric(result.summary, 'df')).toBe(1)
  })

  it('matches expected descriptive and correlation fixtures', () => {
    const descriptive = getModelPlugin('descriptive-statistics')
    const correlation = getModelPlugin('correlation-analysis')
    const rows: Row[] = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
      { x: 4, y: 8 },
    ]

    const summary = descriptive.fit({ rows, config: { target: '', features: ['x'] } }).tables.find((table) => table.id === 'summary')?.rows[0]
    const pair = correlation.fit({ rows, config: { target: '', features: ['x', 'y'] } }).tables.find((table) => table.id === 'pairs')?.rows[0]

    expect(summary?.mean).toBeCloseTo(2.5, 10)
    expect(summary?.stdDev).toBeCloseTo(Math.sqrt(5 / 3), 10)
    expect(pair?.correlation).toBeCloseTo(1, 10)
    expect(pair?.n).toBe(4)
  })

  it('matches expected xtreg fixed-effect slope and reports absorption diagnostics', () => {
    const plugin = getModelPlugin('xtreg-fixed-effects')
    const entityEffects: Record<string, number> = { A: 10, B: -3, C: 5 }
    const rows: Row[] = Object.entries(entityEffects).flatMap(([entity, effect], entityIndex) =>
      [1, 2, 3, 4].map((time) => {
        const x = time + entityIndex * 0.25
        return { entity, time, x, y: effect + 2 * x }
      }),
    )
    const result = plugin.fit({ rows, config: { target: 'y', features: ['entity', 'x'], params: { target: 'y', panelId: 'entity', regressors: ['x'] } } })
    const coefficients = result.tables.find((table) => table.id === 'coefficients')?.rows ?? []

    expect(coefficient(coefficients, 'x')).toBeCloseTo(2, 8)
    expect(coefficients.some((row) => row.term === '_cons')).toBe(false)
    expect(metric(result.summary, 'Number of groups')).toBe(3)
    expect(metric(result.summary, 'Singleton groups')).toBe(0)
    expect(metric(result.summary, 'FE iterations')).toBeGreaterThan(0)
    expect(metric(result.summary, 'FE max delta')).toBeGreaterThanOrEqual(0)
    expect(metricValue(result.summary, 'FE converged')).toBe('Yes')
  })

  it('matches expected reghdfe slope with two absorbed fixed effects', () => {
    const plugin = getModelPlugin('reghdfe-regression')
    const entityEffects: Record<string, number> = { A: 4, B: -2, C: 7 }
    const timeEffects: Record<string, number> = { '2020': 1, '2021': -1.5, '2022': 3 }
    const rows: Row[] = Object.entries(entityEffects).flatMap(([entity, entityEffect], entityIndex) =>
      Object.entries(timeEffects).map(([year, timeEffect], timeIndex) => {
        const x = (entityIndex + 1) * (timeIndex + 2)
        return { entity, year, x, y: entityEffect + timeEffect + 1.5 * x }
      }),
    )
    const result = plugin.fit({
      rows,
      config: { target: 'y', features: ['entity', 'year', 'x'], params: { target: 'y', fixedEffects: ['entity', 'year'], regressors: ['x'] } },
    })
    const coefficients = result.tables.find((table) => table.id === 'coefficients')?.rows ?? []

    expect(coefficient(coefficients, 'x')).toBeCloseTo(1.5, 8)
    expect(coefficients.some((row) => row.term === '_cons')).toBe(true)
    expect(metric(result.summary, 'Absorbed FE')).toBe(2)
    expect(metric(result.summary, 'Singleton groups')).toBe(0)
    expect(metric(result.summary, 'FE iterations')).toBeGreaterThan(0)
    expect(metric(result.summary, 'FE max delta')).toBeGreaterThanOrEqual(0)
    expect(metricValue(result.summary, 'FE converged')).toBe('Yes')
  })

  it('keeps non-ASCII reghdfe regressors distinct after fixed-effect absorption', () => {
    const plugin = getModelPlugin('reghdfe-regression')
    const entityEffects: Record<string, number> = { A: 4, B: -2, C: 7, D: 1 }
    const timeEffects: Record<string, number> = { '2020': 1, '2021': -1.5, '2022': 3, '2023': 0.5 }
    const rows: Row[] = Object.entries(entityEffects).flatMap(([entity, entityEffect], entityIndex) =>
      Object.entries(timeEffects).map(([year, timeEffect], timeIndex) => {
        const x1 = (entityIndex + 1) * (timeIndex + 2)
        const x2 = (entityIndex + 2) ** 2 * (timeIndex + 1)
        return {
          entity,
          year,
          'ln科学技术水平': x1,
          'ln经济发展水平': x2,
          y: entityEffect + timeEffect + 1.2 * x1 - 0.7 * x2,
        }
      }),
    )
    const result = plugin.fit({
      rows,
      config: {
        target: 'y',
        features: ['entity', 'year', 'ln科学技术水平', 'ln经济发展水平'],
        params: { target: 'y', fixedEffects: ['entity', 'year'], regressors: ['ln科学技术水平', 'ln经济发展水平'] },
      },
    })
    const coefficients = result.tables.find((table) => table.id === 'coefficients')?.rows ?? []

    expect(coefficient(coefficients, 'ln科学技术水平')).toBeCloseTo(1.2, 8)
    expect(coefficient(coefficients, 'ln经济发展水平')).toBeCloseTo(-0.7, 8)
  })
})
