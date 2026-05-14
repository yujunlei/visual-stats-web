# Task Brief

## Task Name

App.tsx 低风险组件拆分与右侧上下文面板抽象

## Assigned Agent

Codex Frontend

## Goal

在不改变统计计算、数据导入、模型运行、结果导出、Electron 授权边界的前提下，对 `src/App.tsx` 做首轮低风险组件拆分，并把右侧栏从固定“模型与参数”抽象为随当前工作区变化的上下文面板。

本任务只处理工作台两侧展示区域：

1. 将左侧“项目索引 / 历史快照”区域从 `App.tsx` 抽成展示组件；
2. 将右侧 `config-panel` 抽成 `RightContextPanel`；
3. `RightContextPanel` 根据 `workspaceMode` 显示不同上下文内容；
4. 保留三列式专业工作台布局；
5. 不改中心工作区、变量弹窗、模型库弹窗、导出弹窗、论文表工作台的行为。

目标体验：

- Data mode：右侧强调数据质量、字段角色、缺失值、面板平衡；
- Model mode：右侧强调模型身份、变量摘要、运行前检查、参数入口；
- Result mode：右侧强调显著性/方向解释、关键阅读建议、导出入口；
- Report mode：右侧强调导出指导、论文表/报告整理建议；
- Publication mode：保持现有论文表全宽工作区，不显示左右侧栏。

## Meta_Kim Governance Packet

```text
intentPacket:
  Goal: 首轮拆分 App.tsx 两侧栏，并让右侧上下文随工作区动态变化。
  Success Criteria: App.tsx 行数下降；右栏按 Data/Model/Result/Report 展示不同上下文；三列布局和现有核心流程不变。
  Out of Scope: 统计公式、模型插件、数据预处理、导出值、Electron/IPC/license 逻辑、依赖、中心结果组件大改。
  Risk Level: 中。主要风险是 props 传递遗漏、右栏按钮行为变更、CSS 覆盖导致布局回退。

fetchPacket:
  Files inspected:
    - AGENTS.md
    - .agents/codex-architect.md
    - .agents/codex-frontend.md
    - .codex/governance/meta-kim-contract.md
    - .codex/governance/karpathy-guidelines.md
    - src/App.tsx
    - src/App.css
    - src/hooks/useWorkbenchSession.ts
    - src/components/results/*
    - src/components/report/*
  Existing workflow assets:
    - .agent-tasks/TASK-021..TASK-025 已有结果区组件拆分先例。
    - npm run typecheck / lint / build / test 均可作为验证命令。
  Matching capability: Codex Frontend 负责 JSX、CSS、布局、交互状态和专业工作台呈现。
  Capability gaps: 当前没有 Playwright UI 回归脚本；本任务要求人工检查三列布局与流程。

dispatchBoard:
  Assigned Agent: Codex Frontend
  Worktree: ../visual-stats-web-frontend/
  Review Owner: Codex Architect
  Verification Commands:
    - npm run typecheck
    - npm run lint
    - npm run build
    - npm test
```

## Karpathy Discipline

```text
Assumptions:
  - 当前未提交改动视为用户已有工作，不得回退。
  - 本任务是首轮拆分，不追求一次性拆完整个 App.tsx。
  - 右侧上下文内容使用现有状态与文案组合，不新增业务状态。
Simplicity Check:
  - 只抽两侧栏展示组件，不改模型运行链路。
  - 组件 props 显式传递，不引入新的全局状态或 context。
Surgical Change Boundary:
  - 允许新增 workbench 展示组件和少量 CSS。
  - 不移动统计、导出、Electron、license IPC、worker 相关代码。
Verification Goal:
  - 静态校验与构建通过；现有测试通过；人工确认 Data/Model/Result/Report 右侧内容合理。
```

## Allowed Files

```text
src/App.tsx
src/App.css
src/components/workbench/ProjectIndexPanel.tsx
src/components/workbench/RightContextPanel.tsx
src/components/workbench/index.ts
```

如果实现中发现必须新增一个极小的同目录展示子组件，可以新增：

```text
src/components/workbench/*.tsx
```

但不得新增 hooks、utilities、状态管理文件或跨目录抽象。

## Forbidden Files

```text
src/models/*
src/data/*
src/export/*
src/workers/*
src/hooks/useWorkbenchSession.ts
src/hooks/useModelRun.ts
src/hooks/usePublicationWorkbench.ts
src/hooks/useLicense.ts
src/security/*
electron/*
tests/*
package.json
package-lock.json
vite.config.ts
tsconfig*.json
AGENTS.md
.agents/*
.codex/*
.agent-tasks/*
scripts/*
tools/*
build/*
public/*
```

## Implementation Steps

