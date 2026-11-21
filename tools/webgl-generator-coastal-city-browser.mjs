import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {pickGridCell} from "../app/webgl-generator/src/renderer/picking.js";
import {decodeWebfmgV3Document} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";

const file = process.argv[2] || "tools/fixtures/webgl-map-v4-coastal-cities-0.5.173.webfmg";
const old = decodeWebfmgV3Document(gunzipSync(readFileSync(file))).map;
const offshore = old.settlements.cities.filter(city => city && old.grid.cells.h[pickGridCell(old, city.x, city.y).gridCell] < 20);
assert.ok(offshore.length);
const server = await preview({configFile: "vite.config.mjs", preview: {port: 0, host: "127.0.0.1"}});
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const browser = await chromium.launch({channel: "chrome"});
try {
  const page = await browser.newPage({viewport: {width: 1120, height: 820}});
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await waitForApiReady(page, 120000);
  await page.locator("#import-map-file").setInputFiles(file);
  await page.waitForFunction(seed => window.__webglGeneratorApp.map?.metadata.seed === seed, old.metadata.seed, {timeout: 120000});
  await waitForApiReady(page, 120000);
  const ids = offshore.map(city => city.id);
  const positions = await page.evaluate(ids => {
    const {map, renderer} = window.__webglGeneratorApp;
    const rect = renderer.canvas.getBoundingClientRect();
    return ids.map(id => {
      const city = map.settlements.cities[id];
      const p = renderer.worldToScreen(city.x, city.y, rect);
      const hit = renderer.pickCellClientPoint(rect.left + p.x, rect.top + p.y);
      return {id, height: map.grid.cells.h[hit.gridCell], x: city.x, y: city.y};
    });
  }, ids);
  assert.ok(positions.every(c => c.height >= 20), JSON.stringify(positions.filter(c => !(c.height >= 20))));
  const api = async (method, ...args) => {
    const result = await page.evaluate(([method, args]) => window.webglGeneratorApi.layers[method](...args), [method, args]);
    assert.ok(result.ok, JSON.stringify(result.error));
  };
  await api("setViewMode", "height");
  await api("setShowOceanHeight", false);
  for (const layer of ["cities", "routes", "rivers", "stateBorders"]) await api("setVisible", layer, false);
  const target = offshore.find(city => city.port) || offshore[0];
  const sample = async smooth => {
    await api("setSmoothCellBorders", smooth);
    return page.evaluate(({id, x, y}) => {
      const {map, renderer} = window.__webglGeneratorApp;
      const city = map.settlements.cities[id];
      renderer.locateBounds({minX: city.x, minY: city.y, maxX: city.x, maxY: city.y}, {minScale: 16, maxScale: 16});
      renderer.draw();
      const {canvas, gl} = renderer, rect = canvas.getBoundingClientRect();
      const pixel = (x, y) => {
        const point = renderer.worldToScreen(x, y, rect);
        const data = new Uint8Array(4);
        gl.readPixels(Math.floor(point.x * canvas.width / rect.width), canvas.height - 1 - Math.floor(point.y * canvas.height / rect.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return [...data];
      };
      return {land: pixel(city.x, city.y), oldPosition: pixel(x, y), water: Array.from(renderer.surfaceHeightColorTable.slice(0,4), n => Math.round(n * 255))};
    }, {id: target.id, x: target.x, y: target.y});
  };
  const samples = [];
  for (const smooth of [false, true]) {
    const result = await sample(smooth);
    assert.notDeepEqual(result.land, result.water, JSON.stringify(result));
    assert.deepEqual(result.oldPosition, result.water, "原来的落点应在水色上");
    samples.push(result);
  }
  await api("setVisible", "cities", true);
  await api("setVisible", "routes", true);
  const center = await page.evaluate(() => {
    const rect = window.__webglGeneratorApp.renderer.canvas.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  });
  if (process.env.FMG_COAST_PNG) await page.screenshot({path: process.env.FMG_COAST_PNG});
  await page.mouse.click(center.x, center.y);
  await page.waitForFunction(id => {
    const ref = window.__webglGeneratorApp.selectionStore.getSnapshot()?.selection?.object;
    return ref?.kind === "city" && ref.id === id;
  }, target.id, {timeout: 10000});
  if (!process.argv[2]) {
    const saved = await page.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap({toast: false}));
    assert.ok(saved.ok, JSON.stringify(saved.error));
    const restored = await page.evaluate(() => window.webglGeneratorApi.data.restoreBrowserMap({confirm: true, toast: false}));
    assert.ok(restored.ok, JSON.stringify(restored.error));
    const coordinates = await page.evaluate(ids => ids.map(id => {
      const city = window.__webglGeneratorApp.map.settlements.cities[id];
      return [city.id, city.x, city.y];
    }), ids);
    assert.deepEqual(coordinates, positions.map(c => [c.id, c.x, c.y]));
  }
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.gl.getError()), 0);
  console.log(JSON.stringify({cells: old.grid.points.length, repaired: positions.length, picked: target.name, samples}));
} finally {
  await browser.close();
  await server.close();
}
