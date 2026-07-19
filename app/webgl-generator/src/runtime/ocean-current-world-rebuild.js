import {cloneMapSnapshotInChunks, restoreMapSnapshot} from "./climate-downstream-rebuild.js";
import {systemAffected} from "./edit-command-effects.js";

export const OCEAN_CURRENT_WORLD_REBUILD_ORDER = Object.freeze([
  "ocean-currents",
  "climate",
  "rivers",
  "biomes-population",
  "cultures",
  "cities-routes",
  "states-provinces",
  "religions",
  "markers-economy",
  "diplomacy",
  "military-zones"
]);

const STAGE_LABELS = Object.freeze({
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
});

export function inspectOceanCurrentWorldRebuild(map, {seed, includeSeafloor = false} = {}) {
  const currents = map?.oceanCurrents?.currents || [];
  const states = activeCount(map?.politics?.states || map?.pack?.states);
  const provinces = activeCount(map?.politics?.provinces || map?.pack?.provinces);
  const cultures = activeCount(map?.society?.cultures || map?.pack?.cultures);
  const religions = activeCount(map?.society?.religions || map?.pack?.religions);
  return {
    valid: Boolean(map?.grid?.cells?.h && map?.pack?.cells?.i),
    seed: String(seed || `${map?.metadata?.seed || map?.options?.seed || "map"}|ocean-current-world`),
    includeSeafloor: Boolean(includeSeafloor),
    executionOrder: [...OCEAN_CURRENT_WORLD_REBUILD_ORDER],
    labels: OCEAN_CURRENT_WORLD_REBUILD_ORDER.map(id => STAGE_LABELS[id]),
    current: {currents: currents.length, states, provinces, cultures, religions},
    preservation: {stableIds: ["cultures", "states", "provinces", "religions"], names: ["cultures", "states", "provinces", "religions"]}
  };
}

export async function executeOceanCurrentWorldRebuild({
  map,
  editHistory,
  seed,
  executePrepare,
  executeStage,
  executeCommand,
  refreshSummary,
  onProgress,
  onRestore,
  yieldToMain = async () => {},
  signal = null,
  assertCurrent = () => true,
  faultAt = "",
  now = currentTime
}) {
  if (!map || !editHistory?.createSnapshot || !editHistory?.restoreSnapshot) throw new Error("洋流世界重算缺少地图或编辑历史上下文");
  if (typeof executeStage !== "function" || typeof executeCommand !== "function") throw new Error("洋流世界重算缺少阶段或命令执行器");
  const preview = inspectOceanCurrentWorldRebuild(map, {seed, includeSeafloor: Boolean(executePrepare)});
  if (!preview.valid) return {executed: false, preview, steps: [], command: null};

  const startedAt = now();
  const chunks = [];
  const historySnapshot = editHistory.createSnapshot();
  const steps = [];
  let before = null;
  try {
    ensureActive(signal, assertCurrent, "snapshot-before");
    onProgress?.({phase: "snapshot-before", message: "正在保存重算前状态"});
    before = await cloneMapSnapshotInChunks(map, {id: "world-snapshot-before", chunks, now, yieldToMain});
    ensureActive(signal, assertCurrent, "snapshot-before");

    if (executePrepare) {
      onProgress?.({phase: "prepare", message: "正在应用海底重设"});
      const prepareResult = await executePrepare({preview, signal});
      if (prepareResult?.executed === false) throw new Error("海底重设准备阶段未完成");
      steps.push({system: "seafloor", result: prepareResult || {executed: true}});
      failAt(faultAt, "after:seafloor");
    }

    for (const system of OCEAN_CURRENT_WORLD_REBUILD_ORDER) {
      ensureActive(signal, assertCurrent, system);
      onProgress?.({phase: "system", system, message: `正在重算${STAGE_LABELS[system]}`});
      const stageStartedAt = now();
      const result = await executeStage(system, {preview, signal});
      const durationMs = roundTiming(now() - stageStartedAt);
      chunks.push({id: `world:${system}`, blockingMs: durationMs});
      if (!result || result.executed === false) throw new Error(`洋流世界重算未完成：${STAGE_LABELS[system]}`);
      steps.push({system, result, durationMs});
      failAt(faultAt, `after:${system}`);
      ensureActive(signal, assertCurrent, system);
      await yieldToMain({id: `world:${system}`, blockingMs: durationMs});
    }

    refreshSummary?.(map);
    ensureActive(signal, assertCurrent, "snapshot-after");
    onProgress?.({phase: "snapshot-after", message: "正在保存重算结果"});
    const after = await cloneMapSnapshotInChunks(map, {id: "world-snapshot-after", chunks, now, yieldToMain});
    ensureActive(signal, assertCurrent, "commit");
    editHistory.restoreSnapshot(historySnapshot);
    const command = createWorldSnapshotCommand(before, after, preview, steps);
    onProgress?.({phase: "commit", message: "正在登记整链历史"});
    const commandExecution = await executeCommand(command);
    if (commandExecution?.executed === false) throw commandExecution.error || new Error("洋流世界重算历史未登记");
    onRestore?.(map, "after-command");
    return {
      executed: true,
      preview,
      seed: preview.seed,
      executionOrder: [...OCEAN_CURRENT_WORLD_REBUILD_ORDER],
      steps,
      command,
      timings: summarizeTimings(chunks, now() - startedAt)
    };
  } catch (error) {
    if (before) restoreMapSnapshot(map, before);
    editHistory.restoreSnapshot(historySnapshot);
    onRestore?.(map, "rollback");
    error.preview = preview;
    error.timings = summarizeTimings(chunks, now() - startedAt);
    throw error;
  }
}

function createWorldSnapshotCommand(before, after, preview, steps) {
  let initialApply = true;
  return {
    label: preview.includeSeafloor ? "重设海底并重算洋流世界" : "重算洋流与世界派生",
    domain: "ocean-current-world",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      derived: ["terrain-caches", "height-field", "cell-colors", "political-boundaries", "point-layers", "line-layers", "labels", "route-mesh", "object-panels", "object-index"],
      affected: systemAffected("ocean-current-world", OCEAN_CURRENT_WORLD_REBUILD_ORDER.map(id => ({kind: "system", id})))
    },
    apply(context) {
      if (initialApply) {
        initialApply = false;
        return;
      }
      restoreMapSnapshot(context.map, after);
    },
    revert(context) {
      restoreMapSnapshot(context.map, before);
    },
    getResult() {
      return {
        seed: preview.seed,
        includeSeafloor: preview.includeSeafloor,
        executionOrder: [...OCEAN_CURRENT_WORLD_REBUILD_ORDER],
        steps: steps.map(step => ({system: step.system, durationMs: step.durationMs || 0}))
      };
    }
  };
}

function ensureActive(signal, assertCurrent, stage) {
  if (signal?.aborted) throw new DOMException(signal.reason || "洋流世界重算已取消", "AbortError");
  if (assertCurrent() === false) throw new DOMException(`地图已在 ${stage} 阶段被替换`, "AbortError");
}

function failAt(requested, stage) {
  if (requested && requested === stage) throw new Error(`故障注入：${stage}`);
}

function activeCount(items = []) {
  return items.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0).length;
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
