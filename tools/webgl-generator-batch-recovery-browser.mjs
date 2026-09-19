import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),checks=[];
const check=(name,value,detail)=>{checks.push({name,pass:!!value,detail});assert.ok(value,name);};
const open=async()=>{const p=await context.newPage();p.on('dialog',d=>d.accept());await p.goto('http://127.0.0.1:5586/');await waitForApiReady(p,180000);return p;};
const points=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('webgl-generator-recovery-v1');r.onsuccess=()=>{const db=r.result,t=db.transaction('points'),q=t.objectStore('points').getAll();t.oncomplete=()=>{db.close();resolve(q.result.map(({blob,...p})=>({...p,size:blob.size})));};t.onabort=()=>reject(t.error);};}));
try {
 const a=await open();await a.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'recovery-final',cellsTarget:3000}));
 const saved=await a.evaluate(async()=>{const api=window.webglGeneratorApi;await api.data.saveBrowserMap();return (await api.data.exportAll({includeText:true})).data.text;});
 const b=await open();const imported=await b.evaluate(text=>window.webglGeneratorApi.data.importMap(text,{confirm:true}),saved);check('旧逻辑 JSON 导入',imported.ok);
 for(const p of [a,b]) for(let i=0;i<4;i++)await p.evaluate(async i=>{const a=window.__webglGeneratorApp,api=window.webglGeneratorApi,id=a.map.settlements.cities.find(Boolean).id;const r=await api.edit.cities.rename(id,`恢复点${i}`);if(!r.ok)throw Error(JSON.stringify(r));await a.recovery.save();},i);
 const records=await points(a),writers=Object.groupBy(records,p=>p.writerId);
 check('同文档多标签独立保留各三点',records.length===6&&new Set(records.map(r=>r.documentId)).size===1&&Object.values(writers).every(r=>r.length===3),records);
 check('全部恢复记录实测字节有效',records.every(r=>r.bytes===r.size&&r.bytes>0));
 await a.getByRole('button',{name:'控制面板',exact:true}).click();await a.getByRole('tab',{name:'简介',exact:true}).click();
 await a.getByText('意外恢复',{exact:true}).click();await a.getByRole('checkbox',{name:'自动保留恢复点'}).check();
 await a.reload();await waitForApiReady(a,180000);
 await a.getByRole('button',{name:'控制面板',exact:true}).click();await a.getByRole('tab',{name:'简介',exact:true}).click();await a.getByText('意外恢复',{exact:true}).click();
 check('页面重开记住恢复开关',await a.getByRole('checkbox',{name:'自动保留恢复点'}).isChecked());
 await a.getByRole('button',{name:'刷新列表',exact:true}).click();await a.getByRole('combobox',{name:'选择恢复点'}).selectOption(records[0].id);
 await a.getByRole('button',{name:'恢复所选地图',exact:true}).click();await a.waitForFunction(()=>document.querySelector('.map-recovery-controls [role=status]')?.textContent.includes('已恢复所选地图'));
 check('页面重开后可显式选择恢复',await a.evaluate(()=>window.__webglGeneratorApp.map.settlements.cities.find(Boolean).name.startsWith('恢复点')&&window.__webglGeneratorApp.saveState.getStatus().dirty));
 await a.getByRole('checkbox',{name:'自动保留恢复点'}).uncheck();
 // 回读原手动槽，证明两标签恢复点不会覆盖它。
 const manual=await a.evaluate(()=>window.webglGeneratorApi.data.restoreBrowserMap({confirm:true}));check('手动存档入口回读成功',manual.ok);
 check('原手动存档保持',await a.evaluate(()=>!window.__webglGeneratorApp.map.settlements.cities.find(Boolean).name.startsWith('恢复点')));
}finally{console.log(JSON.stringify({checks},null,2));await fs.writeFile(path.join(process.env.TEMP,'batch-recovery-final.json'),JSON.stringify({checks},null,2));await browser.close();}
