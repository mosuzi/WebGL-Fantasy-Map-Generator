import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

const PANEL_ID = "ocean-current-panel";

export function createOceanCurrentPanel(documentRef, manager, callbacks = {}) {
  const panelState = shallowReactive({
    open: false,
    map: null,
    history: null,
    filter: "",
    selectedId: null,
    highlightedIds: [],
    worldRebuild: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = String(value || "");
    },
    onSelect: row => {
      panelState.selectedId = row?.id ?? null;
      panelState.highlightedIds = panelState.selectedId ? [String(panelState.selectedId)] : [];
      callbacks.onHighlight?.(panelState.highlightedIds);
    },
    onLocate: row => {
      panelState.selectedId = row?.id ?? null;
      panelState.highlightedIds = panelState.selectedId ? [String(panelState.selectedId)] : [];
      callbacks.onHighlight?.(panelState.highlightedIds);
      callbacks.onLocate?.(row);
    },
    onRename: (id, name) => callbacks.onRename?.(id, name),
    onRegenerate: () => callbacks.onRegenerate?.(),
    onWorldRebuild: () => callbacks.onWorldRebuild?.(),
    onCancelWorldRebuild: () => callbacks.onCancelWorldRebuild?.(),
    onHighlight: ids => {
      panelState.highlightedIds = [...new Set((ids || []).map(String))];
      callbacks.onHighlight?.(panelState.highlightedIds);
    },
    onClearHighlights: () => {
      panelState.highlightedIds = [];
      callbacks.onHighlight?.([]);
    },
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(PANEL_ID, {
    title: "洋流管理",
    left: 380,
    top: 72,
    width: 500,
    maxWidth: 620,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      panelState.highlightedIds = [];
      callbacks.onHighlight?.([]);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-ocean-current-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/OceanCurrentPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "洋流管理将在首次打开时加载。",
      loading: "正在加载洋流管理...",
      failure: "洋流管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      reconcileSelection();
      panelState.open = true;
      panelState.version++;
      manager.open(PANEL_ID);
      lazyPanel.load();
    },
    update(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      reconcileSelection();
      panelState.version++;
    },
    setSelectedId(id) {
      panelState.selectedId = id === null || id === undefined ? null : String(id);
    },
    updateWorldRebuild(snapshot) {
      panelState.worldRebuild = snapshot ? markRaw(snapshot) : null;
      panelState.version++;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };

  function reconcileSelection() {
    const validIds = new Set((panelState.map?.oceanCurrents?.currents || []).map(current => String(current.id)));
    const highlightedIds = panelState.highlightedIds.filter(id => validIds.has(String(id)));
    if (highlightedIds.length !== panelState.highlightedIds.length) {
      panelState.highlightedIds = highlightedIds;
      callbacks.onHighlight?.(highlightedIds);
    }
    if (!panelState.selectedId || validIds.has(String(panelState.selectedId))) return;
    panelState.selectedId = null;
  }
}
