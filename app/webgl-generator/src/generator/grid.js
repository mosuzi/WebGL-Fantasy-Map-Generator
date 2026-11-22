import Delaunator from "../vendor/delaunator.js";
import {applyHeightmap} from "./heightmap.js";
import {createStageProfile} from "./profile.js";

export function buildGrid(options, random, heightmap, heightRandom = random) {
  const startedAt = performance.now();
  const profile = createStageProfile();
  const layout = profile.stage("layout", "计算点阵布局", () => createPointLayout(options));
  const boundary = profile.stage("boundary-points", "生成边界点", () => createGridBoundaryPoints(options.graphWidth, options.graphHeight, layout.spacing));
  const points = profile.stage("jittered-grid", "生成扰动点阵", () => getJitteredGrid(options.graphWidth, options.graphHeight, layout.spacing, random));
  const {cells, vertices} = profile.stage("voronoi", "构建 Delaunay / Voronoi", () => calculateVoronoi(points, boundary));
  profile.stage("cell-fields", "初始化 cell 字段", () => {
    cells.p = Array.from(cells.i);
    cells.h = new Array(points.length).fill(0);
  });

  const grid = {points, boundary, cells, vertices};
  profile.stage("heightmap", "应用高度模板", () => applyHeightmap(heightmap, grid, layout, heightRandom));

  const {triangles, neighborDegrees} = profile.stage("metrics", "统计 grid 指标", () => ({
    triangles: cells.v.reduce((sum, vertexIds) => sum + Math.max(0, vertexIds.length - 2), 0),
    neighborDegrees: cells.c.map(neighbors => neighbors.length)
  }));
  const maxNeighborDegree = maxValue(neighborDegrees);
  const timing = profile.finish();

  return {
    points,
    boundary,
    cells,
    vertices,
    metadata: {
      actualCells: points.length,
      cellsDesired: options.cellsTarget,
      spacing: layout.spacing,
      columns: layout.columns,
      rows: layout.rows,
      graphWidth: options.graphWidth,
      graphHeight: options.graphHeight,
      boundaryPoints: boundary.length,
      vertexCount: vertices.p.length,
      triangles,
      neighborMode: "source-delaunator-halfedge",
      averageNeighborDegree: round(average(neighborDegrees), 2),
      maxNeighborDegree,
      borderCells: cells.b.reduce((sum, value) => sum + (value ? 1 : 0), 0),
      buildMs: roundMs(performance.now() - startedAt),
      timing,
      method: "source-jittered-grid-delaunator-voronoi"
    }
  };
}

function createPointLayout(options) {
  const spacing = round(Math.sqrt((options.graphWidth * options.graphHeight) / options.cellsTarget), 2);
  const columns = Math.floor((options.graphWidth + 0.5 * spacing - 1e-10) / spacing);
  const rows = Math.floor((options.graphHeight + 0.5 * spacing - 1e-10) / spacing);
  return {spacing, columns, rows};
}

export function createGridBoundaryPoints(width, height, spacing) {
  const offset = round(-1 * spacing);
  const boundarySpacing = spacing * 2;
  const boundedWidth = width - offset * 2;
  const boundedHeight = height - offset * 2;
  const numberX = Math.ceil(boundedWidth / boundarySpacing) - 1;
  const numberY = Math.ceil(boundedHeight / boundarySpacing) - 1;
  const points = [];

  for (let i = 0.5; i < numberX; i++) {
    const x = Math.ceil((boundedWidth * i) / numberX + offset);
    points.push([x, offset], [x, boundedHeight + offset]);
  }

  for (let i = 0.5; i < numberY; i++) {
    const y = Math.ceil((boundedHeight * i) / numberY + offset);
    points.push([offset, y], [boundedWidth + offset, y]);
  }

  return points;
}

function getJitteredGrid(width, height, spacing, random) {
  const radius = spacing / 2;
  const jittering = radius * 0.9;
  const doubleJittering = jittering * 2;
  const points = [];

  for (let y = radius; y < height; y += spacing) {
    for (let x = radius; x < width; x += spacing) {
      const xj = Math.min(round(x + random.next() * doubleJittering - jittering, 2), width);
      const yj = Math.min(round(y + random.next() * doubleJittering - jittering, 2), height);
      points.push([xj, yj]);
    }
  }

  return points;
}

export function calculateVoronoi(points, boundary) {
  const allPoints = points.concat(boundary);
  const delaunay = Delaunator.from(allPoints);
  const voronoi = createVoronoi(delaunay, allPoints, points.length);
  const cells = voronoi.cells;
  cells.i = Uint32Array.from({length: points.length}, (_, index) => index);
  fillMissingCells(cells, points.length);
  return {cells, vertices: voronoi.vertices};
}

function createVoronoi(delaunay, points, pointsN) {
  const cells = {v: new Array(pointsN), c: new Array(pointsN), b: new Array(pointsN), i: new Uint32Array()};
  const triangleCount = delaunay.triangles.length / 3;
  const vertices = {p: new Array(triangleCount), v: new Array(triangleCount), c: new Array(triangleCount)};

  for (let edge = 0; edge < delaunay.triangles.length; edge++) {
    const point = delaunay.triangles[nextHalfedge(edge)];
    if (point < pointsN && !cells.c[point]) {
      const faces = [], neighbors = [];
      let incoming = edge;
      do {
        faces.push(triangleOfEdge(incoming));
        const neighbor = delaunay.triangles[incoming];
        if (neighbor < pointsN) neighbors.push(neighbor);
        incoming = delaunay.halfedges[nextHalfedge(incoming)];
      } while (incoming !== -1 && incoming !== edge && faces.length < 20);
      cells.v[point] = faces;
      cells.c[point] = neighbors;
      cells.b[point] = faces.length > neighbors.length ? 1 : 0;
    }

    if (edge % 3 === 0) {
      const triangle = edge / 3;
      const a = delaunay.triangles[edge];
      const b = delaunay.triangles[edge + 1];
      const c = delaunay.triangles[edge + 2];
      vertices.c[triangle] = [a, b, c];
      vertices.p[triangle] = circumcenter(points[a], points[b], points[c]);
      vertices.v[triangle] = [triangleOfEdge(delaunay.halfedges[edge]), triangleOfEdge(delaunay.halfedges[edge + 1]), triangleOfEdge(delaunay.halfedges[edge + 2])];
    }
  }

  return {cells, vertices};
}

function fillMissingCells(cells, pointsN) {
  for (let cell = 0; cell < pointsN; cell++) {
    if (!cells.v[cell]) cells.v[cell] = [];
    if (!cells.c[cell]) cells.c[cell] = [];
    if (!cells.b[cell]) cells.b[cell] = 0;
  }
}

function triangleOfEdge(edge) {
  return Math.floor(edge / 3);
}

function nextHalfedge(edge) {
  return edge % 3 === 2 ? edge - 2 : edge + 1;
}

function circumcenter(a, b, c) {
  const [ax, ay] = a;
  const bx = b[0] - ax, by = b[1] - ay;
  const cx = c[0] - ax, cy = c[1] - ay;
  const bSquared = bx * bx + by * by;
  const cSquared = cx * cx + cy * cy;
  const divisor = 2 * (bx * cy - by * cx);
  // Keep shared corners on the bisectors. Snapping them can fold short edges into a cell.
  return [
    ax + (cy * bSquared - by * cSquared) / divisor,
    ay + (bx * cSquared - cx * bSquared) / divisor
  ];
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxValue(values) {
  let max = -Infinity;
  for (const value of values) if (value > max) max = value;
  return max === -Infinity ? 0 : max;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
