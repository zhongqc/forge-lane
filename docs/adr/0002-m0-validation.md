# ADR 0002 — M0 实测结果与执行门禁

日期：2026-11-26。环境：当前开发机 macOS arm64，Electron 45.5.0，Codex CLI 0.154.0。本记录区分调查已完成与能力已通过；M0 全量验收尚未通过，不阻塞 M1 离线任务管理。

| 检查                   | 结果与证据                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio JSON-RPC         | `CodexRpc` 限帧大小、请求超时、进程退出清理；默认拒绝服务端审批。fixture 测试覆盖并发请求、通知、无响应、异常帧、退出与关闭。仅用于显式诊断，未接入执行入口。                                                         |
| 账号/模型/配置         | `scripts/m0-codex-probe.mjs` 真实 initialize/account/read/model/list/config/read 通过。ChatGPT 账号已认证，返回 4 个模型。仅输出类型和数量，不记录凭据/配置正文。                                                     |
| readOnly               | 工作区写入失败（exit 1）；**工作区外假认证哨兵读取成功（exit 0）**。不能作为秘密读取隔离。                                                                                                                            |
| workspaceWrite         | 允许工作区写入；**同样可以读取工作区外假认证哨兵**。禁止使用此策略直接运行 Forge Agent。                                                                                                                              |
| 网络                   | 两种策略下 curl 返回 exit 6；这只能证明该请求失败，不能单独证明所有网络/Unix socket 隔离。完整 socket 和扩展隔离仍待补证。                                                                                            |
| 真实模型审批/中断/恢复 | blocked：基础读取隔离失败，未发起模型 turn，未以 Full Access 重试。只测协议不能替代这些门禁。                                                                                                                         |
| 原始对话持久化         | thread/start 返回新 ID；未执行 turn 的 thread/read 返回 no rollout found。持久化/history/resume 尚未通过，不能承诺 Codex 桌面可见。只触及本次创建的测试 thread。                                                      |
| hooks/MCP/plugins      | 有效配置中存在这些扩展键；尚未证明按会话彻底禁用，不开自动执行。                                                                                                                                                      |
| Git common-dir 写入    | 基础 Git/worktree 规范化测试通过；沙箱内 commit/common-dir 最小授权实测仍待执行隔离方案确定后补齐。                                                                                                                   |
| GitHub                 | 本机 gh API 账号 zhongqc，对仓库 pull/push/admin 为 true。fc8e4c44ff2669917441734d4e9fb5f8d3a56a77 的 desktop check 为 success，按返回 head_sha 匹配。main protection 返回 HTTP 404（未保护），不能视为存在保护规则。 |
| Git push 身份          | remote 为 SSH；gh OAuth 与 SSH 写入是两条独立路线。未执行 push 探针，不根据 gh 登录推断 SSH 写入能力。                                                                                                                |
| Keychain               | `scripts/m0-platform-probe.mjs` 唯一测试服务写入/读取匹配/删除通过，删除后读取 exit 44。无真实 secret 入库/日志。交互拒绝/锁定未模拟，需在功能接入时验证。                                                            |
| 包装、离线迁移         | ADR 0001 / Playwright 已通过真实包首次启动、重启、损坏保护及无 PATH Node；迁移版本升级在真实 SQLite 测试验证。物理断网的包级升级冷启动仍需本轮最终包补证。                                                            |

结论：M0 的自动执行门禁保持关闭。M1 仅实现本地 Project/Task/Settings；CODE Start 返回明确不可用原因，CLI 仍只提供 health。后续 M2 必须解决最小读取权限、禁用不受管扩展、Owner socket/凭据隔离，再补真实审批、中断、历史恢复与 Git 公共目录写入验收。不得把本 ADR 的 blocked/unknown 改写成通过。

协议依据：本机 `codex app-server generate-ts --out ...` 生成的 0.154.0 类型；[官方 app-server 文档](https://developers.openai.com/codex/app-server/)、[安全边界说明](https://developers.openai.com/codex/security/)。本机协议中的 `readOnly` / `workspaceWrite` 是写入策略，实测说明它们不是秘密读取隔离。
