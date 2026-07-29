# task-notes 专题索引

`task-notes/` 用来保存需要入库的专题计划、评估记录、执行细则和功能积压。这里的文档不是生成产物；新增或移动专题文档时，必须同步更新本索引。

专题文档中的“下一步”“缺口”只表示候选方向，不自动成为活动任务。当前批准范围和顺序统一查看 [`../current-plan.md`](../current-plan.md#权威任务清单)。

## 当前活动专题映射

- 权威任务第 64 项对应 `canvas-tool-mode-manager.md`：修正省份笔刷抬手提交与取消回滚，并把画布模式回归清单从 19 个同步到运行时真实 23 个，不扩展其它省份能力。
- 权威任务第 65 项对应 `selection-panel-policy.md`：按既有方案 B 补独立备注的 `notes-panel` 绑定，不改变其它对象路由。
- 权威任务第 66 项对应 `world-space-network-width.md`：把道路与河流基础线宽从固定屏幕像素改为随相机投影的世界尺度语义宽度，同时保留屏幕尺度的高亮与命中能力。
- 权威任务第 67 项对应 `panel-manual-positioning.md`：用户拖动后的主面板位置优先于左右停靠、工具栏避让和对象详情配对，自动布局只做首次落点与越界兜底。
- 权威任务第 68 项对应 `brush-radius-cursor-preview.md`：统一连续圆形画笔的可见大小控制、世界半径命中契约和随相机投影的光标范围预览。
- 权威任务第 69 项对应 `label-type-style-system.md`：按国家、省份、首都、普通城市和手工标签分别配置字体、字号、描边等样式，并在控制面板新增独立“样式”Tab。
- 权威任务第 80 项对应 `label-display-priority-and-position-lock.md`：在同一标签类型 registry 上增加逐标签优先级、世界锚点锁定、确定性碰撞、完整地图和 PNG 一致性。
- 权威任务第 81 项对应 `network-geojson-field-dictionary.md`：为路线和河流建立 v1 稳定字段、中文类型 / 等级、名称、长度、可靠统计与旧字段兼容契约。
- 权威任务第 70 项对应 `quark-drive-save-feasibility.md`：第一方公开证据调研已完成，结论为“当前不建议集成”；当前唯一可交付路线是本地导出后由用户上传，客户端备份目录只作为不可观测的用户辅助降级。
- 权威任务第 71～81 项统一登记于 `promoted-quasi-authoritative-tasks.md`，并分别复用 `ui-system-audit-gate.md`、`editor-and-stat-panel-inventory.md`、`height-terrain-template-programs.md`、`label-type-style-system.md` 与 `export-capability-matrix.md` 的领域证据；原 `Q-01～Q-11` 已全部按顺序转正，不再是候选池。第 73 项另有 `city-relocation-product-rules.md`；第 74 项另有 `state-merge-split-product-rules.md`；第 75 项另有 `coastline-feature-topology-product-rules.md`；第 76 项另有 `culture-religion-expansion-product-rules.md`；第 77 项另有 `suitability-brush-product-rules.md`；第 78 项另有 `population-adjustment-product-rules.md`，冻结区域增减、非守恒总量、比例分摊、零人口和事务边界。
- 权威任务第 82～86 项统一登记于 `authoritative-tasks-82-86.md`：依次处理管理面板首次左侧落点、湖泊名称中“湖”的多数分布、地图 overlay 文本禁止选中、主题导入 / 导出按钮文字规格统一，以及水体与地貌统计详情区紧凑排版。
- 权威任务第 87 项登记于 `authoritative-task-87.md`：只修正悬停菜单被国家、省份名称标签遮挡的堆叠层级，不扩展为全局浮层重构。
- 权威任务第 88～93 项来源登记于 `next-quasi-authoritative-tasks-2026-07-18.md`：原 `Q-12～Q-17` 已获用户整体批准并按顺序转正；当前状态与验收以权威任务清单为准。
- 权威任务第 101～107 项来源登记于 `next-quasi-authoritative-interaction-audit-tasks-2026-07-19.md`：原 `Q-18～Q-24` 已获用户整体批准并按顺序转正，依次冻结交互分母与夹具、审计高频闭环、直接操控、复杂面板、危险恢复、键盘响应式，并在最后统一进行浏览器验证。
- 第 101～107 项完成后形成的下一批交互整改来源登记于 `next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md`：`Q-25～Q-27` 已转为权威任务第 201～203 项并完成；`Q-28～Q-33` 于 2026-07-29 获批，按依赖转为权威任务第 211～216 项，其中第 216 项增加管理 Tab 编辑弹框高度预算验收。
- 权威任务第 217～218 项对应 `city-scale-and-provincial-capital-consistency.md`：先统一人口规模、图标、提示、手工视觉与行政角色语义，再在最终城市人口形成后确定性重评省会；旧地图加载不静默改视觉或迁都，现有地图只通过显式预览 / 确认事务重评。
- 权威任务第 128、159 项对应 `boundary-smoothing-topology-research.md`：比较边界简化 / spline / coverage 算法，冻结共享弧线数据结构、填充与描边同源不变量、缓存失效、编辑提交时序、许可边界和海岸线 → 国界 → 省界的分阶段建议，并链接已完成的独立拓扑实验室；不改正式 renderer。
- 权威任务第 205 项对应 `regeneration-object-lock-system.md`：为 14 个可重生成对象列表、15 类稳定列表行建立逐行锁定、列表 / 地图批量选择、持久化锁仓和全重生成入口保护，并按锁仓 API、共享 UI、领域生成器与复合链分阶段实施。
- 权威任务第 206 项对应 `river-network-parent-and-confluence-integrity.md`：把 `parent` 收敛为真实陆地汇流关系，补生成后河网门禁、旧图非破坏性归一化，以及列表、详情、悬停和对象查询中的直接干流信息。

以上只是专题入口映射，范围、顺序和验收仍以权威任务清单为准。

## Source 对照与生成质量

- `source-first-recovery-execution-plan.md`：source 优先复位整改总纲。
- `source-first-detailed-task-plan.md`：source 优先复位整改详细施工图。
- `source-feature-backlog.md`：对照原版后整理的功能积压。
- `chinese-naming-library-evaluation.md`：中文命名库评估记录。
- `heightmap-image-converter-plan.md`：高度图图片导入工作台计划。

## 编辑器与用户外壳

- `interaction-usability-audit-plan.md`：全功能交互与可用性专项审计方案；以真实用户任务链排查冗余、无效、流程、状态、样式、恢复、键盘和响应式问题，纯交互建议与需要功能变更的提案分开，未获批准前不形成权威任务。
- `next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md`：统一交互审计形成的 `Q-25～Q-33` 来源问题、功能变化边界和最小验收；`Q-25～Q-27` 已转为权威任务第 201～203 项并完成，`Q-28～Q-33` 已于 2026-07-29 按依赖转为权威任务第 211～216 项。
- `city-scale-and-provincial-capital-consistency.md`：权威任务第 217～218 项的真实浏览器反例、单一城市规模契约、行政角色附加表达、最终省会重评、锁定保护、旧图兼容和统一验收矩阵。
- `editor-and-stat-panel-inventory.md`：正式版编辑器与统计面板清单。
- `user-facing-shell-debug-export-and-naming-plan.md`：用户外壳、开发模式、导入导出和命名策略计划。
- `initialization-loading-flow.md`：页面初始化与地图加载流程规约，记录阶段边界、预算和 Chrome 验证要求。
- `render-health-monitoring.md`：渲染健康监测说明，记录本地卡顿日志、阈值、查询方式和限制。
- `cell-diagnostics-and-ai-api-design.md`：权威任务第 195 项经新智能体 `RELEASE` 的实施编排，消费第 200 项能力矩阵，按 Cell 只读、诊断图层、全动作 inspector 与同族创建、受控写缺口四阶段实施。
- `console-api-full-audit-and-gap-closure-2026-07-25.md`：权威任务第 200 项执行说明与结果，记录全量能力分母、机器矩阵、AI 描述层、对象发现和非 Cell API 缺口关闭。
- `compound-semantic-api-and-gameplay-rules.md`：权威任务第 204 项规则分层说明，区分事实/原子原语、单事务规则动作和 AI 规划器玩法配方，并为完整玩法文档冻结领域骨架。
- `compound-semantic-gap-implementation-plan.md`：权威任务第 207～210 项施工图，冻结 24 个 inspector、5 个碎片事务、6 个游戏规则与 10 个 AI 配方的实施顺序、默认规则和人类审阅格式。
- `gameplay-rules-and-ai-planner-recipes.md`：权威任务第 210 项已发布的完整中文玩法说明，覆盖十二个领域章节、十个机器配方和四十三个顶层步骤，并带 canonical registry SHA-256 与自动同步附录。
- `regeneration-object-lock-system.md`：权威任务第 205 项重生成对象锁定专题，冻结 14 个列表页 / 15 类行的覆盖分母、版本化锁仓、列表与地图批量选择、生成器约束、冲突回滚、API 和旧存档兼容。
- `river-network-parent-and-confluence-integrity.md`：权威任务第 206 项河网完整性专题，冻结直接干流、汇流点、流域根、湖泊入流、孤立旧河段和可见诊断契约。
- `object-table-column-width-audit-2026-07-24.md`：权威任务第 197 项对象列表默认列宽审计，以 24 个宿主 / 27 张表为分母，记录语义宽度分档、首都列收敛和一次性偏好迁移边界。
- `object-notes-implementation-plan.md`：对象备注实现计划。
- `measurement-rulers-plan.md`：测量对象与路线贴合计划。
- `edit-command-contract.md`：编辑命令轻量契约，记录 `label / effects / affected / isNoop / getResult` 等统一约定。
- `panel-layout-overlay-performance-plan.md`：面板布局宽松化与非 WebGL overlay 性能治理计划。
- `panel-manual-positioning.md`：权威任务第 67 项的手动 / 自动位置状态、持久化兼容、共存重排和浏览器验收契约。
- `brush-radius-cursor-preview.md`：权威任务第 68 项的画笔半径控制、共享光标轮廓、非圆形工具排除和浏览器验收契约。
- `label-type-style-system.md`：权威任务第 69 项的标签类型 registry、样式字段、主题继承、省份标签、持久化和 PNG 一致性契约。
- `label-display-priority-and-position-lock.md`：权威任务第 80 项的逐标签布局覆盖、优先级、世界锚点、碰撞 / LOD、旧图兼容与 PNG 契约。
- `network-geojson-field-dictionary.md`：权威任务第 81 项的 route / river GeoJSON v1 字段字典、空值规则、serializer 共用和外部工具验证边界。
- `quark-drive-save-feasibility.md`：权威任务第 70 项的正式调研报告，记录第一方证据、公开契约空白、四路线数据流、“当前不建议集成”结论、风险、12 个书面问题和未来最小验收草案。
- `promoted-quasi-authoritative-tasks.md`：原准权威 `Q-01～Q-11` 转为第 71～81 项的编号映射、依赖、产品规则门禁和排除边界。
- `authoritative-tasks-82-86.md`：用户 2026-07-18 批准的五项新权威任务来源、顺序、共享执行方式和明确排除边界。
- `authoritative-task-87.md`：用户 2026-07-18 反馈的悬停菜单与国家 / 省份标签层级问题、最小范围和验收边界。
- `next-quasi-authoritative-tasks-2026-07-18.md`：原 `Q-12～Q-17` 的调查来源、排除项和转正映射；现对应权威任务第 88～93 项。
- `next-quasi-authoritative-interaction-audit-tasks-2026-07-19.md`：原 `Q-18～Q-24` 转为权威任务第 101～107 项的来源、依赖、最小验收、统一浏览器验证和禁止越界范围。
- `city-relocation-product-rules.md`：权威任务第 73 项已确认的归属跟随、港口失效、首都 / 省会限制、路线局部重寻和事务边界冻结稿。
- `state-merge-split-product-rules.md`：权威任务第 74 项已确认的国家合并 / 完整旧省拆分、ID 与 tombstone、首都继承、局部重新分省、外交军事经济联动、回滚兼容和排除边界冻结稿。
- `coastline-feature-topology-product-rules.md`：权威任务第 75 项已确认的海岸雕刻、填岸、开 / 闭海峡、湖海开渠、整湖填平、派生 Feature split / merge、高度跨海平面、ID 与回滚兼容边界冻结稿。
- `culture-religion-expansion-product-rules.md`：权威任务第 76 项的文化 / 宗教中心合法性、确定性回退、文化类型、宗教扩张范围、联动选择、继承修复和旧图默认值冻结稿。
- `suitability-brush-product-rules.md`：权威任务第 77 项的直接设值范围、基础值 / 手工 override、陆水边界、人口承载、旧图回填和单 stroke 事务冻结稿。
- `population-adjustment-product-rules.md`：权威任务第 78 项的单一区域人口增减、城乡比例分摊、零人口 / 上限拒绝、统计与经济摘要同步和单事务冻结稿。
- `world-space-network-width.md`：权威任务第 66 项的道路 / 河流世界尺度宽度、缩放投影、亚像素表现、高亮与 picking 分层契约。
- `boundary-smoothing-topology-research.md`：权威任务第 128、159 项的边界平滑调研与独立验证原型，记录候选算法取舍、推荐共享弧线管线、八类固定夹具和验收入口。
- `visual-theme-preset-plan.md`：视觉主题与样式预设计划。
- `console-extension-api-system-plan.md`：控制台与扩展 API 系统计划，记录 API 命名空间、返回格式、副作用边界和分阶段实施。
- `console-api-capability-inventory.md`：控制台 API 全量能力盘点，记录公开基线、现有 runtime / command 分类和第 29～33 项冻结范围。
- `api-data-compatibility-matrix.md`：权威任务第 32 项的持久化入口、旧数据兼容、诊断边界与往返验收矩阵。
- `console-api-stability-contract.md`：权威任务第 33 项的 API 版本、稳定等级、兼容别名、确认策略与扩展能力分组契约。
- `keyboard-shortcuts.md`：权威任务第 35 项的快捷键清单、公共 action、禁用条件、悬停提示和冲突规则。
- `canvas-tool-mode-manager.md`：权威任务第 36 项的画布模式、互斥生命周期、预览回滚、面板关闭和地图替换契约；第 64 项只修正省份笔刷结束事件接线。
- `selection-panel-policy.md`：权威任务第 37 项的方案 B、对象类型绑定、对象详情兜底与 selection 分发例外；第 65 项补独立备注绑定。
- `height-terrain-template-programs.md`：权威任务第 38 项的多步骤选区模板、用户模板文档、持久化交换和 Source 转换边界。
- `delete-impact-and-batch.md`：权威任务第 39 项的统一删除预检、高影响确认、领域批量事务和结构化结果契约。
- `map-object-creation.md`：权威任务第 40 项的路线绘制、河流新增、湖泊开挖及其拓扑、水文、岸线和撤销契约。
- `auxiliary-object-creation.md`：权威任务第 41 项的地区、通用标记和独立备注身份、创建、删除、孤儿迁移与持久化契约。
- `import-diagnostics-schema-evolution.md`：权威任务第 42 项的 GEO、Cells GEO、高度图统一诊断、隐私边界与地图 schema 链式迁移契约。
- `political-gis-external-verification.md`：权威任务第 43 项的固定 100k 浏览器下载、QGIS / geojson.io 实际读取与外部 id 兼容修正证据。
- `png-crop-overlay-export.md`：权威任务第 44 项的四类 PNG 裁剪、七类 overlay 白名单、默认兼容和浏览器文件级证据。
- `action-entry-and-icon-vocabulary.md`：权威任务第 57 项的定位入口、领域重生成、危险动作分组与最小图标词表。
- `high-complexity-panel-layers.md`：权威任务第 58 项的高度、军事、导出首层与高级区能力盘点及验收边界。
- `ui-terminology-and-state-feedback.md`：权威任务第 59 项的对象术语、选中 / 编辑 / 预览状态和空态 / 异常态恢复契约。
- `ui-system-audit-gate.md`：权威任务第 60 项的多面板、键盘可访问性、缩放安全区、懒加载、长任务和连续打开内存门禁。

## 导入导出与 GIS

- `export-capability-matrix.md`：导出能力矩阵。
- `political-geojson-dissolve-plan.md`：政治面 GeoJSON 与 dissolve 计划。

## 名称库

- `namebase-editor-plan.md`：名称库编辑器计划。
- `namebase-generation-binding-plan.md`：名称库绑定生成计划。

## 世界系统与后续大功能

- `economy-market-trade-plan.md`：市场、商品与贸易流计划。
- `government-system-and-state-title-plan.md`：政体系统、国家国号后缀和政体影响规则。
- `military-battle-plan.md`：静态军事图层与管理面板设计。
- `emblems-coa-plan.md`：纹章与 Coat of Arms 远期资料；用户已明确短期不深化，不得自动入队。

## 维护规则

- 临时日志不放在本目录，写入 `docs/local-logs/`。
- 脚本产出的报告、截图和 baseline 不放在本目录，写入 `docs/generated/`。
- 如果文档已经进入稳定架构约束、部署说明、性能基线或里程碑说明，应移动到 `docs/architecture/`、`docs/deployment/`、`docs/performance/` 或 `docs/milestones/`，本索引只保留指向它的说明。
