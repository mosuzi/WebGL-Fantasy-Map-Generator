<template>
  <div ref="tableWrap" class="object-table-wrap">
    <ElTable
      class="object-table object-table-el"
      :data="rows"
      :row-key="rowKey"
      :tree-props="flatTreeProps"
      :max-height="300"
      :row-class-name="rowClassName"
      :empty-text="emptyText"
      table-layout="auto"
      @row-click="handleRowClick"
      @row-dblclick="handleRowDoubleClick"
    >
      <ElTableColumn
        v-for="column in columns"
        :key="column.key"
        :prop="column.key"
        :label="column.label"
        :align="column.align || 'left'"
        :min-width="columnWidth(column)"
      >
        <template #default="{ row }">
          {{ formatCell(column, row) }}
        </template>
      </ElTableColumn>
      <ElTableColumn v-if="showLocateAction" width="48" fixed="right" align="right">
        <template #default="{ row }">
          <ElButton class="table-icon-action" circle size="small" :icon="Aim" title="定位" aria-label="定位" @click.stop="emit('locate', row)" />
        </template>
      </ElTableColumn>
    </ElTable>
  </div>
</template>

<script setup>
import {nextTick, onBeforeUnmount, ref, watch} from "vue";
import {Aim} from "@element-plus/icons-vue";
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

const emit = defineEmits(["select", "locate"]);

const tableWrap = ref(null);
let scrollFrame = 0;
let scrollAttempt = 0;
const flatTreeProps = Object.freeze({
  children: "__tableChildren",
  hasChildren: "__tableHasChildren"
});

watch(
  () => [props.selectedId, props.rows, props.rows.length],
  () => scrollSelectedRowIntoView(),
  {flush: "post", immediate: true}
);

onBeforeUnmount(() => {
  cancelScrollFrame();
});

function getRowId(row) {
  return row?.[props.rowIdKey];
}

function isSelected(row) {
  return sameObjectId(getRowId(row), props.selectedId);
}

function rowKey(row) {
  return stringRowId(getRowId(row));
}

function rowClassName({row}) {
  return isSelected(row) ? "selected-row" : "";
}

function handleRowClick(row) {
  emit("select", row);
}

function handleRowDoubleClick(row) {
  if (props.showLocateAction) emit("locate", row);
}

function scrollSelectedRowIntoView() {
  if (props.selectedId === null || props.selectedId === undefined) return;
  scrollAttempt = 0;
  nextTick(() => requestSelectedRowScroll());
}

function requestSelectedRowScroll() {
  const view = tableWrap.value?.ownerDocument?.defaultView;
  if (!view?.requestAnimationFrame) {
    scrollSelectedRowNow();
    return;
  }
  cancelScrollFrame();
  scrollFrame = view.requestAnimationFrame(() => {
    scrollFrame = 0;
    const done = scrollSelectedRowNow();
    scrollAttempt += 1;
    if (!done && scrollAttempt < 10) requestSelectedRowScroll();
  });
}

function cancelScrollFrame() {
  if (!scrollFrame) return;
  const view = tableWrap.value?.ownerDocument?.defaultView;
  view?.cancelAnimationFrame?.(scrollFrame);
  scrollFrame = 0;
}

function scrollSelectedRowNow() {
  const wrap = tableWrap.value;
  const row = wrap?.querySelector(".el-table__body-wrapper .selected-row");
  const scroller = tableScroller(wrap);
  if (!row || !scroller) return false;
  const rowRect = row.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const padding = 8;
  if (rowRect.top < scrollerRect.top + padding) {
    scroller.scrollTop -= scrollerRect.top + padding - rowRect.top;
    return false;
  } else if (rowRect.bottom > scrollerRect.bottom - padding) {
    scroller.scrollTop += rowRect.bottom - scrollerRect.bottom + padding;
    return false;
  }
  return true;
}

function tableScroller(wrap) {
  return wrap?.querySelector(".el-table__body-wrapper .el-scrollbar__wrap")
    || wrap?.querySelector(".el-scrollbar__wrap")
    || wrap?.querySelector(".el-table__body-wrapper")
    || wrap;
}

function stringRowId(value) {
  return objectIdKey(value);
}

function formatCell(column, row) {
  if (typeof column.format === "function") return column.format(row[column.key], row);
  return row[column.key];
}

function columnWidth(column) {
  if (Number.isFinite(column.width)) return column.width;
  if (column.key === "id") return 64;
  if (column.align === "right") return 88;
  return Math.max(96, String(column.label || column.key || "").length * 16 + 48);
}
</script>
