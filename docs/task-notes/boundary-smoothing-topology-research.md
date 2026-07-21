# 边界平滑算法与渲染不变量调研

> 对应权威任务第 128、159 项。状态：调研与独立验证原型均已完成；不修改正式 renderer、地图几何或存档结构。

## 1. 结论先行

边界质量问题不能只靠“换一种平滑曲线”解决。海岸线、国界和省界的首要约束是拓扑，视觉平滑必须建立在共享弧线之上：

1. 水陆填充、政治填充和边界描边必须引用同一份不可变弧线采样，不能各自从 cell 或 polygon 再平滑一次。
2. 相邻国家 / 省份的公共边只保存一次；双方的 polygon ring 以正向 / 反向 `ArcRef` 引用同一个 `arcId`。
3. 三岔及以上行政节点、地图外框节点、孤岛闭环锚点必须锁定；平滑只能改变节点之间的弧线内部点。
4. 编辑预览允许使用临时几何；pointerup / 应用时必须先在 CPU 侧构建和验证新的完整拓扑快照，再原子替换填充、描边、picking 和导出所用快照。
5. 推荐主线是“共享 Voronoi 边 → 最大共享弧线 → 拓扑约束的加权 Visvalingam 简化 → 有位移上限的单次 Chaikin / 二次曲线采样 → 同源 triangulation 与 stroke”。Catmull-Rom 和普通 B-spline 只进入对照原型，不作为默认生产方案。
6. 实施优先级固定为海岸线、国界、省界。海岸线先证明水陆填充与岸线完全同源；国界再证明两个国家与 stroke 共用弧线；省界最后复用同一结构并使用更小容差。

## 2. 当前实现基线

现有实现并非从零开始：

- [`cell-visual-layer.js`](../../app/webgl-generator/src/renderer/cell-visual-layer.js) 已按排序后的 Voronoi 顶点对缓存 `edgeCurves`。相邻 cell 以相反方向读取同一曲线，cell 填充 mesh 因此天然共边。
- [`shore-layer.js`](../../app/webgl-generator/src/renderer/shore-layer.js) 的 `visualSharedCellEdge` 会读取同一 `cellVisualMesh.edgeCurves`，所以当前“视觉 cell 模式”下海岸 stroke 与 cell 填充边已经基本同源；硬边模式同样读取共享 Voronoi 边。
- [`political-layer.js`](../../app/webgl-generator/src/renderer/political-layer.js) 会从政治边界路径分别构造带状填充和边界 stroke；填充两侧还会各自执行 Chaikin，stroke 则读取另一条路径。它们虽来自相同 cell 语义，却不是同一份最终采样，不能从结构上证明永不分离。
- [`geometry.js`](../../app/webgl-generator/src/renderer/geometry.js) 已有 Chaikin 式 corner-cutting，迭代一次会把每段变成两个内部点；它适合渲染采样，但当前没有共享弧线节点锁定、最大位移和全局交叉验证。
- [`edit-refresh-scheduler.js`](../../app/webgl-generator/src/runtime/edit-refresh-scheduler.js) 已把 `terrain-caches`、`political-boundaries`、line layers 和 cell colors 分开失效。后续应把它们收敛到一个带版本的 `boundary-topology` 快照，而不是继续增加彼此独立的缓存开关。

因此，海岸线阶段应复用并提升现有 `edgeCurves`，不应另起一套岸线 spline；政治阶段才是需要结构整改的重点。

## 3. 候选算法比较

