# 全功能交互与可用性统一审计结果

## 文档状态

本文是权威任务第 107 项的最终审计交付物。它汇总第 101～106 项的代码证据与本项统一浏览器证据，只提出整改候选，不修改正式应用，也不把候选自动写入权威任务清单。

## 验证结论

- 交互表面：102，included 85，excluded 17，未分类 0，未知结果 0。
- 浏览器：13 组（主套件 1 + 视觉 12），通过 13，失败 0；主套件含 11 条 E-S、13 条 E-F、1 条 E-N。
- 最终运行状态：结构化证据确认 WebGL error 0、health error 0、operation idle、loading hidden；主套件结束后 history 与 selection 均已复位。控制台与 page error 未单独采集，故障注入期间允许出现预期 operation-failed 健康日志，因此不声明其数量为 0。
- 三档视口复用同一浏览器标签页：1280×720、720×720、576×576 CSS 压力档；每档覆盖 baseline、long-zh、expanded-options、font-and-states。
- 截图快照大小分别为 106266、59878、43915 bytes；截图与 DOM 几何只作视觉证据，问题结论仍同时依赖 E-C 作用链。

## 交互总表

| 来源类型 | 表面数 |
|---|---:|
| vue-panel-detail | 26 |
| non-vue-panel | 2 |
| resident-readout | 3 |
| fixed-overlay | 22 |
| canvas-overlay | 7 |
| shared-component | 30 |
| global-event | 12 |

| 审计域 | 代码分母 | 浏览器收口 |
|---|---:|---|
| 高频任务闭环 | 14 条 / 126 个可见动作 | HF 主套件 E-S |
| 画布模式与直接操控 | 28 模式 / 88 直接实例 | DM 主套件 + Escape |
| 复杂面板 | 26 面板 / 131 字段 / 26 表格 / 68 动作 | CW 主套件 + 三档几何 |
| 危险与恢复 | 24 入口 / 14 场景 | 13 E-F/E-S + 1 E-N |
| 键盘与视觉 | 22 快捷动作 / 49 浮层 / 12 case | 12/12 完成 |

## 合理保留

- 控制面板集中重生成与领域面板上下文重生成继续合理并存。
- 高级能力保持渐进披露，不因低频直接删除。
- 精密列宽拖柄与原生 checkbox 不按视觉尺寸直接判定为普通按钮。
- 九类原地重生成中途失败继续保留 E-N；没有稳定 fault seam 前不伪造 E-F。
- 第 28～52、54～100 项既有验收不重新执行，本报告只观察其当前交互链表现。

## 问题证据账本

