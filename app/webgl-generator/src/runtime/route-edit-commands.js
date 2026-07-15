import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {objectAffected} from "./edit-command-effects.js";
import {MinPriorityQueue} from "../generator/priority-queue.js";

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

const ROUTE_CREATE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["route-mesh", "object-panels", "object-index"])
});

const ROUTE_TYPES = new Set(["road", "trail", "searoute"]);

export function inspectRouteCreation(map, options = {}) {
  const startPackCell = Number(options.startPackCell);
  const endPackCell = Number(options.endPackCell);
  const type = normalizeRouteType(options.type);
  if (!Number.isInteger(startPackCell) || !Number.isInteger(endPackCell)) return invalidCreation("invalid-cell", "路线端点必须是有效 pack cell");
  if (startPackCell === endPackCell) return invalidCreation("same-endpoint", "路线起点和终点不能相同");
  const cells = map?.pack?.cells;
  const count = cells?.i?.length || cells?.h?.length || 0;
  if (startPackCell < 0 || endPackCell < 0 || startPackCell >= count || endPackCell >= count) return invalidCreation("cell-out-of-range", "路线端点超出 pack cells 范围");
  const water = type === "searoute";
  if (isWaterCell(cells, startPackCell) !== water || isWaterCell(cells, endPackCell) !== water) {
    return invalidCreation("terrain-mismatch", water ? "海路端点必须位于水域" : "陆路端点必须位于陆地");
  }
  const path = findRoutePath(map.pack, startPackCell, endPackCell, {water});
  if (path.length < 2) return invalidCreation("unreachable", "端点之间不存在符合地形约束的连通路径");
  const duplicate = (map?.settlements?.routes || []).find(route => route.type === type && samePathEndpoints(route.packCells, path));
  if (duplicate) return invalidCreation("duplicate-route", `已存在相同端点的${type === "searoute" ? "海路" : "陆路"} #${duplicate.id}`);
  return {valid: true, code: "ok", reason: "", type, startPackCell, endPackCell, path, cells: path.length};
}

export function createAddRouteCommand(options = {}) {
  let snapshot = null;
  let created = null;
  const command = {
    label: String(options.label || "绘制路线"),
    domain: OBJECT_KIND.ROUTE,
    effects: {...ROUTE_CREATE_EFFECTS, affected: objectAffected(OBJECT_KIND.ROUTE, "new")},
    apply(context) {
      const preview = inspectRouteCreation(context.map, options);
      if (!preview.valid) throw creationError(preview);
      snapshot ??= captureRouteCreateSnapshot(context.map);
      created ??= buildRoute(context.map, preview);
      readRoutes(context.map).push(cloneRoute(created));
      refreshRouteDerived(context.map);
      markRouteDependentDerivedStale(context.map);
      command.effects.affected = objectAffected(OBJECT_KIND.ROUTE, created.id);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的路线创建快照");
      restoreRouteCreateSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const preview = inspectRouteCreation(context.map, options);
      if (!preview.valid) throw creationError(preview);
      return false;
    },
    getResult() {
      return created ? {routeId: created.id, type: created.type, cells: created.packCells.length, from: created.from, to: created.to} : null;
    }
  };
  return command;
}

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

function findRoutePath(pack, start, end, {water}) {
  const size = pack.cells?.i?.length || pack.cells?.h?.length || 0;
  const best = new Float64Array(size);
  best.fill(Infinity);
  const previous = new Int32Array(size);
  previous.fill(-1);
  const closed = new Uint8Array(size);
  const queue = new MinPriorityQueue();
  best[start] = 0;
  queue.push(start, 0);
  let visited = 0;
  const maxVisited = Math.min(size, 50000);
  while (queue.length && visited < maxVisited) {
    const current = queue.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    visited++;
    if (current === end) return reconstructRoutePath(previous, end);
    for (const neighbor of pack.cells.c?.[current] || []) {
      if (closed[neighbor] || isWaterCell(pack.cells, neighbor) !== water) continue;
      const step = routeStepCost(pack.cells, current, neighbor, water);
      if (!Number.isFinite(step)) continue;
      const tentative = best[current] + step;
      if (tentative >= best[neighbor]) continue;
      best[neighbor] = tentative;
      previous[neighbor] = current;
      queue.push(neighbor, tentative + routeHeuristic(pack.cells, neighbor, end));
    }
  }
  return [];
}

