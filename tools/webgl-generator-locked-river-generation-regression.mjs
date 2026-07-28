import assert from "node:assert/strict";
import fs from "node:fs";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  assertFrozenRiverState,
  prepareRiverRegenerationLocks
} from "../app/webgl-generator/src/generator/river-regeneration-locks.js";
import {buildRivers} from "../app/webgl-generator/src/generator/rivers.js";

const fixture = generatePlaceholderMap({seed: "locked-river-generation", cellsTarget: 10000});
const root = fixture.rivers.rivers.find(river => !river.parent && ["ocean", "border"].includes(river.outletKind));
assert.ok(root, "固定图缺少合法入海或出界干流");

const lockedMap = structuredClone(fixture);
const lockedRoot = lockedMap.pack.rivers.find(river => river.i === root.i);
const relatedLake = lockedMap.pack.features.find(feature => feature?.type === "lake" && (
  [feature.river, feature.outlet, ...(feature.inlets || [])]
    .map(Number)
    .some(id => id && lockedMap.pack.rivers.some(river => river.i === id))
));
const lockedSnapshots = [structuredClone(lockedRoot)];
if (relatedLake) {
  const lakeRiverId = [relatedLake.river, relatedLake.outlet, ...(relatedLake.inlets || [])]
    .map(Number)
    .find(id => id && lockedMap.pack.rivers.some(river => river.i === id));
  if (lakeRiverId && lakeRiverId !== root.i) lockedSnapshots.push(structuredClone(lockedMap.pack.rivers.find(river => river.i === lakeRiverId)));
}
const cellSnapshots = captureCells(lockedMap.pack.cells, lockedSnapshots);
const lakeSnapshots = captureFrozenLakeEdges(lockedMap.pack.features, new Set(lockedSnapshots.map(river => river.i)));
const beforeUnlocked = stable(lockedMap.pack.rivers.filter(river => !lockedSnapshots.some(locked => locked.i === river.i)));

const regenerated = buildRivers(lockedMap.grid, lockedMap.features, lockedMap.pack, {
  ...lockedMap.options,
  riverRegenerationSalt: 77,
  lockedRivers: lockedSnapshots
});
for (const locked of lockedSnapshots) {
  assert.deepEqual(regenerated.rivers.find(river => river.i === locked.i), locked, `锁定河流 #${locked.i} 快照变化`);
}
assertCells(lockedMap.pack.cells, cellSnapshots);
assertFrozenLakeEdges(lockedMap.pack.features, lakeSnapshots);
assert.notEqual(
  stable(regenerated.rivers.filter(river => !lockedSnapshots.some(locked => locked.i === river.i))),
  beforeUnlocked,
  "未锁河流没有随扰动变化"
);
const frozenCells = new Set(cellSnapshots.keys());
const frozenIds = new Set(lockedSnapshots.map(river => river.i));
assert.equal(
  regenerated.rivers.some(river => !frozenIds.has(river.i) && (river.cells || []).some(cell => frozenCells.has(cell))),
  false,
  "新河路径进入了冻结河流 cell"
);
assertHydrologyReferences(lockedMap.pack, regenerated.rivers);

const branchMap = structuredClone(fixture);
const branch = branchMap.pack.rivers.find(river => river.parent && branchMap.pack.rivers.some(parent => parent.i === river.parent));
assert.ok(branch, "固定图缺少合法支流");
const parentBefore = structuredClone(branchMap.pack.rivers.find(river => river.i === branch.parent));
const branchBefore = structuredClone(branch);
const branchResult = buildRivers(branchMap.grid, branchMap.features, branchMap.pack, {
  ...branchMap.options,
  riverRegenerationSalt: 78,
  lockedRivers: [branchBefore]
});
assert.deepEqual(branchResult.rivers.find(river => river.i === branchBefore.i), branchBefore, "锁定支流变化");
assert.deepEqual(branchResult.rivers.find(river => river.i === parentBefore.i), parentBefore, "锁定支流的父链支撑河流变化");

const sparseMap = structuredClone(fixture);
const sparse = sparseMap.pack.rivers.find(river => !river.parent && ["ocean", "border"].includes(river.outletKind));
const oldId = sparse.i;
const sparseId = 60000;
sparse.id = sparse.i = sparse.basin = sparseId;
for (const cell of sparse.cells) if (cell >= 0 && sparseMap.pack.cells.r[cell] === oldId) sparseMap.pack.cells.r[cell] = sparseId;
for (const lake of sparseMap.pack.features.filter(feature => feature?.type === "lake")) {
  if (Number(lake.river) === oldId) lake.river = sparseId;
  if (Number(lake.outlet) === oldId) lake.outlet = sparseId;
  if (lake.inlets) lake.inlets = lake.inlets.map(id => Number(id) === oldId ? sparseId : id);
}
const sparseSnapshot = structuredClone(sparse);
const sparseResult = buildRivers(sparseMap.grid, sparseMap.features, sparseMap.pack, {
  ...sparseMap.options,
  riverRegenerationSalt: 79,
  lockedRivers: [sparseSnapshot]
});
assert.deepEqual(sparseResult.rivers.find(river => river.i === sparseId), sparseSnapshot, "稀疏高 ID 锁定河流变化");
assert.equal(sparseResult.rivers.filter(river => river.i === sparseId).length, 1, "稀疏高 ID 被新河复用");

