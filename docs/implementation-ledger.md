# Implementation ledger

计划：[2026-09-21-engineering-board.md](superpowers/plans/2026-09-21-engineering-board.md)。执行方式：当前任务内直接实现；按技能要求做了一次独立代码评审，随后修复并回归。

| 任务               | 实施状态与证据                                                                    |
| ------------------ | --------------------------------------------------------------------------------- |
| 1 工程脚手架       | pnpm workspace；Oxlint type-aware、Oxfmt、TS、pre-commit、CI                      |
| 2 数据模型         | Prisma + PostgreSQL 16；UUID、Actor、复合项目约束、独立排序、修订表；空库迁移通过 |
| 3 身份与项目       | 随机会话摘要、角色、工作区切换、成员；安全集成测试通过                            |
| 4 Issue 命令       | 严格 DTO、层级校验、版本、统一命令队列；5 个单元测试与集成覆盖                    |
| 5 Sprint / Backlog | 独立排序、启动/完成/迁移、子任务继承；API 和浏览器覆盖                            |
| 6 Board API        | 状态映射校验、数字分数排序、局部归一化、幂等与同事务历史                          |
| 7 Board UI         | 四列多状态、筛选、精确拖拽、乐观更新；空区与 500 条回归                           |
| 8 详情与描述       | MDXEditor、搜索字段、草稿、冲突比较、版本；浏览器与人工操作                       |
| 9 配套页面         | Backlog / 列表 / Epic / 设置、工作流排序、成员与标签；不加分析图表                |
| 10 交付            | README、seed、Docker/Compose、HTML shell、自动测试；实际验收见 verification.md    |

## 实施裁决

- 初始目录无 Git 历史，在独立项目目录初始化 `feat/engineering-board`；未触碰 `.claude/` 用户配置。
- NestJS 使用显式 Inject，兼容 tsx；生产运行编译后的 ESM，Prisma generator 显式 `importFileExtension=js`。
- 使用本机已缓存且受支持的 PostgreSQL 16；功能不依赖 17。
- 工作区级 advisory transaction lock 统一串行化层级/排序/Sprint 决策；吞吐权衡写入 README。
- 用户指定 MDXEditor，用户追加 Oxlint：已同步设计、依赖与检查流程。
- 500 条拖拽暴露测量/投影循环：投影按实际移动事件更新，并去重相同投影。保持松手时单次命令；不在布局引发的 DragOver 回调里反复改树。
- 使用当前状态表 + 追加 Activity + 描述/评论修订，而非完整事件溯源；Actor/来源/幂等协议为后续 Agent 接入预留。
- 不需要 JWT secret：使用随机不透明 token 的 SHA-256 摘要；移除没有实际用途的 AUTH_SECRET 示例。
- 首次 Docker 拉取依赖超时；引入 BuildKit 缓存、较低下载并发和大包超时，补齐 OpenSSL 及 workspace manifest 后构建成功，没有绕过完整性或供应链检查。生产镜像 8 项 E2E 全部通过。

## 独立评审处理

已处理：描述保存和字段串行化、缓存跨账号、深链项目定位、团队加入与工作区切换、丢响应幂等、Backlog 规划顺序、未保存退出、关系名称历史快照、路由恢复、同字段 OR 筛选、描述修订/活动分页、只读角色、状态排序/成员移除、创建 Sprint 上下文、Slash、DnD 准确性。

验证细节、测量数据和未验证项均列于 [verification.md](verification.md)。原计划内的示例测试名/文件拆分按最终实现合并；真实 IME 和大规模并发未冒充通过。

最终证据：5 个单元、19 个数据库集成、8 个浏览器场景通过；本地与容器均完成构建/启动验证。新仓库没有基线分支或 remote，因此保留实现分支，不进行合并或推送。

### 2026-09-22 follow-up

按用户反馈改进看板拖动，并支持创建时填写 description。用固定布局和插入线替换悬停重排，共享 MDXEditor 编写组件，保留原有版本冲突处理。最终 3004 生产预览通过 13 项浏览器验收，详情见 `docs/verification.md`。

### 状态落区与全局创建

按用户追加需求，常态列内连续排序；跨列拖动展开所有状态落区，只选择目标状态。后端以 `rank` / `transition` 明确命令与审计含义，排序跨同列状态、仍以 Sprint 为范围。创建主入口移至全局顶栏，保留列/Sprint 上下文入口。此前整卡起拖、MDXEditor 创建描述及串行写入机制继续保留。工作在 `main` 上更新用户指定的 `zhongqc/forge-lane` 仓库；早期无 remote 的记录仅描述初次初始化。

### 2026-09-23 GitHub integration

用户授权实现 GitHub 关联、事件同步和自动化三项，选择 GitHub App，明确取消无 webhook 轮询。新增独立数据表、持久队列、保守自动化和 UI；部署管理员按项目授权 installation ID。完成独立代码评审及针对性修复，37 项集成、5 项单元、18 项浏览器验证通过。真实 App 配置仍需部署凭据及可访问的 webhook URL；详情见 docs/github-integration.md。

### 2026-09-23 待办：OSS 图片与附件上传

状态：暂缓实施，等待用户提供 OSS 配置后再做。保留 MDXEditor，无需更换编辑器。

- 图片：接入 `imagePlugin` 与 `imageUploadHandler`，支持粘贴截图、拖入和选择上传，在描述正文中展示。
- 普通附件：支持 PDF、ZIP、日志等文件上传，并以正文链接或附件入口访问。
- 实施时补齐服务端上传/存储、项目访问权限、上传中与失败重试体验；创建事项尚未保存时的附件归属和废弃草稿清理也需处理。
- OSS 配置通过部署环境提供，密钥不写入文档、仓库或任务正文。具体供应商、Bucket、访问方式及限制待接入时确认。

此记录仅保存后续需求，本次不实现上传功能。

### 2026-09-23 提及通知与 Sprint 概览

用户选择先邮件、飞书仅预留接口；实现描述/评论 @ 成员与站内通知、SMTP outbox。追加历史 Sprint 与当前 Sprint 按人估点：使用结束快照保留迁出事项，旧数据明确标注不完整。OSS 附件继续等待用户配置；未扩大为报表或真实第三方消息发送。验收与边界见 verification.md、notifications.md。
