import {createRenderContext, worldToScreenPixel} from "./render-context.js";
import {smoothWorldPath} from "./geometry.js";
import {pushScreenPolyline, pushScreenTriangle} from "./mesh-writer.js";
import {OBJECT_KIND, POLITICAL_OBJECT_FIELD, isPoliticalObjectKind} from "../runtime/object-kinds.js";

const SELECTION_HIGHLIGHT_COLORS = Object.freeze({
  [OBJECT_KIND.STATE]: [1, 0.86, 0.28, 0.3],
  [OBJECT_KIND.PROVINCE]: [0.9, 0.7, 0.28, 0.34],
  [OBJECT_KIND.CULTURE]: [0.72, 0.95, 0.62, 0.3],
  [OBJECT_KIND.RELIGION]: [0.96, 0.68, 0.95, 0.3],
  [OBJECT_KIND.REGION]: [0.65, 0.9, 1, 0.28]
});

const SELECTION_HIGHLIGHT_MODES = Object.freeze({
  [OBJECT_KIND.RIVER]: "river screen-space mesh",
  [OBJECT_KIND.STATE]: "state translucent cells",
  [OBJECT_KIND.PROVINCE]: "province translucent cells",
  [OBJECT_KIND.CULTURE]: "culture translucent cells",
  [OBJECT_KIND.RELIGION]: "religion translucent cells",
  [OBJECT_KIND.REGION]: "region translucent cells"
});

const SELECTION_SMOOTHING = Object.freeze({
  river: Object.freeze({iterations: 1, factor: 0.18})
});

export function buildSelectionMeshVertices(map, camera, canvas, selection, locateFlash) {
  const context = createRenderContext(map, {camera, canvas});
  const vertices = [];
  if (isPoliticalObjectKind(selection?.kind)) {
    pushPoliticalSelectionMesh(vertices, context, selection, locateFlash);
    return new Float32Array(vertices);
  }
  if (selection?.kind !== OBJECT_KIND.RIVER) return new Float32Array(vertices);
  const river = map.rivers.rivers.find(item => item.id === selection.id);
  if (!river || river.points.length < 2) return new Float32Array(vertices);
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  const maxFlux = Math.max(1, map.rivers.metadata.maxFlux || river.flux || 1);
  const fluxFactor = Math.sqrt(Math.max(0, river.flux || 0) / maxFlux);
  const widthPx = (4.2 + fluxFactor * 2.4) * pixelRatio;
  const color = locateFlashColor(selection, locateFlash) || [0.62, 0.88, 1, 1];
  pushScreenPolyline(vertices, context, smoothWorldPath(river.points, SELECTION_SMOOTHING.river), color, widthPx);
  return new Float32Array(vertices);
}

export function selectionHighlightMode(selection, locateFlash = null) {
  if (!selection) return "none";
  if (isLocateFlashActive(selection, locateFlash)) return `${selection.kind} red flash`;
  return SELECTION_HIGHLIGHT_MODES[selection.kind] || selection.kind;
}

function pushPoliticalSelectionMesh(vertices, context, selection, locateFlash) {
  const {map} = context;
  const field = POLITICAL_OBJECT_FIELD[selection.kind] || POLITICAL_OBJECT_FIELD[OBJECT_KIND.REGION];
  const color = locateFlashColor(selection, locateFlash) || SELECTION_HIGHLIGHT_COLORS[selection.kind] || SELECTION_HIGHLIGHT_COLORS[OBJECT_KIND.REGION];
  for (let cellIndex = 0; cellIndex < map.grid.cells.v.length; cellIndex++) {
    if (map.grid.cells[field][cellIndex] !== selection.id) continue;
    const vertexIds = map.grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const center = worldToScreenPixel(context, map.grid.points[map.grid.cells.p[cellIndex]]);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushScreenTriangle(vertices, context, center, worldToScreenPixel(context, map.grid.vertices.p[vertexIds[index]]), worldToScreenPixel(context, map.grid.vertices.p[vertexIds[nextIndex]]), color);
    }
  }
}

function locateFlashColor(selection, locateFlash) {
  if (!isLocateFlashActive(selection, locateFlash)) return null;
  const phase = (performance.now() / 180) % 2;
  const alpha = phase < 1 ? 1 : 0.38;
  return [1, 0.12, 0.08, alpha];
}

function isLocateFlashActive(selection, locateFlash) {
  return Boolean(selection && locateFlash && selection.kind === locateFlash.kind && selection.id === locateFlash.id && performance.now() <= locateFlash.until);
}
