# 当前开发计划

本文件是唯一权威任务清单，只保留未完成、进行中或暂缓的任务。已完成任务按时间分卷移入 [权威任务归档](./task-archives/README.md)，不得从 README、开发日志、专题文档或归档中的“下一步”自行恢复为当前任务。

## 当前状态

> **执行门禁（2026-08-08）**：权威任务第 301、302 项已完成并按完成日期归档。第 303 项已完成只读调查，现按 303-A～303-E 封闭子任务实施：先建立可选控制点数据契约，再接入预览交互、河流 / 控制点视觉与 picking，最后做兼容和双档 Chrome 验收。不接管或刷新用户当前 Chrome 标签页，不修改 `source/`。其余既有完成状态见归档索引。

当前 API 基线为：`window.webglGeneratorApi` 覆盖 `18` 个命名空间、`322` 个公开方法和 `179` 个编辑方法，稳定等级为 `314 / 7 / 1`；`322 / 322` 方法可通过 `info.describe` 发现，新增 `grid` 六个受控结构摘要、快照、预检与事务方法；`planner.listRecipes / getRecipe` 只读公开 `10` 个配方和 `43` 个顶层步骤，`objects` 覆盖 `20` 类对象，`cells` 已提供八个读取、定位、扫描与动作预检方法。完整能力矩阵为 `1213` 行、`covered 1139 / excluded 74 / deferred 0 / gap 0`；复合语义矩阵为 `80` 个动作、`70` 个完整事务与 `10` 个玩法配方。

## 权威任务清单

### 第 303 项：河流多控制点自由编辑（进行中）

- 目标：把当前“一个 pack cell 只能添加一个河道控制点”的交互扩展为基于真实河流折线的多控制点编辑。点击河流控制后高亮河流及当前全部控制点；已有控制点可拖动，河流上非控制点位置可新增控制点，双击已有控制点可删除。
- 现有证据：`inspectRiverVisualWaypoint` / `createAddRiverVisualWaypointCommand` 当前接收单个 `packCell`，以候选 cell 和距离判断重复并插入 `river.points`；`river-waypoint-session` 只保存一个 draft，renderer 也只有一个 waypoint preview。现有 `packCell` 只能作为定位 / 合法性辅助，不能继续作为控制点身份或唯一键。
- 数据边界：控制点必须以稳定顺序 / 标识和坐标保存，允许多个控制点落在同一个 cell；`packCell` 为可重复的派生引用。旧河流没有新控制点字段时仍可显示、编辑和导出；`river.points`、河流长度、cells、河口 / 源点和相关派生必须保持一致，新增字段必须可选并可迁移。
- 交互边界：所有新增、移动、删除先进入可取消预览，避免单击与双击事件重复新增；控制点拖动与折线高亮必须实时反馈；源点、河口、穿水、非法越界和导致河网不连续的操作要有明确拒绝或保护规则，不得静默破坏河流。
- 最小验收：同一 cell 放置两个以上控制点并分别拖动、删除；点击非控制点新增；双击已有点只删除该点；取消恢复原河流和历史，确认生成一条命令；10k / 100k 的河流高亮、控制点视觉、路线 / 河流 picking、撤销 / 重做、完整地图导出导入、PNG、console、page、health、WebGL 错误门禁通过。
- 依赖与边界：复用第 81 项河流字段字典、第 206 项河网 parent / confluence 完整性和既有河流编辑命令；本项会影响地图数据、可选存档字段和河流编辑 API / UI，但保持旧存档兼容，不重写河流生成算法、不全局重生成无关河流，`source/` 不改。
- 回滚：每次确认保存完整河流控制点与成品折线前后快照；取消、校验失败或任一派生刷新失败均恢复原河流、索引、选择和历史。

#### 调查结论与实施边界

