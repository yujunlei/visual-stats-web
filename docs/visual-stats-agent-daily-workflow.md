# visual-stats-web 多 Agent 日常使用流程

## 当前架构

```text
Codex / GPT 5.5
  角色：Architect Reviewer
  职责：规划任务、拆分任务、审查 diff、判断是否合并

Hermes / MiniMax 2.6 / vs-frontend
  角色：Frontend Implementer
  职责：UI、JSX、CSS、布局、交互执行

Hermes / MiniMax 2.6 / vs-refactor
  角色：Refactor Implementer
  职责：抽组件、抽 hooks、抽 utils、低风险重构
```

---

## 目录结构

```text
visual-stats-web/              # 主仓库，只做最终合并和提交
visual-stats-web-frontend/     # Frontend Agent 执行区
visual-stats-web-refactor/     # Refactor Agent 执行区
```

---

## 日常任务流程

### 1. 在主仓库创建任务单

进入主仓库：

```bash
cd visual-stats-web
```

创建任务：

```bash
./scripts/agent-new-task.sh TASK-002 "Frontend Implementer" "新增顶部工作模式切换"
```

或：

```bash
./scripts/agent-new-task.sh TASK-002 "Refactor Implementer" "抽出结果页展示组件"
```

然后编辑生成的任务单：

```bash
.agent-tasks/TASK-002-xxx.md
```

必须补全：

```text
Goal
Allowed Files
Forbidden Files
Risk Notes
```

---

### 2. 同步任务到两个 worktree

在主仓库执行：

```bash
./scripts/agent-sync-worktrees.sh
```

---

### 3. 选择执行 Agent

如果是 UI / JSX / CSS / 页面交互任务：

```bash
cd ../visual-stats-web-frontend
./scripts/hermes-run-frontend.sh .agent-tasks/TASK-002-xxx.md
```

如果是抽组件 / hooks / utils / 低风险重构任务：

```bash
cd ../visual-stats-web-refactor
./scripts/hermes-run-refactor.sh .agent-tasks/TASK-002-xxx.md
```

---

### 4. 查看执行结果

在对应 worktree 中：

```bash
git status --short
git diff --stat
git diff
```

也可以运行：

```bash
./scripts/agent-diff-summary.sh
```

---

### 5. 导出审查包

在对应 worktree 中执行：

```bash
./scripts/agent-export-review-pack.sh .agent-tasks/TASK-002-xxx.md
```

会生成：

```text
.agent-reviews/TASK-002-xxx-时间戳/
  task.md
  git-status.txt
  git-diff-stat.txt
  git-diff.diff
  review-instructions.md
```

---

### 6. 让 Codex / GPT 5.5 审查

把以下内容交给 Codex：

```text
你是 visual-stats-web 的 Architect Reviewer Agent。

请阅读：
- AGENTS.md
- .agents/architect-reviewer.md
- .agent-reviews/当前任务/task.md
- .agent-reviews/当前任务/git-status.txt
- .agent-reviews/当前任务/git-diff-stat.txt
- .agent-reviews/当前任务/git-diff.diff

请按照 .agents/review-template.md 审查本次改动。

只做 review，不要直接修改代码。
```

如果 Codex 暂时不可用，可以把 review pack 上传给 ChatGPT 做审查。

---

### 7. 通过 Review 后生成干净 patch

在对应 worktree 中，只导出任务允许合并的文件，例如：

```bash
git diff -- src/App.tsx src/components/results/resultFormat.ts > ../TASK-002-clean.patch
```

如果有新文件，需要先：

```bash
git add -N path/to/new-file.tsx
```

再导出：

```bash
git diff -- path/to/changed-file path/to/new-file > ../TASK-002-clean.patch
```

---

### 8. 在主仓库应用 patch

进入主仓库：

```bash
cd ../visual-stats-web
```

应用前检查：

```bash
git apply --check ../TASK-002-clean.patch
```

应用：

```bash
git apply ../TASK-002-clean.patch
```

运行验证：

```bash
npm run typecheck
npm run lint
npm run build
```

---

### 9. 人工提交

三项通过后：

```bash
git status --short
git add <本次任务相关文件>
git commit -m "简洁描述本次改动"
```

---

### 10. 合并后重建或同步 worktree

如果任务很小，可以同步配置：

```bash
./scripts/agent-post-merge-sync.sh
```

如果 worktree 有残留，建议直接重建：

```bash
git worktree remove --force ../visual-stats-web-frontend || true
git worktree remove --force ../visual-stats-web-refactor || true
git worktree prune

git branch -D agent/frontend-sandbox || true
git branch -D agent/refactor-sandbox || true

git worktree add ../visual-stats-web-frontend -b agent/frontend-sandbox
git worktree add ../visual-stats-web-refactor -b agent/refactor-sandbox

./scripts/agent-sync-worktrees.sh
```

---

## 安全原则

### Agent 可以做

```text
执行任务单
修改允许文件
运行 typecheck/lint/build
导出 review pack
生成 patch
```

### Agent 不应该做

```text
直接 commit
直接 push
修改统计计算逻辑
修改 Electron 安全边界
修改 package.json 依赖
修改任务单禁止文件
自行扩大任务范围
```

---

## 常用命令速查

### 查看任务

```bash
./scripts/agent-list-tasks.sh
```

### 查看 Agent 状态

```bash
./scripts/agent-status.sh
```

### 查看 diff 摘要

```bash
./scripts/agent-diff-summary.sh
```

### 验证项目

```bash
./scripts/agent-verify.sh
```

### 同步任务和规则

```bash
./scripts/agent-sync-worktrees.sh
```

### 导出 review pack

```bash
./scripts/agent-export-review-pack.sh .agent-tasks/TASK-xxx.md
```

---

## 推荐任务粒度

好的任务：

```text
抽出 resultFormat.ts
新增 ResultNarrative 组件
折叠高级参数区
新增顶部 workspace mode 切换
优化右侧 context panel 文案
```

不好的任务：

```text
全面重构 App.tsx
优化所有前端代码
重做整个 UI
一次性拆完所有组件
修改模型计算和 UI
```

---

## 当前系统状态

当前已完成：

```text
AGENTS.md 已落地
.agents 角色规则已落地
两个 Hermes profiles 已创建
两个 worktree 已创建
任务创建脚本已可用
Hermes 执行脚本已可用
review pack 导出脚本已可用
首个 pilot refactor 任务已跑通
主仓库和两个 worktree 均健康
```
