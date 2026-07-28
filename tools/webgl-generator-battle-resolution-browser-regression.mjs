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
const port = 5553;
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
    unwrap(await api.generate.newMap({
      confirm: true,
      seed: "battle-resolution-browser",
      cellsTarget: 5000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    await nextTwoFrames();
    clearHealth();

    const setup = findPublicBattleSetup();
    assertInspection(setup.declaration, "declare-war");
    unwrap(await api.edit.diplomacy.declareWar(
      setup.declaration.normalizedInput,
      executionOptions(setup.declaration, true)
    ), "declareWar");
    await moveToBorder(setup.attacker, setup.attackerCell);
    await moveToBorder(setup.defender, setup.defenderCell);

    const request = {
      attacker: setup.attacker,
      defender: setup.defender,
      outcome: "victory",
      type: "skirmish",
      description: "系统 Chrome 单次战斗规则验收"
    };
    const inspectBefore = transactionSnapshot();
    const inspection = unwrap(api.edit.military.inspectBattle(request), "inspectBattle");
    assertTransactionSame(inspectBefore, transactionSnapshot(), "inspectBattle");
    assertInspection(inspection, "resolve-battle");
    if (Number(regimentFor(setup.attacker)?.cell) !== setup.attackerCell
      || Number(regimentFor(setup.defender)?.cell) !== setup.defenderCell) {
      throw new Error(`公开移动后的接触位置发生漂移：${JSON.stringify(setup)}`);
    }

    const before = transactionSnapshot();
    const beforeAuthority = authoritySnapshot();
    const beforeBattle = battleSnapshot(setup);
    const denied = await api.edit.military.resolveBattle(
      inspection.normalizedInput,
      executionOptions(inspection, false)
    );
    if (denied?.ok !== false || denied?.error?.code !== "confirmation_required") {
      throw new Error(`resolveBattle 未稳定触发确认门禁：${JSON.stringify(denied)}`);
    }
    assertTransactionSame(before, transactionSnapshot(), "resolveBattle.confirmation-required");

    const executed = unwrap(await api.edit.military.resolveBattle(
      inspection.normalizedInput,
      executionOptions(inspection, true)
    ), "resolveBattle");
    if (executed.executed !== true || !executed.result?.eventId) {
      throw new Error(`resolveBattle 没有返回已执行战报：${JSON.stringify(executed)}`);
    }

    const after = transactionSnapshot();
    const afterAuthority = authoritySnapshot();
    const afterBattle = battleSnapshot(setup);
    if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0) {
      throw new Error(`resolveBattle 未形成单条历史：${JSON.stringify({before: before.history, after: after.history})}`);
    }
    if (after.revision.mapRevision !== before.revision.mapRevision + 1) {
      throw new Error(`resolveBattle revision 未单步递增：${JSON.stringify({before: before.revision, after: after.revision})}`);
    }
    assertAuthoritySame(beforeAuthority, afterAuthority);
    assertBattleResult(beforeBattle, afterBattle, executed.result.eventId);

    unwrap(api.history.undo(), "history.undo");
    const undone = transactionSnapshot();
    if (undone.map !== before.map) {
      throw new Error(`undo 未恢复完整地图：${JSON.stringify(firstJsonDifference(
        JSON.parse(before.map),
        JSON.parse(undone.map)
      ))}`);
    }
    if (undone.history.undo !== before.history.undo || undone.history.redo !== 1) {
      throw new Error(`undo 历史状态异常：${JSON.stringify(undone.history)}`);
    }

    unwrap(api.history.redo(), "history.redo");
    const redone = transactionSnapshot();
    if (redone.map !== after.map) {
      throw new Error(`redo 未恢复战斗结算结果：${JSON.stringify(firstJsonDifference(
        JSON.parse(after.map),
        JSON.parse(redone.map)
      ))}`);
    }
    if (redone.history.undo !== after.history.undo || redone.history.redo !== 0) {
      throw new Error(`redo 历史状态异常：${JSON.stringify(redone.history)}`);
    }
    unwrap(api.history.undo(), "history.undo after redo");
    if (transactionSnapshot().map !== before.map) throw new Error("redo 后再次 undo 未恢复完整地图");

    await nextTwoFrames();
    const health = unwrap(api.info.healthEvents({severity: "error", limit: 200}), "info.healthEvents");
    const renderer = app.renderer?.getStats?.() || {};
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      setup: {
        attacker: setup.attacker,
        defender: setup.defender,
        attackerCell: setup.attackerCell,
        defenderCell: setup.defenderCell,
        terrain: "land",
        declarationToken: setup.declaration.inspectionToken.slice(0, 24)
      },
      inspectionToken: inspection.inspectionToken.slice(0, 24),
      expectedRevision: inspection.expectedRevision,
      confirmationRequiredCode: denied.error.code,
      historyDelta: after.history.undo - before.history.undo,
      revisionDelta: after.revision.mapRevision - before.revision.mapRevision,
      result: {
        eventId: executed.result.eventId,
        outcome: executed.result.outcome,
        attackerTroops: [beforeBattle.attacker.troops, afterBattle.attacker.troops],
        defenderTroops: [beforeBattle.defender.troops, afterBattle.defender.troops],
        attackerStatus: afterBattle.attacker.status,
        defenderStatus: afterBattle.defender.status,
        eventLocations: afterBattle.eventLocations,
        summaryChanged: beforeBattle.summary !== afterBattle.summary
      },
      authorityUnchanged: true,
      undoRestored: true,
      redoRestored: true,
      health,
      healthErrors: health.total,
      glError: renderer.draw?.glError ?? gl?.getError?.() ?? 0
    };

    function findPublicBattleSetup() {
      const map = app.map;
      const cells = map.pack?.cells;
      const candidates = [];
      const rejections = {};
      for (const cell of cells?.i || []) {
        if (Number(cells.h?.[cell]) < 20) continue;
        const attackerStateId = Number(cells.state?.[cell]) || 0;
        if (!(attackerStateId > 0)) continue;
        for (const neighbor of cells.c?.[cell] || []) {
          if (neighbor <= cell || Number(cells.h?.[neighbor]) < 20) continue;
          const defenderStateId = Number(cells.state?.[neighbor]) || 0;
          if (!(defenderStateId > 0) || defenderStateId === attackerStateId) continue;
          candidates.push({
            attackerStateId,
            defenderStateId,
            attackerCell: cell,
            defenderCell: neighbor
          });
          candidates.push({
            attackerStateId: defenderStateId,
            defenderStateId: attackerStateId,
            attackerCell: neighbor,
            defenderCell: cell
          });
        }
      }

      for (const candidate of candidates) {
        const attacker = firstPositiveRegiment(candidate.attackerStateId, false);
        const defender = firstPositiveRegiment(candidate.defenderStateId, false);
        if (!attacker || !defender) continue;
        const declaration = unwrap(api.edit.diplomacy.inspectDeclareWar({
          attackerStateId: candidate.attackerStateId,
          defenderStateId: candidate.defenderStateId,
          reason: "系统 Chrome 单次战斗验收"
        }), "inspectDeclareWar candidate");
        if (!declaration.allowed) {
          rejections[declaration.code] = (rejections[declaration.code] || 0) + 1;
          continue;
        }
        return {...candidate, attacker, defender, declaration};
      }
      throw new Error(`BLOCK：正式生成图无法通过公开 API 形成合法接触样本；边境候选 ${candidates.length}，宣战拒绝 ${JSON.stringify(rejections)}`);
    }

    function firstPositiveRegiment(stateId, naval) {
      const state = app.map.pack?.states?.[stateId];
      const regiment = (state?.military || []).find(item => item
        && Number(item.a || Object.values(item.u || {}).reduce((sum, value) => sum + Number(value || 0), 0)) > 0
        && Boolean(item.n || item.type === "fleet") === naval);
      if (!regiment) return null;
      const regimentId = Number(regiment.i);
      return {id: regiment.id || `${stateId}:${regimentId}`, stateId, regimentId};
    }

    async function moveToBorder(target, cell) {
      const inspection = unwrap(api.edit.military.inspectMoveStation(target, {packCell: cell}), "inspectMoveStation");
      if (!inspection.allowed) {
        const regiment = regimentFor(target);
        if (inspection.code === "station-unchanged" && Number(regiment?.cell) === cell) return;
        throw new Error(`公开 moveStation 无法构造接触位置：${target.id} -> ${cell}，${inspection.code} ${inspection.summary}`);
      }
      if (!String(inspection.inspectionToken || "").startsWith("rulei1.")) {
        throw new Error(`moveStation 缺少 rulei1 token：${target.id}`);
      }
      const moved = unwrap(await api.edit.military.moveStation(
        target,
        {packCell: cell},
        executionOptions(inspection, false)
      ), "moveStation");
      if (!moved.executed || Number(regimentFor(target)?.cell) !== cell) {
        throw new Error(`公开 moveStation 未把 ${target.id} 移至 ${cell}`);
      }
    }

    function assertBattleResult(beforeResult, afterResult, eventId) {
      for (const side of ["attacker", "defender"]) {
        const beforeSide = beforeResult[side];
        const afterSide = afterResult[side];
        if (!(afterSide.troops >= 0) || afterSide.troops > beforeSide.troops) {
          throw new Error(`${side} 兵力越界：${beforeSide.troops} -> ${afterSide.troops}`);
        }
        if (afterSide.units.some(value => value < 0)) throw new Error(`${side} 出现负兵种兵力`);
      }
      if (afterResult.attacker.status !== "resting" || afterResult.defender.status !== "routed") {
        throw new Error(`战斗态势不符合 victory 规则：${afterResult.attacker.status}/${afterResult.defender.status}`);
      }
      if (afterResult.eventLocations.global !== 1
        || afterResult.eventLocations.attacker !== 1
        || afterResult.eventLocations.defender !== 1) {
        throw new Error(`战报未落入三个位置：${JSON.stringify(afterResult.eventLocations)}`);
      }
      if (!afterResult.eventIds.every(id => id === eventId)) {
        throw new Error(`三处战报 ID 不一致：${JSON.stringify(afterResult.eventIds)}`);
      }
      if (beforeResult.summary === afterResult.summary) throw new Error("战斗结算后生成摘要没有刷新");
      if (afterResult.summaryMilitary !== afterResult.militaryMetadata) {
        throw new Error("summary.military 未与军事 metadata 同步");
      }
    }

    function battleSnapshot(setupTarget) {
      const attacker = regimentFor(setupTarget.attacker);
      const defender = regimentFor(setupTarget.defender);
      const globalEvents = app.map.military?.events || app.map.pack?.military?.events || [];
      const eventId = globalEvents.at(-1)?.id || null;
      return {
        attacker: regimentSnapshot(attacker),
        defender: regimentSnapshot(defender),
        summary: JSON.stringify(app.map.summary),
        summaryMilitary: JSON.stringify(app.map.summary?.military ?? null),
        militaryMetadata: JSON.stringify(app.map.military?.metadata ?? app.map.pack?.military?.metadata ?? null),
        eventLocations: {
          global: eventId ? globalEvents.filter(event => event?.id === eventId).length : 0,
          attacker: eventId ? (attacker?.events || []).filter(event => event?.id === eventId).length : 0,
          defender: eventId ? (defender?.events || []).filter(event => event?.id === eventId).length : 0
        },
        eventIds: eventId ? [
          globalEvents.find(event => event?.id === eventId)?.id,
          (attacker?.events || []).find(event => event?.id === eventId)?.id,
          (defender?.events || []).find(event => event?.id === eventId)?.id
        ] : []
      };
    }

    function regimentSnapshot(regiment) {
      return {
        troops: Number(regiment?.a) || 0,
        units: Object.values(regiment?.u || {}).map(value => Number(value) || 0),
        status: String(regiment?.status || ""),
        cell: Number(regiment?.cell)
      };
    }

    function regimentFor(target) {
      return (app.map.pack?.states?.[target.stateId]?.military || []).find(item =>
        Number(item?.i) === target.regimentId || String(item?.id || "") === target.id
      );
    }

    function authoritySnapshot() {
      const map = app.map;
      const packStates = map.pack?.states || [];
      const politicsStates = map.politics?.states || [];
      return {
        population: JSON.stringify({
          grid: Array.from(map.grid?.cells?.pop || []),
          pack: Array.from(map.pack?.cells?.pop || []),
          cities: (map.settlements?.cities || []).map(city => city ? [city.id, city.population] : null),
          packStates: packStates.map(state => state ? [state.i, state.population, state.urban, state.rural] : null),
          politicsStates: politicsStates.map(state => state ? [state.i, state.population, state.urban, state.rural] : null)
        }),
        territory: JSON.stringify({
          gridStates: Array.from(map.grid?.cells?.state || []),
          gridProvinces: Array.from(map.grid?.cells?.province || []),
          packStates: Array.from(map.pack?.cells?.state || []),
          packProvinces: Array.from(map.pack?.cells?.province || [])
        }),
        diplomacy: JSON.stringify({
          root: map.diplomacy,
          pack: packStates.map(state => state?.diplomacy || null),
          politics: politicsStates.map(state => state?.diplomacy || null)
        }),
        time: JSON.stringify({
          year: map.year,
          era: map.era,
          time: map.time,
          timeline: map.timeline,
          options: {
            year: map.options?.year,
            era: map.options?.era,
            eraShort: map.options?.eraShort
          },
          metadata: {
            generatedAt: map.metadata?.generatedAt,
            year: map.metadata?.year,
            era: map.metadata?.era
          }
        })
      };
    }

    function assertAuthoritySame(beforeAuthority, afterAuthority) {
      for (const key of ["population", "territory", "diplomacy", "time"]) {
        if (beforeAuthority[key] !== afterAuthority[key]) throw new Error(`战斗结算不应修改 ${key}`);
      }
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

    function transactionSnapshot() {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        revision: app.mapRevision.getSnapshot()
      };
    }

    function assertTransactionSame(beforeSnapshot, afterSnapshot, label) {
      if (beforeSnapshot.map !== afterSnapshot.map
        || JSON.stringify(beforeSnapshot.history) !== JSON.stringify(afterSnapshot.history)
        || JSON.stringify(beforeSnapshot.revision) !== JSON.stringify(afterSnapshot.revision)) {
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

    function nextTwoFrames() {
      return new Promise(resolveFrames => requestAnimationFrame(() => requestAnimationFrame(resolveFrames)));
    }

    function clearHealth() {
      app.healthMonitor?.clear?.();
      app.panels?.development?.clearHealthEvents?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
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
  assert.equal(report.healthErrors, 0, `战斗规则浏览器验收出现 health error：${JSON.stringify(report.health)}`);
  assert.equal(report.glError, 0, "战斗规则浏览器验收出现 WebGL error");
  assert.deepEqual(applicationConsoleErrors, [], `战斗规则浏览器验收出现应用 console error：${applicationConsoleErrors.join("；")}`);
  assert.deepEqual(pageErrors, [], `战斗规则浏览器验收出现 page error：${pageErrors.join("；")}`);
  console.log(JSON.stringify({
    ok: true,
    url,
    actions: [
      "edit.diplomacy.inspectDeclareWar -> declareWar",
      "edit.military.inspectMoveStation -> moveStation",
      "edit.military.inspectBattle -> resolveBattle",
      "history.undo -> redo -> undo"
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
