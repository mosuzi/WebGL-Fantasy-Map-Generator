<template>
  <div ref="tableWrap" class="object-table-wrap">
    <table class="object-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" :data-align="column.align || null">{{ column.label }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td class="object-table-empty" :colspan="columns.length + 1">{{ emptyText }}</td>
        </tr>
        <tr
          v-for="row in rows"
          v-else
          :key="getRowId(row)"
          :data-row-id="stringRowId(getRowId(row))"
          :class="{selected: isSelected(row)}"
          @click="$emit('select', row)"
          @dblclick="$emit('locate', row)"
        >
          <td v-for="column in columns" :key="column.key" :data-align="column.align || null">
            {{ formatCell(column, row) }}
          </td>
          <td data-align="right">
            <button class="table-icon-action" type="button" @click.stop="$emit('locate', row)">定位</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import {nextTick, ref, watch} from "vue";

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
  return getRowId(row) === props.selectedId;
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
  return value === null || value === undefined ? "" : String(value);
}

function formatCell(column, row) {
  if (typeof column.format === "function") return column.format(row[column.key], row);
  return row[column.key];
}
</script>
