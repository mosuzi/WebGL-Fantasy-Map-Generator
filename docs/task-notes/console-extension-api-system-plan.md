# 控制台与扩展 API 系统计划

本文档记录“把不依赖 UI 的操作收束为统一 API 系统”的详细方案。目标是让运行时能力可以通过浏览器控制台、自动化脚本、未来 AI 助手或扩展插件稳定调用，而不是只能从 Vue 面板和 DOM 事件进入。

## 背景

当前应用已经有大量不依赖 UI 的能力：

- 生成地图、换 seed、受约束重算。
- 设置气候、单位、图层和视图偏好。
- 导出完整地图数据、GeoJSON、要素 GeoJSON、PNG、名称库、备注和测量结果。
- 执行编辑命令，例如国家、省份、城市、路线、河流、marker、标签、备注、测量、名称库和军事静态记录等。
- 选择、定位、高亮对象。
- 查询 runtime stats、health events、当前地图摘要和派生状态。

这些能力现在大多散落在 `runtime/app.js`、各 edit command、panel callback、导出 helper 和 Vue store 中。面板按钮能调用它们，但外部脚本和开发者控制台缺少统一入口。后续如果要接 AI、插件、自动化验收或批量操作，需要先把能力收束成清晰 API。

## 目标

新增运行时 API 根对象，建议暴露为：

```js
window.webglGeneratorApi
window.api // 开发便利别名，可配置是否开启
```

API 目标：

1. 把非 UI 操作从面板回调中抽出来，形成稳定命名空间。
2. 让控制台可以直接调用常见能力，例如：
   - `api.climate.setLatitude(37)`
   - `api.data.exportAll()`
   - `api.data.exportGEO()`
   - `api.selection.locate({kind: "state", id: 3})`
   - `api.edit.route.delete(12)`
3. 为 AI / 插件预留一个可枚举、可校验、可测试的能力表。
4. 通过 API 梳理副作用边界：哪些会写地图、哪些只读、哪些进入撤销栈、哪些触发派生重建、哪些只刷新渲染。
5. 保持 UI 面板可继续使用，但逐步改为调用 API 或与 API 共用同一 command 层，避免重复业务逻辑。

## 非目标

- 第一阶段不做远程 HTTP 服务。
- 第一阶段不做权限沙箱或第三方插件加载器。
- 第一阶段不承诺 API 永久稳定；稳定性等级应在接口元数据里标注。
- 不把 UI 组件实例直接暴露给外部调用。
- 不允许 API 绕过 `EditHistory` 直接改写可撤销编辑数据。
- 不把内部 typed array 或大型 map 对象裸暴露为可随意写入的公共数据源；读取可以提供快照或只读摘要。

## 命名空间草案

### `api.info`

只读查询：

- `api.info.version()`
- `api.info.mapSummary()`
- `api.info.runtimeStats()`
- `api.info.healthEvents(options)`
- `api.info.capabilities()`

用途：

- 控制台快速诊断当前地图状态。
- AI / 自动化先读取能力表和地图摘要，再决定下一步。

### `api.generate`

生成与受约束重算：

- `api.generate.newMap(options)`
- `api.generate.rerollSeed()`
- `api.generate.regenerate(kind, options)`
- `api.generate.getOptions()`
- `api.generate.setOptions(patch)`

约束：

- `newMap()` 和 `rerollSeed()` 是异步 API，返回 `{ok, mapSummary, timings}`。
- `regenerate(kind)` 只接受已存在的受约束重算类型，例如 `routes / rivers / cities / states / provinces / markers / diplomacy`。
- 修改生成 options 后不应立即隐式重生成，除非方法名明确表达生成行为。

### `api.climate`

气候配置：

- `api.climate.get()`
- `api.climate.setLatitude(value)`
- `api.climate.setLatitudeRange(percent)`
- `api.climate.setLongitudeRange(percent)`
- `api.climate.setTemperature({equator, northPole, southPole})`
- `api.climate.setWind(index, direction)`
- `api.climate.apply(patch, options)`

约束：

- 单项 setter 只改配置并触发当前已有的气候更新路径。
- 如果某项变更需要重算下游派生，应在返回值里标明 `derivedStale` 或由调用者显式调用重算。
- 参数使用用户可理解单位，不直接要求调用方写内部 `latT / lonT`。

### `api.units`

单位偏好：

