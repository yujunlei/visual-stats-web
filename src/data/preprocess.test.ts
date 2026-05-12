import { describe, expect, it } from 'vitest'
import { prepareModelData } from './preprocess'
import type { Row, VariableProfile } from './types'

const profile = (name: string, type: VariableProfile['type'], unique = 2, missing = 0): VariableProfile => ({
  name,
  type,
  inferredType: type,
  unique,
  missing,
})

describe('prepareModelData', () => {
  it('drops rows with missing target/features and logs the retained sample', () => {
    const rows: Row[] = [
      { y: 1, x: 2 },
      { y: 2, x: null },
      { y: null, x: 4 },
      { y: 4, x: 8 },
    ]
    const result = prepareModelData(
      rows,
      [profile('y', 'numeric'), profile('x', 'numeric')],
      { target: 'y', features: ['x'] },
      { missingStrategy: 'drop', categoricalEncoding: 'none' },
      false,
    )

    expect(result.rows).toEqual([
      { y: 1, x: 2 },
      { y: 4, x: 8 },
    ])
    expect(result.config.features).toEqual(['x'])
    expect(result.logs.some((entry) => entry.message.includes('预处理删除 2 行'))).toBe(true)
  })

  it('one-hot encodes categorical features while preserving omitted baseline semantics', () => {
    const rows: Row[] = [
      { y: 1, x: 2, group: 'A' },
      { y: 2, x: 3, group: 'B' },
      { y: 3, x: 4, group: 'C' },
    ]
    const result = prepareModelData(
      rows,
      [profile('y', 'numeric'), profile('x', 'numeric'), profile('group', 'category', 3)],
      { target: 'y', features: ['x', 'group'] },
      { missingStrategy: 'drop', categoricalEncoding: 'one-hot' },
      true,
    )

    expect(result.config.features).toEqual(['x', 'group=B', 'group=C'])
    expect(result.rows[0]).toMatchObject({ y: 1, x: 2, 'group=B': 0, 'group=C': 0 })
    expect(result.rows[1]).toMatchObject({ y: 2, x: 3, 'group=B': 1, 'group=C': 0 })
    expect(result.logs.some((entry) => entry.message.includes('one-hot 编码为 2 个虚拟变量'))).toBe(true)
  })

  it('filters high-cardinality categorical features instead of creating unstable dummies', () => {
    const rows: Row[] = Array.from({ length: 45 }, (_, index) => ({ y: index + 1, group: `g-${index}` }))
    const result = prepareModelData(
      rows,
      [profile('y', 'numeric'), profile('group', 'category', 45)],
      { target: 'y', features: ['group'] },
      { missingStrategy: 'drop', categoricalEncoding: 'one-hot' },
      true,
    )

    expect(result.config.features).toEqual([])
    expect(result.logs.some((entry) => entry.message.includes('已忽略高基数分类变量：group'))).toBe(true)
  })
})
