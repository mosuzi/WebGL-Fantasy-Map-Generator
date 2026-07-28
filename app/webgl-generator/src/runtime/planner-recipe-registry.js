export const PLANNER_RECIPE_SCHEMA_VERSION = "1.0.0";

const EXPECTED_RECIPE_IDS = Object.freeze([
  "scenario.colonize-region",
  "scenario.invasion-and-annexation",
  "scenario.administrative-reform",
  "scenario.population-resettlement",
  "scenario.cultural-assimilation",
  "scenario.infrastructure-development",
  "scenario.coastline-engineering",
  "scenario.climate-disaster",
  "scenario.state-reformation",
  "scenario.publish-map"
]);

const SUCCESS_BY_ACTION = Object.freeze({
  "politics.transfer-territory": "目标 Cell 的国家与省份归属一致，相关城市和政治引用没有悬空。",
  "politics.ensure-province-assignment": "目标陆地 Cell 均属于有效省份，省份国家归属与 Cell 国家归属一致。",
  "settlement.found-city": "新城市可按稳定引用读取，所属国家、省份和 Cell 与请求一致。",
  "infrastructure.create-route": "新路线存在并连接预期端点，路径 Cell 连续且没有悬空引用。",
  "economy.assign-market-region": "目标 Cell 全部归入指定市场，市场覆盖与经济摘要一致。",
  "diplomacy.declare-war": "双方关系均为 Enemy，战争纪事、战区和军事上下文可解析。",
  "military.move-station": "目标军团驻地 Cell 与移动命令一致，兵力和身份未被意外改写。",
  "military.resolve-battle": "双方兵力非负、伤亡与态势符合结果，并在全局及双方军团中记录同一战报。",
  "diplomacy.make-peace": "双方关系符合和平条款，战争活动、战区与战线按规则清理。",
  "politics.transfer-province": "整省、内部 Cell、城市和省会均归入目标国家且引用一致。",
  "politics.merge-provinces": "来源省份退出活动集合，保留省份非空连通且省会与城市引用有效。",
  "politics.split-province": "新旧省份均非空连通，各自省会、城市和 Cell 归属有效。",
  "politics.reorganize-provinces": "省份重生成完成，锁定对象未被覆盖，国家、省份与城市引用一致。",
  "society.bind-namebase-and-rename": "名称库绑定与目标范围名称同时更新，不存在已删除或旧名称库残留引用。",
  "society.transfer-population": "迁出与迁入人口均非负，城乡分量与总人口守恒。",
  "settlement.move-city": "城市目标 Cell、坐标、国家、省份、港口与路线引用保持一致。",
  "society.culture.lifecycle": "文化中心、父级和 Cell 归属有效，不形成父级循环或无主引用。",
  "society.religion.lifecycle": "宗教中心、父级和 Cell 归属有效，不形成父级循环或无主引用。",
  "infrastructure.regenerate-resources": "资源标记完成重生成，锁定资源保持不变且所有对象引用有效。",
  "economy.rebuild": "市场、资源、路线和城市对应的经济摘要来自同一最新地图状态。",
  "terrain.patch-feature": "Feature 补丁生效且受保护的城镇、路线、河口与水陆引用仍可解析。",
  "terrain.change-feature-topology": "水陆连通性、Feature 身份及相关城镇、路线和河口引用保持一致。",
  "hydrology.change-lake-outlet": "湖泊出口、下游河流与相关水文引用一致且没有无效 Cell。",
  "world.regenerate-system": "指定派生系统基于当前 revision 完成重建，范围外与锁定对象保持不变。",
  "world.apply-climate-and-rebuild": "气候直接值与选定下游系统一致，生态与人口派生均来自灾变后的事实。",
  "world.rebuild-from-ocean-currents": "洋流与选定世界派生完成一致重建，地图 identity 保持不变。",
  "society.adjust-population": "目标人口调整符合请求，城乡分量与总量均保持非负。",
  "politics.change-government": "政体、完整国号和相关显示事实与目标国家集合一致。",
  "politics.relocate-capital": "首都指向本国有效城市，国家中心及旧新首都引用同步更新。"
});

const SUCCESS_BY_STEP = Object.freeze({
  "health-check": "应用 health、WebGL、console error 与 page error 均为零，地图摘要可读取。",
  "layers-and-themes": "当前视图模式、图层可见性和主题等于发布选择，地图 revision 与编辑历史不增加。",
  "data-export": "地图数据与 PNG 导出结果均非空，导出前后地图摘要和 revision 不变。",
  "gameplay-documentation": "能力、方法描述、十个配方和四十三个步骤均可读取并与当前 API 版本一致。"
});

