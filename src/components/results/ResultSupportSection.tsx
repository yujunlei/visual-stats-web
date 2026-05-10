/**
 * ResultSupportSection - extracted from ResultReadingPanel
 * Displays diagnostics (scatter plot / correlation heatmap) and run logs.
 * No business logic; purely presentational.
 */
import type { ActualVsFittedDiagnostic, CorrelationMatrixDiagnostic } from '../../models/types'
import type { RunLogEntry } from '../../data/preprocess'
import { formatNumber } from '../../data/tableUtils'
import { Activity } from 'lucide-react'

type ResultSupportSectionProps = {
  primaryDiagnostic: ActualVsFittedDiagnostic | undefined
  correlationMatrix: CorrelationMatrixDiagnostic | undefined
  runLogs: RunLogEntry[]
}

export function ResultSupportSection(props: ResultSupportSectionProps) {
  const { primaryDiagnostic, correlationMatrix, runLogs } = props

  return (
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
  )
}
