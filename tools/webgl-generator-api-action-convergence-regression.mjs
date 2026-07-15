#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createNamebaseDocument} from "../app/webgl-generator/src/generator/namebase-store.js";
import {createMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {apiCall} from "../app/webgl-generator/src/runtime/api-result.js";

const [appSource, consoleApiSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
]);

for (const signature of [
  "runtimeActions = createRuntimeActions(state, documentRef",
  "state.runtimeActions = runtimeActions",
  "installConsoleApi(documentRef, state, {actions: runtimeActions})"
]) assert(appSource.includes(signature), `应用没有建立唯一 runtimeActions：${signature}`);

const uiActionSignatures = {
  generation: "onGenerate: () => requestGenerate(state, documentRef, runtimeActions)",
  regeneration: "onRegenerate: kind => runtimeActions.generate.regenerate(kind, {confirm: true})",
  viewMode: "onMode: mode => runtimeActions.layers.setViewMode(mode)",
  layer: "onLayerVisible: (layer, visible) => runtimeActions.layers.setVisible(layer, visible)",
  display: "onShowOceanHeight: showOceanHeight => runtimeActions.layers.setShowOceanHeight(showOceanHeight)",
  climate: "onClimateControls: () => applyClimateControls(state, documentRef, runtimeActions.climate.apply)",
  mapImport: "onImportMapData: file => importMapData(state, documentRef, file, runtimeActions.data.importMap)",
  geoImport: "onImportGeoData: file => importGeoData(state, documentRef, file, runtimeActions.data.importGEO)",
  mapExport: "onExportMapData: () => exportMapData(state, documentRef, runtimeActions.data.exportMap)",
  namebaseImport: "onImport: (file, mode) => importNamebases(state, documentRef, file, mode, runtimeActions.namebases.import)",
  namebaseExport: "onExport: rows => exportNamebases(state, documentRef, rows, runtimeActions.namebases.export)",
  heightBase: "runtimeActions.edit.height.rebuildBaseDerived({confirm: true})",
  heightDownstream: "runtimeActions.edit.height.rebuildDownstreamDerived({confirm: true})",
  selection: "locate: target => state.renderer.locateObject(target, locateOptions)"
};
for (const [name, signature] of Object.entries(uiActionSignatures)) assert(appSource.includes(signature), `${name} UI 没有接入公共 action`);

const apiActionSignatures = [
  "actions.layers?.setViewMode",
  "actions.layers?.setShowOceanHeight",
  "actions.layers?.setSmoothCellBorders",
  "actions.layers?.setShowHoverInfo",
  "actions.layers?.setMaxCityLabels",
  "actions.data?.exportMap",
  "actions.data?.exportGEO",
  "actions.data?.exportFeatureGEO",
  "actions.data?.exportPNG",
  "actions.data?.importMap",
  "actions.data?.importGEO",
  "actions.namebases?.export",
  "actions.namebases?.import",
  "actions.edit?.height?.rebuildBaseDerived",
  "actions.edit?.height?.rebuildDownstreamDerived"
];
for (const signature of apiActionSignatures) assert(consoleApiSource.includes(signature), `控制台 API 没有委托公共 action：${signature}`);

for (const legacy of ["function setLayerViewMode(", "function setLayerVisible(", "function setLayerVisualTheme(", "function fitLayerView(", "function runGenerateNow("]) {
  assert(!consoleApiSource.includes(legacy) && !appSource.includes(legacy), `仍保留重复直接写入路径：${legacy}`);
}

assertAdapter("requestGenerate", ["actions.generate.newMap"], ["generateMapOffMainThread", "loadMapIntoRuntime"]);
assertAdapter("importMapData", ["importAction"], ["loadMapIntoRuntime", "parseMapDocumentFile"]);
assertAdapter("importGeoData", ["importAction"], ["executeEditCommand", "createImportFmgCellsHeightCommand"]);
assertAdapter("exportMapData", ["exportAction"], ["createMapDocument", "downloadText"]);
assertAdapter("exportGeoJson", ["exportAction"], ["createMapGeoJson", "downloadText"]);
assertAdapter("exportNamebases", ["exportAction"], ["createNamebaseDocument", "downloadText"]);
assertAdapter("applyClimateControls", ["applyAction"], ["applyClimateOptions"]);

