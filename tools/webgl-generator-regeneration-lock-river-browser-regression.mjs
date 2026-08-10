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
const port = 5521;
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
    const result = {partial: {}, mixedHighlight: {}, allLocked: {}, postBuildFailure: {}, postRenderFailure: {}, conflict: {}};

    await newMap("lock-river-partial", 3000);
    const branch = activeRivers().find(river => river.parent && activeRivers().some(parent => parent.i === river.parent));
    const route = activeRoutes().find(item => item.packCells?.length >= 3);
    if (!branch || !route) throw new Error("固定地图缺少可锁定支流或道路");
    unwrap(api.regenerationLocks.setMany([{kind: "river", id: branch.i}, {kind: "route", id: route.id}], true), "lock river and route");
    unwrap(api.selection.highlight([{kind: "route", id: route.id}]), "highlight route");
    await settleRenderer();
    app.editHistory.clear();
    const riverBefore = riverEnvelope(branch.i);
    const routeBefore = routeEnvelope(route.id);
    const routeIdentityBefore = captureRouteIdentity();
    const lockIdentityBefore = captureLockIdentity();
    const routeDomainBefore = routeDomainSnapshot();
    const partialProbe = installRendererProbe();
    const unlockedBefore = JSON.stringify(activeRivers().filter(river => river.i !== branch.i));
    const txBefore = transactionSnapshot("rivers");
    const regenerated = unwrap(await api.generate.regenerate("rivers", {confirm: true}), "regenerate rivers");
    partialProbe.restore();
    if (!regenerated.executed) throw new Error("河流正式入口未执行");
    assertDeepEqual(riverEnvelope(branch.i), riverBefore, "锁定河流完整镜像");
    assertDeepEqual(routeEnvelope(route.id), routeBefore, "河流下游锁路完整镜像");
    assertRouteIdentity(routeIdentityBefore, "河流重生成");
    assertLockIdentity(lockIdentityBefore, "河流重生成");
    assertDeepEqual(routeDomainSnapshot(), routeDomainBefore, "河流重生成道路领域");
    assertRiverRefreshProbe(partialProbe, "河流重生成");
    if (JSON.stringify(activeRivers().filter(river => river.i !== branch.i)) === unlockedBefore) throw new Error("未锁河流没有变化");
    const lockedBranch = activeRivers().find(river => river.i === branch.i);
    const parent = activeRivers().find(river => river.i === lockedBranch.parent);
    const basin = activeRivers().find(river => river.i === lockedBranch.basin);
    if (!parent || !basin || !parent.cells.includes(lockedBranch.confluence)) throw new Error("锁定支流的父链支撑失效");
    const txAfter = transactionSnapshot("rivers");
    assertSingleHistory(txBefore, txAfter, "河流重生成");
    await settleRenderer();
    const undoProbe = installRendererProbe();
    const undone = unwrap(api.history.undo(), "undo river regeneration");
    undoProbe.restore();
    if (!undone.executed) throw new Error("河流重生成撤销未执行");
    const undoAfter = transactionSnapshot("rivers");
    if (undoAfter.map !== txBefore.map || undoAfter.salt !== txBefore.salt
      || undoAfter.history.undo !== txBefore.history.undo || undoAfter.history.redo !== txBefore.history.redo + 1) {
      throw new Error("河流重生成撤销没有恢复 A 域或历史游标");
    }
    assertRouteIdentity(routeIdentityBefore, "河流重生成撤销");
    assertLockIdentity(lockIdentityBefore, "河流重生成撤销");
    assertDeepEqual(routeDomainSnapshot(), routeDomainBefore, "河流重生成撤销道路领域");
    assertRiverRefreshProbe(undoProbe, "河流重生成撤销");

    await settleRenderer();
    const redoProbe = installRendererProbe();
    const redone = unwrap(api.history.redo(), "redo river regeneration");
    redoProbe.restore();
    if (!redone.executed) throw new Error("河流重生成重做未执行");
    const redoAfter = transactionSnapshot("rivers");
    if (redoAfter.map !== txAfter.map || redoAfter.salt !== txAfter.salt
      || redoAfter.history.undo !== txAfter.history.undo || redoAfter.history.redo !== txAfter.history.redo) {
      throw new Error("河流重生成重做没有恢复 B 域或历史游标");
    }
    assertRouteIdentity(routeIdentityBefore, "河流重生成重做");
    assertLockIdentity(lockIdentityBefore, "河流重生成重做");
    assertDeepEqual(routeDomainSnapshot(), routeDomainBefore, "河流重生成重做道路领域");
    assertRiverRefreshProbe(redoProbe, "河流重生成重做");
    result.partial = {
      riverId: branch.i,
      parentId: parent.i,
      basinId: basin.i,
      routeId: route.id,
      saltDelta: 1,
      historyDelta: 1,
      undoRedoRouteSync: undoProbe.counts.routeSync + undoProbe.counts.routeAsync + redoProbe.counts.routeSync + redoProbe.counts.routeAsync
    };

    const mixedRiver = activeRivers().find(river => Number(river.i) !== Number(branch.i));
    if (!mixedRiver) throw new Error("固定地图缺少组合高亮河流");
    unwrap(api.selection.highlight([{kind: "route", id: route.id}, {kind: "river", id: mixedRiver.i}]), "highlight route and river");
    await settleRenderer();
    const mixedIdentityBefore = captureRouteIdentity();
    const mixedDomainBefore = routeDomainSnapshot();
    const mixedProbe = installRendererProbe();
    const mixedTxBefore = transactionSnapshot("rivers");
    const mixedRegenerated = unwrap(await api.generate.regenerate("rivers", {confirm: true}), "regenerate rivers with mixed highlight");
    mixedProbe.restore();
    if (!mixedRegenerated.executed) throw new Error("组合高亮河流重生成未执行");
    assertRouteIdentity(mixedIdentityBefore, "组合高亮河流重生成");
    assertDeepEqual(routeDomainSnapshot(), mixedDomainBefore, "组合高亮河流重生成道路领域");
    assertRiverRefreshProbe(mixedProbe, "组合高亮河流重生成");
    const mixedTxAfter = transactionSnapshot("rivers");
    assertSingleHistory(mixedTxBefore, mixedTxAfter, "组合高亮河流重生成");
    result.mixedHighlight = {routeId: route.id, riverId: mixedRiver.i, routeSync: mixedProbe.counts.routeSync + mixedProbe.counts.routeAsync};

    await newMap("lock-river-all", 1000);
    const allRivers = activeRivers();
    const allRoute = activeRoutes().find(item => item.packCells?.length >= 2);
    if (!allRoute) throw new Error("全部锁河固定图缺少道路");
    unwrap(api.regenerationLocks.setMany(allRivers.map(river => ({kind: "river", id: river.i})), true), "lock all rivers");
    unwrap(api.selection.highlight([{kind: "route", id: allRoute.id}]), "highlight all-locked route");
    await settleRenderer();
    app.editHistory.clear();
    const allBefore = transactionSnapshot("rivers");
    const allRouteIdentityBefore = captureRouteIdentity();
    const allLockIdentityBefore = captureLockIdentity();
    const allRouteDomainBefore = routeDomainSnapshot();
    const allLockedProbe = installRendererProbe();
    const noOp = unwrap(await api.generate.regenerate("rivers", {confirm: true}), "regenerate all locked rivers");
    allLockedProbe.restore();
    const allAfter = transactionSnapshot("rivers");
    if (noOp.executed !== false) throw new Error("全部锁河没有返回 no-op");
    assertSameTransaction(allBefore, allAfter, "全部锁河 no-op");
    assertRouteIdentity(allRouteIdentityBefore, "全部锁河 no-op");
    assertLockIdentity(allLockIdentityBefore, "全部锁河 no-op");
    assertDeepEqual(routeDomainSnapshot(), allRouteDomainBefore, "全部锁河 no-op 道路领域");
    assertUntouchedProbe(allLockedProbe, "全部锁河 no-op");
    result.allLocked = {rivers: allRivers.length, routeId: allRoute.id, salt: allAfter.salt, history: allAfter.history.undo, routeSync: 0};

    await newMap("lock-river-post-build-failure", 1000);
    await settleRenderer();
    app.editHistory.clear();
    const postBuildBefore = transactionSnapshot("rivers");
    const postBuildRouteIdentityBefore = captureRouteIdentity();
    const postBuildLockIdentityBefore = captureLockIdentity();
    const postBuildRouteDomainBefore = routeDomainSnapshot();
    const postBuildProbe = installRendererProbe();
    const rejectedAfterBuild = await api.generate.regenerate("rivers", {
      confirm: true,
      constraintBundle: {
        lockedRivers: [],
        ids: () => [],
        assertDomain: () => {
          throw new Error("forced-post-build-river-constraint");
        }
      }
    });
    postBuildProbe.restore();
    if (rejectedAfterBuild?.ok !== false || !String(rejectedAfterBuild?.error?.message || "").includes("forced-post-build-river-constraint")) {
      throw new Error(`河流后置失败没有稳定拒绝：${JSON.stringify(rejectedAfterBuild)}`);
    }
    const postBuildAfter = transactionSnapshot("rivers");
    assertSameTransaction(postBuildBefore, postBuildAfter, "河流后置失败原子回滚");
    assertRouteIdentity(postBuildRouteIdentityBefore, "河流后置失败原子回滚");
    assertLockIdentity(postBuildLockIdentityBefore, "河流后置失败原子回滚");
    assertDeepEqual(routeDomainSnapshot(), postBuildRouteDomainBefore, "河流后置失败道路领域");
    assertUntouchedProbe(postBuildProbe, "河流后置失败原子回滚");
    result.postBuildFailure = {message: rejectedAfterBuild.error.message, routeSync: 0};

    await newMap("lock-river-post-render-failure", 1000);
    const postRenderRiver = activeRivers().find(river => !river.parent && river.cells?.length >= 3);
    const postRenderRoute = activeRoutes().find(item => item.packCells?.length >= 2);
    if (!postRenderRiver || !postRenderRoute) throw new Error("外层后置失败固定图缺少河流或道路");
    unwrap(api.regenerationLocks.setMany([
      {kind: "river", id: postRenderRiver.i},
      {kind: "route", id: postRenderRoute.id}
    ], true), "lock post-render river and route");
    await settleRenderer();
    app.editHistory.clear();
    const postRenderBefore = transactionSnapshot("rivers");
    const postRenderRouteIdentityBefore = captureRouteIdentity();
    const postRenderLockIdentityBefore = captureLockIdentity();
    const postRenderRouteDomainBefore = routeDomainSnapshot();
    const postRenderRiverBufferBefore = riverBufferFingerprint();
    let postRenderRiverBufferCandidate = null;
    let postRenderWorldAsserted = false;
    const postRenderProbe = installRendererProbe();
    const rejectedAfterRender = await api.generate.regenerate("rivers", {
      confirm: true,
      constraintBundle: {
        lockedRivers: [],
        ids: () => [],
        assertDomain: (_map, domain, phase) => {
          if (domain !== "world" || phase !== "after") return;
          postRenderWorldAsserted = true;
          postRenderRiverBufferCandidate = riverBufferFingerprint();
          throw new Error("forced-post-render-river-constraint");
        }
      }
    });
    postRenderProbe.restore();
    if (rejectedAfterRender?.ok !== false || !String(rejectedAfterRender?.error?.message || "").includes("forced-post-render-river-constraint")) {
      throw new Error(`河流外层后置失败没有稳定拒绝：${JSON.stringify(rejectedAfterRender)}`);
    }
    if (!postRenderWorldAsserted || !postRenderRiverBufferCandidate
      || JSON.stringify(postRenderRiverBufferCandidate) === JSON.stringify(postRenderRiverBufferBefore)) {
      throw new Error("河流外层后置失败没有经过已刷新 B buffer");
    }
    const postRenderAfter = transactionSnapshot("rivers");
    assertSameTransaction(postRenderBefore, postRenderAfter, "河流外层后置失败原子回滚");
    assertRouteIdentity(postRenderRouteIdentityBefore, "河流外层后置失败原子回滚");
    assertLockIdentity(postRenderLockIdentityBefore, "河流外层后置失败原子回滚");
    assertDeepEqual(routeDomainSnapshot(), postRenderRouteDomainBefore, "河流外层后置失败道路领域");
    assertDeepEqual(riverBufferFingerprint(), postRenderRiverBufferBefore, "河流外层后置失败 river buffer");
    assertNonRoutePickingCurrent("河流外层后置失败原子回滚");
    assertRiverRefreshProbe(postRenderProbe, "河流外层后置失败原子回滚", 2);
    result.postRenderFailure = {
      message: rejectedAfterRender.error.message,
      routeSync: 0,
      riverBytes: postRenderRiverBufferBefore.byteLength,
      riverVertices: postRenderRiverBufferBefore.vertexCount
    };

    await newMap("lock-river-conflict", 1000);
    const conflictRiver = activeRivers().find(river => !river.parent && river.cells?.length >= 3);
    if (!conflictRiver) throw new Error("冲突固定图缺少干流");
    unwrap(api.regenerationLocks.set({kind: "river", id: conflictRiver.i}, true), "lock conflict river");
    app.editHistory.clear();
    const from = conflictRiver.cells[0];
    conflictRiver.cells[1] = app.map.pack.cells.i.find(cell => cell !== from && !(app.map.pack.cells.c[from] || []).includes(cell));
    await settleRenderer();
    const conflictBefore = transactionSnapshot("rivers");
    const conflictRouteIdentityBefore = captureRouteIdentity();
    const conflictLockIdentityBefore = captureLockIdentity();
    const conflictRouteDomainBefore = routeDomainSnapshot();
    const conflictProbe = installRendererProbe();
    const failed = await api.generate.regenerate("rivers", {confirm: true});
    conflictProbe.restore();
    if (failed?.ok !== false || failed?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`河流冲突没有稳定拒绝：${JSON.stringify(failed)}`);
    }
    const conflictAfter = transactionSnapshot("rivers");
    assertSameTransaction(conflictBefore, conflictAfter, "河流冲突回滚");
    assertRouteIdentity(conflictRouteIdentityBefore, "河流冲突回滚");
    assertLockIdentity(conflictLockIdentityBefore, "河流冲突回滚");
    assertDeepEqual(routeDomainSnapshot(), conflictRouteDomainBefore, "河流冲突回滚道路领域");
    assertUntouchedProbe(conflictProbe, "河流冲突回滚");
    result.conflict = {code: failed.error.code, salt: conflictAfter.salt, history: conflictAfter.history.undo, routeSync: 0};

    return result;

    async function newMap(seed, cellsTarget) {
      unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget, heightmapTemplate: "continents"}), `newMap ${seed}`);
      app.editHistory.clear();
    }

    function activeRivers() {
      return (app.map.rivers?.rivers || []).filter(Boolean);
    }

    function activeRoutes() {
      return (app.map.settlements?.routes || []).filter(Boolean);
    }

    async function settleRenderer() {
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        if (!app.renderer.routeRefreshTimer && !app.renderer.routeRefreshActiveVersion) break;
      }
      await new Promise(resolve => setTimeout(resolve, 240));
    }

    function installRendererProbe() {
      const renderer = app.renderer;
      const counts = {routeSync: 0, routeAsync: 0, objectIndex: 0, riverPartial: 0, draw: 0};
      const originals = new Map();
      for (const [name, key] of [
        ["updateRouteBuffer", "routeSync"],
        ["updateRouteBufferAsync", "routeAsync"],
        ["refreshObjectPickingIndex", "objectIndex"],
        ["refreshRiverPickingIndex", "riverPartial"],
        ["draw", "draw"]
      ]) {
        const original = renderer[name];
        if (typeof original !== "function") continue;
        originals.set(name, original);
        renderer[name] = function(...args) {
          counts[key]++;
          return Reflect.apply(original, this, args);
        };
      }
      return {
        counts,
        restore() {
          for (const [name, original] of originals) renderer[name] = original;
        }
      };
    }

    function captureRouteIdentity() {
      const renderer = app.renderer;
      const route = activeRoutes()[0];
      if (!route) throw new Error("固定地图缺少道路 identity 基线");
      const index = renderer.objectPickingIndex;
      const buckets = new Map();
      for (const [key, bucket] of index.buckets) {
        if (!bucket.routeSegments.length) continue;
        buckets.set(key, {array: bucket.routeSegments, segments: [...bucket.routeSegments]});
      }
      return {
        settlementRoutes: app.map.settlements.routes,
        packRoutes: app.map.pack.routes,
        packCellRoutes: app.map.pack.cells.routes,
        route,
        packRoute: app.map.pack.routes[route.id],
        pickingIndex: index,
        buckets,
        routeBuffer: renderer.routeBuffer,
        bufferFingerprint: routeBufferFingerprint()
      };
    }

    function captureLockIdentity() {
      const store = app.map.regenerationLocks;
      return {
        store,
        entries: store?.entries,
        entryObjects: [...(store?.entries || [])],
        value: JSON.stringify(store)
      };
    }

    function assertLockIdentity(before, label) {
      const current = app.map.regenerationLocks;
      if (current !== before.store || current?.entries !== before.entries || JSON.stringify(current) !== before.value) {
        throw new Error(`${label} 替换或修改了重生成锁仓`);
      }
      if (current.entries.length !== before.entryObjects.length) throw new Error(`${label} 改变了重生成锁数量`);
      for (let index = 0; index < before.entryObjects.length; index++) {
        if (current.entries[index] !== before.entryObjects[index]) throw new Error(`${label} 替换了重生成锁 #${index}`);
      }
    }

    function assertNonRoutePickingCurrent(label) {
      const cities = new Set((app.map.settlements?.cities || []).filter(Boolean));
      const markers = new Set((app.map.markers?.markers || []).filter(Boolean));
      const rivers = new Set(activeRivers());
      for (const [key, bucket] of app.renderer.objectPickingIndex.buckets) {
        for (const city of bucket.cities) if (!cities.has(city)) throw new Error(`${label} city picking #${key} 未指向当前地图`);
        for (const marker of bucket.markers) if (!markers.has(marker)) throw new Error(`${label} marker picking #${key} 未指向当前地图`);
        for (const segment of bucket.riverSegments) {
          if (!rivers.has(segment.river)) throw new Error(`${label} river picking #${key} 未指向当前地图`);
        }
      }
    }

    function assertRouteIdentity(before, label) {
      if (app.map.settlements.routes !== before.settlementRoutes
        || app.map.pack.routes !== before.packRoutes
        || app.map.pack.cells.routes !== before.packCellRoutes
        || activeRoutes()[0] !== before.route
        || app.map.pack.routes[before.route.id] !== before.packRoute
        || app.renderer.objectPickingIndex !== before.pickingIndex
        || app.renderer.routeBuffer !== before.routeBuffer) {
        throw new Error(`${label} 替换了道路三镜像、对象、picking index 或 route buffer identity`);
      }
      for (const [key, expected] of before.buckets) {
        const current = app.renderer.objectPickingIndex.buckets.get(key);
        if (!current || current.routeSegments !== expected.array || current.routeSegments.length !== expected.segments.length) {
          throw new Error(`${label} 替换了道路 picking bucket #${key}`);
        }
        for (let index = 0; index < expected.segments.length; index++) {
          if (current.routeSegments[index] !== expected.segments[index]) throw new Error(`${label} 替换了道路 picking segment #${key}:${index}`);
        }
      }
      assertDeepEqual(routeBufferFingerprint(), before.bufferFingerprint, `${label} route buffer checksum`);
    }

    function routeBufferFingerprint() {
      const renderer = app.renderer;
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.routeBuffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {
        byteLength,
        checksum,
        vertexCount: renderer.routeVertexCount,
        drawRanges: JSON.stringify(renderer.routeDrawRanges),
        camera: JSON.stringify(renderer.routeBufferCamera)
      };
    }

    function riverBufferFingerprint() {
      const renderer = app.renderer;
      const gl = renderer.gl;
      const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.riverBuffer);
      const byteLength = Number(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) || 0;
      const bytes = new Uint8Array(byteLength);
      if (byteLength) gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, previous);
      let checksum = 2166136261;
      for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      return {
        byteLength,
        checksum,
        vertexCount: renderer.riverVertexCount,
        camera: JSON.stringify(renderer.riverBufferCamera)
      };
    }

    function routeDomainSnapshot() {
      return JSON.stringify({
        routes: app.map.settlements.routes,
        packRoutes: app.map.pack.routes,
        packCellRoutes: app.map.pack.cells.routes,
        salt: Number(app.map.metadata?.regeneration?.routes) || 0,
        locks: (app.map.regenerationLocks?.entries || []).filter(entry => entry.kind === "route")
      });
    }

    function assertRiverRefreshProbe(probe, label, expectedRiverPartial = 1) {
      const {routeSync, routeAsync, objectIndex, riverPartial} = probe.counts;
      if (routeSync !== 0 || routeAsync !== 0 || objectIndex !== 0 || riverPartial !== expectedRiverPartial) {
        throw new Error(`${label} 刷新域错误：${JSON.stringify(probe.counts)}`);
      }
    }

    function assertUntouchedProbe(probe, label) {
      if (Object.values(probe.counts).some(Boolean)) throw new Error(`${label} 仍触发 renderer：${JSON.stringify(probe.counts)}`);
    }

    function riverEnvelope(id) {
      const river = activeRivers().find(item => Number(item.i) === Number(id));
      const memberCells = river.cells.filter(cell => cell >= 0);
      return {
        river: structuredClone(river),
        packRiver: structuredClone((app.map.pack.rivers || []).find(item => Number(item.i) === Number(id))),
        cells: memberCells.map(cell => [cell, Number(app.map.pack.cells.r[cell]), Number(app.map.pack.cells.fl[cell]), Number(app.map.pack.cells.conf[cell])]),
        lakeEdges: app.map.pack.features.filter(feature => feature?.type === "lake" && (
          Number(feature.river) === Number(id) || Number(feature.outlet) === Number(id) || (feature.inlets || []).map(Number).includes(Number(id))
        )).map(feature => [Number(feature.i), Number(feature.river) === Number(id), Number(feature.outlet) === Number(id), (feature.inlets || []).map(Number).includes(Number(id))]),
        notes: structuredClone((app.map.notes?.notes || []).filter(note => note?.kind === "river" && Number(note.objectId) === Number(id)))
      };
    }

    function routeEnvelope(id) {
      const route = activeRoutes().find(item => Number(item.id) === Number(id));
      return {
        route: structuredClone(route),
        packRoute: structuredClone(app.map.pack.routes[id]),
        links: route.packCells.slice(0, -1).map((cell, index) => [cell, route.packCells[index + 1], app.map.pack.cells.routes[cell]?.[route.packCells[index + 1]] ?? null]),
        notes: structuredClone((app.map.notes?.notes || []).filter(note => note?.kind === "route" && Number(note.objectId) === Number(id)))
      };
    }

    function transactionSnapshot(kind) {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        salt: Number(app.map.metadata?.regeneration?.[kind]) || 0
      };
    }

    function assertSingleHistory(before, after, label) {
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0 || after.salt !== before.salt + 1) {
        throw new Error(`${label} 未保持单历史/单 salt`);
      }
    }

    function assertSameTransaction(before, after, label) {
      if (after.map !== before.map || after.history.undo !== before.history.undo || after.history.redo !== before.history.redo || after.salt !== before.salt) {
        throw new Error(`${label} 没有完整保持地图、历史和 salt`);
      }
    }

    function assertDeepEqual(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}发生变化`);
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""}`);
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message));
  const expectedFailureSignals = consoleErrors.filter(message => /^\[FMG health\] operation-failed\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message) && !expectedFailureSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, ...report, healthPerformanceSignals, expectedFailureSignals, applicationConsoleErrors, pageErrors}, null, 2));
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
