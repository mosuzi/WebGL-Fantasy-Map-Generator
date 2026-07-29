import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {panelAvailableHeight} from "../app/webgl-generator/src/ui/panel-manager.js";
import {beginDirectManipulationSession} from "../app/webgl-generator/src/runtime/direct-manipulation-session.js";
import {OBJECT_TABLE_ROW_HEIGHT} from "../app/webgl-generator/src/ui/vue/components/base/object-table-geometry.js";
import {
  captureObjectTableSelectionEvent,
  captureObjectTableSelectionHitClick,
  consumeObjectTableSelectionModifiers,
  createObjectTableSelectionEventState
} from "../app/webgl-generator/src/ui/vue/components/base/object-table-selection-events.js";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..");
const COMPONENT_ROOT = join(REPO_ROOT, "app", "webgl-generator", "src", "ui", "vue", "components");
const TABLE_FILE = join(COMPONENT_ROOT, "base", "UiObjectTable.vue");
const PANEL_MANAGER_FILE = join(REPO_ROOT, "app", "webgl-generator", "src", "ui", "panel-manager.js");
const STYLES_FILE = join(REPO_ROOT, "app", "webgl-generator", "src", "styles.css");

const componentFiles = readdirSync(COMPONENT_ROOT).filter(name => name.endsWith(".vue"));
const tableInstances = componentFiles.flatMap(file => {
  const source = readFileSync(join(COMPONENT_ROOT, file), "utf8");
  return [...source.matchAll(/<UiObjectTable\b[\s\S]*?\/>/g)].map((match, index) => ({file, index: index + 1, source: match[0]}));
});
const tableSource = readFileSync(TABLE_FILE, "utf8");
const panelSource = readFileSync(PANEL_MANAGER_FILE, "utf8");
const styles = readFileSync(STYLES_FILE, "utf8");

assert.equal(new Set(tableInstances.map(item => item.file)).size, 24, "UiObjectTable 宿主必须保持 24 个");
assert.equal(tableInstances.length, 27, "UiObjectTable 实例必须保持 27 个");
assert.equal(tableInstances.length, 27, "全部实例必须共享同一虚拟化实现");
assert.equal(tableInstances.filter(item => item.source.includes("@column-resize")).length, 26, "列宽拖动实例必须保持 26 个");
assert.equal(tableInstances.filter(item => /(?:selectable-rows|show-regeneration-lock)/.test(item.source)).length, 21, "checkbox 实例必须保持 21 个");
assert.equal(tableInstances.filter(item => !item.source.includes(':show-locate-action="false"')).length, 20, "定位实例必须保持 20 个");
assert.equal(tableInstances.filter(item => item.source.includes(`:doubleClickAction="'edit'"`)).length, 11, "双击编辑实例必须保持 11 个");

assert.equal(OBJECT_TABLE_ROW_HEIGHT, 42, "共享对象表格行高必须为 42px");
assert.doesNotMatch(tableSource, /\bVIRTUAL_ROW_HEIGHT\b|(?:scrollTop|viewportHeight)[^\n]*\/\s*32|virtualWindow[^\n]*\*\s*32/, "共享表格不得保留裸 32px 虚拟行高");
assert.match(tableSource, /"--object-table-row-height": `\$\{OBJECT_TABLE_ROW_HEIGHT\}px`/, "CSS 行高变量必须由 JS 单一 token 写入");
for (const token of [
  "viewportHeight.value / OBJECT_TABLE_ROW_HEIGHT",
  "scrollTop.value / OBJECT_TABLE_ROW_HEIGHT",
  "virtualWindow.value.start * OBJECT_TABLE_ROW_HEIGHT",
  "virtualWindow.value.end) * OBJECT_TABLE_ROW_HEIGHT",
  "selectedRowPosition.value, OBJECT_TABLE_ROW_HEIGHT"
]) assert.ok(tableSource.includes(token), `虚拟窗口、spacer 与居中必须共同读取行高 token：${token}`);
const rowRule = cssRule(".object-table-native tbody .object-table-row");
const cellRule = cssRule(".object-table-native tbody .object-table-row > td");
assert.ok(rowRule.includes("height: var(--object-table-row-height)"), "CSS row 必须读取同源变量");
assert.ok(cellRule.includes("height: var(--object-table-row-height)") && cellRule.includes("padding-top: 0") && cellRule.includes("padding-bottom: 0"), "td box geometry 必须固定为同源行高");

