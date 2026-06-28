import {generatePlaceholderMap} from "../generator/index.js";
import {DEFAULT_OPTIONS} from "../generator/options.js";
import {createRandomSeed} from "../generator/random.js";
import {PlaceholderMapRenderer} from "../renderer/placeholder-renderer.js";
import {PanelManager} from "../ui/panel-manager.js";
import {bindRuntimePanel, readControlPreferences, readOptionsFromPanel, setActiveModeButton, setEditingInteractionLock, setSeedInput, updatePickPanel, updateRuntimePanel} from "../ui/panel.js";
import {createCityPanel} from "../ui/panels/city-panel.js";
import {createCulturePanel} from "../ui/panels/culture-panel.js";
import {createGenerationPanel} from "../ui/panels/generation-panel.js";
import {createHeightPanel} from "../ui/panels/height-panel.js";
import {createObjectDetailsPanel} from "../ui/panels/object-details-panel.js";
import {createProvincePanel} from "../ui/panels/province-panel.js";
import {createReligionPanel} from "../ui/panels/religion-panel.js";
import {createRiverPanel} from "../ui/panels/river-panel.js";
import {createRoutePanel} from "../ui/panels/route-panel.js";
import {createStatePanel} from "../ui/panels/state-panel.js";
import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {createEditRefreshScheduler} from "./edit-refresh-scheduler.js";
import {EditHistory} from "./edit-history.js";
import {createSetCityPopulationCommand, createSyncCityOwnerToCellCommand} from "./city-edit-commands.js";
import {createSetCultureColorCommand} from "./culture-edit-commands.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "./height-edit-commands.js";
import {createRenameObjectCommand, createSetProvinceColorCommand, createSetStateCapitalCommand} from "./object-edit-commands.js";
import {applyProvinceBrushPreview, createApplyProvinceBrushCommand, PROVINCE_BRUSH_PREVIEW_EFFECTS} from "./province-edit-commands.js";
import {createSetReligionColorCommand} from "./religion-edit-commands.js";
import {resolveObject} from "./object-resolver.js";
import {createSetRiverWidthFactorCommand} from "./river-edit-commands.js";
import {SelectionStore} from "./selection-store.js";
import {applyStateBrushPreview, createApplyStateBrushCommand, createSetStateColorCommand, STATE_BRUSH_PREVIEW_EFFECTS} from "./state-edit-commands.js";
import {syncEditorStateSnapshot} from "../ui/vue/state-bridge.js";

