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
  const {validateSettlementZoneWorkerOutput} = await vite.ssrLoadModule("/src/domains/settlements/worker-runtime.ts");
  const {validateSocietyPoliticsWorkerOutput} = await vite.ssrLoadModule("/src/domains/society-politics/worker-runtime.ts");
  const {validateEconomyDiplomacyMilitaryWorkerOutput} = await vite.ssrLoadModule("/src/domains/economy/worker-runtime.ts");
  const {parseMapDocumentFile} = await vite.ssrLoadModule("/src/runtime/map-file-io.js");
  const {REGENERATION_WORKER_KINDS, getRegenerationPatchPolicy, runRegenerationWorkerTask, validateOceanCurrentRegenerationOutput} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const document = await parseMapDocumentFile({defaultView: globalThis}, {arrayBuffer: async () => buffer});
  const archiveMap = document.map;
  assert.equal(archiveMap.grid.cells.i.length, 100000, "指定存档 grid cell 身份漂移");
  assert.equal(archiveMap.pack.cells.i.length, 43419, "指定存档 pack cell 身份漂移");
  const reports = [];

  for (const [index, kind] of REGENERATION_WORKER_KINDS.entries()) {
    const map = structuredClone(archiveMap);
    const sourceMap = structuredClone(map);
    const binding = operationBinding(kind, index + 1);
    const startedAt = performance.now();
    let output;
    try {
      output = await runRegenerationWorkerTask({map, kind, options: {scope: "all"}}, {binding, checkpoint() {}, report() {}});
      validateWorkerOutput(kind, sourceMap, binding, output);
    } catch (error) {
      error.message = `指定存档 ${kind}：${error.message}`;
      error.details = {
        ...(error.details || {}),
        kind,
        locks: sourceMap.regenerationLocks?.entries || [],
        sourceState4009: sourceMap.pack?.states?.[4009] || sourceMap.politics?.states?.[4009] || null,
        outputState4009: map.pack?.states?.[4009] || map.politics?.states?.[4009] || null
      };
      throw error;
    }
    assert.equal(output.result?.executed, true, `指定存档 ${kind} 没有执行`);
    assertTargetHardGates(map, kind);
    const count = domainCount(map, kind);
    assert(count > 0, `指定存档 ${kind} 重生成得到空结果`);
    const report = {kind, ms: Math.round((performance.now() - startedAt) * 10) / 10, before: domainCount(sourceMap, kind), after: count};
    if (kind === "routes") {
      report.west = routeCoverage(map, 3);
      assert(report.west.westRoads > 0 && report.west.westRoadCells > 0, "指定存档西陆没有道路");
      assert(report.west.westTouchedCities >= 180, `指定存档西陆道路只触达 ${report.west.westTouchedCities} 座城市`);
      assert.equal(report.west.westTouchedCapitals, report.west.westCapitals, "指定存档西陆仍有首都没有道路接入");
      assert.equal(report.west.landRoadWaterCells, 0, "指定存档新陆路进入水格");
    }
    reports.push(report);
  }

  console.log(JSON.stringify({ok: true, archive: {path: archivePath, bytes: bytes.byteLength, sha256, locks: archiveMap.regenerationLocks?.entries?.length || 0}, reports}, null, 2));

  function validateWorkerOutput(kind, sourceMap, binding, output) {
    const input = {kind, sourceMap, binding, output, policy: getRegenerationPatchPolicy(kind)};
    if (kind === "ocean-current") return validateOceanCurrentRegenerationOutput(input);
    if (["features", "routes", "rivers", "markers"].includes(kind)) return validateFeaturesNetworksResourcesWorkerOutput(input);
    if (["cities", "zones"].includes(kind)) return validateSettlementZoneWorkerOutput(input);
    if (["states", "provinces", "religions"].includes(kind)) return validateSocietyPoliticsWorkerOutput(input);
    return validateEconomyDiplomacyMilitaryWorkerOutput(input);
  }
} finally {
  await vite.close();
}

function operationBinding(kind, operationId) {
  return Object.freeze({mapIdentity: "task-365-real-archive", mapRevision: 1, topologyRevision: 1, generationToken: operationId, lockFingerprint: `task-365-real-archive:${kind}`, operationId, operationName: `regeneration.compute:${kind}`});
}

