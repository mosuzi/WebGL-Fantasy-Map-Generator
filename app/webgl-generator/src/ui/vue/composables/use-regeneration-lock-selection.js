import {computed, onBeforeUnmount, reactive, ref, unref, watch} from "vue";
import {getRegenerationLockUiSession} from "../../../runtime/regeneration-lock-ui-session.js";
import {regenerationLockKey} from "../../../runtime/regeneration-locks.js";

export function useRegenerationLockSelection({
  panelId,
  kind,
  rows,
  mapSelectionContext = null,
  getReference = row => ({kind: unref(kind), id: row?.id})
}) {
  const session = getRegenerationLockUiSession();
  const snapshot = ref(emptySnapshot());
  const batchSelectionMode = ref(false);
  const unsubscribe = session?.subscribe(next => {
    snapshot.value = next;
  });

  const activeKind = computed(() => String(unref(kind) || ""));
  const rowReferences = computed(() => (unref(rows) || []).map(row => ({row, reference: getReference(row)}))
    .filter(item => item.reference?.kind === activeKind.value && safeReferenceKey(item.reference)));
  const references = computed(() => rowReferences.value.map(item => item.reference));
  const lockableRowIds = computed(() => rowReferences.value.map(item => item.row?.id));
  const selectedReferenceKeys = computed(() => new Set(snapshot.value.selectedReferences.map(safeReferenceKey).filter(Boolean)));
  const lockSelectionIds = computed(() => snapshot.value.panelId === panelId && snapshot.value.kind === activeKind.value
    ? rowReferences.value.filter(item => selectedReferenceKeys.value.has(regenerationLockKey(item.reference))).map(item => item.row?.id)
    : []);
  const selectedRows = computed(() => {
    const selectedIds = new Set(lockSelectionIds.value.map(String));
    return (unref(rows) || []).filter(row => selectedIds.has(String(row?.id)));
  });
  const lockedRowIds = computed(() => rowReferences.value
    .filter(item => snapshot.value.lockedKeys.has(regenerationLockKey(item.reference)))
    .map(item => item.row?.id));
  const mapSelectionActive = computed(() => snapshot.value.panelId === panelId
    && snapshot.value.kind === activeKind.value
    && snapshot.value.mapSelectionActive);
  const selectedCount = computed(() => snapshot.value.panelId === panelId && snapshot.value.kind === activeKind.value
    ? snapshot.value.selectedCount
    : 0);

  watch(activeKind, () => {
    batchSelectionMode.value = false;
    session?.activate(panelId, activeKind.value);
  });
  watch(
    () => rowReferences.value.map(item => `${item.row?.id}:${safeReferenceKey(item.reference)}`).join("|"),
    () => {
      if (snapshot.value.panelId !== panelId || snapshot.value.kind !== activeKind.value) return;
      const visibleKeys = new Set(rowReferences.value.map(item => safeReferenceKey(item.reference)));
      const retained = snapshot.value.selectedReferences.filter(reference => visibleKeys.has(safeReferenceKey(reference)));
      if (retained.length !== snapshot.value.selectedReferences.length) session?.replace(panelId, activeKind.value, retained);
    }
  );

  onBeforeUnmount(() => {
    unsubscribe?.();
  });

  function referenceForRow(row) {
    return getReference(row);
  }

  function handleLockToggle({row, locked}) {
    session?.setOne(referenceForRow(row), locked);
  }

  function handleSelectionChange(ids) {
    const selectedKeys = new Set((ids || []).map(String));
    session?.replace(panelId, activeKind.value, rowReferences.value
      .filter(item => selectedKeys.has(String(item.row?.id)))
      .map(item => item.reference));
  }

  function handleRangeSelection({rows: rangeRows, selected}) {
    session?.toggleRange(panelId, activeKind.value, (rangeRows || []).map(referenceForRow), selected);
  }

  function handleBatchRowToggle(row) {
    session?.toggle(panelId, activeKind.value, referenceForRow(row));
  }

  const tableProps = reactive({
    showRegenerationLock: true,
    get lockedRowIds() {
      return lockedRowIds.value;
    },
    get lockableRowIds() {
      return lockableRowIds.value;
    },
    get lockSelectionIds() {
      return lockSelectionIds.value;
    },
    get batchLockSelectionMode() {
      return batchSelectionMode.value;
    }
  });
  const tableListeners = {
    "lock-toggle": handleLockToggle,
    "lock-selection-change": handleSelectionChange,
    "lock-range-selection": handleRangeSelection,
    "batch-row-toggle": handleBatchRowToggle
  };
  const actionProps = reactive({
    get selectedCount() {
      return selectedCount.value;
    },
    get batchSelectionMode() {
      return batchSelectionMode.value;
    },
    get mapSelectionActive() {
      return mapSelectionActive.value;
    }
  });
  const actionListeners = {
    "toggle-batch-mode": () => {
      batchSelectionMode.value = !batchSelectionMode.value;
    },
    "map-select": () => session?.beginMapSelection(panelId, activeKind.value, unref(mapSelectionContext) || {}),
    lock: () => session?.apply(true),
    unlock: () => session?.apply(false),
    clear: () => session?.clear()
  };

  return {
    batchSelectionMode,
    lockableRowIds,
    lockSelectionIds,
    lockedRowIds,
    mapSelectionActive,
    selectedCount,
    selectedRows,
    handleLockToggle,
    handleSelectionChange,
    handleRangeSelection,
    handleBatchRowToggle,
    lockSelected: () => session?.apply(true),
    unlockSelected: () => session?.apply(false),
    clearSelection: () => session?.clear(),
    startMapSelection: () => session?.beginMapSelection(panelId, activeKind.value, unref(mapSelectionContext) || {}),
    tableProps,
    tableListeners,
    actionProps,
    actionListeners
  };
}

function safeReferenceKey(reference) {
  try {
    return regenerationLockKey(reference);
  } catch {
    return "";
  }
}

function emptySnapshot() {
  return {
    panelId: null,
    kind: null,
    selectedIds: [],
    selectedReferences: [],
    lockedKeys: new Set(),
    mapSelectionActive: false
  };
}
