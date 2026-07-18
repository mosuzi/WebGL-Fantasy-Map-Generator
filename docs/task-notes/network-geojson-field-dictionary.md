# 路线与河流 GeoJSON 稳定字段字典

本文记录权威任务第 81 项的路线 / 河流要素 GeoJSON v1 字段契约。全图和 `viewport / bbox` 范围导出都必须调用同一 serializer；范围只筛选完整要素，不维护第二套属性拼装。

## 版本标记

- FeatureCollection：`networkPropertySchema = fmg-network-properties-v1`、`networkPropertySchemaVersion = 1`。
- 每条 route / river Feature：`networkSchema = fmg-network-properties-v1`、`networkSchemaVersion = 1`。
- 后续只能追加可选字段或发布新的 schema 版本；本页列出的旧字段不得删除、改名或改变既有哨兵语义。

## 公共稳定字段

| 字段 | 类型 | 空值规则 | 含义 |
|---|---|---|---|
| `displayName` | string | 永不为空；缺名时使用中文类型和 ID | 面向外部显示的稳定名称 |
| `typeCode` | string | 未知为 `unknown` | 规范化类型代码；原代码仍由旧 `type` 追溯 |
| `typeLabel` | string | 未知为“未知路线 / 未知河流” | 中文类型 |
| `levelCode` | string | 未知为 `unclassified` | 规范化等级 / 层级代码 |
| `levelLabel` | string | 未知为“未分级” | 中文等级 / 层级 |
| `lengthWorld` | number | 无有效线段时为 `0` | 地图世界坐标折线长度，六位小数 |
| `lengthUnit` | string | 固定 `map-world-unit` | 明确长度不是米、公里或真实 CRS 距离 |
| `segmentCount` | integer | 无有效线段为 `0` | 有限相邻点组成的线段数 |
| `gridCellCount` | integer | 缺字段为 `0` | 关联 grid cells 数量 |
| `packCellCount` | integer | 缺字段为 `0` | 关联 pack cells 数量 |

计数字段始终为非负整数，数组缺失时为 `[]`，布尔字段始终为布尔值。新增的对象关系名称使用 `string | null`：没有有效对象时为 `null`，不再额外发明 `unknown` 名称；旧 `from / to / state / province` 的 `-1 / 0` 哨兵保持原样。

## 路线 route

| 代码 | 中文 |
|---|---|
| `road` | 道路 |
| `trail` | 小径 |
| `searoute` | 海路 |
| `unknown` | 未知路线 |

| 等级代码 | 中文 |
|---|---|
| `primary` | 主要 |
| `secondary` | 次要 |
| `minor` | 支线 |
| `trail` | 小径 |
| `unclassified` | 未分级 |

路线新增 `name`，优先读取对象已有名称；否则使用“起点—终点”、单端点加类型或“中文类型 #ID”确定性派生。`displayName` 与 `name` 相同。`fromName / toName / stateName / provinceName` 使用真实对象名称或 `null`。

旧字段完整保留：`id / type / level / state / province / from / to / cells / resourceCells / markerResourceCells / resourceGoodIds / distance / hasNote / note`。其中 `distance` 保持既有世界长度，当前与 `lengthWorld` 等值；`cells` 保持既有 grid cell 数，当前与 `gridCellCount` 等值。

## 河流 river

| 类型代码 | 中文 | 层级代码 | 层级中文 |
|---|---|---|---|
| `river` | 河流 | `mainstem` | 干流 |
| `branch` | 支流 | `tributary` | 支流 |
| `unknown` | 未知河流 | `unclassified` | 未分级 |

河流保留已有 `name`，并新增永不为空的 `displayName`；没有名称时使用“中文类型 #ID”。`discharge` 是已有 `discharge / flux` 的非负数值别名，缺失时为 `0`，便于外部应用不再猜测两个代码字段。

旧字段完整保留：`id / name / type / source / mouth / parent / basin / flux / length / width / widthFactor / catchmentArea / catchmentCells / averagePrecipitation / hydrologyMethod / hasNote / note`。不从 flux 推导流量等级，不伪造流速、坡降、通航、道路容量、交通量或真实水文单位。

## 兼容与验证

- `npm run regress:network-geojson` 固定 3k 地图，验证全图与等价 bbox 属性完全一致、route / river 层内字段集合和类型稳定、旧键保留、中文标签、名称、空关系、未知代码、长度 / 段数 / cells 统计及 JSON 往返。
- `regress:geojson-range` 继续覆盖范围、bbox 和 UI / API 共路径；路线编辑、河流删除与对象创建专项继续作为旧消费者门禁。
- geojson.io 已读取同一份代表性 route / river FeatureCollection，并识别两条 `LineString`，JSON 编辑区可见路线 / 河流的新旧字段和中文标签。
- `regress:geojson-range-qgis` 使用官方 QGIS `3.44.12-Solothurn` 分别读取并转存范围路线 `195` 条、河流 `54` 条为 GeoPackage；几何类型与本字典稳定字段均通过实际字段表断言，告警为 `0`。固定样本分层只为避免路线、河流各自保留的旧数值 `id` 在混层时被 GDAL 解释成重复 FID，不改变正式混合 FeatureCollection 或任何旧字段。
