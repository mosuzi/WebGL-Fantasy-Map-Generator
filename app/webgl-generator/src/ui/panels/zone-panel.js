import {markRaw, shallowReactive} from "vue";
import {OBJECT_KIND} from "../../runtime/object-kinds.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createZonePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "id",
    sortDir: "asc",
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
    onSelect: row => callbacks.onSelect?.(zoneObject(row)),
    onLocate: row => callbacks.onLocate?.(zoneObject(row))
  };

  const record = manager.registerPanel("zone-panel", {
    title: "地区管理",
    left: 520,
    top: 96,
    width: 560,
    maxWidth: 700,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-zone-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/ZonePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "地区管理将在首次打开时加载。",
      loading: "正在加载地区管理...",
      failure: "地区管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      panelState.open = true;
      panelState.version++;
      manager.open("zone-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      panelState.version++;
    },
    setSelection(selection) {
      panelState.selection = selection;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function zoneObject(row) {
  return {
    kind: OBJECT_KIND.ZONE,
    id: row.id,
    name: row.name,
    type: row.rawType,
    typeLabel: row.type,
    pattern: row.pattern,
    color: row.color,
    cells: row.cells,
    area: row.area,
    states: row.states
  };
}
