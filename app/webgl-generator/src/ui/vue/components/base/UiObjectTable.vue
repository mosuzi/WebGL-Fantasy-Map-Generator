<template>
  <div ref="tableWrap" class="object-table-wrap">
    <table v-if="rows.length" class="object-table object-table-native">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :style="columnStyle(column)"
          >
            {{ column.label }}
          </th>
          <th v-if="showLocateAction" class="object-table-action-column">定位</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="rowKey(row)"
          v-memo="[rowKey(row), isSelected(row)]"
          class="object-table-row"
          :class="{'selected-row': isSelected(row)}"
          @click="handleRowClick(row)"
          @dblclick="handleRowDoubleClick(row)"
        >
          <td
            v-for="column in columns"
            :key="column.key"
            :style="columnStyle(column)"
          >
            <span class="object-table-cell">{{ formatCell(column, row) }}</span>
          </td>
          <td v-if="showLocateAction" class="object-table-action-cell">
            <button class="table-icon-action" type="button" title="定位" aria-label="定位" @click.stop="emit('locate', row)">⌖</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="object-table-empty">{{ emptyText }}</div>
  </div>
</template>

<script setup>
import {nextTick, onBeforeUnmount, ref, watch} from "vue";
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
  const row = wrap?.querySelector(".object-table-row.selected-row");
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
  return wrap;
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

function columnStyle(column) {
  const align = column.align || "left";
  return {
    minWidth: `${columnWidth(column)}px`,
    textAlign: align
  };
}
</script>
