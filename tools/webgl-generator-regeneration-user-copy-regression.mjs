import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  REGENERATION_KIND_LABELS,
  createRegenerationUserError,
  regenerationErrorMessage,
  regenerationFeedbackMessage,
  regenerationKindLabel,
  regenerationLoadingMessage,
  regenerationLoadingState,
  regenerationPanelCopy,
  regenerationResultMessage
} from "../app/webgl-generator/src/ui/regeneration-user-copy.js";
import {createRegenerationResult} from "../app/webgl-generator/src/runtime/height-derived-rebuild.js";

const expectedKinds = Object.freeze({
  features: "地理要素",
  routes: "路线",
  rivers: "河流",
  cities: "城镇",
  states: "国家",
  provinces: "省份",
  markers: "标记",
  diplomacy: "外交",
  religions: "宗教",
  military: "军事",
  zones: "地区"
});
const expectedPreparationCopy = Object.freeze({
  features: "正在汇集山川水陆与海岸轮廓",
  routes: "正在汇集城邑、港口与通行地势",
  rivers: "正在汇集地势高低、雨水与湖泊",
  cities: "正在汇集山河、人烟、文化与政区",
  states: "正在汇集城邑、疆域、文化与人烟",
  provinces: "正在汇集国家、城邑与地形脉络",
  markers: "正在汇集地貌、物产与人烟分布",
  diplomacy: "正在汇集诸国关系、战争与往来",
  religions: "正在汇集文化、城邑与人口分布",
  military: "正在汇集诸国、城邑、地势与战局",
  zones: "正在汇集战争、信仰、军事与地貌"
});
const forbidden = /\b(?:worker|features?|routes?|rivers?|cities|states|provinces|markers|diplomacy|religions|military|zones|kind|pack|mesh|haven|harbor|buffer|localstorage|sessionstorage|indexeddb|blob)\b|线程|任务会话|消息包|结构化克隆|缓存后端/iu;
const technicalMessage = "Worker session 正在发送 routes 消息包并写入 WebGL buffer / IndexedDB Blob 缓存后端";

assert.deepEqual(REGENERATION_KIND_LABELS, expectedKinds, "十一类重新生成中文名称不完整或顺序漂移");
for (const [kind, label] of Object.entries(expectedKinds)) {
  assert.equal(regenerationKindLabel(kind), label, `${kind} 中文名称错误`);
  assert.equal(regenerationLoadingMessage(kind, "stream-input"), expectedPreparationCopy[kind], `${kind} 资料汇集文案没有说明真实上游`);
}
assert.equal(regenerationKindLabel("unknown-worker-kind"), "地图内容", "未知领域泄漏英文名称");

const expectedStages = Object.freeze({
  regenerate: "正在为路线重开一卷",
  "stream-input": "正在汇集城邑、港口与通行地势",
  compute: "正在重新铺陈路线",
  "result-stream-complete": "正在校定新路线的彼此关系",
  "fallback-snapshot": "正在另择稳妥路径铺陈路线",
  commit: "正在将新路线落定成图",
  "render-install-picking": "正在描清新路线的图上细节",
  complete: "路线新卷已经落定",
  cancel: "已停下本次路线重绘",
  failure: "本次路线未能落定"
});
for (const [stage, expected] of Object.entries(expectedStages)) {
  assert.equal(regenerationLoadingMessage("routes", stage, {message: technicalMessage}), expected, `${stage} 阶段文案错误`);
}
assert.equal(regenerationLoadingMessage("routes", "worker-output-packet", {message: technicalMessage}), "正在重新铺陈路线", "未知底层阶段未收敛为铺陈文案");
assert.equal(regenerationLoadingMessage("routes", "render-prepare"), "正在重新铺陈路线", "后台画面预备不应冒充正式上屏");

const observedStages = ["regenerate", "stream-input", "compute", "render-prepare", "result-stream-complete", "worker-output-packet", "commit", "render-install-picking", "complete"];
const visibleSequence = [];
let visibleState = {rank: -1, message: ""};
for (const stage of observedStages) {
  const next = regenerationLoadingState("routes", stage);
  if (next.rank < visibleState.rank || next.message === visibleState.message) continue;
  visibleState = next;
  visibleSequence.push(next.message);
}
assert.deepEqual(visibleSequence, [
  "正在为路线重开一卷",
  "正在汇集城邑、港口与通行地势",
  "正在重新铺陈路线",
  "正在校定新路线的彼此关系",
  "正在将新路线落定成图",
  "正在描清新路线的图上细节",
  "路线新卷已经落定"
], "Loading 阶段必须单调前进且相同文案去重");

