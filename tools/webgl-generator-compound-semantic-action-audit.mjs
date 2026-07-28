#!/usr/bin/env node
import {createHash} from "node:crypto";
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {listCellActions} from "../app/webgl-generator/src/runtime/cell-action-inspector-registry.js";
import {listPlannerRecipes, getPlannerRecipe, validatePlannerRecipeRegistry} from "../app/webgl-generator/src/runtime/planner-recipe-registry.js";
import {buildPlannerRecipeDocSyncReport} from "./webgl-generator-planner-recipe-doc-sync.mjs";
import {buildFullCapabilityMatrix} from "./webgl-generator-api-full-capability-matrix.mjs";
import {buildCellActionReplanningMatrix} from "./webgl-generator-cell-action-replanning-matrix.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUTPUT_JSON = join(REPO_ROOT, "docs", "audits", "compound-semantic-action-matrix.json");
const OUTPUT_MD = join(REPO_ROOT, "docs", "audits", "compound-semantic-action-matrix.md");

const STATUS = new Set([
  "existing-transaction",
  "existing-needs-inspector",
  "fragmented-needs-transaction",
  "missing-game-rule",
  "recipe-only",
  "executable-recipe"
]);

const TIER = new Set(["rule-transaction", "planner-recipe"]);
const DOMAIN = new Set([
  "world",
  "terrain",
  "ecology",
  "politics",
  "settlement",
  "society",
  "infrastructure",
  "economy",
  "diplomacy",
  "military",
  "editor"
]);

const DOMAIN_RULES = Object.freeze({
  world: {
    chapter: "世界创建、存档与重算",
    invariant: "换图、导入和跨系统重算必须原子替换地图，失败不得污染当前地图、历史或运行时引用。"
  },
  terrain: {
    chapter: "地形、水文与 Feature",
    invariant: "Grid/Pack、高度、水陆 Feature、河湖、海岸和下游派生必须在事务结束时一致。"
  },
  ecology: {
    chapter: "气候、生态与人口承载",
    invariant: "气候、生物群系、适居度和人口承载的直接值与派生值必须有明确的重算边界。"
  },
  politics: {
    chapter: "国家、省份与政治拓扑",
    invariant: "国家、省份、Grid/Pack 归属、首都、省会、外交、军事、市场和路线引用不得悬空。"
  },
  settlement: {
    chapter: "城镇、人口与定居点",
    invariant: "城镇位置、国家/省份归属、首都/省会、港口、路线和人口统计必须同步。"
  },
  society: {
    chapter: "文化、宗教、命名与社会归属",
    invariant: "文化/宗教中心、继承关系、Cell 归属、对象引用和名称库绑定不得形成无主或循环数据。"
  },
  infrastructure: {
    chapter: "路线、区域与资源设施",
    invariant: "路径、端点、Cell 链、对象归属和资源引用必须保持可定位、可撤销且无悬空目标。"
  },
  economy: {
    chapter: "市场、资源与经济链",
    invariant: "市场归属、资源供给、贸易关系和统计摘要必须基于同一批已提交地图状态。"
  },
  diplomacy: {
    chapter: "外交、战争与国家关系",
    invariant: "双边关系、宗藩、战争、纪事和被移除国家引用必须成对同步并保持对称规则。"
  },
  military: {
    chapter: "军队、调动与战斗",
    invariant: "军团身份、所属国家、驻地、基地、命令、事件链和国家存亡必须保持引用完整。"
  },
  editor: {
    chapter: "编辑器事务、批量操作与发布",
    invariant: "编辑器服务不得伪装成游戏规则；危险操作要有预检，批量操作要有单事务回滚。"
  }
});

const REGENERATION_VARIANTS = Object.freeze([
  "features",
  "routes",
  "rivers",
  "cities:all",
  "cities:state",
  "cities:province",
  "states",
  "provinces:all",
  "provinces:state",
  "markers",
  "diplomacy",
  "religions",
  "military",
  "zones"
]);

