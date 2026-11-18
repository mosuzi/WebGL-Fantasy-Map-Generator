#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdtemp} from "node:fs/promises";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5595, strictPort: true}, logLevel: "error"});
const profile = await mkdtemp(join(process.env.TEMP || tmpdir(), "fmg-natural-visual-"));
const context = await chromium.launchPersistentContext(profile, {channel: "chrome", headless: true, viewport: {width: 1360, height: 900}});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (message.type() === "error") errors.push(message.text());});
const history = () => page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);

try {
  await page.goto("http://127.0.0.1:5595/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  const generated = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "natural-visual-edit", cellsTarget: 10000}));
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  await waitForApiReady(page, 120000);
  errors.length = 0;
  await page.evaluate(() => {
    window.__naturalVisualLongTasks = [];
    window.__naturalVisualPhases = [];
    new PerformanceObserver(list => window.__naturalVisualLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration})))).observe({type: "longtask", buffered: false});
  });
  const markPhase = label => page.evaluate(name => window.__naturalVisualPhases.push({name, time: performance.now()}), label);
  const injectDisplayFailureOnce = () => page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const coordinator = app.mapWorkerCoordinator;
    const renderer = app.renderer;
    const setVisualThemeGpuResident = renderer.setVisualThemeGpuResident;
    const failOnce = () => {
      app.mapWorkerCoordinator = coordinator;
      renderer.setVisualThemeGpuResident = setVisualThemeGpuResident;
      const error = new Error("主题显示故障注入");
      error.code = "injected_display_failure";
      return Promise.reject(error);
    };
    app.mapWorkerCoordinator = {...coordinator, run(name, ...args) {
      if (name === "render.prepare") {
        return failOnce();
      }
      return coordinator.run(name, ...args);
    }};
    renderer.setVisualThemeGpuResident = function () { return failOnce(); };
  });
  const canvasHash = label => page.evaluate(label => {
    const renderer = window.__webglGeneratorApp.renderer;
    const gl = renderer.gl;
    renderer.draw({updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false});
    const pixels = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
    gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2166136261;
    let nonzero = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      hash = Math.imul(hash ^ pixels[index], 16777619);
      if (pixels[index]) nonzero++;
    }
    const snapshots = window.__naturalVisualCanvasSnapshots ||= {};
    const before = snapshots.before;
    let changed = 0;
    const samples = [];
    if (before) {
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === before[index] && pixels[index + 1] === before[index + 1]
          && pixels[index + 2] === before[index + 2] && pixels[index + 3] === before[index + 3]) continue;
        changed++;
        if (samples.length < 8) samples.push({x: (index / 4) % renderer.canvas.width,
          y: Math.floor(index / 4 / renderer.canvas.width), from: [...before.subarray(index, index + 4)], to: [...pixels.subarray(index, index + 4)]});
      }
    }
    snapshots[label] = pixels;
    return {hash: (hash >>> 0).toString(16), nonzero, changed, samples};
  }, label);
  const zoneTextureFingerprint = () => page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const start = renderer.mapEdgeFadeVertexCount * 6;
    const end = renderer.politicalLineRange?.start || start;
    const values = renderer.lineVertices.subarray(start, end);
    let hash = 2166136261;
    for (let index = 0; index < values.length; index++) hash = Math.imul(hash ^ Math.round(values[index] * 100000), 16777619);
    return `${values.length}:${(hash >>> 0).toString(16)}`;
  });

  const collections = {state: "politics.states", province: "politics.provinces", culture: "society.cultures",
    religion: "society.religions", zone: "zones.zones", city: "settlements.cities", marker: "markers.markers"};
  const hosts = {state: "StatePanel", province: "ProvincePanel", culture: "CulturePanel", religion: "ReligionPanel",
    zone: "ZonePanel", city: "CityPanel", marker: "MarkerPanel"};
  const selectedObject = (kind, field) => page.evaluate(({path, id, field}) => {
    const collection = path.split(".").reduce((value, key) => value?.[key], window.__webglGeneratorApp.map);
    return field.split(".").reduce((value, key) => value?.[key], collection.find(item => item && String(item.id ?? item.i) === id));
  }, {path: collections[kind], id: String(selectedIds[kind]), field});
  const selectedIds = {};
  async function openPanel(kind) {
    await page.evaluate(name => {
      const app = window.__webglGeneratorApp;
      const panel = app.panels[name];
      if (name === "state") panel.open(app.map, app.editHistory.getStats());
      else panel.open(app.map, app.selection, app.editHistory.getStats());
    }, kind);
    const panel = page.locator(`.floating-panel[data-panel-id="${kind}-panel"]:not(.hidden)`);
    await panel.waitFor();
    const row = panel.locator('.object-table-row[data-row-key]:not([data-row-key="n:0"])').first();
    await row.click();
    const rowKey = await panel.locator('.object-table-row[aria-current="true"]').first().getAttribute("data-row-key");
    assert.ok(rowKey?.startsWith("n:"), `${kind} 表格点击后未选中对象`);
    selectedIds[kind] = rowKey.slice(2);
    return panel;
  }
  async function closeEditor(dialog, kind) {
    await dialog.getByRole("button", {name: "关闭二级编辑面板"}).click();
    await page.evaluate(name => window.__webglGeneratorApp.panelManager.close(`${name}-panel`), kind);
  }
  async function chooseSelect(dialog, className) {
    const field = dialog.locator(`.${className}`);
    const choice = await field.locator("select").evaluate(select => {
      const current = select.value;
      const next = [...select.options].find(option => option.value !== current && !option.disabled && !option.value.startsWith("type:"));
      return next ? {value: next.value, label: next.textContent.trim()} : null;
    });
    assert.ok(choice, `${className} 缺少另一项可选值`);
    await field.locator(".el-select").click();
    await page.locator(".el-select-dropdown__item:visible").filter({hasText: choice.label}).first().click();
    return choice;
  }

  const colors = {state: "#a12b3c", province: "#b23c4d", culture: "#c34d5e", religion: "#d45e6f", zone: "#e56f7a"};
  const colorResults = {};
  for (const [kind, color] of Object.entries(colors)) {
    if (process.argv.includes("--province-only") && kind !== "province") continue;
    if (kind === "zone") {
      for (const layer of ["zones", "zoneEvents", "zoneNatural"]) {
        const layerResult = await page.evaluate(name => window.webglGeneratorApi.layers.setVisible(name, true), layer);
        assert.equal(layerResult.ok, true, JSON.stringify(layerResult.error));
      }
      await page.waitForFunction(() => !window.__webglGeneratorApp.runtimeOperationSnapshot?.busy);
    }
    await markPhase(`color:${kind}`);
    const panel = await openPanel(kind);
    const colorField = kind === "zone" ? "hexColor" : "color";
    const before = await selectedObject(kind, colorField);
    const zoneBeforeTexture = kind === "zone" ? await zoneTextureFingerprint() : null;
    const undoBefore = await history();
    await panel.locator(`[data-action-id="${hosts[kind]}:${kind === "zone" ? "style" : "color"}"]`).click();
    const dialog = page.getByRole("dialog", {name: kind === "zone" ? "调整样式" : "调整颜色"});
    const field = dialog.locator(`.${kind}-color-field`);
    assert.equal(await field.getByRole("button", {name: "应用颜色"}).count(), 0, `${kind} 颜色仍要求额外应用`);
    const hex = field.locator(".ui-hsl-hex-field input");
    await hex.fill(before?.toLowerCase() === color ? "#334455" : color);
    await hex.press("Tab");
    const expected = before?.toLowerCase() === color ? "#334455" : color;
    try {
      await page.waitForFunction(({path, id, expected}) => {
        const collection = path.split(".").reduce((value, key) => value?.[key], window.__webglGeneratorApp.map);
        const object = collection.find(item => item && String(item.id ?? item.i) === id);
        return (object?.hexColor || object?.color)?.toLowerCase() === expected;
      }, {path: collections[kind], id: String(selectedIds[kind]), expected}, {timeout: 7000});
    } catch (error) {
      const diagnostic = {kind, id: selectedIds[kind], before, expected, after: await selectedObject(kind, colorField),
        input: await hex.inputValue(), focused: await hex.evaluate(input => document.activeElement === input),
        preview: await field.locator(".ui-hsl-color-header strong").textContent(),
        currentRow: await panel.locator('.object-table-row[aria-current="true"]').first().getAttribute("data-row-key").catch(() => null),
        packColor: await page.evaluate(({kind, id}) => kind === "province" ? window.__webglGeneratorApp.map.pack.provinces[Number(id)]?.color : null, {kind, id: selectedIds[kind]}),
        indexColor: await page.evaluate(({kind, id}) => kind === "province" ? window.__webglGeneratorApp.map.politics.provinces[Number(id)]?.color : null, {kind, id: selectedIds[kind]}),
        changedIds: await page.evaluate(({kind, expected}) => kind === "province" ? window.__webglGeneratorApp.map.politics.provinces.filter(item => item?.color?.toLowerCase() === expected).map(item => item.i ?? item.id) : [], {kind, expected}),
        history: await history(), errors, status: await page.locator("#status-message").textContent().catch(() => "")};
      throw new Error(`颜色宿主诊断：${JSON.stringify(diagnostic)}`, {cause: error});
    }
    assert.equal(await history(), undoBefore + 1, `${kind} 一次颜色选择应只形成一条历史`);
    colorResults[kind] = {id: selectedIds[kind], before, after: expected};
    if (kind === "state") {
      const presetHistory = await history();
      await hex.fill("#123456");
      await field.getByRole("button", {name: "选择 #c94c4c"}).click();
      await page.waitForFunction(id => window.__webglGeneratorApp.map.politics.states.find(item => String(item?.id ?? item?.i) === id)?.color?.toLowerCase() === "#c94c4c",
        String(selectedIds.state));
      assert.equal(await history(), presetHistory + 1, "点击预设色不应先提交 HEX 草稿再提交预设色");
      colorResults.state.preset = "#c94c4c";
      const dragHistory = await history();
      await hex.fill("#112233");
      const presetBox = await field.getByRole("button", {name: "选择 #d7a84f"}).boundingBox();
      const headerBox = await field.locator(".ui-hsl-color-header").boundingBox();
      await page.mouse.move(presetBox.x + presetBox.width / 2, presetBox.y + presetBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
      await page.mouse.up();
      await hex.press("Tab");
      await page.waitForFunction(id => window.__webglGeneratorApp.map.politics.states.find(item => String(item?.id ?? item?.i) === id)?.color?.toLowerCase() === "#112233",
        String(selectedIds.state));
      assert.equal(await history(), dragHistory + 1, "预设按钮拖出后 HEX 失焦仍应提交");
    }
    const zoneAfterColorTexture = kind === "zone" ? await zoneTextureFingerprint() : null;
    if (kind === "zone") assert.notEqual(zoneAfterColorTexture, zoneBeforeTexture, "地区改色应更新正式 GPU 纹理顶点");
    if (kind === "zone") {
      await markPhase("visual:zone-pattern");
      const patternBefore = await selectedObject(kind, "pattern");
      const patternHistory = await history();
      const chosen = await chooseSelect(dialog, "zone-pattern-select");
      await page.waitForFunction(({id, value}) => window.__webglGeneratorApp.map.zones.zones.find(item => String(item?.id ?? item?.i) === id)?.pattern === value,
        {id: String(selectedIds.zone), value: chosen.value});
      assert.notEqual(chosen.value, patternBefore);
      assert.equal(await history(), patternHistory + 1, "地区纹理选择应立即形成一条历史");
      colorResults.zone.pattern = chosen.value;
      const zoneAfterPatternTexture = await zoneTextureFingerprint();
      assert.notEqual(zoneAfterPatternTexture, zoneAfterColorTexture, "地区纹理选择应更新正式 GPU 纹理顶点");
      colorResults.zone.textureFingerprints = {before: zoneBeforeTexture, color: zoneAfterColorTexture, pattern: zoneAfterPatternTexture};
    }
    await closeEditor(dialog, kind);
    if (kind === "zone") {
      await page.evaluate(() => window.webglGeneratorApi.history.undo());
      assert.equal(await zoneTextureFingerprint(), colorResults.zone.textureFingerprints.color, "撤销地区纹理应恢复改色后的 GPU 顶点");
      await page.evaluate(() => window.webglGeneratorApi.history.undo());
      assert.equal(await zoneTextureFingerprint(), colorResults.zone.textureFingerprints.before, "撤销地区改色应恢复原 GPU 顶点");
      await page.evaluate(() => window.webglGeneratorApi.history.redo());
      await page.evaluate(() => window.webglGeneratorApi.history.redo());
      assert.equal(await zoneTextureFingerprint(), colorResults.zone.textureFingerprints.pattern, "重做地区样式应恢复最终 GPU 顶点");
    }
  }

  await markPhase("visual:city-silhouette");
  const cityPanel = await openPanel("city");
  const cityBefore = await selectedObject("city", "visual.silhouette");
  const cityHistory = await history();
  await cityPanel.locator('[data-action-id="CityPanel:visual"]').click();
  const cityDialog = page.getByRole("dialog", {name: "调整剪影"});
  assert.equal(await cityDialog.getByRole("button", {name: "应用剪影"}).count(), 0);
  const cityChoice = await chooseSelect(cityDialog, "city-visual-select");
  await page.waitForFunction(({id, value}) => window.__webglGeneratorApp.map.settlements.cities.find(item => String(item?.id ?? item?.i) === id)?.visual?.silhouette === value,
    {id: String(selectedIds.city), value: cityChoice.value});
  assert.notEqual(cityChoice.value, cityBefore);
  assert.equal(await history(), cityHistory + 1);
  await closeEditor(cityDialog, "city");

  await markPhase("visual:marker-symbol");
  const markerPanel = await openPanel("marker");
  const markerHistory = await history();
  await markerPanel.locator('[data-action-id="MarkerPanel:visual"]').click();
  const markerDialog = page.getByRole("dialog", {name: "调整图标"});
  assert.equal(await markerDialog.getByRole("button", {name: "应用图标"}).count(), 0);
  const markerSymbol = await chooseSelect(markerDialog, "marker-visual-select:first-of-type");
  await page.waitForFunction(({id, value}) => window.__webglGeneratorApp.map.markers.markers.find(item => String(item?.id ?? item?.i) === id)?.visual?.symbol === value,
    {id: String(selectedIds.marker), value: markerSymbol.value});
  assert.equal(await history(), markerHistory + 1);
  await markPhase("visual:marker-palette");
  const markerPalette = await chooseSelect(markerDialog, "marker-visual-select:last-of-type");
  await page.waitForFunction(({id, value}) => window.__webglGeneratorApp.map.markers.markers.find(item => String(item?.id ?? item?.i) === id)?.visual?.palette === value,
    {id: String(selectedIds.marker), value: markerPalette.value});
  assert.equal(await history(), markerHistory + 2);
  await closeEditor(markerDialog, "marker");

  await markPhase("theme:create");
  await page.evaluate(() => {
    window.__naturalVisualToasts = [];
    document.addEventListener("webgl-generator-map-toast-change", event => {
      if (event.detail?.visible) window.__naturalVisualToasts.push({text: document.getElementById("map-toast")?.textContent, tone: event.detail?.tone});
    });
    const renderer = window.__webglGeneratorApp.renderer;
    window.__naturalVisualProfile = [];
    for (const name of ["setVisualTheme", "setVisualThemeGpuResident", "refreshCellSurface", "refreshLineLayers", "refreshLabels", "refreshGpuResidentShoreSurface", "refreshVisualThemeLineColors", "draw"]) {
      const original = renderer[name];
      if (typeof original !== "function") continue;
      renderer[name] = function (...args) {
        const started = performance.now();
        const context = name === "setVisualTheme" ? {args, captureDepth: this.workerRenderMutationCaptureDepth,
          suspended: this.workerRenderInstallSuspended, applyingDeferred: this.workerRenderInstallApplyingDeferred,
          currentTheme: this.visualTheme?.id} : null;
        try { return original.apply(this, args); }
        finally { window.__naturalVisualProfile.push({name, duration: Math.round((performance.now() - started) * 10) / 10, context}); }
      };
    }
  });
  await page.locator("#open-generation-panel").click();
  await page.locator('[data-control-tab="themes"]').click();
  await page.locator("#create-user-visual-theme").click();
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app.map.visualTheme?.preset?.startsWith("user-")
      && app.renderer.visualTheme?.id === app.map.visualTheme.preset
      && !app.runtimeOperationSnapshot?.busy;
  }, null, {timeout: 15000});
  const themeOriginalColor = await page.evaluate(() => window.__webglGeneratorApp.map.visualTheme.userThemes
    .find(theme => theme.id === window.__webglGeneratorApp.map.visualTheme.preset).colors.land.toLowerCase());
  const themeBeforePixels = await canvasHash("before");
  const themeBeforeSecondPixels = await canvasHash("before-second");
  const themeBeforeThirdPixels = await canvasHash("before-third");
  const themeBeforeFourthPixels = await canvasHash("before-fourth");
  await page.locator('[data-action-id="ControlPanel:color"]').click();
  const themeDialog = page.getByRole("dialog", {name: "编辑主题颜色"});
  const themeField = themeDialog.locator(".visual-theme-shared-color-field");
  assert.equal(await themeField.getByRole("button", {name: "应用颜色"}).count(), 0);
  const themeBefore = await history();
  await markPhase("theme:color");
  const themeColorStartedAt = Date.now();
  await themeField.locator(".ui-hsl-hex-field input").fill("#8f6b32");
  await themeField.locator(".ui-hsl-hex-field input").press("Tab");
  try {
    await page.waitForFunction(() => {
      const app = window.__webglGeneratorApp;
      const preset = app.map.visualTheme?.preset;
      return preset?.startsWith("user-") && app.renderer.visualTheme?.id === preset
        && app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#8f6b32"
        && app.renderer.visualTheme?.land?.fill?.slice(0, 3).every((channel, index) => Math.round(channel * 255) === [143, 107, 50][index])
        && !app.runtimeOperationSnapshot?.busy;
    }, null, {timeout: 10000});
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({mapTheme: window.__webglGeneratorApp.map.visualTheme?.preset,
      rendererTheme: window.__webglGeneratorApp.renderer.visualTheme?.id,
      mapColor: window.__webglGeneratorApp.map.visualTheme?.userThemes?.find(theme => theme.id === window.__webglGeneratorApp.map.visualTheme?.preset)?.colors?.land,
      rendererColor: window.__webglGeneratorApp.renderer.visualTheme?.land?.fill,
      hex: document.querySelector(".visual-theme-shared-color-field .ui-hsl-color-header strong")?.textContent,
      busy: window.__webglGeneratorApp.runtimeOperationSnapshot,
      worker: window.__webglGeneratorApp.lastDisplayRenderWorker?.operation,
      toasts: window.__naturalVisualToasts}));
    throw new Error(`主题显示诊断：${JSON.stringify({...diagnostic, history: await history(), errors})}`, {cause: error});
  }
  assert.equal(await history(), themeBefore + 1, "用户主题颜色应立即形成一条历史");
  const themeColorVisibleMs = Date.now() - themeColorStartedAt;
  const themeColorDisplay = await page.evaluate(() => {
    const last = window.__webglGeneratorApp.lastDisplayRenderWorker;
    return {localGpu: last?.localGpu === true, workerMode: last?.worker?.mode || "", timings: last?.timings || null};
  });
  const themeAfterPixels = await canvasHash("after");
  assert.ok(themeAfterPixels.nonzero > 0 && themeBeforePixels.nonzero > 0, `正式画布像素读取为空：${JSON.stringify({themeBeforePixels, themeAfterPixels})}`);
  assert.notEqual(themeAfterPixels.hash, themeBeforePixels.hash, "同 ID 主题改色须改变正式画布像素");
  await markPhase("theme:undo");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  await page.waitForFunction(original => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    const current = app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase();
    const rendered = app.renderer.visualTheme?.land?.fill?.slice(0, 3).map(value => Math.round(value * 255));
    const expected = [1, 3, 5].map(offset => Number.parseInt(original.slice(offset, offset + 2), 16));
    return current === original && JSON.stringify(rendered) === JSON.stringify(expected) && !app.runtimeOperationSnapshot?.busy;
  }, themeOriginalColor, {timeout: 15000});
  const themeUndoPixels = await canvasHash("undo");
  const themeUndoSecondPixels = await canvasHash("undo-second");
  const themeUndoThirdPixels = await canvasHash("undo-third");
  const themeUndoFourthPixels = await canvasHash("undo-fourth");
  const themeShore = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    return {surfaceKey: renderer.gpuResidentSmoothShoreSurfaceKey,
      surfaceCounts: [renderer.landCorrectionVertexCount, renderer.waterCorrectionVertexCount, renderer.landCoverVertexCount, renderer.waterCoverVertexCount],
      lineCount: renderer.shoreLineVertexCount};
  });
  const sameStateNoise = Math.max(themeBeforeSecondPixels.changed, themeBeforeThirdPixels.changed, themeBeforeFourthPixels.changed);
  assert.ok(themeUndoFourthPixels.changed <= sameStateNoise * 2,
    `撤销应恢复主题画面像素至同态波动内：${JSON.stringify({themeBeforePixels, themeBeforeSecondPixels, themeBeforeThirdPixels, themeBeforeFourthPixels, themeAfterPixels, themeUndoPixels, themeUndoSecondPixels, themeUndoThirdPixels, themeUndoFourthPixels, themeShore})}`);
  await markPhase("theme:redo");
  await page.evaluate(() => window.webglGeneratorApi.history.redo());
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    return app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#8f6b32"
      && app.renderer.visualTheme?.land?.fill?.slice(0, 3).every((value, index) => Math.round(value * 255) === [143, 107, 50][index])
      && !app.runtimeOperationSnapshot?.busy;
  }, null, {timeout: 15000});
  const themeRedoPixels = await canvasHash("redo");
  assert.ok(themeRedoPixels.changed > themeAfterPixels.changed * 0.9, "重做应重新改变大片正式画布像素");

  const beforeFailureHistory = await history();
  await injectDisplayFailureOnce();
  await markPhase("theme:failure-retry");
  await themeField.locator(".ui-hsl-hex-field input").fill("#6f4f21");
  await themeField.locator(".ui-hsl-hex-field input").press("Tab");
  try { await page.waitForFunction(expectedHistory => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    return !app.runtimeOperationSnapshot?.busy && app.runtimeOperationSnapshot?.last?.status === "failure"
      && app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#8f6b32"
      && app.editHistory.getStats().undo === expectedHistory;
  }, beforeFailureHistory, {timeout: 15000}); }
  catch (error) {
    const diagnostic = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const preset = app.map.visualTheme?.preset;
      return {preset, color: app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land,
        rendererId: app.renderer.visualTheme?.id, rendererColor: app.renderer.visualTheme?.land?.fill,
        operation: app.runtimeOperationSnapshot, history: app.editHistory.getStats(),
        health: app.healthMonitor?.getEvents?.(20)?.filter(item => /operation|visual-theme/i.test(item.type)),
        toast: document.querySelector("#map-toast")?.textContent,
        failedCode: app.lastDisplayRenderWorker?.operation};
    });
    throw new Error(`主题故障注入诊断：${JSON.stringify({diagnostic, beforeFailureHistory, errors})}`, {cause: error});
  }
  assert.deepEqual(await page.evaluate(() => window.__webglGeneratorApp.renderer.visualTheme.land.fill.slice(0, 3).map(value => Math.round(value * 255))),
    [143, 107, 50], "主题显示失败后 renderer 应保留原颜色");
  assert.ok(errors.some(message => message.includes("operation-failed")), "故障注入应记录一次可诊断失败");
  errors.length = 0;
  await themeField.locator(".ui-hsl-hex-field input").fill("#6f4f21");
  await themeField.locator(".ui-hsl-hex-field input").press("Enter");
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    const color = app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase();
    return color === "#6f4f21"
      && app.renderer.visualTheme?.land?.fill?.slice(0, 3).every((value, index) => Math.round(value * 255) === [111, 79, 33][index])
      && !app.runtimeOperationSnapshot?.busy;
  }, null, {timeout: 15000});
  assert.equal(await history(), beforeFailureHistory + 1, "失败后同值重试应只提交一次有效历史");

  const beforeUndoFailureHistory = await history();
  await injectDisplayFailureOnce();
  await markPhase("theme:undo-failure");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  await page.waitForFunction(expected => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    return !app.runtimeOperationSnapshot?.busy && app.runtimeOperationSnapshot?.last?.status === "failure"
      && app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#6f4f21"
      && app.editHistory.getStats().undo === expected && app.editHistory.getStats().redo === 0;
  }, beforeUndoFailureHistory, {timeout: 15000});
  assert.deepEqual(await page.evaluate(() => window.__webglGeneratorApp.renderer.visualTheme.land.fill.slice(0, 3).map(value => Math.round(value * 255))),
    [111, 79, 33], "撤销显示失败后应恢复撤销前颜色");
  assert.ok(errors.some(message => message.includes("operation-failed")), "撤销故障注入应记录失败");
  errors.length = 0;
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  await page.waitForFunction(expected => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    return !app.runtimeOperationSnapshot?.busy
      && app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#8f6b32"
      && app.renderer.visualTheme.land.fill.slice(0, 3).every((value, index) => Math.round(value * 255) === [143, 107, 50][index])
      && app.editHistory.getStats().undo === expected - 1 && app.editHistory.getStats().redo === 1;
  }, beforeUndoFailureHistory, {timeout: 15000});

  await injectDisplayFailureOnce();
  await markPhase("theme:redo-failure");
  await page.evaluate(() => window.webglGeneratorApi.history.redo());
  await page.waitForFunction(expected => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    return !app.runtimeOperationSnapshot?.busy && app.runtimeOperationSnapshot?.last?.status === "failure"
      && app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#8f6b32"
      && app.editHistory.getStats().undo === expected - 1 && app.editHistory.getStats().redo === 1;
  }, beforeUndoFailureHistory, {timeout: 15000});
  assert.deepEqual(await page.evaluate(() => window.__webglGeneratorApp.renderer.visualTheme.land.fill.slice(0, 3).map(value => Math.round(value * 255))),
    [143, 107, 50], "重做显示失败后应恢复重做前颜色");
  assert.ok(errors.some(message => message.includes("operation-failed")), "重做故障注入应记录失败");
  errors.length = 0;
  await page.evaluate(() => window.webglGeneratorApi.history.redo());
  await page.waitForFunction(expected => {
    const app = window.__webglGeneratorApp;
    const preset = app.map.visualTheme?.preset;
    return !app.runtimeOperationSnapshot?.busy
      && app.map.visualTheme.userThemes.find(theme => theme.id === preset)?.colors?.land?.toLowerCase() === "#6f4f21"
      && app.renderer.visualTheme.land.fill.slice(0, 3).every((value, index) => Math.round(value * 255) === [111, 79, 33][index])
      && app.editHistory.getStats().undo === expected && app.editHistory.getStats().redo === 0;
  }, beforeUndoFailureHistory, {timeout: 15000});

  await themeDialog.getByRole("button", {name: "关闭二级编辑面板"}).click();
  const firstThemeId = await page.evaluate(() => window.__webglGeneratorApp.map.visualTheme.preset);
  const createdSecond = await page.evaluate(() => window.webglGeneratorApi.layers.createTheme());
  assert.equal(createdSecond.ok, true, JSON.stringify(createdSecond.error));
  await page.waitForFunction(first => {
    const app = window.__webglGeneratorApp;
    return app.map.visualTheme.preset !== first && app.renderer.visualTheme.id === app.map.visualTheme.preset
      && !app.runtimeOperationSnapshot?.busy;
  }, firstThemeId, {timeout: 15000});
  const secondThemeId = await page.evaluate(() => window.__webglGeneratorApp.map.visualTheme.preset);
  const switchedBack = await page.evaluate(id => window.webglGeneratorApi.layers.setTheme(id), firstThemeId);
  assert.equal(switchedBack.ok, true, JSON.stringify(switchedBack.error));
  await page.waitForFunction(({first, second}) => {
    const app = window.__webglGeneratorApp;
    return app.renderer.visualTheme.id === first && app.map.visualTheme.preset === second
      && !app.runtimeOperationSnapshot?.busy;
  }, {first: firstThemeId, second: secondThemeId}, {timeout: 15000});
  const beforeCrossThemeFailure = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {preset: app.map.visualTheme.preset, renderer: app.renderer.visualTheme.id,
      themes: JSON.stringify(app.map.visualTheme.userThemes), undo: app.editHistory.getStats().undo,
      color: app.map.visualTheme.userThemes.find(theme => theme.id === app.renderer.visualTheme.id).colors.land.toLowerCase()};
  });
  await page.locator('[data-action-id="ControlPanel:color"]').click();
  await injectDisplayFailureOnce();
  await markPhase("theme:cross-preset-failure");
  await themeField.locator(".ui-hsl-hex-field input").fill("#ad4c21");
  await themeField.locator(".ui-hsl-hex-field input").press("Tab");
  await page.waitForFunction(before => {
    const app = window.__webglGeneratorApp;
    return !app.runtimeOperationSnapshot?.busy && app.runtimeOperationSnapshot?.last?.status === "failure"
      && app.renderer.visualTheme.id === before.renderer && app.map.visualTheme.preset === before.preset
      && JSON.stringify(app.map.visualTheme.userThemes) === before.themes
      && app.editHistory.getStats().undo === before.undo;
  }, beforeCrossThemeFailure, {timeout: 15000});
  assert.ok(errors.some(message => message.includes("operation-failed")), "跨主题故障注入应记录失败");
  errors.length = 0;
  await injectDisplayFailureOnce();
  await markPhase("theme:rapid-failure");
  const rapidEdits = await page.evaluate(id => {
    const api = window.webglGeneratorApi;
    return [api.layers.updateTheme(id, {land: "#ab4c22"}), api.layers.updateTheme(id, {land: "#a94a20"})];
  }, firstThemeId);
  assert.ok(rapidEdits.every(result => result.ok), JSON.stringify(rapidEdits));
  await page.waitForFunction(before => {
    const app = window.__webglGeneratorApp;
    return !app.runtimeOperationSnapshot?.busy && app.runtimeOperationSnapshot?.last?.status === "failure"
      && app.renderer.visualTheme.id === before.renderer && app.map.visualTheme.preset === before.preset
      && JSON.stringify(app.map.visualTheme.userThemes) === before.themes
      && app.editHistory.getStats().undo === before.undo;
  }, beforeCrossThemeFailure, {timeout: 15000});
  assert.ok(errors.some(message => message.includes("operation-failed")), "连续编辑故障注入应记录失败");
  errors.length = 0;

  const health = await page.evaluate(() => {
    const values = window.__naturalVisualLongTasks;
    const longTasks = values.filter(value => value.duration > 150).map(value => ({duration: Math.round(value.duration),
      phase: window.__naturalVisualPhases.filter(item => item.time <= value.startTime).at(-1)?.name || "unmarked"}));
    return {count: values.length, maxMs: Math.max(0, ...values.map(value => value.duration)), over200: values.filter(value => value.duration > 200).length, longTasks,
      profile: window.__naturalVisualProfile?.filter(item => item.duration > 5).sort((a, b) => b.duration - a.duration).slice(0, 12),
      lastOperation: window.__webglGeneratorApp.runtimeOperationSnapshot?.last,
      lastDisplayWorker: window.__webglGeneratorApp.lastDisplayRenderWorker?.operation,
      workerHealth: window.__webglGeneratorApp.healthMonitor?.getEvents?.(30)?.filter(event => /worker|display|operation-failed/i.test(event.type)),
      webglError: window.__webglGeneratorApp.renderer.gl.getError()};
  });
  assert.equal(health.over200, 0, JSON.stringify(health));
  assert.equal(health.webglError, 0);
  assert.deepEqual(errors, [], JSON.stringify(health));
  console.log(JSON.stringify({ok: true, colors: colorResults, city: cityChoice.value, marker: {symbol: markerSymbol.value, palette: markerPalette.value}, themeColorVisibleMs, themeColorDisplay, health}));
} finally {
  await context.close();
  await server.httpServer.close();
}
