import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {gzipSync} from "node:zlib";
import {parse} from "@babel/parser";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {normalizeOptions} from "../app/webgl-generator/src/generator/options.js";
import {normalizeCloudFilename} from "../app/webgl-generator/src/runtime/cloud-storage.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  DEFAULT_MAP_FILENAME_TEMPLATE,
  DEFAULT_MAP_NAME,
  createMapArchiveFilename,
  ensureMapArchiveExtension,
  isCompressedMapDocumentFilename,
  isMapDocumentFilename,
  normalizeMapName,
  renderMapFilenameTemplate,
  synchronizeMapName
} from "../app/webgl-generator/src/runtime/map-filename.js";
import {
  CLOUD_FILENAME_TEMPLATE_STORAGE_KEY,
  persistCloudFilenameTemplate,
  readCloudFilenameTemplate
} from "../app/webgl-generator/src/ui/panels/cloud-storage-panel.js";

assert.equal(normalizeMapName("  山海   舆图  "), "山海 舆图");
assert.equal(normalizeMapName(""), DEFAULT_MAP_NAME);
assert.deepEqual(synchronizeMapName({metadata: {seed: "legacy-seed"}, options: {seed: "legacy-seed"}}, {}, {legacyFallback: true}), {
  metadata: {seed: "legacy-seed", name: "legacy-seed"},
  options: {seed: "legacy-seed", mapName: "legacy-seed"}
});

const fixedNow = new Date(2026, 7, 3, 9, 5, 7);
assert.equal(renderMapFilenameTemplate(DEFAULT_MAP_FILENAME_TEMPLATE, {name: "山海", seed: "s1", checksum: "abc", now: fixedNow}), "山海-2026-08-03-09-05-07.webfmg");
assert.equal(renderMapFilenameTemplate("直接文件名", {now: fixedNow}), "直接文件名.webfmg");
assert.equal(renderMapFilenameTemplate("{seed}-{checksum}.{ext}", {seed: "s1", checksum: "abc", now: fixedNow}), "s1-abc.webfmg");
assert.equal(renderMapFilenameTemplate("坏:/名字.{ext}", {now: fixedNow}), "坏-名字.webfmg");
assert.throws(() => renderMapFilenameTemplate("{name}-{unknown}.{ext}", {name: "山海"}), /未知的文件名模板变量/);
assert.equal(ensureMapArchiveExtension("地图.webgl-map.json.gz"), "地图.webfmg");
assert.equal(ensureMapArchiveExtension("地图.json.gz"), "地图.webfmg");
assert.equal(ensureMapArchiveExtension("地图.webfmg"), "地图.webfmg");
assert.ok(ensureMapArchiveExtension("长".repeat(300)).length <= 180);
for (const filename of ["a.webfmg", "a.webgl-map.json.gz", "a.json.gz", "a.gz", "a.json"]) assert.equal(isMapDocumentFilename(filename), true, filename);
for (const filename of ["a.webfmg", "a.webgl-map.json.gz", "a.json.gz", "a.gz"]) assert.equal(isCompressedMapDocumentFilename(filename), true, filename);
assert.equal(isCompressedMapDocumentFilename("a.json"), false);
assert.equal(normalizeCloudFilename("云图.json.gz"), "云图.webfmg");

const first = generatePlaceholderMap(normalizeOptions({mapName: "甲图", seed: "map-name-checksum", cellsTarget: 1000}));
assert.equal(first.metadata.name, "甲图");
assert.equal(first.options.mapName, "甲图");
const checksumBeforeRename = first.metadata.checksum;
synchronizeMapName(first, {mapName: "乙图"});
first.metadata.name = "乙图";
first.options.mapName = "乙图";
assert.equal(first.metadata.checksum, checksumBeforeRename, "地图名称不得改变 checksum");
first.metadata.name = "甲图";
first.options.mapName = "甲图";
const currentDocument = createMapDocument(first, first.options);
assert.equal(currentDocument.options.mapName, "甲图");
assert.equal(currentDocument.map.metadata.name, "甲图");
assert.equal(currentDocument.map.options.mapName, "甲图");
assert.equal(createMapArchiveFilename(first, {template: "{name}.{ext}", now: fixedNow}), "甲图.webfmg");

