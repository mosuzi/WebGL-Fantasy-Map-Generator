# 当前开发计划

本文档只记录当前阶段的执行队列。旧计划和专题路线已经在重置前备份，后续接手时不应再从旧计划自动推导待办。

## 2026-07-15 下一波执行计划

上一波权威任务第 10～27 项已经达到各自封闭范围内的最小验收，视觉主题第一阶段也已有完整代码与浏览器证据。上述任务全部移出活动清单，只在历史执行记录、专题文档和 `docs/development-log.md` 中保留证据。

控制台 / 扩展 API 系统的权威任务第 28～34 项已经全部完成，覆盖能力盘点、既有编辑命令、UI / API 公共 action、异步事务、旧数据完整往返、稳定版本契约和一键聚合门禁。当前进入依赖稳定 API 的第 35 项快捷键机制，再按第 36～44 项执行由 `FOLLOWUPS.md` 提升的编辑器、创作、导入诊断和导出增强。

下一波继续采用快速迭代：日常实现以代码检查和专项回归为主，只有各任务验收明确要求时才集中执行浏览器验证。每项达到最小验收后立即进入下一项，不影响当前验收的新发现只记录到 `FOLLOWUPS.md`。

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

### 权威任务清单（下一波）

本节是当前唯一的活动任务清单。上一波已经明确验收通过的编辑器、导出、政治面、视觉主题第一阶段、军事重生成、交战区一致性和列表滚动居中任务均已移出；它们的实现证据继续保留在下方执行记录、专题文档和 `docs/development-log.md`，不得重新计为待办。

下一波先执行依赖稳定 API 的快捷键机制，随后推进从 FOLLOWUPS 提升的九项任务。当前 API 基线是：`window.webglGeneratorApi` 已覆盖 11 个命名空间、162 个公开方法和 72 个编辑方法；权威任务第 28～34 项已经完成能力盘点、既有编辑命令覆盖、公共 action、统一 operation、数据兼容往返、`1.0.0` 稳定契约和 12 项聚合门禁。第 35 项的 API 前置条件已经满足；第 36～44 项已从 FOLLOWUPS 正式移入本清单，不再作为阶段外备忘。

权威任务第 28～34 项已达到最小验收并移出活动清单；完成证据见 `docs/task-notes/console-api-capability-inventory.md`、`docs/task-notes/api-data-compatibility-matrix.md`、`docs/task-notes/console-api-stability-contract.md`、`regress:api-inventory`、`regress:api-edit-coverage`、`regress:api-action-convergence`、`regress:api-operation`、`regress:api-data-compatibility`、`regress:api-stability`、`regress:api-suite-contract`、`regress:api-suite`、`docs/generated/reports/api-regression-suite-results.md` 与 `docs/development-log.md`。

1. 常用操作键盘快捷键与悬停提示。`权威任务第 35 项，当前执行项；API 前置条件已满足`
   - 前置条件：只有第 34 项确认 API 全面实现和综合验收通过后，本项才允许开始。若执行队列到达本项时 API 仍未完成，则把本项标记为“依赖未满足，已跳过”，不得为了快捷键临时直连 UI callback、DOM 点击或内部可变数据。
   - 第一阶段——快捷键清单：执行时基于已稳定的 API capabilities 和真实菜单动作，整理常用快捷键清单，至少按文件 / 生成、撤销重做、选择定位、视图图层、面板开关和常用编辑分组；记录操作名、组合键、API action、作用域、禁用条件、菜单入口和冲突说明。避开浏览器 / 系统保留组合，处理 Windows/Linux `Ctrl` 与 macOS `Meta` 显示差异；未进入清单的低频操作不强行绑定。
   - 第二阶段——统一机制：建立单一快捷键 registry 和键盘路由，菜单显示、悬停提示与实际执行都读取同一条定义，快捷键动作只调用稳定 API / 公共 action。输入框、文本域、下拉框、`contenteditable`、输入法组合、需要独占键盘的模态框和已禁用动作不得误触；重复按键、作用域优先级和冲突必须有确定规则。
   - 第三阶段——悬停提示：菜单或面板内已登记快捷键的操作项悬停超过统一延时后，在页面下方水平居中位置显示“操作名 + 快捷键”提示；默认延时集中为一个可测试常量，离开、点击、面板关闭、操作禁用或显示超时后立即清理。视觉位置和动效可复用现有 `#map-toast` 的底部居中反馈模式，但使用普通白色或灰色半透明背景，不使用下载成功的绿色背景；成功、错误和快捷键提示并发时必须有明确优先级，不能互相留下错误文案或颜色。
   - 第四阶段——按清单逐项补齐：先完成全局高频项和撤销 / 重做，再按快捷键清单逐组接入文件 / 生成、选择定位、视图图层、面板与常用编辑；每完成一组就更新清单状态和专项回归，直至清单内所有项目均已实现或以明确产品理由移出清单。
   - 验收：纯代码回归覆盖组合键规范化、冲突检测、作用域、输入控件 / IME 防误触、禁用条件、API 调用和提示定时器；DOM / 组件检查证明菜单提示与键盘执行共用 registry。最终浏览器验收抽查各分组至少一项，确认键盘操作与菜单点击结果一致、撤销语义一致，悬停未到阈值不显示、到阈值后在页面下方居中显示中性半透明提示、离开后清理，且 `glError = 0`、无新增 console / page error。

2. 统一画布工具模式管理器。`权威任务第 36 项，来自 FOLLOWUPS`
   - 当前进度：测量与资源标记模式已经双向互斥；高度、国家、省份、城市、文化和宗教等画布工具仍各自维护进入、进行中和退出状态，尚未统一审计回调递归、笔刷中间态和退出提示。
   - 剩余实现：建立通用 mode manager，统一模式注册、单一活动模式、进入 / 取消 / 完成、面板关闭、地图替换和异常清理；现有领域工具保留各自数据命令，只迁移交互生命周期，不借机重写笔刷算法。
   - 验收：纯代码回归覆盖所有现有画布工具的互斥、重复进入、跨模式切换、中间态取消、面板关闭和地图替换；单次完成只生成一条应有历史命令，无递归回调、残留 preview、交互锁或错误退出提示。

3. Selection handler 自动打开面板策略统一。`权威任务第 37 项，来自 FOLLOWUPS；需要产品决策`
   - 当前进度：不同对象类型仍分别采用自动打开领域面板、只更新已打开面板或对象详情兜底等既有差异，没有统一产品规则。
   - 剩余实现：先输出对象类型 × 当前行为矩阵和“始终打开领域面板 / 只更新已打开面板 / 对象详情统一兜底”三类方案；若用户尚未明确选择，执行到本项时必须暂停并请求产品决策，再按选定规则统一 selection handler。
   - 验收：决策及例外写入专题文档；地图拾取、列表选择、API select / locate 和编辑后选择对同一对象类型遵循同一规则，不重复打开面板、不抢占用户已聚焦的二级编辑，也不破坏 sourcePanelId 与选择刷新语义。

4. 选区地形模板完整体系。`权威任务第 38 项，来自 FOLLOWUPS`
   - 当前进度：已有四种预设、锁定选区预览、一次历史化应用和撤销 / 重做；尚无多步骤编排、用户模板持久化与交换，也未覆盖 source 全图高度模板的兼容边界。
   - 剩余实现：增加多步骤模板编排、用户模板保存 / 导入 / 导出和版本化校验；梳理 source 高度模板中可复用的纯数据步骤，明确完整兼容、转换兼容和不支持项。模板执行继续基于锁定选区和统一高度命令。
   - 验收：固定模板多步骤执行可复现，预览与实际影响 cells 一致，一次应用形成一条可撤销历史；用户模板往返后结果一致，坏版本 / 坏步骤不改变地图，至少一个 source 模板完成转换样本验证。

5. 破坏性操作确认、依赖预览与批量删除。`权威任务第 39 项，来自 FOLLOWUPS`
   - 当前进度：河流等安全删除已完成数据一致性和撤销语义，但没有统一二次确认、删除前依赖数量预览和批量删除；不同对象删除的关联影响仍由各自命令维护。
   - 剩余实现：为已有安全删除命令建立统一删除预检结果，展示将删除对象、级联对象和关键关联数量；高影响操作二次确认，批量删除按对象领域复用现有安全命令或新增事务命令，不用循环 DOM 点击拼接语义。
   - 验收：取消确认时 checksum 与历史不变；确认后数据、备注、选择、高亮、索引、导出和 stale 状态一致，批量操作以一个事务撤销 / 重做；河流样本明确显示支流数量，混合无效 id 返回结构化跳过 / 失败摘要。

6. 路线绘制、河流新增与湖泊开挖。`权威任务第 40 项，来自 FOLLOWUPS`
   - 当前进度：三类对象已有读取、编辑和安全删除能力，但缺少正式创建器；它们分别涉及路线拓扑、河流水文和湖盆 / feature 结构，不能复用一个粗放的通用新增命令。
   - 剩余实现：在第 36 项 mode manager 上分别设计路线绘制、河流新增和湖泊开挖的预检、画布交互、数据命令、派生刷新、撤销 / 重做和 API action；每类先完成数据约束与最小闭环，再进入下一类。
   - 验收：每类对象均能从 UI 与稳定 API / 公共 action 创建并被管理面板、拾取、定位、导出读取；撤销恢复创建前完整状态，重做复现；路线连通、河流上下游 / 汇流和湖泊 feature / 岸线各有专项坏样本拒绝测试。

7. Zone、通用标记与独立备注创建 / 删除闭环。`权威任务第 41 项，来自 FOLLOWUPS`
   - 当前进度：资源 marker、对象备注和已有 Zone 已有部分编辑能力，但通用 marker 创建、独立备注新增、Zone 新增 / 删除仍缺少完整产品与数据约束。
   - 剩余实现：定义三类对象的身份、归属、位置、空值和孤儿规则，补齐 Zone 新增 / 删除、非资源通用 marker 创建和不依附现有对象的独立备注创建；全部进入命令、API、选择、高亮、面板和导入导出体系。
   - 验收：UI 与 API 共路径创建后可选择、定位、编辑、导出并随完整地图保存 / 恢复；删除与撤销 / 重做维护关联引用和 metadata；无归属、坏坐标、重复 id、孤儿备注和非法 Zone cells 均有明确拒绝或迁移策略。

8. GEO、Cells GEO、高度图统一诊断与 schema 演进。`权威任务第 42 项，来自 FOLLOWUPS`
   - 当前进度：完整地图文件 / API 已有结构化导入诊断和 v1→v2 迁移；普通 GEO、原版 Cells GEO 和高度图图片的解析上下文、几何样本、图像元数据及未来 schema 步骤尚未统一进入诊断 / 迁移契约。
   - 剩余实现：建立共享诊断外壳与分类型详情，统一 code、stage、suggestion、来源摘要和隐私边界，同时保留 GEO 几何、Cells 字段和图片元数据的专属信息；把 schema 迁移收束为可注册、逐版本、可测试的链式步骤和未来版本拒绝策略。
   - 验收：三类导入的成功、格式错误、字段错误、几何 / 图像错误和运行时错误均返回可导出的中文诊断且不包含原文件正文；旧 v1、当前 v2、模拟下一版本迁移链和未知未来版本门禁通过，失败不破坏当前地图。

9. 政治面外部 GIS 互操作与 100k 浏览器导出验证。`权威任务第 43 项，来自 FOLLOWUPS`
   - 当前进度：dissolve 已有纯代码结构 / 拓扑兼容门禁和固定 100k Node 性能门禁；尚缺 QGIS / geojson.io 实际读取、100k 浏览器主线程占用和真实下载事件证据。
   - 剩余实现：用固定 100k 地图在真实浏览器执行普通 / dissolve 政治面导出，记录主线程长任务、导出耗时、文件大小、下载事件与页面恢复；分别在 QGIS 和 geojson.io 打开代表性产物并记录可读性、几何告警和属性保留。
   - 验收：浏览器导出成功且页面恢复交互，下载文件可解析，主线程与 health 数据如实记录；QGIS / geojson.io 均能读取国家、省份和地区层，dissolved、bbox、参与国等关键属性保留。若外部工具报告问题，必须形成可复现样本并修复或明确兼容边界。

10. PNG 任意裁剪与细粒度 overlay 选择。`权威任务第 44 项，来自 FOLLOWUPS`
   - 当前进度：PNG 已支持 1x～4x、整体地图标注开关和图外透明背景，尚不能选择任意裁剪范围，也不能独立控制标签、图例、比例尺、军事图标、测量等 overlay 类别。
   - 剩余实现：定义当前视口、地图全幅、矩形选择和显式像素 / 世界坐标裁剪契约；把 overlay 合成拆为稳定白名单选项，UI 与 API 使用同一规范化参数和导出流水线，默认行为保持兼容。
   - 验收：裁剪尺寸、世界边界与像素结果精确匹配，越界 / 空范围明确拒绝；各 overlay 可独立开关且组合结果可预测，默认参数输出保持现状。专项图片断言、API 回归、生产构建和真实浏览器文件级抽查通过。

执行顺序固定为 `35 -> 36 -> 37 -> 38 -> 39 -> 40 -> 41 -> 42 -> 43 -> 44`。第 35 项的 API 前置条件已经满足；第 36 项应先于新增画布创建器，第 37 项若缺产品决策必须暂停询问。每项达到本节最小验收后立即进入下一项；新发现但不影响本项验收的增强只记入 `FOLLOWUPS.md`，不扩展完成标准。

### 上一波执行记录（非活动任务清单）

1. 编辑面板新增 / 删除统一化。
   - 阶段状态：本轮权威任务第 10～13 项已完成；新的创建器、批量删除和额外交互增强不属于本轮完成标准。
   - 来源：旧计划审视中的第 12 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/current-plan.md` 的“编辑面板新增 / 删除统一化”可选增强。
   - 要做什么：按对象类型逐个补齐新增 / 删除命令，并统一放到列表下方小图标动作条中；国家、省份和城市已完成第一刀，后续应按文化、宗教、路线、河流、湖泊、备注、名称库、测量对象、资源标记等对象的数据约束分批处理。
   - 为什么做：这是正式编辑器可用性的基础；新增 / 删除必须进入 `EditHistory`，并通过对象自身规则维护关联字段，不能用一套粗暴删除逻辑横扫所有面板。
   - 执行方式：每次只选一个领域面板，先梳理数据约束、撤销 / 重做、派生刷新和导出影响，再实现小步；涉及 UI 的小图标入口要与现有 `UiPanelIoActions` 视觉保持一致。
   - 进展记录：路线管理已完成“删除选中路线”小图标第一刀；命令会从 `settlements.routes` 中移除目标路线、清理对应路线备注，并支持撤销恢复路线与备注。本刀不新增路线绘制入口，也不重算经济 / 贸易派生。资源标记面板已把“移动 / 删除选中资源标记”收束到列表下方小图标动作条，删除继续复用既有 `createDeleteMarkerCommand()` 和 `EditHistory`，不新增资源重生成语义。备注总览已把“定位备注对象 / 删除选中备注”并入表格下方 `UiPanelIoActions`，删除继续复用 `createDeleteNoteCommand()`。名称库总览已把“新建用户库 / 复制内置 / 删除选中用户库 / 清空用户库”收束到同一列表动作条，继续复用名称库 edit command 快照撤销逻辑。河流管理已把“按名称库重命名筛选河流 / 定位选中河流 / 进入河流编辑”收束到列表动作条。河流安全删除已完成：目标河流及其递归支流 / 流域归属河流会作为一个 `EditHistory` 命令删除，命令同步维护 `map.rivers.rivers`、`pack.rivers`、`pack.cells.r/fl/conf`、湖泊进出口引用、河流备注、metadata、选择 / 编辑 / 高亮 / picking / 导出，并支持完整撤销 / 重做；精确水文与下游系统标记为待派生，不在删除命令内自动重生成。湖泊安全删除也已完成：删除语义为填平湖盆并合并相邻陆地 feature，同时同步 pack / grid 高度、feature 归属、岸线、haven / harbor、湖泊备注、对象引用、选择 / 高亮 / picking / 导出与派生标脏；完整快照支持撤销 / 重做，湖泊面板和 `api.edit.lakes.delete(id)` 共用同一命令。文化管理已把“新增空文化 / 定位文化 / 删除空文化”接入列表动作条；新增和删除均进入 `EditHistory`，删除只允许无 cells、无城市 / 城镇 / 国家关联、无子级的空文化，本刀不做文化 cell 归属刷或覆盖重分配。宗教管理已把“新增空宗教 / 定位宗教 / 删除空宗教”接入列表动作条；新增和删除均进入 `EditHistory`，删除只允许无 cells、无城市 / 城镇 / 国家关联、无子级的空宗教，本刀不做宗教 cell 归属刷或文化联动重算。

   - 第 12 项补充：文化与宗教完整删除及归属编辑已完成。删除非空对象会把 grid / pack cells、城市 / burg、已有政治对象字段和文化扩展引用归零到中立对象，清理继承引用、备注与文化名称库绑定，并完整支持撤销 / 重做；两个面板新增归属目标与半径笔刷，单次拖动只写入一条历史命令，`api.edit.cultures.assignCells()` / `api.edit.religions.assignCells()` 与面板共用同一命令路径。
   - 第 13 项补充：剩余安全新增 / 删除入口已收口。资源标记“放置”移入列表动作条并保留资源类型选择；测量对象在非空列表下也能“开始测量”；路线面板删除重复的第二套删除区，只保留列表动作条入口。现有命令与回调语义不变，路线 / 河流 / 湖泊 / Zone 创建器等新产品能力不在本项扩展。

2. 编辑器基础设施和统计面板清单重新入队。
   - 阶段状态：本轮权威任务第 14～16、23 项已完成；后续维护统一契约不再作为本轮开放任务。
   - 来源：旧计划审视中的第 17 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/editor-and-stat-panel-inventory.md`。
   - 要做什么：把正式版编辑器的基础设施重新作为高优方向，包括统一 edit command / undo command、selection store、highlight / locate API、对象表格组件、派生重建调度、全局撤销入口，以及各领域面板职责边界。
   - 为什么做：后续编辑能力会越来越多，如果没有统一命令、选择、定位、撤销和派生刷新规则，面板会各自为政，容易出现数据残留、无法撤销、选择状态错乱和局部刷新失败。
   - 执行方式：先整理当前代码里已经存在的基础设施，形成可施工的小清单；不要一次性重写所有面板，优先服务“新增 / 删除统一化”和下游导出 / 高亮需求。
   - 进展记录：已在 `docs/task-notes/editor-and-stat-panel-inventory.md` 新增 2026-07-08 基础设施现状盘点，梳理 `EditHistory`、`edit-refresh-scheduler`、`SelectionStore`、`SELECTION_PANEL_HANDLERS`、`updateAllObjectPanels()` 和公共面板组件的现状，并列出 `executeEditCommand()`、命令字段规范、`refreshPanelsForEdit()`、`locateAndSelectObject()`、`UiObjectTable` 扩展和面板状态持久化六个下一批施工小步。`executeEditCommand()` 已在运行时落地第一刀，并先迁移测量对象重命名 / 删除调用点；测量动作条回调同步修正为 `props.callbacks`，确保删除、定位、编辑和导出按钮能触发真实面板回调。2026-07-10 继续迁移地区样式回调、对象详情名称入口、外交字段和军事字段；地区纹理 / 颜色调整、对象详情重命名、选中对象名称库改名、单个外交关系调整、外交重生成、军团重命名、单个军团态势调整、国家级兵种比例调整、批量军团态势调整、单个军团驻地移动、单个军团基地设置、单个军团战报记录、单个军团战报清空、战报档案导入、城市画布新增 / 删除、国家 / 省份画布新增 / 删除、GEO 地形导入、高度 / 国家 / 省份刷子落笔、自定义标签拖拽、控制面板外交重生成、marker 编辑 API 和 marker 面板 / 画布集合命令现在通过统一执行器进入撤销栈；军事、路线、marker、标签、备注、河流、湖泊、地区、国家、政府、省份、城市、文化、宗教、外交、高度、测量和名称库面板内历史按钮已接入统一历史执行器。上述入口均依赖命令 effects 或统一面板刷新 helper 刷新对应对象面板。`EditHistory.getStats()` 已进一步暴露 `lastAffected` 快照，控制台历史 API 和面板历史摘要现在能以短格式显示最近命令影响对象，为后续收窄 `effects.affected` 做可观察基础；国家、省份、道路、河流、城市重生成入口、资源点重生成命令、军事批量 / 事件命令、按名称库批量重命名命令、高度 / 国家 / 省份刷子、FMG Cells GEO 导入、外交重生成、批量政体调整和测量对象导入已开始用 `derived-system#xxx` 解释对象级 `all`、集合别名、同类对象列表或 `grid-cells#数量` 影响；新增空文化、空宗教、手工标签、marker 和保存测量对象命令的初始 affected 已补为 `kind#new`，执行成功后仍回写真实对象 id。2026-07-11 面板状态持久化继续收尾：政体家族筛选、军事国家筛选和军事态势筛选已接入 `panel-list-preferences.js`，刷新后可恢复，且军事面板会在当前地图缺少已保存筛选对象时回退到“全部”。公共表格批量选择也已完成第一刀，默认关闭；备注总览、测量对象面板、外交关系列表、政体面板国家列表和经济面板当前 tab 列表先启用并支持只导出选中记录，不新增批量删除语义。

   - 第 14 项补充：编辑命令执行路径已收口。正式应用源码中的 `EditHistory.execute / undo / redo` 各只保留在 `executeEditCommand()` / `executeHistoryCommand()` 内部，领域 wrapper 均委托统一执行器，业务代码不存在直接 `command.apply / revert`。新增 `regress:edit-execution-path` 扫描整个 `app/webgl-generator/src`，把直接属性访问、可选链、方括号访问、直接变量别名、唯一调用点、统一后处理顺序和 wrapper 委托关系固化为回归门禁；本项不提前处理第 15 项的对象面板刷新收口。
   - 第 15 项补充：对象面板显式刷新路径已收口。编辑按 `effects` 通过 `refreshPanelsForEdit()` 定向或全量刷新；撤销 / 重做也复用同一入口，但为同步所有已打开面板的全局历史摘要保持全量刷新。国家、省份和城市的关联面板映射补齐，名称库、外交重生成、GEO 导入、文化 / 宗教、标签、marker、测量对象及画布新增 / 删除不再在统一刷新后手写第二次对象面板刷新。需要先更新 selection、selectedId、编辑模式或 `lastAffected` 的路径统一使用 `preparePanelRefresh`，在 effects 面板刷新前完成运行时状态准备。新增 `regress:panel-refresh-path` 固化执行顺序、唯一显式全量入口和代表性无重复路径。
   - 第 16 项补充：选择、定位和编辑动作语义已收口。`SelectionStore.batch()` 把编辑前 selection 准备与 scheduler refresh 合并为一次通知，并保留 `sourcePanelId` 来源元数据；进入编辑时选择对象和 `editingObject` 也原子提交，单次 `setSelection / clear / refresh` 的同步通知语义保持不变。编辑、撤销、重做和通用重生成会在对象面板刷新前校正持久高亮；成员未变时保持 effects 定向刷新，成员被删除时改为一次全量面板刷新以同步全局高亮计数，不再在刷新完成后追加第二轮高亮 UI 刷新。测量模式与资源标记放置 / 移动模式已双向互斥，编辑已有测量对象也复用统一测量入口。新增 `regress:selection-actions` 固化通知次数、来源面板、删除对象清理和模式互斥；定位继续统一复用既有 `locateAndSelectObject()`，不改变各对象面板的自动打开策略。
   - 第 23 项补充：编辑器基础设施综合浏览器验收已完成。国家面板完成“选择安溪王国 → 定位 → 进入编辑 → 重命名 → 撤销 / 重做 → 再撤销恢复原名 → 退出编辑”闭环，selection、高亮、历史摘要和详情名称同步；资源标记放置会禁用测量入口，从测量状态启动资源标记放置会先退出测量，取消后两种画布模式均回到空闲。导出浮层确认 PNG `1x～4x`、默认包含地图标注、默认不启用图外透明背景，以及国家 / 省份面和“合并政治面边界”选项；勾选国家面与合并边界后实际触发要素 GeoJSON 导出，浮层正常关闭且页面没有导出失败提示。最终开发面板 `WebGL error = 0`，当前 health 没有 ERROR；自动化点击期间记录了既有 `input-handler-stall` WARN，因此不把本次结果扩大为“健康记录全空”。

   - 补充记录：名称库列表也已接入公共表格批量选择，并支持只导出选中名称库 JSON 或选中原版文本；本步不新增批量删除、批量绑定或批量编辑语义。
   - 补充记录：军事面板主军团列表已接入公共表格批量选择，并支持只导出选中军团 CSV / JSON；独立战报档案导入导出、军团编辑和批量态势语义保持不变。
   - 补充记录：对象列表下方的大号撤销 / 重做按钮已清理，覆盖城市、国家、省份、文化、宗教、路线、河流、湖泊、地区、标签、资源标记、测量、名称库、备注、外交和军事等 Vue 面板的内容区 `UiHistoryActions`；面板框架标题栏的历史入口继续保留，高度编辑器的笔刷撤销 / 重做不属于“列表下方按钮”范围。

3. 导出能力矩阵收尾。
   - 阶段状态：本轮权威任务第 17～19、22～23 项已完成；任意裁剪、更多 overlay 细分和未来 schema 迁移属于后续增强。
   - 来源：旧计划审视中的第 18 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/export-capability-matrix.md`。
   - 要做什么：继续收口 PNG、完整地图 JSON、pack cell GeoJSON、要素 GeoJSON、备注摘要和测量结果等导出能力；优先补完整 JSON 压缩、跨版本迁移器、导入错误详情面板、PNG 导出倍率 / overlay 选项，以及与政治面 dissolve 的衔接。
   - 为什么做：导出是用户长期保存、迁移、外部分析和二次加工地图的关键链路；当前导出种类多，但仍缺压缩、版本迁移、错误诊断和部分 GIS 质量收尾。
   - 执行方式：每个导出能力都要明确“是否可重新导入复原地图”；完整地图 JSON 的兼容性优先级高于只读摘要导出，GIS 输出则与下一项 dissolve 专项协同推进。
   - 第 17 项补充：完整地图跨版本迁移器已落地。当前导出格式升级为 `webgl-generator-map v2` / `map schema v2`，明确要求 notes、measurements、labels 和 visualTheme 四类持久化存储；`migrateMapDocument()` 注册真实 v1→v2 步骤，旧文档会在不原地修改输入 map 的前提下补齐存储与 metadata，并保留旧备注、隐藏标签、主题和 typed arrays。新增固定 v1 样本与 `regress:map-migration`，覆盖迁移、当前版本幂等、未来版本、缺失 map 和损坏 v2 拒绝。本项不提前扩展第 18 项导入错误详情 UI。
   - 第 18 项补充：完整地图导入错误诊断已结构化。文件入口和 API 入口共用 `webgl-generator-map-import-diagnostic v1`，记录当前期望文档类型 / 版本 / schema、文件名 / 大小 / MIME / 推断格式，以及错误 code、失败阶段、原始信息和中文建议，不收集原文件正文。控制面板错误详情新增诊断代码与阶段，并只在存在最近一次错误时显示“导出诊断”；下一次导入开始即清空旧诊断。九类错误覆盖 JSON、文档类型、版本、map 缺失、schema、typed array、浏览器缺压缩能力、gzip 损坏和未知运行时错误。新增 `regress:map-import-diagnostics`，本项不扩展 GEO / 高度图导入诊断。
   - 第 19 项补充：PNG 显式选项已收口。导出浮层在既有 `1x～4x` 倍率之外新增“包含地图标注”和“图外透明背景”；标注关闭时跳过 DOM 地图 overlay 与固定比例尺 / 摘要合成，透明背景只清除当前相机下地图有效矩形之外的像素，不误删地图内海洋。`api.data.exportPNG()` 支持同名 `includeMapOverlays / transparentBackground` 参数并返回规范化后的实际值。新增 `regress:png-options`，覆盖默认值、倍率夹取、图外四边清除和 UI / API 接线；裁剪范围不在本项扩展。
   - 第 22 项补充：导出回归聚合门禁已完成。新增 `regress:exports`，按“地图迁移 → 导入诊断 → PNG 选项 → dissolve 兼容性 → dissolve 100k 性能”顺序在五个独立 Node 子进程中执行，前置失败会原样传播非零退出码并把后续步骤标记为 `skipped`；成功报告统一输出每步状态、耗时和退出码。首轮与独立审查复跑均为 5/5 通过，总耗时约 `7.8s`。本项明确不启动服务器、Playwright 或 Chrome；API capabilities / roundtrip / GEO / 下载记录等浏览器脚本统一留给第 23 项。

4. 政治面 GeoJSON dissolve。
   - 阶段状态：本轮权威任务第 20～23 项已完成；外部 GIS 手工验证和 100k 浏览器主线程测量不阻塞本轮收口。
   - 来源：旧计划审视中的第 19 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/political-geojson-dissolve-plan.md`。
   - 要做什么：把当前 state / province / zone 的 cell polygon 集合型 `MultiPolygon` 升级为可选的真正 dissolve 外轮廓：消除同一对象相邻 cell 的共享边，输出闭合 outer rings 和 holes，并在 properties 中标注 `dissolved: true`。
   - 为什么做：非 dissolve 的政治面文件大、碎片多，也不适合 QGIS / geojson.io 等外部 GIS 工具继续分析；真正外轮廓能显著提升地理数据导出质量。
   - 执行方式：先做工具脚本或纯函数原型，用固定 seed 验证 ring 拼接、hole 归属、坐标方向和文件体积，再接入导出 UI；若 100k cells 导出耗时过高，再评估 Worker 或懒加载几何库。
   - 第 20 项补充：外部兼容性代码门禁已完成。要素 GeoJSON 现在显式声明 `coordinateReference = approximate-equirectangular`；新增 `regress:dissolve-compatibility`，独立验证 FeatureCollection / Feature / MultiPolygon 嵌套、有限坐标、最小 ring、闭环、outer 逆时针、hole 顺时针、hole 归属、自交、同一 MultiPolygon 内 polygon 的交叉 / 包含 / 共线面积重叠，以及 feature / collection bbox 精确包含。固定样本覆盖相邻共享边、带 hole、合法多岛，并确认 7 类坏输出会被拒绝。本项按快速迭代约定只跑语法、专项回归、生产构建和差异检查，不执行浏览器或外部 GIS 手工测试；100k 性能留给第 21 项。
   - 第 21 项补充：100k 性能门禁已完成。新增 `regress:dissolve-performance`，固定 `dissolve-perf-100k / continents / 100000 / 1440×960`，预热后分别对普通政治面和 dissolve 政治面执行 3 次“构建 + JSON.stringify”并取中位数。门禁要求实际 grid 不低于 99000、三类 feature 集合一致且非空、轻量结构有效、dissolve 点数不超过普通版 35%、JSON 字节不超过 40%、总中位耗时不超过 1500ms 且不超过普通版 3 倍。当前三轮执行均为 `99846 grid / 56944 pack / 638 features`，dissolve 中位数约 `256～276ms`，点数比 `0.103`、字节比 `0.122`；100k 生成耗时只记录，不进入 dissolve 阈值。本项不引入 Worker 或算法优化，也不运行浏览器。

