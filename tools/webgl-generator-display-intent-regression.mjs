import assert from "node:assert/strict";
import {createLatestDisplayIntentQueue, isSupersededDisplayIntent} from "../app/webgl-generator/src/runtime/display-intent-queue.js";

const collapsed = createLatestDisplayIntentQueue(), collapsedRuns = [];
const first = collapsed.run(() => collapsedRuns.push("A")), second = collapsed.run(() => collapsedRuns.push("B"));
const third = collapsed.run(context => { assert.equal(context.isCurrent(), true); collapsedRuns.push("C"); return "C"; });
const collapsedResults = await Promise.allSettled([first, second, third]);
assert.equal(isSupersededDisplayIntent(collapsedResults[0].reason), true); assert.equal(isSupersededDisplayIntent(collapsedResults[1].reason), true);
assert.equal(collapsedResults[2].value, "C"); assert.deepEqual(collapsedRuns, ["C"]);

const running = createLatestDisplayIntentQueue();
let release, markStarted, firstCurrentAfterWait = true;
const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { markStarted = resolve; });
const runningFirst = running.run(async context => { markStarted(); await gate; firstCurrentAfterWait = context.isCurrent(); return "A"; });
await started;
const runningSecond = running.run(() => "B"), runningThird = running.run(() => "C"); release();
const runningResults = await Promise.allSettled([runningFirst, runningSecond, runningThird]);
assert.equal(runningResults[0].value, "A"); assert.equal(isSupersededDisplayIntent(runningResults[1].reason), true); assert.equal(runningResults[2].value, "C");
assert.equal(firstCurrentAfterWait, false, "运行中的旧意图不得再提交控件状态");

const failures = createLatestDisplayIntentQueue();
const currentFailure = await Promise.allSettled([failures.run(() => { throw Object.assign(new Error("current"), {code: "current-failure"}); })]);
assert.equal(currentFailure[0].reason?.code, "current-failure");
let rejectOld, markOldStarted;
const oldStarted = new Promise(resolve => { markOldStarted = resolve; });
const oldFailure = failures.run(() => new Promise((resolve, reject) => { rejectOld = reject; markOldStarted(); })); await oldStarted;
const newest = failures.run(() => "latest"); rejectOld(Object.assign(new Error("old"), {code: "old-failure"}));
const failureResults = await Promise.allSettled([oldFailure, newest]), oldError = failureResults[0].reason;
assert.equal(isSupersededDisplayIntent(oldError), true); assert.equal(oldError.cause?.code, "old-failure"); assert.equal(failureResults[1].value, "latest");
console.log(JSON.stringify({ok: true, collapsed: collapsedRuns, runningOldCurrent: firstCurrentAfterWait, latestSequence: failures.getSnapshot().latestSequence}));
