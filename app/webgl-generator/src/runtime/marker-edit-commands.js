import {createMarkerAtPackCell, createMarkerResult, regenerateResourceMarkers, refreshMarkerResourceEconomy} from "../generator/markers.js";
import {OBJECT_KIND} from "./object-kinds.js";

const MARKER_VISUAL_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "labels", "object-panels"])
});

const MARKER_COLLECTION_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "labels", "object-panels", "object-index"])
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

export function createAddMarkerCommand({type, packCell, name = ""} = {}) {
  const normalizedPackCell = normalizeCellId(packCell);
  const normalizedType = normalizeMarkerType(type);
  const normalizedName = normalizeMarkerName(name);
  let previous = null;
  let created = null;

  return {
    label: `新增资源点 ${normalizedType}`,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: []
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      const markers = markerRows(context.map);
      created ??= createMarkerAtPackCell(markers, context.map.pack, context.map.grid, normalizedType, normalizedPackCell, normalizedName ? {name: normalizedName} : {});
      writeMarkerCollection(context.map, [...markers, cloneMarker(created)]);
      this.effects.affected = [{kind: OBJECT_KIND.MARKER, id: created.id}];
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous);
    },
    isNoop(context) {
      return !context.map?.pack?.cells?.i?.length || !Number.isInteger(normalizedPackCell) || normalizedPackCell < 0;
    },
    getCreatedMarker() {
      return created ? cloneMarker(created) : null;
    }
  };
}

export function createMoveMarkerCommand(markerId, packCell) {
  const normalizedMarkerId = Number(markerId);
  const normalizedPackCell = normalizeCellId(packCell);
  let previous = null;

  return {
    label: `移动资源标记 #${normalizedMarkerId}`,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: [{kind: OBJECT_KIND.MARKER, id: normalizedMarkerId}]
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      const markers = markerRows(context.map);
      const marker = markers[normalizedMarkerId];
      if (!marker) throw new Error(`找不到标记 #${normalizedMarkerId}`);
      const moved = createMarkerAtPackCell(markers, context.map.pack, context.map.grid, marker.type, normalizedPackCell, {
        id: marker.id,
        name: marker.name,
        visual: marker.visual || marker.data?.visual || null,
        pinned: marker.pinned,
        lock: marker.lock
      });
      writeMarkerCollection(context.map, replaceMarker(markers, normalizedMarkerId, moved));
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous);
    },
    isNoop(context) {
      const marker = context.map?.markers?.markers?.[normalizedMarkerId];
      return !marker || !Number.isInteger(normalizedPackCell) || normalizedPackCell < 0 || marker.packCell === normalizedPackCell;
    }
  };
}

export function createDeleteMarkerCommand(markerId) {
  const normalizedMarkerId = Number(markerId);
  let previous = null;

  return {
    label: `删除资源标记 #${normalizedMarkerId}`,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: [{kind: OBJECT_KIND.MARKER, id: normalizedMarkerId}]
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      const markers = markerRows(context.map);
      if (!markers[normalizedMarkerId]) throw new Error(`找不到标记 #${normalizedMarkerId}`);
      writeMarkerCollection(context.map, markers.filter(marker => marker.id !== normalizedMarkerId));
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous);
    },
    isNoop(context) {
      return !context.map?.markers?.markers?.[normalizedMarkerId];
    }
  };
}

export function createRegenerateResourceMarkersCommand({salt = 0} = {}) {
  let previous = null;

  return {
    label: `重生成资源点 #${salt}`,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: [{kind: OBJECT_KIND.MARKER, id: "resources"}]
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      const preserved = markerRows(context.map).filter(marker => marker.category !== "resource");
      const resources = regenerateResourceMarkers(context.map.grid, context.map.pack, context.map.politics, context.map.rivers, {
        ...context.map.options,
        resourceRegenerationSalt: salt
      }, preserved);
      writeMarkerCollection(context.map, [...preserved, ...resources]);
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous);
    },
    isNoop(context) {
      return !context.map?.pack?.cells?.i?.length || !context.map?.markers?.markers?.length;
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

function captureMarkerSnapshot(map) {
  return markerRows(map).map(cloneMarker);
}

function restoreMarkerSnapshot(map, snapshot) {
  writeMarkerCollection(map, (snapshot || []).map(cloneMarker));
}

function writeMarkerCollection(map, markers) {
  const previousMetadata = map.markers?.metadata || {};
  const normalized = normalizeMarkerIds(markers.map(cloneMarker));
  map.markers = createMarkerResult(normalized);
  map.markers.metadata = {
    ...previousMetadata,
    ...map.markers.metadata,
    stale: false
  };
  if (map.pack) refreshMarkerResourceEconomy(map.pack, normalized);
}

function normalizeMarkerIds(markers) {
  return markers.map((marker, index) => {
    const next = cloneMarker(marker);
    next.id = index;
    next.i = index;
    if (!next.data || typeof next.data !== "object") next.data = {};
    return next;
  });
}

function replaceMarker(markers, markerId, nextMarker) {
  return markers.map(marker => marker.id === markerId ? nextMarker : marker);
}

function markerRows(map) {
  return (map?.markers?.markers || []).filter(marker => marker && Number.isInteger(marker.id));
}

function cloneMarker(marker) {
  return marker ? JSON.parse(JSON.stringify(marker)) : marker;
}

function normalizeMarkerType(type) {
  return typeof type === "string" && type.trim() ? type.trim() : "mines";
}

function normalizeMarkerName(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

function normalizeCellId(value) {
  if (value === null || value === undefined || value === "") return -1;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : -1;
}
