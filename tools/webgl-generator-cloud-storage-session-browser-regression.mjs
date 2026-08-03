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
const origin = new URL(baseUrl).origin;
const dropboxConfig = {appKey: "fixture-dropbox-app", redirectUri: `${origin}/oauth/dropbox/callback`};
const googleConfig = {clientId: "fixture-google-client-id", folderPath: "/webFMG"};
const dropboxScopes = ["files.metadata.read", "files.content.read", "files.content.write"];
const googleScope = "https://www.googleapis.com/auth/drive.file";
const sessionKeys = {
  dropbox: "fmg-cloud-session:v1:dropbox",
  google: "fmg-cloud-session:v1:google-drive"
};

let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 820}});
  await context.addInitScript(({origin, dropboxConfig, googleConfig, dropboxScopes, googleScope, sessionKeys}) => {
    const seedKey = "fmg-cloud-session-browser-seeded";
    if (sessionStorage.getItem(seedKey)) return;
    const expiresAt = Date.now() + 60 * 60 * 1000;
    sessionStorage.setItem(sessionKeys.dropbox, JSON.stringify({
      version: 1,
      provider: "dropbox",
      fingerprint: JSON.stringify([1, "dropbox", origin, dropboxConfig.appKey, dropboxConfig.redirectUri, ...dropboxScopes]),
      accessToken: "fixture-dropbox-session-token",
      expiresAt
    }));
    sessionStorage.setItem(sessionKeys.google, JSON.stringify({
      version: 1,
      provider: "google-drive",
      fingerprint: JSON.stringify([1, "google-drive", origin, googleConfig.clientId, googleConfig.folderPath, googleScope]),
      accessToken: "fixture-google-session-token",
      expiresAt
    }));
    sessionStorage.setItem(seedKey, "1");
  }, {origin, dropboxConfig, googleConfig, dropboxScopes, googleScope, sessionKeys});
  await context.route("**/cloud-provider-config.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: `globalThis.__FMG_CLOUD_PROVIDER_CONFIG__=${JSON.stringify({version: 1, providers: {dropbox: dropboxConfig, googleDrive: googleConfig}})};`
  }));
  await context.route("https://api.dropboxapi.com/**", route => {
    const url = route.request().url();
    if (url.endsWith("/files/list_folder")) return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({entries: [], has_more: false})});
    if (url.endsWith("/auth/token/revoke")) return route.fulfill({status: 200, body: ""});
    return route.fulfill({status: 500, contentType: "application/json", body: JSON.stringify({error_summary: "unexpected fixture request"})});
  });
  await context.route("https://www.googleapis.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({files: []})
  }));

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?healthClear=1&cloudSessionBrowser=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openCloudStoragePanel(page);
  await assertProviderConnected(page, "Dropbox");
  await assertProviderConnected(page, "Google Drive");
  const beforeReload = await readSessionState(page);
  assert.deepEqual(beforeReload, {dropbox: true, google: true});

  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openCloudStoragePanel(page);
  await assertProviderConnected(page, "Dropbox");
  await assertProviderConnected(page, "Google Drive");

  await selectProvider(page, "Dropbox");
  await page.getByRole("button", {name: "断开连接", exact: true}).click();
  await page.locator('.cloud-storage-connection[data-cloud-state="disconnected"]').waitFor();
  assert.deepEqual(await readSessionState(page), {dropbox: false, google: true});

  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openCloudStoragePanel(page);
  await selectProvider(page, "Dropbox");
  await page.locator('.cloud-storage-connection[data-cloud-state="disconnected"]').waitFor();
  await assertProviderConnected(page, "Google Drive");
  await page.getByRole("button", {name: "断开连接", exact: true}).click();
  await page.locator('.cloud-storage-connection[data-cloud-state="disconnected"]').waitFor();
  assert.deepEqual(await readSessionState(page), {dropbox: false, google: false});

  await page.reload({waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await openCloudStoragePanel(page);
  await selectProvider(page, "Dropbox");
  await page.locator('.cloud-storage-connection[data-cloud-state="disconnected"]').waitFor();
  await selectProvider(page, "Google Drive");
  await page.locator('.cloud-storage-connection[data-cloud-state="disconnected"]').waitFor();

  const healthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.severity === "error"));
  assert.deepEqual(healthErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError ?? null), 0);

  console.log(JSON.stringify({ok: true, baseUrl, refreshRestored: ["dropbox", "google-drive"], disconnectPersisted: true}, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
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

async function selectProvider(page, label) {
  const tab = page.getByRole("tab", {name: label, exact: true});
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
}

async function assertProviderConnected(page, label) {
  await selectProvider(page, label);
  await page.locator('.cloud-storage-connection[data-cloud-state="connected"]').waitFor();
  await page.getByText("已连接；短期令牌保留在当前标签页", {exact: true}).waitFor();
}

function readSessionState(page) {
  return page.evaluate(keys => ({
    dropbox: Boolean(sessionStorage.getItem(keys.dropbox)),
    google: Boolean(sessionStorage.getItem(keys.google))
  }), sessionKeys);
}
