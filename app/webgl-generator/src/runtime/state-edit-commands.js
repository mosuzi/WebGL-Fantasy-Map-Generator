const STATE_CELL_SURFACE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "state-cells",
    "pack-state-cells",
    "settlement-states",
    "state-statistics",
    "province-cells",
    "province-statistics",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "labels",
    "object-panels",
    "derived-stale",
    "province-poles",
    "defer:military",
    "defer:zones",
    "defer:state-markers"
  ])
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
  let settlementSnapshot = null;
  let politicalSnapshot = null;
  return {
    label: `${label} ${normalized.length} cells`,
    effects: {
      ...STATE_CELL_SURFACE_EFFECTS,
      affected: affectedStates.length ? affectedStates.map(id => ({kind: "state", id})) : [{kind: "grid-cells", id: normalized.length}]
    },
    apply(context) {
      settlementSnapshot ??= captureSettlementSnapshot(context.map, normalized);
      politicalSnapshot ??= capturePoliticalDerivativeSnapshot(context.map, normalized, settlementSnapshot);
      applyStateChanges(context.map, normalized, "after");
      applySettlementTransfers(context.map, settlementSnapshot);
      repairPoliticalDerivativesForStateBrush(context.map, normalized, settlementSnapshot);
      refreshStateSummaries(context.map);
    },
    revert(context) {
      applyStateChanges(context.map, normalized, "before");
      restoreSettlementSnapshot(context.map, settlementSnapshot);
      restorePoliticalDerivativeSnapshot(context.map, politicalSnapshot);
      refreshStateSummaries(context.map);
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

function captureSettlementSnapshot(map, changes) {
  const nextStateByGrid = new Map(changes.map(change => [change.gridCell, normalizeStateId(change.after)]));
  const movedCities = [];
  const affectedStates = new Set(changes.flatMap(change => [change.before, change.after]).filter(stateId => stateId > 0));

  for (const city of map?.settlements?.cities || []) {
    if (!city) continue;
    const nextState = nextStateByGrid.get(city.cell);
    if (!nextState || city.state === nextState) continue;
    const burg = findBurgForCity(map, city);
    const previousState = normalizeStateId(city.state);
    movedCities.push({
      cityId: city.id,
      burgId: city.burgId,
      previousState,
      nextState,
      city: snapshotCity(city),
      burg: snapshotBurg(burg)
    });
    if (previousState) affectedStates.add(previousState);
    affectedStates.add(nextState);
  }

  const movedCityIds = new Set(movedCities.map(item => item.cityId));
  const replacementCapitalSnapshots = [];
  const capturedReplacementCities = new Set();
  for (const item of movedCities) {
    const state = map?.politics?.states?.[item.previousState];
    const movedCapital = Boolean(item.city.capital || item.burg?.capital || state?.capital === item.burgId);
    if (!movedCapital) continue;
    const candidate = chooseReplacementCapitalCandidate(map, item.previousState, movedCityIds);
    if (!candidate || capturedReplacementCities.has(candidate.id)) continue;
    const burg = findBurgForCity(map, candidate);
    replacementCapitalSnapshots.push({
      cityId: candidate.id,
      burgId: candidate.burgId,
      city: snapshotCity(candidate),
      burg: snapshotBurg(burg)
    });
    capturedReplacementCities.add(candidate.id);
  }

  return {
    movedCities,
    replacementCapitalSnapshots,
    states: [...affectedStates].map(stateId => snapshotState(map, stateId)).filter(Boolean)
  };
}

function capturePoliticalDerivativeSnapshot(map, changes, settlementSnapshot) {
  const packCells = uniquePackCellsForChanges(map, changes);
  return {
    gridProvinces: changes.map(change => [change.gridCell, map?.grid?.cells?.province?.[change.gridCell] ?? 0]),
    packStates: packCells.map(packCell => [packCell, map?.pack?.cells?.state?.[packCell] ?? 0]),
    packProvinces: packCells.map(packCell => [packCell, map?.pack?.cells?.province?.[packCell] ?? 0]),
    cities: (settlementSnapshot?.movedCities || []).map(item => {
      const city = map?.settlements?.cities?.[item.cityId];
      return city ? {cityId: item.cityId, province: city.province} : null;
    }).filter(Boolean),
    provinces: snapshotProvinces(map),
    stale: snapshotDerivedStale(map)
  };
}

function applySettlementTransfers(map, snapshot) {
  if (!snapshot?.movedCities?.length) return;
  const statesNeedingCapital = new Set();

  for (const item of snapshot.movedCities) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId] || findBurgForCity(map, city);
    if (!city) continue;
    const wasCapital = Boolean(city.capital || burg?.capital || map?.politics?.states?.[item.previousState]?.capital === item.burgId);

    city.state = item.nextState;
    if (wasCapital) {
      city.capital = false;
      city.group = city.port ? "city" : city.provincial ? "town" : "town";
      statesNeedingCapital.add(item.previousState);
    }

    if (burg) {
      burg.state = item.nextState;
      if (wasCapital) {
        burg.capital = 0;
        burg.group = burg.port ? "city" : "town";
      }
    }
  }

  for (const stateId of statesNeedingCapital) {
    chooseReplacementCapital(map, stateId);
  }
}

