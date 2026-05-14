import { useCallback, useEffect, useState } from 'react'
import {
  developmentLicenseState,
  loadingLicenseState,
  type LicenseActivationResult,
  type LicenseState,
} from '../security/license'

const getLicenseApi = () => (typeof window === 'undefined' ? undefined : window.visualStatsDesktop?.license)

export function useLicense() {
  const [state, setState] = useState<LicenseState>(loadingLicenseState)
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    const api = getLicenseApi()
    if (!api) {
      setState(developmentLicenseState)
      return developmentLicenseState
    }

    try {
      setIsBusy(true)
      const nextState = await api.getStatus()
      setState(nextState)
      setError('')
      return nextState
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '读取授权状态失败。'
      const fallback: LicenseState = {
        status: 'error',
        plan: null,
        enabledModelPacks: [],
        features: [],
        message,
        isUsable: false,
      }
      setState(fallback)
      setError(message)
      return fallback
    } finally {
      setIsBusy(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadStatus()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadStatus])

  const runLicenseAction = useCallback(
    async (action: () => Promise<LicenseActivationResult>) => {
      try {
        setIsBusy(true)
        const result = await action()
        setState(result.status)
        setError(result.ok ? '' : result.error || result.status.message)
        return result
      } catch (currentError) {
        const message = currentError instanceof Error ? currentError.message : '授权操作失败。'
        setError(message)
        return {
          ok: false,
          status: {
            ...state,
            status: 'error' as const,
            isUsable: false,
            message,
          },
          error: message,
        }
      } finally {
        setIsBusy(false)
      }
    },
    [state],
  )

  const activate = useCallback(
    async (licenseKey: string) => {
      const api = getLicenseApi()
      if (!api) {
        setState(developmentLicenseState)
        return { ok: true, status: developmentLicenseState }
      }
      return runLicenseAction(() => api.activate(licenseKey))
    },
    [runLicenseAction],
  )

  const refresh = useCallback(async () => {
    const api = getLicenseApi()
    if (!api) return { ok: true, status: developmentLicenseState }
    return runLicenseAction(() => api.refresh())
  }, [runLicenseAction])

  const startTrial = useCallback(async () => {
    const api = getLicenseApi()
    if (!api) return { ok: true, status: developmentLicenseState }
    return runLicenseAction(() => api.startTrial())
  }, [runLicenseAction])

  const deactivate = useCallback(async () => {
    const api = getLicenseApi()
    if (!api) return { ok: true, status: developmentLicenseState }
    return runLicenseAction(() => api.deactivate())
  }, [runLicenseAction])

  return {
    state,
    error,
    isBusy,
    actions: {
      activate,
      refresh,
      startTrial,
      deactivate,
      loadStatus,
      clearError: () => setError(''),
    },
  }
}
