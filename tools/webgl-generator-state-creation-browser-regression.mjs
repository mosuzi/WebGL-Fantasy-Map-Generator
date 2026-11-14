#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5595, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.setDefaultTimeout(180000);
const errors = [];
const dialogs = [];
page.on("pageerror", error => { errors.push(error.message); console.log("pageerror:", error.message); });
page.on("console", message => {if (message.type() === "error" && !message.text().startsWith("[FMG health]")) {errors.push(message.text()); console.log("console-error:", message.text());}});
page.on("dialog", async dialog => {dialogs.push(dialog.message()); await dialog.dismiss();});

try {
  console.log("stage:open");
  await page.goto("http://127.0.0.1:5595/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  console.log("stage:domcontentloaded");
  await waitForApiReady(page, 30000);
  console.log("stage:ready");
  const cellsTarget = process.argv.includes("--100k") ? 100000 : 3000;
  const generated = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({confirm: true, seed: `state-creation-${target}`, cellsTarget: target}), cellsTarget);
  console.log("stage:generated", generated.ok);
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  await waitForApiReady(page, 180000);
  console.log("stage:map-ready");
  await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("states"));
  const operationStart = await page.evaluate(() => performance.now());
  const sample = await page.evaluate(() => {
    const map = window.__webglGeneratorApp.map;
    const capitalProvinces = new Set(map.politics.states.filter(state => state?.capital).map(state => map.pack.burgs[state.capital]?.province));
    const cells = map.grid.cells;
    const ordinary = Array.from(cells.i).find(cell => cells.h[cell] >= 20 && cells.state[cell] > 0 && !capitalProvinces.has(cells.province[cell]));
    const state = map.politics.states.find(item => item?.capital && map.pack.burgs[item.capital]?.cell >= 0);
    const capital = state ? map.pack.cells.g[map.pack.burgs[state.capital].cell] : null;
    return {ordinary, capital, oldStateId: state?.i ?? state?.id};
  });
  assert.ok(Number.isInteger(sample.ordinary), JSON.stringify(sample));
  const profile = await page.evaluate(gridCell => {
    const app = window.__webglGeneratorApp;
    const stages = [];
    const restore = [];
    const wrap = (object, key, label) => {
      const original = object?.[key];
      if (typeof original !== "function") return;
      object[key] = function (...args) {
        const startedAt = performance.now();
        try {return original.apply(this, args);} finally {stages.push({label, ms: Math.round((performance.now() - startedAt) * 10) / 10});}
      };
      restore.push(() => {object[key] = original;});
    };
    wrap(app.editHistory, "execute", "history.execute");
    wrap(app.editRefreshScheduler, "run", "refresh.run");
    for (const key of ["refreshPoliticalVisualCaches", "refreshLineLayers", "refreshCellSurface", "refreshLabels", "refreshPointLayers", "refreshObjectPickingIndex", "draw"]) wrap(app.renderer, key, key);
    const before = app.editHistory.getStats().undo;
    const startedAt = performance.now();
    const result = window.webglGeneratorApi.edit.states.add(gridCell);
    const wallMs = Math.round((performance.now() - startedAt) * 10) / 10;
    restore.reverse().forEach(fn => fn());
    return {result, before, after: app.editHistory.getStats().undo, wallMs, stages};
  }, sample.ordinary);
  console.log("stage:profiled", profile.wallMs, profile.result.ok, JSON.stringify(profile.result.data?.error || profile.result.error || profile.result.data?.result));
  assert.equal(profile.result.ok, true, JSON.stringify(profile.result.error));
  assert.equal(profile.result.data?.executed, true, JSON.stringify(profile.result.data));
  const visualColor = await page.evaluate(stateId => {
    const {map, renderer} = window.__webglGeneratorApp;
    return {color: map.politics.states[stateId]?.color,
      palette: [...renderer.cellAttributeStore.snapshot.palettes.states.slice((stateId + 1) * 4, (stateId + 2) * 4)],
      glError: renderer.gl.getError()};
  }, profile.result.data?.result?.stateId);
  assert.deepEqual(visualColor.palette.slice(0, 3), [1, 3, 5].map(index => Number.parseInt(visualColor.color.slice(index, index + 2), 16)),
    "新国家颜色应写入正式 GPU 国家色表");
  assert.equal(visualColor.glError, 0);
  await page.waitForFunction(id => Boolean(document.querySelector(`.state-label[data-label-target-id="${id}"]`)),
    profile.result.data?.result?.stateId);
  const labelStyles = await page.evaluate(({createdId, originalId}) => {
    const read = id => {
      const node = document.querySelector(`.state-label[data-label-target-id="${id}"]`);
      if (!node) return null;
      const style = getComputedStyle(node);
      return {selected: node.classList.contains("selected"), color: style.color, textShadow: style.textShadow,
        fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, stroke: style.webkitTextStroke};
    };
    return {created: read(createdId), original: read(originalId)};
  }, {createdId: profile.result.data?.result?.stateId, originalId: sample.oldStateId});
  assert.ok(labelStyles.created?.selected && labelStyles.original && !labelStyles.original.selected,
    `新增国家应已选中且旧国未选中：${JSON.stringify(labelStyles)}`);
  const textStyle = ({selected, ...style}) => style;
  assert.deepEqual(textStyle(labelStyles.created), textStyle(labelStyles.original),
    "新增国家选中态应沿用统一国家标签的文字样式");
  const capitalProfile = await page.evaluate(gridCell => {
    const app = window.__webglGeneratorApp;
    const oldStateId = app.map.grid.cells.state[gridCell];
    const oldCapital = app.map.politics.states[oldStateId].capital;
    const startedAt = performance.now();
    const result = window.webglGeneratorApi.edit.states.add(gridCell);
    const wallMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const newStateId = result.data?.result?.stateId;
    const state = app.map.politics.states[newStateId];
    return {result, wallMs, oldStateId, oldCapital, newStateId, newCapital: state?.capital,
      replacementCapital: app.map.politics.states[oldStateId].capital,
      color: state?.color, neighborColors: state?.neighbors?.map(id => app.map.politics.states[id]?.color)};
  }, sample.capital);
  console.log("stage:capital-profiled", capitalProfile.wallMs, capitalProfile.result.ok);
  assert.equal(capitalProfile.result.ok, true, JSON.stringify(capitalProfile.result.error));
  assert.equal(capitalProfile.newCapital, capitalProfile.oldCapital);
  assert.notEqual(capitalProfile.replacementCapital, capitalProfile.oldCapital);
  assert.ok(capitalProfile.neighborColors.every(color => color?.toLowerCase() !== capitalProfile.color?.toLowerCase()));
  const deleteProfile = await page.evaluate(stateId => {
    const app = window.__webglGeneratorApp;
    const stages = [];
    const restore = [];
    const wrap = (object, key) => {
      const original = object?.[key];
      if (typeof original !== "function") return;
      object[key] = function (...args) {
        const startedAt = performance.now();
        try {return original.apply(this, args);} finally {stages.push({key, ms: Math.round((performance.now() - startedAt) * 10) / 10});}
      };
      restore.push(() => {object[key] = original;});
    };
    wrap(app.editHistory, "execute");
    wrap(app.editRefreshScheduler, "run");
    for (const key of ["refreshPointLayers", "refreshObjectPickingIndex", "refreshEditedCellColors", "refreshLabels", "draw"]) wrap(app.renderer, key);
    const startedAt = performance.now();
    const result = window.webglGeneratorApi.edit.states.delete(stateId);
    const wallMs = Math.round((performance.now() - startedAt) * 10) / 10;
    restore.reverse().forEach(fn => fn());
    return {result, wallMs, stages};
  }, capitalProfile.newStateId);
  console.log("stage:delete-profiled", deleteProfile.wallMs, deleteProfile.result.ok);
  assert.equal(deleteProfile.result.ok, true, JSON.stringify(deleteProfile.result.error));
  const largeDelete = await page.evaluate(stateId => {
    const app = window.__webglGeneratorApp;
    const beforeCells = Array.from(app.map.grid.cells.state).filter(id => id === stateId).length;
    const beforeCapital = app.map.politics.states[stateId]?.capital;
    const startedAt = performance.now();
    const result = window.webglGeneratorApi.edit.states.delete(stateId);
    return {result, wallMs: Math.round((performance.now() - startedAt) * 10) / 10, beforeCells, beforeCapital};
  }, sample.oldStateId);
  console.log("stage:large-delete-profiled", largeDelete.wallMs, largeDelete.result.ok);
  assert.equal(largeDelete.result.ok, true, JSON.stringify(largeDelete.result.error));
  const undoDelete = await page.evaluate(async stateId => {
    const result = await window.webglGeneratorApi.history.undo();
    const app = window.__webglGeneratorApp;
    return {result, capital: app.map.politics.states[stateId]?.capital,
      cells: Array.from(app.map.grid.cells.state).filter(id => id === stateId).length};
  }, sample.oldStateId);
  assert.equal(undoDelete.result.ok, true, JSON.stringify(undoDelete.result.error));
  assert.equal(undoDelete.capital, largeDelete.beforeCapital);
  assert.equal(undoDelete.cells, largeDelete.beforeCells);
  const apiOperationEnd = await page.evaluate(() => performance.now());
  let uiActionStart = null;
  let uiClickEnd = null;
  let uiUndoStart = null;
  let uiUndoEnd = null;
  let uiStages = [];
  if (cellsTarget === 3000 || cellsTarget === 100000) {
    await page.evaluate(stateId => {
      const app = window.__webglGeneratorApp;
      app.panels.state.setTargetStateId(stateId);
      app.panels.state.open(app.map, app.editHistory.getStats());
    }, sample.oldStateId);
    const panel = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
    await panel.waitFor({state: "visible"});
    await panel.locator('[data-action-id="StatePanel:delete"]').click();
    const target = await page.evaluate(stateId => {
      const app = window.__webglGeneratorApp;
      const canvas = app.renderer.canvas;
      const rect = canvas.getBoundingClientRect();
      for (const cell of app.map.grid.cells.i) {
        if (app.map.grid.cells.state[cell] !== stateId) continue;
        const point = app.map.grid.points[app.map.grid.cells.p?.[cell]] || app.map.grid.points[cell];
        if (!point) continue;
        const screen = app.renderer.worldToScreen(point[0], point[1], rect);
        const x = rect.left + screen.x;
        const y = rect.top + screen.y;
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue;
        if (document.elementFromPoint(x, y) !== canvas) continue;
        const picked = app.renderer.pickClientPoint(x, y);
        if (app.map.grid.cells.state[picked?.gridCell] === stateId) return {x, y};
      }
      return null;
    }, sample.oldStateId);
    assert.ok(target, "国家删除模式应有未被面板遮挡的画布落点");
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const stages = [];
      const restores = [];
      for (const [object, key, label] of [
        [app.renderer, "pickClientPoint", "pickClientPoint"],
        [app.editHistory, "execute", "history.execute"],
        [app.editRefreshScheduler, "run", "refresh.run"],
        [app.renderer, "refreshObjectPickingIndex", "picking"],
        [app.renderer, "draw", "draw"],
        [app.panels.state, "setTargetStateId", "panel.target"],
        [app.panels.state, "update", "panel.state.update"],
        [app.selectionStore, "batch", "selection.batch"],
        [app.selectionStore, "clear", "selection.clear"],
        [app.canvasToolModes, "complete", "tool.complete"]
      ]) {
        if (typeof object?.[key] !== "function") continue;
        const original = object[key];
        object[key] = function (...args) {
          const start = performance.now();
          try {return original.apply(this, args);} finally {stages.push({label, ms: Math.round((performance.now() - start) * 10) / 10});}
        };
        restores.push(() => {object[key] = original;});
      }
      for (const [name, panel] of Object.entries(app.panels)) {
        if (name === "state" || typeof panel?.update !== "function") continue;
        const original = panel.update;
        panel.update = function (...args) {
          const start = performance.now();
          try {return original.apply(this, args);} finally {stages.push({label: `panel.${name}.update`, ms: Math.round((performance.now() - start) * 10) / 10});}
        };
        restores.push(() => {panel.update = original;});
      }
      window.__stateUiProfile = {stages, restore: () => restores.reverse().forEach(fn => fn())};
    });
    uiActionStart = await page.evaluate(() => performance.now());
    await page.mouse.click(target.x, target.y);
    uiClickEnd = await page.evaluate(() => performance.now());
    uiStages = await page.evaluate(() => {
      const profile = window.__stateUiProfile;
      profile.restore();
      return profile.stages;
    });
    assert.equal(dialogs.length, 0, "画布删除国家不应弹出确认框");
    assert.equal(await page.evaluate(id => Boolean(window.__webglGeneratorApp.map.politics.states[id]), sample.oldStateId), false);
    uiUndoStart = await page.evaluate(() => performance.now());
    const uiUndo = await page.evaluate(() => window.webglGeneratorApi.history.undo());
    uiUndoEnd = await page.evaluate(() => performance.now());
    assert.equal(uiUndo.ok, true);
    console.log("stage:ui-delete-undone");
  }
  await page.waitForTimeout(120);
  const health = await page.evaluate(({start, apiEnd, uiStart}) => window.__webglGeneratorApp.healthMonitor.getEvents()
    .filter(item => /long-task|stall/.test(item.type)
      && ((Number(item.detail?.startTime || 0) >= start && Number(item.detail?.startTime || 0) <= apiEnd)
        || (uiStart !== null && Number(item.detail?.startTime || 0) >= uiStart))).slice(-12),
  {start: operationStart, apiEnd: apiOperationEnd, uiStart: uiActionStart});
  console.log(JSON.stringify({cellsTarget, sample, uiTimings: {click: uiClickEnd === null ? null : uiClickEnd - uiActionStart, undo: uiUndoEnd === null ? null : uiUndoEnd - uiUndoStart, uiActionStart, uiClickEnd, uiUndoStart, uiUndoEnd}, uiStages, ordinary: {wallMs: profile.wallMs, stages: profile.stages},
    capital: {wallMs: capitalProfile.wallMs, oldCapital: capitalProfile.oldCapital, newCapital: capitalProfile.newCapital,
      replacementCapital: capitalProfile.replacementCapital, color: capitalProfile.color, neighborColors: capitalProfile.neighborColors},
    deleted: {wallMs: deleteProfile.wallMs, stages: deleteProfile.stages, executed: deleteProfile.result.data?.executed,
      requiresConfirm: deleteProfile.result.data?.preview?.requiresConfirm},
    largeDelete: {wallMs: largeDelete.wallMs, cells: largeDelete.beforeCells, capitalRestored: undoDelete.capital === largeDelete.beforeCapital},
    health, dialogs, errors}, null, 2));
  assert.ok(health.every(event => Number(event.detail?.durationMs || 0) <= 200), "建国与删除不应出现超过 200ms 的 LongTask");
  if (cellsTarget === 3000) {
    const customStyle = await page.evaluate(({createdId, originalId}) => {
      const api = window.webglGeneratorApi;
      const updated = api.edit.labels.setStyle("state", {color: "#943b57", shadowColor: "#293038", shadowOffsetX: 1, shadowOffsetY: 2, shadowBlur: 3});
      if (!updated.ok) throw new Error(JSON.stringify(updated.error));
      const selected = api.selection.select({kind: "state", id: createdId});
      if (!selected.ok) throw new Error(JSON.stringify(selected.error));
      const read = id => {
        const node = document.querySelector(`.state-label[data-label-target-id="${id}"]`);
        const style = getComputedStyle(node);
        return {color: style.color, shadow: style.textShadow, font: style.fontFamily, stroke: style.webkitTextStroke};
      };
      return {created: read(createdId), original: read(originalId)};
    }, {createdId: profile.result.data?.result?.stateId, originalId: sample.oldStateId});
    assert.equal(customStyle.created.color, "rgb(148, 59, 87)");
    assert.deepEqual(customStyle.created.color, customStyle.original.color);
    assert.deepEqual(customStyle.created.shadow, customStyle.original.shadow);
    const located = await page.evaluate(id => {
      const selected = window.webglGeneratorApi.selection.select({kind: "state", id});
      if (!selected.ok) return selected;
      return window.webglGeneratorApi.selection.locate({kind: "state", id});
    }, sample.oldStateId);
    assert.equal(located.ok, true, JSON.stringify(located.error));
    await page.evaluate(() => window.__webglGeneratorApp.panelManager.close("state-panel"));
    await page.waitForTimeout(250);
    await page.screenshot({path: join(root, "docs/generated/screenshots/task-408-state-label-selection.png")});
    const styleRoundtrip = await page.evaluate(async ({createdId, originalId}) => {
      const api = window.webglGeneratorApi;
      const read = id => {
        const node = document.querySelector(`.state-label[data-label-target-id="${id}"]`);
        const style = getComputedStyle(node);
        return {color: style.color, shadow: style.textShadow};
      };
      const before = read(createdId);
      const undone = await api.history.undo();
      const afterUndo = read(createdId);
      const redone = await api.history.redo();
      const afterRedo = read(createdId);
      const exported = api.data.exportMap({download: false, includeText: true});
      const imported = exported.ok ? await api.data.importMap(exported.data.text, {confirm: true}) : exported;
      return {before, afterUndo, afterRedo, restored: imported.ok ? read(createdId) : null,
        original: imported.ok ? read(originalId) : null, undoOk: undone.ok, redoOk: redone.ok,
        exportOk: exported.ok, importOk: imported.ok};
    }, {createdId: profile.result.data?.result?.stateId, originalId: sample.oldStateId});
    assert.equal(styleRoundtrip.undoOk && styleRoundtrip.redoOk && styleRoundtrip.exportOk && styleRoundtrip.importOk,
      true, JSON.stringify(styleRoundtrip));
    assert.notDeepEqual(styleRoundtrip.afterUndo, styleRoundtrip.before, "撤销应恢复原国家标签样式");
    assert.deepEqual(styleRoundtrip.afterRedo, styleRoundtrip.before, "重做应恢复自定义国家标签样式");
    assert.deepEqual(styleRoundtrip.restored, styleRoundtrip.before, "保存回读应保持新国家标签样式");
    assert.deepEqual(styleRoundtrip.original, styleRoundtrip.before, "保存回读后新旧国家仍共用标签样式");
  }
} finally {
  await browser.close();
  await server.httpServer.close();
}