| 编号 | 严重度 | 问题 | 浏览器结论 | 边界 |
|---|---|---|---|---|
| IA-102-001 | P2 | 列表定位失败可能缺少用户可见反馈 | 浏览器上下文通过，静态反馈风险保留 | INT-B |
| IA-102-002 | P3 | 部分重命名 no-op 可能静默返回 | 正常重命名通过，no-op 反馈风险保留 | INT-B |
| IA-103-001 | P1 | 既有画布模式回归分母落后于运行时 | 浏览器确认运行时注册 28 项 | UI-only |
| IA-103-002 | P2 | Escape 只显式退出城镇移动模式 | Escape 双消费已复现，模式统一退出仍待整改 | INT-B |
| IA-103-003 | P1 | 手工标签 pointercancel 仍提交位置且切图未统一清理拖动 | 浏览器上下文通过，切图取消风险保留 | INT-B |
| IA-103-004 | P2 | 测量控制点 pointercancel 不恢复拖动前坐标 | 浏览器上下文通过，pointercancel 语义风险保留 | INT-B |
| IA-103-005 | P2 | 指针捕获路径没有 lostpointercapture 恢复消费者 | 浏览器上下文通过，缺失消费者由 E-C 确认 | INT-B |
| IA-103-006 | P3 | 共享拖动的 pointercancel 结果不一致 | 多类浮层可达，取消语义差异保留 | INT-B |
| IA-103-007 | P2 | 十九个拾取 / 创建 / 移动模式使用默认画布光标 | 28 模式可达，默认光标问题保留 | UI-only |
| IA-104-001 | P1 | 动作坞模式激活视觉与 aria-pressed 不一致 | 动作坞可达，aria 与视觉不同源由 E-C 确认 | UI-only |
| IA-104-002 | P2 | 文化名称库动作的元数据与最终结果不一致 | 面板入口通过，动作元数据偏差保留 | INT-B |
| IA-104-003 | P1 | 表格虚拟行高与 CSS 几何模型不一致 | 窄视口表格几何偏差已观察 | UI-only |
| IA-104-004 | P2 | 双击编辑重复触发主选中 | 选择与编辑链通过，重复派发风险保留 | INT-B |
| IA-104-005 | P2 | 动作 key 不能作为全局结果语义 | 浏览器确认多宿主动作可达 | INT-B |
| IA-105-001 | P1 | 国家、省份、城市的实际画布删除绕过共用影响预检与确认 | 取消路径保持指纹，绕过入口由 E-C 确认 | INT-B |
| IA-105-002 | P1 | FMG Cells GEO 命令 apply 中途失败可能留下部分地图变更且没有历史 | 已复现 | INT-B |
| IA-105-003 | P1 | 气候下游异步重算不受运行时互斥与旧结果保护 | 已复现 | INT-B |
| IA-105-004 | P1 | 11 类受约束重生成只有 2 类成功后可撤销，且全部缺少统一失败快照 | 正常撤销通过；九类中途失败保留 E-N | INT-B |
| IA-105-005 | P1 | 高度基础与下游重建是非事务串行链 | 已复现 | INT-B |
| IA-105-006 | P2 | 24 个持久删除、清空和全量重置入口的确认契约不一致 | 取消与失败回滚通过，跨入口表达仍不一致 | INT-B |
| IA-105-007 | P2 | 用户高度模板删除无确认、无历史、无恢复 | 恢复缺口由 E-C 确认 | INT-B |
| IA-105-008 | P2 | 名称库删除在 UI 与 API 的确认契约不一致 | 跨入口确认偏差由 E-C 确认 | INT-B |
| IA-106-001 | P1 | 同一次 Escape 可能同时关闭 managed overlay 并清除 selection / editing | 已复现 | INT-B |
| IA-106-002 | P1 | Escape 结果随焦点是否位于可编辑控件而改变，内部 popup 还缺应用侧可证明优先级 | 三档焦点上下文通过，popup 优先级风险保留 | INT-B |
| IA-106-003 | P2 | 键盘焦点视觉表达在共享控件间不一致 | 三档焦点可达，表达不一致保留 | UI-only |
| IA-106-004 | P2 | 共享点击目标尺寸从 8px 到 32px，紧凑控件缺少统一命中区口径 | 8px 拖柄、14px checkbox 与紧凑按钮已实测 | UI-only |
| IA-106-005 | P2 | 22 个 role=dialog 的 managed fixed overlay 都不会暂停全局快捷键 | 全局快捷键排他性缺口保留 | INT-B |
| IA-107-001 | P1 | 720px 窄视口下高面板会撑高 document 并暴露表格越界内容 | 已复现 | UI-only |
| IA-107-002 | P1 | 固定长中文会把常驻地图工具按钮横向撑出窄视口 | 已复现 | UI-only |

### IA-102-001：列表定位失败可能缺少用户可见反馈

