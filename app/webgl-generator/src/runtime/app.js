import {defineBiomesAndPopulation} from "../generator/biomes.js";
import {buildClimate} from "../generator/climate.js";
import {createGenerationSummary, generatePlaceholderMap} from "../generator/index.js";
import {clearUserNamebases, copyBuiltinNamebaseToUser, createNamebaseDocument, createUserNamebase, deleteUserNamebase, importNamebaseDocument, parseNamebaseDocument, renameUserNamebase, updateUserNamebaseSource} from "../generator/namebase-store.js";
import {buildRivers, renameHydronymsByCulture} from "../generator/rivers.js";
import {regeneratePackProvincesWithinStates, regeneratePackStatesAndProvinces} from "../generator/politics.js";
import {finalizeSettlements, regenerateSettlementsWithinPolitics} from "../generator/settlements.js";
import {DEFAULT_OPTIONS, normalizeOptions} from "../generator/options.js";
import {createRandom, createRandomSeed} from "../generator/random.js";
import {PlaceholderMapRenderer} from "../renderer/placeholder-renderer.js";
import {PanelManager} from "../ui/panel-manager.js";
import {bindRuntimePanel, readControlPreferences, readOptionsFromPanel, setActiveModeButton, setEditingInteractionLock, setGenerationLoading, setSeedInput, updatePickPanel, updateRegenerationSection, updateRuntimePanel} from "../ui/panel.js";
import {formatArea as formatDisplayArea, formatDistance as formatDisplayDistance, normalizeUnitPreferences} from "../ui/display-units.js";
import {createCityPanel} from "../ui/panels/city-panel.js";
import {createCulturePanel} from "../ui/panels/culture-panel.js";
import {createDevelopmentPanel} from "../ui/panels/development-panel.js";
import {createDiplomacyPanel} from "../ui/panels/diplomacy-panel.js";
import {createGenerationPanel} from "../ui/panels/generation-panel.js";
import {createHeightPanel} from "../ui/panels/height-panel.js";
import {createLabelNamingPanel} from "../ui/panels/label-naming-panel.js";
import {createMarkerPanel} from "../ui/panels/marker-panel.js";
import {createMilitaryPanel} from "../ui/panels/military-panel.js";
import {createNamebasePanel} from "../ui/panels/namebase-panel.js";
import {createNotesPanel} from "../ui/panels/notes-panel.js";
import {createObjectDetailsPanel} from "../ui/panels/object-details-panel.js";
import {createProvincePanel} from "../ui/panels/province-panel.js";
import {createReligionPanel} from "../ui/panels/religion-panel.js";
import {createRiverPanel} from "../ui/panels/river-panel.js";
import {createRoutePanel} from "../ui/panels/route-panel.js";
import {createStatePanel} from "../ui/panels/state-panel.js";
import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {createEditRefreshScheduler} from "./edit-refresh-scheduler.js";
import {EditHistory} from "./edit-history.js";
import {createGrayscaleHeightmapFromImage, readHeightmapImportSettings} from "./heightmap-import.js";
import {createMapDocument, createMapFeatureGeoJson, createMapGeoJson, downloadCanvasPng, downloadText, mapFileBaseName, parseMapDocument, stringifyMapDocument} from "./map-file-io.js";
import {createResetCityVisualCommand, createSetCityNoteCommand, createSetCityPopulationCommand, createSetCityVisualCommand, createSyncCityOwnerToCellCommand} from "./city-edit-commands.js";
import {createSetCultureColorCommand, createSetCultureParentCommand} from "./culture-edit-commands.js";
import {createRegenerateDiplomacyCommand, createSetDiplomacyRelationCommand} from "./diplomacy-edit-commands.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "./height-edit-commands.js";
import {createAddCustomLabelCommand, createDeleteLabelCommand, createRenameCustomLabelCommand, createRestoreGeneratedLabelCommand, createSetLabelNoteCommand, ensureLabelStore} from "./label-edit-commands.js";
import {createAddMarkerCommand, createDeleteMarkerCommand, createMoveMarkerCommand, createRegenerateResourceMarkersCommand, createSetMarkerNoteCommand, createSetMarkerVisualCommand} from "./marker-edit-commands.js";
import {createSetMilitaryRatiosCommand} from "./military-edit-commands.js";
import {createDeleteNoteCommand} from "./note-edit-commands.js";
import {createRenameObjectCommand, createSetObjectNoteCommand, createSetProvinceColorCommand, createSetStateCapitalCommand} from "./object-edit-commands.js";
import {applyProvinceBrushPreview, createApplyProvinceBrushCommand, PROVINCE_BRUSH_PREVIEW_EFFECTS} from "./province-edit-commands.js";
import {createSetReligionColorCommand, createSetReligionParentCommand} from "./religion-edit-commands.js";
import {resolveObject} from "./object-resolver.js";
import {createSetRiverNoteCommand, createSetRiverWidthFactorCommand} from "./river-edit-commands.js";
import {createSetRouteNoteCommand} from "./route-edit-commands.js";
import {SelectionStore} from "./selection-store.js";
import {applyStateBrushPreview, createApplyStateBrushCommand, createSetStateColorCommand, STATE_BRUSH_PREVIEW_EFFECTS} from "./state-edit-commands.js";
import {syncEditorStateSnapshot} from "../ui/vue/state-bridge.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";
import GenerationWorker from "./generation-worker.js?worker";
import {getWebglGeneratorHealthMonitor} from "./health-monitor.js";

const LOADING_MESSAGES = Object.freeze({
  request: "星图启明",
  generate: "山海初开",
  "map-import-read": "启封舆图",
  "map-import-render": "山河归卷",
  "heightmap-read": "墨影探山",
  "heightmap-generate": "借影塑岳",
  "heightmap-render": "重理水陆",
  "panel-refresh": "诸域归册",
  "normalize-options": "校准天机",
  "random-grid": "分拨星种",
  "random-main": "点燃灵机",
  heightmap: "群山起脉",
  grid: "山海初开",
  features: "水陆分判",
  "random-climate": "候风听令",
  climate: "羲和布候",
  pack: "九州成图",
  rivers: "大禹治水",
  "biomes-population": "万物择居",
  "society-cultures": "百族生烟",
  "river-names": "洛书题水",
  "settlements-initial": "城郭初立",
  politics: "诸侯封疆",
  "settlements-finalize": "车马连城",
  markers: "灵藏点星",
  economy: "市井开张",
  "religions-finalize": "神祠归位",
  diplomacy: "纵横定盟",
  military: "六军列阵",
  zones: "秘境入册",
  palette: "丹青设色",
  summary: "太史校图",
  metadata: "封存星卷",
  "object-picking-index": "司南定物",
  "cell-visual-mesh": "灵纹铺地",
  "shore-cache": "沧海描岸",
  "state-boundaries": "列国划疆",
  "province-boundaries": "郡县分野",
  "political-meshes": "诸侯着色",
  "surface-vertices": "山川上卷",
  "line-vertices": "川道刻线",
  "route-screen-mesh": "车马入途",
  "river-screen-mesh": "百川归脉",
  "point-vertices": "星标入图",
  "gpu-upload": "星火入阵",
  labels: "题名山河",
  "overlay-draw": "题名山河",
  "fit-draw": "展开乾坤"
});

const LOAD_TRACE_EVENT_NAME = "webgl-generator-load-stage";
const LOAD_TRACE_DELAY_PARAMS = Object.freeze(["loadStepDelay", "debugLoadDelay", "loadTraceDelay"]);
const MAX_DEBUG_LOAD_DELAY_MS = 2000;

