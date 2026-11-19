#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5605, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const reports = [];
const archive = process.env.FMG_REAL_ARCHIVE;
try {
  for (const cellsTarget of archive || process.argv.includes("--large") ? [100000] : [10000, 100000]) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && !message.text().startsWith("[FMG health]")) errors.push(message.text());
    });
    await page.addInitScript(() => {
      window.__task419LongTasks = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__task419LongTasks.push({start: entry.startTime, duration: entry.duration});
      }).observe({type: "longtask", buffered: true});
    });
    await page.goto("http://127.0.0.1:5605/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, 45000);
    if (archive) {
      await page.evaluate(() => {window.__previousMap = window.__webglGeneratorApp.map;});
      await page.locator("#import-map-file").setInputFiles(archive);
      await page.waitForFunction(() => window.__webglGeneratorApp.map !== window.__previousMap
        && window.__webglGeneratorApp.map?.grid.cells.i.length === 100000);
    } else {
      const generated = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({confirm: true, seed: `state-label-visibility-${target}`, cellsTarget: target}), cellsTarget);
      assert.equal(generated.ok, true, JSON.stringify(generated.error));
    }
    await waitForApiReady(page, 180000);
    await page.locator("#open-generation-panel").click();
    await page.locator('[data-control-tab="themes"]').click();
    const segmented = page.locator(".view-mode-segmented");
    const stateModeLabel = await segmented.locator('[data-mode="states"]').textContent();
    await segmented.locator(".el-segmented__item").getByText(stateModeLabel.trim(), {exact:true}).click();
    await page.waitForFunction(() => window.__webglGeneratorApp.renderer.colorMode === "states", null, {timeout:15000});
    await waitForApiReady(page, 15000);
    await page.locator('[data-panel-id="generation-panel"] .floating-panel-close').click();
    if (cellsTarget === 100000) {
      const legend = page.locator("#state-number-legend");
      await legend.waitFor({state:"visible"});
      const checkPalette = () => legend.evaluate(el => {
        const common = getComputedStyle(document.querySelector("#map-legend"));
        const panel = getComputedStyle(el);
        const number = getComputedStyle(el.querySelector(".state-legend-number"));
        const name = getComputedStyle(el.firstElementChild.lastElementChild);
        if (["backgroundColor", "borderTopColor", "color"].some(key => common[key] !== panel[key])
          || name.color !== common.color || number.color !== common.color || number.borderTopColor !== common.color
          || number.backgroundColor !== "rgba(0, 0, 0, 0)") {
          throw Error(`国家图例与主题图例配色不一致：${panel.backgroundColor} / ${common.backgroundColor}`);
        }
        return panel.backgroundColor;
      });
      const background = await checkPalette();
      const readKey = () => legend.evaluate(el => {
        const items = window.__webglGeneratorApp.renderer.labelItems.filter(item => item.visible && item.numbered);
        const rows = [...el.children].map((row, index) => {
          const id = Number(row.dataset.stateId);
          const item = items.find(item => item.targetId === id);
          const glyph = item?.glyphNodes[0];
          const box = glyph?.getBoundingClientRect();
          const number = Number(row.firstElementChild.textContent);
          const mark = row.firstElementChild;
          const keyBox = mark.getBoundingClientRect();
          if (!box || glyph.textContent !== String(number) || row.lastElementChild.textContent !== item.text
            || number !== index + 1 || [glyph, mark].some(node => getComputedStyle(node).fontSize !== "16px")
            || getComputedStyle(mark).borderRadius !== "50%" || Math.abs(keyBox.width - keyBox.height) > 0.5
            || Math.abs(keyBox.width - box.width) > 0.6 || Math.abs(box.width - box.height) > 0.5
            || Math.abs(box.width - Math.max(20, String(number).length * 9 + 4)) > 0.6) {
            throw Error("图上圈号、直径与国名图例不符：" + JSON.stringify({id, number, width:box?.width}));
          }
          return {id, number, diameter:Math.round(box.width)};
        });
        if (rows.length !== items.length || new Set(rows.map(row => row.number)).size !== rows.length) throw Error("圈号遗漏或重复");
        const box = el.getBoundingClientRect();
        const scale = document.querySelector("#map-scale-bar").getBoundingClientRect();
        if (scale.width && (Math.abs(scale.left-box.left) > 1 || Math.abs(scale.top-box.bottom-6) > 1)) throw Error("图例与比例尺未对齐");
        const names = {full:[], short:[]};
        for (const item of window.__webglGeneratorApp.renderer.labelItems) {
          if (item.visible && item.targetKind === "state" && !item.numbered) {
            names[item.displayText === item.text ? "full" : "short"].push(item.displayText);
          }
        }
        return {rows, names, height:box.height, width:box.width, columns:getComputedStyle(el).gridTemplateColumns.split(" ").length};
      });
      const before = await readKey();
      assert.ok(before.height <= 125 && before.rows.every(row => row.number > 0 && row.number < 100));
      if (archive) assert.ok(before.rows.some(row => row.id >= 1000));
      if (process.env.FMG_LABEL_SCREENSHOT) {
        await page.mouse.move(1,1);
        await page.screenshot({path:process.env.FMG_LABEL_SCREENSHOT, animations:"disabled"});
      }
      const initial = await legend.locator(":scope > div").first().innerText();
      const id = before.rows[0].id;
      const renamed = await page.evaluate(id => window.webglGeneratorApi.edit.states.rename(id, "东岚"), id);
      assert.ok(renamed.ok, JSON.stringify(renamed.error));
      await page.waitForFunction(() => document.querySelector("#state-number-legend")?.textContent.includes("东岚"));
      assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
      await page.waitForFunction(name => document.querySelector("#state-number-legend > div")?.innerText === name, initial);
      await page.locator("#open-generation-panel").click();
      await page.locator('[data-control-tab="layers"]').click();
      const toggle = page.locator('[data-control-panel="layers"] button[data-layer="stateLabels"]');
      await toggle.click();
      await legend.waitFor({state:"hidden"});
      await toggle.click();
      await legend.waitFor({state:"visible"});
      const exportDiff = await page.evaluate(async () => {
        const sample = async enabled => {
          const result = await window.webglGeneratorApi.data.exportPNG({download:false, includeDataUrl:true,
            includeMapOverlays:true, crop:{mode:"viewport"}, overlays:{legend:enabled}});
          if (!result.ok) throw Error(JSON.stringify(result.error));
          const image = new Image();
          image.src = result.data.dataUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image,0,0);
          const rect = document.querySelector("#state-number-legend").getBoundingClientRect();
          const stage = document.querySelector("#map-canvas").getBoundingClientRect();
          const sx = image.width/stage.width, sy = image.height/stage.height;
          // The lower-left padding contains only the translucent panel over the map.
          const x = Math.floor((rect.left-stage.left+4)*sx), y = Math.floor((rect.bottom-stage.top-3)*sy);
          if (!enabled) {
            ctx.fillStyle = getComputedStyle(document.querySelector("#map-legend")).backgroundColor;
            ctx.fillRect(x,y,1,1);
          }
          return {pixel:ctx.getImageData(x,y,1,1).data,
            region:ctx.getImageData((rect.left-stage.left)*sx,(rect.top-stage.top)*sy,rect.width*sx,rect.height*sy).data};
        };
        const a = await sample(true), b = await sample(false);
        if (a.pixel.some((value,i) => Math.abs(value-b.pixel[i]) > 2)) throw Error(`PNG 图例底色不符：${a.pixel} / ${b.pixel}`);
        return a.region.reduce((n,value,i)=>n+Number(value!==b.region[i]),0);
      });
      assert.ok(exportDiff > 100, "导出开关没有改变编号图例像素");
      await page.evaluate(async () => {
        const legend = document.querySelector("#state-number-legend");
        legend.style.maxHeight = "18px";
        legend.scrollTop = legend.scrollHeight;
        const entries = Array.from(legend.children, row => [row.firstChild.textContent, row.lastChild.textContent]);
        const drawn = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        const ellipse = CanvasRenderingContext2D.prototype.ellipse;
        try {
          CanvasRenderingContext2D.prototype.ellipse = function(...args) {
            drawn.push(null);
            return ellipse.apply(this, args);
          };
          CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
            drawn.push(text);
            return original.call(this, text, ...args);
          };
          const result = await window.webglGeneratorApi.data.exportPNG({download:false, includeMapOverlays:true, crop:{mode:"viewport"}});
          if (!result.ok || entries.some(([number, name]) => !drawn.some((text, i) =>
            text === name && drawn[i-1] === number && drawn[i-2] === null))) throw Error("导出时遗漏圈号或对应的全称");
        } finally {
          CanvasRenderingContext2D.prototype.ellipse = ellipse;
          CanvasRenderingContext2D.prototype.fillText = original;
          legend.style.maxHeight = "";
        }
      });
      await page.locator('[data-panel-id="generation-panel"] .floating-panel-close').click();
      const scaleBefore = await page.evaluate(() => window.__webglGeneratorApp.renderer.camera.scale);
      await page.mouse.move(1080,370);
      await page.mouse.wheel(0,230);
      await page.waitForFunction(s => window.__webglGeneratorApp.renderer.camera.scale < s, scaleBefore);
      await page.mouse.wheel(0,-230);
      await page.waitForFunction(s => Math.abs(window.__webglGeneratorApp.renderer.camera.scale-s)<0.002, scaleBefore);
      await page.waitForTimeout(300);
      await page.mouse.move(880,400);
      await page.mouse.down({button:"middle"});
      await page.mouse.move(950,415,{steps:4});
      await page.mouse.up({button:"middle"});
      await page.waitForTimeout(300);
      const after = await readKey();
      const shared = before.rows.filter(row => after.rows.some(other => other.id === row.id));
      assert.ok(shared.length);
      if (shared.length === before.rows.length && shared.length === after.rows.length) assert.deepEqual(after.rows, before.rows);
      console.log(JSON.stringify({legendState:id, exportDiff, before, shared:shared.length}));
      if (archive) {
        const firstMark = await page.locator(".state-label--number.visible .political-label-glyph").evaluateAll(
          nodes => nodes.find(node => node.textContent === "1").getBoundingClientRect().x);
        const offset = Math.ceil(firstMark + 42);
        await page.mouse.move(1400,400);
        await page.mouse.down({button:"middle"});
        await page.mouse.move(1400-offset,400,{steps:4});
        await page.mouse.up({button:"middle"});
        await page.waitForFunction(id => !document.querySelector('#state-number-legend [data-state-id="' + id + '"]'), after.rows[0].id);
        const subset = await readKey();
        assert.ok(subset.rows.length && subset.rows.length < after.rows.length && subset.rows[0].number === 1);
        await page.mouse.down({button:"middle"});
        await page.mouse.move(1400,400,{steps:4});
        await page.mouse.up({button:"middle"});
        await page.waitForFunction(id => document.querySelector('#state-number-legend [data-state-id="' + id + '"]'), after.rows[0].id);
        assert.deepEqual((await readKey()).rows,after.rows);
        await page.mouse.move(720,450);
        await page.mouse.wheel(0,650);
        await page.waitForFunction(s => window.__webglGeneratorApp.renderer.camera.scale < s * 0.65, scaleBefore);
        await page.waitForTimeout(350);
        const overview = await readKey();
        assert.ok(overview.names.full.length && overview.names.short.length, "远景应同时保留能容纳的全称和受限国家的简称");
        assert.ok(overview.rows.length >= 7 && overview.columns === 2 && overview.height <= 125, JSON.stringify(overview));
        if (process.env.FMG_LEGEND_OVERVIEW) {
          await page.locator("#open-generation-panel").hover();
          await page.screenshot({path:process.env.FMG_LEGEND_OVERVIEW, animations:"disabled"});
        }
        await page.mouse.move(720,450);
        await page.mouse.wheel(0,-650);
        await page.waitForFunction(s => Math.abs(window.__webglGeneratorApp.renderer.camera.scale-s)<0.002, scaleBefore);
        await page.setViewportSize({width:390, height:700});
        await page.waitForTimeout(400);
        const narrow = await readKey();
        assert.ok(narrow.rows.length && narrow.columns === 1 && narrow.height <= 125 && narrow.width < 176);
        const originalTheme = await page.evaluate(() => window.__webglGeneratorApp.renderer.visualTheme.id);
        const switchTheme = async id => {
          const result = await page.evaluate(theme => window.webglGeneratorApi.layers.setTheme(theme), id);
          assert.ok(result.ok, JSON.stringify(result.error));
          await page.waitForFunction(theme => window.__webglGeneratorApp.renderer.visualTheme.id === theme, id);
        };
        await switchTheme(originalTheme === "ancient" ? "default" : "ancient");
        const alternateBackground = await checkPalette();
        assert.notEqual(alternateBackground, background);
        await switchTheme(originalTheme);
        assert.equal(await checkPalette(), background);
        assert.deepEqual(errors, []);
        reports.push({cellsTarget, archive:true, subset, overview, narrow, background, alternateBackground});
        await page.close();
        continue;
      }
    }
    const result = await page.evaluate(() => {
      const {map, renderer} = window.__webglGeneratorApp;
      const states = renderer.labelItems.filter(item => item.targetKind === "state" && item.componentCellSet?.size && !item.layout?.locked);
      states.sort((left, right) => right.componentCellSet.size - left.componentCellSet.size);
      const state = states[0];
      const city = renderer.labelItems.find(item => item.targetKind === "city");
      if (!state || !city) throw new Error("缺少国家或城市标签样本");
      const rect = renderer.canvas.getBoundingClientRect();
      const insideLabel = (item, position) => {
        const base = renderer.worldToScreen(item.x, item.y, rect);
        const point = position || renderer.screenToWorld(rect.left + base.x + (item.politicalOffsetX || 0), rect.top + base.y + (item.politicalOffsetY || 0));
        const cells = map.pack.cells;
        const vertices = map.pack.vertices.p;
        return item.componentCells.some(cell => {
          const vertexIds = cells.v[cell];
          if (!vertexIds || vertexIds.length < 3) return false;
          let inside = false;
          for (let index = 0, previous = vertexIds.length - 1; index < vertexIds.length; previous = index++) {
            const a = vertices[vertexIds[index]];
            const b = vertices[vertexIds[previous]];
            if ((a[1] > point.y) !== (b[1] > point.y)
              && point.x < ((b[0] - a[0]) * (point.y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
          }
          return inside;
        });
      };
      const initialVisibleStates = states.filter(item => item.visible);
      const modes = {number:0, short:0, full:0};
      const legend = document.querySelector("#state-number-legend");
      for (const item of initialVisibleStates) {
        if (item.numbered) {
          modes.number++;
          if (![...legend.children].some(row => row.firstChild.textContent === item.displayText && row.lastChild.textContent === item.text)) throw Error("圈号缺少完整国名");
          continue;
        }
        modes[item.displayText === item.text ? "full" : "short"]++;
        for (const glyph of item.glyphNodes) {
          const g = glyph.getBoundingClientRect();
          for (const x of [g.left - 1, g.right + 1]) for (const y of [g.top - 1, g.bottom + 1]) {
            if (!insideLabel(item, renderer.screenToWorld(x,y))) throw Error(`实际字形未在本土留白：${item.text} ${glyph.textContent}`);
            const grid = renderer.pickCellClientPoint(x,y)?.gridCell;
            if (map.grid.cells.state[grid] !== item.targetId || map.grid.cells.h[grid] < 20) throw Error(`实际字形越过画布国界：${item.text} ${glyph.textContent}`);
          }
        }
      }
      if (!initialVisibleStates.length || initialVisibleStates.some(item => !insideLabel(item))) {
        throw new Error(`初始可见国家标签中点越界：${initialVisibleStates.filter(item => !insideLabel(item)).map(item => item.targetId)}`);
      }
      const originalItems = renderer.labelItems;
      renderer.labelItems = [city, state];
      renderer.layerVisibility.labels = true;
      renderer.layerVisibility.stateLabels = true;
      renderer.viewportInteractionKind = null;
      renderer.camera.scale = 1.2;
      const centerAt = (screenX, screenY) => {
        const x = ((state.x / map.metadata.graphWidth) * 2 - 1) * renderer.camera.scale;
        const y = (1 - (state.y / map.metadata.graphHeight) * 2) * renderer.camera.scale;
        renderer.camera.offsetX = screenX / rect.width * 2 - 1 - x;
        renderer.camera.offsetY = 1 - screenY / rect.height * 2 - y;
      };
      const sample = () => ({candidate: state.politicalCandidateIndex, offsetX: state.politicalOffsetX, offsetY: state.politicalOffsetY,
        stateVisible: state.visible, cityVisible: renderer.labelItems.includes(city) && city.visible,
        cityBuffered: renderer.labelItems.includes(city) && city.buffered, inside: insideLabel(state)});
      const ensure = (condition, message) => {if (!condition) throw new Error(`${message}: ${JSON.stringify(sample())}`);};
      const startedAt = performance.now();
      centerAt(rect.width / 2, rect.height / 2);
      city.x = state.x;
      city.y = state.y;
      city.minScale = 0;
      city.resolvedStyle = {...city.resolvedStyle, opacity: 1};
      state.resolvedStyle = {...state.resolvedStyle, opacity: 1};
      renderer.labelItems = [state];
      renderer.updateLabels();
      const clearCandidate = state.politicalCandidateIndex;
      renderer.labelItems = [city, state];
      renderer.updateLabels();
      const obstacleVisible = sample();
      ensure(obstacleVisible.cityVisible && obstacleVisible.stateVisible && (obstacleVisible.candidate !== clearCandidate || state.node.classList.contains("city-overlap")) && obstacleVisible.inside, "显示城市标签时国家未正确避让或中点越界");

      renderer.layerVisibility.labels = false;
      renderer.updateLabels();
      const layerHidden = sample();
      ensure(!layerHidden.cityVisible && layerHidden.candidate === clearCandidate && layerHidden.inside, "城市图层关闭后国家未回原位");

      renderer.layerVisibility.labels = true;
      city.resolvedStyle = {...city.resolvedStyle, opacity: 0};
      renderer.updateLabels();
      const transparent = sample();
      ensure(!transparent.cityVisible && transparent.candidate === clearCandidate && transparent.inside, "透明城市标签仍触发避让");

      city.resolvedStyle = {...city.resolvedStyle, opacity: 1};
      renderer.labelItems = [state];
      centerAt(4 - (city.metrics?.width || 40) / 2, rect.height / 2);
      renderer.updateLabels();
      const edgeBaseline = sample();
      const cityWidth = city.metrics?.width || 40;
      const offscreen = renderer.screenToWorld(rect.left + 4 - cityWidth / 2, rect.top + rect.height / 2);
      city.x = offscreen.x;
      city.y = offscreen.y;
      renderer.labelItems = [city, state];
      renderer.updateLabels();
      const buffered = sample();
      ensure(buffered.cityBuffered && !buffered.cityVisible && buffered.candidate === edgeBaseline.candidate && buffered.inside,
        "画面外预热标签仍触发避让");

      let localRefreshBoxes = null;
      const originalCityIcons = renderer.updateCityIcons;
      const originalMarkerIcons = renderer.updateMarkerIcons;
      const originalMilitaryIcons = renderer.updateMilitaryIcons;
      const originalSelectionMarker = renderer.updateSelectionMarker;
      try {
        renderer.updateCityIcons = () => [];
        renderer.updateMarkerIcons = (_rect, boxes) => {localRefreshBoxes = boxes.length;};
        renderer.updateMilitaryIcons = () => {};
        renderer.updateSelectionMarker = () => {};
        renderer.refreshCityLayerOverlay();
      } finally {
        renderer.updateCityIcons = originalCityIcons;
        renderer.updateMarkerIcons = originalMarkerIcons;
        renderer.updateMilitaryIcons = originalMilitaryIcons;
        renderer.updateSelectionMarker = originalSelectionMarker;
      }
      ensure(localRefreshBoxes === 1, "城市图层局部刷新仍把画面外预热标签作为障碍");

      renderer.camera.offsetX += 240 / rect.width;
      renderer.viewportInteractionKind = "pan";
      renderer.updateLabels();
      const panEntry = sample();
      ensure(panEntry.cityVisible && panEntry.stateVisible && panEntry.candidate !== buffered.candidate && panEntry.inside,
        "平移入场的城市标签未触发国家重新避让");
      renderer.camera.offsetX -= 240 / rect.width;
      renderer.updateLabels();
      const panExit = sample();
      ensure(panExit.cityBuffered && !panExit.cityVisible && panExit.candidate === edgeBaseline.candidate && panExit.inside,
        "平移离场的城市标签仍占据国家候选");
      renderer.viewportInteractionKind = null;

      renderer.labelItems = [state];
      renderer.camera.scale = 1.2;
      centerAt(rect.width / 2, rect.height / 2);
      renderer.updateLabels();
      const end = state.glyphNodes.at(-1).getBoundingClientRect();
      const separation = (end.left + end.right) / 2 - rect.left - rect.width / 2;
      const cityLift = (Number(city.node.dataset.cityIconClearance) || 6) + city.metrics.height / 2;
      const separatedCityPoint = renderer.screenToWorld(rect.left + rect.width / 2 + separation, end.top + end.height / 2 + cityLift);
      city.x = separatedCityPoint.x;
      city.y = separatedCityPoint.y;
      renderer.labelItems = [city, state];
      renderer.camera.scale = 2.4;
      centerAt(rect.width / 2, rect.height / 2);
      renderer.updateLabels();
      const zoomSeparated = sample();
      ensure(zoomSeparated.cityVisible && zoomSeparated.inside, "缩放前国家中点越界或城市未显示");
      renderer.camera.scale = 1.2;
      centerAt(rect.width / 2, rect.height / 2);
      renderer.viewportInteractionKind = "zoom";
      renderer.updateLabels();
      const zoomApproach = sample();
      ensure(zoomApproach.cityVisible && (zoomApproach.candidate !== clearCandidate || state.node.classList.contains("city-overlap")) && zoomApproach.inside,
        "缩放后同一可见城市靠近国家标签却未重新避让");
      renderer.viewportInteractionKind = null;
      renderer.labelItems = [state];
      renderer.updateLabels();
      state.politicalOffsetX = rect.width * 2;
      renderer.viewportInteractionKind = "zoom";
      renderer.updateLabels();
      const staleZoom = sample();
      ensure(staleZoom.stateVisible && staleZoom.inside && Math.abs(staleZoom.offsetX) < rect.width,
        "缩放复用失效锚点后国家标签越出国土");
      renderer.viewportInteractionKind = null;

      renderer.camera.scale = 4.5;
      centerAt(rect.width / 2, rect.height / 2);
      renderer.updateLabels();
      const scaleHidden = sample();
      ensure(!scaleHidden.stateVisible && !state.box, "缩放淡出的国家标签仍保留碰撞盒");
      const originalScaleCityIcons = renderer.updateCityIcons;
      const enteringPoliticalBoxes = [];
      renderer.updateCityIcons = (_rect, boxes) => {
        enteringPoliticalBoxes.push(boxes.length);
        return [];
      };
      try {
        renderer.camera.scale = 1.2;
        centerAt(rect.width / 2, rect.height / 2);
        renderer.viewportInteractionKind = "zoom";
        renderer.updateLabels();
        ensure(state.node.classList.contains("scale-entering") && enteringPoliticalBoxes.at(-1) === 0,
          "缩放进入时透明国家标签仍占据避让盒");
        state.node.classList.remove("scale-entering");
        renderer.viewportInteractionKind = null;
        renderer.updateLabels();
        ensure(!state.node.classList.contains("scale-entering") && enteringPoliticalBoxes.at(-1) === 1,
          "国家标签显示后未在下一帧补入避让盒");
      } finally {
        renderer.updateCityIcons = originalScaleCityIcons;
      }
      const scaleEntry = {firstBoxes: enteringPoliticalBoxes[0], settledBoxes: enteringPoliticalBoxes.at(-1)};
      renderer.viewportInteractionKind = null;
      renderer.labelItems = originalItems;
      return {startedAt, modes, initialVisibleStateCount: initialVisibleStates.length, stateId: state.targetId, stateCells: state.componentCellSet.size,
        obstacleVisible, layerHidden, transparent, edgeBaseline, buffered, localRefreshBoxes, panEntry, panExit, zoomSeparated, zoomApproach, staleZoom, scaleHidden, scaleEntry,
        glError: renderer.gl.getError()};
    });
    await page.waitForTimeout(200);
    const longTasks = await page.evaluate(start => window.__task419LongTasks.filter(entry => entry.start >= start), result.startedAt);
    assert.equal(result.glError, 0, `${cellsTarget} WebGL 错误`);
    assert.deepEqual(errors, [], `${cellsTarget} 页面错误`);
    assert.equal(longTasks.filter(entry => entry.duration > 200).length, 0, `${cellsTarget} 标签交互超过 200ms LongTask`);
    reports.push({cellsTarget, ...result, longTasks});
    await page.close();
  }
  console.log(JSON.stringify({ok: true, reports}, null, 2));
} finally {
  await browser.close();
  await server.httpServer.close();
}
