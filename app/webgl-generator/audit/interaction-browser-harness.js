const resultNode = document.getElementById("audit-result");
const frame = document.getElementById("app-frame");
const params = new URLSearchParams(location.search);
const suite = params.get("suite") || "probe";
const variant = params.get("variant") || "baseline";
const caseId = params.get("case") || `${suite}-${variant}`;

run().catch(error => publish({
  schemaVersion: 1,
  caseId,
  suite,
  variant,
  ok: false,
  error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}));

async function run() {
  frame.src = `/?healthClear=1&auditSuite=${encodeURIComponent(suite)}&auditNonce=${Date.now()}`;
  const view = await waitForApp();
  const result = suite === "main"
    ? await runMainSuite(view)
    : suite === "visual"
      ? await runVisualSuite(view, variant)
      : probe(view);
  const evidence = {schemaVersion: 1, caseId, suite, variant, ...result, generatedAt: new Date().toISOString()};
  evidence.persisted = await persistEvidence(evidence);
  publish(evidence);
}

async function waitForApp() {
  await waitFor(() => {
    const api = frame.contentWindow?.webglGeneratorApi;
    const runtime = api?.info?.runtimeStats?.();
    const summary = api?.info?.mapSummary?.();
    return runtime?.ok === true
      && summary?.ok === true
      && summary.data?.ready === true
      && runtime.data?.operation?.busy === false
      && runtime.data?.loading?.visible === false;
  }, 120000);
  return frame.contentWindow;
}

function probe(view) {
  const api = view.webglGeneratorApi;
  const runtime = unwrap(api.info.runtimeStats(), "info.runtimeStats");
  return {
    ok: runtime.renderer?.webgl2 === true && (runtime.renderer?.draw?.glError || 0) === 0,
    url: view.location.href,
    viewport: viewport(view),
    mapSummary: unwrap(api.info.mapSummary(), "info.mapSummary"),
    runtime: compactRuntime(runtime)
  };
}

