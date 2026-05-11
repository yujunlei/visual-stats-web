import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { absorbFixedEffects } from '../shared/fixedEffects'
import { cleanNumericRows, fitLogit, fitOls, fitOlsDroppingCollinear, olsCoefficientColumns } from '../shared/regression'
import { computeMoransI, computeSpatialImpacts, fitSpatialCombinedMl, fitSpatialErrorMl, fitSpatialLagMl, type SpatialMlFit } from '../shared/spatialEstimators'
import type { ModelConfig, ModelFitInput, ModelParamValue, ModelPlugin, ModelResult, ModelResultTable, SpatialWeightsParam } from '../types'

type SpatialModelKind = 'sar' | 'slx' | 'sdm' | 'sem' | 'sdem' | 'sac' | 'gns' | 'panel-sdm' | 'spatial-logit'

type SpatialSpec = {
  id: string
  name: string
  panelLabel: string
  resultLabel: string
  description: string
  methodLabel: string
  shortName: string
  fullName: string
  keywords: string[]
  kind: SpatialModelKind
  message: string
}

type SpatialContext = {
  mode: 'sorted' | 'edge-list' | 'file'
  validWeights: number
  neighborRule: string
  weightMatrix: string
  lagColumn(column: string, sourceRows?: Row[]): Map<number, number>
  weightMatrixForRows(sourceRows: Row[]): number[][]
}

const spatialColumns = ['model', 'spatialKey', 'neighborKey', 'weightField', 'specification', 'spatialTerms', 'validWeights', 'rSquared', 'rootMse']
const droppedColumns = ['variable', 'reason']
const effectColumns = ['effect', 'groups', 'singletonGroups', 'minObs', 'maxObs', 'avgObs', 'absorbedDf']
const logitCoefficientColumns = ['term', 'coefficient', 'stdError', 'tValue', 'pValue', 'ciLow', 'ciHigh', 'oddsRatio']
const impactColumns = ['variable', 'directEffect', 'indirectEffect', 'totalEffect', 'spilloverShare']
const moranColumns = ['metric', 'value']

const compact = (value: Row[string]) => (value === null || value === undefined || value === '' ? '' : String(value))
const safeName = (prefix: string, column: string) => `${prefix}_${column}`.replace(/[^\w=.-]/g, '_')
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
const isSpatialMlFit = (fit: ReturnType<typeof fitOls> | SpatialMlFit): fit is SpatialMlFit => 'logLikelihood' in fit
const isSpatialWeightsParam = (value: ModelParamValue | undefined): value is SpatialWeightsParam =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'spatial-weights')
const coefficientValue = (fit: ReturnType<typeof fitOls> | SpatialMlFit, term: string) => fit.coefficients.find((coefficient) => coefficient.term === term)?.coefficient ?? 0

const getSpatialSettings = (config: ModelConfig, methodLabel: string) => {
  const controls = paramArray(config, 'controls', config.features.slice(1))
  const neighborKey = paramString(config, 'neighborKey')
  const weightField = paramString(config, 'weightField')

  return [
    { label: '估计方法', value: methodLabel },
    { label: '空间键', value: paramString(config, 'spatialKey', config.features[0]) || '未选择' },
    { label: '权重矩阵', value: isSpatialWeightsParam(config.params?.spatialWeights) ? `独立文件 ${config.params.spatialWeights.fileName}` : neighborKey && weightField ? `边表权重 ${weightField}` : '排序邻近 W' },
    { label: '控制变量数', value: String(controls.length) },
  ]
}

