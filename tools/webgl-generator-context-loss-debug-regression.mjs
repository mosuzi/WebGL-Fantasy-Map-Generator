#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {createRenderResourceBinding, sameRenderResourceBinding} from "../app/webgl-generator/src/renderer/render-resource-binding.js";
import {RENDER_CACHE_RESOURCE_FAMILIES, adoptRenderCacheResourceBinding} from "../app/webgl-generator/src/renderer/render-cache-resource-binding.js";
import {adoptObjectPickingResourceBinding, adoptOverlayLabelResourceBinding} from "../app/webgl-generator/src/renderer/retained-render-resource-binding.js";
import {createSurfaceResourceOwner} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rendererSource = readFileSync(resolve(root, "app/webgl-generator/src/renderer/placeholder-renderer.js"), "utf8");
assert.match(rendererSource, /this\.installWebGlContextLifecycleHandlers\(\);/, "renderer constructor 必须安装正式 context 生命周期 handler");
const vite = await createServer({
  configFile: resolve(root, "vite.config.mjs"),
  server: {middlewareMode: true},
  ssr: {noExternal: ["element-plus", /@element-plus/]},
  appType: "custom",
  logLevel: "silent"
});
let report = null;
try {
  const {createConsoleApi} = await vite.ssrLoadModule("/src/runtime/console-api.js");
  report = await run(createConsoleApi);
} finally {
  await vite.close();
}
console.log(JSON.stringify(report, null, 2));

async function run(createConsoleApi) {
const harness = createRendererHarness();
const api = createConsoleApi({defaultView: {}}, {map: harness.renderer.map, renderer: harness.renderer});
const capabilities = unwrap(api.info.capabilities());
const description = unwrap(api.info.describe("debug.simulateContextLoss"));
assert(capabilities.methods.debug.includes("simulateContextLoss"));
assert.equal(capabilities.methodMetadata.debug.simulateContextLoss.async, true);
assert.equal(capabilities.methodMetadata.debug.simulateContextLoss.stability, "experimental");
assert.equal(description.inputSchema.prefixItems[0].properties.restoreDelayMs.maximum, 5000);
assert.equal(description.resultSchema.properties.data.required.includes("beforeBinding"), true);
assert.equal(description.businessCodes.includes("render-cache-resource-owner-mismatch"), true);
assert.equal(description.businessCodes.includes("render-retained-resource-owner-mismatch"), true);

const map = harness.renderer.map;
const pending = api.debug.simulateContextLoss({restoreDelayMs: 0});
const busy = api.debug.simulateContextLoss({restoreDelayMs: 0});
assert.equal(busy.ok, false);
assert.equal(busy.error.code, "render-context-loss-busy");
const success = unwrap(await pending);
assert.equal(success.restored, true);
assert.equal(harness.renderer.map, map);
assert.deepEqual(Object.keys(success.beforeBinding), ["mapIdentity", "sourceRevision", "topologyRevision", "renderPreparationId", "renderGeneration"]);
assert.deepEqual(Object.keys(success.afterBinding), ["mapIdentity", "sourceRevision", "topologyRevision", "renderPreparationId", "renderGeneration"]);
assert.equal(success.afterBinding.mapIdentity, success.beforeBinding.mapIdentity);
assert.equal(success.afterBinding.sourceRevision, success.beforeBinding.sourceRevision);
assert.equal(success.afterBinding.topologyRevision, success.beforeBinding.topologyRevision);
assert.equal(success.afterBinding.renderGeneration, success.beforeBinding.renderGeneration + 1);
assert.equal(success.drawDelta, 1);
assert.equal(success.resourceState, "ready");
assert.equal(success.retainedState, "ready");
assert.equal(harness.restoreAttempts, 1);
assert.equal(harness.renderer.webGlContextLost, false);
assert.equal(harness.renderer.debugContextLossPromise, null);
assert.equal(harness.pendingWaitTimers, 0);
assertOwnersExact(harness.renderer, success.afterBinding);

for (const invalid of [{restoreDelayMs: -1}, {restoreDelayMs: 5001}, {restoreDelayMs: 1.5}, {restoreDelayMs: "50"}, {restoreDelayMs: 0, faultAt: "restore"}]) {
  const result = api.debug.simulateContextLoss(invalid);
  assert.equal(result.ok, false, `非法参数未拒绝：${JSON.stringify(invalid)}`);
  assert.equal(result.error.code, "invalid_argument");
}

const noExtension = createRendererHarness({extension: false});
const unsupported = await createConsoleApi({defaultView: {}}, {map: noExtension.renderer.map, renderer: noExtension.renderer}).debug.simulateContextLoss({restoreDelayMs: 0});
assert.equal(unsupported.ok, false);
assert.equal(unsupported.error.code, "render-context-loss-unsupported");

const mixed = createRendererHarness();
mixed.renderer.renderCacheResourceOwners = Object.freeze({
  ...mixed.renderer.renderCacheResourceOwners,
  line: createRenderResourceBinding(mixed.binding, {renderPreparationId: "mixed:line", renderGeneration: mixed.binding.renderGeneration})
});
const mixedResult = await createConsoleApi({defaultView: {}}, {map: mixed.renderer.map, renderer: mixed.renderer}).debug.simulateContextLoss({restoreDelayMs: 0});
assert.equal(mixedResult.ok, false);
assert.equal(mixedResult.error.code, "render-cache-resource-owner-mismatch");
assert.equal(mixed.loseCalls, 0, "混装 owner 被拒绝前不应触发 context loss");

const retainedMixed = createRendererHarness();
retainedMixed.renderer.objectPickingResourceOwner = createRenderResourceBinding(retainedMixed.binding, {
  renderPreparationId: "mixed:picking",
  renderGeneration: retainedMixed.binding.renderGeneration
});
const retainedMixedResult = await createConsoleApi({defaultView: {}}, {map: retainedMixed.renderer.map, renderer: retainedMixed.renderer}).debug.simulateContextLoss({restoreDelayMs: 0});
assert.equal(retainedMixedResult.ok, false);
assert.equal(retainedMixedResult.error.code, "render-retained-resource-owner-mismatch");
assert.equal(retainedMixed.loseCalls, 0, "retained 混装 owner 被拒绝前不应触发 context loss");

for (const faultAt of ["lose", "restore"]) {
  const fault = createRendererHarness({faultAt});
  const unhandled = [];
  const captureUnhandled = reason => unhandled.push(reason);
  process.on("unhandledRejection", captureUnhandled);
  try {
    const result = await createConsoleApi({defaultView: {}}, {map: fault.renderer.map, renderer: fault.renderer}).debug.simulateContextLoss({restoreDelayMs: 0});
    assert.equal(result.ok, false, `${faultAt} 同步故障必须拒绝`);
    assert.equal(result.error.code, "render-context-loss-receipt-invalid");
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", captureUnhandled);
  }
  assert.equal(fault.renderer.debugContextLossPromise, null, `${faultAt} 同步故障必须清空 debug promise`);
  assert.equal(fault.pendingWaitTimers, 0, `${faultAt} 同步故障必须取消事件 timeout`);
  assert.deepEqual(unhandled, [], `${faultAt} 同步故障不得留下迟到 rejection`);
}

return {
  ok: true,
  method: "debug.simulateContextLoss",
  restoreAttempts: harness.restoreAttempts,
  beforeGeneration: success.beforeBinding.renderGeneration,
  afterGeneration: success.afterBinding.renderGeneration,
  drawDelta: success.drawDelta,
  ownerFamilies: 10,
  invalidCases: 10,
  browser: 0
};
}

