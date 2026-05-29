# 开发者 AI 开发与 PR 流程

请开发者先让自己的 AI 阅读此文件。AI 在本仓库里进行开发、整理改动、发起 PR、更新 PR、补充说明或合并时，都必须按本文执行，不能跳步，不能猜，不能自创流程。

本文面向“开发者自己电脑上的 AI”，不是版本发布流程，也不是让 AI 在没看代码上下文的前提下靠猜生成 PR 结论。

## 使用前准备

在让 AI 操作 GitHub 之前，开发者本机必须先安装 GitHub CLI，并完成登录。

最低要求：

1. 本机已安装 `git`。
2. 本机已安装 GitHub CLI，也就是 `gh`。
3. 已完成 GitHub 登录。
4. 当前账号对目标仓库至少有读取权限；如果要推分支、改 PR、合并 PR，还需要对应写权限。

登录示例：

```powershell
gh auth login
```

如果 AI 检查到 `gh` 不可用，或者 `gh auth status` 显示未登录、登录到错误账号、权限不足，则必须先停止并明确告诉开发者，不准假装已经完成 GitHub 操作。

## 本文适用场景

适用于：

- 开发新功能。
- 修复 bug。
- 清理陈旧逻辑。
- 整理本地提交。
- 发起新的 PR。
- 更新已有 PR。
- 在自己的 PR 下补充说明。
- 在权限允许且开发者明确授权时，把自己的 PR 合并到主线分支。

不适用于：版本发布、没看代码上下文就生成 PR 结论、擅自处理无关脏改动/密钥/构建产物/本地输出目录。

## 开发前必读

任何开发、修复、整理、PR 前，AI 必须先阅读：

1. [项目文件结构说明.md](./项目文件结构说明.md)
2. [项目完整链路说明.md](./项目完整链路说明.md)
3. [项目开发规范（AI协作）.md](./项目开发规范（AI协作）.md)
4. 当前文件

涉及 API 反代时还要读 [docs/api-proxy.md](./docs/api-proxy.md)。涉及 Linux/远程 daemon 时还要读 [docs/linux-proxyd.md](./docs/linux-proxyd.md)。

## 仓库硬性规则

1. 任何结论都不能猜，必须基于真实命令输出、真实 diff、真实代码上下文。
2. 当前仓库主线分支是 `main`，远端主线是 `origin/main`。AI 不得把 PR 目标分支写成不存在的 `dev`。
3. 发起 PR 前，必须先同步最新远端提交，确认当前分支已经吸收或评估了最新 `origin/main`。
4. 如果发现当前 PR 的目标分支不是 `main`，AI 必须先说明并按权限改为 `main`，然后重新检查 PR 信息。
5. 如果当前工作区有无法确认归属的脏改动，AI 必须先停下来告诉开发者，不能偷偷带进本次 PR，也不能擅自删除。
6. 开发新功能时，不要为了兼容旧逻辑而保留明显无用的陈旧代码；如果确认无其他依赖，应一并清理。
7. 如果旧逻辑本身设计差、实现混乱或存在 bug，AI 需要继续检查相关调用点；在不影响其他功能的前提下，可以顺手一起修正。
8. PR 标题、PR 正文、PR 评论都用自然中文直接表达，不写“自动回复”“AI 分析结果如下”这种固定机器人腔。
9. 没有开发者明确授权时，AI 不得擅自合并 PR、关闭 PR、删除远端分支。
10. 必须严格区分“同步 PR 分支”和“合并 PR 到 `main`”：`git merge origin/main`、`git rebase origin/main`、把最新 `main` 推回 PR 源分支，都不等于合并 PR。只有 `gh pr merge <PR_NUMBER> --merge` 并确认 `origin/main` 已前进到合并提交，才算“合并到 main”。
11. 如果开发者明确说“合并进 main”“合到主线”“通过就合”“没问题就合并”“处理完直接合并”，AI 必须执行阶段 8 的真实 PR 合并流程；不能只更新 PR 分支后声称已经合并。

## 开发者需要提供给 AI 的信息

至少提供：仓库本地路径、本次功能或问题描述、新任务还是续做、已有 PR 编号、是否允许 rebase、是否允许发起 PR、是否允许直接合并到 `main`。

