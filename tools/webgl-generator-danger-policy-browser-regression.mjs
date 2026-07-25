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
const port = 5499;
const templateStorageKey = "webgl-generator-height-terrain-templates-v1";
const templateRecycleStorageKey = "webgl-generator-height-terrain-template-recycle-v1";
const unitRecycleStorageKey = "webgl-generator-custom-unit-recycle-v1";
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    if (sessionStorage.getItem("danger-policy-browser-initialized")) return;
    localStorage.clear();
    sessionStorage.setItem("danger-policy-browser-initialized", "1");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180000);

  console.log("[danger-policy] 1/6 画布删除");
  const canvas = await testCanvasDeletePolicies(page);
  console.log("[danger-policy] 2/6 八类删除 API");
  const api = await testEightDeleteApis(page);
  console.log("[danger-policy] 3/6 名称库");
  const namebases = await testNamebasePolicies(page);
  console.log("[danger-policy] 4/6 高度模板");
  const heightTemplate = await testHeightTemplateRecycle(page);
  console.log("[danger-policy] 5/6 自定义单位");
  const customUnit = await testCustomUnitRecycle(page);
  console.log("[danger-policy] 6/6 清洁收尾");
  const cleanup = await assertCleanRuntime(page, consoleErrors, pageErrors);

  console.log(JSON.stringify({
    ok: true,
    scenarios: {
      "DR-203-CANVAS-CANCEL": canvas.map(item => item.cancel),
      "DR-203-CANVAS-CONFIRM": canvas.map(item => item.confirm),
      "DR-203-API-CONFIRM": api,
      "DR-203-NAMEBASE": namebases,
      "DR-203-HEIGHT-RECYCLE": heightTemplate,
      "DR-203-CUSTOM-UNIT": customUnit
    },
    cleanup
  }, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function testCanvasDeletePolicies(page) {
  const cases = [
    {kind: "state", plural: "states", panelId: "state-panel", openId: "open-state-panel", button: /删除国家/, modeId: "state:delete"},
    {kind: "province", plural: "provinces", panelId: "province-panel", openId: "open-province-panel", button: /删除省份/, modeId: "province:delete"},
    {kind: "city", plural: "cities", panelId: "city-panel", openId: "open-city-panel", button: /删除城市/, modeId: "city:delete"}
  ];
  const report = [];

  for (const item of cases) {
    console.log(`[danger-policy] canvas ${item.kind} prepare`);
    const fixture = await prepareCanvasDeleteFixture(page, item);
    console.log(`[danger-policy] canvas ${item.kind} fixture #${fixture.id}`);
    await openPanel(page, item.openId, item.panelId);
    const panel = page.locator(`.floating-panel[data-panel-id="${item.panelId}"]:not(.hidden)`);
    await panel.getByRole("button", {name: item.button}).click();
    await page.waitForFunction(modeId => window.__webglGeneratorApp?.canvasToolModes?.getActive?.()?.id === modeId, item.modeId);

    const beforeCancel = await readMutationFingerprint(page);
    const cancelledDialog = await actOnNativeDialog(
      page,
      () => dispatchCanvasPointer(page, fixture.point),
      {accept: false, message: /确定删除|确认后/}
    );
    console.log(`[danger-policy] canvas ${item.kind} cancel`);
    const afterCancel = await readMutationFingerprint(page);
    assert.equal(afterCancel.map, beforeCancel.map, `${item.kind} 画布删除取消后地图变化`);
    assert.deepEqual(afterCancel.history, beforeCancel.history, `${item.kind} 画布删除取消后历史变化`);
    assert.deepEqual(afterCancel.selection, beforeCancel.selection, `${item.kind} 画布删除取消后 selection 变化`);
    assert.deepEqual(afterCancel.mode, beforeCancel.mode, `${item.kind} 画布删除取消后 mode 变化`);
    assert.equal(afterCancel.mode?.id, item.modeId, `${item.kind} 画布删除取消后没有留在原模式`);

    await page.evaluate(() => {
      window.__dangerPolicyMapBaseline = structuredClone(window.__webglGeneratorApp.map);
    });
    const confirmedDialog = await actOnNativeDialog(
      page,
      () => dispatchCanvasPointer(page, fixture.point),
      {accept: true, message: /确定删除|确认后/}
    );
    console.log(`[danger-policy] canvas ${item.kind} confirm`);
    await page.waitForFunction(
      ({modeId, undo}) => {
        const app = window.__webglGeneratorApp;
        return app?.canvasToolModes?.getActive?.()?.id !== modeId && app?.editHistory?.getStats?.().undo === undo + 1;
      },
      {modeId: item.modeId, undo: beforeCancel.history.undo}
    );
    const afterConfirm = await readMutationFingerprint(page);
    assert.equal(afterConfirm.mode, null, `${item.kind} 画布删除成功后 mode 未退出`);
    assert.equal(afterConfirm.history.undo, beforeCancel.history.undo + 1, `${item.kind} 画布删除没有形成一条历史`);
    assert.notEqual(afterConfirm.map, beforeCancel.map, `${item.kind} 画布删除确认后地图未变化`);

    unwrap(await page.evaluate(() => window.webglGeneratorApi.history.undo()), `${item.kind}.canvas.undo`);
    console.log(`[danger-policy] canvas ${item.kind} undo`);
    const afterUndo = await readMutationFingerprint(page);
    if (afterUndo.semanticMap !== beforeCancel.semanticMap) {
      const diff = await readBaselineMapDiff(page);
      throw new Error(`${item.kind} 画布删除撤销未恢复地图：${JSON.stringify(diff)}`);
    }
    assert.equal(await objectExists(page, item.kind, fixture.id), true, `${item.kind} 画布删除撤销未恢复目标`);

    report.push({
      kind: item.kind,
      targetId: fixture.id,
      preview: fixture.preview.summary,
      cancel: {
        dialog: cancelledDialog,
        mapUnchanged: true,
        historyUnchanged: true,
        selectionUnchanged: true,
        modeUnchanged: true
      },
      confirm: {
        dialog: confirmedDialog,
        historyDelta: 1,
        modeExited: true,
        undoRestored: true
      }
    });
  }
  return report;
}

async function prepareCanvasDeleteFixture(page, item) {
  await generateMap(page, `danger-canvas-${item.kind}`, 2200);
  return page.evaluate(({kind, plural}) => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const ids = candidateIds(map, kind);
    let chosen = null;
    for (const id of ids) {
      const inspected = api.edit[plural].delete(id, {inspectOnly: true});
      if (!inspected?.ok || !inspected.data?.preview?.requiresConfirm) continue;
      chosen = {id, preview: inspected.data.preview};
      break;
    }
    if (!chosen) throw new Error(`${kind} 缺少需要原生确认的画布删除目标`);
    unwrap(api.selection.select({kind, id: chosen.id}));
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    let point;
    if (kind === "city") {
      const city = map.settlements.cities.find(value => value && Number(value.id ?? value.i) === chosen.id);
      point = app.renderer.worldToScreen(Number(city.x), Number(city.y), rect);
    } else {
      const field = kind === "state" ? "state" : "province";
      const cell = Array.from(map.grid.cells[field]).findIndex(value => Number(value) === chosen.id);
      if (cell < 0) throw new Error(`${kind} #${chosen.id} 缺少 grid cell`);
      const pointIndex = map.grid.cells.p[cell];
      const world = map.grid.points[pointIndex];
      point = app.renderer.worldToScreen(world[0], world[1], rect);
    }
    return {
      ...chosen,
      point: {x: rect.left + point.x, y: rect.top + point.y}
    };

    function candidateIds(source, targetKind) {
      if (targetKind === "state") return active(source.politics.states);
      if (targetKind === "province") return active(source.politics.provinces);
      if (targetKind === "city") return active(source.settlements.cities, true);
      return [];
    }
    function active(items, allowZero = false) {
      return (items || [])
        .filter(item => item && !item.removed)
        .map(item => Number(item.id ?? item.i))
        .filter(id => Number.isInteger(id) && (allowZero ? id >= 0 : id > 0));
    }
    function unwrap(result) {
      if (!result?.ok) throw new Error(result?.error?.message || "API 调用失败");
      return result.data;
    }
  }, {kind: item.kind, plural: item.plural});
}

async function testEightDeleteApis(page) {
  await generateMap(page, "danger-eight-delete-apis", 2800);
  const kinds = ["cities", "provinces", "states", "cultures", "religions", "routes", "rivers", "lakes"];
  const report = [];

  for (const plural of kinds) {
    console.log(`[danger-policy] API ${plural}`);
    const kind = plural === "cities" ? "city" : plural.slice(0, -1);
    const target = await page.evaluate(({kind, plural}) => {
      const api = window.webglGeneratorApi;
      const map = window.__webglGeneratorApp.map;
      const ids = candidateIds(map, kind);
      const inspections = ids.map(id => ({id, result: api.edit[plural].delete(id, {inspectOnly: true})}));
      let candidate = plural === "routes"
        ? inspections.find(item => item.result?.ok && item.result.data?.preview?.impactLevel === "low")
        : inspections.find(item => item.result?.ok && item.result.data?.preview?.requiresConfirm);
      if (!candidate && plural !== "routes" && ids[0] !== undefined) {
        unwrap(api.edit.notes.set({kind, id: ids[0]}, `危险策略 ${kind} 删除依赖`));
        const result = api.edit[plural].delete(ids[0], {inspectOnly: true});
        if (result?.ok && result.data?.preview?.requiresConfirm) candidate = {id: ids[0], result};
      }
      if (!candidate) throw new Error(`${plural} 缺少符合策略的 API 删除目标`);
      return {id: candidate.id, preview: candidate.result.data.preview};

      function candidateIds(source, targetKind) {
        if (targetKind === "state") return active(source.politics.states);
        if (targetKind === "province") return active(source.politics.provinces);
        if (targetKind === "city") return active(source.settlements.cities, true);
        if (targetKind === "culture") return active(source.society.cultures);
        if (targetKind === "religion") return active(source.society.religions);
        if (targetKind === "route") return active(source.settlements.routes, true);
        if (targetKind === "river") return active(source.rivers.rivers, true);
        if (targetKind === "lake") return active(source.pack.features.filter(item => item?.type === "lake"), true);
        return [];
      }
      function active(items, allowZero = false) {
        return (items || [])
          .filter(item => item && !item.removed)
          .map(item => Number(item.id ?? item.i))
          .filter(id => Number.isInteger(id) && (allowZero ? id >= 0 : id > 0));
      }
      function unwrap(result) {
        if (!result?.ok) throw new Error(result?.error?.message || "API 调用失败");
        return result.data;
      }
    }, {kind, plural});

    const before = await readMutationFingerprint(page);
    const inspection = unwrap(
      await page.evaluate(({plural, id}) => window.webglGeneratorApi.edit[plural].delete(id, {inspectOnly: true}), {plural, id: target.id}),
      `${plural}.delete.inspect`
    );
    assert.equal(inspection.inspectOnly, true, `${plural}.delete inspectOnly 标志异常`);
    assert.equal(inspection.executed, false, `${plural}.delete inspectOnly 执行了删除`);
    assert.equal((await readMutationFingerprint(page)).map, before.map, `${plural}.delete inspectOnly 改变地图`);

    let compatibility = "confirmation_required";
    if (target.preview.requiresConfirm) {
      const denied = await page.evaluate(({plural, id}) => window.webglGeneratorApi.edit[plural].delete(id), {plural, id: target.id});
      assert.equal(denied?.ok, false, `${plural}.delete 未确认没有拒绝`);
      assert.equal(denied?.error?.code, "confirmation_required", `${plural}.delete 未返回 confirmation_required`);
      assert.deepEqual(denied.error.preview, target.preview, `${plural}.delete 拒绝结果缺少同一预检`);
      assert.equal((await readMutationFingerprint(page)).map, before.map, `${plural}.delete 拒绝后改变地图`);
    } else {
      assert.equal(plural, "routes", `${plural}.delete 只有低影响路线允许免确认`);
      assert.equal(target.preview.impactLevel, "low", "免确认路线不是 low impact");
      const compatible = unwrap(
        await page.evaluate(({id}) => window.webglGeneratorApi.edit.routes.delete(id), {id: target.id}),
        "routes.delete.compatible"
      );
      assert.equal(compatible.executed, true, "低影响路线未保持免确认兼容");
      assert.equal(compatible.history.undo, before.history.undo + 1, "低影响路线免确认删除没有形成历史");
      unwrap(await page.evaluate(() => window.webglGeneratorApi.history.undo()), "routes.compatible.undo");
      assert.equal((await readMutationFingerprint(page)).semanticMap, before.semanticMap, "低影响路线免确认删除撤销未恢复");
      compatibility = "low-impact-compatible";
    }

    const beforeConfirmed = await readMutationFingerprint(page);
    const confirmed = unwrap(
      await page.evaluate(({plural, id}) => window.webglGeneratorApi.edit[plural].delete(id, {confirm: true}), {plural, id: target.id}),
      `${plural}.delete.confirm`
    );
    assert.equal(confirmed.executed, true, `${plural}.delete 确认后未执行`);
    assert.ok(confirmed.preview && confirmed.deleteSummary, `${plural}.delete 成功包络缺少 preview/deleteSummary`);
    assert.equal(confirmed.history.undo, beforeConfirmed.history.undo + 1, `${plural}.delete 确认后没有形成一条历史`);
    assert.equal(await objectExists(page, kind, target.id), false, `${plural}.delete 确认后目标仍存在`);
    unwrap(await page.evaluate(() => window.webglGeneratorApi.history.undo()), `${plural}.delete.undo`);
    const afterUndo = await readMutationFingerprint(page);
    assert.equal(afterUndo.semanticMap, beforeConfirmed.semanticMap, `${plural}.delete 撤销未恢复地图`);
    assert.equal(await objectExists(page, kind, target.id), true, `${plural}.delete 撤销未恢复目标`);

    report.push({
      kind,
      targetId: target.id,
      impactLevel: target.preview.impactLevel,
      requiresConfirm: target.preview.requiresConfirm,
      inspectOnly: true,
      compatibility,
      confirmedHistoryDelta: 1,
      undoRestored: true
    });
  }
  return report;
}

async function testNamebasePolicies(page) {
  const apiReport = await page.evaluate(() => {
    const api = window.webglGeneratorApi;
    const created = unwrap(api.namebases.create({name: "危险策略 API 删除库", source: ["玄河", "霜野"]}));
    const id = created.result.id;
    const before = snapshot();
    const inspect = unwrap(api.namebases.delete(id, {inspectOnly: true}));
    if (!inspect.inspectOnly || inspect.preview?.impactLevel !== "medium") throw new Error("名称库 API 删除预检异常");
    const denied = api.namebases.delete(id);
    if (denied?.ok !== false || denied.error?.code !== "confirmation_required") throw new Error("名称库 API 删除未确认拒绝异常");
    if (snapshot().map !== before.map || snapshot().history.undo !== before.history.undo) throw new Error("名称库 API 删除拒绝改变状态");
    const deleted = unwrap(api.namebases.delete(id, {confirm: true}));
    if (!deleted.executed || deleted.history.undo !== before.history.undo + 1) throw new Error("名称库 API 删除确认执行异常");
    unwrap(api.history.undo());
    if (snapshot().map !== before.map) throw new Error("名称库 API 删除撤销未恢复");

    const clearA = unwrap(api.namebases.create({name: "危险策略 API 清空甲", source: ["甲河", "甲岭"]})).result.id;
    const clearB = unwrap(api.namebases.create({name: "危险策略 API 清空乙", source: ["乙河", "乙岭"]})).result.id;
    const beforeClear = snapshot();
    const clearInspect = unwrap(api.namebases.clear({inspectOnly: true}));
    if (!clearInspect.inspectOnly || clearInspect.preview?.impactLevel !== "high") throw new Error("名称库 API 清空预检异常");
    const clearDenied = api.namebases.clear();
    if (clearDenied?.ok !== false || clearDenied.error?.code !== "confirmation_required") throw new Error("名称库 API 清空未确认拒绝异常");
    if (snapshot().map !== beforeClear.map || snapshot().history.undo !== beforeClear.history.undo) throw new Error("名称库 API 清空拒绝改变状态");
    const cleared = unwrap(api.namebases.clear({confirm: true}));
    if (!cleared.executed || cleared.history.undo !== beforeClear.history.undo + 1) throw new Error("名称库 API 清空确认执行异常");
    unwrap(api.history.undo());
    if (snapshot().map !== beforeClear.map) throw new Error("名称库 API 清空撤销未恢复");
    unwrap(api.history.undo());
    unwrap(api.history.undo());
    unwrap(api.history.undo());
    return {
      delete: {inspectOnly: true, denied: denied.error.code, historyDelta: 1, undoRestored: true},
      clear: {ids: [clearA, clearB], inspectOnly: true, denied: clearDenied.error.code, historyDelta: 1, undoRestored: true}
    };

    function snapshot() {
      const app = window.__webglGeneratorApp;
      return {map: JSON.stringify(app.map), history: app.editHistory.getStats()};
    }
    function unwrap(result) {
      if (!result?.ok) throw new Error(result?.error?.message || "API 调用失败");
      return result.data;
    }
  });

  const uiBase = unwrap(
    await page.evaluate(() => window.webglGeneratorApi.namebases.create({name: "危险策略 UI 删除库", source: ["青川", "云津"]})),
    "namebases.ui.create"
  );
  await openPanel(page, "open-namebase-panel", "namebase-panel");
  const panel = page.locator('.floating-panel[data-panel-id="namebase-panel"]:not(.hidden)');
  await selectObjectTableRow(panel, "危险策略 UI 删除库");
  const beforeUiDelete = await readMutationFingerprint(page);
  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "删除选中用户库"}).click(), {accept: false, message: /确定删除用户名称库/});
  assert.deepEqual(await readMutationFingerprint(page), beforeUiDelete, "名称库 UI 删除取消后状态变化");
  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "删除选中用户库"}).click(), {accept: true, message: /确定删除用户名称库/});
  await page.waitForFunction(id => !window.__webglGeneratorApp.map.namebases.bases.some(base => base.id === id), uiBase.result.id);
  assert.equal((await readMutationFingerprint(page)).history.undo, beforeUiDelete.history.undo + 1, "名称库 UI 删除未形成一条历史");
  unwrap(await page.evaluate(() => window.webglGeneratorApi.history.undo()), "namebases.ui.delete.undo");
  assert.equal((await readMutationFingerprint(page)).map, beforeUiDelete.map, "名称库 UI 删除撤销未恢复");

  const uiClearA = unwrap(await page.evaluate(() => window.webglGeneratorApi.namebases.create({name: "危险策略 UI 清空甲", source: ["甲山", "甲泽"]})), "namebases.ui.clearA");
  const uiClearB = unwrap(await page.evaluate(() => window.webglGeneratorApi.namebases.create({name: "危险策略 UI 清空乙", source: ["乙山", "乙泽"]})), "namebases.ui.clearB");
  const beforeUiClear = await readMutationFingerprint(page);
  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "清空用户库"}).click(), {accept: false, message: /确定清空/});
  assert.deepEqual(await readMutationFingerprint(page), beforeUiClear, "名称库 UI 清空取消后状态变化");
  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "清空用户库"}).click(), {accept: true, message: /确定清空/});
  await page.waitForFunction(() => window.__webglGeneratorApp.map.namebases.bases.every(base => base?.builtin === true));
  assert.equal((await readMutationFingerprint(page)).history.undo, beforeUiClear.history.undo + 1, "名称库 UI 清空未形成一条历史");
  unwrap(await page.evaluate(() => window.webglGeneratorApi.history.undo()), "namebases.ui.clear.undo");
  assert.equal((await readMutationFingerprint(page)).map, beforeUiClear.map, "名称库 UI 清空撤销未恢复");
  for (let index = 0; index < 3; index++) unwrap(await page.evaluate(() => window.webglGeneratorApi.history.undo()), `namebases.ui.cleanup.${index}`);

  return {
    api: apiReport,
    ui: {
      delete: {id: uiBase.result.id, cancelUnchanged: true, historyDelta: 1, undoRestored: true},
      clear: {ids: [uiClearA.result.id, uiClearB.result.id], cancelUnchanged: true, historyDelta: 1, undoRestored: true}
    }
  };
}

