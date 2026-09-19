import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {waitForApiReady} from './webgl-generator-api-browser-ready.mjs';
const {chromium}=createRequire(path.resolve('source/Fantasy-Map-Generator/package.json'))('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:5586/');await waitForApiReady(page,180000);
 await page.evaluate(()=>window.webglGeneratorApi.generate.newMap({confirm:true,seed:'batch-final',cellsTarget:100000}));
 await page.waitForTimeout(200);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const result=await page.evaluate(async()=>{const a=window.__webglGeneratorApp,c=a.map.settlements.cities.find(Boolean),start=performance.now();const r=await window.webglGeneratorApi.edit.cities.rename(c.id,'唯一搜索验收城市');return {ms:performance.now()-start,result:r};});
 await page.waitForTimeout(100);
 const profile=await cdp.send('Profiler.stop');
 await fs.writeFile(path.join(process.env.TEMP,'rename-authorized.cpu.json'),JSON.stringify(profile));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
