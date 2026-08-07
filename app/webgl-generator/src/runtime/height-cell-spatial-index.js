const heightCellSpatialIndexCache = new WeakMap();

export function queryHeightCellsInRadius(map, centerPoint, radiusValue) {
  const center = normalizePoint(centerPoint);
  const radius = Number(radiusValue);
  if (!center || !Number.isFinite(radius) || radius < 0) return [];

  const index = getHeightCellSpatialIndex(map);
  if (!index) return [];

  const minBucketX = Math.max(index.minBucketX, bucketCoordinate(center.x - radius, index.originX, index.bucketSize));
  const maxBucketX = Math.min(index.maxBucketX, bucketCoordinate(center.x + radius, index.originX, index.bucketSize));
  const minBucketY = Math.max(index.minBucketY, bucketCoordinate(center.y - radius, index.originY, index.bucketSize));
  const maxBucketY = Math.min(index.maxBucketY, bucketCoordinate(center.y + radius, index.originY, index.bucketSize));
  if (minBucketX > maxBucketX || minBucketY > maxBucketY) return [];
  const radiusSq = radius * radius;
  const matches = [];

  for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX++) {
    const column = index.buckets.get(bucketX);
    if (!column) continue;
    for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY++) {
      const bucket = column.get(bucketY);
      if (!bucket) continue;
      for (const cell of bucket) {
        const dx = cell.x - center.x;
        const dy = cell.y - center.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > radiusSq) continue;
        matches.push({gridCell: cell.gridCell, distanceSq});
      }
    }
  }

  matches.sort((a, b) => a.gridCell - b.gridCell);
  return matches;
}

export function prewarmHeightCellSpatialIndex(map) {
  const startedAt = performance.now();
  const index = getHeightCellSpatialIndex(map);
  return {
    ready: Boolean(index),
    cellCount: index?.cellCount || 0,
    bucketCount: index?.buckets?.size || 0,
    ms: roundMs(performance.now() - startedAt)
  };
}

function getHeightCellSpatialIndex(map) {
  const grid = map?.grid;
  const cells = grid?.cells;
  const points = grid?.points;
  const cellPointIds = cells?.p;
  const cellCount = Math.min(cellPointIds?.length || 0, cells?.h?.length || 0);
  if (!grid || typeof grid !== "object" || !cellCount || !Array.isArray(points)) return null;

  const cached = heightCellSpatialIndexCache.get(grid);
  if (cached?.points === points && cached.cellPointIds === cellPointIds && cached.cellCount === cellCount) return cached;

  const index = buildHeightCellSpatialIndex(points, cellPointIds, cellCount);
  if (!index) return null;
  heightCellSpatialIndexCache.set(grid, index);
  return index;
}

function buildHeightCellSpatialIndex(points, cellPointIds, cellCount) {
  const centers = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let gridCell = 0; gridCell < cellCount; gridCell++) {
    const point = points[cellPointIds[gridCell]];
    const x = Number(point?.[0]);
    const y = Number(point?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    centers.push({gridCell, x, y});
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!centers.length) return null;

  const bucketSize = estimateBucketSize(minX, minY, maxX, maxY, centers.length);
  const buckets = new Map();
  let minBucketX = Infinity;
  let minBucketY = Infinity;
  let maxBucketX = -Infinity;
  let maxBucketY = -Infinity;
  for (const cell of centers) {
    const bucketX = bucketCoordinate(cell.x, minX, bucketSize);
    const bucketY = bucketCoordinate(cell.y, minY, bucketSize);
    minBucketX = Math.min(minBucketX, bucketX);
    minBucketY = Math.min(minBucketY, bucketY);
    maxBucketX = Math.max(maxBucketX, bucketX);
    maxBucketY = Math.max(maxBucketY, bucketY);
    let column = buckets.get(bucketX);
    if (!column) {
      column = new Map();
      buckets.set(bucketX, column);
    }
    let bucket = column.get(bucketY);
    if (!bucket) {
      bucket = [];
      column.set(bucketY, bucket);
    }
    bucket.push(cell);
  }

  return {points, cellPointIds, cellCount, originX: minX, originY: minY, bucketSize, minBucketX, minBucketY, maxBucketX, maxBucketY, buckets};
}

function estimateBucketSize(minX, minY, maxX, maxY, cellCount) {
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const area = width * height;
  const nominalSpacing = area > 0
    ? Math.sqrt(area / cellCount)
    : Math.max(width, height) / Math.max(1, cellCount - 1);
  return Math.max(1e-6, Number.isFinite(nominalSpacing) && nominalSpacing > 0 ? nominalSpacing * 2 : 1);
}

function bucketCoordinate(value, origin, bucketSize) {
  return Math.floor((value - origin) / bucketSize);
}

function normalizePoint(point) {
  const x = Number(Array.isArray(point) ? point[0] : point?.x);
  const y = Number(Array.isArray(point) ? point[1] : point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
