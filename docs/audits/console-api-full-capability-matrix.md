# 控制台 API 全量能力矩阵

> 本报告由 `tools/webgl-generator-api-full-capability-matrix.mjs` 从当前源码生成。权威任务状态仍以 `docs/current-plan.md` 为准。

## 当前分母

- 交互表面：105（纳入 87，交互审计排除 18）
- 画布模式：29
- runtime actions：255
- API action 绑定：254
- command / inspector 导出：210
- 公共 API 方法：303
- 矩阵总行数：1167

## 分类结果

- covered：1094
- excluded：73
- deferred-owned：0
- gap：0
- unknown：0
- unclassified：0
- unownedParameterizableGap：0

## 真实缺口

- 无。

## runtime action 差集

- 无。

## 第 195 项 Cell 能力收口

- `cell.action-inspection`：按 Cell / Point / Path / Range 动作 registry 与只读预检（covered；cells.actions、cells.inspectAction、edit.cities.inspectCreateAtCell、edit.provinces.inspectCreateAtCell、edit.states.inspectCreateAtCell）
- `cell.controlled-write`：国家、省份、城市等同族 createAtCell 与受控写入（covered；edit.cities.createAtCell、edit.provinces.createAtCell、edit.states.createAtCell）
- `cell.read`：Grid / Pack Cell 读取、映射、邻接与分页查询（covered；cells.get、cells.getAtPoint、cells.neighbors、cells.query、cells.scan）
- `cell.visual-diagnostics`：Grid Cells 共享边诊断层、ID 与诊断高亮（covered；cells.locate、layers.get、layers.setVisible）

## 保留排除项

- `excluded:browser.native-file-picker`：原生文件选择器无法用纯参数稳定表达；导入导出 API 直接接收或返回可序列化 payload。
- `excluded:browser.permissions`：下载、剪贴板和文件系统权限由浏览器管理，不属于地图 API。
- `excluded:debug.fault-injection`：故障注入会绕过正式安全契约，仅允许专项回归直接使用测试夹具。
- `excluded:remote.write-bridge`：远程写入 bridge 未获授权；页面内 API 与本地浏览器自动化已经覆盖当前控制面。
- `excluded:ui.panel-geometry`：面板拖动、尺寸、贴边收起和焦点返回属于 UI 壳层，不改变地图能力。
- `excluded:ui.table-layout`：筛选输入、排序状态与列宽属于表格 UI 壳层，对象数据由 objects 与领域 API 提供。
- `excluded:ui.visual-transition`：加载动画、toast 时序和纯视觉过渡不改变地图数据或显示配置。
- `surface:fixed-overlay:action-dock:biome-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:city-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:control-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:culture-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:diplomacy-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:label-naming-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:lake-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:marker-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:measurement-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:military-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:notes-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:population-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:province-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:religion-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:river-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:route-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:state-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:action-dock:zone-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:tree:culture-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:fixed-overlay:tree:religion-panel`：动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。
- `surface:global:app-webgl-generator-src-runtime-health-monitor`：健康监测只记录诊断，不是用户交互表面
- `surface:global:app-webgl-generator-src-runtime-keyboard-shortcuts`：全局事件负责快捷键、拖动、焦点或组件桥接，不形成独立地图参数能力。
- `surface:global:app-webgl-generator-src-runtime-regeneration-lock-ui-session`：用户入口已归入 14 个对象列表与共享画布模式，不重复计入全局分母
- `surface:global:app-webgl-generator-src-ui-brush-cursor-preview`：局部委托行为已归入 canvas:map-canvas，不重复计入全局分母
- `surface:global:app-webgl-generator-src-ui-label-naming-panel-trigger`：局部委托行为已归入对应面板，不重复计入全局分母
- `surface:global:app-webgl-generator-src-ui-overlay-registry`：全局事件负责快捷键、拖动、焦点或组件桥接，不形成独立地图参数能力。
- `surface:global:app-webgl-generator-src-ui-panel`：全局事件负责快捷键、拖动、焦点或组件桥接，不形成独立地图参数能力。
- `surface:global:app-webgl-generator-src-ui-panel-manager`：全局事件负责快捷键、拖动、焦点或组件桥接，不形成独立地图参数能力。
- `surface:global:app-webgl-generator-src-ui-vue-components-base-ui-action-dock`：局部行为已按 18 个 fixed-overlay 宿主展开，不重复计入全局分母
- `surface:global:app-webgl-generator-src-ui-vue-components-control-panel`：局部行为已归入 fixed-overlay:project-export，不重复计入全局分母
- `surface:global:app-webgl-generator-src-ui-vue-composables-use-debug-mode`：内部状态同步，不是直接用户交互表面
- `surface:global:app-webgl-generator-src-ui-vue-composables-use-draggable-floating-panel`：拖动生命周期已归入 shared / fixed-overlay，不重复计入全局分母
- `surface:global:worker-generation`：worker 内部桥接事件不直接呈现为用户交互表面；用户可见加载反馈已归入 canvas:generation-feedback
- `surface:panel-helper:lazy-vue-panel`：内部面板基础设施，不是独立用户交互表面
- `surface:resident:vue-state-bridge`：隐藏内部桥接组件，不直接呈现或接收用户交互
- `surface:shared:detail-grid`：纯展示或布局组件，没有独立交互事件
- `surface:shared:filter-input`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:object-table`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:selection-scroll`：纯展示或布局组件，没有独立交互事件
- `surface:shared:sort-bar`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:summary-grid`：纯展示或布局组件，没有独立交互事件
- `surface:shared:table-scroll`：纯展示或布局组件，没有独立交互事件
- `surface:shared:ui-action-dock`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-button`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-color-action-panel`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-color-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-detail-grid`：纯展示或布局组件，没有独立交互事件
- `surface:shared:ui-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-filter-input`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-key-value-grid`：纯展示或布局组件，没有独立交互事件
- `surface:shared:ui-layer-toggle-button`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-metric-grid`：纯展示或布局组件，没有独立交互事件
- `surface:shared:ui-note-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-number-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-object-table`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-panel-io-actions`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-regeneration-lock-actions`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-segmented`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-select-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-slider-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-sort-bar`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-state-banner`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-switch-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-tabs`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-text-edit-field`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
- `surface:shared:ui-tree-display-panel`：共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。
