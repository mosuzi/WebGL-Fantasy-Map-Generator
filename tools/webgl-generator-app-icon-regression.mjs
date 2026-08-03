import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const publicRoot = new URL("../app/webgl-generator/public/", import.meta.url);
const [svg, manifestSource, index] = await Promise.all([
  readFile(new URL("app-icon.svg", publicRoot), "utf8"),
  readFile(new URL("site.webmanifest", publicRoot), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8")
]);
const manifest = JSON.parse(manifestSource);

assert.match(svg, /viewBox="0 0 512 512"/, "SVG 主稿画布必须固定为 512 方形");
assert(!/<text\b/i.test(svg), "应用图标不得依赖可见文字或字体");
for (const color of ["#18231f", "#d2c49d", "#4e7168", "#96382d"]) assert(svg.includes(color), `SVG 缺少冻结品牌色 ${color}`);
assert.match(svg, /<circle cx="250" cy="238" r="158"/, "地图圆盘主体缺失");
assert.match(svg, /translate\(350 348\)/, "右下朱印识别块缺失");

assert.equal(manifest.name, "WebGL 架空地图生成器");
assert.equal(manifest.theme_color, "#18231f");
assert.deepEqual(manifest.icons.map(icon => [icon.src, icon.sizes, icon.type]), [
  ["./app-icon.svg", "any", "image/svg+xml"],
  ["./app-icon-192.png", "192x192", "image/png"],
  ["./app-icon-256.png", "256x256", "image/png"],
  ["./app-icon-512.png", "512x512", "image/png"]
]);

for (const [filename, size] of [["app-icon-32.png", 32], ["app-icon-64.png", 64], ["apple-touch-icon.png", 180], ["app-icon-192.png", 192], ["app-icon-256.png", 256], ["app-icon-512.png", 512]]) {
  const png = await readFile(new URL(filename, publicRoot));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `${filename} 不是 PNG`);
  assert.equal(png.readUInt32BE(16), size, `${filename} 宽度错误`);
  assert.equal(png.readUInt32BE(20), size, `${filename} 高度错误`);
}

for (const token of [
  '<meta name="theme-color" content="#18231f" />',
  '<link rel="icon" href="./app-icon.svg" type="image/svg+xml" />',
  '<link rel="icon" href="./app-icon-32.png" sizes="32x32" type="image/png" />',
  '<link rel="icon" href="./app-icon-64.png" sizes="64x64" type="image/png" />',
  '<link rel="apple-touch-icon" href="./apple-touch-icon.png" sizes="180x180" />',
  '<link rel="manifest" href="./site.webmanifest" />'
]) assert(index.includes(token), `正式入口缺少图标声明：${token}`);
assert(!index.includes('href="data:,"'), "正式入口仍在使用空 favicon");

console.log(JSON.stringify({
  ok: true,
  identity: "map-disc-and-vermilion-seal",
  formats: {svg: "any", png: [32, 64, 180, 192, 256, 512]},
  manifest: manifest.icons.length,
  textElements: 0
}, null, 2));
