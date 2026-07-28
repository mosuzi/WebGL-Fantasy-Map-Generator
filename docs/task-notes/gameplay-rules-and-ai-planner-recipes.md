# 完整玩法规则与 AI 规划器配方

> 状态：权威任务第 210 项已发布中文玩法说明。本文按当前公开 API、六十八个规则动作和十个机器可发现配方编写；稳定配方 ID、步骤 ID、事实读取、预检入口、执行入口、授权点、成功条件、补偿策略和 revision 重读点与机器目录共同构成发布契约，二者不得各自维护另一套语义。

## 一、共同执行契约

### 1.1 三层能力边界

完整玩法只使用三类能力：

1. **事实读取**：使用 `info.mapSummary`、`info.runtimeStats`、`objects.get`、`objects.list`、`objects.query`、`cells.get`、`cells.neighbors`、`cells.query`、`history.get` 等公开只读方法确认当前地图事实。
2. **规则事务**：调用领域 inspector，取得 `inspectionToken`、`expectedRevision`、稳定业务 `code` 和 `requiresConfirm`，必要时取得用户授权，再调用与之配对的执行方法。
3. **规划器配方**：按玩家目标逐步组合事实读取和规则事务。配方本身不是写接口，不直接修改地图，也不把多步操作包装成一条超大事务。

`cells.inspectAction` 只负责 Cell 动作的空间输入和原子输入预检，不能替代领土、行政、外交、军事等领域 inspector。`info.describe` 用于读取公开方法契约；它不是领域规则已经允许执行的证明。

### 1.2 每一步的固定顺序

每个会写地图的配方步骤都必须依次完成：

1. 调用事实方法，读取当前对象、Cell、历史和运行时状态。
2. 调用该步骤登记的 preflight 或领域 inspector。
3. 若 `allowed=false`，保留已经提交的前序步骤，按稳定 `code` 停止或重规划。
4. 若 `requiresConfirm=true`，展示本步影响并等待本步授权；不能用配方开始时的一次授权代替后续授权。
5. 使用 inspector 返回的 `inspectionToken` 与 `expectedRevision` 执行当前规则事务。
6. 再次调用 `info.runtimeStats`、`history.get` 和本步成功条件所需的事实方法。
7. 只有成功条件成立，才进入下一步。下一步必须重新预检，不得复用旧 token 或旧对象 ID。

规则事务成功时应形成一条历史并使地图 revision 增加一次；只读、拒绝、取消、陈旧 token 和完整回滚不应增加历史或 revision。若某个公开编辑器服务按契约不进入地图历史，则配方必须记录其原值和执行后值，不得把它伪装成规则事务。

### 1.3 非跨步原子性与补偿

配方不承诺跨步骤原子性。第 4 步失败时，第 1～3 步已经提交的事实仍然存在，规划器不得声称“整个配方从未发生”。

需要撤回时只允许两种方式：

- 调用明确的反向规则事务，重新读取事实、重新预检并重新授权；
- 仅当 `history.get` 证明待撤销步骤仍是历史栈顶、其后没有其它写入且用户允许时，调用 `history.undo`。

补偿本身是一条新的显式操作。不能跨过其它用户或系统写入盲目撤销，也不能把战斗伤亡、人口迁徙、名称变化等不可安全推导的结果自动恢复成猜测值。

## 二、世界创建、存档与重算

### 玩家目标

创建新地图、读取生成参数、重算明确的派生系统、保存浏览器地图并导出可恢复的数据。

### 事实与 preflight

- `generate.getOptions`：读取当前生成参数。
- `info.mapSummary`、`info.runtimeStats`：读取地图摘要和当前运行时状态。
- `history.get`：读取当前历史边界。
- `regenerationLocks.list`、`regenerationLocks.status`、`regenerationLocks.inspect`：读取并校验重生成锁。
- `info.describe`：读取 `generate.newMap`、`generate.regenerate`、`data.exportMap`、`data.saveBrowserMap` 的当前参数、确认和返回契约。

### 规则与成功条件

- `generate.newMap`、`generate.rerollSeed` 和 `generate.regenerate` 都是需要显式确认的世界级操作。
- 重生成前必须通过锁校验；成功后重新读取 `info.mapSummary`、`regenerationLocks.list` 和目标对象事实。
- `data.exportMap` 与 `data.saveBrowserMap` 成功条件是得到非空导出结果或明确保存回执；导出不得改变地图 revision。
- 重生成失败时只能依赖该操作自身的完整回滚。已经在更早配方步骤提交的编辑不属于本次重生成事务的自动补偿范围。

## 三、地形、水文与 Feature

### 玩家目标

编辑高度、海岸和水陆拓扑，创建或调整河湖，并在需要时重建下游派生。

### 事实与 preflight

- `cells.get`、`cells.neighbors`、`cells.query`：读取目标 Cell、高度、相邻关系和归属。
- `objects.get`、`objects.query`：读取 Feature、河流、湖泊、城镇、路线和其它受影响对象。
- `edit.height.inspectChanges`、`edit.height.inspectGlobalTransform`、`edit.height.inspectTerrainTemplate`、`edit.height.inspectTerrainProgram`、`edit.height.inspectRangeTransform`、`edit.height.inspectSelectionSmoothing`、`edit.height.inspectSeafloorReset`：预检对应高度动作。
- `edit.features.inspectPatch`、`edit.features.inspectTopology`：预检 Feature 局部修改与拓扑修改。
- `edit.rivers.inspectCreate`、`edit.rivers.inspectDelete`、`edit.lakes.inspectCreate`、`edit.lakes.inspectOutlet`、`edit.lakes.inspectDelete`：预检河湖生命周期。

### 规则与成功条件

- Feature 拓扑、高度重建和海底重设必须遵守各自确认要求。
- 成功后重新读取目标 Cell、Feature、河湖和路线事实；水陆 Feature、河口、湖泊出口与下游对象引用不得悬空。
- 海岸工程不能把“保护城镇、路线和河口”解释成忽略失败；若 inspector 表明保护约束无法满足，应停止并要求玩家调整范围。
- 反向高度或拓扑编辑必须重新预检。除非原操作仍在历史栈顶，否则不自动用 `history.undo` 补偿。

## 四、气候、生态与人口承载

### 玩家目标

