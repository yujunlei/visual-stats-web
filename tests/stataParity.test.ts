import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Row } from '../src/data/types'
import type { InferenceConfig, ModelConfig } from '../src/models/types'
import { getModelPlugin } from '../src/models/registry'

type Fixture = {
  id: string
  pluginId: string
  rows: Row[]
  config: ModelConfig
  inference?: InferenceConfig
  expected: {
    coefficients?: Record<string, { coefficient: number; stdError?: number; tValue?: number; pValue?: number }>
    absentCoefficients?: string[]
    summary?: Record<string, string | number>
    finiteSummary?: string[]
    warningsInclude?: string[]
  }
}

const fixtureNames = ['xtreg-fe', 'xtreg-fe-robust', 'xtreg-fe-cluster', 'reghdfe-absorb', 'reghdfe-robust', 'reghdfe-cluster', 'reghdfe-singletons']

const loadFixture = (name: string): Fixture => {
  const path = fileURLToPath(new URL(`./fixtures/stata/${name}.json`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as Fixture
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
    })
  })
})
