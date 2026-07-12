import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {OBJECT_KIND} from "../../runtime/object-kinds.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const ECONOMY_PANEL_ID = "economy-panel";
const ECONOMY_COLUMN_WIDTHS = Object.freeze({
  "goods.id": 56,
  "goods.name": 112,
  "goods.typeLabel": 84,
  "goods.value": 76,
  "goods.effectivePrice": 82,
  "goods.priceDelta": 76,
  "goods.stock": 76,
  "goods.shortage": 76,
  "goods.deals": 76,
  "goods.tradeValue": 86,
  "markets.id": 56,
  "markets.name": 132,
  "markets.stateName": 112,
  "markets.cityName": 112,
  "markets.cells": 72,
  "markets.foreignCells": 72,
  "markets.priceDelta": 76,
  "markets.stock": 76,
  "markets.shortage": 76,
  "markets.tradeValue": 86,
  "deals.id": 64,
  "deals.goodName": 104,
  "deals.sellerName": 118,
  "deals.buyerName": 118,
  "deals.stateRouteLabel": 104,
  "deals.routeLabel": 82,
  "deals.distance": 86,
  "deals.distanceCost": 76,
  "deals.units": 76,
  "deals.value": 86
});
const ECONOMY_LIST_DEFAULTS = Object.freeze({
  tab: "goods",
  tabs: Object.freeze(["goods", "markets", "deals"]),
  filter: "",
  columnWidths: ECONOMY_COLUMN_WIDTHS,
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
    tab: listPreferences.tab,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
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
      updatePanelListPreferences(documentRef, ECONOMY_PANEL_ID, {
        tab: panelState.tab,
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, ECONOMY_LIST_DEFAULTS);
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
    onColumnResize: ({table, key, width} = {}) => {
      if (!table || !key || !Number.isFinite(width)) return;
      const storageKey = `${table}.${key}`;
      const next = updatePanelListPreferences(documentRef, ECONOMY_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [storageKey]: width
        }
      }, ECONOMY_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
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
      if (panelState.tab === "markets") panelState.selectedMarketId = normalizeId(row.id);
      else if (panelState.tab === "deals") panelState.selectedDealId = normalizeId(row.id);
      else panelState.selectedGoodId = normalizeId(row.id);
      if (panelState.tab === "deals") callbacks.onLocate?.(tradeFlowObject(row));
      else if (row?.locateObject) callbacks.onLocate?.(row.locateObject);
    },
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, tradeFlowObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks)
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
      syncPanelHighlightCount(panelState, callbacks);
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
      updatePanelListPreferences(documentRef, ECONOMY_PANEL_ID, {
        tab: panelState.tab,
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, ECONOMY_LIST_DEFAULTS);
      return true;
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
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

function tradeFlowObject(row) {
  return {
    kind: OBJECT_KIND.TRADE_FLOW,
    id: row.id,
    goodId: row.goodId,
    goodName: row.goodName,
    name: `${row.goodName || `商品 #${row.goodId}`}：${row.sellerName || "卖方"} -> ${row.buyerName || "买方"}`,
    sellerType: row.sellerType,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    buyerType: row.buyerType,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    units: row.units,
    price: row.price,
    value: row.value,
    source: row.source,
    sourceLabel: row.sourceLabel
  };
}