const baseParameterSchema: NonNullable<ModelPlugin['parameterSchema']> = [
  { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
  { id: 'spatialKey', label: '空间键 / 区域 ID', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'], required: true },
  {
    id: 'neighborKey',
    label: '邻接目标字段',
    kind: 'column',
    role: 'feature',
    columnTypes: ['numeric', 'category'],
    helperText: '可选；若数据中有 from/to/weight 边表结构，选择 to 字段。',
  },
  { id: 'weightField', label: '权重字段', kind: 'column', role: 'feature', columnTypes: ['numeric'], helperText: '可选；与邻接目标字段一起生成加权 W。' },
  {
    id: 'spatialWeights',
    label: '独立空间权重文件 W',
    kind: 'file',
    accept: '.csv,.txt,.gal,.gwt,text/csv,text/plain',
    helperText: '可选；支持 edge-list: from/to/weight、GAL/GWT，或第一行/第一列为空间 ID 的方阵 CSV。',
  },
  { id: 'controls', label: '解释变量 / 控制变量 X', kind: 'columns', role: 'feature', columnTypes: ['numeric'] },
]

const panelParameterSchema: NonNullable<ModelPlugin['parameterSchema']> = [
  ...baseParameterSchema,
  { id: 'panelId', label: 'Panel ID 固定效应', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'], required: true },
  { id: 'timeField', label: 'Time 固定效应', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'] },
]

const makeDefaultConfig = (featureColumns: string[], targetColumns = featureColumns, kind: SpatialModelKind) => {
  const target = targetColumns[0] ?? ''
  const candidates = featureColumns.filter((column) => column !== target)
  const spatialKey = candidates[0] ?? ''
  const panelId = candidates.find((column) => column !== spatialKey) ?? ''
  const controls = targetColumns.filter((column) => ![target, spatialKey, panelId].includes(column)).slice(0, 4)
  const params: Record<string, ModelParamValue> = {
    target,
    spatialKey,
    neighborKey: '',
    weightField: '',
    spatialWeights: '',
    controls,
  }

  if (kind === 'panel-sdm') {
    params.panelId = panelId
    params.timeField = ''
  }

  return compactConfig(target, params, [spatialKey, panelId, ...controls])
}

const sanitizeSpatialConfig = (config: ModelConfig, featureColumns: string[], targetColumns = featureColumns, kind: SpatialModelKind) => {
  const targetCandidate = paramString(config, 'target', config.target)
  const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
  const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
  const spatialKeyCandidate = paramString(config, 'spatialKey', fallbackFeatures[0])
  const spatialKey = featureColumns.includes(spatialKeyCandidate) && spatialKeyCandidate !== target ? spatialKeyCandidate : ''
  const neighborKeyCandidate = paramString(config, 'neighborKey')
  const neighborKey = featureColumns.includes(neighborKeyCandidate) && ![target, spatialKey].includes(neighborKeyCandidate) ? neighborKeyCandidate : ''
  const weightFieldCandidate = paramString(config, 'weightField')
  const weightField = featureColumns.includes(weightFieldCandidate) && ![target, spatialKey, neighborKey].includes(weightFieldCandidate) ? weightFieldCandidate : ''
  const panelCandidate = paramString(config, 'panelId', fallbackFeatures.find((feature) => ![spatialKey, neighborKey, weightField].includes(feature)))
  const panelId = kind === 'panel-sdm' && featureColumns.includes(panelCandidate) && ![target, spatialKey, neighborKey, weightField].includes(panelCandidate) ? panelCandidate : ''
  const timeCandidate = paramString(config, 'timeField')
  const timeField = kind === 'panel-sdm' && featureColumns.includes(timeCandidate) && ![target, spatialKey, neighborKey, weightField, panelId].includes(timeCandidate) ? timeCandidate : ''
  const excluded = [target, spatialKey, neighborKey, weightField, panelId, timeField]
  const controls = paramArray(config, 'controls', fallbackFeatures)
    .filter((feature) => targetColumns.includes(feature) && !excluded.includes(feature))
    .slice(0, 7)
  const spatialWeights = isSpatialWeightsParam(config.params?.spatialWeights) ? config.params.spatialWeights : ''
  const params: Record<string, ModelParamValue> = { target, spatialKey, neighborKey, weightField, spatialWeights, controls }

  if (kind === 'panel-sdm') {
    params.panelId = panelId
    params.timeField = timeField
  }

  return compactConfig(target, params, [spatialKey, neighborKey, weightField, panelId, timeField, ...controls])
}

const rowStandardize = (weightsByFrom: Map<string, Array<{ to: string; weight: number }>>) => {
  const standardized = new Map<string, Array<{ to: string; weight: number }>>()

  weightsByFrom.forEach((edges, from) => {
    const denominator = edges.reduce((sum, edge) => sum + Math.abs(edge.weight), 0)
    if (denominator === 0) return
    standardized.set(
      from,
      edges.map((edge) => ({
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
      const weightedValue = edges.reduce((sum, edge) => {
        const neighborValue = valueByKey.get(edge.to)
        return neighborValue === undefined ? sum : sum + edge.weight * neighborValue
      }, 0)
      lagByIndex.set(index, weightedValue)
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
      edges.forEach((edge) => {
        const targetIndexes = indexesByKey.get(edge.to) ?? []
        if (targetIndexes.length === 0) return
        targetIndexes.forEach((targetIndex) => {
          matrix[rowIndex][targetIndex] += edge.weight / targetIndexes.length
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
    lagColumn,
    weightMatrixForRows,
  }
}

const appendLagColumns = (rows: Row[], context: SpatialContext, columns: string[]) => {
  const lagNames = unique(columns).map((column) => ({ column, lagName: safeName('W', column), lagByIndex: context.lagColumn(column) }))
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
  const residualColumn = safeName('e', target)
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

  const lagName = safeName('W', residualColumn)
  const lagByIndex = context.lagColumn(residualColumn, residualRows)

  return residualRows.map((row, index) => ({
    ...row,
    [lagName]: lagByIndex.get(index) ?? null,
  })) as Row[]
}

const makeSpatialRows = (rows: Row[], config: ModelConfig, kind: SpatialModelKind) => {
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
  const wu = needsWu ? safeName('W', safeName('e', config.target)) : ''

  let regressors: string[] = []
  if (kind === 'sar') regressors = [wy, ...controls]
  if (kind === 'slx') regressors = [...controls, ...wx]
  if (kind === 'sdm' || kind === 'panel-sdm' || kind === 'spatial-logit') regressors = [wy, ...controls, ...wx]
  if (kind === 'sem') regressors = [...controls, wu]
  if (kind === 'sdem') regressors = [...controls, ...wx, wu]
  if (kind === 'sac') regressors = [wy, ...controls, wu]
  if (kind === 'gns') regressors = [wy, ...controls, ...wx, wu]

  regressors = unique(regressors)
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

const formatTerm = (term: string, config: ModelConfig) => {
  if (term === safeName('W', config.target)) return `W_${config.target}`
  if (term === safeName('W', safeName('e', config.target))) return 'W_residual'
  if (term.startsWith('W_')) return term
  return term
}

const spatialSetupTable = (
  spec: SpatialSpec,
  context: SpatialContext,
  config: ModelConfig,
  spatialKey: string,
  neighborKey: string,
  weightField: string,
  spatialTerms: string[],
  fit?: { r2: number; rootMse: number },
): ModelResultTable => ({
  id: 'spatial-setup',
  title: '空间权重与模型设定',
  columns: spatialColumns,
  rows: [
    {
      model: spec.shortName,
      spatialKey,
      neighborKey: neighborKey || 'NA',
      weightField: weightField || 'NA',
      specification: getSpatialFormula(spec.kind, config),
      spatialTerms: spatialTerms.join(', ') || 'NA',
      validWeights: context.validWeights,
      rSquared: fit?.r2 ?? 'NA',
      rootMse: fit?.rootMse ?? 'NA',
    },
  ],
})

const spatialPostEstimationTables = (
  spec: SpatialSpec,
  fit: ReturnType<typeof fitOls> | SpatialMlFit,
  weights: number[][],
  controls: string[],
  wx: string[],
): ModelResultTable[] => {
  const rho = isSpatialMlFit(fit) ? fit.rho : undefined
  const effects = controls.map((variable, index) => ({
    variable,
    beta: coefficientValue(fit, variable),
    theta: wx[index] ? coefficientValue(fit, wx[index]) : 0,
  }))
  const impactRows = effects.length > 0 ? computeSpatialImpacts(weights, rho, effects) : []
  const moran = computeMoransI(weights, fit.residuals)

  return [
    ...(impactRows.length > 0 && ['sar', 'slx', 'sdm', 'sdem', 'sac', 'gns', 'panel-sdm', 'spatial-logit'].includes(spec.kind)
      ? [
          {
            id: 'spatial-impacts',
            title: '空间效应分解',
            columns: impactColumns,
            rows: impactRows,
          },
        ]
      : []),
    ...(moran
      ? [
          {
            id: 'residual-moran',
            title: '残差空间自相关诊断',
            columns: moranColumns,
            rows: [
              { metric: "Moran's I", value: moran.moransI },
              { metric: 'Expected I', value: moran.expectedI },
              { metric: 'Observations', value: moran.observations },
              { metric: 'Weight sum', value: moran.weightSum },
            ],
          },
        ]
      : []),
  ]
}

const getSpatialFormula = (kind: SpatialModelKind, config: ModelConfig) => {
  const controls = paramArray(config, 'controls', config.features.slice(1))
  const x = controls.join(' + ') || 'X'
  const panelId = paramString(config, 'panelId')
  const timeField = paramString(config, 'timeField')

  if (kind === 'sar') return `${config.target || 'y'} = rho*Wy + ${x}`
  if (kind === 'slx') return `${config.target || 'y'} = ${x} + theta*WX`
  if (kind === 'sdm') return `${config.target || 'y'} = rho*Wy + ${x} + theta*WX`
  if (kind === 'sem') return `${config.target || 'y'} = ${x}, u = lambda*Wu + e`
  if (kind === 'sdem') return `${config.target || 'y'} = ${x} + theta*WX, u = lambda*Wu + e`
  if (kind === 'sac') return `${config.target || 'y'} = rho*Wy + ${x}, u = lambda*Wu + e`
  if (kind === 'gns') return `${config.target || 'y'} = rho*Wy + ${x} + theta*WX, u = lambda*Wu + e`
  if (kind === 'panel-sdm') return `${config.target || 'y'} = rho*Wy + ${x} + theta*WX + FE(${[panelId, timeField].filter(Boolean).join(', ') || 'panel'})`
  return `logit(${config.target || 'y'}) = rho*Wy + ${x} + theta*WX`
}

const fitSpatialOls = (spec: SpatialSpec, input: ModelFitInput) => {
  const spatial = makeSpatialRows(input.rows, input.config, spec.kind)
  const spatialTerms = [spatial.wy, ...spatial.wx, spatial.wu].filter(Boolean).map((term) => formatTerm(term, input.config))
  const mlKinds = new Set<SpatialModelKind>(['sar', 'sdm', 'sem', 'sdem', 'sac', 'gns'])
  const mlFeatureMap: Record<string, string[]> = {
    sar: spatial.controls,
    sdm: [...spatial.controls, ...spatial.wx],
    sem: spatial.controls,
    sdem: [...spatial.controls, ...spatial.wx],
    sac: spatial.controls,
    gns: [...spatial.controls, ...spatial.wx],
  }
  const mlFeatures = mlFeatureMap[spec.kind]
  const fit =
    mlKinds.has(spec.kind) && mlFeatures
      ? (() => {
          const estimationRows = cleanNumericRows(spatial.rows, input.config.target, mlFeatures).map((entry) => entry.row)
          const weights = spatial.context.weightMatrixForRows(estimationRows)
          if (spec.kind === 'sar' || spec.kind === 'sdm') return fitSpatialLagMl(estimationRows, input.config.target, mlFeatures, weights, spec.name)
          if (spec.kind === 'sem' || spec.kind === 'sdem') return fitSpatialErrorMl(estimationRows, input.config.target, mlFeatures, weights, spec.name)
          return fitSpatialCombinedMl(estimationRows, input.config.target, mlFeatures, weights, spec.name)
        })()
      : fitOls(spatial.rows, input.config.target, spatial.regressors, spec.name, input.inference)
  const isMlFit = isSpatialMlFit(fit)
  const postFeatures = mlKinds.has(spec.kind) && mlFeatures ? mlFeatures : spatial.regressors
  const postRows = cleanNumericRows(spatial.rows, input.config.target, postFeatures).map((entry) => entry.row)
  const postWeights = spatial.context.weightMatrixForRows(postRows)

  return {
    id: spec.id,
    summary: [
      { label: 'Number of obs', value: fit.n },
      { label: 'Spatial terms', value: spatialTerms.length },
      { label: 'Weight matrix', value: spatial.context.weightMatrix },
      { label: 'Valid weights', value: spatial.context.validWeights },
      { label: 'R-squared', value: fit.r2 },
      { label: 'Adj R-squared', value: fit.adjustedR2 },
      { label: 'Root MSE', value: fit.rootMse },
      ...(isMlFit
        ? [
            { label: 'Log likelihood', value: fit.logLikelihood },
            { label: 'Estimator', value: 'Spatial ML' },
          ]
        : [{ label: 'Std. error', value: fit.standardError === 'cluster' ? `Cluster ${fit.clusterField}` : fit.standardError }]),
    ],
    tables: [
      spatialSetupTable(spec, spatial.context, input.config, spatial.spatialKey, spatial.neighborKey, spatial.weightField, spatialTerms, fit),
      {
        id: 'coefficients',
        title: `${spec.shortName} 系数估计 (${input.config.target})`,
        columns: olsCoefficientColumns,
        rows: fit.coefficients.map((row) => ({ ...row, term: formatTerm(row.term, input.config) })),
      },
      ...spatialPostEstimationTables(spec, fit, postWeights, spatial.controls, spatial.wx),
    ],
    diagnostics: [
      {
        id: `${spec.id}-actual-vs-fitted`,
        title: `${spec.shortName} 拟合诊断`,
        kind: 'actual-vs-fitted',
        actual: fit.actual,
        fitted: fit.fitted,
      },
    ],
    warnings: fit.warnings,
    message: isMlFit
      ? `${spec.message} 已接入独立 W/内置 W 的空间集中最大似然估计，并输出空间效应分解与残差 Moran's I 后估计。`
      : `${spec.message} 当前模型按空间滞后解释变量构造后使用 OLS 估计；上传独立 W 文件时会优先使用文件权重。`,
  } satisfies ModelResult
}

const fitSpatialPanel = (spec: SpatialSpec, input: ModelFitInput) => {
  const spatial = makeSpatialRows(input.rows, input.config, spec.kind)
  const panelId = paramString(input.config, 'panelId')
  const timeField = paramString(input.config, 'timeField')
  const fixedEffects = [panelId, timeField].filter(Boolean)

  if (!panelId) throw new Error('空间面板模型需要选择 Panel ID。')
  if (fixedEffects.length === 0) throw new Error('空间面板模型需要至少一个固定效应字段。')

  const preserved = input.inference?.standardError === 'cluster' && input.inference.clusterField ? [input.inference.clusterField] : []
  const absorbed = absorbFixedEffects({
    rows: spatial.rows,
    target: input.config.target,
    regressors: spatial.regressors,
    fixedEffects,
    prefix: 'spfe',
    preserveColumns: preserved,
  })
  const { fit, droppedFeatures, features } = fitOlsDroppingCollinear(absorbed.rows, absorbed.target, absorbed.features, spec.name, input.inference)
  const activeTerms = fit.coefficients.map((row) => spatial.regressors[absorbed.features.indexOf(row.term)] ?? row.term)
  const spatialTerms = [spatial.wy, ...spatial.wx].filter(Boolean).map((term) => formatTerm(term, input.config))

  return {
    id: spec.id,
    summary: [
      { label: 'Number of obs', value: absorbed.observations },
      { label: 'Fixed effects', value: fixedEffects.join(', ') },
      { label: 'Spatial terms', value: spatialTerms.length },
      { label: 'Absorbed df', value: absorbed.absorbedDf },
      { label: 'Within R2', value: fit.r2 },
      { label: 'Root MSE', value: fit.rootMse },
      { label: 'Dropped terms', value: droppedFeatures.length },
    ],
    tables: [
      spatialSetupTable(spec, spatial.context, input.config, spatial.spatialKey, spatial.neighborKey, spatial.weightField, spatialTerms, fit),
      {
        id: 'effects',
        title: '吸收固定效应',
        columns: effectColumns,
        rows: absorbed.groups,
      },
      ...(droppedFeatures.length > 0
        ? [
            {
              id: 'dropped',
              title: '共线变量处理',
              columns: droppedColumns,
              rows: droppedFeatures.map((variable) => ({ variable: spatial.regressors[absorbed.features.indexOf(variable)] ?? variable, reason: '固定效应吸收后共线' })),
            },
          ]
        : []),
      {
        id: 'coefficients',
        title: `${spec.shortName} 固定效应系数`,
        columns: olsCoefficientColumns,
        rows: fit.coefficients.map((row, index) => ({
          ...row,
          term: index === 0 ? '_cons' : formatTerm(activeTerms[index], input.config),
        })),
      },
    ],
    diagnostics: [
      {
        id: `${spec.id}-actual-vs-fitted`,
        title: `${spec.shortName} 组内拟合诊断`,
        kind: 'actual-vs-fitted',
        actual: fit.actual,
        fitted: fit.fitted,
      },
    ],
    warnings: [...fit.warnings, ...(features.length < absorbed.features.length ? ['固定效应估计中部分空间项因共线被自动剔除。'] : [])],
    message: `${spec.message} 当前采用先构造空间滞后项、再吸收固定效应的近似流程。`,
  } satisfies ModelResult
}

const fitSpatialLogit = (spec: SpatialSpec, input: ModelFitInput) => {
  const spatial = makeSpatialRows(input.rows, input.config, spec.kind)
  const fit = fitLogit(spatial.rows, input.config.target, spatial.regressors, spec.name)
  const spatialTerms = [spatial.wy, ...spatial.wx].filter(Boolean).map((term) => formatTerm(term, input.config))

  return {
    id: spec.id,
    summary: [
      { label: 'Number of obs', value: fit.n },
      { label: 'Positive y', value: fit.positives },
      { label: 'Negative y', value: fit.negatives },
      { label: 'Spatial terms', value: spatialTerms.length },
      { label: 'Weight matrix', value: spatial.context.weightMatrix },
      { label: 'Pseudo R2', value: fit.pseudoR2 },
      { label: 'Accuracy', value: fit.accuracy },
    ],
    tables: [
      spatialSetupTable(spec, spatial.context, input.config, spatial.spatialKey, spatial.neighborKey, spatial.weightField, spatialTerms),
      {
        id: 'coefficients',
        title: `${spec.shortName} 系数估计 (${input.config.target})`,
        columns: logitCoefficientColumns,
        rows: fit.coefficients.map((row) => ({ ...row, term: formatTerm(row.term, input.config) })),
      },
    ],
    diagnostics: [],
    message: `${spec.message} 当前为带空间滞后解释项的 Logit 原型估计，因变量数值大于 0 视为 1。`,
  } satisfies ModelResult
}

const spatialSpecs: SpatialSpec[] = [
  {
    id: 'spatial-sar',
    name: '空间滞后模型',
    panelLabel: 'Spatial Lag Model',
    resultLabel: 'SAR 系数',
    description: '包含因变量空间滞后项 Wy 的空间自回归模型。',
    methodLabel: 'Spatial Lag OLS',
    shortName: 'SAR',
    fullName: 'Spatial Autoregressive / Spatial Lag Model',
    keywords: ['spatial', 'sar', 'slm', '空间滞后', '空间自回归'],
    kind: 'sar',
    message: 'SAR 用于检验相邻地区因变量的空间溢出。',
  },
  {
    id: 'spatial-slx',
    name: '空间滞后解释变量模型',
    panelLabel: 'Spatial Lag of X',
    resultLabel: 'SLX 系数',
    description: '包含解释变量空间滞后项 WX，适合估计外部解释变量的空间溢出。',
    methodLabel: 'SLX OLS',
    shortName: 'SLX',
    fullName: 'Spatial Lag of X Model',
    keywords: ['spatial', 'slx', 'wx', '空间解释变量滞后'],
    kind: 'slx',
    message: 'SLX 用于估计解释变量的邻近影响。',
  },
  {
    id: 'spatial-sdm',
    name: '空间杜宾模型',
    panelLabel: 'Spatial Durbin Model',
    resultLabel: 'SDM 系数',
    description: '同时包含 Wy 和 WX，是应用最广的空间溢出基准模型之一。',
    methodLabel: 'Spatial Durbin OLS',
    shortName: 'SDM',
    fullName: 'Spatial Durbin Model',
    keywords: ['spatial', 'sdm', 'durbin', '空间杜宾'],
    kind: 'sdm',
    message: 'SDM 同时展示因变量和解释变量的空间溢出。',
  },
  {
    id: 'spatial-sem',
    name: '空间误差模型',
    panelLabel: 'Spatial Error Model',
    resultLabel: 'SEM 系数',
    description: '用空间滞后残差 Wu 近似刻画误差项空间相关。',
    methodLabel: 'Spatial Error Approx.',
    shortName: 'SEM',
    fullName: 'Spatial Error Model',
    keywords: ['spatial', 'sem', 'error', '空间误差'],
    kind: 'sem',
    message: 'SEM 用于识别遗漏空间因素导致的误差相关。',
  },
  {
    id: 'spatial-sdem',
    name: '空间杜宾误差模型',
    panelLabel: 'Spatial Durbin Error Model',
    resultLabel: 'SDEM 系数',
    description: '同时包含 WX 和空间误差项 Wu。',
    methodLabel: 'SDEM Approx.',
    shortName: 'SDEM',
    fullName: 'Spatial Durbin Error Model',
    keywords: ['spatial', 'sdem', 'durbin error', '空间杜宾误差'],
    kind: 'sdem',
    message: 'SDEM 同时刻画解释变量溢出和误差项空间相关。',
  },
  {
    id: 'spatial-sac',
    name: '空间自回归组合模型',
    panelLabel: 'Spatial SAC / SARAR',
    resultLabel: 'SAC 系数',
    description: '同时包含 Wy 和空间误差项 Wu，也常称 SARAR。',
    methodLabel: 'SAC Approx.',
    shortName: 'SAC',
    fullName: 'Spatial Autoregressive Combined / SARAR Model',
    keywords: ['spatial', 'sac', 'sarar', '空间组合模型'],
    kind: 'sac',
    message: 'SAC/SARAR 同时刻画因变量空间滞后和误差空间相关。',
  },
  {
    id: 'spatial-gns',
    name: '一般嵌套空间模型',
    panelLabel: 'General Nesting Spatial',
    resultLabel: 'GNS 系数',
    description: '同时包含 Wy、WX 和 Wu，可作为 SAR/SDM/SEM/SAC 的上位嵌套原型。',
    methodLabel: 'GNS Approx.',
    shortName: 'GNS',
    fullName: 'General Nesting Spatial Model',
    keywords: ['spatial', 'gns', 'general nesting', '一般嵌套空间模型'],
    kind: 'gns',
    message: 'GNS 是最完整的常见空间计量嵌套设定。',
  },
  {
    id: 'spatial-panel-sdm',
    name: '空间面板杜宾模型',
    panelLabel: 'Spatial Panel SDM',
    resultLabel: '空间面板系数',
    description: '在 SDM 空间滞后项基础上吸收 Panel ID / Time 固定效应。',
    methodLabel: 'Panel SDM FE',
    shortName: 'SP-SDM',
    fullName: 'Spatial Panel Durbin Model with Fixed Effects',
    keywords: ['spatial', 'panel', 'sdm', 'fixed effects', '空间面板'],
    kind: 'panel-sdm',
    message: '空间面板 SDM 用于面板数据中的空间溢出和个体/时间固定效应。',
  },
  {
    id: 'spatial-logit',
    name: '空间 LOGIT 模型',
    panelLabel: 'Spatial Logit',
    resultLabel: '空间 Logit 系数',
    description: '在二分类 Logit 中加入 Wy 与 WX 空间滞后解释项。',
    methodLabel: 'Spatial Logit Approx.',
    shortName: 'S-LOGIT',
    fullName: 'Spatial Logistic Regression',
    keywords: ['spatial', 'logit', 'binary', '空间logit'],
    kind: 'spatial-logit',
    message: '空间 Logit 用于二分类因变量下的邻近影响分析。',
  },
]

const createSpatialPlugin = (spec: SpatialSpec): ModelPlugin => ({
  id: spec.id,
  name: spec.name,
  nodeLabel: spec.name,
  panelLabel: spec.panelLabel,
  resultLabel: spec.resultLabel,
  description: spec.description,
  methodLabel: spec.methodLabel,
  shortName: spec.shortName,
  fullName: spec.fullName,
  category: '空间计量',
  keywords: [...spec.keywords, 'spatial econometrics', '空间计量', '空间权重', '空间溢出'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '使用浏览器内置空间估计实现，适合先完成空间权重与变量设定探索。',
  },
  limitations: ['当前空间估计运行在浏览器内，建议先用小字段集确认设定后再完整运行。', '当前优先支持 CSV/矩阵/边表 W，.gal/.gwt/.shp/GeoJSON 文件解析仍待增强。'],
  requiresTarget: true,
  targetLabel: spec.kind === 'spatial-logit' ? '二分类因变量 Y' : '因变量 Y',
  featuresLabel: spec.kind === 'panel-sdm' ? '空间键、面板维度、解释变量' : '空间键、解释变量',
  downloadName: `${spec.id}-report.csv`,
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: ['numeric', 'category'],
  includeDimensionFields: true,
  usesRawRows: true,
  supportsInference: spec.kind !== 'spatial-logit',
  parameterSchema: spec.kind === 'panel-sdm' ? panelParameterSchema : baseParameterSchema,

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    return makeDefaultConfig(featureColumns, targetColumns, spec.kind)
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    return sanitizeSpatialConfig(config, featureColumns, targetColumns, spec.kind)
  },

  getFormula(config) {
    const spatialKey = paramString(config, 'spatialKey', config.features[0] ?? 'space_key')
    const neighborKey = paramString(config, 'neighborKey')
    const weightField = paramString(config, 'weightField')
    const weightSpec = neighborKey && weightField ? `edge ${spatialKey} -> ${neighborKey}, w=${weightField}` : `sorted neighbors by ${spatialKey}`

    return `${getSpatialFormula(spec.kind, config)} | W: ${weightSpec}`
  },

  getSettings(config) {
    const settings = getSpatialSettings(config, spec.methodLabel)
    if (spec.kind !== 'panel-sdm') return settings

    return [
      ...settings,
      { label: 'Panel ID', value: paramString(config, 'panelId') || '未选择' },
      { label: 'Time FE', value: paramString(config, 'timeField') || '未选择' },
    ]
  },

  fit(input) {
    if (spec.kind === 'panel-sdm') return fitSpatialPanel(spec, input)
    if (spec.kind === 'spatial-logit') return fitSpatialLogit(spec, input)
    return fitSpatialOls(spec, input)
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
})

export const spatialModelPlugins = spatialSpecs.map(createSpatialPlugin)
export const spatialRegressionPlugin = spatialModelPlugins[0]