function repairPoliticalDerivativesForStateBrush(map, changes, settlementSnapshot) {
  const affectedProvinces = repairProvinceCells(map, changes);
  syncMovedCityProvinces(map, settlementSnapshot);
  refreshProvinceSummaries(map);
  refreshProvincePoles(map, affectedProvinces);
  markDerivedStale(map, ["military", "zones", "state-markers"]);
}

function repairProvinceCells(map, changes) {
  const affectedProvinces = new Set();
  const packCells = uniquePackCellsForChanges(map, changes);
  for (const packCell of packCells) {
    if (map?.pack?.cells?.h?.[packCell] < 20) continue;
    const stateId = normalizeStateId(map.pack.cells.state?.[packCell]);
    if (!stateId) continue;
    const provinceId = normalizeProvinceId(map.pack.cells.province?.[packCell]);
    if (provinceId) affectedProvinces.add(provinceId);
    if (provinceBelongsToState(map, provinceId, stateId)) continue;
    const nextProvince = chooseProvinceForState(map, stateId, packCell);
    map.pack.cells.province[packCell] = nextProvince;
    if (nextProvince) affectedProvinces.add(nextProvince);
  }

  for (const change of changes) {
    if (!map?.grid?.cells?.province) continue;
    map.grid.cells.province[change.gridCell] = chooseGridProvince(map, change.gridCell);
    if (map.grid.cells.province[change.gridCell]) affectedProvinces.add(map.grid.cells.province[change.gridCell]);
  }
  return affectedProvinces;
}

function syncMovedCityProvinces(map, settlementSnapshot) {
  for (const item of settlementSnapshot?.movedCities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    if (!city) continue;
    const packProvince = Number.isInteger(city.packCell) ? map?.pack?.cells?.province?.[city.packCell] : null;
    city.province = normalizeProvinceId(packProvince) || normalizeProvinceId(map?.grid?.cells?.province?.[city.cell]) || city.province;
  }
}

function restoreSettlementSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const stateSnapshot of snapshot.states || []) restoreState(map, stateSnapshot);
  for (const item of snapshot.replacementCapitalSnapshots || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId];
    if (city) Object.assign(city, item.city);
    if (burg && item.burg) Object.assign(burg, item.burg);
  }
  for (const item of snapshot.movedCities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId];
    if (city) Object.assign(city, item.city);
    if (burg && item.burg) Object.assign(burg, item.burg);
  }
}

function restorePoliticalDerivativeSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const [gridCell, provinceId] of snapshot.gridProvinces || []) {
    if (map?.grid?.cells?.province) map.grid.cells.province[gridCell] = provinceId;
  }
  for (const [packCell, provinceId] of snapshot.packProvinces || []) {
    if (map?.pack?.cells?.province) map.pack.cells.province[packCell] = provinceId;
  }
  for (const [packCell, stateId] of snapshot.packStates || []) {
    if (map?.pack?.cells?.state) map.pack.cells.state[packCell] = stateId;
  }
  for (const item of snapshot.cities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    if (city) city.province = item.province;
  }
  restoreProvinces(map, snapshot.provinces);
  restoreDerivedStale(map, snapshot.stale);
}

function chooseReplacementCapital(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  if (!state) return;
  const candidate = chooseReplacementCapitalCandidate(map, stateId);

  if (!candidate) {
    state.capital = 0;
    state.center = 0;
    state.gridCenter = 0;
    return;
  }

  const burg = findBurgForCity(map, candidate);
  if (!burg) return;
  candidate.capital = true;
  candidate.group = "capital";
  burg.capital = 1;
  burg.group = "capital";
  state.capital = burg.i ?? candidate.burgId;
  state.center = burg.cell ?? candidate.packCell;
  state.gridCenter = map?.pack?.cells?.g?.[burg.cell] ?? candidate.cell;
  state.religion = map?.pack?.cells?.religion?.[burg.cell] ?? state.religion;
}

