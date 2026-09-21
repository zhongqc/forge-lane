# Engineering Board 实施设计

状态：用户已确认，编辑器指定为 MDXEditor。需求依据：`docs/init-spec.md` 及本次用户补充。

## 1. 目标与边界

交付研发团队可日常使用的 Jira 类 Board。优先保证准确顺滑的拖拽、低摩擦的字段编辑、舒适且可靠的描述书写。分析展示暂不实现；不新增 Dashboard、图表、燃尽图或 Agent 自动开发功能。

本次范围按原 spec 的优先级执行：全部 P0，加上支撑日常使用和追溯的评论、活动记录、Issue List、搜索和标签。Epic 展示子事项及数量，不做分析展示。Swimlane、GitHub 集成与 OAuth 增强按原文 P1/P2 留待后续；当前实现邮箱密码登录。GitHub 关联的数据边界和 Actor 模型在设计中保留，不建立空壳集成页面。

默认假设：中文界面，保留 Epic/Story/Task/Bug 等研发术语；桌面 1440px 为主要工作尺寸，小屏能横向浏览 Board 并打开详情；提供独立的演示数据初始化命令，生产不自动创建演示账户。

## 2. 架构选择

推荐：React + TypeScript + Vite + React Router + TanStack Query；NestJS + PostgreSQL + Prisma；pnpm workspace。使用原生 CSS、CSS Modules 和 Radix UI，dnd-kit 处理拖拽，MDXEditor 编辑描述。

备选一：Drizzle 替代 Prisma，SQL 更直接，但本项目没有既有 ORM，优先 Prisma 的关系模型和迁移维护体验。备选二：完整事件溯源不采用，复杂度与 spec 明确冲突。当前状态表 + 同事务追加活动记录足以支撑追溯。

目录保持 `apps/web`、`apps/server`、`packages/db`、`packages/shared`。服务端按 auth/workspace/project/issue/sprint/board/activity 分模块，Controller 只接收 DTO、身份上下文并调用 Service；Policy 集中业务规则；Repository 接收事务上下文执行数据操作。

## 3. Board 体验

项目默认打开 Board，保留侧栏、紧凑工具栏和四个流程列。每列内按状态纵向分区，分区标题、数量、边界和空落点始终可见。默认展示活跃 Sprint；没有活跃 Sprint 时给出明确空态和进入 Backlog 的入口，另提供全部事项范围。

卡片显示编号、标题、类型、优先级、负责人、估点和低权重 Epic。点击打开可深链的侧边详情，关闭后恢复 Board 的筛选、滚动位置和焦点。直接访问 `/issues/:key` 也能打开相同详情。

拖拽提供手柄、移动预览、精确插入线、跨区高亮和键盘操作；空状态区有稳定高度。onDragOver 只更新投影，onDragEnd 至多发送一次 MoveIssue。取消或拖出有效区域不发请求。同区排序、同列跨状态和跨列遵循实际落点。

TanStack Query 管理乐观更新。同一 Issue 的在途写入串行，防止字段修改与拖拽互相覆盖。失败撤销对应操作并刷新权威数据，避免整份缓存回滚抹掉其他成功修改。筛选时按可见相邻卡片在完整顺序中定位；结果变化后保持合理焦点，并提示事项已不匹配当前筛选。

## 4. 字段编辑体验

标题点击编辑，Enter 提交、Escape 取消，输入期间不触发拖拽或快捷键。负责人、状态、优先级、Sprint、Epic、类型、标签采用可搜索选择器；选中即保存、支持清空允许为空的字段。估点支持数字、清空与键盘提交，严格区分 0 和未估点。

使用成熟可访问性 Primitive 处理焦点、弹层定位、键盘导航与屏幕阅读器标签。每个字段可见保存状态，错误靠近对应字段，不只依赖短暂 Toast。非法父子关系不给出可选项，但后端仍独立校验。类型转换导致现有关系不合法时拒绝并解释，不静默丢弃 Sprint、Epic 或子任务。

Issue 创建保持轻量：标题必填，提供类型与常用字段，沿用当前项目、Sprint 和状态上下文，支持连续创建。Subtask 从父事项详情创建；Epic 不出现 Sprint/估点入口，Subtask 显示继承的 Sprint。

## 5. 描述书写与保存

默认显示安全渲染的 Markdown；点击后进入 MDXEditor。支持标题、强调、删除线、行内代码、列表、嵌套列表、任务清单、引用、代码块、链接、Slash Command、Markdown 粘贴及撤销重做。禁用表格、LaTeX、AI 和复杂样式。数据库唯一内容源是标准 Markdown 字符串；不启用任意 JSX / MDX 组件。

提供明确保存和取消按钮及 Cmd/Ctrl+Enter 保存。失焦不提交，避免链接弹层、代码语言菜单和中文输入法造成意外保存。输入法 composition 期间不响应提交快捷键。编辑器按 Issue 独立维护草稿，切换详情或关闭时有未保存提示；会话内草稿可恢复，保存失败保留内容。

服务端使用 version 乐观锁。冲突时展示服务端新版本和本地草稿，允许复制草稿、载入最新内容或基于最新版本明确重新提交；不静默覆盖他人内容。重新提交仍检查版本。Markdown 禁止执行原始 HTML，链接过滤危险协议。

## 6. 数据结构与约束

核心实体：Workspace、User、Actor、WorkspaceMember、Project、ProjectMember、Status、BoardColumn、BoardColumnStatus、Issue、Sprint、Label、IssueLabel、Comment、Activity、DescriptionRevision。

