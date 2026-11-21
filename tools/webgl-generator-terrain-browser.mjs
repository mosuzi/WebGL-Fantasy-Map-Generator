import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {terrainClassAt, TERRAIN_CLASSES} from "../app/webgl-generator/src/renderer/terrain-classes.js";

const legacy = process.argv.includes("--legacy");
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const server = await preview({configFile: "vite.config.mjs", preview: {port: 0, host: "127.0.0.1", strictPort: true}});
const browser = await chromium.launch({channel: "chrome"});
try {
  const page = await browser.newPage({viewport: {width: 1240, height: 820}});
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await waitForApiReady(page, 150000);
  if (legacy) {
    await page.locator("#import-map-file").setInputFiles(process.env.FMG_REAL_ARCHIVE || join(homedir(), "Downloads", "krichars (3).webfmg"));
    await page.waitForFunction(() => window.__webglGeneratorApp.map.grid.cells.i.length === 100000, null, {timeout: 150000});
  } else {
    const result = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "terrain-glacier", cellsTarget: 3000, heightmapTemplate: "continents", temperatureNorthPole: -36, temperatureSouthPole: -30}));
    assert.ok(result.ok, JSON.stringify(result.error));
  }
  await waitForApiReady(page, 150000);
  await page.evaluate(() => {
    const {map, renderer} = window.__webglGeneratorApp;
    window.terrainFrame = () => {
      const {gl, canvas, camera} = renderer;
      renderer.draw({updateDynamicBuffers: false, updateOverlay: false});
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const samples = map.grid.points.map(([x,y]) => {
        const cx = Math.floor(((2*x/map.metadata.graphWidth-1)*camera.scale+camera.offsetX+1)*canvas.width/2);
        const cy = Math.floor(((1-2*y/map.metadata.graphHeight)*camera.scale+camera.offsetY+1)*canvas.height/2);
        if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return -1;
        const i = (cy*canvas.width+cx)*4;
        return (pixels[i]<<16) | (pixels[i+1]<<8) | pixels[i+2];
      });
      let checksum = 2166136261;
      for (const byte of pixels) checksum = Math.imul(checksum ^ byte, 16777619);
      return {samples, checksum};
    };
  });
  const frame = () => page.evaluate(() => window.terrainFrame());
  await page.locator("#open-generation-panel").click();
  const tab = key => page.locator('[data-control-tab="'+key+'"]').click();
  const actionDurations = [];
  async function observeAction(click) {
    await page.evaluate(() => {
      window.terrainLongTasks = [];
      window.terrainObserver = new PerformanceObserver(list => {
        window.terrainLongTasks.push(...list.getEntries().map(entry => entry.duration));
      });
      window.terrainObserver.observe({type: "longtask", buffered: false});
    });
    await click();
    await waitForApiReady(page, 60000);
    actionDurations.push(...await page.evaluate(() => {
      const pending = window.terrainObserver.takeRecords();
      window.terrainObserver.disconnect();
      return [...window.terrainLongTasks, ...pending.map(entry => entry.duration)];
    }));
  }
  const view = async label => {
    await tab("themes");
    const button = page.locator(".view-mode-segmented .el-segmented__item").filter({hasText: new RegExp("^"+label+"$")});
    if (label === "地形") await observeAction(() => button.click());
    else {
      await button.click();
      await waitForApiReady(page, 60000);
    }
  };
  const toggleIce = async () => {
    await tab("layers");
    await observeAction(() => page.locator('button[data-layer="iceFields"]').click());
  };
  const grid = await page.evaluate(() => {
    const {grid} = window.__webglGeneratorApp.map;
    return {points: grid.points, cells: {h: Array.from(grid.cells.h), c: Array.from(grid.cells.c, row => Array.from(row)), biome: Array.from(grid.cells.biome)}};
  });
  const classes = grid.cells.h.map((_, i) => terrainClassAt(grid, i));
  const ice = classes.map((id, i) => TERRAIN_CLASSES[id].key === "ice" ? i : -1).filter(i => i >= 0);
  assert.ok(ice.length, "地图须含已经计算的冰川陆地格");
  await view("高度");
  const initial = await frame();
  await toggleIce();
  const overlay = await frame();
  const affected = ice.filter(i => initial.samples[i] !== overlay.samples[i]).length;
  assert.ok(affected > 0, "开启冰原后已有冰川格必须改变");
  const other = classes.filter((id, i) => TERRAIN_CLASSES[id].key !== "ice" && initial.samples[i] !== overlay.samples[i]).length;
  // 靠边格的中心有时与邻格量化到相同屏幕像素，放大视图可分辨。
  assert.ok(other < Math.max(3, classes.length * 0.002), "非冰川中心大面积变色 "+other);
  const png = async () => page.evaluate(async () => {
    const result = await window.webglGeneratorApi.data.exportPNG({download: false, includeDataUrl: true, outputWidth: 800, crop: {mode: "viewport"}});
    if (!result.ok) throw Error(result.error.message);
    return result.data.dataUrl;
  });
  const icePng = await png();
  await toggleIce();
  assert.equal((await frame()).checksum, initial.checksum, "关闭冰原恢复原画面");
  assert.notEqual(await png(), icePng, "冰原须进入正式 PNG");
  // 旧图首次切换既有专题时，核对全部格心并以稳定的高度帧作整帧对照。
  let heightReference = initial;
  if (legacy) {
    await view("生物群系");
    await view("高度");
    heightReference = await frame();
    assert.deepEqual(heightReference.samples, initial.samples);
  }
  await view("地形");
  assert.equal(await page.locator("#map-legend .legend-swatch-item").count(), TERRAIN_CLASSES.length - 1);
  const terrain = await frame();
  assert.notEqual(terrain.checksum, initial.checksum);
  const matches = {};
  for (const {id, key, color} of TERRAIN_CLASSES.slice(1)) {
    const rgb = color.slice(0,3).map(v => Math.round(v*255));
    const count = classes.filter((c,i) => c === id && terrain.samples[i] >= 0 && [16,8,0].every((shift,k) => Math.abs(((terrain.samples[i]>>shift)&255) - rgb[k]) <= 1)).length;
    matches[key] = count;
  }
  assert.ok(Object.values(matches).filter(Boolean).length >= (legacy ? 8 : 4), JSON.stringify(matches));
  if (!legacy) {
    const glacier = ice.find(cell => terrain.samples[cell] !== initial.samples[cell]);
    assert.ok(Number.isInteger(glacier));
    const edit = await page.evaluate(cell => {
      const api = window.webglGeneratorApi;
      const options = {scope: "land"};
      const inspected = api.edit.biomes.inspectAssignment(1, [cell], options);
      if (!inspected.ok) throw Error(JSON.stringify(inspected.error));
      const {inspectionToken, expectedRevision, inspectorSchemaVersion} = inspected.data;
      return api.edit.biomes.assignCells(1, [cell], {...options, inspectionToken, expectedRevision, inspectorSchemaVersion});
    }, glacier);
    assert.ok(edit.ok && edit.data.executed, JSON.stringify(edit));
    await waitForApiReady(page, 60000);
    assert.notEqual((await frame()).samples[glacier], terrain.samples[glacier], "冰川改为沙漠后，地形颜色同步");
    await view("高度");
    const iceRemoved = (await frame()).samples[glacier];
    await toggleIce();
    assert.equal((await frame()).samples[glacier], iceRemoved, "改为沙漠后不再叠加冰原");
    await toggleIce();
    await view("地形");
    const undo = await page.evaluate(() => window.webglGeneratorApi.history.undo());
    assert.ok(undo.ok, JSON.stringify(undo));
    await waitForApiReady(page, 60000);
    assert.equal((await frame()).samples[glacier], terrain.samples[glacier], "撤销恢复冰原的地形颜色");
  }
  const terrainPng = await png();
  assert.notEqual(terrainPng, icePng);
  if (process.env.FMG_TERRAIN_OUTPUT) for (const [name, data] of [["地形", terrainPng], ["冰原", icePng]]) {
    await writeFile(join(process.env.FMG_TERRAIN_OUTPUT, (legacy ? "旧图-" : "新图-")+name+".png"), Buffer.from(data.split(",")[1], "base64"));
  }
  await view("高度");
  assert.equal((await frame()).checksum, heightReference.checksum, "地形往返须逐像素恢复高度视图");
  const hiddenCenters = ice.filter(cell => initial.samples[cell] === overlay.samples[cell]);
  for (const cell of hiddenCenters) {
    await page.evaluate(cell => {
      const {map, renderer} = window.__webglGeneratorApp;
      const [x, y] = map.grid.points[cell];
      renderer.locateBounds({minX: x, maxX: x, minY: y, maxY: y}, {minScale: 18, maxScale: 18});
    }, cell);
    const centerPixels = () => page.evaluate(() => {
      const {renderer} = window.__webglGeneratorApp;
      renderer.draw();
      const {gl, canvas} = renderer;
      const pixels = new Uint8Array(9 * 9 * 4);
      gl.readPixels(Math.floor(canvas.width / 2) - 4, Math.floor(canvas.height / 2) - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return Array.from(pixels);
    });
    const closeup = await centerPixels();
    await toggleIce();
    assert.notDeepEqual(await centerPixels(), closeup, "近景冰川格 " + cell + " 必须可见");
    await toggleIce();
    assert.deepEqual(await centerPixels(), closeup, "近景冰原开关须完整恢复");
  }
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.gl.getError()), 0);
  assert.deepEqual(errors, []);
  const maximumLongTaskMs = Math.max(0, ...actionDurations);
  assert.ok(maximumLongTaskMs <= 200, "地形视图或冰原开关长任务 " + maximumLongTaskMs);
  console.log(JSON.stringify({maximumLongTaskMs, checkedAtCloseZoom: hiddenCenters.length, cells: classes.length, ice: ice.length, affected, other, matches, exactRoundTrip: true}));
} finally {
  await browser.close();
  await server.close();
}
