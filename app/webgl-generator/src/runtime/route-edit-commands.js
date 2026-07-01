import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";

const ROUTE_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

export function createSetRouteNoteCommand(routeId, body, {name = ""} = {}) {
  const normalizedRouteId = Number(routeId);
  const target = {kind: OBJECT_KIND.ROUTE, id: normalizedRouteId};
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑路线备注 #${normalizedRouteId}` : `清空路线备注 #${normalizedRouteId}`,
    effects: {
      ...ROUTE_NOTE_EFFECTS,
      affected: [{kind: OBJECT_KIND.ROUTE, id: normalizedRouteId}]
    },
    apply(context) {
      const route = findRoute(context.map, normalizedRouteId);
      if (!route) throw new Error(`找不到路线 #${normalizedRouteId}`);
      previous ??= cloneObjectNote(readObjectNote(context.map, target));
      if (!normalizedBody) {
        deleteObjectNote(context.map, target);
        return;
      }
      next ??= createRouteNoteSnapshot(target, normalizedBody, {
        name: name || routeName(context.map, route) || `路线 #${normalizedRouteId}`,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, target);
    },
    isNoop(context) {
      const route = findRoute(context.map, normalizedRouteId);
      if (!route) return true;
      const current = readObjectNote(context.map, target)?.body || "";
      return current === normalizedBody;
    }
  };
}

function findRoute(map, routeId) {
  return (map?.settlements?.routes || []).find(route => route.id === routeId) || null;
}

function routeName(map, route) {
  const from = map?.settlements?.cities?.[route.from]?.name || (route.from >= 0 ? `#${route.from}` : "");
  const to = map?.settlements?.cities?.[route.to]?.name || (route.to >= 0 ? `#${route.to}` : "");
  if (from && to) return `${from} -> ${to}`;
  return "";
}

function createRouteNoteSnapshot(target, body, {name, previous = null} = {}) {
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

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}
