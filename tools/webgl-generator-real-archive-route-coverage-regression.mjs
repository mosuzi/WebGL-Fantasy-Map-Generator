#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = process.env.FMG_REAL_ARCHIVE || "C:\\Users\\mosuzi\\Downloads\\krichars (3).webfmg";
const expectedSha256 = "CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61";
const bytes = await readFile(archivePath);
const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
assert.equal(sha256, expectedSha256, "指定存档 SHA-256 漂移");

const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});
try {
  const {validateFeaturesNetworksResourcesWorkerOutput} = await vite.ssrLoadModule("/src/domains/features/worker-runtime.ts");
  const {parseMapDocumentFile} = await vite.ssrLoadModule("/src/runtime/map-file-io.js");
  const {getRegenerationPatchPolicy, runRegenerationWorkerTask} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const document = await parseMapDocumentFile({defaultView: globalThis}, {arrayBuffer: async () => buffer});
  const sourceMap = document.map;
  assert.equal(sourceMap.grid.cells.i.length, 100000, "指定存档 grid cell 身份漂移");
  assert.equal(sourceMap.pack.cells.i.length, 43419, "指定存档 pack cell 身份漂移");
  const before = routeCoverage(sourceMap, 3);
  assert.equal(before.westCities, 350, "西陆城市基线漂移");
  assert.equal(before.westCapitals, 6, "西陆首都基线漂移");

  const binding = Object.freeze({
    mapIdentity: "task-365-real-archive",
    mapRevision: 1,
    topologyRevision: 1,
    generationToken: 1,
    lockFingerprint: "task-365-real-archive-locks",
    operationId: 1,
    operationName: "regeneration.compute:routes"
  });
  const map = structuredClone(sourceMap);
  const output = await runRegenerationWorkerTask({map, kind: "routes"}, {binding, checkpoint() {}, report() {}});
  validateFeaturesNetworksResourcesWorkerOutput({kind: "routes", sourceMap, binding, output, policy: getRegenerationPatchPolicy("routes")});
  const after = routeCoverage(map, 3);
  assert.equal(output.result.executed, true, "指定存档路线重生成没有执行");
  assert(after.routes > 0 && after.routeCells > 0, "指定存档路线重生成得到空路网");
  assert(after.westRoads > 0 && after.westRoadCells > 0, "指定存档西陆仍然没有道路");
  assert(after.westTouchedCities >= 180, `指定存档西陆道路只触达 ${after.westTouchedCities} 座城市`);
  assert.equal(after.westTouchedCapitals, after.westCapitals, "指定存档西陆仍有首都没有道路接入");
  assert.equal(after.landRoadWaterCells, 0, "指定存档重生成陆路进入水格");

  console.log(JSON.stringify({ok: true, archive: {path: archivePath, bytes: bytes.byteLength, sha256}, before, after}, null, 2));
} finally {
  await vite.close();
}

function routeCoverage(map, westFeatureId) {
  const cities = (map.settlements?.cities || []).filter(city => city && !city.removed);
  const routes = (map.settlements?.routes || []).filter(route => route && !route.removed);
  const westCityIds = new Set(cities.filter(city => Number(map.pack.cells.f?.[city.packCell]) === westFeatureId).map(city => Number(city.id)));
  const westCapitals = cities.filter(city => westCityIds.has(Number(city.id)) && city.capital).length;
  const roadCells = new Set();
  const westRoadCells = new Set();
  let westRoads = 0;
  let landRoadWaterCells = 0;
  for (const route of routes) {
    if (route.type === "searoute") continue;
    const cells = Array.isArray(route.packCells) ? route.packCells.map(Number) : [];
    const west = cells.some(cell => Number(map.pack.cells.f?.[cell]) === westFeatureId)
      || westCityIds.has(Number(route.from)) || westCityIds.has(Number(route.to));
    if (west) westRoads += 1;
    for (const cell of cells) {
      roadCells.add(cell);
      if (west && Number(map.pack.cells.f?.[cell]) === westFeatureId) westRoadCells.add(cell);
      if (Number(map.pack.cells.h?.[cell]) < 20) landRoadWaterCells += 1;
    }
  }
  const touched = new Set(cities.filter(city => westCityIds.has(Number(city.id)) && roadCells.has(Number(city.packCell))).map(city => Number(city.id)));
  const westTouchedCapitals = cities.filter(city => city.capital && touched.has(Number(city.id))).length;
  return {
    routes: routes.length,
    routeCells: roadCells.size,
    westCities: westCityIds.size,
    westCapitals,
    westRoads,
    westRoadCells: westRoadCells.size,
    westTouchedCities: touched.size,
    westTouchedCapitals,
    landRoadWaterCells
  };
}
