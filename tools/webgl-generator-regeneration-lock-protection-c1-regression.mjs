import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildZones} from "../app/webgl-generator/src/generator/zones.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createRegenerateResourceMarkersCommand,
  regenerateResourceMarkersInChunks
} from "../app/webgl-generator/src/runtime/marker-edit-commands.js";
import {createRegenerateOceanCurrentsCommand} from "../app/webgl-generator/src/runtime/ocean-current-edit-commands.js";
import {
  allRegenerationObjectsLocked,
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";
import {captureRegenerationConstraintBundle} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";

const fixture = generatePlaceholderMap({seed: "regeneration-lock-c1", cellsTarget: 10000});
assert.ok(fixture.markers.markers.filter(marker => marker.category === "resource").length > 1, "固定图缺少资源点对照");
assert.ok(fixture.zones.zones.length > 1, "固定图缺少地区对照");
assert.ok(fixture.oceanCurrents.currents.length > 1, "固定图缺少洋流对照");

const markerResult = verifyMarkerProtection(structuredClone(fixture));
const zoneResult = verifyZoneProtection(structuredClone(fixture));
const currentResult = verifyOceanCurrentProtection(structuredClone(fixture));
const markerRollback = await verifyChunkedMarkerRollback(structuredClone(fixture));
const featureMarker = await verifyFeatureMarkerProtection(structuredClone(fixture));

console.log(JSON.stringify({ok: true, marker: markerResult, zone: zoneResult, oceanCurrent: currentResult, markerRollback, featureMarker}, null, 2));

function verifyMarkerProtection(map) {
  const resources = map.markers.markers.filter(marker => marker.category === "resource");
  const locked = resources[0];
  map.regenerationLocks = store([{kind: "marker", id: locked.id}]);
  const capture = captureLockedRegenerationObjects(map, "marker");
  const beforeUnlocked = stable(resources.slice(1));
  const history = new EditHistory();
  history.execute(createRegenerateResourceMarkersCommand({salt: 41}), {map});
  assertLockedRegenerationSnapshots(map, capture);
  const afterUnlocked = stable(map.markers.markers.filter(marker => marker.category === "resource" && marker.id !== locked.id));
  assert.notEqual(afterUnlocked, beforeUnlocked, "未锁资源点没有变化");
  assert.deepEqual(map.pack.markers.find(marker => marker.id === locked.id), capture.snapshots[0], "资源点 pack 镜像没有保持");

  const allLockedMap = structuredClone(map);
  const allResources = allLockedMap.markers.markers.filter(marker => marker.category === "resource");
  allLockedMap.regenerationLocks = store(allResources.map(marker => ({kind: "marker", id: marker.id})));
  const normalUnlocked = allLockedMap.markers.markers.some(marker => marker.category !== "resource");
  assert.equal(normalUnlocked, true, "夹具需要保留未锁普通 marker");
  const command = createRegenerateResourceMarkersCommand({salt: 42});
  const checksum = stable(allLockedMap);
  const historyBefore = history.getStats().undo;
  assert.equal(command.isNoop({map: allLockedMap}), true, "资源点全锁没有成为 no-op");
  assert.equal(stable(allLockedMap), checksum, "资源点全锁预检改写了地图");
  assert.equal(history.getStats().undo, historyBefore, "资源点全锁推进了历史");
  return {lockedId: locked.id, changed: true, allLockedNoop: true};
}

function verifyZoneProtection(map) {
  const locked = map.zones.zones[0];
  map.regenerationLocks = store([{kind: "zone", id: locked.i}]);
  const capture = captureLockedRegenerationObjects(map, "zone");
  const beforeUnlocked = stable(map.zones.zones.slice(1));
  map.zones = buildZones(map.pack, {
    ...map.options,
    seed: `${map.options.seed}:c1-zones`,
    preservedZones: capture.snapshots
  });
  assertLockedRegenerationSnapshots(map, capture);
  assert.deepEqual(map.pack.zones.find(zone => zone.i === locked.i), capture.snapshots[0], "地区 pack 镜像没有保持");
  assert.notEqual(stable(map.zones.zones.filter(zone => zone.i !== locked.i)), beforeUnlocked, "未锁地区没有变化");

  const allLockedMap = structuredClone(map);
  allLockedMap.regenerationLocks = store(allLockedMap.zones.zones.map(zone => ({kind: "zone", id: zone.i})));
  const checksum = stable(allLockedMap);
  assert.equal(allRegenerationObjectsLocked(allLockedMap, "zone", allLockedMap.zones.zones), true, "地区全锁没有成为 no-op");
  assert.equal(stable(allLockedMap), checksum, "地区全锁预检改写了地图");
  return {lockedId: locked.i, changed: true, allLockedNoop: true};
}

function verifyOceanCurrentProtection(map) {
  const locked = map.oceanCurrents.currents[0];
  map.regenerationLocks = store([{kind: "ocean-current", id: locked.id}]);
  const capture = captureLockedRegenerationObjects(map, "ocean-current");
  const beforeUnlocked = stable(map.oceanCurrents.currents.slice(1));
  const history = new EditHistory();
  history.execute(createRegenerateOceanCurrentsCommand(map, {seed: "regeneration-lock-c1:currents-next"}), {map});
  assertLockedRegenerationSnapshots(map, capture);
  assert.notEqual(stable(map.oceanCurrents.currents.filter(current => current.id !== locked.id)), beforeUnlocked, "未锁洋流没有变化");

  const allLockedMap = structuredClone(map);
  allLockedMap.regenerationLocks = store(allLockedMap.oceanCurrents.currents.map(current => ({kind: "ocean-current", id: current.id})));
  const command = createRegenerateOceanCurrentsCommand(allLockedMap, {seed: "regeneration-lock-c1:currents-noop"});
  const checksum = stable(allLockedMap);
  const historyBefore = history.getStats().undo;
  assert.equal(command.isNoop({map: allLockedMap}), true, "洋流全锁没有成为 no-op");
  assert.equal(stable(allLockedMap), checksum, "洋流全锁预检改写了地图");
  assert.equal(history.getStats().undo, historyBefore, "洋流全锁推进了历史");
  return {lockedId: locked.id, changed: true, allLockedNoop: true};
}

async function verifyChunkedMarkerRollback(map) {
  const before = stable({
    markers: map.markers,
    pack: map.pack,
    politics: map.politics,
    economy: map.economy
  });
  await assert.rejects(
    regenerateResourceMarkersInChunks(map, {
      salt: 77,
      yieldToMain: ({id}) => {
        if (id === "write-markers") throw new Error("injected marker rollback failure");
      }
    }),
    /injected marker rollback failure/
  );
  assert.equal(stable({
    markers: map.markers,
    pack: map.pack,
    politics: map.politics,
    economy: map.economy
  }), before, "资源点分块重算故障后没有完整回滚");
  return {injectedAt: "write-markers", restored: true};
}

async function verifyFeatureMarkerProtection(fixtureMap) {
  const lockedFeatureId = selectMarkerFeatureId(fixtureMap);
  const directMap = structuredClone(fixtureMap);
  directMap.regenerationLocks = store([{kind: "feature", id: lockedFeatureId}]);
  const directCapture = captureLockedRegenerationObjects(directMap, "feature");
  const directBefore = featureMarkerEnvelope(directMap, lockedFeatureId);
  new EditHistory().execute(createRegenerateResourceMarkersCommand({salt: 91}), {map: directMap});
  assertLockedRegenerationSnapshots(directMap, directCapture);
  assert.equal(featureMarkerEnvelope(directMap, lockedFeatureId), directBefore, "同步资源点重算改写锁定 feature 的 marker 引用");

  const chunkMap = structuredClone(fixtureMap);
  chunkMap.regenerationLocks = store([{kind: "feature", id: lockedFeatureId}]);
  const bundle = captureRegenerationConstraintBundle(chunkMap, {closure: ["world"]});
  const chunkBefore = featureMarkerEnvelope(chunkMap, lockedFeatureId);
  const chunked = await regenerateResourceMarkersInChunks(chunkMap, {
    salt: 92,
    constraintBundle: bundle
  });
  assert.equal(chunked.executed, true, "分块资源点重算未执行");
  bundle.assertDomain(chunkMap, "feature", "after");
  assert.equal(featureMarkerEnvelope(chunkMap, lockedFeatureId), chunkBefore, "分块资源点重算改写锁定 feature 的 marker 引用");

  return {
    featureId: lockedFeatureId,
    markers: JSON.parse(directBefore).length,
    directFallbackProtected: true,
    chunkBundleProtected: true
  };
}

function selectMarkerFeatureId(map) {
  const candidate = map.markers.markers.find(marker => {
    const featureId = Number(marker?.data?.feature);
    return marker?.category === "resource"
      && Number.isInteger(featureId)
      && map.pack.features?.[featureId];
  });
  assert(candidate, "固定图缺少可锁定 feature 的资源点样本");
  return Number(candidate.data.feature);
}

function featureMarkerEnvelope(map, featureId) {
  return stable((map.markers?.markers || [])
    .filter(marker => Number(marker?.data?.feature) === featureId)
    .map(marker => structuredClone(marker)));
}

function store(entries) {
  return {version: 1, entries};
}

function stable(value) {
  return JSON.stringify(value);
}
