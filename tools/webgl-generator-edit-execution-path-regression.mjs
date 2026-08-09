#!/usr/bin/env node
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {extname, resolve} from "node:path";

const appPath = resolve("app/webgl-generator/src/runtime/app.js");
const source = readFileSync(appPath, "utf8");
const sourceFiles = collectSourceFiles(resolve("app/webgl-generator/src"));
const sourceEntries = sourceFiles.map(path => ({path, source: readFileSync(path, "utf8")}));
const executeEditBody = functionBody(source, "executeEditCommand");
const executeHistoryBody = functionBody(source, "executeHistoryCommand");
const historyAccesses = sourceEntries.flatMap(entry => findMethodAccesses(entry, "editHistory", ["execute", "undo", "redo"]));
const aliasedHistoryAccesses = sourceEntries.flatMap(entry => findAliasedHistoryAccesses(entry));
verifyScannerCoverage();

assert.deepEqual(historyAccesses.map(access => access.method).sort(), ["execute", "redo", "undo"],
  `EditHistory 写操作只能由统一执行器调用：${formatAccesses(historyAccesses)}`);
assert.deepEqual(aliasedHistoryAccesses, [],
  `不得通过 EditHistory 别名调用写操作：${formatAccesses(aliasedHistoryAccesses)}`);
assert.ok(executeEditBody.includes("state.editHistory.execute("));
assert.ok(executeHistoryBody.includes("state.editHistory.undo("));
assert.ok(executeHistoryBody.includes("state.editHistory.redo("));

assertOrdered(executeEditBody, [
  "command.isNoop?.(context)",
  "state.editHistory.execute(command, context)",
  "readEditCommandResult(executedCommand)",
  "state.selectionStore.batch(() =>",
  "options.preparePanelRefresh?.(state, executedCommand, result)",
  "reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false})",
  "refresh(state, executedCommand)",
  'refreshPanelsForEdit(state, highlightsChanged ? {derived: ["object-panels"]} : executedCommand)'
], "统一编辑执行器顺序");
assertOrdered(executeHistoryBody, [
  "state.selectionStore.batch(() =>",
  "reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false})",
  "refresh(state, command)",
  'refreshPanelsForEdit(state, {derived: ["object-panels"]})',
  "updateEditingInteractionLock(state, documentRef)"
], "统一历史执行器顺序");
for (const historyCall of [
  "state.editHistory.undo({map: state.map})",
  "state.editHistory.redo({map: state.map})"
]) {
  assert.ok(executeHistoryBody.indexOf(historyCall) < executeHistoryBody.indexOf("refresh(state, command)"),
    `统一历史执行器必须先调用 ${historyCall} 再刷新`);
}

for (const wrapper of ["executeNamebaseEdit", "applyMarkerCollectionCommand"]) {
  assert.ok(functionBody(source, wrapper).includes("executeEditCommand("), `${wrapper} 必须委托统一编辑执行器`);
}
for (const wrapper of ["executeNamebaseHistoryCommand"]) {
  assert.ok(functionBody(source, wrapper).includes("executeHistoryCommand("), `${wrapper} 必须委托统一历史执行器`);
}

const riverWaypointBody = functionBody(source, "applyRiverWaypointDraft");
assert.ok(riverWaypointBody.includes("createEditRiverControlPointsCommand("), "河流控制点提交必须创建领域命令");
assert.ok(riverWaypointBody.includes("executeEditCommand("), "河流控制点提交必须委托统一编辑执行器");
assert.ok(!riverWaypointBody.includes("editHistory.execute("), "河流控制点提交不得直接写 EditHistory");
assert.ok(!/command\.(?:apply|revert)\(/.test(riverWaypointBody), "河流控制点提交不得直接调用命令 apply / revert");

console.log(JSON.stringify({
  ok: true,
  scannedSourceFiles: sourceFiles.length,
  editHistoryExecuteCalls: historyAccesses.filter(access => access.method === "execute").length,
  editHistoryUndoCalls: historyAccesses.filter(access => access.method === "undo").length,
  editHistoryRedoCalls: historyAccesses.filter(access => access.method === "redo").length,
  riverWaypointDelegated: true,
  delegatedEditWrappers: ["executeNamebaseEdit", "applyMarkerCollectionCommand"],
  delegatedHistoryWrappers: ["executeNamebaseHistoryCommand"]
}, null, 2));

function functionBody(text, name) {
  const tokens = tokenize(text);
  const functionIndex = tokens.findIndex((token, index) => token.value === "function" && tokens[index + 1]?.value === name);
  assert.ok(functionIndex >= 0, `找不到函数 ${name}`);
  const openParenIndex = tokens.findIndex((token, index) => index > functionIndex && token.value === "(");
  let parenDepth = 0;
  let closeParenIndex = -1;
  for (let index = openParenIndex; index < tokens.length; index++) {
    if (tokens[index].value === "(") parenDepth++;
    if (tokens[index].value === ")") parenDepth--;
    if (parenDepth === 0) {
      closeParenIndex = index;
      break;
    }
  }
  assert.ok(closeParenIndex >= 0, `函数 ${name} 的参数没有闭合`);
  const braceIndex = tokens.findIndex((token, index) => index > closeParenIndex && token.value === "{");
  let depth = 0;
  for (let index = braceIndex; index < tokens.length; index++) {
    if (tokens[index].value === "{") depth++;
    if (tokens[index].value === "}") depth--;
    if (depth === 0) return text.slice(tokens[braceIndex].end, tokens[index].start);
  }
  throw new Error(`函数 ${name} 没有闭合`);
}

function collectSourceFiles(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return [".js", ".mjs", ".ts", ".vue"].includes(extname(entry.name)) ? [path] : [];
  });
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function findMethodAccesses(entry, objectName, methods) {
  const tokens = tokenize(entry.source);
  const accesses = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].value !== objectName) continue;
    const method = readMember(tokens, index + 1);
    if (methods.includes(method?.value)) {
      accesses.push({path: entry.path, method: method.value, offset: tokens[index].start});
    }
  }
  return accesses;
}

