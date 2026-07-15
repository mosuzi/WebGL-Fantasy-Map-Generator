# 统一画布工具模式管理器

本文档记录权威任务第 36 项的统一交互生命周期。它只管理画布工具的进入、互斥、取消、完成与清理，不替代各领域的编辑命令、笔刷算法或派生刷新规则。

## 模式清单

当前统一注册 14 个模式：

| 工具领域 | 模式 ID | 是否锁定其它面板 | 允许面板 |
|---|---|---:|---|
| 高度 | `height:brush` | 是 | `height-panel` |
| 国家 | `state:brush`、`state:add`、`state:delete` | 是 | `state-panel` |
| 省份 | `province:brush`、`province:add`、`province:delete` | 是 | `province-panel` |
| 城市 | `city:add`、`city:delete` | 是 | `city-panel` |
| 文化 | `culture:assign` | 是 | `culture-panel` |
| 宗教 | `religion:assign` | 是 | `religion-panel` |
| 测量 | `measurement:draw` | 否 | `measurement-panel` |
| 标记 | `marker:add`、`marker:move` | 是 | `marker-panel` |

测量模式继续保留既有的非锁定交互表现，但仍占用唯一活动模式，因此不能与其它画布工具并行。

## 生命周期契约

- `enter`：进入已注册模式；进入其它模式前先以 `switch` 原因取消旧模式。
- 重复进入：不重复执行进入副作用；只更新模式上下文并触发可选的 `onRepeat`。资源标记用它更新连续选择的资源类型或目标标记。
- `cancel`：先从管理器清除活动模式，再运行退出清理，避免面板回调再次取消时形成递归。
- `complete`：用于国家、省份、城市和标记的一次性新增 / 删除 / 移动；领域命令成功后只调用一次，退出钩子不再生成第二条历史命令。
- `reset`：地图替换前以 `map-replace` 原因取消当前模式，随后才接入新地图。
- 重入：钩子内发起的新切换会进入单槽队列，在当前钩子返回后执行，不递归展开调用栈。
- 异常：进入失败会清空活动模式、运行取消清理并报告错误；退出钩子失败时活动模式也已经先被清空。

面板关闭统一调用对应取消入口。高度、国家、省份、城市、文化和宗教沿用面板原有关闭回调；资源标记和测量面板补齐了关闭回调。

## 中间态与预览回滚

高度、国家、省份、文化和宗教笔刷的 pointer preview 会直接临时写入 grid / pack。跨模式切换、面板关闭、地图替换和 `pointercancel` 现在都先按 stroke originals 恢复原值，再执行对应轻量重绘：

- 高度、国家、省份按 grid cell 原值恢复映射的 pack cells。
- 文化、宗教除恢复 grid 原值外，还逐项恢复 `packBefore`，不会把本来不同的 pack 值粗暴统一。
- 高度线段、填充、矩形 / 连通 / 画笔选区中间态和 transform preview 一并清理；已正式锁定的地形选区不因退出笔刷被删除。
- 测量工具主动关闭时保留既有草稿语义；跨模式、面板关闭、地图替换或进入异常时清空草稿和编辑目标，避免预览残留到其它工具。

## 运行时快照与交互锁

`buildEditorStateSnapshot()` 新增 `canvasToolMode`，公开当前模式、已注册模式、切换序号和最近切换原因。`activeEditor` 保留高度 / 国家 / 省份等既有值，同时补齐文化、宗教和测量。

交互锁不再重新拼接各面板布尔值，而是读取活动模式的 `locksInteraction / allowedPanelIds`；模式退出后锁随同一快照更新，不会因某个领域漏清布尔值而残留。

## 验收门禁

- `pnpm run regress:canvas-tools`
  - 14 个模式注册与唯一活动模式；
  - 重复进入与上下文更新；
  - 跨模式切换、重入队列、显式取消、一次完成；
  - 面板关闭、地图替换与进入异常清理；
  - 高度、国家、省份、文化、宗教预览的 grid / pack 精确恢复；
  - 一次性完成不重复生成历史命令的模拟断言；
  - 运行时接线、面板关闭回调、交互锁和地图替换静态契约。
- 相邻门禁：`regress:height-brush`、`regress:social-ownership`、`regress:edit-execution-path`。
- `pnpm run build:app` 与 `git diff --check`。

本项验收只要求纯代码回归，因此没有启动浏览器，也不把代码结果表述为浏览器像素级证明。
