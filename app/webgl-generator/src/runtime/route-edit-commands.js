import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {objectAffected} from "./edit-command-effects.js";

const ROUTE_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

const ROUTE_DELETE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["route-mesh", "object-panels", "object-index"])
});

export function createSetRouteNoteCommand(routeId, body, {name = ""} = {}) {
  const normalizedRouteId = Number(routeId);
  const target = {kind: OBJECT_KIND.ROUTE, id: normalizedRouteId};
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑路线备注 #${normalizedRouteId}` : `清空路线备注 #${normalizedRouteId}`,
    domain: OBJECT_KIND.ROUTE,
    effects: {
      ...ROUTE_NOTE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.ROUTE, normalizedRouteId)
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

export function createDeleteRouteCommand(routeId, {label = "删除路线"} = {}) {
  const normalizedRouteId = Number(routeId);
  const target = {kind: OBJECT_KIND.ROUTE, id: normalizedRouteId};
  let previousRoute = null;
  let previousIndex = -1;
  let previousNote = null;

  return {
    label: `${label} #${normalizedRouteId}`,
    domain: OBJECT_KIND.ROUTE,
    effects: {
      ...ROUTE_DELETE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.ROUTE, normalizedRouteId)
    },
    apply(context) {
      const routes = readRoutes(context.map);
      const index = routes.findIndex(route => route.id === normalizedRouteId);
      if (index < 0) throw new Error(`找不到路线 #${normalizedRouteId}`);
      previousRoute ??= cloneRoute(routes[index]);
      previousIndex = index;
      previousNote ??= cloneObjectNote(readObjectNote(context.map, target));
      routes.splice(index, 1);
      deleteObjectNote(context.map, target);
      refreshRouteDerived(context.map);
    },
    revert(context) {
      const routes = readRoutes(context.map);
      if (!previousRoute || routes.some(route => route.id === normalizedRouteId)) return;
      const insertAt = Math.max(0, Math.min(previousIndex, routes.length));
      routes.splice(insertAt, 0, cloneRoute(previousRoute));
      if (previousNote) restoreObjectNote(context.map, previousNote);
      refreshRouteDerived(context.map);
    },
    isNoop(context) {
      return !findRoute(context.map, normalizedRouteId);
    }
  };
}

function findRoute(map, routeId) {
  return (map?.settlements?.routes || []).find(route => route.id === routeId) || null;
}

function readRoutes(map) {
  const routes = map?.settlements?.routes;
  if (!Array.isArray(routes)) throw new Error("当前地图没有路线列表");
  return routes;
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

function cloneRoute(route) {
  return JSON.parse(JSON.stringify(route));
}

function refreshRouteDerived(map) {
  const routes = map?.settlements?.routes || [];
  if (map?.settlements?.metadata) {
    const routeResources = routeResourceStats(routes);
    map.settlements.metadata.routes = routes.length;
    map.settlements.metadata.routeSegments = routes.reduce((sum, route) => sum + Math.max(0, (route.points || []).length - 1), 0);
    map.settlements.metadata.routeResourceCells = routeResources.resourceCells;
    map.settlements.metadata.routeMarkerResourceCells = routeResources.markerResourceCells;
    map.settlements.metadata.routesWithResources = routeResources.routesWithResources;
  }
  if (map?.pack) {
    map.pack.routes = packRouteArray(routes);
    if (map.pack.cells) map.pack.cells.routes = buildPackRouteLinks(routes);
  }
}

function routeResourceStats(routes) {
  let resourceCells = 0;
  let markerResourceCells = 0;
  let routesWithResources = 0;
  for (const route of routes || []) {
    const routeResourceCells = Number(route.resourceCells || 0);
    resourceCells += routeResourceCells;
    markerResourceCells += Number(route.markerResourceCells || 0);
    if (routeResourceCells > 0) routesWithResources++;
  }
  return {resourceCells, markerResourceCells, routesWithResources};
}

function packRouteArray(routes) {
  const items = [];
  for (const route of routes || []) {
    const id = Number(route.id);
    if (!Number.isInteger(id) || id < 0) continue;
    items[id] = {
      i: route.id,
      group: route.type === "road" ? "roads" : route.type === "trail" ? "trails" : "searoutes",
      feature: route.feature,
      state: route.state,
      province: route.province,
      resourceCells: route.resourceCells || 0,
      markerResourceCells: route.markerResourceCells || 0,
      points: (route.points || []).map((point, index) => [point[0], point[1], route.packCells?.[index]])
    };
  }
  return items;
}

function buildPackRouteLinks(routes) {
  const links = {};
  for (const route of routes || []) {
    const packCells = route.packCells || [];
    for (let index = 0; index < packCells.length - 1; index++) {
      const from = packCells[index];
      const to = packCells[index + 1];
      if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
      if (!links[from]) links[from] = {};
      if (!links[to]) links[to] = {};
      links[from][to] = route.id;
      links[to][from] = route.id;
    }
  }
  return links;
}
