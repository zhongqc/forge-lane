# Forge Desktop

本地优先的工程任务工作台。新版正在按 [产品规格](docs/superpowers/specs/2026-11-25-forge-desktop-design.md) 实施，首版面向 macOS Apple Silicon。

当前为桌面基础阶段，已接入 Electron、独立 Core、SQLite/Prisma、项目导入、持久化设置和工具版本检测。**尚未提供任务看板、Codex 执行、PR 或自动评审。** 完整 M0 的 Agent 权限/中断/恢复探针也尚未验收，不能据此进入自动执行阶段。

旧 Web/服务端代码保存在 `codex/legacy-web` 与 `legacy-web-2026-11-25`。新版不需要 Docker、PostgreSQL、旧账号或旧 `.env`；旧部署数据未被修改。

## 开发

需要 Node.js 24、仓库固定的 PNPM 11.9.0，以及 macOS 开发工具。

```sh
pnpm install --frozen-lockfile
pnpm setup:desktop
pnpm db:generate
pnpm dev
```

`setup:desktop` 安装固定 Electron 运行时并检查原生模块。所有业务测试使用 Electron 自带 Node 运行，避免系统 Node 与 Electron ABI 来回切换。

```sh
pnpm test
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test:desktop
```

## 本地打包

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package:dir
FORGE_PACKAGED_EXE="$PWD/release/mac-arm64/Forge Desktop.app/Contents/MacOS/Forge Desktop" pnpm test:desktop
```

产物为 `release/mac-arm64/Forge Desktop.app`。当前是开发验证包，未签名、未公证，不作为对外发布版本。安装包含 Electron Node、官方 Prisma CLI/schema engine、SQLite 驱动和迁移文件；运行时不下载依赖、不调用系统 Node。M0 暂用 unpacked resources 以验证完整依赖；发布体积优化和签名在后续交付阶段完成。

## 数据和工具

- 默认数据目录：`~/Library/Application Support/Forge Desktop/desktop-v1`。
- SQLite 仅由 Core 访问；迁移先检查历史，升级前通过 SQLite backup API 备份，失败进入维护模式。不会自动 reset 或清库。
- 设置中可配置 git/gh/codex 路径。手动输入新路径需要原生确认；文件选择器选中的路径属于显式授权。工具检测仅检查版本，**不代表认证、模型或执行权限已验证**。
- 环境探针不调用模型、不执行项目脚本、不推送、不创建 PR，也不读取仓库 `.env`。
- `--forge-data-dir=/absolute/path` 用于独立开发/测试配置。CLI socket 位于按规范化数据目录哈希生成的 owner-only `/tmp/forge-<uid>-<hash>/core.sock`，避免 macOS socket 路径长度限制。
- `pnpm forge health` 仅返回 Core 就绪状态。带项目内容的查询以及规划写入，要等 scoped capability 实现后才开放。
- 无未保存内容时，macOS 关闭最后一个窗口会保留 Core；明确退出会先确认未保存内容，再停止受管进程。

具体版本、已验证结果及剩余门禁见 [ADR 0001](docs/adr/0001-desktop-runtime.md)。后续按 M1 本地任务基础、M2 单任务执行到 PR、M3 Planner、M4 受控交付推进。
