import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
const {chromium}=createRequire(path.resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
 const page=await browser.newPage({viewport:{width:690,height:1000}});
 await page.goto("http://127.0.0.1:5586/");await waitForApiReady(page,180000);
 await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:"panel-acceptance",cellsTarget:3000}));
 const report=[];
 for(const name of ['height','state','province','culture','religion']) {
  await page.evaluate(name=>{
   document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(b=>b.click());
   const a=window.__webglGeneratorApp,h=a.editHistory.getStats();
   if(name==='height')a.panels[name].open(h);else if(name==='state')a.panels[name].open(a.map,h);else a.panels[name].open(a.map,a.selection,h);
  },name);
  await page.waitForTimeout(200);
  report.push(await page.evaluate(name=>{
   const body=document.querySelector('.floating-panel:not(.hidden) .floating-panel-body'),r=body.getBoundingClientRect();
   return {name,width:body.clientWidth,scroll:body.scrollWidth,overflow:[...body.querySelectorAll('*')].filter(e=>!e.closest('.object-table-wrap')).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r:x})=>x.width&&x.right>r.right-8).map(({e,r:x})=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,70),width:x.width,right:x.right,display:getComputedStyle(e).display,box:getComputedStyle(e).boxSizing})).slice(0,40)};
  },name));
 }
 await fs.writeFile(path.join(process.env.TEMP,'batch-layout-diagnostic.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
