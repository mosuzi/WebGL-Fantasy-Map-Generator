import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {parse} from "@babel/parser";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";

const root = resolve(process.env.TASK_350_CDP_ARTIFACT_DIR || join(process.cwd(), "work", "task-350-cdp-artifacts"));
process.env.TASK_350_CDP_ARTIFACT_DIR = join(root, "artifact-helper-regression");

const success = createTask350BrowserArtifact("success", {mode: "self-test"});
success.mark("browser-evaluation", {active: "fixture", complete: "page-ready"});
success.setResult({raw: {value: 7}}, {value: 7});
success.mark("assertions", {complete: "browser-evaluation"});
success.succeed();
const successPaths = success.persist();
const successFull = JSON.parse(readFileSync(successPaths.fullPath, "utf8"));
const successSummary = JSON.parse(readFileSync(successPaths.summaryPath, "utf8"));
assert.equal(successFull.ok, true);
assert.deepEqual(successFull.result, {raw: {value: 7}});
assert.deepEqual(successSummary.result, {value: 7});
assert.deepEqual(successSummary.progress.completed, ["page-ready", "browser-evaluation"]);

const failure = createTask350BrowserArtifact("failure", {mode: "self-test"});
failure.mark("browser-evaluation", {active: "fixture", complete: "page-ready"});
const fixtureError = Object.assign(new Error("fixture failure"), {code: "fixture_failure"});
failure.fail(fixtureError);
const failurePaths = failure.persist();
const failureFull = JSON.parse(readFileSync(failurePaths.fullPath, "utf8"));
const failureSummary = JSON.parse(readFileSync(failurePaths.summaryPath, "utf8"));
assert.equal(failureFull.ok, false);
assert.equal(failureFull.failure.code, "fixture_failure");
assert.equal(failureSummary.failure.message, "fixture failure");
assert.equal(failureSummary.progress.active, "fixture");

const dualFailure = createTask350BrowserArtifact("dual-failure", {mode: "self-test"});
dualFailure.mark("browser-evaluation", {active: "fixture"});
dualFailure.fail(Object.assign(new Error("functional failure"), {code: "functional_failure"}));
dualFailure.failTeardown(Object.assign(new Error("teardown failure"), {code: "teardown_failure"}));
const dualFailurePaths = dualFailure.persist();
const dualFailureFull = JSON.parse(readFileSync(dualFailurePaths.fullPath, "utf8"));
assert.equal(dualFailureFull.failure.code, "functional_failure");
assert.deepEqual(dualFailureFull.teardownFailures.map(error => error.code), ["teardown_failure"]);

const teardownOnly = createTask350BrowserArtifact("teardown-only", {mode: "self-test"});
teardownOnly.setResult({raw: true}, {raw: true});
teardownOnly.succeed();
teardownOnly.failTeardown(Object.assign(new Error("teardown only"), {code: "teardown_only"}));
const teardownOnlyPaths = teardownOnly.persist();
const teardownOnlySummary = JSON.parse(readFileSync(teardownOnlyPaths.summaryPath, "utf8"));
assert.equal(teardownOnlySummary.ok, false);
assert.equal(teardownOnlySummary.failure.code, "teardown_only");
assert.deepEqual(teardownOnlySummary.teardownFailures.map(error => error.code), ["teardown_only"]);

await assert.rejects(
  closeTask350BrowserResource("fixture", () => new Promise(() => {}), 5),
  error => error?.code === "browser_teardown_timeout"
);

