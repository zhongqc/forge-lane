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

将工作流、生产 Compose 文件和部署脚本合入默认分支后，创建指向该提交或后续提交的正式 GitHub Release。部署按发布提交的 SHA 给镜像打标签，同一时间只执行一个生产部署。部署过程中不删除 PostgreSQL 卷，也不替换服务器上的 `.env`。

新容器未通过 Compose 健康检查或公开地址检查时，脚本尝试恢复上一版应用镜像，并使工作流失败。应用启动时会执行 Prisma 迁移；镜像回滚不会自动回滚数据库结构。公开地址检查失败时还需查看服务器上的 Nginx 和应用日志。可在 GitHub Actions 的 **Deploy release** 运行记录中查看具体步骤。
