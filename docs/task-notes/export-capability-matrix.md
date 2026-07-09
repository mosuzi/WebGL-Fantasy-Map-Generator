# 导出能力矩阵

本文档记录当前 WebGL 地图生成器的本地导出能力、文件内容、可否重新导入和后续缺口。它用于避免把“完整地图保存”“地理数据 GeoJSON”和“图片导出”混在一起。

## 当前导出入口

| 入口 | 文件名后缀 | 格式 | 主要内容 | 可重新导入复原 | 当前状态 |
|---|---|---|---|---|---|
| 导出图片 | `.png` | PNG | WebGL 画布、地图尺寸摘要、比例尺 overlay | 否 | 已完成第一刀 |
| 导出地图数据 | `.webgl-map.json` | JSON | `webgl-generator-map v1` 完整文档：options、map 全量数据、typed arrays、notes 等 | 是 | 已完成第一刀 |
| 导出压缩地图数据 | `.webgl-map.json.gz` | gzip JSON | 与完整地图 JSON 相同，使用浏览器 `CompressionStream` 压缩 | 是 | 已完成第一刀 |
| 导出 GeoJSON | `.geojson` | GeoJSON FeatureCollection | pack cell Polygon，每个 cell 带高度、水陆、国家、省份、文化、宗教、生物群系和人口等属性 | 否 | 已完成第一刀 |
| 导出要素 GeoJSON | `.features.geojson` | GeoJSON FeatureCollection | city Point、route LineString、river LineString、marker Point、zone MultiPolygon、state/province 非 dissolve MultiPolygon；简介 tab 可选择导出图层 | 否 | 已完成第二刀 |
| 导出备注摘要 | `.notes.json` | JSON | `webgl-generator-notes-summary v1`：当前筛选备注、正文、对象 id、孤儿状态和时间戳 | 否 | 已完成第一刀 |
| 导出测量结果 | `.measurement.json` | JSON | `webgl-generator-measurement v1`：当前测量点列、比例尺单位、距离和面积摘要 | 否 | 已完成第一刀 |

## 完整地图 JSON

用途：

- 保存当前地图的完整状态。
- 后续重新导入后复原当前地图对象、typed arrays、备注和渲染所需数据。

当前字段：

- `type = webgl-generator-map`
- `version = 1`
- `exportedAt`
- `metadata.seed / checksum / generatorStage`
- `options`
- `map`

已验证：

- typed arrays 显式序列化并恢复构造器。
- marker、city、river、route、state、province、culture、religion 与 label 的 `map.notes` 会随完整 JSON 导出。

已验证：

- 本地文件导出可额外输出 `.webgl-map.json.gz`，导入地图数据入口可读取 `.webgl-map.json` 和 `.webgl-map.json.gz`。
- LocalStorage 继续使用既有 gzip-base64 存档；本地文件压缩格式不改变默认纯 JSON 导出。

缺口：

- 迁移器已预留 `migrateMapDocument()` 管线，但当前仍只有 v1，无实际跨版本迁移步骤。
- 导入失败时已在控制面板显示文件名、大小、MIME、推断格式、错误类型、错误信息和中文处理建议；后续若要继续增强，可把最近错误记录导出为诊断包。

## pack cell GeoJSON

用途：

- 给 GIS 或外部分析工具提供地图 cell 级别的地理近似面数据。

当前几何：

- 每个 pack cell 输出一个 `Polygon`。
- 坐标采用当前 `mapCoordinates` 的近似 equirectangular 投影。
- FeatureCollection 与每个 Feature 都输出标准 `bbox = [minLon, minLat, maxLon, maxLat]`。

当前属性：

- `cell`
- `height`
- `isWater`
- `feature`
- `biome`
- `state / stateName`
- `province / provinceName`
- `culture / cultureName`
- `religion / religionName`
- `population`

缺口：

- 文件可能较大。
- 尚未支持按视口或范围裁剪。
- 尚未支持国家、省份、文化、宗教 dissolve 面。

## 要素 GeoJSON

用途：

- 导出更接近地图对象的标准地理数据，而不是 cell 面。

当前图层：

