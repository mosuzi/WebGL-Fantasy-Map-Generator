#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5446);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "api-geo-import-regression");
const template = String(args.template || "continents");
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "api-geo-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "api-geo-regression-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.setItem("webgl-generator-control-preferences", JSON.stringify({
      colorMode: "height",
      showOceanHeight: false,
      smoothCellBorders: true,
      showHoverInfo: true,
      maxCityLabels: 5000,
      layers: {
        coastline: true,
        lakeShore: true,
        stateBorders: true,
        provinceBorders: true,
        routes: true,
        measurements: false
      }
    }));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(`${baseUrl}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.webglGeneratorApi && window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  const generation = await generateMap(page, {cells, seed, template});
  const ordinaryFixture = await createGeoJsonFixture(page);
  const ordinary = await inspectOrdinaryGeoImport(page, ordinaryFixture);
  const fmgCellsFixture = await createFmgCellsGeoJsonFixture(page);
  const fmgCells = await inspectFmgCellsGeoImport(page, fmgCellsFixture.geoJson);
  const healthErrors = await inspectHealthErrors(page);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells,
      template,
      viewport,
      browserChannel,
      consoleErrors,
      pageErrors
    },
    generation,
    fixture: {
      ordinaryFeatures: ordinaryFixture.geoJson.features.length,
      fmgCellsFeatures: fmgCellsFixture.geoJson.features.length
    },
    ordinary,
    fmgCells,
    healthErrors,
    passed: generation.glError === 0 &&
      ordinary.passed &&
      fmgCells.passed &&
      healthErrors.total === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify(buildConsoleSummary(report), null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(renderFailureSummary(report));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateMap(page, {cells, seed, template}) {
  return page.evaluate(async ({cells, seed, template}) => {
    const api = window.webglGeneratorApi;
    const started = performance.now();
    const generated = unwrap(await api.generate.newMap({
      confirm: true,
      seed,
      cellsTarget: cells,
      heightmapTemplate: template
    }), "generate.newMap");
    const summary = unwrap(api.info.mapSummary(), "info.mapSummary");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    return {
      elapsedMs: round(performance.now() - started),
      generated,
      checksum: summary.checksum,
      gridCells: summary.gridCells,
      packCells: summary.packCells,
      glError: stats.draw?.glError || 0
    };

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }

    function round(value) {
      return Math.round(Number(value || 0) * 10) / 10;
    }
  }, {cells, seed, template});
}

async function createGeoJsonFixture(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const width = Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1;
    const height = Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1;
    const coordinates = map.mapCoordinates || {};
    const lonW = Number.isFinite(Number(coordinates.lonW)) ? Number(coordinates.lonW) : 0;
    const lonE = Number.isFinite(Number(coordinates.lonE)) ? Number(coordinates.lonE) : width;
    const latN = Number.isFinite(Number(coordinates.latN)) ? Number(coordinates.latN) : 0;
    const latS = Number.isFinite(Number(coordinates.latS)) ? Number(coordinates.latS) : height;
    const worldPoint = (xRatio, yRatio) => ({x: round(width * xRatio), y: round(height * yRatio)});
    const project = point => [
      round(lonW + point.x / width * (lonE - lonW)),
      round(latN + point.y / height * (latS - latN))
    ];
    const point = worldPoint(0.36, 0.34);
    const line = [worldPoint(0.42, 0.42), worldPoint(0.48, 0.46), worldPoint(0.56, 0.43)];
    const polygon = [worldPoint(0.58, 0.62), worldPoint(0.68, 0.61), worldPoint(0.66, 0.72), worldPoint(0.57, 0.7)];
    const polygonRing = [...polygon, polygon[0]];
    return {
      geoJson: {
        type: "FeatureCollection",
        name: "api-geo-import-regression",
        features: [
          {type: "Feature", id: "api-point", properties: {name: "API 导入点"}, geometry: {type: "Point", coordinates: project(point)}},
          {type: "Feature", id: "api-line", properties: {name: "API 导入线"}, geometry: {type: "LineString", coordinates: line.map(project)}},
          {type: "Feature", id: "api-polygon", properties: {name: "API 导入面"}, geometry: {type: "Polygon", coordinates: [polygonRing.map(project)]}}
        ]
      },
      expected: [
        {name: "API 导入点", type: "point", points: [point]},
        {name: "API 导入线", type: "polyline", points: line},
        {name: "API 导入面", type: "polygon", points: polygon}
      ]
    };

    function round(value) {
      return Math.round(Number(value || 0) * 1000) / 1000;
    }
  });
}

async function inspectOrdinaryGeoImport(page, fixture) {
  return page.evaluate(async fixture => {
    const failures = [];
    const api = window.webglGeneratorApi;
    const before = unwrap(api.info.mapSummary(), "info.mapSummary.before");
    const noConfirm = await api.data.importGEO(fixture.geoJson, {locate: false});
    if (noConfirm?.ok !== false || !String(noConfirm?.error?.message || "").includes("confirm")) {
      failures.push("普通 GeoJSON 未确认导入没有结构化失败");
    }
    if (measurementItems().length !== 0) failures.push("未确认导入写入了测量对象");

    const objectImport = unwrap(await api.data.importGEO(fixture.geoJson, {confirm: true, locate: false}), "data.importGEO.object");
    const objectCheck = inspectMeasurements(fixture.expected, "object");
    if (objectImport.mode !== "measurements") failures.push(`对象导入 mode 异常：${objectImport.mode}`);
    if (objectImport.importedCount !== fixture.expected.length) failures.push(`对象导入数量 ${objectImport.importedCount} != ${fixture.expected.length}`);
    failures.push(...objectCheck.failures);
    const undoObject = unwrap(await api.history.undo(), "history.undo.object");
    if (measurementItems().length !== 0) failures.push("撤销对象导入后测量对象未清空");

    const stringImport = unwrap(await api.data.importGEO(JSON.stringify(fixture.geoJson), {confirm: true, locate: false}), "data.importGEO.string");
    const stringCheck = inspectMeasurements(fixture.expected, "string");
    if (stringImport.mode !== "measurements") failures.push(`字符串导入 mode 异常：${stringImport.mode}`);
    if (stringImport.importedCount !== fixture.expected.length) failures.push(`字符串导入数量 ${stringImport.importedCount} != ${fixture.expected.length}`);
    failures.push(...stringCheck.failures);
    const historyAfterString = unwrap(api.history.get(), "history.get.afterString");
    const undoString = unwrap(await api.history.undo(), "history.undo.string");
    if (measurementItems().length !== 0) failures.push("撤销字符串导入后测量对象未清空");

    const beforeBad = unwrap(api.info.mapSummary(), "info.mapSummary.beforeBad");
    const badJson = await api.data.importGEO("{bad json", {confirm: true, locate: false});
    if (badJson?.ok !== false) failures.push("坏 GeoJSON 没有结构化失败");
    const afterBad = unwrap(api.info.mapSummary(), "info.mapSummary.afterBad");
    if (afterBad.checksum !== beforeBad.checksum) failures.push("坏 GeoJSON 改变了地图 checksum");
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError || 0;
    if (glError) failures.push(`普通 GeoJSON 导入后 WebGL error ${glError}`);

    return {
      checksum: before.checksum,
      noConfirm: {ok: noConfirm?.ok ?? null, message: noConfirm?.error?.message || ""},
      objectImport: summarizeImport(objectImport, objectCheck, undoObject),
      stringImport: summarizeImport(stringImport, stringCheck, undoString),
      historyAfterString: {undo: historyAfterString.undo, redo: historyAfterString.redo, lastAffected: historyAfterString.lastAffected || []},
      badJson: {ok: badJson?.ok ?? null, message: badJson?.error?.message || "", checksumPreserved: afterBad.checksum === beforeBad.checksum},
      glError,
      failures,
      passed: failures.length === 0
    };

    function measurementItems() {
      return window.__webglGeneratorApp?.map?.measurements?.items || [];
    }

    function inspectMeasurements(expected, label) {
      const items = measurementItems().map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        pointCount: item.points?.length || 0,
        points: (item.points || []).map(point => ({x: point.x, y: point.y})),
        routeFit: item.routeFit,
        closed: item.closed
      }));
      const output = [];
      if (items.length !== expected.length) output.push(`${label} 测量对象数量 ${items.length} != ${expected.length}`);
      for (const target of expected) {
        const item = items.find(candidate => candidate.name === target.name);
        if (!item) {
          output.push(`${label} 缺少导入对象：${target.name}`);
          continue;
        }
        if (item.type !== target.type) output.push(`${label} ${target.name} 类型 ${item.type} != ${target.type}`);
        if (item.routeFit !== "none") output.push(`${label} ${target.name} routeFit 应为 none，实际 ${item.routeFit}`);
        if (!samePoints(item.points, target.points)) output.push(`${label} ${target.name} 坐标未按当前地图坐标反投影`);
      }
      const app = window.__webglGeneratorApp;
      if (app.renderer?.layerVisibility?.measurements === false) output.push(`${label} 导入后测量图层未自动显示`);
      return {items, failures: output};
    }

    function summarizeImport(result, check, undoResult) {
      return {
        mode: result.mode,
        imported: result.imported,
        importedCount: result.importedCount,
        featureCount: result.featureCount,
        items: check.items,
        undo: {undo: undoResult.undo, redo: undoResult.redo, command: undoResult.command || ""}
      };
    }

    function samePoints(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((point, index) => Math.abs(point.x - b[index].x) < 0.001 && Math.abs(point.y - b[index].y) < 0.001);
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.message || "未知错误"}`);
      return result.data;
    }
  }, fixture);
}

