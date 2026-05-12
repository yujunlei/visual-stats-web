import Papa from 'papaparse'
import type { SpatialWeightsParam } from './types'

const compactWeightCell = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim())

const parseDelimitedWeightLine = (line: string) =>
  line
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)

const parseGwtWeights = (text: string, fileName: string): SpatialWeightsParam | null => {
  const edges = text
    .split(/\r?\n/)
    .map((line) => parseDelimitedWeightLine(line))
    .flatMap((tokens) => {
      if (tokens.length < 3) return []
      const weight = Number(tokens[2])
      return Number.isFinite(weight) && weight !== 0 ? [{ from: tokens[0], to: tokens[1], weight }] : []
    })

  if (edges.length === 0) return null
  const nodeCount = new Set(edges.flatMap((edge) => [edge.from, edge.to])).size

  return {
    kind: 'spatial-weights',
    fileName,
    format: 'edge-list',
    edges,
    summary: `GWT · ${edges.length} 条边 · ${nodeCount} 个节点`,
  }
}

const parseGalWeights = (text: string, fileName: string): SpatialWeightsParam | null => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => parseDelimitedWeightLine(line))
    .filter((tokens) => tokens.length > 0)
  const edges: Array<{ from: string; to: string; weight: number }> = []
  let index = lines[0]?.length === 1 && Number.isFinite(Number(lines[0][0])) ? 1 : 0

  while (index < lines.length) {
    const header = lines[index]
    const from = header[0]
    const neighborCount = Number(header[1])
    if (!from || !Number.isFinite(neighborCount)) {
      index += 1
      continue
    }

    const neighbors = [...header.slice(2)]
    index += 1
    while (neighbors.length < neighborCount && index < lines.length) {
      neighbors.push(...lines[index])
      index += 1
    }

    neighbors.slice(0, neighborCount).forEach((to) => {
      if (to) edges.push({ from, to, weight: 1 })
    })
  }

  if (edges.length === 0) return null
  const nodeCount = new Set(edges.flatMap((edge) => [edge.from, edge.to])).size

  return {
    kind: 'spatial-weights',
    fileName,
    format: 'edge-list',
    edges,
    summary: `GAL · ${edges.length} 条邻接 · ${nodeCount} 个节点`,
  }
}

export const parseSpatialWeightsText = (text: string, fileName: string): SpatialWeightsParam => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'gwt') {
    const parsed = parseGwtWeights(text, fileName)
    if (parsed) return parsed
  }

  if (extension === 'gal') {
    const parsed = parseGalWeights(text, fileName)
    if (parsed) return parsed
  }

  const parsedWithHeader = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  })
  const headerRows = parsedWithHeader.data.filter((row) => Object.values(row).some((value) => compactWeightCell(value)))
  const headerFields = parsedWithHeader.meta.fields ?? []
  const normalizedFields = headerFields.reduce<Record<string, string>>((map, field) => {
    map[field.toLowerCase().trim()] = field
    return map
  }, {})
  const fromField = normalizedFields.from ?? normalizedFields.source ?? normalizedFields.origin ?? normalizedFields.i ?? normalizedFields.id ?? normalizedFields['起点'] ?? normalizedFields['来源'] ?? normalizedFields['源']
  const toField =
    normalizedFields.to ??
    normalizedFields.target ??
    normalizedFields.neighbor ??
    normalizedFields.neighbour ??
    normalizedFields.j ??
    normalizedFields['终点'] ??
    normalizedFields['目标'] ??
    normalizedFields['邻居']
  const weightField = normalizedFields.weight ?? normalizedFields.w ?? normalizedFields.value ?? normalizedFields.weights ?? normalizedFields['权重'] ?? normalizedFields['值']

  if (fromField && toField) {
    const edges = headerRows.flatMap((row) => {
      const from = compactWeightCell(row[fromField])
      const to = compactWeightCell(row[toField])
      const weight = weightField ? Number(row[weightField]) : 1
      return from && to && Number.isFinite(weight) && weight !== 0 ? [{ from, to, weight }] : []
    })

    if (edges.length > 0) {
      const nodeCount = new Set(edges.flatMap((edge) => [edge.from, edge.to])).size
      return {
        kind: 'spatial-weights',
        fileName,
        format: 'edge-list',
        edges,
        summary: `${edges.length} 条边 · ${nodeCount} 个节点`,
      }
    }
  }

  const matrixRows = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  }).data.filter((row) => row.some((value) => compactWeightCell(value)))
  if (matrixRows.length < 2) throw new Error('空间权重文件至少需要 2 行。')

  const header = matrixRows[0].map(compactWeightCell)
  const nodes = header.slice(1)
  const matrix = matrixRows.slice(1).map((row) => row.slice(1).map((value) => Number(value)))
  const rowNodes = matrixRows.slice(1).map((row) => compactWeightCell(row[0]))

  if (nodes.length === 0 || matrix.length === 0 || matrix.some((row) => row.length !== nodes.length || row.some((value) => !Number.isFinite(value)))) {
    throw new Error('空间权重文件无法识别。请使用 from/to/weight 边表，或第一行/第一列为空间 ID 的方阵 CSV。')
  }

  return {
    kind: 'spatial-weights',
    fileName,
    format: 'matrix',
    nodes: rowNodes.every(Boolean) ? rowNodes : nodes,
    matrix,
    summary: `${matrix.length}x${nodes.length} 权重矩阵`,
  }
}