function chooseReplacementCapitalCandidate(map, stateId, excludedCityIds = new Set()) {
  return (map?.settlements?.cities || [])
    .filter(city => city && city.state === stateId && !excludedCityIds.has(city.id))
    .sort((a, b) => Number(b.provincial) - Number(a.provincial) || (b.population || 0) - (a.population || 0) || a.id - b.id)[0];
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

function refreshStateSummaries(map) {
  const states = map?.politics?.states;
  if (!states) return;
  for (const state of states) {
    if (!state) continue;
    state.cells = 0;
    state.area = 0;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
    state.neighbors = [];
  }

  if (map?.pack?.cells?.state) {
    refreshPackStateSummaries(map);
  } else {
    refreshGridStateSummaries(map);
  }
}

function refreshPackStateSummaries(map) {
  const {cells} = map.pack;
  const states = map.politics.states;
  const neighborSets = states.map(() => new Set());

  for (const cell of cells.i || []) {
    if (cells.h?.[cell] < 20) continue;
    const stateId = cells.state[cell] || 0;
    const state = states[stateId];
    if (!state) continue;
    state.cells++;
    state.area += cells.area?.[cell] || 0;
    state.rural += cells.pop?.[cell] || 0;
    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) continue;
      const neighborState = cells.state[neighbor] || 0;
      if (neighborState && neighborState !== stateId) neighborSets[stateId]?.add(neighborState);
    }
  }

  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const state = states[burg.state];
    if (!state) continue;
    state.urban += burg.population || 0;
    state.burgs++;
  }

  finalizeStateSummaries(states, neighborSets);
}

function refreshGridStateSummaries(map) {
  const {cells} = map.grid;
  const states = map.politics.states;
  const neighborSets = states.map(() => new Set());

  for (const cell of cells.i || []) {
    if (cells.h?.[cell] < 20) continue;
    const stateId = cells.state[cell] || 0;
    const state = states[stateId];
    if (!state) continue;
    state.cells++;
    state.rural += cells.pop?.[cell] || 0;
    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) continue;
      const neighborState = cells.state[neighbor] || 0;
      if (neighborState && neighborState !== stateId) neighborSets[stateId]?.add(neighborState);
    }
  }

  for (const city of map.settlements?.cities || []) {
    if (!city) continue;
    const state = states[city.state];
    if (!state) continue;
    state.urban += city.population || 0;
    state.burgs++;
  }

  finalizeStateSummaries(states, neighborSets);
}

function finalizeStateSummaries(states, neighborSets) {
  for (const state of states) {
    if (!state) continue;
    state.area = roundValue(state.area || state.cells || 0, 2);
    state.rural = roundValue(state.rural || 0, 2);
    state.urban = roundValue(state.urban || 0, 2);
    state.neighbors = Array.from(neighborSets[state.i ?? state.id] || []);
  }
}

function uniquePackCellsForChanges(map, changes) {
  const cells = new Set();
  for (const change of changes) {
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) cells.add(packCell);
  }
  return [...cells];
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

function chooseGridProvince(map, gridCell) {
  const stateId = normalizeStateId(map?.grid?.cells?.state?.[gridCell]);
  let bestProvince = 0;
  let bestScore = -Infinity;
  for (const packCell of getPackCellsForGrid(map, gridCell)) {
    const provinceId = normalizeProvinceId(map?.pack?.cells?.province?.[packCell]);
    if (!provinceBelongsToState(map, provinceId, stateId)) continue;
    const score = map.pack.cells.pop?.[packCell] || map.pack.cells.s?.[packCell] || 0;
    if (score < bestScore) continue;
    bestProvince = provinceId;
    bestScore = score;
  }
  return bestProvince || chooseProvinceForState(map, stateId, null) || normalizeProvinceId(map?.grid?.cells?.province?.[gridCell]);
}

function chooseProvinceForState(map, stateId, packCell) {
  if (!stateId) return 0;
  const neighborProvince = chooseNeighborProvinceForState(map, stateId, packCell);
  if (neighborProvince) return neighborProvince;
  const stateProvince = largestProvinceForState(map, stateId);
  return stateProvince || 0;
}

function chooseNeighborProvinceForState(map, stateId, packCell) {
  if (!Number.isInteger(packCell)) return 0;
  for (const neighbor of map?.pack?.cells?.c?.[packCell] || []) {
    const provinceId = normalizeProvinceId(map.pack.cells.province?.[neighbor]);
    if (provinceBelongsToState(map, provinceId, stateId)) return provinceId;
  }
  return 0;
}

