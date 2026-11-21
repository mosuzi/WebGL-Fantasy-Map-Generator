import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5548, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome"});
const page = await browser.newPage({viewport: {width: 1360, height: 960}});
const errors = [], checked = [];
page.on("console", message => {if (message.type() === "error") errors.push(message.text());});
page.on("pageerror", error => errors.push(error.message));
page.setDefaultTimeout(8000);
let panel;
const field = label => panel.locator(`[data-inline-label="${label}"]`);
const history = () => page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
async function undo(count) {
  await page.waitForFunction(n => window.__webglGeneratorApp.editHistory.getStats().undo === n + 1, count);
  await waitForApiReady(page, 12000);
  const result = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.ok(result.ok, JSON.stringify(result.error));
}
async function open(kind) {
  panel = page.locator(`.floating-panel[data-panel-id="${kind}-panel"]:not(.hidden)`);
  await page.evaluate(kind => {
    document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close").forEach(button => button.click());
    const app = window.__webglGeneratorApp, panel = app.panels[kind], h = app.editHistory.getStats();
    if (kind === "state") {
      panel.open(app.map, h);
      panel.setTargetStateId(app.map.politics.states.find(s => s?.id > 0 && !s.removed).id);
    } else if (kind === "zone") {
      const zone = app.map.zones.zones.find(Boolean);
      const target = {kind, id: zone.i ?? zone.id};
      if (!window.webglGeneratorApi.selection.select(target).ok) throw Error("无法选中地区");
      panel.open(app.map, app.selection, h);
    } else panel.open(app.map, app.selection, h);
  }, kind);
  await panel.locator(".ui-key-value-grid--detail").first().waitFor();
}
async function changeChoice(label) {
  const select = field(label).locator("select");
  await select.focus();
  const original = await select.inputValue();
  const next = await select.locator("option").evaluateAll((options, before) => options.find(option => !option.disabled && option.value !== before)?.value, original);
  assert.notEqual(next, undefined, label + " 缺少候选");
  const before = await history();
  await select.selectOption(next);
  await page.waitForFunction(({label, next}) => [...document.querySelectorAll(`[data-inline-label="${label}"] select`)].some(el => el.offsetWidth && el.value === next), {label, next});
  await undo(before);
  assert.equal(await select.inputValue(), original);
  checked.push(label);
}
try {
  await page.goto("http://127.0.0.1:5548/");
  await waitForApiReady(page, 120000);
  const map = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, cellsTarget: 3000, seed: "inline-details-455"}));
  assert.ok(map.ok);
  await open("state");
  await changeChoice("政体");
  await changeChoice("首都");
  const color = field("颜色");
  await color.getByRole("button").click();
  const hue = color.locator('input[type="number"]').first();
  const beforeColor = await history();
  await hue.fill(String((Number(await hue.inputValue()) + 90) % 360));
  await hue.press("Enter");
  await hue.press("Escape");
  await undo(beforeColor);
  checked.push("颜色");
  await open("city");
  await changeChoice("剪影");
  await field("备注").getByRole("button").click();
  const body = field("备注").getByRole("textbox"), beforeNote = await history();
  await body.fill("第一行"); await body.press("Shift+Enter"); await body.press("End"); await body.pressSequentially("2");
  await body.press("Tab");
  await field("备注").getByRole("button").waitFor();
  assert.match(await field("备注").innerText(), /第一行\n2/);
  await undo(beforeNote); checked.push("多行备注");
  await open("zone");
  await changeChoice("纹理");
  await open("route");
  const level = field("等级").locator("select"), beforeRoute = await history();
  const originalLevel = await level.inputValue();
  await level.focus();
  const different = await level.locator("option").evaluateAll((options, value) => options.find(option => option.value !== value).value, await level.inputValue());
  await level.selectOption(different);
  await panel.getByText("路线修改影响", {exact: true}).waitFor();
  assert.equal(await history(), beforeRoute);
  await panel.getByRole("button", {name: "取消", exact: true}).click();
  await panel.getByText("路线修改影响", {exact: true}).waitFor({state: "hidden"});
  assert.equal(await history(), beforeRoute);
  await level.selectOption(different);
  await panel.getByRole("button", {name: "应用路线修改", exact: true}).click();
  await panel.getByText("路线修改影响", {exact: true}).waitFor({state: "hidden"});
  assert.equal(await level.inputValue(), different);
  await undo(beforeRoute);
  assert.equal(await level.inputValue(), originalLevel);
  checked.push("路线预览、取消、应用和撤销");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({checked, errors}));
} catch (error) {
  console.error({checked, errors, history: await history(), route: await panel.locator(".route-edit-form").allTextContents()});
  throw error;
} finally {
  await browser.close();
  await server.httpServer.close();
}
