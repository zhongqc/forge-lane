# GitHub App 接入

## 使用方式

项目设置 → GitHub → 连接仓库。一个项目可以连接多个仓库。关联识别分支名、PR 标题/正文、Commit 消息中的完整事项编号，例如 `APP-123`。Epic 排除，其他事项类型支持。Issue 详情的「开发关联」显示 PR、分支、提交与 GitHub 链接；历史记录保留关联和自动状态变更。

只使用 Webhook 自动同步，没有定时查询 GitHub。页面的同步进度刷新不是 GitHub 轮询。首次绑定会导入 PR 和默认分支提交，首次导入不改变事项状态；后续 push 包含的功能分支提交也会关联。「立即同步」可补同步 PR 和默认分支提交。Webhook 到达后进入数据库队列，后台通常在几秒内开始同步；看板自身每 30 秒刷新一次。

## 部署配置

1. 在 GitHub 创建 GitHub App。Repository permissions：Metadata / Contents / Pull requests 只读；订阅 Pull request、Push。Installation / Installation repositories 用于停用失去授权的绑定。
2. Webhook URL 设置为 `https://你的域名/api/github/webhook`，Content type 为 JSON，并设置强随机 secret。不要把 localhost 填到 GitHub，GitHub 无法直接访问本机；正式域名或自行配置的隧道需要能到达本服务。
3. 安装 App 到所需仓库，生成 private key。服务端环境变量：

```dotenv
GITHUB_APP_ID=你的AppID
GITHUB_APP_SLUG=你的app-slug
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=与GitHub一致的secret
GITHUB_INSTALLATION_PROJECTS={"项目UUID":["安装ID"]}
```

`APP_URL` 应配置为用户访问的 HTTPS 地址。私钥支持真实换行或字面量 `\n`。密钥只保存在部署环境，不通过浏览器录入或返回，不应提交到仓库。Compose 已传递以上变量。

4. `GITHUB_INSTALLATION_PROJECTS` 是部署管理员授予的项目到 App installation ID 映射。安装 ID 不是密码，单凭知道 ID 不代表有权连接；这层映射防止跨工作区绑定别人的安装。项目设置里可复制当前项目 UUID 与映射示例。安装 ID 可在 GitHub installation 设置页 URL 中找到。
5. 重启服务后，项目管理员填写 `owner/repo` 和 Installation ID。连接时通过 installation token 验证仓库权限。Token 按需签发，不持久保存。

GitHub App 登录与用户 OAuth 登录相互独立，当前仍用 Forge Lane 的已有登录方式。

## 自动化

每个仓库可配置：PR 打开、请求评审、全部关联 PR 合并。默认关闭；启用时必须选择来源状态和目标状态。初次导入不运行规则，草稿不触发打开/评审规则，Epic 永不自动推进。目标可以选择测试状态，不预设直接 Done。

合并规则检查事项所有**已经关联**的 PR；尚未被引用或尚未同步的 PR 无法被预知。发现其他关联仓库尚在同步、失败或停用时保守等待，保存待执行规则；恢复同步后再判断。关闭但未合并的 PR 也会阻止「全部合并」。手工修改到来源状态以外后，待执行规则不再推进该事项。

PR 多个事件可合并成一次权威 API 快照，因此记录的是同步观察到的状态，而非承诺逐条恢复瞬时事件。例如短时间内打开又合并的 PR 可能只观察到合并。标题删除编号不会删除已有历史关联。

## 可靠性和边界

- Webhook 用原始请求字节进行 HMAC-SHA256 验签，按 `X-GitHub-Delivery` 去重；不签名的请求返回 401。
- 事件先入库，后台再处理；进程重启继续，失败自动退避。仓库租约与事务锁防多实例重复写入。Webhook 队列不会绕过 GitHub 限流等待。
- PR 通过 GitHub API 获取权威状态，避免乱序事件直接回滚数据；状态与活动、Issue version 同事务提交。
- GitHub 请求超时 15 秒，列表分页，单次最多 10,000 条 PR / 默认分支提交；超过上限显示同步错误，不静默当作成功。
- 入口请求体限制 5 MB。过大的推送或 GitHub 未送达事件需由管理员检查 Delivery 并重投；立即同步不能补齐所有历史功能分支提交。
- Development 显示最近 100 条 PR 与 100 条提交。尚不支持 GitHub Enterprise 自定义域名。
- 停用绑定停止同步，保留已有开发记录及历史。App 卸载、暂停或仓库授权移除也会停用绑定；恢复后需管理员显式启用。
- 当前 App 凭据/安装尚未在本地配置；自动化测试用模拟 GitHub API 和真实 PostgreSQL 验证，不能替代真实安装与公网 Webhook 验收。

参考：[GitHub Webhook 最佳实践](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)、[签名校验](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)、[安装令牌](https://docs.github.com/en/enterprise-cloud%40latest/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)。
