import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {sameObjectId, toIntegerId} from "../object-id.js";

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
      const normalized = normalizeStateId(stateId);
      panelState.selectedStateId = normalized;
      if (!stateExists(panelState.map, panelState.selectedObjectId, normalized)) panelState.selectedObjectId = firstOtherStateId(panelState.map, normalized);
      callbacks.onSubjectChange?.(normalized);
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
      panelState.selectedStateId = normalizeStateId(subjectId);
      panelState.selectedObjectId = normalizeStateId(objectId);
      callbacks.onSubjectChange?.(panelState.selectedStateId);
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
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/DiplomacyPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "外交管理将在首次打开时加载。",
      loading: "正在加载外交管理...",
      failure: "外交管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "state" && stateExists(map, selection.object.id)) panelState.selectedStateId = normalizeStateId(selection.object.id);
      if (!stateExists(map, panelState.selectedStateId)) panelState.selectedStateId = firstStateId(map);
      if (!stateExists(map, panelState.selectedObjectId, panelState.selectedStateId)) panelState.selectedObjectId = firstOtherStateId(map, panelState.selectedStateId);
      panelState.version++;
      panelState.open = true;
      manager.open("diplomacy-panel");
      lazyPanel.load();
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
      const normalized = normalizeStateId(stateId);
      if (!stateExists(panelState.map, normalized)) return;
      panelState.selectedStateId = normalized;
      if (!stateExists(panelState.map, panelState.selectedObjectId, normalized)) panelState.selectedObjectId = firstOtherStateId(panelState.map, normalized);
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
  return stateRows(map).find(row => !sameObjectId(row.id, stateId))?.id ?? null;
}

function stateExists(map, stateId, excludedId = null) {
  stateId = normalizeStateId(stateId);
  excludedId = normalizeStateId(excludedId);
  return Number.isInteger(stateId) && stateId !== excludedId && Boolean(map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId]);
}

function normalizeStateId(stateId) {
  return toIntegerId(stateId);
}

function stateRows(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .map(state => ({id: state.i ?? state.id, name: state.fullName || state.name || `国家 #${state.i ?? state.id}`}));
}
