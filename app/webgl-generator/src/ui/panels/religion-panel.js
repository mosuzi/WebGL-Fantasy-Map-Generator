import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const RELIGION_PANEL_ID = "religion-panel";
const RELIGION_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  type: 76,
  form: 84,
  parentName: 112,
  depth: 48,
  cells: 64,
  population: 92
});
const RELIGION_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: RELIGION_COLUMN_WIDTHS,
  treeOpen: false,
  sortKey: "cells",
  sortDir: "desc"
});

export function createReligionPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, RELIGION_PANEL_ID, RELIGION_LIST_DEFAULTS);
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
    selectedReligionId: null,
    targetReligionId: null,
    assignmentActive: false,
    assignmentRadius: 28,
    lastAffected: 0,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, RELIGION_PANEL_ID, {filter: value}, RELIGION_LIST_DEFAULTS);
    },
    onTreeOpen: value => {
      panelState.treeOpen = Boolean(value);
      updatePanelListPreferences(documentRef, RELIGION_PANEL_ID, {treeOpen: panelState.treeOpen}, RELIGION_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "type" || key === "form" ? "asc" : "desc";
        panelState.sortKey = key;
      }
      updatePanelListPreferences(documentRef, RELIGION_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, RELIGION_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, RELIGION_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, RELIGION_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedReligionId = row.id;
      panelState.targetReligionId = row.id;
      callbacks.onSelect?.(religionObject(row));
    },
    onLocate: row => callbacks.onLocate?.(religionObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, religionObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onAdd: () => callbacks.onAdd?.(),
    onDelete: row => callbacks.onDelete?.(religionObject(row)),
    onRename: (religionId, name) => callbacks.onRename?.(religionId, name),
    onColorChange: (religionId, color) => callbacks.onColorChange?.(religionId, color),
    onParentChange: (religionId, parentId) => callbacks.onParentChange?.(religionId, parentId),
    onNoteChange: (religionId, body) => callbacks.onNoteChange?.(religionId, body),
    onAssignmentActive: active => {
      panelState.assignmentActive = Boolean(active);
      callbacks.onAssignmentActive?.(panelState.assignmentActive, panelState.targetReligionId);
    },
    onTargetReligionId: religionId => {
      panelState.targetReligionId = normalizeReligionId(religionId) ?? 0;
    },
    onAssignmentRadius: radius => {
      panelState.assignmentRadius = Math.max(4, Math.min(120, Number(radius) || 28));
    },
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(RELIGION_PANEL_ID, {
    title: "宗教管理",
    left: 524,
    top: 164,
    width: 600,
    maxWidth: 740,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      panelState.assignmentActive = false;
      callbacks.onAssignmentActive?.(false, panelState.targetReligionId);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-religion-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/ReligionPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "宗教管理将在首次打开时加载。",
      loading: "正在加载宗教管理...",
      failure: "宗教管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "religion") panelState.selectedReligionId = normalizeReligionId(selection.object.id);
      if (!religionExists(map, panelState.selectedReligionId)) panelState.selectedReligionId = firstReligionId(map);
      if (!religionExists(map, panelState.targetReligionId)) panelState.targetReligionId = panelState.selectedReligionId;
      panelState.open = true;
      panelState.version++;
      manager.open("religion-panel");
      lazyPanel.load();
    },
    update(map, selection, history, assignment = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "religion") panelState.selectedReligionId = normalizeReligionId(selection.object.id);
      if (!religionExists(map, panelState.selectedReligionId)) panelState.selectedReligionId = firstReligionId(map);
      if (assignment.active !== undefined) panelState.assignmentActive = Boolean(assignment.active);
      if (assignment.lastAffected !== undefined) panelState.lastAffected = Number(assignment.lastAffected) || 0;
      if (!religionExists(map, panelState.targetReligionId)) panelState.targetReligionId = panelState.selectedReligionId;
      panelState.version++;
    },
    setSelectedReligionId(religionId) {
      const normalized = normalizeReligionId(religionId);
      if (religionExists(panelState.map, normalized)) {
        panelState.selectedReligionId = normalized;
        panelState.targetReligionId = normalized;
      }
    },
    setAssignmentActive(active) {
      panelState.assignmentActive = Boolean(active);
      panelState.version++;
    },
    getBrush() {
      return {
        active: panelState.assignmentActive,
        targetId: panelState.targetReligionId ?? 0,
        radius: panelState.assignmentRadius
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

function religionObject(row) {
  return {
    kind: "religion",
    id: row.id,
    name: row.rawName,
    type: row.type,
    form: row.form,
    culture: row.cultureName,
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

function religionExists(map, religionId) {
  religionId = normalizeReligionId(religionId);
  if (religionId === 0) return true;
  const religion = map?.society?.religions?.[religionId] || map?.pack?.religions?.[religionId];
  return Boolean(Number.isInteger(religionId) && religion && !religion.removed);
}

function normalizeReligionId(religionId) {
  return toIntegerId(religionId);
}

function firstReligionId(map) {
  const religion = (map?.society?.religions || map?.pack?.religions || []).find(item =>
    item && !item.removed && Number.isInteger(item.i ?? item.id) && (item.i ?? item.id) > 0
  );
  return religion ? religion.i ?? religion.id : null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
