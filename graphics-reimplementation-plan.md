# Fantasy Map Generator 图形化重实现方案

> 路线修正说明：本文是早期“迁移原项目渲染层”的历史方案。2026-06-17 用户已明确改为“基于原项目复刻独立 WebGL 地图生成器”，不得修改 `source/Fantasy-Map-Generator` 原项目源码。后续执行以 `docs/gl-reimplementation-acceptance-plan.md` 和 `docs/current-plan.md` 为准；本文仅作为原项目结构和旧技术分析参考。

本文档基于当前 `source/Fantasy-Map-Generator` 源码阅读结果，说明如何把现有 SVG/HTML 地图渲染层迁移为更高性能的图形渲染实现。目标不是推翻地图生成器，而是保留现有生成算法、存档格式和编辑逻辑，逐步替换性能压力最大的 SVG 渲染与 DOM 操作。

## 1. 结论先行

我建议采用“生成逻辑不动，渲染器重写”的路线：

1. 保留现有 `grid`、`pack`、`options`、`style` 等数据模型。
2. 新增一个 `GraphicsMapRenderer`，使用 `canvas` 承载 WebGL2 渲染，优先基于 PixiJS v8 或轻量 WebGL2 封装实现。
3. 先把大面积面图层、线图层、点图层迁移到 GPU；文本、复杂纹章和少量编辑控件可以先继续用 HTML/SVG 覆盖层。
4. 通过兼容层保留现有 `drawHeightmap()`、`drawStates()`、`drawRivers()`、`drawBurgIcons()` 等函数名，让 UI 和编辑器可以分阶段迁移。
5. 导出 SVG 可先保留旧管线；导出 PNG/JPEG 改为从 WebGL canvas 读取。等主渲染稳定后，再做矢量导出兼容。

原因很直接：这个项目真正昂贵的地方不在地图生成，而在每次重绘时创建、删除、更新大量 SVG 节点和路径字符串。GPU 管线可以把这些对象变成批量顶点、索引、纹理和少量 draw call。

## 2. 源码现状

### 2.1 项目结构

关键文件如下：

- `src/index.html`：页面、SVG defs、图标、滤镜、样式编辑 UI 和大量对话框。
- `public/main.js`：运行时入口，创建 SVG 图层树、维护全局 `grid`/`pack`、处理缩放、生成地图、应用图层预设。
- `src/modules/*`：地图生成模块，例如高度图、河流、国家、省份、城市、文化、宗教、路线、湖泊等。
- `src/renderers/*`：部分较新的 TypeScript 渲染器，例如高度图、地貌、边界、城市图标、标签、温度、标记、军队、纹章等。
- `public/modules/ui/layers.js`：大量旧式图层开关和绘制函数，仍然直接拼接 SVG。
- `src/utils/pathUtils.ts`：`getIsolines`、`connectVertices`、`getVertexPath` 等边界追踪和路径构造工具。
- `src/types/PackedGraph.ts`：核心地图数据类型，描述 `pack.cells`、`pack.vertices`、`pack.rivers`、`pack.states`、`pack.burgs` 等。

### 2.2 当前地图图层

`public/main.js` 启动时在 `#viewbox` 下按固定顺序创建 SVG 分组：

`ocean`、`landmass`、`texture`、`terrs`、`lakes`、`biomes`、`cells`、`gridOverlay`、`coordinates`、`compass`、`rivers`、`terrain`、`relig`、`cults`、`regions`、`provs`、`zones`、`borders`、`routes`、`temperature`、`coastline`、`ice`、`prec`、`population`、`emblems`、`icons`、`labels`、`armies`、`markers`、`fogging`、`ruler`、`debug`。

这套顺序本身可以继续作为新渲染器的 pass 顺序。新的渲染器不需要按 DOM 分组组织，但需要保留同样的视觉叠放关系。

### 2.3 当前数据模型

`grid` 是生成阶段的基础 Voronoi 网格：

- `grid.points`：原始采样点。
- `grid.cells`：单元格邻接、顶点索引、边界标记。
- `grid.vertices`：Voronoi 顶点坐标、邻接顶点、相邻 cell。

`pack` 是最终地图数据：

