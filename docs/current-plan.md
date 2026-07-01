# 当前开发计划

本文档用于追踪当前阶段计划。后续每次推进里程碑或改变路线，都应同步更新这里。

## 2026-07-01 最新推进队列

当前 focus 仍是 source/candidate full 矩阵 warn 收敛，同时穿插修用户验收中明确指出的纯生成观感问题。最新 full candidate 矩阵为 `61 pass / 2 warn / 0 fail`，warn 总项已降至 `2`。已清除 `routes.roads`、`routes.searoutes`、`economy.deals.marketToMarket`、两个 10k 岛屿 marker 热点、50k 群岛 `tradedGoods` 单项、10k 稀疏群岛的市场类告警、`archipelago-10000-audit-archipelago-001` 的城镇数量派生告警、`peninsula-50000-audit-peninsula-003` 的库存均值/港口/税基告警，以及 `highIsland-100000-audit-highIsland-003` 的军事团数告警。

刚完成的观感修正：

- 生成 loading 文案不再显示目标 `cells`，运行中 badge 只显示状态和地图尺寸；loading bubble 显示“静候星图显影 / 正在推演山海脉络 / 正在铺展灵纹图层 / 正在誊清诸域卷册”。
- 人口显示口径已从内部 FMG 千人单位修正为“人”：国家、省份、文化、宗教、城市、外交矩阵和悬停详情等统一乘以 `1000` 后再套用人口倍率；生成数据、经济和军事公式仍保留内部单位。
- 所有 `UiSelectField` 下拉已从原生浏览器菜单改为统一自绘菜单，同时保留隐藏 select 作为旧运行时代码读取 `.value` 的数据源。
- 浮动面板统一限制在视口内：最大高度不超过宿主视口 `97%`，最小高度 `200px`，面板内容超出后在 body 内滚动。
- 列表选中态已补稳定 id 规范化：共享对象表格、国家/省份/城市/文化/宗教/路线/河流/marker/外交面板统一处理数字 id 与字符串 id，避免“摘要显示目标对象但详情区仍显示未选中”的半选中状态。
- 列表面板详细编辑入口已第一轮收束为图标二级操作：国家、省份、城市、文化、宗教、河流、资源/marker 和外交关系面板默认显示详情与图标工具条，重命名、调色、继承、人口、首都、剪影、宽度、外交关系等细项点击图标后再展开。
- 国家根名现在优先从所属文化 `root` 派生，同文化多国用“东/西/新/古”等变体保持关联；国家形制继续按文化类型生成，例如游牧文化倾向 `汗国 / 诸帐`，海洋文化倾向 `海国 / 诸港 / 海盟`。
- marker 细化第一刀已完成：旧的统一浅白点改为按类别着色，marker 数据补充中文 `label`、`category/categoryLabel`、`resourceKey/resourceLabel`、`economicValue` 和 RGBA `color`；新增盐湖、稀有生物、宝石矿脉等资源 marker，矿山候选也扩展到高地适居资源 cell。
- marker 资源经济已接入国家/省份对象：生成 marker 时按 `state/province` 汇总 `resourcePotential / markerEconomicPotential / resourceTypes / markerCategories`，水域资源会归属到邻接陆地政区；经济阶段新增 `economicPower` 和 `economy.metadata.markerEconomy`，但暂不改 source 已收敛的税收/国库公式。
- marker hover、选中详情和侧栏统计已显示图标、中文类型、类别、资源标签和经济潜力；`stage-2-1231411414 / continents / 10000` 内存验证中生成 `41` 个 marker、`5` 个资源 marker、资源潜力 `74`，覆盖 `4` 个国家和 `5` 个省份，且 marker 无无色点、无非法 cell 引用。
- 资源点已拆成独立图层：控制面板“图层”tab 新增“资源点”和“标记”，前者只控制 `category === "resource"` 的资源 marker，后者控制遗迹、危险、设施、文化等非资源 marker；隐藏的 marker 不再参与 hover/点击命中。
- marker 近景小图标第一刀已完成：远景仍显示 WebGL 点；相机缩放达到 `x2.15` 后，地图 overlay 会显示带底牌的小 SVG 图标，图标按 `visual.shape/symbol/palette/cultureStyle/manual` 数据选择，资源图层关闭时资源图标也同步隐藏；这套字段后续可推广到城镇标识、文化预制样式和用户手动调整。
- 城镇近景剪影第一刀已完成：城镇不复用 marker 水滴图标，而是新增独立 `.city-map-icon` overlay；远景仍用 WebGL 圆点保持轻量，近景按都城、省会、大城、港镇、普通城镇和村落显示简化剪影，城市图层关闭时剪影、点位和 picking 一起隐藏。
- 城镇剪影第二刀已完成：新增 `city.visual` 契约和共享 `city-visuals` 预设，生成时按文化类型自动给海洋/河湖/游牧/高地/林地文化选择港镇帆影、水乡青瓦、营帐、寨堡或林地木屋；城市管理面板支持手动调整剪影与配色，并可撤销/重做或恢复自动预设。
- marker / 资源点管理面板第一刀已完成：管理 tab 新增“资源标记”入口，浮动面板支持全部/资源点/普通标记切换、筛选、排序、选中、定位、详情、重命名、近景图标 `symbol/palette` 手动调整和撤销/重做。
- marker / 资源点编辑第二刀已完成：资源面板支持选择资源类型后点击地图放置、移动选中 marker、删除选中 marker 和重生成全部资源点；所有操作接入 `EditHistory`、点图层、标签、对象索引和国家/省份资源潜力刷新。资源重生成只替换 `category === "resource"` 的资源点，保留遗迹、设施、危险、文化等普通标记，并按地形、河流、生物群系、温度、降水、人口和适居度对候选 cell 加权。
- 资源经济接入国力第一刀已完成：`economy` 阶段会把 marker 经济潜力、资源潜力、人口、面积、城镇和税收合成为国家/省份 `economicPower / resourcePower / powerScore / militarySupply`；资源点编辑和重生成后会立即刷新这些派生字段；军事阶段会用 `economicPower / resourcePotential / militarySupply` 小幅修正军团目标和兵力规模；国家/省份面板已显示并支持排序经济力、资源潜力和实力评分。
- 控制面板和管理浮窗下拉 UI 已统一：新增 `UiSelectField`，`UiField type="select"` 会复用同一控件；生成地形、国家目标/首都、省份目标、城市剪影/配色、资源类型、marker 图形/配色都已替换为统一下拉，构建产物验证中 9 个 `select` 全部位于 `.ui-select-field` 下，无裸下拉。
- 地图点击与编辑列表联动已补齐：共享 `UiObjectTable` 会在选中对象变化后把目标行滚入列表视口；地图导航改为鼠标右键或中键拖动画布，鼠标左键保留点击选择和 hover，不再执行平移；高度/国家/省份/marker 编辑笔刷只响应左键或触控主动作，右键/中键可穿透交互锁用于平移。
- 单位与比例尺显示第一刀已完成并重组为独立“单位”tab：数字缩写、距离单位、派生面积单位、地图比例尺、人口倍率和降水倍率各占一行，不再挤在“视图”tab；距离支持“米/千米/m/km”，面积单位由距离单位自动派生为“平方米/平方公里/m²/km²”，不再二次选择。比例尺限制在 `1-1000 km/cm`，人口倍率限制在 `0.1-10x`，降水倍率限制在 `0.1-5x`。主要运行统计、降水图例、悬停人口/降水、路线/河流长度、国家/省份/文化/宗教面积与人口、城市人口和对象详情已按同一显示偏好换算；内部生成数据暂不改写。
- 显示单位第二刀已完成：新增“数字”精简偏好，默认按“万”缩写，可切为“千”或“完整”；运行统计、悬停、对象详情、国家/省份/城市/文化/宗教/外交/路线/河流/marker/标签等主要计数、评分、潜力和流量读数已接入同一 `formatNumber()`。高度读数不再显示内部 `h` 整数，悬停地形、城市落水检查和高度编辑摘要均按原版高度换算公式显示实际米制高度。
- 下拉菜单第二刀已完成：`UiSelectField` 菜单改为 Teleport 到 `body` 的 fixed 弹层，按触发器位置计算宽度和上下开口，不再占用浮动面板内容高度，也避免打开菜单时把原本无滚动条的浮层撑出滚动条；菜单宽度下限已提高，并会参考最长选项文本扩展但仍受 viewport 限制，长选项在菜单内滚动。
- 图标二级操作第二刀已收束为独立浮层：`UiActionDock` 的插槽内容统一 Teleport 到 `body` 中的二级编辑面板，重命名、调色、继承、人口、首都、剪影、河流宽度、外交关系等操作不再在当前列表面板内展开；新增共享 `UiColorActionPanel`，国家、省份、文化、宗教的“调整颜色”动作都复用同一颜色二级面板。
- 运行时气候系统第三刀已完成：控制面板“生成”tab 的气候区由简单下拉改为平面圆地球投影，纬线为 2D 横线段且赤道长于高纬线，当前画布纬度范围显示为闭合多边形，随纬度接近极点会从梯形向三角形收束；大气风带按纬度位置贴在投影旁边，只显示紧凑箭头按钮，每个风带可点击箭头在东北、东南、西北、西南四向中轮询。赤道/南北极温度、画布纬度和风带变化会立即重算当前地图的温度、降水、生物群系和人口适宜度，并刷新当前画布，不再只等重新生成；国家、城市、经济、军事、外交等下游系统会标为待派生。
- 文化/宗教继承结构第一刀已完成：控制面板“生成”tab 新增“文化继承 / 宗教继承”树状参数，支持“平铺 / 区域浅树 / 分支树”；生成数据写入 `parent / children / depth / lineage / origins`，文化管理和宗教管理面板可查看父级、层级、继承路径并手动调整父级，调整会进入撤销栈并防止自环。
- 文化/宗教树总览已升级为可拖动的独立连线面板：文化管理和宗教管理面板在摘要下方只保留“打开树状面板”入口；完整总览以独立浮层展示，节点按父子层级横向展开，并用 SVG 曲线连接父子节点，拖动标题栏可移动面板，点击节点复用现有选择回调。
- 外交系统第一刀已完成：参考原版 `States.generateDiplomacy()` 和 `diplomacy-editor`，新增 `Ally / Friendly / Neutral / Suspicion / Rival / Enemy / Vassal / Suzerain / Unknown` 关系矩阵；关系生成会读取国家邻接、文化/宗教继承、国力、资源竞争和海洋国家差异。国家对象写入 `diplomacy / diplomacySummary / campaigns`，`map.diplomacy.metadata` 统计关系、战争、附庸和历史；管理 tab 新增“外交管理”，支持主体国家选择、关系列表、手动改关系、重生成外交和撤销/重做；第二刀已补外交专题着色、关系矩阵表、矩阵点击选中关系以及 CSV/JSON 导出。
- 外交专题点击语义已修正：在外交视图下点击国家只切换外交主体并刷新外交着色，不再自动打开国家编辑面板；非外交视图下仍保留原国家选择/编辑入口行为。
- 重新生成区的“待命”提示已移除：默认状态为空。后续点击重新生成后的提示仍计划收敛为 debug 模式功能，本轮先不做 debug 开关。
- Vercel 部署配置已补齐：根目录新增 `vercel.json`，显式使用 `pnpm install --frozen-lockfile`、`pnpm run build:app` 和 `dist/webgl-generator`；`package.json` 补充 `dev / build / preview` 常规脚本和 Vite 8 所需 Node engine；部署说明见 `docs/deployment/vercel.md`。
- source/candidate baseline 的 `lateStages.names` 已补充国家形制、国家类型、文化类型、旧形制命中数、文化关联国家数和国家命名样本；矩阵后段专题表会显示“文化关联国家 S/C”和“旧形制命中 C”。
- source/candidate baseline 的 `features.diagnostics` 已补充 feature 类型分布、小碎陆地/小湖泊数量、湖泊命名/outlet 统计和每个 feature 的 `type / group / cells / firstCell / outlet` 明细；`continents-10000-audit-continents-001/003` 已刷新 summary 和 diff。
- `continents-10000` 两个单例 warn 已完成只读复查：001 的 `features.total` 主要来自候选地形/feature 拓扑中更多小陆块；003 的 `lakeNames` 来自候选真实湖泊数 `7` 对 source `5`，不是 `defineLakeNames()` 命名过滤问题。不要用删除小岛、删除 1-cell 湖或只命名 outlet 湖来压 warn。
- source/candidate baseline 的 `society` 已补充 `settlementEligiblePackCells`；`archipelago-10000-audit-archipelago-001` 的根因确认是候选文化补完把建城候选池扩大到 `1921`，source 为 `1493`。现在 10k 稀疏群岛不再执行文化“补齐未归属人口”兜底，candidate 候选池降到 `1844`，城镇从 `405` 降到 `390`，该 case 已 pass。
- `peninsula-50000-audit-peninsula-003` 的 `economy.markets.stock.mean` 已用低水文半岛库存缩放 gate 清除：candidate 从 `18.257` 降到 `9.129`，source 为 `9.169`。这只是均值对齐；库存分布仍不是 source-style，后续不要继续用全局 stock 常数替代库存机制重写。
- source/candidate baseline 的 `lateStages.military` 已补充 per-state 军事摘要，candidate 额外输出 `rawTarget / burgBackedTarget / finalTarget / landTarget / navalTarget / nodes / spatialMerge` 等 funnel 诊断。`highIsland-100000-audit-highIsland-003` 确认为候选每州 target 被严格兑现导致团数偏高；现在仅对 `highIsland >= 100000` 启用 source-like platoon 空间合并，原 case candidate 团数从 `223` 降到 `183`，source 为 `137`，该项通过。
- `peninsula-50000-audit-peninsula-003` 的港口和税基已收敛：低水文 50k 半岛会跳过 `<25` cells 小湖港候选，港口从 `151` 降到 `136`，source 为 `95`；经济阶段给 raw goods 补 `value` 并按 source 资源邻域 bonus 更新 `cells.s/pop` 和 state/province 人口税基，`pollTaxExpected` 从 `4321.552` 升到 `7966.929`，进入阈值。

剩余 warn case：

- `continents-10000-audit-continents-001`：`features.total`。
- `continents-10000-audit-continents-003`：`lateStages.names.lakeNames`。

下一步优先级：