for (const file of [
  "tools/webgl-generator-worker-session-browser-regression.mjs",
  "tools/webgl-generator-grid-topology-browser-regression.mjs",
  "tools/webgl-generator-regeneration-lock-direct-domains-browser-regression.mjs",
  "tools/webgl-generator-regeneration-lock-compound-browser-regression.mjs"
]) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  assert.match(source, /createTask350BrowserArtifact\(/, `${file} 未接 Task 350 artifact`);
  assert.match(source, /finally\s*\{[\s\S]*?evidence\.persist\(\)/u, `${file} 未在 finally 持久化 artifact`);
  assert.match(source, /duration\)\s*>\s*200|duration\s*>\s*200/u, `${file} 未保留 >200ms 硬门`);
  assert.match(source, /evidence\.fail\(error\)/, `${file} 未记录失败`);
  assert.match(source, /evidence\.failTeardown\(error\)/, `${file} 未单列 teardown 失败`);
  assert.match(source, /closeTask350BrowserResource\(/, `${file} 未将浏览器关闭超时作为失败`);
}

const directSource = readFileSync(join(process.cwd(), "tools/webgl-generator-regeneration-lock-direct-domains-browser-regression.mjs"), "utf8");
for (const awaitedCall of [
  /unwrap\(await api\.edit\.military\.setRatios\(/,
  /unwrap\(await api\.edit\.economy\.assignCells\(/,
  /unwrap\(await api\.edit\.economy\.rebuild\(/,
  /const conflict = await api\.edit\.economy\.assignCells\(/
]) assert.match(directSource, awaitedCall, `直接领域锁门缺少异步等待：${awaitedCall}`);

const gridSource = readFileSync(join(process.cwd(), "tools/webgl-generator-grid-topology-browser-regression.mjs"), "utf8");
assert.match(gridSource, /unwrap\(await api\.history\.undo\(/, "grid topology 门未等待 undo receipt");
assert.match(gridSource, /unwrap\(await api\.history\.redo\(/, "grid topology 门未等待 redo receipt");

const sessionSource = readFileSync(join(process.cwd(), "tools/webgl-generator-worker-session-browser-regression.mjs"), "utf8");
const apiResultSource = readFileSync(join(process.cwd(), "app/webgl-generator/src/runtime/api-result.js"), "utf8");
const runtimeOperationSource = readFileSync(join(process.cwd(), "app/webgl-generator/src/runtime/runtime-operation.js"), "utf8");
const placeholderRendererSource = readFileSync(join(process.cwd(), "app/webgl-generator/src/renderer/placeholder-renderer.js"), "utf8");
assert.match(sessionSource, /await app\.mapReplicaPatchQueue;/, "session 门未等待锁命令副本 patch");
assert.match(sessionSource, /first\.data\.worker\.session\.reused !== true \|\| second\.data\.worker\.session\.reused !== true/, "session 门仍要求已采用 generation session 的首个 no-op 为 fresh");
assert.match(sessionSource, /sessionBeforeLock\.binding\?\.lockFingerprint !== sessionAfterLock\.binding\?\.lockFingerprint/, "session 门未证明锁命令已更新 session binding");
assert.match(sessionSource, /const surfaceBaseBefore = measure\("gpuHash", \(\) => window\.__task322SurfaceBaseProbe\.capture\(renderer\)\)/, "no-op 门未捕获完整 GPU before-image");
assert.match(sessionSource, /surfaceBase: surfaceBaseBefore/, "no-op identity 未保存完整 GPU before-image");
assert.match(sessionSource, /const surfaceComparison = window\.__task322SurfaceBaseProbe\.exact\(surfaceBase, identity\.surfaceBase\)/, "no-op 门未做完整 GPU before/after exact");
for (const field of ["descriptorRefs", "cpuChecksum", "gpuChecksum", "pickingExact", "cameraExact"]) {
  assert.match(sessionSource, new RegExp(`${field}:?`), `no-op 失败诊断缺少 ${field}`);
}
for (const phase of ["surfaceGpuAfterMap", "surfaceGpuAfterLockPatch", "surfaceGpuAfterNoOps"]) {
  assert.match(sessionSource, new RegExp(phase), `no-op 失败诊断缺少 ${phase}`);
}
assert.match(sessionSource, /contextLost: Boolean\(renderer\.gl\.isContextLost\?\.\(\)\)/, "no-op 失败诊断缺少 WebGL context lost 状态");

const wholeAggregateAssertions = sessionSource
  .split(/\r?\n/u)
  .filter(line => /assert\.(?:deepEqual|equal)\(/u.test(line)
    && /\.aggregate\b/u.test(line)
    && !/aggregate\.byteLength/u.test(line));
assert.deepEqual(wholeAggregateAssertions, [], "session 门仍直接比较整个 GPU aggregate；跨布局只能比较 aggregate.byteLength，GPU checksum exact 必须使用 before-image helper");
assert.doesNotMatch(sessionSource, /surfaceBase\.segments\.map\(segment => segment\.bufferRef\)/u, "session 门仍只跟踪 surface geometry legacy alias");
assert.doesNotMatch(sessionSource, /probe\.surfaceBase\.segments\.map\(segment => gl\.isBuffer\(segment\.bufferRef\)\)/u, "session 门仍只检查 baseline geometry buffer liveness");
assert.match(sessionSource, /surfaceSegmentBindings = surfaceBase\.segments\.flatMap\(segment => \[[\s\S]*?kind: "geometry"[\s\S]*?geometryBufferRef[\s\S]*?kind: "color"[\s\S]*?colorBufferRef/u, "100k surface upload 门未分别登记 geometry/color binding");
assert.match(sessionSource, /currentSurfaceRefs = new Set\(surfaceBase\.segments\.flatMap\(segment => \[[\s\S]*?geometryBufferRef[\s\S]*?colorBufferRef/u, "river surface owner 门未同时跟踪 geometry/color active refs");
assert.match(sessionSource, /baselineSurfaceValid: probe\.surfaceBase\.segments\.flatMap\(segment => \[[\s\S]*?geometryBufferRef[\s\S]*?colorBufferRef/u, "render replay 门未同时检查 geometry/color baseline liveness");
assert.match(sessionSource, /baselineValid: probe\.surfaceBase\.segments\.flatMap\(segment => \[[\s\S]*?geometryBufferRef[\s\S]*?colorBufferRef/u, "river invariant 门未同时检查 geometry/color baseline liveness");
assert.match(sessionSource, /const invalidation = \{adoptedInitial: await readWorkerSessionSnapshot\(page\)\}/u, "session continuity 门未捕获 generation adopted baseline");
for (const continuityAssertion of [
  /invalidation\.initial\.worker\.session\.reused, true/u,
  /invalidation\.afterUndo\.worker\.session\.reused, true/u,
  /invalidation\.afterLock\.worker\.session\.reused, true/u,
  /invalidation\.afterMapReplace\.worker\.session\.reused, true/u,
  /features\.worker\.session\.reused, true/u,
  /operations\[0\]\.worker\.session\.reused, true/u
]) assert.match(sessionSource, continuityAssertion, `session adopted/patch continuity 门缺失：${continuityAssertion}`);
for (const staleFreshAssertion of ["undo 后错误复用 Worker session", "锁变化后错误复用 Worker session", "替换地图后错误复用 Worker session", "hard-cell features 未建立 fresh session", "100k 首项没有建立新 session"]) {
  assert.doesNotMatch(sessionSource, new RegExp(staleFreshAssertion), `session 门仍把合法 adopted/patch continuity 当作 stale：${staleFreshAssertion}`);
}
assert.match(sessionSource, /invalidateSession\("task322-fresh-routes-diagnostic-reset"\)/u, "fresh routes 诊断未显式清除 adopted generation session");
assert.match(sessionSource, /fault\.recovered\.worker\.session\.reused, false/u, "refresh fault 后 fresh session 硬门丢失");
assert.match(sessionSource, /afterCancel\.worker\.session\.reused, false/u, "accepted cancel 后 fresh session 硬门丢失");
for (const helperGuard of [
  /function assertSessionContinuity\(before, after,[\s\S]*?after\.id, before\.id[\s\S]*?after\.binding\.mapIdentity, before\.binding\.mapIdentity[\s\S]*?after\.binding\.generationToken, before\.binding\.generationToken/u,
  /after\.binding\.mapRevision, before\.binding\.mapRevision \+ revisionDelta/u,
  /checksum === "changed"\) assert\.notEqual\(after\.checksum, before\.checksum/u,
  /lockFingerprint === "same"\) assert\.equal\(after\.binding\.lockFingerprint, before\.binding\.lockFingerprint/u,
  /lockFingerprint === "changed"\) assert\.notEqual\(after\.binding\.lockFingerprint, before\.binding\.lockFingerprint/u,
  /function assertSessionReplacement\(before, after, label\)[\s\S]*?expectedRevision: 0[\s\S]*?after\.id, before\.id[\s\S]*?after\.binding\.mapIdentity, before\.binding\.mapIdentity/u
]) assert.match(sessionSource, helperGuard, `session continuity 精确 helper 缺失：${helperGuard}`);
for (const transitionGuard of [
  /assertSessionContinuity\(invalidation\.adoptedInitial, invalidation\.afterInitial, \{[\s\S]*?revisionDelta: 1,[\s\S]*?checksum: "same",[\s\S]*?lockFingerprint: "same"/u,
  /assertSessionContinuity\(invalidation\.afterInitial, invalidation\.patchedAfterUndo, \{[\s\S]*?revisionDelta: 1,[\s\S]*?checksum: "changed",[\s\S]*?lockFingerprint: "same"/u,
  /assertSessionContinuity\(invalidation\.patchedAfterUndo, invalidation\.beforeLock, \{[\s\S]*?revisionDelta: 1,[\s\S]*?checksum: "same",[\s\S]*?lockFingerprint: "same"/u,
  /assertSessionContinuity\(invalidation\.beforeLock, invalidation\.patchedAfterLock, \{[\s\S]*?revisionDelta: 1,[\s\S]*?checksum: "changed",[\s\S]*?lockFingerprint: "changed"/u,
  /assertSessionContinuity\(invalidation\.patchedAfterLock, invalidation\.afterLockCommitted, \{[\s\S]*?revisionDelta: 1,[\s\S]*?checksum: "same",[\s\S]*?lockFingerprint: "same"/u,
  /assertSessionReplacement\(sessionBeforeMapReplace, invalidation\.adoptedReplacement/u,
  /assertSessionContinuity\(invalidation\.adoptedReplacement, invalidation\.afterMapReplaceCommitted, \{[\s\S]*?revisionDelta: 1,[\s\S]*?checksum: "same",[\s\S]*?lockFingerprint: "same"/u
]) assert.match(sessionSource, transitionGuard, `session continuity 阶段精确断言缺失：${transitionGuard}`);
assert.match(apiResultSource, /code: String\(error\.code \|\| code\)/u, "console API 未保留带 code 的结构化错误");
assert.match(runtimeOperationSource, /if \(error\?\.code && error\?\.stage && error\?\.suggestion\)[\s\S]*?new RuntimeOperationError\(String\(error\.code\)/u, "runtime operation 未保留带 stage/suggestion 的精确故障码");
const sliceAsyncFunction = signature => {
  const start = sessionSource.indexOf(`async function ${signature}`);
  assert.notEqual(start, -1, `session 门缺少函数：${signature}`);
  const next = sessionSource.indexOf("\nasync function ", start + signature.length);
  return sessionSource.slice(start, next === -1 ? sessionSource.length : next);
};
const sliceRendererMethod = (source, signature, nextSignature) => {
  const start = source.indexOf(`\n  ${signature}(`);
  assert.notEqual(start, -1, `renderer 缺少方法 ${signature}`);
  const next = source.indexOf(`\n  ${nextSignature}(`, start + signature.length);
  assert.notEqual(next, -1, `renderer 缺少后续方法 ${nextSignature}`);
  return source.slice(start, next);
};
const mutateRendererMethod = (source, signature, nextSignature, mutate) => {
  const method = sliceRendererMethod(source, signature, nextSignature);
  return source.replace(method, mutate(method));
};
const assertHardCellRendererContract = source => {
  const ast = parse(source, {sourceType: "module"});
  const hardPatch = findClassMethod(ast, "refreshHardCellSurfacePatchCells");
  const heightRefresh = findClassMethod(ast, "refreshHeightCells");

  const hardGuard = hardPatch.body.body[0];
  assert.equal(hardGuard?.type, "IfStatement", "hard-cell patch 缺少直接 guard");
  const hardTerms = flattenLogicalOr(hardGuard.test);
  assert.ok(hardTerms.some(node => node?.type === "UnaryExpression" && node.operator === "!" && nodePath(node.argument) === "this.map"), "hard-cell patch 未拒绝缺失 map");
  assert.ok(hardTerms.some(node => isBinary(node, "!==", "this.viewOptions.smoothCellBorders", false)), "hard-cell patch 未限制关闭平滑");
  assert.ok(hardTerms.some(node => isBinary(node, "!==", "this.colorMode", "height")), "hard-cell patch 未限制高度视图");
  assert.equal(hardGuard.consequent?.type, "ReturnStatement", "hard-cell guard 未直接返回");

  const heightStatements = heightRefresh.body.body;
  const nonHeight = heightStatements.find(node => node.type === "IfStatement" && flattenLogicalOr(node.test).some(term => isBinary(term, "!==", "this.colorMode", "height")));
  assert.ok(nonHeight, "refreshHeightCells 缺少非高度分支");
  const nonHeightStatements = blockStatements(nonHeight.consequent);
  assert.equal(nonHeightStatements.length, 2, "非高度分支必须只执行 full refresh 后返回");
  assertRenderFullRefreshCall(statementCall(nonHeightStatements[0]), "非高度分支");
  assert.equal(nonHeightStatements[1]?.type, "ReturnStatement", "非高度分支未直接返回");

  const zeroRange = heightStatements.find(node => node.type === "IfStatement" && node.test?.type === "UnaryExpression" && node.test.operator === "!" && nodePath(node.test.argument) === "this.surfaceCellRanges.size");
  assert.ok(zeroRange, "refreshHeightCells 缺少零 range 分支");
  const zeroStatements = blockStatements(zeroRange.consequent);
  const smoothOff = zeroStatements[0];
  assert.equal(smoothOff?.type, "IfStatement", "零 range 分支未先判断关闭平滑");
  assert.ok(isBinary(smoothOff.test, "===", "this.viewOptions.smoothCellBorders", false), "零 range 分支关闭平滑条件漂移");
  const smoothStatements = blockStatements(smoothOff.consequent);
  const patchDeclaration = smoothStatements[0]?.type === "VariableDeclaration" ? smoothStatements[0].declarations[0] : null;
  assert.equal(patchDeclaration?.id?.name, "patch", "零 range 分支未直接声明 patch receipt");
  const patchCall = patchDeclaration?.init;
  assert.equal(patchCall?.type, "CallExpression", "零 range 分支 patch receipt 不是直接调用");
  assert.equal(nodePath(patchCall?.callee), "this.refreshHardCellSurfacePatchCells", "零 range 分支未直接调用 hard-cell patch");
  assert.deepEqual(callArgumentSignatures(patchCall), ["identifier:normalizedCells", "object:draw=boolean:false"], "hard-cell patch 未使用 normalizedCells 与 draw:false");
  const patchBranch = smoothStatements[1];
  assert.equal(patchBranch?.type, "IfStatement", "hard-cell patch receipt 缺少直接成功分支");
  assert.equal(patchBranch.test?.type, "Identifier", "hard-cell patch 成功条件必须直接读取 receipt");
  assert.equal(patchBranch.test?.name, "patch", "hard-cell patch 成功条件未绑定 patch receipt");
  const patchStatements = blockStatements(patchBranch.consequent);
  assert.equal(patchStatements.length, 3, "hard-cell patch 成功分支必须只执行 rebind/draw/return");
  const rebindCall = guardedDirectCall(patchStatements[0], "binding");
  assert.equal(nodePath(rebindCall?.callee), "rebindEditedRendererResources", "hard-cell patch 成功分支未直接 rebind");
  assert.deepEqual(callArgumentSignatures(rebindCall), ["this", "identifier:binding"], "hard-cell patch rebind 参数漂移");
  const drawCall = guardedDirectCall(patchStatements[1], "draw");
  assert.equal(nodePath(drawCall?.callee), "this.draw", "hard-cell patch 成功分支未直接 draw");
  assert.deepEqual(callArgumentSignatures(drawCall), [], "hard-cell patch draw 不得带参数");
  const patchReturn = patchStatements[2];
  assert.equal(patchReturn?.type, "ReturnStatement", "hard-cell patch 成功分支未直接返回");
  assert.equal(objectBoolean(patchReturn.argument, "surfacePatch"), true, "hard-cell patch receipt 未标记 surfacePatch");
  assert.equal(objectBoolean(patchReturn.argument, "hardCells"), true, "hard-cell patch receipt 未标记 hardCells");
  assert.equal(zeroStatements.length, 3, "零 range 分支必须只执行 smooth patch、full fallback、return");
  assertRenderFullRefreshCall(statementCall(zeroStatements[1]), "hard-cell patch 失败分支");
  assert.equal(zeroStatements[2]?.type, "ReturnStatement", "hard-cell patch 失败 full fallback 后未直接返回");
};
assertHardCellRendererContract(placeholderRendererSource);
assert.throws(
  () => assertHardCellRendererContract(mutateRendererMethod(placeholderRendererSource, "refreshHeightCells", "refreshLabels", method => method.replace("const patch = this.refreshHardCellSurfacePatchCells(normalizedCells, {draw: false});", "const patch = null;"))),
  /patch receipt 不是直接调用|未直接调用 hard-cell patch/u,
  "删除 hard-cell patch 后 renderer 契约仍通过"
);
assert.throws(
  () => assertHardCellRendererContract(mutateRendererMethod(placeholderRendererSource, "refreshHeightCells", "refreshLabels", method => method.replace("if (this.viewOptions?.smoothCellBorders === false) {", "if (false) {"))),
  /关闭平滑条件漂移/u,
  "移除关闭平滑前置后 renderer 契约仍通过"
);
assert.throws(
  () => assertHardCellRendererContract(mutateRendererMethod(placeholderRendererSource, "refreshHeightCells", "refreshLabels", method => method.replace("if (patch) {", "if (false) {"))),
  /成功条件必须直接读取 receipt/u,
  "把 patch 成功条件改为 false 后 renderer 契约仍通过"
);
assert.throws(
  () => assertHardCellRendererContract(mutateRendererMethod(placeholderRendererSource, "refreshHeightCells", "refreshLabels", method => method.replace("          return {\n            incremental: true,", "          const ignoredPatchReceipt = {\n            incremental: true,"))),
  /成功分支未直接返回/u,
  "删除 patch 成功早返后 renderer 契约仍通过"
);
assert.throws(
  () => assertHardCellRendererContract(mutateRendererMethod(placeholderRendererSource, "refreshHeightCells", "refreshLabels", method => method.replace("this.refreshHardCellSurfacePatchCells(normalizedCells, {draw: false})", "this.refreshHardCellSurfacePatchCells([], {draw: true})"))),
  /未使用 normalizedCells 与 draw:false/u,
  "破坏 hard-cell patch 参数后 renderer 契约仍通过"
);
assert.throws(
  () => assertHardCellRendererContract(mutateRendererMethod(placeholderRendererSource, "refreshHeightCells", "refreshLabels", method => method.replace("this.refreshCellSurface({draw, binding});", "this.refreshCellSurface();"))),
  /full refresh 参数漂移/u,
  "破坏 full fallback 参数后 renderer 契约仍通过"
);

function findClassMethod(ast, name) {
  let result = null;
  walkAst(ast, node => {
    if (node.type === "ClassMethod" && node.key?.type === "Identifier" && node.key.name === name) result = node;
  });
  assert.ok(result, `renderer AST 缺少方法 ${name}`);
  return result;
}

function walkAst(value, visit) {
  if (!value || typeof value !== "object") return;
  if (typeof value.type === "string") visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(item => walkAst(item, visit));
    else walkAst(child, visit);
  }
}

function nodePath(node) {
  if (!node) return "";
  if (node.type === "ThisExpression") return "this";
  if (node.type === "Identifier") return node.name;
  if (["MemberExpression", "OptionalMemberExpression"].includes(node.type)) {
    const property = node.computed ? node.property?.value : node.property?.name;
    return `${nodePath(node.object)}.${String(property || "")}`;
  }
  return "";
}

function literalValue(node) {
  if (["BooleanLiteral", "StringLiteral", "NumericLiteral"].includes(node?.type)) return node.value;
  return undefined;
}

function isBinary(node, operator, leftPath, rightValue) {
  return node?.type === "BinaryExpression"
    && node.operator === operator
    && nodePath(node.left) === leftPath
    && literalValue(node.right) === rightValue;
}

function flattenLogicalOr(node) {
  if (node?.type !== "LogicalExpression" || node.operator !== "||") return [node];
  return [...flattenLogicalOr(node.left), ...flattenLogicalOr(node.right)];
}

function blockStatements(node) {
  return node?.type === "BlockStatement" ? node.body : node ? [node] : [];
}

function statementCall(statement) {
  const expression = statement?.type === "ExpressionStatement" ? statement.expression : null;
  return expression?.type === "CallExpression" ? expression : null;
}

function guardedDirectCall(statement, guardName) {
  if (statement?.type !== "IfStatement" || statement.test?.type !== "Identifier" || statement.test.name !== guardName) return null;
  return statementCall(statement.consequent);
}

function callArgumentSignatures(call) {
  if (call?.type !== "CallExpression") return null;
  return call.arguments.map(argumentSignature);
}

function argumentSignature(node) {
  if (node?.type === "ThisExpression") return "this";
  if (node?.type === "Identifier") return `identifier:${node.name}`;
  if (node?.type === "BooleanLiteral") return `boolean:${String(node.value)}`;
  if (node?.type !== "ObjectExpression") return node?.type || "missing";
  const fields = node.properties.map(property => {
    const key = property.key?.name ?? property.key?.value;
    return `${String(key)}=${argumentSignature(property.value)}`;
  });
  return `object:${fields.join(",")}`;
}

function assertRenderFullRefreshCall(call, label) {
  assert.equal(nodePath(call?.callee), "this.refreshCellSurface", `${label} 未直接 full refresh`);
  assert.deepEqual(callArgumentSignatures(call), ["object:draw=identifier:draw,binding=identifier:binding"], `${label} full refresh 参数漂移`);
}

function objectBoolean(node, propertyName) {
  if (node?.type !== "ObjectExpression") return undefined;
  const property = node.properties.find(item => item.type === "ObjectProperty" && (item.key?.name ?? item.key?.value) === propertyName);
  return literalValue(property?.value);
}

const hardCellSurfaceGate = sliceAsyncFunction("runHardCellSurfaceGate(page, cdp)");
const hundredThousandHardCellGate = sliceAsyncFunction("runHundredThousandHardCellGate(page)");
const assertHardCellHeightModeContract = (source, {label, baseline, restoreCalls}) => {
  assert.match(source, /originalPreferences = \{\s*colorMode: (?:app\.)?renderer\.colorMode,/u, `${label} 未保存原视图模式`);
  assert.match(source, /await api\.layers\.setViewMode\("height"\)/u, `${label} 未在 hard-cell 操作前固定高度视图`);
  assert.match(source, new RegExp(`assert\\.equal\\(${baseline}\\.colorMode, "height"`), `${label} 未断言高度视图基线`);
  assert.ok((source.match(/colorMode: renderer\.colorMode/gu) || []).length >= 2, `${label} 未在两次高度编辑后回读视图模式`);
  assert.ok((source.match(/await api\.layers\.setViewMode\(probe\.originalPreferences\.colorMode\)/gu) || []).length >= restoreCalls, `${label} 未完整恢复原视图模式`);
};
assertHardCellHeightModeContract(hardCellSurfaceGate, {label: "10k hard-cell", baseline: "baseline", restoreCalls: 2});
assertHardCellHeightModeContract(hundredThousandHardCellGate, {label: "100k hard-cell", baseline: "setup", restoreCalls: 1});
for (const [source, options] of [
  [hardCellSurfaceGate, {label: "10k hard-cell", baseline: "baseline", restoreCalls: 2}],
  [hundredThousandHardCellGate, {label: "100k hard-cell", baseline: "setup", restoreCalls: 1}]
]) {
  assert.throws(
    () => assertHardCellHeightModeContract(source.replace(/await api\.layers\.setViewMode\("height"\)/u, "Promise.resolve({ok: true})"), options),
    /未在 hard-cell 操作前固定高度视图/u,
    `${options.label} 删除高度视图前置后静态反例仍通过`
  );
  assert.throws(
    () => assertHardCellHeightModeContract(source.replaceAll("await api.layers.setViewMode(probe.originalPreferences.colorMode)", "Promise.resolve({ok: true})"), options),
    /未完整恢复原视图模式/u,
    `${options.label} 删除原视图恢复后静态反例仍通过`
  );
}
const routePendingFaultGate = sliceAsyncFunction("runRoutePendingFaultGate(page)");
const pendingViewportGate = sliceAsyncFunction("runPendingViewportGate(page)");
const refreshFaultExpectation = sliceAsyncFunction("expectRefreshFault(page, label)");
const sharedRefreshFaultHelper = sliceAsyncFunction("evaluateRegenerationWithRawError(page, kind)");
const assertRefreshFaultWrapperRestores = (sharedHelper, pendingGate) => {
  assert.match(sharedHelper, /const runtimeGenerate = app\.runtimeActions\?\.generate;[\s\S]*?let wrapperCalls = 0;[\s\S]*?runtimeGenerate\.regenerate = async function\(\.\.\.args\) \{\s*wrapperCalls \+= 1;[\s\S]*?rawError = serialize\(error\)[\s\S]*?try\s*\{\s*const response = await window\.webglGeneratorApi\.generate\.regenerate\(targetKind, \{confirm: true\}\);\s*return \{response, rawError, wrapperCalls\};\s*\}\s*finally\s*\{\s*runtimeGenerate\.regenerate = originalRegenerate;\s*\}/u, "共享 refresh fault action wrapper 未完整计数并在 finally 恢复");
  assert.match(pendingGate, /const runtimeGenerate = app\.runtimeActions\?\.generate;[\s\S]*?let wrapperCalls = 0;[\s\S]*?runtimeGenerate\.regenerate = async function\(\.\.\.args\) \{\s*wrapperCalls \+= 1;[\s\S]*?rawError = serialize\(error\)[\s\S]*?let response;\s*try\s*\{\s*response = await window\.webglGeneratorApi\.generate\.regenerate\("markers", \{confirm: true\}\);\s*\}\s*finally\s*\{\s*runtimeGenerate\.regenerate = originalRegenerate;\s*\}/u, "pending viewport refresh fault action wrapper 未完整计数并在 finally 恢复");
};
assertRefreshFaultWrapperRestores(sharedRefreshFaultHelper, pendingViewportGate);
assert.throws(
  () => assertRefreshFaultWrapperRestores(sharedRefreshFaultHelper.replace(/finally\s*\{\s*runtimeGenerate\.regenerate = originalRegenerate;\s*\}/u, ""), pendingViewportGate),
  /共享 refresh fault action wrapper 未完整计数并在 finally 恢复/u,
  "删除共享 helper finally 后静态反例仍通过"
);
assert.throws(
  () => assertRefreshFaultWrapperRestores(sharedRefreshFaultHelper, pendingViewportGate.replace(/finally\s*\{\s*runtimeGenerate\.regenerate = originalRegenerate;\s*\}/u, "")),
  /pending viewport refresh fault action wrapper 未完整计数并在 finally 恢复/u,
  "删除 pending viewport finally 后静态反例仍通过"
);
for (const [source, refreshFaultContract, label] of [
  [routePendingFaultGate, /evaluateRegenerationWithRawError\(page, "routes"\)[\s\S]*?response\?\.error\?\.code, "worker_regeneration_refresh_fault"[\s\S]*?wrapperCalls, 1[\s\S]*?errorTreeHasCode\(rawError, "worker_regeneration_refresh_fault"\)[\s\S]*?JSON\.stringify\(rawError\)/u, "routes"],
  [refreshFaultExpectation, /evaluateRegenerationWithRawError\(page, "rivers"\)[\s\S]*?response\?\.error\?\.code, "worker_regeneration_refresh_fault"[\s\S]*?wrapperCalls, 1[\s\S]*?errorTreeHasCode\(rawError, "worker_regeneration_refresh_fault"\)[\s\S]*?JSON\.stringify\(rawError\)/u, "rivers"],
  [pendingViewportGate, /started\.response\?\.error\?\.code, "worker_regeneration_refresh_fault"[\s\S]*?started\.wrapperCalls, 1[\s\S]*?errorTreeHasCode\(started\.rawError, "worker_regeneration_refresh_fault"\)[\s\S]*?JSON\.stringify\(started\.rawError\)/u, "pending viewport"]
]) {
  assert.match(source, refreshFaultContract, `${label} refresh fault public/cause 诊断契约缺失`);
  assert.throws(
    () => assert.match(source.replace(/"worker_regeneration_refresh_fault"/u, '"operation_failed"'), refreshFaultContract),
    assert.AssertionError,
    `把 ${label} 公开 refresh fault code 退回 operation_failed 后静态反例仍通过`
  );
  assert.throws(
    () => assert.match(source.replace(/JSON\.stringify\((?:started\.)?rawError\)/u, "null"), refreshFaultContract),
    assert.AssertionError,
    `删除 ${label} raw error tree 后静态反例仍通过`
  );
}
assert.throws(
  () => assertRefreshFaultWrapperRestores(sharedRefreshFaultHelper.replace(/wrapperCalls \+= 1;/u, ""), pendingViewportGate),
  /共享 refresh fault action wrapper 未完整计数并在 finally 恢复/u,
  "删除共享 helper wrapperCalls 增量后静态反例仍通过"
);
assert.throws(
  () => assertRefreshFaultWrapperRestores(sharedRefreshFaultHelper, pendingViewportGate.replace(/wrapperCalls \+= 1;/u, "")),
  /pending viewport refresh fault action wrapper 未完整计数并在 finally 恢复/u,
  "删除 pending viewport wrapperCalls 增量后静态反例仍通过"
);

console.log(JSON.stringify({ok: true, success: successPaths, failure: failurePaths, dualFailure: dualFailurePaths, teardownOnly: teardownOnlyPaths}, null, 2));
