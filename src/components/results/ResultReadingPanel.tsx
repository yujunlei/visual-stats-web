/**
 * ResultReadingPanel - extracted from App.tsx
 * Displays the main result-reading area: conclusions, summary, coefficient tables, diagnostics, and logs.
 * No business logic; purely presentational.
 */
import type { ModelResult, ModelMetric, ModelResultTable, ActualVsFittedDiagnostic, CorrelationMatrixDiagnostic } from '../../models/types'
import type { RunLogEntry } from '../../data/preprocess'
import { formatMetricValue } from './resultFormat'
import { ResultTables } from './ResultTables'
import { formatNumber } from '../../data/tableUtils'
import { Activity, AlertTriangle, CheckCircle, Play } from 'lucide-react'

type ResultReadingPanelProps = {
  result: ModelResult | null
  runLogs: RunLogEntry[]
  isModelRunning: boolean
  hasStaleResult: boolean
  leadInsight: string
  secondaryInsights: string[]
  visibleSummaryMetrics: ModelMetric[]
  mainResultTable: ModelResultTable | null
  secondaryResultTables: ModelResultTable[]
  primaryDiagnostic: ActualVsFittedDiagnostic | undefined
  correlationMatrix: CorrelationMatrixDiagnostic | undefined
  runTask: { phase: string; progress: number; elapsedMs: number } | null | undefined
  error: string | null
}

const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}

export function ResultReadingPanel(props: ResultReadingPanelProps) {
  const {
    result,
    runLogs,
    isModelRunning,
    hasStaleResult,
    leadInsight,
    secondaryInsights,
    visibleSummaryMetrics,
    mainResultTable,
    secondaryResultTables,
    primaryDiagnostic,
    correlationMatrix,
    runTask,
    error,
  } = props

  return (
    <section className="result-reading-section">
      {isModelRunning ? (
        <div className="notice is-running-task">
          <Activity size={16} />
          <div>
            <strong>{runTask?.phase || '正在运行模型'}</strong>
            {runTask ? (
              <span>{runTask.progress}% · {formatDuration(runTask.elapsedMs)}</span>
            ) : null}
          </div>
        </div>
      ) : error ? (
        <div className="notice is-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      ) : result ? (
        <>
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

            <div className="paper-section-heading">
              <span className="paper-section-heading__index">二</span>
              <div>
                <strong>模型摘要</strong>
                <small>Model summary</small>
              </div>
            </div>
            <div className="summary-grid is-compact">
              {visibleSummaryMetrics.map((metric) => (
                <span key={metric.label}>
                  <strong>{formatMetricValue(metric)}</strong>
                  {metric.label}
                </span>
              ))}
            </div>
            <div className="result-insights result-insights--quiet">
              <strong>阅读提示</strong>
              <p>先确认模型摘要与显著性水平，再查看系数方向、区间和稳健性结果。</p>
              <p>补充诊断与运行日志固定显示在结果阅读底部，用于核对模型质量和运行过程。</p>
            </div>
          </section>

          <ResultTables
            result={result}
            mainResultTable={mainResultTable}
            secondaryResultTables={secondaryResultTables}
          />

          <section className="result-support-section">
            <div className="result-support-section__header">
              <div>
                <span className="panel__label">SUPPORT</span>
                <h3>诊断与运行日志</h3>
                <p>用于补充判断模型质量、运行过程和异常提示。</p>
              </div>
            </div>
            <div className="result-support-row">
              <div className="result-panel result-diagnostic-card">
                <div className="section-title">
                  <Activity size={18} />
                  <h2>{primaryDiagnostic?.title ?? correlationMatrix?.title ?? '拟合诊断'}</h2>
                </div>
                {primaryDiagnostic ? (
                  <div className="scatter-plot is-compact" aria-label="Actual versus fitted chart">
                    {primaryDiagnostic.actual.map((actual, index) => {
                      const maxActual = Math.max(...primaryDiagnostic.actual)
                      const maxFitted = Math.max(...primaryDiagnostic.fitted)
                      return (
                        <span
                          key={`${actual}-${index}`}
                          style={{
                            left: `${(primaryDiagnostic.fitted[index] / maxFitted) * 88 + 5}%`,
                            bottom: `${(actual / maxActual) * 80 + 8}%`,
                          }}
                        />
                      )
                    })}
                  </div>
                ) : correlationMatrix ? (
                  <div
                    className="correlation-heatmap is-compact"
                    style={{ gridTemplateColumns: `72px repeat(${correlationMatrix.variables.length}, minmax(42px, 1fr))` }}
                  >
                    <span />
                    {correlationMatrix.variables.map((variable) => (
                      <strong key={variable}>{variable}</strong>
                    ))}
                    {correlationMatrix.matrix.flatMap((row, rowIndex) => [
                      <strong className="correlation-heatmap__row-label" key={`${correlationMatrix.variables[rowIndex]}-label`}>
                        {correlationMatrix.variables[rowIndex]}
                      </strong>,
                      ...row.map((value, columnIndex) => (
                        <span
                          key={`${correlationMatrix.variables[rowIndex]}-${correlationMatrix.variables[columnIndex]}`}
                          style={{
                            backgroundColor:
                              value >= 0
                                ? `rgba(23, 124, 120, ${Math.min(Math.abs(value), 1) * 0.78 + 0.08})`
                                : `rgba(187, 69, 54, ${Math.min(Math.abs(value), 1) * 0.72 + 0.08})`,
                            color: Math.abs(value) > 0.62 ? '#ffffff' : 'var(--ink)',
                          }}
                        >
                          {formatNumber(value, 2)}
                        </span>
                      )),
                    ])}
                  </div>
                ) : (
                  <div className="empty-diagnostic is-compact">
                    <Activity size={18} />
                    暂无诊断图。
                  </div>
                )}
              </div>

              <div className="result-panel result-log-card">
                <div className="section-title">
                  <Activity size={18} />
                  <h2>运行日志</h2>
                </div>
                <div className="run-log is-expanded">
                  {runLogs.map((entry, index) => (
                    <p className={entry.level === 'warning' ? 'is-warning' : ''} key={`${entry.message}-${index}`}>
                      {entry.message}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="notice">
          <Play size={16} />
          {hasStaleResult ? '参数已变更，点击运行刷新。' : '设置参数后运行模型查看结果。'}
        </div>
      )}
    </section>
  )
}