| 候选 | 基本性质与复杂度 | 优点 | 主要失败模式 | 本项目结论 |
| --- | --- | --- | --- | --- |
| Chaikin corner-cutting | 每次迭代线性扫描，点数约按 `2^k` 增长；近似二次 B-spline，通常不穿过原内部顶点 | 实现简单、局部、视觉圆润；当前已有实现 | 收缩轮廓、抹掉狭窄海峡 / 尖角；独立处理两侧会分缝；三岔节点若不锁定会漂移 | 保留为共享弧线的最后一级渲染采样，只允许 1 次或很小 `k`，锁端点并限制位移 |
| Catmull-Rom | 每段常数代价，整体 `O(n × samples)`；插值控制点 | 穿过关键点，局部控制，曲线连续 | 普通参数化可能 overshoot、回环、自交；穿过节点不等于保持 polygon 拓扑 | 仅做对照原型；即使采用 centripetal 参数化，也必须做交叉、环方向和邻接验证 |
| 普通 B-spline | 局部基函数，求值约 `O(n × degree)` 或按采样线性；通常逼近而非插值 | 高阶连续、视觉平顺 | 偏离原线且端点处理复杂；窄地形和三岔处容易越界；无法自行保证共享边 / 无自交 | 不作为地图边界默认；可用于离线视觉实验，不直接进入拓扑数据 |
| Douglas-Peucker | 典型递归实现平均约 `O(n log n)`、最坏 `O(n²)` | 有直观最大偏差阈值，适合删去密集共线点 | 高压缩下易产生尖刺；逐 polygon 执行会制造缝隙；不保证无自交 | 作为最大偏差基线与粗预简化候选，不单独承担生产拓扑 |
| Visvalingam-Whyatt | 以最小有效三角面积逐点删除；堆实现通常 `O(n log n)` | 更符合制图视觉，能保留整体形状层次 | 原始算法没有严格最大距离保证；独立环仍可能交叉或断开邻接 | 推荐作为共享弧线主简化器，锁节点并叠加最大位移 / 交叉约束 |
| JTS / GEOS CoverageSimplifier | 覆盖级面积简化，复杂度由实现决定，应实测 | 保留 coverage 有效性、节点和线邻接；可区分内外边容差 | 要求输入本来就是有效 coverage；Java / C++ 运行时不适合直接塞入浏览器 | 作为正确性 oracle 和算法设计参照，不作为第一阶段生产依赖 |
| CGAL 拓扑保持 polyline simplification | 约束三角剖分中按代价删除点，停止条件可配置 | 明确保证不新增相交、不改变岛屿嵌套；可考虑邻线距离 | C++ / WASM 集成重，许可证需逐包核查；不是共享 polygon ring 数据模型本身 | 作为严苛拓扑验证和离线对照，不直接集成 |

算法的一手依据：

