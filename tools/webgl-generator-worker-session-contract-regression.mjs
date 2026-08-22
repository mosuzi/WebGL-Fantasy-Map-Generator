#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "@babel/parser";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionSource = read("tools/webgl-generator-worker-session-browser-regression.mjs");
const workerTaskSource = read("tools/webgl-generator-worker-task-regression.mjs");
const coordinatorSource = read("app/webgl-generator/src/runtime/worker-task-coordinator.js");
const appSource = read("app/webgl-generator/src/runtime/app.js");

const sessionEvidence = validateSessionSource(sessionSource);
validateWorkerTaskSource(workerTaskSource);
validateCoordinatorSource(coordinatorSource);
const outputValidationBoundary = validateWorkerOutputValidationBoundary(appSource);

const idleAssertion = /  assert\.equal\(session\.status, "idle",[^\n]+\);\r?\n/u;
const withoutIdleAssertion = replaceExactlyOnce(sessionSource, idleAssertion, "");
const crossHelperComment = replaceExactlyOnce(
  withoutIdleAssertion,
  "function assertSessionContinuity",
  "// assert.equal(session.status, \"idle\", \"跨 helper 伪证\");\nfunction assertSessionContinuity"
);
assert.throws(
  () => validateSessionSource(crossHelperComment),
  /idle status/u,
  "删除真实 idle 断言并把 token 移到其他 helper 注释后夹具仍通过"
);

const adoptedAssertion = /  assert\.equal\(session\.adopted, true,[^\n]+\);\r?\n/u;
const withoutAdoptedAssertion = replaceExactlyOnce(sessionSource, adoptedAssertion, "");
const sameHelperString = replaceExactlyOnce(
  withoutAdoptedAssertion,
  "function assertIdleAdoptedSession(session, label, {expectedRevision = null} = {}) {",
  "function assertIdleAdoptedSession(session, label, {expectedRevision = null} = {}) {\n  \"assert.equal(session.adopted, true, same helper string)\";"
);
assert.throws(
  () => validateSessionSource(sameHelperString),
  /adopted flag/u,
  "删除真实 adopted 断言并把 token 放入同 helper 字符串后夹具仍通过"
);

for (const index of [0, 3]) {
  const statement = outputValidationBoundary.statements[index];
  const mutated = `${appSource.slice(0, statement.start)}void 0;${appSource.slice(statement.end)}`;
  assert.throws(
    () => validateWorkerOutputValidationBoundary(mutated),
    /output validator yield boundary/u,
    `删除 output validator ${index === 0 ? "前" : "后"} yield 后静态门仍通过`
  );
}

console.log(JSON.stringify({
  ok: true,
  sessionBrowser: sessionEvidence,
  nodeExecution: {adoption: true, replicaQueue: true, checksumResync: true, cancelObsolete: true},
  outputValidationYieldBoundary: {directStatements: outputValidationBoundary.statements.length, mutationCases: 2},
  contractNegativeCases: 4,
  browserRuns: 0
}, null, 2));

function validateWorkerOutputValidationBoundary(source) {
  const ast = parse(source, {sourceType: "module", allowAwaitOutsideFunction: true});
  const functions = [];
  visit(ast.program, node => {
    if (node.type === "FunctionDeclaration" && node.id?.name === "executeWorkerMapMutation") functions.push(node);
  });
  assert.equal(functions.length, 1, "output validator yield boundary 缺少唯一 executeWorkerMapMutation");
  const guards = [];
  visit(functions[0].body, node => {
    if (node.type === "IfStatement"
      && node.test?.type === "BinaryExpression"
      && node.test.operator === "==="
      && node.test.left?.type === "UnaryExpression"
      && node.test.left.operator === "typeof"
      && callName(node.test.left.argument) === "mutation.assertOutput"
      && node.test.right?.type === "StringLiteral"
      && node.test.right.value === "function") guards.push(node);
  });
  assert.equal(guards.length, 1, "output validator yield boundary 缺少唯一 assertOutput guard");
  const body = guards[0].consequent;
  assert.equal(body?.type, "BlockStatement", "output validator yield boundary guard 必须是直接 block");
  const statements = body.body;
  assert.equal(statements.length, 5, "output validator yield boundary 必须恰有五条直接语句");
  assertAwaitCall(statements[0], "yieldToBrowser", ["documentRef"], "output validator yield boundary 前置 yield");
  assertDirectCall(statements[1], "assertWorkerRegenerationOutputCurrent", ["state", "binding", "output", "operation"], "output validator yield boundary 前置恢复复核");
  assertAwaitCall(statements[2], "mutation.assertOutput", null, "output validator yield boundary 完整 validator");
  const validatorCall = statements[2].expression.argument;
  assert.equal(validatorCall.arguments.length, 1, "output validator yield boundary validator 必须只有一个输入包");
  const validatorInput = validatorCall.arguments[0];
  assert.equal(validatorInput?.type, "ObjectExpression", "output validator yield boundary validator 输入必须是直接对象");
  const validatorFields = Object.fromEntries(validatorInput.properties.map(property => [objectPropertyName(property), callName(property.value)]));
  assert.deepEqual(validatorFields, {
    state: "state",
    sourceMap: "sourceMap",
    binding: "binding",
    renderBinding: "renderRequest.binding",
    output: "output",
    operation: "operation"
  }, "output validator yield boundary validator 输入字段漂移");
  assertAwaitCall(statements[3], "yieldToBrowser", ["documentRef"], "output validator yield boundary 后置 yield");
  assertDirectCall(statements[4], "assertWorkerRegenerationOutputCurrent", ["state", "binding", "output", "operation"], "output validator yield boundary 后置恢复复核");
  return {statements};
}

