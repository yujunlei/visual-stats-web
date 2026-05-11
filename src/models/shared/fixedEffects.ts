import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import type { InferenceConfig } from '../types'

type AbsorbInput = {
  rows: Row[]
  target: string
  regressors: string[]
  fixedEffects: string[]
  prefix: string
  preserveColumns?: string[]
  tolerance?: number
  maxIterations?: number
  dropSingletons?: boolean
}

const compact = (value: Row[string]) => (value === null || value === undefined || value === '' ? '' : String(value))

const residualName = (prefix: string, column: string) => `${prefix}_${column}`.replace(/[^\w=.-]/g, '_')

const residualNames = (prefix: string, columns: string[]) => {
  const used = new Map<string, number>()

  return columns.map((column, index) => {
    const base = residualName(prefix, column) || `${prefix}_${index}`
    const count = used.get(base) ?? 0
    used.set(base, count + 1)

    return count === 0 ? base : `${base}_${count + 1}`
  })
}

export const formatXtregCommand = (target: string, regressors: string[], panelId: string, inference?: InferenceConfig) => {
  const vce = inference?.standardError === 'robust' ? ' vce(robust)' : inference?.standardError === 'cluster' && inference.clusterField ? ` vce(cluster ${inference.clusterField})` : ''

  return `xtreg ${target || 'y'} ${regressors.join(' ') || 'x'}, fe i(${panelId || 'id'})${vce}`
}

export const formatReghdfeCommand = (target: string, regressors: string[], fixedEffects: string[], inference?: InferenceConfig) => {
  const vce = inference?.standardError === 'robust' ? ' vce(robust)' : inference?.standardError === 'cluster' && inference.clusterField ? ` vce(cluster ${inference.clusterField})` : ''

  return `reghdfe ${target || 'y'} ${regressors.join(' ') || 'x'}, absorb(${fixedEffects.join(' ') || 'fe'})${vce}`
}

export const nestedFixedEffectsInCluster = (rows: Row[], fixedEffects: string[], clusterField?: string) => {
  if (!clusterField) return []

  return fixedEffects.filter((effect) => {
    const clustersByEffect = new Map<string, Set<string>>()

    rows.forEach((row) => {
      const effectValue = compact(row[effect])
      const clusterValue = compact(row[clusterField])
      if (!effectValue || !clusterValue) return
      const clusters = clustersByEffect.get(effectValue) ?? new Set<string>()
      clusters.add(clusterValue)
      clustersByEffect.set(effectValue, clusters)
    })

    return clustersByEffect.size > 0 && Array.from(clustersByEffect.values()).every((clusters) => clusters.size <= 1)
  })
}

export const absorbFixedEffects = ({
  rows,
  target,
  regressors,
  fixedEffects,
  prefix,
  preserveColumns = [],
  tolerance = 1e-10,
  maxIterations = 100,
  dropSingletons = false,
}: AbsorbInput) => {
  const columns = [target, ...regressors]
  let records = rows.flatMap((row) => {
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

  let singletonDropIterations = 0
  let droppedSingletonRows = 0

  if (dropSingletons) {
    while (records.length > 0) {
      const countsByEffect = fixedEffects.map((_, effectIndex) => {
        const counts = new Map<string, number>()
        records.forEach((record) => {
          const key = record.effects[effectIndex]
          counts.set(key, (counts.get(key) ?? 0) + 1)
        })
        return counts
      })
      const nextRecords = records.filter((record) => record.effects.every((key, effectIndex) => (countsByEffect[effectIndex].get(key) ?? 0) > 1))

      if (nextRecords.length === records.length) break
      droppedSingletonRows += records.length - nextRecords.length
      singletonDropIterations += 1
      records = nextRecords
    }
  }

  if (records.length <= regressors.length + 1) {
    throw new Error('固定效应模型可用观测太少，无法估计。')
  }

  const residuals = records.map((record) => [...record.values])
  let iterations = 0
  let converged = false
  let maxDelta = Number.POSITIVE_INFINITY

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    maxDelta = 0
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
        residuals[rowIndex] = residuals[rowIndex].map((value, columnIndex) => {
          const adjustment = entry.sums[columnIndex] / entry.count
          maxDelta = Math.max(maxDelta, Math.abs(adjustment))
          return value - adjustment
        })
      })
    })
    iterations = iteration + 1
    if (maxDelta < tolerance) {
      converged = true
      break
    }
  }

  const [targetName, ...featureNames] = residualNames(prefix, [target, ...regressors])
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
    sourceRows: records.map((record) => record.row),
    target: targetName,
    features: featureNames,
    observations: records.length,
    groups: groupSummaries,
    absorbedDf: groupSummaries.reduce((sum, entry) => sum + entry.absorbedDf, 0),
    iterations,
    converged,
    maxDelta,
    droppedSingletonRows,
    singletonDropIterations,
  }
}
