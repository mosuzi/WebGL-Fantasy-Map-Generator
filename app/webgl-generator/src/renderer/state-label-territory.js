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
      const anchorCell = centralInteriorCell(cells, component, centroid);
      const point = cells.p[anchorCell];
      return {
        x: point[0],
        y: point[1],
        cell: anchorCell,
        componentCells: component.cells,
        componentCellSet: component.cellSet,
        source: component.cellSet.has(capitalCell) ? "capital-component" : "largest-component",
        rotation: stateLabelRotation(cells, component.cells, centroid)
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

const componentPolygonIndexes = new WeakMap();

export function stateLabelComponentContainsPoint(map, componentCellSet, x, y, candidateCell) {
  if (!componentCellSet?.size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const cells = map?.pack?.cells;
  const vertices = map?.pack?.vertices?.p;
  if (!cells?.v || !vertices) return componentCellSet.has(nearestPackCenter(cells?.p, x, y));
  for (const cell of [candidateCell, ...(cells.c?.[candidateCell] || [])]) {
    if (componentCellSet.has(cell) && pointInPackCell(cells.v[cell], vertices, x, y)) return true;
  }
  const index = componentPolygonIndex(map, componentCellSet);
  const key = `${Math.floor(x / index.bucketSize)},${Math.floor(y / index.bucketSize)}`;
  for (const cell of [...(index.buckets.get(key) || []), ...index.oversized]) {
    if (pointInPackCell(cells.v[cell], vertices, x, y)) return true;
  }
  if (!index.polygonCount) return componentCellSet.has(nearestPackCenter(cells.p, x, y));
  return false;
}

function componentPolygonIndex(map, componentCellSet) {
  const cells = map.pack.cells;
  const vertices = map.pack.vertices.p;
  const cached = componentPolygonIndexes.get(componentCellSet);
  if (cached?.cellVertices === cells.v && cached?.vertices === vertices) return cached;
  const width = Number(map.metadata?.graphWidth) || 1000;
  const height = Number(map.metadata?.graphHeight) || 1000;
  const bucketSize = Math.max(1, Math.sqrt(width * height / Math.max(1, cells.p?.length || componentCellSet.size)) * 2);
  const buckets = new Map();
  const oversized = [];
  let polygonCount = 0;
  for (const cell of componentCellSet) {
    const polygon = cells.v[cell];
    if (!polygon || polygon.length < 3) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const vertexId of polygon) {
      const point = vertices[vertexId];
      if (!point) continue;
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
    }
    if (!Number.isFinite(minX)) continue;
    polygonCount++;
    const left = Math.floor(minX / bucketSize);
    const right = Math.floor(maxX / bucketSize);
    const top = Math.floor(minY / bucketSize);
    const bottom = Math.floor(maxY / bucketSize);
    if ((right - left + 1) * (bottom - top + 1) > 64) {
      oversized.push(cell);
      continue;
    }
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const key = `${column},${row}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(cell);
        else buckets.set(key, [cell]);
      }
    }
  }
  const index = {cellVertices: cells.v, vertices, bucketSize, buckets, oversized, polygonCount};
  componentPolygonIndexes.set(componentCellSet, index);
  return index;
}

function nearestPackCenter(points, x, y) {
  let nearest = -1;
  let distance = Infinity;
  for (let cell = 0; cell < (points?.length || 0); cell++) {
    const point = points[cell];
    if (!point) continue;
    const dx = point[0] - x;
    const dy = point[1] - y;
    const nextDistance = dx * dx + dy * dy;
    if (nextDistance < distance) {
      nearest = cell;
      distance = nextDistance;
    }
  }
  return nearest;
}

function pointInPackCell(vertexIds, vertices, x, y) {
  if (!vertexIds || vertexIds.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = vertexIds.length - 1; index < vertexIds.length; previous = index++) {
    const a = vertices[vertexIds[index]];
    const b = vertices[vertexIds[previous]];
    if (!a || !b) return false;
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
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

// Prefer a central cell with land on all sides, including when the centroid falls in a bay.
function centralInteriorCell(cells, component, centroid) {
  const depth = new Map();
  const queue = [];
  for (const cell of component.cells) {
    const neighbors = cells.c?.[cell] || [];
    if (cells.b?.[cell] || neighbors.length < (cells.v?.[cell]?.length || 0) || neighbors.some(next => !component.cellSet.has(next))) {
      queue.push(cell);
      depth.set(cell, 0);
    }
  }
  if (!queue.length) return nearestComponentCell(cells, component.cells, centroid);
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    for (const next of cells.c?.[cell] || []) {
      if (!component.cellSet.has(next) || depth.has(next)) continue;
      depth.set(next, depth.get(cell) + 1);
      queue.push(next);
    }
  }
  const cellWidth = Math.sqrt(component.area / component.cells.length);
  let best = queue[0], bestScore = -Infinity;
  for (const cell of queue) {
    const [x, y] = cells.p[cell];
    const score = depth.get(cell) * cellWidth - 0.85 * Math.hypot(x - centroid.x, y - centroid.y);
    if (score > bestScore) { best = cell; bestScore = score; }
  }
  return best;
}

function stateLabelRotation(cells, componentCells, centroid) {
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
  const spread = Math.hypot(xx - yy, 2 * xy);
  // The eigenvalue ratio is the squared aspect ratio of the fitted ellipse.
  if (xx + yy + spread <= 1.4 ** 2 * (xx + yy - spread)) return 0;
  const angle = Math.atan2(2 * xy, xx - yy) * 90 / Math.PI;
  return Math.round((angle < -80 ? angle + 180 : angle) * 10) / 10;
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
