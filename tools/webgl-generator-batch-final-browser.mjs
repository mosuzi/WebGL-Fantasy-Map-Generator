import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
const {chromium}=createRequire(path.resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const out=process.env.TEMP,mode=process.argv[2]||"large";
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const report={mode,errors};
try {
 await page.goto('http://127.0.0.1:5586/?healthClear=1');await waitForApiReady(page,180000);
 await page.evaluate(async cells=>{const r=await window.webglGeneratorApi.generate.newMap({confirm:true,seed:'batch-final',cellsTarget:cells});if(!r.ok)throw Error(JSON.stringify(r));},mode.startsWith('large')||mode==='trade'?100000:3000);
 let profiler;
 if(mode==='large-profile'){profiler=await context.newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
 if(mode==='guidance') {
  report.guidance=await page.evaluate(async()=>{const a=window.__webglGeneratorApp,api=window.webglGeneratorApi,c=a.map.settlements.cities.find(c=>c&&!c.capital&&c.state>0),old=a.map.settlements.cities.find(item=>item?.burgId===a.map.politics.states[c.state].capital).id;const r=await api.edit.states.setCapital(c.state,c.id,{confirm:true});if(!r.ok||r.data.executed===false)throw Error(JSON.stringify(r));const changed=[a.cityGuidance.read(c.id),a.cityGuidance.read(old)];await api.history.undo();const undo=a.cityGuidance.read(c.id);await api.history.redo();a.panels.city.open(a.map,a.selection,a.editHistory.getStats());a.panels.city.setSelectedCityId(c.id);return {cityId:c.id,changed,undo};});
  assert.ok(report.guidance.changed.every(g=>g.known&&g.pending.includes('economy')));assert.equal(report.guidance.undo.known,false);
  await page.getByRole('button',{name:'查看经济与国力操作',exact:true}).click();
  assert.ok(await page.locator('.floating-panel[data-panel-id="economy-panel"]').isVisible());
  report.guidance.openedEconomy=true;
 }else if(mode==='trade') {
  await page.evaluate(()=>{const a=window.__webglGeneratorApp;a.panels.economy.open(a.map,a.selection,a.editHistory.getStats());a.panels.economy.setSelectedDealId(a.map.pack.deals.find(Boolean).i);});
  await page.getByRole('button',{name:'检查现有路网',exact:true}).waitFor();
  await page.evaluate(()=>{window.__batchTasks=[];window.__batchObserver=new PerformanceObserver(list=>window.__batchTasks.push(...list.getEntries().map(e=>e.duration)));window.__batchObserver.observe({type:'longtask'});window.__batchRevision=window.__webglGeneratorApp.mapRevision.getSnapshot().mapRevision;});
  await page.getByRole('button',{name:'检查现有路网',exact:true}).click();
  await page.waitForFunction(()=>{const t=document.querySelector('.trade-path-diagnostic [role=status]')?.textContent||'';return !t.startsWith('按需检查');});
  await page.waitForTimeout(100);
  report.trade=await page.evaluate(()=>{window.__batchObserver.disconnect();const a=window.__webglGeneratorApp;return {message:document.querySelector('.trade-path-diagnostic [role=status]').textContent,longTasks:window.__batchTasks,unchanged:window.__batchRevision===a.mapRevision.getSnapshot().mapRevision};});
  assert.ok(report.trade.unchanged);assert.ok(report.trade.longTasks.every(n=>n<=200));
  await page.screenshot({path:path.join(out,'batch-trade-100k.png')});
 }else if(mode==='layout') {
  report.layouts=[];
  for(const width of [1440,690]) {
   await page.setViewportSize({width,height:1000});
   for(const name of ['height','state','province','culture','religion','city']) {
    await page.evaluate(name=>{document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(b=>b.click());const a=window.__webglGeneratorApp,h=a.editHistory.getStats();if(name==='height')a.panels[name].open(h);else if(name==='state')a.panels[name].open(a.map,h);else a.panels[name].open(a.map,a.selection,h);},name);
    await page.waitForTimeout(160);
    const data=await page.evaluate(()=>{const p=document.querySelector('.floating-panel:not(.hidden)'),b=p.querySelector('.floating-panel-body'),table=p.querySelector('table');return {client:b.clientWidth,scroll:b.scrollWidth,headers:table?[...table.querySelectorAll('th')].map(t=>t.textContent.trim()):[],rows:[...p.querySelectorAll('.object-table-row')].slice(0,3).map(r=>r.getBoundingClientRect().height)};});
    report.layouts.push({width,name,...data});assert.ok(data.scroll<=data.client+2,`${name} 溢出`);assert.ok(data.rows.every(h=>Math.abs(h-42)<1),`${name} 表格行高失配`);
    await page.screenshot({path:path.join(out,`panel-final-${width}-${name}.png`)});
   }
  }
 } else {
  report.result=await page.evaluate(async mode=>{
   const a=window.__webglGeneratorApp,api=window.webglGeneratorApi,checks=[];
   const unwrap=r=>{if(!r?.ok)throw Error(JSON.stringify(r));return r.data;};
   const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
   const phases=[];
   const search=async data=>{const start=performance.now();const value=await new Promise(respond=>document.dispatchEvent(new CustomEvent('webfmg-map-search',{detail:{...data,respond}})));phases.push({data,start,end:performance.now()});if(mode.startsWith('large-'))await new Promise(r=>setTimeout(r,30));return value;};
   if(mode==='recovery') {
    await a.recovery.save();
    const points=await new Promise(resolve=>{const r=indexedDB.open('webgl-generator-recovery-v1');r.onsuccess=()=>{const db=r.result,t=db.transaction('points'),q=t.objectStore('points').getAll();t.oncomplete=()=>{db.close();resolve(q.result);};};});
    const city=a.map.settlements.cities.find(Boolean),before=city.name;
    unwrap(await api.edit.cities.rename(city.id,'恢复前修改'));
    const result=await new Promise(resolve=>{const receive=e=>{if(!e.detail.busy){document.removeEventListener('webgl-generator-recovery-status',receive);resolve(e.detail);}};document.addEventListener('webgl-generator-recovery-status',receive);document.dispatchEvent(new CustomEvent('webgl-generator-recovery-command',{detail:{action:'restore',id:points[0].id}}));});
    check('恢复内容及未另存状态',a.map.settlements.cities[city.id].name===before&&a.saveState.getStatus().dirty,result.message);
    const readPoints=()=>new Promise(resolve=>{const r=indexedDB.open('webgl-generator-recovery-v1');r.onsuccess=()=>{const db=r.result,t=db.transaction('points'),q=t.objectStore('points').getAll();t.oncomplete=()=>{db.close();resolve(q.result);};};});
    const prior=await readPoints();
    unwrap(await api.edit.cities.rename(city.id,'恢复点失败注入'));
    const originalPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='points')throw new DOMException('fixture quota','QuotaExceededError');return originalPut.apply(this,args);};
    try{await a.recovery.save();}finally{IDBObjectStore.prototype.put=originalPut;}
    check('额度写入失败保留全部旧点',JSON.stringify((await readPoints()).map(p=>p.id))===JSON.stringify(prior.map(p=>p.id)));
    const broken={...prior[0],id:'broken-fixture',blob:new Blob(['invalid-map']),bytes:11};
    await new Promise(resolve=>{const r=indexedDB.open('webgl-generator-recovery-v1');r.onsuccess=()=>{const db=r.result,t=db.transaction('points','readwrite');t.objectStore('points').put(broken);t.oncomplete=()=>{db.close();resolve();};};});
    const mapBefore=a.map,revision=a.mapRevision.getSnapshot().mapRevision;
    await new Promise(resolve=>{const receive=e=>{if(!e.detail.busy){document.removeEventListener('webgl-generator-recovery-status',receive);resolve();}};document.addEventListener('webgl-generator-recovery-status',receive);document.dispatchEvent(new CustomEvent('webgl-generator-recovery-command',{detail:{action:'restore',id:broken.id}}));});
    check('损坏恢复点不替换地图',a.map===mapBefore&&a.mapRevision.getSnapshot().mapRevision===revision);
   } else {
    const tasks=[],observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({type:'longtask'});
    const started=performance.now(),before=a.mapRevision.getSnapshot().mapRevision,history=JSON.stringify(a.editHistory.getStats());
    const all=await search({query:''});
    check('大图全量搜索和分页',all.total>200&&all.items.length===50,{total:all.total,pages:all.pages,ms:performance.now()-started});
    const kinds=['state','province','city','culture','religion','river','lake','feature','route','ocean-current','zone','economy-market','trade-flow','military','diplomacy-relation','marker','label','measurement','note','region'];
    const types=[];for(const type of kinds){const r=await search({type,query:''});types.push({type,total:r.total});if(r.items.length){const s=await search({query:r.items[0].ref.id.toString(),type});check(`搜索类型 ${type}`,s.items.some(i=>i.key===r.items[0].key));}}
    check('搜索不改历史',before===a.mapRevision.getSnapshot().mapRevision&&history===JSON.stringify(a.editHistory.getStats()));
    const city=a.map.settlements.cities.find(c=>c&&!c.removed),old=city.name;
    unwrap(await api.edit.cities.rename(city.id,'唯一搜索验收城市'));
    check('修改失效索引',(await search({query:'唯一搜索验收城市'})).items.some(i=>i.ref.id===city.id&&i.type==='city'));
    check('旧结果身份拒绝',(await search({action:'view',binding:all.binding,key:all.items[0].key})).stale);
    unwrap(await api.history.undo());check('撤销更新索引',(await search({query:'唯一搜索验收城市'})).total===0);
    const saveStart=performance.now();await a.recovery.save();phases.push({data:'recovery',start:saveStart,end:performance.now()});check('大图恢复点完成',true,{ms:performance.now()-saveStart});
    await new Promise(r=>setTimeout(r,100));observer.disconnect();
    check('操作窗口无超过200ms任务',tasks.every(t=>t.duration<=200),tasks);
    return {checks,types,phases,cells:a.map.grid.cells.i.length,longTasks:tasks,maxLongTask:Math.max(0,...tasks.map(t=>t.duration)),glError:a.renderer.getStats().draw.glError};
   }
   return {checks};
  },mode);
  if(profiler)await fs.writeFile(path.join(out,'batch-search.cpu.json'),JSON.stringify(await profiler.send('Profiler.stop')));
  assert.ok(report.result.checks.every(c=>c.pass),JSON.stringify(report.result.checks.filter(c=>!c.pass)));
 }
 assert.deepEqual(errors,[]);
}finally{await fs.writeFile(path.join(out,`batch-final-${mode}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();await browser.close();}
