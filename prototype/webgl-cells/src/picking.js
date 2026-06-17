import {clampIndex, roundMs} from "./utils.js";
import {getThemeCellInfo} from "./themes.js";

export function buildPickingIndex(snapshot) {
  const {cells, vertices, metadata} = snapshot;
  const columns = Math.max(8, Math.ceil(Math.sqrt(cells.i.length)));
  const rows = Math.max(8, Math.ceil(columns * metadata.graphHeight / metadata.graphWidth));
  const cellWidth = metadata.graphWidth / columns;
  const cellHeight = metadata.graphHeight / rows;
  const buckets = Array.from({length: columns * rows}, () => []);
  const bounds = Array(cells.i.length);

  for (let cellIndex = 0; cellIndex < cells.i.length; cellIndex++) {
    const vertexIds = cells.v[cellIndex];
    if (!vertexIds || vertexIds.length < 3) continue;

    const box = getPolygonBounds(vertexIds, vertices.p);
    if (!box) continue;
    bounds[cellIndex] = box;

    const minColumn = clampIndex(Math.floor(box.minX / cellWidth), columns);
    const maxColumn = clampIndex(Math.floor(box.maxX / cellWidth), columns);
    const minRow = clampIndex(Math.floor(box.minY / cellHeight), rows);
    const maxRow = clampIndex(Math.floor(box.maxY / cellHeight), rows);

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        buckets[row * columns + column].push(cellIndex);
      }
    }
  }

  const nonEmptyBuckets = buckets.filter(bucket => bucket.length > 0);
  const candidateTotal = nonEmptyBuckets.reduce((sum, bucket) => sum + bucket.length, 0);

  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    buckets,
    bounds,
    stats: {
      buckets: buckets.length,
      nonEmptyBuckets: nonEmptyBuckets.length,
      avgCandidates: nonEmptyBuckets.length ? roundMs(candidateTotal / nonEmptyBuckets.length) : 0,
      maxCandidates: Math.max(0, ...nonEmptyBuckets.map(bucket => bucket.length))
    }
  };
}

export function pickCellAtPoint(snapshot, buffers, point) {
  if (!snapshot) return {hit: null, lastPick: null};
  const {cells, vertices, states} = snapshot;
  const pickStartedAt = performance.now();
  const candidates = getPickCandidates(buffers.pickingIndex, point);

  for (const index of candidates) {
    const vertexIds = cells.v[index];
    if (!vertexIds || vertexIds.length < 3) continue;
    const bounds = buffers.pickingIndex.bounds[index];
    if (!containsPoint(bounds, point)) continue;

    const polygon = vertexIds.map(vertexId => vertices.p[vertexId]).filter(Boolean);
    if (!pointInPolygon(point, polygon)) continue;

    const stateId = cells.state[index] || 0;
    const themeInfo = getThemeCellInfo(snapshot, index, cells.g?.[index]);
    const hit = {
      id: cells.i[index],
      height: cells.h[index] || 0,
      stateId,
      stateName: states[stateId]?.name || "无",
      ...themeInfo,
      x: point.x,
      y: point.y,
      pickMs: roundMs(performance.now() - pickStartedAt),
      pickCandidates: candidates.length
    };
    return {hit, lastPick: hit};
  }

  return {
    hit: null,
    lastPick: {
      x: point.x,
      y: point.y,
      pickMs: roundMs(performance.now() - pickStartedAt),
      pickCandidates: candidates.length
    }
  };
}

function getPolygonBounds(vertexIds, vertexPoints) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const vertexId of vertexIds) {
    const point = vertexPoints[vertexId];
    if (!point) continue;
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }

  if (!Number.isFinite(minX)) return null;
  return {minX, minY, maxX, maxY};
}

function getPickCandidates(pickingIndex, point) {
  if (!pickingIndex) return [];
  const column = Math.floor(point.x / pickingIndex.cellWidth);
  const row = Math.floor(point.y / pickingIndex.cellHeight);
  if (column < 0 || row < 0 || column >= pickingIndex.columns || row >= pickingIndex.rows) return [];
  return pickingIndex.buckets[row * pickingIndex.columns + column];
}

function containsPoint(bounds, point) {
  return bounds && point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
