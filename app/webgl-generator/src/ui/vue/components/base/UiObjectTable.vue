<template>
  <div ref="tableWrap" class="object-table-wrap" @scroll.passive="handleScroll">
    <table v-if="rows.length" class="object-table object-table-native">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :style="columnStyle(column)"
            :aria-sort="headerSortState(column)"
          >
            <button
              v-if="sortableColumn(column)"
              class="object-table-sort-button"
              type="button"
              :title="`按${column.label}排序`"
              :style="headerButtonStyle(column)"
              @click="handleHeaderSort(column)"
            >
              <span class="object-table-sort-label">{{ column.label }}</span>
              <span v-if="isActiveSortColumn(column)" class="object-table-sort-indicator" aria-hidden="true">
                {{ sortIndicator }}
              </span>
            </button>
            <span v-else>{{ column.label }}</span>
          </th>
          <th v-if="showLocateAction" class="object-table-action-column">定位</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="virtualTopPadding" class="object-table-spacer-row" aria-hidden="true">
          <td :colspan="columnSpan" :style="spacerStyle(virtualTopPadding)"></td>
        </tr>
        <tr
          v-for="row in visibleRows"
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
        <tr v-if="virtualBottomPadding" class="object-table-spacer-row" aria-hidden="true">
          <td :colspan="columnSpan" :style="spacerStyle(virtualBottomPadding)"></td>
        </tr>
      </tbody>
    </table>
    <div v-else class="object-table-empty">
      <span>{{ emptyText }}</span>
      <button
        v-if="emptyAction"
        class="object-table-empty-action"
        type="button"
        :title="emptyAction.label"
        :aria-label="emptyAction.label"
        :disabled="emptyAction.disabled"
        @click="handleEmptyAction"
      >
        <span aria-hidden="true">{{ emptyAction.icon || "+" }}</span>
        <span>{{ emptyAction.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
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
  emptyAction: {
    type: Object,
    default: null
  },
  rowIdKey: {
    type: String,
    default: "id"
  },
  showLocateAction: {
    type: Boolean,
    default: true
  },
  doubleClickAction: {
    type: String,
    default: "locate",
    validator: value => ["locate", "edit"].includes(value)
  },
  sortable: {
    type: Boolean,
    default: false
  },
  sortKey: {
    type: String,
    default: ""
  },
  sortDirection: {
    type: String,
    default: "asc",
    validator: value => ["asc", "desc"].includes(value)
  },
  sortOptions: {
    type: Array,
    default: null
  },
  columnWidths: {
    type: Object,
    default: null
  }
});

const VIRTUAL_ROW_HEIGHT = 32;
const VIRTUAL_THRESHOLD = 120;
const VIRTUAL_OVERSCAN_ROWS = 8;

const emit = defineEmits(["select", "locate", "edit", "empty-action", "sort"]);

const tableWrap = ref(null);
const scrollTop = ref(0);
const viewportHeight = ref(300);
let scrollFrame = 0;
let scrollAttempt = 0;
let scrollMetricsFrame = 0;

