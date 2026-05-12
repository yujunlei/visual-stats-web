import type { Row } from './types'
import type { DataRoles } from './dataRoles'

export type PanelBalanceDiagnosis = {
  status: 'not-configured' | 'balanced' | 'unbalanced'
  title: string
  summary: string
  idCount: number
  timeCount: number
  expectedObservations: number
  actualObservations: number
  missingCombinations: number
  duplicateCombinations: number
  missingIdRows: number
  missingTimeRows: number
  examples: string[]
}

const compactValue = (value: Row[string]) => (value === null || value === undefined || value === '' ? '' : String(value))

const getCompositeId = (row: Row, idFields: string[]) => idFields.map((field) => compactValue(row[field])).join(' / ')

export const diagnosePanelBalance = (rows: Row[], roles: DataRoles): PanelBalanceDiagnosis => {
  const emptyDiagnosis = {
    status: 'not-configured' as const,
    title: '未设置面板维度',
    summary: '设置 ID 和 Time 字段后，系统会判断数据是否为平衡面板。',
    idCount: 0,
    timeCount: 0,
    expectedObservations: 0,
    actualObservations: rows.length,
    missingCombinations: 0,
    duplicateCombinations: 0,
    missingIdRows: 0,
    missingTimeRows: 0,
    examples: [],
  }

  if (rows.length === 0 || roles.idFields.length === 0 || !roles.timeField) return emptyDiagnosis

  const validRows = rows.filter((row) => roles.idFields.every((field) => compactValue(row[field])) && compactValue(row[roles.timeField]))
  const missingIdRows = rows.length - rows.filter((row) => roles.idFields.every((field) => compactValue(row[field]))).length
  const missingTimeRows = rows.length - rows.filter((row) => compactValue(row[roles.timeField])).length
  const ids = Array.from(new Set(validRows.map((row) => getCompositeId(row, roles.idFields)))).sort()
  const times = Array.from(new Set(validRows.map((row) => compactValue(row[roles.timeField])))).sort()
  const counts = new Map<string, number>()

  validRows.forEach((row) => {
    const key = `${getCompositeId(row, roles.idFields)}\u0000${compactValue(row[roles.timeField])}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const missingExamples: string[] = []
  let missingCombinations = 0
  ids.forEach((id) => {
    const missingTimes = times.filter((time) => !counts.has(`${id}\u0000${time}`))
    missingCombinations += missingTimes.length
    if (missingTimes.length > 0 && missingExamples.length < 4) {
      missingExamples.push(`${id} 缺少 ${missingTimes.slice(0, 4).join(', ')}${missingTimes.length > 4 ? ' 等时间点' : ''}`)
    }
  })

  const duplicateExamples: string[] = []
  let duplicateCombinations = 0
  counts.forEach((count, key) => {
    if (count <= 1) return
    duplicateCombinations += count - 1
    if (duplicateExamples.length < 3) {
      const [id, time] = key.split('\u0000')
      duplicateExamples.push(`${id} 在 ${time} 有 ${count} 条记录`)
    }
  })

  const issueExamples = [
    ...(missingIdRows > 0 ? [`${missingIdRows} 行缺少 ID 字段`] : []),
    ...(missingTimeRows > 0 ? [`${missingTimeRows} 行缺少 Time 字段`] : []),
    ...missingExamples,
    ...duplicateExamples,
  ].slice(0, 6)
  const expectedObservations = ids.length * times.length
  const status = missingCombinations === 0 && duplicateCombinations === 0 && missingIdRows === 0 && missingTimeRows === 0 ? 'balanced' : 'unbalanced'

  return {
    status,
    title: status === 'balanced' ? '平衡面板' : '不平衡面板',
    summary:
      status === 'balanced'
        ? '每个 ID 都覆盖相同 Time 集合，且没有重复 ID-Time 组合。'
        : '存在缺失 ID-Time 组合、重复组合，或维度字段缺失。',
    idCount: ids.length,
    timeCount: times.length,
    expectedObservations,
    actualObservations: validRows.length,
    missingCombinations,
    duplicateCombinations,
    missingIdRows,
    missingTimeRows,
    examples: issueExamples,
  }
}