- Actor 使用独立 UUID，kind 为 HUMAN/AGENT/SYSTEM；Human 关联 User，展示名称与身份分离。负责人、报告人、评论作者和操作人关联 Actor。当前只有 Human 登录入口；Agent 不因拥有 Actor 记录就拥有权限。
- Project 保留 workspaceId、不可变 key 和事务内递增的 issueCounter。Issue 使用 UUID 主键及 `(projectId, number)` 唯一约束，编号删除后不复用。
- Issue 保留 spec 业务字段，额外使用 version 整数。描述为 text。排序使用 PostgreSQL numeric；API 用规范十进制字符串传递，避免浮点精度损失。
- Issue 分离 boardOrder 与 backlogOrder：两种视图排序互不污染。Board 排序域为项目、有效 Sprint 和状态；Backlog 排序域为项目、Sprint。相同排序值以 UUID 稳定打破平局。
- Epic 禁止 parent/sprint/estimate；Subtask 必须有 Story/Task/Bug 父事项，不独立存 Sprint、Epic 和估点；读取时从 parent 派生有效 Sprint/Epic。普通事项不得有 parent。
- 关系必须同项目；所属 Actor 必须有项目可访问资格。Policy 校验加上可表达的数据库 CHECK、复合 FK、唯一约束，防止跨项目关系。
- Sprint 的 ACTIVE 状态使用部分唯一索引限制每项目一个；完成 Sprint 在事务内锁定并迁移未完成事项，Done 项保留历史 Sprint。删除 Planned Sprint 时同事务将事项退回 Backlog并记录变更。
- BoardColumnStatus 限制状态在项目 Board 中只有一个映射，Column 与 Status 必须同项目。被事项使用的状态禁止删除，未使用状态删除与映射更新为一个事务。

## 7. 历史记录与未来 Agent 接口

所有业务变更与 Activity 写入同一数据库事务。Activity 包含 workspaceId、projectId、issueId（项目/Sprint事件可为空）、actorId、actorNameSnapshot、source、type、schemaVersion、requestId、issueVersion、occurredAt 和结构化 payload。常用字段记录 before/after 的 ID 与显示名称快照，历史不依赖后续实体名称。

描述保存生成不可变 DescriptionRevision：issueId、version、markdown、actorId、createdAt；Activity 引用 revision ID，不将长描述复制到普通活动列表。支持分页查询和读取历史版本，本期不做一键恢复。排序事件记录移动前后状态与位置，不将局部排序归一化产生的技术更新刷屏为用户操作。

评论编辑/删除保留对应操作历史和内容修订信息；删除评论在当前列表显示已删除标记。Actor 停用保留历史归属。Activity API 没有供普通客户端修改/删除历史记录的入口。

Service 接收统一 ActorContext（actorId、workspaceId、来源、requestId），从认证上下文生成，不能相信请求体提供的 actorId。写入 API 使用 version，并为创建和命令支持 Idempotency-Key：按主体、路由、键去重，绑定请求摘要，不同内容复用键返回冲突。

未来 Agent 可以通过增加独立凭据和授权 Guard 调用同一套 Issue/Board/Sprint Service。当前提供清晰 HTTP JSON DTO 和 OpenAPI 契约；不实现 Agent Token 管理、自动领取、执行调度、MCP Server、自动建 PR 或自动合并。

## 8. 并发、查询和安全

Board Move 校验版本、目标状态映射与排序范围，并在事务中锁定涉及的排序域。服务端支持相邻 Issue ID 定位并重新计算位置，避免相信客户端任意排序值。间距不足时只归一化邻近窗口，窗口无法提供空间时有受控扩大策略；受影响行 version 同步更新。返回最新 Issue；版本冲突使用 HTTP 409。

字段更新同样携带 version，使用条件更新，只有实际变化才递增版本、追加历史。事务失败不留下活动。搜索遵循项目权限，按编号、标题、描述检索；通用筛选同字段 OR、跨字段 AND，活动与事项列表分页。

登录采用密码哈希、HttpOnly Cookie 会话，写请求检查来源/CSRF，登录限速，所有业务查询校验 Workspace/Project 访问权限。Viewer 只读；Workspace Admin 管理项目和成员；Project Member 编辑事项与 Sprint。不给前端暴露其他项目的数据。

Deeplink 由 NestJS 返回动态 HTML Shell，复用访问权限。已认证且有权限时只查询轻量 metadata；匿名或无权访问时返回通用标题，不泄露私有标题/描述。HTML 属性正确转义，页面不重定向，SPA 接管后按需登录或展示详情。

## 9. 交付与验收

提供 PostgreSQL migration、幂等演示 seed、`.env.example`、README、Dockerfile 与 compose。生产一份 App 容器承载 React 构建产物和 NestJS，另有 PostgreSQL。开发 `pnpm dev` 统一检查/启动数据库并启动前后端；首次需要 Docker 可用及安装依赖。

验证覆盖：

1. 单元测试：层级关系、类型变更、Sprint 继承、状态映射、排序精度、实际落点、命令权限与生命周期。
2. PostgreSQL 集成测试：迁移、并发编号、版本冲突、历史原子性、幂等重试、跨项目隔离、同时开始 Sprint、完成 Sprint 与事项迁移竞争。
3. 浏览器 E2E：创建项目/Epic/Story、分配 Sprint、启动 Sprint、各类拖拽、空区落点、失败恢复、字段编辑、筛选、刷新和深链。
4. 编辑器测试：中文输入法交互检查、嵌套列表/清单/代码块/链接的 load→edit→save→reload、粘贴、撤销重做、草稿保留、冲突恢复。自动化无法证明真实 IME 时明确列出人工验证项。
5. 1440px 实际截图与键盘操作检查；使用 500 条事项验证渲染与拖拽，记录测试环境与测量结果，不在未测量时宣称性能达标。

实施完成以类型检查、lint、测试、迁移及实际浏览器验证结果为依据；外部依赖受限时明确报告尚未验证的内容。
