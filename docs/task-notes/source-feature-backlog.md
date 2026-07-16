# 原版功能候选积压

本文档记录夜间巡视时对照 `source/Fantasy-Map-Generator` 发现的候选功能。2026-07-16 已按真实实现重新校准：第 45～52、54 项对应的曲线尺、备注治理、名称库多词率、市场归属、路线编辑、水体 / 生物群系局部修正、用户主题和 GeoJSON 范围导出均已完成；剩余内容只作阶段外候选，不自动进入权威任务。

## 已完成的优先候选

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 测量工具：直尺、曲线尺、路线尺、面积尺 | `source/Fantasy-Map-Generator/public/modules/ui/measurers.js`，`Ruler / Opisometer / RouteOpisometer / Planimeter` | 折线、曲线、面积、路线贴合、对象保存、节点编辑、点列优化、平滑闭合、`cellStops` 持久化和完整地图往返均已完成。 | 中等 | 权威任务第 45 项已完成；更多专业测绘算法只作远期候选。 |
| 对象注记 | `source/Fantasy-Map-Generator/public/modules/ui/notes-editor.js`，`editNotes` | 纯文本备注、独立备注、总览、摘要导入导出、孤儿筛选和批量清理均已完成。 | 中等 | 权威任务第 46 项已完成；富文本和 AI 辅助明确暂缓。 |
| 名称库编辑器 | `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts` | 用户库管理、导入导出、绑定、Markov 生成、质量参数、对象重命名和原版多词率 `m` 行为均已完成。 | 中等 | 权威任务第 47 项已完成；更多对象快捷入口只按真实需求单独评估。 |
| 分层 GeoJSON 导出 | `source/Fantasy-Map-Generator/public/modules/io/export.js`，`saveGeoJsonRoutes / Rivers / Markers / Zones` | 分层要素、政治面 dissolve、范围导出、bbox、唯一外部 id、未注册近似 CRS 元数据、100k Chrome 和 QGIS / geojson.io 验证均已完成。 | 中等 | 权威任务第 54 项已完成；SVG、瓦片 zip 和真实 CRS 转换暂缓。 |

## 已完成与明确暂缓

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 高度图工作台增强 | `source/Fantasy-Map-Generator/public/modules/ui/heightmap-editor.js`，`source/Fantasy-Map-Generator/src/controllers/view-3d.ts` | 灰度/彩色色板导入、预览、量化、自动估高、手动覆盖、差值热力图、profile 往返和待处理审核第一刀均已完成；3D 地形预览与 OBJ 仍未实现。 | 复杂 | 3D/OBJ 继续单独规划，不进入本轮权威任务。 |
| 样式预设与视觉风格编辑 | `source/Fantasy-Map-Generator/public/modules/ui/style.js`、`style-presets.js`、`public/styles/*.json` | 六套内置主题、用户主题导入导出、颜色级编辑、跨层 token、PNG 和完整地图持久化均已完成。 | 复杂 | 权威任务第 52 项已完成；纹理、字体和高级后处理继续暂缓。 |
| 市场、商品与贸易动画 | `source/Fantasy-Map-Generator/src/controllers/goods-editor.ts`、`markets-overview.ts`、`trade-animation-editor.ts`、`draw-trade-animation.ts` | 商品 / 市场 / 交易总览、市场归属笔刷、经济链受约束重算、供需、运距、价格压力和 CSV / JSON 均已完成；地图贸易流已按用户决定退役。 | 复杂 | 权威任务第 48 项已完成；复杂贸易动画继续暂缓。 |
| 静态军事管理收尾 | `source/Fantasy-Map-Generator/public/modules/ui/regiments-overview.js`、`regiment-editor.js` | 军事生成、国家军力摘要、军事图层、管理面板、静态战报档案、军团编辑和边界态势线均已完成当前范围；用户已明确不需要动态军事系统。 | 中等 | 只在出现真实问题时维护观感、导出、定位和既有记录；不做战斗模拟、自动战役推进或外交 / 经济驱动军事行动。 |

## 长期复杂系统

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 纹章 / Coat of Arms | `source/Fantasy-Map-Generator/public/modules/ui/emblems-editor.js`、`src/generators/emblems/*`、`src/renderers/draw-emblems.ts` | 当前国家、省份、城市有颜色和图标；纹章数据占位、只读显示、轻量图层、按需生成器、编辑和导出设计只作远期资料；尚未有纹章生成、编辑、图库和导出链路。 | 特别复杂 | 用户已明确短期不深化，不实施数据占位、只读图层、生成器或 Armoria 集成；不得自动入队。 |
| 子地图与地图变换 | `source/Fantasy-Map-Generator/public/modules/ui/submap-tool.js`、`transform-tool.js`、`src/generators/resample.ts` | 当前不能从视口裁剪生成新地图，也不能旋转、镜像、缩放后重采样整图。 | 特别复杂 | 先作为远期规划，避免打断当前导入导出和编辑器基础设施。 |

## 当前候选边界

1. 第 45～52、54 项对应能力均已完成，不再从本文件重复创建待办。
2. 静态军事只维护既有编辑、定位、导出和视觉，不扩展动态战争系统。
3. 高度 3D / OBJ、真实 CRS、SVG / 瓦片包、富文本备注、复杂贸易动画和子地图变换继续作为远期候选。
4. 纹章短期不深化，任何相关内容不得自动入队。
