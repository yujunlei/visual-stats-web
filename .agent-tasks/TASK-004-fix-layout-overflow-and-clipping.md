# Task Brief

## Task Name

修复前端布局遮挡、溢出和父级裁切问题

## Assigned Agent

Frontend Implementer

## Goal

修复当前前端页面中部分组件出现遮挡、横向溢出、被父级区域裁切、没有被上级容器正确包含的问题。

本任务只做 CSS 层面的低风险布局修复，不修改业务逻辑、不修改统计计算、不修改 Electron。

重点修复方向：

1. 避免多层 `overflow: hidden` 导致子组件被裁切。
2. 让主工作区、结果区、面板区在内容较多时可以合理滚动。
3. 修复结果页表格、图表、日志、操作区横向溢出问题。
4. 修复三列式布局中间区域和右侧配置区域被挤压的问题。
5. 保留三列式专业统计工作台布局。
6. 不把页面改成分步向导、后台 dashboard 或大屏风格。

## Allowed Files

```text
src/App.css
```

## Forbidden Files

```text
src/App.tsx
src/index.css
src/models/*
src/data/*
src/export/*
electron/*
package.json
package-lock.json
AGENTS.md
.agents/*
.agent-tasks/*
scripts/*
```

## Implementation Steps

1. 阅读 `AGENTS.md`。
2. 阅读 `.agents/frontend-implementer.md`。
3. 只修改 `src/App.css`。
4. 检查并修复以下布局风险点：
   - `.app-shell`
   - `.workspace`
   - `.main-stage`
   - `.config-panel`
   - `.data-panel`
   - `.panel`
   - `.preview-panel`
   - `.result-panel`
   - `.chart-panel`
   - `.results-workspace`
   - `.result-primary-summary`
   - `.result-support-row`
   - `.result-secondary-tables`
   - `.result-tables`
   - `.coef-table`
   - `.coef-table__head`
   - `.coef-table__row`
   - `.topbar__actions`
   - `.export-actions`
   - `.run-status-actions`
5. 增加必要的 `min-width: 0` 和 `min-height: 0`，避免 grid/flex 子元素撑破父容器。
6. 减少不必要的 `overflow: hidden` 对内容区域的裁切。
7. 对主内容区使用合理滚动，例如 `overflow: auto` 和 `scrollbar-gutter: stable`。
8. 对结果区在较窄宽度下增加响应式单列降级，避免固定最小宽度撑破父级。
9. 对操作按钮组增加 `flex-wrap: wrap` 或等价安全处理，避免按钮覆盖标题。
10. 保留原有视觉风格，不做大幅 UI 重设计。
11. 不要修改 JSX。
12. 不要新增依赖。
13. 不要自动 commit。
14. 不要自动 push。
15. 完成后运行测试命令。

## Suggested CSS Strategy

可以参考但不要机械照抄以下方向，需结合当前 `src/App.css` 现有样式谨慎修改：

```css
.app-shell,
.workspace,
.main-stage,
.config-panel,
.data-panel,
.panel,
.preview-panel,
.result-panel,
.chart-panel {
  min-width: 0;
}

.workspace > *,
.main-stage > *,
.config-panel > *,
.data-panel > * {
  min-width: 0;
}

.main-stage {
  overflow: auto;
  scrollbar-gutter: stable;
}

.panel {
  min-height: 0;
}

.results-workspace,
.result-primary-panel,
.result-primary-summary,
.result-support-row,
.result-secondary-tables,
.result-tables,
.coef-table,
.coef-table__head,
.coef-table__row {
  min-width: 0;
}

.topbar__actions,
.export-actions,
.run-status-actions {
  min-width: 0;
  flex-wrap: wrap;
}

@media (max-width: 1280px) {
  .result-primary-summary,
  .result-support-row,
  .result-secondary-tables {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

注意：

- 如果某个区域必须保持内部滚动，不要简单全部改成 `overflow: visible`。
- 不要让整个页面出现双重混乱滚动。
- 优先让主工作区滚动，而不是让子表格撑破父级。
- 保持三列式布局稳定。

## Acceptance Criteria

- [ ] 只修改 `src/App.css`
- [ ] 不修改 `src/App.tsx`
- [ ] 不修改 `src/index.css`
- [ ] 不修改 `src/models/*`
- [ ] 不修改 `src/data/*`
- [ ] 不修改 `electron/*`
- [ ] 不修改 `package.json`
- [ ] 不改变统计计算逻辑
- [ ] 保留三列式工作台布局
- [ ] 中间主工作区内容不再被明显裁切
- [ ] 结果区表格不再撑破父级容器
- [ ] 操作按钮不覆盖标题或相邻区域
- [ ] 右侧配置面板内容可滚动
- [ ] 左侧历史/项目区内容可滚动
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过

## Test Commands

```bash
npm run typecheck
npm run lint
npm run build
```

建议额外人工检查：

```text
1. 缩小窗口宽度，看结果区是否横向撑破。
2. 进入结果页，看表格、日志、诊断区是否被父级裁切。
3. 打开右侧配置面板，看内容是否可滚动。
4. 打开左侧历史记录，看列表是否可滚动。
5. 检查顶部按钮组是否覆盖标题。
```

## Risk Notes

本任务风险中低，主要风险来自 CSS 覆盖范围过大。

需要注意：

- 不要为了修复溢出而破坏三列式布局。
- 不要全局取消所有 `overflow: hidden`。
- 不要让页面出现过多嵌套滚动条。
- 不要修改业务逻辑。
- 不要修改统计模型。
- 不要修改 Electron。
- 不要引入新依赖。
- 不要改变原有视觉风格太多。

## Output Required

请输出：

```text
修改摘要：
文件列表：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
