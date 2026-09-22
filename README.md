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

API 文档：http://localhost:3001/api/docs，JSON：http://localhost:3001/api/docs-json。服务层统一接收由认证生成的 `ActorContext`；后续 Agent 增加独立凭据与 Guard，即可复用 Issue / Board / Sprint 命令，不应直接写数据库或信任请求体的 actorId。当前没有 Agent token 管理、MCP 服务或自动开发功能。

## GitHub 开发关联

支持 GitHub App 仓库绑定、Webhook 同步 PR/Commit、事项开发活动与可配置状态自动化。首次导入不改变事项状态，自动化默认关闭；没有 GitHub API 定时轮询。配置和限制见 [GitHub 接入说明](docs/github-integration.md)。
