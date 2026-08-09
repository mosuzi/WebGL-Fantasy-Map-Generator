#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5542;
const baseUrl = `http://${host}:${port}`;
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", join(rootDir, "prototype", "river-network-lab")], {
  cwd: rootDir,
  stdio: ["ignore", "pipe", "pipe"]
});
let browser;

try {
  await waitForServer();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1440, height: 960}});
  page.setDefaultTimeout(180000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.stack || error.message));
  await page.goto(baseUrl, {waitUntil: "domcontentloaded"});
  await waitForCase(page, "isolated-thin-fragment");
  await assertComparisonGeometry(page);

  await selectCase(page, "tributary-over-parent");
  const changed = await page.evaluate(() => {
    const signature = selector => [...document.querySelectorAll(`${selector} polyline.river-line`)].map(line => ({points: line.getAttribute("points"), width: line.getAttribute("stroke-width")}));
    return {baseline: signature("[data-view=baseline]"), candidate: signature("[data-view=candidate]")};
  });
  assert.notDeepEqual(changed.candidate, changed.baseline, "可接受候选必须实际绘制不同的候选宽度或几何");

  await selectCase(page, "tributary-unattached");
  const repairedFixture = await page.evaluate(() => ({
    evidence: window.riverNetworkLab.getEvidence(),
    rejectedLinks: document.querySelectorAll("[data-view=candidate] .rejected-link").length,
    candidateStatus: document.getElementById("candidate-status")?.textContent || "",
    baselineGeometry: [...document.querySelectorAll("[data-view=baseline] polyline.river-line")].map(line => line.getAttribute("points")),
    candidateGeometry: [...document.querySelectorAll("[data-view=candidate] polyline.river-line")].map(line => line.getAttribute("points"))
  }));
  const repairedRelation = repairedFixture.evidence.relations[0];
  assert.equal(repairedFixture.evidence.evidenceOk, true);
  assert.equal(repairedFixture.evidence.stages.confluence.status, "accepted");
  assert.equal(repairedFixture.evidence.stages.hydrology.status, "accepted");
  assert.equal(repairedRelation.status, "accepted");
  assert.ok(repairedRelation.distance > 12 && repairedRelation.distance <= repairedRelation.tolerance);
  assert.ok(repairedRelation.curvature > 0.5, "未接入支流页面候选仍接近直线");
  assert.deepEqual(repairedRelation.safety, {overshoot: true, selfIntersection: true, backtracking: true, water: true, nonConfluenceCrossing: true});
  assert.equal(repairedFixture.rejectedLinks, 0, "可修复未接入支流不得再显示拒绝连接段");
  assert.match(repairedFixture.candidateStatus, /accepted/);
  assert.notDeepEqual(repairedFixture.candidateGeometry, repairedFixture.baselineGeometry, "未接入支流 candidate 画面没有实际接入干流");

  const generated = [];
  for (const cellsTarget of [10000, 50000, 100000]) {
    const caseId = `generated-${cellsTarget}`;
    await selectCase(page, caseId);
    const evidence = await page.evaluate(() => window.riverNetworkLab.getEvidence());
    assert.equal(evidence.evidenceOk, true, `${cellsTarget} 页面证据未通过`);
    assert.equal(evidence.stages.dag.status, "accepted");
    assert.equal(evidence.stages.confluence.status, "accepted");
    assert.equal(evidence.stages.hydrology.status, "accepted");
    assert.equal(evidence.comparison.sameSnapshot, true, `${cellsTarget} 页面 A/B 未复用同一快照`);
    assert.equal(evidence.comparison.curveKind, "cubic-hermite-bezier");
    assert.ok(evidence.comparison.algorithmMs >= evidence.comparison.samplingMs);
    assert.ok(evidence.comparison.hydrologyAlgorithmMs > 0, `${cellsTarget} 页面 A/B 没有覆盖完整水文候选计时`);
    assert.deepEqual(evidence.comparison.gpuUpload, {applicable: false, reason: "standalone-svg-lab", baselineMs: 0, candidateMs: 0, deltaMs: 0});
    assert.equal(evidence.comparison.draw.method, "dom-commit-plus-double-request-animation-frame");
    assert.equal(evidence.comparison.draw.paintOpportunityObserved, true, `${cellsTarget} 页面没有观测到真实 rAF 绘制机会`);
    for (const [side, draw] of Object.entries({baseline: evidence.comparison.draw.baseline, candidate: evidence.comparison.draw.candidate})) {
      assert.ok(draw.domCommitMs >= 0 && draw.frameReadyMs >= 0, `${cellsTarget} ${side} DOM / frame 计时缺失`);
      assert.equal(draw.rafCallbacks, 2, `${cellsTarget} ${side} 没有经过双 rAF`);
      assert.equal(draw.frameTimestamps.length, 2, `${cellsTarget} ${side} rAF 时间戳缺失`);
      assert.ok(draw.frameTimestamps[1] >= draw.frameTimestamps[0], `${cellsTarget} ${side} rAF 时间戳倒退`);
      assert.ok(draw.paintEntries.some(entry => entry.name === "first-paint"), `${cellsTarget} ${side} 没有记录浏览器 paint timing`);
    }
    assert.deepEqual(evidence.runtimeGates, {
      health: {applicable: false, reason: "standalone-lab-no-health-monitor", errors: 0},
      webgl: {applicable: false, reason: "standalone-svg-lab", canvasCount: 0, contexts: 0},
      gpuUpload: {applicable: false, reason: "standalone-svg-lab", baselineMs: 0, candidateMs: 0, deltaMs: 0}
    }, `${cellsTarget} standalone SVG 运行时门没有精确声明不适用`);
    assert.ok(evidence.relations.every(relation => relation.status === "accepted" || relation.status === "protected"), `${cellsTarget} 存在未显式接受的关系`);
    if (cellsTarget === 100000) {
      const repaired = evidence.relations.find(relation => relation.childId === 760 && relation.parentId === 5);
      assert.equal(repaired?.attachmentSource, "shared-hydrology-cell");
      assert.ok(repaired.distance > 12 && repaired.distance <= repaired.tolerance && repaired.hydrologyDistance < repaired.tolerance);
      assert.ok(repaired.curvature > 0.5, "100k 页面候选仍是直线连接");
      assert.deepEqual(repaired.safety, {overshoot: true, selfIntersection: true, backtracking: true, water: true, nonConfluenceCrossing: true});
      assert.equal(evidence.comparison.baselineDecision.status, "blocked", "100k 页面 A/B 没有保留 baseline BLOCK");
    }
    generated.push({cellsTarget, stages: evidence.stages, baselineRivers: evidence.baselineRivers, candidateRivers: evidence.candidateRivers, comparison: evidence.comparison, runtimeGates: evidence.runtimeGates});
  }

  await page.setViewportSize({width: 390, height: 844});
  const responsive = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    comparisons: document.querySelectorAll(".comparison-map svg").length
  }));
  assert.equal(responsive.overflow, 0, "390px 实验室页面不得横向溢出");
  assert.equal(responsive.comparisons, 2);
  const screenshot = await page.screenshot({type: "png", fullPage: false});
  const screenshotChecksum = createHash("sha256").update(screenshot).digest("hex");
  assert.ok(screenshot.length > 10000, "实验室截图内容异常为空");
  assert.deepEqual(consoleErrors, [], "实验室浏览器不得产生 console error");
  assert.deepEqual(pageErrors, [], "实验室浏览器不得产生 page error");
  const runtime = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll("canvas").length,
    svgCount: document.querySelectorAll("svg").length,
    paintEntries: performance.getEntriesByType("paint").map(entry => ({name: entry.name, startTime: entry.startTime}))
  }));
  assert.equal(runtime.canvasCount, 0, "SVG 实验室不得伪造 WebGL context 证据");
  assert.ok(runtime.svgCount >= 2, "实验室没有保留 baseline / candidate SVG");
  assert.ok(runtime.paintEntries.length > 0, "浏览器没有记录真实 paint timing");
  console.log(JSON.stringify({ok: true, evidenceOk: true, generated, responsive, runtime, screenshotChecksum, healthErrors: [], webglErrors: [], consoleErrors, pageErrors}, null, 2));
  await page.close();
} finally {
  if (browser) await browser.close();
  server.kill();
  await Promise.race([new Promise(resolve => server.once("exit", resolve)), delay(5000)]);
}

async function assertComparisonGeometry(page) {
  const comparison = await page.evaluate(() => ({
    baseline: document.querySelectorAll("[data-view=baseline] svg polyline.river-line").length,
    candidate: document.querySelectorAll("[data-view=candidate] svg polyline.river-line").length,
    baselineLabel: document.querySelector("[data-view=baseline] svg")?.getAttribute("aria-label") || "",
    candidateLabel: document.querySelector("[data-view=candidate] svg")?.getAttribute("aria-label") || ""
  }));
  assert.ok(comparison.baseline > 0 && comparison.candidate > 0, "baseline / candidate 必须各自绘制真实河流几何");
  assert.match(comparison.baselineLabel, /baseline/);
  assert.match(comparison.candidateLabel, /candidate/);
}

async function selectCase(page, caseId) {
  await page.locator(`[data-case="${caseId}"]`).first().click();
  await waitForCase(page, caseId);
  await assertComparisonGeometry(page);
}

async function waitForCase(page, caseId) {
  await page.waitForFunction(id => window.riverNetworkLab?.getEvidence?.()?.caseId === id, caseId);
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`实验室服务提前退出：${server.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("实验室服务启动超时");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
