#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  classifyDisplayWorkerPath,
  createDisplayWorkerLedger,
  DISPLAY_WORKER_PATH,
  scheduleDisplayWorkerFrames
} from "../app/webgl-generator/src/runtime/display-worker-ledger.js";

const binding = {mapIdentity: "map-a", mapRevision: 4, generationToken: 2, lockFingerprint: "locks"};
const idle = {id: "session-a", status: "idle", binding};
assert.equal(classifyDisplayWorkerPath(idle, binding, true), DISPLAY_WORKER_PATH.WARM);
assert.equal(classifyDisplayWorkerPath(null, binding, false), DISPLAY_WORKER_PATH.COLD);
assert.equal(classifyDisplayWorkerPath({...idle, binding: {...binding, mapIdentity: "map-b"}}, binding, false), DISPLAY_WORKER_PATH.STALE_MAP);
assert.equal(classifyDisplayWorkerPath({...idle, binding: {...binding, mapRevision: 3}}, binding, false), DISPLAY_WORKER_PATH.STALE_REVISION);
assert.equal(classifyDisplayWorkerPath({...idle, binding: {...binding, generationToken: 1}}, binding, false), DISPLAY_WORKER_PATH.STALE_CONTEXT);
assert.equal(classifyDisplayWorkerPath({...idle, status: "running"}, binding, false), DISPLAY_WORKER_PATH.BUSY_RESTART);
assert.equal(classifyDisplayWorkerPath(null, binding, true), DISPLAY_WORKER_PATH.INCONSISTENT_REUSE);

const ledger = createDisplayWorkerLedger({
  sessionBefore: idle,
  binding,
  worker: {session: {reused: true}, telemetry: {inputPackets: 3, inputStreamMs: 1.25, outputPackets: 9, outputReceiveMs: 2.5}}
});
assert.equal(ledger.path, DISPLAY_WORKER_PATH.WARM);
assert.deepEqual([ledger.inputPackets, ledger.inputStreamMs, ledger.outputPackets, ledger.outputReceiveMs], [3, 1.25, 9, 2.5]);
assert.notEqual(ledger.sessionBefore, idle);
assert.notEqual(ledger.requestedBinding, binding);

const frames = [];
let now = 100;
assert.equal(scheduleDisplayWorkerFrames(ledger, 80, callback => frames.push(callback), () => now), true);
assert.equal(frames.length, 1);
frames.shift()();
assert.equal(ledger.frames.firstAnimationFrameMs, 20);
now = 116.667;
assert.equal(frames.length, 1);
frames.shift()();
assert.equal(ledger.frames.presentedFrameMs, 36.667);

console.log(JSON.stringify({ok: true, paths: Object.values(DISPLAY_WORKER_PATH), frames: ledger.frames}));
