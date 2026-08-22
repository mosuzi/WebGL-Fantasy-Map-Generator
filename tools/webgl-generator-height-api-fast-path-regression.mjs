#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parse} from "@babel/parser";
import {createApplyHeightBrushCommand, prewarmHeightEditorPackCellsByGrid} from "../app/webgl-generator/src/runtime/height-edit-commands.js";

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const appAst = parse(appSource, {sourceType: "module", plugins: ["importAttributes"]});
const coldMap = createSyntheticMap();
assert.equal(Object.hasOwn(coldMap, "__heightEditorPackCellsByGrid"), false, "冷启动高度夹具不应预置 pack 索引");
const coldCommand = createApplyHeightBrushCommand([{gridCell: 2, before: 30, after: 37}], {label: "冷启动 API 高度"});
coldCommand.apply({map: coldMap});
assert.equal(coldMap.grid.cells.h[2], 37, "冷启动高度快路未更新 grid");
assert.equal(coldMap.pack.cells.h[2], 37, "冷启动高度快路未投影 pack");
assert.equal(Object.hasOwn(coldMap, "__heightEditorPackCellsByGrid"), false, "单次未预热高度 API 不应构建整图 pack→grid Map");

const warmMap = createSyntheticMap();
const warmup = prewarmHeightEditorPackCellsByGrid(warmMap);
assert.equal(warmup.ready, true, "预热高度索引未建立");
const warmIndex = warmMap.__heightEditorPackCellsByGrid;
const warmCommand = createApplyHeightBrushCommand([{gridCell: 1, before: 20, after: 26}], {label: "预热 API 高度"});
warmCommand.apply({map: warmMap});
assert.equal(warmMap.pack.cells.h[1], 26, "预热高度索引路径未投影 pack");
assert.strictEqual(warmMap.__heightEditorPackCellsByGrid, warmIndex, "预热高度索引路径错误换代缓存");

const legacyMap = createSyntheticMap();
legacyMap.__heightEditorPackCellsByGrid = {};
createApplyHeightBrushCommand([{gridCell: 0, before: 10, after: 14}], {label: "旧缓存高度"}).apply({map: legacyMap});
assert.equal(legacyMap.pack.cells.h[0], 14, "旧对象缓存阻断了 pack 投影");
assert.ok(legacyMap.__heightEditorPackCellsByGrid instanceof Map, "旧对象缓存没有恢复为正式 Map");
assert.equal(Object.keys(legacyMap).includes("__heightEditorPackCellsByGrid"), false, "恢复后的高度索引仍会进入存档");

const largeMap = createLargeSyntheticMap(100000);
const largeStartedAt = performance.now();
createApplyHeightBrushCommand([{gridCell: 54321, before: 30, after: 37}], {label: "100k 冷启动 API 高度"}).apply({map: largeMap});
const largeColdProjectionMs = Number((performance.now() - largeStartedAt).toFixed(1));
assert.equal(largeMap.grid.cells.h[54321], 37, "100k 冷启动高度快路未更新 grid");
assert.equal(largeMap.pack.cells.h[54321], 37, "100k 冷启动高度快路未投影 pack");
assert.equal(Object.hasOwn(largeMap, "__heightEditorPackCellsByGrid"), false, "100k 单 cell API 错误建立整图索引");

const refreshSource = functionSource("refreshAfterHeightApiEdit");
const applySource = functionSource("applyHeightChangesViaApi");
assert.match(applySource, /refresh:\s*refreshAfterHeightApiEdit/u, "高度 API 没有使用单次最终 UI 发布刷新路径");
assert.match(refreshSource, /editRefreshScheduler\.run\([\s\S]*?runtimeStats:\s*false[\s\S]*?pickPanel:\s*false/u, "高度 API scheduler 仍发布中间 runtime/pick 状态");
assert.equal(matchCount(applySource, /updateRuntimePanel\(documentRef, state\)/gu), 1, "高度 API runtime 状态不是单次最终发布");
assert.equal(matchCount(applySource, /updatePickPanel\(documentRef, state\)/gu), 1, "高度 API pick 状态不是单次最终发布");
assert.equal(matchCount(applySource, /updateEditingInteractionLock\(state, documentRef\)/gu), 1, "高度 API editing lock 不是单次最终发布");
assert.match(applySource, /if \(state\.heightEdit\)[\s\S]*?updateRuntimePanel\(documentRef, state\);\s*updatePickPanel\(documentRef, state\);\s*updateEditingInteractionLock/u, "高度 API 没有在最终统计落定后发布 runtime/pick/UI 状态");

console.log(JSON.stringify({
  ok: true,
  coldDirectProjection: true,
  warmCachePreserved: true,
  legacyCacheRecovered: true,
  largeColdProjection: {cells: 100000, ms: largeColdProjectionMs, cacheCreated: false},
  finalUiPublish: {runtime: 1, pick: 1},
  browserRuns: 0
}, null, 2));

function createSyntheticMap() {
  return {
    metadata: {},
    grid: {
      points: [[0, 0], [10, 0], [20, 0], [30, 0]],
      cells: {
        p: Uint32Array.from([0, 1, 2, 3]),
        h: Uint8Array.from([10, 20, 30, 50])
      }
    },
    pack: {
      cells: {
        g: Uint32Array.from([0, 1, 2, 3]),
        h: Uint8Array.from([10, 20, 30, 50])
      }
    }
  };
}

function createLargeSyntheticMap(size) {
  const gridHeights = new Uint8Array(size).fill(30);
  const packGridCells = new Uint32Array(size);
  for (let cell = 0; cell < size; cell++) packGridCells[cell] = cell;
  return {
    metadata: {},
    grid: {cells: {h: gridHeights}},
    pack: {cells: {g: packGridCells, h: new Uint8Array(gridHeights)}}
  };
}

function functionSource(name) {
  const node = findFunction(appAst.program, name);
  assert(node, `缺少函数 ${name}`);
  return appSource.slice(node.start, node.end);
}

function findFunction(root, name) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "FunctionDeclaration" && node.id?.name === name) return node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === "object" && typeof value.type === "string") stack.push(value);
    }
  }
  return null;
}

function matchCount(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
