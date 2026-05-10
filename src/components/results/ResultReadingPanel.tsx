/**
 * ResultReadingPanel - extracted from App.tsx
 * Displays the main result-reading area: conclusions, summary, coefficient tables, diagnostics, and logs.
 * No business logic; purely presentational.
 */
import type { ModelResult, ModelMetric, ModelResultTable, ActualVsFittedDiagnostic, CorrelationMatrixDiagnostic } from '../../models/types'
import type { RunLogEntry } from '../../data/preprocess'
import { ResultTables } from './ResultTables'
import { ResultLeadConclusion } from './ResultLeadConclusion'
import { ResultSupportSection } from './ResultSupportSection'
import { Activity, AlertTriangle, Play } from 'lucide-react'

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
          <ResultLeadConclusion
            leadInsight={leadInsight}
            secondaryInsights={secondaryInsights}
            visibleSummaryMetrics={visibleSummaryMetrics}
          />

          <ResultTables
            result={result}
            mainResultTable={mainResultTable}
            secondaryResultTables={secondaryResultTables}
          />

          <ResultSupportSection
            primaryDiagnostic={primaryDiagnostic}
            correlationMatrix={correlationMatrix}
            runLogs={runLogs}
          />
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
