import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const FEATURE_PANEL_ID = "feature-panel";
const FEATURE_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  typeLabel: 76,
  groupLabel: 96,
  cells: 64,
  area: 84,
  shorelineCells: 64,
  havenCells: 64
});
const FEATURE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: FEATURE_COLUMN_WIDTHS,
  sortKey: "cells",
  sortDir: "desc"
});

export function createFeaturePanel(documentRef, manager) {
  const listPreferences = readPanelListPreferences(documentRef, FEATURE_PANEL_ID, FEATURE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedFeatureId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, FEATURE_PANEL_ID, {filter: value}, FEATURE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "type" || key === "group" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, FEATURE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, FEATURE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, FEATURE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, FEATURE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedFeatureId = toIntegerId(row.id);
    }
  };

  const record = manager.registerPanel(FEATURE_PANEL_ID, {
    title: "水体与地貌统计",
    left: 500,
    top: 136,
    width: 620,
    maxWidth: 780,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-feature-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/FeaturePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "水体与地貌统计将在首次打开时加载。",
      loading: "正在加载水体与地貌统计...",
      failure: "水体与地貌统计加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!featureExists(map, panelState.selectedFeatureId)) panelState.selectedFeatureId = firstFeatureId(map);
      panelState.open = true;
      panelState.version++;
      manager.open(FEATURE_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!featureExists(map, panelState.selectedFeatureId)) panelState.selectedFeatureId = firstFeatureId(map);
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

function featureExists(map, featureId) {
  featureId = toIntegerId(featureId);
  return Boolean(Number.isInteger(featureId) && map?.pack?.features?.[featureId]);
}

function firstFeatureId(map) {
  const feature = (map?.pack?.features || []).find(item => Number.isInteger(item?.i ?? item?.id));
  return feature ? toIntegerId(feature.i ?? feature.id) : null;
}