- `api.units.get()`
- `api.units.setDistanceUnit(unit)`
- `api.units.setAreaUnit(unit)`
- `api.units.setPopulationScale(scale)`
- `api.units.setMilitaryScale(scale)`
- `api.units.apply(patch)`

约束：

- 只改变显示偏好，不改写地图内部原始数据。
- 返回当前 normalized preferences。

### `api.layers`

视图、图层和专题：

- `api.layers.get()`
- `api.layers.setVisible(layer, visible)`
- `api.layers.setViewMode(mode)`
- `api.layers.setTheme(themeId)`
- `api.layers.fitView()`

约束：

- 图层 API 只改显示状态和渲染，不改生成数据。
- 已退役图层例如 `tradeFlows` 应返回明确错误或 `ok: false`，不能被 API 恢复。

### `api.selection`

选择、定位和高亮：

- `api.selection.get()`
- `api.selection.select(object)`
- `api.selection.clear()`
- `api.selection.locate(object, options)`
- `api.selection.highlight(objects, options)`
- `api.selection.resolve(object)`

约束：

- `object` 使用统一对象标识：`{kind, id}`，必要时带 `targetKind / targetId`。
- `resolve()` 返回对象快照，不返回可直接改写的内部引用。
- 高亮可以是临时态，默认不进入撤销栈。

### `api.edit`

编辑命令统一入口。建议按对象分组：

```js
api.edit.state.rename(id, name)
api.edit.state.delete(id)
api.edit.province.addAtCell(gridCell)
api.edit.city.delete(id)
api.edit.route.delete(id)
api.edit.marker.addResource(type, point)
api.edit.note.set(object, body)
api.edit.measurement.delete(id)
```

通用约束：

- 所有会修改地图的 API 必须走 edit command 或等价命令对象。
- 默认进入 `EditHistory`。
- 返回统一 `ApiResult`，包含命令 label、受影响对象、是否 noop、是否触发派生刷新。
- 禁止直接在 API 中复制 UI callback 的零散逻辑；应把公共执行流程提取为 runtime helper。

建议第一批接入：

1. 已有命令且边界清晰的对象：备注、测量、标签、路线删除、marker、国家 / 省份 / 城市新增删除。
2. 再接颜色、命名、政体、继承关系、名称库绑定。
3. 最后接复杂刷子、导入和批量重算。

### `api.history`

撤销 / 重做：

- `api.history.stats()`
- `api.history.undo()`
- `api.history.redo()`
- `api.history.peek()`

约束：

- 与 UI 使用同一 `EditHistory`。
- 返回命令摘要和刷新结果。
- 后续全局撤销入口可直接复用这个命名空间。

### `api.data`

导入导出：

- `api.data.exportAll(options)`
- `api.data.exportMap(options)`
- `api.data.exportGEO(options)`
- `api.data.exportFeatureGEO(options)`
- `api.data.exportPNG(options)`
- `api.data.exportNotes(options)`
- `api.data.exportMeasurements(options)`
- `api.data.importMap(fileOrText, options)`
- `api.data.importGEO(fileOrText, options)`

命名说明：

- `exportAll()` 可以作为用户口中的“导出地图数据”别名，内部建议等价于完整 `.webgl-map.json` 导出。
- `exportMap()` 是更明确的完整地图 JSON 名称。
- `exportGEO()` 对应 pack cell GeoJSON。
- `exportFeatureGEO()` 对应 city / route / river / marker / zone / state / province 等要素 GeoJSON。

约束：

- 浏览器控制台调用默认触发下载，测试模式可传 `{download: false}` 返回字符串或 Blob。
- 导入 API 必须返回结构化错误详情，不能只写状态栏文本。
- 完整地图导入应明确是否替换当前地图、是否保留本地偏好、是否进入撤销栈。

### `api.namebases`

名称库：

- `api.namebases.list()`
- `api.namebases.import(document, options)`
- `api.namebases.export(options)`
- `api.namebases.create(payload)`
- `api.namebases.update(id, patch)`
- `api.namebases.delete(id)`
- `api.namebases.bind(scope, target, baseId)`
- `api.namebases.renameObjects(kind, ids, options)`

约束：

- 导入、编辑和绑定名称库不自动批量改写当前地图对象名称。
- 显式重命名必须进入 `EditHistory`。

当前状态：

