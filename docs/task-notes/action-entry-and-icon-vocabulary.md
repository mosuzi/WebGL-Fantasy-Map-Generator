# 动作入口与图标词表

本文记录权威任务第 57 项的入口收口结果。它是实现约束和验收证据，不另行创建活动待办；当前执行顺序仍以 `docs/current-plan.md` 为准。

## 定位入口

- `UiObjectTable` 的逐行定位列是对象列表唯一默认定位入口，统一使用 Element Plus `Location` 图标和“定位”可访问名称。
- 表格双击默认不绑定动作；只有国家、省份、城市、文化、宗教、河流、湖泊、资源标记、标签、测量和军事等已经声明 `doubleClickAction="edit"` 的面板才用双击进入编辑。
- 文化、宗教、河流、湖泊、路线、备注和测量列表原有底部“定位选中”已经移除。批量勾选只服务高亮、导出或批量命令，不恢复第二套定位入口。
- 未被正式应用引用的旧 DOM `object-table.js` 也移除双击定位，避免后续复用时重新引入旧语义。

## 重生成入口

| 领域 | 领域面板入口 | 公共 action |
|---|---|---|
| 国家 | 国家编辑 | `generate.regenerate("states")` |
| 省份 | 省份管理 | `generate.regenerate("provinces")` |
| 城镇 | 城市管理 | `generate.regenerate("cities")` |
| 道路 | 路线管理 | `generate.regenerate("routes")` |
| 河流 | 河流管理 | `generate.regenerate("rivers")` |
| 资源点 | 资源标记 | `generate.regenerate("markers")` |
| 外交 | 外交管理 | `generate.regenerate("diplomacy")` |
| 军事 | 军事管理 | `generate.regenerate("military")` |

控制面板不再平铺八个同权按钮，只保留“目标领域选择 + 一个重新生成按钮 + 当前影响摘要”。它是跨领域集中入口的明确例外，不形成八套重复按钮；领域面板、控制面板和公开 API 最终都调用同一个 `runtimeActions.generate.regenerate(kind, {confirm: true})`。

## 动作分组与图标词表

- `UiPanelIoActions` 把安全动作和危险动作分组；删除、移除、替换、重生成和重算进入红色危险区，并与定位、高亮、导入导出等安全动作之间显示分隔线。
- 常用动作优先使用稳定的 Element Plus 图标：定位 `Location`、新增 `Plus`、删除 `Delete`、重生成 `Refresh`、编辑 `EditPen`、高亮 / 清除高亮 `View / Hide`、移动 `Rank`、备注 `Document`、颜色 / 样式 `Brush`、导入导出 `Upload / Download`。
- 未进入词表的低频领域动作可以暂时保留字符图标，但必须具有稳定 `title` 和 `aria-label`；不得再为定位、删除、重生成等已覆盖动作新增字符别名。
- 所有主面板与固定浮层关闭按钮统一使用 `.ui-close-button`、字符 `×` 和以“关闭”开头的可访问名称。

## 验收门禁

`regress:action-ia` 固化以下条件：底部定位动作数量为零、双击默认不定位、控制面板只有一个重生成按钮、八个领域面板均接公共 action、安全 / 危险动作分组存在、常用图标词表已接入、四类关闭按钮使用统一类与符号。
