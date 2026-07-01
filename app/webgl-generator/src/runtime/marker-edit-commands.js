import {OBJECT_KIND} from "./object-kinds.js";

const MARKER_VISUAL_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "labels", "object-panels"])
});

export function createSetMarkerVisualCommand(markerId, patch = {}) {
  const normalizedMarkerId = Number(markerId);
  const nextPatch = normalizeVisualPatch(patch);
  let previous = null;

  return {
    label: `调整标记图标 #${normalizedMarkerId}`,
    effects: {
      ...MARKER_VISUAL_EFFECTS,
      affected: [{kind: OBJECT_KIND.MARKER, id: normalizedMarkerId}]
    },
    apply(context) {
      const marker = readMarker(context.map, normalizedMarkerId);
      previous ??= cloneVisual(marker.visual || marker.data?.visual || {});
      const next = {
        ...defaultMarkerVisual(marker),
        ...cloneVisual(marker.visual || marker.data?.visual || {}),
        ...nextPatch,
        manual: true
      };
      writeMarkerVisual(marker, next);
    },
    revert(context) {
      const marker = readMarker(context.map, normalizedMarkerId);
      writeMarkerVisual(marker, previous || defaultMarkerVisual(marker));
    },
    isNoop(context) {
      const marker = context.map?.markers?.markers?.[normalizedMarkerId];
      if (!marker || !Object.keys(nextPatch).length) return true;
      const current = marker.visual || marker.data?.visual || {};
      return Object.entries(nextPatch).every(([key, value]) => current[key] === value);
    }
  };
}

function readMarker(map, markerId) {
  const marker = map?.markers?.markers?.[markerId];
  if (!marker) throw new Error(`找不到标记 #${markerId}`);
  return marker;
}

function writeMarkerVisual(marker, visual) {
  marker.visual = cloneVisual(visual);
  if (!marker.data || typeof marker.data !== "object") marker.data = {};
  marker.data.visual = cloneVisual(visual);
}

function normalizeVisualPatch(patch) {
  const next = {};
  if (typeof patch.symbol === "string" && patch.symbol.trim()) next.symbol = patch.symbol.trim();
  if (typeof patch.palette === "string" && patch.palette.trim()) {
    next.palette = patch.palette.trim();
    next.categoryColor = null;
  }
  if (typeof patch.shape === "string" && patch.shape.trim()) next.shape = patch.shape.trim();
  if (typeof patch.cultureStyle === "string" && patch.cultureStyle.trim()) next.cultureStyle = patch.cultureStyle.trim();
  return next;
}

function defaultMarkerVisual(marker) {
  return {
    shape: "pin",
    symbol: marker?.visual?.symbol || marker?.data?.visual?.symbol || "marker",
    palette: marker?.visual?.palette || marker?.data?.visual?.palette || marker?.category || "mystery",
    cultureStyle: marker?.visual?.cultureStyle || marker?.data?.visual?.cultureStyle || "default",
    manual: Boolean(marker?.visual?.manual || marker?.data?.visual?.manual),
    categoryColor: marker?.visual?.categoryColor || marker?.data?.visual?.categoryColor || marker?.color || null
  };
}

function cloneVisual(visual) {
  return visual ? {...visual} : {};
}
