# WebGL 地图生成器复刻可验收计划

本文档由“太子”制定并修正，用于规划 `D:\work\fmg` 的 WebGL 地图生成器复刻项目。当前路线不是修改原 Fantasy Map Generator，也不是把 WebGL 接入原项目主视图，而是在本仓库根目录下实现一个功能相似、参考原项目行为、使用 WebGL 渲染的独立地图生成器。

`source/Fantasy-Map-Generator` 只作为参考实现、行为对照、数据来源和性能基线。禁止修改原项目源码；只有为了安装依赖和运行参考项目而产生的锁文件例外，例如 `pnpm-lock.yaml`。

## 1. 角色流水线

后续每一个步骤都按固定流转执行：

1. **尚书实施**：按本文档当前步骤修改代码、脚本或文档。实施时不得把新项目代码写入 `source/`，也不得修改原项目源码。
2. **门下检查**：检查当前改动是否符合本文档预期，是否误改无关文件，是否存在 lint、语法、构建或脚本错误。门下不做功能实现，只给出通过或退回意见。
3. **侍中验收**：使用 in-app browser 打开对应页面，按本文档浏览器验收点验证可见表现和交互。侍中不修改代码，只验证运行效果。
4. **自动进入下一步**：只有尚书完成、门下通过、侍中通过后，才进入下一步。任一角色退回时，尚书先修正同一步，不得跳步。

每步完成后必须把结果追加到 `docs/development-log.md`；如果计划或下一步发生变化，必须同步更新 `docs/current-plan.md`。

## 2. 当前事实基线

- 原项目入口和运行时主干位于 `source/Fantasy-Map-Generator/public/main.js`，生成流程由 `generate()` 串联高度、湖泊、海洋、气候、pack、河流、生物群系、文化、城市、国家、道路、宗教、省份、军队、标记和区域生成。
- 原 SVG 图层顺序在 `public/main.js` 中创建，主要顺序为 `ocean`、`landmass`、`texture`、`terrs`、`lakes`、`biomes`、`cells`、`gridOverlay`、`coordinates`、`compass`、`rivers`、`terrain`、`relig`、`cults`、`regions`、`provs`、`zones`、`borders`、`routes`、`temperature`、`coastline`、`ice`、`prec`、`population`、`emblems`、`icons`、`labels`、`armies`、`markers`、`fogging`、`ruler`、`debug`。
- 图层调度集中在 `public/modules/ui/layers.js` 的 `drawLayers()` 和各 `toggle*()` 函数。
- 保存 `.map` 由 `public/modules/io/save.js` 的 `prepareMapData()` 负责，当前会序列化 SVG 和 `grid`、`pack`、样式、字体等数据。
- 图片和数据导出由 `public/modules/io/export.js` 负责，当前 PNG/JPEG 通过克隆 SVG 再画入 canvas，SVG 导出直接序列化 SVG。
- 当前独立 WebGL demo 已证明：底层 cell mesh 必须使用 `grid.points`、`grid.cells.v`、`grid.vertices.p`，`pack.cells` 只用于国家、边界、河流、picking 等语义层。不得把 `pack.cells` 当作均匀底层网格。

## 3. 总体目标

目标是复刻一个独立 WebGL 地图生成器：

1. 参考原项目的生成流程、数据字段、图层职责、编辑体验和导出能力。
2. 在新项目代码中实现自己的生成内核、运行时数据模型、WebGL renderer、交互编辑器、保存加载和导出功能。
3. 使用原项目作为行为样本和视觉对照，可以读取源码、运行页面、导出快照、profile 性能，但不得修改原项目代码。
4. 允许短期使用从原项目导出的快照验证 renderer；长期必须由新项目自己的生成内核产生地图。

优先级：

