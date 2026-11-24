import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const {chromium} = createRequire(resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const modes = [
  "biome",
  "suitability",
  "market",
  "province",
  "state",
  "religion",
  "culture",
  "selection",
  "raise",
  "lower",
  "level",
  "smooth",
  "flatten",
  "disrupt",
];
const arg = (name) =>
  process.argv
    .find((value) => value.startsWith("--" + name + "="))
    ?.split("=")
    .slice(1)
    .join("=");
const radius = Number(arg("radius") || 8);
const distance = Number(arg("distance") || 96);
const requested = arg("modes")?.split(",") || modes;
assert.ok(requested.every((mode) => modes.includes(mode)) && radius >= 1 && radius <= 32 && distance > 0);
const site = arg("site");
const server = site ? null : await preview({
  configFile: false,
  root: process.cwd(),
  build: {outDir: arg("dist") || "dist/webgl-generator"},
  preview: {host: "127.0.0.1", port: 0},
  logLevel: "error",
});
const browser = await chromium.launch({channel: "chrome", headless: true});
try {
  for (const mode of requested) {
    const page = await browser.newPage({viewport: {width: Number(arg("width") || 1440), height: Number(arg("height") || 900)}, deviceScaleFactor: Number(arg("dpr") || 1)});
    try {
      page.setDefaultTimeout(10000);
      const errors = [];
      let measuring = false;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (measuring && message.type() === "error") errors.push(message.text());
      });
      await page.addInitScript(instrument);
      const response = await page.goto(site || server.resolvedUrls.local[0], {waitUntil: "domcontentloaded"});
      if (arg("expected-version")) {
        assert.ok((await response.text()).includes("<strong>v" + arg("expected-version") + "</strong>"), "页面版本不符");
      }
      await waitForApiReady(page, 90000);
      if (arg("save")) {
        await page.locator("#import-map-file").setInputFiles(resolve(arg("save")));
        await page.waitForFunction(
          () => window.__webglGeneratorApp.runtimeOperation.getSnapshot().last?.name === "data.importMap",
          null,
          {timeout: 90000},
        );
        await waitForApiReady(page, 90000);
      }
      const field =
        {selection: "h", suitability: "suitabilityOverride", market: "market"}[mode] || (modes.indexOf(mode) >= 8 ? "h" : mode);
      const panelName = field === "h" ? "height" : mode === "market" ? "economy" : mode === "suitability" ? "biome" : mode;
      const debug = ["smooth", "flatten", "disrupt"].includes(mode);
      await page.evaluate(
        ({panelName, debug}) => {
          const a = window.__webglGeneratorApp,
            p = a.panels[panelName];
          if (debug) {
            window.__webglGeneratorDebug.enabled = true;
            window.__webglGeneratorDebug.collapse();
          }
          if (panelName === "height") p.open(a.editHistory.getStats());
          else if (["state", "biome"].includes(panelName)) p.open(a.map, a.editHistory.getStats());
          else p.open(a.map, a.selection, a.editHistory.getStats());
        },
        {panelName, debug},
      );
      const panel = page.locator('.floating-panel[data-panel-id="' + panelName + '-panel"]');
      await panel.locator("button").last().waitFor({state: "attached"});
      if (mode === "biome")
        await panel.locator('tr[data-row-key^="n:"]:not([data-row-key="n:0"]) td[data-column-key="name"]').first().click();
      if (mode === "market")
        await page.evaluate(() => {
          const a = window.__webglGeneratorApp;
          a.panels.economy.setSelectedMarketId(a.map.pack.markets.find((m) => m?.i > 0).i);
        });
      if (["state", "province"].includes(mode))
        await page.evaluate((kind) => {
          const a = window.__webglGeneratorApp,
            id = a.map.politics[kind === "state" ? "states" : "provinces"].find((i) => i?.i > 0 && !i.removed).i;
          window.webglGeneratorApi.selection.select({kind, id});
          if (kind === "state") a.panels.state.setTargetStateId(id);
          else a.panels.province.setSelectedProvinceId(id);
        }, mode);
      const names = {
        biome: "归属笔刷",
        suitability: "数值适居度",
        market: "编辑市场归属",
        state: "涂抹国土",
        province: "进入省份编辑",
        culture: "编辑文化归属",
        religion: "编辑宗教归属",
      };
      if (field === "h") {
        await panel.getByRole("button", {name: "启用高度编辑", exact: true}).click();
        if (debug) await panel.locator('button[data-mode="' + mode + '"]').click();
        else
          await panel
            .getByRole("button", {
              name: {raise: "抬升地形", lower: "降低地形", level: "等高地形", selection: "涂选平滑范围"}[mode],
              exact: true,
            })
            .click();
      } else await panel.getByRole("button", {name: names[mode], exact: true}).click();
      if (field === "h" && radius !== 8) {
        const label = mode === "selection" ? "选区画笔大小" : "画笔大小";
        const input = panel
          .locator("label.ui-slider-field:visible")
          .filter({hasText: label})
          .first()
          .locator(".ui-slider-number input");
        await input.fill(String(radius));
        await input.press("Enter");
      }
      if (mode === "disrupt") {
        const input = panel
          .locator("label.ui-slider-field:visible")
          .filter({hasText: "强度"})
          .first()
          .locator(".ui-slider-number input");
        await input.fill("5");
        await input.press("Enter");
      }
      const sample = await page.evaluate(prepare, {mode, field, radius, panelName, distance,
        camera: arg("camera")?.split(",").map(Number), cultureTarget: Number(arg("culture-target"))});
      await page.mouse.move(sample.x, sample.y);
      await page.waitForTimeout(500);
      const tableScroll = mode === "province" && process.argv.includes("--check-scroll")
        ? await page.locator(".vue-province-panel-root .object-table-wrap").evaluate(async table => {
            table.scrollTop = Math.min(160, table.scrollHeight - table.clientHeight);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return table.scrollTop;
          }) : null;
      const profileSession = process.argv.includes("--cpu") ? await page.context().newCDPSession(page) : null;
      if (profileSession) {
        await profileSession.send("Profiler.enable");
        await profileSession.send("Profiler.start");
      }
      measuring = true;
      await page.evaluate(() => window.beginBrushProbe());
      await page.mouse.down();
      await page.mouse.move(sample.x + distance, sample.y, {steps: Math.ceil(distance / 6)});
      await page.mouse.up();
      if (field === "h" && mode !== "selection") await page.waitForFunction(() => !window.__webglGeneratorApp.heightEdit.activeStroke);
      if (mode === "state" || mode === "province")
        await page.waitForFunction(() => {
          const app = window.__webglGeneratorApp;
          if (app.renderer.politicalBrushLastError) throw Error(app.renderer.politicalBrushLastError);
          return app.renderer.politicalBrushAppliedRequest === app.renderer.politicalBrushRequest &&
            app.healthMonitor.getCanvasSamples().some(item => item.phase === "state-label-refresh" && item.pageTimeMs >= window.brushProbeStart);
        });
      await page.waitForTimeout(380);
      const profile = await page.evaluate(() => window.finishBrushProbe());
      measuring = false;
      if (profileSession) {
        const {profile: cpu} = await profileSession.send("Profiler.stop");
        const counts = new Map(),
          nodes = new Map(cpu.nodes.map((n) => [n.id, n]));
        cpu.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + cpu.timeDeltas[i]));
        profile.cpu = [...counts]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 22)
          .map(([id, us]) => [nodes.get(id).callFrame.functionName, nodes.get(id).callFrame.columnNumber, Math.round(us / 1000)]);
      }
      const result = await page.evaluate(() => window.readBrushOutcome());
      console.log(JSON.stringify({mode, radius, distance, ...sample, ...result, ...profile, errors}));
      if (tableScroll !== null) {
        assert.ok(tableScroll > 0, "复验应命中可滚动省份表");
        assert.equal(await page.locator(".vue-province-panel-root .object-table-wrap").evaluate(table => table.scrollTop), tableScroll,
          "涂抹期间省份面积排序变化应保留玩家的列表滚动位置");
      }
      assert.deepEqual(errors, []);
      assert.equal(profile.glError, 0);
      assert.equal(profile.calls.refreshCellSurface?.n || 0, 0, mode + " 笔画不得重建整张地表");
      assert.ok(result.changed > 0 && result.traveled, mode + " 拖动必须命中起点和远处格子");
      if (mode === "market") {
        assert.equal(result.depth, sample.depth);
        if (process.argv.includes("--apply-market")) {
          await panel.getByRole("button", {name: "应用并更新"}).click();
          await page.waitForFunction((d) => window.__webglGeneratorApp.editHistory.getStats().undo === d + 1, sample.depth, {
            timeout: 90000,
          });
          await waitForApiReady(page, 90000);
        } else await panel.getByRole("button", {name: "取消预览"}).click();
      }
      if (mode !== "selection" && (mode !== "market" || process.argv.includes("--apply-market"))) {
        assert.equal(await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo), sample.depth + 1);
        await page.evaluate(() => window.captureAfterBrush());
        assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
        assert.ok(await page.evaluate(() => window.brushRestored()), mode + " 撤销必须逐格还原");
        assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.redo())).ok);
        assert.ok(await page.evaluate(() => window.brushRedone()), mode + " 重做必须逐格复现");
        assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
      }
      assert.ok(await page.evaluate(() => window.brushRestored()), mode + " 高度选区、撤销或取消必须保留原值");
      if (["culture", "religion"].includes(mode) && process.argv.includes("--consecutive")) {
        await page.mouse.click(sample.x, sample.y);
        await page.mouse.click(sample.x + distance, sample.y);
        const pair = await page.evaluate(() => {
          const a = window.__webglGeneratorApp, history = window.webglGeneratorApi.history;
          const depth = a.editHistory.getStats().undo;
          window.captureAfterBrush();
          const undo = history.undo().ok && history.undo().ok && window.brushRestored();
          const redo = history.redo().ok && history.redo().ok && window.brushRedone();
          history.undo();
          history.undo();
          return {depth, undo, redo};
        });
        assert.deepEqual(pair, {depth: sample.depth + 2, undo: true, redo: true});
      }
      if (process.argv.includes("--cancel") && !["selection", "market"].includes(mode)) {
        await page.mouse.move(sample.x, sample.y);
        await page.mouse.down();
        await page.mouse.move(sample.x + distance, sample.y, {steps: 8});
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.ok((await page.evaluate(() => window.readBrushOutcome())).changed > 0, mode + " 取消前须有可见预览");
        await page.evaluate(() =>
          window.__webglGeneratorApp.renderer.canvas.dispatchEvent(
            new PointerEvent("pointercancel", {pointerId: window.brushPointerId, bubbles: true}),
          ),
        );
        await page.mouse.up();
        assert.ok(await page.evaluate(() => window.brushRestored()), mode + " 取消必须还原原值");
        assert.equal(await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo), sample.depth);
      }
      if (mode === "province" && process.argv.includes("--check-development")) {
        await page.mouse.move(sample.x, sample.y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForFunction(() => {
          const app = window.__webglGeneratorApp;
          return app.provinceBrushDiagnosticsPending && app.pendingBrushPanelMap === null;
        });
        const current = await page.evaluate(() => {
          const app = window.__webglGeneratorApp;
          const wasPending = app.provinceBrushDiagnosticsPending;
          app.panels.development.open();
          const revision = Array.from(document.querySelectorAll("#runtime-stats dt")).find(node => node.textContent === "地图版本")?.nextElementSibling?.textContent;
          app.panels.development.close();
          return wasPending && !app.provinceBrushDiagnosticsPending && revision?.endsWith("/ r" + app.mapRevision.mapRevision);
        });
        assert.ok(current, "重新打开开发面板应显示刚提交的地图版本");
        assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
        assert.ok(await page.evaluate(() => window.brushRestored()));
      }
      assert.deepEqual(errors, []);
      if (!process.argv.includes("--diagnose")) {
        assert.ok(profile.long.length === 0 && profile.maxHandler < 50 && profile.frameMax < 50, mode + " 出现笔画长任务或帧间隔过长");
        assert.ok(profile.handlers.pointermove < 16.7 && profile.frameP95 <= 17, mode + " 连续画笔超过一帧预算");
      }
      if (["culture", "religion"].includes(mode) && process.argv.includes("--save-roundtrip")) {
        await page.mouse.click(sample.x, sample.y);
        const saved = await page.evaluate(async () => {
          const app = window.__webglGeneratorApp;
          const digest = await window.socialBrushDigest();
          const file = await app.runtimeActions.data.exportCompressedAll({download: false, includeBase64: true});
          if (!window.webglGeneratorApi.history.undo().ok || !window.brushRestored()) throw Error("保存后撤销未还原");
          return {digest, base64: file.base64};
        });
        await page.locator("#import-map-file").setInputFiles({
          name: "brush.webfmg", mimeType: "application/octet-stream", buffer: Buffer.from(saved.base64, "base64")
        });
        await page.waitForFunction(async expected => (await window.socialBrushDigest()) === expected, saved.digest, {timeout: 90000});
        await waitForApiReady(page, 90000);
      }
      console.log(mode + " 验收通过");
    } catch (error) {
      console.error(mode, error);
      process.exitCode = 1;
      if (!process.argv.includes("--inventory")) break;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.httpServer.close(done));
}

