import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const server = await preview({configFile: "vite.config.mjs", preview: {host: "127.0.0.1", port: 5689, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome"});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error" && !msg.text().startsWith("[FMG health]")) errors.push(msg.text()); });
  await page.addInitScript(() => {
    window.pathLongTasks = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.pathLongTasks.push({at: entry.startTime, ms: entry.duration});
    }).observe({type:"longtask",buffered:true});
  });
  await page.goto("http://127.0.0.1:5689/?healthClear=1");
  await waitForApiReady(page, 60000);
  const archive = process.env.FMG_REAL_ARCHIVE;
  if (archive) {
    await page.locator("#import-map-file").setInputFiles(archive);
    await page.waitForFunction(() => window.__webglGeneratorApp.map?.grid.cells.i.length === 100000);
  } else {
    const result = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "stage-2-1", cellsTarget: 3000}));
    assert.ok(result.ok);
  }
  await waitForApiReady(page, 120000);
  const dialog = page.getByRole("dialog", {name: "标签排布"});
  const open = () => page.getByRole("button", {name: "标签排布", exact: true}).click();
  const read = key => page.evaluate(key => {
    const app = window.__webglGeneratorApp;
    return {layout: app.map.labels?.layout?.overrides?.[key] ?? null, history: app.editHistory.getStats().undo};
  }, key);
  async function drag(grip, dx, dy) {
    const handle = dialog.locator(grip);
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x + dx,y + dy,{steps:4});
    await page.mouse.up();
  }
  const tested = [];
  for (const kind of (process.env.FMG_LABEL_KIND ? [process.env.FMG_LABEL_KIND] : archive ? ["state"] : ["state","province","city","custom","zone"])) {
    await page.evaluate(async kind => {
      const api = window.webglGeneratorApi, {map} = window.__webglGeneratorApp;
      for (const [layer, visible] of Object.entries({stateLabels: kind === "state", provinceLabels: kind === "province",
        labels: ["city","custom"].includes(kind), zones: kind === "zone", zoneLabels: kind === "zone",
        zoneEvents: kind === "zone", zoneNatural: kind === "zone", zoneWilderness: kind === "zone"})) {
        const r = await api.layers.setVisible(layer, visible);
        if (!r.ok) throw Error(r.error.message);
      }
      if (kind === "custom") {
        const r = await api.edit.labels.addCustom({text:"春山古渡",x: map.metadata.graphWidth * 0.5, y: map.metadata.graphHeight * 0.5});
        if (!r.ok) throw Error(r.error.message);
      }
    }, kind);
    const sample = await page.evaluate(kind => {
      const r = window.__webglGeneratorApp.renderer, rect = r.canvas.getBoundingClientRect();
      for (const item of r.labelItems.filter(i => i.visible && i.targetKind === kind && i.text.length >= 2)) {
        const b = (item.glyphNodes[0] || item.contentNode).getBoundingClientRect();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        if (x < 80 || x > rect.width - 100 || y < 90 || y > rect.height - 150) continue;
        const within = b => x-rect.left >= b.left && x-rect.left <= b.right && y-rect.top >= b.top && y-rect.top <= b.bottom;
        const top = r.labelItems.find(i => i.visible && i.box && within(i.box) && (!i.box.parts || i.box.parts.some(within)));
        if (top === item) return {key:item.layout.key, x,y, text:item.text};
      }
      throw Error("缺少可见标签 " + kind);
    }, kind);
    const before = await read(sample.key);
    const startedAt = await page.evaluate(()=>performance.now());
    await open();
    await page.mouse.click(sample.x,sample.y);
    const middle = dialog.locator('[data-grip="1"]');
    const initialY = Number(await middle.getAttribute("cy"));
    await middle.focus();
    await page.keyboard.press("ArrowUp");
    assert.equal(Number(await middle.getAttribute("cy")), initialY - 1);
    await drag('[data-grip="2"]',32,-16);
    await drag('[data-grip="1"]',0,-22);
    assert.deepEqual(await read(sample.key), before);
    await page.keyboard.press("Escape");
    assert.deepEqual(await read(sample.key), before);
    await open();
    await page.mouse.move(sample.x,sample.y);
    await page.mouse.down();
    await page.mouse.move(sample.x+26,sample.y+17,{steps:4});
    await page.mouse.up();
    await drag('[data-grip="2"]',31,-13);
    await drag('[data-grip="1"]',0,-24);
    const preview = await dialog.locator("svg text").evaluateAll(nodes => nodes.map(n => {
      const m = n.getCTM(); return [n.textContent,m.e,m.f];
    }));
    if (kind === "state" && process.env.FMG_LABEL_SHOTS) await page.screenshot({path:join(process.env.FMG_LABEL_SHOTS,archive ? "旧图排字.png" : "新图排字.png")});
    await dialog.getByRole("button",{name:"应用"}).click();
    await dialog.waitFor({state:"hidden"});
    const after = await read(sample.key);
    assert.equal(after.history,before.history+1);
    assert.ok(after.layout.path);
    const show = () => page.evaluate(key => {
      const r = window.__webglGeneratorApp.renderer, i = r.labelItems.find(i=>i.layout.key===key);
      if (!i?.visible) throw Error("手调标签未显示 " + key);
      return i.glyphNodes.map(n => {
        const b=n.getBoundingClientRect(), x=b.x+b.width/2, y=b.y+b.height/2;
        const pick=r.pickLabel(x,y);
        return [n.textContent,x,y,pick?.targetKind,pick?.targetId];
      });
    },sample.key);
    const placed = await show();
    assert.equal(placed.length,preview.length);
    for (const [i,p] of placed.entries()) {
      assert.ok(Math.hypot(p[1]-preview[i][1],p[2]-preview[i][2])<1,JSON.stringify({kind,p,preview:preview[i]}));
      assert.equal(p[3]+":"+p[4],sample.key);
    }
    const longTasks = await page.evaluate(start => window.pathLongTasks.filter(t=>t.at >= start).map(t=>t.ms),startedAt);
    console.log("排字窗口",kind,longTasks);
    assert.ok(longTasks.every(ms=>ms<=200));
    const pngError = await page.evaluate(async ({placed,text}) => {
      const calls = [], original = CanvasRenderingContext2D.prototype.fillText;
      try {
        CanvasRenderingContext2D.prototype.fillText = function(char,x,y,...args) {
          const p = this.getTransform().transformPoint({x,y});
          calls.push([char,p.x,p.y,this.canvas.width,this.canvas.height]);
          return original.call(this,char,x,y,...args);
        };
        const res = await window.webglGeneratorApi.data.exportPNG({download:false,includeMapOverlays:true,crop:{mode:"viewport"}});
        if (!res.ok) throw Error(res.error.message);
        const rect = window.__webglGeneratorApp.renderer.canvas.getBoundingClientRect();
        const chars = Array.from(text);
        let minError = Infinity;
        for (let i=0;i<calls.length;i++) {
          if (!chars.every((ch,k)=>calls[i+k]?.[0]===ch)) continue;
          const error = Math.max(...placed.map((p,k)=>{
            const [,x,y,w,h] = calls[i+k];
            return Math.hypot(rect.left+x/w*rect.width-p[1],rect.top+y/h*rect.height-p[2]);
          }));
          minError = Math.min(minError,error);
        }
        return minError;
      } finally { CanvasRenderingContext2D.prototype.fillText = original; }
    },{placed,text:sample.text});
    assert.ok(pngError<1,`PNG 字位偏差 ${pngError}px`);
    assert.ok((await page.evaluate(()=>window.webglGeneratorApi.history.undo())).ok);
    assert.deepEqual((await read(sample.key)).layout,before.layout);
    assert.ok((await page.evaluate(()=>window.webglGeneratorApi.history.redo())).ok);
    assert.deepEqual((await read(sample.key)).layout,after.layout);
    if (kind === "state") {
      const zoom = async dy => {
        const previous = await page.evaluate(()=>window.__webglGeneratorApp.renderer.camera.scale);
        await page.mouse.move(760,420);
        await page.mouse.wheel(0,dy);
        await page.waitForFunction(prior=>{
          const r=window.__webglGeneratorApp.renderer;
          return r.camera.scale!==prior && r.overlayCommittedCamera?.scale===r.camera.scale && !r.viewportInteractionKind;
        },previous);
        return (await page.evaluate(()=>window.__webglGeneratorApp.renderer.camera.scale))/previous;
      };
      const ratio=await zoom(-220), zoomed=await show();
      for (const [i,p] of zoomed.entries()) {
        assert.ok(Math.hypot((p[1]-zoomed[0][1])/ratio-(placed[i][1]-placed[0][1]),
          (p[2]-zoomed[0][2])/ratio-(placed[i][2]-placed[0][2]))<1);
      }
      await zoom(220);
      const output = await page.evaluate(async () => {
        const api = window.webglGeneratorApi;
        const saved = await api.data.saveBrowserMap();
        const restored = saved.ok && await api.data.restoreBrowserMap({confirm:true});
        return [saved.ok,restored.ok];
      });
      assert.deepEqual(output,[true,true]);
      await waitForApiReady(page,120000);
      assert.deepEqual((await read(sample.key)).layout,after.layout);
    }
    const [p] = await show();
    await open();
    await page.mouse.click(p[1],p[2]);
    await dialog.getByRole("button",{name:"恢复自动"}).click();
    await dialog.waitFor({state:"hidden"});
    assert.equal((await read(sample.key)).layout?.path,undefined);
    tested.push(sample.key);
    console.log("通过",kind,sample.text);
  }
  if (!archive) {
    for (const width of [420, 390, 360, 320, 280]) {
      await page.setViewportSize({width, height: 720});
      const measure = selector => page.locator(selector).evaluateAll(nodes => nodes
        .map(n => n.getBoundingClientRect()).filter(b => b.width)
        .map(b => [Math.round(b.left), Math.round(b.right)]));
      const toolbar = await measure("#map-global-tool-actions button");
      await open();
      const bar = await measure(".label-path-tools");
      await page.keyboard.press("Escape");
      assert.ok([...toolbar, ...bar].every(([l,r]) => l >= 0 && r <= width),
        JSON.stringify({width, toolbar, bar}));
    }
  }
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>window.__webglGeneratorApp.renderer.gl.getError()),0);
  console.log(JSON.stringify({tested,errors}));
} finally {
  await browser.close();
  await server.httpServer.close();
}