function routeStepCost(cells, current, next, water) {
  const distance = Math.max(0.001, Math.hypot((cells.p?.[next]?.[0] || 0) - (cells.p?.[current]?.[0] || 0), (cells.p?.[next]?.[1] || 0) - (cells.p?.[current]?.[1] || 0)));
  if (water) return distance * (1 + Math.max(0, -Number(cells.t?.[next] || 0)) * 0.15);
  const slope = Math.abs(Number(cells.h?.[next]) - Number(cells.h?.[current]));
  return distance * (1 + slope * 0.08 + (Number(cells.r?.[next]) ? 0.35 : 0));
}

function routeHeuristic(cells, current, end) {
  return Math.hypot((cells.p?.[end]?.[0] || 0) - (cells.p?.[current]?.[0] || 0), (cells.p?.[end]?.[1] || 0) - (cells.p?.[current]?.[1] || 0));
}

function reconstructRoutePath(previous, end) {
  const path = [];
  for (let cell = end; cell >= 0; cell = previous[cell]) path.push(cell);
  return path.reverse();
}

function buildRoute(map, preview) {
  const cells = map.pack.cells;
  const id = nextRouteId(map);
  const start = preview.path[0];
  const end = preview.path.at(-1);
  const from = cityAtPackCell(map, start);
  const to = cityAtPackCell(map, end);
  const resources = countRouteResources(cells, preview.path);
  return {
    id,
    type: preview.type,
    level: preview.type === "trail" ? "trail" : "secondary",
    feature: Number(cells.f?.[start]) || 0,
    state: majorityCellValue(cells, preview.path, "state"),
    province: preview.type === "searoute" ? 0 : majorityCellValue(cells, preview.path, "province"),
    from,
    to,
    cells: preview.path.map(cell => Number(cells.g?.[cell]) || 0),
    packCells: [...preview.path],
    resourceCells: resources.resourceCells,
    markerResourceCells: resources.markerResourceCells,
    resourceGoodIds: resources.goodIds,
    points: preview.path.map(cell => [...(cells.p?.[cell] || [0, 0])])
  };
}

function countRouteResources(cells, path) {
  const goodIds = new Set();
  let resourceCells = 0;
  let markerResourceCells = 0;
  for (const cell of path) {
    const goodId = Number(cells.good?.[cell]) || 0;
    if (!goodId) continue;
    resourceCells++;
    goodIds.add(goodId);
    if ((Number(cells.goodSource?.[cell]) || 0) >= 2) markerResourceCells++;
  }
  return {resourceCells, markerResourceCells, goodIds: [...goodIds].sort((a, b) => a - b)};
}

function majorityCellValue(cells, path, field) {
  const counts = new Map();
  for (const cell of path) {
    const value = Number(cells[field]?.[cell]) || 0;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 0;
}

function cityAtPackCell(map, packCell) {
  const burgId = Number(map.pack?.cells?.burg?.[packCell]) || 0;
  return (map.settlements?.cities || []).find(city => !city?.removed && (Number(city.packCell) === packCell || Number(city.burgId) === burgId))?.id ?? -1;
}

function nextRouteId(map) {
  return (map.settlements?.routes || []).reduce((max, route) => Math.max(max, Number(route?.id) || 0), -1) + 1;
}

function captureRouteCreateSnapshot(map) {
  return {
    routes: cloneRoute(map.settlements?.routes || []),
    metadata: cloneRoute(map.settlements?.metadata || {}),
    packRoutes: cloneRoute(map.pack?.routes || []),
    cellRoutes: cloneRoute(map.pack?.cells?.routes || {}),
    stale: cloneRoute(map.metadata?.derivedStale || null)
  };
}

function restoreRouteCreateSnapshot(map, snapshot) {
  map.settlements.routes = cloneRoute(snapshot.routes);
  map.settlements.metadata = cloneRoute(snapshot.metadata);
  map.pack.routes = cloneRoute(snapshot.packRoutes);
  map.pack.cells.routes = cloneRoute(snapshot.cellRoutes);
  if (snapshot.stale) map.metadata.derivedStale = cloneRoute(snapshot.stale);
  else delete map.metadata.derivedStale;
}

function markRouteDependentDerivedStale(map) {
  if (!map?.metadata) return;
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), "economy", "military", "diplomacy"])],
    updatedAt: new Date().toISOString()
  };
}

function normalizeRouteType(value) {
  const type = String(value || "road").trim().toLowerCase();
  return ROUTE_TYPES.has(type) ? type : "road";
}

function isWaterCell(cells, cell) {
  return Number(cells?.h?.[cell]) < 20;
}

function samePathEndpoints(left = [], right = []) {
  if (!left.length || !right.length) return false;
  return left[0] === right[0] && left.at(-1) === right.at(-1) || left[0] === right.at(-1) && left.at(-1) === right[0];
}

function invalidCreation(code, reason) {
  return {valid: false, code, reason, path: [], cells: 0};
}

function creationError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
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
