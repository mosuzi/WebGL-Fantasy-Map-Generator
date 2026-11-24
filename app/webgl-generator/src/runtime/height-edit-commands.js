import {packCellsByGrid} from "./grid-pack-index.js";
import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {systemAffected} from "./edit-command-effects.js";

const HEIGHT_DEPENDENT_DERIVED_SYSTEMS = Object.freeze([
  "features",
  "rivers",
  "routes",
  "biomes",
  "cities",
  "states",
  "provinces",
  "religions",
  "markers",
  "zones",
  "military",
  "economy",
  "diplomacy"
]);

export function createApplyHeightBrushCommand(changes, {label = "高度笔刷", originalPackHeights = new Map()} = {}) {
  const normalized = normalizeChanges(changes);
  let previous;
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "height",
    effects: {
      ...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY,
      changedGridCells: normalized.map(change => change.gridCell),
      derived: [
        ...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY.derived,
        ...HEIGHT_DEPENDENT_DERIVED_SYSTEMS.map(system => `defer:${system}`)
      ],
      affected: systemAffected("height-brush", [{kind: "grid-cells", id: normalized.length}])
    },
    apply(context) {
      if (!previous) previous = snapshotHeightStale(context.map);
      applyHeights(context.map, normalized, "after", originalPackHeights);
      if (normalized.length) markHeightDependentDerivedStale(context.map);
    },
    revert(context) {
      applyHeights(context.map, normalized, "before", originalPackHeights);
      for (const {section, key, value, exists} of previous || []) {
        const owner = section ? context.map[section]?.metadata : context.map.metadata;
        if (!owner) continue;
        if (exists) owner[key] = value;
        else delete owner[key];
      }
    },
    isNoop() {
      return normalized.length === 0;
    },
    getReplicaRows(map) {
      const gridCells = normalized.map(change => change.gridCell);
      const byGrid = ensurePackCellsByGrid(map);
      return {"grid.cells.h": gridCells, "pack.cells.h": gridCells.flatMap(cell => byGrid?.get(cell) || [])};
    },
    getReplicaFields(map) {
      return [...(map.metadata ? ["metadata.derivedStale"] : []), ...["military", "zones", "markers", "economy", "diplomacy"]
        .filter(section => map[section]?.metadata).map(section => section + ".metadata.stale")];
    },
    getChanges() {
      return normalized;
    }
  };
}

export function applyHeightBrushPreview(map, changes, originalPackHeights) {
  // 中途回到整笔起始高度也是有效预览，最终入历史时才过滤整笔净变化。
  applyHeights(map, changes, "after", originalPackHeights);
}

export function restoreHeightBrushPreview(map, stroke) {
  const changes = Array.from(stroke.originals, ([gridCell, before]) => ({gridCell, before}));
  applyHeights(map, changes, "before", stroke.originalPackHeights);
}

export function prewarmHeightEditorPackCellsByGrid(map) {
  const startedAt = performance.now();
  const byGrid = ensurePackCellsByGrid(map);
  let packCellCount = 0;
  for (const cells of byGrid?.values?.() || []) packCellCount += cells.length;
  return {
    ready: Boolean(byGrid),
    gridCount: byGrid?.size || 0,
    packCellCount,
    ms: roundMs(performance.now() - startedAt)
  };
}

function normalizeChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change.gridCell);
    const before = clampHeight(change.before);
    const after = clampHeight(change.after);
    if (!Number.isInteger(gridCell) || before === after) continue;
    byCell.set(gridCell, {gridCell, before, after});
  }
  return [...byCell.values()];
}

function applyHeights(map, changes, key, originalPackHeights) {
  if (!map?.grid?.cells?.h) return;
  const packHeights = map.pack?.cells?.h;
  const writePack = (packCell, change, wasPreviewed) => {
    if (key === "after" && originalPackHeights && !originalPackHeights.has(packCell)) {
      originalPackHeights.set(packCell, wasPreviewed ? change.before : packHeights[packCell]);
    }
    const value = change[key];
    packHeights[packCell] = value === change.before ? (originalPackHeights?.get(packCell) ?? value) : value;
  };
  const packCellsByGrid = ensurePackCellsByGrid(map);
  for (const change of changes) {
    const value = clampHeight(change[key]);
    const wasPreviewed = key === "after" && map.grid.cells.h[change.gridCell] === value && value !== change.before;
    map.grid.cells.h[change.gridCell] = value;
    for (const packCell of packCellsByGrid?.get(change.gridCell) || []) {
      writePack(packCell, change, wasPreviewed);
    }
  }
}

function snapshotHeightStale(map) {
  const capture = (owner, key, section) => ({section, key, exists: Object.hasOwn(owner, key), value: owner[key]});
  return [...(map.metadata ? [capture(map.metadata, "derivedStale")] : []),
    ...["military", "zones", "markers", "economy", "diplomacy"].filter(section => map[section]?.metadata)
      .map(section => capture(map[section].metadata, "stale", section))];
}

function markHeightDependentDerivedStale(map) {
  if (!map?.metadata) return;
  const systems = new Set([...(map.metadata.derivedStale?.systems || []), ...HEIGHT_DEPENDENT_DERIVED_SYSTEMS]);
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...systems]
  };
  if (map.military?.metadata) map.military.metadata.stale = true;
  if (map.zones?.metadata) map.zones.metadata.stale = true;
  if (map.markers?.metadata) map.markers.metadata.stale = true;
  if (map.economy?.metadata) map.economy.metadata.stale = true;
  if (map.diplomacy?.metadata) map.diplomacy.metadata.stale = true;
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function ensurePackCellsByGrid(map) {
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.h) return null;
  return packCellsByGrid(map, "__heightEditorPackCellsByGrid");
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
