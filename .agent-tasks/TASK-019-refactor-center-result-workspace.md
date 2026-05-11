# Task Brief

## Task Name

重构中间结果区：统一结果阅读结构并清理临时 CSS 覆盖

## Assigned Agent

Frontend Implementer

## Goal

当前中间结果区已经因为多轮 CSS 补丁和结构调整变得混乱，主要问题包括：

- “结果阅读”标题重复；
- 核心结论、模型摘要、系数估计、补充诊断之间层级不清；
- `result-reading-container.css` 等后加载样式与 `App.css` 重复覆盖；
- 大白底容器、青色容器、卡片容器多层套娃；
- 切换模型后可能继续出现错位、重叠、遮挡；
- 中间区整体不像一个稳定的专业统计工作台结果区。

本任务目标是做一次结构性整理，而不是继续局部 CSS 微调。

最终中间结果区应呈现为：

```text
阅读并解释结果（主工作区标题，由原有 report/header 保留）
  └── 结果阅读大容器
       ├── 核心结论
       ├── 模型摘要
       ├── 系数估计 / 统计表格
       └── 诊断与运行日志
```

要求：

1. 只保留一个“结果阅读”主概念，不要出现两个“结果阅读”标题；
2. 不要使用 `::before` / `::after` 伪元素制造标题；
3. 不要继续依赖多个后加载 CSS 覆盖文件叠加；
4. 结果阅读应是一个统一的大白底容器；
5. 核心结论、模型摘要、系数估计、补充诊断都在这个容器内；
6. 核心结论保持最突出，但不要再有外层青色大块套白色卡片；
7. 模型摘要和系数估计是同级子模块；
8. 诊断与运行日志固定在最底部，弱化展示，不再收起；
9. 不修改任何统计计算、模型输出、导出逻辑、Electron 逻辑。

## Allowed Files

```text
src/App.tsx
src/App.css
src/main.tsx
src/styles/result-reading-container.css
src/styles/result-reading-final-fix.css
src/components/results/
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

## Required Cleanup

必须清理之前造成混乱的样式覆盖：

1. 如果 `src/styles/result-reading-final-fix.css` 存在：
   - 删除该文件；
   - 删除 `src/main.tsx` 中对它的 import。

2. 对 `src/styles/result-reading-container.css` 做以下二选一处理：

   **推荐方案 A：删除这个文件**
   - 将必要的结果阅读样式合并回 `src/App.css`；
   - 删除 `src/main.tsx` 中对 `result-reading-container.css` 的 import；
   - 确保项目仍然通过 typecheck/lint/build。

   **备选方案 B：保留这个文件**
   - 只保留一套最终样式；
   - 删除历史残留的重复选择器；
   - 不要出现同一个 class 多次互相覆盖；
   - 不要再新增第三个 CSS 覆盖文件。

推荐优先采用方案 A：结果页样式回归 `App.css`，避免后续导入顺序继续造成问题。

## Implementation Steps

1. 阅读 `AGENTS.md`。
2. 阅读 `.agents/frontend-implementer.md`。
3. 查看当前 `src/main.tsx` 的 CSS import 顺序。
4. 查看 `src/App.tsx` 中结果页渲染结构，重点搜索：
   - `阅读并解释结果`
   - `结果阅读`
   - `核心结论`
   - `模型摘要`
   - `系数估计`
   - `诊断与运行日志`
   - `result-reading`
   - `result-primary-summary`
   - `result-tables`
   - `result-support-section`
5. 删除重复的内部“结果阅读”header，只保留外部主工作区标题。
6. 确保结果阅读大容器只负责包裹内容，不再额外制造第二个大标题。
7. 将核心结论、模型摘要、系数估计、诊断日志组织到统一父级下。
8. 清理临时 CSS 覆盖文件和无效 import。
9. 在 `App.css` 中建立一组最终、简洁、稳定的结果区样式。
10. 不要改模型结果数据结构。
11. 不要改导出按钮逻辑。
12. 不要改模型运行逻辑。
13. 不要改数据预处理逻辑。
14. 不要改 Electron。
15. 完成后运行测试命令。

## Target JSX Direction

不要求完全照抄，但最终结构应接近：

```tsx
<section className="result-reading-panel">
  <section className="result-reading-block result-reading-block--conclusion">
    {/* 核心结论 */}
  </section>

  <section className="result-reading-block result-reading-block--summary">
    {/* 模型摘要 */}
  </section>

  <section className="result-reading-block result-reading-block--tables">
    {/* 系数估计 / 统计表格 */}
  </section>

  <section className="result-reading-block result-reading-block--support">
    {/* 诊断与运行日志 */}
  </section>
</section>
```

如果当前代码改成这个结构风险过大，可以先复用已有结构，但必须保证：

- 视觉上只有一个大白底结果阅读容器；
- 没有重复“结果阅读”标题；
- 核心结论不再被青色大背景二次包裹；
- 模型摘要、系数估计、补充诊断都位于该容器内部。

## Target CSS Direction

最终建议在 `src/App.css` 中有一组清晰规则，例如：

```css
.result-reading-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.result-reading-block {
  min-width: 0;
}

.result-reading-block--conclusion {
  padding: 14px;
  border: 1px solid var(--accent-muted);
  border-radius: var(--radius-md);
  background: var(--accent-subtle);
}

.result-reading-block--summary,
.result-reading-block--tables,
.result-reading-block--support {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: rgba(248, 249, 246, 0.72);
}
```

注意：

- 不要再生成 `Natural-language findings`、`Statistical tables` 伪标题；
- 不要使用多个 CSS 文件互相覆盖；
- 不要让 `result-primary-summary` 既是布局容器又是视觉容器；
- 不要给核心结论套两层大卡片；
- 不要让“结果阅读”header 占过大空白。

## Acceptance Criteria

- [ ] 页面中只出现一个“结果阅读”概念，不再重复标题
- [ ] 核心结论、模型摘要、系数估计、诊断与运行日志都在一个统一结果阅读容器内
- [ ] 核心结论没有被青色大容器再套一层白色卡片
- [ ] 模型摘要和系数估计不再像脱离结果阅读区域
- [ ] 诊断与运行日志固定在最底部
- [ ] 页面无明显重叠、遮挡、漂浮标题
- [ ] 删除或清理 `result-reading-final-fix.css`
- [ ] 不再依赖多个后加载 CSS 文件叠加覆盖
- [ ] 不修改统计计算逻辑
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
1. 运行一个线性回归模型，进入结果页。
2. 确认中间结果区只有一个结果阅读层级。
3. 确认核心结论、模型摘要、系数估计、诊断日志都在同一个白底结果容器里。
4. 确认没有重复“结果阅读”标题。
5. 确认核心结论没有外层青色大块套白色卡片。
6. 缩小窗口宽度，确认不再明显遮挡或错位。
7. 切换模型，确认结构仍稳定。
```

## Risk Notes

本任务风险中等，因为会调整 `App.tsx` 结果页结构并清理 CSS。

必须避免：

- 修改模型计算；
- 修改导出数据；
- 修改数据预处理；
- 修改 Electron；
- 引入新依赖；
- 继续叠加新 CSS override 文件。

## Output Required

请输出：

```text
修改摘要：
文件列表：
删除了哪些临时/覆盖样式：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
