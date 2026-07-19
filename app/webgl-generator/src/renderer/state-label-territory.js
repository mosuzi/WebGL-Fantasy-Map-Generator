export function resolveStateLabelPlacement(map, state, text = "") {
  if (!state) return null;
  const stateId = politicalId(state);
  const cells = map?.pack?.cells;
  if (stateId > 0 && cells?.p && cells?.state) {
    const components = collectStateLandComponents(cells, stateId);
    if (components.length) {
      const capitalCell = resolveStateCapitalPackCell(map, state);
      const component = components.find(item => item.cellSet.has(capitalCell)) || largestComponent(components);
      const centroid = weightedCentroid(cells, component.cells);
      const anchorCell = nearestComponentCell(cells, component.cells, centroid);
      const point = cells.p[anchorCell];
      return {
        x: point[0],
        y: point[1],
        cell: anchorCell,
        componentCells: component.cells,
        componentCellSet: component.cellSet,
        source: component.cellSet.has(capitalCell) ? "capital-component" : "largest-component",
        rotation: stateLabelRotation(cells, component.cells, stateId, centroid, text)
      };
    }
  }

  const center = integerOrNull(state.center);
  if (center !== null && isWorldPoint(cells?.p?.[center])) {
    const [x, y] = cells.p[center];
    return {x, y, cell: center, componentCells: [], componentCellSet: new Set(), source: "center", rotation: 0};
  }
  const gridCenter = integerOrNull(state.gridCenter);
  if (gridCenter !== null) {
    const point = map?.grid?.points?.[map.grid.cells.p?.[gridCenter]];
    if (isWorldPoint(point)) return {x: point[0], y: point[1], cell: null, componentCells: [], componentCellSet: new Set(), source: "grid-center", rotation: 0};
  }
  return null;
}

export function collectStateLandComponents(cells, stateId) {
  const eligible = new Set();
  for (const cell of cells?.i || []) {
    if (cells.state?.[cell] === stateId && Number(cells.h?.[cell]) >= 20 && isWorldPoint(cells.p?.[cell])) eligible.add(cell);
  }

  const visited = new Set();
  const components = [];
  for (const start of eligible) {
    if (visited.has(start)) continue;
    const queue = [start];
    const componentCells = [];
    const cellSet = new Set();
    let area = 0;
    visited.add(start);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      componentCells.push(cell);
      cellSet.add(cell);
      area += positiveArea(cells.area?.[cell]);
      for (const neighbor of cells.c?.[cell] || []) {
        if (!eligible.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    componentCells.sort((left, right) => left - right);
    components.push({cells: Object.freeze(componentCells), cellSet, area});
  }
  return components;
}

function resolveStateCapitalPackCell(map, state) {
  const capitalId = integerOrNull(state?.capital);
  if (capitalId === null || capitalId <= 0) return null;
  const direct = map?.pack?.burgs?.[capitalId];
  if (matchesBurgId(direct, capitalId) && integerOrNull(direct.cell) !== null) return Number(direct.cell);
  const burg = (map?.pack?.burgs || []).find(item => matchesBurgId(item, capitalId));
  if (burg && integerOrNull(burg.cell) !== null) return Number(burg.cell);
  const city = (map?.settlements?.cities || []).find(item => Number(item?.burgId) === capitalId);
  return integerOrNull(city?.packCell);
}

function matchesBurgId(burg, capitalId) {
  if (!burg || burg.removed) return false;
  return [burg.i, burg.id, burg.burgId].some(value => Number(value) === capitalId);
}

function largestComponent(components) {
  return [...components].sort((left, right) => right.area - left.area || right.cells.length - left.cells.length || left.cells[0] - right.cells[0])[0];
}

function weightedCentroid(cells, componentCells) {
  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (const cell of componentCells) {
    const weight = positiveArea(cells.area?.[cell]);
    weightSum += weight;
    xSum += cells.p[cell][0] * weight;
    ySum += cells.p[cell][1] * weight;
  }
  return {x: xSum / weightSum, y: ySum / weightSum};
}

function nearestComponentCell(cells, componentCells, point) {
  let best = componentCells[0];
  let bestDistance = Infinity;
  for (const cell of componentCells) {
    const dx = cells.p[cell][0] - point.x;
    const dy = cells.p[cell][1] - point.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance || (distance === bestDistance && cell < best)) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

function stateLabelRotation(cells, componentCells, stateId, centroid, text) {
  if (Array.from(text || "").length < 5) return 0;
  let weightSum = 0;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const cell of componentCells) {
    const weight = positiveArea(cells.area?.[cell]);
    const dx = cells.p[cell][0] - centroid.x;
    const dy = cells.p[cell][1] - centroid.y;
    weightSum += weight;
    xx += dx * dx * weight;
    yy += dy * dy * weight;
    xy += dx * dy * weight;
  }
  if (!weightSum) return 0;
  const radians = 0.5 * Math.atan2(2 * xy, xx - yy);
  const angle = clampLabelAngle((radians * 180) / Math.PI);
  return Math.abs(angle) >= 8 ? angle : (stateId % 2 ? -12 : 12);
}

function clampLabelAngle(angle) {
  let value = angle;
  while (value > 90) value -= 180;
  while (value < -90) value += 180;
  if (value > 45) value -= 90;
  if (value < -45) value += 90;
  return Math.round(Math.max(-28, Math.min(28, value)) * 10) / 10;
}

function politicalId(item) {
  const value = Number(item?.i ?? item?.id);
  return Number.isInteger(value) ? value : 0;
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function positiveArea(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function isWorldPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}
