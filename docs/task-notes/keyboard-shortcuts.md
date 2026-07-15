# 键盘快捷键清单

本文档记录权威任务第 35 项冻结的首版快捷键清单。菜单悬停提示、`aria-keyshortcuts` 和键盘执行都读取 `keyboard-shortcuts.js` 的同一 registry；Windows / Linux 使用 `Ctrl`，macOS 对应显示和匹配 `Command`。

## 已实现清单

| 分组 | 操作 | Windows / Linux | macOS | 公共动作 | 菜单入口 | 禁用条件 |
|---|---|---|---|---|---|---|
| 文件 | 保存到浏览器 | `Ctrl+S` | `⌘S` | `data.saveBrowserMap` | 保存 → 保存到浏览器 | 地图未就绪或 operation 忙碌 |
| 文件 | 导出 PNG | `Ctrl+Shift+E` | `⌘⇧E` | `data.exportPNG` | 导出 → 图片 | 地图未就绪或 operation 忙碌 |
| 历史 | 撤销 | `Ctrl+Z` | `⌘Z` | `history.undo` | 浮动面板标题栏撤销 | 无可撤销命令或 operation 忙碌 |
| 历史 | 重做 | `Ctrl+Shift+Z` / `Ctrl+Y` | `⌘⇧Z` / `⌘Y` | `history.redo` | 浮动面板标题栏重做 | 无可重做命令或 operation 忙碌 |
| 常用编辑 | 取消编辑并清除选择 | `Esc` | `Esc` | `selection.stopEditing` → `selection.clear` | 无独立菜单入口 | 当前没有选择和编辑对象 |
| 选择定位 | 适配地图视图 | `Shift+Home` | `⇧Home` | `layers.fitView` | 管理 → 适配视图 | 地图未就绪或 operation 忙碌 |
| 视图 | 高度视图 | `Shift+1` | `⇧1` | `layers.setViewMode("height")` | 主题 → 高度 | 地图未就绪或 operation 忙碌 |
| 视图 | 生物群系视图 | `Shift+2` | `⇧2` | `layers.setViewMode("biomes")` | 主题 → 生物群系 | 地图未就绪或 operation 忙碌 |
| 视图 | 外交视图 | `Shift+3` | `⇧3` | `layers.setViewMode("diplomacy")` | 主题 → 外交 | 地图未就绪或 operation 忙碌 |
| 视图 | 国家视图 | `Shift+4` | `⇧4` | `layers.setViewMode("states")` | 主题 → 国家 | 地图未就绪或 operation 忙碌 |
| 图层 | 切换道路 | `Shift+5` | `⇧5` | `layers.get` → `layers.setVisible` | 图层 → 道路 | 地图未就绪或 operation 忙碌 |
| 图层 | 切换河流 | `Shift+6` | `⇧6` | `layers.get` → `layers.setVisible` | 图层 → 河流 | 地图未就绪或 operation 忙碌 |
| 图层 | 切换城市 | `Shift+7` | `⇧7` | `layers.get` → `layers.setVisible` | 图层 → 城市 | 地图未就绪或 operation 忙碌 |
| 生成 | 打开控制面板 | `Shift+G` | `⇧G` | `onOpenGenerationPanel` 公共 UI action | 顶部“控制面板” | 无 |
| 面板 | 打开高度编辑 | `Shift+H` | `⇧H` | `onOpenHeightPanel` 公共 UI action | 管理 → 高度编辑 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开国家编辑 | `Shift+S` | `⇧S` | `onOpenStatePanel` 公共 UI action | 管理 → 国家编辑 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开城市管理 | `Shift+C` | `⇧C` | `onOpenCityPanel` 公共 UI action | 管理 → 城市管理 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开外交管理 | `Shift+D` | `⇧D` | `onOpenDiplomacyPanel` 公共 UI action | 管理 → 外交管理 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开军事管理 | `Shift+M` | `⇧M` | `onOpenMilitaryPanel` 公共 UI action | 管理 → 军事管理 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开河流管理 | `Shift+R` | `⇧R` | `onOpenRiverPanel` 公共 UI action | 管理 → 河流管理 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开标签管理 | `Shift+L` | `⇧L` | `onOpenLabelNamingPanel` 公共 UI action | 管理 → 标签管理 | 地图未就绪或 operation 忙碌 |
| 面板 | 打开测量对象 | `Shift+Q` | `⇧Q` | `onOpenMeasurementPanel` 公共 UI action | 管理 → 测量对象 | 地图未就绪或 operation 忙碌 |

## 路由与提示规则

- registry 用 `KeyboardEvent.code` 匹配，避免数字行和字母键随键盘布局改变；`mod` 在 Windows / Linux 解析为 `Ctrl`，在 macOS 解析为 `Meta`。
- 同一作用域出现重复组合键时 registry 校验直接失败；多作用域同时命中时按显式 `priority` 决定，优先级相同时按清单顺序稳定处理。
- `input`、`textarea`、`select`、`contenteditable`、标记为快捷键输入区的控件、IME composing、`keyCode=229`、重复按键和 `aria-modal=true` 的独占键盘模态框均不执行快捷键。
- 已登记菜单项悬停 `850ms` 后显示“操作名 · 快捷键”，离开、点击、元素移除、面板关闭、动作禁用或 `2400ms` 超时后清理。
- 快捷键提示使用独立的白灰半透明 `#shortcut-toast`。普通成功 / 错误 `#map-toast` 优先；普通 toast 出现时会立刻清理快捷键提示，未结束前也不会再次显示。

## 明确不绑定

- “生成 grid 地图”“换 seed”和各类重新生成会替换地图或大范围派生数据。首版不为这些动作绑定按键，避免一次误触直接改变地图；用户仍可通过控制面板执行。
- 导入地图、导入 GEO、高度图导入、删除和批量破坏性操作不绑定快捷键，因为它们需要文件选择、预检或确认语义。
- 低频统计面板不为满足数量强行占用组合键；后续只有在真实高频需求和无冲突组合明确时才进入 registry。

## 验收入口

- `pnpm run regress:shortcuts`：registry、平台显示、冲突、作用域、输入 / IME / repeat 防误触、禁用条件、API / 公共 action 接线和提示计时器。
- `pnpm run regress:shortcuts-browser -- --browser-channel chrome`：八个分组真实页面抽查、菜单 / 键盘结果一致、撤销重做、提示阈值与底部居中、中性背景、toast 优先级和 WebGL / health / console / page error。
