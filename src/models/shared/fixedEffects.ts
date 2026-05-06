import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'

type AbsorbInput = {
  rows: Row[]
  target: string
  regressors: string[]
  fixedEffects: string[]
  prefix: string
  preserveColumns?: string[]
}

const compact = (value: Row[string]) => (value === null || value === undefined || value === '' ? '' : String(value))

const residualName = (prefix: string, column: string) => `${prefix}_${column}`.replace(/[^\w=.-]/g, '_')

export const absorbFixedEffects = ({ rows, target, regressors, fixedEffects, prefix, preserveColumns = [] }: AbsorbInput) => {
  const columns = [target, ...regressors]
  const records = rows.flatMap((row) => {
    const values = columns.map((column) => toNumber(row[column]))
    const effects = fixedEffects.map((effect) => compact(row[effect]))

    if (values.some((value) => value === null) || effects.some((effect) => !effect)) return []

    return [
      {
        row,
        values: values as number[],
        effects,
      },
    ]
  })

  if (records.length <= regressors.length + 1) {
    throw new Error('固定效应模型可用观测太少，无法估计。')
  }

  const residuals = records.map((record) => [...record.values])
  const iterations = Math.max(1, Math.min(12, fixedEffects.length * 5))

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    fixedEffects.forEach((_, effectIndex) => {
      const groups = new Map<string, { count: number; sums: number[] }>()

      records.forEach((record, rowIndex) => {
        const key = record.effects[effectIndex]
        const entry = groups.get(key) ?? { count: 0, sums: Array.from({ length: columns.length }, () => 0) }
        entry.count += 1
        residuals[rowIndex].forEach((value, columnIndex) => {
          entry.sums[columnIndex] += value
        })
        groups.set(key, entry)
      })

      records.forEach((record, rowIndex) => {
        const entry = groups.get(record.effects[effectIndex])
        if (!entry) return
        residuals[rowIndex] = residuals[rowIndex].map((value, columnIndex) => value - entry.sums[columnIndex] / entry.count)
      })
    })
  }

  const targetName = residualName(prefix, target)
  const featureNames = regressors.map((regressor) => residualName(prefix, regressor))
  const transformedRows = residuals.map((values, rowIndex) =>
    values.reduce<Row>((row, value, index) => {
      row[index === 0 ? targetName : featureNames[index - 1]] = value
      preserveColumns.forEach((column) => {
        row[column] = records[rowIndex].row[column] ?? null
      })
      return row
    }, {}),
  )
  const groups = fixedEffects.map((effect) => ({
    effect,
    groups: 0,
    singletonGroups: 0,
    minObs: 0,
    maxObs: 0,
    avgObs: 0,
    absorbedDf: 0,
  }))
  const groupSummaries = groups.map((entry, index) => {
    const counts = new Map<string, number>()
    records.forEach((record) => {
      const key = record.effects[index]
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    const values = Array.from(counts.values())
    const groupCount = values.length

    return {
      effect: entry.effect,
      groups: groupCount,
      singletonGroups: values.filter((value) => value === 1).length,
      minObs: values.length > 0 ? Math.min(...values) : 0,
      maxObs: values.length > 0 ? Math.max(...values) : 0,
      avgObs: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      absorbedDf: Math.max(groupCount - 1, 0),
    }
  })

  return {
    rows: transformedRows,
    target: targetName,
    features: featureNames,
    observations: records.length,
    groups: groupSummaries,
    absorbedDf: groupSummaries.reduce((sum, entry) => sum + entry.absorbedDf, 0),
  }
}
