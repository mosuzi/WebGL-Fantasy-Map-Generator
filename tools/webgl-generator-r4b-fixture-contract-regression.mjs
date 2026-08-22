#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parse} from "@babel/parser";

const files = {
  heightmap: new URL("./webgl-generator-heightmap-export-browser-regression.mjs", import.meta.url),
  png: new URL("./webgl-generator-png-crop-browser-regression.mjs", import.meta.url),
  context: new URL("./webgl-generator-context-restore-browser-regression.mjs", import.meta.url)
};
const sources = Object.fromEntries(Object.entries(files).map(([name, url]) => [name, readFileSync(url, "utf8")]));
const stateFlows = {
  heightmap: [["final", "state"], ["apiRun", "before"]],
  png: [["final", "state"], ["before"]],
  context: [["evaluation", "before", "state"], ["evaluation", "after", "state"]]
};

for (const [name, source] of Object.entries(sources)) {
  assertFixture(source, name, stateFlows[name]);
  assertMutationFails(() => assertFixture(source.replace("cellsTarget: 10_000", "cellsTarget: 3_000"), name, stateFlows[name]), /代表性 10k newMap/u, `${name} 降为 3k`);
  assertMutationFails(() => assertFixture(source.replace("evidence.persist();", "if (false) evidence.persist();"), name, stateFlows[name]), /finally 直接持久化/u, `${name} 不可达 persist`);
  assertMutationFails(() => assertFixture(source.replace("task.duration > 200", "task.duration > 500"), name, stateFlows[name]), />200ms LongTask/u, `${name} 放宽 LongTask`);
  assertMutationFails(() => assertFixture(wrapDirectLine(source, "assert.equal(stateExact, true"), name, stateFlows[name]), /stateExact 直接硬断言/u, `${name} 不可达 stateExact`);
  assertMutationFails(() => assertFixture(moveNewMapIntoUnusedFunction(source), name, stateFlows[name]), /直接执行唯一 newMap/u, `${name} 未调用 newMap`);
  assertMutationFails(() => assertFixture(moveNewMapIntoFalseBranch(source), name, stateFlows[name]), /直接执行唯一 newMap/u, `${name} 不可达 newMap`);
  assertMutationFails(() => assertFixture(source.replace("assert.deepEqual(overBudget, []);", "assert.deepEqual([], []);"), name, stateFlows[name]), /overBudget 直接硬断言/u, `${name} 错误 overBudget 数据流`);
}
assertContextFixture(sources.context);
assertMutationFails(() => assertContextFixture(moveContextRestoreIntoUnusedFunction(sources.context)), /直接执行 debug.simulateContextLoss/u, "context 未调用 restore hook");
assertMutationFails(() => assertContextFixture(moveContextRestoreIntoFalseBranch(sources.context)), /直接执行 debug.simulateContextLoss/u, "context 不可达 restore hook");
assertMutationFails(() => assertContextFixture(wrapDirectLine(sources.context, "assert.equal(beforeOwnersAligned, true")), /beforeOwnersAligned 直接硬断言/u, "context 不可达 before owner 断言");
assertMutationFails(() => assertContextFixture(sources.context.replace("evaluation.receipt.beforeBinding));", "evaluation.receipt.afterBinding));")), /beforeBinding/u, "context before owner 错绑 after binding");
assertMutationFails(() => assertContextFixture(sources.context.replace("assert.equal(ownersAligned, true);", "void ownersAligned;")), /ownersAligned 直接硬断言/u, "context 删除 after owner 断言");
assertMutationFails(() => assertContextFixture(sources.context.replace("assert.equal(pickExact, true);", "void pickExact;")), /pickExact 直接硬断言/u, "context 删除 picking 断言");
assertMutationFails(() => assertContextFixture(sources.context.replace("renderer.worldToScreen(city.x, city.y, rect)", "renderer.worldToScreen(city.x, city.y)")), /worldToScreen 必须消费 canvas rect/u, "context picking 漏传 canvas rect");
assertMutationFails(() => assertContextFixture(sources.context.replace("renderer.pickClientPoint(rect.left + point.x, rect.top + point.y)", "renderer.pickClientPoint(point.x, point.y)")), /pickClientPoint 必须复用 canvas rect 与投影点/u, "context picking 漏掉 client rect offset");

