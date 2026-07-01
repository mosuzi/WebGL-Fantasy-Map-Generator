import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import CulturePanel from "../vue/components/CulturePanel.vue";

export function createCulturePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "cells",
    sortDir: "desc",
    selectedCultureId: null
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "type" ? "asc" : "desc";
        panelState.sortKey = key;
      }
    },
    onSelect: row => {
      panelState.selectedCultureId = row.id;
      callbacks.onSelect?.(cultureObject(row));
    },
    onLocate: row => callbacks.onLocate?.(cultureObject(row)),
    onRename: (cultureId, name) => callbacks.onRename?.(cultureId, name),
    onColorChange: (cultureId, color) => callbacks.onColorChange?.(cultureId, color),
    onParentChange: (cultureId, parentId) => callbacks.onParentChange?.(cultureId, parentId),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("culture-panel", {
    title: "文化管理",
    left: 492,
    top: 132,
    width: 580,
    maxWidth: 720,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-culture-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(CulturePanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "culture") panelState.selectedCultureId = selection.object.id;
      if (!cultureExists(map, panelState.selectedCultureId)) panelState.selectedCultureId = firstCultureId(map);
      panelState.open = true;
      manager.open("culture-panel");
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "culture") panelState.selectedCultureId = selection.object.id;
      if (!cultureExists(map, panelState.selectedCultureId)) panelState.selectedCultureId = firstCultureId(map);
    },
    setSelectedCultureId(cultureId) {
      if (cultureExists(panelState.map, cultureId)) panelState.selectedCultureId = cultureId;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      app.unmount();
    }
  };
}

function cultureObject(row) {
  return {
    kind: "culture",
    id: row.id,
    name: row.rawName,
    type: row.type,
    nameStyle: row.nameStyle,
    centerCell: row.centerCell,
    gridCenterCell: row.gridCenterCell,
    cells: row.cells,
    population: roundNumber(row.population),
    cities: row.cities,
    states: row.states,
    parent: row.parentName,
    depth: row.depth
  };
}

function cultureExists(map, cultureId) {
  return Boolean(Number.isInteger(cultureId) && (map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId]));
}

function firstCultureId(map) {
  const culture = (map?.society?.cultures || map?.pack?.cultures || []).find(item =>
    item && !item.removed && Number.isInteger(item.i ?? item.id) && (item.i ?? item.id) > 0
  );
  return culture ? culture.i ?? culture.id : null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
