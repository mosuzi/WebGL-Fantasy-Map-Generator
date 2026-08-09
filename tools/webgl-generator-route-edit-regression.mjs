#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createEditRouteCommand, inspectRouteEdit} from "../app/webgl-generator/src/runtime/route-edit-commands.js";

const map = generatePlaceholderMap({seed: "route-edit-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const target = findRerouteTarget(map);
assert(target, "固定 seed 应存在可通过陆地改线点重排的路线");

const originalRoute = clone(findRoute(map, target.route.id));
const invalidEndpoint = inspectRouteEdit(map, target.route.id, {toId: 999999});
assert.equal(invalidEndpoint.valid, false);
assert.equal(invalidEndpoint.code, "missing-to-city");
const sameEndpoint = inspectRouteEdit(map, target.route.id, {toId: target.route.from});
assert.equal(sameEndpoint.valid, false);
assert.equal(sameEndpoint.code, "same-city-endpoint");
const waterCell = map.pack.cells.i.find(cell => map.pack.cells.h[cell] < 20);
assert(Number.isInteger(waterCell));
const terrainMismatch = inspectRouteEdit(map, target.route.id, {viaPackCells: [waterCell]});
assert.equal(terrainMismatch.valid, false);
assert.equal(terrainMismatch.code, "terrain-mismatch");
const invalidWaypoint = inspectRouteEdit(map, target.route.id, {viaPackCells: ["not-a-cell"]});
assert.equal(invalidWaypoint.valid, false);
assert.equal(invalidWaypoint.code, "invalid-waypoint");

const preview = inspectRouteEdit(map, target.route.id, target.patch);
assert.equal(preview.valid, true);
assert.equal(preview.changed, true);
assert(preview.path.includes(target.waypoint), "改线结果必须经过指定 waypoint");
assert(preview.path.every((cell, index) => index === 0 || map.pack.cells.c[preview.path[index - 1]].includes(cell)), "改线结果必须保持共享边连续");

const before = routeSnapshot(map, target.route.id);
const economyBefore = clone(map.economy);
const history = new EditHistory();
const command = createEditRouteCommand(target.route.id, target.patch);
history.execute(command, {map});
assert.equal(history.getStats().undo, 1, "一次路线修改只能形成一条历史");
const edited = findRoute(map, target.route.id);
assert.equal(edited.level, target.patch.level);
assert(edited.packCells.includes(target.waypoint));
assert.equal(edited.points.length, edited.packCells.length);
assert.equal(edited.cells.length, edited.packCells.length);
assert.equal(edited.resourceCells, countResourceCells(map, edited.packCells));
assert.deepEqual(map.economy, economyBefore, "路线编辑不应直接重算经济");
assert(map.metadata.derivedStale.systems.includes("economy"), "路线编辑必须把经济派生标脏");
const after = routeSnapshot(map, target.route.id);
assert.notDeepEqual(after, before);

const routeFeature = createMapFeatureGeoJson(map).features.find(feature => feature.properties?.layer === "route" && feature.properties.id === target.route.id);
assert(routeFeature, "要素 GeoJSON 必须包含编辑后的路线");
assert.equal(routeFeature.properties.level, target.patch.level);
assert.equal(routeFeature.properties.cells, edited.cells.length);
assert.equal(routeFeature.geometry.coordinates.length, edited.points.length);

history.undo({map});
assert.deepEqual(routeSnapshot(map, target.route.id), before, "撤销必须恢复路线、拓扑 links 与 stale 摘要");
history.redo({map});
assert.deepEqual(routeSnapshot(map, target.route.id), after, "重做必须恢复相同路线几何与拓扑");

const reconnect = findEndpointReconnect(map, target.route.id);
assert(reconnect, "固定 seed 应存在合法的城市端点重连目标");
const reconnectHistory = new EditHistory();
const reconnectBefore = routeSnapshot(map, target.route.id);
reconnectHistory.execute(createEditRouteCommand(target.route.id, reconnect.patch), {map});
assert.equal(findRoute(map, target.route.id).to, reconnect.city.id);
assert.equal(findRoute(map, target.route.id).packCells.at(-1), reconnect.city.packCell);
assert.equal(reconnectHistory.getStats().undo, 1);
reconnectHistory.undo({map});
assert.deepEqual(routeSnapshot(map, target.route.id), reconnectBefore);

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/RoutePanel.vue", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
const pickingSource = readFileSync(new URL("../app/webgl-generator/src/renderer/picking.js", import.meta.url), "utf8");
assert.match(appSource, /ROUTE_EDIT_WAYPOINT/, "路线改线画布模式未接入");
assert.match(appSource, /setEditWaypoint/, "路线面板未接收画布改线点");
assert.match(appSource, /createEditRouteCommand/, "路线 UI 未共用路线编辑命令");
assert.match(panelSource, /在地图选择改线点[\s\S]*路线编辑预检[\s\S]*应用路线修改/, "路线面板缺少改线、预检或应用入口");
assert.match(consoleSource, /routes\.inspectEdit[\s\S]*routes\.update/, "控制台 API 缺少路线预检或更新方法");
assert.match(pickingSource, /map\?\.settlements\?\.routes[\s\S]*Array\.isArray\(route\?\.points\)/, "路线 picking 未读取编辑后的 points");

console.log(JSON.stringify({
  ok: true,
  routeId: target.route.id,
  waypoint: target.waypoint,
  cells: {before: originalRoute.packCells.length, after: after.route.packCells.length},
  level: {before: originalRoute.level, after: after.route.level},
  reconnect: {to: reconnect.city.id, packCell: reconnect.city.packCell},
  invalid: [invalidEndpoint.code, sameEndpoint.code, terrainMismatch.code, invalidWaypoint.code],
  history: history.getStats(),
  synchronized: {packRoutes: true, cellLinks: true, picking: true, geojson: true, economyStale: true}
}, null, 2));

function findRerouteTarget(targetMap) {
  for (const route of targetMap.settlements.routes || []) {
    if (!route || !["road", "trail"].includes(route.type) || route.from < 0 || route.to < 0 || route.packCells?.length < 3) continue;
    const path = new Set(route.packCells);
    for (const cell of route.packCells.slice(1, -1)) {
      for (const neighbor of targetMap.pack.cells.c[cell] || []) {
        if (path.has(neighbor) || targetMap.pack.cells.h[neighbor] < 20) continue;
        const level = route.level === "primary" ? "secondary" : "primary";
        const patch = {level, viaPackCells: [neighbor]};
        const preview = inspectRouteEdit(targetMap, route.id, patch);
        if (preview.valid && preview.changed && preview.path.includes(neighbor)) return {route, waypoint: neighbor, patch};
      }
    }
  }
  return null;
}

function findEndpointReconnect(targetMap, routeId) {
  const route = findRoute(targetMap, routeId);
  for (const city of targetMap.settlements.cities || []) {
    if (!city || city.removed || city.id === route.from || city.id === route.to || targetMap.pack.cells.h[city.packCell] < 20) continue;
    const patch = {toId: city.id};
    const preview = inspectRouteEdit(targetMap, routeId, patch);
    if (preview.valid && preview.changed) return {city, patch, preview};
  }
  return null;
}

function routeSnapshot(targetMap, routeId) {
  return {
    route: clone(findRoute(targetMap, routeId)),
    packRoutes: clone(targetMap.pack.routes),
    cellRoutes: clone(targetMap.pack.cells.routes),
    metadata: clone(targetMap.settlements.metadata),
    stale: clone(targetMap.metadata.derivedStale || null)
  };
}

function countResourceCells(targetMap, packCells) {
  return packCells.filter(cell => Number(targetMap.pack.cells.good?.[cell]) > 0).length;
}

function findRoute(targetMap, routeId) {
  return targetMap.settlements.routes.find(route => route.id === routeId);
}

function clone(value) {
  return structuredClone(value);
}
