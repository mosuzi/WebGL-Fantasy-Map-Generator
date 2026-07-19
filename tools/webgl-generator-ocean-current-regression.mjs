import fs from "node:fs";
import {gzipSync, gunzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  buildOceanCurrents,
  createEmptyOceanCurrentModel,
  normalizeOceanCurrentModel,
  OCEAN_CURRENT_ALGORITHM,
  OCEAN_CURRENT_MODEL_VERSION,
  sampleOceanCurrent
} from "../app/webgl-generator/src/generator/ocean-currents.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createBrowserMapStorageEnvelope, parseBrowserMapStorageEnvelope} from "../app/webgl-generator/src/runtime/browser-map-storage.js";

const map = generatePlaceholderMap({seed: "ocean-current-real-map", cellsTarget: 10000, climateLatitudeMode: "custom", climateLatitudeCenter: 0, climateLatitudeSpan: 120});
const first = buildOceanCurrents(map, {seed: "ocean-current-fixed"});
const repeated = buildOceanCurrents(map, {seed: "ocean-current-fixed"});
const different = buildOceanCurrents(map, {seed: "ocean-current-next"});

assert(first.version === OCEAN_CURRENT_MODEL_VERSION && first.algorithm === OCEAN_CURRENT_ALGORITHM, "洋流模型版本或算法标识错误");
assert(first.currents.length > 0, "真实生成图没有生成主要表层洋流");
assert(JSON.stringify(first) === JSON.stringify(repeated), "固定 seed 洋流结果不确定");
assert(JSON.stringify(first.currents) !== JSON.stringify(different.currents), "不同 seed 没有改变洋流");
assert(first.metadata.controlPoints === first.currents.length * 4, "持久模型控制点统计异常");
assert(!JSON.stringify(first).includes("cellField") && !JSON.stringify(first).includes("vectorField"), "洋流模型写入了巨大格点场");

for (const current of first.currents) {
  assert(current.name && current.id && current.path.kind === "cubic", `洋流基础字段缺失：${JSON.stringify(current)}`);
  assert(current.strength >= 0.05 && current.strength <= 1, `洋流强度越界：${current.strength}`);
  assert(["north", "south", "equatorial"].includes(current.hemisphere), `半球字段无效：${current.hemisphere}`);
  assert(current.hemisphere !== "south" || current.circulation === "counterclockwise", "南半球环流方向错误");
  assert(current.hemisphere === "south" || current.circulation === "clockwise", "北半球 / 赤道环流方向错误");
  for (const point of sampleOceanCurrent(current, 32)) {
    const cell = nearestGridCell(map, point);
    assert(map.features.features[map.grid.cells.f[cell]]?.type === "ocean" && map.grid.cells.h[cell] < 20, `洋流 ${current.id} 穿过陆地或湖泊`);
    assert(Number(map.grid.cells.f[cell]) === current.basinFeatureId, `洋流 ${current.id} 跨越开放海盆`);
  }
  const segment = current.path.segments[0];
  const startTangent = subtract(segment.control1, segment.start);
  const endTangent = subtract(segment.end, segment.control2);
  assert(dot(normalize(startTangent), normalize(endTangent)) > -0.35, `洋流 ${current.id} 方向发生反折`);
}
assert(first.currents.filter(current => current.westernBoundary).every(current => current.strength >= 0.72), "西边界增强没有提高流速下限");
assert(first.currents.filter(current => !current.westernBoundary).every(current => current.strength <= 0.68), "普通洋流强度越过西边界增强范围");

const generatedDocument = createMapDocument({...map, oceanCurrents: first}, map.options);
const roundtrip = parseMapDocument(stringifyMapDocument(generatedDocument));
assert(JSON.stringify(roundtrip.map.oceanCurrents) === JSON.stringify(first), "完整地图 JSON 没有保持洋流模型");
const gzipRoundtrip = parseMapDocument(gunzipSync(gzipSync(stringifyMapDocument(generatedDocument))).toString("utf8"));
assert(JSON.stringify(gzipRoundtrip.map.oceanCurrents) === JSON.stringify(first), "gzip 完整地图没有保持洋流模型");
const envelope = createBrowserMapStorageEnvelope(stringifyMapDocument(generatedDocument), map, {encoding: "plain", data: stringifyMapDocument(generatedDocument)});
const parsedEnvelope = parseBrowserMapStorageEnvelope(JSON.stringify(envelope));
const browserRoundtrip = parseMapDocument(parsedEnvelope.data);
assert(JSON.stringify(browserRoundtrip.map.oceanCurrents) === JSON.stringify(first), "浏览器存档没有保持洋流模型");

const legacyDocument = structuredClone(generatedDocument);
delete legacyDocument.map.oceanCurrents;
const legacyParsed = parseMapDocument(stringifyMapDocument(legacyDocument));
assert(legacyParsed.map.oceanCurrents.version === 1 && legacyParsed.map.oceanCurrents.currents.length === 0, "旧图没有回填空洋流模型");
assert(legacyParsed.map.oceanCurrents.metadata.reason === "legacy-backfill", "旧图空模型没有标记回填来源");
assert(!legacyDocument.map.oceanCurrents, "旧图迁移反向修改了输入文档");
const legacyGzipParsed = parseMapDocument(gunzipSync(gzipSync(stringifyMapDocument(legacyDocument))).toString("utf8"));
assert(legacyGzipParsed.map.oceanCurrents.currents.length === 0, "旧 gzip 地图没有回填空洋流模型");
const legacyEnvelope = createBrowserMapStorageEnvelope(stringifyMapDocument(legacyDocument), legacyDocument.map, {encoding: "plain", data: stringifyMapDocument(legacyDocument)});
assert(parseMapDocument(parseBrowserMapStorageEnvelope(JSON.stringify(legacyEnvelope)).data).map.oceanCurrents.currents.length === 0, "旧浏览器存档没有回填空洋流模型");
assert(normalizeOceanCurrentModel(null).currents.length === 0 && createEmptyOceanCurrentModel().metadata.generated === false, "空模型规范化异常");
assertThrows(() => normalizeOceanCurrentModel({version: 2, currents: []}), "未来洋流模型版本没有被拒绝");

