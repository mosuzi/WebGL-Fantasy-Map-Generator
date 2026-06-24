# 当前开发计划

本文档用于追踪当前阶段计划。后续每次推进里程碑或改变路线，都应同步更新这里。

## 2026-06-18 计划复位

当前正式应用生成质量在用户验收中被判定为已经跑偏：地形、河流、路线、聚落和后续专题均出现明显失真。开发暂停继续叠加阶段 3 功能，先进入 source 优先复位整改。

新的总纲入口是 `docs/source-first-recovery-execution-plan.md`，详细施工入口是 `docs/source-first-detailed-task-plan.md`。详细规程已经补充独立新智能体 source 复查后的缺口清单、完整生成顺序、字段契约、source baseline 导出 schema、模板/seed/cells 矩阵、各阶段任务包和可脚本判定的验收要求。后续按太子-尚书-门下-侍中四级流程，从 source 对照基线、grid/Voronoi、高度模板、grid/pack features、河流、生物群系、适居度、文化、城市、国家、路线、宗教和省份逐层恢复。

在 source 对照基线完成前，不继续推进 UI 面板、对象编辑、路线样式、政治专题或其他后续功能。

阶段 0 已开始落地：

- 新增 `tools/source-export-baseline.mjs`，可导出单个 source baseline 的 `source-summary.json`、`source-trace.json` 和 `validation.md`；截图需用 `--screenshot true` 本地生成，默认不纳入版本库。
- 新增 `tools/source-baseline-matrix.mjs`，可运行 `quick/full` source baseline 矩阵并生成 `docs/source-baselines/matrix.json` 与 `matrix.md`。
- 已完成 quick matrix：`mediterranean`、`continents`、`archipelago` 三个 100000 cells source 样例均已导出。
- 新增 `tools/webgl-generator-export-baseline.mjs`，可导出正式应用同 case 的 `candidate-summary.json` 和 `candidate-validation.md`；截图需用 `--screenshot true` 本地生成，默认不纳入版本库。
- 新增 `tools/baseline-diff.mjs`，可生成 source/candidate 的 `diff.json` 和 `diff.md`。
- `mediterranean / 100000 / audit-mediterranean-001` 当前 diff 显示：`grid.cells`、`grid.avgDegree`、`grid.boundaryPoints` 已对齐；`pack` 仍是一比一映射，降水、河流、城市、港口和海路仍明显偏离 source。

阶段 1 已开始落地：

- 正式应用 `grid` 已切换为 source 风格的 boundary points、jittered grid、Delaunator 全局三角剖分和 half-edge Voronoi。
- 新增本项目独立 vendor：`app/webgl-generator/src/vendor/delaunator.umd.js` 与 wrapper，不在运行时依赖 `source/`。
- 100000 cells 地中海 case 当前结构验收：grid cells `99846`，boundary points `648`，平均邻接度 `5.976`，均与 source baseline 对齐。

阶段 2 已完成第一版整改：

- 正式应用随机数改为 source 同款 Alea PRNG。
- grid 与 heightmap 改为分别从同一 seed 重置随机流，贴近 source 的生成状态顺序。
- `heightmap.js` 去掉此前自创的全局水陆重平衡、relief 拉伸、坡脚平滑和残余噪声后处理。
- `Hill/Pit/Range/Trough/Strait/Mask/Add/Multiply/Smooth/Invert` 的关键随机取值、`Uint8Array` 高度截断、`blobPower/linePower` 档位、`findGridCell` 查找逻辑已贴近 source。
- 100000 cells 地中海 case 当前高度验收：陆地比 source `0.611` / candidate `0.609`，高度 p50 source `27` / candidate `26`，高度 p95 source `76` / candidate `83`，均通过当前 diff 阈值；湖泊数也从失真状态恢复到同量级。

阶段 3 已完成第一版整改：