如果这些关键信息缺失，AI 不能靠猜来补；能从本地命令确认的先自行确认。

## 标准执行顺序

### 阶段 1：环境确认与仓库现状检查

AI 开始干活前，先执行：

```powershell
gh --version
gh auth status
git status --short --branch
git remote -v
git branch --show-current
git fetch origin
```

要求：必须确认 `gh` 可用且已登录、当前仓库远端正确、当前工作区状态明确。不能在没看当前分支状态的情况下直接写代码或发 PR。

### 阶段 2：先对齐最新 `main`

#### 场景 A：这是一个新任务

如果是新任务，还没开始写代码，则必须先同步最新 `main`：

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/<feature-branch>
```

规则：新任务从最新 `main` 拉出功能分支；不直接在 `main` 上开发，除非开发者明确要求；本地已有脏改动时，不能强行 `pull` 或 `switch` 导致覆盖。

#### 场景 B：这是已有分支上的继续开发

至少先执行：

```powershell
git fetch origin
git rev-list --left-right --count origin/main...HEAD
git log --oneline HEAD..origin/main
```

要求：真实判断当前分支是否落后于 `origin/main`。如果落后，可以先继续开发，但发起 PR 前必须补齐最新 `main` 或说明冲突风险。

### 阶段 3：开发与本地整理

AI 开发时，必须遵守：

1. 先读三份根目录长期文档和相关源码链路，再改代码。
2. 不能只改表面调用点，必须检查相关联的 UI 状态、Tauri 命令、Rust service、持久化、代理链路、文档。
3. 如果发现本次功能附近本来就有坏逻辑，而且修复不会影响其他已使用代码，可以顺手一并修正。
4. 如果为了完成新功能必须删除旧逻辑，就删除，不要为了“看起来兼容”堆陈旧代码。
5. 改完后必须自己检查：`git diff --stat`、`git diff`、冲突标记、无关改动、中文乱码或异常替换字符。
6. 如果涉及 `gpt-image-2` / image2 / OpenAI Images API 调用，默认必须走 Codex Tools 本地 API proxy，不能静默直连 `api.openai.com`。

### 阶段 4：发起 PR 前再次同步最新 `main`

只要准备发起 PR，就必须再次拉取远端最新提交：

```powershell
git fetch origin
git log --oneline HEAD..origin/main
```

如果 `origin/main` 没有新提交，可以继续。若有新提交，优先：

```powershell
git rebase origin/main
```

如果开发者禁止改写历史，或分支多人共用，再改用：

```powershell
git merge origin/main
```

规则：执行 rebase/merge 后必须重新检查 diff；rebase 后推送只能使用 `git push --force-with-lease origin <feature-branch>`，不允许 `git push --force`；冲突不能只删标记，必须检查真实逻辑。

### 阶段 5：提交前检查与推送

在发起 PR 前，至少执行：

```powershell
git status --short
git diff --check
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

按改动面执行检查：

```powershell
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/proxyd/Cargo.toml
```

说明：

- 纯文档改动可不跑全量代码测试，但必须做文档链接、冲突标记、乱码检查，并说明未跑代码测试的原因。
- 前端 TypeScript/UI 改动至少跑 `npm run lint`，结构性改动跑 `npm run build`。
- Rust 改动跑相关 `cargo test`。
- 当前 `package.json` 没有 `npm test` 脚本，不能声称已运行 `npm test`。

提交要求：PR 中只能包含与本次任务相关的改动；不带临时调试代码、无关格式化、构建产物、大日志、密钥、本地输出目录；提交信息描述真实功能结果，不写 `update`、`fix bug`、`merge branch`、`修改一下`；推送前确认当前分支不是 `main`，除非开发者明确要求。

推送示例：

```powershell
git push -u origin <feature-branch>
```

### 阶段 6：创建或更新 PR

PR 默认指向 `main`。

创建 PR：

```powershell
gh pr create --base main --head <feature-branch> --title "<PR标题>" --body-file <PR正文文件>
```

如果 PR 已存在：

```powershell
gh pr view <PR_NUMBER> --json number,title,baseRefName,headRefName,state,isDraft,url
```

如果已有 PR 的目标分支不是 `main`，按权限改正：

```powershell
gh pr edit <PR_NUMBER> --base main
```

