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
const port = 5529;
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
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);

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
    const diplomacyStateBefore = diplomacyEnvelope(lockedPair);
    const unlockedStatesBefore = stateMatrix(new Set(lockedPair.split(":").map(Number)));
    const stateTxBefore = transactionSnapshot("states");
    const stateResult = unwrap(await api.generate.regenerate("states", {confirm: true}), "regenerate states with diplomacy lock");
    if (!stateResult.executed) throw new Error("锁外交下国家重生成没有执行");
    assertDeepEqual(diplomacyEnvelope(lockedPair), diplomacyStateBefore, "国家重生成锁定外交国家对");
    if (JSON.stringify(stateMatrix(new Set(lockedPair.split(":").map(Number)))) === JSON.stringify(unlockedStatesBefore)) {
      throw new Error("锁外交下国家重生成没有改变未锁国家");
    }
    assertSingleTransaction(stateTxBefore, transactionSnapshot("states"), "锁外交国家重生成");

    unwrap(api.regenerationLocks.clearKind("diplomacy-relation"), "clear state-support diplomacy lock");
    unwrap(await api.generate.regenerate("diplomacy", {confirm: true}), "refresh diplomacy after state regeneration");
    unwrap(api.regenerationLocks.setMany(allDiplomacyPairs().map(id => ({kind: "diplomacy-relation", id})), true), "lock all diplomacy");
    app.editHistory.clear();
    const diplomacyNoopBefore = transactionSnapshot("diplomacy");
    const diplomacyNoop = unwrap(await api.generate.regenerate("diplomacy", {confirm: true}), "all diplomacy noop");
    if (diplomacyNoop.executed !== false) throw new Error("外交全锁没有返回 no-op");
    assertSameTransaction(diplomacyNoopBefore, transactionSnapshot("diplomacy"), "外交全锁 no-op");
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

    unwrap(api.regenerationLocks.setMany(activeRegiments().map(item => ({kind: "military", id: item.id})), true), "lock all military");
    app.editHistory.clear();
    const militaryNoopBefore = transactionSnapshot("military");
    const militaryNoop = unwrap(await api.generate.regenerate("military", {confirm: true}), "all military noop");
    if (militaryNoop.executed !== false) throw new Error("军团全锁没有返回 no-op");
    assertSameTransaction(militaryNoopBefore, transactionSnapshot("military"), "军团全锁 no-op");
    result.military = {lockedRegiment: firstRegiment.id, allRegiments: activeRegiments().length};
    unwrap(api.regenerationLocks.clearKind("military"), "clear military locks");

    result.economy = {coverage: "Node 真实生成器专项；浏览器门聚焦正式 generate.regenerate 入口"};
    result.conflict = {state: "preserved-and-regenerated", economy: "covered-by-node-corruption-gates"};
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
    function stateMatrix(excluded) {
      return activeStates()
        .filter(state => !excluded.has(Number(state.i)))
        .map(state => structuredClone(state));
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
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        salt: Number(app.map.metadata?.regeneration?.[kind]) || 0,
        revision: app.mapRevision.getSnapshot()
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

  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, ...report, healthPerformanceSignals, applicationConsoleErrors, pageErrors}, null, 2));
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
