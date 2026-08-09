#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5524;
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 180000;

const vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port, strictPort: true}, logLevel: "error"});
let browser;
try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const applicationErrors = [];
  const healthSignals = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthSignals.push(message.text());
    else applicationErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await waitForMapReady(page);

  const reports = [];
  for (const cellsTarget of [10000, 100000]) {
    if (cellsTarget !== 10000) {
      await page.evaluate(async target => {
        await window.webglGeneratorApi.generate.newMap({confirm: true, seed: `river-control-points-browser-${target}`, cellsTarget: target, heightmapTemplate: "continents"});
      }, cellsTarget);
      await page.waitForFunction(target => window.__webglGeneratorApp?.map?.metadata?.cellsTarget === target, cellsTarget);
      await waitForMapReady(page);
    }
    await delay(5000);
    const generationHealthSignals = await page.evaluate(() => window.__webglGeneratorHealth?.getEvents?.(180)?.filter(event => event.severity === "error") || []);
    await page.evaluate(() => {
      window.__webglGeneratorApp?.healthMonitor?.clear?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
    });
    healthSignals.length = 0;
    const report = await verifyCase(page, cellsTarget);
    await delay(250);
    const interactionHealthSignals = await page.evaluate(() => window.__webglGeneratorHealth?.getEvents?.(180)?.filter(event => event.severity === "error") || []);
    reports.push({...report, health: {generation: summarizeHealthEvents(generationHealthSignals), interaction: summarizeHealthEvents(interactionHealthSignals)}});
  }

  assert.deepEqual(applicationErrors, [], "河流控制点 Chrome 回归不得产生 application console error");
  assert.deepEqual(pageErrors, [], "河流控制点 Chrome 回归不得产生 page error");
  console.log(JSON.stringify({ok: true, reports, applicationErrors, healthSignals, pageErrors}, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function verifyCase(page, cellsTarget) {
  const legacyExports = cellsTarget === 10000 ? await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const oldRiverCount = (app.map.rivers?.rivers || []).filter(river => river && !river.visualCurve && !river.controlPoints).length;
    const png = await window.webglGeneratorApi.data.exportPNG({download: false, pixelScale: 1, includeDataUrl: false});
    const geo = window.webglGeneratorApi.data.exportFeatureGEO({download: false, includeText: true, layers: {river: true}});
    return {
      oldRiverCount,
      png: {ok: png?.ok, bytes: png?.data?.bytes || 0, mimeType: png?.data?.mimeType || null},
      geo: {ok: geo?.ok, bytes: geo?.data?.bytes || 0, features: geo?.data?.metadata?.features || 0}
    };
  }) : null;
  if (legacyExports) {
    assert.ok(legacyExports.oldRiverCount > 0, "旧河流导出夹具必须不含 visualCurve/controlPoints");
    assert.equal(legacyExports.png.ok, true, `旧河流 PNG 导出失败：${JSON.stringify(legacyExports.png)}`);
    assert.ok(legacyExports.png.bytes > 0 && legacyExports.png.mimeType === "image/png");
    assert.equal(legacyExports.geo.ok, true, `旧河流 GeoJSON 导出失败：${JSON.stringify(legacyExports.geo)}`);
    assert.ok(legacyExports.geo.bytes > 0 && legacyExports.geo.features > 0);
  }
  const baseline = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const mod = await import("/src/runtime/river-edit-commands.js");
    const viewport = app.renderer.canvas.getBoundingClientRect();
    const river = (app.map.rivers.rivers || []).find(item => Array.isArray(item?.points) && item.points.length >= 4 && !item.controlPoints?.length);
    if (!river) throw new Error("固定地图缺少没有控制点的可编辑河流");
    app.editHistory.clear();
    app.selectionStore.setSelection({object: {kind: "river", id: river.id}});
    app.panels.river.open(app.map, {object: {kind: "river", id: river.id}}, app.editHistory);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const points = river.points;
    const canvas = app.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const isCanvasPoint = point => {
      const screen = app.renderer.worldToScreen(point[0], point[1], rect);
      return document.elementFromPoint(rect.left + screen.x, rect.top + screen.y) === canvas;
    };
    const nearestCell = point => {
      let best = -1;
      let distance = Infinity;
      for (let index = 0; index < app.map.pack.cells.p.length; index += 1) {
        const candidate = app.map.pack.cells.p[index];
        const next = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
        if (next < distance) {distance = next; best = index;}
      }
      return best;
    };
    let first = null;
    let second = null;
    const candidateDiagnostics = [];
    const panelRect = document.querySelector(".floating-panel")?.getBoundingClientRect();
    const offsetPairs = [[-4, 0, 4, 0], [0, -4, 0, 4], [-3, -3, 3, 3], [-2, 0, 2, 0]];
    for (let cell = 0; cell < app.map.pack.cells.p.length && !second; cell += 1) {
      const center = app.map.pack.cells.p[cell];
      const screen = app.renderer.worldToScreen(center[0], center[1], rect);
      const clientX = rect.left + screen.x;
      const clientY = rect.top + screen.y;
      const visible = clientX > rect.left + 20 && clientX < rect.left + rect.width * 0.55 && clientY > rect.top + 20 && clientY < rect.bottom - 20;
      const covered = panelRect && clientX >= panelRect.left - 12 && clientX <= panelRect.right + 12 && clientY >= panelRect.top - 12 && clientY <= panelRect.bottom + 12;
      if (!visible || covered) continue;
      for (const [ax, ay, bx, by] of offsetPairs) {
        const left = app.renderer.screenToWorld(clientX + ax, clientY + ay);
        const right = app.renderer.screenToWorld(clientX + bx, clientY + by);
        const leftPoint = [left.x, left.y];
        const rightPoint = [right.x, right.y];
        const leftCell = nearestCell(leftPoint);
        const rightCell = nearestCell(rightPoint);
        if (leftCell !== cell || rightCell !== cell) continue;
        const leftPreview = mod.inspectRiverControlPointAction(app.map, river.id, {type: "add", point: leftPoint, packCell: leftCell});
        const rightPreview = leftPreview.valid
          ? mod.inspectRiverControlPointAction(app.map, river.id, {type: "add", point: rightPoint, packCell: rightCell}, leftPreview)
          : null;
        candidateDiagnostics.push({cell, offsets: [ax, ay, bx, by], leftCell, rightCell, leftValid: leftPreview.valid, rightValid: rightPreview?.valid || false});
        if (!leftPreview.valid || !rightPreview?.valid || !isCanvasPoint(leftPreview.candidatePoint) || !isCanvasPoint(rightPreview.candidatePoint)) continue;
        first = {point: leftPreview.candidatePoint, packCell: leftPreview.packCell, preview: leftPreview};
        second = {point: rightPreview.candidatePoint, packCell: rightPreview.packCell, preview: rightPreview};
        break;
      }
    }
    if (!first || !second) throw new Error(`没有找到同 cell 的两个可点击河流控制点候选：${JSON.stringify(candidateDiagnostics.slice(-20))}`);
    if (first.packCell !== second.packCell) throw new Error("同 cell 浏览器夹具构造失败");
    window.__riverControlPointTestRiverId = river.id;
    return {riverId: river.id, first, second, formalPoints: structuredClone(river.points), formalControlPoints: river.controlPoints, checksum: app.map.metadata?.checksum || null};
  });

  await page.getByRole("heading", {name: "河流管理"}).waitFor();
  await page.getByRole("button", {name: "调整河道折线"}).click();
  await page.waitForFunction(() => window.__webglGeneratorApp.canvasToolModes.isActive("river:edit-waypoint"));
  await page.waitForFunction(() => Array.isArray(window.__webglGeneratorApp.renderer.riverWaypointPreview?.controlPoints));

  const firstClient = await toClientPoint(page, baseline.first.point);
  const secondClient = await toClientPoint(page, baseline.second.point);
  await page.mouse.click(firstClient.x, firstClient.y);
  await page.waitForFunction(() => window.__webglGeneratorApp.riverEdit.waypointDraft?.action === "add" && window.__webglGeneratorApp.riverEdit.waypointDraft.controlPoints.length === 1, null, {timeout: 5000}).catch(async error => {
    const diagnostic = await page.evaluate(({x, y}) => {
      const app = window.__webglGeneratorApp;
      return {
        activeMode: app.canvasToolModes.getActive?.(),
        riverId: app.riverEdit.waypointRiverId,
        draft: app.riverEdit.waypointDraft,
        pick: app.renderer.pickClientPoint(x, y)?.object || null
      };
    }, firstClient);
    throw new Error(`第一枚控制点点击未生成预览：${JSON.stringify({firstClient, diagnostic})}`, {cause: error});
  });
  await page.evaluate(({point, packCell}) => {
    const app = window.__webglGeneratorApp;
    const draft = app.riverEdit.session.stageAction(app.map, {type: "add", point, packCell});
    if (!draft?.valid) throw new Error(`同 cell 第二控制点夹具构造失败：${draft?.reason || draft?.code}`);
  }, baseline.second);
  await page.waitForFunction(() => window.__webglGeneratorApp.riverEdit.waypointDraft?.action === "add" && window.__webglGeneratorApp.riverEdit.waypointDraft.controlPoints.length === 2, null, {timeout: 5000}).catch(async error => {
    const diagnostic = await page.evaluate(({x, y}) => {
      const app = window.__webglGeneratorApp;
      return {activeMode: app.canvasToolModes.getActive?.(), draft: app.riverEdit.waypointDraft, pick: app.renderer.pickClientPoint(x, y)?.object || null};
    }, secondClient);
    throw new Error(`同 cell 第二枚控制点未生成预览：${JSON.stringify({secondClient, diagnostic})}`, {cause: error});
  });

  const move = await page.evaluate(async ({riverId}) => {
    const app = window.__webglGeneratorApp;
    const mod = await import("/src/runtime/river-edit-commands.js");
    const current = app.renderer.riverWaypointPreview;
    const control = current.controlPoints[0];
    const rect = app.renderer.canvas.getBoundingClientRect();
    const screen = app.renderer.worldToScreen(control.x, control.y, rect);
    const client = {x: rect.left + screen.x + 24, y: rect.top + screen.y + 12};
    const world = app.renderer.screenToWorld(client.x, client.y);
    const point = [world.x, world.y];
    const packCell = app.renderer.pickClientPoint(client.x, client.y)?.packCell;
    const inspected = mod.inspectRiverControlPointAction(app.map, riverId, {type: "move", controlPointId: control.id, point, packCell}, current);
    if (!inspected.valid) throw new Error(`控制点移动候选无效：${inspected.reason}`);
    const other = current.controlPoints.find(item => item.id !== control.id);
    return {controlId: control.id, from: [control.x, control.y], to: inspected.candidatePoint, packCell, other: other ? structuredClone(other) : null};
  }, {riverId: baseline.riverId});
  const fromClient = await toClientPoint(page, move.from);
  const toClient = await toClientPoint(page, move.to);
  await page.mouse.move(fromClient.x, fromClient.y);
  const moveSteps = cellsTarget === 100000 ? 120 : 60;
  await installRiverMovePerformanceProbe(page);
  await page.mouse.down();
  await page.mouse.move(toClient.x, toClient.y, {steps: moveSteps});
  await page.mouse.up();
  await page.waitForFunction(({id, target}) => {
    const control = window.__webglGeneratorApp.renderer.riverWaypointPreview?.controlPoints?.find(item => item.id === id);
    return control && Math.abs(control.x - target[0]) < 0.1 && Math.abs(control.y - target[1]) < 0.1;
  }, {id: move.controlId, target: move.to}, {timeout: 5000}).catch(async error => {
    const diagnostic = await page.evaluate(({id}) => {
      const app = window.__webglGeneratorApp;
      const preview = app.renderer.riverWaypointPreview;
      return {activeMode: app.canvasToolModes.getActive?.(), draft: app.riverEdit.waypointDraft, controlCount: preview?.controlPoints?.length || 0, id};
    }, {id: move.controlId});
    throw new Error(`控制点拖动未生成目标预览：${JSON.stringify({move, fromClient, toClient, diagnostic})}`, {cause: error});
  });
  const movePerformance = await readRiverMovePerformanceProbe(page);
  assert.ok(movePerformance.samples >= Math.floor(moveSteps * 0.9), `${cellsTarget} 拖动事件采样不足：${JSON.stringify(movePerformance)}`);
  assert.ok(movePerformance.p95 < 33, `${cellsTarget} pointermove P95 超过 33ms：${JSON.stringify(movePerformance)}`);
  assert.deepEqual(movePerformance.longTasks, [], `${cellsTarget} 拖动不得产生 >=50ms long task`);
  const independentMove = await page.evaluate(({id, other}) => {
    const controls = window.__webglGeneratorApp.renderer.riverWaypointPreview?.controlPoints || [];
    const moved = controls.find(item => item.id === id);
    const untouched = controls.find(item => item.id === other?.id);
    return {moved: moved ? [moved.x, moved.y] : null, untouched: untouched ? [untouched.x, untouched.y, untouched.packCell] : null};
  }, {id: move.controlId, other: move.other});
  assert.deepEqual(independentMove.untouched, move.other ? [move.other.x, move.other.y, move.other.packCell] : null, "同 cell 另一控制点不得随拖动漂移");
  const persistentAfterMove = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const preview = app.renderer.riverWaypointPreview;
    const {buildSelectionMeshBundle} = await import("/src/renderer/selection-layer.js");
    const withCurve = buildSelectionMeshBundle(app.map, app.renderer.camera, app.renderer.canvas, null, null, [], preview);
    const handlesOnly = buildSelectionMeshBundle(app.map, app.renderer.camera, app.renderer.canvas, null, null, [], {...preview, changed: false});
    return {
      draftChanged: app.riverEdit.waypointDraft?.changed === true,
      previewChanged: preview?.changed === true,
      withCurveVertices: withCurve.drawRanges.ordinary.count,
      handlesOnlyVertices: handlesOnly.drawRanges.ordinary.count
    };
  });
  assert.equal(persistentAfterMove.draftChanged, true, "pointerup 后草稿必须保留相对 baseline 的累计 dirty");
  assert.equal(persistentAfterMove.previewChanged, true, "pointerup 后 renderer preview 必须继续显示变化河道");
  assert.ok(persistentAfterMove.withCurveVertices > persistentAfterMove.handlesOnlyVertices, "拖动结束后持久预览必须包含变化河道曲线");
  assert.equal(await page.getByRole("button", {name: "应用控制点"}).isEnabled(), true, "拖动结束后必须立即允许应用控制点");

  const secondHandle = await page.evaluate(() => {
    const controls = window.__webglGeneratorApp.renderer.riverWaypointPreview.controlPoints;
    return controls[1] ? [controls[1].id, controls[1].x, controls[1].y] : null;
  });
  assert.ok(secondHandle, "第二个控制点必须仍可见");
  const secondHandleClient = await toClientPoint(page, [secondHandle[1], secondHandle[2]]);
  await page.mouse.dblclick(secondHandleClient.x, secondHandleClient.y, {delay: 30});
  await page.waitForFunction(() => window.__webglGeneratorApp.riverEdit.waypointDraft?.action === "delete" && window.__webglGeneratorApp.riverEdit.waypointDraft.controlPoints.length === 1);
  const remainingAfterDelete = await page.evaluate(() => window.__webglGeneratorApp.riverEdit.waypointDraft.controlPoints[0]?.id || null);
  assert.equal(remainingAfterDelete, move.controlId, "双击必须只删除同 cell 的目标控制点");
  await page.getByRole("button", {name: "退出模式"}).click();
  await page.waitForFunction(() => !window.__webglGeneratorApp.canvasToolModes.isActive("river:edit-waypoint"));
  const cancelled = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const river = app.map.rivers.rivers.find(item => Number(item.id) === Number(window.__riverControlPointTestRiverId));
    return {controlPoints: river?.controlPoints, points: river?.points, history: app.editHistory.getStats()};
  });

  await page.evaluate(({riverId, formalPoints}) => {
    const app = window.__webglGeneratorApp;
    window.__riverControlPointTestRiverId = riverId;
    const river = app.map.rivers.rivers.find(item => Number(item.id) === Number(riverId));
    river.points = structuredClone(formalPoints);
    delete river.controlPoints;
    app.editHistory.clear();
    app.selectionStore.setSelection({object: {kind: "river", id: riverId}});
    app.panels.river.open(app.map, {object: {kind: "river", id: riverId}}, app.editHistory);
  }, {riverId: baseline.riverId, formalPoints: baseline.formalPoints});
  await page.getByRole("button", {name: "调整河道折线"}).click();
  await page.mouse.click(firstClient.x, firstClient.y);
  await page.waitForFunction(() => window.__webglGeneratorApp.riverEdit.waypointDraft?.action === "add");
  const applyMove = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const current = app.renderer.riverWaypointPreview;
    const control = current.controlPoints[0];
    const rect = app.renderer.canvas.getBoundingClientRect();
    const screen = app.renderer.worldToScreen(control.x, control.y, rect);
    const client = {x: rect.left + screen.x + 20, y: rect.top + screen.y + 10};
    const world = app.renderer.screenToWorld(client.x, client.y);
    const packCell = app.renderer.pickClientPoint(client.x, client.y)?.packCell;
    const {inspectRiverControlPointAction} = await import("/src/runtime/river-edit-commands.js");
    const inspected = inspectRiverControlPointAction(app.map, current.riverId, {type: "move", controlPointId: control.id, point: [world.x, world.y], packCell}, current);
    if (!inspected.valid) throw new Error(`应用前控制点移动候选无效：${inspected.reason}`);
    return {controlId: control.id, from: [control.x, control.y], to: inspected.candidatePoint};
  });
  const applyMoveFromClient = await toClientPoint(page, applyMove.from);
  const applyMoveToClient = await toClientPoint(page, applyMove.to);
  await page.mouse.move(applyMoveFromClient.x, applyMoveFromClient.y);
  await page.mouse.down();
  await page.mouse.move(applyMoveToClient.x, applyMoveToClient.y, {steps: 12});
  await page.mouse.up();
  await page.waitForFunction(({id, target}) => {
    const app = window.__webglGeneratorApp;
    const control = app.renderer.riverWaypointPreview?.controlPoints?.find(item => item.id === id);
    return app.riverEdit.waypointDraft?.action === "move"
      && app.riverEdit.waypointDraft?.changed === true
      && control
      && Math.abs(control.x - target[0]) < 0.1
      && Math.abs(control.y - target[1]) < 0.1;
  }, {id: applyMove.controlId, target: applyMove.to});
  assert.equal(await page.getByRole("button", {name: "应用控制点"}).isEnabled(), true, "只拖动控制点后必须无需新增/删除绕行即可应用");
  const previewDigest = await page.evaluate(async () => {
    const {sampleCentripetalCatmullRom} = await import("/src/geometry/cubic-path.js");
    const preview = window.__webglGeneratorApp.renderer.riverWaypointPreview;
    return curveDigest(sampleCentripetalCatmullRom(preview.points).points);
    function curveDigest(points) { return JSON.stringify(points.map(point => point.map(value => Math.round(value * 1e6) / 1e6))); }
  });
  await page.getByRole("button", {name: "应用控制点"}).click();
  await page.waitForFunction(() => window.__webglGeneratorApp.editHistory.getStats().undo === 1);
  const committed = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const river = app.map.rivers.rivers.find(item => Number(item.id) === Number(window.__riverControlPointTestRiverId));
    const {sampleCentripetalCatmullRom} = await import("/src/geometry/cubic-path.js");
    const digest = JSON.stringify(sampleCentripetalCatmullRom(river.points).points.map(point => point.map(value => Math.round(value * 1e6) / 1e6)));
    return {controlPoints: river.controlPoints?.length || 0, digest, history: app.editHistory.getStats(), hydrology: {cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge}};
  });
  assert.equal(committed.digest, previewDigest, "预览与提交后的共享曲线几何 digest 必须一致");
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => window.__webglGeneratorApp.editHistory.getStats().undo === 0);
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => window.__webglGeneratorApp.editHistory.getStats().undo === 1);
  assert.equal(baseline.first.packCell, baseline.second.packCell, "浏览器夹具必须覆盖同 cell 双控制点");
  return {cellsTarget, riverId: baseline.riverId, samePackCell: true, legacyExports, cancelledUnchanged: cancelled.controlPoints === undefined && cancelled.history.undo === 0, movePerformance, persistentAfterMove, appliedImmediatelyAfterMove: true, previewCommitDigestEqual: committed.digest === previewDigest, committedControlPoints: committed.controlPoints, committedHistory: committed.history.undo, hydrology: committed.hydrology};
}

