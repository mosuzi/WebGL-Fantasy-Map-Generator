# task-notes 专题索引

`task-notes/` 用来保存需要入库的专题计划、评估记录、执行细则和功能积压。这里的文档不是生成产物；新增或移动专题文档时，必须同步更新本索引。

专题文档中的“下一步”“缺口”只表示候选方向，不自动成为活动任务。当前批准范围和顺序统一查看 [`../current-plan.md`](../current-plan.md#权威任务清单)。

## 专题映射

- 地图核心引擎架构调查与新方案见 [`map-core-engine-architecture-proposal.md`](./map-core-engine-architecture-proposal.md)：基于当前 canonical map、事务 / 历史、Worker 副本、GPU resident renderer、存档和 API 的实际边界，提出 `MapCoreEngine + RenderEngine + UI shell` 的渐进式契约方案；本文是未授权实施的架构评估，不自动进入当前任务清单。

- 第 347 项的 100k 城镇完全重生成端到端账本、picking 安装热点优化、`9969ms → 1886.3ms` 和用户原图撤销验收记录于 [`task-347-city-regeneration-performance.md`](./task-347-city-regeneration-performance.md)；没有以 Loading 文案、降数量、删依赖层或放宽语义换取成绩。
- 第 346 项的用户当前地图真实重生成 Profile、阶段耗时拆解和 Loading 文案优化冻结于 [`task-346-regeneration-profile-loading-copy.md`](./task-346-regeneration-profile-loading-copy.md)；Profile 后必须撤销恢复原图，普通界面不得泄漏内部实现概念。
- 第 345 项的十一类完全重生成语义、城镇从空重建、行政角色生成后重选、陆地不变量、身份变化与用户原图 Chrome 验收冻结于 [`task-345-true-regeneration-semantics.md`](./task-345-true-regeneration-semantics.md)；只有显式锁和局部范围外对象可以保留。
- 第 344 项的城镇主动重生成优先级、无有效省会候选事务内收敛、Worker / 回退一致性与用户原图 Chrome 验收冻结于 [`task-344-city-regeneration-priority.md`](./task-344-city-regeneration-priority.md)；显式锁、结构与事务安全门保持不变。
- 第 343 项的用户主动重生成优先级、旧省会不一致事务内修复、十一类地理硬门审计与原图 Chrome 验收冻结于 [`task-343-regeneration-priority-and-geographic-gates.md`](./task-343-regeneration-priority-and-geographic-gates.md)；显式锁、结构完整性、回滚和撤销仍是硬门。
- 第 335 项的 GPU 常驻 cell attribute / palette、surface 顶点去颜色化、普通视图零 Worker 重编译、政治 topology cache、平滑 correction、overlay / picking identity、UI latest-wins 和版本握手冻结于 [`task-335-gpu-resident-view-switch.md`](./task-335-gpu-resident-view-switch.md)；每个 335-A～J 阶段只在独立任务分支本地提交，统一验收后再推送。
- 第 334 项的 100k Worker 端到端延迟、显示事务 effect / layer 矩阵、renderer suspension、存档输出 / 读取 transport 与画布心跳边界冻结于 [`task-334-worker-end-to-end-latency.md`](./task-334-worker-end-to-end-latency.md)；坚持 Worker 化和单一 operation owner，不开放冲突任务积压。
- 第 333 项的 Worker 全图重传调查、共享版本化副本 / 增量日志和 `.webfmg v3` 列式二进制存档方案冻结于 [`task-333-worker-replica-and-binary-map.md`](./task-333-worker-replica-and-binary-map.md)；同一 canonical 字段注册表同时服务跨任务 Worker 副本、撤销 / 重做 patch 和新存档格式，避免两套数据描述再次漂移。
- 第 331 项的 100k 重生成 / 存档瓶颈、真实阶段 Loading、单次序列化、二进制 IndexedDB、canonical map mirror 与增量 prepared renderer 边界冻结于 [`task-331-save-regeneration-performance.md`](./task-331-save-regeneration-performance.md)；普通用户只看山河推演 / 存档阶段，调试数据保留 transport、compute、render、serialize、compress 和 storage 精确标量。
- 第 332 项的 100k 视图切换瓶颈、持久 Worker 渲染缓存、冷启动与精确 LongTask 登记边界冻结于 [`task-332-view-switch-performance.md`](./task-332-view-switch-performance.md)。
- 第 329 项的 LongTask 登记例外复核、当前机器门风险、C3c 重点诊断和分级停止条件冻结于 [`task-329-long-task-exception-convergence.md`](./task-329-long-task-exception-convergence.md)；已被后续实现消除的信号只收紧工具，不重复改产品。
- 第 330 项的全局 Loading、面板懒加载和 `28` 个 Vue 编辑 / 统计面板普通用户文案盘点冻结于 [`task-330-loading-and-panel-copy-polish.md`](./task-330-loading-and-panel-copy-polish.md)；普通界面结果导向，调试诊断保留技术精度。
- 第 328 项的大河政治软阻隔、统一评分、国家 / 省份 / 局部重分省接线、诊断和分级验收冻结于 [`task-328-river-political-boundary-stage-design.md`](./task-328-river-political-boundary-stage-design.md)。河网只作输入证据，旧图载入、手工边界和非政治操作不自动重划。
- 第 327 项的精简任务包、阶段 checkpoint、委派 brief 和新会话恢复统一使用 [`lean-stage-handoff-template.md`](./lean-stage-handoff-template.md)；改造前后预算见 [`task-327-context-budget-before.md`](./task-327-context-budget-before.md) 与 [`task-327-context-budget-after.md`](./task-327-context-budget-after.md)，任务级角色 dry run 见 [`task-327-flow-dry-run.md`](./task-327-flow-dry-run.md)。只传当前阶段边界、证据结论和 artifact 路径，不复制完整日志或会话。
- 已完成并归档的权威任务第 304-F～G、305、306 项共用 [`task-304-306-river-city-reinvestigation.md`](./task-304-306-river-city-reinvestigation.md)：保存用户 5410 失败现场、根因调查、实施决议与最终 ACCEPT 证据；第 305 项完成共享三次曲线和唯一控制点输入链，第 306 项完成多城索引、跨境首府重算与不卡顿拖动。
- 已完成并归档的权威任务第 304、312、313 项对应 [`task-304-river-network-lab.md`](./task-304-river-network-lab.md)：独立河流网络实验室完成 304-F 证据校准与 304-G 汇流曲线候选 / 新决策门；第 312 项把“支流未接入干流”主夹具纠正为可修复 accepted 正例并保留独立超长桥拒绝门；第 313 项把同一实现抽为正式共享模块并接入 canonical 河网归一化后的新图生成链。100k 同快照旧 baseline 保持 BLOCK，实验室与正式候选均 accepted。
- 权威任务第 300 项对应 [`task-300-height-brush-commit-performance.md`](./task-300-height-brush-commit-performance.md)：只读隔离测量 100k 高度笔刷抬手提交的分段耗时，先区分面板全图统计、局部 / 拓扑渲染和其它主线程阶段，再实施证据驱动的增量优化；不操作用户当前标签页，不改变地图、派生重算、schema、存档、API 或 `source/`。
- 权威任务第 301 项对应 [`task-301-height-brush-stop-blocking.md`](./task-301-height-brush-stop-blocking.md)：纠正第 300 项遗漏的 pointerup 前后完整卡顿链，覆盖末点补刷、待执行 RAF、最终视觉 draw、首次索引构建和真实浏览器长任务；先调查再实施，不操作用户当前标签页，不改变地图、schema、存档或 `source/`。
- 权威任务第 302 项的历史方案见 [`task-302-city-manual-relocation.md`](./task-302-city-manual-relocation.md)；其失效的交互 / 性能和旧政治门禁已由完成并归档的第 306 项纠正。
- 权威任务第 303 项的历史方案见 [`task-303-river-multi-control-points.md`](./task-303-river-multi-control-points.md)；其失效的新增 / 拖动 / 双击删除和曲线结论已由完成并归档的第 305 项纠正。

- 权威任务第 284 项对应 [`task-284-100k-performance-investigation-and-plan.md`](./task-284-100k-performance-investigation-and-plan.md)：先记录精确用户标签页的存档、100k 高度编辑和 renderer / overlay 证据，再拆分 284-A～284-E；调查与方案已完成，284-A～284-D 的存档、编辑、renderer / overlay / picking、导出与 base64 内存优化已验收，当前进入 284-E。

- 权威任务第 298 项对应 [`grid-topology-refinement-and-controlled-api.md`](./grid-topology-refinement-and-controlled-api.md)，现已完成：冻结受控网格快照、母子映射、派生迁移、事务回滚与 10k → 100k 验收门禁，并以系统 Chrome 完成生产链复验。

- 权威任务第 266 项对应 `readme-showcase-capture.md`：集中 fresh session 的默认图层与标签风格，并用隔离系统 Chrome + CDP 从正式 PNG 合成链确定性生成中英文 README 共用的 relief / atlas 两张展示图。
- 权威任务第 269 项对应 `canvas-performance-investigation-plan.md`，现已完成：调查方案在采样前独立审阅通过，生产构建与系统 Chrome 已分离 generation、`loadMap`、draw、idle commit、overlay 和浏览器主线程成本；实际结论与分级建议见 [`../performance/canvas-performance-investigation-report.md`](../performance/canvas-performance-investigation-report.md)，本项没有直接实施优化。
- 权威任务第 270～272 项对应 `canvas-performance-optimization-plan.md`，现已完成：连续视口使用 rAF preview 与 overlay 根变换，组合图层和 locate 重复事务已收敛，100k 装载 paired 中位下降 `26.8%`，三档系统 Chrome、状态动作、测量重场景和专项回归已验收；实际结果见 [`../performance/canvas-performance-optimization-report.md`](../performance/canvas-performance-optimization-report.md)，标签渲染架构迁移不在本批。
- 权威任务第 257～258 项对应 `project-app-icon.md`：设计原创无文字应用图标，生成浏览器与安装入口所需尺寸，并补齐 64 / 256px、favicon、manifest、Apple Touch Icon 和真实浏览器验收；第 258 项的 Cloud Provider Config 见 `docs/deployment/cloud-storage.md`。
- 权威任务第 263～264 项对应 `app-and-canvas-icon-system.md`：把用户选定的微缩山河城池 A 方案接入应用图标，并以 `9 + 3 + 58 + 10 = 80` 个稳定键统一城镇、Marker / 资源点与军事图标，冻结旧数据、DOM / PNG 和系统 Chrome 验收边界。
- 权威任务第 259 项对应 `docs/deployment/cloud-storage.md`：把 Dropbox 回调统一为独立轻量页，由原窗口校验 popup、同源、state 与握手期限并换取令牌；Google Drive 不在本项修改范围。

- 权威任务第 227～228 项对应 `controlled-browser-bridge-and-headless-write.md`：先建立视觉开启、懒加载、默认只读并可刷新重连的当前标签页受控桥，再建立复用领域事务、失败回滚且默认输出新文件的无头写入运行时。
- 权威任务第 223～226 项对应 `headless-api-ai-docs-wiki.md`：依次建立共享 API 核心与无浏览器只读运行时、区域聚合与三个标准问题基线、AI 友好文档和机器目录、GitHub Wiki 人类文档与可复现发布流程；当前标签页受控桥和无头写入不在本批。
- 权威任务第 220～222 项对应 `zone-semantics-natural-regions-and-wilderness.md`：依次补齐事件地区参与方与详情、自然 / 自定义地区及中性基础影响、自动无人区连通分块与独立名称标签；旧图只做非破坏性归一化，不把 biome 或中立国家语义混入地区。
- 权威任务第 236～241、262 项对应 `layer-controls-zone-naming-and-cloud-storage.md`：依次整理图层入口、统一网格默认状态、改进自动无人区命名、隐藏纹章入口、收紧下拉箭头间距，新增显式配置的 Dropbox / Google Drive 云端存档，并在当前标签页刷新后恢复仍有效的短期连接。
- 权威任务第 242～244 项对应 `panel-loading-and-zone-regeneration.md`：依次修复地区管理和云端存储跨构建首次加载失败、补共享可恢复错误态，并把已有地区重生成事务接入用户界面及空地区兼容。
- 权威任务第 245～247 项继续对应 `label-type-style-system.md`：先把地区名称补为第六类地图语义标签，再建立画布文字分层机器分母，最后统一验证实时画布、PNG、旧图、API 与响应式。
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
- `zone-semantics-natural-regions-and-wilderness.md`：权威任务第 220～222 项施工图，冻结事件参与方、自然 / 自定义地区、中性基础影响、自动无人区连通分块、名称继承、标签与旧图兼容边界。
- `layer-controls-zone-naming-and-cloud-storage.md`：权威任务第 236～241、262 项施工图，冻结复合图层、无人区语义命名、共享下拉框，以及两类云存储的兼容、会话恢复和安全边界。
- `../deployment/cloud-storage.md`：权威任务第 241、259、261、262 项的云服务部署入口，记录 OAuth 公开配置、Dropbox 独立回调页、Google Drive 存档目录配置与当前标签页会话恢复边界。
- `panel-loading-and-zone-regeneration.md`：权威任务第 242～244 项施工图，冻结两处面板加载、共享恢复态、云端组件依赖和地区重生成入口、锁定及空集合边界。
- `headless-api-ai-docs-wiki.md`：权威任务第 223～226 项施工图，冻结共享核心、无头只读边界、区域聚合、三个标准问题、AI 文档机器目录、Wiki 源稿和发布门禁。
- `wiki-functional-manual-and-screenshot-plan.md`：权威任务第 274 项施工图，冻结中文 Wiki 的人类任务导航、功能说明模板、真实界面截图清单、隐私边界、确定性门禁和递归发布资产链。
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
- `map-save-naming-and-extension.md`：权威任务第 268 项的地图名称、共享文件名模板、`.webfmg` 原生存档外壳与旧格式兼容边界。
- `political-geojson-dissolve-plan.md`：政治面 GeoJSON 与 dissolve 计划。

## 名称库

- `namebase-editor-plan.md`：名称库编辑器计划。
- `namebase-generation-binding-plan.md`：名称库绑定生成计划。

## 世界系统与后续大功能

- `economy-market-trade-plan.md`：市场、商品与贸易流计划。
- `government-system-and-state-title-plan.md`：政体系统、国家国号后缀和政体影响规则。
- `military-battle-plan.md`：静态军事图层与管理面板设计。
- `emblems-coa-plan.md`：纹章与 Coat of Arms 远期资料；用户已明确短期不深化，不得自动入队。
- `task-326-place-analysis-stage-design.md`：权威任务第 326 项的地点解析、行政代表点、距离 / 方位口径与三阶段交付冻结稿。

## 维护规则

- 临时日志不放在本目录，写入 `docs/local-logs/`。
- 脚本产出的报告、截图和 baseline 不放在本目录，写入 `docs/generated/`。
- 如果文档已经进入稳定架构约束、部署说明、性能基线或里程碑说明，应移动到 `docs/architecture/`、`docs/deployment/`、`docs/performance/` 或 `docs/milestones/`，本索引只保留指向它的说明。
