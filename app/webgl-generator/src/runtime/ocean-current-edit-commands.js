import {buildOceanCurrents, normalizeOceanCurrentModel} from "../generator/ocean-currents.js";
import {systemAffected} from "./edit-command-effects.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {
  allRegenerationObjectsLocked,
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "./regeneration-lock-protection.js";

export function createRenameOceanCurrentCommand(currentId, name) {
  const id = String(currentId || "");
  const after = normalizeName(name);
  let before = null;
  return {
    label: `重命名洋流 ${id}`,
    domain: "ocean-current",
    effects: lineEffects([{kind: "ocean-current", id}]),
    apply(context) {
      const current = findCurrent(context.map, id);
      if (before === null) before = current.name;
      current.name = after;
    },
    revert(context) {
      findCurrent(context.map, id).name = before;
    },
    isNoop(context) {
      return !after || findCurrent(context.map, id).name === after;
    },
    getResult() {
      return {id, name: after};
    }
  };
}

export function createRegenerateOceanCurrentsCommand(map, {seed} = {}) {
  const before = normalizeOceanCurrentModel(map?.oceanCurrents);
  const lockCapture = captureLockedRegenerationObjects(map, OBJECT_KIND.OCEAN_CURRENT);
  const resolvedSeed = String(seed || `${map?.metadata?.seed || map?.options?.seed || "map"}|ocean-currents|${before.seed || "initial"}`);
  const allLocked = allRegenerationObjectsLocked(map, OBJECT_KIND.OCEAN_CURRENT, before.currents);
  const after = allLocked ? before : buildOceanCurrents(map, {
    seed: resolvedSeed,
    preservedCurrents: lockCapture.snapshots
  });
  if (!allLocked) assertLockedRegenerationSnapshots({...map, oceanCurrents: after}, lockCapture);
  return {
    label: `重新计算洋流 ${after.currents.length} 条`,
    domain: "ocean-current",
    effects: lineEffects(systemAffected("ocean-currents", [{kind: "ocean-current", id: "all"}])),
    apply(context) {
      context.map.oceanCurrents = structuredClone(after);
    },
    revert(context) {
      context.map.oceanCurrents = structuredClone(before);
    },
    isNoop() {
      return allLocked || JSON.stringify(before) === JSON.stringify(after);
    },
    getResult() {
      return {seed: after.seed, currents: after.currents.length, inputChecksum: after.metadata.inputChecksum};
    }
  };
}

function lineEffects(affected) {
  return {
    render: "draw",
    selection: "none",
    runtimeStats: true,
    pickPanel: false,
    derived: ["line-layers"],
    affected
  };
}

function findCurrent(map, id) {
  const current = map?.oceanCurrents?.currents?.find(item => String(item?.id) === id);
  if (!current) throw new Error(`找不到洋流 ${id}`);
  return current;
}

function normalizeName(value) {
  const name = String(value || "").trim();
  if (name.length > 80) throw new Error("洋流名称不能超过 80 个字符");
  return name;
}