调整纬度、温度、降水、风和洋流，重建生物群系与人口承载，并明确哪些值属于直接编辑、哪些属于派生结果。

### 事实与 preflight

- `climate.get`、`climate.getOptions`、`climate.getTemperature`、`climate.getPrecipitation`、`climate.getAtmosphere`、`climate.getBiomes`：读取气候事实。
- `oceanCurrents.inspectWorldRebuild`：预检洋流驱动的世界重建。
- `climate.inspectDownstreamRebuild`：预检气候下游重建。
- `edit.biomes.inspectAssignment`、`edit.biomes.inspectSuitability`：预检生物群系与适居度修改。
- `edit.population.inspectAdjustment`、`edit.population.inspectTransfer`：预检人口调整和迁移。

### 规则与成功条件

- `climate.applyDownstreamRebuild`、`oceanCurrents.rebuildWorld` 和 `edit.population.transfer` 需要显式确认。
- 每次气候或洋流写入后，下一步必须重新读取气候、生物群系和人口事实，不能继续使用灾变前的 Cell 集合或 revision。
- 成功条件同时包含直接字段正确和目标派生系统已按公开重建边界刷新。
- 人口不得因补偿变为负数；无法可靠恢复原分布时应暂停，而不是用总人口平均回填。

## 五、国家、省份与政治拓扑

### 玩家目标

创建、删除、合并、拆分和转移国家或省份，调整领土、首都、省会与行政结构。

### 事实与 preflight

- `objects.get`、`objects.query`：读取国家、省份、城市及其当前身份。
- `cells.query`：读取 Grid 与 Pack 归属、目标 Cell 集合和边界。
- `edit.states.inspectCreateAtCell`、`edit.states.inspectDelete`、`edit.states.inspectMerge`、`edit.states.inspectSplit`、`edit.states.inspectTerritoryTransfer`、`edit.states.inspectCapitalChange`：预检国家规则。
- `edit.provinces.inspectCreateAtCell`、`edit.provinces.inspectDelete`、`edit.provinces.inspectEnsureAssignment`、`edit.provinces.inspectTransfer`、`edit.provinces.inspectMerge`、`edit.provinces.inspectSplit`：预检省份规则。

### 规则与成功条件

- 合并、拆分、领土转移、整省转移和危险删除按公开元数据要求显式确认。
- 成功后必须重新查询国家、省份和城市，确认 Grid 与 Pack 归属一致，首都、省会、外交、军事、市场和路线引用没有指向墓碑对象。
- 合并或拆分会产生或移除对象 ID；后续步骤只能使用重新查询得到的新 ID。
- 领土补偿必须调用反向 `edit.states.inspectTerritoryTransfer` 与 `edit.states.transferTerritory`，并重新处理最后领土和省份归属规则。

## 六、城镇、人口与定居点

### 玩家目标

建立、移动、删除和重命名城镇，调整人口，并保持国家、省份、首都、省会、港口和路线关系一致。

### 事实与 preflight

- `objects.get`、`objects.query`、`cells.get`、`cells.query`：读取城镇与目标 Cell。
- `edit.cities.inspectCreateAtCell`、`edit.cities.inspectMove`、`edit.cities.inspectDelete`、`edit.cities.inspectOwnerSync`：预检创建、移动、删除和 owner 同步。
- `edit.population.inspectAdjustment`、`edit.population.inspectTransfer`：预检人口变化。

### 规则与成功条件

- 城镇创建成功后应能由 `objects.get` 读取，且国家、省份和 Cell 归属一致。
- 城镇移动后应重新读取港口、路线和行政引用；不得只检查坐标。
- 删除城镇需要按影响决定确认；若它是首都或省会，必须由领域规则处理引用，不能先删对象再补字段。
- 人口迁移失败不应留下半次扣减或增加。

## 七、文化、宗教、命名与社会归属

### 玩家目标

创建、扩张、调整父级或删除文化和宗教，并把名称库绑定与范围重命名作为可回滚规则事务。

### 事实与 preflight

- `objects.get`、`objects.query`、`cells.query`：读取文化、宗教、命名对象和 Cell 归属。
- `edit.cultures.inspectLifecycle`、`edit.cultures.inspectExpansion`：预检文化生命周期和扩张。
- `edit.religions.inspectLifecycle`、`edit.religions.inspectExpansion`：预检宗教生命周期和扩张。
- `namebases.list`、`namebases.inspectBindAndRename`、`namebases.inspectReplacement`：读取名称库并预检绑定、范围重命名和替换。

### 规则与成功条件

- 文化步骤只在明确分支调用 `edit.cultures.add`、`edit.cultures.assignCells`、`edit.cultures.applyExpansion`、`edit.cultures.setParent` 或 `edit.cultures.delete`。
- 宗教步骤只在明确分支调用 `edit.religions.add`、`edit.religions.assignCells`、`edit.religions.applyExpansion`、`edit.religions.setParent` 或 `edit.religions.delete`。
- 名称库绑定并重命名使用 `namebases.inspectBindAndRename` 与 `namebases.bindAndRename`；替换使用 `namebases.inspectReplacement` 与 `namebases.replace`。
- 成功后重新查询中心、父级、Cell 归属和命名对象；不得形成循环父级、无主 Cell 或已删除名称库绑定。

## 八、路线、区域与资源设施

### 玩家目标

创建、编辑和删除路线，维护区域与资源标记，并为经济开发提供连通性。

### 事实与 preflight

- `cells.get`、`cells.neighbors`、`cells.query`、`objects.query`：读取路线端点、路径候选和区域对象。
- 路线创建先调用 `cells.inspectAction` 检查 `routes.createPath` 的空间输入，再调用 `edit.routes.create`。
- 路线编辑使用 `edit.routes.inspectEdit` 与 `edit.routes.update`；删除使用 `edit.routes.inspectDelete` 与 `edit.routes.delete`。
- 区域创建与删除使用 `edit.zones.inspectCreate`、`edit.zones.create`、`edit.zones.inspectDelete`、`edit.zones.delete`。
- 资源重生成前调用 `info.describe` 读取 `generate.regenerate` 的当前契约，并调用 `regenerationLocks.status`、`regenerationLocks.inspect` 校验锁；执行使用 `generate.regenerate` 的 markers 子系统输入。

