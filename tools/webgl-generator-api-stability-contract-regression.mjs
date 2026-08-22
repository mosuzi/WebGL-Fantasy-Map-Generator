#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  API_METHODS,
  API_STABILITY,
  API_VERSION,
  CONFIRM_REQUIRED_METHODS,
  buildApiContract,
  buildApiVersionContract,
  groupQualifiedMethodNames
} from "../app/webgl-generator/src/runtime/api-contract.js";

const rawMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [namespace,
  Object.fromEntries(methods.map(method => [method, {
    stable: "draft",
    mutates: "none",
    undoable: false,
    async: false,
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`)
  }]))
]));
const apiContract = buildApiContract(API_METHODS, rawMetadata);
const version = buildApiVersionContract();
const capabilities = {
  ...apiContract,
  methods: API_METHODS,
  safety: {confirmRequiredMethods: CONFIRM_REQUIRED_METHODS}
};

assert.equal(API_VERSION, "1.0.0", "根 API 版本没有提升为 1.0.0");
assert.equal(API_STABILITY, "stable", "根 API 没有提升为 stable");
assert.deepEqual(version, {
  apiVersion: "1.0.0",
  stability: "stable",
  capabilitySchemaVersion: "1.0.0",
  compatibilityPolicyVersion: "1.0.0"
}, "版本接口契约不完整");
assert.equal(capabilities.contract?.stableCompatibility, "same-major", "缺少同主版本兼容策略");
assert.equal(capabilities.contract?.deprecatedRemoval, "next-major-only", "缺少 deprecated 移除策略");
assert.equal(Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0), 329, "公开方法基线发生变化");
assert.deepEqual(capabilities.stabilitySummary, {stable: 320, experimental: 8, deprecated: 1}, "稳定等级统计错误");

const metadataEntries = flattenMetadata(capabilities.methodMetadata);
assert.equal(metadataEntries.length, 329, "方法元数据数量错误");
for (const [qualifiedName, metadata] of metadataEntries) {
  for (const field of ["stable", "stability", "since", "capabilityGroup", "mutates", "undoable", "async", "requiresConfirm"]) {
    assert(Object.prototype.hasOwnProperty.call(metadata, field), `${qualifiedName} 缺少 ${field}`);
  }
  assert(capabilities.capabilityGroups?.[metadata.capabilityGroup], `${qualifiedName} 引用了未声明能力组 ${metadata.capabilityGroup}`);
  assert.equal(metadata.stable, metadata.stability, `${qualifiedName} 的稳定等级兼容字段不一致`);
}

for (const qualifiedName of [
  "info.mapSummary",
  "selection.locate",
  "layers.setVisible",
  "units.apply",
  "history.undo",
  "data.exportMap",
  "data.importMap",
  "edit.states.rename"
]) {
  assert.equal(getMetadata(capabilities, qualifiedName).stability, "stable", `${qualifiedName} 没有进入稳定集合`);
}
for (const method of capabilities.methods.debug) {
  assert.equal(getMetadata(capabilities, `debug.${method}`).stability, "experimental", `debug.${method} 不应提升为 stable`);
}

const deprecatedExport = getMetadata(capabilities, "data.exportAll");
assert.equal(deprecatedExport.stability, "deprecated", "data.exportAll 没有标记 deprecated");
assert.equal(deprecatedExport.deprecated?.replacement, "data.exportMap", "data.exportAll 缺少替代入口");
assert.equal(deprecatedExport.deprecated?.removeNotBefore, "2.0.0", "data.exportAll 缺少最早移除版本");

const aliases = capabilities.compatibility?.aliases || [];
assert.deepEqual(aliases.map(item => item.alias), ["window.api", "data.exportAll"], "兼容别名目录错误");
const requiredFromMetadata = metadataEntries
  .filter(([, metadata]) => metadata.requiresConfirm)
  .map(([qualifiedName]) => qualifiedName)
  .sort();
assert.deepEqual(requiredFromMetadata, [...capabilities.safety.confirmRequiredMethods].sort(), "确认策略与方法元数据不一致");
assert.deepEqual(groupQualifiedMethodNames(CONFIRM_REQUIRED_METHODS).edit, [
  "height.rebuildBaseDerived",
  "height.rebuildDownstreamDerived",
  "height.rebuildAllDerived",
  "height.applySeafloorReset",
  "notes.deleteBatch",
  "cities.delete",
  "provinces.delete",
  "states.delete",
  "cultures.delete",
  "religions.delete",
  "rivers.delete",
  "lakes.delete",
  "military.clearBattleEvents",
  "economy.assignCells",
  "economy.rebuild",
  "states.merge",
  "states.split",
  "states.transferTerritory",
  "provinces.transfer",
  "provinces.merge",
  "provinces.split",
  "provinces.reassessCapitals",
  "diplomacy.declareWar",
  "diplomacy.makePeace",
  "diplomacy.changeOverlord",
  "military.resolveBattle",
  "features.applyTopology",
  "population.transfer"
], "嵌套编辑确认分组丢失方法路径");

assert.throws(() => buildApiContract(API_METHODS, {...rawMetadata, info: {...rawMetadata.info, version: undefined}}), /缺少原始元数据：info\.version/, "缺失方法元数据没有阻止契约生成");
assert.throws(() => buildApiContract(API_METHODS, {...rawMetadata, info: {...rawMetadata.info, ghost: rawMetadata.info.version}}), /未声明方法：info\.ghost/, "多余方法元数据没有阻止契约生成");
assert.throws(() => buildApiContract(API_METHODS, {...rawMetadata, info: {...rawMetadata.info, version: {stable: "draft"}}}), /缺少 mutates：info\.version/, "不完整方法元数据没有阻止契约生成");
assert.throws(() => buildApiContract(API_METHODS, {...rawMetadata, info: {...rawMetadata.info, version: {...rawMetadata.info.version, requiresConfirm: true}}}), /确认策略不一致：info\.version/, "确认元数据漂移没有阻止契约生成");

const [consoleApiSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);
assert.match(consoleApiSource, /version: API_VERSION,[\s\S]*stability: API_STABILITY,/, "根 API 没有复用稳定版本常量");
assert.match(consoleApiSource, /view\.webglGeneratorApi = api;\s*if \(!view\.api\) view\.api = api;/, "window.api 兼容别名安装条件发生变化");
assert.match(consoleApiSource, /const methods = API_METHODS;/, "运行时能力表没有复用统一方法目录");
assert.match(consoleApiSource, /buildApiContract\(methods, buildMethodMetadata\(\)\)/, "运行时能力表没有应用稳定契约");
assert.equal((consoleApiSource.match(/\{stable: "draft", mutates:/g) || []).length, 329, "运行时原始副作用元数据数量发生变化");
assert.equal((consoleApiSource.match(/requiresConfirm: true/g) || []).length, CONFIRM_REQUIRED_METHODS.length, "运行时确认元数据数量与确认目录不一致");
for (const qualifiedName of CONFIRM_REQUIRED_METHODS) {
  const method = qualifiedName.startsWith("edit.") ? qualifiedName.slice(5) : qualifiedName.split(".").at(-1);
  const key = qualifiedName.startsWith("edit.") ? `"${method}"` : method;
  const linePattern = new RegExp(`${escapeRegExp(key)}: \\{stable: "draft",[^\\n]+requiresConfirm: true\\}`);
  assert.match(consoleApiSource, linePattern, `${qualifiedName} 没有保持显式确认元数据`);
}
assert.match(appSource, /exportAll: \(options = \{\}\) => exportAllMapData\(state, documentRef, options\),\s*exportMap: \(options = \{\}\) => exportAllMapData\(state, documentRef, options\),/, "data.exportAll 与 data.exportMap 没有复用同一公共 action");

console.log(JSON.stringify({
  ok: true,
  version,
  methods: metadataEntries.length,
  stabilitySummary: capabilities.stabilitySummary,
  capabilityGroups: Object.keys(capabilities.capabilityGroups).length,
  aliases: aliases.map(({alias, target, status}) => ({alias, target, status})),
  confirmRequiredMethods: requiredFromMetadata.length
}, null, 2));

function flattenMetadata(methodMetadata) {
  return Object.entries(methodMetadata || {}).flatMap(([namespace, methods]) =>
    Object.entries(methods || {}).map(([method, metadata]) => [`${namespace}.${method}`, metadata])
  );
}

function getMetadata(capabilities, qualifiedName) {
  const [namespace, ...parts] = qualifiedName.split(".");
  const metadata = capabilities.methodMetadata?.[namespace]?.[parts.join(".")];
  assert(metadata, `缺少方法元数据：${qualifiedName}`);
  return metadata;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
