# 项目开发规范（AI协作）

本文档是 Codex Tools 仓库面向 AI 与开发者的开发规范。目标是让项目更清晰、更可维护、更可测试，而不是为了“看起来规范”机械拆文件。

阅读顺序要求：

1. [项目文件结构说明.md](./项目文件结构说明.md)
2. [项目完整链路说明.md](./项目完整链路说明.md)
3. 当前文件
4. 涉及 PR、推送、合并时，再读 [开发者AI开发与PR提交流程.md](./开发者AI开发与PR提交流程.md)

核心原则：

- 以真实运行链路为准：当前源码、配置、命令输出、测试结果优先于历史记忆和旧文档。
- 任何新增功能都必须沿现有分层接入：React UI → controller hook → Tauri command → Rust service/runtime/store → 文档与验证。
- 重构优先考虑稳定性、职责边界、可理解性和可回退性；禁止用大范围重写掩盖局部问题。
- 乱码、错码、失效链接、冲突标记都是阻塞问题。

## 0. AI 协作执行协议

### 0.1 开发前必须实际阅读

- 任何涉及代码、流程、UI、配置、测试、文档、提交、推送、合并、发布的任务，开始前必须实际阅读或重新核对三份根目录长期文档。
- 不能只凭历史记忆、上一次会话摘要或“看起来知道项目”直接开发。
- 如果用户指出“先分析”“只分析”“暂时不改”，只能输出分析，不得擅自改代码或提交。
- 如果用户要求“开始开发”“按照清单开发”“提交代码”，必须按阶段推进到可验证完成，不能停在方案层。

### 0.2 开发方案与开发清单

用户要求写开发方案时，方案必须至少包含：

1. 需求理解与真实目标。
2. 现有源码链路分析。
3. 是否符合要求、是否完善、是否完整、是否正确。
4. 是否符合本开发规范、现有架构和现有命名。
5. 方案自身是否有缺陷、边界遗漏或上下游设计冲突。
6. 与本功能无直接 UI 关系但有逻辑关联的模块检查。
7. 分阶段开发清单。
8. 每个阶段完成后的自检项。
9. 最终全量审查项。

如果方案是临时草稿，必须先确认路径是否被 `.gitignore` 忽略；不要假设 `docs/md/` 一定不会被提交。本仓库当前长期文档在根目录和 `docs/` 下。

### 0.3 阶段化开发硬要求

- 进入开发后，必须按开发清单一个阶段一个阶段完成。
- 每完成一个阶段，必须自检：
  - 相关代码是否都改到。
  - UI 状态流、Tauri 命令流、Rust 运行态、持久化、文档是否一致。
  - 是否有设计缺漏、逻辑缺陷、错误恢复和边界问题。
  - 是否引入乱码、错码、异常替换字符或冲突标记。
  - 定向测试或必要静态检查是否通过。
- 阶段自检未通过时，不能进入下一阶段。
- 最终提交前必须再做一次全局审查。

### 0.4 提交、合并、推送前置检查

提交前至少确认：

1. `git status --short` 只包含本次任务应提交文件。
2. `git diff --check` 无空白错误。
3. 修改过的 JavaScript / TypeScript 文件通过项目现有检查；当前最低命令是 `npm run lint`，结构性前端改动还要跑 `npm run build`。
4. 修改过 Rust 逻辑时，至少跑相关 `cargo test`；影响桌面主程序时优先使用 `cargo test --manifest-path src-tauri/Cargo.toml`，影响独立 proxyd 时跑 `cargo test --manifest-path src-tauri/proxyd/Cargo.toml`。
5. 本仓库当前 `package.json` 没有 `npm test` 脚本；不要伪造“已跑 npm test”。如后续新增测试脚本，按当时 `package.json` 执行。
6. 中文文案、日志、注释、文档无可见乱码。
7. 如果提交，提交信息必须说明真实改动，不得写 `update`、`fix`、`AI 修改` 这类空泛信息。

## 1. 架构原则

### 1.1 分层基线

Codex Tools 是桌面控制器 + 本地 OpenAI-compatible `/v1` 反代，不是传统前后端分离 Web 服务。

当前分层：

- 前端入口：`src/main.tsx` → `src/App.tsx`。
- 前端状态与动作编排：`src/hooks/useCodexController.ts`。
- 前端组件：`src/components/`，样式在 `src/styles/` 和 `src/App.css`。
- 前端类型：`src/types/app.ts`。
- Tauri 命令入口：`src-tauri/src/lib.rs`。
- Rust 业务模块：`src-tauri/src/*.rs`。
- 本地 API 反代：`src-tauri/src/proxy_service.rs`。
- 独立 proxyd：`src-tauri/src/bin/codex-tools-proxyd.rs`、`src-tauri/proxyd/`。
- 发布配置：`.github/workflows/release.yml`、`src-tauri/tauri.conf.json`。
- 发布文档必须以已经成功推送到远端的 tag、Release 和 workflow 为准；本地 workflow patch 未能推送时，不能在 README、changelog 或长期文档中写成“已启用”。

