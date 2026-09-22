# @ 提及与通知

描述和评论中的 Markdown 链接 `[@显示名](/mentions/ACTOR_UUID)` 引用稳定的成员身份。保存后只通知此次新增的可访问成员；重复提及只生成一次事件，自己、无效身份、跨项目成员、代码示例和纯文本 `@名字` 不发送。无效提及保留原文。管理员无需显式项目成员关系，也能成为合法候选。描述创建/编辑、评论创建/编辑/删除通过同一业务事务处理通知，失败或版本冲突不产生额外通知，创建的幂等重放也不重复产生事件。

站内通知保存于数据库；移除提及或删除评论会撤回对应站内提醒，并取消尚未发出的邮件。重新添加会生成新事件。已经发送的邮件不能撤回。旧来源内容可在事项描述/评论历史查看。每次读取通知和投递邮件都会重新检查当前访问权限，撤销项目权限后不会继续显示或发送其内容。

## SMTP 部署

配置 `.env` 或部署环境：

- `APP_URL`：用户可访问的应用根 URL，必须使用 HTTP/HTTPS；邮件链接进入 `/issues/PROJECT-123`，评论附带定位锚点。
- `SMTP_HOST`、`SMTP_FROM`：SMTP 主机、发件人地址，必须同时配置才能投递。
- `SMTP_PORT`：默认 587。
- `SMTP_SECURE`：`false` 使用强制 STARTTLS；`true` 使用隐式 TLS，通常对应端口 465。
- `SMTP_USER`、`SMTP_PASSWORD`：供应商所需的认证信息；未配置用户名时不进行 SMTP AUTH。

Compose 的 app 服务透传上述变量。修改配置后重启服务。凭据只在服务端使用，不写入网页、事项内容、数据库错误或源码。没有配置时，站内通知照常创建，其邮件记录标记为 `SKIPPED / EMAIL_NOT_CONFIGURED`；配置恢复后不会补发之前的历史邮件。无邮箱的 Actor 记录为 `SKIPPED / NO_EMAIL`。如果运行途中配置失效，既有排队任务会保留到恢复配置后再尝试。

`NotificationChannel` 是外部投递边界，本次实现只有 `EmailChannel`。飞书仅为未来适配器扩展点，没有账号绑定或真实飞书投递。

## Outbox 运维

`MentionNotification` 存储事件身份和站内已读状态；`NotificationDelivery` 按事件/渠道唯一，保存 `PENDING`、`SENDING`、`SENT`、`FAILED`、`SKIPPED` 或 `CANCELLED` 状态。worker 每 5 秒领取最多 20 条任务，使用带令牌的条件更新领取 120 秒租约，每 30 秒续期。崩溃后的任务租约过期可恢复；旧 worker 无法覆盖新领取者的结果。最多尝试 5 次，失败按指数间隔退避，终态失败停止自动重试。`lastError` 只记录固定诊断码（`EMAIL_DELIVERY_FAILED`、`EMAIL_ATTEMPTS_EXHAUSTED` 等），避免 SMTP 响应泄漏凭据或正文。查看失败任务可查询该表的状态、attempts 和 retryAt。

邮件只包含提及人、事项编号/标题和链接，不包含完整描述/评论。SMTP 配置了连接、问候和传输超时。邮件与数据库确认并非一个事务，外部投递无法保证 exactly-once：邮件已发送但确认丢失，租约恢复时可能重发。稳定 Message-ID 有助于供应商去重，但不能保证。提及移除或权限撤销与已经在网络中发送的邮件也存在不可消除的竞态。

集成测试只用模拟渠道，不向真实用户发送。真实供应商连通性须部署配置完成后另行验收。

## API

- `GET /api/projects/:id/mention-members`：当前可访问的活动成员，项目范围令牌可读。
- `GET /api/notifications?cursor=ID`：当前工作区站内通知、下一页游标与未读数，每页最多 50 条；仅网页登录。
- `POST /api/notifications/:id/read` 和 `POST /api/notifications/read-all`：当前用户已读操作；仅网页登录。
