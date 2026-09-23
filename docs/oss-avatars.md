# OSS 头像存储

本地配置文件为仓库根目录 `.env.oss`，已被 `.gitignore` 和 `.dockerignore` 排除，不能提交到仓库或打包进镜像。填入 `OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET` 后重启 API。环境变量优先于配置文件。Docker Compose 自动读取可选 `.env.oss`，修改后重新创建 app 容器。

- Bucket：`forge-lane`
- Region：`oss-cn-shanghai`
- Endpoint：`oss-cn-shanghai.aliyuncs.com`
- 默认对象路径：`avatars/<actor UUID>/<随机 UUID>.webp`
- `OSS_PREFIX` 可用于不同环境的目录隔离，例如 `staging/avatars`。正式环境使用 `avatars`。

右上角账号菜单 → 更换头像。接受 JPG、PNG、WebP，最多 2 MB、2000 万像素，服务端按 EXIF 方向旋转、居中裁切为 256×256 WebP，移除原文件元数据。没有头像或读取失败时，按姓名自动生成稳定颜色的文字头像：中文取末两字，英文取首尾词首字母（单词名取前两个字符），完整保留 Unicode 字素；无需访问 OSS。

`POST /api/me/avatar` 使用网页登录和 multipart 字段 `file`，只修改当前用户头像。`GET /api/actors/:id/avatar` 校验当前工作区成员关系后读取 OSS，带当前 `v=avatarKey` 的请求采用浏览器私有缓存 24 小时、`immutable` 和 ETag；更换头像时 URL 自动更新。旧版本 URL 返回 404，防止新图被缓存到旧 URL。未带版本的请求必须重新验证。响应按 Cookie 区分，缓存命中前仍校验工作区权限。服务端另有 10 分钟内存缓存（最多 256 张 / 32 MB、LRU 淘汰），合并同一图片的并发读取，避免重复请求 OSS；读取失败不会缓存。前端不接触 AK/SK，也不保存临时签名链接。对象设置 private，Bucket 无需公开或配置浏览器跨域规则。

数据库只存 `Actor.avatarKey`；更换成功后尝试删除旧对象，上传或数据库保存失败时不修改原头像。删除失败不会影响更换成功，需运维处理孤立对象；暂不支持删除用户头像或附件上传。后续附件请使用独立 `attachments/<workspace>/<issue>/` 前缀并单独实现权限与生命周期。

建议 RAM 凭据只授权 `acs:oss:*:*:forge-lane/avatars/*` 下的 `oss:PutObject`、`oss:GetObject`、`oss:DeleteObject`。自定义前缀时同步修改授权范围。

实现依据：[阿里云 Node.js 上传文档](https://www.alibabacloud.com/help/en/oss/developer-reference/upload-a-local-file)。缺少凭据时上传返回明确的未配置提示。离线验证使用 OSS 测试替身，真实读写验收需配置有效凭据。
