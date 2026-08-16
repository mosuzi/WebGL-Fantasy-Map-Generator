import {defineBiomesAndPopulation} from "../generator/biomes.js";
import {createGenerationSummary} from "../generator/index.js";
import {regeneratePackProvincesWithinStates, regeneratePackStatesAndProvinces} from "../generator/politics.js";
import {createRandom} from "../generator/random.js";
import {buildRivers, renameHydronymsByCulture} from "../generator/rivers.js";
import {finalizeSettlements, regenerateSettlementsWithinPolitics} from "../generator/settlements.js";
import {finalizeSocietyReligions} from "../generator/society.js";
import {buildZones} from "../generator/zones.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {captureClimatePopulation, restoreClimatePopulation} from "./climate-population-preservation.js";
import {createRegenerateDiplomacyCommand} from "./diplomacy-edit-commands.js";
import {rebuildFeatureTopology} from "./feature-topology-edit-commands.js";
import {createDomainPatch} from "./domain-patch.js";
import {createRegenerationResult} from "./height-derived-rebuild.js";
import {ensureLabelStore} from "./label-edit-commands.js";
import {createRegenerateResourceMarkersCommand} from "./marker-edit-commands.js";
import {createRegenerateMilitaryCommand} from "./military-edit-commands.js";
import {compareMilitaryVariation, snapshotMilitaryVariation} from "./military-regeneration-variation.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";
import {captureRegenerationConstraintBundle} from "./regeneration-constraint-bundle.js";
import {allRegenerationObjectsLocked, assertLockedRegenerationSnapshots, captureLockedRegenerationObjects, regenerationLockConflict} from "./regeneration-lock-protection.js";
import {reconcileSettlementCellIdentity} from "./settlement-cell-index.js";
import {reconcileSettlementPortTopology} from "./settlement-port-topology.js";
import {regenerateProvincesForStates, withScopedProvinceRegenerationOptions} from "./state-topology-commands.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";
import {runMapFileIoWorkerTask} from "./map-file-io-worker-task.js";

export const REGENERATION_WORKER_TASK = "regeneration.compute";

export function collectRegenerationWorkerTransferables(result) {
  if (!result || typeof result !== "object") return collectWorkerTransferables(result);
  return collectWorkerTransferables({
    patch: result.patch || null,
    preparedRender: result.preparedRender || null,
    archive: result.archive || null
  });
}

export const REGENERATION_WORKER_KINDS = Object.freeze([
  "features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"
]);

const RIVER_FORBIDDEN_WRITE_SET = Object.freeze(["settlements.routes", "pack.routes", "pack.cells.routes"]);