const columnSpan = computed(() => props.columns.length + (props.showLocateAction ? 1 : 0));
const virtualEnabled = computed(() => props.rows.length > VIRTUAL_THRESHOLD);
const virtualWindow = computed(() => {
  if (!virtualEnabled.value) return {start: 0, end: props.rows.length};
  const visibleCount = Math.max(1, Math.ceil(viewportHeight.value / VIRTUAL_ROW_HEIGHT));
  const start = Math.max(0, Math.floor(scrollTop.value / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS);
  const end = Math.min(props.rows.length, start + visibleCount + VIRTUAL_OVERSCAN_ROWS * 2);
  return {start, end};
});
const visibleRows = computed(() => props.rows.slice(virtualWindow.value.start, virtualWindow.value.end));
const virtualTopPadding = computed(() => virtualEnabled.value ? virtualWindow.value.start * VIRTUAL_ROW_HEIGHT : 0);
const virtualBottomPadding = computed(() => virtualEnabled.value ? Math.max(0, props.rows.length - virtualWindow.value.end) * VIRTUAL_ROW_HEIGHT : 0);
const sortableKeys = computed(() => new Set((props.sortOptions || []).map(option => option?.key).filter(Boolean)));
const sortIndicator = computed(() => props.sortDirection === "asc" ? "↑" : "↓");

watch(
  () => [props.selectedId, props.rows, props.rows.length],
  () => scrollSelectedRowIntoView(),
  {flush: "post", immediate: true}
);

onMounted(() => {
  refreshScrollMetrics();
});

onBeforeUnmount(() => {
  cancelScrollFrame();
  cancelScrollMetricsFrame();
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
  emit("select", row);
  if (props.doubleClickAction === "edit") {
    emit("edit", row);
    return;
  }
  if (props.showLocateAction) emit("locate", row);
}

function handleHeaderSort(column) {
  if (!sortableColumn(column)) return;
  emit("sort", columnSortKey(column));
}

function handleEmptyAction() {
  if (!props.emptyAction || props.emptyAction.disabled) return;
  emit("empty-action", props.emptyAction.key);
}

function handleScroll() {
  const view = tableWrap.value?.ownerDocument?.defaultView;
  if (!view?.requestAnimationFrame) {
    refreshScrollMetrics();
    return;
  }
  if (scrollMetricsFrame) return;
  scrollMetricsFrame = view.requestAnimationFrame(() => {
    scrollMetricsFrame = 0;
    refreshScrollMetrics();
  });
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

function cancelScrollMetricsFrame() {
  if (!scrollMetricsFrame) return;
  const view = tableWrap.value?.ownerDocument?.defaultView;
  view?.cancelAnimationFrame?.(scrollMetricsFrame);
  scrollMetricsFrame = 0;
}

function scrollSelectedRowNow() {
  const wrap = tableWrap.value;
  const scroller = tableScroller(wrap);
  if (!scroller) return false;
  if (virtualEnabled.value) {
    const index = selectedRowIndex();
    if (index < 0) return false;
    const nextScrollTop = Math.max(0, index * VIRTUAL_ROW_HEIGHT - (scroller.clientHeight - VIRTUAL_ROW_HEIGHT) / 2);
    if (Math.abs(scroller.scrollTop - nextScrollTop) > 1) scroller.scrollTop = nextScrollTop;
    refreshScrollMetrics();
    return true;
  }
  const row = wrap?.querySelector(".object-table-row.selected-row");
  if (!row) return false;
  const rowRect = row.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const rowCenter = rowRect.top + rowRect.height / 2;
  const scrollerCenter = scrollerRect.top + scrollerRect.height / 2;
  const delta = rowCenter - scrollerCenter;
  if (Math.abs(delta) <= 1) return true;
  scroller.scrollTop += delta;
  const atStart = scroller.scrollTop <= 0;
  const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
  return atStart || atEnd;
}

function tableScroller(wrap) {
  return wrap;
}

function refreshScrollMetrics() {
  const wrap = tableWrap.value;
  if (!wrap) return;
  scrollTop.value = wrap.scrollTop || 0;
  viewportHeight.value = wrap.clientHeight || 300;
}

function selectedRowIndex() {
  return props.rows.findIndex(row => isSelected(row));
}

function spacerStyle(height) {
  return {
    height: `${height}px`,
    padding: 0,
    borderBottom: 0
  };
}

function stringRowId(value) {
  return objectIdKey(value);
}

function formatCell(column, row) {
  if (typeof column.format === "function") return column.format(row[column.key], row);
  return row[column.key];
}

function columnSortKey(column) {
  return column.sortKey || column.key;
}

function sortableColumn(column) {
  if (!props.sortable || column.sortable === false) return false;
  const key = columnSortKey(column);
  return sortableKeys.value.size ? sortableKeys.value.has(key) : Boolean(key);
}

function isActiveSortColumn(column) {
  return columnSortKey(column) === props.sortKey;
}

function headerSortState(column) {
  if (!sortableColumn(column)) return undefined;
  if (!isActiveSortColumn(column)) return "none";
  return props.sortDirection === "asc" ? "ascending" : "descending";
}

function headerButtonStyle(column) {
  const align = column.align || "left";
  return {
    justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start"
  };
}

function defaultColumnWidth(column) {
  if (Number.isFinite(column.width)) return column.width;
  if (column.key === "id") return 64;
  if (column.align === "right") return 88;
  return Math.max(96, String(column.label || column.key || "").length * 16 + 48);
}

function columnWidthOverride(column) {
  return props.columnWidths?.[column.key];
}

function columnSize(value) {
  if (Number.isFinite(value)) return `${Math.max(0, value)}px`;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function columnStyle(column) {
  const align = column.align || "left";
  const width = columnSize(columnWidthOverride(column)) || columnSize(column.width);
  const minWidth = columnSize(column.minWidth) || width || `${defaultColumnWidth(column)}px`;
  const maxWidth = columnSize(column.maxWidth);
  const style = {
    minWidth,
    textAlign: align
  };
  if (width) style.width = width;
  if (maxWidth) style.maxWidth = maxWidth;
  return style;
}
</script>
