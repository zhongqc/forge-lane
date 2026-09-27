# Forge Lane

面向研发团队的 Jira 类 Board。React + Vite + NestJS + PostgreSQL + **Prisma**，描述编辑使用 **MDXEditor**，标准 Markdown 是唯一存储源。

## 本地启动

需要 Node.js 24+、pnpm 11.9、Docker。

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

`pnpm dev` 启动 PostgreSQL、生成 Prisma Client、应用迁移并启动前后端。打开 http://localhost:5173，可直接注册自己的工作区。数据库使用独立的 Compose volume 和 localhost:55432。

可选演示数据（在另一个终端运行，密码至少 10 位）：

```sh
SEED_PASSWORD='your-local-demo-password' pnpm db:seed
```

演示邮箱 `demo@forge.local`；已有账户不会被重置。数据包括 Acme Studio、Mobile App、2 个 Epic、16 个事项、多个状态和两个 Sprint。

## 已实现

- 默认四列八状态的看板；状态与列映射分离；精确落区、空区、拖拽排序和失败回滚。
- Epic / Story / Task / Bug / Subtask；详情深链；可搜索字段选择器、估点（区分 0 和未估点）、连续创建。
- MDXEditor 的标题、列表、清单、代码、链接、Slash 命令、撤销重做；显式保存和 Cmd/Ctrl+Enter；会话草稿及版本冲突比较。
- Backlog 独立排序，Sprint 创建、启动、完成、未完成事项迁移；子任务继承父事项的 Sprint。
- 项目设置、工作流映射、成员角色、标签；列表、搜索与筛选；评论、活动与描述版本记录。
- HttpOnly 会话、角色校验、项目隔离、写请求来源校验、幂等命令和乐观锁。

先让团队成员注册，再由工作区管理员在项目设置里通过邮箱加入工作区并分配项目角色。支持切换工作区。

按已确认范围，暂不实现分析图表、Swimlane、OAuth 登录、附件上传和 Agent 自动执行。

## 质量检查

```sh
pnpm lint                 # Oxlint + TypeScript 类型感知规则
pnpm format:check         # Oxfmt
pnpm typecheck
pnpm test
pnpm build                # 生产 SPA + NestJS
pnpm test:integration     # 真实 PostgreSQL；先 migrate 和 build
pnpm exec playwright install chromium
pnpm test:e2e             # 自动启动/复用开发服务器
```

Git pre-commit 自动检查 lint、格式和类型；GitHub Actions 执行完整检查及数据库/浏览器测试。测试使用独立命名的工作区与项目，不清空已有数据。浏览器产物在 `test-results/`，具体结果见 [验收记录](docs/verification.md)。

## 容器运行

```sh
docker compose --profile app up -d --build
```

访问 http://localhost:3001。App 在数据库健康后应用迁移，提供 API 和生产静态页面。开发服务器占用 3001 时先停止 `pnpm dev`。默认配置仅绑定本机，适合本地验收。

正式部署时设置独立数据库密码、实际 `APP_URL`，在 HTTPS 反向代理后设置 `COOKIE_SECURE=true`，并自行配置数据库备份和保留策略。应用不自动创建演示账号。认证使用随机不透明会话 token（数据库仅保存 SHA-256 摘要），不依赖伪设的 JWT secret。

## 数据与 Agent 接入边界

Schema 在 `packages/db/prisma/schema.prisma`，迁移在其 `migrations/` 子目录。Issue 当前状态与 Activity 在同一事务写入；描述和评论保留不可变修订；Activity 保留 Actor 名称快照、来源、请求标识和 schemaVersion。

Board / Backlog 分别使用 `Decimal(65,30)` 顺序；API 只接收相邻事项 ID，由服务端定位并局部归一化。Issue / Sprint 更新需要 `version`；冲突返回 409；创建、移动与生命周期命令支持 `Idempotency-Key`，重复请求不会重复创建或追加历史。当前以工作区级事务锁保证跨事项层级和 Sprint 决策一致性，适用于小团队；高写入吞吐场景需进一步拆分锁粒度。

API 文档：http://localhost:3001/api/docs，JSON：http://localhost:3001/api/docs-json。服务层统一接收由认证生成的 `ActorContext`；已支持限定项目和读写范围的 CLI 令牌，以及任务领取、续期和执行结果记录。Agent 通过 API 操作，不应直接写数据库或信任请求体的 actorId。当前没有 MCP 服务或服务端自动开发功能。

当前应用版本在 `packages/shared/src/version.ts` 维护；Web 界面和 API 文档共用此值。无需登录即可通过 `GET /api/version` 查询，响应示例：`{"version":"0.1.0"}`。

## GitHub 开发关联

支持 GitHub App 仓库绑定、Webhook 同步 PR/Commit、事项开发活动与可配置状态自动化。首次导入不改变事项状态，自动化默认关闭；没有 GitHub API 定时轮询。配置和限制见 [GitHub 接入说明](docs/github-integration.md)。

## 本地 CLI / Codex

`pnpm forge --help` 查看全部命令。支持事项读写、描述与评论、历史与开发关联、任务领取及执行结果回写。登录后即可让本地 Codex 通过 CLI 获取任务，开发仍在本机进行。安装、命令和 skill 模板见 [CLI 使用说明](packages/cli/README.md)。

## @ 提及与通知

描述（含创建）和评论支持 @ 选择项目成员。保存后通知本次新提及的人，自己、重复提及和代码示例不产生通知。站内通知保留未读状态，邮件通过 SMTP 异步投递；飞书等渠道仅预留接口。部署配置与投递边界见 [通知说明](docs/notifications.md)。

## Sprint 历史与成员估点

看板和 Backlog 的当前 Sprint 下可展开“成员 Story Points”，查看每人的总点数、已完成点数、剩余点数、事项数及未估点事项；未分配单列，按 Story / Task / Bug 统计，子任务不重复计点，统计不受看板筛选影响。

Backlog 右上角“历史 Sprint”可查看已完成迭代。新完成的 Sprint 会在未完成事项迁出前保存不可变快照，后续修改事项不会改写历史点数。旧 Sprint 没有快照时明确标注数据不完整，仅展示目前仍关联的事项及当前字段。

## 代码组织

前后端职责、模块依赖和样式维护约定见 [代码组织与模块边界](docs/code-organization.md)。
