#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {PNG_OVERLAY_KEYS} from "../app/webgl-generator/src/runtime/map-file-io.js";

const [rendererSource, controlPanelSource, panelSource, stylesSource, appSource, configStoreSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/stores/global-config-store.js", import.meta.url), "utf8")
]);

assert.match(rendererSource, /scaleBar: true,\s+mapBadge: true,/, "地图总尺寸没有默认显示");
assert.match(controlPanelSource, /\{id: "mapBadge", label: "地图总尺寸"\}/, "图层页缺少地图总尺寸开关");
assert.match(panelSource, /mapBadge\.hidden = stats\.layerVisibility\?\.mapBadge === false;/, "实时面板刷新没有同步地图总尺寸显隐");
assert.match(panelSource, /mapBadge\.textContent = `\$\{formatDisplayDistance\(map\.metadata\.graphWidth, unitPreferences\)\} x \$\{formatDisplayDistance\(map\.metadata\.graphHeight, unitPreferences\)\}`;/, "隐藏能力破坏了地图总尺寸的显示单位换算");
assert.match(stylesSource, /\.map-badge\[hidden\],\s*\.map-badge:empty\s*\{\s*display: none;/, "地图总尺寸的 hidden 状态没有可靠隐藏");
assert.match(appSource, /onLayerVisible: \(layer, visible\) => runtimeActions\.layers\.setVisible\(layer, visible\)/, "图层按钮没有复用公开显隐动作");
assert.match(appSource, /updateLayerPreference\(documentRef, nextLayer, nextVisible\);[\s\S]*state\.renderer\?\.setLayerVisible\?\.\(nextLayer, nextVisible\);[\s\S]*updateRuntimePanel\(documentRef, state\);/, "图层公开动作没有覆盖偏好、渲染器和实时面板");
assert.match(configStoreSource, /layers: Object\.freeze\(\{\}\)/, "旧偏好缺少新字段时不再保留渲染器默认值");
assert(!PNG_OVERLAY_KEYS.includes("mapBadge"), "地图总尺寸不应静默加入 PNG overlay 契约");

console.log(JSON.stringify({
  ok: true,
  layer: "mapBadge",
  defaultVisible: true,
  persistedBy: "webgl-generator-control-preferences",
  pngOverlay: false
}, null, 2));