5. 视觉主题与样式预设第一阶段。
   - 来源：旧计划审视中的第 34 项；对应备份文档为 `docs/plan-backups/2026-07-08-reset-current-plan/docs/task-notes/visual-theme-preset-plan.md`。
   - 要做什么：建立 WebGL 版自己的轻量主题 token，先提供默认、古地图、浅色图册、暗海、单色、夜间等只读主题预设；主题影响 canvas 背景、地形色、水色、边界、道路、标签、比例尺和图例等跨层配色。
   - 为什么做：主题系统能提升地图成品感和导出视觉质量，同时避免把原版 SVG selector 样式系统强行搬进 WebGL 架构。
   - 执行方式：第一阶段只做内置只读预设；原计划暂缓纹理、高级滤镜、字体系统或完整原版 `public/styles/*.json` 兼容，但本轮按用户反馈补入轻量画布滤镜；切换主题不得改变地图生成数据和 checksum。
   - 补充记录：用户反馈主题切换只改海洋和边缘渐变时，国家色块观感不变，等同主题无效。本轮补入主题级画布滤镜 token，让切换主题时整张 WebGL 地图 canvas 都进入对应色调；PNG 导出合成也会先应用同一滤镜，再绘制标签、比例尺和图例 overlay。

6. 控制台 / 扩展 API 系统规划。
   - 来源：用户新增要求。
   - 要做什么：考虑把所有不依赖 UI 的操作收束为统一 API 系统，挂到可在控制台调用的入口上，例如 `api.climate.setLatitude(...)`、`api.data.exportAll()`、`api.data.exportGEO()` 等；后续还应覆盖生成、导入导出、气候、单位、图层、对象选择 / 定位、编辑命令、名称库、测量、备注和派生重建等非 UI 能力。
   - 为什么做：API 化能方便后续接入 AI、脚本化操作、开发扩展、自动化测试和批量处理；同时把功能收束成 API 也是对现有 runtime 能力、数据边界、命令副作用和权限语义的间接梳理。
   - 执行方式：本轮只写入计划，不立即实现；真正开始时必须先出详细方案，明确 API 命名空间、同步 / 异步返回、错误格式、撤销语义、权限边界、与 UI store 的关系、浏览器控制台暴露方式、测试策略和稳定性承诺。
   - 进展记录：已新增 `docs/task-notes/console-extension-api-system-plan.md`，完成详细方案第一版，明确 `api.info / generate / climate / units / layers / selection / edit / history / data / namebases / debug` 命名空间、统一 `ApiResult`、能力元数据、副作用边界、UI 关系和 0-5 阶段实施路径。阶段 1 已完成第一刀：新增 `window.webglGeneratorApi` 和开发别名 `window.api`，接入 `info.capabilities()`、`info.mapSummary()`、`info.runtimeStats()`、`selection.get()` 和 `layers.get()` 只读快照。阶段 2 已完成导出 API 第一批：`data.exportAll()`、`data.exportCompressedAll()`、`data.exportGEO()`、`data.exportFeatureGEO()` 和 `data.exportPNG()` 支持脚本调用，其中 PNG / 压缩 JSON API 返回 Promise，可返回 data URL / gzip base64 或触发浏览器下载。阶段 3 已完成图层控制、单位偏好和气候 API：`layers.setViewMode()`、`layers.setVisible()`、`units.get()`、`units.apply()`、`climate.get()`、`climate.getTemperature()`、`climate.getPrecipitation()`、`climate.getLatitude()`、`climate.getAtmosphere()`、`climate.getBiomes()`、`climate.apply()`、`climate.setLatitude()`、`climate.setLatitudeRange()`、`climate.setLongitudeRange()`、`climate.setTemperature()`、`climate.setPrecipitation()` 和 `climate.setWind()` 均已接入；图层 / 单位写偏好不改变地图 checksum，气候写入会重算当前地图气候并标记下游派生 stale。阶段 4 已完成编辑 API 第一批：`history.get()` / `undo()` / `redo()`、`edit.notes.set/delete()`、`edit.measurements.save/rename/updatePoints/delete()`、`edit.cities.add/delete/rename/setPopulation()`、`edit.provinces.add/delete/rename/setColor()`、`edit.states.add/delete/rename/setColor/setGovernment()`、`edit.cultures.add/delete/rename/setColor/setParent()`、`edit.religions.add/delete/rename/setColor/setParent()`、`edit.routes.delete/setNote()`、`edit.rivers.rename/setWidthFactor/setNote()`、`edit.lakes.rename()`、`edit.labels.addCustom/delete/moveCustom/renameCustom/setNote/restore()` 和 `edit.markers.add/delete/move/setNote/setVisual()` 已接统一命令系统；selection API 已接入 `resolve/select/clear/locate/pick`。
   - 补充记录：政治与城市字段编辑 API 批次已统一验证，城市重命名 / 人口、国家重命名 / 颜色 / 政体、省份重命名 / 颜色均可通过控制台 API 进入 `EditHistory` 并撤销恢复；构建、字段 API 浏览器验证和稳定态烟测通过，验证子智能体超时后已中断释放。
   - 补充记录：备注与水文对象编辑 API 批次已统一验证，通用对象备注、路线备注、河流重命名 / 宽度 / 备注和湖泊重命名均可通过控制台 API 进入 `EditHistory` 并撤销恢复；构建、浏览器验证和稳定态烟测通过，验证子智能体超时后已中断释放。
   - 补充记录：文化与宗教字段编辑 API 批次已统一验证，文化 / 宗教重命名、颜色和继承父级均可通过控制台 API 进入 `EditHistory` 并撤销恢复；构建和主线程浏览器兜底验证通过，验证子智能体超时后已中断释放。
   - 补充记录：标签字段编辑 API 批次已统一验证，手工标签新增、移动、重命名、备注写入、删除和生成标签恢复均可通过控制台 API 进入 `EditHistory` 并撤销恢复；构建和主线程浏览器兜底验证通过，验证子智能体超时后已中断释放。
   - 补充记录：标记字段编辑 API 批次已统一验证，marker 备注和图标视觉补丁均可通过控制台 API 进入 `EditHistory` 并撤销恢复；构建和主线程浏览器兜底验证通过，验证子智能体超时后已中断释放。
   - 补充记录：测量对象点列编辑 API 批次已统一验证，测量对象保存和点列更新均可通过控制台 API 进入 `EditHistory` 并撤销 / 重做恢复；构建、子智能体稳定态烟测和主线程浏览器兜底细测通过，长时间无输出的验证子智能体已中断释放。
   - 补充记录：名称库只读 API 第一刀已接入 `api.namebases.list({includeSource})`，可读取名称库摘要、绑定目标、绑定状态和汇总 metadata；默认不返回完整 source，显式传 `includeSource: true` 时才返回源词条副本。本步只读，不进入 `EditHistory`，不修改地图 checksum；构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放。
   - 补充记录：名称库导出 API 第一刀已接入 `api.namebases.export({format, baseIds, includeUser, download, includeText})`，可导出当前 JSON 名称库文档或原版文本名称库，并支持选中 `baseIds` 和浏览器下载；本步只读，不修改地图 checksum，不新增名称库导入 / 编辑 / 绑定语义；构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放。
   - 补充记录：名称库写入 API 第一刀已接入 `api.namebases.create/copyBuiltin/update/delete/bind`，复用名称库 edit command、`EditHistory`、面板刷新和本地偏好持久化；`create / update` 支持名称、样本和生成参数补丁。本步不接名称库导入、清空用户库或按名称库批量重命名当前地图对象；构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放。
   - 补充记录：名称库导入 API 第一刀已接入 `api.namebases.import(document, {mode, filename})`，支持当前 JSON 名称库文档对象、JSON 字符串和原版文本字符串；默认追加导入，`mode: "replace"` 时替换当前用户库，导入进入 `EditHistory`。本步不接清空用户库或按名称库批量重命名当前地图对象；构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放。
   - 补充记录：名称库清空 API 第一刀已接入 `api.namebases.clear({confirm:true})`，复用名称库 edit command、`EditHistory`、面板刷新和本地偏好持久化；因为这是批量删除用户名称库，API 必须显式传 `confirm:true`。本步不接按名称库批量重命名当前地图对象；构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放。
   - 补充记录：名称库批量重命名对象 API 第一刀已接入 `api.namebases.renameObjects(kind, ids, {confirm:true})`，支持 `state / city / river / lake` 及常见复数别名，复用既有按名称库重命名命令并进入 `EditHistory`；因为这是批量改写当前地图对象名称，API 必须显式传 `confirm:true`，其它对象类型暂返回结构化错误。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认城市 6 个、河流 8 个可真实改名并撤销恢复，WebGL / health / console / page error 均为 `0`。
   - 补充记录：生成 / 受约束重算 API 第一刀已接入 `api.generate.regenerate(kind, {confirm:true})`，支持 `routes / rivers / cities / states / provinces / markers / diplomacy` 及常见别名，复用现有控制面板受约束重算路径并返回 before / after 计数、派生 stale 系统和历史摘要；因为多数重算会直接改写派生数据且并非全部可撤销，API 必须显式传 `confirm:true`。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 `routes` 和 `diplomacy` 重算 API 可用，未确认 / 未知类型会结构化失败，WebGL / health / console / page error 均为 `0`。
   - 补充记录：生成 API 地图生成第一刀已接入 `api.generate.getOptions()`、`setOptions(patch)`、`newMap(options)` 和 `rerollSeed(options)`；`setOptions` 只同步生成配置和主输入，不隐式生成，`newMap / rerollSeed` 复用 worker 生成和 `loadMapIntoRuntime()` 路径并返回地图摘要、timings 和历史摘要。因为生成会替换当前地图并清空编辑历史，`newMap / rerollSeed` 必须显式传 `confirm:true`。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 `setOptions` 不改变当前地图 checksum，`newMap` 和 `rerollSeed` 可生成约 1000 cells 地图并清空历史，WebGL / health / console / page error 均为 `0`。
   - 补充记录：完整地图导入 API 第一刀已接入 `api.data.importMap(document, {confirm:true})`，支持当前 `.webgl-map.json` 文档对象和 JSON 字符串，复用 `parseMapDocument()`、`loadMapIntoRuntime()`、生成输入同步、视觉主题恢复和名称库偏好持久化路径；因为导入会替换当前地图并清空编辑历史，API 必须显式传 `confirm:true`。本步不接 gzip Blob / File 或 GEO 导入；构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认对象 / 字符串导入可恢复 seed `api-import-source` 与 checksum `533cc2f7`，未确认和坏 JSON 会结构化失败，WebGL / health / console / page error 均为 `0`。
   - 补充记录：GEO 导入 API 第一刀已接入 `api.data.importGEO(document, {confirm:true})`，支持 GeoJSON 字符串或对象；FMG Cells GEO 会复用 `createImportFmgCellsHeightCommand()` 导入地形并按既有语义重置非 GEO 派生数据，普通 GeoJSON 会复用测量对象导入命令写入 measurements。因为两类导入都会写当前地图，API 必须显式传 `confirm:true`。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认普通 GeoJSON 对象 / 字符串均可导入为 2 个测量对象并可撤销，未确认和坏 JSON 会结构化失败，WebGL / health / console / page error 均为 `0`。
   - 补充记录：备注与测量导出 API 第一刀已接入 `api.data.exportNotes({ids, noteIds, download, includeText})` 和 `api.data.exportMeasurements({ids, measurementIds, download, includeText})`，复用现有备注摘要与测量对象 JSON 格式，默认返回文本并可触发浏览器下载；本步只读，不修改地图 checksum，也不新增导入或批量删除语义。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认新增备注与测量对象可导出、ID 筛选生效、下载文件名正确、`includeText:false` 不返回文本、导出前后 checksum `dda146ea` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：API 只读补齐批次已接入 `api.info.version()`、`api.info.healthEvents({limit, severity})` 和 `api.data.exportMap()`；`exportMap` 作为完整地图 JSON 的明确别名复用 `exportAll`，`healthEvents` 从运行时 health monitor 返回最近事件、计数和级别筛选。本步只读，不修改地图 checksum。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含新方法，`healthEvents` 的 `info / warning / fatal` 路径分别正常筛选、归一和结构化失败，`exportMap` 与 `exportAll` metadata 一致并可下载，调用前后 checksum `a8062d0f` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：完整地图导入 API 压缩输入补齐批次已接入 `api.data.importMap()` 的 File / Blob、`{encoding:"gzip-base64", data}` 和 `api.data.exportCompressedAll({download:false})` 返回对象支持；导入仍必须显式传 `confirm:true`，并继续复用完整地图导入运行时加载路径。本步不改变 GEO 导入或 UI 文件导入语义。构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认压缩导出对象、显式 gzip-base64 payload 和 gzip File 均可恢复 seed `api-compressed-import-source` / checksum `dc3a14cc`，未确认和坏 gzip 会结构化失败且不改变当前地图，WebGL / health / console / page error 均为 `0`。
   - 补充记录：图层主题与视图适配 API 批次已接入 `api.layers.setTheme(themeId)` 和 `api.layers.fitView()`；主题 API 会校验内置主题、同步控制面板偏好和 renderer，fitView 复用 renderer 适配视图并返回 camera 快照。本步只改变显示偏好和视口，不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含新方法，`setTheme("ancient")` 同步 API 图层快照、`#visual-theme-preset`、`localStorage` 和 renderer visual theme，未知主题返回结构化失败，`fitView()` 将被扰动的 camera 复位为 `scale=1 / offset=0`，调用前后 checksum `9c206efe` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：debug 只读诊断 API 批次已接入 `api.debug.snapshot()`、`api.debug.renderer()` 和 `api.debug.health()`；其中 snapshot 聚合 API 版本、页面状态、地图摘要、图层 / 单位偏好、选择、历史、renderer 摘要和 health 摘要，renderer 返回完整 renderer stats，health 返回事件、阈值、存储 key 和当前 operation。本步只读，不修改地图 checksum，也不清理 health 事件。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `debug` 命名空间、三项方法和 `readonly-diagnostics` 副作用说明，`debug.snapshot / renderer / health` 均返回结构化诊断，调用前后 checksum `2850e0b4` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：单位便捷 setter API 批次已接入 `api.units.setDistanceUnit(unit)`、`setNumberAbbreviation(mode)`、`setMapScale(kmPerCm)`、`setPopulationScale(scale)`、`setMilitaryScale(scale)` 和 `setPrecipitationScale(scale)`；这些方法复用 `units.apply()` 的规范化、控制面板同步、本地偏好写入和 renderer unit preferences 路径。本步只改变显示单位偏好，不修改地图 checksum。静态检查、单位规范化断言、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 6 个便捷 setter，单位偏好同步到 API、DOM、`localStorage` 和 renderer stats，`1.7` 等小数倍率不再出现浮点残影，调用前后 checksum `bd56e742` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：人口倍率刷新 bug 已修复。单位偏好变化时会自动刷新已打开对象面板，同时 `UiObjectTable` 的行级 memo 会把 row 对象纳入依赖，避免国家列表这类表格在同一行 key 下跳过人口格式重绘。本步只修显示层响应，不重算地图人口数据，不新增手动批量更新按钮。构建和主线程浏览器验证通过，验证确认国家面板打开后不点击国家，人口倍率 `1 -> 2` 会让第一行人口从 `115万 人` 自动变为 `230万 人`，checksum `4952a503` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：单位面积 setter API 补齐批次已接入 `api.units.setAreaUnit(unit)`；当前产品语义仍保持“面积单位由距离单位派生”，因此该入口只接受当前距离单位对应的面积单位，用来让脚本显式同步面积单位并获得清晰错误，不引入独立面积单位 UI 或“千米 + m²”这类混合显示。本步只改变显示单位偏好，不修改地图 checksum。静态检查、单位派生断言、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `setAreaUnit`，`setDistanceUnit("m")` 后 `setAreaUnit("m2")` 同步到 API、DOM 和 renderer unit preferences，`setAreaUnit("km2")` 在当前距离单位 `m` 下返回结构化失败并说明应为 `m2`，调用前后 checksum `44ca87f4` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：选择临时高亮 API 第一刀已接入 `api.selection.flash(object)`，并提供 `api.selection.highlight(object)` 同义入口；该入口复用对象解析、selection store 和 renderer `startLocateFlash()`，只做单对象选择闪烁，不做多对象高亮生命周期管理，也不改变地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `flash / highlight`，河流对象调用后 selection 正确且 renderer `selectionHighlightMode` 为 `river red flash`，不存在对象返回结构化失败，调用前后 checksum `63e36bb8` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：选择高亮 API 语义补齐批次已把 `api.selection.highlight(objects, options)` 从单纯别名收束为显式边界：单对象或单元素数组继续复用 `selection.flash` 并返回 `mode: "single-object-flash"`，空数组返回“缺少高亮对象”，多对象数组返回“当前 renderer 尚不支持多对象高亮”的结构化失败。本步不新增多对象高亮生命周期，不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `highlight`，单对象和单元素数组返回 `requested = 1`、`mode = single-object-flash`、`highlightMode = river red flash`，空数组和多对象数组均返回预期结构化失败，调用前后 checksum `023e21ce` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：选择编辑态 API 第一刀已接入 `api.selection.startEditing(object, {select})`、`stopEditing({ifKind})` 和 `toggleEditing(object, {select})`；这些入口复用运行时 `startObjectEditing / stopObjectEditing / toggleObjectEditing` helper，只改变 selection / editingObject 与编辑交互锁，不执行对象数据编辑命令，不进入 `EditHistory`，也不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 3 个编辑态方法，河流对象可进入 editingObject，`stopEditing({ifKind:"state"})` 不会误清河流编辑态，`stopEditing({ifKind:"river"})` 可清除，`toggleEditing()` 可进入再退出同一对象，不存在对象返回结构化失败，调用前后 checksum `0ce7d3e5` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：选择定位 API options 补齐批次已支持 `api.selection.locate(object, {padding, minScale, maxScale})`；定位会继续复用统一 `locateAndSelectObject()` 路径，并返回定位后的 camera 与 locateStatus。本步只改变视口相机和 selection，不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 `maxScale:2` 时 camera scale 被限制为 `2`，`minScale:6 / maxScale:12` 时 camera scale 为 `6.857142857142858`，非法 `minScale` 返回结构化失败，调用前后 checksum `64c5578e` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：debug 渲染 profiling API 第一刀已接入 `api.debug.profileNextRender({updateDynamicBuffers, updateOverlay, drawDirtyDynamicBuffers})`；该入口强制执行一次 renderer draw，返回 API 侧总耗时、前后 draw stats、动态 mesh cache 和 selectionHighlightMode，便于脚本定位下一帧渲染状态。本步只更新 renderer 诊断统计，不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `profileNextRender`，调用 `{updateDynamicBuffers:false, updateOverlay:false, drawDirtyDynamicBuffers:false}` 返回 `profiled=true`、`totalMs=114.3ms`、`after.draw.glError=0`、动态 mesh dirty 均为 `false`、`selectionHighlightMode=none`，调用前后 checksum `c49d639e` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：debug 状态转储与历史只读补齐批次已接入 `api.debug.dumpState({includeCapabilities, includeRendererStats})`、`api.history.stats()` 和 `api.history.peek()`；`dumpState` 聚合 snapshot、capabilities 和可选完整 renderer stats，`history.stats` 作为 `get` 的明确别名，`history.peek` 只返回 undo / redo 栈顶命令摘要，不执行命令也不调用命令 `isNoop()`。本步只读，不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `debug.dumpState`、`history.stats` 和 `history.peek`，默认 `dumpState()` 不返回完整 renderer，`includeRendererStats:true` 时返回 `draw.glError=0`，`history.stats()` 与 `history.get()` 一致，城市重命名后 `peek.undo` 返回 `重命名城市 #1 / city / affected city#1`，撤销后 `peek.redo` 返回同一命令摘要，调用前后 checksum `40fe0b1a` 恢复，WebGL / health / console / page error 均为 `0`。
   - 补充记录：debug 面板开关 API 第一刀已接入 `api.debug.enable()` 和 `api.debug.disable()`；该入口只复用现有开发模式面板与 `webgl-generator-debug-change` 事件，用于控制调试 UI 和 debug 行显示，不修改地图数据、health 阈值或 health 事件。`api.debug.snapshot()` 的 `app.debug` 也会返回开发面板可用性、启用状态、收起状态和事件数量。本步只改变调试 UI，不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 capabilities 已包含 `debug.enable / debug.disable` 且 debug 副作用说明为 `diagnostics-and-debug-ui`，`enable()` 后开发模式按钮显示、面板可见、snapshot `app.debug.enabled=true`，`disable()` 后面板隐藏、snapshot `app.debug.enabled=false`，`webgl-generator-debug-change` 事件按开 / 关各触发一次，调用前后 checksum `e878fde1` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：API 能力元数据确认边界第一刀已在 `api.info.capabilities()` 中新增 `safety.confirmRequiredMethods`、按命名空间分组的 `safety.confirmRequired` 和 `methodMetadata`。当前显式标注 `generate.regenerate / newMap / rerollSeed`、`data.importMap / importGEO`、`namebases.clear / renameObjects` 必须传 `confirm:true`，并记录对应的 `mutates / undoable / async / requiresConfirm` 元数据；保留原有 `methods` 数组兼容旧脚本。本步只读，不修改地图 checksum。静态检查、构建、子智能体 API 元数据验证和主线程浏览器兜底验证通过，浏览器验证确认确认方法列表精确为 7 项且分组正确，调用前后 checksum `25f32b7b` 不变，WebGL / health / console / page error 均为 `0`；浏览器 smoke 子智能体等待 90 秒无输出后已中断释放。
   - 补充记录：selection 能力元数据副作用边界第一刀已把 `api.info.capabilities().sideEffects.selection` 从 `readonly` 修正为 `selection-camera-and-editing-state`，并为 `selection.get/resolve/select/clear/locate/pick/flash/highlight/startEditing/stopEditing/toggleEditing` 补齐方法级 `methodMetadata`。其中 `get/resolve` 标注 `mutates: "none"`，`select/clear` 标注选择态变化，`locate` 标注相机与选择态变化，`pick` 标注 pick 面板状态变化，`flash/highlight` 标注临时闪烁态变化，编辑态方法标注 `editing-state`；这些方法均不要求 `confirm:true`，也不进入 `EditHistory`。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 selection 元数据完整且调用前后 checksum `819ecc45` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：layers / units 能力元数据副作用边界第一刀已为 `api.layers.get/setViewMode/setVisible/setTheme/fitView` 和 `api.units.get/apply/setDistanceUnit/setAreaUnit/setNumberAbbreviation/setMapScale/setPopulationScale/setMilitaryScale/setPrecipitationScale` 补齐方法级 `methodMetadata`。`layers.get` 与 `units.get` 标注 `mutates: "none"`，图层视图 / 可见性 / 主题和所有单位写入标注 `display-preference`，`layers.fitView` 标注 `camera-state`；同时 `sideEffects.layers` 从 `display-preference` 修正为 `display-preference-and-camera-state`。这些方法均不要求 `confirm:true`，不进入 `EditHistory`，也不修改地图 checksum。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 layers / units 元数据完整且调用前后 checksum `895aebdb` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：climate 能力元数据副作用边界第一刀已为 `api.climate.get/getOptions/getTemperature/getPrecipitation/getLatitude/getAtmosphere/getBiomes/apply/setLatitude/setLatitudeRange/setLongitudeRange/setTemperature/setPrecipitation/setWind` 补齐方法级 `methodMetadata`。气候读取方法标注 `mutates: "none"`；`apply` 和各项 setter 标注 `climate-state-and-derived-stale`，说明会更新当前地图气候 / 生物群系并标记下游派生 stale。这些方法均不要求 `confirm:true`，不进入 `EditHistory`，也不替换地图。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 climate 元数据完整且调用前后 checksum `cf6e8606` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：history 能力元数据副作用边界第一刀已为 `api.history.get/stats/peek/undo/redo` 补齐方法级 `methodMetadata`。`get / stats / peek` 标注 `mutates: "none"`；`undo / redo` 标注 `map-and-edit-history-state`，说明会复用当前 `EditHistory` 撤销 / 重做命令并改变地图或历史栈状态。`sideEffects.history` 从 `edit-history` 修正为 `edit-history-read-and-undo-redo`；这些方法均不要求 `confirm:true`，`undo / redo` 自身不再作为可撤销命令进入历史栈。静态检查、构建、子智能体 API 元数据验证和主线程浏览器兜底验证通过，浏览器 smoke 子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 history 元数据完整且调用前后 checksum `7cd02bc2` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：data 导出能力元数据副作用边界第一刀已为 `api.data.exportAll/exportMap/exportGEO/exportFeatureGEO/exportCompressedAll/exportPNG/exportNotes/exportMeasurements` 补齐方法级 `methodMetadata`。这些导出方法均标注 `mutates: "download-or-export-result"`，说明只生成返回结果或触发浏览器下载，不修改地图数据、不进入 `EditHistory`、不要求 `confirm:true`；其中 `exportCompressedAll` 和 `exportPNG` 标注 `async: true`，其它导出方法为同步。`importMap / importGEO` 继续保持必须 `confirm:true` 的导入元数据。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 data 元数据完整且调用前后 checksum `044fa6ab` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：namebases 能力元数据副作用边界第一刀已为 `api.namebases.list/export/import/create/copyBuiltin/update/delete/clear/bind/renameObjects` 补齐方法级 `methodMetadata`。`list` 标注 `mutates: "none"`；`export` 标注 `download-or-export-result`；名称库导入、创建、复制、更新、删除、清空和绑定标注 `namebases` 且进入撤销栈；按名称库批量重命名对象标注 `object-names` 且进入撤销栈。`clear / renameObjects` 继续要求显式 `confirm:true`，其它名称库写入方法不要求确认。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 namebases 元数据完整且调用前后 checksum `b760ab08` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：info / debug 诊断能力元数据副作用边界第一刀已为 `api.info.version/capabilities/mapSummary/runtimeStats/healthEvents` 和 `api.debug.enable/disable/snapshot/dumpState/renderer/health/profileNextRender` 补齐方法级 `methodMetadata`。`info` 全部标注 `mutates: "none"`；`debug.snapshot/dumpState/renderer/health` 标注只读诊断；`debug.enable/disable` 标注 `debug-ui-state`，说明只开关开发面板 / debug UI；`debug.profileNextRender` 标注 `renderer-diagnostics`，说明只强制 draw 并刷新 renderer 诊断统计，不修改地图数据、不进入 `EditHistory`、不要求 `confirm:true`。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 info / debug 元数据完整，debug 诊断调用和 UI 开关前后 checksum `e36b5477` 不变，`profileNextRender` 执行成功，WebGL / health / console / page error 均为 `0`。
   - 补充记录：generate 配置能力元数据副作用边界第一刀已为 `api.generate.getOptions/setOptions` 补齐方法级 `methodMetadata`。`getOptions` 标注 `mutates: "none"`；`setOptions` 标注 `generation-options`，说明只写入当前生成配置、同步生成输入和运行时面板，不生成地图、不替换当前地图、不进入 `EditHistory`、不要求 `confirm:true`。`regenerate / newMap / rerollSeed` 继续保持既有必须确认的生成 / 重算元数据。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 `setOptions({seed:"api-generate-options-only", cellsTarget:1200})` 只更新生成配置，当前地图 checksum `00ad9ac5` 和历史摘要不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：edit 命名空间能力元数据副作用边界第一刀已为 `api.edit.*` 全部 46 个公开编辑方法补齐方法级 `methodMetadata`。这些方法均标注 `undoable: true`、`async: false`、`requiresConfirm: false`，说明会通过 edit command 写入当前地图并进入 `EditHistory`，但不需要额外确认；`mutates` 按领域区分为 `notes / measurements / settlements / political-entities / cultures / religions / routes / rivers / lakes / labels / markers`，方便脚本或 AI 预判影响面。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认 46 个 edit 方法元数据完整，`sideEffects.edit = "edit-command"`，`safety.confirmRequired.edit` 为空，调用前后 checksum `a87c500c` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：能力元数据覆盖自检第一刀已在 `api.info.capabilities()` 中新增 `methodMetadataCoverage` 摘要，按命名空间统计 `methods` 与 `methodMetadata` 的覆盖数量、缺失项和多余项，并保留顶层 `complete / missing / extra` 供 AI、脚本和后续回归快速判断能力表是否完整。本步不改变既有 `methods`、`methodMetadata`、`safety` 和 `sideEffects` 字段形状。静态检查、构建和主线程浏览器兜底验证通过，两个验证子智能体等待 90 秒无输出后已中断释放；浏览器验证确认覆盖自检 `complete=true`，127 个公开方法全部有元数据，`missing / extra` 均为空，调用前后 checksum `2f387f5c` 不变，WebGL / health / console / page error 均为 `0`。
   - 补充记录：API capabilities 覆盖回归脚本第一刀已新增 `tools/webgl-generator-api-capabilities-regression.mjs` 和 `pnpm run regress:api`，把前序临时浏览器验证固化为可复用门禁。脚本会在构建产物上生成约 1000 cells 小地图，校验 `methodMetadataCoverage` 完整、确认边界精确、代表性 `mutates` 元数据未漂移，并输出 JSON / Markdown 报告到 `docs/generated/reports/`。
   - 补充记录：API 完整地图 roundtrip 回归脚本第一刀已新增 `tools/webgl-generator-api-roundtrip-regression.mjs` 和 `pnpm run regress:api-roundtrip`，覆盖阶段 5 “生成地图 -> 导出 -> 导入 -> 校验”验收闭环。脚本会用控制台 API 生成源地图，分别验证完整 JSON 对象、JSON 字符串、压缩导出对象和 gzip-base64 payload 导入都能恢复源 seed / checksum，并确认未传 `confirm:true` 与坏 JSON 会结构化失败且不破坏当前地图。
   - 补充记录：API GEO 导入回归脚本第一刀已新增 `tools/webgl-generator-api-geo-regression.mjs` 和 `pnpm run regress:api-geo`，把 `api.data.importGEO()` 的普通 GeoJSON 测量对象分支和 FMG Cells 地形导入分支固化为可复用门禁。脚本会校验对象 / 字符串 GeoJSON 导入、撤销、未确认和坏 JSON 错误边界，以及 FMG Cells 导入后的非 GEO 派生重置、水陆一致性和 hover 一致性。
   - 补充记录：API 备注与测量导出回归脚本第一刀已新增 `tools/webgl-generator-api-export-records-regression.mjs` 和 `pnpm run regress:api-exports`，把 `api.data.exportNotes()` 与 `api.data.exportMeasurements()` 的全量导出、ID 筛选、`includeText:false` 摘要返回、浏览器下载文件名和 checksum 不变边界固化为可复用门禁。
   - 补充记录：API 名称库文档回归脚本第一刀已新增 `tools/webgl-generator-api-namebase-docs-regression.mjs` 和 `pnpm run regress:api-namebases`，把 `api.namebases.list/export/import/create/clear` 的文档 roundtrip、JSON / 原版文本导出、`includeText:false`、浏览器下载文件名、append / replace / undo 和 `clear({confirm:true})` 确认边界固化为可复用门禁；本脚本暂不覆盖 `renameObjects`，后续可单独补对象批量改名回归。
   - 补充记录：API 名称库批量改名回归脚本第一刀已新增 `tools/webgl-generator-api-namebase-renames-regression.mjs` 和 `pnpm run regress:api-namebase-renames`，把 `api.namebases.renameObjects(kind, ids, {confirm:true})` 的安全边界、国家 / 城市 / 河流 / 湖泊改名和撤销恢复固化为可复用门禁。脚本默认使用 `3000` cells；`10000` cells 下改名逻辑也能覆盖四类对象，但生成阶段可能触发 health long-task，不适合作为本 API 门禁默认规模。

