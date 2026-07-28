import {createMarkerAtPackCell, createMarkerResult, regenerateResourceMarkers, refreshMarkerResourceEconomy} from "../generator/markers.js";
import {buildEconomy, refreshPoliticalEconomicPower} from "../generator/economy.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {newObjectAffected, objectAffected, systemAffected} from "./edit-command-effects.js";
import {
  allRegenerationObjectsLocked,
  assignReservedNumericIds,
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "./regeneration-lock-protection.js";

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

const MARKER_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

export function createSetMarkerVisualCommand(markerId, patch = {}) {
  const normalizedMarkerId = Number(markerId);
  const nextPatch = normalizeVisualPatch(patch);
  let previous = null;

  return {
    label: `调整标记图标 #${normalizedMarkerId}`,
    domain: OBJECT_KIND.MARKER,
    effects: {
      ...MARKER_VISUAL_EFFECTS,
      affected: objectAffected(OBJECT_KIND.MARKER, normalizedMarkerId)
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
      const marker = findMarker(context.map, normalizedMarkerId);
      if (!marker || !Object.keys(nextPatch).length) return true;
      const current = marker.visual || marker.data?.visual || {};
      return Object.entries(nextPatch).every(([key, value]) => current[key] === value);
    }
  };
}

export function createSetMarkerNoteCommand(markerId, body, {name = ""} = {}) {
  const normalizedMarkerId = Number(markerId);
  const target = {kind: OBJECT_KIND.MARKER, id: normalizedMarkerId};
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑标记备注 #${normalizedMarkerId}` : `清空标记备注 #${normalizedMarkerId}`,
    domain: OBJECT_KIND.MARKER,
    effects: {
      ...MARKER_NOTE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.MARKER, normalizedMarkerId)
    },
    apply(context) {
      const marker = readMarker(context.map, normalizedMarkerId);
      previous ??= cloneObjectNote(readObjectNote(context.map, target));
      if (!normalizedBody) {
        deleteObjectNote(context.map, target);
        return;
      }
      next ??= createMarkerNoteSnapshot(target, normalizedBody, {
        name: name || marker.name || marker.label || `标记 #${normalizedMarkerId}`,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, target);
    },
    isNoop(context) {
      const marker = findMarker(context.map, normalizedMarkerId);
      if (!marker) return true;
      const current = readObjectNote(context.map, target)?.body || "";
      return current === normalizedBody;
    }
  };
}

export function inspectMarkerCreation(map, {id, type, packCell, name = ""} = {}) {
  const normalizedPackCell = normalizeCellId(packCell);
  const count = map?.pack?.cells?.i?.length || 0;
  if (!Number.isInteger(normalizedPackCell) || normalizedPackCell < 0 || normalizedPackCell >= count) {
    return {valid: false, code: "invalid-pack-cell", reason: "标记 pack cell 无效"};
  }
  const requestedId = id === undefined ? null : Number(id);
  if (id !== undefined && (!Number.isInteger(requestedId) || requestedId < 0)) return {valid: false, code: "invalid-id", reason: "标记 id 必须是非负整数"};
  if (requestedId !== null && findMarker(map, requestedId)) return {valid: false, code: "duplicate-id", reason: `标记 #${requestedId} 已存在`};
  return {
    valid: true,
    code: "ok",
    reason: "",
    id: requestedId,
    type: normalizeMarkerType(type),
    packCell: normalizedPackCell,
    name: normalizeMarkerName(name)
  };
}

export function createAddMarkerCommand({id, type, packCell, name = ""} = {}) {
  const normalizedPackCell = normalizeCellId(packCell);
  const normalizedType = normalizeMarkerType(type);
  const normalizedName = normalizeMarkerName(name);
  const requestedId = id === undefined ? null : Number(id);
  let previous = null;
  let created = null;

  return {
    label: `新增标记 ${normalizedType}`,
    domain: OBJECT_KIND.MARKER,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: newObjectAffected(OBJECT_KIND.MARKER)
    },
    apply(context) {
      const preview = inspectMarkerCreation(context.map, {id, type, packCell, name});
      if (!preview.valid) throw markerCreationError(preview);
      previous ??= captureMarkerSnapshot(context.map);
      const markers = markerRows(context.map);
      created ??= createMarkerAtPackCell(markers, context.map.pack, context.map.grid, normalizedType, normalizedPackCell, {
        ...(requestedId === null ? {} : {id: requestedId}),
        ...(normalizedName ? {name: normalizedName} : {})
      });
      writeMarkerCollection(context.map, [...markers, cloneMarker(created)]);
      this.effects.affected = [{kind: OBJECT_KIND.MARKER, id: created.id}];
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous);
    },
    isNoop(context) {
      const preview = inspectMarkerCreation(context.map, {id, type, packCell, name});
      if (!preview.valid) throw markerCreationError(preview);
      return false;
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
    label: `移动标记 #${normalizedMarkerId}`,
    domain: OBJECT_KIND.MARKER,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: objectAffected(OBJECT_KIND.MARKER, normalizedMarkerId)
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      const markers = markerRows(context.map);
      const marker = markers.find(item => item.id === normalizedMarkerId);
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
      const marker = findMarker(context.map, normalizedMarkerId);
      return !marker || !Number.isInteger(normalizedPackCell) || normalizedPackCell < 0 || marker.packCell === normalizedPackCell;
    }
  };
}

