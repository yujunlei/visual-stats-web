import { describe, expect, it } from 'vitest'
import { csvRow } from './csv'

describe('shared csv helpers', () => {
  it('escapes CSV structure and spreadsheet formula prefixes', () => {
    expect(csvRow(['A,B', 'C"D', '=cmd()', '+1', '@ref'])).toBe('"A,B","C""D",\'=cmd(),\'+1,\'@ref')
  })
})
