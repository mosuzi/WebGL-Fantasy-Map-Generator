# Source 优先复位执行计划

本文档记录 2026-06-18 的开发复位决策。用户指出当前正式应用在地中海模板下已经表现为“一团乱麻”：地形像噪声毯，水体像随机挖洞，道路和聚落缺乏地理因果，后续文化、宗教、国家、人口等专题也继承了这些错位。由此判断，当前不能继续在现有实现上局部调参，必须先回到 `source/Fantasy-Map-Generator`，按原版生成链路重新建立执行计划。

本计划只基于 `source/Fantasy-Map-Generator` 源码审查形成，不以当前正式应用代码为依据。落地实施前，当前代码保持冻结；实施时也必须按太子-尚书-门下-侍中四级流程逐步推进。

## 详细规程

本文档是复位总纲。后续执行以更细的施工图 `docs/source-first-detailed-task-plan.md` 为准。该详细规程补充了独立新智能体 source 复查后的缺口清单、完整生成顺序、字段契约、source baseline 导出 schema、模板/seed/cells 矩阵、各阶段任务包和可脚本判定的验收要求。

在 `docs/source-first-detailed-task-plan.md` 的阶段 0 完成前，不应继续修改正式应用生成器。

## 源码依据

本轮太子复审已读取或重点对照以下 source 文件：

- `public/main.js`：确认原版生成顺序。
- `src/utils/graphUtils.ts`：确认 `placePoints`、边界点、jittered grid、`calculateVoronoi`、`findGridCell` 等基础图结构。
- `src/modules/voronoi.ts`：确认邻接关系来自 Delaunator half-edge，而不是行列或固定方向近似。
- `src/modules/heightmap-generator.ts`：确认高度模板 DSL 和 `Hill`、`Pit`、`Range`、`Trough`、`Strait`、`Mask`、`Invert`、`Add`、`Multiply`、`Smooth` 的执行语义。
- `public/config/heightmap-templates.js`：确认大陆、群岛、地中海、高山岛屿、平原岛屿、半岛、盘古大陆等模板步骤。
- `src/modules/features.ts`：确认 grid/pack feature、海岸距离、`haven`、`harbor`、湖泊和岛屿分组。
- `src/modules/river-generator.ts`：确认河流基于 pack、降水 flux、填洼、湖泊出口、合流、下切和 meander。
- `src/modules/biomes.ts`：确认生物群系在河流后生成，并把河流 flux 纳入湿度。
- `src/modules/burgs-generator.ts`：确认城市从适居度选点，港口依赖 `haven`、`harbor` 和水域 feature。
- `src/modules/cultures-generator.ts`：确认文化中心来自 populated cells，并通过成本扩张。
- `src/modules/states-generator.ts`：确认国家从首都扩张，成本包含文化、人口、生物群系、高度、河流和海岸类型。
- `src/modules/routes-generator.ts`：确认路线先用 burg/port 的 Delaunay/Urquhart 候选连接，再在 pack 上用 `findPath` 成本寻路。
- `src/modules/religions-generator.ts`：确认宗教在路线后扩张，受文化、国家、路线、生物群系和水域成本影响。
- `src/modules/provinces-generator.ts`：确认省份在国家和城市之后生成，围绕州内 burg 扩张。
- `src/utils/pathUtils.ts`：确认 `findPath` 是 pack 邻接上的优先队列寻路。

## 关键结论

原版不是“先生成一张高度图，然后随意叠加专题”。它是一条强依赖链：

```text
grid
高度模板
grid features
温度和降水
reGraph pack
pack features
河流
生物群系
适居度
文化
城市
国家
路线
宗教
省份
```

当前视觉乱象应优先怀疑前三层：`grid`、高度模板和 `reGraph pack`。如果这三层不按 source 对齐，后面的河流、路线、人口、文化、国家、宗教、省份都会在错误地形上生成，看起来就会一起失真。

## 总体原则

- 暂停新增 UI、编辑器、面板、专题扩展和视觉调参。
- 暂停把当前正式应用的阶段性实现当作事实来源。
- 每一阶段先读 source，写小步计划，再实施一个可验收单元。
- 每一阶段都要有 source 对照快照和结构指标。
- 验收失败时退回当前阶段，不继续叠加下一层。
- 不修改 `source/` 原项目代码。
- 不用当前正式应用代码解释 source 行为；当前实现只在进入尚书实施阶段后作为待整改对象读取。

## 四级流程

### 太子

负责每一阶段开始前的 source 对照、阶段计划和验收标准。太子输出必须回答三个问题：

- 原版 source 怎么做。
- 当前阶段应该复刻哪些字段和不变量。
- 本阶段通过什么指标和快照验收。

### 尚书

只实现太子指定的一个阶段，不顺手做 UI、不扩展无关专题、不重构无关模块。若发现当前实现与 source 偏差超过本阶段范围，先回报太子修订计划。

### 门下

复核 diff 和验收命令：

