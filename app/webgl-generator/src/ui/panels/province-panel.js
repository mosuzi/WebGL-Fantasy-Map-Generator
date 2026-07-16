import {markRaw, shallowReactive} from "vue";
import {BRUSH_RADIUS_ID, normalizeBrushRadius, readBrushRadiusContract} from "../../runtime/brush-radius-contract.js";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const PROVINCE_PANEL_ID = "province-panel";
const PROVINCE_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  stateName: 112,
  cells: 64,
  area: 84,
  economicPower: 64,
  resourcePotential: 64
});
const PROVINCE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: PROVINCE_COLUMN_WIDTHS,
  sortKey: "area",
  sortDir: "desc"
});

export function createProvincePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, PROVINCE_PANEL_ID, PROVINCE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    active: false,
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedProvinceId: null,
    radius: readBrushRadiusContract(BRUSH_RADIUS_ID.PROVINCE).defaultValue,
    addMode: false,
    deleteMode: false,
    lastAffected: 0,
    sourceProvinceId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, PROVINCE_PANEL_ID, {filter: value}, PROVINCE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "stateName" ? "asc" : "desc";
        panelState.sortKey = key;
      }
      updatePanelListPreferences(documentRef, PROVINCE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, PROVINCE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, PROVINCE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, PROVINCE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedProvinceId = row.id;
      callbacks.onSelect?.(provinceObject(row));
    },
    onLocate: row => callbacks.onLocate?.(provinceObject(row)),
    onRegenerate: () => callbacks.onRegenerate?.(),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, provinceObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onEdit: row => {
      const nextActive = !(panelState.active && panelState.selectedProvinceId === row.id);
      panelState.selectedProvinceId = row.id;
      panelState.active = nextActive;
      panelState.addMode = false;
      panelState.deleteMode = false;
      callbacks.onActiveChange?.(nextActive);
      if (nextActive) callbacks.onEdit?.(provinceObject(row));
    },
    onActiveChange: active => {
      panelState.active = active;
      if (active) {
        panelState.addMode = false;
        panelState.deleteMode = false;
      }
      callbacks.onActiveChange?.(active);
    },
    onAddMode: active => {
      panelState.addMode = Boolean(active);
      if (active) {
        panelState.active = false;
        panelState.deleteMode = false;
      }
      callbacks.onAddMode?.(panelState.addMode);
    },
    onDeleteMode: active => {
      panelState.deleteMode = Boolean(active);
      if (active) {
        panelState.active = false;
        panelState.addMode = false;
      }
      callbacks.onDeleteMode?.(panelState.deleteMode);
    },
    onDeleteProvince: provinceId => callbacks.onDeleteProvince?.(provinceId),
    onTargetProvinceId: provinceId => {
      panelState.selectedProvinceId = normalizeProvinceId(provinceId);
    },
    onRadius: radius => {
      panelState.radius = normalizeBrushRadius(BRUSH_RADIUS_ID.PROVINCE, radius);
      callbacks.onBrushRadiusChange?.();
    },
    onSampleSelection: () => callbacks.onSampleSelection?.(),
    onSampleHover: () => callbacks.onSampleHover?.(),
    onRename: (provinceId, name) => callbacks.onRename?.(provinceId, name),
    onColorChange: (provinceId, color) => callbacks.onColorChange?.(provinceId, color),
    onNoteChange: (provinceId, body) => callbacks.onNoteChange?.(provinceId, body),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(PROVINCE_PANEL_ID, {
    title: "省份管理",
    left: 420,
    top: 92,
    width: 560,
    maxWidth: 680,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.active = false;
      panelState.addMode = false;
      panelState.deleteMode = false;
      panelState.open = false;
      callbacks.onActiveChange?.(false);
      callbacks.onAddMode?.(false);
      callbacks.onDeleteMode?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-province-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/ProvincePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "省份管理将在首次打开时加载。",
      loading: "正在加载省份管理...",
      failure: "省份管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (!panelState.active && selection?.object?.kind === "province") panelState.selectedProvinceId = normalizeProvinceId(selection.object.id);
      if (!provinceExists(map, panelState.selectedProvinceId)) panelState.selectedProvinceId = firstProvinceId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("province-panel");
      lazyPanel.load();
    },
    update(map, selection, history, editState = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      panelState.lastAffected = editState.lastAffected ?? panelState.lastAffected;
      panelState.sourceProvinceId = editState.sourceProvinceId ?? panelState.sourceProvinceId;
      if (!panelState.active && selection?.object?.kind === "province") panelState.selectedProvinceId = normalizeProvinceId(selection.object.id);
      if (!provinceExists(map, panelState.selectedProvinceId)) panelState.selectedProvinceId = firstProvinceId(map);
      panelState.version++;
    },
    setSelectedProvinceId(provinceId) {
      const normalized = normalizeProvinceId(provinceId);
      if (provinceExists(panelState.map, normalized)) panelState.selectedProvinceId = normalized;
    },
    updateAddMode(active) {
      panelState.addMode = Boolean(active);
      panelState.version++;
    },
    updateDeleteMode(active) {
      panelState.deleteMode = Boolean(active);
      panelState.version++;
    },
    getBrush() {
      return {
        active: panelState.active,
        targetProvinceId: panelState.selectedProvinceId,
        radius: normalizeBrushRadius(BRUSH_RADIUS_ID.PROVINCE, panelState.radius)
      };
    },
    setActive(active) {
      const nextActive = Boolean(active);
      const changed = panelState.active !== nextActive;
      panelState.active = nextActive;
      if (nextActive) {
        panelState.addMode = false;
        panelState.deleteMode = false;
      }
      if (changed) callbacks.onActiveChange?.(nextActive);
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function provinceObject(row) {
  return {
    kind: "province",
    id: row.id,
    name: row.rawName,
    fullName: row.fullName,
    state: row.stateName,
    stateId: row.stateId,
    centerCell: row.centerCell,
    pole: row.pole,
    area: roundNumber(row.area),
    cells: row.cells
  };
}

function getProvince(map, provinceId) {
  return map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId] || null;
}

function provinceExists(map, provinceId) {
  provinceId = normalizeProvinceId(provinceId);
  if (provinceId === 0) return true;
  return Boolean(Number.isInteger(provinceId) && getProvince(map, provinceId));
}

function normalizeProvinceId(provinceId) {
  return toIntegerId(provinceId);
}

function firstProvinceId(map) {
  const province = (map?.politics?.provinces || map?.pack?.provinces || [])
    .find(item => item && !item.removed && Number.isInteger(item.i ?? item.id));
  return province ? province.i ?? province.id : 0;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