### 规则与成功条件

- `cells.inspectAction` 通过只表示空间输入可提交；路线执行仍须以 `edit.routes.create` 的返回和重新查询到的路线事实为成功依据。
- 资源重生成需要显式确认，且不得覆盖已锁定资源对象。
- 路线补偿使用 `edit.routes.inspectDelete` 与 `edit.routes.delete`；只有仍能精确定位本步骤新建路线时才允许执行。

## 九、市场、资源与经济链

### 玩家目标

调整市场覆盖、资源展示和经济统计，并在地图事实改变后重建经济。

### 事实与 preflight

- `objects.query`、`cells.query`：读取市场、资源、城市、路线和目标 Cell。
- `edit.economy.inspectAssignment`：预检市场区域分配。
- `info.describe`：读取 `edit.economy.rebuild` 的当前确认、参数和结果契约。

### 规则与成功条件

- 市场分配使用 `edit.economy.assignCells`，经济重建使用 `edit.economy.rebuild`，二者都需要显式确认。
- 成功后重新查询市场归属、资源供给、路线和摘要；所有统计必须基于同一批已提交地图状态。
- 市场分配补偿只能把明确记录的原 Cell 集合重新提交给 `edit.economy.inspectAssignment` 和 `edit.economy.assignCells`。

## 十、外交、战争与国家关系

### 玩家目标

设置普通关系，宣战、议和和改变宗藩关系，并保持外交、纪事、战区和军事上下文一致。

### 事实与 preflight

- `objects.get`、`objects.query`：读取双方国家、军事和关系事实。
- `edit.diplomacy.inspectRelation`、`edit.diplomacy.inspectDeclareWar`、`edit.diplomacy.inspectPeace`、`edit.diplomacy.inspectOverlordChange`：预检关系、宣战、议和和宗藩变更。

### 规则与成功条件

- 宣战、议和和宗藩变更都需要显式确认。
- 宣战成功必须形成双向 `Enemy` 和对应纪事、战区或军事上下文；议和成功必须按条款清理战争上下文。
- 宗藩关系使用唯一直接宗主、无自指、无循环的双向 `Suzerain` 与 `Vassal` 语义。
- 战争链不能把宣战、战斗、领土转移和议和合并成一次授权。

## 十一、军队、调动、战斗与发布服务

### 玩家目标

调整军团编成、状态、驻地和基地，结算明确的双边战斗，并在发布前检查应用健康、图层和导出结果。

### 军事事实与 preflight

- `objects.get`、`objects.query`、`cells.get`、`cells.neighbors`：读取国家、军团、驻地和接触范围。
- `edit.military.inspectRatios`、`edit.military.inspectStatus`、`edit.military.inspectMoveStation`、`edit.military.inspectBase`、`edit.military.inspectBattle`：预检军事动作。
- 战斗执行使用 `edit.military.resolveBattle`；旧 `edit.military.recordBattleEvent` 仍是记录普通战报的兼容原语，不等价于真实战斗结算。

### 军事成功条件

- 战斗每次只结算输入中明确的两个军团。
- 成功后双方伤亡不为负，败退只写撤退命令而不瞬移，双方和全局战报各有一条一致事件。
- 战斗不得隐含改变人口、领土、外交或世界时间；占领必须由后续领土事务单独预检和授权。

### 发布事实与公开服务

- `debug.health`、`info.healthEvents`、`info.runtimeStats`、`info.mapSummary`：检查应用健康和地图摘要。
- `layers.get`、`layers.listThemes`：读取当前图层和主题。
- `layers.setViewMode`、`layers.setVisible`、`layers.setTheme`：按玩家明确选择整理发布视图。
- `data.exportMap`、`data.exportPNG`：导出数据与图片。
- `info.capabilities`、`info.describe`：生成机器能力说明和所用方法契约清单。
- `planner.listRecipes`、`planner.getRecipe`：读取已发布配方目录和单个完整配方契约。

发布成功要求 health、WebGL、console error 和 page error 为零，数据与 PNG 导出结果非空。只读与导出不得增加地图 revision；图层或主题改变应记录原值，并使用对应公开方法显式恢复。

## 十二、AI 规划器玩法配方

### 12.1 殖民或开拓区域（`scenario.colonize-region`）

目标是取得明确领土，补齐省份归属，建立城镇和路线，并把新区域接入市场。步骤彼此独立，不构成一次殖民总事务。

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `transfer-territory` / `politics.transfer-territory` | 用 `objects.get`、`cells.query` 读取双方国家和目标 Cell；调用 `edit.states.inspectTerritoryTransfer` | 需要本步确认；调用 `edit.states.transferTerritory` | Cell、国家存亡、省份和城市引用满足 inspector 预测 | 反向调用同一 inspector 与执行方法；执行后读取 `info.runtimeStats`、`history.get`、`cells.query` |
| `ensure-province-assignment` / `politics.ensure-province-assignment` | 重新读取新 owner 和目标 Cell；调用 `edit.provinces.inspectEnsureAssignment` | 按 inspector 的 `requiresConfirm` 授权；调用 `edit.provinces.ensureAssignment` | 每个目标陆地 Cell 都有合法省份归属 | 若无安全反向规则则不自动补偿；重读省份 ID 和 revision |
| `found-city` / `settlement.found-city` | 用 `cells.get`、`objects.query` 检查目标 Cell 和附近城市；调用 `edit.cities.inspectCreateAtCell` | 按 inspector 授权；调用 `edit.cities.createAtCell` | 新城市可由 `objects.get` 读取，owner 与省份正确 | 精确定位新城市后调用 `edit.cities.inspectDelete`、`edit.cities.delete`；重读 revision |
| `create-route` / `infrastructure.create-route` | 用 `cells.inspectAction` 检查 `routes.createPath` 输入，并重读两端城市 | 按检查结果提交 `edit.routes.create` | 新路线存在且连接预期端点 | 调用 `edit.routes.inspectDelete`、`edit.routes.delete`；重读路线与 revision |
| `assign-market-region` / `economy.assign-market-region` | 用 `objects.query`、`cells.query` 读取市场和新区域；调用 `edit.economy.inspectAssignment` | 需要本步确认；调用 `edit.economy.assignCells` | 新区域归属目标市场，摘要与市场事实一致 | 保存原市场 Cell 集合并以同一 inspector 和执行方法反向提交；重读 revision |

