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
const report = [], issues = [], errors = [], redraws = [];
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
                x: Math.round(r.left - rect.left), centerY: Math.round(r.top + r.height / 2 - rect.top), w: Math.round(r.width)};
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
      const icons = await panel.evaluate(el => {
        const actions = el.querySelectorAll(".ui-action-icon-row button, .ui-panel-io-actions .ui-icon-action, .regeneration-lock-action, .table-icon-action, .list-toolbar-actions .ui-icon-action");
        return Array.from(actions).filter(button => button.offsetWidth > 0).map(button => {
          const hit = button.getBoundingClientRect(), svg = button.querySelector("svg")?.getBoundingClientRect();
          return {label: button.getAttribute("aria-label"), inRow: button.matches(".table-icon-action"), hit: [hit.width, hit.height], glyph: svg && [svg.width, svg.height],
            centered: svg && Math.abs(hit.x + hit.width / 2 - svg.x - svg.width / 2) <= 1 && Math.abs(hit.y + hit.height / 2 - svg.y - svg.height / 2) <= 1};
        });
      });
      for (const icon of icons) assert.ok(icon.label && icon.hit.every(v => v === 24) && icon.glyph?.every(v => v === (icon.inRow ? 13 : 15)) && icon.centered, JSON.stringify({name, width, icon}));
      const heights = await panel.locator(".object-table-row:visible").evaluateAll(nodes => [...new Set(nodes.map(row => row.getBoundingClientRect().height))]);
      assert.ok(heights.every(height => height === 28), JSON.stringify({name, width, heights}));
      if (name === "city" && width === 760) await verifyVirtualCityList(page, panel);
      if (width === 560 && ["city", "state", "province", "culture", "religion", "lake", "river"].includes(name)) {
        const snapshot = () => page.evaluate(kind => {
          const {map, editHistory} = window.__webglGeneratorApp;
          const items = {city: map.settlements.cities, state: map.politics.states, province: map.politics.provinces,
            culture: map.society.cultures, religion: map.society.religions, river: map.rivers.rivers, lake: map.pack.features.filter(f => f?.type === "lake")}[kind];
          return {names: items.map(item => item?.name), undo: editHistory.getStats().undo};
        }, name);
        const before = await snapshot();
        await panel.getByRole("button", {name: /按名称库重命名筛选/}).click();
        const after = await snapshot();
        assert.notDeepEqual(after.names, before.names, name + "名称没有改变");
        assert.equal(after.undo, before.undo + 1, name + "换名历史");
        assert.ok(await page.evaluate(() => window.webglGeneratorApi.history.undo().data.executed));
        assert.deepEqual(await snapshot(), before, name + "换名撤销");
        redraws.push(name);
      }
      if (name === "state" || name === "city") {
        const {bits} = rows[0], [input, rename, regenerate] = bits;
        if (bits.length !== 3 || Math.abs(rename.centerY - regenerate.centerY) > 5
          || (width >= 560 && Math.abs(input.centerY - rename.centerY) > 5)) issues.push({width, name, ...rows[0]});
        if (name === "state") await panel.locator(".state-panel-controls").screenshot({path: join(out, "国家筛选-" + width + ".png")});
        if (width === 560) {
          const filter = panel.locator(".ui-filter-input input").first();
          const renameButton = panel.getByRole("button", {name: "按名称库重命名筛选结果", exact: true});
          const count = panel.locator(".ui-key-value-grid--metric .ui-key-value-item")
            .filter({has: page.getByText(name === "city" ? "城市" : "国家", {exact: true})}).locator("strong");
          const total = await count.innerText();
          assert.ok(await renameButton.isEnabled());
          await filter.fill("不存在的城国名称123456");
          await panel.getByText(name === "state" ? "没有匹配的国家" : "没有匹配的城市", {exact: true}).waitFor();
          assert.ok(await renameButton.isDisabled());
          assert.equal(await count.innerText(), "0 / " + total);
          await filter.fill("");
          await panel.locator(".object-table-wrap tr[data-row-key]").first().waitFor();
          assert.ok(await renameButton.isEnabled());
          assert.equal(await count.innerText(), total);
        }
      }
      if (name === "diplomacy" && width === 560) {
        await panel.locator(".object-table-row").first().click();
        await panel.getByRole("button", {name: "国家管理", exact: true}).click();
        await page.locator('[data-panel-id="state-panel"]:not(.hidden)').waitFor();
        assert.equal(await page.locator(".diplomacy-open-state-panel").count(), 0);
      }
      report.push({width, name, rows, icons: icons.length});
    }
  }
  await writeFile(join(out, "report.json"), JSON.stringify({report, issues, errors, redraws}, null, 2));
  console.log(JSON.stringify({cases: report.length, icons: report.reduce((n, row) => n + row.icons, 0), redraws, issues: issues.length, affected: [...new Set(issues.map(i => i.name))], errors, out}));
  if (!process.argv.includes("--survey")) assert.equal(issues.length, 0, JSON.stringify(issues[0]));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