- 严重度 / 信心：`P2` / 中
- 复现：在 F1 / F6 依次执行定位、重命名、空态和历史操作，观察结果反馈与 history 变化。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/app.js`。
- 代码观察：统一定位 helper 在 locateObject 返回 false 时只刷新面板并返回 false，当前静态链未发现通用 toast 或状态文案。
- 浏览器证据：`HF-12-14`、`DR-105-F6-NEUTRAL`；结论：浏览器上下文通过，静态反馈风险保留。
- 整改建议：第 107 项验证无效 / 孤儿对象路径；若确认为静默失败，后续候选需增加反馈，属于行为变化。
- 边界：`INT-B`。

### IA-102-002：部分重命名 no-op 可能静默返回

- 严重度 / 信心：`P3` / 中
- 复现：在 F1 / F6 依次执行定位、重命名、空态和历史操作，观察结果反馈与 history 变化。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/app.js`。
- 代码观察：executeEditCommand 仅在调用方传入 noopStatus 时显示状态，部分领域重命名没有统一传入该字段。
- 浏览器证据：`HF-12-14`；结论：正常重命名通过，no-op 反馈风险保留。
- 整改建议：第 107 项验证空名和未变化名称；若缺少反馈，后续候选需统一 no-op 反馈，属于行为变化。
- 边界：`INT-B`。

### IA-103-001：既有画布模式回归分母落后于运行时

- 严重度 / 信心：`P1` / 高
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/app.js`、`tools/webgl-generator-canvas-tool-mode-manager-regression.mjs`。
- 代码观察：运行时有 28 个注册模式，既有回归仅冻结 24 个，缺少 culture:center、religion:center、biome:suitability、feature:topology-select。
- 浏览器证据：`DM-103-MODES`；结论：浏览器确认运行时注册 28 项。
- 整改建议：后续整改批次让既有回归从运行时真实清单派生或同步补齐；本批不修改旧门禁。
- 边界：`UI-only`。

### IA-103-002：Escape 只显式退出城镇移动模式

- 严重度 / 信心：`P2` / 中
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/keyboard-shortcuts.js`、`app/webgl-generator/src/runtime/app.js`。
- 代码观察：selection.cancel 的可执行条件和 handler 只把 city:move 视为活动画布模式；其它活动模式不由该快捷键退出。
- 浏览器证据：`KV-106-ESCAPE`；结论：Escape 双消费已复现，模式统一退出仍待整改。
- 整改建议：第 107 项验证典型持续 / 一次性 / 草稿模式；若确认不合人类预期，另立 INT-B 任务设计统一优先级。
- 边界：`INT-B`。

### IA-103-003：手工标签 pointercancel 仍提交位置且切图未统一清理拖动

- 严重度 / 信心：`P1` / 高
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/app.js`。
- 代码观察：pointerup 与 pointercancel 共用 finishCustomLabelDrag；loadMapIntoRuntime 的切图清理未显式终止 customLabelDrag / pendingCustomLabelPlacement 及其 window 监听。
- 浏览器证据：`DM-103-MODES`；结论：浏览器上下文通过，切图取消风险保留。
- 整改建议：后续 INT-B 任务区分提交与取消，并在地图替换前统一终止标签拖动。
- 边界：`INT-B`。

### IA-103-004：测量控制点 pointercancel 不恢复拖动前坐标

- 严重度 / 信心：`P2` / 中
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/app.js`。
- 代码观察：测量控制点的 pointerup 与 pointercancel 共用 drag.end；该函数只清理监听，不保存起点或回滚草稿坐标。
- 浏览器证据：`DM-103-MODES`；结论：浏览器上下文通过，pointercancel 语义风险保留。
- 整改建议：第 107 项验证用户可见取消结果；若需回滚，另立 INT-B 任务保存起点并区分结束原因。
- 边界：`INT-B`。

### IA-103-005：指针捕获路径没有 lostpointercapture 恢复消费者

- 严重度 / 信心：`P2` / 高
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/panel-manager.js`、`app/webgl-generator/src/ui/vue/composables/use-draggable-floating-panel.js`。
- 代码观察：当前应用源码使用 setPointerCapture / releasePointerCapture，但没有注册 lostpointercapture。
- 浏览器证据：`DM-103-MODES`；结论：浏览器上下文通过，缺失消费者由 E-C 确认。
- 整改建议：第 107 项覆盖可构造路径；后续统一拖动基础设施时补 lostpointercapture 收口。
- 边界：`INT-B`。

### IA-103-006：共享拖动的 pointercancel 结果不一致

- 严重度 / 信心：`P3` / 高
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/panel-manager.js`、`app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue`、`app/webgl-generator/src/ui/vue/composables/use-draggable-floating-panel.js`、`app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue`。
- 代码观察：主面板回到起点；动作坞、高度工作台和未传 storageKey 的树状浮层仅在会话内保留末位置；项目导出浮层会持久化末位置；表格列宽保留最后一次 emit。
- 浏览器证据：`CW-104-PANELS`；结论：多类浮层可达，取消语义差异保留。
- 整改建议：第 107 项记录实际可见差异；后续按交互类型决定统一语义，不在审计批次修改。
- 边界：`INT-B`。

