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

export function createPopulationPanel(documentRef, manager, callbacks = {}) {
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
    adjustmentDelta: 10,
    adjustmentInspection: null,
    adjustmentResult: null,
    transferTargetId: null,
    transferAmount: 10,
    transferInspection: null,
    transferResult: null,
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
      ensureTransferTarget();
      clearFeedback();
    },
    onAdjustmentDelta: value => {
      panelState.adjustmentDelta = Number(value);
      clearAdjustmentFeedback();
    },
    onInspectAdjustment: () => {
      const target = populationTarget(panelState.selectedPopulationId);
      if (!target) return null;
      try {
        panelState.adjustmentInspection = callbacks.onInspectAdjustment?.(target, {delta: panelState.adjustmentDelta}) || null;
        panelState.adjustmentResult = null;
      } catch (error) {
        panelState.adjustmentInspection = {valid: false, code: "runtime-error", reason: error?.message || String(error)};
      }
      panelState.version++;
      return panelState.adjustmentInspection;
    },
    onApplyAdjustment: () => {
      const target = populationTarget(panelState.selectedPopulationId);
      if (!target || !panelState.adjustmentInspection?.valid) return null;
      try {
        panelState.adjustmentResult = callbacks.onApplyAdjustment?.(target, {delta: panelState.adjustmentDelta}) || null;
        panelState.adjustmentInspection = null;
      } catch (error) {
        panelState.adjustmentResult = {executed: false, error: {message: error?.message || String(error)}};
      }
      panelState.version++;
      return panelState.adjustmentResult;
    },
    onTransferTarget: value => {
      panelState.transferTargetId = String(value || "") || null;
      clearTransferFeedback();
    },
    onTransferAmount: value => {
      panelState.transferAmount = Number(value);
      clearTransferFeedback();
    },
    onInspectTransfer: () => {
      const source = populationTarget(panelState.selectedPopulationId);
      const target = populationTarget(panelState.transferTargetId);
      if (!source || !target) return null;
      try {
        panelState.transferInspection = callbacks.onInspectTransfer?.(source, target, {amount: panelState.transferAmount}) || null;
        panelState.transferResult = null;
      } catch (error) {
        panelState.transferInspection = {valid: false, code: "runtime-error", reason: error?.message || String(error)};
      }
      panelState.version++;
      return panelState.transferInspection;
    },
    onApplyTransfer: () => {
      const source = populationTarget(panelState.selectedPopulationId);
      const target = populationTarget(panelState.transferTargetId);
      if (!source || !target || !panelState.transferInspection?.valid) return null;
      try {
        panelState.transferResult = callbacks.onApplyTransfer?.(source, target, {amount: panelState.transferAmount, confirm: true}) || null;
        panelState.transferInspection = null;
      } catch (error) {
        panelState.transferResult = {executed: false, error: {message: error?.message || String(error)}};
      }
      panelState.version++;
      return panelState.transferResult;
    },
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  function clearAdjustmentFeedback() {
    panelState.adjustmentInspection = null;
    panelState.adjustmentResult = null;
    panelState.version++;
  }

  function clearTransferFeedback() {
    panelState.transferInspection = null;
    panelState.transferResult = null;
    panelState.version++;
  }

  function clearFeedback() {
    clearAdjustmentFeedback();
    clearTransferFeedback();
  }

  function ensureTransferTarget() {
    const source = populationTarget(panelState.selectedPopulationId);
    const current = populationTarget(panelState.transferTargetId);
    if (source && current && source.scope === current.scope && source.id !== current.id && populationRowExists(panelState.map, panelState.transferTargetId)) return;
    panelState.transferTargetId = firstPopulationTargetId(panelState.map, source);
  }

  const record = manager.registerPanel(POPULATION_PANEL_ID, {
    title: "人口统计",
    left: 500,
    top: 136,
    width: 620,
    maxWidth: 760,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
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
      ensureTransferTarget();
      panelState.open = true;
      panelState.version++;
      manager.open(POPULATION_PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!populationRowExists(map, panelState.selectedPopulationId)) panelState.selectedPopulationId = firstPopulationRowId(map);
      ensureTransferTarget();
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

function populationTarget(rowId) {
  if (typeof rowId !== "string") return null;
  const [scope, rawId] = rowId.split(":");
  const id = Number(rawId);
  if (!["state", "province", "culture", "religion"].includes(scope) || !Number.isInteger(id) || id <= 0) return null;
  return {scope, id};
}

function firstPopulationRowId(map) {
  return populationRowIds(map).values().next().value ?? null;
}

function firstPopulationTargetId(map, source) {
  if (!source) return null;
  for (const rowId of populationRowIds(map)) {
    const target = populationTarget(rowId);
    if (target?.scope === source.scope && target.id !== source.id) return rowId;
  }
  return null;
}

function populationRowIds(map) {
  const ids = new Set();
  for (const item of map?.politics?.states || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`state:${item.i ?? item.id}`);
  for (const item of map?.politics?.provinces || map?.pack?.provinces || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`province:${item.i ?? item.id}`);
  for (const item of map?.society?.cultures || map?.pack?.cultures || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`culture:${item.i ?? item.id}`);
  for (const item of map?.society?.religions || map?.pack?.religions || []) if (item && !item.removed && (item.i ?? item.id) > 0) ids.add(`religion:${item.i ?? item.id}`);
  return ids;
}