async function testHeightTemplateRecycle(page) {
  unwrap(await page.evaluate(() => window.webglGeneratorApi.debug.enable()), "debug.enable.height");
  console.log("[danger-policy] height debug");
  await openPanel(page, "open-height-panel", "height-panel");
  console.log("[danger-policy] height panel");
  const panel = page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
  const advanced = panel.locator("details.height-advanced-section");
  await advanced.locator("summary").click();
  console.log("[danger-policy] height advanced");
  const templateDocument = {
    documentType: "webgl-generator-height-terrain-templates",
    version: 1,
    templates: [{
      id: "user-danger-policy-reload",
      name: "危险策略跨刷新模板",
      description: "危险策略浏览器回归夹具",
      user: true,
      steps: [{operation: "plateau", intensity: 0.7, targetHeight: 68}]
    }]
  };
  await panel.locator(".height-template-library-actions input[type=file]").setInputFiles({
    name: "danger-policy-height-template.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(templateDocument))
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
    return Array.from(panel?.querySelectorAll("button") || []).some(button => button.textContent.trim() === "删除所选用户模板" && !button.disabled);
  });
  console.log("[danger-policy] height imported");
  await panel.getByRole("button", {name: "删除所选用户模板"}).waitFor({state: "visible"});
  assert.equal(await panel.getByRole("button", {name: "删除所选用户模板"}).isEnabled(), true, "保存后模板删除按钮未启用");

  const beforeCancel = await readStorage(page, [templateStorageKey, templateRecycleStorageKey]);
  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "删除所选用户模板"}).click(), {accept: false, message: /确定删除用户模板/});
  console.log("[danger-policy] height cancel");
  assert.deepEqual(await readStorage(page, [templateStorageKey, templateRecycleStorageKey]), beforeCancel, "高度模板取消删除改变 storage");
  assert.match(await panel.locator(".height-template-composer").innerText(), /已取消删除用户模板/, "高度模板取消删除缺少 UI 反馈");

  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "删除所选用户模板"}).click(), {accept: true, message: /确定删除用户模板/});
  console.log("[danger-policy] height deleted");
  const afterDelete = await readStorage(page, [templateStorageKey, templateRecycleStorageKey]);
  assert.notEqual(afterDelete[templateStorageKey], beforeCancel[templateStorageKey], "高度模板确认删除未更新模板 storage");
  assert.ok(afterDelete[templateRecycleStorageKey], "高度模板确认删除未写回收记录");

  await reloadReady(page);
  console.log("[danger-policy] height reloaded");
  unwrap(await page.evaluate(() => window.webglGeneratorApi.debug.enable()), "debug.enable.height.reload");
  await openPanel(page, "open-height-panel", "height-panel");
  const reloadedPanel = page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
  await reloadedPanel.locator("details.height-advanced-section summary").click();
  const restore = reloadedPanel.getByRole("button", {name: "恢复上次删除"});
  assert.equal(await restore.isEnabled(), true, "高度模板刷新后恢复按钮未启用");
  await restore.click();
  console.log("[danger-policy] height restored");
  const afterRestore = await readStorage(page, [templateStorageKey, templateRecycleStorageKey]);
  assert.equal(afterRestore[templateStorageKey], beforeCancel[templateStorageKey], "高度模板恢复后模板文档不一致");
  assert.equal(afterRestore[templateRecycleStorageKey], null, "高度模板恢复后回收记录未清空");
  assert.match(await reloadedPanel.locator(".height-template-composer").innerText(), /已恢复用户模板/, "高度模板恢复缺少 UI 反馈");

  return {
    cancelStorageUnchanged: true,
    confirmedRecycleWritten: true,
    reloadRestoreEnabled: true,
    restoredDocumentExact: true,
    recycleCleared: true
  };
}