function assertAwaitCall(statement, expectedCall, expectedArgs, label) {
  const expression = statement?.type === "ExpressionStatement" ? statement.expression : null;
  const call = expression?.type === "AwaitExpression" ? expression.argument : null;
  assert.equal(call?.type, "CallExpression", `${label} 不是直接 awaited call`);
  assert.equal(callName(call.callee), expectedCall, `${label} callee 漂移`);
  if (expectedArgs) assert.deepEqual(call.arguments.map(callName), expectedArgs, `${label} 参数漂移`);
}

function assertDirectCall(statement, expectedCall, expectedArgs, label) {
  const call = statement?.type === "ExpressionStatement" ? statement.expression : null;
  assert.equal(call?.type, "CallExpression", `${label} 不是直接 call`);
  assert.equal(callName(call.callee), expectedCall, `${label} callee 漂移`);
  assert.deepEqual(call.arguments.map(callName), expectedArgs, `${label} 参数漂移`);
}

function callName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (!["MemberExpression", "OptionalMemberExpression"].includes(node.type)) return "";
  const object = callName(node.object);
  const property = node.computed ? node.property?.value : node.property?.name;
  return [object, property].filter(Boolean).join(".");
}

function objectPropertyName(property) {
  if (!property || property.type !== "ObjectProperty" || property.computed) return "";
  if (property.key?.type === "Identifier") return property.key.name;
  if (property.key?.type === "StringLiteral") return property.key.value;
  return "";
}

