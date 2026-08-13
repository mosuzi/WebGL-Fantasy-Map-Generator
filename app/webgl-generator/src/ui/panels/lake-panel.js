import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const LAKE_PANEL_ID = "lake-panel";
const LAKE_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 112,
  type: 76,
  cells: 64,
  area: 84,
  flux: 64
});
const LAKE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: LAKE_COLUMN_WIDTHS,
  sortKey: "area",
  sortDir: "desc"
});

export function createLakePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, LAKE_PANEL_ID, LAKE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    createMode: false,
    outletDraft: null,
    outletPreview: null,
    patchDraft: null,
    patchPreview: null,
    patchSelectMode: false,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, LAKE_PANEL_ID, {filter: value}, LAKE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, LAKE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, LAKE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, LAKE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, LAKE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => callbacks.onSelect?.(lakeObject(row)),
    onLocate: row => callbacks.onLocate?.(lakeObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, lakeObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onRename: (lakeId, name) => callbacks.onRename?.(lakeId, name),
    onRenameVisibleFromNamebase: lakeIds => callbacks.onRenameVisibleFromNamebase?.(lakeIds),
    onDelete: lakeId => callbacks.onDelete?.(lakeId),
    onDeleteMany: lakeIds => callbacks.onDeleteMany?.(lakeIds),
    onCreateMode: active => callbacks.onCreateMode?.(active),
    onOutletStart: lakeId => {
      const lake = findLake(panelState.map, lakeId);
      if (!lake) return;
      panelState.outletDraft = {lakeId: lake.id, outletRiverId: Number(lake.outlet) || 0};
      panelState.outletPreview = callbacks.onInspectOutlet?.(lake.id, panelState.outletDraft.outletRiverId) || null;
      panelState.version++;
    },
    onOutletDraft: outletRiverId => {
      if (!panelState.outletDraft) return;
      panelState.outletDraft = {...panelState.outletDraft, outletRiverId: Number(outletRiverId)};
      panelState.outletPreview = callbacks.onInspectOutlet?.(panelState.outletDraft.lakeId, panelState.outletDraft.outletRiverId) || null;
      panelState.version++;
    },
    onOutletApply: () => callbacks.onApplyOutlet?.(panelState.outletDraft?.lakeId, panelState.outletDraft?.outletRiverId),
    onPatchStart: lakeId => {
      panelState.patchDraft = {lakeId: Number(lakeId), target: "water", radius: 0, centerPackCell: null};
      panelState.patchPreview = null;
      panelState.version++;
    },
    onPatchDraft: patch => {
      if (!panelState.patchDraft) return;
      panelState.patchDraft = {...panelState.patchDraft, ...(patch || {})};
      panelState.patchPreview = Number.isInteger(panelState.patchDraft.centerPackCell)
        ? callbacks.onInspectPatch?.(panelState.patchDraft) || null
        : null;
      panelState.version++;
    },
    onPatchSelectMode: active => callbacks.onPatchSelectMode?.(Boolean(active), panelState.patchDraft),
    onPatchApply: () => callbacks.onApplyPatch?.(panelState.patchDraft),
    onEditCancel: kind => callbacks.onEditCancel?.(kind),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(LAKE_PANEL_ID, {
    title: "湖泊管理",
    left: 440,
    top: 88,
    width: 540,
    maxWidth: 660,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      callbacks.onClose?.();
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-lake-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/LakePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "湖泊管理将在首次打开时加载。",
      loading: "正在打开湖泊管理，请稍候片刻。",
      failure: "湖泊管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      panelState.open = true;
      panelState.version++;
      manager.open("lake-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      panelState.version++;
    },
    setSelection(selection) {
      panelState.selection = selection;
    },
    setCreateMode(active) {
      panelState.createMode = Boolean(active);
    },
    setPatchSelectMode(active) {
      panelState.patchSelectMode = Boolean(active);
      panelState.version++;
    },
    setPatchCell(packCell) {
      if (!panelState.patchDraft || !Number.isInteger(packCell)) return;
      panelState.patchDraft = {...panelState.patchDraft, centerPackCell: packCell};
      panelState.patchPreview = callbacks.onInspectPatch?.(panelState.patchDraft) || null;
      panelState.patchSelectMode = false;
      panelState.version++;
    },
    clearEditor(kind = "all") {
      if (kind === "all" || kind === "outlet") {
        panelState.outletDraft = null;
        panelState.outletPreview = null;
      }
      if (kind === "all" || kind === "patch") {
        panelState.patchDraft = null;
        panelState.patchPreview = null;
        panelState.patchSelectMode = false;
      }
      panelState.version++;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function lakeObject(row) {
  return {
    kind: "lake",
    id: row.id,
    name: row.name,
    type: row.rawType,
    area: row.area,
    cells: row.cells,
    height: row.height,
    flux: row.flux,
    evaporation: row.evaporation,
    firstCell: row.firstCell
  };
}

function findLake(map, lakeId) {
  const feature = map?.pack?.features?.[Number(lakeId)];
  if (!feature || feature.removed || feature.type !== "lake") return null;
  return {...feature, id: Number(feature.i ?? feature.id)};
}
