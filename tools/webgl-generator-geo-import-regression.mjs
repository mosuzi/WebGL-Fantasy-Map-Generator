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
const port = Number(args.port || 5440);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "geo-import-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "geo-import-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "geo-import-regression-results.md"));
const fixturePath = resolve(args.fixture || join(rootDir, "docs", "generated", "reports", "geo-import-fixture.geojson"));
const fmgCellsFixturePath = resolve(args["fmg-cells-fixture"] || join(rootDir, "docs", "generated", "reports", "geo-import-fmg-cells-fixture.geojson"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});
mkdirSync(dirname(fixturePath), {recursive: true});

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
        measurements: false
      }
    }));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  const generation = await generateMap(page, {cells, seed, template, graphWidth, graphHeight});
  const fixture = await createGeoJsonFixture(page);
  writeFileSync(fixturePath, `${JSON.stringify(fixture.geoJson, null, 2)}\n`, "utf8");
  const fmgCellsFixture = await createFmgCellsGeoJsonFixture(page);
  writeFileSync(fmgCellsFixturePath, `${JSON.stringify(fmgCellsFixture.geoJson, null, 2)}\n`, "utf8");
  const importControl = await inspectGeoImportControl(page);
  const imported = await importGeoFixture(page, fixturePath, fixture.expected);
  const importedFmgCells = await importFmgCellsFixture(page, fmgCellsFixturePath);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      fixturePath,
      fmgCellsFixturePath,
      seed,
      cells,
      template,
      graphWidth,
      graphHeight,
      viewport,
      browserChannel,
      consoleErrors
    },
    generation,
    fixture: {
      featureCount: fixture.geoJson.features.length,
      expectedTypes: fixture.expected.map(item => item.type),
      fmgCellsFeatureCount: fmgCellsFixture.geoJson.features.length
    },
    importControl,
    imported,
    importedFmgCells,
    passed: !functionalConsoleErrors(consoleErrors).length && importControl.passed && imported.passed && (importedFmgCells?.passed ?? true)
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(renderFailureSummary(report));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateMap(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  const startedAt = await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__geoImportPreviousMap = window.__webglGeneratorApp?.map || null;
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    const started = performance.now();
    document.getElementById("generate-map").click();
    return started;
  }, {cells, seed, template, graphWidth, graphHeight});

  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map &&
        app.map !== window.__geoImportPreviousMap &&
        app.map.metadata?.seed === expected.seed &&
        app.map.metadata?.cellsTarget === expected.cells &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {cells, seed},
    {timeout: timeoutMs}
  );

  return page.evaluate(startedAt => {
    const app = window.__webglGeneratorApp;
    const stats = app.renderer.getStats();
    return {
      elapsedMs: roundBrowserMs(performance.now() - startedAt),
      generationMs: roundBrowserMs(app.map.metadata.generationTiming?.totalMs || 0),
      loadMapMs: roundBrowserMs(stats.loadMap?.totalMs || 0),
      glError: stats.draw?.glError || 0
    };

    function roundBrowserMs(value) {
      return Math.round(Number(value || 0) * 10) / 10;
    }
  }, startedAt);
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
    const worldPoint = (xRatio, yRatio) => ({
      x: round(width * xRatio),
      y: round(height * yRatio)
    });
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
        name: "geo-import-regression",
        features: [
          {
            type: "Feature",
            id: "fixture-point",
            properties: {name: "导入点"},
            geometry: {type: "Point", coordinates: project(point)}
          },
          {
            type: "Feature",
            id: "fixture-line",
            properties: {name: "导入线"},
            geometry: {type: "LineString", coordinates: line.map(project)}
          },
          {
            type: "Feature",
            id: "fixture-polygon",
            properties: {name: "导入面"},
            geometry: {type: "Polygon", coordinates: [polygonRing.map(project)]}
          }
        ]
      },
      expected: [
        {name: "导入点", type: "point", points: [point]},
        {name: "导入线", type: "polyline", points: line},
        {name: "导入面", type: "polygon", points: polygon}
      ]
    };

    function round(value) {
      return Math.round(Number(value || 0) * 1000) / 1000;
    }
  });
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
        geometry: {
          type: "Polygon",
          coordinates: [ring]
        }
      };
    }).filter(feature => feature.geometry.coordinates[0].length >= 4);

    return {
      geoJson: {
        type: "FeatureCollection",
        name: "geo-import-fmg-cells-regression",
        features
      }
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

async function importGeoFixture(page, filePath, expected) {
  await page.locator("#import-geo-file").setInputFiles(filePath);
  await page.waitForFunction(
    expectedCount => {
      const app = window.__webglGeneratorApp;
      return app?.map?.measurements?.items?.length >= expectedCount &&
        document.getElementById("file-operation-status")?.textContent?.includes("GEO 数据已导入为") &&
        document.querySelectorAll(".measurement-object-point").length >= 1 &&
        document.querySelectorAll(".measurement-object-path").length >= 1 &&
        document.querySelectorAll(".measurement-object-area").length >= 1 &&
        app.renderer?.getStats?.()?.draw?.glError === 0;
    },
    expected.length,
    {timeout: timeoutMs}
  );

  return page.evaluate(expected => {
    const app = window.__webglGeneratorApp;
    const items = app.map.measurements.items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      pointCount: item.points?.length || 0,
      points: (item.points || []).map(point => ({x: point.x, y: point.y})),
      routeFit: item.routeFit,
      closed: item.closed,
      summary: item.summary
    }));
    const failures = [];
    if (items.length < expected.length) failures.push(`导入对象数量 ${items.length} < ${expected.length}`);
    for (const target of expected) {
      const item = items.find(candidate => candidate.name === target.name);
      if (!item) {
        failures.push(`缺少导入对象：${target.name}`);
        continue;
      }
      if (item.type !== target.type) failures.push(`${target.name} 类型 ${item.type} != ${target.type}`);
      if (!samePoints(item.points, target.points)) failures.push(`${target.name} 坐标未按当前地图坐标反投影`);
      if (item.routeFit !== "none") failures.push(`${target.name} routeFit 应为 none，实际 ${item.routeFit}`);
    }
    const pointCount = document.querySelectorAll(".measurement-object-point").length;
    const pathCount = document.querySelectorAll(".measurement-object-path").length;
    const areaCount = document.querySelectorAll(".measurement-object-area").length;
    const status = document.getElementById("file-operation-status")?.textContent || "";
    const measurementLayerVisible = app.renderer?.layerVisibility?.measurements !== false;
    const glError = app.renderer.getStats().draw?.glError || 0;
    if (pointCount < 1) failures.push("未绘制导入点");
    if (pathCount < 1) failures.push("未绘制导入线");
    if (areaCount < 1) failures.push("未绘制导入面");
    if (!measurementLayerVisible) failures.push("导入后测量图层未自动显示");
    if (!status.includes(`GEO 数据已导入为 ${expected.length} 个测量对象`)) failures.push(`状态栏文本异常：${status}`);
    if (glError) failures.push(`WebGL error ${glError}`);
    return {
      items,
      pointCount,
      pathCount,
      areaCount,
      status,
      measurementLayerVisible,
      glError,
      failures,
      passed: failures.length === 0
    };

    function samePoints(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((point, index) => Math.abs(point.x - b[index].x) < 0.001 && Math.abs(point.y - b[index].y) < 0.001);
    }
  }, expected);
}

