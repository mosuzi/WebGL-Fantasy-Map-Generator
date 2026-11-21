#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {auditCountryLabels} from "./webgl-generator-country-label-audit.mjs";

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
    if (archive && process.env.FMG_COUNTRY_AUDIT) {
      reports.push(await auditCountryLabels(page, process.env.FMG_COUNTRY_AUDIT));
      assert.deepEqual(errors, []);
      await page.close();
      continue;
    }
    if (archive) {
      const focus = process.env.FMG_LABEL_FOCUS || "雁门部盟";
      await page.evaluate(name => {
        const r = window.__webglGeneratorApp.renderer;
        const item = r.labelItems.find(i => i.targetKind === "state" && i.text === name);
        r.locateBounds({minX:item.x, maxX:item.x, minY:item.y, maxY:item.y}, {minScale:1, maxScale:1});
      }, focus);
      await page.waitForFunction(() => !window.__webglGeneratorApp.renderer.viewportInteractionKind);
      const sample = () => page.evaluate(name => {
        const {map, renderer} = window.__webglGeneratorApp;
        const item = renderer.labelItems.find(item => item.targetKind === "state" && item.text === name);
        if (!item) throw Error("存档缺少目标国家：" + name);
        const cells = item.componentCellSet;
        const rect = renderer.canvas.getBoundingClientRect();
        const origin = renderer.worldToScreen(item.x,item.y,rect);
        const territory = (x, y) => {
          const grid = renderer.pickCellClientPoint(x, y)?.gridCell;
          return grid != null && map.grid.cells.state[grid] === item.targetId && map.grid.cells.h[grid] >= 20;
        };
        const inkInside = item.glyphNodes.every(glyph => {
          const r = glyph.getBoundingClientRect();
          return [r.left - 1, r.right + 1].every(x => [r.top - 1, r.bottom + 1].every(y => territory(x, y)));
        });
        const states = renderer.labelItems.filter(label => label.targetKind === "state");
        const shown = states.filter(label => label.visible);
        const full = shown.filter(label => label.displayText === label.text).length;
        const centers = item.glyphNodes.map(glyph => {
          const box = glyph.getBoundingClientRect();
          return {x: box.left + box.width / 2, y: box.top + box.height / 2};
        });
        const steps = [];
        let pickedWater = false;
        for (let i = 1; i < centers.length; i++) {
          const left = centers[i - 1], right = centers[i];
          steps.push(Math.hypot(right.x - left.x, right.y - left.y));
          for (let step = 1; step < 32; step++) {
            const x = left.x + (right.x - left.x) * step / 32, y = left.y + (right.y - left.y) * step / 32;
            const cell = renderer.pickCellClientPoint(x, y)?.gridCell;
            if (cell == null || map.grid.cells.h[cell] >= 20) continue;
            const picked = renderer.pickLabel(x, y);
            if (picked?.targetKind === "state" && picked.targetId === item.targetId) pickedWater = true;
          }
        }
        return {
          id: item.targetId, name: item.text, short: item.state.name, capital: map.pack.burgs[item.state.capital]?.name,
          cells: cells.size, visible: item.visible, text: item.glyphNodes.map(glyph => glyph.textContent).join(""),
          font: parseFloat(getComputedStyle(item.contentNode).fontSize), scale: renderer.camera.scale, inkInside,
          centers: centers.map(point => renderer.screenToWorld(point.x, point.y)), steps, pickedWater,
          hitGlyphs: centers.filter(point => {
            const hit = renderer.pickLabel(point.x, point.y);
            return hit?.targetKind === "state" && hit.targetId === item.targetId;
          }).length,
          origin: {x: rect.left + origin.x, y: rect.top + origin.y}, shown: shown.map(label => label.targetId),
          sx: rect.width * renderer.camera.scale / map.metadata.graphWidth, sy: rect.height * renderer.camera.scale / map.metadata.graphHeight,
          modes: {full, short: shown.length - full, hidden: states.length - shown.length}
        };
      }, focus);
      const initial = await sample();
      const zoomStarted = await page.evaluate(() => performance.now());
      let previewError = 0;
      const zoom = async (delta, checkPreview = false) => {
        const start = (await sample()).scale;
        await page.mouse.wheel(0, delta);
        if (checkPreview) {
          const reading = await page.waitForFunction(({id, centers, start}) => {
            const r = window.__webglGeneratorApp.renderer;
            if (!r.overlayInteractionSuspended || r.camera.scale === start || r.overlayPreviewTransform.scale === 1) return false;
            const item = r.labelItems.find(i => i.targetKind === "state" && i.targetId === id);
            const rect = r.canvas.getBoundingClientRect();
            return {errors: item.glyphNodes.map((node, i) => {
              const p = r.worldToScreen(centers[i].x, centers[i].y, rect);
              const b = node.getBoundingClientRect();
              return Math.hypot(b.x + b.width / 2 - rect.left - p.x, b.y + b.height / 2 - rect.top - p.y);
            })};
          }, {id: initial.id, centers: initial.centers, start}, {timeout: 2500});
          previewError = Math.max(...(await reading.jsonValue()).errors);
          assert.ok(previewError < 1, `滚轮手势期间国名字位误差 ${previewError}px`);
        }
        await page.waitForFunction(previous => {
          const renderer = window.__webglGeneratorApp.renderer;
          return renderer.camera.scale !== previous && renderer.overlayCommittedCamera?.scale === renderer.camera.scale
            && !renderer.viewportInteractionKind;
        }, start);
        return sample();
      };
      await page.mouse.move(initial.origin.x, initial.origin.y);
      const detail = await zoom(-500, true);
      if (process.env.FMG_LABEL_SCREENSHOT) {
        const clip = {x:Math.max(0,Math.round(detail.origin.x)-415),y:Math.max(0,Math.round(detail.origin.y)-140),width:840,height:370};
        await page.screenshot({path:process.env.FMG_LABEL_SCREENSHOT,clip,animations:"disabled"});
      }
      await zoom(500);
      const far = await zoom(650);
      await zoom(-650);
      const restored = await sample();
      const zoomLongTasks = await page.evaluate(start => window.__task419LongTasks.filter(entry => entry.start >= start), zoomStarted);
      for (const at of [initial, detail, far, restored]) {
        assert.ok(at.visible && at.inkInside && [at.name, at.short].includes(at.text), JSON.stringify(at));
      }
      assert.equal(initial.text, focus);
      assert.equal(detail.text, focus);
      const pan = async (x, y) => {
        const before = await page.evaluate(() => window.__webglGeneratorApp.renderer.camera.offsetX);
        await page.mouse.down({button: "middle"});
        await page.mouse.move(x, y, {steps: 4});
        await page.mouse.up({button: "middle"});
        await page.waitForFunction(start => {
          const r = window.__webglGeneratorApp.renderer;
          return r.camera.offsetX !== start && r.overlayCommittedCamera?.offsetX === r.camera.offsetX && !r.viewportInteractionKind;
        }, before);
        return sample();
      };
      const moved = await pan(initial.origin.x + 45, initial.origin.y + 25);
      const back = await pan(initial.origin.x, initial.origin.y);
      let settledError = 0;
      for (const view of [initial, detail, far, restored, moved, back]) {
        assert.ok(view.visible && view.inkInside && view.hitGlyphs === initial.centers.length, JSON.stringify(view));
        assert.equal(view.centers.length, initial.centers.length);
        for (const [i, point] of view.centers.entries()) {
          const expected = initial.centers[i];
          const cssError = Math.hypot((point.x - expected.x) * view.sx, (point.y - expected.y) * view.sy);
          settledError = Math.max(settledError, cssError);
          assert.ok(cssError < 0.5, JSON.stringify({cssError, view, expected, point}));
        }
        if (focus === "雁门部盟" && initial.capital === "安邑") {
          assert.equal(view.steps.length, 3);
          assert.ok(Math.max(...view.steps) - Math.min(...view.steps) < 0.5, "单行国名与政体之间的字距应与行内一致");
          assert.equal(view.pickedWater, false, "字间水面不应命中国名");
        }
      }
      const near = await zoom(-1200);
      assert.ok(near.scale >= 2.8 && !near.visible);
      await zoom(1200);
      assert.equal((await sample()).text, initial.text);
      if (focus === "雁门部盟" && initial.capital === "安邑") assert.equal(far.text, focus, "远景仍可容纳完整国名");
      assert.equal(restored.text, initial.text);
      assert.deepEqual(restored.shown, initial.shown);
      assert.ok(restored.shown.some(id => !far.shown.includes(id)), "缩远而隐藏的小国没有随放大恢复");
      assert.ok(zoomLongTasks.every(task => task.duration <= 200), JSON.stringify(zoomLongTasks));
      assert.equal(await page.locator("#state-number-legend,.state-label--number").count(), 0);
      assert.equal(await page.locator("#map-legend, #map-scale-bar").count(), 2);
      const checkExport = await page.evaluate(async name => {
        const calls = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        try {
          CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
            const point = this.getTransform().transformPoint({x, y});
            calls.push({text, x: point.x, y: point.y});
            return original.call(this, text, x, y, ...args);
          };
          const result = await window.webglGeneratorApi.data.exportPNG({download:false,includeMapOverlays:true,crop:{mode:"viewport"}});
          const chars = Array.from(name);
          const start = calls.findIndex((_, i) => chars.every((char, j) => calls[i + j]?.text === char));
          if (!result.ok || start < 0) return false;
          const item = window.__webglGeneratorApp.renderer.labelItems.find(label => label.targetKind === "state" && label.text === name);
          const dom = item.glyphNodes.map(glyph => {
            const box = glyph.getBoundingClientRect();
            return {x: box.left + box.width / 2, y: box.top + box.height / 2};
          });
          const proportions = points => {
            const steps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
            const total = steps.reduce((sum, step) => sum + step, 0);
            return steps.map(step => step / total);
          };
          const exported = proportions(calls.slice(start, start + chars.length));
          return proportions(dom).every((step, i) => Math.abs(exported[i] - step) < 0.01);
        } finally { CanvasRenderingContext2D.prototype.fillText = original; }
      }, initial.text);
      assert.ok(checkExport, "PNG 中的国名与屏幕排字位置不一致");
      const renamed = await page.evaluate(id => window.webglGeneratorApi.edit.states.rename(id, "东岚"), initial.id);
      assert.ok(renamed.ok, JSON.stringify(renamed.error));
      const renderedName = (id, name) => page.waitForFunction(({id, name}) => {
        const item = window.__webglGeneratorApp.renderer.labelItems.find(label => label.targetKind === "state" && label.targetId === id);
        return item?.visible && item.glyphNodes.map(glyph => glyph.textContent).join("").includes(name);
      }, {id, name});
      await renderedName(initial.id, "东岚");
      assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
      await renderedName(initial.id, initial.text);
      await page.locator("#open-generation-panel").click();
      await page.locator('[data-control-tab="layers"]').click();
      const toggle = page.locator('[data-control-panel="layers"] button[data-layer="stateLabels"]');
      await toggle.click();
      await page.waitForFunction(() => !document.querySelector(".state-label.visible"));
      await toggle.click();
      await page.waitForFunction(() => document.querySelector(".state-label.visible"));
      assert.equal((await sample()).text, initial.text);
      await page.locator('[data-panel-id="generation-panel"] .floating-panel-close').click();
      assert.deepEqual(errors, []);
      reports.push({cellsTarget, archive: true, initial, detail, far, nearScale: near.scale, previewError, settledError, zoomLongTasks});
      await page.close();
      continue;
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
        if (!position && item.politicalPlacementSnapshot?.splitAt) {
          return item.glyphNodes.every(glyph => {
            const bounds = glyph.getBoundingClientRect();
            return insideLabel(item, renderer.screenToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
          });
        }
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
      const modes = {short:0, full:0};
      for (const item of initialVisibleStates) {
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
      ensure(obstacleVisible.cityVisible && obstacleVisible.stateVisible && obstacleVisible.candidate === clearCandidate && obstacleVisible.inside, "城市显示时国名应保持固定");

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
      ensure(panEntry.cityVisible && panEntry.stateVisible && panEntry.candidate === buffered.candidate && panEntry.inside,
        "城市进入视野时国名发生漂移");
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
      ensure(zoomApproach.cityVisible && zoomApproach.candidate === clearCandidate && state.node.classList.contains("city-overlap") && zoomApproach.inside,
        "城市与国名重叠时应保留字位");
      for (const animation of state.node.getAnimations()) animation.finish();
      const ink = getComputedStyle(state.node);
      ensure(Math.abs(Number(ink.opacity) - Number(ink.getPropertyValue("--label-opacity"))) < 0.001,
        "1.2 倍重叠处的国名应保持样式指定的不透明度");
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
