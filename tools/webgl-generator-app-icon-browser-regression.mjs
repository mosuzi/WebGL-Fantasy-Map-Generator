import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";

const sourceDir = resolve("source/Fantasy-Map-Generator");
const publicDir = resolve("app/webgl-generator/public");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const baseUrl = process.argv.find(value => value.startsWith("http")) || "http://127.0.0.1:5411/";
const expectedResourceHashes = Object.fromEntries(await Promise.all([
  "app-icon.svg",
  "app-icon-32.png",
  "app-icon-64.png",
  "apple-touch-icon.png",
  "site.webmanifest"
].map(async filename => [filename, createHash("sha256").update(await readFile(join(publicDir, filename))).digest("hex")])));
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

  const warmedResources = await page.evaluate(async () => {
    const resources = await Promise.all([...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map(async link => {
      const response = await fetch(link.href, {cache: "force-cache"});
      const bytes = await response.arrayBuffer();
      return {href: link.href, hash: await sha256(bytes)};
    }));
    return resources;

    async function sha256(bytes) {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    }
  });
  await page.reload({waitUntil: "domcontentloaded"});
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
      const response = await fetch(link.href, {cache: "force-cache"});
      const bytes = await response.arrayBuffer();
      resources.push({...link, status: response.status, contentType: response.headers.get("content-type") || "", hash: await sha256(bytes)});
    }
    const manifestLink = links.find(link => link.rel === "manifest");
    const manifest = await (await fetch(manifestLink.href, {cache: "force-cache"})).json();
    const iconPixels = [];
    for (const link of links.filter(link => link.rel === "icon")) {
      const response = await fetch(link.href, {cache: "force-cache"});
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext("2d", {willReadFrequently: true});
        context.drawImage(image, 0, 0, 64, 64);
        const pixels = context.getImageData(0, 0, 64, 64);
        const corners = [[0, 0], [63, 0], [0, 63], [63, 63]].map(([x, y]) => pixels.data[(y * 64 + x) * 4 + 3]);
        let opaque = 0;
        let transparent = 0;
        let sealRed = 0;
        for (let index = 0; index < pixels.data.length; index += 4) {
          const alpha = pixels.data[index + 3];
          if (alpha > 240) opaque += 1;
          if (alpha < 8) transparent += 1;
          if (alpha > 200 && pixels.data[index] > 135 && pixels.data[index + 1] < 70 && pixels.data[index + 2] < 65) sealRed += 1;
        }
        iconPixels.push({href: link.href, corners, centerAlpha: pixels.data[((32 * 64 + 32) * 4) + 3], opaque, transparent, sealRed});
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    const continuityIcon = manifest.icons.find(icon => icon.sizes === "256x256");
    const continuityResponse = await fetch(new URL(continuityIcon.src, manifestLink.href), {cache: "force-cache"});
    const continuityUrl = URL.createObjectURL(await continuityResponse.blob());
    let rimMaxDelta = 0;
    try {
      const image = new Image();
      image.src = continuityUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d", {willReadFrequently: true});
      context.drawImage(image, 0, 0, 256, 256);
      const pixels = context.getImageData(0, 0, 256, 256).data;
      for (const radiusScale of [0.94, 0.97]) {
        let previous = null;
        for (let angle = 0.08; angle <= 1.48; angle += 0.025) {
          const x = Math.max(0, Math.min(255, Math.round(128 + Math.cos(angle) * 119 * radiusScale)));
          const y = Math.max(0, Math.min(255, Math.round(128 + Math.sin(angle) * 125 * radiusScale)));
          const index = (y * 256 + x) * 4;
          const current = [pixels[index], pixels[index + 1], pixels[index + 2]];
          if (previous) rimMaxDelta = Math.max(rimMaxDelta, Math.hypot(current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]));
          previous = current;
        }
      }
    } finally {
      URL.revokeObjectURL(continuityUrl);
    }
    return {
      title: document.title,
      loadingTitle: document.getElementById("app-loading-title")?.textContent?.trim() || "",
      themeColor: document.querySelector('meta[name="theme-color"]')?.content,
      resources,
      manifest,
      iconPixels,
      rimMaxDelta
    };

    async function sha256(bytes) {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    }
  });

  assert.equal(metadata.themeColor, "#18231f");
  assert.equal(metadata.title, "莫苏子的幻想地图生成器");
  assert.equal(metadata.loadingTitle, "幻想地图生成器");
  assert.equal(metadata.resources.length, 5, "图标与 manifest 入口数量错误");
  assert(metadata.resources.every(resource => resource.status === 200), "存在无法加载的图标资源");
  assert(metadata.resources.every(resource => new URL(resource.href).searchParams.get("v") === "265"), "实际图标入口缺少第 265 项版本键");
  assert(metadata.resources.find(resource => new URL(resource.href).pathname.endsWith("app-icon.svg"))?.contentType.includes("image/svg+xml"), "SVG favicon 内容类型错误");
  assert(metadata.resources.find(resource => new URL(resource.href).pathname.endsWith("app-icon-64.png"))?.contentType.includes("image/png"), "64px favicon 内容类型错误");
  assert(metadata.resources.find(resource => new URL(resource.href).pathname.endsWith("site.webmanifest"))?.contentType.includes("manifest+json"), "manifest 内容类型错误");
  for (const resource of [...warmedResources, ...metadata.resources]) {
    const filename = new URL(resource.href).pathname.split("/").at(-1);
    assert.equal(resource.hash, expectedResourceHashes[filename], `${filename} 的缓存响应字节不是当前资源`);
  }
  assert.equal(metadata.manifest.name, "WebGL 幻想地图生成器");
  assert(metadata.manifest.icons.every(icon => new URL(icon.src, baseUrl).searchParams.get("v") === "265"), "manifest 图标缺少第 265 项版本键");
  assert(metadata.manifest.icons.some(icon => new URL(icon.src, baseUrl).pathname.endsWith("app-icon-256.png") && icon.sizes === "256x256"), "manifest 缺少 256px 图标");
  assert.equal(metadata.iconPixels.length, 3, "必须检查实际 SVG、32px 与 64px favicon");
  for (const profile of metadata.iconPixels) {
    assert.deepEqual(profile.corners, [0, 0, 0, 0], `${profile.href} 四角必须透明`);
    assert(profile.centerAlpha > 250, `${profile.href} 圆形地图中心必须不透明`);
    assert(profile.opaque > 2_400, `${profile.href} 圆形地图有效覆盖不足`);
    assert(profile.transparent > 500, `${profile.href} 仍像完整方形资源`);
    assert.equal(profile.sealRed, 0, `${profile.href} 仍残留朱印红块`);
  }
  assert(metadata.rimMaxDelta < 68, `圆盘右下圈层存在突兀色阶：${metadata.rimMaxDelta}`);

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