后续开发必须沿这条分层接入，不能把 Rust 业务状态塞进前端组件，也不能让 UI 直接复制后端业务规则。

### 1.2 前端职责原则

- `src/App.tsx` 只负责页面布局、tab 切换和组件装配，不应承接新的复杂业务流程。
- `src/hooks/useCodexController.ts` 可以作为前端编排中心，但新增大段独立能力时应先判断是否拆到专门 hook 或 utils。
- `src/components/` 中组件应以展示和局部交互为主，不直接硬编码后端协议细节。
- `src/types/app.ts` 是前后端 JSON 契约的前端镜像；新增 Tauri 返回字段或设置项时必须同步更新。
- i18n 文案必须经过 `src/i18n/` 和 locale JSON，不能在多个组件里复制中文/英文硬编码。

### 1.3 Rust 后端职责原则

- `src-tauri/src/lib.rs` 是 Tauri 命令注册、OAuth callback glue、窗口/托盘生命周期装配层；新增业务逻辑优先下沉到 service 模块。
- 账号导入、导出、刷新和启停用逻辑在 `account_service.rs` / `store.rs` / `auth.rs`。
- 设置读写在 `settings_service.rs` 和 `models.rs`。
- 用量与 token 统计在 `usage.rs`、`token_usage.rs`、`dashboard_metrics.rs`。
- API 反代核心在 `proxy_service.rs`，daemon 复用逻辑在 `proxy_daemon.rs`。
- cloudflared 管理在 `cloudflared_service.rs`，远程 proxyd 部署与控制在 `remote_service.rs`。
- 进程、权限、路径、命令解析类共用能力优先放在 `utils.rs`、`app_paths.rs`、`profile_files.rs`。

### 1.4 API 反代架构基线

当前本地反代暴露 OpenAI 风格接口，上游统一转到 Codex/ChatGPT 登录态可用的 responses 链路。详细实现以 [docs/api-proxy.md](./docs/api-proxy.md) 为准。

本地入口包括：

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/responses` WebSocket upgrade
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/images/variations`

反代相关改动必须同步检查 Axum route、鉴权、模型列表、payload 归一化、SSE/WebSocket/非流式输出、账号候选、cooldown、dashboard metrics、usage stats、前端面板和文档。

### 1.5 图片生成与编辑代理原则

当生成或编辑图片时，默认必须走 Codex Tools 本地 API 代理，不能静默直连 `api.openai.com`：

- Base URL：`http://127.0.0.1:<port>/v1`，当前默认端口 `8787`。
- 生成端点：`/images/generations`。
- 编辑端点：`/images/edits`。
- 模型：`gpt-image-2`。
- API key：以 Codex Tools API 反代面板显示的本地 proxy key 为准。

如果端口或 key 不确定，先查本地状态和配置；仍无法确定时问用户，不要自动回退到直连 OpenAI。

### 1.6 持久化与运行态原则

开发时必须区分：

- 持久配置：`AccountsStore.settings` / `AppSettings`。
- 账号存储：`accounts.json`，包含 ChatGPT/Codex 登录态账号与 relay/API 账号。
- 本机 Codex 登录态：`~/.codex/auth.json` 及相关 profile 文件。
- 运行态句柄：`AppState` 中的 API proxy、cloudflared、OAuth listener 等。
- 统计文件：`api-proxy-metrics.jsonl`、API proxy usage stats、Codex session JSONL。
- UI 临时状态：React state、弹窗、loading、toast、tab、筛选区间。

不能把运行态值误写成持久配置，也不能用前端临时状态替代后端真实状态。

## 2. 模块边界规则

### 2.1 可以继续增长但要保持边界的文件

- `src/hooks/useCodexController.ts`：前端控制器，适合承接跨组件状态，但新增独立领域时要考虑拆分。
- `src-tauri/src/proxy_service.rs`：反代核心复杂度高，允许增长，但新增通用辅助逻辑应优先抽到清晰函数或相邻模块。
- `src-tauri/src/models.rs`：跨 Tauri JSON 契约集中处，新增字段必须配套默认值、归一化和测试。

### 2.2 不应继续膨胀的文件

- `src/App.tsx`：不写新的业务流程。
- `src-tauri/src/lib.rs`：不写大段新业务逻辑，优先下沉到 service。
- 单个 UI 组件：不要把多个设置域、轮询、后端协议和复杂状态机塞在一个展示组件里。

