#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5531;
const timeoutMs = 60000;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const reports = [];
  for (const width of [1280, 390, 320]) reports.push(await inspectViewport(width));
  console.log(JSON.stringify({ok: true, viewports: reports}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function inspectViewport(width) {
  const context = await browser.newContext({viewport: {width, height: 720}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, timeoutMs);
    await page.evaluate(() => window.__webglGeneratorApp.healthMonitor?.clear?.());
    consoleErrors.length = 0;
    pageErrors.length = 0;
    const baseline = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const river = app.map.rivers.rivers.find(item => Array.isArray(item?.points) && item.points.length >= 3);
      if (!river) throw new Error("固定地图缺少可调整河流");
      const riverId = Number(river.id ?? river.i);
      app.editHistory.clear();
      app.selectionStore.setSelection({object: {kind: "river", id: riverId}});
      app.panels.river.open(app.map, {object: {kind: "river", id: riverId}}, app.editHistory);
      return {riverId, history: app.editHistory.getStats(), points: river.points.length};
    });
    await page.getByRole("heading", {name: "河流管理"}).waitFor();
    const adjust = page.getByRole("button", {name: "调整河道折线"});
    await adjust.waitFor();
    assert.equal(await adjust.count(), 1, `${width}px 必须只有一个调整入口`);
    assert.equal(await page.getByRole("button", {name: "在地图添加河道控制点"}).count(), 0);
    await page.evaluate(() => {
      const heading = [...document.querySelectorAll(".floating-panel h2")].find(node => node.textContent.trim() === "河流管理");
      const body = heading?.closest(".floating-panel")?.querySelector(".floating-panel-body");
      if (body) body.scrollTop = body.scrollHeight;
    });
    await adjust.click();
    await page.waitForTimeout(100);
    const modeActive = await page.evaluate(() => window.__webglGeneratorApp.canvasToolModes.isActive("river:edit-waypoint"));
    assert.equal(modeActive, true, `${width}px 点击唯一入口后必须进入河道折线模式：${consoleErrors.join(" | ")}`);
    const status = page.locator(".river-waypoint-draft[role=status]");
    await page.waitForTimeout(500);
    const statusCount = await status.count();
    const modeUi = await page.evaluate(() => ({
      cards: [...document.querySelectorAll(".river-waypoint-draft")].map(node => ({role: node.getAttribute("role"), display: getComputedStyle(node).display, text: node.textContent.trim().slice(0, 80)})),
      panelText: document.getElementById("river-panel")?.textContent?.includes("调整河道折线") || false
    }));
    assert.equal(statusCount, 1, `${width}px 模式卡未渲染：${JSON.stringify(modeUi)}`);
    const idle = await measureCard(page);
    assert.equal(idle.applyDisabled, true);
    assert.equal(idle.horizontalOverflow, 0);
    assert.ok(idle.cardTop >= idle.bodyTop - 1 && idle.cardBottom <= 720, `${width}px 置顶工作卡必须完整可见`);
    assertCompactActionButtons(idle, width, "等待态");

    let realWaterReject = null;
    if (width === 1280) {
      const waterPoint = await page.evaluate(() => {
        const app = window.__webglGeneratorApp;
        const canvas = app.renderer.canvas;
        const rect = canvas.getBoundingClientRect();
        const panelRect = document.querySelector(".river-waypoint-draft").closest(".floating-panel").getBoundingClientRect();
        for (let cell = 0; cell < app.map.pack.cells.p.length; cell++) {
          if (!(Number(app.map.pack.cells.h[cell]) < 20)) continue;
          const point = app.map.pack.cells.p[cell];
          const screen = app.renderer.worldToScreen(point[0], point[1], rect);
          const clientX = rect.left + screen.x;
          const clientY = rect.top + screen.y;
          const inCanvas = clientX > rect.left + 24 && clientX < rect.right - 24 && clientY > rect.top + 24 && clientY < rect.bottom - 24;
          const underPanel = clientX >= panelRect.left && clientX <= panelRect.right && clientY >= panelRect.top && clientY <= panelRect.bottom;
          if (inCanvas && !underPanel) return {clientX, clientY, cell};
        }
        return null;
      });
      assert.ok(waterPoint, "桌面视口必须找到未被面板遮挡的真实水域 cell");
      await page.mouse.click(waterPoint.clientX, waterPoint.clientY);
      const waterAlert = page.locator(".river-waypoint-draft[role=alert]").filter({hasText: "候选点位于水域"});
      await waterAlert.waitFor();
      realWaterReject = await page.evaluate(() => ({
        draft: window.__webglGeneratorApp.riverEdit.waypointDraft,
        previewCode: window.__webglGeneratorApp.renderer.riverWaypointPreview?.code || null,
        applyDisabled: [...document.querySelectorAll(".river-waypoint-draft button")].find(button => button.textContent.includes("应用折点"))?.disabled
      }));
      assert.equal(realWaterReject.draft, null, "真实水域拒绝不得留下可应用草稿");
      assert.equal(realWaterReject.previewCode, "waypoint-water", "真实水域拒绝必须把红色诊断送入 renderer");
      assert.equal(realWaterReject.applyDisabled, true);
      await page.getByRole("button", {name: "重新选择"}).click();
    }

    await page.evaluate(() => window.__webglGeneratorApp.panels.river.setWaypointFeedback({
      tone: "error",
      code: "apply-failed",
      message: "应用失败，候选位置可能已经失效，请重新选择。"
    }));
    await page.evaluate(() => window.__webglGeneratorApp.panels.river.setWaypointDraft({valid: true, insertIndex: 1, packCell: 0, distance: 0, length: 0}));
    const alert = page.locator(".river-waypoint-draft[role=alert]").filter({hasText: "应用失败"});
    await alert.waitFor();
    assert.equal(await alert.getAttribute("aria-live"), "assertive");
    const error = await measureCard(page);
    assert.equal(error.applyDisabled, true);
    assert.equal(error.horizontalOverflow, 0);
    assertCompactActionButtons(error, width, "错误态");

    await page.getByRole("button", {name: "重新选择"}).click();
    await page.locator(".river-waypoint-draft[role=status]").filter({hasText: "候选已清除"}).waitFor();
    await page.getByRole("button", {name: "退出模式"}).click();
    const finalState = await page.evaluate(riverId => {
      const app = window.__webglGeneratorApp;
      const river = app.map.rivers.rivers.find(item => Number(item.id) === Number(riverId));
      return {
        history: app.editHistory.getStats(),
        points: river.points.length,
        glError: app.renderer.gl.getError(),
        active: app.canvasToolModes.isActive("river:edit-waypoint"),
        healthErrors: (app.healthMonitor?.getEvents?.() || []).filter(event => event.severity === "error")
      };
    }, baseline.riverId);
    assert.equal(finalState.history.undo, baseline.history.undo);
    assert.equal(finalState.points, baseline.points);
    assert.equal(finalState.glError, 0);
    assert.equal(finalState.active, false);
    assert.deepEqual(finalState.healthErrors, []);
    const healthSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message));
    const applicationErrors = consoleErrors.filter(message => !healthSignals.includes(message));
    assert.deepEqual(applicationErrors, []);
    assert.deepEqual(pageErrors, []);
    return {width, idle, error, realWaterReject, glError: finalState.glError, activeHealthErrors: finalState.healthErrors, healthSignals, applicationErrors, pageErrors};
  } finally {
    await Promise.race([context.close(), delay(5000)]);
  }
}

