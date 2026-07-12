import {OBJECT_KIND} from "./object-kinds.js";

export function measurementHighlightObject(item) {
  const id = String(item?.id || "").trim();
  return id ? {
    kind: OBJECT_KIND.MEASUREMENT,
    id,
    name: item?.name || id
  } : null;
}

export function measurementHighlightState(objectHighlights, locateFlash, measurementId, now = currentTime()) {
  const id = String(measurementId || "");
  const highlighted = (Array.isArray(objectHighlights) ? objectHighlights : [])
    .some(object => object?.kind === OBJECT_KIND.MEASUREMENT && String(object.id) === id);
  const flashing = locateFlash?.kind === OBJECT_KIND.MEASUREMENT
    && String(locateFlash.id) === id
    && Number(locateFlash.until) > now;
  return {highlighted, flashing};
}

export function measurementShapeClass(baseClass, objectHighlights, locateFlash, measurementId, now) {
  const state = measurementHighlightState(objectHighlights, locateFlash, measurementId, now);
  return [baseClass, state.highlighted ? "highlighted" : "", state.flashing ? "locate-flash" : ""].filter(Boolean).join(" ");
}

function currentTime() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
