#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parse} from "@babel/parser";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {computeCanonicalMapReplicaChecksum} from "../app/webgl-generator/src/runtime/map-replica-checksum.js";

const appUrl = new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url);
const appSource = readFileSync(appUrl, "utf8");
const appAst = parse(appSource, {sourceType: "module", plugins: ["importAttributes"]});

const setThemeSource = functionSource("setRuntimeVisualTheme");
const applyThemeSource = functionSource("applyRuntimeVisualThemeState");
for (const [name, source] of [["setRuntimeVisualTheme", setThemeSource], ["applyRuntimeVisualThemeState", applyThemeSource]]) {
  assert.doesNotMatch(source, /syncMapVisualThemeStore/u, `${name} 不得把 live theme intent 写入 canonical map`);
  assert.doesNotMatch(source, /state\.map(?:Revision)?|editHistory|mapWorkerCoordinator/u, `${name} 不得推进或改写地图 owner`);
}

assertDisplayCommitGuard(appSource);
const oldGuardMutation = appSource.replace(
  "if (intent.isCurrent() && !(state.renderer?.workerRenderInstallSuspended > 0)) restoreRuntimeDisplayControls(state, documentRef);",
  "if (intent.isCurrent()) restoreRuntimeDisplayControls(state, documentRef);"
);
assert.notEqual(oldGuardMutation, appSource, "未建立旧 onCommitted guard 反例");
assert.throws(() => assertDisplayCommitGuard(oldGuardMutation), /renderer 暂停期间不得用旧 renderer 状态覆盖已接受的 display intent/u);
const decoyMutation = oldGuardMutation.replace(
  "    if (state.renderer?.workerRenderInstallSuspended > 0 && !activeName.startsWith(\"layers.\")) {",
  `    const guardedDecoy = () => {
      const onCommitted = () => {
        if (intent.isCurrent() && !(state.renderer?.workerRenderInstallSuspended > 0)) restoreRuntimeDisplayControls(state, documentRef);
      };
      return onCommitted;
    };
    if (state.renderer?.workerRenderInstallSuspended > 0 && !activeName.startsWith("layers.")) {`
);
assert.notEqual(decoyMutation, oldGuardMutation, "未建立未调用 guarded closure 反例");
assert.throws(() => assertDisplayCommitGuard(decoyMutation), /renderer 暂停期间不得用旧 renderer 状态覆盖已接受的 display intent/u);

assertSuspendedThemeGpuPath(appSource);
const oldThemeGpuMutation = appSource.replace(
  "const useGpuResident = gpuResident && !(state.renderer?.workerRenderInstallSuspended > 0);",
  "const useGpuResident = gpuResident;"
);
assert.notEqual(oldThemeGpuMutation, appSource, "未建立暂停期主题 GPU 直写反例");
assert.throws(() => assertSuspendedThemeGpuPath(oldThemeGpuMutation), /renderer 暂停期间主题不得走 GPU resident 直写/u);
const themeGpuDecoyMutation = oldThemeGpuMutation.replace(
  "  return measureHealthOperation(state, \"set-visual-theme\", {visualTheme: nextThemeId}, () => {",
  `  const unusedThemeGpuGuard = () => {
    const useGpuResident = gpuResident && !(state.renderer?.workerRenderInstallSuspended > 0);
    return useGpuResident;
  };
  return measureHealthOperation(state, "set-visual-theme", {visualTheme: nextThemeId}, () => {`
);
assert.notEqual(themeGpuDecoyMutation, oldThemeGpuMutation, "未建立未调用主题 GPU guard decoy 反例");
assert.throws(() => assertSuspendedThemeGpuPath(themeGpuDecoyMutation), /renderer 暂停期间主题不得走 GPU resident 直写/u);

for (const name of [
  "setRuntimeViewMode",
  "setRuntimeLayerVisible",
  "setRuntimeLayersVisible",
  "setRuntimeOceanHeightVisible",
  "setRuntimeSmoothCellBorders",
  "setRuntimeHoverInfoVisible",
  "setRuntimeMaxCityLabels"
]) {
  const source = functionSource(name);
  assert.doesNotMatch(source, /mapRevision\.(?:advance|replaceMap)|editHistory\.(?:execute|undo|redo)|mapWorkerCoordinator\.run/u, `${name} 不得形成 core/history/Worker map input`);
}