export function createGeneratorApp(documentRef, {healthMonitor = getWebglGeneratorHealthMonitor(documentRef)} = {}) {
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
    markerEdit: {
      mode: null,
      type: "mines",
      markerId: null,
      lastPackCell: null
    },
    measurement: {
      active: false,
      points: [],
      pointer: null,
      drag: null
    },
    lastEditRefresh: null,
    selectionStore: null,
    renderer: null,
    pendingGenerateId: 0,
    heightmapImportId: 0,
    healthMonitor,
    panels: {}
  };
  let selectionStore = null;
  const generationPanel = createGenerationPanel(documentRef, panelManager);
  state.panels.generation = generationPanel;
  state.panels.development = createDevelopmentPanel(documentRef, panelManager);
  let heightPanel = null;
  let statePanel = null;
  let provincePanel = null;
  let cityPanel = null;
  let culturePanel = null;
  let religionPanel = null;
  let diplomacyPanel = null;
  let militaryPanel = null;
  let riverPanel = null;
  let routePanel = null;
  let markerPanel = null;
  let labelNamingPanel = null;
  let namebasePanel = null;
  let notesPanel = null;
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
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
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
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
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
    onNoteChange: (stateId, body) => {
      const stateItem = state.map?.politics?.states?.[stateId];
      const object = {kind: OBJECT_KIND.STATE, id: stateId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: stateItem?.fullName || stateItem?.name || `国家 #${stateId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
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
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
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
    onNoteChange: (provinceId, body) => {
      const province = state.map?.politics?.provinces?.[provinceId] || state.map?.pack?.provinces?.[provinceId];
      const object = {kind: OBJECT_KIND.PROVINCE, id: provinceId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: province?.fullName || province?.name || `省份 #${provinceId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateProvincePanel(state);
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
    onVisualChange: (cityId, patch) => {
      const context = {map: state.map};
      const command = createSetCityVisualCommand(cityId, patch);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onVisualReset: cityId => {
      const context = {map: state.map};
      const command = createResetCityVisualCommand(cityId);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (cityId, body) => {
      const city = state.map?.settlements?.cities?.[cityId];
      const context = {map: state.map};
      const command = createSetCityNoteCommand(cityId, body, {name: city?.name || `城市 #${cityId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
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
    onParentChange: (cultureId, parentId) => {
      const culture = state.map?.society?.cultures?.[cultureId] || state.map?.pack?.cultures?.[cultureId];
      const command = createSetCultureParentCommand(cultureId, parentId, {beforeParent: culture?.parent ?? 0});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateCulturePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (cultureId, body) => {
      const culture = state.map?.society?.cultures?.[cultureId] || state.map?.pack?.cultures?.[cultureId];
      const object = {kind: OBJECT_KIND.CULTURE, id: cultureId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: culture?.name || `文化 #${cultureId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
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
    onParentChange: (religionId, parentId) => {
      const religion = state.map?.society?.religions?.[religionId] || state.map?.pack?.religions?.[religionId];
      const command = createSetReligionParentCommand(religionId, parentId, {beforeParent: religion?.parent ?? 0});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateReligionPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (religionId, body) => {
      const religion = state.map?.society?.religions?.[religionId] || state.map?.pack?.religions?.[religionId];
      const object = {kind: OBJECT_KIND.RELIGION, id: religionId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: religion?.name || `宗教 #${religionId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
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
  diplomacyPanel = createDiplomacyPanel(documentRef, panelManager, {
    onSubjectChange: stateId => {
      if (state.renderer.getStats().colorMode === "diplomacy") {
        setDiplomacyThemeSubject(state, documentRef, stateId);
      }
    },
    onSelect: object => {
      selectionStore.setSelection({object});
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onRelationChange: (subjectId, objectId, relation) => {
      const command = createSetDiplomacyRelationCommand(subjectId, objectId, relation);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        refreshGenerationSummary(state.map);
      }
      updateDiplomacyPanel(state);
      updateStatePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRegenerate: () => {
      if (!state.map) return;
      const salt = nextRegenerationSalt(state.map, "diplomacy");
      const command = createRegenerateDiplomacyCommand({salt});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["diplomacy"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `regenerate diplomacy: salt=${salt}, pairs=${state.map.diplomacy?.metadata?.pairs || 0}, enemies=${state.map.diplomacy?.metadata?.enemies || 0}`);
      }
      updateDiplomacyPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onShowTheme: stateId => {
      setDiplomacyThemeSubject(state, documentRef, stateId);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) {
        refreshAfterEdit(state, command);
        refreshGenerationSummary(state.map);
      }
      updateDiplomacyPanel(state);
      updateStatePanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) {
        refreshAfterEdit(state, command);
        refreshGenerationSummary(state.map);
      }
      updateDiplomacyPanel(state);
      updateStatePanel(state);
    }
  });
  state.panels.diplomacy = diplomacyPanel;
  militaryPanel = createMilitaryPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      militaryPanel.setSelectedRegimentId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      militaryPanel.setSelectedRegimentId(object.id);
    },
    onRatiosApply: (stateId, ratios) => {
      const command = createSetMilitaryRatiosCommand(stateId, ratios);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `update military ratios: state=${stateId}, regiments=${state.map.military?.metadata?.regiments || 0}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) {
        refreshAfterEdit(state, command);
        refreshGenerationSummary(state.map);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) {
        refreshAfterEdit(state, command);
        refreshGenerationSummary(state.map);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
    }
  });
  state.panels.military = militaryPanel;
  routePanel = createRoutePanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      routePanel.setSelectedRouteId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      routePanel.setSelectedRouteId(object.id);
    },
    onNoteChange: (routeId, body) => {
      const route = state.map?.settlements?.routes?.find(item => item.id === routeId);
      const context = {map: state.map};
      const command = createSetRouteNoteCommand(routeId, body, {name: routeDisplayName(state.map, route, routeId)});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
    }
  });
  state.panels.route = routePanel;
  markerPanel = createMarkerPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      markerPanel.setSelectedMarkerId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      markerPanel.setSelectedMarkerId(object.id);
    },
    onRename: (markerId, name) => {
      const object = {kind: OBJECT_KIND.MARKER, id: markerId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateMarkerPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onVisualChange: (markerId, patch) => {
      const context = {map: state.map};
      const command = createSetMarkerVisualCommand(markerId, patch);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateMarkerPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (markerId, body) => {
      const marker = state.map?.markers?.markers?.[markerId];
      const context = {map: state.map};
      const command = createSetMarkerNoteCommand(markerId, body, {name: marker?.name || marker?.label || `标记 #${markerId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateMarkerPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onAddResourceMode: type => {
      startMarkerEditMode(state, documentRef, {mode: "add", type: type || "mines", markerId: null});
    },
    onMoveMode: markerId => {
      const marker = state.map?.markers?.markers?.[markerId];
      if (!marker) return;
      selectionStore.setSelection({object: {kind: OBJECT_KIND.MARKER, id: markerId}});
      startMarkerEditMode(state, documentRef, {mode: "move", type: marker.type, markerId});
    },
    onDelete: markerId => {
      const command = createDeleteMarkerCommand(markerId);
      applyMarkerCollectionCommand(state, documentRef, command);
      if (state.markerEdit.markerId === markerId) stopMarkerEditMode(state, documentRef);
    },
    onRegenerateResources: () => {
      if (!state.map) return;
      const salt = nextRegenerationSalt(state.map, "markers");
      const command = createRegenerateResourceMarkersCommand({salt});
      const executed = applyMarkerCollectionCommand(state, documentRef, command);
      if (!executed) return;
      stopMarkerEditMode(state, documentRef);
      appendGenerationLog(state.map, `regenerate resources: salt=${salt}, resources=${state.map.markers.metadata.resourceMarkers}, resourcePotential=${state.map.markers.metadata.resourcePotential}, markerResourceDeals=${state.map.economy?.metadata?.resourceTrade?.markerResourceDeals || 0}`);
    },
    onCancelEdit: () => {
      stopMarkerEditMode(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateMarkerPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateMarkerPanel(state);
    }
  });
  state.panels.marker = markerPanel;
  labelNamingPanel = createLabelNamingPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
      labelNamingPanel.setSelectedLabelKey(labelKeyForObject(object));
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      labelNamingPanel.setSelectedLabelKey(labelKeyForObject(object));
    },
    onRename: (object, name) => {
      const context = {map: state.map};
      const command = object.targetKind === LABEL_TARGET_KIND.CUSTOM ? createRenameCustomLabelCommand(object.targetId ?? object.id, name) : createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateLabelNamingPanel(state);
      updateStatePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (object, body) => {
      const context = {map: state.map};
      const command = createSetLabelNoteCommand(object, body, {name: object.targetName || object.text || `标签 #${object.targetId ?? object.id}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateLabelNamingPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onAdd: () => {
      const point = getNewLabelPoint(state);
      const context = {map: state.map};
      const command = createAddCustomLabelCommand({text: "新标签", x: point.x, y: point.y});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      const created = command.getCreatedLabel?.();
      if (created) {
        const object = {kind: OBJECT_KIND.LABEL, id: created.id, targetKind: LABEL_TARGET_KIND.CUSTOM, targetId: created.id, text: created.text, targetName: created.text};
        selectionStore.setSelection({object});
        labelNamingPanel.setSelectedLabelKey(labelKeyForObject(object));
      }
      updateLabelNamingPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onDelete: object => {
      const context = {map: state.map};
      const command = createDeleteLabelCommand(object);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateLabelNamingPanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRestore: object => {
      const context = {map: state.map};
      const command = createRestoreGeneratedLabelCommand(object);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateLabelNamingPanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateLabelNamingPanel(state);
      updateStatePanel(state);
      updateCityPanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateLabelNamingPanel(state);
      updateStatePanel(state);
      updateCityPanel(state);
    }
  });
  state.panels.labelNaming = labelNamingPanel;
  namebasePanel = createNamebasePanel(documentRef, panelManager, {
    onExport: () => exportNamebases(state, documentRef),
    onImport: (file, mode) => importNamebases(state, documentRef, file, mode),
    onCreateUser: () => createManualNamebase(state, documentRef),
    onCopyBuiltin: row => copyBuiltinNamebase(state, documentRef, row),
    onRenameUser: (row, name) => renameImportedNamebase(state, documentRef, row, name),
    onUpdateSource: (row, sourceText) => updateImportedNamebaseSource(state, documentRef, row, sourceText),
    onDeleteUser: row => deleteImportedNamebase(state, documentRef, row),
    onClearUser: () => clearImportedNamebases(state, documentRef)
  });
  state.panels.namebase = namebasePanel;
  notesPanel = createNotesPanel(documentRef, panelManager, {
    onSelect: row => {
      if (!row?.object || row.orphan) return;
      selectionStore.setSelection({object: row.object});
      notesPanel.setSelectedNoteId(row.id);
    },
    onLocate: row => {
      if (!row?.object || row.orphan) return;
      locateObject(state, row.object, documentRef);
      notesPanel.setSelectedNoteId(row.id);
    },
    onDelete: row => {
      if (!row?.id) return;
      const command = createDeleteNoteCommand(row.id, {name: row.name});
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      }
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onExport: rows => exportNotesSummary(state, documentRef, rows),
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateAllObjectPanels(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateAllObjectPanels(state);
    }
  });
  state.panels.notes = notesPanel;
  riverPanel = createRiverPanel(documentRef, panelManager, {
    onSelect: object => {
      selectionStore.setSelection({object});
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      if (state.editingObject?.kind === OBJECT_KIND.RIVER && state.editingObject.id === object.id) {
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
      if (state.editingObject?.kind === OBJECT_KIND.RIVER) {
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
    onNoteChange: (riverId, body) => {
      const river = state.map?.rivers?.rivers?.find(item => item.id === riverId);
      const context = {map: state.map};
      const command = createSetRiverNoteCommand(riverId, body, {name: river?.name || `河流 #${riverId}`});
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
      updateEditingInteractionLock(state, documentRef);
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
    if (state.map) {
      updateRuntimePanel(documentRef, state);
      updateMeasurementOverlay(state, documentRef);
    }
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
    const handled = handleSelectionPanel(state, selection, editingObject, {
      documentRef,
      suppressNextRiverPanelOpen,
      clearRiverSuppressor: () => {
        suppressNextRiverPanelOpen = false;
      }
    });
    if (!handled) {
      state.panels.objectDetails.show(selection, editingObject);
    }
    state.panels.river.update(state.map, selection, state.editHistory.getStats(), editingObject);
    state.panels.route.update(state.map, selection, state.editHistory.getStats());
    state.panels.marker.update(state.map, selection, state.editHistory.getStats());
    state.panels.labelNaming.update(state.map, selection, state.editHistory.getStats());
    state.panels.notes.update(state.map, selection, state.editHistory.getStats());
    updateStatePanel(state);
    updateProvincePanel(state);
    updateCityPanel(state);
    updateCulturePanel(state);
    updateReligionPanel(state);
    updateDiplomacyPanel(state);
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    updatePickPanel(documentRef, state);
  }, object => resolveObject(state.map, object));
  state.selectionStore = selectionStore;
  state.editRefreshScheduler = createEditRefreshScheduler({state, documentRef, updateRuntimePanel, updatePickPanel});
  applyControlPreferencesToRenderer(documentRef, renderer);
  bindMeasurementTool(canvas, state, documentRef);
  bindHeightEditing(canvas, state, documentRef);
  bindStateEditing(canvas, state, documentRef);
  bindProvinceEditing(canvas, state, documentRef);
  bindMarkerEditing(canvas, state, documentRef);
  bindEditingInteractionLock(canvas, state);

  bindRuntimePanel(documentRef, {
    onGenerate: () => requestGenerate(state, documentRef),
    onRandomSeed: () => {
      setSeedInput(documentRef, createRandomSeed());
      requestGenerate(state, documentRef);
    },
    onFitView: () => {
      measureHealthOperation(state, "fit-view", {}, () => {
        renderer.fitToView();
        updateRuntimePanel(documentRef, state);
        updateMeasurementOverlay(state, documentRef);
      });
    },
    onShowOceanHeight: showOceanHeight => {
      measureHealthOperation(state, "set-ocean-height-visibility", {showOceanHeight}, () => {
        renderer.setViewOptions({showOceanHeight});
        updateRuntimePanel(documentRef, state);
      });
    },
    onSmoothCellBorders: smoothCellBorders => {
      measureHealthOperation(state, "set-smooth-cell-borders", {smoothCellBorders}, () => {
        renderer.setViewOptions({smoothCellBorders});
        updateRuntimePanel(documentRef, state);
      });
    },
    onShowHoverInfo: () => {
      updatePickPanel(documentRef, state);
    },
    onMaxCityLabels: maxCityLabels => {
      measureHealthOperation(state, "set-max-city-labels", {maxCityLabels}, () => {
        renderer.setLabelOptions({maxCityLabels});
        updateRuntimePanel(documentRef, state);
      });
    },
    onUnitPreferences: () => {
      updateRuntimePanel(documentRef, state);
      updatePickPanel(documentRef, state);
      updateMeasurementOverlay(state, documentRef);
    },
    onClimateControls: () => {
      measureHealthOperation(state, "apply-climate-controls", {}, () => applyClimateControls(state, documentRef));
    },
    onLayerVisible: (layer, visible) => {
      measureHealthOperation(state, "set-layer-visible", {layer, visible}, () => {
        renderer.setLayerVisible(layer, visible);
        updateRuntimePanel(documentRef, state);
      });
    },
    onOpenGenerationPanel: () => {
      state.panels.generation.open();
    },
    onOpenHeightPanel: () => {
      state.panels.height.open(state.editHistory.getStats());
    },
    onOpenStatePanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.STATE) {
        state.panels.state.setTargetStateId(state.selection.object.id);
      }
      state.panels.state.open(state.map, state.editHistory.getStats());
    },
    onOpenProvincePanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.PROVINCE) {
        state.panels.province.setSelectedProvinceId(state.selection.object.id);
      }
      state.panels.province.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenCityPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.CITY) {
        state.panels.city.setSelectedCityId(state.selection.object.id);
      }
      state.panels.city.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenCulturePanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.CULTURE) {
        state.panels.culture.setSelectedCultureId(state.selection.object.id);
      }
      state.panels.culture.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenReligionPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.RELIGION) {
        state.panels.religion.setSelectedReligionId(state.selection.object.id);
      }
      state.panels.religion.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenDiplomacyPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.STATE) {
        state.panels.diplomacy.setSelectedStateId(state.selection.object.id);
      }
      state.panels.diplomacy.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenMilitaryPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.MILITARY) {
        state.panels.military.setSelectedRegimentId(state.selection.object.id);
      }
      state.panels.military.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenRiverPanel: () => {
      state.panels.river.open(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
    },
    onOpenRoutePanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.ROUTE) {
        state.panels.route.setSelectedRouteId(state.selection.object.id);
      }
      state.panels.route.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenMarkerPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.MARKER) {
        state.panels.marker.setSelectedMarkerId(state.selection.object.id);
      }
      state.panels.marker.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenLabelNamingPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.LABEL) {
        state.panels.labelNaming.setSelectedLabelKey(labelKeyForObject(state.selection.object));
      }
      state.panels.labelNaming.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenNotesPanel: () => {
      state.panels.notes.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenNamebasePanel: () => {
      state.panels.namebase.open(state.map);
    },
    onExportImage: () => exportMapImage(state, documentRef),
    onExportMapData: () => exportMapData(state, documentRef),
    onExportGeoJson: () => exportGeoJson(state, documentRef),
    onExportFeatureGeoJson: () => exportFeatureGeoJson(state, documentRef),
    onImportMapData: file => importMapData(state, documentRef, file),
    onImportHeightmapImage: file => importHeightmapImage(state, documentRef, file),
    onRegenerate: kind => {
      updateRegenerationSection(documentRef, regenerateMapAttribute(state, kind, documentRef));
    },
    onMode: mode => {
      measureHealthOperation(state, "set-view-mode", {mode}, () => {
        if (mode === "diplomacy") {
          const subjectId = state.selection?.object?.kind === OBJECT_KIND.STATE ? state.selection.object.id : firstDiplomacyStateId(state.map);
          state.panels.diplomacy?.setSelectedStateId?.(subjectId);
          renderer.setDiplomacySubjectId?.(subjectId);
        }
        renderer.setColorMode(mode);
        updateRuntimePanel(documentRef, state);
      });
    }
  });

  window.__webglGeneratorApp = state;
  healthMonitor?.record?.("app-ready", {hasCanvas: Boolean(canvas)}, "info");
  requestGenerate(state, documentRef);
  return state;
}

function measureHealthOperation(state, name, detail, task) {
  const monitor = state.healthMonitor;
  if (!monitor?.measureSyncOperation) return task();
  return monitor.measureSyncOperation(name, detail, task);
}

function applyControlPreferencesToRenderer(documentRef, renderer) {
  const preferences = readControlPreferences(documentRef);
  const monitor = getWebglGeneratorHealthMonitor(documentRef);
  const operation = monitor?.beginOperation?.("apply-render-preferences", {
    colorMode: preferences.colorMode || "",
    layers: Object.keys(preferences.layers || {}).length
  });
  try {
    if (typeof preferences.colorMode === "string") renderer.setColorMode(preferences.colorMode);
    if (typeof preferences.showOceanHeight === "boolean") renderer.setViewOptions({showOceanHeight: preferences.showOceanHeight});
    if (typeof preferences.smoothCellBorders === "boolean") renderer.setViewOptions({smoothCellBorders: preferences.smoothCellBorders});
    if (typeof preferences.maxCityLabels === "number") renderer.setLabelOptions({maxCityLabels: preferences.maxCityLabels});
    const layers = normalizeLayerVisibilityPreferences(preferences.layers || {});
    for (const [layer, visible] of Object.entries(layers)) {
      renderer.setLayerVisible(layer, visible);
    }
  } finally {
    operation?.end();
  }
}

function setDiplomacyThemeSubject(state, documentRef, stateId) {
  const subjectId = normalizedDiplomacyStateId(state.map, stateId) || firstDiplomacyStateId(state.map);
  if (!subjectId) return;
  state.panels.diplomacy?.setSelectedStateId?.(subjectId);
  state.renderer.setDiplomacySubjectId?.(subjectId);
  state.renderer.setColorMode("diplomacy");
  setActiveModeButton(documentRef, "diplomacy");
  updateRuntimePanel(documentRef, state);
}

function normalizedDiplomacyStateId(map, stateId) {
  const id = Number(stateId);
  if (!Number.isInteger(id) || id <= 0) return 0;
  const state = map?.politics?.states?.[id] || map?.pack?.states?.[id];
  return state?.i && !state.removed ? id : 0;
}

function firstDiplomacyStateId(map) {
  return (map?.politics?.states || map?.pack?.states || []).find(stateItem => stateItem?.i && !stateItem.removed)?.i || 0;
}

function normalizeLayerVisibilityPreferences(layers = {}) {
  const normalized = {...layers};
  if (Object.prototype.hasOwnProperty.call(normalized, "coastline")) normalized.lakeShore = normalized.coastline;
  return normalized;
}

function setMythicGenerationLoading(documentRef, visible, stageOrKey) {
  if (!visible) {
    updateGenerationLoading(documentRef, false);
    return;
  }
  updateGenerationLoading(documentRef, true, loadingMessage(stageOrKey));
}

function updateGenerationLoading(documentRef, visible, message = "山海初开") {
  setGenerationLoading(documentRef, visible, message);
  getWebglGeneratorHealthMonitor(documentRef)?.markLoading(visible, message);
}

function loadingMessage(stageOrKey) {
  if (typeof stageOrKey === "string") return LOADING_MESSAGES[stageOrKey] || stageOrKey;
  const stageId = stageOrKey?.id;
  if (stageId && LOADING_MESSAGES[stageId]) return LOADING_MESSAGES[stageId];
  return stageOrKey?.label || "山海流转";
}

function resetLoadTrace(documentRef) {
  if (!isLoadTraceEnabled(documentRef)) return;
  const view = documentRef.defaultView || window;
  view.__webglGeneratorLoadTraceStartedAt = currentLoadTraceTime(view);
  view.__webglGeneratorDebug?.clearLoadTrace?.();
}

function emitLoadTrace(documentRef, event = {}) {
  const view = documentRef.defaultView || window;
  const now = currentLoadTraceTime(view);
  if (!Number.isFinite(view.__webglGeneratorLoadTraceStartedAt)) {
    view.__webglGeneratorLoadTraceStartedAt = now;
  }
  const stage = {
    phase: event.phase || "stage",
    id: String(event.id || "unknown"),
    label: event.label || "",
    message: event.message || loadingMessage(event),
    at: roundLoadTraceMs(now - view.__webglGeneratorLoadTraceStartedAt)
  };
  if (Number.isFinite(event.ms)) stage.ms = roundLoadTraceMs(event.ms);
  if (Number.isFinite(event.delayMs)) stage.delayMs = roundLoadTraceMs(event.delayMs);

  getWebglGeneratorHealthMonitor(documentRef)?.markLoadStage(stage);
  if (!isLoadTraceEnabled(documentRef)) return;

  view.__webglGeneratorDebug?.recordLoadStage?.(stage);
  if (typeof view.CustomEvent === "function") {
    view.dispatchEvent(new view.CustomEvent(LOAD_TRACE_EVENT_NAME, {detail: stage}));
  }
  view.console?.debug?.("[FMG load]", `${stage.phase} ${stage.id}`, stage);
}

function isLoadTraceEnabled(documentRef) {
  const view = documentRef.defaultView || window;
  if (view.__webglGeneratorDebug?.enabled) return true;
  const params = readSearchParams(documentRef);
  return readBooleanSearchParam(params, "debug") || readBooleanSearchParam(params, "debugLoad") || readBooleanSearchParam(params, "loadTrace");
}

function readDebugLoadDelayMs(documentRef) {
  if (!isLoadTraceEnabled(documentRef)) return 0;
  const view = documentRef.defaultView || window;
  const debugDelay = Number(view.__webglGeneratorDebug?.loadStepDelayMs ?? view.__webglGeneratorLoadStepDelayMs);
  if (Number.isFinite(debugDelay)) return clampDebugLoadDelay(debugDelay);

  const params = readSearchParams(documentRef);
  for (const key of LOAD_TRACE_DELAY_PARAMS) {
    const value = params.get(key);
    if (value === null) continue;
    const delayMs = Number(value);
    if (Number.isFinite(delayMs)) return clampDebugLoadDelay(delayMs);
  }
  return 0;
}

function readSearchParams(documentRef) {
  try {
    return new URLSearchParams((documentRef.defaultView || window).location.search);
  } catch {
    return new URLSearchParams();
  }
}

function readBooleanSearchParam(params, key) {
  if (!params.has(key)) return false;
  const value = params.get(key);
  if (value === "" || value === null) return true;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function currentLoadTraceTime(view) {
  return typeof view.performance?.now === "function" ? view.performance.now() : Date.now();
}

function roundLoadTraceMs(value) {
  return Math.round(value * 10) / 10;
}

function clampDebugLoadDelay(value) {
  return Math.max(0, Math.min(MAX_DEBUG_LOAD_DELAY_MS, Math.round(value)));
}

function requestGenerate(state, documentRef) {
  try {
    if (documentRef.getElementById("auto-random-seed").checked) {
      setSeedInput(documentRef, createRandomSeed());
    }
    state.options = readOptionsFromPanel(documentRef, state.options);
    state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
    const generateId = state.pendingGenerateId;
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "request", message: loadingMessage("request")});
    setGenerationStatus(documentRef, state.options, "等待生成任务");
    setMythicGenerationLoading(documentRef, true, "request");
    scheduleAfterPaint(documentRef, () => {
      if (generateId !== state.pendingGenerateId) return;
      void runGenerateNow(state, documentRef, generateId);
    });
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportGenerateError(documentRef, error);
  }
}

async function runGenerateNow(state, documentRef, generateId) {
  try {
    setGenerationStatus(documentRef, state.options, "生成中");
    setMythicGenerationLoading(documentRef, true, "generate");
    emitLoadTrace(documentRef, {phase: "start", id: "generate", message: loadingMessage("generate"), delayMs: readDebugLoadDelayMs(documentRef)});
    await yieldToBrowser(documentRef, {debugDelay: true});
    const map = await generateMapOffMainThread(documentRef, state.options, generateId);
    emitLoadTrace(documentRef, {phase: "end", id: "generate", message: loadingMessage("generate")});
    if (generateId !== state.pendingGenerateId) return;
    await loadMapIntoRuntime(state, documentRef, map, {
      loadingMessages: [loadingMessage("cell-visual-mesh"), loadingMessage("panel-refresh")]
    });
    updateGenerationLoading(documentRef, false);
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportGenerateError(documentRef, error);
  }
}

async function loadMapIntoRuntime(state, documentRef, map, {loadingMessages = []} = {}) {
  emitLoadTrace(documentRef, {phase: "start", id: "load-map", message: "接入地图运行时", delayMs: readDebugLoadDelayMs(documentRef)});
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
  state.markerEdit.mode = null;
  state.markerEdit.type = "mines";
  state.markerEdit.markerId = null;
  state.markerEdit.lastPackCell = null;
  state.measurement.points = [];
  state.measurement.pointer = null;
  state.lastEditRefresh = null;
  if (loadingMessages[0]) {
    updateGenerationLoading(documentRef, true, loadingMessages[0]);
    await yieldToBrowser(documentRef, {debugDelay: true});
  }
  if (typeof state.renderer.loadMapAsync === "function") {
    await state.renderer.loadMapAsync(state.map, {
      onStage: stage => {
        setMythicGenerationLoading(documentRef, true, stage);
        emitLoadTrace(documentRef, {
          phase: "start",
          id: stage.id,
          label: stage.label,
          message: loadingMessage(stage),
          delayMs: readDebugLoadDelayMs(documentRef)
        });
      },
      onStageEnd: stage => {
        emitLoadTrace(documentRef, {
          phase: stage.error ? "error" : "end",
          id: stage.id,
          label: stage.label,
          message: stage.error ? `${loadingMessage(stage)}：${stage.error.message || "失败"}` : loadingMessage(stage),
          ms: stage.ms
        });
      },
      yieldToBrowser: options => yieldToBrowser(documentRef, options)
    });
  } else {
    state.renderer.loadMap(state.map);
  }
  emitLoadTrace(documentRef, {phase: "start", id: "panel-refresh", message: loadingMessage("panel-refresh"), delayMs: readDebugLoadDelayMs(documentRef)});
  if (loadingMessages[1]) {
    updateGenerationLoading(documentRef, true, loadingMessages[1]);
    await yieldToBrowser(documentRef, {debugDelay: true});
  }
  state.selectionStore.clear();
  updateHeightPanel(state);
  updateStatePanel(state);
  updateProvincePanel(state);
  updateCityPanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  state.panels.namebase.update(state.map);
  state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
  state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
  updateEditingInteractionLock(state, documentRef);
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
  updateMeasurementOverlay(state, documentRef);
  emitLoadTrace(documentRef, {phase: "end", id: "panel-refresh", message: loadingMessage("panel-refresh")});
  emitLoadTrace(documentRef, {phase: "end", id: "load-map", message: "接入地图运行时"});
  emitLoadTrace(documentRef, {phase: "complete", id: "complete", message: "地图进入可交互状态"});
  getWebglGeneratorHealthMonitor(documentRef)?.markMapReady({
    seed: state.map?.metadata?.seed || state.options?.seed || "",
    gridCells: state.map?.metadata?.gridCells || state.map?.grid?.metadata?.actualCells || 0,
    packCells: state.map?.metadata?.packCells || state.map?.pack?.metadata?.cells || 0,
    loadMap: state.renderer?.getStats?.().loadMap || null
  });
  updateGenerationLoading(documentRef, false);
}

function scheduleAfterPaint(documentRef, callback) {
  const view = documentRef.defaultView || window;
  let called = false;
  const run = () => {
    if (called) return;
    called = true;
    callback();
  };

  const fallback = view.setTimeout(run, 120);
  const finish = () => {
    view.clearTimeout(fallback);
    run();
  };
  if (typeof view.requestAnimationFrame === "function") {
    view.requestAnimationFrame(() => view.setTimeout(finish, 0));
    return;
  }
  view.setTimeout(finish, 0);
}

function yieldToBrowser(documentRef, options = {}) {
  const view = documentRef.defaultView || window;
  return new Promise(resolve => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      const delayMs = options.debugDelay ? readDebugLoadDelayMs(documentRef) : 0;
      if (delayMs > 0) {
        view.setTimeout(resolve, delayMs);
        return;
      }
      resolve();
    };
    const fallback = view.setTimeout(finish, 120);
    const finishAfterPaint = () => {
      view.clearTimeout(fallback);
      finish();
    };
    if (typeof view.requestAnimationFrame === "function") {
      view.requestAnimationFrame(() => view.setTimeout(finishAfterPaint, 0));
      return;
    }
    view.setTimeout(finishAfterPaint, 0);
  });
}

