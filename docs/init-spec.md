# Engineering Board MVP Spec v0.3

## 1. Product Goal

实现一个面向软件研发团队的轻量项目管理系统。

核心目标：

* 比多维表格更适合软件研发流程
* 比 Jira 更简单、更有约束
* Board 是系统最核心的交互界面
* Workflow 和 Board 展示解耦
* 支持 Backlog、Sprint、Epic、Story、Task、Bug、Subtask
* 支持 GitHub PR / Commit 与 Issue 关联
* 支持 Issue Deeplink 和分享预览
* 默认提供合理研发流程，避免过度配置
* 支持未来接入 Coding Agent，但 MVP 不实现 Agent 自动开发

系统不追求成为 Jira / Notion / 飞书项目的完整替代品。

---

# 2. Core Principles

## 2.1 Opinionated over configurable

默认研发流程应当开箱即用。

不要为了“通用性”增加复杂配置。

默认 Issue Type：

```text
Epic
Story
Task
Bug
Subtask
```

语义：

```text
Epic
较大的长期业务目标、功能或工作集合。
通常跨多个 Sprint，本身不直接进入 Sprint。

Story
能够独立表达用户价值的需求。

Task
普通执行工作或技术工作，不要求直接表达用户价值。

Bug
已有行为与预期不一致的问题。

Subtask
Story / Task / Bug 的执行步骤。
```

默认 Workflow：

```text
Todo
Ready
In Progress
Code Review
Ready for Test
Testing
Ready for Release
Done
```

允许有限配置，但不实现 Jira 式任意 Workflow Designer。

---

# 3. Workflow != Board

Workflow Status 与 Board Column 必须解耦。

默认：

```text
TODO
├─ Todo
└─ Ready

DEVELOPING
├─ In Progress
└─ Code Review

TESTING
├─ Ready for Test
├─ Testing
└─ Ready for Release

DONE
└─ Done
```

Column 是横向流程分组。

Status 是 Column 内部的具体状态。

一个 Column 可以映射多个 Status。

---

# 4. Multi-Status Column

当一个 Column 映射多个 Status 时，必须在 Column 内按垂直方向展示独立 Status Section：

```text
DEVELOPING
┌─────────────────────────────┐
│ In Progress                 │
│                             │
│ APP-101                     │
│ APP-102                     │
│                             │
├─────────────────────────────┤
│ Code Review                 │
│                             │
│ APP-103                     │
│ APP-104                     │
│                             │
└─────────────────────────────┘
```

每个 Status Section：

* 有独立标题
* 有明确视觉边界
* 是独立 Drop Zone
* 独立维护 Issue 排序
* 拖拽时必须提供明确 Drop Indicator

禁止将多个 Status 的 Card 混在一个无边界列表中。

---

# 5. Scope

MVP 包含：

1. Authentication
2. Workspace
3. Project
4. Issue
5. Epic
6. Backlog
7. Sprint
8. Workflow / Status
9. Board
10. Drag & Drop
11. Markdown Description
12. Comment
13. Search / Filter
14. Basic Activity History
15. GitHub Integration
16. Issue Deeplink / Share Preview

---

# 6. Explicit Non-Goals

MVP 不实现：

* Wiki
* 独立文档系统
* OKR
* CRM
* 财务管理
* Timesheet
* 工时系统
* Gantt
* Roadmap
* Portfolio Management
* 复杂权限系统
* LDAP
* 企业 SSO
* Approval Workflow
* 自定义脚本
* Jira JQL 完整替代
* Plugin System
* Marketplace
* Mobile App
* IM / Chat
* Video Call
* Calendar
* AI 自动拆需求
* AI 自动编程
* Agent 自动领取任务
* 多租户计费
* 企业审计
* 微服务
* CQRS
* Event Sourcing
* 完整 DDD 分层
* SSR Web Application

禁止因为“未来可能需要”提前实现这些功能。

---

# 7. User Model

MVP 三种角色：

## Workspace Admin

可以：

* 创建 / 删除 Project
* 管理 Workspace Member
* 修改 Workflow
* 修改 Board 配置

## Project Member

可以：

* 创建 / 编辑 Issue
* 修改状态
* 修改负责人
* 管理 Sprint
* 评论
* 操作 Board

## Viewer

只读。

不实现：

* 字段级权限
* Issue 级权限
* 复杂权限继承

---

# 8. Workspace

```text
Workspace
- id
- name
- slug
- createdAt
- updatedAt
```

Workspace 包含：

* Members
* Projects

MVP 可以默认只有一个 Workspace。

数据库仍保留 `workspaceId`。

---

# 9. Project

```text
Project
- id
- workspaceId
- key
- name
- description
- createdAt
- updatedAt
```

例如：

```text
Project Name: Mobile App
Project Key: APP
```

Issue Key：

