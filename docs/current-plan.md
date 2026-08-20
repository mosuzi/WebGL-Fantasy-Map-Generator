# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-20）**：第 350 项“MapCoreEngine / TypeScript CDP 全量浏览器验收”已获用户批准，在 `codex/map-core-engine-architecture-plan` 并行分支执行。验收复用第 349 项方案，按环境冻结、10k 核心事务、100k 与 session、渲染 / 拾取 / 导出、兼容 / 反馈 / 综合终验五阶段串行；首个真实失败即停，只允许一次窄诊断和一次目标复验。该分支仍不得合入 `main`。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`328` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 7 / 1`；`328 / 328` 方法可通过 `info.describe` 发现，`analysis` 新增地点解析、距离和方位三项只读入口，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1228` 行、`covered 1154 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

- **第 350 项：MapCoreEngine / TypeScript CDP 全量浏览器验收。** `BLOCK；350-0a 冷启动 binding 在限定复验后仍失败`
  - 目标、20 个固定浏览器入口、五阶段顺序、artifact、性能阈值和防空转规则见 [第 350 项执行方案](./task-notes/task-350-map-core-engine-cdp-acceptance.md)。
  - 不操作用户标签页，不合入 `main`；阻断当前验收的产品问题必须先插入独立修复阶段，才允许修改源码。
  - `350-0` 的静态、类型、27 门审计和 build 已通过；直接页面与干净 10k 事务门均确认无既有地图时 generation foundation binding 缺少 identity。两轮最窄补齐后目标门仍为同一失败，产品尝试已撤回；后续 19 个浏览器门未执行。
  - 继续前须冻结显式 pending adoption binding owner 方案，覆盖 request、current check、preload / refresh 与 commit / invalidate 全生命周期；不得继续堆叠局部 fallback。

## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