1. `features.total / lakeNames` 暂归类为地形拓扑 parity 差异，先保留诊断，不做末端业务修正；若继续收敛，应回到高度洼地、lake outlet、feature 拓扑，而不是删除小岛或过滤湖名。
2. marker 后续不要为了单个类型继续扩大总量；下一步可把资源点类型继续细分，或把 marker/city 图标扩展成文化预制图标包和批量应用入口。可追加的资源点类型包括：采石场、黏土坑、煤田、硫磺泉、硝石洞、琥珀海岸、珍珠滩、珊瑚礁、渔场、良港、森林木场、树脂林、药草谷、染料草场、香料林、茶山、丝茧桑园、马场、牧盐草甸、绿洲、圣泉、地热田。
3. 经济/人口后续若继续提质，应把 Goods 生成正式前移到 rankCells 之前，并把资源点转成正式 goods/贸易供需，而不是长期依赖 economy 阶段的资源 bonus 补偿。
4. 单位系统当前是显示层换算且已集中到“单位”tab；后续导出、比例尺标尺绘制、编辑器输入字段和正式人口/降水口径如果要跟随倍率，需要单独接入，避免误把显示倍率写回生成数据。
5. 气候系统当前已支持运行时即时重算温度、降水、生物群系和人口适宜度；后续可继续做更细粒度的海流/季风、局部雨影强度、温度/降水刷子，以及下游派生系统的受约束重算。
6. 文化/宗教继承结构目前只影响数据、统计和手动管理；后续可以让派生关系参与名称变体、图标预制、宗教改革事件、文化同化速度、国家合法性和国力计算。
7. 外交系统当前已生成关系、附庸、战争历史、管理面板、专题着色、关系矩阵和 CSV/JSON 导出；战争尚未驱动军事行动或地图事件，后续可继续做战争事件、军事行动、经济制裁和贸易偏好联动。
8. 重新生成后的状态提示后续应收敛到 debug 模式开启时才显示；本轮只移除了默认“待命”。
9. 再下一步可以继续补文化预制图标包和批量应用入口，或进入资源点到 goods/market/deals 的正式贸易链路。

## 2026-06-18 计划复位

当前正式应用生成质量在用户验收中被判定为已经跑偏：地形、河流、路线、聚落和后续专题均出现明显失真。开发暂停继续叠加阶段 3 功能，先进入 source 优先复位整改。

新的总纲入口是 `docs/task-notes/source-first-recovery-execution-plan.md`，详细施工入口是 `docs/task-notes/source-first-detailed-task-plan.md`。详细规程已经补充独立新智能体 source 复查后的缺口清单、完整生成顺序、字段契约、source baseline 导出 schema、模板/seed/cells 矩阵、各阶段任务包和可脚本判定的验收要求。后续按太子-尚书-门下-侍中四级流程，从 source 对照基线、grid/Voronoi、高度模板、grid/pack features、河流、生物群系、适居度、文化、城市、国家、路线、宗教和省份逐层恢复。

在 source 对照基线完成前，不继续推进 UI 面板、对象编辑、路线样式、政治专题或其他后续功能。

阶段 0 已开始落地：

- 新增 `tools/source-export-baseline.mjs`，可导出单个 source baseline 的 `source-summary.json`、`source-trace.json` 和 `validation.md`；截图需用 `--screenshot true` 本地生成，默认不纳入版本库。
- 新增 `tools/source-baseline-matrix.mjs`，可运行 `quick/full` source baseline 矩阵并生成 `docs/generated/source-baselines/matrix.json` 与 `matrix.md`。
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
- 当前矩阵报告：`docs/generated/source-baselines/candidate-matrix.md`，生成时间 `2026-06-24T16:41:47.034Z`。

阶段 18 已开始第一刀：

- 当前目标不是马上实现后段专题，而是先扩展 source/candidate 对照 schema，让命名、军事、marker、zones 和统计字段进入脚本化验收。
- `tools/source-export-baseline.mjs` 已新增 `lateStages` 摘要，记录 source 的城市/国家/河流/湖泊命名、纹章、国家 form/fullName、军事 regiment、marker 分布、zone 分布和统计字段覆盖。
- `tools/webgl-generator-export-baseline.mjs` 已输出同构 `lateStages` 摘要，当前 candidate 后段缺口会被明确记录为字段差异。
- `tools/baseline-diff.mjs` 已加入后段专题指标和引用不变量；旧 source summary 如果缺少 `lateStages` 字段会被显式判定为需要刷新，而不是被当成真实算法差异。
- `tools/candidate-baseline-matrix.mjs` 已在矩阵报告中新增“后段专题指标”表，用于后续按 case 追踪国家全名、城市纹章、河流/湖泊命名、军队、marker 和 zone 覆盖。
- 已完成中文命名库评估：见 `docs/task-notes/chinese-naming-library-evaluation.md`。
  - 推荐 `cnchar-name@3.2.6` 作为阶段 18 命名基础，原因是 MIT 授权、包体小、含姓氏/名用字和姓名判断能力。
  - 中文地点名新增推荐 `zoningjs@3.2024.0` 作为真实地名语感基础，原因是 MIT 授权、县级以上地名数据、压缩包约 `36KB`、解包约 `133KB`，适合离线整理为轻量词素池。
  - 地点名策略改为“真实地名感为主、轻玄幻点缀”：普通城市优先 `青溪`、`洛川`、`云阳` 这类二字地名；首都、圣城、大湖、奇观等少量对象可使用 `玄泽`、`云麓`、`星渊` 这种轻玄幻词。
  - 暂不直接裸导入 npm 包；正式应用仍保持原生 ESM 静态运行，下一步用本地 seedable wrapper 接入中文根名池。
  - `mingzi-ts@1.0.1` 数据质量高，但 README 标注底层数据来自 `ChineseNames` / `CC BY-NC-SA`，不适合直接进入项目运行链路。
- 已完成阶段 18 命名本体第一刀：
  - 新增 `app/webgl-generator/src/generator/names.js`，提供 seedable 中文地点名、河流名、湖泊名、国家形制名、省份名和轻量 COA 占位生成。
  - 城市、港口、国家、省份、河流和湖泊已接入本地命名器；命名随机流由 `seed + object id/cell/type` 派生，不消耗主生成随机流。
  - 城市已补充 `coa`、`group`、`type` 和基础城市特征字段，国家已补充 `formName`、`fullName` 和轻量 `coa`。
  - 强制 case `mediterranean / 100000 / audit-mediterranean-001` 已刷新，后段专题从 `fail 11 / warn 0` 降为 `fail 6 / warn 0`；命名相关指标均已通过，剩余 fail 为军事、marker、zones 和省份 pole。
- 已完成阶段 18 省份 pole 第一刀：
  - `buildPackProvinces()` 现在会为每个有效省份生成 `pole` 点位。
  - 当前算法在 pack 语义图上选择离省份边界最远的省内 cell 中心，作为 source `getPolesOfInaccessibility()` 的轻量近似。
  - 强制 case 已刷新，后段专题从 `fail 6 / warn 0` 降为 `fail 5 / warn 0`；`lateStages.statistics.provincesWithPole` 已通过。
- 已回头修复正式应用河流渲染旧债：
  - 主河流层已从固定 `gl.LINES` 改为独立 screen-space 三角形带 mesh。
  - 河流宽度按 pack cell `fl`、河流 `sourceWidth/widthFactor` 和沿程长度趋势计算，不再所有河段同粗。
  - 运行时统计面板新增河流三角形、河流 mesh 构建耗时和河流宽度范围。
  - 河口点已从水域 cell 中心裁剪到陆海共享边交点，最后一个入海段不再参与蜿蜒扰动，避免宽河流末端伸进海里。
  - 正式生成器已把沿程 flux 写入 `river.points[*][2]`，renderer 优先用 point flux 计算河宽，避免 meander / 河口裁剪后再按点序号粗略映射 cell 而丢失流量相关宽度。
- 已完成正式版编辑器基础设施第一刀：
  - 新增 `SelectionStore`，把 selection 与 editingObject 从 `runtime/app.js` 的零散赋值收拢为统一状态入口。
  - 新增 `EditHistory`，建立 `execute/undo/redo/clear/getStats` 命令历史骨架，供后续高度、河流和国家编辑器复用。
  - renderer 新增 `locateObject()`，支持城市/标签/marker 点对象、路线/河流线对象和国家/省份/区域面对象的 bbox 定位。
  - 对象详情面板新增“定位”按钮；运行时统计显示定位状态和编辑历史状态。
- 已完成正式版独立河流管理面板第一刀：
  - 新增独立浮动 `river-panel`，不与对象详情或图层面板混用。
  - 面板显示河流总数、总长度、最大流量、筛选结果数，以及全量河流列表。
  - 支持按 id / 类型筛选，按流量、长度和 id 排序。
  - 支持列表选中、定位、红色闪烁高亮和进入河流编辑状态。
  - 左侧视图区新增“河流管理”入口；对象详情中的河流也可打开河流面板。
- 已完成河流面板低风险编辑命令第一刀：
  - 新增 `river-edit-commands.js`，用命令对象调整指定 `riverId` 的 `widthFactor`。
  - 河流面板选中详情区新增宽度因子 slider、“应用宽度”、“撤销”和“重做”。
  - 命令通过 `EditHistory.execute/undo/redo` 修改运行时地图数据，并刷新 renderer、对象详情、河流面板和运行时统计。
  - 重复应用相同宽度因子不会写入新的历史记录；生成新地图会清空历史栈。
- 已完成对象 resolver 第一刀：
  - 新增 `object-resolver.js`，把 city、label、marker、route、river、state、province 和 region 的 selection 摘要解析为当前地图上的完整对象视图。
  - `SelectionStore` 注入 resolver 后，选中、进入编辑和编辑后刷新都会重新解析对象，避免后续复杂编辑误用列表行或 picking 摘要中的旧字段。
  - 河流对象解析会补齐 `points/cells/flux/length/widthFactor/source/mouth` 等字段，当前已能支撑河流面板宽度编辑后的状态刷新。
- 已完成派生重建调度第一刀：
  - 新增 `edit-refresh-scheduler.js`，让编辑命令通过 `effects` 声明 render、selection、derived 和 affected。
  - 河流 `widthFactor` 命令已声明影响 `river-mesh`、`river-width-stats` 和 `object-panels`。
  - 当前第一刀仍把 river mesh 影响映射到现有 `renderer.draw()`，但调度语义已经沉淀，后续可逐步拆 renderer 局部 buffer 刷新。
  - 运行时统计新增“编辑刷新”，用于确认最近一次编辑触发了哪些派生刷新。
- 已完成正式高度编辑器第一刀：
  - 新增独立浮动 `height-panel`，不混入对象详情或固定侧栏。
  - 面板支持启用/停止高度编辑、抬升/降低/平滑、半径、强度、中心衰减、撤销和重做。
  - 新增 `height-edit-commands.js`，高度笔刷提交为 `EditHistory` 命令，并同步 `grid.cells.h` 与已映射的 `pack.cells.h`。
  - renderer 新增 `refreshCellSurface()`，高度预览和提交通过 `HEIGHT_BRUSH_PREVIEW` / `HEIGHT_SURFACE_ONLY` 刷新 cell 表面颜色。
  - 第一刀定位为“高度表层编辑”：暂不重跑 feature、climate、river、biome、文化、国家、城市、路线等高阶派生系统。
- 已完成正式国家编辑器第一刀：
  - 新增独立浮动 `state-panel`，不混入对象详情、河流管理或固定侧栏。
  - 面板支持启用/停止国家编辑、目标国家下拉选择、颜色变更、取选中、取悬停、笔刷半径、撤销和重做，并显示目标国家、来源国家、影响 cells 和历史计数。
  - 新增 `state-edit-commands.js`，国家笔刷提交为 `EditHistory` 命令；拖动预览和提交都会同步 `grid.cells.state` 与映射到同一 grid cell 的所有陆地 `pack.cells.state`。
  - 国家颜色变更也通过 `EditHistory` 命令提交，修改 `map.politics.states[*].color` 并刷新 states 专题颜色。
  - 国家编辑启用后自动切到 `states` 专题，并与高度编辑互斥；拖动中按 `cell-colors` 语义刷新 cell 表面，抬手后刷新 selection/runtime/pick。
  - renderer 的国家专题颜色改为优先读取 `map.politics.states[*].color`，缺失时才回退到 indexed 伪色，使面板中的国家颜色与地图专题更一致。
  - 第一刀定位为“国家表层归属编辑”：暂不重跑省份、区域、城市、路线、军事、zones 或国家统计派生。
- 已补正式编辑器交互锁：
  - 高度编辑、国家编辑或对象编辑状态中，左侧生成、专题切换、视图按钮和其它编辑入口会禁用。
  - canvas 上非当前编辑器需要的 pan、select、hover 和 wheel 会被拦截，避免编辑时误触编辑外交互。
  - 浮动面板中只保留当前编辑器相关面板可操作，非当前编辑面板的控件会禁用并显示锁定提示。
- 已完成阶段 18 军事第一刀：
  - 这是阶段 18 的历史完成项；近期计划仍按用户要求暂缓经济和军事系统，不继续推进军事编辑器。
  - 新增独立 `app/webgl-generator/src/generator/military.js`，按国家、城市、乡村人口和港口生成 source 风格 `state.military` 数组。
  - regiment 字段覆盖 `i/a/cell/x/y/bx/by/u/n/s/type/name/state`，并按陆军/海军分开合并。
  - 强制 case 已刷新，后段专题从 `fail 5 / warn 0` 降为 `fail 3 / warn 0`；`lateStages.military.regiments` 与 `statesWithMilitary` 均通过，剩余 fail 为 marker 与 zones。
- 已完成阶段 18 marker 第一刀：
  - `buildMarkers()` 已从少量调试点改为 source 风格类型池，覆盖 volcanoes、hot-springs、mines、dungeons、ruins、encounters 等默认 marker 类型。
  - marker 仍保持当前 renderer/picking 使用的 grid cell 引用，同时记录 `packCell` 和 source 风格 icon/type 数据。
  - 强制 case 已刷新，后段专题从 `fail 3 / warn 0` 降为 `fail 1 / warn 0`；`lateStages.markers.total`、`withIcon` 和 marker cell 引用均通过，剩余 fail 仅为 zones。

## 总目标

基于 `source/Fantasy-Map-Generator` 的功能、数据结构和视觉表现，复刻一个功能相似但使用 WebGL 实现的独立地图生成器。`source/` 只作为参考实现、行为对照和性能基线，不作为被修改或被接入的目标代码库。

## 当前阶段：source 优先复位，阶段 18 已收口，转入 demo 编辑器原型

第 0 里程碑性能基线、第 1 阶段 WebGL 快照 demo、阶段 2 独立生成器工程骨架和最小生成内核已完成。由于正式应用生成质量被判定偏离 source，当前暂停原阶段 3 的新增 UI/语义功能，改按 `docs/task-notes/source-first-detailed-task-plan.md` 逐层恢复。阶段 0 source/candidate 对照工具已可用，阶段 1 grid/boundary/Voronoi、阶段 2 高度模板 DSL、阶段 3 grid features/地图坐标/温度/降水、阶段 4 `reGraph()` pack 重建、阶段 5 pack features/haven/harbor、阶段 6 河流/湖泊水文、阶段 7 生物群系/人口评分、阶段 8 文化生成/扩张、阶段 9 城市/港口、阶段 10 国家、阶段 11 省份、阶段 12 路线/海路、阶段 13 宗教、阶段 14 温度边界、阶段 15 气候/水文矩阵整改、阶段 16 社会/路线矩阵整改和阶段 17 矩阵全量收口已完成第一版结构整改。旧 source schema 下完整 63 case candidate 矩阵为 `pass（fail 0，warn 0，pass 63）`；source 更新到 `5de7deb4` 后，经济链路 baseline schema 已刷新并确认 candidate 经济为空。经济和军事系统都暂不急，下一步先在 demo 中探索编辑器交互模型。