async function measureCard(page) {
  return page.evaluate(() => {
    const card = document.querySelector(".river-waypoint-draft");
    const panel = card.closest(".floating-panel");
    const body = card.closest(".floating-panel-body");
    const actions = card.querySelector(".river-waypoint-draft-actions");
    const apply = [...card.querySelectorAll("button")].find(button => button.textContent.includes("应用折点"));
    const actionRect = actions.getBoundingClientRect();
    const buttons = [...actions.querySelectorAll("button")].map(button => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        text: button.textContent.trim(),
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        fontSize: Number.parseFloat(style.fontSize),
        nowrap: style.whiteSpace === "nowrap",
        textComplete: button.scrollWidth <= button.clientWidth
      };
    });
    return {
      bodyTop: body.getBoundingClientRect().top,
      cardTop: card.getBoundingClientRect().top,
      cardBottom: card.getBoundingClientRect().bottom,
      scrollTop: body.scrollTop,
      applyDisabled: apply.disabled,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      actions: {width: actionRect.width, left: actionRect.left, right: actionRect.right},
      actionRows: new Set(buttons.map(button => Math.round(button.top))).size,
      buttons
    };
  });
}

function assertCompactActionButtons(measurement, width, stateLabel) {
  assert.deepEqual(measurement.buttons.map(button => button.text), ["应用折点", "重新选择", "退出模式"], `${width}px ${stateLabel}按钮文案必须完整`);
  assert.equal(measurement.actionRows, 1, `${width}px ${stateLabel}三个按钮应优先保持单排`);
  assert.ok(measurement.buttons.every(button => Math.abs(button.height - 28) <= 0.5), `${width}px ${stateLabel}按钮高度应为 28px`);
  assert.ok(measurement.buttons.every(button => button.width < measurement.actions.width - 1), `${width}px ${stateLabel}按钮不得撑满操作区`);
  assert.ok(measurement.buttons.every(button => button.left >= measurement.actions.left - 1 && button.right <= measurement.actions.right + 1), `${width}px ${stateLabel}按钮不得越出操作区`);
  assert.ok(measurement.buttons.every(button => button.fontSize === 12 && button.nowrap && button.textComplete), `${width}px ${stateLabel}按钮文字不得缩小、折行或截断`);
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
