import {generatePlaceholderMap} from "../generator/index.js";
import {DEFAULT_OPTIONS} from "../generator/options.js";
import {createRandomSeed} from "../generator/random.js";
import {PlaceholderMapRenderer} from "../renderer/placeholder-renderer.js";
import {bindRuntimePanel, readOptionsFromPanel, setSeedInput, updatePickPanel, updateRuntimePanel} from "../ui/panel.js";

export function createGeneratorApp(documentRef) {
  const canvas = documentRef.getElementById("map-canvas");
  const state = {
    options: {...DEFAULT_OPTIONS},
    map: null,
    pick: null,
    renderer: null
  };
  const renderer = new PlaceholderMapRenderer(canvas, () => {
    if (state.map) updateRuntimePanel(documentRef, state);
  }, pick => {
    state.pick = pick;
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
  state.renderer.loadMap(state.map);
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}