```text
APP-1
APP-2
APP-3
```

Project Key 创建后默认不可修改。

---

# 10. Issue Model

## 10.1 Issue Types

```text
Epic
Story
Task
Bug
Subtask
```

MVP 不支持创建自定义 Issue Type。

---

## 10.2 Issue Fields

```text
Issue
- id
- projectId
- number
- type

- title
- description

- statusId
- priority

- assigneeId
- reporterId

- epicId
- parentId

- sprintId
- estimate
- sortOrder

- createdAt
- updatedAt
```

语义：

```text
epicId
Story / Task / Bug 所属 Epic。

parentId
仅用于 Subtask，指向 Story / Task / Bug。

sprintId
Story / Task / Bug 所属 Sprint。
```

---

# 11. Issue Hierarchy

固定为：

```text
Epic
├─ Story
├─ Task
└─ Bug

Story
└─ Subtask

Task
└─ Subtask

Bug
└─ Subtask
```

规则：

* Epic 不能拥有 parent
* Epic 不能直接进入 Sprint
* Story / Task / Bug 最多属于一个 Epic
* Story / Task / Bug 可以不属于 Epic
* Subtask 必须有 parent
* Subtask parent 只能为 Story / Task / Bug
* Subtask 不能拥有 Subtask
* Subtask 不拥有独立 Sprint
* Subtask Sprint 跟随 parent
* 不允许任意层级嵌套

禁止：

```text
Epic → Epic

Story → Story

Task → Task

Bug → Bug

Subtask → Subtask
```

---

# 12. Priority

固定：

```text
Urgent
High
Medium
Low
None
```

---

# 13. Estimate

默认使用 Story Point。

例如：

```text
1
2
3
5
8
13
```

数据库不强制 Fibonacci。

规则：

* Story 可设置 Estimate
* Task 可设置 Estimate
* Bug 可设置 Estimate
* Epic 不直接设置 Story Point
* Subtask 默认不计独立 Story Point

Epic 工作量通过 Child Issue 汇总。

---

# 14. Epic

Epic 是长期工作容器。

Epic 本身：

* 可以跨 Sprint
* 不直接进入 Sprint
* 默认不作为 Sprint Board Card 展示
* 不直接参与 Sprint Capacity
* 通过 Child Issue 汇总进度

Epic Detail：

```text
Title
Description
Status
Owner
Priority

Progress
Child Issues
Completed Story Points
Total Story Points
```

第一版 Progress：

```text
Done Child Issues / Total Child Issues
```

如果存在 Estimate：

```text
Completed Story Points / Total Story Points
```

MVP 不实现 Epic Roadmap。

---

# 15. Issue Detail

点击 Board Card 后：

优先使用 Drawer / Side Panel。

不要默认整页跳转。

Issue Detail：

## Main

* Title
* Description
* Type
* Status
* Assignee
* Priority
* Sprint
* Epic
* Estimate

Subtask：

* 显示 Parent Issue

Epic：

* 不显示 Sprint

## Secondary

* Labels
* Reporter
* Created At
* Updated At

## Activity

* Comments
* Status Changes
* Assignee Changes
* Sprint Changes
* Epic Changes
* GitHub Events

---

# 16. Markdown Description Editor

Description 的持久化格式固定为：

```text
Markdown string
```

不要使用：

```text
HTML as source of truth
Rich Text JSON as source of truth
```

## 16.1 Editor

指定使用：

```text
MDXEditor
```

目标：

```text
Rich Editing Experience
+
Markdown Persistence
```

用户不应该被迫直接编辑裸 Markdown。

---

## 16.2 Required Features

必须支持：

* Heading
* Bold
* Italic
* Strikethrough
* Inline Code
* Bullet List
* Ordered List
* Checklist
* Quote
* Code Block
* Link
* Markdown Shortcut
* Slash Command
* Paste Markdown
* Undo / Redo

---

## 16.3 Optional P1

后续可以支持：

* Image Paste
* Image Upload
* Markdown Source Mode

---

## 16.4 Disabled by Default

MVP 不启用：

* Table
* LaTeX
* AI Editor
* Font Selection
* Text Color
* Complex Rich Text Layout

---

## 16.5 Editing UX

默认状态显示 Rendered Markdown。

用户点击 Description 后进入编辑状态：

```text
Rendered Description
        ↓ click
MDXEditor
```

保存可以使用：

```text
Blur
or
Cmd / Ctrl + Enter
```

不要让大型编辑框永久占据 Issue Drawer。

---

## 16.6 Editor Acceptance Tests

必须验证：

```text
load
→ edit
→ save
→ reload
```

Markdown Round Trip 不应产生明显内容损坏。

重点测试：

* 中文 IME
* Nested List
* Checklist
* Code Block
* Link
* Paste Code
* Paste Markdown
* Undo / Redo

