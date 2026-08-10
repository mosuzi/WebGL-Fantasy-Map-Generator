#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, isAbsolute, join, normalize, relative, resolve, sep} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {parseMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePackageDir = join(rootDir, "source", "Fantasy-Map-Generator");
const appSourceDir = join(rootDir, "app", "webgl-generator", "src");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5525;
const timeoutMs = 600_000;

const liveSave = String(process.env.FMG_TASK325_LIVE_SAVE || "").trim();
const expectedSha256 = String(process.env.FMG_TASK325_EXPECTED_SHA256 || "").trim().toLowerCase();
assert.ok(liveSave, "必须通过 FMG_TASK325_LIVE_SAVE 指定已校验的真实 JSON 存档");
assert.match(expectedSha256, /^[a-f0-9]{64}$/, "必须通过 FMG_TASK325_EXPECTED_SHA256 指定 64 位 SHA-256");
assert.ok(isAbsolute(liveSave), "FMG_TASK325_LIVE_SAVE 必须是绝对路径");
assert.ok(existsSync(liveSave), `真实存档不存在：${liveSave}`);
assert.equal(extname(liveSave).toLowerCase(), ".json", "本专项只接受完整 JSON 存档");
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const sourceStat = statSync(liveSave);
const sourceSha256 = await sha256File(liveSave);
assert.equal(sourceSha256, expectedSha256, "真实存档 SHA-256 与外部冻结基线不符");

const parsedDocument = parseMapDocument(readFileSync(liveSave, "utf8"));
const parsedSummary = summarizeMap(parsedDocument.map);
const expectedLiveMap = Object.freeze({...parsedSummary});

const artifactDir = process.env.FMG_TASK325_ARTIFACT_DIR
  ? resolve(process.env.FMG_TASK325_ARTIFACT_DIR)
  : mkdtempSync(join(tmpdir(), "fmg-task325-live-"));
if (!existsSync(artifactDir)) throw new Error(`截图目录不存在：${artifactDir}`);

