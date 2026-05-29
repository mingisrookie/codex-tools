# Codex Tools 项目规则

本文件是给 Codex/AI 代理的仓库级执行入口。任何涉及本仓库代码、脚本、配置、文档、提交、发布的任务，都先按这里执行。

## 开发前必读

开始动手前必须实际阅读并以当前文件内容为准：

1. [项目文件结构说明.md](./项目文件结构说明.md)
2. [项目完整链路说明.md](./项目完整链路说明.md)
3. [项目开发规范（AI协作）.md](./项目开发规范（AI协作）.md)
4. 如果涉及 PR / 推送 / 合并，再读 [开发者AI开发与PR提交流程.md](./开发者AI开发与PR提交流程.md)

不能只凭历史记忆、会话摘要或旧模板直接开发。

## 本仓库架构基线

- 前端：React 19 + TypeScript + Vite，入口是 `src/main.tsx`、`src/App.tsx`，集中控制 hook 是 `src/hooks/useCodexController.ts`。
- 桌面后端：Tauri 2 + Rust，命令注册在 `src-tauri/src/lib.rs`，业务模块位于 `src-tauri/src/*.rs`。
- 本地 API 反代：Axum 服务在 `src-tauri/src/proxy_service.rs`，独立 daemon 入口是 `src-tauri/src/bin/codex-tools-proxyd.rs` 和 `src-tauri/proxyd/`。
- 长期说明文档以根目录三份中文文档和 `docs/` 为准；实现改变后必须同步长期文档，不用临时草稿替代。

## gpt-image-2 / image2 调用

当生成或编辑图片时，无论使用 `gpt-image-2`、image2、OpenAI Images API、`image_gen`，还是 OpenAI-compatible image client，默认都必须走 Codex Tools 本地 API 代理；除非用户明确要求绕过本地代理。

- Base URL：`http://127.0.0.1:<Codex Tools API proxy port>/v1`，当前默认端口是 `8787`
- 生成端点：`/images/generations`
- 编辑端点：`/images/edits`
- 模型：`gpt-image-2`
- API key：以 Codex Tools API 反代面板显示的本地 proxy key 为准

不要静默直连 `api.openai.com` 调用 `gpt-image-2`。如果本地代理端口或 key 不确定，先检查 Codex Tools 本地状态、配置或面板；仍无法确定时，向用户索要本地端口/key。

## 开发硬要求

- 先读真实代码链路，再改；优先用 `rg`、定向文件阅读和现有调用链确认运行事实。
- 不把新逻辑堆进大文件；前端状态优先收敛在 hook/类型/组件边界内，后端能力优先收敛在对应 Rust service 模块内。
- 账号、认证、API 代理、cloudflared、远程 proxyd、设置、更新、i18n 任一链路变化，都必须同步检查前端展示、Tauri 命令、Rust 业务模块、持久化、文档和验证命令。
- 文档和中文文案修改后必须做乱码检查；出现异常替换字符（U+FFFD）、错码、冲突标记或失效链接，任务未完成。
- 提交或推送前必须确认 `git status --short` 只包含本次任务相关文件，并运行与改动面匹配的检查。
