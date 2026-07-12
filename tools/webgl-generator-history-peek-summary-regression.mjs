#!/usr/bin/env node
import {buildHistoryPeek} from "../app/webgl-generator/src/runtime/history-peek.js";
import {systemAffected} from "../app/webgl-generator/src/runtime/edit-command-effects.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

const largeAffected = systemAffected("cities", Array.from({length: 1000}, (_, id) => ({kind: "city", id})));
const history = new EditHistory();
history.execute({
  label: "批量重算城市",
  domain: "city",
  effects: {render: "draw", selection: "refresh", derived: ["point-layers", "object-panels"], affected: largeAffected},
  apply() {},
  revert() {}
}, {});
const stats = history.getStats();
assert(history.lastAffected.length === 1001, "EditHistory 内部完整 affected 被意外截断");
assert(stats.affectedLimit === 3 && stats.lastAffected.length === 3, "EditHistory.getStats 默认预览异常");
assert(stats.lastAffectedCount === 1001 && stats.lastAffectedTruncated === true && stats.lastAffectedSummary.endsWith("+998"), "EditHistory.getStats 结构化摘要异常");
assert(JSON.stringify(stats.lastAffectedKinds) === JSON.stringify([{kind: "derived-system", count: 1}, {kind: "city", count: 1000}]), "EditHistory.getStats kind 计数异常");
assert(JSON.stringify(stats).length < 600, `EditHistory.getStats 结果体积异常：${JSON.stringify(stats).length}`);
const expandedStats = history.getStats({affectedLimit: 5});
assert(expandedStats.lastAffected.length === 5 && expandedStats.lastAffectedSummary.endsWith("+996"), "EditHistory.getStats 自定义预览异常");
assertThrows(() => history.getStats({affectedLimit: 51}), "EditHistory.getStats affectedLimit 上界没有拒绝");
assertThrows(() => history.getStats([]), "EditHistory.getStats 非对象 options 没有拒绝");

const state = {
  editHistory: {
    undoStack: [{
      label: "批量重算城市",
      domain: "city",
      effects: {render: "draw", selection: "refresh", derived: ["point-layers", "object-panels"], affected: largeAffected},
      isNoop() {}
    }],
    redoStack: [{
      label: "重命名城市 #1",
      domain: "city",
      effects: {render: "draw", selection: "refresh", derived: ["labels"], affected: [{kind: "city", id: 1}]}
    }],
    getStats() {
      return {undo: 1, redo: 1, lastLabel: "批量重算城市", lastDomain: "city", lastAffected: []};
    }
  }
};

const peek = buildHistoryPeek(state);
assert(peek.ready && peek.affectedLimit === 3, "history.peek 默认 affectedLimit 异常");
assert(peek.undo.affected.length === 3, `大命令 affected 预览长度异常：${peek.undo.affected.length}`);
assert(peek.undo.affectedCount === 1001, `大命令 affected 总数异常：${peek.undo.affectedCount}`);
assert(peek.undo.affectedTruncated === true && peek.undo.affectedSummary.endsWith("+998"), `大命令截断摘要异常：${peek.undo.affectedSummary}`);
assert(JSON.stringify(peek.undo.affectedKinds) === JSON.stringify([{kind: "derived-system", count: 1}, {kind: "city", count: 1000}]), `大命令 kind 计数异常：${JSON.stringify(peek.undo.affectedKinds)}`);
assert(peek.redo.affected.length === 1 && peek.redo.affectedCount === 1 && peek.redo.affectedTruncated === false, "小命令 affected 兼容摘要异常");
assert(JSON.stringify(peek).length < 1100, `history.peek 默认结果体积异常：${JSON.stringify(peek).length}`);

const expanded = buildHistoryPeek(state, {affectedLimit: 5});
assert(expanded.affectedLimit === 5 && expanded.undo.affected.length === 5 && expanded.undo.affectedSummary.endsWith("+996"), "history.peek 自定义 affectedLimit 异常");
const hidden = buildHistoryPeek(state, {affectedLimit: 0});
assert(hidden.undo.affected.length === 0 && hidden.undo.affectedSummary === "+1001", "history.peek affectedLimit=0 异常");
assertThrows(() => buildHistoryPeek(state, {affectedLimit: 51}), "affectedLimit 上界没有拒绝");
assertThrows(() => buildHistoryPeek(state, []), "非对象 options 没有拒绝");

console.log(JSON.stringify({
  ok: true,
  affectedLimit: peek.affectedLimit,
  affectedCount: peek.undo.affectedCount,
  affectedPreview: peek.undo.affected.length,
  affectedKinds: peek.undo.affectedKinds,
  affectedSummary: peek.undo.affectedSummary,
  resultBytes: JSON.stringify(peek).length,
  statsBytes: JSON.stringify(stats).length,
  expandedPreview: expanded.undo.affected.length
}, null, 2));

function assertThrows(run, message) {
  let thrown = false;
  try {
    run();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