export function createDeleteMarkerCommand(markerId) {
  const normalizedMarkerId = Number(markerId);
  let previous = null;

  return {
    label: `删除标记 #${normalizedMarkerId}`,
    domain: OBJECT_KIND.MARKER,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: objectAffected(OBJECT_KIND.MARKER, normalizedMarkerId)
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      const markers = markerRows(context.map);
      if (!markers.some(marker => marker.id === normalizedMarkerId)) throw new Error(`找不到标记 #${normalizedMarkerId}`);
      writeMarkerCollection(context.map, markers.filter(marker => marker.id !== normalizedMarkerId));
      deleteObjectNote(context.map, {kind: OBJECT_KIND.MARKER, id: normalizedMarkerId});
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous);
    },
    isNoop(context) {
      return !findMarker(context.map, normalizedMarkerId);
    }
  };
}

export function createRegenerateResourceMarkersCommand({salt = 0, constraintBundle = null} = {}) {
  let previous = null;
  let lockCapture = null;
  let featureCapture = null;

  return {
    label: `重生成资源点 #${salt}`,
    domain: OBJECT_KIND.MARKER,
    effects: {
      ...MARKER_COLLECTION_EFFECTS,
      affected: systemAffected("markers", objectAffected(OBJECT_KIND.MARKER, "resources"))
    },
    apply(context) {
      previous ??= captureMarkerSnapshot(context.map);
      try {
        lockCapture ??= constraintBundle
          ? {snapshots: constraintBundle.lockedMarkers, ids: new Set(constraintBundle.ids(OBJECT_KIND.MARKER))}
          : captureLockedRegenerationObjects(context.map, OBJECT_KIND.MARKER);
        featureCapture ??= captureFeatureLocks(context.map, constraintBundle);
        const lockedIds = lockCapture.ids;
        const resourceCount = markerRows(context.map).filter(marker => marker.category === "resource").length;
        const preserved = markerRows(context.map).filter(marker =>
          marker.category !== "resource"
          || lockedIds.has(String(marker.id))
          || markerTouchesLockedFeature(context.map, marker, featureCapture.ids)
        );
        const lockedResourceCount = preserved.filter(marker => marker.category === "resource").length;
        const resources = regenerateResourceMarkers(context.map.grid, context.map.pack, context.map.politics, context.map.rivers, {
          ...context.map.options,
          lockedFeatures: featureCapture.snapshots,
          resourceRegenerationSalt: salt,
          ...(resourceCount > 0 ? {targetResourceCount: Math.max(0, resourceCount - lockedResourceCount)} : {})
        }, preserved);
        const identifiedResources = assignReservedNumericIds(resources.map(cloneMarker), new Set(preserved.map(marker => marker.id)));
        writeMarkerCollection(context.map, [...preserved, ...identifiedResources], constraintBundle, featureCapture);
        if (constraintBundle) constraintBundle.assertDomain(context.map, "markers-economy", "marker-command");
        else assertLockedRegenerationSnapshots(context.map, lockCapture);
      } catch (error) {
        restoreMarkerSnapshot(context.map, previous, constraintBundle, featureCapture);
        throw error;
      }
    },
    revert(context) {
      restoreMarkerSnapshot(context.map, previous, constraintBundle, featureCapture);
    },
    isNoop(context) {
      const resources = markerRows(context.map).filter(marker => marker.category === "resource");
      return !context.map?.pack?.cells?.i?.length
        || !Array.isArray(context.map?.markers?.markers)
        || resources.length > 0 && allRegenerationObjectsLocked(context.map, OBJECT_KIND.MARKER, resources);
    }
  };
}

