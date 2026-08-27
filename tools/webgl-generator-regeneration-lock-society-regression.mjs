#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createRandom} from "../app/webgl-generator/src/generator/random.js";
import {
  buildSociety,
  finalizeSocietyReligions,
  reexpandSocietyCultures,
  reexpandSocietyReligions
} from "../app/webgl-generator/src/generator/society.js";
import {
  createApplyCultureExpansionCommand,
  createApplyReligionExpansionCommand,
  inspectCultureExpansion
} from "../app/webgl-generator/src/runtime/social-expansion-edit-commands.js";

const base = generatePlaceholderMap({
  seed: "regeneration-lock-society",
  cellsTarget: 10000,
  heightmapTemplate: "continents",
  culturesNumber: 10,
  religionsNumber: 6
});

const cultures = active(base.society.cultures);
const religions = active(base.society.religions);
const lockedCulture = cultures[0];
const unlockedCulture = cultures.find(item => item.i !== lockedCulture.i);
const lockedReligion = religions.find(item => item.type !== "Folk" && Number(item.parent || 0) === 0) || religions[0];
const unlockedReligion = religions.find(item => item.i !== lockedReligion.i && item.type !== "Folk");
assert(lockedCulture && unlockedCulture && lockedReligion && unlockedReligion, "缺少文化 / 宗教锁定样本");

const reexpandMap = structuredClone(base);
lock(reexpandMap, "culture", lockedCulture.i);
lock(reexpandMap, "religion", lockedReligion.i);
const cultureBefore = structuralSnapshot(reexpandMap, "culture", lockedCulture.i);
const religionBefore = structuralSnapshot(reexpandMap, "religion", lockedReligion.i);
const unlockedCultureBefore = [...reexpandMap.pack.cells.culture];
const unlockedReligionBefore = [...reexpandMap.pack.cells.religion];

const lockedPreview = inspectCultureExpansion(reexpandMap, lockedCulture.i, {mode: "reexpand", expansionism: 10, confirm: true});
assert(lockedPreview.valid && lockedPreview.code === "regeneration_locked_post_merge" && lockedPreview.changed, "锁定文化目标没有进入空白生成后回填流程");
const lockedCommand = createApplyCultureExpansionCommand(lockedCulture.i, {mode: "reexpand", expansionism: 10, confirm: true});
assert(!lockedCommand.isNoop({map: reexpandMap}), "锁定文化命令被错误降级为 no-op");
lockedCommand.apply({map: reexpandMap});
assertDeepEqual(structuralSnapshot(reexpandMap, "culture", lockedCulture.i), cultureBefore, "锁定文化在生成后回填时改变了快照");

createApplyCultureExpansionCommand(unlockedCulture.i, {
  mode: "reexpand",
  expansionism: 10,
  includeReligions: true,
  confirm: true
}).apply({map: reexpandMap});
assertDeepEqual(structuralSnapshot(reexpandMap, "culture", lockedCulture.i), cultureBefore, "文化重扩改变了锁定文化");
assertDeepEqual(structuralSnapshot(reexpandMap, "religion", lockedReligion.i), religionBefore, "includeReligions 改变了锁定宗教");
assert(anyUnlockedChanged(unlockedCultureBefore, reexpandMap.pack.cells.culture, new Set(cultureBefore.packCells.map(item => item.cell))), "文化重扩没有改变未锁归属");
assert(anyUnlockedChanged(unlockedReligionBefore, reexpandMap.pack.cells.religion, new Set(religionBefore.packCells.map(item => item.cell))), "联动宗教重扩没有改变未锁归属");

const religionReexpandMap = structuredClone(base);
lock(religionReexpandMap, "religion", lockedReligion.i);
const religionReexpandBefore = structuralSnapshot(religionReexpandMap, "religion", lockedReligion.i);
createApplyReligionExpansionCommand(unlockedReligion.i, {
  mode: "reexpand",
  expansion: "global",
  expansionism: 10,
  confirm: true
}).apply({map: religionReexpandMap});
assertDeepEqual(structuralSnapshot(religionReexpandMap, "religion", lockedReligion.i), religionReexpandBefore, "宗教重扩改变了锁定宗教");