7. 军事重新生成。`权威任务第 25 项，已完成`
   - 现状：`regenerateMapAttribute()`、`normalizeApiRegenerationKind()` 和 `regenerateMilitary()` 已支持 `military / army / armies`，会调用 `buildMilitary()` 重建军团、战线和战役；控制面板的 `regenerationActions` 目前只列国家、省份、城镇、道路、河流、资源点和外交，用户没有可见的军事重新生成入口。
   - 目标：在控制面板“重新生成”区增加“军事”动作，复用现有受约束重算路径；同时把控制台 API 的既有军事分支纳入正式能力与回归门禁，不再另建第二套军事生成逻辑。
   - 数据语义：按当前国家、人口、经济、外交和地图 seed 生成新的军事数据；必须保留各国用户已调整的 `militaryPolicy.unitRatios`，重建 `map.military`、`pack.military` 和各国军团，并刷新战线、战役、军事图层、对象索引、选择 / 高亮、运行时摘要和已打开军事面板。
   - stale 语义：成功后军事标记为 fresh，依赖军事结果的地区继续标记为 stale；不得误把经济、外交或用户兵种比例改写为默认值。缺少 pack cells 或有效国家时应返回明确的未执行结果，不留下半更新状态。
   - 边界：本项只做全图军事派生重新生成，不新增动态战斗模拟、自动推进战役、单国局部重算、军事 AI、经济消耗或外交反向联动；既有战报档案如何处理必须在实现前按当前静态记录语义确认，不能静默混入新的动态系统。
   - 验收：固定地图执行后返回重算前后军团数、扰动编号、实际变化摘要和 affected 摘要；前后军事快照不得完全同构，用户兵种比例保持不变，军团 / 战线 / 战役与 metadata 一致，军事 stale 清除、地区 stale 生效，军事图标、标签、战线与对象索引读取新数据；`api.generate.regenerate("military", {confirm: true})` 与 UI 走同一路径，未确认调用结构化失败。新增纯代码回归并通过生产构建和 `git diff --check`；按当前快速迭代约定不要求实现过程中逐步跑浏览器，真实 UI 验收集中到本项收口时执行一次。
   - 完成记录：控制面板已增加“军事”重生成入口；运行时会拒绝缺少有效国家的地图，并在极少数完整军事快照同构时自动更换扰动重试，结果直接返回变化军团、兵力、编成、态势、驻地与命令数。刷新范围覆盖点图层、军事标签、战线和对象索引，并保持 `map.military === pack.military`、军事 fresh、地区 stale。各国有效 `unitRatios` 会保留；旧全局战报保留为带 `archived / archiveReason / archiveGeneration` 的静态档案，军事面板不会把它们按旧 id 自动挂到新军团。`regress:military-regeneration` 的 3000 cells 固定样本通过：军团总数虽仍为 `56 -> 56`，但 56 个军团全部变化，兵力变化 56、编成变化 56、态势变化 13、驻地变化 32、命令变化 34，证明重生成结果不再以总数变化代替实际变化验收。

8. 外交关系与交战区一致性。`权威任务第 26 项，已完成`
   - 症状：双方外交状态已经是中立、友好、盟友、附庸或宗主时，地区管理仍可能显示以双方命名的 `Warzone` 交战区。
   - 规则：`Warzone` 必须对应当前仍处于 `Enemy / 战争` 的有效国家对；`DIPLOMACY_RELATIONS.polarity >= 0` 的中立及以上关系绝不允许生成或保留双方交战区。旧 campaign、军事 front、zone 名称或历史记录都不能覆盖当前外交关系这一最终判断。
   - 生成修正：`createWarzoneZone()` 在消费 `pack.military.fronts` 前校验 attacker / defender 均有效且双方当前规范关系为 `Enemy`；fallback 的敌对边界路径使用同一共享判定。猜疑、宿敌和未知关系是否生成其它非交战型地区保持现状，本项不自行新增类型。
   - 编辑一致性：外交关系从 `Enemy` 改为中立及以上时，应同步清理或失效该国家对的战争 campaign、军事 front 和对应 `Warzone`，刷新地区对象索引、选择 / 高亮和已打开地区面板；不得只在 UI 隐藏错误条目。撤销 / 重做必须恢复或再次清理同一组派生数据。
   - 旧数据适配：完整地图 JSON、浏览器缓存和旧导出文件中若存在缺少参与国字段或与当前外交关系冲突的交战区，加载 / 迁移后必须剔除无效交战区或安全回填参与国；非 `Warzone` 地区、合法战争交战区和用户样式不得误删。
   - 边界：不改变外交等级、宣战概率、军事战斗模拟、其它地区类型生成概率，也不把宿敌 / 猜疑自动升级为战争；本项只维护当前外交关系、campaign / front 与交战区的一致性。
   - 验收：构造一对战争国家可生成合法交战区；依次改为 `Neutral / Friendly / Ally / Vassal / Suzerain` 后，数据层、地区管理列表、GeoJSON 导出和对象索引中均不存在该双方交战区；撤销回 `Enemy` 后相关战争派生可按命令快照恢复，重做再次清除。固定回归还需覆盖旧地图坏样本、无效 / 已删除国家、合法战争区保留和其它地区不受影响，并通过生产构建与 `git diff --check`；浏览器只在本项收口时集中验证一次。
   - 完成记录：新增共享战争一致性判定和修复器，外交离开 `Enemy` 时会清理双方国家 campaign、`map / pack` 军事 campaign/front 及对应 Warzone，并更新地区 metadata；外交命令快照同时覆盖外交、军事和地区，撤销 / 重做可完整恢复 / 再清理。新 Warzone 持久化 attacker / defender，军事与地区生成均复核双向 `Enemy`；旧图加载只在 cells 恰好覆盖两个有效国家且双方仍为战争时回填，否则剔除，用户样式与非 Warzone 保留。GeoJSON 已导出参与国字段，`regress:warzone-consistency` 覆盖五种和平关系、合法旧图、坏旧图、三国歧义区和已删除国家。

9. 列表选中项滚动居中一致性。`权威任务第 27 项，已完成`
   - 症状：城市管理等编辑面板在程序化选中、地图反向选中或列表外部选中对象时，列表会自动滚动到选中项，但有时只保证该项进入视口，没有把它稳定放到滚动区域中央。`UiObjectTable` 已存在中心点计算和动画帧重试，说明当前问题需要按真实滚动容器、虚拟行几何和触发时机的回归继续定位，不能只在城市面板再加一层 `scrollIntoView()`。
   - 统一规则：凡是“主选中项变化会驱动列表滚动”的组件，目标项都应在其实际纵向滚动视口内居中；只有列表首尾受 `scrollTop` 边界限制时允许偏离中央。滚动只改变纵向位置，不重置横向滚动，也不把地图相机居中、面板拖动或 segmented / tab 激活误纳入本规则。
   - 公共表格：复查 `UiObjectTable` 的普通表格与超过虚拟化阈值的大表，确认选中 id、筛选 / 排序后的行索引、固定表头、实际行高、上下占位、真实 scroller、懒渲染与面板首次打开后的重试都使用同一居中契约；避免固定 `VIRTUAL_ROW_HEIGHT` 与真实 DOM 行高漂移、容器尺寸尚未稳定或列表刷新覆盖滚动结果。
   - 相似路径审计：逐项复查所有使用 `UiObjectTable` 的管理面板，以及未复用公共表格但具备独立滚动视口和活动项的路径，至少包括文化 / 宗教 `UiTreeDisplayPanel` 和外交矩阵；军事战报、历史预览等没有主选中项的只读列表只需确认不误触发，不为满足数量强行增加滚动行为。适合共享的计算、边界钳制和重试逻辑应收束为公共 helper，避免各组件重新实现近似算法。
   - 防抖边界：只在主选中项或其排序 / 筛选位置发生需要重新定位的变化时居中；同一选中项的无关数据刷新、列宽调整、历史摘要刷新和用户手动滚动不应持续抢回中央。批量勾选的 `selectedRowIds` 不等于主选中项，勾选 / 全选不得逐行抢夺滚动位置。
   - 验收：纯代码回归至少覆盖普通表格、大型虚拟城市表格、中间项、首尾边界、筛选 / 排序后选中、面板首次打开、重复同选中刷新、横向滚动保持和批量勾选不抢滚动；审计清单需列出所有命中的公共表格及自定义树 / 矩阵路径。收口浏览器验收中，从城市列表外部选中远处城市后，选中行中心与真实滚动视口中心差值不超过 `2px`；普通列表、树状总览和外交矩阵各抽查一条，首尾项按可达边界钳制。通过专项回归、生产构建和 `git diff --check`，实现期间继续快速迭代，不要求每一步启动浏览器。
   - 完成记录：新增共享 `selection-scroll.js`，统一纵向中心计算、首尾钳制、横向保持和最多 10 帧真实元素重试。`UiObjectTable` 只监听主选中 id、选中位置和行 id 顺序；虚拟表先估算再按真实行矩形二次校正，同一选中无关刷新与批量勾选不抢滚动。文化 / 宗教树状总览和外交矩阵复用同一 controller，只读列表不增加自动行为。`regress:selection-scroll-center` 已覆盖计算边界、横向保持、重试与组件接入。

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

86. `locateAndSelectObject()` 标签与入口扩展。`已完成`
   - 目标：继续推进统一定位 / 选择入口，覆盖标签管理、政体 / 外交入口和对象详情面板定位。
   - 边界：本步只迁移定位调用和标签 selection handler；不改变外交主题切换规则，不新增闪烁高亮、进入编辑或 locate action API。
   - 完成记录：`locateAndSelectObject()` 支持 `sourcePanelId = null`，对象详情定位可复用统一定位 / selection / runtime / pick 刷新流程但不伪装成领域面板来源；标签、政体和外交定位回调改走 helper，标签 selection handler 会在标签面板打开时保持选中行并避免落入通用对象详情。

87. `locateAndSelectObject()` 经济 / 备注与 API 复用。`已完成`
   - 目标：继续收束 highlight / locate API，把剩余直接调用旧 `locateObject()` 的列表定位入口和控制台 API 迁入统一定位动作。
   - 边界：本步只迁移经济总览、备注总览和 `selection.locate()` 的定位路径；不改变 trade flow / 备注目标对象的打开面板规则，不新增多对象高亮或编辑态 start / stop API。
   - 完成记录：经济总览定位、备注总览定位和控制台 `selection.locate()` 均复用 `locateAndSelectObject()`；经济总览定位前会记录当前商品 / 市场 / 交易行，避免点击定位按钮后丢失行选中状态；控制台 API 通过运行时注入的 `locateObject` action 共享 selection、runtime 和 pick 刷新语义，旧 `locateObject()` 保留为底层兼容路径。

88. 测量对象定位动作收束。`已完成`
   - 目标：继续推进更完整的 locate action 语义，把测量对象的面板定位、导入后自动定位和进入编辑定位统一到同一条运行时动作。
   - 边界：本步只收束测量对象的 bounds 定位调用；不改变测量点编辑、保存、导出、节点增删、路线贴合或闪烁高亮实现。
   - 完成记录：运行时把 `locateAndSelectObject()` 暴露为 `state.locateAndSelectObject`，`locateMeasurement()` 优先复用该动作并保留自定义 bounds 缩放；测量面板定位、GEO 测量导入后的首对象定位、进入测量对象编辑后的定位都共享 selection、runtime 和 pick 刷新语义，脱离 app 初始化的兜底路径仍保留。

89. 对象进入编辑动作 helper 第一刀。`已完成`
   - 目标：继续补齐“定位 / 闪烁高亮 / 打开面板 / 进入编辑”语义中的进入编辑部分，先把已有入口收束到运行时统一动作。
   - 边界：本步只新增并迁移 `startObjectEditing()` / `stopObjectEditing()` / `toggleObjectEditing()`，覆盖对象详情、国家、省份和河流既有入口；不改变高度、国家、省份刷子模式、河道编辑细节或对象表格双击策略。
   - 完成记录：运行时编辑动作会集中处理 selection、`SelectionStore` 编辑态、编辑交互锁和 runtime 面板刷新；对象详情编辑 / 取消、国家编辑、省份编辑和河流编辑开关已复用该动作，面板内部退出模式的保护性 stop 分支仍保留在原调用点。2026-07-11 `toggleObjectEditing()` 的同一对象判断已改用 `sameObjectId()`，避免数字 id 与数字字符串 id 导致同一对象无法切换退出。

90. 对象退出编辑动作 helper 第一刀。`已完成`
   - 目标：继续收束进入 / 退出编辑语义，把国家、省份和河流退出编辑的保护性清理也纳入运行时统一动作。
   - 边界：本步只为 `stopObjectEditing()` 增加 `ifKind` 守卫，并迁移国家 / 省份切换模式、关闭画笔和河流面板关闭时的编辑态清理；不改变新增 / 删除模式、画笔 active stroke、面板打开关闭或河流编辑细节。
   - 完成记录：`stopObjectEditing({ifKind})` 会在对象类型匹配时停止编辑并统一刷新编辑交互锁和 runtime 面板；国家 / 省份退出编辑、进入新增 / 删除模式前的清理，以及关闭河流面板时退出河流编辑都已复用该 helper，直接 `selectionStore.startEditing/stopEditing` 只保留在 helper 内部。

91. 控制面板打开对象面板 helper 第一刀。`已完成`
   - 目标：继续补齐打开 / 更新面板语义，把控制面板中“如果当前 selection 是某类对象，先预选该对象再打开领域面板”的重复逻辑收束到运行时 helper。
   - 边界：本步只迁移控制面板打开国家、政体、省份、城市、文化、宗教、外交、经济、军事、地区、路线、标记和标签面板的预选逻辑；不改变面板持久化、selection handler、列表筛选或对象详情打开规则。
   - 完成记录：新增 `openSelectionAwarePanel({kind, beforeOpen, open, afterOpen})`，可在打开前后根据当前 selection 执行领域预选；经济 trade-flow 保持 open 后再选中交易的旧语义，其余对象面板保持打开前预选的旧顺序。2026-07-11 已将该逻辑提升为文件级 `openSelectionAwarePanelForState()`，保留运行时绑定入口，方便后续 locate / open action 继续复用。

92. selection handler 更新 / 打开面板 helper 第一刀。`已完成`
   - 目标：继续补齐打开 / 更新面板语义，把 selection handler 中“面板已打开则 update，否则 open”的重复分支收束到同一个 helper。
   - 边界：本步只迁移 state、city、province、culture、religion、river、lake、zone、route、measurement 和 military 的同构 update/open 分支；marker、label、economy 仍保留“只在面板已打开时更新”的特殊规则。
   - 完成记录：新增 `updateOrOpenSelectionPanel(panel, {update, open})`，selection handler 继续先同步对象详情清理与领域选中目标，再通过 helper 执行 update/open；各对象是否自动打开面板的既有规则保持不变。2026-07-11 已补 `updateExistingSelectionPanel(panel, update)`，把 economy、marker 和 label “只在面板已打开时更新”的特殊规则也命名化，不改变自动打开边界。

93. runtime / pick 双刷新 helper 第一刀。`已完成`
   - 目标：继续收束定位、selection 和加载完成后的公共刷新语义，把固定相邻的 runtime panel 与 pick panel 双刷新合并到同一个 helper。
   - 边界：本步只迁移已经紧邻出现的 `updateRuntimePanel(documentRef, state)` + `updatePickPanel(documentRef, state)`；不迁移单独 runtime 刷新、单独 pick 刷新，也不改变 measurement overlay 刷新顺序。
   - 完成记录：新增 `refreshRuntimeAndPickPanels(documentRef, state)`，并用于 `locateAndSelectObject()`、selection store 监听、单位偏好刷新、地图载入完成、通用对象定位和测量对象定位的双刷新路径。

94. 文化 / 宗教空态新增动作接入。`已完成`
   - 目标：继续扩展 `UiObjectTable.emptyAction`，让已有新增动作在空列表区域也能作为主动作出现。
   - 边界：本步只把文化和宗教列表空态按钮接到既有 `handleListAction("add")`；不改变新增空文化 / 空宗教命令、历史、筛选、定位或删除逻辑。
   - 完成记录：文化面板空态显示“新增空文化”，宗教面板空态显示“新增空宗教”，两者与列表动作条复用同一个冻结动作对象和同一套回调。

95. 标签空态新增动作接入。`已完成`
   - 目标：继续扩展 `UiObjectTable.emptyAction`，让标签列表空态也能直接执行已有新增标签动作。
   - 边界：本步只把标签列表空态按钮接到既有 `handleLabelManagementAction("add")`；不改变标签新增、恢复、删除、重命名、定位或备注逻辑。
   - 完成记录：标签面板空态显示“新增标签”，并与列表动作条复用同一个冻结动作对象和同一套回调。

96. 名称库空态新建用户库动作接入。`已完成`
   - 目标：继续扩展 `UiObjectTable.emptyAction`，让名称库列表空态也能直接执行已有新建用户库动作。
   - 边界：本步只把名称库列表空态按钮接到既有 `handleNamebaseAction("create")`；不改变名称库导入、复制、删除、清空、绑定或编辑逻辑。
   - 完成记录：名称库面板空态显示“新建用户库”，并与列表动作条复用同一个冻结动作对象和同一套回调。

97. 名称库导入方式持久化。`已完成`
   - 目标：扩展剩余面板状态持久化，把名称库面板的“导入方式”作为轻量偏好保存。
   - 边界：本步只持久化名称库导入方式 `append / replace`；不保存导入预览、待确认文件、编辑草稿或名称库内容。
   - 完成记录：`panel-list-preferences` 支持可选 `importMode` 字段；名称库面板打开时读取导入方式，切换“追加到用户库 / 替换用户库”时写回偏好，无效值回退为 `append`。

98. 资源标记范围筛选持久化。`已完成`
   - 目标：扩展剩余面板状态持久化，把资源标记面板的“全部 / 资源点 / 标记”范围筛选保存为轻量偏好。
   - 边界：本步只持久化 marker 面板范围筛选 `all / resource / marker`；不保存新增 / 移动编辑模式、选中标记、资源类型草稿或其它编辑状态。
   - 完成记录：`panel-list-preferences` 支持可选 `scope` 字段；资源标记面板打开时读取范围筛选，切换范围时写回偏好，无效值回退为 `all`。

99. `UiObjectTable.emptyAction` 禁用态支持。`已完成`
   - 目标：继续完善空态主动作基础设施，让空态按钮也能表达不可用状态。
   - 边界：本步只让公共空态按钮读取 `emptyAction.disabled`；不改变现有测量、文化、宗教、标签和名称库空态动作的可用状态，也不新增业务动作。
   - 完成记录：`UiObjectTable` 空态按钮会把 `emptyAction.disabled` 透传到原生 `disabled` 属性，后续导入 / 创建类空态动作可复用同一能力。

100. 外交历史范围筛选持久化。`已完成`
   - 目标：扩展剩余二级筛选状态持久化，把外交面板“外交历史”的范围筛选保存为轻量偏好。
   - 边界：本步只持久化外交历史范围 `selected / subject / all`；不保存主体国家、选中对象、关系编辑说明草稿、外交矩阵或历史内容。
   - 完成记录：外交面板初始化时读取历史范围筛选，切换“当前关系 / 主体国家 / 全部历史”时写回偏好，无效值回退为 `selected`。

101. 军事战报导出范围持久化。`已完成`
   - 目标：扩展剩余二级筛选状态持久化，把军事面板战报档案的“导出范围”保存为轻量偏好。
   - 边界：本步只持久化战报导出范围 `all / selected / filtered`；不保存战报链路 / 类型 / 结果 / 结算筛选、展开状态、待导入文件或战报编辑草稿。
   - 完成记录：军事面板初始化时读取战报导出范围，切换“全部记录 / 当前军团 / 当前筛选”时写回偏好，无效值回退为 `all`。

102. 文化 / 宗教树状面板打开状态持久化。`已完成`
   - 目标：扩展剩余内部状态持久化，把文化和宗教面板的树状总览打开状态作为轻量浏览偏好保存。
   - 边界：本步只持久化树状面板是否打开；不保存选中树节点、重命名 / 继承 / 备注编辑浮层、树面板位置或任何编辑草稿。
   - 完成记录：`panel-list-preferences` 支持可选 `treeOpen` 布尔字段；文化和宗教面板初始化时读取树状面板打开状态，打开 / 关闭树状面板时写回偏好。

103. 废弃内容区历史组件清理。`已完成`
   - 目标：承接“对象列表底部历史按钮清理”，删除已无调用方的 Vue `UiHistoryActions` 和旧 DOM `createHistoryActions()`，避免后续面板继续复用已废弃模式。
   - 边界：面板框架标题栏撤销 / 重做继续保留；高度编辑器的笔刷撤销 / 重做继续保留，不改变 `EditHistory`、历史格式化或命令执行语义。
   - 完成记录：已删除无调用方的 `UiHistoryActions.vue` 和 `ui/components/history-actions.js`；`history-format.js` 继续由面板标题栏使用。

104. 废弃内容区历史样式清理。`已完成`
   - 目标：删除只服务已移除历史条的面板专用 CSS，并保留仍由高度编辑器和面板标题栏使用的样式。
   - 边界：不调整其它动作条、列表、详情区或标题栏视觉。
   - 完成记录：已删除城市、国家、省份、文化、宗教、路线、河流、湖泊、地区、标记、测量、名称库、备注、外交和军事等旧内容区历史类样式；`.height-history-actions` 与 `.floating-panel-history-button` 保留。

105. Vue 浮动面板规范校准。`已完成`
   - 目标：把架构规范从“内容区使用 `UiHistoryActions`”更新为“可撤销面板统一使用标题栏历史入口”，并同步基础设施清单和开发日志。
   - 边界：只校准当前有效模式，不回写历史日志中的旧阶段事实。
   - 完成记录：`docs/architecture/vue-floating-panel-pattern.md` 和编辑器基础设施清单已改为标题栏历史入口规范，不再把 `UiHistoryActions` 列为公共组件。

106. 多对象持久高亮生命周期第一刀。`已完成`
   - 目标：补齐 `highlight / locate API` 中长期暂缓的多对象高亮，让脚本和后续批量列表操作能在不改变当前 selection 的情况下同时标出多个地图对象。
   - 边界：`api.selection.flash(object)` 继续保持单对象 2.6 秒红色闪烁；`api.selection.highlight(objects, {append})` 改为独立持久高亮集合，显式调用 `clearHighlights()` 或载入新地图时清除。单次最多 100 个对象；贸易流暂不支持持久高亮并返回结构化错误。
   - 完成记录：renderer 新增 `objectHighlights`，政治面、地区、湖泊和河流共用 selection mesh，路线复用动态路线 mesh，城市 / 标签 / 标记 / 军团复用 overlay selected 视觉；`selection.get()` 和 renderer stats 会返回当前高亮摘要。纯函数断言确认国家 + 湖泊 + 河流三对象高亮顶点可同时生成。

107. 高亮 API 能力契约与回归门禁更新。`已完成`
   - 目标：让 capabilities 方法清单、method metadata 和长期回归脚本准确反映持久高亮副作用。
   - 边界：高亮只改变运行时视觉状态，不进入 `EditHistory`，不改变地图 checksum，也不需要 `confirm:true`。
   - 完成记录：selection 方法新增 `clearHighlights`；`highlight / clearHighlights` 的 `mutates` 标为 `persistent-highlight-state`，命名空间副作用摘要更新为 `selection-camera-highlights-and-editing-state`。新增 `pnpm run regress:selection-highlight` 固化政治面、湖泊、河流组合与去重断言；capabilities 回归补入代表性副作用断言，并把 Playwright `context` 与 `browser` 都放入 `finally` 关闭路径。

