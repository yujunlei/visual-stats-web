import type { Row } from './types'

export type DataRoles = {
  idFields: string[]
  timeField: string
  groupFields: string[]
}

export const emptyDataRoles: DataRoles = {
  idFields: [],
  timeField: '',
  groupFields: [],
}

export const hasField = (roles: DataRoles, field: string) =>
  roles.idFields.includes(field) || roles.groupFields.includes(field) || roles.timeField === field

export const fieldRoleLabel = (roles: DataRoles, field: string) => {
  if (roles.idFields.includes(field)) return 'ID'
  if (roles.timeField === field) return 'TIME'
  if (roles.groupFields.includes(field)) return 'GROUP'
  return ''
}

export const fieldRoleValue = (roles: DataRoles, field: string) => {
  if (roles.idFields.includes(field)) return 'id'
  if (roles.timeField === field) return 'time'
  if (roles.groupFields.includes(field)) return 'group'
  return 'model'
}

export const summarizeFields = (fields: string[]) => (fields.length > 0 ? fields.join(', ') : '未设置')

export const withoutField = (fields: string[], field: string) => fields.filter((entry) => entry !== field)

export const inferDataRoles = (rows: Row[]): DataRoles => {
  const columns = Object.keys(rows[0] ?? {})
  const lower = (column: string) => column.toLowerCase()
  const idFields = columns.filter((column) => /(^id$|_id$|^id_|编号|代码|code$)/i.test(column)).slice(0, 2)
  const timeField =
    columns.find((column) => /(^year$|年份|年度)/i.test(column)) ??
    columns.find((column) => /(^date$|日期|time|month|月份|季度|quarter)/i.test(lower(column))) ??
    ''
  const groupFields = columns
    .filter((column) => !idFields.includes(column) && column !== timeField)
    .filter((column) => /(group|category|region|industry|segment|类别|分组|地区|行业)/i.test(column))
    .slice(0, 2)

  return { idFields, timeField, groupFields }
}