async function createFmgCellsGeoJsonFixture(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const width = Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1;
    const height = Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1;
    const coordinates = map.mapCoordinates || {};
    const lonW = Number.isFinite(Number(coordinates.lonW)) ? Number(coordinates.lonW) : 0;
    const lonE = Number.isFinite(Number(coordinates.lonE)) ? Number(coordinates.lonE) : width;
    const latN = Number.isFinite(Number(coordinates.latN)) ? Number(coordinates.latN) : 0;
    const latS = Number.isFinite(Number(coordinates.latS)) ? Number(coordinates.latS) : height;
    const cells = map.grid.cells;
    const vertices = map.grid.vertices;
    const cellIds = Array.from(cells.i || []);
    const step = Math.max(1, Math.floor(cellIds.length / 720));
    const selected = cellIds.filter((_, index) => index % step === 0).slice(0, 900);
    const features = selected.map((cell, index) => {
      const ring = (cells.v[cell] || [])
        .map(vertex => vertices.p?.[vertex])
        .filter(Boolean)
        .map(project);
      if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push([...ring[0]]);
      const landHeight = 30 + (index % 5) * 8;
      const elevation = index % 7 === 0 ? -120 : Math.round((landHeight - 18) ** 2);
      return {
        type: "Feature",
        id: cell,
        properties: {
          id: cell,
          height: elevation,
          biome: Number(cells.biome?.[cell] ?? 0),
          neighbors: (cells.c?.[cell] || []).filter(Number.isInteger)
        },
        geometry: {type: "Polygon", coordinates: [ring]}
      };
    }).filter(feature => feature.geometry.coordinates[0].length >= 4);

    return {
      geoJson: {type: "FeatureCollection", name: "api-geo-fmg-cells-regression", features}
    };

    function project(point) {
      return [
        round(lonW + point[0] / width * (lonE - lonW)),
        round(latN + point[1] / height * (latS - latN))
      ];
    }

    function round(value) {
      return Math.round(Number(value || 0) * 1000000) / 1000000;
    }
  });
}