export function createGeneratorApp(documentRef) {
  const canvas = documentRef.getElementById("map-canvas");
  const panelManager = new PanelManager(documentRef, documentRef.querySelector(".map-stage"));
  const state = {
    options: {...DEFAULT_OPTIONS},
    map: null,
    pick: null,
    selection: null,
    editingObject: null,
    editHistory: new EditHistory(),
    editRefreshScheduler: null,
    heightEdit: {
      activeStroke: null,
      lastAffected: 0,
      lastHeight: "none"
    },
    stateEdit: {
      activeStroke: null,
      lastAffected: 0,
      sourceStateId: null,
      lastPointer: null
    },
    provinceEdit: {
      activeStroke: null,
      lastAffected: 0,
      sourceProvinceId: null,
      lastPointer: null
    },
    lastEditRefresh: null,
    selectionStore: null,
    renderer: null,
    pendingGenerateId: 0,
    panels: {}
  };
  let selectionStore = null;
  const generationPanel = createGenerationPanel(documentRef, panelManager);
  state.panels.generation = generationPanel;
  let heightPanel = null;
  let statePanel = null;
  let provincePanel = null;
  let cityPanel = null;
  let culturePanel = null;
  let religionPanel = null;
  let riverPanel = null;
  let routePanel = null;
  let suppressNextRiverPanelOpen = false;
  const objectDetailsPanel = createObjectDetailsPanel(documentRef, panelManager, {
    onEdit: object => {
      selectionStore.startEditing(object);
    },
    onCancelEdit: () => {
      selectionStore.stopEditing();
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onRename: (object, name) => {
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
      updateCulturePanel(state);
      updateReligionPanel(state);
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
      updateEditingInteractionLock(state, documentRef);
    }
  });
  state.panels.objectDetails = objectDetailsPanel;
  heightPanel = createHeightPanel(documentRef, panelManager, {
    onActiveChange: active => {
      if (active) {
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        state.stateEdit.activeStroke = null;
        state.provinceEdit.activeStroke = null;
        renderer.setColorMode("height");
        setActiveModeButton(documentRef, "height");
        updateEditingInteractionLock(state, documentRef);
        updateRuntimePanel(documentRef, state);
      } else {
        state.heightEdit.activeStroke = null;
        updateEditingInteractionLock(state, documentRef);
      }
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateHeightPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateHeightPanel(state);
    }
  });
  state.panels.height = heightPanel;
  statePanel = createStatePanel(documentRef, panelManager, {
    onActiveChange: active => {
      if (active) {
        heightPanel?.setActive(false);
        provincePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.provinceEdit.activeStroke = null;
        renderer.setColorMode("states");
        setActiveModeButton(documentRef, "states");
        updateEditingInteractionLock(state, documentRef);
        updateRuntimePanel(documentRef, state);
      } else {
        state.stateEdit.activeStroke = null;
        updateEditingInteractionLock(state, documentRef);
      }
    },
    onSampleSelection: () => {
      setStatePanelTarget(state, getStateIdFromSelection(state));
    },
    onSampleHover: () => {
      setStatePanelTarget(state, getStateIdFromPick(state));
    },
    onSelect: object => {
      selectionStore.setSelection({object});
      setStatePanelTarget(state, object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      setStatePanelTarget(state, object.id);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      setStatePanelTarget(state, object.id);
      renderer.setColorMode("states");
      setActiveModeButton(documentRef, "states");
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onRename: (stateId, name) => {
      const object = {kind: "state", id: stateId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onColorChange: (stateId, color) => {
      const beforeColor = state.map?.politics?.states?.[stateId]?.color || null;
      const command = createSetStateColorCommand(stateId, color, {beforeColor});
      if (!command.isNoop({map: state.map})) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateStatePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onCapitalChange: (stateId, burgId) => {
      const context = {map: state.map};
      const command = createSetStateCapitalCommand(stateId, burgId);
      if (!command.isNoop(context)) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterStateEdit(state, command);
      updateStatePanel(state);
      updateCityPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterStateEdit(state, command);
      updateStatePanel(state);
      updateCityPanel(state);
    }
  });
  state.panels.state = statePanel;
  provincePanel = createProvincePanel(documentRef, panelManager, {
    onActiveChange: active => {
      if (active) {
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.stateEdit.activeStroke = null;
        renderer.setColorMode("provinces");
        setActiveModeButton(documentRef, "provinces");
        updateEditingInteractionLock(state, documentRef);
        updateRuntimePanel(documentRef, state);
      } else {
        state.provinceEdit.activeStroke = null;
        updateEditingInteractionLock(state, documentRef);
      }
    },
    onSampleSelection: () => {
      setProvincePanelTarget(state, getProvinceIdFromSelection(state));
    },
    onSampleHover: () => {
      setProvincePanelTarget(state, getProvinceIdFromPick(state));
    },
    onSelect: object => {
      selectionStore.setSelection({object});
      provincePanel.setSelectedProvinceId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      provincePanel.setSelectedProvinceId(object.id);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      provincePanel.setSelectedProvinceId(object.id);
      renderer.setColorMode("provinces");
      setActiveModeButton(documentRef, "provinces");
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onRename: (provinceId, name) => {
      const object = {kind: "province", id: provinceId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateProvincePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onColorChange: (provinceId, color) => {
      const province = state.map?.politics?.provinces?.[provinceId] || state.map?.pack?.provinces?.[provinceId];
      const command = createSetProvinceColorCommand(provinceId, color, {beforeColor: province?.color || null});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateProvincePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateProvincePanel(state);
      updateCityPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateProvincePanel(state);
      updateCityPanel(state);
    }
  });
  state.panels.province = provincePanel;
  cityPanel = createCityPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      cityPanel.setSelectedCityId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      cityPanel.setSelectedCityId(object.id);
    },
    onRename: (cityId, name) => {
      const object = {kind: "city", id: cityId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onPopulationChange: (cityId, population) => {
      const context = {map: state.map};
      const command = createSetCityPopulationCommand(cityId, population);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onSyncOwnerToCell: cityId => {
      const context = {map: state.map};
      const command = createSyncCityOwnerToCellCommand(cityId);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateStatePanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateStatePanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
    }
  });
  state.panels.city = cityPanel;
  culturePanel = createCulturePanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      culturePanel.setSelectedCultureId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      culturePanel.setSelectedCultureId(object.id);
    },
    onRename: (cultureId, name) => {
      const object = {kind: "culture", id: cultureId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateCulturePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onColorChange: (cultureId, color) => {
      const culture = state.map?.society?.cultures?.[cultureId] || state.map?.pack?.cultures?.[cultureId];
      const command = createSetCultureColorCommand(cultureId, color, {beforeColor: culture?.color || null});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateCulturePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateCulturePanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateCulturePanel(state);
    }
  });
  state.panels.culture = culturePanel;
  religionPanel = createReligionPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      religionPanel.setSelectedReligionId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      religionPanel.setSelectedReligionId(object.id);
    },
    onRename: (religionId, name) => {
      const object = {kind: "religion", id: religionId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateReligionPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onColorChange: (religionId, color) => {
      const religion = state.map?.society?.religions?.[religionId] || state.map?.pack?.religions?.[religionId];
      const command = createSetReligionColorCommand(religionId, color, {beforeColor: religion?.color || null});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateReligionPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateReligionPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateReligionPanel(state);
    }
  });
  state.panels.religion = religionPanel;
  routePanel = createRoutePanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      routePanel.setSelectedRouteId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      routePanel.setSelectedRouteId(object.id);
    }
  });
  state.panels.route = routePanel;
  riverPanel = createRiverPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      if (state.editingObject?.kind === "river" && state.editingObject.id === object.id) {
        selectionStore.stopEditing();
      } else {
        selectionStore.startEditing(object);
      }
    },
    onRename: (riverId, name) => {
      const object = {kind: "river", id: riverId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
      updateEditingInteractionLock(state, documentRef);
    },
    onClose: () => {
      if (state.editingObject?.kind === "river") {
        suppressNextRiverPanelOpen = true;
        selectionStore.stopEditing();
      }
    },
    onSetWidthFactor: (riverId, widthFactor) => {
      const context = {map: state.map};
      const command = createSetRiverWidthFactorCommand(riverId, widthFactor);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
    }
  });
  state.panels.river = riverPanel;
  const renderer = new PlaceholderMapRenderer(canvas, () => {
    if (state.map) updateRuntimePanel(documentRef, state);
  }, pick => {
    state.pick = pick;
    updatePickPanel(documentRef, state);
    updateStatePanel(state);
    updateEditingInteractionLock(state, documentRef);
  }, selection => {
    selectionStore.setSelection(selection);
  });
  state.renderer = renderer;
  selectionStore = new SelectionStore(({selection, editingObject}) => {
    state.selection = selection;
    state.editingObject = editingObject;
    renderer.setSelection(selection?.object || null);
    if (selection?.object?.kind === "state") {
      state.panels.objectDetails.clear();
      state.panels.state.setTargetStateId(selection.object.id);
      state.panels.state.open(state.map, state.editHistory.getStats());
    } else if (selection?.object?.kind === "city") {
      state.panels.objectDetails.clear();
      state.panels.city.setSelectedCityId(selection.object.id);
      state.panels.city.open(state.map, selection, state.editHistory.getStats());
    } else if (selection?.object?.kind === "province" && shouldOpenProvincePanelForSelection(state)) {
      state.panels.objectDetails.clear();
      state.panels.province.setSelectedProvinceId(selection.object.id);
      state.panels.province.open(state.map, selection, state.editHistory.getStats());
    } else if (selection?.object?.kind === "culture" && shouldOpenCulturePanelForSelection(state)) {
      state.panels.objectDetails.clear();
      state.panels.culture.setSelectedCultureId(selection.object.id);
      state.panels.culture.open(state.map, selection, state.editHistory.getStats());
    } else if (selection?.object?.kind === "religion" && shouldOpenReligionPanelForSelection(state)) {
      state.panels.objectDetails.clear();
      state.panels.religion.setSelectedReligionId(selection.object.id);
      state.panels.religion.open(state.map, selection, state.editHistory.getStats());
    } else if (selection?.object?.kind === "river") {
      state.panels.objectDetails.clear();
      if (suppressNextRiverPanelOpen) {
        suppressNextRiverPanelOpen = false;
      } else {
        state.panels.river.open(state.map, selection, state.editHistory.getStats(), editingObject);
      }
    } else if (selection?.object?.kind === "route") {
      state.panels.objectDetails.clear();
      state.panels.route.setSelectedRouteId(selection.object.id);
      state.panels.route.open(state.map, selection);
    } else {
      state.panels.objectDetails.show(selection, editingObject);
    }
    state.panels.river.update(state.map, selection, state.editHistory.getStats(), editingObject);
    state.panels.route.update(state.map, selection);
    updateStatePanel(state);
    updateProvincePanel(state);
    updateCityPanel(state);
    updateCulturePanel(state);
    updateReligionPanel(state);
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    updatePickPanel(documentRef, state);
  }, object => resolveObject(state.map, object));
  state.selectionStore = selectionStore;
  state.editRefreshScheduler = createEditRefreshScheduler({state, documentRef, updateRuntimePanel, updatePickPanel});
  applyControlPreferencesToRenderer(documentRef, renderer);
  bindHeightEditing(canvas, state, documentRef);
  bindStateEditing(canvas, state, documentRef);
  bindProvinceEditing(canvas, state, documentRef);
  bindEditingInteractionLock(canvas, state);

  bindRuntimePanel(documentRef, {
    onGenerate: () => requestGenerate(state, documentRef),
    onRandomSeed: () => {
      setSeedInput(documentRef, createRandomSeed());
      requestGenerate(state, documentRef);
    },
    onFitView: () => {
      renderer.fitToView();
      updateRuntimePanel(documentRef, state);
    },
    onShowOceanHeight: showOceanHeight => {
      renderer.setViewOptions({showOceanHeight});
      updateRuntimePanel(documentRef, state);
    },
    onMaxCityLabels: maxCityLabels => {
      renderer.setLabelOptions({maxCityLabels});
      updateRuntimePanel(documentRef, state);
    },
    onLayerVisible: (layer, visible) => {
      renderer.setLayerVisible(layer, visible);
      updateRuntimePanel(documentRef, state);
    },
    onOpenGenerationPanel: () => {
      state.panels.generation.open();
    },
    onOpenHeightPanel: () => {
      state.panels.height.open(state.editHistory.getStats());
    },
    onOpenStatePanel: () => {
      if (state.selection?.object?.kind === "state") {
        state.panels.state.setTargetStateId(state.selection.object.id);
      }
      state.panels.state.open(state.map, state.editHistory.getStats());
    },
    onOpenProvincePanel: () => {
      if (state.selection?.object?.kind === "province") {
        state.panels.province.setSelectedProvinceId(state.selection.object.id);
      }
      state.panels.province.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenCityPanel: () => {
      if (state.selection?.object?.kind === "city") {
        state.panels.city.setSelectedCityId(state.selection.object.id);
      }
      state.panels.city.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenCulturePanel: () => {
      if (state.selection?.object?.kind === "culture") {
        state.panels.culture.setSelectedCultureId(state.selection.object.id);
      }
      state.panels.culture.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenReligionPanel: () => {
      if (state.selection?.object?.kind === "religion") {
        state.panels.religion.setSelectedReligionId(state.selection.object.id);
      }
      state.panels.religion.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenRiverPanel: () => {
      state.panels.river.open(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
    },
    onOpenRoutePanel: () => {
      if (state.selection?.object?.kind === "route") {
        state.panels.route.setSelectedRouteId(state.selection.object.id);
      }
      state.panels.route.open(state.map, state.selection);
    },
    onMode: mode => {
      renderer.setColorMode(mode);
      updateRuntimePanel(documentRef, state);
    }
  });

  window.__webglGeneratorApp = state;
  requestGenerate(state, documentRef);
  return state;
}

function applyControlPreferencesToRenderer(documentRef, renderer) {
  const preferences = readControlPreferences(documentRef);
  if (typeof preferences.colorMode === "string") renderer.setColorMode(preferences.colorMode);
  if (typeof preferences.showOceanHeight === "boolean") renderer.setViewOptions({showOceanHeight: preferences.showOceanHeight});
  if (typeof preferences.maxCityLabels === "number") renderer.setLabelOptions({maxCityLabels: preferences.maxCityLabels});
  for (const [layer, visible] of Object.entries(preferences.layers || {})) {
    renderer.setLayerVisible(layer, visible);
  }
}

function requestGenerate(state, documentRef) {
  try {
    if (documentRef.getElementById("auto-random-seed").checked) {
      setSeedInput(documentRef, createRandomSeed());
    }
    state.options = readOptionsFromPanel(documentRef, state.options);
    state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
    const generateId = state.pendingGenerateId;
    setGenerationStatus(documentRef, state.options, "等待生成任务");
    scheduleAfterPaint(documentRef, () => {
      if (generateId !== state.pendingGenerateId) return;
      runGenerateNow(state, documentRef, generateId);
    });
  } catch (error) {
    reportGenerateError(documentRef, error);
  }
}

function runGenerateNow(state, documentRef, generateId) {
  try {
    setGenerationStatus(documentRef, state.options, "生成中");
    const map = generatePlaceholderMap(state.options);
    if (generateId !== state.pendingGenerateId) return;
    state.map = map;
    state.pick = null;
    state.editHistory.clear();
    state.heightEdit.activeStroke = null;
    state.heightEdit.lastAffected = 0;
    state.heightEdit.lastHeight = "none";
    state.stateEdit.activeStroke = null;
    state.stateEdit.lastAffected = 0;
    state.stateEdit.sourceStateId = null;
    state.stateEdit.lastPointer = null;
    state.provinceEdit.activeStroke = null;
    state.provinceEdit.lastAffected = 0;
    state.provinceEdit.sourceProvinceId = null;
    state.provinceEdit.lastPointer = null;
    state.lastEditRefresh = null;
    state.renderer.loadMap(state.map);
    state.selectionStore.clear();
    updateHeightPanel(state);
    updateStatePanel(state);
    updateProvincePanel(state);
    updateCityPanel(state);
    updateCulturePanel(state);
    updateReligionPanel(state);
    state.panels.route.update(state.map, state.selection);
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    updatePickPanel(documentRef, state);
  } catch (error) {
    reportGenerateError(documentRef, error);
  }
}

function scheduleAfterPaint(documentRef, callback) {
  const view = documentRef.defaultView || window;
  let called = false;
  const run = () => {
    if (called) return;
    called = true;
    callback();
  };

  if (typeof view.scheduler?.postTask === "function") {
    view.scheduler.postTask(run, {priority: "user-visible"}).catch(() => {});
  }
  if (typeof view.MessageChannel === "function") {
    const channel = new view.MessageChannel();
    channel.port1.onmessage = run;
    channel.port2.postMessage(null);
  }
  view.setTimeout(run, 0);
  view.requestAnimationFrame(() => view.setTimeout(run, 0));
}

function setGenerationStatus(documentRef, options, status) {
  documentRef.getElementById("app-status").textContent = `${status}，seed ${options.seed}`;
  documentRef.getElementById("map-badge").textContent = `${status} / ${options.graphWidth} x ${options.graphHeight} / ${options.cellsTarget} cells`;
}

function reportGenerateError(documentRef, error) {
  const message = error instanceof Error ? error.message : String(error);
  documentRef.getElementById("app-status").textContent = `生成失败：${message}`;
  documentRef.getElementById("map-badge").textContent = "生成失败，查看 Console";
  console.error(error);
}

function locateObject(state, object, documentRef) {
  const located = object ? state.renderer.locateObject(object) : false;
  if (located) {
    state.selectionStore.setSelection({object});
  }
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}

function refreshAfterEdit(state, commandOrEffects) {
  state.editRefreshScheduler.run(commandOrEffects);
}

function refreshAfterStateEdit(state, commandOrEffects) {
  updateStatePickAtLastPointer(state);
  refreshAfterEdit(state, commandOrEffects);
  updateProvincePanel(state);
  updateCityPanel(state);
}

function refreshAfterProvinceEdit(state, commandOrEffects) {
  updateProvincePickAtLastPointer(state);
  refreshAfterEdit(state, commandOrEffects);
  updateProvincePanel(state);
  updateCityPanel(state);
}

function shouldOpenProvincePanelForSelection(state) {
  return Boolean(state.panels.province?.isOpen?.() || state.renderer?.getStats?.().colorMode === "provinces");
}

function shouldOpenCulturePanelForSelection(state) {
  return Boolean(state.panels.culture?.isOpen?.() || state.renderer?.getStats?.().colorMode === "cultures");
}

function shouldOpenReligionPanelForSelection(state) {
  return Boolean(state.panels.religion?.isOpen?.() || state.renderer?.getStats?.().colorMode === "religions");
}

function bindHeightEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.panels.height?.getBrush().active || !state.map) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.heightEdit.activeStroke = {
      pointerId: event.pointerId,
      originals: new Map()
    };
    capturePointer(canvas, event.pointerId);
    applyHeightBrushAtEvent(state, event, documentRef);
  }, true);

  canvas.addEventListener("pointermove", event => {
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyHeightBrushAtEvent(state, event, documentRef);
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishHeightStroke(state);
    releasePointer(canvas, event.pointerId);
    updateHeightPanel(state);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishHeightStroke(state);
    releasePointer(canvas, event.pointerId);
    updateHeightPanel(state);
  }, true);
}

function bindStateEditing(canvas, state) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.panels.state?.getBrush().active || !state.map) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const sourceStateId = getStateIdAtEvent(state, event);
    state.stateEdit.activeStroke = {
      pointerId: event.pointerId,
      originals: new Map(),
      sourceStateId
    };
    state.stateEdit.lastPointer = {clientX: event.clientX, clientY: event.clientY};
    state.stateEdit.sourceStateId = sourceStateId;
    capturePointer(canvas, event.pointerId);
    applyStateBrushAtEvent(state, event);
  }, true);

  canvas.addEventListener("pointermove", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyStateBrushAtEvent(state, event);
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishStateStroke(state);
    releasePointer(canvas, event.pointerId);
    updateStatePanel(state);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishStateStroke(state);
    releasePointer(canvas, event.pointerId);
    updateStatePanel(state);
  }, true);
}