async function testCustomUnitRecycle(page) {
  await openControlTab(page, "units");
  console.log("[danger-policy] unit panel");
  const panel = page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
  await panel.getByRole("button", {name: "新增自定义单位"}).click();
  console.log("[danger-policy] unit editor");
  const editor = panel.locator("form.unit-custom-editor");
  const fields = editor.locator("input");
  await fields.nth(0).fill("危险策略里程");
  await fields.nth(1).fill("险里");
  await fields.nth(2).fill("3.5");
  await editor.getByRole("button", {name: "保存并使用"}).click();
  console.log("[danger-policy] unit saved");
  const created = unwrap(await page.evaluate(() => window.webglGeneratorApi.units.get()), "units.get.created");
  const unit = created.units.customUnits.find(item => item.name === "危险策略里程");
  assert.ok(unit, "自定义单位 UI 保存后 API 未读到单位");
  assert.equal(created.units.distanceUnit, `custom:${unit.id}`, "自定义单位保存后没有设为当前单位");

  await actOnNativeDialog(page, () => panel.getByRole("button", {name: "删除当前单位"}).click(), {accept: true, message: /确定删除自定义单位/});
  console.log("[danger-policy] unit deleted");
  const afterDelete = unwrap(await page.evaluate(() => window.webglGeneratorApi.units.get()), "units.get.deleted");
  assert.equal(afterDelete.units.customUnits.some(item => item.id === unit.id), false, "自定义单位确认删除后仍存在");
  assert.ok((await readStorage(page, [unitRecycleStorageKey]))[unitRecycleStorageKey], "自定义单位确认删除未写回收记录");

  await reloadReady(page);
  console.log("[danger-policy] unit reloaded");
  await openControlTab(page, "units");
  console.log("[danger-policy] unit reopened");
  const reloadedPanel = page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
  const restore = reloadedPanel.getByRole("button", {name: "恢复上次删除单位"});
  await restore.waitFor({state: "visible"});
  await restore.click();
  console.log("[danger-policy] unit restored");
  const afterRestore = unwrap(await page.evaluate(() => window.webglGeneratorApi.units.get()), "units.get.restored");
  assert.ok(afterRestore.units.customUnits.some(item => item.id === unit.id && item.name === unit.name), "刷新后恢复没有找回自定义单位");
  assert.equal(afterRestore.units.distanceUnit, `custom:${unit.id}`, "恢复后没有重新使用自定义单位");
  assert.equal((await readStorage(page, [unitRecycleStorageKey]))[unitRecycleStorageKey], null, "自定义单位恢复后回收记录未清空");
  assert.equal(await reloadedPanel.getByRole("button", {name: "删除当前单位"}).isVisible(), true, "自定义单位恢复后 UI 未回到可删除状态");

  return {
    id: unit.id,
    uiCreated: true,
    confirmedRecycleWritten: true,
    reloadRestoreVisible: true,
    restoredAndSelected: true,
    recycleCleared: true
  };
}

