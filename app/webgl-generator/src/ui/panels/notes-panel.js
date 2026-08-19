import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const NOTES_PANEL_ID = "notes-panel";
const NOTES_COLUMN_WIDTHS = Object.freeze({
  kindLabel: 86,
  name: 150,
  excerpt: 240,
  bodyLength: 72
});
const NOTES_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: NOTES_COLUMN_WIDTHS,
  importMode: "append",
  importModes: Object.freeze(["append", "replace"]),
  sortKey: "updatedAt",
  sortDir: "desc"
});

export function createNotesPanel(documentRef, manager, callbacks = {}) {
  let pendingImportFile = null;
  const listPreferences = readPanelListPreferences(documentRef, NOTES_PANEL_ID, NOTES_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    notes: [],
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    importMode: listPreferences.importMode,
    importPreview: null,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedNoteId: null,
    createMode: false,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, NOTES_PANEL_ID, {filter: value}, NOTES_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "kindLabel" || key === "name" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, NOTES_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, NOTES_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, NOTES_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, NOTES_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedNoteId = row.id;
      callbacks.onSelect?.(row);
    },
    onLocate: row => {
      panelState.selectedNoteId = row.id;
      callbacks.onLocate?.(row);
    },
    onDelete: row => callbacks.onDelete?.(row),
    onDeleteBatch: rows => callbacks.onDeleteBatch?.(rows),
    onImportMode: mode => {
      panelState.importMode = mode === "replace" ? "replace" : "append";
      updatePanelListPreferences(documentRef, NOTES_PANEL_ID, {importMode: panelState.importMode}, NOTES_LIST_DEFAULTS);
      pendingImportFile = null;
      panelState.importPreview = null;
    },
    onImportPreview: async file => {
      const preview = await callbacks.onImportPreview?.(file, panelState.importMode);
      pendingImportFile = preview ? file : null;
      panelState.importPreview = preview || null;
    },
    onConfirmImport: async () => {
      if (!pendingImportFile || !panelState.importPreview?.canImport) return;
      const result = await callbacks.onImport?.(pendingImportFile, panelState.importMode);
      if (!result) return;
      pendingImportFile = null;
      panelState.importPreview = null;
    },
    onCancelImport: () => {
      pendingImportFile = null;
      panelState.importPreview = null;
    },
    onCreateStandaloneMode: active => callbacks.onCreateStandaloneMode?.(active),
    onRename: (row, name) => callbacks.onRename?.(row, name),
    onNoteChange: (row, body) => callbacks.onNoteChange?.(row, body),
    onExport: rows => callbacks.onExport?.(rows),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, row => row.object),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(NOTES_PANEL_ID, {
    title: "备注总览",
    left: 528,
    top: 128,
    width: 680,
    maxWidth: 820,
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
  root.className = "vue-notes-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/NotesPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "备注总览将在首次打开时加载。",
      loading: "正在打开备注总览，请稍候片刻。",
      failure: "备注总览加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.notes = markRaw(callbacks.listNotes?.() || []);
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (!noteExists(panelState.notes, panelState.selectedNoteId)) panelState.selectedNoteId = firstNoteId(panelState.notes);
      panelState.open = true;
      panelState.version++;
      manager.open("notes-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.notes = markRaw(callbacks.listNotes?.() || []);
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (!noteExists(panelState.notes, panelState.selectedNoteId)) panelState.selectedNoteId = firstNoteId(panelState.notes);
      panelState.version++;
    },
    setSelectedNoteId(noteId) {
      if (noteExists(panelState.notes, noteId)) panelState.selectedNoteId = noteId;
    },
    setCreateMode(active) {
      panelState.createMode = Boolean(active);
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function noteExists(notes, noteId) {
  if (!noteId) return false;
  return (notes || []).some(note => note?.id === noteId);
}

function firstNoteId(notes) {
  return (notes || []).find(note => note?.id)?.id ?? null;
}
