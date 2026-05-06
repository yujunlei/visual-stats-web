import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import type { InferenceConfig, ModelConfig, ModelResultTable } from '../types'
import { cleanNumericRows, fitOls, type LogitFit, type OlsFit } from './regression'

export const vifColumns = ['variable', 'vif', 'tolerance', 'rSquared']
export const residualDiagnosticColumns = ['metric', 'value', 'pValue', 'interpretation']
export const robustnessColumns = ['model', 'term', 'coefficient', 'stdError', 'pValue', 'n', 'rSquared', 'note']
export const marginalEffectColumns = ['term', 'marginalEffect', 'coefficient', 'oddsRatio']

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

const normalCdf = (value: number) => {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const erf =
    sign *
    (1 -
      (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x)))

  return 0.5 * (1 + erf)
}

const chiSquareSurvival = (value: number, degreesOfFreedom: number) => {
  if (degreesOfFreedom <= 0) return 1
  if (degreesOfFreedom === 1) return 2 * (1 - normalCdf(Math.sqrt(Math.max(value, 0))))
  if (degreesOfFreedom === 2) return Math.exp(-Math.max(value, 0) / 2)
  const z = (Math.pow(value / degreesOfFreedom, 1 / 3) - (1 - 2 / (9 * degreesOfFreedom))) / Math.sqrt(2 / (9 * degreesOfFreedom))
  return 1 - normalCdf(z)
}

const variance = (values: number[]) => {
  if (values.length <= 1) return 0
  const average = mean(values)
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}

const skewness = (values: number[]) => {
  const average = mean(values)
  const std = Math.sqrt(variance(values))
  if (std === 0) return 0
  return values.reduce((sum, value) => sum + ((value - average) / std) ** 3, 0) / values.length
}

const kurtosis = (values: number[]) => {
  const average = mean(values)
  const std = Math.sqrt(variance(values))
  if (std === 0) return 0
  return values.reduce((sum, value) => sum + ((value - average) / std) ** 4, 0) / values.length
}

const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((left, right) => left - right)
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[index]
}

const trimRows = (rows: Row[], target: string, features: string[], percentile = 0.01) => {
  const columns = [target, ...features]
  const bounds = new Map(
    columns.map((column) => {
      const values = rows.map((row) => toNumber(row[column])).filter((value): value is number => value !== null)
      return [column, { low: quantile(values, percentile), high: quantile(values, 1 - percentile) }]
    }),
  )

  return rows.filter((row) =>
    columns.every((column) => {
      const value = toNumber(row[column])
      const bound = bounds.get(column)
      return value !== null && bound ? value >= bound.low && value <= bound.high : false
    }),
  )
}

export const createVifTable = (rows: Row[], features: string[]): ModelResultTable | null => {
  if (features.length < 2) return null

  const rowsWithVif = features.flatMap((feature) => {
    const others = features.filter((entry) => entry !== feature)
    try {
      const fit = fitOls(rows, feature, others, 'VIF 辅助回归')
      const tolerance = Math.max(1 - fit.r2, 1e-9)
      return [{ variable: feature, vif: 1 / tolerance, tolerance, rSquared: fit.r2 }]
    } catch {
      return [{ variable: feature, vif: Number.POSITIVE_INFINITY, tolerance: 0, rSquared: 1 }]
    }
  })

  return {
    id: 'vif-diagnostics',
    title: '多重共线性诊断 VIF',
    columns: vifColumns,
    rows: rowsWithVif,
  }
}

export const createResidualDiagnosticsTable = (rows: Row[], target: string, features: string[], fit: OlsFit): ModelResultTable => {
  const residuals = fit.residuals
  const jb = (residuals.length / 6) * (skewness(residuals) ** 2 + ((kurtosis(residuals) - 3) ** 2) / 4)
  const jbPValue = chiSquareSurvival(jb, 2)
  const rmse = fit.rootMse
  const bpResult = (() => {
    try {
      const cleanRows = cleanNumericRows(rows, target, features)
      const diagnosticRows = cleanRows.map((entry, index) => ({
        ...entry.row,
        __resid2: residuals[index] ** 2,
      }))
      const bpFit = fitOls(diagnosticRows, '__resid2', features, 'Breusch-Pagan')
      const bp = bpFit.n * bpFit.r2
      return { bp, bpPValue: chiSquareSurvival(bp, Math.max(features.length, 1)) }
    } catch {
      return { bp: 0, bpPValue: 1 }
    }
  })()

  return {
    id: 'residual-diagnostics',
    title: '残差诊断与异方差检验',
    columns: residualDiagnosticColumns,
    rows: [
      {
        metric: 'Breusch-Pagan',
        value: bpResult.bp,
        pValue: bpResult.bpPValue,
        interpretation: bpResult.bpPValue < 0.05 ? '可能存在异方差' : '未发现显著异方差',
      },
      {
        metric: 'Jarque-Bera',
        value: jb,
        pValue: jbPValue,
        interpretation: jbPValue < 0.05 ? '残差可能偏离正态' : '残差正态性未明显异常',
      },
      {
        metric: 'Mean residual',
        value: mean(residuals),
        pValue: '',
        interpretation: '残差均值应接近 0',
      },
      {
        metric: 'RMSE',
        value: rmse,
        pValue: '',
        interpretation: '拟合误差规模',
      },
    ],
  }
}