async function installRiverMovePerformanceProbe(page) {
  await page.evaluate(() => {
    const samples = [];
    const longTasks = [];
    const listener = event => {
      if (event.buttons !== 1) return;
      const startedAt = performance.now();
      queueMicrotask(() => samples.push(performance.now() - startedAt));
    };
    window.addEventListener("pointermove", listener, true);
    const observer = typeof PerformanceObserver === "function"
      ? new PerformanceObserver(list => longTasks.push(...list.getEntries().filter(entry => entry.duration >= 50).map(entry => ({duration: entry.duration, startTime: entry.startTime}))))
      : null;
    observer?.observe({type: "longtask"});
    window.__riverMovePerformanceProbe = {samples, longTasks, listener, observer};
  });
}

async function readRiverMovePerformanceProbe(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const probe = window.__riverMovePerformanceProbe;
    probe?.observer?.takeRecords?.().forEach(entry => {
      if (entry.duration >= 50) probe.longTasks.push({duration: entry.duration, startTime: entry.startTime});
    });
    probe?.observer?.disconnect?.();
    if (probe?.listener) window.removeEventListener("pointermove", probe.listener, true);
    const sorted = [...(probe?.samples || [])].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : Infinity;
    const result = {samples: sorted.length, p95, max: sorted.at(-1) || 0, longTasks: probe?.longTasks || []};
    delete window.__riverMovePerformanceProbe;
    return result;
  });
}

async function toClientPoint(page, point) {
  return page.evaluate(({x, y}) => {
    const app = window.__webglGeneratorApp;
    const canvas = app.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const screen = app.renderer.worldToScreen(x, y, rect);
    return {x: rect.left + screen.x, y: rect.top + screen.y};
  }, {x: point[0], y: point[1]});
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => window.webglGeneratorApi?.info?.mapSummary?.()?.data?.ready === true);
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function summarizeHealthEvents(events) {
  return events.map(event => ({
    type: event.type,
    severity: event.severity,
    durationMs: event.detail?.durationMs || null,
    operation: event.detail?.operation || null
  }));
}
