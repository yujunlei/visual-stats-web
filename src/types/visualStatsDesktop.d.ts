import type { VisualStatsLicenseApi } from '../security/license'

declare global {
  interface Window {
    visualStatsDesktop?: {
      platform: string
      versions: {
        electron: string
        chrome: string
      }
      license?: VisualStatsLicenseApi
    }
  }
}

export {}