const fullMap = createSparseReligionMap(base, lockedReligion.i, 60000);
const sparseLocked = structuredClone(fullMap.society.religions[60000]);
const sparseBefore = structuralSnapshot(fullMap, "religion", 60000);
fullMap.society = buildSociety(
  fullMap.grid,
  fullMap.features,
  fullMap.climate,
  fullMap.rivers,
  createRandom("regeneration-lock-society-build"),
  fullMap.pack,
  {...fullMap.options, lockedReligions: [sparseLocked]}
);
assertDeepEqual(structuralSnapshot(fullMap, "religion", 60000), sparseBefore, "社会 build 初始化改变了锁定宗教结构或归属");
finalizeSocietyReligions(
  fullMap.grid,
  fullMap.society,
  fullMap.pack,
  createRandom("regeneration-lock-society-full"),
  fullMap.settlements,
  {...fullMap.options, religionsNumber: 6, lockedReligions: [sparseLocked]}
);
assert(fullMap.society.religions[60000]?.i === 60000 && fullMap.pack.religions[60000]?.i === 60000, "全量宗教生成丢失稀疏 ID");
assertDeepEqual(structuralSnapshot(fullMap, "religion", 60000), sparseBefore, "全量宗教生成改变了锁定宗教结构或归属");

const mirrorBoundaryBase = generatePlaceholderMap({
  seed: "regeneration-lock-stage-f-scale-valid-100000-v3",
  cellsTarget: 100000,
  heightmapTemplate: "continents"
});
const religionMirrorBoundary = verifyReligionGridMirrorBoundary(structuredClone(mirrorBoundaryBase));
const cultureMirrorBoundary = verifyCultureGridMirrorBoundary(structuredClone(mirrorBoundaryBase));

for (const conflict of [
  ["missing-parent", map => setMirrored(map, "religion", lockedReligion.i, {parent: 99999, origins: [99999]})],
  ["mirror-mismatch", map => {
    map.pack.religions = structuredClone(map.pack.religions);
    map.society.religions[lockedReligion.i].name += "冲突";
  }]
]) {
  const map = structuredClone(base);
  lock(map, "religion", lockedReligion.i);
  conflict[1](map);
  const before = structuralSnapshot(map, "religion", lockedReligion.i);
  createApplyReligionExpansionCommand(unlockedReligion.i, {mode: "reexpand", expansionism: 9, confirm: true}).apply({map});
  assertDeepEqual(structuralSnapshot(map, "religion", lockedReligion.i), before, `${conflict[0]} 锁定宗教没有原样回填`);
}

const waterCenterMap = structuredClone(base);
lock(waterCenterMap, "religion", lockedReligion.i);
const water = waterCenterMap.pack.cells.i.find(cell => Number(waterCenterMap.pack.cells.h[cell]) < 20);
setMirrored(waterCenterMap, "religion", lockedReligion.i, {center: water, gridCenter: waterCenterMap.pack.cells.g[water]});
const waterCenterBefore = structuralSnapshot(waterCenterMap, "religion", lockedReligion.i);
createApplyReligionExpansionCommand(unlockedReligion.i, {mode: "reexpand", expansionism: 9, confirm: true}).apply({map: waterCenterMap});
assertDeepEqual(structuralSnapshot(waterCenterMap, "religion", lockedReligion.i), waterCenterBefore, "水域中心锁定宗教未原样加入重算结果");

const overlapMap = structuredClone(base);
const secondLockedReligion = religions.find(item => item.i !== lockedReligion.i);
lock(overlapMap, "religion", lockedReligion.i);
lock(overlapMap, "religion", secondLockedReligion.i);
setMirrored(overlapMap, "religion", secondLockedReligion.i, {
  center: overlapMap.society.religions[lockedReligion.i].center,
  gridCenter: overlapMap.society.religions[lockedReligion.i].gridCenter
});
const overlapBefore = [
  structuralSnapshot(overlapMap, "religion", lockedReligion.i),
  structuralSnapshot(overlapMap, "religion", secondLockedReligion.i)
];
createApplyReligionExpansionCommand(unlockedReligion.i, {mode: "reexpand", expansionism: 9, confirm: true}).apply({map: overlapMap});
assertDeepEqual(structuralSnapshot(overlapMap, "religion", lockedReligion.i), overlapBefore[0], "重叠中心的首个锁定宗教被改写");
assertDeepEqual(structuralSnapshot(overlapMap, "religion", secondLockedReligion.i), overlapBefore[1], "重叠中心的第二个锁定宗教被改写");

