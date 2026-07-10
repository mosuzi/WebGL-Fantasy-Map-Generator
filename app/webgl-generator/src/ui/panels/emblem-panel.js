import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const EMBLEM_PANEL_ID = "emblem-panel";
const EMBLEM_COLUMN_WIDTHS = Object.freeze({
  scopeLabel: 76,
  name: 140,
  shield: 92,
  fieldColor: 96,
  chargeSummary: 120,
  status: 76
});
const EMBLEM_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: EMBLEM_COLUMN_WIDTHS,
  sortKey: "scope",
  sortDir: "asc"
});

export function createEmblemPanel(documentRef, manager) {
  const listPreferences = readPanelListPreferences(documentRef, EMBLEM_PANEL_ID, EMBLEM_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedEmblemId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, EMBLEM_PANEL_ID, {filter: value}, EMBLEM_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "scope" || key === "name" || key === "shield" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, EMBLEM_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, EMBLEM_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, EMBLEM_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, EMBLEM_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedEmblemId = row.id;
    }
  };

  const record = manager.registerPanel(EMBLEM_PANEL_ID, {
    title: "纹章统计",
    left: 520,
    top: 148,
    width: 620,
    maxWidth: 760,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-emblem-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/EmblemPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "纹章统计将在首次打开时加载。",
      loading: "正在加载纹章统计...",
      failure: "纹章统计加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!emblemRowExists(map, panelState.selectedEmblemId)) panelState.selectedEmblemId = firstEmblemRowId(map);
      panelState.open = true;
      panelState.version++;
      manager.open(EMBLEM_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!emblemRowExists(map, panelState.selectedEmblemId)) panelState.selectedEmblemId = firstEmblemRowId(map);
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

function emblemRowExists(map, rowId) {
  return Boolean(rowId && emblemRowIds(map).has(rowId));
}

function firstEmblemRowId(map) {
  return emblemRowIds(map).values().next().value ?? null;
}

function emblemRowIds(map) {
  const ids = new Set();
  for (const item of map?.politics?.states || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`state:${item.i ?? item.id}`);
  for (const item of map?.settlements?.cities || []) if (item && (item.i ?? item.id ?? item.burgId) !== undefined) ids.add(`city:${item.i ?? item.id ?? item.burgId}`);
  return ids;
}