const legacyDocument = JSON.parse(stringifyMapDocument(currentDocument));
delete legacyDocument.metadata.name;
delete legacyDocument.options.mapName;
delete legacyDocument.map.metadata.name;
delete legacyDocument.map.options.mapName;
const migratedLegacy = parseMapDocument(JSON.stringify(legacyDocument));
assert.equal(migratedLegacy.map.metadata.name, first.metadata.seed);
assert.equal(migratedLegacy.map.options.mapName, first.metadata.seed);
assert.equal(migratedLegacy.map.metadata.checksum, first.metadata.checksum);

const memory = new Map();
const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)};
assert.equal(readCloudFilenameTemplate(storage), DEFAULT_MAP_FILENAME_TEMPLATE);
assert.equal(persistCloudFilenameTemplate(storage, "{name}-{seed}.{ext}"), true);
assert.equal(memory.get(CLOUD_FILENAME_TEMPLATE_STORAGE_KEY), "{name}-{seed}.{ext}");
assert.equal(readCloudFilenameTemplate(storage), "{name}-{seed}.{ext}");
assert.equal(persistCloudFilenameTemplate(storage, ""), true);
assert.equal(readCloudFilenameTemplate(storage), DEFAULT_MAP_FILENAME_TEMPLATE);

const tempFile = join(tmpdir(), `webgl-map-save-naming-${process.pid}.webfmg`);
try {
  writeFileSync(tempFile, gzipSync(stringifyMapDocument(currentDocument)));
  const headless = JSON.parse(execFileSync(process.execPath, ["--no-warnings", "tools/webgl-generator-headless-api.mjs", tempFile, "info.mapSummary"], {cwd: process.cwd(), encoding: "utf8"}));
  assert.equal(headless.ok, true);
} finally {
  rmSync(tempFile, {force: true});
}

