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

export type CustomPublicationFormatRulesDraft = Partial<Omit<CustomPublicationFormatRules, 'starLevels'>> & {
  starLevels?: Partial<CustomPublicationFormatRules['starLevels']>
}

export const customPublicationTemplateStorageKey = 'visual-stats-lab:custom-publication-templates'
export const customPublicationDefaultTemplateStorageKey = 'visual-stats-lab:custom-publication-default-template'
export const customPublicationDraftStorageKey = 'visual-stats-lab:custom-publication-draft'

const defaultFormatRulesValue: CustomPublicationFormatRules = {
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
}

const digitRanges = {
  coefficientDigits: { min: 0, max: 8 },
  statisticDigits: { min: 0, max: 8 },
  nDigits: { min: 0, max: 4 },
  r2Digits: { min: 0, max: 6 },
} satisfies Record<'coefficientDigits' | 'statisticDigits' | 'nDigits' | 'r2Digits', { min: number; max: number }>

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const finiteNumberOr = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

const normalizeDigit = (value: unknown, fallback: number, min: number, max: number) => clamp(Math.trunc(finiteNumberOr(value, fallback)), min, max)

const normalizeThreshold = (value: unknown, fallback: number) => Number(clamp(finiteNumberOr(value, fallback), 0, 1).toFixed(3))

const formatPublicationThreshold = (value: number) => {
  const normalized = normalizeThreshold(value, 0)
  return normalized.toString()
}

export const parenthesisModeLabel = (mode: CustomPublicationFormatRules['parenthesisMode']) => {
  if (mode === 'stdError') return '标准误'
  if (mode === 'z') return 'z 值'
  return 't 值'
}

const isParenthesisMode = (value: unknown): value is CustomPublicationFormatRules['parenthesisMode'] =>
  value === 't' || value === 'z' || value === 'stdError'

const isMissingDisplay = (value: unknown): value is CustomPublicationFormatRules['missingDisplay'] =>
  value === '' || value === '-' || value === '/'

const isBooleanDisplay = (value: unknown): value is CustomPublicationFormatRules['booleanDisplay'] =>
  value === 'yes-no' || value === 'yes-blank' || value === 'check'

export const defaultCustomPublicationFormatRules = (): CustomPublicationFormatRules => structuredClone(defaultFormatRulesValue)

export const normalizeCustomPublicationFormatRules = (candidate?: CustomPublicationFormatRulesDraft): CustomPublicationFormatRules => {
  const base = defaultCustomPublicationFormatRules()
  const one = normalizeThreshold(candidate?.starLevels?.one, base.starLevels.one)
  const two = Math.min(normalizeThreshold(candidate?.starLevels?.two, base.starLevels.two), one)
  const three = Math.min(normalizeThreshold(candidate?.starLevels?.three, base.starLevels.three), two)

  return {
    coefficientDigits: normalizeDigit(candidate?.coefficientDigits, base.coefficientDigits, digitRanges.coefficientDigits.min, digitRanges.coefficientDigits.max),
    statisticDigits: normalizeDigit(candidate?.statisticDigits, base.statisticDigits, digitRanges.statisticDigits.min, digitRanges.statisticDigits.max),
    nDigits: normalizeDigit(candidate?.nDigits, base.nDigits, digitRanges.nDigits.min, digitRanges.nDigits.max),
    r2Digits: normalizeDigit(candidate?.r2Digits, base.r2Digits, digitRanges.r2Digits.min, digitRanges.r2Digits.max),
    parenthesisMode: isParenthesisMode(candidate?.parenthesisMode) ? candidate.parenthesisMode : base.parenthesisMode,
    starLevels: { one, two, three },
    missingDisplay: isMissingDisplay(candidate?.missingDisplay) ? candidate.missingDisplay : base.missingDisplay,
    booleanDisplay: isBooleanDisplay(candidate?.booleanDisplay) ? candidate.booleanDisplay : base.booleanDisplay,
  }
}

export const buildCustomPublicationNote = (formatRules: CustomPublicationFormatRulesDraft) => {
  const normalizedRules = normalizeCustomPublicationFormatRules(formatRules)

  return `注：稳健标准误；括号内为 ${parenthesisModeLabel(normalizedRules.parenthesisMode)}；* p<${formatPublicationThreshold(
    normalizedRules.starLevels.one,
  )}，** p<${formatPublicationThreshold(normalizedRules.starLevels.two)}，*** p<${formatPublicationThreshold(normalizedRules.starLevels.three)}。`
}

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
    formatRules: normalizeCustomPublicationFormatRules(candidate?.formatRules),
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