- `api.namebases.list({includeSource})` 已完成只读快照第一刀，返回内置 / 用户名称库摘要、绑定目标、全局与文化绑定、绑定使用情况、无效绑定和汇总 metadata。
- `api.namebases.export({format, baseIds, includeUser, download, includeText})` 已完成只读导出第一刀，支持当前 JSON 名称库文档和原版文本两种格式；`baseIds` 可限制导出选中名称库，下载模式复用浏览器下载能力。
- `api.namebases.import(document, {mode, filename})` 已完成导入第一刀，支持当前 JSON 名称库文档对象、JSON 字符串和原版文本字符串；默认 append，`mode: "replace"` 时替换当前用户库，导入进入 `EditHistory`。
- `api.namebases.create(payload)`、`copyBuiltin(baseId)`、`update(id, patch)`、`delete(id)`、`clear({confirm:true})`、`bind(scope, target, baseId, options)` 和 `renameObjects(kind, ids, {confirm:true})` 已完成写入第一刀；名称库自身写入复用名称库 edit command、名称库面板刷新和本地偏好持久化，批量重命名对象复用既有城市 / 国家 / 河流 / 湖泊名称库重命名命令并进入 `EditHistory`；`create / update` 支持名称、样本和生成参数补丁；`clear` 和 `renameObjects` 必须显式传 `confirm:true`。
- 默认 `includeSource` 为 `false`，只返回示例与统计摘要，不回传完整 source；显式传 `includeSource: true` 时才返回名称库源词条副本。
- `list / export` 不进入 `EditHistory`，不修改名称库、绑定、地图 checksum 或面板状态；`import / create / copyBuiltin / update / delete / clear / bind` 会进入 `EditHistory`，但不自动批量改写当前地图对象名称；只有显式调用 `renameObjects(kind, ids, {confirm:true})` 时才会批量改写当前地图对象名称，当前支持 `state / city / river / lake`。

### `api.debug`

开发辅助：

- `api.debug.enable()`
- `api.debug.disable()`
- `api.debug.dumpState(options)`
- `api.debug.profileNextRender()`

约束：

- 只在 debug 模式或本地环境暴露高风险内部信息。
- 不提供可绕过数据契约的写入口。

## 统一返回格式

建议所有 API 返回 `ApiResult`：

```js
{
  ok: true,
  action: "edit.route.delete",
  message: "已删除路线 #12",
  data: {},
  affected: [{kind: "route", id: 12}],
  noop: false,
  warnings: [],
  errors: []
}
```

异步 API 返回 `Promise<ApiResult>`。

失败示例：

```js
{
  ok: false,
  action: "data.importMap",
  message: "地图文件版本不受支持",
  data: null,
  affected: [],
  noop: true,
  warnings: [],
  errors: [{code: "unsupported-version", detail: "version=3"}]
}
```

## 能力元数据

`api.info.capabilities()` 应返回可供 AI / 插件读取的描述：

```js
{
  version: 1,
  namespaces: {
    climate: {
      setLatitude: {
        stable: "draft",
        mutates: true,
        undoable: false,
        async: false,
        params: [{name: "value", type: "number", min: -90, max: 90}]
      }
    },
    data: {
      exportAll: {
        stable: "draft",
        mutates: false,
        undoable: false,
        async: true
      }
    }
  }
}
```

稳定性等级：

- `internal`：内部临时接口，不给 AI / 插件自动使用。
- `draft`：已命名但仍可能调整。
- `stable`：可作为脚本和扩展依赖。
- `deprecated`：保留兼容，但不建议新调用。

当前状态：

- `api.info.capabilities()` 保留原有 `methods` 数组以兼容旧脚本，同时新增 `safety.confirmRequiredMethods`、按命名空间分组的 `safety.confirmRequired` 和 `methodMetadata` 第一刀。
- 当前显式标注 `generate.regenerate / newMap / rerollSeed`、`data.importMap / importGEO`、`namebases.clear / renameObjects` 必须传 `confirm:true`；对应 `methodMetadata` 会记录 `mutates / undoable / async / requiresConfirm`，供 AI 或自动化脚本在调用前判断确认边界。浏览器验证已确认该元数据只读且不修改地图 checksum。
- selection 命名空间已从命名空间级 `readonly` 修正为 `selection-camera-and-editing-state`，并补齐方法级副作用元数据：`get / resolve` 不改变状态，`select / clear` 改选择态，`locate` 改相机与选择态，`pick` 改 pick 面板状态，`flash / highlight` 改临时闪烁态，`startEditing / stopEditing / toggleEditing` 改编辑态；这些方法均不要求 `confirm:true`，也不进入 `EditHistory`。
- layers / units 已补齐方法级副作用元数据：`layers.get` 与 `units.get` 不改变状态，`layers.setViewMode / setVisible / setTheme` 和所有单位写入只改显示偏好，`layers.fitView` 只改相机；因此 `sideEffects.layers` 已从 `display-preference` 修正为 `display-preference-and-camera-state`。这些方法均不要求 `confirm:true`，也不进入 `EditHistory`；浏览器验证已确认读取该元数据不修改地图 checksum。

