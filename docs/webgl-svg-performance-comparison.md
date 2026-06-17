# WebGL 原型与 SVG 基线性能对照

本文档对照第 0 里程碑 SVG 基线和第 1 里程碑 WebGL 原型的当前结果，用于判断后续迁移优先级。

## 对照口径

- SVG 基线来自 `docs/performance-baseline-results.md`，测试对象是原 Fantasy Map Generator 的完整 SVG/HTML 渲染管线。
- WebGL 原型来自 `prototype/webgl-cells/`，测试对象是独立 WebGL2 demo。
- 两者使用的 100k 目标地图不是同一张随机地图，因此不能作为严格 A/B benchmark。
- WebGL 原型目前覆盖 cell 面、七类专题面、基础 feature 图层、国家边界、省份边界、路线、河流折线、人口点、降水点、城市/港口点、marker 点、城市标签 overlay、国家标签占位、纹章占位和 hover cell picking，不覆盖 GPU 文本、真实 COA 渲染和完整 sprite/icon atlas。
- 当前结论只用于阶段性工程决策，后续接入原项目后需要在同一张地图、同一图层开关下重新跑正式对照。

## 当前数据规模

| 指标 | SVG 基线 100k | WebGL 原型 100k |
|---|---:|---:|
| 实际 grid cells | 99846 | 99846 |
| 实际 pack cells | 44682 | 21977 |
| Voronoi 顶点 | 90010 | grid 200338 / pack 44600 |
| feature 数 | 未采集 | 174 |
| 湖泊 feature | 未采集 | 29 |
| 湖泊分组 | 未采集 | freshwater: 29 |
| 河流数量 | 551 | 497 |
| SVG 节点总数 | 77894 | 0 |
| SVG path 节点 | 2877 | 0 |
| GPU cell 三角形 | 无 | 598524 |
| GPU cell 顶点 | 无 | 1795572 |
| 湖泊三角形 | SVG path/use | 291 |
| 海岸线段 | SVG path/use | 9632 |
| 湖岸线段 | SVG path/use | 291 |
| 国家边界线段 | SVG path 汇总 | 740 |
| 省份边界线段 | SVG path 汇总 | 2605 |
| 路线数量 | 942 path 节点 | 393 |
| 路线线段 | SVG path 汇总 | 6199 |
| 河流线段 | SVG path 汇总 | 2244 |
| 降水节点/点 | 30698 circle | 11041 points |
| 人口节点/点 | 36175 line | 13760 points |
| burg 图标 | icons 图层部分 use | 440 points |
| marker 节点/点 | 1842 path/text/circle/image | 138 points |
| labels | 1202 text | 440 城市标签 + 17 国家占位 |
| emblems | 1597 use | 457 HTML badge 占位 |
| 专题面 | SVG isoline/path | height/biomes/states/provinces/cultures/religions/temperature |

## 耗时对照

| 项目 | SVG 基线 100k | WebGL 原型 100k | 说明 |
|---|---:|---:|---|
| 完整绘制 | 314ms | 暂无同口径 | SVG 的 `drawLayers` 是完整图层预设重绘；WebGL 原型尚未覆盖完整图层。 |
| drawCells | 94.2ms | 包含在 buffer 构建中 | WebGL 当前将 cell 面三角化并上传到 GPU。 |
| drawStates | 235.2ms | 包含在同一套 cell geometry 中 | WebGL 通过颜色 buffer 切换专题，不需要重建 geometry 或 DOM。 |
| drawBorders | 247.8ms | 包含在 buffer 构建中 | WebGL 当前生成国家边界和省份边界线段。 |
| drawRivers | 265.7ms | 包含在 buffer 构建中 | WebGL 当前生成折线河流，不包含 SVG 变宽河道。 |
| drawRoutes | 未单独列出 | 包含在 buffer 构建中 | WebGL 当前使用快照 `route.points` 生成 roads/trails/searoutes 折线。 |
| WebGL buffer 构建 | 无 | 244.7ms | 包含 grid cell 面、feature、四类线图层、四类点图层、picking 空间索引和默认专题颜色；overlay DOM 构建不计入 WebGL buffer。 |
| WebGL buffer 上传 | 无 | 25.6ms | 上传 grid cell、feature、线图层和点图层相关 buffer。 |
| WebGL 专题颜色更新 | 无 | 95.6ms | 当前每次切换重算并上传一份完整颜色 buffer，position buffer 复用。 |
| WebGL 单次绘制 | 无 | 0.3ms | 步骤 1.6 轻量验证结果；包含四类点层开启状态，文本/纹章 overlay 不进入 WebGL draw loop。 |
| overlay 同步 | SVG zoom handler | 已验证 | 城市标签、国家占位和纹章 badge 随 renderer camera 同步，容器不接收 pointer events。 |
| 中心点 picking | 无同口径 | 命中 | 空间索引仍使用 pack cell 语义。 |

