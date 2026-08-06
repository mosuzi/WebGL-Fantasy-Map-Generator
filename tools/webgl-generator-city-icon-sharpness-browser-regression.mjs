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
const port = 5532;
const timeoutMs = 120_000;
const pixelRatios = [1, 1.25, 1.5, 2];
const cameraScales = [1.5, 2.5, 4];
const silhouettes = ["hamlet", "village", "town", "city", "capital", "provincial", "port", "fort", "camp"];
const tierScales = {hamlet: 0.72, village: 0.86, town: 1.02, city: 1.2};
const previousTierScales = {hamlet: 0.62, village: 0.76, town: 0.92, city: 1.1};
const realComparisonScales = [1, 1.5, 2.5, 4];
const capitalRoleScale = 1.25;
verifyPreviousCapSimulation();
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const reports = [];
  for (const pixelRatio of pixelRatios) reports.push(await inspectPixelRatio(pixelRatio));
  verifyCrossRatioConsistency(reports);
  console.log(JSON.stringify({
    ok: true,
    pixelRatios: reports.map(({samples: _samples, ...report}) => report)
  }, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function inspectPixelRatio(pixelRatio) {
  const context = await browser.newContext({viewport: {width: 900, height: 700}, deviceScaleFactor: pixelRatio});
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    const response = await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
    assert.equal(response?.status(), 200, "正式应用入口无法访问");
    await waitForApiReady(page, timeoutMs);
    const generation = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: "city-scale-217",
      cellsTarget: 10000,
      heightmapTemplate: "continents"
    }));
    assert.equal(generation?.ok, true, generation?.error?.message || "固定 10k 四级城镇地图生成失败");
    await waitForApiReady(page, timeoutMs);
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.cityIconLayer);
    await page.evaluate(() => window.__webglGeneratorApp.healthMonitor?.clear?.());
    consoleErrors.length = 0;
    pageErrors.length = 0;

    const report = await page.evaluate(async ({cameraScales, silhouettes, tierScales, previousTierScales, realComparisonScales, targetPixelRatio, capitalRoleScale}) => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const layer = renderer.cityIconLayer;
      const gl = renderer.gl;
      const canvas = renderer.canvas;
      const metadata = renderer.map.metadata;
      const mapWidth = Number(metadata.graphWidth);
      const mapHeight = Number(metadata.graphHeight);
      const originalCanvasSize = {width: canvas.width, height: canvas.height};
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * targetPixelRatio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * targetPixelRatio));
      const actualPixelRatio = canvas.width / canvas.clientWidth;
      const originalItems = renderer.cityIconItems;
      const checksumBefore = renderer.map.metadata.checksum;
      const revisionBefore = app.mapRevision?.getSnapshot?.() || null;
      const initialLayerStats = layer.snapshot();
      const tierDenominators = Object.fromEntries(Object.keys(tierScales).map(tier => [tier, originalItems.filter(item => item.scale === tier).length]));
      const realTierItems = Object.fromEntries(Object.keys(tierScales).map(tier => [tier, originalItems.find(item => item.scale === tier)]));
      const samples = [];

      const measure = ({id = null, x = mapWidth / 2, y = mapHeight / 2, silhouette, cameraScale, tier = null, tierScale = 1, roles = [], selected = false, maxSizeFactor = 100, forcedPackedTierScale = null}) => {
        layer.setInstances([{
          id: id ?? `sharpness-${silhouette}-${tier || "base"}`,
          x,
          y,
          silhouette,
          tierScale,
          minScale: 0,
          visible: true,
          roles,
          selected,
          maxSizeFactor
        }], {nowMs: 0});
        if (Number.isFinite(forcedPackedTierScale)) {
          layer.instances[0].tierScale = forcedPackedTierScale;
          layer.instanceData[3] = forcedPackedTierScale;
          gl.bindBuffer(gl.ARRAY_BUFFER, layer.instanceBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER, 3 * Float32Array.BYTES_PER_ELEMENT, new Float32Array([forcedPackedTierScale]));
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(1, 0, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const centerNdc = {x: x / mapWidth * 2 - 1, y: 1 - y / mapHeight * 2};
        layer.draw({
          mapSize: metadata,
          camera: {scale: cameraScale, offsetX: -centerNdc.x * cameraScale, offsetY: -centerNdc.y * cameraScale},
          canvas,
          timeMs: 500,
          layerVisible: true
        });
        const radius = Math.ceil(34 * actualPixelRatio);
        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);
        const left = Math.max(0, centerX - radius);
        const bottom = Math.max(0, centerY - radius);
        const width = Math.min(canvas.width - left, radius * 2 + 1);
        const height = Math.min(canvas.height - bottom, radius * 2 + 1);
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(left, bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let pixelHash = 2166136261;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let colored = 0;
        let dark = 0;
        let white = 0;
        let whiteLine = 0;
        let gold = 0;
        let transition = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            pixelHash ^= r;
            pixelHash = Math.imul(pixelHash, 16777619);
            pixelHash ^= g;
            pixelHash = Math.imul(pixelHash, 16777619);
            pixelHash ^= b;
            pixelHash = Math.imul(pixelHash, 16777619);
            pixelHash ^= pixels[offset + 3];
            pixelHash = Math.imul(pixelHash, 16777619);
            if (r >= 253 && g <= 2 && b >= 253) continue;
            colored += 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            const isDark = r < 150 && g < 90 && b < 160;
            const isWhite = r > 225 && g > 225 && b > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 25;
            const hasWhiteLineContribution = r > 180 && g > 80 && b > 180 && Math.abs(r - b) < 20;
            const isGold = r > 220 && g > 145 && g < 235 && b < 130;
            if (hasWhiteLineContribution) whiteLine += 1;
            if (isDark) dark += 1;
            else if (isWhite) white += 1;
            else if (isGold) gold += 1;
            else transition += 1;
          }
        }
        return {
          silhouette,
          tier,
          id,
          roles,
          selected,
          cameraScale,
          packedTierScale: layer.instances[0]?.tierScale || 0,
          pixelHash: (pixelHash >>> 0).toString(16).padStart(8, "0"),
          widthCss: Number.isFinite(minX) ? (maxX - minX + 1) / actualPixelRatio : 0,
          heightCss: Number.isFinite(minY) ? (maxY - minY + 1) / actualPixelRatio : 0,
          colored,
          dark,
          white,
          whiteLine,
          gold,
          transition
        };
      };

      for (const cameraScale of cameraScales) {
        for (const silhouette of silhouettes) samples.push(measure({silhouette, cameraScale}));
      }
      const tierSamples = Object.entries(tierScales).map(([tier, tierScale]) => measure({
        silhouette: "town",
        cameraScale: 4,
        tier,
        tierScale
      }));
      const cappedTierSamples = Object.entries(tierScales).map(([tier, tierScale]) => measure({
        silhouette: "town",
        cameraScale: 12,
        tier,
        tierScale,
        maxSizeFactor: 0.9
      }));
      const realTierComparisons = [];
      const capitalComparisons = [];
      const ordinaryCityComparisons = [];
      if (targetPixelRatio === 2) {
        for (const [tier, item] of Object.entries(realTierItems)) {
          if (!item) continue;
          const width = Number(item.nameWidthCss);
          const currentOutline = Number.isFinite(width) ? Math.max(5.4, Math.min(12.1, width * 0.575 - 1)) : 12.1;
          const previousOutline = Number.isFinite(width) ? Math.max(4.8, Math.min(10.5, width * 0.5 - 1)) : 10.5;
          const currentUsable = Math.max(1, currentOutline - 2);
          const previousUsable = Math.max(1, previousOutline - 2);
          const previousCap = item.maxSizeFactor * previousUsable / currentUsable;
          const simulatedPreviousCap = previousCap * 1.2 / 1.1;
          for (const cameraScale of realComparisonScales) {
            const shared = {
              id: item.id,
              x: item.x,
              y: item.y,
              silhouette: item.silhouette,
              roles: item.roles,
              tier,
              cameraScale
            };
            const current = measure({...shared, tierScale: tierScales[tier], maxSizeFactor: item.maxSizeFactor});
            const previous = measure({...shared, tierScale: previousTierScales[tier], maxSizeFactor: simulatedPreviousCap});
            realTierComparisons.push({
              tier,
              id: item.id,
              name: item.name,
              silhouette: item.silhouette,
              roles: item.roles,
              nameWidthCss: item.nameWidthCss,
              cameraScale,
              currentMaxSizeFactor: item.maxSizeFactor,
              previousMaxSizeFactor: previousCap,
              simulatedPreviousCap,
              current,
              previous
            });
          }
        }
        const capitalItems = originalItems.filter(item => item.roles?.includes("capital"));
        const ordinaryCityItems = originalItems.filter(item => item.scale === "city" && !item.roles?.includes("capital"));
        for (const item of capitalItems) {
          const tierScale = tierScales[item.scale];
          for (const cameraScale of realComparisonScales) {
            const shared = {
              id: item.id,
              x: item.x,
              y: item.y,
              silhouette: item.silhouette,
              roles: item.roles,
              tier: item.scale,
              cameraScale,
              maxSizeFactor: item.maxSizeFactor
            };
            capitalComparisons.push({
              id: item.id,
              name: item.name,
              cameraScale,
              current: measure({...shared, tierScale}),
              previous: measure({...shared, tierScale, forcedPackedTierScale: tierScale})
            });
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        for (const item of ordinaryCityItems) {
          for (const cameraScale of realComparisonScales) {
            const shared = {
              id: item.id,
              x: item.x,
              y: item.y,
              silhouette: item.silhouette,
              roles: item.roles,
              tier: item.scale,
              cameraScale,
              tierScale: tierScales.city,
              maxSizeFactor: item.maxSizeFactor
            };
            ordinaryCityComparisons.push({
              id: item.id,
              name: item.name,
              roles: item.roles,
              cameraScale,
              current: measure(shared),
              previous: measure({...shared, forcedPackedTierScale: tierScales.city})
            });
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }
      let dynamicRolesAudit = null;
      if (targetPixelRatio === 2) {
        const auditId = "dynamic-role-audit";
        const baseTierScale = tierScales.city;
        layer.setInstances([{
          id: auditId,
          x: mapWidth / 2,
          y: mapHeight / 2,
          silhouette: "fort",
          tierScale: baseTierScale,
          minScale: 0,
          visible: true,
          roles: [],
          maxSizeFactor: 100
        }], {nowMs: 0});
        const modelUploads = layer.snapshot().modelUploads;
        const captureTierScale = () => ({
          instance: layer.instances[0]?.tierScale,
          data: layer.instanceData[3],
          modelUploads: layer.snapshot().modelUploads,
          stateUploads: layer.snapshot().stateUploads
        });
        const initial = captureTierScale();
        const addChanged = layer.updateInstanceStates([{id: auditId, roles: ["capital"]}], {nowMs: 100});
        const added = captureTierScale();
        const repeatChanged = layer.updateInstanceStates([{id: auditId, roles: ["capital"]}], {nowMs: 200});
        const repeated = captureTierScale();
        const removeChanged = layer.updateInstanceStates([{id: auditId, roles: []}], {nowMs: 300});
        const removed = captureTierScale();
        const roleBitsChanged = layer.updateInstanceStates([{id: auditId, roleBits: 1}], {nowMs: 400});
        const roleBitsOnly = captureTierScale();
        dynamicRolesAudit = {baseTierScale, modelUploads, initial, addChanged, added, repeatChanged, repeated, removeChanged, removed, roleBitsChanged, roleBitsOnly};
      }
      const roleComposite = measure({silhouette: "town", cameraScale: 2.5, roles: ["capital", "provincial", "port"]});
      const selected = measure({silhouette: "town", cameraScale: 2.5, selected: true});
      canvas.width = originalCanvasSize.width;
      canvas.height = originalCanvasSize.height;
      layer.setInstances(originalItems, {nowMs: performance.now()});
      renderer.draw();
      await new Promise(resolve => setTimeout(resolve, 0));
      const finalLayerStats = layer.snapshot();
      return {
        browserPixelRatio: window.devicePixelRatio,
        actualPixelRatio,
        tierDenominators,
        samples,
        tierSamples,
        cappedTierSamples,
        realTierComparisons,
        capitalComparisons,
        ordinaryCityComparisons,
        dynamicRolesAudit,
        checksumBefore,
        checksumAfter: renderer.map.metadata.checksum,
        revisionBefore,
        revisionAfter: app.mapRevision?.getSnapshot?.() || null,
        initialLayerStats,
        finalLayerStats,
        originalInstanceCount: originalItems.length,
        finalInstanceDataLength: layer.instanceData.length,
        roleComposite,
        selected,
        glError: gl.getError(),
        activeHealthErrors: (app.healthMonitor?.getEvents?.() || []).filter(event => event.severity === "error")
      };
    }, {cameraScales, silhouettes, tierScales, previousTierScales, realComparisonScales, targetPixelRatio: pixelRatio, capitalRoleScale});

    assert(Math.abs(report.actualPixelRatio - pixelRatio) <= 0.01, `实际 DPR 漂移：${report.actualPixelRatio}`);
    assert.equal(report.samples.length, silhouettes.length * cameraScales.length);
    assert.deepEqual(Object.keys(report.tierDenominators), Object.keys(tierScales), `${pixelRatio} DPR 下固定 10k 四级分母结构漂移`);
    assert(Object.values(report.tierDenominators).every(count => count > 0), `${pixelRatio} DPR 下固定 10k 地图没有覆盖真实四级对象：${JSON.stringify(report.tierDenominators)}`);
    for (const sample of report.samples) {
      assert(sample.colored > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 没有绘制像素`);
      assert(sample.dark > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 缺少深色硬描边核心`);
      assert(sample.white > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 缺少纯白内线核心`);
      assert(sample.transition > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 缺少抗锯齿过渡像素`);
      assert(sample.transition / sample.colored < 0.9, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 过渡像素占比过高：${JSON.stringify(sample)}`);
    }
    const meanWidth = cameraScales.map(cameraScale => mean(report.samples.filter(sample => sample.cameraScale === cameraScale).map(sample => sample.widthCss)));
    assert(meanWidth[0] >= 7.5, `${pixelRatio} DPR 下基础城镇图标仍过小：${meanWidth[0]}`);
    assert(meanWidth[1] > meanWidth[0] + 1, `${pixelRatio} DPR 下 2.5× 图标没有连续放大：${meanWidth.join(", ")}`);
    assert(meanWidth[2] > meanWidth[1] + 1, `${pixelRatio} DPR 下 4× 图标没有连续放大：${meanWidth.join(", ")}`);
    for (const sample of report.tierSamples) {
      assert(sample.colored > 0 && sample.dark > 0 && sample.whiteLine > 0, `${pixelRatio} DPR 下 ${sample.tier} framebuffer 深色描边或白色线芯不完整：${JSON.stringify(sample)}`);
    }
    const tierAreas = report.tierSamples.map(sample => sample.widthCss * sample.heightCss);
    for (let index = 1; index < tierAreas.length; index++) {
      assert(tierAreas[index] > tierAreas[index - 1], `${pixelRatio} DPR 下四级 framebuffer bbox 未严格递增：${tierAreas.join(", ")}`);
    }
    for (const sample of report.cappedTierSamples) {
      assert(sample.colored > 0 && sample.dark > 0 && sample.whiteLine > 0, `${pixelRatio} DPR 下名称封顶后的 ${sample.tier} framebuffer 深色描边或白色线芯不完整：${JSON.stringify(sample)}`);
    }
    const cappedTierAreas = report.cappedTierSamples.map(sample => sample.widthCss * sample.heightCss);
    for (let index = 1; index < cappedTierAreas.length; index++) {
      assert(cappedTierAreas[index] > cappedTierAreas[index - 1], `${pixelRatio} DPR 下名称封顶后的四级 framebuffer bbox 未严格递增：${cappedTierAreas.join(", ")}`);
    }
    const townBaseline = report.samples.find(sample => sample.cameraScale === 2.5 && sample.silhouette === "town");
    assert(report.roleComposite.colored > townBaseline.colored, `${pixelRatio} DPR 下角色组合没有进入图形`);
    assert(report.roleComposite.dark > 0 && report.roleComposite.white > 0 && report.roleComposite.transition > 0, `${pixelRatio} DPR 下角色组合轮廓不完整`);
    assert(report.selected.gold > 0, `${pixelRatio} DPR 下选中态没有金色内线`);
    assert.equal(report.selected.widthCss, townBaseline.widthCss, `${pixelRatio} DPR 下选中态改变了图标宽度`);
    assert.equal(report.selected.heightCss, townBaseline.heightCss, `${pixelRatio} DPR 下选中态改变了图标高度`);
    assert.equal(report.glError, 0, `${pixelRatio} DPR 出现 WebGL error`);
    assert.deepEqual(report.activeHealthErrors, [], `${pixelRatio} DPR 出现 active health error`);
    assert.deepEqual(consoleErrors, [], `${pixelRatio} DPR console error：${consoleErrors.join(" | ")}`);
    assert.deepEqual(pageErrors, [], `${pixelRatio} DPR page error：${pageErrors.join(" | ")}`);
    const realGrowth = report.realTierComparisons.map(comparison => {
      const currentArea = comparison.current.widthCss * comparison.current.heightCss;
      const previousArea = comparison.previous.widthCss * comparison.previous.heightCss;
      assert(comparison.current.colored > 0 && comparison.current.dark > 0 && comparison.current.whiteLine > 0, `真实 ${comparison.tier} / ${comparison.cameraScale}× 当前图形不完整：${JSON.stringify(comparison.current)}`);
      assert(currentArea > previousArea, `真实 ${comparison.tier} / ${comparison.cameraScale}× framebuffer 未大于第294项：${currentArea} <= ${previousArea}`);
      return {
        tier: comparison.tier,
        id: comparison.id,
        cameraScale: comparison.cameraScale,
        currentArea,
        previousArea,
        backingPixelGrowth: (currentArea - previousArea) * report.actualPixelRatio ** 2,
        ratio: currentArea / previousArea
      };
    });
    const capitalGrowth = report.capitalComparisons.map(comparison => {
      const currentArea = comparison.current.widthCss * comparison.current.heightCss;
      const previousArea = comparison.previous.widthCss * comparison.previous.heightCss;
      const factorRatio = comparison.current.packedTierScale / comparison.previous.packedTierScale;
      assert(Math.abs(factorRatio - capitalRoleScale) < 1e-6, `真实首都 #${comparison.id} / ${comparison.cameraScale}× 不是线性 1.25：${factorRatio}`);
      assert(currentArea > previousArea, `真实首都 #${comparison.id} / ${comparison.cameraScale}× framebuffer 面积没有增大：${currentArea} <= ${previousArea}`);
      return {id: comparison.id, cameraScale: comparison.cameraScale, factorRatio, currentArea, previousArea};
    });
    for (const comparison of report.ordinaryCityComparisons) {
      assert.equal(comparison.current.pixelHash, comparison.previous.pixelHash, `普通大城 #${comparison.id} / ${comparison.cameraScale}× 像素发生变化`);
      assert.equal(comparison.current.widthCss, comparison.previous.widthCss, `普通大城 #${comparison.id} / ${comparison.cameraScale}× 宽度发生变化`);
      assert.equal(comparison.current.heightCss, comparison.previous.heightCss, `普通大城 #${comparison.id} / ${comparison.cameraScale}× 高度发生变化`);
    }
    if (report.dynamicRolesAudit) {
      const audit = report.dynamicRolesAudit;
      assert.equal(audit.initial.instance, audit.baseTierScale, "动态角色审计初始实例不是人口级别 T");
      assert(Math.abs(audit.initial.data - audit.initial.instance) < 1e-6, "动态角色审计初始 instanceData 与实例不一致");
      assert.equal(audit.addChanged, 1, "加入 capital 角色没有产生一次状态更新");
      assert(Math.abs(audit.added.instance - audit.baseTierScale * capitalRoleScale) < 1e-6, "加入 capital 后没有得到 T×1.25");
      assert(Math.abs(audit.added.data - audit.added.instance) < 1e-6, "加入 capital 后 instanceData 与实例不一致");
      assert.equal(audit.repeatChanged, 0, "重复加入 capital 发生累乘或多余更新");
      assert.equal(audit.repeated.instance, audit.added.instance, "重复加入 capital 改变了 tierScale");
      assert.equal(audit.repeated.stateUploads, audit.added.stateUploads, "重复加入 capital 产生了多余状态上传");
      assert.equal(audit.removeChanged, 1, "移除 capital 角色没有产生一次状态更新");
      assert.equal(audit.removed.instance, audit.baseTierScale, "移除 capital 后没有回到 T");
      assert(Math.abs(audit.removed.data - audit.removed.instance) < 1e-6, "移除 capital 后 instanceData 与实例不一致");
      assert.equal(audit.roleBitsChanged, 1, "roleBits-only 审计没有实际更新角色几何");
      assert.equal(audit.roleBitsOnly.instance, audit.baseTierScale, "roleBits-only 更新错误改变了 tierScale");
      assert(Math.abs(audit.roleBitsOnly.data - audit.roleBitsOnly.instance) < 1e-6, "roleBits-only 后 instanceData 与实例不一致");
      for (const state of [audit.initial, audit.added, audit.repeated, audit.removed, audit.roleBitsOnly]) {
        assert.equal(state.modelUploads, audit.modelUploads, "动态角色更新触发了额外 model upload");
      }
    }
    if (pixelRatio === 2) {
      assert.equal(realGrowth.length, Object.keys(tierScales).length * realComparisonScales.length, `DPR 2 没有完成真实四级 × 四档相机 framebuffer 对照：${realGrowth.length}`);
      assert.equal(new Set(capitalGrowth.map(item => item.id)).size, 20, `DPR 2 固定 10k 地图没有覆盖全部 20 个首都：${new Set(capitalGrowth.map(item => item.id)).size}`);
      assert.equal(capitalGrowth.length, 20 * realComparisonScales.length, `DPR 2 没有完成 20 首都 × 四档相机对照：${capitalGrowth.length}`);
      assert(report.ordinaryCityComparisons.length > 0, "DPR 2 固定 10k 地图没有普通大城对照");
      assert(report.ordinaryCityComparisons.some(item => item.roles.length === 0), "DPR 2 普通大城基线缺少无角色对象");
      assert(report.ordinaryCityComparisons.some(item => item.roles.includes("provincial")), "DPR 2 普通大城基线缺少非首都省会对象");
      assert(report.ordinaryCityComparisons.some(item => item.roles.includes("port")), "DPR 2 普通大城基线缺少非首都港口对象");
    }
    assert.equal(report.checksumAfter, report.checksumBefore, `${pixelRatio} DPR 城镇图标评测改变了地图 checksum`);
    assert.deepEqual(report.revisionAfter, report.revisionBefore, `${pixelRatio} DPR 城镇图标评测改变了地图 revision`);
    assert.equal(report.finalLayerStats.instanceCount, report.originalInstanceCount, `${pixelRatio} DPR 恢复后实例分母不完整`);
    assert.equal(report.finalInstanceDataLength, report.originalInstanceCount * 11, `${pixelRatio} DPR 城镇实例不再是单一 11-float 批次`);
    return {
      requestedPixelRatio: pixelRatio,
      browserPixelRatio: report.browserPixelRatio,
      pixelRatio: report.actualPixelRatio,
      tierDenominators: report.tierDenominators,
      meanWidth,
      tierBboxAreas: tierAreas,
      cappedTierBboxAreas: cappedTierAreas,
      maxTransitionRatio: Math.max(...report.samples.map(sample => sample.transition / sample.colored)),
      roleCompositePixels: report.roleComposite.colored,
      selectedGoldPixels: report.selected.gold,
      realTierItems: report.realTierComparisons.length ? Object.values(Object.fromEntries(report.realTierComparisons.map(item => [item.tier, {id: item.id, name: item.name, silhouette: item.silhouette, roles: item.roles}]))): [],
      realTierComparisons: realGrowth,
      capitalComparisons: {
        count: capitalGrowth.length,
        capitalCount: new Set(capitalGrowth.map(item => item.id)).size,
        minimumFactorRatio: capitalGrowth.length ? Math.min(...capitalGrowth.map(item => item.factorRatio)) : null,
        minimumAreaGrowth: capitalGrowth.length ? Math.min(...capitalGrowth.map(item => item.currentArea - item.previousArea)) : null
      },
      ordinaryCityPixelComparisons: report.ordinaryCityComparisons.length,
      dynamicRolesAudit: report.dynamicRolesAudit,
      initialLayerStats: report.initialLayerStats,
      finalLayerStats: report.finalLayerStats,
      minimumBackingPixelGrowth: realGrowth.length ? Math.min(...realGrowth.map(item => item.backingPixelGrowth)) : null,
      minimumRealGrowthRatio: realGrowth.length ? Math.min(...realGrowth.map(item => item.ratio)) : null,
      shapes: new Set(report.samples.map(sample => sample.silhouette)).size,
      glError: report.glError,
      activeHealthErrors: report.activeHealthErrors,
      consoleErrors,
      pageErrors,
      samples: report.samples
    };
  } finally {
    await Promise.race([context.close(), delay(5000)]);
  }
}

