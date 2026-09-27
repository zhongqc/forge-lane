# 发布部署

发布一个非预发布版的 GitHub Release 后，`.github/workflows/deploy.yml` 先运行仓库的完整检查，再构建五个平台的 Forge CLI 压缩包和与该 Release 提交对应的 Docker 镜像，推送到阿里云个人镜像仓库。工作流通过 SSH 将 `compose.prod.yaml` 和部署脚本传到现有服务器，由服务器拉取该镜像，运行 Compose 并等待服务健康，最后检查公开的 `/forge/api/health` 地址。CLI 下载文件随生产镜像从本站 `/forge/downloads/` 提供。预发布版不会部署。

## 首次配置

在 GitHub 仓库创建名为 `production` 的 Environment，并配置以下值：

| 名称                       | 类型     | 内容                                                           |
| -------------------------- | -------- | -------------------------------------------------------------- |
| `DEPLOY_HOST`              | Secret   | 当前服务器公网主机名或 IP；也用于公开健康检查的 HTTPS 主机名   |
| `DEPLOY_USER`              | Secret   | 当前服务器为 `ecs-user`；需可通过 SSH 登录并免交互执行 `sudo`  |
| `DEPLOY_SSH_KEY`           | Secret   | 专用部署私钥的完整内容；对应公钥放入该用户的 `authorized_keys` |
| `DEPLOY_KNOWN_HOSTS`       | Secret   | 已核对指纹的 SSH host key 行，格式与 `known_hosts` 相同        |
| `DEPLOY_PATH`              | Variable | 当前服务器的部署目录 `/opt/forge-lane`                         |
| `ALIYUN_REGISTRY_USERNAME` | Secret   | 阿里云镜像仓库登录用户名                                       |
| `ALIYUN_REGISTRY_PASSWORD` | Secret   | 阿里云镜像仓库登录密码或专用访问凭据                           |

`DEPLOY_KNOWN_HOSTS` 可先用 `ssh-keyscan -H <DEPLOY_HOST>` 取得候选值，再通过服务器控制台或其他可信渠道核对主机密钥指纹；不要直接信任未经核对的扫描结果。当前服务器的 `ecs-user` 可以免交互执行 `sudo`，工作流据此运行 Docker 并覆盖由 root 持有的 Compose 文件。服务器应有 Docker Compose v2，且可以从服务器访问当前站点的 HTTPS 地址。

镜像仓库地址为 `crpi-2ltdt72vjx67mm0n.cn-beijing.personal.cr.aliyuncs.com/qichao-private/forge`。工作流使用上述 GitHub Secrets 在构建机推送镜像，并通过 SSH 标准输入让服务器执行 `sudo docker login` 后拉取镜像；密码不写入命令行或仓库。

在 `DEPLOY_PATH` 预置生产 `.env`，至少包含 `POSTGRES_PASSWORD` 和 `APP_URL=https://<DEPLOY_HOST>/forge`。其他凭据（如 GitHub App、SMTP、OSS）继续保留在服务器的 `.env` 或可选的 `.env.oss`，不要提交到仓库。当前服务器的部署目录是 `/opt/forge-lane`，运行中的 Compose 项目为 `forge-lane-prod`，PostgreSQL 使用卷 `forge-lane-prod_pgdata`；发布配置沿用这些名称。首次启用前再次确认运行中的数据库仍使用该卷，并做好数据库备份。若服务器配置已变化，先调整发布配置和数据迁移方案，避免启动一个空数据库。

## 发布与恢复

将工作流、生产 Compose 文件和部署脚本合入默认分支后，按下方发布流程合并 release-please 发布 PR，由它创建正式 GitHub Release。部署按发布提交的 SHA 给镜像打标签，同一时间只执行一个生产部署。部署过程中不删除 PostgreSQL 卷，也不替换服务器上的 `.env`。

