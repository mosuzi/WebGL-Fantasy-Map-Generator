import {calculateVoronoi, createGridBoundaryPoints} from "./grid.js";

export const GRID_STRUCTURE_SCHEMA = "webgl-grid-structure@1";
export const GRID_REFINEMENT_VERSION = 1;
const WATER_LEVEL = 20;
const MAX_GRID_CELLS = 200_000;

export function createGridStructureSnapshot(grid, binding = {}) {
  assertGrid(grid);
  return {
    schema: GRID_STRUCTURE_SCHEMA,
    binding: {
      mapIdentity: binding.mapIdentity ?? null,
      mapRevision: Number(binding.mapRevision) || 0,
      sourceFingerprint: fingerprintGridStructure(grid)
    },
    metadata: {
      graphWidth: Number(grid.metadata?.graphWidth) || inferExtent(grid.points, 0),
      graphHeight: Number(grid.metadata?.graphHeight) || inferExtent(grid.points, 1),
      cellCount: grid.points.length,
      vertexCount: grid.vertices?.p?.length || 0
    },
    points: grid.points.map(clonePoint),
    boundary: (grid.boundary || []).map(clonePoint),
    cells: {
      i: Array.from(grid.cells.i || [], Number),
      c: grid.cells.c.map(list => Array.from(list || [], Number)),
      v: grid.cells.v.map(list => Array.from(list || [], Number)),
      b: Array.from(grid.cells.b || [], Number),
      p: Array.from(grid.cells.p || [], Number),
      h: Array.from(grid.cells.h || [], Number)
    },
    vertices: {
      p: (grid.vertices?.p || []).map(clonePoint),
      v: (grid.vertices?.v || []).map(list => Array.from(list || [], Number)),
      c: (grid.vertices?.c || []).map(list => Array.from(list || [], Number))
    }
  };
}

export function summarizeGridStructure(grid) {
  assertGrid(grid);
  const heights = Array.from(grid.cells.h || [], Number);
  const degrees = grid.cells.c.map(list => list?.length || 0);
  return {
    schema: GRID_STRUCTURE_SCHEMA,
    fingerprint: fingerprintGridStructure(grid),
    cells: grid.points.length,
    vertices: grid.vertices?.p?.length || 0,
    boundaryPoints: grid.boundary?.length || 0,
    landCells: heights.filter(value => value >= WATER_LEVEL).length,
    waterCells: heights.filter(value => value < WATER_LEVEL).length,
    height: numericSummary(heights),
    neighborDegree: numericSummary(degrees),
    refinement: grid.refinement ? {
      version: grid.refinement.version,
      sourceCells: grid.refinement.sourceCells,
      targetCells: grid.refinement.targetCells,
      sourceFingerprint: grid.refinement.sourceFingerprint
    } : null
  };
}

