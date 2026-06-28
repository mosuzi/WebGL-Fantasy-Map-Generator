import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import StatePanel from "../vue/components/StatePanel.vue";

export function createStatePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    active: false,
    map: null,
    targetStateId: null,
    sourceStateId: null,
    filter: "",
    sortKey: "population",
    sortDir: "desc",
    radius: 28,
    lastAffected: 0,
    history: null
  });
  const panelCallbacks = {
    onActiveChange: active => {
      panelState.active = active;
      callbacks.onActiveChange?.(active);
    },
    onTargetStateId: stateId => {
      panelState.targetStateId = stateId;
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
      panelState.targetStateId = row.id;
      panelState.active = true;
      callbacks.onActiveChange?.(true);
      callbacks.onEdit?.(stateObject(row));
    },
    onRename: (stateId, name) => callbacks.onRename?.(stateId, name),
    onRadius: radius => {
      panelState.radius = radius;
    },
    onColorChange: (stateId, color) => callbacks.onColorChange?.(stateId, color),
    onCapitalChange: (stateId, burgId) => callbacks.onCapitalChange?.(stateId, burgId),
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
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-state-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(StatePanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      if (panelState.targetStateId === null) panelState.targetStateId = firstStateId(map);
      manager.open("state-panel");
    },
    update({map = panelState.map, sourceStateId = panelState.sourceStateId, lastAffected = panelState.lastAffected, history = panelState.history} = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.sourceStateId = sourceStateId;
      panelState.lastAffected = lastAffected;
      panelState.history = history;
      if (!stateExists(map, panelState.targetStateId)) panelState.targetStateId = firstStateId(map);
    },
    getBrush() {
      return {
        active: panelState.active,
        targetStateId: panelState.targetStateId,
        radius: panelState.radius
      };
    },
    setTargetStateId(stateId) {
      panelState.targetStateId = stateExists(panelState.map, stateId) ? stateId : panelState.targetStateId;
    },
    setActive(active) {
      panelState.active = active;
    },
    unmount() {
      app.unmount();
    }
  };
}

function stateObject(row) {
  return {
    kind: "state",
    id: row.id,
    name: row.rawName,
    fullName: row.fullName,
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
  if (stateId === null || stateId === undefined) return false;
  if (stateId === 0) return Boolean(map?.politics?.states?.[0]);
  return Boolean(map?.politics?.states?.[stateId]);
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