function createGenerationTrace(documentRef) {
  return {
    onStageStart: stage => {
      setMythicGenerationLoading(documentRef, true, stage);
      emitLoadTrace(documentRef, {
        phase: "start",
        id: stage.id,
        label: stage.label,
        message: loadingMessage(stage)
      });
    },
    onStageEnd: stage => emitLoadTrace(documentRef, {
      phase: "end",
      id: stage.id,
      label: stage.label,
      message: loadingMessage(stage),
      ms: stage.ms
    })
  };
}

function generateMapOffMainThread(documentRef, options, generateId) {
  const view = documentRef.defaultView || window;
  const generationTrace = createGenerationTrace(documentRef);
  if (typeof view.Worker !== "function") return Promise.resolve(generatePlaceholderMap(options, generationTrace));

  let worker;
  try {
    worker = new GenerationWorker();
  } catch {
    return Promise.resolve(generatePlaceholderMap(options, generationTrace));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = view.setTimeout(() => {
      finish(() => reject(new Error("地图生成超时，请降低 cells 数量后重试")));
    }, 60000);

    const finish = callback => {
      if (settled) return;
      settled = true;
      view.clearTimeout(timeout);
      worker.terminate();
      callback();
    };

    const fallbackToMainThread = () => {
      try {
        const map = generatePlaceholderMap(options, generationTrace);
        finish(() => resolve(map));
      } catch (error) {
        finish(() => reject(error));
      }
    };

    worker.addEventListener("message", event => {
      const data = event.data || {};
      if (data.requestId !== generateId) return;
      if (data.type === "generation-stage") {
        setMythicGenerationLoading(documentRef, true, data.stage);
        emitLoadTrace(documentRef, {
          phase: "start",
          id: data.stage?.id,
          label: data.stage?.label,
          message: loadingMessage(data.stage)
        });
        return;
      }
      if (data.type === "generation-stage-complete") {
        emitLoadTrace(documentRef, {
          phase: "end",
          id: data.stage?.id,
          label: data.stage?.label,
          message: loadingMessage(data.stage),
          ms: data.stage?.ms
        });
        return;
      }
      if (data.type === "generated-map") {
        finish(() => resolve(data.map));
        return;
      }
      const error = new Error(data.message || "地图生成失败");
      if (data.stack) error.stack = data.stack;
      finish(() => reject(error));
    });

    worker.addEventListener("error", fallbackToMainThread);
    worker.addEventListener("messageerror", fallbackToMainThread);

    worker.postMessage({type: "generate-map", requestId: generateId, options});
  });
}