export function validateGridStructureDocument(document, binding = null) {
  const errors = [];
  if (!document || typeof document !== "object") return invalid("网格文档必须是对象");
  if (document.schema !== GRID_STRUCTURE_SCHEMA) errors.push(`schema 必须是 ${GRID_STRUCTURE_SCHEMA}`);
  const points = document.points;
  const cells = document.cells;
  const vertices = document.vertices;
  if (!Array.isArray(points) || points.length < 3 || points.length > MAX_GRID_CELLS) errors.push(`points 长度必须在 3～${MAX_GRID_CELLS} 之间`);
  if (!cells || typeof cells !== "object") errors.push("缺少 cells");
  if (!vertices || typeof vertices !== "object") errors.push("缺少 vertices");
  if (errors.length) return {valid: false, errors};

  const count = points.length;
  for (const key of ["i", "c", "v", "b", "p", "h"]) {
    if (!Array.isArray(cells[key]) || cells[key].length !== count) errors.push(`cells.${key} 长度必须等于 points 长度`);
  }
  if (!Array.isArray(vertices.p) || !Array.isArray(vertices.v) || !Array.isArray(vertices.c)) errors.push("vertices.p / v / c 必须是数组");
  if (!Array.isArray(document.boundary) || !document.boundary.every(validPoint)) errors.push("boundary 必须是有限二维坐标数组");
  if (Array.isArray(vertices.p) && (vertices.v.length !== vertices.p.length || vertices.c.length !== vertices.p.length)) errors.push("vertices.p / v / c 长度必须一致");
  if (errors.length) return {valid: false, errors};

  for (let cell = 0; cell < count; cell++) {
    if (!validPoint(points[cell])) errors.push(`points[${cell}] 必须是有限二维坐标`);
    if (cells.i[cell] !== cell) errors.push(`cells.i[${cell}] 必须等于 ${cell}`);
    if (cells.p[cell] !== cell) errors.push(`cells.p[${cell}] 必须等于 ${cell}`);
    if (![0, 1].includes(Number(cells.b[cell]))) errors.push(`cells.b[${cell}] 必须是 0 或 1`);
    if (!Number.isFinite(cells.h[cell]) || cells.h[cell] < 0 || cells.h[cell] > 100) errors.push(`cells.h[${cell}] 必须在 0～100`);
    const neighbors = cells.c[cell];
    const polygon = cells.v[cell];
    if (!Array.isArray(neighbors) || new Set(neighbors).size !== neighbors.length) errors.push(`cells.c[${cell}] 必须是无重复数组`);
    if (!Array.isArray(polygon) || polygon.length < 3) errors.push(`cells.v[${cell}] 至少需要 3 个顶点`);
    for (const neighbor of neighbors || []) {
      if (!Number.isInteger(neighbor) || neighbor < 0 || neighbor >= count || neighbor === cell) errors.push(`cells.c[${cell}] 包含非法索引 ${neighbor}`);
      else if (!cells.c[neighbor]?.includes(cell)) errors.push(`cells.c 邻接不对称：${cell} -> ${neighbor}`);
    }
    for (const vertex of polygon || []) {
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertices.p.length) errors.push(`cells.v[${cell}] 包含非法顶点 ${vertex}`);
    }
    if (errors.length >= 50) break;
  }
  for (let vertex = 0; vertex < vertices.p.length && errors.length < 50; vertex++) {
    if (!validPoint(vertices.p[vertex])) errors.push(`vertices.p[${vertex}] 必须是有限二维坐标`);
    if (!Array.isArray(vertices.v[vertex]) || !Array.isArray(vertices.c[vertex])) errors.push(`vertices.v / c[${vertex}] 必须是数组`);
  }
  if (binding) {
    if (document.binding?.mapIdentity !== binding.mapIdentity) errors.push("地图身份已变化");
    if (Number(document.binding?.mapRevision) !== Number(binding.mapRevision)) errors.push("地图 revision 已变化");
    if (binding.sourceFingerprint && document.binding?.sourceFingerprint !== binding.sourceFingerprint) errors.push("来源网格指纹不一致");
  }
  return {valid: errors.length === 0, errors, summary: errors.length ? null : documentSummary(document)};
}

export function gridFromStructureDocument(document, previousGrid = null) {
  const validation = validateGridStructureDocument(document);
  if (!validation.valid) throw new Error(`网格文档校验失败：${validation.errors.slice(0, 3).join("；")}`);
  const count = document.points.length;
  const grid = previousGrid ? {...previousGrid} : {};
  grid.points = document.points.map(clonePoint);
  grid.boundary = (document.boundary || []).map(clonePoint);
  grid.cells = previousGrid?.cells ? {...previousGrid.cells} : {};
  grid.cells.i = Uint32Array.from(document.cells.i);
  grid.cells.c = document.cells.c.map(list => [...list]);
  grid.cells.v = document.cells.v.map(list => [...list]);
  grid.cells.b = Uint8Array.from(document.cells.b);
  grid.cells.p = Array.from({length: count}, (_, index) => index);
  grid.cells.h = Array.from(document.cells.h, Number);
  grid.vertices = {
    p: document.vertices.p.map(clonePoint),
    v: document.vertices.v.map(list => [...list]),
    c: document.vertices.c.map(list => [...list])
  };
  grid.metadata = {
    ...(previousGrid?.metadata || {}),
    ...(document.metadata || {}),
    actualCells: count,
    vertexCount: grid.vertices.p.length,
    method: "controlled-grid-structure-write"
  };
  return grid;
}