MDXEditor 按标准 Markdown 配置，不启用任意 JSX / MDX 组件；持久化内容仍为 Markdown 字符串。

不要自己基于 Lexical / ProseMirror 从零实现编辑器。

---

# 17. Comments

```text
Comment
- id
- issueId
- userId
- content
- createdAt
- updatedAt
```

支持：

* 新增
* 编辑自己的评论
* 删除自己的评论

MVP 不实现：

* Thread
* Reaction
* Rich Text Comment
* Attachment Comment

Comment 可以直接使用 Markdown textarea。

不需要复用完整 Description Editor。

---

# 18. Workflow

```text
Status
- id
- projectId
- name
- category
- sortOrder
```

Status Category 固定：

```text
TODO
IN_PROGRESS
DONE
```

默认：

```text
Todo              → TODO
Ready             → TODO

In Progress       → IN_PROGRESS
Code Review       → IN_PROGRESS
Ready for Test    → IN_PROGRESS
Testing           → IN_PROGRESS
Ready for Release → IN_PROGRESS

Done              → DONE
```

管理员可以：

* 新增 Status
* 重命名 Status
* 排序
* 删除未使用 Status

MVP 不实现复杂 Transition Graph。

原则上任意 Status 可以切换到其他 Status。

---

# 19. Board

Board 是产品最高优先级模块。

默认 Board 展示：

```text
Story
Task
Bug
```

Epic 默认不作为 Card 展示。

Subtask 默认不作为顶层 Card 展示。

Subtask 在 Parent Issue Detail 中管理。

Board 需要优先保证：

* 快
* 信息密度合理
* Drag 顺滑
* Drop 位置可预测
* Optimistic UI
* 少 Layout Shift
* Status Section 视觉明确

---

# 20. Board Columns

```text
BoardColumn
- id
- projectId
- name
- sortOrder
```

```text
BoardColumnStatus
- boardColumnId
- statusId
- sortOrder
```

默认：

```text
TODO
├─ Todo
└─ Ready

DEVELOPING
├─ In Progress
└─ Code Review

TESTING
├─ Ready for Test
├─ Testing
└─ Ready for Release

DONE
└─ Done
```

---

# 21. Drag & Drop

使用成熟 DnD Library。

默认：

```text
dnd-kit
```

不要自己实现 Pointer Event Drag Engine。

---

## 21.1 DnD Model

每个 Status Section 都是独立 Droppable。

```text
Column
├─ StatusSection(Todo)
│  ├─ Card
│  ├─ Card
│  └─ DropZone
│
└─ StatusSection(Ready)
   ├─ Card
   ├─ Card
   └─ DropZone
```

不要将整个 Column 作为唯一 Drop Target。

---

## 21.2 Required Operations

支持：

### Same Status

```text
Todo

A
B
C

A ↕ B ↕ C
```

只修改：

```text
sortOrder
```

---

### Same Column, Different Status

```text
TODO
├─ Todo
└─ Ready
```

例如：

```text
Todo → Ready
```

修改：

```text
statusId
sortOrder
```

---

### Different Column

例如：

```text
In Progress
    ↓
Testing
```

根据鼠标实际落入的 Status Section 确定：

```text
targetStatusId
```

不能默认目标 Column 第一个 Status。

---

### Empty Status

空 Status 必须依然可以 Drop：

```text
Code Review
┌───────────────────────┐
│                       │
│      Drop here        │
│                       │
└───────────────────────┘
```

必须存在稳定的空 Drop Zone。

---

## 21.3 Move Command

统一抽象：

```text
MoveIssue
- issueId
- targetColumnId
- targetStatusId
- targetSortOrder
- version
```

---

## 21.4 Drag Lifecycle

推荐：

```text
onDragStart
↓
onDragOver
↓
只修改本地 projected state
↓
onDragEnd
↓
一次提交 Server
```

禁止：

```text
每经过一个 Status
→ 调 API
```

---

# 22. Ordering

Issue 排序不要依赖连续整数：

```text
1
2
3
4
```

MVP 使用 Numeric Fractional Ordering。

例如：

```text
1000
2000
3000
```

插入：

```text
1500
2500
```

基本逻辑：

```text
newSortOrder =
(previousSortOrder + nextSortOrder) / 2
```

如果间隔过小：

执行局部 normalize。

不要因为一次 Drag 批量更新整列 Issue。

---

# 23. Optimistic Board Update

Board DnD 必须使用 Optimistic Update。

流程：

```text
Drop
↓
UI 立即移动
↓
更新 TanStack Query Cache
↓
调用 Board Move API
↓
成功 → 保留
失败 → Rollback + Error
```

DnD Library 只负责 Interaction。

业务数据状态由 TanStack Query 管理。

禁止将业务数据长期存放在 DnD Library 内部状态中。

---

# 24. Board Card