async function verifyVirtualCityList(page, panel) {
  const wrap = panel.locator(".object-table-wrap");
  const countText = await panel.locator(".city-panel-summary .ui-key-value-item").filter({has: page.getByText("城市", {exact: true})}).locator("strong").innerText();
  const total = Number(countText.replaceAll(",", ""));
  assert.ok(total > 120, "须覆盖虚拟城市列表");
  const touch = await page.context().newCDPSession(page);
  const samples = [];
  for (const mode of ["mouse", "touch", "mouse"]) {
    const coarse = mode === "touch", height = coarse ? 34 : 28;
    await touch.send("Emulation.setTouchEmulationEnabled", {enabled: coarse, maxTouchPoints: 1});
    await page.waitForFunction(expected => {
      const table = document.querySelector('[data-panel-id="city-panel"] .object-table');
      return getComputedStyle(table).getPropertyValue("--object-table-row-height").trim() === expected + "px";
    }, height);
    for (const position of [0, 0.5, 1]) {
      const sample = await wrap.evaluate(async (el, fraction) => {
        el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const body = el.querySelector("tbody"), rows = [...body.querySelectorAll(".object-table-row")];
        const button = rows.at(-1).querySelector(".table-icon-action");
        const bounds = el.getBoundingClientRect(), header = el.querySelector("thead th").getBoundingClientRect();
        const fullyVisible = rows.filter(row => {
          const rect = row.getBoundingClientRect();
          return rect.top >= header.bottom - 0.5 && rect.bottom <= bounds.top + el.clientTop + el.clientHeight + 0.5;
        });
        return {bodyHeight: body.getBoundingClientRect().height, heights: [...new Set(rows.map(row => row.getBoundingClientRect().height))],
          viewport: el.clientHeight, headerHeight: header.height, rendered: rows.length, visible: fullyVisible.length,
          first: rows[0].dataset.rowKey, last: rows.at(-1).dataset.rowKey,
          hit: button.offsetHeight, glyph: button.querySelector("svg").getBoundingClientRect().width};
      }, position);
      assert.equal(sample.bodyHeight, total * height, "虚拟占位与真实行总高度须一致");
      assert.deepEqual(sample.heights, [height]);
      const capacity = Math.floor((sample.viewport - sample.headerHeight) / height);
      assert.ok(sample.visible >= capacity - 1 && sample.visible <= capacity && sample.rendered < total);
      assert.deepEqual([sample.hit, sample.glyph], [coarse ? 32 : 24, 13]);
      samples.push({mode, position, ...sample});
      if (samples.length === 1) await wrap.screenshot({path: join(out, "城市列表.png")});
    }
  }
  await touch.detach();
  assert.equal(samples[2].last, samples[5].last);
  assert.equal(samples[2].last, samples[8].last);
  const lastRow = wrap.locator(".object-table-row").last();
  const cityName = await lastRow.locator('td[data-column-key="name"]').innerText();
  await lastRow.locator('td[data-column-key="name"]').click();
  assert.equal(await panel.locator(".city-attribute-name").innerText(), cityName, "末行点击须选中对应城市");
  await writeFile(join(out, "行高.json"), JSON.stringify({total, samples}, null, 2));
}
