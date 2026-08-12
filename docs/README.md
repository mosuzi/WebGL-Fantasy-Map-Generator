# docs 目录索引

`docs/` 根目录只保留接手入口和轻量索引，其他文档按用途分组。不要把本地 server 日志、截图、profile 输出或临时报告直接放在根目录。

当前任务状态以 [`current-plan.md`](./current-plan.md#权威任务清单) 为唯一权威来源；该文件只保留未完成、进行中或暂缓任务。已完成任务从当前清单移出，按时间分卷进入 [`task-archives/`](./task-archives/README.md)。其它 README、专题计划和历史日志只保留概览、设计或证据，不得各自维护另一份“当前待办”。尚未获批的发现统一写入根目录 [`FOLLOWUPS.md`](../FOLLOWUPS.md)，已经完成或明确暂缓的专题不得从旧“下一步”重新入队。

默认读取链固定为 `AGENTS.md → docs/README.md → docs/current-plan.md → 定向 rg / 行段读取`。完整开发日志、任务归档、`generated/`、trace、截图和大型矩阵只在追溯具体问题时读取，不得作为普通任务前置上下文。

## 根目录

- `current-plan.md`：唯一权威任务清单，只保留当前未完成、进行中或暂缓任务及其最小验收口径。
- `development-log.md`：开发历史的轻量日期索引；正文按日期片保存在 `development-logs/`，只在追溯时定向读取。
- `ai/README.md`：默认 AI 会话固定入口，路由到运行时、数据模型、区域分析、安全修改和匿名化复杂区域干预行动手册。

## 长期文档

- `architecture/`：架构约束和长期 UI/系统约定。
  - `architecture/floating-panel-architecture.md`：浮动面板长期边界。
  - `architecture/vue-floating-panel-pattern.md`：Vue SFC 面板复用规范。
  - `architecture/laboratory-prototypes.md`：四个独立实验室 / 原型的职责、入口、验证、部署和正式应用边界。
- `plans/`：总体验收计划和复刻路线。
- `milestones/`：里程碑说明。
- `performance/`：性能基线说明和长期性能对照。
  - `performance/canvas-performance-investigation-report.md`：权威任务第 269 项正式画布性能实际调查，记录冷 / 暖态、连续视口、idle commit、消融、状态动作、Trace、盲区和分级优化建议。
  - `performance/canvas-performance-optimization-report.md`：权威任务第 270～272 项实际优化结果，记录交互事件收敛、100k 装载收益、状态动作、回归门禁、真实浏览器结论和剩余风险。
  - `task-notes/canvas-performance-optimization-plan.md`：权威任务第 270～272 项封闭施工图，冻结交互快路径、装载 / 颜色优化、事件预算与真实浏览器验收边界。
- `audits/`：审查、复盘和整改方案。
  - `audits/ui-function-and-information-architecture-audit.md`：现有功能入口、复杂度、分组、低优先级能力和浮层遮挡审计。
  - `audits/interaction-usability-audit-results.md`：权威任务第 101～107 项的交互总表、真实浏览器证据摘要、问题账本、跨系统原则和功能变更附录。
  - `audits/compound-semantic-action-matrix.md`：权威任务第 204 项全游戏复合语义规则事务、AI 规划器配方和公开 API / Cell 动作覆盖矩阵。
- `deployment/`：部署说明和线上环境约定。
- `task-archives/`：已完成权威任务的时间分卷与编号索引；接手执行默认不读，需要追溯历史决策时再按日期或编号检索。
- `development-logs/`：开发历史的日期分卷与迁移完整性索引；默认不整目录读取。
- `task-notes/`：可入库的专题计划、评估记录、执行细则和功能积压。新增专题前先读 `task-notes/README.md`，并同步更新该索引。
- `assets/readme/`：由仓库内确定性工具生成、需要随中英文 README 长期入库的展示图片；本地调查截图仍放在 `generated/`。
- `wiki/assets/`：由固定 `mountains-and-seas` 夹具和隔离系统 Chrome 确定性生成、随中文 Wiki 长期入库的功能说明截图；场景、alt 与图注以 `wiki/screenshot-manifest.json` 为准，审计要求每处 Markdown 引用与之完全一致。

## 本地或生成内容

以下目录默认不进入版本库：

- `generated/`：baseline、snapshot、报告和本地预览图等生成产物。
- `local-logs/`：本地 server 日志。

## 放置规则

- 长期架构约束放入 `architecture/`。
- 阶段验收或总体路线放入 `plans/` 或 `milestones/`。
- 某个功能、专题、source 对照或后续施工图放入 `task-notes/`，并维护 `task-notes/README.md`。
- 长任务 checkpoint、委派 brief 和新会话恢复使用 [`task-notes/lean-stage-handoff-template.md`](./task-notes/lean-stage-handoff-template.md)，不得复制完整会话或日志。
- 已完成权威任务按完成日期移入 `task-archives/` 对应时间卷，并同步更新归档索引；不得把历史重新合并成单一巨型清单。
- 脚本生成的 JSON、Markdown 报告、调查截图和 profile 输出放入 `generated/`；只有 `assets/readme/` 与 `wiki/assets/` 中经过确定性工具和审计约束的长期图片例外。
- 本地 dev server、preview server 和临时静态服务日志放入 `local-logs/`。

如果某个生成报告需要长期保留，应先整理为总结性文档，再放入上面的长期文档目录。`docs/` 根目录出现新的 `.log`、截图或生成报告时，应优先移动到 `local-logs/` 或 `generated/`，不要让根目录重新堆积。
