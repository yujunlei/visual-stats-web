export type ModelTestDataset = {
  modelId: string
  label: string
  fileName: string
  url: string
}

const testDataBasePath = '/model-test-data/'

const createDataset = (modelId: string, label: string, fileName: string): ModelTestDataset => ({
  modelId,
  label,
  fileName,
  url: `${testDataBasePath}${encodeURIComponent(fileName)}`,
})

export const modelTestDatasets: ModelTestDataset[] = [
  createDataset('frequency-analysis', '频数测试数据', '频数模型测试文件.csv'),
  createDataset('category-summary', '分类汇总测试数据', '分类汇总模型测试文件.csv'),
  createDataset('descriptive-statistics', '描述统计测试数据', '描述统计模型测试文件.csv'),
  createDataset('variance-analysis', '方差测试数据', '方差模型测试文件.csv'),
  createDataset('normality-test', '正态性检验测试数据', '正态性检验模型测试文件.csv'),
  createDataset('reliability-analysis', '信度分析测试数据', '信度分析模型测试文件.csv'),
  createDataset('item-analysis', '项目分析测试数据', '项目分析模型测试文件.csv'),
  createDataset('multiple-response-analysis', '多选题测试数据', '多选题模型测试文件.csv'),
  createDataset('nps-analysis', 'NPS 测试数据', 'NPS模型测试文件.csv'),
  createDataset('content-validity', '内容效度测试数据', '内容效度模型测试文件.csv'),
  createDataset('independent-t-test', '独立 t 检验测试数据', '独立t检验模型测试文件.csv'),
  createDataset('one-sample-t-test', '单样本 t 检验测试数据', '单样本t检验模型测试文件.csv'),
  createDataset('paired-t-test', '配对 t 检验测试数据', '配对t检验模型测试文件.csv'),
  createDataset('nonparametric-test', '非参数检验测试数据', '非参数检验模型测试文件.csv'),
  createDataset('correlation-analysis', '相关分析测试数据', '相关分析模型测试文件.csv'),
  createDataset('crosstab-chi-square', '交叉卡方测试数据', '交叉卡方模型测试文件.csv'),
  createDataset('linear-regression', '线性回归测试数据', '线性回归模型测试文件.csv'),
  createDataset('ordinary-regression', '普通回归测试数据', '普通回归模型测试文件.csv'),
  createDataset('logit-regression', 'LOGIT 回归测试数据', 'LOGIT回归模型测试文件.csv'),
  createDataset('vif-analysis', '共线性分析测试数据', '共线性分析模型测试文件.csv'),
  createDataset('partial-correlation', '偏相关测试数据', '偏相关模型测试文件.csv'),
  createDataset('hierarchical-regression', '分层回归测试数据', '分层回归模型测试文件.csv'),
  createDataset('grouped-regression', '分组回归测试数据', '分组回归模型测试文件.csv'),
  createDataset('stepwise-regression', '逐步回归测试数据', '逐步回归模型测试文件.csv'),
  createDataset('xtreg-fixed-effects', '面板固定效应测试数据', '面板固定效应模型测试文件.csv'),
  createDataset('reghdfe-regression', '高维固定效应测试数据', '高维固定效应模型测试文件.csv'),
  createDataset('mediation-analysis', '中介效应测试数据', '中介效应模型测试文件.csv'),
  createDataset('moderation-analysis', '调节效应测试数据', '调节效应模型测试文件.csv'),
  createDataset('moderated-mediation', '有调节中介测试数据', '有调节中介模型测试文件.csv'),
  createDataset('threshold-regression', '门槛回归测试数据', '门槛回归模型测试文件.csv'),
  createDataset('spatial-sar', '空间滞后 SAR 测试数据', '空间滞后SAR模型测试文件.csv'),
  createDataset('spatial-slx', '自变量空间滞后 SLX 测试数据', '自变量空间滞后SLX模型测试文件.csv'),
  createDataset('spatial-sdm', '空间杜宾 SDM 测试数据', '空间杜宾SDM模型测试文件.csv'),
  createDataset('spatial-sem', '空间误差 SEM 测试数据', '空间误差SEM模型测试文件.csv'),
  createDataset('spatial-sdem', '空间杜宾误差 SDEM 测试数据', '空间杜宾误差SDEM模型测试文件.csv'),
  createDataset('spatial-sac', '空间滞后误差 SAC 测试数据', '空间滞后误差SAC模型测试文件.csv'),
  createDataset('spatial-gns', '广义空间 GNS 测试数据', '广义空间GNS模型测试文件.csv'),
  createDataset('spatial-panel-sdm', '空间面板 SDM 测试数据', '空间面板SDM模型测试文件.csv'),
  createDataset('spatial-logit', '空间 Logit 测试数据', '空间Logit模型测试文件.csv'),
]

const modelTestDatasetById = new Map(modelTestDatasets.map((dataset) => [dataset.modelId, dataset]))

export const getModelTestDataset = (modelId: string | null | undefined) => {
  if (!modelId) return null
  return modelTestDatasetById.get(modelId) ?? null
}