推荐：

```text
APP-123
Fix video cache issue

Bug · High
OTA Upgrade
👤 Qichao
5 SP
```

显示：

* Issue Key
* Title
* Type
* Priority
* Epic
* Assignee
* Estimate

Epic 信息保持低视觉权重。

Card 高度尽量稳定。

不要堆过多字段。

---

# 25. Swimlane

P1 支持：

```text
None
Epic
Assignee
```

默认：

```text
None
```

Epic Swimlane 示例：

```text
                    TODO      DEVELOPING      TESTING      DONE

OTA Upgrade
                    APP-10    APP-11          APP-12

BLE Stability
                    APP-20    APP-21                       APP-22

No Epic
                    APP-30
```

Swimlane 是横向分组。

Column 仍表示流程阶段。

即使启用 Swimlane：

仍然保留 Column 内的 Status Section 模型。

不实现自定义表达式 Swimlane。

---

# 26. Quick Filter

内置：

```text
My Issues
Stories
Tasks
Bugs
Unassigned
High Priority
No Estimate
```

Filter 可以组合。

例如：

```text
My Issues + Bugs
```

---

# 27. General Filter

支持：

```text
Assignee
Status
Type
Priority
Sprint
Epic
Label
```

支持多值。

例如：

```text
Assignee = A OR B

Type = Story OR Bug

Status != Done

Epic = OTA Upgrade
```

MVP 不实现完整查询 DSL。

---

# 28. Search

搜索：

* Issue Key
* Title
* Description

第一版使用 PostgreSQL：

```text
ILIKE
```

需要时再升级 PostgreSQL Full Text Search。

不要引入 Elasticsearch。

---

# 29. Backlog

Backlog 包含：

```text
Active Sprint

Future Sprints

Backlog
```

主要管理：

```text
Story
Task
Bug
```

Epic：

不直接进入 Sprint Backlog。

Epic 可以：

* Filter
* Group

Subtask：

不作为独立 Sprint Planning Unit。

支持：

* 创建 Story
* 创建 Task
* 创建 Bug
* 排序
* Assign Epic
* Drag → Sprint
* Drag → Backlog
* 创建 Sprint
* 删除 Planned Sprint
* Start Sprint

---

# 30. Sprint

```text
Sprint
- id
- projectId
- name
- goal
- status
- startAt
- endAt
- createdAt
```

Status：

```text
PLANNED
ACTIVE
COMPLETED
```

规则：

一个 Project 同时最多一个 ACTIVE Sprint。

可以加入 Sprint：

```text
Story
Task
Bug
```

不能加入：

```text
Epic
Subtask directly
```

Subtask Sprint：

```text
Parent.sprintId
```

---

# 31. Sprint Commands

不要使用万能：

```text
PATCH /sprints/:id
```

承担所有业务动作。

显式定义：

```text
POST /api/sprints/:id/start

POST /api/sprints/:id/complete

POST /api/sprints/:id/issues

DELETE /api/sprints/:id/issues/:issueId
```

业务入口：

```text
SprintService.start()

SprintService.complete()

SprintService.addIssue()

SprintService.removeIssue()
```

---

# 32. Complete Sprint

Done Issue：

继续属于已完成 Sprint。

未完成 Issue：

用户选择：

```text
Move to Backlog
```

或：

```text
Move to Next Sprint
```

其 Subtask 自动跟随 Parent。

Epic 不受 Complete Sprint 影响。

---

# 33. Labels

```text
Label
- id
- projectId
- name
```

Issue 可以有多个 Label。

MVP 不实现：

* Label Permission
* Label Group
* Global Label

---

# 34. Activity History

```text
Activity
- id
- issueId
- userId
- type
- payload
- createdAt
```

记录：

* Created
* Status Changed
* Assignee Changed
* Sprint Changed
* Epic Changed
* Priority Changed
* Comment Added
* GitHub PR Linked
* GitHub Commit Linked

不需要记录所有字段 Diff。

---

# 35. GitHub Integration

MVP 只支持 GitHub。

不支持：

* GitLab
* Bitbucket
* Gitee

Project 可以关联多个 Repository。

---

# 36. GitHub Issue Reference

识别：

```text
APP-123
```

Commit：

```text
APP-123 fix video cache
```

Branch：

```text
feature/APP-123-video-cache
```

PR：

```text
APP-123 Fix video cache
```

均可以关联 Issue。

Story / Task / Bug / Subtask：

可以关联 Git Development Activity。

Epic：

默认不直接关联 Branch / PR。

---

# 37. Pull Request Integration

Issue Detail：

```text
Development

PR #123
Fix video cache
OPEN

Branch:
feature/APP-123-video-cache
```

PR Status：

```text
OPEN
MERGED
CLOSED
```

点击跳转 GitHub。

---

# 38. GitHub Automation

