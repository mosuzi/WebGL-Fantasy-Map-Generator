# 当前开发计划

本文档用于追踪当前阶段计划。后续每次推进里程碑或改变路线，都应同步更新这里。

## 总目标

基于 `source/Fantasy-Map-Generator` 的功能、数据结构和视觉表现，复刻一个功能相似但使用 WebGL 实现的独立地图生成器。`source/` 只作为参考实现、行为对照和性能基线，不作为被修改或被接入的目标代码库。

## 当前阶段：阶段 3，世界语义生成与图层补全

第 0 里程碑性能基线、第 1 阶段 WebGL 快照 demo、阶段 2 独立生成器工程骨架和最小生成内核已完成。当前进入阶段 3：在 `app/webgl-generator/` 中补齐文化、宗教、国家、省份、区域、城市、道路、标签和对象级交互等世界语义能力；`prototype/webgl-cells/` 继续保留为源项目快照 demo 和视觉对照。

## 当前已完成

- 第 0 里程碑：
  - 新增 `tools/fmg-profile.mjs`。
  - 生成 `docs/performance-baseline-results.json` 和 `docs/performance-baseline-results.md`。
  - 建立中文协作文档和开发历史。
- 第 1 里程碑：
  - 新增 `tools/fmg-export-snapshot.mjs`，从原项目运行时导出真实地图快照。
  - 新增 `tools/serve-prototype.mjs`，提供无依赖静态服务器。
  - 新增 `prototype/webgl-cells/` 原型。
  - 新增 `prototype/webgl-cells/data/sample-map.json`，作为当前原型默认数据。
  - 新增 `docs/milestone-1-webgl-prototype.md`。
- 阶段 2：
  - 新增 `app/webgl-generator/` 正式应用目录。
  - 新增正式应用的运行时、生成器、WebGL 占位 renderer 和 UI 面板骨架。
  - 新应用当前只生成本项目代码创建的占位地图，不读取 demo 快照，不接入 `source/Fantasy-Map-Generator`。
  - 新增 `app/webgl-generator/README.md` 记录目录职责、启动命令和与 demo/source 的边界。
  - 已完成浏览器验收：正式应用页面可加载，WebGL2 画面非空，生成按钮可更新 seed 和目标 cells。
  - 已完成步骤 2.2：新增可复现 PRNG、seed/options 规范化、随机 seed 开关、稳定生成摘要和生成日志。
  - 同一 seed/options 的 `summary.checksum` 稳定一致，不同 seed 会产生不同摘要；当前稳定性以 `summary` 为准，`generatedAt` 不参与摘要。
  - 已完成步骤 2.3：新增自生成点集、近似 Voronoi grid、`grid.points`、`grid.cells.v`、`grid.vertices.p`、基础高度和 WebGL cell mesh 渲染。
  - 已按浏览器观察修正步骤 2.3 的点集规整感：正式应用 grid 点集从单纯行列抖动改为局部随机、行列错位和低频 warp 叠加的分层扰动。
  - 正式应用已支持拖拽平移、滚轮缩放和适配视图；统计面板显示实际 grid cells、Voronoi 顶点、cell 三角形、GPU 顶点和相机状态。
  - 用户询问是否引入 Vite；当前决策是暂不引入，继续原生 ESM + 静态服务器。原因是正式应用当前无 npm 依赖且只面向高版本 Chrome，后续需要打包、worker、第三方库或测试集成时再引入 Vite。
  - 已完成步骤 2.4：新增 seed 驱动 heightmap、海陆/湖泊 feature 提取、海岸线/湖岸线 line pass 和对应统计。
  - 已按浏览器观察和 demo 对照继续修正步骤 2.4 的地形自然感：heightmap 从连续噪声/构造带采样改为接近 source `continents` 模板的图邻接传播流程，按 `Hill`、`Range`、`Strait`、`Trough`、`Pit`、`Mask`、`Smooth` 顺序生成高度，并加入 ridge 约束、海陆再平衡和 demo 高度分布校准，减少环形/气团状山体、大面积白色高原和高山突兀感。
  - 已为正式应用新增地形模板控制：当前可选择大陆、地中海、高山岛屿、平原岛屿、一侧大陆、盘古大陆和群岛，避免所有 seed 都落在同一种偏圆大陆形态。
  - 已完成步骤 2.5：新增第一版 `pack` 语义图、`grid.cells.pack` 映射、基础 polygon picking 和悬停面板。
  - 当前 `pack` 采用 `one-grid-cell-to-one-pack-cell` 阶段性映射，后续仍需升级为真正承载国家、河流、城市等业务语义的抽稀/重建图。
  - 已完成步骤 2.6：新增温度、降水、生物群系、最小河网、专题切换和悬停气候字段。
  - 已按浏览器观察修正步骤 2.6 的河流混乱问题：河流从逐条贪心下坡改为轻量填洼、无环流向图、flux 汇水和河源间距筛选。
  - 已进入阶段 3 并完成步骤 3.1：新增文化、宗教、中文名称表、文化/宗教专题面和悬停文化/宗教字段。
  - 已完成步骤 3.2：新增国家、省份、区域生成、政治专题面、pack 语义字段和悬停政治字段。
  - 已完成步骤 3.3：新增城市、首都/省会/港口、基础人口估算、道路/小路、人口专题面、城市/人口 hover 字段和 WebGL 点层。
  - 已推进步骤 3.4：新增城市标签 HTML overlay，优先显示首都、省会、高人口城市和港口，并随 WebGL 相机投影到屏幕位置。
  - 城市标签已具备第一版缩放 LOD、屏幕碰撞盒避让和可见数量上限；道路/小路已从 `gl.LINES` 拆成独立屏幕空间三角形带 mesh，并补上基础 miter join 和 square cap。
  - 路线已接入第一版 hover picking，悬停面板可显示路线起终点、类型和命中距离。

