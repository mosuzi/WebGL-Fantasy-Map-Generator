import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import ReligionPanel from "../vue/components/ReligionPanel.vue";
import {toIntegerId} from "../object-id.js";

export function createReligionPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "cells",
    sortDir: "desc",
    selectedReligionId: null
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "type" || key === "form" ? "asc" : "desc";
        panelState.sortKey = key;
      }
    },
    onSelect: row => {
      panelState.selectedReligionId = row.id;
      callbacks.onSelect?.(religionObject(row));
    },
    onLocate: row => callbacks.onLocate?.(religionObject(row)),
    onRename: (religionId, name) => callbacks.onRename?.(religionId, name),
    onColorChange: (religionId, color) => callbacks.onColorChange?.(religionId, color),
    onParentChange: (religionId, parentId) => callbacks.onParentChange?.(religionId, parentId),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("religion-panel", {
    title: "宗教管理",
    left: 524,
    top: 164,
    width: 600,
    maxWidth: 740,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-religion-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(ReligionPanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "religion") panelState.selectedReligionId = normalizeReligionId(selection.object.id);
      if (!religionExists(map, panelState.selectedReligionId)) panelState.selectedReligionId = firstReligionId(map);
      panelState.open = true;
      manager.open("religion-panel");
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "religion") panelState.selectedReligionId = normalizeReligionId(selection.object.id);
      if (!religionExists(map, panelState.selectedReligionId)) panelState.selectedReligionId = firstReligionId(map);
    },
    setSelectedReligionId(religionId) {
      const normalized = normalizeReligionId(religionId);
      if (religionExists(panelState.map, normalized)) panelState.selectedReligionId = normalized;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      app.unmount();
    }
  };
}

function religionObject(row) {
  return {
    kind: "religion",
    id: row.id,
    name: row.rawName,
    type: row.type,
    form: row.form,
    culture: row.cultureName,
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

function religionExists(map, religionId) {
  religionId = normalizeReligionId(religionId);
  return Boolean(Number.isInteger(religionId) && (map?.society?.religions?.[religionId] || map?.pack?.religions?.[religionId]));
}

function normalizeReligionId(religionId) {
  return toIntegerId(religionId);
}

function firstReligionId(map) {
  const religion = (map?.society?.religions || map?.pack?.religions || []).find(item =>
    item && !item.removed && Number.isInteger(item.i ?? item.id) && (item.i ?? item.id) > 0
  );
  return religion ? religion.i ?? religion.id : null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
