# 面板布局与 overlay 性能治理计划

本文档记录当前面板布局和非 WebGL overlay 性能治理的证据、边界和执行顺序。它是 `docs/current-plan.md` 中“面板布局宽松化”和“非 WebGL overlay 性能治理”的专题施工入口。

## 背景

- 当前浮动面板数量已经覆盖国家、省份、城市、文化、宗教、外交、政体、经济、军事、路线、河流、湖泊、资源标记、测量对象和名称库等领域。
- 面板内容越来越密集，一些 summary / detail / sort / action 区域仍使用固定列数或过窄按钮，容易出现奇怪折行、文本被挤压或表格列过窄。
- 地图上非 WebGL 内容越来越多：国家 / 城市 / 自定义标签、城市剪影、marker 图标、军事图标、测量 SVG 和比例尺等都由 DOM/SVG overlay 承载。拖动、缩放时这些 overlay 的 class/style 更新可能成为卡顿来源。

## 当前证据

### 文档与代码观察

- `PlaceholderMapRenderer.buildLabels()` 会一次性创建标签、城市图标、marker 图标、军事图标和选中标记 DOM，并挂到 `#map-overlay`。
- `PlaceholderMapRenderer.updateLabels()` 会在绘制后扫描标签、城市图标、marker 图标和军事图标，逐个计算屏幕坐标、碰撞、显隐 class 和 `left/top` 样式。
- `updateMeasurementOverlay()` 会在测量更新时对 `#measurement-svg` 执行 `replaceChildren()`，再重建已保存测量对象、当前测量路径和控制点。
- 多个面板 summary / detail 区域仍使用固定列数，例如 `repeat(4, minmax(0, 1fr))`、`repeat(5, minmax(0, 1fr))` 或 `repeat(6, ...)` 的等宽布局；长字段虽然有 `overflow-wrap`，但空间不足时仍会显得局促。
- 浮动面板默认宽度仍由各面板单独指定或继承较窄默认值，缺少按面板类型的宽度等级。

### 构建产物临时审计

2026-07-04 使用构建产物和 Playwright 临时脚本打开主要管理面板并读取 DOM 尺寸。脚本对部分后续按钮命中不够完整，不能替代视觉验收，但可作为第一轮定位依据：

- 构建通过：`$env:CI='true'; pnpm run build:app`，仅保留既有 Vite 大 chunk 警告。
- 初始 overlay 统计：`#map-overlay` 子节点约 `1814`；标签 `841`，可见标签 `24`；城市图标 `821`，可见城市图标 `11`；marker 图标 `44`，当前可见 `0`。
- 国家 / 省份 / 城市 / 外交 / 经济 / 军事 / 路线 / 河流 / 湖泊等已打开面板在脚本样本中没有 body 横向滚动。
- 文化面板 summary 宽 `554px`，6 个指标项最小宽约 `86px`；宗教面板 summary 宽 `574px`，6 个指标项最小宽约 `89px`。这类 6 列 summary 是“空间吝啬”的优先修正对象。
- 隐藏的原生 select / slider bridge 会被通用溢出探针误报，应在后续审计脚本中排除 `.ui-select-native`、`.ui-slider-native` 等兼容桥。

## 执行边界

- 第一阶段只做布局和 overlay 性能治理，不新增新业务功能。
- 不以“把所有 overlay 迁回 WebGL”为默认结论；先测量 pan/zoom 时的实际耗时，再决定迁移或降负。
- 不为节省空间继续压缩文字。横向不足时优先增加面板宽度、让字段跨行、允许按钮换行或让表格横向滚动。
- 不牺牲桌面信息密度去适配极窄移动屏；当前目标仍是现代 PC 浏览器和平板不破版。

## 阶段 1：面板布局审计与共享规则

目标：先修明显的空间策略问题，让后续每个面板不用单独补丁。

步骤：

1. 用浏览器脚本固定打开主要面板，排除隐藏 bridge 控件后统计：
   - body 横向滚动；
   - summary / detail 最小格宽；
   - 按钮高度异常；
   - 表格列压缩；
   - 长字段是否应跨整行。
2. 给浮动面板建立宽度等级：
   - 摘要 / 详情小面板：`520-600px`；
   - 列表管理面板：`640-760px`；
   - 大表格 / 矩阵面板：`780-900px`。
