import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(repoRoot, "app", "webgl-generator", "public", "assets", "map-templates");
const cacheDir = join(repoRoot, "work", "task324-source-cache");
const resourceId = "world-physical-2026-v1";
const width = 720;
const height = 360;
const stride = 120;
const gebcoDataset = "https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/gebco_2026/ice_surface_elevation/netcdf/GEBCO_2026.nc";
const gebcoUrl = `${gebcoDataset}.ascii?elevation%5B0:${stride}:43199%5D%5B0:${stride}:86399%5D`;
const landUrl = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_land.geojson";
const lakesUrl = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_lakes.geojson";
const riversUrl = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_rivers_lake_centerlines.geojson";

await mkdir(outputDir, {recursive: true});
await mkdir(cacheDir, {recursive: true});
const gebcoText = await fetchCachedText(gebcoUrl, join(cacheDir, "GEBCO_2026-stride120.ascii"));
const landText = await fetchCachedText(landUrl, join(cacheDir, "ne_10m_land-v5.1.2.geojson"));
const lakesText = await fetchCachedText(lakesUrl, join(cacheDir, "ne_10m_lakes-v5.1.2.geojson"));
const riversText = await fetchCachedText(riversUrl, join(cacheDir, "ne_10m_rivers_lake_centerlines-v5.1.2.geojson"));
const elevationsSouthToNorth = parseGebcoAscii(gebcoText, width, height);
const elevations = flipRows(elevationsSouthToNorth, width, height);
const landMask = rasterizeLand(JSON.parse(landText), width, height);
clearLakes(landMask, JSON.parse(lakesText), width, height);
const hydrologyMask = rasterizeHydrology(JSON.parse(riversText), width, height);
const data = encodeResource(elevations, landMask, hydrologyMask, width, height);
const sha256 = digest(data);
const elevationRange = findRange(elevations);
const metadata = {
  id: resourceId,
  version: 1,
  binaryFormatVersion: 2,
  width,
  height,
  bounds: {west: -180, south: -90, east: 180, north: 90},
  rowOrder: "north-to-south",
  pixelRegistration: "center",
  elevationEncoding: "int16-le-metres",
  landMaskEncoding: "one-byte-per-pixel",
  hydrologyMaskEncoding: "one-byte-per-pixel",
  byteLength: data.byteLength,
  sha256,
  elevationMin: elevationRange.min,
  elevationMax: elevationRange.max,
  landPixels: landMask.reduce((sum, value) => sum + value, 0),
  hydrologyPixels: hydrologyMask.reduce((sum, value) => sum + value, 0),
  sources: [
    {id: "gebco-2026", url: gebcoDataset, request: gebcoUrl, stride, license: "Public Domain", doi: "10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa"},
    {id: "natural-earth-5.1.2", url: landUrl, lakesUrl, riversUrl, license: "Public Domain"}
  ],
  generatedBy: "tools/build-map-template-physical-resource.mjs"
};
await writeFile(join(outputDir, `${resourceId}.bin`), data);
await writeFile(join(outputDir, `${resourceId}.json`), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(JSON.stringify(metadata));

async function fetchCachedText(url, path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`资源下载失败：${response.status} ${url}`);
    const text = await response.text();
    await writeFile(path, text, "utf8");
    return text;
  }
}

function parseGebcoAscii(text, expectedWidth, expectedHeight) {
  const header = text.match(/elevation\.elevation\[(\d+)\]\[(\d+)\]/u);
  assert.ok(header, "GEBCO ASCII 缺少 elevation shape");
  assert.equal(Number(header[1]), expectedHeight);
  assert.equal(Number(header[2]), expectedWidth);
  const values = new Int16Array(expectedWidth * expectedHeight);
  const lines = text.slice(text.indexOf(header[0]) + header[0].length).split(/\r?\n/u);
  let rows = 0;
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\],\s*(.+)$/u);
    if (!match || Number(match[1]) !== rows) continue;
    const row = match[2].split(",").map(value => Number(value.trim()));
    assert.equal(row.length, expectedWidth, `GEBCO 第 ${rows} 行长度错误`);
    values.set(row, rows * expectedWidth);
    rows++;
    if (rows === expectedHeight) break;
  }
  assert.equal(rows, expectedHeight, "GEBCO ASCII 行数不足");
  return values;
}

function flipRows(source, rowWidth, rows) {
  const result = new Int16Array(source.length);
  for (let y = 0; y < rows; y++) result.set(source.subarray((rows - y - 1) * rowWidth, (rows - y) * rowWidth), y * rowWidth);
  return result;
}

function findRange(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {min, max};
}

