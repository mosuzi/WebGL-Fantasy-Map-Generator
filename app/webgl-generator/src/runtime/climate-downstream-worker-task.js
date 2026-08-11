import {createGenerationSummary} from "../generator/index.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {
  climateDownstreamRegenerationSalt,
  inspectClimateDownstreamRebuild
} from "./climate-downstream-rebuild.js";
import {createDomainPatch} from "./domain-patch.js";
import {rebuildMapEconomy} from "./economy-edit-commands.js";
import {captureRegenerationConstraintBundle} from "./regeneration-constraint-bundle.js";
import {
  getRegenerationPatchPolicy,
  regenerateMapAttributeForWorker
} from "./regeneration-worker-task.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const CLIMATE_DOWNSTREAM_WORKER_TASK = "climate-downstream.compute";

const STEP_DOMAINS = Object.freeze({
  states: Object.freeze(["state", "province", "city", "route"]),
  provinces: Object.freeze(["province", "city", "route"]),
  cities: Object.freeze(["city", "route"]),
  religions: Object.freeze(["religion"]),
  markers: Object.freeze(["marker", "economy-market", "trade-flow"]),
  economy: Object.freeze(["economy-market", "trade-flow"]),
  diplomacy: Object.freeze(["diplomacy-relation"]),
  military: Object.freeze(["military"]),
  zones: Object.freeze(["zone"])
});

const ECONOMY_WRITE_SET = Object.freeze([
  "economy",
  "pack.goods",
  "pack.markets",
  "pack.deals",
  "pack.burgs",
  "pack.states",
  "pack.provinces",
  "pack.cells.market",
  "politics.states",
  "politics.provinces",
  "settlements.cities",
  "metadata.derivedStale",
  "military.metadata.stale",
  "zones.metadata.stale",
  "markers.metadata.stale",
  "economy.metadata.stale",
  "diplomacy.metadata.stale"
]);

export async function runClimateDownstreamWorkerTask(payload, context = {}) {
  const map = payload?.map;
  if (!map || typeof map !== "object") throw taskError("worker_climate_downstream_map_missing", "气候下游 Worker 缺少地图快照");
  if (payload?.mode === "render-only") return renderOnly(payload, map, context);
  const startedAt = currentTime();
  const timingChunks = [];
  const preview = inspectClimateDownstreamRebuild(map, {
    systems: payload?.systems || payload?.selectedSystems || [],
    seed: payload?.seed
  });
  if (!preview.valid) {
    return emptyResult(preview, context.binding);
  }

  const constraintBundle = captureRegenerationConstraintBundle(map, {closure: ["world"]});
  if (stepsFullyLocked(constraintBundle, preview.steps)) {
    return emptyResult(preview, context.binding, "domain-fully-locked");
  }

  const steps = [];
  const changedSystems = [];
  checkpoint(context);
  report(context, "prepare", "正在准备气候下游重算", 0.05);
  for (let index = 0; index < preview.steps.length; index++) {
    const step = preview.steps[index];
    const domains = STEP_DOMAINS[step.system] || [];
    checkpoint(context);
    report(context, step.system, `正在重算${systemLabel(step.system)}`, 0.1 + (index / Math.max(1, preview.steps.length)) * 0.76);
    if (domains.every(domain => constraintBundle.isDomainFullyLocked(domain))) {
      steps.push({
        system: step.system,
        covers: [...step.covers],
        regenerationSalt: null,
        result: {executed: false, reason: "domain-fully-locked"}
      });
      continue;
    }
    for (const domain of domains) constraintBundle.assertDomain(map, domain, "before");
    const regenerationSalt = prepareRegenerationSalt(map, preview.seed, step.system);
    failAt(payload?.faultAt, `before:${step.system}`);
    const stepStartedAt = currentTime();
    const result = executeSystem(map, step.system, constraintBundle);
    timingChunks.push({id: `system:${step.system}`, blockingMs: roundTiming(currentTime() - stepStartedAt)});
    if (!result || result.executed === false) {
      throw taskError("worker_climate_downstream_incomplete", `气候下游重算未完成：${step.system}`);
    }
    for (const domain of domains) constraintBundle.assertDomain(map, domain, "after");
    changedSystems.push(step.system);
    steps.push({system: step.system, covers: [...step.covers], regenerationSalt, result});
    failAt(payload?.faultAt, `after:${step.system}`);
    checkpoint(context);
  }

  markSelectedFresh(map, preview.selectedSystems);
  refreshGenerationSummary(map);
  constraintBundle.assertDomain(map, "world", "after");
  const policy = getClimateDownstreamPatchPolicy(changedSystems);
  const patch = createDomainPatch(policy.domain, policy.allowedPaths, map);
  report(context, "patch", "正在生成气候下游领域补丁", 0.93);
  checkpoint(context);
  const preparedRender = payload?.render
    ? await executeRenderPreparationTask({
        ...payload.render,
        map,
        binding: payload.render.binding || context.binding || null
      }, context)
    : null;
  return {
    kind: "climate-downstream",
    binding: context.binding || null,
    result: {
      executed: true,
      seed: preview.seed,
      requestedSystems: [...preview.requestedSystems],
      requiredSystems: [...preview.requiredSystems],
      selectedSystems: [...preview.selectedSystems],
      executionOrder: [...preview.executionOrder],
      candidates: preview.candidates.map(candidate => ({...candidate})),
      estimatedAffected: preview.estimatedAffected,
      steps: steps.map(publicStep),
      staleSystems: [...(map.metadata?.derivedStale?.systems || [])],
      checksum: map.metadata?.checksum || map.summary?.checksum || "",
      timings: summarizeTimings(timingChunks, currentTime() - startedAt)
    },
    patch,
    refresh: {
      derived: ["cell-colors", "political-boundaries", "point-layers", "line-layers", "labels", "route-mesh", "object-panels", "object-index"],
      picking: "all"
    },
    preparedRender
  };
}

