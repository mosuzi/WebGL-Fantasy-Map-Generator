#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  DEFAULT_LAZY_PANEL_LOADING_DELAY_MS,
  LAZY_PANEL_ERROR_KIND,
  classifyLazyVuePanelError,
  createLazyVuePanel,
  getLazyVuePanelPreloadStats,
  scheduleLazyVuePanelPreload
} from "../app/webgl-generator/src/ui/panels/lazy-vue-panel.js";

const rootDir = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, rootDir), "utf8");

const [appSource, zoneController, cloudController, cloudComponent] = await Promise.all([
  read("app/webgl-generator/src/runtime/app.js"),
  read("app/webgl-generator/src/ui/panels/zone-panel.js"),
  read("app/webgl-generator/src/ui/panels/cloud-storage-panel.js"),
  read("app/webgl-generator/src/ui/vue/components/CloudStoragePanel.vue")
]);

assert.match(appSource, /import CloudStoragePanelComponent from "\.\.\/ui\/vue\/components\/CloudStoragePanel\.vue"/);
assert.match(appSource, /import ZonePanelComponent from "\.\.\/ui\/vue\/components\/ZonePanel\.vue"/);
assert.doesNotMatch(zoneController, /import\(["']\.\.\/vue\/components\/ZonePanel\.vue["']\)/, "地区面板仍会首次打开时请求独立 chunk");
assert.doesNotMatch(cloudController, /import\(["']\.\.\/vue\/components\/CloudStoragePanel\.vue["']\)/, "云端面板仍会首次打开时请求独立 chunk");
assert.match(cloudComponent, /import UiButton from "\.\/base\/UiButton\.vue"/, "云端面板没有显式注册 UiButton");

const longError = new Error(`普通组件异常 ${"x".repeat(400)}`);
const bounded = classifyLazyVuePanelError(longError);
assert.equal(bounded.kind, LAZY_PANEL_ERROR_KIND.COMPONENT);
assert.equal(bounded.message.length, 240, "共享错误消息没有限制长度");
assert.equal(DEFAULT_LAZY_PANEL_LOADING_DELAY_MS, 180, "面板防闪延迟漂移");

async function verifyDelayedLoading() {
  const fast = createDocumentFixture();
  const fastPanel = createLazyVuePanel(
    fast.documentRef,
    fast.root,
    () => ({name: "FastPanel"}),
    {},
    {id: "fast-loading", initial: "首次打开时载入", loading: "正在打开测试面板，请稍候片刻。"},
    {loadingDelayMs: 20, createApp: createMountFixture()}
  );
  await fastPanel.load();
  await wait(28);
  assert.notEqual(fast.root.textContent, "正在打开测试面板，请稍候片刻。", "快速面板闪出等待文案");
  fastPanel.unmount();

  const slow = createDocumentFixture();
  let resolveComponent;
  const componentPromise = new Promise(resolve => { resolveComponent = resolve; });
  const slowPanel = createLazyVuePanel(
    slow.documentRef,
    slow.root,
    () => componentPromise,
    {},
    {id: "slow-loading", initial: "首次打开时载入", loading: "正在打开测试面板，请稍候片刻。"},
    {loadingDelayMs: 20, createApp: createMountFixture()}
  );
  const loading = slowPanel.load();
  assert.equal(slow.root.textContent, "", "打开慢面板时仍显示首次加载占位");
  await wait(28);
  assert.equal(slow.root.textContent, "正在打开测试面板，请稍候片刻。", "慢面板没有在延迟后显示等待文案");
  resolveComponent({name: "SlowPanel"});
  await loading;
  assert.notEqual(slow.root.textContent, "正在打开测试面板，请稍候片刻。", "面板挂载后等待文案未清理");
  slowPanel.unmount();
}

async function verifyOnDemandPreload() {
  const fixture = createDocumentFixture();
  let preloadCalls = 0;
  const panel = createLazyVuePanel(
    fixture.documentRef,
    fixture.root,
    () => {
      preloadCalls += 1;
      return {name: "OnDemandPanel"};
    },
    {},
    {id: "on-demand-preload"},
    {createApp: createMountFixture()}
  );
  const state = scheduleLazyVuePanelPreload(fixture.documentRef, {reason: "map-ready", execute: false});
  assert.equal(state.mode, "on-demand");
  assert.equal(state.pending, 0);
  assert.ok(state.finishedAt, "按需模式没有立即结束后台预热队列");
  assert.equal(preloadCalls, 0, "map-ready 后仍执行了动态模块后台预热");
  assert.equal(state.getStats().items.find(item => item.id === "on-demand-preload")?.status, "on-demand");
  await panel.load();
  assert.equal(preloadCalls, 1, "首次正式打开没有加载按需面板");
  panel.unmount();
}

async function verifyModuleFetchRecovery() {
  const fixture = createDocumentFixture();
  let attempts = 0;
  const panel = createLazyVuePanel(
    fixture.documentRef,
    fixture.root,
    () => {
      attempts += 1;
      throw new TypeError("Failed to fetch dynamically imported module: /assets/old-panel.js");
    },
    {},
    {id: "module-fetch-fixture", failure: "测试面板加载失败，请检查开发模式日志。"}
  );
  await panel.load();
  const recovery = fixture.root.children[0];
  assert.equal(recovery.dataset.errorKind, LAZY_PANEL_ERROR_KIND.MODULE_FETCH);
  assert.match(flatText(recovery), /页面版本可能已经更新/);
  assert.match(flatText(recovery), /先保存尚未保存的地图/);
  assert.deepEqual(buttonLabels(recovery), ["刷新页面"]);
  assert.equal(fixture.reloads(), 0, "模块加载失败后发生了自动刷新");
  findButton(fixture.root.children[0], "刷新页面").click();
  assert.equal(fixture.reloads(), 1, "显式刷新按钮没有刷新页面");
  assert.equal(attempts, 1, "模块资源失败后仍执行了无效重试");

  const stats = getLazyVuePanelPreloadStats().find(entry => entry.id === "module-fetch-fixture");
  assert.equal(stats.errorKind, LAZY_PANEL_ERROR_KIND.MODULE_FETCH);
  assert.ok(stats.error.length <= 240);
  panel.unmount();
}

async function verifyComponentFailure() {
  const fixture = createDocumentFixture();
  const panel = createLazyVuePanel(
    fixture.documentRef,
    fixture.root,
    () => {
      throw new Error("组件初始化失败");
    },
    {},
    {id: "component-fixture", failure: "普通组件加载失败，请检查开发模式日志。"}
  );
  await panel.load();
  const recovery = fixture.root.children[0];
  assert.equal(recovery.dataset.errorKind, LAZY_PANEL_ERROR_KIND.COMPONENT);
  assert.doesNotMatch(flatText(recovery), /页面版本可能已经更新/);
  assert.deepEqual(buttonLabels(recovery), ["重试加载"]);
  assert.equal(fixture.reloads(), 0);
  panel.unmount();
}

async function verifyMountFailureRetry() {
  const fixture = createDocumentFixture();
  let createCount = 0;
  let mountCount = 0;
  let setupCount = 0;
  let unmountCount = 0;
  const component = {
    setup() {
      setupCount += 1;
      if (setupCount === 1) throw new Error("首次 setup/render 失败");
      return {ready: true};
    }
  };
  const createAppFixture = receivedComponent => {
    createCount += 1;
    assert.equal(receivedComponent, component);
    let mounted = false;
    return {
      use() {
        return this;
      },
      mount(root) {
        mountCount += 1;
        receivedComponent.setup();
        mounted = true;
        root.dataset.mounted = "true";
      },
      unmount() {
        unmountCount += 1;
        if (!mounted && unmountCount === 1) throw new Error("半初始化 app 清理失败");
        mounted = false;
      }
    };
  };
  const panel = createLazyVuePanel(
    fixture.documentRef,
    fixture.root,
    () => component,
    {},
    {id: "mount-retry-fixture", failure: "组件挂载失败，请检查开发模式日志。"},
    {createApp: createAppFixture}
  );

  await panel.load();
  assert.equal(mountCount, 1, "首次组件挂载没有执行");
  assert.equal(unmountCount, 1, "首次挂载失败没有清理半初始化 app");
  const recovery = fixture.root.children[0];
  assert.equal(recovery.dataset.errorKind, LAZY_PANEL_ERROR_KIND.COMPONENT);
  assert.deepEqual(buttonLabels(recovery), ["重试加载"]);
  findButton(recovery, "重试加载").click();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(createCount, 2, "重试没有重新 createApp");
  assert.equal(mountCount, 2, "重试没有执行第二次 mount");
  assert.equal(setupCount, 2, "重试没有重新执行组件 setup/render");
  assert.equal(fixture.root.dataset.mounted, "true", "第二次挂载没有成功");
  assert.equal(fixture.reloads(), 0, "普通组件挂载失败或重试触发了页面刷新");
  const stats = getLazyVuePanelPreloadStats().find(entry => entry.id === "mount-retry-fixture");
  assert.equal(stats.mounted, true, "重试成功后仍被记录为未挂载");
  assert.equal(stats.errorKind, "", "重试成功后仍保留旧错误类型");
  panel.unmount();
  assert.equal(unmountCount, 2, "成功挂载的 app 没有在面板销毁时清理");
}

function createDocumentFixture() {
  let reloadCount = 0;
  const documentRef = {
    defaultView: {
      console: {error() {}, warn() {}},
      location: {reload: () => { reloadCount += 1; }}
    },
    createElement: tagName => new FakeElement(tagName)
  };
  return {documentRef, root: new FakeElement("div"), reloads: () => reloadCount};
}

function createMountFixture() {
  return () => ({
    use() { return this; },
    mount(root) { root.dataset.mounted = "true"; },
    unmount() {}
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.textContent = "";
    this.className = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get("click")?.({target: this});
  }
}

function flatText(node) {
  return [node.textContent, ...node.children.map(flatText)].filter(Boolean).join(" ");
}

function buttons(node) {
  return [node, ...node.children.flatMap(buttons)].filter(item => item.tagName === "button");
}

function buttonLabels(node) {
  return buttons(node).map(button => button.textContent);
}

function findButton(node, label) {
  return buttons(node).find(button => button.textContent === label);
}

await verifyModuleFetchRecovery();
await verifyComponentFailure();
await verifyMountFailureRetry();
await verifyDelayedLoading();
await verifyOnDemandPreload();

console.log(JSON.stringify({
  ok: true,
  bundledWithEntry: ["ZonePanel", "CloudStoragePanel"],
  recovery: {moduleFetch: true, component: true, mountRetry: true, delayedLoading: true, onDemandPreload: true, mountCount: 2, automaticReload: false, boundedMessage: 240}
}, null, 2));
