/**
 * ResultLeadConclusion - extracted from ResultReadingPanel
 * Displays the natural-language core conclusion, insights, model summary, and reading tips.
 * No business logic; purely presentational.
 */
import type { ModelMetric } from '../../models/types'
import { ResultMetricGrid } from './ResultMetricGrid'
import { CheckCircle } from 'lucide-react'

type ResultLeadConclusionProps = {
  leadInsight: string
  secondaryInsights: string[]
  visibleSummaryMetrics: ModelMetric[]
}

export function ResultLeadConclusion(props: ResultLeadConclusionProps) {
  const { leadInsight, secondaryInsights, visibleSummaryMetrics } = props

  return (
    <section className="result-primary-summary">
      <div className="paper-section-heading">
        <span className="paper-section-heading__index">一</span>
        <div>
          <strong>核心结论</strong>
          <small>Natural-language findings</small>
        </div>
      </div>
      <section className="lead-conclusion-card">
        <div className="section-title">
          <CheckCircle size={18} />
          <h2>核心结论</h2>
        </div>
        <p className="lead-conclusion-card__lead">{leadInsight || '模型已完成运行，可以开始阅读结果。'}</p>
        {secondaryInsights.length > 0 ? (
          <div className="lead-conclusion-card__notes">
            {secondaryInsights.map((insight) => (
              <p key={insight}>{insight}</p>
            ))}
          </div>
        ) : null}
      </section>

      <blockquote className="paper-quote-note">
        <p>"建议先阅读自然语言结论，再结合摘要指标和系数估计判断显著性、方向与经济含义。"</p>
      </blockquote>

      <ResultMetricGrid summary={visibleSummaryMetrics} />
      <div className="result-insights result-insights--quiet">
        <strong>阅读提示</strong>
        <p>先确认模型摘要与显著性水平，再查看系数方向、区间和稳健性结果。</p>
        <p>补充诊断与运行日志固定显示在结果阅读底部，用于核对模型质量和运行过程。</p>
      </div>
    </section>
  )
}
