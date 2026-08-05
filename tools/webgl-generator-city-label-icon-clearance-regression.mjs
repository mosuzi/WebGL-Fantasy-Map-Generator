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
import {CITY_ICON_BASE_CSS_SIZE} from "../app/webgl-generator/src/renderer/city-icon-layer.js";

const iconHeight = CITY_ICON_BASE_CSS_SIZE.height;
const scales = [0.69, 0.87, 1.0614];
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

const [rendererSource, cityLayerSource, stylesSource, mapIoSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/renderer/city-icon-layer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);

assert.match(rendererSource, /cityIconItemsById = new Map/, "渲染器没有建立城镇标签到自身图标的稳定映射");
assert.match(rendererSource, /Boolean\(cityIcon\) && renderer\.layerVisibility\.cities !== false/, "城镇标签净空没有遵守图标图层显隐");
assert.match(rendererSource, /cityIconScale\(12, cityIcon\)/, "城镇标签没有使用稳定的最大图标净空，缩放时仍可能上下跳位");
assert.deepEqual(CITY_ICON_BASE_CSS_SIZE, {width: 12.5, height: 9.5}, "WebGL 图标与标签净空的基准盒漂移");
assert.match(rendererSource, /const CITY_ICON_BASE_WIDTH = CITY_ICON_BASE_CSS_SIZE\.width;/, "城镇碰撞宽度没有复用 WebGL 基准盒");
assert.match(rendererSource, /const CITY_ICON_BASE_HEIGHT = CITY_ICON_BASE_CSS_SIZE\.height;/, "城镇碰撞高度没有复用 WebGL 基准盒");
assert.match(rendererSource, /applyFixedScreenLabelPlacement\(item\.node, baseScreen, labelAnchor\)/, "城镇标签没有把世界锚点与固定屏幕净空分离");
assert.match(rendererSource, /item\.targetKind === LABEL_TARGET_KIND\.CITY[\s\S]*top: anchorY - estimatedHeight,[\s\S]*bottom: anchorY/, "城镇标签碰撞盒没有同步到新锚点");
assert.match(stylesSource, /\.map-label-content\s*\{[\s\S]*translate\(-50%, -100%\)/, "城镇标签内容不再以上边文字盒锚定");
assert.match(cityLayerSource, /anchorBacking = vec2\(0\.0, sizeBacking\.y \* 0\.32\)/, "WebGL 城镇图标顶部锚点与净空模型不一致");
assert.match(mapIoSource, /copyWebglCanvasTo2d\(context, canvas, options\.renderer, exportFrame\.sourceRect, options\.overlays\?\.cityIcons !== false\)/, "PNG 没有把城镇显隐传给 WebGL 合成");
assert.doesNotMatch(mapIoSource, /selectors\.push\("\.city-map-icon\.visible"\)/, "PNG 仍在二次叠加旧 DOM 城镇图标");
assert.match(mapIoSource, /overlays\?\.labels[\s\S]*selectors\.push\(\.\.\.PNG_SEMANTIC_LABEL_SELECTORS\)/, "PNG 没有复用语义标签生产契约");

console.log(JSON.stringify({
  ok: true,
  iconScales: scales,
  gap: CITY_LABEL_ICON_GAP,
  hiddenOffset: CITY_LABEL_BASE_OFFSET
}, null, 2));
