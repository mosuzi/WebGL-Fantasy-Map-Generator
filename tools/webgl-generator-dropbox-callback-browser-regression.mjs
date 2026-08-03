#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const baseUrl = (process.env.FMG_BASE_URL || "http://localhost:5410").replace(/\/$/, "");
const callbackUrl = `${baseUrl}/oauth/dropbox/callback`;

const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
try {
  const context = await browser.newContext({viewport: {width: 720, height: 560}});
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  const response = await page.goto(callbackUrl, {waitUntil: "domcontentloaded"});
  assert.equal(response?.status(), 200);
  assert.match(response?.headers()["content-type"] || "", /text\/html/);
  assert.match(await page.locator("#status").textContent(), /没有收到 Dropbox 授权结果/);
  assert.equal(await page.locator("#map-canvas").count(), 0, "独立回调页不得挂载地图 canvas");
  assert.equal(await page.locator('script[src], link[rel="modulepreload"], link[rel="stylesheet"]').count(), 0, "独立回调页不得加载主应用资源");

  await page.evaluate(() => {
    window.__dropboxCallbackMessage = null;
    window.addEventListener("message", event => {
      if (event.origin === location.origin) window.__dropboxCallbackMessage = event.data;
    });
  });
  const popupPromise = page.waitForEvent("popup");
  await page.evaluate(url => window.open(`${url}?code=fixture-code&state=fixture-state`, "dropbox-callback-fixture", "popup,width=520,height=420"), callbackUrl);
  const popup = await popupPromise;
  await page.waitForFunction(() => window.__dropboxCallbackMessage !== null);
  assert.deepEqual(await page.evaluate(() => window.__dropboxCallbackMessage), {
    type: "fmg-cloud-oauth-callback",
    provider: "dropbox",
    code: "fixture-code",
    state: "fixture-state",
    error: ""
  });
  if (!popup.isClosed()) await popup.waitForEvent("close");
  assert.equal(popup.isClosed(), true);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({ok: true, baseUrl, route: "/oauth/dropbox/callback", popupClosed: true, mainAppLoaded: false}, null, 2));
  await context.close();
} finally {
  await browser.close();
}
