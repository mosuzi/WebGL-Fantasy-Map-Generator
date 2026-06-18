import {applyHeightmap} from "./heightmap.js";

const CLIP_NEIGHBOR_RADIUS = 2;
const MIN_CELL_VERTICES = 3;
const POINT_MARGIN = 0.04;
const LOCAL_JITTER = 0.38;
const ROW_COLUMN_DRIFT = 0.14;
const WARP_STRENGTH = 0.2;

export function buildGrid(options, random, heightmap) {
  const startedAt = performance.now();
  const layout = createPointLayout(options);
  const points = generatePoints(layout, random, options);
  const {cells, vertices} = buildVoronoiCells(points, layout, options, heightmap);
  applyHeightmap(heightmap, {points, cells, vertices}, layout, random);
  fillSmallInlandBasins(cells, layout);
  const triangles = cells.v.reduce((sum, vertexIds) => sum + Math.max(0, vertexIds.length - 2), 0);

  return {
    points,
    cells,
    vertices,
    metadata: {
      actualCells: points.length,
      columns: layout.columns,
      rows: layout.rows,
      vertexCount: vertices.p.length,
      triangles,
      buildMs: roundMs(performance.now() - startedAt),
      method: "organic-stratified-halfplane-voronoi"
    }
  };
}

function createPointLayout(options) {
  const aspect = options.graphWidth / options.graphHeight;
  const columns = Math.max(1, Math.round(Math.sqrt(options.cellsTarget * aspect)));
  const rows = Math.max(1, Math.round(options.cellsTarget / columns));
  return {
    columns,
    rows,
    cellWidth: options.graphWidth / columns,
    cellHeight: options.graphHeight / rows
  };
}

function generatePoints(layout, random, options) {
  const points = [];
  const rowDrift = Array.from({length: layout.rows}, () => random.range(-ROW_COLUMN_DRIFT, ROW_COLUMN_DRIFT));
  const columnDrift = Array.from({length: layout.columns}, () => random.range(-ROW_COLUMN_DRIFT, ROW_COLUMN_DRIFT));
  const warp = createWarpField(layout, random);

  for (let row = 0; row < layout.rows; row++) {
    for (let column = 0; column < layout.columns; column++) {
      const centerX = (column + 0.5) * layout.cellWidth;
      const centerY = (row + 0.5) * layout.cellHeight;
      const warpVector = sampleWarp(warp, column, row, layout);
      const jitterX = (random.range(-LOCAL_JITTER, LOCAL_JITTER) + rowDrift[row] + warpVector.x * WARP_STRENGTH) * layout.cellWidth;
      const jitterY = (random.range(-LOCAL_JITTER, LOCAL_JITTER) + columnDrift[column] + warpVector.y * WARP_STRENGTH) * layout.cellHeight;
      const x = clamp(centerX + jitterX, (column + POINT_MARGIN) * layout.cellWidth, (column + 1 - POINT_MARGIN) * layout.cellWidth);
      const y = clamp(centerY + jitterY, (row + POINT_MARGIN) * layout.cellHeight, (row + 1 - POINT_MARGIN) * layout.cellHeight);
      points.push([round(x, 3), round(y, 3)]);
    }
  }
  return points;
}

function createWarpField(layout, random) {
  const columns = Math.max(3, Math.ceil(layout.columns / 12) + 2);
  const rows = Math.max(3, Math.ceil(layout.rows / 12) + 2);
  const vectors = [];

  for (let row = 0; row < rows; row++) {
    const line = [];
    for (let column = 0; column < columns; column++) {
      line.push({
        x: random.range(-1, 1),
        y: random.range(-1, 1)
      });
    }
    vectors.push(line);
  }

  return {columns, rows, vectors};
}

function sampleWarp(warp, column, row, layout) {
  const x = (column / Math.max(1, layout.columns - 1)) * (warp.columns - 1);
  const y = (row / Math.max(1, layout.rows - 1)) * (warp.rows - 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(warp.columns - 1, left + 1);
  const bottom = Math.min(warp.rows - 1, top + 1);
  const tx = smoothstep(x - left);
  const ty = smoothstep(y - top);
  const topVector = mixVector(warp.vectors[top][left], warp.vectors[top][right], tx);
  const bottomVector = mixVector(warp.vectors[bottom][left], warp.vectors[bottom][right], tx);
  return mixVector(topVector, bottomVector, ty);
}

function buildVoronoiCells(points, layout, options) {
  const cells = {
    v: [],
    p: [],
    h: []
  };
  const vertices = {
    p: []
  };
  const vertexIndex = new Map();

  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const polygon = clipCellPolygon(point, index, points, layout, options);
    if (polygon.length < MIN_CELL_VERTICES) {
      cells.v.push([]);
      cells.p.push(index);
      cells.h.push(0);
      continue;
    }
    const vertexIds = polygon.map(vertex => internVertex(vertex, vertices, vertexIndex));
    cells.v.push(vertexIds);
    cells.p.push(index);
    cells.h.push(0);
  }

  return {cells, vertices};
}