assert.equal(panelAvailableHeight(576, 64), 504);
assert.equal(panelAvailableHeight(720, 64), 648);
assert.equal(panelAvailableHeight(820, 64), 748);
assert.equal(panelAvailableHeight(576, 524), 44, "靠近底部时仍须为固定 header 留出可达高度");
for (const token of [
  "writePanelAvailableHeight(panel, panelAvailableHeight(hostHeight, position.top))",
  'this.applyPreferredPosition(record)',
  "this.reflowPanels()",
  "this.dockPanelPair(main, detail)",
  "manager.constrain(panel, {reachableOnly: true})",
  "new ResizeObserverCtor"
]) assert.ok(panelSource.includes(token), `面板 open/reflow/dock/drag/resize 路径必须汇入最终 top 几何：${token}`);
const panelRule = cssRule(".floating-panel");
const panelGeometry = panelOuterGeometry(panelRule);
assert.match(panelRule, /max-height: min\([^;]*var\(--floating-panel-available-height/);
assert.deepEqual(panelGeometry, {boxSizing: "border-box", overflow: "hidden", borderWidth: 1}, "availableHeight 必须直接约束不可泄漏的 panel outer box");
for (const [hostHeight, finalTop] of [[576, 64], [720, 64], [820, 64], [576, 524]]) {
  const availableHeight = panelAvailableHeight(hostHeight, finalTop);
  const outerHeight = constrainedPanelOuterHeight(panelGeometry, availableHeight, 900);
  assert.equal(outerHeight, availableHeight, "超高内容的 panel outer box 必须钳制到可用高度");
  assert.ok(finalTop + outerHeight + 8 <= hostHeight, "panel outer rect 必须保留底部安全区");
}
const headerRule = cssRule(".floating-panel-header");
assert.match(headerRule, /flex: 0 0 auto/);
assert.match(headerRule, /min-height: 38px/);
assert.doesNotMatch(headerRule, /(?:^|\n)\s*height:/, "header 只能保留最小高度，150% 字体时必须允许增长");
const bodyRule = cssRule(".floating-panel-body");
assert.match(bodyRule, /flex: 1 1 auto[\s\S]*box-sizing: border-box[\s\S]*min-height: 0[\s\S]*overflow: auto/);
assert.match(cssRule(".object-table-wrap"), /max-width: 100%[\s\S]*overflow-x: auto[\s\S]*overflow-y: auto/);
const savePanelStateBlock = sourceBlock(panelSource, "  savePanelState(id) {", "\n  readPanelState(");
assert.doesNotMatch(savePanelStateBlock, /floating-panel-available-height/, "可用高度是运行时几何，不得写入面板持久化");

assertHitVsVisual({
  visual: cssRule(".object-table-selection-checkbox"),
  hit: cssRule(".object-table-selection-hit"),
  visualWidth: 14,
  hitWidth: 28,
  label: "checkbox"
});
assertHitVsVisual({
  visual: cssRule(".object-table-column-resize-handle::after"),
  hit: cssRule(".object-table-column-resize-handle"),
  visualWidth: 2,
  hitWidth: 16,
  label: "列宽拖柄"
});
assert.ok(px(cssRule(".object-table-sort-button"), "min-height") >= 28, "排序按钮命中高度不得小于 28px");
assert.equal(px(cssRule(".ui-secondary-action-close"), "width"), 26, "二级关闭视觉宽度保持 26px");
assert.equal(insetExpansion(cssRule(".ui-secondary-action-close::before")), 2, "二级关闭透明命中应扩展到 28px");
assert.equal(px(cssRule(".object-table-empty-action"), "min-height"), 26, "空态动作视觉高度保持 26px");
assert.equal(insetExpansion(cssRule(".object-table-empty-action::before")), 2, "空态动作透明命中应扩展到至少 28px");
const rowSelectionBlock = sourceBlock(tableSource, '          <td v-if="selectionColumnVisible" class="object-table-selection-cell">', "\n          </td>");
assert.match(rowSelectionBlock, /@click="event => handleSelectionHitClick\(row, event\)"/, "checkbox label 空白区必须只在真实 click 捕获 Shift 并阻断行 click");
assert.doesNotMatch(rowSelectionBlock, /@pointerdown/, "checkbox label 不得在可能无 change 的 pointerdown 持久保存修饰键");
assert.match(rowSelectionBlock, /class="object-table-selection-checkbox object-table-row-selection-checkbox"[\s\S]*?@click="event => rememberSelectionModifiers\(row, event, false, true\)"/, "checkbox input click 必须保留修饰键捕获以支持键盘激活");
assert.equal((tableSource.match(/emit\("column-resize"/g) || []).length, 1, "列宽 pointerup 至多派发一次持久化事件");
assert.match(tableSource, /session\.finish\(event\?\.type === "pointerup" \? "pointerup" : event\?\.type \|\| "unmount", event\)/, "列宽必须只把 pointerup 路由为提交");
runSelectionEventContract();
runColumnResizeSessionContract();

console.log(JSON.stringify({
  tables: {hosts: 24, instances: 27, virtual: 27, resizable: 26, checkbox: 21, locate: 20, doubleClick: 11},
  rowHeight: OBJECT_TABLE_ROW_HEIGHT,
  panelAvailableHeight: {576: 504, 720: 648, 820: 748},
  hitTargets: {checkbox: "14/28", resize: "2/16", sort: 28, secondaryClose: "26/28", emptyAction: "26/28"}
}, null, 2));

function cssRule(selector) {
  const marker = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{`).exec(styles);
  const start = marker ? marker.index + (marker[0].startsWith("\n") ? 1 : 0) : -1;
  assert.ok(start >= 0, `缺少 CSS selector：${selector}`);
  const open = styles.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < styles.length; index += 1) {
    if (styles[index] === "{") depth += 1;
    else if (styles[index] === "}" && --depth === 0) return styles.slice(start, index + 1);
  }
  throw new Error(`CSS selector 未闭合：${selector}`);
}

function px(rule, property) {
  const match = rule.match(new RegExp(`(?:^|\\n)\\s*${property}:\\s*(\\d+)px`));
  assert.ok(match, `缺少 ${property} px 声明`);
  return Number(match[1]);
}

function insetExpansion(rule) {
  const match = rule.match(/inset:\s*-(\d+)px(?:\s+\d+px)?/);
  assert.ok(match, "透明命中伪元素缺少负 inset");
  return Number(match[1]) * 2;
}

function assertHitVsVisual({visual, hit, visualWidth, hitWidth, label}) {
  assert.equal(px(visual, "width"), visualWidth, `${label} 视觉宽度漂移`);
  assert.ok(px(hit, "width") >= hitWidth, `${label} 命中宽度不足`);
}

function sourceBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `无法读取源码片段：${startToken}`);
  return source.slice(start, end);
}

function panelOuterGeometry(rule) {
  const boxSizing = rule.match(/(?:^|\n)\s*box-sizing:\s*([^;]+);/)?.[1]?.trim();
  const overflow = rule.match(/(?:^|\n)\s*overflow:\s*([^;]+);/)?.[1]?.trim();
  const borderWidth = Number(rule.match(/(?:^|\n)\s*border:\s*(\d+)px\b/)?.[1]);
  return {boxSizing, overflow, borderWidth};
}

function constrainedPanelOuterHeight(geometry, availableHeight, naturalContentHeight) {
  const constrainedHeight = Math.min(availableHeight, naturalContentHeight);
  return geometry.boxSizing === "border-box"
    ? constrainedHeight
    : constrainedHeight + geometry.borderWidth * 2;
}

function runSelectionEventContract() {
  const state = createObjectTableSelectionEventState();
  let rowClicks = 0;
  let changes = 0;
  const cleanups = [];
  const label = {};
  const input = {};
  const labelClick = syntheticEvent({shiftKey: true, target: label, currentTarget: label});
  assert.equal(captureObjectTableSelectionHitClick(state, labelClick, cleanup => cleanups.push(cleanup)), true);
  if (!labelClick.propagationStopped) rowClicks += 1;
  const synthesizedInputClick = syntheticEvent({target: input, currentTarget: input});
  captureObjectTableSelectionEvent(state, synthesizedInputClick, {preserveExisting: true});
  const bubbledInputClick = syntheticEvent({target: input, currentTarget: label});
  assert.equal(captureObjectTableSelectionHitClick(state, bubbledInputClick, cleanup => cleanups.push(cleanup)), false);
  if (!bubbledInputClick.propagationStopped) rowClicks += 1;
  changes += 1;
  assert.deepEqual(consumeObjectTableSelectionModifiers(state), {shiftKey: true}, "label 空白区的 Shift 不得被合成 input click 覆盖");
  cleanups.forEach(cleanup => cleanup());
  assert.equal(changes, 1, "label 空白区点击只允许一次 change");
  assert.equal(rowClicks, 0, "label 空白区点击不得触发行 click");

  const abandonedCleanups = [];
  const abandonedLabelClick = syntheticEvent({target: label, currentTarget: label});
  captureObjectTableSelectionHitClick(state, abandonedLabelClick, cleanup => abandonedCleanups.push(cleanup));
  abandonedCleanups.forEach(cleanup => cleanup());
  assert.equal(consumeObjectTableSelectionModifiers(state), null, "未产生 input click/change 的 label 激活必须清理修饰键");

  rowClicks = 0;
  changes = 0;
  const keyboardInputClick = syntheticEvent({shiftKey: true, target: input, currentTarget: input});
  captureObjectTableSelectionEvent(state, keyboardInputClick, {preserveExisting: true});
  const keyboardBubble = syntheticEvent({shiftKey: true, target: input, currentTarget: label});
  captureObjectTableSelectionHitClick(state, keyboardBubble);
  if (!keyboardBubble.propagationStopped) rowClicks += 1;
  changes += 1;
  assert.deepEqual(consumeObjectTableSelectionModifiers(state), {shiftKey: true}, "键盘激活 input 时仍须捕获 Shift");
  assert.equal(changes, 1, "键盘激活 input 只允许一次 change");
  assert.equal(rowClicks, 0, "键盘 input click 经 label 冒泡后不得触发行 click");
}

function runColumnResizeSessionContract() {
  let commits = 0;
  let rollbacks = 0;
  const committed = beginDirectManipulationSession({kind: "object-table-column", onCommit: () => commits += 1, onRollback: () => rollbacks += 1});
  assert.equal(committed.finish("pointerup"), true);
  assert.equal(committed.finish("pointerup"), false, "列宽会话重复 pointerup 必须幂等");
  assert.deepEqual({commits, rollbacks}, {commits: 1, rollbacks: 0}, "列宽 pointerup 只能提交一次");

  commits = 0;
  rollbacks = 0;
  const cancelled = beginDirectManipulationSession({kind: "object-table-column", onCommit: () => commits += 1, onRollback: () => rollbacks += 1});
  assert.equal(cancelled.finish("pointercancel"), true);
  assert.equal(cancelled.finish("pointerup"), false, "列宽取消后迟到的 pointerup 不得提交");
  assert.deepEqual({commits, rollbacks}, {commits: 0, rollbacks: 1}, "列宽 pointercancel 必须零提交并回滚一次");
}

function syntheticEvent({shiftKey = false, target = {}, currentTarget = target} = {}) {
  return {
    shiftKey,
    target,
    currentTarget,
    propagationStopped: false,
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
}
