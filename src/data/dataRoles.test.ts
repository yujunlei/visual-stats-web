import { describe, expect, it } from 'vitest'
import { fieldRoleLabel, fieldRoleValue, hasField, inferDataRoles, summarizeFields, withoutField } from './dataRoles'

describe('data role helpers', () => {
  it('infers common panel role columns', () => {
    const roles = inferDataRoles([
      {
        id: 1,
        year: 2020,
        industry: 'A',
        y: 1,
      },
    ])

    expect(roles).toEqual({
      idFields: ['id'],
      timeField: 'year',
      groupFields: ['industry'],
    })
  })

  it('labels role fields for the role picker', () => {
    const roles = { idFields: ['firm'], timeField: 'year', groupFields: ['province'] }

    expect(hasField(roles, 'firm')).toBe(true)
    expect(hasField(roles, 'x')).toBe(false)
    expect(fieldRoleLabel(roles, 'year')).toBe('TIME')
    expect(fieldRoleValue(roles, 'province')).toBe('group')
    expect(fieldRoleValue(roles, 'x')).toBe('model')
  })

  it('summarizes and removes fields without mutating input', () => {
    const fields = ['id', 'city']

    expect(summarizeFields(fields)).toBe('id, city')
    expect(summarizeFields([])).toBe('未设置')
    expect(withoutField(fields, 'id')).toEqual(['city'])
    expect(fields).toEqual(['id', 'city'])
  })
})
