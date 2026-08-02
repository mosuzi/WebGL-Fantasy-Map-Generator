# 云存储自部署配置

正式应用可以把完整的 `.webgl-map.json.gz` 地图存档保存到用户自己的 Dropbox App Folder 或 Google Drive。项目仓库不附带可用的 OAuth 应用配置；部署者需要在对应平台创建自己的应用，并把公开的 client identifier 作为构建环境变量提供给 Vite。

## 环境变量

复制根目录 `.env.example`，在本地使用 `.env.local`，在线部署时改为在部署平台控制台设置：

```dotenv
VITE_FMG_DROPBOX_APP_KEY=
VITE_FMG_DROPBOX_REDIRECT_URI=
VITE_FMG_GOOGLE_CLIENT_ID=
```

这些值会进入浏览器产物，因此只能填写公开的 app key、client ID 和回调地址。不要填写 client secret、refresh token 或任何用户 access token。

## Dropbox

1. 在 Dropbox App Console 新建使用 Scoped access 的应用，访问类型选择 App Folder。
2. 启用 `files.metadata.read`、`files.content.read`、`files.content.write` 三项权限。
3. 把正式站点的回调地址加入 Redirect URIs，并将同一个绝对地址填写到 `VITE_FMG_DROPBOX_REDIRECT_URI`。回调地址必须与应用页面同源。
4. 把 App key 填入 `VITE_FMG_DROPBOX_APP_KEY`。

应用使用 authorization code + PKCE 和短期令牌。PKCE verifier 与 `state` 只在授权握手期间放入 `sessionStorage`，结束后立即清理；access token 只保存在当前页面内存中。

## Google Drive

1. 在 Google Cloud Console 为项目启用 Google Drive API，并配置 OAuth consent screen。
2. 新建 Web application 类型的 OAuth 2.0 Client ID，把部署站点加入 Authorized JavaScript origins。
3. 把 Client ID 填入 `VITE_FMG_GOOGLE_CLIENT_ID`。

应用使用 Google Identity Services token model，只申请 `drive.file` scope。它只列出和操作由本应用创建、且带有应用标记的地图文件，不浏览用户云盘里的任意文件。

## 数据与安全边界

- 两个服务都只保存完整 gzip 地图，不做后台同步、自动保存、删除、分享、文件夹管理或冲突合并。
- 新建与覆盖目标分开；覆盖必须先选定明确文件并确认。载入也必须确认，因为它会替换当前地图并清空编辑历史。
- access token 不写入 LocalStorage、IndexedDB、地图文件、日志或公开 API；刷新或关闭页面后需要重新连接。
- Dropbox 使用远端 `rev` 做条件覆盖，Google Drive 在覆盖前重新读取文件版本；远端已变化时会拒绝覆盖，要求用户刷新列表后重新选择。
- 大地图当前使用普通上传。若服务端或网络限制导致失败，应用会保留当前地图并显示错误，不会伪装成保存成功。

本仓库的自动化只使用 fixture 和 mock transport 验证协议与界面。没有项目方 OAuth client 和测试账号时，不能把这些结果视为真实账号联调完成。