const scaleMirrorResults = [
  verifyScaleLakeMirror(50000, "regeneration-lock-stage-f-scale-valid-50000-v9"),
  verifyScaleLakeMirror(100000, "regeneration-lock-stage-f-scale-valid-100000-v3")
];

assertConflict(() => {
  const map = structuredClone(fixture);
  const river = structuredClone(root);
  river.cells[1] = map.pack.cells.i.find(cell => !(map.pack.cells.c[river.cells[0]] || []).includes(cell) && cell !== river.cells[0]);
  buildRivers(map.grid, map.features, map.pack, {...map.options, lockedRivers: [river]});
}, "不连续锁河路径没有拒绝");

assertConflict(() => {
  const map = structuredClone(fixture);
  const river = structuredClone(root);
  map.pack.cells.h[river.source] = 10;
  buildRivers(map.grid, map.features, map.pack, {...map.options, lockedRivers: [river]});
}, "锁河源头变为水域没有拒绝");

assertConflict(() => {
  const map = structuredClone(fixture);
  const river = structuredClone(branch);
  river.parent = 9999;
  buildRivers(map.grid, map.features, map.pack, {...map.options, lockedRivers: [river]});
}, "锁定支流父链冲突没有拒绝");

assertConflict(() => {
  const map = structuredClone(fixture);
  const river = structuredClone(map.pack.rivers.find(item => item.outletKind === "lake"));
  assert.ok(river, "固定图缺少入湖河流");
  river.outletFeatureId = 9999;
  buildRivers(map.grid, map.features, map.pack, {...map.options, lockedRivers: [river]});
}, "锁定河流湖泊引用冲突没有拒绝");

console.log(JSON.stringify({
  ok: true,
  lockedRoot: root.i,
  lockedRivers: lockedSnapshots.length,
  frozenCells: cellSnapshots.size,
  lakeReferences: lakeSnapshots.reduce((sum, lake) => sum + lake.inlets.length + Boolean(lake.river) + Boolean(lake.outlet), 0),
  branch: branch.i,
  parent: branch.parent,
  sparseId,
  scaleMirrorResults
}, null, 2));

function verifyScaleLakeMirror(cellsTarget, seed) {
  const map = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  const lockedRiver = findLakeBoundRiver(map) || map.rivers.rivers.find(Boolean);
  assert.ok(lockedRiver, `${cellsTarget} cells 固定图缺少锁河样本`);
  const lockedContext = prepareRiverRegenerationLocks(map.pack, [structuredClone(lockedRiver)]);
  assertFrozenRiverState(map.pack, map.rivers.rivers, lockedContext);
  const frozenBefore = new Map(lockedContext.frozenRivers.map(river => [Number(river.i ?? river.id), structuredClone(river)]));
  const result = buildRivers(map.grid, map.features, map.pack, {
    ...map.options,
    seed: `stage-f-world-${cellsTarget}`,
    riverRegenerationSalt: `stage-f-world-${cellsTarget}:world-rivers`,
    lockedRivers: [structuredClone(lockedRiver)]
  });
  assertHydrologyReferences(map.pack, result.rivers);
  for (const [id, snapshot] of frozenBefore) {
    assert.deepEqual(result.rivers.find(river => Number(river.i ?? river.id) === id), snapshot, `${cellsTarget} cells 锁河支撑 #${id} 快照变化`);
  }
  assertParentBasinReferences(result.rivers, cellsTarget);
  return {
    cellsTarget,
    seed,
    lockedRiver: Number(lockedRiver.i ?? lockedRiver.id),
    frozenRivers: frozenBefore.size,
    rivers: result.rivers.length,
    lakes: map.pack.features.filter(feature => feature?.type === "lake").length
  };
}

function findLakeBoundRiver(map) {
  const rivers = map.rivers.rivers || [];
  for (const lake of (map.pack.features || []).filter(feature => feature?.type === "lake")) {
    const lakeId = Number(lake.i ?? lake.id);
    for (const inletId of lake.inlets || []) {
      const river = rivers.find(item => Number(item?.i ?? item?.id) === Number(inletId));
      if (river?.outletKind === "lake" && Number(river.outletFeatureId) === lakeId) return river;
    }
  }
  return null;
}

function assertParentBasinReferences(rivers, cellsTarget) {
  const byId = new Map(rivers.map(river => [Number(river.i ?? river.id), river]));
  for (const river of rivers) {
    const id = Number(river.i ?? river.id);
    const parent = Number(river.parent || 0);
    const basin = Number(river.basin || id);
    if (parent) assert.ok(parent !== id && byId.has(parent), `${cellsTarget} cells 河流 #${id} parent #${parent} 无效`);
    assert.ok(byId.has(basin), `${cellsTarget} cells 河流 #${id} basin #${basin} 无效`);
  }
}

