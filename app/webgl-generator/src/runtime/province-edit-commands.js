const PROVINCE_CELL_SURFACE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "province-cells",
    "province-statistics",
    "city-provinces",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "object-panels"
  ])
});

export const PROVINCE_BRUSH_PREVIEW_EFFECTS = Object.freeze({
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["province-cells", "cell-colors"])
});

export function createApplyProvinceBrushCommand(changes, {label = "省份笔刷"} = {}) {
  const normalized = normalizeChanges(changes);
  const affectedProvinces = [...new Set(normalized.flatMap(change => [change.before, change.after]).filter(Boolean))];
  let snapshot = null;
  return {
    label: `${label} ${normalized.length} cells`,
    effects: {
      ...PROVINCE_CELL_SURFACE_EFFECTS,
      affected: affectedProvinces.length ? affectedProvinces.map(id => ({kind: "province", id})) : [{kind: "grid-cells", id: normalized.length}]
    },
    apply(context) {
      snapshot ??= captureProvinceSnapshot(context.map, normalized);
      applyProvinceChanges(context.map, normalized, "after");
      repairProvinceDerivatives(context.map, normalized);
    },
    revert(context) {
      applyProvinceChanges(context.map, normalized, "before");
      restoreProvinceSnapshot(context.map, snapshot);
    },
    isNoop() {
      return normalized.length === 0;
    },
    getChanges() {
      return normalized;
    }
  };
}

export function applyProvinceBrushPreview(map, changes) {
  applyProvinceChanges(map, normalizeChanges(changes), "after");
}

function normalizeChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change.gridCell);
    const before = normalizeProvinceId(change.before);
    const after = normalizeProvinceId(change.after);
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

function captureProvinceSnapshot(map, changes) {
  const packCells = uniquePackCellsForChanges(map, changes);
  const affectedProvinceIds = new Set(changes.flatMap(change => [change.before, change.after]).filter(Boolean));
  for (const packCell of packCells) {
    const provinceId = normalizeProvinceId(map?.pack?.cells?.province?.[packCell]);
    if (provinceId) affectedProvinceIds.add(provinceId);
  }
  const cityIds = new Set();
  const changedGridCells = new Set(changes.map(change => change.gridCell));
  const changedPackCells = new Set(packCells);
  for (const city of map?.settlements?.cities || []) {
    if (!city) continue;
    if (changedGridCells.has(city.cell) || changedPackCells.has(city.packCell)) cityIds.add(city.id);
  }

  return {
    cities: [...cityIds].map(cityId => {
      const city = map?.settlements?.cities?.[cityId];
      return city ? {cityId, province: city.province, provincial: city.provincial} : null;
    }).filter(Boolean),
    provinces: snapshotProvinces(map, affectedProvinceIds)
  };
}

function applyProvinceChanges(map, changes, key) {
  if (!map?.grid?.cells?.province) return;
  for (const change of changes) {
    const provinceId = normalizeProvinceId(change[key]);
    map.grid.cells.province[change.gridCell] = provinceId;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      if (map?.pack?.cells?.h?.[packCell] < 20) continue;
      map.pack.cells.province[packCell] = provinceId;
    }
  }
}

function repairProvinceDerivatives(map, changes) {
  const affectedProvinces = new Set(changes.flatMap(change => [change.before, change.after]).filter(Boolean));
  for (const packCell of uniquePackCellsForChanges(map, changes)) {
    const provinceId = normalizeProvinceId(map?.pack?.cells?.province?.[packCell]);
    if (provinceId) affectedProvinces.add(provinceId);
  }
  syncCityProvinces(map, changes);
  refreshProvinceSummaries(map);
  repairProvinceCenters(map, affectedProvinces);
  refreshProvincePoles(map, affectedProvinces);
}

function syncCityProvinces(map, changes) {
  const changedGridCells = new Set(changes.map(change => change.gridCell));
  const changedPackCells = new Set(uniquePackCellsForChanges(map, changes));
  for (const city of map?.settlements?.cities || []) {
    if (!city) continue;
    if (!changedGridCells.has(city.cell) && !changedPackCells.has(city.packCell)) continue;
    if (Number.isInteger(city.packCell) && city.packCell >= 0 && map?.pack?.cells?.province) {
      city.province = normalizeProvinceId(map.pack.cells.province[city.packCell]);
    } else if (Number.isInteger(city.cell) && map?.grid?.cells?.province) {
      city.province = normalizeProvinceId(map.grid.cells.province[city.cell]);
    }
  }
}

function repairProvinceCenters(map, provinceIds) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province) return;
  for (const provinceId of provinceIds || []) {
    const province = provinces[provinceId];
    if (!province || province.removed) continue;
    const currentCenter = normalizePackCell(province.center);
    if (currentCenter >= 0 && normalizeProvinceId(cells.province?.[currentCenter]) === provinceId) continue;
    const city = (map?.settlements?.cities || [])
      .filter(item => item && item.province === provinceId)
      .sort((a, b) => Number(b.provincial) - Number(a.provincial) || (b.population || 0) - (a.population || 0) || a.id - b.id)[0];
    if (city?.packCell >= 0 && normalizeProvinceId(cells.province?.[city.packCell]) === provinceId) {
      setProvinceCenter(map, province, city.packCell);
      continue;
    }
    const fallback = (cells.i || []).find(cell => cells.h?.[cell] >= 20 && normalizeProvinceId(cells.province?.[cell]) === provinceId);
    if (fallback !== undefined) setProvinceCenter(map, province, fallback);
  }
}

function setProvinceCenter(map, province, packCell) {
  province.center = packCell;
  province.gridCenter = map?.pack?.cells?.g?.[packCell] ?? province.gridCenter;
  province.religion = map?.pack?.cells?.religion?.[packCell] ?? province.religion;
}

function restoreProvinceSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const item of snapshot.cities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    if (city) {
      city.province = item.province;
      city.provincial = item.provincial;
    }
  }
  restoreProvinces(map, snapshot.provinces);
}

function refreshProvinceSummaries(map) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province) return;
  const neighborSets = provinces.map(() => new Set());

  for (const province of provinces) {
    if (!province) continue;
    province.cells = 0;
    province.area = 0;
    province.neighbors = [];
  }

  for (const cell of cells.i || []) {
    if (cells.h?.[cell] < 20) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    const province = provinces[provinceId];
    if (!province) continue;
    province.cells++;
    province.area += cells.area?.[cell] || 0;

    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) continue;
      const neighborProvince = normalizeProvinceId(cells.province[neighbor]);
      if (neighborProvince && neighborProvince !== provinceId && provinces[neighborProvince]) {
        neighborSets[provinceId]?.add(neighborProvince);
      }
    }
  }

  for (const province of provinces) {
    if (!province) continue;
    province.area = roundValue(province.area || 0, 2);
    province.neighbors = Array.from(neighborSets[province.i ?? province.id] || []);
  }
}

function refreshProvincePoles(map, targetProvinceIds = null) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province || !cells?.p) return;
  const targets = targetProvinceIds?.size ? targetProvinceIds : new Set(provinces.map(province => normalizeProvinceId(province?.i ?? province?.id)).filter(Boolean));
  const provinceCells = new Map();
  const provinceBoundaryCells = new Map();

  for (const cell of cells.i || []) {
    if (cells.h?.[cell] < 20) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    if (!provinceId || !targets.has(provinceId)) continue;
    if (!provinceCells.has(provinceId)) provinceCells.set(provinceId, []);
    provinceCells.get(provinceId).push(cell);

    const isBoundary = (cells.c?.[cell] || []).some(neighbor => cells.h?.[neighbor] < 20 || normalizeProvinceId(cells.province?.[neighbor]) !== provinceId);
    if (isBoundary) {
      if (!provinceBoundaryCells.has(provinceId)) provinceBoundaryCells.set(provinceId, []);
      provinceBoundaryCells.get(provinceId).push(cell);
    }
  }

  for (const provinceId of targets) {
    const province = provinces[provinceId];
    if (!province || province.removed) continue;
    const ownCells = provinceCells.get(provinceId) || [];
    if (!ownCells.length) {
      province.pole = null;
      continue;
    }
    const boundaryCells = provinceBoundaryCells.get(provinceId) || ownCells;
    const poleCell = findProvincePoleCell(cells, ownCells, boundaryCells, province.center);
    province.pole = cells.p[poleCell].map(value => roundValue(value, 2));
  }
}

function findProvincePoleCell(cells, ownCells, boundaryCells, fallbackCell) {
  if (ownCells.length <= 2) return fallbackCell && ownCells.includes(fallbackCell) ? fallbackCell : ownCells[0];
  let bestCell = ownCells[0];
  let bestScore = -Infinity;
  for (const cell of ownCells) {
    const point = cells.p[cell];
    if (!point) continue;
    const minBoundaryDistance = getMinDistanceSquared(point, boundaryCells, cells);
    const populationScore = cells.pop?.[cell] || cells.s?.[cell] || 0;
    const burgScore = cells.burg?.[cell] ? 5 : 0;
    const score = minBoundaryDistance + populationScore * 0.02 + burgScore;
    if (score <= bestScore) continue;
    bestCell = cell;
    bestScore = score;
  }
  return bestCell;
}

function getMinDistanceSquared(point, boundaryCells, cells) {
  let min = Infinity;
  for (const cell of boundaryCells) {
    const nextPoint = cells.p[cell];
    if (!nextPoint) continue;
    const next = (point[0] - nextPoint[0]) ** 2 + (point[1] - nextPoint[1]) ** 2;
    if (next < min) min = next;
  }
  return Number.isFinite(min) ? min : 0;
}

function uniquePackCellsForChanges(map, changes) {
  const cells = new Set();
  for (const change of changes) {
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) cells.add(packCell);
  }
  return [...cells];
}

function getPackCellsForGrid(map, gridCell) {
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.province) return [];
  if (!map.__provinceEditorPackCellsByGrid) {
    const byGrid = new Map();
    for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) {
      const mappedGrid = map.pack.cells.g[packCell];
      if (!Number.isInteger(mappedGrid) || mappedGrid < 0) continue;
      if (!byGrid.has(mappedGrid)) byGrid.set(mappedGrid, []);
      byGrid.get(mappedGrid).push(packCell);
    }
    map.__provinceEditorPackCellsByGrid = byGrid;
  }
  return map.__provinceEditorPackCellsByGrid.get(gridCell) || [];
}

function snapshotProvinces(map, provinceIds) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces || [];
  return [...(provinceIds || [])].map(provinceId => {
    const province = provinces[provinceId];
    return province ? {
      provinceId,
      province: {
        cells: province.cells,
        area: province.area,
        center: province.center,
        gridCenter: province.gridCenter,
        religion: province.religion,
        pole: Array.isArray(province.pole) ? [...province.pole] : province.pole,
        neighbors: Array.isArray(province.neighbors) ? [...province.neighbors] : []
      }
    } : null;
  }).filter(Boolean);
}

function restoreProvinces(map, snapshots = []) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  if (!provinces) return;
  for (const snapshot of snapshots) {
    const province = provinces[snapshot.provinceId];
    if (province) Object.assign(province, snapshot.province, {neighbors: [...(snapshot.province.neighbors || [])]});
  }
}

function normalizeProvinceId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function normalizePackCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function roundValue(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
