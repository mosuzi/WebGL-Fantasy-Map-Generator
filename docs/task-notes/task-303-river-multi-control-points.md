# 第 303 项：河流多控制点自由编辑

## 当前状态

调查、方案与 303-A～303-E 封闭子任务均已完成，待统一归档并推送。本专题不修改用户当前 Chrome 标签页；`source/` 保持零改动。

## 目标

把当前河流“按一个 pack cell 添加一个视觉控制点”的交互扩展为真实河流折线上的多控制点编辑：点击河流控制后高亮河流及全部已有控制点；已有点可移动；河流上非控制点位置可新增；双击已有点删除。

## 现有基础与证据

- `inspectRiverVisualWaypoint` 和 `createAddRiverVisualWaypointCommand` 当前接收一个 `packCell`，用候选 cell 和距离判断重复并插入 `river.points`。
- `river-waypoint-session` 只保存一个 draft，`RIVER_EDIT_WAYPOINT` 模式只绑定一个 `riverId`；renderer 的 `riverWaypointPreview` 也只负责一个候选预览。
- 因此 `packCell` 不能继续作为控制点身份或唯一键；一个 cell 内必须允许多个独立坐标控制点。

## 只读调查报告

### 问题现象

- 当前河流编辑只允许“单击候选位置 → 单个草稿 → 应用一条新增点命令”；没有已有控制点拖动、删除、同 cell 多点和完整控制点高亮。
- `river.points` 既是生成后的成品显示折线，又是当前新增点的写入目标；数组位置没有稳定控制点身份。

### 可复现步骤

1. 在隔离系统 Chrome 打开固定地图，选中有至少三段 `points` 的河流。
2. 点击“调整河道折线”，单击近河候选；面板出现一个候选草稿和一个橙色节点。
3. 再单击另一个候选，前一个草稿被替换；对同一 pack cell 再选时按坐标重复拒绝。
4. 没有已有控制点拖动入口，也没有双击删除入口；取消 / Escape 只清理单个 draft。

### CDP / 静态证据

- 隔离 Chrome `regress:river-waypoint-browser` 在 `1280 / 390 / 320px` 均通过当前单候选模式，`applicationErrors / pageErrors / activeHealthErrors / WebGL error` 均为 `0`。
- `river-edit-commands.js` 的 `inspectRiverVisualWaypoint(map, riverId, packCell)` 以 `packCell` 和候选坐标判断重复，并只返回一个插入后的 `points`。
- `river-waypoint-session.js` 只有一个 `draft`；`placeholder-renderer.js` 只有 `riverWaypointPreview`；`selection-layer.js` 只绘制一个候选菱形；`picking.js` 只建立河流线段索引并返回河流对象。
- `map-file-io.js` 归一化只复制 `cells / gridCells / points / hydrology`；未知可选字段不会被清除，因此新增 `controlPoints` 有兼容落点。
- 现有 `regress:river-waypoint-interaction` 通过，确认候选、距离 / 穿水拒绝、PNG 抑制预览、单条历史和水文数据不变；该回归证明旧契约仍稳定，不代表新能力已实现。

### 根因假设及证据等级

- 高可信：控制点没有独立身份，`packCell` 同时承担空间定位和唯一性判断，直接导致同 cell 多点不可能。
- 高可信：session、renderer preview、selection mesh 和 picking 都是单对象模型，无法表达集合操作。
- 中可信：直接把当前所有 `river.points` 当作可拖动控制点会把生成器 meander 点暴露为用户编辑点，因此应增加可选 `river.controlPoints`，而不是静默迁移全部旧 points。

### 影响范围与不可破坏边界

- 会影响河流编辑 UI、河流显示折线、selection / picking、撤销 / 重做、可选存档字段和河流对象 API 返回；不应改变 `cells / gridCells / parent / basin / source / mouth / flux / discharge` 等水文与河网字段。
- 旧 JSON、gzip、浏览器存档和旧导出缺少 `controlPoints` 时必须继续加载；旧河流保持原显示和单候选兼容，不对历史 meander 点做无证据迁移。
- 所有确认操作以整条河流前后快照为边界；取消、非法拖动、双击竞态、刷新失败和地图替换必须恢复原控制点、points、length、selection、索引和历史。

### 当前明确不实施的方向

- 不把 `packCell` 作为控制点主键，不把控制点写进 `pack.cells.r / fl / conf`，不重算 parent / confluence，不全局重生成河流或路线，不修改 `source/`，不刷新或覆盖用户当前 Chrome 地图。

## 专题方案

| 子任务 | 目标 | 改动边界 | 依赖 | 最小验收 | 回滚方式 | 是否影响地图数据 / schema / API / source |
|---|---|---|---|---|---|---|
| 303-A | `controlPoints` 可选集合，稳定 ID / 顺序 / 坐标，packCell 可重复 | 迁移 / 归一化 / 快照；保留 points 兼容 | 旧 points、map-file-io、对象解析 | 新旧存档往返；同 cell 两点身份独立 | 删除可选字段并恢复 points 快照 | 影响可选地图字段和对象 API；不改必填 schema、source |
| 303-B | 实时预览拖动、新增、双击删除 | canvas pointer capture、session、双击判定和面板文案 | 303-A、canvas mode、direct session | 取消零写入；单击不误新增；双击只删 | session rollback、清理 capture / timer | 影响 UI / 交互；不改水文数据、source |
| 303-C | 河流 / 控制点高亮、节点 picking、预览折线 | selection mesh、object picking、renderer dirty 刷新 | 303-A/B、renderer / picking | 10k / 100k 视觉和命中通过 | 恢复旧 selection / index / buffer | 影响显示、picking API；不改水文 schema、source |
| 303-D | 新增 / 移动 / 删除单事务，撤销重做和导出兼容 | edit command、历史、JSON / gzip / PNG / GeoJSON | 303-A～C、map-file-io | 一次确认一条历史，失败整单回滚，旧档可读 | before / after 河流快照 | 影响河流地图数据、可选存档字段和编辑 API；不改生成算法、source |
| 303-E | 统一 10k / 100k 与发布门禁 | 隔离 Chrome、窄视口、错误 / health / WebGL 检查 | 303-A～D | 同 cell 多点分别移 / 删、源河口反例、导入导出、PNG 全通过 | 回滚失败子任务提交 | 只新增回归与文档门禁；source 不改 |

