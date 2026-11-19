import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const archive = process.env.FMG_REAL_ARCHIVE;
const smoke = process.argv.includes("--smoke");
const target = smoke ? 3000 : 100000;
const server = await preview({configFile:join(root, "vite.config.mjs"), preview:{host:"127.0.0.1", port:5618, strictPort:true}, logLevel:"error"});
const browser = await chromium.launch({channel:"chrome", headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440, height:900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error" && !msg.text().startsWith("[FMG health]")) errors.push(msg.text()); });
  await page.goto("http://127.0.0.1:5618/?healthClear=1&debug=1");
  await waitForApiReady(page, 120000);
  if (archive) {
    await page.evaluate(() => {window.__previousMap = window.__webglGeneratorApp.map;});
    await page.locator("#import-map-file").setInputFiles(archive);
    await page.waitForFunction(() => window.__webglGeneratorApp.map !== window.__previousMap
      && window.__webglGeneratorApp.map?.grid.cells.i.length === 100000, null, {timeout:120000});
  } else {
    const generated = await page.evaluate(cellsTarget => window.webglGeneratorApi.generate.newMap({confirm:true, cellsTarget, seed:"state-label-visibility-100000"}), target);
    assert.ok(generated.ok, JSON.stringify(generated.error));
  }
  await waitForApiReady(page, 120000);
  const setup = await page.evaluate(() => {
    const {map, renderer, editHistory} = window.__webglGeneratorApp;
    const active = map.politics.states.filter(state => state?.id > 0 && !state.removed);
    const state = active.find(state => state.id === 5) || active[0];
    return {cells:map.grid.cells.i.length, stateId:state.id, original:state.name, smooth:renderer.viewOptions.smoothCellBorders,
      history:editHistory.getStats().undo};
  });
  assert.ok(setup.cells >= target * 0.97 && setup.smooth, JSON.stringify(setup));
  console.log(JSON.stringify(setup));
  await page.locator("#open-generation-panel").click();
  await page.locator('[data-control-tab="themes"]').click();
  const controls = page.locator(".view-mode-segmented");
  const modes = await controls.locator("[data-mode]").evaluateAll(nodes => nodes.map(node => node.dataset.mode));
  assert.equal(new Set(modes).size, 12);
  async function switchView(mode) {
    await controls.locator(".el-segmented__item").nth(modes.indexOf(mode)).click();
    await page.waitForFunction(expected => window.__webglGeneratorApp.renderer.colorMode === expected, mode, {timeout:30000});
    await waitForApiReady(page, 30000);
    assert.equal(await controls.locator('[data-mode="' + mode + '"]').evaluate(el => el.classList.contains("active")), true, mode);
  }
  await switchView("height");
  await page.locator('[data-control-tab="management"]').click();
  await page.locator("#open-state-panel").click();
  const statePanel = page.locator('[data-panel-id="state-panel"]');
  await statePanel.locator('[data-row-key="n:' + setup.stateId + '"]').dblclick();
  const input = page.getByRole("dialog", {name:"重命名"}).locator(".state-name-editor input");
  const edited = "东岚";
  assert.notEqual(setup.original, edited);
  await input.fill(edited);
  await input.press("Enter");
  const waitName = name => page.waitForFunction(([id, expected]) => window.__webglGeneratorApp.map.politics.states[id].name === expected, [setup.stateId, name]);
  await waitName(edited);
  await statePanel.locator(".floating-panel-close").click();
  if (!await page.locator('[data-control-tab="themes"]').isVisible()) await page.locator("#open-generation-panel").click();
  await page.locator('[data-control-tab="themes"]').click();
  await page.evaluate(() => {
    window.__historyViewLongTasks = [];
    window.__viewPreferenceWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "webgl-generator-control-preferences") window.__viewPreferenceWrites++;
      return setItem.call(this, key, value);
    };
    new PerformanceObserver(list => window.__historyViewLongTasks.push(...list.getEntries().map(e => ({start:e.startTime, duration:e.duration})))).observe({type:"longtask"});
    window.__webglGeneratorHealth?.clear?.();
  });
  async function pixels() {
    return page.evaluate(() => {
      const {renderer} = window.__webglGeneratorApp;
      renderer.draw();
      const sample = document.createElement("canvas");
      sample.width = 96;
      sample.height = 60;
      const context = sample.getContext("2d");
      context.drawImage(renderer.canvas, 0, 0, sample.width, sample.height);
      return Array.from(new Uint32Array(context.getImageData(0, 0, sample.width, sample.height).data.buffer));
    });
  }
  const differences = (a,b) => a.reduce((count, value, i) => count + Number(value !== b[i]), 0);
  const cases = [];
  async function historySwitch(direction, destination) {
    const start = await page.evaluate(() => performance.now());
    const undo = direction === "undo";
    if (!undo) assert.ok(await page.evaluate(() => document.activeElement?.matches('.view-mode-segmented input[type="radio"]')),
      "重做必须覆盖视图按钮持有键盘焦点的情况");
    const name = undo ? setup.original : edited;
    await page.keyboard.press(undo ? "Control+z" : "Control+y");
    await waitName(name);
    await waitForApiReady(page, 30000);
    const beforeWrites = await page.evaluate(() => window.__viewPreferenceWrites);
    await switchView(destination);
    const state = await page.evaluate(id => {
      const {map, editHistory, renderer, lastDisplayRenderWorker} = window.__webglGeneratorApp;
      const {undo, redo} = editHistory.getStats();
      const saved = JSON.parse(localStorage.getItem("webgl-generator-control-preferences"));
      const layersMatch = Array.from(document.querySelectorAll("[data-layer]"), el => el.dataset.layer)
        .filter(layer => Object.hasOwn(renderer.layerVisibility, layer))
        .every(layer => saved.layers[layer] === renderer.layerVisibility[layer]);
      return {name:map.pack.states[id].name, undo, redo, gl:renderer.gl.getError(), gpu:lastDisplayRenderWorker?.localGpu === true,
        saved:saved.colorMode, layersMatch,
        writes:window.__viewPreferenceWrites, end:performance.now()};
    }, setup.stateId);
    assert.deepEqual([state.name, state.undo, state.redo, state.gl], [name, setup.history + Number(!undo), Number(undo), 0]);
    assert.equal(state.saved, destination);
    assert.ok(state.layersMatch, "视图切换后图层偏好与画布不一致");
    await page.waitForTimeout(60);
    const tasks = await page.evaluate(([start,end]) => window.__historyViewLongTasks.filter(e => e.start >= start && e.start < end).map(e => e.duration), [start,state.end]);
    cases.push({direction, destination, gpu:state.gpu, writes:state.writes-beforeWrites, tasks});
    console.log(JSON.stringify(cases.at(-1)));
    assert.ok(state.writes - beforeWrites <= 4, "一次切换不应逐个图层重复写偏好");
    assert.ok(tasks.every(ms => ms <= 200), "历史视图交互出现超过 200ms 的长任务");
  }
  const itinerary = ["states", ...modes.filter(mode => mode !== "states" && mode !== "height"), "height"];
  let from = "height";
  for (const to of smoke ? itinerary.slice(0,1) : itinerary) {
    const before = await pixels();
    assert.ok(new Set(before).size > 20, "当前画布没有可测的地图内容");
    await historySwitch("undo", to);
    const after = await pixels();
    assert.ok(differences(before, after) > before.length * 0.01, from + " → " + to + " 画布颜色未切换");
    await historySwitch("redo", from);
    const restored = await pixels();
    assert.ok(differences(before, restored) < before.length * 0.01, from + " 往返画面未恢复");
    if (to !== itinerary.at(-1) && !smoke) await switchView(to);
    from = to;
  }
  const health = await page.evaluate(() => window.webglGeneratorApi.info.healthEvents({severity:"error", limit:100}).data.events);
  assert.deepEqual(health.filter(event => !["main-thread-long-task","render-frame-gap"].includes(event.type)), []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({pass:true, cells:setup.cells, cases:cases.length, maxTask:Math.max(0,...cases.flatMap(c=>c.tasks))}));
} finally {
  await browser.close();
  await server.httpServer.close();
}
