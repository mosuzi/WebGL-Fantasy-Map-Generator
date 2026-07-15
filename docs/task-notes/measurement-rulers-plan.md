# 测量对象与路线贴合计划

## 背景

当前 WebGL 版测量工具已经支持临时折线测距、闭合面积、测量 JSON 导出、节点拖拽、撤销、删除、线段插入，以及把临时测量保存为 `map.measurements.items` 中的持久测量对象。测量对象会随完整地图 JSON 保存，已有独立浮层支持总览、筛选、排序、定位、重命名、删除、导出和撤销/重做；保存对象也已接入“测量”图层只读显隐，并可复用临时测量节点拖拽、删除和插入能力进行第一刀形状编辑。路线贴合、`cellStops` 持久化、沿道路自动补中间节点、曲线尺连续采样、稳定点列简化和可选平滑闭合均已完成，完整地图导出再导入由固定回归脚本覆盖。

原版 FMG 的测量系统位于 `source/Fantasy-Map-Generator/public/modules/ui/measurers.js` 和 `source/Fantasy-Map-Generator/public/modules/ui/units-editor.js`。原版不是单一临时折线，而是 `Rulers.data` 集合，包含 `Ruler`、`Opisometer`、`RouteOpisometer` 和 `Planimeter` 四类对象，并通过 `toString()` / `fromString()` 序列化到存档字段。

## 原版行为摘录

- `Ruler`：直线/折线尺，点列可拖动，点击线段可插入控制点，点击控制点可删除；长度按折线段累加。
- `Opisometer`：曲线尺，通过拖拽连续采样点，结束时默认优化过密点；按住 `Shift` 可跳过优化。
- `RouteOpisometer`：路线尺，以 `Routes.isConnected(cell)` 判断是否贴合道路/路线 cell；默认只能沿已连接路线延伸，按住 `Shift` 允许离开道路。
- `Planimeter`：面积尺，使用闭合 Catmull-Rom 曲线和多边形面积计算，标签放在 `polylabel` 求得的内部点。
- 原版 `Rulers.toString()` 以 `Type: x,y x,y; Type: x,y x,y` 的字符串保存，加载时再按类型重建对象。

## WebGL 版建议数据契约

后续不要直接把当前 `state.measurement.points` 变成长期数据。建议新增 `map.measurements`：

```json
{
  "version": 1,
  "items": [
    {
      "id": "measurement-1",
      "type": "polyline",
      "name": "测量 1",
      "points": [{"x": 0, "y": 0}],
      "closed": false,
      "routeFit": "none",
      "cellStops": [],
      "createdAt": "2026-07-02T00:00:00.000Z",
      "updatedAt": "2026-07-02T00:00:00.000Z"
    }
  ]
}
```

字段建议：

- `type`：`ruler`、`curve`、`route`、`area`，也可先用 `polyline / polygon` 两类简化。
- `points`：地图世界坐标点列；导入导出时保持浮点，显示时再按单位格式化。
- `closed`：是否闭合计算面积。
- `routeFit`：`none`、`roads`、`freehand`；路线贴合第一刀可只支持 `roads` 与 `none`。
- `cellStops`：路线贴合对象记录每个测量点吸附到的 `routeId / routeType / segmentIndex / packCell / x / y`；它用于后续路线尺细化，但不应作为唯一来源，完整导入后若 pack 重新生成，需允许从 `points` 回退。
- `summary.displayPointCount`：贴路对象按 `cellStops` 展开路线中间点后的显示/计量点数；不是用户控制点数量。

## 阶段计划

### 阶段 1：保存临时测量为对象

状态：已完成 `routeFit`、`cellStops` 和沿道路补中间节点第一刀。

- 测量 readout 已增加“保存 / 对象”入口。
- 保存时会把当前临时点复制进 `map.measurements.items`，并生成名称、id、长度/面积摘要和时间戳。
- 已新增“测量对象”浮层，列出已保存测量，支持定位、删除、重命名、导出和撤销/重做。
- 完整地图 JSON 会保存 `map.measurements`；已补 `pnpm run regress:measurement` 作为固定回归烟测，覆盖完整地图导出再导入后的测量对象数量、点列、`routeFit` 和 overlay。

验收：

