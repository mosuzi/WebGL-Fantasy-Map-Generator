# 原版功能候选积压

本文档记录夜间巡视时对照 `source/Fantasy-Map-Generator` 发现的“有趣但当前 WebGL 版本尚未实现或只部分实现”的功能。目的不是立刻扩张范围，而是把可做、应先文档化和特别复杂的系统分清楚。

## 优先可做

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 测量工具：直尺、曲线尺、路线尺、面积尺 | `source/Fantasy-Map-Generator/public/modules/ui/measurers.js`，`Ruler / Opisometer / RouteOpisometer / Planimeter` | 已完成临时折线测距、闭合多边形面积、测量 JSON 导出、节点拖拽、撤销最后一点、节点删除和线段插入节点第一刀；测量对象与路线贴合计划见 `docs/task-notes/measurement-rulers-plan.md`；尚未支持路线贴合和保存测量对象。 | 中等 | 下一步按专项计划先做保存临时测量为对象，再做测量图层化与路线贴合。 |
| 对象注记 | `source/Fantasy-Map-Generator/public/modules/ui/notes-editor.js`，`editNotes` | 数据契约和分阶段入口已落到 `docs/task-notes/object-notes-implementation-plan.md`；marker、city、river、route、state、province、culture、religion 与 label 纯文本备注第一刀已完成，独立备注总览和备注摘要导出已完成，尚未做富文本、备注独立导入和孤儿备注批量清理。 | 中等 | 下一步可补备注独立导入、孤儿备注批量操作；富文本编辑器和 AI 辅助暂缓。 |
| 名称库编辑器 | `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts` | 当前有中文命名策略、标签管理、只读名称库总览、当前名称库 JSON 导出、名称库 JSON 追加/替换导入保存、导入冲突预览、新建用户库、复制内置库、重命名用户库、编辑用户库样本、样本规模质量提示、样例生成预览、单个删除用户库、清空用户库、全局/文化级生成绑定、绑定候选类型过滤和文化面板快捷入口；用户仍不能调整权重或使用接近原版的 Markov chain。实现计划已落到 `docs/task-notes/namebase-editor-plan.md`，绑定专项见 `docs/task-notes/namebase-generation-binding-plan.md`。 | 中等 | 下一步做权重、应用级用户库偏好和 Markov 链路质量；不要让导入或绑定变化自动改写已有地图对象名称。 |
| 分层 GeoJSON 导出 | `source/Fantasy-Map-Generator/public/modules/io/export.js`，`saveGeoJsonRoutes / Rivers / Markers / Zones` | 已完成城市、路线、河流、marker、zone、国家和省份要素 GeoJSON 第一刀，并支持 city / route / river / marker / zone / state / province 分层选择；国家和省份当前是 pack cell polygon 集合型 `MultiPolygon`，尚未做拓扑 dissolve、范围选择和更完整属性映射。 | 中等 | 下一步补国家/省份边界 dissolve 或范围选择；SVG、瓦片 zip 暂缓。 |

## 先落文档

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 高度图工作台增强 | `source/Fantasy-Map-Generator/public/modules/ui/heightmap-editor.js`，`source/Fantasy-Map-Generator/src/controllers/view-3d.ts` | 当前已有高度编辑、灰度图导入、黑白反转和适应方式；导入预览、色板量化、亮度/色相/FMG 色带自动映射计划已落到 `docs/task-notes/heightmap-image-converter-plan.md`；尚未实现彩色高度图识别、3D 地形预览或 OBJ。 | 复杂 | 先按计划做懒加载导入预览和轻量色板量化；3D/OBJ 单独规划。 |
| 样式预设与视觉风格编辑 | `source/Fantasy-Map-Generator/public/modules/ui/style.js`、`style-presets.js`、`public/styles/*.json` | 当前是固定 WebGL 风格加少量图层/视图开关；轻量主题 token、预设、导入导出和颜色级编辑计划已落到 `docs/task-notes/visual-theme-preset-plan.md`；尚未实现纹理、滤镜、字体、晕影和色带编辑。 | 复杂 | 先做只读轻量主题预设；完整样式系统和原版 SVG selector 兼容暂缓。 |
| 市场、商品与贸易动画 | `source/Fantasy-Map-Generator/src/controllers/goods-editor.ts`、`markets-overview.ts`、`trade-animation-editor.ts`、`draw-trade-animation.ts` | 当前已生成经济、资源和贸易数据；只读经济总览、导出诊断、轻量编辑、贸易流可视化和市场归属编辑计划已落到 `docs/task-notes/economy-market-trade-plan.md`；用户侧还没有完整 goods/market 面板和贸易流动画。 | 复杂 | 先做只读经济总览和导出诊断；动画和市场归属编辑后置。 |
| 静态军事管理收尾 | `source/Fantasy-Map-Generator/public/modules/ui/regiments-overview.js`、`regiment-editor.js` | 当前有军事生成、国家详情军力摘要、军事图层、军事管理面板、战报链静态摘要和边界态势线；用户已明确不需要动态军事系统。 | 中等 | 后续只做编辑面板观感、字段分组、导出可读性、军团定位、态势线视觉和既有记录清理；不做战斗模拟、自动战役推进或外交/经济驱动军事行动。 |

## 长期复杂系统

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 纹章 / Coat of Arms | `source/Fantasy-Map-Generator/public/modules/ui/emblems-editor.js`、`src/generators/emblems/*`、`src/renderers/draw-emblems.ts` | 当前国家、省份、城市有颜色和图标；纹章数据占位、只读显示、轻量图层、按需生成器、编辑和导出计划已落到 `docs/task-notes/emblems-coa-plan.md`；尚未有纹章生成、编辑、图库和导出链路。 | 特别复杂 | 先保留数据占位与只读显示；完整生成器和 Armoria 集成远期后置。 |
| 子地图与地图变换 | `source/Fantasy-Map-Generator/public/modules/ui/submap-tool.js`、`transform-tool.js`、`src/generators/resample.ts` | 当前不能从视口裁剪生成新地图，也不能旋转、镜像、缩放后重采样整图。 | 特别复杂 | 先作为远期规划，避免打断当前导入导出和编辑器基础设施。 |

## 建议顺序

1. 测量工具：折线测距、面积、测量 JSON 导出、节点拖拽、撤销最后一点、节点删除和线段插入节点第一刀已完成；测量对象与路线贴合计划已落到 `docs/task-notes/measurement-rulers-plan.md`，后续先做保存临时测量为对象，再做测量图层化与路线贴合。
2. 对象注记：第一批专用入口、独立总览和摘要导出已完成；后续为孤儿备注批量操作、独立导入和战斗事件备注铺路。
3. 名称库编辑器：计划、只读总览、内置名称库导出、导入保存、导入冲突预览、用户库新建/复制/编辑/删除、样例生成预览、全局/文化级绑定和文化面板快捷入口已完成；下一步做权重、应用级用户库偏好和 Markov 链路质量，避免导入或绑定变化自动批量改名。
4. 分层 GeoJSON：路线、河流、marker、zone、国家和省份第一刀已完成；后续可继续做国家/省份拓扑 dissolve、范围选择和更完整属性映射。
