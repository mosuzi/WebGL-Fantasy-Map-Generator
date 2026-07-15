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

assert.equal(packageJson.scripts["audit:ui-system"], "node --no-warnings ./tools/webgl-generator-ui-system-audit.mjs");
assert.match(auditSource, /auditLazyPerformance/);
assert.match(auditSource, /auditDesktopInteraction/);
assert.match(auditSource, /auditScaledViewport/);
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

console.log(JSON.stringify({
  ok: true,
  matrix: ["多面板组合", "持久化恢复", "固定浮层", "键盘焦点", "缩放与字体", "底部提示", "懒加载", "长任务", "连续打开内存"],
  lazyPanels: ["height-panel", "military-panel", "economy-panel", "namebase-panel"]
}, null, 2));
