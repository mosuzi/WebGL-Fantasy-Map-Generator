import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),checks=[];
page.on('dialog',d=>d.accept());
try{
 await page.goto('http://127.0.0.1:5586/');await waitForApiReady(page,180000);
 const result=await page.evaluate(async()=>{const api=window.webglGeneratorApi,a=window.__webglGeneratorApp;
 const unwrap=r=>{if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
 unwrap(await api.generate.newMap({confirm:true,seed:'batch-final',cellsTarget:100000}));unwrap(await api.data.saveBrowserMap());
 const clean=new Event('beforeunload',{cancelable:true});window.dispatchEvent(clean);
 unwrap(await api.layers.setTheme('ancient'));const dirty=new Event('beforeunload',{cancelable:true});window.dispatchEvent(dirty);
 const styleDirty=a.saveState.getStatus().dirty;
 const oldDocument=JSON.parse(unwrap(await api.data.exportAll({includeText:true})).text);
 for(const chronicle of [oldDocument.map.diplomacy.chronicle,oldDocument.map.pack.diplomacy.chronicle,oldDocument.map.pack.states[0].diplomacy])chronicle.push(['旧和平纪事','赔款历史原文 123']);
 unwrap(await api.data.importMap(JSON.stringify(oldDocument),{confirm:true}));
 const text=unwrap(await api.data.exportAll({includeText:true})).text;unwrap(await api.data.importMap(text,{confirm:true}));
 const history=a.map.pack.states[0].diplomacy.some(item=>JSON.stringify(item).includes('赔款历史原文 123'));
 const unknown=!a.cityGuidance.read(a.map.settlements.cities.find(Boolean).id).known;
 await a.recovery.save();const records=await new Promise(resolve=>{const r=indexedDB.open('webgl-generator-recovery-v1');r.onsuccess=()=>{const db=r.result,t=db.transaction('points'),q=t.objectStore('points').getAll();t.oncomplete=()=>{db.close();resolve(q.result.map(p=>({id:p.id,bytes:p.bytes,size:p.blob.size})));};};});
 return{clean:!clean.defaultPrevented,dirty:dirty.defaultPrevented&&styleDirty,history,unknown,records,cells:a.map.grid.cells.i.length};});
 for(const name of ['clean','dirty','history','unknown']){checks.push({name,pass:result[name]});assert.ok(result[name],name);}
 assert.ok(result.cells>99000&&result.records.length===1&&result.records[0].bytes===result.records[0].size&&result.records[0].size>0);checks.push({name:'100k旧逻辑JSON恢复点实际负载',pass:true,cells:result.cells,records:result.records});
}finally{console.log(JSON.stringify({checks},null,2));await fs.writeFile(path.join(process.env.TEMP,'batch-persistence-final.json'),JSON.stringify({checks},null,2));await browser.close();}
