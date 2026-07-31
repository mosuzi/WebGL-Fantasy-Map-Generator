# API 与自动化

## 浏览器 API

页面内根对象是 `window.webglGeneratorApi`，`window.api` 为兼容别名。先调用：

```js
api.info.version()
api.info.capabilities()
api.info.mapSummary()
api.info.describe("edit.population.inspectAdjustment")
```

当前共有 17 个命名空间、316 个方法；每个方法有输入 / 输出 schema、稳定性、副作用、确认、业务 code 和示例。普通 API 始终存在，开发模式只控制 UI。`debug.*` 提供渲染、健康和运行状态诊断，不是地图数据的详细等级开关。

## 无头 API

```powershell
node --no-warnings .\tools\webgl-generator-headless-api.mjs map.json info.mapSummary
node --no-warnings .\tools\webgl-generator-headless-api.mjs map.json analysis.compareRegions '[{"cells":[1,2]},{"cells":[3,4]}]'
```

无头 API 无 DOM、renderer、相机、下载、浏览器存储或历史，只读加载 JSON / gzip 并查询对象、cells、气候、地形、人口、planner 与区域分析。

## 当前标签页受控桥

运行 `pnpm run start:ai-bridge` 后，把终端显示的配对令牌输入开发面板“AI 调试”区并点击开启。主桥只在此时懒加载，只连接 `127.0.0.1:5412`，默认只读；外部使用 `tools/webgl-generator-ai-bridge-cli.mjs` 调用公开 API。写权限必须在页面可见开启，写请求必须携带 requestId 与 expectedRevision，高风险方法还需页面逐次批准。刷新可自动恢复连接，但必定降回只读并更换 pageSession；不会开放 Cookie、任意脚本、内部 map 或远程监听。

无头写入仍由第 228 项单独实现，不能以当前标签页桥冒充离线文件写入。

机器目录位于主仓库 `docs/generated/ai/`，由 `pnpm run sync:ai-docs` 生成，`pnpm run audit:ai-docs` 检查陈旧内容。