## 安全与副作用边界

- 默认只在浏览器本地页面暴露，不做跨来源远程调用。
- 后续如果有插件系统，应按能力申请权限，例如 `data:export`、`edit:write`、`debug:read`。
- 会写地图的 API 必须：
  1. 走命令或专用事务 helper。
  2. 返回受影响对象。
  3. 触发统一刷新调度。
  4. 在需要时更新 `docs/development-log.md` 对应功能计划，而不是静默改变产品语义。
- 只读 API 不应返回可被外部直接修改的内部数组引用；如确需高性能读取，应明确标注 `internal`。

## 与 UI 的关系

目标不是让 API 替代 UI，而是让 UI 和 API 共享业务入口：

1. 第一阶段：API 包装现有 runtime helper 和 edit command，UI 继续走原 callback。
2. 第二阶段：把重复 callback 逻辑抽成 `executeApiCommand()` / `executeRuntimeAction()` 之类公共 helper。
3. 第三阶段：面板按钮可直接调用 API 层或 API 底下的同一 action 层。

这样可以避免“控制台能做一套、UI 又做一套”的分叉。

## 分阶段实施

### 阶段 0：API 方案和能力盘点

- 完成本文档。
- 列出第一批应接 API 的现有 helper / command。
- 确认哪些功能只读、哪些写数据、哪些异步、哪些需要撤销。

验收：

- 文档列清命名空间、返回格式、副作用约束和阶段计划。
- `docs/current-plan.md` 和 `docs/development-log.md` 同步记录。

### 阶段 1：API 根对象与只读能力

- 新增 `runtime/api/` 或 `runtime/console-api.js`。
- 暴露 `window.webglGeneratorApi`，debug 或开发环境下暴露 `window.api` 别名。
- 接入：
  - `api.info.mapSummary()`
  - `api.info.runtimeStats()`
  - `api.info.capabilities()`
  - `api.selection.get()`
  - `api.layers.get()`

验收：

- 控制台可读取 API。
- 只读 API 不改变 checksum。
- 生产构建可用，且没有 console error。

当前状态：

- 已完成第一刀运行时代码实现。
- 新增 `app/webgl-generator/src/runtime/api-result.js` 和 `app/webgl-generator/src/runtime/console-api.js`，并在 app ready 后安装 `window.webglGeneratorApi`。
- 已接入 `api.info.version()`、`api.info.mapSummary()`、`api.info.runtimeStats()`、`api.info.healthEvents()`、`api.info.capabilities()`、`api.selection.get()` 和 `api.layers.get()`。
- `api.info.healthEvents({limit, severity})` 返回最近 health monitor 事件、级别计数和筛选信息；`severity` 支持 `info / warn / warning / error / all`，`limit` 限制在 `1-180`。
- 当前 API 只返回 JSON 快照摘要，不暴露内部 `state.map`、typed array 或可直接写入的对象引用。
- 浏览器烟测已确认只读 API 调用前后 checksum 不变。

### 阶段 2：导出 API 第一刀

- 接入：
  - `api.data.exportAll({download})`
  - `api.data.exportGEO({download})`
  - `api.data.exportFeatureGEO({download})`
  - `api.data.exportPNG(options)`

验收：

- `{download: false}` 返回文本 / Blob，可被脚本断言。
- `{download: true}` 复用现有下载能力。
- GeoJSON 结构与 UI 导出一致。

当前状态：