export async function regenerateResourceMarkersInChunks(
  map,
  {salt = 0, yieldToMain = async () => {}, now = currentTime, constraintBundle = null} = {}
) {
  const currentResources = markerRows(map).filter(marker => marker.category === "resource");
  if (!map?.pack?.cells?.i?.length
    || !Array.isArray(map?.markers?.markers)
    || currentResources.length > 0 && allRegenerationObjectsLocked(map, OBJECT_KIND.MARKER, currentResources)) {
    return {executed: false, timings: {chunks: []}};
  }
  const snapshot = structuredClone({
    markers: map.markers,
    pack: map.pack,
    politics: map.politics,
    economy: map.economy
  });
  try {
    const chunks = [];
    const marketCapture = constraintBundle
      ? {snapshots: mergeLockedDealMarkets(map, constraintBundle.lockedMarkets, constraintBundle.lockedDeals)}
      : captureLockedRegenerationObjects(map, OBJECT_KIND.ECONOMY_MARKET);
    const dealCapture = constraintBundle
      ? {snapshots: constraintBundle.lockedDeals}
      : captureLockedRegenerationObjects(map, OBJECT_KIND.TRADE_FLOW);
    const lockCapture = constraintBundle
      ? {snapshots: constraintBundle.lockedMarkers, ids: new Set(constraintBundle.ids(OBJECT_KIND.MARKER))}
      : captureLockedRegenerationObjects(map, OBJECT_KIND.MARKER);
    const featureCapture = captureFeatureLocks(map, constraintBundle);
    const preserved = markerRows(map).filter(marker =>
      marker.category !== "resource"
      || lockCapture.ids.has(String(marker.id))
      || markerTouchesLockedFeature(map, marker, featureCapture.ids)
    );
    const lockedResourceCount = preserved.filter(marker => marker.category === "resource").length;
    const resources = await markerRegenerationChunk("generate-resources", () => regenerateResourceMarkers(map.grid, map.pack, map.politics, map.rivers, {
      ...map.options,
      lockedFeatures: featureCapture.snapshots,
      resourceRegenerationSalt: salt,
      ...(currentResources.length > 0 ? {targetResourceCount: Math.max(0, currentResources.length - lockedResourceCount)} : {})
    }, preserved), {chunks, now, yieldToMain});
    const normalized = await markerRegenerationChunk("write-markers", () => {
      const identifiedResources = assignReservedNumericIds(resources.map(cloneMarker), new Set(preserved.map(marker => marker.id)));
      const collection = normalizeMarkerIds([...preserved, ...identifiedResources]);
      const previousMetadata = map.markers?.metadata || {};
      map.markers = createMarkerResult(collection);
      map.markers.metadata = {...previousMetadata, ...map.markers.metadata, stale: false};
      map.pack.markers = collection;
      assertFeatureLocks(map, constraintBundle, featureCapture, "marker-write");
      if (constraintBundle) constraintBundle.assertDomain(map, "marker", "marker-write");
      else assertLockedRegenerationSnapshots(map, lockCapture);
      return collection;
    }, {chunks, now, yieldToMain});
    await markerRegenerationChunk("resource-economy", () => refreshMarkerResourceEconomy(map.pack, normalized, {
      lockedStates: constraintBundle?.lockedStates || [],
      lockedProvinces: constraintBundle?.lockedProvinces || []
    }), {chunks, now, yieldToMain});
    await markerRegenerationChunk("build-economy", () => {
      if (map.options) {
        map.economy = buildEconomy(map.pack, {
          ...map.options,
          lockedMarkets: marketCapture.snapshots,
          lockedDeals: dealCapture.snapshots,
          lockedStates: constraintBundle?.lockedStates || [],
          lockedProvinces: constraintBundle?.lockedProvinces || []
        });
        if (constraintBundle) constraintBundle.assertDomain(map, "markers-economy", "economy-build");
        else {
          assertLockedRegenerationSnapshots(map, marketCapture);
          assertLockedRegenerationSnapshots(map, dealCapture);
        }
      }
      else refreshPoliticalEconomicPower(map.pack);
    }, {chunks, now, yieldToMain});
    return {executed: true, timings: {chunks}};
  } catch (error) {
    map.markers = snapshot.markers;
    map.pack = snapshot.pack;
    map.politics = snapshot.politics;
    map.economy = snapshot.economy;
    throw error;
  }
}

function mergeLockedDealMarkets(map, lockedMarkets = [], lockedDeals = []) {
  const byId = new Map((lockedMarkets || []).map(market => [Number(market?.i ?? market?.id), market]));
  const current = new Map((map?.pack?.markets || []).filter(Boolean).map(market => [Number(market.i ?? market.id), market]));
  for (const deal of lockedDeals || []) {
    for (const [type, value] of [[deal?.sellerType, deal?.seller], [deal?.buyerType, deal?.buyer]]) {
      if (type !== "market") continue;
      const id = Number(value);
      const market = current.get(id);
      if (market && !byId.has(id)) byId.set(id, structuredClone(market));
    }
  }
  return [...byId.values()];
}

