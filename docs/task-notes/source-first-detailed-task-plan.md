# Source 优先详细任务规程

> 状态校准：这是 source 优先复位阶段的历史施工图，不是当前任务队列。阶段记录和验收口径仍供追溯，但任何“下一步”都必须先进入 [`../current-plan.md`](../current-plan.md#权威任务清单) 才能执行。

本文档是 `docs/task-notes/source-first-recovery-execution-plan.md` 的细化施工图。旧文档负责说明为什么复位和大阶段顺序；本文档负责让后续太子、尚书、门下、侍中可以直接按阶段开工、复核和验收。

本规程基于两轮 source-only 审查形成：

- 主线程太子审查：只读 `source/Fantasy-Map-Generator` 与现有计划文档，不读取当前正式应用实现。
- 独立新智能体复查：只读 source 和计划文档，不修改文件，不读取 `app/webgl-generator` 或 `prototype` 实现代码。

结论：原计划方向正确，但还缺少 source 导出 schema、字段级不变量、模板/seed/cells 验收矩阵、可脚本判定的检查项，以及若干原版真实生成顺序里的中间步骤。本规程补齐这些缺口。

## 一、现有复位计划缺口清单

### 1. 真实生成顺序不完整

旧计划写出了主链路，但没有完整列出 source 中间步骤。后续实现必须按以下顺序理解依赖关系：

```text
setSeed
applyGraphSize
randomizeOptions
generateGrid 或复用 grid
HeightmapGenerator.generate
pack = {}
Features.markupGrid
addLakesInDeepDepressions
openNearSeaLakes
OceanLayers
defineMapSize
calculateMapCoordinates
calculateTemperatures
generatePrecipitation
reGraph
Features.markupPack
createDefaultRuler
Rivers.generate
Biomes.define
Features.defineGroups
Ice.generate
rankCells
Cultures.generate
Cultures.expand
Burgs.generate
States.generate
Routes.generate
Religions.generate
Burgs.specify
States.collectStatistics
States.defineStateForms
Provinces.generate
Provinces.getPoles
Rivers.specify
Lakes.defineNames
Military.generate
Markers.generate
Zones.generate
drawScaleBar
Names.getMapName
showStatistics
```

当前复刻可以分期实现后段能力，但文档和数据契约必须承认这些步骤的顺序。尤其是湖泊预处理、`Features.defineGroups()`、`Burgs.specify()`、国家统计/形制、`Rivers.specify()`、`Lakes.defineNames()`、`Markers.generate()` 和 `Zones.generate()`，不能在后续被误以为是纯显示层。

### 2. 阶段 0 缺少导出 schema

旧计划只说“导出 source 参考快照和结构摘要”，不足以指导工具开发。阶段 0 必须先定义 source 对照 JSON 的字段、统计、截图路径和生成 trace。

### 3. 字段不变量不足

后续所有阶段都要按字段契约工作，不能只看截图。至少要明确：

- `grid.cells.h/t/f/temp/prec/c/v/b/i`
- `grid.points/boundary/cellsX/cellsY/spacing/cellsDesired`
- `pack.cells.p/g/h/area/t/f/haven/harbor/fl/r/conf/biome/s/pop/culture/burg/state/religion/province/routes/c/v/b/i`
- `pack.features`
- `pack.rivers`
- `pack.burgs`
- `pack.states`
- `pack.routes`
- `pack.cultures`
- `pack.religions`
- `pack.provinces`
- 后续 `pack.markers/zones/military`

### 4. `reGraph()` 需要单独验收

`pack` 是 source 的语义图，不是 grid 一比一复制。旧计划只写“pack cells 少于 grid cells”不够。必须验收深海排除、非岸湖点抽掉、海岸补点、重新 Voronoi、`pack.cells.g` 映射和 `pack.cells.area`。

### 5. 高度模板缺少全表和 step trace

source 模板包括：

```text
volcano
highIsland
lowIsland
continents
archipelago
atoll
mediterranean
peninsula
pangea
isthmus
shattered
taklamakan
oldWorld
fractious
```

阶段 2 需要记录每个模板解析出的 step 序列、step 参数、`blobPower`、`linePower` 和高度分布。

### 6. 湖泊和水文缺少字段

湖泊不是普通水面。阶段 5 和阶段 6 必须处理或记录：

- `feature.height`
- `feature.shoreline`
- `feature.flux`
- `feature.temp`
- `feature.evaporation`
- `feature.outCell`
- `feature.outlet`
- `feature.inlets`
- `feature.closed`

并且明确 `Lakes.defineClimateData()`、`Lakes.cleanupLakeData()`、`Lakes.defineNames()` 的阶段位置。

### 7. 人口评分需要公式级验收

`pack.cells.s` 不能只写成“适居度”。它来自：

- `biomesData.habitability[cells.biome[i]]`
- 河流 `cells.fl[i]`
- 合流 `cells.conf[i]`
- 海拔惩罚
- 河口奖励
- 海岸奖励
- 安全港 `cells.harbor[i] === 1`
- 湖泊 group 奖惩
- 面积归一化生成 `cells.pop`

### 8. 社会和政治产物字段不够

文化、城市、国家、路线、宗教、省份要验收具体产物字段，不只验收“看起来自然”。

### 9. 验收不够脚本化

每阶段都必须输出：

- `source-summary.json`
- `candidate-summary.json`
- `diff.json`
- 至少一张截图
- 字段完整性检查结果
- 阈值判定结果

### 10. 矩阵缺失

不能只验收 10k，也不能只验收单模板。至少要覆盖：

- cells：`10000`、`50000`、`100000`
- 模板：`continents`、`mediterranean`、`archipelago`、`highIsland`、`lowIsland`、`peninsula`、`pangea`
- 每模板 3 个固定 seed
- 地中海 100000 cells 为首要强制回归样例

## 二、权威 source 生成链路

### 2.1 入口顺序

以 `source/Fantasy-Map-Generator/public/main.js` 的 `generate()` 为准。任何实现计划如果改变顺序，必须写明原因和风险。

| 顺序 | 步骤 | 主要输出 | 后续依赖 |
|---:|---|---|---|
| 1 | `setSeed()` | 全局 seed、`Math.random = aleaPRNG(seed)` | 所有随机过程 |
| 2 | `applyGraphSize()` | 图尺寸 | grid |
| 3 | `randomizeOptions()` | 气候、文化、数量等选项 | 气候和专题 |
| 4 | `generateGrid()` | `grid.points/cells/vertices` | 高度、feature |
| 5 | `HeightmapGenerator.generate()` | `grid.cells.h` | 海陆、气候 |
| 6 | `Features.markupGrid()` | `grid.cells.t/f`、`grid.features` | 湖泊、气候、reGraph |
| 7 | `addLakesInDeepDepressions()` | 深洼地湖泊 | 湖泊和水文 |
| 8 | `openNearSeaLakes()` | 近海湖打开 | 海岸和水文 |
| 9 | `defineMapSize()` | 地图尺寸、纬度、经度配置 | 经纬度 |
| 10 | `calculateMapCoordinates()` | `mapCoordinates` | 温度、降水 |
| 11 | `calculateTemperatures()` | `grid.cells.temp` | 降水、生物群系、海路 |
| 12 | `generatePrecipitation()` | `grid.cells.prec` | 河流、生物群系 |
| 13 | `reGraph()` | `pack.cells/vertices` | 所有语义 |
| 14 | `Features.markupPack()` | `pack.cells.t/f/haven/harbor`、`pack.features` | 河流、城市、国家 |
| 15 | `Rivers.generate()` | `pack.cells.fl/r/conf`、`pack.rivers` | 生物群系、人口、路线 |
| 16 | `Biomes.define()` | `pack.cells.biome` | 人口、文化、路线 |
| 17 | `Features.defineGroups()` | feature group | 人口、命名、显示 |
| 18 | `Ice.generate()` | 冰山/冰层 | 可后续 |
| 19 | `rankCells()` | `pack.cells.s/pop` | 文化、城市、国家 |
| 20 | `Cultures.generate()` | `pack.cultures`、文化中心 | 文化扩张 |
| 21 | `Cultures.expand()` | `pack.cells.culture` | 城市、国家、宗教 |
| 22 | `Burgs.generate()` | `pack.burgs`、`pack.cells.burg` | 国家、路线 |
| 23 | `States.generate()` | `pack.states`、`pack.cells.state` | 路线、宗教、省份 |
| 24 | `Routes.generate()` | `pack.routes`、`pack.cells.routes` | 宗教、城市人口、zones |
| 25 | `Religions.generate()` | `pack.religions`、`pack.cells.religion` | 省份、zones |
| 26 | `Burgs.specify()` | 城市人口、类型、徽章、分组 | 统计、显示 |
| 27 | `States.collectStatistics()` | 国家面积、人口、城市数 | 国家表、形制 |
| 28 | `States.defineStateForms()` | 国家 form/fullName | 显示、命名 |
| 29 | `Provinces.generate()` | `pack.provinces`、`pack.cells.province` | 省份专题 |
| 30 | `Provinces.getPoles()` | 省份 pole | 标签 |
| 31 | `Rivers.specify()` | 河流 parent/basin/name/type | 显示 |
| 32 | `Lakes.defineNames()` | 湖泊名称 | 显示 |
| 33 | `Military.generate()` | 军队数据 | 可后续 |
| 34 | `Markers.generate()` | marker 数据 | 标记专题 |
| 35 | `Zones.generate()` | 区域/灾害/事件 | 后续专题 |

### 2.2 禁止颠倒的关键依赖

- `reGraph()` 必须在温度和降水之后，因为 `pack.cells.g` 要引用已有 grid 字段。
- `Rivers.generate()` 必须在 `Features.markupPack()` 之后，因为河流依赖 `haven`、feature、湖泊高度和 shoreline。
- `Biomes.define()` 必须在河流之后，因为河流 flux 会进入湿度。
- `rankCells()` 必须在生物群系和河流之后。
- `Cultures.expand()` 必须在 `Cultures.generate()` 之后，并且只给 populated cells 赋文化。
- `Burgs.generate()` 必须在文化和适居度之后。
- `States.generate()` 必须在 burgs 之后，因为国家来自 capital burgs。
- `Routes.generate()` 必须在 states 和 burgs 之后，因为主路、小路和海路都以 burg/port 为节点。
- `Religions.generate()` 必须在 routes 之后，因为路线会影响传播成本。
- `Provinces.generate()` 必须在 states、burgs、religions 之后。

## 三、数据契约

### 3.1 `grid` 契约

| 字段 | 来源 | 说明 | 不变量 |
|---|---|---|---|
| `grid.spacing` | `placePoints()` | 目标点间距 | `sqrt(width*height/cellsDesired)` 四舍五入 |
| `grid.cellsDesired` | UI/options | 目标 cell 数 | 用于 power map 和统计 |
| `grid.points` | jittered grid | grid 点坐标 | 长度等于 grid cell 数 |
| `grid.boundary` | boundary points | Voronoi 裁边点 | 不参与真实 cell |
| `grid.cellsX/Y` | spacing | 行列查找辅助 | 温度、降水按行扫描依赖 |
| `grid.cells.i` | `calculateVoronoi()` | cell index | `0..points.length-1` |
| `grid.cells.c` | Delaunator half-edge | 邻接 cell | 平均度约 6，不得用固定行列邻接 |
| `grid.cells.v` | Voronoi | cell 顶点索引 | 每个 cell 至少 3 个顶点 |
| `grid.cells.b` | Voronoi | border cell 标记 | 只标近边界 cell |
| `grid.vertices.p` | Voronoi | 顶点坐标 | 坐标可在边界外延附近 |
| `grid.vertices.c` | Voronoi | 顶点相邻 cell | feature 边界追踪依赖 |
| `grid.cells.h` | 高度模板 | 高度 0-100 | `<20` 为水 |
| `grid.cells.t` | `markupGrid()` | 距海岸/水岸类型 | 陆岸为 `1`，深水为负 |
| `grid.cells.f` | `markupGrid()` | feature id | 指向 `grid.features` |
| `grid.cells.temp` | 温度 | 摄氏度整数 | `Int8Array` |
| `grid.cells.prec` | 降水 | 0-255 | `Uint8Array` |

### 3.2 `pack` 契约

| 字段 | 来源 | 说明 | 不变量 |
|---|---|---|---|
| `pack.cells.p` | `reGraph()` | pack cell 点 | 长度等于 pack cell 数 |
| `pack.cells.g` | `reGraph()` | 对应 grid cell | 每个值必须是合法 grid index |
| `pack.cells.h` | `reGraph()` | pack 高度 | 初始来自 `grid.cells.h[g]` |
| `pack.cells.area` | polygon area | cell 面积 | 正数，截断到 `UINT16_MAX` |
| `pack.cells.c/v/b/i` | pack Voronoi | 邻接、顶点、边界、索引 | 来自 Delaunator，不得伪造 |
| `pack.cells.t` | `markupPack()` | pack 海岸距离 | 城市、国家、路线依赖 |
| `pack.cells.f` | `markupPack()` | pack feature id | 指向 `pack.features` |
| `pack.cells.haven` | `markupPack()` | 最近邻水 cell | 只对陆地海岸有效 |
| `pack.cells.harbor` | `markupPack()` | 邻接水 cell 数 | 等于邻接水 cell 数 |
| `pack.cells.fl` | `Rivers.generate()` | water flux | 河流和人口依赖 |
| `pack.cells.r` | `Rivers.generate()` | river id | 0 表示无河 |
| `pack.cells.conf` | `Rivers.generate()` | confluence flux | 人口评分依赖 |
| `pack.cells.biome` | `Biomes.define()` | biome id | 生物群系矩阵输出 |
| `pack.cells.s` | `rankCells()` | suitability | 城市/文化源 |
| `pack.cells.pop` | `rankCells()` | rural pop | 水域必须为 0 |
| `pack.cells.culture` | `Cultures.expand()` | culture id | 只给 populated cells 赋值 |
| `pack.cells.burg` | `Burgs.generate()` | burg id | 指向 `pack.burgs` |
| `pack.cells.state` | `States.generate()` | state id | 陆地 cell 才分配 |
| `pack.cells.routes` | `Routes.generate()` | 双向 route link | 双向一致 |
| `pack.cells.religion` | `Religions.generate()` | religion id | 依赖文化/国家/路线 |
| `pack.cells.province` | `Provinces.generate()` | province id | 不越过所属 state |

### 3.3 feature 契约

`grid.features` 和 `pack.features` 都使用 `i/type/land/border` 基础字段。`pack.features` 还需要：

- `cells`
- `firstCell`
- `vertices`
- `area`
- `shoreline`
- `height`
- `group`
- 湖泊扩展字段：`flux/temp/evaporation/outCell/outlet/inlets/river/enteringFlux/closed/name`

feature group 至少应覆盖或允许：

```text
ocean
sea
gulf
continent
island
isle
lake_island
freshwater
salt
frozen
dry
sinkhole
lava
```

### 3.4 语义对象契约

| 对象 | 必备字段 | 生成阶段 |
|---|---|---|
| culture | `i/name/base/center/type/expansionism/origins/code/color/shield` | 文化 |
| burg | `i/cell/x/y/name/culture/feature/capital/port/state/population/type/group` | 城市 |
| state | `i/name/capital/center/culture/type/expansionism/color/neighbors/pole/area/rural/urban/form/fullName/diplomacy/campaigns` | 国家 |
| route | `i/group/feature/points` | 路线 |
| religion | `i/name/type/form/culture/center/origins/expansion` | 宗教 |
| province | `i/state/center/burg/name/formName/fullName/color/pole` | 省份 |
| river | `i/source/mouth/parent/basin/length/discharge/width/widthFactor/sourceWidth/name/type/cells/points` | 河流 |
| marker | `i/type/icon/cell/x/y/name` | 标记 |
| zone | `i/type/cells/name` | 区域/事件 |
| regiment | `i/state/a/x/y/u/n/name/icon` | 军事 |

## 四、阶段 0：source 对照基线和工具规格

### 4.1 目标

先建立可复现的 source 参考，不改正式应用。后续所有阶段的“像 source”都必须落实为字段、统计和截图对照。

### 4.2 建议工具

后续尚书可新增工具，建议命名：

- `tools/source-export-baseline.mjs`
- `tools/source-compare-baseline.mjs`
- `tools/source-baseline-matrix.mjs`

也可以扩展已有 source 快照导出工具，但必须保留“source 对照基线”这个独立用途。

当前阶段 0 已开始落地第一版单 case 工具：

```powershell
node .\tools\source-export-baseline.mjs --port 5301 --browser-channel chrome --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001
```

第一版工具负责导出 `source-summary.json`、`source-trace.json` 和 `validation.md`。如需导出本地视觉预览，可追加 `--screenshot true` 生成 `source-map.png`；图片默认不纳入版本库。若需导出完整字段快照，可追加 `--snapshot true` 生成 `source-snapshot.json`。

阶段 0.2 已开始落地矩阵批量工具：

```powershell
node .\tools\source-baseline-matrix.mjs --mode quick --port 5301 --browser-channel chrome
```

`quick` 模式覆盖 `mediterranean`、`continents`、`archipelago` 的 100000 cells 强回归样例；`full` 模式覆盖 7 个模板、3 档 cells、每模板 3 个 seed。工具会生成 `docs/generated/source-baselines/matrix.json` 和 `docs/generated/source-baselines/matrix.md`。

阶段 0.3 已落地 candidate 与 diff 工具：

```powershell
node .\tools\webgl-generator-export-baseline.mjs --template mediterranean --cells 100000 --seed audit-mediterranean-001 --out-dir .\docs\source-baselines\mediterranean-100000-audit-mediterranean-001 --browser-channel chrome
node .\tools\baseline-diff.mjs --case mediterranean-100000-audit-mediterranean-001
```

`webgl-generator-export-baseline.mjs` 会生成 `candidate-summary.json` 和 `candidate-validation.md`。如需本地视觉预览，可追加 `--screenshot true` 生成 `candidate-map.png`；图片默认不纳入版本库。`baseline-diff.mjs` 会生成 `diff.json` 和 `diff.md`，用于每阶段门下复核和侍中验收。

### 4.3 输出目录建议

```text
docs/generated/source-baselines/
  matrix.json
  matrix.md
  <template>-<cells>-<seed>/
    source-summary.json
    source-snapshot.json
    source-height.png
    source-biomes.png
    source-political.png
    source-routes.png
    source-trace.json
```

### 4.4 `source-summary.json` schema

必须包含：

```json
{
  "metadata": {
    "seed": "audit-mediterranean-001",
    "template": "mediterranean",
    "cellsTarget": 100000,
    "width": 1440,
    "height": 960,
    "generatedAt": "ISO 时间",
    "sourceCommit": "可用则记录"
  },
  "trace": [
    "setSeed",
    "generateGrid",
    "HeightmapGenerator.generate"
  ],
  "grid": {
    "cells": 99846,
    "spacing": 3.72,
    "cellsX": 387,
    "cellsY": 258,
    "avgDegree": 5.97,
    "borderCells": 1000,
    "height": {},
    "tDistribution": {},
    "featureCount": 0,
    "temperature": {},
    "precipitation": {}
  },
  "pack": {
    "cells": 0,
    "packGridRatio": 0,
    "avgDegree": 0,
    "area": {},
    "tDistribution": {},
    "featureCount": 0,
    "havenCells": 0,
    "harborDistribution": {}
  },
  "features": {
    "land": 0,
    "water": 0,
    "ocean": 0,
    "lake": 0,
    "groups": {}
  },
  "rivers": {
    "count": 0,
    "cellsWithRiver": 0,
    "flux": {},
    "confluences": 0,
    "mouths": 0,
    "width": {}
  },
  "biomes": {
    "distribution": {}
  },
  "population": {
    "positiveSuitabilityCells": 0,
    "positivePopulationCells": 0,
    "suitability": {},
    "population": {}
  },
  "society": {
    "cultures": 0,
    "burgs": 0,
    "capitals": 0,
    "ports": 0,
    "states": 0,
    "religions": 0,
    "provinces": 0
  },
  "routes": {
    "roads": 0,
    "trails": 0,
    "searoutes": 0,
    "landRouteWaterCells": 0,
    "seaRouteLandCells": 0
  }
}
```

分位数字段统一使用：

```json
{"min":0,"p05":0,"p25":0,"p50":0,"p75":0,"p90":0,"p95":0,"p99":0,"max":0,"mean":0}
```

### 4.5 验收矩阵

强制矩阵：

| 模板 | cells | seeds |
|---|---:|---|
| `mediterranean` | 10000 / 50000 / 100000 | `audit-mediterranean-001/002/003` |
| `continents` | 10000 / 50000 / 100000 | `audit-continents-001/002/003` |
| `archipelago` | 10000 / 50000 / 100000 | `audit-archipelago-001/002/003` |
| `highIsland` | 10000 / 50000 / 100000 | `audit-highIsland-001/002/003` |
| `lowIsland` | 10000 / 50000 / 100000 | `audit-lowIsland-001/002/003` |
| `peninsula` | 10000 / 50000 / 100000 | `audit-peninsula-001/002/003` |
| `pangea` | 10000 / 50000 / 100000 | `audit-pangea-001/002/003` |

快速回归矩阵：

- `mediterranean`，100000，`audit-mediterranean-001`
- `continents`，100000，`audit-continents-001`
- `archipelago`，100000，`audit-archipelago-001`

### 4.6 阶段 0 验收

门下：

- 工具只读取和运行 source，不修改 `source/` 源码。
- 同一 seed/template/cells 连跑两次，`source-summary.json` 除时间字段外一致。
- `source-trace.json` 包含完整生成步骤。

侍中：

- 每个快速回归样例至少输出高度、专题和路线截图。
- 地中海截图必须能看到中部海盆、上下边缘地形、沿海聚落和海路/陆路差异。

## 2026-06-26 source 更新校正

`source/Fantasy-Map-Generator` 已更新到 `5de7deb4`。本详细计划继续保留阶段 1-18 的已执行结论，但后续新阶段必须按最新 source 结构读取：

- 生成器：`src/generators/*`。
- 控制器和编辑器：`src/controllers/*`。
- 渲染器：`src/renderers/*`。
- 服务和全局支持：`src/services/*`、`src/utils/*`、`src/types/*`。
- 官方领域文档：`docs/domain/generation_pipeline.md`、`goods_schema.md`、`production_schema.md`、`trade_schema.md`、`taxes.md`。

最新 canonical pipeline 相比本计划初版新增或前移了经济链路：

```text
Goods.generate
rankCells / Cultures
Burgs / States / Routes / Religions
Burgs.specify / States.collectStatistics / States.defineStateForms
Provinces / river-lake naming
Markets.generate / Production.produce / States.collectTaxes
Military.generate / Markers.generate / Zones.generate
```

因此，当前阶段 18 的 `pass` 只代表旧 baseline schema 下的命名、军事、marker、zones 第一刀收口。source/candidate 摘要 schema 已把 goods、markets、production、deals 和 taxes 纳入对照，并确认 candidate 经济链路为空。这个缺口顺延为后续经济阶段，但经济和军事系统都不作为近期优先级；下一步先在 demo 中尝试编辑器原型。

## 五、阶段任务包

每个阶段都遵循同一交付格式：

- `source` 要点：必须先读哪些 source。
- 输入字段：来自前置阶段的字段。
- 输出字段：本阶段新增或更新的字段。
- 尚书任务：可以直接实现的小步骤。
- 门下检查：脚本、字段和 diff 检查。
- 侍中验收：截图或浏览器行为。
- 禁止事项：本阶段不得做什么。

### 阶段 1：grid、boundary、Voronoi

source：

- `src/utils/graphUtils.ts`
- `src/generators/voronoi.ts`

输入字段：

- `seed`
- `graphWidth`
- `graphHeight`
- `cellsDesired`

输出字段：

- `grid.spacing`
- `grid.boundary`
- `grid.points`
- `grid.cellsX`
- `grid.cellsY`
- `grid.cells.i/c/v/b`
- `grid.vertices.p/v/c`

尚书任务：

1. 复刻 `getBoundaryPoints()`。
2. 复刻 `getJitteredGrid()`，使用 seed 驱动的 `Math.random` 等价 PRNG。
3. 复刻 `placePoints()` 的 spacing 和 cellsX/Y 计算。
4. 接入 Delaunator，按 source half-edge 生成 `cells.c/v/b` 和 `vertices`。
5. 提供 grid 结构 summary。

门下检查：

- `cells.i.length === points.length`。
- 每个 `cells.v[i].length >= 3`。
- 每个邻接 id 合法。
- 平均邻接度接近 source baseline。
- 禁止出现行列邻接 fallback 标记。

侍中验收：

- 群岛和半岛快照无织物状 45 度方向性。
- 100000 cells 下可构建且无 WebGL/控制台关键错误。

禁止事项：

- 不实现高度、河流、城市。
- 不为“好看”修改点集分布。

### 阶段 2：高度模板 DSL

source：

- `src/generators/heightmap-generator.ts`
- `public/config/heightmap-templates.js`

输入字段：

- 阶段 1 的完整 `grid`

输出字段：

- `grid.cells.h`
- height step trace

尚书任务：

1. 建立模板 parser，解析 tool/count/height/rangeX/rangeY。
2. 复刻 `getBlobPower()` 和 `getLinePower()`。
3. 逐项复刻 `Hill`、`Pit`、`Range`、`Trough`。
4. 复刻 `Strait`。
5. 复刻 `Add`、`Multiply`、`Smooth`、`Mask`、`Invert`。
6. 接入 14 个 source 模板。
7. 输出每个模板 step 序列、随机种子、陆地比例和高度分位数。

门下检查：

- 高度全在 0-100。
- `blobPower/linePower` 与 cells 档位一致。
- 模板 step 名称和数量与 source 一致。
- 不存在全局百分位强行重排。

侍中验收：

- `mediterranean` 是海盆与上下边缘地形，不是随机洞湖。
- 山脉有方向和坡脚过渡，无大量圆环气团。
- `highIsland/lowIsland` 可区分。

禁止事项：

- 不加入自创侵蚀、板块、噪声后处理。
- 不为单张截图调模板参数。

### 阶段 3：grid features、湖泊预处理、地图坐标、温度、降水

source：

- `src/generators/features.ts`
- `public/main.js` 中 `addLakesInDeepDepressions()`、`openNearSeaLakes()`、`defineMapSize()`、`calculateMapCoordinates()`、`calculateTemperatures()`、`generatePrecipitation()`

输入字段：

- `grid.cells.h`
- `grid.cells.c/b/i`
- `grid.points`

输出字段：

- `grid.cells.t`
- `grid.cells.f`
- `grid.features`
- `mapCoordinates`
- `grid.cells.temp`
- `grid.cells.prec`

尚书任务：

1. 复刻 `Features.markupGrid()` feature flood fill。
2. 复刻 distance field，保留陆岸、水岸、深水语义。
3. 复刻深洼地湖泊添加。
4. 复刻近海湖打开。
5. 复刻地图尺寸和经纬度计算。
6. 复刻海拔降温和纬度温度。
7. 复刻风带降水、海面补湿、迎风坡降水。

门下检查：

- `grid.cells.t/f/temp/prec` 长度等于 grid cells。
- feature id 全部合法。
- `t` 分布包含陆岸和水岸。
- 温度范围有摄氏度数值。
- 降水为 0-255。

侍中验收：

- 温度专题有明确纬度和高山降温趋势。
- 降水专题能看到风带与地形影响，不是纯噪声。

禁止事项：

- 不在 pack 前生成河流。
- 不把温度和降水只做成颜色。

### 阶段 4：`reGraph()` pack 重建

source：

- `public/main.js` 中 `reGraph()`
- `src/utils/graphUtils.ts`

输入字段：

- 完整 grid

输出字段：

- `pack.cells.p/g/h/area/c/v/b/i`
- `pack.vertices`

尚书任务：

1. 遍历 grid cells。
2. 排除深海：`height < 20 && type !== -1 && type !== -2`。
3. 排除部分非岸湖点：`type === -2 && (i % 4 === 0 || lake)`。
4. 添加保留点及 `g/h`。
5. 对 `type === 1 || type === -1` 的海岸/水岸同类型邻接补 midpoint。
6. 对 pack points 重新 `calculateVoronoi()`。
7. 计算 pack polygon area。

门下检查：

- `pack.cells.g` 全部指向合法 grid cell。
- `pack.cells.h[j] === grid.cells.h[pack.cells.g[j]]` 初始成立。
- `pack.cells.area` 全部为正。
- pack 平均邻接度接近 source。
- 记录深海排除数、湖点排除数、海岸补点数。

侍中验收：

- 海岸线语义细于内陆。
- 不再存在 `one-grid-cell-to-one-pack-cell` 作为正式路径。

禁止事项：

- 不在 grid 上直接生成城市、国家、路线。

### 阶段 5：pack features、haven、harbor、feature groups

source：

- `src/generators/features.ts`
- `src/generators/lakes.ts`

输入字段：

- 完整 pack

输出字段：

- `pack.cells.t/f/haven/harbor`
- `pack.features`
- feature group
- 湖泊 `height/shoreline`

尚书任务：

1. 复刻 `Features.markupPack()`。
2. 对陆地海岸 cell 定义 `haven` 和 `harbor`。
3. 追踪 feature vertices 和 shoreline。
4. 计算湖泊高度。
5. 复刻 `Features.defineGroups()`。
6. 为 lake climate 留出字段。

门下检查：

- 所有陆地海岸 cell 的 `haven` 指向邻接水 cell。
- `harbor` 等于邻接水 cell 数。
- feature group 分布可导出。
- 湖泊 feature 有 shoreline 和 height。

侍中验收：

- 地中海沿海港口候选明显。
- 湖泊、海、岛屿和大陆分组可解释。

禁止事项：

- 不生成 burg port，先只提供港口基础字段。

### 阶段 6：河流和湖泊水文

source：

- `src/generators/river-generator.ts`
- `src/generators/lakes.ts`

输入字段：

- `pack.cells.h/t/f/haven`
- `pack.features`
- `grid.cells.prec`

输出字段：

- `pack.cells.fl/r/conf`
- `pack.rivers`
- lake climate fields

尚书任务：

1. 复刻 `alterHeights()` 微小 tie-break。
2. 复刻 `Lakes.detectCloseLakes()`。
3. 复刻 `resolveDepressions()`。
4. 复刻 `Lakes.defineClimateData()`。
5. 复刻 `drainWater()`。
6. 复刻 `flowDown()` 的合流和湖泊入流。
7. 复刻 `defineRivers()`。
8. 复刻 confluence flux。
9. 复刻 downcut。
10. 复刻 meandered points、river width、sourceWidth、mouth。

门下检查：

- `cells.fl/r/conf` 长度等于 pack cells。
- river cells 路径无重复环。
- river source/mouth 合法。
- lake outlet/inlets 与 river id 可追溯。
- 陆地河流最终入水体、湖泊或边界。

侍中验收：

- 河网数量与 source 同量级。
- 无海中打结、绕圈、跨海直线。
- 河流沿地势自然汇流。

禁止事项：

- 不用随机折线伪造河流。
- 不用纯视觉阈值补河。

### 阶段 7：生物群系和人口评分

source：

- `src/generators/biomes.ts`
- `public/main.js` 中 `rankCells()`

输入字段：

- `grid.cells.temp/prec`
- `pack.cells.g/h/fl/r/conf/t/f/haven/harbor/area`
- `pack.features`

输出字段：

- `pack.cells.biome`
- `pack.cells.s`
- `pack.cells.pop`

尚书任务：

1. 复刻 biome 数据表和 `getId()`。
2. 使用河流 flux 修正 moisture。
3. 复刻 `rankCells()` 评分。
4. 输出高适居 cell 与海岸、河流、平原的相关统计。

门下检查：

- 水域 `pop=0`。
- 无 habitability 的 biome 不产生正 `s`。
- `cells.s/pop` 分位数与 source baseline 对照。

侍中验收：

- 高人口潜力集中在河谷、河口、海岸、平原和适宜气候区。
- 高山、冰原、沙漠、深内陆不会普遍高人口。

禁止事项：

- 不用高度或随机数直接决定人口。

### 阶段 8：文化

source：

- `src/generators/cultures-generator.ts`

输入字段：

- `pack.cells.s/pop/biome/h/t/r/fl/haven/harbor`
- `grid.cells.temp`

输出字段：

- `pack.cultures`
- `pack.cells.culture`

尚书任务：

1. 复刻 culture set 选择和中心排序函数。
2. 中心只能从 populated cells 中选。
3. 复刻 culture type 判定：Nomadic、Highland、Lake、Naval、River、Hunting、Generic。
4. 复刻 expansionism。
5. 复刻 FlatQueue 成本扩张。

门下检查：

- 非 populated cell 不赋文化。
- culture center 必须有正 `s`。
- 扩张成本包含 biome、高度、河流、海岸类型。

侍中验收：

- 文化边界随地形、水域和人口断裂，不是几何染色。

禁止事项：

- 不按最近中心直接 Voronoi 染色。

### 阶段 9：城市和港口

source：

- `src/generators/burgs-generator.ts`

输入字段：

- `pack.cells.s/pop/culture/h/t/f/haven/harbor/r/fl`
- `pack.features`

输出字段：

- `pack.burgs`
- `pack.cells.burg`

尚书任务：

1. 复刻 capital 数量和选点。
2. 复刻 town 数量和选点。
3. 使用 quadtree spacing 控制间距。
4. 复刻 `Burgs.shift()` 的港口和河流偏移。
5. 港口判定必须依赖 `haven/harbor/feature/temp`。
6. 暂缓或记录 `Burgs.specify()`，待 routes/states 后补。

门下检查：

- burg cell 都在陆地、正 `s`、有 culture。
- capital 数量与 states 需求匹配。
- port burg 的 haven 指向非陆地水 cell。
- 城市间距不低于 source 规则允许的范围。

侍中验收：

- 地中海沿海出现合理港口。
- 城市不系统性跑到半山腰。

禁止事项：

- 不把 label 或视觉点当作城市数据。

### 阶段 10：国家

source：

- `src/generators/states-generator.ts`

输入字段：

- `pack.burgs`
- `pack.cells.culture/biome/h/s/r/fl/t/f/pop`

输出字段：

- `pack.states`
- `pack.cells.state`

尚书任务：

1. 复刻 state 创建，国家来自 capital burgs。
2. 复刻 `expandStates()` 成本场。
3. 复刻 `normalize()`。
4. 复刻 `getPoles()`。
5. 复刻 `findNeighbors()`。
6. 复刻颜色、外交、战役。
7. 等 `Burgs.specify()` 后复刻统计和国家形制。

门下检查：

- state center 等于 capital burg cell。
- 陆地 cell 才分配 state。
- burg.state 与所在 cell state 一致。
- neighbors 双向可解释。

侍中验收：

- 国界受山地、河流、文化和人口影响。
- 不出现大面积机械直线。

禁止事项：

- 不按最近首都或 x/y 几何切割作为正式实现。

### 阶段 11：路线

source：

- `src/generators/routes-generator.ts`
- `src/utils/pathUtils.ts`

输入字段：

- `pack.burgs`
- `pack.cells.burg/biome/h/t/g`
- `grid.cells.temp`

输出字段：

- `pack.routes`
- `pack.cells.routes`

尚书任务：

1. 复刻 Delaunay/Urquhart 候选图。
2. 复刻主路：同 feature 内 capitals。
3. 复刻小路：同 feature 内 burgs。
4. 复刻海路：同水域 feature 内 ports。
5. 复刻 land/water cost evaluator。
6. 复刻 `findPath()` 优先队列寻路。
7. 复刻 route segment 去重、merge、sharp angle 修正。

门下检查：

- 陆路经过水 cell 数为 0。
- 海路经过陆 cell 数为 0。
- 海路不经过过冷海域。
- `pack.cells.routes` 双向一致。
- 找不到 path 时不生成终点直连。

侍中验收：

- 山区路线稀疏，城市和平原间连通更强。
- 路线自然弯折，不是直线网。
- 海路只连接港口。

禁止事项：

- 不用贪心直追终点。
- 不在失败时画直线。

### 阶段 12：宗教

source：

- `src/generators/religions-generator.ts`

输入字段：

- `pack.cells.culture/state/biome/h/t/routes/pop`
- `pack.burgs`
- `pack.states`
- `pack.routes`

输出字段：

- `pack.religions`
- `pack.cells.religion`

尚书任务：

1. 复刻 folk religion 与 culture 的关系。
2. 复刻 organized/cult/heresy 生成。
3. 复刻扩张成本，纳入路线、生物群系、水域、文化、国家限制。
4. 生成 origins、deity、form。

门下检查：

- 宗教在 routes 后生成。
- route connectivity 会降低传播成本。
- 民间宗教与 culture 对齐。

侍中验收：

- 宗教边界与文化、国家、路线和地形有可解释关系。

禁止事项：

- 不按几何区域随机染色。

### 阶段 13：城市指定、国家统计、国家形制

source：

- `src/generators/burgs-generator.ts`
- `src/generators/states-generator.ts`

输入字段：

- burgs、states、routes、religions

输出字段：

- burg `population/type/group/coa`
- state `area/rural/urban/burgs/form/fullName`

尚书任务：

1. 复刻 `Burgs.specify()`。
2. 复刻 route connectivity 对城市人口的影响。
3. 复刻城市 type、group、徽章字段。
4. 复刻 `States.collectStatistics()`。
5. 复刻 `States.defineStateForms()`。

门下检查：

- burg population 为正。
- state 人口统计等于 cell 和 burg 汇总。
- state fullName 不为空。

侍中验收：

- 首都、省会、港口和普通城市层级可解释。

### 阶段 14：省份

source：

- `src/generators/provinces-generator.ts`

输入字段：

- states、burgs、religions、pack cells

输出字段：

- `pack.provinces`
- `pack.cells.province`

尚书任务：

1. 复刻每 state 选 burg 建 province。
2. 复刻省份成本扩张。
3. 复刻边界修正。
4. 复刻 wild/colony/island provinces。
5. 复刻 province poles。

门下检查：

- province 不越过所属 state。
- province center 指向所属 state 内 burg 或合法 cell。
- state.provinces 与 pack.provinces 双向一致。

侍中验收：

- 省份围绕城市组织，不是机械网格。

### 阶段 19：demo 编辑器原型

目标：

- 先在 `prototype/webgl-cells/` demo 中验证编辑器交互模型，不进入正式应用，不修改 `source/`。
- 用三个编辑器覆盖三类典型编辑能力：地形栅格、线性对象、政治区域/实体。
- 第一刀重点是命中选择、局部数据修改、撤销/重置、局部或全量重绘策略，不追求 source 完整编辑器功能。

尚书任务：

1. 高度编辑器：支持基础笔刷，能抬高、降低或平滑局部高度，并刷新高度/地形相关图层。
2. 河流编辑器：支持选择河流，调整局部折线或流量宽度，并刷新河流宽线渲染。
3. 国家编辑器：支持选择国家，给 cell 改归属或调整国家显示色，并刷新国家专题和边界。
4. 为三个编辑器提供统一的 demo 级编辑状态：当前工具、选中对象、笔刷参数、撤销/重置。
5. 在文档中记录哪些交互可迁移到正式应用，哪些只是 demo 试验。

门下检查：

- 不修改 `source/`。
- 编辑操作不会破坏 demo 基础渲染和 picking。
- 三类编辑器的状态切换清晰，不互相污染。
- 撤销/重置至少覆盖本轮编辑产生的数据改动。

侍中验收：

- 浏览器中能实际执行高度、河流、国家三类编辑。
- 编辑后画面立即反馈，重新切换专题后仍能看到修改。
- 记录后续迁移到正式应用时需要重做的数据层和 UI 层边界。

暂缓项：

- source 完整编辑器复刻。
- 保存格式兼容和导出。
- 经济系统与军事系统深挖。

### 阶段 20：经济、市场、生产、税收

source：

- `docs/domain/generation_pipeline.md`
- `docs/domain/goods_schema.md`
- `docs/domain/production_schema.md`
- `docs/domain/trade_schema.md`
- `docs/domain/taxes.md`
- `src/generators/goods-generator.ts`
- `src/generators/markets-generator.ts`
- `src/generators/production-generator.ts`
- `src/generators/states-generator.ts`

输入字段：

- `pack.cells.biome/pop/s/state/province/routes`
- `pack.burgs`
- `pack.states`
- `pack.provinces`
- `pack.routes`

输出字段：

- `pack.goods`
- `pack.markets`
- `pack.deals`
- `pack.cells.good`
- `pack.cells.market`
- burg `market/production/product/treasury`
- state `treasury` 与 tax 字段

尚书任务：

1. 扩展 source/candidate baseline schema，先统计 goods、markets、production、deals、taxes 的数量、引用和缺字段。
2. 复刻或近似 `Goods.generate()` 的基础 catalogue 与 resource placement。
3. 复刻 `Markets.generate()` 的市场中心和市场领地扩张。
4. 复刻 `Production.produce()` 的第一版产出、库存、价格和 deal 日志。
5. 复刻 `States.collectTaxes()` 的 state treasury 数据产物。

门下检查：

- market center burg 引用合法。
- `cells.market` 引用合法，且不指向已删除 market。
- burg production 与 product 字段存在。
- state treasury 为数值。
- submap/resample/heightmap restore 暂不实现时必须明确记录为未覆盖能力。

侍中验收：

- 先以 summary 和 diff 验收，不做市场 UI。
- 市场数量、生产字段覆盖和税收字段覆盖与 source 同量级。

禁止事项：

- 不先做经济图表、贸易动画、市场编辑器或视觉图层。
- 不用随机字段填空绕过引用检查。

### 阶段 21：后段专题深化：河湖命名、markers、zones、military

source：

- `src/generators/river-generator.ts`
- `src/generators/lakes.ts`
- `src/generators/markers-generator.ts`
- `src/generators/zones-generator.ts`
- `src/generators/military-generator.ts`

输入字段：

- 前述全部语义字段。

输出字段：

- river name/type/basin
- lake name
- markers
- zones
- military

尚书任务：

1. 复刻 `Rivers.specify()`。
2. 复刻 `Lakes.defineNames()`。
3. 复刻 `Markers.generate()`。
4. 复刻 `Zones.generate()`，明确 zones 依赖 states/religions/routes/rivers/markers。
5. 复刻 `Military.generate()`。

门下检查：

- markers 坐标和 cell 合法。
- zones cell 集合合法，且依赖字段存在。
- military regiment 所属 state 合法。

侍中验收：

- 标记、区域和军事不是提前随机撒点，而是依赖已生成世界。

## 六、验收与比较规则

### 6.1 每阶段固定产物

每阶段输出：

```text
docs/generated/source-baselines/<case>/source-summary.json
docs/generated/source-baselines/<case>/candidate-summary.json
docs/generated/source-baselines/<case>/diff.json
docs/generated/source-baselines/<case>/*.png（本地预览产物，默认不纳入版本库）
docs/generated/source-baselines/<case>/validation.md
```

### 6.2 比较层级

优先级从高到低：

1. 字段存在性和类型。
2. 数组长度与索引合法性。
3. 图结构不变量。
4. 语义关系不变量。
5. 统计分布与 source baseline 范围。
6. 视觉截图。

视觉截图不能替代字段检查。

### 6.3 阈值原则

初期不要写死过窄阈值。先用阶段 0 的 source 矩阵得到 baseline 范围，再写 `diff.json` 判定。建议初始规则：

- 精确不变量必须 100% 通过：数组长度、索引合法、双向 route、陆路不穿水、海路不穿陆。
- 结构统计先用 source 3 seed 范围作为参考：候选结果应落在 source 最小值到最大值的合理扩展区间。
- 地中海 100000 为最高优先级，如果此 case 不通过，不继续推进下一阶段。

### 6.4 失败回退

任一阶段失败时：

- 尚书停止继续实现下一阶段。
- 门下记录失败字段、失败 case、source 对照值和 candidate 值。
- 太子重写当前阶段小计划。
- 侍中只重新验收当前阶段，不跳到后续 UI 或专题。

## 七、最容易再次跑偏的风险

1. 把 `pack` 做回 grid 一比一映射。
2. 只看截图，不验字段。
3. 用噪声或通用大陆逻辑糊地中海模板。
4. 先做城市、国家、路线，再补水文和 pack。
5. 只验收 10k，不验收 100k。
6. 在 source 未对齐前继续做 UI 面板、编辑器和视觉样式。
7. 忘记 routes 在 religions 前，导致宗教传播缺路线成本。
8. 忘记 `Burgs.specify()` 在 routes/states 后，导致城市人口和类型不可信。
9. 忘记 lake climate 字段，导致河流、湖泊、人口和 feature group 都偏。
10. 在某阶段为修一个截图临时加后处理，破坏后续阶段因果。

## 八、下一步细化任务

下一次开发不得直接改生成器。先执行：

1. 太子：为阶段 0 写工具级小计划，明确 source 运行方式、命令、输出目录和 JSON schema。
2. 尚书：实现 source baseline 导出工具，只读 source，不改正式应用。
3. 门下：检查工具不修改 `source/`，同 seed 连跑可复现。
4. 侍中：生成地中海 100000 source 快照和摘要，交给用户确认“参考样貌”。

阶段 0 通过后，才允许读取当前正式应用实现并进入阶段 1。
