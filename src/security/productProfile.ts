import type { ModelPackId } from '../models/types'

export type PackagingTargetPlatform = 'win' | 'mac' | 'linux'

export type PackagingProfile = {
  productName: string
  appId: string
  version: string
  licenseServerUrl: string
  publicKeyPem: string
  enabledModelPacks: ModelPackId[]
  enabledModelIds: string[]
  disabledModelIds: string[]
  targetPlatform: PackagingTargetPlatform
  createdAt: string
}

export const allModelPackIds: ModelPackId[] = ['core', 'advanced', 'experimental']

export const defaultPackagingProfile: PackagingProfile = {
  productName: 'Visual Stats Lab',
  appId: 'com.visualstats.lab',
  version: '0.1.0',
  licenseServerUrl: 'https://license.visualstatslab.com',
  publicKeyPem: '',
  enabledModelPacks: allModelPackIds,
  enabledModelIds: [],
  disabledModelIds: [],
  targetPlatform: 'win',
  createdAt: '',
}

const isModelPackId = (value: unknown): value is ModelPackId =>
  typeof value === 'string' && (allModelPackIds as string[]).includes(value)

export function normalizePackagingProfile(input: unknown): PackagingProfile {
  const source = input && typeof input === 'object' ? (input as Partial<PackagingProfile>) : {}
  const enabledModelPacks = Array.isArray(source.enabledModelPacks)
    ? Array.from(new Set(source.enabledModelPacks.filter(isModelPackId)))
    : defaultPackagingProfile.enabledModelPacks
  const enabledModelIds = Array.isArray(source.enabledModelIds)
    ? Array.from(new Set(source.enabledModelIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())))
    : []
  const disabledModelIds = Array.isArray(source.disabledModelIds)
    ? Array.from(new Set(source.disabledModelIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())))
    : []

  return {
    productName: typeof source.productName === 'string' && source.productName.trim() ? source.productName.trim() : defaultPackagingProfile.productName,
    appId: typeof source.appId === 'string' && source.appId.trim() ? source.appId.trim() : defaultPackagingProfile.appId,
    version: typeof source.version === 'string' && source.version.trim() ? source.version.trim() : defaultPackagingProfile.version,
    licenseServerUrl:
      typeof source.licenseServerUrl === 'string' && source.licenseServerUrl.trim()
        ? source.licenseServerUrl.trim()
        : defaultPackagingProfile.licenseServerUrl,
    publicKeyPem: typeof source.publicKeyPem === 'string' ? source.publicKeyPem : '',
    enabledModelPacks: enabledModelPacks.length > 0 ? enabledModelPacks : defaultPackagingProfile.enabledModelPacks,
    enabledModelIds,
    disabledModelIds,
    targetPlatform: source.targetPlatform === 'mac' || source.targetPlatform === 'linux' ? source.targetPlatform : 'win',
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : '',
  }
}

export function parsePackagingProfileJson(raw: string | undefined): PackagingProfile {
  if (!raw) return defaultPackagingProfile
  try {
    return normalizePackagingProfile(JSON.parse(raw))
  } catch {
    return defaultPackagingProfile
  }
}

export function getEmbeddedPackagingProfile(): PackagingProfile {
  return parsePackagingProfileJson(import.meta.env.VITE_PRODUCT_PROFILE_JSON)
}

export function resolvePackagedModelIds(
  profile: Pick<PackagingProfile, 'enabledModelPacks' | 'enabledModelIds'> & { disabledModelIds?: string[] },
  catalogEntries: Array<{ id: string; packId: ModelPackId }>,
) {
  const packSet = new Set(profile.enabledModelPacks)
  const explicitIds = new Set(profile.enabledModelIds)
  const disabledIds = new Set(profile.disabledModelIds ?? [])
  return catalogEntries.filter((entry) => !disabledIds.has(entry.id) && (packSet.has(entry.packId) || explicitIds.has(entry.id))).map((entry) => entry.id)
}
