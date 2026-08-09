# Vercel 统一部署说明

本文记录正式 WebGL 地图生成器与独立 prototype 的 Vercel 统一部署配置。`source/` 目录是原 Fantasy Map Generator 的只读参考实现，部署时不要把 `source/`、`app/webgl-generator` 或某个 `prototype` 单独设成项目根目录。

## 当前配置

根目录新增 `vercel.json`，Vercel 导入仓库后会使用：

| 项 | 值 |
|---|---|
| Framework Preset | `vite` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build:app`，同时装配正式应用和全部 prototype |
| Output Directory | `dist/webgl-generator` |
| Node.js | `^20.19.0 || >=22.12.0` |

`package.json` 同步补充了常规脚本：

```powershell
pnpm run dev
pnpm run build
pnpm run preview
```

这些脚本分别转发到正式应用的 `start:app / build:app / preview:app`，不会构建或部署 `source/` 参考项目。生产构建完成后，Vite 的 `deploy-prototypes` 插件会动态枚举 `prototype/` 的直接子目录；每个目录必须包含 `index.html`。通常页面会整目录复制到 `dist/webgl-generator/prototype/<目录名>/`；`boundary-topology-lab` 与 `river-network-lab` 例外：它们会以独立 Vite 子构建输出自包含 `assets/`，把所需共享纯模块纳入实验室 bundle，且边界实验室保留其只读几何依赖。两页不得在生产页面中请求 `/app/webgl-generator/src/**`，也不得新增该类根路径运行时 import。新增其它独立 prototype 时无需再修改构建白名单。

## 实验室在线预览

控制面板“简介 → 实验室”使用下列预览链接：

- [WebGL 单元格实验室](https://fmg.mosuzi.top/prototype/web-cells/)
- [共享边界拓扑实验室](https://fmg.mosuzi.top/prototype/boundary-topology-lab/)
- [画卷加载页文字视觉概念稿](https://fmg.mosuzi.top/prototype/loading-scroll-showcase/)
- [河流网络算法实验室](https://fmg.mosuzi.top/prototype/river-network-lab/)

线上可达性应在每次部署后单独验证；本地构建会装配当前四个目录，不能用历史部署记录替代本次检查。实验室用途、正式应用边界和 AI 操作规则见 [`../architecture/laboratory-prototypes.md`](../architecture/laboratory-prototypes.md)。路由细节以 `vercel.json` 与部署回归为准，不在面向使用者的说明中重复展开。

## Vercel 控制台导入

1. 选择当前仓库。
2. Root Directory 保持仓库根目录。
3. 保留 `vercel.json` 中的构建设置；控制台里不需要手动改 Root Directory。
4. 本地 / 浏览器存储不需要环境变量。官方部署若要启用云端存储，按[云存储部署配置](./cloud-storage.md)在 Vercel 设置统一的 `FMG_CLOUD_PROVIDER_CONFIG`，或分别设置 `FMG_DROPBOX_APP_KEY`、`FMG_DROPBOX_REDIRECT_URI`、`FMG_GOOGLE_CLIENT_ID` 与可选的 `FMG_GOOGLE_FOLDER_PATH`。Google Drive 目录不配置时默认为 `/webFMG`。构建会自动生成 `cloud-provider-config.js`；未配置的服务会在界面中明确保持禁用，旧 `VITE_FMG_*` 继续兼容。
5. 首次部署后访问 Vercel 给出的 Preview URL，确认根路径显示从中央向两侧展开的中国古代画卷加载页，卷面包含“莫苏子”“幻想地图生成器”和当前版本号，并能完成初始生成。
6. 分别打开上方四个在线预览，确认实验室页面和关键数据 / 模块能直接加载。

## 本地验证

提交部署前至少运行：

```powershell
$env:CI='true'; pnpm run build:app
pnpm run regress:deployment
pnpm run regress:prototype-deployment-browser
```

部署完成后，使用同一个浏览器门禁复核生产域名：

```powershell
$env:FMG_PROTOTYPE_BASE_URL='<部署域名>'; pnpm run regress:prototype-deployment-browser
```

构建产物位于 `dist/webgl-generator`，该目录不会提交到仓库。构建后至少应存在：

```text
dist/webgl-generator/index.html
dist/webgl-generator/cloud-provider-config.js
dist/webgl-generator/oauth/dropbox/callback/index.html
dist/webgl-generator/prototype/webgl-cells/index.html
dist/webgl-generator/prototype/webgl-cells/data/sample-map.json
dist/webgl-generator/prototype/boundary-topology-lab/index.html
dist/webgl-generator/prototype/boundary-topology-lab/assets/*.js
dist/webgl-generator/prototype/boundary-topology-lab/vendor/earcut.min.mjs
dist/webgl-generator/prototype/loading-scroll-showcase/index.html
dist/webgl-generator/prototype/loading-scroll-showcase/src/app.js
dist/webgl-generator/prototype/loading-scroll-showcase/src/styles.css
dist/webgl-generator/prototype/river-network-lab/index.html
dist/webgl-generator/prototype/river-network-lab/assets/*.js
```

当前构建仍会出现既有的 `@vueuse/core` pure annotation 和 chunk size warning；它们来自第三方依赖与当前 bundle 体积提示，不会阻断部署。