### IA-103-007：十九个拾取 / 创建 / 移动模式使用默认画布光标

- 严重度 / 信心：`P2` / 中
- 复现：在 F1 激活对应画布模式或直接拖动表面，触发 Escape / pointercancel / 捕获丢失并比较 active mode、草稿和历史。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/app.js`。
- 代码观察：只有八个连续笔刷使用 brush overlay，measurement 使用 crosshair；其余十九个模式没有模式专属光标。
- 浏览器证据：`DM-103-MODES`；结论：28 模式可达，默认光标问题保留。
- 整改建议：第 107 项观察典型模式的可发现性；如不足，后续纯 UI 候选可增加 cursor / overlay 提示。
- 边界：`UI-only`。

### IA-104-001：动作坞模式激活视觉与 aria-pressed 不一致

- 严重度 / 信心：`P1` / 高
- 复现：在 F1 / F2 打开对应复杂工作区，执行动作坞、筛选、表格滚动或双击，比较视觉状态、aria、selection 与行几何。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue`。
- 代码观察：12 个 panel:false 模式动作通过 action.active 呈现视觉 active，但 aria-pressed 只比较 action.key === active；直接模式动作不会把 dock active 设置为动作 key。
- 浏览器证据：`CW-104-PANELS`；结论：动作坞可达，aria 与视觉不同源由 E-C 确认。
- 整改建议：后续纯 UI 任务把 aria-pressed 与视觉 active 使用同一判定。
- 边界：`UI-only`。

### IA-104-002：文化名称库动作的元数据与最终结果不一致

- 严重度 / 信心：`P2` / 高
- 复现：在 F1 / F2 打开对应复杂工作区，执行动作坞、筛选、表格滚动或双击，比较视觉状态、aria、selection 与行几何。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/vue/components/CulturePanel.vue`、`app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue`。
- 代码观察：Culture namebase 动作未声明 panel:false；UiActionDock 会先尝试打开同名二级面板，宿主 handler 再清 active 并打开名称库绑定。
- 浏览器证据：`CW-104-PANELS`；结论：面板入口通过，动作元数据偏差保留。
- 整改建议：后续把 direct/open-other-panel 结果写入统一动作元数据。
- 边界：`INT-B`。

### IA-104-003：表格虚拟行高与 CSS 几何模型不一致

- 严重度 / 信心：`P1` / 高
- 复现：在 F1 / F2 打开对应复杂工作区，执行动作坞、筛选、表格滚动或双击，比较视觉状态、aria、selection 与行几何。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue`、`app/webgl-generator/src/styles.css`。
- 代码观察：UiObjectTable 固定按 32px 计算 spacer 和居中；19 个带定位列的表格行至少包含 28px 高按钮、上下各 6px 的 td padding 和 1px border，最小行高约 41px，其余 7 个表格也没有固定 32px CSS。
- 浏览器证据：`KV-106-narrow-baseline`；结论：窄视口表格几何偏差已观察。
- 整改建议：第 107 项用长列表与字体放大实测；后续将虚拟行高和 CSS 行高收敛到同一 token 或实测。
- 边界：`UI-only`。

### IA-104-004：双击编辑重复触发主选中