const RAW_RECIPES = [
  recipe({
    recipeId: "scenario.colonize-region",
    title: "殖民或开拓区域",
    domain: "politics",
    intent: "取得领土、建立城镇、划分省份、连接路线并接入市场。",
    preconditions: ["目标区域及相邻政治实体可由公开事实 API 解析。", "每一步都以当前地图 revision 重新预检。"],
    successCriteria: ["目标区域归属明确。", "省份、城镇、路线和市场按玩家选择逐步建立。"],
    steps: [
      ruleStep("transfer-territory", "politics.transfer-territory", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.states.inspectTerritoryTransfer"],
        executeMethods: ["edit.states.transferTerritory"],
        inputTemplate: {fromStateId: "$sourceStateId", toStateId: "$targetStateId", cells: "$packCellRefs"}
      }),
      ruleStep("ensure-province-assignment", "politics.ensure-province-assignment", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.provinces.inspectEnsureAssignment"],
        executeMethods: ["edit.provinces.ensureAssignment"],
        inputTemplate: {stateId: "$targetStateId", cells: "$packCellRefs", provinceId: "$optionalProvinceId"}
      }),
      ruleStep("found-city", "settlement.found-city", {
        facts: ["cells.get", "objects.list"],
        inspection: ["edit.cities.inspectCreateAtCell"],
        executeMethods: ["edit.cities.createAtCell"],
        inputTemplate: {cell: "$gridCellRef", stateId: "$targetStateId", provinceId: "$optionalProvinceId"}
      }),
      ruleStep("create-route", "infrastructure.create-route", {
        spatialActionId: "routes.createPath",
        facts: ["cells.get", "cells.neighbors"],
        inspection: ["cells.inspectAction"],
        executeMethods: ["edit.routes.create"],
        inputTemplate: {actionId: "routes.createPath", actionInput: {path: "$packCellPath"}}
      }),
      ruleStep("assign-market-region", "economy.assign-market-region", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.economy.inspectAssignment"],
        executeMethods: ["edit.economy.assignCells"],
        inputTemplate: {marketId: "$marketId", cells: "$packCellRefs"}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.invasion-and-annexation",
    title: "入侵、占领与吞并国家",
    domain: "military",
    intent: "宣战、调动军队、结算战斗、逐步占领领土并议和或吞并。",
    preconditions: ["进攻方、防守方及参战军团可由公开对象 API 解析。", "领土变化只由独立领土事务提交。"],
    successCriteria: ["战争关系及战斗结果均有公开事务记录。", "领土与和平结果由后续独立事务明确提交。"],
    steps: [
      ruleStep("declare-war", "diplomacy.declare-war", {
        facts: ["objects.get"],
        inspection: ["edit.diplomacy.inspectDeclareWar"],
        executeMethods: ["edit.diplomacy.declareWar"],
        inputTemplate: {attackerStateId: "$attackerStateId", defenderStateId: "$defenderStateId", reason: "$reason"}
      }),
      ruleStep("move-station", "military.move-station", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.military.inspectMoveStation"],
        executeMethods: ["edit.military.moveStation"],
        inputTemplate: {target: "$regimentRef", station: "$packCellRef"}
      }),
      ruleStep("resolve-battle", "military.resolve-battle", {
        facts: ["objects.get", "cells.neighbors"],
        inspection: ["edit.military.inspectBattle"],
        executeMethods: ["edit.military.resolveBattle"],
        inputTemplate: {attacker: "$attackerRegimentRef", defender: "$defenderRegimentRef", seed: "$battleSeed"}
      }),
      ruleStep("transfer-territory", "politics.transfer-territory", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.states.inspectTerritoryTransfer"],
        executeMethods: ["edit.states.transferTerritory"],
        inputTemplate: {fromStateId: "$defenderStateId", toStateId: "$attackerStateId", cells: "$occupiedPackCellRefs"}
      }),
      ruleStep("make-peace", "diplomacy.make-peace", {
        facts: ["objects.get"],
        inspection: ["edit.diplomacy.inspectPeace"],
        executeMethods: ["edit.diplomacy.makePeace"],
        inputTemplate: {leftStateId: "$attackerStateId", rightStateId: "$defenderStateId", relation: "$postWarRelation", terms: "$peaceTerms"}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.administrative-reform",
    title: "行政区划改革",
    domain: "politics",
    intent: "合并、拆分或转移省份，重新选择省会并按范围重命名。",
    preconditions: ["目标国家与省份拓扑可由公开对象和 Cell API 解析。", "合并、拆分和转移分支由规划器按目标选择，不要求全部执行。"],
    successCriteria: ["省份归属、连通性与省会满足各事务规则。", "需要时完成名称库绑定与重命名。"],
    steps: [
      ruleStep("transfer-province", "politics.transfer-province", {
        facts: ["objects.get"],
        inspection: ["edit.provinces.inspectTransfer"],
        executeMethods: ["edit.provinces.transfer"],
        inputTemplate: {provinceId: "$provinceId", targetStateId: "$targetStateId"}
      }),
      ruleStep("merge-provinces", "politics.merge-provinces", {
        facts: ["objects.get", "cells.neighbors"],
        inspection: ["edit.provinces.inspectMerge"],
        executeMethods: ["edit.provinces.merge"],
        inputTemplate: {provinceIds: "$provinceIds", targetProvinceId: "$targetProvinceId"}
      }),
      ruleStep("split-province", "politics.split-province", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.provinces.inspectSplit"],
        executeMethods: ["edit.provinces.split"],
        inputTemplate: {provinceId: "$provinceId", cells: "$newProvincePackCellRefs"}
      }),
      ruleStep("reorganize-provinces", "politics.reorganize-provinces", {
        facts: ["info.mapSummary", "objects.list"],
        inspection: ["info.describe"],
        executeMethods: ["generate.regenerate"],
        inputTemplate: {method: "generate.regenerate", kind: "provinces", options: {confirm: true}}
      }),
      ruleStep("bind-namebase-and-rename", "society.bind-namebase-and-rename", {
        facts: ["namebases.list", "objects.list"],
        inspection: ["namebases.inspectBindAndRename"],
        executeMethods: ["namebases.bindAndRename"],
        inputTemplate: {binding: "$binding", namebaseId: "$namebaseId", rename: "$renameOptions"}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.population-resettlement",
    title: "人口迁徙与新城建设",
    domain: "settlement",
    intent: "迁移人口、建立或移动城镇、调整市场与路线。",
    preconditions: ["迁出与迁入对象可由公开对象 API 解析。", "人口、城镇、市场和路线逐步提交，不伪造整体事务。"],
    successCriteria: ["人口守恒与非负约束成立。", "新定居点具备明确归属及可选的市场和路线连接。"],
    steps: [
      ruleStep("transfer-population", "society.transfer-population", {
        facts: ["objects.get"],
        inspection: ["edit.population.inspectTransfer"],
        executeMethods: ["edit.population.transfer"],
        inputTemplate: {from: "$sourceRef", to: "$targetRef", amount: "$populationAmount"}
      }),
      ruleStep("found-city", "settlement.found-city", {
        facts: ["cells.get", "objects.list"],
        inspection: ["edit.cities.inspectCreateAtCell"],
        executeMethods: ["edit.cities.createAtCell"],
        inputTemplate: {cell: "$gridCellRef", stateId: "$stateId", provinceId: "$provinceId"}
      }),
      ruleStep("move-city", "settlement.move-city", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.cities.inspectMove"],
        executeMethods: ["edit.cities.move"],
        inputTemplate: {cityId: "$cityId", cell: "$targetCellRef"}
      }),
      ruleStep("assign-market-region", "economy.assign-market-region", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.economy.inspectAssignment"],
        executeMethods: ["edit.economy.assignCells"],
        inputTemplate: {marketId: "$marketId", cells: "$packCellRefs"}
      }),
      ruleStep("create-route", "infrastructure.create-route", {
        spatialActionId: "routes.createPath",
        facts: ["cells.get", "cells.neighbors"],
        inspection: ["cells.inspectAction"],
        executeMethods: ["edit.routes.create"],
        inputTemplate: {actionId: "routes.createPath", actionInput: {path: "$packCellPath"}}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.cultural-assimilation",
    title: "文化或宗教传播与同化",
    domain: "society",
    intent: "调整中心和继承关系，扩张归属并按新名称体系重命名对象。",
    preconditions: ["目标文化、宗教、Cell 范围与名称库可由公开 API 解析。", "生命周期与扩张分支按具体操作选择对应 inspector。"],
    successCriteria: ["文化与宗教归属、中心和继承关系保持合法。", "需要时按绑定名称库完成对象重命名。"],
    steps: [
      ruleStep("culture-lifecycle", "society.culture.lifecycle", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.cultures.inspectLifecycle", "edit.cultures.inspectExpansion"],
        executeMethods: ["edit.cultures.add", "edit.cultures.assignCells", "edit.cultures.applyExpansion", "edit.cultures.setParent", "edit.cultures.delete"],
        inputTemplate: {operation: "$cultureOperation", culture: "$cultureRef", options: "$operationOptions"}
      }),
      ruleStep("religion-lifecycle", "society.religion.lifecycle", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.religions.inspectLifecycle", "edit.religions.inspectExpansion"],
        executeMethods: ["edit.religions.add", "edit.religions.assignCells", "edit.religions.applyExpansion", "edit.religions.setParent", "edit.religions.delete"],
        inputTemplate: {operation: "$religionOperation", religion: "$religionRef", options: "$operationOptions"}
      }),
      ruleStep("bind-namebase-and-rename", "society.bind-namebase-and-rename", {
        facts: ["namebases.list", "objects.list"],
        inspection: ["namebases.inspectBindAndRename"],
        executeMethods: ["namebases.bindAndRename"],
        inputTemplate: {binding: "$binding", namebaseId: "$namebaseId", rename: "$renameOptions"}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.infrastructure-development",
    title: "区域基础设施与经济开发",
    domain: "economy",
    intent: "规划路线、调整市场覆盖、生成资源并重建经济。",
    preconditions: ["开发范围、市场和路线端点可由公开事实 API 解析。", "资源重算与经济重建均需遵守公开确认策略。"],
    successCriteria: ["路线与市场覆盖达到规划目标。", "资源与经济派生链由显式重算步骤完成。"],
    steps: [
      ruleStep("create-route", "infrastructure.create-route", {
        spatialActionId: "routes.createPath",
        facts: ["cells.get", "cells.neighbors"],
        inspection: ["cells.inspectAction"],
        executeMethods: ["edit.routes.create"],
        inputTemplate: {actionId: "routes.createPath", actionInput: {path: "$packCellPath"}}
      }),
      ruleStep("assign-market-region", "economy.assign-market-region", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.economy.inspectAssignment"],
        executeMethods: ["edit.economy.assignCells"],
        inputTemplate: {marketId: "$marketId", cells: "$packCellRefs"}
      }),
      ruleStep("regenerate-resources", "infrastructure.regenerate-resources", {
        facts: ["info.mapSummary", "objects.list"],
        inspection: ["info.describe"],
        executeMethods: ["generate.regenerate"],
        inputTemplate: {method: "generate.regenerate", kind: "markers", options: {confirm: true}}
      }),
      ruleStep("rebuild-economy", "economy.rebuild", {
        facts: ["info.mapSummary", "objects.list"],
        inspection: ["info.describe"],
        executeMethods: ["edit.economy.rebuild"],
        inputTemplate: {method: "edit.economy.rebuild", options: {confirm: true}}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.coastline-engineering",
    title: "海岸、海峡与湖海工程",
    domain: "terrain",
    intent: "改变局部水陆和连通性，保护沿岸对象并重建水文与路线。",
    preconditions: ["目标 Feature、湖泊和 Cell 范围可由公开 API 解析。", "拓扑变化前必须完成影响预检并取得必要授权。"],
    successCriteria: ["水陆与 Feature 拓扑满足显式工程目标。", "受影响派生系统通过独立重算步骤恢复一致。"],
    steps: [
      ruleStep("patch-feature", "terrain.patch-feature", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.features.inspectPatch"],
        executeMethods: ["edit.features.applyPatch"],
        inputTemplate: {featureId: "$featureId", patch: "$featurePatch"}
      }),
      ruleStep("change-feature-topology", "terrain.change-feature-topology", {
        facts: ["objects.get", "cells.query"],
        inspection: ["edit.features.inspectTopology"],
        executeMethods: ["edit.features.applyTopology"],
        inputTemplate: {operation: "$topologyOperation", cells: "$gridCellRefs"}
      }),
      ruleStep("change-lake-outlet", "hydrology.change-lake-outlet", {
        facts: ["objects.get", "cells.get"],
        inspection: ["edit.lakes.inspectOutlet"],
        executeMethods: ["edit.lakes.setOutlet"],
        inputTemplate: {lakeId: "$lakeId", outlet: "$outletCellRef"}
      }),
      ruleStep("regenerate-system", "world.regenerate-system", {
        facts: ["info.mapSummary"],
        inspection: ["info.describe"],
        executeMethods: ["generate.regenerate"],
        inputTemplate: {method: "generate.regenerate", kind: "$derivedSystem", options: {confirm: true}}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.climate-disaster",
    title: "气候灾变及世界响应",
    domain: "ecology",
    intent: "改变气候或洋流，重建生态、人口和社会系统并记录前后结果。",
    preconditions: ["灾变参数和重建系统列表均为显式输入。", "异步重算前后必须复核地图 identity 与 revision。"],
    successCriteria: ["气候或洋流变化已提交。", "选定下游系统逐步重建且人口保持非负。"],
    steps: [
      ruleStep("apply-climate-and-rebuild", "world.apply-climate-and-rebuild", {
        facts: ["climate.get", "info.mapSummary"],
        inspection: ["info.describe", "climate.inspectDownstreamRebuild"],
        executeMethods: ["climate.apply", "climate.applyDownstreamRebuild"],
        inputTemplate: {method: "climate.apply", patch: "$climatePatch", rebuild: {systems: "$systems", seed: "$seed", confirm: true}},
        compensation: noAutomaticCompensation("气候参数写入不进入地图历史；若下游重算失败，保留已提交气候并要求显式重规划。")
      }),
      ruleStep("rebuild-from-ocean-currents", "world.rebuild-from-ocean-currents", {
        facts: ["oceanCurrents.inspectWorldRebuild", "info.mapSummary"],
        inspection: ["oceanCurrents.inspectWorldRebuild"],
        executeMethods: ["oceanCurrents.regenerate", "oceanCurrents.rebuildWorld"],
        inputTemplate: {seed: "$seed", confirm: true}
      }),
      ruleStep("adjust-population", "society.adjust-population", {
        facts: ["objects.get"],
        inspection: ["edit.population.inspectAdjustment"],
        executeMethods: ["edit.population.applyAdjustment"],
        inputTemplate: {target: "$populationTarget", adjustment: "$adjustment"}
      }),
      ruleStep("regenerate-system", "world.regenerate-system", {
        facts: ["info.mapSummary"],
        inspection: ["info.describe"],
        executeMethods: ["generate.regenerate"],
        inputTemplate: {method: "generate.regenerate", kind: "$derivedSystem", options: {confirm: true}}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.state-reformation",
    title: "国家改制与迁都",
    domain: "politics",
    intent: "调整政体国号、迁都、重设省份并更新命名。",
    preconditions: ["国家、候选首都、省份和名称库可由公开 API 解析。", "各步骤独立预检并使用最新 revision。"],
    successCriteria: ["政体、首都与省份派生保持一致。", "需要时完成名称库绑定与对象重命名。"],
    steps: [
      ruleStep("change-government", "politics.change-government", {
        facts: ["objects.get"],
        inspection: ["info.describe"],
        executeMethods: ["edit.states.setGovernment", "edit.states.setGovernmentBatch"],
        inputTemplate: {method: "edit.states.setGovernment", state: "$stateRef", government: "$government"}
      }),
      ruleStep("relocate-capital", "politics.relocate-capital", {
        facts: ["objects.get"],
        inspection: ["edit.states.inspectCapitalChange"],
        executeMethods: ["edit.states.setCapital"],
        inputTemplate: {stateId: "$stateId", cityId: "$capitalCityId"}
      }),
      ruleStep("reorganize-provinces", "politics.reorganize-provinces", {
        facts: ["info.mapSummary", "objects.list"],
        inspection: ["info.describe"],
        executeMethods: ["generate.regenerate"],
        inputTemplate: {method: "generate.regenerate", kind: "provinces", options: {confirm: true}}
      }),
      ruleStep("bind-namebase-and-rename", "society.bind-namebase-and-rename", {
        facts: ["namebases.list", "objects.list"],
        inspection: ["namebases.inspectBindAndRename"],
        executeMethods: ["namebases.bindAndRename"],
        inputTemplate: {binding: "$binding", namebaseId: "$namebaseId", rename: "$renameOptions"}
      })
    ]
  }),
  recipe({
    recipeId: "scenario.publish-map",
    title: "检查、整理并发布地图",
    domain: "editor",
    intent: "检查健康与对象一致性，整理图层和主题，再导出数据、图片和说明。",
    preconditions: ["地图和 WebGL 运行时已经就绪。", "导出目标与显示主题由调用方明确选择。"],
    successCriteria: ["健康、运行时和地图摘要已读取。", "地图数据、图片及能力说明可由公开 API 获取。"],
    steps: [
      factStep("health-check", {
        facts: ["info.mapSummary", "info.runtimeStats", "info.healthEvents"],
        inspection: ["info.describe"],
        executeMethods: ["info.mapSummary", "info.runtimeStats", "info.healthEvents"],
        inputTemplate: {method: "info.healthEvents", options: {severity: "error"}}
      }),
      serviceStep("layers-and-themes", {
        facts: ["layers.get", "layers.listThemes"],
        inspection: ["info.describe"],
        executeMethods: ["layers.setViewMode", "layers.setVisible", "layers.setTheme"],
        inputTemplate: {
          previousDisplayPreferences: "$layers.get",
          viewMode: "$selectedViewMode",
          visibilityChanges: "$layerVisibilityChanges",
          themeId: "$selectedThemeId"
        },
        successCriteria: [
          "视图模式、图层可见性和主题与发布目标一致。",
          "这些调用只修改显示偏好，不增加 map revision 或地图编辑历史。"
        ],
        compensation: {
          mode: "restore-display-preferences",
          method: null,
          methods: ["layers.setViewMode", "layers.setVisible", "layers.setTheme"],
          guard: "仅当执行 ledger 的 stepId 精确等于 layers-and-themes、当前 revision 精确等于 ledger.afterRevision，并且本步骤 facts 已保存原显示值时恢复；地图 identity 变化或缺少原值时禁止自动恢复。"
        }
      }),
      serviceStep("data-export", {
        facts: ["info.mapSummary"],
        inspection: ["info.describe"],
        executeMethods: ["data.exportMap", "data.exportPNG"],
        inputTemplate: {method: "$selectedExportMethod", options: "$exportOptions"}
      }),
      factStep("gameplay-documentation", {
        facts: ["info.capabilities", "planner.listRecipes", "planner.getRecipe"],
        inspection: ["info.describe"],
        executeMethods: ["info.capabilities", "planner.listRecipes", "planner.getRecipe"],
        inputTemplate: {recipeId: "$optionalRecipeId"}
      })
    ]
  })
];

const VALIDATION = validateRawRecipes(RAW_RECIPES);
if (!VALIDATION.valid) throw new Error(`AI 规划器配方 registry 无效：${JSON.stringify(VALIDATION)}`);
const RECIPE_ROWS = deepFreeze(RAW_RECIPES.map(item => normalizeRecipe(item)));
const RECIPE_BY_ID = new Map(RECIPE_ROWS.map(item => [item.recipeId, item]));

export function listPlannerRecipes() {
  return cloneJson(RECIPE_ROWS.map(recipe => ({
    schemaVersion: recipe.schemaVersion,
    recipeId: recipe.recipeId,
    title: recipe.title,
    domain: recipe.domain,
    intent: recipe.intent,
    stepIds: recipe.steps.map(step => step.stepId),
    stepCount: recipe.steps.length,
    historyPolicy: recipe.historyPolicy
  })));
}

export function getPlannerRecipe(recipeId) {
  const normalizedId = String(recipeId || "").trim();
  const recipe = RECIPE_BY_ID.get(normalizedId);
  if (!recipe) {
    const error = new Error(`未知 AI 规划器配方：${normalizedId || "(empty)"}`);
    error.code = "recipe-not-found";
    throw error;
  }
  return cloneJson(recipe);
}

export function validatePlannerRecipeRegistry(publicMethods = null) {
  const raw = validateRawRecipes(RAW_RECIPES);
  const allowed = publicMethods ? new Set(publicMethods) : null;
  const methodRefs = collectMethodRefs(RECIPE_ROWS);
  const unknownMethods = allowed ? [...new Set(methodRefs.filter(method => !allowed.has(method)))].sort() : [];
  return {
    valid: raw.valid && unknownMethods.length === 0,
    recipeCount: RECIPE_ROWS.length,
    stepCount: RECIPE_ROWS.reduce((sum, recipe) => sum + recipe.steps.length, 0),
    recipeIds: RECIPE_ROWS.map(recipe => recipe.recipeId),
    rawDuplicateRecipeIds: raw.rawDuplicateRecipeIds,
    rawDuplicateStepIds: raw.rawDuplicateStepIds,
    invalidFields: raw.invalidFields,
    placeholderMethods: raw.placeholderMethods,
    unknownMethods,
    methodRefs: [...new Set(methodRefs)].sort()
  };
}

function recipe(options) {
  return {
    historyPolicy: "每个规则动作独立提交；配方不承诺跨步骤原子性，也不自动撤回已提交步骤。",
    compatibilityPolicy: "配方只引用稳定公开方法，不写入地图存档，不依赖 UI DOM 或内部对象。",
    failurePolicy: {
      rejected: "停止当前步骤并根据稳定 business code 重规划。",
      stale: "重新读取事实与 revision，再调用当前步骤 inspector。",
      committed: "保留此前已提交步骤，除非用户明确授权并满足补偿 guard。"
    },
    ...options
  };
}

function ruleStep(stepId, actionId, options) {
  return createStep(stepId, "rule", {...options, actionId});
}

function serviceStep(stepId, options) {
  return createStep(stepId, "service", options);
}

function factStep(stepId, options) {
  return createStep(stepId, "fact", options);
}

function createStep(stepId, kind, options = {}) {
  const facts = options.facts || [];
  const successCriteria = options.successCriteria || [
    SUCCESS_BY_ACTION[options.actionId] || SUCCESS_BY_STEP[stepId] || ""
  ];
  const readableSuccess = facts.length
    ? `通过 ${facts[0]} 重读并验证上述领域结果。`
    : "";
  return {
    stepId,
    kind,
    actionId: options.actionId || null,
    spatialActionId: options.spatialActionId || null,
    facts,
    inspection: {
      methods: options.inspection || [],
      policy: "使用当前事实输入调用精确公开方法；若只有 info.describe，则按公开方法契约完成结构预检。"
    },
    executeMethods: options.executeMethods || [],
    inputTemplate: options.inputTemplate || {},
    preconditions: options.preconditions || ["读取当前事实并确认目标仍存在。", "使用当前 map revision 生成步骤输入。"],
    authorization: options.authorization || {
      mode: "per-method-policy",
      policy: "逐个读取 info.describe；requiresConfirm 为 true 时必须在该步骤暂停并取得显式授权。"
    },
    successCriteria: [...successCriteria, readableSuccess].filter(Boolean),
    failurePolicy: options.failurePolicy || {
      rejected: "停止并按稳定 business code 重规划。",
      stale: "丢弃旧输入，刷新事实后重新预检。",
      partial: "不把已提交步骤伪装成整体回滚。"
    },
    compensation: options.compensation || {
      mode: kind === "rule" ? "history-undo" : "none",
      method: kind === "rule" ? "history.undo" : null,
      guard: kind === "rule"
        ? `仅当执行 ledger 的 stepId 精确等于 ${stepId}、当前 revision 精确等于 ledger.afterRevision、该步骤仍是最新一条历史、地图 identity 未变化且用户明确授权撤销时调用。`
        : "只读或导出步骤没有地图写入，不调用补偿方法。"
    },
    revisionCheckpoints: options.revisionCheckpoints || [
      "before-facts",
      "after-inspection",
      "before-execution",
      "after-each-commit"
    ]
  };
}

function noAutomaticCompensation(guard) {
  return {mode: "none", method: null, guard};
}

function normalizeRecipe(recipe) {
  return {
    schemaVersion: PLANNER_RECIPE_SCHEMA_VERSION,
    ...recipe,
    steps: recipe.steps.map(step => cloneJson(step))
  };
}

function validateRawRecipes(recipes) {
  const rawDuplicateRecipeIds = duplicates(recipes.map(recipe => recipe.recipeId));
  const rawDuplicateStepIds = [];
  const invalidFields = [];
  const placeholderMethods = [];
  for (const recipe of recipes) {
    const duplicateSteps = duplicates(recipe.steps.map(step => step.stepId));
    for (const stepId of duplicateSteps) rawDuplicateStepIds.push(`${recipe.recipeId}:${stepId}`);
    if (!recipe.recipeId || !recipe.title || !recipe.domain || !recipe.intent) invalidFields.push(`${recipe.recipeId || "(empty)"}:recipe`);
    if (!Array.isArray(recipe.preconditions) || !recipe.preconditions.length) invalidFields.push(`${recipe.recipeId}:preconditions`);
    if (!Array.isArray(recipe.successCriteria) || !recipe.successCriteria.length) invalidFields.push(`${recipe.recipeId}:successCriteria`);
    for (const step of recipe.steps) {
      const prefix = `${recipe.recipeId}:${step.stepId || "(empty)"}`;
      if (!step.stepId || !["rule", "service", "fact"].includes(step.kind)) invalidFields.push(`${prefix}:identity`);
      if (step.kind === "rule" && !step.actionId) invalidFields.push(`${prefix}:actionId`);
      if (step.kind !== "rule" && step.actionId) invalidFields.push(`${prefix}:unexpected-actionId`);
      if (step.inspection?.methods?.includes("cells.inspectAction")) {
        if (!step.spatialActionId) invalidFields.push(`${prefix}:spatialActionId`);
        if (step.inputTemplate?.actionId !== step.spatialActionId) invalidFields.push(`${prefix}:spatialActionId-input-mismatch`);
      } else if (step.spatialActionId) invalidFields.push(`${prefix}:unexpected-spatialActionId`);
      for (const field of ["facts", "executeMethods", "preconditions", "successCriteria", "revisionCheckpoints"]) {
        if (!Array.isArray(step[field]) || !step[field].length) invalidFields.push(`${prefix}:${field}`);
      }
      if (!step.inspection || !Array.isArray(step.inspection.methods) || !step.inspection.methods.length) invalidFields.push(`${prefix}:inspection`);
      if (!step.inputTemplate || typeof step.inputTemplate !== "object") invalidFields.push(`${prefix}:inputTemplate`);
      if (!step.authorization?.mode || !step.authorization?.policy) invalidFields.push(`${prefix}:authorization`);
      if (!step.failurePolicy?.rejected || !step.failurePolicy?.stale || !step.failurePolicy?.partial) invalidFields.push(`${prefix}:failurePolicy`);
      if (!step.compensation?.mode || !step.compensation?.guard) invalidFields.push(`${prefix}:compensation`);
      if (!step.successCriteria.some(item => step.facts.some(method => item.includes(method)))) {
        invalidFields.push(`${prefix}:successCriteria-not-rereadable`);
      }
      if (step.successCriteria.length < 2) invalidFields.push(`${prefix}:successCriteria-not-domain-specific`);
      if (step.successCriteria.some(item => /公开调用返回成功包络|提交后重新读取事实与 revision/u.test(item))) {
        invalidFields.push(`${prefix}:successCriteria-placeholder`);
      }
      if ((step.compensation?.method || step.compensation?.methods?.length)
        && (!step.compensation.guard.includes(`stepId 精确等于 ${step.stepId}`)
          || !step.compensation.guard.includes("当前 revision 精确等于 ledger.afterRevision"))) {
        invalidFields.push(`${prefix}:compensation-ledger-guard`);
      }
      for (const method of stepMethodRefs(step)) if (!isExactPublicMethod(method)) placeholderMethods.push(`${prefix}:${method}`);
    }
  }
  if (recipes.map(recipe => recipe.recipeId).join("\n") !== EXPECTED_RECIPE_IDS.join("\n")) invalidFields.push("recipe-order");
  return {
    valid: !rawDuplicateRecipeIds.length && !rawDuplicateStepIds.length && !invalidFields.length && !placeholderMethods.length,
    rawDuplicateRecipeIds,
    rawDuplicateStepIds,
    invalidFields,
    placeholderMethods
  };
}

function collectMethodRefs(recipes) {
  return recipes.flatMap(recipe => recipe.steps.flatMap(step => stepMethodRefs(step)));
}

function stepMethodRefs(step) {
  return [
    ...(step.facts || []),
    ...(step.inspection?.methods || []),
    ...(step.executeMethods || []),
    ...(step.compensation?.method ? [step.compensation.method] : []),
    ...(step.compensation?.methods || [])
  ];
}

function isExactPublicMethod(method) {
  return /^[a-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9.]*$/u.test(String(method || ""))
    && !String(method).includes("*")
    && !String(method).startsWith("planned:")
    && !String(method).startsWith("service:");
}

function duplicates(values) {
  const seen = new Set();
  const result = new Set();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    seen.add(value);
  }
  return [...result].sort();
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
