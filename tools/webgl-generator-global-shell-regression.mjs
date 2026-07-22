#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {completeStartupLoading, failStartupLoading, updateStartupLoadingStatus} from "../app/webgl-generator/src/ui/startup-loading.js";

const [packageSource, indexSource, viteSource, mainSource, appSource, panelSource, toolbarSource, storeSource, stylesSource] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MapToolbar.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/stores/global-config-store.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

const packageJson = JSON.parse(packageSource);
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "根 package.json 缺少可展示的语义版本号");
for (const token of ["app-loading-screen", "app-loading-compass", "app-loading-owner", "Mosuzi's", "Fantasy Map", "Generator", "app-loading-version", "__FMG_APP_VERSION__"]) {
  assert(indexSource.includes(token), `全局加载页缺少 ${token}`);
}
assert.doesNotMatch(indexSource, /class="app-loading-compass" aria-hidden="true"/, "加载页品牌标题被装饰容器从可访问树隐藏");
assert.match(indexSource, /startupLoading\?\.dataset\.state !== "error"/, "预启动超时会覆盖已经记录的真实启动错误");
assert.match(viteSource, /html\.replaceAll\("__FMG_APP_VERSION__", packageJson\.version\)/, "构建没有从根 package.json 注入版本号");
assert.match(mainSource, /updateStartupLoadingStatus\(document, "正在装配地图引擎"\)/, "主模块装配没有更新启动加载状态");
assert.match(mainSource, /failStartupLoading\(document, error\)/, "同步启动失败没有保留错误加载页");
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
assert.match(storeSource, /toolbarCollapsed: false/, "旧偏好缺字段时没有默认展开");
assert.match(storeSource, /typeof input\.toolbarCollapsed === "boolean"/, "折叠偏好没有严格布尔归一化");
assert.match(stylesSource, /\.map-toolbar-edge-trigger\s*\{[\s\S]*?opacity: 0\.46;/, "贴边按钮闲置态没有半透明");
assert.match(stylesSource, /\.map-toolbar-edge-trigger:hover,[\s\S]*?\.map-toolbar-edge-trigger:focus-visible[\s\S]*?opacity: 1;/, "贴边按钮 hover / focus 没有恢复完全可见");

const fakeDocument = createFakeDocument();
assert.equal(updateStartupLoadingStatus(fakeDocument, "启封舆图"), true);
assert.equal(fakeDocument.status.textContent, "启封舆图");
assert.equal(completeStartupLoading(fakeDocument), true);
assert.equal(fakeDocument.screen.dataset.state, "ready");
assert.equal(fakeDocument.status.textContent, "地图已就绪");
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(fakeDocument.screen.hidden, true, "启动页完成过渡后没有退出交互层");
assert.equal(failStartupLoading(fakeDocument, new Error("夹具错误")), true);
assert.equal(fakeDocument.screen.hidden, false, "错误态没有恢复加载页");
assert.equal(fakeDocument.screen.dataset.state, "error");
assert.equal(fakeDocument.status.textContent, "启动失败：夹具错误");

console.log(JSON.stringify({
  ok: true,
  version: packageJson.version,
  loadingLifecycle: ["loading", "ready", "error"],
  globalToolEntries: 4,
  idleOpacity: 0.46,
  persistedPreference: "toolbarCollapsed"
}, null, 2));

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function createFakeDocument() {
  const classes = new Set();
  const attributes = new Map();
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
    defaultView: globalThis,
    getElementById(id) {
      if (id === "app-loading-screen") return screen;
      if (id === "app-loading-status") return status;
      return null;
    }
  };
}
