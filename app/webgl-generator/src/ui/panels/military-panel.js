import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const MILITARY_PANEL_ID = "military-panel";
const MILITARY_COLUMN_WIDTHS = Object.freeze({
  stateName: 116,
  name: 136,
  statusLabel: 92,
  dominantUnitLabel: 96,
  troops: 88,
  suitabilityScore: 72
});
const MILITARY_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: MILITARY_COLUMN_WIDTHS,
  scope: "all",
  scopes: Object.freeze(["all", "selected", "filtered"]),
  stateFilter: "all",
  statusFilter: "all",
  eventChainFilter: "all",
  eventTypeFilter: "all",
  eventTypeFilters: Object.freeze(["all", "skirmish", "siege", "raid", "naval", "retreat", "report"]),
  eventOutcomeFilter: "all",
  eventOutcomeFilters: Object.freeze(["all", "victory", "defeat", "draw", "loss", "regroup"]),
  eventApplyFilter: "all",
  eventApplyFilters: Object.freeze(["all", "applied", "pending"]),
  sortKey: "troops",
  sortDir: "desc"
});

export function createMilitaryPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, MILITARY_PANEL_ID, MILITARY_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    eventExportScope: listPreferences.scope,
    eventChainFilter: listPreferences.eventChainFilter,
    eventTypeFilter: listPreferences.eventTypeFilter,
    eventOutcomeFilter: listPreferences.eventOutcomeFilter,
    eventApplyFilter: listPreferences.eventApplyFilter,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedStateId: listPreferences.stateFilter,
    selectedStatus: listPreferences.statusFilter,
    selectedRegimentId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {filter: value}, MILITARY_LIST_DEFAULTS);
    },
    onEventExportScope: value => {
      panelState.eventExportScope = value === "selected" || value === "filtered" ? value : "all";
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {scope: panelState.eventExportScope}, MILITARY_LIST_DEFAULTS);
    },
    onEventChainFilter: value => {
      panelState.eventChainFilter = value || "all";
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {eventChainFilter: panelState.eventChainFilter}, MILITARY_LIST_DEFAULTS);
    },
    onEventTypeFilter: value => {
      panelState.eventTypeFilter = normalizeBattleEventFilter(value, MILITARY_LIST_DEFAULTS.eventTypeFilters);
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {eventTypeFilter: panelState.eventTypeFilter}, MILITARY_LIST_DEFAULTS);
    },
    onEventOutcomeFilter: value => {
      panelState.eventOutcomeFilter = normalizeBattleEventFilter(value, MILITARY_LIST_DEFAULTS.eventOutcomeFilters);
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {eventOutcomeFilter: panelState.eventOutcomeFilter}, MILITARY_LIST_DEFAULTS);
    },
    onEventApplyFilter: value => {
      panelState.eventApplyFilter = normalizeBattleEventFilter(value, MILITARY_LIST_DEFAULTS.eventApplyFilters);
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {eventApplyFilter: panelState.eventApplyFilter}, MILITARY_LIST_DEFAULTS);
    },
    onStateChange: stateId => {
      panelState.selectedStateId = stateId === "all" ? "all" : Number(stateId);
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {stateFilter: panelState.selectedStateId}, MILITARY_LIST_DEFAULTS);
      if (!regimentExists(panelState.map, panelState.selectedRegimentId, panelState.selectedStateId, panelState.selectedStatus)) {
        panelState.selectedRegimentId = firstRegimentId(panelState.map, panelState.selectedStateId, panelState.selectedStatus);
      }
    },
    onStatusChange: status => {
      panelState.selectedStatus = status || "all";
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {statusFilter: panelState.selectedStatus}, MILITARY_LIST_DEFAULTS);
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
      updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, MILITARY_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, MILITARY_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, MILITARY_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
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
    onBattleEventsClear: (target, eventIds) => callbacks.onBattleEventsClear?.(target, eventIds),
    onRename: (target, name) => callbacks.onRename?.(target, name),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(MILITARY_PANEL_ID, {
    title: "军事管理",
    left: 584,
    top: 136,
    width: 720,
    maxWidth: 920,
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
      normalizeMilitaryFilters(panelState, map);
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
      normalizeMilitaryFilters(panelState, map);
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

function normalizeBattleEventFilter(value, allowedValues) {
  return allowedValues.includes(value) ? value : "all";
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

function normalizeMilitaryFilters(panelState, map) {
  if (panelState.selectedStateId !== "all" && !regimentRows(map).some(row => row.stateId === Number(panelState.selectedStateId))) {
    panelState.selectedStateId = "all";
  }
  if (panelState.selectedStatus !== "all" && !regimentRows(map).some(row => statusValue(row) === panelState.selectedStatus)) {
    panelState.selectedStatus = "all";
  }
}
