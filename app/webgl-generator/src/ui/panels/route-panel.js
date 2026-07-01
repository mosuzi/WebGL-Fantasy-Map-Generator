import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";

export function createRoutePanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: "",
    sortKey: "length",
    sortDir: "desc",
    selectedRouteId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "type" || key === "fromName" ? "asc" : "desc";
      }
    },
    onSelect: row => {
      panelState.selectedRouteId = row.id;
      callbacks.onSelect?.(routeObject(row));
    },
    onLocate: row => callbacks.onLocate?.(routeObject(row)),
    onNoteChange: (routeId, body) => callbacks.onNoteChange?.(routeId, body),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("route-panel", {
    title: "路线管理",
    left: 460,
    top: 116,
    width: 560,
    maxWidth: 680,
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-route-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/RoutePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "路线管理将在首次打开时加载。",
      loading: "正在加载路线管理...",
      failure: "路线管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "route") panelState.selectedRouteId = normalizeRouteId(selection.object.id);
      if (!routeExists(map, panelState.selectedRouteId)) panelState.selectedRouteId = firstRouteId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("route-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      if (selection?.object?.kind === "route") panelState.selectedRouteId = normalizeRouteId(selection.object.id);
      if (!routeExists(map, panelState.selectedRouteId)) panelState.selectedRouteId = firstRouteId(map);
      panelState.version++;
    },
    setSelectedRouteId(routeId) {
      const normalized = normalizeRouteId(routeId);
      if (routeExists(panelState.map, normalized)) panelState.selectedRouteId = normalized;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function routeObject(row) {
  return {
    kind: "route",
    id: row.id,
    type: row.type,
    level: row.level,
    fromId: row.fromId,
    toId: row.toId,
    from: row.fromName,
    to: row.toName,
    length: roundNumber(row.length),
    segments: row.segments
  };
}

function routeExists(map, routeId) {
  routeId = normalizeRouteId(routeId);
  return Boolean(Number.isInteger(routeId) && (map?.settlements?.routes || []).some(route => route.id === routeId));
}

function normalizeRouteId(routeId) {
  return toIntegerId(routeId);
}

function firstRouteId(map) {
  return map?.settlements?.routes?.[0]?.id ?? null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
