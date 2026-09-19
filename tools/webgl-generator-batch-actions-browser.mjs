import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
import {populationUnitsToPeople} from '../app/webgl-generator/src/ui/display-units.js';
import {NOTES_SUMMARY_TYPE,NOTES_SUMMARY_VERSION} from '../app/webgl-generator/src/runtime/note-import.js';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[];
page.on('dialog',d=>d.accept());page.setDefaultTimeout(15000);
const check=(name,value,detail)=>{checks.push({name,pass:!!value,detail});assert.ok(value,name);};
try{
 await page.goto('http://127.0.0.1:5586/');await waitForApiReady(page,180000);await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'panel-acceptance',cellsTarget:3000}));
 await page.evaluate(()=>{const a=window.__webglGeneratorApp;a.panels.city.open(a.map,a.selection,a.editHistory.getStats());});
 for(const [key,label] of [['plaza','贸易中心'],['citadel','要塞'],['walls','城墙'],['temple','神庙'],['capital','首都'],['port','港口']]){
  const ids=await page.evaluate(()=>window.__webglGeneratorApp.map.settlements.cities.filter(c=>c&&!c.removed).map(c=>c.id));let chosen;
  for(const id of ids){await page.evaluate(id=>window.__webglGeneratorApp.panels.city.setSelectedCityId(id),id);if(await page.getByRole('button',{name:label,exact:true}).isEnabled()){chosen=id;break;}}
  assert.notEqual(chosen,undefined,`${label}合法候选`);
  const before=await page.evaluate(id=>{const a=window.__webglGeneratorApp;return{city:JSON.stringify(a.map.settlements.cities[id]),history:a.editHistory.getStats().undo};},chosen);
  await page.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(h=>window.__webglGeneratorApp.editHistory.getStats().undo===h+1,before.history);
  check(`${label}按钮与关联提示`,await page.locator('.city-update-guidance').innerText().then(t=>t.includes(label)));
  await page.evaluate(()=>window.webglGeneratorApi.history.undo());check(`${label}精确撤销`,await page.evaluate(id=>JSON.stringify(window.__webglGeneratorApp.map.settlements.cities[id]),chosen)===before.city);
  await page.evaluate(()=>window.webglGeneratorApi.history.redo());check(`${label}重做提示`,await page.locator('.city-update-guidance').innerText().then(t=>t.includes(label)));await page.evaluate(()=>window.webglGeneratorApi.history.undo());
 }
 const cityId=await page.evaluate(()=>window.__webglGeneratorApp.map.settlements.cities.find(Boolean).id);await page.evaluate(id=>window.__webglGeneratorApp.panels.city.setSelectedCityId(id),cityId);
 await page.getByRole('spinbutton',{name:'城市人口（人）'}).fill('12345');await page.getByRole('button',{name:'应用人口',exact:true}).click();
 const people=await page.evaluate(id=>({population:window.__webglGeneratorApp.map.settlements.cities[id].population,units:window.webglGeneratorApi.layers.get().data.units}),cityId);
 check('人口真实编辑入口',Math.round(populationUnitsToPeople(people.population,people.units))===12345,people);
 const failure=await page.evaluate(async id=>{const a=window.__webglGeneratorApp,before=JSON.stringify(a.cityGuidance.read(id));const r=await window.webglGeneratorApi.edit.economy.rebuild({confirm:false});return{rejected:!r.ok||r.data.executed===false,same:before===JSON.stringify(a.cityGuidance.read(id))};},cityId);check('取消重算保持关联提示',failure.rejected&&failure.same,failure);
 const rebuilt=await page.evaluate(()=>window.webglGeneratorApi.edit.economy.rebuild({confirm:true}));check('实际经济重算成功',rebuilt.ok&&rebuilt.data.executed!==false,rebuilt.error);
 check('只清除实际重算领域',await page.evaluate(id=>{const g=window.__webglGeneratorApp.cityGuidance.read(id);return!g.pending.includes('economy')&&g.pending.includes('routes')&&g.pending.includes('military');},cityId));
 await page.evaluate(()=>{const a=window.__webglGeneratorApp;a.panels.notes.open(a.map,a.selection,a.editHistory.getStats());});
 await page.getByRole('button',{name:'导入',exact:true}).click();const menu=page.locator('.ui-panel-io-dropdown:visible');await menu.waitFor();check('导入菜单明亮主题',await menu.evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(255, 255, 255)');
 const item=menu.getByRole('menuitem').first(),label=await item.innerText();const chooserPromise=page.waitForEvent('filechooser');await item.click();const chooser=await chooserPromise;
 await chooser.setFiles({name:'notes-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({type:NOTES_SUMMARY_TYPE,version:NOTES_SUMMARY_VERSION,notes:[{id:'city:999999',kind:'city',objectId:999999,name:'导入菜单验证',body:'未确认不得写入',format:'plain'}]}))});
 await page.locator('.notes-import-preview').waitFor();const revision=await page.evaluate(()=>window.__webglGeneratorApp.mapRevision.getSnapshot().mapRevision);await page.locator('.notes-import-preview').getByRole('button',{name:'取消',exact:true}).click();
 check('聚合导入原预览及取消保持',await page.evaluate(revision=>window.__webglGeneratorApp.mapRevision.getSnapshot().mapRevision===revision&&!window.__webglGeneratorApp.map.notes.notes.some(n=>n.name==='导入菜单验证'),revision),label);
}finally{console.log(JSON.stringify({checks},null,2));await fs.writeFile(path.join(process.env.TEMP,'batch-actions-final.json'),JSON.stringify({checks},null,2));await browser.close();}