const faultMap = structuredClone(base);
lock(faultMap, "culture", lockedCulture.i);
lock(faultMap, "religion", lockedReligion.i);
const faultBefore = structuredClone(socialSnapshot(faultMap));
assertThrows(
  () => createApplyCultureExpansionCommand(unlockedCulture.i, {
    mode: "reexpand",
    expansionism: 9,
    includeReligions: true,
    confirm: true,
    faultAt: "after-ownership"
  }).apply({map: faultMap}),
  "after-ownership",
  "注入故障没有抛出"
);
assertDeepEqual(socialSnapshot(faultMap), faultBefore, "社会重扩故障没有完整回滚");

console.log(JSON.stringify({
  ok: true,
  culture: {locked: lockedCulture.i, changedUnlocked: true, postMerged: true},
  religion: {locked: lockedReligion.i, changedUnlocked: true, linkedProtected: true},
  fullReligion: {sparseId: 60000, fixedPackCells: sparseBefore.packCells.length, fixedGridCells: sparseBefore.gridCells.length},
  mirrorBoundary: {
    religion: religionMirrorBoundary,
    culture: cultureMirrorBoundary
  },
  bypassedGenerationConstraints: ["water-center", "overlap-center"],
  ignoredLockedCorruption: ["missing-parent", "mirror-mismatch"],
  rollback: "after-ownership"
}, null, 2));

function createSparseReligionMap(source, sourceId, sparseId) {
  const map = structuredClone(source);
  const societyStore = map.society.religions;
  const packStore = map.pack.religions;
  const societyReligion = societyStore[sourceId];
  const packReligion = packStore[sourceId];
  societyStore[sparseId] = {...societyReligion, id: sparseId, i: sparseId};
  packStore[sparseId] = {...packReligion, id: sparseId, i: sparseId};
  societyStore[sourceId] = null;
  packStore[sourceId] = null;
  for (const store of [societyStore, packStore]) {
    for (const religion of store) {
      if (!religion) continue;
      if (Number(religion.parent) === Number(sourceId)) religion.parent = sparseId;
      if (Array.isArray(religion.children)) {
        religion.children = religion.children.map(id => Number(id) === Number(sourceId) ? sparseId : id);
      }
      if (Array.isArray(religion.origins)) {
        religion.origins = religion.origins.map(id => Number(id) === Number(sourceId) ? sparseId : id);
      }
    }
  }
  replaceOwner(map.pack.cells.religion, sourceId, sparseId);
  replaceOwner(map.grid.cells.religion, sourceId, sparseId);
  return map;
}

function verifyReligionGridMirrorBoundary(map) {
  const lockedId = 1;
  const gridCell = 20322;
  const packCell = strongestPackMirrorCell(map, gridCell, "religion");
  assert(Number(map.grid.cells.religion[gridCell]) !== lockedId, "100k cell #20322 已属于锁定宗教，无法覆盖边界回归");
  map.grid.cells.religion[gridCell] = 2;
  map.pack.cells.religion[packCell] = lockedId;
  const locked = structuredClone(map.society.religions[lockedId]);
  reexpandSocietyReligions(map.grid, map.pack, map.society.religions, map.settlements, {
    ...map.options,
    lockedReligions: [locked]
  });
  assert(Number(map.pack.cells.religion[packCell]) === lockedId, "100k 固定 pack 宗教归属丢失");
  assert(Number(map.grid.cells.religion[gridCell]) !== lockedId, "100k cell #20322 在 gridFixed 外新增锁定宗教归属");
  return {cellsTarget: 100000, lockedId, gridCell, packCell};
}

