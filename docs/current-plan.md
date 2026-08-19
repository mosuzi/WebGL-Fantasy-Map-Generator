# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-19）**：第 349 项“地图核心引擎化与 TypeScript 核心契约渐进迁移”已获用户明确批准；`349-0`～`349-9` 已由同一只读评审智能体 `ACCEPT`，当前进入 `349-10a` terrain / grid / height-derived / climate / ocean / topology 基础域。该任务仅在 `codex/map-core-engine-architecture-plan` 并行分支推进，不得合入 `main`；禁止浏览器验收，349-7 曾误触发一次带浏览器的既有导出脚本，已首败停止且不计为验收，只在最终阶段形成并评估浏览器验收方案。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`328` 个公开方法和 `179` 个编辑方法，稳定等级为 `320 / 7 / 1`；`328 / 328` 方法可通过 `info.describe` 发现，`analysis` 新增地点解析、距离和方位三项只读入口，并保留地图模板三项、`grid` 六个受控结构方法、`planner` `10` 个配方、`objects` `20` 类对象及 `cells` 八个读取 / 预检方法。完整能力矩阵为 `1228` 行、`covered 1154 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵保持 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 第 349 项：地图核心引擎化与 TypeScript 核心契约渐进迁移

- 状态：进行中，`349-10a` 基础域迁移；`349-0`～`349-9` 已接受。
- 目标：在不重写现有算法、不产生第二 canonical owner 的前提下，建立可审计的核心事务、revision、snapshot ownership、领域 Manifest、Worker、依赖和 renderer layer 契约，并通过低风险垂直切片逐步接管旧路径。
- 阶段：`349-0` 计划冻结；`349-1` 现状盘点；`349-2` TS 工具链；`349-3` 核心契约；`349-3a` 字段注册表与身份适配器闭合；`349-4` Manifest；`349-5` 薄 facade；`349-6` notes 切片；`349-7` markers 切片；`349-8` Worker 切片；`349-9` dependency / projection；`349-10a`～`349-10g` 依赖序逐域迁移与旧路径收口；`349-11` 非浏览器终验与浏览器验收方案。
- `349-1` 强制插入依据：存档已存在的 `notes / measurements / labels / visualTheme / display` 未进入 canonical field registry，且普通 persisted document 尚无稳定 identity，不能与 runtime、render preparation、headless identity 混用；两项均会阻断 Manifest、checksum 与统一 binding，因此必须在 `349-4` 前单独验收。
- 动态插入：计划外任务只有在阻断当前验收或证明设计不安全时才能插入为新的 `349-x` 子阶段；插入后必须重新评估全部未完成阶段的依赖顺序并更新专题计划。
- 阶段门：每阶段由主线程唯一写入，完成静态与专项 Node 门后冻结 checkpoint，再由同一只读评审智能体给出 `ACCEPT / BLOCK`；只有 `ACCEPT` 才能进入下一阶段。
- 非目标：不修改 `source/`，不改变生成算法或产品语义，不批量改名旧 JS，不以 TypeScript 替代运行时 schema，不在本任务中合入或推送 `main`。
- 浏览器边界：本任务不启动、不操作也不执行任何浏览器门；既有浏览器回归仅列入最终验收方案，不作为本分支完成门。
- 施工与验收细则见 [统一执行记录](./task-notes/task-349-map-core-engine-execution.md)、[引擎实施计划](./task-notes/map-core-engine-architecture-implementation-plan.md) 与 [TypeScript 计划](./task-notes/typescript-core-contract-migration-plan.md)。

## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
