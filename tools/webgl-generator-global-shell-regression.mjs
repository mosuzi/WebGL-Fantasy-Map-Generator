#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

import {
  completeStartupLoading,
  failStartupLoading,
  STARTUP_FAILURE_USER_MESSAGE,
  STARTUP_LOADING_MIN_VISIBLE_MS,
  startupFailureMessage,
  updateStartupLoadingStatus
} from "../app/webgl-generator/src/ui/startup-loading.js";

const [packageSource, indexSource, viteSource, mainSource, appSource, panelSource, toolbarSource, storeSource, stylesSource, sealSource, fastReadyFixtureSource] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MapToolbar.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/stores/global-config-store.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/public/assets/mosuzi-seal.png", import.meta.url)),
  readFile(new URL("../app/webgl-generator/test-fixtures/startup-loading-fast-ready/index.html", import.meta.url), "utf8")
]);

const packageJson = JSON.parse(packageSource);
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "根 package.json 缺少可展示的语义版本号");
const loadingStyle = indexSource.slice(indexSource.indexOf("<style>"), indexSource.indexOf("</style>"));
const loadingMarkup = indexSource.slice(indexSource.indexOf('<div class="app-loading-screen"'), indexSource.indexOf('<main class="app-shell"'));
for (const token of ["app-loading-screen", "app-loading-scroll", "app-loading-paper-window", "app-loading-paper", "app-loading-landscape-far", "app-loading-landscape-mid", "app-loading-landscape-near", "app-loading-roller-left", "app-loading-roller-right", "舆图演算", "幻想地图生成器", "铺陈山河", "山川", "郡国", "城邑", "风物", "app-loading-seal", "app-loading-version", "卷次", "__FMG_APP_VERSION__"]) {
  assert(indexSource.includes(token), `全局加载页缺少 ${token}`);
}
assert.equal(createHash("sha256").update(sealSource).digest("hex"), "367ad061211ee469f9fccb57e438edfc52221acdb8c501b5843bf14a3c9de725", "正式印章资源不是已确认的莫苏子印3版本");
assert.match(loadingMarkup, /id="app-loading-screen" role="status" aria-live="polite" aria-labelledby="app-loading-title" aria-describedby="app-loading-status"/, "画卷加载页没有保留 role / aria 状态契约");
assert.match(loadingMarkup, /class="app-loading-title" id="app-loading-title" data-title="幻想地图生成器">幻想地图生成器<\/strong>/, "画卷中央主标题或标题 ID 漂移");
assert.match(loadingMarkup, /class="app-loading-status" id="app-loading-status">正在加载地图资源<\/p>/, "画卷下方动态状态或状态 ID 漂移");
assert.match(loadingMarkup, /<script>\s*window\.__webglGeneratorStartupLoadingStartedAt = performance\.now\(\);\s*<\/script>\s*$/, "加载屏幕 DOM 完成后、主应用 DOM 之前没有记录单调可见起点");
assert.match(loadingMarkup, /<image href="\/assets\/mosuzi-seal\.png"[\s\S]*?filter="url\(#app-loading-seal-cutout\)"/, "正式加载页没有使用同源阴刻印章资源");
assert.match(loadingMarkup, /<feColorMatrix type="matrix" values="0 0 0 0 0\.588 0 0 0 0 0\.22 0 0 0 0 0\.176 2 -1 -1 0 0"/, "印章阴刻颜色矩阵漂移");
assert.doesNotMatch(loadingMarkup, /app-loading-inscription|writing-mode:\s*vertical-rl|<p[^>]*>\s*莫苏子\s*<\/p>/, "正式加载页仍保留小字款识");
assert.doesNotMatch(loadingMarkup, /<span[^>]*class="app-loading-seal"[^>]*>[\s\S]*?莫/, "正式加载页仍使用文字印章");
assert.match(loadingStyle, /\.app-loading-seal\s*\{[\s\S]*?transform:\s*rotate\(-3deg\)/, "正式印章没有保持 -3deg 落印角度");
assert.match(indexSource, /@keyframes app-scroll-unfurl\s*\{\s*from\s*\{\s*transform: scaleX\(0\.001\);\s*\}\s*to\s*\{\s*transform: scaleX\(1\);/, "画卷纸面没有通过独立合成变换从中央展开");
assert.match(loadingStyle, /\.app-loading-scroll\s*\{[^}]*--scroll-width:\s*min\(95vw, 1120px\);[^}]*--roller-travel:[^}]*width:\s*var\(--scroll-width\);/, "画卷没有共享可复用的卷轴位移尺寸");
assert.doesNotMatch(loadingStyle.match(/\.app-loading-scroll\s*\{[^}]*\}/)?.[0] ?? "", /\bfilter\s*:/, "整幅画卷祖先仍使用会放大重绘的滤镜");
assert.match(loadingStyle, /\.app-loading-paper-window\s*\{[^}]*will-change:\s*transform;[^}]*contain:\s*paint;/, "纸面展开没有隔离为 transform 合成层");
assert.match(indexSource, /\.app-loading-roller-left\s*\{\s*left:\s*0;[\s\S]*?\.app-loading-roller-right\s*\{\s*right:\s*0;/, "左右纸卷没有固定在最终卷首和卷尾位置");
assert.match(indexSource, /@keyframes app-scroll-roller-left[^@]*translate3d\(var\(--roller-travel\), 0, 0\)[^@]*translate3d\(0, 0, 0\)/, "左侧纸卷没有通过 transform 从中央移到卷首");
assert.match(indexSource, /@keyframes app-scroll-roller-right[^@]*translate3d\(calc\(0px - var\(--roller-travel\)\), 0, 0\)[^@]*translate3d\(0, 0, 0\)/, "右侧纸卷没有通过 transform 从中央移到卷尾");
for (const keyframe of ["app-scroll-unfurl", "app-scroll-roller-left", "app-scroll-roller-right", "app-scroll-copy-reveal", "app-scroll-brush-reveal", "app-scroll-seal-set", "app-scroll-mist", "app-scroll-progress"]) {
  const source = loadingStyle.match(new RegExp(`@keyframes ${keyframe}[^@]*`))?.[0] ?? "";
  assert(source, `缺少加载动画关键帧 ${keyframe}`);
  const properties = [...source.matchAll(/[;{]\s*([a-z-]+)\s*:/g)].map((match) => match[1]);
  assert(properties.length > 0, `${keyframe} 没有可验证的动画属性`);
  for (const property of properties) assert(["transform", "opacity"].includes(property), `${keyframe} 仍动画非合成友好属性 ${property}`);
}
const unfurlTiming = loadingStyle.match(/\.app-loading-paper-window\s*\{[^}]*animation:\s*app-scroll-unfurl\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/);
const titleTiming = loadingStyle.match(/\.app-loading-title-card\s*\{[^}]*animation:\s*app-scroll-copy-reveal\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/);
const versionTiming = loadingStyle.match(/\.app-loading-version\s*\{[^}]*animation:\s*app-scroll-copy-reveal\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/);
const finiteAnimationTimings = [
  ["纸面", unfurlTiming],
  ["左纸卷", loadingStyle.match(/\.app-loading-roller-left\s*\{[^}]*animation:\s*app-scroll-roller-left\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/)],
  ["右纸卷", loadingStyle.match(/\.app-loading-roller-right\s*\{[^}]*animation:\s*app-scroll-roller-right\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/)],
  ["标题", titleTiming],
  ["题线", loadingStyle.match(/\.app-loading-brush-line\s*\{[^}]*animation:\s*app-scroll-brush-reveal\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/)],
  ["印章", loadingStyle.match(/\.app-loading-seal\s*\{[^}]*animation:\s*app-scroll-seal-set\s+(\d+)ms[^;]*\s(\d+)ms\s+both;/)],
  ["版本", versionTiming]
];
for (const [name, timing] of finiteAnimationTimings) assert(timing, `无法读取${name}动画时序`);
const unfurlEnd = Number(unfurlTiming[1]) + Number(unfurlTiming[2]);
assert(Number(titleTiming[2]) >= unfurlEnd, "标题在纸面展开结束前显现，会产生可见横向拉伸");
assert(Number(versionTiming[2]) >= unfurlEnd, "版本在纸面展开结束前显现，会产生可见横向拉伸");
const latestFiniteAnimationEnd = Math.max(...finiteAnimationTimings.map(([, timing]) => Number(timing[1]) + Number(timing[2])));
assert.equal(latestFiniteAnimationEnd, 2400, "有限加载动画的最晚结束时点已漂移，需同步最短可见时长");
assert.equal(STARTUP_LOADING_MIN_VISIBLE_MS, 2500, "启动加载页最短可见时长必须保持 2500ms");
assert(STARTUP_LOADING_MIN_VISIBLE_MS >= latestFiniteAnimationEnd, "启动加载页会在有限动画完整播放前离场");
assert.match(fastReadyFixtureSource, /from "\.\.\/\.\.\/src\/ui\/startup-loading\.js"/, "快 ready 浏览器夹具没有直接导入正式启动状态机");
assert.match(fastReadyFixtureSource, /await waitUntil\(startedAt \+ 100\);[\s\S]*?completeStartupLoading\(fakeDocument\)/, "快 ready 浏览器夹具没有在 2500ms 门槛前调用正式完成入口");
assert.match(fastReadyFixtureSource, /leavingAt >= STARTUP_LOADING_MIN_VISIBLE_MS[\s\S]*?hiddenAt >= leavingAt \+ EXIT_DELAY_MS - 8/, "快 ready 浏览器夹具没有验证离场和隐藏的真实浏览器时序");
assert.match(loadingStyle, /\.app-loading-progress i\s*\{[^}]*width:\s*78%;[^}]*transform:\s*scaleX\(0\.2308\);[^}]*will-change:\s*transform;/, "进度装饰没有改为 transform 合成动画");
assert.match(indexSource, /@media \(max-width: 520px\)[\s\S]*?\.app-loading-scroll\s*\{[^}]*--scroll-width: 96vw;[\s\S]*?\.app-loading-status\s*\{[^}]*max-width: 88vw;/, "窄屏画卷或动态状态没有限制在视口内");
assert.match(indexSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-loading-paper-window,[\s\S]*?animation: none;[\s\S]*?\.app-loading-paper-window\s*\{\s*transform: scaleX\(1\);/, "减少动态偏好没有直接呈现画卷终态");
assert.doesNotMatch(loadingStyle, /@import\b/i, "画卷首屏 CSS 依赖外部字体");
assert.equal(count(loadingMarkup, /class="app-loading-landscape app-loading-landscape-(?:far|mid|near)"[^>]*aria-hidden="true"/g), 3, "画卷缺少三层且从可访问树隐藏的山水装饰");
assert.match(loadingMarkup, /class="app-loading-progress" aria-hidden="true"/, "加载页缺少非百分比进度装饰");
assert.match(indexSource, /\.app-loading-screen\.is-leaving\s*\{/, "画卷加载页没有保留离场生命周期样式");
assert.match(indexSource, /\.app-loading-screen\[data-state="error"\] \.app-loading-status/, "画卷加载页没有保留错误态样式");
assert.match(indexSource, /startupLoading\?\.dataset\.state !== "error"/, "预启动超时会覆盖已经记录的真实启动错误");
assert.match(viteSource, /html\.replaceAll\("__FMG_APP_VERSION__", packageJson\.version\)/, "构建没有从根 package.json 注入版本号");
assert.match(mainSource, /updateStartupLoadingStatus\(document, "正在展开地图画卷"\)/, "主模块装配没有使用当前启动加载文案");
assert.match(mainSource, /failStartupLoading\(document, error\)/, "同步启动失败没有保留错误加载页");
assert.match(mainSource, /status\.textContent = startupFailureMessage\(error\)/, "普通 app status 没有复用雅化启动错误");
assert.doesNotMatch(mainSource, /status\.textContent = `启动失败：\$\{message\}`/, "普通 app status 仍直接显示原始启动异常");
assert.match(panelSource, /if \(visible\) updateStartupLoadingStatus\(documentRef, message\)/, "生成与恢复阶段没有同步到启动加载页");
assert.match(appSource, /completeStartupLoading\(documentRef\);\s+updateGenerationLoading\(documentRef, false\);/, "地图 ready 没有关闭启动加载页");
assert.match(appSource, /if \(!state\.map\) failStartupLoading\(documentRef, error\)/, "首次异步生成失败没有进入启动错误态");
assert.match(appSource, /operation\?\.report\("read-storage", \{message: loadingMessage\("map-import-read"\)\}\)/, "浏览器存档读取阶段没有复用雅化加载文案");
assert.match(appSource, /operation\?\.report\("decode-storage", \{message: loadingMessage\("map-import-decode"\)\}\)/, "浏览器存档解码阶段没有使用雅化加载文案");
assert.doesNotMatch(appSource, /operation\?\.report\("(?:read|decode)-storage", \{message: "正在(?:读取|解码)浏览器存档"\}\)/, "启动加载页仍暴露浏览器存档技术动作");

for (const id of ["open-generation-panel", "fit-view", "toggle-measurement", "open-development-panel", "collapse-global-tools", "expand-global-tools"]) {
  assert.equal(count(toolbarSource, new RegExp(`id="${id}"`, "g")), 1, `全局工具入口 ${id} 数量漂移`);
}
assert.match(toolbarSource, /v-show="!collapsed" class="map-toolbar-actions"/, "展开工具组没有统一受折叠状态控制");
assert.match(toolbarSource, /v-show="collapsed"[\s\S]*class="map-toolbar-edge-trigger"/, "收起后没有唯一贴边恢复按钮");
assert.match(toolbarSource, /aria-label="收起全局工具"/, "收起入口缺少中文可访问名称");
assert.match(toolbarSource, /aria-label="展开全局工具"/, "展开入口缺少中文可访问名称");
assert.doesNotMatch(toolbarSource, />\s*[‹›]\s*</, "工具栏收起入口仍依赖文本箭头字形");
assert.equal(count(toolbarSource, /class="map-toolbar-chevron map-toolbar-chevron-(?:collapse|expand)"/g), 2, "收起与展开入口没有共用 SVG 箭头基类");
assert.equal(count(toolbarSource, /viewBox="0 0 16 16"/g), 2, "SVG 箭头没有共用固定 viewBox");
assert.equal(count(toolbarSource, /aria-hidden="true"/g), 2, "装饰性 SVG 箭头没有从可访问树隐藏");
assert.equal(count(toolbarSource, /<path d="M10 3\.5 5\.5 8l4\.5 4\.5" \/>/g), 2, "两个方向没有复用同一条中心对称箭头路径");
assert.match(storeSource, /toolbarCollapsed: false/, "旧偏好缺字段时没有默认展开");
assert.match(storeSource, /typeof input\.toolbarCollapsed === "boolean"/, "折叠偏好没有严格布尔归一化");
assert.match(stylesSource, /\.map-toolbar-edge-trigger\s*\{[\s\S]*?opacity: 0\.46;/, "贴边按钮闲置态没有半透明");
assert.match(stylesSource, /\.map-toolbar-edge-trigger:hover,[\s\S]*?\.map-toolbar-edge-trigger:focus-visible[\s\S]*?opacity: 1;/, "贴边按钮 hover / focus 没有恢复完全可见");
assert.match(stylesSource, /\.map-toolbar-chevron\s*\{[\s\S]*?width: 16px;[\s\S]*?height: 16px;[\s\S]*?transform-origin: 8px 8px;/, "SVG 箭头没有固定 16 像素几何盒与中心变换原点");
assert.match(stylesSource, /\.map-toolbar-chevron-expand\s*\{\s*transform: rotate\(180deg\);\s*\}/, "展开箭头没有围绕同一几何中心反向");

{
  const fakeDocument = createFakeDocument({now: 500, startedAt: 0});
  assert.equal(updateStartupLoadingStatus(fakeDocument, "启封舆图"), true);
  assert.equal(fakeDocument.status.textContent, "启封舆图");
  assert.equal(completeStartupLoading(fakeDocument), true);
  assert.equal(fakeDocument.screen.dataset.state, "ready");
  assert.equal(fakeDocument.status.textContent, "地图已就绪");
  assert.equal(updateStartupLoadingStatus(fakeDocument, "不应覆盖"), false, "ready 等待期仍允许加载文案覆盖");
  assert.equal(fakeDocument.classes.has("is-leaving"), false, "快速 ready 没有等待最短可见时长");
  fakeDocument.clock.advanceBy(1999);
  assert.equal(fakeDocument.classes.has("is-leaving"), false, "最短可见门槛前提前离场");
  fakeDocument.clock.advanceBy(1);
  assert.equal(fakeDocument.classes.has("is-leaving"), true, "到达最短可见门槛后没有开始淡出");
  assert.equal(fakeDocument.attributes.get("aria-hidden"), "true");
  fakeDocument.clock.advanceBy(279);
  assert.equal(fakeDocument.screen.hidden, false, "离场过渡尚未结束时提前隐藏");
  fakeDocument.clock.advanceBy(1);
  assert.equal(fakeDocument.screen.hidden, true, "离场过渡结束后没有退出交互层");
}

{
  const fakeDocument = createFakeDocument({now: 2499, startedAt: 0});
  assert.equal(completeStartupLoading(fakeDocument), true);
  assert.equal(fakeDocument.classes.has("is-leaving"), false, "门槛前 1ms 不应立即淡出");
  fakeDocument.clock.advanceBy(1);
  assert.equal(fakeDocument.classes.has("is-leaving"), true, "到达 2500ms 门槛时没有淡出");
}

for (const now of [2500, 3100]) {
  const fakeDocument = createFakeDocument({now, startedAt: 0});
  assert.equal(completeStartupLoading(fakeDocument), true);
  assert.equal(fakeDocument.classes.has("is-leaving"), true, `${now}ms ready 应立即淡出`);
}

{
  const fakeDocument = createFakeDocument({now: 300, startedAt: 0});
  assert.equal(completeStartupLoading(fakeDocument), true);
  fakeDocument.clock.advanceBy(400);
  assert.equal(failStartupLoading(fakeDocument, new Error("等待期错误")), true);
  assert.equal(updateStartupLoadingStatus(fakeDocument, "不应覆盖错误"), false);
  assert.equal(fakeDocument.clock.pendingCount(), 0, "等待期错误没有清除最短可见计时器");
  fakeDocument.clock.advanceBy(3000);
  assertErrorState(fakeDocument, STARTUP_FAILURE_USER_MESSAGE);
}

{
  const fakeDocument = createFakeDocument({now: 2800, startedAt: 0});
  assert.equal(completeStartupLoading(fakeDocument), true);
  fakeDocument.clock.advanceBy(100);
  assert.equal(failStartupLoading(fakeDocument, new Error("淡出期错误")), true);
  assert.equal(fakeDocument.clock.pendingCount(), 0, "淡出期错误没有清除隐藏计时器");
  fakeDocument.clock.advanceBy(500);
  assertErrorState(fakeDocument, STARTUP_FAILURE_USER_MESSAGE);
}

{
  const technicalError = new Error("Worker session buffer checksum mismatch");
  const fakeDocument = createFakeDocument({now: 0, startedAt: 0});
  assert.equal(failStartupLoading(fakeDocument, technicalError), true);
  assertErrorState(fakeDocument, STARTUP_FAILURE_USER_MESSAGE);
  assert.doesNotMatch(fakeDocument.status.textContent, /Worker|session|buffer|checksum/i, "普通启动错误泄漏内部术语");
  assert.equal(startupFailureMessage(technicalError), STARTUP_FAILURE_USER_MESSAGE);
  assert.equal(startupFailureMessage(technicalError, {debug: true}), "启动失败：Worker session buffer checksum mismatch");
}

{
  const fakeDocument = createFakeDocument({now: 0, startedAt: 0, reducedMotion: true});
  assert.equal(completeStartupLoading(fakeDocument), true);
  assert.equal(fakeDocument.classes.has("is-leaving"), true, "减少动态偏好没有立即淡出");
}

for (const options of [{now: 100, omitStart: true}, {now: 100, startedAt: Number.NaN}, {now: 100, startedAt: 200}]) {
  const fakeDocument = createFakeDocument(options);
  assert.equal(completeStartupLoading(fakeDocument), true);
  assert.equal(fakeDocument.classes.has("is-leaving"), true, "起点缺失或非法时没有 fail-open");
}

console.log(JSON.stringify({
  ok: true,
  version: packageJson.version,
  loadingVisual: "chinese-scroll",
  loadingLifecycle: ["loading", "ready", "error"],
  globalToolEntries: 4,
  idleOpacity: 0.46,
  persistedPreference: "toolbarCollapsed"
}, null, 2));

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function createFakeDocument({now = 0, startedAt = 0, reducedMotion = false, omitStart = false} = {}) {
  const classes = new Set();
  const attributes = new Map();
  const clock = createFakeClock(now, reducedMotion);
  if (!omitStart) clock.view.__webglGeneratorStartupLoadingStartedAt = startedAt;
  const screen = {
    hidden: false,
    dataset: {state: "loading"},
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value)
    },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key)
  };
  const status = {textContent: ""};
  return {
    screen,
    status,
    classes,
    attributes,
    clock,
    defaultView: clock.view,
    getElementById(id) {
      if (id === "app-loading-screen") return screen;
      if (id === "app-loading-status") return status;
      return null;
    }
  };
}

function createFakeClock(initialNow, reducedMotion) {
  let now = initialNow;
  let nextId = 1;
  const tasks = new Map();
  const view = {
    performance: {now: () => now},
    matchMedia: query => ({matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion}),
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      tasks.set(id, {callback, due: now + Math.max(0, Number(delay) || 0)});
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    }
  };
  return {
    view,
    advanceBy(duration) {
      const target = now + duration;
      while (true) {
        const next = [...tasks.entries()]
          .filter(([, task]) => task.due <= target)
          .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
        if (!next) break;
        const [id, task] = next;
        tasks.delete(id);
        now = task.due;
        task.callback();
      }
      now = target;
    },
    pendingCount: () => tasks.size
  };
}

function assertErrorState(fakeDocument, message) {
  assert.equal(fakeDocument.screen.hidden, false, "错误态没有保持加载页可见");
  assert.equal(fakeDocument.screen.dataset.state, "error");
  assert.equal(fakeDocument.classes.has("is-leaving"), false, "错误态仍保留离场类");
  assert.equal(fakeDocument.attributes.has("aria-hidden"), false, "错误态仍从可访问树隐藏");
  assert.equal(fakeDocument.status.textContent, message);
}