108. 路线 / 河流 / 湖泊批量选择高亮接入。`已完成`
   - 目标：把持久高亮从控制台能力落到最适合批量比较的三个线性 / 水文列表，让用户可以勾选多行后一次高亮。
   - 边界：批量 checkbox 只用于暂存高亮目标；不改变当前单对象 selection，不新增批量删除、批量重命名或批量编辑。筛选结果变化时会移除已不可见的暂存 id。
   - 完成记录：路线、河流和湖泊 `UiObjectTable` 已开启 `selectableRows`，列表动作条新增“高亮选中 N / 清除高亮 N”，摘要区显示全局高亮数量；三个面板继续保留原单行定位、编辑和管理语义。

109. UI / API 持久高亮运行时动作统一。`已完成`
   - 目标：避免面板按钮和控制台 API 各自直接操作 renderer，统一高亮写入、清除、runtime 状态和面板刷新。
   - 边界：运行时 helper 只改变视觉高亮集合和文件操作状态，不进入 `EditHistory`，不改变地图 checksum。
   - 完成记录：新增共享 `setPersistentObjectHighlights()` / `clearPersistentObjectHighlights()` / `refreshPersistentHighlightUi()`；控制台 API 与三个面板共用同一入口，API 修改高亮后已打开的路线、河流、湖泊面板会同步更新数量。

110. 可见行批量选择 composable。`已完成`
   - 目标：把路线、河流、湖泊及后续面板重复的“勾选 id / 计算选中可见行 / 筛选后裁剪”逻辑收束为公共 Vue composable。
   - 边界：只管理当前可见列表内的临时 checkbox 状态，不持久化、不改变单对象 selection，也不负责业务动作。
   - 完成记录：新增 `useVisibleRowSelection()` 并迁移路线、河流、湖泊；新增 `pnpm run regress:visible-row-selection`，覆盖数字 / 字符串 id 统一、筛选裁剪和空列表清空。

111. 政治 / 社会面板批量高亮接入。`已完成`
   - 目标：把安全的批量高亮继续接入国家、省份、文化和宗教列表。
   - 边界：排除中立 / id 0 行；checkbox 只暂存高亮目标，不新增批量删除、批量改色、批量继承或批量归属编辑。
   - 完成记录：四个公共表格已开启批量选择，列表动作新增“高亮选中 N / 清除高亮 N”，摘要显示全局高亮数；文化 / 宗教复用原列表动作条，国家 / 省份新增轻量高亮动作条。

112. 面板高亮桥接与 100 对象上限统一。`已完成`
   - 目标：消除七个 wrapper 的重复桥接代码，并让 UI 与 API 遵守同一全局高亮上限。
   - 边界：最多同时高亮 100 个对象；API 超限返回结构化错误，UI 批量选择超限时取前 100 个并显示状态提示，不静默扩张 renderer 负载。
   - 完成记录：新增 `panel-highlight-actions.js` 统一 row 映射、清除和数量同步；`refreshPersistentHighlightUi()` 已覆盖国家、省份、文化、宗教、路线、河流和湖泊面板。

113. 点对象 / 地区 / 军事面板批量高亮接入。`已完成`
   - 目标：把已有稳定对象身份和 renderer 高亮能力的城市、资源标记、军团与地区列表接入公共批量高亮。
   - 边界：checkbox 只服务只读视觉高亮，不改变单对象 selection，不新增批量删除或批量编辑；军事面板复用原有导出选中状态，不维护第二套勾选集合。
   - 完成记录：四个表格已接入 `useVisibleRowSelection()`、高亮 / 清除动作和全局高亮摘要；wrapper 复用 `panel-highlight-actions.js`，运行时统一刷新范围扩展到全部十一类已接入面板。

114. 剩余列表批量语义评估。`已完成`
   - 目标：逐个判断标签、测量、备注、外交、政体和经济等列表是否适合接入持久高亮，优先复用已有导出多选状态。
   - 边界：没有稳定地图对象身份、renderer 不支持或批量动作容易与编辑语义混淆的列表不强行接入；贸易流继续等待专用对象身份与渲染能力。
   - 完成记录：标签、备注目标和政体下国家已接入批量高亮；标签排除隐藏项，备注排除孤儿和 renderer 不支持的目标，政体面板复用原导出选择。可见行选择回归已补复合 `idKey` 裁剪覆盖。测量对象在下一步通过独立 SVG overlay 模型完成接入；外交关系因一行对应两个国家，经济流因对象类型跨城市 / 路线 / 贸易流，继续暂缓而不做含糊映射。

115. 测量对象持久高亮模型。`已完成`
   - 目标：让保存的测量对象进入可查询、可批量高亮的稳定对象模型，并与 SVG measurement overlay 的强调样式联动。
   - 边界：不能把测量对象伪装为普通 renderer mesh 对象；需要明确 API resolve / highlight 契约、overlay 更新时机和载入新地图后的清理语义，再接入测量面板 checkbox。
   - 完成记录：新增正式 `OBJECT_KIND.MEASUREMENT`、resolver 和纯函数高亮状态 helper；控制台 resolve / select / locate / highlight 已能处理保存的测量对象，renderer 继续只保存统一集合与统计，SVG overlay 按 id 渲染持久橙色强调和临时 flash。测量面板复用原导出多选接入高亮，重命名、点列更新和删除后会重新解析并清理高亮集合；新增 `pnpm run regress:measurement-highlight` 固化 resolver 与 overlay class 状态。

116. 外交关系与经济流复合高亮模型。`已完成`
   - 目标：为“一行关联多个地图对象”的外交关系、贸易流和经济聚合行定义明确身份、端点与专用视觉，再决定批量高亮入口。
   - 边界：不得把关系行随意降级为单个国家或城市；贸易流在 renderer 有稳定线性几何和 pick / locate 语义前继续返回结构化不支持错误。
   - 完成记录：新增有方向的 `OBJECT_KIND.DIPLOMACY_RELATION`，以 `subjectId:objectId` 区分正反关系并解析两国中心；贸易流继续使用稳定 deal id。两类复合对象共享高亮专用 connector 几何、bounds、locate 和仅针对当前 selection / 持久集合的拾取，不恢复已退役的全量 `tradeFlows` 图层。外交与经济面板复用原导出多选，分别只提交关系行和端点有效的交易行；新增 `pnpm run regress:composite-highlight` 覆盖方向身份、resolver、12 个 connector 顶点与两类拾取。

117. 复合 connector 视觉与负载门禁第一刀。`已完成`
   - 目标：在真实地图浏览器验收恢复后，评估多条外交 / 交易 connector 的重叠、颜色辨识、拾取优先级和 100 对象上限下的 selection buffer 构建耗时。
   - 边界：没有实测证据前不恢复全量贸易流图层；如需长期显示全部贸易网络，应单独设计密度裁剪、图例和性能门禁，而不是借持久高亮入口绕过图层治理。
   - 完成记录：当前外交关系 connector 使用 resolver 返回的真实关系色，持久多选仍统一使用橙色；重叠线段按输入顺序拾取，renderer 始终把当前 selection 放在持久集合前，因此同距时 selection 优先。复合回归新增 100 对象上限负载：生成 600 个 GPU 顶点，拾取检查 100 个候选，阶段末子智能体纯函数构建约 1.018ms；该数值只作本轮观察，不替代真实浏览器门禁。

118. 复合 connector 真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时验证关系色、交易流颜色、重叠拾取、100 对象交互流畅度、checksum 与 WebGL / console / page / health 状态。
   - 边界：继续遵守不新开或重启 Chrome、不重复启动服务器、不持续刷新；没有现成 FMG 页面时只记录缺口，不用主线程或临时 Playwright 绕过用户约束。
   - 完成记录：用户明确授权恢复 Chrome 后，复用现有 `5410` 生产页面完成真实验收。外交关系当前 selection 使用实际关系色、贸易流 selection 使用绿色，持久集合保持橙色；从 connector 点击可重新选回外交关系与贸易流，重叠拾取继续由当前 selection 优先。城市列表一次选中 `731` 个对象后共享契约截断为 `100`，运行时为 `multi-object highlight (100)`、selection 构建 `0ms`、绘制约 `0.2ms`；清除后摘要校验仍为 `f3912a5d`，`WebGL error = 0`。复合回归同步确认精确 `100` connector 为 `600` 个 GPU 顶点、`100` 个拾取候选、构建约 `0.761ms`；浏览器 error 为 `0`，health 无 error，只有既有地图生成阶段 long-task 警告。

119. 持久高亮共享契约与编辑生命周期。`已完成`
   - 目标：消除运行时 API、面板和备注列表各自维护支持类型与对象校正逻辑的分叉，并保证对象编辑、撤销和重做后高亮摘要不会陈旧。
   - 边界：只收束持久高亮的类型、解析、去重、上限与生命周期；不改变单对象闪烁、当前 selection、地图 checksum 或 `EditHistory` 语义。
   - 完成记录：新增 `runtime/persistent-highlights.js`，集中 16 类对象、100 对象上限、resolver 校正与稳定 key 去重；控制台 API、公共面板高亮动作和备注目标过滤复用同一契约。任意成功编辑、撤销或重做在完成地图与面板刷新后都会重新解析现有高亮，更新重命名摘要、合并重复项并清除已删除对象；新增 `pnpm run regress:persistent-highlight-contract` 固化类型范围、无效目标过滤、去重、重命名刷新与删除清理。

120. 高亮生命周期真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时，跨城市、测量对象和复合关系验证重命名、删除、撤销、重做后的高亮数量、摘要、视觉、checksum 与错误状态。
   - 边界：与第 118 步合并到阶段末浏览器验收；继续复用既有浏览器与开发服务器，不新开或重启 Chrome，不持续刷新，没有现成 FMG 页面时保留待验收状态。
   - 完成记录：城市 `#12` 在高亮 `1` 时由“景驿”改名为“景驿验收”，撤销 / 重做后行名、`city#12` 历史摘要和高亮数量同步；临时测量对象 `measurement-1` 在高亮 `1` 时重命名保持高亮，删除后对象与高亮都清为 `0`，撤销恢复对象、重做再次删除。复合关系首轮验收发现 `pack.states` 与独立 `politics.states` 镜像不同步，已在外交命令中补最小镜像同步和执行 / 撤销 / 重做回归；生产页复验“越部盟 -> 邢国”由猜疑改为友好后列表、详情、历史与高亮同步，撤销 / 重做稳定。关系编辑 checksum `3c19d328 -> 13050c90`，撤销恢复 `3c19d328`；`WebGL error = 0`，浏览器无 error，health 无 error，仅有 React DevTools 扩展 long-task warning。

121. 编辑命令领域与影响目标契约收尾第一刀。`已完成`
   - 目标：补齐仍未进入历史诊断的高度笔刷领域，并让名称库命令从只有通用刷新 effects 提升为可解释的对象 / 系统目标。
   - 边界：不改变名称库数据格式、生成算法、高度笔刷数值或撤销语义；只补 `domain / effects.affected` 与确定性回归。
   - 完成记录：高度笔刷新增 `domain: "height"`；名称库新增 / 复制先声明 `namebase#new`，执行后回写真实 id，重命名、样本、参数、综合更新和删除声明具体 `namebase#id`，绑定、导入和清空以 `derived-system` 说明批量原因。新增 `pnpm run regress:edit-command-affected`，通过真实 `EditHistory` 执行、撤销和重做固化动态 id、历史 `lastDomain / lastAffected` 与高度 grid / pack 同步恢复。

122. 编辑命令历史摘要真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时确认名称库新增 / 重命名与高度笔刷后，面板标题栏历史摘要显示真实领域和影响目标，撤销 / 重做后的摘要保持一致。
   - 边界：与第 118 / 120 步合并到阶段末浏览器验收；不为单独验证而新开页面、重启 Chrome 或启动额外开发服务器。
   - 完成记录：真实页面首验确认运行时已有 `@domain [affected]`，但标题栏只显示命令名；已让 `PanelManager` 复用 `formatHistoryCommand()`。复验名称库新增标题为 `新建用户名称库 @namebase [namebase#user-namebase-1]`，重命名、撤销与重做均保持同一真实 id；高度短抬升影响 `9 cells`，标题为 `高度笔刷 9 cells @height [derived-system#height-brush, grid-cells#9]`，撤销 / 重做摘要稳定。最终撤销恢复现场，checksum 保持 `f3912a5d`，`WebGL error = 0`，浏览器无 error。

123. 集合编辑命令真实影响目标回写。`已完成`
   - 目标：继续消除历史执行后的集合级 `all`，让名称库导入 / 清空和外交重生成展示实际受影响对象。
   - 边界：命令创建时仍允许用 `new / all` 表达尚未知的目标；只有成功执行后的 `lastAffected` 必须回写真实 id，不改变导入、清空或外交生成算法。
   - 完成记录：名称库命令工厂会比较执行前后用户库快照，导入只记录新增 / 替换 / 删除的库 id，清空记录实际移除的库 id；外交重生成在生成完成后记录所有未移除的有效国家 id，不再保留 `diplomacy#all`。既有 `regress:edit-command-affected` 已扩展为覆盖导入 `imported-import-a`、清空两个真实库以及外交 `state#1 / state#3`。

124. 集合 affected 历史摘要真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时确认名称库导入 / 清空和外交重生成后的标题栏历史摘要显示真实对象并正确折叠 `+N`，撤销 / 重做摘要稳定。
   - 边界：继续与第 118 / 120 / 122 步合并到阶段末浏览器验收；不新开或重启 Chrome，不启动额外开发服务器。
   - 完成记录：用户允许新开标签页后，在系统 Chrome 新页导入 4 个临时名称库；导入与清空均返回系统目标加 4 个真实 `namebase` id，标题折叠为前三项与 `+2`。首轮发现通用 API 撤销没有刷新名称库面板，最小把已打开的名称库面板加入统一对象面板刷新，并增加浏览器回归；复验导入 / 清空的撤销与重做标题均稳定。外交重生成返回系统目标加 20 个国家，标题显示 `+18`，撤销 / 重做稳定。最终用户库为 0、外交已撤销，checksum 保持 `ae3b83a5`，`WebGL error = 0`，console / page / health error 均为 0。

125. 重生成真实对象目标与摘要负载收口。`已完成`
   - 目标：让国家、省份、路线、河流和城市重生成的刷新诊断摆脱 `kind#all`，同时避免数百个真实 id 形成巨量运行时文本。
   - 边界：不把这些既有重生成入口改造成可撤销命令，不改变生成算法、盐值或刷新层；只收束 affected 提取与摘要表现。
   - 完成记录：`edit-command-effects.js` 新增 `collectionAffected()`，统一过滤空项、已移除对象、重复 id 和可选的中立 id；五类重生成现在按生成后的国家、省份、城市、路线与河流集合写入真实对象目标。`formatAffectedTargets()` 提升为运行时共享格式，刷新调度和标题栏历史 UI 都只显示前 3 项与 `+N`；完整数组只在本次调度中消费，持久诊断状态由下一步的有界结构承接。新增 `pnpm run regress:affected-summary` 覆盖集合过滤、共享格式与刷新摘要。

126. 重生成 affected 真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时执行一类小范围重生成，确认 runtime `lastEditRefresh.affected` 显示前三项与 `+N`，对象面板、selection、WebGL / console / page / health 正常。
   - 边界：继续合并到阶段末浏览器验收；只使用现成 FMG 页面与服务器，不新开或重启 Chrome，不持续刷新。
   - 完成记录：用户明确允许新开标签页后，复用既有 `5410` 服务器在系统 Chrome 新页执行一次道路重生成；道路保持 `589 -> 589`，`lastEditRefresh.affected` 为 `derived-system#routes, route#0, route#1 +587`，总量 `590`、预览 3 项、类型计数为系统 1 / 路线 589。selection / editing / highlights 均为空，checksum 保持 `1244231e`，道路三角形 `11514 -> 11562`，`WebGL error = 0`，console / page / health error 均为 0。

127. 刷新 affected 有界结构化诊断。`已完成`
   - 目标：让 API / Pinia 消费者在不接收完整大数组的前提下，机器可读地获得 affected 总量、类型分布和预览。
   - 边界：`lastEditRefresh` 不保存完整目标数组；完整数组只参与调度当次的刷新决策与摘要计算，持久状态必须保持常量级预览。
   - 完成记录：新增 `summarizeAffectedTargets()`，返回 `text / count / preview / kinds`；刷新调度在既有 `affected` 折叠文本之外新增 `affectedCount / affectedPreview / affectedKinds`。1001 个目标的回归摘要只保留 3 项预览和 2 类计数，序列化体积为 239 字节。

128. 有界刷新诊断真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时，通过 `api.info.runtimeStats()` 确认重生成后的 `lastEditRefresh` 同时返回折叠文本、正确总数、前三项预览和 kind 计数，且无巨量控制台输出。
   - 边界：继续与第 126 步合并执行；不启动额外浏览器或服务器，不持续轮询 runtime stats。
   - 完成记录：首轮真实浏览器验收发现内部 `state.lastEditRefresh` 已有完整有界结构，但 `api.info.runtimeStats()` 未公开该字段；最小修复把 `lastEditRefresh` 快照加入 runtime stats，并在 API capabilities 回归中固化字段存在性。复验道路重生成后 API 返回折叠文本 `derived-system#routes, route#0, route#1 +587`、总量 `590`、3 项 preview 和系统 1 / 路线 589 类型计数；selection 为空，checksum 保持 `a307757e`，`WebGL error = 0`，console / page / health error 均为 0，输出保持有界。

129. 历史 peek 有界 affected API。`已完成`
   - 目标：避免 `api.history.peek()` 对批量命令返回数百 / 数千个完整 affected，同时保留可机器读取的规模和类型信息。
   - 边界：小命令的 `affected` 数组保持兼容；默认预览 3 项，调用方只能通过 `affectedLimit` 在 0 到 50 内调整，不能请求无界结果。
   - 完成记录：新增纯运行时 `history-peek.js`；`peek({affectedLimit})` 返回 `affected / affectedCount / affectedKinds / affectedSummary / affectedTruncated`。1001 目标默认只返回 3 项预览，结果序列化 852 字节；`affectedLimit=5` 返回 5 项，非法上界与非对象 options 返回结构化错误。新增 `pnpm run regress:history-peek-summary`。

130. history.peek 有界输出真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时制造一条已有批量命令历史，验证默认 / 自定义 limit、截断标记、kind 计数、撤销栈切换和 checksum 语义。
   - 边界：与第 128 步合并到阶段末；只读取一次默认与一次自定义 peek，不输出完整地图对象或反复轮询。
   - 完成记录：系统 Chrome 新页执行一次外交重生成，产生 `derived-system#diplomacy-regeneration + 20 states` 共 21 项历史目标。默认 peek 只返回 3 项和 `+18`，`affectedLimit=5` 返回 5 项和 `+16`；两者都保留系统 1 / 国家 20 类型计数与 `affectedTruncated=true`。撤销后命令从 undo 转入 redo，重做后回到 undo，最终再次撤销恢复现场；checksum 全程保持 `4fd97de0`，`WebGL error = 0`，console / page / health error 均为 0。

131. 历史 stats 有界 lastAffected。`已完成`
   - 目标：让面板快照和 `api.history.get / stats` 不再复制批量命令的完整 `lastAffected`，补齐 peek 之外的另一条大输出路径。
   - 边界：`EditHistory` 内部继续保留完整数组供撤销 / 重做与命令缓存；公开统计默认 3 项、最大 50 项，小命令字段保持兼容。
   - 完成记录：`EditHistory.getStats({affectedLimit})` 返回 `lastAffected / lastAffectedCount / lastAffectedKinds / lastAffectedSummary / lastAffectedTruncated`；控制台 `get / stats` 与 app action 透传 options，`history.peek` 的嵌套 stats 使用相同 limit。1001 目标内部仍为 1001 项，公开 stats 为 3 项、389 字节；自定义 5 项和非法参数边界已进入既有 history peek 回归。

132. history.get / stats 有界输出真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时验证默认与 `affectedLimit=5` 的 get / stats、面板标题历史摘要、撤销 / 重做以及 checksum / WebGL / console / page / health。
   - 边界：与第 130 步合并执行；不请求超过 50 项，不重复转储完整 runtime snapshot。
   - 完成记录：系统 Chrome 新页执行一次外交重生成，`api.history.get / stats` 默认返回 3 项、`+18`，`affectedLimit=5` 返回 5 项、`+16`，总量 21 与系统 1 / 国家 20 类型计数一致。首轮发现面板标题只格式化截断 preview，最小修复为优先使用 `lastAffectedSummary`；复验撤销 / 重做标题均保留 `@diplomacy`、真实目标和 `+18`，按钮按既有 250ms 周期正确切换。checksum 保持 `947e9fe5`，`WebGL error = 0`，console / page / health error 均为 0。

133. 高度编辑局部整平笔刷。`已完成`
   - 目标：补充第一种真正的局部地形塑形工具，让用户能以落笔点高度为基准逐步整平山地、谷地或建设平台。
   - 边界：目标高度在每次 pointer stroke 开始时锁定，拖动中不随最近 cell 改变；继续复用现有强度、半径、中心衰减、预览、命令提交、派生标脏和撤销 / 重做，不新增独立历史类型。
   - 完成记录：新增纯运行时 `height-brush.js`，从 `app.js` 抽出抬升、降低、平滑和衰减计算；新增 `flatten` 动作，按 `min(高度差, 强度 × 衰减)` 向落笔起点高度渐进靠拢。高度面板增加“整平”第四段和说明；无实际高度变化的中心 / 边缘 cell 不再计入预览与最终命令。新增 `pnpm run regress:height-brush`，覆盖目标锁定、连续拖动、衰减边缘、旧动作兼容及 grid / pack 撤销重做。

134. 整平笔刷真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时验证四段动作布局、整平说明、落笔目标锁定、拖动预览、影响数、撤销 / 重做、待派生摘要与 WebGL / console / page / health。
   - 边界：只执行一条短 stroke，不持续拖动或刷新；继续复用现成页面和服务器，不新开或重启 Chrome。
   - 完成记录：首轮真实页面检查发现通用 segmented 选择器优先级覆盖四列布局，最小修复后核心“抬升 / 降低 / 平滑 / 整平”按四列显示。一次短整平 stroke 从高度 25 的 cell 落笔并拖到高度 37 的 cell，目标全程锁定为 25，终点渐进到 33，共影响 19 cells；面板显示 12 项待派生。撤销恢复 37，重做恢复 33，最终撤销并停止编辑；checksum 保持 `7075c7e3`，`WebGL error = 0`，console / page / health error 均为 0。

135. 高度基础派生顺序重算入口。`已完成`
   - 目标：让高度编辑后的基础地理依赖能在同一面板按正确拓扑一次重算，不要求用户在生成面板手工猜河流、城镇和政治的顺序。
   - 边界：固定执行 `rivers -> states`；河流步骤同步刷新生物群系和道路，国家步骤同步刷新省份、城镇和道路。任一步返回未执行时立即停止，不继续依赖失败数据；宗教、标记、地区、军事、经济和外交仍保留待派生。
   - 完成记录：新增纯运行时 `height-derived-rebuild.js`，统一 `createRegenerationResult()` 的显式 `executed` 字段和高度基础派生顺序 / 短路；高度面板新增“重算基础派生”，操作区改为 2 × 2。新增 `pnpm run regress:height-derived-rebuild`，覆盖完整成功、河流失败短路和国家失败部分完成。

136. 高度基础派生真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时，完成一次短整平后点击“重算基础派生”，确认执行顺序、对象计数、待派生从基础系统中清除、按钮布局和 WebGL / console / page / health。
   - 边界：只执行一次组合重算，不连续点击；继续复用现成页面和服务器，不新开或重启 Chrome。
   - 完成记录：浏览器子智能体复用既有 `127.0.0.1:5410` 页面且没有刷新；本轮没有重复执行整平，只执行一次基础重算。河流 `297 -> 259`、道路 `540 -> 532`，随后国家 `20 -> 20`、省份 `223 -> 192`、道路 `532 -> 567`，待派生 `9 项 -> 6 项`；按钮唯一、完整成功状态可见，console error 为 `0`。

137. 高度下游派生顺序重算入口。`已完成`
   - 目标：在基础派生完成后，从高度面板继续按已经实现的依赖链收口剩余下游系统，不要求用户逐个打开生成面板。
   - 边界：固定执行 `religions -> markers / economy -> diplomacy -> military -> zones`；任一步返回 `executed=false` 时立即短路。文化不在这条下游重算顺序中，本步不宣称重建或修改文化。
   - 完成记录：高度面板新增“重算下游派生”；受约束重算增加 `religions / military / zones` 及常见 API 别名，API 返回显式 `executed` 和宗教、军团、地区、经济交易前后摘要。宗教重算同步 pack / grid / 城镇与政治宗教引用，军事和地区按当前上游上下文重建；所有重算刷新后会清理已经失效的持久对象高亮。下游顺序回归已并入 `regress:height-derived-rebuild`，覆盖完整成功、资源点失败和军事失败短路。

138. 高度下游派生真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面存在时只执行一次“重算下游派生”，确认宗教、资源点 / 经济、外交、军事、地区顺序、`executed`、对象计数、待派生摘要和 WebGL / console / page / health。
   - 边界：与第 136 步集中在阶段末验收；不循环点击、不持续刷新，不新开或重启 Chrome，不启动新的开发服务器。
   - 完成记录：同一页面只执行一次下游重算，状态严格显示宗教、资源点 / 经济、外交、军事、地区完整成功链；宗教 `18 -> 18`、资源点 `6 -> 10`、资源潜力 `84 -> 134`、外交关系 `190 -> 190`、战争 `0 -> 0`、军团 `97 -> 98`、地区 `3 -> 3`，待派生最终为“无”。console error 为 `0`；隔离页面作用域不能读取 `glError` 和单独经济交易数，health 的 7 条 long-task / input-stall warn 均指向 React DevTools extension installHook URL，按实际证据保留而不误报为零。

139. 高度局部扰动笔刷。`已完成`
   - 目标：参考原版高度编辑器的 Disrupt 工具，为平滑地形补充可控的局部随机起伏，方便制作崎岖山地、丘陵和不规则海床。
   - 边界：扰动必须在同一 stroke 内可复现并进入既有高度命令、撤销 / 重做和派生标脏链路；不使用无界随机日志，不新增独立历史类型。
   - 完成记录：`height-brush.js` 新增 `disrupt` 动作，以 stroke seed、迭代序号和 grid cell 生成稳定有符号扰动；连续 pointer 事件会推进迭代，同一输入仍可由回归复现。面板动作增加“扰动”及说明，运行时编辑器快照公开当前动作、范围、半径、强度和衰减。

140. 高度笔刷地形范围限制。`已完成`
   - 目标：增加“全部 / 仅陆地 / 仅水域”范围，让抬升、降低、平滑、整平和扰动可以避开不希望修改的另一类地形。
   - 边界：陆地按海平面高度 `20` 判断；同一 stroke 以 cell 首次修改前高度判断范围，避免跨越海平面后半途失去或获得资格。
   - 完成记录：高度面板增加原生可见的三段范围按钮，wrapper 的 `getBrush()` 统一返回 `scope`；五种动作在收集候选 cell 时复用同一范围过滤。动作与范围最终使用真实 button，而不是依赖 Element Plus 隐藏 radio / bridge，键盘与浏览器控制都可直接触发。高度笔刷回归新增扰动复现、正负变化、陆水排除和陆地 cell 跨海平面后继续 stroke 的断言。

141. 扰动与范围限制真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面中只执行一条短扰动 stroke，确认五种动作、三种范围、影响数、撤销 / 重做、待派生摘要和 WebGL / console / page / health。
   - 边界：验收集中在阶段末；不持续拖动或刷新，不新开或重启 Chrome，不启动新的开发服务器。
   - 完成记录：浏览器子智能体复用既有 `127.0.0.1:5410` 页面，原生动作 5 项和范围 3 项均唯一可点击；选择 `disrupt + land` 后有限快照为半径 `28`、强度 `4`、中心衰减开启。一条短 stroke 影响 `10` cells，高度 `484 米 - 1,849 米`、均变 `+3,283 米`，待派生 `12` 项，历史 `1 / 0`；撤销为 `0 / 1`，重做恢复 `1 / 0`。稳定态截图确认地图完整，无大片黑区；console error 为 `0`，仅有一条来自 React DevTools hook 的 long-task warn。隔离控制面未提供 `glError`，不误记为零。

