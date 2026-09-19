import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const context=await chromium.launchPersistentContext(path.join(process.env.TEMP,'zoom-profile'),{channel:'chrome',headless:true,viewport:{width:1440,height:1000}}),report={layouts:[],errors:[]};
try {
 const settings=await context.newPage();await settings.goto('chrome://settings/appearance');await settings.locator('#zoomLevel').selectOption({label:'200%'});
 report.setting=await settings.locator('#zoomLevel').inputValue();
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:5586/');await waitForApiReady(page,180000);
 report.metrics=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom}));
 assert.equal(report.metrics.width,720);assert.equal(report.metrics.dpr,2);assert.equal(report.metrics.cssZoom,'1');
 await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'panel-acceptance',cellsTarget:3000}));
 const panels=await page.evaluate(()=>Object.keys(window.__webglGeneratorApp.panels).filter(k=>k!=='development'));
 for(const name of panels){
  await page.evaluate(name=>{document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(b=>b.click());const a=window.__webglGeneratorApp,h=a.editHistory.getStats(),p=a.panels[name];if(name==='generation'||name==='cloudStorage')p.open();else if(name==='height')p.open(h);else if(name==='objectDetails')window.webglGeneratorApi.selection.select({kind:'city',id:a.map.settlements.cities.find(Boolean).id});else if(['biome','climate','emblem','feature','measurement','oceanCurrent','population','state'].includes(name))p.open(a.map,h);else p.open(a.map,a.selection,h);},name);
  await page.waitForTimeout(150);
  const rows=await page.evaluate(()=>[...document.querySelectorAll('.floating-panel:not(.hidden)')].map(p=>{const b=p.querySelector('.floating-panel-body'),r=p.getBoundingClientRect(),close=p.querySelector('.floating-panel-close').getBoundingClientRect();return{id:p.dataset.panelId,client:b.clientWidth,scroll:b.scrollWidth,rect:r.toJSON(),close:close.toJSON(),background:getComputedStyle(p).backgroundColor};}));
  report.layouts.push({name,rows});assert.ok(rows.every(r=>r.scroll<=r.client+2&&r.close.right<=720&&r.close.top>=0),name);
  await page.screenshot({path:path.join(process.env.TEMP,`panel-real-200-${name}.png`)});
 }
 assert.equal(report.errors.length,0);
}finally{console.log(JSON.stringify(report,null,2));await fs.writeFile(path.join(process.env.TEMP,'batch-real-zoom.json'),JSON.stringify(report,null,2));await context.close();}
