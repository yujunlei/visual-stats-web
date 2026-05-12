import type { ModelMetric, ModelResultTable } from '../../models/types'
import { columnLabels, formatMetricValue, formatResultValue } from './resultFormat'

type ResultEstimateOverviewProps = {
  modelName: string
  formula: string
  visibleSummaryMetrics: ModelMetric[]
  mainResultTable: ModelResultTable | null
}

export function ResultEstimateOverview({ modelName, formula, visibleSummaryMetrics, mainResultTable }: ResultEstimateOverviewProps) {
  return (
    <section className="result-estimate-overview">
      <div className="paper-section-heading paper-section-heading--flat">
        <span className="paper-section-heading__index">二</span>
        <div>
          <strong>模型摘要与系数估计</strong>
          <small>Model summary and estimates</small>
        </div>
      </div>

      <div className="estimate-overview__meta">
        <div>
          <span>模型</span>
          <strong>{modelName}</strong>
        </div>
        <div>
          <span>公式</span>
          <code>{formula || '尚未设置变量'}</code>
        </div>
      </div>

      {visibleSummaryMetrics.length > 0 ? (
        <div className="summary-grid summary-grid--inline">
          {visibleSummaryMetrics.map((metric) => (
            <span key={metric.label}>
              <small>{metric.label}</small>
              <strong>{formatMetricValue(metric)}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {mainResultTable ? (
        <div className="coef-table is-primary" key={mainResultTable.id}>
          <div className="table-caption">{mainResultTable.title}</div>
          <div
            className="coef-table__head"
            style={{ gridTemplateColumns: `repeat(${mainResultTable.columns.length}, minmax(${mainResultTable.columns.length > 9 ? 56 : 0}px, 1fr))` }}
          >
            {mainResultTable.columns.map((column) => (
              <span key={column}>{columnLabels[column] ?? column}</span>
            ))}
          </div>
          {mainResultTable.rows.map((row, rowIndex) => (
            <div
              className="coef-table__row"
              key={`${row.term ?? row.variable ?? row.source ?? rowIndex}`}
              style={{ gridTemplateColumns: `repeat(${mainResultTable.columns.length}, minmax(${mainResultTable.columns.length > 9 ? 56 : 0}px, 1fr))` }}
            >
              {mainResultTable.columns.map((column, columnIndex) => (
                <span className={columnIndex === 0 ? 'coef-table__term' : ''} key={column}>
                  {formatResultValue(row[column] ?? '', column)}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