142. 高度连通域锥形填充工具。`已完成`
   - 目标：参考原版 Fill 工具，单击等高陆地区域或封闭水域后，按区域边缘距离生成中心更高的锥形 / 岛屿地貌。
   - 边界：陆地按可调“高度容差”收集落点附近的近似等高连通带，默认 `±6`、范围 `0..12`；水域收集高度 `< 20` 的连通水体，若触及 grid 边界则视为开放海域并拒绝填充。少于 3 cells 或超过 `min(5000, grid cells × 20%)` 安全上限的区域不执行。
   - 交互：Fill 是单击工具，同一次 pointer stroke 最多执行一次；半径和中心衰减不参与，强度控制峰值增量，高度容差控制陆地带宽，范围限制继续决定落点是否可操作。
   - 完成记录：`height-brush.js` 新增连通域 BFS 与从区域边缘出发的多源距离 BFS，边缘至少抬升 1、中心按 `强度 × 3` 形成峰值，且不会降低容差带内原本更高的 cell；封闭水域以海平面 `20` 为坡脚。真实浏览器证明完全同高与固定 `±1` 在当前连续高度网格上都过于稀疏，因此增加显式高度容差，避免继续硬编码放宽。缺少邻接 / 边界标记、开放水域、过小 / 过大区域和范围不匹配都会拒绝并写入面板提示。Fill 只在 pointerdown 执行一次，隐藏无效的半径与中心衰减控件；结果继续复用高度命令、grid / pack 同步与派生标脏。

143. 锥形填充真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面中选择 Fill，只单击一次符合范围的连通域，确认影响数、高度变化、撤销 / 重做、待派生摘要和稳定态地图显示。
   - 边界：阶段末集中执行；不尝试开放海域破坏性填充，不持续点击或刷新，不新开或重启 Chrome，不启动新的开发服务器。
   - 完成记录：浏览器子智能体复用既有 `5410` 页面，没有刷新、新开页面或启动 Chrome / 服务器 / Playwright；在 `fill + all`、强度 `4`、容差 `6` 下，第一个内陆候选预检为 `65 cells（陆地高度 80±6）`。只点击一次后实际锥形填充 `43 cells`；预检数包含完整连通候选，实际数会过滤无需变化或原本更高的 cells，因此差异符合设计。高度范围变为 `3,969..5,476 米`、平均变化 `+142 米`、待派生 `12` 项；撤销 / 重做各一次后历史为 `undo 1 / redo 0`，地图稳定完整且 console error 为 `0`。

144. 高度两点线段山脊 / 沟槽工具。`已完成`
   - 目标：参考原版 Line 工具，通过两次点击选择起点和终点，在直线附近按可调宽度与 signed power 生成山脊或沟槽。
   - 计算：使用 grid cell 到有限线段的最短距离选区；正 power 抬升、负 power 降低，中心衰减控制横向剖面，陆水范围继续按修改前高度过滤。
   - 交互：第一次点击只记录起点并显示跟随指针的预览线，第二次点击才生成一个高度命令；切换动作、停用编辑或加载新地图必须取消未完成起点。
   - 安全：同点 / 过短线段、power 为 0、没有命中 cell 或超过 `min(5000, grid cells × 20%)` 的选区均不执行，并给出有限中文提示。
   - 完成记录：新增 `getHeightLineChanges()`，按 cell 到有限线段的最短距离、线宽、signed power、横向衰减和陆水范围生成变化；正值抬升、负值降低。面板新增“线段”、线宽 `2..48` 和增量 `-30..30`；第一次点击显示带端点的预览线，第二次点击提交“线段山脊 / 沟槽”高度命令。未完成起点会在动作切换、停用高度编辑、进入国家 / 省份 / 城市 / marker 编辑、加载地图、历史操作或派生重算前清理。回归覆盖山脊、沟槽、宽度衰减、范围、零值、短线、超限及 grid / pack 撤销重做。

145. 两点线段工具真实浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面中选择 Line，设置一条短正 power 线段，确认起点提示、预览线、第二点提交、影响数、撤销 / 重做、待派生摘要和稳定态地图；不再追加第三条线。
   - 边界：浏览器验收集中到阶段末，不刷新、不新开或重启 Chrome，不启动新的服务器或 Playwright。
   - 完成记录：浏览器子智能体复用既有 `5410` 页面；动作唯一 7 项。`line + all` 下只显示线宽 `12`、增量 `12` 和中心衰减。晋邦联内短线首击显示起点提示和可见预览，第二击生成山脊 `9` cells，预览清除；高度 `1,764..3,481 米`、均变 `+163 米`、待派生 `12` 项。撤销 / 重做各一次后历史恢复 `undo 1 / redo 0`，稳定态地图完整、console error 为 `0`，仅一条来自 React DevTools hook 的 long-task warn；隔离控制面未取得独立 `glError`。

146. Fill 落点预检与候选提示。`已完成`
   - 目标：在单击修改地图前，随指针显示当前 grid cell 的可填候选数和拒绝原因，解决用户只能盲点后才知道“过小 / 开放 / 超限”的问题。
   - 性能边界：复用 renderer picking 获取 grid cell，只有 hover cell 变化时才执行一次连通域分析；只更新高度面板的预检字段，不重算高度统计、差值预览或 runtime 全量快照。
   - 完成记录：新增纯函数 `inspectHeightFillTarget()`，返回有界 `gridCell / startHeight / terrain / tolerance / maxCells / selectionCount / reachedBorder / valid / notice`，不暴露完整 selection。Fill hover 在候选有效时显示绿色“可填充 N cells”，无效时显示与真实点击一致的中文拒绝原因；离开 canvas、切换动作 / 编辑器、历史操作、重算或地图加载会清理预检。

147. Fill 预检引导成功路径浏览器验收。`已完成`
   - 目标：在可复用 FMG 页面中移动到预检为 valid 的位置后只点击一次，确认预检候选数与实际 affected、提示、撤销 / 重做、待派生和稳定态地图，并据此关闭第 143 步。
   - 边界：最多检查少量不同 hover cells，不持续扫图、不刷新、不启动新 Chrome / 服务器或 Playwright；成功后不再第二次填充。
   - 完成记录：首个检查的内陆 hover cell 即显示有效候选 `65 cells`，随后唯一一次点击影响 `43 cells`；高度变化、待派生摘要、撤销 / 重做和稳定态地图均通过。验收后没有执行第二次 Fill、线段或派生重算；控制会话已 finalize，FMG 标签以 handoff 保留。

148. 全局高度平滑与稳定扰动纯计算。`已完成`
   - 目标：参考原版高度编辑器的“平滑全部 / 扰动全部”，为当前 grid 提供可测试、可撤销的全局变化列表；继续遵守全部 / 仅陆地 / 仅水域范围。
   - 计算边界：平滑必须从同一份修改前快照读取自身和邻居，避免按遍历顺序污染结果；陆地 / 水域范围只使用同类邻居并夹在各自海平面一侧。扰动使用显式 seed 生成稳定噪声，不能把不可复现的 `Math.random()` 写入命令结果。
   - 完成记录：`height-brush.js` 新增 `getGlobalHeightChanges()`；全局平滑按 `(当前高度 × 3 + 邻居均值 + 1.5) / 4` 计算，整轮统一读取修改前快照。仅陆地 / 仅水域会过滤异类邻居并分别夹到 `20..100 / 0..19`；全局扰动对高度 `>=15` 的 cells 使用显式 seed 稳定噪声，同 seed 结果一致、下一 seed 形态变化。

149. 高度面板全局微调入口与历史闭环。`已完成`
   - 目标：在高度面板加入“全局平滑 / 全局扰动”入口，复用当前作用范围和高度命令、影响摘要、待派生标记、撤销 / 重做，不新增第二套历史系统。
   - 交互边界：点击前清理未完成 Line / Fill transient；无变化时给出有限提示，不产生空命令；连续全局扰动要推进 seed，但同一 seed 的纯计算必须可复现。
   - 完成记录：高度面板新增“全局平滑 / 全局扰动”双按钮，未启用高度编辑时禁用；执行时读取当前作用范围、清理 Line / Fill transient，并继续用 `createApplyHeightBrushCommand()` 提交。面板同步显示影响数、高度范围、平均变化、中文结果提示和待派生摘要；无变化不会进入历史。全局扰动 seed 在每次执行时递增，加载新地图会归零，有限编辑器快照暴露当前 seed 供验收。

150. 全局高度工具阶段末统一验收。`已完成`
   - 目标：实现和文档累积完成后，由烟测子智能体统一执行语法检查、相关回归、构建与差异检查；浏览器子智能体复用既有 FMG 页面和服务器，分别执行一次安全的全局平滑或扰动并验证影响摘要、撤销 / 重做和稳定态地图。
   - 边界：浏览器验收集中在本阶段末；不刷新、不新开或重启 Chrome，不启动新服务器；若确需 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 4 项 `node --check`、三项回归、应用构建和 `git diff --check`，全部通过。浏览器子智能体复用既有 FMG 页面，确认两个全局按钮存在；选择“仅陆地”后只执行一次全局平滑，影响 `2449 cells`，高度 `9..5,929 米`、平均变化 `+1,617 米`，待派生 `9 -> 12` 项；撤销 / 重做各一次后历史为 `undo 1 / redo 0`，地图稳定且 console error 为 `0`。页面有限状态未提供逐 cell 水域 diff，因此浏览器只证明“仅陆地”已选中；水域不变由纯回归证明。全程没有刷新、新开或启动资源，也未使用 Playwright；两个子智能体均已结束。

151. 高度区间条件变换与有界预检纯计算。`已完成`
   - 目标：参考原版条件 rescaler，为指定原始高度区间和当前陆水范围提供加、减、乘、除、指数五类变换，并在写地图前返回有界候选 / 变化摘要。
   - 计算边界：区间按修改前高度闭区间匹配；仅陆地 / 仅水域不能跨越海平面。除数为零、无效运算、非法操作数和下限高于上限必须结构化拒绝；公开预检不得暴露完整 changes。
   - 完成记录：新增 `inspectHeightRangeTransform()` 和 `getHeightRangeTransformChanges()`；预检只返回作用范围、规范化区间、运算、操作数、候选 / 变化 / 不变数量、前后高度范围、平均变化、valid 和中文 notice。加减使用整数操作数；乘算允许 `0..10`，除算要求 `(0..10]`，指数要求 `(0..2]`。仅陆地的乘除 / 指数以海平面 `20` 为基线，水域和全部以 `0` 为基线，最终继续夹在当前范围内。

152. 条件变换面板、预检与历史闭环。`已完成`
   - 目标：高度面板提供区间、运算、操作数、“预检 / 执行”入口；执行前必须先得到当前参数的有效预检，真正执行时再次按当前地图计算，并复用高度命令、摘要、派生标脏与撤销 / 重做。
   - 交互边界：修改任一条件、开始地图笔划、切换动作、历史操作或加载地图都会清理旧预检，避免把过期候选当成当前证据；无变化和非法条件不进入历史。
   - 完成记录：高度面板新增高度下限 / 上限、五类运算、动态操作数范围和“预检条件 / 执行变换”按钮。只有当前预检 `valid` 时执行按钮可用；真正执行会再次读取当前地图计算 changes，并复用 `createApplyHeightBrushCommand()`、grid / pack 同步、影响摘要、派生标脏和统一历史。修改条件 / 作用范围、开始笔划或进入既有 cancel / 历史 / 重载路径都会清理预检；执行后只保留实际结果 notice。

153. 条件变换回归与中文文档。`已完成`
   - 目标：扩展高度回归覆盖五类运算、区间 / 陆水筛选、海平面夹取、非法除法、无变化、公开预检有界性和 grid / pack 撤销重做；同步专题清单与开发日志。
   - 完成记录：高度回归已覆盖陆地乘算 `20/30/50 -> 20/25/35`、全部范围加高、水域降低夹到 `0`、陆地除算、陆地指数夹到 `100`、乘 `0` 回到陆地基线、零除数 / 倒置区间拒绝、乘 `1` 无变化、公开预检不含 changes，以及条件乘算 grid / pack 撤销重做。

154. 条件变换阶段末统一验收。`已完成`
   - 目标：累积实现完成后，由烟测子智能体统一执行语法检查、相关回归、构建和差异检查；浏览器子智能体复用既有 FMG 页面，完成一次安全预检、一次条件变换及撤销 / 重做。
   - 边界：浏览器验收集中在阶段末；不持续调参或刷新，不新开 / 重启 Chrome 或服务器；若确需 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，全部通过。浏览器补验子智能体复用既有 `5410` 页面；在仅陆地、默认 `20..100 × 0.9` 下，预检前执行按钮 disabled，唯一一次预检显示变化 `2746/3326 cells`、高度 `20..100 -> 20..92`、平均约 `-2.5`，随后执行按钮启用。唯一一次执行后摘要为“已条件乘算 2746 cells”，preview 清理且执行按钮重新 disabled；撤销 / 重做各一次成功，重做后地图稳定且 console error 为 `0`。第一名浏览器智能体长时间无回报后已中断并单独 finalize；补验会话也已 finalize。全程未刷新、新开、启动 Chrome / 服务器或使用 Playwright。

155. 条件变换地图空间预览 mesh。`已完成`
   - 目标：把条件预检的变化 cells 直接覆盖到 WebGL 地图上，升高与降低使用不同半透明颜色，用户不再只能从文字数量猜测空间分布。
   - 性能边界：完整 changes 只保留在运行时 / renderer，不进入 Vue 或有限快照；预览使用独立 world-space GPU buffer，镜头移动时不重建几何。renderer stats 只暴露 cell / 顶点 / 三角形 / 升降数量和构建耗时。
   - 完成记录：新增 `height-transform-preview-layer.js`，按 grid cell 中心与 Voronoi 顶点生成 world-space triangle fan；升高使用暖橙、降低使用冷蓝，透明度按变化绝对值有界增强。renderer 新增独立动态 buffer，在基础 surface 之后、路线 / 河流 / selection 之前半透明绘制；镜头变化只更新统一 transform。stats 仅返回 cells、raised / lowered / skipped、vertex / triangle 和 buildMs。

156. 空间预览生命周期与条件面板联动。`已完成`
   - 目标：有效预检时构建并显示空间 overlay；修改任一条件、范围、动作，开始笔划，执行 / 撤销 / 重做、派生重算或加载地图时清理，避免旧预览滞留。
   - 交互边界：文字预检与 GPU 预览来自同一份 fresh changes；执行仍再次计算当前地图，不能把旧 preview changes 直接当作命令输入。
   - 完成记录：有效预检会从当前地图重新生成 changes 并调用 `renderer.setHeightTransformPreview()`；文字摘要新增升高 / 降低数量和双色图例。修改区间、运算、操作数或作用范围会同时清理 Vue preview 与 GPU buffer；既有 action / editor / history / regenerate / load cancel 路径、开始地图笔划和执行条件变换也统一清理。renderer 空预览清理为幂等，不重复上传或 draw。

157. 空间预览回归与中文文档。`已完成`
   - 目标：补纯函数 mesh 回归，覆盖升高 / 降低颜色、polygon 扇形三角化、坏 cell 跳过和有界统计；同步高度专题清单与开发日志。
   - 完成记录：合成两个四边形 cell 的预览回归生成 `24` 顶点 / `8` 三角形，统计升高 `1`、降低 `1`、跳过坏 cell 与重复 cell `2`；顶点颜色断言分别命中暖色 / 冷色，坏地图返回空 mesh。条件预检同步断言 `raisedCount=0 / loweredCount=2`。

158. 空间预览阶段末统一验收。`已完成`
   - 目标：由烟测子智能体验证语法、条件 / preview 回归、构建和差异；浏览器子智能体复用既有 FMG 页面，只做一次预检，确认 renderer preview 统计和地图暖 / 冷图例对应 overlay，再清理预检并确认 overlay 消失。
   - 边界：本轮浏览器不真正执行第二次条件变换，避免与上一批重复改图；不刷新或重启 Chrome / 服务器，不持续预检；若确需 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 6 项 `node --check`、三项回归、生产构建和 `git diff --check`；补充 GPU 统计 UI 后又完成 3 项语法检查、构建和差异检查，全部通过。有界 `rendererPreview` 仅含 cells、raised / lowered / skipped、vertex / triangle、buildMs，不含 changes。浏览器子智能体复用既有 `5410` 页面，唯一一次有效预检为变化 `2746/3326 cells`、降低 `2746`、高度 `20..100 -> 20..92`、均变 `-2.5`；地图显示冷蓝半透明 overlay，路线 / 标签 / 边界稳定，可见 GPU 统计为 `2746 cells / 16466 triangles / 9.1 ms`。下限 `20 -> 21` 后文字、图例、GPU 统计和 overlay 全部清理，执行按钮 disabled；console error 为 `0`。HMR 曾重置页面初态，补验仅做一次必要参数纠正；没有执行地图变换、刷新、新开或启动 Chrome / 服务器 / Playwright。两个子智能体均已结束。

159. 全局平滑 / 扰动有界预检摘要。`已完成`
   - 目标：为现有全局高度变化生成与条件变换一致的有界摘要，包含作用范围、动作、seed、候选 / 变化 / 不变、升高 / 降低、前后范围和平均变化；公开对象不含 changes。
   - 计算边界：扰动预览使用下一 seed 但不提前消耗；应用时用同一 seed 在当前地图重新计算，成功后才推进 seed。全局平滑继续整轮读取同一修改前快照。
   - 完成记录：新增 `inspectGlobalHeightChanges()`，与 `getGlobalHeightChanges()` 复用同一分析路径；公开摘要仅含 action、scope、seed、候选 / 变化 / 不变、升高 / 降低、前后范围、平均变化、valid 和 notice。扰动预览使用 `globalToolSeed + 1`，重复预览保持同一形态；只有 `executeEditCommand()` 成功后才把运行时 seed 推进到预留值。

160. 全局工具预览优先交互与共享 GPU overlay。`已完成`
   - 目标：把“全局平滑 / 全局扰动”改为预览入口，复用现有暖 / 冷 world-space buffer、图例和 GPU 统计，并新增“应用全局预览”。
   - 生命周期：作用范围、条件参数、动作 / 编辑器、地图笔划、条件预检、历史、重算、加载或应用任一高度工具时，必须同时清理条件与全局 preview；两者不能在地图上叠加或相互复用旧 changes。
   - 完成记录：原“全局平滑 / 全局扰动”直接按钮改为“预览全局平滑 / 预览全局扰动”，新增“应用全局预览”；有效预览复用现有暖 / 冷 world-space buffer、升降图例和 GPU 统计。应用会保存有界 preview 配置、清理 overlay，再按当前地图与预留 seed fresh 计算 changes 并进入同一高度命令。统一清理 helper 同时清空条件 / 全局 UI preview 和唯一 renderer buffer；有限编辑器快照新增有界 `globalHeightToolPreview`。

161. 全局预览回归与中文文档。`已完成`
   - 目标：扩展高度回归覆盖全局摘要有界性、平滑升降统计、扰动 seed 预览一致性、深水不变和全局命令 grid / pack 历史；同步专题清单与开发日志。
   - 完成记录：合成全局平滑预检为候选 / 变化 `5/5`、升高 `4`、降低 `1`，公开对象不含 changes；seed `23` 扰动预检为候选 `25`、变化 `18`、升高 `10`、降低 `8`，changeCount 与同 seed changes 一致，seed `24` 形态不同且深水保持。既有全局平滑 grid / pack 撤销重做继续通过。

162. 全局预览阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一验证语法、回归、构建和差异；浏览器子智能体复用现有 FMG 页面，只预览一次全局扰动，确认暖 / 冷 overlay 与 GPU 统计，再应用一次并完成撤销 / 重做。
   - 边界：不预览第二个全局工具，不持续调参或刷新，不新开 / 重启 Chrome 或服务器；若使用 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 5 项 `node --check`、三项回归、生产构建和 `git diff --check`，全部通过；有界全局 preview 不含 changes，指定 UI / 快照字段进入产物。浏览器子智能体复用既有 `5410` 页面，仅陆地范围下只预览一次全局扰动：变化 `2428/3326 cells`、不变 `898`、升高 `1678`、降低 `750`、高度 `20..100 -> 20..100`、均变 `+0.7`，GPU 为 `2428 cells / 14584 triangles / 8 ms`，暖橙 / 冷蓝 overlay 同时出现且地图稳定。唯一一次应用后摘要“已全局扰动 2428 cells”，preview / 图例 / GPU / overlay 全清，影响高度 `4..5,625 米`、均变 `+1,379 米`、待派生 `12` 项；撤销 / 重做各一次后历史恢复 `undo 1 / redo 0`，console error 为 `0`，仅一条 React DevTools extension long-task warn。可见 UI 未单列 seed 且未使用 Playwright，因此 seed 数值推进由源码和回归证明，不声明为浏览器直证。全程未刷新、新开或启动 Chrome / 服务器，两个子智能体均已结束。

163. 高度区间可复用地形选区纯模型。`已完成`
   - 目标：按当前作用范围与高度闭区间锁定 grid cell id，公开摘要只返回数量、范围和边界，不暴露完整 cellIds；同一地图内可供条件变换、全局平滑和全局扰动复用。
   - 生命周期：选区在高度命令、撤销 / 重做和派生重算中保留，因为 grid identity 不变；新地图 / GEO 重建 / 完整地图导入时清除。空选区、倒置区间或缺少高度数据必须结构化拒绝。
   - 完成记录：新增 `height-cell-selection.js`，`createHeightCellSelection()` 返回内部 `Uint32Array cellIds` 与有界 summary，`inspectHeightCellSelection()` 只返回 scope、lower / upper、count、heightRange、valid 和 notice；`createHeightCellSelectionSet()` 生成运行时过滤 Set。空选区、倒置区间和缺高度会拒绝。选区只依赖 grid id，同图历史 / 重算不清除；`loadMapIntoRuntime()` 会统一清理。

164. 地形选区持久 GPU overlay。`已完成`
   - 目标：renderer 新增独立黄色半透明 world-space buffer 显示锁定 cells，并提供有界 cell / vertex / triangle / buildMs 统计；它可以与一次性暖 / 冷变化预览叠加，但二者生命周期独立。
   - 完成记录：preview layer 新增 `buildHeightCellSelectionMesh()`，使用固定黄色半透明 triangle fan；renderer 新增 `heightCellSelectionBuffer`，在基础 surface 后、暖 / 冷 transform preview 前绘制，镜头变化不重建。同步 / 异步地图加载清空 buffer；stats 只暴露 cells、skippedCells、vertex / triangle、buildMs。

165. 条件 / 全局工具“仅锁定选区”联动。`已完成`
   - 目标：高度面板提供“锁定当前区间 / 清除选区 / 工具仅作用于锁定选区”；启用后条件和全局分析先按 cellSet 限制，再计算各自候选、changes、预览与命令。
   - 安全：Vue、runtime snapshot 和 renderer stats 只暴露有界选区摘要；完整 cellIds / Set 留在运行时。清除选区会自动关闭限制开关并清除黄色 overlay。
   - 完成记录：高度区间条件分区新增“锁定当前区间 / 清除选区”和“条件 / 全局工具仅作用于锁定选区”。锁定成功默认启用限制，并显示黄色 swatch、count、heightRange 与 GPU triangle / buildMs；条件和全局分析通过内部 `allowedCells` Set 先裁剪再计算摘要 / changes。清除选区会先清理一次性变化 preview，再关闭限制、清空运行时 cellIds / Set 和黄色 buffer；有限快照只返回有界 summary / useForTools。

166. 地形选区回归与中文文档。`已完成`
   - 目标：覆盖陆水 / 区间选取、空 / 倒置拒绝、有界公开摘要、选区过滤条件 / 全局 changes、黄色 mesh、坏 cell 跳过和选区在高度撤销 / 重做后的 grid identity 稳定；同步清单与开发日志。
   - 完成记录：合成 `10/20/30/50` 高度的仅陆地 `20..30` 选区锁定 cell `1/2`，公开摘要 count `2` 且无 cellIds；空水域与倒置区间拒绝。条件乘算经选区限制后候选 `2`、变化 `1`，全局平滑限制到中心后候选 / 变化 `1/1`。两四边形黄色 mesh 为 `24` 顶点 / `8` 三角形，重复 / 坏 cell 跳过 `2`，稳定 Set 保留 grid id `1/2`。

167. 地形选区阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 FMG 页面，锁定一次陆地高度选区，确认黄色 overlay 与 GPU 统计，再启用“仅选区”预览一次全局扰动并清理选区。
   - 边界：本轮浏览器不应用地图变化，避免连续全图命令；不持续改区间或刷新，不新开 / 重启 Chrome 或服务器；若使用 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 7 项 `node --check`、高度笔刷 / 编辑命令 affected / affected 摘要三项回归、生产构建和 `git diff --check`，全部通过；有界公开摘要、allowedCells 过滤、黄色 mesh 与生产产物字段均已覆盖。首轮浏览器验收发现摘要变化 `1356`、GPU preview `2428 cells` 不一致，追查为 `getGlobalHeightChanges()` 遗漏转发 `allowedCells`；修复后新增实际 changes 断言并补跑语法、回归、构建和差异检查，全部通过。浏览器复用既有 `5410` 页面补验：锁定仅陆地 `20..40` 得到 `1889 cells`，唯一一次全局扰动预览文字与 GPU 均为 `1356 cells`，满足 `1356 <= 1889`；升高 `958`、降低 `398`，GPU 为 `8155 triangles / 11.3 ms`，暖 / 冷变化只叠加于黄色选区。清除后选区、限制开关、黄色 overlay、依赖预览 / 图例 / GPU 统计全部消失，应用按钮 disabled，地图完整稳定，console error 为 `0`；本轮没有 render-frame-gap，仅三条 React DevTools extension URL 相关 long-task warn。全程未应用地图变化、刷新、新开或启动 Chrome / 服务器，也未使用 Playwright；两个子智能体均已结束。

168. 高度选区布尔组合纯模型。`已完成`
   - 目标：以当前作用范围和高度闭区间生成候选 band，再对已有稳定 grid ids 执行覆盖、并入、取交集和排除；返回有界前后数量、增减数量、高度范围和中文 notice，不把完整 ids 暴露给 UI。
   - 安全：交集 / 排除结果为空时结构化拒绝并保留旧选区；输入 ids 去重、排序并限制在当前 grid 范围，避免坏 id 进入 renderer 或工具过滤 Set。
   - 完成记录：`height-cell-selection.js` 新增 `composeHeightCellSelection()` 和只读 `inspectHeightCellSelectionComposition()`；四种运算统一返回 operation、scope / 区间、previous / incoming / result count、added / removed、heightRange、valid 与 notice。输入 ids 会按当前 grid 去重、排序和裁边；交集 / 排除空结果返回旧 typed ids 并明确提示使用“清除选区”。

169. 选区组合运行时与 GPU 更新。`已完成`
   - 目标：组合成功后原子替换 runtime cellIds / cellSet / summary 和黄色 GPU buffer，并继续默认启用工具限制；组合失败只更新有界提示，不破坏旧选区或依赖 preview。
   - 完成记录：运行时锁定回调接收 operation，先用旧 cellIds 计算完整组合；valid 后才清理一次性变化 preview、重建 cellSet / 黄色 GPU buffer 并原子替换 terrainSelection，失败只更新 lastNotice。组合成功继续默认开启 useForTools，有限面板与编辑器快照仍只接收 summary 和 renderer stats。

170. 高度面板四种选区组合入口。`已完成`
   - 目标：在高度区间分区提供覆盖锁定、并入区间、保留交集和排除区间四个明确动作，并显示本次组合的增减摘要；没有已有选区时只允许覆盖。
   - 完成记录：原“锁定当前区间”扩展为 2×2 的覆盖锁定、并入区间、保留交集、排除区间，清除选区独占整行；没有有效旧选区时后三项 disabled。选区卡片直接显示有界 operation notice、当前 count / heightRange 和 GPU 统计。

171. 选区组合回归与中文文档。`已完成`
   - 目标：覆盖四种运算、重复 / 坏 id、空结果拒绝、旧选区保持、有界摘要和 runtime snapshot 不泄漏 ids / Set；同步专题清单与开发日志。
   - 完成记录：合成 `10/20/30/50` 地图覆盖得到 ids `1/2`，并入水域得到 `0/1/2`，交集得到 `2`，排除得到 `1`；全量排除被拒绝并保留 `1/2`，重复 / 负数 / 越界 id 被归一。公开 composition inspect 不含 cellIds。选区模块、运行时、panel wrapper、扩展回归脚本语法、直接高度回归和 `git diff --check` 通过。

172. 选区组合阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 FMG 页面，只做一条“覆盖 -> 并入 -> 排除 -> 清除”闭环，确认 count / 增减摘要、黄色 overlay 和限制开关。
   - 边界：不预览或应用高度变化，不刷新、新开、启动 Chrome / 服务器；若使用 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，四种组合、坏 id、空结果保护、公开摘要和生产按钮均通过。可视控制通道无法可靠替换 Element Plus 数字框或点击复合滑轨，因此及时释放两轮控制会话；随后为上下限补稳定原生 range id，并由同一子智能体按 browser 插件正式语义连接复用 `5410` 页面，通过原生 input / change 事件设为 `0..100`。仅水域覆盖为 `6678 cells / 39876 triangles`；并入仅陆地后为 `10004 cells`、新增 `3326`、`59841 triangles`；排除仅陆地后回到 `6678 cells`、移除 `3326`、`39876 triangles`。限制开关全程开启，黄色 overlay 随 count 扩张 / 收缩；清除后选区摘要、GPU 统计和黄色 overlay 消失，页面 complete、画布尺寸正常、无 alert / console error。补充稳定 id 后再次执行生产构建与 `git diff --check` 通过，产物包含两个 id 和四个按钮。全程未预览或应用高度变化，未刷新、导航、新建页面或启动 Chrome / 服务器，也未使用独立 Playwright；所有验证智能体已结束。