| layer | 几何 | 主要属性 | 备注 |
|---|---|---|---|
| `city` | `Point` | id、burg、name、type、group、population、capital、provincial、port、state/province/culture/religion、cell、packCell、hasNote、note | 城市备注正文已输出 |
| `route` | `LineString` | id、type、level、state、province、from、to、cells、distance、hasNote、note | 路线备注正文已输出 |
| `river` | `LineString` | id、name、type、source、mouth、parent、basin、flux、length、width、widthFactor、hasNote、note | 暂未输出变宽河道面；备注正文已输出 |
| `marker` | `Point` | id、name、type、label、category、resource、economicValue、state、province、cell、packCell、hasNote、note | marker 备注正文已输出 |
| `zone` | `MultiPolygon` | id、name、type、hidden、cells、color | 当前按 zone 的 cell polygon 集合输出，未 dissolve |
| `state` | `MultiPolygon` | id、name、fullName、capital、capitalName、culture、religion、cells、area、population、color、neighbors、dissolved、hasNote、note | 默认关闭；按国家陆地 cell 集合输出，`dissolved=false` |
| `province` | `MultiPolygon` | id、name、fullName、state、stateName、burg、burgName、cells、area、population、color、neighbors、dissolved、hasNote、note | 默认关闭；按省份陆地 cell 集合输出，`dissolved=false` |

所有要素 GeoJSON 的 FeatureCollection 与每个 Feature 都输出标准 `bbox`，方便外部 GIS 工具和后续范围导出快速判断空间范围。

已验证：

- 默认图可输出 city、route、river、marker、zone 五类要素。
- 写入 city、marker 或 route 备注后，对应 feature 会带 `hasNote = true` 和 `note` 正文；river 走同一备注字段导出路径。
- 简介 tab 的“要素 GeoJSON 图层”开关可限制导出图层，导出元数据 `layerSet` 会同步反映选择。
- 国家面和省份面默认关闭，手动开启后输出非 dissolve MultiPolygon，并明确 `dissolved=false`。
- 内部导出选项 `dissolvePolitical=true` 已可对 state / province / zone 输出真正 dissolve MultiPolygon，并在生成图验证中将坐标点从 `53180` 降到 `10383`；UI 开关仍待接入。

缺口：

- zone、state 和 province 的真正 dissolve 外轮廓已有内部选项和命令级验证，尚未接入导出 UI。
- route / river 可继续补名称、等级中文标签和更完整统计。
- 尚未支持范围导出或 CRS 元数据配置。

## PNG

用途：

- 快速拿到用户可见地图图片。

当前合成内容：

- WebGL canvas。
- 右上角地图尺寸摘要。
- 左下角比例尺。
- 城市 / 标记 / 军事图标和城市 / 国家 / 自定义标签等地图 overlay。
- 导出浮层支持 `1x / 2x / 3x / 4x` PNG 倍率。

缺口：

- 尚未合成图例、手工叠层和浮动面板。
- 尚未支持透明背景或裁剪范围。

## 备注摘要 JSON

用途：

- 从备注总览导出当前筛选结果，便于人类阅读、外部脚本汇总或单独整理备注。
- 不替代完整地图 JSON；重新导入复原地图仍应使用 `.webgl-map.json`。

当前字段：

- `type = webgl-generator-notes-summary`
- `version = 1`
- `exportedAt`
- `metadata.seed / checksum / notes / totalNotes`
- `notes[]`：id、kind、kindLabel、objectId、name、body、bodyLength、orphan、createdAt、updatedAt

## 测量结果 JSON

用途：

- 从地图测量工具导出当前临时测量点、距离和面积，便于外部记录或复核比例尺结果。
- 不保存为地图对象；重新打开地图不会自动恢复这次测量。

当前字段：

- `type = webgl-generator-measurement`
- `version = 1`
- `exportedAt`
- `metadata.seed / checksum / graphWidth / graphHeight / pointCount`
- `units.distanceUnit / areaUnit / mapScaleKmPerCm`
- `summary.distanceMapUnits / distanceLabel / areaMapUnits / areaLabel`
- `points[]`：index、x、y

## 后续顺序建议

1. 国家、省份和 zone dissolve：补真正适合 GIS 的外轮廓，执行前先按 `docs/task-notes/political-geojson-dissolve-plan.md` 做拓扑原型验证。
2. PNG 透明背景、裁剪范围和是否包含 overlay 的显式开关。
3. 完整 JSON 版本迁移器和导入诊断包。