function validateSessionSource(source) {
  const idle = functionTokens(source, "assertIdleAdoptedSession");
  assertSequences(idle, [
    [["assert", ".", "equal", "(", "session", ".", "status", ",", "\"idle\""], "idle status"],
    [["assert", ".", "equal", "(", "session", ".", "adopted", ",", "true"], "adopted flag"],
    [["assert", ".", "equal", "(", "typeof", "session", ".", "checksum", ",", "\"string\""], "checksum type"],
    [["assert", ".", "ok", "(", "session", ".", "checksum"], "checksum value"],
    [["assert", ".", "equal", "(", "typeof", "session", ".", "binding", "?.", "mapIdentity", ",", "\"string\""], "mapIdentity type"],
    [["assert", ".", "ok", "(", "session", ".", "binding", ".", "mapIdentity"], "mapIdentity value"],
    [["Number", ".", "isSafeInteger", "(", "session", ".", "binding", ".", "mapRevision", ")"], "mapRevision safe integer"],
    [["Number", ".", "isSafeInteger", "(", "session", ".", "binding", ".", "generationToken", ")"], "generationToken safe integer"],
    [["assert", ".", "equal", "(", "typeof", "session", ".", "binding", ".", "lockFingerprint", ",", "\"string\""], "lockFingerprint type"],
    [["assert", ".", "ok", "(", "session", ".", "binding", ".", "lockFingerprint"], "lockFingerprint value"],
    [["assert", ".", "equal", "(", "session", ".", "binding", ".", "mapRevision", ",", "expectedRevision"], "expected revision"]
  ], "assertIdleAdoptedSession");

  const continuityHelper = functionTokens(source, "assertSessionContinuity");
  assertSequences(continuityHelper, [
    [["assertIdleAdoptedSession", "(", "before"], "before adoption"],
    [["assertIdleAdoptedSession", "(", "after"], "after adoption"],
    [["assert", ".", "equal", "(", "after", ".", "id", ",", "before", ".", "id"], "session id continuity"],
    [["assert", ".", "equal", "(", "after", ".", "binding", ".", "mapIdentity", ",", "before", ".", "binding", ".", "mapIdentity"], "mapIdentity continuity"],
    [["assert", ".", "equal", "(", "after", ".", "binding", ".", "generationToken", ",", "before", ".", "binding", ".", "generationToken"], "generationToken continuity"],
    [["before", ".", "binding", ".", "mapRevision", "+", "revisionDelta"], "revision delta"],
    [["assert", ".", "equal", "(", "after", ".", "checksum", ",", "before", ".", "checksum"], "same checksum"],
    [["assert", ".", "notEqual", "(", "after", ".", "checksum", ",", "before", ".", "checksum"], "changed checksum"],
    [["assert", ".", "equal", "(", "after", ".", "binding", ".", "lockFingerprint", ",", "before", ".", "binding", ".", "lockFingerprint"], "same lock fingerprint"],
    [["assert", ".", "notEqual", "(", "after", ".", "binding", ".", "lockFingerprint", ",", "before", ".", "binding", ".", "lockFingerprint"], "changed lock fingerprint"]
  ], "assertSessionContinuity");

  const replacementHelper = functionTokens(source, "assertSessionReplacement");
  assertSequences(replacementHelper, [
    [["assertIdleAdoptedSession", "(", "before"], "before adoption"],
    [["assertIdleAdoptedSession", "(", "after"], "after adoption"],
    [["expectedRevision", ":", "0"], "fresh revision"],
    [["assert", ".", "notEqual", "(", "after", ".", "id", ",", "before", ".", "id"], "new session id"],
    [["assert", ".", "notEqual", "(", "after", ".", "binding", ".", "mapIdentity", ",", "before", ".", "binding", ".", "mapIdentity"], "new mapIdentity"],
    [["assert", ".", "notEqual", "(", "after", ".", "checksum", ",", "before", ".", "checksum"], "new checksum"],
    [["assert", ".", "notEqual", "(", "after", ".", "binding", ".", "lockFingerprint", ",", "before", ".", "binding", ".", "lockFingerprint"], "new lock fingerprint"]
  ], "assertSessionReplacement");

  const continuity = functionTokens(source, "runSessionFaultAndInvalidationGate");
  const continuityTransitions = countSequence(continuity, ["assertSessionContinuity", "("]);
  assert.ok(continuityTransitions >= 6, "session invalidation 链缺少完整 continuity transition");
  assertSequences(continuity, [
    [["assertIdleAdoptedSession", "(", "invalidation", ".", "adoptedInitial"], "initial adoption"],
    [["assert", ".", "equal", "(", "invalidation", ".", "initial", ".", "worker", ".", "session", ".", "reused", ",", "true"], "initial reuse"],
    [["assertSessionContinuity", "(", "invalidation", ".", "adoptedInitial"], "initial continuity"],
    [["assertSessionReplacement", "(", "sessionBeforeMapReplace"], "map replacement"],
    [["assert", ".", "equal", "(", "fault", ".", "recovered", ".", "worker", ".", "session", ".", "reused", ",", "false"], "fault recovery fresh session"],
    [["runNoOpLateRaceGate", "(", "page", ")"], "late race gate"],
    [["runPendingViewportGate", "(", "page", ")"], "pending viewport gate"]
  ], "runSessionFaultAndInvalidationGate");

  const lateRace = functionTokens(source, "runNoOpLateRaceGate");
  assertSequences(lateRace, [
    [["for", "(", "const", "mode", "of", "[", "\"cancel\"", ",", "\"map-replace\"", "]"], "race modes"],
    [["installSessionCommitPause", "(", "page", ")"], "commit pause"],
    [["releaseSessionCommitPause", "(", "page", ")"], "commit release"],
    [["assert", ".", "equal", "(", "response", "?.", "ok", ",", "false"], "late response rejected"],
    [["assert", ".", "equal", "(", "state", ".", "replacementRetained", ",", "true"], "replacement retained"],
    [["assert", ".", "equal", "(", "state", ".", "session", ",", "null"], "session invalidated"],
    [["assert", ".", "equal", "(", "state", ".", "loadingVisible", ",", "0"], "loading cleared"],
    [["window", ".", "__task322SessionCommitPause", "?.", "restore", "?.", "(", ")"], "pause restored"]
  ], "runNoOpLateRaceGate");

  const pendingViewport = functionTokens(source, "runPendingViewportGate");
  assertSequences(pendingViewport, [
    [["for", "(", "const", "mode", "of", "[", "\"success\"", ",", "\"fault\"", "]"], "viewport modes"],
    [["assert", ".", "equal", "(", "started", ".", "response", "?.", "error", "?.", "code", ",", "\"worker_regeneration_refresh_fault\""], "fault code"],
    [["assert", ".", "equal", "(", "started", ".", "wrapperCalls", ",", "1"], "single wrapper call"],
    [["assert", ".", "equal", "(", "after", ".", "sameMap", ",", "true"], "same map"],
    [["assert", ".", "equal", "(", "after", ".", "overlayCamera", ",", "after", ".", "camera"], "overlay camera"],
    [["assert", ".", "equal", "(", "after", ".", "routeCameraMatches", ",", "true"], "route camera"],
    [["assert", ".", "equal", "(", "after", ".", "riverCameraMatches", ",", "true"], "river camera"],
    [["assert", ".", "equal", "(", "after", ".", "loadingVisible", ",", "0"], "loading cleared"],
    [["baseline", ".", "history", ".", "undo", "+", "1"], "history delta"],
    [["assert", ".", "deepEqual", "(", "stable", ",", "after"], "late-write stability"]
  ], "runPendingViewportGate");

  const hundredThousand = functionTokens(source, "runHundredThousandSessionGate");
  assertSequences(hundredThousand, [
    [["createMap", "(", "page", ",", "\"worker-session-100k\"", ",", "100000", ")"], "100k generation"],
    [["assertIdleAdoptedSession", "(", "adoptedSession"], "100k adopted session"],
    [["assert", ".", "equal", "(", "operations", "[", "0", "]", ".", "worker", ".", "session", ".", "reused", ",", "true"], "100k initial reuse"],
    [["item", ".", "telemetry", ".", "inputPackets", "<=", "4"], "packet budget"],
    [["item", ".", "sameRef", "&&", "item", ".", "length", "===", "item", ".", "beforeLength"], "buffer identity"],
    [["cancelAcceptedWorkerOperation", "(", "page", ",", "\"zones\"", ")"], "accepted cancellation"],
    [["assert", ".", "equal", "(", "afterCancel", ".", "worker", ".", "session", ".", "reused", ",", "false"], "fresh recovery"]
  ], "runHundredThousandSessionGate");

  return {
    continuityTransitions,
    replacementTransitions: countSequence(continuity, ["assertSessionReplacement", "("]),
    raceModes: 2,
    pendingViewportModes: 2,
    hundredThousand: true
  };
}

