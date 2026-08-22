import assert from "node:assert/strict";
import {appendFileSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5531;
const run100k = process.argv.includes("--100k");
const runHundredThousandRiversGpuDiagnostic = process.argv.includes("--100k-rivers-gpu-diagnostic");
const runHundredThousandRiversGpuFlushDiagnostic = process.argv.includes("--100k-rivers-gpu-flush-diagnostic");
const runHundredThousandRoutesDiagnostic = process.argv.includes("--100k-routes-diagnostic");
const runHundredThousandFreshRoutesDiagnostic = process.argv.includes("--100k-fresh-routes-diagnostic");
const runPoliticalDiagnostic = process.argv.includes("--political-debug-diagnostic");
const runCommittedDisplayDiagnostic = process.argv.includes("--committed-display-diagnostic");
const runRenderReplayRecoveryDiagnostic = process.argv.includes("--render-replay-recovery-diagnostic");
const runGateConsoleTrace = process.argv.includes("--gate-console-trace");
const runNoOpDiagnostic = process.argv.includes("--no-op-diagnostic");
const renderReplayRecoveryCase = String(process.argv.find(argument => argument.startsWith("--render-replay-recovery-case="))?.split("=")[1] || "").toUpperCase();
assert.ok(!renderReplayRecoveryCase || ["A", "B", "C"].includes(renderReplayRecoveryCase), "render replay recovery case 仅支持 B、A 或 C");
const gateMode = runRenderReplayRecoveryDiagnostic ? "render-replay-recovery-diagnostic" : runCommittedDisplayDiagnostic ? "committed-display-diagnostic" : runPoliticalDiagnostic ? "political-debug-diagnostic" : runHundredThousandRiversGpuFlushDiagnostic ? "100k-rivers-gpu-flush-diagnostic" : runHundredThousandRiversGpuDiagnostic ? "100k-rivers-gpu-diagnostic" : runHundredThousandRoutesDiagnostic ? "100k-routes-diagnostic" : runHundredThousandFreshRoutesDiagnostic ? "100k-fresh-routes-diagnostic" : run100k ? "100k" : "fault-invalidation";
const evidenceName = run100k ? "worker-session-100k-browser" : gateMode === "fault-invalidation" ? "worker-session-browser" : `worker-session-${gateMode}`;
const evidence = createTask350BrowserArtifact(evidenceName, {mode: gateMode});
const runLifecycleDiagnostic = runCommittedDisplayDiagnostic || runRenderReplayRecoveryDiagnostic;
const timeoutMs = runCommittedDisplayDiagnostic ? 300000 : runRenderReplayRecoveryDiagnostic ? 180000 : 600000;
const diagnosticStartedAt = Date.now();
const diagnosticDir = join(rootDir, "work", runRenderReplayRecoveryDiagnostic
  ? "task322-a22-render-replay-recovery-diagnostic"
  : "task322-l3-committed-display-diagnostic");
const diagnosticLifecyclePath = join(diagnosticDir, "lifecycle.jsonl");
const gateConsoleTracePath = join(rootDir, "work", "task322-gate-console-trace", "gate-console-trace.jsonl");
const hundredThousandRiversGpuDiagnosticPath = join(rootDir, "work", "task322-100k-rivers-gpu-diagnostic", "gpu-trace.json");
const hundredThousandRiversGpuFlushDiagnosticPath = join(rootDir, "work", "task322-100k-rivers-gpu-flush-diagnostic", "gpu-trace.json");
const hundredThousandRoutesDiagnosticDir = join(rootDir, "work", "task322-100k-routes-diagnostic");
const hundredThousandRoutesDiagnosticPath = join(hundredThousandRoutesDiagnosticDir, "routes-trace.json");
const hundredThousandFreshRoutesDiagnosticDir = join(rootDir, "work", "task322-100k-fresh-routes-diagnostic");
const hundredThousandFreshRoutesDiagnosticPath = join(hundredThousandFreshRoutesDiagnosticDir, "fresh-routes-trace.json");
const noOpAttributionPath = join(rootDir, "work", "task322-no-op-attribution", "no-op-attribution.json");

runCapturedFreshRoutesPreparedEvidenceCounterexamples();

if (runLifecycleDiagnostic) initializeDiagnosticLifecycle();
if (runGateConsoleTrace) {
  mkdirSync(dirname(gateConsoleTracePath), {recursive: true});
  writeFileSync(gateConsoleTracePath, "", "utf8");
}

let server;
let browser;
let context;
let browserCdp;
let diagnosticPhase = "startup";
let thrown = null;

try {
  assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  server = await startStaticServer();
  evidence.mark("browser-launch", {complete: "server-ready"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  if (runLifecycleDiagnostic) {
    recordDiagnosticLifecycle("browser-process-exit-unavailable", {reason: "playwright.chromium.launch does not expose the Chrome child Process; launchServer migration is outside this narrow diagnostic"});
    installBrowserDiagnosticLifecycle(browser);
    browserCdp = await browser.newBrowserCDPSession();
    installTargetDiagnosticLifecycle(browserCdp);
    await browserCdp.send("Target.setDiscoverTargets", {discover: true});
  }
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  if (runLifecycleDiagnostic) context.on("close", () => recordDiagnosticLifecycle("context-close", {phase: diagnosticPhase}));
  await context.addInitScript(() => {
    localStorage.clear();
    window.__task322SessionLongTasks = [];
    window.__task322SurfaceBaseProbe = (() => {
      const maxSegmentBytes = 8 * 1024 * 1024;
      const maxSegmentVertices = Math.floor(maxSegmentBytes / Float32Array.BYTES_PER_ELEMENT / 9) * 3;
      const maxSegmentFloats = maxSegmentVertices * 6;
      const hashBytes = (values, initial = 2166136261) => {
        let hash = initial;
        for (const value of values) {
          hash ^= value;
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      };
      const capture = renderer => {
        const gl = renderer.gl;
        const bufferSet = renderer.surfaceBaseBufferSet;
        if (!bufferSet || !Array.isArray(bufferSet.segments) || !bufferSet.segments.length) throw new Error("surface base buffer set 缺失");
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        let aggregateHash = 2166136261;
        let aggregateBytes = 0;
        const segments = [];
        const captureBuffer = buffer => {
          const valid = gl.isBuffer(buffer);
          let byteLength = 0;
          let checksum = 2166136261;
          if (valid) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
            const bytes = new Uint8Array(byteLength);
            if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
            checksum = hashBytes(bytes);
            aggregateHash = hashBytes(bytes, aggregateHash);
            aggregateBytes += byteLength;
          }
          return {byteLength, checksum, valid};
        };
        try {
          for (const segment of bufferSet.segments) {
            const geometry = captureBuffer(segment.geometryBuffer || segment.buffer);
            const color = captureBuffer(segment.colorBuffer);
            segments.push({
              segmentRef: segment,
              bufferRef: segment.buffer,
              geometryBufferRef: segment.geometryBuffer,
              colorBufferRef: segment.colorBuffer,
              floatStart: segment.floatStart,
              floatEnd: segment.floatEnd,
              floatLength: segment.floatLength,
              byteLength: segment.byteLength,
              colorByteLength: segment.colorByteLength,
              totalGpuByteLength: segment.totalGpuByteLength,
              vertexCount: segment.vertexCount,
              triangleCount: segment.triangleCount,
              gpu: {geometry, color, valid: geometry.valid && color.valid}
            });
          }
        } finally {
          gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        }
        const expectedFloatLength = renderer.surfaceVertices instanceof Float32Array ? renderer.surfaceVertices.length : 0;
        const expectedSegmentCount = Math.max(1, Math.ceil(expectedFloatLength / maxSegmentFloats));
        let cursor = 0;
        let descriptorsValid = segments.length === expectedSegmentCount;
        for (const segment of segments) {
          descriptorsValid &&= segment.floatStart === cursor
            && segment.floatEnd >= segment.floatStart
            && segment.floatEnd <= expectedFloatLength
            && segment.floatStart % 18 === 0
            && segment.floatEnd % 18 === 0
            && segment.floatLength === segment.floatEnd - segment.floatStart
            && segment.byteLength === segment.vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT
            && segment.colorByteLength === segment.vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT
            && segment.totalGpuByteLength === segment.byteLength + segment.colorByteLength
            && segment.byteLength <= maxSegmentBytes
            && segment.colorByteLength <= maxSegmentBytes
            && segment.vertexCount === segment.floatLength / 6
            && segment.triangleCount === segment.floatLength / 18
            && segment.gpu.valid
            && segment.gpu.geometry.byteLength === segment.byteLength
            && segment.gpu.color.byteLength === segment.colorByteLength;
          cursor = segment.floatEnd;
        }
        descriptorsValid &&= cursor === expectedFloatLength
          && bufferSet.floatLength === expectedFloatLength
          && bufferSet.byteLength === segments.reduce((sum, segment) => sum + segment.byteLength, 0)
          && bufferSet.colorByteLength === segments.reduce((sum, segment) => sum + segment.colorByteLength, 0)
          && bufferSet.totalGpuByteLength === bufferSet.byteLength + bufferSet.colorByteLength
          && bufferSet.vertexCount === renderer.vertexCount
          && bufferSet.triangleCount === expectedFloatLength / 18
          && bufferSet.maxSegmentBytes === maxSegmentBytes
          && aggregateBytes === bufferSet.totalGpuByteLength
          && aggregateBytes === expectedFloatLength * Float32Array.BYTES_PER_ELEMENT
          && segments.reduce((sum, segment) => sum + segment.vertexCount, 0) === renderer.vertexCount;
        return {
          setRef: bufferSet,
          segmentsRef: bufferSet.segments,
          aliasRef: renderer.vertexBuffer,
          floatLength: bufferSet.floatLength,
          byteLength: bufferSet.byteLength,
          colorByteLength: bufferSet.colorByteLength,
          totalGpuByteLength: bufferSet.totalGpuByteLength,
          vertexCount: bufferSet.vertexCount,
          triangleCount: bufferSet.triangleCount,
          maxSegmentBytes: bufferSet.maxSegmentBytes,
          expectedSegmentCount,
          segments,
          aggregate: {byteLength: aggregateBytes, checksum: aggregateHash},
          aliasMatches: renderer.vertexBuffer === segments[0]?.bufferRef,
          descriptorsValid
        };
      };
      const summary = snapshot => ({
        floatLength: snapshot.floatLength,
        byteLength: snapshot.byteLength,
        colorByteLength: snapshot.colorByteLength,
        totalGpuByteLength: snapshot.totalGpuByteLength,
        vertexCount: snapshot.vertexCount,
        triangleCount: snapshot.triangleCount,
        maxSegmentBytes: snapshot.maxSegmentBytes,
        expectedSegmentCount: snapshot.expectedSegmentCount,
        segmentCount: snapshot.segments.length,
        aliasMatches: snapshot.aliasMatches,
        descriptorsValid: snapshot.descriptorsValid,
        aggregate: snapshot.aggregate,
        segments: snapshot.segments.map(segment => ({
          floatStart: segment.floatStart,
          floatEnd: segment.floatEnd,
          floatLength: segment.floatLength,
          byteLength: segment.byteLength,
          colorByteLength: segment.colorByteLength,
          totalGpuByteLength: segment.totalGpuByteLength,
          vertexCount: segment.vertexCount,
          triangleCount: segment.triangleCount,
          gpu: segment.gpu
        }))
      });
      const exact = (current, before) => ({
        set: current.setRef === before.setRef,
        segments: current.segmentsRef === before.segmentsRef,
        alias: current.aliasRef === before.aliasRef,
        descriptorRefs: current.segments.length === before.segments.length
          && current.segments.every((segment, index) => segment.segmentRef === before.segments[index].segmentRef
            && segment.geometryBufferRef === before.segments[index].geometryBufferRef
            && segment.colorBufferRef === before.segments[index].colorBufferRef),
        descriptors: current.segments.length === before.segments.length
          && current.segments.every((segment, index) => ["floatStart", "floatEnd", "floatLength", "byteLength", "colorByteLength", "totalGpuByteLength", "vertexCount", "triangleCount"].every(key => segment[key] === before.segments[index][key])),
        bytes: current.aggregate.byteLength === before.aggregate.byteLength && current.aggregate.checksum === before.aggregate.checksum,
        valid: current.descriptorsValid && before.descriptorsValid && current.aliasMatches && before.aliasMatches
          && current.segments.every(segment => segment.gpu.valid) && before.segments.every(segment => segment.gpu.valid)
      });
      const checksumCpu = renderer => {
        const values = renderer.surfaceVertices;
        if (!(values instanceof Float32Array)) return {byteLength: 0, checksum: 2166136261};
        return {
          byteLength: values.byteLength,
          checksum: hashBytes(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
        };
      };
      return {capture, summary, exact, checksumCpu, maxSegmentBytes, maxSegmentFloats};
    })();
    const appendLongTasks = entries => {
      for (const entry of entries) {
        window.__task322SessionLongTasks.push({startTime: entry.startTime, duration: entry.duration, name: entry.name});
      }
    };
    window.__task322SessionLongTaskObserver = new PerformanceObserver(list => appendLongTasks(list.getEntries()));
    window.__task322SessionLongTaskObserver.observe({entryTypes: ["longtask"]});
    window.__task322DrainSessionLongTasks = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      appendLongTasks(window.__task322SessionLongTaskObserver.takeRecords());
      return window.__task322SessionLongTasks.slice();
    };
  });
  const page = await context.newPage();
  if (runLifecycleDiagnostic) installPageDiagnosticLifecycle(page);
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const consoleErrorRecords = [];
  const pendingConsoleErrorReads = new Set();
  let consoleErrorSequence = 0;
  const flushConsoleErrors = async () => {
    while (pendingConsoleErrorReads.size) await Promise.allSettled([...pendingConsoleErrorReads]);
  };
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const record = {id: ++consoleErrorSequence, text: message.text(), args: null, readError: null};
    consoleErrors.push(record.text);
    consoleErrorRecords.push(record);
    const pending = Promise.all(message.args().map(argument => argument.jsonValue()))
      .then(args => { record.args = args; }, error => { record.readError = serializeDiagnosticError(error); })
      .finally(() => pendingConsoleErrorReads.delete(pending));
    pendingConsoleErrorReads.add(pending);
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  evidence.mark("browser-evaluation", {active: gateMode, complete: "page-ready"});
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Runtime.enable");
  if (runLifecycleDiagnostic) await captureCommittedDisplayDiagnosticSnapshot(page, cdp, browserCdp, "api-ready");
  const gateConsoleTrace = runGateConsoleTrace ? {entries: [], consoleErrorRecords, flushConsoleErrors} : null;
  let recoveryStartupEvidence = {healthEvents: [], consoleErrorRecords: []};
  if (runRenderReplayRecoveryDiagnostic) {
    await flushConsoleErrors();
    const startupHealthEvents = await page.evaluate(() => window.__webglGeneratorHealth?.getEvents?.(500) || []);
    const startupConsumption = consumeVerifiedSetupHealthConsoleErrors(consoleErrorRecords, startupHealthEvents, "recovery startup");
    assert.deepEqual(startupConsumption.unexpected, [], "recovery startup 出现非预期 console error");
    recoveryStartupEvidence = {healthEvents: startupConsumption.healthEvents, consoleErrorRecords: startupConsumption.consumed};
  }

  const result = runRenderReplayRecoveryDiagnostic
    ? {renderReplayRecovery: await withRenderReplayRecoveryDiagnosticDeadline(runRenderReplayRecoveryDiagnosticGate(page, {cdp, browserCdp, consoleErrors, consoleErrorRecords, flushConsoleErrors, pageErrors, startupEvidence: recoveryStartupEvidence}))}
    : runCommittedDisplayDiagnostic
    ? {committedDisplayReplay: await withCommittedDisplayDiagnosticDeadline(runCommittedDisplayReplayGate(page, {cdp, browserCdp}))}
    : runPoliticalDiagnostic
    ? await runFocusedPoliticalDebugDiagnostic(page, cdp)
    : runHundredThousandRiversGpuDiagnostic || runHundredThousandRiversGpuFlushDiagnostic
      ? {riversGpuDiagnostic: await runHundredThousandRiversGpuDiagnosticGate(page, {flushAfterEach: runHundredThousandRiversGpuFlushDiagnostic})}
    : runHundredThousandRoutesDiagnostic
      ? {routesDiagnostic: await runHundredThousandRoutesDiagnosticGate(page, cdp)}
    : runHundredThousandFreshRoutesDiagnostic
      ? {freshRoutesDiagnostic: await runHundredThousandFreshRoutesDiagnosticGate(page, cdp)}
    : run100k
      ? await runHundredThousandSessionGate(page, cdp)
      : await runSessionFaultAndInvalidationGate(page, cdp, {consoleErrors, consoleErrorRecords, flushConsoleErrors, gateConsoleTrace});
  if (runHundredThousandRiversGpuDiagnostic || runHundredThousandRiversGpuFlushDiagnostic) {
    const diagnosticPath = runHundredThousandRiversGpuFlushDiagnostic ? hundredThousandRiversGpuFlushDiagnosticPath : hundredThousandRiversGpuDiagnosticPath;
    mkdirSync(dirname(diagnosticPath), {recursive: true});
    writeFileSync(diagnosticPath, `${JSON.stringify(result.riversGpuDiagnostic, null, 2)}\n`, "utf8");
    console.error(`[task322-100k-rivers-gpu-diagnostic] artifact=${diagnosticPath}`);
    assert.equal(result.riversGpuDiagnostic.operationError, null, "100k rivers GPU 诊断操作异常");
    assert.equal(result.riversGpuDiagnostic.response.ok, true, `100k rivers GPU 诊断重生成失败：${result.riversGpuDiagnostic.response.error?.code || "unknown"}`);
    assert.deepEqual(result.riversGpuDiagnostic.restoreErrors, [], "100k rivers GPU 诊断包装未完整恢复");
    assert.deepEqual(result.riversGpuDiagnostic.longTasks, [], "100k rivers GPU 诊断复现主线程 longtask");
    const surfaceBase = result.riversGpuDiagnostic.surfaceBase;
    assert.equal(surfaceBase?.aliasMatches, true, "100k rivers GPU 诊断 surface alias 未指向首段");
    assert.equal(surfaceBase?.descriptorsValid, true, "100k rivers GPU 诊断 surface segment descriptor 无效");
    assert.equal(surfaceBase?.segmentCount, surfaceBase?.expectedSegmentCount, "100k rivers GPU 诊断 surface GPU count 与 ceil 公式不符");
    assert.ok(surfaceBase?.segmentCount > 1, `100k rivers GPU 诊断 surface 未实际分段：${surfaceBase?.segmentCount}`);
    assert.ok(surfaceBase.segments.every(segment => segment.byteLength <= 8 * 1024 * 1024 && segment.floatStart % 18 === 0 && segment.floatEnd % 18 === 0), "100k rivers GPU 诊断 surface segment 超过8MiB或未按18-float对齐");
    const surfaceBindings = result.riversGpuDiagnostic.surfaceSegmentBindings;
    assert.equal(surfaceBindings.length, surfaceBase.segmentCount * 2, "100k rivers GPU 诊断未逐段登记 geometry/color binding");
    assert.equal(surfaceBindings.filter(binding => binding.kind === "geometry").length, surfaceBase.segmentCount, "100k rivers GPU 诊断 geometry binding 数量不符");
    assert.equal(surfaceBindings.filter(binding => binding.kind === "color").length, surfaceBase.segmentCount, "100k rivers GPU 诊断 color binding 数量不符");
    assert.equal(new Set(surfaceBindings.map(binding => binding.bindingId)).size, surfaceBindings.length, "100k rivers GPU 诊断 geometry/color binding 身份重复");
    const surfaceCalls = result.riversGpuDiagnostic.gpu.surfaceCalls;
    assert.equal(surfaceCalls.filter(call => call.method === "bufferData").length, surfaceBindings.length, "100k rivers GPU 诊断每个 geometry/color binding 未精确执行一次 bufferData");
    assert.equal(surfaceCalls.some(call => call.method === "bufferSubData"), false, "100k rivers GPU 诊断 active surface base 出现 bufferSubData");
    assert.ok(surfaceCalls.every(call => Number(call.durationMs) < 50), `100k rivers GPU 诊断单次 surface upload 超预算：${JSON.stringify(surfaceCalls)}`);
    for (const binding of surfaceBindings) {
      const calls = surfaceCalls.filter(call => call.bindingId === binding.bindingId && call.method === "bufferData");
      assert.equal(calls.length, 1, `100k rivers GPU 诊断 segment binding ${binding.bindingId} 上传次数不符`);
      assert.equal(calls[0].byteLength, binding.byteLength, `100k rivers GPU 诊断 segment binding ${binding.bindingId} 上传字节不符`);
    }
  }
  if (runHundredThousandRoutesDiagnostic) {
    mkdirSync(hundredThousandRoutesDiagnosticDir, {recursive: true});
    writeFileSync(hundredThousandRoutesDiagnosticPath, `${JSON.stringify(result.routesDiagnostic, null, 2)}\n`, "utf8");
    console.error(`[task322-100k-routes-diagnostic] artifact=${hundredThousandRoutesDiagnosticPath}`);
  }
  if (runHundredThousandFreshRoutesDiagnostic) {
    mkdirSync(hundredThousandFreshRoutesDiagnosticDir, {recursive: true});
    writeFileSync(hundredThousandFreshRoutesDiagnosticPath, `${JSON.stringify(result.freshRoutesDiagnostic, null, 2)}\n`, "utf8");
    console.error(`[task322-100k-fresh-routes-diagnostic] artifact=${hundredThousandFreshRoutesDiagnosticPath}`);
    const diagnostic = result.freshRoutesDiagnostic;
    assert.equal(diagnostic.response.ok, true, `100k fresh routes 诊断重生成失败：${diagnostic.response.error?.code || "unknown"}`);
    assert.equal(diagnostic.response.worker.mode, "worker", "100k fresh routes 诊断未使用 Worker");
    assert.equal(diagnostic.response.worker.accepted, true, "100k fresh routes 诊断 Worker 未 accepted");
    assert.equal(diagnostic.response.worker.session.reused, false, "100k fresh routes 诊断不是 fresh session");
    assert.equal(diagnostic.response.worker.session.committed, true, "100k fresh routes 诊断 session 未提交");
    assert.ok(Number(diagnostic.response.worker.telemetry.inputPackets) > 4, "100k fresh routes 诊断未传输完整输入");
    assertTelemetry(diagnostic.response.worker.telemetry, "100k fresh routes diagnostic");
  }
  if (runRenderReplayRecoveryDiagnostic) await page.waitForTimeout(100);
  await flushConsoleErrors();
  const gateConsoleAttribution = gateConsoleTrace ? finalizeGateConsoleTrace(gateConsoleTrace, consoleErrorRecords) : null;
  const selectedRecoveryScenario = runRenderReplayRecoveryDiagnostic
    ? result.renderReplayRecovery?.scenarios?.find(item => item.id === renderReplayRecoveryCase)
    : null;
  const verifiedFinalSnapshot = renderReplayRecoveryCase === "C" ? selectedRecoveryScenario?.verifiedFinalSnapshot : null;
  const finalSignals = verifiedFinalSnapshot?.signals || await readSignals(page);
  const verifiedRecoveryHealthEvents = [
    ...(result.renderReplayRecovery?.startupEvidence?.healthEvents || []),
    ...(result.renderReplayRecovery?.scenarios || []).flatMap(item => [
      ...(item.setupHealthEvents || []),
      ...(item.expectedHealthEvents || []),
      ...(item.cleanupHealthEvents || [])
    ])
  ];
  const verifiedRecoveryConsoleErrors = [
    ...(result.renderReplayRecovery?.startupEvidence?.consoleErrorRecords || []),
    ...(result.renderReplayRecovery?.scenarios || []).flatMap(item => [
      ...(item.setupConsoleErrorRecords || []),
      ...(item.expectedConsoleErrorRecords || []),
      ...(item.cleanupConsoleErrorRecords || [])
    ])
  ];
  if (verifiedFinalSnapshot) {
    assert.deepEqual(verifiedFinalSnapshot.expectedHealthEvents, selectedRecoveryScenario.expectedHealthEvents, "C verified final health 快照漂移");
    assert.deepEqual(verifiedFinalSnapshot.expectedConsoleErrorRecords, selectedRecoveryScenario.expectedConsoleErrorRecords, "C verified final console 快照漂移");
    assert.deepEqual(verifiedFinalSnapshot.pageErrors, [], "C verified final 快照包含 page error");
  }
  const overBudgetLongTasks = finalSignals.longTasks.filter(task => Number(task.duration) > 200);
  if (!runHundredThousandRoutesDiagnostic && !runHundredThousandFreshRoutesDiagnostic) assert.deepEqual(overBudgetLongTasks, [], "session 门出现 >200ms 主线程 longtask");
  assert.deepEqual(removeVerifiedHealthEvents(finalSignals.nonPerformanceHealth, verifiedRecoveryHealthEvents), [], "session 门出现未由场景验过的非性能 health error");
  if (runRenderReplayRecoveryDiagnostic) {
    assert.deepEqual(removeVerifiedConsoleErrorRecords(consoleErrorRecords, verifiedRecoveryConsoleErrors), [], "session 门出现未由场景验过的应用 console error");
  } else {
    assert.deepEqual(consoleErrors.filter(message => !/^\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message)), [], "session 门出现应用 console error");
  }
  assert.deepEqual(pageErrors, [], "session 门出现 page error");
  assert.equal(finalSignals.glError, 0, "session 门出现 WebGL error");
  assert.equal(finalSignals.loadingVisible, 0, "session 门结束后 Loading 未清理");
  const fullResult = {ok: true, mode: gateMode, ...result, gateConsoleAttribution, finalSignals};
  evidence.setResult(fullResult, compactSessionGateResult(result, finalSignals, overBudgetLongTasks, {consoleErrors: consoleErrors.length, pageErrors: pageErrors.length}));
  evidence.mark("assertions", {complete: "browser-evaluation"});
  evidence.succeed();
} catch (error) {
  thrown = error;
  evidence.fail(error);
} finally {
  if (runLifecycleDiagnostic) {
    diagnosticPhase = "teardown";
    recordDiagnosticLifecycle("teardown-start");
  }
  let teardownOk = true;
  for (const [label, close] of [
    ["context", context && (() => context.close())],
    ["browser", browser && (() => browser.close())],
    ["server", server && (() => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())))]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      teardownOk = false;
      thrown ||= error;
      evidence.failTeardown(error);
    }
  }
  if (runLifecycleDiagnostic && teardownOk) recordDiagnosticLifecycle("teardown-complete");
  const persisted = evidence.persist();
  console.log(JSON.stringify(persisted.summary, null, 2));
}
if (thrown) throw thrown;

async function runSessionFaultAndInvalidationGate(page, cdp, consoleDiagnostic) {
  const core = await traceSessionGate(page, consoleDiagnostic, "fault-invalidation-core", "no-op、session invalidation 与 river refresh fault 均按既有断言完成", async () => {
  await createMap(page, "worker-session-fault-10k", 10000);
  const noOp = await page.evaluate(async diagnosticEnabled => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const captureSurfaceGpuLiveness = () => ({
      contextLost: Boolean(renderer.gl.isContextLost?.()),
      segments: (renderer.surfaceBaseBufferSet?.segments || []).map((segment, index) => ({
        index,
        geometry: renderer.gl.isBuffer(segment.geometryBuffer),
        color: renderer.gl.isBuffer(segment.colorBuffer)
      }))
    });
    const surfaceGpuAfterMap = captureSurfaceGpuLiveness();
    const timings = {};
    const round = value => Math.round(Number(value || 0) * 1000) / 1000;
    const measure = (name, callback) => {
      const start = performance.now();
      try {
        return callback();
      } finally {
        const end = performance.now();
        timings[name] = {start: round(start), end: round(end), durationMs: round(end - start)};
      }
    };
    const rivers = (app.map.rivers?.rivers || []).filter(Boolean);
    const sessionBeforeLock = app.workerTaskCoordinator.getSessionSnapshot();
    const locked = measure("lock", () => api.regenerationLocks.setMany(rivers.map(river => ({kind: "river", id: river.i ?? river.id})), true));
    if (!locked?.ok) throw new Error(`锁定全部河流失败：${locked?.error?.message || "unknown"}`);
    await app.mapReplicaPatchQueue;
    const sessionAfterLock = app.workerTaskCoordinator.getSessionSnapshot();
    const surfaceGpuAfterLockPatch = captureSurfaceGpuLiveness();
    if (sessionBeforeLock?.status !== "idle" || sessionAfterLock?.status !== "idle"
      || sessionBeforeLock.id !== sessionAfterLock.id
      || Number(sessionAfterLock.binding?.mapRevision) !== Number(locked.data?.mapRevisionAfter?.mapRevision)
      || sessionBeforeLock.binding?.lockFingerprint === sessionAfterLock.binding?.lockFingerprint) {
      throw new Error(`全锁河流命令未连续 patch generation session：${JSON.stringify({sessionBeforeLock, sessionAfterLock, lockRevision: locked.data?.mapRevisionAfter})}`);
    }
    const salt = Number(app.map.metadata?.regeneration?.rivers) || 0;
    const history = app.editHistory.getStats();
    const surfaceCpu = measure("cpuHash", () => window.__task322SurfaceBaseProbe.checksumCpu(renderer));
    const surfaceBaseBefore = measure("gpuHash", () => window.__task322SurfaceBaseProbe.capture(renderer));
    let typed;
    let identity;
    measure("refs", () => {
      typed = [["grid.h", app.map.grid.cells.h], ["grid.p", app.map.grid.cells.p], ["pack.h", app.map.pack.cells.h], ["pack.g", app.map.pack.cells.g]]
        .map(([name, value]) => ({name, value, length: value?.length ?? 0, byteLength: value?.byteLength ?? 0}));
      identity = {
        surfaceVertices: renderer.surfaceVertices,
        surfaceCpu,
        surfaceBase: surfaceBaseBefore,
        buffers: [renderer.lineBuffer, renderer.pointBuffer, renderer.routeBuffer, renderer.riverBuffer],
        picking: renderer.objectPickingIndex,
        overlayNodes: [...renderer.overlay.childNodes],
        camera: JSON.stringify(renderer.camera)
      };
    });

    const noOps = [1, 2].map(index => ({index, start: 0, end: 0, durationMs: 0, stream: {runCount: 0, yieldCount: 0, maxCpuSliceMs: 0, samples: []}}));
    const coordinatorProbe = {activeNoOp: 0};
    const originalCoordinator = app.workerTaskCoordinator;
    let wrappedCoordinator = null;
    if (diagnosticEnabled) {
      wrappedCoordinator = Object.freeze({
        ...originalCoordinator,
        async run(task, payload, options = {}) {
          const active = noOps[coordinatorProbe.activeNoOp - 1];
          if (!active) return Reflect.apply(originalCoordinator.run, originalCoordinator, [task, payload, options]);
          active.stream.runCount++;
          let lastResumeAt = performance.now();
          const originalYield = options.streamYieldToMain;
          const streamYieldToMain = async () => {
            const sliceEnd = performance.now();
            const durationMs = sliceEnd - lastResumeAt;
            active.stream.yieldCount++;
            active.stream.maxCpuSliceMs = Math.max(active.stream.maxCpuSliceMs, round(durationMs));
            if (durationMs >= 20) {
              active.stream.samples.push({start: round(lastResumeAt), end: round(sliceEnd), durationMs: round(durationMs)});
              active.stream.samples.sort((left, right) => right.durationMs - left.durationMs);
              active.stream.samples.length = Math.min(active.stream.samples.length, 6);
            }
            if (typeof originalYield === "function") await originalYield();
            else if (typeof globalThis.scheduler?.yield === "function") await globalThis.scheduler.yield();
            else await new Promise(resolve => setTimeout(resolve, 0));
            lastResumeAt = performance.now();
          };
          return Reflect.apply(originalCoordinator.run, originalCoordinator, [task, payload, {...options, streamYieldToMain}]);
        }
      });
      app.workerTaskCoordinator = wrappedCoordinator;
    }

    const longAnimationFrames = [];
    const longAnimationFrameSupported = Boolean(globalThis.PerformanceObserver?.supportedEntryTypes?.includes("long-animation-frame"));
    let longAnimationFrameObserver = null;
    const appendLongAnimationFrames = entries => {
      for (const entry of entries) {
        if (longAnimationFrames.length >= 32) break;
        longAnimationFrames.push({
          startTime: round(entry.startTime),
          duration: round(entry.duration),
          blockingDuration: round(entry.blockingDuration),
          renderStart: round(entry.renderStart),
          styleAndLayoutStart: round(entry.styleAndLayoutStart),
          firstUIEventTimestamp: round(entry.firstUIEventTimestamp)
        });
      }
    };
    if (longAnimationFrameSupported) {
      longAnimationFrameObserver = new PerformanceObserver(list => appendLongAnimationFrames(list.getEntries()));
      longAnimationFrameObserver.observe({entryTypes: ["long-animation-frame"]});
    }

    const preProbeLongTasks = await window.__task322DrainSessionLongTasks();
    window.__task322SessionLongTasks.length = 0;
    longAnimationFrames.length = 0;
    const loadingMutation = {first: null, last: null};
    let loadingMutationObserver = null;
    const noteLoadingMutation = entries => {
      if (!entries.length) return;
      const now = round(performance.now());
      loadingMutation.first ??= now;
      loadingMutation.last = now;
    };
    loadingMutationObserver = new MutationObserver(list => noteLoadingMutation(list));
    for (const node of [document.getElementById("generation-loading"), document.getElementById("operation-loading")].filter(Boolean)) {
      loadingMutationObserver.observe(node, {attributes: true, childList: true, characterData: true, subtree: true});
    }
    loadingMutationObserver.notePending = () => noteLoadingMutation(loadingMutationObserver.takeRecords());

    const runNoOp = async index => {
      const record = noOps[index - 1];
      coordinatorProbe.activeNoOp = index;
      const start = performance.now();
      record.start = round(start);
      try {
        return await api.generate.regenerate("rivers", {confirm: true});
      } finally {
        const end = performance.now();
        record.end = round(end);
        record.durationMs = round(end - start);
        timings[`noOp${index}`] = {start: record.start, end: record.end, durationMs: record.durationMs};
        coordinatorProbe.activeNoOp = 0;
      }
    };

    let first;
    let second;
    try {
      first = await runNoOp(1);
      second = await runNoOp(2);
    } finally {
      if (diagnosticEnabled && app.workerTaskCoordinator === wrappedCoordinator) app.workerTaskCoordinator = originalCoordinator;
    }
    for (const [index, response] of [first, second].entries()) {
      if (!response?.ok || response.data?.executed !== false) throw new Error(`全锁河流 no-op #${index + 1} 未正确返回`);
      if (!response.data.worker?.session?.committed) throw new Error(`全锁河流 no-op #${index + 1} 未提交 session`);
    }
    if (first.data.worker.session.reused !== true || second.data.worker.session.reused !== true) {
      throw new Error(`全锁河流 no-op 未复用已 patch 的 generation session：${JSON.stringify({sessionAfterLock, first: first.data.worker.session, second: second.data.worker.session})}`);
    }
    if (first.data.worker.session.id !== sessionAfterLock.id || second.data.worker.session.id !== sessionAfterLock.id) throw new Error("全锁河流 no-op session id 变化");
    if ((Number(app.map.metadata?.regeneration?.rivers) || 0) !== salt) throw new Error("全锁河流 no-op 推进了 salt");
    if (JSON.stringify(app.editHistory.getStats()) !== JSON.stringify(history)) throw new Error("全锁河流 no-op 写入历史");
    const operationLongTasks = await window.__task322DrainSessionLongTasks();
    loadingMutationObserver?.notePending?.();
    loadingMutationObserver?.disconnect();
    if (longAnimationFrameObserver) {
      appendLongAnimationFrames(longAnimationFrameObserver.takeRecords());
      longAnimationFrameObserver.disconnect();
    }
    const overlaps = (left, right) => left.startTime < right.startTime + right.duration && right.startTime < left.startTime + left.duration;
    const overlappingLongAnimationFrames = longAnimationFrames
      .filter(frame => operationLongTasks.some(longTask => overlaps(frame, longTask)))
      .slice(0, 8);
    const longTaskAttribution = operationLongTasks.map((longTask, index) => {
      const streamMatches = noOps.flatMap(noOp => noOp.stream.samples
        .filter(sample => sample.start < longTask.startTime + longTask.duration && longTask.startTime < sample.end)
        .map(sample => ({noOp: noOp.index, ...sample})));
      const noOpIndexes = noOps.filter(noOp => noOp.start < longTask.startTime + longTask.duration && longTask.startTime < noOp.end).map(noOp => noOp.index);
      const loadingOverlap = [loadingMutation.first, loadingMutation.last]
        .filter(value => value !== null)
        .some(value => value >= longTask.startTime && value <= longTask.startTime + longTask.duration);
      const category = streamMatches.length ? "stream-input-cpu-slice" : loadingOverlap ? "loading-mutation" : noOpIndexes.length === 1 ? `no-op-${noOpIndexes[0]}-other` : "unattributed";
      return {
        index,
        category,
        noOpIndexes,
        streamSamples: streamMatches.slice(0, 6),
        loadingMutationOverlap: loadingOverlap,
        longAnimationFrameCount: overlappingLongAnimationFrames.filter(frame => overlaps(frame, longTask)).length
      };
    });
    const categories = [...new Set(longTaskAttribution.map(item => item.category))];

    const typedChanges = typed
      .map(item => ({name: item.name, beforeLength: item.length, afterLength: item.value?.length ?? 0, beforeBytes: item.byteLength, afterBytes: item.value?.byteLength ?? 0}))
      .filter(item => item.beforeLength !== item.afterLength || item.beforeBytes !== item.afterBytes);
    if (typedChanges.length) throw new Error(`Worker 输入转移导致正式 TypedArray detached：${JSON.stringify(typedChanges)}`);
    const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
    const surfaceGpuAfterNoOps = captureSurfaceGpuLiveness();
    const currentSurfaceCpu = window.__task322SurfaceBaseProbe.checksumCpu(renderer);
    const surfaceComparison = window.__task322SurfaceBaseProbe.exact(surfaceBase, identity.surfaceBase);
    const surfaceBaseExact = Object.values(surfaceComparison).every(Boolean)
      && renderer.surfaceVertices === identity.surfaceVertices
      && currentSurfaceCpu.byteLength === identity.surfaceCpu.byteLength
      && currentSurfaceCpu.checksum === identity.surfaceCpu.checksum;
    const rendererExact = surfaceBaseExact
      && !identity.buffers.some((buffer, index) => renderer[["lineBuffer", "pointBuffer", "routeBuffer", "riverBuffer"][index]] !== buffer)
      && renderer.objectPickingIndex === identity.picking
      && identity.overlayNodes.every((node, index) => renderer.overlay.childNodes[index] === node)
      && JSON.stringify(renderer.camera) === identity.camera;
    if (!rendererExact) {
      throw new Error(`全锁河流 no-op 改写 renderer：${JSON.stringify({
        surfaceBaseExact,
        surfaceGpuAfterMap,
        surfaceGpuAfterLockPatch,
        surfaceGpuAfterNoOps,
        surface: {
          ...surfaceComparison,
          vertices: renderer.surfaceVertices === identity.surfaceVertices,
          cpuBytes: currentSurfaceCpu.byteLength === identity.surfaceCpu.byteLength,
          cpuChecksum: currentSurfaceCpu.checksum === identity.surfaceCpu.checksum,
          gpuBytes: surfaceBase.aggregate.byteLength === identity.surfaceBase.aggregate.byteLength,
          gpuChecksum: surfaceBase.aggregate.checksum === identity.surfaceBase.aggregate.checksum
        },
        buffers: ["lineBuffer", "pointBuffer", "routeBuffer", "riverBuffer"].map((name, index) => ({name, exact: renderer[name] === identity.buffers[index]})),
        pickingExact: renderer.objectPickingIndex === identity.picking,
        overlay: {
          before: identity.overlayNodes.length,
          after: renderer.overlay.childNodes.length,
          prefixExact: identity.overlayNodes.every((node, index) => renderer.overlay.childNodes[index] === node)
        },
        cameraExact: JSON.stringify(renderer.camera) === identity.camera
      })}`);
    }
    return {
      first: {executed: first.data.executed, session: first.data.worker.session, telemetry: first.data.worker.telemetry},
      second: {executed: second.data.executed, session: second.data.worker.session, telemetry: second.data.worker.telemetry},
      operationLongTasks,
      salt,
      history,
      sessionBeforeLock,
      sessionAfterLock,
      surfaceGpuAfterMap,
      surfaceGpuAfterLockPatch,
      surfaceGpuAfterNoOps,
      attribution: {
        version: 1,
        timings,
        preProbeLongTasks,
        operationLongTasks,
        noOps,
        loadingMutation,
        longAnimationFrame: {supported: longAnimationFrameSupported, overlapping: overlappingLongAnimationFrames},
        classification: {
          tasks: longTaskAttribution,
          categories,
          singleCategory: categories.length === 1 ? categories[0] : null
        },
        gates: {
          operationLongTasks: operationLongTasks.length,
          firstExecuted: first.data.executed,
          secondExecuted: second.data.executed,
          sessionPatched: sessionBeforeLock.id === sessionAfterLock.id
            && sessionBeforeLock.binding?.lockFingerprint !== sessionAfterLock.binding?.lockFingerprint,
          sessionReused: first.data.worker.session.reused === true && second.data.worker.session.reused === true,
          sessionStable: first.data.worker.session.id === sessionAfterLock.id && second.data.worker.session.id === sessionAfterLock.id,
          typedArraysAttached: typedChanges.length === 0,
          surfaceGpuCpuExact: surfaceBaseExact,
          rendererExact
        }
      }
    };
  }, runNoOpDiagnostic);
  if (runNoOpDiagnostic) {
    mkdirSync(dirname(noOpAttributionPath), {recursive: true});
    writeFileSync(noOpAttributionPath, `${JSON.stringify(noOp.attribution, null, 2)}\n`, "utf8");
    console.error(`[task322-no-op-attribution] artifact=${noOpAttributionPath}`);
  }
  try {
    assert.deepEqual(noOp.operationLongTasks, [], "two consecutive river no-op 出现主线程 longtask");
  } catch (error) {
    console.error(`[task322-no-op-failure] ${JSON.stringify(noOp)}`);
    throw error;
  }
  await discardProbeLongTasks(page);
  if (runNoOpDiagnostic) return {noOp};

  await createMap(page, "worker-session-invalidation-10k", 10000);
  const invalidation = {adoptedInitial: await readWorkerSessionSnapshot(page)};
  assertIdleAdoptedSession(invalidation.adoptedInitial, "session continuity 初始 generation");
  invalidation.initial = summarizeResult(await regenerate(page, cdp, "routes"));
  assert.equal(invalidation.initial.worker.session.reused, true, "首个 routes 未复用已采用 generation session");
  assert.equal(invalidation.initial.worker.session.id, invalidation.adoptedInitial.id, "首个 routes 未延续 generation session id");
  invalidation.afterInitial = await readWorkerSessionSnapshot(page);
  assertSessionContinuity(invalidation.adoptedInitial, invalidation.afterInitial, {
    label: "首个 routes",
    revisionDelta: 1,
    checksum: "same",
    lockFingerprint: "same"
  });
  const undo = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(undo?.ok, true, "撤销 session 基线失败");
  invalidation.patchedAfterUndo = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    await app.mapReplicaPatchQueue;
    return structuredClone(app.workerTaskCoordinator.getSessionSnapshot());
  });
  assertSessionContinuity(invalidation.afterInitial, invalidation.patchedAfterUndo, {
    label: "undo replica patch",
    revisionDelta: 1,
    checksum: "changed",
    lockFingerprint: "same"
  });
  invalidation.afterUndo = summarizeResult(await regenerate(page, cdp, "routes"));
  assert.equal(invalidation.afterUndo.worker.session.reused, true, "undo replica patch 后未复用 Worker session");
  assert.equal(invalidation.afterUndo.worker.session.id, invalidation.adoptedInitial.id, "undo 后 routes session id 漂移");

  invalidation.beforeLock = await readWorkerSessionSnapshot(page);
  assertSessionContinuity(invalidation.patchedAfterUndo, invalidation.beforeLock, {
    label: "undo 后 routes",
    revisionDelta: 1,
    checksum: "same",
    lockFingerprint: "same"
  });

  const lock = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const river = (app.map.rivers?.rivers || []).find(Boolean);
    return window.webglGeneratorApi.regenerationLocks.set({kind: "river", id: river.i ?? river.id}, true);
  });
  assert.equal(lock?.ok, true, "锁变化基线写入失败");
  invalidation.patchedAfterLock = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    await app.mapReplicaPatchQueue;
    return structuredClone(app.workerTaskCoordinator.getSessionSnapshot());
  });
  assertSessionContinuity(invalidation.beforeLock, invalidation.patchedAfterLock, {
    label: "lock replica patch",
    revisionDelta: 1,
    checksum: "changed",
    lockFingerprint: "changed"
  });
  assert.equal(invalidation.patchedAfterLock.binding.mapRevision, lock.data?.mapRevisionAfter?.mapRevision, "lock replica patch revision 不符");
  invalidation.afterLock = summarizeResult(await regenerate(page, cdp, "routes"));
  assert.equal(invalidation.afterLock.worker.session.reused, true, "lock replica patch 后未复用 Worker session");
  assert.equal(invalidation.afterLock.worker.session.id, invalidation.adoptedInitial.id, "lock 后 routes session id 漂移");

  invalidation.afterLockCommitted = await readWorkerSessionSnapshot(page);
  assertSessionContinuity(invalidation.patchedAfterLock, invalidation.afterLockCommitted, {
    label: "lock 后 routes",
    revisionDelta: 1,
    checksum: "same",
    lockFingerprint: "same"
  });
  const sessionBeforeMapReplace = invalidation.afterLockCommitted;
  await createMap(page, "worker-session-replace-10k", 10000);
  invalidation.adoptedReplacement = await readWorkerSessionSnapshot(page);
  assertSessionReplacement(sessionBeforeMapReplace, invalidation.adoptedReplacement, "替换地图 generation adoption");
  invalidation.afterMapReplace = summarizeResult(await regenerate(page, cdp, "routes"));
  assert.equal(invalidation.afterMapReplace.worker.session.reused, true, "替换地图后首个 routes 未复用新 generation session");
  assert.equal(invalidation.afterMapReplace.worker.session.id, invalidation.adoptedReplacement.id, "替换地图后 routes 未延续新 generation session id");
  invalidation.afterMapReplaceCommitted = await readWorkerSessionSnapshot(page);
  assertSessionContinuity(invalidation.adoptedReplacement, invalidation.afterMapReplaceCommitted, {
    label: "替换地图后 routes",
    revisionDelta: 1,
    checksum: "same",
    lockFingerprint: "same"
  });

  await createMap(page, "worker-session-river-fault-10k", 10000);
  const fault = {oneShot: null, persistent: [], stagedPersistent: {}, invariants: {persistent: [], stagedPersistent: {}}};
  try {
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.renderer.camera.scale = 1.7;
      app.renderer.camera.offsetX = 0.13;
      app.renderer.camera.offsetY = -0.09;
      const city = (app.map.settlements?.cities || []).find(Boolean);
      if (city) {
        app.selectionStore.setSelection({object: {kind: "city", id: city.id}});
        app.renderer.setObjectHighlights([{kind: "city", id: city.id}]);
      }
      window.__task322FaultPresentation = {
        camera: JSON.stringify(app.renderer.camera),
        selection: JSON.stringify(app.selectionStore.getSnapshot()),
        highlights: JSON.stringify(app.renderer.objectHighlights)
      };
    });
    await installRiverInvariantProbe(page, {dirtyRoutes: true});
    await page.evaluate(() => {
      window.__webglGeneratorWorkerRefreshFault = {kind: "rivers", stage: "after-render", mode: "once", hits: 0};
    });
    fault.oneShot = await expectRefreshFault(page, "once");
    fault.invariants.oneShot = await assertRiverInvariantProbe(page, {label: "one-shot refresh fault", expectedRouteCalls: 0, surfacePatchMode: "preserve"});

    await page.evaluate(() => {
      window.__webglGeneratorWorkerRefreshFault = {kind: "rivers", stage: "after-render", mode: "persistent", hits: 0};
    });
    for (let index = 0; index < 2; index++) {
      fault.persistent.push(await expectRefreshFault(page, `persistent-${index + 1}`));
      fault.invariants.persistent.push(await assertRiverInvariantProbe(page, {label: `persistent refresh fault #${index + 1}`, expectedRouteCalls: 0, surfacePatchMode: "preserve"}));
    }
    for (const stage of ["after-status", "after-panels"]) {
      fault.stagedPersistent[stage] = [];
      fault.invariants.stagedPersistent[stage] = [];
      await page.evaluate(targetStage => {
        window.__webglGeneratorWorkerRefreshFault = {kind: "rivers", stage: targetStage, mode: "persistent", hits: 0};
      }, stage);
      for (let index = 0; index < 2; index++) {
        fault.stagedPersistent[stage].push(await expectRefreshFault(page, `${stage}-persistent-${index + 1}`));
        fault.invariants.stagedPersistent[stage].push(await assertRiverInvariantProbe(page, {label: `${stage} persistent fault #${index + 1}`, expectedRouteCalls: 0, surfacePatchMode: "preserve"}));
      }
    }
    await page.evaluate(() => { delete window.__webglGeneratorWorkerRefreshFault; });
    fault.recovered = summarizeResult(await regenerate(page, cdp, "rivers"));
    assert.equal(fault.recovered.worker.session.reused, false, "refresh fault 后错误复用已失效 session");
    fault.invariants.recovered = await assertRiverInvariantProbe(page, {label: "fault recovery success", expectedRouteCalls: 0, surfacePatchMode: "reset"});
  } finally {
    await page.evaluate(() => {
      delete window.__webglGeneratorWorkerRefreshFault;
      window.__task322RiverProbe?.restore?.();
      delete window.__task322RiverProbe;
    });
  }
  return {noOp, invalidation, fault};
  });
  const {noOp, invalidation, fault} = core;
  if (runNoOpDiagnostic) return {noOp};

  const races = await traceSessionGate(page, consoleDiagnostic, "no-op-late-race", "取消与换图竞态均按既有断言完成", () => runNoOpLateRaceGate(page));
  const atomicBusy = await traceSessionGate(page, consoleDiagnostic, "atomic-busy", "原子窗口正式操作按既有 busy 断言完成", () => runAtomicBusyGate(page));
  const unitPreferences = await traceSessionGate(page, consoleDiagnostic, "unit-preference-replay", "unit-only fault/recovery 按既有断言完成", () => runUnitPreferenceReplayGate(page));
  const politicalDebug = await traceSessionGate(page, consoleDiagnostic, "political-debug", "政治调试 prepared 安装按既有断言完成", () => runPoliticalDebugGate(page, cdp));
  const routePendingFault = await traceSessionGate(page, consoleDiagnostic, "route-pending-fault", "道路 pending refresh fault 按既有断言完成", () => runRoutePendingFaultGate(page));
  const preparedFailClosed = await traceSessionGate(page, consoleDiagnostic, "prepared-fail-closed", "全部 prepared 坏包均在 commit 前拒绝", () => runPreparedFailClosedGate(page));
  const hardCellSurface = await traceSessionGate(page, consoleDiagnostic, "hard-cell-surface", "两格局部 surface range/patch 按实际布局完成", () => runHardCellSurfaceGate(page, cdp));
  const latePan = await traceSessionGate(page, consoleDiagnostic, "late-pan", "prepare 期相机漂移按既有 obsolete 断言完成", () => runLatePanGate(page));
  const committedDisplayReplay = await traceSessionGate(page, consoleDiagnostic, "committed-display-replay", "display replay 按既有 session/LongTask 断言完成", () => runCommittedDisplayReplayGate(page));
  const deferredCoalescing = await traceSessionGate(page, consoleDiagnostic, "deferred-coalescing", "deferred latest-wins 合并按既有断言完成", () => runDeferredCoalescingGate(page));
  const deferredReplayFault = await traceSessionGate(page, consoleDiagnostic, "deferred-unit-fault", "unit replay fault/recovery 按既有断言完成", () => runDeferredReplayFaultGate(page));
  const deferredThemeFault = await traceSessionGate(page, consoleDiagnostic, "deferred-theme-fault", "theme replay fault/recovery 按既有断言完成", () => runDeferredThemeFaultGate(page));
  const committedLateContext = await traceSessionGate(page, consoleDiagnostic, "committed-late-context", "九段 late context 与 rollback 按既有断言完成", () => runCommittedLateContextGate(page));
  const pendingViewport = await traceSessionGate(page, consoleDiagnostic, "pending-viewport", "success/fault pending viewport 按既有断言完成", () => runPendingViewportGate(page));
  return {noOp, invalidation, fault, races, atomicBusy, unitPreferences, politicalDebug, routePendingFault, preparedFailClosed, hardCellSurface, latePan, committedDisplayReplay, deferredCoalescing, deferredReplayFault, deferredThemeFault, committedLateContext, pendingViewport, longTasks: (await readSignals(page)).longTasks};
}

async function runNoOpLateRaceGate(page) {
  const results = {};
  for (const mode of ["cancel", "map-replace"]) {
    await createMap(page, `worker-session-noop-${mode}`, 10000);
    await lockAllRivers(page);
    await installSessionCommitPause(page);
    await clearLongTasks(page);
    const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("rivers", {confirm: true}));
    try {
      await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 120000});
      const interference = mode === "cancel"
        ? await page.evaluate(() => window.__webglGeneratorApp.runtimeOperation.cancelCurrent("task322 no-op late cancel"))
        : await page.evaluate(() => {
            const app = window.__webglGeneratorApp;
            const replacement = {...app.map};
            replacement.metadata = {...(replacement.metadata || {}), seed: "task322-noop-late-replacement"};
            app.map = replacement;
            app.options = replacement.options;
            app.renderer.map = replacement;
            window.__task322LateReplacementMap = replacement;
            return true;
          });
      assert.equal(interference, true, `no-op late ${mode} 干预未生效`);
      await releaseSessionCommitPause(page);
      const response = await pending;
      assert.equal(response?.ok, false, `no-op late ${mode} 仍错误成功`);
      const state = await page.evaluate(() => ({
        replacementRetained: !window.__task322LateReplacementMap || window.__webglGeneratorApp.map === window.__task322LateReplacementMap,
        session: window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot(),
        loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
          + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
      }));
      assert.equal(state.replacementRetained, true, `no-op late ${mode} 覆盖了晚到地图`);
      assert.equal(state.session, null, `no-op late ${mode} 未失效 session`);
      assert.equal(state.loadingVisible, 0, `no-op late ${mode} 未清理 Loading`);
      await assertNoLongTasks(page, `no-op late ${mode}`);
      results[mode] = {error: response.error, state};
    } finally {
      await page.evaluate(() => {
        window.__task322SessionCommitPause?.release?.();
        window.__task322SessionCommitPause?.restore?.();
        delete window.__task322SessionCommitPause;
        delete window.__task322LateReplacementMap;
      });
    }
  }
  return results;
}

async function runAtomicBusyGate(page) {
  await createMap(page, "worker-session-atomic-busy", 10000);
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const rivers = (app.map.rivers?.rivers || []).filter(Boolean);
    if (rivers.length < 2) throw new Error("atomic busy 缺少河流夹具");
    const locked = window.webglGeneratorApi.regenerationLocks.set({kind: "river", id: rivers[0].id ?? rivers[0].i}, true);
    if (!locked?.ok) throw new Error("atomic busy 基线锁写入失败");
    return {
      first: rivers[0].id ?? rivers[0].i,
      second: rivers[1].id ?? rivers[1].i,
      history: app.editHistory.getStats()
    };
  });
  await installOverlayPause(page);
  await clearLongTasks(page);
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("markers", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322OverlayPause?.started === true, null, {timeout: 120000});
    const concurrent = await page.evaluate(second => ({
      edit: window.webglGeneratorApi.regenerationLocks.set({kind: "river", id: second}, true),
      undo: window.webglGeneratorApi.history.undo()
    }), baseline.second);
    assert.equal(concurrent.edit?.ok, false, "atomic window 并发编辑未拒绝");
    assert.equal(concurrent.edit?.error?.code, "operation_busy", "atomic window 并发编辑错误码不符");
    assert.equal(concurrent.undo?.ok, false, "atomic window 并发撤销未拒绝");
    assert.equal(concurrent.undo?.error?.code, "operation_busy", "atomic window 并发撤销错误码不符");
    await releaseOverlayPause(page);
    const response = await pending;
    assert.equal(response?.ok, true, `atomic window 正式操作失败：${response?.error?.message || "unknown"}`);
    assert.equal(response.data?.worker?.session?.committed, true, "atomic window session 未提交");
    const after = await page.evaluate(second => ({
      history: window.__webglGeneratorApp.editHistory.getStats(),
      secondStatus: window.webglGeneratorApi.regenerationLocks.status({kind: "river", id: second})
    }), baseline.second);
    assert.equal(after.history.undo, baseline.history.undo + 1, "atomic window 历史被并发操作污染");
    assert.equal(after.secondStatus?.data?.locked, false, "atomic window 并发锁写入泄漏");
    await assertNoLongTasks(page, "atomic edit/undo busy");
    return {concurrent, historyBefore: baseline.history, historyAfter: after.history};
  } finally {
    await restoreOverlayPause(page);
  }
}

async function runUnitPreferenceReplayGate(page) {
  await createMap(page, "worker-session-unit-obsolete", 10000);
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      units: structuredClone(app.renderer.unitPreferences),
      history: app.editHistory.getStats()
    };
  });
  await installOverlayPause(page);
  await clearLongTasks(page);
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("military", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322OverlayPause?.started === true, null, {timeout: 120000});
    const changed = await page.evaluate(() => {
      const current = window.__webglGeneratorApp.renderer.unitPreferences;
      const militaryScale = Math.max(0.1, Number(current.militaryScale || 1) + 0.75);
      return window.webglGeneratorApi.units.apply({militaryScale});
    });
    assert.equal(changed?.ok, true, "延迟单位切换失败");
    await releaseOverlayPause(page);
    const response = await pending;
    assert.equal(response?.ok, true, `准备阶段单位切换错误阻断 Worker 提交：${response?.error?.message || "unknown"}`);
    assert.equal(response.data?.worker?.session?.committed, true, "准备阶段单位切换后 session 未提交");
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const units = app.renderer.unitPreferences;
      return {
        units: structuredClone(units),
        history: app.editHistory.getStats(),
        itemCount: app.renderer.militaryIconItems.length,
        itemUnits: app.renderer.militaryIconItems.every(item => item.rendererUnitPreferences === units),
        domSameSource: app.renderer.militaryIconItems.every(item => item.node?.isConnected && item.node?.title === item.tooltip && item.node?.getAttribute("aria-label") === item.tooltip)
      };
    });
    assert.notDeepEqual(after.units, baseline.units, "延迟单位切换未保留新偏好");
    assert.equal(after.history.undo, baseline.history.undo + 1, "准备阶段单位切换后未形成唯一历史");
    assert.equal(after.itemUnits, true, "军事 overlay 混用了旧单位偏好");
    assert.equal(after.domSameSource, true, "军事 overlay DOM 与冻结单位结果不同源");
    await assertNoLongTasks(page, "unit preferences replay");
    return {worker: response.data.worker, unitsBefore: baseline.units, unitsAfter: after.units, itemCount: after.itemCount};
  } finally {
    await restoreOverlayPause(page);
  }
}

async function runPoliticalDebugGate(page, cdp) {
  await createMap(page, "worker-session-political-debug", 10000);
  const result = {};
  for (const [mode, kind] of [["states", "states"], ["provinces", "provinces"]]) {
    await page.evaluate(debugMode => window.__webglGeneratorApp.renderer.setPoliticalMeshDebugMode(debugMode), mode);
    const operation = summarizeResult(await regenerate(page, cdp, kind));
    const state = await page.evaluate(expectedMode => {
      const renderer = window.__webglGeneratorApp.renderer;
      const source = renderer.politicalVisualMeshes?.[expectedMode]?.vertices || new Float32Array();
      const sourceBytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      const sourceChecksum = checksumBytes(sourceBytes);
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.politicalMeshDebugBuffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      return {
        mode: renderer.politicalMeshDebugMode,
        vertexCount: renderer.politicalMeshDebugVertexCount,
        sourceVertexCount: source.length / 6,
        byteLength,
        sourceByteLength: source.byteLength,
        checksum: checksumBytes(bytes),
        sourceChecksum
      };

      function checksumBytes(values) {
        let checksum = 2166136261;
        for (const value of values) checksum = Math.imul(checksum ^ value, 16777619) >>> 0;
        return checksum;
      }
    }, mode);
    assert.equal(state.mode, mode, `${mode} political debug mode 丢失`);
    assert.equal(state.vertexCount, state.sourceVertexCount, `${mode} political debug 顶点计数不同源`);
    assert.equal(state.byteLength, state.sourceByteLength, `${mode} political debug GPU 字节数不同源`);
    assert.equal(state.checksum, state.sourceChecksum, `${mode} political debug GPU 内容不同源`);
    result[mode] = {operation, state};
  }
  await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    renderer.setPoliticalMeshDebugMode("none");
    renderer.setViewOptions({smoothCellBorders: true});
  });
  const noneOperation = summarizeResult(await regenerate(page, cdp, "states"));
  const none = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const gl = renderer.gl;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.politicalMeshDebugBuffer);
    const debugGpuBytes = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, previous);
    return {
      mode: renderer.politicalMeshDebugMode,
      smooth: renderer.viewOptions.smoothCellBorders,
      states: renderer.politicalVisualMeshes?.states?.vertices?.byteLength || 0,
      provinces: renderer.politicalVisualMeshes?.provinces?.vertices?.byteLength || 0,
      debugVertexCount: renderer.politicalMeshDebugVertexCount,
      debugGpuBytes
    };
  });
  assert.deepEqual(none, {mode: "none", smooth: true, states: 0, provinces: 0, debugVertexCount: 0, debugGpuBytes: 0}, "debug=none + smooth=true 未保持 empty political meshes 等价");
  result.none = {operation: noneOperation, state: none};
  return result;
}

async function runFocusedPoliticalDebugDiagnostic(page, cdp) {
  await createMap(page, "worker-session-political-debug-diagnostic", 10000);
  const adoptedSession = await readWorkerSessionSnapshot(page);
  assertIdleAdoptedSession(adoptedSession, "political diagnostic generation");
  await installFocusedPoliticalTrace(page);
  const rounds = [];
  try {
    for (const configuration of [
      {label: "states-debug", mode: "states"},
      {label: "states-none-reuse", mode: "none"}
    ]) {
      await page.evaluate(({label, mode}) => {
        const renderer = window.__webglGeneratorApp.renderer;
        renderer.setPoliticalMeshDebugMode(mode);
        renderer.setViewOptions({smoothCellBorders: true});
        window.__task322PoliticalTrace.reset(label);
      }, configuration);
      const rendererPerformanceBefore = await readRendererPerformanceEvents(page);
      await clearLongTasks(page);
      const metricsBefore = indexMetrics(await cdp.send("Performance.getMetrics"));
      const startedAt = Date.now();
      const response = await page.evaluate(() => window.webglGeneratorApi.generate.regenerate("states", {confirm: true}));
      const wallMs = Date.now() - startedAt;
      assert.equal(response?.ok, true, `political diagnostic states 失败：${response?.error?.message || "unknown"}`);
      const result = response.data;
      assert.equal(result?.worker?.mode, "worker", "political diagnostic 未使用 Worker");
      assert.equal(result?.worker?.accepted, true, "political diagnostic Worker 未 accepted");
      assert.equal(result?.worker?.session?.committed, true, "political diagnostic session 未提交");
      assertTelemetry(result.worker.telemetry, `political diagnostic ${configuration.label}`);
      const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
      const browser = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        return {
          longTasks: window.__task322SessionLongTasks.slice(),
          events: window.__task322PoliticalTrace.events.map(event => structuredClone(event))
        };
      });
      const rendererPerformanceAfter = await readRendererPerformanceEvents(page);
      const rendererPerformanceDiff = Object.fromEntries(Object.entries(rendererPerformanceAfter)
        .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(rendererPerformanceBefore[name])));
      const traceSummary = {};
      for (const event of browser.events) {
        const key = `${event.name}:${event.binding || ""}`;
        const entry = traceSummary[key] || {count: 0, totalMs: 0, maxMs: 0, bytes: 0};
        entry.count += 1;
        entry.totalMs = roundMs(entry.totalMs + Number(event.duration || 0));
        entry.maxMs = Math.max(entry.maxMs, roundMs(event.duration));
        entry.bytes += Number(event.bytes || 0);
        traceSummary[key] = entry;
      }
      const round = {
        ...configuration,
        wallMs,
        taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000),
        session: result.worker.session,
        telemetry: result.worker.telemetry,
        renderInstallStages: result.worker.telemetry?.renderInstallStages || {},
        longTasks: browser.longTasks,
        traceEvents: browser.events.filter(event => event.name !== "gl.bufferSubData" || event.duration >= 0.5),
        traceSummary,
        rendererPerformanceDiff
      };
      console.error(`[task322-political-diagnostic] ${JSON.stringify(round, null, 2)}`);
      rounds.push(round);
      await clearLongTasks(page);
    }
    assert.equal(rounds[0].session.reused, true, "political diagnostic 首轮未复用 generation session");
    assert.equal(rounds[1].session.reused, true, "political diagnostic 复轮没有复用 session");
    assert.ok(rounds.every(round => round.session.id === adoptedSession.id), "political diagnostic session id 未连续");
    return {adoptedSession, rounds};
  } finally {
    await page.evaluate(() => {
      window.__task322PoliticalTrace?.restore?.();
      delete window.__task322PoliticalTrace;
    });
  }
}

async function installFocusedPoliticalTrace(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const gl = renderer.gl;
    const originals = [];
    const trace = {
      label: "",
      events: [],
      reset(label) {
        this.label = label;
        this.events.length = 0;
      },
      record(name, startedAt, detail = {}) {
        if (this.events.length >= 4000) return;
        this.events.push({round: this.label, name, startTime: startedAt, endTime: performance.now(), duration: performance.now() - startedAt, ...detail});
      },
      restore() {
        for (let index = originals.length - 1; index >= 0; index--) {
          const {target, name, original} = originals[index];
          target[name] = original;
        }
      }
    };
    const wrap = (target, name, label, detailFactory = null) => {
      const original = target?.[name];
      if (typeof original !== "function") return;
      originals.push({target, name, original});
      target[name] = function(...args) {
        const startedAt = performance.now();
        let result;
        try {
          result = Reflect.apply(original, this, args);
        } catch (error) {
          trace.record(label, startedAt, {failed: true});
          throw error;
        }
        const detail = () => detailFactory?.(args) || {};
        if (result && typeof result.then === "function") {
          return result.then(value => {
            trace.record(label, startedAt, detail());
            return value;
          }, error => {
            trace.record(label, startedAt, {...detail(), failed: true});
            throw error;
          });
        }
        trace.record(label, startedAt, detail());
        return result;
      };
    };
    for (const name of [
      "prepareOverlayBundleFromDescriptors",
      "suspendWorkerRenderInstall",
      "resumeWorkerRenderInstall",
      "updateSelectionBuffer",
      "setObjectHighlights",
      "draw"
    ]) wrap(renderer, name, `renderer.${name}`);
    wrap(renderer.cityIconLayer, "setInstances", "cityIconLayer.setInstances", args => ({items: args[0]?.length || 0}));
    wrap(app.selectionStore, "refresh", "selectionStore.refresh");
    wrap(renderer.overlay, "replaceChildren", "overlay.replaceChildren", args => ({nodes: args.length}));
    let currentArrayBufferBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const originalBindBuffer = gl.bindBuffer;
    originals.push({target: gl, name: "bindBuffer", original: originalBindBuffer});
    gl.bindBuffer = function(target, buffer) {
      const result = Reflect.apply(originalBindBuffer, this, [target, buffer]);
      if (target === gl.ARRAY_BUFFER) currentArrayBufferBinding = buffer;
      return result;
    };
    const bindingName = () => {
      const binding = currentArrayBufferBinding;
      const surfaceSegmentIndex = renderer.surfaceBaseBufferSet?.segments?.findIndex(segment => segment.buffer === binding) ?? -1;
      if (surfaceSegmentIndex >= 0) return `surfaceBaseBufferSet[${surfaceSegmentIndex}]`;
      for (const name of [
        "landCorrectionBuffer", "waterCorrectionBuffer", "landCoverBuffer", "waterCoverBuffer",
        "surfacePatchBuffer", "lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "pointBuffer", "routeBuffer",
        "riverBuffer", "selectionBuffer", "politicalMeshDebugBuffer", "tradeFlowBuffer"
      ]) if (renderer[name] === binding) return name;
      if (renderer.cityIconLayer?.instanceBuffer === binding) return "cityIconLayer.instanceBuffer";
      return "prepared-or-unknown";
    };
    wrap(gl, "bufferData", "gl.bufferData", args => ({binding: bindingName(), bytes: Number(args[1]?.byteLength) || Number(args[1]) || 0}));
    wrap(gl, "bufferSubData", "gl.bufferSubData", args => ({binding: bindingName(), bytes: Number(args[2]?.byteLength) || 0}));
    window.__task322PoliticalTrace = trace;
  });
}

async function runRoutePendingFaultGate(page) {
  await createMap(page, "worker-session-route-pending-fault", 10000);
  const before = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const original = renderer.updateRouteBufferAsync;
    const originalResume = renderer.resumeWorkerRenderInstall;
    const calls = [];
    const gl = renderer.gl;
    const fingerprintBuffer = buffer => {
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {byteLength, checksum};
    };
    const cityLayer = renderer.cityIconLayer;
    const city = {
      instances: cityLayer.instances,
      instanceIndexById: cityLayer.instanceIndexById,
      instanceData: cityLayer.instanceData,
      instanceBuffer: cityLayer.instanceBuffer,
      bufferFingerprint: fingerprintBuffer(cityLayer.instanceBuffer),
      stats: JSON.stringify(cityLayer.stats)
    };
    const probe = {original, originalResume, calls, city, fingerprintBuffer, cityAtResume: null};
    renderer.updateRouteBufferAsync = async function(...args) {
      calls.push({at: performance.now(), version: this.routeRefreshVersion});
      return Reflect.apply(original, this, args);
    };
    renderer.resumeWorkerRenderInstall = function(...args) {
      probe.cityAtResume = {
        sameInstances: cityLayer.instances === city.instances,
        sameIndex: cityLayer.instanceIndexById === city.instanceIndexById,
        sameData: cityLayer.instanceData === city.instanceData,
        sameBuffer: cityLayer.instanceBuffer === city.instanceBuffer,
        bufferFingerprint: fingerprintBuffer(cityLayer.instanceBuffer),
        stats: JSON.stringify(cityLayer.stats)
      };
      return Reflect.apply(originalResume, this, args);
    };
    renderer.scheduleRouteBufferRefresh({delayMs: 60000});
    window.__task322RoutePendingFault = probe;
    window.__webglGeneratorWorkerRefreshFault = {kind: "routes", stage: "after-render", mode: "once", hits: 0};
    return {
      routes: JSON.stringify(app.map.settlements.routes),
      salt: Number(app.map.metadata?.regeneration?.routes) || 0,
      history: app.editHistory.getStats(),
      timer: Boolean(renderer.routeRefreshTimer)
    };
  });
  assert.equal(before.timer, true, "道路故障夹具未建立 pending timer");
  await clearLongTasks(page);
  try {
    const {response, rawError, wrapperCalls} = await evaluateRegenerationWithRawError(page, "routes");
    assert.equal(response?.ok, false, "道路 after-render 故障未拒绝");
    assert.equal(response?.error?.code, "worker_regeneration_refresh_fault", "道路故障公开错误码不符");
    assert.equal(wrapperCalls, 1, `道路故障 action wrapper 调用次数不符：${wrapperCalls}`);
    assert.equal(errorTreeHasCode(rawError, "worker_regeneration_refresh_fault"), true, `道路故障原始 cause 缺少 refresh fault 码：${JSON.stringify(rawError)}`);
    await page.waitForFunction(() => window.__task322RoutePendingFault?.calls?.length > 0 && !window.__webglGeneratorApp.renderer.routeRefreshTimer && !window.__webglGeneratorApp.renderer.routeRefreshActiveVersion, null, {timeout: 120000});
    await assertNoLongTasks(page, "routes pending timer fault");
    await clearLongTasks(page);
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      return {
        routes: JSON.stringify(app.map.settlements.routes),
        salt: Number(app.map.metadata?.regeneration?.routes) || 0,
        history: app.editHistory.getStats(),
        calls: [...window.__task322RoutePendingFault.calls],
        cityRollback: window.__task322RoutePendingFault.cityAtResume,
        cityExpectedBuffer: window.__task322RoutePendingFault.city.bufferFingerprint,
        cityExpectedStats: window.__task322RoutePendingFault.city.stats,
        dirty: app.renderer.dynamicBuffersDirty.routes,
        timer: Boolean(app.renderer.routeRefreshTimer),
        active: Number(app.renderer.routeRefreshActiveVersion) || 0
      };
    });
    assert.equal(after.routes, before.routes, "道路故障未回滚领域");
    assert.equal(after.salt, before.salt, "道路故障未回滚 salt");
    assert.deepEqual(after.history, before.history, "道路故障未回滚历史");
    assert.equal(after.calls.length, 1, "道路故障未恢复唯一 pending refresh");
    assert.equal(after.dirty, false, "恢复的道路 pending refresh 未完成");
    for (const key of ["sameInstances", "sameIndex", "sameData", "sameBuffer"]) assert.equal(after.cityRollback?.[key], true, `道路故障 cityIconLayer 身份未精确回滚：${key}`);
    assert.deepEqual(after.cityRollback?.bufferFingerprint, after.cityExpectedBuffer, "道路故障 cityIcon instanceBuffer 字节未精确回滚");
    assert.equal(after.cityRollback?.stats, after.cityExpectedStats, "道路故障 cityIcon 完整 stats 未精确回滚");
    await discardProbeLongTasks(page);
    return {error: response.error, rawError, before: {salt: before.salt, history: before.history}, after};
  } finally {
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.renderer.cancelScheduledRouteBufferRefresh?.();
      if (window.__task322RoutePendingFault?.original) app.renderer.updateRouteBufferAsync = window.__task322RoutePendingFault.original;
      if (window.__task322RoutePendingFault?.originalResume) app.renderer.resumeWorkerRenderInstall = window.__task322RoutePendingFault.originalResume;
      delete window.__task322RoutePendingFault;
      delete window.__webglGeneratorWorkerRefreshFault;
    });
  }
}

async function runPreparedFailClosedGate(page) {
  await createMap(page, "worker-session-prepared-fail-closed", 10000);
  const cases = [
    {name: "point-vertex-misaligned", kind: "routes", expected: /顶点数组结构无效/u},
    {name: "route-vertex-misaligned", kind: "routes", expected: /顶点数组结构无效/u},
    {name: "route-range-overrun", kind: "routes", expected: /draw range|ranges/u},
    {name: "surface-cell-order", kind: "features", expected: /surface cell range/u},
    {name: "shore-cell-upper-bound", kind: "features", expected: /岸线.*cell ranges/u},
    {name: "political-state-surface-truncated", kind: "features", expected: /political\.states vertex count/u},
    {name: "shore-path-offset-misaligned", kind: "features", expected: /岸线路径顶点缓存偏移无效/u},
    {name: "shore-coastline-path-count", kind: "features", expected: /shore\.coastline/u},
    {name: "labels-count-empty", kind: "features", expected: /标签 .*长度无效/u},
    {name: "picking-offset-terminal", kind: "features", expected: /picking .*offsets 起止无效/u}
  ];
  const results = {};
  for (const fixture of cases) {
    const baseline = await page.evaluate(input => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      if (input.name === "political-state-surface-truncated") renderer.setPoliticalMeshDebugMode("states");
      const patchCell = renderer.cellVisualMesh?.cells?.find(cell => Number.isInteger(cell?.cell))?.cell;
      const patch = Number.isInteger(patchCell) ? renderer.refreshCellSurfacePatchCells([patchCell], {draw: false}) : null;
      if (!patch?.patchVertexCount) throw new Error(`${input.name} 未建立非空 surface patch`);
      const gl = renderer.gl;
      const fingerprint = buffer => {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
        const bytes = new Uint8Array(byteLength);
        if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength, checksum, valid: gl.isBuffer(buffer)};
      };
      const bufferNames = ["landCorrectionBuffer", "waterCorrectionBuffer", "landCoverBuffer", "waterCoverBuffer", "surfacePatchBuffer", "lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "pointBuffer", "routeBuffer", "riverBuffer", "selectionBuffer", "politicalMeshDebugBuffer", "tradeFlowBuffer"];
      const buffers = Object.fromEntries(bufferNames.map(name => [name, {ref: renderer[name], fingerprint: fingerprint(renderer[name])}]));
      buffers.cityIconInstanceBuffer = {ref: renderer.cityIconLayer.instanceBuffer, fingerprint: fingerprint(renderer.cityIconLayer.instanceBuffer)};
      const caches = {};
      for (const name of ["cellVisualMesh", "shoreVisualPaths", "stateVisualPaths", "provinceVisualPaths", "politicalVisualMeshes", "surfaceCellRanges", "shoreSurfaceCellRanges", "shoreLinePathVertices", "shoreLinePathObjectVertices"]) caches[name] = renderer[name];
      const domain = input.kind === "routes"
        ? JSON.stringify({routes: app.map.settlements?.routes, packRoutes: app.map.pack?.routes, packCellRoutes: app.map.pack?.cells?.routes, regeneration: app.map.metadata?.regeneration, summary: app.map.summary})
        : JSON.stringify({features: app.map.features, gridFeatures: app.map.grid?.features, gridCellFeatures: app.map.grid?.cells?.f, packFeatures: app.map.pack?.features, packCellFeatures: app.map.pack?.cells?.f, regeneration: app.map.metadata?.regeneration, summary: app.map.summary});
      const original = app.workerTaskCoordinator;
      const probe = {
        name: input.name,
        kind: input.kind,
        map: app.map,
        topLevel: Object.entries(app.map),
        domain,
        history: app.editHistory.getStats(),
        status: ["regeneration-status", "regeneration-constraint", "app-status"].map(id => {
          const node = document.getElementById(id);
          return [id, node?.textContent || "", Boolean(node?.hidden)];
        }),
        buffers,
        surfaceBase: window.__task322SurfaceBaseProbe.capture(renderer),
        caches,
        picking: renderer.objectPickingIndex,
        labelItems: renderer.labelItems,
        cityIconItems: renderer.cityIconItems,
        markerIconItems: renderer.markerIconItems,
        militaryIconItems: renderer.militaryIconItems,
        overlayEntries: {
          labels: renderer.labelItems.map(item => ({item, node: item.node})),
          cities: renderer.cityIconItems.map(item => ({item, node: item.node, source: item.city})),
          markers: renderer.markerIconItems.map(item => ({item, node: item.node, source: item.marker})),
          military: renderer.militaryIconItems.map(item => ({item, node: item.node, source: item.regiment || item.unit || null}))
        },
        overlayNodes: [...renderer.overlay.childNodes],
        cityLayer: {
          instances: renderer.cityIconLayer.instances,
          index: renderer.cityIconLayer.instanceIndexById,
          data: renderer.cityIconLayer.instanceData,
          stats: JSON.stringify(renderer.cityIconLayer.stats)
        },
        fingerprint,
        original,
        commitCalls: 0,
        tamperCalls: 0
      };
      const wrapped = Object.freeze({
        ...original,
        async run(...args) {
          const output = await original.run(...args);
          if (args[0] !== "regeneration.compute") return output;
          probe.tamperCalls++;
          tamperPrepared(output?.preparedRender?.layers, input.name, app.map.grid.cells.h.length);
          return output;
        },
        commitSession(...args) {
          probe.commitCalls++;
          return original.commitSession(...args);
        }
      });
      probe.wrapped = wrapped;
      probe.restore = () => {
        if (app.workerTaskCoordinator === wrapped) app.workerTaskCoordinator = original;
      };
      app.workerTaskCoordinator = wrapped;
      window.__task322PreparedFailClosed = probe;
      return {domain, history: probe.history, status: probe.status};

      function tamperPrepared(layers, name, gridCellCount) {
        if (!layers) throw new Error(`${name} 缺少 prepared layers`);
        if (name === "point-vertex-misaligned") {
          if (!layers.point) throw new Error(`${name} 缺少 point layer`);
          layers.point.vertices = new Float32Array(1);
          return;
        }
        if (name === "route-vertex-misaligned") {
          if (!layers.route) throw new Error(`${name} 缺少 route layer`);
          layers.route.vertices = new Float32Array(1);
          return;
        }
        if (name === "route-range-overrun") {
          if (!layers.route) throw new Error(`${name} 缺少 route layer`);
          const count = Math.floor(layers.route.vertices.length / 6);
          layers.route.drawRanges = {
            ...layers.route.drawRanges,
            ordinary: {first: 0, count: count + 1}
          };
          return;
        }
        if (name === "surface-cell-order") {
          const ranges = layers.surface?.surfaceCellRanges;
          if (!(ranges instanceof Map) || ranges.size < 2) throw new Error(`${name} 缺少两个 surface ranges`);
          const entries = [...ranges];
          entries[0] = [entries[1][0], entries[0][1]];
          entries[1] = [[...ranges][0][0], entries[1][1]];
          layers.surface.surfaceCellRanges = new Map(entries);
          return;
        }
        if (name === "shore-cell-upper-bound") {
          const rangeGroups = layers.surface?.shoreSurfaceCellRanges;
          for (const key of ["landCorrections", "waterCorrections", "landCovers", "waterCovers"]) {
            const ranges = rangeGroups?.[key];
            if (!(ranges instanceof Map) || !ranges.size) continue;
            const entries = [...ranges];
            entries[0] = [gridCellCount, entries[0][1]];
            rangeGroups[key] = new Map(entries);
            return;
          }
          throw new Error(`${name} 缺少非空 shore range`);
        }
        if (name === "political-state-surface-truncated") {
          const cache = layers.political?.states;
          if (!(cache?.surfaceVertices instanceof Float32Array) || cache.surfaceVertices.length < 18) {
            throw new Error(`${name} 缺少非空 states surface vertices`);
          }
          cache.surfaceVertices = cache.surfaceVertices.slice(0, -18);
          return;
        }
        if (name === "shore-path-offset-misaligned") {
          const cache = layers.line?.shorePathCache;
          if (!(cache?.offsets instanceof Uint32Array) || cache.offsets.length < 3 || cache.offsets[1] < 18) {
            throw new Error(`${name} 缺少可错位的 shore path offset`);
          }
          cache.offsets = new Uint32Array(cache.offsets);
          cache.offsets[1]--;
          return;
        }
        if (name === "shore-coastline-path-count") {
          const coastline = layers.shore?.coastline;
          if (!Number.isSafeInteger(coastline?.pathCount) || !(coastline?.pointOffsets instanceof Uint32Array)) {
            throw new Error(`${name} 缺少 coastline path cache`);
          }
          coastline.pathCount++;
          return;
        }
        if (name === "labels-count-empty") {
          const labels = layers.labels;
          if (!Number.isSafeInteger(labels?.count) || labels.count < 1 || !Array.isArray(labels.ids) || !labels.ids.length) {
            throw new Error(`${name} 缺少非空 labels descriptor`);
          }
          labels.count = 0;
          return;
        }
        if (name === "picking-offset-terminal") {
          const candidates = ["cities", "markers", "military", "routeSegments", "riverSegments"];
          for (const key of candidates) {
            const offsets = layers.picking?.[key]?.offsets;
            if (!(offsets instanceof Uint32Array) || offsets.length < 2 || offsets.at(-1) < 1) continue;
            layers.picking[key].offsets = new Uint32Array(offsets);
            layers.picking[key].offsets[offsets.length - 1]--;
            return;
          }
          throw new Error(`${name} 缺少非空 picking offsets`);
        }
        throw new Error(`未知 prepared tamper：${name}`);
      }
    }, {name: fixture.name, kind: fixture.kind});
    await clearLongTasks(page);
    try {
      const response = await page.evaluate(kind => window.webglGeneratorApi.generate.regenerate(kind, {confirm: true}), fixture.kind);
      assert.equal(response?.ok, false, `${fixture.name} 没有在 commit 前拒绝`);
      assert.match(response?.error?.message || "", fixture.expected, `${fixture.name} 拒绝原因不符`);
      await assertNoLongTasks(page, `prepared fail-closed ${fixture.name}`);
      await clearLongTasks(page);
      const after = await page.evaluate(kind => {
        const app = window.__webglGeneratorApp;
        const renderer = app.renderer;
        const probe = window.__task322PreparedFailClosed;
        const domain = kind === "routes"
          ? JSON.stringify({routes: app.map.settlements?.routes, packRoutes: app.map.pack?.routes, packCellRoutes: app.map.pack?.cells?.routes, regeneration: app.map.metadata?.regeneration, summary: app.map.summary})
          : JSON.stringify({features: app.map.features, gridFeatures: app.map.grid?.features, gridCellFeatures: app.map.grid?.cells?.f, packFeatures: app.map.pack?.features, packCellFeatures: app.map.pack?.cells?.f, regeneration: app.map.metadata?.regeneration, summary: app.map.summary});
        const buffers = {};
        for (const [name, item] of Object.entries(probe.buffers)) {
          const current = name === "cityIconInstanceBuffer" ? renderer.cityIconLayer.instanceBuffer : renderer[name];
          buffers[name] = {sameRef: current === item.ref, fingerprint: probe.fingerprint(current), expected: item.fingerprint};
        }
        const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
        const sameEntries = (items, entries, sourceKey = "") => items.length === entries.length && entries.every((entry, index) => {
          const item = items[index];
          const source = sourceKey ? item?.[sourceKey] || (sourceKey === "regiment" ? item?.unit || null : null) : undefined;
          return item === entry.item && item?.node === entry.node && (!sourceKey || source === entry.source);
        });
        return {
          sameMap: app.map === probe.map && renderer.map === probe.map,
          topLevelExact: Object.keys(app.map).length === probe.topLevel.length && probe.topLevel.every(([key, value]) => app.map[key] === value),
          domain,
          history: app.editHistory.getStats(),
          status: ["regeneration-status", "regeneration-constraint", "app-status"].map(id => {
            const node = document.getElementById(id);
            return [id, node?.textContent || "", Boolean(node?.hidden)];
          }),
          buffers,
          surfaceBase: {
            exact: window.__task322SurfaceBaseProbe.exact(surfaceBase, probe.surfaceBase),
            current: window.__task322SurfaceBaseProbe.summary(surfaceBase),
            expected: window.__task322SurfaceBaseProbe.summary(probe.surfaceBase)
          },
          cachesExact: Object.entries(probe.caches).every(([name, value]) => renderer[name] === value),
          pickingExact: renderer.objectPickingIndex === probe.picking,
          overlaysExact: renderer.labelItems === probe.labelItems
            && renderer.cityIconItems === probe.cityIconItems
            && renderer.markerIconItems === probe.markerIconItems
            && renderer.militaryIconItems === probe.militaryIconItems
            && sameEntries(renderer.labelItems, probe.overlayEntries.labels)
            && sameEntries(renderer.cityIconItems, probe.overlayEntries.cities, "city")
            && sameEntries(renderer.markerIconItems, probe.overlayEntries.markers, "marker")
            && sameEntries(renderer.militaryIconItems, probe.overlayEntries.military, "regiment")
            && probe.overlayNodes.length === renderer.overlay.childNodes.length
            && probe.overlayNodes.every((node, index) => renderer.overlay.childNodes[index] === node),
          cityLayerExact: renderer.cityIconLayer.instances === probe.cityLayer.instances
            && renderer.cityIconLayer.instanceIndexById === probe.cityLayer.index
            && renderer.cityIconLayer.instanceData === probe.cityLayer.data
            && JSON.stringify(renderer.cityIconLayer.stats) === probe.cityLayer.stats,
          commitCalls: probe.commitCalls,
          tamperCalls: probe.tamperCalls,
          session: app.workerTaskCoordinator.getSessionSnapshot(),
          loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
            + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
        };
      }, fixture.kind);
      assert.equal(after.sameMap, true, `${fixture.name} map/renderer ownership 漂移`);
      assert.equal(after.topLevelExact, true, `${fixture.name} 正式 map 顶层引用未回滚`);
      assert.equal(after.domain, baseline.domain, `${fixture.name} 正式领域未回滚`);
      assert.deepEqual(after.history, baseline.history, `${fixture.name} 历史未回滚`);
      assert.deepEqual(after.status, baseline.status, `${fixture.name} 状态区 DOM 未恢复`);
      for (const [name, value] of Object.entries(after.buffers)) {
        assert.equal(value.sameRef, true, `${fixture.name} ${name} GPU 引用变化`);
        assert.deepEqual(value.fingerprint, value.expected, `${fixture.name} ${name} GPU 字节变化`);
      }
      for (const [key, value] of Object.entries(after.surfaceBase.exact)) assert.equal(value, true, `${fixture.name} surface base 未精确保持：${key}`);
      assert.deepEqual(after.surfaceBase.current, after.surfaceBase.expected, `${fixture.name} surface base descriptor/GPU 字节变化`);
      for (const key of ["cachesExact", "pickingExact", "overlaysExact", "cityLayerExact"]) assert.equal(after[key], true, `${fixture.name} ${key} 未精确保持`);
      assert.equal(after.commitCalls, 0, `${fixture.name} 拒绝后仍调用 commitSession`);
      assert.equal(after.tamperCalls, 1, `${fixture.name} prepared tamper 次数不唯一`);
      assert.equal(after.session, null, `${fixture.name} 拒绝后 session 未失效`);
      assert.equal(after.loadingVisible, 0, `${fixture.name} 拒绝后 Loading 未清理`);
      await discardProbeLongTasks(page);
      results[fixture.name] = {error: response.error, commitCalls: after.commitCalls, tamperCalls: after.tamperCalls, buffers: after.buffers};
    } finally {
      await page.evaluate(name => {
        window.__task322PreparedFailClosed?.restore?.();
        delete window.__task322PreparedFailClosed;
        if (name === "political-state-surface-truncated") window.__webglGeneratorApp.renderer.setPoliticalMeshDebugMode("none");
      }, fixture.name);
    }
  }
  return results;
}

async function runHardCellSurfaceGate(page, cdp) {
  await createMap(page, "worker-session-hard-cell-surface", 10000);
  try {
    const baseline = await page.evaluate(async () => {
      const app = window.__webglGeneratorApp;
      const api = window.webglGeneratorApi;
      const originalPreferences = {
        colorMode: app.renderer.colorMode,
        smoothCellBorders: app.renderer.viewOptions.smoothCellBorders !== false,
        showOceanHeight: Boolean(app.renderer.viewOptions.showOceanHeight)
      };
      const original = app.workerTaskCoordinator;
      const probe = {original, originalPreferences, prepared: []};
      window.__task322HardCellSurface = probe;
      const viewResponse = await api.layers.setViewMode("height");
      if (!viewResponse?.ok) throw new Error(`切换高度视图失败：${viewResponse?.error?.message || "unknown"}`);
      const oceanResponse = await api.layers.setShowOceanHeight(false);
      if (!oceanResponse?.ok) throw new Error(`关闭海洋高度着色失败：${oceanResponse?.error?.message || "unknown"}`);
      const response = await api.layers.setSmoothCellBorders(false);
      if (!response?.ok) throw new Error(`关闭 cell 平滑失败：${response?.error?.message || "unknown"}`);
      const wrapped = Object.freeze({
        ...original,
        async run(...args) {
          const output = await original.run(...args);
          if (args[0] === "regeneration.compute") {
            const surface = output?.preparedRender?.layers?.surface;
            probe.prepared.push({
              kind: output?.kind || args[1]?.kind || "",
              mode: surface?.surfaceCellRangesMode,
              ranges: surface?.surfaceCellRanges instanceof Map ? surface.surfaceCellRanges.size : -1,
              floats: surface?.base?.length ?? -1
            });
          }
          return output;
        }
      });
      probe.wrapped = wrapped;
      probe.restore = () => {
        if (app.workerTaskCoordinator === wrapped) app.workerTaskCoordinator = original;
      };
      app.workerTaskCoordinator = wrapped;
      return {
        colorMode: app.renderer.colorMode,
        smooth: app.renderer.viewOptions.smoothCellBorders,
        showOceanHeight: app.renderer.viewOptions.showOceanHeight,
        history: app.editHistory.getStats()
      };
    });
    assert.equal(baseline.colorMode, "height", "hard-cell 门未在 operation 前固定高度视图");
    assert.equal(baseline.smooth, false, "hard-cell 门未在 operation 前正式关闭 cell 平滑");
    assert.equal(baseline.showOceanHeight, false, "hard-cell 门未固定海洋高度着色基线");
    await clearLongTasks(page);
    const adoptedSession = await readWorkerSessionSnapshot(page);
    assertIdleAdoptedSession(adoptedSession, "hard-cell generation");
    const features = summarizeResult(await regenerate(page, cdp, "features"));
    const rivers = summarizeResult(await regenerate(page, cdp, "rivers"));
    assert.equal(features.worker.session.reused, true, "hard-cell features 未复用 generation session");
    assert.equal(rivers.worker.session.reused, true, "hard-cell rivers 未连续复用 session");
    assert.equal(features.worker.session.id, adoptedSession.id, "hard-cell features session id 未延续 generation");
    assert.equal(rivers.worker.session.id, adoptedSession.id, "hard-cell rivers session id 未连续");
    await assertNoLongTasks(page, "hard-cell prepared features + rivers");
    await clearLongTasks(page);
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322HardCellSurface;
      const gl = renderer.gl;
      const fingerprintBytes = bytes => {
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength: bytes.byteLength, checksum};
      };
      probe.fingerprintTyped = values => fingerprintBytes(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
      probe.fingerprintBuffer = buffer => {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
        const bytes = new Uint8Array(byteLength);
        if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        return {...fingerprintBytes(bytes), valid: gl.isBuffer(buffer)};
      };
      probe.base = {
        vertices: renderer.surfaceVertices,
        surfaceBase: window.__task322SurfaceBaseProbe.capture(renderer),
        ranges: renderer.surfaceCellRanges,
        patchBuffer: renderer.surfacePatchBuffer,
        vertexCount: renderer.vertexCount,
        cpu: probe.fingerprintTyped(renderer.surfaceVertices)
      };
      const cells = app.map.grid.cells;
      const candidates = [...cells.i].filter(cell => {
        const height = Number(cells.h[cell]);
        const neighbors = cells.c[cell] || [];
        return height >= 30 && height <= 98 && neighbors.length >= 3 && neighbors.every(neighbor => Number(cells.h[neighbor]) >= 20);
      });
      const first = candidates[0];
      const firstNeighbors = new Set(cells.c[first] || []);
      const second = candidates.find(cell => cell > first && !firstNeighbors.has(cell));
      if (![first, second].every(Number.isInteger)) throw new Error("hard-cell 门缺少两个互不相邻的合法陆地 cell");
      probe.targets = {first, second};
    });
    await discardProbeLongTasks(page);
    const surfaceLayout = await page.evaluate(() => ({
      surfaceRanges: window.__webglGeneratorApp.renderer.surfaceCellRanges.size,
      surfaceFloats: window.__webglGeneratorApp.renderer.surfaceVertices.length,
      prepared: structuredClone(window.__task322HardCellSurface.prepared)
    }));
    if (surfaceLayout.surfaceRanges > 0) {
      assert.deepEqual(
        {ranges: surfaceLayout.surfaceRanges, floats: surfaceLayout.surfaceFloats},
        {ranges: 10004, floats: 694746},
        "hard-cell 已安装完整 grid-cells surface 基线漂移"
      );
      assert.deepEqual(surfaceLayout.prepared, [
        {kind: "features", mode: "grid-cells", ranges: surfaceLayout.surfaceRanges, floats: surfaceLayout.surfaceFloats},
        {kind: "rivers", mode: "grid-cells", ranges: surfaceLayout.surfaceRanges, floats: surfaceLayout.surfaceFloats}
      ], "hard-cell features/rivers prepared surface 未按完整 grid-cells bundle 同源输出");
      const ranged = await runSurfaceRangeHeightGate(page, {
        probeKey: "__task322HardCellSurface",
        label: "hard-cell",
        expectedHistoryUndo: baseline.history.undo + 3
      });
      return {features, rivers, prepared: surfaceLayout.prepared, ...ranged};
    }
    const firstAction = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const api = window.webglGeneratorApi;
      const probe = window.__task322HardCellSurface;
      const gridCell = probe.targets.first;
      const before = Number(app.map.grid.cells.h[gridCell]);
      const originalRefresh = renderer.refreshHeightCells;
      let refreshResult = null;
      renderer.refreshHeightCells = function(...args) {
        refreshResult = Reflect.apply(originalRefresh, this, args);
        return refreshResult;
      };
      let edit;
      try {
        edit = api.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
      } finally {
        renderer.refreshHeightCells = originalRefresh;
      }
      const range = renderer.surfacePatchCellRanges.get(gridCell);
      if (!range) throw new Error("hard-cell 第一格未生成 patch range");
      const bytes = new Uint8Array(
        renderer.surfacePatchVertices.buffer,
        renderer.surfacePatchVertices.byteOffset + range.start * Float32Array.BYTES_PER_ELEMENT,
        (range.end - range.start) * Float32Array.BYTES_PER_ELEMENT
      ).slice();
      probe.firstPatch = {gridCell, range: {...range}, bytes};
      return {
        prepared: structuredClone(probe.prepared),
        edit,
        gridCell,
        before,
        after: Number(app.map.grid.cells.h[gridCell]),
        refreshResult,
        history: app.editHistory.getStats(),
        colorMode: renderer.colorMode,
        smooth: renderer.viewOptions.smoothCellBorders,
        mapCanonical: renderer.map === app.map
      };
    });
    assert.deepEqual(firstAction.prepared.map(item => ({mode: item.mode, ranges: item.ranges})), [
      {mode: "unavailable", ranges: 0},
      {mode: "unavailable", ranges: 0}
    ], "hard-cell features/rivers prepared surface ranges 未按 unavailable + empty 同源输出");
    assert.ok(firstAction.prepared.every(item => item.floats > 0 && item.floats % 18 === 0), "hard-cell prepared surface 顶点结构无效");
    assertHeightPatchAction(firstAction, {
      label: "hard-cell 第一格",
      expectedPatchCells: 1,
      expectedHistoryUndo: baseline.history.undo + 3
    });

    const secondAction = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322HardCellSurface;
      const gridCell = probe.targets.second;
      const before = Number(app.map.grid.cells.h[gridCell]);
      const originalRefresh = renderer.refreshHeightCells;
      let refreshResult = null;
      renderer.refreshHeightCells = function(...args) {
        refreshResult = Reflect.apply(originalRefresh, this, args);
        return refreshResult;
      };
      let edit;
      try {
        edit = window.webglGeneratorApi.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
      } finally {
        renderer.refreshHeightCells = originalRefresh;
      }
      const firstRange = renderer.surfacePatchCellRanges.get(probe.firstPatch.gridCell);
      const firstBytes = firstRange ? new Uint8Array(
        renderer.surfacePatchVertices.buffer,
        renderer.surfacePatchVertices.byteOffset + firstRange.start * Float32Array.BYTES_PER_ELEMENT,
        (firstRange.end - firstRange.start) * Float32Array.BYTES_PER_ELEMENT
      ) : null;
      const firstBytesPreserved = firstBytes?.length === probe.firstPatch.bytes.length
        && firstBytes.every((value, index) => value === probe.firstPatch.bytes[index]);
      return {
        edit,
        gridCell,
        before,
        after: Number(app.map.grid.cells.h[gridCell]),
        refreshResult,
        history: app.editHistory.getStats(),
        colorMode: renderer.colorMode,
        smooth: renderer.viewOptions.smoothCellBorders,
        mapCanonical: renderer.map === app.map,
        patchRanges: renderer.surfacePatchCellRanges.size,
        patchCells: renderer.surfacePatchCells.size,
        firstRange: firstRange ? {...firstRange} : null,
        firstBytesPreserved
      };
    });
    assertHeightPatchAction(secondAction, {
      label: "hard-cell 第二格",
      expectedPatchCells: 2,
      expectedHistoryUndo: baseline.history.undo + 4
    });
    assert.equal(secondAction.patchRanges, 2, "hard-cell 第二格后 patch ranges 未累积为 2");
    assert.equal(secondAction.patchCells, 2, "hard-cell 第二格后 patch cells 未累积为 2");
    assert.deepEqual(secondAction.firstRange, await page.evaluate(() => ({...window.__task322HardCellSurface.firstPatch.range})), "hard-cell 第二格改写第一格 range");
    assert.equal(secondAction.firstBytesPreserved, true, "hard-cell 第二格改写第一格最终 patch 字节");
    await assertNoLongTasks(page, "hard-cell two same-side local height patches");
    await clearLongTasks(page);
    const state = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322HardCellSurface;
      const firstRange = renderer.surfacePatchCellRanges.get(probe.firstPatch.gridCell);
      const firstBytes = firstRange ? new Uint8Array(
        renderer.surfacePatchVertices.buffer,
        renderer.surfacePatchVertices.byteOffset + firstRange.start * Float32Array.BYTES_PER_ELEMENT,
        (firstRange.end - firstRange.start) * Float32Array.BYTES_PER_ELEMENT
      ) : null;
      const firstBytesPreserved = firstBytes?.length === probe.firstPatch.bytes.length
        && firstBytes.every((value, index) => value === probe.firstPatch.bytes[index]);
      const heightColor = height => {
        const ramp = renderer.viewOptions.visualTheme?.terrain?.heightRamp || [];
        for (let index = 1; index < ramp.length; index++) {
          const [previousHeight, previousColor] = ramp[index - 1];
          const [nextHeight, nextColor] = ramp[index];
          if (height > nextHeight) continue;
          const ratio = Math.max(0, Math.min(1, (height - previousHeight) / Math.max(1, nextHeight - previousHeight)));
          return previousColor.map((value, component) => value + (nextColor[component] - value) * ratio);
        }
        return ramp.at(-1)?.[1] || [];
      };
      let targetColorsMatch = true;
      let targetSidesMatch = true;
      const targetSamples = [];
      for (const target of Object.values(probe.targets)) {
        const range = renderer.surfacePatchCellRanges.get(target);
        const values = range ? renderer.surfacePatchVertices.subarray(range.start, range.end) : new Float32Array();
        const expected = heightColor(Number(app.map.grid.cells.h[target]));
        if (!values.length || !expected.length) targetColorsMatch = false;
        for (let offset = 0; offset < values.length; offset += 6) {
          if (![0, 1, 2].every(index => Math.abs(values[offset + 2 + index] - Number(expected[index])) <= 1e-6)) targetColorsMatch = false;
          if (values[offset + 5] !== 0.25) targetSidesMatch = false;
        }
        targetSamples.push({target, range: range ? {...range} : null, height: Number(app.map.grid.cells.h[target]), actual: values.length ? Array.from(values.slice(2, 6)) : [], expected});
      }
      const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
      return {
        base: {
          sameVertices: renderer.surfaceVertices === probe.base.vertices,
          exactSurfaceBase: window.__task322SurfaceBaseProbe.exact(surfaceBase, probe.base.surfaceBase),
          surfaceBase: window.__task322SurfaceBaseProbe.summary(surfaceBase),
          expectedSurfaceBase: window.__task322SurfaceBaseProbe.summary(probe.base.surfaceBase),
          sameRanges: renderer.surfaceCellRanges === probe.base.ranges,
          ranges: renderer.surfaceCellRanges?.size ?? -1,
          vertexCount: renderer.vertexCount,
          expectedVertexCount: probe.base.vertexCount,
          cpu: probe.fingerprintTyped(renderer.surfaceVertices),
          expectedCpu: probe.base.cpu
        },
        patch: {
          sameBuffer: renderer.surfacePatchBuffer === probe.base.patchBuffer,
          ranges: renderer.surfacePatchCellRanges?.size ?? -1,
          cells: renderer.surfacePatchCells?.size ?? -1,
          containsTargets: Object.values(probe.targets).every(cell => renderer.surfacePatchCells?.has(cell) === true),
          floats: renderer.surfacePatchVertices?.length ?? -1,
          vertexCount: renderer.surfacePatchVertexCount,
          cpu: probe.fingerprintTyped(renderer.surfacePatchVertices),
          gpu: probe.fingerprintBuffer(renderer.surfacePatchBuffer),
          firstRange: firstRange ? {...firstRange} : null,
          firstBytesPreserved,
          targetColorsMatch,
          targetSidesMatch,
          targetSamples
        }
      };
    });
    for (const key of ["sameVertices", "sameRanges"]) assert.equal(state.base[key], true, `hard-cell base 身份变化：${key}`);
    for (const [key, value] of Object.entries(state.base.exactSurfaceBase)) assert.equal(value, true, `hard-cell base set 身份/字节变化：${key}`);
    assert.deepEqual(state.base.surfaceBase, state.base.expectedSurfaceBase, "hard-cell base segment descriptor/GPU 字节变化");
    assert.equal(state.base.ranges, 0, "hard-cell patch 后正式 surfaceCellRanges 不再为空");
    assert.equal(state.base.vertexCount, state.base.expectedVertexCount, "hard-cell patch 改写 base vertexCount");
    assert.deepEqual(state.base.cpu, state.base.expectedCpu, "hard-cell patch 改写 base CPU 字节");
    assert.equal(state.base.surfaceBase.aggregate.byteLength, state.base.cpu.byteLength, "hard-cell base GPU 总字节与 CPU source 不符");
    assert.equal(state.patch.sameBuffer, true, "hard-cell patch 替换了正式 patch GPU buffer");
    assert.equal(state.patch.ranges, 2, "hard-cell raw patch ranges 数量不符");
    assert.equal(state.patch.cells, 2, "hard-cell raw patch cells 数量不符");
    assert.equal(state.patch.containsTargets, true, "hard-cell raw patch 未登记全部目标 cell");
    assert.ok(state.patch.floats > 0 && state.patch.floats % 18 === 0, "hard-cell raw patch 顶点结构无效");
    assert.equal(state.patch.vertexCount * 6, state.patch.floats, "hard-cell raw patch vertexCount 不同源");
    assert.deepEqual(state.patch.firstRange, await page.evaluate(() => ({...window.__task322HardCellSurface.firstPatch.range})), "hard-cell 第二格后第一格 range 漂移");
    assert.equal(state.patch.firstBytesPreserved, true, "hard-cell 第二格后第一格 patch 字节漂移");
    assert.equal(state.patch.targetColorsMatch, true, `hard-cell raw patch 颜色不同源：${JSON.stringify(state.patch.targetSamples)}`);
    assert.equal(state.patch.targetSidesMatch, true, "hard-cell 同侧 raw patch side alpha 不是 land");
    assert.equal(state.patch.gpu.valid, true, "hard-cell patch GPU buffer 已删除");
    assert.deepEqual({byteLength: state.patch.cpu.byteLength, checksum: state.patch.cpu.checksum}, {byteLength: state.patch.gpu.byteLength, checksum: state.patch.gpu.checksum}, "hard-cell patch CPU/GPU 字节不同源");
    await discardProbeLongTasks(page);
    const restored = await page.evaluate(async () => {
      const probe = window.__task322HardCellSurface;
      const api = window.webglGeneratorApi;
      return {
        smooth: await api.layers.setSmoothCellBorders(probe.originalPreferences.smoothCellBorders),
        ocean: await api.layers.setShowOceanHeight(probe.originalPreferences.showOceanHeight),
        mode: await api.layers.setViewMode(probe.originalPreferences.colorMode)
      };
    });
    assert.equal(restored.smooth?.ok, true, restored.smooth?.error?.message || "hard-cell 门恢复 cell 平滑失败");
    assert.equal(restored.ocean?.ok, true, restored.ocean?.error?.message || "hard-cell 门恢复海洋高度着色失败");
    assert.equal(restored.mode?.ok, true, restored.mode?.error?.message || "hard-cell 门恢复视图模式失败");
    await discardProbeLongTasks(page);
    return {
      features,
      rivers,
      prepared: firstAction.prepared,
      height: {
        first: {gridCell: firstAction.gridCell, before: firstAction.before, after: firstAction.after, refreshResult: firstAction.refreshResult},
        second: {gridCell: secondAction.gridCell, before: secondAction.before, after: secondAction.after, refreshResult: secondAction.refreshResult}
      },
      base: state.base,
      patch: state.patch
    };
  } finally {
    await page.evaluate(async () => {
      const probe = window.__task322HardCellSurface;
      probe?.restore?.();
      if (probe?.originalPreferences) {
        const api = window.webglGeneratorApi;
        const renderer = window.__webglGeneratorApp?.renderer;
        if ((renderer?.viewOptions?.smoothCellBorders !== false) !== probe.originalPreferences.smoothCellBorders) {
          await api.layers.setSmoothCellBorders(probe.originalPreferences.smoothCellBorders);
        }
        if (Boolean(renderer?.viewOptions?.showOceanHeight) !== probe.originalPreferences.showOceanHeight) {
          await api.layers.setShowOceanHeight(probe.originalPreferences.showOceanHeight);
        }
        if (renderer?.colorMode !== probe.originalPreferences.colorMode) {
          await api.layers.setViewMode(probe.originalPreferences.colorMode);
        }
      }
      delete window.__task322HardCellSurface;
    });
  }
}

function assertHeightPatchAction(action, {label, expectedPatchCells, expectedHistoryUndo}) {
  assert.equal(action.edit?.ok, true, action.edit?.error?.message || `${label}高度局部编辑失败`);
  assert.equal(action.edit?.data?.executed ?? action.edit?.executed, true, `${label}高度局部编辑未执行`);
  assert.equal(action.after, action.before + 1, `${label}高度局部编辑未落图`);
  for (const key of ["incremental", "surfacePatch", "hardCells"]) assert.equal(action.refreshResult?.[key], true, `${label}局部 patch 缺少 ${key}`);
  assert.equal(action.refreshResult?.cells, 1, `${label}高度 patch changed cell 数不符`);
  assert.equal(action.refreshResult?.patchCells, expectedPatchCells, `${label}高度 patch union cell 数不符`);
  assert.equal(action.refreshResult?.spans, 1, `${label}高度 patch bufferData span 数不符`);
  assert.equal(action.colorMode, "height", `${label}高度编辑时视图模式漂移`);
  assert.equal(action.smooth, false, `${label}高度编辑后偏好漂移`);
  assert.equal(action.mapCanonical, true, `${label}高度编辑后 renderer.map 不同源`);
  assert.equal(action.history.undo, expectedHistoryUndo, `${label}历史深度不符`);
}

async function runSurfaceRangeHeightGate(page, {probeKey, label, expectedHistoryUndo, operationBudgetMs = null, requireSegmented = false}) {
  const setup = await page.evaluate(probeKey => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const probe = window[probeKey];
    if (!probe) throw new Error(`${probeKey} range probe 缺失`);
    probe.rangeBase = {
      surfaceVertices: renderer.surfaceVertices,
      surfaceCellRanges: renderer.surfaceCellRanges,
      surfaceBase: window.__task322SurfaceBaseProbe.capture(renderer),
      vertexCount: renderer.vertexCount,
      byteLength: renderer.surfaceVertices.byteLength,
      patchVertices: renderer.surfacePatchVertices,
      patchCellRanges: renderer.surfacePatchCellRanges,
      patchCells: renderer.surfacePatchCells,
      patchBuffer: renderer.surfacePatchBuffer
    };
    return {
      ranges: renderer.surfaceCellRanges.size,
      targets: {...probe.targets},
      patchRanges: renderer.surfacePatchCellRanges.size,
      patchCells: renderer.surfacePatchCells.size,
      segmentCount: probe.rangeBase.surfaceBase.segments.length
    };
  }, probeKey);
  assert.ok(setup.ranges > 0, `${label} range 路径没有正式 surfaceCellRanges`);
  assert.deepEqual({ranges: setup.patchRanges, cells: setup.patchCells}, {ranges: 0, cells: 0}, `${label} range 路径初态混入 hard-cell patch`);
  if (requireSegmented) assert.ok(setup.segmentCount > 1, `${label} surface 未实际分段：${setup.segmentCount}`);
  await discardProbeLongTasks(page);
  await clearLongTasks(page);

  const actions = [];
  for (const [index, targetName] of ["first", "second"].entries()) {
    const action = await page.evaluate(({probeKey, targetName}) => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window[probeKey];
      const gridCell = probe.targets[targetName];
      const before = Number(app.map.grid.cells.h[gridCell]);
      const rangeBefore = renderer.surfaceCellRanges.get(gridCell);
      if (!rangeBefore) throw new Error(`${probeKey} ${targetName} 缺少 base range`);
      const beforeValues = renderer.surfaceVertices.slice(rangeBefore.start, rangeBefore.end);
      const originalRefresh = renderer.refreshHeightCells;
      let refreshResult = null;
      renderer.refreshHeightCells = function(...args) {
        refreshResult = Reflect.apply(originalRefresh, this, args);
        return refreshResult;
      };
      let edit;
      const startedAt = performance.now();
      try {
        edit = window.webglGeneratorApi.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
      } finally {
        renderer.refreshHeightCells = originalRefresh;
      }
      const operationMs = performance.now() - startedAt;
      const rangeAfter = renderer.surfaceCellRanges.get(gridCell);
      const afterValues = rangeAfter ? renderer.surfaceVertices.slice(rangeAfter.start, rangeAfter.end) : new Float32Array();
      const expectedColor = (() => {
        const height = Number(app.map.grid.cells.h[gridCell]);
        const ramp = renderer.viewOptions.visualTheme?.terrain?.heightRamp || [];
        for (let rampIndex = 1; rampIndex < ramp.length; rampIndex++) {
          const [previousHeight, previousColor] = ramp[rampIndex - 1];
          const [nextHeight, nextColor] = ramp[rampIndex];
          if (height > nextHeight) continue;
          const ratio = Math.max(0, Math.min(1, (height - previousHeight) / Math.max(1, nextHeight - previousHeight)));
          return previousColor.map((value, component) => value + (nextColor[component] - value) * ratio);
        }
        return ramp.at(-1)?.[1] || [];
      })();
      let positionsAndSidePreserved = beforeValues.length === afterValues.length;
      let colorMatches = afterValues.length > 0 && expectedColor.length >= 3;
      let targetChanged = false;
      const cpuColors = [];
      for (let offset = 0; offset < afterValues.length; offset += 6) {
        positionsAndSidePreserved &&= beforeValues[offset] === afterValues[offset]
          && beforeValues[offset + 1] === afterValues[offset + 1]
          && beforeValues[offset + 5] === afterValues[offset + 5]
          && afterValues[offset + 5] === 0.25;
        for (let component = 0; component < 3; component++) {
          const value = afterValues[offset + 2 + component];
          cpuColors.push(value);
          colorMatches &&= Math.abs(value - Number(expectedColor[component])) <= 1e-6;
          if (value !== beforeValues[offset + 2 + component]) targetChanged = true;
        }
      }
      const gl = renderer.gl;
      const readGpuColors = range => {
        const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        const colors = [];
        try {
          for (const segment of renderer.surfaceBaseBufferSet.segments) {
            const start = Math.max(range.start, segment.floatStart);
            const end = Math.min(range.end, segment.floatEnd);
            if (end <= start) continue;
            if (start % 6 !== 0 || end % 6 !== 0) throw new Error(`${probeKey} base range 未按 vertex 对齐`);
            const vertexOffset = (start - segment.floatStart) / 6;
            const vertexCount = (end - start) / 6;
            const values = new Float32Array(vertexCount * 3);
            gl.bindBuffer(gl.ARRAY_BUFFER, segment.colorBuffer);
            gl.getBufferSubData(gl.ARRAY_BUFFER, vertexOffset * 3 * Float32Array.BYTES_PER_ELEMENT, values);
            colors.push(...values);
          }
        } finally {
          gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);
        }
        return colors;
      };
      const gpuColors = readGpuColors(rangeAfter);
      const gpuMatchesCpu = gpuColors.length === cpuColors.length
        && gpuColors.every((value, colorIndex) => Math.abs(value - cpuColors[colorIndex]) <= 1e-6);
      const currentFirstRange = renderer.surfaceCellRanges.get(probe.targets.first);
      const firstRangePreserved = targetName === "first" || (currentFirstRange?.start === probe.rangeFirst?.range?.start && currentFirstRange?.end === probe.rangeFirst?.range?.end);
      const firstCpuPreserved = targetName === "first" || (firstRangePreserved
        && probe.rangeFirst.values.every((value, valueIndex) => value === renderer.surfaceVertices[currentFirstRange.start + valueIndex]));
      const currentFirstGpuColors = targetName === "first" ? gpuColors : currentFirstRange ? readGpuColors(currentFirstRange) : [];
      const firstGpuPreserved = targetName === "first" || (firstRangePreserved
        && currentFirstGpuColors.length === probe.rangeFirst.gpuColors.length
        && probe.rangeFirst.gpuColors.every((value, valueIndex) => value === currentFirstGpuColors[valueIndex]));
      if (targetName === "first") {
        probe.rangeFirst = {range: {...rangeAfter}, values: afterValues.slice(), gpuColors: Float32Array.from(gpuColors)};
      }
      return {
        edit,
        gridCell,
        before,
        after: Number(app.map.grid.cells.h[gridCell]),
        refreshResult,
        operationMs,
        history: app.editHistory.getStats(),
        colorMode: renderer.colorMode,
        smooth: renderer.viewOptions.smoothCellBorders,
        mapCanonical: renderer.map === app.map,
        rangeBefore: {...rangeBefore},
        rangeAfter: rangeAfter ? {...rangeAfter} : null,
        targetChanged,
        positionsAndSidePreserved,
        colorMatches,
        gpuMatchesCpu,
        firstRangePreserved,
        firstCpuPreserved,
        firstGpuPreserved,
        sameVertices: renderer.surfaceVertices === probe.rangeBase.surfaceVertices,
        sameRanges: renderer.surfaceCellRanges === probe.rangeBase.surfaceCellRanges,
        sameVertexCount: renderer.vertexCount === probe.rangeBase.vertexCount,
        sameByteLength: renderer.surfaceVertices.byteLength === probe.rangeBase.byteLength,
        patchRanges: renderer.surfacePatchCellRanges.size,
        patchCells: renderer.surfacePatchCells.size,
        samePatchVertices: renderer.surfacePatchVertices === probe.rangeBase.patchVertices,
        samePatchRanges: renderer.surfacePatchCellRanges === probe.rangeBase.patchCellRanges,
        samePatchCells: renderer.surfacePatchCells === probe.rangeBase.patchCells,
        samePatchBuffer: renderer.surfacePatchBuffer === probe.rangeBase.patchBuffer
      };
    }, {probeKey, targetName});
    assert.equal(action.edit?.ok, true, action.edit?.error?.message || `${label} ${targetName} base-range 高度编辑失败`);
    assert.equal(action.edit?.data?.executed ?? action.edit?.executed, true, `${label} ${targetName} base-range 高度编辑未执行`);
    assert.equal(action.after, action.before + 1, `${label} ${targetName} base-range 高度编辑未落图`);
    assert.equal(action.refreshResult?.incremental, true, `${label} ${targetName} 未走增量刷新`);
    assert.equal(action.refreshResult?.cells, 1, `${label} ${targetName} changed cell 数不符`);
    assert.equal(action.refreshResult?.spans, 1, `${label} ${targetName} base upload span 数不符`);
    assert.equal(action.refreshResult?.shoreSpans, 0, `${label} ${targetName} 同侧编辑产生 shore span`);
    assert.notEqual(action.refreshResult?.surfacePatch, true, `${label} ${targetName} 错走 surface patch`);
    assert.notEqual(action.refreshResult?.hardCells, true, `${label} ${targetName} 错走 hard-cell patch`);
    assert.deepEqual(action.rangeAfter, action.rangeBefore, `${label} ${targetName} base range 漂移`);
    assert.equal(action.targetChanged, true, `${label} ${targetName} base range 颜色字节未变化`);
    assert.equal(action.positionsAndSidePreserved, true, `${label} ${targetName} 改写位置或 land side`);
    assert.equal(action.colorMatches, true, `${label} ${targetName} base range 颜色与 height ramp 不同源`);
    assert.equal(action.gpuMatchesCpu, true, `${label} ${targetName} base range CPU/GPU 颜色不同源`);
    assert.equal(action.firstRangePreserved, true, `${label} 第二格改写第一格 base range descriptor`);
    assert.equal(action.firstCpuPreserved, true, `${label} 第二格改写第一格 base range CPU`);
    assert.equal(action.firstGpuPreserved, true, `${label} 第二格改写第一格 base range color GPU`);
    for (const key of ["sameVertices", "sameRanges", "sameVertexCount", "sameByteLength", "samePatchVertices", "samePatchRanges", "samePatchCells", "samePatchBuffer"]) {
      assert.equal(action[key], true, `${label} ${targetName} 身份变化：${key}`);
    }
    assert.deepEqual({ranges: action.patchRanges, cells: action.patchCells}, {ranges: 0, cells: 0}, `${label} ${targetName} base-range 路径生成 patch`);
    assert.equal(action.colorMode, "height", `${label} ${targetName} 高度编辑时视图模式漂移`);
    assert.equal(action.smooth, false, `${label} ${targetName} 高度编辑后偏好漂移`);
    assert.equal(action.mapCanonical, true, `${label} ${targetName} 高度编辑后 renderer.map 不同源`);
    assert.equal(action.history.undo, expectedHistoryUndo + index, `${label} ${targetName} 历史深度不符`);
    if (operationBudgetMs != null) assert.ok(Number(action.operationMs) < operationBudgetMs, `${label} ${targetName} 正式高度操作超预算：${action.operationMs}ms`);
    actions.push(action);
  }

  await assertNoLongTasks(page, `${label} two same-side base ranges`);
  await clearLongTasks(page);
  const state = await page.evaluate(probeKey => {
    const renderer = window.__webglGeneratorApp.renderer;
    const probe = window[probeKey];
    const current = window.__task322SurfaceBaseProbe.capture(renderer);
    const before = probe.rangeBase.surfaceBase;
    return {
      surfaceBase: window.__task322SurfaceBaseProbe.summary(current),
      expectedSurfaceBase: window.__task322SurfaceBaseProbe.summary(before),
      exact: window.__task322SurfaceBaseProbe.exact(current, before),
      ownerChanged: current.setRef.owner !== before.setRef.owner,
      ownerMatchesRenderer: current.setRef.owner === renderer.surfaceResourceOwner,
      bindingOwnerMatchesRenderer: renderer.surfaceResourceBinding?.owner === renderer.surfaceResourceOwner,
      geometryBytesStable: current.segments.length === before.segments.length
        && current.segments.every((segment, segmentIndex) => segment.gpu.geometry.byteLength === before.segments[segmentIndex].gpu.geometry.byteLength
          && segment.gpu.geometry.checksum === before.segments[segmentIndex].gpu.geometry.checksum),
      colorBytesChanged: current.segments.some((segment, segmentIndex) => segment.gpu.color.checksum !== before.segments[segmentIndex].gpu.color.checksum),
      ranges: renderer.surfaceCellRanges.size,
      patchRanges: renderer.surfacePatchCellRanges.size,
      patchCells: renderer.surfacePatchCells.size,
      aggregateMatchesCpuByteLength: current.aggregate.byteLength === renderer.surfaceVertices.byteLength
    };
  }, probeKey);
  for (const key of ["set", "segments"]) assert.equal(state.exact[key], false, `${label} 最终 base owner rebind 未换代 ${key} wrapper`);
  for (const key of ["alias", "descriptorRefs", "descriptors", "valid"]) assert.equal(state.exact[key], true, `${label} 最终 base 物理资源/descriptor 变化：${key}`);
  for (const key of ["ownerChanged", "ownerMatchesRenderer", "bindingOwnerMatchesRenderer"]) assert.equal(state[key], true, `${label} 最终 base owner 换代无效：${key}`);
  assert.equal(state.geometryBytesStable, true, `${label} base-range 颜色更新改写 geometry GPU`);
  assert.equal(state.colorBytesChanged, true, `${label} base-range 颜色更新未落入 color GPU`);
  assert.equal(state.ranges, setup.ranges, `${label} 最终 surfaceCellRanges 数量漂移`);
  assert.deepEqual({ranges: state.patchRanges, cells: state.patchCells}, {ranges: 0, cells: 0}, `${label} 最终混入 hard-cell patch`);
  assert.equal(state.aggregateMatchesCpuByteLength, true, `${label} base GPU 总字节与 CPU source 不符`);
  if (requireSegmented) {
    assert.equal(state.surfaceBase.segmentCount, state.surfaceBase.expectedSegmentCount, `${label} surface GPU count 与 ceil 公式不符`);
    assert.ok(state.surfaceBase.segments.every(segment => segment.byteLength <= 8 * 1024 * 1024 && segment.floatStart % 18 === 0 && segment.floatEnd % 18 === 0), `${label} surface segment 超过8MiB或未按18-float对齐`);
  }
  await discardProbeLongTasks(page);
  return {
    surfacePath: "base-ranges",
    height: {
      first: {gridCell: actions[0].gridCell, before: actions[0].before, after: actions[0].after, refreshResult: actions[0].refreshResult, operationMs: actions[0].operationMs},
      second: {gridCell: actions[1].gridCell, before: actions[1].before, after: actions[1].after, refreshResult: actions[1].refreshResult, operationMs: actions[1].operationMs}
    },
    base: state,
    patch: {ranges: state.patchRanges, cells: state.patchCells}
  };
}

async function runLatePanGate(page) {
  await createMap(page, "worker-session-late-pan", 10000);
  await installOverlayPause(page);
  await clearLongTasks(page);
  const initial = await page.evaluate(() => JSON.stringify(window.__webglGeneratorApp.renderer.camera));
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("markers", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322OverlayPause?.started === true, null, {timeout: 120000});
    const moved = await page.evaluate(() => {
      const canvas = document.getElementById("map-canvas");
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent("wheel", {
        deltaY: -360,
        clientX: rect.left + rect.width * 0.63,
        clientY: rect.top + rect.height * 0.41,
        bubbles: true,
        cancelable: true
      }));
      return JSON.stringify(window.__webglGeneratorApp.renderer.camera);
    });
    assert.notEqual(moved, initial, "late-pan 夹具未改变 camera");
    await releaseOverlayPause(page);
    const response = await pending;
    assert.equal(response?.ok, false, "late-pan 后过期 Worker 结果仍提交");
    assert.equal(response?.error?.code, "operation_obsolete", "late-pan 过期结果没有按 expected obsolete 返回");
    assert.equal(response?.error?.details?.internalCode, "render-overlay-preparation-obsolete", "late-pan 没有保留底层 overlay obsolete 诊断码");
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      camera: JSON.stringify(window.__webglGeneratorApp.renderer.camera),
      overlayCamera: JSON.stringify(window.__webglGeneratorApp.renderer.overlayCommittedCamera),
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
    }));
    assert.equal(after.camera, moved, "late-pan 最终 camera 被回滚覆盖");
    assert.equal(after.loadingVisible, 0, "late-pan 后 Loading 未清理");
    await assertNoLongTasks(page, "late pan");
    return {error: response.error, initial: JSON.parse(initial), final: JSON.parse(after.camera), overlayCamera: JSON.parse(after.overlayCamera)};
  } finally {
    await restoreOverlayPause(page);
  }
}

async function runCommittedDisplayReplayGate(page, diagnostic = null) {
  await createMap(page, "worker-session-committed-display-replay", 10000);
  if (diagnostic) await captureCommittedDisplayDiagnosticSnapshot(page, diagnostic.cdp, diagnostic.browserCdp, "new-map-stable");
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const themes = window.webglGeneratorApi.layers.listThemes();
    const currentTheme = themes?.data?.current || renderer.visualTheme?.id || "default";
    const alternateTheme = (themes?.data?.themes || []).map(item => item.value || item.id).find(value => value && value !== currentTheme);
    if (!alternateTheme) throw new Error("display replay 缺少可切换主题");
    const current = app.map.oceanCurrents?.currents?.find(Boolean);
    if (!current) throw new Error("display replay 缺少洋流高亮夹具");
    const currentOceanId = String(current.id ?? current.i);
    renderer.setLayerVisible("oceanCurrents", true);
    renderer.setOceanCurrentHighlights([currentOceanId]);
    return {
      history: app.editHistory.getStats(),
      alternateTheme,
      units: {...renderer.unitPreferences, militaryScale: Math.max(0.1, Number(renderer.unitPreferences.militaryScale || 1) + 0.625)},
      debug: renderer.politicalMeshDebugMode === "provinces" ? "states" : "provinces",
      routesVisible: !(renderer.layerVisibility.routes !== false),
      colorMode: renderer.colorMode === "height" ? "states" : "height",
      showOceanHeight: !Boolean(renderer.viewOptions.showOceanHeight),
      smoothCellBorders: !Boolean(renderer.viewOptions.smoothCellBorders),
      maxCityLabels: Math.max(8, Number(renderer.labelOptions.maxCityLabels || 128) + 7),
      oceanIds: [currentOceanId]
    };
  });
  await installSessionCommitPause(page);
  await clearLongTasks(page);
  if (diagnostic) await captureCommittedDisplayDiagnosticSnapshot(page, diagnostic.cdp, diagnostic.browserCdp, "states-evaluate-before");
  diagnosticPhase = diagnostic ? "states-evaluate" : diagnosticPhase;
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("states", {confirm: true}));
  let responseDiagnosticPromise = Promise.resolve(null);
  void pending.catch(error => {
    if (diagnostic) recordDiagnosticLifecycle("states-evaluate-rejected", {error: serializeDiagnosticError(error)});
  });
  if (diagnostic) {
    responseDiagnosticPromise = pending.then(
      async response => {
        const timing = await persistCommittedDisplayDiagnosticResponse(page, response);
        await captureCommittedDisplayDiagnosticSnapshot(page, diagnostic.cdp, diagnostic.browserCdp, "states-evaluate-after", {status: "fulfilled"});
        return timing;
      },
      async error => {
        await captureCommittedDisplayDiagnosticSnapshot(page, diagnostic.cdp, diagnostic.browserCdp, "states-evaluate-after", {status: "rejected", error: serializeDiagnosticError(error)});
        return null;
      }
    );
  }
  try {
    await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 180000});
    const queued = await page.evaluate(async input => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      const renderer = window.__webglGeneratorApp.renderer;
      const responses = {
        units: await api.units.apply(input.units),
        theme: await api.layers.setTheme(input.alternateTheme),
        routes: await api.layers.setVisible("routes", input.routesVisible),
        colorMode: await api.layers.setViewMode(input.colorMode),
        showOceanHeight: await api.layers.setShowOceanHeight(input.showOceanHeight),
        smoothCellBorders: await api.layers.setSmoothCellBorders(input.smoothCellBorders),
        maxCityLabels: await api.layers.setMaxCityLabels(input.maxCityLabels)
      };
      renderer.setPoliticalMeshDebugMode(input.debug);
      for (const [name, response] of Object.entries(responses)) {
        if (!response?.ok) throw new Error(`display replay ${name} API 排队失败：${response?.error?.message || "unknown"}`);
      }
      const beforeBusy = {
        map: app.map,
        revision: JSON.stringify(app.mapRevision.getSnapshot()),
        history: JSON.stringify(app.editHistory.getStats()),
        session: JSON.stringify(app.workerTaskCoordinator.getSessionSnapshot())
      };
      const formalReplace = await api.generate.newMap({seed: "task322-formal-busy-replace", cells: 10000, confirm: true});
      const afterBusy = {
        sameMap: app.map === beforeBusy.map,
        revision: JSON.stringify(app.mapRevision.getSnapshot()),
        history: JSON.stringify(app.editHistory.getStats()),
        session: JSON.stringify(app.workerTaskCoordinator.getSessionSnapshot())
      };
      const apiState = {layers: api.layers.get(), units: api.units.get()};
      const gl = renderer.gl;
      const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.oceanCurrentBuffer);
      const oceanCurrentBytes = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);
      const controlState = {
        theme: document.getElementById("visual-theme-preset")?.value || "",
        showOceanHeight: Boolean(document.getElementById("show-ocean-height")?.checked ?? document.getElementById("show-ocean-height")?.classList.contains("active")),
        smoothCellBorders: Boolean(document.getElementById("smooth-cell-borders")?.checked ?? document.getElementById("smooth-cell-borders")?.classList.contains("active")),
        maxCityLabels: Number(document.getElementById("max-city-labels")?.value) || 0,
        routesVisible: Boolean(document.querySelector('[data-layer="routes"]')?.checked ?? document.querySelector('[data-layer="routes"]')?.classList.contains("active"))
      };
      return {
        suspended: renderer.workerRenderInstallSuspended,
        deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || Number(renderer.workerRenderInstallDeferredMutationOrder?.length) || 0,
        responses,
        formalReplace,
        busyState: {before: {...beforeBusy, map: undefined}, after: afterBusy},
        apiState,
        preparedOcean: {
          stats: {...renderer.oceanCurrentLayerStats},
          vertexCount: renderer.oceanCurrentVertexCount,
          bytes: oceanCurrentBytes,
          valid: gl.isBuffer(renderer.oceanCurrentBuffer)
        },
        controlState
      };
    }, baseline);
    assert.ok(queued.suspended > 0, "display replay 未处于 renderer install 暂停窗口");
    assert.equal(queued.formalReplace?.ok, false, "原子提交窗口内正式 newMap 未拒绝");
    assert.equal(queued.formalReplace?.error?.code, "operation_busy", "原子提交窗口内正式 newMap 错误码不符");
    assert.equal(queued.busyState.after.sameMap, true, "被拒绝的正式 newMap 替换了当前地图");
    for (const key of ["revision", "history", "session"]) assert.equal(queued.busyState.after[key], queued.busyState.before[key], `被拒绝的正式 newMap 改写 ${key}`);
    assert.equal(queued.apiState.layers?.ok, true, "display replay 排队后 layers.get 失败");
    assert.equal(queued.apiState.units?.ok, true, "display replay 排队后 units.get 失败");
    const expectedUnits = queued.responses.units.data.units;
    assert.equal(queued.preparedOcean.stats.highlighted, 1, "deferred replay 前 Worker prepared install 已丢失真实洋流高亮");
    assert.ok(queued.preparedOcean.stats.currents > 0 && queued.preparedOcean.vertexCount > 0, "deferred replay 前 Worker prepared install 洋流没有正式顶点");
    assert.equal(queued.preparedOcean.valid, true, "deferred replay 前 oceanCurrentBuffer 已删除");
    assert.equal(queued.preparedOcean.bytes, queued.preparedOcean.vertexCount * 24, "deferred replay 前 oceanCurrentBuffer 字节不同源");
    assert.equal(queued.apiState.layers.data.visualTheme, baseline.alternateTheme, "排队期间 layers.get 仍读取旧主题");
    assert.equal(queued.apiState.layers.data.layers.routes, baseline.routesVisible, "排队期间 layers.get 仍读取旧图层状态");
    assert.equal(queued.apiState.layers.data.display.showOceanHeight, baseline.showOceanHeight, "排队期间 layers.get 仍读取旧海面偏好");
    assert.equal(queued.apiState.layers.data.display.smoothCellBorders, baseline.smoothCellBorders, "排队期间 layers.get 仍读取旧平滑偏好");
    assert.equal(queued.apiState.layers.data.display.maxCityLabels, baseline.maxCityLabels, "排队期间 layers.get 仍读取旧标签偏好");
    assert.deepEqual(queued.apiState.units.data.units, expectedUnits, "排队期间 units.get 仍读取旧单位偏好");
    assert.deepEqual(queued.controlState, {
      theme: baseline.alternateTheme,
      showOceanHeight: baseline.showOceanHeight,
      smoothCellBorders: baseline.smoothCellBorders,
      maxCityLabels: baseline.maxCityLabels,
      routesVisible: baseline.routesVisible
    }, "排队期间 UI 控件未同步最终显示偏好");
    if (diagnostic) await installCommittedDisplayMethodTiming(page);
    await releaseSessionCommitPause(page, {recordTiming: Boolean(diagnostic)});
    const response = await pending;
    await responseDiagnosticPromise;
    const sessionProtocol = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const pause = window.__task322SessionCommitPause;
      return {
        runs: structuredClone(pause?.runs || []),
        commits: structuredClone(pause?.commits || []),
        finalSession: structuredClone(app.workerTaskCoordinator.getSessionSnapshot?.() || null)
      };
    });
    diagnosticPhase = diagnostic ? "states-evaluate-complete" : diagnosticPhase;
    assert.equal(response?.ok, true, `deferred display replay 使本可提交操作失败：${response?.error?.message || "unknown"}`);
    assert.equal(response.data?.worker?.session?.committed, true, "deferred display replay session 未提交");
    const renderOnlyRuns = sessionProtocol.runs.filter(record => record.payloadMode === "render-only");
    assert.equal(renderOnlyRuns.length, 1, "display replay 必须且只能追加一次 render-only run");
    const renderOnly = renderOnlyRuns[0];
    assert.equal(renderOnly.task, "regeneration.compute", "render-only 未复用 regeneration.compute");
    assert.equal(renderOnly.sessionMode, "map-mirror", "render-only 未复用 map-mirror session");
    assert.equal(renderOnly.sessionPayloadMode, "render-only", "render-only session payload 模式不符");
    assert.equal(renderOnly.sessionPayloadOwnMap, false, "render-only session payload 仍携带完整 map");
    assert.equal(renderOnly.allowFallback, false, "render-only 必须 fail-closed 禁止 fallback");
    assert.equal(renderOnly.binding?.mapRevision, 1, "render-only coordinator binding revision 不为 1");
    assert.equal(renderOnly.renderBinding?.mapRevision, 1, "render-only render binding revision 不为 1");
    assert.equal(renderOnly.binding?.mapIdentity, renderOnly.renderBinding?.mapIdentity, "render-only coordinator/render binding 地图不一致");
    assert.deepEqual(sessionProtocol.commits.map(record => record.expectedRevisionDelta), [1, 0], "session 提交必须恰为 delta1→delta0");
    assert.ok(sessionProtocol.commits.every(record => record.completed && record.result), "delta1/delta0 session commit 未全部成功");
    assert.ok(sessionProtocol.commits.every(record => record.binding?.mapRevision === 1), "delta1/delta0 binding revision 必须都为 1");
    const committedSessionIds = sessionProtocol.commits.map(record => record.sessionId);
    assert.equal(new Set(committedSessionIds).size, 1, "delta1/delta0 未提交同一 session");
    assert.equal(committedSessionIds[0], response.data.worker.session.id, "response session 与 delta1/delta0 session 不一致");
    assert.equal(sessionProtocol.finalSession?.id, committedSessionIds[0], "最终 coordinator session id 不一致");
    assert.equal(sessionProtocol.finalSession?.status, "idle", "最终 coordinator session 未回到 idle");
    assert.equal(response.data.worker.session.reused, true, "response 未证明 render-only 同 session 复用");
    assert.ok(Number(response.data.worker.telemetry?.inputPackets) <= 4, "render-only inputPackets 未收敛到小包");
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const gl = renderer.gl;
      const bufferBytes = buffer => {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const size = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        return {size, valid: gl.isBuffer(buffer)};
      };
      const markerCanonical = new Map((app.map.markers?.markers || []).filter(Boolean).map(item => [String(item.id), item]));
      const cityCanonical = new Map((app.map.settlements?.cities || []).filter(Boolean).map(item => [String(item.id), item]));
      return {
        history: app.editHistory.getStats(),
        context: {
          units: structuredClone(renderer.unitPreferences),
          theme: renderer.visualTheme?.id,
          debug: renderer.politicalMeshDebugMode,
          routesVisible: renderer.layerVisibility.routes !== false,
          colorMode: renderer.colorMode,
          showOceanHeight: Boolean(renderer.viewOptions.showOceanHeight),
          smoothCellBorders: Boolean(renderer.viewOptions.smoothCellBorders),
          maxCityLabels: renderer.labelOptions.maxCityLabels,
          oceanIds: [...renderer.oceanCurrentHighlights].map(String)
        },
        surfaceBase: window.__task322SurfaceBaseProbe.summary(window.__task322SurfaceBaseProbe.capture(renderer)),
        buffers: {
          surfacePatch: bufferBytes(renderer.surfacePatchBuffer),
          line: bufferBytes(renderer.lineBuffer),
          point: bufferBytes(renderer.pointBuffer),
          route: bufferBytes(renderer.routeBuffer),
          debug: bufferBytes(renderer.politicalMeshDebugBuffer),
          oceanCurrent: bufferBytes(renderer.oceanCurrentBuffer)
        },
        counts: {
          surface: renderer.vertexCount,
          surfacePatch: renderer.surfacePatchVertexCount,
          line: renderer.lineVertexCount,
          pointBuffer: renderer.pointBufferVertexCount,
          pointBufferExpected: renderer.pointDrawRanges.reduce((total, range) => total + range.count, 0),
          pointVisible: renderer.pointVertexCount,
          pointVisibleExpected: renderer.pointDrawRanges.reduce((total, range) => total + (renderer.layerVisibility[range.layer] !== false ? range.count : 0), 0),
          route: renderer.routeVertexCount,
          debug: renderer.politicalMeshDebugVertexCount,
          oceanCurrent: renderer.oceanCurrentVertexCount
        },
        oceanCurrentLayer: {...renderer.oceanCurrentLayerStats},
        domCanonical: renderer.cityIconItems.every(item => item.city === cityCanonical.get(String(item.id)))
          && renderer.markerIconItems.every(item => item.marker === markerCanonical.get(String(item.id)) && item.node?.isConnected)
          && renderer.labelItems.every(item => item.node?.isConnected)
          && renderer.militaryIconItems.every(item => item.rendererUnitPreferences === renderer.unitPreferences && item.node?.isConnected),
        apiState: {layers: window.webglGeneratorApi.layers.get(), units: window.webglGeneratorApi.units.get()},
        controlState: {
          theme: document.getElementById("visual-theme-preset")?.value || "",
          showOceanHeight: Boolean(document.getElementById("show-ocean-height")?.checked ?? document.getElementById("show-ocean-height")?.classList.contains("active")),
          smoothCellBorders: Boolean(document.getElementById("smooth-cell-borders")?.checked ?? document.getElementById("smooth-cell-borders")?.classList.contains("active")),
          maxCityLabels: Number(document.getElementById("max-city-labels")?.value) || 0,
          routesVisible: Boolean(document.querySelector('[data-layer="routes"]')?.checked ?? document.querySelector('[data-layer="routes"]')?.classList.contains("active"))
        },
        timers: {
          deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || Number(renderer.workerRenderInstallDeferredMutationOrder?.length) || 0,
          route: Boolean(renderer.routeRefreshTimer),
          routeActive: Number(renderer.routeRefreshActiveVersion) || 0,
          viewport: Boolean(renderer.viewportCommitTimer),
          suspended: Number(renderer.workerRenderInstallSuspended) || 0
        }
      };
    });
    assert.equal(after.history.undo, baseline.history.undo + 1, "display replay 正式提交未形成唯一历史");
    const expectedContext = {
      units: expectedUnits,
      theme: baseline.alternateTheme,
      debug: baseline.debug,
      routesVisible: baseline.routesVisible,
      colorMode: baseline.colorMode,
      showOceanHeight: baseline.showOceanHeight,
      smoothCellBorders: baseline.smoothCellBorders,
      maxCityLabels: baseline.maxCityLabels,
      oceanIds: baseline.oceanIds
    };
    assert.deepEqual(after.context, expectedContext, "renderer 暂停窗口的 display 设置未按 key 最终重放");
    assert.equal(after.oceanCurrentLayer.highlighted, 1, "Worker prepared install 丢失真实洋流高亮");
    assert.ok(after.oceanCurrentLayer.currents > 0 && after.counts.oceanCurrent > 0, "Worker prepared install 洋流高亮没有正式 GPU 顶点");
    assert.equal(after.apiState.layers?.ok, true, "display replay 后 layers.get 失败");
    assert.equal(after.apiState.units?.ok, true, "display replay 后 units.get 失败");
    assert.equal(after.apiState.layers.data.visualTheme, baseline.alternateTheme, "display replay 后 layers.get 主题不符");
    assert.equal(after.apiState.layers.data.layers.routes, baseline.routesVisible, "display replay 后 layers.get 图层不符");
    assert.deepEqual(after.apiState.units.data.units, expectedUnits, "display replay 后 units.get 不符");
    assert.deepEqual(after.controlState, queued.controlState, "display replay 后 UI 控件未保持排队最终值");
    assert.equal(after.domCanonical, true, "display replay 后 overlay/单位 DOM 与正式对象不同源");
    assert.equal(after.surfaceBase.aliasMatches, true, "display replay surface base alias 未指向首段");
    assert.equal(after.surfaceBase.descriptorsValid, true, "display replay surface base segments descriptor 无效");
    assert.equal(after.surfaceBase.segmentCount, after.surfaceBase.expectedSegmentCount, "display replay surface base GPU count 不符");
    assert.equal(after.surfaceBase.aggregate.byteLength, after.counts.surface * 24, "display replay surface base GPU bytes 与 vertexCount 不符");
    assert.equal(after.counts.pointBuffer, after.counts.pointBufferExpected, "display replay point buffer 顶点数与完整 drawRanges 不符");
    assert.equal(after.counts.pointVisible, after.counts.pointVisibleExpected, "display replay point 可见顶点数与 visibility/drawRanges 不符");
    for (const [key, value] of Object.entries(after.buffers)) {
      assert.equal(value.valid, true, `display replay ${key} GPU buffer 已删除`);
      if (key === "point") continue;
      assert.equal(value.size, after.counts[key] * 24, `display replay ${key} GPU bytes 与 vertexCount 不符`);
    }
    assert.equal(after.buffers.point.size, after.counts.pointBuffer * 24, "display replay point GPU bytes 与完整 buffer vertexCount 不符");
    assert.deepEqual(after.timers, {deferred: 0, route: false, routeActive: 0, viewport: false, suspended: 0}, "display replay 留下 deferred/timer 状态");
    await assertNoLongTasks(page, "committed display replay");
    return {
      worker: response.data.worker,
      sessionProtocol: {
        runs: sessionProtocol.runs,
        commits: sessionProtocol.commits,
        finalSession: sessionProtocol.finalSession
      },
      context: after.context,
      buffers: after.buffers,
      counts: after.counts
    };
  } finally {
    await page.evaluate(() => {
      window.__task322CommittedDisplayTiming?.restore?.();
      delete window.__task322CommittedDisplayTiming;
      window.__task322SessionCommitPause?.release?.();
      window.__task322SessionCommitPause?.restore?.();
      delete window.__task322SessionCommitPause;
    });
  }
}

async function runRenderReplayRecoveryDiagnosticGate(page, diagnostic) {
  const scenarios = [
    {id: "B", seed: "worker-session-replay-recovery-delta0", delta0Reject: true, expectedRawCode: "worker_session_commit_rejected"},
    {id: "A", seed: "worker-session-replay-recovery-run-fault", renderOnlyFault: true, expectedRawCode: "task322_render_only_fault", expectedPublicCode: "task322_render_only_fault"},
    {id: "C", seed: "worker-session-replay-recovery-double-fault", renderOnlyFault: true, recoveryPrepareFault: true, expectedRawCode: "operation_rollback_failed"}
  ].filter(scenario => !renderReplayRecoveryCase || scenario.id === renderReplayRecoveryCase);
  const results = [];
  for (const scenario of scenarios) {
    diagnosticPhase = `render-replay-recovery-${scenario.id}`;
    recordDiagnosticLifecycle("recovery-scenario-start", {scenario: scenario.id});
    try {
      const result = await runRenderReplayRecoveryScenario(page, diagnostic, scenario);
      results.push(result);
      recordDiagnosticLifecycle("recovery-scenario-pass", {scenario: scenario.id, errorCode: result.error?.code || null});
    } catch (error) {
      recordDiagnosticLifecycle("recovery-scenario-fail", {scenario: scenario.id, error: serializeDiagnosticError(error)});
      throw error;
    }
  }
  return {startupEvidence: diagnostic.startupEvidence, scenarios: results};
}

async function runRenderReplayRecoveryScenario(page, diagnostic, scenario) {
  const setupConsoleStart = diagnostic.consoleErrorRecords.length;
  await beginRenderReplayRecoverySetupHealthCapture(page);
  let setupHealthEvents;
  try {
    await createMap(page, scenario.seed, 10000);
    await diagnostic.flushConsoleErrors();
    setupHealthEvents = await finishRenderReplayRecoverySetupHealthCapture(page);
  } catch (error) {
    await finishRenderReplayRecoverySetupHealthCapture(page).catch(() => []);
    throw error;
  }
  const setupConsoleRecords = diagnostic.consoleErrorRecords.slice(setupConsoleStart);
  const setupConsumption = consumeVerifiedSetupHealthConsoleErrors(setupConsoleRecords, setupHealthEvents, `${scenario.id} setup`);
  assert.deepEqual(setupConsumption.unexpected, [], `${scenario.id} setup 出现非预期 console error`);
  await page.waitForFunction(() => {
    const renderer = window.__webglGeneratorApp?.renderer;
    return renderer
      && !renderer.routeRefreshTimer
      && !renderer.routeRefreshActiveVersion
      && !renderer.viewportCommitTimer
      && !renderer.cityIconAnimationFrame;
  }, null, {timeout: 180000});
  await captureCommittedDisplayDiagnosticSnapshot(page, diagnostic.cdp, diagnostic.browserCdp, `${scenario.id}-new-map-stable`);
  const baseline = await installRenderReplayRecoveryProbe(page, scenario);
  await installSessionCommitPause(page);
  await page.evaluate(input => {
    const pause = window.__task322SessionCommitPause;
    pause.faults = {
      delta0Reject: Boolean(input.delta0Reject),
      renderOnly: Boolean(input.renderOnlyFault),
      recoveryPrepare: Boolean(input.recoveryPrepareFault)
    };
  }, scenario);
  await discardProbeLongTasks(page);
  const consoleStart = diagnostic.consoleErrorRecords.length;
  const pageErrorStart = diagnostic.pageErrors.length;
  let pending = null;
  let response = null;
  let scenarioResult = null;
  try {
    pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("states", {confirm: true}));
    void pending.catch(() => {});
    await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 180000});
    const queued = await page.evaluate(async input => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const theme = await api.layers.setTheme(input.alternateTheme);
      const units = await api.units.apply(input.units);
      if (!theme?.ok || !units?.ok) throw new Error(`恢复诊断排队失败：${theme?.error?.message || units?.error?.message || "unknown"}`);
      const effectiveLayers = api.layers.get();
      const effectiveUnits = api.units.get();
      return {
        theme,
        units,
        expectedUnits: units.data.units,
        effectiveLayers,
        effectiveUnits,
        control: {
          theme: document.getElementById("visual-theme-preset")?.value || "",
          militaryScale: Number(document.getElementById("military-scale")?.value)
        },
        suspended: Number(renderer.workerRenderInstallSuspended) || 0,
        deferredKeys: [...renderer.workerRenderInstallDeferredMutations.keys()]
      };
    }, baseline.presentation);
    assert.ok(queued.suspended > 0, `${scenario.id} 排队时 renderer 未暂停`);
    assert.deepEqual([...queued.deferredKeys].sort(), ["unit-preferences", "visual-theme"], `${scenario.id} 未保留 theme+units 队列`);
    assert.equal(queued.effectiveLayers?.data?.visualTheme, baseline.presentation.alternateTheme, `${scenario.id} 排队后 API 主题不是最终意图`);
    assert.deepEqual(queued.effectiveUnits?.data?.units, queued.expectedUnits, `${scenario.id} 排队后 API 单位不是最终意图`);
    assert.equal(queued.control.theme, baseline.presentation.alternateTheme, `${scenario.id} 排队后主题控件不是最终意图`);
    assert.equal(queued.control.militaryScale, Number(queued.expectedUnits.militaryScale), `${scenario.id} 排队后单位控件不是最终意图`);
    await releaseSessionCommitPause(page);
    response = await pending;
    await page.waitForTimeout(100);
    await assertNoLongTasks(page, `${scenario.id} render replay recovery`);
    const light = await readRenderReplayRecoveryLightState(page);
    recordDiagnosticLifecycle("recovery-response", {
      scenario: scenario.id,
      responseError: response?.error || null,
      rawError: light.rawError,
      runs: light.runs,
      commits: light.commits,
      queueKeys: light.queueKeys,
      suspended: light.suspended
    });
    assert.equal(response?.ok, false, `${scenario.id} 故障注入未返回失败`);
    if (scenario.expectedPublicCode) assert.equal(response?.error?.code, scenario.expectedPublicCode, `${scenario.id} 未保留权威公开错误码`);
    assert.ok(errorTreeHasCode(light.rawError, scenario.expectedRawCode), `${scenario.id} runtime 原始诊断链缺少 ${scenario.expectedRawCode}`);
    assert.equal(light.sameMap, true, `${scenario.id} 回滚后 map/renderer ownership 漂移`);
    assert.deepEqual(light.revision, baseline.revision, `${scenario.id} 回滚后 revision 漂移`);
    assert.deepEqual(light.history, baseline.history, `${scenario.id} 回滚后历史漂移`);
    assert.deepEqual(light.summary, baseline.summary, `${scenario.id} 回滚后 summary 漂移`);
    assert.equal(light.domain, baseline.domain, `${scenario.id} 回滚后 states 正式领域漂移`);
    assert.equal(light.session, null, `${scenario.id} 失败后 session 未失效`);
    assert.deepEqual(light.timers, {route: false, routeActive: 0, viewport: false, loading: 0}, `${scenario.id} 留下 timer/Loading`);
    assert.equal(light.glError, 0, `${scenario.id} 出现 WebGL error`);
    assertOrdinaryRegenerationTexts(light.ordinaryTexts, `${scenario.id} 普通文案`);

    const renderOnlyRuns = light.runs.filter(record => record.task === "regeneration.compute" && (record.payloadMode === "render-only" || record.sessionPayloadMode === "render-only"));
    assert.equal(renderOnlyRuns.length, 1, `${scenario.id} render-only 调用次数不为 1`);
    assert.equal(renderOnlyRuns[0].payloadOwnMap, true, `${scenario.id} render-only 正式 payload 未声明 map mirror 输入`);
    assert.equal(renderOnlyRuns[0].sessionPayloadOwnMap, false, `${scenario.id} render-only sessionPayload 携带了完整 map`);
    assert.equal(renderOnlyRuns[0].allowFallback, false, `${scenario.id} render-only 未禁止 fallback`);
    assert.equal(renderOnlyRuns[0].signalSameAsOperation, true, `${scenario.id} render-only 未复用原 operation signal`);
    const recoveryRuns = light.runs.filter(record => record.task === "render.prepare");
    assert.equal(recoveryRuns.length, 1, `${scenario.id} 独立 render.prepare recovery 调用次数不为 1`);
    assert.equal(recoveryRuns[0].payloadOwnMap, true, `${scenario.id} recovery 未携带 staged map`);
    assert.equal(recoveryRuns[0].sessionMode, "", `${scenario.id} recovery 错误启用了持久 session`);
    assert.equal(recoveryRuns[0].allowFallback, false, `${scenario.id} recovery 未禁止 fallback`);
    assert.equal(recoveryRuns[0].payloadIsolated, true, `${scenario.id} recovery staged payload 未声明隔离`);
    assert.equal(recoveryRuns[0].signalPresent, true, `${scenario.id} recovery 缺少独立 signal`);
    assert.equal(recoveryRuns[0].signalSameAsOperation, false, `${scenario.id} recovery 继承了已失败 operation signal`);
    assert.equal(recoveryRuns[0].resultSession, null, `${scenario.id} recovery 返回了持久 session`);
    assert.equal(light.faultHits.delta0Reject, scenario.delta0Reject ? 1 : 0, `${scenario.id} delta0 拒绝命中次数不符`);
    assert.equal(light.faultHits.renderOnly, scenario.renderOnlyFault ? 1 : 0, `${scenario.id} render-only 故障命中次数不符`);
    assert.equal(light.faultHits.recoveryPrepare, scenario.recoveryPrepareFault ? 1 : 0, `${scenario.id} recovery 故障命中次数不符`);
    assert.equal(light.commits[0]?.expectedRevisionDelta, 1, `${scenario.id} 首次提交不是 delta1`);
    assert.equal(light.commits[0]?.result, true, `${scenario.id} delta1 未成功提交`);
    if (scenario.id === "B") {
      assert.deepEqual(light.commits.map(record => ({delta: record.expectedRevisionDelta, completed: record.completed, result: record.result})), [
        {delta: 1, completed: true, result: true},
        {delta: 0, completed: true, result: false}
      ], "B commit 序列必须精确为 delta1:true → delta0:false");
      assert.equal(new Set(light.commits.map(record => record.sessionId)).size, 1, "B delta1/delta0 未指向同一 session");
    } else {
      assert.deepEqual(light.commits.map(record => ({delta: record.expectedRevisionDelta, completed: record.completed, result: record.result})), [
        {delta: 1, completed: true, result: true}
      ], `${scenario.id} commit 序列必须只有成功 delta1`);
    }

    const heavy = await readRenderReplayRecoveryHeavyState(page);
    recordDiagnosticLifecycle("recovery-heavy", {scenario: scenario.id, overlay: heavy.overlayChecks});
    await discardProbeLongTasks(page);
    if (scenario.id === "C") {
      assert.ok(errorTreeHasCode(light.rawError, "task322_render_only_fault"), "C 组合诊断缺少 render-only 原始错误");
      assert.ok(errorTreeHasCode(light.rawError, "task322_recovery_prepare_fault"), "C 组合诊断缺少 recovery 原始错误");
      assert.deepEqual(heavy.actualPresentation, baseline.presentation.actual, "C 双故障后 renderer 展示标量未恢复 baseline");
      assert.deepEqual(heavy.apiUnits?.data?.units, queued.expectedUnits, "C 双故障后 API 未保留排队单位意图");
      assert.equal(heavy.apiLayers?.data?.visualTheme, baseline.presentation.alternateTheme, "C 双故障后 API 未保留排队主题意图");
      assert.equal(heavy.control.theme, baseline.presentation.alternateTheme, "C 双故障后主题控件未保留排队意图");
      assert.equal(heavy.control.militaryScale, Number(queued.expectedUnits.militaryScale), "C 双故障后单位控件未保留排队意图");
      assert.deepEqual([...light.queueKeys].sort(), ["unit-preferences", "visual-theme"], "C 双故障后 deferred 队列未完整保留");
      assert.ok(light.suspended > 0, "C 双故障后 renderer 未保持安全暂停");
      assertRenderReplayRecoveryExactBaseline(heavy, baseline, "C");
    } else {
      assert.deepEqual(heavy.actualPresentation, {
        theme: baseline.presentation.alternateTheme,
        units: queued.expectedUnits
      }, `${scenario.id} 恢复后 renderer 未应用最终 theme+units`);
      assert.deepEqual(heavy.apiUnits?.data?.units, queued.expectedUnits, `${scenario.id} 恢复后 API 单位不符`);
      assert.equal(heavy.apiLayers?.data?.visualTheme, baseline.presentation.alternateTheme, `${scenario.id} 恢复后 API 主题不符`);
      assert.equal(heavy.control.theme, baseline.presentation.alternateTheme, `${scenario.id} 恢复后主题控件不符`);
      assert.equal(heavy.control.militaryScale, Number(queued.expectedUnits.militaryScale), `${scenario.id} 恢复后单位控件不符`);
      assert.deepEqual(light.queueKeys, [], `${scenario.id} 恢复成功后 deferred 队列残留`);
      assert.equal(light.suspended, 0, `${scenario.id} 恢复成功后 renderer 仍暂停`);
      assert.ok(heavy.baselineSurfaceValid.every(value => value === false), `${scenario.id} 恢复成功后旧 surface base segments 未全部删除`);
      assertRenderReplayRecoveryCanonical(heavy, `${scenario.id}`);
    }
    for (const temporary of heavy.temporaryBuffers) {
      assert.equal(temporary.active, false, `${scenario.id} 临时 ${temporary.label}/${temporary.name} 仍是 active buffer`);
      assert.equal(temporary.valid, false, `${scenario.id} 临时 ${temporary.label}/${temporary.name} 未删除`);
    }
    assert.equal(heavy.pickingExact, true, `${scenario.id} picking 身份发生变化`);
    const signals = await readSignals(page);
    assert.deepEqual(signals.longTasks, [], `${scenario.id} GPU probe 后 longtask 未隔离`);
    const expectedHealth = signals.nonPerformanceHealth.filter(event => isExpectedRenderReplayRecoveryHealth(event, scenario));
    const unexpectedHealth = signals.nonPerformanceHealth.filter(event => !isExpectedRenderReplayRecoveryHealth(event, scenario));
    assert.equal(expectedHealth.length, scenario.id === "A" ? 0 : 1, `${scenario.id} 预期 operation-failed health 数量不符`);
    assert.deepEqual(unexpectedHealth, [], `${scenario.id} 出现非预期 health error`);
    await diagnostic.flushConsoleErrors();
    const scenarioConsoleErrors = diagnostic.consoleErrorRecords.slice(consoleStart);
    const consoleConsumption = consumeVerifiedHealthConsoleErrors(scenarioConsoleErrors, expectedHealth, scenario.id);
    assert.deepEqual(consoleConsumption.unexpected, [], `${scenario.id} 出现非预期或无法结构化的 console error`);
    assert.deepEqual(diagnostic.pageErrors.slice(pageErrorStart), [], `${scenario.id} 出现 page error`);
    scenarioResult = {
      id: scenario.id,
      error: response.error,
      rawError: light.rawError,
      runs: light.runs,
      commits: light.commits,
      temporaryBuffers: heavy.temporaryBuffers.map(item => ({label: item.label, name: item.name, size: item.size, active: item.active, valid: item.valid})),
      queueKeys: light.queueKeys,
      suspended: light.suspended,
      buffers: heavy.buffers,
      city: heavy.city,
      expectedHealthEvents: expectedHealth,
      expectedConsoleErrorRecords: consoleConsumption.consumed,
      setupHealthEvents: setupConsumption.healthEvents,
      setupConsoleErrorRecords: setupConsumption.consumed,
      cleanupHealthEvents: [],
      cleanupConsoleErrorRecords: [],
      verifiedFinalSnapshot: scenario.id === "C" ? {
        signals: structuredClone(signals),
        expectedHealthEvents: structuredClone(expectedHealth),
        expectedConsoleErrorRecords: structuredClone(consoleConsumption.consumed),
        pageErrors: structuredClone(diagnostic.pageErrors.slice(pageErrorStart))
      } : null
    };
    return scenarioResult;
  } finally {
    await page.evaluate(() => window.__task322SessionCommitPause?.release?.()).catch(() => {});
    if (pending) await Promise.race([pending.catch(() => null), delay(5000)]);
    await page.evaluate(() => {
      const probe = window.__task322RenderReplayRecovery;
      window.__task322SessionCommitPause?.restore?.();
      probe?.ordinaryObserver?.disconnect?.();
      if (probe?.originalRuntimeRun && window.__webglGeneratorApp?.runtimeOperation) {
        window.__webglGeneratorApp.runtimeOperation.run = probe.originalRuntimeRun;
      }
      delete window.__task322SessionCommitPause;
      delete window.__task322RenderReplayRecovery;
    }).catch(() => {});
    if (scenario.id === "C" && !page.isClosed()) {
      const cleanupConsoleStart = diagnostic.consoleErrorRecords.length;
      await page.reload({waitUntil: "domcontentloaded", timeout: 180000});
      await waitForApiReady(page, 180000);
      await page.waitForTimeout(100);
      await diagnostic.flushConsoleErrors();
      const cleanupHealthEvents = await page.evaluate(() => window.__webglGeneratorHealth?.getEvents?.(500) || []);
      const cleanupConsoleRecords = diagnostic.consoleErrorRecords.slice(cleanupConsoleStart);
      const cleanupConsumption = consumeVerifiedSetupHealthConsoleErrors(cleanupConsoleRecords, cleanupHealthEvents, "C cleanup reload");
      assert.deepEqual(cleanupConsumption.unexpected, [], "C cleanup reload 出现非预期 console error");
      if (scenarioResult) {
        scenarioResult.cleanupHealthEvents = cleanupConsumption.healthEvents;
        scenarioResult.cleanupConsoleErrorRecords = cleanupConsumption.consumed;
      }
    }
  }
}

async function installRenderReplayRecoveryProbe(page, scenario) {
  return page.evaluate(input => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const api = window.webglGeneratorApi;
    const gl = renderer.gl;
    const bufferNames = [
      "landCorrectionBuffer", "waterCorrectionBuffer", "landCoverBuffer", "waterCoverBuffer", "surfacePatchBuffer",
      "lineBuffer", "shoreLineBuffer", "pointBuffer", "routeBuffer", "riverBuffer", "selectionBuffer", "oceanCurrentBuffer",
      "politicalMeshDebugBuffer", "tradeFlowBuffer"
    ];
    const getBuffer = name => name === "cityIconInstanceBuffer" ? renderer.cityIconLayer.instanceBuffer : renderer[name];
    const fingerprintBuffer = buffer => {
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      let byteLength = 0;
      let bytes = new Uint8Array();
      try {
        if (buffer && gl.isBuffer(buffer)) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
          bytes = new Uint8Array(byteLength);
          if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        }
      } finally {
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      }
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {byteLength, checksum, valid: Boolean(buffer && gl.isBuffer(buffer))};
    };
    const fingerprintTyped = values => {
      const typed = ArrayBuffer.isView(values) ? values : new Uint8Array();
      const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {byteLength: typed.byteLength, checksum};
    };
    const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
    const buffers = {};
    for (const name of [...bufferNames, "cityIconInstanceBuffer"]) {
      const ref = getBuffer(name);
      buffers[name] = {ref, fingerprint: fingerprintBuffer(ref)};
    }
    const serializeError = (error, seen = new Set()) => {
      if (!error || typeof error !== "object") return error == null ? null : {message: String(error)};
      if (seen.has(error)) return {circular: true};
      seen.add(error);
      const value = {
        name: String(error.name || "Error"),
        code: error.code ? String(error.code) : null,
        message: String(error.message || error),
        stage: error.stage ? String(error.stage) : null
      };
      if (error.originalError) value.originalError = serializeError(error.originalError, seen);
      if (error.recoveryError) value.recoveryError = serializeError(error.recoveryError, seen);
      if (error.cause) value.cause = serializeError(error.cause, seen);
      if (Array.isArray(error.errors)) value.errors = error.errors.map(item => serializeError(item, seen));
      return value;
    };
    const themes = api.layers.listThemes();
    const currentTheme = themes?.data?.current || renderer.visualTheme?.id || "default";
    const alternateTheme = (themes?.data?.themes || []).map(item => item.value || item.id).find(value => value && value !== currentTheme);
    if (!alternateTheme) throw new Error(`${input.id} 缺少可切换主题`);
    const actualPresentation = {
      theme: renderer.visualTheme?.id,
      units: structuredClone(renderer.unitPreferences)
    };
    const cityLayer = renderer.cityIconLayer;
    const probe = {
      map: app.map,
      rendererMap: renderer.map,
      revision: structuredClone(app.mapRevision.getSnapshot()),
      history: structuredClone(app.editHistory.getStats()),
      summary: structuredClone(app.map.summary),
      domain: JSON.stringify({
        politics: app.map.politics,
        packStates: app.map.pack?.states,
        packProvinces: app.map.pack?.provinces,
        packStateCells: app.map.pack?.cells?.state,
        packProvinceCells: app.map.pack?.cells?.province,
        settlements: app.map.settlements,
        regeneration: app.map.metadata?.regeneration
      }),
      surfaceBase,
      buffers,
      bufferNames,
      picking: renderer.objectPickingIndex,
      overlayNodes: [...renderer.overlay.childNodes],
      city: {
        instances: cityLayer.instances,
        index: cityLayer.instanceIndexById,
        data: cityLayer.instanceData,
        statsRef: cityLayer.stats,
        stats: structuredClone(cityLayer.stats)
      },
      presentation: {
        actual: actualPresentation,
        alternateTheme,
        units: {...actualPresentation.units, militaryScale: Math.max(0.1, Number(actualPresentation.units.militaryScale || 1) + 0.625)}
      },
      temporaryBuffers: [],
      rawError: null,
      ordinaryTexts: [],
      fingerprintBuffer,
      fingerprintTyped,
      serializeError
    };
    probe.captureTemporaryBuffers = label => {
      const currentSurface = window.__task322SurfaceBaseProbe.capture(renderer);
      const currentEntries = [
        ...probe.bufferNames.map(name => ({name, ref: getBuffer(name)})),
        {name: "cityIconInstanceBuffer", ref: getBuffer("cityIconInstanceBuffer")},
        ...currentSurface.segments.flatMap((segment, index) => [
          {name: `surfaceBaseBufferSet[${index}].geometry`, ref: segment.geometryBufferRef || segment.bufferRef},
          {name: `surfaceBaseBufferSet[${index}].color`, ref: segment.colorBufferRef}
        ])
      ];
      const baselineRefs = new Set([
        ...Object.values(probe.buffers).map(item => item.ref),
        ...probe.surfaceBase.segments.flatMap(segment => [segment.geometryBufferRef || segment.bufferRef, segment.colorBufferRef])
      ]);
      const activeRefs = new Set(currentEntries.map(item => item.ref));
      for (const {name, ref} of currentEntries) {
        if (!ref || baselineRefs.has(ref) || probe.temporaryBuffers.some(item => item.ref === ref)) continue;
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        let size = 0;
        try {
          if (gl.isBuffer(ref)) {
            gl.bindBuffer(gl.ARRAY_BUFFER, ref);
            size = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
          }
        } finally {
          gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        }
        probe.temporaryBuffers.push({label, name, ref, size, activeAtCapture: activeRefs.has(ref)});
      }
    };
    const ordinaryNodeIds = ["generation-loading", "operation-loading", "regeneration-status", "app-status"];
    const readOrdinaryNode = id => {
      const node = document.getElementById(id);
      const text = String(node?.textContent || "").trim();
      if (!node || !node.isConnected) return {text, visible: false};
      for (let current = node; current; current = current.parentElement) {
        if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return {text, visible: false};
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) {
          return {text, visible: false};
        }
      }
      const rects = node.getClientRects();
      const rect = node.getBoundingClientRect();
      return {text, visible: Boolean(rects.length && rect.width > 0 && rect.height > 0)};
    };
    const ordinaryNodeState = new Map(ordinaryNodeIds.map(id => [id, readOrdinaryNode(id)]));
    const collectOrdinaryTexts = () => {
      for (const id of ordinaryNodeIds) {
        const previous = ordinaryNodeState.get(id) || {text: "", visible: false};
        const current = readOrdinaryNode(id);
        if (current.visible && current.text && (current.text !== previous.text || previous.visible === false) && !probe.ordinaryTexts.includes(current.text)) {
          probe.ordinaryTexts.push(current.text);
        }
        ordinaryNodeState.set(id, current);
      }
    };
    probe.ordinaryObserver = new MutationObserver(collectOrdinaryTexts);
    probe.ordinaryObserver.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
    const originalRuntimeRun = app.runtimeOperation.run;
    probe.originalRuntimeRun = originalRuntimeRun;
    app.runtimeOperation.run = async function(...args) {
      try {
        return await Reflect.apply(originalRuntimeRun, this, args);
      } catch (error) {
        probe.rawError = serializeError(error);
        throw error;
      }
    };
    window.__task322RenderReplayRecovery = probe;
    return {
      revision: probe.revision,
      history: probe.history,
      summary: probe.summary,
      domain: probe.domain,
      presentation: probe.presentation,
      surfaceBase: window.__task322SurfaceBaseProbe.summary(surfaceBase),
      buffers: Object.fromEntries(Object.entries(buffers).map(([name, value]) => [name, value.fingerprint])),
      city: {stats: probe.city.stats}
    };
  }, scenario);
}

async function readRenderReplayRecoveryLightState(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const probe = window.__task322RenderReplayRecovery;
    const pause = window.__task322SessionCommitPause;
    return {
      sameMap: app.map === probe.map && renderer.map === probe.rendererMap && probe.map === probe.rendererMap,
      revision: structuredClone(app.mapRevision.getSnapshot()),
      history: structuredClone(app.editHistory.getStats()),
      summary: structuredClone(app.map.summary),
      domain: JSON.stringify({
        politics: app.map.politics,
        packStates: app.map.pack?.states,
        packProvinces: app.map.pack?.provinces,
        packStateCells: app.map.pack?.cells?.state,
        packProvinceCells: app.map.pack?.cells?.province,
        settlements: app.map.settlements,
        regeneration: app.map.metadata?.regeneration
      }),
      session: structuredClone(app.workerTaskCoordinator.getSessionSnapshot?.() || null),
      runs: structuredClone(pause?.runs || []),
      commits: structuredClone(pause?.commits || []),
      faultHits: structuredClone(pause?.faultHits || {}),
      rawError: structuredClone(probe.rawError),
      ordinaryTexts: [...probe.ordinaryTexts],
      queueKeys: [...renderer.workerRenderInstallDeferredMutations.keys()],
      suspended: Number(renderer.workerRenderInstallSuspended) || 0,
      timers: {
        route: Boolean(renderer.routeRefreshTimer),
        routeActive: Number(renderer.routeRefreshActiveVersion) || 0,
        viewport: Boolean(renderer.viewportCommitTimer),
        loading: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
          + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
      },
      glError: Number(renderer.getStats().draw?.glError ?? 0)
    };
  });
}

async function readRenderReplayRecoveryHeavyState(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const probe = window.__task322RenderReplayRecovery;
    const gl = renderer.gl;
    const getBuffer = name => name === "cityIconInstanceBuffer" ? renderer.cityIconLayer.instanceBuffer : renderer[name];
    const buffers = {};
    for (const name of [...probe.bufferNames, "cityIconInstanceBuffer"]) {
      const current = getBuffer(name);
      buffers[name] = {...probe.fingerprintBuffer(current), exactRef: current === probe.buffers[name].ref};
    }
    const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
    const activeRefs = new Set([
      ...[...probe.bufferNames, "cityIconInstanceBuffer"].map(getBuffer),
      ...surfaceBase.segments.flatMap(segment => [segment.geometryBufferRef || segment.bufferRef, segment.colorBufferRef])
    ]);
    const temporaryBuffers = probe.temporaryBuffers.map(item => ({
      label: item.label,
      name: item.name,
      size: item.size,
      active: activeRefs.has(item.ref),
      valid: gl.isBuffer(item.ref)
    }));
    const cities = new Map((app.map.settlements?.cities || []).filter(Boolean).map(item => [String(item.id), item]));
    const markers = new Map((app.map.markers?.markers || []).filter(Boolean).map(item => [String(item.id), item]));
    const routes = new Map((app.map.settlements?.routes || []).filter(Boolean).map(item => [String(item.id), item]));
    let routeSegments = 0;
    let routePickingCanonical = true;
    for (const bucket of renderer.objectPickingIndex?.buckets?.values?.() || []) {
      for (const segment of bucket.routeSegments || []) {
        routeSegments++;
        const route = routes.get(String(segment.route?.id));
        if (!route || segment.route !== route || segment.a !== route.points?.[segment.index] || segment.b !== route.points?.[segment.index + 1]) routePickingCanonical = false;
      }
    }
    const cityLayer = renderer.cityIconLayer;
    const cityGpu = probe.fingerprintBuffer(cityLayer.instanceBuffer);
    const cityCpu = probe.fingerprintTyped(cityLayer.instanceData);
    const overlayChecks = {
      city: {canonical: true},
      marker: {canonical: true, connected: true},
      labels: {connected: true},
      military: {prefsMatch: true, connected: true},
      firstMismatch: null
    };
    const noteMismatch = detail => { if (!overlayChecks.firstMismatch) overlayChecks.firstMismatch = detail; };
    for (const item of renderer.cityIconItems) {
      const refMatch = item.city === cities.get(String(item.id));
      overlayChecks.city.canonical &&= refMatch;
      if (!refMatch) noteMismatch({type: "city", id: String(item.id), refMatch, connected: null});
    }
    for (const item of renderer.markerIconItems) {
      const refMatch = item.marker === markers.get(String(item.id));
      const connected = Boolean(item.node?.isConnected);
      overlayChecks.marker.canonical &&= refMatch;
      overlayChecks.marker.connected &&= connected;
      if (!refMatch || !connected) noteMismatch({type: "marker", id: String(item.id), refMatch, connected});
    }
    renderer.labelItems.forEach((item, index) => {
      const connected = Boolean(item.node?.isConnected);
      overlayChecks.labels.connected &&= connected;
      if (!connected) noteMismatch({type: "label", id: String(item.id ?? index), refMatch: true, connected});
    });
    renderer.militaryIconItems.forEach((item, index) => {
      const prefsMatch = item.rendererUnitPreferences === renderer.unitPreferences;
      const connected = Boolean(item.node?.isConnected);
      overlayChecks.military.prefsMatch &&= prefsMatch;
      overlayChecks.military.connected &&= connected;
      if (!prefsMatch || !connected) noteMismatch({type: "military", id: String(item.id ?? item.regiment?.id ?? index), refMatch: true, connected, prefsMatch});
    });
    const overlayCanonical = overlayChecks.city.canonical
      && overlayChecks.marker.canonical
      && overlayChecks.marker.connected
      && overlayChecks.labels.connected
      && overlayChecks.military.prefsMatch
      && overlayChecks.military.connected;
    return {
      buffers,
      surfaceBase: window.__task322SurfaceBaseProbe.summary(surfaceBase),
      surfaceBaseExact: window.__task322SurfaceBaseProbe.exact(surfaceBase, probe.surfaceBase),
      baselineSurfaceValid: probe.surfaceBase.segments.flatMap(segment => [
        gl.isBuffer(segment.geometryBufferRef || segment.bufferRef),
        gl.isBuffer(segment.colorBufferRef)
      ]),
      surfaceCpu: probe.fingerprintTyped(renderer.surfaceVertices),
      counts: {
        landCorrectionBuffer: renderer.landCorrectionVertexCount,
        waterCorrectionBuffer: renderer.waterCorrectionVertexCount,
        landCoverBuffer: renderer.landCoverVertexCount,
        waterCoverBuffer: renderer.waterCoverVertexCount,
        surfacePatchBuffer: renderer.surfacePatchVertexCount,
        lineBuffer: renderer.lineVertexCount,
        shoreLineBuffer: renderer.shoreLineVertexCount,
        pointBuffer: renderer.pointVertexCount,
        routeBuffer: renderer.routeVertexCount,
        riverBuffer: renderer.riverVertexCount,
        selectionBuffer: renderer.selectionVertexCount,
        oceanCurrentBuffer: renderer.oceanCurrentVertexCount,
        politicalMeshDebugBuffer: renderer.politicalMeshDebugVertexCount,
        tradeFlowBuffer: renderer.tradeFlowVertexCount
      },
      temporaryBuffers,
      pickingExact: renderer.objectPickingIndex === probe.picking,
      routePickingCanonical,
      routeSegments,
      overlayExact: probe.overlayNodes.length === renderer.overlay.childNodes.length && probe.overlayNodes.every((node, index) => renderer.overlay.childNodes[index] === node),
      overlayCanonical,
      overlayChecks,
      city: {
        instances: cityLayer.instances.length,
        indexSize: cityLayer.instanceIndexById.size,
        dataByteLength: cityLayer.instanceData.byteLength,
        exactInstances: cityLayer.instances === probe.city.instances,
        exactIndex: cityLayer.instanceIndexById === probe.city.index,
        exactData: cityLayer.instanceData === probe.city.data,
        exactStatsRef: cityLayer.stats === probe.city.statsRef,
        stats: structuredClone(cityLayer.stats),
        indexValid: cityLayer.instances.every((item, index) => cityLayer.instanceIndexById.get(String(item.id)) === index),
        itemAligned: cityLayer.instances.length === renderer.cityIconItems.length && cityLayer.instances.every((item, index) => String(item.id) === String(renderer.cityIconItems[index]?.id)),
        cpu: cityCpu,
        gpu: cityGpu
      },
      actualPresentation: {theme: renderer.visualTheme?.id, units: structuredClone(renderer.unitPreferences)},
      apiLayers: window.webglGeneratorApi.layers.get(),
      apiUnits: window.webglGeneratorApi.units.get(),
      control: {
        theme: document.getElementById("visual-theme-preset")?.value || "",
        militaryScale: Number(document.getElementById("military-scale")?.value)
      }
    };
  });
}

function assertRenderReplayRecoveryCanonical(state, label) {
  assert.equal(state.surfaceBase.aliasMatches, true, `${label} surface base alias 未指向首段`);
  assert.equal(state.surfaceBase.descriptorsValid, true, `${label} surface base segment descriptor 无效`);
  assert.equal(state.surfaceBase.segmentCount, state.surfaceBase.expectedSegmentCount, `${label} surface base GPU count 不符`);
  assert.equal(state.surfaceBase.aggregate.byteLength, state.surfaceCpu.byteLength, `${label} surface base GPU 总字节与 CPU source 不符`);
  for (const [name, count] of Object.entries(state.counts)) {
    assert.equal(state.buffers[name]?.valid, true, `${label} ${name} 已删除`);
    assert.equal(state.buffers[name]?.byteLength, count * 24, `${label} ${name} GPU bytes 与 vertexCount 不符`);
  }
  assert.equal(state.routePickingCanonical, true, `${label} route picking 未引用正式路线`);
  assert.ok(state.routeSegments > 0, `${label} 正式路线缺少 picking segments`);
  assert.equal(state.overlayCanonical, true, `${label} overlay/单位 DOM 与正式对象不同源：${JSON.stringify(state.overlayChecks.firstMismatch)}`);
  assert.equal(state.city.indexValid, true, `${label} city index 与 instances 不同源`);
  assert.equal(state.city.itemAligned, true, `${label} city instances 与 renderer items 不同源`);
  assert.equal(state.city.indexSize, state.city.instances, `${label} city index 数量不符`);
  assert.deepEqual(state.city.gpu, {...state.city.cpu, valid: true}, `${label} city GPU/CPU 不同源`);
  assert.equal(state.city.gpu.byteLength, state.city.dataByteLength, `${label} city GPU byteLength 不符`);
  assert.equal(state.city.stats.instanceCount, state.city.instances, `${label} city stats instanceCount 不符`);
}

function assertRenderReplayRecoveryExactBaseline(state, baseline, label) {
  for (const [name, exact] of Object.entries(state.surfaceBaseExact)) assert.equal(exact, true, `${label} surface base 未精确恢复 baseline：${name}`);
  assert.deepEqual(state.surfaceBase, baseline.surfaceBase, `${label} surface base descriptor/GPU 字节未精确恢复 baseline`);
  assert.ok(state.baselineSurfaceValid.every(Boolean), `${label} baseline surface segment 被删除`);
  for (const [name, expected] of Object.entries(baseline.buffers)) {
    assert.equal(state.buffers[name]?.exactRef, true, `${label} ${name} GPU 引用未精确恢复 baseline`);
    assert.deepEqual(pickBufferFingerprint(state.buffers[name]), expected, `${label} ${name} GPU 字节未精确恢复 baseline`);
  }
  assert.equal(state.overlayExact, true, `${label} overlay DOM 身份未精确恢复`);
  assert.deepEqual(state.city, {
    ...state.city,
    exactInstances: true,
    exactIndex: true,
    exactData: true,
    exactStatsRef: true,
    stats: baseline.city.stats
  }, `${label} city CPU/index/data/stats 未精确恢复`);
  assertRenderReplayRecoveryCanonical(state, label);
}

function assertOrdinaryRegenerationTexts(texts, label) {
  const forbidden = /\b(?:worker|features?|routes?|rivers?|cities|states|provinces|markers|diplomacy|religions|military|zones|kind|pack|mesh|haven|harbor|buffer|localstorage|sessionstorage|indexeddb|blob)\b|线程|任务会话|消息包|结构化克隆|缓存后端/iu;
  for (const text of texts || []) assert.doesNotMatch(String(text), forbidden, `${label} 泄漏技术词：${text}`);
}

function errorTreeHasCode(error, code) {
  if (!error || typeof error !== "object") return false;
  if (error.code === code) return true;
  if (errorTreeHasCode(error.originalError, code) || errorTreeHasCode(error.recoveryError, code) || errorTreeHasCode(error.cause, code)) return true;
  return Array.isArray(error.errors) && error.errors.some(item => errorTreeHasCode(item, code));
}

function isExpectedRenderReplayRecoveryHealth(event, scenario = null) {
  if (scenario?.id === "A") return false;
  return event?.type === "operation-failed"
    && event?.detail?.name === "generate.regenerate"
    && event?.detail?.code === "operation_failed";
}

function pickBufferFingerprint(value) {
  return {byteLength: value?.byteLength || 0, checksum: value?.checksum >>> 0, valid: Boolean(value?.valid)};
}

function consumeVerifiedHealthConsoleErrors(records, healthEvents, label) {
  const remaining = [...records];
  const consumed = [];
  for (const event of healthEvents.filter(item => item?.severity === "error")) {
    const matches = remaining
      .map((record, index) => ({record, index}))
      .filter(({record}) => record.readError === null
        && Array.isArray(record.args)
        && record.args.length === 3
        && record.args[0] === "[FMG health]"
        && record.args[1] === event.type
        && isDeepStrictEqual(record.args[2], event));
    assert.equal(matches.length, 1, `${label} health ${event.id} 必须恰有一条结构化 console.error`);
    const [{record, index}] = matches;
    consumed.push(record);
    remaining.splice(index, 1);
  }
  return {consumed, unexpected: remaining};
}

async function traceSessionGate(page, diagnostic, label, expected, run) {
  const trace = diagnostic?.gateConsoleTrace;
  if (!trace) return run();
  const recordStart = trace.consoleErrorRecords.length;
  const startedAt = await page.evaluate(() => performance.now());
  let result;
  let thrown = null;
  try {
    result = await run();
    return result;
  } catch (error) {
    thrown = error;
    throw error;
  } finally {
    let settleError = null;
    try {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(100);
      await trace.flushConsoleErrors();
    } catch (error) {
      settleError = serializeDiagnosticError(error);
    }
    let endedAt = startedAt;
    try {
      endedAt = await page.evaluate(() => performance.now());
    } catch (error) {
      settleError ||= serializeDiagnosticError(error);
    }
    const entry = {
      type: "gate",
      label,
      expected,
      start: startedAt,
      end: endedAt,
      recordStart,
      responseErrors: summarizeGateTraceResponseErrors(result),
      thrown: thrown ? serializeDiagnosticError(thrown) : null,
      settleError,
      consoleRecords: trace.consoleErrorRecords.slice(recordStart).map(record => ({
        id: record.id,
        text: record.text,
        readError: record.readError,
        args: record.args
      }))
    };
    trace.entries.push(entry);
    appendFileSync(gateConsoleTracePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

function summarizeGateTraceResponseErrors(value) {
  const output = [];
  const seen = new WeakSet();
  let budget = 2000;
  const visit = (candidate, path, depth) => {
    if (!candidate || typeof candidate !== "object" || ArrayBuffer.isView(candidate) || candidate instanceof ArrayBuffer || seen.has(candidate) || budget-- <= 0 || depth > 7) return;
    seen.add(candidate);
    const error = candidate.error;
    if (error && typeof error === "object") {
      output.push({
        path: `${path}.error`,
        code: error.code ?? null,
        stage: error.stage ?? null,
        suggestion: error.suggestion ?? null,
        message: error.message ?? null
      });
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (["buffers", "telemetry", "state", "context", "expected", "actual"].includes(key)) continue;
      if (child && typeof child === "object") visit(child, `${path}.${key}`, depth + 1);
    }
  };
  visit(value, "result", 0);
  return output;
}

function finalizeGateConsoleTrace(trace, records) {
  const byGate = Object.fromEntries(trace.entries.map(entry => [entry.label, []]));
  const unassigned = [];
  for (const record of records) {
    const pageTimeMs = Number(record?.args?.[2]?.pageTimeMs);
    const matches = Number.isFinite(pageTimeMs)
      ? trace.entries.filter(entry => pageTimeMs >= entry.start && pageTimeMs <= entry.end)
      : [];
    const snapshot = {id: record.id, text: record.text, readError: record.readError, args: record.args, pageTimeMs: Number.isFinite(pageTimeMs) ? pageTimeMs : null};
    if (!matches.length) unassigned.push(snapshot);
    else for (const entry of matches) byGate[entry.label].push(snapshot);
  }
  const attribution = {
    type: "attribution",
    windows: trace.entries.map(entry => ({label: entry.label, start: entry.start, end: entry.end, expected: entry.expected})),
    byGate,
    unassigned
  };
  appendFileSync(gateConsoleTracePath, `${JSON.stringify(attribution)}\n`, "utf8");
  return attribution;
}

function consumeVerifiedSetupHealthConsoleErrors(records, healthEvents, label) {
  const allowedPerformanceTypes = new Set(["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"]);
  const errorEvents = healthEvents.filter(event => event?.severity === "error");
  for (const event of errorEvents) {
    assert.ok(allowedPerformanceTypes.has(event.type), `${label} 出现非性能 health error：${event.type}`);
    if (event.type === "operation-stall") assert.equal(event.detail?.operation, "generate.newMap", `${label} 出现非建图 operation-stall`);
  }
  const consumption = consumeVerifiedHealthConsoleErrors(records, errorEvents, label);
  return {...consumption, healthEvents: errorEvents};
}

async function beginRenderReplayRecoverySetupHealthCapture(page) {
  await page.evaluate(() => {
    window.__task322RenderReplaySetupHealth?.dispose?.();
    const events = [];
    const listener = event => events.push(structuredClone(event.detail));
    window.addEventListener("webgl-generator-health-event", listener);
    window.__task322RenderReplaySetupHealth = {
      events,
      dispose() {
        window.removeEventListener("webgl-generator-health-event", listener);
      }
    };
  });
}

async function finishRenderReplayRecoverySetupHealthCapture(page) {
  return page.evaluate(() => {
    const capture = window.__task322RenderReplaySetupHealth;
    const events = capture?.events ? structuredClone(capture.events) : [];
    capture?.dispose?.();
    delete window.__task322RenderReplaySetupHealth;
    return events;
  });
}

function removeVerifiedConsoleErrorRecords(values, verified) {
  const remaining = new Map();
  for (const record of verified) {
    assert.ok(Number.isInteger(record?.id) && !remaining.has(record.id), `恢复诊断 expected console id 重复：${record?.id ?? "missing"}`);
    remaining.set(record.id, record);
  }
  return values.filter(record => {
    const expected = remaining.get(record?.id);
    if (!expected) return true;
    assert.deepEqual(record, expected, `恢复诊断 console 记录同 id 内容漂移：${record.id}`);
    remaining.delete(record.id);
    return false;
  });
}

function removeVerifiedHealthEvents(values, verified) {
  const remaining = new Map();
  for (const event of verified) {
    assert.ok(event?.id && !remaining.has(event.id), `恢复诊断 expected health id 重复：${event?.id || "missing"}`);
    remaining.set(event.id, event);
  }
  return values.filter(event => {
    const expected = remaining.get(event?.id);
    if (!expected) return true;
    assert.deepEqual(event, expected, `恢复诊断 health 事件同 id 内容漂移：${event.id}`);
    remaining.delete(event.id);
    return false;
  });
}

async function runDeferredCoalescingGate(page) {
  await createMap(page, "worker-session-deferred-coalescing", 10000);
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    return {
      history: app.editHistory.getStats(),
      view: {
        showOceanHeight: !Boolean(renderer.viewOptions.showOceanHeight),
        smoothCellBorders: !Boolean(renderer.viewOptions.smoothCellBorders)
      },
      visibility: {
        stateBorders: !(renderer.layerVisibility.stateBorders !== false),
        provinceBorders: !(renderer.layerVisibility.provinceBorders !== false)
      }
    };
  });
  await installSessionCommitPause(page);
  await clearLongTasks(page);
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("markers", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 180000});
    const queued = await page.evaluate(input => {
      const renderer = window.__webglGeneratorApp.renderer;
      const originals = {
        applyWorkerRenderMutationBatch: renderer.applyWorkerRenderMutationBatch,
        refreshCellSurface: renderer.refreshCellSurface,
        refreshLineLayers: renderer.refreshLineLayers,
        updateTradeFlowBuffer: renderer.updateTradeFlowBuffer
      };
      const counts = {batches: 0, surface: 0, lines: 0, tradeFlows: 0};
      const batchKeys = [];
      renderer.applyWorkerRenderMutationBatch = function(mutations, ...rest) {
        counts.batches++;
        batchKeys.push((mutations || []).map(item => item.key));
        return Reflect.apply(originals.applyWorkerRenderMutationBatch, this, [mutations, ...rest]);
      };
      renderer.refreshCellSurface = function(...args) {
        if (this.workerRenderInstallApplyingDeferred) counts.surface++;
        return Reflect.apply(originals.refreshCellSurface, this, args);
      };
      renderer.refreshLineLayers = function(...args) {
        if (this.workerRenderInstallApplyingDeferred) counts.lines++;
        return Reflect.apply(originals.refreshLineLayers, this, args);
      };
      renderer.updateTradeFlowBuffer = function(...args) {
        counts.tradeFlows++;
        return Reflect.apply(originals.updateTradeFlowBuffer, this, args);
      };
      renderer.setViewOptions({showOceanHeight: input.view.showOceanHeight});
      renderer.setViewOptions({smoothCellBorders: input.view.smoothCellBorders});
      renderer.setLayersVisible([["stateBorders", input.visibility.stateBorders]]);
      renderer.setLayersVisible([["provinceBorders", input.visibility.provinceBorders], ["tradeFlows", true]]);
      renderer.setLayerVisible("tradeFlows", true);
      renderer.dynamicBuffersDirty.tradeFlows = true;
      window.__task322DeferredCoalescing = {
        originals,
        counts,
        batchKeys,
        restore() {
          for (const [name, original] of Object.entries(originals)) renderer[name] = original;
        }
      };
      return {
        deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || 0,
        suspended: Number(renderer.workerRenderInstallSuspended) || 0,
        tradeFlowsDirty: renderer.dynamicBuffersDirty.tradeFlows,
        queuedView: structuredClone(renderer.workerRenderInstallDeferredMutations?.get("view-options")?.value || {}),
        queuedVisibility: [...(renderer.workerRenderInstallDeferredMutations?.get("layer-visibility")?.value || [])]
      };
    }, baseline);
    assert.ok(queued.suspended > 0, "deferred coalescing 未处于 renderer 暂停窗口");
    assert.equal(queued.deferred, 2, "同键 partial patch 未合并为 view-options / layer-visibility 两项");
    assert.equal(queued.tradeFlowsDirty, true, "retired tradeFlows dirty 夹具未建立");
    assert.deepEqual(queued.queuedView, baseline.view, "队列内 partial viewOptions 未合并保留全部字段");
    assert.deepEqual(Object.fromEntries(queued.queuedVisibility), {...baseline.visibility, tradeFlows: false}, "队列内 partial visibility 未合并并归一 retired tradeFlows");
    await releaseSessionCommitPause(page);
    const response = await pending;
    assert.equal(response?.ok, true, `deferred coalescing 正式操作失败：${response?.error?.message || "unknown"}`);
    assert.equal(response.data?.worker?.session?.committed, true, "deferred coalescing session 未提交");
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.tradeFlowBuffer);
      const tradeFlowBytes = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      return {
        history: app.editHistory.getStats(),
        counts: {...window.__task322DeferredCoalescing.counts},
        batchKeys: structuredClone(window.__task322DeferredCoalescing.batchKeys),
        runs: structuredClone(window.__task322SessionCommitPause?.runs || []),
        commits: structuredClone(window.__task322SessionCommitPause?.commits || []),
        session: structuredClone(app.workerTaskCoordinator.getSessionSnapshot?.() || null),
        view: {
          showOceanHeight: Boolean(renderer.viewOptions.showOceanHeight),
          smoothCellBorders: Boolean(renderer.viewOptions.smoothCellBorders)
        },
        visibility: {
          stateBorders: renderer.layerVisibility.stateBorders !== false,
          provinceBorders: renderer.layerVisibility.provinceBorders !== false,
          tradeFlows: renderer.layerVisibility.tradeFlows !== false
        },
        tradeFlows: {
          dirty: renderer.dynamicBuffersDirty.tradeFlows,
          vertexCount: renderer.tradeFlowVertexCount,
          bytes: tradeFlowBytes,
          valid: gl.isBuffer(renderer.tradeFlowBuffer)
        },
        deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || 0,
        suspended: Number(renderer.workerRenderInstallSuspended) || 0
      };
    });
    assert.equal(after.history.undo, baseline.history.undo + 1, "deferred coalescing 未形成唯一历史");
    assert.equal(response.data?.worker?.session?.reused, true, "deferred coalescing render-only 未复用原 session");
    assert.equal(response.data?.worker?.session?.committed, true, "deferred coalescing response session 未提交");
    const renderOnlyRuns = after.runs.filter(record => record.task === "regeneration.compute" && (record.payloadMode === "render-only" || record.sessionPayloadMode === "render-only"));
    assert.equal(renderOnlyRuns.length, 1, "deferred coalescing render-only 调用次数不为 1");
    assert.equal(renderOnlyRuns[0].sessionPayloadOwnMap, false, "deferred coalescing render-only sessionPayload 携带完整 map");
    assert.equal(renderOnlyRuns[0].allowFallback, false, "deferred coalescing render-only 未禁止 fallback");
    assert.deepEqual(after.commits.map(record => ({delta: record.expectedRevisionDelta, completed: record.completed, result: record.result})), [
      {delta: 1, completed: true, result: true},
      {delta: 0, completed: true, result: true}
    ], "deferred coalescing commit 序列必须精确为 delta1:true → delta0:true");
    assert.equal(new Set(after.commits.map(record => record.sessionId)).size, 1, "deferred coalescing delta1/delta0 未指向同一 session");
    assert.equal(after.session?.id, after.commits[0].sessionId, "deferred coalescing 最终 session id 漂移");
    assert.equal(after.session?.status, "idle", "deferred coalescing 最终 session 未回到 idle");
    assert.deepEqual(after.view, baseline.view, "两次 partial viewOptions 未合并保留全部字段");
    assert.deepEqual({stateBorders: after.visibility.stateBorders, provinceBorders: after.visibility.provinceBorders}, baseline.visibility, "两次 partial visibility 未合并保留全部字段");
    assert.equal(after.visibility.tradeFlows, false, "retired tradeFlows 被 deferred 请求重新启用");
    assert.deepEqual(after.counts, {batches: 0, surface: 0, lines: 0, tradeFlows: 0}, "deferred prepared replay 触发了同步 CPU 图层重建");
    assert.deepEqual(after.batchKeys, [], "deferred prepared replay 错误进入同步批次重建");
    assert.deepEqual(after.tradeFlows, {dirty: false, vertexCount: 0, bytes: 0, valid: true}, "retired tradeFlows 未 fail-closed 清空");
    assert.equal(after.deferred, 0, "deferred coalescing 后队列未清空");
    assert.equal(after.suspended, 0, "deferred coalescing 后 renderer 仍暂停");
    await assertNoLongTasks(page, "deferred coalescing");
    return {worker: response.data.worker, counts: after.counts, view: after.view, visibility: after.visibility, tradeFlows: after.tradeFlows};
  } finally {
    await page.evaluate(() => {
      window.__task322SessionCommitPause?.release?.();
      window.__task322SessionCommitPause?.restore?.();
      window.__task322DeferredCoalescing?.restore?.();
      delete window.__task322SessionCommitPause;
      delete window.__task322DeferredCoalescing;
    });
  }
}

async function runDeferredReplayFaultGate(page) {
  await createMap(page, "worker-session-deferred-replay-fault", 10000);
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const gl = renderer.gl;
    const fingerprint = buffer => {
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {byteLength, checksum, valid: gl.isBuffer(buffer)};
    };
    const buffers = {};
    for (const name of ["surfacePatchBuffer", "lineBuffer", "pointBuffer", "routeBuffer", "riverBuffer", "selectionBuffer", "politicalMeshDebugBuffer", "tradeFlowBuffer"]) {
      buffers[name] = {ref: renderer[name], fingerprint: fingerprint(renderer[name])};
    }
    buffers.cityIconInstanceBuffer = {ref: renderer.cityIconLayer.instanceBuffer, fingerprint: fingerprint(renderer.cityIconLayer.instanceBuffer)};
    const probe = {
      map: app.map,
      domain: JSON.stringify({markers: app.map.markers, regeneration: app.map.metadata?.regeneration}),
      history: app.editHistory.getStats(),
      status: ["regeneration-status", "regeneration-constraint", "app-status"].map(id => {
        const node = document.getElementById(id);
        return [id, node?.textContent || "", Boolean(node?.hidden)];
      }),
      buffers,
      surfaceBase: window.__task322SurfaceBaseProbe.capture(renderer),
      picking: renderer.objectPickingIndex,
      markerItems: renderer.markerIconItems,
      markerEntries: renderer.markerIconItems.map(item => ({item, marker: item.marker, node: item.node})),
      city: {
        instances: renderer.cityIconLayer.instances,
        index: renderer.cityIconLayer.instanceIndexById,
        data: renderer.cityIconLayer.instanceData,
        stats: JSON.stringify(renderer.cityIconLayer.stats)
      },
      overlayNodes: [...renderer.overlay.childNodes],
      fingerprint
    };
    window.__task322DeferredReplayFault = probe;
    return {history: probe.history, domain: probe.domain, units: structuredClone(renderer.unitPreferences)};
  });
  await installSessionCommitPause(page);
  await clearLongTasks(page);
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("markers", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 180000});
    const queued = await page.evaluate(input => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322DeferredReplayFault;
      const originalResumePrepared = renderer.resumePreparedWorkerRenderInstall;
      probe.originalResumePrepared = originalResumePrepared;
      probe.faultHits = 0;
      probe.resumeCalls = 0;
      renderer.resumePreparedWorkerRenderInstall = function(snapshot, ...args) {
        probe.resumeCalls++;
        if ((snapshot?.entries || []).some(item => item.key === "unit-preferences") && probe.faultHits === 0) {
          probe.faultHits++;
          const error = new Error("Task322 deferred replay fault");
          error.code = "task322_deferred_replay_fault";
          error.stage = "renderer-resume";
          error.suggestion = "一次性 deferred replay 故障夹具";
          throw error;
        }
        return Reflect.apply(originalResumePrepared, this, [snapshot, ...args]);
      };
      const desired = {...input.units, militaryScale: Math.max(0.1, Number(input.units.militaryScale || 1) + 0.875)};
      const response = window.webglGeneratorApi.units.apply(desired);
      return {
        desired,
        response,
        expectedUnits: structuredClone(response?.data?.units || null),
        deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || 0
      };
    }, baseline);
    assert.equal(queued.response?.ok, true, "deferred replay fault 单位排队失败");
    assert.equal(queued.deferred, 1, "deferred replay fault 未建立唯一单位队列");
    await releaseSessionCommitPause(page);
    const response = await pending;
    assert.equal(response?.ok, false, "deferred replay fault 被 finally 二次 resume 覆盖为成功");
    assert.equal(response?.error?.code, "task322_deferred_replay_fault", "deferred replay fault 原始错误被覆盖");
    await page.waitForTimeout(400);
    await assertNoLongTasks(page, "deferred replay fault");
    await discardProbeLongTasks(page);
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322DeferredReplayFault;
      const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
      const buffers = {};
      for (const [name, item] of Object.entries(probe.buffers)) {
        const current = name === "cityIconInstanceBuffer" ? renderer.cityIconLayer.instanceBuffer : renderer[name];
        buffers[name] = {sameRef: current === item.ref, fingerprint: probe.fingerprint(current), expected: item.fingerprint};
      }
      const markerEntriesExact = renderer.markerIconItems === probe.markerItems
        && probe.markerEntries.length === renderer.markerIconItems.length
        && probe.markerEntries.every((entry, index) => renderer.markerIconItems[index] === entry.item && entry.item.marker === entry.marker && entry.item.node === entry.node && entry.node?.isConnected);
      const status = ["regeneration-status", "regeneration-constraint", "app-status"].map(id => {
        const node = document.getElementById(id);
        return [id, node?.textContent || "", Boolean(node?.hidden)];
      });
      return {
        sameMap: app.map === probe.map && renderer.map === probe.map,
        domain: JSON.stringify({markers: app.map.markers, regeneration: app.map.metadata?.regeneration}),
        history: app.editHistory.getStats(),
        status,
        buffers,
        surfaceBase: {
          exact: window.__task322SurfaceBaseProbe.exact(surfaceBase, probe.surfaceBase),
          current: window.__task322SurfaceBaseProbe.summary(surfaceBase),
          expected: window.__task322SurfaceBaseProbe.summary(probe.surfaceBase)
        },
        surfaceCpu: (() => {
          const values = renderer.surfaceVertices;
          const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
          let checksum = 2166136261;
          for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
          return {byteLength: values.byteLength, checksum};
        })(),
        pickingExact: renderer.objectPickingIndex === probe.picking,
        markerEntriesExact,
        overlayNodesExact: probe.overlayNodes.length === renderer.overlay.childNodes.length && probe.overlayNodes.every((node, index) => renderer.overlay.childNodes[index] === node),
        city: {
          instances: renderer.cityIconLayer.instances === probe.city.instances,
          index: renderer.cityIconLayer.instanceIndexById === probe.city.index,
          data: renderer.cityIconLayer.instanceData === probe.city.data,
          stats: JSON.stringify(renderer.cityIconLayer.stats)
        },
        units: structuredClone(renderer.unitPreferences),
        unitsApi: window.webglGeneratorApi.units.get(),
        militaryUnitsExact: renderer.militaryIconItems.every(item => item.rendererUnitPreferences === renderer.unitPreferences && item.node?.isConnected && item.node.title === item.tooltip && item.node.getAttribute("aria-label") === item.tooltip),
        faultHits: probe.faultHits,
        resumeCalls: probe.resumeCalls,
        runs: structuredClone(window.__task322SessionCommitPause?.runs || []),
        commits: structuredClone(window.__task322SessionCommitPause?.commits || []),
        deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || 0,
        suspended: Number(renderer.workerRenderInstallSuspended) || 0,
        session: app.workerTaskCoordinator.getSessionSnapshot()
      };
    });
    assert.equal(after.sameMap, true, "deferred replay fault 后 map/renderer ownership 漂移");
    assert.equal(after.domain, baseline.domain, "deferred replay fault 未回滚正式领域");
    assert.deepEqual(after.history, baseline.history, "deferred replay fault 未回滚历史");
    assert.deepEqual(after.status, await page.evaluate(() => window.__task322DeferredReplayFault.status), "deferred replay fault 未恢复状态区 DOM");
    for (const [name, value] of Object.entries(after.buffers)) {
      assert.equal(value.sameRef, true, `deferred replay fault ${name} GPU 身份未回滚`);
      assert.deepEqual(value.fingerprint, value.expected, `deferred replay fault ${name} GPU 字节未回滚`);
    }
    for (const [key, value] of Object.entries(after.surfaceBase.exact)) assert.equal(value, true, `deferred replay fault surface base 身份未回滚：${key}`);
    assert.deepEqual(after.surfaceBase.current, after.surfaceBase.expected, "deferred replay fault surface base descriptor/GPU 字节未回滚");
    assert.equal(after.surfaceBase.current.aggregate.byteLength, after.surfaceCpu.byteLength, "deferred replay fault surface base GPU 总字节与 CPU source 不符");
    assert.equal(after.pickingExact, true, "deferred replay fault picking 未回滚");
    assert.equal(after.markerEntriesExact, true, "deferred replay fault marker overlay 未精确回滚");
    assert.equal(after.overlayNodesExact, true, "deferred replay fault overlay DOM 节点身份未精确回滚");
    assert.deepEqual(after.city, {instances: true, index: true, data: true, stats: await page.evaluate(() => window.__task322DeferredReplayFault.city.stats)}, "deferred replay fault cityIconLayer 未精确回滚");
    assert.deepEqual(after.units, queued.expectedUnits, "deferred replay fault 丢失排队单位偏好");
    assert.equal(after.unitsApi?.ok, true, "deferred replay fault 后 units.get 失败");
    assert.deepEqual(after.unitsApi.data.units, queued.expectedUnits, "deferred replay fault 后 API 未返回最终单位偏好");
    assert.equal(after.militaryUnitsExact, true, "deferred replay fault 后军事 DOM 与最终单位偏好不同源");
    assert.equal(after.faultHits, 1, "deferred replay fault 未保持一次性故障语义");
    assert.equal(after.resumeCalls, 2, "deferred replay fault 未精确执行失败与恢复两次 prepared resume");
    assertDeferredPreparedReplaySessionProbe(after, "deferred replay fault", {renderOnlyCount: 0, commitDeltas: [1]});
    assert.equal(after.deferred, 0, "deferred replay fault 后队列丢失或残留");
    assert.equal(after.suspended, 0, "deferred replay fault 后 renderer 仍暂停");
    assert.equal(after.session, null, "deferred replay fault 后失效 session 仍保留");
    await discardProbeLongTasks(page);
    return {error: response.error, expectedUnits: queued.expectedUnits, faultHits: after.faultHits, resumeCalls: after.resumeCalls, buffers: after.buffers};
  } finally {
    await page.evaluate(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      const probe = window.__task322DeferredReplayFault;
      window.__task322SessionCommitPause?.release?.();
      window.__task322SessionCommitPause?.restore?.();
      if (probe?.originalResumePrepared) renderer.resumePreparedWorkerRenderInstall = probe.originalResumePrepared;
      delete window.__task322SessionCommitPause;
      delete window.__task322DeferredReplayFault;
    });
  }
}

async function runDeferredThemeFaultGate(page) {
  await createMap(page, "worker-session-deferred-theme-fault", 10000);
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const themes = window.webglGeneratorApi.layers.listThemes();
    const current = themes?.data?.current || renderer.visualTheme?.id || "default";
    const alternateTheme = (themes?.data?.themes || []).map(item => item.value || item.id).find(value => value && value !== current);
    if (!alternateTheme) throw new Error("deferred theme fault 缺少可切换主题");
    window.__task322DeferredThemeFault = {
      map: app.map,
      domain: JSON.stringify({markers: app.map.markers, regeneration: app.map.metadata?.regeneration}),
      history: app.editHistory.getStats(),
      units: renderer.unitPreferences
    };
    return {alternateTheme, domain: window.__task322DeferredThemeFault.domain, history: window.__task322DeferredThemeFault.history};
  });
  await installSessionCommitPause(page);
  await clearLongTasks(page);
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("markers", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 180000});
    const queued = await page.evaluate(async themeId => {
      const renderer = window.__webglGeneratorApp.renderer;
      const probe = window.__task322DeferredThemeFault;
      const originalResumePrepared = renderer.resumePreparedWorkerRenderInstall;
      probe.originalResumePrepared = originalResumePrepared;
      probe.faultHits = 0;
      probe.resumeCalls = 0;
      renderer.resumePreparedWorkerRenderInstall = function(snapshot, ...args) {
        probe.resumeCalls++;
        if ((snapshot?.entries || []).some(item => item.key === "visual-theme") && probe.faultHits === 0) {
          probe.faultHits++;
          const error = new Error("Task322 deferred theme replay fault");
          error.code = "task322_deferred_theme_fault";
          error.stage = "renderer-resume";
          error.suggestion = "一次性 deferred theme 故障夹具";
          throw error;
        }
        return Reflect.apply(originalResumePrepared, this, [snapshot, ...args]);
      };
      const response = await window.webglGeneratorApi.layers.setTheme(themeId);
      return {
        response,
        apiState: window.webglGeneratorApi.layers.get(),
        controlTheme: document.getElementById("visual-theme-preset")?.value || "",
        deferredKeys: [...renderer.workerRenderInstallDeferredMutations.keys()]
      };
    }, baseline.alternateTheme);
    assert.equal(queued.response?.ok, true, "deferred theme fault 主题排队失败");
    assert.equal(queued.apiState?.ok, true, "deferred theme fault 排队后 layers.get 失败");
    assert.equal(queued.apiState.data.visualTheme, baseline.alternateTheme, "deferred theme fault 排队期间 API 仍读取旧主题");
    assert.equal(queued.controlTheme, baseline.alternateTheme, "deferred theme fault 排队期间 UI 仍显示旧主题");
    assert.deepEqual(queued.deferredKeys, ["visual-theme"], "deferred theme fault 不是 theme-only 队列");
    await releaseSessionCommitPause(page);
    const response = await pending;
    assert.equal(response?.ok, false, "deferred theme fault 被恢复 resume 覆盖为成功");
    assert.equal(response?.error?.code, "task322_deferred_theme_fault", "deferred theme fault 原始错误被覆盖");
    await page.waitForFunction(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      return !renderer.workerRenderInstallSuspended
        && !renderer.workerRenderInstallDeferredMutations.size
        && !renderer.routeRefreshTimer
        && !renderer.routeRefreshActiveVersion;
    }, null, {timeout: 180000});
    await assertNoLongTasks(page, "deferred theme fault");
    await clearLongTasks(page);
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322DeferredThemeFault;
      const gl = renderer.gl;
      const fingerprint = buffer => {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
        const bytes = new Uint8Array(byteLength);
        if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength, checksum, valid: gl.isBuffer(buffer)};
      };
      const typedFingerprint = values => {
        const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength: values.byteLength, checksum};
      };
      const cities = new Map((app.map.settlements?.cities || []).filter(Boolean).map(item => [String(item.id), item]));
      const markers = new Map((app.map.markers?.markers || []).filter(Boolean).map(item => [String(item.id), item]));
      return {
        sameMap: app.map === probe.map && renderer.map === probe.map,
        domain: JSON.stringify({markers: app.map.markers, regeneration: app.map.metadata?.regeneration}),
        history: app.editHistory.getStats(),
        theme: renderer.visualTheme?.id,
        themeApi: window.webglGeneratorApi.layers.get(),
        controlTheme: document.getElementById("visual-theme-preset")?.value || "",
        sameUnits: renderer.unitPreferences === probe.units,
        militaryUnitsExact: renderer.militaryIconItems.every(item => item.rendererUnitPreferences === renderer.unitPreferences && item.node?.isConnected && item.node.title === item.tooltip && item.node.getAttribute("aria-label") === item.tooltip),
        overlayCanonical: renderer.cityIconItems.every(item => item.city === cities.get(String(item.id)))
          && renderer.markerIconItems.every(item => item.marker === markers.get(String(item.id)) && item.node?.isConnected)
          && renderer.labelItems.every(item => item.node?.isConnected),
        pickingCanonical: renderer.objectPickingIndex?.map === undefined || renderer.objectPickingIndex?.map === app.map,
        surface: window.__task322SurfaceBaseProbe.summary(window.__task322SurfaceBaseProbe.capture(renderer)),
        surfaceCpu: typedFingerprint(renderer.surfaceVertices),
        line: {...fingerprint(renderer.lineBuffer), vertexCount: renderer.lineVertexCount},
        faultHits: probe.faultHits,
        resumeCalls: probe.resumeCalls,
        runs: structuredClone(window.__task322SessionCommitPause?.runs || []),
        commits: structuredClone(window.__task322SessionCommitPause?.commits || []),
        session: app.workerTaskCoordinator.getSessionSnapshot(),
        deferred: renderer.workerRenderInstallDeferredMutations.size,
        suspended: Number(renderer.workerRenderInstallSuspended) || 0
      };
    });
    assert.equal(after.sameMap, true, "deferred theme fault 后 map ownership 漂移");
    assert.equal(after.domain, baseline.domain, "deferred theme fault 未回滚领域");
    assert.deepEqual(after.history, baseline.history, "deferred theme fault 未回滚历史");
    assert.equal(after.theme, baseline.alternateTheme, "deferred theme fault 丢失最终主题");
    assert.equal(after.themeApi?.data?.visualTheme, baseline.alternateTheme, "deferred theme fault 后 API 主题不符");
    assert.equal(after.controlTheme, baseline.alternateTheme, "deferred theme fault 后 UI 主题不符");
    assert.equal(after.sameUnits, true, "theme-only deferred fault 改写 unitPreferences 引用");
    assert.equal(after.militaryUnitsExact, true, "theme-only deferred fault 后军事 DOM 混用旧 unitPreferences");
    assert.equal(after.overlayCanonical, true, "deferred theme fault 后 overlay 不同源");
    assert.equal(after.pickingCanonical, true, "deferred theme fault 后 picking 不同源");
    assert.equal(after.surface.aliasMatches, true, "deferred theme fault 后 surface alias 未指向首段");
    assert.equal(after.surface.descriptorsValid, true, "deferred theme fault 后 surface segment descriptor 无效");
    assert.equal(after.surface.segmentCount, after.surface.expectedSegmentCount, "deferred theme fault 后 surface GPU count 不符");
    assert.equal(after.surface.aggregate.byteLength, after.surfaceCpu.byteLength, "deferred theme fault 后 surface GPU 总字节与 CPU source 不符");
    assert.equal(after.line.valid, true, "deferred theme fault 后 line buffer 已删除");
    assert.equal(after.line.byteLength, after.line.vertexCount * 24, "deferred theme fault 后 line GPU bytes 不符");
    assert.equal(after.faultHits, 1, "deferred theme fault 不是一次性故障");
    assert.equal(after.resumeCalls, 2, "deferred theme fault 未精确执行失败与恢复两次 prepared resume");
    assertDeferredPreparedReplaySessionProbe(after, "deferred theme fault", {renderOnlyCount: 1, commitDeltas: [1, 0]});
    assert.equal(after.session, null, "deferred theme fault 后 session 未失效");
    assert.equal(after.deferred, 0, "deferred theme fault 后队列残留");
    assert.equal(after.suspended, 0, "deferred theme fault 后 renderer 仍暂停");
    await discardProbeLongTasks(page);
    return {error: response.error, theme: after.theme, faultHits: after.faultHits, resumeCalls: after.resumeCalls, militaryUnitsExact: after.militaryUnitsExact};
  } finally {
    await page.evaluate(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      const probe = window.__task322DeferredThemeFault;
      window.__task322SessionCommitPause?.release?.();
      window.__task322SessionCommitPause?.restore?.();
      if (probe?.originalResumePrepared) renderer.resumePreparedWorkerRenderInstall = probe.originalResumePrepared;
      delete window.__task322SessionCommitPause;
      delete window.__task322DeferredThemeFault;
    });
  }
}

function assertDeferredPreparedReplaySessionProbe(after, label, {renderOnlyCount, commitDeltas}) {
  const renderOnlyRuns = after.runs.filter(record => record.task === "regeneration.compute" && (record.payloadMode === "render-only" || record.sessionPayloadMode === "render-only"));
  assert.equal(renderOnlyRuns.length, renderOnlyCount, `${label} render-only 调用次数不符`);
  for (const record of renderOnlyRuns) {
    assert.equal(record.sessionPayloadOwnMap, false, `${label} render-only sessionPayload 携带完整 map`);
    assert.equal(record.allowFallback, false, `${label} render-only 未禁止 fallback`);
  }
  assert.deepEqual(after.commits.map(record => ({delta: record.expectedRevisionDelta, completed: record.completed, result: record.result})), commitDeltas.map(delta => ({
    delta,
    completed: true,
    result: true
  })), `${label} commit 序列不符`);
  assert.equal(new Set(after.commits.map(record => record.sessionId)).size, 1, `${label} delta1/delta0 未指向同一 session`);
}

async function runCommittedLateContextSegment(page, label, action) {
  await clearLongTasks(page);
  const startedAt = await page.evaluate(name => {
    performance.mark(`task322-committed-late:${name}:before`);
    return performance.now();
  }, label);
  const value = await action();
  const endedAt = await page.evaluate(name => {
    performance.mark(`task322-committed-late:${name}:after`);
    return performance.now();
  }, label);
  await assertNoLongTasks(page, `committed late context ${label}`);
  await clearLongTasks(page);
  return {value, timing: {label, startedAt, endedAt, durationMs: Math.round((endedAt - startedAt) * 1000) / 1000}};
}

async function runCommittedLateContextGate(page) {
  await createMap(page, "worker-session-committed-late-context", 10000);
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.renderer.setPoliticalMeshDebugMode("states");
    const themes = window.webglGeneratorApi.layers.listThemes();
    const themeItems = themes?.data?.themes || [];
    const currentTheme = themes?.data?.current || app.renderer.visualTheme?.id || "default";
    const alternateTheme = themeItems.map(item => item.value || item.id).find(value => value && value !== currentTheme);
    if (!alternateTheme) throw new Error("late context 缺少可切换视觉主题");
    const city = (app.map.settlements?.cities || []).find(Boolean);
    if (!city) throw new Error("late context 缺少城市选择夹具");
    const route = (app.map.settlements?.routes || []).find(Boolean);
    if (!route) throw new Error("late context 缺少道路高亮夹具");
    return {
      domain: JSON.stringify({
        politics: app.map.politics,
        packStates: app.map.pack?.states,
        packProvinces: app.map.pack?.provinces,
        packStateCells: app.map.pack?.cells?.state,
        packProvinceCells: app.map.pack?.cells?.province,
        settlements: app.map.settlements,
        regeneration: app.map.metadata?.regeneration
      }),
      history: app.editHistory.getStats(),
      alternateTheme,
      cityId: city.id,
      routeId: route.id,
      initialRoutesVisible: app.renderer.layerVisibility.routes !== false,
      initialUnits: structuredClone(app.renderer.unitPreferences)
    };
  });
  await installSessionCommitPause(page);
  await clearLongTasks(page);
  const pending = page.evaluate(() => window.webglGeneratorApi.generate.regenerate("states", {confirm: true}));
  try {
    await page.waitForFunction(() => window.__task322SessionCommitPause?.started === true, null, {timeout: 180000});
    const segments = [];
    const units = await runCommittedLateContextSegment(page, "units", () => page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      return window.webglGeneratorApi.units.apply({militaryScale: Math.max(0.1, Number(app.renderer.unitPreferences.militaryScale || 1) + 0.5)});
    }));
    segments.push(units.timing);
    const theme = await runCommittedLateContextSegment(page, "theme", () => page.evaluate(themeId => window.webglGeneratorApi.layers.setTheme(themeId), baseline.alternateTheme));
    segments.push(theme.timing);
    const visibility = await runCommittedLateContextSegment(page, "route-visibility", () => page.evaluate(() => window.webglGeneratorApi.layers.setVisible("routes", true)));
    segments.push(visibility.timing);
    const selection = await runCommittedLateContextSegment(page, "selection", () => page.evaluate(cityId => window.webglGeneratorApi.selection.select({kind: "city", id: cityId}), baseline.cityId));
    segments.push(selection.timing);
    const highlights = await runCommittedLateContextSegment(page, "highlight", () => page.evaluate(routeId => window.webglGeneratorApi.selection.highlight([{kind: "route", id: routeId}]), baseline.routeId));
    segments.push(highlights.timing);
    const politicalDebug = await runCommittedLateContextSegment(page, "political-debug", () => page.evaluate(() => {
      window.__webglGeneratorApp.renderer.setPoliticalMeshDebugMode("provinces");
      return {ok: true};
    }));
    segments.push(politicalDebug.timing);
    const changed = {
      units: units.value,
      theme: theme.value,
      visibility: visibility.value,
      selection: selection.value,
      highlights: highlights.value,
      politicalDebug: politicalDebug.value
    };
    for (const [name, response] of Object.entries(changed)) assert.equal(response?.ok, true, `late context ${name} 切换失败：${response?.error?.message || "unknown"}`);
    const resize = await runCommittedLateContextSegment(page, "resize", () => page.setViewportSize({width: 1176, height: 768}));
    segments.push(resize.timing);
    const wheel = await runCommittedLateContextSegment(page, "wheel", async () => {
      await page.evaluate(() => {
        const canvas = document.getElementById("map-canvas");
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new WheelEvent("wheel", {
          deltaY: -420,
          clientX: rect.left + rect.width * 0.58,
          clientY: rect.top + rect.height * 0.46,
          bubbles: true,
          cancelable: true
        }));
      });
      await page.waitForTimeout(300);
    });
    segments.push(wheel.timing);
    const capturedContext = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const size = app.renderer.canvasSize || {};
      return {
        units: structuredClone(app.renderer.unitPreferences),
        theme: app.renderer.visualTheme?.id,
        debug: app.renderer.politicalMeshDebugMode,
        routesVisible: app.renderer.layerVisibility.routes !== false,
        selection: app.renderer.selection ? {kind: app.renderer.selection.kind, id: app.renderer.selection.id} : null,
        highlights: (app.renderer.objectHighlights || []).map(item => ({kind: item.kind, id: item.id})),
        camera: JSON.stringify(app.renderer.camera),
        canvas: [app.renderer.canvas.width, app.renderer.canvas.height, size.cssWidth, size.cssHeight]
      };
    });
    const desired = {
      ...capturedContext,
      units: changed.units.data.units,
      theme: baseline.alternateTheme,
      debug: "provinces",
      routesVisible: true,
      selection: {kind: "city", id: baseline.cityId},
      highlights: [{kind: "route", id: baseline.routeId}]
    };
    await clearLongTasks(page);
    const release = await runCommittedLateContextSegment(page, "release", async () => {
      await releaseSessionCommitPause(page);
      const value = await pending;
      await page.waitForTimeout(500);
      return value;
    });
    segments.push(release.timing);
    const response = release.value;
    assert.equal(response?.ok, false, "prepared commit 后 late context 仍错误提交 Worker 结果");
    const after = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const gl = renderer.gl;
      const fingerprint = buffer => {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
        const bytes = new Uint8Array(byteLength);
        if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength, checksum, valid: gl.isBuffer(buffer)};
      };
      const typedFingerprint = values => {
        const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength: values.byteLength, checksum};
      };
      const buffers = {
        surface: window.__task322SurfaceBaseProbe.summary(window.__task322SurfaceBaseProbe.capture(renderer)),
        surfacePatch: fingerprint(renderer.surfacePatchBuffer),
        line: fingerprint(renderer.lineBuffer),
        point: fingerprint(renderer.pointBuffer),
        route: fingerprint(renderer.routeBuffer),
        debug: fingerprint(renderer.politicalMeshDebugBuffer)
      };
      const expected = {
        surface: typedFingerprint(renderer.surfaceVertices),
        surfacePatch: typedFingerprint(renderer.surfacePatchVertices),
        debug: typedFingerprint(renderer.politicalVisualMeshes?.[renderer.politicalMeshDebugMode]?.vertices || new Float32Array())
      };
      const cities = new Map((app.map.settlements?.cities || []).filter(Boolean).map(city => [String(city.id), city]));
      const markers = new Map((app.map.markers?.markers || []).filter(Boolean).map(marker => [String(marker.id), marker]));
      const selectionStoreObject = app.selectionStore.getSnapshot().selection?.object || null;
      const selectedCity = renderer.selection?.kind === "city" ? cities.get(String(renderer.selection.id)) : null;
      const selectionResolved = renderer.selection
        ? window.webglGeneratorApi.selection.resolve({kind: renderer.selection.kind, id: renderer.selection.id})
        : {ok: true, data: null};
      const selectionSource = selectedCity && renderer.selection ? {
        exists: true,
        id: renderer.selection.id === selectedCity.id,
        name: renderer.selection.name === selectedCity.name,
        stateId: renderer.selection.stateId === selectedCity.state,
        provinceId: renderer.selection.provinceId === selectedCity.province
      } : {exists: false, id: false, name: false, stateId: false, provinceId: false};
      const overlayCanonical = renderer.cityIconItems.every(item => item.city === cities.get(String(item.id)))
        && renderer.markerIconItems.every(item => item.marker === markers.get(String(item.id)) && item.node?.isConnected)
        && renderer.labelItems.every(item => item.node?.isConnected);
      let routePickingCanonical = true;
      const routes = new Map((app.map.settlements?.routes || []).filter(Boolean).map(route => [String(route.id), route]));
      for (const bucket of renderer.objectPickingIndex?.buckets?.values?.() || []) {
        for (const segment of bucket.routeSegments || []) if (segment.route !== routes.get(String(segment.route?.id))) routePickingCanonical = false;
      }
      const highlightSemantics = (renderer.objectHighlights || []).map(item => {
        const rawRoute = item.kind === "route" ? routes.get(String(item.id)) : null;
        const resolved = window.webglGeneratorApi.selection.resolve({kind: item.kind, id: item.id});
        return {
          semantic: structuredClone(item),
          resolved,
          rawExists: Boolean(rawRoute),
          notRawReference: !rawRoute || item !== rawRoute,
          rawSource: rawRoute ? {
            id: item.id === rawRoute.id,
            type: item.type === rawRoute.type,
            fromId: item.fromId === rawRoute.from,
            toId: item.toId === rawRoute.to
          } : null
        };
      });
      const size = renderer.canvasSize || {};
      return {
        domain: JSON.stringify({
          politics: app.map.politics,
          packStates: app.map.pack?.states,
          packProvinces: app.map.pack?.provinces,
          packStateCells: app.map.pack?.cells?.state,
          packProvinceCells: app.map.pack?.cells?.province,
          settlements: app.map.settlements,
          regeneration: app.map.metadata?.regeneration
        }),
        history: app.editHistory.getStats(),
        context: {
          units: structuredClone(renderer.unitPreferences),
          theme: renderer.visualTheme?.id,
          debug: renderer.politicalMeshDebugMode,
          routesVisible: renderer.layerVisibility.routes !== false,
          selection: renderer.selection ? {kind: renderer.selection.kind, id: renderer.selection.id} : null,
          selectionStoreExact: renderer.selection === selectionStoreObject,
          selectionSemantic: renderer.selection ? structuredClone(renderer.selection) : null,
          selectionResolved,
          selectionNotRawReference: !selectedCity || renderer.selection !== selectedCity,
          selectionSource,
          highlights: (renderer.objectHighlights || []).map(item => ({kind: item.kind, id: item.id})),
          highlightSemantics,
          camera: JSON.stringify(renderer.camera),
          overlayCamera: JSON.stringify(renderer.overlayCommittedCamera),
          canvas: [renderer.canvas.width, renderer.canvas.height, size.cssWidth, size.cssHeight]
        },
        buffers,
        expected,
        counts: {
          surface: renderer.vertexCount,
          surfacePatch: renderer.surfacePatchVertexCount,
          line: renderer.lineVertexCount,
          pointBuffer: renderer.pointBufferVertexCount,
          pointBufferExpected: renderer.pointDrawRanges.reduce((total, range) => total + range.count, 0),
          pointVisible: renderer.pointVertexCount,
          pointVisibleExpected: renderer.pointDrawRanges.reduce((total, range) => total + (renderer.layerVisibility[range.layer] !== false ? range.count : 0), 0),
          route: renderer.routeVertexCount,
          debug: renderer.politicalMeshDebugVertexCount
        },
        dirtyRoutes: renderer.dynamicBuffersDirty.routes,
        overlayCanonical,
        routePickingCanonical,
        rendererMapCanonical: renderer.map === app.map,
        timers: {
          route: Boolean(renderer.routeRefreshTimer),
          routeActive: Number(renderer.routeRefreshActiveVersion) || 0,
          viewport: Boolean(renderer.viewportCommitTimer),
          viewportFrame: Boolean(renderer.viewportPreviewFrame),
          suspended: Number(renderer.workerRenderInstallSuspended) || 0,
          interaction: Boolean(renderer.overlayInteractionSuspended)
        }
      };
    });
    assert.equal(after.domain, baseline.domain, "prepared commit late context 未回滚正式领域");
    assert.deepEqual(after.history, baseline.history, "prepared commit late context 未回滚历史");
    assert.deepEqual(after.context.units, desired.units, "prepared commit 回滚覆盖晚到单位偏好");
    for (const key of ["theme", "debug", "routesVisible", "selection", "highlights", "camera", "canvas"]) assert.deepEqual(after.context[key], desired[key], `prepared commit 回滚覆盖晚到 context：${key}`);
    assert.equal(after.context.overlayCamera, after.context.camera, "late context 最终 overlay camera 未提交");
    assert.equal(after.context.selectionStoreExact, true, "late context renderer selection 与 selectionStore 引用不一致");
    assert.equal(after.context.selectionResolved?.ok, true, "late context selection fresh resolve 失败");
    assert.deepEqual(after.context.selectionSemantic, after.context.selectionResolved.data, "late context selection 与 fresh resolve 语义不同源");
    assert.equal(after.context.selectionNotRawReference, true, "late context selection 错误复用了 raw city 引用");
    assert.deepEqual(after.context.selectionSource, {exists: true, id: true, name: true, stateId: true, provinceId: true}, "late context selection 未来自当前地图 city 字段");
    for (const highlight of after.context.highlightSemantics) {
      assert.equal(highlight.resolved?.ok, true, "late context highlight fresh resolve 失败");
      assert.deepEqual(highlight.semantic, highlight.resolved.data, "late context highlight 与 fresh resolve 语义不同源");
      assert.equal(highlight.rawExists, true, "late context highlight 对应 raw route 不在当前地图");
      assert.equal(highlight.notRawReference, true, "late context highlight 错误复用了 raw route 引用");
      assert.deepEqual(highlight.rawSource, {id: true, type: true, fromId: true, toId: true}, "late context highlight 未来自当前地图 route 字段");
    }
    assert.equal(after.rendererMapCanonical, true, "late context renderer.map 不是正式地图");
    assert.equal(after.overlayCanonical, true, "late context overlay 仍引用 Worker / 旧领域对象");
    assert.equal(after.routePickingCanonical, true, "late context route picking 仍引用 Worker / 旧领域对象");
    assert.equal(after.buffers.surface.aliasMatches, true, "late context surface alias 未指向首段");
    assert.equal(after.buffers.surface.descriptorsValid, true, "late context surface segment descriptor 无效");
    assert.equal(after.buffers.surface.segmentCount, after.buffers.surface.expectedSegmentCount, "late context surface GPU count 不符");
    for (const [key, value] of Object.entries(after.buffers)) if (key !== "surface") assert.equal(value.valid, true, "late context 留下已删除 GPU buffer");
    assert.equal(after.buffers.surface.aggregate.byteLength, after.expected.surface.byteLength, "late context surface GPU 总字节与 CPU source 不符");
    for (const key of ["surfacePatch", "debug"]) assert.deepEqual({byteLength: after.buffers[key].byteLength, checksum: after.buffers[key].checksum}, after.expected[key], `late context ${key} GPU / CPU 不同源`);
    assert.equal(after.buffers.surface.aggregate.byteLength, after.counts.surface * 24, "late context surface GPU bytes 与 vertexCount 不符");
    assert.equal(after.counts.pointBuffer, after.counts.pointBufferExpected, "late context point buffer 顶点数与完整 drawRanges 不符");
    assert.equal(after.counts.pointVisible, after.counts.pointVisibleExpected, "late context point 可见顶点数与 visibility/drawRanges 不符");
    for (const key of ["surfacePatch", "line", "route", "debug"]) assert.equal(after.buffers[key].byteLength, after.counts[key] * 24, `late context ${key} GPU bytes 与 vertexCount 不符`);
    assert.equal(after.buffers.point.byteLength, after.counts.pointBuffer * 24, "late context point GPU bytes 与完整 buffer vertexCount 不符");
    assert.deepEqual(after.timers, {route: false, routeActive: 0, viewport: false, viewportFrame: false, suspended: 0, interaction: false}, "late context 留下异步 timer / interaction 状态");
    if (after.context.routesVisible) assert.equal(after.dirtyRoutes, false, "late context 可见道路仍为 dirty");
    await discardProbeLongTasks(page);
    return {error: response.error, desired, segments, context: after.context, buffers: after.buffers, counts: after.counts, timers: after.timers};
  } finally {
    await page.evaluate(() => {
      window.__task322SessionCommitPause?.release?.();
      window.__task322SessionCommitPause?.restore?.();
      delete window.__task322SessionCommitPause;
    });
  }
}

async function runPendingViewportGate(page) {
  const results = {};
  for (const mode of ["success", "fault"]) {
    await createMap(page, "worker-session-late-pan", 10000);
    await clearLongTasks(page);
    const started = await page.evaluate(async targetMode => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const canvas = renderer.canvas;
      const originalSchedule = renderer.scheduleViewportCommit;
      let scheduled = 0;
      renderer.scheduleViewportCommit = function(options = {}) {
        scheduled++;
        return Reflect.apply(originalSchedule, this, [{...options, delayMs: 60000}]);
      };
      const domain = JSON.stringify({markers: app.map.markers, regeneration: app.map.metadata?.regeneration});
      const history = app.editHistory.getStats();
      const map = app.map;
      const rect = canvas.getBoundingClientRect();
      const wheelAt = performance.now();
      canvas.dispatchEvent(new WheelEvent("wheel", {
        deltaY: -280,
        clientX: rect.left + rect.width * 0.61,
        clientY: rect.top + rect.height * 0.43,
        bubbles: true,
        cancelable: true
      }));
      renderer.scheduleViewportCommit = originalSchedule;
      const operationStartedAt = performance.now();
      if (!renderer.overlayInteractionSuspended || !renderer.viewportCommitTimer || !renderer.viewportCommitEvent || scheduled !== 1) {
        throw new Error(`pending viewport 夹具未建立：${JSON.stringify({interaction: renderer.overlayInteractionSuspended, timer: Boolean(renderer.viewportCommitTimer), event: Boolean(renderer.viewportCommitEvent), scheduled})}`);
      }
      const camera = JSON.stringify(renderer.camera);
      window.__task322PendingViewport = {
        map,
        domain,
        history,
        camera,
        wheelToOperationMs: operationStartedAt - wheelAt,
        timerBefore: Boolean(renderer.viewportCommitTimer),
        eventBefore: Boolean(renderer.viewportCommitEvent),
        interactionBefore: renderer.overlayInteractionSuspended,
        scheduled
      };
      if (targetMode === "fault") window.__webglGeneratorWorkerRefreshFault = {kind: "markers", stage: "after-render", mode: "once", hits: 0};
      const runtimeGenerate = app.runtimeActions?.generate;
      const originalRegenerate = runtimeGenerate?.regenerate;
      if (typeof originalRegenerate !== "function") throw new Error("pending viewport 缺少 runtime generate action");
      let rawError = null;
      let wrapperCalls = 0;
      const serialize = (error, seen = new Set()) => {
        if (!error || typeof error !== "object") return error == null ? null : {message: String(error)};
        if (seen.has(error)) return {circular: true};
        seen.add(error);
        const value = {
          name: String(error.name || "Error"),
          code: error.code ? String(error.code) : null,
          message: String(error.message || error),
          stage: error.stage ? String(error.stage) : null,
          details: error.details == null ? null : structuredClone(error.details)
        };
        if (error.cause) value.cause = serialize(error.cause, seen);
        if (error.originalError) value.originalError = serialize(error.originalError, seen);
        if (error.recoveryError) value.recoveryError = serialize(error.recoveryError, seen);
        if (Array.isArray(error.errors)) value.errors = error.errors.map(item => serialize(item, seen));
        return value;
      };
      runtimeGenerate.regenerate = async function(...args) {
        wrapperCalls += 1;
        try {
          return await Reflect.apply(originalRegenerate, this, args);
        } catch (error) {
          rawError = serialize(error);
          throw error;
        }
      };
      let response;
      try {
        response = await window.webglGeneratorApi.generate.regenerate("markers", {confirm: true});
      } finally {
        runtimeGenerate.regenerate = originalRegenerate;
      }
      delete window.__webglGeneratorWorkerRefreshFault;
      return {response, rawError, wrapperCalls, wheelToOperationMs: operationStartedAt - wheelAt, camera: JSON.parse(camera)};
    }, mode);
    assert.ok(started.wheelToOperationMs >= 0 && started.wheelToOperationMs < 120, `${mode} pending viewport 未在 120ms 内启动 regenerate`);
    if (mode === "success") {
      assert.equal(started.response?.ok, true, `pending viewport success 操作失败：${started.response?.error?.message || "unknown"}`);
      assert.equal(started.response.data?.worker?.session?.committed, true, "pending viewport success session 未提交");
    } else {
      assert.equal(started.response?.ok, false, "pending viewport fault 未拒绝操作");
      assert.equal(started.response?.error?.code, "worker_regeneration_refresh_fault", "pending viewport fault 公开错误码不符");
      assert.equal(started.wrapperCalls, 1, `pending viewport fault action wrapper 调用次数不符：${started.wrapperCalls}`);
      assert.equal(errorTreeHasCode(started.rawError, "worker_regeneration_refresh_fault"), true, `pending viewport fault 原始 cause 缺少 refresh fault 码：${JSON.stringify(started.rawError)}`);
    }
    await page.waitForFunction(() => {
      const renderer = window.__webglGeneratorApp.renderer;
      return !renderer.viewportCommitTimer
        && !renderer.viewportCommitEvent
        && !renderer.viewportPreviewFrame
        && !renderer.overlayInteractionSuspended
        && !renderer.viewportPointerInteractionKind
        && !renderer.workerRenderInstallSuspended
        && (!renderer.layerVisibility.routes || !renderer.dynamicBuffersDirty.routes)
        && (!renderer.layerVisibility.rivers || !renderer.dynamicBuffersDirty.rivers);
    }, null, {timeout: 180000});
    await assertNoLongTasks(page, `pending viewport ${mode}`);
    await clearLongTasks(page);
    const capture = () => page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322PendingViewport;
      const gl = renderer.gl;
      const fingerprint = buffer => {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
        const bytes = new Uint8Array(byteLength);
        if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        let checksum = 2166136261;
        for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
        return {byteLength, checksum, valid: gl.isBuffer(buffer)};
      };
      const cameraMatches = candidate => candidate && ["scale", "offsetX", "offsetY"].every(key => Math.abs(Number(candidate[key]) - Number(renderer.camera[key])) < 1e-9);
      return {
        sameMap: app.map === probe.map && renderer.map === probe.map,
        domain: JSON.stringify({markers: app.map.markers, regeneration: app.map.metadata?.regeneration}),
        history: app.editHistory.getStats(),
        camera: JSON.stringify(renderer.camera),
        overlayCamera: JSON.stringify(renderer.overlayCommittedCamera),
        routeCameraMatches: cameraMatches(renderer.routeBufferCamera),
        riverCameraMatches: cameraMatches(renderer.riverBufferCamera),
        route: {...fingerprint(renderer.routeBuffer), vertexCount: renderer.routeVertexCount},
        river: {...fingerprint(renderer.riverBuffer), vertexCount: renderer.riverVertexCount},
        timers: {
          timer: Boolean(renderer.viewportCommitTimer),
          event: Boolean(renderer.viewportCommitEvent),
          frame: Boolean(renderer.viewportPreviewFrame),
          interaction: Boolean(renderer.overlayInteractionSuspended),
          pointer: renderer.viewportPointerInteractionKind || null,
          installSuspended: Number(renderer.workerRenderInstallSuspended) || 0,
          installViewportChanged: Boolean(renderer.workerRenderInstallViewportChanged)
        },
        css: {
          stageClass: renderer.stage?.classList.contains("map-stage--interaction-transform") || false,
          overlayClass: renderer.overlay?.classList.contains("map-overlay--interaction-transform") || false,
          transform: renderer.stage?.style.getPropertyValue("--map-interaction-transform") || "",
          inverseScale: renderer.stage?.style.getPropertyValue("--map-interaction-inverse-scale") || "",
          labelOpacity: renderer.stage?.style.getPropertyValue("--state-label-preview-opacity") || ""
        },
        version: renderer.viewportCommitVersion,
        loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
          + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
      };
    });
    const after = await capture();
    assert.equal(after.sameMap, true, `${mode} pending viewport 后 map ownership 漂移`);
    assert.equal(after.camera, JSON.stringify(started.camera), `${mode} pending viewport 最终 camera 被覆盖`);
    assert.equal(after.overlayCamera, after.camera, `${mode} pending viewport overlay camera 未提交`);
    assert.equal(after.routeCameraMatches, true, `${mode} pending viewport routeBufferCamera 未追上最终 camera`);
    assert.equal(after.riverCameraMatches, true, `${mode} pending viewport riverBufferCamera 未追上最终 camera`);
    for (const [name, value] of [["route", after.route], ["river", after.river]]) {
      assert.equal(value.valid, true, `${mode} pending viewport ${name} buffer 已删除`);
      assert.equal(value.byteLength, value.vertexCount * 24, `${mode} pending viewport ${name} GPU bytes 与 vertexCount 不符`);
    }
    assert.deepEqual(after.timers, {timer: false, event: false, frame: false, interaction: false, pointer: null, installSuspended: 0, installViewportChanged: false}, `${mode} pending viewport 留下 timer/event/pointer`);
    assert.deepEqual(after.css, {stageClass: false, overlayClass: false, transform: "", inverseScale: "", labelOpacity: ""}, `${mode} pending viewport 留下 CSS transform`);
    assert.equal(after.loadingVisible, 0, `${mode} pending viewport 未清 Loading`);
    const baseline = await page.evaluate(() => ({domain: window.__task322PendingViewport.domain, history: window.__task322PendingViewport.history}));
    if (mode === "fault") {
      assert.equal(after.domain, baseline.domain, "pending viewport fault 未回滚领域");
      assert.deepEqual(after.history, baseline.history, "pending viewport fault 未回滚历史");
    } else {
      assert.equal(after.history.undo, baseline.history.undo + 1, "pending viewport success 未形成唯一历史");
    }
    await page.waitForTimeout(400);
    const stable = await capture();
    assert.deepEqual(stable, after, `${mode} pending viewport 存在 late write`);
    await discardProbeLongTasks(page);
    results[mode] = {response: started.response, wheelToOperationMs: started.wheelToOperationMs, state: after};
    await page.evaluate(() => {
      delete window.__task322PendingViewport;
      delete window.__webglGeneratorWorkerRefreshFault;
    });
  }
  return results;
}

async function runHundredThousandRoutesDiagnosticGate(page, cdp) {
  await createMap(page, "worker-session-100k-routes-diagnostic", 100000);
  const rivers = await regenerate(page, cdp, "rivers");
  await discardProbeLongTasks(page);
  const rendererPerformanceAfterRivers = await readRendererPerformanceEvents(page);
  const sessionAfterRivers = await page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
  assert.equal(sessionAfterRivers?.status, "idle", "100k routes 诊断 rivers 后 session 未回到 idle");
  assert.equal(rivers.worker.session?.id, sessionAfterRivers?.id, "100k routes 诊断 rivers response/session snapshot id 不同源");
  mkdirSync(hundredThousandRoutesDiagnosticDir, {recursive: true});
  const installed = await installHundredThousandRoutesDiagnosticProbe(page);
  const attempts = [];
  try {
    for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex++) {
      await page.evaluate(async index => {
        const trace = window.__task322HundredThousandRoutesDiagnostic;
        await trace.drain();
        trace.begin(index);
      }, attemptIndex);
      const performanceBefore = await readRendererPerformanceEvents(page);
      const metricsBefore = indexMetrics(await cdp.send("Performance.getMetrics"));
      const wallStartedAt = Date.now();
      const response = await page.evaluate(async index => {
        const trace = window.__task322HundredThousandRoutesDiagnostic;
        const value = await window.webglGeneratorApi.generate.regenerate("routes", {confirm: true});
        trace.persistResponse(index, value);
        return value;
      }, attemptIndex);
      const wallMs = Date.now() - wallStartedAt;
      writeFileSync(join(hundredThousandRoutesDiagnosticDir, `routes-response-${attemptIndex}.json`), `${JSON.stringify(response, null, 2)}\n`, "utf8");
      assert.equal(response?.ok, true, `100k routes 诊断 #${attemptIndex} 重生成失败：${response?.error?.code || "unknown"}`);
      const worker = response.data?.worker;
      assert.equal(worker?.mode, "worker", `100k routes 诊断 #${attemptIndex} 未使用 Worker`);
      assert.equal(worker?.accepted, true, `100k routes 诊断 #${attemptIndex} Worker 未 accepted`);
      assert.equal(worker?.session?.reused, true, `100k routes 诊断 #${attemptIndex} 未复用 rivers session`);
      assert.equal(worker?.session?.committed, true, `100k routes 诊断 #${attemptIndex} session 未提交`);
      assert.equal(worker?.session?.id, sessionAfterRivers.id, `100k routes 诊断 #${attemptIndex} session id 漂移`);
      assert.ok(Number(worker?.telemetry?.inputPackets) <= 4, `100k routes 诊断 #${attemptIndex} 复用仍传全图：${worker?.telemetry?.inputPackets}`);
      assertTelemetry(worker.telemetry, `100k routes diagnostic #${attemptIndex}`);
      const trace = await page.evaluate(async () => {
        const diagnostic = window.__task322HundredThousandRoutesDiagnostic;
        await diagnostic.drain();
        return diagnostic.finish();
      });
      const performanceAfter = await readRendererPerformanceEvents(page);
      const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
      const performanceDiff = Object.fromEntries(Object.entries(performanceAfter)
        .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(performanceBefore[name])));
      const attempt = {
        ...trace,
        wallMs,
        response: {
          ok: response.ok,
          error: response.error || null,
          data: {
            kind: response.data?.kind,
            executed: response.data?.executed,
            worker: {
              mode: worker.mode,
              accepted: worker.accepted,
              session: worker.session,
              telemetry: worker.telemetry
            }
          }
        },
        rendererPerformanceDiff: performanceDiff,
        taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000)
      };
      attempts.push(attempt);
      if (attempt.longTasks.length) break;
    }
    const finalSignals = await readSignals(page);
    const finalSession = await page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
    return {
      rivers: summarizeResult(rivers),
      rendererPerformanceAfterRivers,
      sessionAfterRivers,
      installed,
      attempts,
      hitAttempt: attempts.find(item => item.longTasks.length)?.index || null,
      finalSession,
      finalSignals
    };
  } finally {
    await page.evaluate(() => {
      window.__task322HundredThousandRoutesDiagnostic?.restore?.();
      delete window.__task322HundredThousandRoutesDiagnostic;
    });
  }
}

async function runHundredThousandFreshRoutesDiagnosticGate(page, cdp) {
  await createMap(page, "worker-session-100k-fresh-routes-diagnostic", 100000);
  await discardProbeLongTasks(page);
  const adoptedBeforeReset = await readWorkerSessionSnapshot(page);
  assertIdleAdoptedSession(adoptedBeforeReset, "100k fresh routes diagnostic generation");
  const adoptionInvalidated = await page.evaluate(() => window.__webglGeneratorApp.workerTaskCoordinator.invalidateSession("task322-fresh-routes-diagnostic-reset"));
  assert.equal(adoptionInvalidated, true, "100k fresh routes 诊断未显式失效 generation session");
  const sessionBeforeRivers = await page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
  assert.equal(sessionBeforeRivers, null, "100k fresh routes 正式 rivers 前 coordinator session 非空");
  const rivers = await regenerate(page, cdp, "rivers");
  assert.equal(rivers.worker.session.reused, false, "100k fresh routes 前置 rivers 不是 fresh session");
  await clearLongTasks(page);
  const cancellation = await cancelAcceptedWorkerOperation(page, "zones");
  await assertNoLongTasks(page, "100k fresh routes 前置 accepted-cancel zones");
  const sessionAfterCancellation = await page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
  assert.equal(sessionAfterCancellation, null, "100k fresh routes 前置 accepted-cancel 未清空 coordinator session");
  await discardProbeLongTasks(page);
  const sessionReset = {
    adoptedBeforeReset,
    adoptionInvalidated,
    before: sessionBeforeRivers,
    rivers: summarizeResult(rivers),
    cancellation: {
      hit: cancellation.hit,
      cancelled: cancellation.cancelled,
      progress: cancellation.progress,
      errorCode: cancellation.response?.error?.code || null
    },
    after: sessionAfterCancellation
  };

  mkdirSync(hundredThousandFreshRoutesDiagnosticDir, {recursive: true});
  const installed = await installHundredThousandRoutesDiagnosticProbe(page);
  try {
    const overlayBefore = await captureHundredThousandFreshRoutesOverlayBaseline(page);
    await page.evaluate(async () => {
      const trace = window.__task322HundredThousandRoutesDiagnostic;
      await trace.drain();
      trace.begin(1);
    });
    const performanceBefore = await readRendererPerformanceEvents(page);
    const metricsBefore = indexMetrics(await cdp.send("Performance.getMetrics"));
    const wallStartedAt = Date.now();
    const response = await page.evaluate(async () => {
      const trace = window.__task322HundredThousandRoutesDiagnostic;
      const value = await window.webglGeneratorApi.generate.regenerate("routes", {confirm: true});
      trace.persistResponse(1, value);
      return value;
    });
    const wallMs = Date.now() - wallStartedAt;
    const rawTrace = await page.evaluate(async () => {
      const trace = window.__task322HundredThousandRoutesDiagnostic;
      await trace.drain();
      return trace.finish();
    });
    const preAssertion = await captureHundredThousandFreshRoutesPreAssertion(page, overlayBefore, rawTrace);
    const performanceAfterTrace = await readRendererPerformanceEvents(page);
    const metricsAfterTrace = indexMetrics(await cdp.send("Performance.getMetrics"));
    const sessionAfterTrace = await page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
    const failureDump = compactHundredThousandFreshRoutesDiagnostic({
      sessionReset,
      installed,
      wallMs,
      response,
      trace: rawTrace,
      rendererPerformanceDiff: Object.fromEntries(Object.entries(performanceAfterTrace)
        .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(performanceBefore[name]))),
      taskDurationDeltaMs: roundMs((metricsAfterTrace.TaskDuration - metricsBefore.TaskDuration) * 1000),
      finalSession: sessionAfterTrace,
      overlayBefore,
      overlayReuse: null,
      sourceParity: null,
      bufferParity: null,
      preAssertion
    });
    writeFileSync(hundredThousandFreshRoutesDiagnosticPath, `${JSON.stringify(failureDump, null, 2)}\n`, "utf8");
    assertHundredThousandFreshRoutesPerformance(rawTrace, response);
    assert.equal(Number(rawTrace.methodSummary?.["overlay:replaceChildren"]?.count || 0), 1, "100k fresh routes overlay 未精确执行一次原子替换");
    assert.equal(Number(rawTrace.methodSummary?.["city:setInstances"]?.count || 0), 1, "100k fresh routes 未精确更新一次 city instance GPU");
    const slowSync = Object.entries(rawTrace.methodSummary || {})
      .filter(([key]) => key.startsWith("city:") || key.startsWith("gl:"))
      .filter(([, summary]) => Number(summary?.maxMs) >= 50)
      .map(([key, summary]) => ({key, maxMs: summary.maxMs}));
    assert.deepEqual(slowSync, [], `100k fresh routes city/GL 同步调用超预算：${JSON.stringify(slowSync)}`);
    assert.deepEqual(rawTrace.healthEvents.filter(event => event?.severity === "error"), [], "100k fresh routes 产品窗口出现 error health");
    assert.equal(rawTrace.responseSignals?.loadingVisible, 0, "100k fresh routes response 后 Loading 未清理");
    assert.equal(rawTrace.responseSignals?.glError, 0, "100k fresh routes response 后 WebGL error 非0");
    for (const key of ["routeDirty", "routeTimer", "routeActive", "viewportTimer", "installSuspended", "glError", "loadingVisible"]) {
      assert.equal(Number(rawTrace.scalarSignals?.[key] || 0), 0, `100k fresh routes 结束信号 ${key} 未清零`);
    }
    const overlayInstall = await assertHundredThousandFreshRoutesOverlayInstall(page, overlayBefore);
    assert.ok(Number(overlayInstall.portTopology.moved || 0) + Number(overlayInstall.portTopology.cleared || 0) + Number(overlayInstall.portTopology.synced || 0) > 0,
      `100k fresh routes 固定seed未实际触发港口拓扑变更：${JSON.stringify(overlayInstall.portTopology)}`);
    const sourceParity = await assertRouteMarkerSourceParity(page);
    const bufferParity = await assertHundredThousandFreshRoutesBufferParity(page);
    await discardProbeLongTasks(page);
    const performanceAfter = await readRendererPerformanceEvents(page);
    const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
    const finalSession = await page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
    return compactHundredThousandFreshRoutesDiagnostic({
      sessionReset,
      installed,
      wallMs,
      response,
      trace: rawTrace,
      rendererPerformanceDiff: Object.fromEntries(Object.entries(performanceAfter)
        .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(performanceBefore[name]))),
      taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000),
      finalSession,
      overlayBefore,
      overlayReuse: overlayInstall,
      sourceParity,
      bufferParity,
      preAssertion
    });
  } finally {
    await page.evaluate(() => {
      window.__task322HundredThousandRoutesDiagnostic?.restore?.();
      delete window.__task322HundredThousandRoutesDiagnostic;
      delete window.__task322FreshRoutesOverlayBaseline;
    });
  }
}

function assertHundredThousandFreshRoutesPerformance(trace, response) {
  const longTasks = trace.longTasks || [];
  assert.deepEqual(longTasks, [], "100k fresh routes 捕获主线程 LongTask");
  const telemetry = response?.data?.worker?.telemetry || {};
  for (const [key, value] of [
    ["inputPostMaxMs", telemetry.inputPostMaxMs],
    ["outputDecodeMaxMs", telemetry.outputDecodeMaxMs],
    ["outputWorkerPostMaxMs", telemetry.outputWorkerPostMaxMs],
    ["commitInstallMs", telemetry.commitInstallMs],
    ["renderInstallCommitMs", telemetry.renderInstallCommitMs],
    ["uiRefreshMs", telemetry.uiRefreshMs]
  ]) assert.ok(Number(value) < 50, `100k fresh routes 阶段A ${key} 超预算：${value}`);
}

async function captureHundredThousandFreshRoutesPreAssertion(page, before, trace) {
  return page.evaluate(({before, replaceChildrenCount}) => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const map = app.map;
    const probe = window.__task322FreshRoutesOverlayBaseline;
    const capture = window.__task322HundredThousandRoutesDiagnostic?.formalCapture;
    const labelKey = item => `${String(item.targetKind)}:${String(item.targetId)}`;
    const iconKey = item => String(item.id);
    const sameRefs = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    const labels = renderer.labelItems || [];
    const markers = renderer.markerIconItems || [];
    const military = renderer.militaryIconItems || [];
    const overlayNodes = [...(renderer.overlay?.childNodes || [])];
    const report = structuredClone(map.metadata?.compatibility?.settlementPortTopology || {});
    return {
      reuseOutcome: replaceChildrenCount === 0 ? "reuse-observed" : "full-replace-observed",
      replaceChildrenCount,
      capture: {
        workerCount: Number(capture?.workerCount || 0),
        overlayCount: Number(capture?.overlayCount || 0),
        overlayMapCurrent: capture?.overlay?.map === map
      },
      sameMap: map === probe?.map && renderer.map === probe?.map,
      counts: {
        before: {overlayNodes: before.overlayNodes, labels: before.labels, markers: before.markers, military: before.military},
        after: {overlayNodes: overlayNodes.length, labels: labels.length, markers: markers.length, military: military.length}
      },
      orderedKeysExact: {
        labels: JSON.stringify(labels.map(labelKey)) === JSON.stringify(before.keys.labels),
        markers: JSON.stringify(markers.map(iconKey)) === JSON.stringify(before.keys.markers),
        military: JSON.stringify(military.map(iconKey)) === JSON.stringify(before.keys.military)
      },
      domRefsExact: {
        overlay: sameRefs(overlayNodes, probe?.overlayNodes || []),
        labels: labels.length === probe?.labels?.length && labels.every((item, index) => item.node === probe.labels[index].node),
        markers: markers.length === probe?.markers?.length && markers.every((item, index) => item.node === probe.markers[index].node),
        military: military.length === probe?.military?.length && military.every((item, index) => item.node === probe.military[index].node),
        selection: renderer.selectionMarker === probe?.selectionMarker,
        grid: renderer.gridCellIdLayer === probe?.gridCellIdLayer,
        connected: overlayNodes.every(node => node?.isConnected)
      },
      portTopology: {
        mode: String(report.mode || ""),
        moved: Number(report.moved || 0),
        cleared: Number(report.cleared || 0),
        synced: Number(report.synced || 0),
        movedIds: Array.isArray(report.movedCityIds) ? report.movedCityIds.length : 0,
        clearedIds: Array.isArray(report.clearedCityIds) ? report.clearedCityIds.length : 0,
        syncedIds: Array.isArray(report.syncedCityIds) ? report.syncedCityIds.length : 0
      }
    };
  }, {
    before,
    replaceChildrenCount: Number(trace.methodSummary?.["overlay:replaceChildren"]?.count || 0)
  });
}

function capturedFreshRoutesPreparedEvidenceMatches(expected, actual) {
  return isDeepStrictEqual(expected, actual);
}

function capturedFreshRoutesBindingMatches(prepared, run, render) {
  const exactKeys = (value, expected) => value && typeof value === "object"
    && isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
  const runKeys = ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"];
  const renderKeys = ["mapIdentity", "mapRevision"];
  return exactKeys(run, runKeys)
    && exactKeys(render, renderKeys)
    && exactKeys(prepared, renderKeys)
    && typeof run.mapIdentity === "string" && run.mapIdentity.length > 0
    && Number.isSafeInteger(Number(run.mapRevision)) && Number(run.mapRevision) >= 0
    && Number.isSafeInteger(Number(run.generationToken)) && Number(run.generationToken) >= 0
    && typeof run.lockFingerprint === "string" && run.lockFingerprint.length > 0
    && Number.isSafeInteger(Number(run.operationId)) && Number(run.operationId) > 0
    && typeof run.operationName === "string" && run.operationName.length > 0
    && isDeepStrictEqual(prepared, render)
    && prepared.mapIdentity === run.mapIdentity
    && Number(prepared.mapRevision) === Number(run.mapRevision);
}

function runCapturedFreshRoutesPreparedEvidenceCounterexamples() {
  const baseline = {
    labels: {count: 2, checksum: 1234},
    point: {byteLength: 24, checksum: 2345},
    routeRanges: {ordinary: {first: 0, count: 6}, seaLand: {first: 6, count: 0}, seaWater: {first: 6, count: 0}}
  };
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(baseline, structuredClone(baseline)), true, "fresh routes captured prepared baseline 应同源");
  const labelTamper = structuredClone(baseline);
  labelTamper.labels.checksum++;
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(baseline, labelTamper), false, "fresh routes label descriptor 篡改未被拒绝");
  const pointTamper = structuredClone(baseline);
  pointTamper.point.byteLength -= 4;
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(baseline, pointTamper), false, "fresh routes point bytes 篡改未被拒绝");
  const routeTamper = structuredClone(baseline);
  routeTamper.routeRanges.ordinary.count--;
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(baseline, routeTamper), false, "fresh routes route range 篡改未被拒绝");
  const fullBinding = {mapIdentity: "map-1", mapRevision: 1, generationToken: 2, lockFingerprint: "abc", operationId: 3, operationName: "generate.regenerate"};
  const renderBinding = {mapIdentity: "map-1", mapRevision: 1};
  assert.equal(capturedFreshRoutesBindingMatches(structuredClone(renderBinding), fullBinding, renderBinding), true, "fresh routes prepared/render binding 正式子集应与完整 run binding 同源");
  assert.equal(capturedFreshRoutesBindingMatches({mapIdentity: "map-1", mapRevision: 0}, fullBinding, renderBinding), false, "fresh routes prepared revision 漂移未被拒绝");
  assert.equal(capturedFreshRoutesBindingMatches(renderBinding, {...fullBinding, extra: true}, renderBinding), false, "fresh routes run binding 额外键未被拒绝");
  assert.equal(capturedFreshRoutesBindingMatches(renderBinding, fullBinding, {...renderBinding, generationToken: 2}), false, "fresh routes render binding 额外键未被拒绝");
  assert.equal(capturedFreshRoutesBindingMatches(renderBinding, {...fullBinding, lockFingerprint: ""}, renderBinding), false, "fresh routes run binding 无效字段未被拒绝");
}

async function captureHundredThousandFreshRoutesOverlayBaseline(page) {
  const baseline = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const map = app.map;
    const descendants = node => [...(node?.querySelectorAll?.("*") || [])];
    const labelKey = item => `${String(item.targetKind)}:${String(item.targetId)}`;
    const iconKey = item => String(item.id);
    const cities = new Map((map.settlements?.cities || []).filter(Boolean).map(city => {
      const burg = map.pack?.burgs?.[Number(city.burgId)] || null;
      return [String(city.id), {
        x: Number(city.x),
        y: Number(city.y),
        cell: Number(city.cell),
        packCell: Number(city.packCell),
        port: Number(city.port || 0),
        burgPort: Number(burg?.port || 0)
      }];
    }));
    const probe = {
      map,
      overlayNodes: [...renderer.overlay.childNodes],
      labels: renderer.labelItems.map(item => ({
        key: labelKey(item),
        item,
        node: item.node,
        contentNode: item.contentNode,
        glyphNodes: [...item.glyphNodes],
        descendants: descendants(item.node)
      })),
      markers: renderer.markerIconItems.map(item => ({key: iconKey(item), item, node: item.node, descendants: descendants(item.node)})),
      military: renderer.militaryIconItems.map(item => ({key: iconKey(item), item, node: item.node, descendants: descendants(item.node)})),
      selectionMarker: renderer.selectionMarker,
      gridCellIdLayer: renderer.gridCellIdLayer,
      cities
    };
    window.__task322FreshRoutesOverlayBaseline = probe;
    const keys = entries => entries.map(entry => entry.key);
    const unique = entries => new Set(keys(entries)).size === entries.length;
    const connected = probe.overlayNodes.every(node => node?.isConnected)
      && probe.labels.every(entry => entry.node?.isConnected && entry.contentNode?.isConnected && entry.glyphNodes.every(node => node?.isConnected))
      && probe.markers.every(entry => entry.node?.isConnected)
      && probe.military.every(entry => entry.node?.isConnected)
      && probe.selectionMarker?.isConnected && probe.gridCellIdLayer?.isConnected;
    return {
      mapRevision: Number(app.mapRevision.getSnapshot?.().revision || 0),
      overlayNodes: probe.overlayNodes.length,
      labels: probe.labels.length,
      markers: probe.markers.length,
      military: probe.military.length,
      cities: probe.cities.size,
      keys: {labels: keys(probe.labels), markers: keys(probe.markers), military: keys(probe.military)},
      unique: {labels: unique(probe.labels), markers: unique(probe.markers), military: unique(probe.military)},
      connected,
      portTopology: structuredClone(map.metadata?.compatibility?.settlementPortTopology || null)
    };
  });
  assert.deepEqual(baseline.unique, {labels: true, markers: true, military: true}, "100k fresh routes baseline overlay key 存在重复");
  assert.equal(baseline.connected, true, "100k fresh routes baseline overlay DOM 未连接");
  return baseline;
}

async function assertHundredThousandFreshRoutesOverlayInstall(page, before) {
  const state = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const map = app.map;
    const probe = window.__task322FreshRoutesOverlayBaseline;
    const capture = window.__task322HundredThousandRoutesDiagnostic?.formalCapture;
    const labelKey = item => `${String(item.targetKind)}:${String(item.targetId)}`;
    const iconKey = item => String(item.id);
    const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const sameRefs = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    const exactKeys = (value, expected) => value && typeof value === "object"
      && sameJson(Object.keys(value).sort(), [...expected].sort());
    const bindingMatches = (prepared, run, render) => exactKeys(run, ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"])
      && exactKeys(render, ["mapIdentity", "mapRevision"])
      && exactKeys(prepared, ["mapIdentity", "mapRevision"])
      && typeof run.mapIdentity === "string" && run.mapIdentity.length > 0
      && Number.isSafeInteger(Number(run.mapRevision)) && Number(run.mapRevision) >= 0
      && Number.isSafeInteger(Number(run.generationToken)) && Number(run.generationToken) >= 0
      && typeof run.lockFingerprint === "string" && run.lockFingerprint.length > 0
      && Number.isSafeInteger(Number(run.operationId)) && Number(run.operationId) > 0
      && typeof run.operationName === "string" && run.operationName.length > 0
      && sameJson(prepared, render)
      && prepared.mapIdentity === run.mapIdentity
      && Number(prepared.mapRevision) === Number(run.mapRevision);
    const descendants = node => [...(node?.querySelectorAll?.("*") || [])];
    const fingerprintLabels = items => {
      const text = JSON.stringify(items.map(item => ({
        key: labelKey(item),
        text: item.text,
        x: Number(item.x),
        y: Number(item.y),
        styleType: item.styleType,
        resolvedStyle: item.resolvedStyle,
        layout: item.layout,
        metrics: item.metrics
      })));
      let checksum = 2166136261;
      for (let index = 0; index < text.length; index++) checksum = Math.imul(checksum ^ text.charCodeAt(index), 16777619) >>> 0;
      return {count: items.length, checksum};
    };
    const labels = renderer.labelItems;
    const markers = renderer.markerIconItems;
    const military = renderer.militaryIconItems;
    const expectedLabels = capture?.overlay?.descriptors || [];
    const labelDescriptorsCanonical = labels.length === expectedLabels.length && labels.every((item, index) => {
      const expected = expectedLabels[index];
      return labelKey(item) === labelKey(expected)
        && item.text === expected.text
        && Number(item.x) === Number(expected.x)
        && Number(item.y) === Number(expected.y)
        && item.styleType === expected.styleType
        && sameJson(item.resolvedStyle, expected.resolvedStyle)
        && sameJson(item.layout, expected.layout)
        && sameJson(item.metrics, expected.metrics);
    });
    const labelsExact = labels.length === probe.labels.length && labels.every((item, index) => {
      const previous = probe.labels[index];
      return labelKey(item) === previous.key
        && item.node === previous.node
        && item.contentNode === previous.contentNode
        && sameRefs(item.glyphNodes, previous.glyphNodes)
        && sameRefs(descendants(item.node), previous.descendants)
        && item.node?.isConnected && item.contentNode?.isConnected && item.glyphNodes.every(node => node?.isConnected);
    });
    const markersById = new Map((map.markers?.markers || []).filter(Boolean).map(marker => [String(marker.id), marker]));
    const markersCanonical = markers.every(item => {
      const marker = markersById.get(String(item.id));
      return item.marker === marker
        && Number(item.x) === Number(marker?.x)
        && Number(item.y) === Number(marker?.y)
        && item.node?.dataset?.markerId === String(marker?.id)
        && item.node?.title === item.tooltip
        && item.node?.getAttribute("aria-label") === item.tooltip;
    });
    const markersExact = markers.length === probe.markers.length && markers.every((item, index) => {
      const previous = probe.markers[index];
      return iconKey(item) === previous.key
        && item.node === previous.node
        && sameRefs(descendants(item.node), previous.descendants)
        && item.node?.isConnected;
    });
    const states = map.politics?.states || map.pack?.states || [];
    const regimentFor = item => {
      const state = states[Number(item.stateId)];
      return (state?.military || []).find(regiment => String(regiment.i ?? regiment.id) === String(item.regimentId ?? item.regiment?.i ?? item.regiment?.id)) || null;
    };
    const militaryCanonical = military.every(item => {
      const regiment = regimentFor(item);
      return Boolean(regiment)
        && Number(item.x) === Number(regiment.x)
        && Number(item.y) === Number(regiment.y)
        && Number(item.troops) === Number(regiment.a || 0)
        && String(item.type || "") === String(regiment.type || "")
        && item.rendererUnitPreferences === renderer.unitPreferences;
    });
    const militaryExact = military.length === probe.military.length && military.every((item, index) => {
      const previous = probe.military[index];
      return iconKey(item) === previous.key
        && item.node === previous.node
        && sameRefs(descendants(item.node), previous.descendants)
        && item.node?.isConnected;
    });
    const cityById = new Map((map.settlements?.cities || []).filter(Boolean).map(city => [String(city.id), city]));
    const cityItemsCanonical = renderer.cityIconItems.every(item => {
      const city = cityById.get(String(item.id));
      const burg = map.pack?.burgs?.[Number(city?.burgId)] || null;
      const port = Number(city?.port || 0);
      return item.city === city
        && Number(item.x) === Number(city?.x)
        && Number(item.y) === Number(city?.y)
        && item.roles.includes("port") === (port > 0)
        && Number(burg?.port || 0) === port;
    });
    const report = structuredClone(map.metadata?.compatibility?.settlementPortTopology || {});
    const touchedIds = [...new Set([...(report.movedCityIds || []), ...(report.clearedCityIds || []), ...(report.syncedCityIds || [])].map(String))];
    const changedCityIds = touchedIds.filter(id => {
      const previous = probe.cities.get(id);
      const city = cityById.get(id);
      const burg = map.pack?.burgs?.[Number(city?.burgId)] || null;
      return previous && city && !sameJson(previous, {
        x: Number(city.x),
        y: Number(city.y),
        cell: Number(city.cell),
        packCell: Number(city.packCell),
        port: Number(city.port || 0),
        burgPort: Number(burg?.port || 0)
      });
    });
    const overlayNodes = [...renderer.overlay.childNodes];
    return {
      capture: {
        workerCount: Number(capture?.workerCount || 0),
        overlayCount: Number(capture?.overlayCount || 0),
        overlayMapCurrent: capture?.overlay?.map === map,
        bindingSame: bindingMatches(capture?.worker?.binding, capture?.worker?.runBinding, capture?.worker?.renderBinding)
      },
      sameMap: map === probe.map && renderer.map === probe.map,
      keys: {
        labels: labels.map(labelKey),
        markers: markers.map(iconKey),
        military: military.map(iconKey)
      },
      itemObjectsReplaced: {
        labels: labels.every((item, index) => item !== probe.labels[index]?.item),
        markers: markers.every((item, index) => item !== probe.markers[index]?.item),
        military: military.every((item, index) => item !== probe.military[index]?.item)
      },
      dom: {
        overlayOrderExact: sameRefs(overlayNodes, probe.overlayNodes),
        labelsExact,
        markersExact,
        militaryExact,
        selectionExact: renderer.selectionMarker === probe.selectionMarker && renderer.selectionMarker?.isConnected,
        gridExact: renderer.gridCellIdLayer === probe.gridCellIdLayer && renderer.gridCellIdLayer?.isConnected,
        allConnected: overlayNodes.every(node => node?.isConnected),
        previousDisconnected: probe.overlayNodes.every(node => !node?.isConnected)
      },
      canonical: {labels: labelDescriptorsCanonical, markers: markersCanonical, military: militaryCanonical, cities: cityItemsCanonical},
      descriptorEvidence: {expected: fingerprintLabels(expectedLabels), actual: fingerprintLabels(labels)},
      counts: {labels: labels.length, markers: markers.length, military: military.length, cities: renderer.cityIconItems.length},
      portTopology: {
        mode: String(report.mode || ""),
        moved: Number(report.moved || 0),
        cleared: Number(report.cleared || 0),
        synced: Number(report.synced || 0),
        touched: touchedIds.length,
        changed: changedCityIds.length,
        allTouchedChanged: changedCityIds.length === touchedIds.length
      }
    };
  });
  assert.deepEqual(state.capture, {workerCount: 1, overlayCount: 1, overlayMapCurrent: true, bindingSame: true}, "100k fresh routes 未精确捕获一次正式 Worker/overlay prepared 输入");
  assert.equal(state.sameMap, true, "100k fresh routes overlay install 期间 map 身份漂移");
  assert.deepEqual(state.keys.markers, before.keys.markers, "100k fresh routes marker ordered keys 发生变化");
  assert.deepEqual(state.keys.military, before.keys.military, "100k fresh routes military ordered keys 发生变化");
  assert.equal(new Set(state.keys.labels).size, state.keys.labels.length, "100k fresh routes label keys 出现重复");
  assert.deepEqual(state.itemObjectsReplaced, {labels: true, markers: true, military: true}, "100k fresh routes 未使用新 prepared CPU items");
  assert.deepEqual(state.dom, {
    overlayOrderExact: false,
    labelsExact: false,
    markersExact: false,
    militaryExact: false,
    selectionExact: false,
    gridExact: false,
    allConnected: true,
    previousDisconnected: true
  }, "100k fresh routes overlay 原子替换的旧/新 DOM 所有权不符");
  assert.deepEqual(state.canonical, {labels: true, markers: true, military: true, cities: true}, "100k fresh routes overlay prepared 数据与正式 map/descriptor 不同源");
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(state.descriptorEvidence.expected, state.descriptorEvidence.actual), true, "100k fresh routes label descriptor 指纹与当前 items 不同源");
  assert.equal(state.portTopology.mode, "routes", "100k fresh routes 港口拓扑报告 mode 非 routes");
  assert.equal(state.portTopology.allTouchedChanged, true, "100k fresh routes 港口拓扑 touched city 未实际写入正式镜像");
  return state;
}

async function assertHundredThousandFreshRoutesBufferParity(page) {
  const state = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const trace = window.__task322HundredThousandRoutesDiagnostic;
    const capture = trace?.formalCapture;
    const point = capture?.worker?.pointVertices;
    const routeVertices = capture?.worker?.routeVertices;
    const routeDrawRanges = capture?.worker?.routeDrawRanges;
    const gl = renderer.gl;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const checksum = values => {
      let value = 2166136261;
      for (const byte of values) value = Math.imul(value ^ byte, 16777619) >>> 0;
      return value;
    };
    const typedFingerprint = values => {
      if (!(values instanceof Float32Array)) return {byteLength: -1, checksum: 0};
      const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
      return {byteLength: bytes.byteLength, checksum: checksum(bytes)};
    };
    const bufferFingerprint = buffer => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      return {byteLength, checksum: checksum(bytes), valid: Boolean(buffer && gl.isBuffer(buffer))};
    };
    let result;
    try {
      const pointCpu = typedFingerprint(point);
      const routeCpu = typedFingerprint(routeVertices);
      const pointGpu = bufferFingerprint(renderer.pointBuffer);
      const routeGpu = bufferFingerprint(renderer.routeBuffer);
      result = {
        captureValid: Number(capture?.workerCount || 0) === 1
          && Number(capture?.overlayCount || 0) === 1
          && point instanceof Float32Array
          && routeVertices instanceof Float32Array
          && routeDrawRanges && typeof routeDrawRanges === "object",
        point: {
          vertexCount: Number(renderer.pointVertexCount),
          expectedVertexCount: point instanceof Float32Array ? point.length / 6 : -1,
          cpu: pointCpu,
          gpu: pointGpu,
          same: pointGpu.valid && pointGpu.byteLength === pointCpu.byteLength && pointGpu.checksum === pointCpu.checksum
        },
        route: {
          vertexCount: Number(renderer.routeVertexCount),
          expectedVertexCount: routeVertices instanceof Float32Array ? routeVertices.length / 6 : -1,
          cpu: routeCpu,
          gpu: routeGpu,
          same: routeGpu.valid && routeGpu.byteLength === routeCpu.byteLength && routeGpu.checksum === routeCpu.checksum,
          ranges: structuredClone(renderer.routeDrawRanges),
          expectedRanges: routeDrawRanges ? structuredClone(routeDrawRanges) : null,
          cameraCurrent: Boolean(renderer.routeBufferCamera)
        }
      };
    } finally {
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      if (trace) trace.formalCapture = null;
    }
    return {...result, captureCleared: trace?.formalCapture === null};
  });
  assert.equal(state.captureValid, true, "100k fresh routes 缺少正式 Worker prepared point/route 捕获");
  assert.equal(state.captureCleared, true, "100k fresh routes prepared refs 验证后未释放");
  assert.equal(state.point.vertexCount, state.point.expectedVertexCount, "100k fresh routes point vertexCount 与正式 CPU mesh 不符");
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(state.point.cpu, {byteLength: state.point.gpu.byteLength, checksum: state.point.gpu.checksum}), true, "100k fresh routes point GPU 与正式 Worker prepared bytes 不同源");
  assert.equal(state.point.same, true, "100k fresh routes point GPU 与正式 Worker prepared bytes 不同源");
  assert.equal(state.route.vertexCount, state.route.expectedVertexCount, "100k fresh routes route vertexCount 与正式 CPU mesh 不符");
  assert.equal(state.route.same, true, "100k fresh routes route GPU 与正式 Worker prepared bytes 不同源");
  assert.equal(capturedFreshRoutesPreparedEvidenceMatches(state.route.ranges, state.route.expectedRanges), true, "100k fresh routes route draw ranges 与正式 Worker prepared 结果不同源");
  assert.equal(state.route.cameraCurrent, true, "100k fresh routes routeBufferCamera 缺失");
  return state;
}

function compactHundredThousandFreshRoutesDiagnostic({sessionReset, installed, wallMs, response, trace, rendererPerformanceDiff, taskDurationDeltaMs, finalSession, overlayBefore, overlayReuse, sourceParity, bufferParity, preAssertion = null}) {
  const worker = response?.data?.worker || {};
  const scalarEvent = event => ({
    channel: String(event.channel || ""),
    name: String(event.name || ""),
    start: Number(event.start) || 0,
    end: Number(event.end) || 0,
    ms: Number(event.ms) || 0
  });
  const boundaryKeys = new Set([
    "history:createSnapshot",
    "selection:getSnapshot",
    "renderer:captureDeferredWorkerRenderPresentation",
    "renderer:suspendWorkerRenderInstall"
  ]);
  const boundaries = trace.events
    .filter(event => boundaryKeys.has(`${event.channel}:${event.name}`))
    .map(scalarEvent);
  const slowEvents = trace.events.filter(event => Number(event.ms) >= 20).map(scalarEvent);
  const longTasks = trace.longTasks.map(task => ({startTime: Number(task.startTime), duration: Number(task.duration), name: String(task.name || "")}));
  const longTaskOverlaps = trace.longTaskOverlaps.map(item => ({
    startTime: Number(item.startTime),
    duration: Number(item.duration),
    events: item.events.map(scalarEvent)
  }));
  const longAnimationFrames = trace.longAnimationFrames.map(frame => ({
    startTime: Number(frame.startTime),
    duration: Number(frame.duration),
    renderStart: Number(frame.renderStart) || 0,
    styleAndLayoutStart: Number(frame.styleAndLayoutStart) || 0,
    blockingDuration: Number(frame.blockingDuration) || 0,
    scriptCount: frame.scripts.length,
    maxScriptMs: Math.max(0, ...frame.scripts.map(script => Number(script.duration) || 0))
  }));
  const healthSummary = Object.entries(trace.healthEvents.reduce((summary, event) => {
    const key = `${event.severity || ""}:${event.type || ""}`;
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {})).map(([key, count]) => ({key, count}));
  return {
    sessionReset,
    installed,
    wallMs,
    response: {
      ok: Boolean(response?.ok),
      error: response?.error ? structuredClone(response.error) : null,
      worker: {
        mode: String(worker.mode || ""),
        accepted: Boolean(worker.accepted),
        session: worker.session ? structuredClone(worker.session) : null,
        telemetry: worker.telemetry ? structuredClone(worker.telemetry) : null
      }
    },
    trace: {
      startedAt: trace.startedAt,
      responseAt: trace.responseAt,
      endedAt: trace.endedAt,
      windowMs: trace.windowMs,
      coordinatorRuns: trace.coordinatorRuns,
      inputStream: trace.inputStream,
      progressBoundaries: trace.progressBoundaries,
      boundaries,
      methodSummary: trace.methodSummary,
      slowEvents,
      longTasks,
      longTaskOverlaps,
      longAnimationFrames,
      healthSummary,
      responseSignals: trace.responseSignals,
      scalarSignals: trace.scalarSignals,
      glErrorProbe: trace.glErrorProbe
    },
    rendererPerformanceDiff,
    taskDurationDeltaMs,
    finalSession,
    overlayBefore,
    preAssertion,
    overlayReuse,
    sourceParity,
    bufferParity,
    hitLongTask: longTasks.length > 0
  };
}

async function installHundredThousandRoutesDiagnosticProbe(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const gl = renderer.gl;
    const originals = [];
    let sequence = 0;
    let nextBufferId = 0;
    let currentArrayBufferBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const bufferIds = new WeakMap();
    const bufferId = buffer => {
      if (!buffer || (typeof buffer !== "object" && typeof buffer !== "function")) return 0;
      if (!bufferIds.has(buffer)) bufferIds.set(buffer, ++nextBufferId);
      return bufferIds.get(buffer);
    };
    const trace = {
      active: null,
      formalCapture: null,
      attempts: [],
      restoreErrors: [],
      observer: null,
      loafObserver: null,
      loafSupported: PerformanceObserver.supportedEntryTypes?.includes?.("long-animation-frame") === true
    };
    const round = value => Math.round(Number(value || 0) * 1000) / 1000;
    const sourceByteLength = (source, sourceOffset = 0, sourceLength = 0) => {
      if (typeof source === "number") return Math.max(0, Number(source) || 0);
      if (source instanceof ArrayBuffer) return source.byteLength;
      if (!ArrayBuffer.isView(source)) return 0;
      const bytesPerElement = Number(source.BYTES_PER_ELEMENT) || 1;
      const offsetBytes = Math.max(0, Number(sourceOffset) || 0) * bytesPerElement;
      const requestedBytes = Math.max(0, Number(sourceLength) || 0) * bytesPerElement;
      return requestedBytes > 0 ? Math.min(requestedBytes, Math.max(0, source.byteLength - offsetBytes)) : Math.max(0, source.byteLength - offsetBytes);
    };
    const bindingName = () => {
      const binding = currentArrayBufferBinding;
      const surfaceIndex = renderer.surfaceBaseBufferSet?.segments?.findIndex(segment => segment.buffer === binding) ?? -1;
      if (surfaceIndex >= 0) return `surfaceBase[${surfaceIndex}]`;
      for (const name of [
        "surfacePatchBuffer", "lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "pointBuffer", "routeBuffer",
        "riverBuffer", "selectionBuffer", "politicalMeshDebugBuffer", "tradeFlowBuffer"
      ]) if (renderer[name] === binding) return name;
      if (renderer.cityIconLayer?.instanceBuffer === binding) return "cityIconLayer.instanceBuffer";
      return binding ? "prepared-or-unknown" : "null";
    };
    const replaceMethod = (owner, name, replacement) => {
      const hadOwn = Object.prototype.hasOwnProperty.call(owner, name);
      const descriptor = hadOwn ? Object.getOwnPropertyDescriptor(owner, name) : null;
      const original = owner?.[name];
      if (typeof original !== "function") return false;
      const wrapped = replacement(original);
      if (descriptor && descriptor.configurable === false) {
        if (descriptor.writable === false) return false;
        owner[name] = wrapped;
      } else {
        Object.defineProperty(owner, name, {configurable: true, writable: true, value: wrapped});
      }
      originals.push(() => {
        if (hadOwn) Object.defineProperty(owner, name, descriptor);
        else delete owner[name];
      });
      return true;
    };
    const record = (channel, name, details, invoke) => {
      if (!trace.active) return invoke();
      const item = {index: ++sequence, channel, name, start: performance.now(), ...details};
      trace.active.events.push(item);
      let value;
      try {
        value = invoke();
      } catch (error) {
        item.end = performance.now();
        item.ms = round(item.end - item.start);
        item.error = String(error?.message || error);
        throw error;
      }
      if (value && typeof value.then === "function") {
        return Promise.resolve(value).then(result => {
          item.end = performance.now();
          item.ms = round(item.end - item.start);
          return result;
        }, error => {
          item.end = performance.now();
          item.ms = round(item.end - item.start);
          item.error = String(error?.message || error);
          throw error;
        });
      }
      item.end = performance.now();
      item.ms = round(item.end - item.start);
      return value;
    };
    const originalCoordinator = app.workerTaskCoordinator;
    const progressStages = new Set([
      "input-stream-discover",
      "input-stream-definitions",
      "input-stream-complete",
      "input-stream",
      "worker-accept",
      "worker-compute",
      "output-stream"
    ]);
    const wrappedCoordinator = Object.freeze({
      async run(task, payload, options = {}) {
        const active = trace.active;
        if (!active) return Reflect.apply(originalCoordinator.run, originalCoordinator, [task, payload, options]);
        const boundary = {
          task: String(task || ""),
          start: performance.now(),
          end: 0,
          ms: 0,
          sessionMode: String(options.sessionMode || ""),
          payloadOwnMap: Object.prototype.hasOwnProperty.call(payload || {}, "map")
        };
        active.coordinatorRuns.push(boundary);
        const originalProgress = options.onProgress;
        const originalStreamYield = options.streamYieldToMain;
        let inputPhase = "input-stream-discover";
        let lastResumeAt = boundary.start;
        const streamYieldToMain = async () => {
          const waitStartedAt = performance.now();
          const cpuSliceMs = round(waitStartedAt - lastResumeAt);
          if (typeof originalStreamYield === "function") await originalStreamYield();
          else if (typeof globalThis.scheduler?.yield === "function") await globalThis.scheduler.yield();
          else await new Promise(resolve => setTimeout(resolve, 0));
          const resumedAt = performance.now();
          const waitMs = round(resumedAt - waitStartedAt);
          const stats = active.inputStream;
          stats.yieldCount += 1;
          stats.maxCpuSliceMs = Math.max(stats.maxCpuSliceMs, cpuSliceMs);
          stats.maxWaitMs = Math.max(stats.maxWaitMs, waitMs);
          if (cpuSliceMs >= 20 || waitMs >= 20) stats.slowSamples.push({at: waitStartedAt, phase: inputPhase, cpuSliceMs, waitMs});
          lastResumeAt = resumedAt;
        };
        try {
          const result = await Reflect.apply(originalCoordinator.run, originalCoordinator, [task, payload, {
            ...options,
            streamYieldToMain,
            onProgress(stage, detail, context) {
              const progressStage = String(stage || "");
              if (progressStages.has(progressStage)) {
                const scalarDetail = {};
                for (const [key, value] of Object.entries(detail || {})) {
                  if (["string", "number", "boolean"].includes(typeof value)) scalarDetail[key] = value;
                }
                active.progressBoundaries.push({stage: progressStage, at: performance.now(), detail: scalarDetail});
              }
              if (progressStage === "input-stream-discover") inputPhase = "input-stream-definitions";
              else if (progressStage === "input-stream-definitions") inputPhase = "input-stream-properties";
              else if (progressStage === "input-stream-complete") inputPhase = "input-stream-complete";
              return originalProgress?.(stage, detail, context);
            }
          }]);
          if (task === "regeneration.compute" && payload?.mode !== "render-only") {
            const prepared = result?.preparedRender;
            const capture = trace.formalCapture;
            if (capture) {
              capture.workerCount++;
              capture.worker = {
                binding: prepared?.binding,
                runBinding: options.binding,
                renderBinding: payload?.render?.binding,
                pointVertices: prepared?.layers?.point?.vertices,
                routeVertices: prepared?.layers?.route?.vertices,
                routeDrawRanges: prepared?.layers?.route?.drawRanges
              };
            }
          }
          return result;
        } catch (error) {
          boundary.error = String(error?.code || error?.name || error?.message || "unknown");
          throw error;
        } finally {
          boundary.end = performance.now();
          boundary.ms = round(boundary.end - boundary.start);
        }
      },
      commitSession: originalCoordinator.commitSession.bind(originalCoordinator),
      invalidateSession: originalCoordinator.invalidateSession.bind(originalCoordinator),
      getSessionSnapshot: originalCoordinator.getSessionSnapshot.bind(originalCoordinator)
    });
    app.workerTaskCoordinator = wrappedCoordinator;
    originals.push(() => {
      if (app.workerTaskCoordinator === wrappedCoordinator) app.workerTaskCoordinator = originalCoordinator;
    });
    const rendererMethods = [
      "suspendWorkerRenderInstall", "resumeWorkerRenderInstall", "resumePreparedWorkerRenderInstall",
      "captureDeferredWorkerRenderPresentation",
      "prepareOverlayBundleFromDescriptors", "applyWorkerRenderMutationBatch", "refreshCellSurface", "refreshLineLayers",
      "refreshPointLayers", "refreshLabels", "buildLabels", "updateLabels", "refreshMilitaryIconLabels",
      "scheduleRouteBufferRefresh", "cancelScheduledRouteBufferRefresh", "updateRouteBuffer", "updateRouteBufferAsync",
      "yieldViewportCommitFrame", "refreshObjectPickingIndex",
      "updateSelectionBuffer", "setObjectHighlights", "draw", "onViewChange"
    ];
    const rendererDetails = (name, args) => {
      if (name === "resumePreparedWorkerRenderInstall") return {
        entryKeys: (args[0]?.entries || []).map(entry => String(entry?.key || "")),
        effects: args[0]?.effects ? {...args[0].effects} : null,
        options: args[1] && typeof args[1] === "object" ? {...args[1]} : null
      };
      if (name === "resumeWorkerRenderInstall" || name === "draw") return {options: args[0] && typeof args[0] === "object" ? {...args[0]} : null};
      if (["refreshCellSurface", "refreshLineLayers", "refreshPointLayers", "refreshLabels", "refreshMilitaryIconLabels"].includes(name)) {
        const options = args.at(-1);
        return {options: options && typeof options === "object" && !ArrayBuffer.isView(options) ? {...options} : null};
      }
      return {};
    };
    for (const name of rendererMethods.filter(name => name !== "prepareOverlayBundleFromDescriptors")) replaceMethod(renderer, name, original => function(...args) {
      return record("renderer", name, rendererDetails(name, args), () => Reflect.apply(original, this, args));
    });
    replaceMethod(renderer, "prepareOverlayBundleFromDescriptors", original => function(map, descriptors, ...rest) {
      const capture = trace.formalCapture;
      if (trace.active && capture) {
        capture.overlayCount++;
        capture.overlay = {map, descriptors};
      }
      return record("renderer", "prepareOverlayBundleFromDescriptors", {}, () => Reflect.apply(original, this, [map, descriptors, ...rest]));
    });
    replaceMethod(app.editHistory, "createSnapshot", original => function(...args) {
      return record("history", "createSnapshot", {}, () => Reflect.apply(original, this, args));
    });
    replaceMethod(app.selectionStore, "getSnapshot", original => function(...args) {
      return record("selection", "getSnapshot", {}, () => Reflect.apply(original, this, args));
    });
    replaceMethod(renderer.cityIconLayer, "setInstances", original => function(items, ...rest) {
      return record("city", "setInstances", {items: Number(items?.length) || 0}, () => Reflect.apply(original, this, [items, ...rest]));
    });
    replaceMethod(renderer.cityIconLayer, "draw", original => function(options, ...rest) {
      return record("city", "draw", {
        instances: Number(this.instances?.length) || 0,
        layerVisible: options?.layerVisible !== false
      }, () => Reflect.apply(original, this, [options, ...rest]));
    });
    replaceMethod(renderer.overlay, "replaceChildren", original => function(...nodes) {
      return record("overlay", "replaceChildren", {nodes: nodes.length}, () => Reflect.apply(original, this, nodes));
    });
    replaceMethod(app.selectionStore, "refresh", original => function(...args) {
      return record("selection", "refresh", {}, () => Reflect.apply(original, this, args));
    });
    replaceMethod(gl, "bindBuffer", original => function(...args) {
      const value = Reflect.apply(original, this, args);
      if (args[0] === gl.ARRAY_BUFFER) currentArrayBufferBinding = args[1] || null;
      return value;
    });
    replaceMethod(gl, "bufferData", original => function(...args) {
      return record("gl", "bufferData", {
        target: Number(args[0]), binding: bindingName(), bindingId: bufferId(currentArrayBufferBinding), byteLength: sourceByteLength(args[1], args[3], args[4]), usage: Number(args[2])
      }, () => Reflect.apply(original, this, args));
    });
    replaceMethod(gl, "bufferSubData", original => function(...args) {
      return record("gl", "bufferSubData", {
        target: Number(args[0]), binding: bindingName(), bindingId: bufferId(currentArrayBufferBinding), destinationByteOffset: Math.max(0, Number(args[1]) || 0), byteLength: sourceByteLength(args[2], args[3], args[4])
      }, () => Reflect.apply(original, this, args));
    });
    replaceMethod(gl, "drawArrays", original => function(...args) {
      return record("gl", "drawArrays", {mode: Number(args[0]), first: Number(args[1]), count: Number(args[2])}, () => Reflect.apply(original, this, args));
    });
    replaceMethod(gl, "drawArraysInstanced", original => function(...args) {
      return record("gl", "drawArraysInstanced", {
        mode: Number(args[0]), first: Number(args[1]), count: Number(args[2]), instanceCount: Number(args[3])
      }, () => Reflect.apply(original, this, args));
    });
    replaceMethod(gl, "getError", original => function(...args) {
      if (!trace.active) return Reflect.apply(original, this, args);
      const item = {index: ++sequence, channel: "gl", name: "getError", start: performance.now()};
      trace.active.events.push(item);
      try {
        const value = Reflect.apply(original, this, args);
        item.value = Number(value);
        item.end = performance.now();
        item.ms = round(item.end - item.start);
        return value;
      } catch (error) {
        item.end = performance.now();
        item.ms = round(item.end - item.start);
        item.error = String(error?.message || error);
        throw error;
      }
    });
    if (typeof globalThis.scheduler?.yield === "function") replaceMethod(globalThis.scheduler, "yield", original => function(...args) {
      return record("scheduler", "yield", {}, () => Reflect.apply(original, this, args));
    });
    trace.observer = new PerformanceObserver(list => {
      const active = trace.active;
      if (!active) return;
      for (const entry of list.getEntries()) {
        if (entry.startTime < active.startedAt) continue;
        active.longTasks.push({startTime: entry.startTime, duration: entry.duration, name: entry.name});
      }
    });
    trace.observer.observe({entryTypes: ["longtask"]});
    if (trace.loafSupported) {
      trace.loafObserver = new PerformanceObserver(list => {
        const active = trace.active;
        if (!active) return;
        for (const entry of list.getEntries()) {
          if (entry.startTime + entry.duration <= active.startedAt) continue;
          active.longAnimationFrames.push({
            startTime: Number(entry.startTime),
            duration: Number(entry.duration),
            renderStart: Number(entry.renderStart) || 0,
            styleAndLayoutStart: Number(entry.styleAndLayoutStart) || 0,
            blockingDuration: Number(entry.blockingDuration) || 0,
            scripts: Array.from(entry.scripts || [], script => ({
              executionStart: Number(script.executionStart) || 0,
              duration: Number(script.duration) || 0,
              forcedStyleAndLayoutDuration: Number(script.forcedStyleAndLayoutDuration) || 0,
              pauseDuration: Number(script.pauseDuration) || 0,
              invokerType: String(script.invokerType || "").slice(0, 80),
              invoker: String(script.invoker || "").slice(0, 160),
              sourceFunctionName: String(script.sourceFunctionName || "").slice(0, 120),
              sourceURL: String(script.sourceURL || "").slice(0, 240),
              sourceCharPosition: Number(script.sourceCharPosition) || 0
            }))
          });
        }
      });
      trace.loafObserver.observe({type: "long-animation-frame"});
    }
    trace.drain = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      await new Promise(resolve => setTimeout(resolve, 100));
    };
    trace.begin = index => {
      if (trace.active) throw new Error("routes diagnostic attempt 尚未 finish");
      const session = app.workerTaskCoordinator.getSessionSnapshot();
      trace.formalCapture = {workerCount: 0, overlayCount: 0, worker: null, overlay: null};
      trace.active = {
        index,
        startedAt: performance.now(),
        responseAt: null,
        responseSummary: null,
        events: [],
        coordinatorRuns: [],
        inputStream: {yieldCount: 0, maxCpuSliceMs: 0, maxWaitMs: 0, slowSamples: []},
        progressBoundaries: [],
        longTasks: [],
        longAnimationFrames: [],
        healthIds: (window.__webglGeneratorHealth?.getEvents?.(500) || []).map(event => event.id),
        sessionBefore: structuredClone(session),
        rendererPerformanceBefore: renderer.getPerformanceEvents?.({includeRecent: true}) || {}
      };
    };
    trace.persistResponse = (index, response) => {
      if (!trace.active || trace.active.index !== index) throw new Error("routes diagnostic response attempt 不匹配");
      trace.active.responseAt = performance.now();
      trace.active.responseSummary = {
        ok: Boolean(response?.ok),
        error: response?.error ? structuredClone(response.error) : null,
        session: response?.data?.worker?.session ? structuredClone(response.data.worker.session) : null,
        telemetry: response?.data?.worker?.telemetry ? structuredClone(response.data.worker.telemetry) : null
      };
      trace.active.responseSignals = {
        loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
          + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden)),
        glError: Number(renderer.getStats().draw?.glError ?? 0)
      };
    };
    trace.finish = () => {
      const active = trace.active;
      if (!active) throw new Error("routes diagnostic 缺少 active attempt");
      active.endedAt = performance.now();
      active.windowMs = round(active.endedAt - active.startedAt);
      const events = active.events.filter(item => item.start < active.endedAt && Number.isFinite(item.end));
      const longTasks = active.longTasks.filter(item => item.startTime < active.endedAt && item.startTime + item.duration > active.startedAt);
      const longAnimationFrames = active.longAnimationFrames.filter(item => item.startTime < active.endedAt && item.startTime + item.duration > active.startedAt);
      const methodSummary = {};
      for (const event of events) {
        const key = `${event.channel}:${event.name}`;
        const summary = methodSummary[key] || {count: 0, maxMs: 0, sumMs: 0};
        summary.count++;
        summary.maxMs = Math.max(summary.maxMs, Number(event.ms) || 0);
        summary.sumMs += Number(event.ms) || 0;
        methodSummary[key] = summary;
      }
      for (const summary of Object.values(methodSummary)) {
        summary.maxMs = round(summary.maxMs);
        summary.sumMs = round(summary.sumMs);
      }
      const longTaskOverlaps = longTasks.map(task => {
        const end = task.startTime + task.duration;
        return {
          ...task,
          events: events.filter(event => event.start < end && event.end > task.startTime).map(event => ({index: event.index, channel: event.channel, name: event.name, start: event.start, end: event.end, ms: event.ms, binding: event.binding, bindingId: event.bindingId, byteLength: event.byteLength, count: event.count}))
        };
      });
      const longAnimationFrameOverlaps = longAnimationFrames.map(frame => {
        const end = frame.startTime + frame.duration;
        return {
          ...frame,
          events: events
            .filter(event => ["overlay", "scheduler", "selection"].includes(event.channel)
              && event.start < end
              && event.end > frame.startTime)
            .map(event => ({index: event.index, channel: event.channel, name: event.name, start: event.start, end: event.end, ms: event.ms, nodes: event.nodes}))
        };
      });
      const rendererPerformanceAfter = renderer.getPerformanceEvents?.({includeRecent: true}) || {};
      const getErrorEvents = events.filter(event => event.channel === "gl" && event.name === "getError");
      const lastGetErrorValue = getErrorEvents.at(-1)?.value;
      const lastDrawGlError = Number(renderer.lastDraw?.glError);
      const performanceLastDrawGlError = Number(rendererPerformanceAfter.draw?.last?.glError);
      if (!getErrorEvents.length
        || lastGetErrorValue !== lastDrawGlError
        || lastGetErrorValue !== performanceLastDrawGlError) {
        throw new Error(`routes diagnostic gl.getError/lastDraw 不同源：${JSON.stringify({lastGetErrorValue, lastDrawGlError, performanceLastDrawGlError, calls: getErrorEvents.length})}`);
      }
      const healthIds = new Set(active.healthIds);
      const healthEvents = (window.__webglGeneratorHealth?.getEvents?.(500) || [])
        .filter(event => !healthIds.has(event.id)
          && Number(event.pageTimeMs) >= active.startedAt
          && Number(event.pageTimeMs) <= active.endedAt)
        .map(event => structuredClone(event));
      const result = {
        index: active.index,
        startedAt: active.startedAt,
        responseAt: active.responseAt,
        endedAt: active.endedAt,
        windowMs: active.windowMs,
        responseSummary: active.responseSummary,
        responseSignals: active.responseSignals || null,
        sessionBefore: active.sessionBefore,
        sessionAfter: structuredClone(app.workerTaskCoordinator.getSessionSnapshot()),
        coordinatorRuns: active.coordinatorRuns.map(item => ({...item})),
        inputStream: {
          yieldCount: active.inputStream.yieldCount,
          maxCpuSliceMs: round(active.inputStream.maxCpuSliceMs),
          maxWaitMs: round(active.inputStream.maxWaitMs),
          slowSamples: active.inputStream.slowSamples.map(item => ({...item}))
        },
        progressBoundaries: active.progressBoundaries.map(item => ({...item, detail: {...item.detail}})),
        methodSummary,
        events,
        longTasks,
        longTaskOverlaps,
        longAnimationFrames,
        longAnimationFrameOverlaps,
        healthEvents,
        rendererPerformanceBefore: active.rendererPerformanceBefore,
        rendererPerformanceAfter,
        glErrorProbe: {
          calls: getErrorEvents.length,
          lastGetErrorValue,
          lastDrawGlError,
          performanceLastDrawGlError
        },
        currentBufferBindings: {
          pointBuffer: bufferId(renderer.pointBuffer),
          routeBuffer: bufferId(renderer.routeBuffer),
          cityIconInstanceBuffer: bufferId(renderer.cityIconLayer?.instanceBuffer)
        },
        scalarSignals: {
          routeDirty: Boolean(renderer.dynamicBuffersDirty.routes),
          routeTimer: Boolean(renderer.routeRefreshTimer),
          routeActive: Number(renderer.routeRefreshActiveVersion) || 0,
          viewportTimer: Boolean(renderer.viewportCommitTimer),
          installSuspended: Number(renderer.workerRenderInstallSuspended) || 0,
          glError: Number(renderer.getStats().draw?.glError ?? 0),
          loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
            + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
        }
      };
      trace.attempts.push(result);
      trace.active = null;
      return structuredClone(result);
    };
    trace.restore = () => {
      trace.active = null;
      trace.formalCapture = null;
      trace.observer?.disconnect?.();
      trace.loafObserver?.disconnect?.();
      for (const restore of [...originals].reverse()) {
        try { restore(); } catch (error) { trace.restoreErrors.push(String(error?.message || error)); }
      }
    };
    window.__task322HundredThousandRoutesDiagnostic = trace;
    return {
      rendererMethods: rendererMethods.filter(name => typeof renderer[name] === "function"),
      schedulerWrapped: typeof globalThis.scheduler?.yield === "function",
      longAnimationFrameSupported: trace.loafSupported
    };
  });
}

async function runHundredThousandRiversGpuDiagnosticGate(page, {flushAfterEach = false} = {}) {
  await createMap(page, "worker-session-100k-rivers-gpu-diagnostic", 100000);
  await discardProbeLongTasks(page);
  const rendererPerformanceBefore = await readRendererPerformanceEvents(page);
  await page.evaluate(flushUploads => {
    const renderer = window.__webglGeneratorApp?.renderer;
    const gl = renderer?.gl;
    if (!gl) throw new Error("100k rivers GPU 诊断缺少正式 WebGL renderer");
    if (window.__task322HundredThousandRiversGpuDiagnostic) throw new Error("100k rivers GPU 诊断已安装");
    const gpuCalls = [];
    const schedulerYields = [];
    const restoreMethods = [];
    let gpuCallIndex = 0;
    let schedulerYieldIndex = 0;
    let nextBufferId = 0;
    let currentArrayBufferBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const bufferIds = new WeakMap();
    const bufferId = buffer => {
      if (!buffer || (typeof buffer !== "object" && typeof buffer !== "function")) return 0;
      if (!bufferIds.has(buffer)) bufferIds.set(buffer, ++nextBufferId);
      return bufferIds.get(buffer);
    };
    const originalFlush = gl.flush;
    if (flushUploads && typeof originalFlush !== "function") throw new Error("100k rivers GPU flush 诊断缺少 gl.flush");
    const round = value => Math.round(Number(value || 0) * 1000) / 1000;
    const targetName = target => target === gl.ARRAY_BUFFER
      ? "ARRAY_BUFFER"
      : target === gl.ELEMENT_ARRAY_BUFFER
        ? "ELEMENT_ARRAY_BUFFER"
        : `0x${Number(target).toString(16)}`;
    const sourceByteLength = (source, sourceOffset = 0, sourceLength = 0) => {
      if (typeof source === "number") return Math.max(0, Number(source) || 0);
      if (source instanceof ArrayBuffer) return source.byteLength;
      if (!ArrayBuffer.isView(source)) return 0;
      const bytesPerElement = Number(source.BYTES_PER_ELEMENT) || 1;
      const offsetBytes = Math.max(0, Number(sourceOffset) || 0) * bytesPerElement;
      const requestedBytes = Math.max(0, Number(sourceLength) || 0) * bytesPerElement;
      return requestedBytes > 0 ? Math.min(requestedBytes, Math.max(0, source.byteLength - offsetBytes)) : Math.max(0, source.byteLength - offsetBytes);
    };
    const replaceMethod = (owner, name, replacement) => {
      const hadOwn = Object.prototype.hasOwnProperty.call(owner, name);
      const descriptor = hadOwn ? Object.getOwnPropertyDescriptor(owner, name) : null;
      const original = owner[name];
      if (typeof original !== "function") throw new Error(`100k rivers GPU 诊断缺少 ${name}`);
      if (descriptor && descriptor.configurable === false) {
        if (descriptor.writable === false) throw new Error(`100k rivers GPU 诊断无法包装 ${name}`);
        owner[name] = replacement(original);
        return () => { owner[name] = original; };
      }
      Object.defineProperty(owner, name, {configurable: true, writable: true, value: replacement(original)});
      return () => {
        if (hadOwn) Object.defineProperty(owner, name, descriptor);
        else delete owner[name];
      };
    };
    restoreMethods.push(replaceMethod(gl, "bindBuffer", original => function (...args) {
      const result = Reflect.apply(original, this, args);
      if (args[0] === gl.ARRAY_BUFFER) currentArrayBufferBinding = args[1] || null;
      return result;
    }));
    restoreMethods.push(replaceMethod(gl, "bufferData", original => function (...args) {
      const startedAt = performance.now();
      let status = "completed";
      try {
        return Reflect.apply(original, this, args);
      } catch (error) {
        status = "threw";
        throw error;
      } finally {
        const endedAt = performance.now();
        gpuCalls.push({
          callIndex: ++gpuCallIndex,
          method: "bufferData",
          bindingId: args[0] === gl.ARRAY_BUFFER ? bufferId(currentArrayBufferBinding) : 0,
          target: Number(args[0]),
          targetName: targetName(args[0]),
          byteLength: sourceByteLength(args[1], args[3], args[4]),
          usage: Number(args[2]),
          startedAt: round(startedAt),
          endedAt: round(endedAt),
          durationMs: round(endedAt - startedAt),
          status
        });
      }
    }));
    restoreMethods.push(replaceMethod(gl, "bufferSubData", original => function (...args) {
      const startedAt = performance.now();
      let subDataEndedAt = startedAt;
      let flushStartedAt = 0;
      let flushEndedAt = 0;
      let status = "completed";
      try {
        let result;
        try {
          result = Reflect.apply(original, this, args);
        } catch (error) {
          subDataEndedAt = performance.now();
          status = "subData-threw";
          throw error;
        }
        subDataEndedAt = performance.now();
        if (flushUploads) {
          flushStartedAt = performance.now();
          try {
            Reflect.apply(originalFlush, gl, []);
          } catch (error) {
            status = "flush-threw";
            throw error;
          } finally {
            flushEndedAt = performance.now();
          }
        }
        return result;
      } finally {
        const endedAt = flushEndedAt || subDataEndedAt || performance.now();
        gpuCalls.push({
          callIndex: ++gpuCallIndex,
          method: "bufferSubData",
          bindingId: args[0] === gl.ARRAY_BUFFER ? bufferId(currentArrayBufferBinding) : 0,
          target: Number(args[0]),
          targetName: targetName(args[0]),
          destinationByteOffset: Math.max(0, Number(args[1]) || 0),
          byteLength: sourceByteLength(args[2], args[3], args[4]),
          startedAt: round(startedAt),
          endedAt: round(endedAt),
          subDataDurationMs: round(subDataEndedAt - startedAt),
          flushDurationMs: flushUploads ? round(flushEndedAt - flushStartedAt) : 0,
          durationMs: round(endedAt - startedAt),
          status
        });
      }
    }));
    const schedulerObject = globalThis.scheduler;
    if (typeof schedulerObject?.yield === "function") {
      restoreMethods.push(replaceMethod(schedulerObject, "yield", original => function (...args) {
        const yieldIndex = ++schedulerYieldIndex;
        const startedAt = performance.now();
        let pending;
        try {
          pending = Reflect.apply(original, this, args);
        } catch (error) {
          const resolvedAt = performance.now();
          schedulerYields.push({yieldIndex, startedAt: round(startedAt), resolvedAt: round(resolvedAt), durationMs: round(resolvedAt - startedAt), status: "threw"});
          throw error;
        }
        return Promise.resolve(pending).then(value => {
          const resolvedAt = performance.now();
          schedulerYields.push({yieldIndex, startedAt: round(startedAt), resolvedAt: round(resolvedAt), durationMs: round(resolvedAt - startedAt), status: "resolved"});
          return value;
        }, error => {
          const resolvedAt = performance.now();
          schedulerYields.push({yieldIndex, startedAt: round(startedAt), resolvedAt: round(resolvedAt), durationMs: round(resolvedAt - startedAt), status: "rejected"});
          throw error;
        });
      }));
    }
    window.__task322HundredThousandRiversGpuDiagnostic = {
      gpuCalls,
      schedulerYields,
      bufferId,
      flushAfterEach: Boolean(flushUploads),
      schedulerWrapped: typeof schedulerObject?.yield === "function",
      installedAt: round(performance.now()),
      operationStartedAt: 0,
      operationEndedAt: 0,
      restore() {
        const errors = [];
        for (const restore of [...restoreMethods].reverse()) {
          try { restore(); } catch (error) { errors.push(String(error?.message || error)); }
        }
        return errors;
      }
    };
  }, Boolean(flushAfterEach));
  const startedAt = Date.now();
  let response = null;
  let operationError = null;
  try {
    response = await page.evaluate(async () => {
      const trace = window.__task322HundredThousandRiversGpuDiagnostic;
      trace.operationStartedAt = Math.round(performance.now() * 1000) / 1000;
      try {
        return await window.webglGeneratorApi.generate.regenerate("rivers", {confirm: true});
      } finally {
        trace.operationEndedAt = Math.round(performance.now() * 1000) / 1000;
      }
    });
  } catch (error) {
    operationError = serializeDiagnosticError(error);
  }
  const wallMs = Date.now() - startedAt;
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  });
  const rendererPerformanceAfter = await readRendererPerformanceEvents(page);
  const rendererPerformanceDiff = Object.fromEntries(Object.entries(rendererPerformanceAfter)
    .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(rendererPerformanceBefore[name])));
  const operationSignals = await readSignals(page);
  const trace = await page.evaluate(() => {
    const installed = window.__task322HundredThousandRiversGpuDiagnostic;
    if (!installed) return null;
    const result = {
      installedAt: installed.installedAt,
      operationStartedAt: installed.operationStartedAt,
      operationEndedAt: installed.operationEndedAt,
      schedulerWrapped: installed.schedulerWrapped,
      flushAfterEach: installed.flushAfterEach,
      gpuCalls: installed.gpuCalls.map(call => ({...call})),
      schedulerYields: installed.schedulerYields.map(item => ({...item}))
    };
    const surfaceBase = window.__task322SurfaceBaseProbe.capture(window.__webglGeneratorApp.renderer);
    result.surfaceBase = window.__task322SurfaceBaseProbe.summary(surfaceBase);
    result.surfaceSegmentBindings = surfaceBase.segments.flatMap(segment => [
      {
        kind: "geometry",
        bindingId: installed.bufferId(segment.geometryBufferRef || segment.bufferRef),
        byteLength: segment.byteLength,
        floatStart: segment.floatStart,
        floatEnd: segment.floatEnd
      },
      {
        kind: "color",
        bindingId: installed.bufferId(segment.colorBufferRef),
        byteLength: segment.colorByteLength,
        floatStart: segment.floatStart,
        floatEnd: segment.floatEnd
      }
    ]);
    result.restoreErrors = installed.restore();
    delete window.__task322HundredThousandRiversGpuDiagnostic;
    return result;
  });
  await discardProbeLongTasks(page);
  const gpuCalls = trace?.gpuCalls || [];
  const schedulerYields = trace?.schedulerYields || [];
  const surfaceBindingIds = new Set((trace?.surfaceSegmentBindings || []).map(item => item.bindingId));
  const surfaceCalls = gpuCalls.filter(call => surfaceBindingIds.has(call.bindingId));
  return {
    wallMs,
    flushAfterEach: Boolean(trace?.flushAfterEach),
    operationError,
    response: {
      ok: Boolean(response?.ok),
      error: response?.error || null,
      data: response?.data ? {
        kind: response.data.kind,
        executed: response.data.executed,
        worker: response.data.worker ? {
          mode: response.data.worker.mode,
          accepted: response.data.worker.accepted,
          session: response.data.worker.session,
          telemetry: response.data.worker.telemetry
        } : null
      } : null
    },
    operation: {startedAt: trace?.operationStartedAt || 0, endedAt: trace?.operationEndedAt || 0},
    gpu: {
      calls: gpuCalls,
      surfaceCalls,
      summary: {
        count: gpuCalls.length,
        bufferData: gpuCalls.filter(call => call.method === "bufferData").length,
        bufferSubData: gpuCalls.filter(call => call.method === "bufferSubData").length,
        totalBytes: gpuCalls.reduce((sum, call) => sum + Number(call.byteLength || 0), 0),
        totalDurationMs: roundDiagnosticMs(gpuCalls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0)),
        maxDurationMs: roundDiagnosticMs(Math.max(0, ...gpuCalls.map(call => Number(call.durationMs) || 0))),
        totalSubDataDurationMs: roundDiagnosticMs(gpuCalls.reduce((sum, call) => sum + Number(call.subDataDurationMs || 0), 0)),
        maxSubDataDurationMs: roundDiagnosticMs(Math.max(0, ...gpuCalls.map(call => Number(call.subDataDurationMs) || 0))),
        totalFlushDurationMs: roundDiagnosticMs(gpuCalls.reduce((sum, call) => sum + Number(call.flushDurationMs || 0), 0)),
        maxFlushDurationMs: roundDiagnosticMs(Math.max(0, ...gpuCalls.map(call => Number(call.flushDurationMs) || 0)))
      }
    },
    surfaceBase: trace?.surfaceBase || null,
    surfaceSegmentBindings: trace?.surfaceSegmentBindings || [],
    scheduler: {
      wrapped: Boolean(trace?.schedulerWrapped),
      yields: schedulerYields,
      summary: {
        count: schedulerYields.length,
        totalDurationMs: roundDiagnosticMs(schedulerYields.reduce((sum, item) => sum + Number(item.durationMs || 0), 0)),
        maxDurationMs: roundDiagnosticMs(Math.max(0, ...schedulerYields.map(item => Number(item.durationMs) || 0)))
      }
    },
    restoreErrors: trace?.restoreErrors || [],
    longTasks: operationSignals.longTasks,
    rendererPerformanceDiff,
    finalSignals: operationSignals
  };
}

function roundDiagnosticMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

async function runHundredThousandSessionGate(page, cdp) {
  await createMap(page, "worker-session-100k", 100000);
  const adoptedSession = await readWorkerSessionSnapshot(page);
  assertIdleAdoptedSession(adoptedSession, "100k generation");
  await installRiverInvariantProbe(page, {dirtyRoutes: true});
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    window.__task322FormalBuffers = [["grid.h", app.map.grid.cells.h], ["grid.p", app.map.grid.cells.p], ["pack.h", app.map.pack.cells.h], ["pack.g", app.map.pack.cells.g]]
      .map(([name, value]) => ({name, value, length: value?.length ?? 0, byteLength: value?.byteLength ?? 0}));
  });
  const heap = {baseline: await heapUsage(cdp)};
  const operations = [];
  try {
    await discardProbeLongTasks(page);
    operations.push(summarizeResult(await regenerate(page, cdp, "rivers")));
    assert.equal(operations[0].worker.session.reused, true, "100k rivers 未复用 generation session");
    assert.equal(operations[0].worker.session.id, adoptedSession.id, "100k rivers 未延续 generation session id");
    await assertNoLongTasks(page, "100k rivers adopted session");
    await clearLongTasks(page);
    const riverInvariant = await assertRiverInvariantProbe(page, {label: "100k rivers", expectedRouteCalls: 0, surfacePatchMode: "reset"});
    assert.ok(riverInvariant.surfaceBase.current.segmentCount > 1, `100k rivers surface 未实际分段：${riverInvariant.surfaceBase.current.segmentCount}`);
    assert.ok(riverInvariant.surfaceBase.current.segments.every(segment => segment.byteLength <= 8 * 1024 * 1024 && segment.floatStart % 18 === 0 && segment.floatEnd % 18 === 0), "100k rivers surface segment 超过8MiB或未按18-float对齐");
    await discardProbeLongTasks(page);
    heap.afterFirst = await heapUsage(cdp);

    operations.push(summarizeResult(await regenerate(page, cdp, "routes")));
    await clearLongTasks(page);
    operations.push(summarizeResult(await regenerate(page, cdp, "markers")));
    await assertNoLongTasks(page, "100k markers reused session");
    await clearLongTasks(page);
    assert.ok(operations.slice(1).every(item => item.worker.session.reused === true), "100k 连续操作没有复用 session");
    assert.ok(operations.every(item => item.worker.session.id === operations[0].worker.session.id), "100k 连续操作 session id 不一致");
    assert.ok(operations.slice(1).every(item => item.telemetry.inputPackets <= 4), "100k session 复用仍传输全图");
    const objectDomParity = await assertRouteMarkerSourceParity(page);
    await discardProbeLongTasks(page);
    heap.afterReuse = await heapUsage(cdp);

    const buffers = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const current = {"grid.h": app.map.grid.cells.h, "grid.p": app.map.grid.cells.p, "pack.h": app.map.pack.cells.h, "pack.g": app.map.pack.cells.g};
      return window.__task322FormalBuffers.map(item => ({
        name: item.name,
        sameRef: current[item.name] === item.value,
        beforeLength: item.length,
        length: item.value?.length ?? 0,
        beforeByteLength: item.byteLength,
        byteLength: item.value?.byteLength ?? 0
      }));
    });
    assert.ok(buffers.every(item => item.sameRef && item.length === item.beforeLength && item.byteLength === item.beforeByteLength), `100k 正式 TypedArray 被替换或 Worker transfer detached：${JSON.stringify(buffers)}`);

    const hardCell = await runHundredThousandHardCellGate(page);
    const cancellation = await cancelAcceptedWorkerOperation(page, "zones");
    const afterCancel = summarizeResult(await regenerate(page, cdp, "routes"));
    assert.equal(afterCancel.worker.session.reused, false, "accepted 取消后错误复用已终止 session");
    heap.afterCancelRecovery = await heapUsage(cdp);
    return {
      adoptedSession,
      operations,
      riverInvariant,
      objectDomParity,
      buffers,
      hardCell,
      heap,
      heapDelta: {
        first: heap.afterFirst.usedSize - heap.baseline.usedSize,
        reuse: heap.afterReuse.usedSize - heap.afterFirst.usedSize,
        recovered: heap.afterCancelRecovery.usedSize - heap.baseline.usedSize
      },
      cancellation,
      afterCancel,
      longTasks: (await readSignals(page)).longTasks
    };
  } finally {
    await page.evaluate(() => {
      window.__task322RiverProbe?.restore?.();
      delete window.__task322RiverProbe;
      delete window.__task322FormalBuffers;
    });
  }
}

async function runHundredThousandHardCellGate(page) {
  try {
    const setup = await page.evaluate(async () => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const api = window.webglGeneratorApi;
      const originalPreferences = {
        colorMode: renderer.colorMode,
        smoothCellBorders: renderer.viewOptions.smoothCellBorders !== false,
        showOceanHeight: Boolean(renderer.viewOptions.showOceanHeight)
      };
      window.__task322HundredThousandHardCell = {originalPreferences};
      const view = await api.layers.setViewMode("height");
      if (!view?.ok) throw new Error(`100k hard-cell 切换高度视图失败：${view?.error?.message || "unknown"}`);
      const ocean = await api.layers.setShowOceanHeight(false);
      if (!ocean?.ok) throw new Error(`100k hard-cell 关闭海洋高度着色失败：${ocean?.error?.message || "unknown"}`);
      const smooth = await api.layers.setSmoothCellBorders(false);
      if (!smooth?.ok) throw new Error(`100k hard-cell 关闭 cell 平滑失败：${smooth?.error?.message || "unknown"}`);
      const cells = app.map.grid.cells;
      const candidates = [...cells.i].filter(cell => {
        const neighbors = cells.c[cell] || [];
        return Number(cells.h[cell]) >= 30
          && Number(cells.h[cell]) <= 98
          && neighbors.length >= 3
          && neighbors.every(neighbor => Number(cells.h[neighbor]) >= 20);
      });
      const first = candidates[0];
      const firstNeighbors = new Set(cells.c[first] || []);
      const second = candidates.find(cell => cell > first && !firstNeighbors.has(cell));
      if (![first, second].every(Number.isInteger)) throw new Error("100k hard-cell 缺少两个互不相邻的合法陆地 cell");
      Object.assign(window.__task322HundredThousandHardCell, {
        targets: {first, second},
        surfaceVertices: renderer.surfaceVertices,
        surfaceBase: window.__task322SurfaceBaseProbe.capture(renderer),
        surfaceRanges: renderer.surfaceCellRanges,
        surfaceByteLength: renderer.surfaceVertices.byteLength,
        surfaceVertexCount: renderer.vertexCount
      });
      return {
        targets: {first, second},
        colorMode: renderer.colorMode,
        smooth: renderer.viewOptions.smoothCellBorders,
        surfaceRanges: renderer.surfaceCellRanges.size,
        cellCount: cells.i.length,
        history: app.editHistory.getStats()
      };
    });
    assert.equal(setup.colorMode, "height", "100k hard-cell 未固定高度视图");
    assert.equal(setup.smooth, false, "100k hard-cell 未进入 hard-cell 模式");
    assert.ok(setup.cellCount >= 99000, `100k hard-cell 实际 grid 规模不足：${setup.cellCount}`);
    await discardProbeLongTasks(page);
    if (setup.surfaceRanges > 0) {
      const ranged = await runSurfaceRangeHeightGate(page, {
        probeKey: "__task322HundredThousandHardCell",
        label: "100k hard-cell",
        expectedHistoryUndo: setup.history.undo + 1,
        operationBudgetMs: 50,
        requireSegmented: true
      });
      return {setup, ...ranged};
    }
    const firstAction = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322HundredThousandHardCell;
      const gridCell = probe.targets.first;
      const before = Number(app.map.grid.cells.h[gridCell]);
      const originalRefresh = renderer.refreshHeightCells;
      let refreshResult = null;
      renderer.refreshHeightCells = function(...args) {
        refreshResult = Reflect.apply(originalRefresh, this, args);
        return refreshResult;
      };
      let edit;
      const startedAt = performance.now();
      try {
        edit = window.webglGeneratorApi.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
      } finally {
        renderer.refreshHeightCells = originalRefresh;
      }
      const range = renderer.surfacePatchCellRanges.get(gridCell);
      if (!range) throw new Error("100k hard-cell 第一格未生成 patch range");
      probe.firstPatch = {
        range: {...range},
        bytes: new Uint8Array(
          renderer.surfacePatchVertices.buffer,
          renderer.surfacePatchVertices.byteOffset + range.start * Float32Array.BYTES_PER_ELEMENT,
          (range.end - range.start) * Float32Array.BYTES_PER_ELEMENT
        ).slice()
      };
      return {
        edit,
        gridCell,
        before,
        after: Number(app.map.grid.cells.h[gridCell]),
        refreshResult,
        operationMs: performance.now() - startedAt,
        history: app.editHistory.getStats(),
        mapCanonical: renderer.map === app.map,
        colorMode: renderer.colorMode,
        smooth: renderer.viewOptions.smoothCellBorders
      };
    });
    assertHeightPatchAction(firstAction, {label: "100k hard-cell 第一格", expectedPatchCells: 1, expectedHistoryUndo: setup.history.undo + 1});
    assert.ok(Number(firstAction.operationMs) < 50, `100k hard-cell 第一格正式高度操作超预算：${firstAction.operationMs}ms`);

    const secondAction = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322HundredThousandHardCell;
      const gridCell = probe.targets.second;
      const before = Number(app.map.grid.cells.h[gridCell]);
      const originalRefresh = renderer.refreshHeightCells;
      let refreshResult = null;
      renderer.refreshHeightCells = function(...args) {
        refreshResult = Reflect.apply(originalRefresh, this, args);
        return refreshResult;
      };
      let edit;
      const startedAt = performance.now();
      try {
        edit = window.webglGeneratorApi.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
      } finally {
        renderer.refreshHeightCells = originalRefresh;
      }
      const firstRange = renderer.surfacePatchCellRanges.get(probe.targets.first);
      const firstBytes = firstRange ? new Uint8Array(
        renderer.surfacePatchVertices.buffer,
        renderer.surfacePatchVertices.byteOffset + firstRange.start * Float32Array.BYTES_PER_ELEMENT,
        (firstRange.end - firstRange.start) * Float32Array.BYTES_PER_ELEMENT
      ) : null;
      return {
        edit,
        gridCell,
        before,
        after: Number(app.map.grid.cells.h[gridCell]),
        refreshResult,
        operationMs: performance.now() - startedAt,
        history: app.editHistory.getStats(),
        mapCanonical: renderer.map === app.map,
        colorMode: renderer.colorMode,
        smooth: renderer.viewOptions.smoothCellBorders,
        patchRanges: renderer.surfacePatchCellRanges.size,
        patchCells: renderer.surfacePatchCells.size,
        firstRange: firstRange ? {...firstRange} : null,
        firstBytesPreserved: firstBytes?.length === probe.firstPatch.bytes.length
          && firstBytes.every((value, index) => value === probe.firstPatch.bytes[index])
      };
    });
    assertHeightPatchAction(secondAction, {label: "100k hard-cell 第二格", expectedPatchCells: 2, expectedHistoryUndo: setup.history.undo + 2});
    assert.ok(Number(secondAction.operationMs) < 50, `100k hard-cell 第二格正式高度操作超预算：${secondAction.operationMs}ms`);
    assert.equal(secondAction.patchRanges, 2, "100k hard-cell 第二格后 patch ranges 未累积为 2");
    assert.equal(secondAction.patchCells, 2, "100k hard-cell 第二格后 patch cells 未累积为 2");
    assert.deepEqual(secondAction.firstRange, await page.evaluate(() => ({...window.__task322HundredThousandHardCell.firstPatch.range})), "100k hard-cell 第二格改写第一格 range");
    assert.equal(secondAction.firstBytesPreserved, true, "100k hard-cell 第二格改写第一格 patch 字节");
    await assertNoLongTasks(page, "100k hard-cell two same-side patches");
    await clearLongTasks(page);

    const state = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const probe = window.__task322HundredThousandHardCell;
      const heightColor = height => {
        const ramp = renderer.viewOptions.visualTheme?.terrain?.heightRamp || [];
        for (let index = 1; index < ramp.length; index++) {
          const [previousHeight, previousColor] = ramp[index - 1];
          const [nextHeight, nextColor] = ramp[index];
          if (height > nextHeight) continue;
          const ratio = Math.max(0, Math.min(1, (height - previousHeight) / Math.max(1, nextHeight - previousHeight)));
          return previousColor.map((value, component) => value + (nextColor[component] - value) * ratio);
        }
        return ramp.at(-1)?.[1] || [];
      };
      let colorMatches = true;
      let sideMatches = true;
      const samples = [];
      for (const target of Object.values(probe.targets)) {
        const range = renderer.surfacePatchCellRanges.get(target);
        const values = range ? renderer.surfacePatchVertices.subarray(range.start, range.end) : new Float32Array();
        const expected = heightColor(Number(app.map.grid.cells.h[target]));
        if (!values.length || !expected.length) colorMatches = false;
        for (let offset = 0; offset < values.length; offset += 6) {
          if (![0, 1, 2].every(index => Math.abs(values[offset + 2 + index] - Number(expected[index])) <= 1e-6)) colorMatches = false;
          if (values[offset + 5] !== 0.25) sideMatches = false;
        }
        samples.push({target, range: range ? {...range} : null, actual: values.length ? Array.from(values.slice(2, 6)) : [], expected});
      }
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.surfacePatchBuffer);
      const gpuByteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const gpu = new Uint8Array(gpuByteLength);
      if (gpuByteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, gpu);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      const cpu = new Uint8Array(renderer.surfacePatchVertices.buffer, renderer.surfacePatchVertices.byteOffset, renderer.surfacePatchVertices.byteLength);
      const sameBytes = cpu.length === gpu.length && cpu.every((value, index) => value === gpu[index]);
      const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
      const surfaceBytes = new Uint8Array(renderer.surfaceVertices.buffer, renderer.surfaceVertices.byteOffset, renderer.surfaceVertices.byteLength);
      let surfaceChecksum = 2166136261;
      for (const byte of surfaceBytes) surfaceChecksum = Math.imul(surfaceChecksum ^ byte, 16777619) >>> 0;
      return {
        base: {
          sameVertices: renderer.surfaceVertices === probe.surfaceVertices,
          exactSurfaceBase: window.__task322SurfaceBaseProbe.exact(surfaceBase, probe.surfaceBase),
          surfaceBase: window.__task322SurfaceBaseProbe.summary(surfaceBase),
          expectedSurfaceBase: window.__task322SurfaceBaseProbe.summary(probe.surfaceBase),
          surfaceCpu: {byteLength: renderer.surfaceVertices.byteLength, checksum: surfaceChecksum},
          sameRanges: renderer.surfaceCellRanges === probe.surfaceRanges,
          ranges: renderer.surfaceCellRanges.size,
          byteLength: renderer.surfaceVertices.byteLength,
          expectedByteLength: probe.surfaceByteLength,
          vertexCount: renderer.vertexCount,
          expectedVertexCount: probe.surfaceVertexCount
        },
        patch: {
          ranges: renderer.surfacePatchCellRanges.size,
          cells: renderer.surfacePatchCells.size,
          contains: Object.values(probe.targets).every(target => renderer.surfacePatchCells.has(target)),
          floats: renderer.surfacePatchVertices.length,
          vertexCount: renderer.surfacePatchVertexCount,
          colorMatches,
          sideMatches,
          samples,
          sameBytes,
          gpuByteLength,
          gpuValid: gl.isBuffer(renderer.surfacePatchBuffer)
        }
      };
    });
    for (const key of ["sameVertices", "sameRanges"]) assert.equal(state.base[key], true, `100k hard-cell base 身份变化：${key}`);
    for (const [key, value] of Object.entries(state.base.exactSurfaceBase)) assert.equal(value, true, `100k hard-cell surface base 身份变化：${key}`);
    assert.deepEqual(state.base.surfaceBase, state.base.expectedSurfaceBase, "100k hard-cell surface base descriptor/GPU 字节变化");
    assert.equal(state.base.surfaceBase.aliasMatches, true, "100k hard-cell surface alias 未指向首段");
    assert.equal(state.base.surfaceBase.descriptorsValid, true, "100k hard-cell surface segment descriptor 无效");
    assert.equal(state.base.surfaceBase.segmentCount, state.base.surfaceBase.expectedSegmentCount, "100k hard-cell surface GPU count 与 ceil 公式不符");
    assert.ok(state.base.surfaceBase.segmentCount > 1, `100k hard-cell surface 未实际分段：${state.base.surfaceBase.segmentCount}`);
    assert.ok(state.base.surfaceBase.segments.every(segment => segment.byteLength <= 8 * 1024 * 1024 && segment.floatStart % 18 === 0 && segment.floatEnd % 18 === 0), "100k hard-cell surface segment 超过8MiB或未按18-float对齐");
    assert.equal(state.base.surfaceBase.aggregate.byteLength, state.base.surfaceCpu.byteLength, "100k hard-cell surface base GPU 总字节与 CPU source 不符");
    assert.equal(state.base.ranges, 0, "100k hard-cell patch 后 surfaceCellRanges 非空");
    assert.equal(state.base.byteLength, state.base.expectedByteLength, "100k hard-cell 改写 base CPU byteLength");
    assert.equal(state.base.vertexCount, state.base.expectedVertexCount, "100k hard-cell 改写 base vertexCount");
    assert.deepEqual({ranges: state.patch.ranges, cells: state.patch.cells, contains: state.patch.contains}, {ranges: 2, cells: 2, contains: true}, "100k hard-cell patch cell/range 不同源");
    assert.ok(state.patch.floats > 0 && state.patch.floats % 18 === 0, "100k hard-cell raw patch 结构无效");
    assert.equal(state.patch.vertexCount * 6, state.patch.floats, "100k hard-cell patch vertexCount 不同源");
    assert.equal(state.patch.colorMatches, true, `100k hard-cell raw patch 颜色不同源：${JSON.stringify(state.patch.samples)}`);
    assert.equal(state.patch.sideMatches, true, "100k hard-cell 同侧 side alpha 不是 land");
    assert.equal(state.patch.sameBytes, true, "100k hard-cell patch CPU/GPU 字节不同源");
    assert.equal(state.patch.gpuByteLength, state.patch.floats * Float32Array.BYTES_PER_ELEMENT, "100k hard-cell patch GPU byteLength 不符");
    assert.equal(state.patch.gpuValid, true, "100k hard-cell patch GPU buffer 已删除");
    await discardProbeLongTasks(page);
    return {setup, firstAction, secondAction, state};
  } finally {
    const restored = await page.evaluate(async () => {
      const probe = window.__task322HundredThousandHardCell;
      if (!probe) return null;
      const api = window.webglGeneratorApi;
      const result = {
        smooth: await api.layers.setSmoothCellBorders(probe.originalPreferences.smoothCellBorders),
        ocean: await api.layers.setShowOceanHeight(probe.originalPreferences.showOceanHeight),
        mode: await api.layers.setViewMode(probe.originalPreferences.colorMode)
      };
      delete window.__task322HundredThousandHardCell;
      return result;
    });
    assert.equal(restored?.smooth?.ok, true, restored?.smooth?.error?.message || "100k hard-cell 恢复 cell 平滑失败");
    assert.equal(restored?.ocean?.ok, true, restored?.ocean?.error?.message || "100k hard-cell 恢复海洋高度着色失败");
    assert.equal(restored?.mode?.ok, true, restored?.mode?.error?.message || "100k hard-cell 恢复视图模式失败");
    await discardProbeLongTasks(page);
  }
}

async function lockAllRivers(page) {
  const response = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const references = (app.map.rivers?.rivers || []).filter(Boolean).map(river => ({kind: "river", id: river.id ?? river.i}));
    return window.webglGeneratorApi.regenerationLocks.setMany(references, true);
  });
  assert.equal(response?.ok, true, `锁定全部河流失败：${response?.error?.message || "unknown"}`);
  return response.data;
}

async function installSessionCommitPause(page) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const original = app.workerTaskCoordinator;
    const compactBinding = value => value && typeof value === "object" ? {
      mapIdentity: String(value.mapIdentity || ""),
      mapRevision: Number(value.mapRevision) || 0,
      generationToken: Number(value.generationToken) || 0,
      lockFingerprint: String(value.lockFingerprint || ""),
      operationId: Number(value.operationId) || 0,
      operationName: String(value.operationName || "")
    } : null;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const pause = {
      started: false,
      release,
      runs: [],
      commits: [],
      faults: {},
      faultHits: {renderOnly: 0, recoveryPrepare: 0, delta0Reject: 0},
      operationSignal: null,
      restore() {
        if (app.workerTaskCoordinator === wrapped) app.workerTaskCoordinator = original;
      }
    };
    const wrapped = Object.freeze({
      ...original,
      async run(task, payload = {}, options = {}) {
        const payloadMode = String(payload?.mode || "");
        const sessionPayloadMode = String(options?.sessionPayload?.mode || "");
        if (!pause.operationSignal && task === "regeneration.compute" && payloadMode !== "render-only") pause.operationSignal = options?.signal || null;
        const record = {
          task: String(task || ""),
          payloadMode,
          payloadOwnMap: Object.prototype.hasOwnProperty.call(payload || {}, "map"),
          sessionMode: String(options?.sessionMode || ""),
          sessionPayloadMode,
          sessionPayloadOwnMap: Object.prototype.hasOwnProperty.call(options?.sessionPayload || {}, "map"),
          allowFallback: options?.allowFallback,
          payloadIsolated: options?.payloadIsolated,
          signalPresent: Boolean(options?.signal),
          signalSameAsOperation: Boolean(options?.signal && pause.operationSignal && options.signal === pause.operationSignal),
          binding: compactBinding(options?.binding),
          renderBinding: compactBinding(options?.sessionPayload?.render?.binding || payload?.render?.binding),
          completed: false,
          errorCode: null,
          resultSession: null
        };
        pause.runs.push(record);
        const shouldFaultRenderOnly = task === "regeneration.compute" && (payloadMode === "render-only" || sessionPayloadMode === "render-only")
          && pause.faults.renderOnly && pause.faultHits.renderOnly++ === 0;
        const shouldFaultRecoveryPrepare = task === "render.prepare" && pause.faults.recoveryPrepare && pause.faultHits.recoveryPrepare++ === 0;
        if (shouldFaultRenderOnly || shouldFaultRecoveryPrepare) {
          const code = shouldFaultRenderOnly ? "task322_render_only_fault" : "task322_recovery_prepare_fault";
          record.errorCode = code;
          const error = new Error(code);
          error.code = code;
          error.stage = shouldFaultRenderOnly ? "render-replay" : "render-recovery";
          error.suggestion = "Task322 恢复链一次性故障夹具";
          throw error;
        }
        try {
          const result = await original.run(task, payload, options);
          record.completed = true;
          const resultSession = result?.session || result?.worker?.session || null;
          record.resultSession = resultSession ? {
            id: String(resultSession.id || ""),
            reused: Boolean(resultSession.reused),
            committed: Boolean(resultSession.committed)
          } : null;
          return result;
        } catch (error) {
          record.errorCode = String(error?.code || error?.name || "unknown");
          throw error;
        }
      },
      async commitSession(sessionId, binding, options = {}) {
        pause.started = true;
        await wait;
        const record = {
          sessionId: String(sessionId || ""),
          binding: compactBinding(binding),
          expectedRevisionDelta: Number(options?.expectedRevisionDelta),
          completed: false,
          result: false
        };
        pause.commits.push(record);
        window.__task322RenderReplayRecovery?.captureTemporaryBuffers?.(`delta-${record.expectedRevisionDelta}`);
        if (record.expectedRevisionDelta === 0 && pause.faults.delta0Reject && pause.faultHits.delta0Reject++ === 0) {
          record.completed = true;
          record.result = false;
          return false;
        }
        const result = await original.commitSession(sessionId, binding, options);
        record.completed = true;
        record.result = result === true;
        return result;
      }
    });
    app.workerTaskCoordinator = wrapped;
    window.__task322SessionCommitPause = pause;
  });
}

async function releaseSessionCommitPause(page, {recordTiming = false} = {}) {
  await page.evaluate(shouldRecordTiming => {
    if (shouldRecordTiming && window.__task322CommittedDisplayTiming) window.__task322CommittedDisplayTiming.releaseAt = performance.now();
    window.__task322SessionCommitPause?.release?.();
  }, recordTiming);
}

async function installOverlayPause(page) {
  await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const original = renderer.prepareOverlayBundleFromDescriptors;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const pause = {
      started: false,
      release,
      restore() {
        if (renderer.prepareOverlayBundleFromDescriptors === wrapped) renderer.prepareOverlayBundleFromDescriptors = original;
      }
    };
    const wrapped = async function(...args) {
      pause.started = true;
      await wait;
      return Reflect.apply(original, this, args);
    };
    renderer.prepareOverlayBundleFromDescriptors = wrapped;
    window.__task322OverlayPause = pause;
  });
}

async function releaseOverlayPause(page) {
  await page.evaluate(() => window.__task322OverlayPause?.release?.());
}

async function restoreOverlayPause(page) {
  await page.evaluate(() => {
    window.__task322OverlayPause?.release?.();
    window.__task322OverlayPause?.restore?.();
    delete window.__task322OverlayPause;
  });
}

async function clearLongTasks(page) {
  await page.evaluate(() => { window.__task322SessionLongTasks.length = 0; });
}

async function discardProbeLongTasks(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    window.__task322SessionLongTasks.length = 0;
  });
}

async function assertNoLongTasks(page, label) {
  const longTasks = await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    return window.__task322SessionLongTasks.slice();
  });
  assert.deepEqual(longTasks.filter(task => Number(task.duration) > 200), [], `${label} 出现 >200ms 主线程 longtask`);
  return longTasks;
}

async function regenerate(page, cdp, kind) {
  const rendererPerformanceBefore = await readRendererPerformanceEvents(page);
  await clearLongTasks(page);
  const metricsBefore = indexMetrics(await cdp.send("Performance.getMetrics"));
  const startedAt = Date.now();
  const response = await page.evaluate(targetKind => window.webglGeneratorApi.generate.regenerate(targetKind, {confirm: true}), kind);
  const wallMs = Date.now() - startedAt;
  assert.equal(response?.ok, true, `${kind} Worker 重生成失败：${response?.error?.code || "unknown"} ${response?.error?.message || ""}`);
  const result = response.data;
  assert.equal(result?.worker?.mode, "worker", `${kind} 没有使用 Worker`);
  assert.equal(result?.worker?.accepted, true, `${kind} Worker 未 accepted`);
  assert.equal(result?.worker?.session?.committed, true, `${kind} Worker session 未提交`);
  assertTelemetry(result.worker.telemetry, kind);
  const metricsAfter = indexMetrics(await cdp.send("Performance.getMetrics"));
  let longTasks;
  try {
    longTasks = await assertNoLongTasks(page, `${kind} Worker regenerate`);
  } catch (error) {
    const rendererPerformanceAfter = await readRendererPerformanceEvents(page);
    const rendererPerformanceDiff = Object.fromEntries(Object.entries(rendererPerformanceAfter)
      .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(rendererPerformanceBefore[name])));
    console.error(`[task322-session-failure] ${JSON.stringify({
      kind,
      session: result.worker.session,
      telemetry: result.worker.telemetry,
      renderInstallStages: result.worker.telemetry?.renderInstallStages || [],
      rendererPerformanceDiff
    }, null, 2)}`);
    throw error;
  }
  const measured = {...result, wallMs, taskDurationDeltaMs: roundMs((metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000), longTasks};
  console.error(`[task322-session] ${kind} wall=${wallMs}ms session=${result.worker.session?.reused ? "reuse" : "fresh"} input=${result.worker.telemetry.inputPackets} output=${result.worker.telemetry.outputPackets} maxPost=${result.worker.telemetry.outputWorkerPostMaxMs}ms install=${result.worker.telemetry.renderInstallPrepareMs}ms`);
  return measured;
}

async function readRendererPerformanceEvents(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(window.__webglGeneratorApp?.renderer?.performanceEvents || {})
    .map(([name, event]) => [name, {
      count: Number(event?.count) || 0,
      last: event?.last ? structuredClone(event.last) : null,
      maxMs: Number(event?.maxMs) || 0,
      totalMs: Number(event?.totalMs) || 0
    }])));
}

async function expectRefreshFault(page, label) {
  await clearLongTasks(page);
  const before = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      riverSalt: Number(app.map.metadata?.regeneration?.rivers) || 0,
      routeSalt: Number(app.map.metadata?.regeneration?.routes) || 0,
      rivers: JSON.stringify(app.map.rivers),
      history: app.editHistory.getStats()
    };
  });
  const {response, rawError, wrapperCalls} = await evaluateRegenerationWithRawError(page, "rivers");
  assert.equal(response?.ok, false, `${label} 没有拒绝刷新故障`);
  assert.equal(response?.error?.code, "worker_regeneration_refresh_fault", `${label} 公开错误码不符`);
  assert.equal(wrapperCalls, 1, `${label} action wrapper 调用次数不符：${wrapperCalls}`);
  assert.equal(errorTreeHasCode(rawError, "worker_regeneration_refresh_fault"), true, `${label} 原始 cause 缺少 refresh fault 码：${JSON.stringify(rawError)}`);
  const after = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const presentation = window.__task322FaultPresentation;
    return {
      riverSalt: Number(app.map.metadata?.regeneration?.rivers) || 0,
      routeSalt: Number(app.map.metadata?.regeneration?.routes) || 0,
      rivers: JSON.stringify(app.map.rivers),
      history: app.editHistory.getStats(),
      camera: JSON.stringify(app.renderer.camera),
      selection: JSON.stringify(app.selectionStore.getSnapshot()),
      highlights: JSON.stringify(app.renderer.objectHighlights),
      presentation,
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
    };
  });
  assert.equal(after.riverSalt, before.riverSalt, `${label} 未回滚河流 salt`);
  assert.equal(after.routeSalt, before.routeSalt, `${label} 改写道路 salt`);
  assert.equal(after.rivers, before.rivers, `${label} 未回滚河流领域`);
  assert.deepEqual(after.history, before.history, `${label} 未回滚历史`);
  assert.equal(after.camera, after.presentation.camera, `${label} 未恢复 camera`);
  assert.equal(after.selection, after.presentation.selection, `${label} 未恢复 selection`);
  assert.equal(after.highlights, after.presentation.highlights, `${label} 未恢复 highlights`);
  assert.equal(after.loadingVisible, 0, `${label} 未清理 Loading`);
  await assertNoLongTasks(page, label);
  return {label, error: response.error, rawError, before: {riverSalt: before.riverSalt, routeSalt: before.routeSalt, history: before.history}};
}

async function evaluateRegenerationWithRawError(page, kind) {
  return page.evaluate(async targetKind => {
    const app = window.__webglGeneratorApp;
    const runtimeGenerate = app.runtimeActions?.generate;
    const originalRegenerate = runtimeGenerate?.regenerate;
    if (typeof originalRegenerate !== "function") throw new Error("缺少 runtime generate action");
    let rawError = null;
    let wrapperCalls = 0;
    const serialize = (error, seen = new Set()) => {
      if (!error || typeof error !== "object") return error == null ? null : {message: String(error)};
      if (seen.has(error)) return {circular: true};
      seen.add(error);
      const value = {
        name: String(error.name || "Error"),
        code: error.code ? String(error.code) : null,
        message: String(error.message || error),
        stage: error.stage ? String(error.stage) : null,
        details: error.details == null ? null : structuredClone(error.details)
      };
      if (error.originalError) value.originalError = serialize(error.originalError, seen);
      if (error.recoveryError) value.recoveryError = serialize(error.recoveryError, seen);
      if (error.cause) value.cause = serialize(error.cause, seen);
      if (Array.isArray(error.errors)) value.errors = error.errors.map(item => serialize(item, seen));
      return value;
    };
    runtimeGenerate.regenerate = async function(...args) {
      wrapperCalls += 1;
      try {
        return await Reflect.apply(originalRegenerate, this, args);
      } catch (error) {
        rawError = serialize(error);
        throw error;
      }
    };
    try {
      const response = await window.webglGeneratorApi.generate.regenerate(targetKind, {confirm: true});
      return {response, rawError, wrapperCalls};
    } finally {
      runtimeGenerate.regenerate = originalRegenerate;
    }
  }, kind);
}

async function cancelAcceptedWorkerOperation(page, kind) {
  const state = await page.evaluate(async targetKind => {
    const app = window.__webglGeneratorApp;
    const original = app.workerTaskCoordinator;
    let hit = 0;
    let cancelled = false;
    let progress = null;
    const wrapped = Object.freeze({
      run(task, payload, options = {}) {
        const originalProgress = options.onProgress;
        return Reflect.apply(original.run, original, [task, payload, {
          ...options,
          onProgress(stage, detail, context) {
            const progressStage = String(stage || "");
            const preAccepted = progressStage === "input-stream"
              || progressStage.startsWith("input-stream-")
              || progressStage === "worker-accept";
            if (!preAccepted && hit === 0) {
              hit = 1;
              progress = {
                stage: progressStage,
                task: String(context?.task || ""),
                fallback: context?.fallback === true
              };
              cancelled = app.runtimeOperation.cancelCurrent("task322 accepted cancellation") === true;
            }
            return originalProgress?.(stage, detail, context);
          }
        }]);
      },
      commitSession: original.commitSession.bind(original),
      invalidateSession: original.invalidateSession.bind(original),
      getSessionSnapshot: original.getSessionSnapshot.bind(original)
    });
    app.workerTaskCoordinator = wrapped;
    try {
      const response = await window.webglGeneratorApi.generate.regenerate(targetKind, {confirm: true});
      return {
        hit,
        cancelled,
        progress,
        response,
        loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
          + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
      };
    } finally {
      if (app.workerTaskCoordinator === wrapped) app.workerTaskCoordinator = original;
    }
  }, kind);
  assert.equal(state.hit, 1, "accepted 取消未精确命中首个 Worker progress");
  assert.equal(state.cancelled, true, "accepted 取消未中止当前操作");
  assert.ok(state.progress?.stage, "accepted 取消缺少 Worker progress 阶段");
  assert.equal(state.progress.stage === "input-stream" || state.progress.stage.startsWith("input-stream-") || state.progress.stage === "worker-accept", false, "accepted 取消误命中 accepted 前进度");
  assert.equal(state.progress?.task, "regeneration.compute", "accepted 取消不是 regeneration.compute Worker progress");
  assert.equal(state.progress?.fallback, false, "accepted 取消误由 fallback progress 触发");
  assert.equal(state.response?.ok, false, "accepted 取消没有拒绝操作");
  assert.equal(state.response?.error?.code, "operation_cancelled", "accepted 取消未进入 operation_cancelled 语义");
  assert.equal(state.loadingVisible, 0, "accepted 取消后 Loading 未清理");
  return state;
}

async function installRiverInvariantProbe(page, {dirtyRoutes}) {
  await page.evaluate(({dirtyRoutes: shouldDirty}) => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const patchCell = renderer.cellVisualMesh?.cells?.find(cell => Number.isInteger(cell?.cell))?.cell;
    const patchResult = Number.isInteger(patchCell) ? renderer.refreshCellSurfacePatchCells([patchCell], {draw: false}) : null;
    if (!patchResult?.patchVertexCount || !renderer.surfacePatchBuffer || !renderer.surfacePatchCellRanges?.size) {
      throw new Error("未能建立非空 surface patch 强门夹具");
    }
    const gl = renderer.gl;
    const fingerprintBuffer = buffer => {
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {byteLength, checksum};
    };
    const routeBufferFingerprint = () => ({...fingerprintBuffer(renderer.routeBuffer), vertexCount: renderer.routeVertexCount, ranges: JSON.stringify(renderer.routeDrawRanges), camera: JSON.stringify(renderer.routeBufferCamera)});
    const buckets = new Map();
    for (const [key, bucket] of renderer.objectPickingIndex.buckets) {
      if (bucket.routeSegments?.length) buckets.set(key, {bucket, array: bucket.routeSegments, segments: [...bucket.routeSegments]});
    }
    const counts = {routeSync: 0, routeAsync: 0, fullIndex: 0, riverPartial: 0};
    const originals = new Map();
    for (const [name, key] of [["updateRouteBuffer", "routeSync"], ["updateRouteBufferAsync", "routeAsync"], ["refreshObjectPickingIndex", "fullIndex"], ["refreshRiverPickingIndex", "riverPartial"]]) {
      const original = renderer[name];
      if (typeof original !== "function") continue;
      originals.set(name, original);
      renderer[name] = function(...args) {
        counts[key]++;
        return Reflect.apply(original, this, args);
      };
    }
    const map = app.map;
    const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
    const surfaceDescriptor = Object.getOwnPropertyDescriptor(renderer, "surfaceBaseBufferSet");
    if (!surfaceDescriptor?.configurable || !("value" in surfaceDescriptor)) throw new Error("surfaceBaseBufferSet 无法安装所有权探针");
    let surfaceBaseValue = renderer.surfaceBaseBufferSet;
    const surfaceAssignments = [];
    Object.defineProperty(renderer, "surfaceBaseBufferSet", {
      configurable: true,
      enumerable: surfaceDescriptor.enumerable,
      get: () => surfaceBaseValue,
      set: value => {
        surfaceBaseValue = value;
        if (value?.segments?.length) surfaceAssignments.push({
          setRef: value,
          segmentsRef: value.segments,
          segments: value.segments.map(segment => ({
            segmentRef: segment,
            geometryBufferRef: segment.geometryBuffer || segment.buffer,
            colorBufferRef: segment.colorBuffer
          }))
        });
      }
    });
    window.__task322RiverProbe = {
      counts,
      originals,
      settlementRoutes: map.settlements.routes,
      settlementObjects: [...map.settlements.routes],
      packRoutes: map.pack.routes,
      packObjects: [...map.pack.routes],
      packCellRoutes: map.pack.cells.routes,
      packCellEntries: Object.keys(map.pack.cells.routes || {}).map(key => [key, map.pack.cells.routes[key]]),
      routeSalt: Number(map.metadata?.regeneration?.routes) || 0,
      routeValue: JSON.stringify({routes: map.settlements.routes, packRoutes: map.pack.routes, packCellRoutes: map.pack.cells.routes}),
      pickingIndex: renderer.objectPickingIndex,
      buckets,
      routeBuffer: renderer.routeBuffer,
      routeDrawRanges: renderer.routeDrawRanges,
      routeBufferCamera: renderer.routeBufferCamera,
      bufferFingerprint: routeBufferFingerprint(),
      bufferFingerprintNow: routeBufferFingerprint,
      surfacePatchBuffer: renderer.surfacePatchBuffer,
      surfacePatchFingerprint: fingerprintBuffer(renderer.surfacePatchBuffer),
      surfacePatchVertices: renderer.surfacePatchVertices,
      surfacePatchCellRanges: renderer.surfacePatchCellRanges,
      surfacePatchCells: renderer.surfacePatchCells,
      surfacePatchVertexCount: renderer.surfacePatchVertexCount,
      surfaceBase,
      surfaceAssignments,
      fingerprintBuffer,
      restore() {
        for (const [name, original] of originals) renderer[name] = original;
        Object.defineProperty(renderer, "surfaceBaseBufferSet", {...surfaceDescriptor, value: surfaceBaseValue});
      }
    };
    if (shouldDirty) renderer.dynamicBuffersDirty.routes = true;
  }, {dirtyRoutes});
}

async function assertRiverInvariantProbe(page, {label, expectedRouteCalls, surfacePatchMode = "preserve"}) {
  const state = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const gl = renderer.gl;
    const map = app.map;
    const probe = window.__task322RiverProbe;
    const surfaceBase = window.__task322SurfaceBaseProbe.capture(renderer);
    const currentSurfaceRefs = new Set(surfaceBase.segments.flatMap(segment => [
      segment.geometryBufferRef || segment.bufferRef,
      segment.colorBufferRef
    ]));
    const temporarySurfaceRefs = [];
    for (const assignment of probe.surfaceAssignments) {
      if (assignment.setRef === surfaceBase.setRef || assignment.setRef === probe.surfaceBase.setRef) continue;
      for (const segment of assignment.segments) {
        for (const [kind, ref] of [["geometry", segment.geometryBufferRef], ["color", segment.colorBufferRef]]) {
          if (ref && !temporarySurfaceRefs.some(item => item.ref === ref)) temporarySurfaceRefs.push({kind, ref});
        }
      }
    }
    const surfaceBytes = new Uint8Array(renderer.surfaceVertices.buffer, renderer.surfaceVertices.byteOffset, renderer.surfaceVertices.byteLength);
    let surfaceChecksum = 2166136261;
    for (const byte of surfaceBytes) surfaceChecksum = Math.imul(surfaceChecksum ^ byte, 16777619) >>> 0;
    const sameArray = (actual, expected) => actual.length === expected.length && actual.every((item, index) => item === expected[index]);
    let pickingIdentity = renderer.objectPickingIndex === probe.pickingIndex;
    for (const [key, expected] of probe.buckets) {
      const bucket = renderer.objectPickingIndex.buckets.get(key);
      if (bucket !== expected.bucket || bucket.routeSegments !== expected.array || !sameArray(bucket.routeSegments, expected.segments)) pickingIdentity = false;
    }
    return {
      counts: {...probe.counts},
      settlementContainer: map.settlements.routes === probe.settlementRoutes,
      settlementObjects: sameArray(map.settlements.routes, probe.settlementObjects),
      packContainer: map.pack.routes === probe.packRoutes,
      packObjects: sameArray(map.pack.routes, probe.packObjects),
      packCellContainer: map.pack.cells.routes === probe.packCellRoutes,
      packCellObjects: Object.keys(map.pack.cells.routes || {}).length === probe.packCellEntries.length
        && Object.keys(map.pack.cells.routes || {}).every((key, index) => probe.packCellEntries[index]?.[0] === key && probe.packCellEntries[index]?.[1] === map.pack.cells.routes[key]),
      routeSalt: Number(map.metadata?.regeneration?.routes) || 0,
      routeValue: JSON.stringify({routes: map.settlements.routes, packRoutes: map.pack.routes, packCellRoutes: map.pack.cells.routes}),
      pickingIdentity,
      routeBuffer: renderer.routeBuffer === probe.routeBuffer,
      routeDrawRanges: renderer.routeDrawRanges === probe.routeDrawRanges,
      routeBufferCamera: renderer.routeBufferCamera === probe.routeBufferCamera,
      bufferFingerprint: probe.bufferFingerprintNow(),
      expectedBufferFingerprint: probe.bufferFingerprint,
      surfacePatch: {
        sameBuffer: renderer.surfacePatchBuffer === probe.surfacePatchBuffer,
        fingerprint: probe.fingerprintBuffer(renderer.surfacePatchBuffer),
        expectedFingerprint: probe.surfacePatchFingerprint,
        sameVertices: renderer.surfacePatchVertices === probe.surfacePatchVertices,
        sameRanges: renderer.surfacePatchCellRanges === probe.surfacePatchCellRanges,
        sameCells: renderer.surfacePatchCells === probe.surfacePatchCells,
        vertexCount: renderer.surfacePatchVertexCount,
        expectedVertexCount: probe.surfacePatchVertexCount,
        verticesLength: renderer.surfacePatchVertices?.length ?? -1,
        rangesSize: renderer.surfacePatchCellRanges?.size ?? -1,
        cellsSize: renderer.surfacePatchCells?.size ?? -1
      },
      surfaceBase: {
        exact: window.__task322SurfaceBaseProbe.exact(surfaceBase, probe.surfaceBase),
        current: window.__task322SurfaceBaseProbe.summary(surfaceBase),
        expected: window.__task322SurfaceBaseProbe.summary(probe.surfaceBase),
        cpu: {byteLength: renderer.surfaceVertices.byteLength, checksum: surfaceChecksum},
        baselineValid: probe.surfaceBase.segments.flatMap(segment => [
          gl.isBuffer(segment.geometryBufferRef || segment.bufferRef),
          gl.isBuffer(segment.colorBufferRef)
        ]),
        temporary: temporarySurfaceRefs.map(item => ({kind: item.kind, active: currentSurfaceRefs.has(item.ref), valid: gl.isBuffer(item.ref)}))
      },
      routesDirty: renderer.dynamicBuffersDirty.routes
    };
  });
  assert.equal(state.counts.routeSync + state.counts.routeAsync, expectedRouteCalls, `${label} 触发道路 mesh 重建`);
  assert.equal(state.counts.fullIndex, 0, `${label} 触发全量 picking 重建`);
  for (const key of ["settlementContainer", "settlementObjects", "packContainer", "packObjects", "packCellContainer", "packCellObjects", "pickingIdentity", "routeBuffer", "routeDrawRanges", "routeBufferCamera", "routesDirty"]) {
    assert.equal(state[key], true, `${label} 道路不变量失败：${key}`);
  }
  assert.equal(state.routeSalt, await page.evaluate(() => window.__task322RiverProbe.routeSalt), `${label} 改写道路 salt`);
  assert.equal(state.routeValue, await page.evaluate(() => window.__task322RiverProbe.routeValue), `${label} 改写道路值域`);
  assert.deepEqual(state.bufferFingerprint, state.expectedBufferFingerprint, `${label} 改写道路 GPU buffer 字节或 ranges`);
  assert.equal(state.surfaceBase.current.aliasMatches, true, `${label} surface base alias 未指向首段`);
  assert.equal(state.surfaceBase.current.descriptorsValid, true, `${label} surface base segment descriptor 无效`);
  assert.equal(state.surfaceBase.current.segmentCount, state.surfaceBase.current.expectedSegmentCount, `${label} surface base GPU count 与 ceil 公式不符`);
  assert.equal(state.surfaceBase.current.aggregate.byteLength, state.surfaceBase.cpu.byteLength, `${label} surface base GPU 总字节与 CPU source 不符`);
  for (const [index, item] of state.surfaceBase.temporary.entries()) {
    assert.equal(item.active, false, `${label} 临时 surface segment #${index} 仍为 active`);
    assert.equal(item.valid, false, `${label} 临时 surface segment #${index} 未删除`);
  }
  if (surfacePatchMode === "preserve") {
    for (const [key, value] of Object.entries(state.surfaceBase.exact)) assert.equal(value, true, `${label} surface base 回滚身份失败：${key}`);
    assert.deepEqual(state.surfaceBase.current, state.surfaceBase.expected, `${label} surface base descriptor/GPU 字节未精确回滚`);
    assert.ok(state.surfaceBase.baselineValid.every(Boolean), `${label} baseline surface segments 被删除`);
    for (const key of ["sameBuffer", "sameVertices", "sameRanges", "sameCells"]) assert.equal(state.surfacePatch[key], true, `${label} surface patch 回滚身份失败：${key}`);
    assert.equal(state.surfacePatch.vertexCount, state.surfacePatch.expectedVertexCount, `${label} surface patch 回滚顶点计数失败`);
    assert.deepEqual(state.surfacePatch.fingerprint, state.surfacePatch.expectedFingerprint, `${label} surface patch GPU 字节未回滚`);
  } else if (surfacePatchMode === "reset") {
    assert.equal(state.surfaceBase.exact.set, false, `${label} surface base 成功提交仍沿用旧 set`);
    assert.ok(state.surfaceBase.baselineValid.every(value => value === false), `${label} surface base 成功提交后旧 segments 未删除`);
    assert.equal(state.surfacePatch.sameBuffer, false, `${label} surface patch 成功提交仍沿用旧 GPU buffer`);
    assert.equal(state.surfacePatch.vertexCount, 0, `${label} surface patch 成功提交未清空顶点计数`);
    assert.equal(state.surfacePatch.verticesLength, 0, `${label} surface patch 成功提交未清空 vertices`);
    assert.equal(state.surfacePatch.rangesSize, 0, `${label} surface patch 成功提交未清空 ranges`);
    assert.equal(state.surfacePatch.cellsSize, 0, `${label} surface patch 成功提交未清空 cells`);
    assert.equal(state.surfacePatch.fingerprint.byteLength, 0, `${label} surface patch 成功提交 GPU buffer 非空`);
  }
  return state;
}

async function assertRouteMarkerSourceParity(page) {
  const state = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const renderer = app.renderer;
    const routes = new Map((map.settlements?.routes || []).filter(Boolean).map(route => [String(route.id), route]));
    const markers = new Map((map.markers?.markers || []).filter(marker => marker && Number.isFinite(marker.x) && Number.isFinite(marker.y)).map(marker => [String(marker.id), marker]));
    const cityLayer = renderer.cityIconLayer;
    let routeSegments = 0;
    let routeSameSource = true;
    let markerPicking = 0;
    let markerPickingSameSource = true;
    for (const bucket of renderer.objectPickingIndex?.buckets?.values?.() || []) {
      for (const segment of bucket.routeSegments || []) {
        routeSegments++;
        const canonical = routes.get(String(segment.route?.id));
        if (!canonical || segment.route !== canonical || segment.a !== canonical.points?.[segment.index] || segment.b !== canonical.points?.[segment.index + 1]) routeSameSource = false;
      }
      for (const marker of bucket.markers || []) {
        markerPicking++;
        if (markers.get(String(marker?.id)) !== marker) markerPickingSameSource = false;
      }
    }
    const markerDomSameSource = renderer.markerIconItems.every(item => {
      const canonical = markers.get(String(item.id));
      return item.marker === canonical
        && item.node?.isConnected
        && item.node?.dataset?.markerId === String(canonical?.id)
        && item.node?.title === item.tooltip
        && item.node?.getAttribute("aria-label") === item.tooltip;
    });
    const gl = renderer.gl;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindBuffer(gl.ARRAY_BUFFER, cityLayer.instanceBuffer);
    const cityGpuByteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
    const cityGpuBytes = new Uint8Array(cityGpuByteLength);
    if (cityGpuByteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, cityGpuBytes);
    gl.bindBuffer(gl.ARRAY_BUFFER, previous);
    const cityDataBytes = new Uint8Array(cityLayer.instanceData.buffer, cityLayer.instanceData.byteOffset, cityLayer.instanceData.byteLength);
    const checksum = values => {
      let value = 2166136261;
      for (const item of values) value = Math.imul(value ^ item, 16777619) >>> 0;
      return value;
    };
    const cityIndexValid = cityLayer.instances.every((item, index) => cityLayer.instanceIndexById.get(String(item.id)) === index);
    const cityItemsAligned = cityLayer.instances.length === renderer.cityIconItems.length
      && cityLayer.instances.every((item, index) => String(item.id) === String(renderer.cityIconItems[index]?.id));
    return {
      routes: routes.size,
      routeSegments,
      routeSameSource,
      markers: markers.size,
      markerItems: renderer.markerIconItems.length,
      markerPicking,
      markerPickingSameSource,
      markerDomSameSource,
      cityIcons: {
        instances: cityLayer.instances.length,
        indexSize: cityLayer.instanceIndexById.size,
        dataByteLength: cityLayer.instanceData.byteLength,
        gpuByteLength: cityGpuByteLength,
        dataChecksum: checksum(cityDataBytes),
        gpuChecksum: checksum(cityGpuBytes),
        indexValid: cityIndexValid,
        itemsAligned: cityItemsAligned,
        stats: {...cityLayer.stats}
      }
    };
  });
  assert.equal(state.routeSameSource, true, "route picking 仍引用 Worker clone 而非正式地图对象");
  assert.ok(state.routes === 0 || state.routeSegments > 0, "正式路线缺少 picking segments");
  assert.equal(state.markerPickingSameSource, true, "marker picking 仍引用 Worker clone 而非正式地图对象");
  assert.equal(state.markerDomSameSource, true, "marker overlay DOM 与正式地图对象不同源");
  assert.equal(state.markerItems, state.markers, "marker overlay DOM 数量与正式对象不一致");
  assert.equal(state.cityIcons.indexValid, true, "cityIconLayer index 与 instances 不同源");
  assert.equal(state.cityIcons.itemsAligned, true, "cityIconLayer instances 与正式 renderer items 不同源");
  assert.equal(state.cityIcons.indexSize, state.cityIcons.instances, "cityIconLayer index 数量不一致");
  assert.equal(state.cityIcons.gpuByteLength, state.cityIcons.dataByteLength, "cityIconLayer GPU 字节数与 instanceData 不一致");
  assert.equal(state.cityIcons.gpuChecksum, state.cityIcons.dataChecksum, "cityIconLayer GPU bytes 与 instanceData 不一致");
  assert.equal(state.cityIcons.stats.instanceCount, state.cityIcons.instances, "cityIconLayer stats instanceCount 不一致");
  return state;
}

function summarizeResult(result) {
  return {
    kind: result.kind,
    wallMs: result.wallMs,
    taskDurationDeltaMs: result.taskDurationDeltaMs,
    worker: {mode: result.worker.mode, accepted: result.worker.accepted, session: result.worker.session},
    telemetry: result.worker.telemetry
  };
}

async function readWorkerSessionSnapshot(page) {
  return page.evaluate(() => structuredClone(window.__webglGeneratorApp.workerTaskCoordinator.getSessionSnapshot()));
}

function assertIdleAdoptedSession(session, label, {expectedRevision = null} = {}) {
  assert.equal(typeof session?.id, "string", `${label} session id 类型无效`);
  assert.ok(session.id, `${label} 缺少 session id`);
  assert.equal(session.status, "idle", `${label} session 非 idle`);
  assert.equal(session.adopted, true, `${label} session 未标记 adopted`);
  assert.equal(typeof session.checksum, "string", `${label} replica checksum 类型无效`);
  assert.ok(session.checksum, `${label} session 缺少 replica checksum`);
  assert.equal(typeof session.binding?.mapIdentity, "string", `${label} mapIdentity 类型无效`);
  assert.ok(session.binding.mapIdentity, `${label} 缺少 mapIdentity`);
  assert.equal(typeof session.binding.mapRevision, "number", `${label} mapRevision 类型无效`);
  assert.ok(Number.isSafeInteger(session.binding.mapRevision) && session.binding.mapRevision >= 0, `${label} mapRevision 值无效`);
  assert.equal(typeof session.binding.generationToken, "number", `${label} generationToken 类型无效`);
  assert.ok(Number.isSafeInteger(session.binding.generationToken) && session.binding.generationToken >= 0, `${label} generationToken 值无效`);
  assert.equal(typeof session.binding.lockFingerprint, "string", `${label} lockFingerprint 类型无效`);
  assert.ok(session.binding.lockFingerprint, `${label} 缺少 lockFingerprint`);
  if (expectedRevision != null) assert.equal(session.binding.mapRevision, expectedRevision, `${label} mapRevision 不符`);
}

function assertSessionContinuity(before, after, {label, revisionDelta, checksum, lockFingerprint}) {
  assertIdleAdoptedSession(before, `${label} before`);
  assertIdleAdoptedSession(after, `${label} after`);
  assert.equal(after.id, before.id, `${label} session id 漂移`);
  assert.equal(after.binding.mapIdentity, before.binding.mapIdentity, `${label} mapIdentity 漂移`);
  assert.equal(after.binding.generationToken, before.binding.generationToken, `${label} generationToken 漂移`);
  assert.equal(after.binding.mapRevision, before.binding.mapRevision + revisionDelta, `${label} revision 未精确推进 ${revisionDelta}`);
  if (checksum === "same") assert.equal(after.checksum, before.checksum, `${label} checksum 漂移`);
  else if (checksum === "changed") assert.notEqual(after.checksum, before.checksum, `${label} checksum 未更新`);
  else throw new Error(`${label} checksum 断言模式无效`);
  if (lockFingerprint === "same") assert.equal(after.binding.lockFingerprint, before.binding.lockFingerprint, `${label} lockFingerprint 漂移`);
  else if (lockFingerprint === "changed") assert.notEqual(after.binding.lockFingerprint, before.binding.lockFingerprint, `${label} lockFingerprint 未更新`);
  else throw new Error(`${label} lockFingerprint 断言模式无效`);
}

function assertSessionReplacement(before, after, label) {
  assertIdleAdoptedSession(before, `${label} before`);
  assertIdleAdoptedSession(after, `${label} after`, {expectedRevision: 0});
  assert.notEqual(after.id, before.id, `${label} 仍沿用旧 session id`);
  assert.notEqual(after.binding.mapIdentity, before.binding.mapIdentity, `${label} 仍沿用旧 mapIdentity`);
  assert.notEqual(after.checksum, before.checksum, `${label} 仍沿用旧 replica checksum`);
  assert.notEqual(after.binding.lockFingerprint, before.binding.lockFingerprint, `${label} 仍沿用旧 lockFingerprint`);
}

function summarizeWorker(result) {
  return {executed: result.executed, session: result.worker.session, telemetry: result.worker.telemetry};
}

function assertTelemetry(telemetry, label) {
  for (const field of ["inputPackets", "inputPostMaxMs", "outputPackets", "outputDecodeMaxMs", "outputWorkerPostMaxMs", "computeMs", "renderInstallPrepareMs", "renderInstallCommitMs", "uiRefreshMs"]) {
    assert.equal(Number.isFinite(Number(telemetry?.[field])), true, `${label} 缺少 ${field}`);
  }
  assert.ok(Number(telemetry.inputPostMaxMs) < 50, `${label} 输入 post 单包超预算：${telemetry.inputPostMaxMs}`);
  assert.ok(Number(telemetry.outputDecodeMaxMs) < 50, `${label} 输出 decode 单包超预算：${telemetry.outputDecodeMaxMs}`);
  assert.ok(Number(telemetry.outputWorkerPostMaxMs) < 50, `${label} Worker 输出 post 单包超预算：${telemetry.outputWorkerPostMaxMs}`);
}

async function createMap(page, seed, cellsTarget) {
  const startedAt = Date.now();
  const response = await page.evaluate(input => window.webglGeneratorApi.generate.newMap({confirm: true, seed: input.seed, cellsTarget: input.cellsTarget, heightmapTemplate: "continents"}), {seed, cellsTarget});
  assert.equal(response?.ok, true, `创建 ${cellsTarget} 基线失败：${response?.error?.message || "unknown"}`);
  console.error(`[task322-session] newMap ${cellsTarget} wall=${Date.now() - startedAt}ms`);
  await page.evaluate(async () => {
    const cityStats = () => JSON.stringify(window.__webglGeneratorApp?.renderer?.cityIconLayer?.stats || {});
    let previous = cityStats();
    let stableFrames = 0;
    for (let frame = 0; frame < 180 && stableFrames < 12; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = cityStats();
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
    }
    if (stableFrames < 12) throw new Error("新图 cityIconLayer stats 未在 180 帧内稳定");
    window.__webglGeneratorApp.editHistory.clear();
    window.__task322SessionLongTasks.length = 0;
    window.__webglGeneratorHealth?.clear?.();
  });
}

async function readSignals(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const health = window.__webglGeneratorHealth?.getEvents?.(500) || [];
    return {
      longTasks: window.__task322SessionLongTasks.slice(),
      nonPerformanceHealth: health.filter(event => event.severity === "error" && !["main-thread-long-task", "operation-stall", "render-frame-gap", "input-handler-stall"].includes(event.type)),
      glError: Number(app.renderer.getStats().draw?.glError ?? 0),
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
    };
  });
}

async function heapUsage(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const usage = await cdp.send("Runtime.getHeapUsage");
  return {usedSize: Number(usage.usedSize) || 0, totalSize: Number(usage.totalSize) || 0, embedderHeapUsedSize: Number(usage.embedderHeapUsedSize) || 0};
}

function indexMetrics(response) {
  return Object.fromEntries((response.metrics || []).map(item => [item.name, item.value]));
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function initializeDiagnosticLifecycle() {
  mkdirSync(diagnosticDir, {recursive: true});
  writeFileSync(diagnosticLifecyclePath, "", "utf8");
  recordDiagnosticLifecycle("node-start", {pid: process.pid, argv: process.argv.slice(2)});
  console.error(`[task322-session-diagnostic] lifecycle=${diagnosticLifecyclePath}`);
  let forwardingUnhandledRejection = false;
  process.on("unhandledRejection", reason => {
    recordDiagnosticLifecycle("node-unhandled-rejection", {error: serializeDiagnosticError(reason)});
    if (forwardingUnhandledRejection) return;
    forwardingUnhandledRejection = true;
    setImmediate(() => {
      throw reason instanceof Error ? reason : new Error(String(reason));
    });
  });
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    recordDiagnosticLifecycle("node-uncaught-exception", {origin, error: serializeDiagnosticError(error)});
  });
  process.on("beforeExit", code => recordDiagnosticLifecycle("node-before-exit", {code}));
  process.on("exit", code => recordDiagnosticLifecycle("node-exit", {code}));
}

function installBrowserDiagnosticLifecycle(targetBrowser) {
  targetBrowser.on("disconnected", () => recordDiagnosticLifecycle("browser-disconnected", {phase: diagnosticPhase}));
}

function installPageDiagnosticLifecycle(page) {
  page.on("crash", () => recordDiagnosticLifecycle("page-crash", {phase: diagnosticPhase, url: page.url()}));
  page.on("close", () => recordDiagnosticLifecycle("page-close", {phase: diagnosticPhase, url: page.url()}));
}

function installTargetDiagnosticLifecycle(targetCdp) {
  const targets = new Map();
  targetCdp.on("Target.targetCreated", event => {
    if (event?.targetInfo?.targetId) targets.set(event.targetInfo.targetId, event.targetInfo);
  });
  targetCdp.on("Target.targetInfoChanged", event => {
    if (event?.targetInfo?.targetId) targets.set(event.targetInfo.targetId, event.targetInfo);
  });
  targetCdp.on("Target.targetDestroyed", event => {
    const info = targets.get(event.targetId);
    recordDiagnosticLifecycle("target-destroyed", {phase: diagnosticPhase, targetId: event.targetId, type: info?.type || null, url: info?.url || null});
    targets.delete(event.targetId);
  });
  targetCdp.on("Target.targetCrashed", event => {
    const info = targets.get(event.targetId);
    recordDiagnosticLifecycle("target-crashed", {
      phase: diagnosticPhase,
      targetId: event.targetId,
      type: info?.type || null,
      url: info?.url || null,
      status: event.status,
      errorCode: event.errorCode
    });
  });
}

async function withCommittedDisplayDiagnosticDeadline(promise) {
  const remainingMs = Math.max(1, 295000 - (Date.now() - diagnosticStartedAt));
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error("committed-display diagnostic exceeded the 295s total deadline"), {code: "diagnostic_timeout"});
      recordDiagnosticLifecycle("diagnostic-timeout", {error: serializeDiagnosticError(error)});
      reject(error);
    }, remainingMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function withRenderReplayRecoveryDiagnosticDeadline(promise) {
  const remainingMs = Math.max(1, 590000 - (Date.now() - diagnosticStartedAt));
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error("render-replay recovery diagnostic exceeded the 590s total deadline"), {code: "diagnostic_timeout"});
      recordDiagnosticLifecycle("diagnostic-timeout", {error: serializeDiagnosticError(error)});
      reject(error);
    }, remainingMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function installCommittedDisplayMethodTiming(page) {
  return page.evaluate(() => {
    window.__task322CommittedDisplayTiming?.restore?.();
    const renderer = window.__webglGeneratorApp.renderer;
    const methodNames = [
      "resumeWorkerRenderInstall",
      "applyDeferredWorkerRenderMutations",
      "applyWorkerRenderMutationBatch",
      "rebuildPoliticalVisualMeshesIfNeeded",
      "rebuildPoliticalVisualMeshes",
      "updatePoliticalMeshDebugBuffer",
      "refreshCellSurface",
      "refreshLineLayers",
      "refreshPointLayers",
      "refreshLabels",
      "refreshMilitaryIconLabels",
      "buildLabels",
      "updateLabels",
      "updateSelectionBuffer",
      "draw",
      "onViewChange"
    ];
    const recorder = {
      startedAt: performance.now(),
      releaseAt: null,
      calls: [],
      sequence: 0,
      depth: 0,
      longTaskStartIndex: window.__task322SessionLongTasks.length,
      rendererPerformanceBefore: renderer.getPerformanceEvents?.({includeRecent: true}) || {},
      originals: []
    };
    const state = () => ({
      suspended: Number(renderer.workerRenderInstallSuspended) || 0,
      deferredKeys: [...(renderer.workerRenderInstallDeferredMutations?.keys?.() || [])],
      pendingDraw: Boolean(renderer.workerRenderInstallPendingDraw),
      viewportChanged: Boolean(renderer.workerRenderInstallViewportChanged),
      dirty: {...renderer.dynamicBuffersDirty},
      politicalDebugMode: renderer.politicalMeshDebugMode
    });
    const inputDetails = (name, args) => {
      if (name === "applyWorkerRenderMutationBatch") return {mutationKeys: (args[0] || []).map(mutation => mutation?.key || null)};
      if (name === "resumeWorkerRenderInstall") return {options: {...(args[0] || {})}};
      if (["refreshCellSurface", "refreshLineLayers", "refreshPointLayers", "draw"].includes(name)) return {options: {...(args[0] || {})}};
      if (name === "buildLabels") return {mapIdentity: args[0]?.metadata?.mapIdentity || args[0]?.metadata?.identity || null};
      if (name === "onViewChange") return {event: args[0] && typeof args[0] === "object" ? {...args[0]} : args[0] ?? null};
      return {};
    };
    const finish = (call, error = null) => {
      call.end = performance.now();
      call.ms = Math.round((call.end - call.start) * 1000) / 1000;
      if (error) call.error = error?.message || String(error);
      if (call.name === "resumeWorkerRenderInstall" || call.name === "applyWorkerRenderMutationBatch") {
        const nestedNames = recorder.calls
          .filter(item => item.index > call.index && item.depth > call.depth && item.start >= call.start && Number.isFinite(item.end) && item.end <= call.end + 0.01)
          .map(item => item.name);
        call.nestedMethods = [...new Set(nestedNames)];
        call.refreshFlags = {
          political: nestedNames.some(name => ["rebuildPoliticalVisualMeshesIfNeeded", "rebuildPoliticalVisualMeshes", "updatePoliticalMeshDebugBuffer"].includes(name)),
          surface: nestedNames.includes("refreshCellSurface"),
          lines: nestedNames.includes("refreshLineLayers"),
          points: nestedNames.includes("refreshPointLayers"),
          labels: nestedNames.some(name => ["refreshLabels", "buildLabels", "updateLabels", "refreshMilitaryIconLabels"].includes(name)),
          selection: nestedNames.includes("updateSelectionBuffer"),
          draw: nestedNames.includes("draw"),
          viewChange: nestedNames.includes("onViewChange")
        };
        call.after = state();
      }
    };
    for (const name of methodNames) {
      const original = renderer[name];
      if (typeof original !== "function") continue;
      const hadOwn = Object.prototype.hasOwnProperty.call(renderer, name);
      recorder.originals.push({name, original, hadOwn});
      renderer[name] = function(...args) {
        const call = {
          index: ++recorder.sequence,
          name,
          depth: recorder.depth,
          start: performance.now(),
          input: inputDetails(name, args),
          ...(name === "resumeWorkerRenderInstall" || name === "applyWorkerRenderMutationBatch" ? {before: state()} : {})
        };
        recorder.calls.push(call);
        recorder.depth += 1;
        try {
          const result = Reflect.apply(original, this, args);
          finish(call);
          return result;
        } catch (error) {
          finish(call, error);
          throw error;
        } finally {
          recorder.depth -= 1;
        }
      };
    }
    recorder.restore = () => {
      for (const {name, original, hadOwn} of recorder.originals) {
        if (hadOwn) renderer[name] = original;
        else delete renderer[name];
      }
    };
    window.__task322CommittedDisplayTiming = recorder;
    return {availableMethods: recorder.originals.map(item => item.name), startedAt: recorder.startedAt};
  });
}

async function persistCommittedDisplayDiagnosticResponse(page, response) {
  const worker = response?.data?.worker || null;
  recordDiagnosticLifecycle("states-response-worker", {
    ok: response?.ok === true,
    session: worker?.session || null,
    telemetry: worker?.telemetry || null,
    renderInstallStages: worker?.telemetry?.renderInstallStages || []
  });
  const timing = await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const recorder = window.__task322CommittedDisplayTiming;
    if (!recorder) return {available: false};
    const renderer = window.__webglGeneratorApp.renderer;
    const calls = recorder.calls.map(call => structuredClone(call));
    const methodSummary = {};
    for (const call of calls) {
      const summary = methodSummary[call.name] || {count: 0, maxMs: 0, sumMs: 0};
      summary.count += 1;
      summary.maxMs = Math.max(summary.maxMs, Number(call.ms) || 0);
      summary.sumMs += Number(call.ms) || 0;
      methodSummary[call.name] = summary;
    }
    for (const summary of Object.values(methodSummary)) {
      summary.maxMs = Math.round(summary.maxMs * 1000) / 1000;
      summary.sumMs = Math.round(summary.sumMs * 1000) / 1000;
    }
    const intervals = [];
    for (const call of calls.filter(item => Number.isFinite(item.end)).sort((left, right) => left.start - right.start || left.index - right.index)) {
      const previous = intervals.at(-1);
      if (previous && call.start <= previous.end + 0.05) {
        previous.end = Math.max(previous.end, call.end);
        previous.callIndexes.push(call.index);
        if (!previous.methods.includes(call.name)) previous.methods.push(call.name);
      } else {
        intervals.push({start: call.start, end: call.end, callIndexes: [call.index], methods: [call.name]});
      }
    }
    for (const interval of intervals) interval.ms = Math.round((interval.end - interval.start) * 1000) / 1000;
    const afterPerformance = renderer.getPerformanceEvents?.({includeRecent: true}) || {};
    const rendererPerformanceDelta = {};
    for (const name of new Set([...Object.keys(recorder.rendererPerformanceBefore), ...Object.keys(afterPerformance)])) {
      const before = recorder.rendererPerformanceBefore[name] || {};
      const after = afterPerformance[name] || {};
      const counters = {};
      for (const field of ["scheduled", "started", "completed", "canceled", "failed"]) {
        const delta = (Number(after[field]) || 0) - (Number(before[field]) || 0);
        if (delta) counters[field] = delta;
      }
      const recent = (after.recent || []).filter(event => Number(event.sequence) > (Number(before.sequence) || 0));
      if (Object.keys(counters).length || recent.length) rendererPerformanceDelta[name] = {counters, recent};
    }
    const longTasks = window.__task322SessionLongTasks.slice(recorder.longTaskStartIndex).map(item => ({...item}));
    const longTaskAlignment = longTasks.map(task => {
      const end = task.startTime + task.duration;
      return {
        ...task,
        overlappingCalls: calls.filter(call => Number.isFinite(call.end) && call.start < end && call.end > task.startTime).map(call => ({index: call.index, name: call.name, depth: call.depth, start: call.start, end: call.end, ms: call.ms}))
      };
    });
    return {
      available: true,
      startedAt: recorder.startedAt,
      releaseAt: recorder.releaseAt,
      capturedAt: performance.now(),
      methodSummary,
      calls,
      continuousIntervals: intervals,
      mutationBatches: calls.filter(call => call.name === "applyWorkerRenderMutationBatch").map(call => ({index: call.index, input: call.input, refreshFlags: call.refreshFlags, nestedMethods: call.nestedMethods, ms: call.ms})),
      rendererPerformanceDelta,
      longTasks,
      longTaskAlignment
    };
  });
  recordDiagnosticLifecycle("committed-display-method-timing", timing);
  return timing;
}

async function captureCommittedDisplayDiagnosticSnapshot(page, cdp, targetCdp, label, annotation = {}) {
  const snapshot = {label, annotation};
  snapshot.heap = await captureDiagnosticPart(() => cdp.send("Runtime.getHeapUsage"));
  snapshot.performance = await captureDiagnosticPart(async () => indexMetrics(await cdp.send("Performance.getMetrics")));
  snapshot.dom = await captureDiagnosticPart(() => cdp.send("Memory.getDOMCounters"));
  snapshot.targets = await captureDiagnosticPart(async () => {
    const response = await targetCdp.send("Target.getTargets");
    const byType = {};
    for (const info of response.targetInfos || []) byType[info.type] = (byType[info.type] || 0) + 1;
    return {
      total: (response.targetInfos || []).length,
      workers: (response.targetInfos || []).filter(info => /worker/i.test(info.type)).length,
      byType
    };
  });
  snapshot.app = await captureDiagnosticPart(() => page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const estimateTypedBytes = (root, blocked = new Set()) => {
      const seenObjects = new WeakSet();
      const seenBuffers = new Set();
      const stack = [{value: root, depth: 0}];
      let nodes = 0;
      let views = 0;
      let truncated = false;
      while (stack.length) {
        const {value, depth} = stack.pop();
        if (!value || typeof value !== "object" || blocked.has(value)) continue;
        if (ArrayBuffer.isView(value)) {
          views += 1;
          if (value.buffer) seenBuffers.add(value.buffer);
          continue;
        }
        if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)) {
          seenBuffers.add(value);
          continue;
        }
        if (seenObjects.has(value)) continue;
        seenObjects.add(value);
        nodes += 1;
        if (nodes >= 250000 || depth >= 14) {
          truncated = true;
          continue;
        }
        if (typeof Node !== "undefined" && value instanceof Node) continue;
        if (/^\[object WebGL/.test(Object.prototype.toString.call(value))) continue;
        if (value instanceof Map) {
          for (const [key, item] of value) {
            if (key && typeof key === "object") stack.push({value: key, depth: depth + 1});
            if (item && typeof item === "object") stack.push({value: item, depth: depth + 1});
          }
          continue;
        }
        if (value instanceof Set) {
          for (const item of value) if (item && typeof item === "object") stack.push({value: item, depth: depth + 1});
          continue;
        }
        for (const key of Object.keys(value)) {
          let item;
          try {
            item = value[key];
          } catch {
            continue;
          }
          if (item && typeof item === "object") stack.push({value: item, depth: depth + 1});
        }
      }
      return {
        buffers: seenBuffers.size,
        views,
        bytes: [...seenBuffers].reduce((total, buffer) => total + (Number(buffer.byteLength) || 0), 0),
        nodes,
        truncated
      };
    };
    const collectGpuBuffers = root => {
      const seenObjects = new WeakSet();
      const buffers = new Set();
      const stack = [{value: root, depth: 0}];
      let references = 0;
      let nodes = 0;
      while (stack.length) {
        const {value, depth} = stack.pop();
        if (!value || typeof value !== "object" || value === app.map || value === renderer.gl || value === renderer.canvas || value === renderer.overlay) continue;
        if (typeof WebGLBuffer !== "undefined" && value instanceof WebGLBuffer) {
          references += 1;
          buffers.add(value);
          continue;
        }
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || seenObjects.has(value)) continue;
        if (typeof Node !== "undefined" && value instanceof Node) continue;
        if (/^\[object WebGL/.test(Object.prototype.toString.call(value))) continue;
        seenObjects.add(value);
        nodes += 1;
        if (nodes >= 100000 || depth >= 10) continue;
        if (value instanceof Map || value instanceof Set) {
          for (const item of value.values()) if (item && typeof item === "object") stack.push({value: item, depth: depth + 1});
          continue;
        }
        for (const key of Object.keys(value)) {
          let item;
          try {
            item = value[key];
          } catch {
            continue;
          }
          if (item && typeof item === "object") stack.push({value: item, depth: depth + 1});
        }
      }
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      let liveRefs = 0;
      let bytes = 0;
      const sizes = [];
      try {
        for (const buffer of buffers) {
          if (!gl.isBuffer(buffer)) {
            sizes.push(null);
            continue;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          const size = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
          liveRefs += 1;
          bytes += size;
          sizes.push(size);
        }
      } finally {
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      }
      return {references, uniqueRefs: buffers.size, liveRefs, bytes, sizes};
    };
    const rendererBlocked = new Set([app.map, renderer.gl, renderer.canvas, renderer.overlay, document, window]);
    return {
      map: {
        cells: Number(app.map?.grid?.cells?.i?.length) || 0,
        revision: app.mapRevision.getSnapshot(),
        history: app.editHistory.getStats(),
        session: app.workerTaskCoordinator.getSessionSnapshot(),
        typed: estimateTypedBytes(app.map)
      },
      renderer: {
        suspended: Number(renderer.workerRenderInstallSuspended) || 0,
        deferred: Number(renderer.workerRenderInstallDeferredMutations?.size) || Number(renderer.workerRenderInstallDeferredMutationOrder?.length) || 0,
        timers: {
          route: Boolean(renderer.routeRefreshTimer),
          routeActive: Number(renderer.routeRefreshActiveVersion) || 0,
          viewport: Boolean(renderer.viewportCommitTimer),
          cityAnimation: Number(renderer.cityIconAnimationFrame) || 0
        },
        typed: estimateTypedBytes(renderer, rendererBlocked),
        gpu: collectGpuBuffers(renderer)
      },
      pause: {
        installed: Boolean(window.__task322SessionCommitPause),
        started: Boolean(window.__task322SessionCommitPause?.started)
      },
      loadingVisible: Number(Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden))
        + Number(Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden))
    };
  }));
  recordDiagnosticLifecycle("snapshot", snapshot);
  return snapshot;
}

async function captureDiagnosticPart(operation) {
  try {
    return {ok: true, data: await operation()};
  } catch (error) {
    return {ok: false, error: serializeDiagnosticError(error)};
  }
}

function recordDiagnosticLifecycle(event, detail = {}) {
  if (!runLifecycleDiagnostic) return;
  const entry = {time: new Date().toISOString(), elapsedMs: Date.now() - diagnosticStartedAt, event, ...detail};
  try {
    appendFileSync(diagnosticLifecyclePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error(`[task322-session-diagnostic] lifecycle write failed: ${error?.message || error}`);
  }
}

function serializeDiagnosticError(error) {
  if (!error) return null;
  return {
    name: error.name || typeof error,
    message: error.message || String(error),
    code: error.code || null,
    stack: error.stack || null
  };
}

function compactSessionGateResult(result, finalSignals, overBudgetLongTasks, errorCounts) {
  const workerRuns = [];
  const longTaskWindows = [];
  const seen = new WeakSet();
  const visit = (value, path) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const worker = value.worker;
    if (worker && typeof worker === "object" && worker.session) {
      workerRuns.push({
        path,
        mode: worker.mode || "",
        accepted: worker.accepted === true,
        sessionId: worker.session.id || "",
        sessionStatus: worker.session.status || "",
        reused: worker.session.reused === true,
        committed: worker.session.committed === true,
        inputPackets: value.telemetry?.inputPackets ?? worker.telemetry?.inputPackets ?? 0,
        outputPackets: value.telemetry?.outputPackets ?? worker.telemetry?.outputPackets ?? 0
      });
    }
    if (Array.isArray(value.longTasks)) {
      longTaskWindows.push({
        path,
        count: value.longTasks.length,
        maxMs: Math.max(0, ...value.longTasks.map(task => Number(task.duration) || 0)),
        overBudget: value.longTasks.filter(task => Number(task.duration) > 200)
      });
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`));
    else for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
  };
  visit(result, "result");
  return {
    scenarios: Object.keys(result || {}),
    workerRuns,
    sessionIds: [...new Set(workerRuns.map(run => run.sessionId).filter(Boolean))],
    acceptedRuns: workerRuns.filter(run => run.accepted).length,
    committedRuns: workerRuns.filter(run => run.committed).length,
    reusedRuns: workerRuns.filter(run => run.reused).length,
    longTaskWindows,
    hundredK: Array.isArray(result?.operations) ? {
      operations: result.operations.length,
      buffers: result.buffers?.length || 0,
      buffersIntact: result.buffers?.every?.(item => item.sameRef && item.length === item.beforeLength && item.byteLength === item.beforeByteLength) === true,
      heapDelta: result.heapDelta || null,
      cancellation: result.cancellation?.error?.code || result.cancellation?.code || "",
      recoverySession: result.afterCancel?.worker?.session || null
    } : null,
    finalLongTaskCount: finalSignals.longTasks.length,
    finalMaxLongTaskMs: Math.max(0, ...finalSignals.longTasks.map(task => Number(task.duration) || 0)),
    overBudgetLongTasks: [...overBudgetLongTasks, ...longTaskWindows.flatMap(window => window.overBudget)],
    nonPerformanceHealthErrors: finalSignals.nonPerformanceHealth.length,
    consoleErrors: errorCounts.consoleErrors,
    pageErrors: errorCounts.pageErrors,
    glError: finalSignals.glError,
    loadingVisible: finalSignals.loadingVisible
  };
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
    response.writeHead(200, {"Content-Type": mimeType(target), "Cache-Control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    serverInstance.once("error", rejectListen);
    serverInstance.listen(port, host, resolveListen);
  });
  return serverInstance;
}

function mimeType(filePath) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}
