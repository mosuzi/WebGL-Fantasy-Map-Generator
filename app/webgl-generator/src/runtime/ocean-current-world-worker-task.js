import {createGenerationSummary} from "../generator/index.js";
import {
  assertOceanCurrentWorldIdentity,
  rebuildOceanCurrentWorldStage,
  snapshotOceanCurrentWorldIdentity
} from "../generator/ocean-current-world.js";
import {reconcileWarDerivedData} from "../generator/war-consistency.js";
import {ensureLabelStore} from "./label-edit-commands.js";
import {syncMilitaryStateMirrors} from "./military-regeneration-variation.js";
import {LABEL_TARGET_KIND} from "./object-kinds.js";
import {
  OCEAN_CURRENT_WORLD_REBUILD_ORDER,
  inspectOceanCurrentWorldRebuild
} from "./ocean-current-world-rebuild.js";
import {captureRegenerationConstraintBundle} from "./regeneration-constraint-bundle.js";
import {createResetSeafloorCommand} from "./seafloor-reset.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const OCEAN_CURRENT_WORLD_WORKER_TASK = "ocean-current-world.compute";

export async function runOceanCurrentWorldWorkerTask(payload, context = {}) {
  const map = payload?.map;
  if (!map || typeof map !== "object") throw taskError("worker_ocean_current_world_map_missing", "洋流世界 Worker 缺少地图快照");
  const seafloorPlan = payload?.seafloorPlan || null;
  const preview = inspectOceanCurrentWorldRebuild(map, {
    seed: payload?.seed,
    includeSeafloor: Boolean(seafloorPlan)
  });
  if (!preview.valid) {
    return emptyResult(preview, context.binding, "world-input-invalid");
  }
  const constraintBundle = captureRegenerationConstraintBundle(map, {closure: ["world"]});
  if (constraintBundle.isDomainFullyLocked("world")) {
    return emptyResult(preview, context.binding, "domain-fully-locked");
  }

  const identity = snapshotOceanCurrentWorldIdentity(map);
  const steps = [];
  checkpoint(context);
  report(context, "prepare", "正在准备洋流世界整链重算", 0.03);
  if (seafloorPlan) {
    failAt(payload?.faultAt, "before:seafloor");
    const command = createResetSeafloorCommand(seafloorPlan);
    if (command.isNoop?.({map})) throw taskError("worker_ocean_current_world_seafloor_noop", "海底重设准备阶段没有可应用变化");
    command.apply({map});
    steps.push({system: "seafloor", result: {executed: true, result: command.getResult?.()}});
    failAt(payload?.faultAt, "after:seafloor");
    checkpoint(context);
  }

  for (let index = 0; index < OCEAN_CURRENT_WORLD_REBUILD_ORDER.length; index++) {
    const system = OCEAN_CURRENT_WORLD_REBUILD_ORDER[index];
    report(context, system, `正在重算${systemLabel(system)}`, 0.08 + (index / OCEAN_CURRENT_WORLD_REBUILD_ORDER.length) * 0.8);
    checkpoint(context);
    failAt(payload?.faultAt, `before:${system}`);
    const result = await rebuildOceanCurrentWorldStage(map, system, {
      seed: preview.seed,
      signal: context.signal || null,
      constraintBundle
    });
    if (!result || result.executed === false && result.reason !== "domain-fully-locked") {
      throw taskError("worker_ocean_current_world_incomplete", `洋流世界重算未完成：${system}`);
    }
    steps.push({system, result});
    failAt(payload?.faultAt, `after:${system}`);
    checkpoint(context);
  }

  assertOceanCurrentWorldIdentity(map, identity);
  syncMilitaryStateMirrors(map);
  reconcileWarDerivedData(map);
  clearGeneratedCityLabelHides(map);
  markDerivedFresh(map, [
    "ocean-currents", "climate", "rivers", "biomes", "population", "cultures", "cities", "routes",
    "states", "provinces", "religions", "markers", "economy", "diplomacy", "military", "zones"
  ]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `rebuild ocean current world: seed=${payload?.seed || "auto"}, seafloor=${Boolean(seafloorPlan)}`);
  constraintBundle.assertDomain(map, "world", "after");
  checkpoint(context);
  report(context, "replacement", "正在准备洋流世界替换结果", 0.95);
  return {
    kind: "ocean-current-world",
    binding: context.binding || null,
    result: {
      executed: true,
      seed: preview.seed,
      includeSeafloor: Boolean(seafloorPlan),
      executionOrder: [...OCEAN_CURRENT_WORLD_REBUILD_ORDER],
      steps: steps.map(step => ({
        system: step.system,
        executed: step.result?.executed !== false,
        reason: step.result?.reason || ""
      })),
      staleSystems: [...(map.metadata?.derivedStale?.systems || [])],
      checksum: map.metadata?.checksum || map.summary?.checksum || ""
    },
    replacementMap: map,
    refresh: {
      derived: ["terrain-caches", "height-field", "cell-colors", "political-boundaries", "point-layers", "line-layers", "labels", "route-mesh", "river-mesh", "object-panels", "object-index"],
      picking: "all"
    }
  };
}