function readMarker(map, markerId) {
  const marker = findMarker(map, markerId);
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

function createMarkerNoteSnapshot(target, body, {name, previous = null} = {}) {
  const now = new Date().toISOString();
  return {
    id: objectNoteId(target),
    kind: target.kind,
    objectId: target.id,
    name,
    body,
    format: "plain",
    pinned: previous?.pinned || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

function captureMarkerSnapshot(map) {
  return {
    markers: markerRows(map).map(cloneMarker),
    metadata: cloneMarker(map?.markers?.metadata || {}),
    notes: (map?.notes?.notes || []).filter(note => note?.kind === OBJECT_KIND.MARKER).map(cloneObjectNote)
  };
}

function restoreMarkerSnapshot(map, snapshot, constraintBundle = null, featureCapture = null) {
  writeMarkerCollection(map, (snapshot?.markers || []).map(cloneMarker), constraintBundle, featureCapture);
  map.markers.metadata = cloneMarker(snapshot?.metadata || map.markers.metadata);
  for (const note of [...(map?.notes?.notes || [])]) if (note?.kind === OBJECT_KIND.MARKER) deleteObjectNote(map, note.id);
  for (const note of snapshot?.notes || []) restoreObjectNote(map, note);
}

function writeMarkerCollection(map, markers, constraintBundle = null, featureCapture = null) {
  const marketCapture = constraintBundle
    ? {snapshots: mergeLockedDealMarkets(map, constraintBundle.lockedMarkets, constraintBundle.lockedDeals)}
    : captureLockedRegenerationObjects(map, OBJECT_KIND.ECONOMY_MARKET);
  const dealCapture = constraintBundle
    ? {snapshots: constraintBundle.lockedDeals}
    : captureLockedRegenerationObjects(map, OBJECT_KIND.TRADE_FLOW);
  const previousMetadata = map.markers?.metadata || {};
  const normalized = normalizeMarkerIds(markers.map(cloneMarker));
  map.markers = createMarkerResult(normalized);
  map.markers.metadata = {
    ...previousMetadata,
    ...map.markers.metadata,
    stale: false
  };
  if (map.pack) {
    map.pack.markers = normalized;
    if (featureCapture || constraintBundle) assertFeatureLocks(map, constraintBundle, featureCapture, "marker-write");
    refreshMarkerResourceEconomy(map.pack, normalized, {
      lockedStates: constraintBundle?.lockedStates || [],
      lockedProvinces: constraintBundle?.lockedProvinces || []
    });
    if (map.options) {
      map.economy = buildEconomy(map.pack, {
        ...map.options,
        lockedMarkets: marketCapture.snapshots,
        lockedDeals: dealCapture.snapshots,
        lockedStates: constraintBundle?.lockedStates || [],
        lockedProvinces: constraintBundle?.lockedProvinces || []
      });
      if (constraintBundle) constraintBundle.assertDomain(map, "markers-economy", "marker-write");
      else {
        assertLockedRegenerationSnapshots(map, marketCapture);
        assertLockedRegenerationSnapshots(map, dealCapture);
      }
    }
    else refreshPoliticalEconomicPower(map.pack);
  }
}

function captureFeatureLocks(map, constraintBundle = null) {
  if (!constraintBundle) return captureLockedRegenerationObjects(map, OBJECT_KIND.FEATURE);
  const snapshots = constraintBundle.lockedFeatures || [];
  return {
    snapshots,
    ids: new Set(snapshots.map(feature => String(feature?.i ?? feature?.id)))
  };
}

function markerTouchesLockedFeature(map, marker, lockedFeatureIds) {
  const packCell = Number(marker?.packCell ?? marker?.data?.packCell);
  return [
    marker?.feature,
    marker?.data?.feature,
    Number.isInteger(packCell) ? map?.pack?.cells?.f?.[packCell] : null
  ].some(value => lockedFeatureIds.has(String(value)));
}

function assertFeatureLocks(map, constraintBundle, featureCapture, phase) {
  if (constraintBundle) constraintBundle.assertDomain(map, "feature", phase);
  else if (featureCapture) assertLockedRegenerationSnapshots(map, featureCapture);
}

async function markerRegenerationChunk(id, task, {chunks, now, yieldToMain}) {
  const startedAt = now();
  const result = task();
  const blockingMs = Math.max(0, now() - startedAt);
  chunks.push({id, blockingMs: Math.round(blockingMs * 100) / 100});
  await yieldToMain({id, blockingMs});
  return result;
}

function currentTime() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function normalizeMarkerIds(markers) {
  const used = new Set();
  return markers.map(marker => {
    const next = cloneMarker(marker);
    const id = Number(next.id ?? next.i);
    if (!Number.isInteger(id) || id < 0) throw new Error("标记 id 必须是非负整数");
    if (used.has(id)) throw new Error(`标记 id 重复：#${id}`);
    used.add(id);
    next.id = id;
    next.i = id;
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

function findMarker(map, markerId) {
  return markerRows(map).find(marker => marker.id === Number(markerId)) || null;
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

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}

function normalizeCellId(value) {
  if (value === null || value === undefined || value === "") return -1;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : -1;
}

function markerCreationError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}