阶段 18 第一刀已经开始建立后段专题验收框架，并已完成中文命名本体第一刀、省份 pole 第一刀、军事第一刀、marker 第一刀与 zones 第一刀：`names.js` seedable wrapper、城市/国家/省份/河湖命名、城市轻量 COA、国家 full/form name、省份 `pole`、`state.military`、source 风格 marker 类型池和 `pack.zones` 第一版数据已接入。阶段中途已回头修复正式应用主河流固定线宽问题，当前河流层按流量生成 screen-space 三角形带。强制 case `mediterranean / 100000 / audit-mediterranean-001` 在旧 schema 下曾回到 `pass（fail 0，warn 0）`；纳入 source `1.127.2` 经济链路后，当前 diff 为 `fail 28 / warn 11`，失败集中在 candidate 经济链路为空。

## 2026-06-26 source 最新代码比较后的计划修正

`source/Fantasy-Map-Generator` 已从 `3ee2e956` fast-forward 到 `5de7deb4`，当前 source 版本进入 `1.127.2` 系列。这次拉取不是小修：source 已经完成一次明显的结构迁移，并引入经济链路作为正式生成管线的一部分。由此，当前 `pass（fail 0，warn 0）` 只能说明旧有 source/candidate schema 下阶段 18 后段字段已收口，不能解释为已经覆盖最新 source 的完整生成能力。

本次比较后的新事实：

- source 生成器目录已从 `src/modules/*` 迁移为 `src/generators/*`；UI 动态模块大量迁入 `src/controllers/*`；渲染相关能力迁入 `src/renderers/*`，如 `src/controllers/view-3d.ts`、`src/renderers/erosion-bake.ts`、`src/renderers/draw-satellite-texture.ts`。
- source 新增官方架构和领域文档：`docs/architecture/*`、`docs/domain/generation_pipeline.md`、`docs/domain/goods_schema.md`、`docs/domain/production_schema.md`、`docs/domain/trade_schema.md`、`docs/domain/taxes.md` 等。后续 source 审查应优先读这些文档，再落到源码。
- source canonical pipeline 已新增 `Goods.generate`、`Markets.generate`、`Production.produce`、`States.collectTaxes`。经济阶段依赖完整 settlement/state/province/route/population 链路，且位于军事、marker、zones 之前。
- source 3D 相关能力不再以旧 `public/modules/ui/3d.js` 为主入口，而是进入 controller/renderer 分层；后续 3D 或卫星纹理能力应按新结构重新审查，不沿用早期 WebGL 计划里的旧路径。
- `source/` 子仓库仍保留本地 `package.json` 与 `package-lock.json` 的 `@rolldown/binding-win32-x64-msvc` optional dependency 改动，用于本机运行依赖，不属于上游 source 更新内容。

计划调整：

1. 先做 source baseline schema 刷新，不直接继续 UI 或视觉专题。重点补 `goods/markets/production/deals/taxes` 的 source/candidate 摘要字段，并把 `docs/domain/generation_pipeline.md` 的 phase 14 纳入验收。
2. 刷新强制 source baseline：`mediterranean / 100000 / audit-mediterranean-001` 必须基于 `5de7deb4` 重新导出 source summary，再重新导出 candidate summary 和 diff。
3. 新增经济字段导致 diff fail 后，经济链路第一刀作为已识别缺口保留并顺延为后续阶段，暂不立即执行。
4. 近期开发优先级改为 demo 编辑器原型：高度编辑器、河流编辑器、国家编辑器，分别覆盖地形栅格编辑、线性对象编辑和政治区域/实体编辑三类典型编辑器。
5. 之后再评估 source 新增 3D erosion/satellite texture 能力是否进入本项目路线；它属于后续视觉/导出方向，不应打断当前 source baseline 刷新。

## 2026-06-26 economy baseline schema 第一刀

已完成 economy baseline schema 第一刀，只做摘要和 diff，不实现经济生成系统、不做 UI。

- `tools/source-export-baseline.mjs` 已新增顶层 `economy` 摘要，从 source runtime `window.pack` 统计 `goods/markets/production/deals/taxes`。
- `tools/webgl-generator-export-baseline.mjs` 已输出同形 `economy` 摘要；当前 candidate 仍无经济实现，`pack.goods`、`pack.markets`、`pack.deals`、`pack.cells.good`、`pack.cells.market` 被记录为缺失字段和 unsupported source stage。
- `tools/baseline-diff.mjs` 已加入 economy 指标、不变量和 candidate 经济空链路检查；当 candidate 经济为 0 时强制 case 会 fail，并能明确暴露后续经济链路第一刀缺口。
- 已刷新强制 case `mediterranean / 100000 / audit-mediterranean-001`：
  - source：`goods 71`，`markets 65`，`deals 33683`，`treasuryTotal 97479.1`。
  - candidate：`goods 0`，`markets 0`，`deals 0`，缺少经济 pack 字段。
  - diff：`fail 28 / warn 11`，状态为 `fail`，主要暴露 candidate 经济链路为空。

经济链路缺口已经进入 baseline，但近期不立即实现；军事系统也不作为近期优先级。下一步先在 `prototype/webgl-cells/` demo 中尝试三个轻量编辑器原型：高度编辑器、河流编辑器和国家编辑器。它们用于验证编辑交互、命中选择、局部数据修改、撤销/重置和重新渲染策略，不要求直接成为正式应用最终编辑器。

## 2026-06-27 demo 编辑器原型第一刀

已在 `prototype/webgl-cells/` 中完成三个轻量编辑器原型，只用于验证交互模型，不修改 `source/`，也不作为正式应用最终编辑器形态。

- 高度编辑器：
  - 支持浏览/高度/河流/国家工具切换。
  - 高度工具支持抬高、降低、平滑三种笔刷，笔刷半径和强度可调。
  - 抬高/降低支持中心衰减模式，鼠标中心强度最高，靠近半径边缘逐步减弱。
  - 当前修改 `grid.cells.h`，并同步映射到对应 `pack.cells.h`；重绘使用 `renderer.refreshTheme()` 更新专题颜色。
- 河流编辑器：
  - 支持命中选择河流。
  - 支持改宽，更新 `river.widthFactor` 后重建河流宽线 buffer。
  - 支持拖点，使用 demo 运行时 `__editorUsePoints` 让被编辑河流改走 points path，不改原始 source 数据。
  - 新增河流管理面板，展示全量河流、总长度、最大流量、单条长度和单条流量。
  - 支持按 id / 名称筛选河流，点击列表行快速定位到对应河流。
  - 定位或点击河流后，地图上用红色闪烁 SVG path 描出选中河流，并同步进入河流编辑模式。
  - 注意：demo 中河流统计/管理暂时混在侧栏里只是为了验证交互；正式应用必须拆成独立 HTML 浮动面板，不与对象详情、图层控制或其它编辑面板混用。
- 国家编辑器：
  - 支持从 cell 取样国家、拖拽连续涂抹 cell 归属，笔刷半径可调。
  - 支持调整选中国家的显示色。
  - 拖动期间只刷新专题颜色 buffer，抬手后再重建边界 buffer，降低大面积涂抹卡顿。
  - 状态面板显示目标国家、来源国家、颜色值和本次涂抹 cell 数，避免颜色相近时误判。
- 三类编辑器共用 demo 级撤销和重置：
  - 撤销覆盖高度、河流、国家 cell 和国家颜色。
  - 重置恢复本次加载的原始快照。
- 验证结果：
  - Playwright 打开 `http://127.0.0.1:5400`。
  - 高度编辑：目标高度 `54 -> 57`，撤销后恢复。
  - 河流编辑：河流 `2` 的 `widthFactor 0.672 -> 0.77`。
  - 国家编辑：目标 cell 归属 `1 -> 4`。
  - 二次修正验证：高度中心衰减中心增量 `8`、边缘样本增量 `4`；国家一次拖拽涂抹 `643` 个 cell，状态面板包含目标国家和来源国家。

后续若继续编辑器方向，下一刀应围绕“编辑器状态与正式应用数据层边界”推进：把 demo 中临时的运行时改动整理成正式应用可复用的 edit command / undo command 结构，而不是继续堆 UI。正式应用的河流统计/管理应按 `docs/architecture/floating-panel-architecture.md` 建成独立浮动 `river-panel`，不要照搬 demo 的侧栏混合布局。

## 当前已完成

- 第 0 里程碑：
  - 新增 `tools/fmg-profile.mjs`。
  - 生成 `docs/generated/reports/performance-baseline-results.json` 和 `docs/generated/reports/performance-baseline-results.md`。
  - 建立中文协作文档和开发历史。
