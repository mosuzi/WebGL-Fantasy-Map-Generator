import {reactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";

export function createHeightPanel(documentRef, manager, callbacks = {}) {
  const panelState = reactive({
    active: false,
    action: "raise",
    radius: 28,
    strength: 4,
    falloff: true,
    lastAffected: 0,
    lastHeight: "none",
    graphWidth: 1440,
    graphHeight: 960,
    currentHeightStats: null,
    currentHeightPreview: null,
    history: null
  });
  const panelCallbacks = {
    onActiveChange: active => callbacks.onActiveChange?.(active),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel("height-panel", {
    title: "高度编辑",
    left: 360,
    top: 110,
    width: 360,
    maxWidth: 420,
    onClose: () => {
      panelState.active = false;
      callbacks.onActiveChange?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-height-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/HeightPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "高度编辑将在首次打开时加载。",
      loading: "正在加载高度编辑...",
      failure: "高度编辑加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(history) {
      panelState.history = history;
      manager.open("height-panel");
      lazyPanel.load();
    },
    update({
      lastAffected = panelState.lastAffected,
      lastHeight = panelState.lastHeight,
      graphWidth = panelState.graphWidth,
      graphHeight = panelState.graphHeight,
      currentHeightStats = panelState.currentHeightStats,
      currentHeightPreview = panelState.currentHeightPreview,
      history = panelState.history
    } = {}) {
      panelState.lastAffected = lastAffected;
      panelState.lastHeight = lastHeight;
      panelState.graphWidth = graphWidth;
      panelState.graphHeight = graphHeight;
      panelState.currentHeightStats = currentHeightStats;
      panelState.currentHeightPreview = currentHeightPreview;
      panelState.history = history;
    },
    getBrush() {
      return {
        active: panelState.active,
        action: panelState.action,
        radius: panelState.radius,
        strength: panelState.strength,
        falloff: panelState.falloff
      };
    },
    setActive(active) {
      panelState.active = active;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}