173. 光标圆形选区纯模型。`已完成`
   - 目标：按最后一个有效 grid pick 的中心点、独立圆形半径和当前全部 / 陆地 / 水域 scope 生成候选 cell ids；返回中心、半径、count、高度范围与有界 notice。
   - 安全：缺少 points / cells、无有效 hover、坏中心 cell、空命中和超过 grid 20% / 5000 cells 上限都结构化拒绝，不把候选 ids 送入 UI。
   - 完成记录：新增 `createHeightCursorRadiusSelection()` 与只读 inspect；用 `grid.cells.p -> grid.points` 取得圆心和每个 cell 点位，按半径平方与 scope 过滤。summary 仅含 source、scope、centerCell、radius、maxCells、count、heightRange、valid 与 notice；安全上限与现有 Fill / 线段一致为 `max(64, min(5000, grid×20%))`。缺图、`null` / 坏中心、缺点位、空命中和超大候选均拒绝。

174. 通用组合摘要支持空间来源。`已完成`
   - 目标：既有 replace / union / intersect / subtract 统一接受高度 band 或光标圆形候选；summary 额外标识 source、centerCell / radius 或 lower / upper，成功与空结果保护语义不变。
   - 完成记录：`composeHeightCellSelection()` 按 source 路由 height-band / cursor-circle 候选，统一组合后摘要同时有 source 与来源专属的 lower / upper 或 centerCell / radius / maxCells；未知来源拒绝。四种 Set 运算、空结果旧选区保持、输入 ids 归一和最终 heightRange 继续复用同一路径。

175. 运行时与面板空间选区入口。`已完成`
   - 目标：高度选区分区增加“高度区间 / 光标圆形”来源和独立半径；用户把鼠标停在地图后可用原四个组合按钮更新黄色选区，运行时优先读取最后 pick，没有有效 hover 时通过 renderer picking 使用当前画布中心，不改地图 selection。
   - 边界：来源 / 半径是有限面板配置；完整候选 ids、合成 ids 与 Set 仍只留在运行时。切换来源不清除旧选区或变化 preview，只有组合成功才原子替换。
   - 完成记录：面板状态新增 terrainSelectionSource=`height-band` 与独立 terrainSelectionRadius=`48`；有限 snapshot 暴露 source / radius 和既有有界 selection，不含 ids / Set。UI 新增“当前高度区间 / 光标圆形”来源选择、`8..160` 圆形半径和操作提示；四个按钮提交同一有界 request。运行时在 cursor-circle 时优先读取 `state.pick.gridCell`，缺少有效 hover 则对 canvas 中心调用 renderer `pickClientPoint()` 并更新 pick 面板，再注入纯模型；不改变地图 selection，成功后才清 preview / 更新黄色 buffer。

176. 光标圆形选区回归与中文文档。`已完成`
   - 目标：覆盖圆心、半径边界、scope、坏 pick、空命中、超大拒绝、空间候选与四种组合、有界 inspect / snapshot；同步专题清单与开发日志。
   - 完成记录：合成一维地图中心 cell `1`、半径 `11` 命中 `0/1/2`，陆地命中 `1/2`、水域命中 `0`，半径 `1` 只命中圆心；`null` hover 拒绝。`10×10` 地图半径 `256` 超过 maxCells `64` 后拒绝。圆心 cell `3`、半径 `11` 并入旧 `1/2` 得到 `1/2/3`，公开 inspect 无 cellIds。选区模块、运行时、panel wrapper、回归脚本语法、直接高度回归和差异检查通过。

177. 光标圆形选区阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，用语义浏览器把指针停在地图，再执行一次圆形覆盖、扩大半径覆盖和清除，确认 count / GPU / 黄色 overlay 随半径变化。
   - 边界：不修改高度、不执行区间布尔、不刷新、导航、新建或启动 Chrome / 服务器；若使用独立 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：语义浏览器的隔离世界不能构造 PointerEvent，也看不到页面全局 API，相关尝试均按停机条件立即 handoff；据此补齐产品级 canvas 中心 picking 回退。最终子智能体复用同一 `5410` 页面直接操作可见 UI：光标圆形半径 `24` 覆盖得到 A=`13 cells`、圆心 `#4941`、GPU `79 triangles`；半径 `64` 覆盖得到 B=`91 cells`、同圆心、GPU `548 triangles`，满足 `B>A` 且黄色范围明显扩大。限制开关两次均保持，清除后选区摘要、开关、GPU 和黄色 overlay 消失；页面 complete、画布 `2276×1092`、console error 为 `0`。烟测子智能体随后完成 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，产物字段与回退文案齐全。全程未修改高度、刷新、导航、新建或启动 Chrome / 服务器，也未使用独立 Playwright；所有智能体已结束。

178. 两角矩形选区纯模型。`已完成`
   - 目标：按两个 world-space 角点的有向无关包围盒和当前 scope 生成 grid cell ids，返回 bounds、width / height、count、高度范围与有界 notice。
   - 安全：缺少 points / cells、坏角点、宽或高不足、空命中和超过 grid 20% / 5000 cells 上限都拒绝；候选 ids 不进入 Vue。
   - 完成记录：新增 `createHeightRectangleSelection()` 与只读 inspect；角点归一成有向无关 bounds，width / height 至少为 `1`，按 grid 点位与 scope 命中并沿用 `64..5000 / grid 20%` 上限。summary 只含 source、scope、bounds、width / height、maxCells、count、heightRange、valid 和 notice；坏点、窄矩形、空命中、缺图和超大候选均拒绝。

179. 两点框选运行时状态与轻量预览。`已完成`
   - 目标：矩形来源下点击布尔按钮进入待选模式，地图第一次点击记录起角，pointermove 显示淡黄色矩形，第二次点击完成候选组合；不执行高度笔刷或改变地图 selection。
   - 生命周期：切换动作、撤销 / 重做、开始其它全局工具、关闭高度编辑器、清除选区和地图载入都取消待选状态并移除预览 DOM。
   - 完成记录：rectangle request 先进入 `terrainSelectionBox` pending；高度 canvas capture handler 优先消费两次主按钮点击，第一次保存 world / client 起角，pointermove 更新 `.height-selection-box-preview`，第二次走通用 compose 和原子 commit，不进入笔刷或 renderer selection。`cancelHeightLine()` 统一取消 pending / preview，来源切换与清除也显式取消；成功 / 失败 / 起角都会同步有限 editor snapshot。

180. 高度面板矩形来源。`已完成`
   - 目标：“选区构造”增加矩形框选；来源选中时隐藏圆形半径并提示“先选组合、再点两个角”。组合成功后卡片显示矩形尺寸 / bounds 与 GPU 统计。
   - 边界：有限 editor snapshot 只包含 pending operation 与已选起角的舍入坐标；完整候选 / 合成 ids 和 Set 仍只存在 runtime。
   - 完成记录：“选区构造”新增“矩形框选”，隐藏圆形半径并提示先选组合再点两个角；完成卡片显示矩形 width × height、count / heightRange 与 GPU。snapshot 的 height.terrainSelectionBox 仅含 operation 和一位小数起角，selection summary 的 bounds 会深拷贝，不含 ids / Set。

181. 矩形选区回归与中文文档。`已完成`
   - 目标：覆盖角点顺序、scope、最小尺寸、坏点、空命中、超大拒绝、矩形候选组合和有界 inspect；同步专题清单与开发日志。
   - 完成记录：一维地图 `{5,-1}->{25,1}` 命中 ids `1/2`、尺寸 `20×2`，反向角点 bounds 相同，陆地命中 `1/2`、水域空拒绝；高度为 0 的窄矩形、坏起角和 `10×10` 超过 maxCells `64` 均拒绝。矩形候选并入旧 `0` 得到 `0/1/2`，公开 inspect 无 cellIds。选区模块、运行时、panel wrapper、回归脚本语法、直接高度回归和差异检查通过。

182. 矩形选区阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，选择矩形覆盖后只在 canvas 点击两个角，确认预览、count / bounds / GPU / 黄色 overlay，再清除。
   - 边界：不修改高度、不执行其它选区来源、不刷新、导航、新建或启动 Chrome / 服务器；若使用独立 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，角序 / scope / 窄矩形 / 坏点 / 超大 / 组合及产物字段均通过，仅有既有大 chunk 警告。浏览器子智能体复用同一 `5410` 页面：选择矩形覆盖后出现待选提示，第一角约 `(910,358)` 后预览 DOM 存在，移动到 `(1366,576)` 时预览约 `456×218 px`；第二角完成得到 `404 cells`、world 矩形 `288.5×191.6`、GPU `2428 triangles`，黄色 overlay 存在、限制开关保持，预览 DOM 已移除。清除后摘要、开关、GPU、黄色 overlay 和预览均消失；页面完整、画布 `2276×1092`、无 alert / console error。未执行其它选区来源、布尔、高度工具、历史、笔刷或重算，未刷新、导航、新建或启动 Chrome / 服务器；两名智能体均已结束。

183. 连通等高区选区纯模型。`已完成`
   - 目标：从中心 grid cell 沿 `grid.cells.c` BFS，选取当前 scope 内且与起点高度差不超过独立容差的连通 cells；返回中心、起点高度、容差、count / heightRange 与有界 notice。
   - 安全：缺邻接 / 高度、坏中心、scope 不匹配、空结果和超过 grid 20% / 5000 cells 上限都拒绝；候选 ids 不进入 UI。
   - 完成记录：新增 `createHeightConnectedSelection()` 与只读 inspect；从中心开始 BFS，只有当前 cell 同时匹配 scope 且 `abs(height-startHeight)<=tolerance` 才加入并继续扩张。ids 最终升序输出；summary 只含 source、scope、centerCell、startHeight、tolerance、maxCells、count、heightRange、valid 与 notice。缺邻接 / 高度、坏中心、中心 scope 不匹配和超大候选均拒绝。

184. 通用组合摘要支持连通来源。`已完成`
   - 目标：既有四种布尔组合接收 connected-height 候选，summary 增加 centerCell / startHeight / tolerance / maxCells，空结果旧选区保持和 ids 归一不分叉。
   - 完成记录：compose source 路由新增 connected-height，候选成功后与 height-band / cursor-circle / rectangle 共用 Set 运算、空结果保护、最终 heightRange 和 renderer 入口；公开摘要带 startHeight / tolerance，不暴露 BFS queue / visited / ids。

185. 运行时与面板连通来源。`已完成`
   - 目标：“选区构造”增加“连通等高区”和独立 `0..20` 容差；选择布尔动作后在地图单击一次中心，再执行组合，不改变地图 selection。
   - 边界：有限 snapshot 只增加 tolerance；完整 BFS 候选、合成 ids 和 Set 留在 runtime。来源 / 容差改变不清除旧选区，组合成功才更新黄色 GPU buffer。
   - 完成记录：面板 terrainSelectionTolerance 默认 `6`，selection request / snapshot 增加 tolerance。UI 来源新增“连通等高区”、稳定原生 input id `height-selection-tolerance` 和 `0..20` slider；卡片显示中心、起点高度±容差。连通来源点击组合按钮后进入 terrainSelectionPoint pending，canvas 下一次主按钮点击通过 renderer picking 取得精确中心并完成组合，不进入高度笔刷或对象 selection；有限 snapshot 仅含 pending operation / source。

186. 连通等高区回归与中文文档。`已完成`
   - 目标：覆盖容差 0 / 正值、scope、邻接隔离、坏中心、缺邻接、超大拒绝、连通候选组合和有界 inspect；同步专题清单与开发日志。
   - 完成记录：`5×5` 地图中心高度 `40`、内圈 `42`、外圈 `60`：容差 `0` 只选中心，容差 `2` 选内侧 `9 cells`、heightRange `40..42`；水域 scope、null 中心、缺邻接均拒绝。`10×10` 全同高连通块超过 maxCells `64` 后拒绝；连通候选并入旧 id `0` 得到 `10 cells`，公开 inspect 无 cellIds。四项语法、直接高度回归和差异检查通过。

187. 连通等高区阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，在可见陆地同一中心以容差 0 / 2 各执行“覆盖 -> 单击中心”，确认 count / heightRange / GPU / 黄色 overlay 扩张，再清除。
   - 边界：不修改高度、不执行其它来源或布尔、不刷新、导航、新建或启动 Chrome / 服务器；若使用独立 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：首轮沿用画布中心命中同高海域并触发 `2000 cells` 安全拒绝，console error 为 `0`；据此把连通来源收口为显式“组合 -> 地图单击中心”的单点 pending。原 FMG tab 消失后复用既有 Chrome 唯一 tab、只导航一次到已运行 `5410`，首次陆地补验因导航后布局尚在收敛导致同一绝对点解析为不同中心，证据边界如实保留。最终稳定页面以实时 canvas rect 的相同 `(70%,30%)` 归一位置补验：容差 `0` 与 `2` 均命中 center `#3013`；A=`2 cells`、heightRange `84..84`、GPU `11 triangles`，B=`6 cells`、heightRange `82..86`、GPU `35 triangles`，满足 `B>A` 且黄色范围扩大。清除成功，高度影响 `0`、历史 `undo 0 / redo 0`、无 console error。最终烟测完成 4 项 `node --check`、三项回归、生产构建和差异检查，单点 pending / snapshot / 产物字段均通过。未执行其它来源、布尔、高度工具、历史、笔刷或重算，未重启 Chrome / 服务器，也未使用独立 Playwright；两名智能体均已结束。

188. 画笔拖选候选纯模型。`已完成`
   - 目标：把运行时连续圆形 stamp 累积的 grid ids 归一成 paint 候选，按当前 scope 过滤并返回 radius / stampCount / count / heightRange / maxCells 有界摘要，再进入四种布尔组合。
   - 安全：坏 / 重复 / 越界 ids、空候选和超过 grid 20% / 5000 cells 上限都处理；完整候选 Set / ids 不进入 Vue。
   - 完成记录：新增 `createHeightPaintSelection()` 与只读 inspect；输入 ids 按 grid 范围去重升序、再按 scope 过滤，沿用统一 maxCells。summary 只含 source、scope、radius、stampCount、maxCells、count、heightRange、valid 与 notice。空候选、缺高度和超大候选拒绝；compose 新增 paint source 并继续共享四种 Set 运算。

189. 画笔拖选 pending / active 生命周期。`已完成`
   - 目标：画笔来源点击布尔按钮后进入 pending；canvas pointerdown 开始 stroke，pointermove 按独立半径累积 stamp，pointerup 提交，pointercancel 恢复旧选区。
   - 生命周期：来源 / 动作切换、历史、全局工具、清除、关闭编辑器和地图载入统一取消 pending / active 并恢复旧黄色 buffer，不触发高度笔刷或地图 selection。
   - 完成记录：paint 按钮先写 terrainSelectionPaintPending；canvas capture pointerdown 建立 active candidate Set / pointerId 并捕获指针，pointermove 优先累积，pointerup finish，pointercancel restore。`cancelHeightLine()`、来源切换和清除都调用统一 cancel；有限 snapshot 只暴露 active、operation、stampCount、candidateCount，不含 Set。

190. 拖中黄色 GPU 组合预览。`已完成`
   - 目标：每个新中心 stamp 后用完整候选与旧选区计算当前布尔结果，只更新 renderer 黄色 buffer 和有界 lastNotice；不改 runtime cellSet / summary，抬手 valid 后才原子 commit。
   - 性能：相同 centerCell 不重复 stamp；候选超上限后停止扩张，抬手不提交。
   - 完成记录：每个不同中心用既有 cursor-circle 模型生成一个 stamp；只有候选 Set 实际增长才递增 stampCount 和重建组合 preview。preview 直接上传 renderer selection buffer，panel 只显示有界 count / stamps / GPU notice，旧 runtime terrainSelection 不变。invalid / 超上限时恢复旧 buffer，finish 仅对最后 valid preview 调原子 commit。

191. 画笔拖选面板、回归与中文文档。`已完成`
   - 目标：“选区构造”增加画笔拖选并复用独立半径；卡片显示最终 radius / stampCount。覆盖候选归一、scope、超大拒绝、画笔组合和有界 snapshot；同步专题清单与开发日志。
   - 完成记录：来源新增“画笔拖选”，复用 height-selection-radius 并动态标为“选区笔刷半径”；帮助文案说明拖中预览 / 抬手提交，完成卡片显示 radius / stamps。合成 `[0,1,1,99,-1,2]` 归一为 `0/1/2`，land 为 `1/2`，空与 `100>64` 超大拒绝；并入旧 `3` 得到 `0/1/2/3`，公开 inspect 无 cellIds。四项语法、直接高度回归和差异检查通过。

192. 画笔拖选阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，选择画笔覆盖后只在可见陆地拖一笔，确认拖中 preview、抬手 count / stamps / GPU / 黄色 overlay 和历史零影响，再清除。
   - 边界：不修改高度、不执行其它来源或布尔、不刷新、导航、新建或启动 Chrome / 服务器；若使用独立 Playwright，必须在 `finally` 中关闭 browser / context。
   - 完成记录：烟测子智能体完成 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，候选归一 / scope / 空 / 超大 / 组合、pending / active、candidateCount / stampCount、黄色 preview 与旧 buffer 恢复路径均通过，仅有既有大 chunk 警告。browser 语义接口只支持原子 `drag({path})`，无法在 pointerdown 持续期间暂停读取 DOM；子智能体没有把 final 冒充中途 preview，拖中 preview 由源码状态分离、纯组合回归和生产产物证明。最终浏览器复用同一 `5410` 页面，在仅陆地、半径 `24` 下执行 7 点短路径，抬手锁定 `57 cells / 7 stamps / 343 triangles`，黄色 overlay / swatch 可见、限制开关开启；高度影响 `0`、历史 `0/0`、无对象编辑 selection。清除后摘要、黄色 overlay、GPU 和开关消失，console error 为 `0`，地图 / 面板稳定。未执行其它来源、布尔、高度工具、历史或重算，未刷新或重启资源；两名智能体均已结束。

193. 同图高度选区快照纯模型。`已完成`
   - 目标：把当前锁定 cell ids 与“仅作用于选区”开关暂存到运行时，后续可在继续布尔、边界调整或清除后原样恢复。
   - 安全：快照严格绑定当前 `grid.cells.h` 引用，不写 localStorage 或地图文件；换图或 grid 被替换后拒绝恢复。公开 summary 只含 count / heightRange / valid / notice，不暴露 ids 或 grid 引用。
   - 完成记录：新增 `createHeightCellSelectionSnapshot()` / `restoreHeightCellSelectionSnapshot()`；暂存时归一化、去重和排序 ids，恢复时重新校验当前 grid 范围并按当前高度重算 heightRange，同时恢复 useForTools。空当前选区、空快照和跨 grid 恢复均给出有界拒绝原因。

194. 暂存 / 恢复运行时与面板闭环。`已完成`
   - 目标：高度面板增加“暂存当前 / 恢复暂存 / 删除暂存”，清除当前选区不删除暂存，地图载入统一清除两者。
   - 生命周期：暂存、恢复和删除都会先取消矩形 / 单点 / 画笔 pending 与变化 preview；恢复仍通过统一 commit 更新黄色 GPU buffer，不产生高度命令、历史或地图对象 selection。
   - 完成记录：heightEdit 新增 terrainSelectionSaved；panel wrapper 保存有界 saved summary，并在 terrainHeightSelection snapshot 下暴露 savedSelection，不含完整 ids。恢复保留暂存时 useForTools；清除当前后仍可恢复，删除只清暂存；loadMapIntoRuntime 显式清除跨图快照。面板说明暂存只对当前 grid 有效且不进入偏好或地图文件。

195. 选区共享边扩展 / 收缩一圈。`已完成`
   - 目标：为后续边缘羽化提供明确的拓扑边界操作；扩展沿 `grid.cells.c` 加入一圈邻格，收缩移除至少有一个邻格不在选区内的边界 cell。
   - 安全：扩展新加入 cell 遵守当前陆水 scope；坏邻接、空当前选区和未知操作拒绝。收缩导致空结果时保留原选区，多圈纯模型限制在 `1..8`，UI 第一刀只执行一圈。
   - 完成记录：新增 `transformHeightCellSelection()` / inspect，返回 previousCount / count / addedCount / removedCount / heightRange 有界摘要。运行时复用统一 commit 和原 useForTools；面板新增“扩展一圈 / 收缩一圈”及共享边 / 空结果提示。

196. 快照与边界调整回归、中文文档。`已完成`
   - 目标：覆盖 ids 归一、同 grid 恢复、跨 grid 拒绝、useForTools、单圈 / 多圈扩展、收缩、空收缩保护、scope 和公开 inspect；同步专题清单与开发日志。
   - 完成记录：合成选区 `2/1/2/-1/99` 暂存为 `1/2` 并在同 grid 恢复，跨 grid 与空选区拒绝；`3×3` 中心扩展一圈得到十字 `5 cells`、两圈得到 `9 cells`，十字收缩回中心，单中心收缩为空被拒绝。land 扩展不加入左侧水格，公开 inspect 无 ids。四项语法、直接高度回归和 `git diff --check` 通过。

197. 暂存与边界调整阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，锁定局部选区后暂存，扩展 / 收缩，清除当前，再恢复并删除暂存，确认 count、黄色 GPU overlay、开关和历史零影响。
   - 边界：浏览器验收集中到阶段末；不修改高度、不刷新、导航、新建或启动 Chrome / 服务器。若使用独立 Playwright，必须在 `finally` 中关闭 browser / context；保持输出有界。
   - 完成记录：烟测子智能体完成 4 项 `node --check`、高度回归、affected 两组兼容回归、生产构建和 `git diff --check`；暂存 / 恢复 `2 cells`、扩展 `1→5`、收缩 `5→1`，生产产物包含五个新增按钮、savedSelection 和 saved / grow / shrink 路径，构建仅有既有大 chunk 警告。浏览器子智能体复用现有 `5410` 页面：初始暂存 `3326 cells / GPU 19965 triangles`；仅陆地扩展无邻格时合理不变，切到全部后扩展为 `4317`，收缩为 `3547`；清除当前后暂存摘要仍在，恢复精确回到 `3326 / 19965`，黄色 overlay 与 useForTools 同步恢复；删除后摘要消失且恢复 / 删除按钮禁用。全程高度影响 `0`、历史 `0/0`、对象 selection 不变、console error `0`、WebGL 稳定；未刷新、导航、启动或重启 Chrome / 服务器，未使用独立 Playwright，页面 handoff 保留，两名子智能体均已结束且无遗留进程。

198. 高度选区内缘羽化纯模型。`已完成`
   - 目标：从锁定 selection 的内边界沿 `grid.cells.c` 向内计算 `0..8` 圈距离，为每个选中 cell 生成 `0..1` 强度；边界最弱，向核心逐圈增强。
   - 边界：只在选区内部生成权重，不扩张或移除 ids；0 圈全部为 1。缺邻接 / 高度和空选区拒绝；全图或没有可识别内边界时保守使用完整强度。公开 inspect 不暴露 Map。
   - 完成记录：新增 `createHeightCellSelectionFeather()` / inspect。N 圈内第 d 圈权重为 `(d+1)/(N+1)`，未落入过渡带的核心为 1；summary 只含 rings / count / boundaryCount / featheredCount / coreCount / weightRange / valid / notice。

199. 条件与全局高度工具消费羽化权重。`已完成`
   - 目标：既有 allowedCells 同时兼容 Set 硬选区与 Map 权重；条件加减乘除指数、全局平滑和稳定扰动先算完整目标，再以 `before + (fullAfter-before)*weight` 插值并执行原陆水 clamp。
   - 边界：selectionWeight<=0 不进入候选，Set 路径保持旧行为；公开预检增加 selectionFeathered / selectionWeightRange，不暴露 Map 或完整 weights。
   - 完成记录：两类分析器共享 allowedCellWeight / summarizeAllowedCells；硬选区现有回归保持不变。羽化预检 notice 显示权重范围，整数高度仍走统一 round / scope clamp，无变化 cell 不虚增命令目标。

200. 羽化运行时、暂存与面板闭环。`已完成`
   - 目标：面板增加“选区内缘羽化圈数”0..8；当前选区实时重建权重和黄色 overlay，条件 / 全局工具打开限制时读取权重 Map。暂存 / 恢复同时保存圈数。
   - 生命周期：换图重置为 0；组合、扩展、收缩和恢复后统一重算；画笔拖中 preview 使用当前圈数但仍不提交 runtime selection。修改圈数只清变化 preview，不产生高度命令、历史或对象 selection。
   - 完成记录：heightEdit 新增 terrainSelectionFeather；正式 terrainSelection 保存 featherWeights / featherRings / 有界 feather summary。heightToolAllowedCells 在圈数大于 0 时返回 Map，否则仍返回 Set。快照增加 featherRings，恢复同步 panel 配置与 useForTools。

201. 黄色 GPU overlay 羽化可视化。`已完成`
   - 目标：黄色持久选区与工具强度使用同一权重；边界降低 alpha，核心保持原黄色，renderer stats 暴露 featheredCells / minWeight 供 UI 和浏览器验收。
   - 完成记录：buildHeightCellSelectionMesh 接收可选 Map；weight 1 保持 alpha 0.28，软边 alpha 为 `0.08 + weight*0.2`。renderer setter 转发 weights，卡片显示羽化圈数、过渡 cells、渐变 GPU cells 与最低权重；无 Map 的旧调用保持硬边。

202. 羽化回归与中文文档。`已完成`
   - 目标：覆盖 0 / 1 / 2 圈权重、边界 / 核心、条件变换、全局平滑、overlay alpha / stats、暂存圈数与有界 inspect；同步专题清单和开发日志。
   - 完成记录：`5×5` 地图内侧 `3×3` 选区：0 圈全 1；1 圈边界 8 cells 权重 0.5、中心 1；2 圈边界 1/3、中心 2/3。条件加 12 后边界 `40→46`、中心 `40→52`；全局平滑中心按 2/3 从 `80→70`。overlay 合成权重 0.25 / 1 时 featheredCells=1、minWeight=0.25 且边缘 alpha 更低。暂存 / 恢复保留 3 圈；公开 inspect 无 weights。相关语法、直接高度回归和 `git diff --check` 通过。

203. 选区羽化阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，在已有局部选区上对比 0 圈与正数圈的黄色渐变 stats，并对同一条件变换执行两次只读预检，确认羽化权重范围 / 均变降低且不提交高度。
   - 边界：浏览器验收集中到阶段末；不应用条件或全局变化，不修改高度，不刷新、导航、新建或启动 Chrome / 服务器。若使用独立 Playwright，必须在 `finally` 中关闭 browser / context；保持输出有界。
   - 完成记录：烟测子智能体完成 7 项 `node --check`、高度回归、两项 affected 兼容回归、生产构建和 `git diff --check`，全部通过；0 / 1 / 2 圈、条件 `40→46/52`、全局 `80→70`、overlay alpha / stats 与暂存 3 圈均被覆盖，构建只有既有大 chunk 警告。浏览器子智能体复用现有 `5410` 页面：硬边 `3326 cells / GPU 19965`，同参条件预检为 `2746/3326`、均变 `-2.5`；切到 3 圈后 count / triangles 不变，过渡 / 渐变 `2273 cells`、核心 `1053`、minWeight `0.25`，黄色边缘可见变淡；同参预检为 `1998/3326`、均变 `-2.4`，notice 含权重 `0.25..1`，未执行变换。暂存摘要为 `3326 / 3圈`，清除当前后恢复到相同 count、渐变统计、minWeight 和 useForTools；高度影响 `0`、历史 `0/0`。控制会话随后因定位控件超时被中断并 finalize，最终 console error、对象 selection / editing 与 WebGL health 没有取得新的收口证据，不能宣称已复核；补充智能体只确认现有 FMG `5410` 标签仍在并释放会话。全程未刷新、导航、启动 / 重启 Chrome / 服务器或使用 Playwright，未应用高度变化；所有验证智能体已结束。

204. 选区地形模板纯引擎。`已完成`
   - 目标：参考原项目 Hill / Pit / Range / Trough 等模板步骤思想，在当前应用建立确定性、可预览的模板预设第一刀，而不是直接执行原项目全图生成器。
   - 预设：高原塑形向目标高度收束并保留少量邻域起伏；盆地塑形向较低目标收束；阶地量化按固定高度间隔吸附；破碎地形按稳定 seed 叠加连续局部噪声。
   - 边界：四种模板都必须有锁定选区；读取当前 scope 和选区羽化 Map / Set。纯模型只返回 changes 给内部调用，公开 inspect 只含模板、参数、候选 / 变化数、升降数、高度范围、均变、权重范围和 notice。
   - 完成记录：新增 `height-terrain-templates.js`、四个只读 preset、get / inspect、label 和 usesSeed。所有模板先计算完整目标，再按 intensity × selectionWeight 插值并走统一整数高度与陆水 clamp；破碎噪声按 gridCell / seed 稳定，邻居噪声混入 28% 保持局部连续。

