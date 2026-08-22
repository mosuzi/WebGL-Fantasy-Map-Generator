import assert from "node:assert/strict";

import {
  createHeightPanel,
  HEIGHT_TERRAIN_PROGRAM_STORAGE_ERROR_CODE,
  HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE
} from "../app/webgl-generator/src/ui/panels/height-panel.js";
import {HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY} from "../app/webgl-generator/src/runtime/height-terrain-template-programs.js";

const forbiddenOrdinaryCopy = /LocalStorage|IndexedDB|Worker|session|packet|buffer|revision|checksum/iu;

const missingStorage = createPanelHarness({storageMode: "missing"});
assert.equal(missingStorage.panel.addTerrainProgramStep(), true, "缺存储正例未能建立有效模板步骤");
const missingReceipt = missingStorage.panel.saveTerrainProgram("缺存储模板");
assert.equal(missingReceipt.ok, false, "缺存储保存不得成功");
assert.equal(missingReceipt.error, HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE, "缺存储保存未返回统一用户提示");
assert.equal(missingStorage.panel.getTerrainProgramNotice(), HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE, "正式面板 notice 未使用统一用户提示");
assert.equal(missingReceipt.diagnostic?.backend, "localStorage", "结构化诊断未保留存储后端");
assert.doesNotMatch(missingReceipt.error, forbiddenOrdinaryCopy, "缺存储普通提示泄漏技术后端");
missingStorage.panel.unmount();

const deniedStorage = createPanelHarness({storageMode: "denied"});
assert.match(deniedStorage.panel.getTerrainProgramNotice(), /^用户模板未恢复：/u, "存储访问被拒绝时未形成恢复提示");
assert.doesNotMatch(deniedStorage.panel.getTerrainProgramNotice(), forbiddenOrdinaryCopy, "初始化恢复提示泄漏技术后端");
assert.equal(deniedStorage.panel.addTerrainProgramStep(), true, "访问拒绝正例未能建立有效模板步骤");
const deniedReceipt = deniedStorage.panel.saveTerrainProgram("访问拒绝模板");
assert.equal(deniedReceipt.ok, false, "存储访问被拒绝时保存不得成功");
assert.equal(deniedReceipt.error, HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE, "访问拒绝保存未返回统一用户提示");
assert.equal(deniedReceipt.diagnostic?.backend, "localStorage", "访问拒绝结构化诊断未保留后端");
assert.equal(deniedReceipt.diagnostic?.causeName, "SecurityError", "访问拒绝结构化诊断未保留异常类型");
assert.match(deniedReceipt.diagnostic?.causeMessage || "", /LocalStorage access denied/u, "访问拒绝结构化诊断未保留原始异常");
assert.doesNotMatch(deniedStorage.panel.getTerrainProgramNotice(), forbiddenOrdinaryCopy, "访问拒绝普通 notice 泄漏技术后端");
deniedStorage.panel.unmount();

const quotaStorage = createFailOnceStorage();
const quota = createPanelHarness({storageMode: "available", storage: quotaStorage});
assert.equal(quota.panel.addTerrainProgramStep(), true, "quota 正例未能建立有效模板步骤");
const failedQuotaReceipt = quota.panel.saveTerrainProgram("retry-template");
assert.equal(failedQuotaReceipt.ok, false, "首次 quota 写失败不得返回成功");
assert.equal(failedQuotaReceipt.error, HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE, "quota 写失败未返回安全用户提示");
assert.equal(failedQuotaReceipt.diagnostic?.backend, "localStorage", "quota 失败未保留结构化 backend");
assert.equal(failedQuotaReceipt.diagnostic?.causeName, "QuotaExceededError", "quota 失败未保留异常类型");
assert.match(failedQuotaReceipt.diagnostic?.causeMessage || "", /quota write failed/u, "quota 失败未保留原始原因");
const retryReceipt = quota.panel.saveTerrainProgram("retry-template");
assert.equal(retryReceipt.ok, true, "quota 解除后同名重试未成功");
assert.equal(retryReceipt.template.id, "user-retry-template", "失败保存污染内存集合并导致同名重试产生后缀");
const persistedAfterRetry = JSON.parse(quotaStorage.getItem(HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY));
assert.equal(persistedAfterRetry.templates.length, 1, "同名重试把失败 ghost 模板一并持久化");
assert.equal(persistedAfterRetry.templates[0].id, "user-retry-template", "同名重试持久化身份漂移");
quota.panel.unmount();

assert.equal(HEIGHT_TERRAIN_PROGRAM_STORAGE_ERROR_CODE, "height_terrain_program_storage_unavailable");

console.log(JSON.stringify({
  ok: true,
  paths: ["missing-storage", "storage-access-denied", "quota-failure-retry"],
  ordinaryMessage: HEIGHT_TERRAIN_PROGRAM_STORAGE_USER_MESSAGE,
  structuredBackend: deniedReceipt.diagnostic.backend,
  browserExecuted: 0
}, null, 2));

function createPanelHarness({storageMode, storage = null}) {
  const view = {
    setTimeout,
    clearTimeout,
    console: {warn() {}, error() {}}
  };
  if (storageMode === "denied") {
    Object.defineProperty(view, "localStorage", {
      configurable: true,
      get() {
        const error = new Error("LocalStorage access denied");
        error.name = "SecurityError";
        throw error;
      }
    });
  } else if (storageMode === "available") {
    view.localStorage = storage;
  }
  const documentRef = {
    defaultView: view,
    createElement() {
      return createFakeElement();
    }
  };
  const manager = {
    registerPanel(id) {
      assert.equal(id, "height-panel");
      return {body: createFakeElement()};
    },
    open() {
      throw new Error("Node copy regression must not load the Vue component");
    }
  };
  return {panel: createHeightPanel(documentRef, manager)};
}

function createFailOnceStorage() {
  const values = new Map();
  let failNextWrite = true;
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (failNextWrite) {
        failNextWrite = false;
        const error = new Error("quota write failed");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createFakeElement() {
  return {
    className: "",
    dataset: {},
    textContent: "",
    replaceChildren() {},
    append() {}
  };
}
