#!/usr/bin/env node
import assert from "node:assert/strict";
import {installWebglGeneratorHealthMonitor} from "../app/webgl-generator/src/runtime/health-monitor.js";
import {createEditRefreshScheduler} from "../app/webgl-generator/src/runtime/edit-refresh-scheduler.js";
import {STATE_BRUSH_PREVIEW_EFFECTS, createApplyStateBrushCommand} from "../app/webgl-generator/src/runtime/state-edit-commands.js";

const listeners = new Map();
const observers = new Map();
class Observer {
  static supportedEntryTypes = ["longtask", "long-animation-frame", "event"];
  constructor(callback) { this.callback = callback; }
  observe(options) { observers.set(options.type, this); }
  disconnect() { this.disconnected = true; }
  emit(entries) { this.callback({getEntries: () => entries}); }
}
let time = 1000;
const stored = new Map();
const view = {
  performance: {now: () => time},
  PerformanceObserver: Observer,
  location: {href: "http://localhost/", search: ""},
  localStorage: {getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key)},
  console: {debug() {}, warn() {}, error() {}},
  setTimeout: () => 1,
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  dispatchEvent() {}
};
const documentRef = {
  defaultView: view,
  visibilityState: "visible",
  addEventListener: (name, handler) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
  removeEventListener() {},
  getElementById: () => null
};
const monitor = installWebglGeneratorHealthMonitor(documentRef);
const canvas = {id: "map-canvas", nodeType: 1, tagName: "CANVAS", getAttribute: () => null};
listeners.get("pointerdown")[0]({target: canvas, timeStamp: time});
observers.get("longtask").emit([{duration: 420, startTime: time + 1, name: "self"}]);
observers.get("long-animation-frame").emit([{duration: 240, blockingDuration: 180, startTime: time + 2, scripts: [{duration: 110}]}]);
observers.get("event").emit([{name: "pointerdown", target: canvas, duration: 256, startTime: time, processingStart: time + 30, processingEnd: time + 200}]);
const browserSamples = monitor.getCanvasSamples();
assert.deepEqual(browserSamples.map(item => item.phase), ["browser-long-task", "browser-long-frame", "browser-event"]);
assert.equal(browserSamples[2].inputDelayMs, 30);
assert.equal(browserSamples[2].processingMs, 170);
assert.equal(monitor.getEvents().some(item => item.type === "main-thread-long-task"), true);
assert.deepEqual(monitor.getCanvasMonitoringSupport(), {longTask: true, longAnimationFrame: true, eventTiming: true});
monitor.recordCanvasSample("state-brush-preview", {durationMs: 12, sampleMs: 2, renderMs: 9, cells: 3});
assert.equal(monitor.getCanvasSamples().at(-1).cells, 3);
monitor.dispose();
assert.ok([...observers.values()].every(observer => observer.disconnected));

const calls = [];
const renderer = {
  refreshEditedCellColors: (cells, options) => { calls.push(["partial", cells, options.draw]); return true; },
  refreshHeightCells: () => { calls.push(["height"]); },
  refreshCellSurface: () => { calls.push(["full"]); },
  draw: () => { calls.push(["draw"]); }
};
const state = {map: {}, renderer, lastEditRefresh: null};
const scheduler = createEditRefreshScheduler({state, documentRef, updateRuntimePanel() {}, updatePickPanel() {}});
scheduler.run({...STATE_BRUSH_PREVIEW_EFFECTS, changedGridCells: [4, 2, 4]});
assert.deepEqual(calls, [["partial", [2, 4], true]], "国家预览必须只刷新变更 cell");
const command = createApplyStateBrushCommand([{gridCell: 4, before: 2, after: 1}]);
assert.equal(command.effects.cellAttributePatch, true);
assert.deepEqual(command.effects.changedGridCells, [4]);
console.log(JSON.stringify({ok: true, browserSamples: browserSamples.length, partialCells: 2}));
