# 全游戏复合语义接口、规则动作与玩法配方审计

> 本报告对应权威任务第 204 项及第 207～210 项闭环结果，持续校验规则事务、AI 规划器配方与公开 API 的当前实现状态。

## 审计结论

- 上游能力矩阵：1195 行，unknown / unclassified / gap = 0 / 0 / 0。
- 公开 API：316 / 316 已归类。
- Cell / 画布动作：48 / 48 已归类；画布模式 29，直接操控 19 类 / 89 个宿主。
- 规则事务与玩法配方：69 + 10 = 79。
- 已有完整事务 69，已有写命令但缺 AI inspector 0，多 API 碎片待收敛 0，缺失游戏规则 0，待发布配方 0，可执行配方 10。
- 结构缺口：0。

## 边界定义

- **规则事务**：一个玩家意图，但执行时需要跨对象/系统、条件分支、业务预检或原子回滚；应由单一规则事务表达。
- **原子原语**：只修改一个稳定字段或纯编辑器显示偏好，可保留为原子 API，不强行包装成复合动作。
- **规划器配方**：由多个可独立提交的规则动作组成的战略目标；交给 AI 规划器编排，不合并成超大事务 API。
- **排除项**：面板几何、焦点、列宽、原生文件选择器和调试故障注入不属于游戏规则。

不能把所有自然语言目标都做成一个巨型接口。API 体系固定为三层：只读事实与原子原语 → 可预检、可回滚的规则事务 → AI 规划器组合的玩法配方。

## 规则事务总表