const disconnectedMap = createSyntheticMap(80, 40, {splitOcean: true});
const disconnectedModel = buildOceanCurrents(disconnectedMap, {seed: "disconnected-ocean"});
assert(disconnectedModel.metadata.basins === 2, `同 Feature 的不连通海域没有拆成两个海盆：${disconnectedModel.metadata.basins}`);
for (const current of disconnectedModel.currents) {
  const sides = new Set(sampleOceanCurrent(current, 24).map(point => point[0] < 40 ? "west" : "east"));
  assert(sides.size === 1, `洋流 ${current.id} 跨越了不连通海盆`);
}

const performanceRows = [];
for (const [width, height] of [[100, 100], [250, 200], [320, 320]]) {
  const fixture = createSyntheticMap(width, height);
  const startedAt = performance.now();
  const model = buildOceanCurrents(fixture, {seed: `ocean-current-${width}x${height}`});
  const durationMs = performance.now() - startedAt;
  const jsonBytes = Buffer.byteLength(JSON.stringify(model));
  assert(model.currents.length > 0 && model.currents.length <= 12, `${width}x${height} 洋流稀疏度异常：${model.currents.length}`);
  assert(jsonBytes < 64 * 1024, `${width}x${height} 洋流模型持久化过大：${jsonBytes}`);
  assert(durationMs < 2000, `${width}x${height} 洋流生成超时：${durationMs.toFixed(1)}ms`);
  for (const current of model.currents) for (const point of sampleOceanCurrent(current, 24)) assert(syntheticPointIsOcean(fixture, point), `${width}x${height} 洋流穿陆`);
  performanceRows.push({cells: width * height, currents: model.currents.length, jsonBytes, durationMs: Math.round(durationMs * 10) / 10});
}

const mapIoSource = fs.readFileSync(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8");
const generatorSource = fs.readFileSync(new URL("../app/webgl-generator/src/generator/index.js", import.meta.url), "utf8");
assert(mapIoSource.includes("normalizeOceanCurrentModel(source.oceanCurrents)"), "完整地图规范化未接入旧图空模型回填");
assert(generatorSource.includes("buildOceanCurrents") && generatorSource.includes("oceanCurrents,"), "新地图生成链未接入洋流模型");

console.log(JSON.stringify({
  ok: true,
  real: {gridCells: map.grid.cells.h.length, currents: first.currents.length, basins: first.metadata.basins, checksum: first.metadata.inputChecksum},
  roundtrip: {json: true, gzip: true, browserStorage: true, legacyBackfill: legacyParsed.map.oceanCurrents.metadata.reason},
  performance: performanceRows
}, null, 2));

function createSyntheticMap(width, height, {splitOcean = false} = {}) {
  const count = width * height;
  const points = new Array(count);
  const neighbors = new Array(count);
  const heights = new Uint8Array(count);
  const featureIds = new Array(count);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radiusX = width * 0.18;
  const radiusY = height * 0.24;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      points[cell] = [x + 0.5, y + 0.5];
      neighbors[cell] = [x ? cell - 1 : null, x + 1 < width ? cell + 1 : null, y ? cell - width : null, y + 1 < height ? cell + width : null].filter(Number.isInteger);
      const land = splitOcean ? x === Math.floor(centerX) : ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1;
      heights[cell] = land ? 45 : 2 + ((x * 11 + y * 7) % 15);
      featureIds[cell] = land ? 2 : 1;
    }
  }
  return {
    metadata: {seed: "synthetic-current", graphWidth: width, graphHeight: height},
    options: {seed: "synthetic-current", graphWidth: width, graphHeight: height},
    mapCoordinates: {latN: 75, latS: -75, latT: 150},
    grid: {points, metadata: {graphWidth: width, graphHeight: height}, cells: {i: Uint32Array.from({length: count}, (_, cell) => cell), p: Uint32Array.from({length: count}, (_, cell) => cell), c: neighbors, h: heights, f: featureIds}},
    features: {features: [null, {id: 1, type: "ocean", land: false}, {id: 2, type: "island", land: true}]}
  };
}

function nearestGridCell(map, point) {
  let best = 0;
  let bestDistance = Infinity;
  for (let cell = 0; cell < map.grid.cells.h.length; cell++) {
    const center = map.grid.points[map.grid.cells.p[cell]];
    const distance = (center[0] - point[0]) ** 2 + (center[1] - point[1]) ** 2;
    if (distance >= bestDistance) continue;
    best = cell;
    bestDistance = distance;
  }
  return best;
}

function syntheticPointIsOcean(map, point) {
  const x = Math.max(0, Math.min(map.options.graphWidth - 1, Math.floor(point[0])));
  const y = Math.max(0, Math.min(map.options.graphHeight - 1, Math.floor(point[1])));
  return map.grid.cells.h[y * map.options.graphWidth + x] < 20;
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  return length ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(callback, message) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(message);
}
