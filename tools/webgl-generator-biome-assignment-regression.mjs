#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  applyBiomeAssignmentPreview,
  buildBiomeAssignmentChanges,
  createApplyBiomeAssignmentCommand,
  inspectBiomeAssignment
} from "../app/webgl-generator/src/runtime/biome-edit-commands.js";
import {restoreCanvasToolStrokePreview} from "../app/webgl-generator/src/runtime/canvas-tool-preview-rollback.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "../app/webgl-generator/src/runtime/brush-radius-contract.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, createMapGeoJson, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/BiomePanel.vue", import.meta.url), "utf8");
assert.match(appSource, /BIOME_ASSIGN: "biome:assign"/, "缺少生物群系画布模式");
assert.match(appSource, /createApplyBiomeAssignmentCommand\(changes/, "UI 与 API 没有共用生物群系命令");
assert.match(apiSource, /biomes: Object\.freeze\(\{/, "控制台 API 缺少 biomes 命名空间");
assert.match(panelSource, /<template #assign>/, "生物群系面板缺少归属笔刷入口");
assert.equal(normalizeBrushRadius(BRUSH_RADIUS_ID.BIOME, -1), 4, "生物群系画笔半径下界异常");
assert.equal(normalizeBrushRadius(BRUSH_RADIUS_ID.BIOME, 999), 120, "生物群系画笔半径上界异常");

const map = generatePlaceholderMap({seed: "biome-assignment-a", cellsTarget: 5000, heightmapTemplate: "continents"});
const landGridCell = map.grid.cells.i.find(cell => map.grid.cells.h[cell] >= 20 && packCellsForGrid(map, cell).length);
const waterGridCell = map.grid.cells.i.find(cell => map.grid.cells.h[cell] < 20 && packCellsForGrid(map, cell).length);
assert(Number.isInteger(landGridCell) && Number.isInteger(waterGridCell));
const beforeBiome = Number(map.grid.cells.biome[landGridCell]);
const targetBiome = [6, 7, 4, 1].find(id => id !== beforeBiome);

assert.equal(inspectBiomeAssignment(map, 999, [landGridCell]).code, "invalid-biome");
assert.equal(inspectBiomeAssignment(map, 0, [waterGridCell], {scope: "land"}).code, "target-scope-mismatch");
assert.equal(inspectBiomeAssignment(map, targetBiome, [waterGridCell]).code, "land-water-mismatch");
assert.equal(inspectBiomeAssignment(map, targetBiome, [-1]).code, "invalid-cell");
const warmGridCell = map.grid.cells.i.find(cell => map.grid.cells.h[cell] >= 20 && Number(map.grid.cells.temp?.[cell]) > 0 && packCellsForGrid(map, cell).length);
const warningPreview = inspectBiomeAssignment(map, 11, [warmGridCell], {scope: "land"});
assert.equal(warningPreview.valid, true);
assert.equal(warningPreview.warningCells, 1, "气候或高度异常必须进入预检提示");
assert(warningPreview.warnings.includes("冰川温度偏高"));

const preview = inspectBiomeAssignment(map, targetBiome, [landGridCell], {scope: "land"});
assert.equal(preview.valid, true);
assert.equal(preview.changed, true);
const changes = buildBiomeAssignmentChanges(map, targetBiome, [landGridCell], {scope: "land"});
assert.equal(changes.length, 1);

const suitabilityBeforePreview = Array.from(map.pack.cells.s);
const populationBeforePreview = Array.from(map.pack.cells.pop);
applyBiomeAssignmentPreview(map, changes);
assert.equal(map.grid.cells.biome[landGridCell], targetBiome);
assert(changes[0].packBefore.every(entry => map.pack.cells.biome[entry.packCell] === targetBiome));
assert.deepEqual(Array.from(map.pack.cells.s), suitabilityBeforePreview, "笔划预览不能提前重算适居度");
assert.deepEqual(Array.from(map.pack.cells.pop), populationBeforePreview, "笔划预览不能提前重算人口承载");
const restored = restoreCanvasToolStrokePreview(map, "biome", {
  originals: new Map([[landGridCell, {gridBefore: changes[0].before, packBefore: changes[0].packBefore}]])
});
assert.equal(restored.restoredGridCells, 1);
assert.equal(map.grid.cells.biome[landGridCell], beforeBiome);
assert(changes[0].packBefore.every(entry => map.pack.cells.biome[entry.packCell] === entry.before));

const before = snapshot(map);
const settlementsBefore = JSON.stringify(map.settlements.cities);
const history = new EditHistory();
const command = createApplyBiomeAssignmentCommand(changes);
history.execute(command, {map});
const result = command.getResult();
assert.equal(history.getStats().undo, 1, "一次笔划只能写入一条历史");
assert.equal(map.grid.cells.biome[landGridCell], targetBiome);
assert(changes[0].packBefore.every(entry => map.pack.cells.biome[entry.packCell] === targetBiome));
assert.equal(map.climate.metadata.biomeCounts[targetBiome] > 0, true);
assert.equal(map.climate.metadata.positiveSuitabilityCells, countPositive(map.pack.cells.s));
assert.equal(map.climate.metadata.positivePopulationCells, countPositive(map.pack.cells.pop));
assert.deepEqual(map.grid.cells.s[landGridCell], Math.max(...packCellsForGrid(map, landGridCell).map(cell => map.pack.cells.s[cell])));
assert.deepEqual(JSON.stringify(map.settlements.cities), settlementsBefore, "局部生物群系编辑不能立即重生成城镇");
assert.equal(map.settlements.metadata.stale, true);
for (const system of ["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]) assert(map.metadata.derivedStale.systems.includes(system), `缺少 ${system} 待派生标记`);
for (const system of ["rivers", "routes", "biomes"]) assert(!map.metadata.derivedStale.systems.includes(system), `不应把 ${system} 标为本命令下游`);

const after = snapshot(map);
history.undo({map});
assert.deepEqual(snapshot(map), before, "撤销必须恢复 biome、适居度、人口和 stale");
history.redo({map});
assert.deepEqual(snapshot(map), after, "重做必须精确恢复首次结果");

const roundTrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
assert.equal(roundTrip.grid.cells.biome[landGridCell], targetBiome);
assert(changes[0].packBefore.every(entry => roundTrip.pack.cells.biome[entry.packCell] === targetBiome));
assert.equal(roundTrip.climate.metadata.positiveSuitabilityCells, map.climate.metadata.positiveSuitabilityCells);
const geo = createMapGeoJson(map);
for (const entry of changes[0].packBefore) {
  const feature = geo.features.find(item => item.properties.cell === entry.packCell);
  assert.equal(feature?.properties.biome, targetBiome, `pack cell #${entry.packCell} 导出生物群系未同步`);
}

console.log(JSON.stringify({
  ok: true,
  target: {gridCell: landGridCell, beforeBiome, targetBiome, packCells: result.packCells},
  warnings: {cells: result.warningCells, reasons: result.warnings},
  suitability: {positiveCells: map.climate.metadata.positiveSuitabilityCells, max: map.climate.metadata.maxSuitability},
  population: {positiveCells: map.climate.metadata.positivePopulationCells, max: map.climate.metadata.maxPopulation},
  rejected: ["invalid-biome", "target-scope-mismatch", "land-water-mismatch", "invalid-cell"],
  history: history.getStats()
}, null, 2));

function packCellsForGrid(targetMap, gridCell) {
  const cells = [];
  for (let packCell = 0; packCell < targetMap.pack.cells.g.length; packCell++) if (Number(targetMap.pack.cells.g[packCell]) === Number(gridCell)) cells.push(packCell);
  return cells;
}

function countPositive(values) {
  return Array.from(values || []).filter(value => Number(value) > 0).length;
}

function snapshot(targetMap) {
  return {
    gridBiome: Array.from(targetMap.grid.cells.biome),
    gridSuitability: Array.from(targetMap.grid.cells.s),
    gridPopulation: Array.from(targetMap.grid.cells.pop),
    packBiome: Array.from(targetMap.pack.cells.biome),
    packSuitability: Array.from(targetMap.pack.cells.s),
    packPopulation: Array.from(targetMap.pack.cells.pop),
    climateMetadata: JSON.parse(JSON.stringify(targetMap.climate.metadata)),
    packRankInputs: JSON.parse(JSON.stringify(targetMap.pack.metadata.rankCellsInputs || null)),
    derivedStale: JSON.parse(JSON.stringify(targetMap.metadata.derivedStale || null)),
    sectionStale: ["settlements", "markers", "zones", "military", "economy", "diplomacy"].map(kind => targetMap[kind]?.metadata?.stale)
  };
}
