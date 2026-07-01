# Vercel 部署说明

本文记录正式 WebGL 地图生成器的 Vercel 部署配置。`source/` 目录是原 Fantasy Map Generator 的只读参考实现，部署时不要把 `source/` 或 `app/webgl-generator` 单独设成项目根目录。

## 当前配置

根目录新增 `vercel.json`，Vercel 导入仓库后会使用：

| 项 | 值 |
|---|---|
| Framework Preset | `vite` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build:app` |
| Output Directory | `dist/webgl-generator` |
| Node.js | `^20.19.0 || >=22.12.0` |

`package.json` 同步补充了常规脚本：

```powershell
pnpm run dev
pnpm run build
pnpm run preview
```

这些脚本分别转发到正式应用的 `start:app / build:app / preview:app`，不会构建或部署 `source/` 参考项目。

## Vercel 控制台导入

1. 选择当前仓库。
2. Root Directory 保持仓库根目录。
3. 保留 `vercel.json` 中的构建设置；控制台里不需要手动改 Root Directory。
4. 当前应用不需要环境变量。
5. 首次部署后访问 Vercel 给出的 Preview URL，确认页面标题为“WebGL 地图生成器”，地图能完成初始生成。

## 本地验证

提交部署前至少运行：

```powershell
$env:CI='true'; pnpm run build:app
```

构建产物位于 `dist/webgl-generator`，该目录不会提交到仓库。

当前构建仍会出现既有的 `@vueuse/core` pure annotation 和 chunk size warning；它们来自第三方依赖与当前 bundle 体积提示，不会阻断部署。