新容器未通过 Compose 健康检查或公开地址检查时，脚本尝试恢复上一版应用镜像，并使工作流失败。应用启动时会执行 Prisma 迁移；镜像回滚不会自动回滚数据库结构。公开地址检查失败时还需查看服务器上的 Nginx 和应用日志。可在 GitHub Actions 的 **Deploy release** 运行记录中查看具体步骤。

## 自动准备版本

`.github/workflows/release-please.yml` 在变更合入 `main` 后运行 release-please，也可在 GitHub Actions 中手动运行。它为整个 Forge Lane 维护**一个产品版本**：根目录 `.release-please-manifest.json`、`apps/web/package.json`、`apps/server/package.json` 和 `packages/cli/package.json` 使用相同版本。发布 PR 更新这些文件及根目录 `CHANGELOG.md`；合并发布 PR 后生成 `vX.Y.Z` tag 和正式 GitHub Release，Release notes 来自同一批变更。CLI 下载清单读取 CLI 包版本，因此随该版本一起更新。`pnpm-lock.yaml` 不记录工作区包自身的版本，无需随版本号修改。

提交进入发布记录需要使用 Conventional Commits。合并 PR 时保留符合规范的提交或使用符合规范的 squash 标题，例如 `feat: ...` 归入新功能、`fix: ...` 归入修复；破坏性变更使用 `!` 或 `BREAKING CHANGE:` 正文。普通 `chore:`、`docs:`、`test:` 默认不触发版本升级。发布 PR 汇总自上次发布以来的有效变更，审阅版本号和 `CHANGELOG.md` 后再合并；不要手工改动 manifest 或发布 PR 中的版本号。

### 首次启用和令牌

仓库已有 `v0.1.0` tag，三个包当前也都是 `0.1.0`。manifest 以 `0.1.0` 初始化，`release-please-config.json` 的 `bootstrap-sha` 指向该 tag 的提交，只收集该提交之后的变更。首个自动发布完成后，这个 bootstrap 设置不再参与后续发布。若在一个尚无 tag 的仓库复用此配置，应先选择一个已知基线提交作为 `bootstrap-sha`，并在 manifest 写入该基线的版本，避免把全部历史当成首次发布内容。

在仓库 **Settings → Secrets and variables → Actions** 创建 `RELEASE_PLEASE_TOKEN`。使用仅限本仓库的独立 fine-grained PAT，授予 **Contents: Read and write**、**Pull requests: Read and write**、**Issues: Read and write**；令牌持有人须有创建 PR 和 Release 的权限。若仓库策略要求，还要在 **Settings → Actions → General** 允许 Actions 创建 PR。工作流缺少该 Secret 会明确失败，不会回退到默认 `GITHUB_TOKEN`：由默认令牌创建的 PR 和 Release 不会触发后续 Actions，导致发布 PR 无 CI 或 `release: published` 部署不启动。令牌只存储在 GitHub Secret，不进入仓库或日志。

### 日常验证与恢复

1. 将一个 `feat:` 或 `fix:` 变更合入 `main`，查看 **Prepare release** 工作流是否创建或更新发布 PR。确认发布 PR 中 `CHANGELOG.md`、manifest 和 Web、Server、CLI 三个版本一致，并等待 **Checks** 通过。
2. 合并发布 PR，查看 **Prepare release** 后续运行是否创建一个 `vX.Y.Z` tag 和正式 GitHub Release；核对 Release notes 与 changelog。正式 Release 的 `published` 事件会触发 **Deploy release**，预发布版仍由部署工作流跳过。
3. 手动重跑 **Prepare release** 或使用 `workflow_dispatch` 检查幂等性：已有版本不会再产生相同 tag/Release；无新可发布提交时也不会创建重复发布 PR。
4. 若工作流因令牌失效或权限不足失败，修复 Secret/权限后重跑；若发布 PR 合并后 Release 未创建，先核对 tag 与 Release 是否已存在，再手动重跑 **Prepare release**。不要在未核对前手工创建同版本 Release，以免重复部署。若 Release 已创建但部署失败，从 **Deploy release** 的失败步骤和服务器日志排查，并重跑部署工作流；数据库迁移不会随镜像回滚。