- `pack.cells.i/c/v/p/h/t/r/f/...`：cell 索引、邻接 cell、顶点、中心点、高度、地形、河流、feature、文化、宗教、国家、省份等。
- `pack.vertices.p/v/c`：顶点坐标、邻接顶点、相邻 cell。
- `pack.features`：海洋、陆地、湖泊、岛屿等面要素。
- `pack.rivers`、`pack.routes`、`pack.burgs`、`pack.states`、`pack.provinces`、`pack.markers`、`pack.ice` 等专题对象。

这非常适合 GPU 化，因为数据已经是图结构和 typed array 形态。要做的是把 `path d="..."` 转换为 GPU 可消费的几何缓存。

## 3. 当前性能瓶颈

### 3.1 大量 SVG path 和 use

例如：

- `drawFeatures()` 会为每个 feature 拼 `<path>`，再用 `<use>` 填充 land/water mask、coastline 和 lakes。
- `drawHeightmap()` 会按高度层追踪边界，生成 0-100 层的 SVG path。
- `drawStates()`、`drawProvinces()`、`drawCultures()`、`drawReligions()`、`drawBiomes()` 都通过 `getIsolines()` 生成填充路径。
- `drawRivers()` 和 `drawRoutes()` 为每条河流/路线生成 SVG path。
- `drawBurgIcons()`、`drawMarkers()`、`drawEmblems()` 会创建大量 `<use>`、内嵌 `<svg>`、`<text>`、`<image>` 节点。

DOM 节点越多，浏览器样式计算、布局、命中测试、属性更新和垃圾回收压力越大。地图越复杂，重绘越慢。

### 3.2 字符串拼接和 innerHTML 重建

很多绘制函数不是增量更新，而是：

1. 删除已有节点。
2. 循环数据拼接 SVG 字符串。
3. `innerHTML = ...` 一次性重建。

这对完整重绘简单，但对交互编辑、图层开关和缩放后的自适应标记不友好。GPU 管线应改成“数据脏标记 + 缓存复用”：数据变了才重建 buffer，视图变了只改相机矩阵。

### 3.3 SVG 滤镜和 mask 成本高

源码中依赖 `blur`、`dropShadow`、`splotch`、`paper`、`pencil`、mask、clipPath 等 SVG 特性。这些效果好看，但在复杂场景中代价高，而且浏览器实现差异明显。

迁移时应分级处理：

- 阴影、描边、模糊：改为 shader 或预渲染纹理。
- 纸张/噪声纹理：改为屏幕空间噪声纹理叠加。
- clip/mask：改为 stencil、render texture、或预计算三角网。
- 特别复杂且低频的装饰，可以暂留 SVG/HTML overlay。

### 3.4 缩放逻辑绑定 DOM

`public/main.js` 使用 `d3.zoom`，每帧给 `#viewbox` 设置 `transform`，缩放变化时再重算标签、纹章、标记、比例尺等。新实现可以保留交互语义，但相机状态应进入渲染器：

```ts
renderer.setCamera({x: viewX, y: viewY, scale});
```

然后由各个 layer 根据 scale 决定可见性、LOD 和屏幕尺寸。

## 4. 技术路线选择

### 4.1 推荐方案：WebGL2 + PixiJS v8，保留 WebGPU 扩展空间

推荐主路线是 PixiJS v8：

- 它是成熟的 2D Web 图形渲染框架。
- 官方渲染器支持 WebGL/WebGL2，也提供 WebGPU renderer。
- 它已经包含场景图、纹理管理、批处理、render texture、事件系统、文字和 sprite 支持，比手写 WebGL 快很多。

外部参考：

- PixiJS 官方渲染器文档：<https://pixijs.com/8.x/guides/components/renderers>
- MDN WebGPU API：<https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API>

我不建议一开始直接手写完整 WebGPU。WebGPU 的长期上限更高，但浏览器覆盖和工程复杂度仍比 WebGL2 高。对这个项目来说，最先要解决的是 SVG DOM 压力，而不是追求最底层 API。PixiJS/WebGL2 已经足够把大部分压力从 DOM 搬到 GPU。

### 4.2 不推荐直接用 MapLibre 作为主渲染器

MapLibre GL JS 适合地理坐标、瓦片地图、地图样式规范和地理投影。这个生成器是自定义 Voronoi 世界坐标，不是经纬度瓦片地图。强行套 MapLibre 会带来：

- 数据模型不匹配。
- 编辑器和存档格式迁移成本高。
- 自定义 fantasy-map 图层仍要写 WebGL custom layer。