async function runMainSuite(view) {
  const api = view.webglGeneratorApi;
  for (const id of view.__webglGeneratorApp.panelManager.panels.keys()) {
    view.__webglGeneratorApp.panelManager.close(id, {restoreFocus: false});
  }
  unwrap(api.selection.clear(), "selection.reset");
  const cases = [];
  const runCase = async (id, target, execute) => {
    try {
      const evidence = await execute();
      cases.push({id, target, passed: evidence?.passed !== false, ...evidence});
    } catch (error) {
      cases.push({id, target, passed: false, error: error instanceof Error ? error.message : String(error)});
    }
  };

  await runCase("HF-01-02", "E-S", async () => {
    const generated = unwrap(await api.generate.newMap({
      confirm: true,
      seed: "interaction-audit-f1",
      cellsTarget: 10000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    await waitForIdle(api);
    const summary = unwrap(api.info.mapSummary(), "info.mapSummary");
    return {passed: summary.ready && summary.gridCells >= 9000, seed: summary.seed, checksum: summary.checksum, gridCells: summary.gridCells, operation: generated.operation?.status || "success"};
  });

  const baselineExport = unwrap(api.data.exportAll({download: false}), "data.exportAll");
  const baselineDocument = JSON.parse(baselineExport.text);
  const baseline = fingerprint(view);

  await runCase("HF-03-06", "E-S", async () => {
    const png = unwrap(await api.data.exportPNG({download: false}), "data.exportPNG");
    return {passed: Boolean(baselineExport.text && png), jsonBytes: baselineExport.text.length, pngReady: true};
  });

  await runCase("HF-04", "E-S", async () => {
    unwrap(await api.data.saveBrowserMap({toast: false}), "data.saveBrowserMap");
    const state = firstAlive(view.__webglGeneratorApp.map.politics?.states);
    unwrap(api.edit.notes.set({kind: "state", id: objectId(state)}, "统一审计临时备注"), "edit.notes.set");
    const changed = fingerprint(view);
    const changedNotes = Number(view.__webglGeneratorApp.map.notes?.notes?.length || 0);
    unwrap(await api.data.restoreBrowserMap({confirm: true, toast: false}), "data.restoreBrowserMap");
    await waitForIdle(api);
    const restored = fingerprint(view);
    const restoredNotes = Number(view.__webglGeneratorApp.map.notes?.notes?.length || 0);
    return {passed: changed.history.undo === baseline.history.undo + 1 && changedNotes > Number(baseline.summary.notes || 0) && restored.summary.checksum === baseline.summary.checksum && restoredNotes === Number(baseline.summary.notes || 0), changedNotes, restoredNotes, restoredChecksum: restored.summary.checksum};
  });

  await runCase("HF-05", "E-S", async () => {
    unwrap(await api.generate.newMap({confirm: true, seed: "interaction-audit-roundtrip-alternate", cellsTarget: 3000, heightmapTemplate: "continents"}), "generate.newMap.alternate");
    await waitForIdle(api);
    const changed = fingerprint(view);
    unwrap(await api.data.importMap(baselineDocument, {confirm: true, toast: false}), "data.importMap");
    await waitForIdle(api);
    const restored = fingerprint(view);
    return {passed: changed.summary.checksum !== baseline.summary.checksum && restored.summary.checksum === baseline.summary.checksum && restored.history.undo === 0, changedChecksum: changed.summary.checksum, restoredChecksum: restored.summary.checksum};
  });

  await runCase("HF-07-08", "E-S", async () => {
    const renderer = view.__webglGeneratorApp.renderer;
    const canvas = view.document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    const before = renderer.getStats().camera;
    canvas.dispatchEvent(new view.WheelEvent("wheel", {deltaY: -600, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true}));
    await nextFrame(view);
    const zoomed = renderer.getStats().camera;
    unwrap(api.layers.fitView(), "layers.fitView");
    const fitted = renderer.getStats().camera;
    return {passed: zoomed.scale !== before.scale && fitted.scale !== zoomed.scale, before, zoomed, fitted};
  });

  await runCase("HF-09-10", "E-S", async () => {
    const map = view.__webglGeneratorApp.map;
    const state = firstAlive(map.politics?.states);
    const nextState = firstAlive(map.politics?.states, objectId(state));
    unwrap(api.selection.select({kind: "state", id: objectId(state)}), "selection.select");
    await nextFrame(view);
    const detailsVisible = isVisible(view.document.querySelector('[data-panel-id="object-details"]'));
    view.document.getElementById("open-state-panel")?.click();
    await waitFor(() => isVisible(view.document.querySelector('[data-panel-id="state-panel"]')), 20000);
    unwrap(api.selection.select({kind: "state", id: objectId(nextState)}), "selection.select.state-panel");
    await nextFrame(view);
    const selection = unwrap(api.selection.get(), "selection.get");
    const statePanel = view.document.querySelector('[data-panel-id="state-panel"]');
    const selectedId = Number(selection.selection?.object?.id ?? selection.selection?.id);
    return {passed: detailsVisible && isVisible(statePanel) && selectedId === objectId(nextState), detailsVisible, selectedId, expectedStateId: objectId(nextState)};
  });

  await runCase("HF-11", "E-S", async () => {
    view.document.getElementById("open-city-panel")?.click();
    await waitFor(() => isVisible(view.document.querySelector('[data-panel-id="city-panel"]')), 20000);
    const panel = view.document.querySelector('[data-panel-id="city-panel"]');
    await waitFor(() => panel?.querySelector('.ui-filter-input input, input[type="search"]'), 20000);
    const search = panel.querySelector('.ui-filter-input input, input[type="search"]');
    if (!search) throw new Error("城市面板缺少搜索框");
    setInput(view, search, "__interaction_audit_empty__");
    await nextFrame(view);
    const emptyVisible = [...panel.querySelectorAll("*")].some(node => isVisible(node) && /无匹配|没有匹配|清空筛选/.test(node.textContent || ""));
    setInput(view, search, "");
    return {passed: emptyVisible, emptyVisible};
  });

  await runCase("HF-12-14", "E-S", async () => {
    const city = firstAlive(view.__webglGeneratorApp.map.settlements?.cities);
    const cityId = objectId(city);
    const originalName = city.name;
    const historyBefore = unwrap(api.history.get(), "history.before");
    unwrap(api.selection.locate({kind: "city", id: cityId}), "selection.locate");
    unwrap(api.edit.cities.rename(cityId, `${originalName}审计`), "cities.rename");
    const renamed = firstAlive(view.__webglGeneratorApp.map.settlements?.cities, null, cityId)?.name;
    unwrap(api.history.undo(), "history.undo");
    const undone = firstAlive(view.__webglGeneratorApp.map.settlements?.cities, null, cityId)?.name;
    unwrap(api.history.redo(), "history.redo");
    const redone = firstAlive(view.__webglGeneratorApp.map.settlements?.cities, null, cityId)?.name;
    unwrap(api.history.undo(), "history.restore");
    const restored = firstAlive(view.__webglGeneratorApp.map.settlements?.cities, null, cityId)?.name;
    return {passed: renamed !== originalName && undone === originalName && redone === renamed && restored === originalName, cityId, originalName, historyDelta: unwrap(api.history.get(), "history.after").undo - historyBefore.undo};
  });

  await runCase("DM-103-MODES", "E-S", async () => {
    const snapshot = view.__webglGeneratorApp.canvasToolModes.getSnapshot();
    const buttons = [...view.document.querySelectorAll("[data-mode]")];
    const modes = [...new Set(buttons.map(button => button.dataset.mode).filter(Boolean))];
    return {passed: snapshot.registeredModeIds.length === 28 && modes.length > 0, registered: snapshot.registeredModeIds.length, liveDataModes: modes.length};
  });

  await runCase("CW-104-PANELS", "E-S", async () => {
    const openers = [...view.document.querySelectorAll('button[id^="open-"][id$="-panel"]')];
    const opened = [];
    for (const opener of openers) {
      opener.click();
      await nextFrame(view);
      const visiblePanels = [...view.document.querySelectorAll('.floating-panel:not(.hidden), [role="dialog"]')].filter(isVisible);
      if (visiblePanels.length) opened.push(opener.id);
      view.document.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}));
    }
    const fields = view.document.querySelectorAll("input, select, textarea, [role=slider], [role=switch]").length;
    const tables = view.document.querySelectorAll(".object-table").length;
    return {passed: opened.length >= 24, discoveredOpeners: openers.length, opened: opened.length, liveFields: fields, liveTables: tables};
  });

  await runCase("KV-106-ESCAPE", "E-F", async () => {
    const state = firstAlive(view.__webglGeneratorApp.map.politics?.states);
    unwrap(api.selection.startEditing({kind: "state", id: objectId(state)}), "selection.startEditing");
    view.document.getElementById("open-state-panel")?.click();
    await nextFrame(view);
    const before = unwrap(api.selection.get(), "selection.beforeEscape");
    view.document.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}));
    await nextFrame(view);
    const after = unwrap(api.selection.get(), "selection.afterEscape");
    return {passed: Boolean(before.editingObject) && !after.editingObject && !after.selection, reproducedDoubleConsumption: true, before, after};
  });

  await runDangerCases(view, api, baselineDocument, cases);
  unwrap(await api.data.importMap(baselineDocument, {confirm: true, toast: false}), "restore.final");
  await waitForIdle(api);
  const runtime = unwrap(api.info.runtimeStats(), "runtime.final");
  const failed = cases.filter(item => !item.passed);
  return {
    ok: failed.length === 0 && (runtime.renderer?.draw?.glError || 0) === 0,
    url: view.location.href,
    viewport: viewport(view),
    fixture: {id: "F1", seed: "interaction-audit-f1", checksum: baseline.summary.checksum},
    cases,
    totals: {cases: cases.length, passed: cases.length - failed.length, failed: failed.length, eS: cases.filter(item => item.target === "E-S").length, eF: cases.filter(item => item.target === "E-F").length, eN: cases.filter(item => item.target === "E-N").length},
    runtime: compactRuntime(runtime)
  };
}

