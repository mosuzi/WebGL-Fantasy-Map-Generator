# 第 349-6 阶段：notes 核心垂直切片

## 目标与边界

本阶段把 notes 的 command、history、query、persistence projection 与公开 API 接到 `MapCoreEngine`，但不重写现有备注算法，不建立第二份 map、revision 或 history。唯一 canonical owner 继续是 `createGeneratorApp` 的 `state.map`；既有 `EditHistory` 与 `MapRevisionTracker` 仍负责实际执行、撤销、重做和 revision 推进。

notes 明确不需要 Worker、普通视图或 render layer，也不支持领域重生成。全图 generation / import / adoption / compressed persistence 的统一收口属于 `349-10f`，本阶段不提前改造。

## 正式入口

`notesManifest` 从 `shadow` 进入 `active`，只登记五个 command id：

- `notes.createStandalone`
- `notes.set`
- `notes.delete`
- `notes.import`
- `notes.deleteBatch`

adapter 包裹原 command 的执行结果，不改变 API result 形状。国家、省份、文化、宗教和备注面板的正文写入统一走 `notes.set`；独立备注在对象详情与备注面板的重命名也归入 `notes.set`。新增、单删、批删、导入、undo / redo 复用同一 legacy command 实例和同一 history 栈。

## 提交、查询与存档

每个成功 legacy mutation 由 facade 观察为 `planned → computed → validated → projections-prepared → canonical-committed → published → projections-settled`。commit 前后 revision 与 history fingerprint 来自既有 owner；invalid / no-op 必须保持 notes fingerprint、revision、history 与 commit sequence 不变。若 history 与 revision 已推进而 UI 刷新失败，adapter 仍先记录并发布 canonical commit，persistence 保持 ready，UI 进入 degraded；不得把它误报成 no-op 或 rollback。抛出的原 UI 异常可以继续交给调用方，但已提交 command 的 notes 归属必须保留，保证后续 undo / redo 仍进入同一 adapter。

`list / get / persistenceSnapshot` 通过 getter-only core 读取 canonical notes，并返回冻结且与 owner 脱离的 JSON snapshot。备注面板和备注摘要 API 使用该 query；正式 map save 继续读取同一个 canonical map，专项回归要求其 notes 输出与 persistence snapshot 相等，并验证 save / load round-trip。全图压缩 Worker 路径不在本阶段改写。

## 验收证据

- `pnpm run regress:notes-core`：五条 command、新增 / 编辑 / 删除 / 导入 / 批删、undo / redo、十三轮单调 revision / commit、detached query、persistence / UI settled、当前 save round-trip、v1 旧备注保留、invalid / no-op 不变式，以及返回 error、undo 抛错、command 直接抛错和其后 undo 的 post-commit 语义通过。
- `pnpm run typecheck:core`、`regress:core-manifests`、`regress:core-facade` 通过；notes Manifest 为 `active`，未登记 Worker / regeneration / layer。
- `regress:note-import`、`regress:object-creation`、`regress:auxiliary-object-creation`、`regress:object-details-edit`、`regress:api-data-compatibility`、`regress:map-migration` 通过。
- `pnpm run build:app` 通过，`1368 modules`；最终修正 checkpoint 版本 `0.5.18`。
- 浏览器启动、操作和验收均为 `0`。

## 延后项

- notes 随其他领域删除、拓扑快照或全图 adoption 被连带改写时，统一跨域 write-set 与 projection 依赖留给 `349-9` 和对应 `349-10x` 阶段。
- 全图 JSON / compressed / browser storage 的统一 persistence owner 与 Worker binding 留给 `349-10f`。
- legacy adapter 与重复 revision / history 观察链最终删除留给 `349-10g`。
