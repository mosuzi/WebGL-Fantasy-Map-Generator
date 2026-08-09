#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const timeoutMs = 180000;
const configuredBaseUrl = String(process.env.FMG_BASE_URL || "").replace(/\/$/, "");
const laboratories = [
  {label: "WebGL 单元格实验室", url: "https://fmg.mosuzi.top/prototype/web-cells/"},
  {label: "共享边界拓扑实验室", url: "https://fmg.mosuzi.top/prototype/boundary-topology-lab/"},
  {label: "画卷加载页概念实验室", url: "https://fmg.mosuzi.top/prototype/loading-scroll-showcase/"},
  {label: "河流网络算法实验室", url: "https://fmg.mosuzi.top/prototype/river-network-lab/"}
];
const vite = configuredBaseUrl ? null : await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
let browser;

try {
  if (vite) await vite.listen();
  const baseUrl = configuredBaseUrl || `http://${host}:${vite.httpServer.address().port}`;
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    window.__laboratoryGuideTargets = [];
    window.open = (url, target, features) => {
      window.__laboratoryGuideTargets.push({url: String(url), target, features});
      return null;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("[FMG health]")) consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?healthClear=1&laboratoryGuide=317`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await openControlPanel(page);
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  const layouts = [];
  for (const viewport of [{width: 1280, height: 800}, {width: 390, height: 760}, {width: 320, height: 700}]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", {name: "实验室", exact: true}).click();
    const menuItems = page.getByRole("menuitem");
    await menuItems.filter({hasText: laboratories[0].label}).waitFor();
    const metrics = await page.evaluate(labels => {
      const items = labels.map(label => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent?.trim() === label)?.getBoundingClientRect());
      return {
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        items: items.map(rect => rect && ({left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom})),
        viewport: innerWidth
      };
    }, laboratories.map(item => item.label));
    assert.equal(metrics.documentOverflow, 0, `${viewport.width}px 简介页出现横向溢出`);
    assert.equal(metrics.items.length, laboratories.length, `${viewport.width}px 实验室菜单项目数量错误`);
    for (const [index, rect] of metrics.items.entries()) {
      assert.ok(rect && rect.left >= 0 && rect.right <= metrics.viewport + 1, `${viewport.width}px ${laboratories[index].label} 越出视口`);
    }
    layouts.push({viewport: `${viewport.width}x${viewport.height}`, ...metrics});
    await page.keyboard.press("Escape");
  }

  const locationBefore = await page.evaluate(() => location.href);
  for (const laboratory of laboratories) {
    await page.getByRole("button", {name: "实验室", exact: true}).click();
    await page.getByRole("menuitem", {name: laboratory.label, exact: true}).click();
  }
  const targets = await page.evaluate(() => window.__laboratoryGuideTargets);
  assert.equal(await page.evaluate(() => location.href), locationBefore, "点击实验室入口导航了当前地图页");
  assert.deepEqual(targets.map(item => item.url), laboratories.map(item => item.url), "实验室菜单没有打开对应的正式环境链接");
  for (const target of targets) {
    assert.equal(target.target, "_blank", "实验室入口没有使用新标签页");
    assert.match(target.features, /noopener/);
    assert.match(target.features, /noreferrer/);
  }
  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error"));
  assert.deepEqual(consoleErrors, [], "实验室导引浏览器回归出现 console error");
  assert.deepEqual(pageErrors, [], "实验室导引浏览器回归出现 page error");
  assert.deepEqual(healthErrors, [], "实验室导引浏览器回归出现 health error");
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0, "实验室导引浏览器回归出现 WebGL error");
  console.log(JSON.stringify({ok: true, baseUrl, laboratories: targets, layouts, consoleErrors: 0, pageErrors: 0, healthErrors: 0, glError: 0}, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
}

async function openControlPanel(page) {
  const heading = page.getByRole("heading", {name: "控制面板", exact: true});
  if (!await heading.isVisible().catch(() => false)) await page.getByRole("button", {name: "控制面板", exact: true}).click();
  await heading.waitFor();
}