async function assertCleanRuntime(page, consoleErrors, pageErrors) {
  unwrap(await page.evaluate(() => window.webglGeneratorApi.selection.clear()), "selection.clear.cleanup");
  unwrap(await page.evaluate(() => window.webglGeneratorApi.debug.disable()), "debug.disable.cleanup");
  const before = await generateMap(page, "danger-policy-final-clean", 1200);
  const diagnostics = await page.evaluate(() => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const health = api.info.healthEvents({severity: "error", limit: 200});
    if (!health?.ok) throw new Error(health?.error?.message || "无法读取 health error");
    const renderer = app.renderer.getStats?.() || {};
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    const mapJson = JSON.stringify(app.map);
    return {
      map: fingerprint(mapJson),
      history: app.editHistory.getStats(),
      selection: app.selectionStore.getSnapshot(),
      mode: app.canvasToolModes.getActive(),
      runtime: app.runtimeOperation?.getSnapshot?.() || null,
      healthErrors: health.data.total,
      glError: renderer.draw?.glError ?? gl?.getError?.() ?? 0
    };
    function fingerprint(text) {
      let first = 2166136261;
      let second = 5381;
      for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        first = Math.imul(first ^ code, 16777619);
        second = Math.imul(second, 33) ^ code;
      }
      return `${text.length}:${first >>> 0}:${second >>> 0}`;
    }
  });
  assert.equal(diagnostics.map, before.map, "最终清洁地图在生成后出现残余写入");
  assert.equal(diagnostics.history.undo, 0, "最终清洁地图仍有撤销历史");
  assert.deepEqual(diagnostics.selection, {selection: null, editingObject: null}, "最终 selection/editing 未清空");
  assert.equal(diagnostics.mode, null, "最终仍有活动画布 mode");
  assert.equal(diagnostics.runtime?.busy, false, "最终仍有运行中事务");
  assert.equal(diagnostics.healthErrors, 0, "最终 health error 不为零");
  assert.equal(diagnostics.glError, 0, "最终 WebGL error 不为零");
  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, [], `出现应用 console error：${applicationConsoleErrors.join("；")}`);
  assert.deepEqual(pageErrors, [], `出现 page error：${pageErrors.join("；")}`);
  return {
    mapRestored: true,
    historyUndo: diagnostics.history.undo,
    selection: diagnostics.selection,
    mode: diagnostics.mode,
    runtimeBusy: diagnostics.runtime?.busy,
    healthErrors: diagnostics.healthErrors,
    glError: diagnostics.glError,
    consoleErrors: applicationConsoleErrors,
    healthPerformanceSignals,
    pageErrors
  };
}

