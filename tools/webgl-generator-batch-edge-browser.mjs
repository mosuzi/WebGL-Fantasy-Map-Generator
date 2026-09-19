import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
import {NOTES_SUMMARY_TYPE,NOTES_SUMMARY_VERSION} from '../app/webgl-generator/src/runtime/note-import.js';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:690,height:1000}}),checks=[],errors=[];
page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
const check=(name,value,detail)=>{checks.push({name,pass:!!value,detail});assert.ok(value,name);};
try{
 await page.goto('http://127.0.0.1:5586/');await waitForApiReady(page,180000);
 await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'edge-final',cellsTarget:3000}));
 const setup=await page.evaluate(async({type,version})=>{const api=window.webglGeneratorApi,body='<b>孤儿纯文本</b>'+('长正文'.repeat(700))+'尾部关键词';const rs=[];rs.push(await api.edit.measurements.save([{x:360,y:240},{x:720,y:480}],{name:'测量搜索验证'}));rs.push(await api.edit.notes.createStandalone({name:'独立搜索验证',body:'独立正文',x:360,y:240}));rs.push(await api.edit.notes.import({type,version,notes:[{id:'city:999999',kind:'city',objectId:999999,name:'孤儿搜索验证',body,format:'plain'}]},{mode:'append'}));rs.push(await api.layers.setVisible('cities',false));return {results:rs,body};},{type:NOTES_SUMMARY_TYPE,version:NOTES_SUMMARY_VERSION});
 check('测量与独立孤儿备注正式入口',setup.results.every(r=>r.ok&&r.data?.executed!==false),setup.results.map(r=>({ok:r.ok,executed:r.data?.executed,error:r.error||r.data?.error})));
 await page.getByRole('button',{name:'控制面板',exact:true}).click();await page.getByRole('button',{name:'搜索地图内容'}).click();
 const input=page.getByRole('textbox',{name:'地图搜索关键词'});
 await input.fill('尾部关键词');await page.locator('.map-search-results button').filter({hasText:'孤儿搜索验证'}).waitFor();await input.press('Enter');await page.locator('.map-search-detail pre').waitFor();
 check('旧长正文完整纯文本且无伪定位',await page.locator('.map-search-detail pre').textContent()===setup.body&&await page.locator('.map-search-detail b').count()===0&&await page.getByRole('button',{name:'定位到地图',exact:true}).count()===0);
 await input.dispatchEvent('compositionstart');await input.fill('测量搜索验证');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});await page.waitForTimeout(250);
 check('中文组合期间不提前查询',await page.locator('.map-search-results').innerText().then(t=>t.includes('孤儿搜索验证')));
 await input.dispatchEvent('compositionend');await page.locator('.map-search-results button').filter({hasText:'测量搜索验证'}).waitFor();await input.press('ArrowDown');await input.press('Enter');await page.locator('.map-search-detail').waitFor();
 check('组合结束可查询测量并键盘查看',await page.locator('.map-search-detail').innerText().then(t=>t.includes('测量搜索验证')));
 await input.press('Escape');check('Esc焦点回搜索入口',await page.getByRole('button',{name:'搜索地图内容'}).evaluate(el=>el===document.activeElement));
 const extra=await page.evaluate(async()=>{const api=window.webglGeneratorApi,a=window.__webglGeneratorApp,search=data=>new Promise(respond=>document.dispatchEvent(new CustomEvent('webfmg-map-search',{detail:{...data,respond}})));const before=JSON.stringify(api.layers.get().data),revision=a.mapRevision.getSnapshot().mapRevision;const c=await search({type:'city'});await search({action:'locate',binding:c.binding,key:c.items[0].key});const unchanged=before===JSON.stringify(api.layers.get().data)&&revision===a.mapRevision.getSnapshot().mapRevision;const notes=await search({query:'独立搜索验证',type:'note'});const measurement=(await search({type:'measurement'})).items[0];await api.edit.measurements.delete(measurement.ref.id);const removed=(await search({query:'测量搜索验证'})).total===0;await api.history.undo();const restored=(await search({query:'测量搜索验证'})).total===1;await api.generate.newMap({confirm:true,seed:'edge-replaced',cellsTarget:3000});const stale=await search({action:'view',binding:c.binding,key:c.items[0].key});return{unchanged,standalone:notes.total>0,removed,restored,stale:stale.stale};});
 for(const [key,value] of Object.entries(extra))check(`搜索边界 ${key}`,value);
 // 保存与旧档已由 batch-persistence-browser 的 100k 实际入口验收，不重复运行。
 check('页面错误为零',errors.length===0,errors);
}finally{console.log(JSON.stringify({checks,errors},null,2));await fs.writeFile(path.join(process.env.TEMP,'batch-edge-final.json'),JSON.stringify({checks,errors},null,2));await browser.close();}
