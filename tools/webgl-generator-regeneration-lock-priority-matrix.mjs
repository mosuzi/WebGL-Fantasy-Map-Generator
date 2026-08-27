#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {captureRegenerationConstraintBundle} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";
import {REGENERATION_LOCK_KINDS} from "../app/webgl-generator/src/runtime/regeneration-locks.js";
import {
  REGENERATION_WORKER_KINDS,
  getRegenerationPatchPolicy,
  runRegenerationWorkerTask,
  validateOceanCurrentRegenerationOutput
} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});
const {validateFeaturesNetworksResourcesWorkerOutput} = await vite.ssrLoadModule("/src/domains/features/worker-runtime.ts");
const {validateSettlementZoneWorkerOutput} = await vite.ssrLoadModule("/src/domains/settlements/worker-runtime.ts");
const {validateSocietyPoliticsWorkerOutput} = await vite.ssrLoadModule("/src/domains/society-politics/worker-runtime.ts");
const {validateEconomyDiplomacyMilitaryWorkerOutput} = await vite.ssrLoadModule("/src/domains/economy/worker-runtime.ts");
const cellsTarget = Number(process.env.FMG_REGENERATION_LOCK_MATRIX_CELLS || 5000);
const corruptLockedObjects = process.argv.includes("--corrupt-locks");
const base = generatePlaceholderMap({
  seed: "task-354-regeneration-lock-priority-matrix",
  cellsTarget,
  heightmapTemplate: "continents"
});
const references = Object.fromEntries(REGENERATION_LOCK_KINDS.map(kind => [kind, pickReference(base, kind)]));
const missingKinds = Object.entries(references).filter(([, reference]) => !reference).map(([kind]) => kind);
const results = [];

for (const [lockKind, reference] of Object.entries(references)) {
  if (!reference) continue;
  for (const regenerationKind of REGENERATION_WORKER_KINDS) {
    const map = structuredClone(base);
    if (corruptLockedObjects) corruptLockObject(map, reference);
    map.regenerationLocks = {version: 1, entries: [reference]};
    const sourceMap = structuredClone(map);
    const binding = operationBinding(lockKind, regenerationKind);
    let constraintBundle;
    try {
      constraintBundle = captureRegenerationConstraintBundle(map, {closure: ["world"]});
    } catch (error) {
      results.push(failure(lockKind, regenerationKind, "capture", error));
      continue;
    }
    try {
      const output = await runRegenerationWorkerTask({map, kind: regenerationKind, options: {scope: "all"}}, {binding, checkpoint() {}, report() {}});
      validateWorkerOutput(regenerationKind, sourceMap, binding, output);
      constraintBundle.assertDomain(map, "world", "matrix-after");
      results.push({
        lockKind,
        regenerationKind,
        outcome: output.result?.executed === false ? "noop" : "preserved"
      });
    } catch (error) {
      results.push(failure(lockKind, regenerationKind, "regenerate", error));
    }
  }
}

await vite.close();

const failures = results.filter(result => result.outcome === "failure");
const noops = results.filter(result => result.outcome === "noop");
console.log(JSON.stringify({
  ok: failures.length === 0 && missingKinds.length === 0,
  cellsTarget,
  corruptLockedObjects,
  regenerationKinds: [...REGENERATION_WORKER_KINDS],
  lockKinds: [...REGENERATION_LOCK_KINDS],
  references,
  missingKinds,
  totals: {
    combinations: results.length,
    preserved: results.filter(result => result.outcome === "preserved").length,
    noop: results.filter(result => result.outcome === "noop").length,
    failures: failures.length
  },
  noops,
  failures
}, null, 2));

if (failures.length || missingKinds.length) process.exitCode = 1;

function operationBinding(lockKind, regenerationKind) {
  return Object.freeze({
    mapIdentity: "task-365-lock-matrix",
    mapRevision: 1,
    topologyRevision: 1,
    generationToken: 1,
    lockFingerprint: `${lockKind}:${regenerationKind}`,
    operationId: 1,
    operationName: `regeneration.compute:${regenerationKind}`
  });
}

function validateWorkerOutput(kind, sourceMap, binding, output) {
  const input = {kind, sourceMap, binding, output, policy: getRegenerationPatchPolicy(kind)};
  if (kind === "ocean-current") return validateOceanCurrentRegenerationOutput(input);
  if (["features", "routes", "rivers", "markers"].includes(kind)) return validateFeaturesNetworksResourcesWorkerOutput(input);
  if (["cities", "zones"].includes(kind)) return validateSettlementZoneWorkerOutput(input);
  if (["states", "provinces", "religions"].includes(kind)) return validateSocietyPoliticsWorkerOutput(input);
  return validateEconomyDiplomacyMilitaryWorkerOutput(input);
}

function failure(lockKind, regenerationKind, phase, error) {
  return {
    lockKind,
    regenerationKind,
    outcome: "failure",
    phase,
    code: String(error?.code || error?.name || "error"),
    message: String(error?.message || error),
    details: error?.details || null,
    stack: String(error?.stack || "").split("\n").slice(0, 8)
  };
}

