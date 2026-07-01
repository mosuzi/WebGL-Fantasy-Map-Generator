# 导出能力矩阵

本文档记录当前 WebGL 地图生成器的本地导出能力、文件内容、可否重新导入和后续缺口。它用于避免把“完整地图保存”“地理数据 GeoJSON”和“图片导出”混在一起。

## 当前导出入口

| 入口 | 文件名后缀 | 格式 | 主要内容 | 可重新导入复原 | 当前状态 |
|---|---|---|---|---|---|
| 导出图片 | `.png` | PNG | WebGL 画布、地图尺寸摘要、比例尺 overlay | 否 | 已完成第一刀 |
| 导出地图数据 | `.webgl-map.json` | JSON | `webgl-generator-map v1` 完整文档：options、map 全量数据、typed arrays、notes 等 | 是 | 已完成第一刀 |
| 导出 GeoJSON | `.geojson` | GeoJSON FeatureCollection | pack cell Polygon，每个 cell 带高度、水陆、国家、省份、文化、宗教、生物群系和人口等属性 | 否 | 已完成第一刀 |
| 导出要素 GeoJSON | `.features.geojson` | GeoJSON FeatureCollection | city Point、route LineString、river LineString、marker Point、zone MultiPolygon；简介 tab 可选择导出图层 | 否 | 已完成第一刀 |

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

缺口：

- 尚未做压缩格式。
- 尚未做跨版本迁移器。
- 尚未做导入错误详情面板。

## pack cell GeoJSON

用途：

- 给 GIS 或外部分析工具提供地图 cell 级别的地理近似面数据。

当前几何：

- 每个 pack cell 输出一个 `Polygon`。
- 坐标采用当前 `mapCoordinates` 的近似 equirectangular 投影。

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

已验证：

- 默认图可输出 city、route、river、marker、zone 五类要素。
- 写入 city、marker 或 route 备注后，对应 feature 会带 `hasNote = true` 和 `note` 正文；river 走同一备注字段导出路径。
- 简介 tab 的“要素 GeoJSON 图层”开关可限制导出图层，导出元数据 `layerSet` 会同步反映选择。

缺口：

- zone 需要 dissolve 外轮廓。
- route / river 可继续补名称、等级中文标签和更完整统计。
- 尚未支持范围导出或 CRS 元数据配置。

## PNG

用途：

- 快速拿到用户可见地图图片。

当前合成内容：

- WebGL canvas。
- 右上角地图尺寸摘要。
- 左下角比例尺。

缺口：

- 尚未合成图例、标签、手工叠层和浮动面板。
- 尚未支持指定输出倍率、透明背景或裁剪范围。

## 后续顺序建议

1. 国家和省份 dissolve：补真正适合 GIS 的政治面。
2. PNG 导出倍率和是否包含 overlay 的选项。
3. 完整 JSON 压缩和版本迁移器。
