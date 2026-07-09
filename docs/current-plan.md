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
   - 进展记录：已在 `docs/task-notes/editor-and-stat-panel-inventory.md` 新增 2026-07-08 基础设施现状盘点，梳理 `EditHistory`、`edit-refresh-scheduler`、`SelectionStore`、`SELECTION_PANEL_HANDLERS`、`updateAllObjectPanels()` 和公共面板组件的现状，并列出 `executeEditCommand()`、命令字段规范、`refreshPanelsForEdit()`、`locateAndSelectObject()`、`UiObjectTable` 扩展和面板状态持久化六个下一批施工小步。`executeEditCommand()` 已在运行时落地第一刀，并先迁移测量对象重命名 / 删除调用点；测量动作条回调同步修正为 `props.callbacks`，确保删除、定位、编辑和导出按钮能触发真实面板回调。

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
- 编辑器基础设施旧队列，除非用户重新要求按项目计划继续执行。
- 贸易查看增强、Element Plus 完整 source theme、单位系统增强、气候系统深化、文化 / 宗教继承深化、政体系统增强、名称库更多入口与原版多词率 `m`、测量曲线尺细化、高度图导入增强、对象注记增强、经济 / 军事 / 纹章等其它未被重新点名的旧专题。
- 任何未被用户重新点名的历史专题计划。

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
