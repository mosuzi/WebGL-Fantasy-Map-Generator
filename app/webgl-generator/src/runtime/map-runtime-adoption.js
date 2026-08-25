import {backfillRiverHydrology} from "../generator/rivers.js";
import {reconcileWarDerivedData} from "../generator/war-consistency.js";
import {ensureLabelStore} from "./label-edit-commands.js";
import {normalizeSocialExpansionMap} from "./social-expansion-edit-commands.js";
import {normalizeSuitabilityMap} from "./suitability-edit-commands.js";
import {normalizeRegenerationWorkingCopy} from "./regeneration-working-copy.js";

export function normalizeMapForRuntimeAdoption(map) {
  normalizeRegenerationWorkingCopy(map);
  normalizeSocialExpansionMap(map);
  normalizeSuitabilityMap(map);
  ensureLabelStore(map);
  reconcileWarDerivedData(map);
  ensureRiverHydrology(map);
  return map;
}

function ensureRiverHydrology(map) {
  if (!map?.rivers?.rivers?.length) return;
  const result = backfillRiverHydrology(map.grid, map.features, map.pack, map.rivers, riverHydrologyBackfillOptions(map));
  if (!result.changed) return;
  appendGenerationLog(map, `backfill river hydrology: ${result.changed}/${result.total} rivers, regenerated=${result.regenerated}`);
}

function riverHydrologyBackfillOptions(map) {
  const salt = map.metadata?.regeneration?.rivers ?? map.rivers?.metadata?.variationSalt ?? "";
  const riverRegenerationSalt = salt === "" || salt === null || salt === undefined || Number(salt) === 0 ? undefined : salt;
  return {
    ...(map.options || {}),
    namebases: map.namebases,
    riverRegenerationSalt
  };
}

function appendGenerationLog(map, message) {
  if (!Array.isArray(map.metadata?.generationLog)) {
    map.metadata ||= {};
    map.metadata.generationLog = [];
  }
  map.metadata.generationLog.push(message);
}