第一版保持保守。

例如：

```text
PR Opened

Todo / Ready
→
Code Review
```

具体自动规则可配置，但默认不要过多自动改变状态。

PR Merge：

默认不要直接：

```text
→ Done
```

Epic 状态不由 GitHub Event 自动改变。

---

# 39. Authentication

MVP：

```text
Email + Password
```

以及：

```text
GitHub OAuth
```

Google OAuth：

P1 可选。

---

# 40. Deeplink

正常 Issue URL：

```text
/issues/APP-123
```

Epic：

```text
/issues/APP-1
```

Project：

```text
/projects/APP
```

用户分享的就是正常业务 URL。

禁止设计：

```text
/share/issues/APP-123
```

这种额外分享 URL。

---

# 41. Deeplink Architecture

MVP 不做完整 SSR。

使用：

> Dynamic HTML Shell + SPA

正常浏览器访问：

```text
GET /issues/APP-123
        ↓
NestJS
        ↓
查询少量 Issue Metadata
        ↓
动态生成 SPA HTML Shell
        ↓
填充 <head>
        ↓
返回同一个 React SPA
        ↓
React Router 启动
        ↓
TanStack Query 加载完整 Issue
```

URL 不发生 Redirect。

---

# 42. Dynamic HTML Metadata

例如：

```html
<title>APP-123 · BLE reconnect issue</title>

<meta
  property="og:title"
  content="APP-123 · BLE reconnect issue"
/>

<meta
  property="og:description"
  content="BLE reconnect fails after device sleep"
/>

<meta
  property="og:type"
  content="website"
/>
```

可以追加常见分享 Metadata：

```text
og:title
og:description
og:type
og:url
```

如未来需要：

再补充其他平台 Metadata。

---

# 43. Deeplink Metadata Query

Dynamic HTML Shell 不加载完整 Issue。

只读取：

```text
key
title
description summary
type
project
```

可以设计：

```text
IssuePreviewService.getMetadata(issueKey)
```

不要加载：

* Comments
* Activities
* Child Issues
* Attachments
* PR Detail

分享预览必须保持查询轻量。

---

# 44. SPA Fallback

普通 Route 首次访问：

```text
/board
/backlog
/issues
/settings
```

返回标准 SPA Shell。

Deeplink：

```text
/issues/:issueKey
```

返回动态 Metadata SPA Shell。

所有 Client Navigation：

仍然使用 React Router。

不进行 SSR Navigation。

---

# 45. Frontend Architecture

固定：

```text
React
TypeScript
Vite
React Router
TanStack Query
```

保持 SPA。

不使用 React Router Framework Mode 作为 MVP 必需能力。

如果未来真的出现需要完整 SSR 的页面，再重新评估。

---

# 46. Frontend State

Server State：

```text
TanStack Query
```

Local UI State：

```text
React State
```

除非出现明确跨页面客户端状态需求：

禁止默认引入：

```text
Redux
Zustand
MobX
```

---

# 47. Styling

推荐：

```text
CSS
CSS Modules

CSS Variables
CSS Nesting
CSS Grid
Flexbox
Container Queries
Cascade Layers
Logical Properties
:has()
```

优先使用现代原生 CSS。

不默认引入：

```text
Tailwind
Sass
CSS-in-JS
```

---

## 47.1 CSS Rules

* 原生 CSS Nesting 优先
* Nesting 建议不超过 2～3 层
* 避免复杂 `&` Selector
* 控制 Specificity
* Component Root Class 稳定
* Token 放全局文件
* 可复用 Utility 单独维护
* 不为了 Nesting 引入 Sass

推荐：

```text
styles/
├─ tokens.css
├─ reset.css
├─ globals.css
└─ utilities.css
```

---

# 48. Component Strategy

可以使用成熟 Headless / Primitive：

```text
Radix UI
Base UI
```

不要自己实现：

* Dialog
* Popover
* Tooltip
* Dropdown
* Select
* Focus Trap
* Accessibility Primitive

业务组件自行实现。

---

# 49. Backend Technology

Backend 固定使用：

```text
NestJS
TypeScript
PostgreSQL
```

NestJS 的目的：

不是引入企业级复杂架构。

而是利用：

* Module
* DTO
* Pipe
* Guard
* Provider / Service
* Dependency Injection
* Clear Business Boundary

约束 Agent 和代码结构。

---

# 50. NestJS Module Boundaries

按业务拆 Module：

```text
modules/
├─ auth/
├─ workspace/
├─ project/
├─ issue/
├─ sprint/
├─ board/
├─ github/
└─ activity/
```

不要按：

```text
controllers/
services/
repositories/
```

全局横向堆积。

推荐：

```text
issue/
├─ dto/
├─ domain/
│  └─ issue.policy.ts
├─ issue.controller.ts
├─ issue.service.ts
├─ issue.repository.ts
└─ issue.module.ts
```

