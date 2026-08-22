#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parse} from "@babel/parser";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  createUserVisualThemeDocument,
  listUserVisualThemeDocuments,
  replaceUserVisualThemes,
  updateUserVisualThemeDocument
} from "../app/webgl-generator/src/renderer/themes.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {captureVisualThemeState, createSetUserVisualThemesCommand} from "../app/webgl-generator/src/runtime/visual-theme-edit-commands.js";

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const appAst = parse(appSource, {sourceType: "module", plugins: ["importAttributes"]});
for (const name of ["createRuntimeVisualTheme", "importRuntimeVisualTheme", "updateRuntimeVisualTheme"]) {
  const source = functionSource(name);
  assert.match(source, /userThemes:\s*upsertVisualThemeDocuments\(before\.userThemes,\s*(?:document|updatedDocument)\)/u, `${name} 没有独立更新 canonical themes`);
  assert.match(source, /registryUserThemes:\s*upsertVisualThemeDocuments\(before\.registryUserThemes,\s*(?:document|updatedDocument)\)/u, `${name} 没有独立更新 registry themes`);
}
const deleteSource = functionSource("deleteRuntimeVisualTheme");
assert.match(deleteSource, /userThemes:\s*removeVisualThemeDocument\(before\.userThemes,\s*id\)/u, "delete 没有独立删除 canonical theme");
assert.match(deleteSource, /registryUserThemes:\s*removeVisualThemeDocument\(before\.registryUserThemes,\s*id\)/u, "delete 没有独立删除 registry theme");

const registryOnly = createUserVisualThemeDocument({label: "Registry Only", baseThemeId: "default"});
registryOnly.colors = {...registryOnly.colors, land: "#314159"};
const created = createUserVisualThemeDocument({label: "Created Boundary", baseThemeId: "default"});
const imported = createUserVisualThemeDocument({label: "Imported Boundary", baseThemeId: "default"});
const updated = {...registryOnly, colors: {...registryOnly.colors, land: "#271828"}};

runCase("create", {
  liveBefore: "ancient",
  after: before => ({
    preset: created.id,
    presentationPreset: created.id,
    userThemes: upsert(before.userThemes, created),
    registryUserThemes: upsert(before.registryUserThemes, created)
  }),
  redoCanonical: [created.id],
  redoRegistry: [registryOnly.id, created.id],
  redoLive: created.id
});
runCase("import-select-false", {
  liveBefore: "ancient",
  after: before => ({
    preset: before.preset,
    presentationPreset: before.presentationPreset,
    userThemes: upsert(before.userThemes, imported),
    registryUserThemes: upsert(before.registryUserThemes, imported)
  }),
  redoCanonical: [imported.id],
  redoRegistry: [registryOnly.id, imported.id],
  redoLive: "ancient"
});
runCase("update-registry-only", {
  liveBefore: registryOnly.id,
  after: before => ({
    preset: registryOnly.id,
    presentationPreset: registryOnly.id,
    userThemes: upsert(before.userThemes, updated),
    registryUserThemes: upsert(before.registryUserThemes, updated)
  }),
  redoCanonical: [registryOnly.id],
  redoRegistry: [registryOnly.id],
  redoLive: registryOnly.id,
  redoLand: "#271828"
});
runCase("delete-current", {
  liveBefore: registryOnly.id,
  after: before => ({
    preset: before.preset,
    presentationPreset: "default",
    userThemes: remove(before.userThemes, registryOnly.id),
    registryUserThemes: remove(before.registryUserThemes, registryOnly.id)
  }),
  redoCanonical: [],
  redoRegistry: [],
  redoLive: "default"
});
runCase("delete-non-current", {
  liveBefore: "ancient",
  after: before => ({
    preset: before.preset,
    presentationPreset: before.presentationPreset,
    userThemes: remove(before.userThemes, registryOnly.id),
    registryUserThemes: remove(before.registryUserThemes, registryOnly.id)
  }),
  redoCanonical: [],
  redoRegistry: [],
  redoLive: "ancient"
});

console.log(JSON.stringify({ok: true, cases: 5, registrySuperset: true, canonicalUndoExact: true, registryUndoExact: true}, null, 2));

function runCase(label, {liveBefore, after, redoCanonical, redoRegistry, redoLive, redoLand = null}) {
  replaceUserVisualThemes([registryOnly]);
  const map = createCanonicalThemeMap(`task-350-r4a-registry-${label}`);
  const mapBefore = structuredClone(map);
  const registryBefore = listUserVisualThemeDocuments();
  const before = captureVisualThemeState(map, liveBefore);
  assert.deepEqual(before.userThemes, [], `${label}: canonical themes before-image 被 registry 污染`);
  assert.deepEqual(before.registryUserThemes.map(document => document.id), [registryOnly.id], `${label}: registry before-image 缺失`);
  const command = createSetUserVisualThemesCommand(before, after(before), {label});
  const history = new EditHistory();
  history.execute(command, {map});
  history.undo({map});
  assert.deepEqual(map, mapBefore, `${label}: undo 没有精确恢复 canonical map`);
  assert.deepEqual(listUserVisualThemeDocuments(), registryBefore, `${label}: undo 没有精确恢复 registry`);
  assert.equal(command.getPresentationPreset(), liveBefore, `${label}: undo 没有恢复 live preset`);
  history.redo({map});
  assert.deepEqual(map.visualTheme.userThemes.map(document => document.id), redoCanonical, `${label}: redo canonical themes 错误`);
  assert.deepEqual(listUserVisualThemeDocuments().map(document => document.id), redoRegistry, `${label}: redo registry themes 错误`);
  assert.equal(command.getPresentationPreset(), redoLive, `${label}: redo live preset 错误`);
  if (redoLand) {
    assert.equal(map.visualTheme.userThemes[0].colors.land, redoLand, `${label}: canonical colors 未更新`);
    assert.equal(updateUserVisualThemeDocument(registryOnly.id, {}).colors.land, redoLand, `${label}: registry colors 未更新`);
  }
}

function createCanonicalThemeMap(seed) {
  const map = generatePlaceholderMap({seed, cellsTarget: 1000, heightmapTemplate: "continents"});
  map.options = {...map.options, visualTheme: "default"};
  map.visualTheme = {version: 2, preset: "default", overrides: {}, userThemes: []};
  return map;
}

function upsert(documents, document) {
  const next = documents.map(item => ({...item, colors: {...item.colors}}));
  const index = next.findIndex(item => item.id === document.id);
  const clone = {...document, colors: {...document.colors}};
  if (index >= 0) next.splice(index, 1, clone);
  else next.push(clone);
  return next;
}

function remove(documents, id) {
  return documents.filter(document => document.id !== id).map(document => ({...document, colors: {...document.colors}}));
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