function assertTargetHardGates(map, kind) {
  const cells = map.pack.cells;
  const validCell = cell => Number.isSafeInteger(Number(cell)) && Number(cell) >= 0 && Number(cell) < cells.i.length;
  const land = cell => Number(cells.h[cell]) >= 20;
  const finitePoint = object => Number.isFinite(Number(object?.x)) && Number.isFinite(Number(object?.y));
  const active = rows => (rows || []).filter(item => item && !item.removed);
  if (kind === "cities") for (const city of active(map.settlements?.cities)) assert(validCell(city.packCell) && land(city.packCell) && finitePoint(city), `指定存档新城镇 ${city.id} 违反陆地或有限坐标硬门`);
  if (kind === "routes") for (const route of active(map.settlements?.routes)) {
    assert(Array.isArray(route.packCells) && route.packCells.length >= 2 && route.packCells.every(validCell), `指定存档新路线 ${route.id} cell 无效`);
    assert(Array.isArray(route.points) && route.points.length === route.packCells.length && route.points.every(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))), `指定存档新路线 ${route.id} 坐标无效`);
    for (let index = 1; index < route.packCells.length; index++) assert(route.packCells[index - 1] === route.packCells[index] || cells.c[route.packCells[index - 1]]?.includes(route.packCells[index]), `指定存档新路线 ${route.id} 非邻接`);
    if (route.type !== "searoute") assert(route.packCells.every(land), `指定存档新陆路 ${route.id} 穿越水域`);
  }
  if (kind === "rivers") for (const river of active(map.rivers?.rivers)) {
    const realCells = (river.cells || []).filter(cell => Number(cell) >= 0).map(Number);
    assert(realCells.length && realCells.every(validCell), `指定存档新河流 ${river.id} cell 无效`);
    for (let index = 1; index < realCells.length; index++) assert(cells.c[realCells[index - 1]]?.includes(realCells[index]), `指定存档新河流 ${river.id} 非邻接`);
    if (!land(realCells[0])) assert(map.pack.features?.[Number(cells.f[realCells[0]])]?.type === "lake", `指定存档新河流 ${river.id} 从海洋起流`);
  }
  if (kind === "states") for (const state of active(map.politics?.states).filter(state => Number(state.i) > 0)) assert(validCell(state.center) && land(state.center), `指定存档新国家 ${state.i} 中心不在陆地`);
  if (kind === "provinces") for (const province of active(map.politics?.provinces).filter(province => Number(province.i) > 0)) assert(validCell(province.center) && land(province.center) && Number(cells.state[province.center]) === Number(province.state), `指定存档新省份 ${province.i} 中心无效`);
  if (kind === "markers") for (const marker of active(map.markers?.markers).filter(marker => marker.category === "resource")) assert(validCell(marker.packCell) && finitePoint(marker), `指定存档新标记 ${marker.id ?? marker.i} 位置无效`);
  if (kind === "religions") for (const religion of active(map.society?.religions).filter(religion => Number(religion.i) > 0)) assert(validCell(religion.center), `指定存档新宗教 ${religion.i} 中心无效`);
  if (kind === "military") for (const state of active(map.pack?.states)) for (const regiment of active(state.military)) assert(validCell(regiment.cell) && finitePoint(regiment), `指定存档新军团 ${regiment.id ?? regiment.i} 位置无效`);
  if (kind === "zones") for (const zone of active(map.zones?.zones)) assert((zone.cells || []).every(validCell), `指定存档新地区 ${zone.id ?? zone.i} cell 无效`);
}

function domainCount(map, kind) {
  const active = rows => (rows || []).filter(item => item && !item.removed);
  if (kind === "features") return active(map.pack?.features).length;
  if (kind === "routes") return active(map.settlements?.routes).length;
  if (kind === "rivers") return active(map.rivers?.rivers).length;
  if (kind === "cities") return active(map.settlements?.cities).length;
  if (kind === "states") return active(map.politics?.states).filter(state => Number(state.i) > 0).length;
  if (kind === "provinces") return active(map.politics?.provinces).filter(province => Number(province.i) > 0).length;
  if (kind === "markers") return active(map.markers?.markers).filter(marker => marker.category === "resource").length;
  if (kind === "diplomacy") return Number(map.diplomacy?.metadata?.pairs) || 0;
  if (kind === "religions") return active(map.society?.religions).filter(religion => Number(religion.i) > 0).length;
  if (kind === "military") return active(map.pack?.states).flatMap(state => active(state.military)).length;
  if (kind === "zones") return active(map.zones?.zones).length;
  if (kind === "ocean-current") return active(map.oceanCurrents?.currents).length;
  return 0;
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
    const routeCells = Array.isArray(route.packCells) ? route.packCells.map(Number) : [];
    const west = routeCells.some(cell => Number(map.pack.cells.f?.[cell]) === westFeatureId) || westCityIds.has(Number(route.from)) || westCityIds.has(Number(route.to));
    if (west) westRoads += 1;
    for (const cell of routeCells) {
      roadCells.add(cell);
      if (west && Number(map.pack.cells.f?.[cell]) === westFeatureId) westRoadCells.add(cell);
      if (Number(map.pack.cells.h?.[cell]) < 20) landRoadWaterCells += 1;
    }
  }
  const touched = new Set(cities.filter(city => westCityIds.has(Number(city.id)) && roadCells.has(Number(city.packCell))).map(city => Number(city.id)));
  return {routes: routes.length, westCities: westCityIds.size, westCapitals, westRoads, westRoadCells: westRoadCells.size, westTouchedCities: touched.size, westTouchedCapitals: cities.filter(city => city.capital && touched.has(Number(city.id))).length, landRoadWaterCells};
}
