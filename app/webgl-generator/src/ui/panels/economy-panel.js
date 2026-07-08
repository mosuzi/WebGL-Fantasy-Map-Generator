import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const ECONOMY_PANEL_ID = "economy-panel";
const ECONOMY_LIST_DEFAULTS = Object.freeze({
  filter: "",
  sortKey: "stock",
  sortDir: "desc"
});

export function createEconomyPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, ECONOMY_PANEL_ID, ECONOMY_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    tab: "goods",
    filter: listPreferences.filter,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    selectedGoodId: null,
    selectedMarketId: null,
    selectedDealId: null,
    version: 0
  });
  const panelCallbacks = {
    onTab: tab => {
      panelState.tab = String(tab || "goods");
      panelState.sortKey = defaultSortKey(panelState.tab);
      panelState.sortDir = "desc";
    },
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, ECONOMY_PANEL_ID, {filter: value}, ECONOMY_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "name" || key === "typeLabel" || key === "routeLabel" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, ECONOMY_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, ECONOMY_LIST_DEFAULTS);
    },
    onSelectGood: row => {
      panelState.selectedGoodId = normalizeId(row.id);
    },
    onSelectMarket: row => {
      panelState.selectedMarketId = normalizeId(row.id);
    },
    onSelectDeal: row => {
      panelState.selectedDealId = normalizeId(row.id);
    },
    onLocate: row => {
      if (row?.locateObject) callbacks.onLocate?.(row.locateObject);
    }
  };

  const record = manager.registerPanel(ECONOMY_PANEL_ID, {
    title: "经济总览",
    left: 548,
    top: 124,
    width: 820,
    maxWidth: 1040,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-economy-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/EconomyPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "经济总览将在首次打开时加载。",
      loading: "正在加载经济总览...",
      failure: "经济总览加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      ensureSelection(panelState);
      panelState.version++;
      panelState.open = true;
      manager.open("economy-panel");
      lazyPanel.load();
    },
    setSelectedDealId(dealId) {
      const id = normalizeId(dealId);
      if (!dealExists(panelState.map, id)) return false;
      panelState.tab = "deals";
      panelState.filter = "";
      panelState.sortKey = "value";
      panelState.sortDir = "desc";
      panelState.selectedDealId = id;
      panelState.version++;
      return true;
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      ensureSelection(panelState);
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

function ensureSelection(panelState) {
  if (!goodExists(panelState.map, panelState.selectedGoodId)) panelState.selectedGoodId = firstGoodId(panelState.map);
  if (!marketExists(panelState.map, panelState.selectedMarketId)) panelState.selectedMarketId = firstMarketId(panelState.map);
  if (!dealExists(panelState.map, panelState.selectedDealId)) panelState.selectedDealId = firstDealId(panelState.map);
}

function firstGoodId(map) {
  return (map?.pack?.goods || []).find(good => good?.i)?.i ?? null;
}

function firstMarketId(map) {
  return (map?.pack?.markets || []).find(market => market?.i)?.i ?? null;
}

function firstDealId(map) {
  return (map?.pack?.deals || []).find(deal => Number.isInteger(deal?.i))?.i ?? null;
}

function goodExists(map, id) {
  id = normalizeId(id);
  return Number.isInteger(id) && Boolean(map?.pack?.goods?.[id]);
}

function marketExists(map, id) {
  id = normalizeId(id);
  return Number.isInteger(id) && Boolean(map?.pack?.markets?.[id]);
}

function dealExists(map, id) {
  id = normalizeId(id);
  return Number.isInteger(id) && Boolean((map?.pack?.deals || []).some(deal => deal?.i === id));
}

function defaultSortKey(tab) {
  if (tab === "markets") return "tradeValue";
  if (tab === "deals") return "value";
  return "stock";
}

function normalizeId(value) {
  return toIntegerId(value);
}