## 第 1 里程碑当前结果

当前原型已经跑通：

- 读取真实 FMG 运行时快照。
- 将 `grid.points`、`grid.cells.v` 和 `grid.vertices.p` 转换为底层 cell 三角形。
- 保留 `pack.cells` 用于国家、边界、河流、picking 等业务语义图层。
- 上传位置和当前专题颜色到 WebGL buffer。
- 使用 WebGL2 渲染高度、生物群系、国家、省份、文化、宗教和温度专题面。
- 支持鼠标拖拽平移、滚轮缩放和视图适配。
- 支持原型级国家边界线 pass。
- 支持原型级河流 line pass。
- 支持基于均匀网格空间索引的鼠标悬停 cell picking，显示 cell id、高度、国家、候选数量、耗时和世界坐标。
- 显示构建、上传、绘制耗时。
- 已整理 WebGL 原型与 SVG 基线的阶段性性能对照，见 `docs/webgl-svg-performance-comparison.md`。
- 渲染器接口已收敛到接近 `GraphicsMapRenderer` 的形态：
  - 导出 `GraphicsMapRenderer`，并保留 `CellWebGLRenderer` 兼容别名。
  - 提供 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
- 已新增正式 WebGL 原型性能采集脚本：
  - `tools/webgl-prototype-profile.mjs`
  - `docs/webgl-prototype-profile-results.json`
  - `docs/webgl-prototype-profile-results.md`
- 已修正底层 mesh 数据源：
  - 之前误用 `pack.cells` 作为基础 cell mesh，水域/边界 pack cell 会出现大多边形，导致视觉上出现巨型三角 cell。
  - 现在快照导出 `grid` 数据，基础 mesh 使用 `grid`，pack 只保留业务语义。
- 已修正原型级河流折线的河口处理：
  - 早期快照没有保存 meandered points，WebGL fallback 曾使用 cell 中心折线。
  - 河流折线遇到第一个水域 cell 会停在近似河口点，避免画到海里一段距离。
- 已修正河流宽度和河口对齐：
  - 快照导出新增 `pack.cells.fl`、`pack.cells.r` 和河流 source/mouth/parent/discharge/length/meandered points 等字段。
  - WebGL 河流层从 `gl.LINES` 改为三角形带 mesh，按 source 的源头宽度、流量和路径长度趋势计算沿程宽度。
  - 河口不再停在 cell 中心或越过海岸线，而是优先裁剪到最后陆地 cell 与首个水域 cell 的共享边中点。
- 已修正湖中岛和纹章占位默认策略：
  - 湖泊图层开启时，湖泊填色按真实 lake water cells 构建，不再用整个 lake feature 外轮廓扇形填充，避免凹形湖岸、半岛或湖中陆块被误盖成湖泊。
  - `lake_island` feature 会在湖泊填色后重新以陆地色填回，避免小型湖中岛被湖水覆盖。
  - 纹章系统暂不启用，纹章占位 overlay 默认关闭，只保留后续接入数据和手动开关。