function bindProvinceEditing(canvas, state) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.panels.province?.getBrush().active || !state.map) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const sourceProvinceId = getProvinceIdAtEvent(state, event);
    state.provinceEdit.activeStroke = {
      pointerId: event.pointerId,
      originals: new Map(),
      sourceProvinceId
    };
    state.provinceEdit.lastPointer = {clientX: event.clientX, clientY: event.clientY};
    state.provinceEdit.sourceProvinceId = sourceProvinceId;
    capturePointer(canvas, event.pointerId);
    applyProvinceBrushAtEvent(state, event);
  }, true);

  canvas.addEventListener("pointermove", event => {
    if (!state.provinceEdit.activeStroke || state.provinceEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyProvinceBrushAtEvent(state, event);
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (!state.provinceEdit.activeStroke || state.provinceEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishProvinceStroke(state);
    releasePointer(canvas, event.pointerId);
    updateProvincePanel(state);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.provinceEdit.activeStroke || state.provinceEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishProvinceStroke(state);
    releasePointer(canvas, event.pointerId);
    updateProvincePanel(state);
  }, true);
}

function bindEditingInteractionLock(canvas, state) {
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"]) {
    canvas.addEventListener(eventName, event => {
      if (!isEditingInteractionLocked(state)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
}

function applyHeightBrushAtEvent(state, event) {
  const brush = state.panels.height.getBrush();
  const stroke = state.heightEdit.activeStroke;
  if (!brush.active || !stroke) return;

  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getHeightBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;

  applyHeightBrushPreview(state.map, changes);
  state.heightEdit.lastAffected = changes.length;
  state.heightEdit.lastHeight = summarizeChangedHeights(changes);
  state.editRefreshScheduler.run(EDIT_REFRESH_PRESETS.HEIGHT_BRUSH_PREVIEW);
  updateHeightPanel(state);
}

function applyStateBrushAtEvent(state, event) {
  const brush = state.panels.state.getBrush();
  const stroke = state.stateEdit.activeStroke;
  if (!brush.active || !stroke || brush.targetStateId <= 0) return;

  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  state.stateEdit.lastPointer = {clientX: event.clientX, clientY: event.clientY};
  const changes = getStateBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;

  applyStateBrushPreview(state.map, changes);
  state.stateEdit.lastAffected = changes.length;
  state.stateEdit.sourceStateId = stroke.sourceStateId;
  state.editRefreshScheduler.run(STATE_BRUSH_PREVIEW_EFFECTS);
  updateStatePanel(state);
}

function applyProvinceBrushAtEvent(state, event) {
  const brush = state.panels.province.getBrush();
  const stroke = state.provinceEdit.activeStroke;
  if (!brush.active || !stroke || brush.targetProvinceId <= 0) return;

  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  state.provinceEdit.lastPointer = {clientX: event.clientX, clientY: event.clientY};
  const changes = getProvinceBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;

  applyProvinceBrushPreview(state.map, changes);
  state.provinceEdit.lastAffected = changes.length;
  state.provinceEdit.sourceProvinceId = stroke.sourceProvinceId;
  state.editRefreshScheduler.run(PROVINCE_BRUSH_PREVIEW_EFFECTS);
  updateProvincePanel(state);
}

function finishHeightStroke(state) {
  const stroke = state.heightEdit.activeStroke;
  state.heightEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;

  const changes = [];
  for (const [gridCell, before] of stroke.originals.entries()) {
    const after = state.map.grid.cells.h[gridCell];
    if (before !== after) changes.push({gridCell, before, after});
  }
  const command = createApplyHeightBrushCommand(changes);
  if (command.isNoop({map: state.map})) return;
  state.heightEdit.lastAffected = changes.length;
  state.heightEdit.lastHeight = summarizeChangedHeights(changes);
  refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
}

function finishStateStroke(state) {
  const stroke = state.stateEdit.activeStroke;
  state.stateEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;

  const changes = [];
  for (const [gridCell, before] of stroke.originals.entries()) {
    const after = state.map.grid.cells.state[gridCell];
    if (before !== after) changes.push({gridCell, before, after});
  }
  const command = createApplyStateBrushCommand(changes);
  if (command.isNoop({map: state.map})) return;
  state.stateEdit.lastAffected = changes.length;
  state.stateEdit.sourceStateId = stroke.sourceStateId;
  refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
}

function finishProvinceStroke(state) {
  const stroke = state.provinceEdit.activeStroke;
  state.provinceEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;

  const changes = [];
  for (const [gridCell, before] of stroke.originals.entries()) {
    const after = state.map.grid.cells.province[gridCell];
    if (before !== after) changes.push({gridCell, before, after});
  }
  const command = createApplyProvinceBrushCommand(changes);
  if (command.isNoop({map: state.map})) return;
  state.provinceEdit.lastAffected = changes.length;
  state.provinceEdit.sourceProvinceId = stroke.sourceProvinceId;
  refreshAfterProvinceEdit(state, state.editHistory.execute(command, {map: state.map}));
}

function getHeightBrushChanges(map, point, brush, originals) {
  const radiusSq = brush.radius * brush.radius;
  const affected = [];
  const cells = map.grid.cells;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const cellPoint = map.grid.points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    const distance = Math.sqrt(distanceSq);
    const factor = brush.falloff && brush.action !== "smooth" ? brushFalloff(distance, brush.radius) : 1;
    affected.push({gridCell, factor});
  }

  if (!affected.length) return [];
  if (brush.action === "smooth") {
    const average = affected.reduce((sum, item) => sum + cells.h[item.gridCell], 0) / affected.length;
    return affected.map(({gridCell}) => heightChange(cells, originals, gridCell, cells.h[gridCell] * 0.62 + average * 0.38));
  }

  const delta = brush.action === "lower" ? -brush.strength : brush.strength;
  return affected.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + delta * factor));
}

function getStateBrushChanges(map, point, brush, originals) {
  const radiusSq = brush.radius * brush.radius;
  const affected = [];
  const cells = map.grid.cells;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    if (!isGridLandCell(map, gridCell)) continue;
    const cellPoint = map.grid.points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    if (dx * dx + dy * dy > radiusSq) continue;
    if (cells.state[gridCell] === brush.targetStateId) continue;
    affected.push(stateChange(cells, originals, gridCell, brush.targetStateId));
  }

  return affected;
}