MapLibre 的 custom layer 能直接接入 GL 上下文，可作为参考，但不是主架构。参考：<https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/>

### 4.3 Three.js 的定位

项目已经有 `public/modules/ui/3d.js`，使用 Three.js 把高度图贴到 3D mesh 或 globe 上。这个模块可以继续保留。2D 地图主视图不需要 Three.js；如果用 Three.js 做 2D，会在文字、图标、图层批处理上比 PixiJS绕远。

## 5. 新架构设计

### 5.1 页面结构

当前：

```html
<svg id="map">
  <defs>...</defs>
  <g id="viewbox">...</g>
</svg>
```

目标：

```html
<div id="mapRoot">
  <canvas id="mapCanvas"></canvas>
  <svg id="mapOverlaySvg"></svg>
  <div id="mapHtmlOverlay"></div>
</div>
```

职责划分：

- `mapCanvas`：主地图渲染，使用 WebGL2/PixiJS。
- `mapOverlaySvg`：临时兼容层，用于尚未迁移的复杂 SVG 元素、编辑手柄、debug 线。
- `mapHtmlOverlay`：对话框、tooltip、部分可编辑文字输入和富交互控件。

迁移中也可以先保留原 `#map`，把 `canvas` 插入 SVG 下方或上方；最终再把主 SVG 收缩为 overlay。

### 5.2 渲染器核心接口

建议新增：

```ts
interface CameraState {
  x: number;
  y: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface MapRenderContext {
  grid: Grid;
  pack: PackedGraph;
  style: MapStyle;
  options: MapOptions;
  graphWidth: number;
  graphHeight: number;
}

interface GraphicsLayer {
  id: string;
  order: number;
  visible: boolean;
  build(ctx: MapRenderContext): void;
  updateStyle(style: MapStyle): void;
  updateCamera(camera: CameraState): void;
  render(): void;
  destroy(): void;
  pick?(worldX: number, worldY: number): PickResult | null;
}
```

主渲染器：

```ts
class GraphicsMapRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  setData(ctx: MapRenderContext): void;
  setLayerVisible(layerId: string, visible: boolean): void;
  setCamera(camera: CameraState): void;
  invalidate(layerId?: string): void;
  render(): void;
  pick(screenX: number, screenY: number): PickResult | null;
  exportRaster(type: "png" | "jpeg", scale: number): Promise<Blob>;
}
```

### 5.3 兼容现有 draw 函数

迁移初期不要一次性改完所有 UI。可以让现有函数名委托到新渲染器：

```ts
window.drawStates = () => graphicsRenderer.invalidate("states");
window.drawRivers = () => graphicsRenderer.invalidate("rivers");
window.drawBurgIcons = () => graphicsRenderer.invalidate("burgIcons");
```

图层开关仍然由 `layers.js` 控制，但操作对象从 SVG DOM 变成 renderer：

```ts
function toggleStates(event) {
  const visible = !layerIsOn("toggleStates");
  setLayerButton("toggleStates", visible);
  graphicsRenderer.setLayerVisible("states", visible);
}
```

这样可以分阶段迁移，不需要一次性重写所有编辑器。

## 6. 数据到 GPU 的转换

### 6.1 面图层

现有面图层来源主要有两类：

1. 基于 feature 的真实海岸/湖泊轮廓：`pack.features` + `feature.vertices`。
2. 基于 cell 分类的 isoline 面：国家、省份、文化、宗教、生物群系、温度、高度等。

当前 SVG 方案是追踪边界后生成 path。GPU 方案有两条路线：

#### 路线 A：三角化多边形

适用：国家、省份、文化、宗教、湖泊、陆地、feature 填充。

流程：

1. 继续复用 `getIsolines(..., {polygons: true})` 得到多边形点列。
2. 使用 earcut 一类三角化算法把多边形转成 `positions + indices`。
3. 每个专题类型一个 draw batch，颜色作为顶点属性或 uniform。
4. 边界线单独作为 line layer。

优点：

- 视觉和 SVG path 接近。
- 支持单个对象 picking。
- 可以缓存几何，样式变化只更新颜色。

缺点：

- 需要处理洞、多环、多边形方向和水域 gap。
- 对非常复杂海岸线需要简化和缓存。

#### 路线 B：直接渲染 Voronoi cell mesh

适用：高度、温度、生物群系、国家、省份等 cell 分类图。

流程：

