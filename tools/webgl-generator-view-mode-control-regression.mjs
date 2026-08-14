import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {KEYBOARD_SHORTCUTS} from "../app/webgl-generator/src/runtime/keyboard-shortcuts.js";

for (const id of ["view.height", "view.biomes", "view.diplomacy", "view.states"]) {
  const selector = KEYBOARD_SHORTCUTS.find(item => item.id === id)?.selector || "";
  assert.match(selector, /\.el-segmented__item:nth-of-type\(\d+\)$/);
  assert.doesNotMatch(selector, /nth-child/);
}

const [segmentedSource, panelSource, schemaSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiSegmented.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/api-schema-registry.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);
assert.match(segmentedSource, /const displayValue = computed\(\(\) => props\.dataMode \? props\.modelValue : currentValue\.value\)/);
assert.match(segmentedSource, /if \(!props\.dataMode\) \{[\s\S]*?emit\("select", value\);[\s\S]*?return;/);
assert.match(segmentedSource, /bridgeButtons\.value\.find[\s\S]*?dispatchEvent\(new MouseEvent\("click", \{bubbles: true\}\)\)/);
assert.doesNotMatch(segmentedSource, /@click="commitValue/);
const bindRuntimePanelSource = panelSource.slice(
  panelSource.indexOf("export function bindRuntimePanel"),
  panelSource.indexOf("function bindMapCellTargetInput")
);
assert.match(bindRuntimePanelSource, /documentRef\.addEventListener\("click", event => \{[\s\S]*?event\.target\?\.closest\?\.\(VIEW_MODE_SELECTOR\)[\s\S]*?handlers\.onMode\(button\.dataset\.mode\)/);
assert.doesNotMatch(bindRuntimePanelSource, /querySelectorAll\(VIEW_MODE_SELECTOR\)/);
assert.doesNotMatch(bindRuntimePanelSource, /setActiveModeButton\(documentRef, button\.dataset\.mode\)/);
assert.match(schemaSource, /\["height", "temperature", "precipitation", "biomes", "cultures", "religions", "diplomacy", "governments", "states", "provinces", "regions", "population"\]/);
assert.match(appSource, /stage === lastProgressStage && current - lastProgressAt < 80/);
assert.match(appSource, /const onCommitted = \(\) => restoreRuntimeDisplayControls\(state, documentRef\)/);
assert.match(appSource, /viewportIndependent = layers\.length === 1 && layers\[0\] === "surface"/);
assert.match(appSource, /createWorkerRegenerationRenderContextToken\(state, "display", tokenOptions\)/);
assert.match(appSource, /function createWorkerRegenerationRenderContextToken\(state, targetKind, \{includeViewport = true\} = \{\}\)/);
assert.match(appSource, /state\.renderer\?\.setColorMode\?\.\(nextMode\);[\s\S]*?if \(state\.renderer\?\.colorMode === nextMode\) \{/);

console.log(JSON.stringify({ok: true, viewShortcuts: 4, committedHighlight: true, delegatedBridge: true, singleIntent: true, viewportIndependentSurface: true, canonicalModes: true, progressThrottleMs: 80}));
