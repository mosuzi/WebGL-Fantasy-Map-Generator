#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parse} from "@babel/parser";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createUserVisualThemeDocument, replaceUserVisualThemes} from "../app/webgl-generator/src/renderer/themes.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {captureVisualThemeState, createSetUserVisualThemesCommand} from "../app/webgl-generator/src/runtime/visual-theme-edit-commands.js";

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const appAst = parse(appSource, {sourceType: "module", plugins: ["importAttributes"]});
for (const [name, contract] of [
  ["createRuntimeVisualTheme", /presentationPreset:\s*document\.id/u],
  ["importRuntimeVisualTheme", /presentationPreset:\s*options\.select\s*===\s*false\s*\?\s*before\.presentationPreset\s*:\s*document\.id/u],
  ["updateRuntimeVisualTheme", /presentationPreset:\s*id/u],
  ["deleteRuntimeVisualTheme", /presentationPreset:\s*before\.presentationPreset\s*===\s*id\s*\?\s*"default"\s*:\s*before\.presentationPreset/u]
]) {
  assert.match(functionSource(name), contract, `${name} 没有显式维护独立 live presentation preset`);
}

replaceUserVisualThemes([]);
const userTheme = createUserVisualThemeDocument({label: "R4a 边界主题", baseThemeId: "default"});
userTheme.colors = {...userTheme.colors, land: "#123456", water: "#234567"};

const historyMap = createCanonicalThemeMap("task-350-r4a-theme-history");
const history = new EditHistory();
const before = captureVisualThemeState(historyMap, "ancient");
assert.equal(before.preset, "default", "canonical before-image 被 live theme 覆盖");
assert.equal(before.presentationPreset, "ancient", "live theme 没有独立进入 before-image");
const after = {preset: userTheme.id, presentationPreset: userTheme.id, userThemes: [userTheme]};
const command = createSetUserVisualThemesCommand(before, after, {label: "创建用户主题"});
history.execute(command, {map: historyMap});
assert.equal(historyMap.visualTheme.preset, userTheme.id);
assert.equal(command.getPresentationPreset(), userTheme.id);
history.undo({map: historyMap});
assert.equal(historyMap.visualTheme.preset, "default", "undo 没有恢复 canonical preset");
assert.equal(historyMap.options.visualTheme, "default", "undo 没有恢复 canonical options preset");
assert.equal(command.getPresentationPreset(), "ancient", "undo 没有恢复独立 live preset");
history.redo({map: historyMap});
assert.equal(historyMap.visualTheme.preset, userTheme.id, "redo 没有恢复 canonical preset");
assert.equal(command.getPresentationPreset(), userTheme.id, "redo 没有恢复 live preset");

const exportMap = createCanonicalThemeMap("task-350-r4a-theme-export");
const exportSource = structuredClone(exportMap);
const document = createMapDocument(
  exportMap,
  {...exportMap.options, visualTheme: userTheme.id},
  {visualThemeDocument: userTheme}
);
assert.deepEqual(exportMap, exportSource, "registry-only theme 投影回写了 canonical source");
assert.equal(document.map.visualTheme.preset, userTheme.id);
assert.equal(document.map.visualTheme.userThemes.length, 1, "active registry-only user theme 未嵌入存档");
assert.equal(document.map.visualTheme.userThemes[0].id, userTheme.id);
assert.equal(document.map.visualTheme.userThemes[0].colors.land, "#123456");
const imported = parseMapDocument(stringifyMapDocument(document));
assert.equal(imported.map.visualTheme.userThemes[0].colors.water, "#234567", "用户主题颜色未通过导出/导入往返");

console.log(JSON.stringify({
  ok: true,
  history: {
    canonicalUndo: "default",
    liveUndo: "ancient",
    canonicalRedo: historyMap.visualTheme.preset,
    liveRedo: command.getPresentationPreset()
  },
  portableTheme: {
    id: document.map.visualTheme.userThemes[0].id,
    land: document.map.visualTheme.userThemes[0].colors.land,
    water: imported.map.visualTheme.userThemes[0].colors.water
  }
}, null, 2));

function createCanonicalThemeMap(seed) {
  const map = generatePlaceholderMap({seed, cellsTarget: 1000, heightmapTemplate: "continents"});
  map.options = {...map.options, visualTheme: "default"};
  map.visualTheme = {version: 2, preset: "default", overrides: {}, userThemes: []};
  return map;
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
