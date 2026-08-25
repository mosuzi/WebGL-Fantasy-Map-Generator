#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {captureRegenerationConstraintBundle} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";
import {REGENERATION_LOCK_KINDS} from "../app/webgl-generator/src/runtime/regeneration-locks.js";
import {
  REGENERATION_WORKER_KINDS,
  runRegenerationWorkerTask
} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const cellsTarget = Number(process.env.FMG_REGENERATION_LOCK_MATRIX_CELLS || 5000);
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
    map.regenerationLocks = {version: 1, entries: [reference]};
    let constraintBundle;
    try {
      constraintBundle = captureRegenerationConstraintBundle(map, {closure: ["world"]});
    } catch (error) {
      results.push(failure(lockKind, regenerationKind, "capture", error));
      continue;
    }
    try {
      const output = await runRegenerationWorkerTask({map, kind: regenerationKind, options: {scope: "all"}});
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

const failures = results.filter(result => result.outcome === "failure");
const noops = results.filter(result => result.outcome === "noop");
console.log(JSON.stringify({
  ok: failures.length === 0 && missingKinds.length === 0,
  cellsTarget,
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