- 现象：正式地图把 `river.points` 作为生成后的显示折线；当前“调整河道折线”只接收一个 `packCell`，每次只产生一个单点草稿，确认后直接向 `river.points` 插入一点。同一个 pack cell 的第二个候选会被坐标重复门禁拒绝，无法拖动或删除已经加入的点。
- CDP / 代码证据：隔离系统 Chrome 的既有河流回归在 `1280 / 390 / 320px` 均只能看到一个“应用折点”草稿和单候选节点；`river-waypoint-session.js` 只有一个 `draft`，`placeholder-renderer.js` 只有一个 `riverWaypointPreview`，`picking.js` 的索引项只有河流线段；`map-file-io.js` 仅复制 `cells / gridCells / points`，没有控制点身份字段。现有 `regress:river-waypoint-interaction` 与 `regress:river-waypoint-browser` 均通过，证明这是能力边界而不是当前回归故障。
- 根因假设：高可信——控制点身份被隐含在 `river.points` 的数组位置中，空间合法性又被收窄为 `packCell` 整数；中可信——若直接把所有生成点显示为可拖动点，会把 meander 细化点误当成用户控制点，因此需要独立的可选控制点集合，并保留旧 `points` 作为成品路径兼容来源。
- 兼容边界：新增 `river.controlPoints` 为可选对象数组，单点至少含稳定 `id / x / y`，`packCell` 只作可重复派生引用；旧地图缺字段时继续按旧 `river.points` 显示、选择、导出和单候选兼容，不静默把全部 meander 点迁移成用户控制点。正式 `river.cells / gridCells / parent / basin / source / mouth / flux / discharge` 不因视觉控制点变化而改写。
- 当前不实施：不重写河流生成算法，不把用户控制点写入 `pack.cells.r / fl / conf`，不允许控制点拖动改变河网 parent / confluence，不用一个 pack cell 的 Map 作为控制点唯一键，不全局重生成无关河流，不修改 `source/`，不接管用户当前 Chrome 标签页。

#### 封闭子任务与验收边界

| 子任务 | 目标 | 证据 | 改动边界 / 依赖 | 最小验收 | 回滚与影响 |
|---|---|---|---|---|---|
| 303-A 数据契约与控制点身份 | 建立稳定顺序 / ID / 坐标集合，允许同一 cell 多点，旧图缺字段可读 | 当前 points / packCell 单键限制；旧归一化会保留可选字段 | 依赖现有 `river.points`、地图归一化和快照；不改生成算法 | 新旧地图都能读；同 cell 两点 ID 不冲突；字段缺失不报错 | 前后河流快照恢复；影响地图数据与可选存档字段，不改 API 必填 schema |
| 303-B 预览交互 | 点击河流进入编辑后高亮整条河和控制点；拖动已有点、点击非点新增、双击删除，全部先预览 | 当前只有单候选 pointerdown 和单 draft | 依赖 303-A、统一 canvas mode、pointer capture；不写正式图和历史 | 单击 / 双击不串事件；同 cell 两点可分别拖动；取消零变化 | 取消 / Escape / 换图 / 失焦清空草稿；影响 UI 和编辑 API 交互，不改存档语义之外的新必填字段 |
| 303-C 河流视觉、picking 与派生 | 预览完整控制点集合和折线，控制点可命中，确认只刷新河流显示 / object panel | 当前 selection 只有河流线、picking 只有 river segment | 依赖 303-A/B、renderer selection / picking / edit refresh；不改水文拓扑 | 10k / 100k 高亮、点命中、视觉折线与状态同步；WebGL 无错 | 命令前后快照恢复 points / controlPoints / length / selection；影响 renderer、picking、河流可视字段 |
| 303-D 命令、导出与历史兼容 | 新增 / 移动 / 删除合并为单事务，撤销 / 重做、JSON / gzip / PNG / GeoJSON 保持一致 | 当前命令只保存 points / length，导出只输出 points | 依赖 303-A～C、`EditHistory`、map-file-io；保留旧字段和导出 LineString | 一次确认一条历史；失败整单回滚；旧存档往返 checksum / schema 不变 | 恢复完整河流快照；影响地图数据、可选存档字段和河流编辑 API，不改生成 API |
| 303-E 统一验收与发布门禁 | 固定 10k / 100k、宽窄视口、错误面和真实指针行为 | 现有 river waypoint focused / browser 回归可复用 | 依赖 303-A～D；使用隔离系统 Chrome，不触碰用户标签页 | 同 cell 多点增删移、源点 / 河口 / 穿水 / 越界拒绝、撤销 / 重做、导入导出、PNG、console / page / health / WebGL 全通过 | 任何失败回退本子任务提交；最终确认后统一提交推送 |

## 执行与归档规则

- 已批准的编号任务视为封闭范围；达到最小验收后立即转向下一项，不扩展完成标准。
- 新功能先登记权威任务，再实施并同步开发日志与接手说明。
- 任务完成后按完成日期移入 docs/task-archives/ 对应时间卷，当前文件不保留完成正文。
- 归档默认按每月四个时间片切分，跨月必须新建文件；单卷过大时可继续细分。
- 历史检索、分卷索引和检查命令见 [权威任务归档索引](./task-archives/README.md)。
