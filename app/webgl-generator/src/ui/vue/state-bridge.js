import {createApp} from "vue";
import {pinia} from "./pinia.js";
import MapToolbar from "./components/MapToolbar.vue";
import VueStateBridge from "./VueStateBridge.vue";
import {useEditorStore} from "./stores/editor-store.js";
import {useGlobalConfigStore} from "./stores/global-config-store.js";

let app = null;
let toolbarApp = null;

export function initializeVueStateBridge(documentRef) {
  const root = documentRef.getElementById("vue-state-root");
  if (!root || app) return null;
  app = createApp(VueStateBridge);
  app.use(pinia);
  app.mount(root);
  mountMapToolbar(documentRef);

  const config = useGlobalConfigStore(pinia);
  const editor = useEditorStore(pinia);
  documentRef.defaultView.__webglGeneratorStores = {config, editor};
  return {config, editor};
}

function mountMapToolbar(documentRef) {
  const root = documentRef.getElementById("map-toolbar");
  if (!root || toolbarApp) return;
  toolbarApp = createApp(MapToolbar);
  toolbarApp.use(pinia);
  toolbarApp.mount(root);
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
