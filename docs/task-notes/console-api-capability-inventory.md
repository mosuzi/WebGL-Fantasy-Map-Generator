# 控制台 API 全量能力盘点

> 2026-07-25 状态：第 200 项已从当前 checkout 重建机器能力矩阵。本文继续保存第 28 项的历史分类，并补记第 200 项新增能力；完整分母、逐项排除和第 195 项归属以 `docs/audits/console-api-full-capability-matrix.json` 为准。

## 目的

本文档是权威任务第 28 项的范围冻结结果。盘点对象是当前正式应用中已经存在、且原则上可以脱离具体 Vue 组件执行的 runtime action、edit command、生成 / 重算、导入导出、选择 / 高亮、显示偏好、名称库和诊断能力。

本文档不把尚未实现的产品功能伪装成 API 缺口，也不在第 28 项补接口。所有缺口只分配给权威任务第 29～33 项；纯 UI 交互或已经有后续权威任务的能力明确暂缓。

## 当前公开 API 基线

当前公开基线：15 个命名空间、283 个方法，其中 156 个为编辑方法。

根 API 仍为 `1.0.0 / stable`。方法级稳定性统计为 229 个 `stable`、7 个 `experimental` 调试方法和 1 个 `deprecated` 兼容方法；能力表同时公开 15 个能力组、31 个显式确认方法以及 `window.api / data.exportAll` 两个兼容别名。下表“第 33 项稳定化”字样是第 28 项冻结时的归属记录，当前均已完成，不再表示待办。

| 命名空间 | 方法数 | 当前结论 |
|---|---:|---|
| `info` | 6 | 已覆盖版本、能力、按方法描述、地图、运行时和 health 只读摘要 |
| `objects` | 4 | 已覆盖对象类型发现、规范引用读取、轻量字段投影、稳定 cursor 分页与白名单查询 |
| `generate` | 5 | 已覆盖配置、新地图、换 seed 和受约束重算 |
| `oceanCurrents` | 5 | 已覆盖洋流重命名、普通重生成、世界重算预检 / 应用和取消 |
| `selection` | 12 | 已覆盖选择、定位、拾取、闪烁、持久高亮和编辑态 |
| `layers` | 15 | 已覆盖核心图层、视图模式、内置 / 用户主题 registry 与交换编辑、fit view 和 4 项显示偏好 |
| `units` | 9 | 已覆盖当前全部显示单位偏好 |
| `climate` | 16 | 已覆盖气候读取、当前写入入口和受约束下游重算预检 / 应用 |
| `history` | 5 | 已覆盖历史读取、peek、撤销和重做 |
| `edit` | 129 | 在既有对象编辑基础上补齐标签样式 / 布局、完整高度派生、海底预检 / 应用和五组高度语义 inspect / apply；Cell 发现和动作 registry 继续明确归属第 195 项 |
| `data` | 14 | 已覆盖地图 / GEO / 高度图 / 浏览器存档 / PNG / 记录与诊断导入导出 |
| `namebases` | 10 | 已覆盖名称库读取、交换、编辑、绑定与批量改名 |
| `debug` | 7 | 已覆盖只读诊断、debug UI 和单帧 profile |

## 分类规则

- `已暴露且共路径`：公开 API 已存在，并与 UI 复用同一底层 command、runtime helper 或导入导出核心。
- `已暴露但仍有分叉`：公开 API 已存在，但持久化兼容或稳定性契约仍需第 32～33 项收口。
- `未暴露`：当前能力已存在于 runtime 或 edit command，但没有同等公开 API。
- `明确暂缓`：能力依赖 UI 手势、产品决策、未来功能或高风险内部状态，不属于第 29～33 项当前 API 补齐范围。

## 能力与后续归属

