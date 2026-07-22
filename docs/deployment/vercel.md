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

这些脚本分别转发到正式应用的 `start:app / build:app / preview:app`，不会构建或部署 `source/` 参考项目。生产构建完成后，Vite 的 `deploy-prototypes` 插件会动态枚举 `prototype/` 的直接子目录；每个目录必须包含 `index.html`，随后整目录复制到 `dist/webgl-generator/prototype/<目录名>/`。因此新增独立 prototype 时无需再修改构建白名单。

## 线上入口

| 内容 | URL |
|---|---|
| 正式 WebGL 地图生成器 | `/` |
| WebGL cells 历史原型 | `/prototype/webgl-cells/` |
| 共享边界拓扑实验室 | `/prototype/boundary-topology-lab/` |

Vercel 会把不带尾斜杠的 `/prototype/<目录名>` 临时重定向到带尾斜杠入口，保证原型内的 `./src/`、`./data/` 等相对地址仍从自身目录解析。prototype 目录入口随后改写到对应 `index.html`；其它真实静态文件由 Vercel 的文件系统优先规则直接提供，最后的正式应用 SPA fallback 不会吞掉原型模块、样式或数据文件。该顺序依据 Vercel 官方说明：高层 `rewrites` 默认先检查文件系统，通配 fallback 应置于末尾；参见[项目配置](https://vercel.com/docs/project-configuration/vercel-json)和[Vite 部署说明](https://vercel.com/docs/frameworks/frontend/vite)。

## Vercel 控制台导入

1. 选择当前仓库。
2. Root Directory 保持仓库根目录。
3. 保留 `vercel.json` 中的构建设置；控制台里不需要手动改 Root Directory。
4. 当前应用不需要环境变量。
5. 首次部署后访问 Vercel 给出的 Preview URL，确认根路径显示 `Mosuzi's Fantasy Map Generator` 加载页并能完成初始生成。
6. 分别打开 `/prototype/webgl-cells/` 与 `/prototype/boundary-topology-lab/`，确认原型页面和关键数据 / 模块能直接加载。

## 本地验证

提交部署前至少运行：

```powershell
$env:CI='true'; pnpm run build:app
pnpm run regress:deployment
```

构建产物位于 `dist/webgl-generator`，该目录不会提交到仓库。构建后至少应存在：

```text
dist/webgl-generator/index.html
dist/webgl-generator/prototype/webgl-cells/index.html
dist/webgl-generator/prototype/webgl-cells/data/sample-map.json
dist/webgl-generator/prototype/boundary-topology-lab/index.html
```

当前构建仍会出现既有的 `@vueuse/core` pure annotation 和 chunk size warning；它们来自第三方依赖与当前 bundle 体积提示，不会阻断部署。