function createRendererHarness({extension = true, faultAt = null} = {}) {
  const canvas = new EventTarget();
  const pendingWaitTimers = new Set();
  const timerView = {
    setTimeout(callback, delay) {
      let handle;
      handle = globalThis.setTimeout(() => {
        pendingWaitTimers.delete(handle);
        callback();
      }, delay);
      pendingWaitTimers.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      pendingWaitTimers.delete(handle);
      globalThis.clearTimeout(handle);
    }
  };
  canvas.ownerDocument = {defaultView: timerView};
  let contextLost = false;
  let loseCalls = 0;
  let restoreAttempts = 0;
  const binding = createRenderResourceBinding({mapIdentity: "context-debug-map", sourceRevision: 4, topologyRevision: 2}, {
    renderPreparationId: "context-debug:4:2:7",
    renderGeneration: 7
  });
  const renderer = {
    canvas,
    map: {metadata: {mapIdentity: binding.mapIdentity}},
    gl: {
      getExtension(name) {
        if (!extension || name !== "WEBGL_lose_context") return null;
        return {
          loseContext() {
            loseCalls++;
            if (faultAt === "lose") throw new Error("fixture loseContext fault");
            contextLost = true;
            queueMicrotask(() => canvas.dispatchEvent(new Event("webglcontextlost", {cancelable: true})));
          },
          restoreContext() {
            if (faultAt === "restore") throw new Error("fixture restoreContext fault");
            contextLost = false;
            queueMicrotask(() => canvas.dispatchEvent(new Event("webglcontextrestored")));
          }
        };
      },
      isContextLost: () => contextLost
    },
    webGlContextLost: false,
    webGlContextResourceState: "ready",
    webGlContextRestorePromise: null,
    debugContextLossPromise: null,
    webGlContextLifecycleInstalled: false,
    lastWebGlContextRestoreError: null,
    retainedResourceState: "ready",
    lastDraw: {sequence: 12},
    surfaceVertices: new Float32Array(),
    surfaceCellRanges: new Map(),
    cellVisualCorrectionGeometry: new Float32Array(),
    cellAttributeStore: {},
    objectPickingIndex: {bucketCount: 1},
    overlay: null,
    labelItems: [],
    cityIconItems: [],
    cityIconItemsById: new Map(),
    markerIconItems: [],
    militaryIconItems: [],
    cityIconLayer: null,
    lineBuffer: {},
    shoreLineBuffer: {},
    oceanCurrentBuffer: {},
    lineVertices: new Float32Array(),
    shoreLineVertices: new Float32Array(),
    oceanCurrentVertices: new Float32Array(),
    pointBuffer: {},
    pointDrawRanges: [],
    routeBuffer: {},
    routeDrawRanges: [],
    routeBufferCamera: {},
    riverBuffer: {},
    riverBufferCamera: {},
    tradeFlowBuffer: {},
    tradeFlowPickItems: [],
    selectionBuffer: {},
    selectionDrawRanges: []
  };
  renderer.simulateContextLoss = options => PlaceholderMapRenderer.prototype.simulateContextLoss.call(renderer, options);
  renderer.runContextLossSimulation = options => PlaceholderMapRenderer.prototype.runContextLossSimulation.call(renderer, options);
  renderer.handleWebGlContextLost = event => PlaceholderMapRenderer.prototype.handleWebGlContextLost.call(renderer, event);
  renderer.handleWebGlContextRestored = () => PlaceholderMapRenderer.prototype.handleWebGlContextRestored.call(renderer);
  renderer.installWebGlContextLifecycleHandlers = () => PlaceholderMapRenderer.prototype.installWebGlContextLifecycleHandlers.call(renderer);
  renderer.restoreWebGlContextUntilCurrent = async () => {
    restoreAttempts++;
    await Promise.resolve();
    const restoredBinding = createRenderResourceBinding(binding, {
      renderPreparationId: `context-debug:restore:${restoreAttempts}`,
      renderGeneration: binding.renderGeneration + restoreAttempts
    });
    installOwners(renderer, restoredBinding);
    renderer.webGlContextLost = false;
    renderer.webGlContextResourceState = "ready";
    renderer.lastDraw = {sequence: renderer.lastDraw.sequence + 1};
    return true;
  };
  installOwners(renderer, binding);
  renderer.installWebGlContextLifecycleHandlers();
  return {
    renderer,
    binding,
    get loseCalls() { return loseCalls; },
    get restoreAttempts() { return restoreAttempts; },
    get pendingWaitTimers() { return pendingWaitTimers.size; }
  };
}

