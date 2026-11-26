# Forge Desktop

本地优先的工程任务工作台。新版正在按 [产品规格](docs/superpowers/specs/2026-11-25-forge-desktop-design.md) 实施，首版面向 macOS Apple Silicon。

M1 本地任务基础已实现：CODE / MANUAL / GROUP、固定状态看板、搜索筛选与排序、Markdown 需求和验收标准、依赖、需求修订、活动、人工验收与归档，以及全局/项目设置和环境诊断。写入支持幂等与版本冲突，失败保留草稿。**Codex 自动执行、PR 与自动评审尚未开放**：M0 的读取隔离和 Git 沙箱写入探针未通过，详见 [M0 门禁](docs/adr/0002-m0-validation.md)。

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
node scripts/test-offline-migration.mjs
```

产物为 `release/mac-arm64/Forge Desktop.app`。当前是开发验证包，未签名、未公证，不作为对外发布版本。安装包含 Electron Node、官方 Prisma CLI/schema engine、SQLite 驱动和迁移文件；运行时不下载依赖、不调用系统 Node。M0 暂用 unpacked resources 以验证完整依赖；发布体积优化和签名在后续交付阶段完成。

## 数据和工具

- 默认数据目录：`~/Library/Application Support/Forge Desktop/desktop-v1`。
- SQLite 仅由 Core 访问；迁移先检查历史，升级前通过 SQLite backup API 备份，失败进入维护模式。不会自动 reset 或清库。
- 设置中可配置 git/gh/codex 路径。手动输入新路径需要原生确认；文件选择器选中的路径属于显式授权。环境检测读取工具版本、Codex 账号/模型列表和 gh 当前身份；项目设置可检测 remote、默认分支和仓库权限。检查可能联网，不调用模型。脱敏结果按配置版本保存，改变配置后失效；账号/模型可见不代表执行沙箱通过。
- 环境探针不调用模型、不执行项目脚本、不推送、不创建 PR，也不读取仓库 `.env`。
- `--forge-data-dir=/absolute/path` 用于独立开发/测试配置。CLI socket 位于按规范化数据目录哈希生成的 owner-only `/tmp/forge-<uid>-<hash>/core.sock`，避免 macOS socket 路径长度限制。
- `pnpm forge health` 仅返回 Core 就绪状态。带项目内容的查询以及规划写入，要等 scoped capability 实现后才开放。
- 无未保存内容时，macOS 关闭最后一个窗口会保留 Core；明确退出会先确认未保存内容，再停止受管进程。

具体版本见 [ADR 0001](docs/adr/0001-desktop-runtime.md)，当前门禁见 [ADR 0002](docs/adr/0002-m0-validation.md)，本地任务验收见 [M1 验收记录](docs/adr/0003-m1-acceptance.md)。后续依次推进 M2 单任务执行到 PR、M3 Planner、M4 受控交付。