3. 共享组件优先改：
   - `UiMetricGrid`：支持 `minItemWidth` 或 class 级自适应，默认用 `repeat(auto-fit, minmax(120px, 1fr))`。
   - `UiDetailGrid`：支持长字段跨整行，避免“政体影响 / 资源类型 / 外交摘要 / 继承路径”等被压在短列里。
   - `UiSortBar`：允许按钮自然换行，按钮文本不再强制硬塞到固定小列。
   - `UiObjectTable`：确认列最小宽策略，必要时让表格容器横向滚动，而不是压扁名称和摘要列。
4. 第一批只覆盖共享规则和最明显窄格，不做单个面板大重排。

验收：

- 主要面板打开后没有非预期 body 横向滚动。
- summary / detail 指标项最小宽度默认不低于 `112px`；确需更密集的面板必须显式说明。
- 长摘要字段能自然跨行或跨整行，不出现单字竖排式折行。
- 构建通过，正式 e2e 守门不退化。
- default、narrow 和 deep 三类审计均已满足布局验收；下一步不再扩普通审计样本，除非用户提供新截图、具体面板或 seed。

## 阶段 2：overlay pan/zoom profile

目标：先量化移动和缩放卡顿来源，再决定降负方式。

当前进展：

- 已新增 `tools/webgl-generator-overlay-profile.mjs` 和 `pnpm run profile:overlay`，可服务构建产物、生成固定地图、执行连续滚轮缩放与中键拖动画布，并输出 frame interval、WebGL draw、overlay 更新分项、overlay 节点数和长任务数量。
- renderer `getStats()` 已补 `overlay.childCount / overlay.update`，其中 `overlay.update` 记录 `labels / cityIcons / markerIcons / militaryIcons / selection` 分项耗时、总耗时和总数 / 可见数。
- 2026-07-04 以 `overlay-profile-smoke / continents / 10000` 跑出第一版基线：初始 overlay 节点 `1944`，标签 `24 / 901`，城市图标 `8 / 881`，marker 图标 `0 / 46`，军事图标 `21 / 115`。
- 同一基线中，连续滚轮缩放 overlay p95 `3.2ms`、拖动画布 overlay p95 `1.6ms`；当前 10k 样本下 overlay DOM 更新不是主要瓶颈。帧 p95 仍有缩放 `58.8ms`、拖动 `35.3ms` 的浏览器调度 / draw 抖动，后续应优先扩大到 50k / 100k 与图层开关矩阵再判断是否做降负。
- 50k / 100k 扩展 profile 已确认：overlay 本身仍不是主要瓶颈。100k 完整图层下，路线 screen mesh 构建约 `30-37ms`，河流 screen mesh 构建约 `13-17ms`，关闭路线和河流后交互 draw 接近 `0.06ms`。
- 已执行交互降级第一刀：拖动 / 滚轮期间只绘制基础图层与 overlay，暂不绘制已标 dirty 的路线、河流和选中 screen mesh；停止输入约 `120ms` 后自动完整重建。100k 完整图层中键拖动 frame p95 从约 `88.2ms` 降到 `35.3ms`，draw 均值从约 `43.77ms` 降到 `0.04ms`。
- 已执行路线 / 河流 viewport 粗筛第一刀：动态 screen-space mesh 会按当前相机视口世界范围加 `96px` margin 跳过完全屏幕外的路线和河流，并把 `culledRoutes / culledRivers` 写入 stats 与 overlay profile 报告。`overlay-profile-100k / continents / 100000` 完整图层缩放 profile 中路线渲染 / 筛掉为 `742 / 434`，河流渲染 / 筛掉为 `466 / 279`；缩放 frame p95 `135.2ms`、拖动 frame p95 `41.2ms`，仍在守门阈值内。后续若继续优化，应评估分块缓存、跨帧重建或轻量交互态线层。
- 面板布局第二轮已修正 `UiSegmented`：不再依赖 Element Plus 的额外选中指示层和横向滚动条，默认改为可换行 grid；经济面板三段控件在窄列中会自然换成两行，marker 三段控件保持一行三列，面板 body 无横向溢出。
- 面板布局自动审计第一刀已完成：新增 `tools/webgl-generator-panel-layout-audit.mjs` 和 `pnpm run audit:panels`，可服务构建产物、生成固定地图、打开主要浮动面板并记录 body 横向滚动、summary/detail 最小项宽、segmented 行数、表格横向滚动和疑似文字溢出。`panel-layout-audit-smoke / continents / 10000 / 1280x820` 最终审计未发现待复核项；资源标记面板三段切换左列已放宽到 `300px`，避免“资源点”有效文字区过窄。审计已排除隐藏的 `UiSegmented` bridge button，避免把兼容按钮误判成可见溢出。
- 窄视口审计已完成：`panel-layout-narrow-smoke / continents / 10000 / 1024x720` 构建产物审计未发现待复核项，页面横向溢出为 `0`，同 seed e2e 守门 WebGL 加载 `323.7ms`。面板后续若继续，应优先转向长字段、表格列较多和二级编辑展开态，而不是重复默认 / 窄视口样本。
- overlay 图层矩阵已完成：`tools/webgl-generator-overlay-profile.mjs` 支持 `overlayMatrix`，依次采集完整图层、关闭文字标签、关闭城市图标、关闭资源 / 标记图标、关闭军事图标、关闭路线 / 河流。`overlay-matrix-100k / continents / 100000` 通过守门；完整图层缩放 frame p95 `88.3ms`、拖动 frame p95 `35.3ms`，overlay p95 最高约 `5.1ms`；关闭路线 / 河流时 route / river 构建耗时和渲染数量在报告中归零，避免缓存统计误导。该矩阵仍不支持把标签、城市剪影、marker 或军事图标默认迁到 WebGL，后续只在测量 SVG 多对象、选中态高频变化或极端标签数量能复现问题时继续降负。
- 面板 deep 场景审计已完成：`tools/webgl-generator-panel-layout-audit.mjs` 支持 `--scenario deep`，会注入长字段样本、等待异步面板预热完成、打开主要面板、选中对象并展开可用二级编辑面板，同时把 health 事件单独列出而不计入布局待复核项。`panel-layout-deep-smoke / continents / 10000 / 1280x820` 未发现布局待复核项，面板预热 `18 / 18` 完成；连续打开面板仍有 health 长任务事件，后续应转为独立 panel-open 性能诊断。
- 当前 overlay 复测与交互降级已完成：`current-overlay-retest-100k / continents / 100000` 复测显示，完整图层滚轮 frame p95 曾为 `111.7ms`，关闭地图 DOM 图标和标签后降为 `6ms`，说明浏览器样式 / 布局成本没有被 renderer 内部 overlay 分项完全捕获。本轮让 `drawViewportPreview()` 在拖动 / 滚轮期间隐藏 `#map-overlay` 并跳过 `updateLabels()`，idle commit 后恢复。最终同 seed 完整图层滚轮 p95 `6ms`、拖动 p95 `17.7ms`，overlay 交互样本全部暂停，idle 后 `finalSuspended = false`。

