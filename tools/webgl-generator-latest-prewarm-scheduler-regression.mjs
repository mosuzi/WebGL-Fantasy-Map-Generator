import assert from "node:assert/strict";
import {createLatestPrewarmScheduler} from "../app/webgl-generator/src/runtime/latest-prewarm-scheduler.js";

const accepted = [], discarded = [], started = [], resolvers = new Map();
let currentKey = "A";
const scheduler = createLatestPrewarmScheduler({
  delayMs: 0,
  run(task, signal) {
    started.push(task.key);
    return new Promise((resolve, reject) => {
      resolvers.set(task.key, {resolve, reject, signal});
      signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), {once: true});
    });
  },
  isCurrent: task => task.key === currentKey,
  onAccepted: (result, task) => accepted.push([task.key, result]),
  onDiscarded: (task, reason) => discarded.push([task.key, reason])
});

scheduler.schedule({key: "A"});
const duplicateSequence = scheduler.schedule({key: "A"});
await tick();
assert.deepEqual(started, ["A"]);
assert.equal(duplicateSequence, 1, "同键 queued 预热必须幂等");
currentKey = "B";
scheduler.schedule({key: "B"});
await tick();
assert.equal(resolvers.get("A").signal.aborted, true, "新 revision 必须取消 running 旧预热");
assert.deepEqual(started, ["A", "B"]);
resolvers.get("B").resolve("ready-B");
await tick();
assert.deepEqual(accepted, [["B", "ready-B"]], "只能接纳最新 revision 结果");
assert.equal(scheduler.getSnapshot().status, "ready");
const readySequence = scheduler.getSnapshot().sequence;
assert.equal(scheduler.cancel("no-pending-work"), readySequence, "没有待执行任务时 cancel 必须幂等");
assert.equal(scheduler.getSnapshot().status, "ready", "空 cancel 不得把已接纳状态伪装成新取消");

currentKey = "C";
scheduler.schedule({key: "C"});
scheduler.cancel("foreground");
await tick();
assert.deepEqual(started, ["A", "B"], "前台抢占必须清除 queued 预热");
assert.equal(scheduler.getSnapshot().reason, "foreground");
assert.ok(discarded.some(([key]) => key === "A"), "旧 running 结果必须登记丢弃");

console.log(JSON.stringify({ok: true, started, accepted, discarded, foregroundCancelled: true}));

function tick() { return new Promise(resolve => setTimeout(resolve, 5)); }
