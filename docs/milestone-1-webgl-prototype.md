# 第 1 里程碑：最小 WebGL cells 原型

本文档记录第 1 里程碑当前实现：在不修改 `source/` 的前提下，建立一个可以消费原项目 `pack.cells` 数据的最小 WebGL2 渲染器原型。

## 目标

第 1 里程碑的目标不是一次性替换原项目渲染层，而是先验证最关键的数据路径：

1. 从原 Fantasy Map Generator 运行时导出真实 `pack` 快照。
2. 在独立原型中读取快照。
3. 将 `grid` 的中心点和 Voronoi 顶点转换为底层三角形。
4. 上传到 GPU buffer。
5. 用 WebGL2 渲染高度图和国家填色两种模式。
6. 在独立 demo 中继续验证 `pack.features` 驱动的陆地、湖泊、海岸和湖岸表达。

这条路径跑通后，后续才能继续讨论图层兼容层、局部刷新、拾取、编辑交互和更复杂的样式系统。

## 新增文件

- `tools/fmg-export-snapshot.mjs`
  - 启动或连接原项目页面。
  - 设置目标 cells，并锁定 `lock_points`。
  - 调用原项目 `generate()`。
  - 导出 `grid.cells`、`grid.vertices`、`pack.cells`、`pack.vertices`、`pack.states`、`pack.rivers` 和 `pack.routes` 的最小快照。

- `tools/serve-prototype.mjs`
  - 无依赖静态服务器，用于运行原型页面。
  - 默认服务目录为 `prototype/webgl-cells`。

- `tools/webgl-prototype-profile.mjs`
  - 打开 WebGL 原型页面。
  - 调用 `GraphicsMapRenderer.getStats()`、`draw()` 和 `pick()`。
  - 输出 JSON 和中文 Markdown 性能报告。

- `prototype/webgl-cells/index.html`
  - 原型入口页面。

- `prototype/webgl-cells/src/main.js`
  - 加载地图快照。
  - 初始化渲染器。
  - 绑定模式切换、视图适配和统计面板。

- `prototype/webgl-cells/src/renderer.js`
  - WebGL2 渲染器。
  - 当前主类为 `GraphicsMapRenderer`，并保留 `CellWebGLRenderer` 兼容别名。
  - 将每个 grid cell 按中心点扇形三角化。
  - 构建位置 buffer 和当前专题颜色 buffer。
  - 支持平移、滚轮缩放、适配视图。
  - 构建均匀网格空间索引，用于降低 hover picking 的候选 cell 数量。
  - 通过统一线层模块绘制国家边界、省份边界、路线和河流。
  - 河流使用三角形带 mesh 表达宽度变化，河口优先裁剪到陆水共享边，避免画入海域或停在海岸线内侧。
  - 绘制陆地底色、湖泊填色、海岸线和湖岸线 feature 图层。
  - 湖泊按真实 lake water cells 填色，湖中岛会在湖泊填色后重新以陆地色填回，避免被湖泊图层覆盖。
  - 支持高度、生物群系、国家、省份、文化、宗教和温度七类专题面切换。
  - 专题切换复用同一套 grid cell position buffer，只更新当前专题颜色 buffer。
  - 对外暴露 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。

- `prototype/webgl-cells/src/lines.js`
  - 统一构建国家边界、省份边界、路线和河流图层。
  - 路线按 `roads`、`trails`、`searoutes` 分组保留统计和基础颜色。
  - 国家边界、省份边界和路线仍输出 `gl.LINES` 所需 positions/colors；河流输出三角形带 positions/colors。
  - 省界使用连续灰线，路线使用略粗的暖色三角形带，国界在省界之后绘制，避免省界压过国界或与路线混淆。

- `prototype/webgl-cells/src/features.js`
  - 从 `pack.features` 和 `pack.vertices` 构建 feature 填充和岸线 buffer。
  - 保留湖泊 `type/group` 分类统计。
  - 湖泊填色按 `pack.cells.f` 指向 lake feature 的真实水域 cell 构建，不再对整湖 feature 外轮廓做扇形填充。
  - 单独构建 `lake_island` 填色 buffer，在湖泊之后绘制湖中岛。

- `prototype/webgl-cells/src/overlays.js`
  - 管理城市标签、国家标签占位和纹章 badge 占位的 HTML overlay。
  - 通过 renderer view listener 跟随 WebGL camera，不参与 WebGL draw loop。
  - 接入 demo 级中文地名显示，部分国家和对应城市会显示中式名称。

- `prototype/webgl-cells/src/chinese-names.js`
  - 本地中文地名库和确定性 demo 命名规则。
  - 后续可扩展为时代/文化风格配置。

