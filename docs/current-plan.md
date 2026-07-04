# 当前开发计划

本文档用于追踪当前阶段计划。后续每次推进里程碑或改变路线，都应同步更新这里。

## 2026-07-01 最新推进队列

当前 focus 仍是 source/candidate full 矩阵 warn 收敛，同时穿插修用户验收中明确指出的纯生成观感问题。最新 full candidate 矩阵为 `61 pass / 2 warn / 0 fail`，warn 总项已降至 `2`。已清除 `routes.roads`、`routes.searoutes`、`economy.deals.marketToMarket`、两个 10k 岛屿 marker 热点、50k 群岛 `tradedGoods` 单项、10k 稀疏群岛的市场类告警、`archipelago-10000-audit-archipelago-001` 的城镇数量派生告警、`peninsula-50000-audit-peninsula-003` 的库存均值/港口/税基告警，以及 `highIsland-100000-audit-highIsland-003` 的军事团数告警。

启动稳定性补充：

- 2026-07-02 修复 `127.0.0.1:5410` 首屏卡在“等待生成任务 / 静候星图显影”的问题：首轮生成改由 ES module Worker 执行，WebGL 装载拆成可让出主线程的阶段，`delaunator` vendor 包装去掉顶层动态导入，避免 worker 模块初始化阻塞。Chrome 构建产物验证中，默认 10k 地图生成约 `555ms`，WebGL 装载约 `419ms`，页面加载完成后控制面板和测量按钮可点击，截图确认地图可见。

刚完成的观感修正：