function setGenerationStatus(documentRef, options, status) {
  const appStatus = documentRef.getElementById("app-status");
  if (appStatus) appStatus.textContent = `${status}，seed ${options.seed}`;
}

function reportGenerateError(documentRef, error) {
  const message = error instanceof Error ? error.message : String(error);
  const appStatus = documentRef.getElementById("app-status");
  if (appStatus) appStatus.textContent = `生成失败：${message}`;
  console.error(error);
}

async function exportMapImage(state, documentRef) {
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导出图片...");
    await downloadCanvasPng(documentRef, documentRef.getElementById("map-canvas"), `${mapFileBaseName(state.map)}.png`, {includeMapOverlays: true, renderer: state.renderer});
    setFileOperationStatus(documentRef, "图片已导出。");
  } catch (error) {
    reportFileOperationError(documentRef, "图片导出失败", error);
  }
}

function exportMapData(state, documentRef) {
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导出地图数据...");
    const document = createMapDocument(state.map, state.options);
    downloadText(documentRef, stringifyMapDocument(document), `${mapFileBaseName(state.map)}.webgl-map.json`, "application/json;charset=utf-8");
    setFileOperationStatus(documentRef, "地图数据已导出。");
  } catch (error) {
    reportFileOperationError(documentRef, "地图数据导出失败", error);
  }
}

function exportGeoJson(state, documentRef) {
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导出 GeoJSON...");
    const geoJson = createMapGeoJson(state.map);
    downloadText(documentRef, JSON.stringify(geoJson), `${mapFileBaseName(state.map)}.geojson`, "application/geo+json;charset=utf-8");
    setFileOperationStatus(documentRef, `GeoJSON 已导出，共 ${geoJson.features.length} 个 cell 面。`);
  } catch (error) {
    reportFileOperationError(documentRef, "GeoJSON 导出失败", error);
  }
}

function exportFeatureGeoJson(state, documentRef) {
  try {
    assertMapAvailable(state);
    const layers = readFeatureGeoJsonLayerOptions(documentRef);
    setFileOperationStatus(documentRef, "正在导出要素 GeoJSON...");
    const geoJson = createMapFeatureGeoJson(state.map, {layers});
    downloadText(documentRef, JSON.stringify(geoJson), `${mapFileBaseName(state.map)}.features.geojson`, "application/geo+json;charset=utf-8");
    setFileOperationStatus(documentRef, `要素 GeoJSON 已导出，共 ${geoJson.features.length} 个要素，图层：${geoJson.properties.layerSet}。`);
  } catch (error) {
    reportFileOperationError(documentRef, "要素 GeoJSON 导出失败", error);
  }
}

function exportNotesSummary(state, documentRef, rows = []) {
  try {
    assertMapAvailable(state);
    const notes = (rows || []).map(row => ({
      id: row.id,
      kind: row.kind,
      kindLabel: row.kindLabel,
      objectId: row.objectId,
      name: row.name,
      body: row.body,
      bodyLength: row.bodyLength,
      orphan: Boolean(row.orphan),
      createdAt: row.createdAt || "",
      updatedAt: row.updatedAt || ""
    }));
    const payload = {
      type: "webgl-generator-notes-summary",
      version: 1,
      exportedAt: new Date().toISOString(),
      metadata: {
        seed: state.map.metadata?.seed || "",
        checksum: state.map.metadata?.checksum || "",
        notes: notes.length,
        totalNotes: state.map.notes?.metadata?.notes || state.map.notes?.notes?.length || 0
      },
      notes
    };
    downloadText(documentRef, JSON.stringify(payload, null, 2), `${mapFileBaseName(state.map)}.notes.json`, "application/json;charset=utf-8");
    setFileOperationStatus(documentRef, `备注摘要已导出，共 ${notes.length} 条。`);
  } catch (error) {
    reportFileOperationError(documentRef, "备注摘要导出失败", error);
  }
}

function exportNamebases(state, documentRef) {
  try {
    const payload = createNamebaseDocument(state.map);
    const filename = state.map ? `${mapFileBaseName(state.map)}.namebases.json` : "webgl-generator-namebases.json";
    downloadText(documentRef, JSON.stringify(payload, null, 2), filename, "application/json;charset=utf-8");
    setFileOperationStatus(documentRef, `名称库已导出，共 ${payload.metadata.bases} 个词池，用户库 ${payload.metadata.user} 个。`);
  } catch (error) {
    reportFileOperationError(documentRef, "名称库导出失败", error);
  }
}

async function importNamebases(state, documentRef, file, mode = "append") {
  if (!file) return;
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导入名称库...");
    const document = parseNamebaseDocument(await file.text());
    const result = importNamebaseDocument(state.map, document, {filename: file.name, mode});
    state.panels.namebase.update(state.map);
    const replacedText = result.replaced ? `，已替换原用户库 ${result.replaced} 个` : "";
    setFileOperationStatus(documentRef, `名称库已导入 ${result.imported} 个词池${replacedText}，当前用户库 ${result.total} 个。`);
  } catch (error) {
    reportFileOperationError(documentRef, "名称库导入失败", error);
  }
}

function copyBuiltinNamebase(state, documentRef, row) {
  try {
    assertMapAvailable(state);
    if (!row?.id || row.builtin !== true) {
      setFileOperationStatus(documentRef, "请选择一个内置名称库进行复制。");
      return;
    }
    const result = copyBuiltinNamebaseToUser(state.map, row.id);
    if (!result.copied) {
      setFileOperationStatus(documentRef, "未找到可复制的内置名称库。");
      return;
    }
    state.panels.namebase.update(state.map);
    setFileOperationStatus(documentRef, `已复制“${row.name}”为用户名称库“${result.name}”，当前用户库 ${result.total} 个。`);
  } catch (error) {
    reportFileOperationError(documentRef, "复制名称库失败", error);
  }
}

