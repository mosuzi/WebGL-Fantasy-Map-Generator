import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {REGENERATION_WORKER_KINDS, regenerateMapAttributeForWorker} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const matrix = {};
for (const kind of REGENERATION_WORKER_KINDS) {
  const map = generatePlaceholderMap({seed: `task-345-${kind}`, cellsTarget: 1800, heightmapTemplate: "continents"});
  const beforeObjects = targetObjects(map, kind);
  const beforeFingerprint = targetFingerprint(map, kind);
  if (kind === "military") injectOldMilitaryEvent(map);
  if (kind === "zones") injectManualZone(map);
  const result = regenerateMapAttributeForWorker(map, kind, {scope: "all"});
  assert.equal(result.executed, true, `${kind} 完全重算未执行`);
  const afterObjects = new Set(targetObjects(map, kind));
  const reused = beforeObjects.filter(object => object && afterObjects.has(object));
  assert.deepEqual(reused, [], `${kind} 重算直接复用了未锁旧目标对象`);
  if (kind === "military") assert.equal((map.military?.events || []).some(event => event?.id === "task-345-old-event"), false, "军事重算仍保留旧战斗事件");
  if (kind === "zones") assert.equal((map.zones?.zones || []).some(zone => zone?.name === "task-345-manual-zone"), false, "地区重算仍默认保留手工地区");
  matrix[kind] = {
    beforeObjects: beforeObjects.length,
    afterObjects: afterObjects.size,
    reused: reused.length,
    changed: targetFingerprint(map, kind) !== beforeFingerprint
  };
}

assertMarkerCountDoesNotUseOldTarget();
assertStateCountDoesNotUseOldCapitals();

console.log(JSON.stringify({ok: true, matrix, oldTargetIndependence: {markers: true, states: true}}, null, 2));

function targetObjects(map, kind) {
  const active = rows => (rows || []).filter(item => item && !item.removed);
  const targets = {
    features: () => active(map.pack?.features).filter(feature => feature.i),
    routes: () => active(map.settlements?.routes),
    rivers: () => active(map.rivers?.rivers),
    cities: () => active(map.settlements?.cities),
    states: () => active(map.politics?.states).filter(state => state.i),
    provinces: () => active(map.politics?.provinces).filter(province => province.i),
    markers: () => active(map.markers?.markers).filter(marker => marker.category === "resource"),
    diplomacy: () => active(map.politics?.states).flatMap(state => Array.isArray(state.diplomacy) ? [state.diplomacy] : []),
    religions: () => active(map.society?.religions).filter(religion => religion.i),
    military: () => active(map.pack?.states).flatMap(state => active(state.military)),
    zones: () => active(map.zones?.zones)
  };
  return targets[kind]();
}

function targetFingerprint(map, kind) {
  return JSON.stringify(targetObjects(map, kind));
}

function injectOldMilitaryEvent(map) {
  const event = {id: "task-345-old-event", sequence: 999999, type: "battle", summary: "旧事件不得保留"};
  map.military.events = [...(map.military.events || []), event];
  map.military.metadata = {...map.military.metadata, events: map.military.events.length, eventSequence: 999999};
  map.pack.military = map.military;
}

function injectManualZone(map) {
  const cell = (map.pack?.cells?.i || []).find(index => Number(map.pack.cells.h[index]) >= 20);
  const zone = {i: 65530, id: 65530, name: "task-345-manual-zone", source: "manual", category: "custom", cells: [cell]};
  map.zones.zones = [...(map.zones.zones || []), zone];
  map.pack.zones = map.zones.zones;
}

function assertMarkerCountDoesNotUseOldTarget() {
  const base = generatePlaceholderMap({seed: "task-345-marker-count", cellsTarget: 2200, heightmapTemplate: "continents"});
  const inflated = structuredClone(base);
  const resources = (inflated.markers?.markers || []).filter(marker => marker?.category === "resource");
  const copies = Array.from({length: 20}, (_, index) => ({...structuredClone(resources[index % resources.length]), id: 50000 + index, i: 50000 + index}));
  inflated.markers.markers.push(...copies);
  inflated.pack.markers = inflated.markers.markers;
  regenerateMapAttributeForWorker(base, "markers", {scope: "all"});
  regenerateMapAttributeForWorker(inflated, "markers", {scope: "all"});
  const count = map => (map.markers?.markers || []).filter(marker => marker?.category === "resource").length;
  assert.equal(count(inflated), count(base), "资源点重算数量仍受旧资源点数量影响");
}

function assertStateCountDoesNotUseOldCapitals() {
  const base = generatePlaceholderMap({seed: "task-345-state-count", cellsTarget: 2200, heightmapTemplate: "continents"});
  const inflated = structuredClone(base);
  for (const burg of inflated.pack?.burgs || []) if (burg?.i && !burg.removed) burg.capital = 1;
  for (const city of inflated.settlements?.cities || []) if (city && !city.removed) city.capital = true;
  regenerateMapAttributeForWorker(base, "states", {scope: "all"});
  regenerateMapAttributeForWorker(inflated, "states", {scope: "all"});
  const count = map => (map.politics?.states || []).filter(state => state?.i && !state.removed).length;
  assert.equal(count(inflated), count(base), "国家重算数量仍受旧首都标记数量影响");
}