补充：当前已新增 `tools/webgl-prototype-profile.mjs` 作为正式采集脚本。`docs/webgl-prototype-profile-results.md` 仍是步骤 1.1 后的正式采集结果；步骤 1.6 只做了轻量页面验证，尚未重跑正式多次采样报告。

## 图层节点压力

SVG 基线在 100k 目标 cells 下的节点压力集中在：

| 图层 | SVG 子节点 | 主要节点类型 |
|---|---:|---|
| population | 36175 | line |
| prec | 30698 | circle |
| markers | 1842 | path/text/circle/image |
| emblems | 1597 | use |
| armies | 1397 | text/image |
| icons | 1339 | use |
| labels | 1202 | text |
| routes | 942 | path |
| rivers | 551 | path |

这说明后续只迁移 cells、states、borders、routes、rivers 还不够。真正要降低完整渲染成本，必须继续处理人口、降水、标记、纹章、图标、标签等大量节点图层。

## 当前结论

1. WebGL 原型已经验证了最重要的性能方向：视图变化和专题切换可以避免重建 SVG DOM，单次绘制耗时仍在毫秒级。
2. 当前专题切换复用同一套 grid cell position buffer，只更新颜色 buffer；这满足阶段 1.3 的性能路径，但后续 palette 编辑还需要局部更新优化。
3. 当前 WebGL 步骤 1.4 轻量验证构建耗时约 `249ms`，这是因为底层 mesh 已改为约 `100k` 个均匀 grid cells，并增加了 feature 面、岸线、专题颜色、四类线图层和 picking 索引；它不是完整图层替代，不能直接声明总体速度提升比例。
4. feature 图层已经证明 `pack.features`、湖泊 group 和 `pack.vertices` 岸线可以进入 GPU buffer；当前视觉是折线和简化填充，不包含 SVG fractal coastline、mask、blur/filter。
5. 线图层已经证明真实 `pack.rivers` 和 `pack.routes` 可以进入统一 GPU buffer；下一步如果要接近原视觉，需要实现宽线 polyline mesh、join/cap、dash 和 line picking，而不是继续停留在 `gl.LINES`。
6. `population`、`prec`、`burgIcons`、`markers` 已进入 WebGL 点层通路，证明高节点图层可以脱离 DOM；当前仍是 `gl.POINTS` 占位，不代表 sprite atlas、marker pin、emoji/icon 和对象级 picking 已完成。
7. `labels` 和 `emblems` 已明确第一阶段走 HTML/SVG overlay，而不是强行 GPU 化；当前实现验证了相机同步、开关和统计，但没有复刻国家曲线 `textPath`、真实 COA renderer、碰撞避让和导出合成。
8. SVG 基线中剩余复杂压力仍包括 `icons`、`armies` 和真实纹章/标签细节；后续里程碑应继续规划 sprite、文本 overlay、LOD、对象级 picking 和可选 GPU picking。

## 下一步建议

1. 将步骤 1.6 交给门下和侍中验收。
2. 在接入原项目前，补一轮同地图、同图层开关下的 SVG 与 WebGL 对照测试。
3. 后续继续把点层从占位 `gl.POINTS` 推进到 sprite atlas、LOD 和 burg/marker picking。
4. 评估真实 COA 是继续 SVG overlay、离屏纹理缓存，还是按缩放级别混合使用。
5. 评估 GPU color picking 是否值得纳入第 1 里程碑，或推迟到编辑器接入阶段。
