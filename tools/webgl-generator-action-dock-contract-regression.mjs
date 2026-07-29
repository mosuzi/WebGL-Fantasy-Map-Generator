import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentRoot = path.join(root, "app/webgl-generator/src/ui/vue/components");
const names = (await readdir(componentRoot)).filter(name => name.endsWith("Panel.vue")).sort();
const sources = new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(componentRoot, name), "utf8")])));
const dockSource = await readFile(path.join(componentRoot, "base/UiActionDock.vue"), "utf8");
const tableSource = await readFile(path.join(componentRoot, "base/UiObjectTable.vue"), "utf8");

const hosts = [...sources].filter(([, source]) => source.includes("<UiActionDock")).map(([file, source]) => discoverHost(file, source));
const actions = hosts.flatMap(host => host.actions);
const identities = actions.map(action => action.identity);
const resultCounts = Object.fromEntries(["toggle-canvas-mode", "open-secondary", "direct", "open-other-panel"]
  .map(resultClass => [resultClass, actions.filter(action => action.resultClass === resultClass).length]));
const editTableHosts = [...sources].filter(([, source]) => /doubleClickAction|double-click-action/.test(source)).map(([file]) => file);

assert.equal(new Set(hosts.map(host => host.hostId)).size, hosts.length, "UiActionDock hostId 必须唯一");
assert.equal(new Set(identities).size, identities.length, "动作身份必须按 host + key 唯一");
assert.ok(actions.every(action => action.resultClass), "每个动作必须显式声明 resultClass");
assert.deepEqual(resultCounts, {"toggle-canvas-mode": 12, "open-secondary": 55, direct: 0, "open-other-panel": 1});
assert.deepEqual(actions.filter(action => action.resultClass === "open-other-panel").map(action => action.identity), ["CulturePanel:namebase"]);
assert.ok(actions.filter(action => action.resultClass === "open-secondary").every(action => action.hasSlot), "二级面板动作必须有同名 slot");
assert.ok(actions.filter(action => action.resultClass !== "open-secondary").every(action => !action.hasSlot), "非二级动作不得有同名 slot");
assert.match(dockSource, /:class="\{active: isActionActive\(action\), 'is-editing': isActionActive\(action\)\}"/);
assert.match(dockSource, /:aria-pressed="isActionActive\(action\) \? 'true' : 'false'"/);
assert.match(dockSource, /function actionIdentity\(action\)[\s\S]*?props\.hostId.*action\.key/);
assert.match(dockSource, /if \(action\.resultClass !== "open-secondary"\)[\s\S]*?emit\("select", action\.key\)[\s\S]*?return/);
assert.ok(editTableHosts.length > 0, "必须从当前源码发现可双击编辑表格宿主");
const clickHandler = sourceBetween(tableSource, "function handleRowClick", "function handleRowDoubleClick");
const doubleClickHandler = sourceBetween(tableSource, "function handleRowDoubleClick", "function handleHeaderSort");
assert.match(clickHandler, /emit\("select", row\)/, "普通单击必须继续选择");
assert.equal(matches(doubleClickHandler, /emit\("edit", row\)/g), 1, "dblclick 必须只派发一次 edit");
assert.doesNotMatch(doubleClickHandler, /emit\("select", row\)/, "dblclick 不得重复选择");
for (const file of editTableHosts) {
  const source = sources.get(file);
  assert.match(source, /@edit="openRenameEditor"/, `${file} 双击编辑必须进入统一重命名入口`);
  const editor = source.match(/function openRenameEditor\(row\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(editor, `${file} 缺少可解析的 openRenameEditor`);
  assert.equal(matches(editor, /props\.callbacks\.onSelect\?\.\(row\)/g), 1, `${file} 编辑入口最多保留一个补选调用`);
  assert.match(editor, /if \([^\n]+\) props\.callbacks\.onSelect\?\.\(row\);/, `${file} 只能在目标尚未选中时补选`);
}

console.log(JSON.stringify({
  hosts: hosts.length,
  actions: actions.length,
  uniqueRawKeys: new Set(actions.map(action => action.key)).size,
  uniqueIdentities: new Set(identities).size,
  resultCounts,
  doubleClickEditHosts: editTableHosts.length
}, null, 2));

function discoverHost(file, source) {
  const tag = source.match(/<UiActionDock\b[^>]*>/)?.[0];
  assert.ok(tag, `${file} 缺少 UiActionDock tag`);
  const hostId = tag.match(/\bhost-id="([^"]+)"/)?.[1];
  const variable = tag.match(/:actions="([^"]+)"/)?.[1];
  assert.ok(hostId && variable, `${file} 缺少稳定 host-id 或 actions 绑定`);
  const declaration = source.indexOf(`const ${variable} =`);
  assert.ok(declaration >= 0, `${file} 缺少 ${variable} 声明`);
  const array = balancedSlice(source, source.indexOf("[", declaration), "[", "]");
  const keys = [...array.matchAll(/\bkey:\s*"([^"]+)"/g)].map(match => match[1]);
  return {
    file,
    hostId,
    actions: keys.map(key => {
      const keyIndex = array.indexOf(`key: "${key}"`);
      const object = balancedSlice(array, array.lastIndexOf("{", keyIndex), "{", "}");
      const resultClass = object.match(/\bresultClass:\s*"([^"]+)"/)?.[1] || "";
      return {key, resultClass, identity: `${hostId}:${key}`, hasSlot: source.includes(`<template #${key}>`)};
    })
  };
}

function balancedSlice(source, start, open, close) {
  assert.ok(start >= 0);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth++;
    else if (char === close && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error("无法读取平衡源码片段");
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
