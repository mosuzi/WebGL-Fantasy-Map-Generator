# 城市移动产品规则与兼容边界

本文档最初对应权威任务第 73 项。2026-08-08 用户以新的人工迁移规则覆盖了“首都不得跨国、省会不得跨省、单 cell 只能一城、路线失败拒绝整次移动”等旧约束；第 306 项已于 2026-08-09 按本页规则完成实施、兼容和浏览器验收，原第 73 / 302 项记录只作历史来源。

## 2026-08-08 当前生效规则

- 省会可以离开原省份，原省份随后自动重算省会。
- 城镇跨国后归目标所在地国家，原国家不再拥有该城镇；若迁出对象是首都，原国家随后自动重算首都。
- 允许多个城镇进入同一 grid cell / pack cell；自动生成阶段的均衡、间距和单 cell 占位不得限制人工移动。
- 人工移动除水域外不受上述生成 / 均衡门禁；有限坐标、地图边界或必要映射损坏仍按结构安全错误返回。

既有“省份 / 文化 / 宗教随目标 cell 更新”和“原港口在新位置失效时清除”规则继续生效。用户随后要求按调查报告和优化方案实施并持续返修至验收通过，因此第 306 项采用以下确定性边缘策略：

- 迁入对象清除原首都 / 省会角色；目标国家 / 省份已有有效首府时不篡位，缺少有效首府时确定性晋升迁入对象。
- 原国家没有任何候选城镇时允许 `capital=0`，但 `center / gridCenter` 必须指向仍属该国的合法陆地；原省没有候选时允许 `burg=0`，同样保留合法所属陆地中心。政治扩张、重生成锁、国家画笔、国家合并、保存和撤销 / 重做共用该不变量。
- 原港口在目标失效或重算异常时清为非港口并给出 warning；无法重寻的关联路线在同一可撤销事务内删除并警告，不反向拒绝合法陆地移动。
- 每个市场继续保留自己的 `centerBurgId` 与 burg 镜像；同 cell 冲突时旧单值 `pack.cells.market` 确定性取最小有效 market ID 作为兼容代表，并把经济下游标记 stale，等待既有重算入口处理。
- 完全重合城镇不改写真实坐标；picking 按稳定距离 / ID 候选循环，确保每个对象均可再次选中和移动。

## 现有模型与 Source 证据

正式应用中的同一城市同时存在两份镜像：

- `settlements.cities[cityId]` 保存 `cell / packCell / x / y / burgId / state / province / culture / religion / port / capital / provincial`。
- `pack.burgs[burgId]` 保存 `cell / x / y / cityId / state / province / culture / religion / port / capital`。
- `grid.cells.burg[gridCell]` 与 `pack.cells.burg[packCell]` 目前各只保存一个 ID，不能表达同 cell 多城。当前至少有 `106` 处 `cells.burg` 消费分布在 `17` 个源码文件；第 306 项必须先审计全部写入和读取链，再确定多值索引与 singular 兼容代表规则。
- 国家首都由 `state.capital = burgId` 反向引用，并同步 `state.center / state.gridCenter / capitalName`；省会由 `province.burg = burgId` 反向引用，并同步 `province.center / province.gridCenter`。
- 路线以 `route.from / route.to` 保存 city ID，同时单独保存 `cells / packCells / points` 几何以及国家、省份、feature 等摘要。
- `port` 不是布尔值，而是港口所连接的水体 feature ID；合法性依赖目标 cell 的 `haven / harbor`、水体可通航性、湖泊 outlet、温度或可通航河流，港城坐标还需要向岸边或河岸重锚。
- 城市 / burg 还保存 `feature / type / civilizationType / civilizationLabel / resourceCells / markerResourceCells / resourceGoodIds / resourceScore / group / visual` 等字段；移动时必须区分身份字段与位置派生字段，不能整包原样搬运。
- 市场中心除了 `centerBurgId`，还冗余保存 `cell / x / y / state / name`；`pack.cells.market` 与 burg 的 `market / plaza` 又形成经济归属，因此市场中心移动不能只依赖 burg ID 自动生效。

Source 的 `public/modules/ui/burg-editor.js` relocation 只拒绝水域与重复占位，普通城镇自动跟随目标 cell 国家，首都跨国时拒绝，并更新 burg 占位、cell、state 和坐标。它没有处理正式应用新增的 city / burg 双模型、省份、文化、宗教、港口有效性和路线几何；当前又与用户允许同 cell 多城、跨境首府重算的规则冲突，只能作为历史实现参考，不能作为产品门禁。

## 当前矩阵