## 3. 新增功能接入规范

### 3.1 新增前端功能

必须同步检查：类型、controller hook、Tauri command、UI 位置、i18n、样式、loading/错误/空态/禁用态、根目录文档和相关 `docs/`。

### 3.2 新增 Tauri 命令

必须同步检查：Rust command、`tauri::generate_handler!` 注册、前端 `invoke()` 调用、`src/types/app.ts` 返回类型、错误文案、运行锁、Rust 单测或前端 build/lint。

### 3.3 新增设置项

必须同步检查：

1. `src-tauri/src/models.rs` 默认值、serde default、patch 字段、归一化。
2. `src-tauri/src/settings_service.rs` 读写和副作用。
3. `src/types/app.ts` 前端类型。
4. `src/hooks/useCodexController.ts` 的 `DEFAULT_SETTINGS`、保存队列、调用点。
5. `src/components/SettingsPanel.tsx` 或对应业务面板 UI。
6. 导入导出、state restore、开机启动或 runtime 副作用。
7. 文档和测试。

### 3.4 新增 API 反代能力

必须同步检查 route、method、body limit、鉴权、OpenAI-compatible schema、Codex upstream payload/header、SSE/WebSocket/非流式路径、错误分类、重试、cooldown、账号候选过滤、dashboard metrics、usage 统计、trace 日志、前端面板和独立 proxyd 复用。

### 3.5 新增账号 / 认证能力

必须同步检查 ChatGPT/Codex auth JSON、refresh token 生命周期、API relay 账号差异、账号 group/variant/label/enabled、当前本机 `~/.codex/auth.json` 同步、profile integrity、导入导出删除重命名启停用、用量刷新、切换账号、托盘和智能切换。

### 3.6 新增 cloudflared 或远程 proxyd 能力

必须同步检查本机依赖、安装、路径、权限、运行态进程句柄、停止清理、日志、快速/命名隧道、远程服务器配置、SSH/sshpass、身份文件、部署目录、`src-tauri/gen/remote-build` 打包资源与 `remote_service.rs` 源文件清单、前端轮询/部署进度和 [docs/linux-proxyd.md](./docs/linux-proxyd.md)。

### 3.7 UI 与配置项放置规范

- 新开关必须放在对应业务域附近，不得随便插入无关配置区。
- 可用性必须和真实模式一致：不可用时隐藏或禁用。
- 持久配置、运行态输入、当前任务状态必须区分清楚。
- 如果某个 UI 开关改变后端启动行为或 route 行为，必须同步后端默认值、保存恢复和文档。

## 4. 测试规范

### 4.1 原则

- 任何结构性重构都必须伴随测试迁移、新增测试或明确说明无法自动测试的原因。
- 优先测试类型契约、核心纯函数、持久化默认值/归一化、导入导出、反代错误/重试/停止/恢复和边界输入。

### 4.2 不允许的做法

- 修改结构后不补测试或不做任何验证。
- 只跑局部检查却声称“全量通过”。
- 为了通过测试而破坏实际运行边界。
- 伪造不存在的命令结果，例如当前仓库没有 `npm test` 却说已运行。

### 4.3 最低检查命令

根据改动面选择：

```powershell
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/proxyd/Cargo.toml
```

说明：

- 纯文档改动可不运行全量代码测试，但必须做文档内容、链接、冲突标记和乱码检查。
- 前端 TypeScript / UI / 类型改动至少跑 `npm run lint`；涉及类型、构建、Tauri 前端入口时跑 `npm run build`。
- Rust 业务改动至少跑相关 manifest 的 `cargo test`。
- API 反代改动应优先补充或运行相关 Rust 测试，并做最小请求/响应验证。

## 5. 文档更新规范

### 5.1 必须更新文档的场景

- 文件新增、删除、重命名或职责明显变化：更新 [项目文件结构说明.md](./项目文件结构说明.md)。
- 功能链路、运行链路、状态流、代理链路变化：更新 [项目完整链路说明.md](./项目完整链路说明.md)。
- 开发流程、边界、约束、测试策略变化：更新当前文件。
- API 反代细节变化：更新 [docs/api-proxy.md](./docs/api-proxy.md)。
- Linux / 远程 proxyd 变化：更新 [docs/linux-proxyd.md](./docs/linux-proxyd.md)。
- 用户使用流程变化：更新 [README.md](./README.md) 或 [how to use.md](./how%20to%20use.md)。

### 5.2 文档更新要求

