import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[];
const check=(name,value,detail)=>{checks.push({name,pass:!!value,detail});assert.ok(value,name);};
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(20000);
try{
 await page.goto('http://127.0.0.1:5586/');await waitForApiReady(page,180000);
 await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'batch-export',cellsTarget:3000}));
 await page.getByRole('button',{name:'控制面板',exact:true}).click();
 await page.getByRole('tab',{name:'简介',exact:true}).click();
 await page.locator('#open-export-panel').click();
 await page.getByText('高级导出选项',{exact:true}).click();
 await page.locator('#export-png-crop-mode').selectOption('map');
 await page.locator('#export-png-explicit-size').check();
 await page.locator('#export-png-output-width').fill('1200');
 await page.getByRole('textbox',{name:'PNG 预设名称'}).fill('全幅验收');
 await page.getByRole('button',{name:'保存预设',exact:true}).click();
 await page.getByRole('combobox',{name:'PNG 已存预设'}).selectOption('全幅验收');
 await page.locator('#export-png-output-width').fill('640');
 await page.locator('.png-presets').getByRole('button',{name:'应用',exact:true}).click();
 check('预设实际应用尺寸',await page.locator('#export-png-output-width').inputValue()==='1200');
 const dimensions=[];
 for(const width of [1440,690]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);
  dimensions.push(await page.evaluate(async()=>{const r=await window.webglGeneratorApi.data.exportPNG({download:false,includeDataUrl:true});if(!r.ok)throw Error(JSON.stringify(r));const image=new Image();image.src=r.data.dataUrl;await image.decode();return {width:image.width,height:image.height};}));
 }
 check('两种窗口保持实际全幅像素',dimensions.every(d=>d.width===1200&&d.height===800),dimensions);
 const legacy=await page.evaluate(async()=>{const r=await window.webglGeneratorApi.data.exportPNG({download:false,includeDataUrl:false,pixelScale:1,crop:{mode:'viewport'}});return{result:r.data,expected:window.__webglGeneratorApp.renderer.canvas.width};});
 check('显式旧倍率不受面板目标宽度覆盖',legacy.result.width===legacy.expected,legacy);
 await page.locator('#export-png-crop-mode').selectOption('world');
 await page.getByRole('textbox',{name:'PNG 预设名称'}).fill('原图范围');await page.getByRole('button',{name:'保存预设',exact:true}).click();
 await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'different-map',cellsTarget:3000}));
 await page.getByRole('combobox',{name:'PNG 已存预设'}).selectOption('原图范围');
 await page.locator('.png-presets').getByRole('button',{name:'应用',exact:true}).click();
 check('跨图固定范围拒绝',await page.locator('.png-presets [role=status]').innerText().then(t=>t.includes('另一份地图')));
 await page.getByRole('button',{name:'关闭导出面板',exact:true}).click();
 await page.locator('#open-export-panel').click();
 check('重开保留预设',await page.getByRole('combobox',{name:'PNG 已存预设'}).locator('option').allTextContents().then(values=>values.includes('全幅验收')&&values.includes('原图范围')));
 await page.screenshot({path:path.join(process.env.TEMP,'batch-export-narrow.png')});
 await page.reload();await waitForApiReady(page,180000);
 await page.getByRole('button',{name:'控制面板',exact:true}).click();await page.getByRole('tab',{name:'简介',exact:true}).click();await page.locator('#open-export-panel').click();await page.getByText('高级导出选项',{exact:true}).click();
 check('整页刷新保留预设',await page.getByRole('combobox',{name:'PNG 已存预设'}).locator('option').allTextContents().then(values=>values.includes('全幅验收')&&values.includes('原图范围')));
 check('页面错误为零',errors.length===0,errors);
}finally{await fs.writeFile(path.join(process.env.TEMP,'batch-export-browser.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));await browser.close();}
