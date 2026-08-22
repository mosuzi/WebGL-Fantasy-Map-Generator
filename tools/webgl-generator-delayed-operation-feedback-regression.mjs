#!/usr/bin/env node
import assert from "node:assert/strict";
import {createDelayedOperationFeedback, DEFAULT_DELAYED_OPERATION_MESSAGE} from "../app/webgl-generator/src/runtime/delayed-operation-feedback.js";

const bubble = fakeElement({id: "operation-loading", hidden: true});
const text = {textContent: ""};
const documentRef = {
  defaultView: globalThis,
  getElementById(id) {
    if (id === "operation-loading") return bubble;
    if (id === "operation-loading-text") return text;
    return null;
  }
};
const clock = createTimerClock();

const feedback = createDelayedOperationFeedback(documentRef, {
  delayMs: 24,
  setTimeout: clock.setTimeout,
  clearTimeout: clock.clearTimeout
});

const fast = feedback.begin();
feedback.finish(fast);
clock.advanceBy(24);
assert.deepEqual(feedback.getSnapshot(), {active: 0, shown: false, hidden: true, message: DEFAULT_DELAYED_OPERATION_MESSAGE, sources: []});

const slow = feedback.begin("正在重算河网");
clock.advanceBy(23);
assert.equal(feedback.getSnapshot().shown, false, "慢操作在门槛前提前显示");
clock.advanceBy(1);
assert.equal(feedback.getSnapshot().shown, true, "慢异步操作到门槛后没有显示");
assert.equal(text.textContent, "正在重算河网，请稍候片刻。");
feedback.finish(slow);
assert.equal(bubble.hidden, true, "慢异步操作完成后没有清理");

feedback.setRuntimeOperation(true, "正在导出 PNG", {id: 7});
clock.advanceBy(24);
assert.equal(feedback.getSnapshot().shown, true, "runtime operation 没有接入延迟提示");
feedback.setRuntimeOperation(true, "正在誊清图卷", {id: 7});
assert.equal(text.textContent, "正在誊清图卷，请稍候片刻。", "runtime operation 阶段文案没有更新");
feedback.setRuntimeOperation(false, "", {id: 8});
assert.equal(feedback.getSnapshot().active, 1, "迟到的其它 operation 完成误清当前提示");
feedback.setRuntimeOperation(false, "", {id: 7});
assert.equal(bubble.hidden, true, "runtime operation 完成后没有清理");

const first = feedback.begin("第一项任务", {id: "overlap-first", source: "manual"});
const second = feedback.begin("第二项任务", {id: "overlap-second", source: "manual"});
feedback.finish(second);
assert.equal(feedback.getSnapshot().active, 1, "重叠任务清理时误清其它任务");
feedback.finish(first);
assert.equal(feedback.getSnapshot().active, 0, "重叠任务没有完整清理");
assert.equal(feedback.finish("unknown-token"), false, "未知 token 不应报告清理成功");

const destroyPending = feedback.begin("正在等待销毁");
assert.ok(destroyPending);
assert.equal(clock.pendingCount(), 1);
feedback.destroy();
assert.equal(feedback.getSnapshot().active, 0, "销毁后仍残留任务 token");
assert.equal(clock.pendingCount(), 0, "销毁后仍残留 reveal timer");
clock.advanceBy(24);
assert.equal(bubble.hidden, true, "销毁后的迟到 timer 重新显示提示");

console.log(JSON.stringify({
  ok: true,
  delayMs: 24,
  scenarios: ["fast", "slow", "runtime-stage", "overlap", "destroy"],
  message: DEFAULT_DELAYED_OPERATION_MESSAGE
}, null, 2));

function fakeElement({id, hidden = false}) {
  const attributes = new Map();
  const classes = new Set();
  return {
    id,
    hidden,
    style: {setProperty() {}},
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
}

function createTimerClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay = 0) {
      const id = ++sequence;
      timers.set(id, {at: now + Math.max(0, Number(delay) || 0), callback});
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    pendingCount() {
      return timers.size;
    },
    advanceBy(ms) {
      const target = now + Math.max(0, Number(ms) || 0);
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = target;
    }
  };
}
