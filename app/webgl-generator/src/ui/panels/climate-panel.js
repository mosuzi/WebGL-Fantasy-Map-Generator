import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const CLIMATE_PANEL_ID = "climate-panel";
const CLIMATE_COLUMN_WIDTHS = Object.freeze({
  name: 96,
  cells: 64,
  landCells: 64,
  avgTemp: 72,
  avgPrec: 92,
  avgSuitability: 64
});
const CLIMATE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: CLIMATE_COLUMN_WIDTHS,
  sortKey: "cells",
  sortDir: "desc"
});

export function createClimatePanel(documentRef, manager) {
  const listPreferences = readPanelListPreferences(documentRef, CLIMATE_PANEL_ID, CLIMATE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedBandId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, CLIMATE_PANEL_ID, {filter: value}, CLIMATE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, CLIMATE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, CLIMATE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, CLIMATE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, CLIMATE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedBandId = row.id;
    }
  };

  const record = manager.registerPanel(CLIMATE_PANEL_ID, {
    title: "气候统计",
    left: 536,
    top: 124,
    width: 620,
    maxWidth: 780,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-climate-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/ClimatePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "气候统计将在首次打开时加载。",
      loading: "正在加载气候统计...",
      failure: "气候统计加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!climateBandExists(panelState.selectedBandId)) panelState.selectedBandId = firstClimateBandId();
      panelState.open = true;
      panelState.version++;
      manager.open(CLIMATE_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!climateBandExists(panelState.selectedBandId)) panelState.selectedBandId = firstClimateBandId();
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

function climateBandExists(bandId) {
  return ["frozen", "cold", "temperate", "warm", "hot"].includes(bandId);
}

function firstClimateBandId() {
  return "temperate";
}
