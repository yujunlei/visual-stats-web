import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Row } from '../src/data/types'
import type { ModelConfig, SpatialWeightsParam } from '../src/models/types'
import { getModelCatalogEntry, getModelPlugin } from '../src/models/registry'

type SpatialFixture = {
  id: string
  modelId: string
  expected: {
    n: number
    coefficients: Record<string, { coefficient: number; stdError: number | null }>
    rSquared: number | null
    pseudoR2: number | null
    logLikelihood: number | null
  }
  tolerance: {
    coefficient: number
    spatialParameter: number
    stdError: number
    rSquared: number
    logLikelihood: number
  }
}

type SpatialFixturePack = {
  rows: Row[]
  weights: SpatialWeightsParam
  matrixWeights: SpatialWeightsParam
  missingRows: Row[]
  config: ModelConfig
  fixtures: Record<'slx' | 'sar' | 'sem' | 'sdm', SpatialFixture>
  missingFixtures: Record<'slx' | 'sar' | 'sem' | 'sdm', SpatialFixture>
}

const loadFixtures = () => {
  const path = fileURLToPath(new URL('./fixtures/spatial/pysal-ring-fixtures.json', import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as SpatialFixturePack
}

const summaryValue = (summary: Array<{ label: string; value: string | number }>, label: string) => {
  const value = summary.find((entry) => entry.label === label)?.value
  if (value === undefined) throw new Error(`Missing summary value: ${label}`)
  return value
}

const closeToPySAL = (actual: unknown, expected: number, tolerance: number) => {
  expect(typeof actual).toBe('number')
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance)
}

describe('PySAL/spreg spatial fixtures', () => {
  const pack = loadFixtures()
  const edgeListConfig = {
    ...pack.config,
    params: {
      ...pack.config.params,
      spatialWeights: pack.weights,
    },
  }
  const matrixConfig = {
    ...pack.config,
    params: {
      ...pack.config.params,
      spatialWeights: pack.matrixWeights,
    },
  }

  const expectFixtureMatch = (fixture: SpatialFixture, rows: Row[], config: ModelConfig, expectedDiagnostics: Record<string, string | number>) => {
    const plugin = getModelPlugin(fixture.modelId)
    const result = plugin.fit({ rows, config })
    const coefficients = result.tables.find((table) => table.id === 'coefficients')?.rows ?? []
    const setup = result.tables.find((table) => table.id === 'spatial-setup')

    expect(result.id).toBe(fixture.modelId)
    expect(summaryValue(result.summary, 'Number of obs')).toBe(fixture.expected.n)
    expect(summaryValue(result.summary, 'Weight nodes')).toBe(expectedDiagnostics.nodes)
    expect(summaryValue(result.summary, 'Matched spatial keys')).toBe(expectedDiagnostics.matchedNodes)
    expect(summaryValue(result.summary, 'Isolated spatial keys')).toBe(expectedDiagnostics.isolatedNodes)
    expect(summaryValue(result.summary, 'Weight match rate')).toBe(expectedDiagnostics.matchRate)
    expect(setup?.columns).toEqual(expect.arrayContaining(['nodes', 'weightNodes', 'matchedNodes', 'validEdges', 'isolatedNodes', 'matchRate', 'rowStandardized']))
    expect(setup?.rows[0]).toMatchObject(expectedDiagnostics)

    Object.entries(fixture.expected.coefficients).forEach(([term, expected]) => {
      const actual = coefficients.find((row) => row.term === term)
      expect(actual, `${fixture.id}:${term}`).toBeDefined()
      const coefficientTolerance = term.startsWith('rho_') || term.startsWith('lambda_') ? fixture.tolerance.spatialParameter : fixture.tolerance.coefficient
      closeToPySAL(actual?.coefficient, expected.coefficient, coefficientTolerance)
      if (expected.stdError !== null) closeToPySAL(actual?.stdError, expected.stdError, fixture.tolerance.stdError)
    })

    if (fixture.expected.rSquared !== null) closeToPySAL(summaryValue(result.summary, 'R-squared'), fixture.expected.rSquared, fixture.tolerance.rSquared)
    if (fixture.expected.pseudoR2 !== null) closeToPySAL(summaryValue(result.summary, 'R-squared'), fixture.expected.pseudoR2, fixture.tolerance.rSquared)
    const logLikelihood = result.summary.find((entry) => entry.label === 'Log likelihood')?.value
    if (fixture.expected.logLikelihood !== null && logLikelihood !== undefined) closeToPySAL(logLikelihood, fixture.expected.logLikelihood, fixture.tolerance.logLikelihood)

    return result
  }

  ;(['slx', 'sar', 'sem', 'sdm'] as const).forEach((fixtureKey) => {
    const fixture = pack.fixtures[fixtureKey]

    it(`matches ${fixture.id} with edge-list W within fixture tolerance`, () => {
      expectFixtureMatch(fixture, pack.rows, edgeListConfig, {
        nodes: 12,
        weightNodes: 12,
        matchedNodes: 12,
        validEdges: 24,
        isolatedNodes: 0,
        matchRate: 1,
        rowStandardized: 'Yes',
      })
    })

    it(`matches ${fixture.id} with matrix W within fixture tolerance`, () => {
      expectFixtureMatch(fixture, pack.rows, matrixConfig, {
        nodes: 12,
        weightNodes: 12,
        matchedNodes: 12,
        validEdges: 24,
        isolatedNodes: 0,
        matchRate: 1,
        rowStandardized: 'Yes',
      })
    })

    it(`matches ${pack.missingFixtures[fixtureKey].id} after missing-value row removal`, () => {
      expectFixtureMatch(pack.missingFixtures[fixtureKey], pack.missingRows, edgeListConfig, {
        nodes: 12,
        weightNodes: 12,
        matchedNodes: 12,
        validEdges: 24,
        isolatedNodes: 0,
        matchRate: 1,
        rowStandardized: 'Yes',
      })
    })
  })

  it('keeps first-stage spatial models stable and complex spatial models preview', () => {
    ;['spatial-slx', 'spatial-sar', 'spatial-sem', 'spatial-sdm'].forEach((id) => {
      const entry = getModelCatalogEntry(id)
      expect(entry?.maturityLevel, id).toBe('stable')
      expect(entry?.modelVersion, id).toBe('1.0.0')
      expect(entry?.accuracyNotes, id).toContain('PySAL/spreg fixture')
    })

    ;['spatial-sdem', 'spatial-sac', 'spatial-gns', 'spatial-panel-sdm', 'spatial-logit'].forEach((id) => {
      const entry = getModelCatalogEntry(id)
      expect(entry?.maturityLevel, id).toBe('preview')
      expect(entry?.accuracyNotes, id).toContain('未完成 PySAL/spreg fixture')
    })
  })

  it('fails clearly when an uploaded W file does not match the spatial key', () => {
    const plugin = getModelPlugin('spatial-slx')
    const mismatchedConfig: ModelConfig = {
      ...edgeListConfig,
      params: {
        ...edgeListConfig.params,
        spatialWeights: {
          ...pack.weights,
          edges: [
            { from: 'Z1', to: 'Z2', weight: 1 },
            { from: 'Z2', to: 'Z1', weight: 1 },
          ],
        },
      },
    }

    expect(() => plugin.fit({ rows: pack.rows, config: mismatchedConfig })).toThrow(/没有匹配节点/)
  })
})
