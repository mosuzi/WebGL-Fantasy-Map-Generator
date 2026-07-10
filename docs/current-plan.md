# 当前开发计划

本文档只记录当前阶段的执行队列。旧计划和专题路线已经在重置前备份，后续接手时不应再从旧计划自动推导待办。

## 2026-07-08 当前执行计划

本轮计划按用户最新指令重置。前一轮三项修正已完成；当前高优先级改为从旧计划备份中重新点名的五个专题，加上一个新的 API 系统大项。执行时应先把对应专题拆成可验收小步，再做实现，并在完成后同步更新本文档和 `docs/development-log.md`。

### 计划备份

重置前的计划类文档已备份到：

- `docs/plan-backups/2026-07-08-reset-current-plan/`

备份范围包括：

- `docs/current-plan.md`
- `graphics-reimplementation-plan.md`
- `docs/plans/`
- `docs/task-notes/`

### 已完成的上一轮队列

1. GEO 数据导入后，未由 GEO 明确携带的数据没有完整重置和重建。`已完成`
   - 本项的产品语义必须明确：导入 GEO / GeoJSON 数据后，应把本次导入视为一张新地图的基础数据来源；除了 GEO 文件中明确包含并映射进来的数据之外，地图上的其它旧数据都必须重置，不能沿用导入前地图的残留状态。
   - 已知问题包括：军事数据无法生成，资源点和一些标记没有重置；后续排查时要同时检查军事、资源点、marker、zone、经济、外交、名称库绑定以外的派生对象、选择状态和编辑状态是否仍残留旧地图数据。
   - 先复现 GEO / GeoJSON 导入后的生成链路，确认相关数据是未清空、未触发派生重建、输入字段缺失，还是错误被吞掉。
   - 检查导入后 `map.military`、国家军力、军团、资源点、marker / zone、国家 / 城市 / 路线派生和各管理面板读取路径。
   - 修正目标是：导入 GEO 数据后，GEO 内包含的数据被保留和映射；GEO 外的旧地图数据被清空或按新底图重新生成；军事、资源点和标记不留下旧地图残留，也不因派生链缺口出现空白失败。
   - 完成记录：FMG Cells GEO 导入命令现在会按新地形重建 pack、河流、文化 / 宗教、城镇、国家 / 省份、标记 / 资源点、经济、外交、军事和地区，并清空旧标签、备注和测量对象；`pnpm run regress:geo -- --browser-channel chrome` 通过，功能断言确认旧资源 / 地区 / 军团 / 标签 / 备注 / 测量均被清理，新军事 `206`、资源点 `14`、地区 `3`，`glError = 0`。报告仍记录一次 GEO 重建期间的 health long-task，后续若要优化导入性能应单独拆项。

2. 地图上新建的国家，在国家编辑面板中的目标显示为 ID 而不是国名。`已完成`
   - 先复现新增国家流程，检查新增国家、默认省份、首都和国家编辑刷子的 selection / target label 传递。
   - 定位是新增国家缺少 `name / fullName`，还是 UI 目标文案直接读取了 ID。
   - 修正目标是：国家编辑面板和编辑状态提示中，新建国家显示用户可读国名；必要时保留 ID 作为辅助字段而不是主标题。
   - 完成记录：新增国家完成后，运行时会用 object resolver 组装带 `name / fullName` 的国家选择对象，不再只传 `{kind, id}`；国家面板桥接层的行数据也补齐 `rawName / fullName / governmentLabel` 等字段，避免列表选择、定位或编辑路径退回 ID。

3. 地区管理“未选中地区”处文字过大，上下没有间隙，需要优化。`已完成`
   - 先打开地区 / zone 管理面板复查空选中态布局，记录当前字号、行高、上下间距和容器约束。
   - 优先按现有面板空态 / detail 区样式统一，不新增孤立视觉风格。
   - 修正目标是：空选中态字号与同类管理面板一致，上下留出稳定间隙，在窄视口和 deep 审计场景下不挤压或溢出。
   - 完成记录：共享 `UiDetailGrid` 的空态现在渲染为 `.ui-detail-grid-empty` 元素，统一 `12px` 字号、`1.45` 行高和 `8px` 上下间距，并跨满详情网格列；地区管理“未选中地区”和其它同类详情空态会使用同一套样式。

### 当前高优先级执行队列

1. 编辑面板新增 / 删除统一化。
   - 来源：旧计划审视中的第 12 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/current-plan.md` 的“编辑面板新增 / 删除统一化”可选增强。
   - 要做什么：按对象类型逐个补齐新增 / 删除命令，并统一放到列表下方小图标动作条中；国家、省份和城市已完成第一刀，后续应按文化、宗教、路线、河流、湖泊、备注、名称库、测量对象、资源标记等对象的数据约束分批处理。
   - 为什么做：这是正式编辑器可用性的基础；新增 / 删除必须进入 `EditHistory`，并通过对象自身规则维护关联字段，不能用一套粗暴删除逻辑横扫所有面板。
   - 执行方式：每次只选一个领域面板，先梳理数据约束、撤销 / 重做、派生刷新和导出影响，再实现小步；涉及 UI 的小图标入口要与现有 `UiPanelIoActions` 视觉保持一致。
   - 进展记录：路线管理已完成“删除选中路线”小图标第一刀；命令会从 `settlements.routes` 中移除目标路线、清理对应路线备注，并支持撤销恢复路线与备注。本刀不新增路线绘制入口，也不重算经济 / 贸易派生。资源标记面板已把“移动 / 删除选中资源标记”收束到列表下方小图标动作条，删除继续复用既有 `createDeleteMarkerCommand()` 和 `EditHistory`，不新增资源重生成语义。备注总览已把“定位备注对象 / 删除选中备注”并入表格下方 `UiPanelIoActions`，删除继续复用 `createDeleteNoteCommand()`。名称库总览已把“新建用户库 / 复制内置 / 删除选中用户库 / 清空用户库”收束到同一列表动作条，继续复用名称库 edit command 快照撤销逻辑。河流管理已把“按名称库重命名筛选河流 / 定位选中河流 / 进入河流编辑”收束到列表动作条；本刀不新增河流删除，因为河段、支流、流域和地形派生约束仍需单独梳理。湖泊管理已把“按名称库重命名筛选湖泊 / 定位选中湖泊”收束到列表动作条；本刀不新增湖泊删除，因为 feature、pack cells、湖岸线和水文派生约束仍需单独梳理。文化管理已把“新增空文化 / 定位文化 / 删除空文化”接入列表动作条；新增和删除均进入 `EditHistory`，删除只允许无 cells、无城市 / 城镇 / 国家关联、无子级的空文化，本刀不做文化 cell 归属刷或覆盖重分配。宗教管理已把“新增空宗教 / 定位宗教 / 删除空宗教”接入列表动作条；新增和删除均进入 `EditHistory`，删除只允许无 cells、无城市 / 城镇 / 国家关联、无子级的空宗教，本刀不做宗教 cell 归属刷或文化联动重算。

2. 编辑器基础设施和统计面板清单重新入队。
   - 来源：旧计划审视中的第 17 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/editor-and-stat-panel-inventory.md`。
   - 要做什么：把正式版编辑器的基础设施重新作为高优方向，包括统一 edit command / undo command、selection store、highlight / locate API、对象表格组件、派生重建调度、全局撤销入口，以及各领域面板职责边界。
   - 为什么做：后续编辑能力会越来越多，如果没有统一命令、选择、定位、撤销和派生刷新规则，面板会各自为政，容易出现数据残留、无法撤销、选择状态错乱和局部刷新失败。
   - 执行方式：先整理当前代码里已经存在的基础设施，形成可施工的小清单；不要一次性重写所有面板，优先服务“新增 / 删除统一化”和下游导出 / 高亮需求。
   - 进展记录：已在 `docs/task-notes/editor-and-stat-panel-inventory.md` 新增 2026-07-08 基础设施现状盘点，梳理 `EditHistory`、`edit-refresh-scheduler`、`SelectionStore`、`SELECTION_PANEL_HANDLERS`、`updateAllObjectPanels()` 和公共面板组件的现状，并列出 `executeEditCommand()`、命令字段规范、`refreshPanelsForEdit()`、`locateAndSelectObject()`、`UiObjectTable` 扩展和面板状态持久化六个下一批施工小步。`executeEditCommand()` 已在运行时落地第一刀，并先迁移测量对象重命名 / 删除调用点；测量动作条回调同步修正为 `props.callbacks`，确保删除、定位、编辑和导出按钮能触发真实面板回调。2026-07-10 继续迁移地区样式回调、对象详情名称入口、外交字段和军事字段；地区纹理 / 颜色调整、对象详情重命名、选中对象名称库改名、单个外交关系调整、外交重生成、军团重命名、单个军团态势调整、国家级兵种比例调整、批量军团态势调整、单个军团驻地移动、单个军团基地设置、单个军团战报记录、单个军团战报清空、战报档案导入、城市画布新增 / 删除、marker 编辑 API 和 marker 面板 / 画布集合命令现在通过统一执行器进入撤销栈；军事、路线、marker、标签、备注、河流、湖泊、地区、国家、政府、省份、城市、文化、宗教和外交面板内历史按钮已接入统一历史执行器。上述入口均依赖命令 effects 或统一面板刷新 helper 刷新对应对象面板。

3. 导出能力矩阵收尾。
   - 来源：旧计划审视中的第 18 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/export-capability-matrix.md`。
   - 要做什么：继续收口 PNG、完整地图 JSON、pack cell GeoJSON、要素 GeoJSON、备注摘要和测量结果等导出能力；优先补完整 JSON 压缩、跨版本迁移器、导入错误详情面板、PNG 导出倍率 / overlay 选项，以及与政治面 dissolve 的衔接。
   - 为什么做：导出是用户长期保存、迁移、外部分析和二次加工地图的关键链路；当前导出种类多，但仍缺压缩、版本迁移、错误诊断和部分 GIS 质量收尾。
   - 执行方式：每个导出能力都要明确“是否可重新导入复原地图”；完整地图 JSON 的兼容性优先级高于只读摘要导出，GIS 输出则与下一项 dissolve 专项协同推进。

4. 政治面 GeoJSON dissolve。
   - 来源：旧计划审视中的第 19 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/political-geojson-dissolve-plan.md`。
   - 要做什么：把当前 state / province / zone 的 cell polygon 集合型 `MultiPolygon` 升级为可选的真正 dissolve 外轮廓：消除同一对象相邻 cell 的共享边，输出闭合 outer rings 和 holes，并在 properties 中标注 `dissolved: true`。
   - 为什么做：非 dissolve 的政治面文件大、碎片多，也不适合 QGIS / geojson.io 等外部 GIS 工具继续分析；真正外轮廓能显著提升地理数据导出质量。
   - 执行方式：先做工具脚本或纯函数原型，用固定 seed 验证 ring 拼接、hole 归属、坐标方向和文件体积，再接入导出 UI；若 100k cells 导出耗时过高，再评估 Worker 或懒加载几何库。

