export type Row = Record<string, string | number | null>

export type ColumnType = 'numeric' | 'category' | 'date' | 'text' | 'empty'

export type TypeOverrides = Record<string, ColumnType>

export type VariableProfile = {
  name: string
  type: ColumnType
  inferredType: ColumnType
  missing: number
  unique: number
  min?: number
  max?: number
}
