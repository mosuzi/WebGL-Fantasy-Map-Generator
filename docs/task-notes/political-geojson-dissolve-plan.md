# 政治面 GeoJSON 与 dissolve 计划

本文档记录国家、省份等政治面导出的实现边界。当前 `.features.geojson` 已包含 city、route、river、marker、zone、state、province，并支持分层选择；继续扩展 GIS 能力时，应谨慎区分“按 cell 收集成 MultiPolygon”和“真正 dissolve 外轮廓”。

## 当前基础

- `createMapGeoJson(map)` 已逐个导出 pack cell Polygon，并在 properties 中写入 state、province、culture、religion、生物群系、人口等字段。
- `createMapFeatureGeoJson(map, {layers})` 已支持 city Point、route LineString、river LineString、marker Point、zone MultiPolygon、state MultiPolygon 和 province MultiPolygon。
- `zoneFeatures()` 当前做法是把 zone 的 pack cells 转为多个 cell polygon，放进一个 MultiPolygon；这不是拓扑 dissolve，只是按对象聚合 cell polygon。
- `stateFeatures()` 和 `provinceFeatures()` 当前做法同样是把所属陆地 pack cells 转为多个 cell polygon，放进一个 MultiPolygon，并在 properties 中标注 `dissolved=false`。
- 政治归属主要来自 `map.pack.cells.state / province` 和 `map.politics.states / provinces`；国家、省份对象已有 cells、area、neighbors、center、gridCenter、color、capital、culture、religion 等字段。

## 不应直接做的事

- 不要把 pack cell GeoJSON 直接称为国家/省份 dissolve；它只是 cell 级面。
- 不要为了快速出结果引入沉重 GIS 运行时库并打进主 bundle。若后续需要 polygon boolean，应评估懒加载、构建拆包或仅导出时动态导入。
- 不要在没有拓扑校验的情况下合并坐标字符串；浮点误差和 ring 方向会导致外部 GIS 工具读出自交面。
- 不要把水域、中立 cell、removed state/province 混入政治面。

## 第一阶段：政治面 MultiPolygon 集合（已完成）

目标：

- 在 `.features.geojson` 中新增可选 `state` 和 `province` 图层。
- 每个国家或省份输出一个 MultiPolygon，coordinates 为该对象所有 pack cell polygon 的集合。
- 明确 properties 中标注 `dissolved: false`，避免误导用户。

建议字段：

| layer | 几何 | 关键 properties |
|---|---|---|
| `state` | `MultiPolygon` | id、name、fullName、capital、capitalName、culture、religion、cells、area、population、color、neighbors、dissolved=false |
| `province` | `MultiPolygon` | id、name、fullName、state、stateName、burg、省会、cells、area、population、color、neighbors、dissolved=false |

实现要点：

- 复用 `packCellPolygon(map, cell)`，但只收集陆地 cell：`pack.cells.h[cell] >= 20`。
- 按 `pack.cells.state[cell]` / `pack.cells.province[cell]` 分组，不信任对象上的 `cells` 数字作为 cell 列表。
- 增加导出图层开关 `state / province`，默认可以关闭，避免默认文件暴涨。
- 状态提示需要显示导出要素总数和 layerSet。

验证：

- 默认图导出 state 图层时，Feature 数等于有效国家数，所有 feature geometry 为 MultiPolygon。
- province 图层同理，且每个 province 的 `state` 能指向有效国家。
- 关闭 state/province 后现有 city/route/river/marker/zone 导出不变。

当前实现：

- 简介 tab 的“要素 GeoJSON 图层”已新增“国家面 / 省份面”开关，默认关闭。
- `createMapFeatureGeoJson(map, {layers})` 支持 `layers.state` 和 `layers.province`。
- 导出按 `pack.cells.state / province` 分组陆地 cell，复用 `packCellPolygon(map, cell)` 生成 MultiPolygon。
- properties 输出 `dissolved=false`、基础对象字段、邻接、面积、人口、颜色和备注字段。
- 构建产物验证中开启国家面和省份面后，`layerSet = states-provinces-cities-routes-rivers-markers-zones`，state `20`、province `213`、政治面 bad `0`，console/page error 为 `0`。

## 第二阶段：真正 dissolve 外轮廓

目标：

- 把同一政治对象相邻 cell 的共享边消除，输出外轮廓 ring 和湖泊/内海 hole。
- properties 标注 `dissolved: true`。

推荐算法：

1. 对目标对象收集所有 pack cell。
2. 遍历每个 cell 的 Voronoi 边，生成规范化边 key：两个顶点 id 排序后拼接。
3. 若边两侧 cell 都属于同一对象，则丢弃；否则保留为边界半边。
4. 把保留边按端点连接成闭合 rings。
5. 用 signed area 判定外环与内环方向；必要时调整为 GeoJSON 约定。
6. 按包含关系把 hole 归入对应外环；多岛对象输出 MultiPolygon。

风险：

- pack cell 顶点顺序必须一致，否则 ring 拼接会断裂。
- 海岸和湖岸会产生大量边，100k cells 下需要避免 O(n²) 包含测试。
- 多岛国家、省份和飞地会产生多个外环；不能假定单一 polygon。
- GeoJSON 坐标投影目前是 approximate equirectangular，真实 GIS 分析前仍需用户知道它是近似坐标。

验收：

- 任意 state/province dissolve 后，导出的 ring 全部闭合，首尾坐标一致。
- QGIS / geojson.io 可打开，不报自交或无效 ring。
- 与非 dissolve MultiPolygon 比较，feature 数一致，坐标点数量显著下降。
- 100k cells 默认图导出耗时可接受；若超过明显阈值，应移入 Web Worker 或仅按需启用。

## 建议顺序

1. 先做 dissolve 算法原型，先在工具脚本中用固定 seed 验证 ring 拼接。
2. 补导出验证和文件体积记录。
3. 稳定后接入 UI，提供“合并政治面边界”开关。
4. 若导出耗时影响主线程，再评估 Worker 或懒加载几何库。
