# task-notes 专题索引

`task-notes/` 用来保存需要入库的专题计划、评估记录、执行细则和功能积压。这里的文档不是生成产物；新增或移动专题文档时，必须同步更新本索引。

专题文档中的“下一步”“缺口”只表示候选方向，不自动成为活动任务。当前批准范围和顺序统一查看 [`../current-plan.md`](../current-plan.md#权威任务清单)。

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
- `visual-theme-preset-plan.md`：视觉主题与样式预设计划。
- `console-extension-api-system-plan.md`：控制台与扩展 API 系统计划，记录 API 命名空间、返回格式、副作用边界和分阶段实施。
- `console-api-capability-inventory.md`：控制台 API 全量能力盘点，记录公开基线、现有 runtime / command 分类和第 29～33 项冻结范围。
- `api-data-compatibility-matrix.md`：权威任务第 32 项的持久化入口、旧数据兼容、诊断边界与往返验收矩阵。
- `console-api-stability-contract.md`：权威任务第 33 项的 API 版本、稳定等级、兼容别名、确认策略与扩展能力分组契约。
- `keyboard-shortcuts.md`：权威任务第 35 项的快捷键清单、公共 action、禁用条件、悬停提示和冲突规则。
- `canvas-tool-mode-manager.md`：权威任务第 36 项的 14 个画布模式、互斥生命周期、预览回滚、面板关闭和地图替换契约。
- `selection-panel-policy.md`：权威任务第 37 项的方案 B、对象类型绑定、对象详情兜底与 selection 分发例外。
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
