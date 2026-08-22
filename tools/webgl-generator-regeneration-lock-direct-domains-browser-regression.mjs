#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const appSourceDir = join(rootDir, "app", "webgl-generator", "src");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5529;
const timeoutMs = 240000;
const evidence = createTask350BrowserArtifact("regeneration-lock-direct-domains-browser");
let server;
let browser;
let context;
let thrown = null;

try {
  assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  server = await startStaticServer();
  evidence.mark("browser-launch", {complete: "server-ready"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  evidence.mark("browser-evaluation", {active: "direct-domain-locks", complete: "page-ready"});

  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const result = {diplomacy: {}, military: {}, economy: {}, conflict: {}};

    unwrap(await api.generate.newMap({
      confirm: true,
      seed: "lock-direct-domains-formal",
      cellsTarget: 5000,
      heightmapTemplate: "continents"
    }), "new map");
    const {computeCanonicalMapReplicaChecksum} = await import("/__task350-source/runtime/map-replica-checksum.js");
    let snapshotAuditRevision = 0;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const longTasks = [];
    const observer = typeof PerformanceObserver === "function"
      ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))))
      : null;
    observer?.observe({entryTypes: ["longtask"]});

    const states = activeStates();
    if (states.length < 3) throw new Error("固定图不足三个有效国家");
    const lockedPair = pairKey(states[0].i, states.at(-1).i);
    unwrap(api.regenerationLocks.set({kind: "diplomacy-relation", id: lockedPair}, true), "lock diplomacy pair");
    app.editHistory.clear();
    const diplomacyBefore = diplomacyEnvelope(lockedPair);
    const unlockedDiplomacyBefore = diplomacyMatrix(new Set([lockedPair]));
    const diplomacyTxBefore = transactionSnapshot("diplomacy");
    const diplomacyResult = unwrap(await api.generate.regenerate("diplomacy", {confirm: true}), "regenerate diplomacy");
    if (!diplomacyResult.executed) throw new Error("外交正式入口未执行");
    assertDeepEqual(diplomacyEnvelope(lockedPair), diplomacyBefore, "锁定外交国家对");
    if (JSON.stringify(diplomacyMatrix(new Set([lockedPair]))) === JSON.stringify(unlockedDiplomacyBefore)) {
      throw new Error("外交重生成没有改变未锁国家对");
    }
    assertSingleTransaction(diplomacyTxBefore, transactionSnapshot("diplomacy"), "外交重生成");

    app.editHistory.clear();
    const stateConflictBefore = await noWriteTransactionSnapshot("states");
    const stateConflict = await api.generate.regenerate("states", {confirm: true});
    if (stateConflict?.ok !== false || stateConflict?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`锁外交下国家重生成没有写前拒绝：${JSON.stringify(stateConflict)}`);
    }
    assertSameTransaction(stateConflictBefore, await noWriteTransactionSnapshot("states"), "锁外交国家重生成冲突");

    unwrap(api.regenerationLocks.setMany(allDiplomacyPairs().map(id => ({kind: "diplomacy-relation", id})), true), "lock all diplomacy");
    app.editHistory.clear();
    const diplomacyNoopBefore = await noWriteTransactionSnapshot("diplomacy");
    const diplomacyNoop = unwrap(await api.generate.regenerate("diplomacy", {confirm: true}), "all diplomacy noop");
    if (diplomacyNoop.executed !== false) throw new Error("外交全锁没有返回 no-op");
    assertSameTransaction(diplomacyNoopBefore, await noWriteTransactionSnapshot("diplomacy"), "外交全锁 no-op");
    result.diplomacy = {lockedPair, allPairs: allDiplomacyPairs().length};
    unwrap(api.regenerationLocks.clearKind("diplomacy-relation"), "clear diplomacy locks");

    const firstRegiment = activeRegiments()[0];
    if (!firstRegiment) throw new Error("固定图缺少军团");
    unwrap(api.regenerationLocks.set({kind: "military", id: firstRegiment.id}, true), "lock regiment");
    app.editHistory.clear();
    const militaryBefore = militaryEnvelope(firstRegiment.id);
    const unlockedMilitaryBefore = JSON.stringify(activeRegiments().filter(item => item.id !== firstRegiment.id));
    const militaryTxBefore = transactionSnapshot("military");
    const militaryResult = unwrap(await api.generate.regenerate("military", {confirm: true}), "regenerate military");
    if (!militaryResult.executed) throw new Error("军事正式入口未执行");
    assertDeepEqual(militaryEnvelope(firstRegiment.id), militaryBefore, "锁定军团");
    if (JSON.stringify(activeRegiments().filter(item => item.id !== firstRegiment.id)) === unlockedMilitaryBefore) {
      throw new Error("军事重生成没有改变未锁军团");
    }
    assertSingleTransaction(militaryTxBefore, transactionSnapshot("military"), "军事重生成");

    const regimentState = activeStates().find(state => Number(state.i) === Number(firstRegiment.stateId));
    const ratios = structuredClone(regimentState.militaryPolicy?.unitRatios || {});
    const ratioKey = Object.keys(ratios)[0] || "infantry";
    ratios[ratioKey] = Number(ratios[ratioKey] || 0) + 0.25;
    app.editHistory.clear();
    const ratioLockedBefore = militaryEnvelope(firstRegiment.id);
    const ratioTxBefore = transactionSnapshot("military");
    const ratioResult = unwrap(await api.edit.military.setRatios(firstRegiment.stateId, ratios), "set military ratios");
    if (!ratioResult.executed) throw new Error("兵种比例命令未执行");
    assertDeepEqual(militaryEnvelope(firstRegiment.id), ratioLockedBefore, "兵种比例联动锁军团");
    assertSingleTransaction(ratioTxBefore, transactionSnapshot("military"), "兵种比例命令", {salt: false});

    unwrap(api.regenerationLocks.setMany(activeRegiments().map(item => ({kind: "military", id: item.id})), true), "lock all military");
    app.editHistory.clear();
    const militaryNoopBefore = await noWriteTransactionSnapshot("military");
    const militaryNoop = unwrap(await api.generate.regenerate("military", {confirm: true}), "all military noop");
    if (militaryNoop.executed !== false) throw new Error("军团全锁没有返回 no-op");
    assertSameTransaction(militaryNoopBefore, await noWriteTransactionSnapshot("military"), "军团全锁 no-op");
    result.military = {lockedRegiment: firstRegiment.id, allRegiments: activeRegiments().length};
    unwrap(api.regenerationLocks.clearKind("military"), "clear military locks");

    const lockedMarket = activeMarkets()[0];
    const economyDeals = activeDeals();
    const lockedDeal = economyDeals[0];
    const otherMarkets = activeMarkets().filter(market => market.i !== lockedMarket.i);
    if (!lockedMarket || !lockedDeal || otherMarkets.length < 2 || economyDeals.length < 2) throw new Error("固定图缺少经济锁样本");
    unwrap(api.regenerationLocks.setMany([
      {kind: "economy-market", id: lockedMarket.i},
      {kind: "trade-flow", id: lockedDeal.i}
    ], true), "lock economy");
    app.editHistory.clear();
    const marketBefore = marketEnvelope(lockedMarket.i);
    const dealBefore = tradeEnvelope(lockedDeal.i);
    const reassignedCell = app.map.pack.cells.i.find(cell => Number(app.map.pack.cells.market[cell]) === Number(otherMarkets[0].i));
    if (!Number.isInteger(reassignedCell)) throw new Error("固定图缺少未锁市场归属样本");
    const assignmentTxBefore = transactionSnapshot("economy");
    const assignment = unwrap(await api.edit.economy.assignCells(otherMarkets[1].i, [reassignedCell], {confirm: true}), "assign unlocked market cell");
    if (!assignment.executed) throw new Error("未锁市场归属没有执行");
    assertDeepEqual(marketEnvelope(lockedMarket.i), marketBefore, "市场归属锁市场");
    assertDeepEqual(tradeEnvelope(lockedDeal.i), dealBefore, "市场归属锁交易");
    if (Number(app.map.pack.cells.market[reassignedCell]) !== Number(otherMarkets[1].i)) throw new Error("未锁市场归属没有变化");
    assertSingleTransaction(assignmentTxBefore, transactionSnapshot("economy"), "市场归属命令", {salt: false});

    const rebuildTxBefore = await noWriteTransactionSnapshot("economy");
    const rebuild = unwrap(await api.edit.economy.rebuild({confirm: true}), "rebuild economy");
    if (rebuild.executed !== false) throw new Error("紧邻市场归属的确定性经济重算没有返回空 patch no-op");
    if (rebuild.operation?.name !== "edit.economy.rebuild" || rebuild.operation?.status !== "success" || rebuild.changedPaths?.length !== 0) {
      throw new Error(`经济重算空 patch receipt 漂移：${JSON.stringify(rebuild)}`);
    }
    if (rebuild.worker?.session?.committed !== true || rebuild.worker?.session?.pending !== false) throw new Error("经济重算空 patch Worker session 未提交");
    assertDeepEqual(marketEnvelope(lockedMarket.i), marketBefore, "经济重算锁市场");
    assertDeepEqual(tradeEnvelope(lockedDeal.i), dealBefore, "经济重算锁交易");
    assertSameTransaction(rebuildTxBefore, await noWriteTransactionSnapshot("economy"), "经济重算空 patch no-op");

    unwrap(api.regenerationLocks.setMany([
      ...activeMarkets().map(market => ({kind: "economy-market", id: market.i})),
      ...activeDeals().map(deal => ({kind: "trade-flow", id: deal.i}))
    ], true), "lock all economy");
    app.editHistory.clear();
    const economyNoopBefore = await noWriteTransactionSnapshot("economy");
    const economyNoop = unwrap(await api.edit.economy.rebuild({confirm: true}), "all economy noop");
    if (economyNoop.executed !== false) throw new Error("经济双域全锁没有返回 no-op");
    assertSameTransaction(economyNoopBefore, await noWriteTransactionSnapshot("economy"), "经济双域全锁 no-op");

    unwrap(api.regenerationLocks.clearKind("trade-flow"), "clear trade locks");
    unwrap(api.regenerationLocks.clearKind("economy-market"), "clear market locks");
    unwrap(api.regenerationLocks.set({kind: "economy-market", id: lockedMarket.i}, true), "lock conflict market");
    app.editHistory.clear();
    const lockedCell = marketEnvelope(lockedMarket.i).ownedCells[0];
    const conflictBefore = await noWriteTransactionSnapshot("economy");
    const conflict = await api.edit.economy.assignCells(otherMarkets[0].i, [lockedCell], {confirm: true});
    if (conflict?.ok !== false || conflict?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`市场归属冲突没有稳定拒绝：${JSON.stringify(conflict)}`);
    }
    assertSameTransaction(conflictBefore, await noWriteTransactionSnapshot("economy"), "市场归属冲突回滚");
    result.economy = {
      lockedMarket: lockedMarket.i,
      lockedDeal: lockedDeal.i,
      allMarkets: activeMarkets().length,
      allDeals: activeDeals().length,
      deterministicRebuildNoop: rebuild.executed === false,
      rebuildChangedPaths: rebuild.changedPaths.length,
      rebuildOperation: rebuild.operation.name,
      rebuildSessionCommitted: rebuild.worker.session.committed
    };
    result.conflict = {state: stateConflict.error.code, economy: conflict.error.code};
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    longTasks.push(...(observer?.takeRecords?.() || []).map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    observer?.disconnect();
    result.longTasks = longTasks;
    result.final = {
      session: app.workerTaskCoordinator.getSessionSnapshot(),
      glError: app.renderer?.getStats?.().draw?.glError ?? 0,
      loadingVisible: Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden)
        || Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden)
    };
    return result;

    function activeStates() {
      return (app.map.pack?.states || []).filter(state => state?.i && !state.removed);
    }
    function activeRegiments() {
      return activeStates().flatMap(state => (state.military || []).map(regiment => ({
        ...structuredClone(regiment),
        id: `${state.i}:${regiment.i}`,
        stateId: Number(state.i)
      })));
    }
    function activeMarkets() {
      return (app.map.pack?.markets || []).filter(Boolean);
    }
    function activeDeals() {
      return (app.map.pack?.deals || []).filter(Boolean);
    }
    function allDiplomacyPairs() {
      const values = [];
      for (let left = 0; left < activeStates().length; left++) {
        for (let right = left + 1; right < activeStates().length; right++) {
          values.push(pairKey(activeStates()[left].i, activeStates()[right].i));
        }
      }
      return values;
    }
    function diplomacyEnvelope(id) {
      const [left, right] = id.split(":").map(Number);
      const leftState = app.map.pack.states[left];
      const rightState = app.map.pack.states[right];
      const campaigns = (leftState.campaigns || []).filter(item => pairKey(item.attacker, item.defender) === id);
      const chronicle = (app.map.pack.states[0]?.diplomacy || []).filter(entry => {
        const text = Array.isArray(entry) ? entry.join(" ") : String(entry || "");
        return text.includes(String(leftState.name || leftState.fullName)) && text.includes(String(rightState.name || rightState.fullName));
      });
      return {
        left: leftState.diplomacy[right],
        right: rightState.diplomacy[left],
        campaigns: structuredClone(campaigns),
        chronicle: structuredClone(chronicle),
        leftPolitics: app.map.politics.states[left]?.diplomacy?.[right],
        rightPolitics: app.map.politics.states[right]?.diplomacy?.[left],
        militaryCampaigns: structuredClone((app.map.military?.campaigns || []).filter(item => pairKey(item.attacker, item.defender) === id)),
        fronts: structuredClone((app.map.military?.fronts || []).filter(item => pairKey(item.attacker, item.defender) === id)),
        warzones: structuredClone((app.map.pack.zones || []).filter(item => pairKey(item.attacker, item.defender) === id))
      };
    }
    function diplomacyMatrix(excluded) {
      return Object.fromEntries(allDiplomacyPairs().filter(id => !excluded.has(id)).map(id => {
        const [left, right] = id.split(":").map(Number);
        return [id, [app.map.pack.states[left].diplomacy[right], app.map.pack.states[right].diplomacy[left]]];
      }));
    }
    function militaryEnvelope(id) {
      const [stateId, regimentId] = id.split(":").map(Number);
      const state = app.map.pack.states[stateId];
      const politicsState = app.map.politics.states[stateId];
      return {
        regiment: structuredClone((state.military || []).find(item => Number(item.i) === regimentId)),
        politicsRegiment: structuredClone((politicsState.military || []).find(item => Number(item.i) === regimentId)),
        events: structuredClone((app.map.military?.events || []).filter(event =>
          event.regimentObjectId === id || Number(event.stateId) === stateId && Number(event.regimentId) === regimentId
        ))
      };
    }
    function marketEnvelope(id) {
      const market = activeMarkets().find(item => Number(item.i) === Number(id));
      const burg = app.map.pack.burgs[market.centerBurgId];
      return {
        market: structuredClone(market),
        economyMarket: structuredClone((app.map.economy.markets || []).find(item => Number(item?.i) === Number(id))),
        ownedCells: memberCells(app.map.pack.cells.market, id),
        burg: pick(burg, ["i", "id", "cell", "state", "province", "market", "cityId", "removed"]),
        city: pick((app.map.settlements.cities || []).find(city => Number(city.burgId) === Number(burg.i)), ["id", "burgId", "packCell", "cell", "state", "province", "removed"])
      };
    }
    function tradeEnvelope(id) {
      const deal = activeDeals().find(item => Number(item.i) === Number(id));
      return {
        deal: structuredClone(deal),
        economyDeal: structuredClone((app.map.economy.deals || []).find(item => Number(item?.i) === Number(id))),
        good: pick((app.map.pack.goods || []).find(item => Number(item?.i) === Number(deal.good)), ["i", "id", "name", "type", "category", "removed"]),
        seller: partyEnvelope(deal.sellerType, deal.seller),
        buyer: partyEnvelope(deal.buyerType, deal.buyer),
        path: structuredClone(deal.path || null),
        pathAssignments: Array.isArray(deal.path)
          ? Object.fromEntries(["market", "state", "burg"].map(field => [field, deal.path.map(cell => app.map.pack.cells[field]?.[cell])]))
          : null
      };
    }
    function partyEnvelope(type, id) {
      if (type === "market") {
        const market = activeMarkets().find(item => Number(item.i) === Number(id));
        return {type, id: Number(id), centerBurgId: Number(market?.centerBurgId), cell: Number(market?.cell), state: Number(market?.state)};
      }
      const burg = app.map.pack.burgs[Number(id)];
      return {type, id: Number(id), cell: Number(burg?.cell), state: Number(burg?.state), market: Number(burg?.market)};
    }
    function memberCells(values, id) {
      const cells = [];
      for (let cell = 0; cell < (values?.length || 0); cell++) if (Number(values[cell]) === Number(id)) cells.push(cell);
      return cells;
    }
    function pick(value, fields) {
      return value ? Object.fromEntries(fields.map(field => [field, structuredClone(value[field])])) : null;
    }
    function pairKey(left, right) {
      const first = Number(left);
      const second = Number(right);
      return first < second ? `${first}:${second}` : `${second}:${first}`;
    }
    function transactionSnapshot(kind) {
      return {
        history: app.editHistory.getStats(),
        salt: Number(app.map.metadata?.regeneration?.[kind]) || 0,
        revision: app.mapRevision.getSnapshot()
      };
    }
    async function noWriteTransactionSnapshot(kind) {
      const transaction = transactionSnapshot(kind);
      return {
        ...transaction,
        map: await computeCanonicalMapReplicaChecksum(app.map, {
          revision: ++snapshotAuditRevision,
          budgetMs: 4
        })
      };
    }
    function assertSingleTransaction(before, after, label, {salt = true} = {}) {
      const saltValid = !salt || after.salt === before.salt + 1;
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0 || !saltValid || after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} 未保持单历史/单 revision${salt ? "/单 salt" : ""}`);
      }
    }
    function assertSameTransaction(before, after, label) {
      if (after.map !== before.map || JSON.stringify(after.history) !== JSON.stringify(before.history) || after.salt !== before.salt || JSON.stringify(after.revision) !== JSON.stringify(before.revision)) {
        throw new Error(`${label} 没有完整保持地图、历史、salt 和 revision`);
      }
    }
    function assertDeepEqual(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}发生变化`);
    }
    function unwrap(publicResult, label) {
      if (!publicResult?.ok) throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""} ${JSON.stringify(publicResult?.error?.details || {})}`);
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|render-frame-gap|operation-stall|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  const overBudgetLongTasks = report.longTasks.filter(task => task.duration > 200);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(overBudgetLongTasks, [], "直接领域锁门出现 >200ms LongTask");
  assert.ok(
    report.final.session === null || (report.final.session?.status === "idle" && report.final.session?.pending !== true),
    "直接领域锁门结束后 Worker session 未释放或 idle"
  );
  assert.equal(report.final.glError, 0, "直接领域锁门出现 WebGL error");
  assert.equal(report.final.loadingVisible, false, "直接领域锁门结束后 Loading 未清理");
  const fullResult = {ok: true, ...report, healthPerformanceSignals, applicationConsoleErrors, pageErrors};
  const compactResult = {
    diplomacy: report.diplomacy,
    military: report.military,
    economy: report.economy,
    conflict: report.conflict,
    sessionId: report.final.session?.id || "",
    sessionStatus: report.final.session?.status || "",
    longTaskCount: report.longTasks.length,
    maxLongTaskMs: Math.max(0, ...report.longTasks.map(task => task.duration)),
    overBudgetLongTasks,
    performanceSignals: healthPerformanceSignals.length,
    applicationErrors: applicationConsoleErrors.length,
    pageErrors: pageErrors.length,
    glError: report.final.glError,
    loadingVisible: report.final.loadingVisible
  };
  evidence.setResult(fullResult, compactResult);
  evidence.mark("assertions", {complete: "browser-evaluation"});
  evidence.succeed();
} catch (error) {
  thrown = error;
  evidence.fail(error);
} finally {
  for (const [label, close] of [
    ["context", context && (() => context.close())],
    ["browser", browser && (() => browser.close())],
    ["server", server && (() => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())))]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      thrown ||= error;
      evidence.failTeardown(error);
    }
  }
  const persisted = evidence.persist();
  console.log(JSON.stringify(persisted.summary, null, 2));
}
if (thrown) throw thrown;

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    const sourceRequest = pathname.startsWith("/__task350-source/");
    const root = sourceRequest ? appSourceDir : distDir;
    const relativePath = sourceRequest ? pathname.slice("/__task350-source".length) : pathname;
    let target = resolve(root, "." + normalize(relativePath));
    if (!sourceRequest && (pathname === "/" || !existsSync(target) || statSync(target).isDirectory())) target = join(distDir, "index.html");
    if (!target.startsWith(root) || !existsSync(target)) {
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
