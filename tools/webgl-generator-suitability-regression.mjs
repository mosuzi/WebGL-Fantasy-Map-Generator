#!/usr/bin/env node
import assert from "node:assert/strict";

import {recalculateBiomeSuitability} from "../app/webgl-generator/src/generator/biomes.js";
import {buildEconomy} from "../app/webgl-generator/src/generator/economy.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {SUITABILITY_OVERRIDE_UNSET} from "../app/webgl-generator/src/generator/suitability.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "../app/webgl-generator/src/runtime/brush-radius-contract.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  applySuitabilityPreview,
  buildSuitabilityChanges,
  createApplySuitabilityCommand,
  getSuitabilityBrushChanges,
  inspectSuitabilityEdit,
  normalizeSuitabilityMap,
  restoreSuitabilityPreview
} from "../app/webgl-generator/src/runtime/suitability-edit-commands.js";

const seed = "suitability-regression";
const base = generatePlaceholderMap({seed, cellsTarget: 5000, heightmapTemplate: "continents"});
normalizeSuitabilityMap(base);
assert(base.pack.cells.suitabilityBase instanceof Int16Array, "缺少适居度基础值存储");
assert(base.pack.cells.suitabilityOverride instanceof Int16Array, "缺少适居度 override 存储");
assert.equal(normalizeBrushRadius(BRUSH_RADIUS_ID.SUITABILITY, -1), 4, "适居度画笔半径下界异常");
assert.equal(normalizeBrushRadius(BRUSH_RADIUS_ID.SUITABILITY, 999), 120, "适居度画笔半径上界异常");

const landGrid = findGridCell(base, true);
const waterGrid = findGridCell(base, false);
assert(Number.isInteger(landGrid) && Number.isInteger(waterGrid), "缺少陆水测试 cell");
assert.equal(inspectSuitabilityEdit(base, [landGrid], {mode: "scale", value: 50}).code, "invalid-mode");
assert.equal(inspectSuitabilityEdit(base, [landGrid], {scope: "sky", value: 50}).code, "invalid-scope");
assert.equal(inspectSuitabilityEdit(base, [landGrid], {scope: "land", value: 50.5}).code, "invalid-value");
assert.equal(inspectSuitabilityEdit(base, [landGrid], {scope: "land", value: 101}).code, "invalid-value");
assert.equal(inspectSuitabilityEdit(base, [waterGrid], {scope: "land", value: 50}).code, "land-water-mismatch");
assert.equal(inspectSuitabilityEdit(base, [-1], {scope: "all", value: 50}).code, "invalid-cell");

const previewMap = structuredClone(base);
const previewBefore = suitabilitySnapshot(previewMap);
const previewChanges = buildSuitabilityChanges(previewMap, [landGrid], {scope: "land", value: 40});
applySuitabilityPreview(previewMap, previewChanges);
assert(previewChanges[0].packChanges.every(entry => previewMap.pack.cells.s[entry.packCell] === 40), "拖动预览没有写入目标适居度");
restoreSuitabilityPreview(previewMap, previewChanges);
assert.deepEqual(suitabilitySnapshot(previewMap), previewBefore, "取消预览没有精确恢复");