export function refineGridTopology(sourceGrid, targetCells, taskContext = null) {
  assertGrid(sourceGrid);
  checkpointRefinement(taskContext, "start", {sourceCells: sourceGrid.points.length, targetCells});
  const startedAt = performance.now();
  const sourceCells = sourceGrid.points.length;
  const target = normalizeTargetCells(targetCells, sourceCells);
  const graphWidth = Number(sourceGrid.metadata?.graphWidth) || inferExtent(sourceGrid.points, 0);
  const graphHeight = Number(sourceGrid.metadata?.graphHeight) || inferExtent(sourceGrid.points, 1);
  const points = sourceGrid.points.map(clonePoint);
  const mothers = Array.from({length: sourceCells}, (_, index) => index);
  const childCounts = allocateChildren(sourceCells, target);
  const children = Array.from({length: sourceCells}, (_, index) => [index]);

  for (let mother = 0; mother < sourceCells; mother++) {
    if (mother % 256 === 0) checkpointRefinement(taskContext, "sample-points", {completed: mother, total: sourceCells}, false);
    const polygon = cellPolygon(sourceGrid, mother);
    for (let ordinal = 1; ordinal < childCounts[mother]; ordinal++) {
      const point = sampleCellPoint(sourceGrid.points[mother], polygon, mother, ordinal, graphWidth, graphHeight);
      const child = points.length;
      points.push(point);
      mothers.push(mother);
      children[mother].push(child);
    }
  }

  const spacing = Math.sqrt((graphWidth * graphHeight) / target);
  const boundary = createGridBoundaryPoints(graphWidth, graphHeight, spacing);
  checkpointRefinement(taskContext, "voronoi", {points: points.length, boundaryPoints: boundary.length});
  const {cells, vertices} = calculateVoronoi(points, boundary);
  checkpointRefinement(taskContext, "voronoi-complete", {cells: cells.i.length, vertices: vertices.p.length});
  const removedCrossMotherEdges = constrainNeighborGraph(cells.c, sourceGrid.cells.c, mothers);
  const restoredSourceAdjacencyEdges = ensureSourceAdjacency(cells.c, sourceGrid.cells.c, children);
  cells.p = Array.from(cells.i);
  cells.h = projectHeightField(sourceGrid, points, mothers);
  projectGridFields(sourceGrid, cells, mothers, children);
  checkpointRefinement(taskContext, "projection-complete", {cells: cells.i.length});
  const topology = validateRefinedMotherAdjacency(sourceGrid.cells.c, cells.c, mothers);
  if (!topology.valid) throw codedError("refinement-topology-violation", `细分产生 ${topology.violations.length} 条跨母邻接`, topology);

  const sourceFingerprint = fingerprintGridStructure(sourceGrid);
  const grid = {
    ...sourceGrid,
    points,
    boundary,
    cells,
    vertices,
    metadata: {
      ...(sourceGrid.metadata || {}),
      actualCells: target,
      cellsDesired: target,
      spacing: round(spacing, 4),
      vertexCount: vertices.p.length,
      triangles: cells.v.reduce((sum, vertexIds) => sum + Math.max(0, vertexIds.length - 2), 0),
      averageNeighborDegree: round(average(cells.c.map(list => list.length)), 2),
      maxNeighborDegree: cells.c.reduce((max, list) => Math.max(max, list.length), 0),
      borderCells: cells.b.reduce((sum, value) => sum + (value ? 1 : 0), 0),
      method: "topology-preserving-cell-refinement"
    },
    refinement: {
      version: GRID_REFINEMENT_VERSION,
      sourceCells,
      targetCells: target,
      sourceFingerprint,
      mother: Uint32Array.from(mothers),
      children: children.map(list => Uint32Array.from(list)),
      completedAt: new Date().toISOString()
    }
  };
  const validation = validateGridStructureDocument(createGridStructureSnapshot(grid));
  if (!validation.valid) throw codedError("refinement-invalid-structure", `细分结构无效：${validation.errors.slice(0, 3).join("；")}`, validation);
  checkpointRefinement(taskContext, "complete", {cells: grid.points.length, vertices: grid.vertices.p.length});
  return {
    grid,
    report: {
      sourceCells,
      targetCells: target,
      addedCells: target - sourceCells,
      sourceFingerprint,
      targetFingerprint: fingerprintGridStructure(grid),
      motherAdjacencyViolations: topology.violations.length,
      removedCrossMotherEdges,
      restoredSourceAdjacencyEdges,
      preservedOldPoints: sourceCells,
      preservedOldHeights: countPreservedHeights(sourceGrid, grid),
      landSignViolations: countLandSignViolations(sourceGrid, grid, mothers),
      buildMs: round(performance.now() - startedAt, 2)
    }
  };
}

