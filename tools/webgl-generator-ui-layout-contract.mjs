import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {inspectUiLayout} from "./ui-layout-inspector.mjs";
const {chromium} = createRequire(new URL("../source/Fantasy-Map-Generator/package.json", import.meta.url))("playwright");
const browser = await chromium.launch({channel: "chrome", headless: true});
try {
  const page = await browser.newPage();
  await page.setContent(`<style>button {font:16px Arial;padding:6px} .box{position:relative} #wrapped{width:50px} #clipped{width:50px;white-space:nowrap;overflow:hidden} #overlap{position:absolute;left:5px;top:5px}</style>
    <button id="good">完整文字</button><button id="wrapped">名称库改名</button><button id="clipped">打开国家编辑</button>
    <button id="allowed" data-layout-multiline="文件名和说明分行">文件名<br>说明</button>
    <button id="bad-exception" data-layout-multiline="允许分行" style="width:40px;height:15px;overflow:hidden">很长的文字内容</button>
    <div class="box"><button>原按钮</button><button id="overlap">遮挡</button></div>
    <ul><li role="menuitem" id="wrapped-menu" style="width:50px">名称库改名</li></ul><button hidden>隐藏按钮<br>不计</button>`);
  const r = await page.evaluate(inspectUiLayout);
  for (const [target, type] of [["#wrapped", "label-wrap"], ["#clipped", "label-clip"], ["#bad-exception", "label-clip"], ["#wrapped-menu", "label-wrap"]]) assert.ok(r.issues.some(i => i.target === target && i.type === type), `${target}/${type}`);
  assert.ok(r.issues.some(i => i.type === "control-overlap"));
  assert.ok(!r.issues.some(i => ["#good", "#allowed"].includes(i.target)));
  console.log("排版检测器：折行、裁切、重叠反例拒绝；显式多行仍检查裁切；隐藏项不误报。");
} finally {await browser.close();}