const playwright = createRequire(join(sourcePackageDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;
let page;
let cdp;
let failure = null;
const output = {
  ok: false,
  source: {
    bytes: sourceStat.size,
    sha256: sourceSha256,
    checksum: parsedSummary.checksum,
    gridCells: parsedSummary.gridCells,
    routes: parsedSummary.routes,
    rivers: parsedSummary.rivers
  },
  browser: null,
  imported: null,
  rivers: null,
  routes: null,
  screenshots: {
    before: join(artifactDir, "01-imported.png"),
    afterRivers: join(artifactDir, "02-after-rivers.png"),
    afterRoutes: join(artifactDir, "03-after-routes.png")
  },
  healthPerformanceSignals: [],
  runtimeDiagnostics: null,
  applicationConsoleErrors: [],
  pageErrors: []
};

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1440, height: 960}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase("webgl-generator-map-storage-v1");
  });
  page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  cdp = await context.newCDPSession(page);
  const browserVersion = await cdp.send("Browser.getVersion");
  output.browser = {
    product: browserVersion.product,
    protocolVersion: browserVersion.protocolVersion,
    userAgent: browserVersion.userAgent,
    transport: "isolated-chrome-cdp-session"
  };

  await page.locator("#import-map-file").setInputFiles(liveSave);
  await page.waitForFunction(expected => {
    const status = document.getElementById("file-operation-status")?.textContent?.trim() || "";
    const summary = window.webglGeneratorApi?.info?.mapSummary?.();
    return status.startsWith("已导入地图数据：")
      && summary?.ok
      && summary.data.seed === expected.seed
      && summary.data.checksum === expected.checksum
      && summary.data.gridCells === expected.gridCells
      && summary.data.routes === expected.routes
      && summary.data.rivers === expected.rivers;
  }, expectedLiveMap, {timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);

  output.imported = await page.evaluate(expected => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const summary = unwrap(api.info.mapSummary(), "地图摘要");
    const identity = {
      seed: app.map.metadata?.seed || app.map.options?.seed || "",
      checksum: app.map.metadata?.checksum || app.map.summary?.checksum || "",
      gridCells: app.map.grid?.cells?.i?.length || 0,
      routes: (app.map.settlements?.routes || []).filter(Boolean).length,
      rivers: (app.map.rivers?.rivers || []).filter(Boolean).length
    };
    for (const key of ["seed", "checksum", "gridCells", "routes", "rivers"]) {
      if (identity[key] !== expected[key] || summary[key] !== expected[key]) {
        throw new Error(`导入地图身份字段 ${key} 与冻结基线不符`);
      }
    }
    const fit = api.layers.fitView();
    if (!fit?.ok) throw new Error(`地图适配视图失败：${fit?.error?.message || "unknown"}`);
    return {identity, summary};

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label}失败：${result?.error?.message || "unknown"}`);
      return result.data;
    }
  }, expectedLiveMap);
  await settlePage(page);
  await captureCdpScreenshot(cdp, output.screenshots.before);

  output.rivers = await page.evaluate(async expected => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const beforeSummary = unwrap(api.info.mapSummary(), "河流重算前摘要");
    assertExpectedIdentity(beforeSummary, expected);
    await settleRenderer();

    const identityBefore = captureRouteIdentity();
    const lockBefore = captureLockIdentity();
    const routeDomainBefore = routeDomainSnapshot();
    const portDomainBefore = portDomainSnapshot();
    const routeSaltBefore = Number(app.map.metadata?.regeneration?.routes) || 0;
    const riverSaltBefore = Number(app.map.metadata?.regeneration?.rivers) || 0;
    const riverValueBefore = JSON.stringify(app.map.rivers);
    const riverCountBefore = activeRivers().length;
    const probe = installRendererProbe();
    let regenerated;
    try {
      regenerated = unwrap(await api.generate.regenerate("rivers", {confirm: true}), "正式河流重算");
    } finally {
      probe.restore();
    }
    if (!regenerated.executed) throw new Error("正式河流重算没有执行");
    await settleRenderer();

    const routeSaltAfter = Number(app.map.metadata?.regeneration?.routes) || 0;
    const riverSaltAfter = Number(app.map.metadata?.regeneration?.rivers) || 0;
    if (routeSaltAfter !== routeSaltBefore) throw new Error("河流重算改变了道路 salt");
    if (riverSaltAfter !== riverSaltBefore + 1) throw new Error("河流重算没有只推进一次河流 salt");
    if (JSON.stringify(app.map.rivers) === riverValueBefore) throw new Error("河流重算后河流内容没有变化");
    if (routeDomainSnapshot() !== routeDomainBefore) throw new Error("河流重算改变了道路值域");
    if (portDomainSnapshot() !== portDomainBefore) throw new Error("河流重算改变了港口或城镇身份");
    assertRouteIdentity(identityBefore);
    assertLockIdentity(lockBefore);
    if (probe.counts.routeSync || probe.counts.routeAsync || probe.counts.objectIndex) {
      throw new Error(`河流重算触发了道路或全量 picking 刷新：${JSON.stringify(probe.counts)}`);
    }
    if (probe.counts.riverPartial !== 1) throw new Error(`河流局部 picking 刷新次数错误：${probe.counts.riverPartial}`);

    const afterSummary = unwrap(api.info.mapSummary(), "河流重算后摘要");
    if (afterSummary.routes !== expected.routes) throw new Error("河流重算改变了道路数量");
    return {
      before: {rivers: riverCountBefore, salt: riverSaltBefore},
      after: {rivers: activeRivers().length, salt: riverSaltAfter},
      routeSalt: routeSaltAfter,
      routeBuffer: identityBefore.bufferFingerprint,
      rendererCalls: {...probe.counts},
      routeIdentity: true,
      lockIdentity: true,
      pickingIdentity: true
    };

    function activeRivers() {
      return (app.map.rivers?.rivers || []).filter(Boolean);
    }

    function installRendererProbe() {
      const counts = {routeSync: 0, routeAsync: 0, objectIndex: 0, riverPartial: 0, draw: 0};
      const originals = new Map();
      for (const [name, key] of [
        ["updateRouteBuffer", "routeSync"],
        ["updateRouteBufferAsync", "routeAsync"],
        ["refreshObjectPickingIndex", "objectIndex"],
        ["refreshRiverPickingIndex", "riverPartial"],
        ["draw", "draw"]
      ]) {
        const original = app.renderer[name];
        if (typeof original !== "function") continue;
        originals.set(name, original);
        app.renderer[name] = function(...args) {
          counts[key]++;
          return Reflect.apply(original, this, args);
        };
      }
      return {
        counts,
        restore() {
          for (const [name, original] of originals) app.renderer[name] = original;
        }
      };
    }

    function captureRouteIdentity() {
      const map = app.map;
      const pickingIndex = app.renderer.objectPickingIndex;
      const buckets = new Map();
      for (const [key, bucket] of pickingIndex.buckets) {
        if (!bucket.routeSegments?.length) continue;
        buckets.set(key, {
          bucket,
          array: bucket.routeSegments,
          segments: [...bucket.routeSegments]
        });
      }
      return {
        settlementRoutes: map.settlements.routes,
        settlementRouteObjects: [...map.settlements.routes],
        packRoutes: map.pack.routes,
        packRouteObjects: [...map.pack.routes],
        packCellRoutes: map.pack.cells.routes,
        packCellRouteObjects: captureReferenceRecord(map.pack.cells.routes),
        pickingIndex,
        buckets,
        routeBuffer: app.renderer.routeBuffer,
        bufferFingerprint: routeBufferFingerprint()
      };
    }

    function assertRouteIdentity(before) {
      const map = app.map;
      if (map.settlements.routes !== before.settlementRoutes
        || map.pack.routes !== before.packRoutes
        || map.pack.cells.routes !== before.packCellRoutes
        || app.renderer.objectPickingIndex !== before.pickingIndex
        || app.renderer.routeBuffer !== before.routeBuffer) {
        throw new Error("河流重算替换了道路容器、picking index 或 GPU buffer 引用");
      }
      assertReferenceArray(map.settlements.routes, before.settlementRouteObjects, "道路对象");
      assertReferenceArray(map.pack.routes, before.packRouteObjects, "pack 道路对象");
      assertReferenceRecord(map.pack.cells.routes, before.packCellRouteObjects, "cell 道路镜像");
      const currentRouteBucketKeys = [...app.renderer.objectPickingIndex.buckets]
        .filter(([, bucket]) => bucket.routeSegments?.length)
        .map(([key]) => key);
      if (currentRouteBucketKeys.length !== before.buckets.size
        || currentRouteBucketKeys.some(key => !before.buckets.has(key))) {
        throw new Error("河流重算改变了道路 picking bucket 集合");
      }
      for (const [key, expectedBucket] of before.buckets) {
        const bucket = app.renderer.objectPickingIndex.buckets.get(key);
        if (bucket !== expectedBucket.bucket || bucket.routeSegments !== expectedBucket.array) {
          throw new Error("河流重算替换了道路 picking bucket 或数组引用");
        }
        assertReferenceArray(bucket.routeSegments, expectedBucket.segments, "道路 picking segment");
      }
      if (JSON.stringify(routeBufferFingerprint()) !== JSON.stringify(before.bufferFingerprint)) {
        throw new Error("河流重算改变了道路 GPU buffer 字节或 ranges");
      }
    }

    function assertReferenceArray(actual, expected, label) {
      if (actual.length !== expected.length) throw new Error(`${label}数量变化`);
      for (let index = 0; index < expected.length; index++) {
        if (actual[index] !== expected[index]) throw new Error(`${label}引用变化`);
      }
    }

    function captureReferenceRecord(record) {
      return Object.keys(record || {}).map(key => [key, record[key]]);
    }

    function assertReferenceRecord(actual, expected, label) {
      const entries = captureReferenceRecord(actual);
      if (entries.length !== expected.length) throw new Error(`${label}数量变化`);
      for (let index = 0; index < expected.length; index++) {
        if (entries[index][0] !== expected[index][0] || entries[index][1] !== expected[index][1]) {
          throw new Error(`${label}引用变化`);
        }
      }
    }

    function captureLockIdentity() {
      const store = app.map.regenerationLocks;
      return {store, entries: store?.entries, objects: [...(store?.entries || [])], value: JSON.stringify(store)};
    }

    function assertLockIdentity(before) {
      const store = app.map.regenerationLocks;
      if (store !== before.store || store?.entries !== before.entries || JSON.stringify(store) !== before.value) {
        throw new Error("河流重算替换或修改了锁仓");
      }
      assertReferenceArray(store?.entries || [], before.objects, "锁对象");
    }

    function routeDomainSnapshot() {
      return JSON.stringify({
        routes: app.map.settlements.routes,
        packRoutes: app.map.pack.routes,
        packCellRoutes: app.map.pack.cells.routes,
        routeSalt: Number(app.map.metadata?.regeneration?.routes) || 0,
        routeLocks: (app.map.regenerationLocks?.entries || []).filter(entry => entry.kind === "route")
      });
    }

    function portDomainSnapshot() {
      return JSON.stringify({
        cities: (app.map.settlements?.cities || []).map(city => city && [city.id, city.burgId, city.cell, city.packCell, city.x, city.y, city.port]),
        burgs: (app.map.pack?.burgs || []).map(burg => burg && [burg.i, burg.id, burg.cityId, burg.cell, burg.x, burg.y, burg.port, burg.feature]),
        packBurg: numericArrayFingerprint(app.map.pack?.cells?.burg),
        gridBurg: numericArrayFingerprint(app.map.grid?.cells?.burg)
      });
    }

    function numericArrayFingerprint(values) {
      let checksum = 2166136261;
      for (let index = 0; index < (values?.length || 0); index++) checksum = Math.imul(checksum ^ Number(values[index] || 0), 16777619) >>> 0;
      return [values?.length || 0, checksum];
    }

    function routeBufferFingerprint() {
      const renderer = app.renderer;
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.routeBuffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {
        byteLength,
        checksum,
        vertexCount: renderer.routeVertexCount,
        drawRanges: JSON.stringify(renderer.routeDrawRanges),
        camera: JSON.stringify(renderer.routeBufferCamera)
      };
    }

    async function settleRenderer() {
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (!app.renderer.routeRefreshTimer && !app.renderer.routeRefreshActiveVersion) break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    function assertExpectedIdentity(summary, expectedIdentity) {
      for (const key of ["seed", "checksum", "gridCells", "routes", "rivers"]) {
        if (summary[key] !== expectedIdentity[key]) throw new Error(`河流重算前地图身份字段 ${key} 不符`);
      }
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label}失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
      return result.data;
    }
  }, expectedLiveMap);
  await settlePage(page);
  await captureCdpScreenshot(cdp, output.screenshots.afterRivers);

  output.routes = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const settlementsModule = await import("/__task325_source__/generator/settlements.js");
    const topologyModule = await import("/__task325_source__/runtime/settlement-port-topology.js");
    const pickingModule = await import("/__task325_source__/renderer/picking.js");
    const routeSaltBefore = Number(app.map.metadata?.regeneration?.routes) || 0;
    const regenerated = unwrap(await api.generate.regenerate("routes", {confirm: true}), "正式道路重算");
    if (!regenerated.executed) throw new Error("正式道路重算没有执行");
    await settleRenderer();
    const routeSaltAfter = Number(app.map.metadata?.regeneration?.routes) || 0;
    if (routeSaltAfter !== routeSaltBefore + 1) throw new Error("道路重算没有只推进一次道路 salt");

    const audit = auditRouteNetwork(app.map, settlementsModule, topologyModule, pickingModule);
    if (audit.totalErrors) throw new Error(`道路强审计失败：${JSON.stringify(audit.samples)}`);
    if (audit.reachablePortFeatures > 0 && audit.searoutes < 1) throw new Error("存在正式可达双港水体但没有生成海路");
    if (audit.missingReachablePortFeatures) throw new Error("存在正式可达双港水体但缺少对应海路");
    if (!audit.routePick.hit) throw new Error("重算后的真实路线 picking 没有命中");
    return {routeSaltBefore, routeSaltAfter, ...audit};

    function auditRouteNetwork(map, formal, topology, picking) {
      const routes = (map.settlements?.routes || []).filter(Boolean);
      const errors = Object.fromEntries([
        "adjacency", "landInWater", "seaCell", "formalSeaPath", "repeatedCell", "cellsMirror", "pointsMirror",
        "endpointIdentity", "packRouteMirror", "packCellLinks", "displayTeleport", "portIdentity", "portPlacement",
        "duplicatePortCell", "pickingCurrent", "administrativeCoverage", "sparseDensity", "pathRatio"
      ].map(key => [key, 0]));
      const samples = [];
      const cityByBurg = new Map((map.settlements?.cities || [])
        .filter(city => city && !city.removed)
        .map(city => [Number(city.burgId), city]));
      const riverEdges = collectRiverEdges(map.pack.rivers || []);
      const pathRatios = [];
      let teleports = 0;
      let maxDisplaySegment = 0;

      const addError = (category, detail = {}) => {
        errors[category]++;
        if (samples.length < 5) samples.push({category, ...detail});
      };

      for (let routeOrdinal = 0; routeOrdinal < routes.length; routeOrdinal++) {
        const route = routes[routeOrdinal];
        const cells = route.packCells || [];
        if (new Set(cells).size !== cells.length) addError("repeatedCell", {routeOrdinal});
        if (route.cells?.length !== cells.length) addError("cellsMirror", {routeOrdinal});
        if (route.points?.length !== cells.length) addError("pointsMirror", {routeOrdinal});
        const packMirror = map.pack.routes?.[route.id];
        if (!packMirror || packMirror.points?.length !== cells.length) addError("packRouteMirror", {routeOrdinal});
        if (route.type === "searoute" && !formal.isSettlementWaterRoutePathValid(map.pack, cells)) addError("formalSeaPath", {routeOrdinal});

        for (let stepOrdinal = 0; stepOrdinal < cells.length; stepOrdinal++) {
          const cell = cells[stepOrdinal];
          const expectedPoint = routePoint(map, cityByBurg, cell);
          if (route.cells?.[stepOrdinal] !== map.pack.cells.g[cell]) addError("cellsMirror", {routeOrdinal, stepOrdinal});
          if (!samePoint(route.points?.[stepOrdinal], expectedPoint)) addError("pointsMirror", {routeOrdinal, stepOrdinal});
          if (!sameMirrorPoint(packMirror?.points?.[stepOrdinal], expectedPoint, cell)) addError("packRouteMirror", {routeOrdinal, stepOrdinal});
          if (route.type !== "searoute" && map.pack.cells.h[cell] < 20) addError("landInWater", {routeOrdinal, stepOrdinal});
          if (route.type === "searoute" && map.pack.cells.h[cell] >= 20) {
            const endpoint = stepOrdinal === 0 || stepOrdinal === cells.length - 1;
            if (!isNavigableRiverCell(map.pack.cells, cell) && !(endpoint && isPortCell(map.pack, cell))) {
              addError("seaCell", {routeOrdinal, stepOrdinal});
            }
          }
          if (!stepOrdinal) continue;
          const previous = cells[stepOrdinal - 1];
          if (!(map.pack.cells.c?.[previous] || []).includes(cell)) addError("adjacency", {routeOrdinal, stepOrdinal});
          if (map.pack.cells.routes?.[previous]?.[cell] !== route.id || map.pack.cells.routes?.[cell]?.[previous] !== route.id) {
            addError("packCellLinks", {routeOrdinal, stepOrdinal});
          }
          if (route.type === "searoute" && (map.pack.cells.h[previous] >= 20 || map.pack.cells.h[cell] >= 20)) {
            const landCell = map.pack.cells.h[previous] >= 20 ? previous : cell;
            if (isNavigableRiverCell(map.pack.cells, landCell) && !riverEdges.has(edgeKey(previous, cell))) {
              addError("seaCell", {routeOrdinal, stepOrdinal});
            }
          }
          const displayDistance = distance(route.points[stepOrdinal - 1], route.points[stepOrdinal]);
          const centerDistance = distance(map.pack.cells.p[previous], map.pack.cells.p[cell]);
          maxDisplaySegment = Math.max(maxDisplaySegment, displayDistance);
          if (displayDistance > Math.max(32, centerDistance * 4)) {
            teleports++;
            addError("displayTeleport", {routeOrdinal, stepOrdinal});
          }
        }

        const expectedFrom = routeEndpointCityId(map, cityByBurg, cells[0]);
        const expectedTo = routeEndpointCityId(map, cityByBurg, cells.at(-1));
        if (Number(route.from) !== expectedFrom) addError("endpointIdentity", {routeOrdinal, side: "from"});
        if (Number(route.to) !== expectedTo) addError("endpointIdentity", {routeOrdinal, side: "to"});
        if (cells.length > 1) pathRatios.push(routePathRatio(route.points));
      }

      const portAudit = auditPorts(map, formal, topology, routes, addError);
      const coverageAudit = auditAdministrativeCoverage(map, routes, addError);
      const sparseAudit = auditSparseDensity(map, routes, addError);
      const maxPathRatio = Math.max(0, ...pathRatios.filter(Number.isFinite));
      if (maxPathRatio > 12) addError("pathRatio", {threshold: 12});
      const routePick = auditRoutePicking(map, app.renderer.objectPickingIndex, picking, addError);
      const routeBuffer = routeBufferFingerprint(app.renderer);
      if (!routeBuffer.byteLength || !routeBuffer.vertexCount) addError("pickingCurrent", {reason: "empty-route-buffer"});

      return {
        routes: routes.length,
        roads: routes.filter(route => route.type === "road").length,
        trails: routes.filter(route => route.type === "trail").length,
        searoutes: routes.filter(route => route.type === "searoute").length,
        ports: portAudit.ports,
        reachablePortFeatures: portAudit.reachablePortFeatures,
        missingReachablePortFeatures: portAudit.missingReachablePortFeatures,
        portTopology: portAudit.portTopology,
        teleports,
        maxDisplaySegment: Number(maxDisplaySegment.toFixed(3)),
        maxPathRatio: Number(maxPathRatio.toFixed(3)),
        administrativeCoverage: coverageAudit,
        sparse: sparseAudit,
        routePick,
        routeBuffer,
        errors,
        totalErrors: Object.values(errors).reduce((sum, value) => sum + value, 0),
        samples
      };
    }

    function auditPorts(map, formal, topology, routes, addError) {
      const activeCities = (map.settlements?.cities || []).filter(city => city && !city.removed);
      const usedPortCells = new Set();
      let ports = 0;
      for (let cityOrdinal = 0; cityOrdinal < activeCities.length; cityOrdinal++) {
        const city = activeCities[cityOrdinal];
        const burg = map.pack.burgs?.[Number(city.burgId)];
        if (!burg || burg.removed) {
          addError("portIdentity", {cityOrdinal, reason: "missing-burg"});
          continue;
        }
        if (Number(city.packCell) !== Number(burg.cell)
          || Number(city.cell) !== Number(map.pack.cells.g?.[city.packCell])
          || Number(city.x) !== Number(burg.x)
          || Number(city.y) !== Number(burg.y)) {
          addError("portIdentity", {cityOrdinal, reason: "cell-or-coordinate"});
        }
        if (Number(city.port || 0) !== Number(burg.port || 0)) addError("portIdentity", {cityOrdinal, reason: "port-mirror"});
        if (!(Number(city.port) > 0)) continue;
        ports++;
        if (usedPortCells.has(Number(city.packCell))) addError("duplicatePortCell", {cityOrdinal});
        usedPortCells.add(Number(city.packCell));
        const placement = formal.inspectRelocatedSettlementPort(map.grid, map.pack, Number(city.packCell), {
          wasPort: Number(city.port),
          capital: Boolean(city.capital || burg.capital),
          burgId: Number(city.burgId),
          options: map.options || {}
        });
        if (Number(placement.port) !== Number(city.port)) addError("portPlacement", {cityOrdinal});
      }

      const portTopology = topology.inspectSettlementPortTopology(map, {mode: "load"}).report;
      if (portTopology.invalid || portTopology.conflicts || portTopology.lockConflicts) addError("portPlacement", {reason: "topology-report"});
      const portBurgs = (map.pack.burgs || []).filter(burg => burg?.i && !burg.removed && Number(burg.port) > 0);
      const groups = new Map();
      for (const burg of portBurgs) {
        const feature = Number(burg.port);
        const group = groups.get(feature) || [];
        group.push(burg);
        groups.set(feature, group);
      }
      const routeFeatures = new Set(routes.filter(route => route.type === "searoute").map(route => Number(route.feature)));
      let reachablePortFeatures = 0;
      let missingReachablePortFeatures = 0;
      for (const burgs of groups.values()) {
        let reachable = false;
        for (let from = 0; from < burgs.length && !reachable; from++) {
          for (let to = from + 1; to < burgs.length && !reachable; to++) {
            reachable = formal.traceSettlementWaterRoutePath(map.pack, burgs[from].cell, burgs[to].cell).length > 1;
          }
        }
        if (!reachable) continue;
        reachablePortFeatures++;
        if (!routeFeatures.has(Number(burgs[0].port))) {
          missingReachablePortFeatures++;
          addError("formalSeaPath", {reason: "missing-reachable-feature"});
        }
      }
      return {ports, reachablePortFeatures, missingReachablePortFeatures, portTopology};
    }

    function auditAdministrativeCoverage(map, routes, addError) {
      const routeCells = new Set(routes.filter(route => route.type === "road" || route.type === "trail").flatMap(route => route.packCells || []));
      const burgs = (map.pack.burgs || []).filter(burg => burg?.i && !burg.removed && map.pack.cells.h?.[burg.cell] >= 20);
      const featureCounts = countBy(burgs, burg => Number(map.pack.cells.f?.[burg.cell]) || 0);
      let missingRoles = 0;
      for (const burg of burgs) {
        const feature = Number(map.pack.cells.f?.[burg.cell]) || 0;
        if ((burg.capital || burg.provincial) && (featureCounts.get(feature) || 0) >= 2 && !routeCells.has(burg.cell)) missingRoles++;
      }
      const groups = new Map();
      for (const burg of burgs) {
        const province = Number(burg.province) || Number(burg.state) || 0;
        const feature = Number(map.pack.cells.f?.[burg.cell]) || 0;
        if (!province || !feature) continue;
        const key = `${province}:${feature}`;
        const group = groups.get(key) || [];
        group.push(burg);
        groups.set(key, group);
      }
      let starvedGroups = 0;
      for (const group of groups.values()) {
        if (group.length >= 2 && group.filter(burg => routeCells.has(burg.cell)).length < 2) starvedGroups++;
      }
      if (missingRoles || starvedGroups) addError("administrativeCoverage", {missingRoles, starvedGroups});
      return {missingRoles, starvedGroups};
    }

    function auditSparseDensity(map, routes, addError) {
      const endpointDegree = new Map();
      for (const route of routes) {
        if (route.type !== "trail" && route.type !== "searoute") continue;
        for (const cell of [route.packCells?.[0], route.packCells?.at(-1)]) {
          if (!Number.isInteger(cell) || !map.pack.cells.burg?.[cell]) continue;
          const key = `${route.type}:${cell}`;
          endpointDegree.set(key, (endpointDegree.get(key) || 0) + 1);
        }
      }
      const maxEndpointDegree = Math.max(0, ...endpointDegree.values());
      if (maxEndpointDegree > 6) addError("sparseDensity", {maxEndpointDegree});
      return {maxEndpointDegree};
    }

    function auditRoutePicking(map, index, picking, addError) {
      let candidate = null;
      for (const bucket of index?.buckets?.values?.() || []) {
        for (const segment of bucket.routeSegments || []) {
          const current = map.settlements.routes?.[segment.route?.id];
          if (current !== segment.route) addError("pickingCurrent", {reason: "stale-segment"});
          if (!candidate && segment?.a && segment?.b) candidate = segment;
        }
      }
      if (!candidate) {
        addError("pickingCurrent", {reason: "missing-segment"});
        return {hit: false, candidates: 0};
      }
      const x = (candidate.a[0] + candidate.b[0]) / 2;
      const y = (candidate.a[1] + candidate.b[1]) / 2;
      const hit = picking.pickRoute(map, index, x, y, 7);
      if (!hit || !map.settlements.routes?.[hit.id]) addError("pickingCurrent", {reason: "pick-miss"});
      return {hit: Boolean(hit), candidates: Number(hit?.candidateCount || 0)};
    }

    function routePoint(map, cityByBurg, cell) {
      const burgId = Number(map.pack.cells.burg?.[cell]);
      const city = cityByBurg.get(burgId);
      return routeEndpointCityId(map, cityByBurg, cell) >= 0 ? [city.x, city.y] : map.pack.cells.p[cell];
    }

    function routeEndpointCityId(map, cityByBurg, cell) {
      const burgId = Number(map.pack.cells.burg?.[cell]);
      const city = cityByBurg.get(burgId);
      const burg = map.pack.burgs?.[burgId];
      const valid = Number.isInteger(cell)
        && city && !city.removed && map.settlements.cities[city.id] === city
        && burg && !burg.removed && Number(burg.i ?? burg.id) === burgId
        && Number(city.burgId) === burgId && Number(city.packCell) === cell
        && Number(burg.cell) === cell && Number(map.pack.cells.g?.[cell]) === Number(city.cell);
      return valid ? Number(city.id) : -1;
    }

    function isPortCell(pack, cell) {
      const burg = pack.burgs?.[pack.cells.burg?.[cell]];
      return Boolean(burg?.i && burg.port && burg.cell === cell);
    }

    function isNavigableRiverCell(cells, cell) {
      return Boolean(cells.r?.[cell]) && (cells.fl?.[cell] || 0) >= 100;
    }

    function collectRiverEdges(rivers) {
      const edges = new Set();
      for (const river of rivers) {
        for (let index = 1; index < (river?.cells?.length || 0); index++) {
          const from = river.cells[index - 1];
          const to = river.cells[index];
          if (from >= 0 && to >= 0) edges.add(edgeKey(from, to));
        }
      }
      return edges;
    }

    function routePathRatio(points) {
      let length = 0;
      for (let index = 1; index < points.length; index++) length += distance(points[index - 1], points[index]);
      return length / Math.max(distance(points[0], points.at(-1)), 1e-6);
    }

    function routeBufferFingerprint(renderer) {
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.routeBuffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {
        byteLength,
        checksum,
        vertexCount: renderer.routeVertexCount,
        drawRanges: JSON.stringify(renderer.routeDrawRanges),
        camera: JSON.stringify(renderer.routeBufferCamera)
      };
    }

    function countBy(values, keyFn) {
      const counts = new Map();
      for (const value of values) counts.set(keyFn(value), (counts.get(keyFn(value)) || 0) + 1);
      return counts;
    }

    function samePoint(left, right) {
      return Array.isArray(left) && Array.isArray(right) && left[0] === right[0] && left[1] === right[1];
    }

    function sameMirrorPoint(point, expected, cell) {
      return Array.isArray(point) && point[0] === expected[0] && point[1] === expected[1] && point[2] === cell;
    }

    function distance(left, right) {
      return Math.hypot(right[0] - left[0], right[1] - left[1]);
    }

    function edgeKey(left, right) {
      return left < right ? `${left}:${right}` : `${right}:${left}`;
    }

    async function settleRenderer() {
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (!app.renderer.routeRefreshTimer && !app.renderer.routeRefreshActiveVersion) break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label}失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
      return result.data;
    }
  });
  await settlePage(page);
  await captureCdpScreenshot(cdp, output.screenshots.afterRoutes);

  output.runtimeDiagnostics = await page.evaluate(() => {
    const healthResult = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 180});
    if (!healthResult?.ok) throw new Error(`读取 health error 失败：${healthResult?.error?.message || "unknown"}`);
    const performanceTypes = new Set(["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"]);
    const events = healthResult.data.events || [];
    const performanceEvents = events.filter(event => performanceTypes.has(String(event?.type || "")));
    const applicationEvents = events.filter(event => !performanceTypes.has(String(event?.type || "")));
    const glError = Number(window.__webglGeneratorApp.renderer.getStats().draw?.glError ?? 0);
    return {
      healthErrors: events.length,
      performanceErrors: performanceEvents.length,
      activeApplicationErrors: applicationEvents.length,
      applicationErrorTypes: [...new Set(applicationEvents.map(event => String(event?.type || "unknown")))].slice(0, 5),
      glError
    };
  });
  assert.equal(output.runtimeDiagnostics.activeApplicationErrors, 0, "真实地图验收出现非性能 health error");
  assert.equal(output.runtimeDiagnostics.glError, 0, "真实地图验收出现 WebGL error");

  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message));
  output.healthPerformanceSignals = healthPerformanceSignals;
  output.applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  output.pageErrors = pageErrors;
  assert.deepEqual(output.applicationConsoleErrors, [], "真实地图验收出现应用 console error");
  assert.deepEqual(output.pageErrors, [], "真实地图验收出现 page error");
  output.ok = true;
} catch (error) {
  failure = error;
  output.failure = {message: anonymizeError(error)};
  if (page && cdp) {
    const failureScreenshot = join(artifactDir, "99-failure.png");
    try {
      await captureCdpScreenshot(cdp, failureScreenshot);
      output.screenshots.failure = failureScreenshot;
    } catch {}
  }
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.closeAllConnections?.();
  await Promise.race([new Promise(done => server.close(done)), delay(5000)]);
}

const finalStat = statSync(liveSave);
const finalSha256 = await sha256File(liveSave);
assert.equal(finalStat.size, sourceStat.size, "验收期间真实输入存档大小发生变化");
assert.equal(finalSha256, sourceSha256, "验收期间真实输入存档内容发生变化");
console.log(JSON.stringify(output, null, 2));
if (failure) process.exitCode = 1;

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    if (!request.url || !["GET", "HEAD"].includes(request.method || "")) return send(response, 405, "Method not allowed");
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target;
    let base;
    if (pathname === "/") {
      base = distDir;
      target = join(distDir, "index.html");
    } else if (pathname.startsWith("/__task325_source__/")) {
      base = appSourceDir;
      target = resolve(appSourceDir, pathname.slice("/__task325_source__/".length));
      if (extname(target).toLowerCase() !== ".js") return send(response, 404, "Not found");
    } else {
      base = distDir;
      target = resolve(distDir, "." + normalize(pathname));
    }
    if (!isWithin(base, target) || !existsSync(target) || statSync(target).isDirectory()) return send(response, 404, "Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store, max-age=0"});
    if (request.method === "HEAD") return response.end();
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function isWithin(base, target) {
  const pathFromBase = relative(resolve(base), resolve(target));
  return pathFromBase === "" || (!pathFromBase.startsWith(`..${sep}`) && pathFromBase !== ".." && !isAbsolute(pathFromBase));
}

function send(response, status, message) {
  response.writeHead(status, {"content-type": "text/plain; charset=utf-8", "cache-control": "no-store, max-age=0"});
  response.end(message);
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

async function settlePage(targetPage) {
  await targetPage.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!app?.renderer?.routeRefreshTimer && !app?.renderer?.routeRefreshActiveVersion) break;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  });
}

async function captureCdpScreenshot(session, target) {
  const result = await session.send("Page.captureScreenshot", {format: "png", fromSurface: true, captureBeyondViewport: false});
  writeFileSync(target, Buffer.from(result.data, "base64"), {flag: "wx"});
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function summarizeMap(map) {
  return {
    seed: map.metadata?.seed || map.options?.seed || "",
    checksum: map.metadata?.checksum || map.summary?.checksum || "",
    gridCells: map.grid?.cells?.i?.length || 0,
    routes: (map.settlements?.routes || []).filter(Boolean).length,
    rivers: (map.rivers?.rivers || []).filter(Boolean).length
  };
}

function anonymizeError(error) {
  return String(error?.message || error || "unknown")
    .replaceAll(expectedLiveMap.seed, "<live-seed>")
    .replace(/#[0-9]+/g, "#<id>")
    .replace(/\b(?:route|cell|city|burg)\s*[0-9]+\b/gi, match => match.replace(/[0-9]+/, "<id>"));
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
