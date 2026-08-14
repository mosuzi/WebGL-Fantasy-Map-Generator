import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {KEYBOARD_SHORTCUTS} from "../app/webgl-generator/src/runtime/keyboard-shortcuts.js";

for (const id of ["view.height", "view.biomes", "view.diplomacy", "view.states"]) {
  const selector = KEYBOARD_SHORTCUTS.find(item => item.id === id)?.selector || "";
  assert.match(selector, /\.el-segmented__item:nth-of-type\(\d+\)$/);
  assert.doesNotMatch(selector, /nth-child/);
}

const [segmentedSource, schemaSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiSegmented.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/api-schema-registry.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);
assert.match(segmentedSource, /const displayValue = computed\(\(\) => props\.dataMode \? props\.modelValue : currentValue\.value\)/);
assert.match(segmentedSource, /if \(!props\.dataMode\) currentValue\.value = value;/);
assert.match(schemaSource, /\["height", "temperature", "precipitation", "biomes", "cultures", "religions", "diplomacy", "governments", "states", "provinces", "regions", "population"\]/);
assert.match(appSource, /stage === lastProgressStage && current - lastProgressAt < 80/);

console.log(JSON.stringify({ok: true, viewShortcuts: 4, committedHighlight: true, canonicalModes: true, progressThrottleMs: 80}));