async function generateMap(page, seed, cellsTarget) {
  const generated = unwrap(
    await page.evaluate(({seed, cellsTarget}) => window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed,
      cellsTarget,
      heightmapTemplate: "continents"
    }), {seed, cellsTarget}),
    `generate.newMap.${seed}`
  );
  await waitForApiReady(page, 180000);
  const snapshot = await readMutationFingerprint(page);
  assert.equal(snapshot.history.undo, 0, `${seed} 新地图没有清空历史`);
  return {generated, ...snapshot};
}

async function openPanel(page, openId, panelId) {
  await page.evaluate(id => document.getElementById(id)?.click(), openId);
  const panel = page.locator(`.floating-panel[data-panel-id="${panelId}"]:not(.hidden)`);
  await panel.waitFor({state: "visible"});
  return panel;
}

async function openControlTab(page, tab) {
  await openPanel(page, "open-generation-panel", "generation-panel");
  const panel = page.locator('.floating-panel[data-panel-id="generation-panel"]:not(.hidden)');
  await panel.locator(`[data-control-tab="${tab}"]`).click();
  await panel.locator(`[data-control-panel="${tab}"]:not([hidden])`).waitFor({state: "visible"});
}

async function selectObjectTableRow(panel, text) {
  const cell = panel.getByText(text, {exact: true});
  await cell.waitFor({state: "visible"});
  await cell.locator("xpath=ancestor::tr[contains(@class,'object-table-row')]").click();
}