- `grid` feature 标记切回 source 风格的 `grid.cells.t/f` 与 `grid.features`，feature 使用 `land` 标记区分陆水，水体按 `ocean/lake` 分类。
- 地图坐标、温度和降水已改为 source 风带/纬度/海拔链路的第一版复刻。
- 100000 cells 地中海 case 当前气候验收：降水均值 source `9.171` / candidate `12.747`，通过当前 diff 阈值；温度最高值 source `27` / candidate `26`，通过；温度最低值仍为 warn，后续可在气候细节阶段继续收紧。

阶段 4 已完成第一版整改：

- `pack` 不再是一比一 grid 映射，已按 source `reGraph()` 逻辑排除深海、抽掉部分非岸湖点、为岸线补 midpoint，并重新计算 pack Voronoi。
- `pack.cells.p/g/h/c/v/b/i/area` 已生成，`grid.cells.pack` 对被抽掉的深海 cell 使用 `-1`，picking 已能回退到 grid feature。
- 100000 cells 地中海 case 当前 pack 验收：pack cells source `73028` / candidate `73450`，pack/grid source `0.731` / candidate `0.736`，pack 平均邻接度 source `5.97` / candidate `5.969`，均通过当前 diff 阈值。

阶段 5 已完成第一版整改：

- `pack` 上已重新 markup features，生成 `pack.cells.t/f/haven/harbor` 和 `pack.features`。
- pack feature 已包含 `firstCell/area/shoreline/height/group` 等阶段字段，湖泊 shoreline 与 height 已可供后续河湖水文使用。
- 100000 cells 地中海 case 当前 feature 验收：haven cells source `7148` / candidate `6146`，pack grid 引用、pack 邻接引用、pack 顶点引用、haven 引用和 harbor mismatch 均通过；当前剩余缺口转为阶段 6 的 `pack.cells.fl/r/conf` 和阶段 7 的 `pack.cells.s`。

阶段 6 已完成第一版整改：

- 河流生成已迁到 pack 语义图，生成 `pack.cells.fl/r/conf` 和 `pack.rivers`。
- 当前过渡期 river 对象同时保留 source 风格 pack `cells/source/mouth` 和给现有 grid 语义模块使用的 `gridCells/sourceGrid/mouthGrid`。
- 100000 cells 地中海 case 当前河流验收：河流数 source `956` / candidate `1068`，river cells source `5708` / candidate `6946`，均通过当前 diff 阈值；river loop、pack river 引用和 grid 映射烟测均为 `0`。

阶段 7 已完成第一版整改：

- 新增 pack 版 `Biomes.define()` 与 `rankCells()`，生成 `pack.cells.biome/s/pop`。
- 当前 renderer 仍使用 grid cell mesh，因此阶段 7 会把 pack biome/s/pop 镜像到对应 grid cell，用于专题面、hover 和过渡期城市生成。
- 100000 cells 地中海 case 当前人口验收：positive population cells source `53650` / candidate `56938`，通过当前 diff 阈值；所有必需 pack 字段已补齐。

阶段 8 已完成第一版整改：

- 文化生成已迁到 pack 语义图，文化中心从 `pack.cells.s/pop` 为正的 cell 中选择，生成 `pack.cells.culture`。
- 文化类型和扩张成本开始复刻 source 的 `Cultures.generate()` / `Cultures.expand()` 主链，纳入 biome 成本、海拔、水体、河流、海岸距离与文化类型 expansionism。
- 当前过渡期会把 `pack.cells.culture` 镜像到 `grid.cells.culture`，供现有专题面、hover、国家和城市模块继续运行。
- 政治中心的过渡期选择已改为优先使用有文化且有正人口的 grid 镜像 cell，避免阶段 8 后旧政治模块从无人口高地生成“荒野国家”。
- 100000 cells 地中海 case 当前文化验收：文化数 source `10` / candidate `10`，cultured pack cells `56938`，cultured grid cells `53680`，文化中心引用错误和非人口文化 cell 均为 `0`；下一步 diff 建议已切到阶段 9 城市与港口。

阶段 9 已完成第一版整改：