function createManualNamebase(state, documentRef) {
  try {
    assertMapAvailable(state);
    const result = createUserNamebase(state.map);
    state.panels.namebase.update(state.map);
    setFileOperationStatus(documentRef, `已新建用户名称库“${result.name}”，样本 ${result.samples} 个，当前用户库 ${result.total} 个。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "新建名称库失败", error);
    return null;
  }
}

function renameImportedNamebase(state, documentRef, row, name) {
  try {
    assertMapAvailable(state);
    if (!row?.id || row.builtin === true) {
      setFileOperationStatus(documentRef, "请选择一个用户名称库进行重命名。");
      return;
    }
    const result = renameUserNamebase(state.map, row.id, name);
    if (result.unchanged) {
      setFileOperationStatus(documentRef, "名称库名称没有变化。");
      return;
    }
    if (!result.renamed) {
      setFileOperationStatus(documentRef, "未找到可重命名的用户名称库。");
      return;
    }
    state.panels.namebase.update(state.map);
    setFileOperationStatus(documentRef, `已重命名用户名称库“${result.previousName}”为“${result.name}”。`);
  } catch (error) {
    reportFileOperationError(documentRef, "重命名名称库失败", error);
  }
}

function updateImportedNamebaseSource(state, documentRef, row, sourceText) {
  try {
    assertMapAvailable(state);
    if (!row?.id || row.builtin === true) {
      setFileOperationStatus(documentRef, "请选择一个用户名称库编辑样本。");
      return;
    }
    const result = updateUserNamebaseSource(state.map, row.id, sourceText);
    if (!result.updated) {
      setFileOperationStatus(documentRef, "未找到可编辑的用户名称库。");
      return;
    }
    state.panels.namebase.update(state.map);
    setFileOperationStatus(documentRef, `已更新用户名称库“${result.name}”，样本 ${result.samples} 个。`);
  } catch (error) {
    reportFileOperationError(documentRef, "编辑名称库样本失败", error);
  }
}

function clearImportedNamebases(state, documentRef) {
  try {
    assertMapAvailable(state);
    const count = state.map.namebases?.bases?.length || 0;
    if (!count) {
      setFileOperationStatus(documentRef, "当前没有可清空的用户名称库。");
      return;
    }
    const view = documentRef.defaultView || window;
    if (typeof view.confirm === "function" && !view.confirm(`确定清空 ${count} 个用户名称库？`)) return;
    const result = clearUserNamebases(state.map);
    state.panels.namebase.update(state.map);
    setFileOperationStatus(documentRef, `已清空 ${result.removed} 个用户名称库。`);
  } catch (error) {
    reportFileOperationError(documentRef, "清空名称库失败", error);
  }
}

function deleteImportedNamebase(state, documentRef, row) {
  try {
    assertMapAvailable(state);
    const id = row?.id;
    if (!id) return;
    if (row.origin === "内置" || row.builtin === true) {
      setFileOperationStatus(documentRef, "内置名称库不能删除。");
      return;
    }
    const view = documentRef.defaultView || window;
    const name = row.name || id;
    if (typeof view.confirm === "function" && !view.confirm(`确定删除用户名称库“${name}”？`)) return;
    const result = deleteUserNamebase(state.map, id);
    if (!result.removed) {
      setFileOperationStatus(documentRef, "未找到可删除的用户名称库。");
      return;
    }
    state.panels.namebase.update(state.map);
    setFileOperationStatus(documentRef, `已删除用户名称库“${result.name || name}”，当前用户库 ${result.total} 个。`);
  } catch (error) {
    reportFileOperationError(documentRef, "删除名称库失败", error);
  }
}

function readFeatureGeoJsonLayerOptions(documentRef) {
  return {
    state: documentRef.getElementById("feature-export-layer-state")?.checked === true,
    province: documentRef.getElementById("feature-export-layer-province")?.checked === true,
    city: documentRef.getElementById("feature-export-layer-city")?.checked !== false,
    route: documentRef.getElementById("feature-export-layer-route")?.checked !== false,
    river: documentRef.getElementById("feature-export-layer-river")?.checked !== false,
    marker: documentRef.getElementById("feature-export-layer-marker")?.checked !== false,
    zone: documentRef.getElementById("feature-export-layer-zone")?.checked !== false
  };
}

async function importMapData(state, documentRef, file) {
  if (!file) return;
  try {
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "map-import-read", message: loadingMessage("map-import-read")});
    setFileOperationStatus(documentRef, "正在读取地图数据...");
    setMythicGenerationLoading(documentRef, true, "map-import-read");
    const document = parseMapDocument(await file.text());
    const options = normalizeOptions(document.map.options || document.options || state.options);
    document.map.options = options;
    state.options = options;
    syncGenerationInputs(documentRef, options);
    state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
    await loadMapIntoRuntime(state, documentRef, document.map, {
      loadingMessages: [loadingMessage("map-import-render"), loadingMessage("panel-refresh")]
    });
    updateGenerationLoading(documentRef, false);
    setFileOperationStatus(documentRef, `已导入地图数据：seed ${document.map.metadata?.seed || options.seed || "未知"}`);
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportFileOperationError(documentRef, "地图数据导入失败", error);
  }
}

async function importHeightmapImage(state, documentRef, file) {
  if (!file) return;
  try {
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "heightmap-read", message: loadingMessage("heightmap-read")});
    setFileOperationStatus(documentRef, "正在读取灰度高度图...", ["heightmap-import-status"]);
    setMythicGenerationLoading(documentRef, true, "heightmap-read");
    const options = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
    const settings = readHeightmapImportSettings(documentRef);
    const importGenerateId = (state.pendingGenerateId || 0) + 1;
    state.pendingGenerateId = importGenerateId;
    state.heightmapImportId = importGenerateId;
    const heightmap = await createGrayscaleHeightmapFromImage(documentRef, file, options, settings);
    if (importGenerateId !== state.pendingGenerateId) {
      clearStaleHeightmapImportStatus(state, documentRef, importGenerateId);
      return;
    }
    state.options = options;
    setMythicGenerationLoading(documentRef, true, "heightmap-generate");
    emitLoadTrace(documentRef, {phase: "start", id: "heightmap-generate", message: loadingMessage("heightmap-generate")});
    const map = generatePlaceholderMap(options, {...createGenerationTrace(documentRef), heightmap});
    emitLoadTrace(documentRef, {phase: "end", id: "heightmap-generate", message: loadingMessage("heightmap-generate")});
    if (importGenerateId !== state.pendingGenerateId) {
      clearStaleHeightmapImportStatus(state, documentRef, importGenerateId);
      return;
    }
    state.options = map.options;
    await loadMapIntoRuntime(state, documentRef, map, {
      loadingMessages: [loadingMessage("heightmap-render"), loadingMessage("panel-refresh")]
    });
    updateGenerationLoading(documentRef, false);
    setFileOperationStatus(documentRef, `已导入灰度高度图：${heightmap.source.filename || "本地图片"}，高度 ${heightmap.source.heightMin}-${heightmap.source.heightMax}，${heightmapFitLabel(heightmap.source.fitMode)}`, ["heightmap-import-status"]);
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportFileOperationError(documentRef, "灰度高度图导入失败", error, ["heightmap-import-status"]);
  }
}

function heightmapFitLabel(fitMode) {
  return fitMode === "crop" ? "保持比例裁剪" : "拉伸铺满";
}

function clearStaleHeightmapImportStatus(state, documentRef, importGenerateId) {
  if (state.heightmapImportId !== importGenerateId) return;
  setFileOperationStatus(documentRef, "", ["heightmap-import-status"]);
}

function assertMapAvailable(state) {
  if (!state.map) throw new Error("当前没有可用地图");
}

function setFileOperationStatus(documentRef, message, targetIds = ["file-operation-status"]) {
  for (const id of targetIds) {
    const status = documentRef.getElementById(id);
    if (status) status.textContent = message;
  }
}

function reportFileOperationError(documentRef, prefix, error, targetIds) {
  const message = error instanceof Error ? error.message : String(error);
  setFileOperationStatus(documentRef, `${prefix}：${message}`, targetIds);
  console.error(error);
}

function syncGenerationInputs(documentRef, options) {
  setInputValue(documentRef, "seed-input", options.seed);
  setInputValue(documentRef, "cells-input", options.cells);
  setInputValue(documentRef, "width-input", options.graphWidth);
  setInputValue(documentRef, "height-input", options.graphHeight);
  setInputValue(documentRef, "heightmap-template", options.heightmapTemplate);
}

function setInputValue(documentRef, id, value) {
  const input = documentRef.getElementById(id);
  if (!input || value === undefined || value === null) return;
  if (input.tagName === "SELECT" && !Array.from(input.options).some(option => option.value === String(value))) return;
  input.value = String(value);
  input.dispatchEvent(new Event("change", {bubbles: true}));
}

function applyClimateControls(state, documentRef) {
  if (!state.map) return;
  const options = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
  state.options = options;
  state.map.options = options;
  const climate = buildClimate(state.map.grid, state.map.features, options, createRandom(options.seed));
  const biomes = defineBiomesAndPopulation(state.map.grid, state.map.pack, state.map.options);
  climate.biomes = biomes.biomes;
  climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
  state.map.climate = climate;
  state.map.mapCoordinates = climate.mapCoordinates;
  state.map.summary = createGenerationSummary(options, state.map.grid, state.map.features, climate, state.map.society, state.map.politics, state.map.settlements, state.map.markers, state.map.pack, state.map.rivers, state.map.layers, state.map.military, state.map.zones, state.map.economy, state.map.diplomacy);
  if (state.map.metadata) state.map.metadata.checksum = state.map.summary.checksum;
  markDerivedStale(state.map, ["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);

  refreshAfterEdit(state, {
    render: "draw",
    selection: "none",
    runtimeStats: true,
    pickPanel: true,
    derived: ["cell-colors", "point-layers", "object-panels"],
    affected: [{kind: "climate", id: "live"}]
  });
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateCityPanel(state);
  updateStatePanel(state);
  updateProvincePanel(state);
}

function locateObject(state, object, documentRef) {
  const located = object ? state.renderer.locateObject(object) : false;
  if (located) {
    state.selectionStore.setSelection({object});
  }
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}

const SELECTION_PANEL_HANDLERS = Object.freeze({
  [OBJECT_KIND.STATE]: (state, selection) => {
    state.panels.objectDetails.clear();
    state.panels.state.setTargetStateId(selection.object.id);
    state.panels.state.open(state.map, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.CITY]: (state, selection) => {
    state.panels.objectDetails.clear();
    state.panels.city.setSelectedCityId(selection.object.id);
    state.panels.city.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.PROVINCE]: (state, selection) => {
    if (!shouldOpenProvincePanelForSelection(state)) return false;
    state.panels.objectDetails.clear();
    state.panels.province.setSelectedProvinceId(selection.object.id);
    state.panels.province.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.CULTURE]: (state, selection) => {
    if (!shouldOpenCulturePanelForSelection(state)) return false;
    state.panels.objectDetails.clear();
    state.panels.culture.setSelectedCultureId(selection.object.id);
    state.panels.culture.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.RELIGION]: (state, selection) => {
    if (!shouldOpenReligionPanelForSelection(state)) return false;
    state.panels.objectDetails.clear();
    state.panels.religion.setSelectedReligionId(selection.object.id);
    state.panels.religion.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.RIVER]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    if (context.suppressNextRiverPanelOpen) {
      context.clearRiverSuppressor();
      return true;
    }
    state.panels.river.open(state.map, selection, state.editHistory.getStats(), editingObject);
    return true;
  },
  [OBJECT_KIND.ROUTE]: (state, selection) => {
    state.panels.objectDetails.clear();
    state.panels.route.setSelectedRouteId(selection.object.id);
    state.panels.route.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.MARKER]: (state, selection) => {
    if (!state.panels.marker?.isOpen?.()) return false;
    state.panels.objectDetails.clear();
    state.panels.marker.setSelectedMarkerId(selection.object.id);
    state.panels.marker.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.MILITARY]: (state, selection) => {
    state.panels.objectDetails.clear();
    state.panels.military.setSelectedRegimentId(selection.object.id);
    state.panels.military.open(state.map, selection, state.editHistory.getStats());
    return true;
  }
});

function handleSelectionPanel(state, selection, editingObject, context) {
  const object = selection?.object;
  if (!object?.kind) return false;
  if (object.kind === OBJECT_KIND.STATE && shouldSwitchDiplomacySubjectForSelection(state)) {
    state.panels.objectDetails.clear();
    setDiplomacyThemeSubject(state, context.documentRef, object.id);
    return true;
  }
  return SELECTION_PANEL_HANDLERS[object.kind]?.(state, selection, editingObject, context) || false;
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

function regenerateMapAttribute(state, kind, documentRef) {
  if (!state.map) return regenerationResult(kind, "未执行", "当前没有可重算的地图。");
  switch (kind) {
    case "routes":
      return regenerateRoutes(state, documentRef);
    case "rivers":
      return regenerateRivers(state, documentRef);
    case "cities":
      return regenerateCities(state, documentRef);
    case "states":
      return regenerateStates(state, documentRef);
    case "provinces":
      return regenerateProvinces(state, documentRef);
    case "markers":
      return regenerateMarkerResources(state, documentRef);
    case "diplomacy":
      return regenerateDiplomacy(state, documentRef);
    default:
      break;
  }

  return regenerationResult(kind, "暂未执行", "该属性尚未接入受约束重算。");
}

function regenerateStates(state, documentRef) {
  const map = state.map;
  const beforeStates = map.politics?.metadata?.states || 0;
  const beforeProvinces = map.politics?.metadata?.provinces || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const stateSalt = nextRegenerationSalt(map, "states");
  const result = regeneratePackStatesAndProvinces(map.grid, map.society, map.options, map.pack, map.settlements, {salt: stateSalt});
  if (!result) return regenerationResult("states", "未执行", "当前地图缺少可用城镇或 pack 语义图，无法重选首都并扩张国家。");

  applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, pruneNeutralSettlements: true, routeRegenerationSalt: stateSalt});
  markDerivedFresh(map, ["states", "provinces", "cities"]);
  markDerivedStale(map, ["religions", "markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate states: salt=${stateSalt}, states=${map.politics.metadata.states}, provinces=${map.politics.metadata.provinces}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["cell-colors", "political-boundaries", "point-layers", "labels", "route-mesh", "object-panels", "object-index"],
    affected: [{kind: OBJECT_KIND.STATE, id: "all"}, {kind: OBJECT_KIND.PROVINCE, id: "all"}, {kind: OBJECT_KIND.CITY, id: "all"}, {kind: OBJECT_KIND.ROUTE, id: "all"}]
  });

  return regenerationResult(
    "states",
    `国家已重选首都并按当前文化、人口和地形约束重算（扰动 #${stateSalt}）：${beforeStates} -> ${map.politics.metadata.states}；省份 ${beforeProvinces} -> ${map.politics.metadata.provinces}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已刷新国家/省份归属、城市政区、路线、标签、边界和对象索引；宗教、标记、区域、军事、经济已标记为待派生。"
  );
}

function regenerateProvinces(state, documentRef) {
  const map = state.map;
  const beforeProvinces = map.politics?.metadata?.provinces || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const provinceSalt = nextRegenerationSalt(map, "provinces");
  const result = regeneratePackProvincesWithinStates(map.grid, map.society, map.options, map.pack, {salt: provinceSalt});
  if (!result) return regenerationResult("provinces", "未执行", "当前地图缺少可用国家或 pack 语义图，无法在国家内重建省份。");

  applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, routeRegenerationSalt: provinceSalt});
  markDerivedFresh(map, ["provinces", "cities"]);
  markDerivedStale(map, ["markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate provinces: salt=${provinceSalt}, provinces=${map.politics.metadata.provinces}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["cell-colors", "political-boundaries", "point-layers", "labels", "route-mesh", "object-panels", "object-index"],
    affected: [{kind: OBJECT_KIND.PROVINCE, id: "all"}, {kind: OBJECT_KIND.CITY, id: "all"}, {kind: OBJECT_KIND.ROUTE, id: "all"}]
  });

  return regenerationResult(
    "provinces",
    `省份已在当前国家内重算（扰动 #${provinceSalt}）：${beforeProvinces} -> ${map.politics.metadata.provinces}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已刷新省份归属、省会/城市省份、路线、标签、边界和对象索引；标记、区域、军事、经济已标记为待派生。"
  );
}

function regenerateRoutes(state, documentRef) {
  const map = state.map;
  const before = map.settlements?.routes?.length || 0;
  const routeSalt = nextRegenerationSalt(map, "routes");
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, routeRegenerationSalt: routeSalt});
  const after = map.settlements?.routes?.length || 0;
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate routes: salt=${routeSalt}, routes=${map.settlements.metadata.routes}, segments=${map.settlements.metadata.routeSegments}`);
  refreshRegeneratedLayers(state, documentRef, {
    derived: ["route-mesh", "object-panels", "object-index"],
    affected: [{kind: OBJECT_KIND.ROUTE, id: "all"}]
  });
  return regenerationResult("routes", `道路已按当前国家、城镇、港口和陆海约束重算（扰动 #${routeSalt}）：${before} -> ${after}`, "陆路仍通过 pack 邻接寻路并避开水域，海路只连接同水体港口。");
}

