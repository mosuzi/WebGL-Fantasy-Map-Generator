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
- 权威任务第 70 项对应 `quark-drive-save-feasibility.md`：第一方公开证据调研已完成，结论为“当前不建议集成”；当前唯一可交付路线是本地导出后由用户上传，客户端备份目录只作为不可观测的用户辅助降级。
- 权威任务第 71～81 项统一登记于 `promoted-quasi-authoritative-tasks.md`，并分别复用 `ui-system-audit-gate.md`、`editor-and-stat-panel-inventory.md`、`height-terrain-template-programs.md`、`label-type-style-system.md` 与 `export-capability-matrix.md` 的领域证据；原 `Q-01～Q-11` 已全部按顺序转正，不再是候选池。第 73 项另有 `city-relocation-product-rules.md`；第 74 项另有 `state-merge-split-product-rules.md`，完整继承、自动择都、局部分省、兼容和排除矩阵已由用户确认。

以上只是专题入口映射，范围、顺序和验收仍以权威任务清单为准。

## Source 对照与生成质量

- `source-first-recovery-execution-plan.md`：source 优先复位整改总纲。
- `source-first-detailed-task-plan.md`：source 优先复位整改详细施工图。
- `source-feature-backlog.md`：对照原版后整理的功能积压。
- `chinese-naming-library-evaluation.md`：中文命名库评估记录。
- `heightmap-image-converter-plan.md`：高度图图片导入工作台计划。

## 编辑器与用户外壳

- `editor-and-stat-panel-inventory.md`：正式版编辑器与统计面板清单。
- `user-facing-shell-debug-export-and-naming-plan.md`：用户外壳、开发模式、导入导出和命名策略计划。
- `initialization-loading-flow.md`：页面初始化与地图加载流程规约，记录阶段边界、预算和 Chrome 验证要求。
- `render-health-monitoring.md`：渲染健康监测说明，记录本地卡顿日志、阈值、查询方式和限制。
- `object-notes-implementation-plan.md`：对象备注实现计划。
- `measurement-rulers-plan.md`：测量对象与路线贴合计划。
- `edit-command-contract.md`：编辑命令轻量契约，记录 `label / effects / affected / isNoop / getResult` 等统一约定。
- `panel-layout-overlay-performance-plan.md`：面板布局宽松化与非 WebGL overlay 性能治理计划。
- `panel-manual-positioning.md`：权威任务第 67 项的手动 / 自动位置状态、持久化兼容、共存重排和浏览器验收契约。
- `brush-radius-cursor-preview.md`：权威任务第 68 项的画笔半径控制、共享光标轮廓、非圆形工具排除和浏览器验收契约。
- `label-type-style-system.md`：权威任务第 69 项的标签类型 registry、样式字段、主题继承、省份标签、持久化和 PNG 一致性契约。
- `quark-drive-save-feasibility.md`：权威任务第 70 项的正式调研报告，记录第一方证据、公开契约空白、四路线数据流、“当前不建议集成”结论、风险、12 个书面问题和未来最小验收草案。
- `promoted-quasi-authoritative-tasks.md`：原准权威 `Q-01～Q-11` 转为第 71～81 项的编号映射、依赖、产品规则门禁和排除边界。
- `city-relocation-product-rules.md`：权威任务第 73 项已确认的归属跟随、港口失效、首都 / 省会限制、路线局部重寻和事务边界冻结稿。
- `state-merge-split-product-rules.md`：权威任务第 74 项已确认的国家合并 / 完整旧省拆分、ID 与 tombstone、首都继承、局部重新分省、外交军事经济联动、回滚兼容和排除边界冻结稿。
- `world-space-network-width.md`：权威任务第 66 项的道路 / 河流世界尺度宽度、缩放投影、亚像素表现、高亮与 picking 分层契约。
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