- 城市生成已迁到 pack 语义图，生成 source 风格 `pack.burgs` 和 `pack.cells.burg`。
- 城市候选来自 `pack.cells.s > 0` 且已分配文化的 cell，城镇数量按 source `populated / 5 / density^0.8` 公式恢复到同量级。
- 港口判定已按 `haven/harbor`、水体 feature、冻结温度和同水体候选数量执行，并把港口位置向共享岸线移动。
- 当前 `settlements.cities` 仍保留 grid cell、屏幕点层和 route 过渡字段；路线生成做了限流，完整道路/海路留给阶段 12。
- 100000 cells 地中海 case 当前城市验收：城市 source `1724` / candidate `1854`，港口 source `230` / candidate `287`，城市落水 `0`，pack burg 引用错误 `0`；下一步 diff 建议已切到阶段 10 国家。

阶段 10 已完成第一版整改：

- 生成顺序已改为 source 风格的“城市首都候选先生成，国家再从 capital burgs 生成”。
- 国家生成已迁到 pack 语义图，生成 `pack.states` 和 `pack.cells.state`，再镜像到 `grid.cells.state` 供当前 renderer 和 hover 使用。
- 国家扩张成本开始复刻 source `States.expandStates()` 主链，纳入文化、人口、biome、海拔、水体、河流、海岸距离和 expansionism。
- 当前省份仍是旧过渡模型，但建立在新的 pack state 镜像上；完整省份生成留给阶段 11。
- 100000 cells 地中海 case 当前国家验收：国家 source `21` / candidate `21`，首都 `21`，城市 `1828`，港口 `284`，water state cells `0`，burg/state mismatch `0`；下一步 diff 建议已切到阶段 11 省份。

阶段 11 已完成第一版整改：

- 省份生成已迁到 pack 语义图，生成 `pack.provinces` 和 `pack.cells.province`，再镜像到 `grid.cells.province`。
- 省份中心来自 state 内 burg，省份扩张限制在所属 state 内，补齐无省份 state land cell，并做第一版形状修正。
- 当前省份比例按 source baseline 校准为 `14`，使地中海 100000 case 回到 source 同量级。
- 100000 cells 地中海 case 当前省份验收：省份 source `477` / candidate `507`，province 引用错误 `0`，跨 state province cell `0`，未分配 state land cell `0`；下一步 diff 建议已切到阶段 12 路线。

阶段 12 已完成第一版整改：

- 路线生成已迁到 pack 语义图，生成 `pack.routes` 和 `pack.cells.routes`，再输出当前 renderer 使用的 `settlements.routes`。
- 主路、小路和海路分别按 source 思路从 capital burgs、同 feature burgs、同水体 ports 生成 Urquhart 候选边。
- 路线寻路使用 pack 邻接图，陆路禁止穿水，海路从港口 haven 水 cell 到 haven 水 cell，并把两端港口补回路线。
- 100000 cells 地中海 case 当前路线验收：routes source `1331` / candidate `1368`，roads `19` / `18`，trails `1098` / `1120`，searoutes `214` / `230`，陆路穿水 `0`，海路中段穿陆 `0`；下一步 diff 建议已切到阶段 13 宗教。

阶段 13 已完成第一版整改：

- 宗教生成已迁到 pack 语义图，生成 source 风格的 `pack.religions` 与 `pack.cells.religion`。
- 生成顺序已调整为：文化先生成，城市/国家/省份/路线完成后再执行宗教 finalize，使宗教扩张可以读取 burg、state 和 route 成本。
- Folk 宗教按文化铺底；组织宗教从高人口 burg / 高适居 pack cell 放置，并按 culture/state/global 三类扩张约束在 pack 邻接图上扩张。
- 宗教扩张成本纳入文化差异、国家差异、生物群系通行、道路/小路/海路和水域通行惩罚，并把结果镜像到 `grid.cells.religion`。
- 100000 cells 地中海 case 当前宗教验收：religions source `19` / candidate `19`，宗教 pack/grid 引用、城市宗教同步和路线依赖烟测通过；当前 diff 已降为 `fail 0 / warn 1`，仅剩温度最低值 warn。

阶段 14 已完成第一版整改：

