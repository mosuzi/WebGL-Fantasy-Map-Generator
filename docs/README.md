# docs 目录索引

`docs/` 根目录只保留接手入口和总日志，其他文档按用途分组。不要把本地 server 日志、截图、profile 输出或临时报告直接放在根目录。

当前任务状态以 [`current-plan.md`](./current-plan.md#权威任务清单) 为唯一权威来源。其它 README、专题计划和历史日志只保留概览、设计或证据，不得各自维护另一份“当前待办”。尚未获批的发现统一写入根目录 [`FOLLOWUPS.md`](../FOLLOWUPS.md)，已经完成或明确暂缓的专题不得从旧“下一步”重新入队。

## 根目录

- `current-plan.md`：唯一权威任务清单、执行状态和最小验收口径。
- `development-log.md`：开发总日志，保留阶段历史和验证记录。

## 长期文档

- `architecture/`：架构约束和长期 UI/系统约定。
  - `architecture/floating-panel-architecture.md`：浮动面板长期边界。
  - `architecture/vue-floating-panel-pattern.md`：Vue SFC 面板复用规范。
- `plans/`：总体验收计划和复刻路线。
- `milestones/`：里程碑说明。
- `performance/`：性能基线说明和长期性能对照。
- `audits/`：审查、复盘和整改方案。
  - `audits/ui-function-and-information-architecture-audit.md`：现有功能入口、复杂度、分组、低优先级能力和浮层遮挡审计。
  - `audits/interaction-usability-audit-results.md`：权威任务第 101～107 项的交互总表、真实浏览器证据摘要、问题账本、跨系统原则和功能变更附录。
- `deployment/`：部署说明和线上环境约定。
- `task-notes/`：可入库的专题计划、评估记录、执行细则和功能积压。新增专题前先读 `task-notes/README.md`，并同步更新该索引。

## 本地或生成内容

以下目录默认不进入版本库：

- `generated/`：baseline、snapshot、报告和本地预览图等生成产物。
- `local-logs/`：本地 server 日志。

## 放置规则

- 长期架构约束放入 `architecture/`。
- 阶段验收或总体路线放入 `plans/` 或 `milestones/`。
- 某个功能、专题、source 对照或后续施工图放入 `task-notes/`，并维护 `task-notes/README.md`。
- 脚本生成的 JSON、Markdown 报告、截图和 profile 输出放入 `generated/`。
- 本地 dev server、preview server 和临时静态服务日志放入 `local-logs/`。

如果某个生成报告需要长期保留，应先整理为总结性文档，再放入上面的长期文档目录。`docs/` 根目录出现新的 `.log`、截图或生成报告时，应优先移动到 `local-logs/` 或 `generated/`，不要让根目录重新堆积。
