import { describe, expect, it } from 'vitest'
import { createEmptyModelConfig, removeImplicitColumnDefaults, selectedParamValues } from './modelConfig'
import { linearRegressionPlugin } from './plugins/linearRegression'
import { frequencyAnalysisPlugin } from './plugins/commonMethods'
import type { ModelConfig } from './types'

describe('model config helpers', () => {
  it('creates empty column selections while preserving numeric defaults', () => {
    const config = createEmptyModelConfig(linearRegressionPlugin)

    expect(config).toEqual({
      target: '',
      features: [],
      params: {
        target: '',
        features: [],
        controls: [],
      },
    })
  })

  it('reads selected schema parameter values', () => {
    const fields = linearRegressionPlugin.parameterSchema ?? []
    const targetField = fields.find((field) => field.id === 'target')
    const featureField = fields.find((field) => field.id === 'features')

    expect(targetField).toBeDefined()
    expect(featureField).toBeDefined()
    expect(selectedParamValues({ target: 'y', features: ['x'], params: { target: 'y', features: ['x', 'z'] } }, targetField!)).toEqual(['y'])
    expect(selectedParamValues({ target: 'y', features: ['x'], params: { target: 'y', features: ['x', 'z'] } }, featureField!)).toEqual(['x', 'z'])
  })

  it('removes plugin implicit defaults when the user has not selected variables', () => {
    const sourceConfig = createEmptyModelConfig(linearRegressionPlugin)
    const pluginSanitized = linearRegressionPlugin.sanitizeConfig(sourceConfig, ['x', 'z'], ['y'])

    const cleaned = removeImplicitColumnDefaults(linearRegressionPlugin, sourceConfig, pluginSanitized, ['x', 'z'], ['y'])

    expect(cleaned.target).toBe('')
    expect(cleaned.features).toEqual([])
    expect(cleaned.params?.target).toBe('')
    expect(cleaned.params?.features).toEqual([])
    expect(cleaned.params?.controls).toEqual([])
  })

  it('keeps target, core features, and controls semantically separate', () => {
    const sourceConfig: ModelConfig = {
      target: '',
      features: [],
      params: {
        target: 'x',
        features: ['toola'],
        controls: ['iti'],
      },
    }
    const pluginSanitized = linearRegressionPlugin.sanitizeConfig(
      { target: 'x', features: ['toola'], params: { target: 'x', features: ['toola'], controls: ['iti'] } },
      ['x', 'toola', 'iti'],
      ['x'],
    )

    const cleaned = removeImplicitColumnDefaults(linearRegressionPlugin, sourceConfig, pluginSanitized, ['x', 'toola', 'iti'], ['x'])

    expect(cleaned.target).toBe('x')
    expect(cleaned.features).toEqual(['toola'])
    expect(cleaned.params?.features).toEqual(['toola'])
    expect(cleaned.params?.controls).toEqual(['iti'])
  })

  it('does not copy invalid or target fields into schema features', () => {
    const sourceConfig: ModelConfig = {
      target: '',
      features: [],
      params: {
        target: 'x',
        features: ['x', 'toola', 'missing'],
        controls: ['toola'],
      },
    }
    const pluginSanitized: ModelConfig = {
      target: 'x',
      features: ['x', 'toola', 'missing'],
      params: {
        target: 'x',
        features: ['x', 'toola', 'missing'],
        controls: ['toola'],
      },
    }

    const cleaned = removeImplicitColumnDefaults(linearRegressionPlugin, sourceConfig, pluginSanitized, ['x', 'toola'], ['x'])

    expect(cleaned.target).toBe('x')
    expect(cleaned.features).toEqual(['toola'])
    expect(cleaned.params?.features).toEqual(['toola'])
    expect(cleaned.params?.controls).toEqual(['toola'])
  })

  it('does not backfill non-schema model defaults without explicit source fields', () => {
    const plugin = {
      ...frequencyAnalysisPlugin,
      parameterSchema: undefined,
    }
    const sourceConfig: ModelConfig = { target: '', features: [], params: {} }
    const sanitizedConfig: ModelConfig = { target: '', features: ['year'], params: { variable: 'year' } }

    const cleaned = removeImplicitColumnDefaults(plugin, sourceConfig, sanitizedConfig, ['year'], ['year'])

    expect(cleaned.features).toEqual([])
  })
})
