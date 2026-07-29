<template>
  <div ref="tableWrap" class="object-table-wrap" :style="objectTableGeometryStyle" @scroll.passive="handleScroll">
    <table v-if="rows.length" class="object-table object-table-native">
      <thead>
        <tr>
          <th v-if="selectionColumnVisible" class="object-table-selection-column">
            <label class="object-table-selection-hit" @click="stopSelectionEvent">
              <input
                class="object-table-selection-checkbox object-table-select-all-checkbox"
                type="checkbox"
                :checked="allRowsSelected"
                :indeterminate="partialRowsSelected"
                :aria-checked="selectionHeaderState"
                aria-label="选择当前列表"
                @change="handleSelectAllChange"
              />
            </label>
          </th>
          <th
            v-for="column in columns"
            :key="column.key"
            :style="columnStyle(column)"
            :class="{'object-table-resizable-column': columnResizable(column)}"
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
            <button
              v-if="columnResizable(column)"
              class="object-table-column-resize-handle"
              type="button"
              :aria-label="`调整${column.label}列宽`"
              title="拖拽调整列宽"
              @pointerdown.stop.prevent="startColumnResize($event, column)"
            ></button>
          </th>
          <th v-if="showRegenerationLock" class="object-table-lock-column">重生成锁</th>
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
          v-memo="[rowKey(row), row, isSelected(row), rowSelectionChecked(row), rowLocked(row), rowLockable(row), columnLayoutSignature]"
          class="object-table-row"
          :class="{'selected-row': isSelected(row), 'is-selected': isSelected(row)}"
          :aria-selected="isSelected(row) ? 'true' : 'false'"
          :data-ui-state="isSelected(row) ? 'selected' : undefined"
          @click="event => handleRowClick(row, event)"
          @dblclick="handleRowDoubleClick(row)"
        >
          <td v-if="selectionColumnVisible" class="object-table-selection-cell">
            <label
              class="object-table-selection-hit"
              @click="event => handleSelectionHitClick(row, event)"
            >
              <input
                class="object-table-selection-checkbox object-table-row-selection-checkbox"
                type="checkbox"
                :checked="rowSelectionChecked(row)"
                :aria-label="`选择 ${rowKey(row)}`"
                @click="event => rememberSelectionModifiers(row, event, false, true)"
                @change="event => handleRowSelectionChange(row, event.target.checked)"
              />
            </label>
          </td>
          <td v-if="showRegenerationLock" class="object-table-lock-cell">
            <button
              v-if="rowLockable(row)"
              class="table-icon-action object-table-lock-action"
              type="button"
              :title="rowLocked(row) ? '解除重生成锁定' : '锁定以防重新生成'"
              :aria-label="rowLocked(row) ? '解除重生成锁定' : '锁定以防重新生成'"
              :aria-pressed="rowLocked(row) ? 'true' : 'false'"
              @click.stop="emit('lock-toggle', {row, locked: !rowLocked(row)})"
            >
              <ElIcon aria-hidden="true"><Lock v-if="rowLocked(row)" /><Unlock v-else /></ElIcon>
            </button>
            <span v-else aria-label="不可锁定">—</span>
          </td>
          <td
            v-for="column in columns"
            :key="column.key"
            :style="columnStyle(column)"
          >
            <span v-if="column.type === 'color'" class="object-table-cell object-table-color-cell">
              <i :style="{backgroundColor: row[column.key]}" aria-hidden="true"></i>
              {{ formatCell(column, row) }}
            </span>
            <span v-else class="object-table-cell">{{ formatCell(column, row) }}</span>
          </td>
          <td v-if="showLocateAction" class="object-table-action-cell">
            <button class="table-icon-action" type="button" title="定位" aria-label="定位" @click.stop="emit('locate', row)">
              <ElIcon aria-hidden="true"><Location /></ElIcon>
            </button>
          </td>
        </tr>
        <tr v-if="virtualBottomPadding" class="object-table-spacer-row" aria-hidden="true">
          <td :colspan="columnSpan" :style="spacerStyle(virtualBottomPadding)"></td>
        </tr>
      </tbody>
    </table>
    <div v-else class="object-table-empty is-empty" data-ui-state="empty">
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
import {Location, Lock, Unlock} from "@element-plus/icons-vue";
import {objectIdKey, sameObjectId} from "../../../object-id.js";
import {
  centerVirtualRowVertically,
  createSelectionCenterController,
  selectionCenterAnchor,
  selectionOrderSignature,
  stickyTableViewportInsets
} from "../../../components/selection-scroll.js";
import {objectTableSelectionRange} from "./object-table-selection.js";
import {OBJECT_TABLE_ROW_HEIGHT} from "./object-table-geometry.js";
import {
  captureObjectTableSelectionEvent,
  captureObjectTableSelectionHitClick,
  consumeObjectTableSelectionModifiers,
  createObjectTableSelectionEventState,
  stopObjectTableSelectionEvent
} from "./object-table-selection-events.js";
import {beginDirectManipulationSession} from "../../../../runtime/direct-manipulation-session.js";

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
    default: "none",
    validator: value => ["none", "edit"].includes(value)
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
  },
  resizableColumns: {
    type: Boolean,
    default: false
  },
  selectableRows: {
    type: Boolean,
    default: false
  },
  selectedRowIds: {
    type: Array,
    default: () => []
  },
  showRegenerationLock: {
    type: Boolean,
    default: false
  },
  lockedRowIds: {
    type: Array,
    default: () => []
  },
  lockableRowIds: {
    type: Array,
    default: () => []
  },
  lockSelectionIds: {
    type: Array,
    default: () => []
  },
  batchLockSelectionMode: {
    type: Boolean,
    default: false
  }
});

