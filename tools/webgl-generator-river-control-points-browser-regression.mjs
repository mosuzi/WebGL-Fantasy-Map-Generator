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
  const baseline = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const mod = await import("/src/runtime/river-edit-commands.js");
    const viewport = app.renderer.canvas.getBoundingClientRect();
    const river = (app.map.rivers.rivers || []).find(item => Array.isArray(item?.points) && item.points.length >= 4 && !item.controlPoints?.length && item.points.slice(1, -1).some(point => app.renderer.worldToScreen(point[0], point[1], viewport).x < viewport.width * 0.55));
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
    for (let index = 1; index < points.length - 1 && !second; index += 1) {
      const point = points[index];
      const candidate = mod.inspectRiverControlPointAction(app.map, river.id, {type: "add", point, packCell: nearestCell(point)});
      const screen = app.renderer.worldToScreen(point[0], point[1], rect);
      candidateDiagnostics.push({index, point, valid: candidate.valid, screen, element: document.elementFromPoint(rect.left + screen.x, rect.top + screen.y)?.tagName || null});
      if (!candidate.valid || !isCanvasPoint(candidate.candidatePoint)) continue;
      first = {point: candidate.candidatePoint, packCell: candidate.packCell, preview: candidate};
      const nearbyCandidates = points.slice(index + 1, -1).map(nextPoint => [nextPoint[0], nextPoint[1]]);
      const offsets = [[18, 9], [-18, 9], [12, -14], [-12, -14], [26, 16], [-26, 16]];
      nearbyCandidates.push(...offsets.map(([dx, dy]) => [point[0] + dx, point[1] + dy]));
      for (const nextPoint of nearbyCandidates) {
        if (Math.hypot(nextPoint[0] - first.point[0], nextPoint[1] - first.point[1]) < 20) continue;
        const nextCell = nearestCell(nextPoint);
        const next = mod.inspectRiverControlPointAction(app.map, river.id, {type: "add", point: nextPoint, packCell: nextCell}, first.preview);
        if (next.valid && isCanvasPoint(next.candidatePoint)) {second = {point: next.candidatePoint, packCell: next.packCell, preview: next}; break;}
      }
    }
    if (!first || !second) throw new Error(`没有找到两个可点击的合法河流控制点候选：${JSON.stringify(candidateDiagnostics)}`);
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
  await page.mouse.click(secondClient.x, secondClient.y);
  await page.waitForFunction(() => window.__webglGeneratorApp.riverEdit.waypointDraft?.action === "add" && window.__webglGeneratorApp.riverEdit.waypointDraft.controlPoints.length === 2, null, {timeout: 5000}).catch(async error => {
    const diagnostic = await page.evaluate(({x, y}) => {
      const app = window.__webglGeneratorApp;
      return {activeMode: app.canvasToolModes.getActive?.(), draft: app.riverEdit.waypointDraft, pick: app.renderer.pickClientPoint(x, y)?.object || null};
    }, secondClient);
    throw new Error(`第二枚控制点点击未生成预览：${JSON.stringify({secondClient, diagnostic})}`, {cause: error});
  });

  const move = await page.evaluate(async ({riverId}) => {
    const app = window.__webglGeneratorApp;
    const mod = await import("/src/runtime/river-edit-commands.js");
    const current = app.renderer.riverWaypointPreview;
    const control = current.controlPoints[0];
    const point = [control.x + 0.45, control.y + 0.28];
    const packCell = control.packCell;
    const inspected = mod.inspectRiverControlPointAction(app.map, riverId, {type: "move", controlPointId: control.id, point, packCell}, current);
    if (!inspected.valid) throw new Error(`控制点移动候选无效：${inspected.reason}`);
    return {controlId: control.id, from: [control.x, control.y], to: inspected.candidatePoint, packCell};
  }, {riverId: baseline.riverId});
  const fromClient = await toClientPoint(page, move.from);
  const toClient = await toClientPoint(page, move.to);
  await page.mouse.move(fromClient.x, fromClient.y);
  await page.mouse.down();
  await page.mouse.move(toClient.x, toClient.y, {steps: 6});
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

  const secondHandle = await page.evaluate(() => {
    const controls = window.__webglGeneratorApp.renderer.riverWaypointPreview.controlPoints;
    return controls[1] ? [controls[1].id, controls[1].x, controls[1].y] : null;
  });
  assert.ok(secondHandle, "第二个控制点必须仍可见");
  const secondHandleClient = await toClientPoint(page, [secondHandle[1], secondHandle[2]]);
  await page.mouse.dblclick(secondHandleClient.x, secondHandleClient.y, {delay: 30});
  await page.waitForFunction(() => window.__webglGeneratorApp.riverEdit.waypointDraft?.action === "delete" && window.__webglGeneratorApp.riverEdit.waypointDraft.controlPoints.length === 1);
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
  await page.getByRole("button", {name: "应用控制点"}).click();
  await page.waitForFunction(() => window.__webglGeneratorApp.editHistory.getStats().undo === 1);
  const committed = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const river = app.map.rivers.rivers.find(item => Number(item.id) === Number(window.__riverControlPointTestRiverId));
    return {controlPoints: river.controlPoints?.length || 0, history: app.editHistory.getStats(), hydrology: {cells: river.cells, parent: river.parent, basin: river.basin, flux: river.flux, discharge: river.discharge}};
  });
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => window.__webglGeneratorApp.editHistory.getStats().undo === 0);
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => window.__webglGeneratorApp.editHistory.getStats().undo === 1);
  return {cellsTarget, riverId: baseline.riverId, samePackCell: baseline.first.packCell === baseline.second.packCell, cancelledUnchanged: cancelled.controlPoints === undefined && cancelled.history.undo === 0, committedControlPoints: committed.controlPoints, committedHistory: committed.history.undo, hydrology: committed.hydrology};
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
