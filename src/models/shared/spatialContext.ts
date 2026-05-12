import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import { paramArray, paramString } from './config'
import { cleanNumericRows, fitOls } from './regression'
import type { ModelConfig, ModelParamValue, SpatialWeightsParam } from '../types'

export type SpatialModelKind = 'sar' | 'slx' | 'sdm' | 'sem' | 'sdem' | 'sac' | 'gns' | 'panel-sdm' | 'spatial-logit'

export type SpatialWeightDiagnostics = {
  nodes: number
  weightNodes: number
  matchedNodes: number
  validEdges: number
  isolatedNodes: number
  sampleMatchRate: number
  rowStandardized: boolean
}

export type SpatialContext = {
  mode: 'sorted' | 'edge-list' | 'file'
  validWeights: number
  neighborRule: string
  weightMatrix: string
  diagnostics: SpatialWeightDiagnostics
  lagColumn(column: string, sourceRows?: Row[]): Map<number, number>
  weightMatrixForRows(sourceRows: Row[]): number[][]
}

export type SpatialRows = {
  rows: Row[]
  context: SpatialContext
  spatialKey: string
  neighborKey: string
  weightField: string
  controls: string[]
  wy: string
  wx: string[]
  wu: string
  regressors: string[]
}

const compact = (value: Row[string]) => (value === null || value === undefined || value === '' ? '' : String(value))

export const safeSpatialName = (prefix: string, column: string) => `${prefix}_${column}`.replace(/[^\w=.-]/g, '_')

export const uniqueSpatialValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

export const isSpatialWeightsParam = (value: ModelParamValue | undefined): value is SpatialWeightsParam =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'spatial-weights')

const rowStandardize = (weightsByFrom: Map<string, Array<{ to: string; weight: number }>>) => {
  const standardized = new Map<string, Array<{ to: string; weight: number }>>()

  weightsByFrom.forEach((edges, from) => {
    const mergedEdges = Array.from(
      edges.reduce((merged, edge) => merged.set(edge.to, (merged.get(edge.to) ?? 0) + edge.weight), new Map<string, number>()).entries(),
    ).map(([to, weight]) => ({ to, weight }))
    const denominator = mergedEdges.reduce((sum, edge) => sum + Math.abs(edge.weight), 0)
    if (denominator === 0) return
    standardized.set(
      from,
      mergedEdges.map((edge) => ({
        ...edge,
        weight: edge.weight / denominator,
      })),
    )
  })

  return standardized
}