### 12.2 入侵、占领与吞并国家（`scenario.invasion-and-annexation`）

战争配方严格区分宣战、调军、战斗、领土和议和。战斗胜利不是领土转移授权。

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `declare-war` / `diplomacy.declare-war` | `objects.get` 读取双方国家；调用 `edit.diplomacy.inspectDeclareWar` | 需要确认；调用 `edit.diplomacy.declareWar` | 双向 `Enemy`，战争纪事和上下文存在 | 只能另行预检 `edit.diplomacy.inspectPeace` 并调用 `edit.diplomacy.makePeace`；重读 revision |
| `move-station` / `military.move-station` | 重读军团、目标 Cell 和接触范围；调用 `edit.military.inspectMoveStation` | 按 inspector 授权；调用 `edit.military.moveStation` | 军团驻地和命令与目标一致 | 重新预检移动回原驻地；重读军团与 revision |
| `resolve-battle` / `military.resolve-battle` | 重读双方军团、兵力、战争关系和 Warzone；调用 `edit.military.inspectBattle` | 需要确认；调用 `edit.military.resolveBattle` | 双方伤亡、状态和战报一致，领土与外交未改变 | 不自动逆算伤亡；仅在该战斗仍为历史栈顶时可经授权调用 `history.undo`；重读 revision |
| `transfer-territory` / `politics.transfer-territory` | 按战后事实重新读取目标 Cell；调用 `edit.states.inspectTerritoryTransfer` | 需要独立确认；调用 `edit.states.transferTerritory` | 只有本步改变领土，政治拓扑保持完整 | 反向领土事务；重读国家、省份、城市和 revision |
| `make-peace` / `diplomacy.make-peace` | 重新读取双方国家和战争上下文；调用 `edit.diplomacy.inspectPeace` | 需要确认；调用 `edit.diplomacy.makePeace` | 和平关系及条款成立，战争上下文按规则清理 | 不自动重新宣战；若玩家要求，重新调用宣战 inspector；重读 revision |

### 12.3 行政区划改革（`scenario.administrative-reform`）

行政改革中的对象 ID 会在合并、拆分和重生成后变化。每一步必须用最新对象事实重新绑定后续输入。

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `transfer-province` / `politics.transfer-province` | 读取省份、两国与 Cells；调用 `edit.provinces.inspectTransfer` | 需要确认；调用 `edit.provinces.transfer` | 整省归属与内部 Cells、城市一致 | 反向调用同一规则；重读省份 ID 和 revision |
| `merge-provinces` / `politics.merge-provinces` | 重新查询待合并省份；调用 `edit.provinces.inspectMerge` | 需要确认；调用 `edit.provinces.merge` | 来源省份退出活动集合，目标省份和引用完整 | 不猜测拆分；优先在仍为栈顶时显式授权 `history.undo`；重读新 ID |
| `split-province` / `politics.split-province` | 使用最新省份 ID 与 Cell 集合调用 `edit.provinces.inspectSplit` | 需要确认；调用 `edit.provinces.split` | 新省份存在，Cells、省会和引用合法 | 不自动合并未知后续变化；必要时重新预检合并或授权栈顶撤销 |
| `reorganize-provinces` / `politics.reorganize-provinces` | 调用 `info.describe` 读取 `generate.regenerate` 契约，调用 `regenerationLocks.status`、`regenerationLocks.inspect` 校验锁 | 需要确认；调用 `generate.regenerate` 的 provinces 子系统输入 | 省份重生成完成且锁对象保持一致 | 依赖本次操作自身回滚；成功后重新查询全部相关省份和 revision |
| `bind-namebase-and-rename` / `society.bind-namebase-and-rename` | `namebases.list` 与 `objects.query` 读取名称库和目标对象；调用 `namebases.inspectBindAndRename` | 按 inspector 授权；调用 `namebases.bindAndRename` | 绑定与范围内名称同时完成，没有旧绑定残留 | 保存旧绑定和旧名称；用新的预检显式恢复，或在栈顶授权撤销；重读 revision |

### 12.4 人口迁徙与新城建设（`scenario.population-resettlement`）

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `transfer-population` / `society.transfer-population` | 读取源、目标和人口；调用 `edit.population.inspectTransfer` | 需要确认；调用 `edit.population.transfer` | 源与目标变化符合预检，总量和非负约束成立 | 只有人口事实未再变化时才反向预检迁移；重读 revision |
| `found-city` / `settlement.found-city` | 调用 `edit.cities.inspectCreateAtCell` | 按 inspector 授权；调用 `edit.cities.createAtCell` | 新城 owner、省份和人口上下文正确 | 精确删除新城或栈顶撤销；重读城市和 revision |
| `move-city` / `settlement.move-city` | 使用最新城市 ID 调用 `edit.cities.inspectMove` | 按 inspector 授权；调用 `edit.cities.move` | 坐标、Cell、港口和路线引用一致 | 重新预检移回原 Cell；重读 revision |
| `assign-market-region` / `economy.assign-market-region` | 调用 `edit.economy.inspectAssignment` | 需要确认；调用 `edit.economy.assignCells` | 新城及周边归属目标市场 | 以保存的旧 Cell 集合反向提交；重读 revision |
| `create-route` / `infrastructure.create-route` | 调用 `cells.inspectAction` 检查 `routes.createPath` 输入 | 调用 `edit.routes.create` | 路线连接预期城市且无悬空端点 | `edit.routes.inspectDelete` 后调用 `edit.routes.delete`；重读 revision |