function getProvinceBrushChanges(map, point, brush, originals) {
  const radiusSq = brush.radius * brush.radius;
  const affected = [];
  const cells = map.grid.cells;
  const targetStateId = getProvinceStateId(map, brush.targetProvinceId);
  if (!targetStateId) return affected;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    if (!isGridLandCell(map, gridCell)) continue;
    if (cells.state[gridCell] !== targetStateId) continue;
    const cellPoint = map.grid.points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    if (dx * dx + dy * dy > radiusSq) continue;
    if (cells.province[gridCell] === brush.targetProvinceId) continue;
    affected.push(provinceChange(cells, originals, gridCell, brush.targetProvinceId));
  }

  return affected;
}

function heightChange(cells, originals, gridCell, nextValue) {
  if (!originals.has(gridCell)) originals.set(gridCell, cells.h[gridCell]);
  return {
    gridCell,
    before: originals.get(gridCell),
    after: clampHeight(nextValue)
  };
}

function stateChange(cells, originals, gridCell, nextValue) {
  if (!originals.has(gridCell)) originals.set(gridCell, cells.state[gridCell] || 0);
  return {
    gridCell,
    before: originals.get(gridCell),
    after: nextValue
  };
}

function provinceChange(cells, originals, gridCell, nextValue) {
  if (!originals.has(gridCell)) originals.set(gridCell, cells.province[gridCell] || 0);
  return {
    gridCell,
    before: originals.get(gridCell),
    after: nextValue
  };
}

