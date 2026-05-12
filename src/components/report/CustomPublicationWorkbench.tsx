import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import type {
  CustomPublicationColumnDraft,
  CustomPublicationConfig,
  CustomPublicationFormatRules,
  CustomPublicationFormatRulesDraft,
  CustomPublicationTemplate,
} from '../../export/customPublicationConfig'
import type { CustomPublicationDragItem } from '../../export/customPublicationActions'
import type { CustomPublicationOption, CustomPublicationStatisticOption } from '../../export/customPublicationOptions'
import type { CustomPublicationSource, PublicationTable } from '../../export/publicationTables'
import type { ModelComparisonSource, ModelComparisonTable } from '../../models/modelComparison'

type CustomPublicationWorkbenchProps = {
  config: CustomPublicationConfig
  sources: CustomPublicationSource[]
  selectedSources: CustomPublicationSource[]
  selectedSourceIds: Set<string>
  variableOptions: CustomPublicationOption[]
  statisticOptions: CustomPublicationStatisticOption[]
  hiddenVariableIds: Set<string>
  disabledStatisticIds: Set<string>
  templates: CustomPublicationTemplate[]
  defaultTemplateId: string
  previewTable: PublicationTable | null
  previewHtml: string
  displayTitle: string
  templateStatus: string
  isDefaultTableMode: boolean
  comparisonSources: ModelComparisonSource[]
  comparisonSelectedIds: Set<string>
  comparisonTable: ModelComparisonTable | null
  isExporting: boolean
  exportError: string
  onStartCustom: () => void
  onRestoreDefaults: () => void
  onResetOrdering: () => void
  onSaveTemplate: () => void
  onApplyDefaultTemplate: () => void
  onUpdateText: (patch: Partial<Pick<CustomPublicationConfig, 'title' | 'note'>>) => void
  onUpdateFormatRules: (patch: CustomPublicationFormatRulesDraft) => void
  onToggleSource: (sourceId: string) => void
  onUpdateColumn: (sourceId: string, patch: Partial<Omit<CustomPublicationColumnDraft, 'id'>>) => void
  onMoveColumn: (sourceId: string, direction: 'up' | 'down') => void
  onToggleVariable: (variableId: string) => void
  onMoveVariable: (variableId: string, direction: 'up' | 'down') => void
  onUpdateVariableLabel: (variableId: string, label: string) => void
  onSetAllVariables: (visible: boolean) => void
  onToggleStatistic: (statisticId: string) => void
  onMoveStatistic: (statisticId: string, direction: 'up' | 'down') => void
  onUpdateStatisticLabel: (statisticId: string, label: string) => void
  onSetAllStatistics: (enabled: boolean) => void
  onSetDraggingItem: (item: CustomPublicationDragItem | null) => void
  onDropItem: (kind: CustomPublicationDragItem['kind'], targetId: string) => void
  onApplyTemplate: (templateId: string) => void
  onDuplicateTemplate: (templateId: string) => void
  onRenameTemplate: (templateId: string, name: string) => void
  onSetDefaultTemplate: (templateId: string) => void
  onDeleteTemplate: (templateId: string) => void
  onToggleComparisonSource: (sourceId: string) => void
  onSendComparisonToCustom: () => void
}

type CustomPublicationExportSummaryProps = {
  displayTitle: string
  selectedSourceCount: number
  visibleVariableCount: number
  enabledStatisticCount: number
  templateStatus: string
  hasDefaultTemplate: boolean
  hasResult: boolean
  onOpen: () => void
}

const sourceKindLabel = (source: CustomPublicationSource) => (source.id === 'current' ? '当前结果' : '历史结果')

const sourceDateLabel = (source: CustomPublicationSource) => {
  if (!source.createdAt) return ''
  return new Date(source.createdAt).toLocaleString()
}

const formatModeLabel = (config: CustomPublicationConfig) => {
  const parenthesis = config.formatRules.parenthesisMode === 'stdError' ? '标准误' : config.formatRules.parenthesisMode === 'z' ? 'z 值' : 't 值'
  return `${config.formatRules.coefficientDigits} 位系数 · ${parenthesis} · ${config.formatRules.booleanDisplay === 'yes-blank' ? 'Yes/空白' : 'Yes/No'}`
}