### 12.5 文化或宗教传播与同化（`scenario.cultural-assimilation`）

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `culture-lifecycle` / `society.culture.lifecycle` | 用 `objects.query`、`cells.query` 读取文化；生命周期调用 `edit.cultures.inspectLifecycle`，扩张调用 `edit.cultures.inspectExpansion` | 根据明确分支调用 `edit.cultures.add`、`edit.cultures.assignCells`、`edit.cultures.applyExpansion`、`edit.cultures.setParent` 或 `edit.cultures.delete`；删除按要求确认 | 中心、父级和 Cell 归属合法且无循环 | 仅使用保存的旧父级和 Cell 集合显式反向编辑；重读 revision |
| `religion-lifecycle` / `society.religion.lifecycle` | 生命周期调用 `edit.religions.inspectLifecycle`，扩张调用 `edit.religions.inspectExpansion` | 根据明确分支调用 `edit.religions.add`、`edit.religions.assignCells`、`edit.religions.applyExpansion`、`edit.religions.setParent` 或 `edit.religions.delete`；删除按要求确认 | 中心、父级和 Cell 归属合法且无循环 | 仅使用保存事实显式反向编辑；重读 revision |
| `bind-namebase-and-rename` / `society.bind-namebase-and-rename` | 调用 `namebases.inspectBindAndRename` | 调用 `namebases.bindAndRename` | 指定范围绑定与名称一致 | 显式恢复旧绑定和名称或授权栈顶撤销；重读 revision |

### 12.6 区域基础设施与经济开发（`scenario.infrastructure-development`）

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `create-route` / `infrastructure.create-route` | `cells.inspectAction` 检查 `routes.createPath` 输入 | 调用 `edit.routes.create` | 路线存在且端点、路径有效 | `edit.routes.inspectDelete` 后调用 `edit.routes.delete`；重读 revision |
| `assign-market-region` / `economy.assign-market-region` | 调用 `edit.economy.inspectAssignment` | 需要确认；调用 `edit.economy.assignCells` | 市场覆盖符合目标 | 保存旧覆盖并反向提交；重读 revision |
| `regenerate-resources` / `infrastructure.regenerate-resources` | `info.describe` 读取 `generate.regenerate` 契约，`regenerationLocks.status`、`regenerationLocks.inspect` 校验锁 | 需要确认；调用 `generate.regenerate` 的 markers 子系统输入 | 资源标记已更新且锁对象未改变 | 依赖事务自身回滚；成功结果不自动逆生成 |
| `rebuild-economy` / `economy.rebuild` | 重新查询路线、市场和资源；`info.describe` 读取 `edit.economy.rebuild` 契约 | 需要确认；调用 `edit.economy.rebuild` | 经济摘要与当前路线、市场和资源一致 | 依赖事务自身回滚；重读经济事实和 revision |

### 12.7 海岸、海峡与湖海工程（`scenario.coastline-engineering`）

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `patch-feature` / `terrain.patch-feature` | 读取目标 Feature 与保护对象；调用 `edit.features.inspectPatch` | 按 inspector 授权；调用 `edit.features.applyPatch` | 局部 Feature 修改成立且保护对象未丢失 | 用保存的原 patch 重新预检恢复；重读 revision |
| `change-feature-topology` / `terrain.change-feature-topology` | 基于最新 Feature 调用 `edit.features.inspectTopology` | 需要确认；调用 `edit.features.applyTopology` | 水陆连通、Feature 身份和引用一致 | 仅在反向拓扑可预检时显式补偿；否则暂停 |
| `change-lake-outlet` / `hydrology.change-lake-outlet` | 重读湖泊、河流和出口；调用 `edit.lakes.inspectOutlet` | 按 inspector 授权；调用 `edit.lakes.setOutlet` | 出口、下游河流和湖泊事实一致 | 以原出口重新预检并设置；重读 revision |
| `regenerate-system` / `world.regenerate-system` | `info.describe` 读取 `generate.regenerate` 契约并校验锁 | 需要确认；调用 `generate.regenerate` 的明确下游子系统输入 | 目标下游系统完成重建，城镇、路线和河口仍可解析 | 依赖当前事务回滚，不回滚前三个已提交步骤；重读 revision |

### 12.8 气候灾变及世界响应（`scenario.climate-disaster`）

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `apply-climate-and-rebuild` / `world.apply-climate-and-rebuild` | 读取气候事实；调用 `climate.inspectDownstreamRebuild` | 需要确认时调用 `climate.applyDownstreamRebuild`；仅直接参数提交时调用 `climate.apply` | 气候直接值与所选下游重建边界一致 | 保存原气候参数并重新预检恢复；重读 revision |
| `rebuild-from-ocean-currents` / `world.rebuild-from-ocean-currents` | 调用 `oceanCurrents.inspectWorldRebuild` | 需要确认；调用 `oceanCurrents.rebuildWorld`；仅重生成洋流时调用 `oceanCurrents.regenerate` | 洋流和目标世界派生一致 | 可取消未提交的重建；已成功重建不自动回滚前序气候步骤 |
| `adjust-population` / `society.adjust-population` | 使用灾变后的 Cells 调用 `edit.population.inspectAdjustment` | 按 inspector 授权；调用 `edit.population.applyAdjustment` | 人口非负且摘要与 Cells 一致 | 只有保存了精确原值时才显式反向调整；重读 revision |
| `regenerate-system` / `world.regenerate-system` | 重新读取当前世界并通过 `info.describe` 核对 `generate.regenerate` | 需要确认；调用 `generate.regenerate` 的明确目标子系统输入 | 目标系统基于灾变后的最新 revision 完成 | 依赖本步事务回滚；不撤销前三步 |

### 12.9 国家改制与迁都（`scenario.state-reformation`）

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `change-government` / `politics.change-government` | `objects.get` 读取国家；`info.describe` 读取 `edit.states.setGovernment` 或 `edit.states.setGovernmentBatch` 契约 | 调用 `edit.states.setGovernment` 或对明确国家集合调用 `edit.states.setGovernmentBatch` | 政体、国号和相关显示事实一致 | 保存原政体并显式恢复；重读国家和 revision |
| `relocate-capital` / `politics.relocate-capital` | 重读国家和候选城市；调用 `edit.states.inspectCapitalChange` | 按 inspector 授权；调用 `edit.states.setCapital` | 首都指向本国合法城市，旧首都引用已更新 | 用原首都重新预检；重读 revision |
| `reorganize-provinces` / `politics.reorganize-provinces` | `info.describe` 读取 `generate.regenerate`，`regenerationLocks.status`、`regenerationLocks.inspect` 校验锁 | 需要确认；调用 `generate.regenerate` 的 provinces 子系统输入 | 新行政区与当前国家、首都事实一致 | 依赖本步事务回滚；成功后重新取得省份 ID |
| `bind-namebase-and-rename` / `society.bind-namebase-and-rename` | 调用 `namebases.inspectBindAndRename` | 调用 `namebases.bindAndRename` | 新国号和目标范围命名遵循绑定 | 保存旧绑定和名称后显式恢复；重读 revision |

