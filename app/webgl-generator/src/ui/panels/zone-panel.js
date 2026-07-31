import {markRaw, shallowReactive} from "vue";
import {OBJECT_KIND} from "../../runtime/object-kinds.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const ZONE_PANEL_ID = "zone-panel";
const ZONE_COLUMN_WIDTHS = Object.freeze({
  id: 54,
  name: 150,
  type: 80,
  patternLabel: 82,
  cells: 64,
  statesLabel: 130
});
const ZONE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: ZONE_COLUMN_WIDTHS,
  sortKey: "id",
  sortDir: "asc"
});

export function createZonePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, ZONE_PANEL_ID, ZONE_LIST_DEFAULTS);
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
    createType: "Disaster",
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, ZONE_PANEL_ID, {filter: value}, ZONE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, ZONE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, ZONE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, ZONE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, ZONE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => callbacks.onSelect?.(zoneObject(row)),
    onLocate: row => callbacks.onLocate?.(zoneObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, zoneObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onStyleChange: (zoneId, patch) => callbacks.onStyleChange?.(zoneId, patch),
    onPropertiesChange: (zoneId, patch) => callbacks.onPropertiesChange?.(zoneId, patch),
    onCreateMode: type => callbacks.onCreateMode?.(type),
    onDelete: zoneId => callbacks.onDelete?.(zoneId),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(ZONE_PANEL_ID, {
    title: "地区管理",
    left: 520,
    top: 96,
    width: 560,
    maxWidth: 700,
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
      syncPanelHighlightCount(panelState, callbacks);
      panelState.open = true;
      panelState.version++;
      manager.open("zone-panel");
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
    setCreateMode(active, type = panelState.createType) {
      panelState.createMode = Boolean(active);
      panelState.createType = type || "Disaster";
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