function largestProvinceForState(map, stateId) {
  const stateProvinceIds = new Set((map?.politics?.states?.[stateId]?.provinces || []).map(normalizeProvinceId).filter(Boolean));
  const provinces = map?.politics?.provinces || map?.pack?.provinces || [];
  return provinces
    .filter(province => province && normalizeStateId(province.state) === stateId && (!stateProvinceIds.size || stateProvinceIds.has(normalizeProvinceId(province.i ?? province.id))))
    .sort((a, b) => (b.cells || 0) - (a.cells || 0) || normalizeProvinceId(a.i ?? a.id) - normalizeProvinceId(b.i ?? b.id))
    .map(province => normalizeProvinceId(province.i ?? province.id))[0] || 0;
}

function provinceBelongsToState(map, provinceId, stateId) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  return Boolean(province && normalizeStateId(province.state) === stateId);
}

function snapshotProvinces(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || []).map(province => province ? {
    provinceId: province.i ?? province.id,
    province: {
      cells: province.cells,
      area: province.area,
      pole: Array.isArray(province.pole) ? [...province.pole] : province.pole,
      neighbors: Array.isArray(province.neighbors) ? [...province.neighbors] : []
    }
  } : null).filter(Boolean);
}

function restoreProvinces(map, snapshots = []) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  if (!provinces) return;
  for (const snapshot of snapshots) {
    const province = provinces[snapshot.provinceId];
    if (province) Object.assign(province, snapshot.province, {neighbors: [...(snapshot.province.neighbors || [])]});
  }
}

function markDerivedStale(map, systems) {
  const stale = {
    systems: [...new Set([...(map?.metadata?.derivedStale?.systems || []), ...systems])],
    reason: "state-brush-political-derivatives",
    updatedAt: new Date().toISOString()
  };
  if (map?.metadata) map.metadata.derivedStale = stale;
  if (map?.military?.metadata) map.military.metadata.stale = stale.systems.includes("military");
  if (map?.zones?.metadata) map.zones.metadata.stale = stale.systems.includes("zones");
  if (map?.markers?.metadata) map.markers.metadata.stale = stale.systems.includes("state-markers");
}

function snapshotDerivedStale(map) {
  return {
    map: map?.metadata?.derivedStale ? {...map.metadata.derivedStale, systems: [...(map.metadata.derivedStale.systems || [])]} : null,
    military: map?.military?.metadata ? map.military.metadata.stale : undefined,
    zones: map?.zones?.metadata ? map.zones.metadata.stale : undefined,
    markers: map?.markers?.metadata ? map.markers.metadata.stale : undefined
  };
}

function restoreDerivedStale(map, snapshot) {
  if (!snapshot) return;
  if (map?.metadata) {
    if (snapshot.map) map.metadata.derivedStale = {...snapshot.map, systems: [...(snapshot.map.systems || [])]};
    else delete map.metadata.derivedStale;
  }
  if (map?.military?.metadata && snapshot.military !== undefined) map.military.metadata.stale = snapshot.military;
  if (map?.zones?.metadata && snapshot.zones !== undefined) map.zones.metadata.stale = snapshot.zones;
  if (map?.markers?.metadata && snapshot.markers !== undefined) map.markers.metadata.stale = snapshot.markers;
}

function normalizeStateId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeProvinceId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function setStateColor(map, stateId, color) {
  const state = map?.politics?.states?.[stateId];
  if (!state || !color) return;
  state.color = color;
}

function findBurgForCity(map, city) {
  if (!city) return null;
  return map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city.id) || null;
}

function snapshotCity(city) {
  return {
    state: city.state,
    province: city.province,
    capital: city.capital,
    group: city.group,
    provincial: city.provincial
  };
}

function snapshotBurg(burg) {
  return burg ? {
    state: burg.state,
    capital: burg.capital,
    group: burg.group
  } : null;
}

function snapshotState(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  return state ? {
    stateId,
    state: {
      capital: state.capital,
      center: state.center,
      gridCenter: state.gridCenter,
      religion: state.religion,
      cells: state.cells,
      area: state.area,
      burgs: state.burgs,
      rural: state.rural,
      urban: state.urban,
      neighbors: Array.isArray(state.neighbors) ? [...state.neighbors] : []
    }
  } : null;
}

function restoreState(map, snapshot) {
  const state = map?.politics?.states?.[snapshot.stateId];
  if (state) Object.assign(state, snapshot.state, {neighbors: [...(snapshot.state.neighbors || [])]});
}

function roundValue(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