function pickReference(map, kind) {
  const active = rows => (rows || []).filter(item => item && !item.removed);
  const firstPositive = rows => active(rows).find(item => Number(item.i ?? item.id) > 0);
  if (kind === "state") return numeric(kind, firstPositive(map.politics?.states));
  if (kind === "province") return numeric(kind, firstPositive(map.politics?.provinces));
  if (kind === "city") return numeric(kind, active(map.settlements?.cities)[0]);
  if (kind === "route") return numeric(kind, active(map.settlements?.routes)[0]);
  if (kind === "river") return numeric(kind, active(map.rivers?.rivers)[0]);
  if (kind === "marker") return numeric(kind, active(map.markers?.markers).find(marker => marker.category === "resource"));
  if (kind === "religion") return numeric(kind, firstPositive(map.society?.religions));
  if (kind === "culture") return numeric(kind, firstPositive(map.society?.cultures));
  if (kind === "zone") return numeric(kind, active(map.zones?.zones || map.pack?.zones)[0]);
  if (kind === "feature") return numeric(kind, firstPositive(map.pack?.features));
  if (kind === "ocean-current") {
    const current = active(map.oceanCurrents?.currents)[0];
    return current?.id == null ? null : {kind, id: String(current.id)};
  }
  if (kind === "economy-market") return numeric(kind, firstPositive(map.pack?.markets || map.economy?.markets));
  if (kind === "trade-flow") return numeric(kind, active(map.pack?.deals || map.economy?.deals)[0]);
  if (kind === "diplomacy-relation") {
    const states = active(map.pack?.states || map.politics?.states).filter(state => Number(state.i) > 0);
    if (states.length < 2) return null;
    const left = Number(states[0].i);
    const right = Number(states[1].i);
    return {kind, id: left < right ? `${left}:${right}` : `${right}:${left}`};
  }
  if (kind === "military") {
    for (const state of active(map.pack?.states || map.politics?.states)) {
      const regiment = active(state.military)[0];
      if (regiment) return {kind, id: `${Number(state.i)}:${Number(regiment.i ?? regiment.id)}`};
    }
  }
  return null;
}

function numeric(kind, object) {
  const id = Number(object?.id ?? object?.i);
  return Number.isInteger(id) ? {kind, id} : null;
}

function corruptLockObject(map, reference) {
  const object = lockObject(map, reference);
  if (reference.kind === "state") Object.assign(object, {capital: 999999, center: 999999});
  else if (reference.kind === "province") Object.assign(object, {state: 999999, burg: 999999, center: 999999});
  else if (reference.kind === "city") Object.assign(object, {cell: 999999, packCell: 999999, x: Number.NaN});
  else if (reference.kind === "route") Object.assign(object, {packCells: [999999], cells: [], points: []});
  else if (reference.kind === "river") Object.assign(object, {cells: [999999], sourceFeatureId: 999999});
  else if (reference.kind === "marker") Object.assign(object, {packCell: 999999, x: Number.NaN});
  else if (reference.kind === "religion" || reference.kind === "culture") Object.assign(object, {center: 999999, parent: 999999, origins: "broken"});
  else if (reference.kind === "zone") Object.assign(object, {cells: [999999], attacker: 999999});
  else if (reference.kind === "feature") Object.assign(object, {land: !object.land, shoreline: "broken"});
  else if (reference.kind === "ocean-current") Object.assign(object, {basinFeatureId: 999999, path: {segments: []}});
  else if (reference.kind === "economy-market") Object.assign(object, {centerBurgId: 999999, cell: 999999});
  else if (reference.kind === "trade-flow") Object.assign(object, {good: 999999, seller: 999999, path: [999999]});
  else if (reference.kind === "diplomacy-relation") {
    const [left, right] = String(reference.id).split(":").map(Number);
    map.pack.states[left].diplomacy[right] = "Broken";
    map.pack.states[right].diplomacy[left] = undefined;
  } else if (reference.kind === "military") Object.assign(object, {cell: 999999, x: Number.NaN});
}

function lockObject(map, reference) {
  const id = Number(reference.id);
  if (reference.kind === "state") return map.politics.states[id];
  if (reference.kind === "province") return map.politics.provinces[id];
  if (reference.kind === "city") return map.settlements.cities.find(item => Number(item?.id) === id);
  if (reference.kind === "route") return map.settlements.routes.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "river") return map.rivers.rivers.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "marker") return map.markers.markers.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "religion") return map.society.religions[id];
  if (reference.kind === "culture") return map.society.cultures[id];
  if (reference.kind === "zone") return map.zones.zones.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "feature") return map.pack.features[id];
  if (reference.kind === "ocean-current") return map.oceanCurrents.currents.find(item => String(item?.id) === String(reference.id));
  if (reference.kind === "economy-market") return map.pack.markets[id];
  if (reference.kind === "trade-flow") return map.pack.deals.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "military") {
    const [stateId, regimentId] = String(reference.id).split(":").map(Number);
    return map.pack.states[stateId].military.find(item => Number(item?.i) === regimentId);
  }
  return null;
}
