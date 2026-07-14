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

1. 先做 dissolve 算法原型，先在工具脚本中用固定 seed 验证 ring 拼接。`已完成第一刀`
2. 补导出验证和文件体积记录。`已完成第一刀`
3. 稳定后接入 UI，提供“合并政治面边界”开关。`已完成第一刀`
4. 若导出耗时影响主线程，再评估 Worker 或懒加载几何库。

## 2026-07-09 原型验证记录

已在 `app/webgl-generator/src/runtime/map-file-io.js` 新增 `dissolvePackCellPolygons(map, cellIds)` 纯函数，当前仅作为导出拓扑原型和后续接入点，还没有接入要素 GeoJSON UI。

已验证：

- 两个相邻方形 cell 可合并为一个 MultiPolygon，闭合外环点数从非合并的 `10` 点降为 `7` 点，共享边被消除。
- `3x3` 方格缺中心的合成对象可输出一个 polygon、两个 rings：外环 `13` 点，hole `5` 点，两个 ring 均闭合。
- `node --check app\webgl-generator\src\runtime\map-file-io.js`、`git diff --check` 和 `pnpm run build:app` 通过。

接入约束：

- 导出层选项已经保留非 dissolve 输出作为默认回退。

## 2026-07-09 真实导出验证记录

`createMapFeatureGeoJson(map, {dissolvePolitical: true})` 已支持内部可选 dissolve，但默认导出和 UI 仍保持非 dissolve 输出。

固定生成参数：

- seed：`dissolve-smoke`
- cells：`10000`
- graph：`1440 x 960`
- template：`continents`
- layers：`state / province / zone`

验证结果：

| 指标 | 非 dissolve | dissolve |
|---|---:|---:|
| pack cells | 5485 | 5485 |
| features | 206 | 206 |
| 坐标点 | 53180 | 10383 |
| 导出耗时 | 21.74ms | 44.43ms |

点数减少约 `80.48%`；dissolve 输出的 collection `properties.dissolvedPolitical = true`，所有 state / province / zone feature 的 `properties.dissolved = true`。

## 2026-07-09 UI 接入验证记录

导出浮层已新增“合并政治面边界”开关；启用后，state / province / zone 会走 dissolve 输出，未启用时仍保持原有非 dissolve MultiPolygon 回退。

构建产物浏览器烟测：

- 勾选国家面、省份面、区域，关闭 city / route / river / marker，并启用“合并政治面边界”。
- 下载 `docs/generated/smoke/features-dissolve-smoke.geojson`。
- 文件 `properties.layerSet = states-provinces-zones`。
- 文件 `properties.dissolvedPolitical = true`。
- feature 数 `261`，bad feature `0`，所有 feature 均为 `state / province / zone` 的 `MultiPolygon` 且 `properties.dissolved = true`。
- 坐标点 `12030`，`glError = 0`，非 health console/page error 为 `0`。

阶段外仍可优化：

- 100k cells 大图的浏览器导出耗时和主线程占用仍可另做手工采样；本轮已有固定 100k Node 门禁，不把它作为收口阻塞项。
- 只有后续浏览器采样证明耗时过高时，才评估 Worker 或懒加载几何库。

## 2026-07-15 外部兼容性代码门禁

要素 GeoJSON 的 collection 现在显式写入 `coordinateReference = approximate-equirectangular`。这不是已注册 CRS，只用于提醒外部消费者：坐标来自当前地图世界范围的近似等距圆柱映射。

新增 `pnpm run regress:dissolve-compatibility`，固定验证：

- FeatureCollection、Feature、MultiPolygon 的 RFC 结构层级。
- 所有坐标为有限数值，ring 至少 4 点且首尾闭合。
- outer ring 逆时针、hole 顺时针，hole 位于所属 outer 内。
- ring 不自交；hole 不与 outer 或其它 hole 相交、嵌套。
- 同一 MultiPolygon 内不同 polygon 不重复、不真交叉、不互相包含，也不存在同向共线边造成的面积重叠；合法多岛保持可读。
- feature 与 collection 的 `bbox` 精确包围实际坐标。
- JSON 往返后仍通过相同门禁。

固定合成样本结果为 `3 features / 3 polygons / 6 rings / 3 holes / 54 points`；相邻双 cell 的共享边消除后为 `7` 点闭环，两个分离 cell 输出两个 polygon。专项回归还确认未闭合、错误方向、错误 bbox、非有限坐标、自交、重复 polygon 和共线面积重叠 7 类坏样本会被拒绝。

本项只建立代码兼容门禁，不包含 100k 性能结论，也没有在快速迭代阶段运行浏览器或 QGIS / geojson.io 手工测试。大图耗时由下一项独立门禁处理。

## 2026-07-15 100k 性能门禁

新增 `pnpm run regress:dissolve-performance`，固定使用 `dissolve-perf-100k / continents / 100000 / 1440×960`。脚本先生成一次真实 100k 地图，再预热普通版与 dissolve 版导出，各正式采样 3 次 `createMapFeatureGeoJson() + JSON.stringify()` 并取中位数。

门禁断言：

- `metadata.cellsTarget = 100000`，实际 grid cells 至少 `99000`。
- state / province / zone 三类均非空，普通版与 dissolve 版的 feature id 和各层数量完全一致。
- dissolve 输出标记、MultiPolygon、ring 闭环、有限坐标和 bbox 通过轻量 O(points) 检查。
- 点数比例不超过 `0.35`，JSON 字节比例不超过 `0.40`。
- dissolve 构建与序列化总中位数不超过 `1500ms`，同时不超过普通版的 3 倍。

当前固定图实际为 `99846 grid / 56944 pack / 638 features`。主线程结果：

| 指标 | 普通政治面 | dissolve |
|---|---:|---:|
| 坐标点 | 625768 | 64676 |
| JSON 字节 | 11884400 | 1446142 |
| 构建与序列化中位数 | 301.673ms | 257.58ms |

点数减少 `89.665%`，字节减少 `87.832%`。独立审查复跑中位数为普通版 `308.153ms`、dissolve `256.013ms`，提交前最终复跑为普通版 `328.745ms`、dissolve `276.163ms`，均通过。地图生成约 4 秒只作环境记录，不纳入 dissolve 阈值。本项无需引入 Worker 或进一步优化算法。

## 2026-07-15 阶段状态

政治面 dissolve 的算法接入、非 dissolve 回退、UI 开关、外部兼容性代码门禁、100k 性能门禁和阶段末真实导出触发均已完成，本专题在权威任务第 20～24 项范围内收口。QGIS / geojson.io 手工互操作与 100k 浏览器主线程采样只记录为阶段外增强。
