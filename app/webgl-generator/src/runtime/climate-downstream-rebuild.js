import {createRuntimeOperationError} from "./runtime-operation.js";
import {createRegenerationPostMergeSession} from "./regeneration-constraint-bundle.js";

const SYSTEM_SPECS = Object.freeze([
  system("cities", "城市"),
  system("states", "国家"),
  system("provinces", "省份"),
  system("religions", "宗教"),
  system("markers", "资源标记"),
  system("economy", "经济", ["markers"]),
  system("diplomacy", "外交", ["states", "provinces", "religions", "economy"]),
  system("military", "军事", ["states", "provinces", "economy", "diplomacy"]),
  system("zones", "区域", ["religions", "military", "diplomacy"])
]);

export const CLIMATE_DOWNSTREAM_SYSTEM_IDS = Object.freeze(SYSTEM_SPECS.map(item => item.id));
const SYSTEM_ID_SET = new Set(CLIMATE_DOWNSTREAM_SYSTEM_IDS);
const BUILTIN_COVERAGE = Object.freeze({
  states: Object.freeze(["states", "provinces", "cities"]),
  provinces: Object.freeze(["provinces", "cities"]),
  markers: Object.freeze(["markers", "economy"])
});

export function inspectClimateDownstreamRebuild(map, {systems = [], seed} = {}) {
  const requested = normalizeSystems(systems);
  const requestedSet = new Set(requested);
  const selected = new Set(requested);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const spec of SYSTEM_SPECS) {
      if (!selected.has(spec.id)) continue;
      for (const dependency of spec.dependencies) expanded = addSelected(selected, dependency) || expanded;
      for (const covered of BUILTIN_COVERAGE[spec.id] || []) expanded = addSelected(selected, covered) || expanded;
    }
  }

  const steps = buildExecutionSteps(selected);
  const coveredBy = new Map(steps.flatMap(step => step.covers.map(systemId => [systemId, step.system])));
  const stale = new Set(map?.metadata?.derivedStale?.systems || []);
  const candidates = SYSTEM_SPECS.map(spec => ({
    id: spec.id,
    label: spec.label,
    estimatedAffected: estimateAffected(map, spec.id),
    requested: requestedSet.has(spec.id),
    required: selected.has(spec.id) && !requestedSet.has(spec.id),
    selected: selected.has(spec.id),
    stale: stale.has(spec.id),
    dependencies: [...spec.dependencies],
    coveredBy: coveredBy.get(spec.id) || null
  }));
  const selectedSystems = candidates.filter(item => item.selected).map(item => item.id);
  return {
    valid: requested.length > 0,
    seed: normalizeSeed(seed, map?.options?.seed),
    requestedSystems: requested,
    requiredSystems: candidates.filter(item => item.required).map(item => item.id),
    selectedSystems,
    executionOrder: steps.map(step => step.system),
    steps,
    candidates,
    estimatedAffected: candidates.filter(item => item.selected).reduce((sum, item) => sum + item.estimatedAffected, 0),
    staleSystems: [...stale]
  };
}

