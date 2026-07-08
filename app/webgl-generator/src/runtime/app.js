import {defineBiomesAndPopulation} from "../generator/biomes.js";
import {buildClimate} from "../generator/climate.js";
import {createGenerationSummary, generatePlaceholderMap} from "../generator/index.js";
import {createLegacyNamebaseText, createNamebaseDocument, createNamebaseImportPreview, NAMEBASE_BINDING_TARGETS, parseNamebaseDocument} from "../generator/namebase-store.js";
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
import {createEconomyPanel} from "../ui/panels/economy-panel.js";
import {createGenerationPanel} from "../ui/panels/generation-panel.js";
import {createGovernmentPanel} from "../ui/panels/government-panel.js";
import {createHeightPanel} from "../ui/panels/height-panel.js";
import {createLabelNamingPanel} from "../ui/panels/label-naming-panel.js";
import {createLakePanel} from "../ui/panels/lake-panel.js";
import {createMarkerPanel} from "../ui/panels/marker-panel.js";
import {createMeasurementPanel} from "../ui/panels/measurement-panel.js";
import {createMilitaryPanel} from "../ui/panels/military-panel.js";
import {createNamebasePanel} from "../ui/panels/namebase-panel.js";
import {createNotesPanel} from "../ui/panels/notes-panel.js";
import {createObjectDetailsPanel} from "../ui/panels/object-details-panel.js";
import {createProvincePanel} from "../ui/panels/province-panel.js";
import {createReligionPanel} from "../ui/panels/religion-panel.js";
import {createRiverPanel} from "../ui/panels/river-panel.js";
import {createRoutePanel} from "../ui/panels/route-panel.js";
import {createStatePanel} from "../ui/panels/state-panel.js";
import {createZonePanel} from "../ui/panels/zone-panel.js";
import {scheduleLazyVuePanelPreload} from "../ui/panels/lazy-vue-panel.js";
import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {createEditRefreshScheduler} from "./edit-refresh-scheduler.js";
import {createImportFmgCellsHeightCommand} from "./fmg-cells-geojson-import.js";
import {EditHistory} from "./edit-history.js";
import {createGrayscaleHeightmapFromImage, createPaletteHeightmapFromImage, normalizeHeightmapImportPayload} from "./heightmap-import.js";
import {createMapDocument, createMapFeatureGeoJson, createMapGeoJson, downloadCanvasPng, downloadText, mapFileBaseName, parseGeoJsonMeasurements, parseMapDocument, stringifyMapDocument} from "./map-file-io.js";
import {createAddCityAtCellCommand, createDeleteCityCommand, createRenameCitiesFromNamebaseCommand, createResetCityVisualCommand, createSetCityNoteCommand, createSetCityPopulationCommand, createSetCityVisualCommand, createSyncCityOwnerToCellCommand} from "./city-edit-commands.js";
import {createSetCultureColorCommand, createSetCultureParentCommand} from "./culture-edit-commands.js";
import {createRegenerateDiplomacyCommand, createSetDiplomacyRelationCommand} from "./diplomacy-edit-commands.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "./height-edit-commands.js";
import {createAddCustomLabelCommand, createDeleteLabelCommand, createMoveCustomLabelCommand, createRenameCustomLabelCommand, createRestoreGeneratedLabelCommand, createSetLabelNoteCommand, ensureLabelStore} from "./label-edit-commands.js";
import {createAddMarkerCommand, createDeleteMarkerCommand, createMoveMarkerCommand, createRegenerateResourceMarkersCommand, createSetMarkerNoteCommand, createSetMarkerVisualCommand} from "./marker-edit-commands.js";
import {createDeleteMeasurementCommand, createImportMeasurementsCommand, createRenameMeasurementCommand, createSaveMeasurementCommand, createUpdateMeasurementPointsCommand} from "./measurement-edit-commands.js";
import {ensureMeasurementStore, findMeasurement, measurementArea, measurementBounds, measurementDisplayPoints, measurementDistance, normalizeMeasurementCellStops} from "./measurement-objects.js";
import {findNearestRouteMeasurementPoint, MEASUREMENT_ROUTE_FIT_NONE, MEASUREMENT_ROUTE_FIT_ROADS, normalizeMeasurementRouteFit} from "./measurement-route-fit.js";
import {createClearMilitaryBattleEventsCommand, createImportMilitaryBattleEventsCommand, createMoveMilitaryStationCommand, createRecordMilitaryBattleEventCommand, createRenameMilitaryRegimentCommand, createSetMilitaryBaseCommand, createSetMilitaryRatiosCommand, createSetMilitaryStatusBatchCommand, createSetMilitaryStatusCommand} from "./military-edit-commands.js";
import {createClearUserNamebasesCommand, createCopyBuiltinNamebaseCommand, createCreateUserNamebaseCommand, createDeleteUserNamebaseCommand, createImportNamebasesCommand, createRenameUserNamebaseCommand, createSetNamebaseBindingCommand, createUpdateUserNamebaseOptionsCommand, createUpdateUserNamebaseSourceCommand} from "./namebase-edit-commands.js";
import {createDeleteNoteCommand} from "./note-edit-commands.js";
import {createRenameObjectCommand, createSetObjectNoteCommand, createSetProvinceColorCommand, createSetStateCapitalCommand} from "./object-edit-commands.js";
import {createRenameLakesFromNamebaseCommand} from "./lake-edit-commands.js";
import {applyProvinceBrushPreview, createAddProvinceAtCellCommand, createApplyProvinceBrushCommand, createDeleteProvinceCommand, PROVINCE_BRUSH_PREVIEW_EFFECTS} from "./province-edit-commands.js";
import {createSetReligionColorCommand, createSetReligionParentCommand} from "./religion-edit-commands.js";
import {resolveObject} from "./object-resolver.js";
import {createRenameRiversFromNamebaseCommand, createSetRiverNoteCommand, createSetRiverWidthFactorCommand} from "./river-edit-commands.js";
import {createSetRouteNoteCommand} from "./route-edit-commands.js";
import {SelectionStore} from "./selection-store.js";
import {applyStateBrushPreview, createAddStateAtCellCommand, createApplyStateBrushCommand, createDeleteStateCommand, createRenameStatesFromNamebaseCommand, createSetStateColorCommand, createSetStateGovernmentCommand, createSetStatesGovernmentBatchCommand, STATE_BRUSH_PREVIEW_EFFECTS} from "./state-edit-commands.js";
import {createSetZoneStyleCommand} from "./zone-edit-commands.js";
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
const NAMEBASE_PREFERENCES_STORAGE_KEY = "webgl-generator-namebase-preferences-v1";
const BROWSER_MAP_STORAGE_KEY = "webgl-generator-current-map-v1";
const BROWSER_MAP_STORAGE_TYPE = "webgl-generator-local-map-storage";
const CLIMATE_OPTION_KEYS = Object.freeze([
  "climateLatitudeMode",
  "climateLatitudeCenter",
  "climateLatitudeSpan",
  "climateMapSizePercent",
  "climateLatitudeRangePercent",
  "climateLongitudeRangePercent",
  "atmosphereDirection",
  "winds",
  "temperatureEquator",
  "temperatureNorthPole",
  "temperatureSouthPole"
]);

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
      addMode: false,
      deleteMode: false,
      lastAffected: 0,
      sourceStateId: null,
      lastPointer: null
    },
    provinceEdit: {
      activeStroke: null,
      addMode: false,
      deleteMode: false,
      lastAffected: 0,
      sourceProvinceId: null,
      lastPointer: null
    },
    cityEdit: {
      addMode: false,
      deleteMode: false,
      lastCreatedCityId: null
    },
    markerEdit: {
      mode: null,
      type: "mines",
      markerId: null,
      lastPackCell: null
    },
    customLabelDrag: null,
    pendingCustomLabelPlacement: null,
    measurement: {
      active: false,
      points: [],
      pointer: null,
      drag: null,
      routeFit: MEASUREMENT_ROUTE_FIT_NONE,
      notice: "",
      editingMeasurementId: null
    },
    lastEditRefresh: null,
    selectionStore: null,
    renderer: null,
    panelManager,
    pendingGenerateId: 0,
    heightmapImportId: 0,
    healthMonitor,
    lazyPanelPreloadScheduled: false,
    panels: {}
  };
  let selectionStore = null;
  const generationPanel = createGenerationPanel(documentRef, panelManager);
  state.panels.generation = generationPanel;
  state.panels.development = createDevelopmentPanel(documentRef, panelManager);
  let heightPanel = null;
  let statePanel = null;
  let governmentPanel = null;
  let provincePanel = null;
  let cityPanel = null;
  let culturePanel = null;
  let religionPanel = null;
  let diplomacyPanel = null;
  let economyPanel = null;
  let militaryPanel = null;
  let riverPanel = null;
  let lakePanel = null;
  let routePanel = null;
  let zonePanel = null;
  let markerPanel = null;
  let labelNamingPanel = null;
  let namebasePanel = null;
  let notesPanel = null;
  let measurementPanel = null;
  let suppressNextRiverPanelOpen = false;
  let selectionSourcePanelId = null;
  const selectFromPanel = (panelId, object) => {
    selectionSourcePanelId = panelId;
    try {
      selectionStore.setSelection({object});
    } finally {
      selectionSourcePanelId = null;
    }
  };
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
      updateLakePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameFromNamebase: object => {
      renameSelectedObjectFromNamebase(state, documentRef, object);
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
        if (state.editingObject?.kind === OBJECT_KIND.STATE) selectionStore.stopEditing();
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
      selectFromPanel("state-panel", object);
      setStatePanelTarget(state, object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      setStatePanelTarget(state, object.id);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      selectionStore.startEditing(object);
      setStatePanelTarget(state, object.id);
      renderer.setColorMode("states");
      setActiveModeButton(documentRef, "states");
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onAddMode: active => {
      state.stateEdit.addMode = Boolean(active);
      if (active) {
        state.stateEdit.deleteMode = false;
        if (state.editingObject?.kind === OBJECT_KIND.STATE) selectionStore.stopEditing();
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        clearMarkerEditMode(state);
        renderer.setColorMode("states");
        setActiveModeButton(documentRef, "states");
      }
      state.panels.state.updateAddMode?.(state.stateEdit.addMode);
      state.panels.state.updateDeleteMode?.(state.stateEdit.deleteMode);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onDeleteMode: active => {
      state.stateEdit.deleteMode = Boolean(active);
      if (active) {
        state.stateEdit.addMode = false;
        if (state.editingObject?.kind === OBJECT_KIND.STATE) selectionStore.stopEditing();
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.provinceEdit.activeStroke = null;
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
        renderer.setColorMode("states");
        setActiveModeButton(documentRef, "states");
      }
      state.panels.state.updateAddMode?.(state.stateEdit.addMode);
      state.panels.state.updateDeleteMode?.(state.stateEdit.deleteMode);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onDeleteState: stateId => {
      const command = createDeleteStateCommand(stateId);
      if (command.isNoop({map: state.map})) return;
      refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
      state.selectionStore.clear();
      state.panels.state.setTargetStateId(0);
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, documentRef);
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
    onRenameVisibleFromNamebase: stateIds => {
      const context = {map: state.map};
      const command = createRenameStatesFromNamebaseCommand(stateIds);
      if (!command.isNoop(context)) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, context));
        const result = command.getResult?.();
        setFileOperationStatus(documentRef, `已按当前名称库重命名 ${result?.renamed || 0} 个国家。`);
      } else {
        setFileOperationStatus(documentRef, "当前筛选国家没有可按名称库更新的名称。");
      }
      updateStatePanel(state);
      updateCityPanel(state);
      updateGovernmentPanel(state);
      updateDiplomacyPanel(state);
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
    onGovernmentChange: (stateId, governmentKey) => {
      const context = {map: state.map};
      const command = createSetStateGovernmentCommand(stateId, governmentKey);
      if (!command.isNoop(context)) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateGovernmentPanel(state);
      updateDiplomacyPanel(state);
      updateMilitaryPanel(state);
      updateRuntimePanel(documentRef, state);
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
  governmentPanel = createGovernmentPanel(documentRef, panelManager, {
    onSelectState: object => {
      selectFromPanel("government-panel", object);
      setStatePanelTarget(state, object.id);
    },
    onLocateState: object => {
      locateObject(state, object, documentRef);
      setStatePanelTarget(state, object.id);
    },
    onOpenState: object => {
      selectionStore.setSelection({object});
      setStatePanelTarget(state, object.id);
      state.panels.state.open(state.map, state.editHistory.getStats());
    },
    onOpenDiplomacy: object => {
      selectionStore.setSelection({object});
      setStatePanelTarget(state, object.id);
      setDiplomacyThemeSubject(state, documentRef, object.id);
      state.panels.diplomacy.open(state.map, state.selection, state.editHistory.getStats());
      updateDiplomacyPanel(state);
    },
    onBatchGovernmentChange: (stateIds, governmentKey) => {
      const context = {map: state.map};
      const command = createSetStatesGovernmentBatchCommand(stateIds, governmentKey);
      if (!command.isNoop(context)) {
        refreshAfterStateEdit(state, state.editHistory.execute(command, context));
      }
      updateStatePanel(state);
      updateGovernmentPanel(state);
      updateDiplomacyPanel(state);
      updateMilitaryPanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterStateEdit(state, command);
      updateStatePanel(state);
      updateGovernmentPanel(state);
      updateDiplomacyPanel(state);
      updateMilitaryPanel(state);
      updateRuntimePanel(documentRef, state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterStateEdit(state, command);
      updateStatePanel(state);
      updateGovernmentPanel(state);
      updateDiplomacyPanel(state);
      updateMilitaryPanel(state);
      updateRuntimePanel(documentRef, state);
    }
  });
  state.panels.government = governmentPanel;
  provincePanel = createProvincePanel(documentRef, panelManager, {
    onActiveChange: active => {
      state.provinceEdit.addMode = false;
      state.provinceEdit.deleteMode = false;
      provincePanel?.updateAddMode?.(false);
      provincePanel?.updateDeleteMode?.(false);
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
        if (state.editingObject?.kind === OBJECT_KIND.PROVINCE) selectionStore.stopEditing();
        updateEditingInteractionLock(state, documentRef);
      }
    },
    onAddMode: active => {
      state.provinceEdit.addMode = Boolean(active);
      if (active) {
        state.provinceEdit.deleteMode = false;
        if (state.editingObject?.kind === OBJECT_KIND.PROVINCE) selectionStore.stopEditing();
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.stateEdit.activeStroke = null;
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
        renderer.setColorMode("provinces");
        setActiveModeButton(documentRef, "provinces");
      }
      provincePanel?.updateAddMode?.(state.provinceEdit.addMode);
      provincePanel?.updateDeleteMode?.(state.provinceEdit.deleteMode);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onDeleteMode: active => {
      state.provinceEdit.deleteMode = Boolean(active);
      if (active) {
        state.provinceEdit.addMode = false;
        if (state.editingObject?.kind === OBJECT_KIND.PROVINCE) selectionStore.stopEditing();
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.stateEdit.activeStroke = null;
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
        renderer.setColorMode("provinces");
        setActiveModeButton(documentRef, "provinces");
      }
      provincePanel?.updateAddMode?.(state.provinceEdit.addMode);
      provincePanel?.updateDeleteMode?.(state.provinceEdit.deleteMode);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onDeleteProvince: provinceId => {
      const command = createDeleteProvinceCommand(provinceId);
      if (command.isNoop({map: state.map})) return;
      refreshAfterProvinceEdit(state, state.editHistory.execute(command, {map: state.map}));
      state.selectionStore.clear();
      provincePanel.setSelectedProvinceId(0);
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onSampleSelection: () => {
      setProvincePanelTarget(state, getProvinceIdFromSelection(state));
    },
    onSampleHover: () => {
      setProvincePanelTarget(state, getProvinceIdFromPick(state));
    },
    onSelect: object => {
      selectFromPanel("province-panel", object);
      provincePanel.setSelectedProvinceId(object.id);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      provincePanel.setSelectedProvinceId(object.id);
    },
    onEdit: object => {
      selectionStore.setSelection({object});
      selectionStore.startEditing(object);
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
      selectFromPanel("city-panel", object);
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
    onRenameVisibleFromNamebase: cityIds => {
      const context = {map: state.map};
      const command = createRenameCitiesFromNamebaseCommand(cityIds);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
        const result = command.getResult?.();
        setFileOperationStatus(documentRef, `已按当前名称库重命名 ${result?.renamed || 0} 个城市。`);
      } else {
        setFileOperationStatus(documentRef, "当前筛选城市没有可按名称库更新的名称。");
      }
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onAddMode: active => {
      state.cityEdit.addMode = Boolean(active);
      if (active) {
        state.cityEdit.deleteMode = false;
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.stateEdit.activeStroke = null;
        state.provinceEdit.activeStroke = null;
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
        renderer.setColorMode("states");
        setActiveModeButton(documentRef, "states");
      }
      cityPanel.updateAddMode?.(state.cityEdit.addMode);
      cityPanel.updateDeleteMode?.(state.cityEdit.deleteMode);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onDeleteMode: active => {
      state.cityEdit.deleteMode = Boolean(active);
      if (active) {
        state.cityEdit.addMode = false;
        heightPanel?.setActive(false);
        statePanel?.setActive(false);
        provincePanel?.setActive(false);
        state.heightEdit.activeStroke = null;
        state.stateEdit.activeStroke = null;
        state.provinceEdit.activeStroke = null;
        clearMarkerEditMode(state);
        updateMarkerPanel(state);
        renderer.setColorMode("states");
        setActiveModeButton(documentRef, "states");
      }
      cityPanel.updateAddMode?.(state.cityEdit.addMode);
      cityPanel.updateDeleteMode?.(state.cityEdit.deleteMode);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
    },
    onDeleteCity: cityId => {
      const command = createDeleteCityCommand(cityId);
      if (command.isNoop({map: state.map})) return;
      refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      state.selectionStore.clear();
      cityPanel.setSelectedCityId(null);
      updateStatePanel(state);
      updateProvincePanel(state);
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
      selectFromPanel("culture-panel", object);
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
    onNamebaseBinding: cultureId => {
      state.panels.namebase.open(state.map, {cultureId, history: state.editHistory.getStats()});
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
      selectFromPanel("religion-panel", object);
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
      selectFromPanel("diplomacy-panel", object);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onOpenState: object => {
      selectionStore.setSelection({object});
      setStatePanelTarget(state, object.id);
      state.panels.state.open(state.map, state.editHistory.getStats());
      updateStatePanel(state);
    },
    onRelationChange: (subjectId, objectId, relation, reason) => {
      const command = createSetDiplomacyRelationCommand(subjectId, objectId, relation, {reason});
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
  economyPanel = createEconomyPanel(documentRef, panelManager, {
    onLocate: object => {
      locateObject(state, object, documentRef);
    }
  });
  state.panels.economy = economyPanel;
  militaryPanel = createMilitaryPanel(documentRef, panelManager, {
    onSelect: object => {
      selectFromPanel("military-panel", object);
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
    onStatusApply: (target, status) => {
      const command = createSetMilitaryStatusCommand(target, status);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `update military status: regiment=${target.id}, status=${status}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBatchStatusApply: (targets, status) => {
      const command = createSetMilitaryStatusBatchCommand(targets, status);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `batch update military status: count=${targets.length}, status=${status}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onStationApply: (target, destination) => {
      const command = createMoveMilitaryStationCommand(target, destination);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `move military station: regiment=${target.id}, cell=${destination.cell}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBaseApply: target => {
      const command = createSetMilitaryBaseCommand(target);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `set military base: regiment=${target.id}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBattleEventApply: (target, event) => {
      const command = createRecordMilitaryBattleEventCommand(target, event);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `record military battle event: regiment=${target.id}, type=${event.type}, outcome=${event.outcome}, apply=${event.applyResult ? "yes" : "no"}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBattleEventsImport: file => importMilitaryBattleEvents(state, documentRef, file),
    onBattleEventsClear: (target, eventIds = null) => {
      const command = createClearMilitaryBattleEventsCommand(target, {
        eventIds,
        label: eventIds?.length ? "清空筛选战斗事件" : "清空军团战斗事件"
      });
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `clear military battle events: regiment=${target.id}, scope=${eventIds?.length ? "filtered" : "selected"}`);
      }
      updateMilitaryPanel(state);
      updateStatePanel(state);
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRename: (target, name) => {
      const command = createRenameMilitaryRegimentCommand(target, name);
      if (!command.isNoop({map: state.map})) {
        refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `rename military regiment: regiment=${target.id}, name=${name}`);
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
      selectFromPanel("route-panel", object);
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
      selectFromPanel("marker-panel", object);
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
      selectFromPanel("label-naming-panel", object);
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
        state.pendingCustomLabelPlacement = {labelId: created.id, command};
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
    onExportLegacy: () => exportLegacyNamebases(state, documentRef),
    onImportPreview: (file, mode) => previewNamebaseImport(state, documentRef, file, mode),
    onImport: (file, mode) => importNamebases(state, documentRef, file, mode),
    onCreateUser: () => createManualNamebase(state, documentRef),
    onCopyBuiltin: row => copyBuiltinNamebase(state, documentRef, row),
    onRenameUser: (row, name) => renameImportedNamebase(state, documentRef, row, name),
    onUpdateSource: (row, sourceText) => updateImportedNamebaseSource(state, documentRef, row, sourceText),
    onUpdateOptions: (row, options) => updateImportedNamebaseOptions(state, documentRef, row, options),
    onDeleteUser: row => deleteImportedNamebase(state, documentRef, row),
    onClearUser: () => clearImportedNamebases(state, documentRef),
    onSetGlobalBinding: (target, value) => setGlobalNamebaseBinding(state, documentRef, target, value),
    onSetCultureBinding: (cultureId, target, value) => setCultureNamebaseBinding(state, documentRef, cultureId, target, value),
    onUndo: () => undoNamebaseEdit(state, documentRef),
    onRedo: () => redoNamebaseEdit(state, documentRef)
  });
  state.panels.namebase = namebasePanel;
  notesPanel = createNotesPanel(documentRef, panelManager, {
    onSelect: row => {
      if (!row?.object || row.orphan) return;
      selectFromPanel("notes-panel", row.object);
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
  measurementPanel = createMeasurementPanel(documentRef, panelManager, {
    onLocate: row => {
      locateMeasurement(state, row, documentRef);
    },
    onEdit: row => {
      startMeasurementObjectEdit(state, row, documentRef);
    },
    onRename: (measurementId, name) => {
      const context = {map: state.map};
      const command = createRenameMeasurementCommand(measurementId, name);
      if (!command.isNoop(context)) refreshAfterEdit(state, state.editHistory.execute(command, context));
      updateMeasurementPanel(state);
      updateMeasurementOverlay(state, documentRef);
    },
    onDelete: row => {
      const context = {map: state.map};
      const command = createDeleteMeasurementCommand(row.id);
      if (!command.isNoop(context)) refreshAfterEdit(state, state.editHistory.execute(command, context));
      if (state.measurement.editingMeasurementId === row.id) {
        state.measurement.editingMeasurementId = null;
        state.measurement.points = [];
        cancelMeasurementDrag(state, documentRef);
      }
      updateMeasurementPanel(state);
      updateMeasurementOverlay(state, documentRef);
      setFileOperationStatus(documentRef, `已删除测量对象 ${row.name || row.id}。`);
    },
    onExport: rows => {
      exportMeasurementObjects(state, documentRef, rows);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateMeasurementPanel(state);
      updateMeasurementOverlay(state, documentRef);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateMeasurementPanel(state);
      updateMeasurementOverlay(state, documentRef);
    }
  });
  state.panels.measurement = measurementPanel;
  riverPanel = createRiverPanel(documentRef, panelManager, {
    onSelect: object => {
      riverPanel.setSelection({object}, state.editingObject);
      selectFromPanel("river-panel", object);
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
    onRenameVisibleFromNamebase: riverIds => {
      const context = {map: state.map};
      const command = createRenameRiversFromNamebaseCommand(riverIds);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
        const result = command.getResult?.();
        setFileOperationStatus(documentRef, `已按当前名称库重命名 ${result?.renamed || 0} 条河流。`);
      } else {
        setFileOperationStatus(documentRef, "当前筛选河流没有可按名称库更新的名称。");
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
  lakePanel = createLakePanel(documentRef, panelManager, {
    onSelect: object => {
      lakePanel.setSelection({object});
      selectFromPanel("lake-panel", object);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
    },
    onRename: (lakeId, name) => {
      const object = {kind: OBJECT_KIND.LAKE, id: lakeId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateLakePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: lakeIds => {
      const context = {map: state.map};
      const command = createRenameLakesFromNamebaseCommand(lakeIds);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
        const result = command.getResult?.();
        setFileOperationStatus(documentRef, `已按当前名称库重命名 ${result?.renamed || 0} 个湖泊。`);
      } else {
        setFileOperationStatus(documentRef, "当前筛选湖泊没有可按名称库更新的名称。");
      }
      updateLakePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateLakePanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateLakePanel(state);
    }
  });
  state.panels.lake = lakePanel;
  zonePanel = createZonePanel(documentRef, panelManager, {
    onSelect: object => {
      zonePanel.setSelection({object});
      selectFromPanel("zone-panel", object);
    },
    onLocate: object => {
      locateObject(state, object, documentRef);
      zonePanel.setSelection({object});
    },
    onStyleChange: (zoneId, patch) => {
      const context = {map: state.map};
      const command = createSetZoneStyleCommand(zoneId, patch);
      if (!command.isNoop(context)) {
        refreshAfterEdit(state, state.editHistory.execute(command, context));
      }
      updateZonePanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const command = state.editHistory.undo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateZonePanel(state);
    },
    onRedo: () => {
      const command = state.editHistory.redo({map: state.map});
      if (command) refreshAfterEdit(state, command);
      updateZonePanel(state);
    }
  });
  state.panels.zone = zonePanel;
  const renderer = new PlaceholderMapRenderer(canvas, () => {
    if (state.map) {
      updateRuntimePanel(documentRef, state);
      if (!renderer.getStats?.()?.overlay?.interactionSuspended) updateMeasurementOverlay(state, documentRef);
    }
  }, pick => {
    state.pick = pick;
    updatePickPanel(documentRef, state);
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
      sourcePanelId: selectionSourcePanelId,
      clearRiverSuppressor: () => {
        suppressNextRiverPanelOpen = false;
      }
    });
    if (!handled) {
      state.panels.objectDetails.show(selection, editingObject);
    }
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
  bindCityEditing(canvas, state, documentRef);
  bindMarkerEditing(canvas, state, documentRef);
  bindCustomLabelDrag(state, documentRef);
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
      renderer.setUnitPreferences(readControlPreferences(documentRef).units);
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
        if (layer === "measurements") updateMeasurementOverlay(state, documentRef);
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
    onOpenGovernmentPanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.STATE) {
        state.panels.government.setSelectedStateId(state.selection.object.id);
      }
      state.panels.government.open(state.map, state.selection, state.editHistory.getStats());
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
    onOpenEconomyPanel: () => {
      state.panels.economy.open(state.map, state.selection, state.editHistory.getStats());
      if (state.selection?.object?.kind === OBJECT_KIND.TRADE_FLOW) {
        state.panels.economy.setSelectedDealId?.(state.selection.object.id);
      }
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
    onOpenLakePanel: () => {
      state.panels.lake.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenZonePanel: () => {
      if (state.selection?.object?.kind === OBJECT_KIND.ZONE) {
        state.panels.zone.setSelection(state.selection);
      }
      state.panels.zone.open(state.map, state.selection, state.editHistory.getStats());
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
    onOpenMeasurementPanel: () => {
      state.panels.measurement.open(state.map, state.editHistory.getStats());
    },
    onOpenNamebasePanel: () => {
      state.panels.namebase.open(state.map, {history: state.editHistory.getStats()});
    },
    onSaveLocalFile: () => saveMapToLocalFile(state, documentRef),
    onSaveBrowserStorage: () => {
      void saveMapToBrowserStorage(state, documentRef);
    },
    onExportImage: () => exportMapImage(state, documentRef),
    onExportMapData: () => exportMapData(state, documentRef),
    onExportGeoJson: () => exportGeoJson(state, documentRef),
    onExportFeatureGeoJson: () => exportFeatureGeoJson(state, documentRef),
    onImportMapData: file => importMapData(state, documentRef, file),
    onImportGeoData: file => importGeoData(state, documentRef, file),
    onImportHeightmapImage: payload => importHeightmapImage(state, documentRef, payload),
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
  void restoreBrowserStoredMapOrGenerate(state, documentRef);
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
    renderer.setUnitPreferences(preferences.units);
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
  delete normalized.tradeFlows;
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
    const namebaseSnapshot = resolveGenerationNamebaseSnapshot(state, documentRef);
    state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
    const generateId = state.pendingGenerateId;
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "request", message: loadingMessage("request")});
    setGenerationStatus(documentRef, state.options, "等待生成任务");
    setMythicGenerationLoading(documentRef, true, "request");
    scheduleAfterPaint(documentRef, () => {
      if (generateId !== state.pendingGenerateId) return;
      void runGenerateNow(state, documentRef, generateId, namebaseSnapshot);
    });
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportGenerateError(documentRef, error);
  }
}

async function runGenerateNow(state, documentRef, generateId, namebaseSnapshot = null) {
  try {
    const hadMap = Boolean(state.map);
    setGenerationStatus(documentRef, state.options, "生成中");
    setMythicGenerationLoading(documentRef, true, "generate");
    emitLoadTrace(documentRef, {phase: "start", id: "generate", message: loadingMessage("generate"), delayMs: readDebugLoadDelayMs(documentRef)});
    await yieldToBrowser(documentRef, {debugDelay: true});
    const map = await generateMapOffMainThread(documentRef, generationOptionsWithNamebases(state.options, namebaseSnapshot), generateId);
    emitLoadTrace(documentRef, {phase: "end", id: "generate", message: loadingMessage("generate")});
    if (generateId !== state.pendingGenerateId) return;
    await loadMapIntoRuntime(state, documentRef, map, {
      loadingMessages: [loadingMessage("cell-visual-mesh"), loadingMessage("panel-refresh")],
      completionToast: hadMap ? "生成完成" : ""
    });
    updateGenerationLoading(documentRef, false);
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportGenerateError(documentRef, error);
  }
}

async function restoreBrowserStoredMapOrGenerate(state, documentRef) {
  if (await restoreMapFromBrowserStorage(state, documentRef, {startup: true})) return;
  requestGenerate(state, documentRef);
}

async function restoreMapFromBrowserStorage(state, documentRef, {startup = false} = {}) {
  const storage = browserStorage(documentRef);
  if (!storage) return false;
  const raw = storage.getItem(BROWSER_MAP_STORAGE_KEY);
  if (!raw) return false;

  try {
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "map-import-read", message: loadingMessage("map-import-read")});
    setFileOperationStatus(documentRef, "正在读取浏览器保存的地图...");
    setMythicGenerationLoading(documentRef, true, "map-import-read");
    const document = parseMapDocument(await decodeBrowserMapStoragePayload(documentRef, raw));
    const options = normalizeOptions(document.map.options || document.options || state.options);
    document.map.options = options;
    state.options = options;
    syncGenerationInputs(documentRef, options);
    state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
    await loadMapIntoRuntime(state, documentRef, document.map, {
      loadingMessages: [loadingMessage("map-import-render"), loadingMessage("panel-refresh")],
      completionToast: startup ? "已恢复浏览器保存的地图" : "地图已从浏览器恢复"
    });
    updateGenerationLoading(documentRef, false);
    setFileOperationStatus(documentRef, `已恢复浏览器保存的地图：seed ${document.map.metadata?.seed || options.seed || "未知"}`);
    return true;
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    storage.removeItem(BROWSER_MAP_STORAGE_KEY);
    reportFileOperationError(documentRef, "浏览器地图恢复失败，已清除损坏存档", error);
    return false;
  }
}

function generationOptionsWithNamebases(options, namebaseSnapshot) {
  return namebaseSnapshot ? {...options, namebases: namebaseSnapshot} : options;
}

function resolveGenerationNamebaseSnapshot(state, documentRef) {
  return createGenerationNamebaseSnapshot(state.map) || readNamebasePreferenceSnapshot(documentRef);
}

function createGenerationNamebaseSnapshot(map, metadata = {}) {
  const namebases = map?.namebases;
  if (!namebases || typeof namebases !== "object") return null;
  const bases = Array.isArray(namebases.bases)
    ? namebases.bases.map(base => ({
      id: String(base?.id || "").trim(),
      sourceId: String(base?.sourceId || ""),
      name: String(base?.name || base?.id || ""),
      kind: String(base?.kind || "generic"),
      category: String(base?.category || "用户名称库"),
      note: String(base?.note || ""),
      source: Array.isArray(base?.source) ? base.source.map(value => String(value || "").trim()).filter(Boolean) : [],
      builtin: false,
      origin: String(base?.origin || "继承"),
      importedAt: base?.importedAt || "",
      importedFrom: base?.importedFrom || "",
      minLength: Number(base?.minLength ?? base?.min) || 1,
      maxLength: Number(base?.maxLength ?? base?.max) || 8,
      duplicateChars: String(base?.duplicateChars ?? base?.d ?? "").trim()
    })).filter(base => base.id && base.source.length)
    : [];
  const bindings = {
    global: {
      stateRoot: String(namebases.bindings?.global?.stateRoot || "").trim(),
      place: String(namebases.bindings?.global?.place || "").trim(),
      hydro: String(namebases.bindings?.global?.hydro || "").trim()
    },
    cultures: normalizeGenerationCultureNamebaseBindings(namebases.bindings?.cultures)
  };
  const hasBindings = Object.values(bindings.global).some(Boolean) || Object.values(bindings.cultures).some(culture => Object.values(culture).some(Boolean));
  if (!bases.length && !hasBindings) return null;
  return {
    version: 1,
    bases,
    bindings,
    metadata: {
      ...(namebases.metadata || {}),
      ...metadata,
      bases: bases.length,
      inheritedFromMap: map.metadata?.checksum || map.summary?.checksum || ""
    }
  };
}

function readNamebasePreferenceSnapshot(documentRef) {
  try {
    const storage = documentRef.defaultView?.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(NAMEBASE_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const namebases = JSON.parse(raw);
    return createGenerationNamebaseSnapshot({
      namebases,
      metadata: {checksum: "local-namebase-preferences"}
    }, {inheritedFromPreference: true});
  } catch {
    return null;
  }
}

function persistNamebasePreferences(state, documentRef) {
  try {
    const storage = documentRef.defaultView?.localStorage;
    if (!storage) return false;
    const snapshot = createGenerationNamebaseSnapshot(state.map, {savedAt: new Date().toISOString()});
    if (!snapshot) {
      storage.removeItem(NAMEBASE_PREFERENCES_STORAGE_KEY);
      return false;
    }
    storage.setItem(NAMEBASE_PREFERENCES_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function normalizeGenerationCultureNamebaseBindings(cultures) {
  if (!cultures || typeof cultures !== "object") return {};
  const result = {};
  for (const [cultureId, binding] of Object.entries(cultures)) {
    if (!binding || typeof binding !== "object") continue;
    result[String(cultureId)] = {
      stateRoot: String(binding.stateRoot || "").trim(),
      place: String(binding.place || "").trim(),
      hydro: String(binding.hydro || "").trim()
    };
  }
  return result;
}

async function loadMapIntoRuntime(state, documentRef, map, {loadingMessages = [], completionToast = ""} = {}) {
  emitLoadTrace(documentRef, {phase: "start", id: "load-map", message: "接入地图运行时", delayMs: readDebugLoadDelayMs(documentRef)});
  state.map = map;
  state.pick = null;
  state.editHistory.clear();
  state.heightEdit.activeStroke = null;
  state.heightEdit.lastAffected = 0;
  state.heightEdit.lastHeight = "none";
  state.stateEdit.activeStroke = null;
  state.stateEdit.addMode = false;
  state.stateEdit.deleteMode = false;
  state.stateEdit.lastAffected = 0;
  state.stateEdit.sourceStateId = null;
  state.stateEdit.lastPointer = null;
  state.provinceEdit.activeStroke = null;
  state.provinceEdit.addMode = false;
  state.provinceEdit.deleteMode = false;
  state.provinceEdit.lastAffected = 0;
  state.provinceEdit.sourceProvinceId = null;
  state.provinceEdit.lastPointer = null;
  state.cityEdit.addMode = false;
  state.cityEdit.deleteMode = false;
  state.cityEdit.lastCreatedCityId = null;
  state.markerEdit.mode = null;
  state.markerEdit.type = "mines";
  state.markerEdit.markerId = null;
  state.markerEdit.lastPackCell = null;
  state.measurement.points = [];
  state.measurement.pointer = null;
  state.measurement.drag = null;
  state.measurement.editingMeasurementId = null;
  ensureMeasurementStore(state.map);
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
  updateGovernmentPanel(state);
  updateProvincePanel(state);
  updateCityPanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateEconomyPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  state.panels.namebase.update(state.map, state.editHistory.getStats());
  state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
  state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
  updateLakePanel(state);
  updateMeasurementPanel(state);
  restorePersistedPanels(state);
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
  showMapToast(documentRef, completionToast);
  scheduleLazyPanelsAfterMapReady(state, documentRef);
}

function restorePersistedPanels(state) {
  const panelManager = state.panelManager;
  if (!panelManager || typeof panelManager.getSavedOpenPanelIds !== "function") return;
  for (const panelId of panelManager.getSavedOpenPanelIds()) {
    openPersistedPanel(state, panelId);
  }
}

function openPersistedPanel(state, panelId) {
  const history = state.editHistory.getStats();
  const selection = state.selection;
  const map = state.map;
  const openers = {
    "generation-panel": () => state.panels.generation?.open(),
    "development-panel": () => state.panels.development?.open(),
    "height-panel": () => state.panels.height?.open(history),
    "state-panel": () => state.panels.state?.open(map, history),
    "government-panel": () => state.panels.government?.open(map, selection, history),
    "province-panel": () => state.panels.province?.open(map, selection, history),
    "city-panel": () => state.panels.city?.open(map, selection, history),
    "culture-panel": () => state.panels.culture?.open(map, selection, history),
    "religion-panel": () => state.panels.religion?.open(map, selection, history),
    "diplomacy-panel": () => state.panels.diplomacy?.open(map, selection, history),
    "economy-panel": () => state.panels.economy?.open(map, selection, history),
    "military-panel": () => state.panels.military?.open(map, selection, history),
    "route-panel": () => state.panels.route?.open(map, selection, history),
    "river-panel": () => state.panels.river?.open(map, selection, history, state.editingObject),
    "lake-panel": () => state.panels.lake?.open(map, selection, history),
    "zone-panel": () => state.panels.zone?.open(map, selection, history),
    "marker-panel": () => state.panels.marker?.open(map, selection, history),
    "label-naming-panel": () => state.panels.labelNaming?.open(map, selection, history),
    "notes-panel": () => state.panels.notes?.open(map, selection, history),
    "measurement-panel": () => state.panels.measurement?.open(map, history),
    "namebase-panel": () => state.panels.namebase?.open(map, {history})
  };
  openers[panelId]?.();
}

function scheduleLazyPanelsAfterMapReady(state, documentRef) {
  if (state.lazyPanelPreloadScheduled) return;
  state.lazyPanelPreloadScheduled = true;
  scheduleAfterPaint(documentRef, () => {
    scheduleLazyVuePanelPreload(documentRef, {
      reason: "map-ready",
      firstDelayMs: 2400,
      gapMs: 220,
      quietInputMs: 1400,
      quietRetryMs: 900,
      timeoutMs: 1800
    });
  });
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

function generateMapOffMainThread(documentRef, options, generateId, overrides = {}) {
  const view = documentRef.defaultView || window;
  const generationTrace = createGenerationTrace(documentRef);
  if (typeof view.Worker !== "function") return Promise.resolve(generatePlaceholderMap(options, {...generationTrace, ...fallbackGenerationOverrides(overrides)}));

  let worker;
  try {
    worker = new GenerationWorker();
  } catch {
    return Promise.resolve(generatePlaceholderMap(options, {...generationTrace, ...fallbackGenerationOverrides(overrides)}));
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
        const map = generatePlaceholderMap(options, {...generationTrace, ...fallbackGenerationOverrides(overrides)});
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

    worker.postMessage({
      type: "generate-map",
      requestId: generateId,
      options,
      heightmapPayload: overrides.heightmapPayload || null
    });
  });
}

function fallbackGenerationOverrides(overrides = {}) {
  return overrides.heightmap ? {heightmap: overrides.heightmap} : {};
}

function setGenerationStatus(documentRef, options, status) {
  const appStatus = documentRef.getElementById("app-status");
  if (appStatus) appStatus.textContent = `${status}，seed ${options.seed}`;
}

function showMapToast(documentRef, message, durationMs = 2200, options = {}) {
  const text = String(message || "").trim();
  if (!text) return;
  const toast = documentRef.getElementById("map-toast");
  if (!toast) return;
  const view = documentRef.defaultView || window;
  if (view.__webglGeneratorToastTimer) view.clearTimeout(view.__webglGeneratorToastTimer);
  toast.textContent = text;
  toast.dataset.tone = options.tone || "success";
  toast.hidden = false;
  view.__webglGeneratorToastTimer = view.setTimeout(() => {
    toast.hidden = true;
    toast.textContent = "";
    delete toast.dataset.tone;
    view.__webglGeneratorToastTimer = null;
  }, durationMs);
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

function saveMapToLocalFile(state, documentRef) {
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在保存地图到本地...");
    const document = createPersistableMapDocument(state, documentRef);
    downloadText(documentRef, stringifyMapDocument(document), `${mapFileBaseName(state.map)}.webgl-map.json`, "application/json;charset=utf-8");
    setFileOperationStatus(documentRef, "地图已保存到本地文件。");
    showMapToast(documentRef, "保存成功");
  } catch (error) {
    reportFileOperationError(documentRef, "保存到本地失败", error);
    showMapToast(documentRef, "保存失败", 2600, {tone: "error"});
  }
}

async function saveMapToBrowserStorage(state, documentRef) {
  try {
    assertMapAvailable(state);
    const storage = browserStorage(documentRef);
    if (!storage) throw new Error("当前浏览器不支持 LocalStorage");
    setFileOperationStatus(documentRef, "正在保存地图到浏览器...");
    const text = stringifyMapDocument(createPersistableMapDocument(state, documentRef));
    const payload = await encodeBrowserMapStoragePayload(documentRef, text, state.map);
    storage.setItem(BROWSER_MAP_STORAGE_KEY, JSON.stringify(payload));
    setFileOperationStatus(documentRef, browserStorageSaveMessage(payload));
    showMapToast(documentRef, "保存成功");
  } catch (error) {
    reportFileOperationError(documentRef, "保存到浏览器失败", error);
    showMapToast(documentRef, "保存失败", 2600, {tone: "error"});
  }
}

function exportMapData(state, documentRef) {
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导出地图数据...");
    const document = createPersistableMapDocument(state, documentRef);
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

function exportLegacyNamebases(state, documentRef) {
  try {
    const text = createLegacyNamebaseText(state.map);
    if (!text) {
      setFileOperationStatus(documentRef, "当前没有可导出的名称库。");
      return;
    }
    const filename = state.map ? `${mapFileBaseName(state.map)}.namebases.txt` : "webgl-generator-namebases.txt";
    downloadText(documentRef, text, filename, "text/plain;charset=utf-8");
    const lines = text.split(/\r?\n/g).filter(Boolean).length;
    setFileOperationStatus(documentRef, `原版文本名称库已导出，共 ${lines} 个词池。`);
  } catch (error) {
    reportFileOperationError(documentRef, "原版文本名称库导出失败", error);
  }
}

function executeNamebaseEdit(state, documentRef, command) {
  const executed = state.editHistory.execute(command, {map: state.map});
  refreshAfterNamebaseEdit(state, documentRef);
  return executed.getResult?.() || null;
}

function undoNamebaseEdit(state, documentRef) {
  try {
    const command = state.editHistory.undo({map: state.map});
    if (!command) {
      setFileOperationStatus(documentRef, "没有可撤销的名称库编辑。");
      return null;
    }
    refreshAfterUndoRedoCommand(state, documentRef, command);
    setFileOperationStatus(documentRef, `已撤销：${command.label}。`);
    return command;
  } catch (error) {
    reportFileOperationError(documentRef, "撤销名称库编辑失败", error);
    return null;
  }
}

function redoNamebaseEdit(state, documentRef) {
  try {
    const command = state.editHistory.redo({map: state.map});
    if (!command) {
      setFileOperationStatus(documentRef, "没有可重做的名称库编辑。");
      return null;
    }
    refreshAfterUndoRedoCommand(state, documentRef, command);
    setFileOperationStatus(documentRef, `已重做：${command.label}。`);
    return command;
  } catch (error) {
    reportFileOperationError(documentRef, "重做名称库编辑失败", error);
    return null;
  }
}

function refreshAfterNamebaseEdit(state, documentRef) {
  state.panels.namebase.update(state.map, state.editHistory.getStats());
  persistNamebasePreferences(state, documentRef);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
}

function refreshAfterUndoRedoCommand(state, documentRef, command) {
  if (command?.domain === "namebase") {
    refreshAfterNamebaseEdit(state, documentRef);
    return;
  }
  refreshAfterEdit(state, command);
  updateAllObjectPanels(state);
  state.panels.namebase.update(state.map, state.editHistory.getStats());
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
}

async function importNamebases(state, documentRef, file, mode = "append") {
  if (!file) return;
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导入名称库...");
    const document = parseNamebaseDocument(await file.text());
    const command = createImportNamebasesCommand(document, {filename: file.name, mode});
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "未导入名称库：文件中没有可写入的词池。");
      return null;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    const replacedText = result.replaced ? `，已替换原用户库 ${result.replaced} 个` : "";
    setFileOperationStatus(documentRef, `名称库已导入 ${result.imported} 个词池${replacedText}，当前用户库 ${result.total} 个，已保存为本地偏好。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "名称库导入失败", error);
    return null;
  }
}

async function previewNamebaseImport(state, documentRef, file, mode = "append") {
  if (!file) return null;
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在读取名称库导入预览...");
    const document = parseNamebaseDocument(await file.text());
    const preview = createNamebaseImportPreview(state.map, document, {filename: file.name, mode});
    const replaceText = preview.replaceCount ? `，确认后会替换 ${preview.replaceCount} 个用户库` : "";
    const conflictText = preview.existingConflicts ? `，其中 ${preview.existingConflicts} 个可能与现有用户库重名或同源` : "";
    setFileOperationStatus(documentRef, `已读取名称库预览：可导入 ${preview.valid} 个词池${replaceText}${conflictText}。`);
    return preview;
  } catch (error) {
    reportFileOperationError(documentRef, "名称库导入预览失败", error);
    return null;
  }
}

function setGlobalNamebaseBinding(state, documentRef, target, value) {
  try {
    assertMapAvailable(state);
    const targetLabel = NAMEBASE_BINDING_TARGETS.find(item => item.key === target)?.label || target;
    const sourceLabel = String(value || "").trim() || "内置策略";
    const command = createSetNamebaseBindingCommand(target, value);
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, `全局${targetLabel}名称库没有变化。`);
      return null;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    const invalidText = result.invalidCount ? `；当前还有 ${result.invalidCount} 个失效绑定引用` : "";
    setFileOperationStatus(documentRef, `已设置全局${targetLabel}名称库：${sourceLabel}${invalidText}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "设置名称库绑定失败", error);
    return null;
  }
}

function setCultureNamebaseBinding(state, documentRef, cultureId, target, value) {
  try {
    assertMapAvailable(state);
    const cultureKey = String(cultureId || "").trim();
    if (!cultureKey) throw new Error("请先选择文化");
    const targetLabel = NAMEBASE_BINDING_TARGETS.find(item => item.key === target)?.label || target;
    const culture = state.map.pack?.cultures?.[cultureKey] || state.map.society?.cultures?.[cultureKey] || null;
    const cultureLabel = culture?.name || culture?.root || `文化 #${cultureKey}`;
    const sourceLabel = String(value || "").trim() || "内置策略";
    const command = createSetNamebaseBindingCommand(target, value, {cultureId: cultureKey});
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, `${cultureLabel}${targetLabel}名称库没有变化。`);
      return null;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    const invalidText = result.invalidCount ? `；当前还有 ${result.invalidCount} 个失效绑定引用` : "";
    setFileOperationStatus(documentRef, `已设置${cultureLabel}${targetLabel}名称库：${sourceLabel}${invalidText}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "设置文化名称库绑定失败", error);
    return null;
  }
}

async function importMilitaryBattleEvents(state, documentRef, file) {
  if (!file) return null;
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导入战斗事件...");
    const document = JSON.parse(await file.text());
    const command = createImportMilitaryBattleEventsCommand(document);
    if (command.isNoop({map: state.map})) {
      const result = command.getResult();
      setFileOperationStatus(documentRef, `未导入战斗事件：${result.total} 条记录中没有匹配当前地图军团的事件。`);
      return result;
    }
    refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
    markDerivedFresh(state.map, ["military"]);
    refreshGenerationSummary(state.map);
    updateMilitaryPanel(state);
    updateStatePanel(state);
    updateRuntimePanel(documentRef, state);
    updateEditingInteractionLock(state, documentRef);
    const result = command.getResult();
    appendGenerationLog(state.map, `import military battle events: imported=${result.imported}, skipped=${result.skipped}`);
    setFileOperationStatus(documentRef, `战斗事件已导入 ${result.imported} 条，跳过 ${result.skipped} 条。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "战斗事件导入失败", error);
    return null;
  }
}

function copyBuiltinNamebase(state, documentRef, row) {
  try {
    assertMapAvailable(state);
    if (!row?.id || row.builtin !== true) {
      setFileOperationStatus(documentRef, "请选择一个内置名称库进行复制。");
      return;
    }
    const command = createCopyBuiltinNamebaseCommand(row.id, {name: row.name});
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "未找到可复制的内置名称库。");
      return;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    if (!result.copied) {
      setFileOperationStatus(documentRef, "未找到可复制的内置名称库。");
      return;
    }
    setFileOperationStatus(documentRef, `已复制“${row.name}”为用户名称库“${result.name}”，当前用户库 ${result.total} 个，已保存为本地偏好。`);
  } catch (error) {
    reportFileOperationError(documentRef, "复制名称库失败", error);
  }
}

function createManualNamebase(state, documentRef) {
  try {
    assertMapAvailable(state);
    const result = executeNamebaseEdit(state, documentRef, createCreateUserNamebaseCommand());
    setFileOperationStatus(documentRef, `已新建用户名称库“${result.name}”，样本 ${result.samples} 个，当前用户库 ${result.total} 个，已保存为本地偏好。`);
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
    const command = createRenameUserNamebaseCommand(row.id, name);
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "名称库名称没有变化。");
      return;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    if (!result.renamed) {
      setFileOperationStatus(documentRef, "未找到可重命名的用户名称库。");
      return;
    }
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
    const command = createUpdateUserNamebaseSourceCommand(row.id, sourceText);
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "名称库样本没有变化。");
      return;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    if (!result.updated) {
      setFileOperationStatus(documentRef, "未找到可编辑的用户名称库。");
      return;
    }
    setFileOperationStatus(documentRef, `已更新用户名称库“${result.name}”，样本 ${result.samples} 个。`);
  } catch (error) {
    reportFileOperationError(documentRef, "编辑名称库样本失败", error);
  }
}

function updateImportedNamebaseOptions(state, documentRef, row, options) {
  try {
    assertMapAvailable(state);
    if (!row?.id || row.builtin === true) {
      setFileOperationStatus(documentRef, "请选择一个用户名称库编辑参数。");
      return;
    }
    const command = createUpdateUserNamebaseOptionsCommand(row.id, options);
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "名称库生成参数没有变化。");
      return;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    if (!result.updated) {
      setFileOperationStatus(documentRef, "未找到可编辑参数的用户名称库。");
      return;
    }
    const duplicateText = result.duplicateChars ? `，允许连写“${result.duplicateChars}”` : "";
    setFileOperationStatus(documentRef, `已更新用户名称库“${result.name}”生成参数：${result.minLength}-${result.maxLength} 字${duplicateText}。`);
  } catch (error) {
    reportFileOperationError(documentRef, "编辑名称库参数失败", error);
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
    const result = executeNamebaseEdit(state, documentRef, createClearUserNamebasesCommand());
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
    const command = createDeleteUserNamebaseCommand(id, {name});
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "未找到可删除的用户名称库。");
      return;
    }
    const result = executeNamebaseEdit(state, documentRef, command);
    if (!result.removed) {
      setFileOperationStatus(documentRef, "未找到可删除的用户名称库。");
      return;
    }
    setFileOperationStatus(documentRef, `已删除用户名称库“${result.name || name}”，当前用户库 ${result.total} 个，已更新本地偏好。`);
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

async function encodeBrowserMapStoragePayload(documentRef, text, map) {
  const compressed = await compressTextToBase64(documentRef, text);
  const encoded = compressed
    ? {encoding: "gzip-base64", data: compressed.base64, bytes: compressed.bytes}
    : {encoding: "plain", data: text, bytes: text.length};
  return {
    type: BROWSER_MAP_STORAGE_TYPE,
    version: 1,
    savedAt: new Date().toISOString(),
    originalBytes: text.length,
    metadata: {
      seed: map?.metadata?.seed || map?.options?.seed || "",
      checksum: map?.metadata?.checksum || map?.summary?.checksum || "",
      gridCells: map?.metadata?.gridCells || map?.grid?.metadata?.actualCells || 0,
      packCells: map?.metadata?.packCells || map?.pack?.metadata?.cells || 0
    },
    ...encoded
  };
}

async function decodeBrowserMapStoragePayload(documentRef, raw) {
  const payload = JSON.parse(raw);
  if (payload?.type === BROWSER_MAP_STORAGE_TYPE) {
    if (payload.version !== 1) throw new Error(`暂不支持的浏览器存档版本：${payload.version}`);
    if (payload.encoding === "gzip-base64") return decompressBase64Text(documentRef, payload.data);
    if (payload.encoding === "plain") return String(payload.data || "");
    throw new Error(`暂不支持的浏览器存档编码：${payload.encoding || "未知"}`);
  }
  return raw;
}

async function compressTextToBase64(documentRef, text) {
  const view = documentRef.defaultView || window;
  if (typeof view.CompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") return null;
  const stream = new view.Blob([text], {type: "application/json;charset=utf-8"}).stream().pipeThrough(new view.CompressionStream("gzip"));
  const buffer = await new view.Response(stream).arrayBuffer();
  return {base64: arrayBufferToBase64(view, buffer), bytes: buffer.byteLength};
}

async function decompressBase64Text(documentRef, data) {
  const view = documentRef.defaultView || window;
  if (typeof view.DecompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") {
    throw new Error("当前浏览器不支持读取压缩的 LocalStorage 地图存档");
  }
  const bytes = base64ToUint8Array(view, data);
  const stream = new view.Blob([bytes], {type: "application/gzip"}).stream().pipeThrough(new view.DecompressionStream("gzip"));
  return new view.Response(stream).text();
}

function arrayBufferToBase64(view, buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return view.btoa(binary);
}

function base64ToUint8Array(view, base64) {
  const binary = view.atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function browserStorage(documentRef) {
  try {
    return documentRef.defaultView?.localStorage || null;
  } catch {
    return null;
  }
}

function browserStorageSaveMessage(payload) {
  const original = formatStorageBytes(payload.originalBytes);
  const stored = formatStorageBytes(payload.bytes || String(payload.data || "").length);
  const compression = payload.encoding === "gzip-base64" ? `，压缩后 ${stored}` : "";
  return `地图已保存到浏览器 LocalStorage：原始 ${original}${compression}。下次打开会优先恢复此地图。`;
}

function formatStorageBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${Math.round(value)}B`;
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
      loadingMessages: [loadingMessage("map-import-render"), loadingMessage("panel-refresh")],
      completionToast: "地图数据已导入"
    });
    if (createGenerationNamebaseSnapshot(state.map)) persistNamebasePreferences(state, documentRef);
    updateGenerationLoading(documentRef, false);
    setFileOperationStatus(documentRef, `已导入地图数据：seed ${document.map.metadata?.seed || options.seed || "未知"}`);
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportFileOperationError(documentRef, "地图数据导入失败", error);
  }
}

async function importGeoData(state, documentRef, file) {
  if (!file) return;
  try {
    assertMapAvailable(state);
    setFileOperationStatus(documentRef, "正在导入 GEO 数据...");
    const text = await file.text();
    const terrainCommand = createImportFmgCellsHeightCommand(text, state.map);
    if (terrainCommand) {
      if (terrainCommand.isNoop({map: state.map})) {
        setFileOperationStatus(documentRef, "未导入 GEO 地形：当前地图与文件高度一致。");
        return null;
      }
      refreshAfterEdit(state, state.editHistory.execute(terrainCommand, {map: state.map}));
      const summary = terrainCommand.getSummary?.() || {};
      const reset = state.map.metadata?.geoImportDerivedRefresh || {};
      setFileOperationStatus(documentRef, `已从原版 Cells GEO 导入地形并重置非 GEO 数据：源 cells ${summary.sourceCells || 0}，陆地 ${summary.sourceLandCells || 0}，水域 ${summary.sourceWaterCells || 0}，应用 ${summary.appliedCells || 0} 个当前 cells；军事 ${reset.militaryRegiments || 0}，资源点 ${reset.resourceMarkers || 0}，地区 ${reset.zones || 0}，可撤销。`);
      return summary;
    }
    const payload = parseGeoJsonMeasurements(text, state.map, {limit: 600});
    const command = createImportMeasurementsCommand(payload.measurements, {label: "导入 GEO 测量对象"});
    if (command.isNoop({map: state.map})) {
      setFileOperationStatus(documentRef, "未导入 GEO 数据：文件中没有可写入的几何。");
      return null;
    }
    refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
    const imported = command.getImported?.() || [];
    state.measurement.points = [];
    state.measurement.editingMeasurementId = null;
    state.measurement.active = false;
    if (state.renderer?.layerVisibility?.measurements === false) {
      state.renderer.setLayerVisible("measurements", true);
      syncMeasurementLayerControl(documentRef, true);
    }
    updateMeasurementOverlay(state, documentRef);
    updateMeasurementPanel(state);
    const selected = imported[0];
    if (selected) {
      state.panels.measurement?.setSelectedMeasurementId?.(selected.id);
      state.panels.measurement?.open(state.map, state.editHistory.getStats());
      locateMeasurement(state, {...selected, pointCount: selected.points?.length || 0}, documentRef);
    }
    setFileOperationStatus(documentRef, `GEO 数据已导入为 ${imported.length} 个测量对象，可撤销；来源 Feature ${payload.featureCount} 个。`);
    return imported;
  } catch (error) {
    reportFileOperationError(documentRef, "GEO 数据导入失败", error);
    return null;
  }
}

function syncMeasurementLayerControl(documentRef, visible) {
  const control = documentRef.querySelector('[data-layer="measurements"]');
  if (!control) return;
  if (control.tagName === "BUTTON") {
    control.setAttribute("aria-pressed", visible ? "true" : "false");
    control.classList.toggle("active", visible);
    return;
  }
  if ("checked" in control) control.checked = visible;
}

async function importHeightmapImage(state, documentRef, payload) {
  const {file, settings} = normalizeHeightmapImportPayload(payload, documentRef);
  if (!file) return;
  try {
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "heightmap-read", message: loadingMessage("heightmap-read")});
    setFileOperationStatus(documentRef, "正在读取高度图...", ["heightmap-import-status"]);
    setMythicGenerationLoading(documentRef, true, "heightmap-read");
    const options = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
    const namebaseSnapshot = resolveGenerationNamebaseSnapshot(state, documentRef);
    const importGenerateId = (state.pendingGenerateId || 0) + 1;
    state.pendingGenerateId = importGenerateId;
    state.heightmapImportId = importGenerateId;
    const heightmap = settings.kind === "image-palette"
      ? await createPaletteHeightmapFromImage(documentRef, file, options, settings)
      : await createGrayscaleHeightmapFromImage(documentRef, file, options, settings);
    if (importGenerateId !== state.pendingGenerateId) {
      clearStaleHeightmapImportStatus(state, documentRef, importGenerateId);
      return;
    }
    state.options = options;
    setMythicGenerationLoading(documentRef, true, "heightmap-generate");
    emitLoadTrace(documentRef, {phase: "start", id: "heightmap-generate", message: loadingMessage("heightmap-generate")});
    await yieldToBrowser(documentRef, {debugDelay: true});
    const map = await generateMapOffMainThread(documentRef, generationOptionsWithNamebases(options, namebaseSnapshot), importGenerateId, {
      heightmap,
      heightmapPayload: heightmap.workerPayload || null
    });
    emitLoadTrace(documentRef, {phase: "end", id: "heightmap-generate", message: loadingMessage("heightmap-generate")});
    if (importGenerateId !== state.pendingGenerateId) {
      clearStaleHeightmapImportStatus(state, documentRef, importGenerateId);
      return;
    }
    state.options = map.options;
    await loadMapIntoRuntime(state, documentRef, map, {
      loadingMessages: [loadingMessage("heightmap-render"), loadingMessage("panel-refresh")],
      completionToast: "高度图已应用"
    });
    updateGenerationLoading(documentRef, false);
    setFileOperationStatus(documentRef, heightmapImportSuccessMessage(heightmap), ["heightmap-import-status"]);
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportFileOperationError(documentRef, "高度图导入失败", error, ["heightmap-import-status"]);
  }
}

function heightmapImportSuccessMessage(heightmap) {
  const source = heightmap.source || {};
  if (source.kind === "image-palette") {
    const assignments = Array.isArray(source.assignments) ? source.assignments.length : 0;
    return `已导入彩色高度图：${source.filename || "本地图片"}，${mappingModeStatusLabel(source.mappingMode)}，${assignments} 个色块，未分配高度 ${source.unassignedHeight}`;
  }
  return `已导入灰度高度图：${source.filename || "本地图片"}，高度 ${source.heightMin}-${source.heightMax}，${heightmapFitLabel(source.fitMode)}`;
}

function mappingModeStatusLabel(mappingMode) {
  if (mappingMode === "luminance") return "亮度映射";
  if (mappingMode === "hue") return "色相映射";
  if (mappingMode === "fmg-scheme") return "FMG 色带映射";
  if (mappingMode === "manual") return "手动映射";
  return "灰度映射";
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
  setInputValue(documentRef, "cells-input", options.cellsTarget ?? options.cells);
  setInputValue(documentRef, "width-input", options.graphWidth);
  setInputValue(documentRef, "height-input", options.graphHeight);
  setInputValue(documentRef, "heightmap-template", options.heightmapTemplate);
  syncClimateInputs(documentRef, options);
}

function syncClimateInputs(documentRef, options) {
  const detail = climateOptionSnapshot(options);
  documentRef.dispatchEvent(new CustomEvent("webgl-generator-sync-climate-options", {detail}));
  for (const [key, id] of Object.entries({
    climateLatitudeMode: "climate-latitude-mode",
    climateLatitudeCenter: "climate-latitude-center",
    climateLatitudeSpan: "climate-latitude-span",
    climateMapSizePercent: "climate-map-size-percent",
    climateLatitudeRangePercent: "climate-latitude-range-percent",
    climateLongitudeRangePercent: "climate-longitude-range-percent",
    atmosphereDirection: "atmosphere-direction",
    winds: "atmosphere-winds",
    temperatureEquator: "temperature-equator",
    temperatureNorthPole: "temperature-north-pole",
    temperatureSouthPole: "temperature-south-pole"
  })) {
    const value = key === "winds" ? detail.winds.join(",") : detail[key];
    setInputValue(documentRef, id, value);
  }
}

function setInputValue(documentRef, id, value) {
  const input = documentRef.getElementById(id);
  if (!input || value === undefined || value === null) return;
  if (input.tagName === "SELECT" && !Array.from(input.options).some(option => option.value === String(value))) return;
  input.value = String(value);
  input.dispatchEvent(new Event("change", {bubbles: true}));
}

function createPersistableMapDocument(state, documentRef) {
  syncClimateOptionsForPersistence(state, documentRef);
  return createMapDocument(state.map, state.options);
}

function syncClimateOptionsForPersistence(state, documentRef) {
  if (!state.map) return;
  const nextOptions = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
  const currentClimate = climateOptionSnapshot(state.options);
  const nextClimate = climateOptionSnapshot(nextOptions);
  if (sameClimateOptions(currentClimate, nextClimate)) return;
  applyClimateControls(state, documentRef);
}

function climateOptionSnapshot(options = {}) {
  const normalized = normalizeOptions(options);
  const snapshot = {};
  for (const key of CLIMATE_OPTION_KEYS) snapshot[key] = Array.isArray(normalized[key]) ? [...normalized[key]] : normalized[key];
  return snapshot;
}

function sameClimateOptions(left, right) {
  for (const key of CLIMATE_OPTION_KEYS) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      if (!sameNumberArray(leftValue, rightValue)) return false;
      continue;
    }
    if (leftValue !== rightValue) return false;
  }
  return true;
}

function sameNumberArray(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => Number(value) === Number(right[index]));
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
  updateGovernmentPanel(state);
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

function renameSelectedObjectFromNamebase(state, documentRef, object) {
  const target = namebaseRenameTargetForObject(object);
  if (!target) {
    setFileOperationStatus(documentRef, "当前选中对象不支持按名称库重命名。");
    return;
  }
  const command = createSelectedNamebaseRenameCommand(target);
  const context = {map: state.map};
  if (!command || command.isNoop(context)) {
    setFileOperationStatus(documentRef, `当前选中${selectedNamebaseTargetLabel(target)}没有可按名称库更新的名称。`);
    return;
  }
  refreshAfterEdit(state, state.editHistory.execute(command, context));
  const result = command.getResult?.();
  setFileOperationStatus(documentRef, `已按当前名称库重命名选中${selectedNamebaseTargetLabel(target)} ${result?.renamed || 0} 个。`);
  updateAllObjectPanels(state);
  updateEditingInteractionLock(state, documentRef);
}

function namebaseRenameTargetForObject(object) {
  if (!object?.kind) return null;
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.CITY) {
    return {kind: OBJECT_KIND.CITY, id: Number(object.targetId ?? object.id)};
  }
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.STATE) {
    return {kind: OBJECT_KIND.STATE, id: Number(object.targetId ?? object.id)};
  }
  if (object.kind === OBJECT_KIND.CITY || object.kind === OBJECT_KIND.STATE || object.kind === OBJECT_KIND.RIVER || object.kind === OBJECT_KIND.LAKE) {
    return {kind: object.kind, id: Number(object.id)};
  }
  return null;
}

function createSelectedNamebaseRenameCommand(target) {
  if (!Number.isInteger(target.id)) return null;
  if (target.kind === OBJECT_KIND.STATE) {
    if (target.id <= 0) return null;
    return createRenameStatesFromNamebaseCommand([target.id], {label: "按名称库重命名选中国家"});
  }
  if (target.kind === OBJECT_KIND.CITY) {
    if (target.id < 0) return null;
    return createRenameCitiesFromNamebaseCommand([target.id], {label: "按名称库重命名选中城市"});
  }
  if (target.kind === OBJECT_KIND.RIVER) {
    if (target.id < 0) return null;
    return createRenameRiversFromNamebaseCommand([target.id], {label: "按名称库重命名选中河流"});
  }
  if (target.kind === OBJECT_KIND.LAKE) {
    if (target.id < 0) return null;
    return createRenameLakesFromNamebaseCommand([target.id], {label: "按名称库重命名选中湖泊"});
  }
  return null;
}

function selectedNamebaseTargetLabel(target) {
  if (target.kind === OBJECT_KIND.STATE) return "国家";
  if (target.kind === OBJECT_KIND.CITY) return "城市";
  if (target.kind === OBJECT_KIND.RIVER) return "河流";
  if (target.kind === OBJECT_KIND.LAKE) return "湖泊";
  return "对象";
}

const SELECTION_PANEL_HANDLERS = Object.freeze({
  [OBJECT_KIND.STATE]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    state.panels.state.setTargetStateId(selection.object.id);
    if (isSelectionFromPanel(context, "state-panel") || isSelectionFromPanel(context, "government-panel")) return true;
    if (state.panels.state.isOpen?.()) updateStatePanel(state);
    else state.panels.state.open(state.map, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.CITY]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    state.panels.city.setSelectedCityId(selection.object.id);
    if (isSelectionFromPanel(context, "city-panel")) return true;
    if (state.panels.city.isOpen?.()) updateCityPanel(state);
    else state.panels.city.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.PROVINCE]: (state, selection, editingObject, context) => {
    if (!shouldOpenProvincePanelForSelection(state)) return false;
    state.panels.objectDetails.clear();
    state.panels.province.setSelectedProvinceId(selection.object.id);
    if (isSelectionFromPanel(context, "province-panel")) return true;
    if (state.panels.province.isOpen?.()) updateProvincePanel(state);
    else state.panels.province.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.CULTURE]: (state, selection, editingObject, context) => {
    if (!shouldOpenCulturePanelForSelection(state)) return false;
    state.panels.objectDetails.clear();
    state.panels.culture.setSelectedCultureId(selection.object.id);
    if (isSelectionFromPanel(context, "culture-panel")) return true;
    if (state.panels.culture.isOpen?.()) updateCulturePanel(state);
    else state.panels.culture.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.RELIGION]: (state, selection, editingObject, context) => {
    if (!shouldOpenReligionPanelForSelection(state)) return false;
    state.panels.objectDetails.clear();
    state.panels.religion.setSelectedReligionId(selection.object.id);
    if (isSelectionFromPanel(context, "religion-panel")) return true;
    if (state.panels.religion.isOpen?.()) updateReligionPanel(state);
    else state.panels.religion.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.RIVER]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    if (context.suppressNextRiverPanelOpen) {
      context.clearRiverSuppressor();
      return true;
    }
    if (isSelectionFromPanel(context, "river-panel")) return true;
    if (state.panels.river.isOpen?.()) updateRiverPanel(state);
    else state.panels.river.open(state.map, selection, state.editHistory.getStats(), editingObject);
    return true;
  },
  [OBJECT_KIND.LAKE]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    if (isSelectionFromPanel(context, "lake-panel")) return true;
    if (state.panels.lake.isOpen?.()) updateLakePanel(state);
    else state.panels.lake.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.ZONE]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    state.panels.zone.setSelection(selection);
    if (isSelectionFromPanel(context, "zone-panel")) return true;
    if (state.panels.zone.isOpen?.()) updateZonePanel(state);
    else state.panels.zone.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.ROUTE]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    state.panels.route.setSelectedRouteId(selection.object.id);
    if (isSelectionFromPanel(context, "route-panel")) return true;
    if (state.panels.route.isOpen?.()) updateRoutePanel(state);
    else state.panels.route.open(state.map, selection, state.editHistory.getStats());
    return true;
  },
  [OBJECT_KIND.TRADE_FLOW]: (state, selection) => {
    if (!state.panels.economy?.isOpen?.()) return false;
    state.panels.objectDetails.clear();
    state.panels.economy.setSelectedDealId?.(selection.object.id);
    updateEconomyPanel(state);
    return true;
  },
  [OBJECT_KIND.MARKER]: (state, selection, editingObject, context) => {
    if (!state.panels.marker?.isOpen?.()) return false;
    state.panels.objectDetails.clear();
    state.panels.marker.setSelectedMarkerId(selection.object.id);
    if (isSelectionFromPanel(context, "marker-panel")) return true;
    updateMarkerPanel(state);
    return true;
  },
  [OBJECT_KIND.MILITARY]: (state, selection, editingObject, context) => {
    state.panels.objectDetails.clear();
    state.panels.military.setSelectedRegimentId(selection.object.id);
    if (isSelectionFromPanel(context, "military-panel")) return true;
    if (state.panels.military.isOpen?.()) updateMilitaryPanel(state);
    else state.panels.military.open(state.map, selection, state.editHistory.getStats());
    return true;
  }
});

function isSelectionFromPanel(context, panelId) {
  return context?.sourcePanelId === panelId;
}

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
  updateGovernmentPanel(state);
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
  const result = regeneratePackStatesAndProvinces(map.grid, map.society, {...map.options, namebases: map.namebases}, map.pack, map.settlements, {salt: stateSalt});
  if (!result) return regenerationResult("states", "未执行", "当前地图缺少可用城镇或 pack 语义图，无法重选首都并扩张国家。");

  applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, namebases: map.namebases, pruneNeutralSettlements: true, routeRegenerationSalt: stateSalt});
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
  const result = regeneratePackProvincesWithinStates(map.grid, map.society, {...map.options, namebases: map.namebases}, map.pack, {salt: provinceSalt});
  if (!result) return regenerationResult("provinces", "未执行", "当前地图缺少可用国家或 pack 语义图，无法在国家内重建省份。");

  applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, namebases: map.namebases, routeRegenerationSalt: provinceSalt});
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
  const riverOptions = {...map.options, namebases: map.namebases, riverRegenerationSalt: nextRegenerationSalt(map, "rivers")};
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

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, namebases: map.namebases, settlementRegenerationSalt: citySalt, routeRegenerationSalt: citySalt});
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
    "外交重算不会改写国家边界、城镇、经济或军队；战争状态只保留为外交记录和静态军事摘要上下文。"
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
  updateLakePanel(state);
  state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
  updateMeasurementPanel(state);
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
  if (map?.diplomacy?.metadata) map.diplomacy.metadata.stale = stale.systems.includes("diplomacy");
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
  if (map?.diplomacy?.metadata) map.diplomacy.metadata.stale = nextSystems.includes("diplomacy");
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
  const saveButton = documentRef.getElementById("measurement-save");
  const objectsButton = documentRef.getElementById("measurement-objects");
  const routeFitButton = documentRef.getElementById("measurement-route-fit");
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
    state.measurement.editingMeasurementId = null;
    state.measurement.notice = "";
    updateMeasurementOverlay(state, documentRef);
  });
  undo?.addEventListener("click", () => undoMeasurementPoint(state, documentRef));
  exportButton?.addEventListener("click", () => exportMeasurement(state, documentRef));
  saveButton?.addEventListener("click", () => saveCurrentMeasurement(state, documentRef));
  objectsButton?.addEventListener("click", () => state.panels.measurement?.open(state.map, state.editHistory.getStats()));
  routeFitButton?.addEventListener("click", () => {
    state.measurement.routeFit = measurementRouteFitActive(state) ? MEASUREMENT_ROUTE_FIT_NONE : MEASUREMENT_ROUTE_FIT_ROADS;
    state.measurement.notice = "";
    updateMeasurementOverlay(state, documentRef);
  });

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
    const measurementPoint = measurementPointFromPointer(state, documentRef, event);
    if (!measurementPoint) {
      updateMeasurementOverlay(state, documentRef);
      return;
    }
    const insertIndex = shouldInsertMeasurementPoint(event) ? findMeasurementInsertIndex(state, canvas, event) : -1;
    if (insertIndex >= 0) state.measurement.points.splice(insertIndex + 1, 0, measurementPoint);
    else state.measurement.points.push(measurementPoint);
    state.measurement.notice = "";
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
  const readout = documentRef.getElementById("measurement-readout");
  const summary = documentRef.getElementById("measurement-summary");
  const clear = documentRef.getElementById("measurement-clear");
  const undo = documentRef.getElementById("measurement-undo");
  const exportButton = documentRef.getElementById("measurement-export");
  const saveButton = documentRef.getElementById("measurement-save");
  const routeFitButton = documentRef.getElementById("measurement-route-fit");
  const toggle = documentRef.getElementById("toggle-measurement");
  const canvas = documentRef.getElementById("map-canvas");
  if (!overlay || !svg || !readout || !summary || !clear || !undo || !exportButton || !saveButton || !routeFitButton || !toggle || !canvas) return;

  const active = Boolean(state.measurement.active);
  const points = state.measurement.points || [];
  const savedMeasurements = visibleSavedMeasurements(state);
  const showOverlay = active || savedMeasurements.length > 0;
  documentRef.body.classList.toggle("measurement-active", active);
  toggle.classList.toggle("active", active);
  toggle.setAttribute("aria-pressed", active ? "true" : "false");
  toggle.textContent = active ? "退出测量" : "测量";
  saveButton.textContent = state.measurement.editingMeasurementId ? "保存修改" : "保存";
  routeFitButton.classList.toggle("active", measurementRouteFitActive(state));
  routeFitButton.setAttribute("aria-pressed", measurementRouteFitActive(state) ? "true" : "false");
  routeFitButton.textContent = measurementRouteFitActive(state) ? "贴路" : "自由";
  routeFitButton.title = measurementRouteFitActive(state) ? "点击道路附近添加测量点" : "自由折线测量";
  overlay.hidden = !showOverlay;
  readout.hidden = !active;
  clear.disabled = points.length === 0;
  undo.disabled = points.length === 0;
  exportButton.disabled = points.length === 0;
  saveButton.disabled = points.length < 2 || !state.map;
  svg.replaceChildren();
  if (!showOverlay) return;

  const rect = canvas.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  appendSavedMeasurementShapes(documentRef, svg, state, savedMeasurements, rect);
  if (!active) return;

  const displayPoints = activeMeasurementDisplayPoints(state);
  const screenPoints = displayPoints.map(point => state.renderer.worldToScreen(point.x, point.y, rect));
  const controlScreenPoints = points.map(point => state.renderer.worldToScreen(point.x, point.y, rect));
  if (!measurementRouteFitActive(state) && screenPoints.length >= 3) {
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
  for (const [index, point] of controlScreenPoints.entries()) {
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
  const distance = measurementDistance(displayPoints);
  const area = !measurementRouteFitActive(state) && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0;
  const notice = state.measurement.notice ? `${state.measurement.notice} / ` : "";
  summary.textContent = `${notice}${measurementSummary(points.length, distance, area, units, editingMeasurementLabel(state))}`;
}

function visibleSavedMeasurements(state) {
  if (state.renderer?.layerVisibility?.measurements === false) return [];
  const editingId = state.measurement.active ? state.measurement.editingMeasurementId : null;
  return (state.map?.measurements?.items || [])
    .filter(item => item?.id !== editingId && Array.isArray(item?.points) && item.points.length >= 1);
}

function appendSavedMeasurementShapes(documentRef, svg, state, measurements, rect) {
  if (!measurements.length || !state.renderer) return;
  for (const item of measurements) {
    const displayPoints = measurementDisplayPoints(item, state.map);
    const screenPoints = displayPoints.map(point => state.renderer.worldToScreen(point.x, point.y, rect));
    if (screenPoints.length === 1 || item.type === "point") {
      const point = screenPoints[0];
      if (!point) continue;
      const circle = documentRef.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "measurement-object-point");
      circle.dataset.measurementObject = String(item.id || "");
      circle.setAttribute("cx", roundMeasurementDisplay(point.x));
      circle.setAttribute("cy", roundMeasurementDisplay(point.y));
      circle.setAttribute("r", "4.8");
      svg.append(circle);
      continue;
    }
    if (screenPoints.length >= 3 && normalizeMeasurementRouteFit(item.routeFit) !== MEASUREMENT_ROUTE_FIT_ROADS && (item.closed || item.type === "polygon")) {
      const polygon = documentRef.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("class", "measurement-object-area");
      polygon.dataset.measurementObject = String(item.id || "");
      polygon.setAttribute("points", screenPoints.map(point => `${roundMeasurementDisplay(point.x)},${roundMeasurementDisplay(point.y)}`).join(" "));
      svg.append(polygon);
    }
    const polyline = documentRef.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("class", "measurement-object-path");
    polyline.dataset.measurementObject = String(item.id || "");
    polyline.setAttribute("points", screenPoints.map(point => `${roundMeasurementDisplay(point.x)},${roundMeasurementDisplay(point.y)}`).join(" "));
    svg.append(polyline);
  }
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

function measurementPointFromPointer(state, documentRef, event) {
  if (measurementRouteFitActive(state)) {
    const snap = routeMeasurementSnapFromPointer(state, event);
    if (!snap) {
      state.measurement.notice = "贴路测量需要点击道路附近";
      setFileOperationStatus(documentRef, "贴路测量需要点击道路附近；切到“自由”可离开道路。");
      return null;
    }
    return snap.point;
  }
  const world = state.renderer.screenToWorld(event.clientX, event.clientY);
  return {
    x: clampMeasurementValue(world.x, 0, state.map.metadata.graphWidth),
    y: clampMeasurementValue(world.y, 0, state.map.metadata.graphHeight)
  };
}

function routeMeasurementSnapFromPointer(state, event) {
  if (!state.map || !state.renderer) return null;
  const world = state.renderer.screenToWorld(event.clientX, event.clientY);
  const maxDistanceWorld = measurementRouteFitThresholdWorld(state, event);
  const snap = findNearestRouteMeasurementPoint(state.map, world, maxDistanceWorld);
  if (!snap?.point) return null;
  return {
    ...snap,
    point: {
      x: clampMeasurementValue(snap.point.x, 0, state.map.metadata.graphWidth),
      y: clampMeasurementValue(snap.point.y, 0, state.map.metadata.graphHeight),
      cellStop: {
        routeId: snap.routeId,
        routeType: snap.routeType,
        segmentIndex: snap.segmentIndex,
        packCell: snap.packCell,
        x: snap.point.x,
        y: snap.point.y
      }
    }
  };
}

function measurementRouteFitThresholdWorld(state, event, thresholdPx = 18) {
  const world = state.renderer.screenToWorld(event.clientX, event.clientY);
  const shifted = state.renderer.screenToWorld(event.clientX + thresholdPx, event.clientY);
  const distance = Math.hypot(shifted.x - world.x, shifted.y - world.y);
  return Number.isFinite(distance) && distance > 0 ? distance : thresholdPx;
}

function measurementRouteFitActive(state) {
  return normalizeMeasurementRouteFit(state.measurement.routeFit) === MEASUREMENT_ROUTE_FIT_ROADS;
}

function activeMeasurementDisplayPoints(state) {
  const points = state.measurement.points || [];
  const routeFit = normalizeMeasurementRouteFit(state.measurement.routeFit);
  const cellStops = routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? normalizeMeasurementCellStops([], points, points) : [];
  return measurementDisplayPoints({points, routeFit, cellStops}, state.map);
}

function exportMeasurement(state, documentRef) {
  if (!state.map || !state.measurement.points?.length) return;
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const routeFit = normalizeMeasurementRouteFit(state.measurement.routeFit);
  const cellStops = routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? normalizeMeasurementCellStops([], state.measurement.points, state.measurement.points) : [];
  const points = state.measurement.points.map((point, index) => ({
    index,
    x: roundMeasurementExport(point.x),
    y: roundMeasurementExport(point.y)
  }));
  const displayPoints = measurementDisplayPoints({points: state.measurement.points, routeFit, cellStops}, state.map);
  const distance = measurementDistance(displayPoints);
  const area = routeFit !== MEASUREMENT_ROUTE_FIT_ROADS && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0;
  const payload = {
    type: "webgl-generator-measurement",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: state.map.metadata?.seed || "",
      checksum: state.map.metadata?.checksum || "",
      graphWidth: state.map.metadata?.graphWidth || 0,
      graphHeight: state.map.metadata?.graphHeight || 0,
      pointCount: points.length,
      displayPointCount: displayPoints.length,
      routeFit,
      routeStopCount: cellStops.filter(Boolean).length
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
      areaLabel: area ? formatDisplayArea(area, units) : ""
    },
    points,
    cellStops
  };
  downloadText(documentRef, JSON.stringify(payload, null, 2), `${mapFileBaseName(state.map)}.measurement.json`, "application/json;charset=utf-8");
}

function saveCurrentMeasurement(state, documentRef) {
  if (!state.map || !state.measurement.points?.length) return;
  const context = {map: state.map};
  if (state.measurement.editingMeasurementId) {
    const measurementId = state.measurement.editingMeasurementId;
    const command = createUpdateMeasurementPointsCommand(measurementId, state.measurement.points, {routeFit: state.measurement.routeFit});
    if (command.isNoop(context)) {
      setFileOperationStatus(documentRef, "测量对象没有可保存的形状变化，或点数不足。");
      return;
    }
    refreshAfterEdit(state, state.editHistory.execute(command, context));
    state.measurement.editingMeasurementId = null;
    state.measurement.points = [];
    cancelMeasurementDrag(state, documentRef);
    updateMeasurementOverlay(state, documentRef);
    updateMeasurementPanel(state);
    state.panels.measurement?.setSelectedMeasurementId?.(measurementId);
    setFileOperationStatus(documentRef, `已更新测量对象 ${measurementId}。`);
    return;
  }

  const command = createSaveMeasurementCommand(state.measurement.points, {routeFit: state.measurement.routeFit});
  if (command.isNoop(context)) {
    setFileOperationStatus(documentRef, "至少需要 2 个测量点才能保存。");
    return;
  }
  refreshAfterEdit(state, state.editHistory.execute(command, context));
  const created = command.getMeasurement?.();
  state.measurement.points = [];
  cancelMeasurementDrag(state, documentRef);
  updateMeasurementOverlay(state, documentRef);
  updateMeasurementPanel(state);
  state.panels.measurement?.setSelectedMeasurementId?.(created?.id);
  setFileOperationStatus(documentRef, `已保存测量对象 ${created?.name || created?.id || ""}。`);
}

function startMeasurementObjectEdit(state, row, documentRef) {
  const item = findMeasurement(state.map, row.id);
  if (!item || !Array.isArray(item.points) || item.points.length < 1) return;
  cancelMeasurementDrag(state, documentRef);
  state.measurement.editingMeasurementId = item.id;
  state.measurement.points = item.points.map((point, index) => ({
    x: point.x,
    y: point.y,
    ...(item.cellStops?.[index] ? {cellStop: item.cellStops[index]} : {})
  }));
  state.measurement.routeFit = normalizeMeasurementRouteFit(item.routeFit);
  state.measurement.active = true;
  state.panels.measurement?.setSelectedMeasurementId?.(item.id);
  locateMeasurement(state, {...row, points: item.points}, documentRef);
  updateMeasurementOverlay(state, documentRef);
  setFileOperationStatus(documentRef, `正在编辑测量对象 ${item.name || item.id}，拖动、插入或删除节点后可保存修改。`);
}

function locateMeasurement(state, row, documentRef) {
  const bounds = measurementBounds(row, 48, state.map);
  const located = bounds ? state.renderer.locateBounds(bounds, {
    status: `measurement ${row.id}`,
    minScale: row.pointCount <= 2 ? 2.2 : 1.4,
    maxScale: 18
  }) : false;
  if (located) {
    state.panels.measurement?.setSelectedMeasurementId?.(row.id);
  }
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
}

function exportMeasurementObjects(state, documentRef, rows) {
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const measurements = (rows || []).map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    routeFit: normalizeMeasurementRouteFit(row.routeFit),
    pointCount: row.pointCount,
    distanceMapUnits: roundMeasurementExport(row.distance),
    distanceLabel: formatDisplayDistance(row.distance, units),
    areaMapUnits: roundMeasurementExport(row.area),
    areaLabel: row.area ? formatDisplayArea(row.area, units) : "",
    cellStops: row.cellStops || [],
    points: (row.points || []).map((point, index) => ({
      index,
      x: roundMeasurementExport(point.x),
      y: roundMeasurementExport(point.y)
    })),
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || ""
  }));
  const payload = {
    type: "webgl-generator-measurements",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: state.map?.metadata?.seed || "",
      checksum: state.map?.metadata?.checksum || "",
      measurements: measurements.length
    },
    units: {
      distanceUnit: units.distanceUnit,
      areaUnit: units.areaUnit,
      mapScaleKmPerCm: units.mapScaleKmPerCm
    },
    measurements
  };
  downloadText(documentRef, JSON.stringify(payload, null, 2), `${mapFileBaseName(state.map)}.measurements.json`, "application/json;charset=utf-8");
  setFileOperationStatus(documentRef, `测量对象已导出，共 ${measurements.length} 条。`);
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
  if (measurementRouteFitActive(state)) {
    const snap = routeMeasurementSnapFromPointer(state, event);
    if (!snap) return;
    point.x = snap.point.x;
    point.y = snap.point.y;
    point.cellStop = snap.point.cellStop;
    return;
  }
  const world = state.renderer.screenToWorld(event.clientX, event.clientY);
  point.x = clampMeasurementValue(world.x, 0, state.map.metadata.graphWidth);
  point.y = clampMeasurementValue(world.y, 0, state.map.metadata.graphHeight);
  delete point.cellStop;
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

function measurementSummary(pointCount, distance, area, units, editingLabel = "") {
  const prefix = editingLabel ? `编辑 ${editingLabel} / ` : "";
  if (pointCount === 0) return `${prefix}点击地图添加起点`;
  if (pointCount === 1) return `${prefix}继续点击添加测量点`;
  const distanceText = `${pointCount} 点 / 总长 ${formatDisplayDistance(distance, units)}`;
  if (pointCount < 3) return `${prefix}${distanceText}`;
  return `${prefix}${distanceText} / 面积 ${formatDisplayArea(area, units)}`;
}

function editingMeasurementLabel(state) {
  const item = findMeasurement(state.map, state.measurement.editingMeasurementId);
  return item?.name || item?.id || "";
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
    if (state.stateEdit.deleteMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const stateId = getStateIdAtEvent(state, event);
      if (!Number.isInteger(stateId) || stateId <= 0) return;
      const command = createDeleteStateCommand(stateId);
      if (command.isNoop({map: state.map})) return;
      refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
      state.stateEdit.deleteMode = false;
      state.stateEdit.lastAffected = 0;
      state.selectionStore.clear();
      state.panels.state?.setTargetStateId(0);
      state.panels.state?.updateDeleteMode?.(false);
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, canvas.ownerDocument || document);
      updateRuntimePanel(canvas.ownerDocument || document, state);
      return;
    }
    if (state.stateEdit.addMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
      if (!Number.isInteger(pick?.gridCell) || pick.gridCell < 0) return;
      const command = createAddStateAtCellCommand(pick.gridCell);
      if (command.isNoop({map: state.map})) return;
      refreshAfterStateEdit(state, state.editHistory.execute(command, {map: state.map}));
      const result = command.getResult?.();
      state.stateEdit.addMode = false;
      state.stateEdit.lastAffected = result?.cells || 0;
      state.stateEdit.sourceStateId = result?.stateId || null;
      if (Number.isInteger(result?.stateId)) {
        const stateObject = resolveObject(state.map, {kind: OBJECT_KIND.STATE, id: result.stateId}) || {kind: OBJECT_KIND.STATE, id: result.stateId};
        state.panels.state?.setTargetStateId(result.stateId);
        state.selectionStore.setSelection({object: stateObject});
      }
      state.panels.state?.updateAddMode?.(false);
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, canvas.ownerDocument || document);
      updateRuntimePanel(canvas.ownerDocument || document, state);
      return;
    }
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
    if (state.provinceEdit.deleteMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const provinceId = getProvinceIdAtEvent(state, event);
      if (!Number.isInteger(provinceId) || provinceId <= 0) return;
      const command = createDeleteProvinceCommand(provinceId);
      if (command.isNoop({map: state.map})) return;
      refreshAfterProvinceEdit(state, state.editHistory.execute(command, {map: state.map}));
      state.provinceEdit.deleteMode = false;
      state.provinceEdit.lastAffected = 0;
      state.selectionStore.clear();
      state.panels.province?.setSelectedProvinceId(0);
      state.panels.province?.updateDeleteMode?.(false);
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, canvas.ownerDocument || document);
      updateRuntimePanel(canvas.ownerDocument || document, state);
      return;
    }
    if (state.provinceEdit.addMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
      if (!Number.isInteger(pick?.gridCell) || pick.gridCell < 0) return;
      const command = createAddProvinceAtCellCommand(pick.gridCell);
      if (command.isNoop({map: state.map})) return;
      refreshAfterProvinceEdit(state, state.editHistory.execute(command, {map: state.map}));
      const result = command.getResult?.();
      state.provinceEdit.addMode = false;
      state.provinceEdit.lastAffected = result?.cells || 0;
      state.provinceEdit.sourceProvinceId = result?.provinceId || null;
      if (Number.isInteger(result?.provinceId)) {
        state.panels.province?.setSelectedProvinceId(result.provinceId);
        state.selectionStore.setSelection({object: {kind: OBJECT_KIND.PROVINCE, id: result.provinceId}});
      }
      state.panels.province?.updateAddMode?.(false);
      updateAllObjectPanels(state);
      updateEditingInteractionLock(state, canvas.ownerDocument || document);
      updateRuntimePanel(canvas.ownerDocument || document, state);
      return;
    }
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

function bindCityEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (state.cityEdit.deleteMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const cityId = getCityIdAtEvent(state, event);
      if (!Number.isInteger(cityId) || cityId < 0) return;
      const command = createDeleteCityCommand(cityId);
      if (command.isNoop({map: state.map})) return;
      refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
      state.cityEdit.deleteMode = false;
      state.selectionStore.clear();
      state.panels.city?.setSelectedCityId(null);
      state.panels.city?.updateDeleteMode?.(false);
      updateStatePanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
      updateEditingInteractionLock(state, documentRef);
      updateRuntimePanel(documentRef, state);
      return;
    }
    if (!state.cityEdit.addMode || !state.map) return;
    if (!isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
    if (!Number.isInteger(pick?.gridCell) || pick.gridCell < 0) return;
    const command = createAddCityAtCellCommand(pick.gridCell);
    if (command.isNoop({map: state.map})) return;
    refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
    const result = command.getResult?.();
    state.cityEdit.addMode = false;
    state.cityEdit.lastCreatedCityId = result?.cityId ?? null;
    if (Number.isInteger(result?.cityId)) {
      state.panels.city?.setSelectedCityId(result.cityId);
      state.selectionStore.setSelection({object: {kind: OBJECT_KIND.CITY, id: result.cityId}});
    }
    state.panels.city?.updateAddMode?.(false);
    updateStatePanel(state);
    updateProvincePanel(state);
    updateCityPanel(state);
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
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

function bindCustomLabelDrag(state, documentRef) {
  const overlay = state.renderer?.overlay;
  const canvas = state.renderer?.canvas;
  if (!overlay || !canvas) return;

  canvas.addEventListener("pointerdown", event => {
    const placement = state.pendingCustomLabelPlacement;
    if (!placement || !state.map || !isPrimaryPointerDown(event)) return;
    const label = findCustomLabel(state.map, placement.labelId);
    if (!label) {
      state.pendingCustomLabelPlacement = null;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = state.renderer.screenToWorld(event.clientX, event.clientY);
    setCustomLabelLivePosition(state, label, point);
    placement.command?.setCreatedPoint?.(point);
    startCustomLabelDrag(state, documentRef, event, label, {
      placementCommand: placement.command,
      captureTarget: canvas
    });
  }, true);

  overlay.addEventListener("pointerdown", event => {
    if (!state.map || !isPrimaryPointerDown(event)) return;
    const node = event.target?.closest?.(".custom-label");
    const labelId = Number(node?.dataset?.labelTargetId);
    if (!node || !Number.isInteger(labelId)) return;
    const label = findCustomLabel(state.map, labelId);
    if (!label) return;

    event.preventDefault();
    event.stopPropagation();
    const placement = state.pendingCustomLabelPlacement?.labelId === labelId ? state.pendingCustomLabelPlacement : null;
    startCustomLabelDrag(state, documentRef, event, label, {
      node,
      placementCommand: placement?.command || null,
      captureTarget: node
    });
  }, true);
}

function startCustomLabelDrag(state, documentRef, event, label, {node = null, placementCommand = null, captureTarget = null} = {}) {
  const object = labelObjectFromCustomLabel(label);
  state.selectionStore.setSelection({object});
  state.panels.labelNaming?.setSelectedLabelKey?.(labelKeyForObject(object));
  const labelNode = node || customLabelNode(state, label.id);
  state.customLabelDrag = {
    pointerId: event.pointerId,
    labelId: label.id,
    node: labelNode,
    captureTarget: captureTarget || labelNode,
    startedAt: {x: label.x, y: label.y},
    placementCommand,
    moved: false
  };
  labelNode?.classList.add("dragging");
  capturePointer(state.customLabelDrag.captureTarget, event.pointerId);

  const view = documentRef.defaultView || window;
  const move = moveEvent => updateCustomLabelDrag(state, documentRef, moveEvent);
  const end = endEvent => finishCustomLabelDrag(state, documentRef, endEvent);
  state.customLabelDrag.move = move;
  state.customLabelDrag.end = end;
  view.addEventListener("pointermove", move, true);
  view.addEventListener("pointerup", end, true);
  view.addEventListener("pointercancel", end, true);
}

function updateCustomLabelDrag(state, documentRef, event) {
  const drag = state.customLabelDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const label = findCustomLabel(state.map, drag.labelId);
  if (!label || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  setCustomLabelLivePosition(state, label, point);
  drag.moved = true;
  drag.placementCommand?.setCreatedPoint?.(point);
  updateLabelNamingPanel(state);
  updateRuntimePanel(documentRef, state);
}

function finishCustomLabelDrag(state, documentRef, event) {
  const drag = state.customLabelDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const view = documentRef.defaultView || window;
  view.removeEventListener("pointermove", drag.move, true);
  view.removeEventListener("pointerup", drag.end, true);
  view.removeEventListener("pointercancel", drag.end, true);
  drag.node?.classList.remove("dragging");
  releasePointer(drag.captureTarget, event.pointerId);
  state.customLabelDrag = null;

  const label = findCustomLabel(state.map, drag.labelId);
  if (!label) {
    updateLabelNamingPanel(state);
    return;
  }
  const finalPoint = {x: label.x, y: label.y};
  if (drag.placementCommand) {
    drag.placementCommand.setCreatedPoint?.(finalPoint);
    if (state.pendingCustomLabelPlacement?.labelId === drag.labelId) state.pendingCustomLabelPlacement = null;
    refreshAfterEdit(state, drag.placementCommand);
    updateLabelNamingPanel(state);
    updateRuntimePanel(documentRef, state);
    return;
  }

  const command = createMoveCustomLabelCommand(drag.labelId, finalPoint, {previousPoint: drag.startedAt});
  if (!command.isNoop({map: state.map})) {
    refreshAfterEdit(state, state.editHistory.execute(command, {map: state.map}));
  } else {
    state.renderer.refreshLabels?.();
  }
  updateLabelNamingPanel(state);
  updateRuntimePanel(documentRef, state);
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
  updateEconomyPanel(state);
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

function findCustomLabel(map, labelId) {
  return (map?.labels?.custom || []).find(label => label?.id === labelId) || null;
}

function setCustomLabelLivePosition(state, label, point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  label.x = point.x;
  label.y = point.y;
  state.renderer.updateCustomLabelPosition?.(label.id, point);
}

function customLabelNode(state, labelId) {
  return state.renderer?.overlay?.querySelector?.(`.custom-label[data-label-target-id="${labelId}"]`) || null;
}

function labelObjectFromCustomLabel(label) {
  return {
    kind: OBJECT_KIND.LABEL,
    id: label.id,
    targetKind: LABEL_TARGET_KIND.CUSTOM,
    targetId: label.id,
    text: label.text,
    targetName: label.text
  };
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
    currentHeightStats: summarizeCurrentHeightStats(state.map),
    currentHeightPreview: buildCurrentHeightPreview(state.map),
    history: state.editHistory.getStats()
  });
}

function summarizeCurrentHeightStats(map) {
  const heights = map?.grid?.cells?.h;
  if (!heights?.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let water = 0;
  let sum = 0;
  for (const height of heights) {
    const value = Number(height) || 0;
    if (value < min) min = value;
    if (value > max) max = value;
    if (value < 20) water += 1;
    sum += value;
  }
  const total = heights.length;
  return {
    min: Math.round(min),
    max: Math.round(max),
    water,
    total,
    average: Math.round((sum / Math.max(1, total)) * 10) / 10
  };
}

function buildCurrentHeightPreview(map) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const heights = cells?.h;
  if (!heights?.length || !points?.length || !cells?.p?.length) return null;
  const graphWidth = Math.max(1, Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1440);
  const graphHeight = Math.max(1, Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 960);
  const width = 96;
  const height = Math.max(32, Math.round(width * graphHeight / graphWidth));
  const totals = new Float32Array(width * height);
  const counts = new Uint16Array(width * height);
  let globalSum = 0;

  for (let cell = 0; cell < heights.length; cell += 1) {
    const point = points[cells.p[cell]];
    if (!point) continue;
    const sampleX = clampInteger(Math.floor((point[0] / graphWidth) * width), 0, width - 1);
    const sampleY = clampInteger(Math.floor((point[1] / graphHeight) * height), 0, height - 1);
    const index = sampleY * width + sampleX;
    const value = clampInteger(Math.round(Number(heights[cell]) || 0), 0, 100);
    totals[index] += value;
    counts[index] += 1;
    globalSum += value;
  }

  const fallback = clampInteger(Math.round(globalSum / Math.max(1, heights.length)), 0, 100);
  const samples = Array.from({length: totals.length}, (_, index) => (
    counts[index] ? clampInteger(Math.round(totals[index] / counts[index]), 0, 100) : fallback
  ));
  return {width, height, samples};
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function updateStatePanel(state) {
  if (!isPanelOpen(state.panels.state)) return;
  state.panels.state?.update({
    map: state.map,
    lastAffected: state.stateEdit.lastAffected,
    sourceStateId: state.stateEdit.sourceStateId,
    history: state.editHistory.getStats()
  });
}

function updateGovernmentPanel(state) {
  if (!isPanelOpen(state.panels.government)) return;
  state.panels.government?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateProvincePanel(state) {
  if (!isPanelOpen(state.panels.province)) return;
  state.panels.province?.update(state.map, state.selection, state.editHistory.getStats(), {
    lastAffected: state.provinceEdit.lastAffected,
    sourceProvinceId: state.provinceEdit.sourceProvinceId
  });
}

function updateCityPanel(state) {
  if (!isPanelOpen(state.panels.city)) return;
  state.panels.city?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateCulturePanel(state) {
  if (!isPanelOpen(state.panels.culture)) return;
  state.panels.culture?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateReligionPanel(state) {
  if (!isPanelOpen(state.panels.religion)) return;
  state.panels.religion?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateDiplomacyPanel(state) {
  if (!isPanelOpen(state.panels.diplomacy)) return;
  state.panels.diplomacy?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateEconomyPanel(state) {
  if (!isPanelOpen(state.panels.economy)) return;
  state.panels.economy?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateMilitaryPanel(state) {
  if (!isPanelOpen(state.panels.military)) return;
  state.panels.military?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateMarkerPanel(state) {
  if (!isPanelOpen(state.panels.marker)) return;
  state.panels.marker?.update(state.map, state.selection, state.editHistory.getStats());
  state.panels.marker?.updateEditMode?.(state.markerEdit);
}

function updateLabelNamingPanel(state) {
  if (!isPanelOpen(state.panels.labelNaming)) return;
  state.panels.labelNaming?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateNotesPanel(state) {
  if (isPanelOpen(state.panels.notes)) state.panels.notes?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateAllObjectPanels(state) {
  updateStatePanel(state);
  updateProvincePanel(state);
  updateCityPanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateEconomyPanel(state);
  updateMilitaryPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  updateRoutePanel(state);
  updateRiverPanel(state);
  updateLakePanel(state);
  updateZonePanel(state);
  updateNotesPanel(state);
  updateMeasurementPanel(state);
}

function updateLakePanel(state) {
  if (isPanelOpen(state.panels.lake)) state.panels.lake?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateZonePanel(state) {
  if (isPanelOpen(state.panels.zone)) state.panels.zone?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateMeasurementPanel(state) {
  if (isPanelOpen(state.panels.measurement)) state.panels.measurement?.update(state.map, state.editHistory.getStats());
}

function updateRoutePanel(state) {
  if (isPanelOpen(state.panels.route)) state.panels.route?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateRiverPanel(state) {
  if (isPanelOpen(state.panels.river)) state.panels.river?.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
}

function isPanelOpen(panel) {
  return Boolean(panel?.isOpen?.());
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

function getCityIdAtEvent(state, event) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  const object = pick?.cityObject || pick?.object;
  if (object?.kind === OBJECT_KIND.CITY || object?.kind === "city") {
    const id = Number(object.id);
    return Number.isInteger(id) ? id : null;
  }
  const packCell = Number.isInteger(pick?.packCell) ? pick.packCell : null;
  const burgId = Number.isInteger(packCell) ? state.map?.pack?.cells?.burg?.[packCell] : null;
  if (!Number.isInteger(burgId) || burgId <= 0) return null;
  const city = (state.map?.settlements?.cities || []).find(item => item && (item.burgId === burgId || item.id === burgId));
  return Number.isInteger(city?.id) ? city.id : null;
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
  return Boolean(state.panels.height?.getBrush().active || state.panels.state?.getBrush().active || state.stateEdit.addMode || state.stateEdit.deleteMode || state.panels.province?.getBrush().active || state.provinceEdit.addMode || state.provinceEdit.deleteMode || state.cityEdit.addMode || state.cityEdit.deleteMode || state.markerEdit.mode || state.editingObject);
}

function getAllowedEditingPanelIds(state) {
  if (state.panels.height?.getBrush().active) return ["height-panel"];
  if (state.panels.state?.getBrush().active) return ["state-panel"];
  if (state.stateEdit.addMode) return ["state-panel"];
  if (state.stateEdit.deleteMode) return ["state-panel"];
  if (state.panels.province?.getBrush().active) return ["province-panel"];
  if (state.provinceEdit.addMode) return ["province-panel"];
  if (state.provinceEdit.deleteMode) return ["province-panel"];
  if (state.cityEdit.addMode) return ["city-panel"];
  if (state.cityEdit.deleteMode) return ["city-panel"];
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
      addMode: Boolean(state.stateEdit.addMode),
      deleteMode: Boolean(state.stateEdit.deleteMode),
      targetStateId: stateBrush.targetStateId ?? null,
      lastAffected: state.stateEdit.lastAffected,
      sourceStateId: state.stateEdit.sourceStateId
    },
    provinceBrush: {
      active: Boolean(provinceBrush.active),
      addMode: Boolean(state.provinceEdit.addMode),
      deleteMode: Boolean(state.provinceEdit.deleteMode),
      targetProvinceId: provinceBrush.targetProvinceId ?? null,
      lastAffected: state.provinceEdit.lastAffected,
      sourceProvinceId: state.provinceEdit.sourceProvinceId
    },
    city: {
      addMode: Boolean(state.cityEdit.addMode),
      deleteMode: Boolean(state.cityEdit.deleteMode),
      lastCreatedCityId: state.cityEdit.lastCreatedCityId
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
  if (state.stateEdit.addMode) return "state:add";
  if (state.stateEdit.deleteMode) return "state:delete";
  if (stateBrush.active) return "state";
  if (state.provinceEdit.addMode) return "province:add";
  if (state.provinceEdit.deleteMode) return "province:delete";
  if (provinceBrush.active) return "province";
  if (state.cityEdit.addMode) return "city:add";
  if (state.cityEdit.deleteMode) return "city:delete";
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
