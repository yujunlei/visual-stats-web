import { jStat } from 'jstat'
import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import { compactValue, mean, pearson, twoSidedT } from '../shared/commonStats'
import { compactConfig, paramArray, paramNumber, paramString } from '../shared/config'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import { fitOls, fitOlsDroppingCollinear, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const regressionDiagnosticsCategory = '回归诊断'
const numericTypes = ['numeric'] as const
const allTypes = ['numeric', 'category', 'date', 'text'] as const

const exportAllTables = (result: ModelResult, formula: string) =>
  [...csvSummarySection(formula, result.summary), ...result.tables.flatMap((table) => ['', ...csvTableSection(table)])].join('\n')

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

const selectedColumns = (values: string[], candidates: string[], fallbackCount = 3) => {
  const selected = unique(values).filter((value) => candidates.includes(value))
  return selected.length > 0 ? selected : candidates.slice(0, fallbackCount)
}

const columnOrEmpty = (value: string, candidates: string[]) => (candidates.includes(value) ? value : '')

const finite = (value: number) => (Number.isFinite(value) ? value : 0)
const vifFromTolerance = (tolerance: number) => (tolerance <= 1e-12 ? 1e12 : 1 / tolerance)

const coefficientRows = (fit: ReturnType<typeof fitOls>) =>
  fit.coefficients.map((coefficient) => ({
    term: coefficient.term,
    coefficient: coefficient.coefficient,
    stdError: coefficient.stdError,
    tValue: coefficient.tValue,
    pValue: coefficient.pValue,
    ciLow: coefficient.ciLow,
    ciHigh: coefficient.ciHigh,
  }))

const metricsSummary = (fit: ReturnType<typeof fitOls>) => [
  { label: 'Number of obs', value: fit.n },
  { label: `F(${fit.dfModel}, ${fit.inferenceDf})`, value: fit.fValue },
  { label: 'Prob > F', value: fit.fPValue },
  { label: 'R-squared', value: fit.r2 },
  { label: 'Adj R-squared', value: fit.adjustedR2 },
]

const residualize = (rows: Row[], target: string, controls: string[]) => {
  if (controls.length === 0) {
    return rows.map((row) => toNumber(row[target])).filter((value): value is number => value !== null)
  }

  const fit = fitOls(rows, target, controls, '偏相关残差模型')
  return fit.residuals
}

export const vifAnalysisPlugin: ModelPlugin = {
  id: 'vif-analysis',
  name: '共线性分析',
  nodeLabel: '共线性',
  panelLabel: 'VIF',
  resultLabel: '共线性分析',
  description: '计算解释变量之间的方差膨胀因子 VIF 和容忍度。',
  methodLabel: 'Variance Inflation Factor',
  shortName: 'VIF',
  fullName: 'Variance Inflation Factor',
  category: regressionDiagnosticsCategory,
  keywords: ['vif', 'collinearity', '共线性', '方差膨胀因子'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '解释变量',
  downloadName: 'vif-analysis.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: [...numericTypes],
  usesRawRows: true,
  parameterSchema: [{ id: 'features', label: '解释变量', kind: 'columns', role: 'feature', columnTypes: [...numericTypes], required: true }],

  getDefaultConfig(featureColumns) {
    const features = featureColumns.slice(0, 3)
    return compactConfig('', { features }, features)
  },

  sanitizeConfig(config, featureColumns) {
    const features = selectedColumns(paramArray(config, 'features', config.features), featureColumns)
    return compactConfig('', { features }, features)
  },

  getFormula(config) {
    return `vif ${paramArray(config, 'features', config.features).join(' ')}`
  },

  getSettings(config) {
    return [{ label: '变量数', value: String(paramArray(config, 'features', config.features).length) }]
  },

  fit({ rows, config }) {
    const features = paramArray(config, 'features', config.features)
    if (features.length < 2) throw new Error('共线性分析至少需要 2 个解释变量。')

    const tableRows = features.map((feature) => {
      const others = features.filter((candidate) => candidate !== feature)
      const fit = fitOls(rows, feature, others, 'VIF 辅助回归')
      const tolerance = Math.max(1 - fit.r2, 0)
      return {
        variable: feature,
        rSquared: fit.r2,
        tolerance,
        vif: vifFromTolerance(tolerance),
        observations: fit.n,
      }
    })

    return {
      id: this.id,
      summary: [
        { label: 'variables', value: features.length },
        { label: 'max VIF', value: Math.max(...tableRows.map((row) => finite(row.vif))) },
        { label: 'mean VIF', value: mean(tableRows.map((row) => finite(row.vif))) },
      ],
      tables: [{ id: 'vif', title: '方差膨胀因子', columns: ['variable', 'vif', 'tolerance', 'rSquared', 'observations'], rows: tableRows }],
      diagnostics: [],
      warnings: tableRows.some((row) => row.vif >= 10) ? ['存在 VIF 大于等于 10 的变量，建议检查多重共线性。'] : [],
      message: 'VIF 越高表示解释变量与其他解释变量线性相关越强，常用经验阈值为 5 或 10。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const partialCorrelationPlugin: ModelPlugin = {
  id: 'partial-correlation',
  name: '偏相关',
  nodeLabel: '偏相关',
  panelLabel: 'Partial Correlation',
  resultLabel: '偏相关',
  description: '控制一组变量后，估计两个变量之间的线性相关。',
  methodLabel: 'Partial Correlation',
  shortName: 'PCORR',
  fullName: 'Partial Correlation',
  category: regressionDiagnosticsCategory,
  keywords: ['partial correlation', '偏相关', '控制变量'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '变量',
  downloadName: 'partial-correlation.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: [...numericTypes],
  usesRawRows: true,
  parameterSchema: [
    { id: 'x', label: '变量 X', kind: 'column', role: 'feature', columnTypes: [...numericTypes], required: true },
    { id: 'y', label: '变量 Y', kind: 'column', role: 'feature', columnTypes: [...numericTypes], required: true },
    { id: 'controls', label: '控制变量', kind: 'columns', role: 'feature', columnTypes: [...numericTypes] },
  ],

  getDefaultConfig(featureColumns) {
    const x = featureColumns[0] ?? ''
    const y = featureColumns.find((column) => column !== x) ?? ''
    return compactConfig('', { x, y, controls: [] }, [x, y].filter(Boolean))
  },

  sanitizeConfig(config, featureColumns) {
    const x = columnOrEmpty(paramString(config, 'x', config.features[0]), featureColumns)
    const y = columnOrEmpty(paramString(config, 'y', config.features.find((feature) => feature !== x) ?? ''), featureColumns)
    const controls = unique(paramArray(config, 'controls')).filter((column) => featureColumns.includes(column) && column !== x && column !== y)
    return compactConfig('', { x, y, controls }, [x, y].filter(Boolean))
  },

  getFormula(config) {
    const x = paramString(config, 'x', config.features[0] ?? 'x')
    const y = paramString(config, 'y', config.features[1] ?? 'y')
    const controls = paramArray(config, 'controls')
    return controls.length > 0 ? `pcorr ${x} ${y}, controls(${controls.join(' ')})` : `corr ${x} ${y}`
  },

  getSettings(config) {
    return [
      { label: '变量 X', value: paramString(config, 'x', config.features[0]) || '未选择' },
      { label: '变量 Y', value: paramString(config, 'y', config.features[1]) || '未选择' },
      { label: '控制变量数', value: String(paramArray(config, 'controls').length) },
    ]
  },

  fit({ rows, config }) {
    const x = paramString(config, 'x', config.features[0])
    const y = paramString(config, 'y', config.features.find((feature) => feature !== x) ?? '')
    const controls = paramArray(config, 'controls').filter((control) => control !== x && control !== y)
    if (!x || !y || x === y) throw new Error('偏相关需要选择两个不同的数值变量。')

    const cleanRows = rows.filter((row) => [x, y, ...controls].every((column) => toNumber(row[column]) !== null))
    if (cleanRows.length <= controls.length + 3) throw new Error('偏相关可用样本太少，无法估计。')

    const xResidual = residualize(cleanRows, x, controls)
    const yResidual = residualize(cleanRows, y, controls)
    const r = pearson(xResidual, yResidual)
    const df = cleanRows.length - controls.length - 2
    const tValue = Math.abs(r) >= 1 ? Number.POSITIVE_INFINITY : r * Math.sqrt(df / Math.max(1 - r ** 2, 1e-12))
    const pValue = twoSidedT(tValue, df)

    return {
      id: this.id,
      summary: [
        { label: 'partial r', value: r },
        { label: 't', value: tValue },
        { label: 'p-value', value: pValue },
        { label: 'Number of obs', value: cleanRows.length },
      ],
      tables: [
        {
          id: 'partial-correlation',
          title: '偏相关系数',
          columns: ['x', 'y', 'controls', 'partialR', 'tValue', 'pValue', 'df', 'observations'],
          rows: [{ x, y, controls: controls.join(', ') || 'None', partialR: r, tValue, pValue, df, observations: cleanRows.length }],
        },
      ],
      diagnostics: [],
      message: controls.length > 0 ? '偏相关先剔除控制变量线性影响，再计算两个残差序列的 Pearson 相关。' : '未选择控制变量时，偏相关退化为 Pearson 相关。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const hierarchicalRegressionPlugin: ModelPlugin = {
  id: 'hierarchical-regression',
  name: '分层回归',
  nodeLabel: '分层回归',
  panelLabel: 'Hierarchical Regression',
  resultLabel: '分层回归',
  description: '比较控制变量模型和加入核心解释变量后的模型增量解释力。',
  methodLabel: 'Hierarchical OLS',
  shortName: 'HREG',
  fullName: 'Hierarchical Regression',
  category: regressionDiagnosticsCategory,
  keywords: ['hierarchical regression', '分层回归', '增量解释力', 'delta r2'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: '核心解释变量',
  downloadName: 'hierarchical-regression.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: [...numericTypes],
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: [...numericTypes], required: true },
    { id: 'controls', label: '第一层：控制变量', kind: 'columns', role: 'feature', columnTypes: [...numericTypes], required: true },
    { id: 'features', label: '第二层：核心解释变量', kind: 'columns', role: 'feature', columnTypes: [...numericTypes], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const controls = featureColumns.filter((column) => column !== target).slice(0, 1)
    const features = featureColumns.filter((column) => column !== target && !controls.includes(column)).slice(0, 2)
    return compactConfig(target, { target, controls, features }, features)
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const target = columnOrEmpty(paramString(config, 'target', config.target), targetColumns)
    const controls = unique(paramArray(config, 'controls')).filter((column) => featureColumns.includes(column) && column !== target)
    const features = unique(paramArray(config, 'features', config.features)).filter((column) => featureColumns.includes(column) && column !== target && !controls.includes(column))
    return compactConfig(target, { target, controls, features }, features)
  },

  getFormula(config) {
    const target = paramString(config, 'target', config.target || 'Y')
    const controls = paramArray(config, 'controls')
    const features = paramArray(config, 'features', config.features)
    return `${target} ~ ${[...controls, ...features].join(' + ') || 'X'}`
  },

  getSettings(config) {
    return [
      { label: '控制变量数', value: String(paramArray(config, 'controls').length) },
      { label: '核心解释变量数', value: String(paramArray(config, 'features', config.features).length) },
    ]
  },

  fit({ rows, config, inference }) {
    const target = paramString(config, 'target', config.target)
    const controls = paramArray(config, 'controls')
    const features = paramArray(config, 'features', config.features).filter((feature) => !controls.includes(feature))
    if (!target || controls.length === 0 || features.length === 0) throw new Error('分层回归需要选择因变量、第一层控制变量和第二层核心解释变量。')

    const first = fitOls(rows, target, controls, '分层回归第一层', inference)
    const second = fitOls(rows, target, [...controls, ...features], '分层回归第二层', inference)
    const deltaR2 = second.r2 - first.r2
    const df1 = second.dfModel - first.dfModel
    const df2 = second.dfResidual
    const fChange = (deltaR2 / Math.max(df1, 1)) / ((1 - second.r2) / Math.max(df2, 1))
    const pChange = 1 - jStat.centralF.cdf(fChange, Math.max(df1, 1), Math.max(df2, 1))

    return {
      id: this.id,
      summary: [
        { label: 'Model 1 R-squared', value: first.r2 },
        { label: 'Model 2 R-squared', value: second.r2 },
        { label: 'Delta R-squared', value: deltaR2 },
        { label: 'F change', value: fChange },
        { label: 'Prob > F change', value: pChange },
        { label: 'Number of obs', value: second.n },
      ],
      tables: [
        {
          id: 'model-comparison',
          title: '分层模型比较',
          columns: ['model', 'predictors', 'rSquared', 'adjustedR2', 'fValue', 'pValue', 'deltaR2', 'fChange', 'pChange'],
          rows: [
            { model: 'Model 1', predictors: controls.join(', '), rSquared: first.r2, adjustedR2: first.adjustedR2, fValue: first.fValue, pValue: first.fPValue, deltaR2: '', fChange: '', pChange: '' },
            { model: 'Model 2', predictors: [...controls, ...features].join(', '), rSquared: second.r2, adjustedR2: second.adjustedR2, fValue: second.fValue, pValue: second.fPValue, deltaR2, fChange, pChange },
          ],
        },
        { id: 'coefficients', title: `系数估计 (${target})`, columns: [...olsCoefficientColumns], rows: coefficientRows(second) },
      ],
      diagnostics: [],
      warnings: [...first.warnings, ...second.warnings],
      message: '分层回归比较加入核心解释变量前后的 R² 增量和 F change，用于判断新增变量是否带来额外解释力。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const groupedRegressionPlugin: ModelPlugin = {
  id: 'grouped-regression',
  name: '分组回归',
  nodeLabel: '分组回归',
  panelLabel: 'Grouped Regression',
  resultLabel: '分组回归',
  description: '按分组变量分别估计 OLS，并对比不同组的核心系数。',
  methodLabel: 'Grouped OLS',
  shortName: 'GREG',
  fullName: 'Grouped Regression',
  category: regressionDiagnosticsCategory,
  keywords: ['grouped regression', '分组回归', '异质性'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: '解释变量 X',
  downloadName: 'grouped-regression.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: [...numericTypes],
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: [...numericTypes], required: true },
    { id: 'features', label: '解释变量 X', kind: 'columns', role: 'feature', columnTypes: [...numericTypes], required: true },
    { id: 'group', label: '分组变量', kind: 'column', role: 'feature', columnTypes: [...allTypes], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const features = featureColumns.filter((column) => column !== target).slice(0, 2)
    const group = ''
    return compactConfig(target, { target, features, group }, features)
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const target = columnOrEmpty(paramString(config, 'target', config.target), targetColumns)
    const features = unique(paramArray(config, 'features', config.features)).filter((column) => featureColumns.includes(column) && column !== target)
    const allColumns = [...new Set([...featureColumns, ...targetColumns])]
    const group = columnOrEmpty(paramString(config, 'group'), allColumns)
    return compactConfig(target, { target, features, group }, features)
  },

  getFormula(config) {
    return `${paramString(config, 'target', config.target || 'Y')} ~ ${paramArray(config, 'features', config.features).join(' + ') || 'X'} by ${paramString(config, 'group') || 'group'}`
  },

  getSettings(config) {
    return [
      { label: '解释变量数', value: String(paramArray(config, 'features', config.features).length) },
      { label: '分组变量', value: paramString(config, 'group') || '未选择' },
    ]
  },

  fit({ rows, config, inference }) {
    const target = paramString(config, 'target', config.target)
    const features = paramArray(config, 'features', config.features)
    const group = paramString(config, 'group')
    if (!target || features.length === 0 || !group) throw new Error('分组回归需要选择因变量、解释变量和分组变量。')

    const groups = new Map<string, Row[]>()
    rows.forEach((row) => {
      const key = compactValue(row[group])
      if (key === 'NA') return
      groups.set(key, [...(groups.get(key) ?? []), row])
    })

    const coefficientTable: Array<Record<string, string | number>> = []
    const modelTable: Array<Record<string, string | number>> = []
    const warnings: string[] = []

    Array.from(groups.entries()).forEach(([groupValue, groupRows]) => {
      try {
        const fit = fitOls(groupRows, target, features, `分组回归 ${groupValue}`, inference)
        modelTable.push({
          group: groupValue,
          observations: fit.n,
          rSquared: fit.r2,
          adjustedR2: fit.adjustedR2,
          fValue: fit.fValue,
          pValue: fit.fPValue,
        })
        fit.coefficients.forEach((coefficient) => {
          coefficientTable.push({ group: groupValue, ...coefficient })
        })
        warnings.push(...fit.warnings)
      } catch (error) {
        warnings.push(`${groupValue}: ${error instanceof Error ? error.message : '分组回归估计失败。'}`)
      }
    })

    if (modelTable.length === 0) throw new Error('所有分组都无法估计，请检查样本量和变量选择。')

    return {
      id: this.id,
      summary: [
        { label: 'estimated groups', value: modelTable.length },
        { label: 'total groups', value: groups.size },
        { label: 'Number of obs', value: modelTable.reduce((sum, row) => sum + Number(row.observations), 0) },
      ],
      tables: [
        { id: 'group-models', title: '分组模型摘要', columns: ['group', 'observations', 'rSquared', 'adjustedR2', 'fValue', 'pValue'], rows: modelTable },
        { id: 'group-coefficients', title: '分组系数估计', columns: ['group', ...olsCoefficientColumns], rows: coefficientTable },
      ],
      diagnostics: [],
      warnings,
      message: '分组回归按分组变量拆分样本分别估计 OLS，用于探索异质性；正式比较组间系数差异仍建议进一步做交互项检验。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const stepwiseRegressionPlugin: ModelPlugin = {
  id: 'stepwise-regression',
  name: '逐步回归',
  nodeLabel: '逐步回归',
  panelLabel: 'Stepwise Regression',
  resultLabel: '逐步回归',
  description: '按候选变量的显著性进行前向逐步筛选，作为探索性变量筛选工具。',
  methodLabel: 'Forward Stepwise OLS',
  shortName: 'STEP',
  fullName: 'Stepwise Regression',
  category: regressionDiagnosticsCategory,
  keywords: ['stepwise', '逐步回归', '变量筛选', 'forward selection'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '逐步回归容易过拟合，适合探索变量集合，不建议直接作为最终论文模型。',
  },
  limitations: ['逐步筛选会低估模型不确定性，正式报告建议结合理论设定和稳健性检验。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: '候选解释变量',
  downloadName: 'stepwise-regression.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: [...numericTypes],
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: [...numericTypes], required: true },
    { id: 'features', label: '候选解释变量', kind: 'columns', role: 'feature', columnTypes: [...numericTypes], required: true },
    { id: 'entryThreshold', label: '进入阈值 p', kind: 'number', defaultValue: 0.05, helperText: '候选变量 p 值小于等于该阈值时进入模型。' },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const features = featureColumns.filter((column) => column !== target).slice(0, 5)
    return compactConfig(target, { target, features, entryThreshold: 0.05 }, features)
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const target = columnOrEmpty(paramString(config, 'target', config.target), targetColumns)
    const features = unique(paramArray(config, 'features', config.features)).filter((column) => featureColumns.includes(column) && column !== target)
    const rawThreshold = paramNumber(config, 'entryThreshold', 0.05)
    const entryThreshold = Math.min(Math.max(rawThreshold, 0.001), 0.5)
    return compactConfig(target, { target, features, entryThreshold }, features)
  },

  getFormula(config) {
    return `stepwise ${paramString(config, 'target', config.target || 'Y')} ~ ${paramArray(config, 'features', config.features).join(' + ') || 'candidates'}`
  },

  getSettings(config) {
    return [
      { label: '候选变量数', value: String(paramArray(config, 'features', config.features).length) },
      { label: '进入阈值', value: String(paramNumber(config, 'entryThreshold', 0.05)) },
    ]
  },

  fit({ rows, config, inference }) {
    const target = paramString(config, 'target', config.target)
    const candidates = paramArray(config, 'features', config.features)
    const entryThreshold = Math.min(Math.max(paramNumber(config, 'entryThreshold', 0.05), 0.001), 0.5)
    if (!target || candidates.length === 0) throw new Error('逐步回归需要选择因变量和候选解释变量。')

    const selected: string[] = []
    const remaining = [...candidates]
    const stepRows: Array<Record<string, string | number>> = []

    while (remaining.length > 0) {
      const candidatesWithP = remaining
        .map((candidate) => {
          try {
            const fit = fitOls(rows, target, [...selected, candidate], '逐步回归候选模型', inference)
            const coefficient = fit.coefficients.find((entry) => entry.term === candidate)
            return coefficient ? { candidate, pValue: coefficient.pValue, rSquared: fit.r2 } : null
          } catch {
            return null
          }
        })
        .filter((entry): entry is { candidate: string; pValue: number; rSquared: number } => entry !== null)
        .sort((left, right) => left.pValue - right.pValue)

      const best = candidatesWithP[0]
      if (!best || best.pValue > entryThreshold) break
      selected.push(best.candidate)
      remaining.splice(remaining.indexOf(best.candidate), 1)
      stepRows.push({ step: selected.length, action: 'enter', variable: best.candidate, pValue: best.pValue, rSquared: best.rSquared })
    }

    if (selected.length === 0) throw new Error('没有候选变量达到进入阈值，请放宽阈值或检查数据。')
    const final = fitOlsDroppingCollinear(rows, target, selected, '逐步回归最终模型', inference)

    return {
      id: this.id,
      summary: [
        { label: 'selected variables', value: final.features.length },
        { label: 'candidate variables', value: candidates.length },
        { label: 'entry threshold', value: entryThreshold },
        ...metricsSummary(final.fit),
      ],
      tables: [
        { id: 'steps', title: '逐步筛选过程', columns: ['step', 'action', 'variable', 'pValue', 'rSquared'], rows: stepRows },
        { id: 'coefficients', title: `系数估计 (${target})`, columns: [...olsCoefficientColumns], rows: coefficientRows(final.fit) },
      ],
      diagnostics: [],
      warnings: [
        '逐步回归属于探索性筛选方法，可能带来过拟合和显著性偏误。',
        ...final.droppedFeatures.map((feature) => `变量 ${feature} 因共线性被剔除。`),
        ...final.fit.warnings,
      ],
      message: '逐步回归按候选变量进入模型后的 p 值进行前向筛选，结果应结合理论和稳健性检验使用。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const regressionDiagnosticsPlugins = [
  vifAnalysisPlugin,
  partialCorrelationPlugin,
  hierarchicalRegressionPlugin,
  groupedRegressionPlugin,
  stepwiseRegressionPlugin,
]