const map = generatePlaceholderMap({seed: "task-350-r4a-presentation-contract", cellsTarget: 1000, heightmapTemplate: "continents"});
const sourceTheme = String(map.visualTheme?.preset || map.options?.visualTheme || "default");
const targetTheme = sourceTheme === "ancient" ? "default" : "ancient";
const sourceChecksumBefore = await computeCanonicalMapReplicaChecksum(map, {revision: 0, yieldToMain: async () => {}});
const sourceSnapshot = structuredClone(map);
const document = createMapDocument(map, {...map.options, visualTheme: targetTheme});
const sourceChecksumAfter = await computeCanonicalMapReplicaChecksum(map, {revision: 0, yieldToMain: async () => {}});

assert.deepEqual(map, sourceSnapshot, "存档投影不得回写运行中的 canonical map");
assert.equal(sourceChecksumAfter, sourceChecksumBefore, "存档投影不得改变当前 Worker replica checksum");
assert.notEqual(document.map, map, "存档投影必须使用独立 map document");
assert.equal(document.options.visualTheme, targetTheme, "document options 未保存 live theme intent");
assert.equal(document.map.options.visualTheme, targetTheme, "map options 未投影 live theme intent");
assert.equal(document.map.visualTheme.preset, targetTheme, "visualTheme store 未投影 live theme intent");

console.log(JSON.stringify({
  ok: true,
  displayFunctions: 9,
  sourceTheme,
  targetTheme,
  sourceChecksumStable: sourceChecksumAfter === sourceChecksumBefore,
  suspendedIntentPreserved: true,
  suspendedIntentMutations: 2,
  suspendedThemeGpuDeferred: true,
  suspendedThemeGpuMutations: 2,
  documentProjection: {
    options: document.options.visualTheme,
    mapOptions: document.map.options.visualTheme,
    preset: document.map.visualTheme.preset
  }
}, null, 2));

function functionSource(name) {
  const node = findFunction(appAst.program, name);
  assert(node, `缺少函数 ${name}`);
  return appSource.slice(node.start, node.end);
}

function findFunction(root, name) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "FunctionDeclaration" && node.id?.name === name) return node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === "object" && typeof value.type === "string") stack.push(value);
    }
  }
  return null;
}

function assertDisplayCommitGuard(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["importAttributes"]});
  const initializer = findVariableInitializer(ast.program, "runDisplayMutation");
  assert.equal(initializer?.type, "ArrowFunctionExpression", "缺少 runDisplayMutation arrow");
  assert.equal(initializer.body?.type, "CallExpression", "runDisplayMutation 未直接返回 display intent queue");
  assert.equal(memberPath(initializer.body.callee), "displayIntents.run", "runDisplayMutation 未调用 displayIntents.run");
  const callback = initializer.body.arguments?.[0];
  assert.equal(callback?.type, "ArrowFunctionExpression", "displayIntents.run 缺少直接回调");
  assert.equal(callback.params?.[0]?.type, "Identifier", "display intent 回调参数无效");
  assert.equal(callback.params[0].name, "intent", "display intent 回调参数必须为 intent");
  assert.equal(callback.body?.type, "BlockStatement", "display intent 回调缺少直接函数体");
  const declarations = callback.body.body
    .filter(statement => statement.type === "VariableDeclaration")
    .flatMap(statement => statement.declarations)
    .filter(declaration => declaration.id?.type === "Identifier" && declaration.id.name === "onCommitted");
  assert.equal(declarations.length, 1, "display intent 回调必须且只能直接声明一个 onCommitted");
  const committed = declarations[0].init;
  assert.equal(committed?.type, "ArrowFunctionExpression", "onCommitted 必须为直接 arrow");
  assert.equal(committed.body?.type, "BlockStatement", "onCommitted 缺少直接函数体");
  assert.equal(committed.body.body.length, 1, "onCommitted 只能包含唯一 guard");
  const guard = committed.body.body[0];
  const validCurrent = guard?.test?.type === "LogicalExpression"
    && guard.test.operator === "&&"
    && guard.test.left?.type === "CallExpression"
    && memberPath(guard.test.left.callee) === "intent.isCurrent"
    && guard.test.left.arguments.length === 0;
  const suspended = guard?.test?.right;
  const validSuspended = suspended?.type === "UnaryExpression"
    && suspended.operator === "!"
    && suspended.argument?.type === "BinaryExpression"
    && suspended.argument.operator === ">"
    && memberPath(suspended.argument.left) === "state.renderer.workerRenderInstallSuspended"
    && suspended.argument.right?.type === "NumericLiteral"
    && suspended.argument.right.value === 0;
  const consequence = guard?.consequent;
  const restore = consequence?.type === "ExpressionStatement" ? consequence.expression : null;
  const validRestore = guard?.type === "IfStatement"
    && guard.alternate == null
    && restore?.type === "CallExpression"
    && restore.callee?.type === "Identifier"
    && restore.callee.name === "restoreRuntimeDisplayControls"
    && restore.arguments.length === 2
    && restore.arguments[0]?.type === "Identifier"
    && restore.arguments[0].name === "state"
    && restore.arguments[1]?.type === "Identifier"
    && restore.arguments[1].name === "documentRef";
  assert.ok(validCurrent && validSuspended && validRestore, "renderer 暂停期间不得用旧 renderer 状态覆盖已接受的 display intent");
}

