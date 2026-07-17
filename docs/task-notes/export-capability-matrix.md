# 导出能力矩阵

本文档记录当前 WebGL 地图生成器的本地导出能力、文件内容、可否重新导入和后续缺口。它用于避免把“完整地图保存”“地理数据 GeoJSON”和“图片导出”混在一起。2026-07-16 原准权威 `Q-11` 已转为权威任务第 81 项，专门补齐路线与河流 GeoJSON 的稳定中文等级、名称和可靠统计字段；其它未获批准的新格式仍不自动入队。

## 当前导出入口

| 入口 | 文件名后缀 | 格式 | 主要内容 | 可重新导入复原 | 当前状态 |
|---|---|---|---|---|---|
| 导出图片 | `.png` | PNG | WebGL 画布、1x～4x、视口/全幅/像素/世界坐标裁剪、七类 overlay 白名单、图外透明 | 否 | 已完成裁剪与细粒度 overlay |
| 导出地图数据 | `.webgl-map.json` | JSON | `webgl-generator-map v2` 完整文档：options、map 全量数据、typed arrays、notes 等 | 是 | 已完成跨版本迁移 |
| 导出压缩地图数据 | `.webgl-map.json.gz` | gzip JSON | 与完整地图 JSON 相同，使用浏览器 `CompressionStream` 压缩 | 是 | 已完成第一刀 |
| 导出 GeoJSON | `.geojson` | GeoJSON FeatureCollection | pack cell Polygon，每个 cell 带高度、水陆、国家、省份、文化、宗教、生物群系和人口等属性 | 否 | 已完成第一刀 |
| 导出要素 GeoJSON | `.features.geojson` | GeoJSON FeatureCollection | city Point、route/river LineString、marker Point、zone/state/province MultiPolygon；可选图层与政治面 dissolve | 否 | 已完成外部 GIS 验证 |
| 导出备注摘要 | `.notes.json` | JSON | `webgl-generator-notes-summary v1`：当前筛选备注、正文、对象 id、孤儿状态和时间戳 | 否 | 已完成第一刀 |
| 导出测量结果 | `.measurement.json` | JSON | `webgl-generator-measurement v1`：当前测量点列、比例尺单位、距离和面积摘要 | 否 | 已完成第一刀 |

## 完整地图 JSON

用途：

- 保存当前地图的完整状态。
- 后续重新导入后复原当前地图对象、typed arrays、备注和渲染所需数据。

当前字段：

- `type = webgl-generator-map`
- `version = 2`
- `exportedAt`
- `metadata.seed / checksum / generatorStage`
- `options`
- `map`
- `metadata.mapSchemaVersion = 2`
- `map.metadata.schemaVersion = 2`

已验证：

- typed arrays 显式序列化并恢复构造器。
- marker、city、river、route、state、province、culture、religion 与 label 的 `map.notes` 会随完整 JSON 导出。
- v2 明确保证 `map.notes / measurements / labels / visualTheme` 四类持久化存储存在。
- 固定 v1 旧样本可迁移到 v2；旧备注、隐藏标签、主题和 typed arrays 均保留，缺失存储按兼容默认值补齐。
- 当前 v2 重复迁移保持幂等；未来版本和结构损坏的 v2 文档会被拒绝。

已验证：

- 本地文件导出可额外输出 `.webgl-map.json.gz`，导入地图数据入口可读取 `.webgl-map.json` 和 `.webgl-map.json.gz`。
- LocalStorage 继续使用既有 gzip-base64 存档；本地文件压缩格式不改变默认纯 JSON 导出。

缺口：

- 导入失败时会显示文件元数据、诊断代码、失败阶段、错误信息和中文建议，并可把最近一次结构化诊断导出为 JSON；诊断不包含原文件正文。
- 普通 GEO、FMG Cells GEO 和高度图已经进入统一诊断 v2，成功与失败均提供类型摘要、阶段、代码和中文建议；诊断不保存原坐标、像素或文件正文。

## pack cell GeoJSON

用途：

