# 控制台 API 全量能力盘点

## 目的

本文档是权威任务第 28 项的范围冻结结果。盘点对象是当前正式应用中已经存在、且原则上可以脱离具体 Vue 组件执行的 runtime action、edit command、生成 / 重算、导入导出、选择 / 高亮、显示偏好、名称库和诊断能力。

本文档不把尚未实现的产品功能伪装成 API 缺口，也不在第 28 项补接口。所有缺口只分配给权威任务第 29～33 项；纯 UI 交互或已经有后续权威任务的能力明确暂缓。

## 当前公开 API 基线

当前公开基线：11 个命名空间、152 个方法，其中 70 个为编辑方法。

| 命名空间 | 方法数 | 当前结论 |
|---|---:|---|
| `info` | 5 | 已覆盖版本、能力、地图、运行时和 health 只读摘要 |
| `generate` | 5 | 已覆盖配置、新地图、换 seed 和受约束重算 |
| `selection` | 12 | 已覆盖选择、定位、拾取、闪烁、持久高亮和编辑态 |
| `layers` | 5 | 已覆盖核心图层、视图模式、主题和 fit view |
| `units` | 9 | 已覆盖当前全部显示单位偏好 |
| `climate` | 14 | 已覆盖气候读取与当前写入入口 |
| `history` | 5 | 已覆盖历史读取、peek、撤销和重做 |
| `edit` | 70 | 已覆盖当前全部可纯参数调用的既有编辑命令；交互手势型能力继续暂缓 |
| `data` | 10 | 已覆盖主要地图 / GEO / PNG / 记录导入导出 |
| `namebases` | 10 | 已覆盖名称库读取、交换、编辑、绑定与批量改名 |
| `debug` | 7 | 已覆盖只读诊断、debug UI 和单帧 profile |

## 分类规则

- `已暴露且共路径`：公开 API 已存在，并与 UI 复用同一底层 command、runtime helper 或导入导出核心。
- `已暴露但仍有分叉`：公开 API 已存在，但 UI 与 API 仍分别组装参数、状态、刷新或错误，需要第 30 / 31 项收口。
- `未暴露`：当前能力已存在于 runtime 或 edit command，但没有同等公开 API。
- `明确暂缓`：能力依赖 UI 手势、产品决策、未来功能或高风险内部状态，不属于第 29～33 项当前 API 补齐范围。

## 能力与后续归属

