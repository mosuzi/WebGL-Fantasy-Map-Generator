#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const baseUrl = process.env.FMG_BASE_URL || "http://127.0.0.1:5411";
const base = new URL(baseUrl);
const localDevelopmentBase = base.hostname === "localhost" && (base.port || "80") === "5410";
const fixtureConfig = `globalThis.__FMG_CLOUD_PROVIDER_CONFIG__ = {
  version: 1,
  providers: {
    dropbox: {appKey: "fixture-runtime-dropbox", redirectUri: "${baseUrl}/"},
    googleDrive: {clientId: "fixture-runtime-google.apps.googleusercontent.com", folderPath: "/fixture/webFMG"}
  }
};`;
const emptyConfig = `globalThis.__FMG_CLOUD_PROVIDER_CONFIG__ = {
  version: 1,
  providers: {
    dropbox: {appKey: "", redirectUri: ""},
    googleDrive: {clientId: "", folderPath: "/webFMG"}
  }
};`;

const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
try {
  const official = await verifyState({browser, mode: "official"});
  const unconfigured = await verifyState({browser, mode: "empty"});
  const overridden = await verifyState({browser, mode: "override"});
  console.log(JSON.stringify({ok: true, baseUrl, states: {official, unconfigured, overridden}, realOAuthStarted: false}, null, 2));
} finally {
  await browser.close();
}

async function verifyState({browser, mode}) {
  const context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  if (mode !== "official") {
    await context.route("**/cloud-provider-config.js", route => route.fulfill({
      status: 200,
      contentType: "application/javascript; charset=utf-8",
      headers: {"Cache-Control": "no-store"},
      body: mode === "override" ? fixtureConfig : emptyConfig
    }));
  }
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/?healthClear=1&cloudProviderConfig=${mode}`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openCloudStoragePanel(page);

  const panel = page.locator('.floating-panel[data-panel-id="cloud-storage-panel"]');
  if (mode === "official" && !localDevelopmentBase) {
    const configuration = panel.locator('[data-cloud-state="unconfigured"]');
    await configuration.waitFor();
    assert.match(await configuration.textContent(), /同源/);
    await panel.getByRole("tab", {name: "Google Drive", exact: true}).click();
    await panel.getByRole("button", {name: "连接 Google Drive", exact: true}).waitFor();
    await assertIdentifiersHidden(page, panel);
  } else if (mode === "official" || mode === "override") {
    await panel.getByRole("button", {name: "连接 Dropbox", exact: true}).waitFor();
    assert.equal(await panel.locator('[data-cloud-state="unconfigured"]').count(), 0);
    await panel.getByRole("tab", {name: "Google Drive", exact: true}).click();
    await panel.getByRole("button", {name: "连接 Google Drive", exact: true}).waitFor();
    await assertIdentifiersHidden(page, panel);
  } else {
    await panel.locator('[data-cloud-state="unconfigured"]').waitFor();
    assert.match(await panel.textContent(), /providers\.dropbox\.appKey/);
  }

  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error"));
  assert.deepEqual(healthErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0);
  await context.close();
  if (mode === "official") return localDevelopmentBase ? "official-local-development-ready" : "official-config-loaded-local-origin-guarded";
  return mode === "override" ? "private-override-ready" : "providers-disabled";
}

async function assertIdentifiersHidden(page, panel) {
  const [text, identifiers] = await Promise.all([
    panel.textContent(),
    page.evaluate(() => {
      const providers = window.__FMG_CLOUD_PROVIDER_CONFIG__?.providers || {};
      return [providers.dropbox?.appKey, providers.dropbox?.redirectUri, providers.googleDrive?.clientId].filter(Boolean);
    })
  ]);
  assert(identifiers.every(identifier => !text.includes(identifier)), "云存储面板不得显示 client identifier");
}

async function openCloudStoragePanel(page) {
  const heading = page.getByRole("heading", {name: "控制面板", exact: true});
  if (!await heading.isVisible().catch(() => false)) await page.getByRole("button", {name: "控制面板", exact: true}).click();
  await heading.waitFor();
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  await page.getByRole("button", {name: "保存", exact: true}).click();
  await page.getByRole("menuitem", {name: "云端存储…", exact: true}).click();
  await page.waitForSelector('.floating-panel[data-panel-id="cloud-storage-panel"]:not(.hidden) .cloud-storage-panel');
}