| 领域 | 当前边界或建议 | 状态 |
|---|---|---|
| 人工落点 / 多城 | 除结构损坏外只拒绝水域；允许多个城镇位于同一 grid / pack cell，并保留各自精确世界坐标 | 用户已确认 |
| 国家 | 跨国后归目标国家，原国家不再拥有；原首都迁出时原国家重算首都 | 用户已确认 |
| 省份 / 文化 / 宗教 | 按目标 cell 更新，并同步 city 与 burg | 已实施并验收 |
| 港口 | 非港城不自动升级；原港口在目标仍合法时重算，不合法或重算异常时清除并警告 | 已实施并验收 |
| 国家首都 | 迁出对象清除旧角色，目标已有首都时不篡位、缺首都时晋升；原国无候选允许 `capital=0` 且保持合法本国陆地 center | 已实施并验收 |
| 省会 | 迁出对象清除旧角色，目标已有省会时不篡位、缺省会时晋升；原省无候选允许 `burg=0` 且保持合法所属陆地 center | 已实施并验收 |
| 市场中心 | 同步市场位置 / 国家镜像；同 cell 保留各中心，旧单值索引取稳定最小 ID 代表并标记经济 stale | 已实施并验收 |
| 陆路 / 海路 | 优先异步重寻；无法维持时在同一事务中删除并警告，不阻断合法陆地移动 | 已实施并验收 |

## 字段保留与重算

移动保持城市身份，不把地点变化误写成对象替换：

- 固定保留 city ID、burg ID、`cityId / burgId` 互引、名称、人口、备注和其它纯用户身份数据；首都 / 省会角色按获批的目标角色策略重算。
- `burg.feature` 必须改为目标 pack cell 的 feature。
- `state / province / culture / religion`、港口 feature 与最终坐标按目标 cell 和港口规则重算。
- `type / civilizationType / civilizationLabel`、资源 cell / goods / score 与自动 `group` 视为位置派生，复用现有聚落分类和资源收集 helper 按目标重算。
- `visual.manual === true` 的用户自定义视觉完整保留；自动视觉按新的文化、type、港口、group 和角色重算，避免内陆城市继续显示旧港口或旧文化剪影。
- 普通非市场中心城市的 `burg.market` 跟随目标 `pack.cells.market`；若目标没有有效市场则保留为 `0` 并把经济标记 stale。`production`、交易、财政等不在移动命令内静默重生成，只通过 stale 契约交给既有经济重算入口。

## 合法落点预检

预检必须是只读操作，并返回：

1. 城市、burg、原 / 目标 grid cell、pack cell 和最终坐标。
2. 目标是否为陆地、同 cell 已有城市 / burg 集合、兼容代表和 cell 映射是否完整；已有对象只作影响摘要，不构成拒绝理由。
3. 新旧国家、省份、文化、宗教及首都 / 省会规则结果。
4. 港口是保持、改连其它水体还是失效，以及是否需要岸边 / 河岸重锚。
5. 每条关联路线的保留、局部重寻、删除或失败原因；无关路线数量只作核对，不得改写。
6. 受影响的国家、省份和市场中心引用；首都 / 省会需列出 `center / gridCenter` 更新，市场中心需列出 `cell / x / y / state / name`、目标 cell 市场归属与经济 stale 传播。
7. 结构化 `valid / reasons / warnings / affected` 摘要；水域或结构损坏不得修改地图、选择或历史，其它派生失败必须转换为获批的明确降级方案而不是否决移动。

## 单命令与兼容边界

- 应用时只在地图 revision 改变时重新验证最终预检；同一目标的 pointerup、`isNoop` 和 `apply` 必须复用一个不可变 preflight，不能重复完整寻路。
- 一次移动只形成一条 `EditHistory`，原子同步 city、burg、多值索引与两个兼容代表、首都 / 省会重选及 center 镜像、市场中心镜像、港口、关联路线、位置派生字段、统计、picking、标签、导出和对象选择。
- 任一写入失败都恢复完整事务前状态；路线 / 港口不能完成原状态时按获批策略降级并警告，不留下半移动，也不反向否决合法陆地目标。
- 不新增地图 schema 必填字段；旧图经现有迁移 / ensure 后可移动，完整地图导出导入与浏览器缓存往返必须保留结果。
- 本项不实现新的国家拆分、全局路网重生成或新的港口生成算法；既有国家合并已补齐“空国作为 survivor”后确定性重选首都的兼容门。

## 用户确认与第 306 项实施结果

2026-08-08 用户明确覆盖旧矩阵：

- 省会可跨省，原省自动重选；首都可跨国，原国家自动重选。
- 城镇跨国后归目标国家，原国家不再拥有。
- 同 cell 可有多个城镇；人工移动除水域和结构损坏外不受生成均衡门禁。

2026-08-09 用户要求按调查报告和方案直接实施、如未通过则持续返工。第 306 项据此采用本页前述确定性策略，并通过城镇迁移、国家生命周期 / 拓扑、锁、查询、路线、Grid 细分、旧数据与连续两轮 10k / 100k 严格浏览器验收；这些策略现为已实施兼容契约，不再是待决建议。