- 已做边界和中文命名的 demo 级视觉优化：
  - 省界颜色改为连续灰线，不再跳绘；路线改为更暖的棕/金色，并从 `gl.LINES` 改成略粗的三角形带，避免省界和道路混在一起。
  - 绘制顺序调整为省界先绘制、国界后绘制，避免省界压过国界。
  - 新增本地中文地名库，部分国家和其城市标签会确定性显示为中式名称；当前只是 demo 表现层策略，后续可扩展为时代/文化风格配置。
- 已按 `docs/gl-reimplementation-acceptance-plan.md` 完成步骤 1.1：
  - `renderer.js` 收敛为 `GraphicsMapRenderer` 主类和 WebGL draw/API 门面。
  - 新增 `camera.js`、`buffers.js`、`picking.js`、`colors.js`、`layers.js`、`utils.js`，拆出相机、buffer、picking、颜色和图层状态职责。
  - 保留 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()`、`getStats()` 对外 API，以及 `CellWebGLRenderer` 兼容别名。
- 已按 `docs/gl-reimplementation-acceptance-plan.md` 完成步骤 1.2：
  - 快照导出新增 `pack.features`、`cells.f`、feature/lake 统计和湖泊 group/type 分类数据。
  - demo 新增陆地底色、湖泊填色、海岸线和湖岸线 WebGL 图层。
  - 基础 cell mesh 仍使用 `grid`；feature 图层只使用 `pack.features` 和 `pack.vertices` 做业务语义表达。
  - UI 新增陆地底色、湖泊、海岸/湖岸线开关。
- 已按 `docs/gl-reimplementation-acceptance-plan.md` 完成步骤 1.3：
  - 快照导出新增 `pack.cells.province/culture/religion/biome`、`grid.cells.temp`、`pack.provinces/cultures/religions` 和 `biomesData` 颜色/名称元数据。
  - 新增 `themes.js`，集中管理 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 专题面定义和 palette。
  - cell 几何仍只构建一套 grid mesh；专题切换仅重算并上传当前专题颜色 buffer，不重建 position buffer。
  - UI 的渲染模式扩展为七个专题按钮，统计面板显示当前专题、字段来源、专题值数、颜色 buffer 顶点数和专题更新耗时。
  - hover picking 保留原空间索引，并补充生物群系、省份、文化、宗教和温度字段。
- 已按 `docs/gl-reimplementation-acceptance-plan.md` 完成步骤 1.4：
  - 快照导出新增 `pack.routes`，保留 `roads`、`trails`、`searoutes` 分组和路线点列。
  - 新增 `lines.js`，统一构建河流、路线、国家边界和省份边界四类 WebGL line layer。
  - 国家边界和省份边界已拆成独立图层，`setLayerVisible("borders")` 仍保留为兼容别名。
  - UI 新增省份边界和路线开关，统计面板显示四类线图层线段数、路线数量和路线分组。
  - 当前仍使用 `gl.LINES`，宽线、join/cap、dash 和 line picking 放入后续步骤。
- 已按 `docs/gl-reimplementation-acceptance-plan.md` 完成步骤 1.5：
  - 快照导出新增 `grid.cells.prec`、`pack.cells.pop`、`pack.cells.burg`、`pack.burgs` 和 `pack.markers`。
  - 新增 `points.js`，统一构建降水、人口、城市/港口和 marker 四类 WebGL point layer。
  - UI 新增四类点层开关，统计面板显示点层数量、港口数量和 marker 分组。
  - 当前仍使用 `gl.POINTS` 占位，sprite atlas、LOD 和对象级 picking 放入后续步骤。
- 已按 `docs/gl-reimplementation-acceptance-plan.md` 完成步骤 1.6：
  - 快照导出新增普通城市标签、国家标签占位和纹章占位所需的轻量语义数据。
  - 新增 `overlays.js`，用 HTML/SVG overlay 表达城市标签、国家中心标签占位和纹章 badge 占位。
  - overlay 通过 renderer 的 view listener 跟随 WebGL camera，容器 `pointer-events: none`，不阻塞 canvas 拖拽、缩放和 hover picking。
  - UI 新增城市标签、国家标签占位和纹章占位开关，统计面板显示 overlay 数量和短期策略。

当前默认快照摘要：

| 指标 | 数值 |
|---|---:|
| 目标 cells | 100000 |
| 实际 grid cells | 99846 |
| 实际 pack cells | 72343 |
| 渲染来源 | grid |
| grid Voronoi 顶点 | 200338 |
| pack Voronoi 顶点 | 145332 |
| cell 三角形 | 598521 |
| cell GPU 顶点 | 1795563 |
| feature 数 | 242 |
| 陆地 feature | 120 |
| 湖泊 feature | 112 |
| 湖中岛 feature | 27 |
| 湖泊三角形 | 16707 |
| 湖中岛三角形 | 339 |
| 海岸线段 | 12651 |
| 湖岸线段 | 5453 |
| 国家边界线段 | 2235 |
| 省份边界线段 | 17102 |
| 路线数量 | 1294 |
| 路线分组 | roads: 14，trails: 1051，searoutes: 229 |
| 路线线段 | 15260 |
| 路线三角形 | 30520 |
| 河流数量 | 1240 |
| 河流线段 | 7537 |
| 河流三角形 | 15074 |
| 河口裁剪 | 773 |
| 河流宽度范围 | 0.35 - 5.21 |
| 降水点 | 48538 |
| 人口 instances | 51183 |
| 农村人口点 | 49594 |
| 城市/港口点 | 1589 |
| 港口点 | 252 |
| marker 点 | 502 |
| 城市标签 | 1589 |
| 国家标签占位 | 15 |
| 中文国家/城市名 | 5 / 888 |
| 纹章占位 | 1604 |
| 纹章默认状态 | 关闭 |
| picking 索引桶 | 48420 |
| 地图尺寸 | 1440 x 960 |

当前机器上的一次验证结果：

| 指标 | 数值 |
|---|---:|
| 河流干净视图绘制 | 0.2ms |
| 河流三角形 | 15074 |
| 河口裁剪 | 773 |
| 河流宽度范围 | 0.35 - 5.21 |
| WebGL error | 0 |

当前正式采集结果：

| 指标 | 数值 |
|---|---:|
| 采样次数 | 10 |
| buffer 构建 | 336.5ms |
| buffer 上传 | 36.6ms |
| draw 平均值 | 0.27ms |
| draw 最大值 | 1.3ms |
| picking 平均值 | 0.01ms |
| picking 最大值 | 0.1ms |

## 运行命令

导出快照：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json
```