步骤：

1. 新增或扩展临时 / 正式 profile 脚本，固定地图 seed 后执行：
   - 连续拖动画布；
   - 连续滚轮缩放；
   - 开关城市、标签、资源、军事、测量图层；
   - 记录每轮的 WebGL draw、overlay 更新、帧间隔和主线程长任务。
2. 给 renderer stats 增加或临时采集这些指标：
   - `overlayChildren`；
   - label / cityIcon / markerIcon / militaryIcon 总数和可见数；
   - `updateLabels()` 总耗时；
   - `updateCityIcons()`、`updateMarkerIcons()`、`updateMilitaryIcons()` 分项耗时；
   - 测量 SVG 重建耗时和 path 数量。
3. 输出报告到 `docs/generated/reports/`，专题文档只记录摘要和决策。

验收：

- 能复现拖动 / 缩放时的帧耗时分布。
- 能区分 WebGL 绘制慢、overlay 更新慢、面板 / 其它 DOM 慢。
- 没有证据前不做大迁移。
- 10k / 50k / 100k 基线和 100k 图层矩阵已满足前三项；测量 SVG 多对象和选中态高频变化尚未单独压测。

### 面板打开 profile 与原生对象表格

背景：

- deep 布局审计证明主要面板没有实际布局待复核项，但连续打开面板仍会触发 health 长任务事件。
- 聚焦 profile 进一步拆出慢点：城市、路线、标签面板的首行选中阶段最重，失败样本中城市管理总耗时约 `2151.8ms`、路线管理约 `1280.3ms`、标签管理约 `1792.9ms`，主要长任务出现在选中行后。

修正：

