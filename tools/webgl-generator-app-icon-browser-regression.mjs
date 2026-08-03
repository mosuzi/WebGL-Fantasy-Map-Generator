import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";

const sourceDir = resolve("source/Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const baseUrl = process.argv.find(value => value.startsWith("http")) || "http://127.0.0.1:5411/";
const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
const errors = [];

try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const response = await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: 30_000});
  assert.equal(response?.status(), 200, "正式入口无法访问");
  await page.waitForSelector("#map-canvas", {timeout: 30_000});

  const metadata = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map(link => ({
      rel: link.rel,
      href: link.href,
      type: link.type,
      sizes: link.getAttribute("sizes") || ""
    }));
    const resources = [];
    for (const link of links) {
      const response = await fetch(link.href, {cache: "reload"});
      resources.push({...link, status: response.status, contentType: response.headers.get("content-type") || ""});
    }
    const manifestLink = links.find(link => link.rel === "manifest");
    const manifest = await (await fetch(manifestLink.href, {cache: "reload"})).json();
    return {
      title: document.title,
      loadingTitle: document.getElementById("app-loading-title")?.textContent?.trim() || "",
      themeColor: document.querySelector('meta[name="theme-color"]')?.content,
      resources,
      manifest
    };
  });

  assert.equal(metadata.themeColor, "#18231f");
  assert.equal(metadata.title, "莫苏子的幻想地图生成器");
  assert.equal(metadata.loadingTitle, "幻想地图生成器");
  assert.equal(metadata.resources.length, 5, "图标与 manifest 入口数量错误");
  assert(metadata.resources.every(resource => resource.status === 200), "存在无法加载的图标资源");
  assert(metadata.resources.find(resource => resource.href.endsWith("app-icon.svg"))?.contentType.includes("image/svg+xml"), "SVG favicon 内容类型错误");
  assert(metadata.resources.find(resource => resource.href.endsWith("app-icon-64.png"))?.contentType.includes("image/png"), "64px favicon 内容类型错误");
  assert(metadata.resources.find(resource => resource.href.endsWith("site.webmanifest"))?.contentType.includes("manifest+json"), "manifest 内容类型错误");
  assert.equal(metadata.manifest.name, "WebGL 幻想地图生成器");
  assert(metadata.manifest.icons.some(icon => icon.src.endsWith("app-icon-256.png") && icon.sizes === "256x256"), "manifest 缺少 256px 图标");

  const viewports = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height: 760});
    await page.waitForTimeout(400);
    const measurement = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      canvas: Boolean(document.getElementById("map-canvas")),
      errorScreenVisible: Boolean(document.querySelector(".app-error-screen:not([hidden])"))
    }));
    assert(measurement.scrollWidth <= measurement.viewport, `${width}px 出现横向溢出`);
    assert(measurement.canvas && !measurement.errorScreenVisible, `${width}px 应用入口异常`);
    viewports.push({width, ...measurement});
  }

  assert.deepEqual(errors, [], `浏览器出现错误：${errors.join(" | ")}`);
  console.log(JSON.stringify({ok: true, baseUrl, metadata, viewports, errors}, null, 2));
} finally {
  await browser.close();
}