function validateWorkerTaskSource(source) {
  const tokens = executableTokens(source);
  assertSequences(tokens, [
    [["sessionMode", ":", "\"adopt-result-map\""], "adopt-result-map mode"],
    [["assert", ".", "equal", "(", "adoptionCoordinator", ".", "getSessionSnapshot", "(", ")", "?.", "status", ",", "\"pending\""], "pending adoption"],
    [["assert", ".", "equal", "(", "await", "adoptionCoordinator", ".", "commitSession", "(", "adoptedImport", ".", "worker", ".", "session", ".", "id"], "adoption commit"],
    [["assert", ".", "equal", "(", "adoptedSave", ".", "worker", ".", "session", ".", "reused", ",", "true"], "adoption owner reuse"],
    [["failedAdoptionCoordinator", ".", "invalidateSession", "("], "failed adoption invalidation"],
    [["assert", ".", "equal", "(", "sessionCoordinator", ".", "getSessionSnapshot", "(", ")", "?.", "status", ",", "\"idle\""], "pre-cancel idle"],
    [["assert", ".", "equal", "(", "driftCoordinator", ".", "getSessionSnapshot", "(", ")", ",", "null"], "checksum invalidation"],
    [["assert", ".", "equal", "(", "resynced", ".", "worker", ".", "session", ".", "reused", ",", "false"], "checksum resync"],
    [["assert", ".", "equal", "(", "fallbackCount", ",", "1"], "accepted failure no fallback"]
  ], "worker task execution evidence");
  assert.ok(countSequence(tokens, ["assert", ".", "equal", "(", "adoptionCoordinator", ".", "getSessionSnapshot", "(", ")", "?.", "status", ",", "\"pending\""]) >= 2,
    "worker task execution evidence 缺少 adoption watchdog 后 pending 断言");
}

