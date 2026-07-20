#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "default-label-style-kunyu-stage-2-1.png");
const host = "127.0.0.1";
const port = 5471;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 30000);

  await page.evaluate(async () => {
    const generated = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "stage-2-1", cellsTarget: 10000});
    if (!generated?.ok) throw new Error(generated?.error?.message || "默认地图生成失败");
    const map = window.__webglGeneratorApp.map;
    const custom = await window.webglGeneratorApi.edit.labels.addCustom({
      text: "海内舆记",
      x: map.metadata.graphWidth * 0.52,
      y: map.metadata.graphHeight * 0.48
    });
    if (!custom?.ok) throw new Error(custom?.error?.message || "手工标签创建失败");
    await window.webglGeneratorApi.selection.clear();
  });
  await page.waitForFunction(() => ["state", "province", "capital", "city", "custom"].every(type => document.querySelector(`[data-label-style-type="${type}"]`)));
  await page.waitForTimeout(500);

  const evidence = await page.evaluate(() => {
    const read = type => {
      const node = document.querySelector(`[data-label-style-type="${type}"]`);
      const style = getComputedStyle(node);
      return {
        text: node.textContent,
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight),
        letterSpacing: Number.parseFloat(style.letterSpacing),
        color: style.color,
        opacity: Number(style.opacity),
        strokeWidth: Number.parseFloat(style.webkitTextStrokeWidth),
        textShadow: style.textShadow,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius
      };
    };
    const renderer = window.__webglGeneratorApp.renderer;
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      styles: Object.fromEntries(["state", "province", "capital", "city", "custom"].map(type => [type, read(type)])),
      visible: {
        states: document.querySelectorAll('.state-label.visible').length,
        provinces: document.querySelectorAll('.province-label.visible').length,
        cities: document.querySelectorAll('.city-label.visible').length,
        custom: document.querySelectorAll('.custom-label.visible').length
      },
      total: Object.fromEntries(["state", "province", "capital", "city", "custom"].map(type => [type, document.querySelectorAll(`[data-label-style-type="${type}"]`).length])),
      kaiTiAvailable: document.fonts.check('16px "KaiTi"'),
      glError: renderer.getStats().draw?.glError ?? gl?.getError?.() ?? 0,
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
    };
  });
  await page.screenshot({path: screenshotPath, fullPage: true});

  const {styles} = evidence;
  for (const [type, style] of Object.entries(styles)) {
    assert.match(style.fontFamily, /KaiTi|Kaiti/, `${type} 没有使用舆图楷体字体栈`);
    assert.ok(style.strokeWidth > 0 && style.strokeWidth <= 0.8, `${type} 细衬边超出范围`);
    assert.ok(style.textShadow === "none" || /rgba\(0, 0, 0, 0\)/.test(style.textShadow), `${type} 默认阴影仍可见`);
  }
  assert.equal(styles.state.color, "rgb(66, 38, 14)", "国家标签不是深褐墨色");
  assert.equal(styles.city.color, "rgb(28, 19, 10)", "城市标签不是深褐墨色");
  assert.ok(styles.state.fontSize > styles.province.fontSize && styles.province.fontSize > styles.city.fontSize, "区域到城市的字号层级不清");
  assert.ok(styles.state.letterSpacing > styles.province.letterSpacing && styles.province.letterSpacing > styles.city.letterSpacing, "区域到城市的疏密层级不清");
  assert.equal(styles.custom.borderRadius, "1px", "手工标签仍是现代圆角胶囊");
  assert.ok(Object.values(evidence.total).every(count => count > 0), "五类标签没有在真实地图中完整生成");
  assert.ok(evidence.visible.states + evidence.visible.provinces + evidence.visible.cities > 0, "默认视口没有显示任何地图标签");
  assert.equal(evidence.glError, 0, "默认标签样式验收出现 WebGL 错误");
  assert.equal(evidence.healthErrors, 0, "默认标签样式验收出现 health error");
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.ok(existsSync(screenshotPath) && statSync(screenshotPath).size > 0, "默认标签样式验收截图没有生成");

  console.log(JSON.stringify({ok: true, evidence, screenshotPath, consoleErrors, pageErrors}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, `.${normalize(pathname)}`);
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