- Chaikin 原论文为 George Chaikin 1974 年的 [An algorithm for high-speed curve generation](https://doi.org/10.1016/0146-664X(74)90028-8)。其 corner-cutting 本质适合生成圆润近似线，但论文算法本身不处理地图 coverage。
- Catmull 与 Rom 的 1974 年 [A class of local interpolating splines](https://doi.org/10.1016/B978-0-12-079050-0.50020-5)定义局部插值 spline；“插值控制点”不能推导出“不越过邻区”。
- Douglas 与 Peucker 1973 年论文 [Algorithms for the Reduction of the Number of Points Required to Represent a Digitized Line or its Caricature](https://doi.org/10.3138/FM57-6770-U75U-7727)给出线简化经典基线。
- Visvalingam 与 Whyatt 1993 年的 [Line generalisation by repeated elimination of points](https://doi.org/10.1179/000870493786962263)以相邻三点的有效面积确定删除优先级。
- [JTS `CoverageSimplifier` 1.20 API](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/coverage/CoverageSimplifier.html)明确承诺有效输入仍有效、共享多边形节点不移动、线邻接不移除、ring 至少保留 4 点，并允许内外边不同容差。
- [PostGIS `ST_CoverageSimplify`](https://postgis.net/docs/ST_CoverageSimplify.html)进一步明确：coverage 简化后的 polygon 在共享边上保持一致；无效输入可能产生边界相交或原共享边分离，证明“先验证 coverage”不能省略。
- [CGAL 2D Polyline Simplification](https://doc.cgal.org/latest/Polyline_simplification_2/index.html)以 constrained triangulation 判断删点是否会新增相交，并提供绝对、邻线缩放和混合距离代价，可作为窄海峡与密集省界的约束参照。
- [Mapshaper 简化指南](https://mapshaper.org/docs/guides/simplification.html)把 weighted Visvalingam 作为默认制图方法，同时说明高压缩下的自交、shape 消失与 shared topology 前置条件；它也指出跨层边界只有在源顶点完全对齐时才会一致，因此本项目不能在 polygon 生成后再“猜”共享边。

## 4. 为什么必须使用共享弧线

### 4.1 填充与描边同源证明

定义一次提交后不可变的 `BoundaryTopologySnapshot S`。每条弧线 `arc` 在 `S` 中只有一个最终采样数组 `arc.renderPoints[lod]`：

- polygon ring 由 `ArcRef[]` 拼接这些数组；
- fill triangulation 只消费拼接后的 ring；
- border stroke 直接消费同一数组；
- picking、PNG 与 GeoJSON 导出也消费该快照或它的无损世界坐标形式。

只要禁止 fill / stroke 消费端再次平滑、偏移或量化，二者在世界坐标上就是同一序列，投影到屏幕后仍是同一中心线。它不依赖 epsilon 猜测，而是引用相等带来的结构保证。

### 4.2 相邻行政区共边证明

相邻区域 A、B 不各存一份坐标，而分别保存 `{arcId: 17, reversed: false}` 与 `{arcId: 17, reversed: true}`。二者展开结果严格互为逆序，因此不会产生 gap 或 overlap。边界 stroke 也引用 `arcId: 17`，不从 A 或 B 的 polygon 再提取一次。

### 4.3 编辑提交收敛证明

预览态 `DraftBoundaryOverlay` 可以与当前快照分离；提交必须执行：语义数组草稿 → 新快照构建 → CPU 不变量验证 → 原子替换 `snapshotRef` → 从同一快照生成 / 上传 fill 与 stroke。任一步失败则旧 `snapshotRef` 保持，命令不进入历史。这样编辑后不存在“数据已改、某个边界缓存仍旧”的中间持久状态。

## 5. 推荐数据结构

```js
BoundaryTopologySnapshot {
  version,
  sourceRevision: {terrain, feature, state, province},
  nodes: Map<nodeId, {
    vertexId, point, degree, locked, worldBoundary
  }>,
  rawEdges: Map<edgeId, {
    vertexA, vertexB,
    left:  {land, feature, state, province},
    right: {land, feature, state, province}
  }>,
  arcs: Map<arcId, {
    nodeA, nodeB, rawEdgeIds,
    sourcePoints, importance,
    renderPointsByLod, bbox
  }>,
  rings: {
    land:     Map<featureId, ArcRef[][]>,
    states:   Map<stateId, ArcRef[][]>,
    provinces: Map<provinceId, ArcRef[][]>
  },
  validation
}

ArcRef {arcId, reversed}
```

构建规则：

1. `rawEdges` 直接来自共享 Voronoi 顶点对，稳定 key 使用排序后的 `vertexA:vertexB`，并记录两侧 cell 的 land / feature / state / province。
2. 节点是 degree 不等于 2 的顶点、三方及以上 ownership 变化点、地图外框点、闭环指定锚点；其余连续边合并为最大弧线。
3. 海岸弧线筛选 `left.land !== right.land`；国界和省界分别筛选 state / province 不同且两侧都为有效陆地。
4. 同一个 raw edge 可被海岸、国家和省份语义引用，但只生成一份基础几何；不同层可使用不同 LOD / 容差派生，不能改变基础 node。
5. `importance` 预计算 Visvalingam 有效面积并锁定节点；LOD 只按阈值过滤同一弧线点，避免每次缩放重新执行算法。

## 6. 推荐处理管线

### 6.1 海岸线（优先级 1）

1. 延续现有共享 `edgeCurves`，先把它提升为 `BoundaryTopologySnapshot.rawEdges / arcs` 的基础采样。
2. 对海岸最大弧线执行加权 Visvalingam，锁定地图边、海峡端点、湖海连接点、三岔点和闭环锚点。
3. 仅对简化后的共享弧线执行一次 `factor ≤ 0.2` 的 Chaikin 或现有二次 edge 采样；每个新点位移限制为局部 Voronoi 边长的比例且不超过世界单位上限。
4. 验证新弧线不与非相邻海岸相交、不改变 island / lake / ocean 嵌套、不跨越受保护城镇 / 路线锚点所在 cell。
5. 水陆填充与 coastline / lake-shore stroke 同时从该弧线快照生成。

### 6.2 国界（优先级 2）

1. 从已建立的基础 raw edge ownership 上筛选 state 变化，不从各国 polygon 独立抽边。
2. 最大弧线端点锁定在三国交界、海岸交点与世界边界；两国共享段只保留一个 `arcId`。
3. 先用 coverage 级加权 Visvalingam；如需更圆润，只对共享弧线内部做有界一次平滑。
4. 国色填充 ring、国界 stroke、国家 picking 与 PNG 同用一个 state topology revision。

### 6.3 省界（优先级 3）

省界完全复用国界结构，但默认容差更小、平滑 factor 更低，并锁定国界上的全部节点。跨国省界不得形成独立几何；它必须引用国界弧线或在国界节点处分段，防止省界越过国界。

## 7. 缓存失效与提交时序

### 7.1 revision 与缓存 key

建议新增四类单调 revision，而不是以对象引用或全图 checksum 判断：

- `terrainRevision`：grid / pack 高度、海陆与 Feature 拓扑改变时递增；
- `stateRevision`：国家 ownership / merge / split 改变时递增；
- `provinceRevision`：省份 ownership / 重分省改变时递增；
- `geometryStyleRevision`：平滑算法参数、容差和 LOD 桶改变时递增。

缓存关系：

- `rawEdgeTopology` 依赖 terrain + state + province；
- `coastArcs` 依赖 terrain + geometryStyle；
- `stateArcs` 依赖 terrain + state + geometryStyle；
- `provinceArcs` 依赖 terrain + state + province + geometryStyle；
- fill mesh 与 stroke mesh 必须共享同一 `{snapshotVersion, layer, lod}`，不得各自出现独立 geometry revision。

局部编辑可以记录 affected raw edge key 并重建相邻弧线，但第一版应先保证全量正确，再以 10k / 50k / 100k profile 决定是否做局部重建。

### 7.2 正式提交

```text
预览手势
  → 语义 command 草稿
  → 应用到事务副本
  → 构建新的 CPU boundary snapshot
  → coverage / ring / 交叉 / 邻接验证
  → 成功：写入单条历史并原子替换 snapshot
  → 从该 snapshot 同批生成 fill / stroke / picking / export 缓存
  → GPU buffer 上传成功后一次 draw
  → 失败：丢弃副本与新缓存，旧地图和旧 snapshot 不变
```

异步构建必须捕获 `{mapIdentity, commandVersion, sourceRevision}`；完成时三者任一变化即丢弃旧结果。撤销、重做、完整地图导入和 GEO 重置都走同一构建入口。

## 8. 分阶段原型方案

### P0：离线拓扑夹具

- 只新增纯函数和固定夹具，不接 renderer。
- 覆盖单岛、带洞岛屿、狭窄海峡、湖海连接、三国交界、跨国省界、地图边界和闭环无 degree≠2 节点。
- 输出 arc / node / ring 与验证报告；用 JTS / GEOS 或 PostGIS CoverageSimplify 的输出作为离线 oracle，不复制其源码。

### P1：海岸同源原型

- 从现有 `edgeCurves` 迁移 coastline / lake shore；同一采样生成水陆 fill 与 stroke。
- 保留开关对照旧实现；不触碰国家、省份。
- 达标后再替换旧岸线缓存。

### P2：国界共享弧线

- state fill / border / picking 迁移到同一 state arc snapshot。
- 固定三国交界、海岸交点和跨海国家样本；验证国家合并 / 拆分与撤销重做。

### P3：省界与多级 LOD

- province ring 引用共享弧线并锁国界节点。
- 预计算重要度，按相机尺度选择 LOD 桶；LOD 切换只能减少内部点，不能改变 node / arc 引用。

### P4：局部失效与性能

- 在不变量测试稳定后，才引入 affected raw edge → arc → ring 反向索引。
- 以实际 profile 决定 Worker 化和局部 GPU buffer 更新，不先做抽象重构。

## 9. 客观验收指标

几何正确性：

- 相邻区域共享边引用同一 `arcId` 且方向相反：`100%`。
- fill ring 与 stroke 使用同一 `{snapshotVersion, arcId, lod}`：`100%`。
- stroke 中心线到对应 fill 边最大距离：世界坐标 `≤ 1e-4`，屏幕空间 `≤ 0.25 px`。
- 三岔 / 世界边界锁定节点位移：`0`。
- 新增自交、非相邻边相交、gap、overlap、非法 ring、消失的受保护最大岛：`0`。
- topology 提交后旧 revision 的 fill / stroke / picking / export 缓存残留：`0`。

形状质量：

- 最大 Hausdorff / 点到线偏差不超过每层明确容差；海岸、国界、省界分别记录。
- 面积相对误差报告 P50 / P95 / max；首版建议海岸与国家 P95 `≤ 0.5%`、省份 P95 `≤ 1%`，小岛 / 小省单独按绝对面积门槛保护。
- 狭窄海峡最小宽度、最小陆桥宽度和湖海连通分类不得改变。
- 与旧实现比较转角尖峰数、每世界长度转角能量和可见折点数，不能只以“点更少”宣称更平滑。

性能与内存：

- 10k / 50k / 100k 分别记录 topology build、简化、triangulation、stroke mesh、GPU upload 和首帧时间。
- 100k 全量 CPU 边界构建首版目标 `< 500ms`；交互提交若超过 `100ms` 必须进入 Worker 或分帧并显示 busy，不阻塞输入。
- arc 源点、LOD 点、ring refs 和 mesh 字节数分别统计；共享弧线后相邻 polygon 不得重复持有完整坐标数组。

## 10. 开源实现与许可边界

| 参考实现 | 用途 | 许可与处理 |
| --- | --- | --- |
| [TopoJSON specification](https://github.com/topojson/topojson-specification) / [topojson-client](https://github.com/topojson/topojson-client) | 共享 arc、正反向引用和 ring 组装的数据模型参照 | client 为 ISC；若后续直接依赖需保留许可文本。当前只采用公开格式思想 |
| [topojson-simplify](https://github.com/topojson/topojson-simplify) | 预计算点重要度、按阈值生成 LOD 的参考 | ISC，可作为轻量原型候选；仓库最新 release 较旧，生产采用前需补性能与维护性评估 |
| [JTS](https://github.com/locationtech/jts) | coverage validator / simplifier 正确性 oracle | EPL 2.0 或 EDL 1.0；Java 不进入浏览器生产包，适合离线测试 |
| [GEOS CoverageSimplifier](https://libgeos.org/doxygen/classgeos_1_1coverage_1_1CoverageSimplifier.html) | JTS coverage 算法的 C++ 对照和离线 oracle | GEOS 为 LGPL 2.1；不在本阶段引入 WASM / native 分发 |
| [Mapshaper](https://github.com/mbloch/mapshaper) | weighted Visvalingam、shared topology 和可视对照 | MPL 2.0 文件级 copyleft；可作为开发工具和黑盒基准，不复制实现到本项目源码 |
| [CGAL Polyline Simplification](https://doc.cgal.org/latest/Polyline_simplification_2/index.html) | 拓扑约束删点、邻线距离代价参考 | [CGAL 双许可证](https://doc.cgal.org/latest/Manual/license.html)含 GPL / LGPL 与商业许可，具体 package 需再次核查；本阶段只读算法说明 |

论文描述的数学算法可用于独立实现，但不得复制论文或外部仓库源码。若未来改变为直接依赖，必须在独立权威任务中完成许可证、bundle 体积、Worker / WASM、浏览器兼容和供应链审查。

## 11. 明确不推荐

- 不对每个国家 / 省份 polygon 单独调用 Chaikin、Catmull-Rom、B-spline、Douglas-Peucker 或 Visvalingam。
- 不先生成 fill polygon，再从 polygon 边界另行提取 stroke。
- 不让海岸、国家、省份使用互不关联的随机扰动或噪声种子。
- 不以 `buffer(0)`、snap 或事后 clean 作为正常拓扑流程；它们只能是导入坏数据的显式修复工具。
- 不在 pointermove 持久修改 canonical topology；预览与提交必须分层。
- 不在第一个实现阶段同时追求局部增量、Worker、WASM 和多级 LOD；先证明共享弧线不变量。

## 12. 独立验证原型

权威任务第 159 项已把上述边界 case 落为 [`prototype/boundary-topology-lab/`](../../prototype/boundary-topology-lab/) 独立实验室。运行方式：

```powershell
pnpm run start:boundary-topology-lab
pnpm run regress:boundary-topology-lab
```

原型验证共享 arc、正反 `ArcRef`、锁定节点、不可变快照、fill / stroke 同源、环与 coverage 有效性、分层形状误差和八类案例约束；候选算法允许失败并明确显示失败原因。它只验证数据结构和几何不变量，不代表 P0～P4 已进入正式渲染器。

本报告与原型只形成后续实现依据，不自动创建新的活动任务；是否进入 P0～P4 由后续权威任务决定。