async function dispatchCanvasPointer(page, point) {
  await page.evaluate(({x, y}) => {
    const canvas = document.getElementById("map-canvas");
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      pointerId: 203,
      pointerType: "mouse",
      isPrimary: true,
      button: 0
    };
    canvas.dispatchEvent(new PointerEvent("pointerdown", {...common, buttons: 1}));
    canvas.dispatchEvent(new PointerEvent("pointerup", {...common, buttons: 0}));
  }, point);
}

async function actOnNativeDialog(page, action, {accept, message}) {
  const dialogPromise = page.waitForEvent("dialog", {timeout: 20000});
  const actionPromise = action();
  const dialog = await dialogPromise;
  const text = dialog.message();
  assert.match(text, message, `原生确认文案异常：${text}`);
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await actionPromise;
  return text;
}

async function readMutationFingerprint(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const mapJson = JSON.stringify(app.map);
    const semanticJson = JSON.stringify(app.map, (key, value) => key === "timing" || key === "stale" ? undefined : value);
    return {
      map: fingerprint(mapJson),
      semanticMap: fingerprint(semanticJson),
      history: app.editHistory.getStats(),
      selection: app.selectionStore.getSnapshot(),
      mode: app.canvasToolModes.getActive()
    };
    function fingerprint(text) {
      let first = 2166136261;
      let second = 5381;
      for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        first = Math.imul(first ^ code, 16777619);
        second = Math.imul(second, 33) ^ code;
      }
      return `${text.length}:${first >>> 0}:${second >>> 0}`;
    }
  });
}