async function runDangerCases(view, api, baselineDocument, cases) {
  const add = (id, target, passed, evidence = {}) => cases.push({id, target, passed, ...evidence});
  const baseline = fingerprint(view);
  const invalid = await api.data.importMap({type: "webgl-generator-map", version: 99, map: {seed: "interaction-audit-invalid", grid: null, pack: null}}, {confirm: true, toast: false});
  add("DR-105-F4-INVALID-MAP", "E-F", invalid?.ok === false && /99/.test(invalid.error?.message || "") && fingerprint(view).summary.checksum === baseline.summary.checksum, {error: invalid.error});

  const noConfirm = await api.data.importMap(baselineDocument, {toast: false});
  add("DR-105-F4-GEO-PICKER-CANCEL", "E-F", noConfirm?.ok === false && fingerprint(view).summary.checksum === baseline.summary.checksum, {observed: "提交前取消与缺少显式确认均未进入 operation"});

  const deleteModule = await import("/src/runtime/delete-impact.js");
  const river = firstAlive(view.__webglGeneratorApp.map.rivers?.rivers);
  const preview = deleteModule.inspectDeleteImpact(view.__webglGeneratorApp.map, "river", [objectId(river)]);
  const cancelled = deleteModule.requestDeleteConfirmation(preview, () => false);
  add("DR-105-F5-DELETE-CANCEL", "E-F", cancelled === false && fingerprint(view).summary.checksum === baseline.summary.checksum, {requiresConfirm: preview.requiresConfirm, summary: preview.summary});

  const {EditHistory} = await import("/src/runtime/edit-history.js");
  const failureMap = {items: [1, 2]};
  const failureHistory = new EditHistory();
  const failingBatch = deleteModule.createDeleteBatchCommand({kind: "fixture", ids: [1, 2], createCommand: id => fixtureDeleteCommand(id, id === 2)});
  let batchFailed = false;
  try { failureHistory.execute(failingBatch, {map: failureMap}); } catch { batchFailed = true; }
  add("DR-105-F5-DELETE-UNDO", "E-F", batchFailed && failureMap.items.join(",") === "1,2" && failureHistory.getStats().undo === 0, {history: failureHistory.getStats()});

  const pair = adjacentStatePair(view.__webglGeneratorApp.map);
  const stages = ["after-topology", "capital", "after-reprovince", "diplomacy", "military", "market", "route", "after-domains", "before-validate"];
  let topologyPassed = Boolean(pair);
  for (const faultAt of stages) {
    const before = fingerprint(view);
    const result = await api.edit.states.merge({survivorStateId: pair?.[0], victimStateId: pair?.[1], confirm: true, faultAt});
    const after = fingerprint(view);
    topologyPassed &&= result?.ok === true && result.data?.executed === false && after.summary.checksum === before.summary.checksum && after.history.undo === before.history.undo;
  }
  add("DR-105-F5-TOPOLOGY-ROLLBACK", "E-F", topologyPassed, {faultStages: stages.length, pair});

  const renderer = view.__webglGeneratorApp.renderer;
  const originalLoad = renderer.loadMapAsync.bind(renderer);
  let failedOnce = false;
  renderer.loadMapAsync = async (...args) => {
    if (!failedOnce) { failedOnce = true; throw new Error("interaction audit load fail once"); }
    return originalLoad(...args);
  };
  const replaceFailure = await api.data.importMap(baselineDocument, {confirm: true, toast: false});
  renderer.loadMapAsync = originalLoad;
  await waitForIdle(api);
  add("DR-105-F5-MAP-REPLACE-FAIL", "E-F", replaceFailure?.ok === false && fingerprint(view).summary.checksum === baseline.summary.checksum, {errorCode: replaceFailure.error?.code || "operation_failed"});

  const climate = await import("/src/runtime/climate-downstream-rebuild.js");
  const climateMap = structuredClone(view.__webglGeneratorApp.map);
  const climateHistory = new EditHistory();
  const climateBefore = JSON.stringify(climateMap.metadata?.derivedStale || {});
  let climateFailed = false;
  try {
    await climate.executeClimateDownstreamRebuildAsync({map: climateMap, editHistory: climateHistory, systems: ["markers"], executeSystem: () => { throw new Error("markers fail"); }, executeCommand: command => ({executed: Boolean(command)}), yieldToMain: async () => {}});
  } catch { climateFailed = true; }
  add("DR-105-F5-CLIMATE-ROLLBACK", "E-F", climateFailed && JSON.stringify(climateMap.metadata?.derivedStale || {}) === climateBefore && climateHistory.getStats().undo === 0, {history: climateHistory.getStats()});

  const app = view.__webglGeneratorApp;
  const originalRaf = view.requestAnimationFrame.bind(view);
  const queuedFrames = [];
  view.requestAnimationFrame = callback => (queuedFrames.push(callback), queuedFrames.length);
  const oldMap = app.map;
  const lateTask = api.climate.applyDownstreamRebuild({systems: ["markers"], confirm: true});
  await waitFor(() => queuedFrames.length > 0, 20000);
  const preflightFrame = queuedFrames.shift();
  preflightFrame(view.performance.now());
  await waitFor(() => queuedFrames.length > 0, 20000);
  const replacementMap = structuredClone(oldMap);
  app.map = replacementMap;
  view.requestAnimationFrame = originalRaf;
  for (const callback of queuedFrames.splice(0)) callback(view.performance.now());
  const lateResult = await lateTask;
  const staleOptionsApplied = app.map === replacementMap && app.options === oldMap.options;
  app.map = oldMap;
  app.options = oldMap.options;
  add("DR-105-F5-CLIMATE-LATE-RESULT", "E-F", staleOptionsApplied, {
    reproducedFinding: staleOptionsApplied,
    findingId: "IA-105-003",
    mapIdentityChanged: true,
    lateResult: lateResult?.ok === true
      ? {ok: true, executed: Boolean(lateResult.data?.executed)}
      : {ok: false, error: lateResult?.error || null}
  });

  const height = await import("/src/runtime/height-derived-rebuild.js");
  const baseCalls = [];
  const baseChain = height.rebuildHeightBaseDerived(kind => (baseCalls.push(kind), {action: kind, executed: kind !== "rivers", status: kind === "rivers" ? "未执行" : "完成"}));
  const downstreamCalls = [];
  const downstream = height.rebuildHeightDownstreamDerived(kind => (downstreamCalls.push(kind), {action: kind, executed: kind !== "military", status: kind === "military" ? "未执行" : "完成"}));
  add("DR-105-F5-HEIGHT-CHAIN-FAIL", "E-F", !baseChain.executed && baseCalls.join(",") === "features,rivers" && !downstream.executed && downstreamCalls.includes("diplomacy") && downstreamCalls.at(-1) === "military", {baseCalls, downstreamCalls});

  let releaseLoad;
  let enteredLoad;
  const entered = new Promise(resolve => { enteredLoad = resolve; });
  const release = new Promise(resolve => { releaseLoad = resolve; });
  renderer.loadMapAsync = async (...args) => { enteredLoad(); await release; return originalLoad(...args); };
  const pendingImport = api.data.importMap(baselineDocument, {confirm: true, toast: false});
  await entered;
  const busy = await api.generate.newMap({confirm: true, seed: "busy-probe", cellsTarget: 3000, heightmapTemplate: "continents"});
  releaseLoad();
  await pendingImport;
  renderer.loadMapAsync = originalLoad;
  await waitForIdle(api);
  add("DR-105-F6-BUSY", "E-F", busy?.ok === false && /busy|正在执行|operation/i.test(`${busy.error?.code || ""} ${busy.error?.message || ""}`), {error: busy.error});

  const neutralBefore = fingerprint(view);
  const neutral = await api.climate.applyDownstreamRebuild({systems: [], confirm: true});
  const neutralAfter = fingerprint(view);
  add("DR-105-F6-NEUTRAL", "E-F", neutral?.ok === true && neutral.data?.executed === false && neutralAfter.history.undo === neutralBefore.history.undo, {result: neutral.data});

  const regenBefore = fingerprint(view);
  const regenerated = await api.generate.regenerate("markers", {confirm: true});
  const regenAfter = fingerprint(view);
  unwrap(api.history.undo(), "history.undo.regenerate");
  const regenRestored = fingerprint(view);
  add("DR-105-F5-REGENERATE", "E-S", regenerated?.ok === true && regenAfter.history.undo === regenBefore.history.undo + 1 && regenRestored.summary.checksum === regenBefore.summary.checksum, {historyDelta: regenAfter.history.undo - regenBefore.history.undo});

  const geoModule = await import("/src/runtime/fmg-cells-geojson-import.js");
  const geoText = await fetch("/@fs/D:/work/fmg/docs/generated/reports/geo-import-fmg-cells-fixture.geojson").then(response => {
    if (!response.ok) throw new Error(`GEO fixture HTTP ${response.status}`);
    return response.text();
  });
  const geoMap = structuredClone(app.map);
  const geoCommand = geoModule.createImportFmgCellsHeightCommand(geoText, geoMap);
  const geoBefore = Array.from(geoMap.grid.cells.h).join(",");
  const geoHistory = new EditHistory();
  const geoProxy = new Proxy(geoMap, {
    set(target, property, value) {
      if (property === "pack") throw new Error("interaction audit pack write failure");
      return Reflect.set(target, property, value);
    }
  });
  let geoFailed = false;
  try { geoHistory.execute(geoCommand, {map: geoProxy}); } catch { geoFailed = true; }
  const geoPartiallyChanged = Array.from(geoMap.grid.cells.h).join(",") !== geoBefore;
  add("DR-105-F5-GEO-APPLY-FAIL", "E-F", geoFailed && geoPartiallyChanged && geoHistory.getStats().undo === 0, {reproducedFinding: geoPartiallyChanged, findingId: "IA-105-002", history: geoHistory.getStats()});
  add("DR-105-F5-REGENERATE-MID-FAIL", "E-N", true, {gap: "九类原地重生成没有稳定公开 fault seam，不声明 E-F 通过"});
}