function installOwners(renderer, binding) {
  const owner = createSurfaceResourceOwner(binding, {
    surfaceFloatLength: renderer.surfaceVertices.length,
    correctionWordLength: renderer.cellVisualCorrectionGeometry.length,
    surfaceCellRanges: renderer.surfaceCellRanges
  });
  renderer.surfaceResourceOwner = owner;
  renderer.surfaceVerticesOwner = owner;
  renderer.surfaceCellRangesOwner = owner;
  renderer.cellVisualCorrectionGeometryOwner = owner;
  renderer.cellAttributeStoreOwner = owner;
  renderer.surfaceBaseBufferSet = {owner};
  renderer.cellVisualCorrectionBufferSet = {owner};
  renderer.surfaceResourceBinding = {
    owner,
    surfaceVertices: renderer.surfaceVertices,
    surfaceCellRanges: renderer.surfaceCellRanges,
    cellVisualCorrectionGeometry: renderer.cellVisualCorrectionGeometry,
    cellAttributeStore: renderer.cellAttributeStore
  };
  renderer.renderCacheResourceOwners = Object.freeze({});
  renderer.renderCacheResourceBindings = Object.freeze({});
  for (const family of RENDER_CACHE_RESOURCE_FAMILIES) adoptRenderCacheResourceBinding(renderer, family, binding);
  adoptObjectPickingResourceBinding(renderer, binding);
  adoptOverlayLabelResourceBinding(renderer, binding);
  renderer.retainedResourceState = "ready";
}

function assertOwnersExact(renderer, binding) {
  const owners = [
    renderer.surfaceResourceOwner,
    ...RENDER_CACHE_RESOURCE_FAMILIES.map(family => renderer.renderCacheResourceOwners[family]),
    renderer.objectPickingResourceOwner,
    renderer.labelLayoutResourceOwner,
    renderer.overlayResourceOwner
  ];
  assert.equal(owners.length, 10);
  assert.equal(owners.every(owner => sameRenderResourceBinding(owner, binding)), true);
}

function unwrap(result) {
  assert.equal(result?.ok, true, `${result?.error?.code || "api_error"}: ${result?.error?.message || ""}`);
  return result.data;
}
