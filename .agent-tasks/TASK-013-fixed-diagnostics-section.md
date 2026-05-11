# Task Brief

## Task Name

将诊断与运行日志改为结果页底部固定辅助区

## Assigned Agent

Frontend Implementer

## Goal

当前结果页中的“诊断与运行日志”仍然像一个可折叠补充面板，并带有“收起补充诊断 / 展开补充诊断”交互。现在需求改为：

- “诊断与运行日志”始终显示；
- 不再提供收起/展开按钮；
- 该区域固定放在结果页最底部；
- 视觉上作为辅助信息区，弱于“结果解读 / 模型摘要 / 系数估计”；
- 不影响模型计算、结果数据、导出逻辑。

目标视觉结构：

```text
结果页
  ├── 结果解读 / 核心结论
  ├── 模型摘要
  ├── 系数估计 / 统计表格
  └── 诊断与运行日志
       ├── 拟合诊断
       └── 运行日志
```

本任务允许做轻量 JSX 结构调整和 CSS 样式调整，但不得修改统计计算逻辑。

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
3. 在 `src/App.tsx` 中查找以下文本或相关区域：
   - `诊断与运行日志`
   - `收起补充诊断`
   - `展开补充诊断`
   - `补充诊断`
   - `result-support-row`
   - `result-diagnostic-card`
   - `result-log-card`
4. 找到控制“诊断与运行日志”折叠/展开的状态变量和按钮。
5. 移除或停用“收起补充诊断 / 展开补充诊断”按钮。
6. 让诊断与运行日志区域始终渲染在结果页底部。
7. 不要删除拟合诊断内容。
8. 不要删除运行日志内容。
9. 不要改变任何模型结果数据。
10. 不要改变导出逻辑。
11. 给外层诊断区域增加一个稳定 class，例如：
   - `result-support-section`
   - `result-support-section__header`
12. 如果原本已经有合适外层容器，可以复用，不要过度重构。
13. 在 CSS 中让该区域表现为结果页底部辅助区：
   - 顶部有分割线；
   - 标题较小；
   - 描述文本弱化；
   - 两个卡片并排显示，窄屏自动单列；
   - 不再出现可折叠按钮。
14. 完成后运行测试命令。

## Suggested JSX Direction

请根据当前真实代码谨慎调整，下面只是目标结构示意，不要求完全照抄：

```tsx
<section className="result-support-section">
  <div className="result-support-section__header">
    <div>
      <span className="panel__label">SUPPORT</span>
      <h3>诊断与运行日志</h3>
      <p>用于补充判断模型质量、运行过程和异常提示。</p>
    </div>
  </div>

  <div className="result-support-row">
    {/* existing diagnostic card */}
    {/* existing log card */}
  </div>
</section>
```

需要移除或停止渲染类似：

```tsx
<button>收起补充诊断</button>
<button>展开补充诊断</button>
```

如果存在类似 `showDiagnostics` / `diagnosticsCollapsed` / `isDiagnosticsCollapsed` 的状态，只要它不再使用，可以删除；如果删除会影响较大，可以保留但不再用于控制渲染。

## Suggested CSS Direction

可在 `src/App.css` 或 `src/styles/result-reading-container.css` 中新增/调整：

```css
.result-support-section {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.result-support-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.result-support-section__header h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}

.result-support-section__header p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.result-support-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

@media (max-width: 1280px) {
  .result-support-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

注意：

- 不要用 `display: none` 直接隐藏整个诊断区；
- 不要用 CSS 隐藏按钮但保留无用交互，优先从 JSX 移除按钮；
- 不要把诊断区放到结果页顶部；
- 不要影响右侧 context panel。

## Acceptance Criteria

- [ ] “诊断与运行日志”默认始终显示
- [ ] 页面上不再出现“收起补充诊断”
- [ ] 页面上不再出现“展开补充诊断”
- [ ] 拟合诊断仍然显示
- [ ] 运行日志仍然显示
- [ ] 诊断与运行日志位于结果页底部
- [ ] 诊断与运行日志视觉上弱于主要结果
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

建议人工检查：

```text
1. 运行一个模型并进入结果页。
2. 确认“诊断与运行日志”在结果页底部。
3. 确认没有“收起补充诊断 / 展开补充诊断”按钮。
4. 确认拟合诊断和运行日志仍然显示。
5. 缩小窗口宽度，确认两个卡片可以自动变成单列。
```

## Risk Notes

本任务风险中等，因为需要轻微修改 `App.tsx` 的结果页结构。

风险控制：

- 只移除诊断区折叠交互；
- 不移动模型结果数据；
- 不修改模型计算；
- 不修改导出表格；
- 不改 Electron；
- 不做大范围结果页重构。

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
