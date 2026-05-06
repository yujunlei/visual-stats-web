import type { ModelConfig, ModelParamValue } from '../types'

export const paramString = (config: ModelConfig, id: string, fallback = '') => {
  const value = config.params?.[id]
  if (Array.isArray(value)) return value[0] ?? fallback
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return fallback
  return value ?? fallback
}

export const paramArray = (config: ModelConfig, id: string, fallback: string[] = []) => {
  const value = config.params?.[id]
  if (Array.isArray(value)) return value
  return typeof value === 'string' && value ? [value] : fallback
}

export const paramNumber = (config: ModelConfig, id: string, fallback = 0) => {
  const value = config.params?.[id]
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (Array.isArray(value) || typeof value === 'object') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const compactConfig = (target: string, params: Record<string, ModelParamValue>, features: string[]) => ({
  target,
  features: features.filter(Boolean),
  params,
})
