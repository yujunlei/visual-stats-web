export type PerformanceEventName =
  | 'import.started'
  | 'import.completed'
  | 'import.failed'
  | 'profile.completed'
  | 'modelRun.completed'
  | 'modelRun.failed'
  | 'export.completed'
  | 'export.failed'

export type PerformanceEvent = {
  name: PerformanceEventName
  durationMs?: number
  metadata?: Record<string, string | number | boolean | null>
  createdAt: string
}

const eventBuffer: PerformanceEvent[] = []
const maxEvents = 200

export const recordPerformanceEvent = (name: PerformanceEventName, durationMs?: number, metadata?: PerformanceEvent['metadata']) => {
  eventBuffer.push({
    name,
    durationMs: Number.isFinite(durationMs) ? Math.round(durationMs ?? 0) : undefined,
    metadata,
    createdAt: new Date().toISOString(),
  })
  if (eventBuffer.length > maxEvents) eventBuffer.splice(0, eventBuffer.length - maxEvents)
}

export const getPerformanceEvents = () => [...eventBuffer]

export const clearPerformanceEvents = () => {
  eventBuffer.splice(0)
}