1. 阅读 `AGENTS.md`、`.agents/codex-frontend.md`、治理文件和本任务单。
2. 检查当前 `src/App.tsx` 中左侧 `<aside className="panel data-panel">` 与右侧 `<aside className="panel config-panel">` 的 JSX。
3. 新建 `src/components/workbench/ProjectIndexPanel.tsx`：
   - 只迁移左侧项目索引、当前项目、历史快照、快照管理相关展示 JSX；
   - 保持现有 className、按钮行为、文案、条件渲染；
   - props 显式声明，不读取全局状态。
4. 新建 `src/components/workbench/RightContextPanel.tsx`：
   - 迁移现有右栏模型卡、变量摘要和“设置变量与参数”入口；
   - 根据 `workspaceMode` 渲染 Data / Model / Result / Report 四种上下文；
   - Data mode 使用现有数据状态展示：数据规模、字段角色、缺失值提醒、面板诊断；
   - Model mode 保留现有模型身份、变量摘要、运行前检查、设置变量入口；
   - Result mode 使用现有 `resultInsights` / `leadInsight` / `secondaryInsights` / `modelMaturity` / `activeFormula` 等展示阅读建议，并提供导出入口；
   - Report mode 使用现有导出/论文表状态给出导出指导和入口；
   - 不新增复杂设置，不复制模型参数编辑器。
5. 新建或更新 `src/components/workbench/index.ts` 导出上述组件。
6. 更新 `src/App.tsx`：
   - 引入新组件；
   - 用 `<ProjectIndexPanel />` 替换左侧大段 JSX；
   - 用 `<RightContextPanel />` 替换右侧大段 JSX；
   - 保留 `workspaceMode !== 'publication'` 的左右栏显示规则；
   - 清理因此不再需要的局部变量或 imports。
7. 更新 `src/App.css`：
   - 仅添加/调整右侧上下文面板所需 class；
   - 不重写整体三列布局；
   - 不引入鲜艳仪表盘风格、渐变、装饰性大卡片。
8. 运行验证命令，并记录结果。

## Acceptance Criteria

- [ ] `src/components/workbench/ProjectIndexPanel.tsx` 存在，并承接左侧项目索引 JSX。
- [ ] `src/components/workbench/RightContextPanel.tsx` 存在，并承接右侧栏 JSX。
- [ ] `src/components/workbench/index.ts` 导出新增组件。
- [ ] `src/App.tsx` 行数明显下降，且仍保留顶层状态编排职责。
- [ ] 三列式专业工作台布局保留：左侧项目索引、中心主工作区、右侧上下文面板。
- [ ] Publication mode 仍保持自定义论文表工作区，不显示左右侧栏。
- [ ] Data mode 右侧显示数据质量/字段角色/面板诊断相关上下文。
- [ ] Model mode 右侧保留模型卡、变量摘要、运行前检查和设置变量入口。
- [ ] Result mode 右侧显示结果阅读/显著性/方向解释相关上下文，并保留导出入口。
- [ ] Report mode 右侧显示导出/论文表整理相关上下文。
- [ ] 数据导入入口仍可用。
- [ ] 模型库入口仍可用。
- [ ] 设置变量与参数入口仍可用。
- [ ] 运行模型按钮仍可用，且 disabled 条件不变。
- [ ] 导出结果入口仍可用。
- [ ] 快照保存、恢复、置顶、收藏、重命名、删除入口仍可用。
- [ ] 不修改统计计算逻辑。
- [ ] 不修改数据预处理逻辑。
- [ ] 不修改导出表数值生成逻辑。
- [ ] 不修改 Electron / IPC / license 逻辑。
- [ ] 不修改依赖。
- [ ] 不直接 commit。
- [ ] 不直接 push。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run lint` 通过。
- [ ] `npm run build` 通过。
- [ ] `npm test` 通过。

## Test Commands

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

## Manual Check

请人工检查以下流程：

```text
1. 启动应用，确认初始三列布局没有错位。
2. 选择模型，确认右栏进入 Model context，模型卡和变量入口可用。
3. 导入 CSV 或 XLSX，确认 Data mode 右栏显示数据规模、字段角色、面板诊断。
4. 设置变量并运行一个线性回归，确认结果生成后右栏进入 Result context。
5. 点击导出，确认 Report context / 导出 modal 不受影响。
6. 打开自定义导出表，确认 publication 工作区仍全宽展示。
7. 试一次保存和恢复快照，确认左栏行为未变。
```

## Risk Notes

- `App.tsx` 当前承载大量状态与回调，props 很多；执行时应优先显式 props，避免新建 context 或大型对象透传。
- 右侧面板只是上下文解释与入口，不应重新实现变量参数编辑器。
- 不要借本任务清理中心工作区、导出弹窗、模型库弹窗或 license dialog。
- 不要移动 `useWorkbenchSession` 的状态逻辑；本任务是展示层拆分。
- 若发现某段 JSX 依赖过多、迁移会导致大范围改动，应停止并输出依赖清单，而不是扩大范围。

## Output Required

请输出：

```text
修改摘要：
文件列表：
测试结果：
风险说明：
git diff 摘要：
verificationResult：
evolutionWriteback：
karpathyCheck：
```