1. 先完成贴近原项目表现的独立 WebGL demo，证明真实 FMG 地图快照可以由 WebGL 渲染并被浏览器交互验证。
2. 再建立独立生成器工程骨架，把 seed、options、grid、pack、features、rivers 等生成链路移入新项目。
3. 按原项目功能范围逐步复刻：基础底图、专题面、线、点、文本、纹章、编辑器、保存加载、导出。
4. 每复刻一类功能，都用 source 行为或同地图快照对照验收，而不是接入或修改 source。

## 4. 全局验收规则

每一步至少满足以下通用条件：

- 不覆盖用户或其他智能体已有未提交改动；开始前查看 `git status --short`。
- 手写文档为中文；代码只添加必要注释。
- 新项目代码默认放在根目录的 `prototype/`、`tools/`、`docs/` 或后续正式应用目录中，不写入 `source/`。
- `source/` 只允许读取、运行、安装依赖、profile 和浏览器观察；不得修改源码。允许的写入例外仅限依赖安装产生的锁文件。
- 涉及 JS 文件时至少运行对应 `node --check`。
- 涉及浏览器表现时，侍中必须用 in-app browser 打开目标页面并验证非空画面、图层开关、缩放拖拽、控制台关键错误。
- 每步完成后记录验收结果、命令和失败修正到 `docs/development-log.md`。

推荐基础命令：

```powershell
Set-Location D:\work\fmg
git status --short
node --check .\tools\fmg-export-snapshot.mjs
node --check .\tools\serve-prototype.mjs
node --check .\prototype\webgl-cells\src\main.js
node --check .\prototype\webgl-cells\src\renderer.js
```

原项目只作为参考运行时使用：

```powershell
Set-Location D:\work\fmg\source\Fantasy-Map-Generator
npm run build
npm run lint
```

当前机器注意：Vite 不要使用 `5109-5208` 范围端口；已知可用端口包括 `5300` 和原型服务端口 `5400`。Playwright 可用系统 Chrome：`--browser-channel chrome`。

## 5. 阶段 0：源项目表现和可比基线冻结

### 步骤 0.1：确认 SVG 基线

目标：确认当前源项目在本机仍可运行，并冻结后续对照口径。

范围：

- `tools/fmg-profile.mjs`
- `docs/performance-baseline-results.json`
- `docs/performance-baseline-results.md`

验收标准：

- 10k、50k、100k 三档目标 cells 命中正确 `grid.cells` 规模。
- 报告包含生成耗时、完整绘制耗时、单图层耗时、SVG 节点统计。
- 100k 档至少记录 `drawStates`、`drawBorders`、`drawRivers`、`drawRoutes`、`drawPopulation`、`drawPrecipitation`、`drawBurgIcons`、`drawEmblems`、`drawLabels`。
- 未修改 `source/` 源码。

推荐验证命令：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-profile.mjs --port 5300 --browser-channel chrome --cells 10000,50000,100000 --out .\docs\performance-baseline-results.json --markdown .\docs\performance-baseline-results.md
```

侍中浏览器验收点：

- 打开源项目页面，确认可生成地图。
- 切换 political、physical、heightmap 预设，确认 SVG 版本表现作为视觉参照可用。

### 步骤 0.2：建立同地图对照快照

目标：用同一张源项目地图同时服务 SVG 对照和 WebGL demo，消除随机地图差异。

范围：

- `tools/fmg-export-snapshot.mjs`
- `prototype/webgl-cells/data/sample-map.json`
- 新增或更新对照说明文档

验收标准：

- 快照包含 `metadata.seed`、`graphWidth`、`graphHeight`、`grid`、`pack`、图层所需对象。
- 明确记录快照导出时的 cells 档位、seed、图层预设。
- 同一个快照可被独立 WebGL demo 加载。
- 快照导出过程不向 `source/` 写入代码。

推荐验证命令：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json
node .\tools\serve-prototype.mjs --port 5400
```

侍中浏览器验收点：

- 打开 `http://127.0.0.1:5400`，确认统计面板显示目标 cells、grid cells、pack cells 和 seed。
- 画面没有巨型 pack cell 三角形。

## 6. 阶段 1：独立 WebGL demo 验证完整地图能力

