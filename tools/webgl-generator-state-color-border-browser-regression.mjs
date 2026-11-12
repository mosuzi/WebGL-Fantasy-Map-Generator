#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {extname, join, resolve, sep} from "node:path";

const root = resolve(import.meta.dirname, "..");
const cellsTarget = process.argv.includes("--100k") ? 100000 : 10000;
const dist = join(root, "dist", "webgl-generator");
assert.ok(existsSync(join(dist, "index.html")), "先执行 pnpm run build:app");
const playwright = createRequire(join(root, "source", "Fantasy-Map-Generator", "package.json"))("playwright");
const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml"};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const path = resolve(dist, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!path.startsWith(dist + sep) || !existsSync(path) || !statSync(path).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
  createReadStream(path).pipe(response);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1360, height: 900}});
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?healthClear=1&debug=1`, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
  await page.waitForFunction(() => !window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy && document.getElementById("generation-loading")?.hidden !== false);
  const generated = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "state-color-border-regression", cellsTarget: target}), cellsTarget);
  assert.equal(generated.ok, true, generated.error?.message);
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.seed === "state-color-border-regression" && !window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy);
  const initial = await page.evaluate(() => {
    const {map, renderer} = window.__webglGeneratorApp;
    renderer.setColorMode("states");
    const cells = map.grid.cells;
    const shoreCells = [...renderer.shoreSurfaceCellRanges.landCorrections.keys()];
    const shoreCell = shoreCells.find(cell => cells.state[cell] > 0 && map.politics.states[cells.state[cell]]?.color);
    if (shoreCell === undefined) throw new Error("缺少有颜色的沿海国家 cell");
    const stateId = cells.state[shoreCell];
    const before = map.politics.states[stateId].color;
    const palette = [...renderer.cellAttributeStore.snapshot.palettes.states.slice((stateId + 1) * 4, (stateId + 2) * 4)];
    return {stateId, shoreCell, before, palette};
  });
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.state.open(app.map, app.editHistory.getStats());
    app.panels.state.setTargetStateId(id);
  }, initial.stateId);
  const canvasPixelHash = () => page.evaluate(async () => {
    const renderer = window.__webglGeneratorApp.renderer;
    renderer.draw({updateOverlay: false, updateDynamicBuffers: false});
    const gl = renderer.gl;
    const pixels = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
    gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  });
  const beforePanel = await canvasPixelHash();
  await page.getByRole("button", {name: "调整颜色"}).evaluate(button => button.click());
  await page.getByRole("dialog", {name: "调整颜色"}).waitFor();
  const whilePanel = await canvasPixelHash();
  assert.equal(whilePanel, beforePanel, "仅打开颜色面板改变了地图像素");
  await page.getByRole("button", {name: "关闭二级编辑面板"}).evaluate(button => button.click());
  const afterPanel = await canvasPixelHash();
  assert.equal(afterPanel, beforePanel, "关闭颜色面板未恢复地图像素");
  const afterColor = initial.before.toLowerCase() === "#ff33aa" ? "#22cc44" : "#ff33aa";
  const changed = await page.evaluate(([id, color]) => window.webglGeneratorApi.edit.states.setColor(id, color), [initial.stateId, afterColor]);
  assert.equal(changed.ok, true, changed.error?.message);
  const after = await page.evaluate(({stateId, shoreCell}) => {
    const {map, renderer} = window.__webglGeneratorApp;
    const range = renderer.shoreSurfaceCellRanges.landCorrections.get(shoreCell)?.[0];
    return {
      color: map.politics.states[stateId].color,
      palette: [...renderer.cellAttributeStore.snapshot.palettes.states.slice((stateId + 1) * 4, (stateId + 2) * 4)],
      shore: range ? [...renderer.landCorrectionVertices.slice(range.start + 2, range.start + 5)] : null,
      glError: renderer.gl.getError()
    };
  }, initial);
  const expected = [1, 3, 5].map(index => Number.parseInt(afterColor.slice(index, index + 2), 16));
  assert.deepEqual(after.palette.slice(0, 3), expected, "国家底色 GPU palette 未随颜色操作更新");
  assert.ok(after.shore?.every((value, index) => Math.abs(value * 255 - expected[index]) <= 1), "海岸修正色未随颜色操作更新");
  const undone = await page.evaluate(() => window.__webglGeneratorApp.runtimeActions.history.undo());
  assert.ok(undone, "颜色撤销失败");
  const restored = await page.evaluate(id => {
    const {map, renderer} = window.__webglGeneratorApp;
    return {color: map.politics.states[id].color, palette: [...renderer.cellAttributeStore.snapshot.palettes.states.slice((id + 1) * 4, (id + 2) * 4)], glError: renderer.gl.getError()};
  }, initial.stateId);
  assert.equal(restored.color, initial.before);
  assert.deepEqual(restored.palette, initial.palette, "撤销后 GPU palette 未恢复");
  const restoredPixels = await canvasPixelHash();
  assert.equal(restoredPixels, beforePanel, "改色撤销后地图像素未恢复");
  const borderEffect = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    renderer.setViewOptions({stateBorderBlend: {enabled: true, widthWorld: 9.5, strength: 1}});
    return renderer.viewOptions.stateBorderBlend.enabled;
  });
  assert.equal(borderEffect, true);
  const blendedPixels = await canvasPixelHash();
  assert.notEqual(blendedPixels, beforePanel, "开启国界过渡没有改变画面");
  await page.evaluate(() => window.__webglGeneratorApp.renderer.setViewOptions({stateBorderBlend: {enabled: false, widthWorld: 9.5, strength: 1}}));
  assert.equal(await canvasPixelHash(), beforePanel, "关闭国界过渡后地图像素未恢复");
  const brushEdge = await page.evaluate(shoreCell => {
    const {map, renderer} = window.__webglGeneratorApp;
    const states = map.politics.states;
    const oldId = map.grid.cells.state[shoreCell];
    const nextId = states.find(state => state?.i > 0 && state.i !== oldId && state.color)?.i;
    if (!nextId) throw new Error("缺少可用于岸边画笔验证的另一个国家");
    const expected = [1, 3, 5].map(index => Number.parseInt(states[nextId].color.slice(index, index + 2), 16));
    map.grid.cells.state[shoreCell] = nextId;
    if (!renderer.refreshEditedCellColors([shoreCell])) throw new Error("岸边 cell 颜色局部刷新失败");
    const range = renderer.shoreSurfaceCellRanges.landCorrections.get(shoreCell)?.[0];
    const painted = range ? [...renderer.landCorrectionVertices.slice(range.start + 2, range.start + 5)] : null;
    map.grid.cells.state[shoreCell] = oldId;
    renderer.refreshEditedCellColors([shoreCell]);
    const reverted = range ? [...renderer.landCorrectionVertices.slice(range.start + 2, range.start + 5)] : null;
    return {expected, painted, reverted, glError: renderer.gl.getError()};
  }, initial.shoreCell);
  assert.ok(brushEdge.painted?.every((value, index) => Math.abs(value * 255 - brushEdge.expected[index]) <= 1), "岸边画笔未更新修正层颜色");
  assert.ok(brushEdge.reverted?.every((value, index) => Math.abs(value * 255 - initial.palette[index]) <= 1), "岸边画笔恢复后修正层颜色未恢复");
  assert.equal(brushEdge.glError, 0);
  assert.equal(after.glError, 0);
  assert.equal(restored.glError, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ok: true, cellsTarget, initial, afterColor, after, restored, colorPanelPixelsStable: true, blendRoundTrip: true, brushEdge}, null, 2));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