function checkpointRefinement(context, stage, detail = {}, report = true) {
  if (!context) return;
  if (context.signal?.aborted) throw refinementAbortError(context.signal.reason, stage);
  context.checkpoint?.({phase: "grid-refinement", stage, ...detail});
  if (context.signal?.aborted) throw refinementAbortError(context.signal.reason, stage);
  if (report) context.report?.("grid-refinement", {stage, ...detail});
}

function refinementAbortError(reason, stage) {
  const error = codedError("grid-preparation-aborted", String(reason || `网格细分已在 ${stage} 阶段取消`), {stage});
  error.name = "AbortError";
  return error;
}

export function validateRefinedMotherAdjacency(sourceNeighbors, refinedNeighbors, mothers) {
  const sourceSets = sourceNeighbors.map(list => new Set(list || []));
  const violations = [];
  for (let cell = 0; cell < refinedNeighbors.length; cell++) {
    const mother = mothers[cell];
    for (const neighbor of refinedNeighbors[cell] || []) {
      if (neighbor < cell) continue;
      const otherMother = mothers[neighbor];
      if (mother === otherMother || sourceSets[mother]?.has(otherMother)) continue;
      violations.push({cell, neighbor, mother, otherMother});
      if (violations.length >= 100) return {valid: false, violations, truncated: true};
    }
  }
  return {valid: violations.length === 0, violations, truncated: false};
}

function constrainNeighborGraph(refinedNeighbors, sourceNeighbors, mothers) {
  const sourceSets = sourceNeighbors.map(list => new Set(list || []));
  const allowed = refinedNeighbors.map(() => new Set());
  let removed = 0;
  for (let cell = 0; cell < refinedNeighbors.length; cell++) {
    const mother = mothers[cell];
    for (const neighbor of refinedNeighbors[cell] || []) {
      if (neighbor === cell || neighbor < 0 || neighbor >= refinedNeighbors.length) continue;
      const otherMother = mothers[neighbor];
      if (mother === otherMother || sourceSets[mother]?.has(otherMother) || sourceSets[otherMother]?.has(mother)) {
        allowed[cell].add(neighbor);
        allowed[neighbor].add(cell);
      } else if (cell < neighbor) {
        removed++;
      }
    }
  }
  for (let cell = 0; cell < refinedNeighbors.length; cell++) refinedNeighbors[cell] = [...allowed[cell]].sort((a, b) => a - b);
  return removed;
}

