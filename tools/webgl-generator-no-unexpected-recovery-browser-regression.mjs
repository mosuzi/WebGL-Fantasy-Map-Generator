#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const {chromium} = createRequire(resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: "vite.config.mjs", preview: {host: "127.0.0.1", port: 5599, strictPort: true}});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => message.type() === "error" && errors.push(message.text()));

try {
  await page.route("**/__legacy_recovery_seed__", route => route.fulfill({status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>"}));
  await page.goto("http://127.0.0.1:5599/__legacy_recovery_seed__");
  await page.evaluate(async () => {
    localStorage.setItem("webgl-generator-auto-recovery", "true");
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("webgl-generator-recovery-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("points", {keyPath: "id"});
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("points", "readwrite");
        transaction.objectStore("points").put({id: "legacy-point", type: "map-recovery-v1", bytes: 6, blob: new Blob(["legacy"])});
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.unroute("**/__legacy_recovery_seed__");
  await page.addInitScript(() => {
    window.__legacyRecoveryOpens = 0;
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...options) {
      if (name === "webgl-generator-recovery-v1") window.__legacyRecoveryOpens++;
      return open.call(this, name, ...options);
    };
  });

  await page.goto("http://127.0.0.1:5599/?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180000);
  assert.equal(await page.getByText("意外恢复", {exact: true}).count(), 0);
  assert.equal(await page.locator(".map-recovery-controls").count(), 0);
  assert.equal(await page.evaluate(() => Object.hasOwn(window.__webglGeneratorApp, "recovery")), false);
  await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const generated = await api.generate.newMap({confirm: true, seed: "no-unexpected-recovery", cellsTarget: 3000});
    if (!generated.ok) throw Error(generated.error?.message || "生成失败");
    const saved = await api.data.saveBrowserMap();
    if (!saved.ok) throw Error(saved.error?.message || "保存失败");
    const city = window.__webglGeneratorApp.map.settlements.cities.find(item => item && !item.removed);
    const renamed = await api.edit.cities.rename(city.id, `${city.name}改`);
    if (!renamed.ok) throw Error(renamed.error?.message || "修改失败");
    const restored = await api.data.restoreBrowserMap({confirm: true});
    if (!restored.ok) throw Error(restored.error?.message || "读取失败");
  });
  await page.waitForTimeout(31000);
  const result = await page.evaluate(async () => {
    const automaticOpens = window.__legacyRecoveryOpens;
    const records = await new Promise((resolve, reject) => {
      const request = indexedDB.open("webgl-generator-recovery-v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("points", "readonly");
        const query = transaction.objectStore("points").getAll();
        transaction.oncomplete = () => {db.close(); resolve(query.result);};
        transaction.onerror = () => reject(transaction.error);
      };
    });
    return {automaticOpens, records: records.map(record => ({id: record.id, bytes: record.bytes, blobSize: record.blob.size})),
      preference: localStorage.getItem("webgl-generator-auto-recovery"),
      saveDirty: window.__webglGeneratorApp.saveState.getStatus().dirty};
  });
  assert.equal(result.automaticOpens, 0);
  assert.deepEqual(result.records, [{id: "legacy-point", bytes: 6, blobSize: 6}]);
  assert.equal(result.preference, "true");
  assert.equal(result.saveDirty, false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ok: true, ...result, errors}, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