const buildWeightedContext = (
  rows: Row[],
  spatialKey: string,
  weightsByFrom: Map<string, Array<{ to: string; weight: number }>>,
  sourceLabel: string,
  weightMatrix: string,
  mode: SpatialContext['mode'],
): SpatialContext => {
  const standardizedWeights = rowStandardize(weightsByFrom)
  const validWeights = Array.from(standardizedWeights.values()).reduce((sum, edges) => sum + edges.length, 0)
  const sampleKeys = uniqueSpatialValues(rows.map((row) => compact(row[spatialKey])))
  const weightKeys = new Set<string>()
  standardizedWeights.forEach((edges, from) => {
    weightKeys.add(from)
    edges.forEach((edge) => weightKeys.add(edge.to))
  })
  const matchedNodes = sampleKeys.filter((key) => weightKeys.has(key)).length
  const isolatedNodes = sampleKeys.filter((key) => (standardizedWeights.get(key)?.length ?? 0) === 0).length
  const diagnostics: SpatialWeightDiagnostics = {
    nodes: sampleKeys.length,
    weightNodes: weightKeys.size,
    matchedNodes,
    validEdges: validWeights,
    isolatedNodes,
    sampleMatchRate: sampleKeys.length === 0 ? 0 : matchedNodes / sampleKeys.length,
    rowStandardized: true,
  }

  if (validWeights === 0) throw new Error(`${sourceLabel} 没有可用的非零空间权重。`)
  if (sampleKeys.length > 0 && matchedNodes === 0) {
    throw new Error(`${sourceLabel} 与空间键 ${spatialKey} 没有匹配节点，请检查 W 文件或空间键字段。`)
  }

  const lagColumn = (column: string, sourceRows = rows) => {
    const valueGroups = new Map<string, { sum: number; count: number }>()

    sourceRows.forEach((row) => {
      const key = compact(row[spatialKey])
      const value = toNumber(row[column])
      if (!key || value === null) return
      const entry = valueGroups.get(key) ?? { sum: 0, count: 0 }
      entry.sum += value
      entry.count += 1
      valueGroups.set(key, entry)
    })

    const valueByKey = new Map(Array.from(valueGroups.entries()).map(([key, entry]) => [key, entry.sum / entry.count]))
    const lagByIndex = new Map<number, number>()

    rows.forEach((row, index) => {
      const edges = standardizedWeights.get(compact(row[spatialKey]))
      if (!edges || edges.length === 0) return
      let usedWeight = 0
      const weightedSum = edges.reduce((sum, edge) => {
        const neighborValue = valueByKey.get(edge.to)
        if (neighborValue === undefined) return sum
        usedWeight += Math.abs(edge.weight)
        return sum + edge.weight * neighborValue
      }, 0)
      if (usedWeight === 0) return
      lagByIndex.set(index, weightedSum / usedWeight)
    })

    return lagByIndex
  }

  const weightMatrixForRows = (sourceRows: Row[]) => {
    const indexesByKey = new Map<string, number[]>()
    sourceRows.forEach((row, index) => {
      const key = compact(row[spatialKey])
      if (!key) return
      indexesByKey.set(key, [...(indexesByKey.get(key) ?? []), index])
    })

    const matrix = Array.from({ length: sourceRows.length }, () => Array.from({ length: sourceRows.length }, () => 0))
    sourceRows.forEach((row, rowIndex) => {
      const edges = standardizedWeights.get(compact(row[spatialKey])) ?? []
      const presentEdges = edges
        .map((edge) => ({ edge, targetIndexes: indexesByKey.get(edge.to) ?? [] }))
        .filter((entry) => entry.targetIndexes.length > 0)
      const denominator = presentEdges.reduce((sum, entry) => sum + Math.abs(entry.edge.weight), 0)
      if (denominator === 0) return
      presentEdges.forEach(({ edge, targetIndexes }) => {
        targetIndexes.forEach((targetIndex) => {
          matrix[rowIndex][targetIndex] += edge.weight / denominator / targetIndexes.length
        })
      })
    })

    return matrix
  }

  return {
    mode,
    validWeights,
    neighborRule: sourceLabel,
    weightMatrix,
    diagnostics,
    lagColumn,
    weightMatrixForRows,
  }
}

const buildFileSpatialContext = (rows: Row[], spatialKey: string, weights: SpatialWeightsParam): SpatialContext => {
  const weightsByFrom = new Map<string, Array<{ to: string; weight: number }>>()

  if (weights.format === 'edge-list') {
    weights.edges?.forEach((edge) => {
      if (!edge.from || !edge.to || !Number.isFinite(edge.weight) || edge.weight === 0) return
      weightsByFrom.set(edge.from, [...(weightsByFrom.get(edge.from) ?? []), { to: edge.to, weight: edge.weight }])
    })
  } else if (weights.nodes && weights.matrix) {
    weights.nodes.forEach((from, rowIndex) => {
      const row = weights.matrix?.[rowIndex] ?? []
      row.forEach((weight, columnIndex) => {
        const to = weights.nodes?.[columnIndex]
        if (!to || !Number.isFinite(weight) || weight === 0) return
        weightsByFrom.set(from, [...(weightsByFrom.get(from) ?? []), { to, weight }])
      })
    })
  }

  if (weightsByFrom.size === 0) throw new Error(`空间权重文件 ${weights.fileName} 没有可用权重。`)

  return buildWeightedContext(rows, spatialKey, weightsByFrom, `独立空间权重文件：${weights.fileName} (${weights.summary})`, `file:${weights.fileName}`, 'file')
}

