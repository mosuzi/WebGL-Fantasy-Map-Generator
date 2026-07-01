# 原版功能候选积压

本文档记录夜间巡视时对照 `source/Fantasy-Map-Generator` 发现的“有趣但当前 WebGL 版本尚未实现或只部分实现”的功能。目的不是立刻扩张范围，而是把可做、应先文档化和特别复杂的系统分清楚。

## 优先可做

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 测量工具：直尺、曲线尺、路线尺、面积尺 | `source/Fantasy-Map-Generator/public/modules/ui/measurers.js`，`Ruler / Opisometer / RouteOpisometer / Planimeter` | 已完成临时折线测距第一刀；尚未支持面积尺、路线贴合、保存测量对象和编辑节点。 | 中等 | 下一步补面积多边形、节点拖拽和保存/导出。 |
| 对象注记 | `source/Fantasy-Map-Generator/public/modules/ui/notes-editor.js`，`editNotes` | 数据契约和分阶段入口已落到 `docs/task-notes/object-notes-implementation-plan.md`；marker、city、river、route、state、province、culture 与 religion 纯文本备注第一刀已完成，尚未接入标签和独立总览。 | 中等 | 下一步补标签入口；富文本编辑器和 AI 辅助暂缓。 |
| 名称库编辑器 | `source/Fantasy-Map-Generator/src/controllers/namesbase-editor.ts` | 当前有中文命名策略和标签管理，但用户不能维护名称库、权重或文化绑定。 | 中等 | 与当前中文命名优化方向贴合，建议作为命名系统下一阶段。 |
| 分层 GeoJSON 导出 | `source/Fantasy-Map-Generator/public/modules/io/export.js`，`saveGeoJsonRoutes / Rivers / Markers / Zones` | 已完成路线、河流、marker 和 zone 要素 GeoJSON 第一刀；尚缺国家/省份/区域 dissolve、范围选择、分层选择和更完整属性映射。 | 中等 | 下一步补国家/省份 dissolve 或分层选择；SVG、瓦片 zip 暂缓。 |

## 先落文档

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 高度图工作台增强 | `source/Fantasy-Map-Generator/public/modules/ui/heightmap-editor.js`，`source/Fantasy-Map-Generator/src/controllers/view-3d.ts` | 当前已有高度编辑、灰度图导入、黑白反转和适应方式，但没有模板 DSL 编辑、彩色高度图识别、导入预览、3D 地形预览或 OBJ。 | 复杂 | 先补导入预览和色板识别计划；3D/OBJ 单独规划。 |
| 样式预设与视觉风格编辑 | `source/Fantasy-Map-Generator/public/modules/ui/style.js`、`style-presets.js`、`public/styles/*.json` | 当前是固定 WebGL 风格加少量图层/视图开关，缺预设、纹理、滤镜、字体、晕影和色带编辑。 | 复杂 | 可先做轻量主题预设文档；完整样式系统暂不进入当前批次。 |
| 市场、商品与贸易动画 | `source/Fantasy-Map-Generator/src/controllers/goods-editor.ts`、`markets-overview.ts`、`trade-animation-editor.ts`、`draw-trade-animation.ts` | 当前已生成经济、资源和贸易数据，但用户侧没有完整 goods/market 面板和贸易流动画。 | 复杂 | 先做只读市场概览文档；动画和编辑器后置。 |
| 战斗模拟与军事事件 | `source/Fantasy-Map-Generator/public/modules/ui/battle-screen.js`、`regiments-overview.js`、`regiment-editor.js` | 当前有军事生成，但没有军团地图交互、战斗推演、战场 marker 和战斗注记链路。 | 复杂 | 先做军事对象/事件数据契约，再考虑 UI。 |

## 长期复杂系统

| 候选功能 | 原版入口 | 当前缺口 | 复杂度 | 建议 |
|---|---|---|---|---|
| 纹章 / Coat of Arms | `source/Fantasy-Map-Generator/public/modules/ui/emblems-editor.js`、`src/generators/emblems/*`、`src/renderers/draw-emblems.ts` | 当前国家、省份、城市有颜色和图标，但没有纹章生成、编辑、图库和导出链路。 | 特别复杂 | 先只保留占位和数据接口，等核心编辑器稳定后再决策。 |
| 子地图与地图变换 | `source/Fantasy-Map-Generator/public/modules/ui/submap-tool.js`、`transform-tool.js`、`src/generators/resample.ts` | 当前不能从视口裁剪生成新地图，也不能旋转、镜像、缩放后重采样整图。 | 特别复杂 | 先作为远期规划，避免打断当前导入导出和编辑器基础设施。 |

## 建议顺序

1. 测量工具：最能增强制图工具感，也能直接复用当前比例尺和相机坐标。
2. 对象注记：为标签和战斗事件后续铺路。
3. 名称库编辑器：与当前中文命名策略高度相关，能给用户可控性。
4. 分层 GeoJSON：路线、河流、marker、zone 第一刀已完成；后续可继续做国家/省份 dissolve、分层选择和范围导出。
