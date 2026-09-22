# GitHub 集成设计

用户授权直接实现原 spec 35–38；授权方式明确选择 GitHub App。现有 main 本地预览继续更新，保留用户数据。

## 功能

项目管理员绑定多个 GitHub 仓库，填写 owner/repo 与 App installation ID；服务端部署者配置 App ID、私钥、Webhook secret。连接前验证安装令牌确实能访问仓库。不提供用户 OAuth 登录。

关联识别分支名、PR 标题/正文、提交消息中的当前项目 ISSUE-123。Story/Task/Bug/Subtask 参与，Epic 排除。详情 Development 显示 PR 状态/分支/链接以及提交链接。活动保存来源、GitHub 用户及对象快照。

Webhook 验签后持久保存唯一 delivery ID，立即返回；后台处理。Webhook 触发权威 API 同步，避免乱序 payload 回滚 PR 状态。用户明确不考虑无 hook 情况：只做 Webhook 自动同步，保留立即同步补偿。初次同步只导入，不触发自动化。

每仓库可配置 OPENED / REVIEW_REQUESTED / MERGED 三条规则，默认关闭；指定来源状态集合和目标状态。开放/评审不得因一般标题更新重复触发；merge 要求同一事项所有已关联 PR 已合并。Epic 排除；状态变更与版本递增、历史记录处于同一事务，使用现有 workspace command lock。不同仓库状态尚未同步时保守不推进。

## 数据与安全

Repository 绑定项目、GitHub 不变 repository ID、installation ID、同步时间/错误、规则 JSON。PullRequest 存远端更新时间、状态、draft/reviewRequested；Commit 存 SHA；Issue links 保存明确关联。Delivery 保存签名已验证事件、重试次数、状态；worker 使用数据库锁/租约防多实例重复执行。凭据仅部署环境，不写浏览器、活动或返回 API。

项目设置与 Development 读取均沿用 workspace/project 权限；配置仅 ADMIN。GitHub API 固定 api.github.com、最小只读 metadata/contents/pull_requests 权限，短期 installation token。仓库解绑停同步，保留历史。失败可见、可重试；限流尊重 retry-after/reset，不忙循环。不在本地自动公开端口。

## 验收

mock GitHub API + 真 PostgreSQL 集成测试：授权/隔离、签名与去重、关联、初次导入、Webhook 变更、自动化幂等、多 PR 合并条件、错误重试。浏览器验证设置引导和 Development 展示；lint/typecheck/unit/integration/build。真实 GitHub App 凭据尚未提供，真实安装与外网 webhook 必须明确作为待配置项。