- 严重度 / 信心：`P2` / 中
- 复现：在 F1 / F2 打开对应复杂工作区，执行动作坞、筛选、表格滚动或双击，比较视觉状态、aria、selection 与行几何。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue`。
- 代码观察：11 个 edit 表格先收到浏览器 click 序列，每次 click emit select；dblclick handler 又 emit select + edit。
- 浏览器证据：`HF-12-14`；结论：选择与编辑链通过，重复派发风险保留。
- 整改建议：第 107 项核对用户可见影响；如有代价，后续去除 dblclick 内重复 select 或抑制双击 click 副作用。
- 边界：`INT-B`。

### IA-104-005：动作 key 不能作为全局结果语义

- 严重度 / 信心：`P2` / 高
- 复现：在 F1 / F2 打开对应复杂工作区，执行动作坞、筛选、表格滚动或双击，比较视觉状态、aria、selection 与行几何。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/vue/components/BiomePanel.vue`、`app/webgl-generator/src/ui/vue/components/CityPanel.vue`、`app/webgl-generator/src/ui/vue/components/ControlPanel.vue`、`app/webgl-generator/src/ui/vue/components/CulturePanel.vue`、`app/webgl-generator/src/ui/vue/components/DiplomacyPanel.vue`、`app/webgl-generator/src/ui/vue/components/LabelNamingPanel.vue`。
- 代码观察：68 个动作只有 32 个 unique key；assign 同时表示二级面板和画布模式，edit 同时表示画布模式和二级面板。
- 浏览器证据：`CW-104-PANELS`；结论：浏览器确认多宿主动作可达。
- 整改建议：继续以 host + key 作为动作身份，并在后续统一元数据时显式声明 resultClass。
- 边界：`INT-B`。

### IA-105-001：国家、省份、城市的实际画布删除绕过共用影响预检与确认

- 严重度 / 信心：`P1` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：面板控制器存在 executeDeleteWithPreflight 路径，但 pointerdown 实际直接创建删除命令；旧回归只证明死回调存在，未证明可见入口接线。
- 浏览器证据：`DR-105-F5-DELETE-CANCEL`；结论：取消路径保持指纹，绕过入口由 E-C 确认。
- 整改建议：统一画布、面板和 API 的删除预检契约，并对实际 pointer handler 限域断言。
- 边界：`INT-B`。

### IA-105-002：FMG Cells GEO 命令 apply 中途失败可能留下部分地图变更且没有历史

- 严重度 / 信心：`P1` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：命令先改高度再重建多域，自身没有 try/catch 快照恢复；EditHistory 只在 apply 完成后压栈。
- 浏览器证据：`DR-105-F5-GEO-APPLY-FAIL`；结论：已复现。
- 整改建议：为多域 GEO 导入命令增加 apply 级事务快照与故障注入回归。
- 边界：`INT-B`。

### IA-105-003：气候下游异步重算不受运行时互斥与旧结果保护

- 严重度 / 信心：`P1` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：公开 API 可并行触发并与地图替换交错；晚到任务仍会 onRestore 旧 map.options，失败回滚还可能覆盖并发合法变更。
- 浏览器证据：`DR-105-F5-CLIMATE-LATE-RESULT`；结论：已复现。
- 整改建议：增加全局互斥、request id、map identity 或过期结果丢弃契约。
- 边界：`INT-B`。

### IA-105-004：11 类受约束重生成只有 2 类成功后可撤销，且全部缺少统一失败快照

- 严重度 / 信心：`P1` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：markers、diplomacy 通过命令进入历史；其余 9 类直接原地改 map，runSync 配置没有 snapshot/rollback。
- 浏览器证据：`DR-105-F5-REGENERATE`、`DR-105-F5-REGENERATE-MID-FAIL`；结论：正常撤销通过；九类中途失败保留 E-N。
- 整改建议：为重生成建立聚合快照命令或 RuntimeOperation rollback。
- 边界：`INT-B`。

### IA-105-005：高度基础与下游重建是非事务串行链

- 严重度 / 信心：`P1` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：它们逐个调用 generate.regenerate；后一步失败会保留前步，历史仅覆盖 markers/diplomacy，不能代表整链可恢复。
- 浏览器证据：`DR-105-F5-HEIGHT-CHAIN-FAIL`；结论：已复现。
- 整改建议：为整条重建链建立单一快照、提交与回滚边界。
- 边界：`INT-B`。