| actionId | 领域 | 玩家意图 | 当前状态 | 当前 API | 规范 inspect / execute |
|---|---|---|---|---|---|
| `world.create` | 世界创建、存档与重算 | 从生成选项创建一张新地图，或换种子重建整张地图。 | `existing-transaction` | `generate.getOptions`<br>`generate.newMap`<br>`generate.rerollSeed`<br>`generate.setOptions` | `generate.getOptions`<br>`generate.newMap / generate.rerollSeed` |
| `world.regenerate-system` | 世界创建、存档与重算 | 只重建指定系统，同时维护依赖、范围外对象和单条历史。 | `existing-transaction` | `generate.regenerate` | `info.describe(generate.regenerate)`<br>`generate.regenerate` |
| `world.import-map` | 世界创建、存档与重算 | 导入 JSON、gzip 或浏览器信封中的地图，完成迁移、校验和原子换图。 | `existing-transaction` | `data.importMap` | `data.exportImportDiagnostic`<br>`data.importMap` |
| `world.import-geo` | 世界创建、存档与重算 | 以 GEO 中的数据为准重建地图，清除 GEO 未包含的旧残留。 | `existing-transaction` | `data.importGEO` | `data.exportImportDiagnostic`<br>`data.importGEO` |
| `world.import-heightmap` | 世界创建、存档与重算 | 把图片高度转换为地图高度，并在一条换图事务中重建下游世界。 | `existing-transaction` | `data.importHeightmap` | `planned:edit.height.inspectHeightmapImport`<br>`data.importHeightmap` |
| `world.restore-browser-map` | 世界创建、存档与重算 | 从浏览器缓存恢复地图，同时处理旧版本、损坏数据和运行时重建。 | `existing-transaction` | `data.restoreBrowserMap` | `data.exportImportDiagnostic`<br>`data.restoreBrowserMap` |
| `world.apply-climate-and-rebuild` | 气候、生态与人口承载 | 调整纬度、温度、降水或风带，并明确是否重算生态与社会系统。 | `existing-transaction` | `climate.apply`<br>`climate.applyDownstreamRebuild`<br>`climate.inspectDownstreamRebuild`<br>`climate.setLatitude`<br>`climate.setLatitudeRange`<br>`climate.setLongitudeRange`<br>`climate.setPrecipitation`<br>`climate.setTemperature`<br>`climate.setWind` | `climate.inspectDownstreamRebuild`<br>`climate.apply / climate.applyDownstreamRebuild` |
| `world.rebuild-from-ocean-currents` | 气候、生态与人口承载 | 重生成洋流，选择仅更新洋流或继续重算气候、河流、生态与社会。 | `existing-transaction` | `oceanCurrents.cancelWorldRebuild`<br>`oceanCurrents.inspectWorldRebuild`<br>`oceanCurrents.rebuildWorld`<br>`oceanCurrents.regenerate` | `oceanCurrents.inspectWorldRebuild`<br>`oceanCurrents.regenerate / oceanCurrents.rebuildWorld` |
| `terrain.reset-seafloor` | 地形、水文与 Feature | 重新生成海底高度，同时保护陆地、湖泊和已冻结的水陆拓扑。 | `existing-transaction` | `edit.height.applySeafloorReset`<br>`edit.height.inspectSeafloorReset` | `edit.height.inspectSeafloorReset`<br>`edit.height.applySeafloorReset` |
| `terrain.rebuild-height-derived` | 地形、水文与 Feature | 在高度编辑后重建基础、下游或全部派生系统。 | `existing-transaction` | `edit.height.rebuildAllDerived`<br>`edit.height.rebuildBaseDerived`<br>`edit.height.rebuildDownstreamDerived` | `planned:edit.height.inspectDerivedRebuild`<br>`edit.height.rebuildBaseDerived / rebuildDownstreamDerived / rebuildAllDerived` |
| `terrain.edit-height-region` | 地形、水文与 Feature | 按 Cell 集、范围或画笔修改高度，并明确是否影响海底及哪些派生系统待更新。 | `existing-transaction` | `edit.height.applyChanges`<br>`edit.height.applyRangeTransform`<br>`edit.height.inspectChanges`<br>`edit.height.inspectRangeTransform` | `edit.height.inspectChanges / edit.height.inspectRangeTransform`<br>`edit.height.applyChanges / edit.height.applyRangeTransform` |
| `terrain.apply-height-program` | 地形、水文与 Feature | 把模板或多步骤程序应用到全图或选区，并保持步骤整体原子。 | `existing-transaction` | `edit.height.applyGlobalTransform`<br>`edit.height.applyTerrainProgram`<br>`edit.height.applyTerrainTemplate`<br>`edit.height.inspectGlobalTransform`<br>`edit.height.inspectTerrainProgram`<br>`edit.height.inspectTerrainTemplate` | `对应 inspect 方法`<br>`对应 apply 方法` |
| `terrain.smooth-selection` | 地形、水文与 Feature | 对选中 Cell 做受控平滑，维护羽化、海陆保护和单事务。 | `existing-transaction` | `edit.height.applySelectionSmoothing`<br>`edit.height.inspectSelectionSmoothing` | `edit.height.inspectSelectionSmoothing`<br>`edit.height.applySelectionSmoothing` |
| `terrain.patch-feature` | 地形、水文与 Feature | 在局部 Cell 集修正水陆状态，并同步高度、Feature、对象保护和派生链。 | `existing-transaction` | `edit.features.applyPatch`<br>`edit.features.inspectPatch` | `edit.features.inspectPatch`<br>`edit.features.applyPatch` |
| `terrain.change-feature-topology` | 地形、水文与 Feature | 改变水陆连通关系，同时保护沿岸对象、河口、道路和 Feature 身份。 | `existing-transaction` | `edit.features.applyTopology`<br>`edit.features.inspectTopology` | `edit.features.inspectTopology`<br>`edit.features.applyTopology` |
| `hydrology.create-river` | 地形、水文与 Feature | 选择合法源点创建河流，解析下游路径、河口和统计。 | `existing-transaction` | `edit.rivers.create`<br>`edit.rivers.inspectCreate` | `edit.rivers.inspectCreate`<br>`edit.rivers.create` |
| `hydrology.delete-river` | 地形、水文与 Feature | 删除河流，检查湖泊出口、路线/备注和其它依赖。 | `existing-transaction` | `edit.rivers.delete`<br>`edit.rivers.inspectDelete` | `edit.rivers.inspectDelete`<br>`edit.rivers.delete` |
| `hydrology.excavate-lake` | 地形、水文与 Feature | 以 Cell 和半径开挖湖泊，处理高度、Feature、对象保护和出口。 | `existing-transaction` | `edit.lakes.create`<br>`edit.lakes.inspectCreate` | `edit.lakes.inspectCreate`<br>`edit.lakes.create` |
| `hydrology.change-lake-outlet` | 地形、水文与 Feature | 验证湖泊与河流关系后设置出口，并修复水文引用。 | `existing-transaction` | `edit.lakes.inspectOutlet`<br>`edit.lakes.setOutlet` | `edit.lakes.inspectOutlet`<br>`edit.lakes.setOutlet` |
| `hydrology.delete-lake` | 地形、水文与 Feature | 删除湖泊对象，明确是仅删对象还是填平水体，并清理依赖。 | `existing-transaction` | `edit.lakes.delete`<br>`edit.lakes.inspectDelete` | `edit.lakes.inspectDelete`<br>`edit.lakes.delete` |
| `ecology.assign-biome` | 气候、生态与人口承载 | 按 Grid Cell 集分配生物群系，并报告气候或水陆不适配。 | `existing-transaction` | `edit.biomes.assignCells`<br>`edit.biomes.inspectAssignment` | `edit.biomes.inspectAssignment`<br>`edit.biomes.assignCells` |
| `ecology.adjust-suitability` | 气候、生态与人口承载 | 调整基础适居度或覆盖值，维护人口承载和旧图兼容。 | `existing-transaction` | `edit.biomes.applySuitability`<br>`edit.biomes.inspectSuitability` | `edit.biomes.inspectSuitability`<br>`edit.biomes.applySuitability` |
| `politics.create-state` | 国家、省份与政治拓扑 | 在合法陆地创建国家，同时创建首省、复用或创建首都并同步政治镜像。 | `existing-transaction` | `edit.states.add`<br>`edit.states.createAtCell`<br>`edit.states.inspectCreateAtCell` | `edit.states.inspectCreateAtCell`<br>`edit.states.createAtCell` |
| `politics.delete-state` | 国家、省份与政治拓扑 | 删除国家，明确处理领土、省份、城镇、外交、军事、市场和历史引用。 | `existing-transaction` | `edit.states.delete`<br>`edit.states.inspectDelete` | `edit.states.inspectDelete`<br>`edit.states.delete` |
| `politics.merge-states` | 国家、省份与政治拓扑 | 把被合并国完整并入保留国，重建省份并同步外交、军事、市场和路线。 | `existing-transaction` | `edit.states.inspectMerge`<br>`edit.states.merge` | `edit.states.inspectMerge`<br>`edit.states.merge` |
| `politics.split-state` | 国家、省份与政治拓扑 | 选择完整旧省份和新首都拆出国家，修复原国家首都及全部跨域引用。 | `existing-transaction` | `edit.states.inspectSplit`<br>`edit.states.split` | `edit.states.inspectSplit`<br>`edit.states.split` |
| `politics.transfer-territory` | 国家、省份与政治拓扑 | 把一个或多个 Cell 从原国家转给目标国家，并按省份策略处理；若原国家失去最后领土则触发完整灭国。 | `existing-transaction` | `edit.states.inspectTerritoryTransfer`<br>`edit.states.transferTerritory` | `edit.states.inspectTerritoryTransfer`<br>`edit.states.transferTerritory` |
| `politics.ensure-province-assignment` | 国家、省份与政治拓扑 | 把 Cell 分给已有省份；若明确要求的省份不存在，则在合法 ID/命名策略下创建后分配。 | `existing-transaction` | `edit.provinces.ensureAssignment`<br>`edit.provinces.inspectEnsureAssignment` | `edit.provinces.inspectEnsureAssignment`<br>`edit.provinces.ensureAssignment` |
| `politics.transfer-province` | 国家、省份与政治拓扑 | 把完整省份及其 Cell、城镇和省会转给目标国家，并修复双方统计、首都和引用。 | `existing-transaction` | `edit.provinces.inspectTransfer`<br>`edit.provinces.transfer` | `edit.provinces.inspectTransfer`<br>`edit.provinces.transfer` |
| `politics.reorganize-provinces` | 国家、省份与政治拓扑 | 保留国家与范围外对象，墓碑化目标旧省并生成新的连通省份。 | `existing-transaction` | `generate.regenerate` | `planned:edit.provinces.inspectRegeneration`<br>`generate.regenerate(provinces)` |
| `politics.create-province` | 国家、省份与政治拓扑 | 在已有国家的合法 Cell 创建省份，确定省会并同步国家省份列表。 | `existing-transaction` | `edit.provinces.add`<br>`edit.provinces.createAtCell`<br>`edit.provinces.inspectCreateAtCell` | `edit.provinces.inspectCreateAtCell`<br>`edit.provinces.createAtCell` |
| `politics.delete-province` | 国家、省份与政治拓扑 | 删除省份，清除或重新分配领土与城镇，维护国家省份列表。 | `existing-transaction` | `edit.provinces.delete`<br>`edit.provinces.inspectDelete` | `edit.provinces.inspectDelete`<br>`edit.provinces.delete` |
| `politics.merge-provinces` | 国家、省份与政治拓扑 | 把多个同国相邻省份合并，保留一个身份或创建新身份，并确定省会。 | `existing-transaction` | `edit.provinces.inspectMerge`<br>`edit.provinces.merge` | `edit.provinces.inspectMerge`<br>`edit.provinces.merge` |
| `politics.split-province` | 国家、省份与政治拓扑 | 按连通 Cell 集或城镇锚点拆分省份，并为两侧确定省会。 | `existing-transaction` | `edit.provinces.inspectSplit`<br>`edit.provinces.split` | `edit.provinces.inspectSplit`<br>`edit.provinces.split` |
| `politics.change-government` | 国家、省份与政治拓扑 | 调整国家政体和允许的国号后缀，并同步完整国名和政治镜像。 | `existing-transaction` | `edit.states.setGovernment`<br>`edit.states.setGovernmentBatch` | `info.describe(edit.states.setGovernment)`<br>`edit.states.setGovernment / setGovernmentBatch` |
| `politics.relocate-capital` | 国家、省份与政治拓扑 | 把本国城市设为首都，取消旧首都并同步国家中心、标签和城镇层级。 | `existing-transaction` | `edit.states.inspectCapitalChange`<br>`edit.states.setCapital` | `edit.states.inspectCapitalChange`<br>`edit.states.setCapital` |
| `politics.reassess-provincial-capitals` | 国家、省份与政治拓扑 | 先只读预览单省或全部未锁省份，再以预览指纹确认并原子同步唯一省会、政治双镜像与道路优先级。 | `existing-transaction` | `edit.provinces.inspectCapitalReassessment`<br>`edit.provinces.reassessCapitals` | `edit.provinces.inspectCapitalReassessment`<br>`edit.provinces.reassessCapitals` |
| `settlement.found-city` | 城镇、人口与定居点 | 在合法 Cell 建立城镇，继承国家、省份、文化、宗教和港口条件。 | `existing-transaction` | `edit.cities.add`<br>`edit.cities.createAtCell`<br>`edit.cities.inspectCreateAtCell` | `edit.cities.inspectCreateAtCell`<br>`edit.cities.createAtCell` |
| `settlement.move-city` | 城镇、人口与定居点 | 移动城镇到目标点，处理国家/省份归属、首都省会限制、港口和相连路线。 | `existing-transaction` | `edit.cities.inspectMove`<br>`edit.cities.move` | `edit.cities.inspectMove`<br>`edit.cities.move` |
| `settlement.delete-city` | 城镇、人口与定居点 | 删除城镇前评估首都、省会、路线、市场和备注依赖，确认后单事务清理。 | `existing-transaction` | `edit.cities.delete`<br>`edit.cities.inspectDelete` | `edit.cities.inspectDelete`<br>`edit.cities.delete` |
| `settlement.sync-city-owner` | 城镇、人口与定居点 | 让城镇国家与省份归属跟随所在 Cell，并处理首都、省会和跨国约束。 | `existing-transaction` | `edit.cities.inspectOwnerSync`<br>`edit.cities.syncOwner` | `edit.cities.inspectOwnerSync`<br>`edit.cities.syncOwner` |
| `settlement.regenerate-scope` | 城镇、人口与定居点 | 在全图、国家或省份范围重设普通城镇，保留首都、省会和范围外对象身份。 | `existing-transaction` | `generate.regenerate` | `planned:edit.cities.inspectRegeneration`<br>`generate.regenerate(cities)` |
| `society.adjust-population` | 城镇、人口与定居点 | 给国家、省份、城市或 Cell 区域增减人口，并按规则分摊城乡。 | `existing-transaction` | `edit.population.applyAdjustment`<br>`edit.population.inspectAdjustment` | `edit.population.inspectAdjustment`<br>`edit.population.applyAdjustment` |
| `society.transfer-population` | 城镇、人口与定居点 | 从来源区域向目标区域迁移人口，保持总量并更新城乡和统计。 | `existing-transaction` | `edit.population.inspectTransfer`<br>`edit.population.transfer` | `edit.population.inspectTransfer`<br>`edit.population.transfer` |
| `society.culture.lifecycle` | 文化、宗教、命名与社会归属 | 管理文化对象及其 Cell 归属、中心、父级和删除后的回退。 | `existing-transaction` | `edit.cultures.add`<br>`edit.cultures.applyExpansion`<br>`edit.cultures.assignCells`<br>`edit.cultures.delete`<br>`edit.cultures.inspectExpansion`<br>`edit.cultures.inspectLifecycle`<br>`edit.cultures.setParent` | `edit.cultures.inspectLifecycle / edit.cultures.inspectExpansion`<br>`edit.cultures.*` |
| `society.religion.lifecycle` | 文化、宗教、命名与社会归属 | 管理宗教对象及其 Cell 归属、中心、父级和删除后的回退。 | `existing-transaction` | `edit.religions.add`<br>`edit.religions.applyExpansion`<br>`edit.religions.assignCells`<br>`edit.religions.delete`<br>`edit.religions.inspectExpansion`<br>`edit.religions.inspectLifecycle`<br>`edit.religions.setParent` | `edit.religions.inspectLifecycle / edit.religions.inspectExpansion`<br>`edit.religions.*` |
| `society.bind-namebase-and-rename` | 文化、宗教、命名与社会归属 | 调整名称库绑定并按国家、省份或对象类型批量重命名，确保唯一性和旧名策略。 | `existing-transaction` | `namebases.bindAndRename`<br>`namebases.inspectBindAndRename` | `namebases.inspectBindAndRename`<br>`namebases.bindAndRename` |
| `society.replace-or-remove-namebase` | 文化、宗教、命名与社会归属 | 删除、清空或替换用户名称库时，先处理所有文化和对象绑定，避免悬空。 | `existing-transaction` | `namebases.inspectReplacement`<br>`namebases.replace` | `namebases.inspectReplacement`<br>`namebases.replace` |
| `infrastructure.create-route` | 路线、区域与资源设施 | 根据端点或 Pack Cell 路径创建道路、步道或海路，验证通行和归属。 | `existing-transaction` | `edit.routes.create` | `planned:cells.inspectAction(route.draw)`<br>`edit.routes.create` |
| `infrastructure.edit-route` | 路线、区域与资源设施 | 移动、插入或删除路线节点，并重建路径、长度、归属和渲染数据。 | `existing-transaction` | `edit.routes.inspectEdit`<br>`edit.routes.update` | `edit.routes.inspectEdit`<br>`edit.routes.update` |
| `infrastructure.delete-route` | 路线、区域与资源设施 | 删除路线，评估备注、城镇和资源引用并保持普通单路线低影响兼容。 | `existing-transaction` | `edit.routes.delete`<br>`edit.routes.inspectDelete` | `edit.routes.inspectDelete`<br>`edit.routes.delete` |
| `infrastructure.rebuild-route-network` | 路线、区域与资源设施 | 基于当前城镇、地形和政治归属重新生成路线网络。 | `existing-transaction` | `generate.regenerate` | `planned:edit.routes.inspectRegeneration`<br>`generate.regenerate(routes)` |
| `economy.assign-market-region` | 市场、资源与经济链 | 把 Pack Cell 区域分配给市场，校验跨国、水域和无效市场后重算经济链。 | `existing-transaction` | `edit.economy.assignCells`<br>`edit.economy.inspectAssignment` | `edit.economy.inspectAssignment`<br>`edit.economy.assignCells` |
| `economy.rebuild` | 市场、资源与经济链 | 基于当前政治、城镇和资源状态重算市场与交易。 | `existing-transaction` | `edit.economy.rebuild` | `planned:edit.economy.inspectRebuild`<br>`edit.economy.rebuild` |
| `infrastructure.regenerate-resources` | 市场、资源与经济链 | 重生成资源标记、资源潜力和相关贸易。 | `existing-transaction` | `generate.regenerate` | `planned:edit.markers.inspectResourceRegeneration`<br>`generate.regenerate(markers)` |
| `infrastructure.manage-zone` | 路线、区域与资源设施 | 按中心 Cell 和半径创建区域，或在依赖预检后删除区域。 | `existing-transaction` | `edit.zones.create`<br>`edit.zones.delete`<br>`edit.zones.inspectCreate`<br>`edit.zones.inspectDelete`<br>`edit.zones.setContext`<br>`edit.zones.setProperties` | `edit.zones.inspectCreate / edit.zones.inspectDelete`<br>`edit.zones.create / edit.zones.delete` |
| `diplomacy.set-bilateral-relation` | 外交、战争与国家关系 | 设置两国关系并同步反向关系、摘要、纪事和战争相关约束。 | `existing-transaction` | `edit.diplomacy.inspectRelation`<br>`edit.diplomacy.setRelation` | `edit.diplomacy.inspectRelation`<br>`edit.diplomacy.setRelation` |
| `diplomacy.regenerate` | 外交、战争与国家关系 | 基于当前国家、邻接和随机种子重建外交关系与摘要。 | `existing-transaction` | `generate.regenerate` | `planned:edit.diplomacy.inspectRegeneration`<br>`generate.regenerate(diplomacy)` |
| `diplomacy.declare-war` | 外交、战争与国家关系 | 两国从和平关系进入战争，建立战争目标、参战方、纪事和军事活动上下文。 | `existing-transaction` | `edit.diplomacy.declareWar`<br>`edit.diplomacy.inspectDeclareWar`<br>`objects.get` | `edit.diplomacy.inspectDeclareWar`<br>`edit.diplomacy.declareWar` |
| `diplomacy.make-peace` | 外交、战争与国家关系 | 结束战争，处理领土、赔款、附庸、军队状态和纪事。 | `existing-transaction` | `edit.diplomacy.inspectPeace`<br>`edit.diplomacy.makePeace`<br>`objects.get` | `edit.diplomacy.inspectPeace`<br>`edit.diplomacy.makePeace` |
| `diplomacy.change-overlord` | 外交、战争与国家关系 | 建立或解除附庸关系，维护关系矩阵、外交摘要、战争资格和纪事。 | `existing-transaction` | `edit.diplomacy.changeOverlord`<br>`edit.diplomacy.inspectOverlordChange`<br>`objects.get` | `edit.diplomacy.inspectOverlordChange`<br>`edit.diplomacy.changeOverlord` |
| `military.reconfigure-force` | 军队、调动与战斗 | 调整国家兵种比例，验证总和并同步军团构成与统计。 | `existing-transaction` | `edit.military.inspectRatios`<br>`edit.military.setRatios` | `edit.military.inspectRatios`<br>`edit.military.setRatios` |
| `military.move-station` | 军队、调动与战斗 | 移动军团到合法 Cell，校验国家、地形、基地和命令目标。 | `existing-transaction` | `edit.military.inspectMoveStation`<br>`edit.military.moveStation` | `edit.military.inspectMoveStation`<br>`edit.military.moveStation` |
| `military.set-base` | 军队、调动与战斗 | 把当前位置或指定位置设为基地，验证归属和可达性。 | `existing-transaction` | `edit.military.inspectBase`<br>`edit.military.setBase` | `edit.military.inspectBase`<br>`edit.military.setBase` |
| `military.issue-status` | 军队、调动与战斗 | 调整军团驻防、机动、交战等态势并检查目标和批量原子性。 | `existing-transaction` | `edit.military.inspectStatus`<br>`edit.military.setStatus`<br>`edit.military.setStatusBatch` | `edit.military.inspectStatus`<br>`edit.military.setStatus / setStatusBatch` |
| `military.resolve-battle` | 军队、调动与战斗 | 在双向战争、海陆一致且同 cell、相邻 cell 或同一匹配战区时，确定性结算双方伤亡、态势、败退命令与战报。 | `existing-transaction` | `edit.military.inspectBattle`<br>`edit.military.recordBattleEvent`<br>`edit.military.resolveBattle` | `edit.military.inspectBattle`<br>`edit.military.resolveBattle` |
| `military.regenerate` | 军队、调动与战斗 | 基于当前国家、人口与政策重生成军团并维护引用。 | `existing-transaction` | `generate.regenerate` | `planned:edit.military.inspectRegeneration`<br>`generate.regenerate(military)` |
| `editor.delete-with-impact` | 编辑器事务、批量操作与发布 | 对对象删除、批量删除和清空先评估依赖与风险，再确认并原子执行。 | `existing-transaction` | `edit.cities.delete`<br>`edit.cultures.delete`<br>`edit.labels.delete`<br>`edit.lakes.delete`<br>`edit.markers.delete`<br>`edit.notes.delete`<br>`edit.notes.deleteBatch`<br>`edit.provinces.delete`<br>`edit.religions.delete`<br>`edit.rivers.delete`<br>`edit.routes.delete`<br>`edit.states.delete`<br>`edit.zones.delete`<br>`namebases.clear`<br>`namebases.delete` | `统一 delete impact inspector`<br>`各领域 delete/clear` |
| `editor.import-collection` | 编辑器事务、批量操作与发布 | 校验外部集合、处理 ID 冲突与覆盖策略，并作为单条历史导入。 | `existing-transaction` | `data.inspectCollectionImport`<br>`edit.measurements.import`<br>`edit.military.importBattleEvents`<br>`edit.notes.import`<br>`namebases.import` | `data.inspectCollectionImport`<br>`现有 import 方法` |