function findAliasedHistoryAccesses(entry) {
  const tokens = tokenize(entry.source);
  const aliases = new Set();
  for (let index = 0; index < tokens.length - 3; index++) {
    if (!["const", "let", "var"].includes(tokens[index].value)) continue;
    if (tokens[index + 2]?.value !== "=") continue;
    const statementEnd = tokens.findIndex((token, tokenIndex) => tokenIndex > index + 2 && token.value === ";");
    const editHistoryIndex = tokens.findIndex((token, tokenIndex) =>
      tokenIndex > index + 2 && (statementEnd < 0 || tokenIndex < statementEnd) && token.value === "editHistory");
    if (editHistoryIndex < 0) continue;
    const next = tokens[editHistoryIndex + 1]?.value;
    if ([";", ",", ")", undefined].includes(next)) aliases.add(tokens[index + 1].value);
  }
  return [...aliases].flatMap(alias => findMethodAccesses(entry, alias, ["execute", "undo", "redo"]));
}

function verifyScannerCoverage() {
  const entry = {
    path: "scanner-fixture.js",
    source: `
      // state.editHistory.execute()
      "state.editHistory.undo()";
      state.editHistory?.execute();
      state.editHistory["undo"]();
      const historyAlias = state.editHistory;
      historyAlias.redo();
    `
  };
  assert.deepEqual(
    findMethodAccesses(entry, "editHistory", ["execute", "undo", "redo"]).map(access => access.method),
    ["execute", "undo"],
    "扫描器必须识别可选链和方括号访问，并忽略注释与字符串"
  );
  assert.deepEqual(
    findAliasedHistoryAccesses(entry).map(access => access.method),
    ["redo"],
    "扫描器必须识别直接变量别名访问"
  );
}

function readMember(tokens, index) {
  if (tokens[index]?.value === "." || tokens[index]?.value === "?.") return tokens[index + 1] || null;
  if (tokens[index]?.value === "[" && tokens[index + 2]?.value === "]") return tokens[index + 1] || null;
  return null;
}

function formatAccesses(accesses) {
  return accesses.map(access => `${access.path}:${access.offset}:${access.method}`).join(", ") || "none";
}

function tokenize(text) {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    const next = text[index + 1];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "/" && next === "/") {
      index = skipUntil(text, index + 2, "\n");
      continue;
    }
    if (char === "/" && next === "*") {
      index = skipUntil(text, index + 2, "*/") + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      const token = readQuoted(text, index, char);
      tokens.push(token);
      index = token.end;
      continue;
    }
    if (char === "`") {
      index = readQuoted(text, index, "`").end;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (/[\w$]/.test(text[end] || "")) end++;
      tokens.push({value: text.slice(index, end), start: index, end});
      index = end;
      continue;
    }
    const value = char === "?" && next === "." ? "?." : char;
    const end = index + value.length;
    tokens.push({value, start: index, end});
    index = end;
  }
  return tokens;
}

function readQuoted(text, start, quote) {
  let value = "";
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (text[index] === quote) return {value, start, end: index + 1};
    value += text[index];
  }
  return {value, start, end: text.length};
}

function skipUntil(text, start, needle) {
  const index = text.indexOf(needle, start);
  return index < 0 ? text.length : index;
}

function assertOrdered(text, needles, label) {
  let cursor = -1;
  for (const needle of needles) {
    const index = text.indexOf(needle);
    assert.ok(index > cursor, `${label}缺少或顺序错误：${needle}`);
    cursor = index;
  }
}