const controlSource = readFileSync("app/webgl-generator/src/ui/vue/components/ControlPanel.vue", "utf8");
const panelSource = readFileSync("app/webgl-generator/src/ui/panel.js", "utf8");
const cloudPanelSource = readFileSync("app/webgl-generator/src/ui/vue/components/CloudStoragePanel.vue", "utf8");
const appSource = readFileSync("app/webgl-generator/src/runtime/app.js", "utf8");
const headlessWriteSource = readFileSync("tools/webgl-generator-headless-write.mjs", "utf8");
assert.match(controlSource, /input-id="map-name-input"/);
assert.match(controlSource, /toggle-map-filename-template[\s\S]*?aria-expanded[\s\S]*?input-id="map-filename-template-input"[\s\S]*?map-filename-template-preview/);
assert.match(controlSource, /accept="\.webfmg,/);
assert.match(panelSource, /mapName: documentRef\.getElementById\("map-name-input"\)/);
assert.match(cloudPanelSource, /文件名模板在控制面板的“生成”页统一设置[\s\S]*?filenamePreview/);
assert.match(appSource, /onCreatePayload: async \(\{filenameTemplate\} = \{\}\)[\s\S]*?exportCompressedAll\(\{[\s\S]*?filenameTemplate[\s\S]*?filename: exported\.filename/);
assertMapLoadFilenameRefresh(appSource);
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => `if (false) {\n${indentFlow(flow)}\n  }`)), /三个相邻直接语句/u, "不可达分支不得提供装载后文件名刷新证据");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, () => '"refreshRuntimeAfterMapLoadAsync -> updateFilenamePreview -> syncSaveFilenameTemplateUi";')), /三个相邻直接语句/u, "字符串不得提供装载后文件名刷新证据");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => `const unusedFilenameRefresh = async () => {\n${indentFlow(flow)}\n  };`)), /三个相邻直接语句/u, "未调用函数不得提供装载后文件名刷新证据");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => replaceFlow(flow, "state.panels.cloudStorage?.updateFilenamePreview?.();", "state.panels.cloudStorage.updateFilenamePreview();"))), /三个相邻直接语句/u, "非 optional preview 不得通过");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => replaceFlow(flow, "updateFilenamePreview?.();", 'updateFilenamePreview?.("wrong");'))), /三个相邻直接语句/u, "preview 多余参数不得通过");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => replaceFlow(flow, "syncSaveFilenameTemplateUi(documentRef, state);", "syncSaveFilenameTemplateUi(state, documentRef);"))), /三个相邻直接语句/u, "filename UI 参数错序不得通过");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => replaceFlow(flow, /\r?\n  \}\);/u, '\n  }, "extra");'))), /三个相邻直接语句/u, "async refresh 第四参数不得通过");
assert.throws(() => assertMapLoadFilenameRefresh(mutateMapLoadFilenameRefresh(appSource, flow => replaceFlow(flow, /(\r?\n    isCurrent)(\r?\n  \}\);)/u, "$1,\n    unexpected: true$2"))), /三个相邻直接语句/u, "async refresh 多余 option 不得通过");
assert.match(appSource, /onSaveLocalFile:[\s\S]{0,180}?runtimeActions\.data\.exportCompressedAll/);
assert.match(appSource, /async function saveMapToLocalFile[\s\S]{0,400}?filenameTemplate: readCloudFilenameTemplate/);
assert.match(appSource, /async function exportCompressedMapData[\s\S]{0,400}?filenameTemplate: readCloudFilenameTemplate/);
const consoleApiSource = readFileSync("app/webgl-generator/src/runtime/console-api.js", "utf8");
assert.match(consoleApiSource, /options\.filenameTemplate === undefined \? "\{name\}\.\{ext\}" : options\.filenameTemplate/);
assert.match(headlessWriteSource, /isCompressedMapDocumentFilename\(outputPath\)/);

console.log("地图名称与存档命名回归通过：mapName 双字段、checksum 隔离、.webfmg/旧扩展、模板、云端偏好和 headless CLI 均符合预期。");

function assertMapLoadFilenameRefresh(source) {
  const {statements, index} = locateMapLoadFilenameRefresh(source, {requireFlow: false});
  assert.ok(index >= 0, "loadMapIntoRuntime 外层 try 必须以三个相邻直接语句完成 async refresh、cloud preview 与 filename UI 同步");
  const refresh = statements[index].expression;
  assert.equal(refresh.type, "AwaitExpression");
  assert.equal(callName(refresh.argument), "refreshRuntimeAfterMapLoadAsync");
  assert.deepEqual(refresh.argument.arguments.slice(0, 2).map(identifierName), ["state", "documentRef"]);
  const options = refresh.argument.arguments[2];
  assert.equal(options?.type, "ObjectExpression");
  const properties = new Map(options.properties.filter(property => property.type === "ObjectProperty").map(property => [propertyName(property.key), property.value]));
  assert.equal(properties.get("restorePanels")?.value, true);
  assert.equal(identifierName(properties.get("operation")), "operation");
  assert.equal(identifierName(properties.get("isCurrent")), "isCurrent");
}

function locateMapLoadFilenameRefresh(source, {requireFlow = true} = {}) {
  const ast = parse(source, {sourceType: "module"});
  const declaration = ast.program.body.find(node => node.type === "FunctionDeclaration" && node.id?.name === "loadMapIntoRuntime");
  assert.ok(declaration?.async, "缺少 async loadMapIntoRuntime FunctionDeclaration");
  const ownerTry = declaration.body.body.find(node => node.type === "TryStatement");
  assert.ok(ownerTry, "loadMapIntoRuntime 缺少外层 try");
  const statements = ownerTry.block.body;
  const index = statements.findIndex((statement, offset) => isExactRefreshStatement(statement)
    && isExactPreviewStatement(statements[offset + 1])
    && isExactFilenameSyncStatement(statements[offset + 2]));
  if (requireFlow) assert.ok(index >= 0, "loadMapIntoRuntime 缺少三个相邻直接语句");
  return {statements, index};
}

