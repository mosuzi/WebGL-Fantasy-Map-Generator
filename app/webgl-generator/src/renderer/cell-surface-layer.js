import {colorForCell, isLandCell} from "./color-modes.js";
import {resolvedGridVertexPoints} from "./grid-vertex-geometry.js";
import {pushWorldVertex} from "./mesh-writer.js";

export function pushGridCells(vertices, context, colorMode, viewOptions, shouldDrawCell = () => true) {
  const {map} = context;
  const grid = map.grid;
  const vertexPoints = resolvedGridVertexPoints(grid);
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
    if (!shouldDrawCell(cellIndex)) continue;
    const vertexIds = grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const center = grid.points[grid.cells.p[cellIndex]];
    const color = colorForCell(cellIndex, map, colorMode, viewOptions);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushWorldVertex(vertices, context, center, color);
      pushWorldVertex(vertices, context, vertexPoints[vertexIds[index]], color);
      pushWorldVertex(vertices, context, vertexPoints[vertexIds[nextIndex]], color);
    }
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

export function pushMeshSurfaceVertices(vertices, mesh) {
  for (const value of mesh.surfaceVertices || []) vertices.push(value);
}