5. 视觉主题与样式预设第一阶段。
   - 来源：旧计划审视中的第 34 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/visual-theme-preset-plan.md`。
   - 要做什么：建立 WebGL 版自己的轻量主题 token，先提供默认、古地图、浅色图册、暗海、单色、夜间等只读主题预设；主题影响 canvas 背景、地形色、水色、边界、道路、标签、比例尺和图例等跨层配色。
   - 为什么做：主题系统能提升地图成品感和导出视觉质量，同时避免把原版 SVG selector 样式系统强行搬进 WebGL 架构。
   - 执行方式：第一阶段只做内置只读预设，不做纹理、滤镜、字体系统或完整原版 `public/styles/*.json` 兼容；切换主题不得改变地图生成数据和 checksum。

6. 控制台 / 扩展 API 系统规划。
   - 来源：用户新增要求。
   - 要做什么：考虑把所有不依赖 UI 的操作收束为统一 API 系统，挂到可在控制台调用的入口上，例如 `api.climate.setLatitude(...)`、`api.data.exportAll()`、`api.data.exportGEO()` 等；后续还应覆盖生成、导入导出、气候、单位、图层、对象选择 / 定位、编辑命令、名称库、测量、备注和派生重建等非 UI 能力。
   - 为什么做：API 化能方便后续接入 AI、脚本化操作、开发扩展、自动化测试和批量处理；同时把功能收束成 API 也是对现有 runtime 能力、数据边界、命令副作用和权限语义的间接梳理。
   - 执行方式：本轮只写入计划，不立即实现；真正开始时必须先出详细方案，明确 API 命名空间、同步 / 异步返回、错误格式、撤销语义、权限边界、与 UI store 的关系、浏览器控制台暴露方式、测试策略和稳定性承诺。
   - 进展记录：已新增 `docs/task-notes/console-extension-api-system-plan.md`，完成详细方案第一版，明确 `api.info / generate / climate / units / layers / selection / edit / history / data / namebases / debug` 命名空间、统一 `ApiResult`、能力元数据、副作用边界、UI 关系和 0-5 阶段实施路径。阶段 1 已完成第一刀：新增 `window.webglGeneratorApi` 和开发别名 `window.api`，接入 `info.capabilities()`、`info.mapSummary()`、`info.runtimeStats()`、`selection.get()` 和 `layers.get()` 只读快照。阶段 2 已完成导出 API 第一批：`data.exportAll()`、`data.exportCompressedAll()`、`data.exportGEO()`、`data.exportFeatureGEO()` 和 `data.exportPNG()` 支持脚本调用，其中 PNG / 压缩 JSON API 返回 Promise，可返回 data URL / gzip base64 或触发浏览器下载。阶段 3 已完成图层控制、单位偏好和气候 API：`layers.setViewMode()`、`layers.setVisible()`、`units.get()`、`units.apply()`、`climate.get()`、`climate.getTemperature()`、`climate.getPrecipitation()`、`climate.getLatitude()`、`climate.getAtmosphere()`、`climate.getBiomes()`、`climate.apply()`、`climate.setLatitude()`、`climate.setLatitudeRange()`、`climate.setLongitudeRange()`、`climate.setTemperature()`、`climate.setPrecipitation()` 和 `climate.setWind()` 均已接入；图层 / 单位写偏好不改变地图 checksum，气候写入会重算当前地图气候并标记下游派生 stale。阶段 4 已完成编辑 API 第一批：`history.get()` / `undo()` / `redo()`、`edit.notes.delete()`、`edit.measurements.rename()`、`edit.measurements.delete()`、`edit.cities.add/delete()`、`edit.provinces.add/delete()`、`edit.states.add/delete()`、`edit.routes.delete()`、`edit.labels.delete/restore()` 和 `edit.markers.add/delete/move()` 已接统一命令系统；selection API 已接入 `resolve/select/clear/locate/pick`。

### 验证要求

- 每项实现至少运行相关文件的 `node --check` 或项目现有静态检查。
- 涉及 UI 的项目应做浏览器烟测或纳入既有面板审计脚本。
- 涉及导出、GeoJSON、完整地图 JSON 或 API 的项目应补可复现脚本或自动化断言，覆盖文件结构、错误路径和导入 / 外部读取可用性。
- 涉及编辑命令的项目必须覆盖撤销 / 重做、选择刷新、派生重建和保存 / 导出后的数据一致性。
- 每一项完成后单独记录到 `docs/development-log.md`；是否单独提交按用户后续指令执行。

### 当前备选计划

- overlay 与动态线层性能专项。
- source/candidate parity 剩余 warn 只读跟踪。
- 编辑器基础设施旧队列，除非用户重新要求按项目计划继续执行。
- 贸易查看增强、Element Plus 完整 source theme、单位系统增强、气候系统深化、文化 / 宗教继承深化、政体系统增强、名称库更多入口与原版多词率 `m`、测量曲线尺细化、高度图导入增强、对象注记增强、经济 / 军事 / 纹章等其它未被重新点名的旧专题。
- 任何未被用户重新点名的历史专题计划。

## 2026-07-09 追加修复：降水毫米换算校正

用户在当前地图中发现 30 度地区、降水倍率为 `1` 时只显示 `6 mm`，并进一步质疑河流流量与气候数据不匹配。本轮先校正可确认的单位错误：WebGL 版此前把内部降水指数直接标成 `mm`，而原版 FMG 的 UI 口径是 `prec * 100 + " mm"`。

完成记录：

- `formatPrecipitation()` 改为先把内部降水指数换算为毫米，默认 `1` 个内部降水单位显示为 `100 mm`。
- 降水显示改用完整数字格式，不再受全局 `万 / 千` 缩写偏好影响，避免高降水地区出现不自然的压缩单位。
- `api.climate.getPrecipitation()` 保留原有 `min / max` 内部指数，同时新增 `unit: "internal-precipitation-index"`、`millimetersPerUnit: 100`、`minMillimeters` 和 `maxMillimeters`，让脚本读取时能区分内部指数和物理毫米口径。
- 本步不继续调整河流流量标定；用户看到的 `6 mm` 会修正为 `600 mm`，河流流量是否仍偏低应在降水显示修正后重新对照。

验证：

- `node --input-type=module` 直接断言通过：`6 -> 600 mm`、`63 -> 6,300 mm`、`precipitationScale = 0.5` 时 `6 -> 300 mm`。
- `node --check app\webgl-generator\src\ui\display-units.js` 和 `node --check app\webgl-generator\src\runtime\console-api.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：`api.climate.getPrecipitation()` 返回 `max = 63`、`maxMillimeters = 6300`、`millimetersPerUnit = 100`，气候面板文本包含 `6,300 mm`，`glError = 0`，console / page error 为空。

## 2026-07-09 追加修复：河流汇水与降水诊断数据

用户要求补齐河流与降水体系中用于判断流量可信度的数据，而不是只按长度和附近单点降水主观判断。

完成记录：

- 河流生成阶段新增水文诊断累计：每个河流 mouth 会保存 `hydrology.catchmentArea`、`hydrology.catchmentCells` 和 `hydrology.averagePrecipitation`。
- 汇水诊断随流量下传，同步考虑湖泊出口的湖岸降水近似补给；本步仍保持原有河流生成、路径、宽度和内部 `flux` 逻辑不变。
- 共享单位模块新增基于现实水文公式的估算：`Q = 年降水量 × 汇水面积 × 径流系数 / 年秒数`，默认展示 `0.2-0.5` 径流系数区间，并以 `0.3` 作为中位参考。
- 河流管理面板选中详情新增“汇水面积 / 汇水格子 / 流域均降水 / 物理估算 / 模型与估算比值”。
- 对象详情面板的河流对象也显示汇水面积、流域均降水和物理估算区间。
- 河流要素 GeoJSON properties 新增 `catchmentArea / catchmentCells / averagePrecipitation`，方便外部核查。

验证：

- `node --check app\webgl-generator\src\generator\rivers.js`、`node --check app\webgl-generator\src\ui\display-units.js`、`node --check app\webgl-generator\src\runtime\object-resolver.js` 和 `node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- `node --input-type=module` 生成级断言通过：新生成地图至少一条河流带有正 `catchmentArea`、`catchmentCells` 和 `averagePrecipitation`，并能计算 `low / medium / high` 理论流量区间。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：河流管理面板详情显示“汇水面积 / 汇水格子 / 流域均降水 / 物理估算 / 模型与估算比值”；河流要素 GeoJSON properties 含 `catchmentArea / catchmentCells / averagePrecipitation`；`glError = 0`，console / page error 为空。

### 2026-07-10 补充修正：已有地图水文诊断回填

用户发现已有地图中“汇水面积”为空。原因是上一刀只让新生成 / 新重算河流写入 `hydrology`，浏览器缓存或已保存的旧地图 JSON 不会自动拥有新增字段；同时上一刀在入湖 / 入海水格和汇流分支处也存在部分河流诊断没有下传完整的问题。

完成记录：

- `rivers.js` 新增 `backfillRiverHydrology()`，可在不覆盖旧河流名称、宽度、备注和当前列表的前提下，使用克隆 pack 做一次诊断重算并把 `hydrology` 贴回既有河流。
- 载入地图运行时会自动调用回填；浏览器缓存地图、完整 JSON 导入后的旧图都会自动补齐。
- 汇水诊断下传修正：低于成河阈值的小溪向下游累计时会同步传递水文诊断；河流汇入已有河道时也会传递上游汇水。
- 河流水文诊断改用最后一个陆地河格作为诊断 mouth，避免入湖 / 入海水格没有面积导致汇水为空。
- 对极少数旧图中无法按 id 或 source/mouth 精确匹配的河流，使用河道 cell 做保底近似，并在面板 / 对象详情 / GeoJSON 中标记 `river-path-fallback` / “河道近似”。

验证：

- `node --check app\webgl-generator\src\generator\rivers.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\map-file-io.js` 通过。
- 新生成地图完整性断言通过：`hydrology-completeness` 生成 64 条河流，64 条均有正 `catchmentArea`。
- 旧图模拟回填断言通过：删除 `legacy-hydrology-backfill` 地图 295 条河流的 `hydrology` 后，`backfillRiverHydrology()` 回填 295 / 295；其中 2 条使用 `river-path-fallback` 保底近似。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：用 gzip 版浏览器缓存旧图恢复后，运行时自动记录 `backfill river hydrology: 202/202 rivers, regenerated=202`；河流管理面板显示汇水字段和诊断方式；河流要素 GeoJSON 输出 `hydrologyMethod = flow-accumulation`；`glError = 0`，console / page error 为空。

## 2026-07-09 追加修复：列表表头排序与河流流量标定

用户要求把所有列表上的独立排序按钮替换为表格自带的列排序功能，并指出 1800+ 千米河流只显示 `56 m³/s` 不合理。

完成记录：

- `UiObjectTable` 增加可选表头排序能力，点击可排序列会复用各面板原有 `onSort` 回调、排序方向切换和列表偏好持久化。
- 主要列表面板已移除独立 `UiSortBar` 渲染，改为把 `sortKey / sortDir / sortOptions` 传给对象表格；经济面板三个 tab 的表格会跟随当前 tab 的排序 key 集合。
- 表格表头只允许原排序按钮集合中已有的 key 排序，避免临时列或从属表误触发未设计的排序。
- 河流流量展示不再把内部 `flux / discharge` 裸值直接标为 `m³/s`，而是按默认比例尺 `1 flux ≈ 20 m³/s` 做展示标定，并随地图比例尺按面积比例平方缩放；本步不改变河流生成、宽度、排序原始字段或导出数据。

验证：

- `node --check app\webgl-generator\src\ui\display-units.js` 通过。
- `git diff --check` 通过。
- `$env:CI='true'; pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- Playwright + 系统 Chrome 构建产物 smoke 通过：国家、河流和经济面板旧 `.ui-sort-bar` 数量均为 `0`；国家“人口”、河流“长度”、经济“库存”表头点击后箭头和 `aria-sort` 均正确切换；河流原始最大 `flux = 1474` 展示为约 `3万 m³/s`，不再显示裸原始值；`glError = 0`，console / page error 为空。
- `$env:CI='true'; pnpm run audit:panels -- --scenario deep --template continents --browser-channel chrome --out <临时文件> --markdown <临时文件>` 通过；17 个管理面板、0 待复核项、0 console error、0 health event。

补充修正：

- 用户复查现实河流数据后指出万级流量过多，标定系数从默认比例尺下 `1 flux ≈ 20 m³/s` 下调为 `1 flux ≈ 6 m³/s`。
- 河流流量显示禁用数字缩写，始终显示完整数字加 `m³/s`；例如内部 `flux = 1474` 显示为 `8,844 m³/s`，内部 `flux = 56` 显示为 `336 m³/s`。
- 验证：`node --input-type=module` 直接断言 `56 -> 336 m³/s`、`1474 -> 8,844 m³/s` 且不含 `万 / 千`；`node --check app\webgl-generator\src\ui\display-units.js`、`git diff --check` 和 `$env:CI='true'; pnpm run build:app` 均通过；Playwright + 系统 Chrome 构建产物 smoke 确认河流面板最大流量为 `8,844 m³/s`，列表流量无 `万 m³/s / 千 m³/s`。

## 2026-07-09 追加修复：编辑面板筛选和排序区间距统一

用户指出最近新增的编辑面板中，各模块之间仍然缺少间距；参考国家编辑面板，筛选输入框与上方信息区、下方排序按钮行之间都应有稳定间距。

完成记录：

- `styles.css` 底部新增公共覆盖规则，统一主要 `*-panel-summary`、`*-panel-controls`、`*-panel-sort` 的垂直间距。
- 筛选区统一为 `margin: 10px 0 8px`，排序区统一为 `margin: 8px 0 10px`，筛选输入统一占满容器宽度。
- 本步只修公共面板布局样式，不改变筛选、排序、选择、编辑命令或数据。
- 验证：`git diff --check` 和 `$env:CI='true'; pnpm run build:app` 通过；Playwright + 系统 Chrome 构建产物 smoke 覆盖国家、河流、湖泊、生物群系、气候、水体与地貌、人口、纹章和地区面板，实测国家及新增统计面板间距为 `10px / 8px / 10px`，console/page error 为空。

## 2026-07-09 追加修复：河流流量显示单位

用户指出河流流量不应只是裸数字，应显示为带流量单位的数值。

完成记录：

- 新增 `formatRiverFlow()` 共享格式器，河流流量统一显示为 `m³/s`。
- 河流管理面板的列表、摘要和详情流量字段改用带单位格式。
- 对象详情面板、hover 对象摘要、hover 调试行和运行统计中的河流流量改为带单位显示。
- 本步只改展示口径，不改变河流生成、宽度、排序或导出数据。
- 验证：`node --check app\webgl-generator\src\ui\display-units.js`、`node --check app\webgl-generator\src\ui\panel.js`、`git diff --check`、`$env:CI='true'; pnpm run build:app` 均通过；Playwright + 系统 Chrome 构建产物 smoke 确认河流摘要、表格、详情和选中详情均显示 `m³/s`，`glError = 0`。

## 2026-07-09 追加修复：控制台气候 API 读写补齐

用户指出 `api.climate` 不应只有只读 `get()`；气候控制参数虽然有 UI，但本质可以通过 API 参数传入，因此仍应作为不依赖 UI 的能力暴露。

完成记录：

- `api.climate.get(section)` 支持按 `temperature / precipitation / latitude / atmosphere / biomes / options` 读取单一分区；无参数时返回完整分区摘要。
- 新增 `getOptions()`、`getTemperature()`、`getPrecipitation()`、`getLatitude()`、`getAtmosphere()`、`getBiomes()` 细分读取。
- 新增 `apply(patch)`、`setLatitude(value)`、`setLatitudeRange(percent)`、`setLongitudeRange(percent)`、`setTemperature({equator, northPole, southPole})`、`setPrecipitation(scale)`、`setWind(index, direction)` 写入。
- 写入 API 直接归一化参数为气候 options，随后同步 UI 控件、重算当前地图气候 / 生物群系 / 摘要，并返回 `changed / options / climate / derivedStale / checksum`。
- 验证：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js`、`git diff --check`、`$env:CI='true'; pnpm run build:app` 均通过；Playwright + 系统 Chrome 构建产物 smoke 确认 14 个气候方法声明完整，细分 getter、setter、`apply()`、非法参数错误、checksum 变化、派生 stale 和 `glError = 0` 均符合预期。

## 2026-07-09 追加修复：label/value 数据展示组件统一

用户指出最近新增的编辑面板中，列表上下方的 label + value 数据展示部分出现样式崩坏；本轮作为编辑器基础设施的小修复立即处理。

完成记录：

- 新增 `UiKeyValueGrid.vue`，统一 label/value 数据项的 label、value、空态、debug 行过滤、长值自动宽格和 `auto-fit` 自适应排布。
- `UiMetricGrid.vue` 和 `UiDetailGrid.vue` 已改为薄封装，现有面板调用方式不变，自动复用新排布规则。
- 经济总览详情区原手写 highlights 与分组 `dl / dt / dd` 已迁到 `UiKeyValueGrid`，避免形成第二套样式。
- `styles.css` 新增 `.ui-key-value-*` 共享样式，统一字号、断行、宽格跨列和窄宽度回退；面板专属类只保留间距、边框和特殊容器语义。
- 验证完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；`pnpm run audit:panels -- --scenario deep --template continents --browser-channel chrome` 通过，24 / 24 面板预热完成、失败 0、报告结论“未发现待复核项”。

## 2026-07-08 追加执行计划：编辑器基础设施小步推进

用户最新要求是“审视项目内的计划，按照计划执行，每执行一步提交一次，执行几步后执行烟测并使用浏览器验证”。由于上方三项当前执行队列均已完成，本轮按 `AGENTS.md` 接手建议和 `docs/task-notes/editor-and-stat-panel-inventory.md` 中的跨领域基础设施继续推进，但仍保持小步、可验证、可单独提交。

### 当前执行队列

1. 浮动面板打开状态持久化。`已完成`
   - 现状：`PanelManager` 已持久化浮动面板位置和宽度，但未记录面板是否打开；编辑器清单中“面板打开状态持久化”仍未完成。
   - 修正目标：用户刷新或恢复地图后，常用领域面板可以按上次打开状态恢复；恢复路径必须走各面板自己的 `open()`，保证面板状态拿到当前 `map / selection / history`。
   - 边界：对象详情面板依赖当前 selection，不做打开状态恢复；本步不处理当前 tab、筛选词和排序字段持久化。
   - 完成记录：`PanelManager` 的本地状态新增 `open` 字段，打开和关闭时同步保存；运行时在地图接入并刷新各面板数据后，根据保存的面板 id 调用已有 `open()` 方法恢复领域面板；对象详情面板通过 `persistOpen: false` 排除。

2. 河流面板筛选词和排序字段持久化第一刀。`已完成`
   - 目标：优先选一个或一组已接入公共 `UiFilterInput / UiSortBar` 的领域面板，抽出可复用的面板列表偏好读写接口。
   - 边界：先不做 object table 虚拟滚动，也不改地图数据或编辑命令。
   - 完成记录：新增 `panel-list-preferences.js`，统一读写面板列表的 `filter / sortKey / sortDir`；河流面板启动时读取保存的筛选词和排序字段，用户修改筛选或排序时同步写入浏览器本地状态。

3. 继续复用列表偏好到路线、湖泊和地区面板。`已完成`
   - 目标：优先覆盖路线、湖泊、地区、城市、国家、省份等同样使用 `UiFilterInput / UiSortBar` 的面板。
   - 边界：继续小步提交，每次覆盖一组行为相近的面板。
   - 完成记录：路线、湖泊和地区面板已接入 `panel-list-preferences.js`，启动时恢复各自筛选词、排序字段和排序方向；用户修改筛选或排序时同步写入浏览器本地状态。

4. 继续复用列表偏好到国家、省份和城市面板。`已完成`
   - 目标：覆盖常用区域 / 点对象管理面板，让国家、省份和城市列表的筛选与排序也能跨刷新恢复。
   - 边界：不改变新增 / 删除 / 编辑按钮逻辑，不修改地图数据和 selection store。
   - 完成记录：国家、省份和城市面板已接入 `panel-list-preferences.js`，启动时恢复各自筛选词、排序字段和排序方向；用户修改筛选或排序时同步写入浏览器本地状态。

5. 继续复用列表偏好到文化、宗教和外交面板。`已完成`
   - 目标：覆盖同样使用 Vue `UiFilterInput / UiSortBar` 的社会 / 关系类面板。
   - 边界：不改变继承树、外交主体选择或专题切换逻辑。
   - 完成记录：文化、宗教和外交面板已接入 `panel-list-preferences.js`；外交面板只持久化列表筛选与排序，不持久化外交主体选择。

6. 本批次综合烟测和浏览器验证。`已完成`
   - 目标：覆盖本轮新接入的路线、湖泊、地区、国家、省份、城市、文化、宗教和外交面板列表偏好恢复。
   - 验证方式：运行 `git diff --check`、`pnpm run build:app`，并用系统 Chrome / Playwright 对构建产物做浏览器断言。
   - 完成记录：`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测通过，路线、湖泊、地区、国家、省份、城市、文化、宗教和外交面板均能恢复预设筛选词与 `asc` 排序偏好，`glError = 0`。

7. 继续复用列表偏好到 marker、标签和备注面板。`已完成`
   - 目标：覆盖剩余使用 `UiFilterInput / UiSortBar` 的附属对象管理面板。
   - 边界：不持久化 marker 的分类 scope，不改变对象编辑命令和导入导出逻辑。
   - 完成记录：marker、标签 / 命名和备注总览面板已接入 `panel-list-preferences.js`，启动时恢复各自筛选词、排序字段和排序方向。

8. 继续复用列表偏好到测量和名称库面板。`已完成`
   - 目标：覆盖测量对象和名称库管理面板。
   - 边界：不改变测量工具状态、名称库绑定、导入导出或编辑命令。
   - 完成记录：测量对象和名称库总览面板已接入 `panel-list-preferences.js`，启动时恢复各自筛选词、排序字段和排序方向。

9. 继续复用列表偏好到政体、经济和军事面板。`已完成`
   - 目标：覆盖剩余较复杂的管理面板。
   - 边界：仅持久化列表筛选与排序；经济 tab、政体家族筛选、军事态势筛选等额外状态不在本步扩大。
   - 完成记录：政体、经济和军事面板已接入 `panel-list-preferences.js`；政体家族筛选、经济 tab、军事国家 / 状态筛选仍按原有运行时状态处理。

10. 本批次综合烟测和浏览器验证。`已完成`
   - 目标：覆盖 marker、标签 / 命名、备注总览、测量对象、名称库总览、政体、经济和军事面板列表偏好恢复。
   - 验证方式：运行 `git diff --check`、`pnpm run build:app`，并用系统 Chrome / Playwright 对构建产物做浏览器断言。
   - 完成记录：`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测通过，marker、标签 / 命名、备注总览、测量对象、名称库总览、政体、经济和军事面板均能恢复预设筛选词与 `asc` 排序偏好，`glError = 0`。

11. 控制面板和经济面板当前 tab 持久化。`已完成`
   - 目标：补上编辑器清单中“当前 tab”持久化的第一刀，覆盖主控制面板和已有内部 tab 的经济总览。
   - 边界：本步不扩大到 object table 虚拟滚动，也不持久化经济面板的国家 / 商品选中对象。
   - 完成记录：控制面板通过全局控制偏好恢复当前 tab，经济面板通过 `panel-list-preferences.js` 的受限 `tab` 字段恢复商品 / 市场 / 交易页；浏览器烟测确认刷新后控制面板停在“管理”、经济面板停在“交易”，`glError = 0`。

12. `UiObjectTable` 虚拟滚动第一刀。`已完成`
   - 目标：在公共对象表格组件内减少大表一次性渲染行数，优先保护城市、路线、标签、军事等高行数面板的打开和选中性能。
   - 边界：先采用固定行高虚拟窗口，保留现有筛选、排序、点击选择、双击定位和选中行居中语义；不在本步重写各领域表格列定义。
   - 完成记录：公共 `UiObjectTable` 已在大表启用固定行高虚拟窗口，小表保持完整渲染；浏览器烟测打开城市管理，828 个城市只渲染 26 个表格行，滚动后窗口内容变化，点击后仍保持唯一选中行，`glError = 0`。

13. 对象表格双击进入编辑第一刀。`已完成`
   - 目标：补上编辑器清单中“对象表格双击进入编辑”的第一处真实路径。
   - 边界：公共表格只在父组件显式提供 `@edit` 时把双击转为编辑事件；未接入的面板继续保留原双击定位行为。本步先覆盖城市管理的重命名编辑浮层。
   - 完成记录：公共 `UiObjectTable` 新增显式 `doubleClickAction` 和 `edit` 事件；城市管理表格双击城市行会选中该城市并打开“重命名”二级编辑浮层，未接入编辑事件的面板继续保留双击定位。

14. 河流表格双击进入编辑第二刀。`已完成`
   - 目标：复用对象表格 `edit` 事件到河流管理，让已有河流重命名浮层也能通过双击表格行进入。
   - 边界：本步只打开现有“重命名”浮层，不改变河道编辑模式、宽度调整、定位和撤销命令。
   - 完成记录：河流管理表格已接入 `doubleClickAction="edit"`，双击河流行会选中该河流并打开“重命名”二级编辑浮层；河道编辑模式、宽度调整、定位按钮和原有撤销链路未改变。

15. 湖泊表格双击进入编辑第三刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到湖泊管理，让已有湖泊重命名浮层也能通过双击表格行进入。
   - 边界：本步只打开现有“重命名”浮层，不改变湖泊定位、批量名称库重命名和撤销命令。
   - 完成记录：湖泊管理表格已接入 `doubleClickAction="edit"`，双击湖泊行会选中该湖泊并打开“重命名”二级编辑浮层；定位、批量名称库重命名和原有撤销链路未改变。

16. 国家表格双击进入编辑第四刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到国家管理，让国家表格双击非中立国家行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变国家 cell 归属刷、新增/删除国家、颜色、政体、首都和备注编辑。
   - 完成记录：国家管理表格已接入 `doubleClickAction="edit"`，双击非中立国家行会选中该国家并打开“重命名”二级编辑浮层；中立行不会触发重命名，国家 cell 归属刷、新增 / 删除、颜色、政体、首都和备注编辑未改变。

17. 省份表格双击进入编辑第五刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到省份管理，让省份表格双击非中立省份行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变省份 cell 归属刷、新增/删除省份、颜色和备注编辑。
   - 完成记录：省份管理表格已接入 `doubleClickAction="edit"`，双击非中立省份行会选中该省份并打开“重命名”二级编辑浮层；中立行不会触发重命名，省份 cell 归属刷、新增 / 删除、颜色和备注编辑未改变。

18. 文化表格双击进入编辑第六刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到文化管理，让文化表格双击行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变文化颜色、继承、名称库绑定和备注编辑。
   - 完成记录：文化管理表格已接入 `doubleClickAction="edit"`，双击文化行会选中该文化并打开“重命名”二级编辑浮层；文化颜色、继承、名称库绑定和备注编辑未改变。

19. 宗教表格双击进入编辑第七刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到宗教管理，让宗教表格双击行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变宗教颜色、继承和备注编辑。
   - 完成记录：宗教管理表格已接入 `doubleClickAction="edit"`，双击宗教行会选中该宗教并打开“重命名”二级编辑浮层；宗教颜色、继承和备注编辑未改变。

20. 标签表格双击进入编辑第八刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到标签管理，让标签表格双击行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变标签新增/删除/恢复、定位和备注编辑。
   - 完成记录：标签管理表格已接入 `doubleClickAction="edit"`，双击标签行会选中该标签并打开“重命名”二级编辑浮层；标签新增 / 删除 / 恢复、定位和备注编辑未改变。

21. 标记表格双击进入编辑第九刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到资源与标记管理，让标记表格双击行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变资源点放置、移动、删除、重生成、图标和备注编辑。
   - 完成记录：资源与标记管理表格已接入 `doubleClickAction="edit"`，双击标记行会选中该标记并打开“重命名”二级编辑浮层；资源点放置、移动、删除、重生成、图标和备注编辑未改变。

22. 测量表格双击进入编辑第十刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到测量对象管理，让测量表格双击行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变测量形状编辑、定位、删除、导出和历史撤销/重做。
   - 完成记录：测量对象表格已接入 `doubleClickAction="edit"`，双击测量行会选中该测量对象并打开“重命名”二级编辑浮层；测量形状编辑、定位、删除、导出和历史撤销/重做未改变。

23. 军事表格双击进入编辑第十一刀。`已完成`
   - 目标：继续复用对象表格 `edit` 事件到军事管理，让军团表格双击行进入已有重命名浮层。
   - 边界：本步只打开现有“重命名”浮层，不改变态势、批量态势、驻地基地、战报、兵种比例、导入导出和历史撤销/重做。
   - 完成记录：军事管理表格已接入 `doubleClickAction="edit"`，双击军团行会选中该军团并打开“重命名”二级编辑浮层；态势、批量态势、驻地基地、战报、兵种比例、导入导出和历史撤销/重做未改变。

24. 编辑器专题清单状态校准。`已完成`
   - 目标：同步 `docs/task-notes/editor-and-stat-panel-inventory.md` 中已被本轮实现覆盖的当前状态，避免后续接手继续按过期“未做虚拟滚动 / 多数筛选排序未持久化”判断。
   - 边界：本步只校准专题清单状态，不新增代码、不重排后续功能路线。
   - 完成记录：专题清单当前状态已同步 object table 虚拟滚动、列表偏好、控制面板 / 经济 tab 持久化和双击进入编辑覆盖面；第三批优先级说明已反映宗教、标签 / 命名、Marker 和 Zone 的第一刀完成状态。

25. 地区面板接入浮动面板头部撤销 / 重做。`已完成`
   - 目标：补齐 `ZonePanel` 与已有 `EditHistory` 的浮动面板头部按钮连接，让地区样式编辑可通过面板头部撤销 / 重做。
   - 边界：本步只接入 `historyActions`，不新增地区编辑命令、不改变地区样式命令和地图数据结构。
   - 完成记录：地区管理浮动面板注册时已提供 `historyActions`，头部撤销 / 重做按钮会读取 `panelState.history` 并调用既有 `onUndo / onRedo`。

26. 路线面板删除路线第一刀。`已完成`
   - 目标：补齐路线管理清单中“删除仍未实现”的第一处真实编辑能力，让选中路线可通过面板操作删除并进入 `EditHistory`。
   - 边界：本步只删除整条路线并支持撤销 / 重做；不做改线、端点重连、路线重算或城市 / 港口派生重算。
   - 完成记录：路线管理面板新增列表操作区，选中路线可删除；删除命令会进入 `EditHistory`，同步路线统计、pack 路线链接、路线 mesh 和对象 picking 索引，撤销后恢复路线和备注。

27. 路线面板接入道路重算。`已完成`
   - 目标：补齐路线管理清单中“重算仍未实现”的面板入口，让用户可从路线面板直接触发既有受约束道路重算。
   - 边界：本步复用控制面板已有 `routes` 重算逻辑，不新增路线生成算法；道路重算是全局派生刷新，不接入 `EditHistory` 撤销栈。
   - 完成记录：路线管理列表操作区新增“重算道路”，点击后调用既有道路重算流程，刷新路线 mesh、对象面板、对象索引、运行状态和生成结果提示。

28. 生物群系统计面板第一刀。`已完成`
   - 目标：补齐第三批“生物群系面板待做”的只读统计入口，展示 biome 分布、适居度、人口和城市覆盖。
   - 边界：本步只做统计面板，不做局部 biome 刷子、适居度编辑、地图定位或高亮。
   - 完成记录：新增“生物群系统计”浮动面板和管理页入口，按 pack 语义层统计各 biome 的 cells、面积、适居度、人口和城市数，支持筛选、排序和选中详情。

29. 人口统计面板第一刀。`已完成`
   - 目标：补齐第三批“人口统计面板待做”的只读汇总入口，统一查看国家、省份、文化和宗教人口。
   - 边界：本步只统计现有派生字段，不做人口刷子、迁移模拟或下游派生重算。
   - 完成记录：新增“人口统计”浮动面板和管理页入口，汇总总人口、乡村/城市人口、人口 cells 和最高 cell 人口，并按国家、省份、文化、宗教列出人口、面积、密度和城镇数，支持筛选、排序和选中详情。

30. 纹章统计面板第一刀。`已完成`
   - 目标：补齐第三批“纹章面板”的轻量统计入口，先查看国家和城市纹章覆盖情况。
   - 边界：本步只统计现有 `coa` 字段，不做纹章样式编辑、锁定、重新生成或可视化预览。
   - 完成记录：新增“纹章统计”浮动面板和管理页入口，汇总国家 / 城市纹章对象、有纹章 / 缺失数量和盾形种类，并列出每个对象的盾形、底色、图案、图案色和尺寸。

31. 水体与地貌统计面板第一刀。`已完成`
   - 目标：补齐 `Feature / 水体 / 海岸面板` 的只读统计入口，先查看 pack 语义层 feature 分布和引用异常。
   - 边界：本步只统计 `pack.features`、grid/pack feature 引用和 shoreline 指标，不做湖泊出口、海岸线修补或 feature 类型编辑。
   - 完成记录：新增“水体统计”浮动面板和管理页入口，汇总 feature、陆地、水域、湖泊、海岸线段和异常引用，并按 feature 列出类型、分组、cells、面积、岸线、水位、补给和蒸发。

32. 气候统计面板第一刀。`已完成`
   - 目标：补齐气候专题的只读统计入口，查看当前温度、降水、纬度和风带结果。
   - 边界：本步只统计当前 `grid.cells.temp / prec / s` 与气候 metadata，不改变气候控制、biome 重算或下游派生重建。
   - 完成记录：新增“气候统计”浮动面板和管理页入口，汇总温度范围、平均温度、降水范围、平均降水、干旱 / 湿润陆地 cells，并按温度带列出 cells、陆地 / 水域、均温、降水和适居度。

33. 水体统计面板补齐港湾指标。`已完成`
   - 目标：补齐专题清单中明确列出的 haven / harbor 统计，让水域 feature 能看到港湾候选规模。
   - 边界：本步只读取 `pack.cells.haven / harbor` 并按对应水域 feature 汇总，不改变港口生成、城市港口状态或路线派生。
   - 完成记录：水体统计摘要新增“港湾 cells”和“泊位强度”，表格与详情新增每个水域 feature 的港湾 cells 和泊位强度。

34. 水体统计面板补齐岸线长度。`已完成`
   - 目标：补齐专题清单中明确列出的岸线长度指标，区分海岸线和湖岸线。
   - 边界：本步只读取 `map.features.shore` 的线段并按当前单位换算显示，不改变 shoreline 生成、湖泊分组或地图渲染。
   - 完成记录：水体统计摘要新增“海岸长度”和“湖岸长度”，与原有海岸线段、湖泊和异常引用指标并列展示。

35. 高度编辑器命令化状态校准。`已完成`
   - 目标：复核专题清单中“高度编辑器正式版下一步需要把操作变成命令”的旧状态，避免后续重复实现已完成的命令链路。
   - 边界：本步只校准计划和专题清单，不改高度笔刷行为、不新增地形工具。
   - 完成记录：当前代码已有 `height-edit-commands.js`，高度笔刷结束时会生成 `createApplyHeightBrushCommand` 并进入 `EditHistory`；高度面板头部与面板内撤销 / 重做会调用同一历史栈。后续高度方向应继续推进高度统计增强、派生重建范围或更复杂地形工具，而不是再补“命令骨架”。

36. 高度面板统计增强第一刀。`已完成`
   - 目标：补齐专题清单中“高度分布、陆地比例、海平面、山地/低地占比”的只读统计入口。
   - 边界：本步只扩展当前高度统计和面板摘要，不改变高度笔刷、导入工作台、派生重建或地图数据。
   - 完成记录：运行时高度统计新增陆地、低地、丘陵、山地和海平面带 cells；高度面板摘要新增当前均高、陆地比例、低地比例、山地比例和海平面带比例。

37. 高度面板最近笔刷均变反馈。`已完成`
   - 目标：补齐最近一次高度编辑的强度反馈，让用户除了影响 cells 和高度范围外，也能看到平均抬升 / 降低幅度。
   - 边界：本步只新增运行时统计字段和面板显示，不改变笔刷算法、命令内容、撤销 / 重做或地图数据。
   - 完成记录：高度编辑预览和最终提交都会计算 `lastDelta`；高度面板摘要新增“均变”，按当前高度单位显示最近一次笔刷的平均高度变化。

38. 高度笔刷标记派生过期第一刀。`已完成`
   - 目标：高度编辑提交后明确标记依赖高度的河流、路线、生物群系、聚落、政治和下游系统为待重建，避免用户误以为这些派生数据已经随笔刷同步更新。
   - 边界：本步只记录过期状态和刷新摘要，不自动重算河流、路线、国家、城镇、经济、军事或外交。
   - 完成记录：`createApplyHeightBrushCommand` 在应用和撤销时都会写入 `metadata.derivedStale.systems`，并同步军事、地区、标记、经济和外交 metadata 的 stale 标志；刷新摘要会列出 `defer:*` 待派生系统。

39. 高度面板显示待派生摘要。`已完成`
   - 目标：把高度编辑造成的待派生状态直接显示在高度面板摘要里，避免用户只从运行时侧栏判断派生状态。
   - 边界：本步只显示待派生数量，不提供自动重算入口，也不改变派生系统清单。
   - 完成记录：运行时向高度面板传入 `metadata.derivedStale.systems`，高度面板摘要新增“待派生”指标，无过期系统时显示“无”，有过期系统时显示数量。

40. 高度面板待派生明细摘要。`已完成`
   - 目标：把高度面板的待派生数量补成可读摘要，帮助用户快速判断主要受影响领域。
   - 边界：本步只做中文名称映射和短摘要，不展开详情表，不新增重算入口。
   - 完成记录：高度面板会把 `rivers / routes / biomes` 等系统键映射为中文，显示前三项并在更多系统时追加“等”。

41. 高度面板接入河流重算入口。`已完成`
   - 目标：在高度编辑后提供第一处直接派生重算入口，让用户可以从高度面板按当前高度重算河流。
   - 边界：本步只复用已有 `rivers` 受约束重算，不做一键全量重算，不新增河流算法，也不改变高度笔刷命令。
   - 完成记录：高度面板操作区新增“重算河流”，点击后调用既有 `regenerateMapAttribute(state, "rivers")`，同步刷新重生成状态记录和高度面板摘要。

42. 河流重算清理已刷新派生状态。`已完成`
   - 目标：修正高度编辑后执行河流重算仍把河流、路线、生物群系留在待派生摘要里的状态误导。
   - 边界：本步只调整派生过期清单，不改变河流、路线或生物群系重算算法。
   - 完成记录：`regenerateRivers` 完成后会把 `rivers / routes / biomes` 标为 fresh，再继续保留城镇、政治、标记、地区、军事、经济和外交等仍待后续重建的系统。

43. 完整地图压缩文件导出 / 导入第一刀。`已完成`
   - 目标：推进“导出能力矩阵收尾”中的完整 JSON 压缩方向，让本地文件导出除了纯 `.webgl-map.json` 外，也能输出可重新导入的 `.webgl-map.json.gz`。
   - 边界：本步不改变默认纯 JSON 导出，不改地图文档 v1 字段，不实现真实 v2 迁移；只预留 `migrateMapDocument()` 管线，供后续跨版本迁移接入。
   - 完成记录：导出面板新增“压缩地图数据”，使用浏览器 `CompressionStream` 生成 gzip 文件；导入地图数据入口接受 `.webgl-map.json.gz`，并用 `DecompressionStream` 读取后走同一 `parseMapDocument()` 与运行时加载链路。

44. 地图数据导入错误详情第一刀。`已完成`
   - 目标：补齐“导出能力矩阵收尾”中的导入错误诊断，让坏 JSON、错误格式和未来版本文件能在控制面板显示可读详情。
   - 边界：本步只覆盖完整地图数据导入入口，不改变 GEO / 高度图导入错误 UI，不新增诊断包导出，也不改变地图文档 v1。
   - 完成记录：控制面板新增导入错误详情块；地图数据导入失败时显示文件名、大小、MIME、推断格式、错误类型、错误信息和中文建议，成功导入或重新开始导入时会清空旧详情。

45. PNG 导出倍率第一刀。`已完成`
   - 目标：补齐“导出能力矩阵收尾”中的 PNG 倍率选项，让图片导出可按更高清尺寸输出。
   - 边界：本步不做透明背景、裁剪范围或 overlay 显式开关；现有图片导出继续默认合成地图 overlay。
   - 完成记录：导出浮层新增 `PNG 倍率` 选择，支持 `1x / 2x / 3x / 4x`；图片导出按倍率放大合成 canvas，并在状态中显示实际像素尺寸、倍率和文件大小。

46. 政治面 dissolve 拓扑原型第一刀。`已完成`
   - 目标：推进“政治面 GeoJSON dissolve”的第二阶段，先补可命令级验证的共享边消除和 ring 拼接纯函数。
   - 边界：本步不接入导出 UI，不改变 state / province / zone 当前非 dissolve GeoJSON 输出，也不引入 GIS 运行时库。
   - 完成记录：`dissolvePackCellPolygons(map, cellIds)` 可按 pack cell 顶点边消除内部共享边，拼接闭合 rings，并按包含关系把 hole 归入外环 MultiPolygon。

47. 政治面 dissolve 内部导出验证第一刀。`已完成`
   - 目标：把 dissolve 原型接入 `createMapFeatureGeoJson()` 的内部选项，并用真实生成地图验证 feature 数、点数缩减和耗时。
   - 边界：本步不接 UI 开关，默认要素 GeoJSON 仍输出 `dissolved=false` 的非 dissolve 政治面。
   - 完成记录：`createMapFeatureGeoJson(map, {dissolvePolitical: true})` 可对 state / province / zone 输出 `dissolved=true` 的 MultiPolygon；固定 `dissolve-smoke` 10k 图验证中 feature 数保持 `206`，坐标点 `53180 -> 10383`，减少约 `80.48%`。

48. 政治面 dissolve 导出 UI 开关第一刀。`已完成`
   - 目标：把已验证的 state / province / zone dissolve 接入要素 GeoJSON 导出浮层，用户可按需输出真正合并外轮廓。
   - 边界：默认仍关闭 dissolve；本步不做 100k cells 大图耗时优化，不改 pack cell GeoJSON。
   - 完成记录：要素 GeoJSON 图层区新增“合并政治面边界”开关；启用后文件写入 `dissolvedPolitical=true`，state / province / zone feature 写入 `dissolved=true`，状态文案显示“已合并政治面边界”。

49. 视觉主题预设基础第一刀。`已完成`
   - 目标：推进“视觉主题与样式预设第一阶段”，先建立只读主题 token、控制面板选择、偏好持久化和完整地图 JSON 恢复。
   - 边界：本步只影响 canvas 背景、水色和高度色带；边界、道路、标签、比例尺和图例 token 后续继续接入，不做主题编辑器或原版样式 JSON 兼容。
   - 完成记录：新增默认、古地图、浅色图册、暗海、单色、夜间六个主题；控制面板“视图”页新增“视觉主题”下拉；切换主题刷新 renderer surface，写入偏好，完整地图 JSON 保存并恢复 `visualTheme`，不改变地图 checksum。

50. 视觉主题线层 token 第一刀。`已完成`
   - 目标：继续推进视觉主题第一阶段，把海岸线、湖岸线、国界、省界和道路颜色接入主题 token。
   - 边界：本步不改标签、比例尺、图例和图标 DOM 颜色，不做主题编辑器。
   - 完成记录：主题新增 `lines` token；shore、political boundary、route mesh 读取主题颜色；切换主题时会刷新静态线层并重建道路动态 buffer，checksum 不变。

51. 视觉主题标签和比例尺 token 第一刀。`已完成`
   - 目标：继续推进视觉主题第一阶段，把城市标签、国家标签、手工标签和比例尺 DOM overlay 颜色接入主题 token。
   - 边界：本步不改图例、城市 / marker / 军事图标配色，不做主题编辑器或 PNG 透明背景选项。
   - 完成记录：六个内置主题新增 `labels` 和 `scaleBar` token；renderer 把主题颜色写入 `.map-stage` CSS 变量，比例尺、城市标签、国家标签和手工标签样式读取变量；切换主题不改变地图渲染数据签名。

52. 视觉主题图例 token 第一刀。`已完成`
   - 目标：继续推进视觉主题第一阶段，把地图图例面板的背景、边框、标题、刻度文字和 swatch 边框接入主题 token。
   - 边界：本步不改变温度 / 降水渐变条本身的数值色带，也不改政体 / 外交 swatch 的语义颜色。
   - 完成记录：六个内置主题新增 `legend` token；renderer 写入 `--theme-legend-*` CSS 变量；图例面板、标题、刻度、条目文字和 swatch 边框读取主题变量。

53. PNG 导出合成固定地图 overlay 第一刀。`已完成`
   - 目标：补齐主题下 PNG 导出对比例尺和图例 overlay 的文件级验证，让导出的图片包含当前主题下的固定地图 UI。
   - 边界：本步只合成比例尺和地图图例，不合成浮动面板、控制面板、toast、测量工具条或 hover 浮层。
   - 完成记录：PNG 合成在地图内容 overlay 后继续绘制可见的 `#map-scale-bar` 和 `#map-legend`；绘制读取 computed style，因此夜间主题下比例尺线、比例尺面板、图例背景和图例文字会进入导出文件。

54. 文化面板新增 / 删除空文化第一刀。`已完成`
   - 目标：继续推进“编辑面板新增 / 删除统一化”，先为文化管理补齐低风险的空文化新增和删除入口。
   - 边界：只新增空文化；只删除无 cells、无城市 / 城镇 / 国家关联、无子级的空文化；不做文化 cell 归属刷、覆盖重分配、中心迁移、扩张参数编辑或宗教联动重算。
   - 完成记录：新增 `createAddCultureCommand()` 和 `createDeleteCultureCommand()`；文化面板列表动作条新增“新增空文化 / 定位文化 / 删除空文化”；删除前会检查 pack/grid cell 使用、子文化、城市、城镇和国家所有者，阻止非空文化删除；新增、删除和撤销恢复均走 `EditHistory`。

55. 宗教面板新增 / 删除空宗教第一刀。`已完成`
   - 目标：继续推进“编辑面板新增 / 删除统一化”，为宗教管理补齐低风险的空宗教新增和删除入口。
   - 边界：只新增空宗教；只删除无 cells、无城市 / 城镇 / 国家关联、无子级的空宗教；不做宗教 cell 归属刷、覆盖重分配、中心迁移、扩张约束编辑或文化联动重算。
   - 完成记录：新增 `createAddReligionCommand()` 和 `createDeleteReligionCommand()`；宗教面板列表动作条新增“新增空宗教 / 定位宗教 / 删除空宗教”；删除前会检查 pack/grid cell 使用、子宗教、城市、城镇和国家所有者，阻止非空宗教删除；新增、删除和撤销恢复均走 `EditHistory`。

56. `executeEditCommand()` helper 第一刀。`已完成`
   - 目标：推进编辑器基础设施清单中的统一 edit command 执行入口，减少面板回调里重复手写 `isNoop`、`EditHistory.execute`、刷新和状态文案。
   - 边界：本步先作为 `app.js` 内部 helper 落地，只迁移测量对象重命名 / 删除两个低风险调用点；不一次性改写所有面板，也不改变命令对象结构。
   - 完成记录：新增 `executeEditCommand(state, documentRef, command, options)` 和 `messageFromOption()`；测量对象重命名和删除改走 helper；同步修正 `MeasurementPanel.vue` 动作条脚本中的 `callbacks` 未定义问题，改为 `props.callbacks`。

57. Edit Command 轻量契约第一刀。`已完成`
   - 目标：推进编辑器基础设施清单中的“命令字段规范”小步，为后续新增 / 删除、派生刷新和控制台 API 复用建立统一口径。
   - 边界：本步只写入契约文档和索引，不强制改造已有全部命令，不新增运行时校验。
   - 完成记录：新增 `docs/task-notes/edit-command-contract.md`，约定 `label / apply / revert / domain / effects / isNoop / getResult / affected`、`context`、`effects.derived`、helper 调用层、撤销快照和删除命令边界；`docs/task-notes/README.md`、编辑器清单和开发历史已同步。

58. `refreshPanelsForEdit()` helper 第一刀。`已完成`
   - 目标：推进编辑器基础设施清单中的“按命令 effects / affected 刷新对象面板”小步，减少调用点手写 `updateXPanel()`。
   - 边界：本步先作为 `app.js` 内部 helper 落地，只根据 `effects.affected.kind` 和 `object-panels` 做保守面板刷新；先接测量对象重命名 / 删除调用点，不改变撤销 / 重做路径。
   - 完成记录：新增 `refreshPanelsForEdit()` 和 `updatePanelForAffectedKind()`；支持 state、province、city、culture、religion、river、lake、route、marker、label、zone、note、measurement 等对象 kind；测量对象删除后面板摘要由 helper 刷新。
   - 2026-07-10 补充：`executeEditCommand()` 执行成功后会统一先走 `options.refresh` 或默认 `refreshAfterEdit()`，再按命令 effects 调用 `refreshPanelsForEdit()`；路线、备注、测量面板和对应 API 删除了重复手写 `refreshPanelsForEdit()`，国家 / 省份新增删除这类自定义刷新路径也不再绕过对象面板 helper。必要时调用方可用 `refreshPanels: false` 显式关闭面板 helper。本步不新增持久化字段，不涉及旧地图转换。
   - 2026-07-10 追加：路线备注保存路径已迁移到 `executeEditCommand()`，不再手写 `isNoop`、`EditHistory.execute`、`refreshAfterEdit` 和 `state.panels.route.update()`；真实路线面板备注 smoke 已覆盖撤销栈和 `object-panels` 刷新。
   - 2026-07-10 再追加：国家、省份、城市、文化、宗教、标记、标签和河流备注保存路径也已接入 `executeEditCommand()`；同类回调不再手写 `EditHistory.execute` 与局部面板刷新。
   - 2026-07-10 名称库补充：`executeNamebaseEdit()` 已改为复用 `executeEditCommand()`，保留名称库面板刷新、本地偏好保存和 `getResult()` 返回，并让名称库编辑写入 `lastEditRefresh`。
   - 2026-07-10 城市字段补充：城市重命名、按名称库重命名筛选城市、城市人口、同步归属、剪影设置 / 重置和删除城市回调已迁移到 `executeEditCommand()`；删除成功后的 selection 清理仍保留在调用点，按名称库重命名继续保留成功数量和 no-op 文案。
   - 2026-07-10 国家字段补充：国家名称、按名称库批量重命名、颜色、政体、首都和政体面板批量调整已迁移到 `executeEditCommand()`；状态文案继续从命令 `getResult()` 读取，刷新统一依赖国家命令 effects 和 `refreshPanelsForEdit()`。
   - 2026-07-10 省份字段补充：删除省份、重命名省份和调整省份颜色已迁移到 `executeEditCommand()`；删除成功后的 selection 清理仍保留在调用点，no-op 删除不会误清选择。
   - 2026-07-10 文化 / 宗教字段补充：文化与宗教的新增空对象、删除空对象、重命名、颜色和继承父级已迁移到 `executeEditCommand()`；新增成功后的选中新对象和 no-op 删除文案仍保留在调用点。
   - 2026-07-10 标记 / 标签字段补充：标记重命名、标记视觉设置、标签重命名、新增手工标签、删除标签和恢复生成标签已迁移到 `executeEditCommand()`；标签删除 / 恢复成功后的运行时面板刷新仍保留在调用点。
   - 2026-07-10 河流字段补充：河流重命名、按名称库重命名筛选河流和河流宽度因子调整已迁移到 `executeEditCommand()`；批量重命名继续保留成功数量和 no-op 文案，宽度刷新依赖 `RIVER_WIDTH_ONLY` effects。
   - 2026-07-10 湖泊字段补充：湖泊重命名和按名称库重命名筛选湖泊已迁移到 `executeEditCommand()`；列表动作栏回调修正为 `props.callbacks`，批量重命名继续保留成功数量和 no-op 文案。

59. `locateAndSelectObject()` helper 第一刀。`已完成`
   - 目标：推进编辑器基础设施清单中的统一定位 / 选择入口，先为面板内“定位对象”路径保留 source panel 语义。
   - 边界：本步先作为运行时初始化闭包内 helper 落地，只迁移 marker 面板定位路径；不一次性改写国家、城市、路线、河流、湖泊等其它定位路径。
   - 完成记录：新增 `locateAndSelectObject(panelId, object, options)`，内部复用 `renderer.locateObject()`、`selectFromPanel()`、runtime / pick panel 刷新和 `afterSelect` 回调；marker 面板 `onLocate` 改走该 helper，定位后保持 marker selection 和面板选中行一致。

60. `UiObjectTable` 标准空态动作第一刀。`已完成`
   - 目标：推进编辑器基础设施清单中的公共对象表格扩展，让空列表也能提供标准列表级动作入口。
   - 边界：本步只新增可选 `emptyAction` 和 `empty-action` 事件，先接入测量对象面板的“开始测量”；不做批量选择、列宽持久化，也不改变已有列表动作条。
   - 完成记录：公共 `UiObjectTable` 空态支持标准小按钮；测量对象列表为空时显示“开始测量”，点击后通过面板桥接进入测量模式；测量工具栏开关和空态入口复用 `startMeasurementMode()` / `stopMeasurementMode()`。

61. `executeEditCommand()` 返回结果第一刀。`已完成`
   - 目标：继续推进编辑命令统一执行入口，让调用点能通过 helper 读取命令执行后的标准 `getResult()`。
   - 边界：本步先补 helper 返回 `{executed, command, result, error}` 和保守异常策略；只迁移测量对象保存与 GEO 测量导入路径，不批量改造其它面板命令。
   - 完成记录：测量保存 / 导入命令新增标准 `getResult()`，旧 `getMeasurement()` / `getImported()` 作为兼容别名保留；保存测量对象和 GEO 测量导入改用 `executeEditCommand().result` 读取新增对象。

62. 备注删除接入编辑 helper 和面板刷新调度。`已完成`
   - 目标：继续推进低风险调用点迁移和 `refreshPanelsForEdit()` 扩展，减少备注面板手写命令执行和面板刷新逻辑。
   - 边界：本步只迁移备注删除；不改变备注创建、备注正文编辑、导出摘要或撤销 / 重做路径。
   - 完成记录：备注删除改走 `executeEditCommand()`；`refreshPanelsForEdit()` 对 `derived: ["object-panels"]` 统一刷新所有对象面板，保留备注删除原有刷新语义；同步修正 `NotesPanel.vue` 动作条回调中未定义的 `callbacks` 引用。

63. `locateAndSelectObject()` 线性对象扩展。`已完成`
   - 目标：继续推进统一定位 / 选择入口，把低风险线性和水体对象面板的定位路径收束到同一个 helper。
   - 边界：本步只迁移路线、河流和湖泊面板的“定位”回调；不改标签面板、城市 / 国家定位、闪烁高亮或进入编辑语义。
   - 完成记录：路线、河流和湖泊面板定位改走 `locateAndSelectObject()`；定位后会通过 source panel 语义同步 selection，并保留各自面板的选中行状态。

64. `locateAndSelectObject()` 区域与城市对象扩展。`已完成`
   - 目标：继续推进统一定位 / 选择入口，覆盖高频国家、省份和城市面板定位路径。
   - 边界：本步只迁移国家、省份、城市面板的“定位”回调；不改政府、外交、文化、宗教、标签或对象详情定位路径。
   - 完成记录：国家、省份和城市面板定位改走 `locateAndSelectObject()`；定位后同步 selection，并保留各自面板目标 / 选中行状态。

65. `locateAndSelectObject()` 社会对象扩展。`已完成`
   - 目标：继续推进统一定位 / 选择入口，覆盖文化和宗教面板定位路径。
   - 边界：本步只迁移文化、宗教面板的“定位”回调；不改文化 / 宗教新增删除、继承编辑、名称库绑定或备注编辑。
   - 完成记录：文化和宗教面板定位改走 `locateAndSelectObject()`；定位后同步 selection，并保留各自面板选中行状态。

66. `locateAndSelectObject()` 地区与军事对象扩展。`已完成`
   - 目标：继续推进统一定位 / 选择入口，覆盖地区和军事面板定位路径。
   - 边界：本步只迁移地区、军事面板的“定位”回调；不改地区样式编辑、军事态势 / 兵种编辑、战报导入或导出。
   - 完成记录：地区和军事面板定位改走 `locateAndSelectObject()`；定位后同步 selection，并保留各自面板选中行状态。

67. 路线删除接入编辑 helper。`已完成`
   - 目标：继续推进 `executeEditCommand()` 低风险调用点迁移，让路线删除复用统一命令执行、状态文案和面板刷新调度。
   - 边界：本步只迁移路线删除；不改变路线备注、道路重算、改线、端点重连或路线撤销 / 重做逻辑。
   - 完成记录：路线面板删除回调改走 `executeEditCommand()`；执行成功后通过 `refreshPanelsForEdit()` 按 `object-panels` 派生刷新对象面板，并保留 route mesh / object index 的命令 effects。

68. 控制台 API 根对象与只读能力第一刀。`已完成`
   - 目标：推进控制台 / 扩展 API 系统阶段 1，先提供可从浏览器控制台读取的 API 根对象和只读快照能力。
   - 边界：本步只暴露 `info`、`selection` 和 `layers` 只读命名空间；不接入导出、编辑、生成、导入或任何写地图数据的 API。
   - 完成记录：新增 `api-result.js` 和 `console-api.js`，在 app ready 后安装 `window.webglGeneratorApi`，并在未占用时安装 `window.api` 别名；`info.capabilities()`、`info.mapSummary()`、`info.runtimeStats()`、`selection.get()` 和 `layers.get()` 均返回统一 `ApiResult`，并只返回 JSON 快照摘要，不暴露内部 map 大对象或 typed array 引用。

69. 控制台导出 API 第一刀。`已完成`
   - 目标：推进控制台 / 扩展 API 系统阶段 2，先把现有完整地图 JSON、pack cell GeoJSON 和要素 GeoJSON 导出能力开放给脚本调用。
   - 边界：本步只接只读导出，不接 PNG、压缩 JSON、导入、生成或编辑 API；`download:false` 返回文本和元数据，`download:true` 仅触发下载，不改变地图数据或 checksum。
   - 完成记录：`api.data.exportAll()` 复用 `createMapDocument()` / `stringifyMapDocument()`；`api.data.exportGEO()` 复用 `createMapGeoJson()`；`api.data.exportFeatureGEO()` 复用 `createMapFeatureGeoJson()`，并支持传入 `layers` 和 `dissolvePolitical`。三类导出均返回文件名、MIME、字节数、文本和元数据；下载模式默认不回传文本以避免控制台误拿超大字符串。

70. 控制台 PNG 导出 API 第一刀。`已完成`
   - 目标：继续推进控制台 / 扩展 API 系统阶段 2，把 PNG 导出开放给脚本调用，并支持倍率和 overlay 合成。
   - 边界：本步只做 PNG，只读当前 canvas / overlay；不接压缩地图 JSON、导入、生成、编辑或 PNG 文件写入本地磁盘。`download:false` 返回 data URL，`download:true` 触发浏览器下载并默认不回传 data URL。
   - 完成记录：`apiCall()` 支持 Promise；`map-file-io.js` 拆出 `createCanvasPngBlob()` 供 API 和 UI 复用；`api.data.exportPNG()` 支持 `pixelScale / scale`、`includeMapOverlays`、`includeDataUrl` 和 `download`，返回文件名、MIME、字节数、尺寸、倍率和 overlay 标志。

71. 控制台压缩地图导出 API 第一刀。`已完成`
   - 目标：补齐阶段 2 导出闭环中的压缩完整地图 JSON，让脚本可以拿到 `.webgl-map.json.gz` 内容或触发下载。
   - 边界：本步只做压缩完整地图导出；不接导入、浏览器存档、生成、编辑或非 gzip 编码。`download:false` 返回 gzip base64，`download:true` 触发浏览器下载并默认不回传 base64。
   - 完成记录：`map-file-io.js` 拆出 `createCompressedMapDocumentBlob()`；`api.data.exportCompressedAll()` 复用完整地图文档序列化和 gzip 压缩逻辑，返回文件名、MIME、原始字节数、压缩字节数、文档元数据和可选 base64。

72. 控制台图层 API 第一刀。`已完成`
   - 目标：进入控制台 / 扩展 API 系统阶段 3，先开放视图模式和图层显隐两类显示偏好操作。
   - 边界：本步只改显示状态和偏好，不修改地图生成数据、selection、编辑历史或 checksum；暂不接单位、气候或主题 API。
   - 完成记录：`layers.setViewMode(mode)` 校验页面已有 `data-mode` 后复用 `setActiveModeButton()` 并调用 renderer `setColorMode()`；`layers.setVisible(layer, visible)` 校验 renderer 已知图层后同步本地偏好、UI 控件状态和 renderer `setLayerVisible()`。`layers.get()` 可读取变更后的 color mode、图层偏好和单位偏好。

73. 控制台单位 API 第一刀。`已完成`
   - 目标：继续阶段 3，开放单位显示偏好读取和应用，让脚本能同步距离、面积、数字缩写、地图比例尺、人口、军事和降水单位偏好。
   - 边界：本步只改显示偏好和相关控件；不改地图数据、生成参数、气候模型或 checksum。
   - 完成记录：新增 `api.units.get()` 和 `api.units.apply(preferences)`；`apply()` 使用既有 `normalizeUnitPreferences()` 校准输入，更新单位控件、全局控制偏好和 renderer unit preferences。`api.info.capabilities()` 已声明 `units` 命名空间。

74. 控制台气候只读 API 第一刀。`已完成`
   - 目标：继续阶段 3，先开放气候只读摘要，供脚本读取温度、降水、纬度、风带和生物群系统计。
   - 边界：本步只做 `climate.get()`；不接 `apply()`、`setLatitude()`、重算气候或派生 stale。
   - 完成记录：新增 `api.climate.get()`，返回温度范围与基础参数、降水范围、纬度模式 / 经纬边界、风带方向 / profile，以及 biome counts / total。`api.info.capabilities()` 已声明 `climate` 命名空间。

75. 控制台编辑 API 第一刀：history 与备注删除。`已完成`
   - 目标：进入阶段 4，先接最稳定的编辑命令 API，并把撤销 / 重做暴露给控制台脚本。
   - 边界：本步只接 `history.get()`、`history.undo()`、`history.redo()` 和 `edit.notes.delete(noteId)`；不接备注正文编辑、测量、标签、路线或 marker 编辑 API。
   - 完成记录：`installConsoleApi()` 现在接收 app action 注入；app action 复用 `executeEditCommand()`、`refreshPanelsForEdit()`、`refreshAfterEdit()` 和 `EditHistory`，保证 API 编辑也进入统一撤销栈和面板刷新路径。`edit.notes.delete()` 支持结构化 no-op / error 返回。

76. 控制台测量对象编辑 API 第一刀。`已完成`
   - 目标：继续阶段 4，把测量对象重命名和删除接入控制台 API。
   - 边界：本步只接 `edit.measurements.rename(id, name)` 和 `edit.measurements.delete(id)`；不接保存当前测量、导入测量、改点列、路线贴合或测量图层渲染。
   - 完成记录：app action 复用 `createRenameMeasurementCommand()`、`createDeleteMeasurementCommand()` 和 `executeEditCommand()`，API 编辑进入统一 `EditHistory`，并通过 measurement effects 刷新面板和运行统计。`api.info.capabilities()` 已声明 `edit.measurements.rename/delete`。

77. 控制台路线删除 API 第一刀。`已完成`
   - 目标：继续阶段 4，把路线删除接入控制台 API，复用已有路线删除命令。
   - 边界：本步只接 `edit.routes.delete(routeId)`；不接路线新增、改线、重算道路或路线备注编辑。
   - 完成记录：app action 复用 `createDeleteRouteCommand()`、`executeEditCommand()` 和 route effects；API 删除进入统一 `EditHistory`，并通过 route effects 刷新路线 mesh、对象面板和对象索引。`api.info.capabilities()` 已声明 `edit.routes.delete`。

78. 控制台标签编辑 API 第一刀。`已完成`
   - 目标：继续阶段 4，把标签删除 / 恢复接入控制台 API，覆盖手工标签删除和生成标签恢复。
   - 边界：本步只接 `edit.labels.delete(label)` 和 `edit.labels.restore(label)`；不接新增手工标签、移动标签、重命名、标签备注或批量标签规则。
   - 完成记录：app action 复用 `createDeleteLabelCommand()`、`createRestoreGeneratedLabelCommand()` 和 `executeEditCommand()`；API 参数会校验 `targetId / id` 与 `targetKind`，避免无效 ID 写入 hidden 列表。`api.info.capabilities()` 已声明 `edit.labels.delete/restore`。

79. 控制台 marker 删除 / 移动 API 第一刀。`已完成`
   - 目标：继续阶段 4，把资源标记删除和移动接入控制台 API，复用 marker collection 命令和派生刷新语义。
   - 边界：本步只接 `edit.markers.delete(markerId)` 和 `edit.markers.move(markerId, packCell)`；不接新增 marker、图标编辑、备注编辑、资源重生成或屏幕坐标拾取。
   - 完成记录：app action 复用 `createDeleteMarkerCommand()`、`createMoveMarkerCommand()`，并在 API 执行后标记 markers / economy 为 fresh、military / diplomacy 为 stale，刷新 summary、marker / economy / state / province / runtime 面板。`api.info.capabilities()` 已声明 `edit.markers.delete/move`。

80. 控制台 marker 新增 API 第一刀。`已完成`
   - 目标：补齐 marker 新增 API，让脚本可以指定 type、pack cell 和可选名称创建资源标记。
   - 边界：本步只接 `edit.markers.add({type, packCell, name})`；不接屏幕坐标拾取、图标编辑、备注编辑或资源重生成。
   - 完成记录：app action 复用 `createAddMarkerCommand()` 和 marker collection API 执行 helper；新增成功后返回 `createdMarker` 快照，并选中新建 marker。`api.info.capabilities()` 已声明 `edit.markers.add`。

81. 控制台城市新增 / 删除 API 第一刀。`已完成`
   - 目标：继续阶段 4，把城市新增和删除接入控制台 API，覆盖已有城市 collection edit commands。
   - 边界：本步只接 `edit.cities.add(gridCell)` 和 `edit.cities.delete(cityId)`；不接屏幕坐标拾取、城市重命名、人口、视觉、备注或城镇批量重算。
   - 完成记录：app action 复用 `createAddCityAtCellCommand()`、`createDeleteCityCommand()` 和 `executeEditCommand()`；新增成功后选中新城市，删除成功后清空选择，并刷新 state / province / city / runtime 面板。`api.info.capabilities()` 已声明 `edit.cities.add/delete`。

82. 控制台省份新增 / 删除 API 第一刀。`已完成`
   - 目标：继续阶段 4，把省份新增和删除接入控制台 API，覆盖已有 province collection edit commands。
   - 边界：本步只接 `edit.provinces.add(gridCell)` 和 `edit.provinces.delete(provinceId)`；不接屏幕坐标拾取、省份笔刷、重命名、备注或省份重算。
   - 完成记录：app action 复用 `createAddProvinceAtCellCommand()`、`createDeleteProvinceCommand()` 和 `executeEditCommand()`；新增成功后选中新省份，删除成功后清空选择，并刷新对象面板与 runtime。`api.info.capabilities()` 已声明 `edit.provinces.add/delete`。

83. 控制台国家新增 / 删除 API 第一刀。`已完成`
   - 目标：继续阶段 4，把国家新增和删除接入控制台 API，覆盖已有 state collection edit commands。
   - 边界：本步只接 `edit.states.add(gridCell)` 和 `edit.states.delete(stateId)`；不接屏幕坐标拾取、国家笔刷、重命名、政体、颜色、外交或国家重算。
   - 完成记录：app action 复用 `createAddStateAtCellCommand()`、`createDeleteStateCommand()` 和 `executeEditCommand()`；新增成功后用 `resolveObject()` 选中新国家，删除成功后清空选择，并刷新对象面板与 runtime。`api.info.capabilities()` 已声明 `edit.states.add/delete`。

84. 控制台选择 / 定位 API 第一刀。`已完成`
   - 目标：进入 selection / locate API，开放对象 resolve、选择、清空和定位能力。
   - 边界：本步只接 `selection.resolve(object)`、`selection.select(object)`、`selection.clear()` 和 `selection.locate(object)`；不接临时高亮、多对象选择、编辑态 start/stop 或屏幕坐标 pick。
   - 完成记录：selection API 复用 `resolveObject()`、`SelectionStore` 和 `locateObject()`；`resolve` 对不存在对象返回结构化错误，不再沿用 UI 容错回退。`api.info.capabilities()` 已声明 selection 新方法。

85. 控制台屏幕坐标 pick API 第一刀。`已完成`
   - 目标：继续 selection API，开放屏幕坐标拾取能力，方便脚本从 canvas 坐标读取 grid / pack / object pick 结果。
   - 边界：本步只接 `selection.pick(clientX, clientY)`；不接临时高亮、多对象高亮或自动选择拾取对象。
   - 完成记录：API 复用 renderer `pickClientPoint()`，刷新 pick 面板但不改变 selection；非法坐标返回结构化错误。`api.info.capabilities()` 已声明 `selection.pick`。

### 验证要求

- 每个代码步骤至少运行相关文件的 `node --check` 和 `git diff --check`。
- 每执行几步后运行 `pnpm run build:app`，并用系统 Chrome / Playwright 做浏览器烟测。
- 面板持久化烟测至少覆盖：打开一个领域面板，刷新页面后面板恢复打开；关闭后再次刷新不恢复；对象详情面板不因保存状态自动打开。

### 本轮综合验证记录

- `node --check app\webgl-generator\src\ui\panel-manager.js`、`node --check app\webgl-generator\src\ui\panels\object-details-panel.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`node --check app\webgl-generator\src\ui\panels\river-panel.js` 均通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 标记管理构建产物浏览器烟测通过：打开控制面板管理页和标记管理，双击首行标记后选中 1 行并打开“重命名”二级编辑浮层，输入值为该标记名称，`glError = 0`，console/page error 为 `0`。
- 本批次综合验证已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认测量对象和军事管理双击首行后均能打开对应“重命名”浮层，输入值与选中对象一致，`glError = 0`，console/page error 为 `0`。
- 编辑器专题清单状态校准已完成：`git diff --check` 通过。
- 地区面板头部撤销 / 重做接入已完成：`node --check app\webgl-generator\src\ui\panels\zone-panel.js` 和 `git diff --check` 通过。
- 路线面板删除路线第一刀已完成：`node --check app\webgl-generator\src\runtime\route-edit-commands.js`、`node --check app\webgl-generator\src\ui\panels\route-panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；命令级 Node 验证确认删除 / 撤销 / 重做会同步路线数、metadata、pack 路线链接和备注；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认删除路线 `#452` 后路线数 `589 -> 588`、metadata `589 -> 588`、线段 `2776 -> 2593`，头部撤销显示“撤销：删除路线 #452”，撤销后恢复到 `589 / 2776`，`glError = 0`，console/page error 为 `0`。
- 路线面板道路重算入口已完成：`node --check app\webgl-generator\src\ui\panels\route-panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过；Playwright + 系统 Chrome 构建产物烟测确认路线面板存在“重算道路”操作，点击后状态显示“道路已按当前国家、城镇、港口和陆海约束重算（扰动 #1）：589 -> 589”，`glError = 0`，console/page error 为 `0`。
- 生物群系统计面板第一刀已完成：`node --check app\webgl-generator\src\ui\panels\biome-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过；Playwright + 系统 Chrome 构建产物烟测确认管理页存在“生物群系”入口，面板可打开，表格 13 行，详情包含 `pack cells`，console/page error 为 `0`。
- 人口统计面板第一刀已完成：`node --check app\webgl-generator\src\ui\panels\population-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认人口统计面板可打开，表格 26 行，详情包含国家人口字段，`glError = 0`，console/page error 为 `0`。
- 纹章统计面板第一刀已完成：`node --check app\webgl-generator\src\ui\panels\emblem-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认纹章统计面板可打开，表格 26 行，详情包含国家纹章字段，`glError = 0`，console/page error 为 `0`。
- 水体与地貌统计面板第一刀已完成：`node --check app\webgl-generator\src\ui\panels\feature-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认水体统计面板可打开，表格 11 行，详情包含 feature 类型和分组字段，`glError = 0`，console/page error 为 `0`。
- 气候统计面板第一刀已完成：`node --check app\webgl-generator\src\ui\panels\climate-panel.js`、`node --check app\webgl-generator\src\ui\panel.js`、`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认气候统计面板可打开，表格 5 行，详情包含纬度和大气方向字段，`glError = 0`，console/page error 为 `0`。
- 水体统计面板港湾指标已完成：`git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认水体统计面板可打开，表格 11 行，摘要和详情包含“港湾 cells / 泊位强度”，`glError = 0`，console/page error 为 `0`。
- 水体统计面板岸线长度已完成：`git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认水体统计面板摘要包含“海岸长度 / 湖岸长度”，表格 11 行，`glError = 0`，console/page error 为 `0`。
- 高度编辑器命令化状态校准已完成：已复核 `app\webgl-generator\src\runtime\height-edit-commands.js` 和 `app\webgl-generator\src\runtime\app.js` 中的 `finishHeightStroke` / 高度面板撤销重做接入；`git diff --check` 通过。
- 高度面板统计增强第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认高度面板包含当前均高、陆地、低地、山地、海平面带和均变指标。
- 高度面板最近笔刷均变反馈已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\height-panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认高度笔刷后“均变”显示为带符号数值，撤销历史为 `1`，`glError = 0`，console/page error 为 `0`。
- 高度笔刷标记派生过期第一刀已完成：`node --check app\webgl-generator\src\runtime\height-edit-commands.js` 和 `git diff --check` 通过；命令级 Node 验证确认高度笔刷应用 / 撤销都会写入高度依赖派生过期系统，并同步军事、经济等 metadata stale 标志；Playwright + 系统 Chrome 构建产物烟测确认高度笔刷后过期系统包含 12 项。
- 高度面板显示待派生摘要已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\height-panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认高度面板初始显示“待派生无”，高度笔刷后显示“待派生12 项”，撤销历史为 `1`，`glError = 0`，console/page error 为 `0`。
- 高度面板待派生明细摘要已完成：`git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认高度笔刷后面板显示“待派生12 项：河流、路线、生物群系等”。
- 高度面板接入河流重算入口已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\height-panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认高度面板存在“重算河流”按钮，点击后完成河流重算，`glError = 0`，console/page error 为 `0`。
- 河流重算清理已刷新派生状态已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认高度笔刷后待派生为 12 项，点击“重算河流”后降为 9 项，且 `rivers / routes / biomes` 不再留在过期清单中。
- 完整地图压缩文件导出 / 导入第一刀已完成：`node --check app\webgl-generator\src\runtime\map-file-io.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过；命令级 Node 断言确认 v1 文档、typed array 恢复和未来版本拒绝逻辑正常；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `.webgl-map.json.gz` 可导出并重新导入，导入后 seed `stage-2-1`、grid cells `10004`、pack cells `5968`、`glError = 0`，非 health console/page error 为 `0`；health monitor 记录 `3` 次 `main-thread-long-task`，作为后续性能观察信号保留。
- 地图数据导入错误详情第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认坏 JSON 导入会显示文件名、大小、MIME、推断格式、`SyntaxError`、错误信息和中文建议，详情块保持展开，`glError = 0`，非 health console/page error 为 `0`，warning 通道记录预期导入失败诊断。
- PNG 导出倍率第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\map-file-io.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `PNG 倍率` 控件包含 `1/2/3/4x`，设置 `2x` 后下载 PNG 文件头尺寸为 `2560 x 1600`，源 canvas 为 `1280 x 800`，状态显示“倍率 2x”，`glError = 0`，非 health console/page error 为 `0`。
- 政治面 dissolve 拓扑原型第一刀已完成：`node --check app\webgl-generator\src\runtime\map-file-io.js` 和 `git diff --check` 通过；命令级 Node 断言确认两个相邻方形 cell dissolve 后输出一个闭合 MultiPolygon、点数从非合并 `10` 点降为 `7` 点，并确认 `3x3` 缺中心对象输出一个 polygon、两个 rings（外环 `13` 点、hole `5` 点）；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 政治面 dissolve 内部导出验证第一刀已完成：`node --check app\webgl-generator\src\runtime\map-file-io.js` 和 `git diff --check` 通过；命令级 Node 真实生成图验证确认 `dissolve-smoke` 10k 图的 state / province / zone 非 dissolve 与 dissolve feature 数均为 `206`，dissolve 输出 `properties.dissolvedPolitical = true` 且所有 feature `dissolved = true`，坐标点 `53180 -> 10383`，减少 `80.48%`，非 dissolve 导出 `21.74ms`、dissolve 导出 `44.43ms`；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 政治面 dissolve 导出 UI 开关第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认启用“合并政治面边界”后下载的 `features-dissolve-smoke.geojson` 为 `states-provinces-zones`，`dissolvedPolitical = true`，feature 数 `261`，bad feature `0`，坐标点 `12030`，状态显示“已合并政治面边界”，`glError = 0`，非 health console/page error 为 `0`。
- 视觉主题预设基础第一刀已完成：`node --check` 覆盖 `themes.js`、`color-modes.js`、`placeholder-renderer.js`、`app.js`、`panel.js` 和 `global-config-store.js`，`git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认切换 `night` 后 renderer 主题、选择框、偏好、stage 背景和主题 token 同步变化，checksum 不变；导出 `.webgl-map.json` 后文件含 `visualTheme=night`，切回默认再导入可恢复 `night`，`glError = 0`，非 health console/page error 为 `0`。
- 视觉主题线层 token 第一刀已完成：`node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\shore-layer.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认切换 `night` 后海岸线、湖岸线、国界、省界、主路、次路和小路 token 全部变化，路线 buffer `34488` 顶点、线层 buffer `124194` 顶点、渲染路线 `589`，`glError = 0`，checksum 不变，非 health console/page error 为 `0`。
- 视觉主题标签和比例尺 token 第一刀已完成：`node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认切换 `night` 后 `.map-stage` 写入比例尺、城市标签、国家标签和手工标签主题变量，比例尺背景为 `rgba(3, 8, 13, 0.82)`、比例尺线为 `rgb(209, 230, 230)`，城市标签为 `rgb(219, 230, 194)`，国家标签为 `rgba(242, 199, 115, 0.94)`，渲染数据签名保持不变，`glError = 0`，非 health console/page error 为 `0`。
- 视觉主题图例 token 第一刀已完成：`node --check app\webgl-generator\src\renderer\themes.js`、`node --check app\webgl-generator\src\renderer\placeholder-renderer.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认切换 `night` 并切到温度视图后图例可见，背景为 `rgba(3, 8, 13, 0.84)`、标题为 `rgb(214, 235, 235)`、刻度为 `rgba(194, 219, 224, 0.88)`，`glError = 0`，非 health console/page error 为 `0`。
- PNG 导出合成固定地图 overlay 第一刀已完成：`node --check app\webgl-generator\src\runtime\map-file-io.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物文件级烟测确认夜间主题温度图例下导出 `1280 x 800` PNG，比例尺线像素为 `[209, 230, 230, 255]`，比例尺背景像素为 `[28, 23, 30, 255]`，图例背景像素为 `[27, 21, 27, 255]`，状态显示“图片已导出”，`glError = 0`，非 health console/page error 为 `0`。
- 文化面板新增 / 删除空文化第一刀已完成：`node --check app\webgl-generator\src\runtime\culture-edit-commands.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\culture-panel.js` 和 `git diff --check` 通过；命令级 Node 断言确认新增文化、撤销新增、重做新增、删除空文化、撤销删除和非空文化删除阻止逻辑正常；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认新增 `新文化 13` 后文化数 `13 -> 14`、删除后可见数回到 `13` 且 `removed=true`、头部撤销后恢复为 `14`，`glError = 0`，console/page error 为 `0`。
- 宗教面板新增 / 删除空宗教第一刀已完成：`node --check app\webgl-generator\src\runtime\religion-edit-commands.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\religion-panel.js` 和 `git diff --check` 通过；命令级 Node 断言确认新增宗教、撤销新增、重做新增、删除空宗教、撤销删除和非空宗教删除阻止逻辑正常；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认新增 `新宗教 19` 后宗教数 `19 -> 20`、删除后可见数回到 `19` 且 `removed=true`、头部撤销后恢复为 `20`，`glError = 0`，console/page error 为 `0`。
- `executeEditCommand()` helper 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测向测量面板注入 `烟测测量` 后，通过列表动作条删除，测量数 `1 -> 0`、历史 `undo=1`、状态显示“已删除测量对象 烟测测量。”，头部撤销后恢复为 `1` 且 `redo=1`，`glError = 0`，console/page error 为 `0`。
- Edit Command 轻量契约第一刀已完成：`git diff --check` 通过；新增 `docs/task-notes/edit-command-contract.md` 并同步 `docs/task-notes/README.md` 和编辑器清单，明确命令字段、`context.map`、`effects.affected`、helper 调用层、撤销快照和删除命令边界。
- `refreshPanelsForEdit()` helper 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认测量对象删除后面板摘要刷新为 `测量 0`、历史 `undo=1`、状态显示“已删除测量对象 烟测测量。”，头部撤销后测量对象恢复，`glError = 0`，console/page error 为 `0`。
- `locateAndSelectObject()` helper 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 marker 面板选中 `丹江矿山` 后点击行内定位，selection 保持 marker `#2`，面板选中行未丢，`glError = 0`，console/page error 为 `0`。
- `UiObjectTable` 标准空态动作第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\measurement-panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认测量对象列表为空时显示“开始测量”，点击后进入测量模式，状态显示“已进入测量模式。”，`glError = 0`，health / console / page error 均为 `0`。
- `executeEditCommand()` 返回结果第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\measurement-edit-commands.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认通过真实“保存”按钮保存两点测量后新增 `measurement-1`，状态显示“已保存测量对象 测量 1。”，撤销栈 `undo=1`，面板保持打开并选中新测量对象，`glError = 0`，health / console / page error 均为 `0`。
- 备注删除接入编辑 helper 和面板刷新调度已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认注入 `烟测备注` 后点击真实“删除选中备注”按钮，备注数和 metadata `1 -> 0`，摘要刷新为 `备注0`，状态显示“已删除备注 烟测备注。”，撤销栈 `undo=1`，`glError = 0`，health / console / page error 均为 `0`。
- `locateAndSelectObject()` 线性对象扩展已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测依次打开路线、河流和湖泊面板并点击表格定位按钮，selection 分别保持 `route / river / lake`，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。
- `locateAndSelectObject()` 区域与城市对象扩展已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测依次打开国家、省份和城市面板并点击选中行定位按钮，selection 分别保持 `state / province / city` 和对应 id，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。
- `locateAndSelectObject()` 社会对象扩展已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测依次打开文化和宗教面板并点击选中行定位按钮，selection 分别保持 `culture / religion` 和对应 id，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。
- `locateAndSelectObject()` 地区与军事对象扩展已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测依次打开地区和军事面板，点击首行后再点击定位按钮，selection 分别保持 `zone / military` 和对应 id，各面板均只有 1 个选中行，`glError = 0`，health / console / page error 均为 `0`。
- 路线删除接入编辑 helper 已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认点击真实“删除路线”按钮后路线数 `589 -> 588`、metadata routes `588`、路线段数 `2776 -> 2593`、状态显示“已删除路线 #452。”、撤销栈 `undo=1`；点击面板头部撤销后路线数和 metadata 恢复到 `589`，`redo=1`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台 API 根对象与只读能力第一刀已完成：`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `window.webglGeneratorApi` 和 `window.api` 可读，`info.capabilities()`、`info.mapSummary()`、`info.runtimeStats()`、`selection.get()`、`layers.get()` 均返回 `ok=true`，调用前后 checksum 保持 `989744d0`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台导出 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `data.exportAll({download:false})` 返回 `webgl-generator-map` 文档文本 `15,376,660` 字节，`data.exportGEO({download:false})` 返回 `5,968` 个 cell 面，`data.exportFeatureGEO({download:false, dissolvePolitical:true})` 返回 `1,947` 个要素且 `dissolvedPolitical=true`；`data.exportFeatureGEO({download:true, includeText:false})` 触发 `fmg-stage-2-1-1754ddd6.features.geojson` 下载，调用前后 checksum 保持 `1754ddd6`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台 PNG 导出 API 第一刀已完成：`node --check` 覆盖 `api-result.js`、`console-api.js` 和 `map-file-io.js`，`git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `data.exportPNG({download:false, pixelScale:2})` 返回 `image/png` data URL，API 尺寸和 PNG 文件头均为 `2560 x 1600`，字节数 `84,510`；`data.exportPNG({download:true, pixelScale:1})` 触发 `fmg-stage-2-1-549ebe1f.png` 下载，调用前后 checksum 保持 `549ebe1f`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台压缩地图导出 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\console-api.js`、`node --check app\webgl-generator\src\runtime\map-file-io.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `data.exportCompressedAll({download:false})` 返回 gzip base64，解压后为 `webgl-generator-map` 文档且 checksum 保持 `506ad108`，原始 `15,418,281` 字节、压缩 `2,453,326` 字节、base64 长度 `3,271,104`；`data.exportCompressedAll({download:true})` 触发 `fmg-stage-2-1-506ad108.webgl-map.json.gz` 下载，`glError = 0`，health / console / page error 均为 `0`。
- 控制台图层 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\console-api.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `layers.setViewMode("temperature")` 后 renderer 和按钮均为温度视图，`layers.setVisible("routes", false)` / `true` 可关闭并恢复路线图层，最终 renderer `routes=true`、路线按钮 `aria-pressed=true` 且 active，调用前后 checksum 保持 `cbedb91c`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台单位 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\console-api.js`、`node --check app\webgl-generator\src\ui\panel.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `units.apply({distanceUnit:"km", numberAbbreviation:"none", mapScaleKmPerCm:125, populationScale:2, militaryScale:1.5, precipitationScale:0.5})` 后 API 返回和控件均同步为 `km / km2 / none / 125 / 2 / 1.5 / 0.5`，`layers.get().units` 同步更新，调用前后 checksum 保持 `f25a7b4e`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台气候只读 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `climate.get()` 返回温度范围 `-13..24`、降水范围 `0..63`、纬度模式 `auto / 自动纬度`、经纬边界 `latN 7.7 / latS -37.3 / lonW -45 / lonE 45`、风带 `customBands` 和 biome total `5968`，调用前后 checksum 保持 `e42ee4f3`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台编辑 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测注入 `API 烟测备注` 后，`edit.notes.delete("api-smoke-note")` 使备注数 `1 -> 0`，`history.undo()` 恢复为 `1`，`history.redo()` 再次删除为 `0`，最终 history 为 `undo=1 / redo=0 / lastLabel=重做 删除备注 API 烟测备注`，状态显示“已删除备注 API 烟测备注。”，调用前后 checksum 保持 `f1bd14c3`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台测量对象编辑 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测注入 `api-smoke-measurement` 后，`edit.measurements.rename(..., "新测量")` 成功改名，`edit.measurements.delete()` 使数量变为 `0`，`history.undo()` 恢复名为“新测量”的对象，`history.redo()` 再次删除，最终 history 为 `undo=2 / redo=0 / lastLabel=重做 删除测量对象 api-smoke-measurement`，状态显示“已删除测量对象 api-smoke-measurement。”，调用前后 checksum 保持 `fc9c967b`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台路线删除 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测对真实路线 `#0` 调用 `edit.routes.delete(0)` 后路线数和 metadata `589 -> 588`，`history.undo()` 恢复为 `589`，`history.redo()` 再次删除为 `588`，最终 history 为 `undo=1 / redo=0 / lastLabel=重做 删除路线 #0 #0`，状态显示“已删除路线 #0。”，调用前后 checksum 保持 `8fe1d6f8`，`glError = 0`，health / console / page error 均为 `0`。
- 控制台标签编辑 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `labels.delete/restore`，注入手工标签 `900001` 后 `edit.labels.delete({targetKind:"custom", targetId:900001})` 可删除、`history.undo()` 恢复、`history.redo()` 再删；对真实城市标签 `#1` 预置 hidden 后 `edit.labels.restore({targetKind:"city", targetId:1})` 可恢复，`history.undo()` 可重新隐藏，校验值 `63ee1433`。
- 控制台 marker 删除 / 移动 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `markers.delete/move`；真实标记 `#0` 从 pack cell `1068` 移动到 `0` 后可撤销恢复，派生过期包含 `military / diplomacy`；真实标记 `#43` 删除后数量 `44 -> 43`、metadata `43`，撤销恢复为 `44`，重做再次删除为 `43`，checksum 保持 `003593d4`，校验值 `2d18884b`。
- 控制台 marker 新增 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `markers.add`；`edit.markers.add({type:"mines", packCell:0, name:"API 新增标记"})` 新增 marker `#44`、数量 `44 -> 45`、selection 指向新 marker、派生过期包含 `military / diplomacy`，撤销后数量回到 `44` 且新 marker 不存在，重做恢复同一 marker，metadata `45`，checksum 保持 `dbffbd09`，校验值 `37be900b`。
- 控制台城市新增 / 删除 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `cities.add/delete`；`edit.cities.add(934)` 新增城市 `#828`、数量 `828 -> 829`、selection 指向新城市，撤销后回到 `828` 且新城市不存在，重做恢复同一城市；`edit.cities.delete(828)` 后数量回到 `828` 且城市 `removed=true`，撤销删除恢复为 `829`，metadata `829`，checksum 保持 `1c0f54d0`，校验值 `ad94e835`。
- 控制台省份新增 / 删除 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `provinces.add/delete`；`edit.provinces.add(934)` 新增省份 `#239`、归属国家 `#17`、影响 `3` cells、数量 `238 -> 239`、selection 指向新省份，撤销后回到 `238`，重做恢复同一省份；`edit.provinces.delete(239)` 后数量回到 `238` 且省份 `removed=true`，撤销删除恢复为 `239`，metadata `239`，checksum 保持 `8b6a2c2d`，校验值 `f1009eec`；本次烟测记录一次 health `main-thread-long-task` 约 `3558ms`，作为省份 collection 编辑性能观察信号保留。
- 控制台国家新增 / 删除 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `states.add/delete`；`edit.states.add(934)` 新增国家 `#21`、省份 `#239`、城市 `#828`、影响 `3` cells、国家数量 `20 -> 21`、selection 指向新国家，派生过期包含 `military / zones / state-markers / economy / diplomacy`，撤销后回到 `20`，重做恢复同一国家；`edit.states.delete(21)` 后数量回到 `20` 且国家 `removed=true`，撤销删除恢复为 `21`，metadata `21`，checksum 保持 `eefd2f3b`，校验值 `ac14f830`。
- 控制台选择 / 定位 API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `selection.get/resolve/select/clear/locate`；`selection.resolve({kind:"city", id:1})` 返回城市“玄昌”快照，`select()` 和 `locate()` 均能设置 selection，`clear()` 清空 selection / editingObject，不存在城市 `#999999` 返回 `ok=false` 和“找不到对象”错误，checksum 保持 `8ab0c776`，校验值 `4bf48804`。
- 控制台屏幕坐标 pick API 第一刀已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `api.info.capabilities()` 包含 `selection.pick`；对 canvas 中心点调用 `selection.pick()` 返回 grid cell `4941`、pack cell `2570`、海洋 feature 和 route `#467` pick 结果，非法坐标返回 `ok=false` 和“clientX / clientY 必须是有限数”，checksum 保持 `5b0ba5fe`，校验值 `21fc36fd`。
- Playwright + 系统 Chrome 浏览器烟测通过：河流面板打开状态保存为 `open: true` 后刷新会恢复；关闭后保存为 `open: false`，再次刷新不恢复；河流筛选词 `river-smoke` 和排序 `ID ↑` 跨刷新恢复；对象详情面板即使本地状态被写入 `open: true` 也不会自动恢复；`glError = 0`。
- 路线、湖泊和地区面板列表偏好接入后已完成 `node --check`，综合构建和浏览器烟测待后续再累积几步后统一执行。
- 国家、省份和城市面板列表偏好接入后已完成 `node --check`，综合构建和浏览器烟测待后续再累积几步后统一执行。
- 文化、宗教和外交面板列表偏好接入后已完成 `node --check`，综合构建和浏览器烟测待本批次收尾统一执行。
- 本批次综合验证已完成：`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 烟测确认 9 个新覆盖面板均恢复筛选词和排序偏好，`glError = 0`。
- marker、标签 / 命名和备注总览面板列表偏好接入后已完成 `node --check`，综合构建和浏览器烟测待后续再累积几步后统一执行。
- 测量对象和名称库总览面板列表偏好接入后已完成 `node --check`，综合构建和浏览器烟测待后续再累积几步后统一执行。
- 政体、经济和军事面板列表偏好接入后已完成 `node --check`，综合构建和浏览器烟测待本批次收尾统一执行。
- 本批次综合验证已完成：`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 烟测确认 marker、标签 / 命名、备注总览、测量对象、名称库总览、政体、经济和军事面板均恢复筛选词和排序偏好，`glError = 0`。
- 控制面板和经济面板当前 tab 持久化已完成：`node --check` 覆盖 `panel-list-preferences.js`、`economy-panel.js` 和 `global-config-store.js`；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认控制面板恢复“管理”、经济面板恢复“交易”，`glError = 0`。
- `UiObjectTable` 虚拟滚动第一刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认城市管理大表启用虚拟窗口、滚动换页和点击选中正常，`glError = 0`。
- `UiObjectTable` 虚拟滚动第一刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认城市管理大表启用虚拟窗口、滚动换页和点击选中正常，`glError = 0`。
- 对象表格双击进入编辑第一刀已完成：`git diff --check` 通过；在同一提升环境中重装依赖后 `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认城市管理首行双击后打开“重命名”浮层，输入值与选中城市一致，`glError = 0`，console/page error 为 `0`。
- 河流表格双击进入编辑第二刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认河流管理首行双击后打开“重命名”浮层，输入值与选中河流一致，`glError = 0`，console/page error 为 `0`。
- 湖泊表格双击进入编辑第三刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认湖泊管理首行双击后打开“重命名”浮层，输入值与选中湖泊一致，`glError = 0`，console/page error 为 `0`。
- 国家表格双击进入编辑第四刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认国家管理非中立行双击后打开“重命名”浮层，输入值与选中国家原名一致，`glError = 0`，console/page error 为 `0`。
- 省份表格双击进入编辑第五刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认省份管理非中立行双击后打开“重命名”浮层，输入值与选中省份原名一致，`glError = 0`，console/page error 为 `0`。
- 文化表格双击进入编辑第六刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认文化管理首行双击后打开“重命名”浮层，输入值与选中文化一致，`glError = 0`，console/page error 为 `0`。
- 宗教表格双击进入编辑第七刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认宗教管理首行双击后打开“重命名”浮层，输入值与选中宗教一致，`glError = 0`，console/page error 为 `0`。
- 本批次综合验证已完成：Playwright + 系统 Chrome 构建产物烟测一次性覆盖湖泊、国家、省份、文化和宗教面板，五个面板双击首个有效行后均能打开对应“重命名”浮层，输入值与选中对象一致，`glError = 0`，console/page error 为 `0`。
- 标签表格双击进入编辑第八刀已完成：`git diff --check` 通过，`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认标签管理首行双击后打开“重命名”浮层，输入值与选中标签一致，`glError = 0`，console/page error 为 `0`。
- 编辑命令默认刷新入口收口已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认公开 `webglGeneratorApi.edit.routes.delete()` 删除真实路线后默认后处理会调用已打开路线面板 `update()` 1 次，路线数 `589 -> 588`，撤销栈 `undo=1`，`lastEditRefresh` 为 `route-mesh, object-panels, object-index` / `affected route#0`，`glError = 0`；补充烟测确认带自定义 `refreshAfterStateEdit` 的 `webglGeneratorApi.edit.states.add(934)` 也会触发统一面板 helper，国家数 `21 -> 22`，撤销栈 `undo=1`，国家面板 `update()` 被调用，`lastEditRefresh` 包含 `object-panels` 和 `affected state#new`。
- 路线备注接入统一编辑执行器已完成：`node --check app\webgl-generator\src\runtime\app.js` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认真实“编辑备注”二级面板写入 `路线备注迁移烟测` 后生成 `route:0` 备注，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-panels` / `affected route#0`，详情显示“有备注（8字）”，`glError = 0`。
- 多对象备注保存接入统一编辑执行器已完成：`node --check app\webgl-generator\src\runtime\app.js` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认国家备注生成 `state:1`、河流备注生成 `river:1`，两者均进入撤销栈并刷新 `object-panels`，详情显示“有备注（8字）”，`glError = 0`。
- 名称库编辑接入统一编辑执行器已完成：`node --check app\webgl-generator\src\runtime\app.js` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认“新建用户库”后用户库 `0 -> 1`，撤销栈 `undo=1`，`lastEditRefresh` 为 `object-panels` / `selection none`，名称库面板和本地名称库偏好均包含新库，`glError = 0`。
- 城市字段编辑接入统一编辑执行器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认城市 `#1` 人口 `17.549 -> 18.549` 后 `lastEditRefresh` 为 `city-population, point-layers, labels, object-panels`，随后应用剪影后 `visual.manual=true` 且 `lastEditRefresh` 为 `labels, object-panels`；补充 smoke 确认真实“重命名”把城市 `#0` 改为 `城市统一执行器烟测` 后进入撤销栈，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected city#0`，真实“按名称库重命名筛选”把城市 `#0` 改回“霜阴”，撤销栈 `undo=2`，`lastLabel` 为 `按名称库重命名城市 828 个`，`glError = 0`，console/page error 为 `0`。
- 国家字段编辑接入统一编辑执行器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物 smoke 确认真实国家“重命名”二级面板把国家 `#1` 改为 `统一执行器烟测` 后进入撤销栈，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected state#1`；真实“调整政体”二级面板把国家 `#1` 改为 `monarchy` 后进入撤销栈，`lastEditRefresh` 为 `state-government, object-name, labels, object-panels, defer:economy, defer:diplomacy, defer:military`，下游派生标脏为 `economy, diplomacy, military`，`glError = 0`。
- 省份字段编辑接入统一编辑执行器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物 smoke 确认真实省份“重命名”二级面板把省份 `#187` 改为 `省份统一执行器烟测` 后进入撤销栈，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected province#187`；真实“调整颜色”二级面板把省份 `#187` 改为 `#7f6cc7` 后进入撤销栈，`lastEditRefresh` 为 `province-color, cell-colors, object-panels` / `affected province#187`，`glError = 0`。
- 文化与宗教字段编辑接入统一编辑器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物 smoke 确认真实“新增空文化”新增 `#13` 后 `lastEditRefresh` 为 `culture-structure, cell-colors, object-index, object-panels`，真实文化“重命名”把 `#13` 改为 `文化统一执行器烟测` 后 `lastEditRefresh` 为 `object-name, labels, object-panels`；真实“新增空宗教”新增 `#19` 后 `lastEditRefresh` 为 `religion-structure, cell-colors, object-index, object-panels`，真实宗教“调整颜色”把 `#19` 改为 `#7f6cc7` 后 `lastEditRefresh` 为 `religion-color, cell-colors, object-panels`，`glError = 0`。
- 标记与标签字段编辑接入统一编辑器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物 smoke 确认真实标记“重命名”把标记 `#0` 改为 `标记统一执行器烟测` 后进入撤销栈，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected marker#0`；真实“调整图标”把标记 `#0` 设为 `symbol=marker / palette=natural` 后进入撤销栈，`lastEditRefresh` 为 `point-layers, labels, object-panels`；标签“新增标签”新增手工标签 `#1` 后设置待放置状态和 selection；生成城市标签“删除标签 / 恢复标签”会更新 `labels.hidden.city` 并刷新 `labels, object-panels`，`glError = 0`，console/page error 为 `0`。
- 河流名称与宽度编辑接入统一编辑器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物 smoke 确认真实河流“重命名”把河流 `#68` 改为 `河流统一执行器烟测` 后进入撤销栈，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected river#68`；真实“调整宽度”把 `widthFactor` 改为 `1.5` 后进入撤销栈，`lastEditRefresh` 为 `river-mesh, river-width-stats, object-panels`；真实“按名称库重命名筛选河流”把河流 `#68` 改回“白溪”，撤销栈 `undo=3`，`lastLabel` 为 `按名称库重命名河流 225 条`，`glError = 0`，console/page error 为 `0`。
- 湖泊名称编辑接入统一编辑器已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物 smoke 确认真实湖泊“重命名”把湖泊 `#5` 改为 `湖泊统一执行器烟测` 后进入撤销栈，`lastEditRefresh` 为 `object-name, labels, object-panels` / `affected lake#5`；真实“按名称库重命名筛选湖泊”把湖泊 `#5` 改回“秋泽”，撤销栈 `undo=2`，`lastLabel` 为 `按名称库重命名湖泊 4 个`，刷新摘要为 `object-name, object-panels`，`glError = 0`，console/page error 为 `0`。