| # | 领域 | 能力 | 分类 | 当前入口 / 证据 | 后续归属 |
|---:|---|---|---|---|---|
| 1 | 信息 | 版本、capabilities、地图 / runtime / health 摘要 | 已暴露且共路径 | `api.info.*`、runtime / renderer 只读快照 | 第 33 项稳定化 |
| 2 | 生成 | 生成配置、新地图、换 seed、受约束重算 | 已暴露且共路径 | UI 与 `api.generate.*` 共用 `runtimeActions.generate`；统一 operation 覆盖 busy、阶段、loading、health 和失败回滚 | 第 30、31 项已完成；第 33 项稳定化 |
| 3 | 选择 | resolve、select、clear、locate、pick、flash | 已暴露且共路径 | `api.selection.*` 复用 selection store、renderer 与 locate helper | 第 33 项稳定化 |
| 4 | 高亮 / 编辑态 | 持久高亮、清空高亮、开始 / 停止 / 切换编辑态 | 已暴露且共路径 | `api.selection.highlight / clearHighlights / *Editing` | 第 33 项稳定化 |
| 5 | 图层 | 视图模式、可见性、主题、fit view | 已暴露且共路径 | UI 与 `api.layers.*` 共用 `runtimeActions.layers`，统一刷新 renderer / runtime / overlay effects | 第 30 项已完成；第 33 项稳定化 |
| 6 | 显示偏好 | 海洋高度、平滑边界、hover 信息、最大城市标签数 | 已暴露且共路径 | `api.layers.setShowOceanHeight / setSmoothCellBorders / setShowHoverInfo / setMaxCityLabels` 与控制面板共用 action | 第 30 项已完成；第 33 项稳定化 |
| 7 | 单位 | 距离、面积、数字缩写、地图 / 人口 / 军事 / 降水比例 | 已暴露且共路径 | `api.units.*` 与 normalized preferences | 第 33 项稳定化 |
| 8 | 气候 | 分区读取、纬度 / 经度范围、温度、降水、风向写入 | 已暴露且共路径 | UI 与 `api.climate.*` 共用 `runtimeActions.climate.apply`，统一返回派生 stale 与刷新 effects | 第 30 项已完成；第 33 项稳定化 |
| 9 | 历史 | stats、peek、undo、redo | 已暴露且共路径 | `api.history.*` 与统一历史执行器 | 第 33 项稳定化 |
| 10 | 通用编辑 | 对象备注设置 / 删除、独立备注创建、摘要导入与批量删除 | 已暴露且共路径 | `api.edit.notes.*` 与 note command | 第 33、41、46 项已完成 |
| 11 | 测量 | 保存、重命名、更新点列、删除 | 已暴露且共路径 | `api.edit.measurements.*` 与 measurement commands | 第 33 项稳定化 |
| 12 | 测量 | 批量导入测量对象 | 已暴露且共路径 | `api.edit.measurements.import()` 与 `createImportMeasurementsCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 13 | 城市 | 新增、删除、重命名、人口 | 已暴露且共路径 | `api.edit.cities.*` 与 city commands | 第 33 项稳定化 |
| 14 | 城市 | 同步归属、剪影设置 / 恢复 | 已暴露且共路径 | `api.edit.cities.syncOwner / setVisual / resetVisual` 与城市 commands | 第 29 项已完成；第 33 项稳定化 |
| 15 | 国家 | 新增、删除、重命名、颜色、单国政体 | 已暴露且共路径 | `api.edit.states.*` 与 state commands | 第 33 项稳定化 |
| 16 | 国家 | 设置首都、批量政体、国家归属刷纯 changes | 已暴露且共路径 | `api.edit.states.setCapital / setGovernmentBatch / applyChanges` 与 state commands | 第 29 项已完成；第 33 项稳定化 |
| 17 | 省份 | 新增、删除、重命名、颜色 | 已暴露且共路径 | `api.edit.provinces.*` 与 province commands | 第 33 项稳定化 |
| 18 | 省份 | 省份归属刷纯 changes | 已暴露且共路径 | `api.edit.provinces.applyChanges()` 与 `createApplyProvinceBrushCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 19 | 文化 / 宗教 | 新增、删除、重命名、颜色、继承、归属、中心与受约束重扩张 | 已暴露且共路径 | `api.edit.cultures.* / religions.*` | 第 33 项稳定化；第 76 项补扩张预检 / 提交 |
| 20 | 高度 | 高度纯 changes | 已暴露且共路径 | `api.edit.height.applyChanges()` 与 `createApplyHeightBrushCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 21 | 外交 | 设置关系、外交重生成命令 | 已暴露且共路径 | `api.edit.diplomacy.setRelation()` 与 diplomacy command；重生成另有 `api.generate.regenerate` | 第 29 项已完成；第 33 项稳定化 |
| 22 | 军事 | 比例、态势 / 批量态势、驻地、基地、战报、重命名 | 已暴露且共路径 | `api.edit.military.*` 9 个方法与 9 个 military commands；军事重生成另由 generate 覆盖 | 第 29 项已完成；第 33 项稳定化 |
| 23 | 地区 | Zone 创建、删除和样式编辑 | 已暴露且共路径 | `api.edit.zones.*` 与 Zone commands | 第 29、41 项已完成；第 33 项稳定化 |
| 24 | 路线 / 河流 / 湖泊 / feature | 创建、删除、改线、端点重连、样式、备注、重命名、河宽、湖泊出口和局部水陆修正 | 已暴露且共路径 | `api.edit.routes / rivers / lakes / features`；路线改线、湖泊出口和局部水陆修正均与 UI 共用预检、runtime action 和 edit command | 第 40、49、50 项已完成 |
| 25 | 标签 / marker | 当前新增、删除、移动、视觉、备注和恢复 | 已暴露且共路径 | `api.edit.labels / markers`；marker id 作为稳定对象身份，不再依赖数组下标 | 第 33、41 项已完成 |
| 26 | 名称库 | list、export/import、CRUD、绑定、批量对象改名 | 已暴露且共路径 | UI 文件适配与 `api.namebases.*` 共用 `runtimeActions.namebases`；既有名称库文档往返门禁继续有效 | 第 30、32 项已完成；第 33 项稳定化 |
| 27 | 数据导出 | 完整 JSON / gzip、GEO、要素 GEO、PNG、备注、测量 | 已暴露且共路径 | UI 下载提示与 `api.data.export*` 共用 `runtimeActions.data` 及同一序列化结果；PNG / gzip 已接统一 operation | 第 30、31 项已完成；第 33 项稳定化 |
| 28 | 数据导入 | 完整地图、普通 GEO、Cells GEO | 已暴露且共路径 | UI 与 API 共用 action；固定 v1 / v2 地图往返、失败回滚、GEO 命令路径均有代码门禁 | 第 30～32 项已完成；第 33 项稳定化 |
| 29 | 数据导入 | 高度图图片、导入诊断包导出、浏览器存档保存 / 恢复 | 已暴露且共路径 | `data.importHeightmap / exportImportDiagnostic / saveBrowserMap / restoreBrowserMap`；控制面板共用 `runtimeActions.data` | 第 32 项已完成；第 33 项稳定化 |
| 30 | 诊断 | debug 开关、snapshot、dump、renderer、health、profile | 已暴露且共路径 | `api.debug.*` | 第 33 项稳定化 |
| 31 | 诊断写入 | 清空 health、注入 delay、裸 state / typed array 写入口 | 明确暂缓 | 当前计划非目标，存在破坏运行节奏或绕过契约风险 | 第 33 项只记录权限边界 |
| 32 | UI shell | 面板打开 / 关闭、浮层焦点、文件选择器、画布手势模拟 | 明确暂缓 | 依赖具体 UI 与指针生命周期，不是非 UI 数据能力 | 第 35～37 项按各自范围处理 |
| 33 | 未来创作 | 尚未进入权威任务的额外创作器 | 明确暂缓 | 路线 / 河流 / 湖泊已由第 40 项补齐；Zone、通用 marker 与独立备注已由第 41 项补齐 | 后续对应产品任务实现后再登记 API |
| 34 | 高度 | 基础 / 下游派生重建 | 已暴露且共路径 | `api.edit.height.rebuildBaseDerived / rebuildDownstreamDerived` 与高度面板共用 action，要求 `confirm: true` | 第 30 项已完成；第 33 项稳定化 |
| 35 | 经济 | 市场归属预检、cell 归属应用与经济链重算 | 已暴露且共路径 | `api.edit.economy.inspectAssignment / assignCells / rebuild` 与市场归属面板共用 command；写入方法要求 `confirm: true` | 第 48 项已完成 |
| 36 | 生物群系 | 局部归属编辑 | 已暴露且共路径 | `api.edit.biomes.assignCells()` 与生物群系面板共用预检、适居度重算和 edit command；陆水不匹配、非法目标及越界输入统一拒绝 | 第 51 项已完成 |
| 37 | 视觉主题 | 用户主题查询、导入导出、创建、颜色编辑与删除 | 已暴露且共路径 | `api.layers.listThemes / exportTheme / importTheme / createTheme / updateTheme / deleteTheme` 与视图页共用白名单 registry、地图存储和 edit command | 第 52 项已完成 |
| 38 | 国家拓扑 | 相邻国家合并、完整旧省拆分的预检与事务提交 | 已暴露且共路径 | `api.edit.states.inspectMerge / merge / inspectSplit / split` 与国家面板共用 runtime action、EditHistory 和拓扑命令；写入口要求 `confirm: true`，没有独立分省 API | 第 74 项实现完成，待同一 Chrome 验收 |
| 39 | Feature 拓扑 | 海岸雕刻 / 填海、海峡开合、湖海开渠的预检与事务提交 | 已暴露且共路径 | `api.edit.features.inspectTopology / applyTopology` 与 Feature 面板共用 runtime action、EditHistory 和拓扑命令；写入口要求 `confirm: true` | 第 75 项实现 |
| 40 | 数值适居度 | 局部直接设值、恢复自动基准与陆地 / 水域 / 全部范围预检 | 已暴露且共路径 | `api.edit.biomes.inspectSuitability / applySuitability` 与生物群系面板共用适居度命令；写入口形成单条可撤销历史且不要求确认 | 第 77 项实现 |
| 41 | 人口 | 单个国家、省份、文化或宗教的区域手工增减 | 已暴露且共路径 | `api.edit.population.inspectAdjustment / applyAdjustment` 与人口面板共用预检和单事务命令；城乡及个体按当前人口占比分摊，写入口不要求确认 | 第 78 项实现 |
| 42 | 对象发现 | 类型、单对象、分页列表与白名单查询 | 已暴露且共路径 | `api.objects.types / get / list / query` 复用对象 resolver；默认轻量字段，重字段需显式 `fields`，cursor 与结果均可 JSON 序列化 | 第 200 项 |
| 43 | 洋流 | 重命名、普通重生成、世界重算预检 / 应用 / 取消 | 已暴露且共路径 | 洋流面板与 `api.oceanCurrents.*` 共用 `runtimeActions.oceanCurrents`；公开世界重算只接受白名单参数 | 第 200 项 |
| 44 | 标签 | 样式读取 / 修改 / 重置、优先级与位置锁定 | 已暴露且共路径 | 标签面板、命名面板与 `api.edit.labels.*` 共用标签 style / layout command 和历史 | 第 200 项 |
| 45 | 高度 | 全局变换、模板、程序、条件变换、选区平滑、海底重设和完整派生重建 | 已暴露且共路径 | 五组语义工具均提供 inspect / apply；公开预检默认只返回摘要和有界样本，写入复用高度 command，海底与完整派生使用现有事务 | 第 200 项 |
| 46 | AI 自描述 | 真实参数签名、输入 / 结果 schema、枚举、引用空间、业务 code、分页和副作用元数据 | 已暴露且共路径 | `api.info.describe(method)` 从真实公共函数签名生成参数名与顺序，复杂方法使用版本化 schema override；五方覆盖门禁拒绝缺失描述 | 第 200 项 |

## 第 29～33 项冻结范围

- 第 29 项：已完成。20 个方法补齐当前已经存在、且可以用参数调用的 edit command；未模拟指针手势，也未创造新产品能力。
- 第 30 项：已完成。建立应用级唯一 `runtimeActions`，收束生成 / 重算、图层 / 显示、气候、导入导出、选择与名称库代表路径；补 4 个显示偏好和 2 个高度派生方法，`regress:api-action-convergence` 固定公共 action、结果 effects、错误 code 和方法计数。
- 第 31 项：已完成。统一生成、重算、导入和导出长任务的 busy、阶段、loading、错误、health 与 finally；地图替换失败执行事务回滚。
- 第 32 项：已完成。补高度图、完整地图诊断和浏览器存档数据入口；固定 v1 / v2 地图及旧裸浏览器存档完成导入、导出、再导入等价证明。
- 第 33 项（已完成）：定义稳定等级、版本、兼容别名、确认与权限边界；不开放裸内部写入口。

第 29～33 项不得把“明确暂缓”项目偷渡进实现。后续真实新增 API 时，必须同时更新 `methods`、真实 API 对象、`methodMetadata` 和本文档归属。
