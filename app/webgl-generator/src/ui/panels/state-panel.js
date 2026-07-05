import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";

export function createStatePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    active: false,
    map: null,
    targetStateId: null,
    sourceStateId: null,
    filter: "",
    sortKey: "population",
    sortDir: "desc",
    radius: 28,
    addMode: false,
    lastAffected: 0,
    history: null,
    version: 0
  });
  const panelCallbacks = {
    onActiveChange: active => {
      panelState.active = active;
      callbacks.onActiveChange?.(active);
    },
    onTargetStateId: stateId => {
      panelState.targetStateId = normalizeStateId(stateId);
    },
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.targetStateId = row.id;
      callbacks.onSelect?.(stateObject(row));
    },
    onLocate: row => callbacks.onLocate?.(stateObject(row)),
    onEdit: row => {
      const nextActive = !(panelState.active && panelState.targetStateId === row.id);
      panelState.targetStateId = row.id;
      panelState.active = nextActive;
      panelState.addMode = false;
      callbacks.onActiveChange?.(nextActive);
      if (nextActive) callbacks.onEdit?.(stateObject(row));
    },
    onAddMode: active => {
      panelState.addMode = Boolean(active);
      if (active) panelState.active = false;
      callbacks.onAddMode?.(panelState.addMode);
    },
    onDeleteState: stateId => callbacks.onDeleteState?.(stateId),
    onRename: (stateId, name) => callbacks.onRename?.(stateId, name),
    onRenameVisibleFromNamebase: stateIds => callbacks.onRenameVisibleFromNamebase?.(stateIds),
    onRadius: radius => {
      panelState.radius = radius;
    },
    onColorChange: (stateId, color) => callbacks.onColorChange?.(stateId, color),
    onGovernmentChange: (stateId, governmentKey) => callbacks.onGovernmentChange?.(stateId, governmentKey),
    onCapitalChange: (stateId, burgId) => callbacks.onCapitalChange?.(stateId, burgId),
    onNoteChange: (stateId, body) => callbacks.onNoteChange?.(stateId, body),
    onSampleSelection: () => callbacks.onSampleSelection?.(),
    onSampleHover: () => callbacks.onSampleHover?.(),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("state-panel", {
    title: "国家编辑",
    left: 400,
    top: 128,
    width: 560,
    maxWidth: 680,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      panelState.active = false;
      panelState.addMode = false;
      callbacks.onActiveChange?.(false);
      callbacks.onAddMode?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-state-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/StatePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "国家编辑将在首次打开时加载。",
      loading: "正在加载国家编辑...",
      failure: "国家编辑加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (panelState.targetStateId === null) panelState.targetStateId = firstStateId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("state-panel");
      lazyPanel.load();
    },
    update({map = panelState.map, sourceStateId = panelState.sourceStateId, lastAffected = panelState.lastAffected, history = panelState.history} = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.sourceStateId = sourceStateId;
      panelState.lastAffected = lastAffected;
      panelState.history = history;
      if (!stateExists(map, panelState.targetStateId)) panelState.targetStateId = firstStateId(map);
      panelState.version++;
    },
    updateAddMode(active) {
      panelState.addMode = Boolean(active);
      panelState.version++;
    },
    getBrush() {
      return {
        active: panelState.active,
        targetStateId: panelState.targetStateId,
        radius: panelState.radius
      };
    },
    setTargetStateId(stateId) {
      const normalized = normalizeStateId(stateId);
      panelState.targetStateId = stateExists(panelState.map, normalized) ? normalized : panelState.targetStateId;
    },
    setActive(active) {
      panelState.active = active;
      if (active) panelState.addMode = false;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function stateObject(row) {
  return {
    kind: "state",
    id: row.id,
    name: row.rawName,
    fullName: row.fullName,
    government: row.governmentLabel,
    governmentKey: row.governmentKey,
    capitalName: row.capitalName,
    culture: row.culture,
    religion: row.religion,
    centerCell: row.centerCell,
    population: roundNumber(row.population),
    burgs: row.burgs,
    area: roundNumber(row.area)
  };
}

function stateRows(map) {
  const rows = (map?.politics?.states || []).filter(state => state?.i || state?.id).map(state => ({
    id: state.id ?? state.i,
    name: state.fullName || state.name || `国家 #${state.id ?? state.i}`
  }));
  return map?.politics?.states?.[0] ? [{id: 0, name: "中立"}, ...rows] : rows;
}

function firstStateId(map) {
  return stateRows(map).find(row => row.id > 0)?.id ?? stateRows(map)[0]?.id ?? null;
}

function stateExists(map, stateId) {
  stateId = normalizeStateId(stateId);
  if (stateId === null || stateId === undefined) return false;
  if (stateId === 0) return Boolean(map?.politics?.states?.[0]);
  return Boolean(map?.politics?.states?.[stateId]);
}

function normalizeStateId(stateId) {
  return toIntegerId(stateId);
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