- 给 GIS 或外部分析工具提供地图 cell 级别的地理近似面数据。

当前几何：

- 每个 pack cell 输出一个 `Polygon`。
- 坐标采用当前 `mapCoordinates` 的近似 equirectangular 投影。
- FeatureCollection 与每个 Feature 都输出标准 `bbox = [minLon, minLat, maxLon, maxLat]`。
- 默认全图输出保持原 feature 集合；UI 与 API 共用 `full / viewport / bbox` 范围契约。范围模式保留与范围相交的完整 cell Polygon，不裁切几何。
- Collection 额外输出 `worldBounds / coordinateBounds / exportRange` 和 `coordinateReferenceDetail`；近似等距圆柱说明显式把 authority / identifier 留空，不伪造 EPSG。

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
- 尚未支持国家、省份、文化、宗教 dissolve 面。

## 要素 GeoJSON

用途：

- 导出更接近地图对象的标准地理数据，而不是 cell 面。

当前图层：

| layer | 几何 | 主要属性 | 备注 |
|---|---|---|---|
| `city` | `Point` | id、burg、name、type、group、population、capital、provincial、port、state/province/culture/religion、cell、packCell、hasNote、note | 城市备注正文已输出 |
| `route` | `LineString` | 保留 id、type、level、state、province、from、to、cells、distance 等旧字段；v1 增加 name / displayName、中文类型 / 等级、端点 / 归属名称、世界长度、段数及 grid / pack cell 数 | 路线备注正文已输出；稳定字典见 `network-geojson-field-dictionary.md` |
| `river` | `LineString` | 保留 id、name、type、source、mouth、parent、basin、flux、length、width、widthFactor、水文和备注旧字段；v1 增加 displayName、规范类型 / 层级、中文标签、世界长度、段数、grid / pack cell 数和 discharge | 暂未输出变宽河道面；稳定字典见 `network-geojson-field-dictionary.md` |
| `marker` | `Point` | id、name、type、label、category、resource、economicValue、state、province、cell、packCell、hasNote、note | marker 备注正文已输出 |
| `zone` | `MultiPolygon` | id、name、type、hidden、cells、color | 当前按 zone 的 cell polygon 集合输出，未 dissolve |
| `state` | `MultiPolygon` | id、name、fullName、capital、capitalName、culture、religion、cells、area、population、color、neighbors、dissolved、hasNote、note | 默认关闭；按国家陆地 cell 集合输出，`dissolved=false` |
| `province` | `MultiPolygon` | id、name、fullName、state、stateName、burg、burgName、cells、area、population、color、neighbors、dissolved、hasNote、note | 默认关闭；按省份陆地 cell 集合输出，`dissolved=false` |

所有要素 GeoJSON 的 FeatureCollection 与每个 Feature 都输出标准 `bbox`，方便外部 GIS 工具和后续范围导出快速判断空间范围。
FeatureCollection 同时写入 `coordinateReference = approximate-equirectangular`，明确坐标来自地图世界范围的近似等距圆柱映射。
Collection 还会写入可机读的世界边界、坐标边界、实际导出范围、轴序和单位；authority / identifier 为 `null`，不把近似映射伪装成已注册 CRS。
路线与河流 FeatureCollection 现在声明 `networkPropertySchema = fmg-network-properties-v1`；全图、viewport 和 bbox 范围导出共用 `network-geojson-properties.js` 唯一 serializer。旧字段不删除，新增稳定字段的空值和单位规则见字段字典。

已验证：

