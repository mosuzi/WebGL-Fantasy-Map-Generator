import {createMapReplicaPatch} from "./map-replica-journal.js";
import {computeMapReplicaPatchTargetChecksum} from "./map-replica-checksum.js";

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
  if (!map || typeof map !== "object" || !command) return [];
  const domain = String(command.domain || "none");
  const commandPaths = typeof command.getReplicaPaths === "function" ? command.getReplicaPaths(map) : null;
  const paths = Array.isArray(commandPaths) && commandPaths.length ? commandPaths : DOMAIN_PATHS[domain];
  if (!paths) return [];
  const writes = [];
  for (const path of paths) {
    const resolved = resolvePath(map, path);
    if (resolved.found) writes.push({path, mode: "replace", value: resolved.value});
  }
  return structuredClone(writes);
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
