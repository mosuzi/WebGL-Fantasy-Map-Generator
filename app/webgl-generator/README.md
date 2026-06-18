# 独立 WebGL 地图生成器应用

`app/webgl-generator/` 是正式复刻版应用目录，和 `prototype/webgl-cells/` 的快照 demo 分开维护。

## 目录职责

- `index.html`：正式应用页面入口。
- `src/main.js`：浏览器启动入口，只负责装配运行时。
- `src/runtime/`：应用状态、UI 绑定、生成流程调度。
- `src/generator/`：新项目自己的生成内核。阶段 2.1 只输出占位地图，后续从这里补 seed、options、grid、heightmap、features 和 pack。
- `src/renderer/`：正式应用自己的 WebGL 渲染入口。阶段 2.1 只渲染占位地图，后续接入可复用的地图渲染器能力。
- `src/ui/`：面板、状态和用户操作绑定。

## 启动

```powershell
Set-Location D:\work\fmg
node .\tools\serve-prototype.mjs --port 5410 --dir .\app\webgl-generator
```

访问：

```text
http://127.0.0.1:5410
```

## 构建器决策

当前暂不引入 Vite。原因：

- 正式应用目前是原生 ESM、无 npm 依赖、只面向高版本 Chrome。
- 当前阶段更需要稳定生成内核和 WebGL 数据结构，而不是先增加构建配置。
- 目录结构保持 Vite 友好，后续需要打包产物、资源指纹、worker、第三方库或测试集成时，再引入 Vite 更划算。

## 与 demo 的边界

- `prototype/webgl-cells/` 保留为源项目快照的 WebGL demo 和视觉对照。
- 本目录不读取 `prototype/webgl-cells/data/sample-map.json`。
- 本目录不接入、不修改 `source/Fantasy-Map-Generator`。
- 后续如果复用 demo renderer 的经验，应迁移为正式模块或共享模块，避免让正式应用依赖 demo 内部路径。

## 当前生成能力

阶段 2.2 已实现正式应用自己的 seed/options 基础：

- `src/generator/random.js` 提供可复现 PRNG 和摘要 hash。
- `src/generator/options.js` 规范化 seed、目标 cells、地图宽高和自动随机 seed 开关。
- 同一 seed/options 会输出稳定 `summary.checksum` 和随机预览。
- 不同 seed 会输出不同 `summary.checksum`。

当前仍是占位地图，不是正式地形生成链路。与 source 的已知差异：

- PRNG 使用本项目内置轻量算法，不复刻 source 的完整 `aleaPRNG` 调用序列。
- 当前只保证新应用内部 seed/options 可重复，不保证同 seed 与 source 生成同一地图。
- `generatedAt` 是运行时记录，不参与稳定摘要；稳定性以 `summary` 为准。

阶段 2.3 已实现第一版自生成 grid：

- `src/generator/grid.js` 生成 seed 驱动的抖动点集。
- 通过局部半平面裁剪生成近似 Voronoi cell，输出 `grid.points`、`grid.cells.v`、`grid.vertices.p` 和基础高度 `grid.cells.h`。
- renderer 已改为从 `grid` 三角化绘制 cell mesh。
- 应用支持拖拽平移、滚轮缩放和适配视图。

当前 grid 算法是阶段性轻量实现，目的是先打通正式应用自己的 mesh 数据流。点集已从单纯行列抖动改为局部随机、行列错位和低频 warp 叠加的分层扰动，减少默认地图的规整网格感。后续如果引入成熟 Voronoi/Delaunay 库或更接近 source 的点集松弛流程，应保留 `grid` 数据结构兼容。

阶段 2.4 已实现第一版 heightmap 和海陆 feature：

- `src/generator/heightmap.js` 生成 seed 驱动的图邻接传播高度场，流程接近 source 的 `continents` 模板。
- 高度生成按 `Hill`、`Range`、`Strait`、`Trough`、`Pit`、`Mask`、`Smooth` 的顺序叠加，不再使用连续坐标噪声直接采样山体。
- UI 提供地形模板选择，当前支持大陆、地中海、高山岛屿、平原岛屿、一侧大陆、盘古大陆和群岛。
- `Range` 会记录主脊 cell，并在最终重平衡时只允许主脊附近保留高海拔，避免宽丘陵被整体推成白色气团或高原。
- 生成末尾会按各模板的目标高度分布做排序校准，使水域、低地、中山、高山和极高峰比例符合当前地形类型。
- `src/generator/grid.js` 会在高度采样后填平小型内陆闭合水坑，减少噪声造成的圆形打孔。
- `src/generator/features.js` 对水域/陆地 cell 做 flood fill，区分 ocean、land 和 lake。
- renderer 绘制基础高度色，并以 line pass 显示海岸线和湖岸线。
- 统计面板显示 feature 数、海洋/陆地/湖泊数量、海岸线段、湖岸线段和线段顶点数。

