import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(repoRoot, "app", "webgl-generator", "public", "assets", "map-templates");
const cacheDir = join(repoRoot, "work", "task324-source-cache");
const requireFromSource = createRequire(join(repoRoot, "source", "Fantasy-Map-Generator", "package.json"));
const {chromium} = requireFromSource("playwright");
const definitions = [
  {
    id: "roman-empire-117-political-v1",
    snapshotYear: 117,
    width: 512,
    height: 376,
    sourceBounds: {west: -12, south: 20, east: 48, north: 56},
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/RomanEmpire%20117.svg",
    pageUrl: "https://commons.wikimedia.org/wiki/File:RomanEmpire_117.svg",
    license: "Public Domain",
    colors: [{value: 1, rgb: [255, 213, 213]}, {value: 2, rgb: [170, 222, 135]}, {value: 3, rgb: [192, 192, 192]}],
    classes: {1: "senatorial-province", 2: "imperial-province", 3: "client-state"}
  },
  {
    id: "holy-roman-empire-1789-political-v1",
    snapshotYear: 1789,
    width: 450,
    height: 456,
    sourceBounds: {west: -25, south: 34, east: 45, north: 72},
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Map%20of%20Holy%20Roman%20Empire%201789.svg",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Map_of_Holy_Roman_Empire_1789.svg",
    license: "CC0-1.0",
    derivativeNotice: "源文件页面标为 CC0；其说明指向较早的 CC BY-SA 欧洲底图，保留该派生链提示。",
    colors: [{value: 1, rgb: [255, 191, 0]}],
    classes: {1: "holy-roman-empire"}
  }
];

await mkdir(outputDir, {recursive: true});
await mkdir(cacheDir, {recursive: true});
const browser = await launchChrome();
try {
  const page = await browser.newPage();
  for (const definition of definitions) {
    const sourcePath = join(cacheDir, `${definition.id}.svg`);
    const source = await fetchCachedBuffer(definition.url, sourcePath);
    const mask = await rasterizePoliticalMask(page, source.toString("utf8"), definition);
    const binary = encodeMask(mask, definition.width, definition.height);
    const counts = countValues(mask);
    assert.ok((counts[1] || 0) > 100, `${definition.id} 政治掩膜为空`);
    const metadata = {
      id: definition.id,
      version: 1,
      binaryFormatVersion: 1,
      snapshotYear: definition.snapshotYear,
      width: definition.width,
      height: definition.height,
      sourceBounds: definition.sourceBounds,
      encoding: "one-byte-political-class",
      byteLength: binary.byteLength,
      sha256: digest(binary),
      sourceSha256: digest(source),
      source: {
        url: definition.pageUrl,
        downloadUrl: definition.url,
        license: definition.license,
        ...(definition.derivativeNotice ? {derivativeNotice: definition.derivativeNotice} : {})
      },
      classes: definition.classes,
      classPixels: counts,
      generatedBy: "tools/build-map-template-historical-resources.mjs"
    };
    await writeFile(join(outputDir, `${definition.id}.bin`), binary);
    await writeFile(join(outputDir, `${definition.id}.json`), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(metadata));
  }
} finally {
  await browser.close();
}

async function launchChrome() {
  for (const options of [{headless: true, channel: "chrome"}, {headless: true}]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      if (!options.channel) throw error;
    }
  }
  throw new Error("无法启动历史资源栅格化浏览器");
}

async function fetchCachedBuffer(url, path) {
  try {
    return await readFile(path);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`历史资源下载失败：${response.status} ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(path, buffer);
    return buffer;
  }
}

async function rasterizePoliticalMask(page, svg, definition) {
  const values = await page.evaluate(async ({svg, width, height, colors}) => {
    const image = new Image();
    const ready = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("历史 SVG 无法渲染"));
    });
    image.src = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"}));
    await ready;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(image.src);
    const rgba = context.getImageData(0, 0, width, height).data;
    const result = new Array(width * height).fill(0);
    for (let pixel = 0; pixel < result.length; pixel++) {
      const offset = pixel * 4;
      if (rgba[offset + 3] < 192) continue;
      let best = null;
      let bestDistance = Infinity;
      for (const candidate of colors) {
        const distance = (rgba[offset] - candidate.rgb[0]) ** 2 + (rgba[offset + 1] - candidate.rgb[1]) ** 2 + (rgba[offset + 2] - candidate.rgb[2]) ** 2;
        if (distance < bestDistance) {
          best = candidate.value;
          bestDistance = distance;
        }
      }
      if (bestDistance <= 24 ** 2) result[pixel] = best;
    }
    return result;
  }, {svg, width: definition.width, height: definition.height, colors: definition.colors});
  return Uint8Array.from(values);
}

function encodeMask(mask, width, height) {
  const output = Buffer.alloc(16 + mask.length);
  output.write("FMGPH01", 0, "ascii");
  output.writeUInt8(0, 7);
  output.writeUInt32LE(width, 8);
  output.writeUInt32LE(height, 12);
  Buffer.from(mask).copy(output, 16);
  return output;
}

function countValues(mask) {
  const counts = {};
  for (const value of mask) if (value) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
