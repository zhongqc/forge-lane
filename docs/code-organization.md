# 代码组织与模块边界

## 总体判断

保留现有 monorepo：`apps/web` 是界面，`apps/server` 是 API，`packages/db` 管理 Prisma 模型和迁移，`packages/shared` 管理传输类型与纯业务规则，`packages/cli` 是独立命令行客户端。生成的 Prisma 文件不作为手写代码拆分对象。

本轮整理集中在已出现重复和职责混杂的地方，没有修改数据库、API 路径、数据协议或工作流规则。

## 前端

- `features/issues/IssueDrawer.tsx` 负责事项详情、字段修改、查询及导航；`IssueComments.tsx` 管理评论发布、编辑和会话草稿；`IssueActivity.tsx` 展示活动及字段变更。
- `features/board/BoardPage.tsx` 负责筛选、拖拽过程和服务端写入；`BoardCard.tsx` 展示卡片与拖动入口；`BoardColumn.tsx` 展示列及目标状态区域；`board-dnd.ts` 提供碰撞检测和键盘定位规则。
- `components/MarkdownView.tsx` 统一只读 Markdown 和提及标签渲染，描述、版本、评论、执行结果复用同一实现。该组件不导入 MDXEditor；编辑器继续按需加载。
- `features/editor` 管理富文本输入、描述保存及冲突处理；`features/mentions` 保留成员查询、候选列表、键盘处理和富文本提及插件。已删除无调用方的旧 `MentionTextarea`。
- 评论草稿仍在页面会话内保存，以用户和事项为键。本轮不改变持久化策略。

## 样式

`styles/globals.css` 只声明导入顺序。基础布局、看板、事项详情、反馈组件、规划列表、设置、登录、响应式规则，以及 GitHub、通知、Sprint 和编辑器样式分别存放。

拆分时逐段保留原始 CSS 顺序，并比较合并后的内容与原文件（只去掉旧文本框专用规则）。`workspace-interactions.css` 保留已有跨组件交互覆盖，避免拆分时改变优先级。新样式优先放入所属功能文件；跨功能和断点覆盖集中维护，避免继续在入口追加补丁。

## 后端

- `AuthModule` 和 `DatabaseModule` 是全局基础设施。
- `CommandModule` 导出唯一注册的 `CommandService`，负责事务、工作区写入串行化和幂等。
- `ActivityModule` 导出历史记录仓储，各写入模块通过显式 imports 使用它。
- `IssueModule` 只负责事项与评论，导出 `IssueService` / `IssueRepository`；不再依赖全局模块隐式暴露服务。
- `ExecutionModule` 独立注册本地 CLI / agent 的执行接口，与事项详情接口分开。
- Board、Sprint 显式导入 IssueModule；Project、GitHub、Execution 按实际需要导入 CommandModule 和 ActivityModule。GitHub 不再重复注册这些服务。
- Notification 继续负责收件箱、提及同步与通知投递。GitHub webhook 和通知 worker 的租约、重试逻辑保持原样。

新增写操作沿用 CommandService，在同一事务中更新实体、版本和历史；外部网络投递留在 worker 中。不要为了文件长度把同一事务拆成独立提交，也不引入统一的通用 CRUD 仓储来掩盖不同业务规则。

## 工程约束

移除了看板文件对 `react/refs` 的整文件禁用：对 dnd-kit hook 直接解构所需返回值后，原有交互可在完整规则下通过检查。

本轮使用既有单元、数据库集成和浏览器交互测试验证行为。对于纯组件搬迁，不新增只检查文件结构或重复实现的测试。