const RULE_ACTIONS = Object.freeze([
  rule({
    id: "world.create",
    title: "创建或换种子生成完整世界",
    domain: "world",
    status: "existing-transaction",
    intent: "从生成选项创建一张新地图，或换种子重建整张地图。",
    variants: ["new-map", "reroll-seed"],
    api: ["generate.getOptions", "generate.setOptions", "generate.newMap", "generate.rerollSeed"],
    inspect: "generate.getOptions",
    execute: "generate.newMap / generate.rerollSeed",
    branches: ["参数非法时拒绝", "生成成功时换 mapIdentity", "生成失败时保留旧地图"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js"]
  }),
  rule({
    id: "world.regenerate-system",
    title: "按领域或政治范围受约束重生成",
    domain: "world",
    status: "existing-transaction",
    intent: "只重建指定系统，同时维护依赖、范围外对象和单条历史。",
    variants: REGENERATION_VARIANTS,
    api: ["generate.regenerate"],
    inspect: "info.describe(generate.regenerate)",
    execute: "generate.regenerate",
    branches: ["cities 支持全图/国家/省份", "provinces 支持全图/国家", "未知目标拒绝"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "tools/webgl-generator-map-snapshot-transaction-regression.mjs"]
  }),
  rule({
    id: "world.import-map",
    title: "导入完整地图并迁移旧数据",
    domain: "world",
    status: "existing-transaction",
    intent: "导入 JSON、gzip 或浏览器信封中的地图，完成迁移、校验和原子换图。",
    variants: ["plain-json", "gzip", "base64-envelope", "legacy-map"],
    api: ["data.importMap"],
    inspect: "data.exportImportDiagnostic",
    execute: "data.importMap",
    branches: ["旧版本迁移", "诊断拒绝", "换图成功", "故障恢复旧图"],
    sourceRefs: ["app/webgl-generator/src/runtime/map-file-io.js", "app/webgl-generator/src/runtime/app.js"]
  }),
  rule({
    id: "world.import-geo",
    title: "用 FMG Cells GEO 重置地图数据",
    domain: "world",
    status: "existing-transaction",
    intent: "以 GEO 中的数据为准重建地图，清除 GEO 未包含的旧残留。",
    api: ["data.importGEO"],
    inspect: "data.exportImportDiagnostic",
    execute: "data.importGEO",
    branches: ["格式拒绝", "高度与 Feature 重建", "清除非 GEO 数据", "完整回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/fmg-cells-geojson-import.js", "app/webgl-generator/src/runtime/app.js"]
  }),
  rule({
    id: "world.import-heightmap",
    title: "导入高度图并重建世界",
    domain: "world",
    status: "existing-transaction",
    intent: "把图片高度转换为地图高度，并在一条换图事务中重建下游世界。",
    api: ["data.importHeightmap"],
    inspect: "planned:edit.height.inspectHeightmapImport",
    execute: "data.importHeightmap",
    branches: ["图片解码失败", "尺寸/值域归一", "下游重建", "完整回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "docs/task-notes/heightmap-image-converter-plan.md"]
  }),
  rule({
    id: "world.restore-browser-map",
    title: "恢复浏览器存档并迁移",
    domain: "world",
    status: "existing-transaction",
    intent: "从浏览器缓存恢复地图，同时处理旧版本、损坏数据和运行时重建。",
    api: ["data.restoreBrowserMap"],
    inspect: "data.exportImportDiagnostic",
    execute: "data.restoreBrowserMap",
    branches: ["无存档", "旧版迁移", "损坏拒绝", "原子换图"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "tools/webgl-generator-browser-storage-backward-compatibility-regression.mjs"]
  }),
  rule({
    id: "world.apply-climate-and-rebuild",
    title: "修改气候并选择性重建下游世界",
    domain: "ecology",
    status: "existing-transaction",
    intent: "调整纬度、温度、降水或风带，并明确是否重算生态与社会系统。",
    variants: ["latitude", "longitude-range", "temperature", "precipitation", "wind", "combined"],
    api: [
      "climate.apply",
      "climate.setLatitude",
      "climate.setLatitudeRange",
      "climate.setLongitudeRange",
      "climate.setTemperature",
      "climate.setPrecipitation",
      "climate.setWind",
      "climate.inspectDownstreamRebuild",
      "climate.applyDownstreamRebuild"
    ],
    inspect: "climate.inspectDownstreamRebuild",
    execute: "climate.apply / climate.applyDownstreamRebuild",
    branches: ["仅改参数", "基础气候重算", "完整下游重建", "busy/obsolete 拒绝"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "tools/webgl-generator-climate-downstream-rebuild-regression.mjs"]
  }),
  rule({
    id: "world.rebuild-from-ocean-currents",
    title: "修改洋流并重建关联世界",
    domain: "ecology",
    status: "existing-transaction",
    intent: "重生成洋流，选择仅更新洋流或继续重算气候、河流、生态与社会。",
    variants: ["currents-only", "world-rebuild", "cancel"],
    api: [
      "oceanCurrents.regenerate",
      "oceanCurrents.inspectWorldRebuild",
      "oceanCurrents.rebuildWorld",
      "oceanCurrents.cancelWorldRebuild"
    ],
    inspect: "oceanCurrents.inspectWorldRebuild",
    execute: "oceanCurrents.regenerate / oceanCurrents.rebuildWorld",
    branches: ["仅洋流", "完整世界事务", "取消", "过期任务不得提交"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "app/webgl-generator/src/runtime/ocean-current-edit-commands.js"]
  }),
  rule({
    id: "terrain.reset-seafloor",
    title: "重设海底并保护陆地与湖泊",
    domain: "terrain",
    status: "existing-transaction",
    intent: "重新生成海底高度，同时保护陆地、湖泊和已冻结的水陆拓扑。",
    api: ["edit.height.inspectSeafloorReset", "edit.height.applySeafloorReset"],
    inspect: "edit.height.inspectSeafloorReset",
    execute: "edit.height.applySeafloorReset",
    branches: ["预检保护对象", "令牌陈旧", "海底更新", "下游重算与回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/seafloor-reset.js"]
  }),
  rule({
    id: "terrain.rebuild-height-derived",
    title: "按层级重建高度派生系统",
    domain: "terrain",
    status: "existing-transaction",
    intent: "在高度编辑后重建基础、下游或全部派生系统。",
    variants: ["base", "downstream", "all"],
    api: ["edit.height.rebuildBaseDerived", "edit.height.rebuildDownstreamDerived", "edit.height.rebuildAllDerived"],
    inspect: "planned:edit.height.inspectDerivedRebuild",
    execute: "edit.height.rebuildBaseDerived / rebuildDownstreamDerived / rebuildAllDerived",
    branches: ["无待更新时 no-op", "按层级重建", "失败完整回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/height-derived-rebuild.js", "app/webgl-generator/src/runtime/app.js"]
  }),
  rule({
    id: "terrain.edit-height-region",
    title: "编辑区域高度并维护海陆边界",
    domain: "terrain",
    status: "existing-transaction",
    intent: "按 Cell 集、范围或画笔修改高度，并明确是否影响海底及哪些派生系统待更新。",
    variants: ["raise", "lower", "level", "range-transform"],
    api: ["edit.height.inspectChanges", "edit.height.applyChanges", "edit.height.inspectRangeTransform", "edit.height.applyRangeTransform"],
    inspect: "edit.height.inspectChanges / edit.height.inspectRangeTransform",
    execute: "edit.height.applyChanges / edit.height.applyRangeTransform",
    branches: ["水陆跨阈值", "保护对象", "影响海底", "派生系统标脏"],
    sourceRefs: ["app/webgl-generator/src/runtime/height-edit-commands.js", "app/webgl-generator/src/runtime/height-brush.js"]
  }),
  rule({
    id: "terrain.apply-height-program",
    title: "应用地形模板或多步骤高度程序",
    domain: "terrain",
    status: "existing-transaction",
    intent: "把模板或多步骤程序应用到全图或选区，并保持步骤整体原子。",
    variants: ["global-transform", "template", "program"],
    api: [
      "edit.height.inspectGlobalTransform",
      "edit.height.applyGlobalTransform",
      "edit.height.inspectTerrainTemplate",
      "edit.height.applyTerrainTemplate",
      "edit.height.inspectTerrainProgram",
      "edit.height.applyTerrainProgram"
    ],
    inspect: "对应 inspect 方法",
    execute: "对应 apply 方法",
    branches: ["程序解析失败", "选区为空", "多步骤成功", "任一步失败整体回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/height-terrain-template-programs.js", "docs/task-notes/height-terrain-template-programs.md"]
  }),
  rule({
    id: "terrain.smooth-selection",
    title: "平滑选区并保护边缘",
    domain: "terrain",
    status: "existing-transaction",
    intent: "对选中 Cell 做受控平滑，维护羽化、海陆保护和单事务。",
    api: ["edit.height.inspectSelectionSmoothing", "edit.height.applySelectionSmoothing"],
    inspect: "edit.height.inspectSelectionSmoothing",
    execute: "edit.height.applySelectionSmoothing",
    branches: ["选区为空", "海陆保护", "羽化边缘", "失败回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/height-selection-smoothing.js"]
  }),
  rule({
    id: "terrain.patch-feature",
    title: "局部修正水陆 Feature",
    domain: "terrain",
    status: "existing-transaction",
    intent: "在局部 Cell 集修正水陆状态，并同步高度、Feature、对象保护和派生链。",
    api: ["edit.features.inspectPatch", "edit.features.applyPatch"],
    inspect: "edit.features.inspectPatch",
    execute: "edit.features.applyPatch",
    branches: ["对象保护阻断", "局部填海/开水", "Feature 重建", "完整回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/lake-edit-commands.js", "docs/task-notes/coastline-feature-topology-product-rules.md"]
  }),
  rule({
    id: "terrain.change-feature-topology",
    title: "开闭海峡、开渠或合并分裂水陆 Feature",
    domain: "terrain",
    status: "existing-transaction",
    intent: "改变水陆连通关系，同时保护沿岸对象、河口、道路和 Feature 身份。",
    variants: ["open-strait", "close-strait", "connect-lake-sea", "fill-lake", "split", "merge"],
    api: ["edit.features.inspectTopology", "edit.features.applyTopology"],
    inspect: "edit.features.inspectTopology",
    execute: "edit.features.applyTopology",
    branches: ["连通性变化", "保护对象阻断", "Feature ID 墓碑/新建", "下游标脏"],
    sourceRefs: ["app/webgl-generator/src/runtime/feature-topology-edit-commands.js", "docs/task-notes/coastline-feature-topology-product-rules.md"]
  }),
  rule({
    id: "hydrology.create-river",
    title: "从源 Cell 创建河流并接入水文",
    domain: "terrain",
    status: "existing-transaction",
    intent: "选择合法源点创建河流，解析下游路径、河口和统计。",
    api: ["edit.rivers.inspectCreate", "edit.rivers.create"],
    inspect: "edit.rivers.inspectCreate",
    execute: "edit.rivers.create",
    branches: ["源点非法", "无下游路径", "汇流/河口", "创建成功"],
    sourceRefs: ["app/webgl-generator/src/runtime/river-edit-commands.js"]
  }),
  rule({
    id: "hydrology.delete-river",
    title: "删除河流并修复湖泊出口和引用",
    domain: "terrain",
    status: "existing-transaction",
    intent: "删除河流，检查湖泊出口、路线/备注和其它依赖。",
    api: ["edit.rivers.inspectDelete", "edit.rivers.delete"],
    inspect: "edit.rivers.inspectDelete",
    execute: "edit.rivers.delete",
    branches: ["依赖预检", "确认", "出口清理", "撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/river-edit-commands.js", "app/webgl-generator/src/runtime/delete-impact.js"]
  }),
  rule({
    id: "hydrology.excavate-lake",
    title: "开挖湖泊并重建局部水陆",
    domain: "terrain",
    status: "existing-transaction",
    intent: "以 Cell 和半径开挖湖泊，处理高度、Feature、对象保护和出口。",
    api: ["edit.lakes.inspectCreate", "edit.lakes.create"],
    inspect: "edit.lakes.inspectCreate",
    execute: "edit.lakes.create",
    branches: ["半径/落点非法", "对象保护", "局部水陆修改", "湖泊创建"],
    sourceRefs: ["app/webgl-generator/src/runtime/lake-edit-commands.js"]
  }),
  rule({
    id: "hydrology.change-lake-outlet",
    title: "设置或清除湖泊出口河流",
    domain: "terrain",
    status: "existing-transaction",
    intent: "验证湖泊与河流关系后设置出口，并修复水文引用。",
    api: ["edit.lakes.inspectOutlet", "edit.lakes.setOutlet"],
    inspect: "edit.lakes.inspectOutlet",
    execute: "edit.lakes.setOutlet",
    branches: ["湖/河不存在", "循环或不连通", "设置", "清除"],
    sourceRefs: ["app/webgl-generator/src/runtime/lake-edit-commands.js"]
  }),
  rule({
    id: "hydrology.delete-lake",
    title: "删除湖泊并处理水陆及出口依赖",
    domain: "terrain",
    status: "existing-transaction",
    intent: "删除湖泊对象，明确是仅删对象还是填平水体，并清理依赖。",
    api: ["edit.lakes.inspectDelete", "edit.lakes.delete"],
    inspect: "edit.lakes.inspectDelete",
    execute: "edit.lakes.delete",
    branches: ["依赖预检", "仅删除档案/填平语义", "出口清理", "撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/lake-edit-commands.js", "app/webgl-generator/src/runtime/delete-impact.js"]
  }),
  rule({
    id: "ecology.assign-biome",
    title: "给区域分配生物群系",
    domain: "ecology",
    status: "existing-transaction",
    intent: "按 Grid Cell 集分配生物群系，并报告气候或水陆不适配。",
    api: ["edit.biomes.inspectAssignment", "edit.biomes.assignCells"],
    inspect: "edit.biomes.inspectAssignment",
    execute: "edit.biomes.assignCells",
    branches: ["目标群系非法", "水陆不匹配 warning", "应用", "统计同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/biome-edit-commands.js"]
  }),
  rule({
    id: "ecology.adjust-suitability",
    title: "调整区域数值适居度并同步承载",
    domain: "ecology",
    status: "existing-transaction",
    intent: "调整基础适居度或覆盖值，维护人口承载和旧图兼容。",
    api: ["edit.biomes.inspectSuitability", "edit.biomes.applySuitability"],
    inspect: "edit.biomes.inspectSuitability",
    execute: "edit.biomes.applySuitability",
    branches: ["水域/非法值", "基础值与 override", "人口承载", "撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/suitability-edit-commands.js", "docs/task-notes/suitability-brush-product-rules.md"]
  }),
  rule({
    id: "politics.create-state",
    title: "在 Cell 创建国家、省份和首都链",
    domain: "politics",
    status: "existing-transaction",
    intent: "在合法陆地创建国家，同时创建首省、复用或创建首都并同步政治镜像。",
    api: ["edit.states.add", "edit.states.inspectCreateAtCell", "edit.states.createAtCell"],
    inspect: "edit.states.inspectCreateAtCell",
    execute: "edit.states.createAtCell",
    branches: ["Cell 非法/水域", "首都省保护", "复用城镇/创建城镇", "稀疏 ID 扩容"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-edit-commands.js", "docs/task-notes/cell-diagnostics-and-ai-api-design.md"]
  }),
  rule({
    id: "politics.delete-state",
    title: "删除国家并处理全部依赖",
    domain: "politics",
    status: "existing-transaction",
    intent: "删除国家，明确处理领土、省份、城镇、外交、军事、市场和历史引用。",
    api: ["edit.states.inspectDelete", "edit.states.delete"],
    inspect: "edit.states.inspectDelete",
    execute: "edit.states.delete",
    branches: ["中立/不存在拒绝", "影响预检", "确认", "级联清理与撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-edit-commands.js", "app/webgl-generator/src/runtime/delete-impact.js"]
  }),
  rule({
    id: "politics.merge-states",
    title: "完整合并国家",
    domain: "politics",
    status: "existing-transaction",
    intent: "把被合并国完整并入保留国，重建省份并同步外交、军事、市场和路线。",
    api: ["edit.states.inspectMerge", "edit.states.merge"],
    inspect: "edit.states.inspectMerge",
    execute: "edit.states.merge",
    branches: ["国家无效/不邻接", "首都继承", "省份重建", "被合并国墓碑化"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-topology-commands.js", "docs/task-notes/state-merge-split-product-rules.md"]
  }),
  rule({
    id: "politics.split-state",
    title: "按完整省份拆分国家",
    domain: "politics",
    status: "existing-transaction",
    intent: "选择完整旧省份和新首都拆出国家，修复原国家首都及全部跨域引用。",
    api: ["edit.states.inspectSplit", "edit.states.split"],
    inspect: "edit.states.inspectSplit",
    execute: "edit.states.split",
    branches: ["省份选择非法", "两侧连通/城镇检查", "双首都确定", "外交军事初始化"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-topology-commands.js", "docs/task-notes/state-merge-split-product-rules.md"]
  }),
  rule({
    id: "politics.transfer-territory",
    title: "征服、割让或中立化 Cell/区域",
    domain: "politics",
    status: "existing-transaction",
    intent: "把一个或多个 Cell 从原国家转给目标国家，并按省份策略处理；若原国家失去最后领土则触发完整灭国。",
    variants: ["conquer", "cede", "neutralize", "annex-last-cell"],
    api: ["edit.states.inspectTerritoryTransfer", "edit.states.transferTerritory"],
    inspect: "edit.states.inspectTerritoryTransfer",
    execute: "edit.states.transferTerritory",
    branches: [
      "攻击国/来源国/Cell 非法",
      "指定省份存在且属于目标国",
      "指定省份不存在时确保创建",
      "原国家仍有领土时修复首都/省会",
      "原国家最后领土时完整墓碑化并清理引用"
    ],
    sourceRefs: ["app/webgl-generator/src/runtime/state-edit-commands.js", "app/webgl-generator/src/runtime/state-topology-commands.js"]
  }),
  rule({
    id: "politics.ensure-province-assignment",
    title: "确保省份存在并分配 Cell",
    domain: "politics",
    status: "existing-transaction",
    intent: "把 Cell 分给已有省份；若明确要求的省份不存在，则在合法 ID/命名策略下创建后分配。",
    variants: ["auto", "existing", "ensure"],
    api: ["edit.provinces.inspectEnsureAssignment", "edit.provinces.ensureAssignment"],
    inspect: "edit.provinces.inspectEnsureAssignment",
    execute: "edit.provinces.ensureAssignment",
    branches: ["自动选择相邻/最大省份", "已有省份归属校验", "缺失省份创建", "稀疏 ID/Uint16 容量"],
    sourceRefs: ["app/webgl-generator/src/runtime/province-edit-commands.js", "app/webgl-generator/src/runtime/state-edit-commands.js"]
  }),
  rule({
    id: "politics.transfer-province",
    title: "整省转移给另一国家",
    domain: "politics",
    status: "existing-transaction",
    intent: "把完整省份及其 Cell、城镇和省会转给目标国家，并修复双方统计、首都和引用。",
    api: ["edit.provinces.inspectTransfer", "edit.provinces.transfer"],
    inspect: "edit.provinces.inspectTransfer",
    execute: "edit.provinces.transfer",
    branches: ["省份/国家非法", "首都省保护", "来源国失去最后领土", "目标国接收"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-edit-commands.js", "app/webgl-generator/src/runtime/province-edit-commands.js"]
  }),
  rule({
    id: "politics.reorganize-provinces",
    title: "按国家重设行政区划",
    domain: "politics",
    status: "existing-transaction",
    intent: "保留国家与范围外对象，墓碑化目标旧省并生成新的连通省份。",
    variants: ["all-states", "one-state"],
    api: ["generate.regenerate"],
    inspect: "planned:edit.provinces.inspectRegeneration",
    execute: "generate.regenerate(provinces)",
    branches: ["全图", "指定国家", "城市/省会不足", "旧省墓碑化"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-topology-commands.js", "app/webgl-generator/src/runtime/app.js"]
  }),
  rule({
    id: "politics.create-province",
    title: "在国家内创建省份",
    domain: "politics",
    status: "existing-transaction",
    intent: "在已有国家的合法 Cell 创建省份，确定省会并同步国家省份列表。",
    api: ["edit.provinces.add", "edit.provinces.inspectCreateAtCell", "edit.provinces.createAtCell"],
    inspect: "edit.provinces.inspectCreateAtCell",
    execute: "edit.provinces.createAtCell",
    branches: ["Cell/国家非法", "生成名称", "选择省会", "初始领土扩张"],
    sourceRefs: ["app/webgl-generator/src/runtime/province-edit-commands.js", "docs/task-notes/cell-diagnostics-and-ai-api-design.md"]
  }),
  rule({
    id: "politics.delete-province",
    title: "删除省份并处理城镇与国家列表",
    domain: "politics",
    status: "existing-transaction",
    intent: "删除省份，清除或重新分配领土与城镇，维护国家省份列表。",
    api: ["edit.provinces.inspectDelete", "edit.provinces.delete"],
    inspect: "edit.provinces.inspectDelete",
    execute: "edit.provinces.delete",
    branches: ["中立/不存在", "首都/省会影响", "确认", "清理或重新分配"],
    sourceRefs: ["app/webgl-generator/src/runtime/province-edit-commands.js", "app/webgl-generator/src/runtime/delete-impact.js"]
  }),
  rule({
    id: "politics.merge-provinces",
    title: "合并同一国家内的省份",
    domain: "politics",
    status: "existing-transaction",
    intent: "把多个同国相邻省份合并，保留一个身份或创建新身份，并确定省会。",
    api: ["edit.provinces.inspectMerge", "edit.provinces.merge"],
    inspect: "edit.provinces.inspectMerge",
    execute: "edit.provinces.merge",
    branches: ["必须同国相邻", "省会选择", "旧省墓碑化", "城镇归属同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/province-edit-commands.js", "app/webgl-generator/src/runtime/state-topology-commands.js"]
  }),
  rule({
    id: "politics.split-province",
    title: "拆分省份",
    domain: "politics",
    status: "existing-transaction",
    intent: "按连通 Cell 集或城镇锚点拆分省份，并为两侧确定省会。",
    api: ["edit.provinces.inspectSplit", "edit.provinces.split"],
    inspect: "edit.provinces.inspectSplit",
    execute: "edit.provinces.split",
    branches: ["两侧必须连通", "两侧需要合法中心", "新 ID 分配", "城镇同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/province-edit-commands.js"]
  }),
  rule({
    id: "politics.change-government",
    title: "调整政体与合法国号后缀",
    domain: "politics",
    status: "existing-transaction",
    intent: "调整国家政体和允许的国号后缀，并同步完整国名和政治镜像。",
    variants: ["single", "batch"],
    api: ["edit.states.setGovernment", "edit.states.setGovernmentBatch"],
    inspect: "info.describe(edit.states.setGovernment)",
    execute: "edit.states.setGovernment / setGovernmentBatch",
    branches: ["政体非法", "后缀不兼容", "单国", "批量"],
    sourceRefs: ["app/webgl-generator/src/runtime/state-edit-commands.js", "app/webgl-generator/src/generator/governments.js"]
  }),
  rule({
    id: "politics.relocate-capital",
    title: "迁都并更新国家中心",
    domain: "politics",
    status: "existing-transaction",
    intent: "把本国城市设为首都，取消旧首都并同步国家中心、标签和城镇层级。",
    api: ["edit.states.inspectCapitalChange", "edit.states.setCapital"],
    inspect: "edit.states.inspectCapitalChange",
    execute: "edit.states.setCapital",
    branches: ["城市不存在", "城市不属于国家", "旧首都降级", "新首都升级"],
    sourceRefs: ["app/webgl-generator/src/runtime/object-edit-commands.js"]
  }),
  rule({
    id: "settlement.found-city",
    title: "建立城镇并同步政治与路线数据",
    domain: "settlement",
    status: "existing-transaction",
    intent: "在合法 Cell 建立城镇，继承国家、省份、文化、宗教和港口条件。",
    api: ["edit.cities.add", "edit.cities.inspectCreateAtCell", "edit.cities.createAtCell"],
    inspect: "edit.cities.inspectCreateAtCell",
    execute: "edit.cities.createAtCell",
    branches: ["Cell 非法/水域", "已有城镇冲突", "归属继承", "港口判断"],
    sourceRefs: ["app/webgl-generator/src/runtime/city-edit-commands.js", "docs/task-notes/cell-diagnostics-and-ai-api-design.md"]
  }),
  rule({
    id: "settlement.move-city",
    title: "移动城镇并重算归属、港口与路线",
    domain: "settlement",
    status: "existing-transaction",
    intent: "移动城镇到目标点，处理国家/省份归属、首都省会限制、港口和相连路线。",
    api: ["edit.cities.inspectMove", "edit.cities.move"],
    inspect: "edit.cities.inspectMove",
    execute: "edit.cities.move",
    branches: ["落点非法", "首都/省会限制", "跨国/跨省", "路线局部重寻"],
    sourceRefs: ["app/webgl-generator/src/runtime/city-relocation.js", "docs/task-notes/city-relocation-product-rules.md"]
  }),
  rule({
    id: "settlement.delete-city",
    title: "删除城镇并修复首都、省会、路线和市场",
    domain: "settlement",
    status: "existing-transaction",
    intent: "删除城镇前评估首都、省会、路线、市场和备注依赖，确认后单事务清理。",
    api: ["edit.cities.inspectDelete", "edit.cities.delete"],
    inspect: "edit.cities.inspectDelete",
    execute: "edit.cities.delete",
    branches: ["依赖影响", "首都/省会保护", "确认", "级联清理"],
    sourceRefs: ["app/webgl-generator/src/runtime/city-edit-commands.js", "app/webgl-generator/src/runtime/delete-impact.js"]
  }),
  rule({
    id: "settlement.sync-city-owner",
    title: "按落点同步城镇政治归属",
    domain: "settlement",
    status: "existing-transaction",
    intent: "让城镇国家与省份归属跟随所在 Cell，并处理首都、省会和跨国约束。",
    api: ["edit.cities.inspectOwnerSync", "edit.cities.syncOwner"],
    inspect: "edit.cities.inspectOwnerSync",
    execute: "edit.cities.syncOwner",
    branches: ["无需变化", "跨省", "跨国", "首都/省会约束"],
    sourceRefs: ["app/webgl-generator/src/runtime/city-edit-commands.js"]
  }),
  rule({
    id: "settlement.regenerate-scope",
    title: "按政治范围重设普通城镇",
    domain: "settlement",
    status: "existing-transaction",
    intent: "在全图、国家或省份范围重设普通城镇，保留首都、省会和范围外对象身份。",
    variants: ["all", "state", "province"],
    api: ["generate.regenerate"],
    inspect: "planned:edit.cities.inspectRegeneration",
    execute: "generate.regenerate(cities)",
    branches: ["范围校验", "保留政治锚点", "替换普通城镇", "全图重建路线"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "tools/webgl-generator-scoped-regeneration-regression.mjs"]
  }),
  rule({
    id: "society.adjust-population",
    title: "调整区域人口并分摊城乡",
    domain: "settlement",
    status: "existing-transaction",
    intent: "给国家、省份、城市或 Cell 区域增减人口，并按规则分摊城乡。",
    api: ["edit.population.inspectAdjustment", "edit.population.applyAdjustment"],
    inspect: "edit.population.inspectAdjustment",
    execute: "edit.population.applyAdjustment",
    branches: ["目标非法", "零人口", "上限/下限", "城乡分摊"],
    sourceRefs: ["app/webgl-generator/src/runtime/population-adjustment-commands.js", "docs/task-notes/population-adjustment-product-rules.md"]
  }),
  rule({
    id: "society.transfer-population",
    title: "在两个区域间守恒迁移人口",
    domain: "settlement",
    status: "existing-transaction",
    intent: "从来源区域向目标区域迁移人口，保持总量并更新城乡和统计。",
    api: ["edit.population.inspectTransfer", "edit.population.transfer"],
    inspect: "edit.population.inspectTransfer",
    execute: "edit.population.transfer",
    branches: ["来源不足", "范围重叠", "跨政治区域", "守恒分摊"],
    sourceRefs: ["app/webgl-generator/src/runtime/population-adjustment-commands.js", "docs/task-notes/population-adjustment-product-rules.md"]
  }),
  socialRule("culture", "文化"),
  socialRule("religion", "宗教"),
  rule({
    id: "society.bind-namebase-and-rename",
    title: "绑定名称库并按范围重命名对象",
    domain: "society",
    status: "existing-transaction",
    intent: "调整名称库绑定并按国家、省份或对象类型批量重命名，确保唯一性和旧名策略。",
    api: ["namebases.inspectBindAndRename", "namebases.bindAndRename"],
    inspect: "namebases.inspectBindAndRename",
    execute: "namebases.bindAndRename",
    branches: ["只绑定", "绑定并重命名", "范围过滤", "名称冲突回退"],
    sourceRefs: ["app/webgl-generator/src/runtime/namebase-edit-commands.js", "app/webgl-generator/src/runtime/object-edit-commands.js"]
  }),
  rule({
    id: "society.replace-or-remove-namebase",
    title: "替换或删除名称库并迁移绑定",
    domain: "society",
    status: "existing-transaction",
    intent: "删除、清空或替换用户名称库时，先处理所有文化和对象绑定，避免悬空。",
    api: ["namebases.inspectReplacement", "namebases.replace"],
    inspect: "namebases.inspectReplacement",
    execute: "namebases.replace",
    branches: ["仍被绑定时拒绝/迁移", "导入替换", "删除单库", "清空用户库"],
    sourceRefs: ["app/webgl-generator/src/runtime/namebase-edit-commands.js", "docs/task-notes/delete-impact-and-batch.md"]
  }),
  rule({
    id: "infrastructure.create-route",
    title: "规划并创建路线",
    domain: "infrastructure",
    status: "existing-transaction",
    intent: "根据端点或 Pack Cell 路径创建道路、步道或海路，验证通行和归属。",
    api: ["edit.routes.create"],
    inspect: "planned:cells.inspectAction(route.draw)",
    execute: "edit.routes.create",
    branches: ["端点/路径非法", "跨水陆类型", "寻路失败", "路线创建"],
    sourceRefs: ["app/webgl-generator/src/runtime/route-edit-commands.js"]
  }),
  rule({
    id: "infrastructure.edit-route",
    title: "编辑路线节点并重新寻路",
    domain: "infrastructure",
    status: "existing-transaction",
    intent: "移动、插入或删除路线节点，并重建路径、长度、归属和渲染数据。",
    api: ["edit.routes.inspectEdit", "edit.routes.update"],
    inspect: "edit.routes.inspectEdit",
    execute: "edit.routes.update",
    branches: ["节点非法", "寻路失败", "路径更新", "统计同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/route-edit-commands.js"]
  }),
  rule({
    id: "infrastructure.delete-route",
    title: "删除路线并清理引用",
    domain: "infrastructure",
    status: "existing-transaction",
    intent: "删除路线，评估备注、城镇和资源引用并保持普通单路线低影响兼容。",
    api: ["edit.routes.inspectDelete", "edit.routes.delete"],
    inspect: "edit.routes.inspectDelete",
    execute: "edit.routes.delete",
    branches: ["普通单路线低影响", "批量/依赖确认", "清理", "撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/route-edit-commands.js", "app/webgl-generator/src/runtime/delete-impact.js"]
  }),
  rule({
    id: "infrastructure.rebuild-route-network",
    title: "重建道路网络",
    domain: "infrastructure",
    status: "existing-transaction",
    intent: "基于当前城镇、地形和政治归属重新生成路线网络。",
    api: ["generate.regenerate"],
    inspect: "planned:edit.routes.inspectRegeneration",
    execute: "generate.regenerate(routes)",
    branches: ["无有效城镇", "A* 寻路", "旧路线替换", "引用与统计同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "app/webgl-generator/src/generator/settlements.js"]
  }),
  rule({
    id: "economy.assign-market-region",
    title: "调整市场覆盖区域并重算经济",
    domain: "economy",
    status: "existing-transaction",
    intent: "把 Pack Cell 区域分配给市场，校验跨国、水域和无效市场后重算经济链。",
    api: ["edit.economy.inspectAssignment", "edit.economy.assignCells"],
    inspect: "edit.economy.inspectAssignment",
    execute: "edit.economy.assignCells",
    branches: ["市场不存在", "水域", "跨国", "应用并重算"],
    sourceRefs: ["app/webgl-generator/src/runtime/economy-edit-commands.js"]
  }),
  rule({
    id: "economy.rebuild",
    title: "重建市场、资源与贸易链",
    domain: "economy",
    status: "existing-transaction",
    intent: "基于当前政治、城镇和资源状态重算市场与交易。",
    api: ["edit.economy.rebuild"],
    inspect: "planned:edit.economy.inspectRebuild",
    execute: "edit.economy.rebuild",
    branches: ["无市场 no-op", "市场归属同步", "贸易重算", "故障回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/economy-edit-commands.js"]
  }),
  rule({
    id: "infrastructure.regenerate-resources",
    title: "重生成资源标记并刷新经济",
    domain: "economy",
    status: "existing-transaction",
    intent: "重生成资源标记、资源潜力和相关贸易。",
    api: ["generate.regenerate"],
    inspect: "planned:edit.markers.inspectResourceRegeneration",
    execute: "generate.regenerate(markers)",
    branches: ["分片生成", "资源标记替换", "经济刷新", "取消/回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/marker-edit-commands.js", "app/webgl-generator/src/runtime/app.js"]
  }),
  rule({
    id: "infrastructure.manage-zone",
    title: "创建或删除业务区域",
    domain: "infrastructure",
    status: "existing-transaction",
    intent: "按中心 Cell 和半径创建区域，或在依赖预检后删除区域。",
    variants: ["create", "delete"],
    api: ["edit.zones.inspectCreate", "edit.zones.create", "edit.zones.inspectDelete", "edit.zones.delete"],
    inspect: "edit.zones.inspectCreate / edit.zones.inspectDelete",
    execute: "edit.zones.create / edit.zones.delete",
    branches: ["中心/半径非法", "区域重叠", "创建", "删除与撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/zone-edit-commands.js"]
  }),
  rule({
    id: "diplomacy.set-bilateral-relation",
    title: "设置双边外交关系并写入纪事",
    domain: "diplomacy",
    status: "existing-transaction",
    intent: "设置两国关系并同步反向关系、摘要、纪事和战争相关约束。",
    api: ["edit.diplomacy.inspectRelation", "edit.diplomacy.setRelation"],
    inspect: "edit.diplomacy.inspectRelation",
    execute: "edit.diplomacy.setRelation",
    branches: ["国家无效/同国", "关系类型非法", "反向关系", "纪事更新"],
    sourceRefs: ["app/webgl-generator/src/runtime/diplomacy-edit-commands.js"]
  }),
  rule({
    id: "diplomacy.regenerate",
    title: "重生成完整外交网络",
    domain: "diplomacy",
    status: "existing-transaction",
    intent: "基于当前国家、邻接和随机种子重建外交关系与摘要。",
    api: ["generate.regenerate"],
    inspect: "planned:edit.diplomacy.inspectRegeneration",
    execute: "generate.regenerate(diplomacy)",
    branches: ["国家不足", "关系生成", "对称校验", "纪事/摘要同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/diplomacy-edit-commands.js"]
  }),
  rule({
    id: "diplomacy.declare-war",
    title: "宣战并建立战争与军事上下文",
    domain: "diplomacy",
    status: "existing-transaction",
    intent: "两国从和平关系进入战争，建立战争目标、参战方、纪事和军事活动上下文。",
    api: ["objects.get", "edit.diplomacy.inspectDeclareWar", "edit.diplomacy.declareWar"],
    inspect: "edit.diplomacy.inspectDeclareWar",
    execute: "edit.diplomacy.declareWar",
    branches: ["双方合法", "现有关系/宗藩限制", "共同战争合并", "战争创建"],
    sourceRefs: ["app/webgl-generator/src/runtime/diplomacy-edit-commands.js", "app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "diplomacy.make-peace",
    title: "议和并结算战争结果",
    domain: "diplomacy",
    status: "existing-transaction",
    intent: "结束战争，处理领土、赔款、附庸、军队状态和纪事。",
    api: ["objects.get", "edit.diplomacy.inspectPeace", "edit.diplomacy.makePeace"],
    inspect: "edit.diplomacy.inspectPeace",
    execute: "edit.diplomacy.makePeace",
    branches: ["战争不存在", "无条件和平", "领土割让", "附庸/赔款与战后状态"],
    sourceRefs: ["app/webgl-generator/src/runtime/diplomacy-edit-commands.js", "app/webgl-generator/src/runtime/state-topology-commands.js"]
  }),
  rule({
    id: "diplomacy.change-overlord",
    title: "建立、转移或解除宗藩关系",
    domain: "diplomacy",
    status: "existing-transaction",
    intent: "建立或解除附庸关系，维护关系矩阵、外交摘要、战争资格和纪事。",
    variants: ["vassalize", "transfer-vassal", "release"],
    api: ["objects.get", "edit.diplomacy.inspectOverlordChange", "edit.diplomacy.changeOverlord"],
    inspect: "edit.diplomacy.inspectOverlordChange",
    execute: "edit.diplomacy.changeOverlord",
    branches: ["循环宗藩阻断", "战争状态", "旧宗主解除", "新关系建立"],
    sourceRefs: ["app/webgl-generator/src/runtime/diplomacy-edit-commands.js"]
  }),
  rule({
    id: "military.reconfigure-force",
    title: "调整国家兵种比例并重配军队",
    domain: "military",
    status: "existing-transaction",
    intent: "调整国家兵种比例，验证总和并同步军团构成与统计。",
    api: ["edit.military.inspectRatios", "edit.military.setRatios"],
    inspect: "edit.military.inspectRatios",
    execute: "edit.military.setRatios",
    branches: ["比例非法", "归一化", "军团重配", "统计更新"],
    sourceRefs: ["app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "military.move-station",
    title: "移动军团驻地",
    domain: "military",
    status: "existing-transaction",
    intent: "移动军团到合法 Cell，校验国家、地形、基地和命令目标。",
    api: ["edit.military.inspectMoveStation", "edit.military.moveStation"],
    inspect: "edit.military.inspectMoveStation",
    execute: "edit.military.moveStation",
    branches: ["军团/Cell 非法", "跨国限制", "驻地更新", "命令引用同步"],
    sourceRefs: ["app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "military.set-base",
    title: "设置军团基地并维护驻地关系",
    domain: "military",
    status: "existing-transaction",
    intent: "把当前位置或指定位置设为基地，验证归属和可达性。",
    api: ["edit.military.inspectBase", "edit.military.setBase"],
    inspect: "edit.military.inspectBase",
    execute: "edit.military.setBase",
    branches: ["目标非法", "跨国限制", "基地更新", "撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "military.issue-status",
    title: "单个或批量调整军团态势",
    domain: "military",
    status: "existing-transaction",
    intent: "调整军团驻防、机动、交战等态势并检查目标和批量原子性。",
    variants: ["single", "batch"],
    api: ["edit.military.inspectStatus", "edit.military.setStatus", "edit.military.setStatusBatch"],
    inspect: "edit.military.inspectStatus",
    execute: "edit.military.setStatus / setStatusBatch",
    branches: ["态势非法", "对象不存在", "批量部分无效拒绝", "统一提交"],
    sourceRefs: ["app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "military.resolve-battle",
    title: "结算明确双方军团的单次战斗",
    domain: "military",
    status: "existing-transaction",
    intent: "在双向战争、海陆一致且同 cell、相邻 cell 或同一匹配战区时，确定性结算双方伤亡、态势、败退命令与战报。",
    api: ["edit.military.inspectBattle", "edit.military.resolveBattle", "edit.military.recordBattleEvent"],
    inspect: "edit.military.inspectBattle",
    execute: "edit.military.resolveBattle",
    branches: ["参战军团非法", "非战争或海陆冲突", "不在接触范围", "显式结果或种子结算", "双方伤亡与撤退", "故障回滚与撤销"],
    sourceRefs: ["app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "military.regenerate",
    title: "重生成军事体系",
    domain: "military",
    status: "existing-transaction",
    intent: "基于当前国家、人口与政策重生成军团并维护引用。",
    api: ["generate.regenerate"],
    inspect: "planned:edit.military.inspectRegeneration",
    execute: "generate.regenerate(military)",
    branches: ["无有效国家", "军团生成", "引用重建", "旧事件兼容"],
    sourceRefs: ["app/webgl-generator/src/runtime/app.js", "app/webgl-generator/src/runtime/military-edit-commands.js"]
  }),
  rule({
    id: "editor.delete-with-impact",
    title: "统一危险删除、清空与批量删除",
    domain: "editor",
    status: "existing-transaction",
    intent: "对对象删除、批量删除和清空先评估依赖与风险，再确认并原子执行。",
    variants: ["single", "batch", "clear"],
    api: [
      "edit.notes.delete",
      "edit.notes.deleteBatch",
      "edit.cities.delete",
      "edit.provinces.delete",
      "edit.states.delete",
      "edit.cultures.delete",
      "edit.religions.delete",
      "edit.routes.delete",
      "edit.rivers.delete",
      "edit.lakes.delete",
      "edit.zones.delete",
      "edit.labels.delete",
      "edit.markers.delete",
      "namebases.delete",
      "namebases.clear"
    ],
    inspect: "统一 delete impact inspector",
    execute: "各领域 delete/clear",
    branches: ["低影响免确认", "高影响确认", "依赖级联", "故障完整回滚"],
    sourceRefs: ["app/webgl-generator/src/runtime/delete-impact.js", "docs/task-notes/delete-impact-and-batch.md"]
  }),
  rule({
    id: "editor.import-collection",
    title: "导入备注、测量、名称库或战斗事件集合",
    domain: "editor",
    status: "existing-transaction",
    intent: "校验外部集合、处理 ID 冲突与覆盖策略，并作为单条历史导入。",
    variants: ["notes", "measurements", "namebases", "military-events"],
    api: ["data.inspectCollectionImport", "edit.notes.import", "edit.measurements.import", "namebases.import", "edit.military.importBattleEvents"],
    inspect: "data.inspectCollectionImport",
    execute: "现有 import 方法",
    branches: ["格式拒绝", "ID 冲突", "append/replace", "单事务导入"],
    sourceRefs: ["app/webgl-generator/src/runtime/note-import.js", "app/webgl-generator/src/runtime/measurement-edit-commands.js", "app/webgl-generator/src/runtime/namebase-edit-commands.js"]
  }),
  ...plannerRecipeAuditRows()
]);

const EDITOR_SERVICE_PREFIXES = Object.freeze(["selection.", "layers.", "units.", "debug.", "history."]);
const EDITOR_RUNTIME_METHODS = new Set(["cells.locate"]);
const ATOMIC_EDITOR_METHODS = new Set([
  "edit.cities.createAtCell",
  "edit.provinces.applyChanges",
  "edit.provinces.createAtCell",
  "edit.states.applyChanges",
  "edit.states.createAtCell"
]);
const READ_METHODS = new Set([
  "info.version",
  "info.capabilities",
  "info.describe",
  "info.mapSummary",
  "info.runtimeStats",
  "info.healthEvents",
  "planner.listRecipes",
  "planner.getRecipe",
  "objects.types",
  "objects.get",
  "objects.list",
  "objects.query",
  "cells.get",
  "cells.getAtPoint",
  "cells.neighbors",
  "cells.query",
  "cells.scan",
  "cells.actions",
  "cells.inspectAction",
  "regenerationLocks.list",
  "regenerationLocks.status",
  "regenerationLocks.inspect",
  "edit.cities.inspectCreateAtCell",
  "edit.provinces.inspectCreateAtCell",
  "edit.states.inspectCreateAtCell",
  "climate.get",
  "climate.getOptions",
  "climate.getTemperature",
  "climate.getPrecipitation",
  "climate.getLatitude",
  "climate.getAtmosphere",
  "climate.getBiomes",
  "edit.labels.getStyles",
  "namebases.list"
]);

const EXPORT_METHODS = new Set([
  "data.exportAll",
  "data.exportMap",
  "data.exportGEO",
  "data.exportFeatureGEO",
  "data.exportCompressedAll",
  "data.exportPNG",
  "data.exportNotes",
  "data.exportMeasurements",
  "data.exportImportDiagnostic",
  "namebases.export"
]);

export function buildCompoundSemanticActionAudit() {
  const apiMethods = flattenApiMethods(API_METHODS);
  const apiSet = new Set(apiMethods);
  const fullMatrix = buildFullCapabilityMatrix();
  const cellMatrix = buildCellActionReplanningMatrix();
  const actions = RULE_ACTIONS.map(action => normalizeAction(action, apiSet));
  validateActions(actions);
  const recipeDocSync = buildPlannerRecipeDocSyncReport();
  const recipeRegistryCoverage = buildRecipeRegistryCoverage(actions, apiMethods, cellMatrix, recipeDocSync);

  const actionByApi = indexActionsByApi(actions);
  const apiCoverage = apiMethods.map(method => classifyApiMethod(method, actionByApi));
  const unclassifiedApi = apiCoverage.filter(item => item.classification === "unclassified");
  const interactionCoverage = cellMatrix.rows.map(row => classifyInteractionRow(row, actions));
  const unclassifiedInteractions = interactionCoverage.filter(item => item.classification === "unclassified");
  if (unclassifiedApi.length || unclassifiedInteractions.length || !recipeRegistryCoverage.complete) {
    throw new Error(`复合语义审计仍有未分类项：${JSON.stringify({
      api: unclassifiedApi.map(item => item.method),
      interactions: unclassifiedInteractions.map(item => item.rowId),
      recipeRegistry: recipeRegistryCoverage
    })}`);
  }

  const sourceDigest = createHash("sha256")
    .update(fullMatrix.sourceDigest)
    .update(cellMatrix.sourceDigest)
    .update(JSON.stringify(actions))
    .update(recipeDocSync.canonicalDigest)
    .update(recipeDocSync.documentDigest)
    .digest("hex");
  const actionStatuses = countBy(actions, "status");
  const actionDomains = countBy(actions, "domain");
  const apiClassifications = countBy(apiCoverage, "classification");
  const interactionClassifications = countBy(interactionCoverage, "classification");

  return {
    schemaVersion: 1,
    scope: "权威任务第 204 项：全游戏复合语义接口、规则动作与玩法配方审计",
    generatedAtPolicy: "报告不写入动态时间，sourceDigest 变化即要求重新生成",
    sourceDigest,
    definition: {
      compoundSemanticAction: "一个玩家意图，但执行时需要跨对象/系统、条件分支、业务预检或原子回滚；应由单一规则事务表达。",
      primitive: "只修改一个稳定字段或纯编辑器显示偏好，可保留为原子 API，不强行包装成复合动作。",
      plannerRecipe: "由多个可独立提交的规则动作组成的战略目标；交给 AI 规划器编排，不合并成超大事务 API。",
      exclusion: "面板几何、焦点、列宽、原生文件选择器和调试故障注入不属于游戏规则。"
    },
    tierPolicy: {
      "rule-transaction": "需要 inspector + execute、稳定 business code、expectedRevision/inspectionToken、单历史与完整回滚。",
      "planner-recipe": "只描述前置、步骤和成功条件；每一步独立预检/授权/提交，规划器不得绕过规则事务。"
    },
    statusPolicy: {
      "existing-transaction": "已有单事务主路径，可补齐 schema/inspector 后直接纳入规则目录。",
      "existing-needs-inspector": "已有写命令，但缺少 AI 可调用的只读业务预检或稳定分支结果。",
      "fragmented-needs-transaction": "当前只能串联多个 API，不能保证单历史、并发安全和失败原子性。",
      "missing-game-rule": "当前只有数据原语或记录能力，尚无完整游戏规则。",
      "recipe-only": "战略/玩法流程尚未发布为可枚举的执行配方。",
      "executable-recipe": "已进入公开 planner registry；规划器逐步调用精确事实、预检和执行方法。"
    },
    denominator: {
      fullCapabilityRows: fullMatrix.rows.length,
      fullCapabilityUnknown: fullMatrix.totals.unknown,
      fullCapabilityUnclassified: fullMatrix.totals.unclassified,
      fullCapabilityGaps: fullMatrix.totals.gap,
      publicApiMethods: apiMethods.length,
      classifiedApiMethods: apiCoverage.length - unclassifiedApi.length,
      cellActionRows: cellMatrix.rows.length,
      classifiedCellActionRows: interactionCoverage.length - unclassifiedInteractions.length,
      canvasModes: cellMatrix.totals.runtimeModes,
      directManipulationFamilies: cellMatrix.totals.directFamilies,
      directManipulationInstances: cellMatrix.totals.directInstances
    },
    totals: {
      actions: actions.length,
      ruleTransactions: actions.filter(action => action.tier === "rule-transaction").length,
      plannerRecipes: actions.filter(action => action.tier === "planner-recipe").length,
      statuses: actionStatuses,
      domains: actionDomains,
      apiClassifications,
      interactionClassifications,
      structuralGaps: unclassifiedApi.length + unclassifiedInteractions.length + recipeRegistryCoverage.issueCount
    },
    domainRules: DOMAIN_RULES,
    recipeDocSync: {
      complete: recipeDocSync.complete,
      canonicalDigest: recipeDocSync.canonicalDigest,
      documentDigest: recipeDocSync.documentDigest,
      recipeCount: recipeDocSync.recipeCount,
      stepCount: recipeDocSync.stepCount,
      issueCount: recipeDocSync.issueCount,
      machineOnly: recipeDocSync.machineOnly,
      docsOnly: recipeDocSync.docsOnly,
      fieldMismatch: recipeDocSync.fieldMismatch,
      methodMismatch: recipeDocSync.methodMismatch
    },
    recipeRegistryCoverage,
    actions,
    apiCoverage,
    interactionCoverage
  };
}

export function writeCompoundSemanticActionAudit() {
  const report = buildCompoundSemanticActionAudit();
  writeFileSync(OUTPUT_JSON, stableJson(report));
  writeFileSync(OUTPUT_MD, renderMarkdown(report));
  return report;
}

function socialRule(kind, label) {
  const plural = kind === "culture" ? "cultures" : "religions";
  return rule({
    id: `society.${kind}.lifecycle`,
    title: `${label}创建、归属、扩张、继承与删除`,
    domain: "society",
    status: "existing-transaction",
    intent: `管理${label}对象及其 Cell 归属、中心、父级和删除后的回退。`,
    variants: ["create", "assign", "expand", "reparent", "delete"],
    api: [
      `edit.${plural}.inspectLifecycle`,
      `edit.${plural}.add`,
      `edit.${plural}.assignCells`,
      `edit.${plural}.inspectExpansion`,
      `edit.${plural}.applyExpansion`,
      `edit.${plural}.setParent`,
      `edit.${plural}.delete`
    ],
    inspect: `edit.${plural}.inspectLifecycle / edit.${plural}.inspectExpansion`,
    execute: `edit.${plural}.*`,
    branches: ["创建名称和中心", "区域归属", "确定性扩张", "继承循环阻断", "删除后归属/子级回退"],
    sourceRefs: [
      `app/webgl-generator/src/runtime/${kind}-edit-commands.js`,
      "app/webgl-generator/src/runtime/social-expansion-edit-commands.js",
      "docs/task-notes/culture-religion-expansion-product-rules.md"
    ]
  });
}

function rule(options) {
  return {
    tier: "rule-transaction",
    variants: [],
    api: [],
    inspect: "",
    execute: "",
    branches: [],
    steps: [],
    sourceRefs: [],
    ...options
  };
}

function plannerRecipeAuditRows() {
  return listPlannerRecipes().map(summary => {
    const registryRecipe = getPlannerRecipe(summary.recipeId);
    return recipe({
      id: registryRecipe.recipeId,
      title: registryRecipe.title,
      domain: registryRecipe.domain,
      intent: registryRecipe.intent,
      api: [],
      steps: registryRecipe.steps.map(step => step.actionId || step.stepId),
      stepContracts: registryRecipe.steps,
      inspect: "planner.getRecipe + step.inspection.methods",
      execute: "按 step.executeMethods 逐步调用公开 API",
      branches: [
        "逐步骤读取事实与 revision",
        "每一步单独预检并按方法策略等待授权",
        "拒绝或陈旧时停止并重规划",
        "已提交步骤不伪装成跨步骤原子回滚"
      ],
      sourceRefs: [
        "app/webgl-generator/src/runtime/planner-recipe-registry.js",
        "docs/task-notes/compound-semantic-api-and-gameplay-rules.md",
        "docs/task-notes/gameplay-rules-and-ai-planner-recipes.md"
      ]
    });
  });
}

function recipe(options) {
  return rule({
    tier: "planner-recipe",
    status: "executable-recipe",
    ...options
  });
}

function buildRecipeRegistryCoverage(actions, apiMethods, cellMatrix, recipeDocSync) {
  const apiSet = new Set(apiMethods);
  const validation = validatePlannerRecipeRegistry(apiMethods);
  const ruleById = new Map(actions
    .filter(action => action.tier === "rule-transaction")
    .map(action => [action.id, action]));
  const plannerById = new Map(actions
    .filter(action => action.tier === "planner-recipe")
    .map(action => [action.id, action]));
  const registryRecipes = listPlannerRecipes().map(summary => getPlannerRecipe(summary.recipeId));
  const cellActions = new Map(listCellActions().map(action => [action.actionId, action]));
  const matrixCellActions = new Map((cellMatrix?.rows || [])
    .filter(row => row.actionId)
    .map(row => [row.actionId, row]));
  const registryIds = registryRecipes.map(recipe => recipe.recipeId);
  const auditIds = [...plannerById.keys()];
  const missingAuditRecipes = registryIds.filter(id => !plannerById.has(id));
  const staleAuditRecipes = auditIds.filter(id => !registryIds.includes(id));
  const missingRuleActions = [];
  const unauthorizedMethods = [];
  const placeholderRefs = [...validation.placeholderMethods];
  const unknownSpatialActionIds = [];
  const spatialRegistryOnly = [];
  const spatialMatrixOnly = [];
  const staleSpatialActionIds = [];

  for (const recipe of registryRecipes) {
    for (const step of recipe.steps) {
      const methodRefs = [
        ...step.facts,
        ...step.inspection.methods,
        ...step.executeMethods,
        ...(step.compensation.method ? [step.compensation.method] : []),
        ...(step.compensation.methods || [])
      ];
      for (const method of methodRefs) {
        if (!apiSet.has(method)) unauthorizedMethods.push(`${recipe.recipeId}:${step.stepId}:${method}`);
        if (/^(planned:|service:)|[*() /]/u.test(method)) placeholderRefs.push(`${recipe.recipeId}:${step.stepId}:${method}`);
      }
      if (step.kind !== "rule") continue;
      const action = ruleById.get(step.actionId);
      if (!action) {
        missingRuleActions.push(`${recipe.recipeId}:${step.stepId}:${step.actionId}`);
        continue;
      }
      const actionApi = new Set(action.api);
      for (const method of step.executeMethods) {
        if (!actionApi.has(method)) unauthorizedMethods.push(`${recipe.recipeId}:${step.stepId}:${method}:execute-not-in-action`);
      }
      for (const method of step.inspection.methods) {
        if (!actionApi.has(method) && method !== "info.describe" && method !== "cells.inspectAction") {
          unauthorizedMethods.push(`${recipe.recipeId}:${step.stepId}:${method}:inspect-not-in-action`);
        }
      }
      if (step.spatialActionId) {
        const cellAction = cellActions.get(step.spatialActionId);
        const matrixRow = matrixCellActions.get(step.spatialActionId);
        if (!cellAction && !matrixRow) unknownSpatialActionIds.push(`${recipe.recipeId}:${step.stepId}:${step.spatialActionId}`);
        else if (cellAction && !matrixRow) spatialRegistryOnly.push(`${recipe.recipeId}:${step.stepId}:${step.spatialActionId}`);
        else if (!cellAction && matrixRow) spatialMatrixOnly.push(`${recipe.recipeId}:${step.stepId}:${step.spatialActionId}`);
        if (cellAction && (
          cellAction.inspectTarget !== `cells.inspectAction:${step.spatialActionId}`
          || !step.executeMethods.includes(cellAction.executeTarget)
          || step.inputTemplate?.actionId !== step.spatialActionId
        )) staleSpatialActionIds.push(`${recipe.recipeId}:${step.stepId}:${step.spatialActionId}`);
        if (matrixRow && (
          matrixRow.inspectTarget !== `cells.inspectAction:${step.spatialActionId}`
          || !step.executeMethods.includes(matrixRow.executeTarget)
        )) staleSpatialActionIds.push(`${recipe.recipeId}:${step.stepId}:${step.spatialActionId}:matrix`);
      }
    }
  }

  const issueGroups = {
    missingAuditRecipes,
    staleAuditRecipes,
    missingRuleActions,
    duplicateRecipeIds: validation.rawDuplicateRecipeIds,
    duplicateStepIds: validation.rawDuplicateStepIds,
    invalidFields: validation.invalidFields,
    unknownMethods: validation.unknownMethods,
    unauthorizedMethods: [...new Set(unauthorizedMethods)].sort(),
    placeholderRefs: [...new Set(placeholderRefs)].sort(),
    unknownSpatialActionIds: [...new Set(unknownSpatialActionIds)].sort(),
    spatialRegistryOnly: [...new Set(spatialRegistryOnly)].sort(),
    spatialMatrixOnly: [...new Set(spatialMatrixOnly)].sort(),
    staleSpatialActionIds: [...new Set(staleSpatialActionIds)].sort(),
    docMachineOnly: recipeDocSync.machineOnly,
    docOnly: recipeDocSync.docsOnly,
    docFieldMismatch: recipeDocSync.fieldMismatch,
    docMethodMismatch: recipeDocSync.methodMismatch,
    docDigestMismatch: recipeDocSync.digestMismatch ? ["canonical-digest"] : [],
    docMarkerMissing: recipeDocSync.markerFound ? [] : ["machine-sync-marker"]
  };
  const issueCount = Object.values(issueGroups).reduce((sum, items) => sum + items.length, 0);
  return {
    complete: validation.valid && issueCount === 0,
    registryRecipes: validation.recipeCount,
    registrySteps: validation.stepCount,
    spatialActionsReferenced: registryRecipes.flatMap(recipe => recipe.steps)
      .filter(step => step.spatialActionId).length,
    executableRecipes: plannerById.size,
    issueCount,
    ...issueGroups
  };
}

function normalizeAction(action, apiSet) {
  const domainRule = DOMAIN_RULES[action.domain];
  const api = [...new Set(action.api)].sort();
  const unknownApi = api.filter(method => !apiSet.has(method));
  if (unknownApi.length) throw new Error(`${action.id} 引用了不存在的公共 API：${unknownApi.join("、")}`);
  return {
    ...action,
    api,
    variants: [...new Set(action.variants)],
    branches: [...new Set(action.branches)],
    steps: [...new Set(action.steps)],
    sourceRefs: [...new Set(action.sourceRefs)].sort(),
    gameplayChapter: domainRule?.chapter || "",
    invariant: domainRule?.invariant || "",
    historyPolicy: action.tier === "rule-transaction"
      ? "成功恰好一条历史且 mapRevision +1；拒绝、no-op、取消和完整回滚不增加历史或 revision。"
      : "每个规则动作独立进入历史；配方本身不伪造跨步骤原子性。",
    compatibilityPolicy: action.tier === "rule-transaction"
      ? "旧公开方法保留并委托规范规则入口或保持严格等价；旧存档走迁移/回填。"
      : "配方只引用公开能力 ID，不依赖 UI DOM 或内部对象。"
  };
}

function validateActions(actions) {
  const ids = new Set();
  for (const action of actions) {
    if (!action.id || ids.has(action.id)) throw new Error(`复合语义 actionId 缺失或重复：${action.id || "(empty)"}`);
    ids.add(action.id);
    if (!action.title || !action.intent || !action.inspect || !action.execute) throw new Error(`${action.id} 缺少标题、意图或接口规划`);
    if (!STATUS.has(action.status)) throw new Error(`${action.id} 状态无效：${action.status}`);
    if (!TIER.has(action.tier)) throw new Error(`${action.id} 层级无效：${action.tier}`);
    if (!DOMAIN.has(action.domain)) throw new Error(`${action.id} 领域无效：${action.domain}`);
    if (!action.branches.length) throw new Error(`${action.id} 缺少业务分支`);
    if (!action.sourceRefs.length) throw new Error(`${action.id} 缺少源码或规则证据`);
    const missingSourceRefs = action.sourceRefs.filter(path => !existsSync(join(REPO_ROOT, path)));
    if (missingSourceRefs.length) throw new Error(`${action.id} 引用了不存在的证据：${missingSourceRefs.join("、")}`);
    if (action.tier === "planner-recipe" && !action.steps.length) throw new Error(`${action.id} 配方缺少步骤`);
    if (action.tier === "rule-transaction" && ["recipe-only", "executable-recipe"].includes(action.status)) {
      throw new Error(`${action.id} 事务动作不能标记为配方状态`);
    }
    if (action.tier === "planner-recipe" && action.status !== "executable-recipe") {
      throw new Error(`${action.id} 配方状态必须为 executable-recipe`);
    }
  }
}

function indexActionsByApi(actions) {
  const result = new Map();
  for (const action of actions) {
    for (const method of action.api) {
      const ids = result.get(method) || [];
      ids.push(action.id);
      result.set(method, ids);
    }
  }
  return result;
}

function classifyApiMethod(method, actionByApi) {
  const actionIds = [...(actionByApi.get(method) || [])].sort();
  if (actionIds.length) return {method, classification: "semantic-action", actionIds};
  if (READ_METHODS.has(method)) return {method, classification: "read-primitive", actionIds: []};
  if (EXPORT_METHODS.has(method)) return {method, classification: "read-export-service", actionIds: []};
  if (EDITOR_RUNTIME_METHODS.has(method) || EDITOR_SERVICE_PREFIXES.some(prefix => method.startsWith(prefix))) {
    return {method, classification: "editor-runtime-service", actionIds: []};
  }
  if (method === "generate.getOptions" || method === "generate.setOptions") {
    return {method, classification: "generation-configuration", actionIds: []};
  }
  if (
    ATOMIC_EDITOR_METHODS.has(method)
    || method.startsWith("regenerationLocks.")
    || method.startsWith("edit.labels.")
    || method.startsWith("edit.markers.")
    || method.startsWith("edit.measurements.")
    || method.startsWith("edit.notes.")
    || method.endsWith(".rename")
    || method.endsWith(".setColor")
    || method.endsWith(".setStyle")
    || method.endsWith(".setVisual")
    || method.endsWith(".resetVisual")
    || method.endsWith(".setNote")
    || method.endsWith(".setPopulation")
    || method.endsWith(".setWidthFactor")
    || method.endsWith(".clearBattleEvents")
    || method.includes("Display")
    || method.startsWith("namebases.")
    || method === "data.saveBrowserMap"
  ) {
    return {method, classification: "atomic-editor-primitive", actionIds: []};
  }
  return {method, classification: "unclassified", actionIds: []};
}

function classifyInteractionRow(row, actions) {
  if (row.status === "excluded") {
    return {rowId: row.rowId, actionId: row.actionId, classification: "ui-boundary", semanticActionIds: []};
  }
  const domain = String(row.actionId || "").split(/[.:]/u)[0];
  const semanticActionIds = actions
    .filter(action => action.tier === "rule-transaction" && interactionDomainMatches(domain, action))
    .map(action => action.id)
    .sort();
  return {
    rowId: row.rowId,
    actionId: row.actionId,
    classification: semanticActionIds.length ? "semantic-input-or-primitive" : "unclassified",
    semanticActionIds
  };
}

function interactionDomainMatches(domain, action) {
  const aliases = {
    biome: ["ecology"],
    biomes: ["ecology"],
    city: ["settlement"],
    cities: ["settlement"],
    culture: ["society"],
    cultures: ["society"],
    economy: ["economy"],
    feature: ["terrain"],
    features: ["terrain"],
    height: ["terrain"],
    label: ["editor"],
    labels: ["editor"],
    lake: ["terrain"],
    lakes: ["terrain"],
    marker: ["infrastructure", "editor"],
    markers: ["infrastructure", "editor"],
    measurement: ["editor"],
    measurements: ["editor"],
    military: ["military"],
    note: ["editor"],
    notes: ["editor"],
    population: ["settlement"],
    province: ["politics"],
    provinces: ["politics"],
    "regeneration-lock": ["editor"],
    regenerationLocks: ["editor"],
    religion: ["society"],
    religions: ["society"],
    river: ["terrain"],
    rivers: ["terrain"],
    route: ["infrastructure"],
    routes: ["infrastructure"],
    selection: ["editor"],
    state: ["politics"],
    states: ["politics"],
    zone: ["infrastructure"],
    zones: ["infrastructure"]
  };
  return (aliases[domain] || [domain]).includes(action.domain);
}

function flattenApiMethods(groups) {
  return Object.entries(groups)
    .flatMap(([group, methods]) => methods.map(method => group === "edit" ? `edit.${method}` : `${group}.${method}`))
    .sort();
}

function countBy(items, key) {
  const result = {};
  for (const item of items) result[item[key]] = (result[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(report) {
  const statuses = report.totals.statuses;
  return [
    "# 全游戏复合语义接口、规则动作与玩法配方审计",
    "",
    "> 本报告对应权威任务第 204 项及第 207～210 项闭环结果，持续校验规则事务、AI 规划器配方与公开 API 的当前实现状态。",
    "",
    "## 审计结论",
    "",
    `- 上游能力矩阵：${report.denominator.fullCapabilityRows} 行，unknown / unclassified / gap = ${report.denominator.fullCapabilityUnknown} / ${report.denominator.fullCapabilityUnclassified} / ${report.denominator.fullCapabilityGaps}。`,
    `- 公开 API：${report.denominator.classifiedApiMethods} / ${report.denominator.publicApiMethods} 已归类。`,
    `- Cell / 画布动作：${report.denominator.classifiedCellActionRows} / ${report.denominator.cellActionRows} 已归类；画布模式 ${report.denominator.canvasModes}，直接操控 ${report.denominator.directManipulationFamilies} 类 / ${report.denominator.directManipulationInstances} 个宿主。`,
    `- 规则事务与玩法配方：${report.totals.ruleTransactions} + ${report.totals.plannerRecipes} = ${report.totals.actions}。`,
    `- 已有完整事务 ${statuses["existing-transaction"] || 0}，已有写命令但缺 AI inspector ${statuses["existing-needs-inspector"] || 0}，多 API 碎片待收敛 ${statuses["fragmented-needs-transaction"] || 0}，缺失游戏规则 ${statuses["missing-game-rule"] || 0}，待发布配方 ${statuses["recipe-only"] || 0}，可执行配方 ${statuses["executable-recipe"] || 0}。`,
    `- 结构缺口：${report.totals.structuralGaps}。`,
    "",
    "## 边界定义",
    "",
    `- **规则事务**：${report.definition.compoundSemanticAction}`,
    `- **原子原语**：${report.definition.primitive}`,
    `- **规划器配方**：${report.definition.plannerRecipe}`,
    `- **排除项**：${report.definition.exclusion}`,
    "",
    "不能把所有自然语言目标都做成一个巨型接口。API 体系固定为三层：只读事实与原子原语 → 可预检、可回滚的规则事务 → AI 规划器组合的玩法配方。",
    "",
    "## 规则事务总表",
    "",
    "| actionId | 领域 | 玩家意图 | 当前状态 | 当前 API | 规范 inspect / execute |",
    "|---|---|---|---|---|---|",
    ...report.actions
      .filter(action => action.tier === "rule-transaction")
      .map(action => `| \`${action.id}\` | ${action.gameplayChapter} | ${action.intent} | \`${action.status}\` | ${codeList(action.api)} | \`${action.inspect}\`<br>\`${action.execute}\` |`),
    "",
    "## 需要优先补齐的复合事务",
    "",
    ...report.actions
      .filter(action => ["fragmented-needs-transaction", "missing-game-rule"].includes(action.status))
      .map(action => [
        `### ${action.title}（\`${action.id}\`）`,
        "",
        action.intent,
        "",
        `- 当前状态：\`${action.status}\`。`,
        `- 关键分支：${action.branches.join("；")}。`,
        `- 规范入口：\`${action.inspect}\` → \`${action.execute}\`。`,
        `- 共同不变量：${action.invariant}`,
        `- 证据：${action.sourceRefs.map(item => `\`${item}\``).join("、")}。`,
        ""
      ].join("\n")),
    "## AI 规划器玩法配方",
    "",
    "| 配方 | 目标 | 规则动作序列 |",
    "|---|---|---|",
    ...report.actions
      .filter(action => action.tier === "planner-recipe")
      .map(action => `| \`${action.id}\` ${action.title} | ${action.intent} | ${action.steps.map(step => `\`${step}\``).join(" → ")} |`),
    "",
    "配方已由公开 planner registry 发布，但不承诺跨步骤原子性。AI 每一步都必须读取当前 revision、调用登记的精确 inspector、等待必要授权、执行公开规则事务，再根据新状态继续规划。",
    "",
    "## 玩法文档生成骨架",
    "",
    ...Object.entries(report.domainRules).map(([domain, value]) => `- \`${domain}\` **${value.chapter}**：${value.invariant}`),
    "",
    "后续完整玩法文档不应按 UI 面板抄按钮，而应按以上领域章节描述：玩家目标、合法前置、规则分支、成功影响、失败原因、可撤销性、与其它系统的联动，以及可由 AI 组合的配方。",
    "",
    "## 机器覆盖",
    "",
    `- API 分类：${Object.entries(report.totals.apiClassifications).map(([key, value]) => `\`${key}=${value}\``).join("，")}。`,
    `- 交互分类：${Object.entries(report.totals.interactionClassifications).map(([key, value]) => `\`${key}=${value}\``).join("，")}。`,
    `- Source digest：\`${report.sourceDigest}\`。`,
    ""
  ].join("\n");
}

function codeList(items) {
  if (!items.length) return "—";
  return items.map(item => `\`${item}\``).join("<br>");
}

function checkGenerated(report) {
  const expected = new Map([
    [OUTPUT_JSON, stableJson(report)],
    [OUTPUT_MD, renderMarkdown(report)]
  ]);
  for (const [path, content] of expected) {
    let actual = "";
    try {
      actual = readFileSync(path, "utf8");
    } catch {
      throw new Error(`缺少生成报告：${path}`);
    }
    if (actual !== content) throw new Error(`生成报告已陈旧：${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = process.argv.includes("--check") ? buildCompoundSemanticActionAudit() : writeCompoundSemanticActionAudit();
  if (process.argv.includes("--check")) checkGenerated(report);
  console.log(JSON.stringify({
    denominator: report.denominator,
    totals: report.totals
  }, null, 2));
}
