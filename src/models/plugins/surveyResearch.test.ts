import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Row } from '../../data/types'
import { getModelPlugin } from '../registry'
import type { InferenceConfig, ModelConfig, ModelResult } from '../types'

type NumericExpectation = {
  equals?: string | number
  closeTo?: number
  greaterThan?: number
  greaterThanOrEqual?: number
  precision?: number
}

type TableExpectation = {
  rowCount?: number
  finiteColumns?: string[]
  rows?: Array<{
    match: Record<string, string | number>
    values?: Record<string, NumericExpectation>
  }>
}

type MethodFixture = {
  id: string
  pluginId: string
  description: string
  rows?: Row[]
  useRowsFrom?: string
  config: ModelConfig
  inference?: InferenceConfig
  expected: {
    summary?: Record<string, NumericExpectation>
    tables?: Record<string, TableExpectation>
    warningsInclude?: string[]
  }
}

const surveyPluginIds = new Set(['reliability-analysis', 'item-analysis', 'multiple-response-analysis', 'nps-analysis', 'content-validity'])
const fixturePath = fileURLToPath(new URL('../../../tests/fixtures/model-methods/phase1-method-fixtures.json', import.meta.url))
const fixturePack = JSON.parse(readFileSync(fixturePath, 'utf8')) as { fixtures: MethodFixture[] }
const fixtureById = new Map(fixturePack.fixtures.map((fixture) => [fixture.id, fixture]))
const surveyFixtures = fixturePack.fixtures.filter((fixture) => surveyPluginIds.has(fixture.pluginId))

const assertExpectation = (actual: string | number | undefined, expectation: NumericExpectation, label: string) => {
  expect(actual, label).not.toBeUndefined()
  if (expectation.equals !== undefined) expect(actual, label).toBe(expectation.equals)
  if (expectation.closeTo !== undefined) {
    expect(typeof actual, label).toBe('number')
    expect(actual as number, label).toBeCloseTo(expectation.closeTo, expectation.precision ?? 10)
  }
  if (expectation.greaterThan !== undefined) {
    expect(typeof actual, label).toBe('number')
    expect(actual as number, label).toBeGreaterThan(expectation.greaterThan)
  }
  if (expectation.greaterThanOrEqual !== undefined) {
    expect(typeof actual, label).toBe('number')
    expect(actual as number, label).toBeGreaterThanOrEqual(expectation.greaterThanOrEqual)
  }
}

const assertFiniteNumbers = (result: ModelResult) => {
  result.summary.forEach((entry) => {
    if (typeof entry.value === 'number') expect(Number.isFinite(entry.value), `summary:${entry.label}`).toBe(true)
  })
  result.tables.forEach((table) => {
    table.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([column, value]) => {
        if (typeof value === 'number') expect(Number.isFinite(value), `${table.id}:${rowIndex}:${column}`).toBe(true)
      })
    })
  })
}

const resolveRows = (fixture: MethodFixture) => {
  if (fixture.rows) return fixture.rows
  const source = fixture.useRowsFrom ? fixtureById.get(fixture.useRowsFrom) : undefined
  if (!source?.rows) throw new Error(`Missing rows for fixture ${fixture.id}`)
  return source.rows
}

const assertFixture = (fixture: MethodFixture) => {
  const plugin = getModelPlugin(fixture.pluginId)
  const result = plugin.fit({ rows: resolveRows(fixture), config: fixture.config, inference: fixture.inference })

  expect(result.id).toBe(fixture.pluginId)
  assertFiniteNumbers(result)

  Object.entries(fixture.expected.summary ?? {}).forEach(([label, expectation]) => {
    assertExpectation(result.summary.find((entry) => entry.label === label)?.value, expectation, `${fixture.id}:summary:${label}`)
  })

  Object.entries(fixture.expected.tables ?? {}).forEach(([tableId, expectation]) => {
    const table = result.tables.find((entry) => entry.id === tableId)
    expect(table, `${fixture.id}:table:${tableId}`).toBeDefined()
    if (!table) return
    if (expectation.rowCount !== undefined) expect(table.rows, `${fixture.id}:table:${tableId}:rows`).toHaveLength(expectation.rowCount)
    expectation.finiteColumns?.forEach((column) => {
      table.rows.forEach((row, index) => expect(Number.isFinite(Number(row[column])), `${fixture.id}:table:${tableId}:${index}:${column}`).toBe(true))
    })
    expectation.rows?.forEach((expectedRow) => {
      const row = table.rows.find((candidate) => Object.entries(expectedRow.match).every(([column, value]) => candidate[column] === value))
      expect(row, `${fixture.id}:table:${tableId}:row:${JSON.stringify(expectedRow.match)}`).toBeDefined()
      Object.entries(expectedRow.values ?? {}).forEach(([column, valueExpectation]) => {
        assertExpectation(row?.[column], valueExpectation, `${fixture.id}:table:${tableId}:${column}`)
      })
    })
  })

  fixture.expected.warningsInclude?.forEach((text) => {
    expect(result.warnings?.some((warning) => warning.includes(text)), `${fixture.id}:warning:${text}`).toBe(true)
  })
}

describe('survey research plugins', () => {
  surveyFixtures.forEach((fixture) => {
    it(`matches fixture: ${fixture.id}`, () => {
      assertFixture(fixture)
    })
  })

  it('rejects reliability analysis with fewer than two items', () => {
    const plugin = getModelPlugin('reliability-analysis')

    expect(() => plugin.fit({ rows: [{ q1: 1 }, { q1: 2 }, { q1: 3 }], config: { target: '', features: ['q1'], params: { items: ['q1'] } } })).toThrow(
      /至少需要 2 个题项/,
    )
  })
})
