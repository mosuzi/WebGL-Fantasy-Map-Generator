#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  MILITARY_LABEL_BACKGROUND_ALPHA,
  resolveMilitaryLabelPalette
} from "../app/webgl-generator/src/renderer/military-label-palette.js";

const stateColors = ["#b7c8f3", "#f6b6c8", "#abe7c1", "#f8dda1", "#cbbdf1", "#aee3e8"];
const palettes = stateColors.map(resolveMilitaryLabelPalette);
const backgrounds = new Set(palettes.map(palette => palette.background));
const borders = new Set(palettes.map(palette => palette.border));
const textColor = [247, 229, 173];
const contrasts = palettes.map(palette => contrastRatio(parseRgba(palette.background), textColor));

assert.equal(MILITARY_LABEL_BACKGROUND_ALPHA, 0.42, "军事标签透明底板发生漂移");
assert.equal(backgrounds.size, 1, "军事标签右侧底板不应继续混入国家颜色");
assert.equal(borders.size, stateColors.length, "不同国家颜色没有形成逐一对应的军事标签边框");
assert.deepEqual(palettes.map(palette => palette.border), stateColors, "军事标签边框没有直接使用归一化国家颜色");
assert.ok(contrasts.every(value => value >= 4.5), "军事标签国家色背景降低了正文对比度");
assert.deepEqual(resolveMilitaryLabelPalette("#abc"), resolveMilitaryLabelPalette("#aabbcc"), "三位与六位国家色没有归一化为同一结果");
assert.deepEqual(resolveMilitaryLabelPalette("invalid"), resolveMilitaryLabelPalette(null), "非法国家色没有使用稳定回退");

const [rendererSource, stylesSource, exportSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);

assert.match(rendererSource, /applyMilitaryLabelStatePalette\(item, this\.map\)/, "军事标签刷新没有同步当前国家颜色");
assert.match(rendererSource, /map\?\.politics\?\.states\?\.\[item\.stateId\].*map\?\.pack\?\.states/s, "军事标签没有同时兼容 politics / pack 国家集合");
assert.match(rendererSource, /--military-label-bg/, "军事标签没有写入透明背景变量");
assert.match(rendererSource, /dataset\.stateColor = palette\.stateColor/, "军事标签没有暴露可验证的归一化国家色");
assert.match(stylesSource, /background:\s*var\(--military-label-bg,\s*rgba\(12, 18, 19, 0\.42\)\)/, "军事标签 CSS 没有使用透明深色底板");
assert.match(stylesSource, /border:\s*2px solid var\(--military-label-border,\s*#6f7773\)/, "军事标签没有使用醒目的国家色边框");
assert.doesNotMatch(stylesSource, /\.military-map-icon--fleet\s*\{[^}]*border-color/s, "舰队样式仍覆盖国家色边框");
assert.match(exportSource, /selectors\.push\(PNG_MILITARY_TEXT_SELECTOR\)/, "PNG 导出没有消费军事标签生产契约");
assert.match(exportSource, /drawMilitaryOverlayElement[\s\S]*style\.backgroundColor/, "PNG 军事标签没有读取实时计算背景色");

console.log(JSON.stringify({
  ok: true,
  backgroundAlpha: MILITARY_LABEL_BACKGROUND_ALPHA,
  backgrounds: [...backgrounds],
  borders: [...borders],
  minContrast: Math.round(Math.min(...contrasts) * 100) / 100,
  fallback: resolveMilitaryLabelPalette(null)
}, null, 2));

function parseRgba(value) {
  const channels = String(value).match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
  assert.equal(channels.length, 3, `无法解析背景色：${value}`);
  return channels;
}

function contrastRatio(left, right) {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
