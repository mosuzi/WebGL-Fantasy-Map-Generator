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
const port = 5552;
const timeoutMs = 240000;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  const url = `http://${host}:${port}?healthClear=1`;
  await page.goto(url, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    await generateFreshMap("diplomacy-rules-browser");

    const declaration = await verifyTransaction({
      label: "declare-war",
      findInspection: findDeclareWarInspection,
      execute: (request, options) => api.edit.diplomacy.declareWar(request, options),
      assertResult: (inspection, beforeContext) => {
        const {attackerStateId, defenderStateId} = inspection.normalizedInput;
        assertRelation(attackerStateId, defenderStateId, "Enemy", "Enemy");
        const context = pairContext(attackerStateId, defenderStateId);
        if (context.stateCampaigns <= beforeContext.stateCampaigns) {
          throw new Error("declare-war 未建立国家 campaign");
        }
        if (context.militaryCampaigns <= beforeContext.militaryCampaigns) {
          throw new Error("declare-war 未建立军事 campaign");
        }
        return context;
      }
    });

    const setupInspection = inspectReadOnly(findDeclareWarInspection, "peace-setup-declare-war");
    const setupRequest = setupInspection.normalizedInput;
    unwrap(await api.edit.diplomacy.declareWar(setupRequest, executionOptions(setupInspection, true)), "peace setup declareWar");
    const warContext = pairContext(setupRequest.attackerStateId, setupRequest.defenderStateId);
    if (warContext.stateCampaigns < 2 || warContext.militaryCampaigns < 1) {
      throw new Error(`peace setup 缺少战争上下文：${JSON.stringify(warContext)}`);
    }

    const peaceTerms = {
      note: "系统 Chrome 记录型和平条款",
      reparations: {
        fromStateId: setupRequest.attackerStateId,
        toStateId: setupRequest.defenderStateId,
        amount: 12.5,
        unit: "金币",
        note: "仅记录，不结算经济库存"
      }
    };
    const peace = await verifyTransaction({
      label: "make-peace",
      findInspection: () => unwrap(api.edit.diplomacy.inspectPeace({
        leftStateId: setupRequest.attackerStateId,
        rightStateId: setupRequest.defenderStateId,
        relation: "Neutral",
        terms: peaceTerms
      }), "inspectPeace"),
      execute: (request, options) => api.edit.diplomacy.makePeace(request, options),
      assertResult: inspection => {
        const {leftStateId, rightStateId} = inspection.normalizedInput;
        assertRelation(leftStateId, rightStateId, "Neutral", "Neutral");
        const context = pairContext(leftStateId, rightStateId);
        if (context.stateCampaigns || context.militaryCampaigns || context.fronts || context.warzones) {
          throw new Error(`make-peace 未清理战争上下文：${JSON.stringify(context)}`);
        }
        const chronicle = app.map.diplomacy?.chronicle || [];
        const recordOnly = chronicle.some(entry =>
          String(entry?.[0]) === "和平条款"
          && String(entry?.[1]).includes('"economicSettlement":"record-only"')
        );
        if (!recordOnly) throw new Error("make-peace 未记录 record-only 和平条款");
        return {...context, recordOnly};
      }
    });
    unwrap(api.history.undo(), "undo peace setup declaration");

    await generateFreshMap("diplomacy-overlord-browser");
    const overlord = await verifyTransaction({
      label: "change-overlord",
      findInspection: findOverlordInspection,
      execute: (request, options) => api.edit.diplomacy.changeOverlord(request, options),
      assertResult: inspection => {
        const {vassalStateId, overlordStateId} = inspection.normalizedInput;
        assertRelation(overlordStateId, vassalStateId, "Vassal", "Suzerain");
        return {
          operation: inspection.operation,
          vassalStateId,
          overlordStateId,
          overlordRelation: relation(overlordStateId, vassalStateId),
          vassalRelation: relation(vassalStateId, overlordStateId)
        };
      }
    });

    const health = unwrap(api.info.healthEvents({severity: "error", limit: 200}), "info.healthEvents");
    const renderer = app.renderer?.getStats?.() || {};
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      declaration,
      peace: {...peace, setupWarContext: warContext},
      overlord,
      finalHistory: app.editHistory.getStats(),
      health,
      healthErrors: health.total,
      glError: renderer.draw?.glError ?? gl?.getError?.() ?? 0
    };

    async function generateFreshMap(seed) {
      unwrap(await api.generate.newMap({
        confirm: true,
        seed,
        cellsTarget: 5000,
        heightmapTemplate: "continents"
      }), `generate.newMap(${seed})`);
      app.editHistory.clear();
      await nextTwoFrames();
      app.healthMonitor?.clear?.();
      app.panels?.development?.clearHealthEvents?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
    }

    async function verifyTransaction({label, findInspection, execute, assertResult}) {
      const inspection = inspectReadOnly(findInspection, label);
      assertInspection(inspection, label);
      const before = transactionSnapshot();
      const beforeContext = pairContextForInspection(inspection);
      const denied = await execute(inspection.normalizedInput, executionOptions(inspection, false));
      if (denied?.ok !== false || denied?.error?.code !== "confirmation_required") {
        throw new Error(`${label} 未稳定触发确认门禁：${JSON.stringify(denied)}`);
      }
      assertTransactionSame(before, transactionSnapshot(), `${label}.confirmation-required`);

      const executed = unwrap(
        await execute(inspection.normalizedInput, executionOptions(inspection, true)),
        `${label}.execute`
      );
      if (executed.executed !== true) throw new Error(`${label} 没有执行：${JSON.stringify(executed)}`);
      const after = transactionSnapshot();
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0) {
        throw new Error(`${label} 未形成单条历史`);
      }
      if (after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} mapRevision 未单步递增`);
      }
      if (after.map === before.map) throw new Error(`${label} 没有形成地图变化`);
      const domainResult = assertResult(inspection, beforeContext);

      unwrap(api.history.undo(), `${label}.undo`);
      const undone = transactionSnapshot();
      if (undone.map !== before.map) {
        const difference = firstJsonDifference(
          JSON.parse(before.map),
          JSON.parse(undone.map)
        );
        if (difference) throw new Error(`${label} 撤销没有恢复完整地图：${JSON.stringify(difference)}`);
      }
      if (undone.history.undo !== before.history.undo || undone.history.redo !== 1) {
        throw new Error(`${label} 撤销历史状态异常`);
      }
      return {
        inspectionToken: inspection.inspectionToken.slice(0, 24),
        expectedRevision: inspection.expectedRevision,
        confirmationRequiredCode: denied.error.code,
        historyDelta: after.history.undo - before.history.undo,
        revisionDelta: after.revision.mapRevision - before.revision.mapRevision,
        affected: inspection.affected,
        domainResult,
        undone: true
      };
    }

    function inspectReadOnly(findInspection, label) {
      const before = transactionSnapshot();
      const inspection = findInspection();
      assertTransactionSame(before, transactionSnapshot(), `${label}.inspect`);
      return inspection;
    }

    function findDeclareWarInspection() {
      const states = activeStates();
      const candidates = [];
      for (let left = 0; left < states.length; left++) {
        for (let right = left + 1; right < states.length; right++) {
          const leftState = states[left];
          const rightState = states[right];
          const adjacent = (leftState.neighbors || []).includes(rightState.i)
            || (rightState.neighbors || []).includes(leftState.i);
          candidates.push({attackerStateId: leftState.i, defenderStateId: rightState.i, adjacent});
          candidates.push({attackerStateId: rightState.i, defenderStateId: leftState.i, adjacent});
        }
      }
      candidates.sort((a, b) => Number(b.adjacent) - Number(a.adjacent)
        || a.attackerStateId - b.attackerStateId
        || a.defenderStateId - b.defenderStateId);
      for (const candidate of candidates) {
        const inspection = unwrap(api.edit.diplomacy.inspectDeclareWar({
          attackerStateId: candidate.attackerStateId,
          defenderStateId: candidate.defenderStateId,
          reason: "系统 Chrome 公开链验证"
        }), "inspectDeclareWar candidate");
        if (inspection.allowed) return inspection;
      }
      throw new Error("正式生成图找不到合法宣战样本");
    }

    function findOverlordInspection() {
      const states = activeStates();
      for (const vassal of states) {
        if (directOverlordId(vassal.i)) continue;
        for (const overlord of states) {
          if (overlord.i === vassal.i) continue;
          const inspection = unwrap(api.edit.diplomacy.inspectOverlordChange({
            vassalStateId: vassal.i,
            overlordStateId: overlord.i,
            releaseRelation: "Neutral"
          }), "inspectOverlordChange candidate");
          if (inspection.allowed) return inspection;
        }
      }
      throw new Error("正式生成图找不到合法建立宗藩样本");
    }

    function assertInspection(inspection, label) {
      if (!inspection?.allowed || inspection.code !== "ok") {
        throw new Error(`${label} 预检未通过：${JSON.stringify(inspection)}`);
      }
      if (!String(inspection.inspectionToken || "").startsWith("rulei1.")) {
        throw new Error(`${label} 缺少 rulei1 token`);
      }
      if (!inspection.expectedRevision
        || inspection.expectedRevision.mapRevision !== app.mapRevision.getSnapshot().mapRevision) {
        throw new Error(`${label} expectedRevision 与当前地图不一致`);
      }
      if (inspection.requiresConfirm !== true) throw new Error(`${label} 未声明 requiresConfirm`);
    }

    function executionOptions(inspection, confirm) {
      return {
        ...(confirm ? {confirm: true} : {}),
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      };
    }

    function activeStates() {
      return (app.map.pack?.states || []).filter(state => state?.i && !state.removed);
    }

    function nextTwoFrames() {
      return new Promise(resolveFrames => requestAnimationFrame(() => requestAnimationFrame(resolveFrames)));
    }

    function directOverlordId(vassalStateId) {
      const states = app.map.pack?.states || [];
      const vassal = states[vassalStateId];
      return states.find(state => state?.i
        && !state.removed
        && vassal?.diplomacy?.[state.i] === "Suzerain"
        && state.diplomacy?.[vassalStateId] === "Vassal")?.i || 0;
    }

    function relation(subjectId, objectId) {
      return app.map.pack?.states?.[subjectId]?.diplomacy?.[objectId];
    }

    function assertRelation(subjectId, objectId, forward, inverse) {
      const packForward = app.map.pack?.states?.[subjectId]?.diplomacy?.[objectId];
      const packInverse = app.map.pack?.states?.[objectId]?.diplomacy?.[subjectId];
      const politicsForward = app.map.politics?.states?.[subjectId]?.diplomacy?.[objectId];
      const politicsInverse = app.map.politics?.states?.[objectId]?.diplomacy?.[subjectId];
      if (packForward !== forward || packInverse !== inverse
        || politicsForward !== forward || politicsInverse !== inverse) {
        throw new Error(`外交关系镜像不一致：${subjectId}->${objectId}=${packForward}/${politicsForward}，反向=${packInverse}/${politicsInverse}`);
      }
    }

    function pairContextForInspection(inspection) {
      const input = inspection.normalizedInput || {};
      const leftId = input.attackerStateId ?? input.leftStateId ?? input.overlordStateId;
      const rightId = input.defenderStateId ?? input.rightStateId ?? input.vassalStateId;
      return leftId && rightId ? pairContext(leftId, rightId) : {};
    }

    function pairContext(leftId, rightId) {
      const states = app.map.pack?.states || [];
      const stateCampaigns = [states[leftId], states[rightId]].reduce((sum, state) =>
        sum + (state?.campaigns || []).filter(item => samePair(item, leftId, rightId)).length, 0);
      return {
        relation: relation(leftId, rightId),
        inverseRelation: relation(rightId, leftId),
        stateCampaigns,
        militaryCampaigns: (app.map.military?.campaigns || []).filter(item => samePair(item, leftId, rightId)).length,
        fronts: (app.map.military?.fronts || []).filter(item => samePair(item, leftId, rightId)).length,
        warzones: (app.map.pack?.zones || []).filter(item => item?.type === "Warzone" && samePair(item, leftId, rightId)).length
      };
    }

    function samePair(item, leftId, rightId) {
      const attacker = Number(item?.attacker ?? item?.fromState);
      const defender = Number(item?.defender ?? item?.toState);
      return (attacker === leftId && defender === rightId)
        || (attacker === rightId && defender === leftId);
    }

    function transactionSnapshot() {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        revision: app.mapRevision.getSnapshot()
      };
    }

    function assertTransactionSame(before, after, label) {
      if (before.map !== after.map
        || JSON.stringify(before.history) !== JSON.stringify(after.history)
        || JSON.stringify(before.revision) !== JSON.stringify(after.revision)) {
        throw new Error(`${label} 改变了地图、历史或 revision`);
      }
    }

    function firstJsonDifference(left, right, path = "$") {
      if (Object.is(left, right)) return null;
      if (typeof left !== typeof right || left === null || right === null
        || typeof left !== "object") return {path, before: left, after: right};
      if (Array.isArray(left) !== Array.isArray(right)) {
        return {path, beforeType: Array.isArray(left) ? "array" : "object", afterType: Array.isArray(right) ? "array" : "object"};
      }
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
          return {path: `${path}.${key}`, before: left[key], after: right[key]};
        }
        const difference = firstJsonDifference(left[key], right[key], `${path}.${key}`);
        if (difference) return difference;
      }
      return null;
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) {
        throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""}`);
      }
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message =>
    /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message)
  );
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.equal(report.healthErrors, 0, `外交规则浏览器验收出现 health error：${JSON.stringify(report.health)}`);
  assert.equal(report.glError, 0, "外交规则浏览器验收出现 WebGL error");
  assert.deepEqual(applicationConsoleErrors, [], `外交规则浏览器验收出现应用 console error：${applicationConsoleErrors.join("；")}`);
  assert.deepEqual(pageErrors, [], `外交规则浏览器验收出现 page error：${pageErrors.join("；")}`);
  console.log(JSON.stringify({
    ok: true,
    url,
    actions: [
      "edit.diplomacy.inspectDeclareWar -> declareWar",
      "edit.diplomacy.inspectPeace -> makePeace(record-only terms)",
      "edit.diplomacy.inspectOverlordChange -> changeOverlord(vassalize)"
    ],
    ...report,
    healthPerformanceSignals,
    applicationConsoleErrors,
    pageErrors
  }, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
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
    response.writeHead(200, {"Content-Type": contentType(target), "Cache-Control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(pathname) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(pathname)] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