---

# 51. NestJS Is Not DDD

禁止因为使用 NestJS 而自动引入：

```text
domain/
application/
infrastructure/
presentation/

command/
handler/
use-case/
aggregate/
factory/
mapper/
repository interface/
repository implementation/
```

除非出现明确实际需求。

默认结构：

```text
Controller
↓
Service
↓
Policy
↓
Repository
↓
PostgreSQL
```

保持简单。

---

# 52. Controller Rules

Controller 只负责：

* Route
* Auth Context
* DTO
* 调用 Service
* Response Mapping

Controller 禁止：

* 直接访问数据库
* 编写业务规则
* 管理事务
* 计算 Board 排序
* 判断 Issue Hierarchy
* 判断 Sprint Domain Rule

Controller 必须保持薄。

---

# 53. DTO / Validation

API 输入使用 DTO。

全局启用类似：

```text
whitelist = true

forbidNonWhitelisted = true

transform = true
```

DTO 负责：

```text
输入结构
字段类型
格式验证
```

DTO 不负责 Domain Rule。

例如：

```text
Epic cannot enter Sprint
```

不能只放在 DTO Validator 中。

---

# 54. Guards

Guard 只负责：

```text
Who can perform the action?
```

例如：

* Authentication
* Workspace Membership
* Workspace Admin
* Project Membership

Guard 不负责：

```text
Is this domain operation valid?
```

例如：

```text
Epic 是否可以进入 Sprint
```

属于 Domain Rule，不属于 Guard。

---

# 55. Domain Policy

业务约束集中处理。

推荐：

```text
IssuePolicy
SprintPolicy
BoardPolicy
```

例如：

```text
IssuePolicy.assertCanCreate()

IssuePolicy.assertCanAssignEpic()

IssuePolicy.assertCanChangeParent()

SprintPolicy.assertCanAddIssue()

BoardPolicy.assertCanMoveIssue()
```

禁止 Controller / Service 多处复制相同业务判断。

---

# 56. Repository

Repository 负责：

* Query
* Insert
* Update
* Delete

Repository 不负责业务决策。

例如：

Repository 不应该判断：

```text
Epic 是否允许进入 Sprint
```

Service / Policy 负责 Domain Rule。

---

# 57. Transactions

以下操作应使用数据库 Transaction：

* Board Move
* Complete Sprint
* Move Parent Issue between Sprints
* Delete Status with relationship update
* GitHub Event + Activity Update

不要过度使用 Transaction。

普通单行更新不需要人为制造复杂事务。

---

# 58. Board Command

Board Move 不使用万能 Issue Patch 作为主入口。

推荐：

```text
POST /api/projects/:projectId/board/moves
```

Request：

```text
issueId
targetColumnId
targetStatusId
targetSortOrder
version
```

内部：

```text
BoardController
↓
BoardService.moveIssue()
↓
BoardPolicy
↓
Transaction
↓
IssueRepository
ActivityRepository
```

---

# 59. API

使用 HTTP JSON API。

统一：

```text
/api/*
```

例如：

```text
GET    /api/projects
POST   /api/projects

GET    /api/projects/:id/issues
POST   /api/projects/:id/issues

GET    /api/issues/:id
PATCH  /api/issues/:id

GET    /api/projects/:id/epics

GET    /api/projects/:id/board
POST   /api/projects/:id/board/moves

GET    /api/projects/:id/sprints

POST   /api/sprints
POST   /api/sprints/:id/start
POST   /api/sprints/:id/complete

POST   /api/github/webhook
```

不使用 GraphQL。

---

# 60. Database

固定：

```text
PostgreSQL
```

ORM：

```text
Drizzle
or
Prisma
```

Migration 必须进入 Git。

不要引入：

* MongoDB
* Elasticsearch
* Redis 强依赖
* Kafka
* Event Store

---

# 61. Concurrency

Issue 使用：

```text
updatedAt
```

或者明确：

```text
version
```

实现简单 Optimistic Concurrency Control。

冲突提示：

```text
This issue was updated by another user.
Reload latest version?
```

Board Move Request 必须携带版本信息。

MVP 不实现 CRDT。

---

# 62. Realtime

MVP 不强制 WebSocket。

优先：

```text
window focus refetch
```

以及适度：

```text
polling
```

如果实现成本很低：

可以使用 SSE。

不要构建复杂 Realtime Collaboration Infrastructure。

---

# 63. UI Structure

```text
Workspace

Projects
└─ Project
   ├─ Board
   ├─ Backlog
   ├─ Issues
   ├─ Epics
   └─ Settings
```

不要做大量 Dashboard 页面。

Board 默认作为 Project 核心页面。

---

# 64. Issue List

表格字段：

```text
Key
Title
Type
Epic
Status
Priority
Assignee
Sprint
Updated
```

