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
   - 进展记录：路线管理已完成“删除选中路线”小图标第一刀；命令会从 `settlements.routes` 中移除目标路线、清理对应路线备注，并支持撤销恢复路线与备注。本刀不新增路线绘制入口，也不重算经济 / 贸易派生。资源标记面板已把“移动 / 删除选中资源标记”收束到列表下方小图标动作条，删除继续复用既有 `createDeleteMarkerCommand()` 和 `EditHistory`，不新增资源重生成语义。备注总览已把“定位备注对象 / 删除选中备注”并入表格下方 `UiPanelIoActions`，删除继续复用 `createDeleteNoteCommand()`。名称库总览已把“新建用户库 / 复制内置 / 删除选中用户库 / 清空用户库”收束到同一列表动作条，继续复用名称库 edit command 快照撤销逻辑。河流管理已把“按名称库重命名筛选河流 / 定位选中河流 / 进入河流编辑”收束到列表动作条；本刀不新增河流删除，因为河段、支流、流域和地形派生约束仍需单独梳理。湖泊管理已把“按名称库重命名筛选湖泊 / 定位选中湖泊”收束到列表动作条；本刀不新增湖泊删除，因为 feature、pack cells、湖岸线和水文派生约束仍需单独梳理。

2. 编辑器基础设施和统计面板清单重新入队。
   - 来源：旧计划审视中的第 17 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/editor-and-stat-panel-inventory.md`。
   - 要做什么：把正式版编辑器的基础设施重新作为高优方向，包括统一 edit command / undo command、selection store、highlight / locate API、对象表格组件、派生重建调度、全局撤销入口，以及各领域面板职责边界。
   - 为什么做：后续编辑能力会越来越多，如果没有统一命令、选择、定位、撤销和派生刷新规则，面板会各自为政，容易出现数据残留、无法撤销、选择状态错乱和局部刷新失败。
   - 执行方式：先整理当前代码里已经存在的基础设施，形成可施工的小清单；不要一次性重写所有面板，优先服务“新增 / 删除统一化”和下游导出 / 高亮需求。
   - 进展记录：已在 `docs/task-notes/editor-and-stat-panel-inventory.md` 新增 2026-07-08 基础设施现状盘点，梳理 `EditHistory`、`edit-refresh-scheduler`、`SelectionStore`、`SELECTION_PANEL_HANDLERS`、`updateAllObjectPanels()` 和公共面板组件的现状，并列出 `executeEditCommand()`、命令字段规范、`refreshPanelsForEdit()`、`locateAndSelectObject()`、`UiObjectTable` 扩展和面板状态持久化六个下一批施工小步。

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
   - 进展记录：已新增 `docs/task-notes/console-extension-api-system-plan.md`，完成详细方案第一版，明确 `api.info / generate / climate / units / layers / selection / edit / history / data / namebases / debug` 命名空间、统一 `ApiResult`、能力元数据、副作用边界、UI 关系和 0-5 阶段实施路径。API 运行时代码尚未开始；在前置高优任务继续推进前，不应直接进入 API 实现。

### 验证要求

- 每项实现至少运行相关文件的 `node --check` 或项目现有静态检查。
- 涉及 UI 的项目应做浏览器烟测或纳入既有面板审计脚本。
- 涉及导出、GeoJSON、完整地图 JSON 或 API 的项目应补可复现脚本或自动化断言，覆盖文件结构、错误路径和导入 / 外部读取可用性。
- 涉及编辑命令的项目必须覆盖撤销 / 重做、选择刷新、派生重建和保存 / 导出后的数据一致性。
- 每一项完成后单独记录到 `docs/development-log.md`；是否单独提交按用户后续指令执行。

### 当前备选计划

- overlay 与动态线层性能专项。
- source/candidate parity 剩余 warn 只读跟踪。
- 贸易查看增强、Element Plus 完整 source theme、单位系统增强、气候系统深化、文化 / 宗教继承深化、政体系统增强、名称库更多入口与原版多词率 `m`、测量曲线尺细化、高度图导入增强、对象注记增强、经济 / 军事 / 纹章等其它未被重新点名的旧专题。
- 任何未被用户重新点名的历史专题计划。
