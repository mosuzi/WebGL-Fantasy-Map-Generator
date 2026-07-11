import {createRenderContext, worldToScreenPixel} from "./render-context.js";
import {smoothWorldPath} from "./geometry.js";
import {pushScreenPolyline, pushScreenTriangle} from "./mesh-writer.js";
import {OBJECT_KIND, POLITICAL_OBJECT_FIELD, isPoliticalObjectKind} from "../runtime/object-kinds.js";

const SELECTION_HIGHLIGHT_COLORS = Object.freeze({
  [OBJECT_KIND.STATE]: [1, 0.86, 0.28, 0.3],
  [OBJECT_KIND.PROVINCE]: [0.9, 0.7, 0.28, 0.34],
  [OBJECT_KIND.CULTURE]: [0.72, 0.95, 0.62, 0.3],
  [OBJECT_KIND.RELIGION]: [0.96, 0.68, 0.95, 0.3],
  [OBJECT_KIND.REGION]: [0.65, 0.9, 1, 0.28],
  [OBJECT_KIND.ZONE]: [1, 0.78, 0.34, 0.34]
});

const SELECTION_HIGHLIGHT_MODES = Object.freeze({
  [OBJECT_KIND.RIVER]: "river screen-space mesh",
  [OBJECT_KIND.STATE]: "state translucent cells",
  [OBJECT_KIND.PROVINCE]: "province translucent cells",
  [OBJECT_KIND.CULTURE]: "culture translucent cells",
  [OBJECT_KIND.RELIGION]: "religion translucent cells",
  [OBJECT_KIND.REGION]: "region translucent cells",
  [OBJECT_KIND.ZONE]: "zone translucent cells"
});

const SELECTION_SMOOTHING = Object.freeze({
  river: Object.freeze({iterations: 1, factor: 0.18})
});

const MULTI_HIGHLIGHT_COLOR = Object.freeze([1, 0.46, 0.12, 0.72]);

export function buildSelectionMeshVertices(map, camera, canvas, selection, locateFlash, highlights = []) {
  const vertices = [];
  const context = createRenderContext(map, {camera, canvas});
  pushSelectionTarget(vertices, context, selection, locateFlash);
  for (const highlight of highlights) {
    if (sameSelectionTarget(selection, highlight)) continue;
    pushSelectionTarget(vertices, context, highlight, null, MULTI_HIGHLIGHT_COLOR);
  }
  return new Float32Array(vertices);
}

function pushSelectionTarget(vertices, context, selection, locateFlash, overrideColor = null) {
  if (!selection || isNeutralStateSelection(selection)) return;
  if (isPoliticalObjectKind(selection?.kind)) {
    pushPoliticalSelectionMesh(vertices, context, selection, locateFlash, overrideColor);
    return;
  }
  if (selection?.kind === OBJECT_KIND.ZONE) {
    pushZoneSelectionMesh(vertices, context, selection, locateFlash, overrideColor);
    return;
  }
  if (selection?.kind === OBJECT_KIND.LAKE) {
    pushLakeSelectionMesh(vertices, context, selection, overrideColor);
    return;
  }
  if (selection?.kind !== OBJECT_KIND.RIVER) return;
  const {map} = context;
  const river = map.rivers.rivers.find(item => item.id === selection.id);
  if (!river || river.points.length < 2) return;
  const pixelRatio = context.canvas.width / Math.max(1, context.canvas.clientWidth);
  const maxFlux = Math.max(1, map.rivers.metadata.maxFlux || river.flux || 1);
  const fluxFactor = Math.sqrt(Math.max(0, river.flux || 0) / maxFlux);
  const widthPx = (4.2 + fluxFactor * 2.4) * pixelRatio;
  const color = overrideColor || locateFlashColor(selection, locateFlash) || [0.62, 0.88, 1, 1];
  pushScreenPolyline(vertices, context, smoothWorldPath(river.points, SELECTION_SMOOTHING.river), color, widthPx);
}

function pushZoneSelectionMesh(vertices, context, selection, locateFlash, overrideColor = null) {
  const {map} = context;
  const zone = (map?.zones?.zones || map?.pack?.zones || []).find(item => Number(item?.i ?? item?.id) === Number(selection.id));
  if (!zone?.cells?.length) return;
  const color = overrideColor || locateFlashColor(selection, locateFlash) || SELECTION_HIGHLIGHT_COLORS[OBJECT_KIND.ZONE];
  for (const cell of zone.cells) {
    pushPackCellSelectionMesh(vertices, context, cell, color);
  }
}

function pushLakeSelectionMesh(vertices, context, selection, overrideColor = null) {
  const {map} = context;
  const featureId = Number(selection.id);
  if (!Number.isInteger(featureId)) return;
  const color = overrideColor || [0.42, 0.86, 1, 0.5];
  for (const cell of map?.pack?.cells?.i || []) {
    if (Number(map.pack.cells.f?.[cell]) !== featureId || Number(map.pack.cells.h?.[cell]) >= 20) continue;
    pushPackCellSelectionMesh(vertices, context, cell, color);
  }
}

function pushPackCellSelectionMesh(vertices, context, cell, color) {
  const {map} = context;
  const vertexIds = map?.pack?.cells?.v?.[cell];
  const centerPoint = map?.pack?.cells?.p?.[cell];
  if (!Array.isArray(vertexIds) || vertexIds.length < 3 || !centerPoint) return;
  const center = worldToScreenPixel(context, centerPoint);
  for (let index = 0; index < vertexIds.length; index++) {
    const nextIndex = (index + 1) % vertexIds.length;
    const a = map.pack.vertices.p?.[vertexIds[index]];
    const b = map.pack.vertices.p?.[vertexIds[nextIndex]];
    if (!a || !b) continue;
    pushScreenTriangle(vertices, context, center, worldToScreenPixel(context, a), worldToScreenPixel(context, b), color);
  }
}

export function selectionHighlightMode(selection, locateFlash = null, highlights = []) {
  if (highlights.length) return `multi-object highlight (${highlights.length})`;
  if (!selection) return "none";
  if (isNeutralStateSelection(selection)) return "none";
  if (isLocateFlashActive(selection, locateFlash)) return `${selection.kind} red flash`;
  return SELECTION_HIGHLIGHT_MODES[selection.kind] || selection.kind;
}

function isNeutralStateSelection(selection) {
  return selection?.kind === OBJECT_KIND.STATE && Number(selection.id) === 0;
}

function pushPoliticalSelectionMesh(vertices, context, selection, locateFlash, overrideColor = null) {
  const {map} = context;
  const field = POLITICAL_OBJECT_FIELD[selection.kind] || POLITICAL_OBJECT_FIELD[OBJECT_KIND.REGION];
  const color = overrideColor || locateFlashColor(selection, locateFlash) || SELECTION_HIGHLIGHT_COLORS[selection.kind] || SELECTION_HIGHLIGHT_COLORS[OBJECT_KIND.REGION];
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

function sameSelectionTarget(left, right) {
  return Boolean(left && right && left.kind === right.kind && String(left.id) === String(right.id));
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