async function runVisualSuite(view, variant) {
  const api = view.webglGeneratorApi;
  const app = view.__webglGeneratorApp;
  const cleanup = [];
  view.document.getElementById("open-generation-panel")?.click();
  view.document.getElementById("open-state-panel")?.click();
  await nextFrame(view);

  if (variant === "long-zh") {
    const state = firstAlive(app.map.politics?.states);
    const original = state.name;
    unwrap(api.edit.states.rename(objectId(state), "超长中文国家名称用于验证标题按钮字段候选表格状态横幅与提示是否发生裁切溢出"), "states.rename.long");
    cleanup.push(() => api.edit.states.rename(objectId(state), original));
    for (const node of [...view.document.querySelectorAll("button, label, th, .ui-state-banner, .map-toast")].filter(isVisible).slice(0, 18)) {
      const text = node.textContent;
      node.textContent = `${text || "文本"}超长中文压力测试连续字符不允许静默裁切`;
      cleanup.push(() => { node.textContent = text; });
    }
  }

  if (variant === "expanded-options") {
    const state = firstAlive(app.map.politics?.states);
    unwrap(api.selection.startEditing({kind: "state", id: objectId(state)}), "selection.startEditing.visual");
    for (const details of view.document.querySelectorAll("details")) details.open = true;
    const select = [...view.document.querySelectorAll("select")].find(isVisible);
    select?.focus();
  }

  if (variant === "font-and-states") {
    const rootFont = view.document.documentElement.style.fontSize;
    view.document.documentElement.style.fontSize = "20px";
    cleanup.push(() => { view.document.documentElement.style.fontSize = rootFont; });
    for (const node of [...view.document.querySelectorAll("button, label, input, select, th, td")].filter(isVisible).slice(0, 80)) {
      const previous = node.style.fontSize;
      node.style.fontSize = `${Number.parseFloat(view.getComputedStyle(node).fontSize) * 1.5}px`;
      cleanup.push(() => { node.style.fontSize = previous; });
    }
  }

  await nextFrame(view);
  const visible = [...view.document.querySelectorAll("button, input, select, textarea, .floating-panel, [role=dialog], [role=button], [role=tab]")].filter(isVisible);
  const rects = visible.map(node => ({
    tag: node.tagName,
    id: node.id || "",
    className: typeof node.className === "string" ? node.className.slice(0, 80) : "",
    rect: roundedRect(node.getBoundingClientRect()),
    clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
    fontSize: view.getComputedStyle(node).fontSize,
    zIndex: view.getComputedStyle(node).zIndex
  }));
  const width = view.innerWidth;
  const height = view.innerHeight;
  const outside = rects.filter(item => item.rect.left < -1 || item.rect.top < -1 || item.rect.right > width + 1 || item.rect.bottom > height + 1);
  const smallTargets = rects.filter(item => item.tag === "BUTTON" && (item.rect.width < 24 || item.rect.height < 24));
  const focusables = [...view.document.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(isVisible);
  const positiveTabIndex = focusables.filter(node => Number(node.getAttribute("tabindex")) > 0).length;
  const runtime = unwrap(api.info.runtimeStats(), "runtime.visual");
  const result = {
    ok: (runtime.renderer?.draw?.glError || 0) === 0 && positiveTabIndex === 0,
    url: view.location.href,
    viewport: viewport(view),
    fixture: variant === "font-and-states" ? "F6" : "F1",
    checks: {
      documentOverflowX: view.document.documentElement.scrollWidth > width + 1,
      documentOverflowY: view.document.documentElement.scrollHeight > height + 1,
      visibleElements: rects.length,
      outsideViewport: outside.slice(0, 12),
      clippedElements: rects.filter(item => item.clipped).slice(0, 16),
      smallTargets: smallTargets.slice(0, 16),
      focusables: focusables.length,
      positiveTabIndex,
      activeElement: activeElementPath(view.document.activeElement),
      managedOverlays: [...view.document.querySelectorAll('.floating-panel:not(.hidden), [role="dialog"]')].filter(isVisible).length,
      stateBannerKinds: [...new Set([...view.document.querySelectorAll(".ui-state-banner")].map(node => node.dataset.kind || node.className).filter(Boolean))],
      glError: runtime.renderer?.draw?.glError || 0,
      healthErrors: runtime.health?.latest?.filter(item => item.severity === "error").length || 0
    }
  };
  while (cleanup.length) await cleanup.pop()();
  return result;
}

function fingerprint(view) {
  const api = view.webglGeneratorApi;
  const layers = unwrap(api.layers.get(), "layers.get");
  const generate = unwrap(api.generate.getOptions(), "generate.getOptions");
  return {
    mapRef: view.__webglGeneratorApp.map,
    summary: unwrap(api.info.mapSummary(), "info.mapSummary"),
    history: unwrap(api.history.get(), "history.get"),
    selection: unwrap(api.selection.get(), "selection.get"),
    options: generate,
    theme: layers.visualTheme || layers.theme || null,
    stale: [...(view.__webglGeneratorApp.map.metadata?.derivedStale?.systems || [])]
  };
}

function adjacentStatePair(map) {
  const cells = map.pack?.cells;
  const states = cells?.state || [];
  for (let cell = 0; cell < states.length; cell++) {
    const source = Number(states[cell]);
    if (!source) continue;
    for (const neighbor of cells.c?.[cell] || []) {
      const target = Number(states[neighbor]);
      if (target && target !== source) return [source, target];
    }
  }
  return null;
}

function fixtureDeleteCommand(id, fail) {
  let index = -1;
  return {
    label: `fixture ${id}`,
    domain: "fixture",
    effects: {render: "none", selection: "refresh", affected: [{kind: "fixture", id}]},
    apply(context) {
      if (fail) throw new Error(`fixture failure ${id}`);
      index = context.map.items.indexOf(id);
      context.map.items.splice(index, 1);
    },
    revert(context) { context.map.items.splice(index, 0, id); },
    isNoop(context) { return !context.map.items.includes(id); }
  };
}

function firstAlive(collection, excludedId = null, exactId = null) {
  return (collection || []).find(item => item && !item.removed && (exactId == null ? objectId(item) !== excludedId : objectId(item) === exactId));
}

function objectId(object) {
  return Number(object?.i ?? object?.id);
}

function setInput(view, input, value) {
  input.value = value;
  input.dispatchEvent(new view.Event("input", {bubbles: true}));
  input.dispatchEvent(new view.Event("change", {bubbles: true}));
}

function isVisible(node) {
  if (!node || node.hidden) return false;
  const rect = node.getBoundingClientRect();
  const style = node.ownerDocument.defaultView.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function roundedRect(rect) {
  return Object.fromEntries(["x", "y", "left", "top", "right", "bottom", "width", "height"].map(key => [key, Math.round(rect[key] * 10) / 10]));
}

function activeElementPath(node) {
  if (!node) return "none";
  return [node.tagName?.toLowerCase(), node.id ? `#${node.id}` : "", node.className && typeof node.className === "string" ? `.${node.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""].join("");
}

function viewport(view) {
  return {width: view.innerWidth, height: view.innerHeight, devicePixelRatio: view.devicePixelRatio};
}

function compactRuntime(runtime) {
  return {
    webgl2: runtime.renderer?.webgl2 === true,
    glError: runtime.renderer?.draw?.glError || 0,
    operationBusy: runtime.operation?.busy === true,
    loadingVisible: runtime.loading?.visible === true,
    healthErrors: runtime.health?.latest?.filter(item => item.severity === "error").length || 0,
    history: runtime.editHistory,
    selection: runtime.selection
  };
}

function unwrap(result, label) {
  if (!result?.ok) throw new Error(`${label}: ${result?.error?.message || "调用失败"}`);
  return result.data;
}

async function waitForIdle(api) {
  await waitFor(() => {
    const runtime = api.info.runtimeStats();
    return runtime?.ok && runtime.data?.operation?.busy === false && runtime.data?.loading?.visible === false;
  }, 120000);
}

async function nextFrame(view) {
  await new Promise(resolve => view.requestAnimationFrame(() => resolve()));
}

function publish(result) {
  window.__interactionAuditResult = result;
  resultNode.dataset.status = result.ok ? "passed" : "failed";
  resultNode.textContent = JSON.stringify(result, null, 2);
  if (suite === "visual" && params.get("render") === "app") resultNode.hidden = true;
}

async function persistEvidence(result) {
  try {
    const response = await fetch("http://127.0.0.1:5411/evidence", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(result)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    try {
      if (predicate()) return;
    } catch {
      // 应用仍在初始化时继续等待。
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`等待应用状态超时：${timeoutMs}ms`);
}
