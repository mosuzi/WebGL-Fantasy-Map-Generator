import {createApp} from "vue";
import {pinia} from "./pinia.js";
import VueStateBridge from "./VueStateBridge.vue";
import {useEditorStore} from "./stores/editor-store.js";
import {useGlobalConfigStore} from "./stores/global-config-store.js";

let app = null;

export function initializeVueStateBridge(documentRef) {
  const root = documentRef.getElementById("vue-state-root");
  if (!root || app) return null;
  app = createApp(VueStateBridge);
  app.use(pinia);
  app.mount(root);

  const config = useGlobalConfigStore(pinia);
  const editor = useEditorStore(pinia);
  documentRef.defaultView.__webglGeneratorStores = {config, editor};
  return {config, editor};
}

export function readGlobalConfigPreferences() {
  if (!app) return null;
  return useGlobalConfigStore(pinia).readPreferences();
}

export function patchGlobalConfigPreferences(patch) {
  if (!app) return null;
  return useGlobalConfigStore(pinia).patchPreferences(patch);
}

export function setGlobalConfigLayerVisible(layer, visible) {
  if (!app) return null;
  return useGlobalConfigStore(pinia).setLayerVisible(layer, visible);
}

export function syncEditorStateSnapshot(snapshot) {
  if (!app) return;
  useEditorStore(pinia).setSnapshot(snapshot);
}