高度场已从规则椭圆 blob 和连续噪声采样升级为 graph propagation 模板步骤，并补上第一批原版常见地形 case。当前目标是先避免明显圆圈、重复分形纹理、气团状山体、突兀高山和单一圆大陆；它仍是轻量地形模型，不等同于 source 的完整模板化 heightmap、侵蚀、河谷切割和湖泊出口流程。

阶段 2.5 已实现第一版 pack 语义图和基础 picking：

- `src/generator/pack.js` 生成独立 `pack` 对象，当前采用 `one-grid-cell-to-one-pack-cell` 映射。
- `grid.cells.pack` 保存 grid cell 到 pack cell 的映射。
- `pack.cells` 保存 grid cell、feature、height 和 type 等语义字段。
- `src/renderer/picking.js` 根据屏幕坐标反算世界坐标，并用 grid polygon 命中 cell。
- 悬停面板显示 grid cell、pack cell、feature、height、世界坐标和候选 cell 数。

当前 pack 是阶段性语义层，尚未实现 source 那种抽稀/重建后的 pack 图；后续应在保持 `grid` 渲染 mesh 的前提下，把 `pack` 升级为真正承载国家、河流、城市和 picking 的业务图。

阶段 2.6 已实现第一版气候、生物群系和河流链路：

- `src/generator/climate.js` 为 grid cell 生成温度、降水和 biome。
- `src/generator/rivers.js` 从高地源头沿低邻居追踪最小河网。
- renderer 支持高度、温度、降水、生物群系四个专题面。
- 河流与海岸线、湖岸线一起进入 line pass。
- 悬停面板显示温度、降水和 biome。

当前气候仍是最小趋势模型：高纬和高海拔更冷，近海/湖泊附近更湿。河流已从逐条贪心下坡改为无环流向图和 flux 河网，先对高度场做轻量填洼，再按汇水量选择河源，避免短河乱穿、折返和打结。后续需要补更接近 source 的风向、降水传播、河口裁剪、合流宽度和河床侵蚀。

阶段 3.1 已实现第一版文化、宗教和名称系统：

- `src/generator/society.js` 在陆地 cell 上选择文化和宗教中心。
- `grid.cells.culture` 和 `grid.cells.religion` 保存扩散结果。
- pack cell 同步保存 culture 和 religion 字段。
- renderer 支持文化和宗教专题面。
- 悬停面板显示文化名称和宗教名称。

当前文化/宗教扩散是最小距离场模型，名称来自内置中文名称表。后续国家、城市和区域命名应复用并扩展这里的名称系统。

阶段 3.2 已实现第一版国家、省份和区域系统：

- `src/generator/politics.js` 基于陆地 cell、文化/宗教和气候条件选择国家中心。
- `grid.cells.state`、`grid.cells.province` 和 `grid.cells.region` 保存政治语义结果。
- pack cell 同步保存 state、province 和 region 字段。
- renderer 支持国家、省份和区域专题面，水域保持独立底色。
- 悬停面板显示国家、省份和区域名称。

当前国家和省份扩散仍是最小距离场模型，区域是按位置、高度和湿度切分的地理分区。后续需要补国家边界线、省界线、首都/城市、人口、道路和更接近 source 的政治生成规则。

阶段 3.3 已实现第一版城市、道路和人口系统：

- `src/generator/settlements.js` 基于陆地 cell、降水、高度、海岸、河流、国家和省份中心选择城市。
- 城市包含首都、省会、港口、所属国家/省份、文化、宗教和人口估值。
- `grid.cells.pop` 保存基础人口密度，`grid.cells.burg` 保存城市 id。
- `pack.cells.pop` 和 `pack.cells.burg` 同步保存人口和城市语义字段。
- renderer 新增 WebGL point pass，绘制农村人口点、城市点、首都和港口。
- 道路和小路进入 line pass，连接首都、省会和主要城市。
- UI 新增人口专题面，运行时统计显示城市/首都/港口、道路/线段、人口点和点顶点。
- 悬停面板显示当前 cell 的城市和人口。

当前城市、人口和道路仍是轻量模型：城市选址只考虑局部适宜度和最小间距，道路是 grid 上的贪心陆路追踪，还没有 source 的 burg 等级、真实贸易路线、道路宽度、海路、标签避让和对象级点击。