function updateHeightPanel(state) {
  state.panels.height?.update({
    lastAffected: state.heightEdit.lastAffected,
    lastHeight: state.heightEdit.lastHeight,
    history: state.editHistory.getStats()
  });
}

function updateStatePanel(state) {
  state.panels.state?.update({
    map: state.map,
    lastAffected: state.stateEdit.lastAffected,
    sourceStateId: state.stateEdit.sourceStateId,
    history: state.editHistory.getStats()
  });
}

function updateProvincePanel(state) {
  state.panels.province?.update(state.map, state.selection, state.editHistory.getStats(), {
    lastAffected: state.provinceEdit.lastAffected,
    sourceProvinceId: state.provinceEdit.sourceProvinceId
  });
}

function updateCityPanel(state) {
  state.panels.city?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateCulturePanel(state) {
  state.panels.culture?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateReligionPanel(state) {
  state.panels.religion?.update(state.map, state.selection, state.editHistory.getStats());
}

function setStatePanelTarget(state, stateId) {
  if (!Number.isInteger(stateId) || stateId <= 0) return;
  state.panels.state?.setTargetStateId(stateId);
  updateStatePanel(state);
}

function getStateIdFromSelection(state) {
  const object = state.selection?.object;
  if (object?.kind === "state") return object.id;
  if (Number.isInteger(object?.stateId)) return object.stateId;
  return null;
}

function getStateIdFromPick(state) {
  if (Number.isInteger(state.pick?.gridCell)) return state.map.grid.cells.state[state.pick.gridCell] || null;
  if (state.pick?.politicalObject?.kind === "state") return state.pick.politicalObject.id;
  return null;
}

function getStateIdAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  if (Number.isInteger(pick?.gridCell) && pick.gridCell >= 0) {
    return state.map.grid.cells.state[pick.gridCell] || null;
  }
  return null;
}

function setProvincePanelTarget(state, provinceId) {
  if (!Number.isInteger(provinceId) || provinceId <= 0) return;
  state.panels.province?.setSelectedProvinceId(provinceId);
  updateProvincePanel(state);
}

function getProvinceIdFromSelection(state) {
  const object = state.selection?.object;
  if (object?.kind === "province") return object.id;
  if (Number.isInteger(object?.provinceId)) return object.provinceId;
  if (object?.kind === "city") return state.map?.settlements?.cities?.[object.id]?.province || null;
  return null;
}

function getProvinceIdFromPick(state) {
  if (Number.isInteger(state.pick?.gridCell)) return state.map.grid.cells.province[state.pick.gridCell] || null;
  if (state.pick?.politicalObject?.kind === "province") return state.pick.politicalObject.id;
  return null;
}

function getProvinceIdAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  if (Number.isInteger(pick?.gridCell) && pick.gridCell >= 0) {
    return state.map.grid.cells.province[pick.gridCell] || null;
  }
  return null;
}

