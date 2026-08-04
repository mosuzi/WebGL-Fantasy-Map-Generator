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
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.cityIconItems?.some(item => item.visible));

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box?.width > 0 && box?.height > 0, "地图画布不可见");
  const center = {x: box.x + box.width * 0.52, y: box.y + box.height * 0.5};
  await page.mouse.move(center.x, center.y);
  for (let index = 0; index < 4; index++) await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => !window.__webglGeneratorApp.renderer.overlayInteractionSuspended);
  await page.waitForTimeout(180);

  const before = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const rect = renderer.canvas.getBoundingClientRect();
    const candidates = renderer.labelItems
      .filter(item => item.buffered && item.node?.classList.contains("buffered") && item.box)
      .map(item => ({id: String(item.targetId), left: item.box.left, right: item.box.right, center: (item.box.left + item.box.right) / 2}));
    const left = candidates.filter(item => item.right <= 8).sort((a, b) => b.right - a.right)[0];
    const right = candidates.filter(item => item.left >= rect.width - 8).sort((a, b) => a.left - b.left)[0];
    const candidate = left || right || null;
    const direction = left ? 1 : -1;
    const distance = candidate
      ? Math.min(rect.width * 0.45, Math.max(rect.width * 0.22, direction > 0 ? 48 - candidate.center : candidate.center - rect.width + 48))
      : rect.width * 0.36;
    const summary = window.webglGeneratorApi.info.mapSummary().data;
    window.__cityPanAudit = {
      bufferedIds: new Set(candidates.map(item => item.id)),
      checksum: summary.checksum,
      revision: summary.mapRevision,
      modelUploads: renderer.getStats().cityIconWebgl.modelUploads,
      stateUploads: renderer.getStats().cityIconWebgl.stateUploads
    };
    window.__cityPanCommit = new Promise(resolve => {
      let suspended = false;
      const poll = () => {
        if (renderer.overlayInteractionSuspended) suspended = true;
        if (suspended && !renderer.overlayInteractionSuspended) {
          const entering = renderer.labelItems.filter(item => item.visible && window.__cityPanAudit.bufferedIds.has(String(item.targetId))).map(item => {
            const style = getComputedStyle(item.node);
            return {id: item.targetId, opacity: Number(style.opacity), filter: style.filter, transitionDuration: style.transitionDuration};
          });
          resolve({entering, camera: {...renderer.camera}, stats: renderer.getStats()});
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    return {
      camera: {...renderer.camera},
      stats: renderer.getStats(),
      direction,
      distance,
      bufferedCount: candidates.length,
      cityDomNodes: renderer.overlay.querySelectorAll(".city-map-icon").length
    };
  });

  const start = {x: center.x - before.direction * box.width * 0.12, y: center.y};
  const frameSamples = [];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({button: "middle"});
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(start.x + before.direction * before.distance * step / 8, start.y, {steps: 1});
    frameSamples.push(await page.evaluate(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      const stats = renderer.getStats();
      const matrix = getComputedStyle(renderer.overlay).transform.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(",").map(Number) || [];
      const pixelRatio = renderer.canvas.width / renderer.canvas.getBoundingClientRect().width;
      return {
        camera: stats.camera,
        layerOrder: stats.draw.layerOrder,
        modelUploads: stats.cityIconWebgl.modelUploads,
        stateUploads: stats.cityIconWebgl.stateUploads,
        drawCalls: stats.cityIconWebgl.drawCalls,
        instances: stats.cityIconWebgl.lastDrawInstances,
        overlayTranslation: {x: matrix[4] || 0, y: matrix[5] || 0, pixelRatio}
      };
    }));
  }
  await page.mouse.up({button: "middle"});
  const commit = await page.evaluate(() => window.__cityPanCommit);
  await page.waitForTimeout(220);
  const after = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const summary = window.webglGeneratorApi.info.mapSummary().data;
    return {
      stats: renderer.getStats(),
      checksum: summary.checksum,
      revision: summary.mapRevision,
      cityDomNodes: renderer.overlay.querySelectorAll(".city-map-icon").length,
      glError: renderer.canvas.getContext("webgl2").getError(),
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
    };
  });

  assert(before.bufferedCount > 0, "缩放后没有建立视口外标签预热缓存");
  assert(frameSamples.length === 8 && frameSamples.every(sample => sample.layerOrder.includes("cityIcons")), "平移帧没有持续绘制城镇实例层");
  assert(frameSamples.every(sample => sample.modelUploads === before.stats.cityIconWebgl.modelUploads), "平移帧重新上传了城镇模型实例");
  assert(frameSamples.every(sample => sample.stateUploads === before.stats.cityIconWebgl.stateUploads), "平移预览帧重新上传了城镇状态实例");
  assert(frameSamples.every(sample => {
    const {x, y, pixelRatio} = sample.overlayTranslation;
    return Math.abs(x * pixelRatio - Math.round(x * pixelRatio)) <= 0.02 && Math.abs(y * pixelRatio - Math.round(y * pixelRatio)) <= 0.02;
  }), "平移预览的 HTML overlay 没有对齐设备像素");
  assert(frameSamples.at(-1).drawCalls > frameSamples[0].drawCalls, "平移过程中城镇实例层没有逐帧响应");
  assert(frameSamples.every(sample => sample.instances === before.stats.cityIconWebgl.instanceCount), "平移边缘丢失了城镇实例分母");
  assert(commit.entering.length > 0, "平移没有命中预热后移入视口的标签样本");
  for (const label of commit.entering) {
    assert(label.opacity > 0.5, `预热标签 ${label.id} 移入首帧仍接近透明`);
    assert.equal(label.filter, "none", `预热标签 ${label.id} 移入首帧仍带模糊滤镜`);
  }
  assert.equal(before.cityDomNodes, 0, "平移前仍存在 DOM 城镇图标");
  assert.equal(after.cityDomNodes, 0, "平移后重新生成了 DOM 城镇图标");
  assert.equal(after.stats.cityIconWebgl.modelUploads, before.stats.cityIconWebgl.modelUploads, "平移提交重建了城镇模型实例");
  assert.equal(after.checksum, await page.evaluate(() => window.__cityPanAudit.checksum), "平移改变了地图 checksum");
  assert.equal(after.revision, await page.evaluate(() => window.__cityPanAudit.revision), "平移写入了地图 revision");
  assert.equal(after.glError, 0, "平移专项出现 WebGL error");
  assert.equal(after.healthErrors, 0, "平移专项出现 health error");
  assert.deepEqual(consoleErrors, [], `浏览器 console error：${consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `浏览器 page error：${pageErrors.join(" | ")}`);

  console.log(JSON.stringify({
    ok: true,
    pan: {direction: before.direction, distance: before.distance, cameraBefore: before.camera, cameraAfter: commit.camera},
    cityInstances: before.stats.cityIconWebgl.instanceCount,
    frameSamples: frameSamples.length,
    modelUploads: after.stats.cityIconWebgl.modelUploads,
    stateUploads: {before: before.stats.cityIconWebgl.stateUploads, after: after.stats.cityIconWebgl.stateUploads},
    bufferedLabels: before.bufferedCount,
    enteringLabels: commit.entering,
    routeVertices: after.stats.routeVertexCount,
    riverVertices: after.stats.riverVertexCount,
    glError: after.glError,
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