支持：

* Sort
* Filter
* Search

MVP 不允许用户任意配置 Table Column。

---

# 65. Performance

普通 API：

目标：

```text
< 500ms
```

Board：

至少：

```text
500 Issues
```

仍能正常操作。

第一版不提前引入 Virtualization。

如果真实性能出现问题，再加入。

DnD 必须避免：

* 明显 Layout Shift
* Card Size 抖动
* Status Section Collapse
* Drop Position Jump

---

# 66. Monorepo

推荐：

```text
apps/
├─ web/
└─ server/

packages/
├─ db/
└─ shared/
```

其中：

```text
web
React SPA

server
NestJS
```

不要为了 Monorepo 强行拆出大量 package。

---

# 67. Production Build

Production 可以将 Web Build Artifact 作为静态资源交给 NestJS 或前置 Web Server。

需要保证 NestJS 能够处理：

```text
/issues/:issueKey
```

并输出动态 HTML Shell。

一种简单结构：

```text
Browser
   ↓
Reverse Proxy
   ↓
NestJS
   ├─ /api/*
   ├─ /issues/:key → Dynamic HTML Shell
   ├─ SPA Routes   → index.html
   └─ static assets
```

如果未来独立 CDN 托管静态资产：

Dynamic HTML Shell 仍可以引用 CDN Assets。

---

# 68. Deployment

必须支持：

```bash
docker compose up -d
```

至少：

```text
app
postgres
```

优先做到单 App Container：

```text
React Build
+
NestJS Runtime
```

减少 MVP 部署复杂度。

如果未来需要单独扩展：

再拆 Web Hosting。

---

# 69. Object Storage

MVP 没有 Attachment 时：

不要引入 Object Storage。

未来需要 Image Upload / Attachment：

开发：

```text
MinIO
```

生产：

```text
S3 Compatible Storage
```

---

# 70. Environment Variables

```text
DATABASE_URL
APP_URL

AUTH_SECRET

GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_WEBHOOK_SECRET
```

提供：

```text
.env.example
```

---

# 71. Development

必须：

```bash
pnpm install
pnpm dev
```

能够启动开发环境。

不要要求开发者手工启动大量基础服务。

---

# 72. Testing

## Unit Test

至少覆盖：

* Issue Hierarchy
* Epic Relationship
* Epic cannot enter Sprint
* Subtask Parent Rule
* Subtask Sprint Inheritance
* Workflow Status Mapping
* Sprint Lifecycle
* Board Move Logic
* Multi-Status Column Target Detection
* Fractional Ordering
* Status + SortOrder Update

---

## Integration Test

覆盖：

* Create Epic
* Create Story
* Create Task
* Create Bug
* Create Subtask
* Assign Issue to Epic
* Start Sprint
* Complete Sprint
* Reject Epic Sprint Assignment
* Parent Sprint Move
* Subtask Sprint Inheritance
* Board Move
* GitHub Webhook
* Dynamic Issue Metadata Query

---

## E2E

至少覆盖：

```text
Create Project
↓
Create Epic
↓
Create Story
↓
Assign Story to Epic
↓
Move Story to Sprint
↓
Start Sprint
↓
Open Board
↓
Drag Story to Code Review Status Section
↓
Verify Status
↓
Drag to Testing
↓
Complete Story
↓
Complete Sprint
↓
Verify Epic Progress
```

另一个 Deeplink E2E：

```text
GET /issues/APP-123
↓
HTML contains correct <title>
↓
HTML contains correct OG metadata
↓
React SPA loads
↓
Issue Detail opens correctly
```

---

# 73. Seed Data

Demo：

```text
Workspace:
Acme

Project:
Mobile App

Epic:
APP-1 OTA Upgrade

Issues:
APP-2 Story  User can upgrade device firmware
APP-3 Task   Implement firmware integrity check
APP-4 Bug    OTA fails when app enters background
APP-5 Story  Show OTA progress in app
```

关系：

```text
APP-1 OTA Upgrade
├─ APP-2 Story
├─ APP-3 Task
├─ APP-4 Bug
└─ APP-5 Story
```

Seed 必须包含：

* 多 Status Column
* 不同 Status Issue
* 不同 Epic
* 无 Epic Issue
* Empty Status Section

便于测试 Board。

---

# 74. MVP Priority

## P0

必须：

* NestJS Backend
* Login
* Workspace
* Project
* Epic
* Story
* Task
* Bug
* Subtask
* Issue Detail
* MDXEditor Description Editor
* Workflow
* Board
* Multi-Status Column
* DnD
* Optimistic Board Update
* Backlog
* Sprint
* Quick Filter
* Deeplink Dynamic HTML Shell

---

## P1

随后：

* Epic Progress
* Comment
* Activity
* Issue List
* Search
* Swimlane
* Labels
* Markdown Source Mode