### IA-105-006：24 个持久删除、清空和全量重置入口的确认契约不一致

- 严重度 / 信心：`P2` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：高影响删除有依赖摘要；多种可撤销入口仍是一击执行，route 单删还会按依赖数量动态决定是否确认。
- 浏览器证据：`DR-105-F5-DELETE-CANCEL`、`DR-105-F5-DELETE-UNDO`；结论：取消与失败回滚通过，跨入口表达仍不一致。
- 整改建议：按影响等级统一显示范围、是否可撤销与失败恢复说明。
- 边界：`INT-B`。

### IA-105-007：用户高度模板删除无确认、无历史、无恢复

- 严重度 / 信心：`P2` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：该入口直接过滤并持久化 localStorage，是 24 个入口中唯一完全不可撤销者。
- 浏览器证据：`DR-105-F5-DELETE-CANCEL`；结论：恢复缺口由 E-C 确认。
- 整改建议：增加确认与回收站、撤销或导出备份中的至少一种恢复契约。
- 边界：`INT-B`。

### IA-105-008：名称库删除在 UI 与 API 的确认契约不一致

- 严重度 / 信心：`P2` / 高
- 复现：从 F5 指纹开始执行对应 DR-105 故障、取消或恢复 case，比较 checksum、history、selection、options、theme 与 derivedStale。
- 代码证据：`E-C`；`tools/webgl-generator-interaction-danger-recovery-audit.mjs`。
- 代码观察：UI deleteImportedNamebase 使用 native confirm；公开 namebases.delete 直接执行命令且不要求 confirm:true。
- 浏览器证据：`DR-105-F5-DELETE-CANCEL`；结论：跨入口确认偏差由 E-C 确认。
- 整改建议：统一同语义跨入口的预检与显式确认契约。
- 边界：`INT-B`。

### IA-106-001：同一次 Escape 可能同时关闭 managed overlay 并清除 selection / editing

- 严重度 / 信心：`P1` / 高
- 复现：在三档视口的对应 KV-106 变体执行焦点、Escape、长文本、字体和目标尺寸检查。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/overlay-registry.js`、`app/webgl-generator/src/runtime/keyboard-shortcuts.js`、`app/webgl-generator/src/runtime/app.js`。
- 代码观察：OverlayRegistry 先注册 document capture 并执行 preventDefault + stopPropagation；这不会阻止同一 document 节点上后注册的快捷键 listener。快捷键 listener 又不检查 defaultPrevented，所以非 editable target 下同一事件仍可继续执行 selection.cancel。
- 浏览器证据：`KV-106-ESCAPE`；结论：已复现。
- 整改建议：建立单一 Escape 仲裁器或让后续消费者尊重 defaultPrevented，并冻结 popup、二级浮层、主面板、画布编辑的逐级优先级。
- 边界：`INT-B`。

### IA-106-002：Escape 结果随焦点是否位于可编辑控件而改变，内部 popup 还缺应用侧可证明优先级

- 严重度 / 信心：`P1` / 中
- 复现：在三档视口的对应 KV-106 变体执行焦点、Escape、长文本、字体和目标尺寸检查。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/keyboard-shortcuts.js`、`app/webgl-generator/src/ui/overlay-registry.js`。
- 代码观察：editable target 会让全局快捷键提前返回，但先注册的 overlay capture 仍会运行；Element Plus select / dropdown 的 Escape 位于依赖侧并晚于 document capture，静态源码不能证明一次按键只关闭候选。
- 浏览器证据：`KV-106-desktop-expanded-options`、`KV-106-narrow-expanded-options`、`KV-106-css-stress-expanded-options`；结论：三档焦点上下文通过，popup 优先级风险保留。
- 整改建议：把 Escape 从普通快捷键守卫中单列，第107项分别记录 panel container、输入框和展开 popup 的单次实际消费者。
- 边界：`INT-B`。