const map = structuredClone(base);
const landPack = packCellsForGrid(map, landGrid);
const originalBase = landPack.map(cell => map.pack.cells.suitabilityBase[cell]);
const heightBefore = {grid: [...map.grid.cells.h], pack: [...map.pack.cells.h]};
const before = fullSnapshot(map);
const changes = buildSuitabilityChanges(map, [landGrid], {scope: "land", value: 80});
const history = new EditHistory();
const command = createApplySuitabilityCommand(changes);
history.execute(command, {map});
assert.equal(history.getStats().undo, 1, "一次适居度 stroke 必须只有一条历史");
for (const packCell of landPack) {
  assert.equal(map.pack.cells.suitabilityOverride[packCell], 80, "陆地 override 未保存");
  assert.equal(map.pack.cells.s[packCell], 80, "陆地最终适居度不是直接设值");
  assert(map.pack.cells.pop[packCell] > 0, "正适居度陆地没有人口承载");
}
assert.equal(map.grid.cells.s[landGrid], 80, "grid 适居度没有从 pack 派生");
assertRegionRuralStats(map);
for (const system of ["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]) {
  assert(map.metadata.derivedStale.systems.includes(system), `缺少 ${system} stale`);
}
const after = fullSnapshot(map);
history.undo({map});
assert.deepEqual(fullSnapshot(map), before, "适居度撤销没有精确恢复");
history.redo({map});
assert.deepEqual(fullSnapshot(map), after, "适居度重做没有精确恢复");

recalculateBiomeSuitability(map.grid, map.pack);
for (const packCell of landPack) assert.equal(map.pack.cells.s[packCell], 80, "生物群系基础重算覆盖了手工 override");
buildEconomy(map.pack, map.options);
for (const packCell of landPack) assert.equal(map.pack.cells.s[packCell], 80, "资源链重算覆盖了手工 override");

const resetChanges = buildSuitabilityChanges(map, [landGrid], {mode: "reset", scope: "land"});
createApplySuitabilityCommand(resetChanges).apply({map});
for (let index = 0; index < landPack.length; index++) {
  const packCell = landPack[index];
  assert.equal(map.pack.cells.suitabilityOverride[packCell], SUITABILITY_OVERRIDE_UNSET, "恢复基础值没有清除 override");
  assert.equal(map.pack.cells.s[packCell], map.pack.cells.suitabilityBase[packCell], "恢复基础值没有使用最新基础链");
  assert.notEqual(map.pack.cells.suitabilityBase[packCell], undefined);
  assert.notEqual(originalBase[index], undefined);
}
assert.deepEqual({grid: [...map.grid.cells.h], pack: [...map.pack.cells.h]}, heightBefore, "数值适居度编辑影响了高度数据");

const waterMap = structuredClone(base);
const waterChanges = buildSuitabilityChanges(waterMap, [waterGrid], {scope: "water", value: 70});
createApplySuitabilityCommand(waterChanges).apply({map: waterMap});
for (const packCell of packCellsForGrid(waterMap, waterGrid)) {
  assert.equal(waterMap.pack.cells.s[packCell], 70, "水域适居度未保存");
  assert.equal(waterMap.pack.cells.pop[packCell], 0, "水域错误产生人口承载");
}
assert.equal(inspectSuitabilityEdit(base, [landGrid, waterGrid], {scope: "all", value: 30}).valid, true, "all 范围没有同时接受陆水 cell");

const brushOriginals = new Map();
const [x, y] = gridPoint(base, landGrid);
const small = getSuitabilityBrushChanges(base, {x, y}, {scope: "land", mode: "set", value: 10, radius: 4}, brushOriginals);
const large = getSuitabilityBrushChanges(base, {x, y}, {scope: "land", mode: "set", value: 10, radius: 120}, new Map());
assert(small.length > 0 && large.length >= small.length, "三档半径候选不单调");
applySuitabilityPreview(base, small);
const repeated = getSuitabilityBrushChanges(base, {x, y}, {scope: "land", mode: "set", value: 10, radius: 4}, brushOriginals);
assert.equal(repeated.length, 0, "同一 stroke 重复经过错误叠加");
restoreSuitabilityPreview(base, small);

for (const faultAt of ["after-values", "after-derived"]) {
  const faultMap = structuredClone(base);
  const faultChanges = buildSuitabilityChanges(faultMap, [landGrid], {scope: "land", value: 55});
  const faultBefore = fullSnapshot(faultMap);
  assert.throws(() => createApplySuitabilityCommand(faultChanges, {faultAt}).apply({map: faultMap}), new RegExp(faultAt));
  assert.deepEqual(fullSnapshot(faultMap), faultBefore, `${faultAt} 故障没有完整回滚`);
}

const sparseLegacy = structuredClone(base);
delete sparseLegacy.climate;
delete sparseLegacy.settlements;
const sparseChanges = buildSuitabilityChanges(sparseLegacy, [landGrid], {scope: "land", value: 35});
const sparseHistory = new EditHistory();
sparseHistory.execute(createApplySuitabilityCommand(sparseChanges), {map: sparseLegacy});
sparseHistory.undo({map: sparseLegacy});
assert.equal(Object.prototype.hasOwnProperty.call(sparseLegacy, "climate"), false, "旧图撤销错误新增 climate 容器");
assert.equal(Object.prototype.hasOwnProperty.call(sparseLegacy, "settlements"), false, "旧图撤销错误新增 settlements 容器");
sparseHistory.redo({map: sparseLegacy});
assert(sparseLegacy.climate?.metadata, "旧图重做没有恢复适居度摘要");

const legacy = structuredClone(base);
delete legacy.pack.cells.suitabilityBase;
delete legacy.pack.cells.suitabilityOverride;
const legacySuitability = [...legacy.pack.cells.s];
normalizeSuitabilityMap(legacy);
assert.deepEqual([...legacy.pack.cells.suitabilityBase], legacySuitability, "旧图没有用当前适居度回填基础值");
assert([...legacy.pack.cells.suitabilityOverride].every(value => value === SUITABILITY_OVERRIDE_UNSET), "旧图没有回填空 override");
const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
assert.deepEqual([...roundtrip.pack.cells.suitabilityBase], [...map.pack.cells.suitabilityBase], "完整地图往返丢失基础值");
assert.deepEqual([...roundtrip.pack.cells.suitabilityOverride], [...map.pack.cells.suitabilityOverride], "完整地图往返丢失 override");

console.log(JSON.stringify({
  ok: true,
  seed,
  semantic: {mode: "set", range: [0, 100], reset: true, scopes: ["land", "water", "all"]},
  target: {gridCell: landGrid, packCells: landPack.length, value: 80},
  water: {gridCell: waterGrid, populationForcedZero: true},
  brush: {small: small.length, large: large.length, repeated: repeated.length},
  compatibility: {heightUnaffected: true, oldMapBackfill: true, sparseOldMapUndoRedo: true, fullMapRoundtrip: true, faultStages: 2},
  history: history.getStats()
}, null, 2));

function findGridCell(map, land) {
  return map.grid.cells.i.find(cell => (Number(map.grid.cells.h[cell]) >= 20) === land && packCellsForGrid(map, cell).length > 0
    && packCellsForGrid(map, cell).every(packCell => (Number(map.pack.cells.h[packCell]) >= 20) === land));
}

function packCellsForGrid(map, gridCell) {
  const cells = [];
  for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) if (Number(map.pack.cells.g[packCell]) === Number(gridCell)) cells.push(packCell);
  return cells;
}