### 12.10 检查、整理并发布地图（`scenario.publish-map`）

发布配方由公开事实和编辑器服务组成，不使用虚构的“发布总接口”。

| 步骤 | 事实与 preflight | 授权与执行 | 成功条件 | 补偿与 revision 重读 |
|---|---|---|---|---|
| `health-check` / 无规则 actionId（事实步骤） | 调用 `info.healthEvents`、`info.runtimeStats`、`info.mapSummary` | 只读，无写入授权 | application health、WebGL、console error、page error 均为零 | 无补偿；确认 history 和 revision 不变 |
| `layers-and-themes` / 无规则 actionId（编辑器服务步骤） | 调用 `layers.get`、`layers.listThemes` 保存当前视图 | 按玩家选择调用 `layers.setViewMode`、`layers.setVisible`、`layers.setTheme` | 当前图层、视图模式和主题等于发布选择 | 用相同公开方法恢复原值；重读 `layers.get`，不得声称地图规则被回滚 |
| `data-export` / 无规则 actionId（导出服务步骤） | 调用 `info.describe` 读取 `data.exportMap`、`data.exportPNG` 契约，并用 `info.mapSummary` 保存导出前摘要 | 调用 `data.exportMap` 与 `data.exportPNG` | 两种导出结果非空，导出前后地图摘要与 revision 不变 | 无地图补偿；导出失败只报告失败，不撤销已明确选择的视图 |
| `gameplay-documentation` / 无规则 actionId（事实步骤） | 调用 `planner.listRecipes`、`planner.getRecipe`、`info.capabilities`，并对本次使用的方法调用 `info.describe` | 只读，无写入授权 | 产出包含配方目录、完整配方、API 版本、能力目录、方法契约和配方执行 ledger 的说明 | 无补偿；history 和 revision 保持不变 |

### 12.11 配方执行 ledger

每次执行配方都应保留可读 ledger，至少记录：

- `recipeId`、稳定 `stepId` 和步骤序号；
- 执行前事实摘要与 revision；
- inspector 名称、稳定 `code`、`inspectionToken` 前缀和 `expectedRevision`；
- 是否需要授权、授权是否取得；
- 执行方法和执行回执；
- 执行后 revision、历史变化和成功条件事实；
- 停止、重规划或补偿原因；
- 补偿所使用的新 inspector、授权和 revision。

ledger 是审计记录，不是跨步事务日志。它不能提供绕过 inspector、重放过期 token 或一次性回滚整个配方的能力。

<!-- PLANNER_RECIPE_MACHINE_SYNC:START -->
## 十三、机器同步附录

> 本附录由 `tools/webgl-generator-planner-recipe-doc-sync.mjs` 从运行时 canonical registry 生成。手工修改会被 `--check` 判为陈旧；人类说明与机器目录必须同时审阅。

- canonical registry SHA-256：`3d156e35c9d98f61989500e1544702ce9248add5dc04cd037478c344f623b45b`
- 配方 / 顶层步骤：`10 / 43`