function prepare({mode, field, radius, panelName, distance, camera, cultureTarget}) {
  const app = window.__webglGeneratorApp,
    r = app.renderer,
    panel = app.panels[panelName],
    map = app.map;
  if (camera) {
    r.camera.scale = camera[0];
    if (camera.length === 3) [r.camera.offsetX, r.camera.offsetY] = camera.slice(1);
    r.draw();
  }
  if (panel.setBrushRadius) panel.setBrushRadius(radius);
  if (panel.setBrushRadii) panel.setBrushRadii({biome: radius, suitability: radius});
  const brush = mode === "market" ? panel.getMarketBrush() : mode === "suitability" ? panel.getSuitabilityBrush() : panel.getBrush();
  if (mode !== "selection" && (!brush.active || brush.radius !== radius)) throw Error("画笔未就绪 " + JSON.stringify(brush));
  const c = map.grid.cells,
    pc = map.pack.cells,
    rect = r.canvas.getBoundingClientRect();
  const packOnly = mode === "market" || mode === "suitability";
  const values = () => (packOnly ? app.map.pack.cells[field] : app.map.grid.cells[field]);
  const original = [...values()];
  const stores =
    mode === "biome" || mode === "suitability"
      ? {
          grid: ["s", "pop", ...(mode === "biome" ? ["biome"] : [])],
          pack: ["s", "pop", "suitabilityBase", "suitabilityOverride", ...(mode === "biome" ? ["biome"] : [])],
        }
      : {grid: packOnly ? [] : [field], pack: [field]};
  const columns = () => Object.entries(stores).flatMap(([domain, names]) => names.map((name) => app.map[domain].cells[name]));
  const capture = () => columns().map((column) => Array.from(column));
  const matches = (snapshot) =>
    columns().every((column, k) => column.length === snapshot[k].length && column.every((v, i) => Object.is(v, snapshot[k][i])));
  const before = capture();
  if (["culture", "religion"].includes(mode)) window.socialBrushDigest = async () => {
    const m = app.map;
    const values = [Array.from(m.grid.cells[field]), Array.from(m.pack.cells[field]),
      ...[m.pack, m.society].map(section => section[mode + "s"].map(row =>
        row && [row.i, row.cells, row.area, row.rural, row.urban, row.center, row.gridCenter])),
      m.pack.burgs.map(row => row?.[field]), m.settlements.cities.map(row => row?.[field])];
    const bytes = new TextEncoder().encode(JSON.stringify(values));
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).join(",");
  };
  let after;
  window.captureAfterBrush = () => {
    after = capture();
  };
  window.brushRedone = () => matches(after);
  window.brushRestored = () => matches(before);
  for (let y = Math.ceil(rect.top + 50); y < rect.bottom - 10; y += 12)
    for (let x = Math.ceil(rect.left + 60); x < rect.right - distance - 9; x += 16) {
      const points = Array.from({length: 5}, (_, i) =>
        document.elementFromPoint(x + (i * distance) / 4, y) === r.canvas ? r.pickCellClientPoint(x + (i * distance) / 4, y) : null,
      );
      if (
        !points.every((p) => p && c.h[p.gridCell] >= 20 && (!packOnly || p.packCell != null)) ||
        points[0].gridCell === points.at(-1).gridCell
      )
        continue;
      const ids = points.map((p) => (packOnly ? p.packCell : p.gridCell)),
        gridIds = points.map((p) => p.gridCell);
      let target;
      if (["state", "province", "religion", "culture"].includes(mode)) {
        const store = ["state", "province"].includes(mode) ? map.politics : map.society;
        const row = store[mode + "s"].find(
          (row) =>
            row?.i > 0 &&
            (mode !== "culture" || !cultureTarget || row.i === cultureTarget) &&
            !row.removed &&
            !ids.some((id) => c[field][id] === row.i) &&
            (mode !== "province" || gridIds.every((id) => c.state[id] === row.state)),
        );
        if (!row) continue;
        target = row.i;
        if (mode === "state") {
          window.webglGeneratorApi.selection.select({kind: mode, id: target});
          panel.setTargetStateId(target);
        }
        if (mode === "province") {
          window.webglGeneratorApi.selection.select({kind: mode, id: target});
          panel.setSelectedProvinceId(target);
        }
        if (mode === "culture") panel.setSelectedCultureId(target);
        if (mode === "religion") panel.setSelectedReligionId(target);
      }
      if (mode === "market") {
        const m = map.pack.markets.find((m) => m?.i > 0 && !ids.some((i) => pc.market[i] === m.i));
        if (!m) continue;
        panel.setSelectedMarketId(m.i);
      }
      if (mode === "biome" && ids.some((id) => c.biome[id] === brush.targetId)) continue;
      if (mode === "level" && Math.abs(c.h[ids[0]] - c.h[ids.at(-1)]) < 2) continue;
      if (mode === "smooth") {
        const end = r.screenToWorld(x + distance, y);
        const heights = [];
        for (let id = 0; id < c.h.length; id++) {
          const p = map.grid.points[c.p[id]];
          if (Math.hypot(p[0] - end.x, p[1] - end.y) <= radius) heights.push(c.h[id]);
        }
        if (heights.length < 2 || Math.max(...heights) - Math.min(...heights) < 5) continue;
      }
      if (field === "h" && mode !== "selection" && gridIds.some((i) => c.h[i] < 24 || c.h[i] > 96)) continue;
      window.readBrushOutcome = () => {
        const selection = app.heightEdit.terrainSelection?.cellIds || [];
        const changed = mode === "selection" ? selection.length : values().reduce((n, v, i) => n + Number(v !== original[i]), 0);
        const near = (id) => {
          const p = map.grid.points[c.p[id]];
          return gridIds[0] !== id && Math.hypot(...[0, 1].map((k) => p[k] - map.grid.points[c.p[gridIds.at(-1)]][k])) <= radius + 4;
        };
        const traveled =
          mode === "selection"
            ? selection.includes(gridIds.at(-1))
            : packOnly
              ? ids.slice(-2).some((id) => original[id] !== values()[id])
              : values().some((v, i) => v !== original[i] && near(i));
        return {changed, traveled, depth: app.editHistory.getStats().undo};
      };
      return {x, y, cells: c.h.length, camera: {...r.camera}, view: r.colorMode, dpr: devicePixelRatio, target, depth: app.editHistory.getStats().undo};
    }
  throw Error("未找到无遮挡的合法陆地轨迹 " + JSON.stringify(brush));
}