启动原型：

```powershell
Set-Location D:\work\fmg
node .\tools\serve-prototype.mjs --port 5400
```

访问：

```text
http://127.0.0.1:5400
```

启动正式应用：

```powershell
Set-Location D:\work\fmg
node .\tools\serve-prototype.mjs --port 5410 --dir .\app\webgl-generator
```

访问：

```text
http://127.0.0.1:5410
```

## 下一步

1. 步骤 2.1 到 2.6、步骤 3.1、步骤 3.2 和步骤 3.3 已完成：`app/webgl-generator/` 是正式应用入口，`prototype/webgl-cells/` 继续保留为快照 demo。
2. 当前暂不引入 Vite，继续原生 ESM + 静态服务器；后续需要打包、worker、第三方库或测试集成时再引入。
3. 下一步继续步骤 3.4：补路线点击选择、城市/路线对象级 picking、城市详情面板、道路 dash/等级样式和更完整的急弯 bevel 策略。
4. 地形后续仍需继续接近 source 的完整模板化 heightmap：当前已完成 graph propagation 和第一批多模板切换，但还缺少真实侵蚀、河谷切割、湖泊出口、更多模板和模板参数 UI。
5. 后续需要把当前 1:1 `pack` 升级成更接近 source 的语义图，并继续补文本、marker 和对象级 picking。
6. 点图层后续需要从当前 `gl.POINTS` 占位推进到 sprite atlas、marker pin、LOD 和 burg/marker picking。
7. 非河流线图层后续需要从当前 `gl.LINES` 推进到可扩展 polyline mesh，以支持宽线、join/cap、dash 和 line picking；河流后续继续补 join/cap 和更精细的曲线平滑。
8. 后续 UI 面板需要从当前固定侧栏逐步升级为 HTML 浮动可拖动面板；生成配置、高度编辑、河流编辑、城市/道路编辑、国家/省份/文化/宗教/标签编辑等面板都遵循该方向。面板不使用 canvas 实现，本阶段只记录约束，暂不改动现有侧栏。

## 约束

- 新项目代码仍然放在根目录下，不放进 `source/`。
- `source/` 只读参考；允许为运行参考项目安装依赖并产生锁文件，例如 `pnpm-lock.yaml`，但不得修改原项目源码。
- 所有文档继续使用中文。
- 代码注释保持必要且克制。
- UI 面板长期目标是普通 DOM/HTML 浮动可拖动面板，不使用 canvas 绘制面板；现有固定配置面板是阶段性实现。