async function importFmgCellsFixture(page, filePath) {
  const residue = await injectGeoImportResidue(page);
  await page.locator("#import-geo-file").setInputFiles(filePath);
  await page.waitForFunction(
    () => {
      const app = window.__webglGeneratorApp;
      const status = document.getElementById("file-operation-status")?.textContent || "";
      return app?.map?.metadata?.geoImportDerivedRefresh &&
        status.includes("已从原版 Cells GEO 导入地形") &&
        app.renderer?.getStats?.()?.draw?.glError === 0;
    },
    null,
    {timeout: timeoutMs}
  );

  return page.evaluate(residue => {
    function inspectGeoResetResidue(map, residue) {
      const failures = [];
      const markers = map.markers?.markers || [];
      const zones = map.zones?.zones || [];
      const regiments = (map.pack?.states || []).flatMap(state => state?.military || []);
      if (markers.some(marker => marker?.name === residue.markerName)) failures.push("旧资源点残留未清理");
      if (zones.some(zone => zone?.name === residue.zoneName)) failures.push("旧地区残留未清理");
      if (regiments.some(regiment => regiment?.name === residue.regimentName)) failures.push("旧军团残留未清理");
      if ((map.labels?.custom || []).length || (map.labels?.hidden?.city || []).length || (map.labels?.hidden?.state || []).length) failures.push("旧标签残留未清理");
      if ((map.notes?.notes || []).length) failures.push("旧备注残留未清理");
      if ((map.measurements?.items || []).length) failures.push("旧测量对象残留未清理");
      if ((map.markers?.metadata?.resourceMarkers || 0) <= 0) failures.push("GEO 导入后没有重建资源点");
      if ((map.military?.metadata?.regiments || 0) <= 0) failures.push("GEO 导入后没有重建军事数据");
      if ((map.zones?.metadata?.zones || 0) <= 0) failures.push("GEO 导入后没有重建地区数据");
      if (map.metadata?.derivedStale?.systems?.length) failures.push(`GEO 导入后仍有派生系统 stale：${map.metadata.derivedStale.systems.join(",")}`);
      return {
        markers: markers.length,
        resourceMarkers: map.markers?.metadata?.resourceMarkers || 0,
        regiments: map.military?.metadata?.regiments || 0,
        zones: map.zones?.metadata?.zones || 0,
        labels: (map.labels?.custom || []).length,
        notes: (map.notes?.notes || []).length,
        measurements: (map.measurements?.items || []).length,
        failures
      };
    }

    const app = window.__webglGeneratorApp;
    const map = app.map;
    const failures = [];
    let gridMismatch = 0;
    let packMismatch = 0;
    let gridLand = 0;
    let gridFeatureLand = 0;
    let packLand = 0;
    let packFeatureLand = 0;

    for (const cell of map.grid.cells.i) {
      const heightLand = map.grid.cells.h[cell] >= 20;
      const featureLand = Boolean(map.features.features?.[map.grid.cells.f?.[cell]]?.land);
      if (heightLand) gridLand++;
      if (featureLand) gridFeatureLand++;
      if (heightLand !== featureLand) gridMismatch++;
    }

    for (let cell = 0; cell < map.pack.cells.h.length; cell += 1) {
      const heightLand = map.pack.cells.h[cell] >= 20;
      const featureLand = Boolean(map.pack.features?.[map.pack.cells.f?.[cell]]?.land);
      if (heightLand) packLand++;
      if (featureLand) packFeatureLand++;
      if (heightLand !== featureLand) packMismatch++;
    }

    const hover = sampleHoverConsistency(app);
    const status = document.getElementById("file-operation-status")?.textContent || "";
    const glError = app.renderer.getStats().draw?.glError || 0;
    const resetChecks = inspectGeoResetResidue(map, residue);
    if (gridMismatch) failures.push(`grid 高度水陆与 feature 水陆不一致：${gridMismatch}`);
    if (packMismatch) failures.push(`pack 高度水陆与 feature 水陆不一致：${packMismatch}`);
    if (hover.mismatch) failures.push(`悬停水陆与高度水陆不一致：${hover.mismatch}`);
    if (hover.checked < 20) failures.push(`悬停抽样不足：${hover.checked}`);
    if (!status.includes("已从原版 Cells GEO 导入地形")) failures.push(`状态栏文本异常：${status}`);
    if (!status.includes("重置非 GEO 数据")) failures.push(`状态栏未说明非 GEO 数据重置：${status}`);
    for (const failure of resetChecks.failures) failures.push(failure);
    if (glError) failures.push(`WebGL error ${glError}`);
    return {
      status,
      glError,
      gridLand,
      gridFeatureLand,
      gridMismatch,
      packLand,
      packFeatureLand,
      packMismatch,
      hover,
      resetChecks,
      derivedRefresh: map.metadata?.geoImportDerivedRefresh || null,
      failures,
      passed: failures.length === 0
    };

    function sampleHoverConsistency(app) {
      const {map, renderer} = app;
      const rect = renderer.canvas.getBoundingClientRect();
      const samples = [];
      const step = Math.max(1, Math.floor(map.grid.cells.i.length / 180));
      for (let index = 0; index < map.grid.cells.i.length && samples.length < 80; index += step) {
        const cell = map.grid.cells.i[index];
        const point = map.grid.points[cell];
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
  }, residue);
}

async function injectGeoImportResidue(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const packCell = (map.pack?.cells?.i || []).find(cell => map.pack.cells.h?.[cell] >= 20) ?? 1;
    const point = map.pack?.cells?.p?.[packCell] || [0, 0];
    const markerName = "__geo_import_old_resource__";
    const zoneName = "__geo_import_old_zone__";
    const regimentName = "__geo_import_old_regiment__";
    const marker = {
      id: 900001,
      i: 900001,
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
    map.markers = {
      ...(map.markers || {}),
      markers,
      metadata: {...(map.markers?.metadata || {}), markers: markers.length, resourceMarkers: (map.markers?.metadata?.resourceMarkers || 0) + 1}
    };
    map.pack.markers = markers;

    const zone = {i: 900001, name: zoneName, type: "Invasion", cells: [packCell], pattern: "diagonal", hexColor: "#ff00ff", hidden: false};
    const zones = Array.isArray(map.zones?.zones) ? [...map.zones.zones.filter(Boolean), zone] : [zone];
    map.zones = {...(map.zones || {}), zones, metadata: {...(map.zones?.metadata || {}), zones: zones.length}};
    map.pack.zones = zones;

    const state = (map.pack.states || []).find(item => item?.i && !item.removed);
    if (state) {
      if (!Array.isArray(state.military)) state.military = [];
      state.military.push({id: `${state.i}:old`, i: 999, name: regimentName, state: state.i, cell: packCell, x: point[0], y: point[1], a: 999, t: 999, u: {infantry: 999}, status: "resting"});
    }
    map.military = {...(map.military || {}), metadata: {...(map.military?.metadata || {}), regiments: (map.military?.metadata?.regiments || 0) + 1}};

    map.labels = {custom: [{id: 900001, text: "__geo_import_old_label__", x: point[0], y: point[1]}], hidden: {city: [1], state: [1]}, metadata: {custom: 1, hidden: 2}};
    map.notes = {notes: [{id: "marker:900001", kind: "marker", objectId: 900001, name: "__geo_import_old_note__", body: "old"}], metadata: {notes: 1, formatVersion: 1}};
    map.measurements = {version: 1, items: [{id: "measurement-900001", type: "point", name: "__geo_import_old_measurement__", points: [{x: point[0], y: point[1]}], routeFit: "none"}], metadata: {measurements: 1, nextId: 900002}};
    return {markerName, zoneName, regimentName};
  });
}

async function inspectGeoImportControl(page) {
  return page.evaluate(() => {
    const label = Array.from(document.querySelectorAll(".file-import-action"))
      .find(element => element.textContent?.includes("导入 GEO 数据"));
    const input = label?.querySelector('input[type="file"]') || null;
    const failures = [];
    if (!label) failures.push("缺少导入 GEO 数据控件");
    if (!input) failures.push("导入 GEO 数据控件内没有原生 file input");
    if (input?.hidden || input?.hasAttribute("hidden")) failures.push("GEO file input 不应使用 hidden 属性");
    if (input?.id !== "import-geo-file") failures.push(`GEO file input id 异常：${input?.id || "none"}`);
    if (input && !String(input.accept || "").includes(".geojson")) failures.push(`GEO file input accept 异常：${input.accept || "none"}`);
    return {
      text: label?.textContent?.trim() || "",
      hasNativeInput: Boolean(input),
      inputId: input?.id || "",
      accept: input?.accept || "",
      hiddenAttribute: Boolean(input?.hidden || input?.hasAttribute("hidden")),
      failures,
      passed: failures.length === 0
    };
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# GEO 数据导入回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 摘要", "");
  lines.push(`- fixture Feature：${report.fixture.featureCount}`);
  lines.push(`- FMG Cells fixture Feature：${report.fixture.fmgCellsFeatureCount}`);
  lines.push(`- 期望类型：${report.fixture.expectedTypes.join(" / ")}`);
  lines.push(`- 导入控件：${report.importControl.passed ? "原生 file input" : "异常"}`);
  lines.push(`- 导入对象：${report.imported.items.length}`);
  lines.push(`- overlay：点 ${report.imported.pointCount}，线 ${report.imported.pathCount}，面 ${report.imported.areaCount}`);
  lines.push(`- 测量图层：${report.imported.measurementLayerVisible ? "已显示" : "未显示"}`);
  lines.push(`- 状态栏：${report.imported.status}`);
  if (report.importedFmgCells) {
    lines.push(`- FMG Cells 地形导入：grid mismatch ${report.importedFmgCells.gridMismatch}，pack mismatch ${report.importedFmgCells.packMismatch}，hover mismatch ${report.importedFmgCells.hover.mismatch} / ${report.importedFmgCells.hover.checked}`);
    lines.push(`- FMG Cells 重置：军事 ${report.importedFmgCells.resetChecks.regiments}，资源点 ${report.importedFmgCells.resetChecks.resourceMarkers}，地区 ${report.importedFmgCells.resetChecks.zones}，旧测量 ${report.importedFmgCells.resetChecks.measurements}`);
  }
  lines.push(`- WebGL error：${report.imported.glError}`);
  lines.push("");
  lines.push("## 性能", "");
  lines.push(`- 点击到出图：${report.generation.elapsedMs}ms`);
  lines.push(`- 纯生成：${report.generation.generationMs}ms`);
  lines.push(`- WebGL 加载：${report.generation.loadMapMs}ms`);
  const failures = [...report.importControl.failures, ...report.imported.failures, ...(report.importedFmgCells?.failures || [])];
  if (failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of failures) lines.push(`- ${failure}`);
  }
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["GEO 数据导入回归失败："];
  for (const failure of report.importControl.failures) lines.push(`- ${failure}`);
  for (const failure of report.imported.failures) lines.push(`- ${failure}`);
  for (const failure of report.importedFmgCells?.failures || []) lines.push(`- ${failure}`);
  for (const error of functionalConsoleErrors(report.metadata.consoleErrors)) lines.push(`- console error: ${error}`);
  return lines.join("\n");
}

function functionalConsoleErrors(errors) {
  return (errors || []).filter(error => !String(error || "").includes("[FMG health]"));
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