function verifyCrossRatioConsistency(reports) {
  for (const cameraScale of cameraScales) {
    for (const silhouette of silhouettes) {
      const widths = reports.map(report => report.samples.find(sample => sample.cameraScale === cameraScale && sample.silhouette === silhouette).widthCss);
      const heights = reports.map(report => report.samples.find(sample => sample.cameraScale === cameraScale && sample.silhouette === silhouette).heightCss);
      assert(Math.max(...widths) - Math.min(...widths) <= 2, `${cameraScale}× / ${silhouette} 的 CSS 宽度随 DPR 漂移：${widths.join(", ")}`);
      assert(Math.max(...heights) - Math.min(...heights) <= 2, `${cameraScale}× / ${silhouette} 的 CSS 高度随 DPR 漂移：${heights.join(", ")}`);
    }
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function verifyPreviousCapSimulation() {
  const cameraFactor = scale => 0.72 + 2.15 * (1 - Math.exp(-0.18 * Math.max(0, scale - 0.5)));
  for (const nameWidthCss of [8, 22.1, 80]) {
    const currentUsable = Math.max(1, Math.max(5.4, Math.min(12.1, nameWidthCss * 0.575 - 1)) - 2);
    const previousUsable = Math.max(1, Math.max(4.8, Math.min(10.5, nameWidthCss * 0.5 - 1)) - 2);
    const currentCap = 1.3;
    const previousCap = currentCap * previousUsable / currentUsable;
    const simulatedPreviousCap = previousCap * 1.2 / 1.1;
    for (const scale of realComparisonScales) {
      for (const tier of Object.keys(previousTierScales)) {
        const expected = Math.min(cameraFactor(scale), previousCap / 1.1) * previousTierScales[tier];
        const simulated = Math.min(cameraFactor(scale), simulatedPreviousCap / 1.2) * previousTierScales[tier];
        assert(Math.abs(expected - simulated) < 1e-12, `${nameWidthCss}px / ${scale}× / ${tier} 的第294项 cap 模拟公式漂移`);
      }
    }
  }
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