- 是否误动 `source/`。
- 是否只改了本阶段相关文件。
- 是否保留中文文档记录。
- 是否通过语法、lint、结构指标或单元检查。

### 侍中

做浏览器和视觉验收：

- 对照 source 或 source 导出的基准快照。
- 检查目标模板和高 cells 档位。
- 保存网页快照给用户判断。
- 控制台不能有关键错误。

## 阶段计划

### 阶段 0：建立 source 对照基线

目标：先有可信对照，再改当前实现。

工作：

- 为常用模板导出 source 参考快照和结构摘要。
- 至少覆盖 `continents`、`mediterranean`、`archipelago`、`highIsland`、`lowIsland`。
- 摘要包括 grid cells、pack cells、feature 数、陆地比例、河流数量、城市数量、港口数量、路线数量、温度范围、降水范围。

验收：

- 可以稳定复现同一 seed/template/cells 的 source 摘要。
- 地中海模板有明确海盆、海岸、边缘山地和沿海聚落。
- 本阶段不修改当前正式应用代码。

### 阶段 1：复刻 grid 和 Voronoi 基础

目标：消除 45 度织物感和行列近似导致的方向性错误。

source 要点：

- `placePoints()` 根据目标 cells 计算 spacing。
- 点集来自 jittered square grid，加上规则边界点。
- `calculateVoronoi()` 使用 Delaunator。
- `cells.c`、`cells.v`、`vertices.c` 来自 half-edge 图关系。

实施要求：

- 邻接关系必须来自 Voronoi/Delaunator 结构。
- 不允许用行列邻接、固定 8 邻域、角度分桶或近似共享边替代 source 图。

验收：

- 实际 cells 与 source 同量级。
- 平均邻接度接近 6。
- 群岛和半岛不再出现织物状 45 度走向。
- 高 cells 档位仍可构建和渲染。

### 阶段 2：复刻高度模板 DSL

目标：停止凭视觉调参，恢复原版模板语义。

source 要点：

- 高度图来自 `HeightmapGenerator.fromTemplate()` 顺序执行模板步骤。
- `Hill`、`Pit`、`Range`、`Trough` 都在 `grid.cells.c` 上传播。
- 不做额外的全局百分位重排或自创大陆形状后处理。
- `blobPower`、`linePower` 随目标 cells 变化。

实施要求：

- 先逐项复刻模板操作，再接入模板文件。
- 保留 source 的随机调用顺序和 clamp 语义。
- 支持所有 source 默认模板，至少先验收五个核心模板。

验收：

- `mediterranean` 应表现为海盆和边缘地形，不是随机湖洞。
- `highIsland` 应有高山岛屿结构，`lowIsland` 应有低缓岛屿结构。
- 山脉应有方向性和过渡，不出现大量圆环或气团状高地。

### 阶段 3：复刻 grid features、温度和降水

目标：让气候和海岸语义建立在正确地形上。

source 要点：

- `Features.markupGrid()` 计算 feature id 和到海岸距离 `t`。
- 温度由纬度、地图坐标和海拔降温共同决定。
- 降水由风带、边界湿度、水域补湿和地形抬升共同决定。

实施要求：

- 温度、降水必须先在 grid 层生成。
- 专题颜色只是表现，内部必须保留真实数值。

验收：

- 温度专题有摄氏度范围。
- 降水不呈随机噪声，也不呈大块机械直线。
- 海岸距离和 feature id 可被后续 pack、城市、港口复用。

### 阶段 4：复刻 `reGraph()` 生成 pack

目标：恢复 source 的语义图层，而不是让 grid 一比一承担所有业务。

source 要点：

- `reGraph()` 从 grid 选择新 pack points。
- 深海大多被排除，浅海和海岸保留。
- 海岸附近会补 midpoint，使 coastline 和语义边界更细。
- pack 再次运行 Voronoi。

实施要求：

- pack 必须重新建图。
- pack cell 需要保存对应 grid cell。
- 河流、城市、国家、路线等后续语义都以 pack 为主。

验收：

- pack cells 明显少于 grid cells。
- 海岸区域语义分辨率更高。
- 不能再把 `one-grid-cell-to-one-pack-cell` 当正式方案。

### 阶段 5：复刻 pack features、haven 和 harbor

目标：恢复港口、湖泊、岛屿、大陆分组的基础。

source 要点：

- `Features.markupPack()` 生成 `cells.t`、`cells.f`、`cells.haven`、`cells.harbor`。
- `defineGroups()` 区分 ocean、lake、island、isle 等 feature group。
- 湖泊高度和出口数据会影响河流。

实施要求：

- 港口和城市生成前必须有 `haven` 和 `harbor`。
- 水域 feature 需要区分海、湖、近岸和深水。

验收：

- 地中海模板下沿海存在合理港口候选。
- 聚落不应系统性偏离海岸和河口。

### 阶段 6：复刻河流和湖泊水文

目标：解决河流稀少、打结、入海异常和水文不自然。

source 要点：