## 需要优先补齐的复合事务

## AI 规划器玩法配方

| 配方 | 目标 | 规则动作序列 |
|---|---|---|
| `scenario.colonize-region` 殖民或开拓区域 | 取得领土、建立城镇、划分省份、连接路线并接入市场。 | `politics.transfer-territory` → `politics.ensure-province-assignment` → `settlement.found-city` → `infrastructure.create-route` → `economy.assign-market-region` |
| `scenario.invasion-and-annexation` 入侵、占领与吞并国家 | 宣战、调动军队、结算战斗、逐步占领领土并议和或吞并。 | `diplomacy.declare-war` → `military.move-station` → `military.resolve-battle` → `politics.transfer-territory` → `diplomacy.make-peace` |
| `scenario.administrative-reform` 行政区划改革 | 合并、拆分或转移省份，重新选择省会并按范围重命名。 | `politics.transfer-province` → `politics.merge-provinces` → `politics.split-province` → `politics.reorganize-provinces` → `society.bind-namebase-and-rename` |
| `scenario.population-resettlement` 人口迁徙与新城建设 | 迁移人口、建立或移动城镇、调整市场与路线。 | `society.transfer-population` → `settlement.found-city` → `settlement.move-city` → `economy.assign-market-region` → `infrastructure.create-route` |
| `scenario.cultural-assimilation` 文化或宗教传播与同化 | 调整中心和继承关系，扩张归属并按新名称体系重命名对象。 | `society.culture.lifecycle` → `society.religion.lifecycle` → `society.bind-namebase-and-rename` |
| `scenario.infrastructure-development` 区域基础设施与经济开发 | 规划路线、调整市场覆盖、生成资源并重建经济。 | `infrastructure.create-route` → `economy.assign-market-region` → `infrastructure.regenerate-resources` → `economy.rebuild` |
| `scenario.coastline-engineering` 海岸、海峡与湖海工程 | 改变局部水陆和连通性，保护沿岸对象并重建水文与路线。 | `terrain.patch-feature` → `terrain.change-feature-topology` → `hydrology.change-lake-outlet` → `world.regenerate-system` |
| `scenario.climate-disaster` 气候灾变及世界响应 | 改变气候或洋流，重建生态、人口和社会系统并记录前后结果。 | `world.apply-climate-and-rebuild` → `world.rebuild-from-ocean-currents` → `society.adjust-population` → `world.regenerate-system` |
| `scenario.state-reformation` 国家改制与迁都 | 调整政体国号、迁都、重设省份并更新命名。 | `politics.change-government` → `politics.relocate-capital` → `politics.reorganize-provinces` → `society.bind-namebase-and-rename` |
| `scenario.publish-map` 检查、整理并发布地图 | 检查健康与对象一致性，整理图层和主题，再导出数据、图片和说明。 | `health-check` → `layers-and-themes` → `data-export` → `gameplay-documentation` |