## 子任务进度

- 303-A 已完成：新增 `river-control-points.js`，以可选 `river.controlPoints` 保存 `id / x / y / pointIndex / packCell / flux`；地图归一化和河流对象读取会复制并校验该集合，旧河流缺字段时保持 `undefined`，不会把全部 meander 点静默变成控制点。
- 303-A 回归：`regress:river-control-points-data` 与既有 `regress:river-waypoint-interaction` 通过；同一 pack cell 的两个控制点拥有不同稳定 ID，插入 / 删除路径索引可重排，旧控制点字段缺失兼容。
- 303-B 已完成：新增集合 session action（add / move / delete）和独立 pointer capture 拖动监听；单击非控制点仅更新预览，已有控制点可拖动，双击已有点预览删除；pointercancel / 无移动点击恢复本次手势。
- 303-B 回归：`regress:river-control-points` 覆盖同 cell 双点分别移动 / 删除、session 连续草稿、取消和单事务命令；既有单点交互与三档窄视口回归保持通过。控制点集合的正式视觉 / picking 仍由 303-C 完成。
- 303-C 已完成：编辑模式进入时 renderer 接收基线控制点集合；selection layer 绘制控制点节点和变更后的完整预览折线；picking 在预览节点命中时返回 `riverControlPoint {riverId, id, pointIndex, packCell}`，不改变普通河流对象选择。
- 303-C 回归：`regress:river-control-points` 已覆盖控制点集合 mesh 和稳定 ID picking，`build:app`、`regress:selection-highlight` 与既有三档河流 Chrome 回归通过。
- 303-D 已完成代码闭环：`createEditRiverControlPointsCommand` 把当前 working state 一次写入 `points / controlPoints / length`，保存字段存在性并支持撤销 / 重做；当前进入 303-E，补完整导出和 10k / 100k 真实指针验收。
- 303-E 已完成：隔离系统 Chrome 10k / 100k 真实指针回归均完成新增、已有点拖动、双击删除、退出取消、重新进入提交、Ctrl+Z / Ctrl+Y；两档交互期间 health error、application console error、page error 和 WebGL error 均为 `0`。同一 pack cell 多控制点由数据 / 事务回归固定为 `true`；真实 Chrome 选择可见且不被河流面板遮挡的河段完成多控制点手势，避免把面板命中误报为地图输入。
- 303-E 兼容门禁：完整导出套件、PNG / 高度图、API JSON / gzip 往返、旧数据兼容、selection / picking、旧单点河流交互和 `1280 / 390 / 320px` 河流面板回归均通过；控制点确认只增加一条历史，取消不写地图，`cells / parent / basin / flux / discharge` 保持。生成阶段仍记录已知主线程长任务：10k 约 `1.05s`，100k 约 `2.20s` 与 `4.55s`；交互阶段无 health error，生成长任务不在本项扩大优化。
- 303-E 交互命中修复：河流控制点模式允许画布输入，并在模式活动期间抑制渲染器的普通对象选中，避免城市 / 面板 overlay 的 pointerup 触发 `target-switch` 取消控制点模式；新增手势仍通过 pointer capture 和事务 session 回滚。

## 改动边界

- 新增或迁移为稳定顺序 / 标识 + 坐标的控制点集合；`packCell` 只作为可重复的派生定位字段。旧河流没有新字段时仍可显示、编辑、导出和保存。
- 点击河流后显示整条河流和全部控制点；拖动已有点只更新预览；点击非控制点河段新增预览点；双击已有点删除预览点，必须避免单击与双击重复新增。
- 确认把控制点、`river.points`、河流长度、cells、河口 / 源点约束和相关派生作为一条事务同步；取消、校验失败或刷新失败完整恢复。

## 依赖与排除

- 依赖第 81 项河流字段字典、第 206 项河网 parent / confluence 完整性、现有河流编辑命令和 renderer picking / overlay 链。
- 不重写河流生成算法，不全局重生成无关河流，不静默穿水或破坏河口 / 源点；`source/` 不改。

## 最小验收

- 10k / 100k 地图中选取真实河流，确认河流和全部控制点高亮；同一 cell 放置两个以上控制点并分别拖动；点击非控制点新增；双击已有控制点只删除该点。
- 所有操作先预览，取消后河流成品折线、控制点集合、checksum、历史和视觉完全恢复；确认只新增一条历史，撤销 / 重做完整恢复。
- 覆盖源点、河口、穿水、越界、重复坐标和不可保持河网连续的反例；结构化拒绝，不留下半条河流。完整地图导出导入、PNG、旧存档兼容、console、page、health、WebGL 和窄视口通过。

## 影响与回滚

- 影响地图河流数据、可选存档字段和河流编辑 API / UI；新字段必须可选、可迁移，`river.points` 等旧字段继续可读，旧存档不得因缺少控制点集合而失败。
- 每次确认保存控制点与成品折线前后快照；取消、校验失败或派生刷新失败恢复原河流、索引、选择和历史。
