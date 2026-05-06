import { toNumber } from './tableUtils'
import type { Row, VariableProfile } from './types'
import type { ModelConfig } from '../models/types'

export type MissingStrategy = 'drop' | 'mean' | 'median'
export type CategoricalEncoding = 'one-hot' | 'none'

export type DataPrepConfig = {
  missingStrategy: MissingStrategy
  categoricalEncoding: CategoricalEncoding
}

export type RunLogEntry = {
  level: 'info' | 'warning'
  message: string
}

export type PreparedModelData = {
  rows: Row[]
  config: ModelConfig
  logs: RunLogEntry[]
}

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const safeFeatureName = (feature: string, category: string) =>
  `${feature}=${category}`.replace(/\s+/g, '_').replace(/[^\w=.-]/g, '')

export const prepareModelData = (
  rows: Row[],
  profiles: VariableProfile[],
  config: ModelConfig,
  prepConfig: DataPrepConfig,
  supportsCategoricalFeatures: boolean,
  preserveColumns: string[] = [],
): PreparedModelData => {
  const profileMap = new Map(profiles.map((profile) => [profile.name, profile]))
  const numericFeatures = config.features.filter((feature) => profileMap.get(feature)?.type === 'numeric')
  const categoricalFeatures = config.features.filter((feature) => profileMap.get(feature)?.type === 'category')
  const usableCategoricalFeatures =
    supportsCategoricalFeatures && prepConfig.categoricalEncoding === 'one-hot' ? categoricalFeatures : []
  const ignoredCategoricalFeatures = categoricalFeatures.filter((feature) => !usableCategoricalFeatures.includes(feature))
  const logs: RunLogEntry[] = [
    { level: 'info', message: `原始数据 ${rows.length} 行，目标变量 ${config.target || '无'}。` },
  ]

  if (ignoredCategoricalFeatures.length > 0) {
    logs.push({
      level: 'warning',
      message: `已忽略未编码分类变量：${ignoredCategoricalFeatures.join(', ')}。`,
    })
  }

  const numericFillValues = new Map<string, number>()

  if (prepConfig.missingStrategy !== 'drop') {
    numericFeatures.filter(Boolean).forEach((feature) => {
      const values = rows.map((row) => toNumber(row[feature])).filter((value): value is number => value !== null)
      if (values.length > 0) {
        numericFillValues.set(feature, prepConfig.missingStrategy === 'mean' ? mean(values) : median(values))
      }
    })
    logs.push({
      level: 'info',
      message: `自变量数值缺失使用${prepConfig.missingStrategy === 'mean' ? '均值' : '中位数'}填充；目标变量缺失仍会删除。`,
    })
  } else {
    logs.push({ level: 'info', message: '含缺失的建模行会在运行前删除。' })
  }

  const categoryLevels = new Map<string, string[]>()
  usableCategoricalFeatures.forEach((feature) => {
    const levels = Array.from(
      new Set(
        rows
          .map((row) => row[feature])
          .filter((value) => value !== null && value !== '')
          .map((value) => String(value)),
      ),
    ).sort()
    categoryLevels.set(feature, levels)

    if (levels.length > 1) {
      logs.push({
        level: 'info',
        message: `${feature} one-hot 编码为 ${levels.length - 1} 个虚拟变量，基准组：${levels[0]}。`,
      })
    }
  })

  const encodedFeatureNames = usableCategoricalFeatures.flatMap((feature) => {
    const levels = categoryLevels.get(feature) ?? []
    return levels.slice(1).map((level) => safeFeatureName(feature, level))
  })
  const preparedFeatures = [...numericFeatures, ...encodedFeatureNames]
  let droppedRows = 0

  const preparedRows = rows.flatMap((row) => {
    const nextRow: Row = {}
    const targetValue = toNumber(row[config.target])

    if (targetValue === null) {
      droppedRows += 1
      return []
    }

    nextRow[config.target] = targetValue
    preserveColumns.forEach((column) => {
      nextRow[column] = row[column] ?? null
    })

    for (const feature of numericFeatures) {
      const value = toNumber(row[feature])
      const fillValue = numericFillValues.get(feature)

      if (value === null && (prepConfig.missingStrategy === 'drop' || fillValue === undefined)) {
        droppedRows += 1
        return []
      }

      nextRow[feature] = value ?? fillValue ?? null
    }

    for (const feature of usableCategoricalFeatures) {
      const levels = categoryLevels.get(feature) ?? []
      const rawValue = row[feature]

      if ((rawValue === null || rawValue === '') && prepConfig.missingStrategy === 'drop') {
        droppedRows += 1
        return []
      }

      const category = rawValue === null || rawValue === '' ? '__missing__' : String(rawValue)
      levels.slice(1).forEach((level) => {
        nextRow[safeFeatureName(feature, level)] = category === level ? 1 : 0
      })
    }

    return [nextRow]
  })

  if (droppedRows > 0) {
    logs.push({ level: 'warning', message: `预处理删除 ${droppedRows} 行，保留 ${preparedRows.length} 行进入模型。` })
  } else {
    logs.push({ level: 'info', message: `预处理保留全部 ${preparedRows.length} 行进入模型。` })
  }

  if (preparedFeatures.length !== config.features.length) {
    logs.push({ level: 'info', message: `模型实际使用 ${preparedFeatures.length} 个数值特征。` })
  }

  if (preserveColumns.length > 0) {
    logs.push({ level: 'info', message: `已保留推断设置字段：${preserveColumns.join(', ')}。` })
  }

  return {
    rows: preparedRows,
    config: {
      target: config.target,
      features: preparedFeatures,
      params: config.params,
    },
    logs,
  }
}