1. 对每个 cell 的 polygon 进行扇形三角化，写入统一 mesh。
2. 顶点属性带 `cellId`、`typeId`、`height`、`biome`、`state` 等。
3. fragment shader 按当前 layer 的 type palette 着色。

优点：

- 不需要追踪 isoline，构建速度快。
- 编辑单个 cell 后更新局部数据更容易。
- 非常适合 heatmap、biome、states 这类分类填色。

缺点：

- 单元格边缘会呈现 Voronoi 锯齿，不如当前 `getIsolines` 的平滑边界。
- 海岸线/国家边界如果要柔和效果，还要额外叠加边界线和抗锯齿。

建议：第一阶段用路线 B 快速获得性能收益；第二阶段对海岸线、国家、省份等需要美观的大形状再切到路线 A。

### 6.2 高度图

当前 `drawHeightmap()` 按高度 0-100 追踪等高填充 path。

GPU 方案：

- 基础实现：cell mesh 着色，height 作为属性，fragment shader 通过色带采样。
- 美观实现：保留等高线追踪，但把每个高度层三角化为 mesh。
- 立体阴影：可用 height texture 生成法线，在 shader 中做简单 hillshade。

建议优先实现：

1. `HeightCellLayer`：按 cell 高度着色。
2. `HeightContourLayer`：只绘制等高线线条。
3. 以后再做 `HeightSmoothLayer`：把高度数据烘焙到 texture，shader 插值。

### 6.3 海岸、湖泊和地貌 feature

当前 `drawFeatures()` 负责：

- feature path。
- land mask / water mask。
- coastline 分组。
- lakes 分组。

GPU 方案：

- `FeatureFillLayer`：陆地、湖泊、岛屿三角化填充。
- `CoastlineLayer`：把 coastline path 转为 polyline mesh，支持宽度、阴影、模糊。
- `LakeLayer`：湖泊按 group 分类渲染。
- `MaskManager`：需要 mask 的效果改为 render texture 或 stencil。

海岸线的 fractalize 逻辑可以继续复用 `coastline-fractal.ts`，只是输出从 SVG path 改为点列。

### 6.4 线图层：河流、路线、边界、网格

线图层应统一使用 polyline mesh：

- 每条线转成一串点。
- 在 CPU 上扩展成带宽度的三角形带，或使用 shader 根据 segment 属性扩展。
- 支持 line join、cap、dash、颜色、透明度。
- 河流宽度可以沿路径变化，使用每点 width 属性。

对应迁移：

- `drawRivers()`：`Rivers.addMeandering()` 和 `Rivers.getRiverPath()` 要拆出“点列 + 宽度列”版本，避免只返回 SVG path。
- `drawRoutes()`：`Routes.getPath(route)` 要提供点列输出，按 roads/trails/searoutes 分 batch。
- `drawBorders()`：已有 vertex chain，可直接生成 polyline。
- `drawGrid()`：规则网格可以 shader 生成，也可以 CPU 生成少量线。

### 6.5 点图层：城市、港口、标记、军队、地形图标、纹章

点图层应使用 sprite atlas 和 instancing：

- 城市图标、港口锚点：把 SVG icon 转为纹理 atlas，实例属性为位置、大小、颜色、类型。
- markers：pin shape 可以预渲染到 atlas，emoji 或外部图片按需纹理化。
- relief icons：按地形类型使用 atlas。
- armies：军队标牌可先 HTML/SVG overlay，后续改为 sprite + text。
- emblems：纹章生成复杂，建议先保留 SVG overlay 或渲染成离屏 canvas/texture，再作为 sprite 放入 GPU 场景。

点图层最重要的是缩放策略：当前代码在 `invokeActiveZooming()` 中让 marker 保持屏幕大小。GPU 中应把点分成：

- world-sized：随地图缩放，例如某些装饰。
- screen-sized：保持屏幕像素大小，例如 marker、城市图标。

### 6.6 文本图层

文本是迁移难点，不建议第一阶段硬啃全部。

当前文本依赖：

- SVG `<text>`。
- `<textPath>`，用于国家名沿曲线路径排布。
- `getBBox()` / `getComputedTextLength()`，用于测量和适配。
- zoom 时动态缩放和隐藏。

建议分三步：

