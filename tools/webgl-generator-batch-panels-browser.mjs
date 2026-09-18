import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
const {chromium}=createRequire(path.resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const out=process.env.TEMP;
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",d=>d.accept());
const report={layouts:[],errors};
try{
 await page.goto("http://127.0.0.1:5586/?healthClear=1");await waitForApiReady(page,180000);
 await page.evaluate(async()=>{const r=await window.webglGeneratorApi.generate.newMap({confirm:true,seed:"panel-acceptance",cellsTarget:3000});if(!r.ok)throw Error(JSON.stringify(r));});
 const panels=await page.evaluate(()=>Object.keys(window.__webglGeneratorApp.panels).filter(k=>k!=="development"));
 for(const layout of [{name:"desktop",width:1440,zoom:1},{name:"narrow",width:690,zoom:1},{name:"zoom-layout",width:1440,zoom:2}]){
  await page.setViewportSize({width:layout.width,height:1000});
  await page.evaluate(zoom=>{document.documentElement.style.zoom=String(zoom);window.dispatchEvent(new Event('resize'));},layout.zoom);
  for(const name of panels){
   await page.evaluate(name=>{
    document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(button=>button.click());
    const app=window.__webglGeneratorApp,history=app.editHistory.getStats(),panel=app.panels[name];
    if(name==='generation'||name==='cloudStorage')panel.open();
    else if(name==='height')panel.open(history);
    else if(name==='objectDetails')window.webglGeneratorApi.selection.select({kind:'city',id:app.map.settlements.cities.find(Boolean).id});
    else if(['biome','climate','emblem','feature','measurement','oceanCurrent','population','state'].includes(name))panel.open(app.map,history);
    else panel.open(app.map,app.selection,history);
   },name);
   await page.waitForTimeout(220);
   const rows=await page.evaluate(()=>[...document.querySelectorAll('.floating-panel:not(.hidden)')].map(panel=>{
    const rect=panel.getBoundingClientRect(),body=panel.querySelector('.floating-panel-body'),style=getComputedStyle(panel);
    const issues=[...panel.querySelectorAll('button,input,select,textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden'&&r.right>rect.right+3;}).map(el=>({name:el.getAttribute('aria-label')||el.textContent?.trim()?.slice(0,60)||el.id,right:el.getBoundingClientRect().right})).slice(0,12);
    return{id:panel.dataset.panelId,background:style.backgroundColor,color:style.color,rect:rect.toJSON(),client:body?.clientWidth,scroll:body?.scrollWidth,issues};
   }));
   report.layouts.push({layout:layout.name,name,rows});
   await page.screenshot({path:path.join(out,`panel-${layout.name}-${name}.png`)});
  }
 }
 await fs.writeFile(path.join(out,"batch-panels-browser.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({panels:panels.length,observations:report.layouts.length,overflow:report.layouts.filter(r=>r.rows.some(p=>p.scroll>p.client+2||p.issues.length)),errors},null,2));
}finally{await context.close();await browser.close();}