export function collectOceanCurrentWorldWorkerTransferables(result) {
  return collectWorkerTransferables(result?.replacementMap || result);
}

function emptyResult(preview, binding, reason) {
  return {
    kind: "ocean-current-world",
    binding: binding || null,
    result: {
      executed: false,
      reason,
      seed: preview.seed,
      includeSeafloor: Boolean(preview.includeSeafloor),
      executionOrder: [...preview.executionOrder],
      steps: []
    },
    replacementMap: null,
    refresh: {derived: [], picking: "none"}
  };
}

function clearGeneratedCityLabelHides(map) {
  const store = ensureLabelStore(map);
  store.hidden[LABEL_TARGET_KIND.CITY] = [];
  store.metadata = {
    custom: store.custom.length,
    hidden: store.hidden[LABEL_TARGET_KIND.CITY].length + store.hidden[LABEL_TARGET_KIND.STATE].length
  };
}

function markDerivedFresh(map, systems) {
  map.metadata ||= {};
  const stale = new Set(map.metadata.derivedStale?.systems || []);
  for (const system of systems) stale.delete(system);
  const remaining = [...stale];
  if (remaining.length) map.metadata.derivedStale = {systems: remaining, updatedAt: new Date().toISOString()};
  else delete map.metadata.derivedStale;
  for (const system of ["markers", "economy", "diplomacy", "military", "zones"]) {
    if (map[system]?.metadata) map[system].metadata.stale = remaining.includes(system);
  }
}

function refreshGenerationSummary(map) {
  map.summary = createGenerationSummary(
    map.options,
    map.grid,
    map.features,
    map.climate,
    map.society,
    map.politics,
    map.settlements,
    map.markers,
    map.pack,
    map.rivers,
    map.layers,
    map.military,
    map.zones,
    map.economy,
    map.diplomacy
  );
}

function appendGenerationLog(map, message) {
  if (!Array.isArray(map.generationLog)) map.generationLog = [];
  map.generationLog.push(message);
}

function systemLabel(system) {
  return ({
    "ocean-currents": "洋流",
    climate: "温度与降水",
    rivers: "河流",
    "biomes-population": "生物群系、适居度与人口",
    cultures: "文化扩张",
    "cities-routes": "城镇与路线",
    "states-provinces": "国家与省份",
    religions: "宗教",
    "markers-economy": "标记与经济",
    diplomacy: "外交",
    "military-zones": "军事与地区"
  })[system] || system;
}

function checkpoint(context) {
  if (context.checkpoint?.() === false) throw new DOMException("洋流世界 Worker 已取消", "AbortError");
  if (context.signal?.aborted) throw new DOMException(context.signal.reason || "洋流世界 Worker 已取消", "AbortError");
}

function report(context, stage, message, progress) {
  context.report?.(stage, {message, progress});
}

function failAt(requested, stage) {
  if (requested && String(requested) === stage) throw taskError("worker_ocean_current_world_fault", `洋流世界故障注入：${stage}`);
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
