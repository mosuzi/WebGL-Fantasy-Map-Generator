import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const server = await preview({configFile: "vite.config.mjs", preview: {host: "127.0.0.1", port: 5693, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome"});
const out = process.env.FMG_LIST_OUTPUT || join(tmpdir(), "list-controls");
const tables = "state city province military ocean-current river marker zone diplomacy economy government lake measurement culture religion route label-naming notes namebase biome climate emblem feature population".split(" ");
const widths = [760, 560, 390];
const report = [], issues = [], errors = [];
try {
  await mkdir(out, {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5693/");
  await waitForApiReady(page, 90000);
  for (const width of widths) {
    await page.setViewportSize({width: width < 500 ? width : 1440, height: 900});
    for (const name of tables) {
      await page.evaluate(async name => {
        document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close").forEach(b => b.click());
        if (name === "emblem") {
          const app = window.__webglGeneratorApp;
          await app.panels.emblem.open(app.map, app.editHistory.getStats());
        } else document.getElementById("open-" + name + "-panel").click();
      }, name);
      const panel = page.locator('[data-panel-id="' + name + '-panel"]');
      await panel.locator(".ui-filter-input:visible").first().waitFor();
      await panel.evaluate((el, w) => { el.style.width = w + "px"; }, width);
      const rows = await panel.evaluate(el => Array.from(el.querySelectorAll('[class$="-panel-controls"], .list-filter-toolbar, .marker-edit-toolbar, .diplomacy-edit-toolbar, .zone-panel-regeneration'))
        .filter(n => n.getBoundingClientRect().width > 0 && !n.parentElement.closest(".list-filter-toolbar"))
        .map(group => {
          const rect = group.getBoundingClientRect();
          const bits = Array.from(group.querySelectorAll(".ui-filter-input, .ui-select-field, .ui-segmented, button"))
            .filter(n => n.getBoundingClientRect().width && !n.parentElement.closest(".ui-select-field, .ui-segmented, .ui-filter-input"))
            .map(n => {
              const r = n.getBoundingClientRect();
              const input = n.matches(".ui-filter-input"), button = n.matches("button");
              const tabs = Array.from(n.querySelectorAll(".el-segmented__item"), tab => tab.getBoundingClientRect().top);
              return {type: input ? "input" : button ? "button" : "field", stackedTabs: new Set(tabs).size > 1, text: n.textContent.trim().slice(0, 24),
                x: Math.round(r.left - rect.left), y: Math.round(r.top - rect.top), w: Math.round(r.width)};
            });
          return {group: group.className, w: Math.round(rect.width), bits};
        }));
      assert.ok(rows.some(r => r.bits.some(b => b.type === "input")), name);
      for (const row of rows) {
        for (const bit of row.bits) {
          if (bit.stackedTabs || bit.x < -1 || bit.x + bit.w > row.w + 1 || bit.type === "input" && bit.w < Math.min(146, row.w)
            || bit.type === "button" && bit.w > 38 + 16 * bit.text.length) issues.push({width, name, ...row});
        }
      }
      if (name === "state" || name === "city") {
        const {bits} = rows[0], [input, rename, regenerate] = bits;
        if (bits.length !== 3 || Math.abs(rename.y - regenerate.y) > 3
          || (width >= 560 && Math.abs(input.y - rename.y) > 3)) issues.push({width, name, ...rows[0]});
        if (name === "state") await panel.locator(".state-panel-controls").screenshot({path: join(out, "国家筛选-" + width + ".png")});
        if (width === 560) {
          const filter = panel.locator(".ui-filter-input input").first();
          const renameButton = panel.getByRole("button", {name: "按名称库重命名筛选", exact: true});
          assert.ok(await renameButton.isEnabled());
          await filter.fill("不存在的城国名称123456");
          await panel.getByText(name === "state" ? "没有匹配的国家" : "没有匹配的城市", {exact: true}).waitFor();
          assert.ok(await renameButton.isDisabled());
          await filter.fill("");
          await panel.locator(".object-table-wrap tr[data-row-key]").first().waitFor();
          assert.ok(await renameButton.isEnabled());
        }
      }
      report.push({width, name, rows});
    }
  }
  await writeFile(join(out, "report.json"), JSON.stringify({report, issues, errors}, null, 2));
  console.log(JSON.stringify({cases: report.length, issues: issues.length, affected: [...new Set(issues.map(i => i.name))], errors, out}));
  if (!process.argv.includes("--survey")) assert.equal(issues.length, 0, JSON.stringify(issues[0]));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
