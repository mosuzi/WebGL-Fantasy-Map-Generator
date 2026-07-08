import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const MEASUREMENT_PANEL_ID = "measurement-panel";
const MEASUREMENT_LIST_DEFAULTS = Object.freeze({
  filter: "",
  sortKey: "updatedAt",
  sortDir: "desc"
});

export function createMeasurementPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, MEASUREMENT_PANEL_ID, MEASUREMENT_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: listPreferences.filter,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedMeasurementId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, MEASUREMENT_PANEL_ID, {filter: value}, MEASUREMENT_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "name" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, MEASUREMENT_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, MEASUREMENT_LIST_DEFAULTS);
    },
    onSelect: row => {
      panelState.selectedMeasurementId = row.id;
      callbacks.onSelect?.(row);
    },
    onLocate: row => {
      panelState.selectedMeasurementId = row.id;
      callbacks.onLocate?.(row);
    },
    onEdit: row => callbacks.onEdit?.(row),
    onRename: (measurementId, name) => callbacks.onRename?.(measurementId, name),
    onDelete: row => callbacks.onDelete?.(row),
    onExport: rows => callbacks.onExport?.(rows),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(MEASUREMENT_PANEL_ID, {
    title: "测量对象",
    left: 520,
    top: 120,
    width: 640,
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
  root.className = "vue-measurement-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/MeasurementPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "测量对象将在首次打开时加载。",
      loading: "正在加载测量对象...",
      failure: "测量对象加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!measurementExists(map, panelState.selectedMeasurementId)) panelState.selectedMeasurementId = firstMeasurementId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("measurement-panel");
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (!measurementExists(map, panelState.selectedMeasurementId)) panelState.selectedMeasurementId = firstMeasurementId(map);
      panelState.version++;
    },
    setSelectedMeasurementId(measurementId) {
      if (measurementExists(panelState.map, measurementId)) panelState.selectedMeasurementId = measurementId;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function measurementExists(map, measurementId) {
  if (!measurementId) return false;
  return (map?.measurements?.items || []).some(item => item?.id === measurementId);
}

function firstMeasurementId(map) {
  return (map?.measurements?.items || []).find(item => item?.id)?.id ?? null;
}
