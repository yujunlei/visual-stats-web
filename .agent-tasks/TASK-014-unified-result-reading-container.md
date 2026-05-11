# Task Brief

## Task Name

将结果阅读改为统一父级容器

## Assigned Agent

Frontend Implementer

## Goal

当前结果页中，“核心结论”“模型摘要”“系数估计”“补充诊断/运行日志”等模块在视觉和结构上仍然显得比较分散。

用户期望的理解是：

```text
结果阅读
  ├── 核心结论
  ├── 模型摘要
  ├── 系数估计
  └── 补充诊断 / 运行日志
```

因此，本任务目标是：

1. 让“结果阅读”成为结果页的大父级视觉容器；
2. 将核心结论、模型摘要、系数估计、补充诊断/运行日志都放入这个统一结果阅读区域；
3. 不再依赖 CSS 伪造父级关系；
4. 不新增 CSS 伪标题；
5. 保持结果页顺序清晰；
6. 不改变任何模型计算、统计结果、导出逻辑或 Electron 行为。

本任务允许修改 `App.tsx` 结构和结果页相关 CSS。

## Allowed Files

```text
src/App.tsx
src/App.css
src/styles/result-reading-container.css
```

## Forbidden Files

```text
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
3. 在 `src/App.tsx` 中定位结果页渲染区域，重点搜索：
   - `结果解读`
   - `核心结论`
   - `模型摘要`
   - `系数估计`
   - `诊断与运行日志`
   - `result-primary-panel`
   - `result-primary-summary`
   - `result-tables`
   - `result-support-section`
   - `result-support-row`
4. 判断当前 DOM 结构中，“核心结论 / 模型摘要 / 系数估计 / 补充诊断”是否为分散兄弟节点。
5. 将这些结果模块统一包裹到一个明确的大容器中，例如：
   - `section.result-reading-section`
   - 或复用/调整 `section.result-primary-panel`
6. 目标结构应接近：

```tsx
<section className="result-reading-section">
  <header className="result-reading-section__header">
    <div>
      <span className="panel__label">RESULT READING</span>
      <h2>结果阅读</h2>
      <p>先阅读核心结论，再查看模型摘要、系数估计与补充诊断。</p>
    </div>
    {/* 保留已有导出/操作按钮，如果当前结构中有 */}
  </header>

  <section className="result-primary-summary">
    {/* 核心结论 + 模型摘要 */}
  </section>

  <section className="result-tables">
    {/* 系数估计 / 统计表格 */}
  </section>

  <section className="result-support-section">
    {/* 诊断与运行日志 */}
  </section>
</section>
```

7. 不要求完全照抄示例结构，应基于当前真实代码做最小可行调整。
8. 不要删除现有模型摘要。
9. 不要删除现有系数估计。
10. 不要删除拟合诊断。
11. 不要删除运行日志。
12. 不要改变表格数据字段、统计指标、导出内容。
13. 不要修改模型运行逻辑。
14. 不要修改数据预处理逻辑。
15. 不要修改 Electron。
16. CSS 上应让大容器看起来像一个稳定白底区域：
   - 白底；
   - 明确边界；
   - 内部模块有层级；
   - 核心结论最突出；
   - 模型摘要和系数估计作为内部子模块；
   - 诊断与运行日志在最底部，视觉弱化。
17. 移除或避免以下错误做法：
   - 不要使用 `::before` / `::after` 生成“统计表格”“Natural-language findings”等标题；
   - 不要只靠 margin 修补；
   - 不要创建多个互相覆盖的大容器；
   - 不要让结果阅读外层和内部模块背景混乱。
18. 完成后运行测试命令。

## Suggested CSS Direction

可以在 `src/App.css` 或 `src/styles/result-reading-container.css` 中实现，但不要过度覆盖全局样式。

建议方向：

```css
.result-reading-section,
.result-primary-panel {
  min-width: 0;
  min-height: 0;
  padding: 22px 24px;
  border: 1px solid rgba(26, 29, 34, 0.1);
  border-radius: calc(var(--radius-md) + 6px);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.result-reading-section__header,
.result-primary-header {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.result-primary-summary,
.result-tables,
.result-support-section {
  min-width: 0;
  margin-top: 16px;
}

.result-primary-summary {
  border: 1px solid var(--accent-muted);
  background: var(--accent-subtle);
}

.result-tables,
.result-support-section {
  border: 1px solid var(--line);
  background: rgba(248, 249, 246, 0.72);
}
```

注意：

- 如果当前代码已经有 `result-primary-panel`，优先复用它作为结果阅读大容器；
- 不要再新增 `result-workspace-hierarchy.css`；
- 如果 `result-reading-container.css` 已存在，可以在其中调整；
- 不要重复引入 CSS 文件；
- 不要让 CSS import 顺序混乱。

## Acceptance Criteria

- [ ] 页面上“结果阅读”视觉上成为一个大父级区域
- [ ] 核心结论在结果阅读区域内部
- [ ] 模型摘要在结果阅读区域内部
- [ ] 系数估计在结果阅读区域内部
- [ ] 诊断与运行日志在结果阅读区域内部最底部
- [ ] 不再出现“收起补充诊断 / 展开补充诊断”
- [ ] 不使用 `::before` / `::after` 生成额外标题
- [ ] 不修改统计计算逻辑
- [ ] 不修改数据预处理逻辑
- [ ] 不修改导出逻辑
- [ ] 不修改 Electron
- [ ] 不修改 package.json
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过

## Test Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Manual Check

请人工检查：

```text
1. 运行一个回归模型，进入结果页。
2. 确认“结果阅读”白底区域包住核心结论、模型摘要、系数估计、诊断与运行日志。
3. 确认“诊断与运行日志”位于最底部。
4. 确认没有收起/展开按钮。
5. 切换不同模型，确认结果页模块仍然保持在同一个结果阅读容器内。
6. 缩小窗口宽度，确认没有明显遮挡、溢出、重叠。
```

## Risk Notes

本任务风险中等，因为需要调整 `App.tsx` 的结果页结构。

必须注意：

- 不要改变模型结果数据；
- 不要改变表格字段；
- 不要改变导出内容；
- 不要修改模型计算；
- 不要修改数据预处理；
- 不要修改 Electron；
- 不要只靠 CSS 伪造结构；
- 不要做大范围 UI 重设计。

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
