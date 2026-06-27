const STATE_CELL_SURFACE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["state-cells", "cell-colors", "political-selection"])
});

export const STATE_BRUSH_PREVIEW_EFFECTS = Object.freeze({
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["state-cells", "cell-colors"])
});

const STATE_COLOR_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["state-color", "cell-colors", "object-panels"])
});

export function createApplyStateBrushCommand(changes, {label = "国家笔刷"} = {}) {
  const normalized = normalizeChanges(changes);
  const affectedStates = [...new Set(normalized.flatMap(change => [change.before, change.after]).filter(stateId => stateId > 0))];
  return {
    label: `${label} ${normalized.length} cells`,
    effects: {
      ...STATE_CELL_SURFACE_EFFECTS,
      affected: affectedStates.length ? affectedStates.map(id => ({kind: "state", id})) : [{kind: "grid-cells", id: normalized.length}]
    },
    apply(context) {
      applyStateChanges(context.map, normalized, "after");
    },
    revert(context) {
      applyStateChanges(context.map, normalized, "before");
    },
    isNoop() {
      return normalized.length === 0;
    },
    getChanges() {
      return normalized;
    }
  };
}

export function createSetStateColorCommand(stateId, color, {beforeColor = null, label = "国家颜色"} = {}) {
  const normalizedStateId = normalizeStateId(stateId);
  const after = normalizeHexColor(color);
  const before = normalizeHexColor(beforeColor);
  return {
    label: `${label} #${normalizedStateId}`,
    effects: {
      ...STATE_COLOR_EFFECTS,
      affected: [{kind: "state", id: normalizedStateId}]
    },
    apply(context) {
      setStateColor(context.map, normalizedStateId, after);
    },
    revert(context) {
      setStateColor(context.map, normalizedStateId, before);
    },
    isNoop() {
      return normalizedStateId <= 0 || !after || before === after;
    }
  };
}

export function applyStateBrushPreview(map, changes) {
  applyStateChanges(map, normalizeChanges(changes), "after");
}

function normalizeChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change.gridCell);
    const before = normalizeStateId(change.before);
    const after = normalizeStateId(change.after);
    if (!Number.isInteger(gridCell) || before === after) continue;
    const previous = byCell.get(gridCell);
    byCell.set(gridCell, {
      gridCell,
      before: previous?.before ?? before,
      after
    });
  }
  return [...byCell.values()];
}

function applyStateChanges(map, changes, key) {
  if (!map?.grid?.cells?.state) return;
  for (const change of changes) {
    const stateId = normalizeStateId(change[key]);
    map.grid.cells.state[change.gridCell] = stateId;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      if (map.pack.cells.h?.[packCell] < 20) continue;
      map.pack.cells.state[packCell] = stateId;
    }
  }
}

function getPackCellsForGrid(map, gridCell) {
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.state) return [];
  if (!map.__stateEditorPackCellsByGrid) {
    const byGrid = new Map();
    for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) {
      const mappedGrid = map.pack.cells.g[packCell];
      if (!Number.isInteger(mappedGrid) || mappedGrid < 0) continue;
      if (!byGrid.has(mappedGrid)) byGrid.set(mappedGrid, []);
      byGrid.get(mappedGrid).push(packCell);
    }
    map.__stateEditorPackCellsByGrid = byGrid;
  }
  return map.__stateEditorPackCellsByGrid.get(gridCell) || [];
}

function normalizeStateId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function setStateColor(map, stateId, color) {
  const state = map?.politics?.states?.[stateId];
  if (!state || !color) return;
  state.color = color;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
