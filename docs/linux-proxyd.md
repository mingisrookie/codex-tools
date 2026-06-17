# Linux Proxyd

`codex-tools-proxyd` 是从桌面端本地 API 反代拆出的独立代理进程，用来把 Codex Tools 的 OpenAI-compatible `/v1` 出口放到 Linux 服务器上运行。

当前版本支持两种使用方式：

- **手动 daemon 模式**：在 Linux 上自行编译或拷贝 `codex-tools-proxyd`，用命令行启动 `/v1` 代理。
- **桌面端托管模式**：在 Codex Tools 的 API 反代面板中添加远程 Linux 服务器，由桌面端通过 SSH 构建/上传二进制、同步 `accounts.json`、安装 systemd、启动/停止服务、查看状态和读取日志。

## 当前能力

- 复用桌面端已有 Codex upstream 转发逻辑，包括 `/v1/models`、`/v1/chat/completions`、`/v1/responses` 和图片接口。
- 复用 `accounts.json` 和固定 `api-proxy.key` 持久化。
- 手动启动时可选自动把当前 `~/.codex/auth.json` 导入到账号池。
- 桌面端远程部署时，会把本地应用数据目录中的 `accounts.json` 上传到远程部署目录。
- 桌面端远程部署会为每台服务器生成独立 systemd unit，支持启用、启动、重启、停止、状态检测和 `journalctl` 日志读取。
- 支持远程 Linux `x86_64/amd64` 与 `aarch64/arm64` 架构；构建目标优先使用 musl，必要时回退 gnu target。
- 远程 SSH 认证支持私钥路径、私钥内容、私钥文件和密码模式；密码模式依赖本机 `sshpass`。

## 手动 daemon 模式

### 编译

```bash
cargo build --manifest-path src-tauri/proxyd/Cargo.toml
```

### 启动

```bash
./src-tauri/proxyd/target/debug/codex-tools-proxyd serve \
  --data-dir ~/.codex-tools-proxyd \
  --host 0.0.0.0 \
  --port 8787
```

默认值：

- `--data-dir ~/.codex-tools-proxyd`
- `--host 0.0.0.0`
- `--port 8787`
- 请求体大小上限默认 `512 MiB`

如果你不希望启动时自动把当前 `~/.codex/auth.json` 写入账号池，可以加：

```bash
--no-sync-current-auth
```

如果需要覆盖默认请求体大小上限，可以在启动前设置环境变量：

```bash
CODEX_TOOLS_PROXY_MAX_BODY_MIB=1024 ./src-tauri/proxyd/target/debug/codex-tools-proxyd serve \
  --data-dir ~/.codex-tools-proxyd \
  --host 0.0.0.0 \
  --port 8787
```

如果远程机器没有安装官方 Codex CLI，或需要显式跟随桌面端确认过的版本，可以指定上游 Codex CLI 版本：

```bash
CODEX_TOOLS_CODEX_CLIENT_VERSION="0.x.y" ./src-tauri/proxyd/target/debug/codex-tools-proxyd serve \
  --data-dir ~/.codex-tools-proxyd \
  --host 0.0.0.0 \
  --port 8787
```

该值会用于上游请求的 `Version`、`User-Agent: codex_cli_rs/<version>` 和模型 catalog 的 `client_version`。

### 数据目录

daemon 会在 `data-dir` 下维护：

- `accounts.json`
- `api-proxy.key`
- dashboard / trace / usage 相关运行数据

其中：

- `accounts.json` 用法和桌面端一致。
- `api-proxy.key` 会固定保存本地代理 API Key，除非手动刷新。

### 启动输出

启动成功后会打印：

- `data_dir=...`
- `listen=http://HOST:PORT/v1`
- `api_key=sk-...`
- `upstream=codex`

### 停止

- 前台运行时可直接 `Ctrl+C`。
- Linux 上也支持 `SIGTERM`。

## 桌面端托管远程模式

