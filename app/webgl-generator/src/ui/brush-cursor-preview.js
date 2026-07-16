import {BRUSH_RADIUS_ID, normalizeBrushRadius, projectWorldRadiusToScreen} from "../runtime/brush-radius-contract.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEIGHT_BRUSH_ACTIONS = new Set(["raise", "lower", "smooth", "flatten", "disrupt"]);

export function resolveBrushCursor(state) {
  const modeId = state?.canvasToolModes?.getActive?.()?.id || null;
  if (modeId === "height:brush") {
    const paint = state.heightEdit?.terrainSelectionPaint || state.heightEdit?.terrainSelectionPaintPending;
    if (paint?.request) return radiusResolution(BRUSH_RADIUS_ID.HEIGHT_SELECTION, paint.request.radius);
    if (state.heightEdit?.terrainSelectionBox || state.heightEdit?.terrainSelectionPoint) return null;
    const brush = state.panels?.height?.getBrush?.();
    if (brush?.active && HEIGHT_BRUSH_ACTIONS.has(brush.action)) return radiusResolution(BRUSH_RADIUS_ID.HEIGHT, brush.radius);
    return null;
  }
  if (modeId === "state:brush") return panelResolution(state.panels?.state, "getBrush", BRUSH_RADIUS_ID.STATE);
  if (modeId === "province:brush") return panelResolution(state.panels?.province, "getBrush", BRUSH_RADIUS_ID.PROVINCE);
  if (modeId === "culture:assign") return panelResolution(state.panels?.culture, "getBrush", BRUSH_RADIUS_ID.CULTURE);
  if (modeId === "religion:assign") return panelResolution(state.panels?.religion, "getBrush", BRUSH_RADIUS_ID.RELIGION);
  if (modeId === "biome:assign") return panelResolution(state.panels?.biome, "getBrush", BRUSH_RADIUS_ID.BIOME);
  if (modeId === "economy:market-assign") return panelResolution(state.panels?.economy, "getMarketBrush", BRUSH_RADIUS_ID.ECONOMY_MARKET);
  return null;
}

export function createBrushCursorPreview(canvas, state, documentRef) {
  const svg = documentRef.createElementNS(SVG_NS, "svg");
  svg.classList.add("brush-cursor-preview");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("pointer-events", "none");
  setOverlayVisible(svg, false);
  const ellipse = documentRef.createElementNS(SVG_NS, "ellipse");
  ellipse.setAttribute("vector-effect", "non-scaling-stroke");
  ellipse.setAttribute("pointer-events", "none");
  svg.append(ellipse);
  documentRef.body.append(svg);

  let pointer = null;
  let scheduled = false;
  let destroyed = false;

  const refresh = () => {
    scheduled = false;
    if (destroyed || !pointer || !state.map || !state.renderer) return clear();
    const resolution = resolveBrushCursor(state);
    if (!resolution) return clear();
    const center = state.renderer.screenToWorld(pointer.clientX, pointer.clientY);
    const rect = canvas.getBoundingClientRect();
    const projection = projectWorldRadiusToScreen(center, resolution.radius, point => {
      const local = state.renderer.worldToScreen(point.x, point.y, rect);
      return {x: rect.left + local.x, y: rect.top + local.y};
    });
    if (!projection || projection.radiusX <= 0 || projection.radiusY <= 0) return clear();
    ellipse.setAttribute("cx", String(projection.center.x));
    ellipse.setAttribute("cy", String(projection.center.y));
    ellipse.setAttribute("rx", String(projection.radiusX));
    ellipse.setAttribute("ry", String(projection.radiusY));
    svg.dataset.radiusId = resolution.id;
    svg.dataset.worldRadius = String(resolution.radius);
    setOverlayVisible(svg, true);
    return projection;
  };

  const scheduleRefresh = () => {
    if (scheduled || destroyed || !pointer) return;
    scheduled = true;
    const view = documentRef.defaultView;
    if (typeof view?.requestAnimationFrame === "function") view.requestAnimationFrame(refresh);
    else Promise.resolve().then(refresh);
  };

  const rememberPointer = event => {
    pointer = {clientX: event.clientX, clientY: event.clientY};
    refresh();
  };
  const forgetPointer = () => {
    pointer = null;
    clear();
  };
  const onControlChange = () => scheduleRefresh();

  canvas.addEventListener("pointerenter", rememberPointer, true);
  canvas.addEventListener("pointermove", rememberPointer, true);
  canvas.addEventListener("pointerleave", forgetPointer, true);
  canvas.addEventListener("pointercancel", forgetPointer, true);
  documentRef.addEventListener("input", onControlChange, true);
  documentRef.addEventListener("change", onControlChange, true);
  documentRef.addEventListener("click", onControlChange, true);

  function clear() {
    setOverlayVisible(svg, false);
    delete svg.dataset.radiusId;
    delete svg.dataset.worldRadius;
    return null;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    canvas.removeEventListener("pointerenter", rememberPointer, true);
    canvas.removeEventListener("pointermove", rememberPointer, true);
    canvas.removeEventListener("pointerleave", forgetPointer, true);
    canvas.removeEventListener("pointercancel", forgetPointer, true);
    documentRef.removeEventListener("input", onControlChange, true);
    documentRef.removeEventListener("change", onControlChange, true);
    documentRef.removeEventListener("click", onControlChange, true);
    pointer = null;
    svg.remove();
    return true;
  }

  return {svg, ellipse, refresh, scheduleRefresh, clear, reset: forgetPointer, destroy};
}

function panelResolution(panel, getter, id) {
  const brush = panel?.[getter]?.();
  return brush?.active ? radiusResolution(id, brush.radius) : null;
}

function radiusResolution(id, radius) {
  return {id, radius: normalizeBrushRadius(id, radius)};
}

function setOverlayVisible(svg, visible) {
  svg.hidden = !visible;
  if (visible) svg.removeAttribute("hidden");
  else svg.setAttribute("hidden", "");
}
