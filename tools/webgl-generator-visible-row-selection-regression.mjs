#!/usr/bin/env node
import {computed, nextTick, ref} from "vue";
import {useVisibleRowSelection} from "../app/webgl-generator/src/ui/vue/composables/use-visible-row-selection.js";

const rows = ref([{id: 1}, {id: 2}, {id: 3}]);
const filter = ref("");
const visibleRows = computed(() => rows.value.filter(row => String(row.id).includes(filter.value)));
const {selectedRowIds, selectedRows} = useVisibleRowSelection(visibleRows);

selectedRowIds.value = [1, "2"];
assert(selectedRows.value.map(row => row.id).join(",") === "1,2", "数字 / 字符串 id 没有统一匹配");

filter.value = "1";
await nextTick();
assert(selectedRowIds.value.length === 1 && String(selectedRowIds.value[0]) === "1", "筛选后没有裁剪不可见勾选 id");
assert(selectedRows.value.length === 1 && selectedRows.value[0].id === 1, "筛选后选中行摘要不正确");

rows.value = [];
await nextTick();
assert(selectedRowIds.value.length === 0 && selectedRows.value.length === 0, "空列表没有清空批量勾选状态");

console.log(JSON.stringify({ok: true, selectedAfterFilter: 1, selectedAfterEmpty: 0}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
