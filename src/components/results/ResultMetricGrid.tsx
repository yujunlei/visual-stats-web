/**
 * ResultMetricGrid - extracted from ResultReadingPanel
 * Displays the model summary metric grid (R-squared, Root MSE, sample size, etc.)
 * No business logic; purely presentational.
 */
import type { ModelMetric } from '../../models/types'
import { formatMetricValue } from './resultFormat'

type ResultMetricGridProps = {
  summary: ModelMetric[]
}

export function ResultMetricGrid({ summary }: ResultMetricGridProps) {
  return (
    <>
      <div className="paper-section-heading">
        <span className="paper-section-heading__index">二</span>
        <div>
          <strong>模型摘要</strong>
          <small>Model summary</small>
        </div>
      </div>
      <div className="summary-grid is-compact">
        {summary.map((metric) => (
          <span key={metric.label}>
            <strong>{formatMetricValue(metric)}</strong>
            {metric.label}
          </span>
        ))}
      </div>
    </>
  )
}
