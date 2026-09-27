# Forge Lane CLI

让开发者和本地 Codex 通过 API 获取需求、领取任务、更新事项并回写开发结果。代码执行发生在本机；服务器负责权限、数据和执行租约，不需要运行 Codex 容器。

## 独立可执行文件

登录 Forge Lane 后点击顶部的“下载 CLI”，选择 macOS（Apple Silicon / Intel）、Linux（x64 / ARM64）或 Windows（x64）压缩包。网页同时显示 SHA-256 校验值。解压后运行对应的 `forge-*` 文件；macOS/Linux 首次运行前执行 `chmod +x forge-*`。例如：

```sh
./forge-macos-arm64 --help
./forge-macos-arm64 login --server https://8.141.3.78/forge --email you@example.com --project PT
```

Windows 在 PowerShell 中运行 `./forge-windows-x64.exe --help`。二进制文件自带运行时，不需要 Node.js 或 Bun；登录信息仍写入当前用户的私有配置目录。发布流水线用 `node scripts/build-cli.mjs` 构建五个平台的压缩包和 `SHA256SUMS`，并随生产镜像从本站 `/forge/downloads/` 提供下载。源码运行方式见下节。

## 安装与登录

需要 Node.js 22+。仓库内直接使用 `pnpm forge`；也可以安装本地包获得 `forge` 命令（尚未发布到 npm）：

```sh
npm install --global ./packages/cli
forge --help
forge login --server http://localhost:3004 --email you@example.com --project APP
forge whoami --json
```

在终端输入密码，密码不会写入配置或命令历史。登录后签发限定项目的令牌，默认有效期 30 天，最长 90 天。重复 `--project` 可授权多个项目；`--read-only` 签发只读令牌。多个工作区时用 `--workspace ID`。`--name` 设置令牌名称。

自动化可以使用 `--password-stdin` 或 `--token-stdin`，从安全的凭据工具通过标准输入传入。不要把密码或令牌放在命令行参数或任务描述里。远程地址必须为 HTTPS，本机允许 HTTP。

如果应用部署在子路径下，`--server` 填应用访问地址，例如 `https://8.141.3.78/forge`；CLI 会请求该地址下的 `/api`。不要把 `/api` 加在 `--server` 后面。

## 本地 Codex 开发流程

```sh
forge issue list --project APP --status Ready --json
forge issue context APP-123 --json
forge issue claim APP-123 --executor codex --if-version 3 --json
# 保存返回的执行 ID；在本地仓库开发并测试
forge run renew RUN_ID --json
forge issue comment APP-123 --body-file progress.md --json
forge run finish RUN_ID --outcome succeeded --summary-file result.md --pr-url https://github.com/owner/repo/pull/123 --json
forge issue transition APP-123 --to "Code Review" --json
```

`context` 包含描述、版本、父事项和 Epic、子事项、评论、活动、工作流状态、绑定仓库、PR/Commit 和执行记录。代码仓库仍需在本地准备好。状态名以 `forge status list` 的实际输出为准。

领取不会修改负责人或事项状态；完成执行也不会自动将事项标为 Done。失败用 `--outcome failed`，主动取消用 `cancelled` 或 `forge issue release APP-123`。完成结果会显示在事项活动中。PR 地址仅作为执行结果记录，GitHub 开发关联仍通过已配置的 GitHub App/Webhook 同步。

租约默认 30 分钟，可用 `--lease-minutes 5..120` 调整；到期前续期，过期后不能继续完成原执行。每个事项最多一个有效执行，只有领取时的同一个令牌可以续期或完成。Epic 和已完成事项不能领取。撤销令牌不会立即释放其租约，需要等待到期。

导出工作流模板供 Codex 使用：

```sh
mkdir -p ~/.codex/skills/forge-cli
forge skill print > ~/.codex/skills/forge-cli/SKILL.md
```

然后在本地仓库让 Codex 使用 `forge-cli` 查询或修改事项、处理指定开发任务。旧的 `forge-task` 模板仍保留在源码包中。CLI 不会自动启动 Codex、推送代码或创建 PR。

## 命令总览

每个命令支持 `--help`，输出全部参数。默认输出格式化 JSON，`--json` 输出单行机器可读 JSON。

| 命令                                                               | 用途                               |
| ------------------------------------------------------------------ | ---------------------------------- |
| `login` / `logout` / `whoami`                                      | 登录、默认撤销令牌后退出、查看身份 |
| `token list` / `token revoke ID`                                   | 查看自己的令牌元数据、撤销令牌     |
| `config show` / `config set server URL` / `config set project APP` | 查看和修改默认配置                 |
| `project list` / `project show APP`                                | 可访问项目和项目信息               |
| `status list` / `member list` / `label list` / `sprint list`       | 查询当前项目字段选项               |
| `issue list` / `issue show KEY` / `issue context KEY`              | 筛选事项、详情、开发上下文         |
| `issue create` / `issue update KEY`                                | 创建事项并填写描述、编辑字段       |
| `issue transition KEY --to NAME`                                   | 修改状态                           |
| `issue assign KEY --to me`                                         | 分配负责人                         |
| `issue comment KEY --body-file FILE` / `issue comments KEY`        | 添加和读取评论                     |
| `issue history KEY` / `issue revisions KEY`                        | 活动历史、描述修订                 |
| `issue development KEY`                                            | 关联 PR 和提交                     |
| `issue claim KEY` / `issue release KEY`                            | 领取任务、释放自己的租约           |
| `run list` / `run show ID`                                         | 执行记录和结果                     |
| `run renew ID` / `run finish ID`                                   | 续期、回写执行结果                 |
| `skill print`                                                      | 输出 forge-cli skill 模板          |

