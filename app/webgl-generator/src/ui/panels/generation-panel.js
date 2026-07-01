import {createApp} from "vue";
import {pinia} from "../vue/pinia.js";
import ControlPanel from "../vue/components/ControlPanel.vue";

export function createGenerationPanel(documentRef, manager) {
  const panelRecord = manager.registerPanel("generation-panel", {
    title: "控制面板",
    left: 352,
    top: 24,
    width: 520,
    maxWidth: 600
  });
  const root = documentRef.createElement("div");
  root.className = "vue-control-panel-root";
  panelRecord.body.replaceChildren(root);
  const app = createApp(ControlPanel);
  app.use(pinia);
  app.mount(root);

  return {
    open() {
      manager.open("generation-panel");
    },
    body: panelRecord.body,
    unmount() {
      app.unmount();
    }
  };
}
