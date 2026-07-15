# 破坏性操作预检与批量删除

本文档记录权威任务第 39 项的统一删除预检、确认边界和批量事务语义。删除前只读取当前地图，不创建命令、不修改 checksum、不写入历史；确认后继续复用各领域已经验收过的安全删除命令。

## 统一预检结果

`inspectDeleteImpact(map, kind, ids)` 返回以下稳定字段：

- `validIds / skipped`：规范化有效 id，并以 `invalid-id / duplicate-id / protected-neutral / not-found` 记录跳过项。
- `deleteIds / cascadeIds`：区分用户直接指定对象和领域命令会级联删除的对象。
- `dependencies`：按领域统计关键关联数量；国家、省份、城市、文化、宗教、路线、河流和湖泊具有专属统计，其它已有对象至少统计备注。
- `summary / confirmationMessage`：使用中文展示删除对象数、级联对象数、关联数量和跳过数量；确认文本明确提示一次撤销可恢复。
- `requiresConfirm`：国家、省份、城市、文化、宗教、河流和湖泊始终属于高影响删除；其它领域在多对象、存在级联或关联时也要求确认。

河流预检递归计算目标河流的支流 / 流域闭包，并单独显示支流、河道 cells、湖泊进出口引用和备注数量。固定回归样本删除河流 `#2` 时会预告级联河流 `#3`，支流数量为 `1`。

## UI 与批量事务

- 国家、省份、城市、文化、宗教的既有单对象删除入口已接入统一预检和原生二次确认，原有领域刷新、选择清理和状态文案保持不变。
- 路线、河流和湖泊的单对象删除与批量删除使用同一入口；三个管理面板的公共表格勾选项可直接提交批量事务，不通过循环 DOM 点击拼装操作。
- 批量命令逐项复用领域命令，但只作为一个顶层命令进入 `EditHistory`。一次撤销恢复整个批次，一次重做复现整个批次。
- 批次中途异常会按相反顺序回滚此前已执行的子命令，失败批次不进入历史；结果通过 `requested / succeeded / deleted / deletedIds / skipped / failed / subresults` 返回结构化摘要。
- 混合无效 id 不阻止其它有效对象执行；无效、重复、不存在和被同批级联提前删除的对象分别记录原因。

稳定控制台 API 的删除方法继续执行调用方已经显式请求的领域命令，不弹出浏览器交互确认框；本项的交互确认属于 UI 边界，命令与数据一致性仍由 UI 和 API 共用的领域命令保证。

## 验收与边界

- `pnpm run regress:delete-impact` 覆盖河流支流预告、湖泊引用、混合无效 id、取消确认地图 / 历史不变、国家关联统计、路线批量单事务、撤销 / 重做和中途失败回滚。
- `pnpm run regress:river-delete` 与 `pnpm run regress:lake-delete` 继续验证真实安全删除命令对数据、备注、对象引用、索引 / picking、导出读取和 stale 标记的一致性。
- `pnpm run regress:edit-execution-path` 固化顶层命令仍只能通过统一编辑执行器进入历史；组合事务的子命令应用 / 回滚集中在 `edit-history.js` 的嵌套命令边界。
- `pnpm run regress:panel-refresh-path`、`pnpm run regress:selection-highlight` 和生产构建通过。按快速迭代约定，本项不启动浏览器，不把代码回归表述为真实确认框视觉验收。