205. 模板运行时预览、应用与历史。`已完成`
   - 目标：模板预览复用既有暖 / 冷 height transform GPU buffer；应用前按预留参数和当前选区重新验证，生成统一高度命令，支持撤销 / 重做和派生过期标记。
   - 生命周期：参数、scope、选区、编辑动作和地图载入都会清预览；破碎模板只有命令成功后推进 terrainTemplateSeed，失败或只预览不消耗。模板始终使用锁定选区，不依赖“条件 / 全局工具”限制开关。
   - 完成记录：runtime 新增 preview / apply / change callbacks 和 terrainTemplateSeed。apply 保存有界 preview 配置后重新计算 changes，通过 createApplyHeightBrushCommand / executeEditCommand 进入 `height` domain；lastAffected / lastHeight / lastDelta / notice 与其它高度工具一致。

206. 高度面板模板配置与有限快照。`已完成`
   - 目标：面板增加模板预设、强度和预设专属参数，必须先预览再应用；显示升高 / 降低、GPU 和有界 notice。
   - 完成记录：新增“选区地形模板”分区和稳定 input id `height-terrain-template`。强度为 `0.1..1`；高原 / 盆地显示目标高度，阶地显示 `2..25` 间隔，破碎显示 `1..30` 幅度。panel wrapper 提供 get / preview / snapshot，有限 editor snapshot 新增 terrainHeightTemplate，不含 changes、选区 ids 或权重 Map。

207. 模板纯回归与中文文档。`已完成`
   - 目标：覆盖四预设注册、无选区拒绝、选区羽化、参数结果、seed、公开 inspect 和高度命令撤销重做；同步专题清单与开发日志。
   - 完成记录：`3×3` 合成地图中心选区：高原目标 80 / 强度 1 为 `40→69`，0.5 选区权重后为 `40→55`；盆地 `60→34`，阶地间隔 10 为 `43→40`。破碎模板相同 seed 结果相同、不同 seed 形态不同；高原应用后 grid / pack 同步，撤销恢复 40、重做恢复 69，历史 domain 为 height。公开 inspect 无 changes；相关语法、直接高度回归和 `git diff --check` 通过。

208. 选区地形模板阶段末统一验收。`已完成`
   - 目标：烟测子智能体统一跑语法、回归、构建和差异；浏览器子智能体复用现有 `5410` 页面，在局部锁定选区上分别预览一个收束模板和破碎模板，确认参数、GPU、升降统计、稳定 seed、未应用时高度 / 历史零影响；再只应用一次收束模板并验证撤销 / 重做。
   - 边界：浏览器验收集中到阶段末；不刷新、导航、新建或启动 Chrome / 服务器。只应用一次有界模板，不触发其它高度工具或派生重算；若使用独立 Playwright，必须在 `finally` 中关闭 browser / context；保持输出有界。
   - 完成记录：该步骤由追加批准的单一最小任务统一承接。语法、高度回归、affected 兼容回归、生产构建和差异检查通过；生产页面完成高原与破碎地形预览、破碎稳定性复核，以及高原模板一次应用和撤销 / 重做。详细证据以下方追加批准项为准。

### 2026-07-13 用户批准的封闭任务清单

1. 高度选区内缘羽化与工具权重联动。`已完成`
   - 最小验收：0 圈权重全部为 1；1 / 2 圈按共享边距离形成可预测渐变；选区 cell 不增不减；条件变换、全局平滑和扰动按相同权重插值。
   - 验证结果：相关三项 `node --check` 通过；`pnpm run regress:height-brush` 通过。1 圈边界权重为 `0.5`，2 圈权重范围为 `0.333..0.667`；条件加高得到 `40→46/52`，全局平滑中心得到 `80→70`。
2. 羽化运行时、面板、暂存与 GPU 可视化闭环。`已完成`
   - 最小验收：面板支持 `0..8` 圈；组合、扩缩、暂存恢复和换图生命周期正确；黄色 overlay 边缘透明度渐变；GPU 统计准确；不产生高度修改或历史记录。
   - 验证结果：运行时、面板 wrapper 和 renderer 三项 `node --check` 通过；编辑命令 affected 与摘要兼容回归通过；`pnpm run build:app` 通过。高度回归确认暂存 / 恢复保留 3 圈，合成 GPU mesh 的 `featheredCells=1 / minWeight=0.25`；既有真实页面记录确认调整羽化与恢复选区时高度影响和历史均为 `0`。
3. 选区羽化阶段末完整验收。`已完成`
   - 最小验收：语法、回归、构建和差异检查通过；生产浏览器对比硬边与羽化；高度与历史不变；console / page error 为 0，WebGL health 正常，对象 selection / editing 不受影响。
   - 验证结果：生产页面硬边选区为 `3428 cells / GPU 20580 triangles`，同参条件预检为 `3428/3428`、均变 `-3.5`；切到 3 圈后选区数量与 triangles 不变，过渡 / 渐变 `2025 cells`、最低权重 `0.25`，同参预检为 `2783/3428`、均变 `-3.1`、权重 `0.25..1`。全程影响 `0`、历史 `undo 0 / redo 0`，无对象详情或对象选择面板；清除选区并停止高度编辑后仍为历史 `0/0`。普通页与 `?debug=1` 页错误日志均为空，开发面板显示 `WebGL error = 0`，health 仅记录 `map-ready`。

本清单原定三项必需任务均已完成。选区地形模板 204–208 保留为此前实现过程记录，不再分别作为开放任务；其未提交改动由下方追加批准项统一收敛和验收。

### 2026-07-13 追加批准的最小任务

1. 选区地形模板最小闭环。`已完成`
   - 痛点：现有“选区地形模板”引擎、运行时、面板和回归改动尚未经过统一授权边界与生产浏览器验收，不能作为可提交能力交付。
   - 最小验收：仅保留现有高原、盆地、阶地、破碎地形四种预设；模板必须使用锁定选区，预览不修改高度或历史；一个收束模板可通过高度命令应用一次并完成撤销 / 重做；破碎地形在参数与 seed 不变时预览稳定；相关语法、`pnpm run regress:height-brush`、受影响回归、`pnpm run build:app`、生产浏览器和 `git diff --check` 全部通过。
   - 排除项：不新增预设，不做多步骤模板编排、用户模板保存 / 导入 / 导出，也不追求与 source 全图高度模板生成器完全兼容；这些事项只记录到 `FOLLOWUPS.md`，本轮不实施。
   - 完成结果：四种预设、锁定选区约束、有限预览、GPU 统计和高度历史闭环均保留，未新增排除项能力。相关四项 `node --check`、高度回归、编辑命令 affected / 摘要回归、生产构建和 `git diff --check` 通过；Corepack 联网失败后改用仓库本地 Node / Vite 入口完成同等门禁，构建仅有既有大 chunk 警告。
   - 浏览器证据：生产页面锁定 `3428 cells`。高原预览变化 `3407/3428`，GPU 为 `3407 cells / 20450 triangles`，预览后影响 `0`、历史 `0/0`；破碎地形连续两次均为变化 `3222/3428`、升高 `1637`、降低 `1585`、高度 `20..93→13..92`、均变 `+0.156`，证明相同参数与 seed 输出稳定。高原模板应用一次后影响 `3407`、历史 `undo 1 / redo 0`；撤销恢复原均高并变为 `undo 0 / redo 1`，重做恢复应用结果与 `undo 1 / redo 0`。验收后再次撤销回原高度，关闭页面并停止临时服务器；`WebGL error = 0`，health 只有 `map-ready`，浏览器 error 日志为空。
   - 停止条件：本项已达到最小验收，全部必需任务完成；后续事项仅保留在 `FOLLOWUPS.md`，不继续实施。

### 验证要求

- 每个代码步骤至少运行相关文件的 `node --check` 和 `git diff --check`。
- 每执行几步后运行 `pnpm run build:app`，并用系统 Chrome / Playwright 做浏览器烟测。
- 面板持久化烟测至少覆盖：打开一个领域面板，刷新页面后面板恢复打开；关闭后再次刷新不恢复；对象详情面板不因保存状态自动打开。

### 本轮综合验证记录