function verifyCultureGridMirrorBoundary(map) {
  const lockedId = 1;
  const gridCell = 20322;
  const packCell = strongestPackMirrorCell(map, gridCell, "culture");
  map.grid.cells.culture[gridCell] = 2;
  map.pack.cells.culture[packCell] = lockedId;
  const locked = structuredClone(map.society.cultures[lockedId]);
  reexpandSocietyCultures(map.grid, map.pack, map.society.cultures, {
    ...map.options,
    lockedCultures: [locked]
  });
  assert(Number(map.pack.cells.culture[packCell]) === lockedId, "100k 固定 pack 文化归属丢失");
  assert(Number(map.grid.cells.culture[gridCell]) !== lockedId, "100k cell #20322 在 gridFixed 外新增锁定文化归属");
  return {cellsTarget: 100000, lockedId, gridCell, packCell};
}

function strongestPackMirrorCell(map, gridCell, field) {
  const packCells = Array.from(map.pack.cells.i).filter(cell => Number(map.pack.cells.g[cell]) === gridCell);
  assert(packCells.length > 0, `100k grid cell #${gridCell} 缺少 pack 镜像`);
  const score = field === "religion"
    ? cell => map.pack.cells.pop?.[cell] || map.pack.cells.s?.[cell] || map.pack.cells.h?.[cell] || 0
    : cell => map.pack.cells.pop?.[cell] || map.pack.cells.s?.[cell] || 0;
  return packCells.sort((left, right) => score(right) - score(left))[0];
}

function structuralSnapshot(map, kind, id) {
  const plural = `${kind}s`;
  const field = kind;
  const object = map.society[plural][id];
  return {
    object: pickFields(object, ["id", "i", "center", "gridCenter", "parent", "children", "origins", "culture"]),
    packObject: pickFields(map.pack[plural][id], ["id", "i", "center", "gridCenter", "parent", "children", "origins", "culture"]),
    packCells: ownedCells(map.pack.cells[field], id),
    gridCells: ownedCells(map.grid.cells[field], id)
  };
}

function socialSnapshot(map) {
  return {
    packCulture: [...map.pack.cells.culture],
    packReligion: [...map.pack.cells.religion],
    gridCulture: [...map.grid.cells.culture],
    gridReligion: [...map.grid.cells.religion],
    cultures: map.society.cultures,
    religions: map.society.religions,
    packCultures: map.pack.cultures,
    packReligions: map.pack.religions,
    metadata: map.society.metadata,
    stale: map.metadata.derivedStale
  };
}

function setMirrored(map, kind, id, patch) {
  const plural = `${kind}s`;
  Object.assign(map.society[plural][id], patch);
  Object.assign(map.pack[plural][id], patch);
}

function lock(map, kind, id) {
  map.regenerationLocks ||= {version: 1, entries: []};
  map.regenerationLocks.entries.push({kind, id});
}

function active(items) {
  return (items || []).filter(item => item && !item.removed && Number(item.i ?? item.id) > 0);
}

function replaceOwner(values, from, to) {
  for (let cell = 0; cell < values.length; cell++) if (Number(values[cell]) === Number(from)) values[cell] = to;
}

function ownedCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < values.length; cell++) if (Number(values[cell]) === Number(id)) cells.push({cell, owner: Number(values[cell])});
  return cells;
}

function anyUnlockedChanged(before, after, fixedCells) {
  for (let cell = 0; cell < Math.max(before.length, after.length); cell++) {
    if (!fixedCells.has(cell) && Number(before[cell] || 0) !== Number(after[cell] || 0)) return true;
  }
  return false;
}

function pickFields(object, fields) {
  return Object.fromEntries(fields.filter(key => Object.prototype.hasOwnProperty.call(object || {}, key)).map(key => [key, structuredClone(object[key])]));
}

function assertConflict(action, label) {
  try {
    action();
  } catch (error) {
    assert(error?.code === "regeneration_lock_conflict" || String(error?.message || error).includes("regeneration_lock_conflict"), `${label} 未返回 regeneration_lock_conflict：${error?.message || error}`);
    return;
  }
  throw new Error(`${label} 未触发锁冲突`);
}

function assertThrows(action, pattern, message) {
  try {
    action();
  } catch (error) {
    assert(String(error?.message || error).includes(pattern), `${message}：${error?.message || error}`);
    return;
  }
  throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
