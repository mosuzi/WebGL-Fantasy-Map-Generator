#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

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
  await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    renderer.camera.scale = 1.5;
    renderer.camera.offsetX = 0;
    renderer.camera.offsetY = 0;
    renderer.setLayersVisible([
      ["stateLabels", true],
      ["provinceLabels", true],
      ["cities", true],
      ["labels", true],
      ["markers", true],
      ["resources", true],
      ["military", true]
    ]);
    renderer.draw();
  });
  await page.waitForTimeout(240);

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box?.width > 0 && box?.height > 0, "地图画布不可见");
  const center = {x: box.x + box.width * 0.5, y: box.y + box.height * 0.5};
  const beforeZoom = await snapshotOverlay(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -720);
  const zoomPreview = await snapshotOverlay(page);
  assert.equal(zoomPreview.suspended, true, "缩放后没有进入覆盖层预览态");
  assert(zoomPreview.inverseScale > 0 && zoomPreview.inverseScale < 1, "缩放预览没有设置固定屏幕字号的反向比例");
  await page.waitForFunction(() => !window.__webglGeneratorApp.renderer.overlayInteractionSuspended);
  await page.waitForTimeout(280);
  const zoomSettled = await snapshotOverlay(page);

  const zoomCommon = intersectKeys(beforeZoom.labels, zoomPreview.labels, zoomSettled.labels);
  assert(zoomCommon.length >= 4, "缩放没有保留足够的既有标签样本");
  const zoomSizeErrors = zoomCommon.map(key => maxSizeDelta(beforeZoom.labels[key], zoomPreview.labels[key]));
  const zoomAnchorErrors = zoomCommon.map(key => anchorDistance(zoomPreview.labels[key], zoomSettled.labels[key]));
  const zoomCandidateChanges = zoomCommon.filter(key => zoomPreview.labels[key].candidate !== zoomSettled.labels[key].candidate);
  const stateCommon = zoomCommon.filter(key => key.startsWith("state:"));
  const stateOpacityTargetErrors = stateCommon.map(key => Math.abs(zoomPreview.stateOpacityTarget - zoomSettled.labels[key].opacityTarget));
  assert(Math.max(...zoomSizeErrors) <= 1, `缩放预览中文字尺寸变化超过 1px：${Math.max(...zoomSizeErrors)}px`);
  assert(Math.max(...zoomAnchorErrors) <= 1, `缩放预览到提交的标签锚点误差超过 1px：${Math.max(...zoomAnchorErrors)}px`);
  assert.deepEqual(zoomCandidateChanges, [], `缩放提交切换了既有政治标签候选：${zoomCandidateChanges.join(", ")}`);
  assert(!stateOpacityTargetErrors.length || Math.max(...stateOpacityTargetErrors) <= 0.001, `国家标签缩放预览与提交态的透明度目标不一致：${Math.max(...stateOpacityTargetErrors)}`);
  assert(stateCommon.every(key => zoomPreview.labels[key].opacity >= zoomPreview.stateOpacityTarget - 0.001), "国家标签缩放预览透明度越过了连续淡出目标");
  for (const kind of ["marker", "military"]) {
    const common = intersectKeys(beforeZoom[kind], zoomPreview[kind]);
    if (!common.length) continue;
    const errors = common.map(key => maxSizeDelta(beforeZoom[kind][key], zoomPreview[kind][key]));
    assert(Math.max(...errors) <= 1, `${kind} 固定屏幕内容随缩放放大：${Math.max(...errors)}px`);
  }

  const commitBeforePan = zoomSettled.commitEvents.completed;
  const panStart = {x: center.x - 60, y: center.y};
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down({button: "middle"});
  const heldSamples = [];
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(panStart.x + step * 24, panStart.y, {steps: 1});
    await page.waitForTimeout(170);
    heldSamples.push(await snapshotOverlay(page));
  }
  assert(heldSamples.every(sample => sample.suspended && sample.pointerInteraction === "pan"), "慢速平移期间覆盖层提前退出预览态");
  assert(heldSamples.every(sample => sample.commitTimer === 0), "慢速平移期间仍安装了静默提交计时器");
  assert(heldSamples.every(sample => sample.commitEvents.completed === commitBeforePan), "指针松开前发生了 viewport commit");
  const lastPanPreview = heldSamples.at(-1);
  await page.mouse.up({button: "middle"});
  await page.waitForFunction(() => !window.__webglGeneratorApp.renderer.overlayInteractionSuspended);
  const panSettled = await snapshotOverlay(page);
  assert.equal(panSettled.commitEvents.completed, commitBeforePan + 1, "慢速平移松手后没有且仅有一次 viewport commit");

  const panCommon = intersectKeys(lastPanPreview.labels, panSettled.labels);
  assert(panCommon.length >= 3, "平移提交没有保留足够的既有标签样本");
  const panAnchorErrors = panCommon.map(key => anchorDistance(lastPanPreview.labels[key], panSettled.labels[key]));
  const panCandidateChanges = panCommon.filter(key => lastPanPreview.labels[key].candidate !== panSettled.labels[key].candidate);
  assert(Math.max(...panAnchorErrors) <= 1, `平移预览到提交的标签锚点误差超过 1px：${Math.max(...panAnchorErrors)}px`);
  assert.deepEqual(panCandidateChanges, [], `平移提交切换了既有政治标签候选：${panCandidateChanges.join(", ")}`);

  const previewDurations = panSettled.previewEvents.recent.map(event => Number(event.ms || 0)).sort((a, b) => a - b);
  const previewP95 = percentile(previewDurations, 0.95);
  const overlayMs = Number(panSettled.stats.overlay?.update?.totalMs || 0);
  assert(previewP95 <= 8, `视口预览 P95 超出预算：${previewP95}ms`);
  assert(overlayMs <= 35, `overlay 更新超出预算：${overlayMs}ms`);

  const rawHealth = await page.evaluate(() => {
    const events = window.__webglGeneratorHealth?.getEvents?.(200) || [];
    return {total: events.filter(event => event.level === "error").length, events: events.filter(event => event.level === "error")};
  });
  const diagnostics = partitionApiBrowserDiagnostics(rawHealth, consoleErrors);
  const glError = await page.evaluate(() => window.__webglGeneratorApp.renderer.gl.getError());
  assert.equal(glError, 0, "文字交互稳定性专项出现 WebGL error");
  assert.equal(diagnostics.healthErrors.total, 0, "文字交互稳定性专项出现应用 health error");
  assert.deepEqual(diagnostics.consoleErrors, [], `浏览器 application console error：${diagnostics.consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `浏览器 page error：${pageErrors.join(" | ")}`);

  console.log(JSON.stringify({
    ok: true,
    zoom: {
      scale: zoomPreview.cameraScale,
      commonLabels: zoomCommon.length,
      fixedContentSamples: {markers: Object.keys(zoomPreview.marker).length, military: Object.keys(zoomPreview.military).length},
      maxSizeError: Math.max(...zoomSizeErrors),
      maxAnchorError: Math.max(...zoomAnchorErrors),
      candidateChanges: zoomCandidateChanges.length,
      stateOpacity: stateCommon.length ? {
        preview: zoomPreview.labels[stateCommon[0]].opacity,
        target: zoomPreview.stateOpacityTarget,
        settled: zoomSettled.labels[stateCommon[0]].opacity
      } : null
    },
    slowPan: {
      heldSamples: heldSamples.length,
      commitsWhileHeld: heldSamples.at(-1).commitEvents.completed - commitBeforePan,
      commitsAfterRelease: panSettled.commitEvents.completed - commitBeforePan,
      maxAnchorError: Math.max(...panAnchorErrors),
      candidateChanges: panCandidateChanges.length
    },
    performance: {previewP95, overlayMs},
    performanceHealthEvents: diagnostics.healthErrors.performanceTelemetry.total,
    glError,
    consoleErrors: diagnostics.consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}

async function snapshotOverlay(page) {
  return page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const readRect = element => {
      const rect = element.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    };
    const readLabels = () => Object.fromEntries([...document.querySelectorAll(".state-label.visible,.province-label.visible,.city-label.visible,.custom-label.visible,.zone-label.visible")]
      .slice(0, 240)
      .map(element => {
        const content = element.querySelector(".map-label-content") || element;
        return [`${element.dataset.labelTargetKind}:${element.dataset.labelTargetId}`, {
          ...readRect(content),
          candidate: element.dataset.labelCandidate || "0",
          opacity: Number(getComputedStyle(element).opacity),
          opacityTarget: Number(getComputedStyle(element).getPropertyValue("--state-label-opacity")) || 0
        }];
      }));
    const readFixed = selector => Object.fromEntries([...document.querySelectorAll(selector)]
      .slice(0, 80)
      .map((element, index) => [`${element.parentElement?.dataset.markerId || element.parentElement?.dataset.militaryId || index}`, readRect(element)]));
    const firstState = document.querySelector(".state-label.visible");
    return {
      suspended: renderer.overlayInteractionSuspended,
      pointerInteraction: renderer.viewportPointerInteractionKind,
      commitTimer: renderer.viewportCommitTimer,
      cameraScale: renderer.camera.scale,
      inverseScale: Number(getComputedStyle(renderer.stage).getPropertyValue("--map-interaction-inverse-scale")) || 0,
      stateOpacityTarget: Number(getComputedStyle(renderer.stage).getPropertyValue("--state-label-preview-opacity")) || 0,
      stateOpacity: firstState ? Number(getComputedStyle(firstState).opacity) : 0,
      labels: readLabels(),
      marker: readFixed(".marker-map-icon .marker-map-icon-content"),
      military: readFixed(".military-map-icon .military-map-icon-content"),
      commitEvents: renderer.getPerformanceEvents({includeRecent: true}).viewportCommit,
      previewEvents: renderer.getPerformanceEvents({includeRecent: true}).viewportPreview,
      stats: renderer.getStats()
    };
  });
}

function intersectKeys(...records) {
  const [first, ...rest] = records;
  return Object.keys(first || {}).filter(key => rest.every(record => record && Object.hasOwn(record, key)));
}

function maxSizeDelta(left, right) {
  return Math.max(Math.abs(left.width - right.width), Math.abs(left.height - right.height));
}

function anchorDistance(left, right) {
  const leftX = left.x + left.width / 2;
  const leftY = left.y + left.height / 2;
  const rightX = right.x + right.width / 2;
  const rightY = right.y + right.height / 2;
  return Math.hypot(leftX - rightX, leftY - rightY);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
}