async function inspectFmgCellsGeoImport(page, geoJson) {
  const residue = await injectGeoImportResidue(page);
  return page.evaluate(async ({geoJson, residue}) => {
    const failures = [];
    const api = window.webglGeneratorApi;
    const result = unwrap(await api.data.importGEO(geoJson, {confirm: true}), "data.importGEO.fmgCells");
    if (result.mode !== "fmg-cells-terrain") failures.push(`FMG Cells mode 异常：${result.mode}`);
    if (result.imported !== true) failures.push(`FMG Cells imported 异常：${result.imported}`);
    if ((result.summary?.appliedCells || 0) <= 0) failures.push("FMG Cells 未应用到当前 cells");
    if ((result.reset?.resourceMarkers || 0) <= 0) failures.push("FMG Cells 导入后未重建资源点");
    if ((result.reset?.militaryRegiments || 0) <= 0) failures.push("FMG Cells 导入后未重建军事");
    if ((result.reset?.zones || 0) <= 0) failures.push("FMG Cells 导入后未重建地区");

    const app = window.__webglGeneratorApp;
    const map = app.map;
    const resetChecks = inspectGeoResetResidue(map, residue);
    const consistency = inspectLandConsistency(app);
    const history = unwrap(api.history.get(), "history.get.fmgCells");
    const status = document.getElementById("file-operation-status")?.textContent || "";
    const stats = app.renderer?.getStats?.() || {};
    const glError = stats.draw?.glError || 0;
    failures.push(...resetChecks.failures, ...consistency.failures);
    if (!status.includes("已通过 API 从原版 Cells GEO 导入地形")) failures.push(`状态栏文本异常：${status}`);
    if (glError) failures.push(`FMG Cells 导入后 WebGL error ${glError}`);

    return {
      mode: result.mode,
      imported: result.imported,
      summary: result.summary,
      reset: result.reset,
      map: result.map,
      history: {undo: history.undo, redo: history.redo, lastAffected: history.lastAffected || []},
      status,
      resetChecks,
      consistency,
      glError,
      failures,
      passed: failures.length === 0
    };

    function inspectGeoResetResidue(currentMap, oldResidue) {
      const output = [];
      const markers = currentMap.markers?.markers || [];
      const zones = currentMap.zones?.zones || [];
      const regiments = (currentMap.pack?.states || []).flatMap(state => state?.military || []);
      if (markers.some(marker => marker?.name === oldResidue.markerName)) output.push("旧资源点残留未清理");
      if (zones.some(zone => zone?.name === oldResidue.zoneName)) output.push("旧地区残留未清理");
      if (regiments.some(regiment => regiment?.name === oldResidue.regimentName)) output.push("旧军团残留未清理");
      if ((currentMap.labels?.custom || []).length || (currentMap.labels?.hidden?.city || []).length || (currentMap.labels?.hidden?.state || []).length) output.push("旧标签残留未清理");
      if ((currentMap.notes?.notes || []).length) output.push("旧备注残留未清理");
      if ((currentMap.measurements?.items || []).length) output.push("旧测量对象残留未清理");
      if ((currentMap.markers?.metadata?.resourceMarkers || 0) <= 0) output.push("GEO 导入后没有重建资源点");
      if ((currentMap.military?.metadata?.regiments || 0) <= 0) output.push("GEO 导入后没有重建军事数据");
      if ((currentMap.zones?.metadata?.zones || 0) <= 0) output.push("GEO 导入后没有重建地区数据");
      if (currentMap.metadata?.derivedStale?.systems?.length) output.push(`GEO 导入后仍有派生系统 stale：${currentMap.metadata.derivedStale.systems.join(",")}`);
      return {
        resourceMarkers: currentMap.markers?.metadata?.resourceMarkers || 0,
        regiments: currentMap.military?.metadata?.regiments || 0,
        zones: currentMap.zones?.metadata?.zones || 0,
        labels: (currentMap.labels?.custom || []).length,
        notes: (currentMap.notes?.notes || []).length,
        measurements: (currentMap.measurements?.items || []).length,
        failures: output
      };
    }

    function inspectLandConsistency(appRef) {
      const currentMap = appRef.map;
      const output = [];
      let gridMismatch = 0;
      let packMismatch = 0;
      for (const cell of currentMap.grid.cells.i) {
        const heightLand = currentMap.grid.cells.h[cell] >= 20;
        const featureLand = Boolean(currentMap.features.features?.[currentMap.grid.cells.f?.[cell]]?.land);
        if (heightLand !== featureLand) gridMismatch++;
      }
      for (let cell = 0; cell < currentMap.pack.cells.h.length; cell += 1) {
        const heightLand = currentMap.pack.cells.h[cell] >= 20;
        const featureLand = Boolean(currentMap.pack.features?.[currentMap.pack.cells.f?.[cell]]?.land);
        if (heightLand !== featureLand) packMismatch++;
      }
      const hover = sampleHoverConsistency(appRef);
      if (gridMismatch) output.push(`grid 高度水陆与 feature 水陆不一致：${gridMismatch}`);
      if (packMismatch) output.push(`pack 高度水陆与 feature 水陆不一致：${packMismatch}`);
      if (hover.mismatch) output.push(`悬停水陆与高度水陆不一致：${hover.mismatch}`);
      if (hover.checked < 20) output.push(`悬停抽样不足：${hover.checked}`);
      return {gridMismatch, packMismatch, hover, failures: output};
    }

    function sampleHoverConsistency(appRef) {
      const {map: currentMap, renderer} = appRef;
      const rect = renderer.canvas.getBoundingClientRect();
      const samples = [];
      const step = Math.max(1, Math.floor(currentMap.grid.cells.i.length / 180));
      for (let index = 0; index < currentMap.grid.cells.i.length && samples.length < 80; index += step) {
        const cell = currentMap.grid.cells.i[index];
        const point = currentMap.grid.points[cell];
        if (!point) continue;
        const screen = renderer.worldToScreen(point[0], point[1], rect);
        const pick = renderer.pickClientPoint(rect.left + screen.x, rect.top + screen.y);
        if (!pick || !Number.isInteger(pick.gridCell)) continue;
        const heightLand = pick.height >= 20;
        samples.push({cell: pick.gridCell, heightLand, featureLand: Boolean(pick.featureLand), featureType: pick.featureType});
      }
      const mismatch = samples.filter(item => item.heightLand !== item.featureLand).length;
      return {checked: samples.length, mismatch, samples: samples.slice(0, 8)};
    }

    function unwrap(apiResult, label) {
      if (!apiResult?.ok) throw new Error(`${label} 调用失败：${apiResult?.error?.message || "未知错误"}`);
      return apiResult.data;
    }
  }, {geoJson, residue});
}

