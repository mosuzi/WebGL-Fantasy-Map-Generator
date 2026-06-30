import {colorForCell, isLandCell} from "./color-modes.js";
import {worldToNdcPoint} from "./render-context.js";
import {pushWorldVertex, writeVertex} from "./mesh-writer.js";

export function buildCellVisualGridVertices(context, colorMode, viewOptions, cellVisualMesh) {
  const {map} = context;
  const cells = cellVisualMesh?.cells || [];
  let triangles = 0;
  for (const cellMesh of cells) {
    if (cellMesh?.points?.length) triangles += cellMesh.points.length;
  }

  const vertices = new Float32Array(triangles * 3 * 6);
  let offset = 0;
  for (const cellMesh of cellVisualMesh.cells || []) {
    if (!cellMesh?.points?.length) continue;
    const color = colorForCell(cellMesh.cell, map, colorMode, viewOptions);
    const center = worldToNdcPoint(context, cellMesh.center);
    for (let index = 0; index < cellMesh.points.length; index++) {
      const nextIndex = (index + 1) % cellMesh.points.length;
      const current = worldToNdcPoint(context, cellMesh.points[index]);
      const next = worldToNdcPoint(context, cellMesh.points[nextIndex]);
      offset = writeVertex(vertices, offset, center[0], center[1], color);
      offset = writeVertex(vertices, offset, current[0], current[1], color);
      offset = writeVertex(vertices, offset, next[0], next[1], color);
    }
  }

  return offset === vertices.length ? vertices : vertices.slice(0, offset);
}

export function pushGridCells(vertices, context, colorMode, viewOptions, shouldDrawCell = () => true) {
  const {map} = context;
  const grid = map.grid;
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
    if (!shouldDrawCell(cellIndex)) continue;
    const vertexIds = grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const center = grid.points[grid.cells.p[cellIndex]];
    const color = colorForCell(cellIndex, map, colorMode, viewOptions);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushWorldVertex(vertices, context, center, color);
      pushWorldVertex(vertices, context, grid.vertices.p[vertexIds[index]], color);
      pushWorldVertex(vertices, context, grid.vertices.p[vertexIds[nextIndex]], color);
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
