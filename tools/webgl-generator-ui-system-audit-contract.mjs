#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const auditSource = readFileSync(join(rootDir, "tools", "webgl-generator-ui-system-audit.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const lazyPanelSource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "ui", "panels", "lazy-vue-panel.js"), "utf8");
const overlaySource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "ui", "overlay-registry.js"), "utf8");
const controlPanelSource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "ui", "vue", "components", "ControlPanel.vue"), "utf8");
const tabsSource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "ui", "vue", "components", "base", "UiTabs.vue"), "utf8");
const stylesSource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "styles.css"), "utf8");

assert.equal(packageJson.scripts["audit:ui-system"], "node --no-warnings ./tools/webgl-generator-ui-system-audit.mjs");
assert.match(auditSource, /auditLazyPerformance/);
assert.match(auditSource, /auditDesktopInteraction/);
assert.match(auditSource, /auditScaledViewport/);
assert.match(auditSource, /auditManualPanelPosition/);
assert.match(auditSource, /auditHeightPanelViewportOrigin/);
assert.match(auditSource, /setViewportSize\(\{width: 720, height: 720\}\)/);
assert.match(auditSource, /keyboard\.press\("Shift\+G"\)/);
assert.match(auditSource, /高级地形程序与条件变换/);
assert.match(auditSource, /windowScroll\.y !== 0/);
assert.match(auditSource, /inspectCoexistence/);
assert.match(auditSource, /inspectAccessibility/);
assert.match(auditSource, /inspectShortcutToast/);
assert.match(auditSource, /HeapProfiler\.collectGarbage/);
for (const chunk of ["HeightPanel-", "MilitaryPanel-", "EconomyPanel-", "NamebasePanel-"]) assert.match(auditSource, new RegExp(chunk));
assert.match(lazyPanelSource, /Promise\.resolve\(\)\.then\(loadComponent\)/);
assert.match(lazyPanelSource, /PerformanceObserver|scheduleLazyVuePanelPreload/);
assert.match(overlaySource, /focusEntry/);
assert.match(overlaySource, /restoreFocusTarget/);
assert.match(overlaySource, /closeTopmost/);
assert.equal(packageJson.scripts["regress:panel-manual-position"], "node --no-warnings ./tools/webgl-generator-panel-manual-position-regression.mjs");
const controlTabs = controlPanelSource.match(/const tabs = Object\.freeze\(\[[\s\S]*?\]\);/)?.[0] || "";
assert.deepEqual([...controlTabs.matchAll(/\{id: "([^"]+)"/g)].map(match => match[1]), ["about", "generation", "themes", "styles", "layers", "management", "units"], "控制面板一级 Tab 分母发生漂移");
assert.match(tabsSource, /<ElTabs[\s\S]*\bstretch\b/, "控制面板一级 Tab 没有均分可见宽度");
assert.match(stylesSource, /\.control-panel-tabs \.el-tabs__item\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*center;/s, "控制面板 Tab 按钮内容没有水平居中");
assert.match(stylesSource, /\.control-panel-tabs \.el-tabs__item span\s*\{[^}]*width:\s*100%;[^}]*text-overflow:\s*ellipsis;[^}]*text-align:\s*center;/s, "控制面板 Tab 文字没有居中或安全省略");

console.log(JSON.stringify({
  ok: true,
  matrix: ["多面板组合", "手动位置偏好", "持久化恢复", "固定浮层", "键盘焦点", "缩放与字体", "底部提示", "懒加载", "长任务", "连续打开内存"],
  lazyPanels: ["height-panel", "military-panel", "economy-panel", "namebase-panel"]
}, null, 2));
