import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Row } from '../src/data/types'
import type { InferenceConfig, ModelConfig } from '../src/models/types'
import { getModelPlugin } from '../src/models/registry'

type Fixture = {
  id: string
  pluginId: string
  rows?: Row[]
  dataFixture?: string
  source?: string
  stataCommand?: string
  config: ModelConfig
  inference?: InferenceConfig
  expected: {
    coefficients?: Record<string, { coefficient: number; stdError?: number; tValue?: number; pValue?: number }>
    presentCoefficients?: string[]
    absentCoefficients?: string[]
    summary?: Record<string, string | number>
    finiteSummary?: string[]
    warningsInclude?: string[]
    tables?: Record<string, { columns?: string[]; rows?: Array<Record<string, string | number>> }>
  }
  stataExpectedOutput?: NonNullable<Fixture['expected']>
}

type ScreenshotFixture = {
  id: string
  stataCommand: string
  stataExpectedOutput: NonNullable<Fixture['expected']>
}

const fixtureNames = [
  'xtreg-fe',
  'xtreg-fe-robust',
  'xtreg-fe-cluster',
  'reghdfe-absorb',
  'reghdfe-robust',
  'reghdfe-cluster',
  'reghdfe-singletons',
  'reghdfe-screenshot-cluster',
]

const loadFixture = (name: string): Fixture => {
  const path = fileURLToPath(new URL(`./fixtures/stata/${name}.json`, import.meta.url))
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as Fixture

  if (fixture.dataFixture) {
    const dataPath = fileURLToPath(new URL(`./fixtures/stata/${fixture.dataFixture}`, import.meta.url))
    fixture.rows = JSON.parse(readFileSync(dataPath, 'utf8')) as Row[]
  }

  return fixture
}

const loadScreenshotFixture = (name: string): ScreenshotFixture => {
  const path = fileURLToPath(new URL(`./fixtures/stata/${name}.json`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as ScreenshotFixture
}

const summaryValue = (summary: Array<{ label: string; value: string | number }>, label: string) => {
  const value = summary.find((entry) => entry.label === label)?.value
  if (value === undefined) throw new Error(`Missing summary value: ${label}`)
  return value
}

describe('Stata fixed-effect parity fixtures', () => {
  fixtureNames.map(loadFixture).forEach((fixture) => {
    it(`matches ${fixture.id}`, () => {
      const plugin = getModelPlugin(fixture.pluginId)
      if (!fixture.rows) throw new Error(`Missing rows for fixture ${fixture.id}`)
      const result = plugin.fit({ rows: fixture.rows, config: fixture.config, inference: fixture.inference })
      const coefficients = result.tables.find((table) => table.id === 'coefficients')?.rows ?? []

      Object.entries(fixture.expected.coefficients ?? {}).forEach(([term, expected]) => {
        const row = coefficients.find((entry) => entry.term === term)
        expect(row, term).toBeDefined()
        expect(row?.coefficient, `${fixture.id}:${term}:coefficient`).toBeCloseTo(expected.coefficient, 8)
        if (expected.stdError !== undefined) expect(row?.stdError, `${fixture.id}:${term}:stdError`).toBeCloseTo(expected.stdError, 8)
        if (expected.tValue !== undefined) expect(row?.tValue, `${fixture.id}:${term}:tValue`).toBeCloseTo(expected.tValue, 6)
        if (expected.pValue !== undefined) expect(row?.pValue, `${fixture.id}:${term}:pValue`).toBeCloseTo(expected.pValue, 6)
      })

      fixture.expected.presentCoefficients?.forEach((term) => {
        expect(coefficients.some((entry) => entry.term === term), `${fixture.id}:${term}:present`).toBe(true)
      })

      fixture.expected.absentCoefficients?.forEach((term) => {
        expect(coefficients.some((entry) => entry.term === term), `${fixture.id}:${term}:absent`).toBe(false)
      })

      Object.entries(fixture.expected.summary ?? {}).forEach(([label, expected]) => {
        const value = summaryValue(result.summary, label)
        if (typeof expected === 'number') {
          expect(value, `${fixture.id}:${label}`).toBeCloseTo(expected, 8)
        } else {
          expect(value, `${fixture.id}:${label}`).toBe(expected)
        }
      })

      fixture.expected.finiteSummary?.forEach((label) => {
        const value = summaryValue(result.summary, label)
        expect(typeof value, `${fixture.id}:${label}:type`).toBe('number')
        expect(Number.isFinite(value), `${fixture.id}:${label}:finite`).toBe(true)
      })

      fixture.expected.warningsInclude?.forEach((text) => {
        expect(result.warnings?.some((warning) => warning.includes(text)), `${fixture.id}:warning:${text}`).toBe(true)
      })

      Object.entries(fixture.expected.tables ?? {}).forEach(([tableId, expected]) => {
        const table = result.tables.find((entry) => entry.id === tableId)
        expect(table, `${fixture.id}:table:${tableId}`).toBeDefined()
        expected.columns?.forEach((column) => {
          expect(table?.columns, `${fixture.id}:table:${tableId}:column:${column}`).toContain(column)
        })
        expected.rows?.forEach((expectedRow) => {
          const matched = table?.rows.some((row) => Object.entries(expectedRow).every(([key, value]) => row[key] === value))
          expect(matched, `${fixture.id}:table:${tableId}:row:${JSON.stringify(expectedRow)}`).toBe(true)
        })
      })
    })
  })

  it('documents the reghdfe screenshot cluster output shape', () => {
    const fixture = loadScreenshotFixture('reghdfe-screenshot-cluster')

    expect(fixture.stataCommand).toContain('reghdfe 新Y')
    expect(fixture.stataExpectedOutput.summary).toMatchObject({
      'Number of obs': 3336,
      'Number of clusters (id)': 278,
      'F(8, 277)': 13.21,
      'R-squared': 0.8974,
      'Adj R-squared': 0.8874,
      'Within R-sq.': 0.1311,
      'Root MSE': 0.0223,
    })
    expect(fixture.stataExpectedOutput.coefficients?._cons).toMatchObject({ coefficient: 0.5836332, stdError: 0.2144692 })
    expect(fixture.stataExpectedOutput.tables?.effects?.columns).toEqual(['Absorbed FE', 'Categories', 'Redundant', 'Num. Coefs', 'Nested'])
    expect(fixture.stataExpectedOutput.tables?.effects?.rows).toContainEqual({ 'Absorbed FE': 'id', Categories: 278, Redundant: 278, 'Num. Coefs': 0, Nested: '*' })
    expect(fixture.stataExpectedOutput.tables?.effects?.rows).toContainEqual({ 'Absorbed FE': 'year', Categories: 12, Redundant: 1, 'Num. Coefs': 11, Nested: '' })
    expect(fixture.stataExpectedOutput.warningsInclude).toContain('* = FE nested within cluster; treated as redundant for DoF computation')
  })
})
