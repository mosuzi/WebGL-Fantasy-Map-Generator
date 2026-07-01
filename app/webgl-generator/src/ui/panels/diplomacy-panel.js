import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import DiplomacyPanel from "../vue/components/DiplomacyPanel.vue";

export function createDiplomacyPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "relation",
    sortDir: "asc",
    selectedStateId: null,
    selectedObjectId: null,
    version: 0
  });
  const panelCallbacks = {
    onSubjectChange: stateId => {
      panelState.selectedStateId = stateId;
      if (!stateExists(panelState.map, panelState.selectedObjectId, stateId)) panelState.selectedObjectId = firstOtherStateId(panelState.map, stateId);
      callbacks.onSubjectChange?.(stateId);
    },
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" || key === "relation" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedObjectId = row.id;
      callbacks.onSelect?.(stateObject(row));
    },
    onMatrixCell: (subjectId, objectId) => {
      panelState.selectedStateId = subjectId;
      panelState.selectedObjectId = objectId;
      callbacks.onSubjectChange?.(subjectId);
    },
    onLocate: row => {
      panelState.selectedObjectId = row.id;
      callbacks.onLocate?.(stateObject(row));
    },
    onRelationChange: (subjectId, objectId, relation) => callbacks.onRelationChange?.(subjectId, objectId, relation),
    onRegenerate: () => callbacks.onRegenerate?.(),
    onShowTheme: stateId => callbacks.onShowTheme?.(stateId),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("diplomacy-panel", {
    title: "外交管理",
    left: 548,
    top: 116,
    width: 780,
    maxWidth: 980,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-diplomacy-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(DiplomacyPanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "state" && stateExists(map, selection.object.id)) panelState.selectedStateId = selection.object.id;
      if (!stateExists(map, panelState.selectedStateId)) panelState.selectedStateId = firstStateId(map);
      if (!stateExists(map, panelState.selectedObjectId, panelState.selectedStateId)) panelState.selectedObjectId = firstOtherStateId(map, panelState.selectedStateId);
      panelState.version++;
      panelState.open = true;
      manager.open("diplomacy-panel");
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (!stateExists(map, panelState.selectedStateId)) panelState.selectedStateId = firstStateId(map);
      if (!stateExists(map, panelState.selectedObjectId, panelState.selectedStateId)) panelState.selectedObjectId = firstOtherStateId(map, panelState.selectedStateId);
      panelState.version++;
    },
    setSelectedStateId(stateId) {
      if (!stateExists(panelState.map, stateId)) return;
      panelState.selectedStateId = stateId;
      if (!stateExists(panelState.map, panelState.selectedObjectId, stateId)) panelState.selectedObjectId = firstOtherStateId(panelState.map, stateId);
    },
    isOpen() {
      return panelState.open;
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
    fullName: row.name,
    relation: row.relation,
    relationLabel: row.relationLabel,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    centerCell: row.centerCell,
    population: row.population,
    burgs: row.burgs,
    area: row.area
  };
}

function firstStateId(map) {
  return stateRows(map)[0]?.id ?? null;
}

function firstOtherStateId(map, stateId) {
  return stateRows(map).find(row => row.id !== stateId)?.id ?? null;
}

function stateExists(map, stateId, excludedId = null) {
  return Number.isInteger(stateId) && stateId !== excludedId && Boolean(map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId]);
}

function stateRows(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .map(state => ({id: state.i ?? state.id, name: state.fullName || state.name || `国家 #${state.i ?? state.id}`}));
}
