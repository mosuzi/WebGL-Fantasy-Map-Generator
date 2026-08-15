import {colorForCell, isLandCell} from "./color-modes.js";
import {resolvedGridVertexPoints} from "./grid-vertex-geometry.js";
import {pushWorldVertex} from "./mesh-writer.js";
import {triangulateCellVisualBoundarySafely} from "./cell-visual-layer.js";

export function pushGridCells(vertices, context, colorMode, viewOptions, shouldDrawCell = () => true, transformColor = color => color, onCellRange = null) {
  const {map} = context;
  const grid = map.grid;
  const vertexPoints = resolvedGridVertexPoints(grid);
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
    if (!shouldDrawCell(cellIndex)) continue;
    const vertexIds = grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const start = vertices.length;
    const color = transformColor(colorForCell(cellIndex, map, colorMode, viewOptions), cellIndex);
    const points = vertexIds.map(vertex => vertexPoints[vertex]);
    let triangulation = triangulateCellVisualBoundarySafely(points);
    if (triangulation.status !== "ok") {
      triangulation = triangulateCellVisualBoundarySafely(vertexIds.map(vertex => grid.vertices.p[vertex]));
    }
    if (triangulation.status === "ok") {
      for (const index of triangulation.indices) pushWorldVertex(vertices, context, triangulation.points[index], color);
    }
    onCellRange?.(cellIndex, {start, end: vertices.length});
  }
}

export function buildGridCellSurfacePatchFromBase(surfaceVertices, context, colorMode, viewOptions, cellIndices, cachedLayout = null, transformColor = color => color, surfaceCellRanges = null) {
  if (!(surfaceVertices instanceof Float32Array)) return null;
  const grid = context?.map?.grid;
  const cellVertices = grid?.cells?.v;
  if (!Array.isArray(cellVertices)) return null;
  const layout = cachedLayout?.surfaceVertices === surfaceVertices && cachedLayout?.cellVertices === cellVertices
    ? cachedLayout
    : buildGridCellSurfaceLayout(surfaceVertices, cellVertices, surfaceCellRanges);
  if (!layout) return null;

  const cells = [...new Set(Array.from(cellIndices || [], Number).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < cellVertices.length))];
  let floatLength = 0;
  for (const cell of cells) floatLength += layout.offsets[cell + 1] - layout.offsets[cell];
  if (!floatLength) return null;

  const vertices = new Float32Array(floatLength);
  const ranges = new Map();
  let writeOffset = 0;
  for (const cell of cells) {
    const sourceStart = layout.offsets[cell];
    const sourceEnd = layout.offsets[cell + 1];
    if (sourceEnd <= sourceStart) continue;
    const start = writeOffset;
    vertices.set(surfaceVertices.subarray(sourceStart, sourceEnd), writeOffset);
    const color = transformColor(colorForCell(cell, context.map, colorMode, viewOptions), cell);
    for (; writeOffset < start + sourceEnd - sourceStart; writeOffset += 6) {
      vertices[writeOffset + 2] = color[0];
      vertices[writeOffset + 3] = color[1];
      vertices[writeOffset + 4] = color[2];
      vertices[writeOffset + 5] = color[3];
    }
    ranges.set(cell, {start, end: writeOffset});
  }
  return {vertices, ranges, layout};
}

function buildGridCellSurfaceLayout(surfaceVertices, cellVertices, surfaceCellRanges) {
  const offsets = new Uint32Array(cellVertices.length + 1);
  if (surfaceCellRanges instanceof Map && surfaceCellRanges.size === cellVertices.length) {
    for (let cell = 0; cell < cellVertices.length; cell++) {
      const range = surfaceCellRanges.get(cell);
      if (!range || range.start !== offsets[cell] || range.end < range.start) return null;
      offsets[cell + 1] = range.end;
    }
    return offsets[cellVertices.length] === surfaceVertices.length ? {surfaceVertices, cellVertices, offsets} : null;
  }
  let offset = 0;
  for (let cell = 0; cell < cellVertices.length; cell++) {
    const polygonVertices = cellVertices[cell]?.length || 0;
    if (polygonVertices >= 3) offset += polygonVertices * 18;
    offsets[cell + 1] = offset;
  }
  if (offset !== surfaceVertices.length) return null;
  return {surfaceVertices, cellVertices, offsets};
}

export function politicalSurfaceMeshForMode(colorMode, meshes) {
  if (colorMode === "states" && meshes?.states?.surfaceVertices?.length) return meshes.states;
  if (colorMode === "provinces" && meshes?.provinces?.surfaceVertices?.length) return meshes.provinces;
  return null;
}

export function shouldDrawGridCellUnderPoliticalMesh(map, colorMode, cellIndex) {
  if (!isLandCell(cellIndex, map)) return true;
  const field = colorMode === "states" ? "state" : colorMode === "provinces" ? "province" : null;
  return !field || !(map.grid.cells[field]?.[cellIndex] || 0);
}

export function pushMeshSurfaceVertices(vertices, mesh, transformColor = color => color) {
  const source = mesh.surfaceVertices || [];
  for (let index = 0; index < source.length; index += 6) {
    const color = transformColor([source[index + 2], source[index + 3], source[index + 4], source[index + 5]]);
    vertices.push(source[index], source[index + 1], color[0], color[1], color[2], color[3]);
  }
}
