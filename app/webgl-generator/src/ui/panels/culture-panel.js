import {markRaw, shallowReactive} from "vue";
import {BRUSH_RADIUS_ID, normalizeBrushRadius, readBrushRadiusContract} from "../../runtime/brush-radius-contract.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const CULTURE_PANEL_ID = "culture-panel";
const CULTURE_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  typeLabel: 76,
  parentName: 112,
  depth: 48,
  cells: 64,
  population: 92,
  cities: 64
});
const CULTURE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: CULTURE_COLUMN_WIDTHS,
  treeOpen: false,
  sortKey: "cells",
  sortDir: "desc"
});

export function createCulturePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, CULTURE_PANEL_ID, CULTURE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    treeOpen: listPreferences.treeOpen,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedCultureId: null,
    targetCultureId: null,
    assignmentActive: false,
    assignmentRadius: readBrushRadiusContract(BRUSH_RADIUS_ID.CULTURE).defaultValue,
    lastAffected: 0,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, CULTURE_PANEL_ID, {filter: value}, CULTURE_LIST_DEFAULTS);
    },
    onTreeOpen: value => {
      panelState.treeOpen = Boolean(value);
      updatePanelListPreferences(documentRef, CULTURE_PANEL_ID, {treeOpen: panelState.treeOpen}, CULTURE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "type" ? "asc" : "desc";
        panelState.sortKey = key;
      }
      updatePanelListPreferences(documentRef, CULTURE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, CULTURE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, CULTURE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, CULTURE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedCultureId = row.id;
      panelState.targetCultureId = row.id;
      callbacks.onSelect?.(cultureObject(row));
    },
    onLocate: row => callbacks.onLocate?.(cultureObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, cultureObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onAdd: () => callbacks.onAdd?.(),
    onDelete: row => callbacks.onDelete?.(cultureObject(row)),
    onRename: (cultureId, name) => callbacks.onRename?.(cultureId, name),
    onColorChange: (cultureId, color) => callbacks.onColorChange?.(cultureId, color),
    onParentChange: (cultureId, parentId) => callbacks.onParentChange?.(cultureId, parentId),
    onNoteChange: (cultureId, body) => callbacks.onNoteChange?.(cultureId, body),
    onNamebaseBinding: cultureId => callbacks.onNamebaseBinding?.(cultureId),
    onAssignmentActive: active => {
      panelState.assignmentActive = Boolean(active);
      callbacks.onAssignmentActive?.(panelState.assignmentActive, panelState.targetCultureId);
    },
    onTargetCultureId: cultureId => {
      panelState.targetCultureId = normalizeCultureId(cultureId) ?? 0;
    },
    onAssignmentRadius: radius => {
      panelState.assignmentRadius = normalizeBrushRadius(BRUSH_RADIUS_ID.CULTURE, radius);
      callbacks.onBrushRadiusChange?.();
    },
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(CULTURE_PANEL_ID, {
    title: "文化管理",
    left: 492,
    top: 132,
    width: 580,
    maxWidth: 720,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      panelState.assignmentActive = false;
      callbacks.onAssignmentActive?.(false, panelState.targetCultureId);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-culture-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/CulturePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "文化管理将在首次打开时加载。",
      loading: "正在加载文化管理...",
      failure: "文化管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "culture") panelState.selectedCultureId = normalizeCultureId(selection.object.id);
      if (!cultureExists(map, panelState.selectedCultureId)) panelState.selectedCultureId = firstCultureId(map);
      if (!cultureExists(map, panelState.targetCultureId)) panelState.targetCultureId = panelState.selectedCultureId;
      panelState.open = true;
      panelState.version++;
      manager.open("culture-panel");
      lazyPanel.load();
    },
    update(map, selection, history, assignment = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "culture") panelState.selectedCultureId = normalizeCultureId(selection.object.id);
      if (!cultureExists(map, panelState.selectedCultureId)) panelState.selectedCultureId = firstCultureId(map);
      if (assignment.active !== undefined) panelState.assignmentActive = Boolean(assignment.active);
      if (assignment.lastAffected !== undefined) panelState.lastAffected = Number(assignment.lastAffected) || 0;
      if (!cultureExists(map, panelState.targetCultureId)) panelState.targetCultureId = panelState.selectedCultureId;
      panelState.version++;
    },
    setSelectedCultureId(cultureId) {
      const normalized = normalizeCultureId(cultureId);
      if (cultureExists(panelState.map, normalized)) {
        panelState.selectedCultureId = normalized;
        panelState.targetCultureId = normalized;
      }
    },
    setAssignmentActive(active) {
      panelState.assignmentActive = Boolean(active);
      panelState.version++;
    },
    getBrush() {
      return {
        active: panelState.assignmentActive,
        targetId: panelState.targetCultureId ?? 0,
        radius: normalizeBrushRadius(BRUSH_RADIUS_ID.CULTURE, panelState.assignmentRadius)
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

function cultureObject(row) {
  return {
    kind: "culture",
    id: row.id,
    name: row.rawName,
    type: row.type,
    nameStyle: row.nameStyle,
    centerCell: row.centerCell,
    gridCenterCell: row.gridCenterCell,
    cells: row.cells,
    population: roundNumber(row.population),
    cities: row.cities,
    states: row.states,
    parent: row.parentName,
    depth: row.depth
  };
}

function cultureExists(map, cultureId) {
  cultureId = normalizeCultureId(cultureId);
  if (cultureId === 0) return true;
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId];
  return Boolean(Number.isInteger(cultureId) && culture && !culture.removed);
}

function normalizeCultureId(cultureId) {
  return toIntegerId(cultureId);
}

function firstCultureId(map) {
  const culture = (map?.society?.cultures || map?.pack?.cultures || []).find(item =>
    item && !item.removed && Number.isInteger(item.i ?? item.id) && (item.i ?? item.id) > 0
  );
  return culture ? culture.i ?? culture.id : null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