console.log(JSON.stringify({
  ok: true,
  fixtures: Object.keys(files),
  scale: "10k",
  artifact: "full-summary-finally",
  hardLongTaskMs: 200,
  contextHook: "debug.simulateContextLoss",
  mutationCases: 29
}, null, 2));

function assertFixture(source, name, expectedStateFlows) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const ownerTry = ast.program.body.find(node => node.type === "TryStatement" && node.handler && node.finalizer);
  assert.ok(ownerTry, `${name} 缺少顶层 try/catch/finally`);
  const tryStatements = ownerTry.block.body;
  const catchStatements = ownerTry.handler.body.body;
  const finallyStatements = ownerTry.finalizer.body;

  assert.ok(hasDirectCall(catchStatements, "evidence.fail"), `${name} catch 未直接记录功能首败`);
  assert.ok(hasDirectCall(finallyStatements, "evidence.persist"), `${name} 未在 finally 直接持久化 artifact`);
  assert.ok(hasDirectCall(tryStatements, "evidence.setResult"), `${name} 缺少直接 full/compact result`);
  assert.ok(hasDirectCall(tryStatements, "evidence.succeed"), `${name} 缺少直接成功终态`);
  assertTeardownLoop(ownerTry.finalizer, name);
  assert.equal(collect(ownerTry.finalizer, node => node.type === "CallExpression" && callName(node.callee) === "Promise.race").length, 0, `${name} server teardown 不得自吞超时`);

  const allCalls = collect(ast.program, node => node.type === "CallExpression");
  assert.ok(allCalls.some(call => callName(call.callee) === "createTask350BrowserArtifact"), `${name} 缺少 Task 350 artifact`);
  const newMapCalls = allCalls.filter(call => callName(call.callee).endsWith("generate.newMap"));
  assert.equal(newMapCalls.length, 1, `${name} 必须且只能声明一次 fixture map`);
  const evaluation = findDirectEvaluationWithCall(tryStatements, "api.generate.newMap");
  assert.ok(evaluation, `${name} page.evaluate 未直接执行唯一 newMap`);
  assert.equal(evaluation.targetCall, newMapCalls[0], `${name} 唯一 newMap 不在 page.evaluate 直接语句`);
  const newMapOptions = newMapCalls[0].arguments[0];
  const cellsTarget = newMapOptions?.type === "ObjectExpression" ? newMapOptions.properties.find(property => property.type === "ObjectProperty" && propertyName(property.key) === "cellsTarget")?.value : null;
  assert.equal(cellsTarget?.type === "NumericLiteral" ? cellsTarget.value : NaN, 10_000, `${name} 缺少代表性 10k newMap`);

  const overBudget = findDirectVariable(tryStatements, "overBudget");
  assert.ok(isDurationFilter(overBudget?.init, 200), `${name} 缺少直接 >200ms LongTask 数据流`);
  assertDirectAssertion(tryStatements, "deepEqual", "overBudget", `${name} 缺少 overBudget 直接硬断言`);
  const stateExact = findDirectVariable(tryStatements, "stateExact");
  assert.equal(stateExact?.init?.type, "BinaryExpression", `${name} stateExact 不是直接比较`);
  assert.equal(stateExact?.init?.operator, "===", `${name} stateExact 必须严格比较`);
  for (const path of expectedStateFlows) {
    const present = path.length === 1 ? containsIdentifier(stateExact.init, path[0]) : containsMember(stateExact.init, path);
    assert.ok(present, `${name} stateExact 缺少 ${path.join(".")} 数据流`);
  }
  assertDirectAssertion(tryStatements, "equal", "stateExact", `${name} 缺少 stateExact 直接硬断言`, true);
  assertDirectAssertion(tryStatements, "deepEqual", "applicationErrors", `${name} 缺少 applicationErrors 直接硬断言`);
  assertDirectAssertion(tryStatements, "deepEqual", "pageErrors", `${name} 缺少 pageErrors 直接硬断言`);
}