function updateProvincePickAtLastPointer(state) {
  const pointer = state.provinceEdit.lastPointer;
  if (!pointer) return;
  state.pick = state.renderer.pickClientPoint(pointer.clientX, pointer.clientY);
}

function updateStatePickAtLastPointer(state) {
  const pointer = state.stateEdit.lastPointer;
  if (!pointer) return;
  state.pick = state.renderer.pickClientPoint(pointer.clientX, pointer.clientY);
}

function updateEditingInteractionLock(state, documentRef) {
  const interactionLocked = isEditingInteractionLocked(state);
  const allowedPanelIds = getAllowedEditingPanelIds(state);
  setEditingInteractionLock(documentRef, interactionLocked, {allowedPanelIds});
  syncEditorStateSnapshot(buildEditorStateSnapshot(state, interactionLocked, allowedPanelIds));
}

function isEditingInteractionLocked(state) {
  return Boolean(state.panels.height?.getBrush().active || state.panels.state?.getBrush().active || state.panels.province?.getBrush().active || state.editingObject);
}

function getAllowedEditingPanelIds(state) {
  if (state.panels.height?.getBrush().active) return ["height-panel"];
  if (state.panels.state?.getBrush().active) return ["state-panel"];
  if (state.panels.province?.getBrush().active) return ["province-panel"];
  if (state.editingObject?.kind === "river") return ["river-panel"];
  if (state.editingObject) return ["object-details"];
  return [];
}

