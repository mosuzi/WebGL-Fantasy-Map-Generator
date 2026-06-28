import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import CityPanel from "../vue/components/CityPanel.vue";

export function createCityPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "population",
    sortDir: "desc",
    selectedCityId: null
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortDir = key === "id" || key === "name" || key === "stateName" || key === "provinceName" || key === "type" ? "asc" : "desc";
        panelState.sortKey = key;
      }
    },
    onSelect: row => {
      panelState.selectedCityId = row.id;
      callbacks.onSelect?.(cityObject(row));
    },
    onLocate: row => callbacks.onLocate?.(cityObject(row)),
    onRename: (cityId, name) => callbacks.onRename?.(cityId, name),
    onPopulationChange: (cityId, population) => callbacks.onPopulationChange?.(cityId, population),
    onSyncOwnerToCell: cityId => callbacks.onSyncOwnerToCell?.(cityId),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("city-panel", {
    title: "城市管理",
    left: 456,
    top: 112,
    width: 600,
    maxWidth: 720,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-city-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(CityPanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "city") panelState.selectedCityId = selection.object.id;
      if (!cityExists(map, panelState.selectedCityId)) panelState.selectedCityId = firstCityId(map);
      panelState.open = true;
      manager.open("city-panel");
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "city") panelState.selectedCityId = selection.object.id;
      if (!cityExists(map, panelState.selectedCityId)) panelState.selectedCityId = firstCityId(map);
    },
    setSelectedCityId(cityId) {
      if (cityExists(panelState.map, cityId)) panelState.selectedCityId = cityId;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      app.unmount();
    }
  };
}

function cityObject(row) {
  return {
    kind: "city",
    id: row.id,
    name: row.rawName,
    type: row.type,
    population: roundNumber(row.population),
    state: row.stateName,
    stateId: row.stateId,
    province: row.provinceName,
    provinceId: row.provinceId,
    cell: row.cell,
    packCell: row.packCell,
    burgId: row.burgId
  };
}

function cityExists(map, cityId) {
  return Boolean(Number.isInteger(cityId) && map?.settlements?.cities?.[cityId]);
}

function firstCityId(map) {
  return (map?.settlements?.cities || []).find(city => city && Number.isInteger(city.id))?.id ?? null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
