#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const showcaseRoot = path.join(projectRoot, "prototype", "loading-scroll-showcase");
const [indexSource, styleSource, appSource, readmeSource, packageSource, sealSource] = await Promise.all([
  readFile(path.join(showcaseRoot, "index.html"), "utf8"),
  readFile(path.join(showcaseRoot, "src", "styles.css"), "utf8"),
  readFile(path.join(showcaseRoot, "src", "app.js"), "utf8"),
  readFile(path.join(showcaseRoot, "README.md"), "utf8"),
  readFile(path.join(projectRoot, "package.json"), "utf8"),
  readFile(path.join(showcaseRoot, "assets", "mosuzi-seal.png"))
]);
const packageJson = JSON.parse(packageSource);

for (const text of ["舆图演算", "架空地图生成器", "铺陈山河", "推演万邦", "山川", "郡国", "城邑", "风物", "卷次", "v0.1.0"]) {
  assert(indexSource.includes(text), `概念稿缺少文字层级：${text}`);
}

assert.doesNotMatch(indexSource, /<main\b[^>]*\brole="status"/, "概念页主容器不应把评审控制纳入状态直播区域");
assert.match(indexSource, /class="loading-copy" role="status" aria-live="polite" aria-atomic="true" aria-labelledby="showcase-title" aria-describedby="showcase-status"/, "加载文案缺少独立状态直播与可访问关联");
assert.match(indexSource, /class="main-title" id="showcase-title" data-title="架空地图生成器">架空地图生成器<\/h1>/, "主标题真实文本或墨晕复制层契约漂移");
assert.match(indexSource, /id="replay-button">重新展开<\/button>[\s\S]*?id="next-copy-button">下一文案<\/button>[\s\S]*?id="error-button" aria-pressed="false">错误态<\/button>[\s\S]*?id="static-button" aria-pressed="false">静态终态<\/button>/, "四个概念评审控制不完整");
assert.doesNotMatch(indexSource, /https?:\/\/|(?:src|href|xlink:href)="(?!\.\/|data:)/i, "概念稿依赖外部图片、脚本或样式");
assert.doesNotMatch(styleSource, /@import\b|url\s*\(/i, "概念稿 CSS 依赖外部字体或图片");
assert.match(indexSource, /landscape-far[\s\S]*?landscape-mid[\s\S]*?landscape-near/, "画卷缺少远中近三层山水");
assert.match(indexSource, /class="paper-patina"/, "古画纸面缺少旧化斑痕层");
assert.doesNotMatch(indexSource + styleSource, /gold-flecks|米金高光|金粉/i, "古朴方向仍残留金粉或高光语义");
assert.doesNotMatch(indexSource + styleSource, /maker-inscription|maker-prefix|silk-edge|>小字<|>莫苏子</, "概念稿仍残留小字款识或绢装节点");
assert.match(indexSource, /class="paper-roll roller roller-left"[\s\S]*?class="paper-roll roller roller-right"/, "画轴没有改为两侧纸张自卷结构");
assert.match(styleSource, /\.paper-sheet\s*\{[\s\S]*?clip-path: polygon\([\s\S]*?0 3%[\s\S]*?100% 96\.8%/, "中央旧纸缺少上下不规则毛边");
const rollTreatment = styleSource.slice(styleSource.indexOf(".roller {"), styleSource.indexOf(".loading-copy {"));
assert.match(rollTreatment, /#bda77b[\s\S]*?\.roller::before[\s\S]*?top: -2\.2%;[\s\S]*?\.roller::after[\s\S]*?bottom: -2\.2%;/, "纸卷缺少共享旧纸材质、顶部短卷舌或底部暗卷曲");
assert.doesNotMatch(rollTreatment, /#55371f|#2e1d13|#4d311d|#765535/, "纸卷仍残留木轴或旧铜帽配色");
assert.match(indexSource, /<svg class="seal" viewBox="0 0 800 800" role="img" aria-label="阴刻印章：莫苏子印">[\s\S]*?<feColorMatrix[\s\S]*?2 -1 -1 0 0[\s\S]*?<image[\s\S]*?class="seal-source"[\s\S]*?href="\.\/assets\/mosuzi-seal\.png"[\s\S]*?width="800"[\s\S]*?height="800"[\s\S]*?filter="url\(#seal-ink-cutout\)"/, "印章没有用指定本地 PNG 提供字形并转换为阴刻印泥");
assert.doesNotMatch(indexSource, /class="seal-(?:mo|su|zi|yin)"|<span[^>]*>[莫苏子印]<\/span>/, "印章仍残留四字文字拼排节点");
const sealTreatment = styleSource.slice(styleSource.indexOf(".seal {"), styleSource.indexOf(".version-plaque {"));
assert.match(sealTreatment, /width: clamp\(35px, 5\.2vw, 57px\);[\s\S]*?aspect-ratio: 1;[\s\S]*?transform: rotate\(-3deg\);/, "指定印面没有保持方形、受控尺寸或左倾终态");
assert.equal(createHash("sha256").update(sealSource).digest("hex"), "367ad061211ee469f9fccb57e438edfc52221acdb8c501b5843bf14a3c9de725", "仓库印面资源与用户最终指定 PNG 不一致");
assert.equal(sealSource.readUInt32BE(16), 800, "指定印面宽度不是 800px");
assert.equal(sealSource.readUInt32BE(20), 800, "指定印面高度不是 800px");
const titleTreatment = styleSource.slice(styleSource.indexOf(".main-title {"), styleSource.indexOf(".brush-line {"));
assert.match(titleTreatment, /color: #29382f;[\s\S]*?-webkit-text-stroke: 0\.2px[\s\S]*?text-shadow:/, "主标题缺少哑光浓墨、细描边与渗墨层次");
assert.match(titleTreatment, /\.main-title::after[\s\S]*?color: rgba\(31, 48, 39, 0\.2\);[\s\S]*?mask-image: repeating-linear-gradient/, "主标题缺少干笔斑驳层");
assert.doesNotMatch(titleTreatment, /rgba\(255|rgba\(232|drop-shadow|0 1px 0|#[ef][0-9a-f]{5}/i, "主标题仍残留明亮高光或光晕处理");
const progressTreatment = styleSource.slice(styleSource.indexOf(".progress-ornament {"), styleSource.indexOf(".stage-kicker {"));
assert.doesNotMatch(progressTreatment, /box-shadow|#d3af65|rgba\(211, 175, 101/, "进度线仍残留发光高光");
assert.match(styleSource, /@keyframes unfurl-paper[\s\S]*?clip-path: inset\(0 50%\)[\s\S]*?clip-path: inset\(0\)/, "画卷没有从中央展开");
assert.match(styleSource, /@keyframes set-seal[\s\S]*?scale\(1\.28\)[\s\S]*?scale\(1\)/, "朱印缺少落印动画");
const scrollKeyframes = styleSource.slice(styleSource.indexOf("@keyframes unfurl-paper"), styleSource.indexOf("@keyframes reveal-copy"));
assert.doesNotMatch(scrollKeyframes, /scaleX\(/, "画卷展开仍通过横向缩放扭曲内容");
assert.match(styleSource, /\.main-title\s*\{[\s\S]*?white-space: nowrap;/, "主标题没有保持单行");
assert.match(styleSource, /@media \(max-width: 520px\)[\s\S]*?\.scroll-stage\s*\{[\s\S]*?width: 96vw;/, "390px 窄屏没有限制整卷宽度");
assert.match(styleSource, /@media \(max-width: 340px\)[\s\S]*?grid-template-columns: repeat\(2, auto\)[\s\S]*?\.seal\s*\{\s*bottom: 22%;/, "320px 题签或朱印避让没有极窄屏回退");
assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;[\s\S]*?clip-path: inset\(0\) !important;/, "减少动态效果没有跳过延迟并直接呈现终态");

for (const copy of ["启封舆图", "辨读旧卷", "铺陈山川", "点定郡国", "山河成卷"]) {
  assert(appSource.includes(copy), `加载阶段缺少优雅文案：${copy}`);
}
assert.match(appSource, /setErrorMode[\s\S]*?dataset\.mode[\s\S]*?aria-pressed/, "错误态没有同步视觉与可访问状态");
assert.match(appSource, /requestAnimationFrame[\s\S]*?classList\.add\("is-replaying"\)/, "重新展开没有可靠重启动画");
assert.match(appSource, /function replayScroll\(\)[\s\S]*?classList\.remove\("is-static"\)[\s\S]*?staticButton\.setAttribute\("aria-pressed", "false"\)/, "重新展开没有退出静态终态并同步按钮状态");
assert.match(readmeSource, /用户明确认可前，不会移植到正式/, "README 没有冻结独立评审边界");
assert.equal(packageJson.scripts["start:loading-scroll-showcase"], "node ./tools/serve-prototype.mjs --port 5402 --dir ./prototype/loading-scroll-showcase", "概念稿启动脚本漂移");
assert.equal(packageJson.scripts["regress:loading-scroll-showcase"], "node --no-warnings ./tools/loading-scroll-showcase-regression.mjs", "概念稿回归脚本漂移");

console.log(JSON.stringify({
  ok: true,
  textLevels: 6,
  stages: 5,
  controls: 4,
  externalResources: 0,
  sealAsset: "assets/mosuzi-seal.png",
  sealNaturalSize: "800×800",
  sealTilt: "-3deg"
}, null, 2));
