# 官方 v2.0.1 稳定性差异核对

核对时间：2026-06-14

## Source of truth

- 本仓库 `origin` 指向官方仓库：`https://github.com/170-carry/codex-tools.git`。
- `git ls-remote --tags origin v2.0.1` 显示官方 `v2.0.1` tag 当前为 `ff1196f330ef3752ccc9de8635471f525f2fc050`。
- 本地同名 tag 已漂移到 `9edf683ed9bdb328df8bae19a530a8108ce3e9eb`，因此本次核对以 `origin/main` / `ff1196f` 为官方证据，不信任本地 `v2.0.1` tag。

## 1. Access token expired 提示

官方证据：

- `git show origin/main:src-tauri/src/account_service.rs` 中存在 `USAGE_AUTH_TOKEN_EXPIRED_NOTICE`。
- 官方 `normalize_usage_error_message()` 对 `provided authentication token is expired` / `token is expired` 返回用量刷新专用提示。
- 官方 `should_suspend_auth_keepalive()` 只把 refresh token 失效、账号/工作区停用等作为暂停 keepalive 条件，不把 access token expired 当成 refresh token 失效。
- 官方测试：`access_token_expired_usage_errors_do_not_suspend_keepalive`。

本地处理：

- 已在 `src-tauri/src/account_service.rs` 对齐：access token expired 只显示用量刷新令牌过期提示，不暂停 keepalive；refresh token 失效才提示重新授权。
- 已有对应 Rust 单测覆盖。

## 2. 私有权限：目录 0700 / 文件 0600

官方证据：

- `git show origin/main:src-tauri/src/utils.rs` 中 `try_set_private_permissions()` 在 Unix 下读取 metadata，目录设置 `0o700`，文件设置 `0o600`。
- 官方测试覆盖 `private_permissions_keep_files_owner_only` 与 `private_permissions_keep_directories_searchable`。

本地处理：

- 已在 `src-tauri/src/utils.rs` 对齐目录/文件权限模式。
- 已补 `store.rs` 调用点：创建账号存储目录、滚动备份、损坏文件备份前都会对 parent 目录调用私有权限设置。
- 已补 Unix 单测 `save_store_sets_store_directory_private_permissions`，验证保存账号库后目录为 `0700`。

## 明确未移植

- 未移植 CLI/TUI/npm 发布链。
- 未移植 Analytics 成本分析页。
- 未移植 Anthropic `/v1/messages` 兼容。
- 未全量合并官方 main。
