#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const baseUrl = process.argv.find(value => value.startsWith("http")) || "http://127.0.0.1:5411/";
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
const consoleErrors = [];
const pageErrors = [];

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1.5});
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(new URL("?healthClear=1", baseUrl).href, {waitUntil: "domcontentloaded"});
  assert.equal(response?.status(), 200, "正式应用入口无法访问");
  await waitForApiReady(page, 120_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const width = app.map.metadata.graphWidth;
    const height = app.map.metadata.graphHeight;
    app.map.measurements = {
      version: 1,
      items: [{id: "pan-stability-measurement", type: "polyline", name: "平移稳定性", points: [{x: width * 0.35, y: height * 0.45}, {x: width * 0.65, y: height * 0.55}], closed: false, routeFit: "none", cellStops: [], summary: {pointCount: 2}}],
      metadata: {measurements: 1, nextId: 2}
    };
    window.webglGeneratorApi.layers.setVisible("measurements", true);
    renderer.camera.scale = 2.5;
    renderer.overlayCommittedCamera = {...renderer.camera};
    renderer.setLayersVisible([
      ["stateLabels", true],
      ["provinceLabels", true],
      ["cities", true],
      ["zones", true],
      ["zoneLabels", true],
      ["markers", true],
      ["resources", true],
      ["military", true]
    ]);
    renderer.draw();
  });
  await page.waitForTimeout(300);

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box?.width > 0 && box?.height > 0, "地图画布不可见");
  const center = {x: box.x + box.width * 0.5, y: box.y + box.height * 0.5};
  const beforeMetrics = await cdp.send("Performance.getMetrics");
  const before = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const rect = renderer.canvas.getBoundingClientRect();
    const items = snapshotOverlay(renderer);
    const bufferedPolitical = items
      .filter(item => (item.kind === "state" || item.kind === "province") && item.buffered)
      .sort((left, right) => Math.min(Math.abs(left.rect.right), Math.abs(left.rect.left - rect.width)) - Math.min(Math.abs(right.rect.right), Math.abs(right.rect.left - rect.width)));
    const left = bufferedPolitical.find(item => item.rect.right <= 12);
    const right = bufferedPolitical.find(item => item.rect.left >= rect.width - 12);
    const target = left || right || bufferedPolitical[0];
    if (!target) return null;
    const direction = target.rect.right <= 12 ? 1 : -1;
    const distance = Math.min(rect.width * 0.42, Math.max(280, direction > 0 ? 48 - target.rect.left : target.rect.right - rect.width + 48));
    const events = renderer.getPerformanceEvents({includeRecent: true});
    window.__overlayPanAudit = {items, direction, distance, previewSequence: events.viewportPreview?.sequence || 0};
    window.__overlayPanCommit = new Promise(resolve => {
      let suspended = false;
      const poll = () => {
        if (renderer.overlayInteractionSuspended) suspended = true;
        if (suspended && !renderer.overlayInteractionSuspended) {
          resolve({items: snapshotOverlay(renderer), events: renderer.getPerformanceEvents({includeRecent: true}), stats: renderer.getStats()});
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    return {items, direction, distance, target, stats: renderer.getStats(), measurementPaths: document.querySelectorAll(".measurement-object-path").length};

    function snapshotOverlay(renderer) {
      const read = (item, kind) => {
        const style = getComputedStyle(item.node);
        const nodeRect = item.node.getBoundingClientRect();
        const base = renderer.worldToScreen(item.x, item.y, renderer.canvas.getBoundingClientRect());
        return {
          key: `${kind}:${item.id ?? item.targetId}`,
          kind,
          visible: Boolean(item.visible),
          buffered: Boolean(item.buffered),
          candidate: item.politicalCandidateIndex ?? null,
          opacity: Number(style.opacity),
          visibility: style.visibility,
          x: Number.parseFloat(item.node.style.getPropertyValue("--overlay-x")) || 0,
          y: Number.parseFloat(item.node.style.getPropertyValue("--overlay-y")) || 0,
          base,
          rect: {left: nodeRect.left, right: nodeRect.right, top: nodeRect.top, bottom: nodeRect.bottom}
        };
      };
      return [
        ...renderer.labelItems.map(item => read(item, item.targetKind)),
        ...renderer.markerIconItems.map(item => read(item, item.category === "resource" ? "resource" : "marker")),
        ...renderer.militaryIconItems.map(item => read(item, "military"))
      ];
    }
  });
  assert(before, "没有找到可从边缘移入的政治标签缓冲样本");

  const start = {x: center.x - before.direction * box.width * 0.12, y: center.y};
  const previewFrames = [];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({button: "middle"});
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(start.x + before.direction * before.distance * step / 8, start.y, {steps: 1});
    previewFrames.push(await page.evaluate(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      const matrix = getComputedStyle(renderer.overlay).transform.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(",").map(Number) || [];
      return {
        x: matrix[4] || 0,
        y: matrix[5] || 0,
        drawCalls: renderer.getStats().cityIconWebgl.drawCalls,
        measurementSvgTransform: getComputedStyle(document.getElementById("measurement-svg")).transform,
        measurementReadoutTransform: getComputedStyle(document.getElementById("measurement-readout")).transform
      };
    }));
  }
  await page.mouse.up({button: "middle"});
  const firstCommit = await page.evaluate(() => window.__overlayPanCommit);
  await page.waitForTimeout(280);
  const settled = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const read = item => ({
      key: `${item.targetKind}:${item.targetId}`,
      opacity: Number(getComputedStyle(item.node).opacity),
      candidate: item.politicalCandidateIndex ?? null
    });
    return {
      political: renderer.labelItems.filter(item => item.targetKind === "state" || item.targetKind === "province").map(read),
      stats: renderer.getStats(),
      glError: renderer.gl.getError(),
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
    };
  });
  const afterMetrics = await cdp.send("Performance.getMetrics");

  const beforeByKey = new Map(before.items.map(item => [item.key, item]));
  const firstByKey = new Map(firstCommit.items.map(item => [item.key, item]));
  const settledByKey = new Map(settled.political.map(item => [item.key, item]));
  const translation = previewFrames.at(-1);
  const enteringPolitical = firstCommit.items.filter(item => {
    const previous = beforeByKey.get(item.key);
    return (item.kind === "state" || item.kind === "province") && previous?.buffered && item.visible;
  });
  assert(enteringPolitical.length > 0, "平移没有产生政治标签缓冲移入样本");
  for (const item of enteringPolitical) {
    const previous = beforeByKey.get(item.key);
    const final = settledByKey.get(item.key);
    assert.equal(item.candidate, previous.candidate, `${item.key} 提交时切换了布局候选`);
    assert(Math.abs(item.rect.left - (previous.rect.left + translation.x)) <= 1, `${item.key} 提交前后发生横向跳位`);
    assert(Math.abs(item.rect.top - (previous.rect.top + translation.y)) <= 1, `${item.key} 提交前后发生纵向跳位`);
    assert(Math.abs(item.opacity - final.opacity) <= 0.02, `${item.key} 首帧 opacity 与稳定态不一致`);
  }

  const exiting = before.items.filter(item => {
    const current = firstByKey.get(item.key);
    return (item.visible || item.buffered) && current && !current.visible && !current.buffered;
  });
  assert(exiting.length > 0, "平移没有产生离开暖区的 overlay 样本");
  for (const item of exiting) {
    const current = firstByKey.get(item.key);
    const xError = Math.abs((current.x - item.x) - (current.base.x - item.base.x));
    const yError = Math.abs((current.y - item.y) - (current.base.y - item.base.y));
    const tolerance = item.kind === "military" ? 4 : 1;
    assert(xError <= tolerance, `${item.key} 隐藏时仍停留在旧横坐标（误差 ${xError}px）`);
    assert(yError <= tolerance, `${item.key} 隐藏时仍停留在旧纵坐标（误差 ${yError}px）`);
  }

  const previewEvents = (firstCommit.events.viewportPreview?.recent || []).filter(event => event.sequence > windowSequence(before));
  const previewDurations = previewEvents.map(event => Number(event.ms || 0)).sort((a, b) => a - b);
  const previewP95 = percentile(previewDurations, 0.95);
  const overlayMs = Number(firstCommit.stats.overlay?.update?.totalMs || 0);
  assert(previewFrames.every((frame, index) => !index || frame.drawCalls > previewFrames[index - 1].drawCalls), "平移预览没有逐帧绘制 WebGL 城镇层");
  assert(before.measurementPaths > 0, "测量世界层夹具没有建立");
  assert(previewFrames.every(frame => frame.measurementSvgTransform !== "none"), "平移预览没有变换测量 SVG 世界层");
  assert(previewFrames.every(frame => frame.measurementReadoutTransform === "none"), "测量 HUD 读数被错误地随世界层变换");
  for (const kind of ["city", "resource", "marker", "military"]) {
    assert(exiting.some(item => item.kind === kind), `平移没有命中 ${kind} 离场稳定性样本`);
  }
  assert(previewP95 <= 8, `平移预览 P95 超出预算：${previewP95}ms`);
  assert(overlayMs <= 35, `overlay commit 超出预算：${overlayMs}ms`);
  assert.equal(firstCommit.stats.cityIconWebgl.modelUploads, before.stats.cityIconWebgl.modelUploads, "平移重建了城镇实例模型");
  assert.equal(settled.glError, 0, "平移稳定性专项出现 WebGL error");
  assert.equal(settled.healthErrors, 0, "平移稳定性专项出现 health error");
  assert.deepEqual(consoleErrors, [], `浏览器 console error：${consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `浏览器 page error：${pageErrors.join(" | ")}`);

  console.log(JSON.stringify({
    ok: true,
    pan: {direction: before.direction, distance: before.distance, previewFrames: previewFrames.length},
    enteringPolitical,
    exitingKinds: Object.fromEntries([...new Set(exiting.map(item => item.kind))].map(kind => [kind, exiting.filter(item => item.kind === kind).length])),
    performance: {previewP95, overlayMs, cdpMetricCount: afterMetrics.metrics.length - beforeMetrics.metrics.length},
    modelUploads: settled.stats.cityIconWebgl.modelUploads,
    glError: settled.glError,
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
}

function windowSequence(before) {
  return Number(before?.stats?.performanceEvents?.viewportPreview?.sequence || 0);
}
