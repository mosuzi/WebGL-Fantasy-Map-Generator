<template>
  <div ref="tableWrap" class="object-table-wrap">
    <table class="object-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" :data-align="column.align || null">{{ column.label }}</th>
          <th v-if="showLocateAction"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td class="object-table-empty" :colspan="columns.length + (showLocateAction ? 1 : 0)">{{ emptyText }}</td>
        </tr>
        <tr
          v-for="row in rows"
          v-else
          :key="getRowId(row)"
          :data-row-id="stringRowId(getRowId(row))"
          :class="{selected: isSelected(row)}"
          @click="$emit('select', row)"
          @dblclick="showLocateAction && $emit('locate', row)"
        >
          <td v-for="column in columns" :key="column.key" :data-align="column.align || null">
            {{ formatCell(column, row) }}
          </td>
          <td v-if="showLocateAction" data-align="right">
            <button class="table-icon-action" type="button" title="定位" aria-label="定位" @click.stop="$emit('locate', row)">⌖</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import {nextTick, ref, watch} from "vue";
import {objectIdKey, sameObjectId} from "../../../object-id.js";

defineOptions({
  name: "UiObjectTable"
});

const props = defineProps({
  columns: {
    type: Array,
    required: true
  },
  rows: {
    type: Array,
    required: true
  },
  selectedId: {
    type: [Number, String, null],
    default: null
  },
  emptyText: {
    type: String,
    default: "无数据"
  },
  rowIdKey: {
    type: String,
    default: "id"
  },
  showLocateAction: {
    type: Boolean,
    default: true
  }
});

defineEmits(["select", "locate"]);

const tableWrap = ref(null);

watch(
  () => [props.selectedId, props.rows],
  () => scrollSelectedRowIntoView(),
  {flush: "post", immediate: true}
);

function getRowId(row) {
  return row?.[props.rowIdKey];
}

function isSelected(row) {
  return sameObjectId(getRowId(row), props.selectedId);
}

function scrollSelectedRowIntoView() {
  if (props.selectedId === null || props.selectedId === undefined) return;
  nextTick(() => {
    const wrap = tableWrap.value;
    if (!wrap) return;
    const targetId = stringRowId(props.selectedId);
    const row = [...wrap.querySelectorAll("tbody tr[data-row-id]")]
      .find(item => item.dataset.rowId === targetId);
    if (!row) return;
    row.scrollIntoView({block: "nearest"});
  });
}

function stringRowId(value) {
  return objectIdKey(value);
}

function formatCell(column, row) {
  if (typeof column.format === "function") return column.format(row[column.key], row);
  return row[column.key];
}
</script>
