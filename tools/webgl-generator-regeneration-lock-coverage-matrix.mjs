#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {REGENERATION_LOCK_KINDS} from "../app/webgl-generator/src/runtime/regeneration-locks.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputJson = resolve(root, "docs/audits/regeneration-lock-coverage-matrix.json");
const outputMarkdown = resolve(root, "docs/audits/regeneration-lock-coverage-matrix.md");

const panels = Object.freeze([
  panel("state", "StatePanel.vue", ["state"]),
  panel("province", "ProvincePanel.vue", ["province"]),
  panel("city", "CityPanel.vue", ["city"]),
  panel("route", "RoutePanel.vue", ["route"]),
  panel("river", "RiverPanel.vue", ["river"]),
  panel("marker", "MarkerPanel.vue", ["marker"]),
  panel("diplomacy", "DiplomacyPanel.vue", ["diplomacy-relation"]),
  panel("religion", "ReligionPanel.vue", ["religion"]),
  panel("culture", "CulturePanel.vue", ["culture"]),
  panel("military", "MilitaryPanel.vue", ["military"]),
  panel("zone", "ZonePanel.vue", ["zone"]),
  panel("feature", "FeaturePanel.vue", ["feature"]),
  panel("ocean-current", "OceanCurrentPanel.vue", ["ocean-current"]),
  panel("economy", "EconomyPanel.vue", ["economy-market", "trade-flow"])
]);

const allKinds = [...REGENERATION_LOCK_KINDS];
const entries = Object.freeze([
  entry("generate.regenerate:features", ["feature"], "D"),
  entry("generate.regenerate:routes", ["route"], "C"),
  entry("generate.regenerate:rivers", ["river", "route"], "C"),
  entry("generate.regenerate:cities", ["city", "route"], "C"),
  entry("generate.regenerate:states", ["state", "province", "city", "route"], "D"),
  entry("generate.regenerate:provinces", ["province", "city", "route"], "D"),
  entry("generate.regenerate:markers", ["marker"], "C"),
  entry("generate.regenerate:diplomacy", ["diplomacy-relation"], "E"),
  entry("generate.regenerate:religions", ["religion"], "D"),
  entry("generate.regenerate:military", ["military"], "E"),
  entry("generate.regenerate:zones", ["zone"], "C"),
  entry("oceanCurrents.regenerate", ["ocean-current"], "C"),
  entry("oceanCurrents.rebuildWorld", allKinds, "E"),
  entry("climate.applyDownstreamRebuild", ["river", "route", "religion", "marker", "diplomacy-relation", "military", "zone", "economy-market", "trade-flow"], "E"),
  entry("edit.height.applySeafloorReset", allKinds, "E"),
  entry("edit.height.rebuildBaseDerived", ["feature", "ocean-current", "river", "route", "city", "state", "province"], "E"),
  entry("edit.height.rebuildDownstreamDerived", ["religion", "marker", "diplomacy-relation", "military", "zone", "economy-market", "trade-flow"], "E"),
  entry("edit.height.rebuildAllDerived", allKinds, "E"),
  entry("edit.cultures.applyExpansion:reexpand", ["culture"], "D"),
  entry("edit.religions.applyExpansion:reexpand", ["religion"], "D"),
  entry("edit.economy.assignCells", ["economy-market", "trade-flow"], "E"),
  entry("edit.economy.rebuild", ["economy-market", "trade-flow"], "E")
]);

const declaredMethods = new Set(Object.entries(API_METHODS).flatMap(([namespace, methods]) => methods.map(method => `${namespace}.${method}`)));
const panelKinds = [...new Set(panels.flatMap(item => item.kinds))].sort();
const declaredKinds = [...allKinds].sort();
const missingKinds = declaredKinds.filter(kind => !panelKinds.includes(kind));
const extraKinds = panelKinds.filter(kind => !declaredKinds.includes(kind));
const missingPanels = panels.filter(item => !existsSync(resolve(root, "app/webgl-generator/src/ui/vue/components", item.component))).map(item => item.component);
const missingApiMethods = entries
  .map(item => item.id.split(":")[0])
  .filter((method, index, values) => values.indexOf(method) === index && !declaredMethods.has(method));
const unknownEntryKinds = [...new Set(entries.flatMap(item => item.kinds).filter(kind => !declaredKinds.includes(kind)))];
const unclassifiedKinds = declaredKinds.filter(kind => !entries.some(item => item.kinds.includes(kind)));

const matrix = {
  schemaVersion: 1,
  denominator: {panels: panels.length, lockKinds: declaredKinds.length, regenerationEntries: entries.length},
  panels,
  lockKinds: declaredKinds,
  regenerationEntries: entries,
  differences: {missingKinds, extraKinds, missingPanels, missingApiMethods, unknownEntryKinds, unclassifiedKinds},
  totals: {
    differences: missingKinds.length + extraKinds.length + missingPanels.length + missingApiMethods.length + unknownEntryKinds.length + unclassifiedKinds.length,
    implementationStages: Object.fromEntries(["C", "D", "E"].map(stage => [stage, entries.filter(item => item.implementationStage === stage).length]))
  }
};

assert.equal(matrix.denominator.panels, 14);
assert.equal(matrix.denominator.lockKinds, 15);
assert.equal(matrix.denominator.regenerationEntries, 22);
assert.deepEqual(matrix.differences, {
  missingKinds: [],
  extraKinds: [],
  missingPanels: [],
  missingApiMethods: [],
  unknownEntryKinds: [],
  unclassifiedKinds: []
});

const json = `${JSON.stringify(matrix, null, 2)}\n`;
const markdown = renderMarkdown(matrix);
const check = process.argv.includes("--check");
writeOrCheck(outputJson, json, check);
writeOrCheck(outputMarkdown, markdown, check);
console.log(JSON.stringify({ok: true, check, denominator: matrix.denominator, differences: matrix.totals.differences}, null, 2));

function panel(id, component, kinds) {
  return {id, component, kinds};
}

function entry(id, kinds, implementationStage) {
  return {id, kinds: [...kinds].sort(), implementationStage, classified: true};
}

function renderMarkdown(value) {
  return [
    "# 重生成锁定覆盖矩阵",
    "",
    "> 本报告由 `tools/webgl-generator-regeneration-lock-coverage-matrix.mjs` 从当前对象类型与公开 API 目录生成。阶段 A 只完成分类闭包；生成保护分别在阶段 C～E 实现。",
    "",
    "## 分母",
    "",
    `- 列表页：${value.denominator.panels}`,
    `- 可锁定行类型：${value.denominator.lockKinds}`,
    `- 重生成入口：${value.denominator.regenerationEntries}`,
    `- 双向差集：${value.totals.differences}`,
    "",
    "## 列表页与行类型",
    "",
    ...value.panels.map(item => `- \`${item.component}\`：${item.kinds.map(kind => `\`${kind}\``).join("、")}`),
    "",
    "## 重生成入口分类",
    "",
    ...value.regenerationEntries.map(item => `- \`${item.id}\`：${item.kinds.join("、")}（阶段 ${item.implementationStage}）`),
    ""
  ].join("\n");
}

function writeOrCheck(path, content, check) {
  if (check) {
    assert.equal(readFileSync(path, "utf8"), content, `矩阵产物已陈旧：${relative(root, path)}`);
    return;
  }
  writeFileSync(path, content);
}
