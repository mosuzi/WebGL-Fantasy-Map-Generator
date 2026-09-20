import assert from "node:assert/strict";
import {readFile, writeFile, mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {reactive} from "vue";
import {parse, compileScript} from "vue/compiler-sfc";

// 执行正式 SFC 的选择处理函数，避免另写一份看似相同的选择实现。
const file = new URL("../app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue", import.meta.url);
const source = await readFile(file, "utf8");
const compiled = compileScript(parse(source).descriptor, {id: "ctrl-selection-contract"}).content
  .replace(/from (["'])([^"']+)\1/g, (_, quote, specifier) => {
    const url = specifier.startsWith(".") ? new URL(specifier, file).href : import.meta.resolve(specifier);
    return `from ${JSON.stringify(url)}`;
  });
const out = await mkdtemp(join(tmpdir(), "fmg-ctrl-selection-"));
const moduleFile = join(out, "table.mjs");
await writeFile(moduleFile, compiled);
const Table = (await import(pathToFileURL(moduleFile))).default;
const rows = Array.from({length: 240}, (_, id) => ({id, name: `对象${id}`}));

for (const lockMode of [false, true]) {
  const defaults = Object.fromEntries(Object.entries(Table.props).map(([key, prop]) => [key,
    typeof prop.default === "function" ? prop.default() : prop.default]));
  const props = reactive({...defaults, columns: [{key: "id", label: "ID"}, {key: "name", label: "名称"}], rows,
    selectableRows: true, showRegenerationLock: lockMode, lockableRowIds: rows.map(row => row.id), lockedRowIds: [9], doubleClickAction: "edit"});
  const events = [];
  const warn = console.warn;
  let table;
  try {
    console.warn = () => {};
    table = Table.setup(props, {expose() {}, emit(name, value) {
      events.push({name, value});
      if (name === "selection-change") props.selectedRowIds = value;
      if (name === "lock-selection-change") props.lockSelectionIds = value;
      if (name === "select") props.selectedId = value.id;
    }});
  } finally {console.warn = warn;}
  const selected = () => lockMode ? props.lockSelectionIds : props.selectedRowIds;
  table.handleRowClick(rows[0], {});
  assert.deepEqual(selected(), [0], "普通点击单选，ID 0 有效");
  table.handleRowClick(rows[4], {ctrlKey: true});
  assert.deepEqual(selected(), [0, 4], "Ctrl 追加");
  assert.equal(props.selectedId, 0, "Ctrl 不抢详情焦点");
  assert.ok(table.rowHighlighted(rows[0]) && table.rowHighlighted(rows[4]), "所有已选行可见高亮");
  table.handleRowClick(rows[0], {ctrlKey: true});
  assert.deepEqual(selected(), [4], "Ctrl 再点取消");
  assert.equal(table.rowHighlighted(rows[0]), false, "取消后不会被详情选中态重新点亮");
  table.handleRowClick(rows[239], {shiftKey: true});
  assert.equal(selected().length, 240, "Shift 跨虚拟窗口选择完整范围");
  table.handleRowClick(rows[2], {});
  assert.deepEqual(selected(), [2], "普通点击收回单选");
  table.handleRowClick(rows[7], {metaKey: true});
  assert.deepEqual(selected(), [2, 7], "兼容 Command 多选");
  events.length = 0;
  table.handleRowDoubleClick(rows[7], {ctrlKey: true});
  assert.equal(events.length, 0, "多选双击不进入编辑");
  table.handleRowDoubleClick(rows[2], {});
  assert.deepEqual(events.map(event => event.name), ["edit"], "普通双击编辑保持");
  assert.deepEqual(props.lockedRowIds, [9], "选择不得更改锁");
  assert.equal(table.columnSpan.value, lockMode ? 3 : 2, "去掉多选框后的虚拟跨度");
}
assert.doesNotMatch(source, /type="checkbox"/);
assert.match(source, /@click\.stop="emit\('lock-toggle'/);
assert.match(source, /@click\.stop="emit\('locate'/);
assert.equal((source.match(/@dblclick\.stop/g) || []).length, 2);
console.log("普通 / 锁定列表：单选、Ctrl 增减、跨 240 行范围、多行高亮、双击隔离及虚拟跨度通过。");
