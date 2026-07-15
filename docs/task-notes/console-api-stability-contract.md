# 控制台 API 稳定版本与扩展契约

本文档冻结权威任务第 33 项的封闭实现范围。当前任务只把既有控制台 API 提升为可供脚本和后续快捷键依赖的稳定契约，不实现第三方插件加载器、远程 HTTP 服务或新的业务操作。

## 版本与稳定等级

- API 版本：`1.0.0`。
- 能力表 schema 版本：`1.0.0`。
- 根 API 稳定等级：`stable`。
- `stable`：同一主版本内保持调用路径和既有语义兼容。
- `experimental`：允许在小版本中调整，不应作为长期扩展依赖。
- `deprecated`：继续兼容，但新调用必须改用声明的替代入口；只允许在下一个主版本移除。

除 `debug` 命名空间外，当前已经进入 API 门禁的公开方法提升为 `stable`。`debug` 方法继续标记为 `experimental`。旧方法 `data.exportAll` 标记为 `deprecated`，替代入口为 `data.exportMap`。

## 兼容入口

- 正式根入口为 `window.webglGeneratorApi`。
- `window.api` 是旧的开发便利别名；仅在该全局名未被占用时安装，并继续指向同一根 API 对象。
- `data.exportAll(options)` 继续与 `data.exportMap(options)` 保持相同的完整地图导出语义。
- deprecated 入口在 `2.0.0` 之前不得移除；移除或破坏 stable 方法必须提升主版本。

## 能力分组

能力表按扩展用途提供以下分组：

- `runtime.read`：读取版本、能力、地图摘要、运行时统计和健康信息。
- `map.generate`：读取或修改生成配置并生成 / 重算地图。
- `selection.control`：读取、选择、定位、高亮和编辑态控制。
- `display.control`：图层、视图、单位和显示偏好。
- `climate.control`：读取或更新气候与生物群系。
- `history.control`：读取、撤销和重做编辑历史。
- `map.edit`：通过统一 edit command 修改地图对象。
- `data.export`：生成导出结果、下载文件或写入浏览器存档。
- `data.import`：替换地图或导入外部数据。
- `namebases.read`：读取或导出名称库。
- `namebases.manage`：编辑名称库、绑定和批量改名。
- `debug.inspect`：读取诊断信息。
- `debug.control`：切换调试界面或触发诊断绘制。

每个公开方法必须在 `methodMetadata` 中声明 `stability`、兼容字段 `stable`、`capabilityGroup`、`mutates`、`undoable`、`async` 和 `requiresConfirm`。能力表同时给出能力组目录、确认策略和兼容别名目录，供后续快捷键及扩展在调用前机器判断。

## 破坏性调用边界

继续沿用 `{confirm: true}` 作为显式确认参数。能力表中的 `safety.confirmRequiredMethods` 与各方法的 `requiresConfirm` 必须完全一致。需要确认的方法未确认时必须结构化失败，不得隐式执行。

## 最小验收

1. 根 API 报告 `1.0.0 / stable`，能力表 schema 和兼容策略可机器读取。
2. 核心只读、选择、显示、历史、导入导出和编辑方法标记为 `stable`，调试方法仍为 `experimental`。
3. 所有 162 个公开方法都有完整稳定性、能力组、副作用和确认元数据，覆盖自检无缺失或多余项。
4. `window.api` 与 `data.exportAll` 旧别名继续可用，且能力表明确替代入口与最早移除主版本。
5. 专项回归、现有 API 静态回归、生产构建和 `git diff --check` 通过；浏览器综合验收统一留到权威任务第 34 项。
