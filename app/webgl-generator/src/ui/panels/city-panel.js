import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const CITY_PANEL_ID = "city-panel";
const CITY_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  type: 76,
  stateName: 112,
  provinceName: 112,
  resourceCells: 64,
  population: 92
});
const CITY_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: CITY_COLUMN_WIDTHS,
  sortKey: "population",
  sortDir: "desc"
});

export function createCityPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, CITY_PANEL_ID, CITY_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedCityId: null,
    addMode: false,
    deleteMode: false,
    moveMode: false,
    moveCityId: null,
    movePreview: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, CITY_PANEL_ID, {filter: value}, CITY_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "stateName" || key === "provinceName" || key === "type" ? "asc" : "desc";
        panelState.sortKey = key;
      }
      updatePanelListPreferences(documentRef, CITY_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, CITY_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, CITY_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, CITY_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedCityId = row.id;
      callbacks.onSelect?.(cityObject(row));
    },
    onLocate: row => callbacks.onLocate?.(cityObject(row)),
    onRegenerate: () => callbacks.onRegenerate?.(),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, cityObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onRename: (cityId, name) => callbacks.onRename?.(cityId, name),
    onRenameVisibleFromNamebase: cityIds => callbacks.onRenameVisibleFromNamebase?.(cityIds),
    onAddMode: active => {
      panelState.addMode = Boolean(active);
      if (active) {
        panelState.deleteMode = false;
        panelState.moveMode = false;
      }
      callbacks.onAddMode?.(panelState.addMode);
    },
    onDeleteMode: active => {
      panelState.deleteMode = Boolean(active);
      if (active) {
        panelState.addMode = false;
        panelState.moveMode = false;
      }
      callbacks.onDeleteMode?.(panelState.deleteMode);
    },
    onMoveMode: (active, cityId) => {
      panelState.moveMode = Boolean(active);
      panelState.moveCityId = panelState.moveMode ? normalizeCityId(cityId) : null;
      panelState.movePreview = null;
      if (active) {
        panelState.addMode = false;
        panelState.deleteMode = false;
      }
      callbacks.onMoveMode?.(panelState.moveMode, panelState.moveCityId);
    },
    onDeleteCity: cityId => callbacks.onDeleteCity?.(cityId),
    onPopulationChange: (cityId, population) => callbacks.onPopulationChange?.(cityId, population),
    onSyncOwnerToCell: cityId => callbacks.onSyncOwnerToCell?.(cityId),
    onVisualChange: (cityId, patch) => callbacks.onVisualChange?.(cityId, patch),
    onVisualReset: cityId => callbacks.onVisualReset?.(cityId),
    onNoteChange: (cityId, body) => callbacks.onNoteChange?.(cityId, body),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(CITY_PANEL_ID, {
    title: "城市管理",
    left: 456,
    top: 112,
    width: 600,
    maxWidth: 720,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.addMode = false;
      panelState.deleteMode = false;
      panelState.moveMode = false;
      panelState.moveCityId = null;
      panelState.movePreview = null;
      panelState.open = false;
      callbacks.onAddMode?.(false);
      callbacks.onDeleteMode?.(false);
      callbacks.onMoveMode?.(false, null);
      callbacks.onClose?.();
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-city-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/CityPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "城市管理将在首次打开时加载。",
      loading: "正在加载城市管理...",
      failure: "城市管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "city") panelState.selectedCityId = normalizeCityId(selection.object.id);
      if (!cityExists(map, panelState.selectedCityId)) panelState.selectedCityId = firstCityId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("city-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "city") panelState.selectedCityId = normalizeCityId(selection.object.id);
      if (!cityExists(map, panelState.selectedCityId)) panelState.selectedCityId = firstCityId(map);
      panelState.version++;
    },
    setSelectedCityId(cityId) {
      const normalized = normalizeCityId(cityId);
      if (cityExists(panelState.map, normalized)) panelState.selectedCityId = normalized;
    },
    updateAddMode(active) {
      panelState.addMode = Boolean(active);
      panelState.version++;
    },
    updateDeleteMode(active) {
      panelState.deleteMode = Boolean(active);
      panelState.version++;
    },
    updateMoveMode(active, cityId = null) {
      panelState.moveMode = Boolean(active);
      panelState.moveCityId = panelState.moveMode ? normalizeCityId(cityId) : null;
      panelState.version++;
    },
    updateMovePreview(preview) {
      panelState.movePreview = preview || null;
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

function cityObject(row) {
  return {
    kind: "city",
    id: row.id,
    name: row.rawName,
    type: row.type,
    population: roundNumber(row.population),
    state: row.stateName,
    stateId: row.stateId,
    province: row.provinceName,
    provinceId: row.provinceId,
    cell: row.cell,
    packCell: row.packCell,
    burgId: row.burgId
  };
}

function cityExists(map, cityId) {
  cityId = normalizeCityId(cityId);
  return Boolean(Number.isInteger(cityId) && map?.settlements?.cities?.[cityId]);
}

function normalizeCityId(cityId) {
  return toIntegerId(cityId);
}

function firstCityId(map) {
  return (map?.settlements?.cities || []).find(city => city && Number.isInteger(city.id))?.id ?? null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
