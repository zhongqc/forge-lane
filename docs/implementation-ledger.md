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
