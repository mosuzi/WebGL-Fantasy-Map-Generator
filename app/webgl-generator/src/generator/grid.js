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
  const cells = {v: [], c: [], b: [], i: new Uint32Array()};
  const vertices = {p: [], v: [], c: []};

  for (let edge = 0; edge < delaunay.triangles.length; edge++) {
    const point = delaunay.triangles[nextHalfedge(edge)];
    if (point < pointsN && !cells.c[point]) {
      const edges = edgesAroundPoint(delaunay, edge);
      cells.v[point] = edges.map(item => triangleOfEdge(item));
      cells.c[point] = edges.map(item => delaunay.triangles[item]).filter(cell => cell < pointsN);
      cells.b[point] = edges.length > cells.c[point].length ? 1 : 0;
    }

    const triangle = triangleOfEdge(edge);
    if (!vertices.p[triangle]) {
      vertices.p[triangle] = triangleCenter(delaunay, points, triangle);
      vertices.v[triangle] = trianglesAdjacentToTriangle(delaunay, triangle);
      vertices.c[triangle] = pointsOfTriangle(delaunay, triangle);
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

function edgesAroundPoint(delaunay, start) {
  const result = [];
  let incoming = start;
  do {
    result.push(incoming);
    const outgoing = nextHalfedge(incoming);
    incoming = delaunay.halfedges[outgoing];
  } while (incoming !== -1 && incoming !== start && result.length < 20);
  return result;
}

function triangleCenter(delaunay, points, triangleIndex) {
  const [a, b, c] = pointsOfTriangle(delaunay, triangleIndex).map(point => points[point]);
  return circumcenter(a, b, c);
}

function pointsOfTriangle(delaunay, triangleIndex) {
  return edgesOfTriangle(triangleIndex).map(edge => delaunay.triangles[edge]);
}

function trianglesAdjacentToTriangle(delaunay, triangleIndex) {
  return edgesOfTriangle(triangleIndex).map(edge => triangleOfEdge(delaunay.halfedges[edge]));
}

function edgesOfTriangle(triangleIndex) {
  return [3 * triangleIndex, 3 * triangleIndex + 1, 3 * triangleIndex + 2];
}

function triangleOfEdge(edge) {
  return Math.floor(edge / 3);
}

function nextHalfedge(edge) {
  return edge % 3 === 2 ? edge - 2 : edge + 1;
}

function circumcenter(a, b, c) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const [cx, cy] = c;
  const ad = ax * ax + ay * ay;
  const bd = bx * bx + by * by;
  const cd = cx * cx + cy * cy;
  const divisor = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  return [
    Math.floor((ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)) / divisor),
    Math.floor((ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax)) / divisor)
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