function assertContextFixture(source) {
  const ast = parse(source, {sourceType: "module", plugins: ["topLevelAwait"]});
  const ownerTry = ast.program.body.find(node => node.type === "TryStatement" && node.handler && node.finalizer);
  assert.ok(ownerTry, "context fixture 缺少顶层 owner try");
  const tryStatements = ownerTry.block.body;
  const calls = collect(ast.program, node => node.type === "CallExpression");
  const restoreCalls = calls.filter(call => callName(call.callee) === "api.debug.simulateContextLoss");
  assert.equal(restoreCalls.length, 1, "context fixture 必须且只能声明一次 debug.simulateContextLoss");
  const evaluation = findDirectEvaluationWithCall(tryStatements, "api.debug.simulateContextLoss");
  assert.ok(evaluation && evaluation.targetCall === restoreCalls[0], "context fixture page.evaluate 未直接执行 debug.simulateContextLoss");
  assert.equal(calls.filter(call => callName(call.callee) === "page.reload").length, 0, "context fixture 不得刷新页面");
  const worldToScreenCalls = calls.filter(call => callName(call.callee) === "renderer.worldToScreen");
  assert.equal(worldToScreenCalls.length, 1, "context fixture 必须且只能声明一次 city worldToScreen");
  assert.equal(worldToScreenCalls[0].arguments.length, 3, "context worldToScreen 必须消费 canvas rect");
  assert.equal(worldToScreenCalls[0].arguments[2]?.type, "Identifier", "context worldToScreen 第三参必须是 canvas rect 标识符");
  assert.equal(worldToScreenCalls[0].arguments[2]?.name, "rect", "context worldToScreen 必须复用 picking 的 canvas rect");
  const pickClientPointCalls = calls.filter(call => callName(call.callee) === "renderer.pickClientPoint");
  assert.equal(pickClientPointCalls.length, 1, "context fixture 必须且只能声明一次 city pickClientPoint");
  assert.ok(isMemberAddition(pickClientPointCalls[0].arguments[0], "rect.left", "point.x"), "context pickClientPoint 必须复用 canvas rect 与投影点的横坐标");
  assert.ok(isMemberAddition(pickClientPointCalls[0].arguments[1], "rect.top", "point.y"), "context pickClientPoint 必须复用 canvas rect 与投影点的纵坐标");

  const ownerFactory = findDirectVariable(evaluation.bodyStatements, "owners");
  const familyArray = collect(ownerFactory?.init, node => node.type === "ArrayExpression")
    .map(node => node.elements.map(element => element?.value))
    .find(values => values.includes("line"));
  assert.deepEqual(familyArray, ["line", "point", "route", "river", "tradeFlow", "selection"], "context fixture 六族 cache owner 集合漂移");

  const beforeValues = findDirectVariable(tryStatements, "beforeOwnerValues");
  for (const path of [["evaluation", "before", "owners", "surface"], ["evaluation", "before", "owners", "caches"], ["evaluation", "before", "owners", "picking"], ["evaluation", "before", "owners", "label"], ["evaluation", "before", "owners", "overlay"]]) {
    assert.ok(containsMember(beforeValues?.init, path), `context before owner 集合缺少 ${path.at(-1)}`);
  }
  const beforeAligned = findDirectVariable(tryStatements, "beforeOwnersAligned");
  assert.ok(containsIdentifier(beforeAligned?.init, "beforeOwnerValues"), "context before owner 校验未消费 beforeOwnerValues");
  assert.ok(containsMember(beforeAligned?.init, ["evaluation", "receipt", "beforeBinding"]), "context before owner 校验未绑定 beforeBinding");
  assert.ok(containsNullRejection(beforeAligned?.init), "context before owner 校验未拒绝缺失 owner");
  const afterAligned = findDirectVariable(tryStatements, "ownersAligned");
  assert.ok(containsIdentifier(afterAligned?.init, "ownerValues"), "context after owner 校验未消费 ownerValues");
  assert.ok(containsMember(afterAligned?.init, ["evaluation", "receipt", "afterBinding"]), "context after owner 校验未绑定 afterBinding");

  assertDirectAssertion(tryStatements, "equal", "beforeOwnersAligned", "context fixture 缺少 beforeOwnersAligned 直接硬断言", true);
  assertDirectAssertion(tryStatements, "equal", "ownersAligned", "context fixture 缺少 ownersAligned 直接硬断言", true);
  assertDirectAssertion(tryStatements, "equal", "pickExact", "context fixture 缺少 pickExact 直接硬断言", true);
  const drawAssertion = directStatementCalls(tryStatements).find(call => callName(call.callee) === "assert.equal" && containsMember(call.arguments[0], ["compact", "drawDelta"]));
  assert.ok(drawAssertion && drawAssertion.arguments[1]?.type === "NumericLiteral" && drawAssertion.arguments[1].value === 1, "context fixture 缺少唯一 draw delta 直接硬断言");
}