- `prototype/webgl-cells/src/styles.css`
  - 原型页面样式。

- `prototype/webgl-cells/data/sample-map.json`
  - 当前 demo 使用的一份 100k 目标 cells 真实 FMG 快照。

- `docs/webgl-prototype-profile-results.md`
  - 当前 WebGL 原型性能采集结果。

## 运行方式

导出新的地图快照：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json
```

启动原型：

```powershell
Set-Location D:\work\fmg
node .\tools\serve-prototype.mjs --port 5400
```

然后打开：

```text
http://127.0.0.1:5400
```

## 当前快照数据

当前 `sample-map.json` 来自一次 100k 目标 cells 的真实原项目运行时导出。

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
| 城市/港口点 | 1589 |
| marker 点 | 502 |
| 城市标签 overlay | 1589 |
| 国家标签占位 | 15 |
| 中文国家/城市名 | 5 / 888 |
| 纹章占位 | 1604 |
| 纹章默认状态 | 关闭 |
| picking 索引桶 | 48420 |
| 地图尺寸 | 1440 x 960 |

说明：实际 grid cells 接近目标 cells；实际 pack cells 会随随机地图生成结果变化，不一定等于目标 cells。第 1 里程碑关注的是数据转换和渲染路径，而不是地图生成算法本身。

## 已验证内容

- `node --check` 已通过：
  - `tools/fmg-export-snapshot.mjs`
  - `tools/serve-prototype.mjs`
  - `prototype/webgl-cells/src/main.js`
  - `prototype/webgl-cells/src/renderer.js`
- 使用系统 Chrome 打开原型页面，确认：
  - WebGL2 上下文创建成功。
  - 地图快照成功加载。
  - canvas 实际显示高度图。
  - 底层 cell mesh 使用 `grid` 数据，避免 `pack.cells` 水域/边界大多边形导致的巨型三角 cell。
  - `国家` 模式按钮可以切换并激活。
  - 国家边界、省份边界和路线 line layer 可以生成并绘制。
  - 河流以 WebGL 三角形带 mesh 绘制，按流量和路径长度显示粗细变化。
  - 国家边界、省份边界、路线和河流可通过 UI 独立开关。
  - 降水、人口、城市/港口、marker 四类 point layer 可以生成并绘制。
  - 降水、人口、城市/港口、marker 可通过 UI 独立开关。
  - 河流河口优先裁剪到最后陆地 cell 与首个水域 cell 的共享边中点，不会继续延伸到水域 cell 中心，也不会停在离海岸明显一段距离的位置。
  - 快照包含 `pack.features`、`cells.f` 和湖泊 `group/type` 分类数据。
  - 快照包含 `pack.cells.province/culture/religion/biome`、`grid.cells.temp`、`pack.provinces/cultures/religions` 和 `biomesData` 专题元数据。
  - demo 可绘制海洋背景、陆地底色、湖泊填色、海岸线和湖岸线。
  - 湖泊开启时，湖泊填充只覆盖真实水域 cell，湖中岛会以陆地色覆盖回湖面之上，不再把凹形湖岸、半岛或湖中陆块误盖成湖泊。
  - 陆地底色、湖泊和海岸/湖岸线可通过 UI 独立开关。
  - `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 七个专题按钮均可切换。
  - 专题切换时 `colorBufferVertices` 与 `geometry.vertexCount` 一致，说明复用同一套 cell 几何。
  - 鼠标悬停 picking 通过空间索引缩小候选集后，可以返回 cell id、高度、国家和世界坐标。
  - hover 面板额外显示生物群系、省份、文化、宗教和温度。
  - `GraphicsMapRenderer` 新接口可用，旧的 `window.__fmgCellRenderer` 调试入口仍指向同一个 renderer。
  - 统计面板显示 GPU 顶点、三角形、地图尺寸、四类线图层线段数和路线分组等信息。
  - 统计面板显示降水点、人口 instances、城市/港口点、港口点、marker 点和 marker 分组等信息。
  - 城市标签、国家标签占位通过 HTML overlay 显示，并可通过 UI 独立开关。
  - 纹章占位保留数据和手动开关，但默认关闭，当前阶段不作为已实现纹章系统展示。
  - overlay 容器 `pointer-events: none`，不会阻塞 canvas 拖拽、缩放和 hover picking。
  - 缩放和拖拽后 overlay 位置随 WebGL camera 更新，当前轻量验证中城市标签从屏幕坐标约 `(446,286)` 平移到 `(536,331)`，与相机平移量一致。
  - 100k 目标快照下，当前机器记录的步骤 1.5 轻量验证为构建约 `353.2ms`，上传约 `28.8ms`，专题更新约 `95.6ms`，绘制约 `0.5ms`。
  - 100k 目标快照下，当前机器记录的步骤 1.6 轻量验证为构建约 `244.7ms`，上传约 `25.6ms`，绘制约 `0.3ms`；overlay 可见城市标签 `143/440`、国家标签占位 `17/17`、纹章占位 `457/457`。
  - 100k 目标快照下，当前机器记录的步骤 1.4 轻量验证为构建约 `249ms`，上传约 `31.5ms`，绘制约 `0.2ms`。
  - 中心点 picking 仍可命中。
  - 正式采集脚本已生成 `docs/webgl-prototype-profile-results.md`：
    - 10 次 draw 平均约 `0.27ms`，最大约 `1.3ms`。
    - 10 次 picking 平均约 `0.01ms`，最大约 `0.1ms`。

