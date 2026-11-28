import assert from "node:assert/strict";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

export async function checkSmoothPaint(browser, port, save) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  try {
    await page.goto(`http://127.0.0.1:${port}/?healthClear=1&debug=1`);
    await waitForApiReady(page, 90000);
    if (save) {
      await page.locator("#import-map-file").setInputFiles(save);
      await page.waitForFunction(() => window.__webglGeneratorApp.map.grid.cells.h.length === 100000);
      await waitForApiReady(page, 90000);
    }
    const results = [];
    for (const kind of ["state", "province"]) {
      const sample = await page.evaluate(prepareCoast, kind);
      await page.mouse.move(sample.x, sample.y);
      await page.mouse.down();
      const first = await page.evaluate(checkPaintPixels, {phase: "down"});
      const next = await page.evaluate(nextUnpaintedCell, sample);
      await page.mouse.move(next.x, next.y, {steps: 3});
      assert.equal(await page.evaluate(({kind, cell}) => window.__webglGeneratorApp.map.grid.cells[kind][cell], {kind, cell: next.cell}), sample.target, "拖动须实际涂到第二个格子");
      const drag = await page.evaluate(checkPaintPixels, {phase: "drag"});
      await page.mouse.up();
      const released = await page.evaluate(checkPaintPixels, {phase: "up"});
      const additional = await page.evaluate(checkHighlightExport);
      assert.ok(additional.highlightedLand > 30 && additional.ocean > 30, JSON.stringify(additional));
      assert.equal(additional.spilled, 0, "批量高亮溢出海岸");
      assert.equal(additional.pngMismatch, 0, "导出 PNG 与地图像素不同");
      const undo = await page.evaluate(() => window.webglGeneratorApi.history.undo());
      assert.equal(undo.ok, true, JSON.stringify(undo.error));
      assert.equal(await page.evaluate(({cell, kind}) => window.__webglGeneratorApp.map.grid.cells[kind][cell], sample), sample.source);
      assert.equal(await page.evaluate(compareHistoryFrame, "beforePaintPixels"), true, "撤销后岸线像素没有还原");
      const redo = await page.evaluate(() => window.webglGeneratorApi.history.redo());
      assert.equal(redo.ok, true, JSON.stringify(redo.error));
      assert.equal(await page.evaluate(compareHistoryFrame, "releasedPaintPixels"), true, "重做后岸线像素与松笔时不同");
      assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
      for (const report of [first, drag, released]) {
        assert.equal(report.owner, sample.target, JSON.stringify({sample, report}));
        assert.ok(report.land > 30 && report.ocean > 30, JSON.stringify({sample, report}));
        assert.equal(report.missed, 0, JSON.stringify({sample, report}));
        assert.equal(report.spilled, 0, JSON.stringify({sample, report}));
        assert.equal(report.glError, 0);
      }
      assert.ok(first.extended + first.receded > 10, "必须覆盖直边与平滑轮廓不重合的位置");
      results.push({sample, dragCell: next.cell, first, drag, released, additional});
      await page.locator(`.floating-panel[data-panel-id="${kind}-panel"] .floating-panel-close`).evaluate(button => button.click());
    }
    assert.deepEqual(errors, []);
    return results;
  } finally {
    await page.close();
  }
}

