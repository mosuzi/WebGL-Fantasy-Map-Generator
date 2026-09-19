import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
import {NOTES_SUMMARY_TYPE,NOTES_SUMMARY_VERSION} from '../app/webgl-generator/src/runtime/note-import.js';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const mode=process.argv[2]||'features',out=process.env.TEMP,report={mode,checks:[]};
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
page.setDefaultTimeout(30000);
const check=(name,value,detail)=>{report.checks.push({name,pass:!!value,detail});assert.ok(value,name);};
try{
 if(mode.startsWith('cloud')) {
  const origin='http://127.0.0.1:5586',config={appKey:'fixture-app',redirectUri:`${origin}/oauth/dropbox/callback`};
  await context.addInitScript(({origin,config})=>sessionStorage.setItem('fmg-cloud-session:v1:dropbox',JSON.stringify({version:1,provider:'dropbox',fingerprint:JSON.stringify([1,'dropbox',origin,config.appKey,config.redirectUri,'files.metadata.read','files.content.read','files.content.write']),accessToken:'fixture-only',expiresAt:Date.now()+3600000})),{origin,config});
  await context.route('**/cloud-provider-config.js',r=>r.fulfill({contentType:'application/javascript',body:`globalThis.__FMG_CLOUD_PROVIDER_CONFIG__=${JSON.stringify({version:1,providers:{dropbox:config}})}`}));
  await context.route('https://api.dropboxapi.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({entries:[],has_more:false})}));
  await context.route('https://content.dropboxapi.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:'fixture',name:'fixture.webfmg',path_lower:'/fixture.webfmg',size:123,client_modified:new Date().toISOString()})}));
 }
 await page.goto('http://127.0.0.1:5586/?healthClear=1');await waitForApiReady(page,180000);
 await page.evaluate(async()=>{const r=await window.webglGeneratorApi.generate.newMap({confirm:true,seed:'batch-ui',cellsTarget:3000});if(!r.ok)throw Error(JSON.stringify(r));});
 if(mode.startsWith('cloud')) {
  await page.evaluate(mode=>{const panel=window.__webglGeneratorApp.panels.cloudStorage;panel.open();if(mode==='cloud')panel.updateFilenameTemplate('fixture.{ext}',{commit:false});},mode);
  await page.getByRole('button',{name:'新建云端存档',exact:true}).click();
  if(mode==='cloud-diagnostic'){await page.waitForTimeout(3000);report.diagnostic=await page.locator('.cloud-storage-panel').innerText();}
  else {await page.waitForFunction(()=>window.__webglGeneratorApp.saveState.getStatus().latest?.destination==='cloud');
  check('模拟云端上传成功回执',await page.evaluate(()=>!window.__webglGeneratorApp.saveState.getStatus().dirty));}
 }else{
  if(mode==='features'){
  const imported=await page.evaluate(({type,version})=>window.webglGeneratorApi.edit.notes.import({type,version,notes:[{id:'city:999999',kind:'city',objectId:999999,name:'失落正文',body:'<b>纯文本</b>和搜索尾句',format:'plain'}]},{mode:'append'}),{type:NOTES_SUMMARY_TYPE,version:NOTES_SUMMARY_VERSION});
  check('旧孤儿备注导入',imported.ok&&imported.data.executed!==false,imported);
  await page.evaluate(()=>{const a=window.__webglGeneratorApp;a.panels.notes.open(a.map,a.selection,a.editHistory.getStats());a.panels.notes.setSelectedNoteId('city:999999');});
  await page.locator('.orphan-rescue textarea').fill('已抢救的正文');
  await page.locator('.orphan-rescue').getByRole('button',{name:'应用备注',exact:true}).click();
  check('正式界面保存孤儿正文',await page.evaluate(()=>window.__webglGeneratorApp.map.notes.notes.find(n=>n.id==='city:999999')?.body==='已抢救的正文'));
  const city=await page.evaluate(()=>window.__webglGeneratorApp.map.settlements.cities.find(c=>c&&!c.removed).id);
  await page.getByRole('combobox',{name:'重新绑定目标',exact:true}).selectOption(String(city));
  await page.getByRole('button',{name:'重新绑定',exact:true}).click();
  check('正式界面重新绑定',await page.evaluate(id=>window.__webglGeneratorApp.map.notes.notes.some(n=>n.id===`city:${id}`&&n.body==='已抢救的正文'),city));
  await page.evaluate(()=>window.webglGeneratorApi.history.undo());
  check('重新绑定精确撤销',await page.evaluate(()=>window.__webglGeneratorApp.map.notes.notes.some(n=>n.id==='city:999999'&&n.body==='已抢救的正文')));
  await page.evaluate(()=>window.webglGeneratorApi.history.redo());
  const saved=await page.evaluate(async()=>{const r=await window.webglGeneratorApi.data.exportAll({includeText:true});if(!r.ok)throw Error(JSON.stringify(r));return r.data.text;});
  const restored=await page.evaluate(text=>window.webglGeneratorApi.data.importMap(text,{confirm:true}),saved);
  check('完整存档保留抢救正文',restored.ok&&await page.evaluate(id=>window.__webglGeneratorApp.map.notes.notes.some(n=>n.id===`city:${id}`&&n.body==='已抢救的正文'),city));
  }else{await page.evaluate(()=>window.webglGeneratorApi.edit.notes.set({kind:'city',id:window.__webglGeneratorApp.map.settlements.cities.find(Boolean).id},'已抢救的正文'));}
  await page.evaluate(()=>document.querySelectorAll('.floating-panel:not(.hidden) .floating-panel-close').forEach(b=>b.click()));
  await page.getByRole('button',{name:'控制面板',exact:true}).click();
  await page.getByRole('button',{name:'搜索地图内容'}).click();
  const input=page.getByRole('textbox',{name:'地图搜索关键词'});
  await input.fill('已抢救的正文');
  await page.locator('.map-search-results button').filter({hasText:'已抢救的正文'}).first().waitFor();
  await input.press('Enter');
  await page.locator('.map-search-detail').waitFor();
  check('备注正文搜索和键盘查看',await page.locator('.map-search-detail').innerText().then(s=>s.includes('已抢救的正文')));
  await input.press('Escape');await page.locator('.map-search-dialog').waitFor({state:'hidden'});check('Esc关闭搜索',true);
  await page.evaluate(()=>{const a=window.__webglGeneratorApp;a.panels.economy.open(a.map,a.selection,a.editHistory.getStats());});
  await page.locator('.vue-economy-panel-root .el-segmented__item').filter({hasText:'交易'}).click();
  await page.getByRole('button',{name:'检查现有路网',exact:true}).click();
  await page.waitForFunction(()=>{const t=document.querySelector('.trade-path-diagnostic [role=status]')?.textContent||'';return !t.startsWith('按需检查');});
  check('交易路网正式界面',await page.locator('.trade-path-diagnostic [role=status]').innerText().then(s=>/已有路径|没有连接|暂不能|无法判断/.test(s)));
  await page.screenshot({path:path.join(out,'batch-trade-ui.png')});
 }
 check('页面错误为零',errors.length===0,errors);
}finally{await fs.writeFile(path.join(out,`batch-ui-${mode}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();await browser.close();}
