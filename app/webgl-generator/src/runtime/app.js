import {generatePlaceholderMap} from "../generator/index.js";
import {DEFAULT_OPTIONS} from "../generator/options.js";
import {createRandomSeed} from "../generator/random.js";
import {PlaceholderMapRenderer} from "../renderer/placeholder-renderer.js";
import {PanelManager} from "../ui/panel-manager.js";
import {bindRuntimePanel, readOptionsFromPanel, setSeedInput, updatePickPanel, updateRuntimePanel} from "../ui/panel.js";
import {createObjectDetailsPanel} from "../ui/panels/object-details-panel.js";

export function createGeneratorApp(documentRef) {
  const canvas = documentRef.getElementById("map-canvas");
  const panelManager = new PanelManager(documentRef, documentRef.querySelector(".map-stage"));
  const state = {
    options: {...DEFAULT_OPTIONS},
    map: null,
    pick: null,
    selection: null,
    editingObject: null,
    renderer: null,
    panels: {}
  };
  const objectDetailsPanel = createObjectDetailsPanel(documentRef, panelManager, {
    onEdit: object => {
      state.editingObject = object;
      state.panels.objectDetails.show(state.selection, state.editingObject);
      updatePickPanel(documentRef, state);
    },
    onCancelEdit: () => {
      state.editingObject = null;
      state.panels.objectDetails.show(state.selection, state.editingObject);
      updatePickPanel(documentRef, state);
    }
  });
  state.panels.objectDetails = objectDetailsPanel;
  const renderer = new PlaceholderMapRenderer(canvas, () => {
    if (state.map) updateRuntimePanel(documentRef, state);
  }, pick => {
    state.pick = pick;
    updatePickPanel(documentRef, state);
  }, selection => {
    state.selection = selection?.object ? selection : null;
    renderer.setSelection(state.selection?.object || null);
    state.panels.objectDetails.show(state.selection, state.editingObject);
    updatePickPanel(documentRef, state);
  });
  state.renderer = renderer;

  bindRuntimePanel(documentRef, {
    onGenerate: () => generate(state, documentRef),
    onRandomSeed: () => {
      setSeedInput(documentRef, createRandomSeed());
      generate(state, documentRef);
    },
    onFitView: () => {
      renderer.fitToView();
      updateRuntimePanel(documentRef, state);
    },
    onMode: mode => {
      renderer.setColorMode(mode);
      updateRuntimePanel(documentRef, state);
    }
  });

  generate(state, documentRef);
  window.__webglGeneratorApp = state;
  return state;
}

function generate(state, documentRef) {
  if (documentRef.getElementById("auto-random-seed").checked) {
    setSeedInput(documentRef, createRandomSeed());
  }
  state.options = readOptionsFromPanel(documentRef, state.options);
  state.map = generatePlaceholderMap(state.options);
  state.pick = null;
  state.selection = null;
  state.editingObject = null;
  state.renderer.loadMap(state.map);
  state.renderer.setSelection(null);
  state.panels.objectDetails.clear();
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}