export function getClimateDownstreamPatchPolicy(systems = []) {
  const paths = [];
  for (const system of systems) {
    if (system === "economy") paths.push(...ECONOMY_WRITE_SET);
    else paths.push(...getRegenerationPatchPolicy(system).allowedPaths);
  }
  paths.push("metadata.derivedStale", ...[
    "military", "zones", "markers", "economy", "diplomacy"
  ].map(system => `${system}.metadata.stale`));
  return {domain: "climate-downstream", allowedPaths: [...new Set(paths)].sort(), forbiddenPaths: []};
}

export function collectClimateDownstreamWorkerTransferables(result) {
  return collectWorkerTransferables({patch: result?.patch || null, preparedRender: result?.preparedRender || null});
}

async function renderOnly(payload, map, context) {
  if (!payload.render || typeof payload.render !== "object") {
    throw taskError("worker_climate_downstream_render_missing", "气候下游渲染准备缺少渲染上下文");
  }
  const binding = payload.render.binding || context.binding || null;
  checkpoint(context);
  const preparedRender = await executeRenderPreparationTask({...payload.render, map, binding}, context);
  checkpoint(context);
  return {mode: "render-only", binding: context.binding || null, preparedRender};
}

function executeSystem(map, system, constraintBundle) {
  if (system === "economy") {
    const result = rebuildMapEconomy(map, constraintBundle);
    return {executed: true, status: `经济链已重算：${result.deals || 0} 笔交易`, result};
  }
  return regenerateMapAttributeForWorker(map, system, {
    scope: "all",
    constraintBundle,
    rejectLockedDiplomacy: system === "states"
  });
}

function prepareRegenerationSalt(map, seed, system) {
  if (system === "economy") return null;
  const salt = climateDownstreamRegenerationSalt(seed, system);
  map.metadata ||= {};
  map.metadata.regeneration ||= {};
  map.metadata.regeneration[system] = salt - 1;
  return salt;
}

function stepsFullyLocked(constraintBundle, steps) {
  return steps.length > 0 && steps.every(step =>
    (STEP_DOMAINS[step.system] || []).every(domain => constraintBundle.isDomainFullyLocked(domain))
  );
}

function markSelectedFresh(map, selectedSystems) {
  map.metadata ||= {};
  const selected = new Set(selectedSystems);
  const remaining = [...new Set(map.metadata.derivedStale?.systems || [])].filter(system => !selected.has(system));
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

function emptyResult(preview, binding, reason = "no-systems") {
  return {
    kind: "climate-downstream",
    binding: binding || null,
    result: {
      executed: false,
      reason,
      preview: structuredClone(preview),
      seed: preview.seed,
      requestedSystems: [...preview.requestedSystems],
      requiredSystems: [...preview.requiredSystems],
      selectedSystems: [...preview.selectedSystems],
      executionOrder: [...preview.executionOrder],
      steps: [],
      staleSystems: [...preview.staleSystems],
      timings: {chunks: [], maxBlockingMs: 0, totalMs: 0}
    },
    patch: createDomainPatch("climate-downstream", [], {}),
    refresh: {derived: [], picking: "none"}
  };
}

function summarizeTimings(chunks, totalMs) {
  return {
    chunks: chunks.map(chunk => ({...chunk})),
    maxBlockingMs: roundTiming(chunks.reduce((max, chunk) => Math.max(max, chunk.blockingMs), 0)),
    totalMs: roundTiming(totalMs)
  };
}

function currentTime() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

function roundTiming(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function publicStep(step) {
  return {
    system: step.system,
    covers: [...step.covers],
    regenerationSalt: step.regenerationSalt,
    executed: step.result?.executed !== false,
    status: step.result?.status || step.result?.result?.status || ""
  };
}

function systemLabel(system) {
  return ({
    cities: "城市",
    states: "国家",
    provinces: "省份",
    religions: "宗教",
    markers: "资源标记与经济",
    economy: "经济",
    diplomacy: "外交",
    military: "军事",
    zones: "地区"
  })[system] || system;
}

function checkpoint(context) {
  if (context.checkpoint?.() === false) throw new DOMException("气候下游 Worker 已取消", "AbortError");
}

function report(context, stage, message, progress) {
  context.report?.(stage, {message, progress});
}

function failAt(requested, stage) {
  if (requested && String(requested) === stage) throw taskError("worker_climate_downstream_fault", `气候下游故障注入：${stage}`);
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