const buildSpatialContext = (rows: Row[], target: string, spatialKey: string, neighborKey: string, weightField: string, weights?: SpatialWeightsParam): SpatialContext => {
  if (weights) return buildFileSpatialContext(rows, spatialKey, weights)

  if (neighborKey && weightField) {
    const weightsByFrom = new Map<string, Array<{ to: string; weight: number }>>()
    rows.forEach((row) => {
      const from = compact(row[spatialKey])
      const to = compact(row[neighborKey])
      const weight = toNumber(row[weightField])
      if (!from || !to || weight === null || weight === 0) return
      weightsByFrom.set(from, [...(weightsByFrom.get(from) ?? []), { to, weight }])
    })

    return buildWeightedContext(rows, spatialKey, weightsByFrom, `边表权重：${spatialKey} -> ${neighborKey}，权重 ${weightField}`, 'edge-list', 'edge-list')
  }

  const sortedIndexes = rows
    .map((row, originalIndex) => ({ originalIndex, key: toNumber(row[spatialKey]), targetValue: toNumber(row[target]) }))
    .filter((entry): entry is { originalIndex: number; key: number; targetValue: number } => entry.key !== null && entry.targetValue !== null)
    .sort((left, right) => left.key - right.key)

  if (sortedIndexes.length < 4) throw new Error('排序邻近空间权重需要至少 4 条带数值空间键和因变量的观测。')

  const lagColumn = (column: string, sourceRows = rows) => {
    const lagByIndex = new Map<number, number>()

    sortedIndexes.forEach((entry, index) => {
      const neighbors = [sortedIndexes[index - 1], sortedIndexes[index + 1]].filter(Boolean)
      const neighborValues = neighbors
        .map((neighbor) => toNumber(sourceRows[neighbor.originalIndex]?.[column]))
        .filter((value): value is number => value !== null)

      if (neighborValues.length === 0) return
      lagByIndex.set(entry.originalIndex, neighborValues.reduce((sum, value) => sum + value, 0) / neighborValues.length)
    })

    return lagByIndex
  }

  const weightMatrixForRows = (sourceRows: Row[]) => {
    const matrix = Array.from({ length: sourceRows.length }, () => Array.from({ length: sourceRows.length }, () => 0))
    const ordered = sourceRows
      .map((row, originalIndex) => ({ originalIndex, key: toNumber(row[spatialKey]), value: toNumber(row[target]) }))
      .filter((entry): entry is { originalIndex: number; key: number; value: number } => entry.key !== null && entry.value !== null)
      .sort((left, right) => left.key - right.key)

    ordered.forEach((entry, index) => {
      const neighbors = [ordered[index - 1], ordered[index + 1]].filter(Boolean)
      if (neighbors.length === 0) return
      neighbors.forEach((neighbor) => {
        matrix[entry.originalIndex][neighbor.originalIndex] = 1 / neighbors.length
      })
    })

    return matrix
  }

  return {
    mode: 'sorted',
    validWeights: sortedIndexes.length,
    neighborRule: '按空间键排序的前后邻近均值',
    weightMatrix: 'sorted-neighbor',
    diagnostics: {
      nodes: sortedIndexes.length,
      weightNodes: sortedIndexes.length,
      matchedNodes: sortedIndexes.length,
      validEdges: sortedIndexes.length,
      isolatedNodes: 0,
      sampleMatchRate: 1,
      rowStandardized: true,
    },
    lagColumn,
    weightMatrixForRows,
  }
}

const appendLagColumns = (rows: Row[], context: SpatialContext, columns: string[]) => {
  const lagNames = uniqueSpatialValues(columns).map((column) => ({ column, lagName: safeSpatialName('W', column), lagByIndex: context.lagColumn(column) }))
  const transformedRows = rows.map((row, index) =>
    lagNames.reduce<Row>(
      (nextRow, entry) => ({
        ...nextRow,
        [entry.lagName]: entry.lagByIndex.get(index) ?? null,
      }),
      { ...row },
    ),
  )

  return {
    rows: transformedRows,
    lagNames: new Map(lagNames.map((entry) => [entry.column, entry.lagName])),
  }
}