- 不能只改代码不改文档。
- 不能只改文档标题不改正文细节。
- 不能让结构文档漏掉新增长期维护文件。
- 不能让链路文档落后于真实实现。
- 仓库内文档必须优先使用相对链接，不写旧机器路径、旧下载目录路径或个人绝对路径。
- 如果实现和开发方案不一致，最终必须以真实实现更新长期文档。
- README 顶部徽章、下载、社区、CI、npm、docs 等状态必须来自当前真实公开入口；没有实际发布或未启用的能力不能为了“看起来像大项目”加假徽章。

### 5.3 乱码要求

- 所有中文文档、中文注释、中文日志、UI 文案、错误提示都必须避免乱码。
- 修改任何包含中文的文件时，必须把乱码检查视为与功能正确同级的必做项。
- 不允许把“终端显示有点乱，但文件也许没问题”当作默认成立；必须显式检查。
- 禁止在未确认编码的情况下批量重写中文文件。

## 6. 命名规范

- 前端组件使用语义化 PascalCase。
- hooks 使用 `useXxx.ts`。
- Rust 模块按职责命名，避免 `misc.rs`、`helper2.rs`、`new.rs`。
- 新脚本放到 `scripts/`，文件名说明用途和平台。
- 前后端 JSON 字段保持 camelCase；Rust 内部字段保持 snake_case，通过 serde 做转换。
- message、event、route、setting key 命名必须稳定，新增时优先语义化。

## 7. 代码风格与实现要求

- 优先复用现有模块，不重复发明一套新流程。
- 共享逻辑先提公共层，再让 UI / command / service 调用。
- 代码新增后应减少主文件体积，而不是只做形式拆分。
- 观察、留档、日志、导出这类横切能力必须挂在独立配置域或明确服务里。
- 保留少量兼容型薄包装是允许的，但必须有明确目的：运行时装配、测试迁移或外部接口稳定。
- 涉及中文内容的文件必须保持稳定 UTF-8 编码，修改后主动检查乱码、错码、异常替换字符。
- 不能用“临时兼容”替代清晰设计。
- 不能把业务模式判断散落到多个文件里各写一份；优先收敛到共享工具、共享类型或明确 service 入口。

## 8. AI 开发时的自检清单

每次修改后至少自问：

1. 我开发前是否重新核对了三份根目录文档？
2. 我是否确认了当前分支、远端、工作区脏改动和本次影响面？
3. 我这次新增逻辑是不是应该下沉到模块？
4. 我有没有同步检查 UI、controller hook、Tauri command、Rust service、store/runtime？
5. 我有没有同步更新前后端类型契约？
6. 我有没有补或迁移测试，或说明纯文档改动为何不跑代码测试？
7. 我有没有更新三份根目录长期文档或相关 `docs/`？
8. 我新增或修改的文件是否有可见乱码、冲突标记或失效链接？
9. 如果改动影响 API 反代，我有没有同步检查 route、payload、SSE/WebSocket、账号候选、dashboard metrics 和 docs？
10. 如果改动影响账号/认证，我有没有检查导入、刷新、切换、导出、启停用、profile integrity 和重授权？
11. 如果改动影响设置，我有没有检查默认值、归一化、保存、恢复、导入导出、UI、测试？
12. 如果改动影响 cloudflared 或远程 proxyd，我有没有检查本机依赖、远程部署、停止清理和日志？
13. 如果创建了临时方案文件，我有没有确认它是否应被提交？
14. 如果涉及图片生成/编辑，我有没有确认使用本地 Codex Tools proxy 而不是直连 `api.openai.com`？

## 9. 完成标准

合格完成必须满足：职责边界清晰、功能链路完整、阶段自检完成、UI/Tauri/Rust/持久化/运行态一致、与改动面匹配的检查通过、三份根目录文档及相关长期文档已同步、没有乱码/冲突标记/失效链接、`git diff --check` 通过、工作区范围确认无误。

## 10. 特别要求

以后每次开发，如果影响到项目结构、功能链路或开发边界，必须同步检查并在必要时更新：

- [项目文件结构说明.md](./项目文件结构说明.md)
- [项目完整链路说明.md](./项目完整链路说明.md)
- [项目开发规范（AI协作）.md](./项目开发规范（AI协作）.md)

每次开发结束前，必须审查本次修改文件与关键运行文案没有乱码：文档正文、UI 中文文案、日志文案、报错文案、中文注释。这是硬要求，不是建议。

## 11. AI 最终回执要求

完成开发或审查后，最终回复必须简明说明：

1. 改了什么。
2. 是否遵守本规范，尤其是架构边界、文档同步、测试和乱码检查。
3. 跑了哪些测试或检查。
4. 是否提交、提交号是什么。
5. 是否推送、推送到哪个分支。
6. 如果有未完成项、未运行测试或残余风险，必须明确说出。

不能只回复“已完成”，也不能把失败测试、未跑测试、未更新文档藏起来。