function mutateMapLoadFilenameRefresh(source, replacement) {
  const {statements, index} = locateMapLoadFilenameRefresh(source);
  const first = statements[index];
  const last = statements[index + 2];
  const flow = source.slice(first.start, last.end);
  return `${source.slice(0, first.start)}${replacement(flow)}${source.slice(last.end)}`;
}

function indentFlow(flow) {
  return flow.split(/\r?\n/u).map(line => `  ${line}`).join("\n");
}

function replaceFlow(flow, pattern, replacement) {
  const mutated = flow.replace(pattern, replacement);
  assert.notEqual(mutated, flow, `mutation 未命中：${String(pattern)}`);
  return mutated;
}

function isExactRefreshStatement(statement) {
  if (statement?.type !== "ExpressionStatement" || statement.expression?.type !== "AwaitExpression") return false;
  const call = statement.expression.argument;
  if (call?.type !== "CallExpression" || callName(call) !== "refreshRuntimeAfterMapLoadAsync" || call.arguments.length !== 3) return false;
  if (identifierName(call.arguments[0]) !== "state" || identifierName(call.arguments[1]) !== "documentRef") return false;
  const options = call.arguments[2];
  if (options?.type !== "ObjectExpression" || options.properties.length !== 3 || options.properties.some(property => property.type !== "ObjectProperty" || property.computed)) return false;
  const keys = options.properties.map(property => propertyName(property.key));
  if (new Set(keys).size !== 3 || !["restorePanels", "operation", "isCurrent"].every(key => keys.includes(key))) return false;
  const values = new Map(options.properties.map(property => [propertyName(property.key), property.value]));
  return values.get("restorePanels")?.type === "BooleanLiteral"
    && values.get("restorePanels")?.value === true
    && identifierName(values.get("operation")) === "operation"
    && identifierName(values.get("isCurrent")) === "isCurrent";
}

function isExactPreviewStatement(statement) {
  if (statement?.type !== "ExpressionStatement") return false;
  const call = statement.expression;
  if (call?.type !== "OptionalCallExpression" || call.optional !== true || call.arguments.length !== 0) return false;
  const callee = call.callee;
  if (callee?.type !== "OptionalMemberExpression" || callee.optional !== true || callee.computed) return false;
  if (identifierName(callee.property) !== "updateFilenamePreview") return false;
  const cloudStorage = callee.object;
  if (cloudStorage?.type !== "MemberExpression" || cloudStorage.computed || identifierName(cloudStorage.property) !== "cloudStorage") return false;
  const panels = cloudStorage.object;
  return panels?.type === "MemberExpression"
    && !panels.computed
    && identifierName(panels.object) === "state"
    && identifierName(panels.property) === "panels";
}

function isExactFilenameSyncStatement(statement) {
  if (statement?.type !== "ExpressionStatement") return false;
  const call = statement.expression;
  return call?.type === "CallExpression"
    && callName(call) === "syncSaveFilenameTemplateUi"
    && call.arguments.length === 2
    && identifierName(call.arguments[0]) === "documentRef"
    && identifierName(call.arguments[1]) === "state";
}

function callName(node) {
  if (!node || !["CallExpression", "OptionalCallExpression"].includes(node.type)) return "";
  return memberName(node.callee);
}

function memberName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (["MemberExpression", "OptionalMemberExpression"].includes(node.type)) {
    const object = memberName(node.object);
    const property = node.computed ? (node.property.type === "StringLiteral" ? node.property.value : "") : memberName(node.property);
    return object && property ? `${object}.${property}` : "";
  }
  return "";
}

function propertyName(node) {
  return node?.type === "Identifier" || node?.type === "StringLiteral" ? node.name ?? node.value : "";
}

function identifierName(node) {
  return node?.type === "Identifier" ? node.name : "";
}
