import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

type ExternalUrlDecision =
  | { allowed: true; url: string; protocol: 'http:' | 'https:' }
  | { allowed: false; reason: 'unsupported-protocol' | 'invalid-url'; protocol?: string; logMessage: string }

type BrowserWindowWebPreferences = {
  preload: string
  contextIsolation: boolean
  nodeIntegration: boolean
  sandbox: boolean
}

type ElectronSecurityExports = {
  createBrowserWindowWebPreferences(preloadPath: string): BrowserWindowWebPreferences
  createExternalUrlDecision(url: string): ExternalUrlDecision
  openExternalUrl(
    url: string,
    dependencies: {
      shell: { openExternal(url: string): Promise<void> }
      writeLog(message: string): void
    },
  ): boolean
}

const requireFromTest = createRequire(import.meta.url)
const electronSecurity = requireFromTest('../electron/main.cjs') as ElectronSecurityExports

describe('Electron security guardrails', () => {
  it('keeps BrowserWindow renderer isolation enabled with sandboxed preload', () => {
    expect(electronSecurity.createBrowserWindowWebPreferences('/app/electron/preload.cjs')).toEqual({
      preload: '/app/electron/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
  })

  it('allows only http and https external URLs', () => {
    expect(electronSecurity.createExternalUrlDecision('https://example.com/help')).toMatchObject({
      allowed: true,
      protocol: 'https:',
      url: 'https://example.com/help',
    })
    expect(electronSecurity.createExternalUrlDecision('http://example.com/help')).toMatchObject({
      allowed: true,
      protocol: 'http:',
      url: 'http://example.com/help',
    })

    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<p>x</p>', 'mailto:test@example.com']) {
      const decision = electronSecurity.createExternalUrlDecision(url)
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) {
        expect(decision.reason).toBe('unsupported-protocol')
        expect(decision.logMessage).toContain('blocked-external-url')
      }
    }
  })

  it('does not call shell.openExternal for rejected or invalid URLs', () => {
    const openExternal = vi.fn(() => Promise.resolve())
    const writeLog = vi.fn()

    expect(
      electronSecurity.openExternalUrl('file:///etc/passwd', {
        shell: { openExternal },
        writeLog,
      }),
    ).toBe(false)
    expect(
      electronSecurity.openExternalUrl('not a url', {
        shell: { openExternal },
        writeLog,
      }),
    ).toBe(false)

    expect(openExternal).not.toHaveBeenCalled()
    expect(writeLog).toHaveBeenCalledTimes(2)
    expect(writeLog).toHaveBeenNthCalledWith(1, expect.stringContaining('protocol=file:'))
    expect(writeLog).toHaveBeenNthCalledWith(2, expect.stringContaining('invalid url=not a url'))
  })

  it('passes normalized http URLs to shell.openExternal', () => {
    const openExternal = vi.fn(() => Promise.resolve())
    const writeLog = vi.fn()

    expect(
      electronSecurity.openExternalUrl('https://example.com/path', {
        shell: { openExternal },
        writeLog,
      }),
    ).toBe(true)

    expect(openExternal).toHaveBeenCalledWith('https://example.com/path')
    expect(writeLog).not.toHaveBeenCalled()
  })
})