function captureCells(cells, rivers) {
  const result = new Map();
  for (const river of rivers) {
    for (const cell of river.cells || []) {
      if (cell < 0 || result.has(cell)) continue;
      result.set(cell, {r: Number(cells.r[cell]), fl: Number(cells.fl[cell]), conf: Number(cells.conf[cell])});
    }
  }
  return result;
}

function assertCells(cells, snapshots) {
  for (const [cell, before] of snapshots) {
    assert.deepEqual({r: Number(cells.r[cell]), fl: Number(cells.fl[cell]), conf: Number(cells.conf[cell])}, before, `锁河 cell #${cell} 水文值变化`);
  }
}

function captureFrozenLakeEdges(features, ids) {
  return features.filter(feature => feature?.type === "lake" && (
    ids.has(Number(feature.river)) || ids.has(Number(feature.outlet)) || (feature.inlets || []).some(id => ids.has(Number(id)))
  )).map(feature => ({
    id: Number(feature.i ?? feature.id),
    river: ids.has(Number(feature.river)) ? Number(feature.river) : 0,
    outlet: ids.has(Number(feature.outlet)) ? Number(feature.outlet) : 0,
    inlets: (feature.inlets || []).map(Number).filter(id => ids.has(id))
  }));
}

function assertFrozenLakeEdges(features, snapshots) {
  for (const snapshot of snapshots) {
    const lake = features.find(feature => Number(feature?.i ?? feature?.id) === snapshot.id);
    assert.ok(lake, `冻结河流关联湖泊 #${snapshot.id} 丢失`);
    if (snapshot.river) assert.equal(Number(lake.river), snapshot.river, `湖泊 #${snapshot.id} 冻结 river 引用变化`);
    if (snapshot.outlet) assert.equal(Number(lake.outlet), snapshot.outlet, `湖泊 #${snapshot.id} 冻结 outlet 引用变化`);
    for (const inlet of snapshot.inlets) assert.ok((lake.inlets || []).map(Number).includes(inlet), `湖泊 #${snapshot.id} 冻结 inlet #${inlet} 丢失`);
  }
}

function assertHydrologyReferences(pack, rivers) {
  const byId = new Map(rivers.map(river => [Number(river.i), river]));
  for (const cell of pack.cells.i) {
    const id = Number(pack.cells.r[cell]);
    assert.ok(!id || byId.has(id), `cell #${cell} 留下无对象河流 ID #${id}`);
    assert.ok(Number.isFinite(Number(pack.cells.fl[cell])) && Number(pack.cells.fl[cell]) >= 0, `cell #${cell} 水文通量无效`);
  }
  for (const lake of pack.features.filter(feature => feature?.type === "lake")) {
    for (const inlet of lake.inlets || []) {
      const river = byId.get(Number(inlet));
      assert.ok(river && river.outletKind === "lake" && Number(river.outletFeatureId) === Number(lake.i), `湖泊 #${lake.i} 绑定了无效入流 #${inlet}`);
    }
  }
}

function assertConflict(run, message) {
  assert.throws(run, error => error?.code === "regeneration_lock_conflict", message);
}

function stable(value) {
  return JSON.stringify(value);
}

const riversSource = fs.readFileSync(new URL("../app/webgl-generator/src/generator/rivers.js", import.meta.url), "utf8");
const lockSource = fs.readFileSync(new URL("../app/webgl-generator/src/generator/river-regeneration-locks.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const protectionSource = fs.readFileSync(new URL("../app/webgl-generator/src/runtime/regeneration-lock-protection.js", import.meta.url), "utf8");
assert.doesNotMatch(riversSource, /replaceFrozenRiverObjects|restoreFrozenRiverCells|restoreFrozenLakeReferences/, "河流锁仍依赖生成后覆盖");
assert.doesNotMatch(lockSource, /export function (replaceFrozenRiverObjects|restoreFrozenRiverCells|restoreFrozenLakeReferences)/, "锁 helper 仍暴露末尾恢复入口");
assert.match(appSource, /function regenerateRivers[\s\S]*allRegenerationObjectsLocked\(map, OBJECT_KIND\.RIVER[\s\S]*captureLockedRegenerationObjects\(map, OBJECT_KIND\.RIVER\)[\s\S]*captureLockedRegenerationObjects\(map, OBJECT_KIND\.ROUTE\)[\s\S]*lockedRivers: riverLocks\.snapshots[\s\S]*lockedRoutes: routeLocks\.snapshots[\s\S]*assertLockedRegenerationSnapshots\(map, riverLocks\)[\s\S]*assertLockedRegenerationSnapshots\(map, routeLocks\)/, "正式河流入口未完整消费河流与道路锁");
assert.match(protectionSource, /OBJECT_KIND\.RIVER[\s\S]*captureRiverMirrors[\s\S]*packRiver[\s\S]*lakeEdges[\s\S]*notes/, "公共 protection 未覆盖河流对象、镜像、水文、湖引用与备注");
