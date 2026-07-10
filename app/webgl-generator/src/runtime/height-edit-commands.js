import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {systemAffected} from "./edit-command-effects.js";

const HEIGHT_DEPENDENT_DERIVED_SYSTEMS = Object.freeze([
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

export function createApplyHeightBrushCommand(changes, {label = "高度笔刷"} = {}) {
  const normalized = normalizeChanges(changes);
  return {
    label: `${label} ${normalized.length} cells`,
    effects: {
      ...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY,
      derived: [...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY.derived, ...HEIGHT_DEPENDENT_DERIVED_SYSTEMS.map(system => `defer:${system}`)],
      affected: systemAffected("height-brush", [{kind: "grid-cells", id: normalized.length}])
    },
    apply(context) {
      applyHeights(context.map, normalized, "after");
      markHeightDependentDerivedStale(context.map);
    },
    revert(context) {
      applyHeights(context.map, normalized, "before");
      markHeightDependentDerivedStale(context.map);
    },
    isNoop() {
      return normalized.length === 0;
    },
    getChanges() {
      return normalized;
    }
  };
}

export function applyHeightBrushPreview(map, changes) {
  applyHeights(map, normalizeChanges(changes), "after");
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

function applyHeights(map, changes, key) {
  if (!map?.grid?.cells?.h) return;
  for (const change of changes) {
    const value = clampHeight(change[key]);
    map.grid.cells.h[change.gridCell] = value;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      map.pack.cells.h[packCell] = value;
    }
  }
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

function getPackCellsForGrid(map, gridCell) {
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.h) return [];
  if (!map.__heightEditorPackCellsByGrid) {
    const byGrid = new Map();
    for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) {
      const mappedGrid = map.pack.cells.g[packCell];
      if (!Number.isInteger(mappedGrid) || mappedGrid < 0) continue;
      if (!byGrid.has(mappedGrid)) byGrid.set(mappedGrid, []);
      byGrid.get(mappedGrid).push(packCell);
    }
    map.__heightEditorPackCellsByGrid = byGrid;
  }
  return map.__heightEditorPackCellsByGrid.get(gridCell) || [];
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
