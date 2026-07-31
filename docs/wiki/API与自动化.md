# API 与自动化

## 浏览器 API

页面内根对象是 `window.webglGeneratorApi`，`window.api` 为兼容别名。先调用：

```js
api.info.version()
api.info.capabilities()
api.info.mapSummary()
api.info.describe("edit.population.inspectAdjustment")
```

当前共有 16 个命名空间、309 个方法；每个方法有输入 / 输出 schema、稳定性、副作用、确认、业务 code 和示例。普通 API 始终存在，开发模式只控制 UI。`debug.*` 提供渲染、健康和运行状态诊断，不是地图数据的详细等级开关。

## 无头 API

```powershell
node --no-warnings .\tools\webgl-generator-headless-api.mjs map.json info.mapSummary
node --no-warnings .\tools\webgl-generator-headless-api.mjs map.json analysis.compareRegions '[{"cells":[1,2]},{"cells":[3,4]}]'
```

无头 API 无 DOM、renderer、相机、下载、浏览器存储或历史，只读加载 JSON / gzip 并查询对象、cells、气候、地形、人口、planner 与区域分析。调用当前浏览器标签页的受控桥和无头写入尚未实现。

机器目录位于主仓库 `docs/generated/ai/`，由 `pnpm run sync:ai-docs` 生成，`pnpm run audit:ai-docs` 检查陈旧内容。
