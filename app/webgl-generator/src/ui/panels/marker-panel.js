import {createApp, markRaw, shallowReactive} from "vue";
import {pinia} from "../vue/pinia.js";
import MarkerPanel from "../vue/components/MarkerPanel.vue";
import {toIntegerId} from "../object-id.js";

export function createMarkerPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    scope: "all",
    sortKey: "economicValue",
    sortDir: "desc",
    selectedMarkerId: null,
    editMode: null,
    editType: null,
    editMarkerId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onScope: value => {
      panelState.scope = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" || key === "categoryLabel" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedMarkerId = row.id;
      callbacks.onSelect?.(markerObject(row));
    },
    onLocate: row => {
      panelState.selectedMarkerId = row.id;
      callbacks.onLocate?.(markerObject(row));
    },
    onRename: (markerId, name) => callbacks.onRename?.(markerId, name),
    onVisualChange: (markerId, patch) => callbacks.onVisualChange?.(markerId, patch),
    onNoteChange: (markerId, body) => callbacks.onNoteChange?.(markerId, body),
    onAddResourceMode: type => callbacks.onAddResourceMode?.(type),
    onMoveMode: markerId => callbacks.onMoveMode?.(markerId),
    onDelete: markerId => callbacks.onDelete?.(markerId),
    onRegenerateResources: () => callbacks.onRegenerateResources?.(),
    onCancelEdit: () => callbacks.onCancelEdit?.(),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("marker-panel", {
    title: "资源与标记管理",
    left: 504,
    top: 96,
    width: 620,
    maxWidth: 760,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-marker-panel-root";
  record.body.replaceChildren(root);
  const app = createApp(MarkerPanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "marker") panelState.selectedMarkerId = normalizeMarkerId(selection.object.id);
      if (!markerExists(map, panelState.selectedMarkerId)) panelState.selectedMarkerId = firstMarkerId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("marker-panel");
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "marker") panelState.selectedMarkerId = normalizeMarkerId(selection.object.id);
      if (!markerExists(map, panelState.selectedMarkerId)) panelState.selectedMarkerId = firstMarkerId(map);
      panelState.version++;
    },
    setSelectedMarkerId(markerId) {
      const normalized = normalizeMarkerId(markerId);
      if (markerExists(panelState.map, normalized)) panelState.selectedMarkerId = normalized;
    },
    updateEditMode(editMode) {
      panelState.editMode = editMode?.mode || null;
      panelState.editType = editMode?.type || null;
      panelState.editMarkerId = Number.isInteger(editMode?.markerId) ? editMode.markerId : null;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      app.unmount();
    }
  };
}

function markerObject(row) {
  return {
    kind: "marker",
    id: row.id,
    name: row.rawName,
    type: row.type,
    label: row.typeLabel,
    category: row.category,
    categoryLabel: row.categoryLabel,
    resourceKey: row.resourceKey,
    resourceLabel: row.resourceLabel,
    economicValue: row.economicValue,
    cell: row.cell,
    packCell: row.packCell,
    stateId: row.stateId,
    state: row.stateName,
    provinceId: row.provinceId,
    province: row.provinceName
  };
}

function markerExists(map, markerId) {
  markerId = normalizeMarkerId(markerId);
  return Boolean(Number.isInteger(markerId) && map?.markers?.markers?.[markerId]);
}

function normalizeMarkerId(markerId) {
  return toIntegerId(markerId);
}

function firstMarkerId(map) {
  return (map?.markers?.markers || []).find(marker => marker && Number.isInteger(marker.id))?.id ?? null;
}