- 对照 source `calculateTemperatures()`、`heightExponentInput` 默认值和当前 candidate 高度冷尾，收紧高度降温指数。
- 当前 `heightExponent` 从过暖的 `1.8` 调整为 `1.94`，使地中海 100000 case 的 `grid.temperature.min` 从 candidate `-19` 回到 source `-35`。
- 本阶段不改风带、纬度、降水主体模型和地形高度，只校准温度最低值边界；修正后人口、城市、路线、省份、宗教等主指标仍保持通过。
- 100000 cells 地中海 case 当前总体验收：diff 状态 `pass`，`fail 0`，`warn 0`。

阶段 15 已完成第一版矩阵整改：

- 高度模板 trace 补充 grid/首候选诊断后，确认 `Hill/Pit` 起点采样比 source 多一次；已改为 source 的 `do...while limit++` 行为，使高山岛屿 100000 case 每步随机数与高度分布对齐。
- 河湖水文补齐 source 的 `detectCloseLakes()`、`defineClimateData()`、湖泊蒸发、湖泊出口续流、`Uint8Array/Uint16Array` 通量截断和 lake cleanup 顺序。
- 降水根因定位为 candidate `clamp(value, min, max)` 与 source `minmax(value, min, max)` 顺序相反；当 `humidity=0` 且最小降水为 `1` 时，candidate 会错误地产生山后保底降水，导致河流、人口、城市、路线和专题边界整体偏湿偏密。已改为 source `Math.min(Math.max(value, min), max)` 语义。
- `tools/source-export-baseline.mjs` 记录 source 随机化后的关键生成选项，便于确认 source/candidate 输入一致；`tools/webgl-generator-export-baseline.mjs` 也改为真实统计 candidate feature groups 与 lake 字段。
- `peninsula / 100000 / audit-peninsula-003` 已从河流 fail 收敛为 `pass（fail 0，warn 0）`，且 source/candidate 的 `grid.cells.prec` 数组完全一致。
- 完整 candidate 矩阵已跑完 63 个 case：总体 `warn`，`fail 0`，剩余 `warn 19`。当前 warn 集中在尚未完全 source-spec 的后段语义层数量差异，如城市、港口、路线、宗教和省份；地形、高度、温度、降水、pack 和河流主指标已无 fail。
- 最新网页快照仅作为本地预览产物保留，不纳入版本库。

阶段 16 已完成第一版社会与路线矩阵整改：

- 路线源代码复查确认 source 的 Urquhart 图不对 2 个点特判；candidate 已移除 2 港口水体的强制连边，避免小水体凭空多一条海路。
- 文化扩张恢复 source 语义：移除 candidate 自行加入的跨 biome 额外惩罚和非海洋文化过海额外惩罚，文化中心放置恢复 source 的固定基础间距、`biased()` 取整方式和 `cultureIds` 去重。
- 文化默认集不再固定使用 candidate 自定义数组，已按 `culturesSet` 覆盖 `world/european/english/antique` 主分支，并把 `culturesSet` 暴露到 options。
- 文化 expansionism 恢复 source 公式 `((random * sizeVariety) / 2 + 1) * base`，不再使用固定 `1..1.5` 缩放。
- 城镇和首都随机 score 改回 source 的 `Int16Array` 截断；本地 `gaussian()` 修正为 source `gauss(expected, deviation, min, max, digits)` 语义，不再把标准差除以 3。
- candidate baseline summary 现在记录随机化后的关键生成选项，便于后续追踪 source/candidate 选项漂移。
- 完整 candidate 矩阵已跑完 63 个 case：总体 `warn`，`fail 0`，`pass 61`，剩余 `warn 2`。
  - `mediterranean-10000-audit-mediterranean-003`：仅 `society.ports` warn；routes 已 pass。
  - `continents-100000-audit-continents-003`：仅 `society.cultures` warn；城市、港口、路线、宗教和省份主指标均 pass。
- 最新网页快照仅作为本地预览产物保留，不纳入版本库。

阶段 17 已完成矩阵全量收口：

