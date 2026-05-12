import { describe, expect, it } from 'vitest'
import { buildCompletedRunLogs, createInitialRunState, createRunSignature } from './useModelRun'
import type { ModelResult } from '../models/types'

const result: ModelResult = {
  id: 'test-result',
  summary: [],
  tables: [],
  diagnostics: [],
  warnings: ['模型警告'],
  message: 'done',
}

describe('useModelRun helpers', () => {
  it('creates stable run signatures from payloads', () => {
    expect(createRunSignature({ modelId: 'ols', fields: ['y', 'x'] })).toBe('{"modelId":"ols","fields":["y","x"]}')
  })

  it('creates the initial empty run state', () => {
    expect(createInitialRunState()).toMatchObject({
      result: null,
      error: '',
      signature: '',
    })
    expect(createInitialRunState().logs[0]?.message).toContain('导入数据')
  })

  it('adds preview maturity, limitation, result warning, and completion logs', () => {
    const logs = buildCompletedRunLogs(
      [{ level: 'info', message: 'worker log' }],
      result,
      '高维固定效应',
      { level: 'preview', label: '预览', description: '需要审慎解释' },
      ['限制说明'],
    )

    expect(logs.map((entry) => entry.message)).toEqual([
      'worker log',
      '高维固定效应当前为预览能力：需要审慎解释',
      '限制说明',
      '模型警告',
      '高维固定效应运行完成。',
    ])
  })
})
