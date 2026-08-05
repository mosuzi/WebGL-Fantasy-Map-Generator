#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const baseUrl = process.argv.find(value => value.startsWith("http")) || "http://127.0.0.1:5411/";
const targetUrl = new URL(baseUrl);
targetUrl.searchParams.set("healthClear", "1");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
const consoleErrors = [];
const pageErrors = [];

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(targetUrl.href, {waitUntil: "domcontentloaded"});
  assert.equal(response?.status(), 200, "正式应用入口无法访问");
  await waitForApiReady(page, 120_000);
  await page.waitForFunction(() => {
    const renderer = window.__webglGeneratorApp?.renderer;
    return renderer?.cityIconItems?.some(item => item.visible) && renderer.getStats().cityIconWebgl.instanceCount > 0;
  });
  await page.waitForTimeout(250);

  const target = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const item = renderer.cityIconItems.find(candidate => candidate.visible);
    const rect = renderer.canvas.getBoundingClientRect();
    const screen = renderer.worldToScreen(item.x, item.y, rect);
    const summary = window.webglGeneratorApi.info.mapSummary().data;
    const tier = {hamlet: 0.62, village: 0.76, town: 0.92, city: 1.1}[item.scale] || 0.92;
    const sizeFactor = scale => Math.min(0.72 + 2.15 * (1 - Math.exp(-0.18 * Math.max(0, scale - 0.5))), item.maxSizeFactor / 1.1) * tier;
    const stats = renderer.getStats().cityIconWebgl;
    window.__cityZoomAudit = {id: item.id, checksum: summary.checksum, revision: summary.mapRevision};
    window.__cityZoomFrame = new Promise(resolve => {
      renderer.canvas.addEventListener("wheel", () => requestAnimationFrame(() => {
        const next = renderer.getStats().cityIconWebgl;
        resolve({
          scale: renderer.camera.scale,
          sizeFactor: sizeFactor(renderer.camera.scale),
          stats: next,
          overlaySuspended: renderer.overlayInteractionSuspended
        });
      }), {once: true});
    });
    return {
      x: rect.left + screen.x,
      y: rect.top + screen.y,
      scale: renderer.camera.scale,
      sizeFactor: sizeFactor(renderer.camera.scale),
      stats,
      modelCount: renderer.cityIconItems.length,
      domCount: renderer.overlay.querySelectorAll(".city-map-icon").length
    };
  });

  await page.mouse.move(target.x, target.y);
  await page.mouse.wheel(0, -220);
  const firstFrame = await page.evaluate(() => window.__cityZoomFrame);
  await page.waitForFunction(() => !window.__webglGeneratorApp.renderer.overlayInteractionSuspended);
  const committed = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const item = renderer.cityIconItems.find(candidate => String(candidate.id) === String(window.__cityZoomAudit.id));
    const rect = renderer.canvas.getBoundingClientRect();
    const screen = renderer.worldToScreen(item.x, item.y, rect);
    const pick = renderer.pickClientPoint(rect.left + screen.x, rect.top + screen.y);
    const summary = window.webglGeneratorApi.info.mapSummary().data;
    return {
      scale: renderer.camera.scale,
      stats: renderer.getStats().cityIconWebgl,
      pick: {
        resolvedKind: pick?.object?.kind || null,
        cityKind: pick?.cityObject?.kind || null,
        cityId: pick?.cityObject?.id ?? null
      },
      checksum: summary.checksum,
      revision: summary.mapRevision,
      domCount: renderer.overlay.querySelectorAll(".city-map-icon").length,
      glError: renderer.canvas.getContext("webgl2").getError(),
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
    };
  });
  const interactionStates = await page.evaluate(id => {
    const renderer = window.__webglGeneratorApp.renderer;
    const instance = () => renderer.cityIconLayer.instances.find(candidate => String(candidate.id) === String(id));
    renderer.setSelection({kind: "city", id});
    const selected = instance()?.selected;
    renderer.setLayerVisible("cities", false);
    const hidden = renderer.getStats();
    renderer.setLayerVisible("cities", true);
    const restored = renderer.getStats();
    renderer.setSelection(null);
    return {
      selected,
      hiddenInstances: hidden.cityIconWebgl.lastDrawInstances,
      hiddenLayerOrder: hidden.draw.layerOrder,
      restoredInstances: restored.cityIconWebgl.lastDrawInstances,
      restoredLayerOrder: restored.draw.layerOrder,
      modelUploads: restored.cityIconWebgl.modelUploads
    };
  }, await page.evaluate(() => window.__cityZoomAudit.id));

  assert(firstFrame.scale > target.scale * 1.2, "首帧相机缩放没有响应滚轮");
  assert(firstFrame.sizeFactor > target.sizeFactor, "首帧城镇尺寸没有按连续函数响应相机");
  assert.equal(firstFrame.stats.modelUploads, target.stats.modelUploads, "缩放帧重新上传了城镇模型实例");
  assert.equal(firstFrame.stats.stateUploads, target.stats.stateUploads, "缩放帧重新上传了城镇状态实例");
  assert(firstFrame.stats.drawCalls > target.stats.drawCalls, "缩放首帧没有执行实例绘制");
  assert.equal(firstFrame.stats.lastDrawInstances, target.modelCount, "缩放首帧没有一次绘制完整城镇实例分母");
  assert.equal(target.domCount, 0, "正式地图仍存在 DOM 城镇图标");
  assert.equal(committed.domCount, 0, "缩放提交后重新生成了 DOM 城镇图标");
  assert.equal(committed.stats.modelUploads, target.stats.modelUploads, "缩放提交重建了城镇模型实例");
  assert.equal(interactionStates.selected, 1, "城镇选中态没有进入 WebGL 实例状态");
  assert.equal(interactionStates.hiddenInstances, 0, "关闭城镇图层后仍在绘制实例");
  assert(!interactionStates.hiddenLayerOrder.includes("cityIcons"), "关闭城镇图层后 layerOrder 仍含 cityIcons");
  assert.equal(interactionStates.restoredInstances, target.modelCount, "恢复城镇图层后实例分母不完整");
  assert(interactionStates.restoredLayerOrder.includes("cityIcons"), "恢复城镇图层后没有绘制 cityIcons");
  assert.equal(interactionStates.modelUploads, target.stats.modelUploads, "图层或选择交互重建了城镇模型实例");
  assert.equal(committed.pick.cityKind, "city", "城镇中心没有进入 city 拾取候选");
  assert.equal(String(committed.pick.cityId), String(await page.evaluate(() => window.__cityZoomAudit.id)), "城镇中心拾取 id 错误");
  assert.equal(committed.checksum, await page.evaluate(() => window.__cityZoomAudit.checksum), "缩放改变了地图 checksum");
  assert.equal(committed.revision, await page.evaluate(() => window.__cityZoomAudit.revision), "缩放写入了地图 revision");
  assert.equal(committed.glError, 0, "缩放专项出现 WebGL error");
  assert.equal(committed.healthErrors, 0, "缩放专项出现 health error");
  assert.deepEqual(consoleErrors, [], `浏览器 console error：${consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `浏览器 page error：${pageErrors.join(" | ")}`);

  console.log(JSON.stringify({
    ok: true,
    scales: {before: target.scale, firstFrame: firstFrame.scale, committed: committed.scale},
    sizeFactors: {before: target.sizeFactor, firstFrame: firstFrame.sizeFactor},
    instanceCount: target.modelCount,
    instanceUploads: {model: committed.stats.modelUploads, state: committed.stats.stateUploads},
    drawCalls: {before: target.stats.drawCalls, firstFrame: firstFrame.stats.drawCalls, committed: committed.stats.drawCalls},
    cityDomNodes: committed.domCount,
    interactionStates,
    pick: committed.pick,
    glError: committed.glError,
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
