# 城市移动产品规则冻结稿

本文档对应权威任务第 73 项。当前状态为 **规则已确认、实现完成并待同一 Chrome 验收**：用户于 2026-07-17 整体确认本页“推荐冻结矩阵”，实现严格按该矩阵、数据不变量和验收边界执行，验收前不计任务完成。

## 现有模型与 Source 证据

正式应用中的同一城市同时存在两份镜像：

- `settlements.cities[cityId]` 保存 `cell / packCell / x / y / burgId / state / province / culture / religion / port / capital / provincial`。
- `pack.burgs[burgId]` 保存 `cell / x / y / cityId / state / province / culture / religion / port / capital`。
- `grid.cells.burg[gridCell]` 指向 city ID，`pack.cells.burg[packCell]` 指向 burg ID；移动前后必须清除旧槽位并写入新槽位。
- 国家首都由 `state.capital = burgId` 反向引用，并同步 `state.center / state.gridCenter / capitalName`；省会由 `province.burg = burgId` 反向引用，并同步 `province.center / province.gridCenter`。
- 路线以 `route.from / route.to` 保存 city ID，同时单独保存 `cells / packCells / points` 几何以及国家、省份、feature 等摘要。
- `port` 不是布尔值，而是港口所连接的水体 feature ID；合法性依赖目标 cell 的 `haven / harbor`、水体可通航性、湖泊 outlet、温度或可通航河流，港城坐标还需要向岸边或河岸重锚。
- 城市 / burg 还保存 `feature / type / civilizationType / civilizationLabel / resourceCells / markerResourceCells / resourceGoodIds / resourceScore / group / visual` 等字段；移动时必须区分身份字段与位置派生字段，不能整包原样搬运。
- 市场中心除了 `centerBurgId`，还冗余保存 `cell / x / y / state / name`；`pack.cells.market` 与 burg 的 `market / plaza` 又形成经济归属，因此市场中心移动不能只依赖 burg ID 自动生效。

Source 的 `public/modules/ui/burg-editor.js` relocation 只拒绝水域与重复占位，普通城镇自动跟随目标 cell 国家，首都跨国时拒绝，并更新 burg 占位、cell、state 和坐标。它没有处理正式应用新增的 city / burg 双模型、省份、文化、宗教、港口有效性和路线几何，因此只能作为“落点门禁与首都不得跨国”的行为参考，不能直接照搬。

## 推荐冻结矩阵

| 领域 | 推荐规则 | 排除的替代方案 |
|---|---|---|
| 国家 / 省份 / 文化 / 宗教 | 普通城市移动后自动跟随目标 pack / grid cell 的四类归属，并同步 city 与 burg | 保留原归属会使“迁国 / 迁省”名义存在但绝大多数目标落点被拒绝，也会制造城市与 cell 语义不一致 |
| 港口 | 非港城不因移动自动升级；原港城在目标仍满足可通航条件时重算港口 feature 与岸边 / 河岸坐标，不满足时自动清除港口，并在预检列出受影响海路 | 无条件保留会留下内陆港口；目标无港即拒绝会让普通的港城迁内陆无法完成 |
| 国家首都 | 只允许在原国家内移动；跨国或迁入中立 cell 直接拒绝；同国移动保持首都身份并更新 `state.center / capitalName` | 自动把首都转给目标国家会引入双首都、旧国家无首都和第 74 项继承规则；自动降级也会隐式改变政治身份 |
| 省会 | 只允许在原省份内移动；跨省直接拒绝；同省移动保持省会身份与 `province.burg` | 跨省自动转移会让旧省无省会、目标省双省会；自动降级属于额外政治决策 |
| 市场中心 | 第一阶段只允许在原国家内移动；跨国或迁入中立 cell 拒绝。同国移动保持 market ID 与 `centerBurgId`，同步市场 `cell / x / y / state / name`、目标 cell 市场归属和 burg `market / plaza`，并把经济及其外交 / 军事 / 地区下游标记 stale | 只保留 `centerBurgId` 会让市场停在旧坐标；跨国自动重分市场覆盖、交易与财政会把本项扩大成经济拓扑重生成 |
| 陆路 | 只重寻 `from / to` 命中移动城市的道路 / 小径，保留路线 ID、类型、等级、备注与另一端；任一路线无法合法重寻时整次移动拒绝 | 全局重生成会改写无关路线；只改端点坐标会留下几何断裂 |
| 海路 | 港口仍有效时，以新港口和原另一端局部重寻并保留路线身份；港口失效或水体不兼容时删除该关联海路，并在预检明确列出；其它海路不变 | 静默保留会留下内陆或跨水体断路；因一条海路失效拒绝所有港城迁移过于保守 |