async function injectGeoImportResidue(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const packCell = (map.pack?.cells?.i || []).find(cell => map.pack.cells.h?.[cell] >= 20) ?? 1;
    const point = map.pack?.cells?.p?.[packCell] || [0, 0];
    const markerName = "__api_geo_old_resource__";
    const zoneName = "__api_geo_old_zone__";
    const regimentName = "__api_geo_old_regiment__";
    const marker = {
      id: 910001,
      i: 910001,
      type: "mines",
      name: markerName,
      category: "resource",
      resourceKey: "ore",
      resourceLabel: "矿产",
      economicValue: 999,
      packCell,
      cell: map.pack?.cells?.g?.[packCell] ?? packCell,
      x: point[0],
      y: point[1],
      data: {state: map.pack?.cells?.state?.[packCell] || 0, province: map.pack?.cells?.province?.[packCell] || 0}
    };
    const markers = Array.isArray(map.markers?.markers) ? [...map.markers.markers.filter(Boolean), marker] : [marker];
    map.markers = {...(map.markers || {}), markers, metadata: {...(map.markers?.metadata || {}), markers: markers.length, resourceMarkers: (map.markers?.metadata?.resourceMarkers || 0) + 1}};
    map.pack.markers = markers;

    const zone = {i: 910001, name: zoneName, type: "Invasion", cells: [packCell], pattern: "diagonal", hexColor: "#ff00ff", hidden: false};
    const zones = Array.isArray(map.zones?.zones) ? [...map.zones.zones.filter(Boolean), zone] : [zone];
    map.zones = {...(map.zones || {}), zones, metadata: {...(map.zones?.metadata || {}), zones: zones.length}};
    map.pack.zones = zones;

    const state = (map.pack.states || []).find(item => item?.i && !item.removed);
    if (state) {
      if (!Array.isArray(state.military)) state.military = [];
      state.military.push({id: `${state.i}:api-old`, i: 999, name: regimentName, state: state.i, cell: packCell, x: point[0], y: point[1], a: 999, t: 999, u: {infantry: 999}, status: "resting"});
    }
    map.military = {...(map.military || {}), metadata: {...(map.military?.metadata || {}), regiments: (map.military?.metadata?.regiments || 0) + 1}};
    map.labels = {custom: [{id: 910001, text: "__api_geo_old_label__", x: point[0], y: point[1]}], hidden: {city: [1], state: [1]}, metadata: {custom: 1, hidden: 2}};
    map.notes = {notes: [{id: "marker:910001", kind: "marker", objectId: 910001, name: "__api_geo_old_note__", body: "old"}], metadata: {notes: 1, formatVersion: 1}};
    map.measurements = {version: 1, items: [{id: "measurement-910001", type: "point", name: "__api_geo_old_measurement__", points: [{x: point[0], y: point[1]}], routeFit: "none"}], metadata: {measurements: 1, nextId: 910002}};
    return {markerName, zoneName, regimentName};
  });
}

