# Forge CLI 设计

用户要求设计完整 CLI 并实现，目的是让本机 Codex 获取任务、开发和回写。沿用直接执行授权。CLI 是平台客户端，不内置 Codex 运行器或自动领取循环。

## 命令面

`forge login/logout/whoami`；`forge token list/revoke`；`forge config show/set`（server/project）；`forge project list/show`；`forge status list`、`member list`、`label list`、`sprint list`；`forge issue list/show/context/create/update/transition/assign/comment/comments/history/revisions/development/claim/release`；`forge run list/show/renew/finish`；`forge skill print`。

全局 `--server --project --json --help --version`。优先级别名 P0/P1/P2/P3/none，类型不区分大小写。对象支持 key/UUID；状态/成员/标签/Sprint 名称必须精确且唯一，不猜测模糊匹配。未知参数直接失败。默认人类可读，JSON 标准输出仅结构化结果；错误带 code/message/details 到 stderr，退出码 2 参数、3 认证、4 权限、5 未找到、6 冲突、7 服务端/网络。不会默认循环重试写入；可提供 --idempotency-key。

列表按既有 API 分页：默认单页并显示游标；`--all` 遍历。issue context 聚合事项、描述、父事项/Epic、子任务、评论、最近活动、开发记录和流程状态。长文本 --description-file/--body-file/--summary-file，`-` 为 stdin。不自动拼装 shell 命令。

## 身份

login 调用已有邮箱密码登录，临时 session 选定工作区，签发最多90天的项目范围令牌，默认30天；必须指定至少一个项目。读/写范围可选，无管理权限。密码只交互隐藏输入或 --password-stdin，token 可通过 FORGE_TOKEN 环境变量或 login --token-stdin。配置 ~/.config/forge/config.json（FORGE_CONFIG_DIR 可覆盖）0700目录/0600文件，原子写入，不输出令牌。非 localhost 强制 HTTPS。

Bearer Token 只存 SHA256摘要，绑定 owner actor/workspace/projectIDs/scopes/expiry/name。权限为令牌范围与实时成员权限交集，不可借token访问成员管理、GitHub配置或签发令牌。允许自己列出/撤销令牌；不得查看明文或其他actor的token。活动保持真实用户Actor/source API，run记录token和executor标签；executor名称不作为身份认证。

## 领取与结果

IssueExecution 独立于 Issue 状态，RUNNING/SUCCEEDED/FAILED/CANCELLED/EXPIRED，带 leaseExpiresAt/version/tokenId/executor/summary/prUrl。项目写权限、Issue版本检查与workspace事务锁保证一事项仅一活动租约。租约默认30分钟，5–120分钟可选。领取不会修改负责人或状态。renew/finish只允许原token，项目权限实时验证；过期不能完成，需重新领取。失效租约在读取/下一次领取时显式呈现EXPIRED，不依赖守护进程。finish不会自动改Issue为Done。幂等重试不得产生重复活动。

## 验收

真实PostgreSQL测试token隔离/撤销/过期/越权、并发领取、lease续期/过期/结束；CLI子进程与真API贯通login/list/context/create/edit/comment/claim/renew/finish；错误码、JSON/文件stdin、令牌不泄漏。编写Codex skill模板，安装CLI本地可运行，Docker预览更新。CLI不发布npm，只提供本地安装/package tarball说明。