- 已完成第一刀运行时代码实现。
- `api.data.exportAll({download: false})` 返回完整地图 JSON 文本、文件名、MIME、字节数和文档元数据。
- `api.data.exportMap(options)` 已作为完整地图 JSON 的明确别名接入，当前等价于 `exportAll(options)`。
- `api.data.exportCompressedAll({download: false})` 返回 gzip base64、压缩前后字节数、文件名、MIME 和文档元数据；该方法返回 Promise。
- `api.data.exportGEO({download: false})` 返回 pack cell GeoJSON 文本、文件名、MIME、字节数和 feature 摘要。
- `api.data.exportFeatureGEO({download: false, layers, dissolvePolitical})` 返回要素 GeoJSON 文本，支持调用方覆盖图层集合和政治面 dissolve 选项。
- `api.data.exportPNG({download: false, pixelScale, includeMapOverlays})` 返回 PNG data URL、尺寸、字节数和文件元数据；该方法返回 Promise。
- GeoJSON / JSON 方法支持 `download: true` 复用现有浏览器下载；下载模式默认不返回大文本，调用方可显式传 `includeText: true`。
- 压缩地图 JSON 方法支持 `download: true` 复用现有浏览器下载；下载模式默认不返回 base64，调用方可显式传 `includeBase64: true`。
- PNG 方法支持 `download: true` 复用现有浏览器下载；下载模式默认不返回 data URL，调用方可显式传 `includeDataUrl: true`。
- 浏览器烟测已确认三类文本导出可解析、压缩地图可解回完整文档、PNG data URL 文件头尺寸正确、checksum 不变，且 `download:true` 能触发 `.features.geojson`、`.webgl-map.json.gz` 和 `.png` 下载。
- 完整地图导入 API 已完成第一刀。
- `api.data.importMap(document, {confirm:true})` 支持当前 `.webgl-map.json` 文档对象和 JSON 字符串，复用 `parseMapDocument()`、`loadMapIntoRuntime()`、生成输入同步、视觉主题恢复和名称库偏好持久化路径。
- 返回值包含导入后的地图摘要、生成配置、源文档 metadata、加载 timings、名称库偏好持久化结果和历史摘要；因为会替换当前地图并清空编辑历史，必须显式传 `confirm:true`。
- `importMap` 已补齐 File / Blob、`{encoding:"gzip-base64", data}` 和 `api.data.exportCompressedAll({download:false})` 返回对象输入支持；gzip 输入复用 `DecompressionStream` 解压，仍走同一完整地图导入路径。
- 当前 `importMap` 不接 GEO 导入；GEO 仍由 `api.data.importGEO()` 单独处理。
- GEO 导入 API 已完成第一刀。
- `api.data.importGEO(document, {confirm:true})` 支持 GeoJSON 字符串或对象；FMG Cells GEO 复用 `createImportFmgCellsHeightCommand()` 导入地形并重置非 GEO 派生数据，普通 GeoJSON 复用测量对象导入命令写入 measurements。
- `api.data.exportNotes({ids, noteIds, download, includeText})` 已完成第一刀，复用备注摘要 JSON 格式，默认返回文本，可按备注 id 筛选或触发浏览器下载。
- `api.data.exportMeasurements({ids, measurementIds, download, includeText})` 已完成第一刀，复用测量对象 JSON 格式，默认返回文本，可按测量对象 id 筛选或触发浏览器下载。
- 返回值会按分支标注 `mode = fmg-cells-terrain / measurements`，并返回地形导入 summary / reset 或测量对象导入数量；因为两类导入都会写当前地图，必须显式传 `confirm:true`。

### 阶段 3：气候、单位和图层 API

- 接入：
  - `api.climate.get() / apply() / setLatitude()`
  - `api.units.get() / apply()`
  - `api.layers.setVisible() / setViewMode()`

验收：

- 控制台修改后 UI 控件同步。
- 显示偏好不写回地图生成数据。
- 气候修改的派生 stale 语义明确。

当前状态：

