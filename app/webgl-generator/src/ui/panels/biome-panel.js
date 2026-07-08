import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const BIOME_PANEL_ID = "biome-panel";
const BIOME_LIST_DEFAULTS = Object.freeze({
  filter: "",
  sortKey: "cells",
  sortDir: "desc"
});

export function createBiomePanel(documentRef, manager) {
  const listPreferences = readPanelListPreferences(documentRef, BIOME_PANEL_ID, BIOME_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedBiomeId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, BIOME_PANEL_ID, {filter: value}, BIOME_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, BIOME_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, BIOME_LIST_DEFAULTS);
    },
    onSelect: row => {
      panelState.selectedBiomeId = normalizeBiomeId(row.id);
    }
  };

  const record = manager.registerPanel(BIOME_PANEL_ID, {
    title: "生物群系统计",
    left: 484,
    top: 128,
    width: 560,
    maxWidth: 700,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-biome-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/BiomePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "生物群系统计将在首次打开时加载。",
      loading: "正在加载生物群系统计...",
      failure: "生物群系统计加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!biomeExists(map, panelState.selectedBiomeId)) panelState.selectedBiomeId = firstBiomeId(map);
      panelState.open = true;
      panelState.version++;
      manager.open(BIOME_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!biomeExists(map, panelState.selectedBiomeId)) panelState.selectedBiomeId = firstBiomeId(map);
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

function biomeExists(map, biomeId) {
  biomeId = normalizeBiomeId(biomeId);
  return Boolean(Number.isInteger(biomeId) && (map?.climate?.biomes || []).some(biome => biome?.id === biomeId));
}

function firstBiomeId(map) {
  return (map?.climate?.biomes || []).find(biome => Number.isInteger(biome?.id))?.id ?? null;
}

function normalizeBiomeId(biomeId) {
  return toIntegerId(biomeId);
}