1. 第一阶段保留 SVG/HTML overlay 文本，只同步相机 transform。
2. 第二阶段迁移城市标签、普通 label 到 Pixi `BitmapText` 或 SDF text。
3. 第三阶段迁移国家曲线标签：CPU 计算字形沿路径的位置，使用 SDF glyph atlas 渲染。

文本 picking 和编辑仍可落在 overlay 层，避免一次性复杂化。

## 7. 图层迁移优先级

### 第一阶段：替换最大 DOM 压力

优先迁移：

1. `states`、`provinces`、`cultures`、`religions`、`biomes`：cell mesh 或三角化面。
2. `heightmap`、`temperature`：cell mesh + 色带。
3. `rivers`、`routes`、`borders`：polyline mesh。
4. `burgIcons`、`markers`：sprite batch。

这些图层节点多、切换频繁，收益最大。

### 第二阶段：视觉质量补齐

继续迁移：

1. `features`、`coastline`、`lakes` 的精细边界。
2. `texture`、`fogging`、`paper/noise` 类效果。
3. `relief icons`、`population`、`precipitation`。
4. 缩放 LOD 和图层自动隐藏。

### 第三阶段：复杂 SVG 能力替代

最后迁移：

1. 文字沿路径。
2. 纹章。
3. compass、scaleBar、ruler、debug、编辑手柄。
4. SVG 导出。

## 8. 缓存与脏标记

新渲染器必须有明确的缓存层，否则只是把 SVG 重绘换成 GPU buffer 重建。

建议缓存：

- `CellMeshCache`：所有 cell 的三角形顶点和索引，只在地图重新生成或尺寸变化时重建。
- `FeatureMeshCache`：陆地、湖泊、岛屿三角化结果。
- `IsolineCache`：按 `state`、`province`、`culture`、`religion`、`biome` 等分类缓存边界。
- `PolylineCache`：河流、路线、边界线点列和扩展后的 mesh。
- `SpriteAtlasCache`：图标、marker pin、纹章纹理。
- `TextLayoutCache`：文字测量、换行、路径排布。

脏标记粒度：

- `geometryDirty`：底层几何改变，需要重建 buffer。
- `dataDirty`：分类值、颜色或对象列表改变。
- `styleDirty`：颜色、线宽、透明度、滤镜改变。
- `cameraDirty`：只需更新矩阵和 LOD。

例如国家颜色变化不应该重算国家边界；只更新 palette buffer 即可。

## 9. Picking 和编辑

现有编辑器大量依赖 DOM 元素 id，例如 `burg12`、`river4`、`stateLabel3`。GPU 没有 DOM 节点，所以需要新 picking 层。

建议组合两种方式：

### 9.1 CPU 空间索引

适合 cell、城市、marker、文本、线附近选择。

- cell：继续用 `findClosestCell()` 和 quadtree。
- 点对象：按屏幕半径查找最近对象。
- 线对象：计算点到 polyline segment 距离。
- 面对象：先 quadtree 粗筛，再 point-in-polygon 或 cell type 判断。

### 9.2 GPU ID buffer

适合复杂重叠场景。

做一个隐藏 render texture，每个对象用唯一颜色绘制 ID。鼠标点击时读取 1 个像素，反查对象。

策略：

- 默认 CPU picking，简单可靠。
- 当对象密集或需要精确选中时，用 ID buffer。

编辑器兼容层可以返回类似：

```ts
type PickResult =
  | {kind: "cell"; id: number}
  | {kind: "state"; id: number}
  | {kind: "river"; id: number}
  | {kind: "route"; id: number}
  | {kind: "burg"; id: number}
  | {kind: "marker"; id: number};
```

然后旧编辑器根据 `kind/id` 执行原逻辑。

## 10. 样式系统迁移

当前样式散落在：

- SVG 属性。
- `public/styles/*.json`。
- DOM dataset。
- style editor 写入的属性。

新渲染器需要一个统一的 `MapStyle` 对象：

```ts
interface LayerStyle {
  visible: boolean;
  opacity: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: number[];
  blendMode?: string;
  filter?: "none" | "shadow" | "blur" | "paper" | "noise";
  zIndex: number;
}

type MapStyle = Record<string, LayerStyle>;
```

迁移时要写一个 adapter：

```ts
const style = readSvgStyleIntoMapStyle(document);
graphicsRenderer.updateStyle(style);
```

这样旧样式编辑器还能继续工作。后续再把编辑器改成直接编辑 `MapStyle`。

