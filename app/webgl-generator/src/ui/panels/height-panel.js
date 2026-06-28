import {createApp, reactive} from "vue";
import {pinia} from "../vue/pinia.js";
import HeightPanel from "../vue/components/HeightPanel.vue";

export function createHeightPanel(documentRef, manager, callbacks = {}) {
  const panelState = reactive({
    active: false,
    action: "raise",
    radius: 28,
    strength: 4,
    falloff: true,
    lastAffected: 0,
    lastHeight: "none",
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
  const app = createApp(HeightPanel, {state: panelState, callbacks: panelCallbacks});
  app.use(pinia);
  app.mount(root);

  return {
    open(history) {
      panelState.history = history;
      manager.open("height-panel");
    },
    update({lastAffected = panelState.lastAffected, lastHeight = panelState.lastHeight, history = panelState.history} = {}) {
      panelState.lastAffected = lastAffected;
      panelState.lastHeight = lastHeight;
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
      app.unmount();
    }
  };
}