const VIRTUAL_THRESHOLD = 120;
const VIRTUAL_OVERSCAN_ROWS = 8;
const MIN_RESIZE_COLUMN_WIDTH = 32;
const MAX_RESIZE_COLUMN_WIDTH = 640;

const emit = defineEmits(["select", "locate", "edit", "empty-action", "sort", "column-resize", "selection-change", "lock-toggle", "lock-selection-change", "lock-range-selection", "batch-row-toggle"]);

const tableWrap = ref(null);
const objectTableGeometryStyle = Object.freeze({"--object-table-row-height": `${OBJECT_TABLE_ROW_HEIGHT}px`});
const scrollTop = ref(0);
const viewportHeight = ref(300);
let scrollMetricsFrame = 0;
let resizeState = null;
const previewColumnWidths = ref({});
const selectionEventState = createObjectTableSelectionEventState();
let lockSelectionAnchor = null;

const selectionColumnVisible = computed(() => props.selectableRows || props.showRegenerationLock);
const columnSpan = computed(() => props.columns.length + (props.showLocateAction ? 1 : 0) + (selectionColumnVisible.value ? 1 : 0) + (props.showRegenerationLock ? 1 : 0));
const virtualEnabled = computed(() => props.rows.length > VIRTUAL_THRESHOLD);
const virtualWindow = computed(() => {
  if (!virtualEnabled.value) return {start: 0, end: props.rows.length};
  const visibleCount = Math.max(1, Math.ceil(viewportHeight.value / OBJECT_TABLE_ROW_HEIGHT));
  const start = Math.max(0, Math.floor(scrollTop.value / OBJECT_TABLE_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS);
  const end = Math.min(props.rows.length, start + visibleCount + VIRTUAL_OVERSCAN_ROWS * 2);
  return {start, end};
});
const visibleRows = computed(() => props.rows.slice(virtualWindow.value.start, virtualWindow.value.end));
const virtualTopPadding = computed(() => virtualEnabled.value ? virtualWindow.value.start * OBJECT_TABLE_ROW_HEIGHT : 0);
const virtualBottomPadding = computed(() => virtualEnabled.value ? Math.max(0, props.rows.length - virtualWindow.value.end) * OBJECT_TABLE_ROW_HEIGHT : 0);
const sortableKeys = computed(() => new Set((props.sortOptions || []).map(option => option?.key).filter(Boolean)));
const sortIndicator = computed(() => props.sortDirection === "asc" ? "↑" : "↓");
const effectiveSelectionIds = computed(() => props.showRegenerationLock ? props.lockSelectionIds : props.selectedRowIds);
const selectedRowKeySet = computed(() => new Set(effectiveSelectionIds.value.map(id => stringRowId(id))));
const lockedRowKeySet = computed(() => new Set(props.lockedRowIds.map(id => stringRowId(id))));
const lockableRowKeySet = computed(() => new Set(props.lockableRowIds.map(id => stringRowId(id))));
const allRowsSelected = computed(() => Boolean(props.rows.length) && props.rows.every(row => rowSelectionChecked(row)));
const someRowsSelected = computed(() => props.rows.some(row => rowSelectionChecked(row)));
const partialRowsSelected = computed(() => someRowsSelected.value && !allRowsSelected.value);
const selectionHeaderState = computed(() => {
  if (allRowsSelected.value) return "true";
  if (partialRowsSelected.value) return "mixed";
  return "false";
});
const columnLayoutSignature = computed(() => props.columns.map(column => [
  column.key,
  columnWidthOverride(column),
  column.width,
  column.minWidth,
  column.maxWidth,
  column.align
].join(":")).join("|"));
const selectedRowPosition = computed(() => selectedRowIndex());
const rowOrderSignature = computed(() => selectionOrderSignature(props.rows.map(row => rowKey(row))));
const selectedScrollAnchor = computed(() => selectionCenterAnchor(
  props.selectedId === null || props.selectedId === undefined ? null : objectIdKey(props.selectedId),
  selectedRowPosition.value,
  rowOrderSignature.value
));
const selectedCenterController = createSelectionCenterController({
  getScroller: () => tableScroller(tableWrap.value),
  getTarget: () => tableWrap.value?.querySelector(".object-table-row.selected-row"),
  getViewportInsets: scroller => tableViewportInsets(scroller),
  prepareTarget: scroller => {
    if (!virtualEnabled.value || selectedRowPosition.value < 0) return;
    centerVirtualRowVertically(scroller, selectedRowPosition.value, OBJECT_TABLE_ROW_HEIGHT, tableViewportInsets(scroller));
    refreshScrollMetrics();
  },
  onSettled: refreshScrollMetrics
});

watch(
  selectedScrollAnchor,
  () => scrollSelectedRowIntoView(),
  {flush: "post", immediate: true}
);

onMounted(() => {
  refreshScrollMetrics();
  scrollSelectedRowIntoView();
});

onBeforeUnmount(() => {
  selectedCenterController.cancel();
  cancelScrollMetricsFrame();
  stopColumnResize();
});

function getRowId(row) {
  return row?.[props.rowIdKey];
}

function isSelected(row) {
  return sameObjectId(getRowId(row), props.selectedId);
}

function rowSelectionChecked(row) {
  return selectedRowKeySet.value.has(rowKey(row));
}

function rowKey(row) {
  return stringRowId(getRowId(row));
}

function handleRowClick(row, event) {
  if (props.showRegenerationLock && props.batchLockSelectionMode) {
    if (event.shiftKey) emitRangeSelection(row, !rowSelectionChecked(row));
    else emit("batch-row-toggle", row);
    lockSelectionAnchor = rowKey(row);
    return;
  }
  emit("select", row);
}

function handleRowDoubleClick(row) {
  if (props.doubleClickAction !== "edit") return;
  emit("edit", row);
}

function handleHeaderSort(column) {
  if (!sortableColumn(column)) return;
  emit("sort", columnSortKey(column));
}

function handleSelectAllChange(event) {
  const checked = Boolean(event.target.checked);
  const currentRows = props.rows || [];
  const currentKeys = new Set(currentRows.map(row => rowKey(row)));
  const selected = new Map(effectiveSelectionIds.value.map(id => [stringRowId(id), id]));
  if (checked) {
    for (const row of currentRows) selected.set(rowKey(row), getRowId(row));
  } else {
    for (const key of currentKeys) selected.delete(key);
  }
  emitSelectionChange(Array.from(selected.values()));
}

function handleRowSelectionChange(row, checked) {
  const selectionModifiers = consumeObjectTableSelectionModifiers(selectionEventState);
  if (props.showRegenerationLock && selectionModifiers?.shiftKey) {
    emitRangeSelection(row, checked);
    return;
  }
  const key = rowKey(row);
  const selected = new Map(effectiveSelectionIds.value.map(id => [stringRowId(id), id]));
  if (checked) selected.set(key, getRowId(row));
  else selected.delete(key);
  lockSelectionAnchor = key;
  emitSelectionChange(Array.from(selected.values()));
}

function rememberSelectionModifiers(row, event, stopPropagation = false, preserveExisting = false) {
  captureObjectTableSelectionEvent(selectionEventState, event, {stopPropagation, preserveExisting});
  if (!event.shiftKey) lockSelectionAnchor = rowKey(row);
}

function handleSelectionHitClick(row, event) {
  if (captureObjectTableSelectionHitClick(selectionEventState, event) && !event.shiftKey) lockSelectionAnchor = rowKey(row);
}

function stopSelectionEvent(event) {
  stopObjectTableSelectionEvent(event);
}

function emitRangeSelection(row, selected) {
  const rangeRows = objectTableSelectionRange(props.rows, lockSelectionAnchor, rowKey(row), rowKey);
  if (!rangeRows) {
    emitSelectionChange([getRowId(row)]);
    return;
  }
  emit("lock-range-selection", {rows: rangeRows, selected});
}

function emitSelectionChange(ids) {
  if (props.showRegenerationLock) emit("lock-selection-change", ids);
  emit("selection-change", ids);
}

function rowLocked(row) {
  return lockedRowKeySet.value.has(rowKey(row));
}

function rowLockable(row) {
  return lockableRowKeySet.value.has(rowKey(row));
}

function startColumnResize(event, column) {
  if (!columnResizable(column)) return;
  const view = tableWrap.value?.ownerDocument?.defaultView;
  if (!view) return;
  resizeState?.session.cancel("restart");
  const captureTarget = event.currentTarget;
  const startWidth = currentHeaderWidth(captureTarget, column);
  resizeState = {
    view,
    column,
    pointerId: event.pointerId,
    captureTarget,
    startX: event.clientX,
    startWidth,
    width: startWidth
  };
  const state = resizeState;
  captureTarget?.setPointerCapture?.(event.pointerId);
  state.session = beginDirectManipulationSession({
    kind: "object-table-column",
    pointerId: event.pointerId,
    captureTarget,
    onCommit: () => {
      if (state.width === state.startWidth) return;
      emit("column-resize", {key: state.column.key, width: state.width});
    },
    onCleanup: () => {
      const nextPreview = {...previewColumnWidths.value};
      delete nextPreview[state.column.key];
      previewColumnWidths.value = nextPreview;
      state.view?.removeEventListener?.("pointermove", handleColumnResizeMove);
      state.view?.removeEventListener?.("pointerup", stopColumnResize);
      state.view?.removeEventListener?.("pointercancel", stopColumnResize);
      state.captureTarget?.removeEventListener?.("lostpointercapture", stopColumnResize);
      if (resizeState === state) resizeState = null;
    }
  });
  view.addEventListener("pointermove", handleColumnResizeMove);
  view.addEventListener("pointerup", stopColumnResize);
  view.addEventListener("pointercancel", stopColumnResize);
  captureTarget?.addEventListener?.("lostpointercapture", stopColumnResize);
}

function handleColumnResizeMove(event) {
  if (!resizeState) return;
  const delta = event.clientX - resizeState.startX;
  const width = clampColumnWidth(resizeState.startWidth + delta);
  resizeState.width = width;
  previewColumnWidths.value = {...previewColumnWidths.value, [resizeState.column.key]: width};
}

function stopColumnResize(event) {
  if (!resizeState) return;
  if (event?.pointerId !== undefined && event.pointerId !== resizeState.pointerId) return;
  resizeState.session.finish(event?.type === "pointerup" ? "pointerup" : event?.type || "unmount", event);
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
  if (selectedRowPosition.value < 0) return;
  nextTick(() => selectedCenterController.request());
}

function cancelScrollMetricsFrame() {
  if (!scrollMetricsFrame) return;
  const view = tableWrap.value?.ownerDocument?.defaultView;
  view?.cancelAnimationFrame?.(scrollMetricsFrame);
  scrollMetricsFrame = 0;
}

function tableScroller(wrap) {
  return wrap;
}

function tableViewportInsets(scroller) {
  return stickyTableViewportInsets(scroller, scroller?.querySelector?.("thead"));
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

function columnResizable(column) {
  return props.resizableColumns && column?.resizable !== false && Boolean(column?.key);
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
  return previewColumnWidths.value[column.key] ?? props.columnWidths?.[column.key];
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

function currentHeaderWidth(handle, column) {
  const header = handle?.closest?.("th");
  const measured = header?.getBoundingClientRect?.().width;
  if (Number.isFinite(measured) && measured > 0) return measured;
  const override = Number(columnWidthOverride(column));
  if (Number.isFinite(override)) return override;
  if (Number.isFinite(column.width)) return column.width;
  return defaultColumnWidth(column);
}

function clampColumnWidth(value) {
  if (!Number.isFinite(value)) return MIN_RESIZE_COLUMN_WIDTH;
  return Math.round(Math.min(MAX_RESIZE_COLUMN_WIDTH, Math.max(MIN_RESIZE_COLUMN_WIDTH, value)));
}
</script>
