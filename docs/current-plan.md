# 当前开发计划

本文档只记录当前阶段的执行队列。旧计划和专题路线已经在重置前备份，后续接手时不应再从旧计划自动推导待办。

## 2026-07-08 当前执行计划

本轮计划按用户最新指令重置。当前优先级只包含下面三项，执行时应先复现和定位，再做小步修正，并在完成后同步更新本文档和 `docs/development-log.md`。

### 计划备份

重置前的计划类文档已备份到：

- `docs/plan-backups/2026-07-08-reset-current-plan/`

备份范围包括：

- `docs/current-plan.md`
- `graphics-reimplementation-plan.md`
- `docs/plans/`
- `docs/task-notes/`

### 当前执行队列

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

### 验证要求

- 每项修正至少运行相关文件的 `node --check` 或项目现有静态检查。
- 涉及 UI 的两项应做浏览器烟测或纳入既有面板审计脚本。
- 涉及 GEO 导入的第一项应补一个可复现的导入后重置 / 派生验证路径，至少覆盖军事、资源点和 marker / zone 是否来自新底图而非旧地图残留；若现有脚本不足，应记录手动烟测步骤和观察结果。
- 每一项完成后单独记录到 `docs/development-log.md`；是否单独提交按用户后续指令执行。

### 当前不再自动推进

- overlay 与动态线层性能专项。
- source/candidate parity 剩余 warn 只读跟踪。
- 编辑器基础设施旧队列，除非用户重新要求按项目计划继续执行。
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
