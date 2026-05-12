export type CustomPublicationColumnDraft = {
  id: string
  label: string
  group: string
  modelLabel: string
}

export type CustomPublicationFormatRules = {
  coefficientDigits: number
  statisticDigits: number
  nDigits: number
  r2Digits: number
  parenthesisMode: 't' | 'z' | 'stdError'
  starLevels: {
    one: number
    two: number
    three: number
  }
  missingDisplay: '' | '-' | '/'
  booleanDisplay: 'yes-no' | 'yes-blank' | 'check'
}

export type CustomPublicationMode = 'current-three-line' | 'custom'

export type CustomPublicationConfig = {
  mode: CustomPublicationMode
  title: string
  note: string
  selectedSourceIds: string[]
  columns: Record<string, CustomPublicationColumnDraft>
  columnOrder: string[]
  variableOrder: string[]
  variableLabels: Record<string, string>
  hiddenVariableIds: string[]
  statisticOrder: string[]
  statisticLabels: Record<string, string>
  disabledStatisticIds: string[]
  formatRules: CustomPublicationFormatRules
}

export type CustomPublicationTemplate = {
  id: string
  name: string
  updatedAt: string
  config: CustomPublicationConfig
}

type CustomPublicationConfigDraft = Partial<Omit<CustomPublicationConfig, 'formatRules'>> & {
  formatRules?: Partial<Omit<CustomPublicationFormatRules, 'starLevels'>> & {
    starLevels?: Partial<CustomPublicationFormatRules['starLevels']>
  }
}

export const customPublicationTemplateStorageKey = 'visual-stats-lab:custom-publication-templates'
export const customPublicationDefaultTemplateStorageKey = 'visual-stats-lab:custom-publication-default-template'
export const customPublicationDraftStorageKey = 'visual-stats-lab:custom-publication-draft'

const formatPublicationThreshold = (value: number) => {
  const normalized = Number(value.toFixed(3))
  return normalized.toString()
}

export const parenthesisModeLabel = (mode: CustomPublicationFormatRules['parenthesisMode']) => {
  if (mode === 'stdError') return '标准误'
  if (mode === 'z') return 'z 值'
  return 't 值'
}

export const buildCustomPublicationNote = (formatRules: CustomPublicationFormatRules) =>
  `注：稳健标准误；括号内为 ${parenthesisModeLabel(formatRules.parenthesisMode)}；* p<${formatPublicationThreshold(formatRules.starLevels.one)}，** p<${formatPublicationThreshold(
    formatRules.starLevels.two,
  )}，*** p<${formatPublicationThreshold(formatRules.starLevels.three)}。`

export const defaultCustomPublicationFormatRules = (): CustomPublicationFormatRules => ({
  coefficientDigits: 4,
  statisticDigits: 2,
  nDigits: 0,
  r2Digits: 3,
  parenthesisMode: 't',
  starLevels: {
    one: 0.1,
    two: 0.05,
    three: 0.01,
  },
  missingDisplay: '',
  booleanDisplay: 'yes-no',
})

export const defaultCustomPublicationConfig = (): CustomPublicationConfig => ({
  mode: 'current-three-line',
  title: '表 1：自定义回归结果',
  note: buildCustomPublicationNote(defaultCustomPublicationFormatRules()),
  selectedSourceIds: [],
  columns: {},
  columnOrder: [],
  variableOrder: [],
  variableLabels: {},
  hiddenVariableIds: [],
  statisticOrder: [],
  statisticLabels: {},
  disabledStatisticIds: [],
  formatRules: defaultCustomPublicationFormatRules(),
})

export const normalizeCustomPublicationConfig = (candidate?: CustomPublicationConfigDraft): CustomPublicationConfig => {
  const base = defaultCustomPublicationConfig()
  return {
    ...base,
    ...candidate,
    mode: candidate?.mode === 'custom' ? 'custom' : 'current-three-line',
    columns: candidate?.columns ?? base.columns,
    columnOrder: candidate?.columnOrder ?? base.columnOrder,
    variableOrder: candidate?.variableOrder ?? base.variableOrder,
    variableLabels: candidate?.variableLabels ?? base.variableLabels,
    hiddenVariableIds: candidate?.hiddenVariableIds ?? base.hiddenVariableIds,
    statisticOrder: candidate?.statisticOrder ?? base.statisticOrder,
    statisticLabels: candidate?.statisticLabels ?? base.statisticLabels,
    disabledStatisticIds: candidate?.disabledStatisticIds ?? base.disabledStatisticIds,
    formatRules: {
      ...base.formatRules,
      ...(candidate?.formatRules ?? {}),
      starLevels: {
        ...base.formatRules.starLevels,
        ...(candidate?.formatRules?.starLevels ?? {}),
      },
    },
  }
}

export const loadCustomPublicationTemplates = () => {
  try {
    const stored = window.localStorage.getItem(customPublicationTemplateStorageKey)
    return stored
      ? (JSON.parse(stored) as CustomPublicationTemplate[]).map((template) => ({
          ...template,
          config: normalizeCustomPublicationConfig(template.config),
        }))
      : []
  } catch {
    return []
  }
}

export const loadCustomPublicationDefaultTemplateId = () => {
  try {
    return window.localStorage.getItem(customPublicationDefaultTemplateStorageKey) ?? ''
  } catch {
    return ''
  }
}

export const loadCustomPublicationDraft = () => {
  try {
    const stored = window.localStorage.getItem(customPublicationDraftStorageKey)
    return stored ? normalizeCustomPublicationConfig(JSON.parse(stored) as Partial<CustomPublicationConfig>) : defaultCustomPublicationConfig()
  } catch {
    return defaultCustomPublicationConfig()
  }
}