export function executeClimateDownstreamRebuild({
  map,
  editHistory,
  systems,
  seed,
  executeSystem,
  executeCommand,
  refreshSummary,
  onRestore
}) {
  if (!map || !editHistory?.createSnapshot || !editHistory?.restoreSnapshot) {
    throw new Error("气候下游重算缺少地图或编辑历史上下文");
  }
  if (typeof executeSystem !== "function") throw new Error("气候下游重算缺少系统执行器");
  if (typeof executeCommand !== "function") throw new Error("气候下游重算缺少统一命令执行器");
  const preview = inspectClimateDownstreamRebuild(map, {systems, seed});
  if (!preview.valid) return {executed: false, preview, steps: [], command: null};

  const before = cloneMap(map);
  const historySnapshot = editHistory.createSnapshot();
  const stepResults = [];
  const session = createRegenerationPostMergeSession(map, {closure: ["world"]});
  const constraintBundle = session.generation;
  try {
    for (const step of preview.steps) {
      assertClimateStepConstraints(constraintBundle, map, step.system, "before");
      const regenerationSalt = prepareRegenerationSalt(map, preview.seed, step.system);
      const result = executeSystem(step.system, {step, preview, regenerationSalt, constraintBundle});
      if (!result || result.executed === false) throw new Error(`气候下游重算未完成：${step.system}`);
      assertClimateStepConstraints(constraintBundle, map, step.system, "after");
      stepResults.push({system: step.system, covers: [...step.covers], regenerationSalt, result});
    }
    session.commit("climate-downstream");
    session.close();
    markSelectedFresh(map, preview.selectedSystems);
    refreshSummary?.(map);
    const after = cloneMap(map);
    editHistory.restoreSnapshot(historySnapshot);
    const command = createSnapshotCommand(before, after, preview, stepResults);
    const commandExecution = executeCommand(command);
    if (commandExecution?.executed === false) throw commandExecution.error || new Error("气候下游重算命令未执行");
    onRestore?.(map, "after-command");
    return {
      executed: true,
      preview,
      seed: preview.seed,
      requestedSystems: [...preview.requestedSystems],
      requiredSystems: [...preview.requiredSystems],
      selectedSystems: [...preview.selectedSystems],
      executionOrder: [...preview.executionOrder],
      steps: stepResults,
      staleSystems: [...(map.metadata?.derivedStale?.systems || [])],
      checksum: map.metadata?.checksum || map.summary?.checksum || "",
      command
    };
  } catch (error) {
    restoreMap(map, before);
    editHistory.restoreSnapshot(historySnapshot);
    onRestore?.(map, "rollback");
    error.preview = preview;
    throw error;
  } finally {
    session.close();
  }
}

export async function executeClimateDownstreamRebuildAsync({
  map,
  editHistory,
  systems,
  seed,
  executeSystem,
  executeCommand,
  refreshSummary,
  onRestore,
  onProgress,
  signal,
  assertCurrent,
  shouldRestoreHistory = () => true,
  yieldToMain = async () => {},
  now = currentTime
}) {
  if (!map || !editHistory?.createSnapshot || !editHistory?.restoreSnapshot) {
    throw new Error("气候下游重算缺少地图或编辑历史上下文");
  }
  if (typeof executeSystem !== "function") throw new Error("气候下游重算缺少系统执行器");
  if (typeof executeCommand !== "function") throw new Error("气候下游重算缺少统一命令执行器");
  if (typeof yieldToMain !== "function") throw new Error("气候下游重算缺少主线程让出器");
  const preview = inspectClimateDownstreamRebuild(map, {systems, seed});
  if (!preview.valid) return {executed: false, preview, steps: [], command: null, timings: emptyTimings()};

  const startedAt = now();
  const chunks = [];
  const historySnapshot = editHistory.createSnapshot();
  const stepResults = [];
  let before = null;
  let session = null;
  try {
    assertRequestCurrent(signal, assertCurrent);
    onProgress?.({phase: "snapshot-before", message: "正在保存重算前状态"});
    before = await cloneMapInChunks(map, {id: "snapshot-before", chunks, now, yieldToMain});
    assertRequestCurrent(signal, assertCurrent);
    session = createRegenerationPostMergeSession(map, {closure: ["world"]});
    const constraintBundle = session.generation;
    for (const step of preview.steps) {
      assertRequestCurrent(signal, assertCurrent);
      onProgress?.({phase: "system", system: step.system, message: `正在重算${systemLabel(step.system)}`});
      assertClimateStepConstraints(constraintBundle, map, step.system, "before");
      const regenerationSalt = prepareRegenerationSalt(map, preview.seed, step.system);
      const result = await runBlockingChunk(
        `system:${step.system}`,
        () => executeSystem(step.system, {step, preview, regenerationSalt, constraintBundle}),
        {chunks, now, yieldToMain}
      );
      assertRequestCurrent(signal, assertCurrent);
      if (!result || result.executed === false) throw new Error(`气候下游重算未完成：${step.system}`);
      assertClimateStepConstraints(constraintBundle, map, step.system, "after");
      for (const chunk of result.timings?.chunks || []) {
        chunks.push({id: `system:${step.system}:${chunk.id}`, blockingMs: roundTiming(chunk.blockingMs)});
      }
      stepResults.push({system: step.system, covers: [...step.covers], regenerationSalt, result});
    }
    session.commit("climate-downstream");
    session.close();
    markSelectedFresh(map, preview.selectedSystems);
    refreshSummary?.(map);
    onProgress?.({phase: "snapshot-after", message: "正在保存重算结果"});
    const after = await cloneMapInChunks(map, {id: "snapshot-after", chunks, now, yieldToMain});
    assertRequestCurrent(signal, assertCurrent);
    if (shouldRestoreHistory()) editHistory.restoreSnapshot(historySnapshot);
    const command = createSnapshotCommand(before, after, preview, stepResults);
    onProgress?.({phase: "commit", message: "正在登记重算历史"});
    const commandExecution = await runBlockingChunk("history-command", () => executeCommand(command), {chunks, now, yieldToMain});
    assertRequestCurrent(signal, assertCurrent);
    if (commandExecution?.executed === false) throw commandExecution.error || new Error("气候下游重算命令未执行");
    onRestore?.(map, "after-command");
    return {
      executed: true,
      preview,
      seed: preview.seed,
      requestedSystems: [...preview.requestedSystems],
      requiredSystems: [...preview.requiredSystems],
      selectedSystems: [...preview.selectedSystems],
      executionOrder: [...preview.executionOrder],
      steps: stepResults,
      staleSystems: [...(map.metadata?.derivedStale?.systems || [])],
      checksum: map.metadata?.checksum || map.summary?.checksum || "",
      command,
      timings: summarizeTimings(chunks, now() - startedAt)
    };
  } catch (error) {
    if (before) {
      onProgress?.({phase: "rollback", message: "正在回滚重算状态"});
      await runBlockingChunk("rollback", () => restoreMap(map, before), {chunks, now, yieldToMain});
    }
    if (shouldRestoreHistory()) editHistory.restoreSnapshot(historySnapshot);
    onRestore?.(map, "rollback");
    error.preview = preview;
    error.timings = summarizeTimings(chunks, now() - startedAt);
    throw error;
  } finally {
    session?.close();
  }
}

