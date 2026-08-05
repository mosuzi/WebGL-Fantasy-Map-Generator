# 云存储部署配置

正式应用可以把完整的 `.webfmg` 地图存档保存到用户自己的 Dropbox App Folder 或 Google Drive，也可以从云端列表导入本应用可见的完整地图。部署时通过 Cloud Provider Config 提供公开的 OAuth client identifier；应用源码、OAuth 权限和文件操作逻辑不需要随部署修改。

## Cloud Provider Config

浏览器会在应用主模块之前同步读取站点根目录的 `cloud-provider-config.js`。构建产物中的文件形状固定如下：

```js
globalThis.__FMG_CLOUD_PROVIDER_CONFIG__ = {
  version: 1,
  providers: {
    dropbox: {
      appKey: "",
      redirectUri: ""
    },
    googleDrive: {
      clientId: "",
      folderPath: "/webFMG"
    }
  }
};
```

私有部署可以选择以下任一方式：

1. 构建时设置下文的部署环境变量，构建会自动生成该文件。
2. 构建完成后直接替换 `dist/webgl-generator/cloud-provider-config.js`，不必重新打包应用，也不必修改源码。

配置文件只允许填写公开的 Dropbox App key、Dropbox Redirect URI、Google OAuth Client ID，以及不含凭据的 Google Drive 存档目录。不要填写 client secret、refresh token、用户 access token 或其它授权值。

仓库自带的官方配置会按访问地址选择 Dropbox 回调：正式站点使用 `https://fmg.mosuzi.top/oauth/dropbox/callback`；本地开发仅在 `http://localhost:5410` 下使用 `http://localhost:5410/oauth/dropbox/callback`。Dropbox App Console 需要同时登记这两个 Redirect URI；使用 `127.0.0.1` 或其它本地端口时不会冒充 `localhost:5410`，应通过私人部署配置显式覆盖。

## 官方部署与构建环境变量

官方 Vercel 部署推荐设置一个统一变量：

```dotenv
FMG_CLOUD_PROVIDER_CONFIG={"version":1,"providers":{"dropbox":{"appKey":"...","redirectUri":"https://example.com/oauth/dropbox/callback"},"googleDrive":{"clientId":"...apps.googleusercontent.com","folderPath":"/webFMG"}}}
```

也可以逐项设置：

```dotenv
FMG_DROPBOX_APP_KEY=
FMG_DROPBOX_REDIRECT_URI=
FMG_GOOGLE_CLIENT_ID=
FMG_GOOGLE_FOLDER_PATH=
```

统一 JSON 的优先级高于逐项变量。旧部署中的 `VITE_FMG_DROPBOX_APP_KEY`、`VITE_FMG_DROPBOX_REDIRECT_URI`、`VITE_FMG_GOOGLE_CLIENT_ID` 和 `VITE_FMG_GOOGLE_FOLDER_PATH` 仍可使用；新逐项变量会逐字段优先于旧变量。仓库根目录的 `.env.example` 只保留空模板，真实值应放在未提交的 `.env.local` 或部署平台的加密环境变量中。

## Dropbox

1. 在 Dropbox App Console 新建使用 Scoped access 的应用，访问类型选择 App Folder。
2. 启用 `files.metadata.read`、`files.content.read`、`files.content.write` 三项权限。
3. 把正式站点的 `/oauth/dropbox/callback` 绝对地址加入 Redirect URIs，并将同一个地址填写到 `providers.dropbox.redirectUri`。本地联调时还要登记对应的 `http://localhost:5410/oauth/dropbox/callback`；回调地址必须与应用页面同源。
4. 把 App key 填入 `providers.dropbox.appKey`。

应用使用 authorization code + PKCE 和短期令牌。授权小窗口返回同源的独立轻量页；该页面不启动地图应用、不读取握手存储，也不换取令牌，只把授权码、`state` 或错误交回发起授权的原窗口后自动关闭。原窗口会同时校验来源、发起授权的窗口、`state` 和十分钟握手期限，再完成令牌交换。

PKCE verifier 与 `state` 只在授权握手期间放入原窗口的 `sessionStorage`，结束后立即清理。成功换取的短期 access token、绝对到期时间和当前 provider / origin / 配置 / scope 指纹同样只写入当前标签页的 `sessionStorage`，用于刷新后恢复仍有效的连接；它们不会出现在回调 URL、跨窗口消息或回调页内容里。浏览器若拦截弹窗，应用会要求允许该站点弹出窗口后重试，不会把主地图页面导航离开。

## Google Drive

1. 在 Google Cloud Console 为项目启用 Google Drive API，并配置 OAuth consent screen。
2. 新建 Web application 类型的 OAuth 2.0 Client ID，把部署站点加入 Authorized JavaScript origins。
3. 把以 `apps.googleusercontent.com` 结尾的 Client ID 填入 `providers.googleDrive.clientId`。不要把以 `GOCSPX-` 开头的 Client secret 放进配置。
4. 新存档默认放入 `/webFMG`。需要其它位置时，把绝对路径写入 `providers.googleDrive.folderPath`，例如 `/maps/campaign-a`；多级目录会在首次新建存档时按需创建。显式配置为 `/` 才会继续把新文件放到“我的云端硬盘”根目录。

应用使用 Google Identity Services token model，只申请 `drive.file` scope。它不强制每次使用 `prompt=consent`，已有授权记录由 Google 正常复用；首次授权、权限变化或短期令牌到期后仍由用户操作启动取令牌流程。应用只列出和操作由本应用创建、且带有应用标记的地图文件，不浏览用户云盘里的任意文件。升级前已经保存在根目录的本应用地图仍会显示；覆盖这些旧文件时保留原位置，不会在后台搬到新目录。

## 数据与安全边界

- 两个服务的新建与覆盖都使用完整 gzip 地图；从云端导入还兼容本应用列表中的旧 gzip 名称和未压缩完整 JSON。不做后台同步、自动保存、删除、分享、交互式文件夹管理或冲突合并；Google Drive 只按部署配置解析并按需创建存档目录。
- 新建与覆盖目标分开；覆盖必须先选定明确文件并确认。载入也必须确认，因为它会替换当前地图并清空编辑历史。
- access token 不写入 LocalStorage、IndexedDB、地图文件、日志或公开 API，只在当前标签页的 `sessionStorage` 保存到服务端声明的到期时间。刷新会恢复仍有效且配置指纹一致的连接；关闭标签页、令牌到期、云 API 返回 `401`、配置变化、记录损坏或主动断开时会清除，随后需要重新连接。
- Dropbox 使用远端 `rev` 做条件覆盖，Google Drive 在覆盖前重新读取文件版本；远端已变化时会拒绝覆盖，要求用户刷新列表后重新选择。
- 大地图当前使用普通上传。若服务端或网络限制导致失败，应用会保留当前地图并显示错误，不会伪装成保存成功。

自动化会验证配置优先级、fixture、mock transport 和界面两态。真实账号联调仍需在部署平台配置正确的公开 identifier，并使用对应测试账号完成授权。
