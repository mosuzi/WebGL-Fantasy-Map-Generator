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

const feedback = createDelayedOperationFeedback(documentRef, {delayMs: 24});

const fast = feedback.begin();
feedback.finish(fast);
await wait(32);
assert.deepEqual(feedback.getSnapshot(), {active: 0, shown: false, hidden: true, message: DEFAULT_DELAYED_OPERATION_MESSAGE, sources: []});

const slow = feedback.begin("正在重算河网");
await wait(30);
assert.equal(feedback.getSnapshot().shown, true, "慢异步操作到门槛后没有显示");
assert.equal(text.textContent, "正在重算河网，请稍候片刻。");
feedback.finish(slow);
assert.equal(bubble.hidden, true, "慢异步操作完成后没有清理");

feedback.setRuntimeOperation(true, "正在导出 PNG", {id: 7});
await wait(30);
assert.equal(feedback.getSnapshot().shown, true, "runtime operation 没有接入延迟提示");
feedback.setRuntimeOperation(true, "正在誊清图卷", {id: 7});
assert.equal(text.textContent, "正在誊清图卷，请稍候片刻。", "runtime operation 阶段文案没有更新");
feedback.setRuntimeOperation(false, "", {id: 7});
assert.equal(bubble.hidden, true, "runtime operation 完成后没有清理");

const first = feedback.begin("第一项任务", {id: "overlap-first", source: "manual"});
const second = feedback.begin("第二项任务", {id: "overlap-second", source: "manual"});
feedback.finish(second);
assert.equal(feedback.getSnapshot().active, 1, "重叠任务清理时误清其它任务");
feedback.finish(first);
assert.equal(feedback.getSnapshot().active, 0, "重叠任务没有完整清理");

feedback.destroy();
assert.equal(feedback.getSnapshot().active, 0, "销毁后仍残留任务 token");

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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