function instrument() {
  let active = null;
  document.addEventListener(
    "pointerdown",
    (event) => {
      window.brushPointerId = event.pointerId;
    },
    true,
  );
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, callback, options) {
    if (
      this instanceof HTMLCanvasElement &&
      ["pointermove", "pointerup", "pointerdown"].includes(type) &&
      typeof callback === "function"
    ) {
      return add.call(
        this,
        type,
        function (e) {
          if (!active) return callback.call(this, e);
          const t = performance.now();
          active.phase = type;
          if (type === "pointerdown" && active.down == null) active.down = t;
          try {
            return callback.call(this, e);
          } finally {
            active.events[type] = Math.max(active.events[type] || 0, performance.now() - t);
          }
        },
        options,
      );
    }
    return add.call(this, type, callback, options);
  };
  const obs = new PerformanceObserver((list) => {
    if (active) active.tasks.push(...list.getEntries());
  });
  obs.observe({type: "longtask"});
  const animationObserver = PerformanceObserver.supportedEntryTypes.includes("long-animation-frame") && new PerformanceObserver(list => {
    if (active) active.animations.push(...list.getEntries());
  });
  if (animationObserver) animationObserver.observe({type: "long-animation-frame"});
  window.beginBrushProbe = () => {
    obs.takeRecords();
    animationObserver && animationObserver.takeRecords();
    const data = (active = {start: performance.now(), phase: "idle", tasks: [], animations: [], frames: [], events: {}, calls: {}});
    window.brushProbeStart = data.start;
    const frame = (t) => {
      if (active !== data) return;
      data.frames.push([t, data.phase]);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const r = window.__webglGeneratorApp.renderer;
    const job = window.__webglGeneratorApp.socialBrushPreparation;
    if (job) {
      const read = job.read;
      job.read = () => {
        const prepared = read();
        if (active) active.preparedAtCommit = Boolean(prepared);
        return prepared;
      };
    }
    data.oldPaths = new Set([...r.shoreVisualPaths.coastline, ...r.shoreVisualPaths.lakeShore]);
    for (const name of [
      "draw",
      "refreshCellSurface",
      "refreshEditedCellColors",
      "refreshHeightCells",
      "refreshResidentHeightTopology",
      "refreshShoreLineLayer",
      "refreshGpuResidentShoreSurface",
      "refreshPoliticalLineLayers",
      "refreshObjectPickingIndex",
      "setHeightCellSelection",
      "refreshLineLayers",
      "refreshLabels",
      "buildLabels",
      "updateLabels",
    ]) {
      const fn = r[name];
      if (!fn) continue;
      r[name] = function (...args) {
        if (!active) return fn.apply(this, args);
        const t = performance.now();
        let result;
        try {
          return (result = fn.apply(this, args));
        } finally {
          const s = (active.calls[name] ??= {n: 0, max: 0});
          if (name === "draw" && active.down != null && active.ink == null) active.ink = performance.now();
          s.n++;
          const ms = +(performance.now() - t).toFixed(1);
          if (ms >= s.max) {
            s.max = ms;
            if (name === "refreshHeightCells" || name === "refreshResidentHeightTopology") s.detail = result;
          }
        }
      };
    }
  };
  window.finishBrushProbe = () => {
    const d = active;
    d.tasks.push(...obs.takeRecords());
    if (animationObserver) d.animations.push(...animationObserver.takeRecords());
    active = null;
    const gaps = d.frames.slice(1).map(([t, p], i) => [Math.round((t - d.frames[i][0]) * 10) / 10, p]);
    const ordered = gaps.map(([n]) => n).sort((a, b) => a - b);
    const a = window.__webglGeneratorApp;
    return {
      handlers: d.events,
      preparedAtCommit: d.preparedAtCommit,
      firstDrawMs: d.ink == null ? null : +(d.ink - d.down).toFixed(1),
      maxHandler: Math.max(...Object.values(d.events)),
      long: d.tasks.filter((e) => e.startTime >= d.start).map((e) => e.duration),
      frameP95: ordered[Math.floor(ordered.length * 0.95)],
      frameMax: ordered.at(-1),
      slowFrames: gaps.filter(([ms]) => ms >= 45),
      longFrames: d.animations.filter(e => e.startTime >= d.start).map(e => ({
        duration: e.duration, blocking: e.blockingDuration, beforeRender: Math.round(e.renderStart - e.startTime),
        scripts: e.scripts.map(s => ({name: s.invoker, ms: s.duration, layout: s.forcedStyleAndLayoutDuration,
          source: s.sourceURL?.split("/").at(-1), fn: s.sourceFunctionName, pos: s.sourceCharPosition}))
      })),
      calls: d.calls,
      commit: a.healthMonitor
        .getCanvasSamples()
        .filter((s) => s.phase === "state-brush-commit")
        .at(-1),
      shore: a.renderer.shoreVisualPaths?.topology?.incremental
        ? {
            edgesMs: a.renderer.shoreVisualPaths.topology.edgesMs,
            coastMs: a.renderer.shoreVisualPaths.topology.coastMs,
            lakeMs: a.renderer.shoreVisualPaths.topology.lakeMs,
            changed: a.renderer.shoreVisualPaths.coastline
              .concat(a.renderer.shoreVisualPaths.lakeShore)
              .filter((p) => !d.oldPaths.has(p))
              .map((p) => [p.points.length, p.renderPoints.length, p.topologyFallbackReason]),
          }
        : undefined,
      glError: a.renderer.gl.getError(),
    };
  };
}
