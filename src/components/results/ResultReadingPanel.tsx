/**
 * ResultReadingPanel - extracted from App.tsx
 * Displays the main result-reading area: estimate overview, conclusion, and additional tables.
 * No business logic; purely presentational.
 */
import type { ModelResult, ModelMetric, ModelResultTable } from '../../models/types'
import { ResultEstimateOverview } from './ResultEstimateOverview'
import { ResultTables } from './ResultTables'
import { ResultLeadConclusion } from './ResultLeadConclusion'
import { Activity, AlertTriangle, Play } from 'lucide-react'

type ResultReadingPanelProps = {
  result: ModelResult | null
  isModelRunning: boolean
  hasStaleResult: boolean
  modelName: string
  formula: string
  leadInsight: string
  secondaryInsights: string[]
  visibleSummaryMetrics: ModelMetric[]
  mainResultTable: ModelResultTable | null
  secondaryResultTables: ModelResultTable[]
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
    isModelRunning,
    hasStaleResult,
    modelName,
    formula,
    leadInsight,
    secondaryInsights,
    visibleSummaryMetrics,
    mainResultTable,
    secondaryResultTables,
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
          <ResultEstimateOverview
            modelName={modelName}
            formula={formula}
            visibleSummaryMetrics={visibleSummaryMetrics}
            mainResultTable={mainResultTable}
          />

          <ResultLeadConclusion
            leadInsight={leadInsight}
            secondaryInsights={secondaryInsights}
          />

          <ResultTables secondaryResultTables={secondaryResultTables} />
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