- 新增 `tools/webgl-generator-panel-open-profile.mjs` 和 `pnpm run profile:panels`，按面板记录打开、选中、二级操作、longtask、health 和行数。
- selection 联动改为只更新当前相关面板，不再在任意 selection 变化时刷新所有已注册对象面板。
- 面板自身表格点选使用 source panel 标记，避免“点一行 -> 全局 selection -> 同一个大表格 version++ 重算”的反向刷新。
- 河流 / 湖泊面板补轻量 `setSelection()`，标签面板 `setSelectedLabelKey()` 不再递增 `version`。
- 共享 `UiObjectTable` 从 Element Plus `ElTable` 改成轻量原生 table，保留列最小宽、选中态、定位按钮、sticky 表头、sticky 定位列和横向滚动；布局审计和面板 profile 同步识别新表格行。

验证：

- `node --check .\tools\webgl-generator-panel-open-profile.mjs`、`node --check .\tools\webgl-generator-panel-layout-audit.mjs`、`node --check .\app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅保留既有 Vite 大 chunk 警告。
- focused profile 通过：`city-panel / route-panel / river-panel / label-naming-panel` 中，城市管理 `369ms`、路线管理 `288.9ms`、河流管理 `220.7ms`、标签管理 `344.8ms`，health 事件均为 `0`。
- 全量 profile 通过：17 个面板 health 事件 `0`；最慢为城市管理 `371.3ms`、标签管理 `368.8ms`、路线管理 `294.6ms`。
- deep 布局审计 `panel-table-native-deep / continents / 10000` 通过，布局待复核项 `0`，所有主要表格按需要横向滚动而不是压缩文本。
- e2e 守门 `panel-table-native-smoke / continents / 10000` 通过，点击到出图 `1790.1ms`，WebGL 加载 `426.2ms`，最慢加载阶段为“构建视觉 cell mesh” `67.6ms`。

结论：

- 面板打开长任务第一刀已经收敛，不再作为当前执行队列项。
- 后续面板方向只处理具体复现的折行、错位或局部空间不足；若再次出现打开/选中长任务，先用 `pnpm run profile:panels` 定位到具体面板和阶段。

## 阶段 3：overlay 降负第一刀

候选优化按风险从低到高排序：

1. `requestAnimationFrame` 合并：拖动 / 缩放期间合并 overlay 更新，避免同一帧内重复扫描。
2. 图层短路：标签、城市图标、marker 图标、军事图标、测量图层关闭或缩放阈值不足时，不进入对应扫描。
3. viewport 粗筛：先用世界坐标和相机范围排除明显屏幕外对象，再做精确 box 和碰撞。
4. 交互中降级：拖动 / 缩放过程中只做必要 transform 或低频 overlay 更新，停止交互后补完整碰撞。
5. 测量 SVG 缓存：点列未变时避免 `replaceChildren()` 全量重建；已保存对象多时按 dirty 标记更新。

暂不默认执行：

- 不直接把所有城市 / marker / 军事图标重写成 WebGL texture atlas。
- 不删除现有近景图标表现。
- 不把测量编辑点迁到 WebGL；可交互编辑点仍适合 DOM/SVG。

当前决策：

- `requestAnimationFrame` 合并曾做临时验证，但 100k profile 变差，未保留。
- 第一刀采用“交互中降级”，因为证据显示连续交互时最重的是路线 / 河流 screen mesh 重建，而不是 overlay DOM 更新。
- 第二刀把地图 DOM overlay 也纳入“交互中降级”：拖动 / 滚轮期间隐藏 `#map-overlay` 并跳过标签、城市剪影、marker 图标和军事图标更新，停止输入约 `120ms` 后恢复完整 overlay。该方案不迁移 overlay 到 WebGL，也不影响测量 SVG。
- 后续如果继续优化，应优先处理路线 / 河流 idle commit 的分块缓存、跨帧重建或轻量交互态线层，而不是迁移标签、城市剪影、marker 图标或军事图标。

## 阶段 4：复测与提交规则

- 每一刀完成后必须跑构建和正式 e2e 守门。
- overlay 性能改动还必须跑 pan/zoom profile，对比修改前后的帧耗时和 overlay 更新时间。
- 如果任何一步引入加载或绘制卡顿，先修卡顿，再进入下一步。
- 每一步单独提交；不要把布局、overlay profile 和业务功能混成一个提交。
