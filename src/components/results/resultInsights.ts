import { formatNumber } from '../../data/tableUtils'
import type { ModelResult } from '../../models/types'
import { formatResultValue } from './resultFormat'

const extractMetricNumber = (result: ModelResult | null, label: string) => {
  const metric = result?.summary.find((entry) => entry.label === label)
  return typeof metric?.value === 'number' ? metric.value : null
}

export function deriveResultInsights(result: ModelResult | null): string[] {
  if (!result) return []

  const insights: string[] = []
  const mainTable = result.tables.find((table) => table.id === 'coefficients') ?? result.tables[0]
  const rSquared = extractMetricNumber(result, 'R-squared')
  if (rSquared !== null) {
    const quality = rSquared >= 0.7 ? '较强' : rSquared >= 0.4 ? '中等' : rSquared >= 0.15 ? '较弱' : '很弱'
    insights.push(`模型解释力${quality}（R² = ${formatNumber(rSquared, 3)}），自变量整体能解释因变量约 ${formatNumber(rSquared * 100, 1)}% 的变异。`)
  }
  const pValue = extractMetricNumber(result, 'p-value') ?? extractMetricNumber(result, 'Prob > F') ?? extractMetricNumber(result, 'Sobel p')
  if (pValue !== null) {
    const sigLevel = pValue < 0.001 ? '在 0.1% 水平高度显著' : pValue < 0.01 ? '在 1% 水平显著' : pValue < 0.05 ? '在 5% 水平显著' : pValue < 0.1 ? '在 10% 水平边际显著' : '未达到常用显著性阈值'
    insights.push(`整体模型检验 ${sigLevel}（p = ${formatResultValue(pValue, 'pValue')}）。`)
  }
  const nObs = extractMetricNumber(result, 'N') ?? extractMetricNumber(result, 'Observations') ?? extractMetricNumber(result, 'Number of obs')
  if (nObs !== null) {
    insights.push(`共纳入 ${formatNumber(nObs, 0)} 个有效观测进入估计。`)
  }
  if (mainTable && mainTable.id === 'coefficients') {
    const sigRows = mainTable.rows.filter((row) => {
      const p = typeof row.pValue === 'number' ? row.pValue : 1
      return p < 0.05
    })
    if (sigRows.length > 0) {
      const names = sigRows.slice(0, 3).map((row) => `${row.term ?? row.variable ?? ''}`).filter(Boolean)
      insights.push(`${sigRows.length} 个变量在 5% 水平显著${names.length > 0 ? `，包括 ${names.join('、')}` : ''}。`)
    } else if (mainTable.rows.length > 0) {
      insights.push('当前模型中没有变量在 5% 水平显著，建议检查变量选择或模型设定。')
    }
  }

  return insights.slice(0, 4)
}
