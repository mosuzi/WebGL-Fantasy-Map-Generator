# API 与自动化

项目提供四种自动化入口。它们共享方法契约和领域规则，但拥有不同的运行环境与写入权限。选择入口时先判断目标是“操作当前页面”“离线分析文件”“让外部工具连接当前标签页”，还是“受控修改离线文件”。

## 入口选择

| 入口 | 适合任务 | 浏览器画面 | 默认写权限 | 文件行为 |
|---|---|---:|---:|---|
| 浏览器 API | 查询或操作当前打开的地图、图层、相机、下载和历史 | 有 | 按方法契约 | 使用当前页面地图 |
| 无头只读 API | 批量读取存档、对象查询、区域分析 | 无 | 无 | 读取输入，不覆盖 |
| 当前标签页受控桥 | 让本机外部 AI / CLI 调用当前页面的公开 API | 有 | 只读，需页面另行开启 | 使用当前页面地图 |
| 无头写入会话 | 离线人口调整、高度选区平滑、对象重命名 | 无 | 六个 inspect / apply 方法 | 默认写到新文件 |

不要用远程调试端口、任意 JavaScript 或内部 `map` 字段写入代替这些入口。

## 浏览器 API

正式根对象是：

```js
const api = window.webglGeneratorApi;
```

`window.api` 是旧开发便利别名，只会在该全局名没有被其它脚本占用时安装。新脚本应始终使用 `window.webglGeneratorApi`。

先发现版本、能力和地图身份：

```js
api.info.version();
api.info.capabilities();
api.info.mapSummary();
api.info.describe("edit.population.inspectAdjustment");
```

当前浏览器 API 有 18 个命名空间、322 个方法。`info.describe()` 是逐方法输入 / 输出 schema、稳定性、副作用、确认要求、业务 code 和示例的权威入口；不要从 Wiki 或旧日志猜参数。`grid` 命名空间提供结构摘要、克隆快照、写入 / 细分预检和带确认的事务执行，禁止直接持有运行时网格数组。

### 返回结构

公开方法统一返回 `ApiResult`：

```js
{
  ok: true,
  data: {},
  metadata: {method: "info.mapSummary", runtime: "browser"}
}
```

失败时 `ok` 为 `false`，`error` 包含稳定 code、阶段、说明和必要建议。调用方先判断 `ok`，不要把抛异常、空数组和规则拒绝混为一类。

### 只读示例

```js
const summary = api.info.mapSummary();
const states = api.objects.list("state", {limit: 20});
const layers = api.layers.get();
```

对象查询、cell 查询和分析不会因开发模式关闭而消失。开发模式只显示额外 UI；`debug.*` 是 renderer、health 和运行状态诊断，不是解锁地图事实的权限开关。

### 页面控制示例

```js
api.layers.setTheme("atlas");
api.layers.setViewMode("states");
api.layers.setVisible("stateBorders", true);
api.layers.fitView();
```

图层和相机操作改变页面状态，但不改变地图数据 checksum。PNG 下载、浏览器存档、selection 和 history 只在浏览器运行时可用。

### 写入原则

写入前先读取方法描述并调用同领域 `inspect*`。高影响方法要求显式 `confirm`；需要 inspection token 或 expected revision 的事务必须消费与当前地图、当前参数匹配的预检结果。成功后检查 revision、history、affected 和 `derivedStale`，失败时地图与历史应保持原样。

完整安全流程见 [编辑器与安全修改](编辑器与安全修改)。

## 无头只读 API

Node CLI 可以直接读取完整 JSON、gzip 和 `.webfmg`：

```powershell
node --no-warnings .\tools\webgl-generator-headless-api.mjs .\map.webfmg info.mapSummary
node --no-warnings .\tools\webgl-generator-headless-api.mjs .\map.webfmg objects.list '["state",{"limit":20}]'
node --no-warnings .\tools\webgl-generator-headless-api.mjs .\map.webfmg analysis.describeRegion '[{"kind":"state","id":3}]'
```

第三个参数始终是“参数数组”的 JSON。标准输出只有一行 JSON，便于 PowerShell、Node 或其它程序解析。metadata 会标记 `runtime=headless`、method、sourceChecksum 和 `mutates=none`。

无头只读运行时没有 DOM、renderer、相机、浏览器存储、下载和编辑历史。请求环境专属方法时会返回 `runtime_capability_unavailable`，不会伪造结果或静默隐藏方法。加载和分析只在内存中迁移旧图，不覆盖输入文件。

## 当前标签页受控桥

启动只监听本机回环地址的桥：

```powershell
pnpm run start:ai-bridge
```

终端会显示一次配对令牌。用户在当前地图页打开开发模式，在“AI 调试”区输入令牌并点击开启后，主桥才会懒加载并连接 `127.0.0.1:5412`。外部 CLI 示例：

```powershell
node --no-warnings .\tools\webgl-generator-ai-bridge-cli.mjs status --token <令牌>
node --no-warnings .\tools\webgl-generator-ai-bridge-cli.mjs call info.mapSummary '[]' --token <令牌>
```

桥默认只读。写请求还要求页面可见地开启本次地图写权限、唯一 requestId 和 expectedRevision；高风险方法会停在页面等待逐次批准。刷新后可恢复仍有效的连接，但必定回到只读并生成新的 pageSession，旧写权限和待确认请求不会继承。

桥不读取 Cookie、其它标签页、任意 LocalStorage、内部 map，也不监听局域网或公网。令牌不要放进 Wiki、截图、日志或 shell 历史。

## 无头安全写入

离线写入使用独立会话，当前只开放人口调整、高度选区平滑和对象重命名三组 inspect / apply，共六个方法。每次 apply 必须匹配：

- `documentId`
- `expectedRevision`
- `inspectionToken`
- 唯一 `requestId`

示例流程：

```powershell
$inspection = node --no-warnings .\tools\webgl-generator-headless-write.mjs inspect .\input.webfmg edit.objects.inspectRename '[{"kind":"city","id":12},"新名称"]' | ConvertFrom-Json
node --no-warnings .\tools\webgl-generator-headless-write.mjs apply .\input.webfmg .\output.webfmg edit.objects.applyRename '[{"kind":"city","id":12},"新名称"]' --document-id $inspection.data.documentId --expected-revision $inspection.data.revision --inspection-token $inspection.data.inspectionToken --request-id rename-city-12-v1
node --no-warnings .\tools\webgl-generator-headless-write.mjs verify .\output.webfmg
```

上例首条命令中的参数应是合法 JSON 参数数组；复制时请移除任何聊天或终端自动加入的额外字符。默认输出必须是不存在的新路径，输入文件哈希保持不变；只有同时提供 `--overwrite --confirm-overwrite OVERWRITE` 才允许覆盖，这不是推荐工作流。命令或派生重建失败会恢复整个文档、revision、幂等记录和历史。

## 机器目录与审计

`docs/generated/ai/` 包含 manifest、逐方法目录、配方目录和领域能力映射，由当前 registry 生成：

```powershell
pnpm run sync:ai-docs
pnpm run audit:ai-docs
pnpm run audit:wiki
```

Wiki 解释概念与工作流，机器目录负责精确 schema。两者的能力路由见 [能力覆盖矩阵](能力覆盖矩阵)。