## 当前实现边界

- 目前渲染 grid cell 面、基础 feature 图层、国家边界、省份边界、路线、河流、人口点、降水点、城市/港口点和 marker 点；标签和纹章走 HTML/SVG overlay 策略，不进入 WebGL draw loop。
- feature 图层当前没有复刻 SVG 的 fractal coastline、mask、blur/filter；海岸和湖岸使用 `pack.features[*].vertices` 的折线表达。
- 湖泊填色当前使用 feature polygon 扇形三角化，足以验证数据通路；后续可改为更稳健的三角化或 mask 方案。
- 专题面当前采用 cell 级填色，不复刻 SVG isoline 的平滑边界和 waterGap 路径细节；本阶段验收语义正确和性能路径正确。
- 专题切换当前每次重算并上传一份完整颜色 buffer，没有把每个专题常驻为多套 GPU buffer；这避免显存膨胀，但 palette 实时编辑后续还应优化为局部更新。
- 国家边界、省份边界和路线当前仍使用 `gl.LINES` 验证数据通路；尚未实现宽线 polyline mesh、join/cap、dash 和 line picking。
- 河流当前已改为宽度随流量和路径增长变化的三角形带 mesh，并使用 source meandered points 导出作为后续曲线复刻参考；join/cap、line picking 和更精细的曲线平滑仍待后续实现。
- 路线当前直接使用快照中的 `route.points` 折线，不复刻 `Routes.getPath()` 的曲线和样式编辑器。
- 点图层当前使用 `gl.POINTS` 占位，没有实现完整 sprite atlas、SVG icon、emoji、外部图片 marker 或 pin shape。
- 人口当前用 screen-sized 点近似农村/城市人口，没有复刻源项目竖线动画；降水没有复刻 wind direction 文本。
- burg 和 marker 当前没有 hover/click picking，后续需要接入对象级 picking 或 GPU color picking。
- 城市标签 overlay 目前最多渲染 700 个高优先级标签；当前样本只有 440 个有效 burg，因此全部渲染。普通小城标签在低缩放下会隐藏，首都、港口和大城市保持可见。
- 国家标签当前是中心/首都附近的简化文本占位，没有复刻源 SVG `textPath` 曲线标签、`getBBox()` 适配和自动换行。
- 纹章当前只保留占位数据和手动开关，默认不显示；没有调用源项目 COA renderer，也没有实现离屏纹理缓存。
- grid cell 采用中心点扇形三角化，足够验证路径；pack cell 不适合作为底层均匀 mesh，只能用于业务语义图层。
- 当前 picking 已经使用 CPU 空间索引缩小候选集；后续复杂编辑场景仍可评估 GPU color picking。
- 样式是原型级调色，不等同于原项目最终视觉。
- 当前原型使用原生 WebGL2，没有引入 PixiJS。这样可以先验证最底层数据路径；后续若进入更完整图层系统，可以再评估 PixiJS 或轻量封装。

## 下一步建议

第 1 里程碑下一段可以继续做：

1. 等待步骤 1.6 的门下检查和侍中 in-app Browser 验收。
2. 验收通过后，进入阶段 2 前应先决定是否补一轮同地图、同图层开关下的 SVG 与 WebGL 严格对照测试。
3. 点图层后续进入 sprite atlas、marker pin、LOD、对象级 picking。
4. 非河流线图层后续再进入宽线 polyline mesh、dash、join/cap 和 line picking；河流后续继续补 join/cap 和更精细的 meandering 曲线。
5. 文本和纹章后续再评估 GPU text、SVG textPath overlay 复用、真实 COA 离屏纹理缓存和导出合成。
