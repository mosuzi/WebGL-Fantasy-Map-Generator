# Edit Command 轻量契约

本文档记录正式编辑命令的最小约定，供后续面板新增 / 删除、属性编辑、派生重建和控制台 API 复用。当前契约是渐进约束：既兼容已经存在的命令，也为后续新命令提供统一字段和刷新语义。

## 命令对象

编辑命令是一个普通对象，至少提供：

- `label`：中文短标签，用于历史记录、撤销 / 重做提示和调试输出。
- `apply(context)`：执行编辑，直接修改 `context.map` 或相关运行时状态。
- `revert(context)`：撤销编辑，恢复 `apply()` 修改前的状态。

推荐继续提供：

- `domain`：可选领域名，例如 `state`、`province`、`culture`、`measurement`、`namebase`。
- `effects`：刷新调度元数据，交给 `edit-refresh-scheduler` 使用。
- `isNoop(context)`：可选空操作判断；返回 `true` 时调用点不应进入 `EditHistory`。
- `getResult()`：可选执行结果读取器，用于导入、批量重命名、生成对象 id 等需要给 UI 文案或后续选择使用的场景。

`EditHistory.execute()` 会执行轻量运行时校验：

- `apply / revert` 必须是函数。
- `label` 缺失时会补为“未命名编辑”；如果提供则必须是字符串。
- `domain` 仍为可选字段；如果提供则必须是非空字符串。
- `isNoop / getResult` 仍为可选字段；如果提供则必须是函数。
- `effects` 仍为可选字段；如果提供则必须是对象，且其中的 `render / selection / runtimeStats / pickPanel / derived / affected` 必须符合下文结构。

这套校验是渐进约束，不要求旧命令一次性补齐 `domain` 或 `effects`，但会阻止新增命令携带形状错误的可选字段进入撤销栈。

## context 约定

当前调用点默认传入：

- `context.map`：当前地图对象。

后续如果命令确实需要更多运行时能力，应优先通过显式字段传入，例如：

- `context.documentRef`：只在命令必须读取文件输入或 DOM 状态时使用。
- `context.now`：需要稳定时间戳时由调用方注入，避免命令内部散落 `new Date()`。

命令不应直接读取全局 `window.__webglGeneratorApp`，也不应自行刷新面板或写状态文案；这些属于运行时调用层职责。

## effects 约定

`effects` 建议包含：

- `render`：`"draw"` 或 `"none"`。
- `selection`：`"refresh"` 或 `"none"`。
- `runtimeStats`：是否刷新运行时统计。
- `pickPanel`：是否刷新拾取 / 对象详情。
- `derived`：字符串数组，描述需要刷新的派生缓存或面板线索。
- `affected`：对象数组，格式为 `{kind, id}`。

当前运行时允许的 `effects` 字段值：

- `render` 只能是 `"draw"` 或 `"none"`。
- `selection` 只能是 `"refresh"` 或 `"none"`。
- `runtimeStats / pickPanel` 只能是布尔值。
- `derived` 必须是字符串数组；数组可以为空，但数组项不能是空字符串。
- `affected` 必须是数组，每项必须提供非空字符串 `kind`，以及字符串或数字 `id`。

常用 `derived` 示例：

- `cell-colors`：专题 / 地表颜色需要刷新。
- `object-index`：对象 picking 索引需要刷新。
- `object-panels`：对象面板需要补刷。
- `route-mesh` / `river-mesh`：路线或河流动态 mesh 需要失效。
- `labels`：标签 DOM overlay 需要刷新。

批量重算或全量重生成命令的 `affected` 不应只写 `{kind: "xxx", id: "all"}`。建议先追加一个系统级目标，例如 `{kind: "derived-system", id: "routes"}`、`{kind: "derived-system", id: "rivers"}`，再列出会被刷新或替换的对象集合。这样历史摘要可以解释“为什么是全量”，面板刷新仍能按对象 kind 工作。

如果某个命令会让派生系统过期但不立即重建，可使用已有 `defer:*` 风格，后续面板负责把过期状态解释给用户。

## 调用层约定

优先通过 `executeEditCommand(state, documentRef, command, options)` 执行命令。当前 helper 已负责：

- 调用 `isNoop(context)`，空操作不进入历史。
- 调用 `state.editHistory.execute(command, context)`。
- 调用 `refreshAfterEdit(state, executedCommand)`。
- 按 `options.status` 写入状态文案。
- 读取 `getResult()`，返回给调用方做选择、定位或文案。
- 通过 `refreshPanelsForEdit()` 按 `affected.kind` 和 `derived: ["object-panels"]` 刷新领域面板。

`EditHistory.getStats()` 会返回：

- `undo / redo`：当前撤销栈和重做栈长度。
- `lastLabel`：最近一次执行、撤销或重做的命令标签。
- `lastDomain`：最近一次执行、撤销或重做命令的 `domain`；无领域时为 `"none"`。
- `lastAffected`：最近一次执行、撤销或重做命令的 `effects.affected` 快照；返回值会克隆，避免外部继续修改命令对象时污染历史统计。

后续 helper 可继续扩展：

- 标准化异常文案。
- 进一步收口仍直接调用 `state.editHistory.execute()` 的旧路径。

## 撤销与快照

命令应让 `apply()` 和 `revert()` 成对可重复：

- 第一次 `apply()` 可记录必要快照。
- `revert()` 必须只恢复本命令触碰的数据。
- `redo()` 会再次调用 `apply()`，因此命令不能假设 `apply()` 只运行一次。
- 对数组、typed array、嵌套对象要明确克隆边界，避免撤销时引用同一个可变对象。

## 删除命令边界

删除命令必须显式处理对象约束：

- 低风险对象可以直接快照并移除或标记 `removed`。
- 区域对象必须先检查 cells、子级、城市 / 城镇 / 国家等关联。
- 河流、湖泊、路线等拓扑对象不能共用区域对象的粗暴删除逻辑；必须先定义派生刷新、索引清理和撤销恢复边界。

## 当前迁移状态

- `EditHistory.execute()` 已接入轻量运行时契约校验，基础字段严格、可选字段渐进校验。
- `executeEditCommand()` 已成为主要编辑入口，覆盖测量、备注、名称库、城市、国家、省份、文化、宗教、路线、河流、湖泊、地区、marker、标签、外交、军事、高度刷子、GEO 地形导入和自定义标签拖拽等常见路径。
- 已主动声明 `domain` 的命令范围：路线、河流、湖泊、地区、备注、测量对象、城市、国家、省份、文化、宗教、marker、标签、外交、对象详情通用字段和军事。
- `EditHistory.getStats()` 已暴露 `lastDomain` 和 `lastAffected`，控制台历史 API 和面板历史摘要可直接看到最近命令领域与影响对象；历史摘要使用共享 formatter，以 `@domain [kind#id]` 的短格式展示，超过 3 个对象时折叠为 `+N`。
- 国家、省份、道路、河流、城市重生成入口和资源点重生成命令已开始使用 `derived-system#xxx` 作为批量 affected 的第一项，避免历史和刷新摘要只出现对象级 `all` 或集合别名。
- 面板历史按钮已开始复用 `executeHistoryCommand()`，避免各面板分别手写撤销 / 重做刷新。
- 后续重点是继续迁移残留的直接 `state.editHistory.execute()` 路径，并让新增命令保持 `domain` 和更精确的 `effects.affected`。