本版聚焦任务开发闭环。工作区、成员权限、工作流与 GitHub App 的管理仍在网页中操作。

## 字段与分页

```sh
forge issue create --project APP --type task --title "支持导出" --description-file spec.md --priority P1 --assignee me
forge issue create --project APP --type subtask --parent APP-123 --title "补充导出测试"
forge issue update APP-123 --labels "frontend,ux" --estimate 3 --sprint none --if-version 4
forge issue list --project APP --assigned-to me --priority P1 --all --json
forge issue history APP-123 --all --json
forge run list --project APP --status RUNNING --all --json
```

- 类型：`epic`、`story`、`task`、`bug`、`subtask`；优先级：`P0`、`P1`、`P2`、`P3`、`none`。
- 项目使用 key 或 ID；事项使用 key 或 ID；状态、成员、标签、迭代使用精确名称或 ID。重名时要求使用 ID。
- `--assignee me` 表示自己，`none` 清除可空字段。`--labels` 为逗号分隔名称或 ID，`none` 清空标签。
- `--description-file`、`--body-file`、`--summary-file` 支持路径或 `-`（标准输入）；描述最大 200,000 字符，评论和结果最大 20,000 字符。
- `issue list` 默认 100 条，返回 `items`、`total`、`nextOffset`；通过 `--offset`、`--limit` 或 `--all` 翻页。
- `issue history` 和 `run list` 返回 `items`、`nextCursor`；使用 `--cursor` 或 `--all`。执行状态为 `RUNNING`、`SUCCEEDED`、`FAILED`、`CANCELLED`、`EXPIRED`。
- 评论最多最近 200 条；描述修订列表最近 100 个，可用 `--revision ID` 读取具体修订；开发关联各最近 100 条。上下文活动仅最近 50 条、执行记录最近 50 条，需要更早记录请用独立分页命令。

## 并发与重试

修改默认先读取当前版本再提交；Agent 应显式传 `--if-version`，防止覆盖阅读需求后他人的修改。冲突时重新读取并判断，不要盲目覆盖。

写入命令自动生成幂等键，也可用 `--idempotency-key KEY` 指定。网络错误会返回该键；重试必须使用相同命令、参数、文件内容及幂等键。CLI 在私有目录缓存原请求（含版本与目标），重试不会重新选取新的执行或覆盖新版本。相同键用于不同内容将报冲突。跨机器重试需保留原请求与显式版本，不能依赖另一台机器的缓存。

## 配置与权限

配置默认为 `~/.config/forge/config.json`，文件权限 0600、目录 0700。配置包含令牌，请勿提交或分享。`config show` 不输出令牌。请求缓存位于同目录的 `requests/`，不含明文令牌，但包含任务文本；目前不自动清理，确认不再需要重试后可自行清理。

环境变量 `FORGE_SERVER`、`FORGE_TOKEN`、`FORGE_PROJECT` 覆盖保存配置，`FORGE_CONFIG_DIR` 更改配置目录；命令行地址和项目优先于环境变量。保存的令牌绑定原站点，不会因 `--server` 改变而被发送到其他站点。`config set server` 更换站点会清除本地令牌。`logout --local` 仅清理本地配置，不撤销服务端令牌。

令牌权限与项目成员角色共同生效；移除成员、降级角色或撤销令牌后立即按新权限处理。服务端只保存令牌摘要。API 活动记录真实用户身份与 API 来源，`--executor` 只是执行器标签。

| 退出码 | 含义                         |
| ------ | ---------------------------- |
| 0      | 成功                         |
| 2      | 参数、配置或业务校验失败     |
| 3      | 未认证、令牌无效或站点不匹配 |
| 4      | 无权限                       |
| 5      | 未找到                       |
| 6      | 版本、租约或幂等冲突         |
| 7      | 网络、服务端或响应错误       |

成功数据写 stdout，错误写 stderr。`--json` 下错误包含 `error.code`、`error.message` 和可用的 `error.details`。

## 在 Markdown 中提及成员

通过 `forge member list --project APP --json` 查询成员 ID，在描述或评论文件中使用 `[@显示名](/mentions/成员UUID)`。服务端按 ID 校验项目访问权限；保存新增的有效提及会产生通知。纯文本 `@姓名` 和代码示例不会触发通知，自己及同一内容中的重复提及不会重复通知。适用于 `issue create/update/comment` 的文件输入。