export function climateDownstreamRegenerationSalt(seed, systemId) {
  let hash = 2166136261;
  const text = `${normalizeSeed(seed)}:${systemId}`;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 1 + ((hash >>> 0) % 2147483646);
}

function climateStepConstraintDomains(systemId) {
  if (systemId === "states") return ["state", "province", "city", "route"];
  if (systemId === "provinces") return ["province", "city", "route"];
  if (systemId === "cities") return ["city", "route"];
  if (systemId === "religions") return ["religion"];
  if (systemId === "markers") return ["marker", "economy-market", "trade-flow"];
  if (systemId === "economy") return ["economy-market", "trade-flow"];
  if (systemId === "diplomacy") return ["diplomacy-relation"];
  if (systemId === "military") return ["military"];
  if (systemId === "zones") return ["zone"];
  return [];
}

function assertClimateStepConstraints(constraintBundle, map, systemId, phase) {
  for (const domain of climateStepConstraintDomains(systemId)) {
    constraintBundle.assertDomain(map, domain, phase);
  }
}

function system(id, label, dependencies = []) {
  return Object.freeze({id, label, dependencies: Object.freeze(dependencies)});
}

function normalizeSystems(systems) {
  const source = Array.isArray(systems) ? systems : [systems];
  return CLIMATE_DOWNSTREAM_SYSTEM_IDS.filter(id => source.map(value => String(value || "").trim().toLowerCase()).includes(id));
}

function normalizeSeed(seed, fallback = 1) {
  const numeric = Number(seed);
  if (Number.isSafeInteger(numeric) && numeric >= 0) return numeric;
  const text = String(seed ?? fallback ?? 1);
  let hash = 0;
  for (let index = 0; index < text.length; index++) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  return hash || 1;
}

function addSelected(selected, systemId) {
  if (!SYSTEM_ID_SET.has(systemId) || selected.has(systemId)) return false;
  selected.add(systemId);
  return true;
}

function buildExecutionSteps(selected) {
  const steps = [];
  if (selected.has("states")) steps.push(step("states", ["states", "provinces", "cities"], selected));
  else if (selected.has("provinces")) steps.push(step("provinces", ["provinces", "cities"], selected));
  else if (selected.has("cities")) steps.push(step("cities", ["cities"], selected));
  if (selected.has("religions")) steps.push(step("religions", ["religions"], selected));
  if (selected.has("markers")) steps.push(step("markers", ["markers", "economy"], selected));
  else if (selected.has("economy")) steps.push(step("economy", ["economy"], selected));
  if (selected.has("diplomacy")) steps.push(step("diplomacy", ["diplomacy"], selected));
  if (selected.has("military")) steps.push(step("military", ["military"], selected));
  if (selected.has("zones")) steps.push(step("zones", ["zones"], selected));
  return steps;
}