- 河流在 pack 上运行。
- 降水进入 flux。
- 先处理洼地和湖泊出口，再按高度排水。
- 有合流、parent river、河口、下切、meander 和宽河道 path。

实施要求：

- 河流不能直接按视觉随机画线。
- 河流路径必须来自 pack 邻接和坡降。
- 河口应在陆水交界处结束。

验收：

- 河流数量与 source 同量级。
- 没有海中打结或绕圈河流。
- 河网沿山地和平原过渡自然，主要河流有汇流结构。

### 阶段 7：复刻生物群系和适居度

目标：让人口、文化和城镇有正确地理基础。

source 要点：

- `Biomes.define()` 在河流之后执行。
- 生物群系使用温度和湿度，湿度受河流 flux 影响。
- `rankCells()` 使用生物群系宜居度、河流、合流、河口、海岸、港湾、淡水湖和海拔。

实施要求：

- 适居度必须是后续文化、城市、国家的入口。
- 不能用简单高度或随机值替代 `cells.s`。

验收：

- 高适居区集中在河谷、河口、海岸、平原和适宜气候区。
- 山地、寒冷、沙漠、深内陆不应普遍高人口。

### 阶段 8：复刻文化和城市

目标：恢复聚落分布和文化边界的自然性。

source 要点：

- 文化中心从 populated cells 中选。
- 文化通过成本场扩张，成本受生物群系、高度、河流、海岸类型和文化类型影响。
- 城市和首都从 `cells.s` 选点，用 spacing/quadtree 控制间距。
- `Burgs.shift()` 会把港口推向水边，把河流城镇略作偏移。

实施要求：

- 城市不能脱离 `cells.s`。
- 港口必须依赖 `haven`、`harbor` 和水域 feature。

验收：

- 地中海模板应有明显沿海港口和河谷聚落。
- 城市不应大面积跑到半山腰。
- 文化边界可以复杂，但不能是机械直线或随机噪声。

### 阶段 9：复刻国家和省份

目标：让政治边界服从人口、文化和地形成本。

source 要点：

- 国家从 capital burgs 生成。
- `expandStates()` 用 FlatQueue 成本扩张。
- 成本包含文化、人口、生物群系、高度、河流、海岸类型。
- 省份在国家和城市之后，从州内 burg 扩张。

实施要求：

- 国家中心必须来自城市和首都。
- 省份必须限制在国家内。
- 政治边界不得用最近中心或简单几何切分作为正式方案。

验收：

- 国界跟随山脉、河流、海岸和人口空白区的趋势。
- 省份围绕重要城市组织，不出现大面积机械网格。

### 阶段 10：复刻路线

目标：解决海中陆地直线、过直路线和山区过密。

source 要点：

- 路线在国家、城市、港口之后生成。
- 主路连接各 feature 内首都。
- 小路连接同 feature 内 burg。
- 海路连接港口。
- 候选连接来自 burg/port 点的 Delaunay/Urquhart 图。
- 实际路径通过 `findPath()` 在 pack 上按成本寻路。

实施要求：

- 陆路和海路成本函数分离。
- 找不到路径时不能画终点直连。
- 山地、不可居住地、生物群系、已有连接、城市都要影响成本。

验收：

- 陆路不穿深水。
- 海路只连接港口并走水域。
- 山区路线稀疏，平原和城市间路线更密。
- 路线有自然弯折，不是几何直线网。

### 阶段 11：复刻宗教、区域和后续专题

目标：在地形、水文、人口、文化、政治、路线可信后，再推进其他专题。

source 要点：

- 宗教在路线后生成。
- 民间宗教与文化相关。
- 有组织宗教、教派和异端通过成本扩张。
- 扩张成本会受路线、生物群系、水域、文化和国家限制影响。

实施要求：

- 宗教、区域、人口专题不能早于底层语义稳定。
- 专题边界必须继承 pack 邻接和成本场，不得几何染色。

验收：

- 宗教和区域边界与文化、国家、路线和地形有可解释关系。
- 不再出现大面积平直专题分界线。

## 验收矩阵

每一阶段至少保留以下验收输出：

| 类型 | 要求 |
|---|---|
| source 摘要 | 同 seed/template/cells 下的 source 指标 |
| 当前摘要 | 当前实现同配置指标 |
| 快照 | 至少一张全图网页快照 |
| 高 cells | 至少验证 100000 cells |
| 多模板 | 至少验证大陆、地中海、群岛 |
| 错误检查 | 控制台无关键错误，WebGL 无关键错误 |
| 文档 | 更新当前计划和开发日志 |

## 当前下一步

下一步应从阶段 0 开始，而不是继续修路线、国家、配色或面板：

1. 太子补齐 source 对照基线的具体导出方案。
2. 尚书只实现 source 基线导出和摘要，不改正式应用。
3. 门下确认未修改 `source/` 和正式应用代码。
4. 侍中生成 source 参考快照，交给用户确认参考样貌。

只有 source 基线可复现后，才进入阶段 1 的 grid/Voronoi 整改。