for (const effect of [
  "effects: [\"replace-map\"",
  "effects: [\"map-derived\"",
  "effects: [\"map-climate\"",
  "effects: [\"measurements\"",
  "runtimeDisplayActionResult"
]) assert(appSource.includes(effect), `公共 action 结果缺少刷新 effects：${effect}`);

const map = generatePlaceholderMap({seed: "api-action-convergence", cellsTarget: 3000, heightmapTemplate: "continents"});
const uiMapDocument = createMapDocument(map, map.options);
const apiMapDocument = createMapDocument(map, map.options);
assert.equal(uiMapDocument.metadata.checksum, apiMapDocument.metadata.checksum, "UI / API 地图导出 checksum 不一致");
assert.deepEqual(JSON.parse(stringifyMapDocument(uiMapDocument)).map.summary, JSON.parse(stringifyMapDocument(apiMapDocument)).map.summary, "UI / API 地图导出数据摘要不一致");

const uiNamebases = createNamebaseDocument(map);
const apiNamebases = createNamebaseDocument(map);
assert.equal(uiNamebases.metadata.bases, apiNamebases.metadata.bases, "UI / API 名称库导出数量不一致");
assert.equal(uiNamebases.metadata.checksum, apiNamebases.metadata.checksum, "UI / API 名称库导出 checksum 不一致");

const missingMapAction = () => {
  throw new Error("当前没有可导出的地图");
};
const failure = apiCall(missingMapAction);
assert.equal(failure.ok, false, "缺少地图时 action 没有失败");
assert.equal(failure.error.code, "api_error", "公共 action 参数错误 code 漂移");
assert.match(failure.error.message, /当前没有可导出的地图/, "公共 action 错误消息漂移");

const declaredCounts = countDeclaredMethods(consoleApiSource);
assert.equal(declaredCounts.total, 158, "任务 30 API 方法总数漂移");
assert.equal(declaredCounts.edit, 72, "任务 30 edit 方法数漂移");

console.log(JSON.stringify({
  ok: true,
  actionGroups: Object.keys(uiActionSignatures),
  apiDelegates: apiActionSignatures.length,
  declaredCounts,
  exportChecksum: uiMapDocument.metadata.checksum,
  namebaseCount: uiNamebases.metadata.bases,
  errorCode: failure.error.code
}, null, 2));

function assertAdapter(name, required, forbidden) {
  const source = extractFunction(appSource, name);
  assert(source, `找不到 UI adapter：${name}`);
  for (const token of required) assert(source.includes(token), `${name} 没有调用 ${token}`);
  for (const token of forbidden) assert(!source.includes(token), `${name} 仍直接调用 ${token}`);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] !== "}") continue;
    depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function countDeclaredMethods(source) {
  const block = /const methods = \{([\s\S]*?)\n  \};\n  const methodMetadata/.exec(source)?.[1] || "";
  assert(block, "找不到 capabilities methods 声明");
  const namespaces = ["info", "generate", "selection", "layers", "units", "climate", "history", "edit", "data", "namebases", "debug"];
  const counts = {};
  for (let index = 0; index < namespaces.length; index++) {
    const namespace = namespaces[index];
    const start = block.indexOf(`${namespace}: [`);
    const end = index + 1 < namespaces.length ? block.indexOf(`${namespaces[index + 1]}: [`, start) : block.length;
    assert(start >= 0 && end > start, `找不到 ${namespace} methods 声明`);
    counts[namespace] = (block.slice(start, end).match(/"[^"]+"/g) || []).length;
  }
  return {
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    edit: counts.edit,
    namespaces: counts
  };
}