function prepareCoast(kind) {
  const app = window.__webglGeneratorApp;
  const {renderer: r, map} = app;
  const mode = kind === "state" ? "states" : "provinces";
  const panel = app.panels[kind];
  if (kind === "state") panel.open(map, app.editHistory.getStats());
  else panel.open(map, app.selection, app.editHistory.getStats());
  window.__webglGeneratorDebug?.collapse?.();
  r.setColorMode(mode);
  r.setLayersVisible(Object.keys(r.layerVisibility).filter(k => r.layerVisibility[k]).map(k => [k, false]));
  const cells = map.grid.cells;
  const palette = r.cellAttributeStore.snapshot.palettes[mode];
  const rect = r.canvas.getBoundingClientRect();
  const {graphWidth, graphHeight} = map.metadata;
  const scale = 14;
  const radius = 8;
  const y = Math.floor(rect.y + rect.height * 0.48);
  const x = [0.48, 0.6, 0.35, 0.75].map(f => Math.floor(rect.x + rect.width * f)).find(x => document.elementFromPoint(x, y) === r.canvas);
  if (!x) throw new Error("画笔采样点被面板遮挡");
  const coastCells = [...r.shoreSurfaceCellRanges.landCorrections.keys()];
  const paths = [...r.shoreVisualPaths.coastline].sort((a, b) => a.sourceEdges.length - b.sourceEdges.length);
  for (const path of paths) for (const {landCell: cell} of path.sourceEdges) {
    const source = cells[kind][cell];
    if (!source || !r.shoreSurfaceCellRanges.landCorrections.has(cell)) continue;
    const targetObject = map.politics[mode].find(item => item?.i > 0 && !item.removed && item.i !== source &&
      (kind !== "province" || item.state === cells.state[cell]) && palette[(item.i + 1) * 4] > 135 &&
      palette.slice((source + 1) * 4, (source + 1) * 4 + 3).some((v, i) => Math.abs(v - palette[(item.i + 1) * 4 + i]) > 12));
    if (!targetObject) continue;
    const target = targetObject.i;
    const [wx, wy] = map.grid.points[cells.p[cell]];
    const canDrag = coastCells.some(other => {
      if (cells[kind][other] === target || (kind === "province" && cells.state[other] !== targetObject.state)) return false;
      const [nx, ny] = map.grid.points[cells.p[other]];
      if (Math.hypot(nx - wx, ny - wy) <= radius + 1) return false;
      const px = Math.round(x + (nx - wx) * scale * rect.width / graphWidth);
      const py = Math.round(y + (ny - wy) * scale * rect.height / graphHeight);
      return document.elementFromPoint(px, py) === r.canvas;
    });
    if (!canDrag) continue;
    if (kind === "state") panel.setTargetStateId(target);
    else panel.setSelectedProvinceId(target);
    panel.setBrushRadius(radius);
    panel.setActive(true);
    const selected = window.webglGeneratorApi.selection.select({kind, id: target});
    if (!selected.ok) throw new Error(selected.error?.message);
    Object.assign(r.camera, {scale,
      offsetX: (x - rect.x) / rect.width * 2 - 1 - (wx / map.metadata.graphWidth * 2 - 1) * scale,
      offsetY: 1 - (y - rect.y) / rect.height * 2 - (1 - wy / map.metadata.graphHeight * 2) * scale});
    r.markViewportBuffersDirty();
    r.draw();
    const sample = {kind, cell, source, target, x, y, edges: path.sourceEdges.length, grid: cells.h.length, rgb: [...palette.slice((target + 1) * 4, (target + 1) * 4 + 3)]};
    const {gl, canvas} = r;
    window.readPaintPixels = () => {
      const side = 180;
      const data = new Uint8Array(side * side * 4);
      gl.readPixels(Math.floor((x - rect.left) * canvas.width / rect.width) - side / 2,
        Math.floor((rect.bottom - y) * canvas.height / rect.height) - side / 2, side, side, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    window.paintSample = sample;
    window.firstPaintPixels = null;
    window.beforePaintPixels = window.readPaintPixels();
    const draw = r.draw;
    r.draw = function (...args) {
      const result = draw.apply(this, args);
      if (app[kind + "Edit"].activeStroke && cells[kind][cell] === target) {
        window.firstPaintPixels = window.readPaintPixels();
        r.draw = draw;
      }
      return result;
    };
    return sample;
  }
  throw new Error("找不到可涂抹并具有平滑海岸的格子");
}

function nextUnpaintedCell({kind, target, x, y}) {
  const {renderer, map} = window.__webglGeneratorApp;
  const {cells, points} = map.grid;
  const rect = renderer.canvas.getBoundingClientRect();
  let next, nearest = Infinity;
  for (const cell of renderer.shoreSurfaceCellRanges.landCorrections.keys()) {
    if (cells[kind][cell] === target || kind === "province" && cells.state[cell] !== map.politics.provinces[target].state) continue;
    const screen = renderer.worldToScreen(...points[cells.p[cell]], rect);
    const px = Math.round(screen.x + rect.left), py = Math.round(screen.y + rect.top);
    const distance = Math.hypot(px - x, py - y);
    if (distance >= nearest || px < rect.left || py < rect.top || px >= rect.right || py >= rect.bottom) continue;
    if (document.elementFromPoint(px, py) !== renderer.canvas) continue;
    next = {cell, x: px, y: py};
    nearest = distance;
  }
  if (!next) throw new Error("没有第二个可拖涂的沿海格子");
  return next;
}

function checkPaintPixels({phase}) {
  const {renderer: r, map} = window.__webglGeneratorApp;
  const {kind, cell, target, rgb} = window.paintSample;
  if (phase !== "down") r.draw();
  const painted = phase === "down" ? window.firstPaintPixels : window.readPaintPixels();
  if (!painted) throw new Error("未捕获落笔后第一张实际绘制的画面");
  if (phase === "up") window.releasedPaintPixels = painted;
  r.setSelection(null);
  const plain = window.readPaintPixels();
  let hard;
  if (phase === "down") {
    r.setViewOptions({smoothCellBorders: false});
    hard = window.readPaintPixels();
    r.setViewOptions({smoothCellBorders: true});
  }
  r.setSelection({kind, id: target});
  const report = {phase, owner: map.grid.cells[kind][cell], land: 0, missed: 0, ocean: 0, spilled: 0, receded: 0, extended: 0};
  for (let i = 0; i < plain.length; i += 4) {
    const owned = rgb.every((channel, k) => Math.abs(plain[i + k] - channel) <= 1);
    const sea = plain[i + 2] > plain[i] + 50 && plain[i + 1] > plain[i] + 20;
    const changed = [0, 1, 2].some(k => Math.abs(plain[i + k] - painted[i + k]) > 2);
    if (owned) { report.land++; if (!changed) report.missed++; }
    if (sea) { report.ocean++; if (changed) report.spilled++; }
    if (hard) {
      const hardOwned = rgb.every((v, k) => Math.abs(hard[i + k] - v) <= 1);
      if (owned && !hardOwned) report.extended++;
      if (sea && hardOwned) report.receded++;
    }
  }
  report.glError = r.gl.getError();
  return report;
}

function compareHistoryFrame(key) {
  window.__webglGeneratorApp.renderer.draw();
  const frame = window.readPaintPixels();
  return frame.every((v, i) => v === window[key][i]);
}

async function checkHighlightExport() {
  const r = window.__webglGeneratorApp.renderer;
  const {kind, target, x, y, rgb} = window.paintSample;
  r.setSelection(null);
  const plain = window.readPaintPixels();
  const cell = window.paintSample.cell;
  const otherKind = kind === "state" ? "province" : "state";
  const other = window.__webglGeneratorApp.map.grid.cells[otherKind][cell];
  r.setObjectHighlights([{kind, id: target}, {kind: otherKind, id: other}]);
  const multi = window.readPaintPixels();
  const result = await window.webglGeneratorApi.data.exportPNG({download: false, includeDataUrl: true, pixelScale: 1, includeMapOverlays: false, crop: {mode: "viewport"}});
  if (!result.ok) throw new Error(result.error?.message);
  const bitmap = await createImageBitmap(await (await fetch(result.data.dataUrl)).blob());
  const rect = r.canvas.getBoundingClientRect();
  const side = Math.sqrt(multi.length / 4);
  const ctx = new OffscreenCanvas(side, side).getContext("2d");
  const left = Math.floor((x - rect.left) * bitmap.width / rect.width) - side / 2;
  const top = bitmap.height - Math.floor((rect.bottom - y) * bitmap.height / rect.height) - side / 2;
  ctx.drawImage(bitmap, left, top, side, side, 0, 0, side, side);
  bitmap.close();
  const png = ctx.getImageData(0, 0, side, side).data;
  let highlightedLand = 0, ocean = 0, spilled = 0, pngMismatch = 0;
  for (let pixel = 0; pixel < multi.length / 4; pixel++) {
    const i = pixel * 4, j = ((side - 1 - Math.floor(pixel / side)) * side + pixel % side) * 4;
    const changed = [0, 1, 2].some(k => Math.abs(multi[i + k] - plain[i + k]) > 2);
    if (rgb.every((v, k) => Math.abs(v - plain[i + k]) <= 1) && changed) highlightedLand++;
    if (plain[i + 2] > plain[i] + 50 && plain[i + 1] > plain[i] + 20) { ocean++; if (changed) spilled++; }
    if ([0, 1, 2].some(k => png[j + k] !== multi[i + k])) pngMismatch++;
  }
  r.clearObjectHighlights();
  r.setSelection({kind, id: target});
  return {highlightedLand, ocean, spilled, pngMismatch};
}
