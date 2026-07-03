import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createMilitaryPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "troops",
    sortDir: "desc",
    selectedStateId: "all",
    selectedStatus: "all",
    selectedRegimentId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onStateChange: stateId => {
      panelState.selectedStateId = stateId === "all" ? "all" : Number(stateId);
      if (!regimentExists(panelState.map, panelState.selectedRegimentId, panelState.selectedStateId, panelState.selectedStatus)) {
        panelState.selectedRegimentId = firstRegimentId(panelState.map, panelState.selectedStateId, panelState.selectedStatus);
      }
    },
    onStatusChange: status => {
      panelState.selectedStatus = status || "all";
      if (!regimentExists(panelState.map, panelState.selectedRegimentId, panelState.selectedStateId, panelState.selectedStatus)) {
        panelState.selectedRegimentId = firstRegimentId(panelState.map, panelState.selectedStateId, panelState.selectedStatus);
      }
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "stateName" || key === "name" || key === "statusLabel" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedRegimentId = row.id;
      callbacks.onSelect?.(militaryObject(row));
    },
    onLocate: row => {
      panelState.selectedRegimentId = row.id;
      callbacks.onLocate?.(militaryObject(row));
    },
    onRatiosApply: (stateId, ratios) => callbacks.onRatiosApply?.(stateId, ratios),
    onStatusApply: (target, status) => callbacks.onStatusApply?.(target, status),
    onBatchStatusApply: (targets, status) => callbacks.onBatchStatusApply?.(targets, status),
    onStationApply: (target, destination) => callbacks.onStationApply?.(target, destination),
    onBaseApply: target => callbacks.onBaseApply?.(target),
    onBattleEventApply: (target, event) => callbacks.onBattleEventApply?.(target, event),
    onBattleEventsImport: file => callbacks.onBattleEventsImport?.(file),
    onRename: (target, name) => callbacks.onRename?.(target, name),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("military-panel", {
    title: "军事管理",
    left: 584,
    top: 136,
    width: 720,
    maxWidth: 920,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-military-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/MilitaryPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "军事管理将在首次打开时加载。",
      loading: "正在加载军事管理...",
      failure: "军事管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "military") panelState.selectedRegimentId = selection.object.id;
      if (!regimentExists(map, panelState.selectedRegimentId, panelState.selectedStateId, panelState.selectedStatus)) {
        panelState.selectedRegimentId = firstRegimentId(map, panelState.selectedStateId, panelState.selectedStatus);
      }
      panelState.version++;
      panelState.open = true;
      manager.open("military-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (!regimentExists(map, panelState.selectedRegimentId, panelState.selectedStateId, panelState.selectedStatus)) {
        panelState.selectedRegimentId = firstRegimentId(map, panelState.selectedStateId, panelState.selectedStatus);
      }
      panelState.version++;
    },
    setSelectedRegimentId(regimentId) {
      if (!regimentExists(panelState.map, regimentId, panelState.selectedStateId, panelState.selectedStatus)) return;
      panelState.selectedRegimentId = regimentId;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function militaryObject(row) {
  return {
    kind: "military",
    id: row.id,
    regimentId: row.regimentId,
    stateId: row.stateId,
    name: row.name,
    state: row.stateName,
    type: row.type,
    status: row.status,
    statusLabel: row.statusLabel,
    dominantUnit: row.dominantUnit,
    dominantUnitLabel: row.dominantUnitLabel,
    troops: row.troops,
    units: row.units,
    icon: row.icon,
    iconVariant: row.iconVariant,
    iconLabel: row.iconLabel,
    x: row.x,
    y: row.y,
    cell: row.cell,
    baseCell: row.baseCell,
    bx: row.baseX,
    by: row.baseY,
    eventCount: row.eventCount,
    latestEvent: row.latestEvent
  };
}

function firstRegimentId(map, stateId = "all", status = "all") {
  return regimentRows(map).find(row => regimentMatches(row, stateId, status))?.id ?? null;
}

function regimentExists(map, regimentId, stateId = "all", status = "all") {
  return Boolean(regimentRows(map).find(row => row.id === regimentId && regimentMatches(row, stateId, status)));
}

function regimentMatches(row, stateId, status) {
  const matchesState = stateId === "all" || row.stateId === Number(stateId);
  const matchesStatus = status === "all" || statusValue(row) === status;
  return matchesState && matchesStatus;
}

function statusValue(row) {
  return String(row.status || row.statusLabel || "unknown");
}

function regimentRows(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({
      id: regiment.id ?? `${state.i}:${regiment.i}`,
      regimentId: regiment.i,
      stateId: state.i,
      stateName: state.name || state.fullName || `国家 #${state.i}`,
      name: regiment.name || `军团 #${regiment.i}`,
      status: regiment.status,
      statusLabel: regiment.statusLabel
    })));
}