function assertSuspendedThemeGpuPath(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["importAttributes"]});
  const theme = findFunction(ast.program, "setRuntimeVisualTheme");
  assert.equal(theme?.body?.type, "BlockStatement", "缺少 setRuntimeVisualTheme 函数体");
  const declarations = theme.body.body
    .filter(statement => statement.type === "VariableDeclaration")
    .flatMap(statement => statement.declarations)
    .filter(declaration => declaration.id?.type === "Identifier" && declaration.id.name === "useGpuResident");
  assert.equal(declarations.length, 1, "setRuntimeVisualTheme 必须直接声明唯一 useGpuResident");
  const guard = declarations[0].init;
  const suspended = guard?.right;
  const validGuard = guard?.type === "LogicalExpression"
    && guard.operator === "&&"
    && guard.left?.type === "Identifier"
    && guard.left.name === "gpuResident"
    && suspended?.type === "UnaryExpression"
    && suspended.operator === "!"
    && suspended.argument?.type === "BinaryExpression"
    && suspended.argument.operator === ">"
    && memberPath(suspended.argument.left) === "state.renderer.workerRenderInstallSuspended"
    && suspended.argument.right?.type === "NumericLiteral"
    && suspended.argument.right.value === 0;
  const returned = theme.body.body.find(statement => statement.type === "ReturnStatement");
  const measure = returned?.argument;
  const callback = measure?.type === "CallExpression" && measure.arguments?.[3];
  const applied = callback?.type === "ArrowFunctionExpression" && callback.body?.type === "BlockStatement"
    ? callback.body.body
      .filter(statement => statement.type === "VariableDeclaration")
      .flatMap(statement => statement.declarations)
      .find(declaration => declaration.id?.type === "Identifier" && declaration.id.name === "applied")
    : null;
  const applyCall = applied?.init;
  const options = applyCall?.type === "CallExpression" && applyCall.callee?.type === "Identifier"
    && applyCall.callee.name === "applyRuntimeVisualThemeState"
    ? applyCall.arguments?.[3]
    : null;
  const gpuProperty = options?.type === "ObjectExpression"
    ? options.properties.find(property => property.type === "ObjectProperty" && property.key?.type === "Identifier" && property.key.name === "gpuResident")
    : null;
  const validUse = gpuProperty?.value?.type === "Identifier" && gpuProperty.value.name === "useGpuResident";
  assert.ok(validGuard && validUse, "renderer 暂停期间主题不得走 GPU resident 直写");
}

function memberPath(node) {
  if (node?.type === "Identifier") return node.name;
  if ((node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") && !node.computed && node.property?.type === "Identifier") {
    const object = memberPath(node.object);
    return object ? `${object}.${node.property.name}` : "";
  }
  return "";
}

function findVariableInitializer(root, name) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "VariableDeclarator" && node.id?.name === name) return node.init;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === "object" && typeof value.type === "string") stack.push(value);
    }
  }
  return null;
}