function fillSmallInlandBasins(cells, layout) {
  const visited = new Array(cells.h.length).fill(false);
  const maxBasinCells = Math.max(14, Math.round(cells.h.length * 0.0045));

  for (let cell = 0; cell < cells.h.length; cell++) {
    if (visited[cell] || cells.h[cell] >= 20) continue;
    const basin = collectWaterBasin(cell, cells, layout, visited);
    if (basin.touchesBorder || basin.cells.length > maxBasinCells) continue;
    const rim = basin.rimHeights.length ? average(basin.rimHeights) : 25;
    const fillHeight = Math.max(21, Math.min(32, Math.round(rim - 3)));
    for (const basinCell of basin.cells) cells.h[basinCell] = fillHeight + ((basinCell % 5) - 2);
  }
}

function collectWaterBasin(start, cells, layout, visited) {
  const queue = [start];
  const basinCells = [];
  const rimHeights = [];
  let touchesBorder = false;
  visited[start] = true;

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    basinCells.push(cell);
    if (isBorderCell(cell, layout)) touchesBorder = true;

    for (const neighbor of getDirectNeighbors(cell, layout)) {
      if (cells.h[neighbor] < 20) {
        if (visited[neighbor]) continue;
        visited[neighbor] = true;
        queue.push(neighbor);
      } else {
        rimHeights.push(cells.h[neighbor]);
      }
    }
  }

  return {cells: basinCells, rimHeights, touchesBorder};
}

function getDirectNeighbors(cell, layout) {
  const neighbors = [];
  const column = cell % layout.columns;
  const row = Math.floor(cell / layout.columns);
  if (column > 0) neighbors.push(cell - 1);
  if (column < layout.columns - 1) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - layout.columns);
  if (row < layout.rows - 1) neighbors.push(cell + layout.columns);
  return neighbors;
}

function isBorderCell(cell, layout) {
  const column = cell % layout.columns;
  const row = Math.floor(cell / layout.columns);
  return column === 0 || row === 0 || column === layout.columns - 1 || row === layout.rows - 1;
}

function clipCellPolygon(point, pointIndex, points, layout, options) {
  let polygon = [
    [0, 0],
    [options.graphWidth, 0],
    [options.graphWidth, options.graphHeight],
    [0, options.graphHeight]
  ];

  for (const neighborIndex of getNeighborIndices(pointIndex, layout)) {
    if (neighborIndex === pointIndex || neighborIndex < 0 || neighborIndex >= points.length) continue;
    polygon = clipByBisector(polygon, point, points[neighborIndex]);
    if (polygon.length < MIN_CELL_VERTICES) break;
  }

  return polygon.map(([x, y]) => [round(clamp(x, 0, options.graphWidth), 3), round(clamp(y, 0, options.graphHeight), 3)]);
}

function getNeighborIndices(pointIndex, layout) {
  const column = pointIndex % layout.columns;
  const row = Math.floor(pointIndex / layout.columns);
  const indices = [];
  for (let dy = -CLIP_NEIGHBOR_RADIUS; dy <= CLIP_NEIGHBOR_RADIUS; dy++) {
    for (let dx = -CLIP_NEIGHBOR_RADIUS; dx <= CLIP_NEIGHBOR_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= layout.columns || nextRow < 0 || nextRow >= layout.rows) continue;
      indices.push(nextRow * layout.columns + nextColumn);
    }
  }
  return indices;
}

function clipByBisector(polygon, point, neighbor) {
  const clipped = [];
  const [px, py] = point;
  const [nx, ny] = neighbor;
  const vx = nx - px;
  const vy = ny - py;
  const mx = (px + nx) / 2;
  const my = (py + ny) / 2;

  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = isInside(current, mx, my, vx, vy);
    const previousInside = isInside(previous, mx, my, vx, vy);

    if (currentInside !== previousInside) {
      clipped.push(intersectSegmentBisector(previous, current, mx, my, vx, vy));
    }
    if (currentInside) clipped.push(current);
  }

  return clipped;
}

function isInside(point, mx, my, vx, vy) {
  return (point[0] - mx) * vx + (point[1] - my) * vy <= 0.000001;
}

function intersectSegmentBisector(a, b, mx, my, vx, vy) {
  const ax = a[0] - mx;
  const ay = a[1] - my;
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const denominator = sx * vx + sy * vy;
  if (Math.abs(denominator) < 0.000001) return a;
  const t = -((ax * vx + ay * vy) / denominator);
  return [a[0] + sx * t, a[1] + sy * t];
}

function internVertex(vertex, vertices, vertexIndex) {
  const key = `${vertex[0]},${vertex[1]}`;
  const existing = vertexIndex.get(key);
  if (existing !== undefined) return existing;
  const id = vertices.p.length;
  vertices.p.push(vertex);
  vertexIndex.set(key, id);
  return id;
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function mixVector(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