阶段目标：先按 source 原项目的数据和视觉职责实现一个可演示 demo，证明 WebGL 能承担地图生成器主视图，而不是只渲染单一 cell 色块。

当前状态：步骤 1.1 到 1.6 已经完成，并经过尚书实施、门下检查、侍中验收。

### 步骤 1.1：demo 渲染器模块化

已完成。`prototype/webgl-cells/src/renderer.js` 已收敛为 `GraphicsMapRenderer`，并拆出相机、buffer、picking、颜色、图层状态和工具模块。

验收要点：

- 对外 API 保持 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()`、`getStats()`。
- 高度/国家模式、国家边界、河流、picking 不回归。
- 模块拆分后没有修改 `source/`。

### 步骤 1.2：基础底图和 feature 图层

已完成。demo 已实现海洋背景、陆地底色、湖泊填色、海岸线和湖岸线 WebGL 图层。

验收要点：

- 湖泊保留分类数据。
- 海陆轮廓和湖泊位置与源 SVG 大体一致。
- 基础 mesh 使用 `grid`，feature 语义使用 `pack.features`。

### 步骤 1.3：专题面图层

已完成。demo 已覆盖高度、生物群系、国家、省份、文化、宗教和温度专题面。

验收要点：

- 同一套 grid mesh 复用，切换专题不重建几何。
- palette 或属性变化只更新必要 buffer。
- 统计面板显示当前专题、字段来源、专题值数和专题更新耗时。

### 步骤 1.4：线图层

已完成。demo 已实现河流、路线、国家边界和省份边界四类 WebGL line layer。

验收要点：

- 路线按 `roads`、`trails`、`searoutes` 分组。
- 国家边界和省份边界可分层显示。
- 当前仍使用 `gl.LINES`，宽线、join/cap、dash 和 line picking 放入后续阶段。

### 步骤 1.5：点图层和高节点图层

已完成。demo 已实现降水、人口、城市/港口和 marker 四类 WebGL point layer。

验收要点：

- 降水、人口、城市/港口和 marker 均有独立图层开关。
- 统计面板显示点层数量、港口数量和 marker 分组。
- 当前仍使用 `gl.POINTS` 占位，sprite atlas、LOD 和对象级 picking 放入后续阶段。

### 步骤 1.6：文本和纹章 demo 策略

已完成。demo 已用 HTML/SVG overlay 表达城市标签、国家中心标签占位和纹章 badge 占位。

验收要点：

- overlay 跟随 WebGL camera，不阻塞 canvas 拖拽、缩放和 hover picking。
- 城市标签、国家标签占位和纹章占位可以显示/隐藏。
- 国家曲线标签和真实纹章生成未强行 GPU 化，留到正式复刻阶段。

## 7. 阶段 2：独立生成器工程骨架和生成内核

阶段目标：让新项目不再只依赖 source 快照，而是具备自己的最小地图生成链路。此阶段仍可持续读取 source 代码和运行 source 页面做对照，但不得修改 source 源码。

### 步骤 2.1：正式应用目录和运行时边界

目标：创建独立 WebGL 地图生成器的工程骨架，明确生成内核、渲染器、UI、保存加载和对照工具的目录边界。

范围：

- 新应用目录，例如 `app/` 或 `prototype/webgl-generator/`
- 生成内核入口
- renderer 复用边界
- 文档和开发命令

验收标准：

- 新应用可以启动并显示一个由本项目代码创建的空地图或占位地图。
- 不依赖修改 `source/` 的任何文件。
- `source` 快照 demo 和新应用目录职责清楚，不互相污染。
- 文档记录启动命令、目录职责和后续迁移入口。

侍中浏览器验收点：

- 打开新应用页面，画面非空。
- 控制台无启动错误。
- 页面能显示当前 seed、目标 cells、地图尺寸或占位状态。

### 步骤 2.2：随机数、seed 和 options 模型

目标：复刻原项目的可重复生成基础，让同一 seed 和 options 能稳定生成同一张地图。

范围：

- seeded random
- map options
- cells 密度
- graph width/height
- 生成过程日志

参考 source：

- `public/main.js` 的生成流程
- options 和锁定点数逻辑
- `aleaPRNG` 或等价随机源

验收标准：

- 同一 seed 连续生成两次，输出摘要完全一致。
- 不同 seed 输出不同摘要。
- 支持目标 cells、地图尺寸、seed、随机 seed 开关。
- 文档记录与 source 随机流程的已知差异。

### 步骤 2.3：点集、Voronoi grid 和基础 cell mesh

目标：在新项目中生成 `grid.points`、`grid.cells.v`、`grid.vertices.p` 等基础 mesh 数据，并能被 WebGL renderer 渲染。

范围：

- 点集生成
- Voronoi/Delaunay
- grid cells
- vertices
- cell 三角化

验收标准：

- 10k cells 目标能生成稳定 grid。
- WebGL renderer 使用新项目生成的 grid 渲染高度或占位颜色。
- 统计面板显示目标 cells、实际 grid cells、顶点数、三角形数。
- 与 source 同规模地图相比，没有明显巨型异常 cell。

侍中浏览器验收点：

- 生成 10k 地图后画面铺满地图范围。
- 拖拽、缩放、fit 可用。
- hover picking 能返回 grid cell id。

### 步骤 2.4：高度图和海陆 feature

目标：复刻最小 heightmap、海洋、陆地、湖泊、海岸线生成。

范围：

- heightmap
- water/land classification
- features
- lake/coastline extraction
- 基础颜色策略

参考 source：

- heightmap generator
- ocean/lake/features 生成流程
- `draw-features` 的图层职责

验收标准：

- 新项目可以生成有海有陆的地图。
- feature 数据能区分海洋、陆地和湖泊。
- WebGL 底图显示海洋、陆地、湖泊和海岸线。
- 统计面板显示海洋 feature、陆地 feature、湖泊数量。

### 步骤 2.5：pack 语义图和基础 picking

目标：在新项目中建立类似 source `pack` 的语义图，用于国家、河流、道路、城市等高层功能。

范围：

- pack cells
- pack vertices
- grid 到 pack 的映射
- 语义字段占位
- picking 数据结构

验收标准：

- `grid` 继续作为底层渲染 mesh，`pack` 只作为语义层。
- hover picking 能同时返回 grid cell 和 pack cell。
- 文档明确哪些字段已实现、哪些只是占位。

### 步骤 2.6：气候、生物群系和河流最小链路

目标：复刻温度、降水、生物群系和河流的最小可用生成链路。

范围：

- temperature
- precipitation
- biome
- river sources and flow
- river/coast clipping

验收标准：

- 专题面支持 height、temperature、precipitation、biomes。
- 河流从高地流向水域或地图边缘，不明显画入海洋深处。
- 与 source 同类地图对照时，语义趋势合理：高山冷、沿海湿、河流多从高地发源。

## 8. 阶段 3：世界语义生成与图层补全

阶段目标：逐步复刻原项目的世界生成能力，让地图从地形图变成可编辑的幻想世界地图。

### 步骤 3.1：文化、宗教和名称系统

验收标准：

- 生成 cultures、religions、名称库和基础扩散结果。
- 专题面可切换 cultures 和 religions。
- 城市、国家或区域名称可由新项目生成，不依赖 source 运行时。

### 步骤 3.2：国家、省份和区域

验收标准：

- 生成 states、provinces、zones 或等价区域。
- 政治图层可显示国家、省份和边界。
- 国家颜色、名称、首都字段可被 UI 查看。

### 步骤 3.3：城市、人口和道路

验收标准：

- 生成 burgs、人口、道路、山路和海路。
- 城市/港口点层和路线图层使用新项目数据渲染。
- hover 或点击能返回城市和路线对象。

### 步骤 3.4：标记、纹章和军队占位

验收标准：

- marker、emblem、army 具备最小数据模型和可见图层。
- 纹章第一版可以是占位 badge，但必须有对象 id 和位置。
- 后续真实纹章生成策略写入文档。

## 9. 阶段 4：独立 WebGL 应用交互和编辑器

阶段目标：新应用拥有自己的 UI 和编辑器，不依赖原项目 DOM id 或旧编辑器。

### 步骤 4.1：统一 PickResult

验收标准：

- `pick(screenX, screenY)` 返回 `{kind, id, worldX, worldY, distance?}`。
- 支持 cell、burg、marker、river、route、state、province 至少一种命中路径。
- CPU 空间索引和 GPU color picking 的取舍写入文档。

### 步骤 4.2：图层面板和专题切换

验收标准：

- 新应用提供图层开关、专题切换、透明度或样式基础控制。
- 图层开关不重建无关 buffer。
- UI 状态可保存到新项目的运行时配置。

### 步骤 4.3：对象编辑和局部刷新

验收标准：

- 至少支持编辑城市名称、marker 文本、国家颜色或河流可见性中的两类。
- 修改对象后只刷新相关 layer 或相关 buffer。
- 反复生成和编辑无明显内存或 WebGL 资源泄漏。

## 10. 阶段 5：保存、加载和导出

阶段目标：新应用拥有自己的持久化和导出能力。source `.map` 兼容可以作为可选导入/导出目标，但不作为修改 source 的理由。

### 步骤 5.1：新项目保存格式

验收标准：

- 保存 seed、options、grid/pack 语义数据、用户编辑和样式配置。
- 不保存 WebGL buffer、纹理或可重新生成的派生缓存，除非有明确性能理由。
- 加载后地图视觉和对象摘要与保存前一致。

### 步骤 5.2：PNG/JPEG 导出

验收标准：

- 从新应用 canvas 或离屏 renderer 导出 PNG/JPEG。
- overlay 文本和纹章能合成，或明确标记为暂不支持。
- 高倍率导出有最大尺寸保护和错误提示。

### 步骤 5.3：数据导出和兼容导入可研

验收标准：

- 支持 JSON 或 GeoJSON 导出核心对象。
- 评估是否需要导入 source `.map` 或导出 source 兼容数据。
- 文档明确“兼容格式”和“内部格式”的职责边界。

## 11. 阶段 6：性能、质量和发布门槛

### 步骤 6.1：性能目标

验收标准：

- 100k 地图相机 draw 平均低于 5ms。
- 100k 地图常用图层切换低于 100ms，首帧生成和 buffer 构建单独统计。
- 反复生成 10 次后内存和 WebGL 资源数量无持续增长。
- 生成耗时、渲染耗时和交互耗时分别记录，不混为一个数字。

推荐验证：

```powershell
node .\tools\webgl-prototype-profile.mjs --url http://127.0.0.1:5400 --browser-channel chrome --iterations 50
```

### 步骤 6.2：视觉和行为对照

验收标准：

- 至少覆盖 political、physical、heightmap、biomes、provinces 的 source 对照截图或描述。
- 对明显视觉差异有文档解释：已接受、待修、或复刻策略不同。
- 侍中用 in-app browser 对桌面视口和窄视口各验收一次。

### 步骤 6.3：发布边界

验收标准：

- README 或项目文档明确这是独立复刻版，不是原项目源码改造分支。
- MIT 来源和原项目版权声明保留在合规位置。
- 打包产物不包含不必要的 source 运行时文件。

## 12. 当前建议下一步

下一步从 **步骤 2.1：正式应用目录和运行时边界** 开始。尚书应先创建或整理独立应用骨架，门下检查 `source/` 未被修改，侍中打开新应用页面确认可运行。

阶段 2 的核心验收不是“接入 source 主视图”，而是让本项目产生第一张由新生成内核创建、由 WebGL renderer 显示的地图。source 可以继续作为参考和对照运行，但不能成为代码修改目标。
