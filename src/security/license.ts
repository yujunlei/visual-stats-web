import type { ModelPackId } from '../models/types'

export type LicensePlan = 'trial' | 'basic' | 'professional' | 'enterprise' | 'development'

export type LicensedFeature = 'run-models' | 'report-export' | 'model-pack:core' | 'model-pack:advanced' | 'model-pack:experimental'

export type LicenseStatusKind =
  | 'loading'
  | 'development'
  | 'unlicensed'
  | 'trial'
  | 'active'
  | 'expired'
  | 'offline-expired'
  | 'invalid'
  | 'error'

export type LicenseState = {
  status: LicenseStatusKind
  plan: LicensePlan | null
  licenseId?: string
  productId?: string
  machineHash?: string
  issuedAt?: string
  expiresAt?: string
  offlineGraceUntil?: string
  enabledModelPacks: ModelPackId[]
  enabledModelIds?: string[]
  features: LicensedFeature[]
  message: string
  serverUrl?: string
  lastCheckedAt?: string
  isUsable: boolean
  isDevelopmentFallback?: boolean
}

export type LicenseActivationResult = {
  ok: boolean
  status: LicenseState
  error?: string
}

export type VisualStatsLicenseApi = {
  getStatus: () => Promise<LicenseState>
  activate: (licenseKey: string) => Promise<LicenseActivationResult>
  refresh: () => Promise<LicenseActivationResult>
  startTrial: () => Promise<LicenseActivationResult>
  deactivate: () => Promise<LicenseActivationResult>
}

const usableStatuses = new Set<LicenseStatusKind>(['development', 'trial', 'active'])

export const defaultLicensedModelPacks: ModelPackId[] = ['core']

export const professionalLicensedModelPacks: ModelPackId[] = ['core', 'advanced', 'experimental']

export const developmentLicenseState: LicenseState = {
  status: 'development',
  plan: 'development',
  enabledModelPacks: professionalLicensedModelPacks,
  features: ['run-models', 'report-export', 'model-pack:core', 'model-pack:advanced', 'model-pack:experimental'],
  message: '当前为浏览器开发模式，默认开放全部本地功能。正式桌面版会使用授权激活。',
  isUsable: true,
  isDevelopmentFallback: true,
}

export const loadingLicenseState: LicenseState = {
  status: 'loading',
  plan: null,
  enabledModelPacks: [],
  features: [],
  message: '正在读取授权状态。',
  isUsable: false,
}

export const getLicenseStatusLabel = (status: LicenseStatusKind) => {
  if (status === 'development') return '开发模式'
  if (status === 'active') return '已激活'
  if (status === 'trial') return '试用中'
  if (status === 'expired') return '授权过期'
  if (status === 'offline-expired') return '需联网验证'
  if (status === 'invalid') return '授权无效'
  if (status === 'error') return '授权异常'
  if (status === 'loading') return '读取中'
  return '未激活'
}

export const isLicenseUsable = (license: Pick<LicenseState, 'status' | 'isUsable'>) =>
  license.isUsable && usableStatuses.has(license.status)

export const licenseAllowsFeature = (license: LicenseState, feature: LicensedFeature) =>
  isLicenseUsable(license) && license.features.includes(feature)

export const licenseAllowsModelPack = (license: LicenseState, packId: ModelPackId) => {
  if (license.status === 'unlicensed' || license.status === 'loading') return packId === 'core'
  return isLicenseUsable(license) && license.enabledModelPacks.includes(packId)
}

export const licenseAllowsModelId = (license: LicenseState, modelId: string) => {
  if (!license.enabledModelIds || license.enabledModelIds.length === 0) return isLicenseUsable(license)
  return isLicenseUsable(license) && license.enabledModelIds.includes(modelId)
}

export const canRunLicensedModels = (license: LicenseState) => licenseAllowsFeature(license, 'run-models')

export const canExportLicensedReports = (license: LicenseState) => licenseAllowsFeature(license, 'report-export')
