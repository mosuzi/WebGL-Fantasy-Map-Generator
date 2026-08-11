import {colorForCell, isLandCell} from "./color-modes.js";
import {resolvedGridVertexPoints} from "./grid-vertex-geometry.js";
import {pushWorldVertex} from "./mesh-writer.js";

export function pushGridCells(vertices, context, colorMode, viewOptions, shouldDrawCell = () => true, transformColor = color => color, onCellRange = null) {
  const {map} = context;
  const grid = map.grid;
  const vertexPoints = resolvedGridVertexPoints(grid);
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
    if (!shouldDrawCell(cellIndex)) continue;
    const vertexIds = grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const start = vertices.length;
    const center = grid.points[grid.cells.p[cellIndex]];
    const color = transformColor(colorForCell(cellIndex, map, colorMode, viewOptions), cellIndex);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushWorldVertex(vertices, context, center, color);
      pushWorldVertex(vertices, context, vertexPoints[vertexIds[index]], color);
      pushWorldVertex(vertices, context, vertexPoints[vertexIds[nextIndex]], color);
    }
    onCellRange?.(cellIndex, {start, end: vertices.length});
  }
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