function ensureSourceAdjacency(refinedNeighbors, sourceNeighbors, children) {
  let restored = 0;
  for (let mother = 0; mother < sourceNeighbors.length; mother++) {
    for (const otherMother of sourceNeighbors[mother] || []) {
      if (otherMother <= mother) continue;
      const otherChildren = new Set(children[otherMother] || []);
      const connected = (children[mother] || []).some(cell => (refinedNeighbors[cell] || []).some(neighbor => otherChildren.has(neighbor)));
      if (connected) continue;
      refinedNeighbors[mother].push(otherMother);
      refinedNeighbors[otherMother].push(mother);
      refinedNeighbors[mother].sort((a, b) => a - b);
      refinedNeighbors[otherMother].sort((a, b) => a - b);
      restored++;
    }
  }
  return restored;
}

export function fingerprintGridStructure(grid) {
  assertGrid(grid);
  let hash = 0x811c9dc5;
  const feed = value => {
    const text = String(value);
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  feed(grid.points.length);
  feed(grid.vertices?.p?.length || 0);
  for (let cell = 0; cell < grid.points.length; cell++) {
    const point = grid.points[cell];
    feed(`${round(point?.[0] || 0, 4)},${round(point?.[1] || 0, 4)}:${Number(grid.cells.h?.[cell])}:${(grid.cells.c?.[cell] || []).join(",")}|`);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function allocateChildren(sourceCells, targetCells) {
  const base = Math.floor(targetCells / sourceCells);
  const remainder = targetCells % sourceCells;
  return Array.from({length: sourceCells}, (_, cell) => base + (cell < remainder ? 1 : 0));
}

function cellPolygon(grid, cell) {
  const polygon = (grid.cells.v[cell] || []).map(vertex => grid.vertices.p[vertex]).filter(validPoint);
  if (polygon.length < 3) throw codedError("invalid-source-cell", `母 cell ${cell} 缺少闭合多边形`);
  return polygon;
}

function sampleCellPoint(center, polygon, mother, ordinal, graphWidth, graphHeight) {
  const areas = [];
  let total = 0;
  for (let index = 0; index < polygon.length; index++) {
    const area = triangleArea(center, polygon[index], polygon[(index + 1) % polygon.length]);
    total += area;
    areas.push(total);
  }
  if (!(total > 0)) throw codedError("invalid-source-cell", `母 cell ${mother} 面积无效`);
  const sequence = mother * 32 + ordinal;
  const target = halton(sequence, 2) * total;
  let triangle = areas.findIndex(value => value >= target);
  if (triangle < 0) triangle = areas.length - 1;
  const a = polygon[triangle];
  const b = polygon[(triangle + 1) % polygon.length];
  const root = Math.sqrt(0.06 + halton(sequence, 3) * 0.42);
  const edge = 0.1 + halton(sequence, 5) * 0.8;
  const x = center[0] * (1 - root) + a[0] * root * (1 - edge) + b[0] * root * edge;
  const y = center[1] * (1 - root) + a[1] * root * (1 - edge) + b[1] * root * edge;
  return [Math.max(0.001, Math.min(graphWidth - 0.001, x)), Math.max(0.001, Math.min(graphHeight - 0.001, y))];
}

function projectHeightField(sourceGrid, points, mothers) {
  const result = new Array(points.length);
  const sourceCount = sourceGrid.points.length;
  for (let cell = 0; cell < points.length; cell++) {
    const mother = mothers[cell];
    if (cell < sourceCount) {
      result[cell] = Number(sourceGrid.cells.h[cell]);
      continue;
    }
    const candidates = [mother, ...(sourceGrid.cells.c[mother] || [])];
    let weighted = 0;
    let weights = 0;
    for (const candidate of candidates) {
      const distance2 = squaredDistance(points[cell], sourceGrid.points[candidate]);
      const weight = 1 / Math.max(distance2, 1e-6);
      weighted += Number(sourceGrid.cells.h[candidate]) * weight;
      weights += weight;
    }
    let value = weighted / weights;
    const land = sourceGrid.cells.h[mother] >= WATER_LEVEL;
    if (land && value < WATER_LEVEL) value = WATER_LEVEL;
    if (!land && value >= WATER_LEVEL) value = WATER_LEVEL - 1;
    value = round(Math.max(0, Math.min(100, value)), 2);
    if (land && value < WATER_LEVEL) value = WATER_LEVEL;
    if (!land && value >= WATER_LEVEL) value = WATER_LEVEL - 1;
    result[cell] = value;
  }
  return result;
}

function projectGridFields(sourceGrid, targetCells, mothers, children) {
  const reserved = new Set(["i", "c", "v", "p", "h", "b", "pack", "t", "f"]);
  const sourceCount = sourceGrid.points.length;
  for (const [key, values] of Object.entries(sourceGrid.cells || {})) {
    if (reserved.has(key) || !isCellField(values, sourceCount)) continue;
    const additive = key === "pop";
    const projected = new Array(mothers.length);
    for (let cell = 0; cell < mothers.length; cell++) {
      const mother = mothers[cell];
      const value = values[mother];
      if (key === "burg" && cell >= sourceCount) projected[cell] = -1;
      else if (additive && Number.isFinite(Number(value))) projected[cell] = Number(value) / children[mother].length;
      else projected[cell] = cloneValue(value);
    }
    targetCells[key] = projected;
  }
}

function normalizeTargetCells(value, sourceCells) {
  const target = Number(value);
  if (!Number.isInteger(target) || target <= sourceCells) throw codedError("invalid-target", `目标 cell 数必须是大于 ${sourceCells} 的整数`);
  if (target > MAX_GRID_CELLS) throw codedError("invalid-target", `目标 cell 数不得超过 ${MAX_GRID_CELLS}`);
  return target;
}

function documentSummary(document) {
  return {
    cells: document.points.length,
    vertices: document.vertices.p.length,
    landCells: document.cells.h.filter(value => value >= WATER_LEVEL).length,
    waterCells: document.cells.h.filter(value => value < WATER_LEVEL).length
  };
}

function invalid(message) {
  return {valid: false, errors: [message], summary: null};
}

function assertGrid(grid) {
  if (!grid?.points || !grid?.cells?.c || !grid?.cells?.v || !grid?.cells?.h || !grid?.vertices?.p) throw new Error("当前地图缺少完整 Grid 拓扑");
}

function isCellField(value, count) {
  return value && typeof value.length === "number" && value.length === count && typeof value !== "string";
}

function clonePoint(point) {
  return [Number(point?.[0]) || 0, Number(point?.[1]) || 0];
}

function validPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
}

function cloneValue(value) {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

function inferExtent(points, axis) {
  return Math.max(1, ...points.map(point => Number(point?.[axis]) || 0));
}

function numericSummary(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const pick = quantile => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * quantile)))] ?? 0;
  return {min: sorted[0] ?? 0, p25: pick(0.25), median: pick(0.5), p75: pick(0.75), max: sorted.at(-1) ?? 0, mean: round(average(sorted), 3)};
}

function countPreservedHeights(source, target) {
  let count = 0;
  for (let cell = 0; cell < source.points.length; cell++) if (Number(source.cells.h[cell]) === Number(target.cells.h[cell])) count++;
  return count;
}

function countLandSignViolations(source, target, mothers) {
  let count = 0;
  for (let cell = 0; cell < mothers.length; cell++) {
    if ((source.cells.h[mothers[cell]] >= WATER_LEVEL) !== (target.cells.h[cell] >= WATER_LEVEL)) count++;
  }
  return count;
}

function triangleArea(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}

function squaredDistance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function halton(index, base) {
  let fraction = 1;
  let result = 0;
  for (let value = index; value > 0; value = Math.floor(value / base)) {
    fraction /= base;
    result += fraction * (value % base);
  }
  return result;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function codedError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}