## 11. 导出策略

### 11.1 PNG/JPEG

直接使用 WebGL canvas：

- 正常分辨率：`canvas.toBlob()`。
- 高分辨率：创建离屏 renderer，按导出比例渲染一次。
- 注意纹理跨域、preserveDrawingBuffer、最大纹理尺寸限制。

### 11.2 SVG

SVG 导出不能自然从 WebGL 反推。建议分阶段：

1. 短期：保留旧 SVG renderer 作为“导出专用管线”。
2. 中期：为核心图层维护一个 `VectorExportAdapter`，从同一份几何缓存输出 SVG path。
3. 长期：将地图保存格式和渲染格式解耦，SVG 导出成为单独功能，不影响主视图性能。

### 11.3 存档格式

`.map` 存档应尽量不变。渲染缓存不进入存档，加载后按 `pack` 重建。

## 12. 与现有 3D 模块的关系

`public/modules/ui/3d.js` 已经使用 Three.js 做 3D mesh/globe，并通过把当前 SVG 地图转为 texture 更新 3D 视图。

主视图迁移后，3D 模块的 texture 来源应改为：

```ts
const textureCanvas = graphicsRenderer.renderToTextureCanvas();
```

这样 3D 视图也会受益，不再需要先让 SVG 生成一张图。

## 13. 实施计划

### Milestone 0：性能基线

任务：

- 在当前实现中记录地图生成、图层绘制、缩放、图层切换、导出耗时。
- 统计每个图层 SVG 节点数量。
- 用 10k、50k、100k cells 分别测量。

产出：

- `docs/performance-baseline.md`
- 一个 `window.__fmgProfile()` 调试函数。

### Milestone 1：渲染器骨架

任务：

- 新增 `src/graphics/GraphicsMapRenderer.ts`。
- 页面插入 `#mapCanvas`。
- 接入相机：复用 `d3.zoom` 的 `scale/viewX/viewY`。
- 实现图层注册、可见性、统一 render loop。

验收：

- canvas 能显示纯色海洋和陆地背景。
- 缩放、拖拽与旧 SVG 位置一致。
- 原 UI 图层按钮不会报错。

### Milestone 2：Cell mesh 和基础面图层

任务：

- 构建 `CellMeshCache`。
- 实现 `HeightLayer`、`BiomesLayer`、`StatesLayer`。
- 支持 palette 更新和 opacity。

验收：

- 高度图、生物群系、国家图层视觉大体一致。
- 切换图层不再创建大量 SVG path。
- 缩放时只更新 camera，不重建几何。

### Milestone 3：线图层

任务：

- 实现 `PolylineLayer`。
- 迁移 rivers、routes、stateBorders、provinceBorders。
- 支持 line width 随世界或屏幕缩放。

验收：

- 河流、路线、边界显示正确。
- 大地图缩放不明显卡顿。
- 河流编辑后只刷新相关 river buffer。

### Milestone 4：点图层

任务：

- 建立 sprite atlas。
- 迁移 burg icons、anchors、markers。
- 实现 screen-sized sprite。

验收：

- 城市和 marker 在缩放时保持当前行为。
- marker 点击、hover 能返回正确 id。

### Milestone 5：Overlay 兼容

任务：

- 文本、纹章、比例尺、指南针先放 overlay。
- overlay 跟随 camera transform。
- 编辑器 picking 从 DOM id 逐步改为 `PickResult`。

验收：

- 国家名、城市名、纹章仍可显示。
- 常用编辑器没有大面积回归。

### Milestone 6：视觉效果和导出

任务：

- 实现噪声、阴影、纸张纹理、海岸线柔化。
- PNG/JPEG 改用 WebGL canvas 导出。
- SVG 导出暂走旧管线。

验收：

- 常用样式 preset 视觉接近旧版。
- PNG/JPEG 导出稳定。

### Milestone 7：清理旧 SVG 主渲染

任务：

- 删除或隔离已迁移图层的 SVG 绘制路径。
- 样式编辑器直接写 `MapStyle`。
- 性能测试进入 CI 或 Playwright 快照流程。

验收：

- 主视图不依赖 SVG path 渲染大图层。
- 旧 renderer 只作为导出/回退存在。

## 14. 文件组织建议

建议新增：