const COMMON_WRITE_SET = Object.freeze(["generationLog"]);
const SYSTEM_STALE_WRITE_SET = Object.freeze([
  "military.metadata.stale", "zones.metadata.stale", "markers.metadata.stale", "economy.metadata.stale", "diplomacy.metadata.stale"
]);
const WRITE_SETS = Object.freeze({
  features: Object.freeze([
    "features", "grid.features", "grid.cells.f", "grid.cells.t", "pack.features", "pack.metadata", "pack.cells.f", "pack.cells.t",
    "pack.cells.haven", "pack.cells.harbor", "pack.cells.type", "pack.burgs", "pack.routes", "pack.markers", "pack.portDiagnostics.features", "settlements", "markers.markers",
    ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.features", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  routes: Object.freeze([
    "settlements", "politics", "economy.markets", "grid.cells.burg", "pack.burgs", "pack.routes", "pack.states", "pack.provinces", "pack.markets",
    "pack.cells.burg", "pack.cells.routes", "pack.cells.market", ...SYSTEM_STALE_WRITE_SET,
    "metadata.regeneration.routes", "metadata.derivedStale", "metadata.compatibility.settlementPortTopology", ...COMMON_WRITE_SET
  ]),
  rivers: Object.freeze([
    "rivers", "pack.rivers", "pack.features", "pack.goods", "economy.goods", "pack.metadata.rankCellsInputs", "pack.metadata.resourceGoods",
    "pack.cells.fl", "pack.cells.r", "pack.cells.conf", "pack.cells.biome", "pack.cells.s", "pack.cells.pop", "pack.cells.good",
    "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride",
    "grid.cells.biome", "grid.cells.s", "grid.cells.pop", "climate.biomes", "climate.metadata.biomeCounts",
    ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.rivers", "metadata.derivedStale", "generationLog"
  ]),
  cities: Object.freeze([
    "settlements", "politics", "grid.cells.burg", "pack.burgs", "pack.routes", "pack.states", "pack.provinces", "pack.cells.burg", "pack.cells.routes",
    "pack.cells.state", "pack.cells.province", "pack.portDiagnostics", "labels", ...SYSTEM_STALE_WRITE_SET,
    "metadata.regeneration.cities", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  states: Object.freeze([
    "politics", "settlements", "grid.cells.burg", "grid.cells.state", "grid.cells.province", "pack.states", "pack.provinces", "pack.burgs", "pack.routes", "pack.cells.state", "pack.cells.province",
    "pack.cells.burg", "pack.cells.routes", ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.states", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  provinces: Object.freeze([
    "politics", "settlements", "grid.cells.burg", "grid.cells.province", "pack.states", "pack.provinces", "pack.burgs", "pack.routes", "pack.cells.state", "pack.cells.province",
    "pack.cells.burg", "pack.cells.routes", ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.provinces", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  markers: Object.freeze([
    "markers", "economy", "politics", "pack.markers", "pack.goods", "pack.markets", "pack.deals", "pack.states", "pack.provinces", "pack.burgs",
    "pack.metadata.markerResourceEconomy", "pack.metadata.resourceGoods", "pack.cells.good", "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.market",
    "pack.cells.pop", "pack.cells.s", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride",
    ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.markers", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  diplomacy: Object.freeze([
    "options.diplomacyRegenerationSalt", "diplomacy", "military", "zones", "pack.diplomacy", "pack.states", "pack.military", "pack.zones", "politics.states",
    ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.diplomacy", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  religions: Object.freeze([
    "society.religions", "society.metadata", "grid.cells.religion", "pack.religions", "pack.cells.religion", "pack.burgs", "settlements", "politics", "pack.states", "pack.provinces",
    ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.religions", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  military: Object.freeze([
    "military", "pack.military", "pack.states", "politics.states", ...SYSTEM_STALE_WRITE_SET,
    "metadata.regeneration.military", "metadata.derivedStale", ...COMMON_WRITE_SET
  ]),
  zones: Object.freeze([
    "zones", "pack.zones", ...SYSTEM_STALE_WRITE_SET, "metadata.regeneration.zones", "metadata.derivedStale", ...COMMON_WRITE_SET
  ])
});

export async function runRegenerationWorkerTask(payload, context = {}) {
  const taskStartedAt = regenerationTaskNow();
  const map = payload?.map;
  if (!map || typeof map !== "object") throw taskError("worker_regeneration_map_missing", "重生成 Worker 缺少地图快照");
  if (payload?.mode === "archive-export") {
    const binding = context.binding || null;
    context.checkpoint?.();
    const archive = await runMapFileIoWorkerTask({...payload.archive, map}, context);
    context.checkpoint?.();
    return {mode: "archive-export", binding, archive};
  }
  if (payload?.mode === "render-only") {
    if (!payload.render || typeof payload.render !== "object") {
      throw taskError("worker_regeneration_render_missing", "渲染准备 Worker 缺少渲染上下文");
    }
    const binding = payload.render.binding || context.binding || null;
    context.checkpoint?.();
    const preparedRender = await executeRenderPreparationTask({...payload.render, map, binding}, context);
    context.checkpoint?.();
    return {mode: "render-only", binding, preparedRender};
  }
  const kind = normalizeRegenerationKind(payload?.kind);
  const setupStartedAt = regenerationTaskNow();
  context.checkpoint?.();
  context.report?.("compute", {message: `正在 Worker 中重算 ${kind}`, progress: 0.15});
  const before = regenerationSummary(map);
  const scope = normalizeRegenerationScope(map, kind, payload?.options || {});
  const constraintBundle = kind === "states" ? captureRegenerationConstraintBundle(map, {closure: ["world"]}) : null;
  const populationSnapshot = payload?.options?.preservePopulation === true ? captureClimatePopulation(map) : null;
  if (populationSnapshot && !["features", "routes", "rivers"].includes(kind)) {
    throw taskError("worker_regeneration_option_invalid", "preservePopulation 仅支持 features、routes 和 rivers 地理派生重算");
  }
  const setupMs = regenerationTaskMs(regenerationTaskNow() - setupStartedAt);
  const domainStartedAt = regenerationTaskNow();
  const result = regenerateMapAttribute(map, kind, {...scope, constraintBundle, rejectLockedDiplomacy: kind === "states"});
  if (populationSnapshot) restoreClimatePopulation(map, populationSnapshot);
  if (constraintBundle) constraintBundle.assertDomain(map, "world", "after");
  const domainComputeMs = regenerationTaskMs(regenerationTaskNow() - domainStartedAt);
  context.checkpoint?.();
  context.report?.("patch", {message: `正在生成 ${kind} 领域补丁`, progress: 0.85});
  const patchStartedAt = regenerationTaskNow();
  const patch = createDomainPatch(kind, result.executed ? WRITE_SETS[kind] : [], map);
  assertRegenerationWriteSet(kind, patch);
  const patchCaptureMs = regenerationTaskMs(regenerationTaskNow() - patchStartedAt);
  const renderStartedAt = regenerationTaskNow();
  const preparedRender = result.executed && payload?.render
    ? await executeRenderPreparationTask({
        ...payload.render,
        map,
        binding: payload.render.binding || context.binding || null
      }, context)
    : null;
  const renderPrepareWorkerMs = regenerationTaskMs(regenerationTaskNow() - renderStartedAt);
  return {
    kind,
    binding: context.binding || null,
    result: {
      ...result,
      before,
      after: regenerationSummary(map),
      staleSystems: [...(map?.metadata?.derivedStale?.systems || [])],
      effects: ["map-derived", "renderer", "runtime-panel", "object-panels", "object-index"]
    },
    patch,
    refresh: regenerationRefresh(kind),
    preparedRender,
    populationPreserved: Boolean(populationSnapshot),
    timings: {
      setupMs,
      domainComputeMs,
      patchCaptureMs,
      renderPrepareWorkerMs,
      totalTaskMs: regenerationTaskMs(regenerationTaskNow() - taskStartedAt)
    }
  };
}

function regenerationTaskNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function regenerationTaskMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function regenerateMapAttribute(map, kind, options) {
  switch (kind) {
    case "features": return regenerateFeatures(map, options);
    case "routes": return regenerateRoutes(map, options);
    case "rivers": return regenerateRivers(map, options);
    case "cities": return regenerateCities(map, options);
    case "states": return regenerateStates(map, options);
    case "provinces": return regenerateProvinces(map, options);
    case "markers": return regenerateMarkers(map, options);
    case "diplomacy": return regenerateDiplomacy(map, options);
    case "religions": return regenerateReligions(map, options);
    case "military": return regenerateMilitary(map, options);
    case "zones": return regenerateZones(map, options);
    default: throw taskError("worker_regeneration_kind_unsupported", `重生成 Worker 不支持 ${kind || "(empty)"}`);
  }
}

export function regenerateMapAttributeForWorker(map, kind, options = {}) {
  const normalizedKind = normalizeRegenerationKind(kind);
  const scope = normalizeRegenerationScope(map, normalizedKind, options);
  return regenerateMapAttribute(map, normalizedKind, {...options, ...scope});
}

function normalizeRegenerationKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  const aliases = {
    feature: "features", shore: "features", shoreline: "features",
    route: "routes", road: "routes", roads: "routes",
    river: "rivers", hydro: "rivers", hydrology: "rivers",
    city: "cities", settlement: "cities", settlements: "cities", burg: "cities", burgs: "cities",
    state: "states", country: "states", countries: "states", nation: "states", nations: "states",
    province: "provinces", marker: "markers", resource: "markers", resources: "markers",
    diplomatic: "diplomacy", relations: "diplomacy", religion: "religions",
    army: "military", armies: "military", zone: "zones", "region-event": "zones", "region-events": "zones"
  };
  const normalized = aliases[value] || value;
  if (!REGENERATION_WORKER_KINDS.includes(normalized)) {
    throw taskError("worker_regeneration_kind_unsupported", `重生成 Worker 不支持 ${value || "(empty)"}`);
  }
  return normalized;
}

function normalizeRegenerationScope(map, kind, options) {
  const rawScope = typeof options?.scope === "object" ? options.scope?.kind : options?.scope ?? options?.regenerationScope;
  const scopeKind = String(rawScope || "all").trim().toLowerCase();
  if (scopeKind === "all") return {kind: "all"};
  if (!['provinces', 'cities'].includes(kind)) throw taskError("worker_regeneration_scope_invalid", `${kind} 暂不支持局部重设`);
  if (kind === "provinces" && scopeKind !== "state") throw taskError("worker_regeneration_scope_invalid", "省份只能按全图或国家范围重设");
  if (kind === "cities" && !["state", "province"].includes(scopeKind)) throw taskError("worker_regeneration_scope_invalid", "城镇只能按全图、国家或省份范围重设");
  const objectScope = typeof options?.scope === "object" ? options.scope : null;
  const id = Number(scopeKind === "state" ? options?.stateId ?? objectScope?.id ?? options?.id : options?.provinceId ?? objectScope?.id ?? options?.id);
  const rows = scopeKind === "state" ? map?.politics?.states : map?.politics?.provinces;
  if (!Number.isInteger(id) || id <= 0 || !rows?.[id] || rows[id].removed) {
    throw taskError("worker_regeneration_scope_invalid", `${scopeKind === "state" ? "国家" : "省份"} #${id} 不存在或已移除`);
  }
  return {kind: scopeKind, id};
}

function assertRegenerationWriteSet(kind, patch) {
  if (kind !== "rivers") return true;
  const touched = patch.writeSet.find(path => RIVER_FORBIDDEN_WRITE_SET.some(root => path === root || path.startsWith(`${root}.`) || root.startsWith(`${path}.`)));
  if (touched) throw taskError("worker_regeneration_write_set_violation", `河流 Worker 禁止写入道路领域：${touched}`);
  return true;
}

export function getRegenerationPatchPolicy(kind) {
  const normalized = normalizeRegenerationKind(kind);
  return {
    domain: normalized,
    allowedPaths: [...WRITE_SETS[normalized]],
    forbiddenPaths: normalized === "rivers" ? [...RIVER_FORBIDDEN_WRITE_SET] : []
  };
}

function regenerationRefresh(kind) {
  const descriptors = {
    features: {derived: ["terrain-caches", "height-field", "cell-colors", "line-layers", "point-layers", "labels", "object-panels", "object-index"], picking: "all"},
    routes: {derived: ["route-mesh", "object-panels", "object-index"], picking: "all"},
    rivers: {derived: ["river-mesh", "river-width-stats", "cell-colors", "point-layers", "object-panels"], picking: "rivers"},
    cities: {derived: ["point-layers", "labels", "route-mesh", "object-panels", "object-index"], picking: "all"},
    states: {derived: ["cell-colors", "political-boundaries", "point-layers", "labels", "route-mesh", "object-panels", "object-index"], picking: "all"},
    provinces: {derived: ["cell-colors", "political-boundaries", "point-layers", "labels", "route-mesh", "object-panels", "object-index"], picking: "all"},
    markers: {derived: ["point-layers", "object-panels", "object-index"], picking: "all"},
    diplomacy: {derived: ["cell-colors", "line-layers", "object-panels", "object-index"], picking: "all"},
    religions: {derived: ["cell-colors", "object-panels", "object-index"], picking: "all"},
    military: {derived: ["point-layers", "line-layers", "labels", "object-panels", "object-index"], picking: "all"},
    zones: {derived: ["cell-colors", "line-layers", "labels", "object-panels", "object-index"], picking: "all"}
  };
  return descriptors[kind];
}

function regenerateFeatures(map, options = {}) {
  const activeFeatures = (map?.pack?.features || []).filter(feature => feature?.i && !feature.removed);
  if (activeFeatures.length && allRegenerationObjectsLocked(map, OBJECT_KIND.FEATURE, activeFeatures)) {
    return regenerationResult("features", "未执行", "当前 Feature 已全部锁定且拓扑一致，未推进扰动序号。");
  }
  const constraintBundle = options.constraintBundle;
  const locks = constraintBundle ? {snapshots: constraintBundle.lockedFeatures} : captureLockedRegenerationObjects(map, OBJECT_KIND.FEATURE);
  const before = map.features?.metadata?.featureCount || 0;
  nextRegenerationSalt(map, "features");
  const result = rebuildFeatureTopology(map, {lockedFeatures: locks.snapshots});
  if (constraintBundle) constraintBundle.assertDomain(map, "features", "feature-topology");
  else assertLockedRegenerationSnapshots(map, locks);
  markDerivedFresh(map, ["features"]);
  markDerivedStale(map, ["rivers", "routes", "biomes", "cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate features: ${before} -> ${map.features?.metadata?.featureCount || 0}, removed=${result.removedFeatureIds.length}`);
  return regenerationResult("features", `Feature 与岸线已按当前海平面重建：${before} -> ${map.features?.metadata?.featureCount || 0}`, "已先刷新水陆连通、岸线、haven / harbor 和 Feature 身份；河流、道路、国家、省份等后续步骤将继续按顺序重算。");
}

function regenerateRoutes(map) {
  const currentRoutes = map.settlements?.routes || [];
  if (currentRoutes.length && allRegenerationObjectsLocked(map, OBJECT_KIND.ROUTE, currentRoutes)) {
    return regenerationResult("routes", "未执行", "当前道路已全部锁定，未推进扰动序号。");
  }
  const before = currentRoutes.length;
  reconcileSettlementCellIdentity(map);
  const portTopology = reconcileSettlementPortTopology(map, {mode: "routes"});
  const routeLocks = captureLockedRegenerationObjects(map, OBJECT_KIND.ROUTE);
  const cityLocks = captureLockedRegenerationObjects(map, OBJECT_KIND.CITY);
  const routeSalt = nextRegenerationSalt(map, "routes");
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    routeRegenerationSalt: routeSalt,
    lockedRoutes: routeLocks.snapshots
  });
  assertLockedRegenerationSnapshots(map, routeLocks);
  assertLockedRegenerationSnapshots(map, cityLocks);
  const after = map.settlements?.routes?.length || 0;
  markDerivedFresh(map, ["routes"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate routes: salt=${routeSalt}, routes=${map.settlements.metadata.routes}, segments=${map.settlements.metadata.routeSegments}, ports-moved=${portTopology?.moved || 0}, ports-cleared=${portTopology?.cleared || 0}`);
  return regenerationResult("routes", `道路已按当前国家、城镇、港口和陆海约束重算（扰动 #${routeSalt}）：${before} -> ${after}`, `港口拓扑迁移 ${portTopology?.moved || 0}、清除 ${portTopology?.cleared || 0}、保守跳过 ${portTopology?.skipped || 0}；陆路仍通过 pack 邻接寻路并避开水域，海路只连接同水体港口。`);
}

function regenerateRivers(map, options = {}) {
  const currentRivers = map.rivers?.rivers || [];
  if (currentRivers.length && allRegenerationObjectsLocked(map, OBJECT_KIND.RIVER, currentRivers)) {
    return regenerationResult("rivers", "未执行", "当前河流已全部锁定，未推进扰动序号。");
  }
  const constraintBundle = options.constraintBundle;
  const riverLocks = constraintBundle
    ? {snapshots: constraintBundle.lockedRivers, ids: new Set(constraintBundle.ids(OBJECT_KIND.RIVER))}
    : captureLockedRegenerationObjects(map, OBJECT_KIND.RIVER);
  const before = currentRivers.length;
  const riverSalt = nextRegenerationSalt(map, "rivers");
  const riverOptions = {...map.options, namebases: map.namebases, riverRegenerationSalt: riverSalt, lockedRivers: riverLocks.snapshots};
  const nextRivers = buildRivers(map.grid, map.features, map.pack, riverOptions);
  renameHydronymsByCulture(nextRivers, map.pack, {...riverOptions, frozenRiverIds: [...riverLocks.ids].map(Number)});
  map.rivers = nextRivers;
  const biomes = defineBiomesAndPopulation(map.grid, map.pack, map.options);
  map.climate.biomes = biomes.biomes;
  map.climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
  if (constraintBundle) constraintBundle.assertDomain(map, "rivers", "river-build");
  else assertLockedRegenerationSnapshots(map, riverLocks);
  markDerivedFresh(map, ["rivers", "biomes"]);
  markDerivedStale(map, ["routes", "cities", "provinces", "states", "religions", "markers", "zones", "military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate rivers: salt=${riverSalt}, rivers=${map.rivers.metadata.rivers}, stale=${map.metadata.derivedStale.systems.join(",")}`);
  return regenerationResult("rivers", `河流已按当前高度、降水和湖泊约束重算（扰动 #${riverSalt}）：${before} -> ${map.rivers.metadata.rivers}`, "已刷新水文通量、生物群系/人口评分、河流 mesh 和对象索引；道路及其它下游系统已标记为待派生，不会自动重算。");
}

function regenerateCities(map, options = {}) {
  const scope = options;
  const constraintBundle = options.constraintBundle;
  const settlementScope = scope.kind === "all" ? null : {kind: scope.kind, id: scope.id};
  const targetCities = (map.settlements?.cities || []).filter(city => city && !city.removed && (!settlementScope || settlementScopeContainsCity(map, settlementScope, city)));
  if (targetCities.length && allRegenerationObjectsLocked(map, OBJECT_KIND.CITY, targetCities)) {
    return regenerationResult("cities", "未执行", `${regenerationScopeLabel(map, scope)}城镇已全部锁定，未推进扰动序号。`);
  }
  const cityLocks = constraintBundle ? {snapshots: constraintBundle.lockedCities} : captureLockedRegenerationObjects(map, OBJECT_KIND.CITY);
  const routeLocks = constraintBundle ? {snapshots: constraintBundle.lockedRoutes} : captureLockedRegenerationObjects(map, OBJECT_KIND.ROUTE);
  const scopedLockedIds = new Set(cityLocks.snapshots.filter(city => !settlementScope || settlementScopeContainsCity(map, settlementScope, city)).map(city => Number(city.id)));
  const beforeCities = countRows(map.settlements?.cities);
  const beforePorts = (map.settlements?.cities || []).filter(city => city?.port).length;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const targetCityIds = settlementScope ? targetCities.filter(city => !scopedLockedIds.has(Number(city.id))).map(city => city.id) : null;
  const citySalt = nextRegenerationSalt(map, "cities");
  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: citySalt,
    routeRegenerationSalt: citySalt,
    settlementScope,
    lockedCities: cityLocks.snapshots,
    lockedRoutes: routeLocks.snapshots,
    reassessProvincialCapitals: true,
    repairInconsistentProvincialCapitals: true
  });
  if (constraintBundle) constraintBundle.assertDomain(map, "cities-routes", "settlement-routes");
  else {
    assertLockedRegenerationSnapshots(map, cityLocks);
    assertLockedRegenerationSnapshots(map, routeLocks);
  }
  clearGeneratedCityLabelHides(map, targetCityIds);
  markDerivedFresh(map, ["cities"]);
  markDerivedStale(map, ["provinces", "states", "religions", "markers", "zones", "military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate settlements: scope=${regenerationScopeLog(scope)}, salt=${citySalt}, cities=${map.settlements.metadata.cities}, ports=${map.settlements.metadata.ports}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);
  return regenerationResult("cities", `${regenerationScopeLabel(map, scope)}城镇已按当前适居度、文化、政区、港口和间距约束重算（扰动 #${citySalt}）：${beforeCities} -> ${map.settlements.metadata.cities}；港口 ${beforePorts} -> ${map.settlements.metadata.ports}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`, "已保留目标范围内的国家首都、省会锚点与目标范围外城镇身份，只替换目标范围内普通城镇；道路按全图关系同步重建。");
}

function regenerateStates(map, options = {}) {
  const constraintBundle = options.constraintBundle;
  const currentStates = (map.politics?.states || []).filter(item => item?.i && !item.removed);
  if (currentStates.length && allRegenerationObjectsLocked(map, OBJECT_KIND.STATE, currentStates)) {
    return regenerationResult("states", "未执行", "当前国家已全部锁定，未推进扰动序号。");
  }
  const capturedStateLocks = constraintBundle ? {snapshots: constraintBundle.lockedStates} : captureLockedRegenerationObjects(map, OBJECT_KIND.STATE);
  const stateLocks = constraintBundle ? {snapshots: mergeLockedEconomicStates(map, capturedStateLocks.snapshots, constraintBundle)} : capturedStateLocks;
  const provinceLocks = constraintBundle ? {snapshots: constraintBundle.lockedProvinces} : captureLockedRegenerationObjects(map, OBJECT_KIND.PROVINCE);
  const lockedProvinces = mergeLockedPoliticalProvinces(map, stateLocks.snapshots, provinceLocks.snapshots);
  const capturedCityLocks = constraintBundle ? {snapshots: constraintBundle.lockedCities} : captureLockedRegenerationObjects(map, OBJECT_KIND.CITY);
  const cityLocks = constraintBundle ? {snapshots: mergeLockedEconomicCities(map, capturedCityLocks.snapshots, constraintBundle)} : capturedCityLocks;
  const lockedCities = mergeLockedPoliticalCities(map, stateLocks.snapshots, lockedProvinces, cityLocks.snapshots);
  const routeLocks = constraintBundle ? {snapshots: constraintBundle.lockedRoutes} : captureLockedRegenerationObjects(map, OBJECT_KIND.ROUTE);
  const diplomacyLocks = constraintBundle ? constraintBundle.lockedDiplomacyRelations : captureLockedRegenerationObjects(map, OBJECT_KIND.DIPLOMACY_RELATION).snapshots;
  if (diplomacyLocks.length && options.rejectLockedDiplomacy) {
    const first = diplomacyLocks[0];
    throw regenerationLockConflict(OBJECT_KIND.DIPLOMACY_RELATION, {kind: OBJECT_KIND.DIPLOMACY_RELATION, id: first.id}, "state-regeneration-cannot-preserve-diplomacy", "国家重生成无法保证锁定外交关系的国家端点，已在写入前中止");
  }
  const beforeStates = map.politics?.metadata?.states || 0;
  const beforeProvinces = map.politics?.metadata?.provinces || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const previousSalt = captureRegenerationSalt(map, "states");
  const salt = nextRegenerationSalt(map, "states");
  const result = regeneratePackStatesAndProvinces(map.grid, map.society, {
    ...map.options,
    namebases: map.namebases,
    lockedStates: stateLocks.snapshots,
    lockedProvinces,
    lockedCities,
    lockedRoutes: routeLocks.snapshots,
    reassessProvincialCapitals: true,
    repairInconsistentProvincialCapitals: true
  }, map.pack, map.settlements, {salt});
  if (!result) {
    restoreRegenerationSalt(map, previousSalt);
    return regenerationResult("states", "未执行", "当前地图缺少可用城镇或 pack 语义图，无法重选首都并扩张国家。");
  }
  applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    pruneNeutralSettlements: true,
    routeRegenerationSalt: salt,
    lockedStates: stateLocks.snapshots,
    lockedProvinces,
    lockedCities,
    lockedRoutes: routeLocks.snapshots,
    reassessProvincialCapitals: true
  });
  if (constraintBundle) constraintBundle.assertDomain(map, "states-provinces", "politics-settlements");
  else for (const capture of [stateLocks, provinceLocks, cityLocks, routeLocks]) assertLockedRegenerationSnapshots(map, capture);
  markDerivedFresh(map, ["states", "provinces", "cities"]);
  markDerivedStale(map, ["religions", "markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate states: salt=${salt}, states=${map.politics.metadata.states}, provinces=${map.politics.metadata.provinces}, routes=${map.settlements.metadata.routes}, ${riverBoundaryLog(result.riverBoundaries)}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);
  return regenerationResult("states", `国家已重选首都并按当前文化、人口和地形约束重算（扰动 #${salt}）：${beforeStates} -> ${map.politics.metadata.states}；省份 ${beforeProvinces} -> ${map.politics.metadata.provinces}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`, "已刷新国家/省份归属、城市政区、路线、标签、边界和对象索引；宗教、标记、区域、军事、经济已标记为待派生。", {riverBoundaries: result.riverBoundaries});
}

function regenerateProvinces(map, options = {}) {
  const scope = options;
  const constraintBundle = options.constraintBundle;
  const targetProvinces = (map.politics?.provinces || []).filter(province => province?.i && !province.removed && (scope.kind === "all" || Number(province.state) === scope.id));
  if (targetProvinces.length && allRegenerationObjectsLocked(map, OBJECT_KIND.PROVINCE, targetProvinces)) {
    return regenerationResult("provinces", "未执行", `${regenerationScopeLabel(map, scope)}省份已全部锁定，未推进扰动序号。`);
  }
  const provinceLocks = constraintBundle ? {snapshots: constraintBundle.lockedProvinces} : captureLockedRegenerationObjects(map, OBJECT_KIND.PROVINCE);
  const cityLocks = constraintBundle ? {snapshots: constraintBundle.lockedCities} : captureLockedRegenerationObjects(map, OBJECT_KIND.CITY);
  const lockedCities = mergeLockedPoliticalCities(map, [], provinceLocks.snapshots, cityLocks.snapshots);
  const routeLocks = constraintBundle ? {snapshots: constraintBundle.lockedRoutes} : captureLockedRegenerationObjects(map, OBJECT_KIND.ROUTE);
  const beforeProvinces = map.politics?.metadata?.provinces || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const previousSalt = captureRegenerationSalt(map, "provinces");
  const salt = nextRegenerationSalt(map, "provinces");
  const result = scope.kind === "state"
    ? withScopedProvinceRegenerationOptions(map, {
      lockedProvinces: provinceLocks.snapshots,
      lockedCities: cityLocks.snapshots
    }, () => regenerateProvincesForStates(map, [scope.id]))
    : regeneratePackProvincesWithinStates(map.grid, map.society, {
      ...map.options,
      namebases: map.namebases,
      lockedProvinces: provinceLocks.snapshots,
      lockedCities: cityLocks.snapshots
    }, map.pack, {salt});
  if (!result) {
    restoreRegenerationSalt(map, previousSalt);
    return regenerationResult("provinces", "未执行", "当前地图缺少可用国家或 pack 语义图，无法在国家内重建省份。");
  }
  if (scope.kind === "all") applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    routeRegenerationSalt: salt,
    lockedProvinces: provinceLocks.snapshots,
    lockedCities,
    lockedRoutes: routeLocks.snapshots,
    settlementScope: scope.kind === "state" ? {kind: "state", id: scope.id} : null,
    reassessProvincialCapitals: true,
    repairInconsistentProvincialCapitals: true
  });
  if (constraintBundle) constraintBundle.assertDomain(map, "states-provinces", "province-settlements");
  else for (const capture of [provinceLocks, cityLocks, routeLocks]) assertLockedRegenerationSnapshots(map, capture);
  markDerivedFresh(map, ["provinces", "cities"]);
  markDerivedStale(map, ["markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate provinces: scope=${regenerationScopeLog(scope)}, salt=${salt}, provinces=${map.politics.metadata.provinces}, routes=${map.settlements.metadata.routes}, ${riverBoundaryLog(result.riverBoundaries)}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);
  return regenerationResult("provinces", `省份已在${regenerationScopeLabel(map, scope)}内重算（扰动 #${salt}）：${beforeProvinces} -> ${map.politics.metadata.provinces}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`, "已刷新省份归属、省会/城市省份、路线、标签、边界和对象索引；标记、区域、军事、经济已标记为待派生。", {riverBoundaries: result.riverBoundaries});
}

function regenerateReligions(map, options = {}) {
  const constraintBundle = options.constraintBundle;
  if (!map?.pack?.cells?.s || !map?.society || !map?.settlements) return regenerationResult("religions", "未执行", "当前地图缺少 pack 社会、文化或城镇数据，无法重新扩张宗教。");
  const active = (map.society?.religions || map.pack?.religions || []).filter(religion => religion?.i && !religion.removed);
  if (active.length && allRegenerationObjectsLocked(map, OBJECT_KIND.RELIGION, active)) {
    return regenerationResult("religions", "未执行", "当前宗教已全部锁定，未推进扰动序号。");
  }
  const religionLocks = constraintBundle ? {snapshots: constraintBundle.lockedReligions} : captureLockedRegenerationObjects(map, OBJECT_KIND.RELIGION);
  const cultureLocks = constraintBundle ? {snapshots: constraintBundle.lockedCultures} : captureLockedRegenerationObjects(map, OBJECT_KIND.CULTURE);
  const lockedProvinces = constraintBundle ? mergeLockedPoliticalProvinces(map, constraintBundle.lockedStates, constraintBundle.lockedProvinces) : [];
  const lockedCities = constraintBundle ? mergeLockedPoliticalCities(map, constraintBundle.lockedStates, lockedProvinces, constraintBundle.lockedCities) : [];
  const before = Number(map.society?.metadata?.religions) || 0;
  const salt = nextRegenerationSalt(map, "religions");
  const seed = `${map.options?.seed || "map"}:regenerate-religions:${salt}`;
  finalizeSocietyReligions(map.grid, map.society, map.pack, createRandom(seed), map.settlements, {
    ...map.options,
    namebases: map.namebases,
    seed,
    lockedReligions: religionLocks.snapshots,
    lockedCultures: cultureLocks.snapshots,
    lockedStates: constraintBundle?.lockedStates || [],
    lockedProvinces,
    lockedCities
  });
  if (constraintBundle) {
    constraintBundle.assertDomain(map, "religions", "religion-finalize");
    constraintBundle.assertDomain(map, "cultures", "religion-culture-support");
  } else {
    assertLockedRegenerationSnapshots(map, religionLocks);
    assertLockedRegenerationSnapshots(map, cultureLocks);
  }
  markDerivedFresh(map, ["religions"]);
  markDerivedStale(map, ["diplomacy", "military", "zones"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate religions: salt=${salt}, religions=${map.society.metadata.religions}`);
  return regenerationResult("religions", `宗教已按当前文化、城镇和人口重新扩张（扰动 #${salt}）：${before} -> ${map.society.metadata.religions}`, "已刷新宗教归属、覆盖统计和对象索引；外交、军事和地区仍标记为待派生。");
}

function regenerateMarkers(map, options = {}) {
  const resources = (map?.markers?.markers || []).filter(marker => marker?.category === "resource");
  if (!map?.pack?.cells?.i?.length || !Array.isArray(map?.markers?.markers) || resources.length > 0 && allRegenerationObjectsLocked(map, OBJECT_KIND.MARKER, resources)) {
    return regenerationResult("markers", "未执行", "当前资源点已全部锁定，未推进扰动序号。");
  }
  const beforeResources = map.markers?.metadata?.resourceMarkers || 0;
  const beforePotential = map.markers?.metadata?.resourcePotential || 0;
  const salt = peekRegenerationSalt(map, "markers");
  const command = createRegenerateResourceMarkersCommand({salt, constraintBundle: options.constraintBundle || null});
  if (command.isNoop?.({map})) return regenerationResult("markers", "未执行", "当前地图缺少可用 pack 语义图或标记集合，无法重生成资源点。");
  nextRegenerationSalt(map, "markers");
  command.apply({map});
  markDerivedFresh(map, ["markers", "economy"]);
  markDerivedStale(map, ["military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate resources: salt=${salt}, resources=${map.markers.metadata.resourceMarkers}, resourcePotential=${map.markers.metadata.resourcePotential}, markerResourceDeals=${map.economy?.metadata?.resourceTrade?.markerResourceDeals || 0}`);
  return regenerationResult("markers", `资源点已按当前地形、河流、生物群系、温度和降水约束重算（扰动 #${salt}）：${beforeResources} -> ${map.markers.metadata.resourceMarkers}；资源潜力 ${beforePotential} -> ${map.markers.metadata.resourcePotential}`, "已刷新资源 marker、正式货物来源、市场库存、交易、国家/省份资源潜力、点图层、对象索引和统计；军事与外交已标记为待派生。");
}

function regenerateDiplomacy(map, options = {}) {
  const states = (map?.pack?.states || map?.politics?.states || []).filter(item => item?.i && !item.removed);
  if (states.length < 2) return regenerationResult("diplomacy", "未执行", "当前地图至少需要两个有效国家才能重生成外交。");
  const pairs = [];
  for (let left = 0; left < states.length; left++) for (let right = left + 1; right < states.length; right++) pairs.push({id: `${Math.min(states[left].i, states[right].i)}:${Math.max(states[left].i, states[right].i)}`});
  if (pairs.length && allRegenerationObjectsLocked(map, OBJECT_KIND.DIPLOMACY_RELATION, pairs)) {
    return regenerationResult("diplomacy", "未执行", "当前外交国家对已全部锁定，未推进扰动序号。");
  }
  const lockCapture = options.constraintBundle ? {snapshots: options.constraintBundle.lockedDiplomacyRelations} : captureLockedRegenerationObjects(map, OBJECT_KIND.DIPLOMACY_RELATION);
  const beforePairs = map.diplomacy?.metadata?.pairs || 0;
  const beforeEnemies = map.diplomacy?.metadata?.enemies || 0;
  const salt = peekRegenerationSalt(map, "diplomacy");
  const command = createRegenerateDiplomacyCommand({salt, preservedRelations: lockCapture.snapshots});
  if (command.isNoop?.({map})) return regenerationResult("diplomacy", "未执行", "当前外交国家对已全部锁定，未推进扰动序号。");
  nextRegenerationSalt(map, "diplomacy");
  command.apply({map});
  if (options.constraintBundle) options.constraintBundle.assertDomain(map, "diplomacy", "diplomacy-build");
  else assertLockedRegenerationSnapshots(map, lockCapture);
  markDerivedFresh(map, ["diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate diplomacy: salt=${salt}, pairs=${map.diplomacy.metadata.pairs}, enemies=${map.diplomacy.metadata.enemies}`);
  return regenerationResult("diplomacy", `外交已按当前国家邻接、文化、宗教、国力、资源竞争和海洋势力重算（扰动 #${salt}）：关系 ${beforePairs} -> ${map.diplomacy.metadata.pairs}；战争 ${beforeEnemies} -> ${map.diplomacy.metadata.enemies}`, "外交重算不会改写国家边界、城镇、经济或军队；战争状态只保留为外交记录和静态军事摘要上下文。");
}

function regenerateMilitary(map, options = {}) {
  const validStates = (map?.pack?.states || []).filter(state => state?.i && !state.removed);
  if (!map?.pack?.cells?.i?.length || !validStates.length) return regenerationResult("military", "未执行", "当前地图缺少 pack cells 或有效国家数据，无法重建军事。");
  const regiments = militaryRegiments(map);
  if (regiments.length && allRegenerationObjectsLocked(map, OBJECT_KIND.MILITARY, regiments)) {
    return regenerationResult("military", "未执行", "当前军团已全部锁定，未推进扰动序号。");
  }
  const lockCapture = options.constraintBundle ? {snapshots: options.constraintBundle.lockedMilitaryRegiments} : captureLockedRegenerationObjects(map, OBJECT_KIND.MILITARY);
  const before = militaryCounts(map);
  const previousEvents = Number(map.military?.events?.length || 0);
  const salt = peekRegenerationSalt(map, "military");
  const seed = `${map.options?.seed || "map"}:regenerate-military:${salt}`;
  const command = createRegenerateMilitaryCommand({seed, preservedRegiments: lockCapture.snapshots});
  if (command.isNoop?.({map})) return regenerationResult("military", "未执行", "当前军事数据不存在或全部军团已锁定，未推进扰动序号。");
  nextRegenerationSalt(map, "military");
  command.apply({map});
  const commandResult = command.getResult?.() || {};
  if (options.constraintBundle) options.constraintBundle.assertDomain(map, "military", "military-build");
  else assertLockedRegenerationSnapshots(map, lockCapture);
  const variation = commandResult.variation || compareMilitaryVariation(snapshotMilitaryVariation(map), snapshotMilitaryVariation(map));
  const attempts = Number(commandResult.attempts) || 1;
  markDerivedFresh(map, ["military"]);
  markDerivedStale(map, ["zones"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate military: salt=${salt}, attempts=${attempts}, changed=${variation.changedRegiments}, regiments=${map.military.metadata.regiments}, troops=${map.military.metadata.troops}`);
  const after = militaryCounts(map);
  return {...regenerationResult("military", `军事已按当前国家、人口、经济和外交重算（扰动 #${salt}）：变化军团 ${variation.changedRegiments}；兵力 ${variation.troopChanges}；编成 ${variation.compositionChanges}；态势 ${variation.statusChanges}；驻地 ${variation.positionChanges}`, `军团 ${before.regiments} -> ${after.regiments}；战线 ${before.fronts} -> ${after.fronts}；战役 ${before.campaigns} -> ${after.campaigns}。已刷新军事图标、标签、战线和对象索引；地区仍标记为待派生。`), details: {regenerationSalt: salt, attempts, variation, before, after, preservedBattleEvents: previousEvents}};
}

function regenerateZones(map) {
  if (!map?.pack?.cells?.i?.length) return regenerationResult("zones", "未执行", "当前地图缺少 pack cells，无法重建地区。");
  const currentZones = map.zones?.zones || map.pack?.zones || [];
  if (currentZones.length > 0 && allRegenerationObjectsLocked(map, OBJECT_KIND.ZONE, currentZones)) {
    return regenerationResult("zones", "未执行", "当前地区已全部锁定，未推进扰动序号。");
  }
  const lockCapture = captureLockedRegenerationObjects(map, OBJECT_KIND.ZONE);
  const before = Number(map.zones?.metadata?.zones) || 0;
  const salt = nextRegenerationSalt(map, "zones");
  const seed = `${map.options?.seed || "map"}:regenerate-zones:${salt}`;
  map.zones = buildZones(map.pack, {...map.options, seed, preservedZones: lockCapture.snapshots});
  assertLockedRegenerationSnapshots(map, lockCapture);
  markDerivedFresh(map, ["zones"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate zones: salt=${salt}, zones=${map.zones.metadata.zones}, cells=${map.zones.metadata.cells}`);
  return regenerationResult("zones", `地区已按当前战争、宗教、军事与地形上下文重算（扰动 #${salt}）：${before} -> ${map.zones.metadata.zones}`, "已刷新地区覆盖、名称、统计和对象索引。");
}

function mergeLockedPoliticalProvinces(map, lockedStates = [], lockedProvinces = []) {
  const byId = new Map();
  for (const province of lockedProvinces) {
    const id = Number(province?.i ?? province?.id);
    if (Number.isInteger(id) && id > 0) byId.set(id, structuredClone(province));
  }
  for (const state of lockedStates) for (const provinceId of state?.provinces || []) {
    const id = Number(provinceId);
    const province = map?.politics?.provinces?.[id] || map?.pack?.provinces?.[id];
    if (Number.isInteger(id) && id > 0 && province && !province.removed && !byId.has(id)) byId.set(id, structuredClone(province));
  }
  return [...byId.values()];
}

function mergeLockedPoliticalCities(map, lockedStates = [], lockedProvinces = [], lockedCities = []) {
  const byId = new Map();
  for (const city of lockedCities) if (city?.id !== undefined) byId.set(String(city.id), structuredClone(city));
  const stateIds = new Set(lockedStates.map(state => Number(state?.i ?? state?.id)).filter(Number.isInteger));
  const provinceIds = new Set(lockedProvinces.map(province => Number(province?.i ?? province?.id)).filter(Number.isInteger));
  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed || city.id === undefined) continue;
    const packCell = Number(city.packCell);
    const stateId = Number.isInteger(packCell) ? Number(map?.pack?.cells?.state?.[packCell]) : Number(city.state);
    const provinceId = Number.isInteger(packCell) ? Number(map?.pack?.cells?.province?.[packCell]) : Number(city.province);
    if ((stateIds.has(stateId) || provinceIds.has(provinceId)) && !byId.has(String(city.id))) byId.set(String(city.id), structuredClone(city));
  }
  return [...byId.values()];
}

function mergeLockedEconomicStates(map, lockedStates = [], constraintBundle = null) {
  const byId = new Map(lockedStates.map(state => [Number(state?.i ?? state?.id), state]));
  const marketById = new Map((map?.pack?.markets || []).filter(Boolean).map(market => [Number(market.i ?? market.id), market]));
  const add = stateId => {
    const id = Number(stateId);
    const state = map?.politics?.states?.[id] || map?.pack?.states?.[id];
    if (Number.isInteger(id) && id > 0 && state && !byId.has(id)) byId.set(id, structuredClone(state));
  };
  for (const market of constraintBundle?.lockedMarkets || []) add(market?.state);
  for (const deal of constraintBundle?.lockedDeals || []) for (const [type, value] of [[deal?.sellerType, deal?.seller], [deal?.buyerType, deal?.buyer]]) {
    if (type === "market") add(marketById.get(Number(value))?.state);
    if (type === "burg") add(map?.pack?.burgs?.[Number(value)]?.state);
  }
  for (const relation of constraintBundle?.lockedDiplomacyRelations || []) {
    add(relation?.leftId);
    add(relation?.rightId);
  }
  for (const regiment of constraintBundle?.lockedMilitaryRegiments || []) add(regiment?.stateId);
  return [...byId.values()];
}

function mergeLockedEconomicCities(map, lockedCities = [], constraintBundle = null) {
  const byId = new Map(lockedCities.map(city => [String(city?.id ?? city?.i), city]));
  const burgIds = new Set();
  const marketById = new Map((map?.pack?.markets || []).filter(Boolean).map(market => [Number(market.i ?? market.id), market]));
  for (const market of constraintBundle?.lockedMarkets || []) {
    const burgId = Number(market?.centerBurgId);
    if (Number.isInteger(burgId) && burgId > 0) burgIds.add(burgId);
  }
  for (const deal of constraintBundle?.lockedDeals || []) for (const [type, value] of [[deal?.sellerType, deal?.seller], [deal?.buyerType, deal?.buyer]]) {
    const burgId = type === "burg" ? Number(value) : type === "market" ? Number(marketById.get(Number(value))?.centerBurgId) : 0;
    if (Number.isInteger(burgId) && burgId > 0) burgIds.add(burgId);
  }
  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed || !burgIds.has(Number(city.burgId))) continue;
    const id = String(city.id ?? city.i);
    if (!byId.has(id)) byId.set(id, structuredClone(city));
  }
  return [...byId.values()];
}

function applyPoliticsRegenerationResult(map, result) {
  if (result.states) {
    map.politics.states = result.states;
    map.pack.states = result.states;
  }
  if (result.provinces) {
    map.politics.provinces = result.provinces;
    map.pack.provinces = result.provinces;
  }
  if (result.timing) map.politics.timing = result.timing;
  if (result.provinceTiming) map.politics.provinceTiming = result.provinceTiming;
  map.politics.metadata = {
    ...(map.politics.metadata || {}),
    ...result.metadata,
    states: result.metadata?.states ?? map.politics.metadata?.states ?? countRows(map.politics.states, true),
    provinces: result.metadata?.provinces ?? map.politics.metadata?.provinces ?? countRows(map.politics.provinces, true),
    regions: map.politics.metadata?.regions ?? countRows(map.politics.regions),
    stateNames: result.metadata?.stateNames ?? politicalNames(map.politics.states),
    provinceNames: result.metadata?.provinceNames ?? politicalNames(map.politics.provinces),
    regionNames: map.politics.metadata?.regionNames ?? politicalNames(map.politics.regions)
  };
}

function politicalNames(rows) {
  return (rows || []).filter(item => item && !item.removed && Number(item.i ?? item.id) > 0).map(item => item.fullName || item.name);
}

function regenerationScopeLabel(map, scope) {
  if (scope.kind === "all") return "全图";
  const rows = scope.kind === "state" ? map?.politics?.states : map?.politics?.provinces;
  const record = rows?.[scope.id];
  return `“${record?.fullName || record?.name || `${scope.kind === "state" ? "国家" : "省份"} #${scope.id}`}”`;
}

function regenerationScopeLog(scope) {
  return scope.kind === "all" ? "all" : `${scope.kind}:${scope.id}`;
}

function settlementScopeContainsCity(map, scope, city) {
  if (scope.kind === "state") return Number(city.state) === scope.id;
  const packCell = Number(city.packCell);
  return Number(city.province) === scope.id || Number.isInteger(packCell) && Number(map?.pack?.cells?.province?.[packCell]) === scope.id;
}

function clearGeneratedCityLabelHides(map, cityIds = null) {
  const store = ensureLabelStore(map);
  if (Array.isArray(cityIds)) {
    const targets = new Set(cityIds.map(Number));
    store.hidden[LABEL_TARGET_KIND.CITY] = store.hidden[LABEL_TARGET_KIND.CITY].filter(id => !targets.has(Number(id)));
  } else store.hidden[LABEL_TARGET_KIND.CITY] = [];
  store.metadata = {custom: store.custom.length, hidden: store.hidden[LABEL_TARGET_KIND.CITY].length + store.hidden[LABEL_TARGET_KIND.STATE].length};
}

function militaryRegiments(map) {
  return (map?.pack?.states || map?.politics?.states || []).flatMap(state => state?.military || []);
}

function militaryCounts(map) {
  return {
    regiments: Number(map?.military?.metadata?.regiments) || militaryRegiments(map).length,
    fronts: Number(map?.military?.metadata?.fronts) || map?.military?.fronts?.length || 0,
    campaigns: Number(map?.military?.metadata?.campaigns) || map?.military?.campaigns?.length || 0
  };
}

function regenerationSummary(map) {
  return {
    checksum: map?.metadata?.checksum || map?.summary?.checksum || "",
    states: countRows(map?.politics?.states, true),
    provinces: countRows(map?.politics?.provinces, true),
    cities: countRows(map?.settlements?.cities),
    routes: countRows(map?.settlements?.routes),
    rivers: countRows(map?.rivers?.rivers),
    markers: countRows(map?.markers?.markers),
    resourceMarkers: Number(map?.markers?.metadata?.resourceMarkers) || 0,
    religions: Number(map?.society?.metadata?.religions) || 0,
    militaryRegiments: Number(map?.military?.metadata?.regiments) || 0,
    militaryFronts: Number(map?.military?.metadata?.fronts) || map?.military?.fronts?.length || 0,
    militaryCampaigns: Number(map?.military?.metadata?.campaigns) || map?.military?.campaigns?.length || 0,
    zones: Number(map?.zones?.metadata?.zones) || 0,
    economyDeals: Number(map?.economy?.metadata?.deals) || 0,
    diplomacyPairs: Number(map?.diplomacy?.metadata?.pairs) || 0,
    diplomacyEnemies: Number(map?.diplomacy?.metadata?.enemies) || 0
  };
}

function refreshGenerationSummary(map) {
  map.summary = createGenerationSummary(map.options, map.grid, map.features, map.climate, map.society, map.politics, map.settlements, map.markers, map.pack, map.rivers, map.layers, map.military, map.zones, map.economy, map.diplomacy);
}

function nextRegenerationSalt(map, kind) {
  map.metadata ||= {};
  map.metadata.regeneration ||= {};
  const next = (Number(map.metadata.regeneration[kind]) || 0) + 1;
  map.metadata.regeneration[kind] = next;
  return next;
}

function peekRegenerationSalt(map, kind) {
  return (Number(map?.metadata?.regeneration?.[kind]) || 0) + 1;
}

function captureRegenerationSalt(map, kind) {
  const store = map?.metadata?.regeneration;
  return {kind, hadStore: Boolean(store && typeof store === "object"), hadValue: Boolean(store && Object.prototype.hasOwnProperty.call(store, kind)), value: store?.[kind]};
}

function restoreRegenerationSalt(map, snapshot) {
  if (!snapshot.hadStore) {
    delete map.metadata.regeneration;
    return;
  }
  map.metadata.regeneration ||= {};
  if (snapshot.hadValue) map.metadata.regeneration[snapshot.kind] = snapshot.value;
  else delete map.metadata.regeneration[snapshot.kind];
}

function markDerivedStale(map, systems) {
  if (!map?.metadata) return;
  const nextSystems = [...new Set([...(map.metadata.derivedStale?.systems || []), ...systems])];
  map.metadata.derivedStale = {systems: nextSystems, updatedAt: new Date().toISOString()};
  if (map?.military?.metadata) map.military.metadata.stale = nextSystems.includes("military");
  if (map?.zones?.metadata) map.zones.metadata.stale = nextSystems.includes("zones");
  if (map?.markers?.metadata) map.markers.metadata.stale = nextSystems.includes("markers");
  if (map?.economy?.metadata) map.economy.metadata.stale = nextSystems.includes("economy");
  if (map?.diplomacy?.metadata) map.diplomacy.metadata.stale = nextSystems.includes("diplomacy");
}

function markDerivedFresh(map, systems) {
  if (!map?.metadata) return;
  const stale = new Set(map?.metadata?.derivedStale?.systems || []);
  for (const system of systems) stale.delete(system);
  const nextSystems = [...stale];
  if (nextSystems.length) map.metadata.derivedStale = {systems: nextSystems, updatedAt: new Date().toISOString()};
  else delete map.metadata.derivedStale;
  if (map?.military?.metadata) map.military.metadata.stale = nextSystems.includes("military");
  if (map?.zones?.metadata) map.zones.metadata.stale = nextSystems.includes("zones");
  if (map?.markers?.metadata) map.markers.metadata.stale = nextSystems.includes("markers");
  if (map?.economy?.metadata) map.economy.metadata.stale = nextSystems.includes("economy");
  if (map?.diplomacy?.metadata) map.diplomacy.metadata.stale = nextSystems.includes("diplomacy");
}

function appendGenerationLog(map, message) {
  if (!Array.isArray(map.generationLog)) map.generationLog = [];
  map.generationLog.push(message);
}

function regenerationResult(kind, status, constraint, details = null) {
  return {...createRegenerationResult(kind, status, constraint), details};
}

function riverBoundaryLog(diagnostics) {
  const model = diagnostics?.model;
  const states = diagnostics?.states;
  const provinces = diagnostics?.provinces;
  return `river-boundaries=${model?.strong || 0}/${model?.candidates || 0}, state-adoption=${states?.adoptionRate || 0}, province-adoption=${provinces?.adoptionRate || 0}`;
}

function countRows(rows, positive = false) {
  return (rows || []).filter(item => item && !item.removed && (!positive || Number(item.i ?? item.id) > 0)).length;
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
