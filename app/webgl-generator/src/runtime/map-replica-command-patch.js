import {createMapReplicaPatch} from "./map-replica-journal.js";
import {computeMapReplicaPatchTargetChecksum} from "./map-replica-checksum.js";
import {cloneWorkerGraphByPackets} from "./worker-graph-stream.js";
import {resolveCanonicalMapWriteDescriptor} from "./canonical-map-field-registry.js";

const DOMAIN_PATHS = Object.freeze({
  "visual-theme": ["visualTheme"],
  measurement: ["measurements"],
  note: ["notes"],
  namebase: ["namebases"],
  "namebase-rule": ["namebases"],
  "regeneration-locks": ["regenerationLocks"],
  diplomacy: ["diplomacy"],
  "diplomacy-rule": ["diplomacy"],
  military: ["military"],
  "military-policy": ["military"],
  "military-rule": ["military"],
  zones: ["zones"],
  economy: ["economy"],
  "economy-mutation": ["economy"],
  "ocean-current": ["oceanCurrents"],
  city: ["settlements.cities", "settlements.metadata", "pack.burgs", "pack.cells.burg", "politics.states", "pack.states", "politics.provinces", "pack.provinces"],
  routes: ["settlements.routes", "pack.routes", "pack.cells.routes"],
  "route-path-history": ["settlements.routes", "pack.routes", "pack.cells.routes"],
  population: ["grid.cells.pop", "pack.cells.pop", "settlements.cities"],
  "population-adjustment": ["grid.cells.pop", "pack.cells.pop", "settlements.cities"],
  "population-mutation": ["grid.cells.pop", "pack.cells.pop", "settlements.cities"],
  "population-transfer": ["grid.cells.pop", "pack.cells.pop", "settlements.cities"],
  biome: ["grid.cells.biome", "pack.cells.biome"],
  suitability: ["grid.cells.s", "pack.cells.s", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride"],
  culture: ["society.cultures", "grid.cells.culture", "pack.cells.culture", "settlements.cities"],
  religion: ["society.religions", "grid.cells.religion", "pack.cells.religion", "settlements.cities"],
  politics: ["politics", "grid.cells.state", "grid.cells.province", "grid.cells.region", "pack.cells.state", "pack.cells.province", "pack.cells.region", "settlements.cities"],
  state: ["politics.states", "grid.cells.state", "pack.cells.state", "settlements.cities"],
  "state-topology": ["politics", "grid.cells.state", "grid.cells.province", "pack.cells.state", "pack.cells.province", "settlements.cities"],
  province: ["politics.provinces", "grid.cells.province", "pack.cells.province", "settlements.cities"],
  "province-topology": ["politics.provinces", "grid.cells.province", "pack.cells.province", "settlements.cities"],
  "provincial-capital": ["politics.provinces", "settlements.cities"],
  "political-transfer": ["politics", "grid.cells.state", "grid.cells.province", "pack.cells.state", "pack.cells.province", "settlements.cities"]
});

export async function createCommandMapReplicaPatch({map, command, action = "execute", mapIdentity, baseRevision, targetRevision, patchId, baseChecksum, capturedWrites = null, yieldToMain} = {}) {
  if (!map || typeof map !== "object" || !command) return null;
  const domain = String(command.domain || "none");
  const writes = capturedWrites || captureCommandMapReplicaWrites({map, command});
  if (!writes.length) return null;
  const targetChecksum = await computeMapReplicaPatchTargetChecksum(baseChecksum, writes, {yieldToMain});
  return createMapReplicaPatch({
    mapIdentity,
    patchId: patchId || `${String(action || "execute")}:${domain}:${targetRevision}`,
    baseRevision,
    targetRevision,
    baseChecksum,
    targetChecksum,
    writes
  });
}

export function captureCommandMapReplicaWrites({map, command} = {}) {
  return structuredClone(collectCommandMapReplicaWrites({map, command}));
}

export async function captureCommandMapReplicaWritesAsync({
  map,
  command,
  budgetMs = 4,
  yieldToMain,
  isCurrent = null,
  onClone = null
} = {}) {
  const writes = collectCommandMapReplicaWrites({map, command});
  if (!writes.length) return [];
  const cloned = await cloneWorkerGraphByPackets(writes, {budgetMs, yieldToMain});
  if (typeof isCurrent === "function" && isCurrent() !== true) {
    throw patchError("map_replica_patch_capture_obsolete", "地图副本 patch 捕获已被新的地图状态取代");
  }
  onClone?.({packetStats: cloned.packetStats});
  return cloned.value;
}

function collectCommandMapReplicaWrites({map, command} = {}) {
  if (!map || typeof map !== "object" || !command) return [];
  const domain = String(command.domain || "none");
  const commandPaths = typeof command.getReplicaPaths === "function" ? command.getReplicaPaths(map) : null;
  const paths = Array.isArray(commandPaths) && commandPaths.length ? commandPaths : DOMAIN_PATHS[domain];
  if (!paths) return [];
  const writes = [];
  for (const path of paths) {
    if (!resolveCanonicalMapWriteDescriptor(path)) {
      throw patchError("map_replica_path_unregistered", `地图副本 write path 未登记：${path}`);
    }
    const resolved = resolvePath(map, path);
    writes.push(resolved.found
      ? {path, mode: "replace", value: resolved.value}
      : {path, mode: "delete"});
  }
  return writes;
}

export function listCommandMapReplicaPaths(domain) {
  return [...(DOMAIN_PATHS[String(domain || "")] || [])];
}

function resolvePath(root, path) {
  let value = root;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return {found: false, value: undefined};
    value = value[part];
  }
  return {found: true, value};
}

function patchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