function assertTeardownLoop(finalizer, name) {
  const loop = finalizer.body.find(node => node.type === "ForOfStatement");
  assert.ok(loop?.body?.type === "BlockStatement", `${name} finally 缺少 teardown loop`);
  const closeTry = loop.body.body.find(node => node.type === "TryStatement" && node.handler);
  assert.ok(closeTry, `${name} teardown loop 缺少失败捕获`);
  assert.ok(hasDirectCall(closeTry.block.body, "closeTask350BrowserResource"), `${name} teardown 未直接使用共享限时关闭`);
  assert.ok(hasDirectCall(closeTry.handler.body.body, "evidence.failTeardown"), `${name} teardown 失败未直接写 artifact`);
}

function findDirectEvaluationWithCall(statements, targetName) {
  for (const statement of statements) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      const call = awaitedCall(declaration.init);
      if (!call || callName(call.callee) !== "page.evaluate") continue;
      const callback = call.arguments[0];
      if (!callback || !["ArrowFunctionExpression", "FunctionExpression"].includes(callback.type) || callback.body.type !== "BlockStatement") continue;
      const targetCall = findDirectUnwrapAwaitCall(callback.body.body, targetName);
      if (targetCall) return {call, callback, bodyStatements: callback.body.body, targetCall};
    }
  }
  return null;
}

function findDirectUnwrapAwaitCall(statements, targetName) {
  for (const statement of statements) {
    const expressions = statement.type === "ExpressionStatement"
      ? [statement.expression]
      : statement.type === "VariableDeclaration" ? statement.declarations.map(declaration => declaration.init) : [];
    for (const expression of expressions) {
      if (expression?.type !== "CallExpression" || callName(expression.callee) !== "unwrap") continue;
      const target = awaitedCall(expression.arguments[0]);
      if (target && callName(target.callee) === targetName) return target;
    }
  }
  return null;
}

function awaitedCall(node) {
  return node?.type === "AwaitExpression" && node.argument?.type === "CallExpression" ? node.argument : null;
}

function findDirectVariable(statements, name) {
  for (const statement of statements) {
    if (statement.type !== "VariableDeclaration") continue;
    const declaration = statement.declarations.find(item => item.id?.type === "Identifier" && item.id.name === name);
    if (declaration) return declaration;
  }
  return null;
}

function isDurationFilter(node, budget) {
  if (node?.type !== "CallExpression" || !callName(node.callee).endsWith(".filter")) return false;
  const callback = node.arguments[0];
  if (!callback || !["ArrowFunctionExpression", "FunctionExpression"].includes(callback.type)) return false;
  const expression = callback.body.type === "BlockStatement"
    ? callback.body.body.find(statement => statement.type === "ReturnStatement")?.argument
    : callback.body;
  return expression?.type === "BinaryExpression"
    && expression.operator === ">"
    && expression.right?.type === "NumericLiteral"
    && expression.right.value === budget
    && containsMember(expression.left, [callback.params[0]?.name || "task", "duration"]);
}

function assertDirectAssertion(statements, method, identifier, message, expectedTrue = false) {
  const assertion = directStatementCalls(statements).find(call => callName(call.callee) === `assert.${method}` && call.arguments[0]?.type === "Identifier" && call.arguments[0].name === identifier);
  assert.ok(assertion, message);
  if (expectedTrue) assert.equal(assertion.arguments[1]?.type === "BooleanLiteral" && assertion.arguments[1].value, true, `${message} 必须与 true 比较`);
  else assert.equal(assertion.arguments[1]?.type === "ArrayExpression" && assertion.arguments[1].elements.length, 0, `${message} 必须与空数组比较`);
}

function directStatementCalls(statements) {
  return statements.map(directExpressionCall).filter(Boolean);
}