const numberFromInput = (value: string) => (value.trim() === '' ? Number.NaN : Number(value))

export function CustomPublicationWorkbench({
  config,
  sources,
  selectedSources,
  selectedSourceIds,
  variableOptions,
  statisticOptions,
  hiddenVariableIds,
  disabledStatisticIds,
  templates,
  defaultTemplateId,
  previewTable,
  previewHtml,
  displayTitle,
  templateStatus,
  isDefaultTableMode,
  comparisonSources,
  comparisonSelectedIds,
  comparisonTable,
  isExporting,
  exportError,
  onStartCustom,
  onRestoreDefaults,
  onResetOrdering,
  onSaveTemplate,
  onApplyDefaultTemplate,
  onUpdateText,
  onUpdateFormatRules,
  onToggleSource,
  onUpdateColumn,
  onMoveColumn,
  onToggleVariable,
  onMoveVariable,
  onUpdateVariableLabel,
  onSetAllVariables,
  onToggleStatistic,
  onMoveStatistic,
  onUpdateStatisticLabel,
  onSetAllStatistics,
  onSetDraggingItem,
  onDropItem,
  onApplyTemplate,
  onDuplicateTemplate,
  onRenameTemplate,
  onSetDefaultTemplate,
  onDeleteTemplate,
  onToggleComparisonSource,
  onSendComparisonToCustom,
}: CustomPublicationWorkbenchProps) {
  const visibleVariableCount = variableOptions.filter((option) => !hiddenVariableIds.has(option.id)).length
  const enabledStatisticCount = statisticOptions.filter((option) => !disabledStatisticIds.has(option.id)).length
  const sourceRows = [...selectedSources, ...sources.filter((source) => !selectedSourceIds.has(source.id))]

  return (
    <section className="publication-workbench">
      <div className="publication-workbench__editor">
        <section className="publication-workbench__hero">
          <div>
            <span className="panel__label">Paper Table Workspace</span>
            <h2>{displayTitle}</h2>
            <p>把来源列、变量行、统计行和注释整理成一张适合 Excel、Word 和 HTML 导出的论文表。</p>
          </div>
        </section>

        <div className="publication-workbench__meta">
          <span>{selectedSources.length} 个来源列</span>
          <span>{visibleVariableCount} 个显示变量</span>
          <span>{enabledStatisticCount} 个统计行</span>
          <span>{formatModeLabel(config)}</span>
          {isDefaultTableMode ? <span>与直接论文三线表一致</span> : null}
          <span>{templateStatus}</span>
        </div>

        {isDefaultTableMode ? (
          <div className="custom-publication-mode-notice">
            <div>
              <strong>当前使用“当前结果论文三线表”模式</strong>
              <span>预览和导出会复用直接导出的论文三线表。点击开始自定义、添加历史来源或修改表格规则后，才进入自定义多列表模式。</span>
            </div>
            <button className="secondary-button" type="button" onClick={onStartCustom} disabled={isExporting}>
              开始自定义多列表
            </button>
          </div>
        ) : null}

        {exportError ? (
          <div className="export-error" role="alert">
            <AlertTriangle size={15} />
            {exportError}
          </div>
        ) : null}

        <div className="report-workbench-layout">
          <div className="report-workbench-console">
            <section className="custom-publication-panel custom-publication-panel--workspace">
              <div className="custom-publication-toolbar">
                <div className="custom-publication-toolbar__group">
                  <button className="secondary-button" type="button" onClick={onResetOrdering} disabled={isExporting}>
                    恢复默认顺序
                  </button>
                  <button className="secondary-button" type="button" onClick={onRestoreDefaults} disabled={isExporting}>
                    恢复同款模式
                  </button>
                  <button className="secondary-button" type="button" onClick={onSaveTemplate} disabled={isExporting}>
                    保存模板
                  </button>
                  <button className="secondary-button" type="button" onClick={onApplyDefaultTemplate} disabled={isExporting || !defaultTemplateId}>
                    应用默认模板
                  </button>
                </div>
              </div>

              <section className="report-editor-section">
                <div className="report-editor-section__header">
                  <div>
                    <strong>表格基本信息</strong>
                    <span>表名和注释会同步进入预览、Excel、Word 和 HTML 导出。</span>
                  </div>
                </div>
                <div className="custom-publication-fields">
                  <label>
                    <span>表名</span>
                    <input value={config.title} disabled={isExporting} onChange={(event) => onUpdateText({ title: event.target.value })} />
                  </label>
                  <label>
                    <span>注释</span>
                    <textarea value={config.note} disabled={isExporting} rows={3} onChange={(event) => onUpdateText({ note: event.target.value })} />
                  </label>
                </div>
              </section>

              <section className="report-editor-section">
                <div className="report-editor-section__header">
                  <div>
                    <strong>模型比较</strong>
                    <span>从当前结果和历史快照中选择多个结果，生成横向比较表，也可以一键送入自定义论文表。</span>
                  </div>
                  <button className="secondary-button" type="button" onClick={onSendComparisonToCustom} disabled={isExporting || !comparisonTable}>
                    送入自定义表
                  </button>
                </div>
                {comparisonSources.length === 0 ? (
                  <div className="empty-history">暂无可比较结果。运行模型或保存带结果的快照后会出现在这里。</div>
                ) : (
                  <>
                    <div className="model-comparison-source-list">
                      {comparisonSources.map((source) => (
                        <label className="model-comparison-source" key={source.id}>
                          <input
                            type="checkbox"
                            checked={comparisonSelectedIds.has(source.id)}
                            disabled={isExporting}
                            onChange={() => onToggleComparisonSource(source.id)}
                          />
                          <span>
                            <strong>{source.label}</strong>
                            <small>{source.modelShortName} · {source.formula}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {comparisonTable ? (
                      <div className="model-comparison-table-wrap">
                        <table className="model-comparison-table">
                          <thead>
                            <tr>
                              <th>项目</th>
                              {comparisonTable.columns.map((column) => (
                                <th key={column.id}>{column.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonTable.rows.map((row) => (
                              <tr key={row.id} className={`is-${row.role}`}>
                                <th>{row.label}</th>
                                {row.values.map((value, index) => (
                                  <td key={`${row.id}-${comparisonTable.columns[index]?.id ?? index}`}>{value}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-history">至少选择一个结果后生成比较表。</div>
                    )}
                  </>
                )}
              </section>

              <section className="report-editor-section">
                <div className="report-editor-section__header">
                  <div>
                    <strong>来源列与多级表头</strong>
                    <span>当前结果和历史结果都在这里管理；模型行默认使用模型简称，可手动覆盖。</span>
                  </div>
                </div>
                <div className="custom-publication-source-list custom-publication-source-list--workspace">
                  {sources.length === 0 ? (
                    <div className="empty-history">暂无可用结果。运行模型或保存带结果的历史记录后可联合导出。</div>
                  ) : (
                    sourceRows.map((source, sourceIndex) => {
                      const draft = config.columns[source.id] ?? {
                        id: source.id,
                        label: `(${sourceIndex + 1})`,
                        group: '',
                        modelLabel: source.modelShortName || source.modelName || '',
                      }
                      const isSelected = selectedSourceIds.has(source.id)
                      const selectedIndex = selectedSources.findIndex((entry) => entry.id === source.id)
                      return (
                        <div
                          className={`custom-publication-source ${isSelected ? 'is-selected' : ''}`}
                          key={source.id}
                          draggable={isSelected}
                          onDragStart={() => onSetDraggingItem({ kind: 'column', id: source.id })}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => onDropItem('column', source.id)}
                          onDragEnd={() => onSetDraggingItem(null)}
                        >
                          <label className="custom-publication-source__check">
                            <input type="checkbox" checked={isSelected} disabled={isExporting} onChange={() => onToggleSource(source.id)} />
                            <span>
                              <strong>{source.label}</strong>
                              <small>{sourceKindLabel(source)} · {source.modelShortName || source.modelName || '未命名模型'}{sourceDateLabel(source) ? ` · ${sourceDateLabel(source)}` : ''}</small>
                              <small>{source.formula}</small>
                            </span>
                          </label>
                          <div className="custom-publication-source__fields">
                            <label>
                              <span>一级分组</span>
                              <input value={draft.group} placeholder="如 稳健性" disabled={isExporting || !isSelected} onChange={(event) => onUpdateColumn(source.id, { group: event.target.value })} />
                            </label>
                            <label>
                              <span>列名</span>
                              <input value={draft.label} placeholder="如 (1)" disabled={isExporting || !isSelected} onChange={(event) => onUpdateColumn(source.id, { label: event.target.value })} />
                            </label>
                            <label>
                              <span>模型行</span>
                              <input value={draft.modelLabel} placeholder={source.modelShortName || source.modelName || 'OLS'} disabled={isExporting || !isSelected} onChange={(event) => onUpdateColumn(source.id, { modelLabel: event.target.value })} />
                            </label>
                          </div>
                          {isSelected ? (
                            <div className="custom-publication-source__actions">
                              <button className="secondary-button" type="button" disabled={isExporting || selectedIndex <= 0} onClick={() => onMoveColumn(source.id, 'up')}>
                                上移
                              </button>
                              <button className="secondary-button" type="button" disabled={isExporting || selectedIndex === -1 || selectedIndex >= selectedSources.length - 1} onClick={() => onMoveColumn(source.id, 'down')}>
                                下移
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              <div className="report-editor-two-column">
                <RowsEditor
                  title="变量行"
                  description="勾选显示项，支持重命名、按钮排序和拖拽排序。"
                  emptyText="先选择至少一个包含回归结果的来源列。"
                  primaryActionLabel="全选"
                  secondaryActionLabel="全不选"
                  options={variableOptions}
                  isActive={(id) => !hiddenVariableIds.has(id)}
                  getDetail={(option) => option.id}
                  getValue={(option) => config.variableLabels[option.id] ?? option.label}
                  onPrimaryAction={() => onSetAllVariables(true)}
                  onSecondaryAction={() => onSetAllVariables(false)}
                  onToggle={onToggleVariable}
                  onRename={onUpdateVariableLabel}
                  onMove={onMoveVariable}
                  onSetDragging={(id) => onSetDraggingItem({ kind: 'variable', id })}
                  onDrop={(id) => onDropItem('variable', id)}
                  onClearDragging={() => onSetDraggingItem(null)}
                  disabled={isExporting}
                />
                <RowsEditor
                  title="统计行"
                  description="Controls、FE、N、Adj-R² 等统计行可自由开关、重命名和排序。"
                  emptyText="选择结果列后，这里会出现可配置的统计行。"
                  primaryActionLabel="全开"
                  secondaryActionLabel="全关"
                  options={statisticOptions}
                  isActive={(id) => !disabledStatisticIds.has(id)}
                  getDetail={(option) => option.detail}
                  getValue={(option) => config.statisticLabels[option.id] ?? option.label}
                  onPrimaryAction={() => onSetAllStatistics(true)}
                  onSecondaryAction={() => onSetAllStatistics(false)}
                  onToggle={onToggleStatistic}
                  onRename={onUpdateStatisticLabel}
                  onMove={onMoveStatistic}
                  onSetDragging={(id) => onSetDraggingItem({ kind: 'statistic', id })}
                  onDrop={(id) => onDropItem('statistic', id)}
                  onClearDragging={() => onSetDraggingItem(null)}
                  disabled={isExporting}
                />
              </div>

              <section className="report-editor-section">
                <div className="report-editor-section__header">
                  <div>
                    <strong>显示规则</strong>
                    <span>控制数字位数、括号统计、星号阈值以及缺失/布尔展示方式。</span>
                  </div>
                </div>
                <div className="custom-publication-style-card">
                  <span>表格样式</span>
                  <strong>论文三线表 / Stata 风格</strong>
                  <small>预览、Excel、Word 和 HTML 使用同一套黑白三线表规则；不输出编辑器里的绿色提示角或换行标记。</small>
                </div>
                <div className="custom-publication-format-grid">
                  <label><span>系数小数位</span><input type="number" min="0" max="8" step="1" inputMode="numeric" value={config.formatRules.coefficientDigits} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ coefficientDigits: numberFromInput(event.target.value) })} /></label>
                  <label><span>括号统计小数位</span><input type="number" min="0" max="8" step="1" inputMode="numeric" value={config.formatRules.statisticDigits} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ statisticDigits: numberFromInput(event.target.value) })} /></label>
                  <label><span>N 小数位</span><input type="number" min="0" max="4" step="1" inputMode="numeric" value={config.formatRules.nDigits} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ nDigits: numberFromInput(event.target.value) })} /></label>
                  <label><span>Adj-R² 小数位</span><input type="number" min="0" max="6" step="1" inputMode="numeric" value={config.formatRules.r2Digits} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ r2Digits: numberFromInput(event.target.value) })} /></label>
                  <label>
                    <span>括号统计</span>
                    <select value={config.formatRules.parenthesisMode} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ parenthesisMode: event.target.value as CustomPublicationFormatRules['parenthesisMode'] })}>
                      <option value="t">t 值</option>
                      <option value="z">z 值</option>
                      <option value="stdError">标准误</option>
                    </select>
                  </label>
                  <label>
                    <span>缺失显示</span>
                    <select value={config.formatRules.missingDisplay} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ missingDisplay: event.target.value as CustomPublicationFormatRules['missingDisplay'] })}>
                      <option value="">空白</option>
                      <option value="-">-</option>
                      <option value="/">/</option>
                    </select>
                  </label>
                  <label>
                    <span>布尔显示</span>
                    <select value={config.formatRules.booleanDisplay} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ booleanDisplay: event.target.value as CustomPublicationFormatRules['booleanDisplay'] })}>
                      <option value="yes-no">Yes / No</option>
                      <option value="yes-blank">Yes / 空白</option>
                      <option value="check">勾选语义</option>
                    </select>
                  </label>
                  <label><span>* 阈值</span><input type="number" step="0.001" min="0" max="1" inputMode="decimal" value={config.formatRules.starLevels.one} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ starLevels: { one: numberFromInput(event.target.value) } })} /></label>
                  <label><span>** 阈值</span><input type="number" step="0.001" min="0" max="1" inputMode="decimal" value={config.formatRules.starLevels.two} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ starLevels: { two: numberFromInput(event.target.value) } })} /></label>
                  <label><span>*** 阈值</span><input type="number" step="0.001" min="0" max="1" inputMode="decimal" value={config.formatRules.starLevels.three} disabled={isExporting} onChange={(event) => onUpdateFormatRules({ starLevels: { three: numberFromInput(event.target.value) } })} /></label>
                </div>
              </section>

              <section className="report-editor-section">
                <div className="report-editor-section__header">
                  <div>
                    <strong>用户模板</strong>
                    <span>保存你自己的论文表格式，后续可套用、复制、删除，并设置为默认模板。</span>
                  </div>
                </div>
                <div className="custom-publication-template-list">
                  {templates.length === 0 ? (
                    <div className="empty-history">还没有保存的模板。</div>
                  ) : (
                    templates.map((template) => (
                      <div className={`custom-publication-template ${defaultTemplateId === template.id ? 'is-default' : ''}`} key={template.id}>
                        <input value={template.name} disabled={isExporting} onChange={(event) => onRenameTemplate(template.id, event.target.value)} />
                        <small>{defaultTemplateId === template.id ? '默认模板 · ' : ''}更新于 {new Date(template.updatedAt).toLocaleString()}</small>
                        <div className="custom-publication-template__actions">
                          <button className="secondary-button" type="button" onClick={() => onApplyTemplate(template.id)} disabled={isExporting}>应用</button>
                          <button className="secondary-button" type="button" onClick={() => onDuplicateTemplate(template.id)} disabled={isExporting}>复制</button>
                          <button className="secondary-button" type="button" onClick={() => onSetDefaultTemplate(template.id)} disabled={isExporting}>{defaultTemplateId === template.id ? '默认中' : '设默认'}</button>
                          <button className="secondary-button is-danger" type="button" onClick={() => onDeleteTemplate(template.id)} disabled={isExporting}>删除</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </section>
          </div>

          <div className="publication-workbench__preview">
            <section className="publication-preview-card">
              <div className="publication-preview-card__header">
                <div>
                  <span className="panel__label">Live preview</span>
                  <h2>论文表预览</h2>
                  <p>预览会实时反映列顺序、变量显示、统计行与注释内容。</p>
                </div>
              </div>
              {previewTable ? (
                <div className="publication-preview-card__body">
                  <div className="custom-publication-preview__frame custom-publication-preview__frame--workspace" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              ) : (
                <div className="empty-history">先选择至少一个结果列，右侧会实时生成论文表预览。</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}

type RowsEditorProps<TOption extends CustomPublicationOption> = {
  title: string
  description: string
  emptyText: string
  primaryActionLabel: string
  secondaryActionLabel: string
  options: TOption[]
  isActive: (id: string) => boolean
  getDetail: (option: TOption) => string
  getValue: (option: TOption) => string
  onPrimaryAction: () => void
  onSecondaryAction: () => void
  onToggle: (id: string) => void
  onRename: (id: string, value: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onSetDragging: (id: string) => void
  onDrop: (id: string) => void
  onClearDragging: () => void
  disabled: boolean
}

function RowsEditor<TOption extends CustomPublicationOption>({
  title,
  description,
  emptyText,
  primaryActionLabel,
  secondaryActionLabel,
  options,
  isActive,
  getDetail,
  getValue,
  onPrimaryAction,
  onSecondaryAction,
  onToggle,
  onRename,
  onMove,
  onSetDragging,
  onDrop,
  onClearDragging,
  disabled,
}: RowsEditorProps<TOption>) {
  return (
    <section className="custom-publication-editor">
      <div className="custom-publication-editor__header">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="custom-publication-editor__toolbar">
        <button className="secondary-button" type="button" onClick={onPrimaryAction} disabled={disabled}>{primaryActionLabel}</button>
        <button className="secondary-button" type="button" onClick={onSecondaryAction} disabled={disabled}>{secondaryActionLabel}</button>
      </div>
      <div className="custom-publication-row-list custom-publication-row-list--workspace">
        {options.length === 0 ? (
          <div className="empty-history">{emptyText}</div>
        ) : (
          options.map((option, index) => {
            const active = isActive(option.id)
            return (
              <div
                className={`custom-publication-row ${active ? 'is-selected' : ''}`}
                key={option.id}
                draggable
                onDragStart={() => onSetDragging(option.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(option.id)}
                onDragEnd={onClearDragging}
              >
                <label className="custom-publication-row__check">
                  <input type="checkbox" checked={active} disabled={disabled} onChange={() => onToggle(option.id)} />
                  <span><strong>{option.label}</strong><small>{getDetail(option)}</small></span>
                </label>
                <div className="custom-publication-row__edit-line">
                  <input className="custom-publication-row__rename" value={getValue(option)} disabled={disabled} onChange={(event) => onRename(option.id, event.target.value)} />
                  <div className="custom-publication-row__actions">
                    <button
                      className="custom-publication-row__move-button"
                      type="button"
                      title="上移"
                      aria-label="上移"
                      disabled={disabled || index === 0}
                      onClick={() => onMove(option.id, 'up')}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="custom-publication-row__move-button"
                      type="button"
                      title="下移"
                      aria-label="下移"
                      disabled={disabled || index === options.length - 1}
                      onClick={() => onMove(option.id, 'down')}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

export function CustomPublicationExportSummary({
  displayTitle,
  selectedSourceCount,
  visibleVariableCount,
  enabledStatisticCount,
  templateStatus,
  hasDefaultTemplate,
  hasResult,
  onOpen,
}: CustomPublicationExportSummaryProps) {
  return (
    <div className="custom-publication-summary-card">
      <div className="custom-publication-summary-card__header">
        <div>
          <strong>自定义论文表</strong>
          <span>复杂编辑已迁移到独立 Report 工作区，这里只保留导出摘要。</span>
        </div>
        <button className="secondary-button" type="button" onClick={onOpen} disabled={!hasResult}>
          进入编辑器
        </button>
      </div>
      <div className="custom-publication-summary-card__grid">
        <div><span>当前表名</span><strong>{displayTitle}</strong></div>
        <div><span>来源列</span><strong>{selectedSourceCount} 个</strong></div>
        <div><span>变量行</span><strong>{visibleVariableCount} 个显示</strong></div>
        <div><span>统计行</span><strong>{enabledStatisticCount} 个启用</strong></div>
      </div>
      <p className="custom-publication-summary-card__footnote">
        {templateStatus}
        {hasDefaultTemplate ? ' · 已设置默认模板' : ''}
      </p>
    </div>
  )
}
