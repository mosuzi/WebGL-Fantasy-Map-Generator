import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createNotesPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "updatedAt",
    sortDir: "desc",
    selectedNoteId: null,
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
        panelState.sortDir = key === "kindLabel" || key === "name" ? "asc" : "desc";
      }
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
    onExport: rows => callbacks.onExport?.(rows),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("notes-panel", {
    title: "备注总览",
    left: 528,
    top: 128,
    width: 680,
    maxWidth: 820,
    onClose: () => {
      panelState.open = false;
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
      loading: "正在加载备注总览...",
      failure: "备注总览加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (!noteExists(map, panelState.selectedNoteId)) panelState.selectedNoteId = firstNoteId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("notes-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (!noteExists(map, panelState.selectedNoteId)) panelState.selectedNoteId = firstNoteId(map);
      panelState.version++;
    },
    setSelectedNoteId(noteId) {
      if (noteExists(panelState.map, noteId)) panelState.selectedNoteId = noteId;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function noteExists(map, noteId) {
  if (!noteId) return false;
  return (map?.notes?.notes || []).some(note => note?.id === noteId);
}

function firstNoteId(map) {
  return (map?.notes?.notes || []).find(note => note?.id)?.id ?? null;
}