function validateCoordinatorSource(source) {
  const runNow = functionTokens(source, "runNow");
  assertSequences(runNow, [
    [["if", "(", "pendingSessionPatch", ")", "await", "pendingSessionPatch", ".", "catch", "("], "patch queue drain"],
    [["persistentSession", ".", "status", "===", "\"idle\""], "idle reuse"],
    [["sameSessionBinding", "(", "persistentSession", ".", "binding", ",", "binding", ")"], "binding match"],
    [["invalidateSession", "(", "\"replica-binding-mismatch\"", ")"], "binding mismatch invalidation"]
  ], "worker coordinator runNow");

  const commit = functionTokens(source, "commitSession");
  assertSequences(commit, [
    [["current", ".", "status", "!==", "\"pending\""], "pending-only commit"],
    [["validateBinding", "(", "committedBinding", ")", "!==", "true"], "obsolete binding"],
    [["invalidateSession", "(", "\"session-commit-obsolete\"", ")"], "obsolete invalidation"],
    [["isValidSessionCommitBinding", "(", "current", ".", "binding", ",", "committedBinding"], "commit continuity"],
    [["invalidateSession", "(", "\"session-commit-discontinuous\"", ")"], "discontinuous invalidation"]
  ], "worker coordinator commitSession");

  const patch = functionTokens(source, "applySessionPatchNow");
  assertSequences(patch, [
    [["current", ".", "status", "!==", "\"idle\""], "idle-only patch"],
    [["normalizeChecksum", "(", "patch", "?.", "baseChecksum", ")", "!==", "current", ".", "checksum"], "base checksum"],
    [["normalizeChecksum", "(", "patch", "?.", "targetChecksum", ")"], "target checksum"],
    [["invalidateSession", "(", "\"session-patch-discontinuous\"", ")"], "patch invalidation"]
  ], "worker coordinator applySessionPatchNow");

  const invalidate = functionTokens(source, "invalidateSession");
  assertSequences(invalidate, [
    [["persistentSession", "=", "null"], "owner cleared"],
    [["current", ".", "status", "=", "\"invalid\""], "invalid status"],
    [["current", ".", "worker", "?.", "terminate", "?.", "(", ")"], "worker termination"]
  ], "worker coordinator invalidateSession");

  const dedicated = functionTokens(source, "runDedicatedWorker");
  assertSequences(dedicated, [
    [["if", "(", "accepted", ")", "{", "finish", "(", "reject", ",", "error", ")"], "accepted failure rejects"],
    [["\"session-main-commit-timeout\""], "main commit timeout"],
    [["streamYieldToMain"], "stream yield hook"]
  ], "worker coordinator runDedicatedWorker");

  const streamInput = functionTokens(source, "streamInput");
  assertSequences(streamInput, [
    [["yieldToMain", ":", "runOptions", ".", "streamYieldToMain"], "input stream yield forwarding"]
  ], "worker coordinator streamInput");
}

function executableTokens(source) {
  const ast = parse(source, {sourceType: "module", allowAwaitOutsideFunction: true, tokens: true});
  return ast.tokens
    .filter(token => typeof token.type?.label === "string" && token.type.label !== "eof")
    .map(token => ({text: source.slice(token.start, token.end), start: token.start, end: token.end}));
}

function functionTokens(source, name) {
  const ast = parse(source, {sourceType: "module", allowAwaitOutsideFunction: true, tokens: true});
  let match = null;
  visit(ast.program, node => {
    if (!match && node.type === "FunctionDeclaration" && node.id?.name === name) match = node;
  });
  assert.ok(match, `缺少函数 ${name}`);
  return ast.tokens
    .filter(token => typeof token.type?.label === "string" && token.type.label !== "eof" && token.start >= match.start && token.end <= match.end)
    .map(token => ({text: source.slice(token.start, token.end), start: token.start, end: token.end}));
}

function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  if (typeof value.type === "string") callback(value);
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "tokens", "comments", "errors", "extra"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(item => visit(item, callback));
    else visit(child, callback);
  }
}

function assertSequences(tokens, requirements, label) {
  for (const [sequence, description] of requirements) {
    assert.ok(hasSequence(tokens, sequence), `${label} 缺少可执行 ${description}`);
  }
}

function hasSequence(tokens, sequence) {
  return countSequence(tokens, sequence) > 0;
}

function countSequence(tokens, sequence) {
  let count = 0;
  for (let index = 0; index <= tokens.length - sequence.length; index++) {
    if (sequence.every((text, offset) => tokens[index + offset].text === text)) count++;
  }
  return count;
}

function replaceExactlyOnce(source, target, replacement) {
  const matches = typeof target === "string" ? source.split(target).length - 1 : [...source.matchAll(new RegExp(target.source, target.flags.includes("g") ? target.flags : `${target.flags}g`))].length;
  assert.equal(matches, 1, `负例目标必须精确命中一次，实际 ${matches}`);
  return source.replace(target, replacement);
}

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}
