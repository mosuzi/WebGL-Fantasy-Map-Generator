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
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5592, strictPort: true}, logLevel: "error"});
const profile = await mkdtemp(join(process.env.TEMP || tmpdir(), "fmg-quick-input-chrome-"));
const context = await chromium.launchPersistentContext(profile, {channel: "chrome", headless: true, viewport: {width: 1360, height: 900}});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (message.type() === "error") errors.push(message.text());});
const report = {};

try {
  await page.goto("http://127.0.0.1:5592/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  const target = process.argv.includes("--large-only") ? 100000 : 3000;
  const generated = await page.evaluate(cellsTarget => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "enter-submit-regression", cellsTarget}), target);
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  await waitForApiReady(page, 120000);
  errors.length = 0;
  await page.evaluate(() => {
    window.__quickInputLongTasks = [];
    window.__quickInputPhases = [{label: "ready", time: performance.now()}];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__quickInputLongTasks.push({startTime: entry.startTime, duration: entry.duration});
    }).observe({type: "longtask", buffered: false});
  });
  const markPhase = label => page.evaluate(phase => window.__quickInputPhases.push({label: phase, time: performance.now()}), label);
  if (process.argv.includes("--profile-rename")) await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    window.__quickInputProfile = [];
    for (const [name, owner, key] of [
      ["history.execute", app.editHistory, "execute"],
      ["history.undo", app.editHistory, "undo"],
      ["refresh.run", app.editRefreshScheduler, "run"],
      ["renderer.draw", app.renderer, "draw"],
      ["renderer.labels", app.renderer, "refreshLabels"],
      ["selection.refresh", app.selectionStore, "refresh"],
      ["state.update", app.panels.state, "update"]
    ]) {
      const original = owner?.[key];
      if (typeof original !== "function") continue;
      owner[key] = function (...args) {
        const started = performance.now();
        try { return original.apply(this, args); }
        finally { window.__quickInputProfile.push({name, duration: Math.round((performance.now() - started) * 10) / 10}); }
      };
    }
  });

  if (!process.argv.includes("--numeric-only")) {
  const stateId = await page.evaluate(() => window.__webglGeneratorApp.map.politics.states.find(state => state?.id > 0 && !state.removed).id);
  await markPhase("state-panel-opening");
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.state.open(app.map, app.editHistory.getStats());
    app.panels.state.setTargetStateId(id);
  }, stateId);
  const stateName = () => page.evaluate(id => window.__webglGeneratorApp.map.politics.states[id].name, stateId);
  const history = () => page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
  const originalStateName = await stateName();
  const stateHistory = await history();
  const labelBefore = await page.evaluate(id => {
    const labels = window.__webglGeneratorApp.renderer.labelItems;
    const target = labels.find(item => item.targetKind === "state" && Number(item.targetId) === id);
    const other = labels.filter(item => item.targetKind === "state" && Number(item.targetId) !== id && item.visible)
      .sort((a, b) => Math.hypot(b.x - (target?.x ?? 0), b.y - (target?.y ?? 0)) - Math.hypot(a.x - (target?.x ?? 0), a.y - (target?.y ?? 0)))[0];
    window.__quickInputOtherStateLabel = other || null;
    return {targetText: target?.text || null, otherText: other?.text || null, otherVisible: Boolean(other?.visible)};
  }, stateId);
  assert.ok(labelBefore.targetText, "夹具须找到当前国家标签，才能验证改名与撤销");
  assert.equal(labelBefore.otherVisible, true, "夹具须找到另一个原本可见的国家标签，才能验证局部刷新可见性");
  await markPhase("state-panel-opened");
  const stateRenameButton = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)').getByRole("button", {name: "重命名", exact: true});
  await markPhase("rename-opening");
  await stateRenameButton.click();
  await markPhase("rename-opened");
  const stateDialog = page.getByRole("dialog", {name: "重命名"});
  const stateInput = stateDialog.locator(".state-name-editor input");
  await stateInput.waitFor();
  assert.equal(await stateDialog.locator(".ui-secondary-action-title").count(), 0, "单输入弹框不得重复显示标题");
  await page.waitForFunction(() => document.activeElement?.matches?.(".state-name-editor input"));
  assert.equal(await stateInput.evaluate(input => document.activeElement === input), true, "打开重命名应聚焦输入框");
  if (process.argv.includes("--state-only")) await stateDialog.evaluate(dialog => {
    window.__quickInputEnterEvents = [];
    dialog.addEventListener("keydown", event => {
      if (event.key === "Enter") window.__quickInputEnterEvents.push({defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing, value: event.target?.value, visible: dialog.isConnected});
    });
  });
  const compact = await stateDialog.evaluate(dialog => {
    const input = dialog.querySelector(".state-name-editor input");
    const rect = dialog.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return {width: rect.width, height: rect.height,
      textInset: inputRect.left - rect.left + Number.parseFloat(getComputedStyle(input).paddingLeft),
      overflow: dialog.scrollWidth > dialog.clientWidth};
  });
  assert.ok(compact.height <= 64 && compact.textInset <= 24 && !compact.overflow, JSON.stringify(compact));
  if (process.env.FMG_TASK_ARTIFACT_DIR) await stateDialog.screenshot({path: join(process.env.FMG_TASK_ARTIFACT_DIR, `task-424-rename-${target}.png`)});
  assert.equal(await stateDialog.getByRole("button", {name: "应用名称"}).count(), 0);
  await stateInput.dispatchEvent("compositionstart");
  await stateInput.fill("回车测试国");
  await stateInput.press("Enter");
  assert.equal(await stateName(), originalStateName, "输入法选字时不得提交");
  assert.equal(await history(), stateHistory);
  assert.equal(await stateDialog.isVisible(), true, "输入法选字不得关闭弹框");
  await stateInput.dispatchEvent("compositionend");
  await markPhase("rename-commit");
  await stateInput.press("Enter");
  await markPhase("rename-committed");
  if (process.argv.includes("--state-only")) {
    const diagnosis = {stateAfterEnter: await stateName(), history: await history(), dialogVisible: await stateDialog.isVisible(),
      input: await stateDialog.isVisible() ? await stateInput.inputValue() : null,
      events: await page.evaluate(() => window.__quickInputEnterEvents), errors};
    console.log(JSON.stringify(diagnosis));
    assert.equal(diagnosis.stateAfterEnter, "回车测试国", "有效回车没有写入国家名称");
  }
  await page.waitForFunction(id => window.__webglGeneratorApp.map.politics.states[id].name === "回车测试国", stateId);
  const labelAfter = await page.evaluate(id => {
    const renderer = window.__webglGeneratorApp.renderer;
    const target = renderer.labelItems.find(item => item.targetKind === "state" && Number(item.targetId) === id);
    const other = window.__quickInputOtherStateLabel;
    return {targetText: target?.text || null, otherPreserved: !other || renderer.labelItems.includes(other),
      otherVisible: !other || renderer.labelItems.includes(other) && other.visible,
      profile: renderer.lastLabelRefreshProfile};
  }, stateId);
  assert.equal(labelAfter.profile?.politicalOnly, true, "国家改名应局部刷新政治标签");
  assert.equal(labelAfter.profile?.stateIds, 1, "国家改名只刷新目标国家标签");
  assert.ok(labelAfter.targetText?.includes("回车测试国"), "地图国家标签应跟随改名");
  assert.equal(labelAfter.otherPreserved, true, "无关国家标签不应重建");
  assert.equal(labelAfter.otherVisible, true, "远处原本可见的国家标签不应因局部刷新消失");
  await stateDialog.waitFor({state: "hidden"});
  await page.waitForFunction(() => document.activeElement?.dataset?.actionId === "StatePanel:rename");
  assert.equal(await history(), stateHistory + 1, "国家回车只提交一次");
  await stateRenameButton.click();
  await stateInput.press("Enter");
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await history(), stateHistory + 1, "同值回车不写历史");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName, "国家重命名可撤销");
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.renderer.labelItems.find(item => item.targetKind === "state" && Number(item.targetId) === id)?.text, stateId), labelBefore.targetText, "撤销应恢复地图标签");
  const historyAfterUndo = await history();
  await stateRenameButton.click();
  await stateInput.fill("按 Esc 放弃");
  await page.keyboard.press("Escape");
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await stateName(), originalStateName, "Esc 应丢弃草稿");
  await stateRenameButton.click();
  await stateInput.fill("");
  await stateInput.press("Enter");
  assert.equal(await stateName(), originalStateName, "空名称不得覆盖原名");
  assert.equal(await history(), historyAfterUndo, "空名称不写历史");
  assert.equal(await stateDialog.isVisible(), true, "空名称应留在弹框中修正");
  await stateInput.fill("未提交的名称");
  await stateDialog.getByRole("button", {name: "关闭二级编辑面板"}).click();
  assert.equal(await stateName(), originalStateName, "关闭编辑面板丢弃草稿");
  await stateRenameButton.click();
  await stateInput.fill("失效  目标国");
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    window.__quickInputSavedState = app.map.politics.states[id];
    app.map.politics.states[id] = null;
  }, stateId);
  try {
    await stateInput.press("Enter");
    assert.equal(await stateDialog.isVisible(), true, "目标已失效时不得关闭并丢失草稿");
    assert.equal(await stateInput.inputValue(), "失效  目标国");
    assert.equal(await history(), historyAfterUndo, "失效目标不得写历史");
  } finally {
    await page.evaluate(id => {
      const app = window.__webglGeneratorApp;
      app.map.politics.states[id] = window.__quickInputSavedState;
      delete window.__quickInputSavedState;
    }, stateId);
  }
  await stateInput.press("Enter");
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await stateName(), "失效 目标国", "恢复目标后应提交规范化名称");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName);
  await stateRenameButton.click();
  await stateInput.fill(`  ${originalStateName}  `);
  await stateInput.press("Enter");
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await history(), historyAfterUndo, "等价空白名称不写历史");
  await stateRenameButton.click();
  await stateInput.fill("失焦测试国");
  await stateInput.evaluate(input => input.blur());
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await stateName(), "失焦测试国", "有效失焦应提交国家名称");
  assert.equal(await history(), historyAfterUndo + 1, "失焦只提交一次历史");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName, "失焦改名应可撤销");
  await stateRenameButton.click();
  await stateInput.fill("外点测试国");
  await page.mouse.click(5, 5);
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await stateName(), "外点测试国", "点击弹框外应先失焦提交");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName);
  await stateRenameButton.click();
  await stateInput.evaluate(input => input.blur());
  await stateDialog.waitFor({state: "hidden"});
  assert.equal(await history(), historyAfterUndo, "同值失焦不写历史");
  await stateRenameButton.click();
  await stateInput.fill("");
  await stateInput.evaluate(input => input.blur());
  assert.equal(await stateDialog.isVisible(), true, "空名称失焦仍应保留编辑状态");
  assert.equal(await stateName(), originalStateName);
  await stateDialog.getByRole("button", {name: "关闭二级编辑面板"}).click();
  report.state = {composition: true, singleHistory: true, noOp: true, empty: true, undo: true, escape: true, close: true, blur: true, outsideClick: true, rejectedKeepsDraft: true, normalizedName: true, focusReturn: true, compact, labels: labelAfter};
  await markPhase("state-complete");

  if (process.argv.includes("--check-zoom")) {
    const settings = await page.context().newPage();
    let zoomFailure = null;
    try {
      await settings.goto("chrome://settings/appearance");
      await settings.locator("#zoomLevel").selectOption({label: "200%"});
      await page.bringToFront();
      await page.waitForFunction(() => Math.abs(innerWidth - 680) <= 1);
      await stateRenameButton.click();
      const zoomLayout = await stateDialog.evaluate(dialog => {
        const rect = dialog.getBoundingClientRect();
        const input = dialog.querySelector(".state-name-editor input");
        const close = dialog.querySelector(".ui-secondary-action-close");
        return {width: rect.width, height: rect.height, viewport: innerWidth,
          textInset: input.getBoundingClientRect().left - rect.left + Number.parseFloat(getComputedStyle(input).paddingLeft),
          inputValue: input.value, inputVisibility: getComputedStyle(input).visibility, closeVisibility: getComputedStyle(close).visibility,
          overflow: dialog.scrollWidth > dialog.clientWidth, clipped: rect.left < 0 || rect.right > innerWidth};
      });
      assert.ok(!zoomLayout.overflow && !zoomLayout.clipped && zoomLayout.textInset <= 24, JSON.stringify(zoomLayout));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (process.env.FMG_TASK_ARTIFACT_DIR) {
        await page.screenshot({path: join(process.env.FMG_TASK_ARTIFACT_DIR, `task-424-page-zoom200-${target}.png`)});
      }
      await page.keyboard.press("Escape");
      await stateDialog.waitFor({state: "hidden"});
      report.zoom200 = zoomLayout;
    } catch (error) {
      zoomFailure = error;
      throw error;
    } finally {
      if (!settings.isClosed()) {
        await settings.locator("#zoomLevel").selectOption({label: "100%"}).catch(error => {if (!zoomFailure) throw error;});
        if (!page.isClosed()) await page.bringToFront();
        await settings.close();
      }
    }
  }

  if (!process.argv.includes("--state-only")) {
  await markPhase("city-opening");
  const cityId = await page.evaluate(() => window.__webglGeneratorApp.map.settlements.cities.find(city => city && !city.removed).id);
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.city.open(app.map, app.selection, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(id);
  }, cityId);
  const cityBefore = await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].name, cityId);
  const cityHistory = await history();
  await page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden)').getByRole("button", {name: "重命名", exact: true}).click();
  const cityDialog = page.getByRole("dialog", {name: "重命名"});
  const cityInput = cityDialog.locator(".city-name-editor input");
  await cityInput.fill("回车测试城");
  await cityInput.press("Enter");
  await page.waitForFunction(id => window.__webglGeneratorApp.map.settlements.cities[id].name === "回车测试城", cityId);
  await cityDialog.waitFor({state: "hidden"});
  assert.equal(await history(), cityHistory + 1);
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].name, cityId), cityBefore);
  const populationInput = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden) input[aria-label="城市人口（人）"]');
  const populationBefore = await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].population, cityId);
  const populationHistory = await history();
  await populationInput.fill(String(Number(await populationInput.inputValue()) + 111));
  await populationInput.evaluate(input => input.blur());
  await page.waitForFunction(({id, before}) => window.__webglGeneratorApp.map.settlements.cities[id].population !== before, {id: cityId, before: populationBefore});
  assert.equal(await history(), populationHistory + 1, "城市人口失焦只写一次历史");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].population, cityId), populationBefore);
  report.city = {enterAndClose: true, blurPopulation: true, undo: true};

  await markPhase("culture-opening");
  const cultureId = await page.evaluate(() => {
    const culture = window.__webglGeneratorApp.map.society.cultures.find(item => item && !item.removed && Number(item.id ?? item.i) > 0);
    return Number(culture.id ?? culture.i);
  });
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.culture.open(app.map, app.selection, app.editHistory.getStats());
    app.panels.culture.setSelectedCultureId(id);
  }, cultureId);
  const cultureBefore = await page.evaluate(id => window.__webglGeneratorApp.map.society.cultures[id].name, cultureId);
  const cultureHistory = await history();
  await page.locator('.floating-panel[data-panel-id="culture-panel"]:not(.hidden)').getByRole("button", {name: "重命名", exact: true}).click();
  const cultureDialog = page.getByRole("dialog", {name: "重命名"});
  const cultureInput = cultureDialog.locator(".culture-name-editor input");
  await cultureInput.fill("回车测试文化");
  await cultureInput.press("Enter");
  await page.waitForFunction(id => window.__webglGeneratorApp.map.society.cultures[id].name === "回车测试文化", cultureId);
  await cultureDialog.waitFor({state: "hidden"});
  assert.equal(await history(), cultureHistory + 1);
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.society.cultures[id].name, cultureId), cultureBefore);
  report.culture = {enterAndClose: true, undo: true};

  await markPhase("military-opening");
  const regimentTarget = await page.evaluate(() => {
    for (const state of window.__webglGeneratorApp.map.politics.states || []) {
      const regiment = state?.military?.find(item => item && Number.isInteger(Number(item.i)));
      if (state?.i > 0 && regiment) return {stateId: state.i, regimentId: regiment.i, rowId: regiment.id ?? `${state.i}:${regiment.i}`, name: regiment.name};
    }
    return null;
  });
  if (regimentTarget) {
    await page.evaluate(id => {
      const app = window.__webglGeneratorApp;
      app.panels.military.open(app.map, app.selection, app.editHistory.getStats());
      app.panels.military.setSelectedRegimentId(id);
    }, regimentTarget.rowId);
    const militaryPanel = page.locator('.floating-panel[data-panel-id="military-panel"]:not(.hidden)');
    await militaryPanel.getByRole("button", {name: "重命名", exact: true}).click();
    const militaryDialog = page.getByRole("dialog", {name: "重命名"});
    const militaryInput = militaryDialog.locator(".military-name-editor input");
    await militaryInput.fill("回车  测试军团");
    await markPhase("military-commit");
    await militaryInput.press("Enter");
    await militaryDialog.waitFor({state: "hidden"});
    assert.equal(await page.evaluate(({stateId, regimentId}) => window.__webglGeneratorApp.map.politics.states[stateId].military.find(item => item.i === regimentId)?.name, regimentTarget), "回车  测试军团", "军团名称应保留内部空格并关闭");
    await page.evaluate(() => window.webglGeneratorApi.history.undo());
    assert.equal(await page.evaluate(({stateId, regimentId}) => window.__webglGeneratorApp.map.politics.states[stateId].military.find(item => item.i === regimentId)?.name, regimentTarget), regimentTarget.name);
    report.military = {enterAndClose: true, undo: true, internalSpacingPreserved: true};
  } else report.military = {skipped: "当前生成图无军团"};
  await markPhase("military-complete");

  await markPhase("notes-opening");
  const noteCreated = await page.evaluate(({stateId, name}) => window.webglGeneratorApi.edit.notes.set(
    {kind: "state", id: stateId}, "重命名入口验收备注", {name}
  ), {stateId, name: originalStateName});
  assert.equal(noteCreated.ok, true, JSON.stringify(noteCreated.error));
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.notes.open(app.map, app.selection, app.editHistory.getStats());
    app.panels.notes.setSelectedNoteId(`state:${id}`);
  }, stateId);
  const notesPanel = page.locator('.floating-panel[data-panel-id="notes-panel"]:not(.hidden)');
  await notesPanel.getByRole("button", {name: "重命名", exact: true}).click();
  const notesDialog = page.getByRole("dialog", {name: "重命名"});
  const notesInput = notesDialog.locator("[data-ui-text-edit-field] input");
  assert.equal(await notesInput.inputValue(), originalStateName, "关联备注应显示对象当前名称");
  const notesHistory = await history();
  await notesInput.fill("从备注改名国");
  await markPhase("notes-commit");
  await notesInput.press("Enter");
  await notesDialog.waitFor({state: "hidden"});
  assert.equal(await stateName(), "从备注改名国", "从备注重命名应更新关联对象");
  assert.equal(await history(), notesHistory + 1, "从备注重命名只写一次历史");
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.notes.notes.find(note => note.id === `state:${id}`)?.name, stateId), originalStateName, "备注快照保持原始名称以覆盖旧数据反例");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName);
  const labelNoteImported = await page.evaluate(({stateId, name}) => window.webglGeneratorApi.edit.notes.import({
    type: "webgl-generator-notes-summary", version: 1,
    notes: [{id: `label:state:${stateId}`, kind: "label", objectId: `state:${stateId}`, name,
      body: "标签关联备注", format: "plain"}]
  }, {mode: "append"}), {stateId, name: originalStateName});
  assert.equal(labelNoteImported.ok, true, JSON.stringify(labelNoteImported.error));
  await page.evaluate(id => window.__webglGeneratorApp.panels.notes.setSelectedNoteId(`label:state:${id}`), stateId);
  await notesPanel.getByRole("button", {name: "重命名", exact: true}).click();
  assert.equal(await notesInput.inputValue(), originalStateName, "关联标签备注应读取当前目标名称");
  await notesInput.fill("从标签备注改名国");
  await notesInput.press("Enter");
  await notesDialog.waitFor({state: "hidden"});
  assert.equal(await stateName(), "从标签备注改名国", "标签备注应能重命名关联国家");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName);

  const customLabelAdded = await page.evaluate(() => window.webglGeneratorApi.edit.labels.addCustom({text: "旧手工标签", x: 200, y: 200}));
  assert.equal(customLabelAdded.ok, true, JSON.stringify(customLabelAdded.error));
  const customLabelId = await page.evaluate(() => window.__webglGeneratorApp.map.labels.custom.at(-1).id);
  const customNoteImported = await page.evaluate(id => window.webglGeneratorApi.edit.notes.import({
    type: "webgl-generator-notes-summary", version: 1,
    notes: [{id: `label:custom:${id}`, kind: "label", objectId: `custom:${id}`, name: "旧手工标签",
      body: "手工标签关联备注", format: "plain"}]
  }, {mode: "append"}), customLabelId);
  assert.equal(customNoteImported.ok, true, JSON.stringify(customNoteImported.error));
  await page.evaluate(id => window.__webglGeneratorApp.panels.notes.setSelectedNoteId(`label:custom:${id}`), customLabelId);
  await notesPanel.getByRole("button", {name: "重命名", exact: true}).click();
  assert.equal(await notesInput.inputValue(), "旧手工标签");
  await notesInput.fill("手工标签新名");
  await notesInput.press("Enter");
  await notesDialog.waitFor({state: "hidden"});
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.labels.custom.find(item => item.id === id)?.text, customLabelId), "手工标签新名");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.labels.custom.find(item => item.id === id)?.text, customLabelId), "旧手工标签");
  if (regimentTarget) {
    const regimentNoteImported = await page.evaluate(({rowId, name}) => window.webglGeneratorApi.edit.notes.import({
      type: "webgl-generator-notes-summary", version: 1,
      notes: [{id: `military:${rowId}`, kind: "military", objectId: rowId, name,
        body: "军团关联备注", format: "plain"}]
    }, {mode: "append"}), regimentTarget);
    assert.equal(regimentNoteImported.ok, true, JSON.stringify(regimentNoteImported.error));
    await page.evaluate(id => window.__webglGeneratorApp.panels.notes.setSelectedNoteId(`military:${id}`), regimentTarget.rowId);
    await notesPanel.getByRole("button", {name: "重命名", exact: true}).click();
    assert.equal(await notesInput.inputValue(), regimentTarget.name);
    await notesInput.fill("备注  军团更名");
    await notesInput.press("Enter");
    await notesDialog.waitFor({state: "hidden"});
    assert.equal(await page.evaluate(({stateId, regimentId}) => window.__webglGeneratorApp.map.politics.states[stateId].military.find(item => item.i === regimentId)?.name, regimentTarget), "备注  军团更名");
    await page.evaluate(() => window.webglGeneratorApi.history.undo());
    assert.equal(await page.evaluate(({stateId, regimentId}) => window.__webglGeneratorApp.map.politics.states[stateId].military.find(item => item.i === regimentId)?.name, regimentTarget), regimentTarget.name);
  }
  report.notes = {enterAndClose: true, currentName: true, staleSnapshotFallback: true, linkedLabel: true, customLabel: true, military: Boolean(regimentTarget), undo: true};
  await markPhase("notes-complete");
  }
  }

  if (!process.argv.includes("--state-only")) {
  await markPhase("climate-opening");
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.climate.open(app.map, app.editHistory.getStats());
  });
  const seedInput = page.locator('.floating-panel[data-panel-id="climate-panel"]:not(.hidden) .climate-downstream-seed input');
  await seedInput.waitFor();
  assert.equal(await page.getByRole("button", {name: "设置 seed"}).count(), 0);
  await seedInput.fill("42");
  await seedInput.press("Enter");
  await page.waitForFunction(() => document.querySelector('pre.climate-downstream-result')?.textContent?.includes('"seed": 42'));
  await seedInput.fill("73");
  await seedInput.evaluate(input => input.blur());
  await page.waitForFunction(() => document.querySelector('pre.climate-downstream-result')?.textContent?.includes('"seed": 73'));
  report.seed = {enter: true, blur: true};

  await page.setViewportSize({width: 690, height: 900});
  const layouts = await page.locator(".state-name-editor, .city-name-editor, .climate-downstream-seed").evaluateAll(elements => elements.map(element => ({className: element.className, width: element.clientWidth, scroll: element.scrollWidth})));
  assert.ok(layouts.every(layout => layout.width >= layout.scroll), JSON.stringify(layouts));
  report.layout = layouts;
  }
  report.longTasks = await page.evaluate(() => window.__quickInputLongTasks.map(task => ({...task,
    phase: window.__quickInputPhases.filter(mark => mark.time <= task.startTime).at(-1)?.label || "unknown"})));
  report.longestTaskMs = Math.max(0, ...report.longTasks.map(task => task.duration));
  if (process.argv.includes("--profile-rename")) report.renameProfile = await page.evaluate(() => window.__quickInputProfile);
  assert.ok(report.longestTaskMs <= 200, `输入弹框交互出现 ${report.longestTaskMs}ms LongTask`);
  assert.deepEqual(errors, [], "编辑窗口浏览器错误");
  console.log(JSON.stringify({ok: true, report, errors}, null, 2));
} finally {
  await context.close();
  await server.httpServer.close();
}
