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
  try {
    for (const step of preview.steps) {
      const regenerationSalt = prepareRegenerationSalt(map, preview.seed, step.system);
      const result = executeSystem(step.system, {step, preview, regenerationSalt});
      if (!result || result.executed === false) throw new Error(`气候下游重算未完成：${step.system}`);
      stepResults.push({system: step.system, covers: [...step.covers], regenerationSalt, result});
    }
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