### IA-106-003：键盘焦点视觉表达在共享控件间不一致

- 严重度 / 信心：`P2` / 高
- 复现：在三档视口的对应 KV-106 变体执行焦点、Escape、长文本、字体和目标尺寸检查。
- 代码证据：`E-C`；`app/webgl-generator/src/styles.css`。
- 代码观察：图标动作和 checkbox 有独立 outline；二级关闭、表格 sort / resize / empty 等把 focus 与 hover 合并并清除 outline，只依赖颜色或背景变化。
- 浏览器证据：`KV-106-desktop-font-and-states`、`KV-106-narrow-font-and-states`、`KV-106-css-stress-font-and-states`；结论：三档焦点可达，表达不一致保留。
- 整改建议：统一 focus-visible token，并在第107项用逐控件像素差确认替代焦点样式是否足够。
- 边界：`UI-only`。

### IA-106-004：共享点击目标尺寸从 8px 到 32px，紧凑控件缺少统一命中区口径

- 严重度 / 信心：`P2` / 高
- 复现：在三档视口的对应 KV-106 变体执行焦点、Escape、长文本、字体和目标尺寸检查。
- 代码证据：`E-C`；`app/webgl-generator/src/styles.css`。
- 代码观察：二级关闭 26px、表格空态动作 26px、checkbox 14px、列宽拖柄 8px；同一系统的图标动作是 32px、表格行动作与面板头按钮是 28px。
- 浏览器证据：`KV-106-narrow-baseline`；结论：8px 拖柄、14px checkbox 与紧凑按钮已实测。
- 整改建议：保留视觉尺寸时扩大透明命中区；精密拖柄、checkbox 与行级代理在浏览器报告中单列。
- 边界：`UI-only`。

### IA-106-005：22 个 role=dialog 的 managed fixed overlay 都不会暂停全局快捷键

- 严重度 / 信心：`P2` / 高
- 复现：在三档视口的对应 KV-106 变体执行焦点、Escape、长文本、字体和目标尺寸检查。
- 代码证据：`E-C`；`app/webgl-generator/src/runtime/keyboard-shortcuts.js`、`app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue`、`app/webgl-generator/src/ui/vue/components/ControlPanel.vue`、`app/webgl-generator/src/ui/vue/components/HeightPanel.vue`、`app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue`。
- 代码观察：18 个动作坞、项目导出、高度图工作台和 2 个树状展示均声明 role=dialog，但没有 aria-modal=true 或 data-keyboard-exclusive=true；全局快捷键只把后两种属性视为独占。
- 浏览器证据：`KV-106-ESCAPE`、`KV-106-desktop-expanded-options`、`KV-106-narrow-expanded-options`、`KV-106-css-stress-expanded-options`；结论：全局快捷键排他性缺口保留。
- 整改建议：逐类决定 dialog 是否非模态；若需独占，补明确属性并验证打开期间保存、视图和面板快捷键不误触。
- 边界：`INT-B`。

### IA-107-001：720px 窄视口下高面板会撑高 document 并暴露表格越界内容

