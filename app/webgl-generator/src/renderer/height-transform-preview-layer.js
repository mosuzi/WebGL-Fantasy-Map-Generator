import {pushWorldVertex} from "./mesh-writer.js";
import {createRenderContext} from "./render-context.js";

export function buildHeightTransformPreviewMesh(map, changes) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const verticesById = map?.grid?.vertices?.p;
  if (!cells?.p || !Array.isArray(cells.v) || !Array.isArray(points) || !Array.isArray(verticesById)) {
    return {vertices: new Float32Array(), stats: emptyHeightTransformPreviewStats()};
  }

  const context = createRenderContext(map);
  const vertices = [];
  const visited = new Set();
  let cellsCount = 0;
  let raisedCells = 0;
  let loweredCells = 0;
  let skippedCells = 0;
  for (const change of changes || []) {
    const gridCell = Number(change?.gridCell);
    const before = Number(change?.before);
    const after = Number(change?.after);
    if (!Number.isInteger(gridCell) || visited.has(gridCell) || !Number.isFinite(before) || !Number.isFinite(after) || before === after) {
      skippedCells += 1;
      continue;
    }
    visited.add(gridCell);
    const center = points[cells.p[gridCell]];
    const vertexIds = cells.v[gridCell];
    if (!center || !Array.isArray(vertexIds) || vertexIds.length < 3) {
      skippedCells += 1;
      continue;
    }
    const color = heightTransformPreviewColor(after - before);
    const beforeLength = vertices.length;
    for (let index = 0; index < vertexIds.length; index++) {
      const a = verticesById[vertexIds[index]];
      const b = verticesById[vertexIds[(index + 1) % vertexIds.length]];
      if (!a || !b) continue;
      pushWorldVertex(vertices, context, center, color);
      pushWorldVertex(vertices, context, a, color);
      pushWorldVertex(vertices, context, b, color);
    }
    if (vertices.length === beforeLength) {
      skippedCells += 1;
      continue;
    }
    cellsCount += 1;
    if (after > before) raisedCells += 1;
    else loweredCells += 1;
  }

  const typedVertices = new Float32Array(vertices);
  return {
    vertices: typedVertices,
    stats: {
      cells: cellsCount,
      raisedCells,
      loweredCells,
      skippedCells,
      vertexCount: typedVertices.length / 6,
      triangleCount: typedVertices.length / 18
    }
  };
}

export function heightTransformPreviewColor(delta) {
  const strength = Math.min(0.28, Math.abs(Number(delta) || 0) / 20 * 0.28);
  const alpha = 0.3 + strength;
  return delta > 0 ? [1, 0.28, 0.08, alpha] : [0.08, 0.62, 1, alpha];
}

export function emptyHeightTransformPreviewStats() {
  return {cells: 0, raisedCells: 0, loweredCells: 0, skippedCells: 0, vertexCount: 0, triangleCount: 0};
}