for (const [kind, label] of Object.entries(expectedKinds)) {
  assert.equal(regenerationResultMessage(kind, {executed: true, status: technicalMessage}), `${label}重新生成完成。`);
  assert.equal(regenerationResultMessage(kind, {executed: false, status: technicalMessage}), `${label}没有需要更新的内容。`);
  assert.equal(regenerationFeedbackMessage(kind, {ok: true, data: {executed: true, status: technicalMessage}}), `${label}重新生成完成。`);
  const formalSuccess = createRegenerationResult(kind, technicalMessage, technicalMessage);
  const formalNoOp = createRegenerationResult(kind, "未执行", technicalMessage);
  assert.equal(regenerationPanelCopy(formalSuccess, {defaultConstraint: "用户说明"}).status, `${label}重新生成完成。`, `${kind} 正式成功结果未识别`);
  assert.equal(regenerationPanelCopy(formalNoOp, {defaultConstraint: "用户说明"}).status, `${label}没有需要更新的内容。`, `${kind} 正式 no-op 结果未识别`);
}

const errorCodes = [
  "operation_busy",
  "operation_cancelled",
  "operation_obsolete",
  "operation_invalid_input",
  "regeneration_lock_conflict",
  "operation_rollback_failed",
  "operation_failed",
  "worker_session_commit_rejected",
  "worker_regeneration_render_missing"
];
for (const code of errorCodes) {
  const direct = regenerationErrorMessage(code);
  const feedback = regenerationFeedbackMessage("rivers", {ok: false, error: {code, message: technicalMessage, details: technicalMessage}});
  assert.equal(feedback, direct, `${code} 普通错误读取了底层诊断`);
}
assert.equal(
  regenerationFeedbackMessage("rivers", {ok: false, error: {code: "operation_failed", message: technicalMessage}}, {debug: true}),
  `重设失败：${technicalMessage}`,
  "开发模式没有保留底层错误诊断"
);
assert.equal(
  regenerationFeedbackMessage("states", {ok: true, data: {status: technicalMessage}}, {debug: true}),
  technicalMessage,
  "开发模式没有保留底层成功诊断"
);

for (const code of ["operation_failed", "operation_busy"]) {
  const cause = Object.assign(new Error(`Worker generate.regenerate zones fault: ${code}`), {code, details: technicalMessage});
  const safe = createRegenerationUserError("zones", cause);
  assert.equal(safe.code, code, `地区 ${code} 错误码丢失`);
  assert.equal(safe.cause, cause, `地区 ${code} cause 丢失`);
  assert.equal(safe.regenerationKind, "zones", `地区 ${code} 领域诊断丢失`);
  assert.equal(safe.message, regenerationErrorMessage(code), `地区 ${code} 没有使用中文错误映射`);
  assert.doesNotMatch(safe.message, /Worker|generate\.regenerate|zones|fault/i, `地区 ${code} 普通错误泄漏底层诊断`);
}

const ordinaryOutputs = [
  ...Object.keys(expectedKinds).flatMap(kind => [
    regenerationKindLabel(kind),
    regenerationLoadingMessage(kind, "regenerate"),
    regenerationLoadingMessage(kind, "stream-input"),
    regenerationLoadingMessage(kind, "worker-output-packet"),
    regenerationLoadingMessage(kind, "fallback-snapshot"),
    regenerationLoadingMessage(kind, "commit"),
    regenerationLoadingMessage(kind, "render-install-gpu"),
    regenerationLoadingMessage(kind, "complete"),
    regenerationLoadingMessage(kind, "cancel"),
    regenerationResultMessage(kind, {executed: true}),
    regenerationResultMessage(kind, {executed: false})
  ]),
  ...errorCodes.map(regenerationErrorMessage)
];
for (const output of ordinaryOutputs) assert.doesNotMatch(output, forbidden, `普通文案泄漏技术词：${output}`);