function regenerateRivers(state, documentRef) {
  const map = state.map;
  const beforeRivers = map.rivers?.rivers?.length || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const riverOptions = {...map.options, riverRegenerationSalt: nextRegenerationSalt(map, "rivers")};
  const nextRivers = buildRivers(map.grid, map.features, map.pack, riverOptions);
  renameHydronymsByCulture(nextRivers, map.pack, riverOptions);
  map.rivers = nextRivers;

  const biomes = defineBiomesAndPopulation(map.grid, map.pack, map.options);
  map.climate.biomes = biomes.biomes;
  map.climate.metadata.biomeCounts = biomes.metadata.biomeCounts;

  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack);
  markDerivedStale(map, ["cities", "provinces", "states", "religions", "markers", "zones", "military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate rivers: salt=${riverOptions.riverRegenerationSalt}, rivers=${map.rivers.metadata.rivers}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale.systems.join(",")}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["river-mesh", "river-width-stats", "route-mesh", "cell-colors", "point-layers", "object-panels", "object-index"],
    affected: [{kind: OBJECT_KIND.RIVER, id: "all"}, {kind: OBJECT_KIND.ROUTE, id: "all"}]
  });

  return regenerationResult(
    "rivers",
    `河流已按当前高度、降水和湖泊约束重算（扰动 #${riverOptions.riverRegenerationSalt}）：${beforeRivers} -> ${map.rivers.metadata.rivers}；道路同步重算：${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已刷新水文通量、生物群系/人口评分、河流 mesh、道路 mesh 和对象索引；城镇、省份、国家、宗教、标记、区域、军事仍标记为待派生。"
  );
}

function regenerateCities(state, documentRef) {
  const map = state.map;
  const beforeCities = map.settlements?.cities?.length || 0;
  const beforePorts = map.settlements?.cities?.filter(city => city?.port).length || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const citySalt = nextRegenerationSalt(map, "cities");

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, settlementRegenerationSalt: citySalt, routeRegenerationSalt: citySalt});
  clearGeneratedCityLabelHides(map);
  markDerivedFresh(map, ["cities"]);
  markDerivedStale(map, ["provinces", "states", "religions", "markers", "zones", "military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate settlements: salt=${citySalt}, cities=${map.settlements.metadata.cities}, ports=${map.settlements.metadata.ports}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["point-layers", "labels", "route-mesh", "object-panels", "object-index"],
    affected: [{kind: OBJECT_KIND.CITY, id: "all"}, {kind: OBJECT_KIND.ROUTE, id: "all"}]
  });

  return regenerationResult(
    "cities",
    `城镇已按当前适居度、文化、政区、港口和间距约束重算（扰动 #${citySalt}）：${beforeCities} -> ${map.settlements.metadata.cities}；港口 ${beforePorts} -> ${map.settlements.metadata.ports}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已保留国家首都 burg 引用，刷新省会、普通城镇、城市标签、人口点、道路和对象索引；省份、国家、宗教、标记、区域、军事仍标记为待派生。"
  );
}

function regenerateMarkerResources(state, documentRef) {
  const map = state.map;
  const beforeResources = map.markers?.metadata?.resourceMarkers || 0;
  const beforePotential = map.markers?.metadata?.resourcePotential || 0;
  const salt = nextRegenerationSalt(map, "markers");
  const command = createRegenerateResourceMarkersCommand({salt});
  const executed = applyMarkerCollectionCommand(state, documentRef, command);
  if (!executed) return regenerationResult("markers", "未执行", "当前地图缺少可用 pack 语义图或标记集合，无法重生成资源点。");

  appendGenerationLog(map, `regenerate resources: salt=${salt}, resources=${map.markers.metadata.resourceMarkers}, resourcePotential=${map.markers.metadata.resourcePotential}, markerResourceDeals=${map.economy?.metadata?.resourceTrade?.markerResourceDeals || 0}`);
  return regenerationResult(
    "markers",
    `资源点已按当前地形、河流、生物群系、温度和降水约束重算（扰动 #${salt}）：${beforeResources} -> ${map.markers.metadata.resourceMarkers}；资源潜力 ${beforePotential} -> ${map.markers.metadata.resourcePotential}`,
    "已刷新资源 marker、正式货物来源、市场库存、交易、国家/省份资源潜力、点图层、对象索引和统计；军事与外交已标记为待派生。"
  );
}