- 图层 API 已完成第一刀。
- `api.layers.setViewMode(mode)` 会校验页面已有 `data-mode`，同步 active 按钮、本地显示偏好和 renderer color mode。
- `api.layers.setVisible(layer, visible)` 会校验 renderer 已知图层，同步 UI 控件、本地显示偏好和 renderer layer visibility。
- `api.layers.setTheme(themeId)` 会校验内置视觉主题，同步控制面板偏好和 renderer visual theme。
- `api.layers.fitView()` 复用 renderer `fitToView()`，返回适配后的 camera 快照和图层快照。
- 本步只改显示偏好，不改变地图数据或 checksum。
- 单位 API 已完成第一刀。
- `api.units.get()` 返回当前标准化单位偏好。
- `api.units.apply(preferences)` 使用 `normalizeUnitPreferences()` 校准输入，同步单位控件、本地显示偏好和 renderer unit preferences。
- 便捷 setter 已补齐：`setDistanceUnit(unit)`、`setAreaUnit(unit)`、`setNumberAbbreviation(mode)`、`setMapScale(kmPerCm)`、`setPopulationScale(scale)`、`setMilitaryScale(scale)` 和 `setPrecipitationScale(scale)` 均复用 `apply()` 的规范化与同步路径。
- 当前控制面板仍把面积单位视为距离单位派生值；`setAreaUnit(unit)` 只接受当前距离单位对应的面积单位，避免脚本写入会被 UI 规范化吞掉的混合单位组合。
- 单位 API 只改显示偏好，不改变地图数据或 checksum。
- 气候 API 已完成读写补齐。
- `api.climate.get()` 默认返回 `options / temperature / precipitation / latitude / atmosphere / biomes` 分区摘要，也可传 `temperature / precipitation / latitude / atmosphere / biomes / options` 只读单一分区。
- 新增细分读取：`getOptions()`、`getTemperature()`、`getPrecipitation()`、`getLatitude()`、`getAtmosphere()`、`getBiomes()`。
- 新增写入：`apply(patch)`、`setLatitude(value)`、`setLatitudeRange(percent)`、`setLongitudeRange(percent)`、`setTemperature({equator, northPole, southPole})`、`setPrecipitation(scale)`、`setWind(index, direction)`。
- 写入 API 直接接收用户可理解参数并绕开 UI 表单限制，随后同步控件、重算当前地图气候与生物群系，并返回 `changed / options / climate / derivedStale / checksum`。
- 气候写入会标记城市、国家、省份、宗教、marker、zone、军事、经济、外交等下游派生 stale；当前不进入 `EditHistory`，后续若要撤销气候配置应单独设计配置命令。

### 阶段 4：编辑命令 API 第一刀

- 先接最稳定的命令：
  - 备注 set/delete。
  - 测量 rename/delete。
  - 标签 add/delete/restore。
  - 路线 delete。
  - marker add/delete/move。

验收：

- 每个命令都进入 `EditHistory`。
- `api.history.undo()` / `redo()` 可恢复。
- 面板打开时能同步刷新。

当前状态：