const appendSpatialErrorLag = (rows: Row[], context: SpatialContext, target: string, controls: string[]) => {
  const residualColumn = safeSpatialName('e', target)
  const residualRows = rows.map((row) => ({ ...row }))

  if (controls.length > 0) {
    const fit = fitOls(rows, target, controls, '空间误差残差辅助回归')
    const cleanRows = cleanNumericRows(rows, target, controls)
    const residualByRow = new Map<Row, number>()
    cleanRows.forEach((entry, index) => residualByRow.set(entry.row, fit.residuals[index]))
    residualRows.forEach((row, index) => {
      row[residualColumn] = residualByRow.get(rows[index]) ?? null
    })
  } else {
    const values = rows.map((row) => toNumber(row[target])).filter((value): value is number => value !== null)
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
    residualRows.forEach((row) => {
      const value = toNumber(row[target])
      row[residualColumn] = value === null ? null : value - mean
    })
  }

  const lagName = safeSpatialName('W', residualColumn)
  const lagByIndex = context.lagColumn(residualColumn, residualRows)

  return residualRows.map((row, index) => ({
    ...row,
    [lagName]: lagByIndex.get(index) ?? null,
  })) as Row[]
}

export const makeSpatialRows = (rows: Row[], config: ModelConfig, kind: SpatialModelKind): SpatialRows => {
  const spatialKey = paramString(config, 'spatialKey', config.features[0])
  const neighborKey = paramString(config, 'neighborKey')
  const weightField = paramString(config, 'weightField')
  const spatialWeights = isSpatialWeightsParam(config.params?.spatialWeights) ? config.params.spatialWeights : undefined
  const controls = paramArray(config, 'controls', config.features.slice(1)).filter((feature) => ![spatialKey, neighborKey, weightField].includes(feature))
  if (!config.target || !spatialKey) throw new Error('空间计量模型需要选择 Y 和空间键。')

  const context = buildSpatialContext(rows, config.target, spatialKey, neighborKey, weightField, spatialWeights)
  const needsWy = ['sar', 'sdm', 'sac', 'gns', 'panel-sdm', 'spatial-logit'].includes(kind)
  const needsWx = ['slx', 'sdm', 'sdem', 'gns', 'panel-sdm', 'spatial-logit'].includes(kind)
  const needsWu = ['sem', 'sdem', 'sac', 'gns'].includes(kind)
  const lagBaseColumns = [...(needsWy ? [config.target] : []), ...(needsWx ? controls : [])]
  const withLags = appendLagColumns(rows, context, lagBaseColumns)
  const wy = withLags.lagNames.get(config.target) ?? ''
  const wx = controls.map((control) => withLags.lagNames.get(control)).filter((value): value is string => Boolean(value))
  const withErrorLag = needsWu ? appendSpatialErrorLag(withLags.rows, context, config.target, controls) : withLags.rows
  const wu = needsWu ? safeSpatialName('W', safeSpatialName('e', config.target)) : ''

  let regressors: string[] = []
  if (kind === 'sar') regressors = [wy, ...controls]
  if (kind === 'slx') regressors = [...controls, ...wx]
  if (kind === 'sdm' || kind === 'panel-sdm' || kind === 'spatial-logit') regressors = [wy, ...controls, ...wx]
  if (kind === 'sem') regressors = [...controls, wu]
  if (kind === 'sdem') regressors = [...controls, ...wx, wu]
  if (kind === 'sac') regressors = [wy, ...controls, wu]
  if (kind === 'gns') regressors = [wy, ...controls, ...wx, wu]

  regressors = uniqueSpatialValues(regressors)
  if (regressors.length === 0) throw new Error('空间计量模型需要至少一个可估计的空间项或解释变量。')

  return {
    rows: withErrorLag,
    context,
    spatialKey,
    neighborKey,
    weightField,
    controls,
    wy,
    wx,
    wu,
    regressors,
  }
}
