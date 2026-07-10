import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const POPULATION_PANEL_ID = "population-panel";
const POPULATION_COLUMN_WIDTHS = Object.freeze({
  scopeLabel: 76,
  name: 120,
  parentName: 120,
  population: 92,
  rural: 92,
  urban: 92,
  density: 84
});
const POPULATION_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: POPULATION_COLUMN_WIDTHS,
  sortKey: "population",
  sortDir: "desc"
});

export function createPopulationPanel(documentRef, manager) {
  const listPreferences = readPanelListPreferences(documentRef, POPULATION_PANEL_ID, POPULATION_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedPopulationId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, POPULATION_PANEL_ID, {filter: value}, POPULATION_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "scope" || key === "name" || key === "parentName" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, POPULATION_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, POPULATION_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, POPULATION_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, POPULATION_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedPopulationId = row.id;
    }
  };

  const record = manager.registerPanel(POPULATION_PANEL_ID, {
    title: "人口统计",
    left: 500,
    top: 136,
    width: 620,
    maxWidth: 760,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-population-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/PopulationPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "人口统计将在首次打开时加载。",
      loading: "正在加载人口统计...",
      failure: "人口统计加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!populationRowExists(map, panelState.selectedPopulationId)) panelState.selectedPopulationId = firstPopulationRowId(map);
      panelState.open = true;
      panelState.version++;
      manager.open(POPULATION_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!populationRowExists(map, panelState.selectedPopulationId)) panelState.selectedPopulationId = firstPopulationRowId(map);
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

function populationRowExists(map, rowId) {
  return Boolean(rowId && populationRowIds(map).has(rowId));
}

function firstPopulationRowId(map) {
  return populationRowIds(map).values().next().value ?? null;
}

function populationRowIds(map) {
  const ids = new Set();
  for (const item of map?.politics?.states || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`state:${item.i ?? item.id}`);
  for (const item of map?.politics?.provinces || map?.pack?.provinces || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`province:${item.i ?? item.id}`);
  for (const item of map?.society?.cultures || map?.pack?.cultures || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`culture:${item.i ?? item.id}`);
  for (const item of map?.society?.religions || map?.pack?.religions || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`religion:${item.i ?? item.id}`);
  return ids;
}
