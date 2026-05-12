import type { ModelConfig, ModelParamValue, ModelPlugin } from './types'

export type ParameterField = NonNullable<ModelPlugin['parameterSchema']>[number]

export function selectedParamValues(config: ModelConfig, field: ParameterField) {
  const value = config.params?.[field.id]
  if (field.kind === 'number') return []
  if (field.kind === 'file') return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return typeof value === 'string' && value ? [value] : []
}

export function createEmptyModelConfig(plugin: ModelPlugin | null): ModelConfig {
  const params: Record<string, ModelParamValue> = {}

  plugin?.parameterSchema?.forEach((field) => {
    if (field.kind === 'number') {
      params[field.id] = field.defaultValue ?? 0
    } else if (field.kind === 'columns') {
      params[field.id] = []
    } else {
      params[field.id] = ''
    }
  })

  return { target: '', features: [], params }
}

export function removeImplicitColumnDefaults(
  plugin: ModelPlugin,
  sourceConfig: ModelConfig,
  sanitizedConfig: ModelConfig,
  featureColumns: string[],
  targetColumns: string[],
): ModelConfig {
  if (!plugin.parameterSchema) {
    return {
      ...sanitizedConfig,
      target: sourceConfig.target ? sanitizedConfig.target : '',
      features: sourceConfig.features.length > 0 ? sanitizedConfig.features : [],
    }
  }

  const params: Record<string, ModelParamValue> = { ...(sanitizedConfig.params ?? {}) }

  plugin.parameterSchema.forEach((field) => {
    if (field.kind === 'number') return

    const sourceValue = sourceConfig.params?.[field.id]
    const allowedColumns = field.role === 'target' ? targetColumns : featureColumns

    if (field.kind === 'columns') {
      params[field.id] = Array.isArray(sourceValue) ? sourceValue.filter((value) => allowedColumns.includes(value)) : []
      return
    }

    if (field.kind === 'column') {
      params[field.id] = typeof sourceValue === 'string' && allowedColumns.includes(sourceValue) ? sourceValue : ''
      return
    }

    params[field.id] = sourceValue ?? ''
  })

  const target = typeof params.target === 'string' ? params.target : ''

  plugin.parameterSchema.forEach((field) => {
    if (field.role !== 'feature') return

    const value = params[field.id]
    if (Array.isArray(value)) {
      params[field.id] = value.filter((fieldName) => fieldName !== target)
    } else if (typeof value === 'string' && value === target) {
      params[field.id] = ''
    }
  })

  const explicitFeatureFields = new Set(
    plugin.parameterSchema
      .filter((field) => field.kind !== 'number' && field.kind !== 'file' && field.role === 'feature')
      .flatMap((field) => selectedParamValues({ ...sanitizedConfig, params }, field)),
  )
  const features = sanitizedConfig.features.filter((field) => explicitFeatureFields.has(field) && field !== target)

  return {
    ...sanitizedConfig,
    params,
    target,
    features,
  }
}