async function inspectHealthErrors(page) {
  return page.evaluate(() => {
    const result = window.webglGeneratorApi.info.healthEvents({severity: "error", limit: 180});
    if (!result?.ok) throw new Error(`info.healthEvents 调用失败：${result?.error?.message || "未知错误"}`);
    return {
      total: result.data.total,
      counts: result.data.counts,
      events: result.data.events.map(event => ({
        severity: event.severity || event.level || "",
        message: event.message || "",
        operation: event.operation || ""
      }))
    };
  });
}

function buildConsoleSummary(report) {
  return {
    ok: report.passed,
    generation: {
      checksum: report.generation.checksum,
      gridCells: report.generation.gridCells,
      packCells: report.generation.packCells
    },
    ordinary: {
      objectImported: report.ordinary.objectImport.importedCount,
      stringImported: report.ordinary.stringImport.importedCount,
      noConfirmRejected: report.ordinary.noConfirm.ok === false,
      badJsonRejected: report.ordinary.badJson.ok === false,
      badJsonChecksumPreserved: report.ordinary.badJson.checksumPreserved
    },
    fmgCells: {
      imported: report.fmgCells.imported,
      appliedCells: report.fmgCells.summary?.appliedCells || 0,
      resourceMarkers: report.fmgCells.resetChecks.resourceMarkers,
      regiments: report.fmgCells.resetChecks.regiments,
      zones: report.fmgCells.resetChecks.zones,
      gridMismatch: report.fmgCells.consistency.gridMismatch,
      packMismatch: report.fmgCells.consistency.packMismatch,
      hoverMismatch: report.fmgCells.consistency.hover.mismatch
    },
    glError: report.fmgCells.glError,
    healthErrors: report.healthErrors.total,
    consoleErrors: report.metadata.consoleErrors.length,
    pageErrors: report.metadata.pageErrors.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# API GEO 导入回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 普通 GeoJSON", "");
  lines.push(`- Feature：${report.fixture.ordinaryFeatures}`);
  lines.push(`- 对象导入：${report.ordinary.objectImport.importedCount} 个测量对象`);
  lines.push(`- 字符串导入：${report.ordinary.stringImport.importedCount} 个测量对象`);
  lines.push(`- 未确认导入：${report.ordinary.noConfirm.ok === false ? "结构化失败" : "异常"}`);
  lines.push(`- 坏 JSON：${report.ordinary.badJson.ok === false ? "结构化失败" : "异常"}，checksum 保持：${report.ordinary.badJson.checksumPreserved ? "是" : "否"}`);
  lines.push("");
  lines.push("## FMG Cells GEO", "");
  lines.push(`- Feature：${report.fixture.fmgCellsFeatures}`);
  lines.push(`- 应用 cells：${report.fmgCells.summary?.appliedCells || 0}`);
  lines.push(`- 重建资源点 / 军事 / 地区：${report.fmgCells.resetChecks.resourceMarkers} / ${report.fmgCells.resetChecks.regiments} / ${report.fmgCells.resetChecks.zones}`);
  lines.push(`- grid / pack mismatch：${report.fmgCells.consistency.gridMismatch} / ${report.fmgCells.consistency.packMismatch}`);
  lines.push(`- hover mismatch：${report.fmgCells.consistency.hover.mismatch} / ${report.fmgCells.consistency.hover.checked}`);
  lines.push("");
  lines.push("## 运行状态", "");
  lines.push(`- WebGL error：${report.fmgCells.glError}`);
  lines.push(`- health error：${report.healthErrors.total}`);
  lines.push(`- console error：${report.metadata.consoleErrors.length}`);
  lines.push(`- page error：${report.metadata.pageErrors.length}`);
  const failures = [...report.ordinary.failures, ...report.fmgCells.failures];
  if (failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of failures) lines.push(`- ${failure}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["API GEO 导入回归失败："];
  for (const failure of report.ordinary.failures) lines.push(`- ${failure}`);
  for (const failure of report.fmgCells.failures) lines.push(`- ${failure}`);
  for (const event of report.healthErrors.events || []) lines.push(`- health error: ${event.message || JSON.stringify(event)}`);
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  for (const error of report.metadata.pageErrors) lines.push(`- page error: ${error}`);
  return lines.join("\n");
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);

    if (!target.startsWith(publicDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": getContentType(target),
      "cache-control": "no-store, max-age=0"
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function parseViewport(value) {
  const [width, height] = String(value).split("x").map(Number);
  return {
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 820
  };
}

function getContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".json" || ext === ".geojson") return "application/json;charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function loadPlaywright(sourceDirectory) {
  const requireFromSource = createRequire(join(sourceDirectory, "package.json"));
  try {
    return requireFromSource("playwright");
  } catch (error) {
    fail(`无法加载 Playwright，请先在 source/Fantasy-Map-Generator 安装依赖：${error.message}`);
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  try {
    return await playwright.chromium.launch({headless, channel: browserChannel});
  } catch (error) {
    fail(`无法启动 Chromium channel=${browserChannel}：${error.message}`);
  }
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