- 保存对象后清空临时测量，不影响已保存对象。
- 完整地图导出再导入后，测量对象数量、点列、名称和面积/长度摘要一致。已通过固定回归脚本覆盖第一刀，其中包括 `roads / none` 两种模式。
- 普通模式下只显示用户可理解的长度/面积；开发模式下可显示 id、点数、cellStops 等内部信息。

### 阶段 2：图层化与对象编辑

- 新增“测量”图层，控制所有已保存测量对象显隐。已完成第一刀。
- 对已保存对象复用当前节点拖拽、删除、插入逻辑。已完成第一刀。
- 临时测量和已保存测量使用同一套几何计算 helper，但状态分离。

验收：

- 测量图层关闭后保存对象不显示，但数据仍在。已通过构建产物烟测验证。
- 编辑已保存对象会更新 `updatedAt` 和摘要，并可撤销/重做。已通过构建产物烟测验证。

### 阶段 3：路线贴合

状态：已完成第一刀。

- 已从现有 `settlements.routes` 的 `points / packCells` 建立懒加载轻量索引，按当前地图对象缓存路线线段。
- 测量 readout 新增“自由 / 贴路”切换；贴路模式下点击必须命中现有路线折线附近，否则不会新增点，并会在测量浮条提示“贴路测量需要点击道路附近”。
- 贴路模式下点击和拖拽节点都会吸附到最近路线线段投影点；保存对象会写入 `routeFit: "roads"`，对象面板显示“模式”，批量导出也保留该字段。
- 贴路对象会为每个吸附点保存 `cellStops`，完整地图导出再导入后仍能保留路线点数量；自由测量对象不写路线点。
- 同一路线上的相邻停靠点会在显示和计量时自动补入中间 route vertices；用户仍只编辑控制点，自动补点不会变成可拖拽节点。
- 自由模式保持原折线测量行为，不强制贴合路线。route 数据缺失或离路线过远时，用户可切回自由模式继续测量。
- 跨路线或 route 数据缺失时，贴路测量会退回控制点直连，避免导入旧地图时报错。

验收：

- 在道路附近绘制路线尺时，点列沿道路/城镇路线延伸。
- 按自由测量模式时不强制贴合路线。
- route 数据缺失或导入旧地图时，路线测量能降级为普通曲线/折线。
- 完整地图导出再导入后，贴路对象保留路线停靠点，自由对象不产生路线停靠点。已通过 `pnpm run regress:measurement` 覆盖。
- 同一路线两段之间的贴路对象导出和导入后 overlay 都显示补点后的路径。已通过 `measurement-route-display-smoke` 回归覆盖：贴路对象控制点 `2`，显示点 `3`。

### 阶段 4：曲线尺和面积尺细化

- `已完成（2026-07-15）`。测量读数条支持面积尺、折线尺和曲线尺切换；路线贴合时固定为路线尺。曲线尺使用真实 pointer 拖拽连续采样，抬手后按屏幕容差执行可复现的 Ramer-Douglas-Peucker 点列简化。
- 面积尺支持直线闭合或平滑闭合，曲线尺支持开放曲线或平滑闭合；显示路径使用 Catmull-Rom 采样，控制点仍以结构化点列保存，未引入 SVG `getTotalLength()` 依赖。
- 持久对象新增并兼容回填 `drawMode / closed / smooth / sampling`；旧 `point / polyline / polygon` 和 `routeFit` 数据会归一化为对应尺型。UI 保存、形状更新和 `edit.measurements.*` 共用同一参数与 edit command。
- `pnpm run regress:measurement-curve` 固化开放/闭合简化的可复现性，样本长度误差为 `0.65%`，面积误差为 `1.63%`；`pnpm run regress:measurement` 使用真实 Chrome 鼠标拖拽生成 `21 -> 5` 个控制点的平滑闭合曲线，验证路线尺、折线尺、曲线尺完整地图往返、插值显示、API 编辑、撤销/重做和图层显隐，console / page error 与 WebGL error 均为 `0`。
- 生产构建通过。阶段 4 对应权威任务第 45 项已经达到最小验收并从活动清单移除。

## 暂缓项

- 精确复刻原版 SVG path 的 `getTotalLength()`。WebGL 版应优先使用自己的几何计算，避免依赖 DOM path 测量。
- 把原版字符串格式作为主格式。可以作为兼容导入格式，但新项目主格式应是结构化 JSON。
- 多用户/协作编辑历史。当前测量对象先接本地 EditHistory 即可。