function regenerateDiplomacy(state, documentRef) {
  const map = state.map;
  const beforePairs = map.diplomacy?.metadata?.pairs || 0;
  const beforeEnemies = map.diplomacy?.metadata?.enemies || 0;
  const salt = nextRegenerationSalt(map, "diplomacy");
  const command = createRegenerateDiplomacyCommand({salt});
  if (command.isNoop({map})) return regenerationResult("diplomacy", "未执行", "当前地图至少需要两个有效国家才能重生成外交。");

  const executed = state.editHistory.execute(command, {map});
  refreshAfterEdit(state, executed);
  markDerivedFresh(map, ["diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate diplomacy: salt=${salt}, pairs=${map.diplomacy.metadata.pairs}, enemies=${map.diplomacy.metadata.enemies}`);
  updateDiplomacyPanel(state);
  updateStatePanel(state);
  updateRuntimePanel(documentRef, state);

  return regenerationResult(
    "diplomacy",
    `外交已按当前国家邻接、文化、宗教、国力、资源竞争和海洋势力重算（扰动 #${salt}）：关系 ${beforePairs} -> ${map.diplomacy.metadata.pairs}；战争 ${beforeEnemies} -> ${map.diplomacy.metadata.enemies}`,
    "外交重算不会改写国家边界、城镇、经济或军队；后续可把战争状态进一步接入军事行动和事件。"
  );
}

function refreshRegeneratedLayers(state, documentRef, {derived, affected}) {
  state.renderer.refreshObjectPickingIndex?.();
  refreshAfterEdit(state, {
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived,
    affected
  });
  updateStatePanel(state);
  updateProvincePanel(state);
  updateCityPanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
  state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
  updateRuntimePanel(documentRef, state);
}

function refreshGenerationSummary(map) {
  map.summary = createGenerationSummary(map.options, map.grid, map.features, map.climate, map.society, map.politics, map.settlements, map.markers, map.pack, map.rivers, map.layers, map.military, map.zones, map.economy, map.diplomacy);
}

function applyPoliticsRegenerationResult(map, result) {
  if (!result) return;
  if (result.states) {
    map.politics.states = result.states;
    map.pack.states = result.states;
  }
  if (result.provinces) {
    map.politics.provinces = result.provinces;
    map.pack.provinces = result.provinces;
  }
  if (result.timing) map.politics.timing = result.timing;
  if (result.provinceTiming) map.politics.provinceTiming = result.provinceTiming;
  map.politics.metadata = {
    ...(map.politics.metadata || {}),
    ...result.metadata,
    states: result.metadata?.states ?? map.politics.metadata?.states ?? countPoliticalItems(map.politics.states),
    provinces: result.metadata?.provinces ?? map.politics.metadata?.provinces ?? countPoliticalItems(map.politics.provinces),
    regions: map.politics.metadata?.regions ?? countPoliticalItems(map.politics.regions),
    stateNames: result.metadata?.stateNames ?? politicalNames(map.politics.states),
    provinceNames: result.metadata?.provinceNames ?? politicalNames(map.politics.provinces),
    regionNames: map.politics.metadata?.regionNames ?? politicalNames(map.politics.regions)
  };
}

function countPoliticalItems(items = []) {
  return items.filter(item => item && !item.removed && (item.i > 0 || (item.i === undefined && Number.isInteger(item.id)))).length;
}

function politicalNames(items = []) {
  return items.filter(item => item && !item.removed && (item.i > 0 || (item.i === undefined && Number.isInteger(item.id)))).map(item => item.fullName || item.name);
}

function appendGenerationLog(map, message) {
  if (!Array.isArray(map.generationLog)) map.generationLog = [];
  map.generationLog.push(message);
}

function nextRegenerationSalt(map, kind) {
  if (!map.metadata.regeneration || typeof map.metadata.regeneration !== "object") map.metadata.regeneration = {};
  const current = Number(map.metadata.regeneration[kind]) || 0;
  const next = current + 1;
  map.metadata.regeneration[kind] = next;
  return next;
}

function markDerivedStale(map, systems) {
  const stale = {
    systems: [...new Set([...(map?.metadata?.derivedStale?.systems || []), ...systems])],
    updatedAt: new Date().toISOString()
  };
  if (map?.metadata) map.metadata.derivedStale = stale;
  if (map?.military?.metadata) map.military.metadata.stale = stale.systems.includes("military");
  if (map?.zones?.metadata) map.zones.metadata.stale = stale.systems.includes("zones");
  if (map?.markers?.metadata) map.markers.metadata.stale = stale.systems.includes("markers");
  if (map?.economy?.metadata) map.economy.metadata.stale = stale.systems.includes("economy");
}

function markDerivedFresh(map, systems) {
  if (!map?.metadata) return;
  const fresh = new Set(systems);
  const nextSystems = (map.metadata.derivedStale?.systems || []).filter(system => !fresh.has(system));
  if (nextSystems.length) {
    map.metadata.derivedStale = {
      systems: nextSystems,
      updatedAt: new Date().toISOString()
    };
  } else {
    delete map.metadata.derivedStale;
  }
  if (map?.military?.metadata) map.military.metadata.stale = nextSystems.includes("military");
  if (map?.zones?.metadata) map.zones.metadata.stale = nextSystems.includes("zones");
  if (map?.markers?.metadata) map.markers.metadata.stale = nextSystems.includes("markers");
  if (map?.economy?.metadata) map.economy.metadata.stale = nextSystems.includes("economy");
}

function clearGeneratedCityLabelHides(map) {
  const store = ensureLabelStore(map);
  store.hidden[LABEL_TARGET_KIND.CITY] = [];
  store.metadata = {
    custom: store.custom.length,
    hidden: store.hidden[LABEL_TARGET_KIND.CITY].length + store.hidden[LABEL_TARGET_KIND.STATE].length
  };
}

function regenerationResult(kind, status, constraint) {
  const labels = {
    states: "国家",
    provinces: "省份",
    cities: "城镇",
    routes: "道路",
    rivers: "河流"
  };
  return {
    action: labels[kind] || kind,
    status,
    constraint
  };
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

function shouldSwitchDiplomacySubjectForSelection(state) {
  return state.renderer?.getStats?.().colorMode === "diplomacy";
}

function bindMeasurementTool(canvas, state, documentRef) {
  const toggle = documentRef.getElementById("toggle-measurement");
  const clear = documentRef.getElementById("measurement-clear");
  const undo = documentRef.getElementById("measurement-undo");
  const exportButton = documentRef.getElementById("measurement-export");
  toggle?.addEventListener("click", () => {
    state.measurement.active = !state.measurement.active;
    if (!state.measurement.active) {
      state.measurement.pointer = null;
      cancelMeasurementDrag(state, documentRef);
    }
    updateMeasurementOverlay(state, documentRef);
  });
  clear?.addEventListener("click", () => {
    cancelMeasurementDrag(state, documentRef);
    state.measurement.points = [];
    updateMeasurementOverlay(state, documentRef);
  });
  undo?.addEventListener("click", () => undoMeasurementPoint(state, documentRef));
  exportButton?.addEventListener("click", () => exportMeasurement(state, documentRef));

  canvas.addEventListener("pointerdown", event => {
    if (!state.measurement.active || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.measurement.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    capturePointer(canvas, event.pointerId);
  }, true);

  canvas.addEventListener("pointermove", event => {
    const pointer = state.measurement.pointer;
    if (!state.measurement.active || !pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) pointer.moved = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  canvas.addEventListener("pointerup", event => {
    const pointer = state.measurement.pointer;
    if (!state.measurement.active || !pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.measurement.pointer = null;
    releasePointer(canvas, event.pointerId);
    if (pointer.moved || !state.map || !state.renderer) return;
    const point = state.renderer.screenToWorld(event.clientX, event.clientY);
    const measurementPoint = {
      x: clampMeasurementValue(point.x, 0, state.map.metadata.graphWidth),
      y: clampMeasurementValue(point.y, 0, state.map.metadata.graphHeight)
    };
    const insertIndex = shouldInsertMeasurementPoint(event) ? findMeasurementInsertIndex(state, canvas, event) : -1;
    if (insertIndex >= 0) state.measurement.points.splice(insertIndex + 1, 0, measurementPoint);
    else state.measurement.points.push(measurementPoint);
    updateMeasurementOverlay(state, documentRef);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    const pointer = state.measurement.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    state.measurement.pointer = null;
    releasePointer(canvas, event.pointerId);
  }, true);
}

function updateMeasurementOverlay(state, documentRef) {
  const overlay = documentRef.getElementById("measurement-overlay");
  const svg = documentRef.getElementById("measurement-svg");
  const summary = documentRef.getElementById("measurement-summary");
  const clear = documentRef.getElementById("measurement-clear");
  const undo = documentRef.getElementById("measurement-undo");
  const exportButton = documentRef.getElementById("measurement-export");
  const toggle = documentRef.getElementById("toggle-measurement");
  const canvas = documentRef.getElementById("map-canvas");
  if (!overlay || !svg || !summary || !clear || !undo || !exportButton || !toggle || !canvas) return;

  const active = Boolean(state.measurement.active);
  const points = state.measurement.points || [];
  documentRef.body.classList.toggle("measurement-active", active);
  toggle.classList.toggle("active", active);
  toggle.setAttribute("aria-pressed", active ? "true" : "false");
  toggle.textContent = active ? "退出测量" : "测量";
  overlay.hidden = !active;
  clear.disabled = points.length === 0;
  undo.disabled = points.length === 0;
  exportButton.disabled = points.length === 0;
  svg.replaceChildren();
  if (!active) return;

  const rect = canvas.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  const screenPoints = points.map(point => state.renderer.worldToScreen(point.x, point.y, rect));
  if (screenPoints.length >= 3) {
    const polygon = documentRef.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("class", "measurement-area");
    polygon.setAttribute("points", screenPoints.map(point => `${roundMeasurementDisplay(point.x)},${roundMeasurementDisplay(point.y)}`).join(" "));
    svg.append(polygon);
  }
  if (screenPoints.length > 1) {
    const polyline = documentRef.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("class", "measurement-path");
    polyline.setAttribute("points", screenPoints.map(point => `${roundMeasurementDisplay(point.x)},${roundMeasurementDisplay(point.y)}`).join(" "));
    svg.append(polyline);
  }
  for (const [index, point] of screenPoints.entries()) {
    const circle = documentRef.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", measurementPointClass(state, index));
    circle.dataset.measurementPoint = String(index);
    circle.setAttribute("cx", roundMeasurementDisplay(point.x));
    circle.setAttribute("cy", roundMeasurementDisplay(point.y));
    circle.setAttribute("r", "4.5");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("aria-label", `测量点 ${index + 1}`);
    circle.addEventListener("pointerdown", event => handleMeasurementPointPointerDown(event, state, documentRef, index));
    circle.addEventListener("contextmenu", event => event.preventDefault());
    circle.addEventListener("keydown", event => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      event.stopPropagation();
      deleteMeasurementPoint(state, documentRef, index);
    });
    svg.append(circle);
  }

  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const distance = measurementDistance(points);
  const area = points.length >= 3 ? measurementArea(points) : 0;
  summary.textContent = measurementSummary(points.length, distance, area, units);
}

function undoMeasurementPoint(state, documentRef) {
  cancelMeasurementDrag(state, documentRef);
  if (state.measurement.points?.length) state.measurement.points.pop();
  updateMeasurementOverlay(state, documentRef);
}

function handleMeasurementPointPointerDown(event, state, documentRef, index) {
  if (shouldDeleteMeasurementPoint(event)) {
    event.preventDefault();
    event.stopPropagation();
    deleteMeasurementPoint(state, documentRef, index);
    return;
  }
  if (event.button !== 0) return;
  startMeasurementPointDrag(event, state, documentRef, index);
}

function shouldDeleteMeasurementPoint(event) {
  return event.button === 2 || event.altKey || event.shiftKey;
}

function shouldInsertMeasurementPoint(event) {
  return event.button === 0 && (event.altKey || event.shiftKey);
}

function findMeasurementInsertIndex(state, canvas, event) {
  const points = state.measurement.points || [];
  if (!state.renderer || points.length < 2) return -1;
  const rect = canvas.getBoundingClientRect();
  const target = {x: event.clientX - rect.left, y: event.clientY - rect.top};
  const screenPoints = points.map(point => state.renderer.worldToScreen(point.x, point.y, rect));
  const segmentCount = points.length >= 3 ? points.length : points.length - 1;
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const distance = distanceToMeasurementSegment(target, screenPoints[index], screenPoints[nextIndex]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestDistance <= 18 ? bestIndex : -1;
}

function distanceToMeasurementSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clampMeasurementValue(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

function deleteMeasurementPoint(state, documentRef, index) {
  const points = state.measurement.points;
  if (!Array.isArray(points) || index < 0 || index >= points.length) return;
  cancelMeasurementDrag(state, documentRef);
  points.splice(index, 1);
  updateMeasurementOverlay(state, documentRef);
}

function exportMeasurement(state, documentRef) {
  if (!state.map || !state.measurement.points?.length) return;
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const points = state.measurement.points.map((point, index) => ({
    index,
    x: roundMeasurementExport(point.x),
    y: roundMeasurementExport(point.y)
  }));
  const distance = measurementDistance(state.measurement.points);
  const area = state.measurement.points.length >= 3 ? measurementArea(state.measurement.points) : 0;
  const payload = {
    type: "webgl-generator-measurement",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: state.map.metadata?.seed || "",
      checksum: state.map.metadata?.checksum || "",
      graphWidth: state.map.metadata?.graphWidth || 0,
      graphHeight: state.map.metadata?.graphHeight || 0,
      pointCount: points.length
    },
    units: {
      distanceUnit: units.distanceUnit,
      areaUnit: units.areaUnit,
      mapScaleKmPerCm: units.mapScaleKmPerCm
    },
    summary: {
      distanceMapUnits: roundMeasurementExport(distance),
      distanceLabel: formatDisplayDistance(distance, units),
      areaMapUnits: roundMeasurementExport(area),
      areaLabel: points.length >= 3 ? formatDisplayArea(area, units) : ""
    },
    points
  };
  downloadText(documentRef, JSON.stringify(payload, null, 2), `${mapFileBaseName(state.map)}.measurement.json`, "application/json;charset=utf-8");
}

function startMeasurementPointDrag(event, state, documentRef, index) {
  if (!state.measurement.active || !state.map || !state.renderer) return;
  event.preventDefault();
  event.stopPropagation();
  const view = documentRef.defaultView || window;
  const drag = {
    pointerId: event.pointerId,
    index,
    move: moveEvent => {
      if (moveEvent.pointerId !== drag.pointerId) return;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      moveMeasurementPoint(state, moveEvent);
      updateMeasurementOverlay(state, documentRef);
    },
    end: endEvent => {
      if (endEvent.pointerId !== drag.pointerId) return;
      endEvent.preventDefault();
      endEvent.stopPropagation();
      cancelMeasurementDrag(state, documentRef);
      updateMeasurementOverlay(state, documentRef);
    }
  };
  state.measurement.drag = drag;
  moveMeasurementPoint(state, event);
  view.addEventListener("pointermove", drag.move, true);
  view.addEventListener("pointerup", drag.end, true);
  view.addEventListener("pointercancel", drag.end, true);
  updateMeasurementOverlay(state, documentRef);
}

function moveMeasurementPoint(state, event) {
  const drag = state.measurement.drag;
  const point = state.measurement.points?.[drag?.index];
  if (!point || !state.map || !state.renderer) return;
  const world = state.renderer.screenToWorld(event.clientX, event.clientY);
  point.x = clampMeasurementValue(world.x, 0, state.map.metadata.graphWidth);
  point.y = clampMeasurementValue(world.y, 0, state.map.metadata.graphHeight);
}

function cancelMeasurementDrag(state, documentRef) {
  const drag = state.measurement.drag;
  if (!drag) return;
  const view = documentRef.defaultView || window;
  view.removeEventListener("pointermove", drag.move, true);
  view.removeEventListener("pointerup", drag.end, true);
  view.removeEventListener("pointercancel", drag.end, true);
  state.measurement.drag = null;
}

function measurementPointClass(state, index) {
  return state.measurement.drag?.index === index ? "measurement-point dragging" : "measurement-point";
}

function measurementDistance(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}

function measurementArea(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function measurementSummary(pointCount, distance, area, units) {
  if (pointCount === 0) return "点击地图添加起点";
  if (pointCount === 1) return "继续点击添加测量点";
  const distanceText = `${pointCount} 点 / 总长 ${formatDisplayDistance(distance, units)}`;
  if (pointCount < 3) return distanceText;
  return `${distanceText} / 面积 ${formatDisplayArea(area, units)}`;
}

function clampMeasurementValue(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function roundMeasurementDisplay(value) {
  return Math.round(value * 10) / 10;
}

function roundMeasurementExport(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function bindHeightEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.panels.height?.getBrush().active || !state.map) return;
    if (!isPrimaryPointerDown(event)) return;
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
    if (!isPrimaryPointerDown(event)) return;
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
    if (!isPrimaryPointerDown(event)) return;
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

function bindMarkerEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.markerEdit.mode || !state.map) return;
    if (!isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const packCell = getMarkerPackCellAtEvent(state, event);
    if (!Number.isInteger(packCell)) return;

    const command = state.markerEdit.mode === "move"
      ? createMoveMarkerCommand(state.markerEdit.markerId, packCell)
      : createAddMarkerCommand({type: state.markerEdit.type, packCell});
    const selectedMarkerId = state.markerEdit.mode === "move" ? state.markerEdit.markerId : null;
    const executed = applyMarkerCollectionCommand(state, documentRef, command, {selectCreated: state.markerEdit.mode !== "move", selectMarkerId: selectedMarkerId});
    if (!executed) return;
    state.markerEdit.lastPackCell = packCell;
    stopMarkerEditMode(state, documentRef);
  }, true);
}

function bindEditingInteractionLock(canvas, state) {
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"]) {
    canvas.addEventListener(eventName, event => {
      if (!isEditingInteractionLocked(state)) return;
      if (isMouseButtonNavigationEvent(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
}

function isPrimaryPointerDown(event) {
  return event.button === 0;
}

function isMouseButtonNavigationEvent(event) {
  if (!event.type?.startsWith("pointer") || event.pointerType !== "mouse") return false;
  if (event.type === "pointermove") return (event.buttons & 6) !== 0;
  if (event.type === "pointercancel") return true;
  return event.button === 1 || event.button === 2;
}

function startMarkerEditMode(state, documentRef, {mode, type = "mines", markerId = null} = {}) {
  state.panels.height?.setActive(false);
  state.panels.state?.setActive(false);
  state.panels.province?.setActive(false);
  state.heightEdit.activeStroke = null;
  state.stateEdit.activeStroke = null;
  state.provinceEdit.activeStroke = null;
  state.markerEdit.mode = mode || null;
  state.markerEdit.type = type || state.markerEdit.type || "mines";
  state.markerEdit.markerId = Number.isInteger(markerId) ? markerId : null;
  state.markerEdit.lastPackCell = null;
  updateMarkerPanel(state);
  updateEditingInteractionLock(state, documentRef);
}

function stopMarkerEditMode(state, documentRef) {
  clearMarkerEditMode(state);
  updateMarkerPanel(state);
  updateEditingInteractionLock(state, documentRef);
}

function clearMarkerEditMode(state) {
  state.markerEdit.mode = null;
  state.markerEdit.markerId = null;
  state.markerEdit.lastPackCell = null;
}

function applyMarkerCollectionCommand(state, documentRef, command, {selectCreated = false, selectMarkerId = null} = {}) {
  if (!state.map || !command || command.isNoop?.({map: state.map})) return null;
  const executed = state.editHistory.execute(command, {map: state.map});
  markDerivedFresh(state.map, ["markers", "economy"]);
  markDerivedStale(state.map, ["military", "diplomacy"]);
  refreshGenerationSummary(state.map);
  refreshAfterEdit(state, executed);

  const created = selectCreated ? command.getCreatedMarker?.() : null;
  const markerId = Number.isInteger(selectMarkerId) ? selectMarkerId : created?.id;
  if (Number.isInteger(markerId) && state.map.markers?.markers?.[markerId]) {
    state.selectionStore.setSelection({object: {kind: OBJECT_KIND.MARKER, id: markerId}});
    state.panels.marker?.setSelectedMarkerId(markerId);
  }

  updateMarkerPanel(state);
  updateStatePanel(state);
  updateProvincePanel(state);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return executed;
}

function getMarkerPackCellAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  if (Number.isInteger(pick?.packCell) && pick.packCell >= 0) return pick.packCell;
  const world = pick ? {x: pick.worldX, y: pick.worldY} : state.renderer.screenToWorld(event.clientX, event.clientY);
  const maxDistance = typeof state.renderer.pickThresholdWorld === "function" ? state.renderer.pickThresholdWorld(18) : 28;
  return nearestPackCell(state.map, world, maxDistance);
}

function nearestPackCell(map, point, maxDistance) {
  if (!map?.pack?.cells?.p || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  let bestCell = null;
  let bestDistanceSq = maxDistance * maxDistance;
  for (const packCell of map.pack.cells.i || []) {
    const cellPoint = map.pack.cells.p[packCell];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > bestDistanceSq) continue;
    bestDistanceSq = distanceSq;
    bestCell = packCell;
  }
  return bestCell;
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
  if (!brush.active || !stroke || brush.targetStateId === null || brush.targetStateId === undefined || brush.targetStateId < 0) return;

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
  if (!brush.active || !stroke || brush.targetProvinceId === null || brush.targetProvinceId === undefined || brush.targetProvinceId < 0) return;

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
  const eraseProvince = brush.targetProvinceId === 0;
  if (!eraseProvince && !targetStateId) return affected;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    if (!isGridLandCell(map, gridCell)) continue;
    if (!eraseProvince && cells.state[gridCell] !== targetStateId) continue;
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
    graphWidth: state.options?.graphWidth,
    graphHeight: state.options?.graphHeight,
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

function updateDiplomacyPanel(state) {
  state.panels.diplomacy?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateMilitaryPanel(state) {
  state.panels.military?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateMarkerPanel(state) {
  state.panels.marker?.update(state.map, state.selection, state.editHistory.getStats());
  state.panels.marker?.updateEditMode?.(state.markerEdit);
}

function updateLabelNamingPanel(state) {
  state.panels.labelNaming?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateNotesPanel(state) {
  state.panels.notes?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateAllObjectPanels(state) {
  updateStatePanel(state);
  updateProvincePanel(state);
  updateCityPanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateMilitaryPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  state.panels.route?.update(state.map, state.selection, state.editHistory.getStats());
  state.panels.river?.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
  updateNotesPanel(state);
}

function labelKeyForObject(object) {
  if (!object?.kind) return null;
  if (object.kind === OBJECT_KIND.LABEL) return `${object.targetKind || OBJECT_KIND.CITY}:${object.targetId ?? object.id}`;
  if (object.kind === OBJECT_KIND.CITY || object.kind === OBJECT_KIND.STATE) return `${object.kind}:${object.id}`;
  return null;
}

function routeDisplayName(map, route, routeId) {
  if (!route) return `路线 #${routeId}`;
  const from = map?.settlements?.cities?.[route.from]?.name || (route.from >= 0 ? `#${route.from}` : "");
  const to = map?.settlements?.cities?.[route.to]?.name || (route.to >= 0 ? `#${route.to}` : "");
  if (from && to) return `${from} -> ${to}`;
  return `路线 #${routeId}`;
}

function getNewLabelPoint(state) {
  if (Number.isFinite(state.pick?.worldX) && Number.isFinite(state.pick?.worldY)) {
    return {x: state.pick.worldX, y: state.pick.worldY};
  }
  const object = state.selection?.object;
  if (object?.kind === OBJECT_KIND.CITY) {
    const city = state.map?.settlements?.cities?.[object.id];
    if (city) return {x: city.x, y: city.y};
  }
  if (object?.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.CUSTOM) {
    const label = (state.map?.labels?.custom || []).find(item => item.id === (object.targetId ?? object.id));
    if (label) return {x: label.x, y: label.y};
  }
  return {
    x: (state.map?.metadata?.graphWidth || 1440) / 2,
    y: (state.map?.metadata?.graphHeight || 960) / 2
  };
}

function setStatePanelTarget(state, stateId) {
  if (!Number.isInteger(stateId) || stateId < 0) return;
  state.panels.state?.setTargetStateId(stateId);
  updateStatePanel(state);
}

function getStateIdFromSelection(state) {
  const object = state.selection?.object;
  if (object?.kind === OBJECT_KIND.STATE) return object.id;
  if (Number.isInteger(object?.stateId)) return object.stateId;
  return null;
}

function getStateIdFromPick(state) {
  if (Number.isInteger(state.pick?.gridCell)) return state.map.grid.cells.state[state.pick.gridCell] ?? null;
  if (state.pick?.politicalObject?.kind === OBJECT_KIND.STATE) return state.pick.politicalObject.id;
  return null;
}

function getStateIdAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  if (Number.isInteger(pick?.gridCell) && pick.gridCell >= 0) {
    return state.map.grid.cells.state[pick.gridCell] ?? null;
  }
  return null;
}

function setProvincePanelTarget(state, provinceId) {
  if (!Number.isInteger(provinceId) || provinceId < 0) return;
  state.panels.province?.setSelectedProvinceId(provinceId);
  updateProvincePanel(state);
}

function getProvinceIdFromSelection(state) {
  const object = state.selection?.object;
  if (object?.kind === OBJECT_KIND.PROVINCE) return object.id;
  if (Number.isInteger(object?.provinceId)) return object.provinceId;
  if (object?.kind === OBJECT_KIND.CITY) return state.map?.settlements?.cities?.[object.id]?.province || null;
  return null;
}

function getProvinceIdFromPick(state) {
  if (Number.isInteger(state.pick?.gridCell)) return state.map.grid.cells.province[state.pick.gridCell] ?? null;
  if (state.pick?.politicalObject?.kind === OBJECT_KIND.PROVINCE) return state.pick.politicalObject.id;
  return null;
}

function getProvinceIdAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  if (Number.isInteger(pick?.gridCell) && pick.gridCell >= 0) {
    return state.map.grid.cells.province[pick.gridCell] ?? null;
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
  return Boolean(state.panels.height?.getBrush().active || state.panels.state?.getBrush().active || state.panels.province?.getBrush().active || state.markerEdit.mode || state.editingObject);
}

function getAllowedEditingPanelIds(state) {
  if (state.panels.height?.getBrush().active) return ["height-panel"];
  if (state.panels.state?.getBrush().active) return ["state-panel"];
  if (state.panels.province?.getBrush().active) return ["province-panel"];
  if (state.markerEdit.mode) return ["marker-panel"];
  if (state.editingObject?.kind === OBJECT_KIND.RIVER) return ["river-panel"];
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
    marker: {
      mode: state.markerEdit.mode,
      type: state.markerEdit.type,
      markerId: state.markerEdit.markerId,
      lastPackCell: state.markerEdit.lastPackCell
    },
    history: state.editHistory.getStats(),
    lastEditRefresh: state.lastEditRefresh
  };
}

function getActiveEditorKind(state, heightBrush, stateBrush, provinceBrush) {
  if (heightBrush.active) return "height";
  if (stateBrush.active) return "state";
  if (provinceBrush.active) return "province";
  if (state.markerEdit.mode) return `marker:${state.markerEdit.mode}`;
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