function step(systemId, covered, selected) {
  return {system: systemId, covers: covered.filter(id => selected.has(id))};
}

function prepareRegenerationSalt(map, seed, systemId) {
  if (systemId === "economy") return null;
  const salt = climateDownstreamRegenerationSalt(seed, systemId);
  map.metadata ||= {};
  map.metadata.regeneration ||= {};
  map.metadata.regeneration[systemId] = salt - 1;
  return salt;
}

function markSelectedFresh(map, selectedSystems) {
  map.metadata ||= {};
  const selected = new Set(selectedSystems);
  const remaining = [...new Set(map.metadata.derivedStale?.systems || [])].filter(systemId => !selected.has(systemId));
  if (remaining.length) map.metadata.derivedStale = {systems: remaining, updatedAt: new Date().toISOString()};
  else delete map.metadata.derivedStale;
  for (const systemId of ["markers", "economy", "diplomacy", "military", "zones"]) {
    if (map[systemId]?.metadata) map[systemId].metadata.stale = remaining.includes(systemId);
  }
}

function createSnapshotCommand(before, after, preview, stepResults) {
  let initialApply = true;
  return {
    label: `气候下游重算 ${preview.requestedSystems.join("/")}`,
    domain: "climate",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      derived: ["cell-colors", "political-boundaries", "point-layers", "line-layers", "labels", "route-mesh", "object-panels", "object-index"],
      affected: preview.selectedSystems.map(id => ({kind: "system", id}))
    },
    apply(context) {
      if (initialApply) {
        initialApply = false;
        return;
      }
      restoreMap(context.map, after);
    },
    revert(context) {
      restoreMap(context.map, before);
    },
    getResult() {
      return {
        seed: preview.seed,
        selectedSystems: [...preview.selectedSystems],
        executionOrder: [...preview.executionOrder],
        steps: stepResults.map(item => ({system: item.system, covers: [...item.covers], regenerationSalt: item.regenerationSalt}))
      };
    }
  };
}

function estimateAffected(map, systemId) {
  if (systemId === "cities") return countItems(map?.settlements?.cities);
  if (systemId === "states") return countPolitical(map?.politics?.states || map?.pack?.states);
  if (systemId === "provinces") return countPolitical(map?.politics?.provinces || map?.pack?.provinces);
  if (systemId === "religions") return countPolitical(map?.society?.religions);
  if (systemId === "markers") return countItems(map?.markers?.markers);
  if (systemId === "economy") return Math.max(0, countItems(map?.economy?.markets || map?.pack?.markets) - 1) + countItems(map?.economy?.deals || map?.pack?.deals);
  if (systemId === "diplomacy") return Number(map?.diplomacy?.metadata?.pairs) || 0;
  if (systemId === "military") return Number(map?.military?.metadata?.regiments) || countItems(map?.military?.regiments);
  if (systemId === "zones") return Number(map?.zones?.metadata?.zones) || countItems(map?.zones?.zones);
  return 0;
}

function countItems(items) {
  return Array.isArray(items) ? items.filter(Boolean).length : 0;
}

function countPolitical(items) {
  return Array.isArray(items) ? items.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0).length : 0;
}

function cloneMap(map) {
  return structuredClone(map);
}

function restoreMap(target, snapshot) {
  const replacement = cloneMap(snapshot);
  const optionsReference = target.options && typeof target.options === "object" ? target.options : null;
  if (optionsReference && replacement.options && typeof replacement.options === "object") {
    for (const key of Object.keys(optionsReference)) delete optionsReference[key];
    Object.assign(optionsReference, replacement.options);
    replacement.options = optionsReference;
  }
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, replacement);
}

async function runBlockingChunk(id, task, {chunks, now, yieldToMain}) {
  const startedAt = now();
  const pending = task();
  const blockingMs = Math.max(0, now() - startedAt);
  const result = pending && typeof pending.then === "function" ? await pending : pending;
  chunks.push({id, blockingMs: roundTiming(blockingMs)});
  await yieldToMain({id, blockingMs});
  return result;
}