---

## P2

后续：

* GitHub Integration
* PR / Commit Link
* OAuth Enhancement
* Image Upload
* Better Search

---

# 75. Future Agent Native

MVP 数据模型不得阻碍未来加入：

```text
Actor
├─ Human
└─ Agent
```

未来 Agent 可以：

```text
Take Task / Bug
↓
Create Branch
↓
Implement
↓
Open PR
↓
Wait for Review
↓
Fix Comments
↓
Merge
```

未来也可以：

```text
Epic
↓
Agent suggests Stories / Tasks
↓
Human confirms
↓
Backlog
```

但这些功能禁止提前进入 MVP。

---

# 76. Agent Implementation Rules

开发 Agent 必须遵守：

1. 不增加 Spec 未要求的大型功能。
2. 不为未来需求提前抽象。
3. 优先简单实现。
4. Backend 固定使用 NestJS。
5. NestJS 不等于 DDD / CQRS / Microservice。
6. Controller 必须保持薄。
7. DTO 负责输入验证，不负责 Domain Rule。
8. Guard 只负责 Authorization。
9. Domain Rule 集中在 Service / Policy。
10. Repository 不写业务规则。
11. 不引入微服务。
12. 不引入 Event Sourcing。
13. 不引入 CQRS。
14. 不默认引入 Redis。
15. 不引入 Elasticsearch。
16. 不默认引入 Redux / Zustand / MobX。
17. 不默认引入 Tailwind。
18. 不引入 Sass 仅为了 CSS Nesting。
19. Migration 必须进入 Git。
20. Board UX 优先级高于 Dashboard。
21. Board 一个 Column 映射多个 Status 时，必须显示垂直 Status Section。
22. 每个 Status Section 都必须是独立 Drop Zone。
23. 多 Status Column Drop 必须根据真实落点确定 Status。
24. 不得默认落入 Column 第一个 Status。
25. 空 Status Section 也必须允许 Drop。
26. `onDragOver` 不调用 Server。
27. `onDragEnd` 最多提交一次 Move Command。
28. Board 使用 Optimistic UI。
29. Board Ordering 使用 Fractional Ordering。
30. Epic 不允许进入 Sprint。
31. Story / Task / Bug 是主要 Sprint Unit。
32. Subtask Sprint 跟随 Parent。
33. Story 与 Task 语义保持独立。
34. Epic 是长期容器，不是“大号 Story”。
35. Description 持久化格式必须为 Markdown。
36. 不自己实现 Markdown Rich Text Engine。
37. 使用 MDXEditor，持久化标准 Markdown。
38. Deeplink 不使用 Redirect URL。
39. Deeplink 不要求完整 SSR。
40. 分享页面使用 Dynamic HTML Shell + SPA。
41. Dynamic HTML Shell 只读取轻量 Metadata。
42. 不因为 Deeplink 引入完整 SSR Framework。
43. 不擅自改变产品模型。
44. Spec 冲突时优先选择最简单、最符合研发团队真实使用场景的方案。

---

# 77. Definition of Done

每个功能必须：

* TypeScript 无错误
* Lint 通过
* Test 通过
* Migration 可执行
* 页面实际可操作
* 有 Loading State
* 有 Error State
* API Error 有用户反馈
* 无明显 Console Error
* Desktop 1440px 正常使用

Board 额外要求：

* Multi-Status Section 清晰
* 同 Status 排序正常
* 跨 Status 正常
* 跨 Column 正常
* Empty Status 可以 Drop
* `statusId` 正确
* `sortOrder` 正确
* Optimistic Update 正常
* Rollback 正常
* 无明显 Drag Layout Shift

Markdown Editor 额外要求：

* 中文 IME 正常
* Markdown Round Trip 正常
* Code Block 正常
* Checklist 正常
* Paste 正常
* Undo / Redo 正常

Deeplink 额外要求：

* 正常业务 URL 可直接打开
* 刷新不 404
* `<title>` 正确
* OG Metadata 正确
* 不发生 Redirect
* SPA 启动后正常接管页面

---

# 78. Product Success Criterion

第一阶段最重要的判断标准：

> 团队是否愿意每天打开 Board，并且没有明显想回 Jira / Plane / 多维表格。

如果 Board 不好用：

MVP 失败。

重点验证：

> 用户能否通过 Column + Status Section 直观理解当前流程状态，并准确完成拖拽。

同时验证：

> Epic / Story / Task / Bug 的语义是否自然，不需要培训就知道该创建哪一种。

Description Editor 必须达到：

> 写 Issue 时不会因为编辑器体验而想切到飞书 / Notion 再写。

Deeplink 必须达到：

> 用户复制正常 Issue URL 分享即可，不需要理解“分享链接”这种额外概念。

功能数量不是成功指标。