```text
src/graphics/
  GraphicsMapRenderer.ts
  camera.ts
  types.ts
  styles/
    map-style.ts
    svg-style-adapter.ts
  geometry/
    cell-mesh-cache.ts
    feature-mesh-cache.ts
    isoline-cache.ts
    polyline-builder.ts
    triangulate.ts
  layers/
    BaseLayer.ts
    OceanLayer.ts
    LandLayer.ts
    HeightLayer.ts
    BiomesLayer.ts
    StatesLayer.ts
    ProvincesLayer.ts
    RiversLayer.ts
    RoutesLayer.ts
    BordersLayer.ts
    BurgIconsLayer.ts
    MarkersLayer.ts
  picking/
    cpu-picker.ts
    id-buffer-picker.ts
  export/
    raster-export.ts
    vector-export-adapter.ts
```

旧文件中的绘制函数不要立即删除，先改成 adapter：

```text
src/renderers/
  draw-heightmap.ts     -> 调用 graphics renderer
  draw-borders.ts       -> 调用 graphics renderer
  draw-burg-icons.ts    -> 调用 graphics renderer
```

`public/modules/ui/layers.js` 后续也应逐步 TypeScript 化，但这不是第一阶段必要条件。

## 15. 风险与应对

### 风险 1：视觉不一致

SVG path、滤镜、mask 的视觉效果很难一次完全复制。

应对：

- 先追求交互性能，再逐步补齐美术效果。
- 保留旧 SVG 快照作为视觉对比基准。
- 对每个 style preset 截图做 Playwright diff。

### 风险 2：文本迁移复杂

`textPath` 和测量逻辑强依赖 SVG。

应对：

- 文本先保留 overlay。
- 只迁移普通标签，不先迁移曲线路径文字。
- 等主图层稳定后，再用 SDF 字体做 GPU 文本。

### 风险 3：编辑器依赖 DOM id

大量编辑器可能直接查询 SVG 元素。

应对：

- 做 `PickResult` 和 DOM 兼容 adapter。
- 每迁移一个图层，就补对应编辑器用例。
- 不在第一阶段移除旧 DOM 查询能力。

### 风险 4：GPU 资源管理

WebGL buffer、texture、render texture 不释放会导致显存泄漏。

应对：

- 每个 layer 实现 `destroy()`。
- 地图重新生成时统一释放旧资源。
- 开发模式下记录 texture/buffer 数量。

### 风险 5：低端设备兼容

WebGPU 仍不应作为唯一后端。WebGL2 覆盖更稳，但仍要处理 context lost。

应对：

- 主后端 WebGL2。
- WebGPU 作为 Pixi renderer 的可选后端。
- 保留 SVG renderer 或 Canvas2D 简化回退。

## 16. 初始性能目标

建议设定可验证指标：

- 50k cells 地图，常用 political preset 首次绘制低于 500ms。
- 图层开关低于 100ms。
- 拖拽/缩放稳定接近 60fps，低端设备至少 30fps。
- 主要图层切换不产生大量 DOM 节点。
- 内存和显存反复生成 10 次后无持续增长。

## 17. 最小可行原型

如果先做一个最小原型，我建议只实现三件事：

1. 在页面中加入 `mapCanvas`，接入现有 `d3.zoom` 相机。
2. 用 `pack.cells` 构建 cell mesh，并显示 `cells.h` 高度色带。
3. 用同一套 cell mesh 切换显示 `cells.state` 国家颜色。

这个原型能快速证明：

- 现有 `pack` 数据能直接喂给 GPU。
- 视图坐标和缩放能与旧 SVG 对齐。
- 大面积图层不再需要 SVG path。

原型成功后，再把河流/边界/城市图标接上，收益会很快显现。

## 18. 最终目标架构

最终理想状态：

- 地图生成：仍由 `src/modules` 负责。
- 地图数据：仍是 `grid` 和 `pack`。
- 主视图：WebGL2/WebGPU canvas。
- 编辑 UI：HTML + 少量 overlay。
- 导出 PNG/JPEG：canvas。
- 导出 SVG：独立 vector export adapter。
- 3D 视图：复用主 renderer 输出 texture，不再依赖 SVG 截图。

这条路线的好处是：不用把整个项目一次重写成一个新应用，而是把最慢、最重的渲染层从 DOM 世界搬到 GPU 世界。地图生成器原有的算法资产可以继续使用，性能收益也会集中落在用户最能感知的缩放、图层切换和大图渲染上。