- 已完成第一刀。
- `api.history.get()`、`api.history.undo()` 和 `api.history.redo()` 已接入 app action，复用当前 `EditHistory` 和刷新路径。
- `api.history.stats()` 已作为 `get()` 的明确别名补齐；`api.history.peek()` 返回 undo / redo 栈顶命令摘要、影响对象和 effects 标记，只读不执行命令。
- `api.edit.notes.set(object, body, {name})` 和 `api.edit.notes.delete(noteId, {name})` 已接入对象备注 / 备注删除 edit commands、`executeEditCommand()` 和 `refreshPanelsForEdit()`。
- `api.edit.measurements.save(points, {name, routeFit})`、`api.edit.measurements.rename(id, name)`、`api.edit.measurements.updatePoints(id, points, {routeFit})` 和 `api.edit.measurements.delete(id)` 已接入测量对象 edit commands。
- `api.edit.cities.add(gridCell)` 和 `api.edit.cities.delete(cityId)` 已接入城市 collection edit commands。
- `api.edit.cities.rename(cityId, name)` 和 `api.edit.cities.setPopulation(cityId, population)` 已接入城市单对象 edit commands。
- `api.edit.provinces.add(gridCell)` 和 `api.edit.provinces.delete(provinceId)` 已接入省份 collection edit commands。
- `api.edit.provinces.rename(provinceId, name)` 和 `api.edit.provinces.setColor(provinceId, color)` 已接入省份单对象 edit commands。
- `api.edit.states.add(gridCell)` 和 `api.edit.states.delete(stateId)` 已接入国家 collection edit commands。
- `api.edit.states.rename(stateId, name)`、`api.edit.states.setColor(stateId, color)` 和 `api.edit.states.setGovernment(stateId, governmentKey)` 已接入国家单对象 edit commands。
- `api.edit.cultures.add({name})`、`api.edit.cultures.delete(cultureId)`、`api.edit.cultures.rename(cultureId, name)`、`api.edit.cultures.setColor(cultureId, color)` 和 `api.edit.cultures.setParent(cultureId, parentId)` 已接入文化 edit commands；删除仍只允许空文化。
- `api.edit.religions.add({name})`、`api.edit.religions.delete(religionId)`、`api.edit.religions.rename(religionId, name)`、`api.edit.religions.setColor(religionId, color)` 和 `api.edit.religions.setParent(religionId, parentId)` 已接入宗教 edit commands；删除仍只允许空宗教。
- `api.edit.routes.delete(routeId)` 已接入路线删除 edit command。
- `api.edit.routes.setNote(routeId, body, {name})` 已接入路线备注 edit command。
- `api.edit.rivers.rename(riverId, name)`、`api.edit.rivers.setWidthFactor(riverId, widthFactor)` 和 `api.edit.rivers.setNote(riverId, body, {name})` 已接入河流单对象 edit commands。
- `api.edit.lakes.rename(lakeId, name)` 已接入湖泊单对象重命名 edit command。
- `api.edit.labels.addCustom({text, x, y})`、`api.edit.labels.delete(label)`、`api.edit.labels.moveCustom(labelId, {x, y})`、`api.edit.labels.renameCustom(labelId, text)`、`api.edit.labels.setNote(label, body, {name})` 和 `api.edit.labels.restore(label)` 已接入标签 edit commands，覆盖手工标签新增 / 删除 / 移动 / 重命名、标签备注和生成标签恢复。
- `api.edit.markers.add({type, packCell, name})`、`api.edit.markers.delete(markerId)`、`api.edit.markers.move(markerId, packCell)`、`api.edit.markers.setNote(markerId, body, {name})` 和 `api.edit.markers.setVisual(markerId, patch)` 已接入 marker collection / field edit commands。
- 浏览器烟测已覆盖备注删除、撤销和重做。
- 浏览器烟测已覆盖测量对象重命名、删除、撤销删除和重做删除。
- 浏览器烟测已覆盖城市新增 / 撤销 / 重做，以及城市删除 / 撤销删除。
- 浏览器烟测已覆盖省份新增 / 撤销 / 重做，以及省份删除 / 撤销删除；记录一次省份 collection 编辑 long-task。
- 浏览器烟测已覆盖国家新增 / 撤销 / 重做，以及国家删除 / 撤销删除。
- 浏览器烟测已覆盖路线删除、撤销和重做。
- 浏览器烟测已覆盖手工标签删除、撤销 / 重做，以及生成城市标签恢复 / 撤销。
- 浏览器烟测已覆盖 marker 移动 / 撤销移动，以及 marker 删除 / 撤销 / 重做。
- 浏览器烟测已覆盖 marker 新增 / 撤销 / 重做和新建对象 selection。
- `api.selection.resolve(object)`、`api.selection.select(object)`、`api.selection.clear()` 和 `api.selection.locate(object, {padding, minScale, maxScale})` 已接入；locate 返回定位后的 camera 和 locateStatus。
- 浏览器烟测已覆盖城市对象 resolve / select / clear / locate，以及不存在对象的结构化错误。
- `api.selection.pick(clientX, clientY)` 已接入 renderer `pickClientPoint()`，浏览器烟测已覆盖中心点拾取和非法坐标错误。
- `api.selection.flash(object)` 已完成第一刀，并提供 `api.selection.highlight(object)` 同义入口；当前复用 selection store 与 renderer `startLocateFlash()`，支持单对象临时闪烁。
- `api.selection.highlight(objects, options)` 已补齐显式语义边界：单对象或单元素数组走单对象临时闪烁，多对象数组返回结构化失败，提示当前 renderer 尚不支持多对象高亮。
- `api.selection.startEditing(object, {select})`、`stopEditing({ifKind})` 和 `toggleEditing(object, {select})` 已完成第一刀；当前复用运行时编辑态 helper，只控制 selection / editingObject 与编辑交互锁，不执行数据编辑命令。
- 多对象高亮暂缓；当前 renderer 仍没有独立于 selection 的多对象高亮态入口，后续需要单独设计高亮生命周期。

### 阶段 5：生成、导入和批量能力

- 接入地图生成、换 seed、受约束重算、完整地图导入、GEO 导入。
- 统一异步状态、错误详情和 health 记录。