function gridPoint(map, gridCell) {
  return map.grid.points[map.grid.cells.p[gridCell]];
}

function assertRegionRuralStats(map) {
  for (const [field, stores] of [
    ["state", [map.politics.states, map.pack.states]],
    ["province", [map.politics.provinces, map.pack.provinces]],
    ["culture", [map.society.cultures, map.pack.cultures]],
    ["religion", [map.society.religions, map.pack.religions]]
  ]) {
    for (const store of [...new Set(stores)]) {
      for (const item of store) {
        const id = Number(item?.i ?? item?.id);
        if (!item || item.removed || id <= 0) continue;
        const expected = round(map.pack.cells.i.reduce((sum, cell) => Number(map.pack.cells[field]?.[cell]) === id ? sum + (Number(map.pack.cells.pop?.[cell]) || 0) : sum, 0));
        assert.equal(Number(item.rural || 0), expected, `${field} #${id} 乡村人口统计不一致`);
      }
    }
  }
}

function suitabilitySnapshot(map) {
  return {
    gridS: [...map.grid.cells.s],
    gridPop: [...map.grid.cells.pop],
    base: [...map.pack.cells.suitabilityBase],
    override: [...map.pack.cells.suitabilityOverride],
    packS: [...map.pack.cells.s],
    packPop: [...map.pack.cells.pop]
  };
}

function fullSnapshot(map) {
  return JSON.parse(JSON.stringify({
    suitability: suitabilitySnapshot(map),
    climate: map.climate.metadata,
    settlements: map.settlements.metadata,
    states: map.politics.states.map(item => item && ({i: item.i, rural: item.rural})),
    provinces: map.politics.provinces.map(item => item && ({i: item.i, rural: item.rural})),
    cultures: map.society.cultures.map(item => item && ({i: item.i, rural: item.rural})),
    religions: map.society.religions.map(item => item && ({i: item.i, rural: item.rural})),
    stale: map.metadata.derivedStale || null,
    sectionStale: ["settlements", "markers", "zones", "military", "economy", "diplomacy"].map(kind => map[kind]?.metadata?.stale)
  }));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
