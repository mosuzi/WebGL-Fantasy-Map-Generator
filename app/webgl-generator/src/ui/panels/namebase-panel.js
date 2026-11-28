import {shallowReactive} from "vue";
import {getNamebaseBindingStatus, getNamebaseSummariesForMap} from "../../generator/namebase-store.js";
import {projectCultureDirectory} from "../../runtime/culture-directory.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const NAMEBASE_PANEL_ID = "namebase-panel";
const NAMEBASE_COLUMN_WIDTHS = Object.freeze({
  category: 76,
  origin: 60,
  name: 112,
  kind: 76,
  samples: 60,
  duplicateSamples: 60,
  lengthRange: 60,
  bindingUsageLabel: 108
});
const NAMEBASE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: NAMEBASE_COLUMN_WIDTHS,
  importMode: "append",
  importModes: Object.freeze(["append", "replace"]),
  sortKey: "category",
  sortDir: "asc"
});

export function createNamebasePanel(documentRef, manager, callbacks = {}, {mapPublication, readHistory} = {}) {
  let pendingImportFile = null;
  let summariesDirty = true;
  const listPreferences = readPanelListPreferences(documentRef, NAMEBASE_PANEL_ID, NAMEBASE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    cultures: [],
    history: null,
    summaries: getNamebaseSummariesForMap(null, {includeSource: true}),
    bindingStatus: getNamebaseBindingStatus(null),
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    importMode: listPreferences.importMode,
    importPreview: null,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedNamebaseId: null,
    focusCultureId: "",
    focusCultureNonce: 0,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, NAMEBASE_PANEL_ID, {filter: value}, NAMEBASE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "category" || key === "name" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, NAMEBASE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, NAMEBASE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, NAMEBASE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, NAMEBASE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedNamebaseId = row.id;
    },
    onExport: rows => callbacks.onExport?.(rows),
    onExportLegacy: rows => callbacks.onExportLegacy?.(rows),
    onImportMode: mode => {
      panelState.importMode = mode === "replace" ? "replace" : "append";
      updatePanelListPreferences(documentRef, NAMEBASE_PANEL_ID, {importMode: panelState.importMode}, NAMEBASE_LIST_DEFAULTS);
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

  const record = manager.registerPanel(NAMEBASE_PANEL_ID, {
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
      loading: "正在打开名称库总览，请稍候片刻。",
      failure: "名称库总览加载失败，请检查开发模式日志。"
    }
  );

  const stopDirectory = mapPublication?.subscribe(["culture", "culture-directory", "regeneration", "society"], ({map}) => {
    setMap(map);
    panelState.cultures = projectCultureDirectory(map, panelState.cultures);
  });
  const stopNamebases = mapPublication?.subscribe(["namebase", "namebase-rule", "namebase-binding"], ({map}) => {
    setMap(map);
    invalidateSummaries();
    if (panelState.open) refreshSummariesIfNeeded();
  });
  const stopHistory = mapPublication?.subscribe(["*"], () => {
    if (panelState.open) panelState.history = readHistory?.() || null;
  });

  function setMap(map) {
    if (panelState.map === map) return;
    panelState.map = map;
    panelState.cultures = projectCultureDirectory(map, panelState.cultures);
    invalidateSummaries();
  }

  function invalidateSummaries() {
    summariesDirty = true;
    pendingImportFile = null;
    clearImportPreview(panelState);
  }

  function refreshSummariesIfNeeded() {
    if (!summariesDirty) return;
    refreshSummaries(panelState);
    summariesDirty = false;
    panelState.version++;
  }

  return {
    open(map = null, options = {}) {
      pendingImportFile = null;
      clearImportPreview(panelState);
      setMap(map);
      const cultureId = options.cultureId ?? "";
      if (cultureId !== "") {
        panelState.focusCultureId = String(cultureId);
        panelState.focusCultureNonce++;
      }
      panelState.history = options.history || null;
      refreshSummariesIfNeeded();
      panelState.open = true;
      manager.open("namebase-panel");
      lazyPanel.load();
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      stopDirectory?.();
      stopNamebases?.();
      stopHistory?.();
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