| # | 领域 | 能力 | 分类 | 当前入口 / 证据 | 后续归属 |
|---:|---|---|---|---|---|
| 1 | 信息 | 版本、capabilities、地图 / runtime / health 摘要 | 已暴露且共路径 | `api.info.*`、runtime / renderer 只读快照 | 第 33 项稳定化 |
| 2 | 生成 | 生成配置、新地图、换 seed、受约束重算 | 已暴露但仍有分叉 | `api.generate.*` 与控制面板共用生成核心，但 loading / health 分支未统一 | 第 30、31 项 |
| 3 | 选择 | resolve、select、clear、locate、pick、flash | 已暴露且共路径 | `api.selection.*` 复用 selection store、renderer 与 locate helper | 第 33 项稳定化 |
| 4 | 高亮 / 编辑态 | 持久高亮、清空高亮、开始 / 停止 / 切换编辑态 | 已暴露且共路径 | `api.selection.highlight / clearHighlights / *Editing` | 第 33 项稳定化 |
| 5 | 图层 | 视图模式、可见性、主题、fit view | 已暴露但仍有分叉 | API 直接调用显示 helper，UI 仍有独立 callback 包装 | 第 30 项 |
| 6 | 显示偏好 | 海洋高度、平滑边界、hover 信息、最大城市标签数 | 未暴露 | 控制面板 `onShowOceanHeight / onSmoothCellBorders / onShowHoverInfo / onMaxCityLabels` | 第 30 项 |
| 7 | 单位 | 距离、面积、数字缩写、地图 / 人口 / 军事 / 降水比例 | 已暴露且共路径 | `api.units.*` 与 normalized preferences | 第 33 项稳定化 |
| 8 | 气候 | 分区读取、纬度 / 经度范围、温度、降水、风向写入 | 已暴露但仍有分叉 | `api.climate.*` 复用气候核心，UI / API 状态包装仍分开 | 第 30 项 |
| 9 | 历史 | stats、peek、undo、redo | 已暴露且共路径 | `api.history.*` 与统一历史执行器 | 第 33 项稳定化 |
| 10 | 通用编辑 | 对象备注设置 / 删除 | 已暴露且共路径 | `api.edit.notes.*` 与 note command | 第 33 项稳定化 |
| 11 | 测量 | 保存、重命名、更新点列、删除 | 已暴露且共路径 | `api.edit.measurements.*` 与 measurement commands | 第 33 项稳定化 |
| 12 | 测量 | 批量导入测量对象 | 已暴露且共路径 | `api.edit.measurements.import()` 与 `createImportMeasurementsCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 13 | 城市 | 新增、删除、重命名、人口 | 已暴露且共路径 | `api.edit.cities.*` 与 city commands | 第 33 项稳定化 |
| 14 | 城市 | 同步归属、剪影设置 / 恢复 | 已暴露且共路径 | `api.edit.cities.syncOwner / setVisual / resetVisual` 与城市 commands | 第 29 项已完成；第 33 项稳定化 |
| 15 | 国家 | 新增、删除、重命名、颜色、单国政体 | 已暴露且共路径 | `api.edit.states.*` 与 state commands | 第 33 项稳定化 |
| 16 | 国家 | 设置首都、批量政体、国家归属刷纯 changes | 已暴露且共路径 | `api.edit.states.setCapital / setGovernmentBatch / applyChanges` 与 state commands | 第 29 项已完成；第 33 项稳定化 |
| 17 | 省份 | 新增、删除、重命名、颜色 | 已暴露且共路径 | `api.edit.provinces.*` 与 province commands | 第 33 项稳定化 |
| 18 | 省份 | 省份归属刷纯 changes | 已暴露且共路径 | `api.edit.provinces.applyChanges()` 与 `createApplyProvinceBrushCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 19 | 文化 / 宗教 | 新增、删除、重命名、颜色、继承、归属 changes | 已暴露且共路径 | `api.edit.cultures.* / religions.*` | 第 33 项稳定化 |
| 20 | 高度 | 高度纯 changes | 已暴露且共路径 | `api.edit.height.applyChanges()` 与 `createApplyHeightBrushCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 21 | 外交 | 设置关系、外交重生成命令 | 已暴露且共路径 | `api.edit.diplomacy.setRelation()` 与 diplomacy command；重生成另有 `api.generate.regenerate` | 第 29 项已完成；第 33 项稳定化 |
| 22 | 军事 | 比例、态势 / 批量态势、驻地、基地、战报、重命名 | 已暴露且共路径 | `api.edit.military.*` 9 个方法与 9 个 military commands；军事重生成另由 generate 覆盖 | 第 29 项已完成；第 33 项稳定化 |
| 23 | 地区 | Zone 样式编辑 | 已暴露且共路径 | `api.edit.zones.setStyle()` 与 `createSetZoneStyleCommand()` | 第 29 项已完成；第 33 项稳定化 |
| 24 | 路线 / 河流 / 湖泊 | 当前删除、备注、重命名和河宽编辑 | 已暴露且共路径 | `api.edit.routes / rivers / lakes` | 第 33 项稳定化 |
| 25 | 标签 / marker | 当前新增、删除、移动、视觉、备注和恢复 | 已暴露且共路径 | `api.edit.labels / markers` | 第 33 项稳定化 |
| 26 | 名称库 | list、export/import、CRUD、绑定、批量对象改名 | 已暴露但仍有分叉 | `api.namebases.*` 复用 commands，UI / API 文件与状态包装分开 | 第 30、32 项 |
| 27 | 数据导出 | 完整 JSON / gzip、GEO、要素 GEO、PNG、备注、测量 | 已暴露但仍有分叉 | `api.data.export*` 与 UI 共用核心 helper，下载状态分开 | 第 30、31 项 |
| 28 | 数据导入 | 完整地图、普通 GEO、Cells GEO | 已暴露但仍有分叉 | `api.data.importMap / importGEO` 与 UI 共用解析 / 命令核心 | 第 30～32 项 |
| 29 | 数据导入 | 高度图图片、导入诊断包导出、显式浏览器存储恢复 | 未暴露 | 控制面板 file action、map import diagnostic、浏览器存储 helper | 第 32 项 |
| 30 | 诊断 | debug 开关、snapshot、dump、renderer、health、profile | 已暴露且共路径 | `api.debug.*` | 第 33 项稳定化 |
| 31 | 诊断写入 | 清空 health、注入 delay、裸 state / typed array 写入口 | 明确暂缓 | 当前计划非目标，存在破坏运行节奏或绕过契约风险 | 第 33 项只记录权限边界 |
| 32 | UI shell | 面板打开 / 关闭、浮层焦点、文件选择器、画布手势模拟 | 明确暂缓 | 依赖具体 UI 与指针生命周期，不是非 UI 数据能力 | 第 35～37 项按各自范围处理 |
| 33 | 未来创作 | 路线 / 河流 / 湖泊创建、Zone / 独立备注等尚未实现能力 | 明确暂缓 | 当前不存在可复用 runtime command，不能列为 API 漏项 | 第 40、41 项实现产品能力后再登记 API |
| 34 | 高度 | 基础 / 下游派生重建 | 未暴露 | `rebuildHeightBaseDerived()`、`rebuildHeightDownstreamDerived()` | 第 30 项 |

## 第 29～33 项冻结范围

- 第 29 项：已完成。20 个方法补齐当前已经存在、且可以用参数调用的 edit command；未模拟指针手势，也未创造新产品能力。
- 第 30 项：收束已暴露 API 与 UI 的 action / 状态 / 刷新分叉，并补现有显示偏好与高度派生等非命令 runtime action。
- 第 31 项：统一生成、重算、导入和导出长任务的 busy、loading、错误、health 与 finally。
- 第 32 项：补高度图 / 诊断 / 浏览器持久化等数据入口和旧数据往返证据。
- 第 33 项：定义稳定等级、版本、兼容别名、确认与权限边界；不开放裸内部写入口。

第 29～33 项不得把“明确暂缓”项目偷渡进实现。后续真实新增 API 时，必须同时更新 `methods`、真实 API 对象、`methodMetadata` 和本文档归属。