export const createRobustnessTable = (
  rows: Row[],
  config: ModelConfig,
  featureGroups?: string[][],
  baseInference?: InferenceConfig,
): ModelResultTable | null => {
  if (!config.target || config.features.length === 0) return null

  const groups = featureGroups?.length ? featureGroups : [config.features.slice(0, Math.max(1, Math.ceil(config.features.length / 2))), config.features]
  const specs = [
    { model: 'Base OLS', features: config.features, rows, inference: baseInference, note: '当前设定' },
    { model: 'Robust SE', features: config.features, rows, inference: { standardError: 'robust', clusterField: '' } satisfies InferenceConfig, note: '更换标准误' },
    ...groups.map((features, index) => ({
      model: `Controls ${index + 1}`,
      features,
      rows,
      inference: baseInference,
      note: index === 0 ? '减少控制变量' : '增加控制变量',
    })),
    { model: 'Trim 1%', features: config.features, rows: trimRows(rows, config.target, config.features, 0.01), inference: baseInference, note: '剔除 1% 极端值' },
  ]

  const outputRows = specs.flatMap((spec) => {
    try {
      const fit = fitOls(spec.rows, config.target, spec.features, spec.model, spec.inference)
      const terms = fit.coefficients.filter((coefficient) => coefficient.term !== '_cons').slice(0, 4)
      return terms.map((term) => ({
        model: spec.model,
        term: term.term,
        coefficient: term.coefficient,
        stdError: term.stdError,
        pValue: term.pValue,
        n: fit.n,
        rSquared: fit.r2,
        note: spec.note,
      }))
    } catch {
      return []
    }
  })

  if (outputRows.length === 0) return null

  return {
    id: 'robustness-checks',
    title: '稳健性检验',
    columns: robustnessColumns,
    rows: outputRows,
  }
}

export const createOlsPostEstimationTables = (
  rows: Row[],
  config: ModelConfig,
  fit: OlsFit,
  featureGroups?: string[][],
  inference?: InferenceConfig,
) =>
  [
    createVifTable(rows, config.features),
    createResidualDiagnosticsTable(rows, config.target, config.features, fit),
    createRobustnessTable(rows, config, featureGroups, inference),
  ].filter((table): table is ModelResultTable => Boolean(table))

export const createLogitPostEstimationTables = (config: ModelConfig, fit: LogitFit) => {
  const averageProbabilityWeight = mean(fit.probabilities.map((probability) => probability * (1 - probability)))

  return [
    {
      id: 'marginal-effects',
      title: '平均边际效应',
      columns: marginalEffectColumns,
      rows: fit.coefficients
        .filter((coefficient) => coefficient.term !== '_cons')
        .map((coefficient) => ({
          term: coefficient.term,
          marginalEffect: coefficient.coefficient * averageProbabilityWeight,
          coefficient: coefficient.coefficient,
          oddsRatio: coefficient.oddsRatio,
        })),
    },
    {
      id: 'classification-diagnostics',
      title: '分类诊断',
      columns: residualDiagnosticColumns,
      rows: [
        { metric: 'Accuracy', value: fit.accuracy, pValue: '', interpretation: '阈值 0.5 下的分类准确率' },
        { metric: 'Pseudo R2', value: fit.pseudoR2, pValue: '', interpretation: 'McFadden 风格拟合优度' },
        { metric: 'Positive y', value: fit.positives, pValue: '', interpretation: config.target },
        { metric: 'Negative y', value: fit.negatives, pValue: '', interpretation: config.target },
      ],
    },
  ] satisfies ModelResultTable[]
}