改完后重新读取 PR 信息，确认 `baseRefName = main`、PR 仍 open、head 分支正确。

PR 标题直接描述功能结果或修复结果，不写 Git 动作或空洞标题。PR 正文建议结构：

```markdown
## 本次改动
- ...

## 风险与影响
- ...

## 测试情况
- ...
```

正文必须基于真实改动和真实检查结果，不夸大，不写固定“自动回复”抬头。

### 阶段 7：PR 后续补充说明

如果 AI 需要在 PR 里补充评论、解释冲突、说明待确认点：直接写清楚问题、原因、影响、建议；语气自然简洁；不用固定机器人模板；内容必须和真实代码、真实 diff、真实冲突一致。

### 阶段 8：只有在明确授权时，才允许合并 PR

如果开发者明确要求 AI 继续合并自己的 PR，则必须先再次确认：

```powershell
gh pr view <PR_NUMBER> --json number,title,baseRefName,headRefName,state,isDraft,mergeable,mergeStateStatus,url
git fetch origin
git log --oneline HEAD..origin/main
```

合并前必须满足：PR 目标分支是 `main`、不是 draft、仍然 open、当前分支已吸收或确认不落后于最新 `origin/main`、没有尚未处理的明确问题、开发者已明确授权合并。

满足后才可以执行：

```powershell
gh pr merge <PR_NUMBER> --merge --delete-branch
```

验证：

```powershell
gh pr view <PR_NUMBER> --json number,state,mergedAt,mergedBy,baseRefName,url,mergeCommit
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD origin/main
git log --oneline -1
```

要求：`state` 必须是 `MERGED`，`baseRefName` 必须是 `main`，`mergeCommit.oid` 必须存在，`git rev-parse HEAD origin/main` 两个提交必须一致。如果本地有无关脏改动导致不能切回或快进 `main`，必须明确告诉开发者“远端 PR 已合并，但本地 main 尚未更新”。

## 开发清单

### 第 1 阶段：开始前

- `gh` 已安装且已登录。
- 当前仓库正确。
- 当前工作区状态已确认。
- 已读三份根目录长期文档。
- 已明确本次任务是新任务还是续做。

### 第 2 阶段：开发前基线

- 新任务已从最新 `main` 拉分支。
- 续做任务已确认自己相对 `origin/main` 的落后情况。
- 没有误在 `main` 上直接开发，除非开发者明确要求。

### 第 3 阶段：开发中

- 相关源码链路已阅读。
- UI / hook / Tauri command / Rust service / store / docs 已按影响面检查。
- 无用旧代码已清理。
- 图片生成/编辑默认走本地 API proxy。
- 中文文案和文档无乱码。

### 第 4 阶段：发 PR 前

- 已再次获取最新 `origin/main`。
- 已完成必要的 `rebase` 或 `merge`。
- `git diff --check` 通过。
- diff 只包含本次任务改动。
- 提交信息清晰。
- 当前分支不是 `main`，除非开发者明确要求。
- 已运行与改动面匹配的检查，或明确说明纯文档改动未跑代码测试。

### 第 5 阶段：PR 与收尾

- PR 目标分支确认是 `main`。
- PR 标题和正文与真实改动一致。
- 如有评论，内容为自然中文，不用固定机器人模板。
- 测试/检查情况如实说明。
- 如果开发者授权合并，已确认 PR 状态为 `MERGED`，且本地 `main` 与 `origin/main` 指向一致或明确说明无法本地快进。

## 最终反馈给开发者时必须说明

AI 完成后，至少要明确反馈：实际执行了哪些动作、当前分支是否同步最新 `origin/main`、是否创建或更新 PR、PR 编号和链接、PR 目标分支是否为 `main`、是否 rebase/merge、是否运行检查、是否已合并、若已合并则说明 PR 状态/合并提交/本地与远端主线是否一致。

## 一句话执行要求

AI 在本仓库做开发与 PR 时，必须按“先读三份根目录长期文档并确认环境与工作区，再对齐最新 `main`，再开发与整理改动，再次同步最新 `main`，最后只向 `main` 发起或更新 PR；只有在开发者明确授权时，才允许把自己的 PR 合并到 `main`”的顺序执行，不能跳步，不能猜，不能偷懒。