async function cloneMapInChunks(source, {id, chunks, now, yieldToMain, budgetMs = 24}) {
  const seen = new WeakMap();
  const root = createCloneShell(source, seen);
  const stack = cloneFrames(source, root);
  let chunkIndex = 0;
  let chunkStartedAt = now();
  let operations = 0;

  while (stack.length) {
    const frame = stack.at(-1);
    if (frame.index >= frame.entries.length) {
      stack.pop();
      continue;
    }
    const entry = frame.entries[frame.index++];
    cloneFrameEntry(frame, entry, seen, stack);
    operations++;
    if ((operations & 127) !== 0 || now() - chunkStartedAt < budgetMs) continue;
    const blockingMs = Math.max(0, now() - chunkStartedAt);
    chunks.push({id: `${id}:${chunkIndex++}`, blockingMs: roundTiming(blockingMs)});
    await yieldToMain({id, chunkIndex: chunkIndex - 1, blockingMs});
    chunkStartedAt = now();
  }

  const blockingMs = Math.max(0, now() - chunkStartedAt);
  chunks.push({id: `${id}:${chunkIndex}`, blockingMs: roundTiming(blockingMs)});
  await yieldToMain({id, chunkIndex, blockingMs});
  return root;
}

function createCloneShell(value, seen) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  let clone;
  if (Array.isArray(value)) clone = new Array(value.length);
  else if (value instanceof Date) clone = new Date(value.getTime());
  else if (value instanceof RegExp) clone = new RegExp(value.source, value.flags);
  else if (value instanceof Map) clone = new Map();
  else if (value instanceof Set) clone = new Set();
  else if (value instanceof ArrayBuffer) clone = value.slice(0);
  else if (ArrayBuffer.isView(value)) {
    const buffer = createCloneShell(value.buffer, seen);
    clone = value instanceof DataView
      ? new DataView(buffer, value.byteOffset, value.byteLength)
      : new value.constructor(buffer, value.byteOffset, value.length);
  } else clone = Object.create(Object.getPrototypeOf(value));
  seen.set(value, clone);
  return clone;
}

function cloneFrames(source, target) {
  if (!source || typeof source !== "object" || ArrayBuffer.isView(source) || source instanceof ArrayBuffer || source instanceof Date || source instanceof RegExp) return [];
  if (source instanceof Map) return [{kind: "map", source, target, entries: [...source.entries()], index: 0}];
  if (source instanceof Set) return [{kind: "set", source, target, entries: [...source.values()], index: 0}];
  return [{kind: "object", source, target, entries: Object.keys(source), index: 0}];
}

function cloneFrameEntry(frame, entry, seen, stack) {
  if (frame.kind === "map") {
    const key = cloneValue(entry[0], seen, stack);
    const value = cloneValue(entry[1], seen, stack);
    frame.target.set(key, value);
    return;
  }
  if (frame.kind === "set") {
    frame.target.add(cloneValue(entry, seen, stack));
    return;
  }
  frame.target[entry] = cloneValue(frame.source[entry], seen, stack);
}

function cloneValue(value, seen, stack) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const clone = createCloneShell(value, seen);
  stack.push(...cloneFrames(value, clone));
  return clone;
}

function summarizeTimings(chunks, totalMs) {
  return {
    chunks: chunks.map(chunk => ({...chunk})),
    maxBlockingMs: roundTiming(chunks.reduce((max, chunk) => Math.max(max, chunk.blockingMs), 0)),
    totalMs: roundTiming(totalMs)
  };
}

function emptyTimings() {
  return {chunks: [], maxBlockingMs: 0, totalMs: 0};
}

function currentTime() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

function roundTiming(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function systemLabel(systemId) {
  return SYSTEM_SPECS.find(item => item.id === systemId)?.label || systemId;
}

function assertRequestCurrent(signal, assertCurrent) {
  if (signal?.aborted) throw new DOMException(signal.reason || "气候下游重算已取消", "AbortError");
  if (typeof assertCurrent === "function" && assertCurrent() === false) {
    throw createRuntimeOperationError("operation_obsolete", "气候下游重算请求对应的地图已被替换", {
      stage: "identity",
      expected: true
    });
  }
}

export {cloneMapInChunks as cloneMapSnapshotInChunks, restoreMap as restoreMapSnapshot};
