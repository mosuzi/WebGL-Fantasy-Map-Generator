# 原版功能候选积压

本文档记录夜间巡视时对照 `source/Fantasy-Map-Generator` 发现的“有趣但当前 WebGL 版本尚未实现或只部分实现”的功能。目的不是立刻扩张范围，而是把可做、应先文档化和特别复杂的系统分清楚。

## 优先可做

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 测量工具：直尺、曲线尺、路线尺、面积尺 | `source/Fantasy-Map-Generator/public/modules/ui/measurers.js`，`Ruler / Opisometer / RouteOpisometer / Planimeter` | 折线、面积、对象保存、节点编辑、图层显隐、路线贴合、`cellStops` 持久化和完整地图往返均已完成；剩余缺口是曲线尺连续采样、采样点优化和平滑闭合。 | 中等 | 已列入权威任务第 45 项，按专项计划只做曲线尺细化。 |
| 对象注记 | `source/Fantasy-Map-Generator/public/modules/ui/notes-editor.js`，`editNotes` | 数据契约和分阶段入口已落到 `docs/task-notes/object-notes-implementation-plan.md`；marker、city、river、route、state、province、culture、religion 与 label 纯文本备注第一刀已完成，独立备注总览和备注摘要导出已完成，尚未做富文本、备注独立导入和孤儿备注批量清理。 | 中等 | 下一步可补备注独立导入、孤儿备注批量操作；富文本编辑器和 AI 辅助暂缓。 |
| 名称库编辑器 | `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts` | 当前有中文命名策略、标签管理、只读名称库总览、当前名称库 JSON 导出、名称库 JSON 追加/替换导入保存、原版 `name|min|max|d|m|names` 文本导入导出第一刀、导入冲突预览、新建用户库、复制内置库、重命名用户库、编辑用户库样本、样本规模质量提示、样例生成预览、单个删除用户库、清空用户库、全局/文化级生成绑定、绑定候选类型过滤、文化面板快捷入口、应用级本地偏好、样本权重、项目内 Markov 链路生成、编辑历史第一刀，国家/城市/河流/湖泊筛选显式重命名，选中标签/河流/湖泊目标单个重命名，基础 `minLength / maxLength / duplicateChars` 生成参数，以及更细质量诊断第一刀；尚未实现原版多词率 `m` 行为。实现计划已落到 `docs/task-notes/namebase-editor-plan.md`，绑定专项见 `docs/task-notes/namebase-generation-binding-plan.md`。 | 中等 | 下一步补更多对象面板入口或原版多词率 `m` 行为；不要让导入或绑定变化自动改写已有地图对象名称。 |
| 分层 GeoJSON 导出 | `source/Fantasy-Map-Generator/public/modules/io/export.js`，`saveGeoJsonRoutes / Rivers / Markers / Zones` | 城市、路线、河流、marker、zone、国家和省份分层导出、政治面 dissolve、bbox、唯一外部 id、100k Chrome 与 QGIS/geojson.io 读取均已完成；剩余缺口是范围导出与坐标参考元数据强化。 | 中等 | 已列入权威任务第 54 项；SVG、瓦片 zip 暂缓。 |

## 先落文档

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 高度图工作台增强 | `source/Fantasy-Map-Generator/public/modules/ui/heightmap-editor.js`，`source/Fantasy-Map-Generator/src/controllers/view-3d.ts` | 灰度/彩色色板导入、预览、量化、自动估高、手动覆盖、差值热力图、profile 往返和待处理审核第一刀均已完成；3D 地形预览与 OBJ 仍未实现。 | 复杂 | 3D/OBJ 继续单独规划，不进入本轮权威任务。 |
| 样式预设与视觉风格编辑 | `source/Fantasy-Map-Generator/public/modules/ui/style.js`、`style-presets.js`、`public/styles/*.json` | 六套只读主题、跨层 token、canvas filter、overlay、图例、PNG 与完整地图持久化已完成；用户主题导入导出和颜色级编辑尚未实现。 | 复杂 | 已列入权威任务第 52 项；纹理、字体和高级后处理继续暂缓。 |
| 市场、商品与贸易动画 | `source/Fantasy-Map-Generator/src/controllers/goods-editor.ts`、`markets-overview.ts`、`trade-animation-editor.ts`、`draw-trade-animation.ts` | 商品/市场/交易总览、供需、运距、价格压力、资源选址/路线权重、CSV/JSON 和静态贸易流均已完成；剩余主要缺口是市场归属编辑与经济链内受约束重算。 | 复杂 | 已列入权威任务第 48 项；复杂贸易动画继续暂缓。 |
| 静态军事管理收尾 | `source/Fantasy-Map-Generator/public/modules/ui/regiments-overview.js`、`regiment-editor.js` | 当前有军事生成、国家详情军力摘要、军事图层、军事管理面板、战报链静态摘要和边界态势线；用户已明确不需要动态军事系统。 | 中等 | 后续只做编辑面板观感、字段分组、导出可读性、军团定位、态势线视觉和既有记录清理；不做战斗模拟、自动战役推进或外交/经济驱动军事行动。 |

## 长期复杂系统

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 纹章 / Coat of Arms | `source/Fantasy-Map-Generator/public/modules/ui/emblems-editor.js`、`src/generators/emblems/*`、`src/renderers/draw-emblems.ts` | 当前国家、省份、城市有颜色和图标；纹章数据占位、只读显示、轻量图层、按需生成器、编辑和导出计划已落到 `docs/task-notes/emblems-coa-plan.md`；尚未有纹章生成、编辑、图库和导出链路。 | 特别复杂 | 先保留数据占位与只读显示；完整生成器和 Armoria 集成远期后置。 |
| 子地图与地图变换 | `source/Fantasy-Map-Generator/public/modules/ui/submap-tool.js`、`transform-tool.js`、`src/generators/resample.ts` | 当前不能从视口裁剪生成新地图，也不能旋转、镜像、缩放后重采样整图。 | 特别复杂 | 先作为远期规划，避免打断当前导入导出和编辑器基础设施。 |

## 建议顺序

1. 测量工具：路线贴合与完整地图往返已完成；下一步只做曲线尺连续采样和点列优化，对应权威任务第 45 项。
2. 对象注记：第一批专用入口、独立总览和摘要导出已完成；后续为孤儿备注批量操作、独立导入和战斗事件备注铺路。
3. 名称库编辑器：计划、只读总览、内置名称库导出、导入保存、原版文本导入导出第一刀、导入冲突预览、用户库新建/复制/编辑/删除、样例生成预览、全局/文化级绑定、文化面板快捷入口、应用级本地偏好、样本权重、Markov 链路质量、编辑历史，国家/城市/河流/湖泊筛选显式重命名，选中标签/河流/湖泊目标单个重命名、基础生成质量参数和更细质量诊断第一刀已完成；下一步补更多对象面板入口或原版多词率 `m` 行为，避免导入或绑定变化自动批量改名。
4. 分层 GeoJSON：政治面 dissolve 与外部 GIS 验证已完成；下一步只做范围导出和坐标参考元数据强化，对应权威任务第 54 项。
