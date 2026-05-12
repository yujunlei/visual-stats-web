import { describe, expect, it } from 'vitest'
import { parseSpatialWeightsText } from './spatialWeightsParser'

describe('parseSpatialWeightsText', () => {
  it('parses GWT edge-list weights', () => {
    const weights = parseSpatialWeightsText('A B 1.5\nB C 2\nC A 0\n', 'neighbors.gwt')

    expect(weights.format).toBe('edge-list')
    expect(weights.summary).toBe('GWT · 2 条边 · 3 个节点')
    expect(weights.edges).toEqual([
      { from: 'A', to: 'B', weight: 1.5 },
      { from: 'B', to: 'C', weight: 2 },
    ])
  })

  it('parses GAL adjacency weights', () => {
    const weights = parseSpatialWeightsText('3\nA 2 B C\nB 1 A\nC 1 A\n', 'neighbors.gal')

    expect(weights.format).toBe('edge-list')
    expect(weights.summary).toBe('GAL · 4 条邻接 · 3 个节点')
    expect(weights.edges).toContainEqual({ from: 'A', to: 'B', weight: 1 })
    expect(weights.edges).toContainEqual({ from: 'A', to: 'C', weight: 1 })
  })

  it('parses CSV edge lists with common column names', () => {
    const weights = parseSpatialWeightsText('from,to,weight\nA,B,0.5\nB,C,1\nA,C,0\n', 'neighbors.csv')

    expect(weights.format).toBe('edge-list')
    expect(weights.summary).toBe('2 条边 · 3 个节点')
    expect(weights.edges).toEqual([
      { from: 'A', to: 'B', weight: 0.5 },
      { from: 'B', to: 'C', weight: 1 },
    ])
  })

  it('parses square matrix weights', () => {
    const weights = parseSpatialWeightsText(',A,B\nA,0,1\nB,1,0\n', 'matrix.csv')

    expect(weights.format).toBe('matrix')
    expect(weights.summary).toBe('2x2 权重矩阵')
    expect(weights.nodes).toEqual(['A', 'B'])
    expect(weights.matrix).toEqual([
      [0, 1],
      [1, 0],
    ])
  })

  it('throws a helpful error for unrecognized files', () => {
    expect(() => parseSpatialWeightsText('only-one-line', 'bad.csv')).toThrow('空间权重文件至少需要 2 行。')
  })
})
