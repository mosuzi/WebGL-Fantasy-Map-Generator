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
const port = 5542;
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
    const result = {height: {}, noop: {}, state: {}, conflict: {}};

    await newMap("lock-height-downstream", 3000);
    const downstreamLocks = representativeDownstreamReferences();
    if (downstreamLocks.length < 5) throw new Error(`高度下游代表锁样本不足：${downstreamLocks.length}`);
    unwrap(api.regenerationLocks.setMany(downstreamLocks, true), "lock height downstream representatives");
    app.editHistory.clear();
    const heightBefore = snapshotReferences(downstreamLocks);
    const heightTxBefore = transactionSnapshot();
    const height = unwrap(await api.edit.height.rebuildDownstreamDerived({confirm: true}), "height downstream");
    if (!height.executed) throw new Error("高度下游代表锁场景未执行");
    assertDeepEqual(snapshotReferences(downstreamLocks), heightBefore, "高度下游代表锁");
    assertSingleTransaction(heightTxBefore, transactionSnapshot(), "高度下游复合事务");
    result.height = {locks: downstreamLocks.length, steps: height.steps?.length || 0};

    await newMap("lock-height-base-noop", 1600);
    const baseLocks = allBaseReferences();
    if (!baseLocks.length) throw new Error("高度基础固定图没有可锁对象");
    unwrap(api.regenerationLocks.setMany(baseLocks, true), "lock all height base objects");
    app.editHistory.clear();
    const noopBefore = transactionSnapshot();
    const noop = unwrap(await api.edit.height.rebuildBaseDerived({confirm: true}), "height base full lock noop");
    if (noop.executed !== false) throw new Error(`高度基础全锁未返回 no-op：${JSON.stringify(noop)}`);
    assertSameTransaction(noopBefore, transactionSnapshot(), "高度基础全锁 no-op");
    result.noop = {locks: baseLocks.length, executed: noop.executed};

    await newMap("lock-state-bundle", 3000);
    const politicalLocks = representativePoliticalReferences();
    if (politicalLocks.length < 4) throw new Error(`国家代表锁样本不足：${politicalLocks.length}`);
    unwrap(api.regenerationLocks.setMany(politicalLocks, true), "lock political representatives");
    app.editHistory.clear();
    const stateBefore = snapshotReferences(politicalLocks);
    const stateTxBefore = transactionSnapshot();
    const state = unwrap(await api.generate.regenerate("states", {confirm: true}), "state regenerate");
    if (!state.executed) throw new Error("国家代表锁场景未执行");
    assertDeepEqual(snapshotReferences(politicalLocks), stateBefore, "国家正式入口代表锁");
    assertSingleTransaction(stateTxBefore, transactionSnapshot(), "国家正式事务", "states");
    result.state = {locks: politicalLocks.length};

    unwrap(api.regenerationLocks.setMany(politicalLocks, false), "clear political locks");
    const states = active(app.map.pack?.states, true);
    if (states.length < 2) throw new Error("国家冲突固定图不足两个有效国家");
    const diplomacyLock = {kind: "diplomacy-relation", id: pairKey(states[0].i, states.at(-1).i)};
    unwrap(api.regenerationLocks.set(diplomacyLock, true), "lock diplomacy before state");
    app.editHistory.clear();
    const conflictBefore = transactionSnapshot();
    const conflict = await api.generate.regenerate("states", {confirm: true});
    if (conflict?.ok !== false || conflict?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`国家无法保留外交锁时没有稳定冲突：${JSON.stringify(conflict)}`);
    }
    assertSameTransaction(conflictBefore, transactionSnapshot(), "国家外交锁冲突回滚");
    result.conflict = {reference: diplomacyLock.id, code: conflict.error.code};
    return result;

    async function newMap(seed, cellsTarget) {
      unwrap(await api.generate.newMap({
        confirm: true,
        seed,
        cellsTarget,
        heightmapTemplate: "continents"
      }), `new map ${seed}`);
    }

    function representativeDownstreamReferences() {
      const states = active(app.map.pack?.states, true);
      const regiment = states.flatMap(state => (state.military || []).map(item => ({
        kind: "military",
        id: `${state.i}:${item.i}`
      })))[0];
      const resourceMarker = active(app.map.markers?.markers).find(marker => marker.category === "resource");
      return [
        ref("religion", active(app.map.society?.religions, true)[0]),
        ref("marker", resourceMarker),
        ref("economy-market", active(app.map.pack?.markets, true)[0]),
        ref("trade-flow", active(app.map.pack?.deals)[0]),
        states.length > 1 ? {kind: "diplomacy-relation", id: pairKey(states[0].i, states.at(-1).i)} : null,
        regiment,
        ref("zone", active(app.map.zones?.zones)[0])
      ].filter(Boolean);
    }

    function allBaseReferences() {
      return [
        ...refs("feature", app.map.pack?.features),
        ...refs("river", app.map.rivers?.rivers),
        ...refs("state", app.map.politics?.states, true),
        ...refs("province", app.map.politics?.provinces, true),
        ...refs("city", app.map.settlements?.cities),
        ...refs("route", app.map.settlements?.routes)
      ];
    }

    function representativePoliticalReferences() {
      return [
        ref("state", active(app.map.politics?.states, true)[0]),
        ref("province", active(app.map.politics?.provinces, true)[0]),
        ref("city", active(app.map.settlements?.cities)[0]),
        ref("route", active(app.map.settlements?.routes)[0])
      ].filter(Boolean);
    }

    function refs(kind, rows, positive = false) {
      return active(rows, positive).map(object => ref(kind, object));
    }

    function ref(kind, object) {
      if (!object) return null;
      return {kind, id: object.id ?? object.i};
    }

    function active(rows, positive = false) {
      return (rows || []).filter(object =>
        object && !object.removed && (!positive || Number(object.i ?? object.id) > 0)
      );
    }

    function snapshotReferences(references) {
      return Object.fromEntries(references.map(reference => [
        `${reference.kind}:${reference.id}`,
        snapshotReference(reference)
      ]));
    }

    function snapshotReference({kind, id}) {
      if (kind === "diplomacy-relation") {
        const [left, right] = String(id).split(":").map(Number);
        return {
          packLeft: app.map.pack.states[left]?.diplomacy?.[right],
          packRight: app.map.pack.states[right]?.diplomacy?.[left],
          politicsLeft: app.map.politics.states[left]?.diplomacy?.[right],
          politicsRight: app.map.politics.states[right]?.diplomacy?.[left]
        };
      }
      if (kind === "military") {
        const [stateId, regimentId] = String(id).split(":").map(Number);
        return {
          pack: clone((app.map.pack.states[stateId]?.military || []).find(item => Number(item.i) === regimentId)),
          politics: clone((app.map.politics.states[stateId]?.military || []).find(item => Number(item.i) === regimentId))
        };
      }
      if (kind === "economy-market") {
        return {
          pack: clone(find(app.map.pack?.markets, id)),
          economy: clone(find(app.map.economy?.markets, id)),
          cells: memberCells(app.map.pack?.cells?.market, id)
        };
      }
      if (kind === "trade-flow") {
        return {
          pack: clone(find(app.map.pack?.deals, id)),
          economy: clone(find(app.map.economy?.deals, id))
        };
      }
      if (kind === "state") return {politics: clone(find(app.map.politics?.states, id)), pack: clone(find(app.map.pack?.states, id))};
      if (kind === "province") return {politics: clone(find(app.map.politics?.provinces, id)), pack: clone(find(app.map.pack?.provinces, id))};
      if (kind === "religion") return {society: clone(find(app.map.society?.religions, id)), pack: clone(find(app.map.pack?.religions, id))};
      if (kind === "marker") return {marker: clone(find(app.map.markers?.markers, id)), pack: clone(find(app.map.pack?.markers, id))};
      if (kind === "zone") return {zone: clone(find(app.map.zones?.zones, id)), pack: clone(find(app.map.pack?.zones, id))};
      const rows = {
        feature: app.map.pack?.features,
        river: app.map.rivers?.rivers,
        city: app.map.settlements?.cities,
        route: app.map.settlements?.routes
      }[kind];
      return clone(find(rows, id));
    }

    function find(rows, id) {
      return (rows || []).find(item => String(item?.id ?? item?.i) === String(id));
    }

    function memberCells(values, id) {
      const cells = [];
      for (let cell = 0; cell < (values?.length || 0); cell++) {
        if (Number(values[cell]) === Number(id)) cells.push(cell);
      }
      return cells;
    }

    function pairKey(left, right) {
      const first = Number(left);
      const second = Number(right);
      return first < second ? `${first}:${second}` : `${second}:${first}`;
    }

    function transactionSnapshot() {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        regeneration: clone(app.map.metadata?.regeneration || {}),
        revision: app.mapRevision.getSnapshot()
      };
    }

    function assertSingleTransaction(before, after, label, saltKind = null) {
      if (after.history.undo !== before.history.undo + 1
        || after.history.redo !== 0
        || after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} 未保持单历史/单 revision`);
      }
      if (saltKind && Number(after.regeneration[saltKind] || 0) !== Number(before.regeneration[saltKind] || 0) + 1) {
        throw new Error(`${label} 未保持单 ${saltKind} salt`);
      }
    }

    function assertSameTransaction(before, after, label) {
      if (after.map !== before.map
        || JSON.stringify(after.history) !== JSON.stringify(before.history)
        || JSON.stringify(after.regeneration) !== JSON.stringify(before.regeneration)
        || JSON.stringify(after.revision) !== JSON.stringify(before.revision)) {
        throw new Error(`${label} 没有完整保持地图、历史、salt 和 revision`);
      }
    }

    function assertDeepEqual(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}发生变化`);
    }

    function clone(value) {
      return value === undefined ? null : structuredClone(value);
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) {
        throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""} ${JSON.stringify(publicResult?.error?.details || {})}`);
      }
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message =>
    /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message)
  );
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    ok: true,
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
