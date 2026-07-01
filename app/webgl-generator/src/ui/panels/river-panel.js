import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import RiverPanel from "../vue/components/RiverPanel.vue";

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
  const app = createApp(RiverPanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, selection, history, editingObject = panelState.editingObject) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.editingObject = editingObject;
      panelState.history = history;
      panelState.open = true;
      panelState.version++;
      manager.open("river-panel");
    },
    update(map, selection, history, editingObject = panelState.editingObject) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.editingObject = editingObject;
      panelState.history = history;
      panelState.version++;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      app.unmount();
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
