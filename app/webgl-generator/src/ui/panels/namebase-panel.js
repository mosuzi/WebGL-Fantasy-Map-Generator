import {shallowReactive} from "vue";
import {getNamebaseBindingStatus, getNamebaseSummariesForMap} from "../../generator/namebase-store.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createNamebasePanel(documentRef, manager, callbacks = {}) {
  let pendingImportFile = null;
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    summaries: getNamebaseSummariesForMap(null, {includeSource: true}),
    bindingStatus: getNamebaseBindingStatus(null),
    filter: "",
    importMode: "append",
    importPreview: null,
    sortKey: "category",
    sortDir: "asc",
    selectedNamebaseId: null,
    focusCultureId: "",
    focusCultureNonce: 0,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "category" || key === "name" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedNamebaseId = row.id;
    },
    onExport: () => callbacks.onExport?.(),
    onExportLegacy: () => callbacks.onExportLegacy?.(),
    onImportMode: mode => {
      panelState.importMode = mode;
      pendingImportFile = null;
      clearImportPreview(panelState);
    },
    onImportPreview: async file => {
      const preview = await callbacks.onImportPreview?.(file, panelState.importMode);
      if (!preview) {
        pendingImportFile = null;
        panelState.importPreview = null;
        return;
      }
      pendingImportFile = file;
      panelState.importPreview = preview;
    },
    onConfirmImport: async () => {
      if (!pendingImportFile) return;
      const result = await callbacks.onImport?.(pendingImportFile, panelState.importMode);
      if (result) {
        pendingImportFile = null;
        clearImportPreview(panelState);
      }
    },
    onCancelImport: () => {
      pendingImportFile = null;
      clearImportPreview(panelState);
    },
    onCreateUser: () => {
      const result = callbacks.onCreateUser?.();
      if (result?.id) panelState.selectedNamebaseId = result.id;
    },
    onCopyBuiltin: row => callbacks.onCopyBuiltin?.(row),
    onRenameUser: (row, name) => callbacks.onRenameUser?.(row, name),
    onUpdateSource: (row, sourceText) => callbacks.onUpdateSource?.(row, sourceText),
    onUpdateOptions: (row, options) => callbacks.onUpdateOptions?.(row, options),
    onDeleteUser: row => callbacks.onDeleteUser?.(row),
    onClearUser: () => callbacks.onClearUser?.(),
    onSetGlobalBinding: (target, value) => callbacks.onSetGlobalBinding?.(target, value),
    onSetCultureBinding: (cultureId, target, value) => callbacks.onSetCultureBinding?.(cultureId, target, value),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("namebase-panel", {
    title: "名称库总览",
    left: 548,
    top: 148,
    width: 760,
    maxWidth: 920,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-namebase-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/NamebasePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "名称库总览将在首次打开时加载。",
      loading: "正在加载名称库总览...",
      failure: "名称库总览加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map = null, options = {}) {
      pendingImportFile = null;
      clearImportPreview(panelState);
      panelState.map = map;
      const cultureId = options.cultureId ?? "";
      if (cultureId !== "") {
        panelState.focusCultureId = String(cultureId);
        panelState.focusCultureNonce++;
      }
      panelState.history = options.history || null;
      refreshSummaries(panelState);
      panelState.open = true;
      panelState.version++;
      manager.open("namebase-panel");
      lazyPanel.load();
    },
    update(map = null, history = null) {
      pendingImportFile = null;
      clearImportPreview(panelState);
      panelState.map = map;
      panelState.history = history;
      refreshSummaries(panelState);
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

function refreshSummaries(panelState) {
  panelState.summaries = getNamebaseSummariesForMap(panelState.map, {includeSource: true});
  panelState.bindingStatus = getNamebaseBindingStatus(panelState.map);
  if (!panelState.selectedNamebaseId || !panelState.summaries.some(row => row.id === panelState.selectedNamebaseId)) {
    panelState.selectedNamebaseId = panelState.summaries[0]?.id || null;
  }
}

function clearImportPreview(panelState) {
  panelState.importPreview = null;
}