- 默认图可输出 city、route、river、marker、zone 五类要素。
- 写入 city、marker 或 route 备注后，对应 feature 会带 `hasNote = true` 和 `note` 正文；river 走同一备注字段导出路径。
- 简介 tab 的“要素 GeoJSON 图层”开关可限制导出图层，导出元数据 `layerSet` 会同步反映选择。
- 国家面和省份面默认关闭，手动开启后输出非 dissolve MultiPolygon，并明确 `dissolved=false`。
- “合并政治面边界”开关可对 state / province / zone 输出真正 dissolve MultiPolygon，并在生成图验证中将坐标点从 `53180` 降到 `10383`；构建产物下载烟测确认实际 `.features.geojson` 带 `dissolvedPolitical=true`。
- `regress:dissolve-compatibility` 已固化政治面闭环、方向、hole、多岛、自交、跨 polygon 重叠和 bbox 门禁；固定合法输出经 JSON 往返后通过，7 类坏输出会被拒绝。
- `regress:dissolve-performance` 已固化真实 100k 图的含序列化耗时、feature 一致性和体积缩减：固定图点数减少 `89.665%`、JSON 字节减少 `87.832%`，三轮 dissolve 中位耗时约 `256～276ms`，低于 `1500ms` 和普通版 3 倍双阈值。
- `regress:geojson-range` 固化全图兼容、同 bbox 稳定集合、视口等价、完整 feature 语义、bbox 聚合、坏范围拒绝和 UI / API 共路径；`regress:geojson-range-browser` 已完成四份真实 Chrome 下载文件检查。
- `regress:geojson-range-qgis` 使用 QGIS `3.44.12-Solothurn` 实际读取范围 pack Polygon `1472` 个和 dissolve 政治 MultiPolygon `125` 个，转存 GeoPackage，告警为 `0`。

缺口：

- zone、state 和 province 已支持真正 dissolve 外轮廓；范围导出和显式“未注册近似 CRS”元数据已完成。若未来要支持真实 CRS，应新增明确转换流程，不能只写一个 EPSG 编号。
- route / river 已完成 v1 名称、代码 / 中文标签、世界长度和可靠统计字段；真实交通量、通航等级、流速、坡降和真实水文单位仍因现有数据无法证明而明确不导出。

## PNG

用途：

- 快速拿到用户可见地图图片。

当前合成内容：

- WebGL canvas。
- 右上角地图尺寸摘要。
- 左下角比例尺。
- 城市 / 标记 / 军事图标和城市 / 国家 / 自定义标签等地图 overlay。
- 内置图例。
- 导出浮层支持 `1x / 2x / 3x / 4x` PNG 倍率。
- 可显式关闭地图 DOM overlay、比例尺和固定摘要合成。
- 可把当前相机下地图有效矩形之外的背景像素导出为透明；地图内海洋保持可见。
- 控制台 `api.data.exportPNG()` 支持 `pixelScale / includeMapOverlays / transparentBackground` 并返回实际选项。

缺口：

- 尚未合成手工叠层和浮动面板；内置图例已经纳入固定 PNG 合成。
- 尚未支持任意裁剪范围或把地图内海洋也处理为透明。

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

## 当前阶段门禁与阶段外扩展

### 纯 Node 聚合门禁

`pnpm run regress:exports` 会按顺序执行：

1. 完整地图跨版本迁移。
2. 完整地图导入诊断。
3. PNG 显式选项。
4. GeoJSON 范围导出与坐标参考。
5. 政治面 dissolve 外部兼容性。
6. 政治面 dissolve 100k 性能。

六项使用独立 Node 子进程，失败即停并传播退出码，后续步骤标记为 `skipped`。该命令不会启动浏览器；第 23 项已集中确认导出浮层、PNG 显式选项、政治面合并开关和真实导出触发，第 54 项另以系统 Chrome 检查四份真实范围导出文件，最终 WebGL、console、page 和 health error 均为 `0`。文件结构、拓扑、范围语义和 100k 性能由上述代码门禁持续负责。

本轮国家、省份和 zone dissolve、PNG 四类裁剪与细粒度 overlay、完整地图迁移、统一导入诊断、外部 GIS 互操作和 100k 浏览器验证均已完成。当前只保留以下阶段外增强，不进入活动队列：

1. route / river 更完整的中文属性和统计字段。
2. 真实 CRS 的显式坐标转换流程；不得只伪造 EPSG 编号。
3. SVG、瓦片包或其它新导出格式，需在用户明确提出后单独规划。
