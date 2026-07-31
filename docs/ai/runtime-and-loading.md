# 运行时与地图加载

## 浏览器运行时

页面内使用 `window.webglGeneratorApi`。先调用 `info.version()`、`info.capabilities()`、`info.mapSummary()`；用 `info.describe(method)` 获取输入输出 schema、业务 code、副作用、确认与稳定等级。`window.api` 只是兼容别名。需要当前 selection、相机定位、画面导出、浏览器保存或编辑事务时才选择浏览器运行时。

浏览器 API 依赖 BrowserRuntimeHost 所持有的 document、renderer、相机、下载、历史和 UI action。普通只读数据并不要求开启开发模式；`debug.enable()` 只打开开发 UI，`debug.snapshot / dumpState / renderer / health` 返回运行与渲染诊断，不是地图事实的唯一来源。

## 无头运行时

Node 模块：

```js
import {readFile} from "node:fs/promises";
import {createHeadlessMapApi, loadHeadlessMapDocument} from "./app/webgl-generator/src/runtime/headless-map-api.js";

const document = loadHeadlessMapDocument(await readFile("map.webgl-map.json", "utf8"));
const api = createHeadlessMapApi(document);
console.log(api.info.mapSummary());
```

CLI：

```powershell
node --no-warnings .\tools\webgl-generator-headless-api.mjs .\map.webgl-map.json info.mapSummary
node --no-warnings .\tools\webgl-generator-headless-api.mjs .\map.webgl-map.json.gz analysis.describeRegion '[{"kind":"state","id":3}]'
```

CLI 的第三个参数始终是“参数数组”的 JSON。输出永远是一行 JSON；成功为 `{ok:true,data,metadata}`，失败为 `{ok:false,error,metadata}`。metadata 包含 `runtime=headless`、method、sourceChecksum 和 `mutates=none`。

## 格式、迁移与不变性

- 支持完整地图 JSON、`.json.gz` 和模块入口的 `gzip-base64` payload。
- 加载统一经过 `parseMapDocument / migrateMapDocument`，恢复 typed array 并执行 v1→v2 迁移与兼容归一化。
- 无头运行时不访问 DOM、renderer、相机、浏览器存储或网络，不创建历史，也没有任何写方法。
- 读取前后应比较输入文件哈希或地图 checksum；分析不能改变原文件。
- 旧图归一化是内存读取兼容，不等于已经覆盖旧文件。

## 选择建议

仅分析存档时优先无头；需要观察画面或实际编辑时用浏览器；需要把外部 AI 连接到当前标签页时报告“受控桥尚未实现”，不要退化为远程调试浏览器。

