import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const require = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url));
const {chromium} = require("playwright");
const {PNG} = require("pngjs");
const server = await preview({configFile: "vite.config.mjs", preview: {host: "127.0.0.1", port: 5691, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const outline = page.locator(".list-hover-outline");
const panel = page.locator(".floating-panel:not(.hidden)").last();
const tables = (process.env.FMG_HOVER_PANELS || "state city river route province culture religion zone lake marker military government diplomacy economy ocean-current label-naming notes measurement").split(" ");

async function openPanel(name) {
  await page.evaluate(name => {
    document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close").forEach(button => button.click());
    document.getElementById("open-" + name + "-panel").click();
  }, name);
  await page.locator(`[data-panel-id="${name}-panel"] .object-table-wrap`).first().waitFor();
  if (name === "economy") await panel.locator(".el-segmented__item").filter({hasText: "交易"}).click();
  return panel.locator(".object-table-wrap").last().locator("tr[data-row-key]");
}

function redPixels(pixels) {
  let red = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 160 && pixels[i + 1] < 100 && pixels[i + 2] < 105) red++;
  }
  return red;
}

async function renderedMapState() {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {revision: app.mapRevision.getSnapshot(), selection: app.selection?.object?.id ?? null, highlights: app.renderer.objectHighlights.length};
  });
}

async function checkInwardStroke(before, after) {
  const samples = [];
  for (let i = 0; i < after.data.length; i += 4) {
    if (before.data[i + 1] - after.data[i + 1] < 36 || after.data[i] - after.data[i + 1] < 60) continue;
    const pixel = i / 4;
    samples.push([pixel % after.width, Math.floor(pixel / after.width)]);
  }
  assert.ok(samples.length > 100, "应能在地图上读到红色描边");
  const outside = await outline.evaluate((svg, samples) => {
    const path = new Path2D(svg.querySelector("clipPath path").getAttribute("d")), rect = svg.getBoundingClientRect();
    const context = document.createElement("canvas").getContext("2d");
    return samples.filter(([x, y]) => ![[0.5, 0.5], [0, 0], [0, 1], [1, 0], [1, 1]].some(([dx, dy]) =>
      context.isPointInPath(path, x + dx - rect.left, y + dy - rect.top, "evenodd"))).length;
  }, samples);
  assert.ok(outside <= samples.length * 0.005, `红色越界像素 ${outside}/${samples.length}`);
}

try {
  await page.goto(process.env.FMG_TEST_URL || "http://127.0.0.1:5691/");
  await waitForApiReady(page, 180000);
  if (process.env.FMG_REAL_ARCHIVE) {
    assert.ok(!process.env.FMG_TEST_URL, "仅在本地验证真实存档");
    await page.locator("#import-map-file").setInputFiles(process.env.FMG_REAL_ARCHIVE);
    await page.waitForFunction(() => window.__webglGeneratorApp.map.grid.cells.i.length === 100000);
    await waitForApiReady(page, 180000);
  } else {
    const generated = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "ui-layout-contract", cellsTarget: 3000}));
    assert.ok(generated.ok);
  }
  const fixtures = await page.evaluate(async () => {
    const api = window.webglGeneratorApi, map = window.__webglGeneratorApp.map;
    return [await api.edit.notes.createStandalone({id: "hover-note", name: "悬停测试", packCell: map.pack.cells.h.findIndex(h => h >= 20)}),
      await api.edit.measurements.save([{x: 100, y: 100}, {x: 240, y: 180}], {name: "悬停测试"})];
  });
  assert.ok(fixtures.every(r => r.ok), JSON.stringify(fixtures));
  const results = {};
  for (const name of tables) {
    const rows = await openPanel(name);
    if (process.env.FMG_REAL_ARCHIVE && !await rows.count()) {
      console.log(name, "旧档没有对象行");
      continue;
    }
    const stateBefore = await renderedMapState();
    assert.equal(await panel.getByRole("button", {name: /高亮选中|清除高亮|高亮交易流|高亮关系/}).count(), 0);
    let found = false;
    for (let i = 0; i < Math.min(12, await rows.count()); i++) {
      const row = rows.nth(i);
      if (name === "state" && await row.getAttribute("data-row-key") === "n:0") continue;
      if (name === "state" && !i) {
        await row.hover();
        await page.mouse.move(1570, 975);
        await page.waitForTimeout(360);
        assert.equal(await outline.count(), 0, "快速掠过应取消等待");
      }
      await row.hover();
      if (name === "state") {
        await page.waitForTimeout(120);
        assert.equal(await outline.count(), 0, "悬停门槛前过早描边");
      }
      await page.waitForTimeout(380);
      if (!await outline.count()) continue;
      const paths = await outline.locator(".list-hover-trace").evaluateAll(nodes => nodes.map(p => ({
        length: document.querySelector(p.querySelector("use").getAttribute("href")).getTotalLength(),
        ms: parseFloat(getComputedStyle(p).animationDuration) * 1000,
        delay: parseFloat(getComputedStyle(p).animationDelay) * 1000
      })));
      assert.ok(Math.abs(paths.at(-1).delay + paths.at(-1).ms - 900) < 0.1, name);
      let delay = 0;
      const length = paths.reduce((sum, p) => sum + p.length, 0);
      for (const p of paths) {
        assert.ok(Math.abs(p.delay - delay) < 0.1);
        assert.ok(Math.abs(p.ms - 900 * p.length / length) < 0.5, "速度须与对象轮廓总长成正比");
        delay += p.ms;
      }
      results[name] = {row: await row.getAttribute("data-row-key"), paths: paths.length};
      if (name === "state") {
        const firstRingContainsCapital = await row.evaluate(el => {
          const app = window.__webglGeneratorApp;
          const id = Number(el.dataset.rowKey.slice(2));
          const burg = app.map.pack.burgs[app.map.politics.states[id].capital];
          if (!burg || app.map.grid.cells.state[app.map.pack.cells.g[burg.cell]] !== id) return null;
          const p = app.renderer.worldToScreen(burg.x, burg.y, app.renderer.canvas.getBoundingClientRect());
          return document.getElementById("list-hover-path-0").isPointInFill(new DOMPoint(p.x, p.y));
        });
        assert.notEqual(firstRingContainsCapital, false, "首都必须位于第一块领土");
        const during = redPixels(PNG.sync.read(await page.screenshot()).data);
        await page.waitForTimeout(1000);
        const after = PNG.sync.read(await page.screenshot());
        const complete = redPixels(after.data);
        await outline.evaluate(el => {el.style.visibility = "hidden";});
        const before = PNG.sync.read(await page.screenshot());
        const baseline = redPixels(before.data);
        await outline.evaluate(el => {el.style.visibility = "";});
        assert.ok(complete > during && complete > baseline + 30, JSON.stringify({complete, during, baseline}));
        await checkInwardStroke(before, after);
        assert.equal(redPixels(PNG.sync.read(await page.screenshot()).data), complete, "悬停结束后描边须保持");
        Object.assign(results[name], {during, complete, baseline});
      }
      found = true;
      break;
    }
    assert.ok(found, name + " 缺少可描画的目标 " + JSON.stringify({rows: await rows.count(), first: await rows.first().textContent({timeout: 1200}).catch(() => null), errors}));
    if (name === "city") await panel.locator(".floating-panel-close").evaluate(button => button.click());
    await page.mouse.move(1570, 975);
    assert.equal(await outline.count(), 0, name + " 离开后仍可见");
    const stateAfter = await renderedMapState();
    assert.deepEqual(stateAfter, stateBefore);
    console.log(name, JSON.stringify(results[name]));
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