- 高度两点线段批次完成：烟测子智能体执行的 5 个 `node --check`、高度笔刷回归、编辑命令 affected 回归、affected 摘要回归、`pnpm run build:app` 和 `git diff --check` 均通过；构建 1118 modules，HeightPanel 与 `.height-line-preview` 已进入产物，仅有既有大 chunk 提示。浏览器子智能体复用现有 `5410` 页面，未刷新、新开、启动 Chrome / 服务器或 Playwright；唯一短线完成起点、预览、终点提交、9 cells 山脊、撤销和重做，稳定态地图完整。两名智能体均已结束，Chrome 控制会话已 finalize。
- 高度锥形填充代码批次完成：烟测子智能体执行的 5 个 `node --check`、高度笔刷回归、编辑命令 affected 回归、affected 摘要回归、`pnpm run build:app` 和 `git diff --check` 均通过；最终回归覆盖默认容差 6、可调容差、封闭水域、开放海域、缺边界、过小 / 过大区域、范围不匹配和 grid / pack 撤销重做。浏览器复用现有 `5410` 页面验证了六动作、Fill 控件切换和两条拒绝边界，但没有取得成功填充路径；后续两个最终成功路径智能体未在合理时间返回，均已中断并恢复执行 finalize，未刷新、新开或启动 Chrome / 服务器 / Playwright。第 143 步继续待执行，所有验证智能体和控制会话已释放。
- 高度扰动与陆水范围批次完成：烟测子智能体执行的 5 个 `node --check`、高度笔刷回归、编辑命令 affected 回归、affected 摘要回归、`pnpm run build:app` 和 `git diff --check` 均通过；最终构建成功产出 HeightPanel chunk，仅有既有大 chunk 提示。第一次浏览器验收发现 Element Plus 隐藏 radio / bridge 无法由控制面可靠选择，随后改为原生可见按钮并重新构建；最终复用现有 `5410` 页面完成一条 `disrupt + land` stroke、撤销和重做，稳定态地图显示完整。浏览器未刷新、新开页面或启动 Chrome / 服务器 / Playwright，烟测与浏览器智能体均已结束并释放会话。
- 高度下游派生顺序重算批次完成：烟测子智能体执行的 7 个 `node --check`、基础 / 下游顺序与短路回归、高度笔刷回归、affected 摘要回归、`pnpm run build:app` 和 `git diff --check` 均通过；pnpm 首次在沙箱内受 registry 网络限制失败，按规则升级后成功，构建只有既有大 chunk 警告。浏览器子智能体复用既有 `127.0.0.1:5410` 页面，未刷新、新开页面或启动 Chrome / 服务器 / Playwright；一次基础重算把待派生从 9 项降到 6 项，一次下游重算严格按 `religions -> markers / economy -> diplomacy -> military -> zones` 清为“无”。两名智能体均已结束，Chrome 控制会话已 finalize 释放。
- `node --check app\webgl-generator\src\ui\panel-manager.js`、`node --check app\webgl-generator\src\ui\panels\object-details-panel.js`、`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`node --check app\webgl-generator\src\ui\panels\river-panel.js` 均通过。
- `git diff --check` 通过。
- `pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告。
- 废弃内容区历史基础设施清理批次完成：应用源码不再引用 `UiHistoryActions`、`createHistoryActions` 或旧面板历史类；`pnpm run build:app` 通过（1109 modules，1.59s），`git diff --check` 通过。阶段末浏览器验收已交给子智能体，但 in-app Browser 与现有 Chrome 控制后端均不可连接；按约束未重启 Chrome、未使用 Playwright、未启动额外服务器，因此本批次浏览器 UI / WebGL 验收仍待可复用浏览器会话恢复后补跑。
- 多对象持久高亮批次完成：子智能体执行的 6 个 `node --check`、`pnpm run regress:selection-highlight`、`pnpm run build:app` 和 `git diff --check` 均通过；高亮回归为 12 / 30 / 30 顶点，Vite 构建 1109 modules、1.27s，仅有既有 chunk 警告。浏览器子智能体确认 in-app Browser 不可用且浏览器后端列表为空；按约束未启动 / 重启 Chrome、未使用 Playwright、未启动额外服务器，因此 API 持久高亮、append / clear、checksum 和 WebGL / console / health 真实浏览器验收待控制后端恢复后补跑。
- 路线 / 河流 / 湖泊批量高亮 UI 批次完成：子智能体执行的 4 个 `node --check`、`pnpm run regress:selection-highlight`、`pnpm run build:app` 和 `git diff --check` 均通过；三个 Vue SFC 均生成独立构建产物，无模板、响应式或 SFC 编译错误，Vite 构建 1109 modules、1.39s，仅有既有 chunk 警告。浏览器子智能体唯一一次后端检查仍为 `[]`；按约束未启动 / 重启 Chrome、未使用 Playwright、未启动服务器，因此 checkbox、高亮动作、跨面板清除、selection 不变、checksum 和 WebGL / console / health 验收待控制后端恢复后补跑。
- 政治 / 社会面板批量高亮与选择复用批次完成：子智能体执行的 9 个 `node --check`、`regress:visible-row-selection`、`regress:selection-highlight`、`pnpm run build:app` 和 `git diff --check` 均通过；筛选选择回归为 `1 -> 0`，高亮回归为 12 / 30 / 30 顶点，Vite 构建 1111 modules、1.30s，七个目标 Vue SFC 均生成独立 chunk，仅有既有大 chunk 警告。浏览器子智能体唯一一次后端检查仍为 `[]`，因此国家 / 省份高亮、中立排除、跨面板清除、selection / checksum 和 WebGL / console / health 验收待控制后端恢复后补跑。
- 持久高亮共享契约与编辑生命周期批次完成：烟测子智能体执行的 8 个 `node --check` 全过；共享契约回归为支持类型 `16`、规范化 `3`、拒绝 `2`、重复 `1`、删除后 `2`、上限 `100`，selection 高亮回归为 `12 / 30 / 30` 顶点，复合高亮回归为 `12 / 600` 顶点与 `100` 个负载候选；Vite 构建 1115 modules、1.25 秒，仅有既有大 chunk 警告，`git diff --check` 通过。pnpm 在沙箱内无输出后已按约束终止并只升级重跑一次。浏览器子智能体完整读取 Browser / Chrome 技能，但本轮没有暴露合规的浏览器控制入口，因而立即结束且未触碰 Chrome、页面、服务器或 Playwright；第 118 / 120 步真实浏览器验收继续待可复用入口恢复。
- 编辑命令领域与 affected 契约批次完成：烟测子智能体执行的 6 个 `node --check`、`regress:edit-command-affected`、`regress:persistent-highlight-contract`、`pnpm run build:app` 和 `git diff --check` 均通过；新回归覆盖名称库创建真实 id、绑定 / 清空系统目标和高度笔刷领域，Vite 构建 1115 modules、1.33 秒，仅有既有大 chunk 警告。浏览器子智能体只检查一次现有 Chrome，唯一页面仍是 GitHub commits，没有可复用 FMG 页面；会话已立即释放，未接管、刷新或新建页面，未启动 Chrome、服务器或 Playwright，第 122 步历史摘要验收继续待执行。
- 集合编辑真实 affected 批次完成：烟测子智能体执行的 6 个 `node --check`、扩展后的 `regress:edit-command-affected`、持久高亮兼容回归、`pnpm run build:app` 和 `git diff --check` 均通过；构建 1115 modules、1.21 秒，仅有既有大 chunk 警告。浏览器子智能体完整读取控制技能后仅检查一次现有 Chrome，唯一页面仍是 GitHub commits；已调用 finalize 释放会话，未 claim、刷新或新开页面，未启动 Chrome、服务器或 Playwright，第 124 步真实摘要与健康验收继续待执行。
- 重生成真实 affected 与摘要负载批次完成：烟测子智能体执行的 7 个 `node --check`、`regress:affected-summary`、编辑命令 affected 回归、持久高亮兼容回归、`pnpm run build:app` 和 `git diff --check` 均通过；构建 1115 modules、1.45 秒，仅有既有大 chunk 警告。浏览器子智能体只检查一次既有 Chrome，唯一页面仍为 GitHub commits；会话已 finalize 释放，未 claim、刷新、新开页面、启动服务器或重启 Chrome，未使用 Playwright，第 126 步重生成运行时验收继续待执行。
- 有界 affected 结构化诊断批次完成：烟测子智能体执行的 6 个 `node --check`、三组回归、`pnpm run build:app` 和 `git diff --check` 均通过；1001 目标摘要为 239 字节，构建 1115 modules、1.44 秒，入口 1128.58 kB / gzip 327.43 kB，仅有既有大 chunk 警告。浏览器子智能体只检查一次现有 Chrome，唯一页面仍为 GitHub commits；已 finalize 释放，未认领、刷新或新开页面，未启动 Chrome、服务器或 Playwright，第 128 步 runtime stats 验收继续待执行。
- history.peek 有界 affected 批次完成：烟测子智能体执行的 7 个 `node --check`、三组回归、`pnpm run build:app` 和 `git diff --check` 均通过；1001 目标默认预览 3 项、结果 852 字节，自定义 5 项与非法参数边界均通过，构建 1116 modules、1.63 秒，仅有既有大 chunk 警告。浏览器子智能体只检查一次现有 Chrome，唯一页面仍为 GitHub commits；已 finalize 释放，未 claim、刷新或新建页面，未启动 Chrome、服务器或 Playwright，第 130 步真实 API 验收继续待执行。
- history stats 有界 lastAffected 批次完成：烟测子智能体执行的 8 个 `node --check`、三组回归、`pnpm run build:app` 和 `git diff --check` 均通过；内部完整目标 1001 项、默认公开预览 3 项、stats 389 字节，自定义 5 项及非法参数边界均通过，构建 1116 modules、1.24 秒。浏览器子智能体只检查一次现有 Chrome，唯一页面仍为 GitHub commits；已 finalize 释放，未 claim、刷新或新建页面，未启动 Chrome、服务器或 Playwright，第 132 步真实 API / 面板验收继续待执行。
- 高度整平笔刷批次完成：烟测子智能体执行的 6 个 `node --check`、高度笔刷回归、编辑命令 affected 兼容回归、摘要负载回归、`pnpm run build:app` 和 `git diff --check` 均通过；整平目标 `20`、连续拖动 cell 3 到 `42`、无变化边缘过滤、撤销 / 重做和 `height` domain 均符合预期，构建 1117 modules，HeightPanel 38.44 kB / gzip 12.97 kB，仅有既有大 chunk 警告。浏览器子智能体只检查一次现有 Chrome，唯一页面仍为 GitHub commits；已 finalize 释放且无遗留资源，未 claim、刷新、新开页面或启动 Chrome / 服务器 / Playwright，第 134 步交互验收继续待执行。
- 高度基础派生顺序重算批次完成：烟测子智能体执行的 7 个 `node --check`、基础派生顺序 / 短路回归、高度笔刷回归、affected 摘要回归、`pnpm run build:app` 和 `git diff --check` 均通过；成功顺序为 `rivers -> states`，河流失败只调用第一步，国家失败记录部分完成，构建 1118 modules，HeightPanel 38.58 kB / gzip 12.99 kB。浏览器子智能体长时间未返回后已中断；随后只恢复该智能体执行 `tabs.finalize({})`，确认 Chrome 控制会话已释放且未继续操作页面或启动资源，第 136 步真实组合重算验收继续待执行。
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
- `locateAndSelectObject()` 测量对象扩展已完成：测量面板定位通过自定义 bounds 回调复用统一 selection / runtime / pick 刷新流程，并新增 `measurement` selection handler，避免定位后落到通用对象详情面板；测量对象仍使用 `measurementBounds()` 和 `renderer.locateBounds()`，不改变测量 overlay 或编辑流程。`node --check app\webgl-generator\src\runtime\app.js`、`node --check tools\webgl-generator-measurement-import-regression.mjs` 和 `git diff --check` 通过；`pnpm run build:app` 通过，仅有既有 Vite 大 chunk 警告；系统 Chrome 构建产物测量导入回归以 `--cells 3000` 通过，定位后 selection 为 `measurement / measurement-2`，测量面板选中行 `1`，对象详情面板关闭，`glError = 0`。
- `locateAndSelectObject()` 标签与入口扩展已完成：`node --check app\webgl-generator\src\runtime\app.js` 和 `git diff --check` 通过；当前 PowerShell 中 `pnpm` 不在 PATH，Corepack 写用户缓存被沙箱拦截，本轮改用等价的本地 Vite 命令 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测依次点击标签、政体、外交和对象详情定位按钮，selection 分别保持 `label / state / state / marker`，标签 / 外交面板各 1 个选中行，政体面板 2 个选中行，`glError = 0`，health / console / page error 均为 `0`。本轮按要求曾启动验证子智能体，但两个子智能体未产出有效浏览器验证证据，其中一个已中断释放；最终通过证据来自主线程复跑的同等浏览器烟测。
- `locateAndSelectObject()` 经济 / 备注与 API 复用已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\ui\panels\economy-panel.js` 和 `git diff --check` 通过；本地 Vite 构建通过，仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认经济交易行定位会选中卖方城市 `city / 99` 且经济面板选中行 `1`，注入备注后备注总览定位选中 `marker / 0` 且备注面板选中行 `1`，`webglGeneratorApi.selection.locate({kind:"marker", id:0})` 返回 `ok=true`、`data.located=true` 并保持 `marker / 0` selection；最终 `glError = 0`，health / console / page error 均为 `0`。本轮按要求启动验证子智能体，但该子智能体长时间无输出后已中断释放；最终有效验证证据来自主线程复跑的同等浏览器烟测。
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
- 编辑命令契约校验第一刀已完成：`EditHistory.execute()` 现在会校验 `label / domain / effects / affected / isNoop / getResult` 等可选字段的形状；`edit-command-contract.md` 和编辑器基础设施清单已同步更新。该校验保持渐进兼容，不强制旧命令一次性补齐 `domain / effects`，但会阻止新增命令携带错误结构进入撤销栈。
- 编辑命令 `domain` 第一批已完成：路线、河流、湖泊、地区、备注和测量对象命令已主动声明 `domain`，用于后续按领域聚合调试、刷新诊断和 API 错误归因；城市、国家、省份、文化、宗教、marker、标签、外交和军事等命令后续继续分批补齐。
- 编辑命令 `domain` 第二批已完成：城市、国家、省份、文化和宗教命令已主动声明 `domain`；剩余 marker、标签、外交、军事和对象详情通用字段等命令后续继续分批补齐。
- 编辑命令 `domain` 第三批已完成：marker、标签、外交和对象详情通用字段命令已主动声明 `domain`；对象详情重命名 / 备注使用真实 `target.kind` 作为领域，剩余军事命令后续单独补齐。
- 编辑命令 `domain` 军事批次已完成：军事编辑命令 9 个导出工厂均已主动声明 `domain: "military"`；至此当前 `*-edit-commands.js` 主要命令域已覆盖，后续重点转向残留直接历史路径和更精确的 `effects.affected`。刷子与 GEO 导入命令已补充 `derived-system#height-brush/state-brush/province-brush/geo-import` 来源，外交重生成和批量政体调整已补充 `derived-system#diplomacy-regeneration/state-government-batch` 来源，测量对象导入已补充 `derived-system#measurements-import` 来源；新增对象和保存测量对象命令已开始用 `kind#new` 避免初始 affected 为空。测量对象导入已修正无效项消耗 `nextId` 的问题，跳过无效项后有效导入 id 保持连续。
- 新增对象 / 单对象 affected helper 第一刀已完成：`edit-command-effects.js` 新增 `newObjectAffected(kind)` 和 `objectAffected(kind, id)`；新增城市、省份、国家、空文化、空宗教、手工标签、marker、保存测量对象和测量对象导入命令的初始 `kind#new` 已改为复用新增对象 helper，执行成功后的真实 id 回写保持不变；marker 视觉、备注、移动、删除和资源点重生成命令已开始复用单对象 helper，资源点重生成仍组合 `systemAffected("markers", objectAffected(...))` 保留 `derived-system#markers + marker#resources` 的摘要形状；标签移动、重命名、备注、删除、恢复，测量对象保存回写、重命名、更新、删除和导入回写，文化 / 宗教新增回写、删除、颜色和继承父级命令，路线备注 / 删除、河流宽度 / 备注、地区样式和备注删除命令，城市新增回写、删除、人口、归属同步、视觉和备注命令，国家 / 省份新增回写、删除、国家颜色和政体命令，对象详情通用重命名 / 备注、省份颜色、国家首都和外交关系命令，军事兵种比例、单军团态势、移动驻地、设置基地、军团重命名和战报导入目标，以及气候即时刷新目标也已复用单对象 helper；`edit-command-contract.md` 和编辑器基础设施清单已同步 helper 使用约定。marker、标签 / 测量对象、文化 / 宗教、路线 / 河流 / 地区 / 备注、城市、国家 / 省份和对象详情 / 外交批次均已完成对应 `node --check`、`git diff --check`、`pnpm run build:app` 和浏览器烟测；军事批次的 `node --check` 覆盖军事命令文件，`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_military_object_affected` 等待 90 秒无输出，已中断释放，主线程兜底命令契约检查和 Playwright + 系统 Chrome 构建产物烟测通过，`gl.getError() = 0`，console/page error 均为 `0`。气候即时刷新批次已完成轻量收口，待本批次继续累积后统一构建和浏览器烟测。
- 气候即时 affected helper 与文化 / 宗教编辑 API 本批次统一验证已完成：`node --check app\webgl-generator\src\runtime\app.js`、`node --check app\webgl-generator\src\runtime\console-api.js`、`git diff --check`、运行时手写 affected 搜索、构建和 Playwright + 系统 Chrome 浏览器烟测均通过；两个验证子智能体等待 90 秒无输出后已中断释放，最终有效证据来自主线程兜底复跑。气候 API 写入确认不进入 `EditHistory`，文化 / 宗教 API 新增、撤销、重做、删除和撤销删除闭环通过。
- 编辑历史领域统计已完成：`EditHistory.getStats()` 新增 `lastDomain`，执行 / 撤销 / 重做后会记录最近命令领域；控制台历史 API 和各类历史摘要可显示 `@domain`，便于后续刷新诊断和错误归因。
- 测量对象定位动作收束和对象进入编辑动作 helper 第一刀批量验证已完成：`node --check app\webgl-generator\src\runtime\app.js`、`git diff --check`、`.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 均通过，构建仅有既有 Vite 大 chunk 警告；测量导入回归在 `--cells 3000` 下通过，定位后 selection 为 `measurement / measurement-2`、测量选中行 `1`、对象详情面板关闭、`WebGL error = 0`；Playwright + 系统 Chrome 构建产物烟测确认 `startObjectEditing / stopObjectEditing / toggleObjectEditing` 均存在，state helper 会写入 selection / editingObject，river toggle 会进入再退出同一河流编辑，`glError = 0`、health error 和 console/page error 均为 `0`。本批次两次尝试验证子智能体均长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 对象退出编辑动作 helper 和控制面板打开对象面板 helper 第一刀批量验证已完成：`node --check app\webgl-generator\src\runtime\app.js`、`git diff --check`、`.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 均通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认 `stopObjectEditing({ifKind:"state"})` 不会误清 `river / 1` 编辑对象，匹配 `state / 1` 时会清空编辑对象；`openSelectionAwarePanel` 存在，经济 `trade-flow / 0` 打开顺序为 `open -> set:0`；`glError = 0`、health error 和 console/page error 均为 `0`。本批次验证子智能体长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 空态新增动作批次已完成：`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认文化、宗教和标签管理筛选为空时分别显示“新增空文化 / 新增空宗教 / 新增标签”，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `empty_action_verify` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 名称库空态与导入方式批次已完成：`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`node --check app\webgl-generator\src\ui\panels\namebase-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认名称库筛选为空时显示“新建用户库”，导入方式切到 `replace` 后刷新仍保持，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `namebase_empty_prefs_verify` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 资源标记范围筛选和空态动作禁用态批次已完成：`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`node --check app\webgl-generator\src\ui\panels\marker-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认资源标记范围从 `all` 切到 `resource` 后刷新仍保持 `resource`，名称库空态动作“新建用户库”仍可见且未被误禁用，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `batch_verify_marker_empty_action` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 外交历史范围和军事战报导出范围批次已完成：`node --check app\webgl-generator\src\ui\panels\diplomacy-panel.js`、`node --check app\webgl-generator\src\ui\panels\military-panel.js`、`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认外交历史范围从 `selected` 切到 `all` 后刷新仍保持“全部历史”，军事战报导出范围从 `all` 切到 `filtered` 后刷新仍保持“当前筛选”，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_diplomacy_military_scope` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 文化 / 宗教树状面板打开状态批次已完成：`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`node --check app\webgl-generator\src\ui\panels\culture-panel.js`、`node --check app\webgl-generator\src\ui\panels\religion-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认文化和宗教树状面板打开会写入 `treeOpen: true`，刷新后恢复打开，关闭后写回 `treeOpen: false`，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_culture_religion_tree_open` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- `UiObjectTable.emptyAction` 禁用态事件保护已完成：空态动作点击统一走 `handleEmptyAction()`，当未传动作或动作处于 `disabled` 时不再向外 emit；既有可用空态动作行为保持不变。本步只收紧公共组件防线，不新增面板动作或编辑模式。`git diff --check`、源码静态检查和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认应用和 WebGL2 正常，名称库空态“新建用户库”仍可见且未被误禁用，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_empty_action_guard` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- `UiObjectTable` 列尺寸语义补齐已完成：公共表格列样式现在会归一化 `width / minWidth / maxWidth`，既有 `width` 仍作为默认最小宽度并同步写入 `width` 样式，字符串尺寸也可透传给后续持久化或面板特例使用。本步只补列尺寸解释层，不做拖拽改宽、列宽存储或批量选择。`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认名称库表格列 header / cell 均写入 `width = 76px` 与 `minWidth = 76px`，应用和 WebGL2 正常，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_table_style_batch` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- `UiObjectTable.emptyAction` 禁用态视觉已完成：公共空态按钮新增 `:disabled` 样式，禁用动作会降低边框 / 背景 / 文本对比并使用 `not-allowed` 光标，避免不可用动作仍表现得像可点击主按钮。本步只补样式，不改变事件、动作或面板逻辑。`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认名称库空态“新建用户库”仍可见且未被误禁用，临时 disabled 空态按钮 computed style 为 `cursor = not-allowed`、低对比文本 / 背景 / 边框，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_table_style_batch` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- `panel-list-preferences` 列宽偏好存储层第一刀已完成：偏好归一化现在支持面板 defaults 显式声明的 `columnWidths`，只保留默认列 key，并把数值约束到 `32..640px`；未声明 `columnWidths` 的现有面板存储结构不变。本步只补存储层，不接拖拽改宽 UI、不改变任何面板列定义。`node --check app\webgl-generator\src\ui\panel-list-preferences.js` 通过；本地 Node 断言确认坏宽度会被夹到 `32..640px`、未知列 key 被丢弃、未声明 defaults 的面板不会写入 `columnWidths`；Playwright + 系统 Chrome 构建产物烟测确认应用和 WebGL2 正常，名称库表格仍可打开，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_column_width_batch` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- `UiObjectTable.columnWidths` 覆盖入口已完成：公共表格新增可选 `columnWidths` prop，可按列 key 覆盖列定义里的 `width` 并继续复用 `minWidth / maxWidth` 归一化逻辑；未传该 prop 的现有面板行为保持不变。本步只补组件入口，不接拖拽改宽 UI、不改变任何面板默认列宽。`git diff --check`、源码静态检查和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认名称库表格列 header / cell 均保持 `width = 76px` 与 `minWidth = 76px`，名称库空态“新建用户库”仍可见且未被误禁用，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_column_width_batch` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 名称库面板列宽偏好读路径第一刀已完成：名称库面板 defaults 现在声明 `columnWidths`，打开面板时会通过 `panel-list-preferences` 读取归一化列宽并传给 `UiObjectTable`；现有默认列宽保持不变，预置合法本地偏好时可覆盖对应列宽。本步只接读路径和表格 prop，不做拖拽改宽 UI 或列宽写回。`node --check app\webgl-generator\src\ui\panels\namebase-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_namebase_column_width_read` 的 Playwright + 系统 Chrome 构建产物烟测确认预置 `columnWidths.name = 180` 后，名称库表格“名称”列 header / cell 均为 `width = 180px` 与 `minWidth = 180px`，空态“新建用户库”仍可见且未被误禁用，`glError = 0`，health / console / page error 均为 `0`。
- 名称库列宽拖拽持久化第一刀已完成：`UiObjectTable` 新增默认关闭的列宽拖拽手柄和 `column-resize` 事件，名称库面板启用 `resizable-columns`，拖动列宽后通过 `panel-list-preferences.columnWidths` 写回并刷新 state。本步只在名称库面板启用，不扩散到其它表格；不做列宽重置按钮或批量列配置。`node --check app\webgl-generator\src\ui\panels\namebase-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_namebase_column_resize_drag` 的 Playwright + 系统 Chrome 构建产物烟测确认“名称”列从约 `130.625px` 拖到 `251px`，localStorage 写入 `columnWidths.name = 251`，刷新后 header / cell 仍保持 `251px`，空态“新建用户库”仍可见且未被误禁用，`glError = 0`，health / console / page error 均为 `0`。
- 湖泊面板列宽拖拽持久化第一刀已完成：湖泊面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动湖泊列宽会写回 `panel-list-preferences.columnWidths` 并刷新 state；`UiObjectTable` 的行级 `v-memo` 已补列布局签名，确保拖拽后可见单元格 inline style 立即同步。本步只扩展湖泊管理面板，不改变湖泊数据、排序、筛选、定位或重命名逻辑。`node --check app\webgl-generator\src\ui\panels\lake-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；Playwright + 系统 Chrome 构建产物烟测确认湖泊“名称”列从 `112px` 拖到 `202px`，header / cell inline width 与 minWidth 均立即变为 `202px`，localStorage 写入 `columnWidths.name = 202`，刷新后仍保持 `202px`，`glError = 0`，health / console / page error 均为 `0`。本批次验证子智能体 `verify_lake_column_resize_drag` 长时间无输出，已中断释放，最终有效验证证据来自主线程兜底复跑。
- 路线 / 河流面板列宽拖拽持久化第一刀已完成：路线和河流面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动列宽会写回各自 `panel-list-preferences.columnWidths` 并刷新 state。本步只扩展路线和河流管理面板，不改变路线 / 河流数据、排序、筛选、定位、编辑或重命名逻辑。`node --check app\webgl-generator\src\ui\panels\route-panel.js`、`node --check app\webgl-generator\src\ui\panels\river-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_route_river_column_resize_drag` 未产出有效浏览器证据，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认路线“起点”列从 `112px` 拖到 `202px`，localStorage 写入 `columnWidths.fromName = 202`，刷新后 header / cell 仍保持 `202px`；河流“名称”列从 `120px` 拖到 `216px`，localStorage 写入 `columnWidths.name = 216`，刷新后 header / cell 仍保持 `216px`；`glError = 0`，health / console / page error 均为 `0`。
- 城市 / 国家 / 省份面板列宽拖拽持久化第一刀已完成：三个高频编辑面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动列宽会写回各自 `panel-list-preferences.columnWidths` 并刷新 state。本步只扩展城市、国家和省份管理表格，不改变新增 / 删除、编辑模式、排序、筛选、定位、重命名、人口、政体、颜色或备注逻辑。`node --check app\webgl-generator\src\ui\panels\city-panel.js`、`node --check app\webgl-generator\src\ui\panels\state-panel.js`、`node --check app\webgl-generator\src\ui\panels\province-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_city_state_province_column_resize` 长时间无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认城市、国家、省份“名称”列均从 `120px` 拖到 `210px`，对应 localStorage 写入 `columnWidths.name = 210`，刷新后 header / cell 仍保持 `210px`；`glError = 0`，health / console / page error 均为 `0`。
- 文化 / 宗教 / 地区面板列宽拖拽持久化第一刀已完成：三个对象管理面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动列宽会写回各自 `panel-list-preferences.columnWidths` 并刷新 state。本步只扩展文化、宗教和地区管理表格，不改变树状面板打开状态、空态新增动作、排序、筛选、定位、重命名、继承、样式或备注逻辑。`node --check app\webgl-generator\src\ui\panels\culture-panel.js`、`node --check app\webgl-generator\src\ui\panels\religion-panel.js`、`node --check app\webgl-generator\src\ui\panels\zone-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_culture_religion_zone_column_resize` 长时间无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认文化 / 宗教“名称”列均从 `120px` 拖到 `210px`，地区“名称”列从 `150px` 拖到 `240px`，对应 localStorage 写入 `columnWidths.name`，刷新后 header / cell 仍保持新宽度；`glError = 0`，health / console / page error 均为 `0`。
- 资源标记 / 标签 / 测量对象面板列宽拖拽持久化第一刀已完成：三个对象列表面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动列宽会写回各自 `panel-list-preferences.columnWidths` 并刷新 state。本步只扩展资源标记、标签和测量对象表格，不改变范围筛选、空态新增、测量对象保存 / 导出、排序、筛选、定位、重命名、图标或备注逻辑。`node --check app\webgl-generator\src\ui\panels\marker-panel.js`、`node --check app\webgl-generator\src\ui\panels\label-naming-panel.js`、`node --check app\webgl-generator\src\ui\panels\measurement-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_marker_label_measurement_column_resize` 长时间无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认资源标记“名称”列从 `120px` 拖到 `215px`，标签“名称”列从 `128px` 拖到 `218px`，测量对象“名称”列从 `132px` 拖到 `225px`，对应 localStorage 写入 `columnWidths.name`，刷新后 header / cell 仍保持新宽度；`glError = 0`，health / console / page error 均为 `0`。
- 生物群系 / 气候 / 水体地貌 / 人口统计面板列宽拖拽持久化第一刀已完成：四个只读统计面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动列宽会写回各自 `panel-list-preferences.columnWidths` 并刷新 state。本步只扩展统计表格，不改变统计口径、排序、筛选、选中详情或 `show-locate-action=false` 的只读行为。`node --check app\webgl-generator\src\ui\panels\biome-panel.js`、`node --check app\webgl-generator\src\ui\panels\climate-panel.js`、`node --check app\webgl-generator\src\ui\panels\feature-panel.js`、`node --check app\webgl-generator\src\ui\panels\population-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_stats_column_resize` 长时间无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认生物群系“名称”列从 `120px` 拖到 `253px`，气候“温度带”列从 `96px` 拖到 `216px`，水体地貌“类型”列从 `76px` 拖到 `176px`，人口“名称”列从 `120px` 拖到 `210px`，对应 localStorage 写入 `columnWidths`，刷新后 header / cell 仍保持新宽度；`glError = 0`，health / console / page error 均为 `0`。
- 外交 / 纹章 / 备注面板列宽拖拽持久化第一刀已完成：三个面板 defaults 现在声明 `columnWidths`，并复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环；拖动列宽会写回各自 `panel-list-preferences.columnWidths` 并刷新 state。本步只扩展外交关系列表、纹章统计表格和备注总览表格，不改变外交矩阵、纹章统计口径、备注导出 / 删除、排序、筛选、定位或历史行为。`node --check app\webgl-generator\src\ui\panels\diplomacy-panel.js`、`node --check app\webgl-generator\src\ui\panels\emblem-panel.js`、`node --check app\webgl-generator\src\ui\panels\notes-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_diplomacy_emblem_notes_column_resize` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认外交“国家”列从 `144px` 拖到 `239px`，纹章“对象”列从 `140px` 拖到 `228px`，备注“摘要”列从 `240px` 拖到 `363px`，各自 localStorage 写入对应 `columnWidths`，刷新后 header / cell 仍保持新宽度；备注验证在浏览器会话内临时插入一个备注对象用于表格行验证，不写入源码或仓库文件；`glError = 0`，health 无 error，console/page error 均为 `0`。
- 经济 / 政体 / 军事面板列宽拖拽持久化第一刀已完成：经济面板按 `goods.* / markets.* / deals.*` 分表保存列宽，政体面板按 `governments.* / states.*` 分表保存列宽，军事面板按主军团表列 key 保存列宽；三者均复用 `UiObjectTable` 的 `resizable-columns` / `column-resize` 读写闭环。本步只扩展经济三 tab 表格、政体汇总 / 国家表格和军事军团表格，不改变经济 tab 偏好、政体家族筛选、军事战报导出范围、排序、筛选、定位、批量调整或历史行为。`node --check app\webgl-generator\src\ui\panels\economy-panel.js`、`node --check app\webgl-generator\src\ui\panels\government-panel.js`、`node --check app\webgl-generator\src\ui\panels\military-panel.js`、`git diff --check` 和 `.\node_modules\.bin\vite.cmd build --config vite.config.mjs` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_economy_government_military_column_resize` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 构建产物烟测确认经济商品“商品”列 `112px -> 204px`、市场“市场”列 `132px -> 220px`、交易“商品”列 `104px -> 188px`，政体汇总“政体”列 `132px -> 249px`、政体国家表“国家”列 `132px -> 243px`，军事“军团”列 `136px -> 239px`；localStorage 分别写入 `goods.name / markets.name / deals.goodName / governments.label / states.name / name`，刷新后 header / cell 保持新宽度；`glError = 0`，health 无 error，console/page error 均为 `0`，health 记录一次 `input-handler-stall` warn 作为后续性能观察。
- `UiObjectTable` 批量选择表头半选态补齐：公共表格现在会在部分当前列表行被选中时同步原生 `indeterminate` 状态，并继续保留既有 `aria-checked="mixed"`；本步只修正选择状态呈现，不改变全选范围、行选择、导出、排序、筛选或任何编辑动作。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_table_indeterminate` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认军事面板单选 `1 / 113` 行时表头为 `checked=false / indeterminate=true / aria-checked=mixed`，表头全选后为 `checked=true / indeterminate=false / aria-checked=true` 且 `113 / 113` 行选中；`glError = 0`，health / console / page error 均为 `0`。
- 路线 / 河流 / 湖泊面板筛选空态清理第一刀：三个对象列表在筛选后没有匹配行时，会通过 `UiObjectTable.emptyAction` 显示“清空筛选”，点击后仅调用各自 `onFilter("")` 恢复当前列表；本步不改变定位、编辑、删除、按名称库重命名、道路重算、列宽或排序逻辑。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_route_river_lake_empty_filter` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认路线、河流、湖泊面板分别在无匹配筛选时显示“清空筛选”，点击后筛选词清空并恢复 `26 / 26 / 4` 个可见行；`glError = 0`，health / console / page error 均为 `0`。
- 城市 / 国家 / 省份面板筛选空态清理第一刀：三个高频政治 / 聚落对象列表在筛选后没有匹配行时，会通过 `UiObjectTable.emptyAction` 显示“清空筛选”，点击后仅调用各自 `onFilter("")` 恢复当前列表；本步不改变新增 / 删除模式、笔刷状态、目标对象、定位、双击编辑、按名称库重命名、列宽或排序逻辑。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_city_state_province_empty_filter` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认城市、国家、省份面板分别在无匹配筛选时显示“清空筛选”，点击后筛选词清空并恢复 `26 / 21 / 26` 个可见行；`glError = 0`，health / console / page error 均为 `0`。
- 文化 / 宗教 / 地区面板筛选空态清理第一刀：文化和宗教面板在筛选后没有匹配行时会优先显示“清空筛选”，筛选为空时仍保留原有“新增空文化 / 新增空宗教”空态主动作；地区面板同样在筛选空态显示“清空筛选”。本步只回写列表筛选词，不改变树状面板打开状态、空文化 / 空宗教新增、删除空对象、定位、双击编辑、地区样式编辑、列宽或排序逻辑。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_culture_religion_zone_empty_filter` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认文化、宗教、地区面板分别在无匹配筛选时显示“清空筛选”，点击后筛选词清空并恢复 `12 / 18 / 3` 个可见行；文化 / 宗教列表操作栏的“新增空文化 / 新增空宗教”按钮仍各存在 `1` 个；`glError = 0`，health / console / page error 均为 `0`。
- 资源标记 / 标签 / 名称库面板筛选空态清理第一刀：资源标记列表在筛选后没有匹配行时会显示“清空筛选”；标签和名称库面板在筛选空态优先显示“清空筛选”，筛选为空时仍保留原有“新增标签 / 新建用户库”空态主动作和列表动作栏入口。本步只回写列表筛选词，不改变资源标记放置 / 移动 / 删除、标签新增 / 删除 / 恢复、名称库导入 / 导出 / 复制 / 删除 / 清空、列宽或排序逻辑。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_marker_label_namebase_empty_filter` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认资源标记、标签、名称库面板分别在无匹配筛选时显示“清空筛选”，点击后筛选词清空并恢复 `44 / 26 / 62` 个可见行；标签 / 名称库列表操作栏的“新增标签 / 新建用户库”按钮仍各存在 `1` 个；`glError = 0`，health / console / page error 均为 `0`。
- 生物群系 / 气候 / 水体地貌 / 人口统计面板筛选空态清理第一刀：四个只读统计列表在筛选后没有匹配行时，会通过 `UiObjectTable.emptyAction` 显示“清空筛选”，点击后仅调用各自 `onFilter("")` 恢复当前列表；本步不改变统计口径、选中详情、列宽或排序逻辑。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_stats_empty_filter` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认生物群系、气候、水体地貌和人口统计面板分别在无匹配筛选时显示“清空筛选”，点击后筛选词清空并恢复 `13 / 5 / 11 / 26` 个可见行；`glError = 0`，health / console / page error 均为 `0`。
- 外交 / 纹章 / 备注 / 经济 / 政体 / 军事面板筛选空态清理第一刀：六个剩余带 `UiFilterInput + UiObjectTable` 的管理 / 报表面板已接入筛选空态“清空筛选”动作；点击后仅调用各自 `onFilter("")` 恢复当前列表。经济面板三张表共享同一清理动作，政体面板只在政体汇总表筛选为空时清理文本筛选，军事面板只清理文本筛选，不改变国家 / 态势下拉筛选、战报筛选、批量态势、导出、编辑或列宽逻辑。`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_report_empty_filter` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测确认外交、纹章、备注、经济商品、经济市场、经济交易、政体和军事表格分别在无匹配筛选时显示“清空筛选”，点击后筛选词清空并恢复 `19 / 26 / 1 / 71 / 30 / 48 / 10 / 113` 个可见行；备注验证在浏览器会话内临时插入 1 条备注用于表格行验证，不写入源码或仓库文件；军事国家 / 态势下拉在清理前后保持 `all / all`；`glError = 0`，health / console / page error 均为 `0`。
- 军事战报二级筛选持久化第一刀：战报链路、类型、结果和结算筛选四项已提升到 `panel-list-preferences`，刷新后可恢复；本步不保存战报导入状态、战报记录草稿、显示展开状态或其它编辑中间态。`node --check app\webgl-generator\src\ui\panel-list-preferences.js`、`node --check app\webgl-generator\src\ui\panels\military-panel.js`、`git diff --check` 和 `pnpm run build:app` 通过，构建仅有既有 Vite 大 chunk 警告；验证子智能体 `verify_military_event_filter_prefs` 等待 90 秒无输出，已中断释放，主线程兜底 Playwright + 系统 Chrome 烟测在浏览器会话内给 `1（苍原）军团` 临时注入两条战报，确认预置 `smoke-chain-a / skirmish / victory / applied` 可恢复，UI 改为 `smoke-chain-b / raid / defeat / pending` 后 localStorage 写入 `eventChainFilter / eventTypeFilter / eventOutcomeFilter / eventApplyFilter`，刷新后四项仍恢复为 `smoke-chain-b / raid / defeat / pending`；军事国家 / 态势主筛选保持 `all / all`，战报导出范围保持 `selected`，直接 `gl.getError() = 0`，health / console / page error 均为 `0`。
- Fill 落点预检批次统一验证完成：烟测子智能体执行 5 项 `node --check`、高度笔刷 / 编辑命令 affected / affected 摘要三项回归、`pnpm run build:app` 和 `git diff --check` 均通过，构建仅有既有大 chunk 警告；公开预检确认封闭水域 `valid=true / 9 cells`、开放水域 `valid=false / 25 cells`、默认陆地容差 `6 / valid=true / 5 cells`，且不暴露内部 selection。浏览器子智能体复用既有 `5410` 页面，首个内陆候选预检 `65 cells`，唯一一次点击实际影响 `43 cells`，撤销 / 重做闭环和稳定态地图通过，console error 为 `0`；未刷新或启动浏览器、服务器、Playwright，两个子智能体均已结束并释放控制会话。
- 全局高度平滑 / 稳定扰动批次统一验证完成：烟测子智能体执行 4 项 `node --check`、高度笔刷 / 编辑命令 affected / affected 摘要三项回归、`pnpm run build:app` 和 `git diff --check` 均通过；回归证明平滑整轮读取同一快照、陆水范围隔离、扰动 seed 可复现 / 可推进、深水保护以及 grid / pack 撤销重做。浏览器子智能体复用既有 FMG 页面，选择“仅陆地”后唯一一次全局平滑影响 `2449 cells`，高度 `9..5,929 米`、平均变化 `+1,617 米`、待派生 `9 -> 12` 项，撤销 / 重做闭环通过，地图稳定且 console error 为 `0`；未刷新或启动 Chrome、服务器、Playwright，两个子智能体均已结束并释放会话。
- 高度区间条件变换批次统一验证完成：烟测子智能体执行 4 项 `node --check`、高度笔刷 / 编辑命令 affected / affected 摘要三项回归、`pnpm run build:app` 和 `git diff --check` 均通过；五类运算、区间 / scope、海平面夹取、异常拒绝、有界预检和 grid / pack 历史覆盖完整。浏览器子智能体复用既有 `5410` 页面，在仅陆地 `20..100 × 0.9` 下唯一一次预检为变化 `2746/3326 cells`、高度 `20..100 -> 20..92`、均变约 `-2.5`；唯一一次执行后 preview 清理，撤销 / 重做闭环和稳定地图通过，console error 为 `0`。第一名浏览器智能体超时后已中断并 finalize，补验智能体也已结束；未刷新或启动 Chrome、服务器、Playwright。
- 条件变换 WebGL 空间预览批次统一验证完成：烟测子智能体执行 preview layer、renderer、运行时等 6 项 `node --check`、高度笔刷 / 编辑命令 affected / affected 摘要三项回归、`pnpm run build:app` 和 `git diff --check`，补充 GPU 统计 UI 后再跑 3 项语法检查、构建与差异检查，全部通过；合成 mesh 为 `24` 顶点 / `8` 三角形且暖冷色、坏 cell / 坏地图保护成立。浏览器唯一一次有效预检显示降低 `2746/3326 cells`，地图出现冷蓝 overlay，可见 GPU 统计 `2746 cells / 16466 triangles / 9.1 ms`；参数变化后 preview、图例、统计和 overlay 同时清理，地图稳定且 console error 为 `0`。未执行地图变换、刷新或启动 Chrome、服务器、Playwright，两个子智能体均已结束并释放会话。
- 全局高度工具预览优先批次统一验证完成：烟测子智能体执行 5 项 `node --check`、高度笔刷 / 编辑命令 affected / affected 摘要三项回归、`pnpm run build:app` 和 `git diff --check`，全部通过；平滑预检 `5/5`、升 `4` / 降 `1`，扰动 seed `23` 预检 `25/18`、升 `10` / 降 `8`，同 / 异 seed、深水保护和 grid / pack 历史成立。浏览器仅一次扰动预览为变化 `2428/3326 cells`、升 `1678` / 降 `750`，GPU `2428 cells / 14584 triangles / 8 ms`，暖 / 冷 overlay 同时出现；唯一一次应用清理全部 preview，撤销 / 重做闭环和稳定地图通过，console error 为 `0`。浏览器未直接读取 seed 数值，证据边界已记录；未刷新或启动 Chrome、服务器、Playwright，两个子智能体均已结束并释放会话。
- 高度区间可复用地形选区批次统一验证完成：烟测子智能体执行 7 项 `node --check`、三项回归、生产构建和 `git diff --check`，全部通过；仅陆地 `20..30` 纯模型锁定 ids `1/2`，有界摘要不含 ids / Set，限制条件变换为候选 `2` / 变化 `1`、限制全局平滑为 `1/1`，黄色 mesh 为 `24` 顶点 / `8` 三角形。首轮浏览器数据暴露 `getGlobalHeightChanges()` 漏传 `allowedCells`，修复并增加实际 changes 回归后，子智能体补跑最小烟测和同页浏览器验收均通过：仅陆地 `20..40` 锁定 `1889 cells`，全局扰动文字与 GPU 均为 `1356 cells`，升高 `958`、降低 `398`，GPU `8155 triangles / 11.3 ms`，暖 / 冷 overlay 只叠加于黄色选区。清除后选区及依赖预览完整清理，应用按钮 disabled，地图完整稳定，console error 为 `0`，本轮无 render-frame-gap；未应用地图变化、刷新或启动 Chrome、服务器、Playwright，两个子智能体均已结束并释放会话。
- 高度选区布尔组合批次统一验证完成：烟测子智能体执行 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，四种运算、坏 id、空结果旧选区保持、有界摘要与生产按钮均通过。浏览器可视控制无法可靠替换 Element Plus 数字框，相关会话均按停机条件及时释放；补充上下限原生 range id 后，子智能体使用 browser 插件语义连接复用既有 `5410` 页面完成正向闭环：仅水域覆盖 `6678 cells / 39876 triangles`，并入仅陆地为 `10004 cells / +3326 / 59841 triangles`，排除仅陆地回到 `6678 cells / -3326 / 39876 triangles`。限制开关保持，黄色 overlay 同步扩缩；清除后摘要、GPU 和 overlay 消失，页面 / 画布正常且 console error 为 `0`。未预览或应用高度变化，未刷新、导航、新建或启动 Chrome / 服务器，所有子智能体均已结束并释放。
- 光标圆形高度选区批次统一验证完成：烟测子智能体执行 4 项 `node --check`、高度笔刷 / affected / affected 摘要三项回归、生产构建和 `git diff --check`，圆心 / 半径 / scope / 空中心 / 超大拒绝 / 空间组合与产物字段均通过。语义浏览器隔离世界无法形成 hover pick 后，运行时补产品级 canvas 中心 renderer picking 回退；最终复用同一 `5410` 页面确认半径 `24` 为 `13 cells / 79 triangles`、半径 `64` 为 `91 cells / 548 triangles`，圆心保持 `#4941`，黄色范围扩大且限制开关保持。清除后摘要、开关、GPU 和 overlay 消失，页面 / 画布稳定、console error 为 `0`。未修改高度、刷新、导航、新建或启动 Chrome / 服务器，所有子智能体均已结束释放。
- 两角矩形高度选区批次统一验证完成：烟测子智能体执行 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，角序、scope、边界拒绝、矩形组合和产物字段均通过。浏览器复用既有 `5410` 页面，覆盖待选后第一角进入起角状态，移动到第二角时淡黄预览为 `456×218 px`；第二角完成得到 `404 cells`、world 尺寸 `288.5×191.6`、GPU `2428 triangles`，黄色 overlay 和限制开关正常，预览移除。清除后摘要、开关、GPU、overlay 和预览全部消失，画布完整、console error 为 `0`。未修改高度、刷新、导航、新建或启动 Chrome / 服务器，两名子智能体均已结束释放。
- 连通等高区高度选区批次统一验证完成：烟测子智能体执行 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，BFS 容差 / scope / 邻接隔离 / 安全边界 / 组合与单点 pending 产物均通过。首次画布中心命中大海并正确触发 `2000 cells` 安全拒绝后，交互改为显式“组合 -> 单击中心”。最终浏览器在稳定页面用同一 canvas 归一位置命中 center `#3013`：容差 `0` 为 `2 cells / 84..84 / 11 triangles`，容差 `2` 为 `6 cells / 82..86 / 35 triangles`，黄色范围扩大。清除成功，高度影响 `0`、历史 `0/0`、console error 为 `0`。复用既有 Chrome 与服务器，仅在 FMG tab 消失时把既有唯一 tab 导航一次到 `5410`，未重启资源；两名子智能体均已结束释放。
- 画笔拖选高度选区批次统一验证完成：烟测子智能体执行 4 项 `node --check`、三项回归、生产构建和 `git diff --check`，候选归一、安全边界、paint 组合、pending / active、有界 snapshot、黄色 preview 与旧 buffer 恢复路径均通过。browser 语义接口只能原子 drag，无法直接观察抬手前 DOM；证据边界已记录，未把 final 当 preview。浏览器复用既有 `5410` 页面，在仅陆地、半径 `24` 下完成 7 点路径，抬手正式选区为 `57 cells / 7 stamps / 343 triangles`，黄色 overlay 与限制开关正常；高度影响 `0`、历史 `0/0`、无对象 selection、console error 为 `0`。清除后摘要、GPU、overlay 和开关消失，未刷新或重启 Chrome / 服务器；两名子智能体均已结束释放。
- 2026-07-14 暂缓后的非浏览器门禁：6 个相关运行时 / UI 文件语法检查、编辑命令 affected、摘要折叠、history peek / stats、高度笔刷和持久高亮契约回归全部通过；`pnpm run build:app` 构建 `1121` modules、约 `842ms`，仅有既有大 chunk 警告，`git diff --check` 通过。本记录不替代第 124 / 126 / 128 / 130 / 132 / 134 步真实浏览器验收，也不把暂缓项计为完成。