## 字段保留与重算

移动保持城市身份，不把地点变化误写成对象替换：

- 固定保留 city ID、burg ID、`cityId / burgId` 互引、名称、人口、备注、资本 / 省会身份（仅限上表允许的同域移动）和其它纯用户身份数据。
- `burg.feature` 必须改为目标 pack cell 的 feature。
- `state / province / culture / religion`、港口 feature 与最终坐标按目标 cell 和港口规则重算。
- `type / civilizationType / civilizationLabel`、资源 cell / goods / score 与自动 `group` 视为位置派生，复用现有聚落分类和资源收集 helper 按目标重算。
- `visual.manual === true` 的用户自定义视觉完整保留；自动视觉按新的文化、type、港口、group 和角色重算，避免内陆城市继续显示旧港口或旧文化剪影。
- 普通非市场中心城市的 `burg.market` 跟随目标 `pack.cells.market`；若目标没有有效市场则保留为 `0` 并把经济标记 stale。`production`、交易、财政等不在移动命令内静默重生成，只通过 stale 契约交给既有经济重算入口。

## 合法落点预检

预检必须是只读操作，并返回：

1. 城市、burg、原 / 目标 grid cell、pack cell 和最终坐标。
2. 目标是否为陆地、是否已有其它城市 / burg、cell 映射是否完整。
3. 新旧国家、省份、文化、宗教及首都 / 省会规则结果。
4. 港口是保持、改连其它水体还是失效，以及是否需要岸边 / 河岸重锚。
5. 每条关联路线的保留、局部重寻、删除或失败原因；无关路线数量只作核对，不得改写。
6. 受影响的国家、省份和市场中心引用；首都 / 省会需列出 `center / gridCenter` 更新，市场中心需列出 `cell / x / y / state / name`、目标 cell 市场归属与经济 stale 传播。
7. 结构化 `valid / reasons / warnings / affected` 摘要；非法落点不得修改地图、选择或历史。

## 单命令与兼容边界

- 应用时必须重新验证预检，不能直接信任旧预览。
- 一次移动只形成一条 `EditHistory`，原子同步 city、burg、两个占位表、首都 / 省会反向引用与 center 镜像、市场中心镜像、港口、关联路线、位置派生字段、统计、picking、标签、导出和对象选择。
- 任一局部寻路、港口解析或写入失败都恢复完整事务前状态，不留下半移动。
- 不新增地图 schema 必填字段；旧图经现有迁移 / ensure 后可移动，完整地图导出导入与浏览器缓存往返必须保留结果。
- 本项不实现国家合并 / 拆分、首都继承、自动重选省会、全局路网重生成或新的港口生成算法；这些属于第 74 项或后续独立任务。

## 用户确认结果

用户已确认整体采用上面的推荐矩阵，未修改以下选择：

- 四类归属自动跟随目标 cell。
- 港口失效时自动清除，而不是拒绝移动。
- 首都不得跨国，省会不得跨省。
- 市场中心不得跨国；同国移动同步市场镜像并把经济、外交、军事和地区标记 stale。
- 陆路局部重寻失败则拒绝整次移动；失效海路在预检明示后随移动删除。
