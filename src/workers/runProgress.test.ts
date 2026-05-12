import { describe, expect, it } from 'vitest'
import { estimateRunDuration, formatDuration, isSlowModel } from './runProgress'

describe('run progress helpers', () => {
  it('identifies slow model families', () => {
    expect(isSlowModel('reghdfe-regression')).toBe(true)
    expect(isSlowModel('spatial-sar')).toBe(true)
    expect(isSlowModel('linear-regression')).toBe(false)
  })

  it('estimates longer durations for slow models and large data', () => {
    expect(estimateRunDuration('linear-regression', 100)).toBe(1800)
    expect(estimateRunDuration('linear-regression', 6000)).toBe(3000)
    expect(estimateRunDuration('reghdfe-regression', 5000)).toBe(7800)
  })

  it('formats elapsed durations for the run UI', () => {
    expect(formatDuration(-1)).toBe('0s')
    expect(formatDuration(1200)).toBe('2s')
    expect(formatDuration(61_000)).toBe('1m 1s')
    expect(formatDuration(120_000)).toBe('2m')
  })
})