function rasterizeLand(collection, rasterWidth, rasterHeight) {
  assert.equal(collection?.type, "FeatureCollection");
  const mask = new Uint8Array(rasterWidth * rasterHeight);
  for (const feature of collection.features || []) {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") rasterizePolygon(mask, geometry.coordinates, rasterWidth, rasterHeight);
    else if (geometry?.type === "MultiPolygon") for (const polygon of geometry.coordinates) rasterizePolygon(mask, polygon, rasterWidth, rasterHeight);
  }
  return mask;
}

function clearLakes(mask, collection, rasterWidth, rasterHeight) {
  assert.equal(collection?.type, "FeatureCollection");
  for (const feature of collection.features || []) {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") rasterizePolygon(mask, geometry.coordinates, rasterWidth, rasterHeight, 0);
    else if (geometry?.type === "MultiPolygon") for (const polygon of geometry.coordinates) rasterizePolygon(mask, polygon, rasterWidth, rasterHeight, 0);
  }
}

function rasterizeHydrology(collection, rasterWidth, rasterHeight) {
  assert.equal(collection?.type, "FeatureCollection");
  const mask = new Uint8Array(rasterWidth * rasterHeight);
  for (const feature of collection.features || []) {
    const geometry = feature?.geometry;
    const lines = geometry?.type === "LineString"
      ? [geometry.coordinates]
      : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
    for (const line of lines) {
      for (let index = 1; index < line.length; index++) {
        drawWrappedLine(mask, rasterWidth, rasterHeight,
          geographicPixel(line[index - 1], rasterWidth, rasterHeight),
          geographicPixel(line[index], rasterWidth, rasterHeight));
      }
    }
  }
  return mask;
}

function geographicPixel(coordinate, rasterWidth, rasterHeight) {
  return {
    x: Math.round(((Number(coordinate?.[0]) || 0) + 180) / 360 * (rasterWidth - 1)),
    y: Math.round((90 - (Number(coordinate?.[1]) || 0)) / 180 * (rasterHeight - 1))
  };
}

function drawWrappedLine(mask, rasterWidth, rasterHeight, start, end) {
  let endX = end.x;
  if (Math.abs(endX - start.x) > rasterWidth / 2) endX += endX < start.x ? rasterWidth : -rasterWidth;
  const steps = Math.max(Math.abs(endX - start.x), Math.abs(end.y - start.y), 1);
  for (let step = 0; step <= steps; step++) {
    const x = ((Math.round(start.x + (endX - start.x) * step / steps) % rasterWidth) + rasterWidth) % rasterWidth;
    const y = Math.max(0, Math.min(rasterHeight - 1, Math.round(start.y + (end.y - start.y) * step / steps)));
    mask[y * rasterWidth + x] = 1;
  }
}

function rasterizePolygon(mask, rings, rasterWidth, rasterHeight, outerValue = 1) {
  if (!Array.isArray(rings) || !rings.length) return;
  fillRing(mask, rings[0], rasterWidth, rasterHeight, outerValue);
  for (let index = 1; index < rings.length; index++) fillRing(mask, rings[index], rasterWidth, rasterHeight, outerValue ? 0 : 1);
}

function fillRing(mask, ring, rasterWidth, rasterHeight, value) {
  if (!Array.isArray(ring) || ring.length < 4) return;
  const points = ring.map(([longitude, latitude]) => [
    (Number(longitude) + 180) / 360 * rasterWidth,
    (90 - Number(latitude)) / 180 * rasterHeight
  ]);
  const minY = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))));
  const maxY = Math.min(rasterHeight - 1, Math.ceil(Math.max(...points.map(point => point[1]))));
  for (let y = minY; y <= maxY; y++) {
    const scanY = y + 0.5;
    const crossings = [];
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
      const [x1, y1] = points[previous];
      const [x2, y2] = points[index];
      if ((y1 > scanY) === (y2 > scanY)) continue;
      crossings.push(x1 + (scanY - y1) * (x2 - x1) / (y2 - y1));
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const start = Math.max(0, Math.ceil(crossings[index] - 0.5));
      const end = Math.min(rasterWidth - 1, Math.floor(crossings[index + 1] - 0.5));
      for (let x = start; x <= end; x++) mask[y * rasterWidth + x] = value;
    }
  }
}

function encodeResource(elevations, landMask, hydrologyMask, rasterWidth, rasterHeight) {
  const headerBytes = 16;
  const output = Buffer.alloc(headerBytes + elevations.length * 2 + landMask.length + hydrologyMask.length);
  output.write("FMGPT02", 0, "ascii");
  output.writeUInt8(0, 7);
  output.writeUInt32LE(rasterWidth, 8);
  output.writeUInt32LE(rasterHeight, 12);
  for (let index = 0; index < elevations.length; index++) output.writeInt16LE(elevations[index], headerBytes + index * 2);
  Buffer.from(landMask).copy(output, headerBytes + elevations.length * 2);
  Buffer.from(hydrologyMask).copy(output, headerBytes + elevations.length * 2 + landMask.length);
  return output;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