| recipeId | stepId | actionId | kind | facts | inspection | execute | spatialAction | compensation | revision | success |
|---|---|---|---|---|---|---|---|---|---|---|
| `scenario.colonize-region` | `transfer-territory` | `politics.transfer-territory` | `rule` | `objects.get<br>cells.get` | `edit.states.inspectTerritoryTransfer` | `edit.states.transferTerritory` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 transfer-territory、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标 Cell 的国家与省份归属一致，相关城市和政治引用没有悬空。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.colonize-region` | `ensure-province-assignment` | `politics.ensure-province-assignment` | `rule` | `objects.get<br>cells.get` | `edit.provinces.inspectEnsureAssignment` | `edit.provinces.ensureAssignment` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 ensure-province-assignment、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标陆地 Cell 均属于有效省份，省份国家归属与 Cell 国家归属一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.colonize-region` | `found-city` | `settlement.found-city` | `rule` | `cells.get<br>objects.list` | `edit.cities.inspectCreateAtCell` | `edit.cities.createAtCell` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 found-city、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `新城市可按稳定引用读取，所属国家、省份和 Cell 与请求一致。<br>通过 cells.get 重读并验证上述领域结果。` |
| `scenario.colonize-region` | `create-route` | `infrastructure.create-route` | `rule` | `cells.get<br>cells.neighbors` | `cells.inspectAction` | `edit.routes.create` | `routes.createPath` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 create-route、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `新路线存在并连接预期端点，路径 Cell 连续且没有悬空引用。<br>通过 cells.get 重读并验证上述领域结果。` |
| `scenario.colonize-region` | `assign-market-region` | `economy.assign-market-region` | `rule` | `objects.get<br>cells.query` | `edit.economy.inspectAssignment` | `edit.economy.assignCells` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 assign-market-region、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标 Cell 全部归入指定市场，市场覆盖与经济摘要一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.invasion-and-annexation` | `declare-war` | `diplomacy.declare-war` | `rule` | `objects.get` | `edit.diplomacy.inspectDeclareWar` | `edit.diplomacy.declareWar` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 declare-war、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `双方关系均为 Enemy，战争纪事、战区和军事上下文可解析。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.invasion-and-annexation` | `move-station` | `military.move-station` | `rule` | `objects.get<br>cells.get` | `edit.military.inspectMoveStation` | `edit.military.moveStation` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 move-station、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标军团驻地 Cell 与移动命令一致，兵力和身份未被意外改写。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.invasion-and-annexation` | `resolve-battle` | `military.resolve-battle` | `rule` | `objects.get<br>cells.neighbors` | `edit.military.inspectBattle` | `edit.military.resolveBattle` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 resolve-battle、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `双方兵力非负、伤亡与态势符合结果，并在全局及双方军团中记录同一战报。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.invasion-and-annexation` | `transfer-territory` | `politics.transfer-territory` | `rule` | `objects.get<br>cells.get` | `edit.states.inspectTerritoryTransfer` | `edit.states.transferTerritory` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 transfer-territory、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标 Cell 的国家与省份归属一致，相关城市和政治引用没有悬空。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.invasion-and-annexation` | `make-peace` | `diplomacy.make-peace` | `rule` | `objects.get` | `edit.diplomacy.inspectPeace` | `edit.diplomacy.makePeace` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 make-peace、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `双方关系符合和平条款，战争活动、战区与战线按规则清理。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.administrative-reform` | `transfer-province` | `politics.transfer-province` | `rule` | `objects.get` | `edit.provinces.inspectTransfer` | `edit.provinces.transfer` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 transfer-province、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `整省、内部 Cell、城市和省会均归入目标国家且引用一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.administrative-reform` | `merge-provinces` | `politics.merge-provinces` | `rule` | `objects.get<br>cells.neighbors` | `edit.provinces.inspectMerge` | `edit.provinces.merge` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 merge-provinces、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `来源省份退出活动集合，保留省份非空连通且省会与城市引用有效。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.administrative-reform` | `split-province` | `politics.split-province` | `rule` | `objects.get<br>cells.query` | `edit.provinces.inspectSplit` | `edit.provinces.split` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 split-province、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `新旧省份均非空连通，各自省会、城市和 Cell 归属有效。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.administrative-reform` | `reorganize-provinces` | `politics.reorganize-provinces` | `rule` | `info.mapSummary<br>objects.list` | `info.describe` | `generate.regenerate` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 reorganize-provinces、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `省份重生成完成，锁定对象未被覆盖，国家、省份与城市引用一致。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.administrative-reform` | `bind-namebase-and-rename` | `society.bind-namebase-and-rename` | `rule` | `namebases.list<br>objects.list` | `namebases.inspectBindAndRename` | `namebases.bindAndRename` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 bind-namebase-and-rename、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `名称库绑定与目标范围名称同时更新，不存在已删除或旧名称库残留引用。<br>通过 namebases.list 重读并验证上述领域结果。` |
| `scenario.population-resettlement` | `transfer-population` | `society.transfer-population` | `rule` | `objects.get` | `edit.population.inspectTransfer` | `edit.population.transfer` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 transfer-population、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `迁出与迁入人口均非负，城乡分量与总人口守恒。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.population-resettlement` | `found-city` | `settlement.found-city` | `rule` | `cells.get<br>objects.list` | `edit.cities.inspectCreateAtCell` | `edit.cities.createAtCell` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 found-city、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `新城市可按稳定引用读取，所属国家、省份和 Cell 与请求一致。<br>通过 cells.get 重读并验证上述领域结果。` |
| `scenario.population-resettlement` | `move-city` | `settlement.move-city` | `rule` | `objects.get<br>cells.get` | `edit.cities.inspectMove` | `edit.cities.move` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 move-city、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `城市目标 Cell、坐标、国家、省份、港口与路线引用保持一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.population-resettlement` | `assign-market-region` | `economy.assign-market-region` | `rule` | `objects.get<br>cells.query` | `edit.economy.inspectAssignment` | `edit.economy.assignCells` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 assign-market-region、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标 Cell 全部归入指定市场，市场覆盖与经济摘要一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.population-resettlement` | `create-route` | `infrastructure.create-route` | `rule` | `cells.get<br>cells.neighbors` | `cells.inspectAction` | `edit.routes.create` | `routes.createPath` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 create-route、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `新路线存在并连接预期端点，路径 Cell 连续且没有悬空引用。<br>通过 cells.get 重读并验证上述领域结果。` |
| `scenario.cultural-assimilation` | `culture-lifecycle` | `society.culture.lifecycle` | `rule` | `objects.get<br>cells.query` | `edit.cultures.inspectLifecycle<br>edit.cultures.inspectExpansion` | `edit.cultures.add<br>edit.cultures.assignCells<br>edit.cultures.applyExpansion<br>edit.cultures.setParent<br>edit.cultures.delete` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 culture-lifecycle、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `文化中心、父级和 Cell 归属有效，不形成父级循环或无主引用。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.cultural-assimilation` | `religion-lifecycle` | `society.religion.lifecycle` | `rule` | `objects.get<br>cells.query` | `edit.religions.inspectLifecycle<br>edit.religions.inspectExpansion` | `edit.religions.add<br>edit.religions.assignCells<br>edit.religions.applyExpansion<br>edit.religions.setParent<br>edit.religions.delete` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 religion-lifecycle、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `宗教中心、父级和 Cell 归属有效，不形成父级循环或无主引用。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.cultural-assimilation` | `bind-namebase-and-rename` | `society.bind-namebase-and-rename` | `rule` | `namebases.list<br>objects.list` | `namebases.inspectBindAndRename` | `namebases.bindAndRename` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 bind-namebase-and-rename、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `名称库绑定与目标范围名称同时更新，不存在已删除或旧名称库残留引用。<br>通过 namebases.list 重读并验证上述领域结果。` |
| `scenario.infrastructure-development` | `create-route` | `infrastructure.create-route` | `rule` | `cells.get<br>cells.neighbors` | `cells.inspectAction` | `edit.routes.create` | `routes.createPath` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 create-route、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `新路线存在并连接预期端点，路径 Cell 连续且没有悬空引用。<br>通过 cells.get 重读并验证上述领域结果。` |
| `scenario.infrastructure-development` | `assign-market-region` | `economy.assign-market-region` | `rule` | `objects.get<br>cells.query` | `edit.economy.inspectAssignment` | `edit.economy.assignCells` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 assign-market-region、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标 Cell 全部归入指定市场，市场覆盖与经济摘要一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.infrastructure-development` | `regenerate-resources` | `infrastructure.regenerate-resources` | `rule` | `info.mapSummary<br>objects.list` | `info.describe` | `generate.regenerate` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 regenerate-resources、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `资源标记完成重生成，锁定资源保持不变且所有对象引用有效。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.infrastructure-development` | `rebuild-economy` | `economy.rebuild` | `rule` | `info.mapSummary<br>objects.list` | `info.describe` | `edit.economy.rebuild` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 rebuild-economy、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `市场、资源、路线和城市对应的经济摘要来自同一最新地图状态。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.coastline-engineering` | `patch-feature` | `terrain.patch-feature` | `rule` | `objects.get<br>cells.get` | `edit.features.inspectPatch` | `edit.features.applyPatch` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 patch-feature、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `Feature 补丁生效且受保护的城镇、路线、河口与水陆引用仍可解析。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.coastline-engineering` | `change-feature-topology` | `terrain.change-feature-topology` | `rule` | `objects.get<br>cells.query` | `edit.features.inspectTopology` | `edit.features.applyTopology` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 change-feature-topology、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `水陆连通性、Feature 身份及相关城镇、路线和河口引用保持一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.coastline-engineering` | `change-lake-outlet` | `hydrology.change-lake-outlet` | `rule` | `objects.get<br>cells.get` | `edit.lakes.inspectOutlet` | `edit.lakes.setOutlet` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 change-lake-outlet、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `湖泊出口、下游河流与相关水文引用一致且没有无效 Cell。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.coastline-engineering` | `regenerate-system` | `world.regenerate-system` | `rule` | `info.mapSummary` | `info.describe` | `generate.regenerate` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 regenerate-system、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `指定派生系统基于当前 revision 完成重建，范围外与锁定对象保持不变。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.climate-disaster` | `apply-climate-and-rebuild` | `world.apply-climate-and-rebuild` | `rule` | `climate.get<br>info.mapSummary` | `info.describe<br>climate.inspectDownstreamRebuild` | `climate.apply<br>climate.applyDownstreamRebuild` | `—` | `none<br><br>气候参数写入不进入地图历史；若下游重算失败，保留已提交气候并要求显式重规划。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `气候直接值与选定下游系统一致，生态与人口派生均来自灾变后的事实。<br>通过 climate.get 重读并验证上述领域结果。` |
| `scenario.climate-disaster` | `rebuild-from-ocean-currents` | `world.rebuild-from-ocean-currents` | `rule` | `oceanCurrents.inspectWorldRebuild<br>info.mapSummary` | `oceanCurrents.inspectWorldRebuild` | `oceanCurrents.regenerate<br>oceanCurrents.rebuildWorld` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 rebuild-from-ocean-currents、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `洋流与选定世界派生完成一致重建，地图 identity 保持不变。<br>通过 oceanCurrents.inspectWorldRebuild 重读并验证上述领域结果。` |
| `scenario.climate-disaster` | `adjust-population` | `society.adjust-population` | `rule` | `objects.get` | `edit.population.inspectAdjustment` | `edit.population.applyAdjustment` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 adjust-population、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `目标人口调整符合请求，城乡分量与总量均保持非负。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.climate-disaster` | `regenerate-system` | `world.regenerate-system` | `rule` | `info.mapSummary` | `info.describe` | `generate.regenerate` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 regenerate-system、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `指定派生系统基于当前 revision 完成重建，范围外与锁定对象保持不变。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.state-reformation` | `change-government` | `politics.change-government` | `rule` | `objects.get` | `info.describe` | `edit.states.setGovernment<br>edit.states.setGovernmentBatch` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 change-government、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `政体、完整国号和相关显示事实与目标国家集合一致。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.state-reformation` | `relocate-capital` | `politics.relocate-capital` | `rule` | `objects.get` | `edit.states.inspectCapitalChange` | `edit.states.setCapital` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 relocate-capital、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `首都指向本国有效城市，国家中心及旧新首都引用同步更新。<br>通过 objects.get 重读并验证上述领域结果。` |
| `scenario.state-reformation` | `reorganize-provinces` | `politics.reorganize-provinces` | `rule` | `info.mapSummary<br>objects.list` | `info.describe` | `generate.regenerate` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 reorganize-provinces、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `省份重生成完成，锁定对象未被覆盖，国家、省份与城市引用一致。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.state-reformation` | `bind-namebase-and-rename` | `society.bind-namebase-and-rename` | `rule` | `namebases.list<br>objects.list` | `namebases.inspectBindAndRename` | `namebases.bindAndRename` | `—` | `history-undo<br>history.undo<br>仅当执行 ledger 的 stepId 精确等于 bind-namebase-and-rename、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `名称库绑定与目标范围名称同时更新，不存在已删除或旧名称库残留引用。<br>通过 namebases.list 重读并验证上述领域结果。` |
| `scenario.publish-map` | `health-check` | `—` | `fact` | `info.mapSummary<br>info.runtimeStats<br>info.healthEvents` | `info.describe` | `info.mapSummary<br>info.runtimeStats<br>info.healthEvents` | `—` | `none<br><br>只读或导出步骤没有地图写入，不调用补偿方法。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `应用 health、WebGL、console error 与 page error 均为零，地图摘要可读取。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.publish-map` | `layers-and-themes` | `—` | `service` | `layers.get<br>layers.listThemes` | `info.describe` | `layers.setViewMode<br>layers.setVisible<br>layers.setTheme` | `—` | `restore-display-preferences<br><br>layers.setViewMode<br>layers.setVisible<br>layers.setTheme<br>仅当执行 ledger 的 stepId 精确等于 layers-and-themes、当前 revision 精确等于 ledger.afterRevision，并且本步骤 facts 已保存原显示值时恢复；地图 identity 变化或缺少原值时禁止自动恢复。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `视图模式、图层可见性和主题与发布目标一致。<br>这些调用只修改显示偏好，不增加 map revision 或地图编辑历史。<br>通过 layers.get 重读并验证上述领域结果。` |
| `scenario.publish-map` | `data-export` | `—` | `service` | `info.mapSummary` | `info.describe` | `data.exportMap<br>data.exportPNG` | `—` | `none<br><br>只读或导出步骤没有地图写入，不调用补偿方法。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `地图数据与 PNG 导出结果均非空，导出前后地图摘要和 revision 不变。<br>通过 info.mapSummary 重读并验证上述领域结果。` |
| `scenario.publish-map` | `gameplay-documentation` | `—` | `fact` | `info.capabilities<br>planner.listRecipes<br>planner.getRecipe` | `info.describe` | `info.capabilities<br>planner.listRecipes<br>planner.getRecipe` | `—` | `none<br><br>只读或导出步骤没有地图写入，不调用补偿方法。` | `before-facts<br>after-inspection<br>before-execution<br>after-each-commit` | `能力、方法描述、十个配方和四十三个步骤均可读取并与当前 API 版本一致。<br>通过 info.capabilities 重读并验证上述领域结果。` |
<!-- PLANNER_RECIPE_MACHINE_SYNC:END -->
