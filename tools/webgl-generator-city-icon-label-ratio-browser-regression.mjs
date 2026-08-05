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
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.cityIconItems?.length > 0);

  const scales = [1, 1.5, 2, 2.5, 3, 4];
  const measurements = [];
  for (const scale of scales) {
    const samples = await page.evaluate(async targetScale => {
      const renderer = window.__webglGeneratorApp.renderer;
      renderer.camera.scale = targetScale;
      renderer.overlayCommittedCamera = {...renderer.camera};
      renderer.draw();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise(resolve => setTimeout(resolve, 220));
      renderer.draw();

      const gl = renderer.gl;
      const canvas = renderer.canvas;
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = canvas.width / rect.width;
      const visibleItems = renderer.cityIconItems.filter(item => item.visible && item.box);
      const originalStates = renderer.cityIconItems.map(item => ({id: item.id, visibilityTarget: item.visibilityTarget, selected: item.selected}));
      const candidates = visibleItems.filter(item => {
        const label = renderer.labelItems.find(candidate => candidate.targetKind === "city" && String(candidate.targetId) === String(item.id));
        if (!label?.visible || !label.node) return false;
        const center = renderer.worldToScreen(item.x, item.y, rect);
        return center.x >= 28 && center.y >= 28 && center.x <= rect.width - 28 && center.y <= rect.height - 28;
      }).slice(0, 12);
      const results = [];
      const baseTime = performance.now();
      for (let index = 0; index < candidates.length; index++) {
        const item = candidates[index];
        const label = renderer.labelItems.find(candidate => candidate.targetKind === "city" && String(candidate.targetId) === String(item.id));
        const center = renderer.worldToScreen(item.x, item.y, rect);
        const stateTime = baseTime + index * 1000;
        renderer.cityIconLayer.updateInstanceStates(
          renderer.cityIconItems.map(candidate => ({id: candidate.id, visibilityTarget: candidate === item ? 1 : 0, selected: false})),
          {nowMs: stateTime}
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(1, 0, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        renderer.cityIconLayer.draw({
          mapSize: renderer.map.metadata,
          camera: renderer.camera,
          canvas,
          timeMs: stateTime + 500,
          layerVisible: true
        });
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const scanRadius = 24;
        const left = Math.max(0, Math.floor((center.x - scanRadius) * pixelRatio));
        const right = Math.min(canvas.width - 1, Math.ceil((center.x + scanRadius) * pixelRatio));
        const top = Math.max(0, Math.floor((center.y - scanRadius) * pixelRatio));
        const bottom = Math.min(canvas.height - 1, Math.ceil((center.y + scanRadius) * pixelRatio));
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let cssY = top; cssY <= bottom; cssY++) {
          const bufferY = canvas.height - 1 - cssY;
          for (let x = left; x <= right; x++) {
            const offset = (bufferY * canvas.width + x) * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            if (Math.abs(r - 255) <= 2 && g <= 2 && Math.abs(b - 255) <= 2) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, cssY);
            maxY = Math.max(maxY, cssY);
          }
        }
        if (!Number.isFinite(minX)) continue;
        const labelRect = label.node.getBoundingClientRect();
        const iconWidth = (maxX - minX + 1) / pixelRatio;
        results.push({
          id: item.id,
          name: item.name,
          silhouette: item.silhouette,
          roles: item.roles,
          maxSizeFactor: item.maxSizeFactor,
          iconWidth,
          iconHeight: (maxY - minY + 1) / pixelRatio,
          labelWidth: labelRect.width,
          ratio: iconWidth / labelRect.width,
          modelUploads: renderer.getStats().cityIconWebgl.modelUploads
        });
      }
      renderer.cityIconLayer.updateInstanceStates(originalStates, {nowMs: baseTime + candidates.length * 1000});
      renderer.draw();
      return results;
    }, scale);
    assert(samples.length >= 3, `${scale}× 没有足够的隔离图标 / 名称样本`);
    measurements.push({scale, samples});
  }

  const summaries = measurements.map(({scale, samples}) => {
    const ratios = samples.map(item => item.ratio).sort((a, b) => a - b);
    return {
      scale,
      count: samples.length,
      p95: ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * 0.95))],
      max: ratios.at(-1),
      largest: [...samples].sort((a, b) => b.ratio - a.ratio)[0],
      modelUploads: new Set(samples.map(item => item.modelUploads)).size === 1 ? samples[0].modelUploads : null
    };
  });
  console.log(JSON.stringify({phase: "measurements", summaries}, null, 2));
  for (const summary of summaries) {
    assert(summary.p95 <= 0.58, `${summary.scale}× 图标 / 名称宽度 P95 超过 0.58：${summary.p95}`);
    assert(summary.max <= 0.6, `${summary.scale}× 图标 / 名称宽度最大值超过 0.60：${summary.max}`);
    assert.equal(summary.modelUploads, summaries[0].modelUploads, `${summary.scale}× 重新上传了城镇模型实例`);
  }

  const final = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    return {
      glError: renderer.gl.getError(),
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
    };
  });
  assert.equal(final.glError, 0, "图标比例专项出现 WebGL error");
  assert.equal(final.healthErrors, 0, "图标比例专项出现 health error");
  assert.deepEqual(consoleErrors, [], `浏览器 console error：${consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `浏览器 page error：${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({ok: true, summaries, glError: final.glError, consoleErrors, pageErrors}, null, 2));
} finally {
  await browser.close();
}
