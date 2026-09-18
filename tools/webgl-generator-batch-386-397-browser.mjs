import fs from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
const playwright = createRequire(path.resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const out = process.env.TEMP || "Z:/tmp/codex/2026-09-19/fmg-batch";
const browser = await playwright.chromium.launch({channel:"chrome",headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page = await context.newPage();
const errors=[],warnings=[];
page.on("pageerror",error=>errors.push(error.message));
page.on("console",message=>{if(message.type()==="error")errors.push(message.text());if(message.type()==="warning")warnings.push(message.text());});
page.on("dialog",dialog=>dialog.accept());
try {
  await page.goto("http://127.0.0.1:5586/?healthClear=1");
  await waitForApiReady(page,180000);
  const report = await page.evaluate(async()=>{
    const app=window.__webglGeneratorApp,api=window.webglGeneratorApi;
    const result=await api.generate.newMap({confirm:true,seed:"batch-386-397",cellsTarget:3000,heightmapTemplate:"continents"});
    if(!result.ok)throw new Error(JSON.stringify(result));
    return {panels:Object.keys(app.panels),save:app.saveState.getStatus(),binding:app.mapRevision.getSnapshot(),noteApi:Object.keys(api.edit.notes),description:api.info.describe("edit.notes.import"),map:{cells:app.map.grid.cells.i.length,cities:app.map.settlements.cities.length},history:app.editHistory.getStats()};
  });
  await page.evaluate(()=>window.__webglGeneratorApp.panels.city.open(window.__webglGeneratorApp.map,null,window.__webglGeneratorApp.editHistory.getStats()));
  await page.waitForSelector(".city-panel-controls");
  await page.screenshot({path:path.join(out,"batch-city-desktop.png")});
  report.cityStyle=await page.locator('[data-panel-id="city-panel"]').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,scroll:el.scrollWidth,client:el.clientWidth}));
  await page.getByRole("button",{name:"控制面板",exact:true}).click();
  await page.getByRole("button",{name:"搜索地图内容"}).click();
  await page.getByRole("textbox",{name:"地图搜索关键词"}).fill("1");
  await page.waitForTimeout(750);
  report.search=await page.locator(".map-search-dialog").innerText();
  await page.screenshot({path:path.join(out,"batch-search-desktop.png")});
  await page.getByRole("button",{name:"关闭搜索",exact:true}).click();
  report.png=await page.evaluate(async()=>await window.webglGeneratorApi.data.exportPNG({download:false,includeDataUrl:false,outputWidth:1200,crop:{mode:"map"}}));
  report.errors=errors;report.warnings=warnings;
  await fs.writeFile(path.join(out,"batch-browser-probe.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await context.close();await browser.close();}
