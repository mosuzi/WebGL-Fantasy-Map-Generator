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
try {
  for (const cellsTarget of [10000, 100000]) {
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
    const generated = await page.evaluate(target => window.webglGeneratorApi.generate.newMap({confirm: true, seed: `state-label-visibility-${target}`, cellsTarget: target}), cellsTarget);
    assert.equal(generated.ok, true, JSON.stringify(generated.error));
    await waitForApiReady(page, 180000);
    const result = await page.evaluate(() => {
      const {map, renderer} = window.__webglGeneratorApp;
      const states = renderer.labelItems.filter(item => item.targetKind === "state" && item.componentCellSet?.size && !item.layout?.locked);
      states.sort((left, right) => right.componentCellSet.size - left.componentCellSet.size);
      const state = states[0];
      const city = renderer.labelItems.find(item => item.targetKind === "city");
      if (!state || !city) throw new Error("缺少国家或城市标签样本");
      const rect = renderer.canvas.getBoundingClientRect();
      const insideLabel = item => {
        const base = renderer.worldToScreen(item.x, item.y, rect);
        const point = renderer.screenToWorld(rect.left + base.x + (item.politicalOffsetX || 0), rect.top + base.y + (item.politicalOffsetY || 0));
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
      renderer.updateLabels();
      const obstacleVisible = sample();
      ensure(obstacleVisible.cityVisible && obstacleVisible.stateVisible && obstacleVisible.candidate > 0 && obstacleVisible.inside, "显示城市标签时国家未正确避让或中点越界");

      renderer.layerVisibility.labels = false;
      renderer.updateLabels();
      const layerHidden = sample();
      ensure(!layerHidden.cityVisible && layerHidden.candidate === 0 && layerHidden.inside, "城市图层关闭后国家未回原位");

      renderer.layerVisibility.labels = true;
      city.resolvedStyle = {...city.resolvedStyle, opacity: 0};
      renderer.updateLabels();
      const transparent = sample();
      ensure(!transparent.cityVisible && transparent.candidate === 0 && transparent.inside, "透明城市标签仍触发避让");

      city.resolvedStyle = {...city.resolvedStyle, opacity: 1};
      renderer.labelItems = [state];
      centerAt(40, rect.height / 2);
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
      renderer.camera.scale = 2.4;
      centerAt(rect.width / 2, rect.height / 2);
      renderer.updateLabels();
      const separation = ((state.box?.right - state.box?.left || 160) + (city.metrics?.width || 40)) / 2 + 12;
      const separatedCityPoint = renderer.screenToWorld(rect.left + rect.width / 2 + separation * 1.3, rect.top + rect.height / 2);
      city.x = separatedCityPoint.x;
      city.y = separatedCityPoint.y;
      renderer.labelItems = [city, state];
      renderer.updateLabels();
      const zoomSeparated = sample();
      ensure(zoomSeparated.cityVisible && zoomSeparated.candidate === 0, "缩放前无遮挡的国家候选未保持基准位置");
      renderer.camera.scale = 1.2;
      centerAt(rect.width / 2, rect.height / 2);
      renderer.viewportInteractionKind = "zoom";
      renderer.updateLabels();
      const zoomApproach = sample();
      ensure(zoomApproach.cityVisible && zoomApproach.candidate > 0 && zoomApproach.inside,
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
      return {startedAt, initialVisibleStateCount: initialVisibleStates.length, stateId: state.targetId, stateCells: state.componentCellSet.size,
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