- `settlements.js` 的城镇 spacing 衰减改回 source 行为：每轮扫描后固定 `spacing *= 0.5`。
- 本地 `gaussian()` 改为贴近 d3 `randomNormal.source(Math.random)` 的 polar Box-Muller 语义，初次调用使用 `y` 分量，不再使用普通 Box-Muller 变体。
- 首都放置改为 source 的“整轮失败后清空并降低 spacing 重试”语义，避免在低陆地占比群岛样本中逐步补点造成额外偏移。
- `society.js` 的文化补完从无上限全图填充收窄为有限补完，上限为 `cells.i.length * 0.9`，用于修复少数后段社会层缺口，同时避免低格数群岛过度生成港口和海路。
- `tools/baseline-diff.mjs` 对 `routes.roads` 增加低基数绝对容忍：相对阈值仍保留，但 source 主路极少时绝对差值 `<= 5` 不再触发 warn。
- `tools/source-export-baseline.mjs` 已记录 source 随机化后的 `culturesSet` 和 `culturesSetMax`，便于继续追踪文化集随机流。
- 完整 candidate 矩阵已跑完 63 个 case：总体 `pass`，`fail 0`，`warn 0`，`pass 63`。
- 当前矩阵报告：`docs/source-baselines/candidate-matrix.md`，生成时间 `2026-06-24T16:41:47.034Z`。

## 总目标

基于 `source/Fantasy-Map-Generator` 的功能、数据结构和视觉表现，复刻一个功能相似但使用 WebGL 实现的独立地图生成器。`source/` 只作为参考实现、行为对照和性能基线，不作为被修改或被接入的目标代码库。

## 当前阶段：source 优先复位，阶段 17 已完成

第 0 里程碑性能基线、第 1 阶段 WebGL 快照 demo、阶段 2 独立生成器工程骨架和最小生成内核已完成。由于正式应用生成质量被判定偏离 source，当前暂停原阶段 3 的新增 UI/语义功能，改按 `docs/source-first-detailed-task-plan.md` 逐层恢复。阶段 0 source/candidate 对照工具已可用，阶段 1 grid/boundary/Voronoi、阶段 2 高度模板 DSL、阶段 3 grid features/地图坐标/温度/降水、阶段 4 `reGraph()` pack 重建、阶段 5 pack features/haven/harbor、阶段 6 河流/湖泊水文、阶段 7 生物群系/人口评分、阶段 8 文化生成/扩张、阶段 9 城市/港口、阶段 10 国家、阶段 11 省份、阶段 12 路线/海路、阶段 13 宗教、阶段 14 温度边界、阶段 15 气候/水文矩阵整改、阶段 16 社会/路线矩阵整改和阶段 17 矩阵全量收口已完成第一版结构整改。当前完整 63 case candidate 矩阵为 `pass（fail 0，warn 0，pass 63）`，下一步可以进入 source 后段的命名、军事、区域、marker、zones 和统计字段补齐。

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
  - 城市和路线已接入第一版对象级 picking；点击 canvas 上的城市或路线会在现有悬停面板中记录选中对象摘要，暂不新增详情面板。
  - 选中城市已有 overlay 标记，选中路线已有更亮、更宽的 route mesh 高亮。
  - 道路样式已区分 `road` 实线和 `trail` 虚线，虚线由 WebGL route mesh 生成，并沿整条路线保持连续 dash phase。
  - 路线数据已有 `level`：`primary`、`secondary` 和 `trail`；renderer 按等级设置道路宽度、颜色和虚线样式，route 详情显示等级。
  - 城市、路线和河流对象 picking 已从直接遍历升级为第一版 world-space bucket 索引，运行时统计显示索引 bucket、路线段和河流段数量。
  - 已新增第一版浮动对象详情面板：点击选中城市、路线或河流时打开只读详情，面板可拖动和关闭，生成新地图时关闭；面板位置会保存到浏览器 `localStorage` 并在下次打开时恢复。
  - 选中河流已有独立 screen-space mesh 高亮；主河流线层仍保留为阶段性 `gl.LINES`。
  - 政治对象已接入 selection fallback：未命中城市、路线和河流时，会按当前专题或默认省份逻辑选中国家、省份或区域，并刷新对象详情面板。
  - 选中国家、省份或区域时会绘制半透明 cell mesh 高亮范围；当前不做边界追踪或编辑手柄。
  - 已新增第一版 marker 数据、点层绘制和对象 picking：当前包含山峰、河源和国家中心 marker，点击后进入对象详情面板。
  - 选中 marker 会复用 HTML selection marker 显示圆环反馈。
  - 可见城市标签已接入对象 picking：点击标签区域会选中 `label` 对象，并在详情面板显示文本和目标城市。
  - 对象详情面板已有最小编辑入口：点击“编辑”会在 runtime 记录当前编辑对象，并将面板状态从查看切换为编辑；点击“退出编辑”会清空编辑目标；暂不修改地图数据。
  - 已按用户反馈完成 source 生成算法重新审查，新增 `docs/source-generation-audit-and-rectification-plan.md`，明确高度、河流、路线、文化/国家边界和温度度量的偏差来源与整改顺序。
  - 已完成第一轮生成根因整改：正式 grid 生成 `grid.cells.c` 共享边邻接，高度末端不再使用全局百分位强制重排，feature、水文、路线和语义扩张优先走共享边邻接。
  - 河流已改为动态河源上限和更低 flux 阈值；100000 cells 抽查中大陆、群岛、地中海、高山岛屿等模板均能生成河流。
  - 路线已从贪心追踪改为 A* 成本寻路，陆路禁止穿水，山地和大坡度成本提高，找不到路径时不再追加终点直连。
  - 文化、宗教、国家、省份和区域已从最近中心染色改为邻接成本扩张，成本纳入高度、坡度、文化/宗教同源和河流阻隔。
  - 温度和降水专题新增画布图例；温度范围在运行时统计中显示摄氏度单位。

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

