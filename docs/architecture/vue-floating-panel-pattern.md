# Vue 浮动面板复用规范

本文档记录正式应用浮动面板迁移到 Vue SFC 后的复用边界。它补充 `floating-panel-architecture.md`，用于指导后续河流、文化、宗教、城市、国家、省份等管理面板继续收敛。

## 分层边界

- `panels/*.js` 仍保留为 runtime 适配层，负责注册 panel manager、创建 Vue 根节点、维护外部 API，并把大对象 `map` 用 `markRaw()` 放入 `shallowReactive` 状态。
- `ui/vue/components/*.vue` 负责真实 UI 渲染、筛选、排序、派生展示行和轻量表单状态。
- `ui/vue/components/base/*.vue` 只承载通用控件：按钮、tab、筛选输入、排序条、对象表格、详情网格、名称/颜色/数字字段和历史操作。
- `runtime` 继续负责 selection、edit history、派生刷新、renderer 调用和对象定位；Vue 面板只发出回调，不直接改 WebGL buffer、picking index 或地图大数组。

## 状态规则

- 可以进入 Pinia 的状态：全局配置偏好、图层显隐、专题选择、城市标签上限、当前编辑器摘要、编辑历史计数等轻量状态。
- 不进入 Pinia 的状态：`grid`、`pack`、`map`、renderer、WebGL buffer、object picking index、城市/河流/国家等大型业务数组。
- 面板 wrapper 内部状态使用 `shallowReactive()`；传入地图对象时使用 `markRaw(map)`。
- 面板局部输入草稿可以放在 SFC 的 `ref()` 中，例如河流宽度滑动条草稿。

## Wrapper 约定

每个 Vue 面板仍应导出和旧 DOM 面板一致的创建函数，例如 `createRiverPanel(documentRef, manager, callbacks)`。

Wrapper 应负责：

- `manager.registerPanel()`、标题、初始位置、宽度和关闭回调。
- 创建 `.vue-*-panel-root` 根节点并挂载 Vue 应用。
- 保留 `open()`、`update()`、`isOpen()`，有选中对象列表时保留 `setSelected*Id()`。
- 把 Vue 事件转成原 runtime 期待的对象摘要，例如 `{kind: "river", id, name}`。
- 不直接重建 DOM 子树，不使用旧 `createElement()` 拼装表格和详情。

## SFC 约定

面板 SFC 应优先复用基础组件：

- 摘要指标使用 `UiMetricGrid`。
- 筛选输入使用 `UiFilterInput`，保留中文输入法 composition 保护。
- 排序使用 `UiSortBar`。
- 列表使用 `UiObjectTable`。
- 只读字段使用 `UiDetailGrid`。
- 名称、颜色、数字编辑分别使用 `UiTextEditField`、`UiColorField`、`UiNumberField`。
- 撤销/重做使用 `UiHistoryActions`。

如果某个字段需要特殊交互，例如河流宽度滑动条，可以组合 `UiSliderField` 和 `UiButton`，但仍只通过 wrapper 回调提交命令。

## 当前迁移状态

已迁移为真实 Vue SFC 的面板：

- 控制面板：`ControlPanel.vue`
- 高度编辑：`HeightPanel.vue`
- 路线管理：`RoutePanel.vue`
- 对象详情：`ObjectDetailsPanel.vue`
- 河流管理：`RiverPanel.vue`
- 文化管理：`CulturePanel.vue`
- 宗教管理：`ReligionPanel.vue`
- 城市管理：`CityPanel.vue`
- 省份管理：`ProvincePanel.vue`
- 国家编辑：`StatePanel.vue`

当前正式应用已有的主要浮动管理/编辑面板均已迁移为 Vue SFC。

后续新增标签/命名、Marker/Zone、纹章等面板时，应继续先保持 runtime 回调和编辑命令边界清晰，再把表格、详情和轻编辑字段放入 Vue。
