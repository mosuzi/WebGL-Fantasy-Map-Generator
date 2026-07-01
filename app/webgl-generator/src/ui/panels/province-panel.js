import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";

export function createProvincePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    active: false,
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "area",
    sortDir: "desc",
    selectedProvinceId: null,
    radius: 28,
    lastAffected: 0,
    sourceProvinceId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "stateName" ? "asc" : "desc";
        panelState.sortKey = key;
      }
    },
    onSelect: row => {
      panelState.selectedProvinceId = row.id;
      callbacks.onSelect?.(provinceObject(row));
    },
    onLocate: row => callbacks.onLocate?.(provinceObject(row)),
    onEdit: row => {
      panelState.selectedProvinceId = row.id;
      panelState.active = true;
      callbacks.onActiveChange?.(true);
      callbacks.onEdit?.(provinceObject(row));
    },
    onActiveChange: active => {
      panelState.active = active;
      callbacks.onActiveChange?.(active);
    },
    onTargetProvinceId: provinceId => {
      panelState.selectedProvinceId = normalizeProvinceId(provinceId);
    },
    onRadius: radius => {
      panelState.radius = radius;
    },
    onSampleSelection: () => callbacks.onSampleSelection?.(),
    onSampleHover: () => callbacks.onSampleHover?.(),
    onRename: (provinceId, name) => callbacks.onRename?.(provinceId, name),
    onColorChange: (provinceId, color) => callbacks.onColorChange?.(provinceId, color),
    onNoteChange: (provinceId, body) => callbacks.onNoteChange?.(provinceId, body),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("province-panel", {
    title: "省份管理",
    left: 420,
    top: 92,
    width: 560,
    maxWidth: 680,
    onClose: () => {
      panelState.active = false;
      panelState.open = false;
      callbacks.onActiveChange?.(false);
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
    getBrush() {
      return {
        active: panelState.active,
        targetProvinceId: panelState.selectedProvinceId,
        radius: panelState.radius
      };
    },
    setActive(active) {
      panelState.active = active;
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