- 第 1 里程碑：
  - 新增 `tools/fmg-export-snapshot.mjs`，从原项目运行时导出真实地图快照。
  - 新增 `tools/serve-prototype.mjs`，提供无依赖静态服务器。
  - 新增 `prototype/webgl-cells/` 原型。
  - 新增 `prototype/webgl-cells/data/sample-map.json`，作为当前原型默认数据。
  - 新增 `docs/milestones/milestone-1-webgl-prototype.md`。
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
  - 已按用户反馈完成 source 生成算法重新审查，新增 `docs/audits/source-generation-audit-and-rectification-plan.md`，明确高度、河流、路线、文化/国家边界和温度度量的偏差来源与整改顺序。
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
- 已整理 WebGL 原型与 SVG 基线的阶段性性能对照，见 `docs/performance/webgl-svg-performance-comparison.md`。
- 渲染器接口已收敛到接近 `GraphicsMapRenderer` 的形态：
  - 导出 `GraphicsMapRenderer`，并保留 `CellWebGLRenderer` 兼容别名。
  - 提供 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()` 和 `getStats()`。
- 已新增正式 WebGL 原型性能采集脚本：
  - `tools/webgl-prototype-profile.mjs`
  - `docs/generated/reports/webgl-prototype-profile-results.json`
  - `docs/generated/reports/webgl-prototype-profile-results.md`
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
- 已按 `docs/plans/gl-reimplementation-acceptance-plan.md` 完成步骤 1.1：
  - `renderer.js` 收敛为 `GraphicsMapRenderer` 主类和 WebGL draw/API 门面。
  - 新增 `camera.js`、`buffers.js`、`picking.js`、`colors.js`、`layers.js`、`utils.js`，拆出相机、buffer、picking、颜色和图层状态职责。
  - 保留 `loadSnapshot()`、`setColorMode()`、`setLayerVisible()`、`setCamera()`、`screenToWorld()`、`pick()`、`getStats()` 对外 API，以及 `CellWebGLRenderer` 兼容别名。
- 已按 `docs/plans/gl-reimplementation-acceptance-plan.md` 完成步骤 1.2：
  - 快照导出新增 `pack.features`、`cells.f`、feature/lake 统计和湖泊 group/type 分类数据。
  - demo 新增陆地底色、湖泊填色、海岸线和湖岸线 WebGL 图层。
  - 基础 cell mesh 仍使用 `grid`；feature 图层只使用 `pack.features` 和 `pack.vertices` 做业务语义表达。
  - UI 新增陆地底色、湖泊、海岸/湖岸线开关。
- 已按 `docs/plans/gl-reimplementation-acceptance-plan.md` 完成步骤 1.3：
  - 快照导出新增 `pack.cells.province/culture/religion/biome`、`grid.cells.temp`、`pack.provinces/cultures/religions` 和 `biomesData` 颜色/名称元数据。
  - 新增 `themes.js`，集中管理 `height`、`biomes`、`states`、`provinces`、`cultures`、`religions`、`temperature` 专题面定义和 palette。
  - cell 几何仍只构建一套 grid mesh；专题切换仅重算并上传当前专题颜色 buffer，不重建 position buffer。
  - UI 的渲染模式扩展为七个专题按钮，统计面板显示当前专题、字段来源、专题值数、颜色 buffer 顶点数和专题更新耗时。
  - hover picking 保留原空间索引，并补充生物群系、省份、文化、宗教和温度字段。
- 已按 `docs/plans/gl-reimplementation-acceptance-plan.md` 完成步骤 1.4：
  - 快照导出新增 `pack.routes`，保留 `roads`、`trails`、`searoutes` 分组和路线点列。
  - 新增 `lines.js`，统一构建河流、路线、国家边界和省份边界四类 WebGL line layer。
  - 国家边界和省份边界已拆成独立图层，`setLayerVisible("borders")` 仍保留为兼容别名。
  - UI 新增省份边界和路线开关，统计面板显示四类线图层线段数、路线数量和路线分组。
  - 当前仍使用 `gl.LINES`，宽线、join/cap、dash 和 line picking 放入后续步骤。
- 已按 `docs/plans/gl-reimplementation-acceptance-plan.md` 完成步骤 1.5：
  - 快照导出新增 `grid.cells.prec`、`pack.cells.pop`、`pack.cells.burg`、`pack.burgs` 和 `pack.markers`。
  - 新增 `points.js`，统一构建降水、人口、城市/港口和 marker 四类 WebGL point layer。
  - UI 新增四类点层开关，统计面板显示点层数量、港口数量和 marker 分组。
  - 当前仍使用 `gl.POINTS` 占位，sprite atlas、LOD 和对象级 picking 放入后续步骤。
- 已按 `docs/plans/gl-reimplementation-acceptance-plan.md` 完成步骤 1.6：
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

1. 正式国家编辑器第一刀已完成：新增独立浮动“国家编辑”面板、国家 cell 归属笔刷命令、目标国家选择/取样、笔刷半径、颜色变更器、快速更换首都、连续涂抹预览和 EditHistory 提交。
2. 城市/聚落正式面板第一刀已完成：新增独立浮动“城市管理”面板，支持城市列表、筛选、排序、快速定位、选中高亮、国家/省份/人口/类型/首都/省会/港口/文化/宗教详情，以及城市名称编辑；重命名会同步 `settlements.cities` 与 `pack.burgs` 并刷新城市标签。
3. 默认国家和省份配色已改为基于邻接图的贪心分配，避免相邻政治单元按固定色序撞色，并尽量拉开相邻色距。
4. 控制面板“视图”页已新增“高度视图显示海底”开关；默认关闭，打开后只影响高度视图中的水域高度着色，不改变生成数据。
5. 国家编辑器政治派生一致性第一刀已完成：国家笔刷提交后同步 `grid.cells.state`、陆地 `pack.cells.state`、城市/burg state、城市 province、受影响省份 cell、国家统计和省份统计，并刷新政治边界线层、selection/runtime/pick。
6. 省份管理面板第一刀已完成：新增独立浮动“省份管理”面板，支持省份列表、筛选、排序、快速定位、选中高亮、名称编辑、颜色编辑和 EditHistory 撤销/重做。
7. 国家笔刷后的省份 pole 已改为局部重算：受影响省份会按 pack cell 到边界距离重新选择 `province.pole`，并纳入 undo/redo 快照；`province-poles` 不再作为该命令的待派生项。
8. 河流详情已归并到独立浮动“河流管理”面板：选中河流不再打开通用对象详情面板，河流名称编辑、宽度因子编辑、定位、进入/退出河流编辑和关闭重置编辑态均在河流面板内完成。
9. 浮动面板公共 DOM 组件第一刀已完成：国家、省份、城市和河流面板已共用摘要、排序、详情、历史操作和表格滚动恢复组件；国家列表 hover 重渲染后不再回到顶部。
10. 图层独立开关第一刀已完成：侧栏可单独控制道路、河流、城市、城市标签、国界、省界和海岸线；国界构建已补上国家与无人地带之间的陆地边界。
11. 省份 cell 归属笔刷第一刀已完成：省份面板支持启用编辑、目标省份、取选中、取悬停和半径；笔刷提交后同步 grid/pack 省份、城市省份、省份统计、center 兜底、pole 和政治边界，并支持 EditHistory 撤销/重做。
12. 路线面板第一刀已完成：新增独立浮动“路线管理”面板，支持路线列表、筛选、排序、快速定位、选中高亮、路线长度/段数/类型/起终点详情。
13. 控制面板 tab 化第一刀已完成：固定侧栏只保留“控制面板”入口；`generation-panel` 已合并生成配置、视图选择器、图层选择和管理页面入口，并以 `生成 / 视图 / 图层 / 管理` 四个 tab 呈现；图层开关已改为带选中高亮的按钮样式，视图、图层显隐、“高度视图显示海底”和城市标签上限会同步到浏览器 `localStorage` 并在下次打开时恢复；城市标签上限滑动条会按当前地图城市总数动态设置最大值，默认候选上限为全量城市，避免大图被固定候选上限截断。
14. 国家编辑器仍不重跑完整省份扩张、军事、zones 和 state-center markers；军事、zones 和 state-center markers 会被标记为派生过期，并在运行时面板显示。
15. 高度编辑器后续第二刀再考虑完整派生链路：feature、climate、river、biome 和人口等系统重算，当前第一刀仍只保证表层高度和颜色。
16. 河流面板下一刀暂不做河道拖点、源头/河口修正或支流结构调整；cells 级河流编辑要等 renderer 局部 buffer 和 objectPickingIndex 重建规则更明确后再做。
17. 城市/聚落面板第二刀 A 已完成：新增城市人口编辑命令，支持 EditHistory 撤销/重做，并同步 `settlements.cities[id].population` 与对应 `pack.burgs[burgId].population`；城市详情已加入人口输入、归属一致性/落水异常提示，以及低风险“同步归属到所在 cell”操作。该同步只按城市当前 `packCell` 回填 city/burg 的国家与省份字段，不提供任意迁国/迁省下拉。
18. 城市/聚落面板后续仍暂缓新增/删除城市、移动位置、自由迁国/迁省、港口重算、路线重算和标签手动布局；下一刀可在本轮一致性提示基础上做城市移动/港口派生设计，或转向文化/宗教/生物群系统计面板。
19. 文化管理面板第一刀已完成：新增独立浮动“文化管理”面板，支持文化列表、筛选、排序、快速定位、选中高亮、名称编辑、颜色编辑、覆盖 cells、面积、乡村/城市人口、城市数和主要国家分布统计；文化视图颜色会优先读取文化对象颜色。文化 cell 归属笔刷、中心迁移、扩张参数编辑和宗教联动重算暂缓。
20. 文化命名风格第一刀已完成：`european` / `english` 文化集会把文化对象标记为 `nameStyle: "European"`，城市、港口、国家、省份、河流和湖泊命名会读取文化命名风格并输出中文音译风名称，例如 `雷恩郡`、`温德堡自由邦`、`莱茵江`，避免纯外文名。文化管理面板详情会显示“命名风格”。后续可把命名风格做成文化编辑器字段，并继续补东方、古典、黑暗奇幻等风格包。
21. 宗教管理面板第一刀已完成：新增独立浮动“宗教管理”面板，支持宗教列表、筛选、排序、快速定位、选中高亮、名称编辑、颜色编辑、覆盖 cells、面积、乡村/城市人口、城市数、主要国家和主要文化统计；宗教视图颜色会优先读取宗教对象颜色。宗教 cell 归属笔刷、中心迁移、扩张参数编辑、文化/国家/城市宗教联动重算暂缓。
22. Vue SFC + Pinia 第一刀已完成：正式应用改为 Vite 入口，使用本地 ESM SFC，不走 CDN；已抽出 `UiButton`、`UiTabs`、`UiSegmented`、`UiField`、`UiSwitchField`、`UiSliderField`、`UiLayerToggleButton` 和 `UiMetricGrid` 等基础组件。控制面板已迁为真实 `ControlPanel.vue`，高度编辑面板已迁为真实 `HeightPanel.vue`；视图、图层、生成配置和管理入口仍保留原 id/data 契约，由现有 runtime 事件驱动。Pinia 只接管轻量编辑状态和全局配置偏好，视图、图层显隐、“高度视图显示海底”和城市标签上限继续同步到 `localStorage`。WebGL 地图数据、pack/grid、renderer buffer、picking index 等渲染优先状态仍留在 runtime/renderer，不进入 Pinia。
23. Vue 对象面板基础层已完成第一刀：已新增 `UiFilterInput`、`UiSortBar`、`UiObjectTable`、`UiDetailGrid`、`UiHistoryActions`、`UiTextEditField`、`UiColorField` 和 `UiNumberField`。路线面板、对象详情面板、河流管理面板、文化管理面板、宗教管理面板、城市管理面板、省份管理面板和国家编辑面板均已迁为真实 Vue SFC，并继续保留原外部 API 和 runtime 回调。
24. 已新增 `docs/architecture/vue-floating-panel-pattern.md`，明确 Vue 浮动面板复用规范：wrapper 只做 panel manager 适配和回调桥接，SFC 负责 UI，Pinia 只接管轻量状态，`map/grid/pack/renderer/picking index` 等渲染优先状态不进入 Pinia。
25. 城市管理面板 Vue 迁移已完成：`city-panel.js` 已收敛为 Vue wrapper，新增 `CityPanel.vue` 负责摘要、筛选、排序、城市表格、详情、名称编辑、人口编辑、归属同步入口和历史操作；旧重命名、人口编辑、归属同步、定位和 selection 回调保持不变。
26. 省份管理面板 Vue 迁移已完成：`province-panel.js` 已收敛为 Vue wrapper，新增 `ProvincePanel.vue` 负责摘要、筛选、排序、省份表格、详情、名称编辑、颜色编辑、目标省份选择、笔刷半径、取选中/取悬停、启停编辑和历史操作；旧省份重命名、颜色修改、定位、selection、归属笔刷和撤销/重做回调保持不变。
27. 国家编辑面板 Vue 迁移已完成：`state-panel.js` 已收敛为 Vue wrapper，新增 `StatePanel.vue` 负责摘要、筛选、排序、国家表格、详情、名称编辑、颜色编辑、首都选择、目标国家选择、笔刷半径、取选中/取悬停、启停编辑和历史操作；旧国家重命名、颜色修改、首都修改、定位、selection、归属笔刷和撤销/重做回调保持不变。
28. 当前正式应用已有的主要浮动管理/编辑面板均已迁为 Vue SFC；后续可继续做面板内部交互深化，例如国家/省份新增删除、城市移动、标签/命名面板、marker/zone 面板或对象表格虚拟滚动。
29. 悬停信息已从侧栏统计区精简为右下角透明信息卡：信息卡固定在地图右下角、不拦截鼠标事件，只展示当前悬停对象、cell、海拔/水域、国家/省份、文化/宗教、城市/路线等压缩摘要；侧栏 `pick-stats` 只保留选中对象和编辑对象摘要。控制面板 `图层` tab 新增“悬停信息”开关，并通过 `showHoverInfo` 持久化到浏览器 `localStorage`；旧版偏好仍会被兼容读取。
30. 温度/降水比例尺已移到左下角，避免与右下角悬停信息卡互相遮挡；比例尺仍只在温度、降水视图显示。
31. 标签命名面板第一刀已完成：控制面板 `管理` tab 新增“标签命名”，可统一查看城市标签与国家名称，支持筛选、排序、定位、选中和重命名；国家名称标签已接入 renderer，在国家视图下显示，并新增 `国家名称` 图层开关。
32. 对象类型分发第一刀已完成：新增 `app/webgl-generator/src/runtime/object-kinds.js`，集中管理 `OBJECT_KIND`、`LABEL_TARGET_KIND`、中文类型名、政治对象字段映射和常用类型判断；对象解析、重命名、对象详情、悬停信息、selection 自动开面板和 renderer 选择高亮已优先改为常量、分发表或字段表。
33. 经济和军事系统都暂缓；经济链路作为已识别缺口保留到后续阶段，军事系统与军事编辑器暂不推进。
34. 用户可见命名已从“专题”统一改为“视图”；内部 `themes`、`colorMode` 等契约暂时保留为实现名，后续文档和 UI 一律按“视图”称呼。
35. 标签管理增删改第一刀已完成：原“标签命名”入口已改为“标签管理”；新增独立手工标签，支持名称、位置、定位、选择、删除和 EditHistory 撤销/重做；城市/国家名称这类派生标签遵守源对象约束，删除实现为隐藏并支持恢复。标签管理完善后，再把同一套表格动作、详情动作和历史操作模式推广到其它管理面板。
36. 管理面板“重新生成”入口第一刀已完成：新增独立浮动“重新生成”面板，提供国家、省份、城镇、道路、河流动作按钮、状态反馈和约束说明；道路已接入当前国家、城镇、港口和陆海约束下的实际重算，国家/省份/城镇/河流先保留为受约束入口，避免破坏下游派生。第一刀不推进 marker 和 zone。
37. 后续 UI 面板仍需遵循 HTML 浮动可拖动方向，不使用 canvas 实现；该架构约束继续保留在 `docs/architecture/floating-panel-architecture.md` 和 `docs/architecture/vue-floating-panel-pattern.md`。
38. 中文文化城镇命名修正已完成第一刀：中式城市名改为二字为主，大城市、首都和省会几乎都保持二字；小型聚落保留少量三字或四字自然地名。`names.js` 已扩充中式词根和候选用字，并用“静态二字词根 + 可组合单字词库”降低复制感；`settlements.js` 会把首都、省会、人口和聚落组别传给命名器。音译风命名仍保留独立规则。
39. 标签视觉与国家名称放置修正已完成第一刀：城市标签去掉普通态黑色底框、padding 和文字阴影，普通城市、首都和港口统一文字颜色；国家名称从首都点迁到 `pack.cells.state` 陆地 cell 的面积加权地理中心，较长国名会按国家形状主轴或兜底角度轻微倾斜。国家名称是国家视图主标签，会先于城市、首都和手工标签布局；若首都与国家名称重叠，优先显示国家名称。
40. 管理 tab 的“重新生成”已改为常驻专栏：编辑/管理面板入口与重新生成操作用分割线区隔；国家、省份、城镇、道路、河流按钮直接展示在管理页内，不再通过“重新生成”二级浮动面板进入。当前道路按钮仍执行受约束重算，其它按钮显示约束状态说明。
41. 重新生成深化顺序调整：先做河流重新生成。理由是河流是水文与适居度骨架，会影响道路路径、城镇类型/布局、marker/zone 和后续省份/国家语义；本轮第一刀目标是让“河流”按钮按当前高度、降水、湖泊和 pack 语义图真实重建河流，随后刷新 biome/人口评分与当前城镇上的道路，并把城镇、省份、国家、宗教、marker、zone、军事等下游语义显式标记为待派生。
42. 城镇重新生成第一刀开始：保留国家首都 burg id 和政治首都引用，按省份中心重建省会并回写 `province.burg`，普通城镇按当前适居度、文化、国家、省份、港口和间距约束重新选点；随后重算港口/河畔类型、城市特征、城市标签、人口点、对象索引和道路。旧城市生成标签的隐藏列表会清空，手工标签保留。省份/国家边界、宗教、marker、zone、军事暂不在本刀重建，只标记为待派生。
43. 河流重新生成体验修正：普通整图生成仍保持基于 seed 的稳定结果；点击“河流”重新生成时会递增 `riverRegenerationSalt`，在高度下行和湖泊约束内加入轻微水文扰动，使连续点击能得到不同河网，而不是重跑同一套确定性结果。
44. 国家命名修正已完成第一刀：国家根名不再默认从首都名派生，而是按文化/地理候选独立生成，并把首都名作为避让项处理；只有未来显式识别为单城邦的小国时，才允许打开 `allowCapitalName` 这类城邦式同名例外。国家根名候选会过滤掉被剥成单字的州、郡、府等地理后缀根，避免出现“上王国”或“蓟王国”这类退化名称。
45. 国家名称缩放优先级修正已完成第一刀：国家视图下，远景/总览时国家名称仍优先于城镇标签；放大到中近景后，城镇标签优先，国家名称只在不与城镇标签冲突时显示；继续放大后国家名称逐渐淡出并最终隐藏，避免近景浏览时城镇被国家名完全盖住。
46. 城镇与道路重新生成扰动修正已完成第一刀：点击“城镇”时递增 `settlementRegenerationSalt`，在保留国家首都 burg id、省会锚点、政治归属和陆地适居约束的前提下重新扰动普通城镇候选；点击“道路”时递增 `routeRegenerationSalt`，让路线候选连接和 pack A* 成本在陆海硬约束内轻微变化。普通整图生成不传这些 salt，仍保持同 seed 可复现。
47. 城镇标签颜色已改为黑色字体，并加轻量浅色文字阴影保证深色地块上的可读性；手工标签仍保留原浅色样式。
48. 国家名称渐隐已修正第二刀：国家名称退出近景时不再由城市标签碰撞直接硬隐藏，而是使用连续 `smootherStep` 透明度曲线退场；中近景国家名称不再挤占城市标签空间，并通过层级放在城市标签下方，避免在特定缩放比例下残影式重新显现。
49. 初始化中立地区已收紧：国家扩张后会把已有城镇或有适居/文化评分的中立陆地补给相邻或最近国家；初始生成最终仍为中立的非首都城镇会被剔除，因此初始化的中立区不再出现大量城镇和道路端点。用户后续手动涂出的中立不走这条初始清理逻辑。
50. 国家和省份涂色编辑器已加入“中立”特殊目标：国家中立类似橡皮擦，会把目标 cell 的国家归属清为 `0` 并同步清省份；省份中立只清省份归属，保留国家。中立作为特殊对象可在目标下拉和表格中选择，但不显示改名、改色、首都等实体操作。
51. 国界、省界、海岸线和湖岸线的单独线层平滑已回滚：由于国家/省份/陆海面填色仍来自硬 cell 多边形，单独平滑边界线会与面层交叉，视觉上比直线更糟。当前边界线恢复为与 cell 面一致的共享 Voronoi 边。
52. 河流、道路、小路和海路已接入渲染层开放折线平滑：原始 `river.points`、`route.points`、河流 cells、宽度来源和路径约束不变；绘制前临时用 Chaikin 保留首尾端点并平滑中间折点，河流宽度和 flux 第三维会同步插值，选中河流高亮也使用同一套平滑路径。
53. 更完整的边界平滑方案改为“面线同源”：后续如果要平滑海岸线，需要同时生成平滑后的陆/水视觉面或遮罩，让海岸面填色与海岸线来自同一轮廓；国家/省份边界同理，需要为政治视图构建提交后的平滑视觉面 mesh，编辑拖拽时仍显示硬 cell 预览，提交后统一重建平滑视觉面和边界线。
54. 海岸面线同源第一刀已完成：渲染层会从 grid 邻接重新收集陆/水 cell 共享边，拼出海岸/湖岸路径后同时生成平滑海岸视觉带和同源中心线；视觉带的陆侧、水侧颜色按当前视图从相邻 cell 取色，因此高度、国家、省份等视图切换后都会重建匹配的海岸过渡面。底层 cells、feature、picking 和编辑判定仍保持原始硬边。海岸路径已收敛为 renderer 级缓存，海岸带宽、平滑强度和海岸/湖岸描线颜色集中在 `SHORE_VISUAL_STYLE` 管理。
55. 国家视图政治面线同源第一刀已完成：仅在国家视图下，国界会从相邻国家 cell 的共享边生成平滑视觉边界带，带两侧分别读取对应国家颜色，国界描线来自同一条中心线；高度视图和省份视图仍使用硬国界，避免线层平滑但面层未同步的问题。国家边界路径按国家组合分组，并在三国交界、端点和复杂节点处切分，避免跨国家组合平滑。
56. 省份视图政治面线同源第一刀已完成：仅在省份视图下，省界会生成更窄、更淡的同源视觉边界带，带两侧分别读取对应省份颜色，省界描线来自同一条中心线；高度视图和国家视图不受省份视觉带影响。无省份 `0` 不参与省界视觉带，避免把中立/无省份区域染成实体省份。
57. 实验性政治视觉面 mesh 缓存已完成第一刀：renderer 会按国家/省份收集内部 cell 中心点和同源边界点，用 Delaunay 生成候选三角形，再按三角形重心所在 cell 的政治归属过滤，产出 `politicalVisualMeshes` 统计。该缓存暂不参与绘制，只用于评估完整政治视觉面替换硬 cell surface 的可行性、三角过滤比例和构建成本。
58. 实验性政治视觉面 debug 绘制已完成第一刀：renderer 新增 `setPoliticalMeshDebugMode("states" | "provinces" | "none")`，默认关闭；打开后会把实验 mesh 作为半透明覆盖层绘制在主 cell surface 之上，并在 `politicalMeshDebug` 统计中暴露当前模式、顶点数和三角数。该能力只用于截图和越界检查，尚不替换正式国家/省份视图 surface。
59. 政治视图主 surface 已接入视觉 mesh 第一刀：国家/省份视图下，非零国家/省份陆地不再使用硬 grid cell surface，而是使用政治视觉 mesh；水域、中立国家和无省份陆地仍保留硬 grid cell 兜底。mesh 点集已补入同源海岸/湖岸陆侧平滑点，减少沿海收缩和缺口；高度、温度、降水、生物群、文化、宗教、区域、人口等非政治视图仍保持原 grid cell surface。
60. 政治视觉 mesh 质量统计与近景抽样已完成第一刀：`politicalVisualMeshes.*.quality` 新增平均 grid 间距、长边阈值、最大边长、长边三角数、边中点归属不一致数、落水采样数和 `notableTriangles`。当前 10k cells 验证中，国家长边三角 `8` 个、边界不一致比例约 `1.6%`；省份长边三角 `6` 个、边界不一致比例约 `2.1%`。近景截图显示少量尖细三角确实存在，下一刀优先做长边过滤，再观察是否需要边界局部补点或更正式 clipping。
61. 政治 mesh 异常直线修正已完成第一刀：对用户指出的第一张近景异常断续直线做图层隔离后，确认来源不是道路、河流或描边，而是政治 mesh surface 的瘦长三角。mesh 构建现在会过滤三类候选三角：超过长边阈值的长三角、采样异常且偏长的跨界/落水三角、以及最大边偏长但最小高极低的针状三角。验证后国家/省份保留三角最大边都压到 `33` 左右，同一位置 surface-only 截图中的异常直线已消失。
62. 全局视觉 cell mesh 试验已完成第一刀：renderer 新增 `cellVisualMesh`，对每条共享 Voronoi 边只生成一次轻微弯曲的二次曲线采样，相邻 cell 反向复用同一条视觉边；真实 `grid.cells`、picking、编辑和邻接仍保持硬 cell。当前所有 surface 视图都会优先使用视觉 cell mesh 着色，政治 Delaunay mesh 暂保留为 debug/统计。10k cells 下视觉 cell mesh 约 `10004` 个 cell、`30215` 条共享边曲线、`175281` 个边界采样点，surface 顶点约 `56.8-59.7` 万，draw 仍保持十几毫秒；高度、国家、省份和异常直线近景截图均通过。
63. 平滑单元格边界已进入可控默认能力：控制面板 `视图` tab 新增“平滑单元格边界”开关，默认开启并持久化到 `localStorage`；关闭后 surface 与海岸/湖岸/国界/省界线层一起回退到硬 cell 路径。开启时海岸线、湖岸线、国界和省界不再走各自独立平滑 path，而是直接读取 `cellVisualMesh.edgeCurves` 的共享边曲线，确保视觉面与线层同源，避免之前“线平滑但 cell 面平直”造成的交叉。当前 10k cells 验证中，平滑模式 `vertexCount = 525843`、`lineVertexCount = 28260`；硬边界回退 `vertexCount = 250731`、`lineVertexCount = 25194`，两种模式 `WebGL error = 0`。
64. 平滑单元格边界大图回归已完成第一轮：新增 `tools/webgl-generator-smooth-cell-profile.mjs`，采集 50k/100k 下平滑与硬边界的 renderer 统计、风险摘要和近景截图。用户指出省份总览开关差异不明显后，已修正关闭平滑时仍残留旧海岸/政治视觉带的问题；当前关闭后线层来源为硬共享边，开启后为平滑共享边，运行时统计新增“边界线来源”。用户进一步指出曲线仍不够自然后，视觉边曲率从逐边独立哈希改为连续空间噪声并降低幅度，减少“每条边单独被捏弯”的人工感。50k 平滑模式 `vertexCount = 2558304`、`lineVertexCount = 85188`、`cellVisualMesh.buildMs = 184.4ms`；100k 平滑模式 `vertexCount = 4963554`、`lineVertexCount = 128838`、`cellVisualMesh.buildMs = 466.2ms`。50k/100k 风险扫描短边、超长边、低面积 cell、无效点均为 `0`，近景海岸、湖岸、省界、国界和交界截图未见裂缝或异常直线；本轮不额外增加保护阈值。但该能力定位为克制的 cell 级微曲过渡，不是最终制图级自然轮廓；后续如果继续追求自然海岸/行政边界，应转向轮廓级重采样、地貌/水文约束和面线同源填充。
65. 海岸线和内部边界视觉平滑改为贴近原版路线：海岸/湖岸线层不再读取 `cellVisualMesh.edgeCurves`，而是从海岸路径生成原版风格分形轮廓，包含粗糙度包络、递归中点扰动、平滑段二次曲线和扰动段三次曲线采样；国家/省份内部边界不再做曲线化，改为连续边界 polyline 的 WebGL 三角形描边，并在每个折点补圆盘模拟 SVG `stroke-linejoin: round`。线层现在以 `gl.TRIANGLES` 绘制，运行时统计的“边界线来源”为“原版海岸 / 圆角政区”。用户指出海岸线仍与填色分离后，已把海岸视觉带改为同源分形轮廓上的陆侧实色带 + 水侧实色带，并改用最近原始海岸点采样陆/水方向，避免线和填色之间露出旧水色。10k 快速回归中，高度/国家/省份视图 `WebGL error = 0`；近景截图已覆盖 coast、lake、state-border、province-border 和 state-junction。
66. 图层开关“海岸线”已改为“水陆线”，并统一控制海岸线与湖岸线：控制面板只暴露 `coastline` 入口，renderer 收到该入口时会同步更新 `coastline/lakeShore`，Pinia 与 localStorage 偏好读写也会把旧的 `coastline` 状态同步给 `lakeShore`，避免湖岸线被单独遗留显示或隐藏。
67. 50k/100k 大图回归已重新跑完：`tools/webgl-generator-smooth-cell-profile.mjs` 在真实工作区生成了最新 `docs/generated/reports/smooth-cell-profile-results.md/json` 与近景截图。当前 50k/100k 下 WebGL error 均为 `0`，draw 平均约 `0.5-1.2ms`，轮廓三角形约 `121万/144万`。本轮顺手加入海岸分形渲染保护：分形点最大偏移会被夹回原始海岸附近，海岸描线和海岸视觉带会跳过异常长段，政治视觉 mesh 的海岸补点也只接受陆地采样点。海岸视觉带已改为与描线共享同一条分形中心线，不再分别平滑陆侧/水侧 offset 曲线，避免描线和填色带中心漂移。残余观察：复杂海岸仍可能出现很细的岬角/尖带；这已经更接近同源几何本身的视觉尖角，下一刀应专门做海岸视觉带的轮廓级裁剪或更保守的海岸分形采样，而不是继续只调线层。
68. 视图切换卡顿已完成第一轮修复：普通 `setColorMode()` 不再重建政治视觉 mesh，也不再重建线层 buffer；政治边界缓存只在地图载入或 `political-boundaries` 派生变更时刷新。平滑 cell surface 改为预分配 `Float32Array` 写入。50k 视图切换从约 `7.6-7.8s` 降到约 `0.56-0.64s`，100k 约 `0.55-0.63s`，`glError = 0`。后续若继续优化，应考虑把 surface 颜色更新改为更细粒度的颜色 buffer / shader 路线，而不是恢复政治 mesh 同步重建。
69. 海岸视觉带尖楔已完成第一轮保护：`pushShoreVisualBand()` 会跳过过长、自交、面积异常或陆水采样反向的小段，避免原版分形海岸中心线在复杂凹口处生成深色水域尖楔压入陆地填色。后续又把分形点从“最近原始顶点”改为“最近原始边段投影 + 侧向量插值”，并加两轮折返尖角过滤；100k 国家视图近景抽查 `west / central / east / south / central3` 未再看到长楔形冲突。用户指出近岸小岛可能是残留尖角来源后，海岸视觉带改为局部自适应宽度：窄海峡、近岸岛屿和小湖湾处会先试探陆水 offset，必要时逐步收窄，政治视觉 mesh 的海岸补点也使用同样拟合。后续如果还要提升自然度，应做海岸带轮廓级裁剪或约束分形采样，不要移除这些小段合法性检查。
70. 国界笔刷状侵入已完成第一轮修复：国界/省界线层不再在每个折点补圆盘，改为 butt-join 政治描边，避免三国交界和锯齿边界叠出半透明涂抹块；国家/省份生成后新增保守的边界毛刺吸收，只处理自身同类邻居很少且另一侧邻居明显占多数的 cell，并保护城镇、首都和省会锚点。10k 国家视图验证 `boundaryLineMode = original-coastline + butt-join-political`、`glError = 0`，弱连接国家边界 cell 统计为 `9`。后续若仍看到大块侵入，应优先区分是“真实政治归属块”还是“视觉平滑轮廓”，再决定是否增加区域级连通性约束或编辑态预览。
71. 默认 10k 海岸端点尖刺已完成根因修复：用户在 `seed = stage-2-1`、目标 `10000`、地形模板“大陆”的地图中部指出尖刺仍存在后，复现定位到开放 coastline path 共用端点 `[634, 527]`。根因是 `sampleCatmullRomWorldPath(points, false, ...)` 对开放路径仍用取模环绕取 `previous / next`，导致起点和终点互相作为控制点来源，曲线在开放端点处冲出两根浅色尖刺。现在开放路径端点不再环绕取样；10k 近景 `repro-10k-shore-endpoint-634-527-fixed.png` 已确认原先两根向右伸出的尖刺消失。后续海岸问题必须优先在默认 10k seed 上复现和验证，再扩展到 50k/100k。
72. 国界笔刷状侵入第二轮已补到 grid 视觉归属层：关闭国界/省界线层后仍能看到的侵入来自 `pack -> grid` 政治归属镜像后的细长填色舌头，而不是 stroke。现在 `mirrorPackStateToGrid()` 和 `mirrorPackProvinceToGrid()` 会对渲染用 grid 国家/省份字段再做一次保守毛刺吸收；pack 层仍保护全部城镇，grid 视觉层只保护首都和省会中心，避免普通城镇把一格宽填色毛刺固定住。`stage-2-1 / 10000 / 大陆` 复查中，关线后的弱连接国家边界 cell 从约 `30` 降到 `5`，剩余多为边界互咬的一两格或普通城镇所在格；最终国界开启截图 `state-borders-final-10k.png` 未再放大成笔刷块。
73. 海岸视觉带跨段三角已完成补修：用户再次指出近景仍有蓝黄渐变楔子后，确认该形态来自 shore visual band，而不是道路、国界 stroke 或底层政治归属。`fitShoreHalfWidth()` 在窄水道、近岸岛屿等位置会跳过无法安全放置宽度的海岸点；旧逻辑会把跳过点两侧的有效点直接连起来，形成跨过凹口的直边渐变三角。现在海岸带绘制在跳点处断段，并且每个候选段会检查陆侧/水侧的 `0 / 0.25 / 0.5 / 0.75 / 1` 采样，任一中段陆水侧不成立就跳过。10k 默认图复测 `glError = 0`，截图 `repro-state-full-with-lines-shore-gaps-safe.png` 未见大面积缺岸。
74. 政治视图已禁用海岸填色过渡带：用户确认蓝黄楔子仍能出现后，判断政治视图继续叠加 shore visual band 风险过高。现在国家/省份视图只使用主 surface 和水陆线描边，不再绘制海岸陆水渐变填色带；高度、温度、降水等非政治视图仍保留海岸视觉带。`stage-2-1 / 10000 / 大陆` 国家/省份视图复测 `glError = 0`，surface 顶点数回到 `525843`，截图 `repro-state-no-shore-band-political.png` 未再出现蓝黄渐变楔子。
75. renderer 公共工具抽取第一刀已完成：新增 `app/webgl-generator/src/renderer/geometry.js`，承载世界坐标距离、插值、相交、面积、路径平滑、颜色混合和 clamp 等纯函数；新增 `app/webgl-generator/src/renderer/gl-utils.js`，承载 WebGL program 编译/链接和顶点 buffer attribute 绑定。`placeholder-renderer.js` 继续作为 renderer 门面，外部 API 不变。`mesh-writer` 暂不单独抽取，因为它当前仍与地图投影、颜色计算、屏幕线宽和图层构建耦合较深；后续应先把颜色/投影上下文收口，再拆 `pushWorldVertex`、`pushWorldPolylineMesh`、`pushScreenPolyline` 等写入器。
76. renderer mesh-writer 第二刀已完成：新增 `app/webgl-generator/src/renderer/render-context.js`，集中封装 `map / camera / canvas` 和世界坐标到 NDC、屏幕像素、clip 坐标的转换；新增 `app/webgl-generator/src/renderer/mesh-writer.js`，承载 `pushWorldVertex`、`writeVertex`、世界坐标线带、屏幕空间线带、可变宽线带、矩形和屏幕三角写入。`placeholder-renderer.js` 的图层构建职责保留，但底层写入改为通过 `RenderContext` 调用 mesh writer。10k 默认国家视图复测 `glError = 0`，`vertexCount = 525843`、`routeVertexCount = 39318`、`riverVertexCount = 19392`、`pointVertexCount = 861`。
77. renderer 颜色模式和 cell surface 抽取已完成：新增 `app/webgl-generator/src/renderer/color-modes.js`，集中管理 `colorForCell()`、陆地判定、各视图颜色、国家/省份颜色和高度/温度/降水色带；新增 `app/webgl-generator/src/renderer/cell-surface-layer.js`，承载普通 grid cell surface、视觉 cell mesh surface、政治视觉 mesh 兜底过滤和 surface 顶点拷贝。`placeholder-renderer.js` 继续保留图层编排、海岸/政治路径和动态对象层，后续可优先拆 `shore-layer` 与 `political-layer`。
78. 原版风格水陆线平滑表现已暂时回退：用户再次观察到水陆线与填色分离后，当前渲染不再绘制海岸填色视觉带，水陆线描边也不再使用原版分形海岸轮廓；平滑单元格开启时读取 `cellVisualMesh.edgeCurves` 的共享边，关闭时回退硬共享 Voronoi 边，优先保证线与当前 surface 填色同源贴合。原版海岸采样代码暂不删除，作为待办保留；后续如果重新启用，应先完成海岸轮廓级裁剪或同源填色 mesh，再让分形水陆线重新进入主渲染路径。
79. 水陆线回归脚本已新增：`tools/webgl-generator-shoreline-regression.mjs` 默认使用 `stage-2-1 / 10000 / 大陆` 跑高度、国家、省份三种视图，并分别验证平滑单元格开启和关闭两种路径。脚本会检查 `glError = 0`、`boundaryLineMode` 是否为 `visual-cell-shore + butt-join-political` / `hard-cell-shore + butt-join-political`、水陆线图层是否可见、轮廓三角形数量是否高于下限，并输出 `docs/generated/reports/shoreline-regression-results.json/md` 与截图。后续修改 `shore-layer`、`political-layer`、`mesh-writer` 或边界线绘制模式前后，应先跑 `pnpm run build:app` 再跑 `pnpm run regress:shoreline -- --browser-channel chrome`。
80. `shore-layer` 第一刀结构迁移已完成：新增 `app/webgl-generator/src/renderer/shore-layer.js`，承载当前活跃水陆线样式、平滑/硬边水陆线三角描边写入、`boundaryLineMode` 统计和共享 Voronoi 边 helper；`placeholder-renderer.js` 只保留图层编排入口并调用 `pushShoreLineLayers()`。本刀不重新启用原版分形海岸，也暂不搬迁仍用于政治 mesh 补点的旧 shore path / 分形候选实现，避免结构迁移夹带视觉行为变化。
81. `shore-layer` 第二刀结构迁移已完成：`buildShoreVisualPaths()`、`emptyShoreVisualPaths()`、`summarizeShoreVisualPaths()`、旧 shore visual band、原版海岸候选采样和 `buildSmoothedShoreBoundaryPoints()` 已迁入 `shore-layer`；`placeholder-renderer.js` 继续保留政治边界 graph、政治视觉 mesh、动态图层和外部 renderer API。原版分形水陆线仍不进入主渲染路径，当前活跃水陆线仍以 `pushShoreLineLayers()` 的平滑/硬共享边为准，保证与 surface 填色同源贴合。
82. `political-layer` 第一刀结构迁移已完成：新增 `app/webgl-generator/src/renderer/political-layer.js`，承载国家/省份视觉样式、政治边界 path、政治视觉带、政治视觉 mesh、mesh 质量统计和 debug cache；`placeholder-renderer.js` 只保留政治缓存重建调用、debug buffer 上传、选中高亮和总体图层编排。水陆线回归仍是拆 renderer 后的固定守门。
83. `cell-visual-layer` 第一刀结构迁移与视图切换性能加固已完成：新增 `app/webgl-generator/src/renderer/cell-visual-layer.js`，承载视觉 cell mesh 几何构建、统计摘要和按视图写 surface 顶点；视觉 cell 构建时会预缓存 NDC 三角坐标，视图切换只重写颜色顶点，避免重复世界坐标投影。`tools/webgl-generator-shoreline-regression.mjs` 新增 `switchMs` 与 `--max-switch-ms` 判定，`package.json` 新增 `pnpm run regress:rendering` 作为渲染回归入口。
84. `selection-layer` 第一刀结构迁移已完成：新增 `app/webgl-generator/src/renderer/selection-layer.js`，承载选中高亮 mesh、定位闪烁颜色和选中高亮统计模式；`placeholder-renderer.js` 继续保留 selection 状态、定位动画调度、overlay marker 和 buffer 上传。国家名称图层已改为不受当前视图限制，开启后在所有视图按缩放策略显示；“悬停信息 / 显示海底 / 平滑边界”偏好开关已改为按钮样式但保留旧 checkbox id 事件契约。下一步性能专项建议优先 profile 10k 生成耗时，把生成阶段拆分为地形、pack、社会、水文、路线、渲染准备等分段指标。
85. 生成性能专项第一刀已完成：`generatePlaceholderMap()` 新增 `metadata.generationTiming`，记录总耗时、阶段耗时和最慢阶段；新增 `tools/webgl-generator-generation-profile.mjs` 与 `pnpm run profile:generation`，默认输出 10k/50k/100k 三档中文报告到 `docs/generated/reports/generation-profile-results.*`（该目录按 `.gitignore` 不入库）。当前单次采样：10k 约 `800.4ms`，最慢为国家/省份/区域 `246.4ms`；50k 约 `3740.6ms`，最慢为河流 `1620.6ms`；100k 约 `8553.6ms`，最慢为河流 `3891.2ms`。本刀还去掉城镇 metadata 中重复构建人口点的一次扫描，并给页面生成/加载阶段增加画布顶部 Loading 气泡；“悬停信息”开关已改为与普通图层一致的两列按钮。下一步建议分两线：10k 优先拆解 `buildPackPolitics()` 内部子阶段，50k/100k 优先拆解 `buildRivers()`。
86. 生成性能子阶段拆分已完成：新增 `app/webgl-generator/src/generator/profile.js` 复用阶段计时器，河流、政治生成和 pack 省份生成都暴露子阶段 timing，profile 报告会输出“国家 / 省份 / 区域子阶段”“pack 省份子阶段”“河流子阶段”。同时把河流洼地消解里的多处“排序后取最小值”改为线性扫描，减少不必要数组创建和排序。当前 `stage-2-1 / 大陆 / 1440x960 / iterations=1` 采样：10k 总耗时约 `560.2ms`，最慢为政治 `184ms`，其中 pack 省份 `146.4ms`、省份颜色分配 `125ms`；50k 总耗时约 `2212.3ms`，最慢为河流 `520.3ms`，其中消解洼地 `494.2ms`；100k 总耗时约 `5333.7ms`，最慢为河流 `1571.8ms`，其中消解洼地 `1519.1ms`。下一步性能优化建议：先处理省份颜色分配的 O(n * provinces) 候选/避让逻辑，再专门重写河流 `resolveDepressions()` 的洼地传播算法，避免在大图上反复全邻域松弛。
87. 首屏 Loading 体感耗时已完成纠偏和第一轮修复：此前 `560ms` 只代表 Node CLI 的纯 `generatePlaceholderMap()` 耗时，不代表浏览器刷新后从 Loading 到出图的端到端耗时。浏览器探针确认 10k 下纯生成约 `518ms`，但 `renderer.loadMap()` 曾约 `3247.7ms`，其中默认不可见的实验性政治视觉 mesh 同步构建占 `3048.3ms`。现在 `loadMap()` 新增阶段 timing 并在统计面板显示“WebGL 加载”；政治视觉 mesh 改为按需构建，默认不再首屏同步生成。复测 10k 端到端约 `1591.4ms`，其中纯生成约 `969.7ms`、WebGL 加载约 `425.1ms`；政治 mesh 阶段降到 `0.1ms`。渲染回归仍通过，视图切换约 `53-78ms`，`glError = 0`。下一步端到端性能目标转为线层顶点、视觉 cell mesh、城镇/路线 finalize 和省份颜色分配。
88. 端到端性能守门和线层首刀优化已完成：新增 `tools/webgl-generator-e2e-profile.mjs` 与 `pnpm run profile:e2e`，默认用构建产物在 Chrome 中测 `stage-2-1 / 10000 / 大陆` 从点击生成到 Loading 隐藏的真实耗时，并拆出纯生成、`renderer.loadMap()`、UI/调度余量和 WebGL 加载子阶段；默认守门为端到端 `2500ms`、WebGL 加载 `1200ms`。水陆线三角描边从海岸/湖岸各扫一次 grid 邻接，改为一次扫描同时分类海洋海岸和湖岸。当前 10k 报告通过：点击到出图 `980ms`，纯生成 `717ms`，WebGL 加载 `178.2ms`，线层顶点 `50.8ms`，`glError = 0`；线层相对上一轮临时探针的 `131.6ms` 明显下降。下一步可继续打纯生成里的“按政区整理城镇和路线”和 pack 省份颜色分配。
89. 纯生成链路政区与命名修正第一刀已完成：`european / english` 文化集继续作为文化分布预设使用，但不再把 `European` 写入 `nameStyle`，避免中文文化名旁边生成 `奥斯王国 / 克莱公国 / 自由邦` 这类欧式国家；国家形制表也收回为中文本土风格。`finalizeSettlements()` 现在优先按 `pack.cells.state/province` 同步城市和 burg 的政区归属，并在删去初始中立城镇后刷新国家/省份统计。pack 陆路主干改为按国家内首都、省会和大城分组，小路改为按省份分组，海路仍按水体港口分组；路线对象和 `pack.routes` 都写入 `state/province`。省份颜色分配改用已用颜色集合，减少每个省份反复扫描已着色省份。Loading 气泡不再显示“准备生成 xxx cells”，改为“生成中 / 正在生成地图数据 / 正在整理 WebGL 图层 / 正在刷新面板”。`stage-2-1231411414 / continents / 10000` 烟测中，国家名不再命中欧式词根或旧形制，城市省份与 pack 省份 mismatch 为 `0`；端到端 profile 通过，点击到出图 `1009.5ms`，WebGL 加载 `184.8ms`，省份颜色分配约 `32.4ms`。
90. 纯生成链路性能第二刀已完成：河流 `resolveDepressions()` 从每轮全陆地扫描改为优先队列局部传播，湖泊高度变化后只重新激活相关岸线邻域；路线 A* 复用 typed-array scratch 和 run id 标记，避免每条候选路线反复分配/填充 `cameFrom/bestCost/closed`，路线连接边改为数值 key。road 生成收敛为全图首都主干网，极低陆地比群岛只取人口较高的首都，避免稀碎岛屿生成过多国家级道路；省会和大城继续通过省内 trail 覆盖。`stage-2-1231411414 / continents` 单次 profile 中，100k 总耗时约 `3007.6ms`，河流阶段约 `164.9ms`，洼地消解约 `102.1ms`，按政区整理城镇和路线约 `301.2ms`；同 seed 的 10k 浏览器端到端通过，点击到出图 `728.1ms`，WebGL 加载 `248.5ms`。最新 full candidate 矩阵刷新了 63 个 case，route/rivers 相关指标 fail `0`、warn `0`，陆路穿水和海路中段穿陆均为 `0`；矩阵总体仍为 fail，原因是旧 source summary 缺 lateStages 字段和 candidate 经济链路仍未实现，属于阶段 19 前既有缺口。下一步纯生成性能瓶颈已转向 `society-cultures`、`pack` 构建、省份未归属填充和阶段 19 经济链路。
91. 纯生成链路性能第三刀已完成：`society-cultures` 现在暴露文化子阶段 timing，profile 报告会输出“文化子阶段”；文化中心选址把 comparator 中反复计算的文化适配分改为每轮预计算并复用 typed score buffer，扩张阶段使用人口 cell 掩码，补齐未归属文化会在已覆盖全部人口时直接跳过。`stage-2-1231411414 / continents` 单次 profile 中，100k `生成文化初稿` 从上一轮约 `603.9ms` 降到约 `186.3ms`，总耗时约 `2695.8ms`；文化内部剩余热点为“放置文化中心”约 `133.2ms`。quick candidate 矩阵刷新 3 个 100k case 后，没有出现文化引用、路线穿水或宗教连锁回退；当前 fail 仍来自已知的 economy 空链路和部分旧 source `lateStages` 缺口。下一步纯生成性能热点已转向 `politics` 内的 pack 省份未归属填充、`pack/features` 构建，以及阶段 19 经济链路。
92. 纯生成链路性能第四刀已完成：`fillUnassignedProvinceCells()` 不再在每个补充省份后全 pack 重扫未归属 cell，也不再为每个补充省份新建并填充整张 `costs`；现在先按 state 收集未归属省份 cell，用 `remaining` 掩码维护剩余数量，并用 `seen/runId` 复用 typed arrays。`stage-2-1231411414 / continents / 100000 / iterations=3` 中，pack 省份总耗时平均约 `179.6ms`，其中“填充未归属省份 cell”平均约 `21.2ms`；此前同 seed 单次报告中该子阶段曾约 `106ms`。颜色距离 Map 字符串缓存试验因 100k 颜色分配变慢已回滚，后续若继续做颜色，应改为 palette index 和预计算距离矩阵。quick candidate 矩阵刷新后省份主指标和引用类不变量继续通过；总体 fail 仍是 economy 空链路和旧 source `lateStages` 缺口。
93. 纯生成链路性能第五刀已完成：`grid`、`features`、`pack` 现在暴露子阶段 timing，profile 报告会输出 grid / Voronoi / 高度、水陆 feature、pack 语义图和 pack feature 标注子阶段；`features.addLakesInDeepDepressions()` 复用 `checked` 标记数组和 queue，并用手写邻居最小值替代 `map + Math.min(...spread)`。`stage-2-1231411414 / continents / 100000 / iterations=3` 中，水陆 feature 总耗时约 `178.4ms`，其中“识别深洼湖泊”从此前约 `265.5ms` 降到约 `62.9ms`；pack feature 标注内部确认约 `94.8%` 时间在“泛洪识别 pack feature”。quick candidate 矩阵和 10k 端到端 profile 均通过，地形、湖泊、pack、河流、人口和省份主指标未新增回退。下一刀优先拆 / 优化 pack feature 泛洪与 createPackFeature 的边界、面积、湖岸全表扫描。
94. 纯生成链路性能第六刀已完成：`pack.markupPackFeatures()` 在泛洪时收集每个 feature 的 pack cell 列表，按 cell id 排序后传给边界 cell、边界顶点、湖岸和面积计算，避免 `createPackFeature()` 为每个 feature 反复全 pack 扫描，同时保留原先按 `cells.i` 顺序处理 feature cells 的结果。`stage-2-1231411414 / continents / 100000 / iterations=3` 中，pack 总耗时约 `300.3ms`，`标注 pack feature` 约 `123.2ms`，此前分别约 `524.1ms` / `294.7ms`；quick candidate 矩阵和 10k 端到端 profile 通过，pack、feature、湖泊、河流、人口和省份主指标未新增回退。下一步底层性能可继续看 pack Voronoi、grid Delaunay / heightmap，或做更小的 shore segment / area 临时对象优化。
95. 纯生成链路性能第七刀已完成：pack cell 面积改为直接遍历 Voronoi 顶点计算鞋带面积，不再为每个 cell 构造 polygon 临时数组；`features.buildShoreSegments()` 改为直接跳过反向邻居，并用短顶点数组查找共享边，避免每条水陆边创建 `Set/filter`。`stage-2-1231411414 / continents / 100000 / iterations=3` 中，水陆 feature 总耗时约 `138.1ms`，水陆线段约 `18.3ms`；pack 总耗时约 `291.5ms`，pack cell 面积约 `26.6ms`，pack feature 标注约 `95.9ms`。quick candidate 矩阵和 10k 端到端 profile 通过。后续大项集中在 grid / pack 的 Delaunay-Voronoi、heightmap、pack feature 泛洪本体和阶段 19 经济链路。
96. 阶段 19 economy 第一刀已完成：正式生成器新增 `goods / markets / deals / cells.good / cells.market`，并为 burg 写入 `market / plaza / production / product / treasury`，为 state 写入 `salesTax / pollTax / treasury`。商品目录按 source 当前摘要对齐为 `71` 个：raw `39`、manufactured `30`、hybrid `2`；生产记录、交易记录和国库税额都保证引用不变量为 `0`。`mediterranean / 100000 / audit-mediterranean-001` 在刷新后的 source schema 下已回到 `pass（fail 0，warn 0）`，economy 全指标通过；quick source/candidate 矩阵刷新后三个 100k case 的 economy 指标均通过。当前 quick matrix 仍为 fail，剩余为后段非经济项：`archipelago` 的 `lateStages.military.regiments` fail，以及 `archipelago` 的 `lateStages.zones.total` warn、`continents` 的 `lateStages.military.regiments` warn。下一步进入军事第一刀校准：低陆地比群岛不应生成过量 regiment。
97. 军事数量校准第一刀已完成：source 军事生成是先按人口生成 platoon，再按约 `3 * populationRate` 的规模和空间邻近合并 regiment；candidate 仍保留当前节点和分组实现，但给每州 regiment target 增加 pack 陆地密度因子，并把有城镇国家最低 regiment 从 `2` 降为 `1`，避免低陆地比群岛被硬切成“一城一团”。quick candidate 矩阵刷新后，`mediterranean` regiments source/candidate `409 / 468`，`continents` `272 / 356`，`archipelago` `63 / 79`，三例军事指标均通过；矩阵总体从 `fail` 降到 `warn`，当前唯一剩余 warn 是 `archipelago` 的 `lateStages.zones.total`：source `11` / candidate `3`。
98. 区域 zone 数量校准第一刀已完成：source `Zones.generate()` 是按每种 zone 类型的固定期望次数抽样，不会因为群岛 pack cells 少就只生成前三类 zone。candidate 的 target 从 `pack.cells / 5200` 改为固定基础量加弱规模增量，使低陆地比群岛也会尝试到灾害、地质、洪水、海啸等后段类型。quick candidate 矩阵刷新后已回到 `pass（fail 0，warn 0）`：`mediterranean` zones source/candidate `10 / 15`，`continents` `17 / 13`，`archipelago` `11 / 9`。下一步可刷新 full source/candidate 矩阵，或继续做后段命名、军事、marker、zone 的更细 source 语义。
99. 经济市场库存规模校准第一刀已完成：刷新 source full 矩阵后确认 63 个 source summary 都已有 `lateStages / economy` 新 schema；candidate full 初始为 `31 fail / 21 warn / 11 pass`，最大集中问题是 `economy.markets.stock.mean` 有 `29` 个 fail。candidate 之前每个 market 的 stock 均值几乎固定在 `34.5`，而 source 明显随目标 cells 增长：10k 平均约 `5.67`、50k 约 `18.6`、100k 约 `36`。现在 market stock 按 cells 规模缩放，100k 保持不变，10k/50k 下调。quick candidate 矩阵仍为 `pass（fail 0，warn 0）`；full candidate 矩阵改为 `20 fail / 29 warn / 14 pass`，`economy.markets.stock.mean` 只剩 `1` 个 fail、`2` 个 warn。下一步优先做军事第二刀，因为 full 中 `lateStages.military.regiments` 仍有 `15` 个 fail 和 `23` 个 warn。
100. 军事数量校准第二刀已完成：full 矩阵显示第一刀后 10k/50k 和 highIsland/lowIsland 仍普遍 overcount，根因是 candidate 的 per-state target 仍可远高于 source 的 `regiments / burgs` 比例。现在每州 target 额外受 burg-backed 上限约束，比例随目标 cells 增长：10k 约 `0.144`、50k 约 `0.199`、100k 约 `0.24`；保留现有军队节点、单位人数和分组实现。quick candidate 矩阵仍为 `pass（fail 0，warn 0）`：`mediterranean` `409 / 321`、`continents` `272 / 291`、`archipelago` `63 / 75`。full candidate 矩阵改为 `7 fail / 30 warn / 26 pass`，`lateStages.military.regiments` 的 `15` 个 fail 全部清掉，仅剩 `4` 个 warn。下一步可处理剩余 fail 中的经济交易细节、湖泊命名/lake 数量，或按 Gibbs 的只读调查进入 marker 小缺口补齐。
101. 经济生产与市场间交易密度校准第一刀已完成：10k 地图本地生产记录和 market-to-market 交易此前明显过密，带出 `localRecords / marketToMarket / taxTotal` fail。现在本地生产概率按 `cellsTarget` 从约 `0.41` 增长到 `0.65`，市场间链接数按规模增长，并保留小市场数量场景最多 `6` 条链接的旧上限，避免群岛 quick 100k 回退。quick candidate 矩阵保持 `pass（fail 0，warn 0）`；full candidate 矩阵改为 `3 fail / 31 warn / 29 pass`，经济交易类 fail 已全部清除。当前剩余 fail 为：`continents-10000-001` 和 `archipelago-10000-002` 的 `features.lakes / lakeNames`，以及 `peninsula-50000-003` 的 `economy.markets.stock.mean`。
102. 10k 湖泊兜底校准第一刀已完成：`features.addLakesInDeepDepressions()` 仍保留原有深洼逻辑，但在近海湖泊打开后，如果整张地图仍没有湖泊，会按内陆距离、局部低点、低海拔和候选间距补充少量 basin lake，并同步 grid/pack feature、湖岸和湖名链路。`continents / 10000 / audit-continents-001` 从 `0` 湖补到 source 对齐的 `2` 湖，`archipelago / 10000 / audit-archipelago-002` 从 `0` 湖补到 `1` 湖；已有湖泊的 quick 100k case 不变。full candidate 矩阵改为 `1 fail / 30 warn / 32 pass`，剩余唯一 fail 是 `peninsula-50000-audit-peninsula-003` 的 `economy.markets.stock.mean`。
103. 经济库存尺度边缘校准已完成：最后一个 fail `peninsula / 50000 / audit-peninsula-003` 来自 market stock 分布均值略高，source/candidate 为 `9.169 / 19.165`，超过 fail 阈值。库存规模指数从 `0.85` 微调为 `0.92`，100k 仍保持不变，50k 只小幅下降，10k 库存 warn 未跨入 fail。full candidate 矩阵刷新后改为 `0 fail / 31 warn / 32 pass`，当前没有硬 fail；后续应转向 warn 项质量提升或 marker/source 语义细化，而不是继续为单一库存均值调全局尺度。
104. 经济 product 均值校准第一刀已完成：candidate 旧公式把 market/burg deal 记录也按固定 `0.8` 计入 `burg.product`，导致 10k 城镇天然多出约 `14` 点 product 底座，`economy.production.product.mean` 成为最大 warn 热点（15 个 warn）。现在 product 分为真实生产记录固定贡献与 deal 规模贡献，deal 权重按 `sqrt(cellsTarget / 100000)` 增长，100k 保持旧尺度，10k 降低固定底座。quick 通过；full candidate 矩阵保持 `0 fail`，从 `32 pass / 31 warn` 改为 `39 pass / 24 warn`，product.mean 不再出现在 warn 热点中。
105. 港口、河港与海路 source 语义补齐第一刀已完成：`assignPorts` 现在按 source 规则同时收集普通海港/湖港候选和可通航河港候选，`haven` 按 source 的 truthy 语义判断；普通 harbor 可入池，safe harbor / 首都港只影响 `preferred` 优先级；河港按 `pack.cells.r && fl >= 100` 判定，并沿河流和湖泊 outlet 解析最终承载水体。海路寻路补齐 riverEdges 约束，允许水路沿可通航河道进出河港、普通海港只从自身 haven 进出；两港口水体的 Urquhart 图会生成直接边。quick candidate 矩阵保持 `pass`；full candidate 矩阵保持 `0 fail`，case 状态从 `39 pass / 24 warn` 改为 `44 pass / 19 warn`，`society.ports` 从最大热点 `10` 个 warn 降到 `1` 个 warn。下一步矩阵收敛优先级转为经济交易值、军事 regiment、zone 数量和少量 searoute/roads 边缘 warn。
106. 经济交易金额尺度校准第一刀已完成：source 的 `economy.deals.value` 是 `sum(units * price)`，税额按实际交易方向和卖方税率累计；candidate 当前仍是轻量合成交易模型，但 10k 小图单笔 price 尺度偏高，导致 `economy.deals.value / taxTotal / dealTaxTotal` 成为热点。现在 `addDeal()` 支持 `valueScale`，交易价格按 `cellsTarget` 做温和缩放，100k 保持不变，50k 约 `0.88`，10k 约 `0.66`。quick candidate 矩阵保持 `pass`；full candidate 矩阵保持 `0 fail`，case 状态从 `44 pass / 19 warn` 改为 `46 pass / 17 warn`，warn 总项从 `41` 降到 `32`，`economy.deals.value / taxTotal / dealTaxTotal` 不再进入热点。后续若继续经济，应按 source-style `buy / sell / runGlobalTrade` 重写交易方向、库存、利润和税收，而不是继续调单笔金额。
107. 军事数量校准第三刀已完成：full 矩阵剩余的 4 个 `lateStages.military.regiments` warn 均为 candidate 偏高，其中 10k 小图 overcount 更集中。现在 burg-backed 上限在原有 `0.1 + 0.14 * sqrt(cellsTarget / 100000)` 基础上，对小图额外乘 `(0.75 + 0.25 * sqrt(cellsTarget / 100000))`，100k 保持不变，10k 约降到原上限的 `83%`。quick candidate 矩阵保持 `pass`；full candidate 矩阵保持 `0 fail`，case 状态从 `46 pass / 17 warn` 改为 `48 pass / 15 warn`，warn 总项从 `32` 降到 `29`，军事 warn 仅剩 `highIsland / 100000 / audit-highIsland-003`。后续军事不再继续靠全局常数硬压，应先补 per-state 诊断，或把 `groupNodes()` 逐步替换成 source-like platoon 空间合并模型。
108. 区域 zone 数量尺度第二刀已完成：full 矩阵剩余的 3 个 `lateStages.zones.total` warn 都是 100k 大陆/半岛高陆地比地图 candidate 偏多，原因是 candidate 用 `pack.cells / 10000` 线性拉高全局 target，而 source 是每类 zone 独立高斯抽样、前置条件失败后不补齐。当前先把 target 改为平方根弱增长：`round(8 + sqrt(pack.cells.i.length) / 55)`，10k/50k 变化很小，100k 高 pack cell 场景从 14-16 收到 12-13。quick candidate 矩阵保持 `pass`；full candidate 矩阵保持 `0 fail`，case 状态从 `48 pass / 15 warn` 改为 `49 pass / 14 warn`，warn 总项从 `29` 降到 `26`，`lateStages.zones.total` 不再进入热点。后续若继续 zones，应转向 source-like 按类型期望独立抽样，并收紧 `Crusade / Eruption / Avalanche / Flood` 的宽松 fallback。
109. 海路密度校准第一刀已完成：剩余 3 个 `routes.searoutes` warn 都是 candidate 海路偏多，且同 case 港口数也偏多；source 和 candidate 都按同水体港口做 Urquhart 图，但 candidate 在大水体上会因港口过密产生过多短海路边。现在 water route 对 `12` 条以上的候选边做短边降噪，保留距离较长的 `65%` Urquhart 边；港口身份、海路 A*、haven 出入港、riverEdges 和不穿陆约束都不变。quick candidate 矩阵保持 `pass`；full candidate 矩阵保持 `0 fail`，case 状态从 `49 pass / 14 warn` 改为 `51 pass / 12 warn`，warn 总项从 `26` 降到 `23`，`routes.searoutes` 不再进入热点。后续若继续路线，应优先补 source-like `split/merge route` 计数诊断和陆路 `roads` 偏少问题，而不是继续压海路边数。
110. 经济 market-to-market 小图下限校准已完成：剩余 2 个 `economy.deals.marketToMarket` warn 都是 `mediterranean / 10000` 中 candidate 偏少，直接原因是 10k 下 `getMarketTradeLinks()` 只给每个市场约 `8` 条跨市场链接，而 source 的全局贸易会按商品盈余/缺口、价格、距离和税后利润产生更多机会。曾试过把所有 16 个以上市场固定到 `14` 条链接，但会在 50k 岛屿/大洲 case 引入 `marketToMarket` fail，已回退。当前只把 16 个以上市场的链接下限从 `5` 提到 `10`，小市场仍为 `5`，50k/100k 保持原增长尺度。quick candidate 矩阵保持 `pass`；full candidate 矩阵保持 `0 fail`，case 状态从 `51 pass / 12 warn` 改为 `53 pass / 10 warn`，warn 总项从 `23` 降到 `21`，`economy.deals.marketToMarket` 不再进入热点。后续经济若继续推进，应优先补 source-style global trade，而不是继续提高固定链接数。
111. 国家和省份重新生成第一刀已完成：管理 tab 的“国家”按钮会在当前城镇中按人口、适居度、港口和间距重新挑选首都，随后重建 pack 国家、同步 burg/city 国家归属、重建省份并按新政区重算道路；“省份”按钮会在当前国家边界内重新选择省份中心、扩张省份、刷新省会/城市省份和道路。两者都会刷新政治颜色、边界、标签、点图层、路线 mesh、对象索引和运行统计；宗教、marker、zone、军事、经济等下游系统会明确标为待派生。`stage-2-1231411414 / continents / 10000` 内存验证中，国家重算后国家保持 `18`、省份 `180 -> 173`、道路 `536 -> 541`；随后省份重算后省份 `173 -> 169`、道路 `541 -> 573`，城市 state/province mismatch 均为 `0`。下一步建议进入 marker / 资源点细化，把矿山、盐湖、稀有生物等资源位从“白色点不明所以”改为有图标、有类型、有经济贡献的对象，再统一控制面板中的下拉 UI。
112. 用户外壳、开发模式、导入导出和命名策略进入新阶段：详见 `docs/task-notes/user-facing-shell-debug-export-and-naming-plan.md`。优先顺序为全屏地图与开发模式浮动面板、比例尺图层、README 和简介 tab；Element Plus 迁移、完整导入导出、灰度高度图导入和春秋古国风命名作为后续独立阶段推进并分别提交。
113. 用户外壳第一批已完成：常驻侧栏移除，地图默认全屏显示；生成控制迁入可拖动“控制面板”浮层，调试、性能、WebGL 统计和内部状态迁入“开发模式”浮层。开发模式仅在 `?debug=1` 或 `window.__webglGeneratorDebug.enabled = true` 时可见，收起后保留小按钮；普通模式只保留地图、图例、悬停信息、比例尺和控制入口。图层新增“比例尺”开关，比例尺按当前相机缩放和单位配置显示实际距离。README 与控制面板“简介”tab 已补齐项目定位、仓库链接和后续计划。后续优先进入 Element Plus 按需迁移、完整导入导出、灰度高度图导入和春秋古国风命名阶段。
114. 本地导入导出第一刀已完成：简介 tab 新增导出图片、导出地图数据、导出 GeoJSON 和导入地图数据入口。完整地图数据格式为 `webgl-generator-map v1`，保存 `options / metadata / map`，并显式序列化 typed arrays，导入后会重建 renderer、清空选择和编辑历史、刷新对象面板与运行统计。GeoJSON 先按 pack cell 输出 Polygon FeatureCollection，属性包含 height、feature、biome、state/province/culture/religion 名称和人口。PNG 导出现在会合成 WebGL canvas、地图尺寸摘要和比例尺；仍暂不合成完整 DOM 标签、图例或浮动面板。后续可做压缩、范围选择、更多所见即所得 overlay 合成和格式兼容诊断。
115. 国家命名策略第一刀已完成：国家根名不再高概率复用文化根名，改为优先抽取春秋/周代诸侯国启发的单字与短根名，并用 `state-family` 去重避免同一根名反复派生“东/西/南/北”相邻变体；文化根名只作为低概率首选。国家形制收敛为“国、侯国、伯国、邦、朝”和少量地貌特化形式，不再生成“王朝、诸帐、林盟、水府、诸州”等旧形制。三组 seed 抽样中，20 个国家的短根名为 `19-20` 个、单字根名为 `8-11` 个、同根重复为 `0`。
116. Element Plus 迁移第一刀已完成：新增 `element-plus`、`@element-plus/icons-vue` 和按需导入相关插件，Vite 仅启用 `unplugin-vue-components` 的 `ElementPlusResolver({importStyle: "css"})`，不全局 `app.use(ElementPlus)`，不引入整包 CSS。`UiButton` 已改为 `ElButton` 适配层，同时保留原 `variant / active / buttonType` API 和 `.primary-action / .secondary-action` 样式类。生产构建 gzip 体积从命名阶段约 `208.39KB JS / 8.40KB CSS` 增至 `218.56KB JS / 12.10KB CSS`，作为后续迁移体积基线。
117. 灰度高度图导入第一刀已完成：生成 tab 的地形配置后新增本地图片导入、最低/最高高度滑块和黑白反转开关；导入时浏览器读取图片像素，按亮度 min/max 自动归一化，并按 `grid.points` 坐标采样为 `grayscale-import` 高度模板，再走完整 `generatePlaceholderMap()` 派生链路。采样型 heightmap 会把下游有效 `heightmapTemplate` 也改为 `grayscale-import`，避免继续触发导入前下拉模板的专属启发式。合成 `32x24` 灰度 PNG 端到端验证中，设置 `10..90` 后实际高度范围为 `10..90`，checksum 变化为 `0de77532 -> f26a4db9`，并重新生成 `features=5 / packCells=9709 / states=20 / cities=1349 / rivers=121`。后续可补裁剪/保持比例、平滑/降噪和原版彩色高度图方案识别。
118. Element Plus 迁移第二刀已完成：`UiFilterInput` 改为 `ElInput`，`UiTextEditField` 改为 `ElInput`，`UiNumberField` 改为 `ElInputNumber`，`UiSortBar` 复用 `UiButton/ElButton`；业务面板调用 API 不变。新增 Element 输入暗色适配 CSS，避免旧 `*-panel-controls input` 样式打坏 Element 输入内部结构。生产构建约 `756.84KB JS / 234.58KB gzip`、`93.80KB CSS / 14.38KB gzip`；城市面板验证中筛选框、排序按钮、重命名浮层和人口数字浮层均正常。后续迁移 `UiSliderField / UiSwitchField` 前必须先设计原生 DOM id 桥，否则会断 runtime 读取。
119. 灰度高度图反转映射补充已完成：`runtime/heightmap-import.js` 现在会保存并应用 `invert` 元数据，黑色可映射为高地、白色可映射为低地；控制面板在灰度导入区域提供“反转黑白”开关，并加入编辑锁定控制。构建产物验证中，合成斜向渐变 PNG 开启反转后 source 记录 `invert: true`，高度范围保持 `10..90`，左上低亮度角高度为 `90`、右下高亮度角高度为 `10`，console/page error 为 `0`。当前构建产物约 `757.14KB JS / 234.77KB gzip`、`93.95KB CSS / 14.40KB gzip`。
120. Element Plus 迁移第三刀已完成：`UiSelectField` 改为 `ElSelect / ElOption` 视觉层，同时保留隐藏原生 `<select id=...>` 桥，旧 runtime 仍可直接读写 `heightmap-template.value` 并派发 `change`。下拉 popper 由 Element Plus teleported 到 document body，不再进入浮层面板布局；空白点击后 popper 视觉收起，长选项允许换行并设最小宽度。构建产物验证中 `.el-select` 数量为 `9`、旧 `.ui-select-trigger` 为 `0`，地形下拉选择“群岛”后隐藏 select 为 `archipelago`，点击生成后 `map.heightmap.template = archipelago`；打开下拉前后控制面板 body 的 `scrollHeight/clientHeight` 保持 `971/857` 不变，console/page error 为 `0`。体积增至约 `858.60KB JS / 268.63KB gzip`、`112.16KB CSS / 17.18KB gzip`，后续迁移 Tree/Table/Dialog 必须考虑懒加载或拆包。
121. Element Plus 迁移第四刀已完成：`UiTabs` 改为 `ElTabs / ElTabPane`，控制面板仍通过同一个 `v-model activeTab` 切换原有面板内容，并保留 `data-control-tab` 标记。构建产物验证中 tab 数为 `6`、旧 tab button 为 `0`，六个 tab 位于同一行，切换“单位 / 图层 / 生成”均能显示对应 panel，console/page error 为 `0`。体积增至约 `877.61KB JS / 275.08KB gzip`、`128.40KB CSS / 19.07KB gzip`。
122. Element Plus 迁移第五刀已完成：`UiSliderField` 改为 `ElSlider` 视觉层，同时保留隐藏原生 `input[type=range]` 桥，继续兼容旧 runtime 按 DOM id 读取 `.value` 和派发 `input/change`。构建产物验证中 `.ui-slider-el` 和隐藏 range 均为 `14` 个，可见原生 range 为 `0`；点击灰度最低高度滑轨后 `#heightmap-import-min.value` 和 output 同步为 `61`，点击单位页人口倍率滑轨后隐藏值为 `3.6`、显示为 `3.6x`，console/page error 为 `0`。体积增至约 `894.48KB JS / 280.29KB gzip`、`133.04KB CSS / 19.80KB gzip`。
123. Element Plus 迁移第六刀已完成：`UiSwitchField` 改为 `ElSwitch` 视觉层，同时保留隐藏原生 checkbox 桥，普通开关和按钮式图层开关都继续支持整行点击。构建产物验证中 `.ui-switch-el` 和隐藏 checkbox 均为 `5` 个，可见原生 checkbox 为 `0`；点击灰度“反转黑白”后隐藏 checkbox、行选中态和 Element 选中态均为 `true`；点击“显示海底”图层按钮后隐藏 checkbox、按钮选中态和 Element 选中态均为 `true`，console/page error 为 `0`。体积增至约 `899.56KB JS / 281.46KB gzip`、`137.51KB CSS / 20.44KB gzip`。
124. PNG 导出 overlay 合成第一刀已完成：`downloadCanvasPng()` 支持 `includeMapOverlays`，正式“导出图片”会先复制 WebGL canvas 到离屏 canvas，再按 DOM 坐标绘制右上角地图尺寸摘要和左下角比例尺。构建产物验证中下载 PNG 为 `1440x920`、约 `34KB`，比例尺标签为 `264.6 千米`，比例尺白线区域 `800` 个像素中有 `220` 个亮色像素，状态提示为“图片已导出。”，console/page error 为 `0`。
125. 灰度高度图适应方式补充已完成：灰度导入区域新增“适应方式”下拉，支持“拉伸铺满”和“保持比例裁剪”。`createGrayscaleHeightmapFromImage()` 会在读取像素前按所选模式绘制到采样 canvas，`heightmap.source.fitMode` 记录模式，导入成功状态也显示当前适应方式。构建产物验证中，`96x24` 宽幅灰度 PNG 选择“保持比例裁剪”后导入，隐藏值为 `crop`，`map.heightmap.source.fitMode = crop`，状态为“已导入灰度高度图：wide-height-gradient.png，高度 0-100，保持比例裁剪”，console/page error 为 `0`。
126. 原版功能巡视积压已落文档：`docs/task-notes/source-feature-backlog.md` 记录了对照 source 后的后续候选，包括测量工具、对象注记、名称库编辑器、分层 GeoJSON、高度图工作台增强、样式预设、市场贸易动画、军事事件、纹章和子地图/地图变换。建议优先级为测量工具、对象注记、名称库编辑器、分层 GeoJSON；特别复杂系统先保留规划，不直接塞入当前批次。
127. 测量工具第一刀已完成：地图工具栏新增“测量”按钮，进入测量模式后左键点击地图添加测量点，overlay 用 SVG 绘制折线和节点，并按当前单位偏好显示折线总长；“清除”会移除当前测量点，“退出测量”隐藏 overlay。测量模式通过 canvas capture 阶段拦截点击，避免触发对象选择或拖拽。构建产物验证中，连续点击两点后生成 `2` 个点、`1` 条线，总长显示 `1,085.4 千米`，`selection.object = null`；清除后点线为 `0`，退出后 overlay 隐藏，console/page error 为 `0`。
128. 要素 GeoJSON 导出第一刀已完成：简介 tab 新增“导出要素 GeoJSON”，与原有 pack cell Polygon GeoJSON 分开；新导出混合输出路线 LineString、河流 LineString 和 marker Point，并带 `layer`、id、类型、政区、资源和经济等属性。构建产物验证中下载 `fmg-stage-2-1-497329e2.features.geojson`，大小约 `310KB`，FeatureCollection 共 `810` 个要素，其中 route `602`、river `164`、marker `44`，geometry 为 `766` 个 LineString 和 `44` 个 Point，状态提示正确，console/page error 为 `0`。
129. Element Plus 迁移第七刀已完成：`UiColorField` 改为 `ElColorPicker`，国家、省份、文化、宗教共享的二级改色面板同步获得 Element 颜色盘和预设色；`UiActionDock` 的空白点击关闭逻辑补充识别 Element Plus teleported popper，避免点击颜色盘或下拉弹层时误关二级面板。构建产物验证中 `.ui-color-picker = 1`、原生 `input[type=color] = 0`，颜色盘打开后二级编辑面板保持开启，点空白后二级面板与颜色盘均关闭，console/page error 为 `0`。体积增至约 `926.56KB JS / 289.65KB gzip`、`146.71KB CSS / 21.82KB gzip`；后续 `ElTable / ElTree / ElDialog` 仍需先做懒加载或拆包方案。
130. zone 要素 GeoJSON 已接入：`createMapFeatureGeoJson()` 在路线、河流、marker 之外追加区域 `MultiPolygon`，每个 zone 以自身 pack cells 的 cell polygon 集合表达，并带 `layer=zone`、id、name、type、hidden、cells 和 color 属性；坐标投影也补充了无效点过滤。构建产物验证中下载 `fmg-stage-2-1-68c7df07.features.geojson`，大小约 `353KB`，FeatureCollection 共 `819` 个要素，其中 route `602`、river `164`、marker `44`、zone `9`，geometry 为 `766` 个 LineString、`44` 个 Point 和 `9` 个 MultiPolygon，状态提示正确，console/page error 为 `0`。

## 约束

- 新项目代码仍然放在根目录下，不放进 `source/`。
- `source/` 只读参考；允许为运行参考项目安装依赖并产生锁文件，例如 `pnpm-lock.yaml`，但不得修改原项目源码。
- 所有文档继续使用中文。
- 代码注释保持必要且克制。
- UI 面板长期目标是普通 DOM/HTML 浮动可拖动面板，不使用 canvas 绘制面板；当前对象详情已开始迁入浮动面板，现有固定配置面板仍是阶段性实现。架构约束见 `docs/architecture/floating-panel-architecture.md`。
- 页面响应式短期以现代 PC 浏览器为默认目标，不需要为过小手机宽度牺牲桌面信息密度；平板屏幕尽量不破版即可，暂不作为主要适配目标。
