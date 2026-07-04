import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createLakePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "area",
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
    onSelect: row => callbacks.onSelect?.(lakeObject(row)),
    onLocate: row => callbacks.onLocate?.(lakeObject(row)),
    onRename: (lakeId, name) => callbacks.onRename?.(lakeId, name),
    onRenameVisibleFromNamebase: lakeIds => callbacks.onRenameVisibleFromNamebase?.(lakeIds),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("lake-panel", {
    title: "湖泊管理",
    left: 440,
    top: 88,
    width: 540,
    maxWidth: 660,
    onClose: () => {
      panelState.open = false;
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
      loading: "正在加载湖泊管理...",
      failure: "湖泊管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      panelState.open = true;
      panelState.version++;
      manager.open("lake-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
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