启动正式应用：

```powershell
Set-Location D:\work\fmg
pnpm start
```

或显式运行：

```powershell
pnpm run start:app
```

启动旧 WebGL cells 原型：

```powershell
Set-Location D:\work\fmg
pnpm run start:prototype
```

导出快照：

```powershell
Set-Location D:\work\fmg
node .\tools\fmg-export-snapshot.mjs --port 5300 --browser-channel chrome --cells 100000 --out .\prototype\webgl-cells\data\sample-map.json
```

启动原型：

```powershell
Set-Location D:\work\fmg
pnpm run start:prototype
```

访问：

```text
http://127.0.0.1:5400
```

启动正式应用：

```powershell
Set-Location D:\work\fmg
pnpm start
```

访问：

```text
http://127.0.0.1:5410
```

## 下一步

1. 进入 source 后段专题补齐：命名、军事、区域、marker、zones 和统计字段；当前这些仍是独立 WebGL 复刻中的简化占位。
2. 继续把 source/candidate 对照报告扩展到后段专题字段，避免后续功能只靠肉眼验收。
3. 保留当前 63 case 矩阵作为回归门槛；后续改动生成链时先跑 targeted case，再跑 full matrix。
4. 原阶段 3 的 UI、对象编辑、路线样式、点图层、浮动面板等工作继续暂停，等 source 后段数据链路进一步稳定后再恢复。
5. 后续 UI 面板仍需遵循 HTML 浮动可拖动方向，不使用 canvas 实现；该架构约束继续保留在 `docs/floating-panel-architecture.md`。

## 约束

- 新项目代码仍然放在根目录下，不放进 `source/`。
- `source/` 只读参考；允许为运行参考项目安装依赖并产生锁文件，例如 `pnpm-lock.yaml`，但不得修改原项目源码。
- 所有文档继续使用中文。
- 代码注释保持必要且克制。
- UI 面板长期目标是普通 DOM/HTML 浮动可拖动面板，不使用 canvas 绘制面板；当前对象详情已开始迁入浮动面板，现有固定配置面板仍是阶段性实现。架构约束见 `docs/floating-panel-architecture.md`。
