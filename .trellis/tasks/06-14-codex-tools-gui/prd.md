# Codex Tools 后端可靠性与 GUI 升级 PRD

## 1. 背景

本任务来自对本地 `F:\codex-tools` 与官方 `https://github.com/170-carry/codex-tools/tree/main` 的差异排查。当前结论是：本地后端代理链路更适合实战使用，官方在 GUI 首屏、公开产品包装、CLI/TUI/npm、Analytics、Anthropic 协议兼容等方面更完整。本任务只吸收对我们自用价值高的部分，不转向公开产品线。

## 2. 已拍板范围

### 2.1 必做

1. 后端可靠性升级：核对并移植官方 `v2.0.1` 中与稳定性相关的修复，重点是 token 过期提示和备份目录权限。
2. Session affinity：默认开启，同一会话优先粘同一账号；无 session key 或粘性不可用时继续走本地现有 cooldown + EWMA latency 账号选择策略。
3. Dashboard 排障增强：记录并展示“为什么选择这个账号”，包括命中账号、候选数、排除原因、是否命中 affinity、是否受 cooldown/latency 影响。
4. GUI 全页审计：账号页、API 反代页、Dashboard 页、设置页、顶部导航都要看是否有可借鉴优化。
5. GUI 设计稿：允许使用 image2 / `gpt-image-2` 出设计稿，但必须通过 Codex Tools 本地 API proxy，不直连 `api.openai.com`。

### 2.2 明确不做

1. 不做 Anthropic `/v1/messages` 协议兼容，除非后续出现真实客户端需求。
2. 不做 CLI/TUI/npm 发布链。
3. 不做 Analytics 成本分析页。
4. 不做完整多 API Key 管理 UI。
5. 不拆分账号总启用与 API proxy 启用语义；当前不引入 `apiProxyEnabled`。
6. 不做全量 merge 官方 main；只按点移植有价值变更。

## 3. 目标

- 保持本地 API proxy 的实战优势，提升稳定性、可解释性和长期可维护性。
- GUI 向官方首屏的清晰度、层级、视觉统一度靠拢，但不牺牲我们现有 Dashboard 和代理排障能力。
- 每个阶段都能独立验证，不靠一次性大重构。

## 4. 非目标

- 不把项目改造成公开发行产品。
- 不为视觉统一重写所有组件。
- 不因为官方存在功能就全部合并。
- 不在没有测试保护的情况下重构 `proxy_service.rs` 大片逻辑。

## 5. 需求分解

### R1：官方稳定性修复核对

- 对比官方 `v2.0.1` 相关提交或文件差异。
- 确认 token 过期提示在本地是否已有等价实现。
- 确认备份目录创建/权限处理在本地是否已有等价实现。
- 只移植可靠性相关最小代码，不引入 CLI/npm/Analytics/Anthropic 功能。

验收：
- 能指出对应官方证据、本地现状和是否移植。
- 若改动 Rust 认证/备份逻辑，至少运行相关 `cargo test --manifest-path src-tauri/Cargo.toml`。

### R2：Session affinity 默认开启

- 从请求 header 或 payload 中提取稳定 session key。
- 同一 session key 在合理容量内映射到同一账号。
- affinity 命中账号不可用、耗尽、被禁用或 token 刷新失败时，必须回退到现有候选选择策略。
- affinity 不得绕过现有账号可用性、用量、cooldown、认证检查。
- 需要容量上限和过期/淘汰策略，避免无限增长。

验收：
- 新增或更新 Rust 单测覆盖：同 session 粘同账号、无 session key 回退、账号不可用时回退、容量淘汰。
- Dashboard/trace 能标记 affinity 命中或未命中。

### R3：Dashboard 路由解释

- 为每个代理请求记录候选选择摘要。
- 至少包含：候选总数、可用候选数、选中账号标签/ID 摘要、策略名、排除原因计数、affinity/cooldown/latency 是否参与。
- 前端 Dashboard 显示最近请求的路由解释，避免泄露真实 token/API key。

验收：
- 最近请求或失败详情里能看到账号选择原因。
- 敏感信息不出现在 UI、日志、文档。
- Dashboard 类型、Rust model、前端类型一致。

### R4：GUI 全页审计和改造方向

页面范围：

1. 账号页：顶部统计卡、账号列表、右侧账号详情 inspector。
2. API 反代页：按状态、本地代理、远程访问、账号池、高级设置分区。
3. Dashboard 页：突出最近失败、路由解释、延迟时间线、来源/模型/账号筛选。
4. 设置页：按启动/更新/编辑器/外观/高级分组。
5. 顶部导航：胶囊式 tab、统一圆角/阴影/状态色。

验收：
- 先产出 image2 视觉方向稿和文字设计说明。
- 后续实现时不把业务逻辑写进 `App.tsx`；组件、hook、类型、i18n、样式保持分层。

## 6. 推荐阶段

### 阶段 A：只读核对与设计定稿

- 确认官方稳定性修复点。
- 生成 GUI 方向稿。
- 输出最终开发清单。

### 阶段 B：后端可靠性与 session affinity

- 移植稳定性修复。
- 实现 session affinity。
- 补测试。

### 阶段 C：Dashboard 路由解释

- 后端记录选择摘要。
- 前端展示路由解释。
- 补类型和文档。

### 阶段 D：GUI 分页改造

- 账号页优先。
- 再 API 反代页、Dashboard 页、设置页、顶部导航。
- 每页独立验收，避免一次性大改。

## 7. 风险和约束

- `src-tauri/src/proxy_service.rs` 已很大，新增逻辑必须优先收敛为明确 helper 或相邻模块，避免继续无边界膨胀。
- Session affinity 与 cooldown/EWMA 可能冲突，必须定义优先级：可用 affinity > cooldown/latency 新选择；不可用 affinity 立即回退。
- GUI 改造容易引入 i18n 缺口和中文乱码，所有中文文案必须检查。
- image2 设计稿只能作为方向，不作为像素级实现规格。

## 8. 验证基线

按改动面选择：

```powershell
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/proxyd/Cargo.toml
```

API proxy 改动优先补/跑 Rust 单测；GUI 改动至少跑 `npm run lint` 和 `npm run build`。

## 9. 当前决策记录

- 2026-06-14：用户确认做后端 P0/P1，不做协议兼容、CLI/TUI/npm、Analytics。
- 2026-06-14：用户确认不拆账号总启用与 API proxy 启用语义。
- 2026-06-14：用户确认 session affinity 默认开启。
- 2026-06-14：用户确认 GUI 每页都审计，可动用 image2 设计 GUI。