function hasDirectCall(statements, name) {
  return statements.some(statement => directExpressionCall(statement) && callName(directExpressionCall(statement).callee) === name);
}

function directExpressionCall(statement) {
  if (statement?.type !== "ExpressionStatement") return null;
  let expression = statement.expression;
  while (["AwaitExpression", "TSAsExpression", "ParenthesizedExpression"].includes(expression?.type)) expression = expression.expression || expression.argument;
  return expression?.type === "CallExpression" ? expression : null;
}

function collect(root, predicate) {
  const matches = [];
  walk(root, node => predicate(node) && matches.push(node));
  return matches;
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  if (typeof value.type === "string") visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(item => walk(item, visit));
    else walk(child, visit);
  }
}

function callName(callee) {
  if (!callee) return "";
  if (callee.type === "Identifier") return callee.name;
  if (callee.type !== "MemberExpression" && callee.type !== "OptionalMemberExpression") return "";
  const object = callName(callee.object);
  const property = callee.computed ? callee.property?.value : callee.property?.name;
  return [object, property].filter(Boolean).join(".");
}

function isMemberAddition(node, left, right) {
  return node?.type === "BinaryExpression"
    && node.operator === "+"
    && callName(node.left) === left
    && callName(node.right) === right;
}

function propertyName(node) {
  return node?.name ?? node?.value ?? "";
}

function containsIdentifier(root, name) {
  let found = false;
  walk(root, node => {
    if (node.type === "Identifier" && node.name === name) found = true;
  });
  return found;
}

function containsMember(root, parts) {
  let found = false;
  walk(root, node => {
    if (callName(node) === parts.join(".")) found = true;
  });
  return found;
}

function containsNullRejection(root) {
  return collect(root, node => node.type === "BinaryExpression" && ["!==", "!="].includes(node.operator) && ((node.left?.type === "Identifier" && node.left.name === "owner" && node.right?.type === "NullLiteral") || (node.right?.type === "Identifier" && node.right.name === "owner" && node.left?.type === "NullLiteral"))).length > 0;
}

function wrapDirectLine(source, token) {
  const line = source.split(/\r?\n/u).find(item => item.includes(token));
  assert.ok(line, `mutation 缺少行：${token}`);
  return source.replace(line, `${line.slice(0, line.length - line.trimStart().length)}if (false) ${line.trimStart()}`);
}

function moveNewMapIntoUnusedFunction(source) {
  const line = source.split(/\r?\n/u).find(item => item.includes("unwrap(await api.generate.newMap"));
  assert.ok(line, "mutation 缺少 newMap 行");
  const indent = line.slice(0, line.length - line.trimStart().length);
  return source.replace(line, `${indent}const unusedNewMap = async () => { ${line.trim()} };`);
}

function moveNewMapIntoFalseBranch(source) {
  const line = source.split(/\r?\n/u).find(item => item.includes("unwrap(await api.generate.newMap"));
  assert.ok(line, "mutation 缺少 newMap 行");
  const indent = line.slice(0, line.length - line.trimStart().length);
  return source.replace(line, `${indent}if (false) ${line.trim()}`);
}

function moveContextRestoreIntoUnusedFunction(source) {
  const line = source.split(/\r?\n/u).find(item => item.includes("const receipt = unwrap(await api.debug.simulateContextLoss"));
  assert.ok(line, "mutation 缺少 context restore 行");
  const indent = line.slice(0, line.length - line.trimStart().length);
  const assignment = line.trim().replace("const receipt =", "receipt =");
  return source.replace(line, `${indent}let receipt = null; const unusedRestore = async () => { ${assignment} };`);
}

function moveContextRestoreIntoFalseBranch(source) {
  const line = source.split(/\r?\n/u).find(item => item.includes("const receipt = unwrap(await api.debug.simulateContextLoss"));
  assert.ok(line, "mutation 缺少 context restore 行");
  const indent = line.slice(0, line.length - line.trimStart().length);
  const assignment = line.trim().replace("const receipt =", "receipt =");
  return source.replace(line, `${indent}let receipt = null; if (false) ${assignment}`);
}

function assertMutationFails(run, pattern, label) {
  assert.throws(run, pattern, `${label} 后契约仍通过`);
}
