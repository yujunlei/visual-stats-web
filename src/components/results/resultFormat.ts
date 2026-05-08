/**
 * Result formatting utilities extracted from App.tsx
 * These are pure formatting functions with no React dependencies
 */
import { formatNumber } from '../../data/tableUtils'
import type { ModelMetric } from '../../models/types'

export const formatMetricValue = (metric: ModelMetric | undefined) => {
  if (!metric) return 'waiting'
  return typeof metric.value === 'number' ? formatNumber(metric.value, metric.precision ?? 3) : metric.value
}

export const columnLabels: Record<string, string> = {
  source: 'Source',
  ss: 'SS',
  df: 'df',
  ms: 'MS',
  term: 'Variable',
  coefficient: 'Coefficient',
  stdError: 'Std. err.',
  tValue: 't',
  pValue: 'P>|t|',
  ciLow: '[95% conf.',
  ciHigh: 'interval]',
  topic: 'Topic',
  documents: 'Documents',
  share: 'Share',
  keywords: 'Keywords',
  representative: 'Representative',
  document: 'Document',
  score: 'Score',
  text: 'Text',
  path: 'Path',
  zValue: 'z',
  oddsRatio: 'Odds ratio',
  level: 'Level',
  moderatorValue: 'Moderator',
  effect: 'Effect',
  threshold: 'Threshold',
  rSquared: 'R-squared',
  lowCoefficient: 'Low coef.',
  highCoefficient: 'High coef.',
  leftObs: 'Left obs',
  rightObs: 'Right obs',
  model: 'Model',
  spatialKey: 'Spatial key',
  neighborKey: 'Neighbor key',
  weightField: 'Weight',
  lagTerm: 'Lag term',
  neighborRule: 'Neighbor rule',
  validWeights: 'Valid W',
  rootMse: 'Root MSE',
  logLikelihood: 'Log likelihood',
  specification: 'Specification',
  spatialTerms: 'Spatial terms',
  totalEffect: 'Total',
  spilloverShare: 'Spillover %',
  metric: 'Metric',
  value: 'Value',
  aPath: 'a path',
  bPath: 'b path',
  indirectEffect: 'Indirect',
  directEffect: 'Direct',
  groups: 'Groups',
  singletonGroups: 'Singletons',
  minObs: 'Min obs',
  maxObs: 'Max obs',
  avgObs: 'Avg obs',
  absorbedDf: 'Absorbed df',
  variable: 'Variable',
  reason: 'Reason',
  estimate: 'Estimate',
  bootCiLow: 'Boot CI low',
  bootCiHigh: 'Boot CI high',
  bootstrapReps: 'Bootstrap reps',
  count: 'Count',
  percent: 'Percent',
  cumulativePercent: 'Cum. percent',
  group: 'Group',
  median: 'Median',
  rowCategory: 'Row',
  rowTotal: 'Row total',
  variance: 'Variance',
  range: 'Range',
  iqr: 'IQR',
  comparison: 'Comparison',
  meanDiff: 'Mean diff',
  testValue: 'Test value',
  pairs: 'Pairs',
  skewness: 'Skewness',
  excessKurtosis: 'Ex. kurtosis',
  jarqueBera: 'Jarque-Bera',
  rankSum: 'Rank sum',
  meanRank: 'Mean rank',
  method: 'Method',
  statistic: 'Statistic',
  vif: 'VIF',
  tolerance: 'Tolerance',
  interpretation: 'Interpretation',
  marginalEffect: 'Marginal effect',
  note: 'Note',
}

export const formatResultValue = (value: string | number, column: string) => {
  if (typeof value !== 'number') return value
  if (column === 'df' || column === 'n' || column === 'leftObs' || column === 'rightObs' || column === 'documents' || column === 'document') return formatNumber(value, 0)
  if (column === 'percent' || column === 'cumulativePercent') return `${formatNumber(value * 100, 2)}%`
  if (column === 'pValue') return value < 0.0005 ? '0.000' : value.toFixed(3)
  if (Number.isInteger(value) && Math.abs(value) >= 10) return formatNumber(value, 0)
  if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toPrecision(4)
  return formatNumber(value, 4)
}