配方已由公开 planner registry 发布，但不承诺跨步骤原子性。AI 每一步都必须读取当前 revision、调用登记的精确 inspector、等待必要授权、执行公开规则事务，再根据新状态继续规划。

## 玩法文档生成骨架

- `world` **世界创建、存档与重算**：换图、导入和跨系统重算必须原子替换地图，失败不得污染当前地图、历史或运行时引用。
- `terrain` **地形、水文与 Feature**：Grid/Pack、高度、水陆 Feature、河湖、海岸和下游派生必须在事务结束时一致。
- `ecology` **气候、生态与人口承载**：气候、生物群系、适居度和人口承载的直接值与派生值必须有明确的重算边界。
- `politics` **国家、省份与政治拓扑**：国家、省份、Grid/Pack 归属、首都、省会、外交、军事、市场和路线引用不得悬空。
- `settlement` **城镇、人口与定居点**：城镇位置、国家/省份归属、首都/省会、港口、路线和人口统计必须同步。
- `society` **文化、宗教、命名与社会归属**：文化/宗教中心、继承关系、Cell 归属、对象引用和名称库绑定不得形成无主或循环数据。
- `infrastructure` **路线、区域与资源设施**：路径、端点、Cell 链、对象归属和资源引用必须保持可定位、可撤销且无悬空目标。
- `economy` **市场、资源与经济链**：市场归属、资源供给、贸易关系和统计摘要必须基于同一批已提交地图状态。
- `diplomacy` **外交、战争与国家关系**：双边关系、宗藩、战争、纪事和被移除国家引用必须成对同步并保持对称规则。
- `military` **军队、调动与战斗**：军团身份、所属国家、驻地、基地、命令、事件链和国家存亡必须保持引用完整。
- `editor` **编辑器事务、批量操作与发布**：编辑器服务不得伪装成游戏规则；危险操作要有预检，批量操作要有单事务回滚。

后续完整玩法文档不应按 UI 面板抄按钮，而应按以上领域章节描述：玩家目标、合法前置、规则分支、成功影响、失败原因、可撤销性、与其它系统的联动，以及可由 AI 组合的配方。

## 机器覆盖

- API 分类：`atomic-editor-primitive=54`，`editor-runtime-service=49`，`read-export-service=11`，`read-primitive=38`，`semantic-action=164`。
- 交互分类：`semantic-input-or-primitive=36`，`ui-boundary=12`。
- Source digest：`ff2662f63130a4acd1a68250cee65631b505077275b48bdb93d3672719fb0ade`。
