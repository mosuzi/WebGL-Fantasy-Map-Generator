import {markRaw, shallowReactive} from "vue";
import {BRUSH_RADIUS_ID, normalizeBrushRadius, readBrushRadiusContract} from "../../runtime/brush-radius-contract.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const BIOME_PANEL_ID = "biome-panel";
const BIOME_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  cells: 64,
  area: 84,
  suitabilityAvg: 64,
  population: 92
});
const BIOME_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: BIOME_COLUMN_WIDTHS,
  sortKey: "cells",
  sortDir: "desc"
});

export function createBiomePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, BIOME_PANEL_ID, BIOME_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedBiomeId: null,
    assignmentActive: false,
    assignmentScope: "land",
    assignmentRadius: readBrushRadiusContract(BRUSH_RADIUS_ID.BIOME).defaultValue,
    lastAffected: 0,
    assignmentPreview: null,
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
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, BIOME_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, BIOME_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedBiomeId = normalizeBiomeId(row.id);
      panelState.assignmentScope = panelState.selectedBiomeId === 0 ? "water" : "land";
    },
    onAssignmentActive: active => {
      panelState.assignmentActive = Boolean(active);
      callbacks.onAssignmentActive?.(panelState.assignmentActive);
    },
    onAssignmentTarget: biomeId => {
      panelState.selectedBiomeId = normalizeBiomeId(biomeId);
      panelState.assignmentScope = panelState.selectedBiomeId === 0 ? "water" : "land";
      panelState.assignmentPreview = null;
    },
    onAssignmentScope: scope => {
      panelState.assignmentScope = String(scope || "land");
      panelState.assignmentPreview = null;
    },
    onAssignmentRadius: radius => {
      panelState.assignmentRadius = normalizeBrushRadius(BRUSH_RADIUS_ID.BIOME, radius);
      callbacks.onBrushRadiusChange?.();
    },
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(BIOME_PANEL_ID, {
    title: "生物群系管理",
    left: 484,
    top: 128,
    width: 560,
    maxWidth: 700,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      panelState.assignmentActive = false;
      callbacks.onAssignmentActive?.(false);
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
      if (!biomeExists(map, panelState.selectedBiomeId)) {
        panelState.selectedBiomeId = firstBiomeId(map);
        panelState.assignmentScope = panelState.selectedBiomeId === 0 ? "water" : "land";
      }
      panelState.open = true;
      panelState.version++;
      manager.open(BIOME_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history, assignment = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!biomeExists(map, panelState.selectedBiomeId)) {
        panelState.selectedBiomeId = firstBiomeId(map);
        panelState.assignmentScope = panelState.selectedBiomeId === 0 ? "water" : "land";
      }
      if (assignment.active !== undefined) panelState.assignmentActive = Boolean(assignment.active);
      if (assignment.lastAffected !== undefined) panelState.lastAffected = Number(assignment.lastAffected) || 0;
      if (assignment.preview !== undefined) panelState.assignmentPreview = assignment.preview;
      panelState.version++;
    },
    setAssignmentActive(active) {
      panelState.assignmentActive = Boolean(active);
      panelState.version++;
    },
    updateAssignment({lastAffected, preview} = {}) {
      if (lastAffected !== undefined) panelState.lastAffected = Number(lastAffected) || 0;
      if (preview !== undefined) panelState.assignmentPreview = preview;
      panelState.version++;
    },
    getBrush() {
      return {
        active: panelState.assignmentActive,
        targetId: panelState.selectedBiomeId ?? 0,
        scope: panelState.assignmentScope,
        radius: normalizeBrushRadius(BRUSH_RADIUS_ID.BIOME, panelState.assignmentRadius)
      };
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