async function readBaselineMapDiff(page) {
  return page.evaluate(() => {
    const before = window.__dangerPolicyMapBaseline;
    const after = window.__webglGeneratorApp.map;
    const output = [];
    visit(before, after, "map");
    return output;

    function visit(left, right, path) {
      if (output.length >= 30 || Object.is(left, right)) return;
      if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
        output.push({path, before: summarize(left), after: summarize(right)});
        return;
      }
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        if (output.length >= 30) break;
        if (!Object.prototype.hasOwnProperty.call(left, key) || !Object.prototype.hasOwnProperty.call(right, key)) {
          output.push({path: `${path}.${key}`, before: summarize(left[key]), after: summarize(right[key])});
          continue;
        }
        visit(left[key], right[key], `${path}.${key}`);
      }
    }
    function summarize(value) {
      if (Array.isArray(value)) return `[Array(${value.length})]`;
      if (value && typeof value === "object") return `{${Object.keys(value).slice(0, 8).join(",")}}`;
      return value;
    }
  });
}

async function readStorage(page, keys) {
  return page.evaluate(storageKeys => Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])), keys);
}

async function objectExists(page, kind, id) {
  return page.evaluate(({kind, id}) => {
    const map = window.__webglGeneratorApp.map;
    if (kind === "state") return Boolean(map.politics.states[id] && !map.politics.states[id].removed);
    if (kind === "province") return Boolean(map.politics.provinces[id] && !map.politics.provinces[id].removed);
    if (kind === "city") return Boolean(map.settlements.cities[id] && !map.settlements.cities[id].removed);
    if (kind === "culture") return Boolean(map.society.cultures[id] && !map.society.cultures[id].removed);
    if (kind === "religion") return Boolean(map.society.religions[id] && !map.society.religions[id].removed);
    if (kind === "route") return Boolean(map.settlements.routes.find(item => Number(item?.id ?? item?.i) === id && !item.removed));
    if (kind === "river") return Boolean(map.rivers.rivers.find(item => Number(item?.id ?? item?.i) === id && !item.removed));
    if (kind === "lake") return Boolean(map.pack.features.find(item => item?.type === "lake" && Number(item?.id ?? item?.i) === id && !item.removed));
    return false;
  }, {kind, id});
}

async function reloadReady(page) {
  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180000);
}

function unwrap(result, label) {
  if (!result?.ok) throw new Error(`${label}：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
  return result.data;
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) return response.writeHead(404).end("Not found");
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
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