- 严重度 / 信心：`P1` / high
- 复现：在 720×720 打开国家面板基线：面板 bottom=826.4px，document 出现纵向滚动，表格列按钮与数据行越出 720px 视口。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/panel-manager.js`、`app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue`。
- 代码观察：在 720×720 打开国家面板基线：面板 bottom=826.4px，document 出现纵向滚动，表格列按钮与数据行越出 720px 视口。
- 浏览器证据：`KV-106-narrow-baseline`；结论：已复现。
- 整改建议：让主面板高度受安全区约束、由面板 body 承担纵向滚动，并保持对象表格横向内容只在表格容器内滚动。
- 边界：`UI-only`。

### IA-107-002：固定长中文会把常驻地图工具按钮横向撑出窄视口

- 严重度 / 信心：`P1` / high
- 复现：在 720×720 与 576×576 注入固定长中文，fit-view / toggle-measurement 的 right 分别达到 673.6px / 980.2px，document.scrollWidth 大于视口。
- 代码证据：`E-C`；`app/webgl-generator/src/ui/vue/components/MapToolbar.vue`、`app/webgl-generator/src/styles.css`。
- 代码观察：在 720×720 与 576×576 注入固定长中文，fit-view / toggle-measurement 的 right 分别达到 673.6px / 980.2px，document.scrollWidth 大于视口。
- 浏览器证据：`KV-106-narrow-long-zh`、`KV-106-css-stress-long-zh`；结论：已复现。
- 整改建议：为常驻地图工具建立窄视口换行或收纳策略，并限制按钮长文本最大宽度；不能依赖 document 横向滚动兜底。
- 边界：`UI-only`。
## 跨系统整改原则

1. 一次输入只允许一个最高优先级消费者；Escape 按 popup → 二级浮层 → 主面板 → 画布编辑 → selection 逐级退出。
2. 危险操作先展示影响，再进入单一事务边界；失败、取消、撤销和重载恢复不得混用同一措辞。
3. 同一 host + action key 才是动作身份；动作元数据必须显式声明直接动作、画布模式或二级面板。
4. 面板与表格分别承担外层可达性和内部滚动，不能把窄视口压力泄漏为 document 滚动。
5. 焦点、选中、编辑、预览和运行中状态都必须可见且不只依赖颜色。
6. 精密拖柄、原生 checkbox 和行级代理单列命中规则；其它普通动作统一透明命中区下限。
7. 长文本、150% 字体和固定窄视口是共享组件契约，不由领域面板各自兜底。
8. 功能结果、历史、selection、mode、持久化或恢复语义变化一律标 INT-B，等待用户批准。

## 功能变更附录

以下 21 项涉及 callback、command、history、selection、mode、持久化或恢复语义，必须先批准对应准权威候选：

- IA-102-001 列表定位失败可能缺少用户可见反馈 → Q-31
- IA-102-002 部分重命名 no-op 可能静默返回 → Q-31
- IA-103-002 Escape 只显式退出城镇移动模式 → Q-25
- IA-103-003 手工标签 pointercancel 仍提交位置且切图未统一清理拖动 → Q-28
- IA-103-004 测量控制点 pointercancel 不恢复拖动前坐标 → Q-28
- IA-103-005 指针捕获路径没有 lostpointercapture 恢复消费者 → Q-28
- IA-103-006 共享拖动的 pointercancel 结果不一致 → Q-28
- IA-104-002 文化名称库动作的元数据与最终结果不一致 → Q-30
- IA-104-004 双击编辑重复触发主选中 → Q-30
- IA-104-005 动作 key 不能作为全局结果语义 → Q-30
- IA-105-001 国家、省份、城市的实际画布删除绕过共用影响预检与确认 → Q-27
- IA-105-002 FMG Cells GEO 命令 apply 中途失败可能留下部分地图变更且没有历史 → Q-26
- IA-105-003 气候下游异步重算不受运行时互斥与旧结果保护 → Q-26
- IA-105-004 11 类受约束重生成只有 2 类成功后可撤销，且全部缺少统一失败快照 → Q-26
- IA-105-005 高度基础与下游重建是非事务串行链 → Q-26
- IA-105-006 24 个持久删除、清空和全量重置入口的确认契约不一致 → Q-27
- IA-105-007 用户高度模板删除无确认、无历史、无恢复 → Q-27
- IA-105-008 名称库删除在 UI 与 API 的确认契约不一致 → Q-27
- IA-106-001 同一次 Escape 可能同时关闭 managed overlay 并清除 selection / editing → Q-25
- IA-106-002 Escape 结果随焦点是否位于可编辑控件而改变，内部 popup 还缺应用侧可证明优先级 → Q-25
- IA-106-005 22 个 role=dialog 的 managed fixed overlay 都不会暂停全局快捷键 → Q-25

## 后续入口

下一批准权威整改候选见 [next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md](../task-notes/next-quasi-authoritative-interaction-remediation-tasks-2026-07-20.md)。用户批准前不得实施。