验收：

- 自动化脚本可用 API 完成“生成地图 -> 导出 -> 导入 -> 校验”的闭环。
- 长任务和错误能进入 health monitor 或结构化返回。

当前状态：

- 受约束重算 API 已完成第一刀。
- `api.generate.regenerate(kind, {confirm:true})` 支持 `routes / rivers / cities / states / provinces / markers / diplomacy` 及常见别名，复用现有控制面板的受约束重算路径。
- 返回值包含 `kind / action / status / constraint`、重算前后对象计数、当前 `staleSystems` 和历史摘要；其中 marker / diplomacy 继续复用既有命令或历史路径，其它派生重算暂保持现有非撤销语义。
- 地图生成 API 已完成第一刀。
- `api.generate.getOptions()` 返回当前规范化生成配置和当前地图摘要。
- `api.generate.setOptions(patch)` 会规范化并同步生成配置与主输入，不隐式生成新地图。
- `api.generate.newMap(options)` 和 `api.generate.rerollSeed(options)` 复用 worker 生成和 `loadMapIntoRuntime()`，返回生成配置、地图摘要、生成 / 加载 timings 和历史摘要。
- 为避免脚本误触大范围派生重建或替换当前地图，`regenerate / newMap / rerollSeed / importMap / importGEO` 必须显式传 `confirm:true`；备注与测量导出属于只读下载 / 文本返回能力，不进入撤销栈，也不修改 checksum。

### 阶段 6：debug 诊断 API

- debug API 已完成第一刀。
- `api.debug.enable()` 和 `api.debug.disable()` 已完成第一刀，复用现有开发模式面板与 `webgl-generator-debug-change` 事件，只控制调试 UI 和 debug 行显示，不修改地图数据、health 阈值或 health 事件。
- `api.debug.snapshot({limit, severity})` 返回当前页面、地图、图层 / 单位偏好、选择、历史、renderer 摘要和 health 摘要，供脚本或 AI 快速判断运行时状态。
- `api.debug.dumpState({includeCapabilities, includeRendererStats})` 返回可复制的诊断转储，默认包含 snapshot 和 capabilities，可选附带完整 renderer stats；该入口不暴露原始 `state.map` 或 typed array。
- `api.debug.renderer()` 返回完整 renderer stats，便于定位 WebGL、camera、动态 mesh、draw 和 loadMap 状态。
- `api.debug.health({limit, severity})` 返回 health 事件、阈值、存储 key 和当前 operation。
- `api.debug.profileNextRender({updateDynamicBuffers, updateOverlay, drawDirtyDynamicBuffers})` 会强制执行一次 renderer draw，并返回前后 draw stats、动态 mesh cache 和 API 侧总耗时。
- 本阶段为诊断与调试 UI 能力，不修改地图数据、显示偏好或 health 存储；清理 health 事件、写入 debug delay 等破坏性或会改变运行节奏的能力暂不暴露。

## 第一批代码落点建议

- `app/webgl-generator/src/runtime/console-api.js`：创建 API 根对象。
- `app/webgl-generator/src/runtime/api-result.js`：统一返回格式 helper。
- `app/webgl-generator/src/runtime/app.js`：在 app 创建完成后安装 API，并传入 state、renderer、documentRef 和现有 action helper。
- `tools/`：后续可补浏览器脚本验证 API 是否存在并执行只读 / 导出断言。

## 风险

- API 太早承诺稳定，会限制内部重构；需要稳定性等级。
- 直接暴露 `state.map` 会导致外部脚本绕过命令系统乱改数据；必须优先提供只读快照。
- UI 和 API 两套逻辑分叉会产生不一致；应逐步抽公共 action 层。
- 导入 / 生成类异步 API 如果不统一状态，会和当前 loading bubble、panel refresh、health monitor 互相打架。
- AI 调用 API 时可能误触破坏性操作；后续需要 dry-run、confirm 或权限模型。

## 建议下一步

阶段 2 第一刀已完成。下一步建议继续阶段 4：

1. 继续编辑 API，接国家 / 省份 / 城市的名称、颜色、人口等已有单对象命令。
2. 进入生成 / 导入类 API 前，先明确异步状态、loading、health 和导入错误返回格式。

无论选择哪条路线，仍应优先保证返回格式结构化、错误可诊断、checksum 边界清晰，并用浏览器烟测覆盖。