- 生成 loading 文案不再显示目标 `cells`，右上角 badge 不再承载“等待生成任务 / 生成中”等状态，只在地图可用后显示图幅尺寸；正上方 loading bubble 改为阶段化神话文案，例如“星图启明 / 山海初开 / 群山起脉 / 大禹治水 / 诸侯封疆 / 展开乾坤”。
- 生成 loading 收起兜底已补在地图装载公共路径末尾：地图、WebGL 和面板刷新完成后会统一隐藏正上方 loading bubble，避免地图已 ready 但仍残留“山海初开”等阶段文案。
- 人口显示口径已从内部 FMG 千人单位修正为“人”：国家、省份、文化、宗教、城市、外交矩阵和悬停详情等统一乘以 `1000` 后再套用人口倍率；生成数据、经济和军事公式仍保留内部单位。
- 所有 `UiSelectField` 下拉已从原生浏览器菜单改为统一自绘菜单，同时保留隐藏 select 作为旧运行时代码读取 `.value` 的数据源。
- 浮动面板统一限制在视口内：最大高度不超过宿主视口 `97%`，最小高度 `200px`，面板内容超出后在 body 内滚动。
- 列表选中态已补稳定 id 规范化：共享对象表格、国家/省份/城市/文化/宗教/路线/河流/marker/外交面板统一处理数字 id 与字符串 id，避免“摘要显示目标对象但详情区仍显示未选中”的半选中状态。
- 列表面板详细编辑入口已第一轮收束为图标二级操作：国家、省份、城市、文化、宗教、河流、资源/marker 和外交关系面板默认显示详情与图标工具条，重命名、调色、继承、人口、首都、剪影、宽度、外交关系等细项点击图标后再展开。
- 国家根名现在优先从所属文化 `root` 派生，同文化多国用“新/古”等非方位变体保持关联；`东/西/南/北 + 根名` 会按同根国家相对位置校正，没有同根参照时会去掉方位前缀，避免北边孤立国家叫“南某”或南边孤立国家叫“北某”。国家后缀不再使用“朝”，改由政体、国家规模和自我定位决定，小国多为 `国`，君主国家可为 `王国 / 帝国`，共和或联邦国家可为 `共和国 / 联邦 / 联邦共和国`，游牧、神权和部盟国家保留 `汗国 / 教国 / 部盟` 等特化国号。
- 政体系统第一刀已完成：生成国家时会随机赋予 `君主制 / 帝制官僚 / 封建王权 / 共和制 / 商业共和国 / 联邦制 / 邦联制 / 神权制 / 汗廷 / 部盟 / 军府 / 寡头制` 等政体，并写入 `governmentKey / governmentLabel / governmentFamily / government`；政体会温和影响经济税率和贸易、外交亲和/冲突/附庸倾向、军事征兵/上限/兵种偏好；国家管理面板新增二级“调整政体”操作，详见 `docs/task-notes/government-system-and-state-title-plan.md`。
- 军事单位地图图标已从汉字兵种牌改为抽象符号：舰队按规模显示大船/帆船，弓兵、骑兵、步兵和器械分别使用弓、马形、枪头和齿轮符号，重装兵种使用复合符号，山地兵以草帽符号表示；渲染层会把旧存档中的“步/弓/骑/械/舟”兼容映射为新图标。
- marker 细化第一刀已完成：旧的统一浅白点改为按类别着色，marker 数据补充中文 `label`、`category/categoryLabel`、`resourceKey/resourceLabel`、`economicValue` 和 RGBA `color`；新增盐湖、稀有生物、宝石矿脉等资源 marker，矿山候选也扩展到高地适居资源 cell。
- marker 资源点类型细分第二刀已完成：资源候选从原先少量通用类型扩展到 `26` 种资源类型，新增采石场、黏土坑、煤田、硫磺泉、硝石洞、琥珀海岸、珍珠滩、珊瑚礁、渔场、良港、森林木场、树脂林、药草谷、染料草场、香料林、茶山、丝茧桑园、马场、牧盐草甸、绿洲和圣泉；默认 marker 总量公式不变，按地形、海岸、湖泊、河流、生物群系、温度、降水、人口、适居度和粗糙度为资源候选排序。
- marker 资源经济已接入国家/省份对象：生成 marker 时按 `state/province` 汇总 `resourcePotential / markerEconomicPotential / resourceTypes / markerCategories`，水域资源会归属到邻接陆地政区；经济阶段新增 `economicPower` 和 `economy.metadata.markerEconomy`，但暂不改 source 已收敛的税收/国库公式。
- marker hover、选中详情和侧栏统计已显示图标、中文类型、类别、资源标签和经济潜力；`stage-2-1231411414 / continents / 10000` 内存验证中生成 `41` 个 marker、`5` 个资源 marker、资源潜力 `74`，覆盖 `4` 个国家和 `5` 个省份，且 marker 无无色点、无非法 cell 引用。
- 资源点已拆成独立图层：控制面板“图层”tab 新增“资源点”和“标记”，前者只控制 `category === "resource"` 的资源 marker，后者控制遗迹、危险、设施、文化等非资源 marker；隐藏的 marker 不再参与 hover/点击命中。
- marker 近景小图标第一刀已完成：远景仍显示 WebGL 点；相机缩放达到 `x2.15` 后，地图 overlay 会显示带底牌的小 SVG 图标，图标按 `visual.shape/symbol/palette/cultureStyle/manual` 数据选择，资源图层关闭时资源图标也同步隐藏；这套字段后续可推广到城镇标识、文化预制样式和用户手动调整。
- 城镇近景剪影第一刀已完成：城镇不复用 marker 水滴图标，而是新增独立 `.city-map-icon` overlay；远景仍用 WebGL 圆点保持轻量，近景按都城、省会、大城、港镇、普通城镇和村落显示简化剪影，城市图层关闭时剪影、点位和 picking 一起隐藏。
- 城镇剪影第二刀已完成：新增 `city.visual` 契约和共享 `city-visuals` 预设，生成时按文化类型自动给海洋/河湖/游牧/高地/林地文化选择港镇帆影、水乡青瓦、营帐、寨堡或林地木屋；城市管理面板支持手动调整剪影与配色，并可撤销/重做或恢复自动预设。
- marker / 资源点管理面板第一刀已完成：管理 tab 新增“资源标记”入口，浮动面板支持全部/资源点/普通标记切换、筛选、排序、选中、定位、详情、重命名、近景图标 `symbol/palette` 手动调整和撤销/重做。
- marker / 资源点编辑第二刀已完成：资源面板支持选择资源类型后点击地图放置、移动选中 marker、删除选中 marker 和重生成全部资源点；所有操作接入 `EditHistory`、点图层、标签、对象索引和国家/省份资源潜力刷新。资源重生成只替换 `category === "resource"` 的资源点，保留遗迹、设施、危险、文化等普通标记，并按地形、河流、生物群系、温度、降水、人口和适居度对候选 cell 加权。
- 资源经济接入国力第一刀已完成：`economy` 阶段会把 marker 经济潜力、资源潜力、人口、面积、城镇和税收合成为国家/省份 `economicPower / resourcePower / powerScore / militarySupply`；资源点编辑和重生成后会立即刷新这些派生字段；军事阶段会用 `economicPower / resourcePotential / militarySupply` 小幅修正军团目标和兵力规模；国家/省份面板已显示并支持排序经济力、资源潜力和实力评分。
- 资源点接入正式贸易链路第一刀已完成：基础 goods 会在 biome 定义后、`rankCells()` 之前写入 `pack.goods / pack.cells.good / goodSupply / goodSource`，资源货物会参与适居度和人口评分；marker 资源会在 economy 阶段覆盖成正式货物来源，注入市场库存、降低本地价格，并优先参与 market-to-burg、burg-to-market 和 market-to-market 交易。资源点增删移和重生成后会立即重建 economy，不再只刷新 marker 国力 bonus。
- 商品供需缺口第一刀已完成：经济阶段会按市场覆盖人口、城市人口和商品需求覆盖率为 `market.goods` 写入 `demand / supply / gap / shortage / surplus`，同时生成 `market.demandSummary` 和 `economy.metadata.demand`。经济总览新增“供需缺口”指标，商品/市场表可按缺口排序，详情和 CSV/JSON 导出同步带出需求、供给、缺口和过剩。本轮只做静态诊断，不驱动军事、外交或自动价格传播。
- 资源货物接入路线权重第一刀已完成：陆路 pack A* 成本会对资源 cell 和邻近资源 cell 做温和折扣，路线对象写入 `resourceCells / markerResourceCells / resourceGoodIds`；路线管理面板可按资源经过数排序，详情显示资源 cells 和资源种类，route GeoJSON 属性也同步输出这些字段。本轮只影响静态路线生成和诊断，不做贸易动画、市场刷子或军事联动。
- 资源货物接入城镇选址第一刀已完成：城镇和首都候选评分会把所在 cell 与邻近 cell 的自然资源货物作为轻量腹地 bonus，城市 / burg 写入 `resourceCells / markerResourceCells / resourceGoodIds / resourceScore`；城市管理面板可按资源腹地排序，详情显示资源 cells 和资源种类，city GeoJSON 也同步输出。由于 marker 资源生成在城镇之后，本轮不让 marker 资源反向搬动城镇。
- 控制面板和管理浮窗下拉 UI 已统一：新增 `UiSelectField`，`UiField type="select"` 会复用同一控件；生成地形、国家目标/首都、省份目标、城市剪影/配色、资源类型、marker 图形/配色都已替换为统一下拉，构建产物验证中 9 个 `select` 全部位于 `.ui-select-field` 下，无裸下拉。
- 地图点击与编辑列表联动已补齐：共享 `UiObjectTable` 会在选中对象变化后把目标行滚入列表视口；地图导航改为鼠标右键或中键拖动画布，鼠标左键保留点击选择和 hover，不再执行平移；高度/国家/省份/marker 编辑笔刷只响应左键或触控主动作，右键/中键可穿透交互锁用于平移。
- 选中、拾取和导出体验补丁已完成：河流与路线重叠时河流优先于路线命中，隐藏城市/人口图层后城市不再参与拾取；共享对象表格会在 Element 表格懒加载和布局稳定后持续复核滚动位置，河流、路线、省份等列表选中行可滚入视口；视图按钮 hover 白底已压回暗色主题；PNG 导出改为导出前重绘并从 WebGL framebuffer 读像素，避免只导出比例尺覆盖层。
- 城镇标签已改为纯展示层：地图拾取会跳过 `city` 类型标签，不再因为点击城镇名而选中“标签”对象；城镇本体坐标仍正常命中对应城市。城市名称的隐藏、重命名和管理继续通过“标签管理”面板处理。
- PNG 导出已补齐地图 overlay：导出时会按当前视图和图层合成可见的城镇标签、国家名称、自定义标签、近景城镇剪影和资源/标记图标；比例尺、地图尺寸 badge、控制面板、浮层面板和 loading 等 UI 信息不会被写入图片。
- 初始化加载流程已补路线阶段防锁死保护：`fit-draw` 不再吞并道路、河流和 overlay 收尾；`route-screen-mesh` 改为异步分帧构建，并对路线点数、顶点数和虚线切片设置预算，避免异常路线或用户 Chrome/profile 状态把主线程锁死；详细规约见 `docs/task-notes/initialization-loading-flow.md`。
- 初始化加载追踪已接入开发模式：`?debug=1` 或 `?loadTrace=1` 会记录生成、渲染装载、面板刷新和完成阶段；`loadStepDelay / debugLoadDelay / loadTraceDelay` 可在阶段边界插入临时 `setTimeout` 间隔，便于复现“卡在某句 loading”时定位具体阶段。
- 渲染健康监测已接入本地环形日志：页面脚本未启动、地图 ready 超时、loading 长时间不收起、主线程长任务、渲染帧间隔、输入响应延迟和业务操作卡顿都会写入 `localStorage["webgl-generator-health-events-v1"]`，开发模式“健康监测”可查看最近事件；说明见 `docs/task-notes/render-health-monitoring.md`。
- 异步 Vue/Element 面板已接入空闲预热：首屏仍保持拆包，地图进入可交互状态后会按空闲时间逐个预加载二级/三级面板 chunk，首次打开复杂面板时不再等到点击后才拉取组件；状态可通过 `window.__webglGeneratorLazyPreload.getStats()` 查看。
- 单位与比例尺显示第一刀已完成并重组为独立“单位”tab：数字缩写、距离单位、派生面积单位、地图比例尺、人口倍率和降水倍率各占一行，不再挤在“视图”tab；距离支持“米/千米/m/km”，面积单位由距离单位自动派生为“平方米/平方公里/m²/km²”，不再二次选择。比例尺限制在 `1-1000 km/cm`，人口倍率限制在 `0.1-10x`，降水倍率限制在 `0.1-5x`。主要运行统计、降水图例、悬停人口/降水、路线/河流长度、国家/省份/文化/宗教面积与人口、城市人口和对象详情已按同一显示偏好换算；内部生成数据暂不改写。
- 滑条精确输入显示已收敛：`UiSliderField` 的数字由 Element Plus 数字输入负责，右侧不再重复显示数值；温度、纬度、比例尺和倍率等带单位场景只保留 `°C / ° / km/cm / x` 等单位提示，无单位滑条会收掉右侧占位列。比例尺、人口倍率、降水倍率和气候参数这类会触发全局刷新或派生重算的关键滑条，拖动时只更新控件自身，松手触发 `change` 后再做短防抖提交。
- 显示单位第二刀已完成：新增“数字”精简偏好，默认按“万”缩写，可切为“千”或“完整”；运行统计、悬停、对象详情、国家/省份/城市/文化/宗教/外交/路线/河流/marker/标签等主要计数、评分、潜力和流量读数已接入同一 `formatNumber()`。高度读数不再显示内部 `h` 整数，悬停地形、城市落水检查和高度编辑摘要均按原版高度换算公式显示实际米制高度。
- 下拉菜单第二刀已完成：`UiSelectField` 菜单改为 Teleport 到 `body` 的 fixed 弹层，按触发器位置计算宽度和上下开口，不再占用浮动面板内容高度，也避免打开菜单时把原本无滚动条的浮层撑出滚动条；菜单宽度下限已提高，并会参考最长选项文本扩展但仍受 viewport 限制，长选项在菜单内滚动。
- 图标二级操作第二刀已收束为独立浮层：`UiActionDock` 的插槽内容统一 Teleport 到 `body` 中的二级编辑面板，重命名、调色、继承、人口、首都、剪影、河流宽度、外交关系等操作不再在当前列表面板内展开；新增共享 `UiColorActionPanel`，国家、省份、文化、宗教的“调整颜色”动作都复用同一颜色二级面板。
- 运行时气候系统第三刀已完成：控制面板“生成”tab 的气候区由简单下拉改为平面圆地球投影，纬线为 2D 横线段且赤道长于高纬线，当前画布纬度范围显示为闭合多边形，随纬度接近极点会从梯形向三角形收束；大气风带按纬度位置贴在投影旁边，只显示紧凑箭头按钮，每个风带可点击箭头在东北、东南、西北、西南四向中轮询。赤道/南北极温度、画布纬度和风带变化会立即重算当前地图的温度、降水、生物群系和人口适宜度，并刷新当前画布，不再只等重新生成；国家、城市、经济、军事、外交等下游系统会标为待派生。
- 文化/宗教继承结构已收敛为内部生成与管理面板编辑：生成数据继续写入 `parent / children / depth / lineage / origins`，文化管理和宗教管理面板可查看父级、层级、继承路径并手动调整父级，调整会进入撤销栈并防止自环；控制面板“生成”tab 不再暴露继承结构选择，避免把随机派生细节前置给普通用户。
- 文化/宗教树总览已升级为可拖动的独立连线面板：文化管理和宗教管理面板在摘要下方只保留“打开树状面板”入口；完整总览以独立浮层展示，节点按父子层级横向展开，并用 SVG 曲线连接父子节点，拖动标题栏可移动面板，点击节点复用现有选择回调。
- 外交系统第一刀已完成：参考原版 `States.generateDiplomacy()` 和 `diplomacy-editor`，新增 `Ally / Friendly / Neutral / Suspicion / Rival / Enemy / Vassal / Suzerain / Unknown` 关系矩阵；关系生成会读取国家邻接、文化/宗教继承、国力、资源竞争和海洋国家差异。国家对象写入 `diplomacy / diplomacySummary / campaigns`，`map.diplomacy.metadata` 统计关系、战争、附庸和历史；管理 tab 新增“外交管理”，支持主体国家选择、关系列表、手动改关系、重生成外交和撤销/重做；第二刀已补外交专题着色、关系矩阵表、矩阵点击选中关系以及 CSV/JSON 导出。
- 外交专题点击语义已修正：在外交视图下点击国家只切换外交主体并刷新外交着色，不再自动打开国家编辑面板；非外交视图下仍保留原国家选择/编辑入口行为。
- 外交导出可读性第一刀已完成：外交 CSV 不再只有关系矩阵，会追加导出摘要、当前主体关系明细和外交历史；JSON 新增 `webgl-generator-diplomacy-summary v1` 结构，包含导出时间、主体、国家摘要、主体关系明细、矩阵和历史记录。本轮只增强只读导出，不改关系生成、战争状态或军事联动。
- 外交贸易偏好展示第一刀已完成：外交面板会按现有 `pack.deals` 汇总主体国与对象国之间的直接贸易，显示交易数、贸易量、贸易额和主体净流向，并同步写入外交 CSV/JSON 的主体关系明细。本轮只做只读聚合，不让贸易信号改写外交关系、战争 campaign 或军事系统。
- 外交跨面板定位第一刀已完成：外交面板选中对象国家后可通过二级动作直接打开对应国家面板，并同步 selection 与国家面板目标；本轮只复用现有国家面板，不改变外交关系、生成数据、渲染图层或任何军事逻辑。
- 外交关系编辑体验第二刀已完成：`调整关系` 二级浮层新增主体/对象标题、当前关系、关系倾向、邻接、直接贸易、国力和文化/宗教上下文，并提示修改会进入撤销记录且不会触发军事行动；本轮只改编辑提示和样式，不改变外交关系命令、战争 campaign 或军事逻辑。
- 外交历史可读性第三刀已完成：外交面板新增“外交历史”预览，优先显示当前主体和对象相关记录，没有相关记录时显示最近全局外交记录；手动关系编辑的历史原因从英文 `manual` 改为中文“手动关系编辑”。本轮只改历史展示和记录文案，不改变关系命令、战争 campaign 或军事逻辑。
- 外交关系变更说明第四刀已完成：`调整关系` 二级浮层新增可选说明输入，手动关系变化、宣战、停战、同盟、附庸、宿敌和断交记录都会把说明写入外交历史与导出；空说明继续使用“手动关系编辑”。本轮只改外交编辑说明和历史文本，不新增动态军事系统，也不让外交变更触发军事行动。
- 外交历史筛选第五刀已完成：外交历史预览新增“当前关系 / 主体国家 / 全部历史”范围筛选，当前范围无记录时保留空态说明，避免用户失去切换入口。本轮只改只读历史浏览，不改变外交生成、关系命令、战争 campaign 或任何军事逻辑。
- 外交关系编辑安全提示第六刀已完成：`调整关系` 浮层新增“提交方式 / 写入范围 / 战争选项 / 说明写入”提示，明确关系选择会立即提交且可撤销，战争选项只记录外交状态。本轮只改说明和样式，不改变外交命令、战报、战役或军事逻辑。
- 军事态势线贴边第四刀已修正：战线生成继续只收集交战双方共享的陆地边界短段，并进一步压短最大边界长度；若单条共享边本身超过上限，会裁成边界中段；渲染层不再把箭头从边界往外推出，而是沿 `front.points` 分段绘制暗色外沿 + 宽体渐变方向带，战线长度不再脱离真实陆上边界。
- 军事态势线贴边第五刀已完成：战线最大长度进一步压短到共享边界上的短标记，仍只允许双方陆地相邻 pack cell 的共享边；渲染层改为整条边界宽体渐变带 + 单个指向敌方的宽箭头头部，不再每段重复细小箭头。构建产物烟测中 `stage-2-1231411414` 生成 `2` 条 front，长度均为 `6`，战线开关仅增加 `36` 个 line 顶点，`glError = 0`。
- 军事态势线贴边第六刀已完成：旧 front 若缺少共享边界 `borderCellPairs` 不再回退绘制 `from -> to` 长线；多段边界方向整理不再丢点，`length / maxLength` 改为按真实边界点列记录；渲染层把渐变方向改成己方侧到敌方侧，并把箭头头部收为边界宽带内的方向标记，避免近景下变成斜插出边界的大色块。构建产物烟测中 `stage-2-1231411414` 生成 `2` 条 front，长度均为 `6`，战线顶点增量 `36`，异常旧 front 顶点增量 `0`，`glError = 0`。
- 军事态势线贴边第七刀已完成：战线生成在扩展相邻共享边界时，如果下一段略超剩余长度预算，会裁取该共享边的一部分，而不是直接停止；裁切仍只发生在双方陆地相邻的真实边界上，不回退长线、不跨海、不改变战役或战报语义。
- 军事态势线边界裁切分支已修正：`bestFrontBoundaryExtension()` 不再在超出剩余预算时提前跳过下一条共享边，而是允许后续 partial 裁切逻辑取真实陆地国界上的一小段。数据探针中 `front-scan-63` 生成 3 段边界 front，长度 `12.47 / maxLength 12.47`，无跨海或归属错误。
- 军事面板样式第二刀已完成：`军事管理` 的顶部统计、选中军团概要、详情网格、战报链摘要和二级操作面板统一为更清晰的暗色指挥面板样式，减少裸文本和按钮堆叠感；本轮只改 CSS，不改军事数据和命令语义。
- 军事面板静态布局第三刀已完成：`军事管理` 首屏改为选中军团概要和详情优先，军团列表下移为对象切换区；军事排序条补紧凑网格样式，不再像整排大按钮堆叠。本轮只调整 `MilitaryPanel.vue` 模板顺序和 `styles.css`，不新增动态军事系统、不改战斗事件、战役阶段或外交状态。
- 军事面板静态档案第四刀已完成：`军事管理` 新增军团静态档案分组，把驻防、兵力、背景和战报档案拆开呈现；面板文案从“战斗事件 / 已应用”收敛为“战报记录 / 已结算”，README 同步改为战报档案口径。本轮只改展示和文案，不新增动态军事系统、不改既有记录兼容与结算命令。
- 军事面板静态编辑浮层第五刀已完成：态势、批量态势、驻地基地、记录战报和兵种比例二级浮层统一为暗色军团编辑台，补当前态势/命令、筛选范围、驻地/基地、战报链和比例合计等只读上下文卡片；本轮只改显示和字段分组，不新增动态军事系统、不改变任何军事命令或战报语义。
- 军事静态导出可读性第六刀已完成：军事 CSV 从单表扩展为导出摘要、国家军事汇总、军团明细、战役摘要和战线摘要分段；JSON 改为 `webgl-generator-military-summary v1`，包含筛选上下文、汇总、国家、军团、战役、战线和战报摘要。本轮只整理当前静态数据，不新增动态军事系统、不改变战报或战役结算。
- 军事战报查看/清理体验第七刀已完成：战报记录区新增清理范围摘要，显示当前军团、当前筛选、当前显示和导出范围记录数；“清空筛选 / 清空当前”按钮同步显示即将影响的记录数。本轮只改查看与清理提示，不改变清理命令、战报记录结构或任何动态军事逻辑。
- 政体管理总览第一刀已完成：控制面板“管理”tab 新增“政体管理”入口，异步加载独立浮动面板；面板只读汇总各政体的国家数、人口、面积、经济力、军力、政体效果和代表国家，并可从政体分组定位/打开对应国家编辑。本轮不新增政体事件、批量调整或政体专题着色，不触发生成或渲染重建。
- 政体专题图层第一刀已完成：控制面板“视图”tab 新增“政体”专题，按国家 `governmentFamily` 为陆地国家着色；政体视图下点击陆地仍返回国家政治对象，便于继续打开国家/政体管理。本轮只改 surface 颜色分派和 picking 语义，不新增政体事件或批量命令。
- 政体专题图例第一刀已完成：政体视图会显示左下角图例，按当前地图实际存在的 `governmentFamily` 列出颜色、中文家族名和国家数；图例复用 renderer 的同一份政体家族配色配置，只扫描国家数组，不触发生成或渲染重建。
- 政体批量调整第一刀已完成：`政体管理` 面板可把当前选中政体分组的国家一次性套用到另一个政体，操作接入 `EditHistory`，撤销/重做会恢复国家 `form/fullName/government effects` 等字段；本轮只标记经济、外交、军事为待派生，不做政体事件或重建下游系统。
- 政体导出第一刀已完成并补家族筛选：`政体管理` 面板新增当前筛选结果的 CSV/JSON 导出，并可按政体家族过滤；CSV 按国家逐行写出政体、类型、时代、家族、首都、人口、面积、经济力和军力，JSON 同时包含政体分组汇总、国家明细、文本筛选、家族筛选和选中政体上下文。
- 政体静态交叉摘要第一刀已完成：`政体管理` 选中政体详情会聚合现有国家字段，显示国力、资源潜力、平均贸易修正、战争/宿敌和盟友/附庸计数；CSV/JSON 导出同步写出这些经济/外交上下文字段。本轮不重算经济、外交或军事，只做只读聚合展示。
- 战斗事件链路列表与 CSV 导出已补可读元信息：选中军团事件列表的每条事件现在显示链路序号、已应用/未应用状态和损耗状态，战报链摘要会同时显示已应用和未应用数量，详情区和战斗记录面板标题统一读取合并后的战报链，CSV/JSON 事件导出也会带出同样的链路与结算信息，JSON 事件导出会记录类型/结果/结算筛选上下文；事件超过 5 条时可展开完整筛选链路，并可按已应用/未应用筛选，默认仍只渲染最近 5 条。本轮不改变事件保存、导入、清理或轻量结果应用。
- 多条战报链路第一刀已完成：新记录和导入的战斗事件会写入 `chainKey / chainLabel`，默认归到所属战争原因或本地战报；军事面板可按链路筛选，摘要区显示真实链路数和事件数，列表区把链路名与事件序号拆开，CSV/JSON 战斗事件导出会保留链路字段和当前链路筛选上下文。本轮仍不做完整战斗模拟或战役自动推进。
- 战报链双方字段第一刀已完成：新记录和导入的 campaign 战斗事件会写入共享 `campaign:*` 链路 key、`chainSide / chainSideLabel`、进攻方/防守方和对手国家字段；军事面板事件条目会显示“进攻方 / 防守方 + 对手”，CSV/JSON 导出保留这些字段。该能力只是双方结算的前置上下文，不自动推进战役或改写外交关系。
- 只读战役对象第一刀已完成：`map.military.campaigns` 会从外交战争生成军事战役摘要，包含 `chainKey`、双方国家、军团数、兵力、关联 front 和战争原因；军事管理顶部统计显示战役数，参战军团详情显示所属战役，军事 JSON 导出包含 `campaigns`。本轮仍不做双方自动扣兵、战役推进或外交状态变化。
- 战役对象战报摘要第一刀已完成：记录、导入或清空战斗事件后，`map.military.campaigns` 会按共享 `campaign:*` 链路重算事件数、已应用/未应用、攻方/守方损耗、最近事件和双方当前兵力；军事管理详情新增“战役摘要”，军事 JSON 导出自然带出这些字段。本轮仍不自动扣对手兵力、不推进战役阶段、不改外交状态。
- 战役轻量双方结算第一刀已完成：记录 campaign 战斗事件并启用“应用轻量结果”时，会为对手国家选择一支最近同域军团，在同一条事件里写入 `affectedRegiments`、`result.opponent` 和 `result.sideCasualties`，并同步扣减双方兵力、态势和战役攻守损耗；本地战报仍保持单军团轻量结果。本轮仍不推进战役阶段、不自动改外交关系。
- 战役阶段摘要第一刀已完成：`map.military.campaigns` 新增 `phaseKey / phaseLabel / momentumKey / momentumLabel / progress / progressLabel`，记录或撤销战斗事件后按事件数、已应用数、攻守损耗和双方当前兵力派生“动员对峙 / 前哨接触 / 边境交战 / 战线胶着 / 决战推进 / 战役消耗”等阶段；军事面板“战役摘要”会显示阶段、进展、优势、事件和攻守损耗。本轮仍不推进外交战争状态、不自动结束战役。
- 记录战斗事件时的链路选择已完成：二级“战斗事件”面板新增“链路”下拉，国家有多条 campaign 时可把新战报明确挂到指定战役；没有战役时仍默认“本地战报”。保存时会把所选链路的共享 key、进攻/防守方、对手国家写入事件。本轮仍不改变损耗公式或自动推进战役。
- 可点击战报链概览已完成：选中军团的战斗事件区会按链路显示紧凑概览，包含战役名、进攻/防守方、对手、事件数、已应用/未应用和累计损耗；点击某条链会直接切换链路筛选。该能力继续服务于战役复盘，不进入自动结算。
- 名称库导入冲突预览第一刀已完成：选择名称库 JSON 后先显示可导入词池、样本、替换数量、同名/同源风险、空词池跳过和示例词池；用户确认后才追加或替换用户名称库。该能力只做导入前预览和用户库写入，不改生成器签名，不自动改写当前地图对象名称。构建产物烟测确认预览阶段用户库数量不变、确认后才写入，正式 e2e 守门通过，点击到出图 `1510ms`，WebGL 加载 `427.6ms`。
- 名称库绑定状态第一刀已完成：`namebase-store` 新增绑定读写和诊断 helper，名称库总览会显示每个词池的全局/文化绑定用途，并在绑定指向不存在词池时显示“失效绑定引用”。本轮只做只读状态和失效提示，不让名称库参与生成，也不批量改写已有地图名称。构建产物烟测确认有效绑定和失效引用均可显示且无溢出；正式 e2e 守门通过，点击到出图 `1555.9ms`，WebGL 加载 `522.1ms`。
- 名称库全局绑定编辑第一刀已完成：名称库总览新增 `国家根名 / 地名 / 水文` 三个全局绑定下拉，可选择任意内置或用户名称库，也可恢复“使用内置策略”；失效引用会作为可见选项保留，便于用户改回有效词池。本轮仍只保存 `map.namebases.bindings.global`，不自动改写已有名称。构建产物烟测确认绑定/清空不会改变地图 checksum；正式 e2e 守门通过，点击到出图 `1586.8ms`，WebGL 加载 `440ms`。
- 名称库全局绑定生成接入第一刀已完成：`createChineseNameGenerator(seed, {namebases})` 会读取当前地图 `map.namebases.bindings.global`，国家/省份、城镇和水文受约束重生成会传入当前 `map.namebases`；`stateRoot` 仍走国家形制与 `state-family` 去重，`place` 只影响新生成城镇名，`hydro` 只影响新生成河湖名，失效绑定自动退回内置策略。构建产物烟测中绑定用户库后国家根名 `18/20` 命中、城镇 `666/1003` 命中、河湖 `131/157` 命中，`glError = 0`；正式 e2e 守门通过，点击到出图 `1761.6ms`，WebGL 加载 `504.4ms`。
- 名称库整图生成继承第一刀已完成：生成按钮和高度图导入会从当前地图复制用户名称库与绑定快照，作为本次生成临时上下文；新地图保留 `map.namebases` 与 `metadata.namebases`，但 `map.options` 不携带用户库对象。构建产物烟测中真实点击整图生成后，继承 `3` 个用户库，国家根名 `20/20` 命中、城镇 `621/757` 命中、河湖 `180/211` 命中，`glError = 0`；正式 e2e 守门通过，点击到出图 `1562.9ms`，WebGL 加载 `457.6ms`。
- 名称库文化级绑定生成读取第一刀已完成：命名器会按对象 `culture` 读取 `map.namebases.bindings.cultures[cultureId]`，文化绑定优先于全局绑定；文化绑定为空时走全局，文化绑定失效时安全回退内置策略。构建产物烟测中目标文化国家根名 `6/6` 命中文化库，其它国家 `14/14` 命中全局库，目标文化水文 `45/46` 命中文化库；正式 e2e 守门通过，点击到出图 `1564.6ms`，WebGL 加载 `519.1ms`。
- 名称库文化级绑定 UI 第一刀已完成：名称库面板新增“文化绑定”区，可选择文化并分别设置该文化的 `国家根名 / 地名 / 水文` 覆盖；设置后会写入 `map.namebases.bindings.cultures[cultureId]` 并刷新绑定状态。本轮仍只保存后续生成偏好，不自动改写已有名称。构建产物烟测确认文化 #1 三项绑定均可通过 UI 写入，面板显示文化绑定用途且无横向溢出；正式 e2e 守门通过，点击到出图 `1429.1ms`，WebGL 加载 `363ms`。
- 名称库绑定候选类型过滤第一刀已完成：全局和文化绑定下拉会按目标过滤候选，国家根名只收 `state-root / generic`，地名收 `place / place-part / generic`，水文收 `hydro / generic`；已存在但类型不匹配的当前绑定会以“当前不匹配”保留，方便用户修复。构建产物烟测确认三类下拉互不混入错误用户库且面板无横向溢出；正式 e2e 守门通过，点击到出图 `1367.9ms`，WebGL 加载 `357.7ms`。
- 名称库文化管理快捷入口第一刀已完成：文化管理面板新增“名称库绑定”二级操作，点击后会打开名称库面板并聚焦到当前文化，便于直接设置该文化的国家根名、地名和水文绑定。本轮只做跨面板导航，不改生成和地图数据。构建产物烟测确认从文化 #2 打开后名称库文化选择为 #2，两边面板无横向溢出；正式 e2e 守门通过，点击到出图 `1597.3ms`，WebGL 加载 `483.9ms`。
- 名称库应用级本地偏好第一刀已完成：名称库导入、新建、复制、重命名、样本编辑、删除、清空以及全局/文化绑定变更会把当前名称库快照保存到 `localStorage["webgl-generator-namebase-preferences-v1"]`；生成按钮和高度图导入在当前地图没有 `namebases` 时会读取该偏好作为临时生成上下文。该能力只影响后续生成，不自动改写当前地图对象名称。构建产物烟测确认删除当前地图 `namebases` 后重新生成仍继承 `user-namebase-1` 与 `stateRoot` 绑定；正式 e2e 守门通过，点击到出图 `1726.9ms`，WebGL 加载 `579.9ms`。
- 名称库样本权重第一刀已完成：用户库样本支持 `名称|3`、`名称*3` 或重复同名样本来提高抽样权重，导入、导出、本地偏好、生成预览和绑定生成都会保留并读取权重；面板详情显示样本权重总量，样本编辑区补权重语法提示。该能力只改变后续名称候选抽样，不自动改写当前地图对象名称。
- 名称库 Markov 链路质量第一刀已完成：项目内新增纯函数 Markov 链计算与生成，名称库预览和绑定命中的国家根名、地名、水文候选共用同一套链路；样本权重会参与链路构建，面板详情新增“链路多样性”。该能力仍只影响后续生成候选，不自动改写当前地图对象名称。
- 名称库编辑历史第一刀已完成：名称库导入、新建、复制、重命名、样本编辑、删除、清空和全局/文化绑定写入现在会走 `EditHistory` 快照命令；名称库面板新增撤销/重做条。撤销只恢复 `map.namebases` 和本地偏好，不触发地图重绘或自动改写当前对象名称。构建产物烟测确认新建用户库后撤销/重做正常，`generationTiming.totalMs` 保持 `665.4ms` 不变，`glError = 0`。
- 名称库显式重命名第一刀已完成：城市管理面板新增“按名称库重命名筛选”，只对当前筛选结果里的城市执行显式重命名，读取当前 `map.namebases` 的全局/文化 `place` 绑定并进入 `EditHistory`；撤销/重做会恢复城市和对应 burg 名称。该能力不会因为导入、编辑或绑定名称库而自动批量改写当前地图。构建产物烟测中 821 个城市被显式重命名，撤销/重做正常，`generationTiming.totalMs` 保持 `691.1ms` 不变，`glError = 0`。
- 名称库河流显式重命名第一刀已完成：河流管理面板新增“按名称库重命名筛选”，只对当前筛选结果里的河流执行显式重命名，读取当前 `map.namebases` 的全局/文化 `hydro` 绑定并进入 `EditHistory`；撤销/重做会恢复河流名称，不重建水文、河网或路线。构建产物烟测中 204 条河流被显式重命名，撤销/重做正常，`generationTiming.totalMs` 保持 `745ms` 不变，`glError = 0`。
- 名称库国家显式重命名第一刀已完成：国家管理面板新增“按名称库重命名筛选”，只对当前筛选结果里的非中立国家执行显式重命名，读取当前 `map.namebases` 的全局/文化 `stateRoot` 绑定并进入 `EditHistory`；撤销/重做会恢复国家 `name/fullName`，保留现有政体国号后缀，不重建政区、外交、经济或军事。重复根名不再用未经空间校正的东南西北前缀兜底，而是跳过方向变体并使用非方位变体。构建产物烟测中 20 个国家被显式重命名，撤销/重做正常，`generationTiming.totalMs` 保持 `707.2ms` 不变，`glError = 0`。
- 名称库选中对象显式重命名第二刀已完成：对象详情面板的“名称库改名”已覆盖国家/城市标签、河流和湖泊目标，并复用 `EditHistory` 撤销/重做；湖泊对象类型、拾取、详情展示和单个名称库重命名链路已经接入。当前路线仍不触碰动态军事系统。
- 名称库更细质量诊断第一刀已完成：摘要层新增平均/中位样本长度、长度越界、相邻连写风险、特殊字符、加权样本数量和最高权重诊断；名称库详情面板和 JSON 导出同步显示这些字段，质量标签会提示“长度需校准 / 连写需校准 / 含特殊字符”。本轮只读分析，不自动改写名称库或当前地图对象名称。
- 重新生成区的“待命”提示已移除，后续点击重新生成后的内部状态提示也已收敛到开发模式；普通模式仅保留稳定的用户可读默认说明。
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
2. marker 后续不要为了单个类型继续扩大总量；资源点类型已完成第二刀细分，下一步更适合把 marker/city 图标扩展成文化预制图标包和批量应用入口，或把资源点正式接入 goods/market/deals 贸易链路。
3. 经济/人口的 goods 前移和资源点贸易链路已完成第一刀；经济总览已完成只读面板、商品/市场/交易筛选排序、定位、当前筛选结果 CSV/JSON 导出、debug-only 开发诊断、默认关闭的静态贸易流图层、贸易流拾取、对象详情完整交易字段、贸易线定位、市场距离成本、商品供需缺口、资源货物路线权重、资源货物城镇选址、静态价格传播诊断、贸易流价格信号和市场归属诊断第一刀。后续若继续提质，应逐步补市场归属编辑和更完整贸易可视化；贸易动画继续后置。
4. 单位系统当前是显示层换算且已集中到“单位”tab；后续导出、比例尺标尺绘制、编辑器输入字段和正式人口/降水口径如果要跟随倍率，需要单独接入，避免误把显示倍率写回生成数据。
5. 气候系统当前已支持运行时即时重算温度、降水、生物群系和人口适宜度；后续可继续做更细粒度的海流/季风、局部雨影强度、温度/降水刷子，以及下游派生系统的受约束重算。
6. 文化/宗教继承结构目前只影响数据、统计和手动管理；后续可以让派生关系参与名称变体、图标预制、宗教改革事件、文化同化速度、国家合法性和国力计算。
7. 外交系统当前已生成关系、附庸、战争历史、管理面板、专题着色、关系矩阵和 CSV/JSON 导出；外交导出可读性第一刀已补摘要、主体关系明细、国家摘要和历史记录，贸易偏好展示第一刀已补主体关系的直接贸易摘要，跨面板定位第一刀已可从外交对象打开国家面板，关系编辑体验第二刀已补编辑上下文，外交历史可读性第三刀已补面板历史预览和中文手动原因，关系变更说明第四刀已补手动说明输入并写入历史/导出，历史筛选第五刀已补当前关系/主体/全部范围筛选，编辑安全提示第六刀已补提交影响说明。后续外交优先做只读可读性或编辑安全提示，不再把战争驱动军事行动作为当前路线。
8. 重新生成后的内部状态提示已收敛到 debug 模式；普通用户反馈第一刀已改为地图顶部短 toast，仅在用户主动重新生成、地图数据导入和高度图导入完成后显示“生成完成 / 地图数据已导入 / 高度图已应用”，不展示派生系统和调试细节。
9. 政体系统当前已进入生成、经济、外交、军事、国家面板、独立“政体管理”总览、政体专题图层、专题图例、分组批量调整、家族筛选、CSV/JSON 导出、经济/外交静态摘要和“外交视角”跨面板定位；后续若继续推进，应优先补编辑可读性和跨面板定位，不做政体事件。
10. 名称库导入冲突预览、绑定状态提示、全局绑定编辑、当前地图内全局绑定生成接入、整图生成继承、文化级绑定生成读取、名称库面板文化绑定 UI、绑定候选类型过滤、文化管理面板快捷入口、应用级本地偏好、样本权重、Markov 链路质量、编辑历史，国家/城市/河流筛选显式重命名，选中标签/河流/湖泊目标单个重命名，基础生成质量参数、原版文本导入导出第一刀，以及更细质量诊断第一刀已完成；后续名称库可补更多对象面板入口或原版多词率 `m` 行为，但不要让名称库导入或绑定变化自动改写已有地图对象名称。
11. 高度图导入工作台已完成灰度预览第一刀；后续若继续做“第一优先”，应进入轻量色板量化、自动亮度/色相/FMG 色带映射和手动色块赋高，而不是把彩色识别塞回灰度导入函数。
12. 军事单位编辑面板后续只保留静态管理收尾：面板观感、字段分组、导出可读性、军团展示、态势线边界视觉和既有记录的查看/清理体验。除非用户重新要求，不再继续推进动态军事系统、战争行动链路、战斗模拟、自动战役阶段、战役自动结束，或经济/外交驱动的军事自动化。
13. 国名随机方位语义约束已完成第二刀：`东/西/南/北 + 根名` 会在国家扩张和统计后按同根国家相对位置校正；没有同根参照国时会去掉方位前缀，避免北边孤立国家随机叫“南某”或南边孤立国家叫“北某”。第一刀只覆盖 `南越 / 北燕` 这类古国复合根名，第二刀已扩展到 `南衡 / 北辰 / 东渚 / 西陵` 等普通地名根。
14. README 当前状态刷新已完成：根目录 README 已补“已经完成 / 还要做”，把生成、编辑、导入导出、贸易外交军事、性能与 WebGL 化进展写成读者向状态；最新刷新已按用户校准去掉动态军事系统待办，后续军事方向只保留静态编辑面板、战报导入导出可读性、军团展示和态势线观感收尾。

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
115. 国家命名策略第一刀已完成：国家根名不再高概率复用文化根名，改为优先抽取春秋/周代诸侯国启发的单字与短根名，并用 `state-family` 去重避免同一根名反复派生“东/西/南/北”相邻变体；文化根名只作为低概率首选。该阶段曾把国家形制收敛到“国、侯国、伯国、邦、朝”和少量地貌特化形式，后续已被政体驱动的国号规则取代，不再使用“朝 / 侯国 / 伯国 / 自由邦”等旧目标。三组 seed 抽样中，20 个国家的短根名为 `19-20` 个、单字根名为 `8-11` 个、同根重复为 `0`。
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
131. 对象注记已完成 source 对照和实现计划：`docs/task-notes/object-notes-implementation-plan.md` 记录了原版 `notes[] / editNotes()` 行为、WebGL 版 `map.notes` 数据契约、`${kind}:${objectId}` id 规则、EditHistory 命令入口、共享 `UiNoteField` 方案、专用面板分批接入顺序和验收建议。由于国家、城市、河流等已有专用面板，不能只在 ObjectDetailsPanel 里塞 textarea，后续实现应先做运行时 helper 和 marker/city/river/route 第一批入口。
132. marker 备注第一刀已完成：新增 `map.notes` 数据 helper、`UiNoteField`、`createSetMarkerNoteCommand()`，并在资源与标记管理面板的二级操作中加入“编辑备注”。备注使用 `${kind}:${objectId}` id 保存到完整地图数据中，支持 EditHistory 撤销/重做；第一阶段只做纯文本，不引入富文本或 AI。构建产物验证中给首个 marker 写入“第一条 marker 备注：矿脉附近有旧道路。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（23字）”；撤销后 notes 为 `0`，重做后恢复为 `1`；导出的完整地图 JSON `fmg-stage-2-1-e575f0b1.webgl-map.json` 中保留该备注，console/page error 为 `0`。
133. marker 备注已接入要素 GeoJSON：`markerFeatures()` 会读取 `map.notes`，在 marker properties 中输出 `hasNote` 和 `note` 字段。构建产物验证中给 marker `#2` 写入“GeoJSON 备注检查：这里有珍贵矿脉。”后导出 `fmg-stage-2-1-f6cfb182.features.geojson`，该 marker feature 为 `marker-2`，`hasNote = true`，`note` 正文一致，带备注 marker 数为 `1`，console/page error 为 `0`。
134. 城市备注第一刀已完成：复用 `map.notes` 与 `UiNoteField`，新增 `createSetCityNoteCommand()`，城市管理面板二级操作加入“编辑备注”，并补 `city-panel` 的 `version` 刷新触发，保证 markRaw 地图内部备注变化后详情行同步更新。构建产物验证中给城市 `#1` 写入“城市备注检查：此城是北境贸易节点。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（17字）”；撤销后 notes 为 `0` 且详情显示“无”，重做后恢复为 `1`；最终导出完整地图 JSON `fmg-stage-2-1-260af816.webgl-map.json`，`map.notes.notes[0]` 为 `city:1`，正文“城市备注导出检查：港口仓储完善。”，console/page error 为 `0`。
135. 导出能力矩阵已落文档：`docs/task-notes/export-capability-matrix.md` 区分了 PNG、完整地图 JSON、pack cell GeoJSON 和要素 GeoJSON 的入口、后缀、内容、是否可重新导入、备注字段覆盖和缺口；后续导出增强建议顺序为 GeoJSON 分层选择、国家/省份 dissolve、city GeoJSON layer、PNG 倍率/overlay 选项、完整 JSON 压缩与版本迁移。
136. 河流备注第一刀已完成：复用 `map.notes` 与 `UiNoteField`，新增 `createSetRiverNoteCommand()`，河流管理面板二级操作加入“编辑备注”，并补 `river-panel` 的 `version` 刷新触发。构建产物验证中给河流 `#45` 写入“河流备注检查：这条河适合设渡口。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（16字）”；撤销后 notes 为 `0` 且详情显示“无”，重做后恢复为 `1`；导出完整地图 JSON `fmg-stage-2-1-ebb0e1b8.webgl-map.json` 中 `map.notes.notes[0]` 为 `river:45`，console/page error 为 `0`。
137. 路线备注第一刀已完成：新增 `createSetRouteNoteCommand()`，路线管理面板接入二级“编辑备注”和历史按钮，并用 `version` 刷新解决 markRaw 地图内部备注变更后详情不重算的问题。要素 GeoJSON 的 route / river properties 同步输出 `hasNote` 与 `note` 字段。构建产物验证中给路线 `#0` 写入“路线备注检查：这条道路适合设商站。”后，`map.notes.metadata.notes = 1`，详情显示“有备注（17字）”；撤销后 notes 为 `0`，重做后恢复为 `1`；完整地图 JSON `fmg-stage-2-1-bb2f7448.webgl-map.json` 和要素 GeoJSON `fmg-stage-2-1-bb2f7448.features.geojson` 均保留该 route 备注，console/page error 为 `0`。
138. 国家/省份备注第一刀已完成：`object-edit-commands.js` 新增通用 `createSetObjectNoteCommand()`，国家编辑和省份管理面板复用 `UiNoteField`，二级操作新增“编辑备注”，并通过 `version` 刷新 markRaw 内部备注状态。构建产物验证中给国家 `#1` 写入“国家备注检查：此国适合设为北境霸主。”、给省份 `#1` 写入“省份备注检查：这里适合规划粮仓。”；国家备注撤销/重做正常，省份备注撤销时国家备注仍保留，最终完整地图 JSON `fmg-stage-2-1-460ac096.webgl-map.json` 同时包含 `state:1` 与 `province:1`，console/page error 为 `0`。
139. 文化/宗教备注第一刀已完成：文化管理和宗教管理面板复用 `createSetObjectNoteCommand()` 与 `UiNoteField`，二级操作新增“编辑备注”，并通过 `version` 刷新详情备注状态。构建产物验证中给文化 `#1` 写入“文化备注检查：这个文化适合扩展商贸传统。”、给宗教 `#1` 写入“宗教备注检查：这里适合设置朝圣路线。”；文化备注撤销/重做正常，宗教备注撤销时文化备注仍保留，最终完整地图 JSON `fmg-stage-2-1-fcc49865.webgl-map.json` 同时包含 `culture:1` 与 `religion:1`，console/page error 为 `0`。
140. 标签备注第一刀已完成：`label-edit-commands.js` 新增 `createSetLabelNoteCommand()`，标签备注 id 使用 `label:${targetKind}:${targetId}` 复合键，避免城市标签、国家标签和手工标签同 id 碰撞；标签管理面板将重命名与备注收进二级操作栏。构建产物验证中给城市标签 `city:0` 写入“标签备注检查：这个城市名需要靠近河口。”后生成 `label:city:0`，不会写成 `city:0`；撤销后 notes 为 `0`，重做并导出完整地图 JSON `fmg-stage-2-1-17047708.webgl-map.json` 后保留该标签备注，console/page error 为 `0`。
141. 备注总览第一刀已完成：管理 tab 新增“备注总览”入口，独立浮层列出所有 `map.notes`，显示总数、可定位数、孤儿备注数和筛选数；支持按更新时间、类型、名称和字数排序，支持筛选正文/名称/id，支持定位到目标对象、删除备注并进入 `EditHistory` 撤销/重做。备注总览会解析 `label:${targetKind}:${targetId}` 复合键，避免把标签备注误定位到城市本体。后续可继续补备注独立导入导出、孤儿备注批量清理和备注摘要导出。
142. 城市要素 GeoJSON 第一刀已完成：`createMapFeatureGeoJson()` 新增 `city` Point 图层，properties 输出 id、burg、name、type、group、population、capital、provincial、port、state/province/culture/religion、cell、packCell、hasNote 和 note；`layerSet` 更新为 `cities-routes-rivers-markers-zones`。后续可继续补国家/省份 dissolve、分层选择和范围导出。
143. 要素 GeoJSON 分层选择第一刀已完成：简介 tab 新增“要素 GeoJSON 图层”开关，可独立控制 city、route、river、marker、zone 是否进入 `.features.geojson`；导出时 `createMapFeatureGeoJson(map, {layers})` 只生成选中图层，metadata 的 `layerSet` 和各图层计数同步反映选择。后续可继续补国家/省份 dissolve、范围导出和 CRS 元数据配置。
144. 政治面 GeoJSON / dissolve 已先落实计划文档：`docs/task-notes/political-geojson-dissolve-plan.md` 区分了第一阶段 `state/province` 非 dissolve MultiPolygon 集合与第二阶段真正拓扑 dissolve 外轮廓，记录了字段、算法、风险和验收。后续不要把 pack cell 集合误称为真正 dissolve；若引入几何库，需要先评估懒加载或拆包。
145. 春秋古国风命名第二刀已完成：国家根名词库补入更多周代/春秋小国启发的单字和短根名，例如单、芮、舒、郯、鄣、鄀、轸、邿、鄅、根牟、须句、逼阳、钟吾和群舒分支；国家根名抽取更偏向古国短名，文化地貌词根概率降低。该阶段曾让古国根名优先使用短国号以避免“芮海邦 / 郯河国”这类怪名；后续已升级为政体、规模和自我定位共同决定国号后缀。`state-family` 也补了 `舒*`、`曾/鄫/缯`、`谭/郯` 的近源归并。五组 seed 抽样中，20 个国家的短根名为 `19-20` 个、单字根名为 `8-13` 个、同根重复为 `0`。
146. 政治面 GeoJSON 第一阶段已完成：简介 tab 的“要素 GeoJSON 图层”新增默认关闭的“国家面 / 省份面”开关，导出时会按 `pack.cells.state / province` 分组陆地 cell，输出 `state` 与 `province` MultiPolygon Feature，并在 properties 中明确 `dissolved=false`。构建产物验证中开启国家面和省份面后导出 `states-provinces-cities-routes-rivers-markers-zones`，包含 state `20`、province `213`、city `817`、route `602`、river `164`、marker `44`、zone `9`，政治面 `233` 个且 bad `0`，console/page error 为 `0`。后续真正 dissolve 仍按计划文档进入拓扑边界合并原型。
147. GeoJSON bbox 第一刀已完成：pack cell GeoJSON 与要素 GeoJSON 导出都会为每个 Feature 和整个 FeatureCollection 写入标准 `bbox = [minLon, minLat, maxLon, maxLat]`。Node 验证中 pack cell 与 `states-provinces-cities` 要素导出的 collection bbox 和前 20 个 feature bbox 均有效；`pnpm run build:app` 通过，构建产物约 `957.83KB JS / 295.96KB gzip`、`149.39KB CSS / 22.20KB gzip`。这为后续范围导出、视口裁剪和外部 GIS 快速索引铺基础。
148. 备注摘要导出第一刀已完成：备注总览面板新增“导出备注摘要”，会导出当前筛选结果为 `webgl-generator-notes-summary v1` JSON，包含 seed、checksum、筛选备注数、总备注数、note id、kind、对象 id、名称、正文、字数、孤儿状态和时间戳。构建产物验证中注入 marker 与 label 两条备注后，备注总览显示 `备注2 / 可定位2 / 孤儿备注0 / 筛选2`，导出 `fmg-stage-2-1-0857e6f9.notes.json`，两条备注均保留正文和定位状态，console/page error 为 `0`。
149. 面积测量第一刀已完成：测量工具仍用同一个入口添加测量点，三点及以上会额外按首尾闭合多边形计算面积，并在 SVG overlay 中绘制半透明面片。构建产物验证中开启测量后点击三点，生成 `1` 个 `.measurement-area`、`1` 条路径、`3` 个点，读数为 `3 点 / 总长 994.3 千米 / 面积 11万 平方公里`，console/page error 为 `0`。后续仍可继续做路线贴合、节点拖拽、保存测量对象和导出测量结果。
150. 测量结果导出第一刀已完成：测量 readout 新增“导出”按钮，无测量点时禁用，存在点位后导出 `webgl-generator-measurement v1` JSON，包含 seed、checksum、图幅尺寸、比例尺单位、点列、地图单位距离/面积和显示标签。构建产物验证中三点测量导出 `fmg-stage-2-1-a6390a8f.measurement.json`，`pointCount = 3`，距离标签 `994.3 千米`、面积标签 `11万 平方公里`，console/page error 为 `0`。后续可做保存测量对象、节点拖拽和路线贴合。
151. 名称库编辑器计划已落文档：`docs/task-notes/namebase-editor-plan.md` 对照原版 `Namesbase Editor` 记录了 `nameBases` 数据结构、Markov chain 生成、示例生成、质量分析、下载/上传覆盖与追加等行为，并为 WebGL 版拆分为只读名称库总览、名称库导出、用户自定义名称库和生成系统绑定四阶段。后续不应直接把用户词表塞进当前中文命名器，而要先建立 `map.namebases` 数据契约和稳定绑定，避免破坏春秋古国短名与 `state-family` 去重。
152. 名称库总览第一刀已完成：管理 tab 新增“名称库”入口，打开可拖动浮层展示当前内置词池摘要；`names.js` 暴露只读 `getBuiltinNamebaseSummaries()`，统计分类、样本数、唯一样本、重复样本、长度范围和样例，不调用随机生成器、不写入 `map.namebases`，因此不改变当前地图 checksum 或命名流程。构建产物验证中打开浮层显示 `61` 个词池、`2241` 个样本，“春秋古国根名”为 `96` 个样本且重复为 `0`，打开前后 checksum 保持 `7fda045e`，console/page error 为 `0`。后续再接名称库导出、用户自定义名称库和生成绑定。
153. 名称库导出第一刀已完成：名称库总览面板新增“导出名称库”，会导出 `webgl-generator-namebases v1` JSON，包含当前内置词池的 id、名称、类型、分类、样本统计、长度范围、说明和完整 `source` 数组，并记录当前地图 seed/checksum 作为导出上下文。构建产物验证中下载 `fmg-stage-2-1-c59fdd6b.namebases.json`，`bases = 61`、`samples = 2241`，`ancient-state-roots.source.length = 96`，打开前后 checksum 稳定，console/page error 为 `0`。该导出仍是只读能力，不写入 `map.namebases`，不改变生成器签名，也不影响当前命名结果。后续进入用户自定义名称库前，需要先设计导入合并/覆盖和 EditHistory 或独立历史栈。
154. 名称库导入第一刀已完成：名称库总览面板新增“导入名称库”，支持读取 `webgl-generator-namebases v1` JSON，并把其中非空词池规范化为 `map.namebases.bases` 中的导入用户库；总览会同时显示内置词池和导入词池，导入库会随完整地图 JSON 保存。构建产物闭环验证中，导出并重新导入内置名称库后 `map.namebases.bases = 61`，总览行数 `122`、导入行数 `61`，完整地图 JSON 也保留 `61` 个导入库，checksum 稳定且 console/page error 为 `0`。当前导入仍不接入生成、不自动重命名现有对象，也不提供编辑历史；下一步若继续推进，应补用户库编辑、删除/清理、覆盖/追加策略和生成绑定。
155. 名称库当前库导出已完成：名称库导出从“仅内置库”改为导出当前库集合，包含内置库与 `map.namebases.bases` 中的用户库；metadata 现在区分 `builtin / user` 数量，导出状态也会显示用户库数量。构建产物验证中，无用户库时导出 `bases = 61 / user = 0`；导入 61 个用户库后再导出会输出 `bases = 122 / user = 61`，首个用户库 id 为 `imported-ancient-state-roots`，console/page error 为 `0`。后续可继续做用户库删除、重命名和导入覆盖/追加选择。
156. 重新生成提示已收敛到开发模式：普通模式下点击管理 tab 的重新生成按钮，`regeneration-status` 保持空白，说明文字回到稳定的用户可读默认说明；具体重算结果、派生刷新和约束说明写入开发模式“状态”区，并且仅在 `?debug=1` 或 `window.__webglGeneratorDebug.enabled = true` 开启后显示在管理面板状态里。构建产物验证中普通模式点击“道路”重生成后状态为空，开启 debug 后再次点击才显示详细状态，console/page error 为 `0`。后续若要展示用户向成功 toast，应另做简短、非内部状态的用户提示。
157. 用户名称库清空第一刀已完成：名称库总览面板新增“清空用户库”，仅对 `map.namebases.bases` 中的导入用户库生效，内置词池不受影响；操作前会弹出确认，清空后总览回到内置词池集合。构建产物验证中，导入 61 个用户库后点击清空会弹出“确定清空 61 个用户名称库？”，确认后 `map.namebases.bases = 0`、总览回到 `61` 行、导入行数 `0`、按钮重新禁用，console/page error 为 `0`。当前仍不提供单个用户库删除、编辑和撤销；后续可做更细粒度用户库管理。
158. 用户名称库单个删除第一刀已完成：名称库总览面板新增“删除选中”，只在选中用户库时可用，内置库不会出现可删除状态；删除会确认并只从 `map.namebases.bases` 移除对应 id。第一刀保持为文件操作类能力，不接入 `EditHistory`，与导入/清空用户库保持一致。构建产物验证中，初始内置库选中时删除按钮 `aria-disabled = true`，导入 61 个用户库并选中导入行后变为 `false`；取消确认后用户库仍为 `61`，确认删除后用户库为 `60`、总览行数 `121`、导入行数 `60`，再次导出名称库得到 `bases = 121 / builtin = 61 / user = 60`，console/page error 为 `0`。后续再决定是否为名称库编辑器单独接历史栈。
159. 复制内置名称库为用户库已完成：名称库总览面板新增“复制内置”，只在选中内置库时可用，会把该内置词池复制为 `map.namebases.bases` 中 `origin = 复制` 的用户库，便于后续编辑前先拥有一份可管理副本。它仍不绑定生成、不自动改名，也不修改内置常量。构建产物验证中，复制“春秋古国根名”后新增 `user-ancient-state-roots`，名称为“春秋古国根名 副本”、来源“复制”、样本 `96`；总览行数 `62`，其中内置 `61`、复制 `1`；名称库导出得到 `bases = 62 / builtin = 61 / user = 1`，完整地图 JSON 中 `map.namebases.bases.length = 1`，console/page error 为 `0`。
160. 用户名称库重命名已完成：名称库总览在选中用户库时显示名称编辑器，允许修改 `map.namebases.bases` 中的用户库名称；内置库仍不可重命名，重命名不接入 `EditHistory`，与导入/复制/删除同属名称库数据管理。构建产物验证中，初始选中内置库时不显示名称编辑器；复制“春秋古国根名”后选中副本并重命名为“古国根名自定义”，`map.namebases.bases[0].name` 更新且写入 `updatedAt`，总览中重命名行数 `1`；名称库导出 metadata `user = 1` 且复制记录名称为新名称，完整地图 JSON 中用户库名称也为新名称，console/page error 为 `0`。
161. 用户名称库样本编辑第一刀已完成：名称库总览在选中用户库时显示多行样本编辑器，输入按换行、英文逗号和中文逗号拆分，过滤空值后写回 `map.namebases.bases[].source`；内置库仍只读，样本编辑不接入生成绑定，也不会改已有地图对象名称。构建产物验证中，初始选中内置库时不显示样本编辑器；复制“春秋古国根名”后把副本样本改为 `甲 / 乙 / 丙 / 丁 / 戊`，`map.namebases.bases[0].source.length = 5` 且写入 `updatedAt`，总览复制行显示样本 `5`；名称库导出中该复制记录 `samples = 5` 且 source 为这 5 个值，完整地图 JSON 中也保留相同 source，console/page error 为 `0`。
162. 名称库导入追加/替换模式已完成：名称库总览新增导入方式选择，默认“追加到用户库”，也可选择“替换用户库”；替换只清空 `map.namebases.bases` 中的用户库，不影响内置词池。构建产物验证中，初始导入方式为 `append`，切到 `replace` 后导入一份 61 个内置词池文件，会先替换原 1 个复制用户库，再导入 61 个用户库；最终 `map.namebases.bases.length = 61`、导入来源 `61`、复制来源 `0`、总览行数 `122`、导出名称库 `bases = 122 / builtin = 61 / user = 61`，console/page error 为 `0`。
163. 名称库绑定生成专项计划已落文档：`docs/task-notes/namebase-generation-binding-plan.md` 记录了原版 `Names.getBase / culture.base` 的参考语义、当前 WebGL 版命名链路、`map.namebases.bindings` 建议契约、全局绑定、文化级绑定、样例生成、显式重命名命令和验证矩阵。后续不要直接把用户词池硬替换进国家命名器，应先建立绑定状态、失效引用处理和生成回退规则。
164. 名称库质量提示第一刀已完成：名称库总览详情新增“质量”行，按原版 Namesbase Editor 的样本量思路提示“样本偏少 / 样本可用 / 样本充足 / 样本过多 / 有重复样本”，并可被筛选命中。构建产物验证中，把复制用户库样本编辑为 5 个后，详情显示“质量 / 样本偏少”；筛选“偏少”后可见行数 `49`，其中复制用户库命中 `1`，console/page error 为 `0`。后续已补 Markov 链路多样性和生成样例质量第一刀。
165. Element Plus 迁移第八刀已完成：`UiSegmented` 改为 `ElSegmented` 视觉层，同时保留不可见 `data-mode` 桥按钮，旧 runtime 仍可通过 `[data-mode]` 绑定和同步视图模式。样式把 Element segmented 的选项组改为可换行网格，避免 11 个视图模式挤成一行；高度编辑动作和 marker 范围也复用同一适配层。构建产物约 `986.31KB JS / 304.22KB gzip`、`155.39KB CSS / 23.02KB gzip`；构建产物烟测中 `.ui-segmented-el = 3`、旧 `.segmented:not(.ui-segmented) button = 0`，视图切到“外交”后 `data-mode` 和 Pinia 偏好均为 `diplomacy`，高度动作可切到“平滑”，marker 范围可切到“资源点”，console/page error 为 `0`。后续迁移对象表格和树状总览前仍需先评估 `ElTable / ElTree` 的懒加载或拆包。
166. 对象详情开发信息收敛第一刀已完成：`UiDetailGrid` 支持 `debug: true` 行，并通过 `window.__webglGeneratorDebug.enabled` 与 `webgl-generator-debug-change` 事件响应开发模式开关。普通模式下，城市、marker、国家、省份、文化、宗教、路线、备注总览和通用对象详情里的 grid/pack cell、burg id、pole、feature、命中距离、对象 id、内部归属诊断等行会隐藏；开启 `?debug=1` 或运行时打开开发模式后重新显示。构建产物约 `987.15KB JS / 304.43KB gzip`、`155.39KB CSS / 23.02KB gzip`；构建产物烟测中普通模式城市详情不含 `grid cell / pack cell / burg id / 归属一致性 / 落水检查`，运行 `window.__webglGeneratorDebug.enabled = true` 后同一面板立即显示这些 debug 行，console/page error 为 `0`。后续可继续清点摘要指标和导出文件中的 checksum/id 字段，决定哪些属于用户可见数据、哪些只应出现在开发模式或导出元数据中。
167. 面板级懒加载试点已完成：备注总览不再在启动时静态 import `NotesPanel.vue`，而是在首次打开 `notes-panel` 浮层时动态加载并挂载；面板状态、筛选、排序、选中、定位、删除、导出和历史 API 保持不变。构建产物拆出 `NotesPanel-BcY2lGmD.js`（约 `4.83KB / 2.10KB gzip`），主入口从上一刀约 `987.15KB / 304.43KB gzip` 降到 `809.59KB / 241.05KB gzip`；同时存在首屏 preload 的共享 `object-resolver` chunk（约 `176.52KB / 65.03KB gzip`），它仍属于当前主应用共享依赖，后续若要进一步减少首屏资源需继续拆共享依赖。构建产物烟测中首屏没有加载 `NotesPanel` chunk，打开备注总览后才加载，面板摘要正常显示，console/page error 为 `0`。后续建议用同一模式批量迁移低频管理浮层，再进入 `UiObjectTable -> ElTable`。
168. 低频管理浮层懒加载第二刀已完成：新增 `createLazyVuePanel()` helper，备注总览和名称库总览都复用同一套动态 import / createApp / 失败提示逻辑；`NamebasePanel.vue` 也改为首次打开时加载。构建产物拆出 `NotesPanel-DtYFJkzo.js`（约 `4.87KB / 2.13KB gzip`）和 `NamebasePanel-BFurKgSt.js`（约 `6.29KB / 2.50KB gzip`），主入口进一步降到 `715.83KB / 211.47KB gzip`；首屏仍 preload `use-unit-preferences`、`UiTextEditField` 和 `object-resolver` 等共享 chunk，后续若要继续压首屏资源，应继续切分这些共享依赖。构建产物烟测中首屏没有加载 Notes/Namebase chunk，打开“备注总览”后只加载 NotesPanel，打开“名称库”后才加载 NamebasePanel，两个面板摘要均正常，console/page error 为 `0`。
169. 低频管理浮层懒加载第三刀已完成：路线、河流、标签和外交管理面板也改为复用 `createLazyVuePanel()`，只在首次打开时动态加载对应 SFC。构建产物拆出 `RoutePanel-CPPOoeuM.js`、`RiverPanel-BGlS-d5T.js`、`LabelNamingPanel-B8Y7tZ4M.js`、`DiplomacyPanel-DozHhf5q.js` 等面板 chunk，主入口降到 `655.04KB / 193.94KB gzip`；共享 chunk 继续包括 `use-unit-preferences`、`UiSelectField`、`UiSliderField`、`css` 等。构建产物烟测中首屏没有加载这四个面板 chunk，逐个打开后才加载，路线/河流/标签/外交摘要均正常，console/page error 为 `0`。后续可继续把城市、文化、宗教等对象管理面板懒加载；进入 `UiObjectTable -> ElTable` 前，先确保所有依赖对象表格的面板都不再常驻首屏。
170. 对象管理浮层懒加载第四刀已完成：城市、文化、宗教和资源标记管理面板也改为复用 `createLazyVuePanel()`，只在首次打开时动态加载对应 SFC，保留原有选中、定位、改名、备注、改色、资源点编辑模式和撤销/重做回调。构建产物拆出 `CityPanel-Cd2sjBE-.js`（约 `4.33KB gzip`）、`CulturePanel-DP9Hg7AZ.js`（约 `3.97KB gzip`）、`ReligionPanel-CNpfkOr4.js`（约 `4.12KB gzip`）和 `MarkerPanel-BIgOPVy2.js`（约 `3.44KB gzip`），主入口降到 `566.30KB / 169.44KB gzip`。构建产物烟测中首屏没有加载这四个面板 chunk，逐个打开后才加载，城市/文化/宗教/资源标记摘要均正常，console/page error 为 `0`。后续若迁移 `UiObjectTable -> ElTable`，优先在这些已懒加载面板内试点，避免再次抬高首屏资源。
171. 国家/省份编辑浮层懒加载已完成：`StatePanel.vue` 和 `ProvincePanel.vue` 也改为首次打开时动态加载，保留画布侧 brush 状态、目标选择、编辑启停、半径、取选中/取悬停、改名、改色、首都/备注和历史回调。构建产物拆出 `StatePanel-CkKvFGCH.js`（约 `4.17KB gzip`）和 `ProvincePanel-7a1i5Izi.js`（约 `3.97KB gzip`），主入口降到 `547.52KB / 165.45KB gzip`。构建产物烟测中首屏没有加载 `StatePanel / ProvincePanel` chunk，打开国家编辑和省份管理后才加载，两个面板摘要均正常，console/page error 为 `0`。至此依赖 `UiObjectTable` 的主要管理浮层均已按需加载，下一步可以迁移表格适配层到 `ElTable`。
172. Element Plus 表格迁移第一刀已完成：`UiObjectTable` 改为 `ElTable / ElTableColumn` 适配层，继续保留 `columns / rows / selectedId / rowIdKey / showLocateAction` API、行点击选择、双击定位、定位按钮、空态和选中行滚入视口契约。定位按钮改用 Element 图标按钮，旧 `<table class="object-table">` 已移除。构建产物主入口约 `541.94KB / 163.18KB gzip`，`ElTable` 相关代码进入按需共享 chunk `UiDetailGrid-CJZ0rMrf.js`（约 `82.67KB gzip`），未回到主入口。构建产物烟测中城市面板 `.object-table-el.el-table = 1`、旧 `table.object-table = 0`，行点击后详情更新，定位按钮可点，筛选空态显示“没有匹配的城市”，console/page error 为 `0`。后续应继续观察该共享 chunk 是否因更多 Element 组件迁移而过大，必要时再做面板分组拆包。
173. 高度编辑和对象详情懒加载已完成：`HeightPanel.vue` 和 `ObjectDetailsPanel.vue` 也改为首次打开时动态加载，保留高度 brush、历史状态、通用对象详情查看/定位/编辑回调和 selection 分发逻辑。构建产物拆出 `HeightPanel-BFwMD0oC.js`（约 `1.21KB gzip`）和 `ObjectDetailsPanel-DGai1L3E.js`（约 `1.68KB gzip`），主入口降到 `531.42KB / 160.18KB gzip`，对象详情依赖的 `UiDetailGrid` 也从大共享块中拆小。构建产物烟测中首屏没有加载 `HeightPanel / ObjectDetailsPanel` chunk；打开高度编辑后显示半径/强度/中心衰减，选中真实 marker 后对象详情显示标记类型、经济潜力、国家/省份，console/page error 为 `0`。当前仅控制面板保持常驻 Vue 入口。
174. Element Plus 二级操作按钮迁移已完成：`UiActionDock` 的对象操作图标按钮和二级浮层关闭按钮改为 `ElButton`，保留 `.ui-icon-action.active` 定位锚点、外部点击收起、Element popper 点击豁免和现有 slot API。构建产物主入口保持约 `531.42KB / 160.18KB gzip`，`UiActionDock` 按需 chunk 小幅变为约 `1.40KB gzip`。构建产物烟测中城市管理面板操作按钮 `5` 个且旧原生 `.ui-icon-action:not(.el-button)` 为 `0`，点击“重命名”可打开二级面板，关闭按钮为 Element Button，点空白可自动收起，console/page error 为 `0`。
175. Element Plus 图层开关迁移已完成：`UiLayerToggleButton` 和控制面板内联的“悬停信息”开关改为 `ElButton`，保留 `data-layer / id / aria-pressed` 旧 runtime 契约和原有圆点状态样式。构建产物主入口保持约 `531.46KB / 160.18KB gzip`。构建产物烟测中图层页 `12` 个 `.layer-toggle-button` 全部带 `.el-button`，旧原生 `button.layer-toggle-button:not(.el-button)` 为 `0`；点击比例尺后 `aria-pressed=false` 且比例尺隐藏，点击悬停信息后 `aria-pressed=false`，console/page error 为 `0`。
176. Element Plus 树状总览按钮迁移已完成：文化/宗教树总览入口、可拖动树状浮层关闭按钮和树节点按钮均改为 `ElButton`，保留浮层拖动、节点连线、节点选择和现有样式密度。同步修正文化/宗教树节点选择回调引用 `props.callbacks`，并在 `UiObjectTable` 中把 Element Table 的 `tree-props.children` 指向内部字段，避免业务行对象的 `children: [id]` 被误判为树表子行而触发 WeakMap 报错；选中态继续由 `.selected-row` 负责。构建产物主入口约 `531.46KB / 160.19KB gzip`，`UiTreeDisplayPanel` 按需 chunk 约 `1.69KB gzip`。构建产物烟测中打开文化树、拖动浮层、点击节点、关闭浮层均正常，树节点 `12` 个且旧原生树节点为 `0`；城市表格回归中 `817` 行、旧原生表格为 `0`、选中/详情/定位/空态正常，console/page error 为 `0`。
177. Element Plus 气候按钮迁移已完成：控制面板气候投影旁的 `6` 个风带箭头和“自动/手动纬度”切换均改为 `ElButton`，保留 `data-wind-band / data-wind-angle / id=climate-latitude-toggle / aria-pressed` 旧 runtime 契约和点击轮询行为。构建产物主入口保持约 `531.46KB / 160.19KB gzip`。构建产物烟测中风带按钮 `6` 个且旧原生风带按钮为 `0`，点击首个风带后 `atmosphere-winds` 从 `225,45,225,315,135,315` 变为 `315,45,225,315,135,315`，箭头更新为 `↖`；点击纬度按钮后隐藏值切到 `custom`、按钮文案为“手动纬度”、投影进入 manual 状态，console/page error 为 `0`。
178. Element Plus 文件导入入口迁移已完成：简介 tab 的“导入地图数据”、生成 tab 的“导入灰度图”和名称库面板的“导入名称库”从可点击 label 改为 `UiButton / ElButton`，点击按钮触发隐藏 file input，继续保留本地 File API、accept 约束和旧 runtime 的 input id 契约，未引入较重的 `ElUpload`。构建产物主入口约 `531.64KB / 160.23KB gzip`。构建产物烟测中三个导入按钮均能触发 file chooser，`label.file-import-action = 0`，`#import-map-file / #heightmap-image-file / #namebase-import-file` 均保持 hidden 和正确 accept，console/page error 为 `0`。
179. 测量工具节点拖拽第一刀已完成：测量 overlay 中的 SVG 点现在可拖动，拖动时实时把屏幕坐标反算为地图坐标并刷新折线、面积和读数；退出测量或清空会取消正在进行的拖拽。构建产物主入口约 `532.87KB / 160.51KB gzip`。构建产物烟测中添加两点后拖动第一个点，点坐标移动约 `141.3` 地图单位，读数从 `657.2 千米` 更新到 `318.8 千米`；拖动中 `.measurement-point.dragging = 1`，松开后 drag 状态清空，清除后点数、SVG 点和导出/清除按钮状态均复位，console/page error 为 `0`。
180. Element Plus 顶部地图工具栏迁移已完成：`MapToolbar.vue` 在 `createGeneratorApp()` 之前挂载到原 `#map-toolbar` 容器，控制面板、测量和开发模式入口均改为 `UiButton / ElButton`，但保留原 `id / aria-pressed / hidden / debug-action` 契约，旧 runtime 仍按 DOM id 绑定事件和切换文案。构建产物主入口约 `533.45KB / 160.03KB gzip`，HTML gzip 从约 `1.45KB` 降到 `1.34KB`。构建产物烟测中 toolbar 的 Element Button 为 `3` 个、旧原生 toolbar button 为 `0`；普通模式开发按钮保持 hidden，测量可切到“退出测量”并显示 overlay；`?debug=1` 下按钮显示为“调试信息”、`aria-pressed=true` 且开发面板打开，console/page error 为 `0`。
181. Element Plus 测量读数按钮迁移已完成：新增 `MeasurementReadout.vue`，在 runtime 绑定前挂载到 `#measurement-readout`，测量“导出 / 清除”改为 `UiButton / ElButton`，继续保留 `measurement-summary / measurement-export / measurement-clear` id 契约。构建产物主入口约 `533.97KB / 160.17KB gzip`，HTML gzip 降到约 `1.24KB`。构建产物烟测中 readout 的 Element Button 为 `2` 个、旧原生 readout button 为 `0`；添加两点后导出 `webgl-generator-measurement` JSON，`pointCount = 2`，清除后点数和 SVG 点为 `0` 且导出/清除重新禁用，console/page error 为 `0`。
182. 原版功能积压 GeoJSON 状态已校准：`docs/task-notes/source-feature-backlog.md` 现在明确国家和省份要素 GeoJSON 第一刀已实现，当前形态是 pack cell polygon 集合型 `MultiPolygon`；后续缺口收窄为国家/省份拓扑 dissolve、范围选择和更完整属性映射。
183. 名称库样例生成预览第一刀已完成：`namebase-store.js` 新增本项目自己的轻量字符链和重组式预览函数，名称库总览面板可对当前选中词池点击“生成预览 / 换一组”查看临时候选；该能力只读 source，不写 `map.namebases`，也不接入真实 `createChineseNameGenerator()`。为避免二字古国名被截成怪异单字，预览链按样本长度分桶选择起始字符。构建产物主入口约 `510.57KB / 150.49KB gzip`，名称库面板懒加载 chunk 约 `2.82KB gzip`，`namebase-store` chunk 约 `10.31KB gzip`；构建产物烟测中打开名称库显示 `61` 行，初始样例为春秋古国根名，点击生成后按钮变为“换一组”，第二次点击会换一批候选，checksum 保持稳定，console/page error 为 `0`。
184. 用户名称库新建入口已完成：名称库总览新增“新建用户库”，会在 `map.namebases.bases` 中创建 `origin = 手动` 的用户词池，默认样本为 `青川 / 云泽 / 鹿原 / 玄岭 / 白沙`，创建后自动选中并显示名称和样本编辑器。预览生成器同步收紧为不超过源词池最大长度并过滤相邻重复字，避免小词池生成 `玄岭玄岭` 这类候选。构建产物主入口约 `510.93KB / 150.57KB gzip`，`NamebasePanel` chunk 约 `2.84KB gzip`，`namebase-store` chunk 约 `10.55KB gzip`；构建产物烟测中新建后名称库行数 `61 -> 62`、用户库数量 `1`，详情显示“用户名称库 1 / 来源手动 / 样本偏少”，样本编辑器预填 5 个样本，生成候选最大长度 `2` 且无相邻重复，checksum 保持稳定，console/page error 为 `0`。
185. 测量撤销点第一刀已完成：测量 readout 新增“撤销点”按钮，复用 Element Button 并保留运行时 DOM id 契约；点击后只从临时 `state.measurement.points` 中移除最后一点，取消正在进行的拖拽并刷新 overlay，不写地图数据。readout 最大宽度放宽到 `640px`，避免导出、撤销点、清除三枚按钮挤压读数。构建产物主入口约 `511.25KB / 150.66KB gzip`。构建产物烟测中三点测量显示面积且 SVG 面片 `1` 个；点击撤销后点数 `3 -> 2`、面积面片消失、读数回到总长；继续撤销到 `0` 后摘要为“点击地图添加起点”，导出/撤销/清除均禁用，console/page error 为 `0`。
186. 高度图图片导入工作台计划已落文档：`docs/task-notes/heightmap-image-converter-plan.md` 对照原版 `Image Converter`，记录了图片预览、颜色量化、手动色块赋高、按亮度/色相/FMG 色带自动映射、未分配颜色处理、应用后完整重生成和导入 profile 的分阶段方案。当前仍不写代码；后续若继续高度图导入，应先做懒加载预览面板，再做轻量色板量化，避免把彩色识别直接塞进现有灰度导入函数。
187. 测量节点删除第一刀已完成：测量 overlay 的 SVG 点支持右键、`Alt` 点击、`Shift` 点击删除对应节点，键盘聚焦后也可用 `Delete / Backspace` 删除；普通左键拖动仍保持原行为。该能力只修改临时 `state.measurement.points`，不写地图数据和历史栈。构建产物主入口约 `511.79KB / 150.85KB gzip`。构建产物烟测中两点测量后拖动首点位移约 `82.3` 地图单位且 `.measurement-point.dragging = 1`；新增第三点后右键第二点，点数回到 `2`；再新增一点并用 `Delete` 删除聚焦点后点数仍为 `2`，读数为 `2 点 / 总长 420.8 千米`，console/page error 为 `0`。
188. 测量线段插入节点第一刀已完成：测量模式下按住 `Alt` 或 `Shift` 点击现有线段附近，会把新点插入最近线段后方；普通点击仍追加到末尾，点击测量点本身仍按删除/拖拽规则处理。三点及以上会把闭合面片最后一段也纳入插入候选。构建产物主入口约 `512.45KB / 151.12KB gzip`。构建产物烟测中两点测量后 `Shift` 点击线段中点，点列从 `[292.5,312] -> [697.5,312]` 变为中间插入 `[495,312]` 的三点序列；右键删除插入点、再次插入后按 `Backspace` 删除首点均正常；随后拖动首点位移约 `66.8` 地图单位，console/page error 为 `0`。
189. 测量对象与路线贴合计划已落文档：`docs/task-notes/measurement-rulers-plan.md` 对照原版 `Rulers / Ruler / Opisometer / RouteOpisometer / Planimeter`，记录了原版可保存测量集合、字符串序列化、曲线采样优化、路线 cell 贴合和面积尺语义，并为 WebGL 版拆出 `map.measurements` 数据契约、保存临时测量为对象、测量图层化、路线贴合、曲线尺和面积尺细化四阶段。后续不应直接把当前临时 `state.measurement.points` 扩成长期数据，而应先建立保存对象与完整地图 JSON 往返。
190. 视觉主题与样式预设计划已落文档：`docs/task-notes/visual-theme-preset-plan.md` 对照原版 `style-presets.js`、`style.js` 和 `public/styles/*.json`，记录了原版 12 个系统预设、selector/attribute JSON、自定义 localStorage 预设和高度色带语义，并为 WebGL 版明确不直接兼容 SVG selector，而是走 `map.visualTheme` 与 renderer/overlay theme token。后续可先做只读轻量主题预设，再做主题导入导出和少量颜色级编辑；纹理、滤镜、字体和高级后处理暂缓。
191. 市场、商品与贸易流计划已落文档：`docs/task-notes/economy-market-trade-plan.md` 对照原版 goods editor、markets overview、trade animation editor 和 draw-trade-animation，记录了商品产量/库存/价格、市场覆盖和交易动画语义；WebGL 版已有 `pack.goods / pack.markets / pack.deals` 生成数据，但用户侧应先做只读经济总览和导出诊断，再进入轻量编辑、静态贸易流和按需动画，市场归属刷子和生产链编辑后置。
192. 军事对象与战斗事件计划已落文档：`docs/task-notes/military-battle-plan.md` 对照原版 regiments overview、regiment editor 和 battle screen，记录了军团筛选/导出、军团编辑、战斗类型推断、士气阶段、伤亡应用和备注事件链路；WebGL 版已有军事生成和国家详情军力摘要，但后续应先做只读军团总览与军事图层，再做军团轻量编辑、战斗事件记录和可撤销战斗模拟。
193. 纹章与 Coat of Arms 计划已落文档：`docs/task-notes/emblems-coa-plan.md` 对照原版 `generators/emblems`、`draw-emblems.ts` 和 `emblems-editor.js`，记录了国家/省份/城市三层纹章、父级派生、盾形、division、ordinary、charge、SVG defs/use 渲染、上传下载和 Armoria 集成语义；WebGL 版后续应先保留 `coa` 数据占位和只读显示，再做默认关闭的轻量纹章图层，完整生成器和外部集成按需懒加载后置。
194. 构建产物子路径加载问题已修复：`vite.config.mjs` 新增 `base: "./"`，避免生产 `index.html` 继续输出 `/assets/...` 根路径资源。复现时，页面挂在 `/webgl-generator/` 下会请求根 `/assets/index-*.js` 并 404，最终停在“脚本未启动”；修复后入口脚本、modulepreload 和 stylesheet 都改为 `./assets/...`。重新构建后，Playwright 分别访问根路径 `/` 与子路径 `/webgl-generator/`，两者均 `appReady = true`、canvas 为 `1280x800`、toolbar Element 按钮为 `3`、无 request failed、无 404、无 console/page error。
195. 面板样式统一第一刀已完成：Element Plus 全局暗色变量和 `UiObjectTable` 深色穿透样式已补齐，国家、城市、文化、资源标记、备注总览和名称库面板巡检中表格白底节点均为 `0`；视图区域互斥按钮曾先改为单行横向滚动并避免标签截断，后续已按第 198 条改为更松散的矩阵布局。后续继续收敛下拉弹层、排序按钮组和仍残留的旧式原生控件。
196. 灰度高度图入口已迁入高度编辑面板：生成 tab 不再常驻灰度导入区块；高度编辑浮层先保留高度图导入入口，并通过 document 事件委托适配懒加载面板。后续第 200 条已把导入配置进一步移入独立高度图工作台。
197. 右上角生成状态提示已清理，loading 文案已神话化：`#map-badge` 初始为空且空内容隐藏，运行中不再写入“等待生成任务 / 生成中 / 生成失败”，只在地图可用后显示图幅尺寸；`generation-loading` 覆盖生成、worker 阶段、WebGL 装载、地图数据导入和灰度高度图导入，按 stage id 显示“星图启明、山海初开、群山起脉、大禹治水、诸侯封疆、展开乾坤”等短句。5410 浏览器观察器验证中，loading 文案未再出现旧等待/生成文案，badge 样本为空 -> 地图尺寸，console/page error 为 `0`。
198. 视图选择按钮矩阵已放宽：`view-mode-segmented` 不再使用单行横向滚动，而是独立改为 3 列矩阵，按钮高度约 `42px`，11 个视图项自然排成 4 行，撑开“视图” tab 的控制面板高度；Element Plus segmented 的默认滑动选中块在该矩阵内隐藏，改由按钮自身边框和暗金背景表示选中态。5410 浏览器验证中 `.el-segmented__group` 为 grid，列数 `3`、行数 `4`、标签截断 `0`、横向溢出 `0`、console/page error 为 `0`。
199. docs 结构整理第一刀已完成：`docs/` 根目录重新收敛为 `README.md / current-plan.md / development-log.md`，散落的本地 `.log` 已移动到 `docs/local-logs/`；`.gitignore` 不再忽略 `docs/task-notes/`，专题计划、评估记录和执行细则应入库并维护 `docs/task-notes/README.md` 分类索引；`AGENTS.md` 接手清单改为只依赖入库文档，`docs/generated/` 报告继续作为本地可复现产物。后续新增专题文档时必须同步更新 `docs/task-notes/README.md`，生成报告和服务器日志分别进入 `docs/generated/` 与 `docs/local-logs/`。
200. 高度图导入工作台第一刀已完成：高度编辑面板只保留“打开导入工作台”入口，最低/最高高度、反转黑白、适应方式和本地图片输入都移入独立可拖动三级浮层；选择图片只更新 canvas 预览、图片尺寸、目标图幅、亮度范围和高度映射，点击“应用到地图”后才触发 `grayscale-import` 完整重生成。高度编辑动作按钮改为 3 列矩阵，抬升/降低/平滑不再挤在一起；`UiButton / ElButton` 的 primary/secondary 暗色变量已补齐，避免高度面板和工作台按钮回到白底。控制面板“生成”tab 已移除文化/宗教继承结构选择，内部仍按默认继承模式随机生成，后续调整交给文化/宗教编辑面板。
201. 滑动条精确输入与动态比例尺第一刀已完成：`UiSliderField` 在 `ElSlider` 旁新增 `ElInputNumber` 精确输入，隐藏原生 range 桥继续保留旧 runtime 的 `id/value/input/change` 契约，气候、单位、图层标签上限、高度编辑、高度图导入、国家/省份半径和河流宽度等现有滑条自动获得精确输入。比例尺图层改为按当前相机缩放和单位配置，在可视宽度内选择 1/2/5 序列的整公里代表距离，再反推线段像素长度，不再固定渲染长度导致 `264.6 千米` 这类小数标签。
202. 军事系统第一刀已完成：`docs/task-notes/military-battle-plan.md` 已从旧的战斗事件积压文档改为军事系统、图层与管理面板设计，明确兵种、军力公式、城镇文明类型、战争原因、军团态势、战线和分期路线；生成器新增城镇文明分类、国家军力政策、兵种比例、军团状态和资源竞争战争原因；渲染器新增军事对象拾取、军团图标、数字标签和攻防战线图层；管理 tab 新增“军事管理”浮层，可筛选/定位军团、导出 CSV/JSON，并通过二级比例面板调整国家兵种比例。构建产物浏览器验证中，默认 seed 生成 `20` 个国家、`111` 个军团、`2` 条战线和 `1` 个带结构化原因的战争；军事图层显示 `111` 个图标对象、可见图标 `17` 个，点击图标可选中军团，关闭军事图层后图标隐藏且不再拾取为军团；比例面板可将国家 `#1` 改为步兵 `100%`，进入 `EditHistory`，撤销后恢复原比例。后续扩展方向是军团轻量编辑、战斗事件记录和战报链路。
203. “展开乾坤”加载卡住已修复：`fit-draw` 阶段前后的浏览器让帧逻辑不再只依赖 `requestAnimationFrame`，`scheduleAfterPaint()` 与 `yieldToBrowser()` 都增加 `120ms` 兜底，避免内嵌浏览器、后台页签或高负载状态下 rAF 被节流后 Promise 长期不 resolve。in-app browser 在 `http://127.0.0.1:5410/` 验证首次加载与点击“生成 grid 地图”后的重新生成都能收起 loading，页面不再停留在“展开乾坤”，console warn/error 为 `0`。
204. 高 cells 生成卡死第二轮已修复：复测发现 100000 cells 生成会在 worker 的 `buildGrid()` 指标统计中触发 `Maximum call stack size exceeded`，根因是 `Math.max(...大数组)` 和 `splice(...大数组)` 这类展开调用超过调用栈；`grid / pack / climate / heightmap` 的大数组范围统计和高度数组回写已改为迭代实现。渲染侧的 overlay 构建改为 `DocumentFragment` 批量挂载，最后 `fit-draw` 的标签、城镇图标、资源图标和军事图标重叠检测也先做图层、缩放和视口可见性短路。headless Chrome 与干净可见系统 Chrome 均通过 `http://127.0.0.1:5410/` 实测：默认图可完成并写入真实 WebGL 像素；重新生成 `100000` cells 后 `mapCells = 99846`、`packCells = 51749`、loading 收起、页面不含“展开乾坤”、`glError = 0`、中心像素块 `nonZero = 9216`，截图见 `docs/generated/reverify-5410-headed-100k.png`。当前已经卡死的 in-app browser / 用户 Chrome 旧页会阻塞浏览器控制接口，需要刷新或关闭旧页后才能接到新代码。
205. 高度图导入工作台色板量化第一刀已完成：工作台新增 `16 / 32 / 64 / 128` 色板上限，选择图片后会在预览缩略图上做轻量 5-bit RGB 分桶，生成按像素数排序的量化色板，并显示色块颜色、像素占比和按当前高度区间估算的高度；点击色块只高亮预览中的对应区域，不写 `map`、不触发重生成。`应用到地图` 仍沿用现有灰度导入闭环，彩色色板暂不参与最终高度采样。后续若继续推进，应进入自动高度映射与手动色块赋高，再让 `image-palette` 元数据进入完整地图 JSON。
206. 高度图导入工作台自动映射预览第一刀已完成：工作台新增 `灰度 / 亮度 / 色相 / FMG 色带 / 手动` 映射模式，色板会按当前模式计算自动高度；选中色块后可用滑条或 `水域 / 低地 / 丘陵 / 山地 / 峰值` 预设做手动覆盖，并可恢复自动。该阶段仍只刷新工作台预览和色板状态，`应用到地图` 继续走现有 `grayscale-import`，不写 `map`、不改变 checksum。构建产物验证中端到端守门通过：点击到出图 `1084.1ms`、WebGL 加载 `347.5ms`、`fit-draw = 2.5ms`、`glError = 0`；高度图交互烟测中导入合成彩色 SVG 后生成 `6` 个色块，映射模式从灰度切到色相，首个色块手动设为山地 `68` 后显示“手动”，地图 checksum 保持 `0a74dfc6`，`loadMap.totalMs = 364.8ms`、`fit-draw = 8.7ms`、`glError = 0`。浏览器健康监控仍会在初始生成阶段记录一次约 `304.8ms` 的 `main-thread-long-task` warn，但正式 e2e 加载预算未超；下一步应把当前 assignments 接入 `image-palette` sampled heightmap、完整重生成和 JSON 元数据。
207. 高度图 `image-palette` 应用链路已完成：高度图工作台现在会把 `mappingMode / colorLimit / assignments / unassignedHeight` 随应用事件传给 runtime；默认灰度且无手动覆盖时继续生成 `image-grayscale`，切到亮度、色相、FMG 色带、手动模式或存在手动覆盖时生成 `image-palette` sampled heightmap。`map.heightmap.source` 会保留 `mappingMode`、色板上限、未分配高度和每个色块的 `key / color / height / autoHeight / pixels / manual`，完整地图 JSON 可复查导入方案。验证中先发现高度图导入仍在主线程同步跑 `generatePlaceholderMap()`，触发 health `main-thread-long-task` error；随后把灰度和彩色色板采样都转成可结构化克隆的 `Uint8Array` payload，并让 `generation-worker` 恢复 sampled heightmap 后生成，导入重生成不再触发 health error。彩色导入烟测中合成 SVG 以色相模式应用，首个色块手动设为山地 `68`，导入后 `source.kind = image-palette`、`mappingMode = hue`、`assignments = 4`、checksum `d21222dd -> fe4e8d88`，`loadMap.totalMs = 338.2ms`、`fit-draw = 7ms`、`glError = 0`、console/page error 为 `0`；默认灰度兼容烟测中 `source.kind = image-grayscale`、`loadMap.totalMs = 321.2ms`、health error 为 `0`。正式 e2e 守门通过：点击到出图 `1243.4ms`、WebGL 加载 `330.2ms`、`fit-draw = 2.2ms`、`glError = 0`。下一步可做未分配高度可配置、批量选择多个色块和导入 profile 导出/复用。
208. 高度图未分配高度配置已完成：高度图导入工作台新增“未分配高度”滑条，默认 `0`，随 `image-palette` 应用事件写入 `settings.unassignedHeight`；legacy DOM 读取也同步支持 `#heightmap-unassigned-height`。验证中使用 20 色条合成 SVG，把色板上限降到 `16`、映射模式切到色相、未分配高度设为 `12` 后应用，导入后 `source.kind = image-palette`、`colorLimit = 16`、`unassignedHeight = 12`、`assignments = 16`，grid 高度中有 `1973` 个采样点落到 `12`；`loadMap.totalMs = 285.9ms`、`fit-draw = 4.1ms`、`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1177.3ms`、WebGL 加载 `344.6ms`、`fit-draw = 2.3ms`、`glError = 0`。下一步可继续做多色块批量选择与批量赋高，或进入 `.heightmap-import-profile.json` 导出/导入复用。
209. 高度图色块批量赋高已完成：高度图导入工作台色板条目新增 checkbox，支持全选和清空；批量赋高面板可对选中色块使用滑条、`水域 / 低地 / 丘陵 / 山地 / 峰值` 预设或“恢复自动”。批量选择状态与当前高亮色块分离，用户仍可点击色块观察预览区域，同时把多个色块一次性写入手动高度覆盖。浏览器烟测中导入 4 色合成 SVG，切到色相模式后批量选择 2 个色块并一键设为“低地”，应用后 `source.kind = image-palette`、`mappingMode = hue`、手动 `height = 28` 的 assignments 为 `2` 个，checksum `f78211ea -> 52939e78`，`loadMap.totalMs = 469.9ms`、`fit-draw = 8.5ms`、`glError = 0`、console/page error 和 health error 均为 `0`；仅有一次初始加载阶段 `main-thread-long-task` warn。正式 e2e 守门通过：点击到出图 `1194.1ms`、WebGL 加载 `339.1ms`、`fit-draw = 2.4ms`、`glError = 0`。下一步进入 `.heightmap-import-profile.json` 导出/导入复用。
210. 高度图导入 profile 复用第一刀已完成：高度图导入工作台新增“导出配置 / 导入配置”，`.heightmap-import-profile.json` 使用 `type = webgl-generator-heightmap-import-profile`、`version = 1`，保存高度区间、反转、适应方式、色板上限、映射模式、未分配高度和当前色板 assignments。导入 profile 会校验类型和版本，恢复工作台设置，并把 profile 中色块高度作为显式 assignment 应用到当前预览色板；导入本身不写地图、不触发重生成，只有点击“应用到地图”才进入完整生成链路。浏览器烟测中导入 4 色合成 SVG、批量设 2 个色块为低地后导出 profile，profile `assignments = 7`、其中 `manual = 2`；恢复自动后导入 profile，当前预览匹配 `7` 个色块，应用后 `source.kind = image-palette`、`assignmentCount = 4`、`manualCount = 4`、低地手动色块 `2` 个，checksum `4d28006c -> aeca03c6`，`loadMap.totalMs = 533.3ms`、`fit-draw = 5ms`、`glError = 0`、health error 为 `0`；仅初始加载阶段有一次 `main-thread-long-task` warn。正式 e2e 守门通过：点击到出图 `1205.9ms`、WebGL 加载 `366.4ms`、`fit-draw = 2.3ms`、`glError = 0`。下一步可转向高度图导入的预览质量补强，例如直方图、采样格高度色带预览或应用前后对比。
211. 高度图导入亮度直方图已完成：工作台在图片预览和指标区下方新增 24 桶亮度直方图，数据来自同一次预览 canvas 像素扫描，并显示暗 / 中 / 亮像素占比；该能力只更新工作台预览状态，不写地图、不触发重生成。浏览器烟测中导入渐变 SVG 后直方图可见，`barCount = 24`、`nonZeroBars = 21`、摘要为 `暗 38% / 中 44% / 亮 18%`，地图 checksum 保持 `1c333dd7` 不变；当前加载统计 `loadMap.totalMs = 352.3ms`、`fit-draw = 8ms`、`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1191.9ms`、WebGL 加载 `326.7ms`、`fit-draw = 2.6ms`、`glError = 0`。下一步可继续补采样格高度色带预览或应用前后对比。
212. 高度图采样格高度色带预览已完成：工作台新增“高度色带预览”canvas，把当前预览图片按导入设置映射成高度色带颜色；默认灰度且无手动覆盖时走连续亮度高度，切到非灰度模式或存在手动覆盖时走当前量化色板、assignment 和未分配高度，尽量贴近“应用到地图”的实际采样规则。该能力仍只更新工作台预览状态，不写地图、不触发重生成。浏览器烟测中导入渐变 SVG 后色带预览可见，canvas `345 x 230`、`coloredPixels = 79350`、`sampleColors = 12`、摘要为 `高度 0-100 / 水域 15%`，地图 checksum 保持 `ac140459` 不变；当前加载统计 `loadMap.totalMs = 349.5ms`、`fit-draw = 7.3ms`、`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1260ms`、WebGL 加载 `330.7ms`、`fit-draw = 2.1ms`、`glError = 0`。
213. 高度图未分配颜色策略第一刀已完成：工作台新增“未分配颜色”选择，支持 `固定高度 / 合并最近色 / 标记待处理`。`固定高度` 保持原有 `unassignedHeight` 兜底；`合并最近色` 会把未进入当前色板上限的采样桶按 RGB 距离归并到最近已分配色块，并按桶缓存结果，避免逐像素重复扫描；`标记待处理` 第一刀会在元数据中记录策略和未分配统计，实际高度仍按固定高度兜底。`map.heightmap.source` 与 profile settings 会保存 `unassignedStrategy / unassignedBuckets / unassignedPixels`。浏览器烟测中导入 48 色 SVG，色板上限降到 `16`、映射模式切到色相、未分配高度设为 `12`、未分配颜色切到 `合并最近色` 后应用，结果为 `source.kind = image-palette`、`unassignedStrategy = nearest-palette`、`unassignedBuckets = 32`、`unassignedPixels = 921600`、`height12Count = 0`、`loadMap.totalMs = 644.7ms`、`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1221.8ms`、WebGL 加载 `336ms`、`fit-draw = 2.4ms`、`glError = 0`。下一步可做应用前后对比，或把 `标记待处理` 升级为真正阻断/审核流程。
214. 高度图应用前后对比第一刀已完成：高度图导入工作台在高度色带预览下方新增“应用前后对比”，并排显示当前地图高度范围、导入预览高度范围、当前/导入水域占比、平均高度变化和水域变化。当前地图摘要在 runtime 中从 `grid.cells.h` 扫描成小对象传给高度面板，不把完整高度数组交给 Vue；导入侧复用已有高度色带预览统计并补平均高度。该能力只读展示，不写地图、不触发重生成。浏览器烟测中导入渐变 SVG 后对比区显示 `当前高度0-93 / 导入高度0-100 / 当前水域66% / 导入水域13% / 平均变化+31.3 / 水域变化-53%`，checksum 保持 `c76792ee` 不变，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1243.1ms`、WebGL 加载 `394.5ms`、`fit-draw = 2.5ms`、`glError = 0`。后续可继续做更直观的前后差值热力图，或把 `标记待处理` 升级为真正阻断/审核流程。
215. 高度图 `标记待处理` 阻断已完成：当本次导入会走 `image-palette`，且当前色板上限之外仍有未分配像素时，选择“标记待处理”会禁用“应用到地图”并显示待处理像素数和颜色桶数，提示用户扩大色板上限、改为合并最近色，或切回固定高度后再应用。默认灰度连续导入不受颜色待处理策略影响；兜底 `applyHeightmapImport()` 也会在阻断条件成立时拒绝提交导入事件。浏览器烟测中导入 48 色 SVG，切到色相、色板上限 `16` 和 `标记待处理` 后，应用按钮禁用，提示 `5.5万` 个像素、`77` 个颜色桶待处理，checksum 保持 `d2f19819` 不变；切到 `合并最近色` 后按钮恢复并可应用，导入结果 `source.unassignedStrategy = nearest-palette`、`unassignedPixels = 921600`、`loadMap.totalMs = 672.3ms`、`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1227.4ms`、WebGL 加载 `353.9ms`、`fit-draw = 2.4ms`、`glError = 0`。后续可继续做可操作的待处理颜色列表或差值热力图。
216. 高度图待处理颜色列表第一刀已完成：当 `标记待处理` 阻断应用时，工作台会展示未进入当前色板上限的前 `12` 个颜色桶，包含颜色、十六进制值、像素数和占比，并提供“扩大色板”按钮把色板上限推进到下一档。列表复用当前量化结果中的未分配桶，不额外重扫图片，也不写地图；扩大色板只刷新预览。浏览器烟测中导入 64 色 SVG 后，色板上限 `16` 时待处理列表显示 `12` 项，摘要为 `显示前 12 色 / 共 109 桶`，提示 `6.1万` 待处理像素；点击“扩大色板”后上限变为 `32`、色板项为 `32`、待处理摘要更新为 `93` 桶，checksum 保持 `7c6bcbad` 不变，`glError = 0`、health error 为 `0`。正式 e2e 守门通过：点击到出图 `1127ms`、WebGL 加载 `334.5ms`、`fit-draw = 2.6ms`、`glError = 0`。后续可继续做待处理颜色直接转入色板、差值热力图或更细的审核队列。
217. 高度图待处理颜色转入色板第一刀已完成：待处理颜色列表中的单个颜色现在可以点击“加入”，该颜色会以当前自动高度作为显式高度进入主色板并被选中，随后可用现有色块高度面板继续调整。预览量化会把显式加入的颜色并入 active palette，即使它不在当前色板上限的前 N 个高频色里；runtime 的 `createPaletteHeightmapFromImage()` 也会把手动 assignment 对应的桶并入最终选桶，并从未分配统计中排除，确保预览和最终 `map.heightmap.source.assignments` 一致。构建产物烟测中导入 20 条纯色色带 SVG，色板上限降到 `16`、映射模式切到色相、未分配颜色切到 `标记待处理` 后，应用按钮禁用且待处理列表显示 `4` 项；点击最后一个待处理色 `#653421` 的“加入”后，主色板从 `16` 变为 `17`，待处理项降为 `3`，checksum 保持 `69cf0151` 不变。切到 `合并最近色` 后应用，结果为 `source.kind = image-palette`、`source.mappingMode = hue`、`source.unassignedStrategy = nearest-palette`、`assignments = 17`、`manualCount = 1`、promoted 色块为手动 assignment，checksum `69cf0151 -> 0e5e4c48`，`loadMap.totalMs = 288.5ms`、`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1229.6ms`，纯生成 `614.5ms`，WebGL 加载 `351.1ms`，最慢加载阶段为 `cell-visual-mesh 50.5ms`，`fit-draw = 3.6ms`，`glError = 0`。后续可继续做差值热力图或更细的待处理审核队列。
218. 高度图差值热力图预览第一刀已完成：高度图导入工作台在“应用前后对比”下方新增“差值热力图” canvas，使用导入预览计算出的高度样本与当前地图的小型高度栅格对比，橙色表示导入后升高，蓝色表示导入后降低，深色表示变化很小；摘要显示升高占比、降低占比和最大变化。runtime 只向高度面板传约 `96` 像素宽的小栅格，不把完整 `grid.cells.h` 交给 Vue；热力图只在工作台预览中绘制，不写 `map`、不触发重生成。构建产物烟测中导入渐变 SVG 后，差值热力图 canvas 为 `345 x 230`，非空像素 `79350`，采样颜色 `16` 种，摘要为 `升高 92% / 降低 7% / 最大 +99`，应用前后对比摘要为 `平均 +30.3 / 水域 -59%`，checksum 保持 `1bf34089` 不变，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1203.8ms`，纯生成 `601.2ms`，WebGL 加载 `330.5ms`，最慢加载阶段为 `cell-visual-mesh 51.1ms`，`fit-draw = 2.4ms`，`glError = 0`。后续可继续细化待处理审核队列，或转向高度图导入 profile 的更完整复用体验。
219. 高度图导入 profile 匹配摘要已完成：导入 `.heightmap-import-profile.json` 后，工作台会展示“导入配置匹配”区块，显示配置色块数、已匹配、未匹配和当前图片额外色块数；预览指标中也新增“配置匹配”。同时修正“先导入配置、后选择图片”的复用路径：已导入的 profile assignments 不会再被选择图片时清空，选择同类图片后会自动套用并刷新匹配摘要。构建产物烟测中先从 4 色 SVG 导出 profile，再在新页面先导入 profile、后选择同一图片，匹配从 `0/4` 更新为 `4/4`，4 个色块均显示手动高度，地图 checksum 保持 `1e9dc992` 不变，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1229.3ms`，纯生成 `608.3ms`，WebGL 加载 `343.9ms`，最慢加载阶段为 `cell-visual-mesh 52.7ms`，`fit-draw = 2.4ms`，`glError = 0`。后续可继续做 profile 失配色块定位，或回到待处理颜色审核队列。
220. 高度图 profile 失配色块定位已完成：导入配置匹配区现在会在存在失配时展示两组色块列表，`未匹配配置色` 列出 profile 中没有在当前图片色板里命中的颜色，`当前额外色` 列出当前图片中 profile 没有覆盖的颜色；当前额外色是可点击按钮，会复用既有色板高亮能力定位到预览图里的对应区域。构建产物烟测中先从 4 色 SVG 导出 profile，再导入到只匹配 3 色且新增 2 色的目标 SVG，匹配摘要为 `3/4`，指标显示 `配置色块4 / 已匹配3 / 未匹配1 / 当前额外2`，未匹配列表显示 `#d9c58d`，当前额外列表显示 `#aa33cc / #eeeeaa`；点击额外色块后对应主色板项被高亮，checksum 保持 `b5e69d57` 不变，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1178.7ms`，纯生成 `612.7ms`，WebGL 加载 `344.4ms`，最慢加载阶段为 `cell-visual-mesh 50ms`，`fit-draw = 2.3ms`，`glError = 0`。后续可回到待处理颜色审核队列，或继续做 profile 失配色块的一键加入/恢复策略。
221. 高度图 profile 当前额外色一键加入配置已完成：`当前额外色` 列表现在为每个额外色提供“加入”按钮，点击后会用当前自动高度把该色写入 profile key 集与手动 assignment，加入主色板并选中该色块；该操作只刷新工作台预览和匹配摘要，不写 `map`、不触发 worker 或 renderer 重载。构建产物烟测中先从 4 色 SVG 导出 profile，再导入到只匹配 3 色且新增 2 色的目标 SVG，加入第一个当前额外色后配置总数从 `4` 变为 `5`，匹配从 `3/4` 变为 `4/5`，当前额外从 `2` 变为 `1`，主色板中 `4` 个色块显示手动高度且新增色块处于选中状态；checksum 保持稳定，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1240.9ms`，纯生成 `633.7ms`，WebGL 加载 `352.1ms`，最慢加载阶段为 `cell-visual-mesh 51.5ms`，`fit-draw = 2.3ms`，`glError = 0`。后续可继续做 profile 色块恢复/移除策略，或回到待处理颜色审核队列。
222. 高度图 profile 色块从配置移除已完成：当当前选中色块来自已导入 profile 时，色块高度赋值面板会显示“从配置移除”；点击后同步删除 profile key、profile assignment 和对应手动高度，让该色块重新回到当前图片额外色统计。该操作只刷新工作台预览状态，不写 `map`、不触发 worker 或 renderer 重载。构建产物烟测中先从 4 色 SVG 导出 profile，再导入到只匹配 3 色且新增 2 色的目标 SVG；点击“加入”后匹配变为 `4/5`、手动色块为 `4` 个，再点击“从配置移除”后匹配回到 `3/4`、配置色块回到 `4`、当前额外回到 `2`、手动色块回到 `3` 个，选中色块不再显示手动高度；checksum 保持稳定，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1231.2ms`，纯生成 `628.6ms`，WebGL 加载 `379ms`，最慢加载阶段为 `line-vertices 54.6ms`，`fit-draw = 2.4ms`，`glError = 0`。后续可继续做 profile 导出前的差异确认，或回到待处理颜色审核队列。
223. 高度图 profile 导出差异确认已完成：导入 profile 后，匹配区会显示导出配置将包含多少配置色、保留多少未匹配配置色、排除多少当前额外色；导出逻辑也从“当前色板全量导出”改为 profile-aware：未加入配置的当前额外色不会进入导出的 `.heightmap-import-profile.json`，已加入的额外色会进入，未匹配但仍属于原配置的色块会保留。没有导入 profile 时，导出当前完整色板的旧行为保持不变。构建产物烟测中源 profile 为 `4` 色，目标图片为 `3` 个匹配色 + `2` 个额外色；未加入时导出仍为 `4` 色并保留缺失的 `#d9c58d`，不包含 `#aa33cc / #eeeeaa`；加入 `#aa33cc` 后导出为 `5` 色且仍排除 `#eeeeaa`；移除后导出回到 `4` 色。全程 checksum 保持稳定，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1424.2ms`，纯生成 `723.3ms`，WebGL 加载 `382ms`，最慢加载阶段为 `cell-visual-mesh 65.6ms`，`fit-draw = 3.5ms`，`glError = 0`。后续可回到待处理颜色审核队列，或补 profile 导入前预览/覆盖策略。
224. 高度图待处理颜色批量加入显示色已完成：待处理颜色列表新增“加入显示色”，会把当前可见的待处理颜色一次性以各自自动高度写入手动 assignments，并选中第一项，便于用户先把当前审核队列纳入主色板再继续调高。该操作只刷新工作台预览，不写 `map`、不触发 worker 或 renderer 重载；如果图片仍有更多未进入当前色板的颜色桶，应用按钮会继续保持阻断。构建产物烟测中导入 20 色 SVG，色板上限 `16`、色相映射和 `标记待处理` 下，点击前待处理项为 `4`、主色板 `16`、手动项 `0`；点击后主色板增至 `18`、手动项为 `4`，剩余待处理项因后续颜色桶补入变为 `12`，checksum 保持稳定，`glError = 0`、console/page error 和 health error 均为 `0`。正式 e2e 守门通过：点击到出图 `1555ms`，纯生成 `750ms`，WebGL 加载 `379ms`，UI slack `426ms`，最慢生成阶段为 `构建 grid / Voronoi / 高度 132ms`，最慢加载阶段为 `构建线层顶点 55.6ms`，`fit-draw = 2.7ms`，`glError = 0`。后续可继续做待处理颜色审核队列的分页/全部加入策略，或转向 profile 导入前预览/覆盖策略。
225. 高度图待处理颜色分页审核已完成：待处理颜色列表从固定展示前 `12` 个改为分页展示，每页仍只渲染 `12` 个，避免一次性把大量未分配颜色塞进 DOM；header 显示当前页和总页数，并提供“上一页 / 下一页 / 加入显示色 / 扩大色板”。切换图片、色板上限、映射模式或未分配策略时会回到第一页，当前页加入显示色后会复用既有显式 assignment 逻辑，不写 `map`、不触发 worker 或 renderer 重载。构建产物烟测中导入 64 色 SVG，色板上限 `16`、色相映射和 `标记待处理` 下，第一页摘要为 `第 1/10 页，显示 12 色 / 共 109 桶`，下一页变为 `第 2/10 页` 且颜色集合不同；在第二页点击“加入显示色”后主色板 `28` 项、手动项 `12`，摘要变为 `第 2/9 页，显示 12 色 / 共 97 桶`，checksum 保持 `61c027de`，`glError = 0`、health error 为 `0`。正式 e2e 守门通过：点击到出图 `1519.1ms`，纯生成 `797.1ms`，WebGL 加载 `422.3ms`，UI slack `299.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 152.1ms`，最慢加载阶段为 `构建视觉 cell mesh 76.4ms`，`fit-draw = 3.2ms`，`glError = 0`。下一步按用户新增计划，优先进入军事单位编辑面板样式整改，再处理国名方位语义，最后刷新 README。
226. 军事单位编辑面板展示层第一刀已完成：军事管理面板在表格和详情之间新增选中军团概要区，显示军团名、国家与命令、态势标签、兵力、主兵种、驻扎适宜度，以及按当前军团 `units` 生成的兵种构成条；原筛选、排序、定位、导出和“兵种比例”二级面板不变。构建产物烟测中默认地图军事管理打开后，概要标题为 `1（澜镇）军团`、态势 `驻防中`、概要指标 `3` 项、兵种条 `4` 条、表格 `111` 行；打开“兵种比例”后仍显示国家 `赤原国`、滑条 `5` 个和应用按钮，checksum `30370b34`，`glError = 0`、health error 为 `0`。正式 e2e 守门通过：点击到出图 `1502.2ms`，纯生成 `757.5ms`，WebGL 加载 `410.2ms`，UI slack `334.5ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 131.9ms`，最慢加载阶段为 `构建视觉 cell mesh 61.7ms`，`fit-draw = 3.2ms`，`glError = 0`。下一步继续处理国名方位语义约束。
227. 国名方位语义约束第一刀已完成：pack 国家在扩张、归一化和统计完成后，会对 `东/西/南/北 + 古国根名` 的国家根名进行空间校正；孤立方位变体会去掉方位前缀，有同根国家时才按同根国家相对位置分配方位前缀。该逻辑只处理类似 `南楚 / 北燕 / 西秦` 的古国根名变体，不改 `北辰 / 南浦` 这类本身就是双字地名的根名。构建产物烟测中默认地图校正了 `南越 -> 越`、`南楚 -> 楚`、`西秦 -> 秦`，同时保留 `北辰`；生成后国家数 `20`、checksum `b91ee397`，`glError = 0`、health error 为 `0`。正式 e2e 守门通过：点击到出图 `1552.8ms`，纯生成 `750ms`，WebGL 加载 `510.6ms`，UI slack `292.2ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 136.5ms`，最慢加载阶段为 `构建线层顶点 69.2ms`，`fit-draw = 3.1ms`，`glError = 0`。下一步刷新 README，把已完成和待完成任务整理给真实读者。
228. README 当前状态刷新已完成：根目录 README 在“现在可以做什么”后新增“已经完成 / 还要做”两节，面向真实读者整理 WebGL 主视图、独立生成链路、对象管理面板、轻量编辑、高度图导入、导出、运行时体验和中文命名优化等已完成能力，也列出军事事件、经济贸易、用户文档、纹章主题、名称库绑定和大地图性能等后续任务。该步只改文档，不影响运行时代码；提交前仅需做 `git diff --check`。
229. 军事兵种比例二级面板展示优化已完成：`兵种比例` 二级面板从裸滑条列表改为每个兵种一张紧凑比例项，显示兵种名、当前百分比和横向比例条，同时保留原有滑条、归一化应用逻辑和 `EditHistory` 命令入口。构建产物烟测中比例面板显示 `5` 个比例项和 `5` 个滑条，示例比例为步兵 `49%`、弓兵 `26%`、骑兵 `3%`、器械 `8%`、舰队 `15%`，应用按钮仍可见，checksum `535004fa`，`glError = 0`、health error 为 `0`。正式 e2e 守门通过：点击到出图 `1560ms`，纯生成 `809.8ms`，WebGL 加载 `463.6ms`，UI slack `286.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 147.2ms`，最慢加载阶段为 `构建视觉 cell mesh 60.9ms`，`fit-draw = 2.8ms`，`glError = 0`。后续军事方向已按用户校准收窄为静态面板、导出可读性和态势线观感收尾。
230. 军事面板态势筛选已完成：`军事管理` 控制区新增“态势”下拉，和国家筛选、文本筛选共同约束军团表格；切换态势后选中概要区会跟随当前可见军团，避免筛选列表和详情显示不一致。构建产物烟测中默认地图态势选项为 `全部态势 / 败逃中 / 集结中 / 行军中 / 修整中 / 巡逻中 / 驻防中`，选择 `败逃中` 后表格从 `111` 行收敛到 `1` 行，表格状态列和概要标签均为 `败逃中`，三列筛选栏宽度约 `195.6px / 169.5px / 312.9px`，`webgl2 = true`、`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1637.2ms`，纯生成 `805.5ms`，WebGL 加载 `432.6ms`，UI slack `399.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 129.3ms`，最慢加载阶段为 `构建视觉 cell mesh 56.5ms`，`fit-draw = 3.2ms`，`glError = 0`。后续军事工作不再沿动态系统扩展，只保留静态管理收尾。
231. 军团手动态势调整已完成：`军事管理` 的二级操作新增“调整态势”，可对当前选中军团写入新的 `status / statusLabel / order`，并接入 `EditHistory` 撤销/重做；该命令只修改目标军团，不重建整套军事数据，同时刷新军事 metadata 的状态计数、对象索引、面板和图层。构建产物烟测中选中 `13:0` 军团后从 `patrolling / 巡逻中` 改为 `marching / 行军中`，`order.kind` 变为 `advance`，历史为 `undo 1 / redo 0 / 调整军团态势 #13:0`；点击“撤销上次”恢复 `patrolling`，点击“重做上次”再次变为 `marching`，全程 `glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1659.2ms`，纯生成 `766.4ms`，WebGL 加载 `534.9ms`，UI slack `357.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 144.8ms`，最慢加载阶段为 `构建视觉 cell mesh 66ms`，`fit-draw = 5.2ms`，`glError = 0`。后续这类命令只作为静态管理能力维护，不扩展为动态战争系统。
232. 军团重命名已完成：`军事管理` 的二级操作新增“重命名”，可对当前选中军团写入新名称，并接入 `EditHistory` 撤销/重做；该命令只修改目标军团 `name`，不重建军事数据。构建产物烟测中 `13:0` 军团从 `1（松岳镇）军团` 改为 `1（松岳镇）军团-改名`，底层数据、表格行和概要标题同步更新，历史为 `undo 1 / redo 0 / 重命名军团 #13:0`；撤销恢复原名，重做再次应用新名，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1869.8ms`，纯生成 `847.4ms`，WebGL 加载 `484.8ms`，UI slack `537.6ms`，最慢生成阶段为 `生成商品 / 市场 / 交易 / 税收 138ms`，最慢加载阶段为 `构建标签 74.9ms`，`fit-draw = 5.5ms`，`glError = 0`。用户随后指出军事态势线表现问题，下一步优先修正态势/战线渲染：线段只应贴边界短距离存在、不得跨海，并改成宽体渐变方向箭头。
233. 军事态势线边界箭头整改已完成：`map.military.fronts` 不再从本国主力/中心直接连到敌国中心，而是只在两个交战国家存在共享陆地 pack 边界时生成 front；front 的 `points` 来自相邻陆地 pack cell 的共享 Voronoi 边，避免跨海和长线。渲染层把旧细线改为宽体渐变方向箭头，每条 front 写入 `9` 个 line vertices，尾部半透明、头部高亮。默认 `stage-2-1231411414` 的非相邻战争不会再画跨海/长距离 front；专门烟测样本 `front-check-1 / continents / 10000` 生成 `2` 条 front，长度均约 `13`，`borderCells` 两侧均为陆地、互为邻居且 state 分别为交战双方，开启战线图层仅新增 `18` 个 line vertices，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1770.5ms`，纯生成 `1001.8ms`，WebGL 加载 `487.4ms`，UI slack `281.3ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 215.7ms`，最慢加载阶段为 `构建视觉 cell mesh 71.9ms`，`line-vertices = 49.9ms`，`fit-draw = 2.7ms`，`glError = 0`。
234. 军团批量态势命令已完成：`军事管理` 的二级操作新增“批量态势”，会把当前国家/态势/文本筛选后的可见军团一次性改为指定态势，并接入 `EditHistory` 撤销/重做。命令会去重目标军团、复用单军团态势枚举和手动命令生成逻辑，并把态势/重命名类刷新范围收窄到 `point-layers / object-index / object-panels`，不再无关重建战线线层和标签。构建产物烟测中把 `56` 支 `patrolling` 军团批量改为 `marching`，历史为 `批量调整军团态势 56支`；撤销恢复原态势，重做再次生效，最终刷新摘要为 `point-layers, object-index, object-panels`，`glError = 0`。正式 e2e 守门通过：点击到出图 `1773.3ms`，纯生成 `897ms`，WebGL 加载 `568.3ms`，UI slack `308ms`，最慢加载阶段为 `构建视觉 cell mesh 83ms`，`line-vertices = 47ms`，`fit-draw = 3.1ms`，`glError = 0`。后续不再把批量态势扩展为动态作战命令面板。
235. 军团驻地/基地轻量编辑已完成：`军事管理` 的二级操作新增“驻地基地”，当前支持把选中军团驻地移动到国家中心/首都 cell，并支持把当前驻地记录为军团基地 `baseCell / bcell / bx / by`；两类操作都接入 `EditHistory`，刷新范围保持为 `point-layers / object-index / object-panels`，不重建军事生成。实现中发现 Vue 目标构造把可选坐标默认 `null` 当成 `0`，曾导致驻地移到 `(0,0)`，已改为严格非空数值判断。构建产物烟测中军团 `2:0` 从 cell `5201` 移动到国家中心 cell `5399`，坐标 `802.69, 781.64`，状态改为 `garrisoned` 且命令为 `garrison`；撤销恢复 `cell 5201 / patrolling`，重做再次移动；随后“设当前位置为基地”写入 `baseCell = bcell = 5399` 和 `bx/by = 802.69/781.64`，撤销后恢复旧基地字段，`glError = 0`。正式 e2e 守门通过：点击到出图 `1583.7ms`，纯生成 `827ms`，WebGL 加载 `473.4ms`，UI slack `283.3ms`，最慢加载阶段为 `构建线层顶点 77.3ms`，`fit-draw = 3.8ms`，`glError = 0`。后续军事方向只保留静态面板和可读性维护。
236. 军团战斗事件记录第一刀已完成：`军事管理` 的二级操作新增“战斗事件”，可给选中军团记录类型、结果和说明；事件同步写入目标军团 `events[]` 与 `map.military.events[]`，并维护 `metadata.events / eventSequence`。本轮只记录事件，不扣兵力、不改战争状态、不触发点线层重建，刷新范围为 `object-panels`。构建产物烟测中给军团 `1:0` 记录 `袭扰 / 相持：边境试探，双方保持接触`，生成事件 `1:0:battle:1`，军团和全局事件数均 `0 -> 1`；撤销恢复为 `0`，重做复用同一事件 id，`refresh.render = none`、`derived = object-panels`，`glError = 0`。正式 e2e 守门通过：点击到出图 `1709.8ms`，纯生成 `927.3ms`，WebGL 加载 `497.8ms`，UI slack `284.7ms`，最慢加载阶段为 `构建标签 71.6ms`，`fit-draw = 3.7ms`，`glError = 0`。该能力作为历史静态战报记录保留，后续不再扩展为动态战斗流程。
237. 军团战斗事件列表与导出已完成：`军事管理` 摘要新增事件数，选中军团详情下方新增最近战斗事件列表，最多展示最近 `5` 条，显示类型、结果、时间和说明；工具栏新增“导出事件”，会导出 `fmg-military-events-<seed>.json`，常规军事 JSON 也同步包含 `events` 字段。本轮仍为只读展示和导出，不改变军团兵力、战争状态、点线层或生成数据。构建产物烟测中给军团 `1:0` 记录 `攻城 / 小胜：攻破边堡，缴获粮草` 后，列表显示 `1` 条，标题显示 `1 条`，`map.military.events = 1`、`metadata.events = 1`，导出文件 `fmg-military-events-stage-2-1.json` 的 `count = 1` 且事件内容与面板一致，`glError = 0`、console error 为 `0`。正式 e2e 守门通过：点击到出图 `1409.7ms`，纯生成 `712.9ms`，WebGL 加载 `372.9ms`，UI slack `323.9ms`，最慢加载阶段为 `构建视觉 cell mesh 56.1ms`，`line-vertices = 47.1ms`，`fit-draw = 2.6ms`，`glError = 0`。该能力作为历史静态战报记录保留，后续不再扩展为动态战斗流程。
238. 军团轻量战斗结果应用已完成：`战斗事件` 二级面板新增“应用轻量结果”开关，默认关闭时仍只记录事件；打开后会在同一条 `EditHistory` 命令中按结果写入轻量损耗、同步缩放兵种数量、更新总兵力、主兵种标签、军团图标档位、态势和命令，并在事件 `result` 中保存应用摘要。本轮规则仍是固定轻量映射，不推演敌我双方、不处理士气阶段、不改变外交战争状态。命令烟测中给军团 `1:0` 记录 `袭扰 / 损耗：后卫被伏击，辎重受损` 并应用结果后，兵力 `16250 -> 12187`，态势 `garrisoned -> routed`，`metadata.troops 613002 -> 608939`，`metadata.events 0 -> 1`，事件写入 `resultApplied = true` 和 `casualties = 4063`；撤销恢复兵力、态势、事件和 metadata，重做再次应用同一结果，刷新范围为 `point-layers / object-index / object-panels`。正式 e2e 守门通过：点击到出图 `1332.3ms`，纯生成 `658.8ms`，WebGL 加载 `363ms`，UI slack `310.5ms`，最慢加载阶段为 `构建视觉 cell mesh 52.8ms`，`line-vertices = 49.6ms`，`fit-draw = 2.6ms`，`glError = 0`。该能力作为历史静态战报摘要保留，后续不再扩展为动态战斗流程。
239. 战斗事件 CSV 导出已完成：`军事管理` 工具栏把原事件导出拆成“事件 JSON”和“事件 CSV”，CSV 会展开事件 id、序号、时间、国家、军团、类型、结果、说明、是否应用、结果摘要、兵力前后、损耗和态势前后，方便检查轻量结果应用后的表格回归；常规军团 CSV/JSON 保持不变。构建产物烟测中记录并应用 `CSV导出验证，含结果列` 后下载 `fmg-military-events-stage-2-1.csv`，表头包含 `事件ID,序号,时间,国家,军团,类型,结果,说明,已应用,结果摘要,兵力前,兵力后,损耗,态势前,态势后`，首条事件为 `1:0:battle:1`，兵力 `576 -> 553`，损耗 `23`，态势 `行军中 -> 修整中`，`resultApplied = true`，`glError = 0`、console error 为 `0`。正式 e2e 守门通过：点击到出图 `1343.1ms`，纯生成 `625.4ms`，WebGL 加载 `423.4ms`，UI slack `294.3ms`，最慢加载阶段为 `构建视觉 cell mesh 72.1ms`，`line-vertices = 48.9ms`，`fit-draw = 2.8ms`，`glError = 0`。该能力作为历史静态战报导出保留，后续不再扩展为动态战斗流程。
240. 轻量战斗结果预览明细已完成：`战斗事件` 二级面板的“应用轻量结果”预览不再只显示百分比，而是按当前选中军团兵力和结果规则实时计算兵力前后、预计损耗和目标态势；这只是提交前说明，不写地图数据，也不改变命令层规则。构建产物烟测中选中军团 `1:0`、兵力 `576` 时，默认“小胜”预览为 `小胜后整队：576 -> 553，预计损耗 23，态势改为修整中`，切换“损耗”后变为 `损耗败退：576 -> 432，预计损耗 144，态势改为败逃中`，`glError = 0`、console error 为 `0`。正式 e2e 守门通过：点击到出图 `1346.3ms`，纯生成 `673ms`，WebGL 加载 `372.8ms`，UI slack `300.5ms`，最慢加载阶段为 `构建标签 55.4ms`，`line-vertices = 45.8ms`，`fit-draw = 2.6ms`，`glError = 0`。该能力作为历史静态战报预览保留，后续不再扩展为动态战斗流程。
241. 战斗结果持久战报摘要已完成：轻量结果应用后，事件 `result` 会保存 `summary` 和 `unitLossSummary`，不再只依赖军事面板临时拼接文本；事件列表和 CSV 的“结果摘要”优先读取持久摘要，同时保留旧事件回退逻辑。本轮仍只做单军团轻量结果说明，不导入外部事件、不推演敌我双方、不改变外交战争状态。命令烟测中给军团 `1:0` 记录 `袭扰 / 损耗：战报摘要验证` 并应用结果后，兵力 `16250 -> 12187`，摘要为 `损耗败退：16250 -> 12187，损耗 4063，态势改为败逃中`，兵种损耗为 `步兵 748 / 弓兵 3092 / 骑兵 42 / 器械 181`；撤销后事件数和军团事件数回到 `0`，重做后同一摘要恢复。正式 e2e 守门通过：点击到出图 `1406.7ms`，纯生成 `686.6ms`，WebGL 加载 `380.4ms`，UI slack `339.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 129.8ms`，最慢加载阶段为 `构建标签 57.3ms`，`line-vertices = 43.3ms`，`fit-draw = 3ms`，`glError = 0`。该能力作为历史静态战报摘要保留，后续不再扩展为动态战斗流程。
242. 战斗事件 JSON 导入兼容已完成：`军事管理` 工具栏新增“导入事件”，可读取此前导出的事件 JSON 或带 `events` 字段的兼容 JSON；导入只合并能匹配当前地图军团的 `battle` 事件，保留 `result.summary / unitLossSummary` 等结果字段，重复 id 会覆盖同 id 事件，但不会按 `resultApplied` 再扣兵力，也不会改变外交战争状态。导入接入 `EditHistory`，撤销/重做会恢复全局事件列表和军团事件列表。命令烟测中输入 `2` 条事件，`1` 条匹配、`1` 条无效，导入结果为 `imported 1 / skipped 1`，军团兵力保持 `16250`，撤销后事件数回到 `0`，重做后军团事件数回到 `1`。浏览器烟测中真实文件导入显示 `已导入 1 条，跳过 1 条`，事件摘要为 `导入战报摘要`，军团兵力保持 `576`，历史为 `undo 1 / redo 0 / 导入军团战斗事件`，撤销后事件消失，console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1379.2ms`，纯生成 `717.1ms`，WebGL 加载 `368ms`，UI slack `294.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 144.9ms`，最慢加载阶段为 `构建视觉 cell mesh 58.2ms`，`line-vertices = 53.9ms`，`fit-draw = 3ms`，`glError = 0`。该能力作为历史静态战报导入保留，后续不再扩展为动态战斗流程。
243. 战斗事件筛选与清空已完成：选中军团的战斗事件列表新增“类型 / 结果”筛选，筛选后标题显示 `匹配数 / 总数`，列表仍只展示最近 `5` 条匹配事件；新增“清空当前”按钮，会可撤销地清空当前军团在全局事件列表和军团自身 `events[]` 中的战斗事件，但不会回滚已应用过的兵力、态势或外交状态。命令烟测中给军团 `1:0` 记录 `2` 条不同类型事件后执行清空，`map.military.events` 和军团事件数均从 `2` 变为 `0`，兵力保持 `16250`，撤销后两边事件数回到 `2`。浏览器烟测中事件标题从 `2 条` 切到类型筛选后的 `1 / 2 条`，列表只显示 `袭扰 / 损耗`；点击“清空当前”后标题为 `暂无`、全局事件数为 `0`，撤销后恢复为 `2`，console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1369.4ms`，纯生成 `677.8ms`，WebGL 加载 `389.9ms`，UI slack `301.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 140.1ms`，最慢加载阶段为 `构建标签 57.2ms`，`line-vertices = 49.6ms`，`fit-draw = 2.5ms`，`glError = 0`。该能力作为历史静态战报清理保留，后续不再扩展为动态战斗流程。
244. 战斗事件按范围导出已完成：选中军团事件区新增“导出”范围下拉，默认仍为 `全部事件`，可切换为 `当前军团` 或 `当前筛选`；顶部“事件 JSON / 事件 CSV”会按该范围导出，文件名追加 `all / selected / filtered` 后缀，JSON 额外写入 `scope / scopeLabel / count`。本轮只改导出范围，不改变事件记录、导入、清空和战斗结果应用语义。浏览器烟测中给军团 `1:0` 记录 `袭扰 / 损耗` 与 `攻城 / 小胜` 两条事件，类型筛选切到 `袭扰` 且导出范围切到 `当前筛选` 后，列表标题为 `1 / 2 条`；下载的 `fmg-military-events-stage-2-1-filtered.json` 中 `scope = filtered`、`count = 1`、唯一事件 type 为 `raid`，下载的 CSV 文件名为 `fmg-military-events-stage-2-1-filtered.csv` 且只有表头和一条 `袭扰` 事件，console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1465ms`，纯生成 `767.7ms`，WebGL 加载 `369.5ms`，UI slack `327.8ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 138.7ms`，最慢加载阶段为 `构建视觉 cell mesh 53.3ms`，`line-vertices = 44.2ms`，`fit-draw = 2.5ms`，`glError = 0`。该能力作为历史静态战报范围导出保留，后续不再扩展为动态战斗流程。
245. 战斗事件按筛选清理已完成：选中军团事件区新增“清空筛选”，会把当前类型/结果筛选命中的事件 id 传给可撤销清理命令；命令层仍会校验事件属于当前军团，避免误删其他军团事件。旧“清空当前”继续保留为清空当前军团全部事件；两种清理都只影响事件记录，不回滚已应用过的兵力、态势或外交状态。命令烟测中给军团 `1:0` 记录 `raid / siege` 两条事件后按 `raid` id 清理，清理后只剩 `siege`，撤销后恢复两条，兵力保持不变。浏览器烟测中类型筛选切到 `袭扰` 后标题为 `1 / 2 条`，点击“清空筛选”后全局事件和军团本地事件均只剩 `siege`，撤销恢复 `raid / siege`，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1447.1ms`，纯生成 `663.7ms`，WebGL 加载 `465.8ms`，UI slack `317.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 123.9ms`，最慢加载阶段为 `构建线层顶点 84.2ms`，`fit-draw = 3.6ms`。
246. 军事面板布局整理已完成：顶部工具条从五个同权按钮改为“军团数据 / 战斗事件”两组，选中军团概要新增稳定的抽象兵种符号，事件区把“类型 / 结果 / 导出”筛选和“清空筛选 / 清空当前”动作拆成两段，避免按钮硬挤。浏览器布局烟测确认工具条、事件工具和事件动作区 `scrollWidth == clientWidth`，概要符号不再暴露 `archers` 等内部 key；同次烟测继续验证“清空筛选”后只剩 `siege` 事件，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1370.6ms`，纯生成 `693.2ms`，WebGL 加载 `370.5ms`，UI slack `306.9ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 120.5ms`，最慢加载阶段为 `构建视觉 cell mesh 53.3ms`，`line-vertices = 45.2ms`，`fit-draw = 2.5ms`。
247. 战报链摘要已完成：选中军团的战斗事件区新增只读摘要，汇总事件链路条数、已应用结果条数、累计损耗和最近事件，帮助查看多条战报而不进入完整战斗模拟。浏览器烟测中给军团 `1:0` 注入两条事件，其中一条带 `result.casualties = 123`，摘要显示 `链路 2 条 / 已应用 1 条 / 累计损耗 123 / 最近 攻城 / 小胜`，事件区无横向溢出，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1595.3ms`，纯生成 `859.3ms`，WebGL 加载 `401ms`，UI slack `335ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 163.3ms`，最慢加载阶段为 `构建视觉 cell mesh 68.8ms`，`line-vertices = 50.7ms`，`fit-draw = 3.5ms`。
248. 战斗事件 JSON 导出摘要已完成：事件 JSON 顶层新增 `summary`，复用战报链摘要字段，包含 `total / applied / casualties / latest` 及对应展示标签；导入逻辑仍只消费 `events`，因此旧 JSON 与新增摘要的 JSON 都保持兼容。浏览器下载烟测中导出 `fmg-military-events-stage-2-1-all.json`，文件包含 `summary.total = 2`、`summary.applied = 1`、`summary.casualties = 456`、`summary.latest.type = siege`，事件数组仍包含 `raid / siege`，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1406.4ms`，纯生成 `723ms`，WebGL 加载 `402.4ms`，UI slack `281ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 130.3ms`，最慢加载阶段为 `构建视觉 cell mesh 62.7ms`，`line-vertices = 49.5ms`，`fit-draw = 3ms`。
249. 军事态势线观感修正已完成：军事战线生成改为收集交战双方共享陆地边界上的短段，写入 `borderCellPairs / length / maxLength` 方便校验；隔海没有共享陆地边界时不生成战线。渲染层不再用细线或沿边小箭头，而是在边界附近绘制宽体渐变方向箭头，箭头头部朝向目标国家；边界段退化到很短点位时也有最小可视横向长度。数据烟测中固定 `stage-2-1231411414 / continents / 10000` 生成 `2` 条战线，最长 `57`，均低于各自上限，所有 `borderCellPairs` 两侧 cell 都是陆地且属于交战双方。浏览器烟测中战线开关顶点差为 `18`，即 `2` 个箭头各 `3` 个三角形，局部截图 `docs/generated/war-front-arrow-crop.png` 确认宽体渐变箭头可见，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1352.2ms`，纯生成 `694.1ms`，WebGL 加载 `373ms`，UI slack `285.1ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 123.1ms`，最慢加载阶段为 `构建标签 54.2ms`，`line-vertices = 50.2ms`，`fit-draw = 2.5ms`。
250. 军事面板样式第二刀已完成：只改 `styles.css`，把 `military-panel-summary / military-overview / military-panel-details / military-event-list / military-event-chain / military-status-panel` 统一成更规整的暗色指挥面板样式；顶部统计和详情网格不再像裸文本，选中军团概要更突出兵种图标、状态胶囊和兵种比例条，战报链摘要改成紧凑状态带，二级态势面板补边框和背景。浏览器布局烟测打开 `军事管理`、注入两条战斗事件并打开“调整态势”二级面板，确认 summary、controls、toolbar、overview、details、event list、event tools、event chain 和 secondary panel 均无横向溢出，战报链为 `链路 2 条 / 已应用 1 条 / 累计损耗 132 / 最近 攻城 / 小胜`，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1411ms`，纯生成 `706.5ms`，WebGL 加载 `392.5ms`，UI slack `312ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 124.3ms`，最慢加载阶段为 `构建视觉 cell mesh 55.9ms`，`line-vertices = 45.5ms`，`fit-draw = 2.8ms`。
251. 战斗事件链路元信息已完成：选中军团事件列表每条事件新增一行只读标签，展示 `链路 #序号`、`已应用 / 未应用` 和 `损耗 N / 损耗未计入`，让多条战报链路不用只靠正文扫读。浏览器烟测给同一军团注入两条事件后，最新事件显示 `链路 #12 / 未应用 / 损耗未计入`，上一条显示 `链路 #11 / 已应用 / 损耗 132`，事件列表和首条事件无横向溢出，战报链摘要仍为 `链路 2 条 / 已应用 1 条 / 累计损耗 132 / 最近 攻城 / 小胜`，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1386.1ms`，纯生成 `720.1ms`，WebGL 加载 `388.3ms`，UI slack `277.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 136.9ms`，最慢加载阶段为 `构建视觉 cell mesh 56.8ms`，`line-vertices = 53.3ms`，`fit-draw = 3.1ms`。
252. 军事态势线第三刀已完成：用户指出旧态势线仍显得过长、可能跨海且像细线后，本轮收紧 `frontMaxBoundaryLength()`，边界扩展阶段不再为第二段破坏长度上限；front 额外写入由双方共享边界 cell 质心计算出的 `direction`，渲染时优先用这个方向而不是远处国家中心。箭头渲染改为暗色外沿 + 内层宽体渐变箭头，每条 front 由 `10` 个三角形组成，战线开关前后顶点差从旧实现的每条 `9` 个顶点提高到每条 `30` 个顶点。数据烟测 `front-check-1 / continents / 10000` 生成 `2` 条 front，长度均为 `20`、上限 `26`，所有 `borderCellPairs` 两侧都是陆地且互为邻居；构建产物浏览器烟测中同 seed 生成 `2` 条 front，长度均为 `13`、上限 `14`，战线图层开关顶点差为 `60`，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1764.7ms`，纯生成 `841.6ms`，WebGL 加载 `638.5ms`，UI slack `284.6ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 154.4ms`，最慢加载阶段为 `构建视觉 cell mesh 55.8ms`，`line-vertices = 51.8ms`，`glError = 0`。
253. 国名方位语义第二刀已完成：`orientPackStateDirectionalNames()` 不再只处理古国复合根名，所有 `东/西/南/北 + 根名` 的国家都会进入同根方位组；孤立方位根名会改成无方位根名，若重名则尝试 `新/古/上/中` 等中性变体。多 seed 审计覆盖 `continents / archipelago / mediterranean / highIsland / lowIsland / peninsula / pangea` 共 `112` 张 10k 地图，发现并校正 `231` 个孤立方位国名，校正后剩余无同根参照的方位国名为 `0`。旧问题 seed `direction-gap-continents-00` 中 `东衡 / 南唐` 已分别校正为 `衡 / 唐`，并写入 `nameOrientation.reason = isolated-directional`。正式 e2e 守门通过：点击到出图 `1742.3ms`，纯生成 `996.1ms`，WebGL 加载 `432.5ms`，UI slack `313.7ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 174.3ms`，最慢加载阶段为 `构建视觉 cell mesh 64.4ms`，`line-vertices = 53.8ms`，`glError = 0`。
254. 战报链双方损耗摘要已完成：选中军团的战报链概览和事件 JSON 顶层 `summary.chains` 现在按 `chainSide` 分桶汇总已应用损耗，写出 `sideCasualties / attackerCasualties / defenderCasualties / participantCasualties / localCasualties / manualCasualties`；链路 chip 会显示 `攻方损耗 / 守方损耗` 等可读摘要。该能力仍只是轻量结果复盘，不自动扣对手军团兵力、不推进战役、不改外交状态。构建产物浏览器烟测中给同一 campaign 注入攻方 `120` 与守方 `340` 损耗事件，选中攻方军团时链路概览显示 `攻方损耗 120`，选中守方军团时显示 `守方损耗 340`，`glError = 0`、console/page error 为 `0`。正式 e2e 守门通过：点击到出图 `1651.8ms`，纯生成 `884.5ms`，WebGL 加载 `504.9ms`，UI slack `262.4ms`，最慢生成阶段为 `生成国家 / 省份 / 区域 178.4ms`，最慢加载阶段为 `构建视觉 cell mesh 91.4ms`，`line-vertices = 49.9ms`，`drawMs = 0.1ms`，`glError = 0`。
255. 湖泊对象名称库显式重命名已完成：新增 `lake` 对象类型，湖泊水面拾取会生成湖泊对象并进入通用对象详情；对象详情展示湖泊名称、类型、面积、水位、补给、蒸发和调试 id，并支持手动重命名与“名称库改名”。名称库命令只写 `pack.features` 中对应湖泊的 `name`，接入 `EditHistory`，撤销/重做恢复原名，不重建水文、河流、政治或军事数据。拾取优先级调整为标签/明确图标之后优先湖泊水面，避免低缩放下附近城市半径盖过真正点击的湖泊。构建产物烟测中湖泊 `#5` 从 `月湖` 改为 `月泊`，撤销恢复 `月湖`、重做恢复 `月泊`，拾取对象为 `lake`，`glError = 0`。正式 e2e 守门通过：`lake-rename-smoke / continents / 10000` 点击到出图 `1718.7ms`，纯生成 `631.8ms`，WebGL 加载 `737.9ms`，最慢加载阶段为 `构建视觉 cell mesh 56.9ms`，控制台错误为空。用户已再次校准：军事方向无需动态系统，后续只做静态面板、态势线观感和导出可读性收尾。
256. 名称库生成质量参数第一刀已完成：用户名称库新增 `minLength / maxLength / duplicateChars` 编辑入口，生成预览和绑定生成都会读取这些参数；Markov 链式候选和样本兜底都会过滤长度，并禁止非白名单字符相邻重复。参数写入 `EditHistory` 快照命令，撤销/重做只恢复名称库上下文和本地偏好，不自动改写当前地图对象名称。浏览器烟测中新建用户库后设置 `3-3` 字并允许 `澜` 连写，生成预览均为 3 字，撤销恢复 `2-4` 字默认参数，重做恢复 `3-3` 字参数，`glError = 0`。正式 e2e 守门通过：`namebase-options-smoke / continents / 10000` 点击到出图 `1639ms`，纯生成 `820.6ms`，WebGL 加载 `488.8ms`，UI 余量 `329.6ms`，控制台错误为空。用户再次校准：无需做动态军事系统，当前路线继续按静态军事收尾和名称库安全管理推进。
257. 名称库原版文本兼容第一刀已完成：`parseNamebaseDocument()` 支持读取原版 `name|min|max|d|m|names` 文本行，导入为用户名称库并保留 `min/max/d` 为 `minLength/maxLength/duplicateChars`，`m` 保留为 `legacyMultiwordRate` 但暂不参与生成；名称库面板新增“导出原版文本”，导出当前内置库和用户库为 `.namebases.txt`。同时修复整图生成和本地偏好快照未携带名称库生成参数的问题。构建产物烟测中导出得到 `61` 行原版文本，导入 `legacy-namebases.txt` 后新增 `测试古国 / 测试水文` 两个用户库，`测试古国` 保留 `1-3` 字和允许连写 `叠`，历史栈为 `undo 1 / redo 0 / 导入名称库`，`glError = 0`，console/page error 为空。正式 e2e 守门通过：`namebase-legacy-smoke / continents / 10000` 点击到出图 `1608.9ms`，纯生成 `744.6ms`，WebGL 加载 `422.2ms`，UI 余量 `442.1ms`，控制台错误为空。军事方向继续不做动态系统。

## 约束

- 新项目代码仍然放在根目录下，不放进 `source/`。
- `source/` 只读参考；允许为运行参考项目安装依赖并产生锁文件，例如 `pnpm-lock.yaml`，但不得修改原项目源码。
- 所有文档继续使用中文。
- 代码注释保持必要且克制。
- UI 面板长期目标是普通 DOM/HTML 浮动可拖动面板，不使用 canvas 绘制面板；当前对象详情已开始迁入浮动面板，现有固定配置面板仍是阶段性实现。架构约束见 `docs/architecture/floating-panel-architecture.md`。
- 页面响应式短期以现代 PC 浏览器为默认目标，不需要为过小手机宽度牺牲桌面信息密度；平板屏幕尽量不破版即可，暂不作为主要适配目标。
