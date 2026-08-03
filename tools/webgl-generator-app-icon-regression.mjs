import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

const publicRoot = new URL("../app/webgl-generator/public/", import.meta.url);
const [master, svg, manifestSource, index, generator] = await Promise.all([
  readFile(new URL("app-icon-master.jpg", publicRoot)),
  readFile(new URL("app-icon.svg", publicRoot), "utf8"),
  readFile(new URL("site.webmanifest", publicRoot), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("./generate-webgl-generator-app-icons.mjs", import.meta.url), "utf8")
]);
const manifest = JSON.parse(manifestSource);
const masterHash = createHash("sha256").update(master).digest("hex");

assert.equal(masterHash, "50c20b1e8d908b0a45e91988e5421a0792d9f4570db7a504de91205851ab771d", "应用图标原图已被改动");
assert.equal(master.length, 103496, "应用图标原图字节长度异常");
assert.equal(master.subarray(0, 3).toString("hex"), "ffd8ff", "应用图标原图不是 JPEG");

assert.match(svg, /viewBox="0 0 1280 1280"/, "SVG 封装必须保持原图画布比例");
assert(!/<text\b/i.test(svg), "应用图标不得依赖可见文字或字体");
assert.equal((svg.match(/<image\b/g) || []).length, 1, "SVG 必须只封装一份原图");
assert.match(svg, /id="app-icon-master-image"/, "SVG 缺少原图语义节点");
assert.match(svg, /preserveAspectRatio="xMidYMid meet"/, "SVG 必须等比显示原图");
const embedded = svg.match(/href="data:image\/jpeg;base64,([^"]+)"/);
assert(embedded, "SVG 未自包含 JPEG 原图");
assert(Buffer.from(embedded[1], "base64").equals(master), "SVG 内嵌图像与原图不一致");

assert.match(generator, /readFile\(join\(publicDir, "app-icon-master\.jpg"\)\)/, "生成器未读取唯一原图");
assert.match(generator, /page\.setContent\(imageDocument\(masterDataUrl\)\)/, "PNG 未直接从原图缩放生成");
assert.match(generator, /writeFile\(join\(publicDir, "app-icon\.svg"\), svg/, "SVG 未由原图确定性生成");

assert.equal(manifest.name, "WebGL 幻想地图生成器");
assert.equal(manifest.theme_color, "#18231f");
assert.deepEqual(manifest.icons.map(icon => [icon.src, icon.sizes, icon.type, icon.purpose]), [
  ["./app-icon.svg", "any", "image/svg+xml", "any"],
  ["./app-icon-192.png", "192x192", "image/png", "any"],
  ["./app-icon-256.png", "256x256", "image/png", "any"],
  ["./app-icon-512.png", "512x512", "image/png", "any"]
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
  identity: "selected-a-master-image",
  master: {sha256: masterHash, bytes: master.length, size: [1280, 1280]},
  formats: {svg: "any", png: [32, 64, 180, 192, 256, 512]},
  manifest: manifest.icons.length,
  textElements: 0
}, null, 2));