入口在 Codex Tools 的 **API 反代** 面板中的远程服务器区域。相关前端状态在 `src/components/ApiProxyPanel.tsx` 和 `src/hooks/useCodexController.ts`，后端逻辑在 `src-tauri/src/remote_service.rs`。

### 配置字段

每台远程服务器配置包含：

- 名称 `label`
- Host `host`
- SSH 端口 `sshPort`
- SSH 用户 `sshUser`
- 认证方式 `authMode`：`keyPath` / `keyFile` / `keyContent` / `password`
- 私钥路径、私钥内容或密码
- 远程部署目录 `remoteDir`
- 远程监听端口 `listenPort`

### 部署流程

点击“部署远程代理”后，桌面端会执行：

1. 校验服务器配置和本机 SSH 依赖。
2. SSH 到远程机器执行 `uname -s && uname -m`，确认 Linux 架构。
3. 在本机为目标架构构建 `codex-tools-proxyd`。
4. 读取本地应用数据目录中的 `accounts.json`。
5. 生成 systemd unit，命名形如 `codex-tools-proxyd-<server-id>.service`。
6. 通过 `scp` 上传二进制、`accounts.json` 和 service 文件到远程临时目录。
7. 使用 root 权限安装到远程部署目录与 `/etc/systemd/system/`。
8. 执行 `systemctl daemon-reload`、`enable`、`start` 或 `restart`。
9. 回读远程状态、Base URL 和 `api-proxy.key`。

部署进度会通过 `remote-deploy-progress` 事件回传前端。

### 远程 systemd 服务

生成的服务大致执行：

```bash
<remoteDir>/codex-tools-proxyd serve \
  --data-dir <remoteDir> \
  --host 0.0.0.0 \
  --port <listenPort> \
  --no-sync-current-auth
```

远程托管模式使用上传的 `accounts.json`，因此默认加 `--no-sync-current-auth`，避免远程机器自己的 `~/.codex/auth.json` 覆盖账号池。

### 状态、启动、停止和日志

桌面端命令对应关系：

- `get_remote_proxy_status`：检测二进制、systemd unit、运行状态、enabled 状态、PID、`api-proxy.key`，并返回 `http://<host>:<listenPort>/v1`。
- `start_remote_proxy`：执行 `systemctl start <unit>`。
- `stop_remote_proxy`：执行 `systemctl stop <unit>`。
- `read_remote_proxy_logs`：执行 `journalctl -u <unit> -n <lines> --no-pager`，行数限制在 20～400。

### 本机依赖

- 私钥模式需要本机可用 `ssh` / `scp`。
- 密码模式需要本机安装 `sshpass`；桌面端提供 `is_sshpass_available` 和 `install_sshpass` 辅助命令。
- 如果本机缺少 Rust / Zig / `cargo-zigbuild` 等构建依赖，远程部署流程会尽量自动安装；Windows 平台仍可能需要用户先手动准备 Rust 工具链。

## 安全边界

- 远程部署会上传本地 `accounts.json`，其中包含账号登录态；只应部署到自己控制的服务器。
- 文档、截图和日志不要公开真实 `api-proxy.key`、账号 ID、邮箱、私钥或密码。
- 远程 Base URL 只是 OpenAI-compatible `/v1` 入口；客户端仍必须带 Codex Tools 面板显示的本地/远程 API Key。

## 排查建议

1. 先在桌面端远程服务器卡片刷新状态，确认 installed / service / running / enabled。
2. 如果状态未知，先检查 SSH 配置、认证方式和本机 `ssh` / `scp` / `sshpass`。
3. 如果 service 已安装但不工作，读取远程日志。
4. 如果外部客户端接不通，先在服务器本机或能访问服务器的机器上测试：

```bash
curl http://<host>:<listenPort>/health
curl http://<host>:<listenPort>/v1/models -H 'Authorization: Bearer 你的sk'
```

5. 如果远程机器没有 Codex CLI 或版本不匹配，使用 `CODEX_TOOLS_CODEX_CLIENT_VERSION` 显式指定上游请求版本。
