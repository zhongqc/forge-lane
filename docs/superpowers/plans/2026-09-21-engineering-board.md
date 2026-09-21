# Engineering Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现中文研发 Board，以顺滑拖拽、可靠字段编辑和 MDXEditor 描述书写为核心，同时具备事务历史和未来 Agent 可复用的业务 API。

**Architecture:** pnpm monorepo，React SPA 与 NestJS 模块化单体共享 API 类型，PostgreSQL 保存业务当前状态及追加式历史。按纵向能力逐项交付，所有写操作统一经过身份、权限、版本和业务规则校验。

**Tech Stack:** React、TypeScript、Vite、React Router、TanStack Query、Radix UI、原生 CSS、dnd-kit、MDXEditor、NestJS、Prisma、PostgreSQL、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-21-engineering-board-design.md`；原始规则见 `docs/init-spec.md`，冲突时以用户确认的实施设计为准。

## Global Constraints

- 中文界面；桌面 1440px 为主要工作尺寸。
- 数据库唯一内容源是标准 Markdown 字符串；不启用任意 JSX / MDX 组件。
- onDragOver 只更新投影，onDragEnd 至多发送一次 MoveIssue。
- Issue 分离 boardOrder 与 backlogOrder：两种视图排序互不污染。
- 所有业务变更与 Activity 写入同一数据库事务。
- 不新增 Dashboard、图表、燃尽图或 Agent 自动开发功能。
- 当前实现邮箱密码登录；Swimlane、GitHub 集成与 OAuth 增强按原文 P1/P2 留待后续。
- 生产不自动创建演示账户；不引入 Redis、CQRS、Event Sourcing、Redux 或 Tailwind。
- 每个任务先建立有行为断言的失败测试，再实现，最后通过对应验证；不为纯配置和样式写镜像测试。
- 当前目录不是 Git 仓库；执行时先初始化仓库、保留现有文档，配置 `.gitignore` 排除密钥、构建物和 `.claude` 本地设置，不擅自设置远端或全局 Git 身份。

## Review Focus

1. 编辑时发生中文 IME composition、焦点进入工具栏或切换事项：草稿不得误提交或丢失。Task 8 验证。
2. 同一事项连续编辑、同时拖拽、请求超时后重试：不重复建记录、不回滚掉其他成功操作。Task 3、6、7 验证。
3. 筛选隐藏卡片后插入、空状态区、拖到无效区域：真实状态和完整排序必须一致。Task 6、7 验证。
4. 用户退出后打开深链、猜测其他项目 UUID、提交伪造 Actor：不能泄露或修改无权访问的数据。Task 2、10 验证。
5. 正在完成 Sprint 时另一请求加入事项，或迁移描述包含 HTML/危险链接：不能出现半完成状态或执行脚本。Task 5、8 验证。

## 文件职责

```text
apps/server/src/main.ts                         NestJS 启动与全局验证
apps/server/src/app.module.ts                   模块组合
apps/server/src/common/                         actor-context、错误、版本、幂等、事务工具
apps/server/src/modules/auth/                   登录、会话、认证与权限
apps/server/src/modules/workspace/              Workspace 与成员
apps/server/src/modules/project/                项目、成员、默认工作流和配置
apps/server/src/modules/issue/                  Issue、关系、筛选、标签、评论
apps/server/src/modules/activity/               活动追加、分页、描述修订读取
apps/server/src/modules/sprint/                 Sprint 生命周期与规划排序
apps/server/src/modules/board/                  Board 查询、移动与分数排序
apps/server/src/modules/shell/                  安全深链 metadata 与 SPA fallback
apps/web/src/app/                               Router、Providers、Shell、登录
apps/web/src/features/board/                    Board、分区、卡片、拖拽投影
apps/web/src/features/issues/                   详情、创建、字段、筛选、列表
apps/web/src/features/editor/                   MDXEditor、Markdown 展示、草稿和冲突
apps/web/src/features/backlog/                  Sprint 规划与生命周期 UI
apps/web/src/features/settings/                 Workspace/Project/Workflow 设置
apps/web/src/components/                        Radix 通用交互组件
apps/web/src/lib/                               HTTP、Query Keys、串行 mutation
apps/web/src/styles/                            tokens、reset、globals、utilities
packages/shared/src/                           API 契约、枚举、错误码
packages/db/prisma/schema.prisma                关系模型
packages/db/prisma/migrations/                  SQL 迁移、CHECK/FK/部分唯一索引
packages/db/src/                                Prisma Client、seed
tests/integration/                             真实 PostgreSQL 事务和 HTTP 测试
tests/e2e/                                     浏览器场景与性能记录
scripts/dev.mjs                                数据库就绪、迁移、开发服务编排
```

## Task 1：可运行工程与数据库基础

**Files:** 创建根 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`eslint.config.mjs`、`.gitignore`、`.env.example`、`compose.yaml`，各 workspace 的 package/tsconfig；创建 `packages/db/prisma/schema.prisma`、`packages/db/src/client.ts`、`packages/shared/src/contracts.ts`、`tests/integration/schema.test.ts`。

**Interfaces:** 导出 Prisma Client；共享 `ActorContext`、`IssueType`、`IssueSummary`、`ApiError`。所有 ID 为 UUID 字符串、时间为 ISO 字符串、顺序为十进制字符串；API 枚举使用大写。

- [ ] 建立工作区与测试命令；先检查 Node/pnpm/Docker 可用性，读取所选依赖的官方文档后固定兼容版本及 lockfile。
- [ ] 编写真实数据库约束测试，再执行 `pnpm test:integration -- schema`，确认初始缺表导致失败。

```ts
it('拒绝同项目多个活跃 Sprint', async () => {
  const project = await fixture.project();
  await fixture.sprint({ projectId: project.id, status: 'ACTIVE' });
  await expect(fixture.sprint({ projectId: project.id, status: 'ACTIVE' })).rejects.toThrow();
});
```

- [ ] 实现设计中的实体；额外建立 Session、IdempotencyRecord、CommentRevision。Issue `(projectId, id)` 唯一用于复合 FK，Actor 与 User 一对一可空关联，Sprint/Status/Label 关联约束同项目。
- [ ] 迁移加入 `CREATE UNIQUE INDEX ... ON "Sprint" ("projectId") WHERE status = 'ACTIVE'`；排序 numeric(65,30)，非负估点、层级形状 CHECK、版本正整数 CHECK；Activity、Revision 按主体和时间建索引。
- [ ] 实现基础契约并测试 UUID/日期/decimal JSON 序列化，执行 `pnpm db:migrate`、`pnpm test:integration -- schema` 和 `pnpm typecheck`。

```ts
export interface ActorContext {
  actorId: string;
  workspaceId: string;
  source: 'WEB' | 'API' | 'SYSTEM';
  requestId: string;
}
export interface ApiError {
  code: string;
  message: string;
  requestId: string;
}
```

## Task 2：认证、项目与权限闭环

**Files:** 创建 `apps/server/src/modules/auth/{auth.module,auth.controller,auth.service,auth.repository,session.guard,access.guard}.ts`、`dto/login.dto.ts`；workspace/project 对应 module/controller/service/repository；`tests/integration/auth.test.ts`、`project.test.ts`；`apps/web/src/app/{App,LoginPage,AppShell,Providers}.tsx`。

**Interfaces:** `AuthService.login(email, password)` 返回会话；`AccessService.requireProject(context, projectId, 'READ'|'WRITE'|'ADMIN')`；`GET /api/me`，`POST /api/auth/login|logout`，Workspace 与 Project CRUD/成员接口。

- [ ] 建立 supertest fixture（独立测试数据库、事务外重置、两个 Workspace、三个角色），测试匿名 401、Viewer 写入 403、跨项目 404、伪造 actorId 400。

```ts
it('Viewer 无法创建事项', async () => {
  const { viewer, project } = await fixture.workspace();
  await viewer
    .post(`/api/projects/${project.id}/issues`)
    .send({ type: 'TASK', title: '越权创建' })
    .expect(403);
});
```

- [ ] 执行 `pnpm test:integration -- auth project` 确认失败，实现密码哈希、随机会话令牌仅存摘要、Cookie 安全属性、退出失效、Origin/CSRF 校验和登录限速；所有 DTO whitelist/forbidNonWhitelisted。
- [ ] 创建项目时事务生成八个 Status、四个 Column 及映射；项目 key 唯一且不可变。实现 Admin 创建/删除项目、成员管理；删除项目显式确认并按关系执行事务删除，不破坏其他项目数据。
- [ ] 搭建中文登录、Workspace/项目导航、Loading/Error/空态；持久化登录后刷新正常，401 清理 Query 和草稿内存后回到登录，保留原目标 URL。
- [ ] 运行角色与会话集成测试、`pnpm typecheck`；浏览器验证登录→创建项目→退出。

## Task 3：统一变更协议与历史

**Files:** 创建 `apps/server/src/common/{actor-context,idempotency.service,api-exception.filter}.ts`、`modules/activity/{activity.module,activity.repository,activity.controller}.ts`、`tests/integration/history.test.ts`。

**Interfaces:** `ActivityRepository.append(tx, event)`；`IdempotencyService.execute(context, route, key, body, operation)`，operation 在同一事务运行并返回 JSON；`GET /api/issues/:id/activities?cursor=`、`GET /api/issues/:id/revisions/:revisionId`。

- [ ] 编写历史随业务回滚、同键同体返回同一响应、同键不同体 409、不同 Actor 相同键互不干扰的测试，执行确认失败。

```ts
it('命令重试不重复写历史', async () => {
  const first = await fixture.createIssue({ idempotencyKey: 'create-1' });
  const retry = await fixture.createIssue({ idempotencyKey: 'create-1' });
  expect(retry.id).toBe(first.id);
  expect(await fixture.activityCount(first.id, 'CREATED')).toBe(1);
});
```

- [ ] 幂等记录按 actor/route/key 唯一；保存规范请求摘要与响应，竞争请求等待事务并重读结果；失败事务不保留成功记录。规定保留 7 天，通过维护命令清理，不引入队列。
- [ ] 历史记录包含身份名称快照、before/after、schemaVersion、requestId、issueVersion。描述修订独立存储。游标使用 createdAt+id 稳定排序，历史/修订读取复用项目权限。
- [ ] 执行 `pnpm test:integration -- history`；验证事务异常后业务数据、历史和幂等记录均未提交。

## Task 4：Issue 业务与关系 API

**Files:** 创建 `apps/server/src/modules/issue/{issue.module,issue.controller,issue.service,issue.repository}.ts`、`domain/issue.policy.ts`、`dto/{create-issue,update-issue,query-issues}.dto.ts`、`packages/shared/src/issues.ts`、`tests/integration/issues.test.ts`、`issue.policy.test.ts`。

**Interfaces:** `IssueService.create(context, projectId, input)`、`update(context, id, {version, ...fields})`、`get(context, id)`、`list(context, projectId, filter)`；返回包含 `version`、有效 Sprint/Epic、children 的详情；PATCH 未提交字段保持原值，null 明确清空。

- [ ] 测试五种类型创建、非法层级、跨项目 Epic/parent、0/null 估点差别、父事项 Sprint 派生、类型转换和版本冲突，执行失败测试。

```ts
it('拒绝 Epic 加入 Sprint 且不写历史', async () => {
  const { epic, sprint, member } = await fixture.issueGraph();
  await member
    .patch(`/api/issues/${epic.id}`)
    .send({ version: epic.version, sprintId: sprint.id })
    .expect(422);
  expect(await fixture.issueVersion(epic.id)).toBe(epic.version);
});
```

- [ ] 创建编号使用 Project counter 的事务原子递增；Policy 集中校验，状态/Sprint 更改复用相应 Service 内部事务方法；更新 `WHERE id AND version` 并原子写历史，无变化不增版本。
- [ ] 实现 Labels 多对多、带权限的 key/title/description 搜索、多值筛选与固定字段分页排序；Subtask 继承字段由查询映射生成。
- [ ] 实现评论新增/本人编辑/本人删除，Comment version 乐观锁，修订保留正文，已删除显示标记；活动记录引用评论 ID。
- [ ] 执行 `pnpm test:integration -- issues history` 与 Policy 单测；20 个并发创建无重复编号。

## Task 5：Sprint 与 Backlog 业务

**Files:** 创建 `apps/server/src/modules/sprint/{sprint.module,sprint.controller,sprint.service,sprint.repository}.ts`、`domain/sprint.policy.ts`、`dto/sprint-command.dto.ts`、`tests/integration/sprints.test.ts`。

**Interfaces:** `start(context,id,version)`、`complete(context,id,{version,destinationSprintId:null|string})`、`addIssue(context,id,{issueId,version})`、`removeIssue(context,id,issueId,version)`；显式 POST start/complete/issues 与 DELETE issues 路由；Sprint 自身也有 version。

- [ ] 测试同时启动、重复完成、完成目标非法、加入已完成 Sprint、删除 Planned Sprint、完成与加入竞争，先运行确认失败。

```ts
it('完成 Sprint 仅迁移未完成父事项', async () => {
  const graph = await fixture.activeSprint();
  await graph.complete({ destinationSprintId: null });
  expect((await graph.reloadOpenIssue()).sprintId).toBeNull();
  expect((await graph.reloadDoneIssue()).sprintId).toBe(graph.sprint.id);
  expect((await graph.reloadSubtask()).effectiveSprintId).toBeNull();
});
```

- [ ] 生命周期与成员变更按固定顺序锁定 Sprint 行，状态检查在锁内完成；加入与完成遵循相同锁策略。Subtask 不复制 Sprint 数据；迁移父事项时写历史并为受影响子事项记录有效归属变化。
- [ ] 规划移动接口携带 version、目标 Sprint 和相邻 ID，仅更新 backlogOrder；与 Board 的 rank 计算共享纯函数，不能共享排序域。
- [ ] 执行 `pnpm test:integration -- sprints`，断言 Sprint 与事项/历史事务原子性和唯一 ACTIVE 约束。

## Task 6：Board 移动与分数排序

**Files:** 创建 `apps/server/src/modules/board/{board.module,board.controller,board.service,board.repository}.ts`、`domain/{board.policy,fractional-order}.ts`、`dto/move-issue.dto.ts`、`packages/shared/src/board.ts`、`tests/integration/board.test.ts`、`fractional-order.test.ts`。

**Interfaces:** `MoveIssue {issueId,targetColumnId,targetStatusId,targetSortOrder,previousIssueId,nextIssueId,version}`，相邻 ID 可空；`BoardService.moveIssue(context,projectId,command)`；查询返回完整当前范围卡片、Columns、Sections 和版本。

- [ ] 测试同区、跨区、跨列、空区、非法 Column/Status、过期版本、精度耗尽、筛选后的相邻项与同目标并发，先运行失败测试。

```ts
it('Code Review 落点不变成列的第一个状态', async () => {
  const board = await fixture.board();
  const issue = await board.moveTo('Code Review');
  expect(issue.statusId).toBe(board.statusId('Code Review'));
});
```

- [ ] 使用 Prisma.Decimal 算术：两邻取均值，首尾增减 1000；验证有限数和精度。rank 在服务端依据同域邻居重新计算，拒绝邻居不属于域或次序倒置。
- [ ] 按排序域字符串排序获取事务 advisory locks，再锁 Issue 并重查版本和目标；源域变化返回 409。区间过小时从邻近 32 条窗口开始扩大归一化，更新受影响版本，避免每次移动整列重排。
- [ ] 仅成功 Drop 写一次业务 Activity，技术归一化不刷屏；Move 不修改 backlogOrder。运行 `pnpm test:integration -- board` 与 rank 单测。

## Task 7：Board 页面、筛选与乐观更新

**Files:** 创建 `apps/web/src/features/board/{BoardPage,BoardColumn,StatusSection,IssueCard,BoardToolbar}.tsx`、`{project-drag,collision-detection}.ts`、`Board.module.css`；`apps/web/src/lib/{api,query-keys,issue-mutations}.ts`；`tests/e2e/board.spec.ts`。

**Interfaces:** `projectDrag(board, activeId, target): BoardProjection` 纯函数；`useIssueMutation(issueId)` 串行发送并读取最新 version；Query keys 含项目与范围。UI 筛选在完整范围模型之上计算，移动使用完整域排序。

- [ ] 添加 Playwright 可访问名称定位测试和投影单测：空区落点、取消不请求、Drop 一次请求、失败恢复、连续编辑串行、筛选隐藏邻居；运行失败用例。

```ts
test('拖入空 Testing 分区仅提交一次', async ({ page }) => {
  let moves = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/board/moves')) moves++;
  });
  await page
    .getByRole('button', { name: '拖动 APP-2' })
    .dragTo(page.getByRole('region', { name: 'Testing' }));
  await expect(page.getByRole('region', { name: 'Testing' })).toContainText('APP-2');
  expect(moves).toBe(1);
});
```

- [ ] dnd-kit 配置 Pointer/Keyboard Sensor、DragOverlay、独立状态区 droppable 和卡片 sortable；碰撞算法返回真实 Section 与插入位置；无效 Drop/取消清空投影。
- [ ] 实现 Query 级乐观投影，mutation 按 Issue 串行；失败只撤销本次 Issue 操作，重新获取权威状态；成功合并版本并失效受归一化影响的查询。显示进行中/失败反馈。
- [ ] 实现全部 quick filters、多值通用筛选、搜索、活跃 Sprint/全部范围，筛选入 URL；卡片高度稳定、边界清晰、空区不塌陷。
- [ ] 运行 Board 浏览器测试与 `pnpm typecheck`；1440px 截图检查并调整排版与焦点提示。

## Task 8：Issue 详情与 MDXEditor

**Files:** 创建 `apps/web/src/features/issues/{IssueDrawer,CreateIssueDialog,InlineField,SearchableSelect,IssueRelationships,ActivityList,CommentComposer}.tsx`；`apps/web/src/features/editor/{DescriptionEditor,MarkdownView,ConflictDialog}.tsx`、`draft-store.ts`；`tests/e2e/{issue-editing,editor}.spec.ts`。

**Interfaces:** `DescriptionEditor({issueId,markdown,version,onSave})`；`onSave({markdown,version})` 返回新详情；草稿按 session/issueId 隔离，退出清除。详情由 URL key 驱动，背景路由保存 Board 视图状态。

- [ ] 先验证 MDXEditor 官方 API、Markdown 插件与 Slash Command 接入点；使用其扩展接口实现缺失交互，不重写底层编辑器。
- [ ] 编写字段 Enter/Escape/清空/0、选择器键盘搜索、草稿切换恢复、保存冲突、工具栏不失焦保存的失败用例。

```ts
test('描述冲突保留草稿', async ({ page }) => {
  await page.getByRole('button', { name: '编辑描述' }).click();
  await page.getByRole('textbox', { name: '事项描述' }).fill('本地修改');
  await page.route('**/api/issues/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: '事项已更新' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: '保存描述' }).click();
  await expect(page.getByRole('dialog', { name: '描述有新版本' })).toContainText('本地修改');
});
```

- [ ] Radix Dialog 抽屉、Popover/命令搜索、Tooltips；实现创建连续模式、常用字段上下文、子任务与 Epic 关系、字段内错误反馈。所有字段调用统一版本 mutation。
- [ ] 按需加载 MDXEditor，启用设计要求的 Markdown 插件和工具栏；显式保存/取消、Cmd/Ctrl+Enter、composition 防护。安全 Markdown renderer 禁用原始 HTML 和危险协议。
- [ ] 草稿含 baseVersion/baseMarkdown/draftMarkdown，关闭与路由切换提供保存/保留草稿/放弃选择；刷新前提示，保存失败不清理。冲突展示两版，基于最新 version 重提仍遵循乐观锁。
- [ ] 编写 Markdown fixture 包含中文、嵌套清单、链接、代码围栏，执行 edit→save→reload；比较解析语义而非空白字节。测试粘贴、撤销/重做、恶意链接；记录实际中文 IME 人工验收结果。

## Task 9：Backlog、列表、Epic 和设置页面

**Files:** 创建 `apps/web/src/features/backlog/{BacklogPage,SprintGroup,SprintDialog,CompleteSprintDialog}.tsx`、`features/issues/{IssueListPage,EpicsPage,IssueFilters}.tsx`、`features/settings/{ProjectSettingsPage,WorkflowSettings,MembersSettings}.tsx`；服务端 `modules/project/{workflow.service,workflow.controller}.ts`；`tests/e2e/planning.spec.ts`。

**Interfaces:** 使用 Tasks 2/4/5 的 API；新增带配置版本的工作流状态 CRUD、排序与 Column 映射 API，服务端校验每个状态恰好映射一个同项目 Column。

- [ ] 编写完整规划场景和非法设置测试，先执行确认失败。

```ts
test('完成 Sprint 前明确选择未完成事项去向', async ({ page }) => {
  await page.getByRole('button', { name: '完成 Sprint' }).click();
  await expect(page.getByRole('dialog', { name: '完成 Sprint' })).toBeVisible();
  await page.getByRole('radio', { name: '移回 Backlog' }).check();
  await page.getByRole('button', { name: '确认完成' }).click();
  await expect(page.getByRole('region', { name: 'Backlog' })).toContainText('APP-2');
});
```

- [ ] Backlog 显示 Active/Future/Backlog，支持拖拽规划、排序、建/删 Planned、启动/完成 Sprint；移动和字段选择共用业务命令。
- [ ] 固定列 Issue List 支持排序、搜索、筛选和打开相同详情；Epic 列表与子事项关系可用，不增加分析图表。
- [ ] 设置实现项目基本信息、成员、标签、有限工作流状态和 Column 映射；使用中的状态删除返回具体原因，删除/重排事务处理，Viewer 无编辑入口且服务端拒绝写。
- [ ] 运行 `pnpm test:e2e -- planning` 和工作流集成测试，验证 Backlog 排序不影响 Board 顺序。

## Task 10：深链、部署与最终验收

**Files:** 创建 `apps/server/src/modules/shell/{shell.module,shell.controller,issue-preview.service}.ts`、`Dockerfile`、`scripts/dev.mjs`、`packages/db/src/seed.ts`、`README.md`、`playwright.config.ts`、`tests/e2e/{deeplink,journey,performance}.spec.ts`、`docs/verification.md`。

**Interfaces:** `IssuePreviewService.getMetadata(context,key)` 只读取 key/title/description summary/project/type；NestJS 提供 `/api/*`、静态资源、`/issues/:key` 和 SPA fallback，未知 API 不回退 HTML。

- [ ] 测试匿名通用 metadata、已授权精确 title/OG、跨项目不泄漏、HTML 转义、直接刷新不 404 且 URL 不重定向。

```ts
it('匿名深链不泄漏私有标题', async () => {
  const response = await request(app.getHttpServer()).get('/issues/APP-2').expect(200);
  expect(response.text).not.toContain('私有事项标题');
  expect(response.headers.location).toBeUndefined();
});
```

- [ ] 构建 SPA Shell 占位 metadata 安全替换；个性化 HTML 设置 private/no-store；Vite 开发代理覆盖深链 metadata 的验证路径或使用生产构建进行该项测试。
- [ ] Compose 配置 app/postgres 健康检查、数据卷、迁移启动步骤；生产需要显式 AUTH_SECRET 等配置。开发脚本检查 Docker、等待数据库健康、执行迁移并启动前后端，退出清理子进程。
- [ ] 幂等 seed 创建 Acme、Mobile App、两个 Epic、无 Epic 事项、多状态与空区、计划/活跃 Sprint；演示密码由 seed 环境变量提供，README 写清初始化及登录步骤。
- [ ] 执行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build`、`pnpm test:e2e`，以及空数据库迁移和 `docker compose up -d --build` 验证。
- [ ] E2E 跑完整业务链：建项目→Epic→Story→Sprint→启动→Code Review→Testing→Done→完成 Sprint→查看关联子事项；模拟请求失败与两个浏览器并发编辑。
- [ ] 500 条事项记录 API 延迟和拖拽响应，保存 1440px 截图，检查键盘焦点、空态、Loading/Error、无 Console Error；在 `docs/verification.md` 写实际执行命令、结果、环境和未验证项。
- [ ] 运行全量需求对照审查，修复发现的缺口后只重跑受影响验证及必要回归；提交代码，最终汇报启动方式、验证结果和真实限制。

## 执行与评审

建议本任务内直接执行：前后端共享类型、版本协议、历史事务和编辑保存机制紧密关联，由同一执行者逐步实现可减少接口偏差。每个 Task 验证通过后提交相关文件；若本机没有 Git 身份则保留工作区并说明，不修改用户全局配置。

备选为逐任务子代理实现及独立评审，适合希望更细粒度独立审查、愿意承担额外上下文成本的情况。实施方式待用户选择。当前文档是计划，不代表任何产品能力已实现或验证通过。
