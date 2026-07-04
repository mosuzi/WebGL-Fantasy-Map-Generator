import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createRiverPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    editingObject: null,
    history: null,
    filter: "",
    sortKey: "flux",
    sortDir: "desc",
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
        panelState.sortDir = key === "id" ? "asc" : "desc";
      }
    },
    onSelect: row => callbacks.onSelect?.(riverObject(row)),
    onLocate: row => callbacks.onLocate?.(riverObject(row)),
    onEdit: row => callbacks.onEdit?.(riverObject(row)),
    onRename: (riverId, name) => callbacks.onRename?.(riverId, name),
    onRenameVisibleFromNamebase: riverIds => callbacks.onRenameVisibleFromNamebase?.(riverIds),
    onSetWidthFactor: (riverId, widthFactor) => callbacks.onSetWidthFactor?.(riverId, widthFactor),
    onNoteChange: (riverId, body) => callbacks.onNoteChange?.(riverId, body),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("river-panel", {
    title: "河流管理",
    left: 380,
    top: 56,
    width: 520,
    maxWidth: 620,
    onClose: () => {
      panelState.open = false;
      callbacks.onClose?.();
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-river-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/RiverPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "河流管理将在首次打开时加载。",
      loading: "正在加载河流管理...",
      failure: "河流管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history, editingObject = panelState.editingObject) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.editingObject = editingObject;
      panelState.history = history;
      panelState.open = true;
      panelState.version++;
      manager.open("river-panel");
      lazyPanel.load();
    },
    update(map, selection, history, editingObject = panelState.editingObject) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.editingObject = editingObject;
      panelState.history = history;
      panelState.version++;
    },
    setSelection(selection, editingObject = panelState.editingObject) {
      panelState.selection = selection;
      panelState.editingObject = editingObject;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function riverObject(row) {
  return {
    kind: "river",
    id: row.id,
    name: row.name,
    type: row.type,
    flux: row.flux,
    length: Math.round(row.length),
    distance: 0
  };
}
