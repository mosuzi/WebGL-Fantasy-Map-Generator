#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  CITY_ICON_TOP_ANCHOR_RATIO,
  CITY_LABEL_BASE_OFFSET,
  CITY_LABEL_ICON_GAP,
  cityLabelAnchorOffset,
  cityLabelIconGap
} from "../app/webgl-generator/src/renderer/city-label-icon-layout.js";

const iconHeight = 26;
const scales = [0.72, 1, 1.18];
for (const iconScale of scales) {
  const offset = cityLabelAnchorOffset({iconVisible: true, iconHeight, iconScale});
  const gap = cityLabelIconGap({
    labelAnchorY: 100 + offset,
    iconAnchorY: 100,
    iconHeight,
    iconScale
  });
  assert.equal(Math.round(gap * 100) / 100, CITY_LABEL_ICON_GAP, `图标缩放 ${iconScale} 下没有保持城镇标签净空`);
}
assert.equal(cityLabelAnchorOffset({iconVisible: false, iconHeight, iconScale: 1.18}), -CITY_LABEL_BASE_OFFSET, "图标隐藏时城镇标签没有恢复原位置");
assert.equal(CITY_ICON_TOP_ANCHOR_RATIO, 0.8, "城镇图标顶部锚点比例发生漂移");

const [rendererSource, stylesSource, mapIoSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);

assert.match(rendererSource, /cityIconItemsById = new Map/, "渲染器没有建立城镇标签到自身图标的稳定映射");
assert.match(rendererSource, /renderer\.layerVisibility\.cities !== false && scale >= cityIcon\.minScale/, "城镇标签净空没有遵守图标图层和缩放显隐");
assert.match(rendererSource, /setOverlayNodePosition\(item\.node, labelAnchor\.x, labelAnchor\.y\)/, "城镇标签没有应用净空后的锚点");
assert.match(rendererSource, /item\.targetKind === LABEL_TARGET_KIND\.CITY[\s\S]*top: anchorY - estimatedHeight,[\s\S]*bottom: anchorY/, "城镇标签碰撞盒没有同步到新锚点");
assert.match(stylesSource, /\.city-label,\s*\.custom-label\s*\{[\s\S]*translate\(-50%, -100%\)/, "城镇标签不再以上边文字盒锚定");
assert.match(stylesSource, /\.city-map-icon\s*\{[\s\S]*translate\(-50%, -80%\)/, "城镇图标顶部锚点与净空模型不一致");
assert.match(mapIoSource, /\.city-map-icon\.visible[\s\S]*\.city-label\.visible/, "PNG 没有同时复用城镇图标与标签可见集合");

console.log(JSON.stringify({
  ok: true,
  iconScales: scales,
  gap: CITY_LABEL_ICON_GAP,
  hiddenOffset: CITY_LABEL_BASE_OFFSET
}, null, 2));