function buildEditorStateSnapshot(state, interactionLocked, allowedPanelIds) {
  const heightBrush = state.panels.height?.getBrush?.() || {};
  const stateBrush = state.panels.state?.getBrush?.() || {};
  const provinceBrush = state.panels.province?.getBrush?.() || {};
  return {
    activeEditor: getActiveEditorKind(state, heightBrush, stateBrush, provinceBrush),
    interactionLocked,
    allowedPanelIds,
    editingObject: state.editingObject ? {...state.editingObject} : null,
    height: {
      active: Boolean(heightBrush.active),
      lastAffected: state.heightEdit.lastAffected,
      lastHeight: state.heightEdit.lastHeight
    },
    stateBrush: {
      active: Boolean(stateBrush.active),
      targetStateId: stateBrush.targetStateId ?? null,
      lastAffected: state.stateEdit.lastAffected,
      sourceStateId: state.stateEdit.sourceStateId
    },
    provinceBrush: {
      active: Boolean(provinceBrush.active),
      targetProvinceId: provinceBrush.targetProvinceId ?? null,
      lastAffected: state.provinceEdit.lastAffected,
      sourceProvinceId: state.provinceEdit.sourceProvinceId
    },
    history: state.editHistory.getStats(),
    lastEditRefresh: state.lastEditRefresh
  };
}

function getActiveEditorKind(state, heightBrush, stateBrush, provinceBrush) {
  if (heightBrush.active) return "height";
  if (stateBrush.active) return "state";
  if (provinceBrush.active) return "province";
  if (state.editingObject?.kind) return state.editingObject.kind;
  return null;
}

function getProvinceStateId(map, provinceId) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  return province?.state || 0;
}

function isGridLandCell(map, gridCell) {
  if (map.grid.cells.h?.[gridCell] < 20) return false;
  const featureId = map.grid.cells.f?.[gridCell];
  const feature = map.features.features?.[featureId];
  return feature ? Boolean(feature.land) : true;
}

function summarizeChangedHeights(changes) {
  if (!changes.length) return "none";
  const values = changes.map(change => change.after);
  return `${Math.min(...values)}..${Math.max(...values)}`;
}

function brushFalloff(distance, radius) {
  const t = Math.max(0, Math.min(1, 1 - distance / Math.max(1, radius)));
  return t * t * (3 - 2 * t);
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and some browser paths may not allow capture.
  }
}

function releasePointer(element, pointerId) {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already be gone after cancel/up.
  }
}
