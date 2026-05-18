import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getModelTestDataset, modelTestDatasets } from './modelTestDatasets'
import { modelCatalog } from '../models/catalog'

describe('modelTestDatasets', () => {
  it('maps every catalog model to a public CSV test file', () => {
    expect(modelTestDatasets).toHaveLength(modelCatalog.length)
    expect(new Set(modelTestDatasets.map((dataset) => dataset.modelId)).size).toBe(modelTestDatasets.length)

    modelCatalog.forEach(({ id }) => {
      const dataset = getModelTestDataset(id)
      expect(dataset?.modelId).toBe(id)
      expect(dataset?.label).toBeTruthy()
      expect(dataset?.fileName.endsWith('模型测试文件.csv')).toBe(true)
      expect(dataset?.url).toBe(`/model-test-data/${encodeURIComponent(dataset?.fileName ?? '')}`)
      expect(existsSync(resolve(process.cwd(), 'public/model-test-data', dataset?.fileName ?? ''))).toBe(true)
    })
  })

  it('keeps representative model filenames stable for manual testing', () => {
    expect(getModelTestDataset('nps-analysis')?.fileName).toBe('NPS模型测试文件.csv')
    expect(getModelTestDataset('linear-regression')?.fileName).toBe('线性回归模型测试文件.csv')
    expect(getModelTestDataset('reghdfe-regression')?.fileName).toBe('高维固定效应模型测试文件.csv')
    expect(getModelTestDataset('spatial-sdm')?.fileName).toBe('空间杜宾SDM模型测试文件.csv')
  })

  it('returns null when a model does not have bundled test data', () => {
    expect(getModelTestDataset('future-model')).toBeNull()
    expect(getModelTestDataset(null)).toBeNull()
  })
})