const ordinaryPanelCopy = regenerationPanelCopy({
  kind: "features",
  executed: true,
  status: technicalMessage,
  constraint: technicalMessage
}, {debug: false, defaultConstraint: "会保留已锁定内容。"});
assert.deepEqual(ordinaryPanelCopy, {
  status: "地理要素重新生成完成。",
  constraint: "会保留已锁定内容。",
  appStatus: null
}, "普通控制面板读取了技术状态或约束");
assert.deepEqual(regenerationPanelCopy({action: "height-derived", status: technicalMessage}, {
  debug: false,
  defaultConstraint: "原有说明"
}), {status: "", constraint: "原有说明", appStatus: null}, "十一类以外的既有入口被普通文案改写");

const debugPanelCopy = regenerationPanelCopy({
  action: "features",
  executed: true,
  status: technicalMessage,
  constraint: "constraint diagnostic"
}, {debug: true, defaultConstraint: "default"});
assert.deepEqual(debugPanelCopy, {
  status: technicalMessage,
  constraint: "constraint diagnostic",
  appStatus: `features：${technicalMessage} / constraint diagnostic`
}, "开发模式状态、约束或 app-status 诊断丢失");

const [appSource, panelSource, controlPanelSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8")
]);
const regenerateActionSource = sliceBetween(appSource, "regenerate: (kind, options = {})", "    layers: {");
assert.match(regenerateActionSource, /regenerationLoadingMessage\(kind, stage\)/, "Loading 没有使用固定阶段映射");
assert.match(regenerateActionSource, /nextLoading\.rank >= visibleLoading\.rank/, "Loading 没有阻止迟到阶段倒退");
assert.match(regenerateActionSource, /nextLoading\.message !== visibleLoading\.message/, "Loading 没有去除重复文案刷新");
assert.doesNotMatch(regenerateActionSource, /updateGenerationLoading\([^;]+detail\.message/s, "Loading 仍采信底层 detail.message");
assert.match(regenerateActionSource, /regenerationLoadingMessage\(kind, "complete"\)/, "Loading 缺少完成阶段");
assert.match(regenerateActionSource, /\? "cancel" : "failure"/, "Loading 缺少取消阶段");
const zoneCallbackSource = sliceBetween(appSource, "zonePanel = createZonePanel", "state.panels.zone = zonePanel");
assert.match(zoneCallbackSource, /runtimeActions\.generate\.regenerate\("zones", \{confirm: true\}\)/, "地区面板没有调用正式重新生成入口");
assert.match(zoneCallbackSource, /createRegenerationUserError\("zones", error\)/, "地区面板错误没有经过用户文案映射");

const panelUpdateSource = sliceBetween(panelSource, "export function updateRegenerationSection", "export function setGenerationLoading");
assert.match(panelUpdateSource, /regenerationPanelCopy\(result, \{debug: debugEnabled, defaultConstraint\}\)/, "控制面板没有使用纯文案决策");
assert.match(panelUpdateSource, /copy\.appStatus !== null/, "普通 app-status 没有与技术诊断隔离");

const actionsSource = sliceBetween(controlPanelSource, "const regenerationActions", "const selectedRegenerationKind");
for (const kind of Object.keys(expectedKinds)) assert.match(actionsSource, new RegExp(`kind: "${kind}"`), `控制面板缺少 ${kind}`);
assert.equal((actionsSource.match(/kind: "/g) || []).length, 11, "控制面板重新生成入口不是十一类");
const requestSource = sliceBetween(controlPanelSource, "async function requestRegeneration", "function commitLabelStyle");
assert.match(requestSource, /regenerationFeedbackMessage/, "控制面板结果没有经过普通文案映射");
assert.doesNotMatch(requestSource, /response\?\.data\?\.status|response\?\.error\?\.message/, "控制面板直接读取底层结果文案");

console.log(JSON.stringify({
  ok: true,
  kinds: Object.entries(expectedKinds).map(([kind, label]) => ({kind, label})),
  stages: expectedStages,
  errors: Object.fromEntries(errorCodes.map(code => [code, regenerationErrorMessage(code)])),
  ordinaryTextLeaks: 0,
  debugDiagnosticsPreserved: true
}, null, 2));

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法定位源码片段：${start} -> ${end}`);
  return source.slice(startIndex, endIndex);
}
