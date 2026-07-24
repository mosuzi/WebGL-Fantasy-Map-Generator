import {defineBiomesAndPopulation} from "../generator/biomes.js";
import {buildClimate} from "../generator/climate.js";
import {createGenerationSummary, generatePlaceholderMap} from "../generator/index.js";
import {createNamebaseImportPreview, NAMEBASE_BINDING_TARGETS, parseNamebaseDocument} from "../generator/namebase-store.js";
import {buildMilitary, MILITARY_STATUSES} from "../generator/military.js";
import {backfillRiverHydrology, buildRivers, renameHydronymsByCulture} from "../generator/rivers.js";
import {regeneratePackProvincesWithinStates, regeneratePackStatesAndProvinces} from "../generator/politics.js";
import {finalizeSocietyReligions} from "../generator/society.js";
import {buildZones} from "../generator/zones.js";
import {reconcileWarDerivedData} from "../generator/war-consistency.js";
import {finalizeSettlements, regenerateSettlementsWithinPolitics} from "../generator/settlements.js";
import {DEFAULT_OPTIONS, normalizeOptions} from "../generator/options.js";
import {normalizeAtmosphereDirection, normalizeClimateLatitudeMode, normalizeWindProfile, windAngleFromDirection} from "../generator/climate-options.js";
import {createRandom, createRandomSeed} from "../generator/random.js";
import {PlaceholderMapRenderer} from "../renderer/placeholder-renderer.js";
import {
  createUserVisualThemeDocument,
  exportVisualThemeDocument,
  isUserVisualTheme,
  listUserVisualThemeDocuments,
  listVisualThemes,
  mergeUserVisualThemes,
  normalizeVisualThemeDocument,
  normalizeVisualThemeId,
  replaceUserVisualThemes,
  updateUserVisualThemeDocument,
  visualThemeOptions
} from "../renderer/themes.js";
import {PanelManager} from "../ui/panel-manager.js";
import {createBrushCursorPreview} from "../ui/brush-cursor-preview.js";
import {bindRuntimePanel, readControlPreferences, readOptionsFromPanel, setActiveModeButton, setEditingInteractionLock, setGenerationLoading, setSeedInput, updateControlPreferences, updateLayerPreference, updatePickPanel, updateRegenerationSection, updateRuntimePanel} from "../ui/panel.js";
import {formatArea as formatDisplayArea, formatDistance as formatDisplayDistance, normalizeUnitPreferences} from "../ui/display-units.js";
import {sameObjectId} from "../ui/object-id.js";
import {createBiomePanel} from "../ui/panels/biome-panel.js";
import {createCityPanel} from "../ui/panels/city-panel.js";
import {createClimatePanel} from "../ui/panels/climate-panel.js";
import {createCulturePanel} from "../ui/panels/culture-panel.js";
import {createDevelopmentPanel} from "../ui/panels/development-panel.js";
import {createDiplomacyPanel} from "../ui/panels/diplomacy-panel.js";
import {createEconomyPanel} from "../ui/panels/economy-panel.js";
import {createEmblemPanel} from "../ui/panels/emblem-panel.js";
import {createFeaturePanel} from "../ui/panels/feature-panel.js";
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
import {createOceanCurrentPanel} from "../ui/panels/ocean-current-panel.js";
import {createObjectDetailsPanel} from "../ui/panels/object-details-panel.js";
import {createPopulationPanel} from "../ui/panels/population-panel.js";
import {createProvincePanel} from "../ui/panels/province-panel.js";
import {createReligionPanel} from "../ui/panels/religion-panel.js";
import {createRiverPanel} from "../ui/panels/river-panel.js";
import {createRoutePanel} from "../ui/panels/route-panel.js";
import {createStatePanel} from "../ui/panels/state-panel.js";
import {createZonePanel} from "../ui/panels/zone-panel.js";
import {scheduleLazyVuePanelPreload} from "../ui/panels/lazy-vue-panel.js";
import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {createEditRefreshScheduler} from "./edit-refresh-scheduler.js";
import {BROWSER_MAP_STORAGE_KEY, decodeBrowserMapStoragePayload, encodeBrowserMapStoragePayload} from "./browser-map-storage.js";
import {createImportFmgCellsHeightCommand} from "./fmg-cells-geojson-import.js";
import {EditHistory} from "./edit-history.js";
import {createGrayscaleHeightmapFromImage, createPaletteHeightmapFromImage, normalizeHeightmapImportPayload} from "./heightmap-import.js";
import {createMapDocument, downloadText, mapFileBaseName, parseGeoJsonMeasurements, parseMapDocument, parseMapDocumentPayload, stringifyMapDocument} from "./map-file-io.js";
import {attachImportDiagnostic, createHeightmapSourceSummary, createImportFailureDiagnostic, createImportSuccessDiagnostic, createMapImportDiagnostic, formatMapImportDiagnosticLines, inspectGeoImportSource, stringifyMapImportDiagnostic} from "./map-import-diagnostics.js";
import {createAddCityAtCellCommand, createDeleteCityCommand, createRenameCitiesFromNamebaseCommand, createResetCityVisualCommand, createSetCityNoteCommand, createSetCityPopulationCommand, createSetCityVisualCommand, createSyncCityOwnerToCellCommand} from "./city-edit-commands.js";
import {createMoveCityCommand, inspectCityMove} from "./city-relocation.js";
import {bindCityRelocationDrag} from "./city-relocation-drag.js";
import {createAddCultureCommand, createApplyCultureAssignmentCommand, createDeleteCultureCommand, createSetCultureColorCommand, createSetCultureParentCommand} from "./culture-edit-commands.js";
import {createApplySocialExpansionCommand, inspectSocialExpansion, normalizeSocialExpansionMap} from "./social-expansion-edit-commands.js";
import {applyBiomeAssignmentPreview, BIOME_ASSIGNMENT_PREVIEW_EFFECTS, buildBiomeAssignmentChanges, createApplyBiomeAssignmentCommand, getBiomeBrushChanges, inspectBiomeAssignment} from "./biome-edit-commands.js";
import {applySuitabilityPreview, buildSuitabilityChanges, buildSuitabilityStrokeChanges, createApplySuitabilityCommand, getSuitabilityBrushChanges, inspectSuitabilityEdit, normalizeSuitabilityMap, restoreSuitabilityPreview, SUITABILITY_PREVIEW_EFFECTS} from "./suitability-edit-commands.js";
import {
  buildPopulationAdjustmentPlan,
  buildPopulationTransferPlan,
  createApplyPopulationAdjustmentCommand,
  createApplyPopulationTransferCommand,
  inspectPopulationAdjustment,
  inspectPopulationTransfer
} from "./population-adjustment-commands.js";
import {createRegenerateDiplomacyCommand, createSetDiplomacyRelationCommand} from "./diplomacy-edit-commands.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "./height-edit-commands.js";
import {getGlobalHeightChanges, getHeightBrushChanges, getHeightLineChanges, getHeightRangeTransformChanges, inspectGlobalHeightChanges, inspectHeightFillTarget, inspectHeightRangeTransform} from "./height-brush.js";
import {acceptHeightBrushSample} from "./height-brush-cadence.js";
import {composeHeightCellSelection, createHeightCellSelectionFeather, createHeightCellSelectionSet, createHeightCellSelectionSnapshot, createHeightCursorRadiusSelection, restoreHeightCellSelectionSnapshot, transformHeightCellSelection} from "./height-cell-selection.js";
import {createHeightSelectionSmoothingPlan} from "./height-selection-smoothing.js";
import {getHeightTerrainTemplateChanges, heightTerrainTemplateLabel, heightTerrainTemplateUsesSeed, inspectHeightTerrainTemplate} from "./height-terrain-templates.js";
import {getHeightTerrainTemplateProgramChanges, heightTerrainTemplateProgramUsesSeed, inspectHeightTerrainTemplateProgram} from "./height-terrain-template-programs.js";
import {createRegenerationResult, HEIGHT_BASE_REBUILD_STEPS, HEIGHT_DOWNSTREAM_REBUILD_STEPS, rebuildHeightAllDerived, rebuildHeightBaseDerived, rebuildHeightDownstreamDerived} from "./height-derived-rebuild.js";
import {buildSeafloorResetPlan, createResetSeafloorCommand, seafloorResetPreviewChanges} from "./seafloor-reset.js";
import {createRegenerateOceanCurrentsCommand, createRenameOceanCurrentCommand} from "./ocean-current-edit-commands.js";
import {assertOceanCurrentWorldIdentity, rebuildOceanCurrentWorldStage, snapshotOceanCurrentWorldIdentity} from "../generator/ocean-current-world.js";
import {executeOceanCurrentWorldRebuild, inspectOceanCurrentWorldRebuild} from "./ocean-current-world-rebuild.js";
import {oceanCurrentBounds} from "../renderer/ocean-current-layer.js";
import {createAddCustomLabelCommand, createDeleteLabelCommand, createMoveCustomLabelCommand, createRenameCustomLabelCommand, createRestoreGeneratedLabelCommand, createSetLabelNoteCommand, ensureLabelStore} from "./label-edit-commands.js";
import {createPatchLabelStyleCommand, createResetAllLabelStylesCommand, createResetLabelStyleCommand} from "./label-style-edit-commands.js";
import {LABEL_STYLE_TYPES, readLabelStyleOverride, resolveLabelStyle} from "./label-style-registry.js";
import {createPatchLabelLayoutCommand} from "./label-layout-edit-commands.js";
import {readLabelLayoutOverride} from "./label-layout-registry.js";
import {createAddMarkerCommand, createDeleteMarkerCommand, createMoveMarkerCommand, createRegenerateResourceMarkersCommand, createSetMarkerNoteCommand, createSetMarkerVisualCommand, regenerateResourceMarkersInChunks} from "./marker-edit-commands.js";
import {createDeleteMeasurementCommand, createImportMeasurementsCommand, createRenameMeasurementCommand, createSaveMeasurementCommand, createUpdateMeasurementPointsCommand} from "./measurement-edit-commands.js";
import {measurementHighlightObject, measurementShapeClass} from "./measurement-highlights.js";
import {
  ensureMeasurementStore,
  findMeasurement,
  MEASUREMENT_DRAW_AREA,
  MEASUREMENT_DRAW_CURVE,
  MEASUREMENT_DRAW_ROUTE,
  MEASUREMENT_DRAW_RULER,
  measurementArea,
  measurementBounds,
  measurementDisplayPoints,
  measurementDistance,
  normalizeMeasurementCellStops
} from "./measurement-objects.js";
import {simplifyMeasurementPoints} from "./measurement-geometry.js";
import {findNearestRouteMeasurementPoint, MEASUREMENT_ROUTE_FIT_NONE, MEASUREMENT_ROUTE_FIT_ROADS, normalizeMeasurementRouteFit} from "./measurement-route-fit.js";
import {createClearMilitaryBattleEventsCommand, createImportMilitaryBattleEventsCommand, createMoveMilitaryStationCommand, createRecordMilitaryBattleEventCommand, createRenameMilitaryRegimentCommand, createSetMilitaryBaseCommand, createSetMilitaryRatiosCommand, createSetMilitaryStatusBatchCommand, createSetMilitaryStatusCommand} from "./military-edit-commands.js";
import {compareMilitaryVariation, snapshotMilitaryVariation, syncMilitaryStateMirrors} from "./military-regeneration-variation.js";
import {createClearUserNamebasesCommand, createCopyBuiltinNamebaseCommand, createCreateUserNamebaseCommand, createDeleteUserNamebaseCommand, createImportNamebasesCommand, createRenameUserNamebaseCommand, createSetNamebaseBindingCommand, createUpdateUserNamebaseCommand, createUpdateUserNamebaseOptionsCommand, createUpdateUserNamebaseSourceCommand} from "./namebase-edit-commands.js";
import {createDeleteNoteCommand, createStandaloneNoteCommand} from "./note-edit-commands.js";
import {createDeleteNotesBatchCommand, createImportNotesCommand, inspectNotesImport} from "./note-import.js";
import {applyMarketAssignmentPreview, buildMarketAssignmentChanges, createApplyMarketAssignmentCommand, createRebuildEconomyCommand, createSetGoodDisplayCommand, createSetMarketDisplayCommand, getMarketAssignmentBrushChanges, inspectMarketAssignment, MARKET_ASSIGNMENT_PREVIEW_EFFECTS, restoreMarketAssignmentPreview} from "./economy-edit-commands.js";
import {createRenameNamedObjectsFromNamebaseCommand, createRenameObjectCommand, createSetObjectNoteCommand, createSetProvinceColorCommand, createSetStateCapitalCommand} from "./object-edit-commands.js";
import {createApplyFeaturePatchCommand, createDeleteLakeCommand, createExcavateLakeCommand, createRenameLakesFromNamebaseCommand, createSetLakeOutletCommand, inspectFeaturePatch, inspectLakeOutletChange} from "./lake-edit-commands.js";
import {createApplyFeatureTopologyCommand, FEATURE_TOPOLOGY_MODE, inspectFeatureTopology, rebuildFeatureTopology} from "./feature-topology-edit-commands.js";
import {applyProvinceBrushPreview, createAddProvinceAtCellCommand, createApplyProvinceBrushCommand, createDeleteProvinceCommand, PROVINCE_BRUSH_PREVIEW_EFFECTS} from "./province-edit-commands.js";
import {
  createAddReligionCommand,
  createApplyReligionAssignmentCommand,
  createDeleteReligionCommand,
  createSetReligionColorCommand,
  createSetReligionParentCommand
} from "./religion-edit-commands.js";
import {applySocialAssignmentPreview, SOCIAL_ASSIGNMENT_PREVIEW_EFFECTS} from "./social-ownership-edit-commands.js";
import {resolveObject} from "./object-resolver.js";
import {MAX_PERSISTENT_OBJECT_HIGHLIGHTS, isPersistentHighlightObjectKind, normalizePersistentHighlights, samePersistentHighlightMembership} from "./persistent-highlights.js";
import {createAddRiverCommand, createDeleteRiverCommand, createRenameRiversFromNamebaseCommand, createSetRiverNoteCommand, createSetRiverWidthFactorCommand} from "./river-edit-commands.js";
import {createAddRouteCommand, createDeleteRouteCommand, createEditRouteCommand, createSetRouteNoteCommand, inspectRouteEdit} from "./route-edit-commands.js";
import {createDeleteBatchCommand, createDeleteConfirmationRequiredError, inspectDeleteImpact, requestDeleteConfirmation} from "./delete-impact.js";
import {executeClimateDownstreamRebuildAsync, inspectClimateDownstreamRebuild} from "./climate-downstream-rebuild.js";
import {captureMapMutationSnapshot, executeMapSnapshotTransaction, restoreMapMutationSnapshot} from "./map-snapshot-transaction.js";
import {SelectionStore} from "./selection-store.js";
import {decideSelectionPanelRoute, SELECTION_PANEL_BINDINGS, SELECTION_PANEL_ROUTE} from "./selection-panel-policy.js";
import {installKeyboardShortcuts} from "./keyboard-shortcuts.js";
import {applyStateBrushPreview, createAddStateAtCellCommand, createApplyStateBrushCommand, createDeleteStateCommand, createRenameStatesFromNamebaseCommand, createSetStateColorCommand, createSetStateGovernmentCommand, createSetStatesGovernmentBatchCommand, STATE_BRUSH_PREVIEW_EFFECTS} from "./state-edit-commands.js";
import {createMergeStatesCommand, createSplitStateCommand, inspectStateMerge, inspectStateSplit, regenerateProvincesForStates} from "./state-topology-commands.js";
import {createAddZoneCommand, createDeleteZoneCommand, createSetZoneStyleCommand} from "./zone-edit-commands.js";
import {captureVisualThemeState, createSetUserVisualThemesCommand} from "./visual-theme-edit-commands.js";
import {mergePersistedUserVisualThemes, persistUserVisualThemes} from "./visual-theme-storage.js";
import {collectionAffected, objectAffected, systemAffected} from "./edit-command-effects.js";
import {syncEditorStateSnapshot} from "../ui/vue/state-bridge.js";
import {completeStartupLoading, failStartupLoading} from "../ui/startup-loading.js";
import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";
import GenerationWorker from "./generation-worker.js?worker";
import {getWebglGeneratorHealthMonitor} from "./health-monitor.js";
import {createRuntimeOperationError, createRuntimeOperationManager} from "./runtime-operation.js";
import {createCanvasToolModeManager} from "./canvas-tool-mode-manager.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "./brush-radius-contract.js";
import {restoreCanvasToolStrokePreview} from "./canvas-tool-preview-rollback.js";
import {
  exportAllMapData,
  exportCompressedAllMapData,
  exportFeatureGeoJsonData,
  exportMeasurementsData,
  exportNamebasesData,
  exportNotesData,
  exportPackGeoJson,
  exportPngData,
  installConsoleApi
} from "./console-api.js";

const LOADING_MESSAGES = Object.freeze({
  request: "星图启明",
  generate: "山海初开",
  "map-import-read": "启封舆图",
  "map-import-decode": "辨读旧卷",
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
const STATE_TOPOLOGY_UI_HISTORY = new WeakMap();

const LOAD_TRACE_EVENT_NAME = "webgl-generator-load-stage";
const LOAD_TRACE_DELAY_PARAMS = Object.freeze(["loadStepDelay", "debugLoadDelay", "loadTraceDelay"]);
const MAX_DEBUG_LOAD_DELAY_MS = 2000;
const NAMEBASE_PREFERENCES_STORAGE_KEY = "webgl-generator-namebase-preferences-v1";
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
  "temperatureSouthPole",
  "precipitation"
]);
const REGENERATION_TRANSACTION_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["terrain-caches", "height-field", "cell-colors", "political-boundaries", "point-layers", "line-layers", "labels", "river-mesh", "route-mesh", "object-panels", "object-index"])
});
const CLIMATE_DERIVED_STALE_SYSTEMS = Object.freeze(["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);
const FEATURE_TOPOLOGY_UI_HISTORY = new WeakMap();
const CONTROL_PANEL_CHILD_OPEN_HANDLERS = Object.freeze([
  "onOpenHeightPanel",
  "onOpenStatePanel",
  "onOpenGovernmentPanel",
  "onOpenProvincePanel",
  "onOpenCityPanel",
  "onOpenBiomePanel",
  "onOpenClimatePanel",
  "onOpenPopulationPanel",
  "onOpenEmblemPanel",
  "onOpenFeaturePanel",
  "onOpenCulturePanel",
  "onOpenReligionPanel",
  "onOpenDiplomacyPanel",
  "onOpenEconomyPanel",
  "onOpenMilitaryPanel",
  "onOpenRiverPanel",
  "onOpenOceanCurrentPanel",
  "onOpenLakePanel",
  "onOpenZonePanel",
  "onOpenRoutePanel",
  "onOpenMarkerPanel",
  "onOpenLabelNamingPanel",
  "onOpenNotesPanel",
  "onOpenMeasurementPanel",
  "onOpenNamebasePanel"
]);
export const CANVAS_TOOL_MODE = Object.freeze({
  HEIGHT_BRUSH: "height:brush",
  STATE_BRUSH: "state:brush",
  STATE_ADD: "state:add",
  STATE_DELETE: "state:delete",
  PROVINCE_BRUSH: "province:brush",
  PROVINCE_ADD: "province:add",
  PROVINCE_DELETE: "province:delete",
  CITY_ADD: "city:add",
  CITY_DELETE: "city:delete",
  CITY_MOVE: "city:move",
  CULTURE_ASSIGN: "culture:assign",
  RELIGION_ASSIGN: "religion:assign",
  CULTURE_CENTER: "culture:center",
  RELIGION_CENTER: "religion:center",
  BIOME_ASSIGN: "biome:assign",
  SUITABILITY_PAINT: "biome:suitability",
  MARKET_ASSIGN: "economy:market-assign",
  MEASUREMENT_DRAW: "measurement:draw",
  MARKER_ADD: "marker:add",
  MARKER_MOVE: "marker:move",
  ROUTE_DRAW: "route:draw",
  ROUTE_EDIT_WAYPOINT: "route:edit-waypoint",
  RIVER_ADD: "river:add",
  LAKE_EXCAVATE: "lake:excavate",
  FEATURE_PATCH_SELECT: "feature:patch-select",
  FEATURE_TOPOLOGY_SELECT: "feature:topology-select",
  ZONE_ADD: "zone:add",
  NOTE_ADD: "note:add"
});
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
    brushCursorPreview: null,
    heightEdit: {
      activeStroke: null,
      lineStart: null,
      fillHoverCell: null,
      fillPreview: null,
      strokeSeed: 0,
      brushFrame: 0,
      pendingBrushPointer: null,
      globalToolSeed: 0,
      terrainTemplateSeed: 0,
      seafloorResetSeed: 0,
      terrainSelection: null,
      terrainSelectionSaved: null,
      terrainSelectionFeather: 0,
      terrainSelectionBox: null,
      terrainSelectionPoint: null,
      terrainSelectionPaintPending: null,
      terrainSelectionPaint: null,
      selectionPaintFrame: 0,
      pendingSelectionPaintPointer: null,
      lastAffected: 0,
      lastHeight: "none",
      lastDelta: "none",
      lastNotice: ""
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
    cultureEdit: {activeStroke: null, lastAffected: 0},
    religionEdit: {activeStroke: null, lastAffected: 0},
    biomeEdit: {activeStroke: null, lastAffected: 0, preview: null},
    suitabilityEdit: {activeStroke: null, lastAffected: 0, preview: null},
    economyEdit: {activeStroke: null, originals: new Map(), preview: null},
    cityEdit: {
      addMode: false,
      deleteMode: false,
      moveMode: false,
      moveCityId: null,
      activeDrag: null,
      dragController: null,
      movePreview: null,
      lastCreatedCityId: null
    },
    markerEdit: {
      mode: null,
      type: "mines",
      markerId: null,
      lastPackCell: null
    },
    routeCreate: {active: false, type: "road", startPackCell: null},
    routeEdit: {waypointRouteId: null},
    riverCreate: {active: false},
    lakeCreate: {active: false, radius: 0},
    featurePatch: {active: false, draft: null},
    featureTopology: {active: false},
    zoneCreate: {active: false, type: "Disaster", radius: 1},
    noteCreate: {active: false},
    customLabelDrag: null,
    pendingCustomLabelPlacement: null,
    measurement: {
      active: false,
      points: [],
      pointer: null,
      drag: null,
      routeFit: MEASUREMENT_ROUTE_FIT_NONE,
      drawMode: MEASUREMENT_DRAW_AREA,
      closed: true,
      smooth: false,
      sampling: {mode: "click", minDistancePx: 4, simplifyTolerance: 0, rawPointCount: 0, segmentsPerSpan: 6},
      notice: "",
      editingMeasurementId: null
    },
    lastEditRefresh: null,
    lastMapImportDiagnostic: null,
    selectionStore: null,
    renderer: null,
    panelManager,
    pendingGenerateId: 0,
    pendingGenerateRequestId: 0,
    heightmapImportId: 0,
    healthMonitor,
    runtimeOperation: null,
    runtimeOperationSnapshot: null,
    canvasToolModes: createCanvasToolModeManager(),
    lazyPanelPreloadScheduled: false,
    panels: {}
  };
  let selectionStore = null;
  let runtimeActions = null;
  const refreshBrushCursor = () => state.brushCursorPreview?.refresh();
  const generationPanel = createGenerationPanel(documentRef, panelManager);
  state.panels.generation = generationPanel;
  state.panels.development = createDevelopmentPanel(documentRef, panelManager);
  state.panels.climate = createClimatePanel(documentRef, panelManager, {
    onInspectDownstreamRebuild: options => runtimeActions.climate.inspectDownstreamRebuild(options),
    onApplyDownstreamRebuild: options => runtimeActions.climate.applyDownstreamRebuild(options)
  });
  state.panels.biome = createBiomePanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onAssignmentActive: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.BIOME_ASSIGN);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.BIOME_ASSIGN, "panel-toggle");
    },
    onSuitabilityActive: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.SUITABILITY_PAINT);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.SUITABILITY_PAINT, "panel-toggle");
    },
    onUndo: () => executeHistoryCommand(state, documentRef, "undo"),
    onRedo: () => executeHistoryCommand(state, documentRef, "redo")
  });
  state.panels.population = createPopulationPanel(documentRef, panelManager, {
    onInspectAdjustment: (target, editOptions = {}) => runtimeActions.edit.population.inspectAdjustment(target, editOptions),
    onApplyAdjustment: (target, editOptions = {}) => runtimeActions.edit.population.applyAdjustment(target, editOptions),
    onInspectTransfer: (source, target, editOptions = {}) => runtimeActions.edit.population.inspectTransfer(source, target, editOptions),
    onApplyTransfer: (source, target, editOptions = {}) => runtimeActions.edit.population.transfer(source, target, editOptions),
    onUndo: () => executeHistoryCommand(state, documentRef, "undo"),
    onRedo: () => executeHistoryCommand(state, documentRef, "redo")
  });
  state.panels.emblem = createEmblemPanel(documentRef, panelManager);
  state.panels.feature = createFeaturePanel(documentRef, panelManager, {
    onTopologyDraftChange: draft => {
      if (state.featureTopology.active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, draft);
    },
    onTopologySelectMode: (active, draft) => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, draft || {});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, "panel-toggle");
    },
    onTopologyInspect: options => state.runtimeActions.edit.features.inspectTopology(options),
    onTopologyApply: options => state.runtimeActions.edit.features.applyTopology(options),
    onTopologyClear: () => clearFeatureTopologyPreview(state),
    onTopologyCancel: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, "edit-cancel"),
    onClose: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, "panel-close")
  });
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
  let oceanCurrentPanel = null;
  let lakePanel = null;
  let routePanel = null;
  let zonePanel = null;
  let markerPanel = null;
  let labelNamingPanel = null;
  let namebasePanel = null;
  let notesPanel = null;
  let measurementPanel = null;
  let suppressNextRiverPanelOpen = false;
  const selectFromPanel = (panelId, object) => {
    selectionStore.setSelection({object}, {sourcePanelId: panelId});
  };
  const locateAndSelectObject = (panelId, object, {afterSelect = null, locate = null, sourcePanelId = panelId} = {}) => {
    const located = object ? (locate ? locate(object) : state.renderer.locateObject(object)) : false;
    if (located) {
      if (sourcePanelId) selectFromPanel(sourcePanelId, object);
      else selectionStore.setSelection({object});
      afterSelect?.(object);
    }
    refreshRuntimeAndPickPanels(documentRef, state);
    return located;
  };
  state.locateAndSelectObject = locateAndSelectObject;
  const startObjectEditing = (object, {select = true, afterStart = null} = {}) => {
    if (!object) return false;
    selectionStore.startEditing(object, {select});
    afterStart?.(object);
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    return true;
  };
  const stopObjectEditing = ({afterStop = null, ifKind = null} = {}) => {
    if (ifKind && state.editingObject?.kind !== ifKind) return false;
    selectionStore.stopEditing();
    afterStop?.();
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    return true;
  };
  const toggleObjectEditing = (object, options = {}) => {
    const sameObject = object && state.editingObject?.kind === object.kind && sameObjectId(state.editingObject.id, object.id);
    if (sameObject) return stopObjectEditing({afterStop: options.afterStop});
    return startObjectEditing(object, options);
  };
  const enterStateEditor = object => {
    if (object?.kind !== OBJECT_KIND.STATE || !state.panels.state) return false;
    state.panels.state.setTargetStateId(object.id);
    state.panels.state.open(state.map, state.editHistory.getStats());
    enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_BRUSH);
    return startObjectEditing(object, {select: false});
  };
  state.startObjectEditing = startObjectEditing;
  state.stopObjectEditing = stopObjectEditing;
  state.toggleObjectEditing = toggleObjectEditing;
  const openSelectionAwarePanel = options => openSelectionAwarePanelForState(state, options);
  state.openSelectionAwarePanel = openSelectionAwarePanel;
  const objectDetailsPanel = createObjectDetailsPanel(documentRef, panelManager, {
    onEdit: object => {
      if (object?.kind === OBJECT_KIND.STATE) {
        enterStateEditor(object);
        return;
      }
      startObjectEditing(object, {select: false});
    },
    onCancelEdit: () => {
      stopObjectEditing();
    },
    onLocate: object => {
      locateAndSelectObject(null, object);
    },
    onRename: (object, name) => {
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameFromNamebase: object => {
      renameSelectedObjectFromNamebase(state, documentRef, object);
    }
  });
  state.panels.objectDetails = objectDetailsPanel;
  heightPanel = createHeightPanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onActiveChange: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.HEIGHT_BRUSH);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.HEIGHT_BRUSH, "panel-toggle");
      updatePickPanel(documentRef, state);
    },
    onActionChange: action => {
      cancelHeightLine(state, documentRef);
      state.heightEdit.lastNotice = action === "line" ? "单击地图选择线段起点。" : "";
      updateHeightPanel(state);
      state.brushCursorPreview?.scheduleRefresh();
    },
    onUndo: () => {
      cancelHeightLine(state, documentRef);
      return executeHistoryCommand(state, documentRef, "undo", {
        afterRefresh: () => updateHeightPanel(state)
      });
    },
    onRedo: () => {
      cancelHeightLine(state, documentRef);
      return executeHistoryCommand(state, documentRef, "redo", {
        afterRefresh: () => updateHeightPanel(state)
      });
    },
    onGlobalToolPreview: action => {
      cancelHeightLine(state, documentRef);
      const scope = heightPanel.getBrush().scope;
      const seed = action === "disrupt" ? state.heightEdit.globalToolSeed + 1 : 0;
      const allowedCells = heightToolAllowedCells(state);
      const preview = inspectGlobalHeightChanges(state.map, {action, scope, seed, allowedCells});
      let rendererPreview = null;
      if (preview.valid) {
        const changes = getGlobalHeightChanges(state.map, {action, scope, seed, allowedCells});
        rendererPreview = state.renderer?.setHeightTransformPreview?.(changes) || null;
      }
      heightPanel.updateGlobalToolPreview({...preview, rendererPreview});
      updateEditingInteractionLock(state, documentRef);
      return preview;
    },
    onGlobalToolApply: () => {
      const reserved = heightPanel.getGlobalToolPreview();
      cancelHeightLine(state, documentRef);
      if (!reserved?.valid) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = "请先生成有效的全局工具预览。";
        updateHeightPanel(state);
        return false;
      }
      const scope = heightPanel.getBrush().scope;
      const options = {action: reserved.action, scope, seed: reserved.seed, allowedCells: heightToolAllowedCells(state)};
      const preview = inspectGlobalHeightChanges(state.map, options);
      if (!preview.valid) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = preview.notice;
        updateHeightPanel(state);
        return false;
      }
      const changes = getGlobalHeightChanges(state.map, options);
      const label = reserved.action === "smooth" ? "全局平滑" : "全局扰动";
      state.heightEdit.lastAffected = changes.length;
      state.heightEdit.lastHeight = summarizeChangedHeights(changes);
      state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
      state.heightEdit.lastNotice = `已${label} ${changes.length} cells。`;
      const result = executeEditCommand(state, documentRef, createApplyHeightBrushCommand(changes, {label}), {
        context: {map: state.map},
        refresh: refreshAfterEdit,
        refreshPanels: false
      });
      if (result.executed && reserved.action === "disrupt") state.heightEdit.globalToolSeed = reserved.seed;
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return result.executed;
    },
    onPreviewCancel: () => {
      clearHeightTransformPreview(state);
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onTerrainTemplatePreview: () => {
      cancelHeightLine(state, documentRef);
      const template = heightPanel.getTerrainTemplate();
      const options = {
        ...template,
        scope: heightPanel.getBrush().scope,
        seed: heightTerrainTemplateUsesSeed(template.templateId) ? state.heightEdit.terrainTemplateSeed + 1 : 0,
        allowedCells: heightTemplateAllowedCells(state)
      };
      const preview = inspectHeightTerrainTemplate(state.map, options);
      let rendererPreview = null;
      if (preview.valid) {
        const changes = getHeightTerrainTemplateChanges(state.map, options);
        rendererPreview = state.renderer?.setHeightTransformPreview?.(changes) || null;
      }
      heightPanel.updateTerrainTemplatePreview({...preview, rendererPreview});
      updateEditingInteractionLock(state, documentRef);
      return preview;
    },
    onTerrainTemplateApply: () => {
      const reserved = heightPanel.getTerrainTemplatePreview();
      cancelHeightLine(state, documentRef);
      if (!reserved?.valid) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = "请先生成有效的地形模板预览。";
        updateHeightPanel(state);
        return false;
      }
      const options = {
        templateId: reserved.templateId,
        intensity: reserved.intensity,
        targetHeight: reserved.targetHeight,
        terraceStep: reserved.terraceStep,
        amplitude: reserved.amplitude,
        seed: reserved.seed,
        scope: reserved.scope,
        allowedCells: heightTemplateAllowedCells(state)
      };
      const preview = inspectHeightTerrainTemplate(state.map, options);
      if (!preview.valid) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = preview.notice;
        updateHeightPanel(state);
        return false;
      }
      const changes = getHeightTerrainTemplateChanges(state.map, options);
      const label = heightTerrainTemplateLabel(options.templateId);
      state.heightEdit.lastAffected = changes.length;
      state.heightEdit.lastHeight = summarizeChangedHeights(changes);
      state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
      state.heightEdit.lastNotice = `已应用${label} ${changes.length} cells。`;
      const result = executeEditCommand(state, documentRef, createApplyHeightBrushCommand(changes, {label}), {
        context: {map: state.map},
        refresh: refreshAfterEdit,
        refreshPanels: false
      });
      if (result.executed && heightTerrainTemplateUsesSeed(options.templateId)) state.heightEdit.terrainTemplateSeed = options.seed;
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return result.executed;
    },
    onTerrainTemplateChange: () => {
      clearHeightTransformPreview(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onTerrainProgramPreview: () => {
      cancelHeightLine(state, documentRef);
      const program = heightPanel.getTerrainProgram();
      const options = {
        scope: heightPanel.getBrush().scope,
        seed: heightTerrainTemplateProgramUsesSeed(program) ? state.heightEdit.terrainTemplateSeed + 1 : 0,
        allowedCells: heightTemplateAllowedCells(state)
      };
      const preview = inspectHeightTerrainTemplateProgram(state.map, program, options);
      let rendererPreview = null;
      if (preview.valid) {
        const changes = getHeightTerrainTemplateProgramChanges(state.map, program, options);
        rendererPreview = state.renderer?.setHeightTransformPreview?.(changes) || null;
      }
      heightPanel.updateTerrainProgramPreview({...preview, program, rendererPreview});
      updateEditingInteractionLock(state, documentRef);
      return preview;
    },
    onTerrainProgramApply: () => {
      const reserved = heightPanel.getTerrainProgramPreview();
      cancelHeightLine(state, documentRef);
      if (!reserved?.valid || !reserved.program) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = "请先生成有效的多步骤模板预览。";
        updateHeightPanel(state);
        return false;
      }
      const options = {
        scope: reserved.scope,
        seed: reserved.seed,
        allowedCells: heightTemplateAllowedCells(state)
      };
      const preview = inspectHeightTerrainTemplateProgram(state.map, reserved.program, options);
      if (!preview.valid || preview.changeCount !== reserved.changeCount || preview.changeChecksum !== reserved.changeChecksum) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = preview.valid ? "地图或选区已变化，请重新预览多步骤模板。" : preview.notice;
        clearHeightTransformPreview(state);
        heightPanel.updateTerrainProgramPreview(preview);
        updateHeightPanel(state);
        return false;
      }
      const changes = getHeightTerrainTemplateProgramChanges(state.map, reserved.program, options);
      state.heightEdit.lastAffected = changes.length;
      state.heightEdit.lastHeight = summarizeChangedHeights(changes);
      state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
      state.heightEdit.lastNotice = `已应用${reserved.program.name} ${changes.length} cells / ${reserved.program.steps.length} 步。`;
      const result = executeEditCommand(state, documentRef, createApplyHeightBrushCommand(changes, {label: reserved.program.name}), {
        context: {map: state.map},
        refresh: refreshAfterEdit,
        refreshPanels: false
      });
      if (result.executed && heightTerrainTemplateProgramUsesSeed(reserved.program)) state.heightEdit.terrainTemplateSeed = reserved.seed;
      if (result.executed) clearHeightTransformPreview(state);
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return result.executed;
    },
    onConditionalTransformPreview: () => {
      const options = {...heightPanel.getConditionalTransform(), allowedCells: heightToolAllowedCells(state)};
      cancelHeightLine(state, documentRef);
      const preview = inspectHeightRangeTransform(state.map, options);
      let rendererPreview = null;
      if (preview.valid) {
        const changes = getHeightRangeTransformChanges(state.map, options);
        rendererPreview = state.renderer?.setHeightTransformPreview?.(changes) || null;
      }
      heightPanel.updateConditionalTransformPreview({...preview, rendererPreview});
      updateEditingInteractionLock(state, documentRef);
      return preview;
    },
    onConditionalTransformApply: () => {
      const options = {...heightPanel.getConditionalTransform(), allowedCells: heightToolAllowedCells(state)};
      cancelHeightLine(state, documentRef);
      const preview = inspectHeightRangeTransform(state.map, options);
      heightPanel.updateConditionalTransformPreview(preview);
      if (!preview.valid) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = preview.notice;
        updateHeightPanel(state);
        return false;
      }
      const changes = getHeightRangeTransformChanges(state.map, options);
      const label = conditionalHeightTransformLabel(options.operator);
      state.heightEdit.lastAffected = changes.length;
      state.heightEdit.lastHeight = summarizeChangedHeights(changes);
      state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
      state.heightEdit.lastNotice = `已${label} ${changes.length} cells。`;
      const result = executeEditCommand(state, documentRef, createApplyHeightBrushCommand(changes, {label}), {
        context: {map: state.map},
        refresh: refreshAfterEdit,
        refreshPanels: false
      });
      heightPanel.updateConditionalTransformPreview(null);
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return result.executed;
    },
    onConditionalTransformChange: () => {
      clearHeightTransformPreview(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onTerrainSelectionLock: request => {
      const options = request && typeof request === "object"
        ? {...request}
        : heightPanel.getTerrainSelectionRequest(typeof request === "string" ? request : "replace");
      if (options.source === "rectangle") {
        cancelHeightLine(state, documentRef);
        state.heightEdit.terrainSelectionBox = {request: options, start: null};
        state.heightEdit.lastNotice = "请在地图上依次单击矩形的两个角。";
        updateHeightPanel(state);
        updateEditingInteractionLock(state, documentRef);
        return {pending: true, operation: options.operation, source: options.source};
      }
      if (options.source === "connected-height") {
        cancelHeightLine(state, documentRef);
        state.heightEdit.terrainSelectionPoint = {request: options};
        state.heightEdit.lastNotice = "请在地图上单击连通等高区的中心。";
        updateHeightPanel(state);
        updateEditingInteractionLock(state, documentRef);
        return {pending: true, operation: options.operation, source: options.source};
      }
      if (options.source === "paint") {
        cancelHeightLine(state, documentRef);
        state.heightEdit.terrainSelectionPaintPending = {request: options};
        state.heightEdit.lastNotice = "请在地图上按住并拖动画笔选区，抬手后提交。";
        updateHeightPanel(state);
        updateEditingInteractionLock(state, documentRef);
        state.brushCursorPreview?.scheduleRefresh();
        return {pending: true, operation: options.operation, source: options.source};
      }
      if (options.source === "cursor-circle") options.centerCell = resolveHeightSelectionCenterCell(state, canvas, documentRef);
      const selection = composeHeightCellSelection(state.map, state.heightEdit.terrainSelection?.cellIds, options);
      if (!selection.summary.valid) {
        state.heightEdit.lastNotice = selection.summary.notice;
        updateHeightPanel(state);
        return selection.summary;
      }
      const summary = commitHeightTerrainSelection(state, selection);
      state.heightEdit.lastNotice = summary.notice;
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return summary;
    },
    onTerrainSelectionClear: () => {
      cancelHeightSelectionBox(state, documentRef);
      cancelHeightSelectionPoint(state);
      cancelHeightSelectionPaint(state);
      clearHeightTransformPreview(state);
      clearHeightTerrainSelection(state);
      state.heightEdit.lastNotice = "已清除锁定地形选区。";
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onTerrainSelectionSave: () => {
      cancelHeightLine(state, documentRef);
      const current = state.heightEdit.terrainSelection;
      const snapshot = createHeightCellSelectionSnapshot(state.map, current?.cellIds, {
        useForTools: current?.useForTools,
        featherRings: current?.featherRings
      });
      if (!snapshot.summary.valid) {
        state.heightEdit.lastNotice = snapshot.summary.notice;
        updateHeightPanel(state);
        return snapshot.summary;
      }
      state.heightEdit.terrainSelectionSaved = snapshot;
      heightPanel.updateTerrainSelectionSaved(snapshot.summary);
      state.heightEdit.lastNotice = snapshot.summary.notice;
      updateHeightPanel(state);
      return snapshot.summary;
    },
    onTerrainSelectionRestore: () => {
      cancelHeightLine(state, documentRef);
      const restored = restoreHeightCellSelectionSnapshot(state.map, state.heightEdit.terrainSelectionSaved);
      if (!restored.summary.valid) {
        state.heightEdit.lastNotice = restored.summary.notice;
        updateHeightPanel(state);
        return restored.summary;
      }
      state.heightEdit.terrainSelectionFeather = restored.featherRings;
      heightPanel.updateTerrainSelectionFeather(restored.featherRings);
      const summary = commitHeightTerrainSelection(state, restored, {useForTools: restored.useForTools, featherRings: restored.featherRings});
      state.heightEdit.lastNotice = summary.notice;
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return summary;
    },
    onTerrainSelectionFeatherChange: value => {
      const rings = Math.max(0, Math.min(8, Math.trunc(Number(value) || 0)));
      state.heightEdit.terrainSelectionFeather = rings;
      clearHeightTransformPreview(state);
      const summary = updateHeightTerrainSelectionFeather(state, rings);
      state.heightEdit.lastNotice = summary?.notice || `选区羽化已设为 ${rings} 圈。`;
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return summary;
    },
    onTerrainSelectionSavedClear: () => {
      cancelHeightLine(state, documentRef);
      state.heightEdit.terrainSelectionSaved = null;
      heightPanel.updateTerrainSelectionSaved(null);
      state.heightEdit.lastNotice = "已删除暂存地形选区。";
      updateHeightPanel(state);
    },
    onTerrainSelectionTransform: operation => {
      cancelHeightLine(state, documentRef);
      const current = state.heightEdit.terrainSelection;
      const transformed = transformHeightCellSelection(state.map, current?.cellIds, {
        operation,
        scope: heightPanel.getBrush().scope,
        steps: 1
      });
      if (!transformed.summary.valid) {
        state.heightEdit.lastNotice = transformed.summary.notice;
        updateHeightPanel(state);
        return transformed.summary;
      }
      const summary = commitHeightTerrainSelection(state, transformed, {useForTools: current?.useForTools});
      state.heightEdit.lastNotice = summary.notice;
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return summary;
    },
    onTerrainSelectionCancel: () => {
      cancelHeightSelectionBox(state, documentRef);
      cancelHeightSelectionPoint(state);
      cancelHeightSelectionPaint(state);
      state.heightEdit.lastNotice = "";
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
    },
    onTerrainSelectionUseChange: value => {
      if (!state.heightEdit.terrainSelection) return;
      clearHeightTransformPreview(state);
      state.heightEdit.terrainSelection.useForTools = Boolean(value);
      heightPanel.updateTerrainSelection(state.heightEdit.terrainSelection.summary, value);
      updateEditingInteractionLock(state, documentRef);
    },
    onTerrainSelectionSmooth: smoothness => {
      cancelHeightLine(state, documentRef);
      clearHeightTransformPreview(state);
      const options = {
        cellIds: state.heightEdit.terrainSelection?.cellIds,
        smoothness
      };
      const {inspection, changes} = createHeightSelectionSmoothingPlan(state.map, options);
      if (!inspection.valid) {
        state.heightEdit.lastAffected = 0;
        state.heightEdit.lastHeight = "none";
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = inspection.notice;
        updateHeightPanel(state);
        return inspection;
      }
      const result = executeEditCommand(state, documentRef, createApplyHeightBrushCommand(changes, {label: "平滑所选范围"}), {
        context: {map: state.map},
        refresh: refreshAfterEdit,
        refreshPanels: false
      });
      state.heightEdit.lastAffected = changes.length;
      state.heightEdit.lastHeight = summarizeChangedHeights(changes);
      state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
      state.heightEdit.lastNotice = result.executed ? `已平滑所选范围，共调整 ${changes.length} 处陆地。` : "所选范围没有变化。";
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return {...inspection, executed: result.executed};
    },
    onSeafloorResetPreview: () => {
      cancelHeightLine(state, documentRef);
      clearHeightTransformPreview(state);
      const seed = `${state.map?.metadata?.seed || state.map?.options?.seed || "map"}|seafloor|${state.heightEdit.seafloorResetSeed + 1}`;
      try {
        const plan = buildSeafloorResetPlan(state.map, {seed});
        const preview = plan.stats.changedCells
          ? {...plan.stats, valid: true, seed: plan.seed, topologyChecksum: plan.topologyChecksum, resultChecksum: plan.resultChecksum, notice: `可重设 ${plan.stats.oceanCells} 处开放海洋，形成大陆架、陆坡、洋中脊与海沟。`}
          : {...plan.stats, valid: false, seed: plan.seed, topologyChecksum: plan.topologyChecksum, resultChecksum: plan.resultChecksum, notice: plan.stats.oceanCells ? "当前海底无需调整。" : "当前地图没有可重设的开放海洋。"};
        const rendererPreview = preview.valid
          ? state.renderer?.setHeightTransformPreview?.(seafloorResetPreviewChanges(plan)) || null
          : null;
        heightPanel.updateSeafloorResetPreview({...preview, rendererPreview});
        updateEditingInteractionLock(state, documentRef);
        return preview;
      } catch (error) {
        const preview = {valid: false, notice: error.message || "无法预览重设海底。"};
        heightPanel.updateSeafloorResetPreview(preview);
        return preview;
      }
    },
    onSeafloorResetApply: async () => {
      const reserved = heightPanel.getSeafloorResetPreview();
      cancelHeightLine(state, documentRef);
      if (!reserved?.valid) {
        state.heightEdit.lastNotice = "请先生成有效的海底预览。";
        updateHeightPanel(state);
        return false;
      }
      try {
        const plan = buildSeafloorResetPlan(state.map, {seed: reserved.seed});
        if (plan.topologyChecksum !== reserved.topologyChecksum || plan.resultChecksum !== reserved.resultChecksum) {
          clearHeightTransformPreview(state);
          state.heightEdit.lastNotice = "地图已变化，请重新预览海底。";
          updateHeightPanel(state);
          return false;
        }
        const confirmed = documentRef.defaultView?.confirm?.("重设海底将连同洋流、气候和全部世界派生一起重算，是否继续？") ?? false;
        if (!confirmed) return false;
        const result = await runtimeActions.oceanCurrents.rebuildWorld({confirm: true, seafloorPlan: plan});
        state.heightEdit.lastAffected = plan.stats.changedCells;
        state.heightEdit.lastHeight = `${plan.stats.minHeight}..${plan.stats.maxHeight}`;
        state.heightEdit.lastDelta = "none";
        state.heightEdit.lastNotice = result.executed
          ? `已重设 ${plan.stats.oceanCells} 处开放海洋，并完成洋流、气候及世界派生重算。`
          : "当前海底无需调整。";
        if (result.executed) {
          state.heightEdit.seafloorResetSeed++;
          runtimeActions.layers.setShowOceanHeight(true);
        }
        clearHeightTransformPreview(state);
        updateHeightPanel(state);
        updateEditingInteractionLock(state, documentRef);
        return result.executed;
      } catch (error) {
        state.heightEdit.lastNotice = error.message || "重设海底失败。";
        updateHeightPanel(state);
        return false;
      }
    },
    onRegenerateRivers: () => {
      cancelHeightLine(state, documentRef);
      runtimeActions.generate.regenerate("rivers", {confirm: true});
      updateHeightPanel(state);
    },
    onRegenerateBase: () => {
      cancelHeightLine(state, documentRef);
      runtimeActions.edit.height.rebuildBaseDerived({confirm: true});
    },
    onRegenerateDownstream: () => {
      cancelHeightLine(state, documentRef);
      runtimeActions.edit.height.rebuildDownstreamDerived({confirm: true});
    },
    onRegenerateAll: () => {
      cancelHeightLine(state, documentRef);
      runtimeActions.edit.height.rebuildAllDerived({confirm: true});
    }
  });
  state.panels.height = heightPanel;
  statePanel = createStatePanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onActiveChange: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_BRUSH);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_BRUSH, "panel-toggle");
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
      locateAndSelectObject("state-panel", object, {
        afterSelect: target => setStatePanelTarget(state, target.id)
      });
    },
    onRegenerate: () => runtimeActions.generate.regenerate("states", {confirm: true}),
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onEdit: object => {
      startObjectEditing(object, {
        afterStart: target => {
          setStatePanelTarget(state, target.id);
          renderer.setColorMode("states");
          setActiveModeButton(documentRef, "states");
        }
      });
    },
    onAddMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_ADD);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_ADD, "panel-toggle");
    },
    onDeleteMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_DELETE);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.STATE_DELETE, "panel-toggle");
    },
    onDeleteState: stateId => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.STATE,
        ids: [stateId],
        createCommand: id => createDeleteStateCommand(id),
        label: "删除国家",
        executeOptions: {
          refresh: refreshAfterStateEdit,
          preparePanelRefresh: targetState => {
            targetState.selectionStore.clear();
            targetState.panels.state.setTargetStateId(0);
          }
        }
      });
      if (!result.executed) return;
      updateEditingInteractionLock(state, documentRef);
    },
    onRename: (stateId, name) => {
      const object = {kind: "state", id: stateId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterStateEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: stateIds => {
      const context = {map: state.map};
      const command = createRenameStatesFromNamebaseCommand(stateIds);
      const result = executeEditCommand(state, documentRef, command, {
        context,
        refresh: refreshAfterStateEdit,
        noopStatus: "当前筛选国家没有可按名称库更新的名称。"
      });
      if (result.executed) {
        setFileOperationStatus(documentRef, `已按当前名称库重命名 ${result.result?.renamed || 0} 个国家。`);
      }
      updateEditingInteractionLock(state, documentRef);
    },
    onColorChange: (stateId, color) => {
      const context = {map: state.map};
      const beforeColor = state.map?.politics?.states?.[stateId]?.color || null;
      const command = createSetStateColorCommand(stateId, color, {beforeColor});
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterStateEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onGovernmentChange: (stateId, governmentKey, formName) => {
      const context = {map: state.map};
      const command = createSetStateGovernmentCommand(stateId, governmentKey, {formName});
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterStateEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onCapitalChange: (stateId, burgId) => {
      const context = {map: state.map};
      const command = createSetStateCapitalCommand(stateId, burgId);
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterStateEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (stateId, body) => {
      const stateItem = state.map?.politics?.states?.[stateId];
      const object = {kind: OBJECT_KIND.STATE, id: stateId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: stateItem?.fullName || stateItem?.name || `国家 #${stateId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onInspectMerge: options => runtimeActions.edit.states.inspectMerge(options),
    onMerge: options => runtimeActions.edit.states.merge({...options, confirm: true}),
    onInspectSplit: options => runtimeActions.edit.states.inspectSplit(options),
    onSplit: options => runtimeActions.edit.states.split({...options, confirm: true}),
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo", {refresh: refreshAfterStateEdit});
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo", {refresh: refreshAfterStateEdit});
    }
  });
  state.panels.state = statePanel;
  governmentPanel = createGovernmentPanel(documentRef, panelManager, {
    onSelectState: object => {
      selectFromPanel("government-panel", object);
      setStatePanelTarget(state, object.id);
    },
    onLocateState: object => {
      locateAndSelectObject("government-panel", object, {
        afterSelect: target => {
          state.panels.government.setSelectedStateId(target.id);
          setStatePanelTarget(state, target.id);
        }
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
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
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterStateEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo", {
        refresh: refreshAfterStateEdit,
        afterRefresh: () => updateRuntimePanel(documentRef, state)
      });
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo", {
        refresh: refreshAfterStateEdit,
        afterRefresh: () => updateRuntimePanel(documentRef, state)
      });
    }
  });
  state.panels.government = governmentPanel;
  provincePanel = createProvincePanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onActiveChange: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.PROVINCE_BRUSH);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.PROVINCE_BRUSH, "panel-toggle");
    },
    onAddMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.PROVINCE_ADD);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.PROVINCE_ADD, "panel-toggle");
    },
    onDeleteMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.PROVINCE_DELETE);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.PROVINCE_DELETE, "panel-toggle");
    },
    onDeleteProvince: provinceId => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.PROVINCE,
        ids: [provinceId],
        createCommand: id => createDeleteProvinceCommand(id),
        label: "删除省份",
        executeOptions: {
          refresh: refreshAfterProvinceEdit,
          preparePanelRefresh: targetState => {
            targetState.selectionStore.clear();
            provincePanel.setSelectedProvinceId(0);
          }
        }
      });
      if (!result.executed) return;
      updateEditingInteractionLock(state, documentRef);
    },
    onRegenerate: () => runtimeActions.generate.regenerate("provinces", {confirm: true}),
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
      locateAndSelectObject("province-panel", object, {
        afterSelect: target => provincePanel.setSelectedProvinceId(target.id)
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onEdit: object => {
      startObjectEditing(object, {
        afterStart: target => {
          provincePanel.setSelectedProvinceId(target.id);
          renderer.setColorMode("provinces");
          setActiveModeButton(documentRef, "provinces");
        }
      });
    },
    onRename: (provinceId, name) => {
      const object = {kind: "province", id: provinceId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterProvinceEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: provinceIds => executeNamedObjectNamebaseRename(state, documentRef, OBJECT_KIND.PROVINCE, provinceIds, {refresh: refreshAfterProvinceEdit}),
    onColorChange: (provinceId, color) => {
      const context = {map: state.map};
      const province = state.map?.politics?.provinces?.[provinceId] || state.map?.pack?.provinces?.[provinceId];
      const command = createSetProvinceColorCommand(provinceId, color, {beforeColor: province?.color || null});
      executeEditCommand(state, documentRef, command, {context, refresh: refreshAfterProvinceEdit});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (provinceId, body) => {
      const province = state.map?.politics?.provinces?.[provinceId] || state.map?.pack?.provinces?.[provinceId];
      const object = {kind: OBJECT_KIND.PROVINCE, id: provinceId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: province?.fullName || province?.name || `省份 #${provinceId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo", {refresh: refreshAfterProvinceEdit});
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo", {refresh: refreshAfterProvinceEdit});
    }
  });
  state.panels.province = provincePanel;
  cityPanel = createCityPanel(documentRef, panelManager, {
    onSelect: object => {
      selectFromPanel("city-panel", object);
      cityPanel.setSelectedCityId(object.id);
    },
    onLocate: object => {
      locateAndSelectObject("city-panel", object, {
        afterSelect: target => cityPanel.setSelectedCityId(target.id)
      });
    },
    onRegenerate: () => runtimeActions.generate.regenerate("cities", {confirm: true}),
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onRename: (cityId, name) => {
      const object = {kind: "city", id: cityId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: cityIds => {
      const context = {map: state.map};
      const command = createRenameCitiesFromNamebaseCommand(cityIds);
      executeEditCommand(state, documentRef, command, {
        context,
        status: executed => `已按当前名称库重命名 ${executed.getResult?.().renamed || 0} 个城市。`,
        noopStatus: "当前筛选城市没有可按名称库更新的名称。"
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onAddMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_ADD);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_ADD, "panel-toggle");
    },
    onDeleteMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_DELETE);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_DELETE, "panel-toggle");
    },
    onMoveMode: (active, cityId) => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_MOVE, {cityId});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_MOVE, "panel-toggle");
    },
    onClose: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_MOVE, "panel-close"),
    onDeleteCity: cityId => {
      executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.CITY,
        ids: [cityId],
        createCommand: id => createDeleteCityCommand(id),
        label: "删除城市",
        executeOptions: {
          preparePanelRefresh: targetState => {
            targetState.selectionStore.clear();
            cityPanel.setSelectedCityId(null);
          }
        }
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onPopulationChange: (cityId, population) => {
      const context = {map: state.map};
      const command = createSetCityPopulationCommand(cityId, population);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onSyncOwnerToCell: cityId => {
      const context = {map: state.map};
      const command = createSyncCityOwnerToCellCommand(cityId);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onVisualChange: (cityId, patch) => {
      const context = {map: state.map};
      const command = createSetCityVisualCommand(cityId, patch);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onVisualReset: cityId => {
      const context = {map: state.map};
      const command = createResetCityVisualCommand(cityId);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (cityId, body) => {
      const city = state.map?.settlements?.cities?.[cityId];
      const context = {map: state.map};
      const command = createSetCityNoteCommand(cityId, body, {name: city?.name || `城市 #${cityId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.city = cityPanel;
  culturePanel = createCulturePanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onSelect: object => {
      selectFromPanel("culture-panel", object);
      culturePanel.setSelectedCultureId(object.id);
    },
    onLocate: object => {
      locateAndSelectObject("culture-panel", object, {
        afterSelect: target => culturePanel.setSelectedCultureId(target.id)
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onAdd: () => {
      const command = createAddCultureCommand();
      const context = {map: state.map};
      executeEditCommand(state, documentRef, command, {
        context,
        preparePanelRefresh: (targetState, executed) => {
          const cultureId = executed.getCultureId?.();
          if (!cultureId) return;
          culturePanel.setSelectedCultureId(cultureId);
          selectFromPanel("culture-panel", {kind: OBJECT_KIND.CULTURE, id: cultureId, name: `新文化 ${cultureId}`});
        },
        status: executed => `已新增空文化 #${executed.getCultureId?.() || ""}。`
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onDelete: object => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.CULTURE,
        ids: [object.id],
        createCommand: id => createDeleteCultureCommand(id),
        label: "删除文化",
        executeOptions: {noopStatus: "文化不存在或已删除。"}
      });
      if (result.executed) {
        setFileOperationStatus(documentRef, `已删除文化 ${object.name || `#${object.id}`} 并清除相关归属。`);
      }
      updateEditingInteractionLock(state, documentRef);
    },
    onRename: (cultureId, name) => {
      const object = {kind: "culture", id: cultureId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: cultureIds => executeNamedObjectNamebaseRename(state, documentRef, OBJECT_KIND.CULTURE, cultureIds),
    onColorChange: (cultureId, color) => {
      const context = {map: state.map};
      const culture = state.map?.society?.cultures?.[cultureId] || state.map?.pack?.cultures?.[cultureId];
      const command = createSetCultureColorCommand(cultureId, color, {beforeColor: culture?.color || null});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onParentChange: (cultureId, parentId) => {
      const context = {map: state.map};
      const culture = state.map?.society?.cultures?.[cultureId] || state.map?.pack?.cultures?.[cultureId];
      const command = createSetCultureParentCommand(cultureId, parentId, {beforeParent: culture?.parent ?? 0});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (cultureId, body) => {
      const culture = state.map?.society?.cultures?.[cultureId] || state.map?.pack?.cultures?.[cultureId];
      const object = {kind: OBJECT_KIND.CULTURE, id: cultureId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: culture?.name || `文化 #${cultureId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onNamebaseBinding: cultureId => {
      state.panels.namebase.open(state.map, {cultureId, history: state.editHistory.getStats()});
    },
    onAssignmentActive: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CULTURE_ASSIGN);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CULTURE_ASSIGN, "panel-toggle");
    },
    onCenterPickActive: (active, cultureId) => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CULTURE_CENTER, {id: cultureId});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CULTURE_CENTER, "panel-toggle");
    },
    onInspectExpansion: (cultureId, options) => state.runtimeActions.edit.cultures.inspectExpansion(cultureId, options),
    onApplyExpansion: (cultureId, options) => state.runtimeActions.edit.cultures.applyExpansion(cultureId, options),
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.culture = culturePanel;
  religionPanel = createReligionPanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onSelect: object => {
      selectFromPanel("religion-panel", object);
      religionPanel.setSelectedReligionId(object.id);
    },
    onLocate: object => {
      locateAndSelectObject("religion-panel", object, {
        afterSelect: target => religionPanel.setSelectedReligionId(target.id)
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onAdd: () => {
      const command = createAddReligionCommand();
      const context = {map: state.map};
      executeEditCommand(state, documentRef, command, {
        context,
        preparePanelRefresh: (targetState, executed) => {
          const religionId = executed.getReligionId?.();
          if (!religionId) return;
          religionPanel.setSelectedReligionId(religionId);
          selectFromPanel("religion-panel", {kind: OBJECT_KIND.RELIGION, id: religionId, name: `新宗教 ${religionId}`});
        },
        status: executed => `已新增空宗教 #${executed.getReligionId?.() || ""}。`
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onDelete: object => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.RELIGION,
        ids: [object.id],
        createCommand: id => createDeleteReligionCommand(id),
        label: "删除宗教",
        executeOptions: {noopStatus: "宗教不存在或已删除。"}
      });
      if (result.executed) {
        setFileOperationStatus(documentRef, `已删除宗教 ${object.name || `#${object.id}`} 并清除相关归属。`);
      }
      updateEditingInteractionLock(state, documentRef);
    },
    onRename: (religionId, name) => {
      const object = {kind: "religion", id: religionId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: religionIds => executeNamedObjectNamebaseRename(state, documentRef, OBJECT_KIND.RELIGION, religionIds),
    onColorChange: (religionId, color) => {
      const context = {map: state.map};
      const religion = state.map?.society?.religions?.[religionId] || state.map?.pack?.religions?.[religionId];
      const command = createSetReligionColorCommand(religionId, color, {beforeColor: religion?.color || null});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onParentChange: (religionId, parentId) => {
      const context = {map: state.map};
      const religion = state.map?.society?.religions?.[religionId] || state.map?.pack?.religions?.[religionId];
      const command = createSetReligionParentCommand(religionId, parentId, {beforeParent: religion?.parent ?? 0});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (religionId, body) => {
      const religion = state.map?.society?.religions?.[religionId] || state.map?.pack?.religions?.[religionId];
      const object = {kind: OBJECT_KIND.RELIGION, id: religionId};
      const context = {map: state.map};
      const command = createSetObjectNoteCommand(object, body, {name: religion?.name || `宗教 #${religionId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onAssignmentActive: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RELIGION_ASSIGN);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RELIGION_ASSIGN, "panel-toggle");
    },
    onCenterPickActive: (active, religionId) => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RELIGION_CENTER, {id: religionId});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RELIGION_CENTER, "panel-toggle");
    },
    onInspectExpansion: (religionId, options) => state.runtimeActions.edit.religions.inspectExpansion(religionId, options),
    onApplyExpansion: (religionId, options) => state.runtimeActions.edit.religions.applyExpansion(religionId, options),
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
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
      locateAndSelectObject("diplomacy-panel", object);
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onOpenState: object => {
      selectionStore.setSelection({object});
      setStatePanelTarget(state, object.id);
      state.panels.state.open(state.map, state.editHistory.getStats());
      updateStatePanel(state);
    },
    onRelationChange: (subjectId, objectId, relation, reason) => {
      const command = createSetDiplomacyRelationCommand(subjectId, objectId, relation, {reason});
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        refreshGenerationSummary(state.map);
      }
      updateEditingInteractionLock(state, documentRef);
    },
    onRegenerate: () => runtimeActions.generate.regenerate("diplomacy", {confirm: true}),
    onShowTheme: stateId => {
      setDiplomacyThemeSubject(state, documentRef, stateId);
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo", {
        afterRefresh: () => refreshGenerationSummary(state.map)
      });
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo", {
        afterRefresh: () => refreshGenerationSummary(state.map)
      });
    }
  });
  state.panels.diplomacy = diplomacyPanel;
  economyPanel = createEconomyPanel(documentRef, panelManager, {
    onBrushRadiusChange: refreshBrushCursor,
    onLocate: object => {
      locateAndSelectObject("economy-panel", object);
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onMarketAssignmentActive: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MARKET_ASSIGN);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MARKET_ASSIGN, "panel-toggle");
    },
    onApplyMarketAssignment: () => applyPendingMarketAssignment(state, documentRef),
    onCancelMarketAssignment: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MARKET_ASSIGN, "preview-cancel"),
    onGoodDisplayApply: (goodId, patch) => setGoodDisplayViaApi(state, documentRef, goodId, patch),
    onMarketDisplayApply: (marketId, patch) => setMarketDisplayViaApi(state, documentRef, marketId, patch),
    onRebuildEconomy: () => rebuildEconomyViaAction(state, documentRef, {label: "重算经济链"}),
    onClose: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MARKET_ASSIGN, "panel-close")
  });
  state.panels.economy = economyPanel;
  militaryPanel = createMilitaryPanel(documentRef, panelManager, {
    onSelect: object => {
      selectFromPanel("military-panel", object);
      militaryPanel.setSelectedRegimentId(object.id);
    },
    onLocate: object => {
      locateAndSelectObject("military-panel", object, {
        afterSelect: target => militaryPanel.setSelectedRegimentId(target.id)
      });
    },
    onRegenerate: () => runtimeActions.generate.regenerate("military", {confirm: true}),
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onRatiosApply: (stateId, ratios) => {
      const command = createSetMilitaryRatiosCommand(stateId, ratios);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `update military ratios: state=${stateId}, regiments=${state.map.military?.metadata?.regiments || 0}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onStatusApply: (target, status) => {
      const command = createSetMilitaryStatusCommand(target, status);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `update military status: regiment=${target.id}, status=${status}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBatchStatusApply: (targets, status) => {
      const command = createSetMilitaryStatusBatchCommand(targets, status);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `batch update military status: count=${targets.length}, status=${status}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onStationApply: (target, destination) => {
      const command = createMoveMilitaryStationCommand(target, destination);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `move military station: regiment=${target.id}, cell=${destination.cell}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBaseApply: target => {
      const command = createSetMilitaryBaseCommand(target);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `set military base: regiment=${target.id}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBattleEventApply: (target, event) => {
      const command = createRecordMilitaryBattleEventCommand(target, event);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `record military battle event: regiment=${target.id}, type=${event.type}, outcome=${event.outcome}, apply=${event.applyResult ? "yes" : "no"}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onBattleEventsImport: file => importMilitaryBattleEvents(state, documentRef, file),
    onBattleEventsClear: (target, eventIds = null) => {
      const command = createClearMilitaryBattleEventsCommand(target, {
        eventIds,
        label: eventIds?.length ? "清空筛选战斗事件" : "清空军团战斗事件"
      });
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `clear military battle events: regiment=${target.id}, scope=${eventIds?.length ? "filtered" : "selected"}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRename: (target, name) => {
      const command = createRenameMilitaryRegimentCommand(target, name);
      const result = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
      if (result.executed) {
        markDerivedFresh(state.map, ["military"]);
        refreshGenerationSummary(state.map);
        appendGenerationLog(state.map, `rename military regiment: regiment=${target.id}, name=${name}`);
      }
      updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      const result = executeHistoryCommand(state, documentRef, "undo");
      if (result.executed) {
        refreshGenerationSummary(state.map);
      }
      updateRuntimePanel(documentRef, state);
      return result;
    },
    onRedo: () => {
      const result = executeHistoryCommand(state, documentRef, "redo");
      if (result.executed) {
        refreshGenerationSummary(state.map);
      }
      updateRuntimePanel(documentRef, state);
      return result;
    }
  });
  state.panels.military = militaryPanel;
  routePanel = createRoutePanel(documentRef, panelManager, {
    onCreateMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_DRAW, {type: "road"});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_DRAW, "panel-toggle");
    },
    onClose: () => {
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_DRAW, "panel-close");
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, "panel-close");
    },
    onSelect: object => {
      selectFromPanel("route-panel", object);
      routePanel.setSelectedRouteId(object.id);
    },
    onLocate: object => {
      locateAndSelectObject("route-panel", object, {
        afterSelect: target => routePanel.setSelectedRouteId(target.id)
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onNoteChange: (routeId, body) => {
      const route = state.map?.settlements?.routes?.find(item => item.id === routeId);
      const context = {map: state.map};
      const command = createSetRouteNoteCommand(routeId, body, {name: routeDisplayName(state.map, route, routeId)});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onInspectEdit: (routeId, draft) => inspectRouteEdit(state.map, routeId, draft),
    onWaypointMode: (active, routeId) => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, {routeId});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, "panel-toggle");
    },
    onEditApply: (routeId, draft) => {
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, "edit-apply");
      const command = createEditRouteCommand(routeId, draft);
      const result = executeEditCommand(state, documentRef, command, {
        context: {map: state.map},
        status: executed => `已更新路线 #${executed.getResult?.().routeId ?? routeId}。`,
        noopStatus: "路线编辑没有变化。"
      });
      if (result.executed) routePanel.setRouteEditActive(false);
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onEditCancel: () => {
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, "edit-cancel");
      routePanel.setRouteEditActive(false);
    },
    onDelete: object => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.ROUTE,
        ids: [object.id],
        createCommand: id => createDeleteRouteCommand(id),
        label: "删除路线"
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onDeleteMany: routeIds => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.ROUTE,
        ids: routeIds,
        createCommand: id => createDeleteRouteCommand(id),
        label: "批量删除路线"
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onRegenerateRoutes: () => runtimeActions.generate.regenerate("routes", {confirm: true}),
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.route = routePanel;
  markerPanel = createMarkerPanel(documentRef, panelManager, {
    onSelect: object => {
      selectFromPanel("marker-panel", object);
      markerPanel.setSelectedMarkerId(object.id);
    },
    onLocate: object => {
      locateAndSelectObject("marker-panel", object, {
        afterSelect: selected => markerPanel.setSelectedMarkerId(selected.id)
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onRename: (markerId, name) => {
      const object = {kind: OBJECT_KIND.MARKER, id: markerId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onVisualChange: (markerId, patch) => {
      const context = {map: state.map};
      const command = createSetMarkerVisualCommand(markerId, patch);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (markerId, body) => {
      const marker = (state.map?.markers?.markers || []).find(item => item?.id === markerId);
      const context = {map: state.map};
      const command = createSetMarkerNoteCommand(markerId, body, {name: marker?.name || marker?.label || `标记 #${markerId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onAddResourceMode: type => {
      startMarkerEditMode(state, documentRef, {mode: "add", type: type || "mines", markerId: null});
    },
    onMoveMode: markerId => {
      const marker = (state.map?.markers?.markers || []).find(item => item?.id === markerId);
      if (!marker) return;
      selectionStore.setSelection({object: {kind: OBJECT_KIND.MARKER, id: markerId}});
      startMarkerEditMode(state, documentRef, {mode: "move", type: marker.type, markerId});
    },
    onDelete: markerId => {
      const command = createDeleteMarkerCommand(markerId);
      applyMarkerCollectionCommand(state, documentRef, command);
      if (state.markerEdit.markerId === markerId) stopMarkerEditMode(state, documentRef);
    },
    onRegenerateResources: () => runtimeActions.generate.regenerate("markers", {confirm: true}),
    onCancelEdit: () => {
      stopMarkerEditMode(state, documentRef);
    },
    onClose: () => {
      stopMarkerEditMode(state, documentRef, "panel-close");
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.marker = markerPanel;
  labelNamingPanel = createLabelNamingPanel(documentRef, panelManager, {
    onSelect: object => {
      selectFromPanel("label-naming-panel", object);
      labelNamingPanel.setSelectedLabelKey(labelKeyForObject(object));
    },
    onLocate: object => {
      locateAndSelectObject("label-naming-panel", object, {
        afterSelect: target => labelNamingPanel.setSelectedLabelKey(labelKeyForObject(target))
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onRename: (object, name) => {
      const context = {map: state.map};
      const command = object.targetKind === LABEL_TARGET_KIND.CUSTOM ? createRenameCustomLabelCommand(object.targetId ?? object.id, name) : createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (object, body) => {
      const context = {map: state.map};
      const command = createSetLabelNoteCommand(object, body, {name: object.targetName || object.text || `标签 #${object.targetId ?? object.id}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onPriorityChange: (object, priority) => applyLabelLayoutPatch(state, documentRef, object, {priority}),
    onPriorityReset: object => applyLabelLayoutPatch(state, documentRef, object, {priority: null}),
    onPositionToggle: object => toggleLabelPositionLock(state, documentRef, object),
    onAdd: () => {
      const point = getNewLabelPoint(state);
      const context = {map: state.map};
      const command = createAddCustomLabelCommand({text: "新标签", x: point.x, y: point.y});
      const result = executeEditCommand(state, documentRef, command, {context});
      const created = result.command?.getCreatedLabel?.();
      if (result.executed && created) {
        const object = {kind: OBJECT_KIND.LABEL, id: created.id, targetKind: LABEL_TARGET_KIND.CUSTOM, targetId: created.id, text: created.text, targetName: created.text};
        selectionStore.setSelection({object});
        labelNamingPanel.setSelectedLabelKey(labelKeyForObject(object));
        state.pendingCustomLabelPlacement = {labelId: created.id, command: result.command};
      }
      updateEditingInteractionLock(state, documentRef);
    },
    onDelete: object => {
      const context = {map: state.map};
      const command = createDeleteLabelCommand(object);
      const result = executeEditCommand(state, documentRef, command, {context});
      if (result.executed) updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onRestore: object => {
      const context = {map: state.map};
      const command = createRestoreGeneratedLabelCommand(object);
      const result = executeEditCommand(state, documentRef, command, {context});
      if (result.executed) updateRuntimePanel(documentRef, state);
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.labelNaming = labelNamingPanel;
  namebasePanel = createNamebasePanel(documentRef, panelManager, {
    onExport: rows => exportNamebases(state, documentRef, rows, runtimeActions.namebases.export),
    onExportLegacy: rows => exportLegacyNamebases(state, documentRef, rows, runtimeActions.namebases.export),
    onImportPreview: (file, mode) => previewNamebaseImport(state, documentRef, file, mode),
    onImport: (file, mode) => importNamebases(state, documentRef, file, mode, runtimeActions.namebases.import),
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
    onCreateStandaloneMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.NOTE_ADD);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.NOTE_ADD, "panel-toggle");
    },
    onClose: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.NOTE_ADD, "panel-close"),
    onSelect: row => {
      if (!row?.object || row.orphan) return;
      selectFromPanel("notes-panel", row.object);
      notesPanel.setSelectedNoteId(row.id);
    },
    onLocate: row => {
      if (!row?.object || row.orphan) return;
      locateAndSelectObject("notes-panel", row.object, {
        afterSelect: () => notesPanel.setSelectedNoteId(row.id)
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onDelete: row => {
      if (!row?.id) return;
      const command = createDeleteNoteCommand(row.id, {name: row.name});
      const result = executeEditCommand(state, documentRef, command, {
        noopStatus: "备注不存在或已被删除。",
        status: `已删除备注 ${row.name || row.id}。`
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onRename: (row, name) => {
      if (!row?.object || row.orphan) return;
      executeEditCommand(state, documentRef, createRenameObjectCommand(row.object, name), {context: {map: state.map}});
      updateEditingInteractionLock(state, documentRef);
    },
    onNoteChange: (row, body) => {
      if (!row?.object || row.orphan) return;
      executeEditCommand(state, documentRef, createSetObjectNoteCommand(row.object, body, {name: row.name}), {context: {map: state.map}});
      updateEditingInteractionLock(state, documentRef);
    },
    onExport: rows => exportNotesSummary(state, documentRef, rows, runtimeActions.data.exportNotes),
    onImportPreview: (file, mode) => previewNotesImport(state, documentRef, file, mode),
    onImport: (file, mode) => importNotesFile(state, documentRef, file, mode, runtimeActions.edit.notes.import),
    onDeleteBatch: rows => runtimeActions.edit.notes.deleteBatch(rows.map(row => row.id), {confirm: true, label: "批量删除备注"}),
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
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
    onStart: () => {
      startMeasurementMode(state, documentRef);
    },
    onClose: () => {
      stopMeasurementMode(state, documentRef, "panel-close");
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onRename: (measurementId, name) => {
      const command = createRenameMeasurementCommand(measurementId, name);
      executeEditCommand(state, documentRef, command);
      updateMeasurementOverlay(state, documentRef);
    },
    onDelete: row => {
      const command = createDeleteMeasurementCommand(row.id);
      const result = executeEditCommand(state, documentRef, command, {
        status: `已删除测量对象 ${row.name || row.id}。`
      });
      if (result.executed && state.measurement.editingMeasurementId === row.id) {
        state.measurement.editingMeasurementId = null;
        state.measurement.points = [];
        cancelMeasurementDrag(state, documentRef);
      }
      updateMeasurementOverlay(state, documentRef);
    },
    onExport: rows => exportMeasurementObjects(state, documentRef, rows, runtimeActions.data.exportMeasurements),
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo", {
        afterRefresh: () => updateMeasurementOverlay(state, documentRef)
      });
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo", {
        afterRefresh: () => updateMeasurementOverlay(state, documentRef)
      });
    }
  });
  state.panels.measurement = measurementPanel;
  riverPanel = createRiverPanel(documentRef, panelManager, {
    onCreateMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RIVER_ADD);
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RIVER_ADD, "panel-toggle");
    },
    onSelect: object => {
      riverPanel.setSelection({object}, state.editingObject);
      selectFromPanel("river-panel", object);
    },
    onLocate: object => {
      locateAndSelectObject("river-panel", object, {
        afterSelect: target => riverPanel.setSelection({object: target}, state.editingObject)
      });
    },
    onRegenerate: () => runtimeActions.generate.regenerate("rivers", {confirm: true}),
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onEdit: object => {
      toggleObjectEditing(object);
    },
    onRename: (riverId, name) => {
      const object = {kind: "river", id: riverId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: riverIds => {
      const context = {map: state.map};
      const command = createRenameRiversFromNamebaseCommand(riverIds);
      executeEditCommand(state, documentRef, command, {
        context,
        status: executed => `已按当前名称库重命名 ${executed.getResult?.().renamed || 0} 条河流。`,
        noopStatus: "当前筛选河流没有可按名称库更新的名称。"
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onDelete: riverId => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.RIVER,
        ids: [riverId],
        createCommand: id => createDeleteRiverCommand(id),
        label: "删除河流"
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onDeleteMany: riverIds => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.RIVER,
        ids: riverIds,
        createCommand: id => createDeleteRiverCommand(id),
        label: "批量删除河流"
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onClose: () => {
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RIVER_ADD, "panel-close");
      if (state.editingObject?.kind === OBJECT_KIND.RIVER) {
        suppressNextRiverPanelOpen = true;
        stopObjectEditing({ifKind: OBJECT_KIND.RIVER});
      }
    },
    onSetWidthFactor: (riverId, widthFactor) => {
      const context = {map: state.map};
      const command = createSetRiverWidthFactorCommand(riverId, widthFactor);
      executeEditCommand(state, documentRef, command, {context});
    },
    onNoteChange: (riverId, body) => {
      const river = state.map?.rivers?.rivers?.find(item => item.id === riverId);
      const context = {map: state.map};
      const command = createSetRiverNoteCommand(riverId, body, {name: river?.name || `河流 #${riverId}`});
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.river = riverPanel;
  oceanCurrentPanel = createOceanCurrentPanel(documentRef, panelManager, {
    onLocate: current => {
      const bounds = oceanCurrentBounds(current);
      if (!bounds) return;
      const located = state.renderer.locateBounds(bounds, {status: `洋流 ${current.name || current.id}`});
      if (!located) return;
      oceanCurrentPanel.setSelectedId(current.id);
      refreshRuntimeAndPickPanels(documentRef, state);
    },
    onRename: (currentId, name) => {
      executeEditCommand(state, documentRef, createRenameOceanCurrentCommand(currentId, name), {
        context: {map: state.map},
        status: command => `已将洋流重命名为“${command.getResult?.().name || name}”。`,
        noopStatus: "洋流名称没有变化。"
      });
    },
    onRegenerate: () => {
      executeEditCommand(state, documentRef, createRegenerateOceanCurrentsCommand(state.map), {
        context: {map: state.map},
        status: command => `已重新计算 ${command.getResult?.().currents || 0} 条洋流。`,
        noopStatus: "当前洋流无需重新计算。"
      });
    },
    onWorldRebuild: async () => {
      const confirmed = documentRef.defaultView?.confirm?.("完整重算会更新气候、河流、人口、城镇、政区、外交和军事，并保留现有文化、国家、省份与宗教的名称和 ID。是否继续？") ?? false;
      if (!confirmed) return false;
      return runtimeActions.oceanCurrents.rebuildWorld({confirm: true});
    },
    onCancelWorldRebuild: () => state.runtimeOperation?.cancelCurrent?.("用户取消洋流世界重算"),
    onHighlight: ids => state.renderer.setOceanCurrentHighlights(ids),
    onUndo: () => executeHistoryCommand(state, documentRef, "undo", {afterRefresh: () => updateOceanCurrentPanel(state)}),
    onRedo: () => executeHistoryCommand(state, documentRef, "redo", {afterRefresh: () => updateOceanCurrentPanel(state)})
  });
  state.panels.oceanCurrent = oceanCurrentPanel;
  lakePanel = createLakePanel(documentRef, panelManager, {
    onCreateMode: active => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.LAKE_EXCAVATE, {radius: 0});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.LAKE_EXCAVATE, "panel-toggle");
    },
    onClose: () => {
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.LAKE_EXCAVATE, "panel-close");
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, "panel-close");
    },
    onSelect: object => {
      lakePanel.setSelection({object});
      selectFromPanel("lake-panel", object);
    },
    onLocate: object => {
      locateAndSelectObject("lake-panel", object, {
        afterSelect: target => lakePanel.setSelection({object: target})
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onRename: (lakeId, name) => {
      const object = {kind: OBJECT_KIND.LAKE, id: lakeId};
      const context = {map: state.map};
      const command = createRenameObjectCommand(object, name);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onRenameVisibleFromNamebase: lakeIds => {
      const context = {map: state.map};
      const command = createRenameLakesFromNamebaseCommand(lakeIds);
      executeEditCommand(state, documentRef, command, {
        context,
        status: executed => `已按当前名称库重命名 ${executed.getResult?.().renamed || 0} 个湖泊。`,
        noopStatus: "当前筛选湖泊没有可按名称库更新的名称。"
      });
      updateEditingInteractionLock(state, documentRef);
    },
    onInspectOutlet: (lakeId, outletRiverId) => inspectLakeOutletChange(state.map, lakeId, outletRiverId),
    onApplyOutlet: (lakeId, outletRiverId) => {
      const result = executeEditCommand(state, documentRef, createSetLakeOutletCommand(lakeId, outletRiverId), {
        context: {map: state.map},
        status: `已更新湖泊 #${lakeId} 的出口。`,
        noopStatus: "湖泊出口没有变化。"
      });
      if (result.executed) lakePanel.clearEditor("outlet");
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onInspectPatch: draft => inspectFeaturePatch(state.map, draft),
    onPatchSelectMode: (active, draft) => {
      if (active) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, draft || {});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, "panel-toggle");
    },
    onApplyPatch: draft => {
      cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, "patch-apply");
      const result = executeEditCommand(state, documentRef, createApplyFeaturePatchCommand(draft), {
        context: {map: state.map},
        status: executed => `已完成湖泊 #${executed.getResult?.().lakeId ?? draft?.lakeId} 的局部水陆修正。`
      });
      if (result.executed) lakePanel.clearEditor("patch");
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onEditCancel: kind => {
      if (kind === "patch") cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, "edit-cancel");
      lakePanel.clearEditor(kind);
    },
    onDelete: lakeId => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.LAKE,
        ids: [lakeId],
        createCommand: id => createDeleteLakeCommand(id),
        label: "填平并删除湖泊"
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onDeleteMany: lakeIds => {
      const result = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.LAKE,
        ids: lakeIds,
        createCommand: id => createDeleteLakeCommand(id),
        label: "批量填平并删除湖泊"
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.lake = lakePanel;
  zonePanel = createZonePanel(documentRef, panelManager, {
    onCreateMode: type => {
      if (type) enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ZONE_ADD, {type, radius: 1});
      else cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ZONE_ADD, "panel-toggle");
    },
    onClose: () => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ZONE_ADD, "panel-close"),
    onSelect: object => {
      zonePanel.setSelection({object});
      selectFromPanel("zone-panel", object);
    },
    onLocate: object => {
      locateAndSelectObject("zone-panel", object, {
        afterSelect: target => zonePanel.setSelection({object: target})
      });
    },
    onHighlight: objects => setPersistentObjectHighlights(state, documentRef, objects),
    onClearHighlights: () => clearPersistentObjectHighlights(state, documentRef),
    getHighlightCount: () => persistentObjectHighlightCount(state),
    onStyleChange: (zoneId, patch) => {
      const context = {map: state.map};
      const command = createSetZoneStyleCommand(zoneId, patch);
      executeEditCommand(state, documentRef, command, {context});
      updateEditingInteractionLock(state, documentRef);
    },
    onDelete: zoneId => {
      const result = executeEditCommand(state, documentRef, createDeleteZoneCommand(zoneId), {
        context: {map: state.map},
        noopStatus: "地区不存在或已被删除。",
        status: `已删除地区 #${zoneId}。`
      });
      updateEditingInteractionLock(state, documentRef);
      return result;
    },
    onUndo: () => {
      return executeHistoryCommand(state, documentRef, "undo");
    },
    onRedo: () => {
      return executeHistoryCommand(state, documentRef, "redo");
    }
  });
  state.panels.zone = zonePanel;
  const renderer = new PlaceholderMapRenderer(canvas, () => {
    if (state.map) {
      updateRuntimePanel(documentRef, state);
      if (!renderer.getStats?.()?.overlay?.interactionSuspended) updateMeasurementOverlay(state, documentRef);
      state.brushCursorPreview?.refresh();
    }
  }, pick => {
    state.pick = pick;
    updatePickPanel(documentRef, state);
    updateEditingInteractionLock(state, documentRef);
  }, selection => {
    selectionStore.setSelection(selection);
  });
  state.renderer = renderer;
  selectionStore = new SelectionStore(({selection, editingObject}, metadata = null) => {
    state.selection = selection;
    state.editingObject = editingObject;
    renderer.setSelection(selection?.object || null);
    const handled = handleSelectionPanel(state, selection, editingObject, {
      documentRef,
      suppressNextRiverPanelOpen,
      sourcePanelId: metadata?.sourcePanelId || null,
      clearRiverSuppressor: () => {
        suppressNextRiverPanelOpen = false;
      }
    });
    if (!handled) {
      state.panels.objectDetails.show(selection, editingObject);
    }
    updateEditingInteractionLock(state, documentRef);
    refreshRuntimeAndPickPanels(documentRef, state);
  }, object => resolveObject(state.map, object));
  state.selectionStore = selectionStore;
  state.editRefreshScheduler = createEditRefreshScheduler({
    state,
    documentRef,
    updateRuntimePanel,
    updatePickPanel,
    applyVisualTheme: themeId => applyRuntimeVisualThemeState(state, documentRef, themeId, {force: true})
  });
  registerCanvasToolModes(state, documentRef, {stopObjectEditing});
  state.brushCursorPreview = createBrushCursorPreview(canvas, state, documentRef);
  applyControlPreferencesToRenderer(documentRef, renderer);
  state.runtimeOperation = createRuntimeOperationManager({
    setLoading: (visible, message) => updateGenerationLoading(documentRef, visible, message),
    beginHealthOperation: (name, detail) => healthMonitor?.beginOperation?.(name, detail),
    recordHealth: (type, detail, severity) => healthMonitor?.record?.(type, detail, severity),
    onStateChange: snapshot => {
      state.runtimeOperationSnapshot = snapshot;
      state.keyboardShortcuts?.refreshAvailability?.();
      state.panels.oceanCurrent?.updateWorldRebuild?.(snapshot);
    }
  });
  runtimeActions = createRuntimeActions(state, documentRef, {
    locateObject: (object, locateOptions = {}) => locateAndSelectObject(null, object, {
      locate: target => state.renderer.locateObject(target, locateOptions)
    })
  });
  state.runtimeActions = runtimeActions;
  bindMeasurementTool(canvas, state, documentRef);
  bindHeightEditing(canvas, state, documentRef);
  bindStateEditing(canvas, state, documentRef);
  bindProvinceEditing(canvas, state, documentRef);
  bindSocialAssignmentEditing(canvas, state, documentRef, "culture");
  bindSocialAssignmentEditing(canvas, state, documentRef, "religion");
  bindBiomeAssignmentEditing(canvas, state, documentRef);
  bindSuitabilityEditing(canvas, state, documentRef);
  bindMarketAssignmentEditing(canvas, state, documentRef);
  bindCityEditing(canvas, state, documentRef);
  bindMarkerEditing(canvas, state, documentRef);
  bindObjectCreationTools(canvas, state, documentRef);
  bindCustomLabelDrag(state, documentRef);
  bindEditingInteractionLock(canvas, state);

  const runtimePanelHandlers = {
    onGenerate: () => requestGenerate(state, documentRef, runtimeActions),
    onRandomSeed: () => {
      setSeedInput(documentRef, createRandomSeed());
      requestGenerate(state, documentRef, runtimeActions);
    },
    onFitView: () => runtimeActions.layers.fitView(),
    onShowOceanHeight: showOceanHeight => runtimeActions.layers.setShowOceanHeight(showOceanHeight),
    onSmoothCellBorders: smoothCellBorders => runtimeActions.layers.setSmoothCellBorders(smoothCellBorders),
    onVisualTheme: visualTheme => runtimeActions.layers.setTheme(visualTheme),
    onCreateVisualTheme: () => runtimeActions.layers.createTheme(),
    onExportVisualTheme: () => runtimeActions.layers.exportTheme(currentVisualThemeId(documentRef), {download: true}),
    onImportVisualTheme: file => importVisualThemeFile(state, documentRef, file, runtimeActions.layers.importTheme),
    onUpdateVisualTheme: (token, color) => runtimeActions.layers.updateTheme(currentVisualThemeId(documentRef), {[token]: color}),
    onDeleteVisualTheme: () => runtimeActions.layers.deleteTheme(currentVisualThemeId(documentRef)),
    onShowHoverInfo: showHoverInfo => runtimeActions.layers.setShowHoverInfo(showHoverInfo),
    onMaxCityLabels: maxCityLabels => runtimeActions.layers.setMaxCityLabels(maxCityLabels),
    onPatchLabelStyle: (styleType, patch) => runtimeActions.edit.labels.setStyle(styleType, patch),
    onResetLabelStyle: styleType => runtimeActions.edit.labels.resetStyle(styleType),
    onResetAllLabelStyles: () => runtimeActions.edit.labels.resetStyles(),
    onUnitPreferences: () => {
      renderer.setUnitPreferences(readControlPreferences(documentRef).units);
      refreshPanelsForEdit(state, {derived: ["object-panels"]});
      refreshRuntimeAndPickPanels(documentRef, state);
      updateMeasurementOverlay(state, documentRef);
    },
    onClimateControls: () => applyClimateControls(state, documentRef, runtimeActions.climate.apply),
    onLayerVisible: (layer, visible) => runtimeActions.layers.setVisible(layer, visible),
    onOpenGenerationPanel: () => {
      state.panels.generation.open();
    },
    onOpenHeightPanel: () => {
      state.panels.height.open(state.editHistory.getStats());
    },
    onOpenStatePanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.STATE,
        beforeOpen: object => state.panels.state.setTargetStateId(object.id),
        open: () => state.panels.state.open(state.map, state.editHistory.getStats())
      });
    },
    onOpenGovernmentPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.STATE,
        beforeOpen: object => state.panels.government.setSelectedStateId(object.id),
        open: () => state.panels.government.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenProvincePanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.PROVINCE,
        beforeOpen: object => state.panels.province.setSelectedProvinceId(object.id),
        open: () => state.panels.province.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenCityPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.CITY,
        beforeOpen: object => state.panels.city.setSelectedCityId(object.id),
        open: () => state.panels.city.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenBiomePanel: () => {
      state.panels.biome.open(state.map, state.editHistory.getStats());
    },
    onOpenClimatePanel: () => {
      state.panels.climate.open(state.map, state.editHistory.getStats());
    },
    onOpenPopulationPanel: () => {
      state.panels.population.open(state.map, state.editHistory.getStats());
    },
    onOpenEmblemPanel: () => {
      state.panels.emblem.open(state.map, state.editHistory.getStats());
    },
    onOpenFeaturePanel: () => {
      state.panels.feature.open(state.map, state.editHistory.getStats());
    },
    onOpenCulturePanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.CULTURE,
        beforeOpen: object => state.panels.culture.setSelectedCultureId(object.id),
        open: () => state.panels.culture.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenReligionPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.RELIGION,
        beforeOpen: object => state.panels.religion.setSelectedReligionId(object.id),
        open: () => state.panels.religion.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenDiplomacyPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.STATE,
        beforeOpen: object => state.panels.diplomacy.setSelectedStateId(object.id),
        open: () => state.panels.diplomacy.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenEconomyPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.TRADE_FLOW,
        open: () => state.panels.economy.open(state.map, state.selection, state.editHistory.getStats()),
        afterOpen: object => state.panels.economy.setSelectedDealId?.(object.id)
      });
    },
    onOpenMilitaryPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.MILITARY,
        beforeOpen: object => state.panels.military.setSelectedRegimentId(object.id),
        open: () => state.panels.military.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenRiverPanel: () => {
      state.panels.river.open(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
    },
    onOpenOceanCurrentPanel: () => {
      state.panels.oceanCurrent.open(state.map, state.editHistory.getStats());
    },
    onOpenLakePanel: () => {
      state.panels.lake.open(state.map, state.selection, state.editHistory.getStats());
    },
    onOpenZonePanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.ZONE,
        beforeOpen: () => state.panels.zone.setSelection(state.selection),
        open: () => state.panels.zone.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenRoutePanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.ROUTE,
        beforeOpen: object => state.panels.route.setSelectedRouteId(object.id),
        open: () => state.panels.route.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenMarkerPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.MARKER,
        beforeOpen: object => state.panels.marker.setSelectedMarkerId(object.id),
        open: () => state.panels.marker.open(state.map, state.selection, state.editHistory.getStats())
      });
    },
    onOpenLabelNamingPanel: () => {
      openSelectionAwarePanel({
        kind: OBJECT_KIND.LABEL,
        beforeOpen: object => state.panels.labelNaming.setSelectedLabelKey(labelKeyForObject(object)),
        open: () => state.panels.labelNaming.open(state.map, state.selection, state.editHistory.getStats())
      });
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
    onSaveLocalFile: () => saveMapToLocalFile(state, documentRef, runtimeActions.data.exportMap),
    onSaveBrowserStorage: () => {
      void saveMapToBrowserStorage(state, documentRef, runtimeActions.data.saveBrowserMap);
    },
    onExportImage: () => exportMapImage(state, documentRef, runtimeActions.data.exportPNG),
    onExportMapData: () => exportMapData(state, documentRef, runtimeActions.data.exportMap),
    onExportCompressedMapData: () => {
      void exportCompressedMapData(state, documentRef, runtimeActions.data.exportCompressedAll);
    },
    onExportGeoJson: () => exportGeoJson(state, documentRef, runtimeActions.data.exportGEO),
    onExportFeatureGeoJson: () => exportFeatureGeoJson(state, documentRef, runtimeActions.data.exportFeatureGEO),
    onExportMapImportDiagnostic: () => exportMapImportDiagnostic(state, documentRef, runtimeActions.data.exportImportDiagnostic),
    onImportMapData: file => importMapData(state, documentRef, file, runtimeActions.data.importMap),
    onImportGeoData: file => importGeoData(state, documentRef, file, runtimeActions.data.importGEO),
    onImportHeightmapImage: payload => importHeightmapImage(state, documentRef, payload, runtimeActions.data.importHeightmap),
    onRegenerate: (kind, regenerationOptions = {}) => runtimeActions.generate.regenerate(kind, {confirm: true, ...regenerationOptions}),
    onDebugModeChange: () => updatePickPanel(documentRef, state),
    onMode: mode => runtimeActions.layers.setViewMode(mode)
  };
  wrapControlPanelChildOpeners(runtimePanelHandlers, panelManager);
  bindRuntimePanel(documentRef, runtimePanelHandlers);

  const view = documentRef.defaultView || window;
  view.__webglGeneratorApp = state;
  installConsoleApi(documentRef, state, {actions: runtimeActions});
  state.keyboardShortcuts = installKeyboardShortcuts(documentRef, {
    canExecute: item => canExecuteKeyboardShortcut(state, item),
    execute: item => executeKeyboardShortcut(state, documentRef, item, runtimePanelHandlers),
    onDisabled: item => showMapToast(documentRef, `${item.label}当前不可用`, 1800, {tone: "error"}),
    onError: (error, item) => showMapToast(documentRef, `${item.label}失败：${error?.message || error}`, 2600, {tone: "error"})
  });
  healthMonitor?.record?.("app-ready", {hasCanvas: Boolean(canvas)}, "info");
  void restoreBrowserStoredMapOrGenerate(state, documentRef);
  return state;
}

function createRuntimeActions(state, documentRef, options = {}) {
  const operation = state.runtimeOperation;
  const mapReplaceConfig = message => ({
    message,
    snapshot: () => captureMapReplaceSnapshot(state, documentRef),
    rollback: (snapshot, error, context) => restoreMapReplaceSnapshot(state, documentRef, snapshot, error, context)
  });
  const mapMutationConfig = message => ({
    message,
    snapshot: () => captureMapMutationSnapshot(state.map, state.editHistory),
    rollback: snapshot => {
      restoreMapMutationSnapshot(state.map, state.editHistory, snapshot);
      refreshMapMutationRollback(state, documentRef);
    }
  });
  return {
    history: {
      get: (options = {}) => state.editHistory.getStats(options),
      undo: () => executeHistoryCommand(state, documentRef, "undo"),
      redo: () => executeHistoryCommand(state, documentRef, "redo")
    },
    generate: {
      getOptions: () => getGenerationOptionsViaApi(state, documentRef),
      setOptions: (patch = {}) => setGenerationOptionsViaApi(state, documentRef, patch),
      newMap: (options = {}) => operation.run("generate.newMap", context => generateNewMapViaApi(state, documentRef, options, context), mapReplaceConfig(loadingMessage("generate"))),
      rerollSeed: (options = {}) => operation.run("generate.rerollSeed", context => rerollSeedViaApi(state, documentRef, options, context), mapReplaceConfig(loadingMessage("generate"))),
      regenerate: (kind, options = {}) => operation.runSync("generate.regenerate", context => {
        context.report("regenerate", {message: `正在重新生成 ${String(kind || "派生数据")}`});
        return regenerateMapAttributeViaApi(state, documentRef, kind, options);
      }, {
        message: "正在重新生成派生数据",
        isNoop: result => !result?.executed
      })
    },
    layers: {
      listThemes: () => listRuntimeVisualThemes(documentRef),
      setViewMode: mode => setRuntimeViewMode(state, documentRef, mode),
      setVisible: (layer, visible) => setRuntimeLayerVisible(state, documentRef, layer, visible),
      setTheme: themeId => setRuntimeVisualTheme(state, documentRef, themeId),
      exportTheme: (themeId, options = {}) => exportRuntimeVisualTheme(documentRef, themeId, options),
      importTheme: (document, options = {}) => importRuntimeVisualTheme(state, documentRef, document, options),
      createTheme: (options = {}) => createRuntimeVisualTheme(state, documentRef, options),
      updateTheme: (themeId, colors = {}) => updateRuntimeVisualTheme(state, documentRef, themeId, colors),
      deleteTheme: themeId => deleteRuntimeVisualTheme(state, documentRef, themeId),
      fitView: () => fitRuntimeView(state, documentRef),
      setShowOceanHeight: visible => setRuntimeOceanHeightVisible(state, documentRef, visible),
      setSmoothCellBorders: enabled => setRuntimeSmoothCellBorders(state, documentRef, enabled),
      setShowHoverInfo: visible => setRuntimeHoverInfoVisible(state, documentRef, visible),
      setMaxCityLabels: limit => setRuntimeMaxCityLabels(state, documentRef, limit)
    },
    selection: {
      resolve: object => resolveObjectViaApi(state, object),
      select: object => selectObjectViaApi(state, object),
      clear: () => clearSelectionViaApi(state),
      locate: (object, locateOptions = {}) => locateObjectViaApi(state, documentRef, object, {locateObject: options.locateObject, ...locateOptions}),
      flash: object => flashObjectViaApi(state, documentRef, object),
      highlight: (objects, highlightOptions = {}) => highlightObjectsViaApi(state, documentRef, objects, highlightOptions),
      clearHighlights: () => clearObjectHighlightsViaApi(state, documentRef),
      startEditing: (object, editOptions = {}) => startEditingObjectViaApi(state, object, editOptions),
      stopEditing: (editOptions = {}) => stopEditingObjectViaApi(state, editOptions),
      toggleEditing: (object, editOptions = {}) => toggleEditingObjectViaApi(state, object, editOptions),
      pick: (clientX, clientY) => pickClientPointViaApi(state, documentRef, clientX, clientY)
    },
    climate: {
      apply: (patch = {}, options = {}) => applyClimatePatchViaApi(state, documentRef, patch, options),
      setLatitude: (value, options = {}) => setClimateLatitudeViaApi(state, documentRef, value, options),
      setLatitudeRange: (percent, options = {}) => applyClimatePatchViaApi(state, documentRef, {climateLatitudeRangePercent: percent, climateMapSizePercent: percent}, options),
      setLongitudeRange: (percent, options = {}) => applyClimatePatchViaApi(state, documentRef, {climateLongitudeRangePercent: percent}, options),
      setTemperature: (patch, options = {}) => applyClimatePatchViaApi(state, documentRef, {temperature: patch}, options),
      setPrecipitation: (scale, options = {}) => applyClimatePatchViaApi(state, documentRef, {precipitation: scale}, options),
      setWind: (index, direction, options = {}) => setClimateWindViaApi(state, documentRef, index, direction, options),
      inspectDownstreamRebuild: (options = {}) => inspectClimateDownstreamRebuildViaApi(state, options),
      applyDownstreamRebuild: (options = {}) => operation.run(
        "climate.applyDownstreamRebuild",
        context => applyClimateDownstreamRebuildViaApi(state, documentRef, options, context),
        {
          message: "正在重算气候下游内容",
          isNoop: result => !result?.executed
        }
      )
    },
    oceanCurrents: {
      inspectWorldRebuild: (options = {}) => inspectOceanCurrentWorldRebuild(state.map, options),
      rebuildWorld: (options = {}) => operation.run("oceanCurrents.rebuildWorld", context => applyOceanCurrentWorldRebuildViaAction(state, documentRef, options, context), {
        message: "正在重算洋流与世界"
      }),
      cancelWorldRebuild: () => operation.cancelCurrent("用户取消洋流世界重算")
    },
    namebases: {
      export: (options = {}) => exportNamebasesData(state, documentRef, options),
      import: (document, options = {}) => importNamebaseDocumentViaApi(state, documentRef, document, options),
      create: payload => createNamebaseViaApi(state, documentRef, payload),
      copyBuiltin: (baseId, options = {}) => copyBuiltinNamebaseViaApi(state, documentRef, baseId, options),
      update: (baseId, patch = {}) => updateNamebaseViaApi(state, documentRef, baseId, patch),
      delete: (baseId, options = {}) => deleteNamebaseViaAction(state, documentRef, baseId, options),
      clear: (options = {}) => clearNamebasesViaApi(state, documentRef, options),
      bind: (scope, target, baseId, options = {}) => bindNamebaseViaApi(state, documentRef, scope, target, baseId, options),
      renameObjects: (kind, ids, options = {}) => renameObjectsFromNamebaseViaApi(state, documentRef, kind, ids, options)
    },
    data: {
      exportAll: (options = {}) => exportAllMapData(state, documentRef, options),
      exportMap: (options = {}) => exportAllMapData(state, documentRef, options),
      exportGEO: (options = {}) => exportPackGeoJson(state, documentRef, options),
      exportFeatureGEO: (options = {}) => exportFeatureGeoJsonData(state, documentRef, options),
      exportCompressedAll: (options = {}) => operation.run("data.exportCompressedAll", context => {
        context.report("serialize", {message: "正在压缩完整地图数据"});
        return exportCompressedAllMapData(state, documentRef, options);
      }, {message: "正在压缩完整地图数据"}),
      exportPNG: (options = {}) => operation.run("data.exportPNG", context => {
        context.report("render-export", {message: "正在导出 PNG"});
        return exportPngData(state, documentRef, options);
      }, {message: "正在导出 PNG"}),
      exportNotes: (options = {}) => exportNotesData(state, documentRef, options),
      exportMeasurements: (options = {}) => exportMeasurementsData(state, documentRef, options),
      exportImportDiagnostic: (options = {}) => exportMapImportDiagnosticViaApi(state, documentRef, options),
      saveBrowserMap: (options = {}) => operation.run("data.saveBrowserMap", context => {
        context.report("serialize", {message: "正在保存浏览器存档"});
        return saveMapToBrowserStorageViaApi(state, documentRef, options);
      }, {message: "正在保存浏览器存档"}),
      restoreBrowserMap: (options = {}) => operation.run("data.restoreBrowserMap", context => restoreMapFromBrowserStorageViaApi(state, documentRef, options, context), {
        ...mapReplaceConfig(loadingMessage("map-import-read")),
        isNoop: result => result?.restored === false
      }),
      importMap: (document, options = {}) => operation.run("data.importMap", context => importMapDocumentViaApi(state, documentRef, document, options, context), mapReplaceConfig(loadingMessage("map-import-read"))),
      importGEO: (document, options = {}) => operation.runSync("data.importGEO", context => {
        context.report("import", {message: "正在导入 GEO 数据"});
        return importGeoDocumentViaApi(state, documentRef, document, options);
      }, {
        ...mapMutationConfig("正在导入 GEO 数据"),
        message: "正在导入 GEO 数据",
        isNoop: result => result?.imported === false
      }),
      importHeightmap: (payload, options = {}) => operation.run("data.importHeightmap", context => importHeightmapImageViaApi(state, documentRef, payload, options, context), {
        ...mapReplaceConfig(loadingMessage("heightmap-read")),
        isNoop: result => result?.imported === false
      })
    },
    edit: {
      notes: {
        createStandalone: options => createStandaloneNoteViaApi(state, documentRef, options),
        set: (object, body, options = {}) => setObjectNoteViaApi(state, documentRef, object, body, options),
        delete: (noteId, options = {}) => deleteNoteViaApi(state, documentRef, noteId, options),
        import: (document, options = {}) => importNotesViaApi(state, documentRef, document, options),
        deleteBatch: (noteIds, options = {}) => deleteNotesBatchViaApi(state, documentRef, noteIds, options)
      },
      measurements: {
        save: (points, options = {}) => saveMeasurementViaApi(state, documentRef, points, options),
        rename: (measurementId, name) => renameMeasurementViaApi(state, documentRef, measurementId, name),
        updatePoints: (measurementId, points, options = {}) => updateMeasurementPointsViaApi(state, documentRef, measurementId, points, options),
        delete: measurementId => deleteMeasurementViaApi(state, documentRef, measurementId),
        import: measurements => importMeasurementsViaApi(state, documentRef, measurements)
      },
      cities: {
        add: gridCell => addCityViaApi(state, documentRef, gridCell),
        delete: (cityId, options = {}) => deleteCityViaApi(state, documentRef, cityId, options),
        inspectMove: (cityId, target) => inspectCityMoveViaApi(state, cityId, target),
        move: (cityId, target) => moveCityViaApi(state, documentRef, cityId, target),
        rename: (cityId, name) => renameCityViaApi(state, documentRef, cityId, name),
        setPopulation: (cityId, population) => setCityPopulationViaApi(state, documentRef, cityId, population),
        syncOwner: cityId => syncCityOwnerViaApi(state, documentRef, cityId),
        setVisual: (cityId, patch) => setCityVisualViaApi(state, documentRef, cityId, patch),
        resetVisual: cityId => resetCityVisualViaApi(state, documentRef, cityId)
      },
      provinces: {
        add: gridCell => addProvinceViaApi(state, documentRef, gridCell),
        delete: (provinceId, options = {}) => deleteProvinceViaApi(state, documentRef, provinceId, options),
        rename: (provinceId, name) => renameProvinceViaApi(state, documentRef, provinceId, name),
        setColor: (provinceId, color) => setProvinceColorViaApi(state, documentRef, provinceId, color),
        applyChanges: changes => applyProvinceChangesViaApi(state, documentRef, changes)
      },
      states: {
        add: gridCell => addStateViaApi(state, documentRef, gridCell),
        delete: (stateId, options = {}) => deleteStateViaApi(state, documentRef, stateId, options),
        inspectMerge: options => inspectStateMergeViaApi(state, options),
        merge: options => mergeStatesViaApi(state, documentRef, options),
        inspectSplit: options => inspectStateSplitViaApi(state, options),
        split: options => splitStateViaApi(state, documentRef, options),
        rename: (stateId, name) => renameStateViaApi(state, documentRef, stateId, name),
        setColor: (stateId, color) => setStateColorViaApi(state, documentRef, stateId, color),
        setGovernment: (stateId, governmentKey, options = {}) => setStateGovernmentViaApi(state, documentRef, stateId, governmentKey, options),
        setCapital: (stateId, cityId) => setStateCapitalViaApi(state, documentRef, stateId, cityId),
        setGovernmentBatch: (stateIds, governmentKey) => setStatesGovernmentBatchViaApi(state, documentRef, stateIds, governmentKey),
        applyChanges: changes => applyStateChangesViaApi(state, documentRef, changes)
      },
      height: {
        applyChanges: (changes, editOptions = {}) => applyHeightChangesViaApi(state, documentRef, changes, editOptions),
        rebuildBaseDerived: (editOptions = {}) => operation.runSync(
          "edit.height.rebuildBaseDerived",
          () => rebuildHeightDerivedViaAction(state, documentRef, "base", editOptions),
          {message: "正在重建高度基础派生", isNoop: result => !result?.executed}
        ),
        rebuildDownstreamDerived: (editOptions = {}) => operation.runSync(
          "edit.height.rebuildDownstreamDerived",
          () => rebuildHeightDerivedViaAction(state, documentRef, "downstream", editOptions),
          {message: "正在重建高度下游派生", isNoop: result => !result?.executed}
        ),
        rebuildAllDerived: (editOptions = {}) => operation.runSync(
          "edit.height.rebuildAllDerived",
          () => rebuildHeightDerivedViaAction(state, documentRef, "all", editOptions),
          {message: "正在重建全部高度派生", isNoop: result => !result?.executed}
        )
      },
      biomes: {
        assignCells: (biomeId, gridCellIds, editOptions = {}) => assignBiomeCellsViaApi(state, documentRef, biomeId, gridCellIds, editOptions),
        inspectSuitability: (gridCellIds, editOptions = {}) => inspectSuitabilityViaApi(state, gridCellIds, editOptions),
        applySuitability: (gridCellIds, editOptions = {}) => applySuitabilityViaApi(state, documentRef, gridCellIds, editOptions)
      },
      population: {
        inspectAdjustment: (target, editOptions = {}) => inspectPopulationAdjustmentViaApi(state, target, editOptions),
        applyAdjustment: (target, editOptions = {}) => applyPopulationAdjustmentViaApi(state, documentRef, target, editOptions),
        inspectTransfer: (source, target, editOptions = {}) => inspectPopulationTransferViaApi(state, source, target, editOptions),
        transfer: (source, target, editOptions = {}) => applyPopulationTransferViaApi(state, documentRef, source, target, editOptions)
      },
      economy: {
        inspectAssignment: (marketId, packCellIds) => inspectMarketAssignmentViaApi(state, marketId, packCellIds),
        assignCells: (marketId, packCellIds, editOptions = {}) => assignMarketCellsViaApi(state, documentRef, marketId, packCellIds, editOptions),
        rebuild: (editOptions = {}) => rebuildEconomyViaApi(state, documentRef, editOptions),
        setGoodDisplay: (goodId, patch) => setGoodDisplayViaApi(state, documentRef, goodId, patch),
        setMarketDisplay: (marketId, patch) => setMarketDisplayViaApi(state, documentRef, marketId, patch)
      },
      diplomacy: {
        setRelation: (subjectId, objectId, relation, editOptions = {}) => setDiplomacyRelationViaApi(state, documentRef, subjectId, objectId, relation, editOptions)
      },
      military: {
        setRatios: (stateId, ratios) => setMilitaryRatiosViaApi(state, documentRef, stateId, ratios),
        setStatus: (target, status) => setMilitaryStatusViaApi(state, documentRef, target, status),
        setStatusBatch: (targets, status) => setMilitaryStatusBatchViaApi(state, documentRef, targets, status),
        moveStation: (target, destination) => moveMilitaryStationViaApi(state, documentRef, target, destination),
        setBase: target => setMilitaryBaseViaApi(state, documentRef, target),
        recordBattleEvent: (target, event = {}) => recordMilitaryBattleEventViaApi(state, documentRef, target, event),
        importBattleEvents: document => importMilitaryBattleEventsViaApi(state, documentRef, document),
        clearBattleEvents: (target, editOptions = {}) => clearMilitaryBattleEventsViaApi(state, documentRef, target, editOptions),
        rename: (target, name) => renameMilitaryRegimentViaApi(state, documentRef, target, name)
      },
      zones: {
        create: options => createZoneViaApi(state, documentRef, options),
        delete: zoneId => deleteZoneViaApi(state, documentRef, zoneId),
        setStyle: (zoneId, patch) => setZoneStyleViaApi(state, documentRef, zoneId, patch)
      },
      cultures: {
        add: options => addCultureViaApi(state, documentRef, options),
        assignCells: (cultureId, gridCellIds) => assignSocialCellsViaApi(state, documentRef, "culture", cultureId, gridCellIds),
        inspectExpansion: (cultureId, options = {}) => inspectSocialExpansionViaApi(state, "culture", cultureId, options),
        applyExpansion: (cultureId, options = {}) => applySocialExpansionViaApi(state, documentRef, "culture", cultureId, options),
        delete: (cultureId, options = {}) => deleteCultureViaApi(state, documentRef, cultureId, options),
        rename: (cultureId, name) => renameCultureViaApi(state, documentRef, cultureId, name),
        setColor: (cultureId, color) => setCultureColorViaApi(state, documentRef, cultureId, color),
        setParent: (cultureId, parentId) => setCultureParentViaApi(state, documentRef, cultureId, parentId)
      },
      religions: {
        add: options => addReligionViaApi(state, documentRef, options),
        assignCells: (religionId, gridCellIds) => assignSocialCellsViaApi(state, documentRef, "religion", religionId, gridCellIds),
        inspectExpansion: (religionId, options = {}) => inspectSocialExpansionViaApi(state, "religion", religionId, options),
        applyExpansion: (religionId, options = {}) => applySocialExpansionViaApi(state, documentRef, "religion", religionId, options),
        delete: (religionId, options = {}) => deleteReligionViaApi(state, documentRef, religionId, options),
        rename: (religionId, name) => renameReligionViaApi(state, documentRef, religionId, name),
        setColor: (religionId, color) => setReligionColorViaApi(state, documentRef, religionId, color),
        setParent: (religionId, parentId) => setReligionParentViaApi(state, documentRef, religionId, parentId)
      },
      routes: {
        create: options => createRouteViaApi(state, documentRef, options),
        inspectEdit: (routeId, patch = {}) => inspectRouteEditViaApi(state, routeId, patch),
        update: (routeId, patch = {}) => updateRouteViaApi(state, documentRef, routeId, patch),
        delete: (routeId, options = {}) => deleteRouteViaApi(state, documentRef, routeId, options),
        setNote: (routeId, body, options = {}) => setRouteNoteViaApi(state, documentRef, routeId, body, options)
      },
      rivers: {
        create: options => createRiverViaApi(state, documentRef, options),
        delete: (riverId, options = {}) => deleteRiverViaApi(state, documentRef, riverId, options),
        rename: (riverId, name) => renameRiverViaApi(state, documentRef, riverId, name),
        setWidthFactor: (riverId, widthFactor) => setRiverWidthFactorViaApi(state, documentRef, riverId, widthFactor),
        setNote: (riverId, body, options = {}) => setRiverNoteViaApi(state, documentRef, riverId, body, options)
      },
      lakes: {
        create: options => createLakeViaApi(state, documentRef, options),
        inspectOutlet: (lakeId, outletRiverId) => inspectLakeOutletViaApi(state, lakeId, outletRiverId),
        setOutlet: (lakeId, outletRiverId) => setLakeOutletViaApi(state, documentRef, lakeId, outletRiverId),
        delete: (lakeId, options = {}) => deleteLakeViaApi(state, documentRef, lakeId, options),
        rename: (lakeId, name) => renameLakeViaApi(state, documentRef, lakeId, name)
      },
      features: {
        inspectPatch: options => inspectFeaturePatchViaApi(state, options),
        applyPatch: options => applyFeaturePatchViaApi(state, documentRef, options),
        inspectTopology: options => inspectFeatureTopologyViaApi(state, options),
        applyTopology: options => applyFeatureTopologyViaApi(state, documentRef, options)
      },
      labels: {
        getStyles: () => getRuntimeLabelStyles(state),
        setStyle: (styleType, patch) => setLabelStyleViaApi(state, documentRef, styleType, patch),
        resetStyle: styleType => resetLabelStyleViaApi(state, documentRef, styleType),
        resetStyles: () => resetAllLabelStylesViaApi(state, documentRef),
        addCustom: options => addCustomLabelViaApi(state, documentRef, options),
        delete: label => deleteLabelViaApi(state, documentRef, label),
        moveCustom: (labelId, point) => moveCustomLabelViaApi(state, documentRef, labelId, point),
        renameCustom: (labelId, text) => renameCustomLabelViaApi(state, documentRef, labelId, text),
        setNote: (label, body, options = {}) => setLabelNoteViaApi(state, documentRef, label, body, options),
        restore: label => restoreGeneratedLabelViaApi(state, documentRef, label)
      },
      markers: {
        add: options => addMarkerViaApi(state, documentRef, options),
        delete: markerId => deleteMarkerViaApi(state, documentRef, markerId),
        move: (markerId, packCell) => moveMarkerViaApi(state, documentRef, markerId, packCell),
        setNote: (markerId, body, options = {}) => setMarkerNoteViaApi(state, documentRef, markerId, body, options),
        setVisual: (markerId, patch) => setMarkerVisualViaApi(state, documentRef, markerId, patch)
      }
    }
  };
}

function measureHealthOperation(state, name, detail, task) {
  const monitor = state.healthMonitor;
  if (!monitor?.measureSyncOperation) return task();
  return monitor.measureSyncOperation(name, detail, task);
}

function setRuntimeViewMode(state, documentRef, mode) {
  const nextMode = String(mode || "").trim();
  if (!nextMode) throw new Error("缺少视图模式");
  const availableModes = [...documentRef.querySelectorAll("[data-mode]")].map(item => item.dataset.mode).filter(Boolean);
  if (availableModes.length && !availableModes.includes(nextMode)) throw new Error(`未知视图模式：${nextMode}`);
  return measureHealthOperation(state, "set-view-mode", {mode: nextMode}, () => {
    if (nextMode === "diplomacy") {
      const subjectId = state.selection?.object?.kind === OBJECT_KIND.STATE ? state.selection.object.id : firstDiplomacyStateId(state.map);
      state.panels.diplomacy?.setSelectedStateId?.(subjectId);
      state.renderer?.setDiplomacySubjectId?.(subjectId);
    }
    setActiveModeButton(documentRef, nextMode);
    updateControlPreferences(documentRef, {colorMode: nextMode});
    state.renderer?.setColorMode?.(nextMode);
    updateRuntimePanel(documentRef, state);
    updatePickPanel(documentRef, state);
    return runtimeDisplayActionResult(state, documentRef, ["display-preference", "renderer", "runtime-panel"]);
  });
}

function setRuntimeLayerVisible(state, documentRef, layer, visible) {
  const nextLayer = String(layer || "").trim();
  if (!nextLayer) throw new Error("缺少图层名称");
  const knownLayers = state.renderer?.getStats?.()?.layerVisibility || state.renderer?.layerVisibility || {};
  if (!Object.prototype.hasOwnProperty.call(knownLayers, nextLayer)) throw new Error(`未知图层：${nextLayer}`);
  const nextVisible = Boolean(visible);
  return measureHealthOperation(state, "set-layer-visible", {layer: nextLayer, visible: nextVisible}, () => {
    updateLayerPreference(documentRef, nextLayer, nextVisible);
    const controls = nextLayer === "coastline" ? ["coastline", "lakeShore"] : [nextLayer];
    const layerControls = [...documentRef.querySelectorAll("[data-layer]")];
    for (const item of controls) syncRuntimeBooleanControl(layerControls.find(control => control.dataset.layer === item), nextVisible);
    state.renderer?.setLayerVisible?.(nextLayer, nextVisible);
    updateRuntimePanel(documentRef, state);
    if (nextLayer === "measurements") updateMeasurementOverlay(state, documentRef);
    return runtimeDisplayActionResult(state, documentRef, ["display-preference", "renderer", "runtime-panel", ...(nextLayer === "measurements" ? ["measurement-overlay"] : [])]);
  });
}

function setRuntimeVisualTheme(state, documentRef, themeId) {
  const rawThemeId = String(themeId || "").trim();
  if (!rawThemeId) throw new Error("缺少视觉主题");
  const nextThemeId = normalizeVisualThemeId(rawThemeId);
  if (nextThemeId !== rawThemeId) throw new Error(`未知视觉主题：${themeId}`);
  return measureHealthOperation(state, "set-visual-theme", {visualTheme: nextThemeId}, () => {
    syncMapVisualThemeStore(state.map, nextThemeId);
    applyRuntimeVisualThemeState(state, documentRef, nextThemeId);
    return runtimeDisplayActionResult(state, documentRef, ["display-preference", "renderer", "runtime-panel"]);
  });
}

function listRuntimeVisualThemes(documentRef) {
  const current = currentVisualThemeId(documentRef);
  const userDocuments = new Map(listUserVisualThemeDocuments().map(document => [document.id, document]));
  return {
    current,
    themes: listVisualThemes().map(theme => ({
      ...theme,
      colors: userDocuments.get(theme.value)?.colors ? {...userDocuments.get(theme.value).colors} : null
    }))
  };
}

function exportRuntimeVisualTheme(documentRef, themeId, options = {}) {
  const document = exportVisualThemeDocument(themeId || currentVisualThemeId(documentRef));
  const text = JSON.stringify(document, null, 2);
  const filename = `${document.id}.webgl-theme.json`;
  if (options.download === true) downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  return {document, text: options.includeText === false ? undefined : text, filename, downloaded: options.download === true};
}

function createRuntimeVisualTheme(state, documentRef, options = {}) {
  ensureThemeEditableMap(state.map);
  const baseThemeId = options.baseThemeId || currentVisualThemeId(documentRef);
  const document = createUserVisualThemeDocument({label: options.label, baseThemeId: isUserVisualTheme(baseThemeId) ? exportVisualThemeDocument(baseThemeId).base : baseThemeId});
  if (isUserVisualTheme(baseThemeId)) document.colors = {...exportVisualThemeDocument(baseThemeId).colors};
  const before = captureVisualThemeState(state.map, currentVisualThemeId(documentRef));
  const after = {preset: document.id, userThemes: [...before.userThemes, document]};
  return executeVisualThemeCommand(state, documentRef, createSetUserVisualThemesCommand(before, after, {label: `创建用户主题 ${document.label}`}));
}

function importRuntimeVisualTheme(state, documentRef, source, options = {}) {
  ensureThemeEditableMap(state.map);
  const document = normalizeVisualThemeDocument(source);
  const before = captureVisualThemeState(state.map, currentVisualThemeId(documentRef));
  const existingIndex = before.userThemes.findIndex(theme => theme.id === document.id);
  if (existingIndex >= 0 && options.replace !== true) throw new Error(`用户主题已存在：${document.id}`);
  const userThemes = before.userThemes.map(theme => ({...theme, colors: {...theme.colors}}));
  if (existingIndex >= 0) userThemes.splice(existingIndex, 1, document);
  else userThemes.push(document);
  const after = {preset: options.select === false ? before.preset : document.id, userThemes};
  return executeVisualThemeCommand(state, documentRef, createSetUserVisualThemesCommand(before, after, {label: `导入用户主题 ${document.label}`}));
}

function updateRuntimeVisualTheme(state, documentRef, themeId, colors = {}) {
  ensureThemeEditableMap(state.map);
  const id = String(themeId || currentVisualThemeId(documentRef));
  const document = updateUserVisualThemeDocument(id, colors);
  const before = captureVisualThemeState(state.map, currentVisualThemeId(documentRef));
  const after = {
    preset: id,
    userThemes: before.userThemes.map(theme => theme.id === id ? document : theme)
  };
  return executeVisualThemeCommand(state, documentRef, createSetUserVisualThemesCommand(before, after, {label: `编辑用户主题 ${document.label}`}));
}

function deleteRuntimeVisualTheme(state, documentRef, themeId) {
  ensureThemeEditableMap(state.map);
  const id = String(themeId || currentVisualThemeId(documentRef));
  if (!isUserVisualTheme(id)) throw new Error("内置主题不能删除");
  const before = captureVisualThemeState(state.map, currentVisualThemeId(documentRef));
  const after = {
    preset: before.preset === id ? "default" : before.preset,
    userThemes: before.userThemes.filter(theme => theme.id !== id)
  };
  return executeVisualThemeCommand(state, documentRef, createSetUserVisualThemesCommand(before, after, {label: `删除用户主题 ${id}`}));
}

function executeVisualThemeCommand(state, documentRef, command) {
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    refreshPanels: false
  });
  return editApiResult(state, result);
}

function applyRuntimeVisualThemeState(state, documentRef, themeId, {force = false} = {}) {
  const id = normalizeVisualThemeId(themeId);
  syncMapVisualThemeStore(state.map, id);
  persistUserVisualThemes(documentRef.defaultView?.localStorage);
  documentRef.dispatchEvent(new CustomEvent("webgl-generator-visual-themes-changed", {
    detail: {current: id, options: visualThemeOptions(), userTheme: isUserVisualTheme(id) ? exportVisualThemeDocument(id) : null}
  }));
  syncRuntimeControlValue(documentRef, "visual-theme-preset", id);
  updateControlPreferences(documentRef, {visualTheme: id});
  state.renderer?.setVisualTheme?.(id, {force});
  syncLabelStylesUi(state, documentRef);
  updateRuntimePanel(documentRef, state);
}

function syncMapVisualThemeStore(map, preset) {
  if (!map) return;
  map.visualTheme = {
    ...(map.visualTheme || {}),
    version: 2,
    preset,
    overrides: map.visualTheme?.overrides && typeof map.visualTheme.overrides === "object" ? {...map.visualTheme.overrides} : {},
    userThemes: listUserVisualThemeDocuments()
  };
  map.options = {...(map.options || {}), visualTheme: preset};
}

function ensureThemeEditableMap(map) {
  if (!map) throw new Error("当前没有可编辑的地图");
}

async function importVisualThemeFile(state, documentRef, file, importTheme) {
  try {
    if (!file?.text) throw new Error("未选择主题文件");
    const result = importTheme(await file.text());
    showMapToast(documentRef, `已导入用户主题：${result?.result?.preset || "完成"}`);
    return result;
  } catch (error) {
    showMapToast(documentRef, `主题导入失败：${error?.message || error}`, 2800, {tone: "error"});
    return {executed: false, error};
  }
}

function fitRuntimeView(state, documentRef) {
  if (typeof state.renderer?.fitToView !== "function") throw new Error("当前 renderer 不支持适配视图");
  return measureHealthOperation(state, "fit-view", {}, () => {
    state.renderer.fitToView();
    updateRuntimePanel(documentRef, state);
    updateMeasurementOverlay(state, documentRef);
    return runtimeDisplayActionResult(state, documentRef, ["camera", "runtime-panel", "measurement-overlay"]);
  });
}

function setRuntimeOceanHeightVisible(state, documentRef, visible) {
  return setRuntimeBooleanDisplayPreference(state, documentRef, {
    id: "show-ocean-height",
    key: "showOceanHeight",
    value: visible,
    operation: "set-ocean-height-visibility",
    apply: value => state.renderer?.setViewOptions?.({showOceanHeight: value})
  });
}

function setRuntimeSmoothCellBorders(state, documentRef, enabled) {
  return setRuntimeBooleanDisplayPreference(state, documentRef, {
    id: "smooth-cell-borders",
    key: "smoothCellBorders",
    value: enabled,
    operation: "set-smooth-cell-borders",
    apply: value => state.renderer?.setViewOptions?.({smoothCellBorders: value})
  });
}

function setRuntimeHoverInfoVisible(state, documentRef, visible) {
  const nextVisible = Boolean(visible);
  return measureHealthOperation(state, "set-hover-info-visibility", {showHoverInfo: nextVisible}, () => {
    syncRuntimeBooleanControl(documentRef.getElementById("show-hover-info"), nextVisible);
    updateControlPreferences(documentRef, {showHoverInfo: nextVisible});
    updatePickPanel(documentRef, state);
    return runtimeDisplayActionResult(state, documentRef, ["display-preference", "pick-panel"]);
  });
}

function setRuntimeMaxCityLabels(state, documentRef, limit) {
  const number = Number(limit);
  if (!Number.isFinite(number)) throw new Error("最大城市标签数必须是有效数字");
  const nextLimit = Math.max(8, Math.min(5000, Math.round(number)));
  return measureHealthOperation(state, "set-max-city-labels", {maxCityLabels: nextLimit}, () => {
    syncRuntimeControlValue(documentRef, "max-city-labels", nextLimit);
    updateControlPreferences(documentRef, {maxCityLabels: nextLimit});
    state.renderer?.setLabelOptions?.({maxCityLabels: nextLimit});
    updateRuntimePanel(documentRef, state);
    return runtimeDisplayActionResult(state, documentRef, ["display-preference", "renderer", "runtime-panel"]);
  });
}

function setRuntimeBooleanDisplayPreference(state, documentRef, {id, key, value, operation, apply}) {
  const nextValue = Boolean(value);
  return measureHealthOperation(state, operation, {[key]: nextValue}, () => {
    syncRuntimeBooleanControl(documentRef.getElementById(id), nextValue);
    updateControlPreferences(documentRef, {[key]: nextValue});
    apply(nextValue);
    updateRuntimePanel(documentRef, state);
    return runtimeDisplayActionResult(state, documentRef, ["display-preference", "renderer", "runtime-panel"]);
  });
}

function runtimeDisplayActionResult(state, documentRef, effects) {
  const preferences = readControlPreferences(documentRef);
  const stats = state.renderer?.getStats?.() || {};
  return {
    colorMode: stats.colorMode || preferences.colorMode || "height",
    visualTheme: stats.viewOptions?.visualTheme?.id || preferences.visualTheme || state.options?.visualTheme || "default",
    layers: {...(stats.layerVisibility || preferences.layers || {})},
    display: {
      showOceanHeight: Boolean(preferences.showOceanHeight),
      smoothCellBorders: Boolean(preferences.smoothCellBorders),
      showHoverInfo: Boolean(preferences.showHoverInfo),
      maxCityLabels: Number(preferences.maxCityLabels) || 5000
    },
    camera: {...(stats.camera || {})},
    effects: [...effects]
  };
}

function syncRuntimeBooleanControl(control, value) {
  if (!control) return;
  const enabled = Boolean(value);
  if (control.tagName === "BUTTON") {
    control.classList.toggle("active", enabled);
    control.setAttribute("aria-pressed", enabled ? "true" : "false");
    return;
  }
  control.checked = enabled;
}

function syncRuntimeControlValue(documentRef, id, value) {
  const control = documentRef.getElementById(id);
  if (control) control.value = String(value);
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
    if (typeof preferences.visualTheme === "string") renderer.setVisualTheme?.(preferences.visualTheme);
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

function requestGenerate(state, documentRef, actions = state.runtimeActions) {
  try {
    if (documentRef.getElementById("auto-random-seed").checked) {
      setSeedInput(documentRef, createRandomSeed());
    }
    const options = readOptionsFromPanel(documentRef, state.options);
    state.pendingGenerateRequestId = (state.pendingGenerateRequestId || 0) + 1;
    const requestId = state.pendingGenerateRequestId;
    setGenerationStatus(documentRef, options, "等待生成任务");
    setMythicGenerationLoading(documentRef, true, "request");
    scheduleAfterPaint(documentRef, () => {
      if (requestId !== state.pendingGenerateRequestId) return;
      void actions.generate.newMap({...options, confirm: true}).catch(error => {
        if (!state.map) failStartupLoading(documentRef, error);
      });
    });
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportGenerateError(documentRef, error);
  }
}

async function restoreBrowserStoredMapOrGenerate(state, documentRef) {
  try {
    const result = await state.runtimeActions.data.restoreBrowserMap({confirm: true, startup: true, toast: false});
    if (result.restored) return;
  } catch {
    showMapToast(documentRef, "浏览器存档恢复失败，原存档已保留；当前将生成临时地图", 5200, {tone: "error"});
  }
  requestGenerate(state, documentRef, state.runtimeActions);
}

async function restoreMapFromBrowserStorageViaApi(state, documentRef, options = {}, operation = null) {
  if (options.confirm !== true) throw new Error("恢复浏览器存档会替换当前地图并清空编辑历史，需要显式传入 {confirm: true}");
  const storage = browserStorage(documentRef);
  if (!storage) throw new Error("当前浏览器不支持 LocalStorage");
  const raw = storage.getItem(BROWSER_MAP_STORAGE_KEY);
  if (!raw) return {restored: false, reason: "missing", effects: []};

  try {
    resetLoadTrace(documentRef);
    operation?.report("read-storage", {message: loadingMessage("map-import-read")});
    emitLoadTrace(documentRef, {phase: "request", id: "map-import-read", message: loadingMessage("map-import-read")});
    setFileOperationStatus(documentRef, "正在读取浏览器保存的地图...");
    setMythicGenerationLoading(documentRef, true, "map-import-read");
    operation?.report("decode-storage", {message: loadingMessage("map-import-decode")});
    const document = parseMapDocument(await decodeBrowserMapStoragePayload(documentRef, raw));
    const imported = await importParsedMapDocumentViaApi(state, documentRef, document, {
      source: "browser-storage",
      toast: false
    }, operation);
    updateGenerationLoading(documentRef, false);
    const seed = document.map.metadata?.seed || document.map.options?.seed || "未知";
    setFileOperationStatus(documentRef, `已恢复浏览器保存的地图：seed ${seed}`);
    if (options.toast !== false) showMapToast(documentRef, options.startup ? "已恢复浏览器保存的地图" : "地图已从浏览器恢复");
    return {
      ...imported,
      restored: true,
      storageKey: BROWSER_MAP_STORAGE_KEY,
      effects: [...new Set([...(imported.effects || []), "browser-storage-read"])]
    };
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportMapImportError(state, documentRef, error, null, {
      source: "browser-storage",
      prefix: "浏览器地图恢复失败，原存档已保留"
    });
    throw error;
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
      duplicateChars: String(base?.duplicateChars ?? base?.d ?? "").trim(),
      legacyMultiwordRate: Math.max(0, Math.min(1, Number(base?.legacyMultiwordRate ?? base?.multiwordRate ?? base?.m) || 0))
    })).filter(base => base.id && base.source.length)
    : [];
  const bindings = {
    global: {
      stateRoot: String(namebases.bindings?.global?.stateRoot || "").trim(),
      place: String(namebases.bindings?.global?.place || "").trim(),
      hydro: String(namebases.bindings?.global?.hydro || "").trim(),
      culture: String(namebases.bindings?.global?.culture || "").trim(),
      religion: String(namebases.bindings?.global?.religion || "").trim()
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
      hydro: String(binding.hydro || "").trim(),
      culture: String(binding.culture || "").trim(),
      religion: String(binding.religion || "").trim()
    };
  }
  return result;
}

function getGenerationOptionsViaApi(state, documentRef) {
  const options = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
  return {
    options: cloneGenerationOptions(options),
    map: generationApiMapSummary(state.map)
  };
}

function setGenerationOptionsViaApi(state, documentRef, patch = {}) {
  const options = normalizeApiGenerationOptions(state, documentRef, patch);
  state.options = options;
  syncGenerationInputs(documentRef, options);
  updateRuntimePanel(documentRef, state);
  return {
    options: cloneGenerationOptions(options),
    map: generationApiMapSummary(state.map),
    effects: ["generation-options", "runtime-panel"]
  };
}

async function generateNewMapViaApi(state, documentRef, options = {}, operation = null) {
  operation?.report("validate", {message: "正在校验生成参数"});
  if (options?.confirm !== true) throw new Error("生成新地图会替换当前地图并清空编辑历史，需要显式传入 {confirm: true}");
  const nextOptions = normalizeApiGenerationOptions(state, documentRef, options);
  return generateMapViaApi(state, documentRef, nextOptions, {completionToast: state.map ? "生成完成" : "", operation});
}

async function rerollSeedViaApi(state, documentRef, options = {}, operation = null) {
  operation?.report("validate", {message: "正在校验随机生成参数"});
  if (options?.confirm !== true) throw new Error("随机 seed 生成会替换当前地图并清空编辑历史，需要显式传入 {confirm: true}");
  const seed = String(options.seed || createRandomSeed()).trim() || createRandomSeed();
  const nextOptions = normalizeApiGenerationOptions(state, documentRef, {...options, seed});
  return generateMapViaApi(state, documentRef, nextOptions, {completionToast: "生成完成", operation});
}

async function generateMapViaApi(state, documentRef, options, {completionToast = "", operation = null} = {}) {
  state.options = options;
  syncGenerationInputs(documentRef, options);
  const namebaseSnapshot = resolveGenerationNamebaseSnapshot(state, documentRef);
  state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
  const generateId = state.pendingGenerateId;
  const startedAt = currentLoadTraceTime(documentRef.defaultView || window);
  try {
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "api-generate", message: loadingMessage("request")});
    setGenerationStatus(documentRef, state.options, "生成中");
    setMythicGenerationLoading(documentRef, true, "generate");
    operation?.report("generate", {message: loadingMessage("generate")});
    await yieldToBrowser(documentRef, {debugDelay: true});
    const map = await generateMapOffMainThread(documentRef, generationOptionsWithNamebases(state.options, namebaseSnapshot), generateId);
    if (generateId !== state.pendingGenerateId) throw new Error("生成请求已被新的生成任务取代");
    operation?.report("load-map", {message: loadingMessage("cell-visual-mesh")});
    await loadMapIntoRuntime(state, documentRef, map, {
      loadingMessages: [loadingMessage("cell-visual-mesh"), loadingMessage("panel-refresh")],
      completionToast,
      operation
    });
    return {
      options: cloneGenerationOptions(state.options),
      map: generationApiMapSummary(state.map),
      timings: {
        totalMs: roundLoadTraceMs(currentLoadTraceTime(documentRef.defaultView || window) - startedAt),
        generation: {...(state.map?.metadata?.generationTiming || {})},
        loadMap: state.renderer?.getStats?.().loadMap || null
      },
      history: state.editHistory.getStats(),
      effects: ["replace-map", "clear-history", "renderer", "runtime-panel", "object-panels", "object-index"]
    };
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportGenerateError(documentRef, error);
    throw error;
  }
}

function normalizeApiGenerationOptions(state, documentRef, patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("生成选项必须是对象");
  const base = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
  const {confirm: _confirm, ...rest} = patch;
  return normalizeOptions({...base, ...rest});
}

function cloneGenerationOptions(options) {
  return JSON.parse(JSON.stringify(options || {}));
}

function generationApiMapSummary(map) {
  if (!map) return {ready: false};
  return {
    ready: true,
    seed: map.metadata?.seed || map.options?.seed || "",
    checksum: map.metadata?.checksum || map.summary?.checksum || "",
    gridCells: map.metadata?.gridCells || map.grid?.metadata?.actualCells || 0,
    packCells: map.metadata?.packCells || map.pack?.metadata?.cells || 0,
    states: countPoliticalItems(map.politics?.states || []),
    provinces: countPoliticalItems(map.politics?.provinces || []),
    cities: map.settlements?.cities?.filter(Boolean).length || 0,
    routes: map.settlements?.routes?.filter(Boolean).length || 0,
    rivers: map.rivers?.rivers?.filter(Boolean).length || 0,
    markers: map.markers?.markers?.filter(Boolean).length || 0
  };
}

async function loadMapIntoRuntime(state, documentRef, map, {loadingMessages = [], completionToast = "", operation = null} = {}) {
  emitLoadTrace(documentRef, {phase: "start", id: "load-map", message: "接入地图运行时", delayMs: readDebugLoadDelayMs(documentRef)});
  operation?.report("prepare-map", {message: "正在接入地图运行时"});
  state.canvasToolModes.reset("map-replace");
  state.brushCursorPreview?.reset();
  state.map = map;
  normalizeSocialExpansionMap(state.map);
  normalizeSuitabilityMap(state.map);
  ensureLabelStore(state.map);
  reconcileWarDerivedData(state.map);
  ensureRiverHydrology(state.map);
  state.pick = null;
  state.editHistory.clear();
  state.heightEdit.activeStroke = null;
  cancelHeightLine(state, documentRef);
  clearHeightTerrainSelection(state);
  clearSavedHeightTerrainSelection(state);
  state.heightEdit.terrainSelectionFeather = 0;
  state.panels.height?.updateTerrainSelectionFeather?.(0);
  state.heightEdit.strokeSeed = 0;
  state.heightEdit.globalToolSeed = 0;
  state.heightEdit.terrainTemplateSeed = 0;
  state.heightEdit.seafloorResetSeed = 0;
  state.heightEdit.lastAffected = 0;
  state.heightEdit.lastHeight = "none";
  state.heightEdit.lastDelta = "none";
  state.heightEdit.lastNotice = "";
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
  state.cultureEdit.activeStroke = null;
  state.cultureEdit.lastAffected = 0;
  state.religionEdit.activeStroke = null;
  state.religionEdit.lastAffected = 0;
  state.biomeEdit.activeStroke = null;
  state.biomeEdit.lastAffected = 0;
  state.biomeEdit.preview = null;
  state.suitabilityEdit.activeStroke = null;
  state.suitabilityEdit.lastAffected = 0;
  state.suitabilityEdit.preview = null;
  state.panels.culture?.setAssignmentActive?.(false);
  state.panels.religion?.setAssignmentActive?.(false);
  state.cityEdit.addMode = false;
  state.cityEdit.deleteMode = false;
  state.cityEdit.lastCreatedCityId = null;
  state.markerEdit.mode = null;
  state.markerEdit.type = "mines";
  state.markerEdit.markerId = null;
  state.markerEdit.lastPackCell = null;
  state.measurement.points = [];
  state.measurement.active = false;
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
        operation?.report(stage.id || "renderer", {message: loadingMessage(stage)});
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
  operation?.report("panel-refresh", {message: loadingMessage("panel-refresh")});
  if (loadingMessages[1]) {
    updateGenerationLoading(documentRef, true, loadingMessages[1]);
    await yieldToBrowser(documentRef, {debugDelay: true});
  }
  state.selectionStore.clear();
  refreshRuntimeAfterMapLoad(state, documentRef, {restorePanels: true});
  syncLabelStylesUi(state, documentRef);
  emitLoadTrace(documentRef, {phase: "end", id: "panel-refresh", message: loadingMessage("panel-refresh")});
  emitLoadTrace(documentRef, {phase: "end", id: "load-map", message: "接入地图运行时"});
  emitLoadTrace(documentRef, {phase: "complete", id: "complete", message: "地图进入可交互状态"});
  getWebglGeneratorHealthMonitor(documentRef)?.markMapReady({
    seed: state.map?.metadata?.seed || state.options?.seed || "",
    gridCells: state.map?.metadata?.gridCells || state.map?.grid?.metadata?.actualCells || 0,
    packCells: state.map?.metadata?.packCells || state.map?.pack?.metadata?.cells || 0,
    loadMap: state.renderer?.getStats?.().loadMap || null
  });
  completeStartupLoading(documentRef);
  updateGenerationLoading(documentRef, false);
  showMapToast(documentRef, completionToast);
  scheduleLazyPanelsAfterMapReady(state, documentRef);
}

function refreshRuntimeAfterMapLoad(state, documentRef, {restorePanels = false} = {}) {
  state.panelManager?.clearReturnParents?.();
  updateHeightPanel(state);
  updateStatePanel(state);
  updateGovernmentPanel(state);
  updateProvincePanel(state);
  updateCityPanel(state);
  updateClimatePanel(state);
  updateBiomePanel(state);
  updatePopulationPanel(state);
  updateEmblemPanel(state);
  updateFeaturePanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateEconomyPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  state.panels.namebase.update(state.map, state.editHistory.getStats());
  state.panels.route.update(state.map, state.selection, state.editHistory.getStats());
  state.panels.river.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
  state.panels.oceanCurrent.update(state.map, state.editHistory.getStats());
  updateLakePanel(state);
  updateMeasurementPanel(state);
  if (restorePanels) restorePersistedPanels(state);
  updateEditingInteractionLock(state, documentRef);
  refreshRuntimeAndPickPanels(documentRef, state);
  updateMeasurementOverlay(state, documentRef);
}

function captureMapReplaceSnapshot(state, documentRef) {
  return {
    map: state.map,
    options: cloneGenerationOptions(state.options),
    history: state.editHistory.createSnapshot(),
    selection: state.selectionStore.getSnapshot(),
    lastEditRefresh: state.lastEditRefresh,
    visualTheme: currentVisualThemeId(documentRef),
    userVisualThemes: listUserVisualThemeDocuments()
  };
}

async function restoreMapReplaceSnapshot(state, documentRef, snapshot, _error, operation) {
  operation?.report("rollback", {message: "正在恢复任务前的地图状态"});
  const mapChanged = state.map !== snapshot.map;
  state.map = snapshot.map;
  state.options = cloneGenerationOptions(snapshot.options);
  state.lastEditRefresh = snapshot.lastEditRefresh;
  syncGenerationInputs(documentRef, state.options);
  replaceUserVisualThemes(snapshot.userVisualThemes || []);
  applyRuntimeVisualThemeState(state, documentRef, snapshot.visualTheme, {force: true});
  if (mapChanged && snapshot.map) {
    if (typeof state.renderer.loadMapAsync === "function") await state.renderer.loadMapAsync(snapshot.map);
    else state.renderer.loadMap(snapshot.map);
  }
  state.editHistory.restoreSnapshot(snapshot.history);
  state.selectionStore.batch(() => {
    const selected = snapshot.selection?.selection;
    if (selected) state.selectionStore.setSelection(selected);
    else state.selectionStore.clear();
    if (snapshot.selection?.editingObject) state.selectionStore.startEditing(snapshot.selection.editingObject);
  });
  if (snapshot.map) refreshRuntimeAfterMapLoad(state, documentRef);
}

function ensureRiverHydrology(map) {
  if (!map?.rivers?.rivers?.length) return;
  const result = backfillRiverHydrology(map.grid, map.features, map.pack, map.rivers, riverHydrologyBackfillOptions(map));
  if (!result.changed) return;
  appendGenerationLog(map, `backfill river hydrology: ${result.changed}/${result.total} rivers, regenerated=${result.regenerated}`);
}

function riverHydrologyBackfillOptions(map) {
  const salt = map.metadata?.regeneration?.rivers ?? map.rivers?.metadata?.variationSalt ?? "";
  const riverRegenerationSalt = salt === "" || salt === null || salt === undefined || Number(salt) === 0 ? undefined : salt;
  return {
    ...(map.options || {}),
    namebases: map.namebases,
    riverRegenerationSalt
  };
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
    "climate-panel": () => state.panels.climate?.open(map, history),
    "biome-panel": () => state.panels.biome?.open(map, history),
    "population-panel": () => state.panels.population?.open(map, history),
    "emblem-panel": () => state.panels.emblem?.open(map, history),
    "feature-panel": () => state.panels.feature?.open(map, history),
    "culture-panel": () => state.panels.culture?.open(map, selection, history),
    "religion-panel": () => state.panels.religion?.open(map, selection, history),
    "diplomacy-panel": () => state.panels.diplomacy?.open(map, selection, history),
    "economy-panel": () => state.panels.economy?.open(map, selection, history),
    "military-panel": () => state.panels.military?.open(map, selection, history),
    "route-panel": () => state.panels.route?.open(map, selection, history),
    "river-panel": () => state.panels.river?.open(map, selection, history, state.editingObject),
    "ocean-current-panel": () => state.panels.oceanCurrent?.open(map, history),
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
  documentRef.dispatchEvent(new CustomEvent("webgl-generator-map-toast-change", {detail: {visible: true, tone: toast.dataset.tone}}));
  view.__webglGeneratorToastTimer = view.setTimeout(() => {
    toast.hidden = true;
    toast.textContent = "";
    delete toast.dataset.tone;
    view.__webglGeneratorToastTimer = null;
    documentRef.dispatchEvent(new CustomEvent("webgl-generator-map-toast-change", {detail: {visible: false}}));
  }, durationMs);
}

function canExecuteKeyboardShortcut(state, item) {
  const busy = Boolean(state.runtimeOperation?.getSnapshot?.().busy);
  const history = state.editHistory?.getStats?.() || {};
  if (item.when === "map-idle") return Boolean(state.map) && !busy;
  if (item.when === "map-ready") return Boolean(state.map);
  if (item.when === "undo") return !busy && Number(history.undo) > 0;
  if (item.when === "redo") return !busy && Number(history.redo) > 0;
  if (item.when === "selection-or-editing") return Boolean(state.selection || state.editingObject || state.canvasToolModes.getActive());
  return true;
}

async function executeKeyboardShortcut(state, documentRef, item, runtimePanelHandlers) {
  const action = item.action || {};
  if (item.id === "selection.cancel") {
    const activeModeId = state.canvasToolModes.getActive()?.id;
    if (activeModeId) return cancelCanvasToolMode(state, documentRef, activeModeId, "escape");
    if (state.editingObject) return invokePublicApi(documentRef, "selection.stopEditing");
    if (state.selection) return invokePublicApi(documentRef, "selection.clear");
    return null;
  }
  if (action.type === "panel") {
    const handler = runtimePanelHandlers[action.handler];
    if (typeof handler !== "function") throw new Error(`面板 action 不存在：${action.handler}`);
    return handler();
  }
  if (action.type === "toggle-layer") {
    const snapshot = await invokePublicApi(documentRef, "layers.get");
    const visible = Boolean(snapshot.layers?.[action.layer]);
    return invokePublicApi(documentRef, "layers.setVisible", [action.layer, !visible]);
  }
  if (action.type === "api-sequence") {
    let result = null;
    for (const path of action.paths || []) result = await invokePublicApi(documentRef, path);
    return result;
  }
  if (action.type !== "api") throw new Error(`快捷键 action 类型不受支持：${action.type || "未知"}`);
  const result = await invokePublicApi(documentRef, action.path, action.args || []);
  if (action.feedback) showMapToast(documentRef, action.feedback);
  return result;
}

async function invokePublicApi(documentRef, path, args = []) {
  const api = documentRef.defaultView?.webglGeneratorApi;
  const parts = String(path || "").split(".").filter(Boolean);
  const methodName = parts.pop();
  const owner = parts.reduce((target, key) => target?.[key], api);
  const method = owner?.[methodName];
  if (typeof method !== "function") throw new Error(`公开 API 不存在：${path}`);
  const response = await method.apply(owner, args);
  if (!response?.ok) throw new Error(response?.error?.message || `${path} 调用失败`);
  return response.data;
}

function reportGenerateError(documentRef, error) {
  const message = error instanceof Error ? error.message : String(error);
  const appStatus = documentRef.getElementById("app-status");
  if (appStatus) appStatus.textContent = `生成失败：${message}`;
  console.error(error);
}

async function exportMapImage(state, documentRef, exportAction = state.runtimeActions?.data?.exportPNG) {
  try {
    const pixelScale = readPngExportScale(documentRef);
    const includeMapOverlays = documentRef.getElementById("export-png-overlays")?.checked !== false;
    const transparentBackground = documentRef.getElementById("export-png-transparent")?.checked === true;
    setFileOperationStatus(documentRef, "正在导出图片...");
    const result = await exportAction({download: true, includeMapOverlays, transparentBackground, pixelScale});
    setFileOperationStatus(documentRef, `图片已导出：${result.width} x ${result.height}px，倍率 ${result.pixelScale}x，标注${result.includeMapOverlays ? "包含" : "关闭"}，背景${result.transparentBackground ? "图外透明" : "保持画布"}，${formatStorageBytes(result.bytes)}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "图片导出失败", error);
    return null;
  }
}

function readPngExportScale(documentRef) {
  const control = documentRef.getElementById("export-png-scale");
  const value = Number(control?.value);
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(4, Math.round(value)));
}

function saveMapToLocalFile(state, documentRef, exportAction = state.runtimeActions?.data?.exportMap) {
  try {
    setFileOperationStatus(documentRef, "正在保存地图到本地...");
    const result = exportAction({download: true, includeText: false});
    setFileOperationStatus(documentRef, "地图已保存到本地文件。");
    showMapToast(documentRef, "保存成功");
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "保存到本地失败", error);
    showMapToast(documentRef, "保存失败", 2600, {tone: "error"});
    return null;
  }
}

async function saveMapToBrowserStorage(state, documentRef, saveAction = state.runtimeActions?.data?.saveBrowserMap) {
  try {
    setFileOperationStatus(documentRef, "正在保存地图到浏览器...");
    const result = await saveAction({source: "ui"});
    setFileOperationStatus(documentRef, browserStorageSaveMessage(result));
    showMapToast(documentRef, "保存成功");
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "保存到浏览器失败", error);
    showMapToast(documentRef, "保存失败", 2600, {tone: "error"});
    return null;
  }
}

async function saveMapToBrowserStorageViaApi(state, documentRef) {
  assertMapAvailable(state);
  const storage = browserStorage(documentRef);
  if (!storage) throw new Error("当前浏览器不支持 LocalStorage");
  const exported = exportAllMapData(state, documentRef, {download: false, includeText: true});
  const text = exported.text;
  const payload = await encodeBrowserMapStoragePayload(documentRef, text, state.map);
  storage.setItem(BROWSER_MAP_STORAGE_KEY, JSON.stringify(payload));
  return {
    saved: true,
    storageKey: BROWSER_MAP_STORAGE_KEY,
    encoding: payload.encoding,
    bytes: payload.bytes,
    originalBytes: payload.originalBytes,
    metadata: {...payload.metadata},
    effects: ["browser-storage-write"]
  };
}

function exportMapData(state, documentRef, exportAction = state.runtimeActions?.data?.exportMap) {
  try {
    setFileOperationStatus(documentRef, "正在导出地图数据...");
    const result = exportAction({download: true, includeText: false});
    setFileOperationStatus(documentRef, "地图数据已导出。");
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "地图数据导出失败", error);
    return null;
  }
}

async function exportCompressedMapData(state, documentRef, exportAction = state.runtimeActions?.data?.exportCompressedAll) {
  try {
    setFileOperationStatus(documentRef, "正在导出压缩地图数据...");
    const result = await exportAction({download: true, includeBase64: false});
    setFileOperationStatus(documentRef, `压缩地图数据已导出：原始 ${formatStorageBytes(result.originalBytes)}，压缩后 ${formatStorageBytes(result.compressedBytes)}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "压缩地图数据导出失败", error);
    return null;
  }
}

function exportGeoJson(state, documentRef, exportAction = state.runtimeActions?.data?.exportGEO) {
  try {
    const range = readGeoJsonExportRangeOption(documentRef);
    setFileOperationStatus(documentRef, "正在导出 GeoJSON...");
    const result = exportAction({download: true, includeText: false, range});
    setFileOperationStatus(documentRef, `GeoJSON 已导出，共 ${result.metadata.features} 个 cell 面，范围：${geoJsonRangeLabel(result.metadata.exportRange)}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "GeoJSON 导出失败", error);
    return null;
  }
}

function exportFeatureGeoJson(state, documentRef, exportAction = state.runtimeActions?.data?.exportFeatureGEO) {
  try {
    const layers = readFeatureGeoJsonLayerOptions(documentRef);
    const dissolvePolitical = readFeatureGeoJsonDissolveOption(documentRef);
    const range = readGeoJsonExportRangeOption(documentRef);
    setFileOperationStatus(documentRef, "正在导出要素 GeoJSON...");
    const result = exportAction({download: true, includeText: false, layers, dissolvePolitical, range});
    const dissolveStatus = result.metadata.dissolvedPolitical ? "，已合并政治面边界" : "";
    setFileOperationStatus(documentRef, `要素 GeoJSON 已导出，共 ${result.metadata.features} 个要素，图层：${result.metadata.layerSet}，范围：${geoJsonRangeLabel(result.metadata.exportRange)}${dissolveStatus}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "要素 GeoJSON 导出失败", error);
    return null;
  }
}

function exportNotesSummary(state, documentRef, rows = [], exportAction = state.runtimeActions?.data?.exportNotes) {
  try {
    const noteIds = (rows || []).map(row => String(row?.id || "")).filter(Boolean);
    const result = exportAction({noteIds, download: true, includeText: false});
    setFileOperationStatus(documentRef, `备注摘要已导出，共 ${result.metadata.notes} 条。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "备注摘要导出失败", error);
    return null;
  }
}

async function previewNotesImport(state, documentRef, file, mode = "append") {
  try {
    const preview = inspectNotesImport(await file.text(), state.map, {mode});
    const result = {...preview, filename: file.name || "备注摘要.json"};
    setFileOperationStatus(documentRef, preview.canImport
      ? `备注导入预检完成：可导入 ${preview.valid} 条，孤儿 ${preview.missingObjects} 条，无效 ${preview.invalid} 条。`
      : `备注导入预检失败：${preview.diagnostics?.[0]?.message || "没有可导入记录"}`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "备注导入预检失败", error);
    return null;
  }
}

async function importNotesFile(state, documentRef, file, mode = "append", importAction = state.runtimeActions?.edit?.notes?.import) {
  try {
    const result = importAction(await file.text(), {mode});
    if (result?.error) throw new Error(result.error.message || "备注导入失败");
    setFileOperationStatus(documentRef, result?.executed
      ? `备注摘要已${mode === "replace" ? "替换" : "追加"}导入，共 ${result.result?.valid || 0} 条。`
      : "备注摘要与当前地图一致，没有写入变化。");
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "备注摘要导入失败", error);
    return null;
  }
}

function exportNamebases(state, documentRef, rows = null, exportAction = state.runtimeActions?.namebases?.export) {
  try {
    const selectedIds = selectedNamebaseIds(rows);
    const result = exportAction({baseIds: selectedIds, download: true, includeText: false, format: "json"});
    setFileOperationStatus(documentRef, `${selectedIds ? "选中名称库" : "名称库"}已导出，共 ${result.metadata.bases} 个词池，用户库 ${result.metadata.user} 个。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "名称库导出失败", error);
    return null;
  }
}

function exportLegacyNamebases(state, documentRef, rows = null, exportAction = state.runtimeActions?.namebases?.export) {
  try {
    const selectedIds = selectedNamebaseIds(rows);
    const result = exportAction({baseIds: selectedIds, download: true, includeText: false, format: "legacy"});
    if (!result.bytes) {
      setFileOperationStatus(documentRef, "当前没有可导出的名称库。");
      return result;
    }
    setFileOperationStatus(documentRef, `${selectedIds ? "选中" : ""}原版文本名称库已导出，共 ${result.metadata.bases} 个词池。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "原版文本名称库导出失败", error);
    return null;
  }
}

function selectedNamebaseIds(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map(row => String(row?.id || "").trim()).filter(Boolean);
}

function executeNamebaseEdit(state, documentRef, command) {
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: (state, command) => {
      refreshAfterEdit(state, command);
      refreshAfterNamebaseEdit(state, documentRef);
    }
  });
  return result.result;
}

function undoNamebaseEdit(state, documentRef) {
  return executeNamebaseHistoryCommand(state, documentRef, "undo");
}

function redoNamebaseEdit(state, documentRef) {
  return executeNamebaseHistoryCommand(state, documentRef, "redo");
}

function executeNamebaseHistoryCommand(state, documentRef, action) {
  try {
    const result = executeHistoryCommand(state, documentRef, action, {
      refresh: (state, command) => refreshAfterNamebaseHistoryCommand(state, documentRef, command)
    });
    if (!result.executed) {
      setFileOperationStatus(documentRef, action === "redo" ? "没有可重做的名称库编辑。" : "没有可撤销的名称库编辑。");
      return null;
    }
    setFileOperationStatus(documentRef, `已${action === "redo" ? "重做" : "撤销"}：${result.label}。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, action === "redo" ? "重做名称库编辑失败" : "撤销名称库编辑失败", error);
    return null;
  }
}

function refreshAfterNamebaseEdit(state, documentRef) {
  persistNamebasePreferences(state, documentRef);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
}

function refreshAfterNamebaseHistoryCommand(state, documentRef, command) {
  refreshAfterEdit(state, command);
  if (command?.domain === "namebase") {
    refreshAfterNamebaseEdit(state, documentRef);
    return;
  }
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
}

async function importNamebases(state, documentRef, file, mode = "append", importAction = state.runtimeActions?.namebases?.import) {
  if (!file) return;
  try {
    setFileOperationStatus(documentRef, "正在导入名称库...");
    const document = parseNamebaseDocument(await file.text());
    const actionResult = importAction(document, {filename: file.name, mode, label: "导入名称库"});
    if (actionResult.error) throw new Error(actionResult.error.message);
    if (!actionResult.executed) {
      setFileOperationStatus(documentRef, "未导入名称库：文件中没有可写入的词池。");
      return null;
    }
    const result = actionResult.result || {};
    const replacedText = result.replaced ? `，已替换原用户库 ${result.replaced} 个` : "";
    setFileOperationStatus(documentRef, `名称库已导入 ${result.imported} 个词池${replacedText}，当前用户库 ${result.total} 个，已保存为本地偏好。`);
    return actionResult;
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

function importNamebaseDocumentViaApi(state, documentRef, document, options = {}) {
  assertMapAvailable(state);
  const parsedDocument = normalizeApiNamebaseImportDocument(document);
  const mode = normalizeApiNamebaseImportMode(options.mode);
  const filename = String(options.filename || "api-namebases.json").trim();
  const command = createImportNamebasesCommand(parsedDocument, {
    filename,
    mode,
    label: options.label || "导入名称库"
  });
  return executeNamebaseCommandViaApi(state, documentRef, command, {
    noopStatus: "未导入名称库：文档中没有可写入的词池。",
    status: command => {
      const payload = command.getResult?.() || {};
      const replacedText = payload.replaced ? `，已替换 ${payload.replaced} 个用户库` : "";
      return `已导入名称库 ${payload.imported || 0} 个词池${replacedText}。`;
    }
  });
}

function createNamebaseViaApi(state, documentRef, payload = {}) {
  assertMapAvailable(state);
  const command = createCreateUserNamebaseCommand({
    payload,
    label: "API 新建用户名称库"
  });
  const result = executeNamebaseCommandViaApi(state, documentRef, command, {
    status: command => {
      const payload = command.getResult?.() || {};
      return `已新建用户名称库“${payload.name || payload.id || ""}”。`;
    }
  });
  return result;
}

function copyBuiltinNamebaseViaApi(state, documentRef, baseId, options = {}) {
  assertMapAvailable(state);
  const id = String(baseId || "").trim();
  const command = createCopyBuiltinNamebaseCommand(id, {
    name: options.name || id,
    label: "API 复制内置名称库"
  });
  return executeNamebaseCommandViaApi(state, documentRef, command, {
    noopStatus: "未找到可复制的内置名称库。",
    status: command => {
      const payload = command.getResult?.() || {};
      return `已复制内置名称库为“${payload.name || payload.id || id}”。`;
    }
  });
}

function updateNamebaseViaApi(state, documentRef, baseId, patch = {}) {
  assertMapAvailable(state);
  const id = String(baseId || "").trim();
  const command = createUpdateUserNamebaseCommand(id, patch, {label: "API 更新名称库"});
  return executeNamebaseCommandViaApi(state, documentRef, command, {
    noopStatus: "用户名称库不存在或内容未变化。",
    status: command => {
      const payload = command.getResult?.() || {};
      return `已更新用户名称库“${payload.name || id}”。`;
    }
  });
}

function deleteNamebaseViaAction(state, documentRef, baseId, options = {}, confirmation = "explicit", displayName = "") {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("名称库删除参数必须是对象");
  const id = String(baseId || "").trim();
  const base = state.map?.namebases?.bases?.find(item => item?.id === id && item?.builtin !== true) || null;
  const name = String(displayName || base?.name || id).trim();
  const preview = {
    kind: "namebase",
    kindLabel: "用户名称库",
    valid: Boolean(base),
    validIds: base ? [id] : [],
    deleteIds: base ? [id] : [],
    requestedCount: 1,
    objectCount: base ? 1 : 0,
    cascadeIds: [],
    cascadeCount: 0,
    dependencies: {bindings: countNamebaseBindings(state.map, id)},
    skipped: base ? [] : [{id, code: "not-found", reason: "用户名称库不存在"}],
    requiresConfirm: Boolean(base),
    impactLevel: "medium",
    summary: base ? `删除用户名称库“${name}”。` : "未找到可删除的用户名称库。",
    confirmationMessage: `确定删除用户名称库“${name}”？确认后仍可通过一次撤销恢复。`
  };
  if (options.inspectOnly === true) return namebaseInspectionResult(state, preview);
  if (preview.requiresConfirm && options.confirm !== true) {
    if (confirmation === "explicit") throw createDeleteConfirmationRequiredError(preview);
    if (!requestDeleteConfirmation(preview, message => documentRef.defaultView?.confirm?.(message))) {
      return namebaseInspectionResult(state, preview, {cancelled: true});
    }
  }
  const command = createDeleteUserNamebaseCommand(id, {
    name,
    label: "API 删除名称库"
  });
  const result = executeNamebaseCommandViaApi(state, documentRef, command, {
    noopStatus: "未找到可删除的用户名称库。",
    status: command => {
      const payload = command.getResult?.() || {};
      return `已删除用户名称库“${payload.name || id}”。`;
    }
  });
  return {...result, preview, inspectOnly: false, cancelled: false};
}

function clearNamebasesViaApi(state, documentRef, options = {}, confirmation = "explicit") {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("名称库清空参数必须是对象");
  const users = (state.map?.namebases?.bases || []).filter(base => base?.builtin !== true);
  const preview = {
    kind: "namebase",
    kindLabel: "用户名称库",
    valid: users.length > 0,
    validIds: users.map(base => base.id),
    deleteIds: users.map(base => base.id),
    requestedCount: users.length,
    objectCount: users.length,
    cascadeIds: [],
    cascadeCount: 0,
    dependencies: {bindings: users.reduce((sum, base) => sum + countNamebaseBindings(state.map, base.id), 0)},
    skipped: [],
    requiresConfirm: users.length > 0,
    impactLevel: "high",
    summary: `清空 ${users.length} 个用户名称库。`,
    confirmationMessage: `确定清空 ${users.length} 个用户名称库？确认后仍可通过一次撤销恢复。`
  };
  if (options.inspectOnly === true) return namebaseInspectionResult(state, preview);
  if (preview.requiresConfirm && options.confirm !== true) {
    if (confirmation === "explicit") throw createDeleteConfirmationRequiredError(preview);
    if (!requestDeleteConfirmation(preview, message => documentRef.defaultView?.confirm?.(message))) {
      return namebaseInspectionResult(state, preview, {cancelled: true});
    }
  }
  const command = createClearUserNamebasesCommand({label: "API 清空用户名称库"});
  const result = executeNamebaseCommandViaApi(state, documentRef, command, {
    noopStatus: "当前没有可清空的用户名称库。",
    status: command => {
      const payload = command.getResult?.() || {};
      return `已清空 ${payload.removed || 0} 个用户名称库。`;
    }
  });
  return {...result, preview, inspectOnly: false, cancelled: false};
}

function namebaseInspectionResult(state, preview, options = {}) {
  return {
    executed: false,
    noop: !preview.valid,
    label: "",
    result: null,
    affected: [],
    stale: [],
    effects: {render: "none", selection: "none", runtimeStats: false, pickPanel: false, derived: []},
    error: null,
    history: state.editHistory.getStats(),
    preview,
    inspectOnly: !options.cancelled,
    cancelled: Boolean(options.cancelled)
  };
}

function countNamebaseBindings(map, baseId) {
  const bindings = map?.namebases?.bindings || {};
  const values = [
    ...Object.values(bindings.global || {}),
    ...Object.values(bindings.cultures || {}).flatMap(binding => Object.values(binding || {}))
  ];
  return values.filter(value => value === baseId).length;
}

function bindNamebaseViaApi(state, documentRef, scope, target, baseId, options = {}) {
  assertMapAvailable(state);
  const binding = normalizeApiNamebaseBinding(scope, target, baseId, options);
  const command = createSetNamebaseBindingCommand(binding.target, binding.baseId, {
    cultureId: binding.cultureId,
    label: "API 设置名称库绑定"
  });
  return executeNamebaseCommandViaApi(state, documentRef, command, {
    noopStatus: "名称库绑定没有变化。",
    status: `已设置${binding.cultureId ? `文化 #${binding.cultureId}` : "全局"}${binding.target}名称库绑定。`
  });
}

function renameObjectsFromNamebaseViaApi(state, documentRef, kind, ids, options = {}) {
  assertMapAvailable(state);
  if (options?.confirm !== true) throw new Error("按名称库批量重命名对象需要显式传入 {confirm: true}");
  const targetKind = normalizeApiNamebaseRenameKind(kind);
  const targetIds = normalizeApiNamebaseRenameIds(ids);
  const command = createNamebaseRenameObjectsCommand(targetKind, targetIds, {
    label: options.label || namebaseRenameApiLabel(targetKind)
  });
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: `${namebaseRenameKindLabel(targetKind)}没有可按名称库更新的名称。`,
    status: executed => {
      const payload = executed.getResult?.() || {};
      return `已按当前名称库重命名 ${payload.renamed || 0} 个${namebaseRenameKindLabel(targetKind)}。`;
    },
    throwOnError: false
  });
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function executeNamedObjectNamebaseRename(state, documentRef, kind, ids, {refresh} = {}) {
  const command = createRenameNamedObjectsFromNamebaseCommand(kind, ids);
  executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh,
    status: executed => `已按当前名称库重命名 ${executed.getResult?.().renamed || 0} 个${namebaseRenameKindLabel(kind)}。`,
    noopStatus: `当前筛选${namebaseRenameKindLabel(kind)}没有可按名称库更新的名称。`
  });
  updateEditingInteractionLock(state, documentRef);
}

function createNamebaseRenameObjectsCommand(kind, ids, options = {}) {
  switch (kind) {
    case "state":
      return createRenameStatesFromNamebaseCommand(ids, options);
    case "city":
      return createRenameCitiesFromNamebaseCommand(ids, options);
    case "river":
      return createRenameRiversFromNamebaseCommand(ids, options);
    case "lake":
      return createRenameLakesFromNamebaseCommand(ids, options);
    case "province":
    case "culture":
    case "religion":
      return createRenameNamedObjectsFromNamebaseCommand(kind, ids, options);
    default:
      throw new Error(`暂不支持按名称库重命名对象类型：${kind}`);
  }
}

function normalizeApiNamebaseRenameKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  if (["state", "states", "country", "countries", "nation", "nations"].includes(value)) return "state";
  if (["city", "cities", "settlement", "settlements", "burg", "burgs", "place", "places"].includes(value)) return "city";
  if (["river", "rivers", "hydro", "hydronym", "hydronyms"].includes(value)) return "river";
  if (["lake", "lakes"].includes(value)) return "lake";
  if (["province", "provinces"].includes(value)) return "province";
  if (["culture", "cultures"].includes(value)) return "culture";
  if (["religion", "religions"].includes(value)) return "religion";
  throw new Error("名称库批量重命名对象类型必须是 state / city / river / lake / province / culture / religion");
}

function normalizeApiNamebaseRenameIds(ids) {
  if (!Array.isArray(ids)) throw new Error("名称库批量重命名对象 ids 必须是数组");
  const normalized = [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
  if (!normalized.length) throw new Error("名称库批量重命名对象 ids 不能为空");
  return normalized;
}

function namebaseRenameApiLabel(kind) {
  return `API 按名称库重命名${namebaseRenameKindLabel(kind)}`;
}

function namebaseRenameKindLabel(kind) {
  switch (kind) {
    case "state":
      return "国家";
    case "city":
      return "城市";
    case "river":
      return "河流";
    case "lake":
      return "湖泊";
    case "province":
      return "省份";
    case "culture":
      return "文化";
    case "religion":
      return "宗教";
    default:
      return "对象";
  }
}

function executeNamebaseCommandViaApi(state, documentRef, command, options = {}) {
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: (state, command) => {
      refreshAfterEdit(state, command);
      refreshAfterNamebaseEdit(state, documentRef);
    },
    noopStatus: options.noopStatus,
    status: options.status,
    throwOnError: false
  });
  return editApiResult(state, result);
}

function normalizeApiNamebaseImportDocument(document) {
  if (typeof document === "string") return parseNamebaseDocument(document);
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("名称库导入文档必须是字符串或对象");
  return parseNamebaseDocument(JSON.stringify(document));
}

function normalizeApiNamebaseImportMode(mode) {
  return String(mode || "").trim().toLowerCase() === "replace" ? "replace" : "append";
}

function normalizeApiNamebaseBinding(scope, target, baseId, options = {}) {
  const scopeObject = scope && typeof scope === "object" && !Array.isArray(scope) ? scope : null;
  const rawScope = scopeObject ? scopeObject.scope || (scopeObject.cultureId ? "culture" : "global") : scope || "global";
  const scopeKey = String(rawScope).trim().toLowerCase();
  const cultureId = String(options.cultureId ?? scopeObject?.cultureId ?? "").trim();
  const targetKey = String(target ?? scopeObject?.target ?? "").trim();
  const value = String(baseId ?? scopeObject?.baseId ?? scopeObject?.id ?? scopeObject?.value ?? "").trim();
  if (!targetKey) throw new Error("名称库绑定目标不能为空");
  if (scopeKey === "culture" && !cultureId) throw new Error("文化名称库绑定需要 cultureId");
  if (!["global", "culture"].includes(scopeKey)) throw new Error(`未知名称库绑定范围：${scopeKey}`);
  return {
    scope: scopeKey,
    cultureId: scopeKey === "culture" ? cultureId : "",
    target: targetKey,
    baseId: value
  };
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
    const execution = executeEditCommand(state, documentRef, command, {context: {map: state.map}});
    const result = execution.result || command.getResult();
    if (execution.executed) {
      markDerivedFresh(state.map, ["military"]);
      refreshGenerationSummary(state.map);
      appendGenerationLog(state.map, `import military battle events: imported=${result.imported}, skipped=${result.skipped}`);
    }
    updateRuntimePanel(documentRef, state);
    updateEditingInteractionLock(state, documentRef);
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
    const action = clearNamebasesViaApi(state, documentRef, {}, "native");
    if (action.cancelled || !action.executed) return action;
    setFileOperationStatus(documentRef, `已清空 ${action.result?.removed || 0} 个用户名称库。`);
    return action;
  } catch (error) {
    reportFileOperationError(documentRef, "清空名称库失败", error);
    return null;
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
    const name = row.name || id;
    const action = deleteNamebaseViaAction(state, documentRef, id, {}, "native", name);
    if (action.cancelled) return action;
    if (!action.executed || !action.result?.removed) {
      setFileOperationStatus(documentRef, "未找到可删除的用户名称库。");
      return action;
    }
    setFileOperationStatus(documentRef, `已删除用户名称库“${action.result.name || name}”，当前用户库 ${action.result.total} 个，已更新本地偏好。`);
    return action;
  } catch (error) {
    reportFileOperationError(documentRef, "删除名称库失败", error);
    return null;
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

function readFeatureGeoJsonDissolveOption(documentRef) {
  return documentRef.getElementById("feature-export-dissolve-political")?.checked === true;
}

function readGeoJsonExportRangeOption(documentRef) {
  const mode = String(documentRef.getElementById("geojson-export-range-mode")?.value || "full");
  if (mode !== "bbox") return {mode};
  return {
    mode,
    bbox: [
      Number(documentRef.getElementById("geojson-export-bbox-min-x")?.value),
      Number(documentRef.getElementById("geojson-export-bbox-min-y")?.value),
      Number(documentRef.getElementById("geojson-export-bbox-max-x")?.value),
      Number(documentRef.getElementById("geojson-export-bbox-max-y")?.value)
    ]
  };
}

function geoJsonRangeLabel(range) {
  if (range?.mode === "viewport") return "当前视口";
  if (range?.mode === "bbox") return `bbox ${range.worldBbox?.join(", ") || ""}`.trim();
  return "地图全幅";
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

async function importMapData(state, documentRef, file, importAction = state.runtimeActions?.data?.importMap) {
  if (!file) return;
  try {
    return await importAction(file, {confirm: true, source: "ui"});
  } catch {
    return null;
  }
}

async function importMapDocumentViaApi(state, documentRef, document, options = {}, operation = null) {
  operation?.report("validate", {message: "正在校验地图导入参数"});
  if (options?.confirm !== true) throw new Error("导入完整地图会替换当前地图并清空编辑历史，需要显式传入 {confirm: true}");
  const source = options.source === "ui" ? "ui" : "api";
  state.lastMapImportDiagnostic = null;
  let parsed;
  try {
    operation?.report("parse", {message: loadingMessage("map-import-read")});
    parsed = await normalizeApiMapImportDocument(documentRef, document);
  } catch (error) {
    reportMapImportError(state, documentRef, error, source === "ui" ? document : null, {source, prefix: source === "ui" ? "地图数据导入失败" : "API 导入地图数据失败"});
    throw error;
  }
  return importParsedMapDocumentViaApi(state, documentRef, parsed, {...options, source}, operation);
}

async function importParsedMapDocumentViaApi(state, documentRef, document, options = {}, operation = null) {
  const source = options.source === "ui" ? "ui" : "api";
  const sourceLabel = source === "ui" ? "" : "通过 API ";
  const startedAt = currentLoadTraceTime(documentRef.defaultView || window);
  try {
    resetLoadTrace(documentRef);
    state.lastMapImportDiagnostic = null;
    clearFileOperationDetails(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: `${source === "ui" ? "" : "api-"}map-import-read`, message: loadingMessage("map-import-read")});
    setFileOperationStatus(documentRef, `正在${sourceLabel}导入地图数据...`);
    setMythicGenerationLoading(documentRef, true, "map-import-read");
    const normalizedOptions = normalizeOptions(document.map.options || document.options || state.options);
    document.map.options = normalizedOptions;
    state.options = normalizedOptions;
    const importedUnits = document.map.display?.units;
    if (importedUnits && typeof importedUnits === "object") {
      const units = normalizeUnitPreferences(importedUnits);
      updateControlPreferences(documentRef, {units});
      state.renderer?.setUnitPreferences?.(units);
    }
    applyPersistedVisualTheme(state, documentRef, document);
    syncGenerationInputs(documentRef, normalizedOptions);
    state.pendingGenerateId = (state.pendingGenerateId || 0) + 1;
    operation?.report("load-map", {message: loadingMessage("map-import-render")});
    await loadMapIntoRuntime(state, documentRef, document.map, {
      loadingMessages: [loadingMessage("map-import-render"), loadingMessage("panel-refresh")],
      completionToast: options.toast === false ? "" : "地图数据已导入",
      operation
    });
    const persistedNamebases = createGenerationNamebaseSnapshot(state.map) ? persistNamebasePreferences(state, documentRef) : false;
    updateGenerationLoading(documentRef, false);
    clearFileOperationDetails(documentRef);
    setFileOperationStatus(documentRef, `已${sourceLabel}导入地图数据：seed ${document.map.metadata?.seed || normalizedOptions.seed || "未知"}`);
    return {
      map: generationApiMapSummary(state.map),
      options: cloneGenerationOptions(state.options),
      metadata: {
        type: document.type || "",
        version: document.version ?? null,
        exportedAt: document.exportedAt || "",
        sourceSeed: document.metadata?.seed || "",
        sourceChecksum: document.metadata?.checksum || ""
      },
      timings: {
        totalMs: roundLoadTraceMs(currentLoadTraceTime(documentRef.defaultView || window) - startedAt),
        loadMap: state.renderer?.getStats?.().loadMap || null
      },
      persistedNamebases,
      history: state.editHistory.getStats(),
      effects: ["replace-map", "clear-history", "display-preferences", "renderer", "runtime-panel", "object-panels", "object-index"]
    };
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    reportMapImportError(state, documentRef, error, null, {source, prefix: source === "ui" ? "地图数据导入失败" : "API 导入地图数据失败"});
    throw error;
  }
}

async function normalizeApiMapImportDocument(documentRef, document) {
  return parseMapDocumentPayload(documentRef, document);
}

async function importGeoData(state, documentRef, file, importAction = state.runtimeActions?.data?.importGEO) {
  if (!file) return;
  try {
    setFileOperationStatus(documentRef, "正在导入 GEO 数据...");
    const text = await file.text();
    return importAction(text, {confirm: true, source: "ui", sourceFile: file});
  } catch (error) {
    reportFileOperationError(documentRef, "GEO 数据导入失败", error);
    return null;
  }
}

function importGeoDocumentViaApi(state, documentRef, document, options = {}) {
  assertMapAvailable(state);
  if (options?.confirm !== true) throw new Error("导入 GEO 数据会写入当前地图，需要显式传入 {confirm: true}");
  let analysis = null;
  try {
    const text = normalizeApiGeoImportDocument(document);
    analysis = inspectGeoImportSource(text);
    const terrainCommand = createImportFmgCellsHeightCommand(text, state.map, {label: "API 导入 FMG Cells 地形"});
    const result = terrainCommand
      ? importFmgCellsGeoViaApi(state, documentRef, terrainCommand, options)
      : importGeoMeasurementsViaApi(state, documentRef, text, options);
    const diagnostic = createImportSuccessDiagnostic(analysis.kind, options.sourceFile, {
      ...analysis.summary,
      result: geoImportResultSummary(result)
    }, {source: options.source === "ui" ? "ui" : "api"});
    recordImportDiagnostic(state, documentRef, diagnostic);
    return {...result, diagnostic};
  } catch (error) {
    const kind = analysis?.kind || (error?.code === "invalid-cells-fields" ? "fmg-cells-geojson" : "geojson");
    const diagnostic = createImportFailureDiagnostic(kind, error, options.sourceFile, analysis?.summary || {}, {source: options.source === "ui" ? "ui" : "api"});
    reportImportDiagnostic(state, documentRef, diagnostic, options.source === "ui" ? "GEO 数据导入失败" : "API 导入 GEO 数据失败");
    throw attachImportDiagnostic(error, diagnostic);
  }
}

function importFmgCellsGeoViaApi(state, documentRef, command, options = {}) {
  if (command.isNoop({map: state.map})) {
    setFileOperationStatus(documentRef, "未导入 GEO 地形：当前地图与文件高度一致。");
    return {
      mode: "fmg-cells-terrain",
      imported: false,
      reason: "noop",
      history: state.editHistory.getStats(),
      effects: []
    };
  }
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    throwOnError: false
  });
  if (!result.executed) {
    if (result.error) throw result.error;
    setFileOperationStatus(documentRef, "未导入 GEO 地形：当前地图与文件高度一致。");
    return {
      mode: "fmg-cells-terrain",
      imported: false,
      reason: "noop",
      history: state.editHistory.getStats(),
      effects: []
    };
  }
  const summary = command.getSummary?.() || {};
  const reset = state.map.metadata?.geoImportDerivedRefresh || {};
  const sourceLabel = options.source === "ui" ? "" : "通过 API ";
  setFileOperationStatus(documentRef, `已${sourceLabel}从原版 Cells GEO 导入地形并重置非 GEO 数据：源 cells ${summary.sourceCells || 0}，陆地 ${summary.sourceLandCells || 0}，水域 ${summary.sourceWaterCells || 0}，应用 ${summary.appliedCells || 0} 个当前 cells；军事 ${reset.militaryRegiments || 0}，资源点 ${reset.resourceMarkers || 0}，地区 ${reset.zones || 0}，可撤销。`);
  return {
    mode: "fmg-cells-terrain",
    imported: true,
    summary,
    reset: {...reset},
    map: generationApiMapSummary(state.map),
    history: state.editHistory.getStats(),
    effects: ["map-height", "map-derived-reset", "renderer", "runtime-panel", "object-panels", "object-index"]
  };
}

function importGeoMeasurementsViaApi(state, documentRef, text, options = {}) {
  const payload = parseGeoJsonMeasurements(text, state.map, {limit: normalizeGeoImportLimit(options.limit)});
  const sourceLabel = options.source === "ui" ? "" : "通过 API ";
  const command = createImportMeasurementsCommand(payload.measurements, {label: `${sourceLabel}导入 GEO 测量对象`.trim()});
  if (command.isNoop({map: state.map})) {
    setFileOperationStatus(documentRef, "未导入 GEO 数据：文件中没有可写入的几何。");
    return {
      mode: "measurements",
      imported: false,
      importedCount: 0,
      featureCount: payload.featureCount,
      history: state.editHistory.getStats(),
      effects: []
    };
  }
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    preparePanelRefresh: (targetState, executed, imported) => {
      targetState.measurement.points = [];
      targetState.measurement.editingMeasurementId = null;
      targetState.measurement.active = false;
      if (imported?.[0]?.id) targetState.panels.measurement?.setSelectedMeasurementId?.(imported[0].id);
    },
    throwOnError: false
  });
  if (!result.executed) {
    if (result.error) throw result.error;
    setFileOperationStatus(documentRef, "未导入 GEO 数据：文件中没有可写入的几何。");
    return {
      mode: "measurements",
      imported: false,
      importedCount: 0,
      featureCount: payload.featureCount,
      history: state.editHistory.getStats(),
      effects: []
    };
  }
  const imported = Array.isArray(result.result) ? result.result : [];
  if (state.renderer?.layerVisibility?.measurements === false) {
    state.renderer.setLayerVisible("measurements", true);
    syncMeasurementLayerControl(documentRef, true);
  }
  updateMeasurementOverlay(state, documentRef);
  const selected = imported[0];
  if (selected && options.locate !== false) {
    state.panels.measurement?.setSelectedMeasurementId?.(selected.id);
    state.panels.measurement?.open(state.map, state.editHistory.getStats());
    locateMeasurement(state, {...selected, pointCount: selected.points?.length || 0}, documentRef);
  }
  setFileOperationStatus(documentRef, `GEO 数据已${sourceLabel}导入为 ${imported.length} 个测量对象，可撤销；来源 Feature ${payload.featureCount} 个。`);
  return {
    mode: "measurements",
    imported: true,
    importedCount: imported.length,
    featureCount: payload.featureCount,
    measurements: imported.map(item => ({
      id: item.id,
      name: item.name || "",
      points: item.points?.length || 0
    })),
    history: state.editHistory.getStats(),
    effects: ["measurements", "edit-history", "measurement-overlay", "selection", "runtime-panel"]
  };
}

function normalizeApiGeoImportDocument(document) {
  if (typeof document === "string") return document;
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("GEO 导入文档必须是 GeoJSON 字符串或对象");
  return JSON.stringify(document);
}

function normalizeGeoImportLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit)) return 600;
  return Math.max(1, Math.min(5000, limit));
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

async function importHeightmapImage(state, documentRef, payload, importAction = state.runtimeActions?.data?.importHeightmap) {
  try {
    return await importAction(payload, {confirm: true, source: "ui"});
  } catch (error) {
    reportFileOperationError(documentRef, "高度图导入失败", error, ["heightmap-import-status"]);
    return null;
  }
}

async function importHeightmapImageViaApi(state, documentRef, payload, options = {}, operation = null) {
  if (options.confirm !== true) throw new Error("导入高度图会替换当前地图并清空编辑历史，需要显式传入 {confirm: true}");
  operation?.report("validate", {message: "正在校验高度图导入参数"});
  let file = null;
  let settings = {};
  const startedAt = currentLoadTraceTime(documentRef.defaultView || window);
  try {
    ({file, settings} = normalizeHeightmapImportPayload(payload, documentRef));
    if (!file) throw new Error("请选择一张高度图");
    resetLoadTrace(documentRef);
    emitLoadTrace(documentRef, {phase: "request", id: "heightmap-read", message: loadingMessage("heightmap-read")});
    setFileOperationStatus(documentRef, "正在读取高度图...", ["heightmap-import-status"]);
    setMythicGenerationLoading(documentRef, true, "heightmap-read");
    operation?.report("read-image", {message: loadingMessage("heightmap-read")});
    const generationOptions = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
    const namebaseSnapshot = resolveGenerationNamebaseSnapshot(state, documentRef);
    const importGenerateId = (state.pendingGenerateId || 0) + 1;
    state.pendingGenerateId = importGenerateId;
    state.heightmapImportId = importGenerateId;
    const heightmap = settings.kind === "image-palette"
      ? await createPaletteHeightmapFromImage(documentRef, file, generationOptions, settings)
      : await createGrayscaleHeightmapFromImage(documentRef, file, generationOptions, settings);
    if (importGenerateId !== state.pendingGenerateId) {
      clearStaleHeightmapImportStatus(state, documentRef, importGenerateId);
      return {imported: false, reason: "superseded", effects: []};
    }
    state.options = generationOptions;
    setMythicGenerationLoading(documentRef, true, "heightmap-generate");
    operation?.report("generate", {message: loadingMessage("heightmap-generate")});
    emitLoadTrace(documentRef, {phase: "start", id: "heightmap-generate", message: loadingMessage("heightmap-generate")});
    await yieldToBrowser(documentRef, {debugDelay: true});
    const map = await generateMapOffMainThread(documentRef, generationOptionsWithNamebases(generationOptions, namebaseSnapshot), importGenerateId, {
      heightmap,
      heightmapPayload: heightmap.workerPayload || null
    });
    emitLoadTrace(documentRef, {phase: "end", id: "heightmap-generate", message: loadingMessage("heightmap-generate")});
    if (importGenerateId !== state.pendingGenerateId) {
      clearStaleHeightmapImportStatus(state, documentRef, importGenerateId);
      return {imported: false, reason: "superseded", effects: []};
    }
    state.options = map.options;
    await loadMapIntoRuntime(state, documentRef, map, {
      loadingMessages: [loadingMessage("heightmap-render"), loadingMessage("panel-refresh")],
      completionToast: options.toast === false ? "" : "高度图已应用",
      operation
    });
    updateGenerationLoading(documentRef, false);
    setFileOperationStatus(documentRef, heightmapImportSuccessMessage(heightmap), ["heightmap-import-status"]);
    const result = {
      imported: true,
      source: {...(heightmap.source || {})},
      map: generationApiMapSummary(state.map),
      options: cloneGenerationOptions(state.options),
      timings: {
        totalMs: roundLoadTraceMs(currentLoadTraceTime(documentRef.defaultView || window) - startedAt),
        generation: {...(state.map?.metadata?.generationTiming || {})},
        loadMap: state.renderer?.getStats?.().loadMap || null
      },
      history: state.editHistory.getStats(),
      effects: ["replace-map", "clear-history", "renderer", "runtime-panel", "object-panels", "object-index"]
    };
    const diagnostic = createImportSuccessDiagnostic("heightmap", file, createHeightmapSourceSummary(file, settings, heightmap.source), {source: options.source === "ui" ? "ui" : "api"});
    recordImportDiagnostic(state, documentRef, diagnostic);
    return {...result, diagnostic};
  } catch (error) {
    updateGenerationLoading(documentRef, false);
    const diagnostic = createImportFailureDiagnostic("heightmap", error, file, createHeightmapSourceSummary(file, settings), {source: options.source === "ui" ? "ui" : "api"});
    reportImportDiagnostic(state, documentRef, diagnostic, options.source === "ui" ? "高度图导入失败" : "API 导入高度图失败", ["heightmap-import-status"]);
    throw attachImportDiagnostic(error, diagnostic);
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
    if (!status) continue;
    status.textContent = message;
    const nextState = fileOperationFeedbackState(message);
    if (nextState) status.dataset.state = nextState;
    else delete status.dataset.state;
  }
}

function fileOperationFeedbackState(message) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (/失败|错误|无效|拒绝|无法|不支持/.test(text)) return "error";
  if (/已|成功|完成/.test(text)) return "success";
  return "progress";
}

function reportMapImportError(state, documentRef, error, file, options = {}) {
  const diagnostic = createMapImportDiagnostic(error, file, {source: options.source});
  reportImportDiagnostic(state, documentRef, diagnostic, options.prefix || "地图数据导入失败");
}

function reportImportDiagnostic(state, documentRef, diagnostic, prefix, targetIds) {
  const message = diagnostic.error?.message || "未知错误";
  state.lastMapImportDiagnostic = diagnostic;
  setFileOperationStatus(documentRef, `${prefix}：${message}`, targetIds);
  setFileOperationDetails(documentRef, formatMapImportDiagnosticLines(diagnostic));
  const exportButton = documentRef.getElementById("export-map-import-diagnostic");
  if (exportButton) exportButton.hidden = false;
  console.warn(diagnostic.error || diagnostic);
}

function recordImportDiagnostic(state, documentRef, diagnostic) {
  state.lastMapImportDiagnostic = diagnostic;
  setFileOperationDetails(documentRef, formatMapImportDiagnosticLines(diagnostic));
  const exportButton = documentRef.getElementById("export-map-import-diagnostic");
  if (exportButton) exportButton.hidden = false;
}

function geoImportResultSummary(result) {
  return {
    mode: result?.mode || "",
    imported: Boolean(result?.imported),
    importedCount: Number(result?.importedCount || result?.summary?.appliedCells || 0),
    featureCount: Number(result?.featureCount || result?.summary?.sourceCells || 0)
  };
}

function exportMapImportDiagnostic(state, documentRef, exportAction = state.runtimeActions?.data?.exportImportDiagnostic) {
  try {
    const result = exportAction({download: true});
    if (!result.available) return false;
    setFileOperationStatus(documentRef, `已导出导入诊断：${result.diagnostic.error?.code || result.diagnostic.import?.status || "success"}`);
    return true;
  } catch (error) {
    reportFileOperationError(documentRef, "导入诊断导出失败", error);
    return false;
  }
}

function exportMapImportDiagnosticViaApi(state, documentRef, options = {}) {
  const diagnostic = state.lastMapImportDiagnostic;
  if (!diagnostic) return {available: false, reason: "missing", effects: []};
  const suffix = String(diagnostic.file.name || "map-import").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "map-import";
  const filename = `${suffix}.diagnostic.json`;
  const text = stringifyMapImportDiagnostic(diagnostic);
  if (options.download === true) downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  return {
    available: true,
    filename,
    mimeType: "application/json;charset=utf-8",
    bytes: text.length,
    text: options.includeText === false ? undefined : text,
    diagnostic: JSON.parse(text),
    effects: options.download === true ? ["download"] : []
  };
}

function reportFileOperationError(documentRef, prefix, error, targetIds) {
  const message = error instanceof Error ? error.message : String(error);
  setFileOperationStatus(documentRef, `${prefix}：${message}`, targetIds);
  console.error(error);
}

function setFileOperationDetails(documentRef, lines, targetId = "file-operation-error-details") {
  const details = documentRef.getElementById(targetId);
  if (!details) return;
  const text = lines.filter(Boolean).join("\n");
  details.textContent = text;
  details.hidden = !text;
}

function clearFileOperationDetails(documentRef, targetId = "file-operation-error-details") {
  const details = documentRef.getElementById(targetId);
  if (details) {
    details.textContent = "";
    details.hidden = true;
  }
  const exportButton = documentRef.getElementById("export-map-import-diagnostic");
  if (exportButton) exportButton.hidden = true;
}

function syncGenerationInputs(documentRef, options) {
  setInputValue(documentRef, "seed-input", options.seed, {emitChange: false});
  setInputValue(documentRef, "cells-input", options.cellsTarget ?? options.cells, {emitChange: false});
  setInputValue(documentRef, "width-input", options.graphWidth, {emitChange: false});
  setInputValue(documentRef, "height-input", options.graphHeight, {emitChange: false});
  setInputValue(documentRef, "heightmap-template", options.heightmapTemplate, {emitChange: false});
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
    setInputValue(documentRef, id, value, {emitChange: false});
  }
}

function setInputValue(documentRef, id, value, {emitChange = true} = {}) {
  const input = documentRef.getElementById(id);
  if (!input || value === undefined || value === null) return;
  if (input.tagName === "SELECT" && !Array.from(input.options).some(option => option.value === String(value))) return;
  input.value = String(value);
  if (emitChange) input.dispatchEvent(new Event("change", {bubbles: true}));
}

function applyPersistedVisualTheme(state, documentRef, document) {
  mergePersistedUserVisualThemes(documentRef.defaultView?.localStorage, document?.map?.visualTheme?.userThemes || []);
  const visualTheme = normalizeVisualThemeId(document?.map?.visualTheme?.preset || document?.map?.options?.visualTheme || document?.options?.visualTheme);
  applyRuntimeVisualThemeState(state, documentRef, visualTheme, {force: true});
}

function currentVisualThemeId(documentRef) {
  return normalizeVisualThemeId(readControlPreferences(documentRef).visualTheme);
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

function applyClimatePatchViaApi(state, documentRef, patch = {}, options = {}) {
  if (!state.map) throw new Error("当前没有可更新气候的地图");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("气候配置 patch 必须是对象");
  const normalizedPatch = normalizeClimateApiPatch(patch, state.options);
  const currentClimate = climateOptionSnapshot(state.options);
  const nextOptions = normalizeOptions({...state.options, ...normalizedPatch});
  const nextClimate = climateOptionSnapshot(nextOptions);
  const changed = !sameClimateOptions(currentClimate, nextClimate);
  syncClimateInputs(documentRef, nextOptions);
  if (!changed && options.force !== true) return climateApiUpdateResult(state, false);
  return measureHealthOperation(state, "apply-climate", {keys: Object.keys(normalizedPatch)}, () => applyClimateOptions(state, documentRef, nextOptions, changed));
}

function setClimateLatitudeViaApi(state, documentRef, value, options = {}) {
  return applyClimatePatchViaApi(state, documentRef, normalizeClimateLatitudeApiValue(value), options);
}

function setClimateWindViaApi(state, documentRef, index, direction, options = {}) {
  const band = Number.parseInt(index, 10);
  if (!Number.isInteger(band) || band < 0 || band > 5) throw new Error("风带 index 必须是 0 到 5 的整数");
  const winds = normalizeWindProfile(state.options?.winds);
  winds[band] = normalizeWindDirectionApiValue(direction);
  return applyClimatePatchViaApi(state, documentRef, {atmosphereDirection: "customBands", winds}, options);
}

function inspectClimateDownstreamRebuildViaApi(state, options = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("气候下游重算预检参数必须是对象");
  return inspectClimateDownstreamRebuild(state.map, {
    systems: options.systems || options.selectedSystems || [],
    seed: options.seed
  });
}

async function applyClimateDownstreamRebuildViaApi(state, documentRef, options = {}, operationContext) {
  assertMapAvailable(state);
  if (options?.confirm !== true) throw new Error("气候下游重算会改写多个地图派生系统，需要显式传入 {confirm: true}");
  const map = state.map;
  const assertCurrent = () => {
    operationContext?.throwIfCancelled?.();
    if (state.map !== map || operationContext && !operationContext.isCurrent()) {
      throw createRuntimeOperationError("operation_obsolete", "气候下游重算请求对应的地图已被替换", {
        stage: "identity",
        expected: true
      });
    }
  };
  assertCurrent();
  const before = regenerationApiSummary(map);
  updateGenerationLoading(documentRef, true, "正在准备气候下游重算");
  try {
    await yieldToBrowser(documentRef);
    assertCurrent();
    const execution = await executeClimateDownstreamRebuildAsync({
      map,
      editHistory: state.editHistory,
      systems: options.systems || options.selectedSystems || [],
      seed: options.seed,
      executeSystem: (systemId, context) => {
        assertCurrent();
        return executeClimateDownstreamSystem(state, documentRef, systemId, context);
      },
      executeCommand: command => executeEditCommand(state, documentRef, command, {
        context: {map},
        refresh: () => {},
        refreshPanels: false
      }),
      refreshSummary: refreshGenerationSummary,
      onRestore: map => {
        if (state.map === map) state.options = map.options;
      },
      onProgress: progress => updateGenerationLoading(documentRef, true, progress.message),
      yieldToMain: () => yieldToBrowser(documentRef),
      signal: operationContext?.signal,
      assertCurrent,
      shouldRestoreHistory: () => state.map === map
    });
    assertCurrent();
    if (!execution.executed) {
      return {
        executed: false,
        preview: execution.preview,
        before,
        after: before,
        history: state.editHistory.getStats(),
        effects: []
      };
    }
    updateGenerationLoading(documentRef, true, "正在刷新气候下游结果");
    await yieldToBrowser(documentRef);
    assertCurrent();
    await refreshClimateDownstreamRebuildState(state, documentRef, execution.command);
    assertCurrent();
    const result = {
      executed: true,
      seed: execution.seed,
      requestedSystems: execution.requestedSystems,
      requiredSystems: execution.requiredSystems,
      selectedSystems: execution.selectedSystems,
      executionOrder: execution.executionOrder,
      candidates: execution.preview.candidates,
      estimatedAffected: execution.preview.estimatedAffected,
      steps: execution.steps.map(climateDownstreamPublicStep),
      checksum: execution.checksum,
      timings: execution.timings,
      staleSystems: execution.staleSystems,
      before,
      after: regenerationApiSummary(map),
      history: state.editHistory.getStats(),
      effects: ["map-derived", "renderer", "runtime-panel", "object-panels", "object-index"]
    };
    setFileOperationStatus(documentRef, `已完成气候下游重算：${result.executionOrder.join(" -> ")}`);
    return result;
  } catch (error) {
    if (state.map === map) {
      await refreshClimateDownstreamRebuildState(state, documentRef, {effects: REGENERATION_TRANSACTION_EFFECTS});
    }
    setFileOperationStatus(documentRef, `气候下游重算失败并已回滚：${error.message}`);
    throw error;
  } finally {
    updateGenerationLoading(documentRef, false);
  }
}

async function executeClimateDownstreamSystem(state, documentRef, systemId, context = {}) {
  if (systemId === "markers") return regenerateMarkerResourcesForClimate(state, documentRef, context.regenerationSalt);
  if (systemId === "economy") return rebuildEconomyViaAction(state, documentRef, {label: "气候下游重算：经济", deferRefresh: true});
  return regenerateMapAttribute(state, systemId, documentRef);
}

async function applyOceanCurrentWorldRebuildViaAction(state, documentRef, options = {}, operationContext) {
  assertMapAvailable(state);
  if (options.confirm !== true) throw new Error("完整洋流世界重算会改写全部派生数据，需要显式传入 {confirm: true}");
  const map = state.map;
  const identity = snapshotOceanCurrentWorldIdentity(map);
  const seafloorPlan = options.seafloorPlan || null;
  const execution = await executeOceanCurrentWorldRebuild({
    map,
    editHistory: state.editHistory,
    seed: options.seed,
    signal: operationContext.signal,
    assertCurrent: () => state.map === map && operationContext.isCurrent(),
    faultAt: options.faultAt,
    yieldToMain: () => yieldToBrowser(documentRef),
    onProgress: progress => operationContext.report(progress.system || progress.phase, {message: progress.message}),
    executePrepare: seafloorPlan ? () => {
      const command = createResetSeafloorCommand(seafloorPlan);
      if (command.isNoop?.({map})) return {executed: false};
      command.apply({map});
      return {executed: true, result: command.getResult?.()};
    } : null,
    executeStage: (system, context) => rebuildOceanCurrentWorldStage(map, system, context),
    executeCommand: command => executeEditCommand(state, documentRef, command, {
      context: {map},
      refresh: () => {},
      refreshPanels: false
    }),
    refreshSummary: () => {
      assertOceanCurrentWorldIdentity(map, identity);
      syncMilitaryStateMirrors(map);
      reconcileWarDerivedData(map);
      clearGeneratedCityLabelHides(map);
      markDerivedFresh(map, ["ocean-currents", "climate", "rivers", "biomes", "population", "cultures", "cities", "routes", "states", "provinces", "religions", "markers", "economy", "diplomacy", "military", "zones"]);
      refreshGenerationSummary(map);
      appendGenerationLog(map, `rebuild ocean current world: seed=${options.seed || "auto"}, seafloor=${Boolean(seafloorPlan)}`);
    },
    onRestore: () => {
      state.options = map.options;
    }
  });
  await refreshClimateDownstreamRebuildState(state, documentRef, execution.command);
  updateOceanCurrentPanel(state);
  setFileOperationStatus(documentRef, seafloorPlan ? "已重设海底并完成整链世界重算。" : "已完成洋流、气候与整链世界重算。");
  return execution;
}

async function regenerateMarkerResourcesForClimate(state, documentRef, regenerationSalt) {
  const map = state.map;
  const beforeResources = map.markers?.metadata?.resourceMarkers || 0;
  const beforePotential = map.markers?.metadata?.resourcePotential || 0;
  const salt = nextRegenerationSalt(map, "markers");
  if (Number.isInteger(regenerationSalt) && regenerationSalt !== salt) throw new Error("气候资源点重算扰动序号不一致");
  const execution = await regenerateResourceMarkersInChunks(map, {
    salt,
    yieldToMain: () => yieldToBrowser(documentRef)
  });
  if (!execution.executed) return regenerationResult("markers", "未执行", "当前地图缺少可用 pack 语义图或标记集合，无法重生成资源点。");
  markDerivedFresh(map, ["markers", "economy"]);
  markDerivedStale(map, ["military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate resources: salt=${salt}, resources=${map.markers.metadata.resourceMarkers}, resourcePotential=${map.markers.metadata.resourcePotential}, markerResourceDeals=${map.economy?.metadata?.resourceTrade?.markerResourceDeals || 0}`);
  return {
    ...regenerationResult(
      "markers",
      `资源点已按当前地形、河流、生物群系、温度和降水约束重算（扰动 #${salt}）：${beforeResources} -> ${map.markers.metadata.resourceMarkers}；资源潜力 ${beforePotential} -> ${map.markers.metadata.resourcePotential}`,
      "已刷新资源 marker、正式货物来源、市场库存、交易、国家/省份资源潜力、点图层、对象索引和统计；军事与外交已标记为待派生。"
    ),
    timings: execution.timings
  };
}

function climateDownstreamPublicStep(step) {
  return {
    system: step.system,
    covers: [...step.covers],
    regenerationSalt: step.regenerationSalt,
    executed: step.result?.executed !== false,
    status: step.result?.status || step.result?.result?.status || ""
  };
}

async function refreshClimateDownstreamRebuildState(state, documentRef, commandOrEffects) {
  state.renderer.refreshObjectPickingIndex?.();
  await yieldToBrowser(documentRef);
  state.selectionStore.batch(() => {
    reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false});
    refreshAfterEdit(state, commandOrEffects);
  });
  await yieldToBrowser(documentRef);
  refreshPanelsForEdit(state, commandOrEffects);
  await yieldToBrowser(documentRef);
  updateClimatePanel(state);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
}

function normalizeClimateApiPatch(patch, currentOptions = {}) {
  const next = {};
  for (const key of CLIMATE_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  if (Object.prototype.hasOwnProperty.call(next, "climateLatitudeMode")) next.climateLatitudeMode = normalizeClimateLatitudeModeForApi(next.climateLatitudeMode);
  if (Object.prototype.hasOwnProperty.call(next, "atmosphereDirection")) next.atmosphereDirection = normalizeAtmosphereDirectionForApi(next.atmosphereDirection);
  if (Object.prototype.hasOwnProperty.call(patch, "latitude")) Object.assign(next, normalizeClimateLatitudeApiValue(patch.latitude));
  if (Object.prototype.hasOwnProperty.call(patch, "latitudeMode")) next.climateLatitudeMode = normalizeClimateLatitudeModeForApi(patch.latitudeMode);
  if (Object.prototype.hasOwnProperty.call(patch, "mode")) next.climateLatitudeMode = normalizeClimateLatitudeModeForApi(patch.mode);
  assignNumberPatch(next, patch, "climateLatitudeCenter", "latitudeCenter");
  assignNumberPatch(next, patch, "climateLatitudeCenter", "center");
  assignNumberPatch(next, patch, "climateLatitudeSpan", "latitudeSpan");
  assignNumberPatch(next, patch, "climateLatitudeSpan", "span");
  assignNumberPatch(next, patch, "climateLatitudeRangePercent", "latitudeRangePercent");
  assignNumberPatch(next, patch, "climateLatitudeRangePercent", "latitudeRange");
  assignNumberPatch(next, patch, "climateMapSizePercent", "mapSizePercent");
  assignNumberPatch(next, patch, "climateLongitudeRangePercent", "longitudeRangePercent");
  assignNumberPatch(next, patch, "climateLongitudeRangePercent", "longitudeRange");
  if (Object.prototype.hasOwnProperty.call(patch, "temperature")) Object.assign(next, normalizeTemperatureApiPatch(patch.temperature));
  assignNumberPatch(next, patch, "temperatureEquator", "equator");
  assignNumberPatch(next, patch, "temperatureNorthPole", "northPole");
  assignNumberPatch(next, patch, "temperatureSouthPole", "southPole");
  assignNumberPatch(next, patch, "precipitation", "precipitation");
  if (Object.prototype.hasOwnProperty.call(patch, "atmosphere")) Object.assign(next, normalizeAtmosphereApiPatch(patch.atmosphere));
  if (Object.prototype.hasOwnProperty.call(patch, "atmosphereDirection")) next.atmosphereDirection = normalizeAtmosphereDirectionForApi(patch.atmosphereDirection);
  if (Object.prototype.hasOwnProperty.call(patch, "windProfile")) next.winds = normalizeWindProfile(patch.windProfile);
  if (Object.prototype.hasOwnProperty.call(patch, "winds")) next.winds = normalizeWindProfile(patch.winds);
  if (next.climateLatitudeCenter !== undefined && next.climateLatitudeMode === undefined) next.climateLatitudeMode = "custom";
  if (next.winds !== undefined && next.atmosphereDirection === undefined) next.atmosphereDirection = "customBands";
  if (next.climateLatitudeRangePercent !== undefined && next.climateMapSizePercent === undefined) next.climateMapSizePercent = next.climateLatitudeRangePercent;
  if (Object.keys(next).length === 0) return climateOptionSnapshot(currentOptions);
  return next;
}

function normalizeClimateLatitudeApiValue(value) {
  if (typeof value === "number" || typeof value === "bigint" || numericString(value)) {
    return {climateLatitudeMode: "custom", climateLatitudeCenter: normalizeApiNumber(value, "纬度中心")};
  }
  if (typeof value === "string") return {climateLatitudeMode: normalizeClimateLatitudeModeForApi(value)};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("纬度参数必须是数字、预设名称或对象");
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(value, "mode")) patch.climateLatitudeMode = normalizeClimateLatitudeModeForApi(value.mode);
  if (Object.prototype.hasOwnProperty.call(value, "climateLatitudeMode")) patch.climateLatitudeMode = normalizeClimateLatitudeModeForApi(value.climateLatitudeMode);
  assignNumberPatch(patch, value, "climateLatitudeCenter", "center");
  assignNumberPatch(patch, value, "climateLatitudeCenter", "latitudeCenter");
  assignNumberPatch(patch, value, "climateLatitudeSpan", "span");
  assignNumberPatch(patch, value, "climateLatitudeSpan", "latitudeSpan");
  assignNumberPatch(patch, value, "climateLatitudeRangePercent", "range");
  assignNumberPatch(patch, value, "climateLatitudeRangePercent", "latitudeRange");
  assignNumberPatch(patch, value, "climateLatitudeRangePercent", "latitudeRangePercent");
  assignNumberPatch(patch, value, "climateLongitudeRangePercent", "longitudeRange");
  assignNumberPatch(patch, value, "climateLongitudeRangePercent", "longitudeRangePercent");
  if (patch.climateLatitudeCenter !== undefined && patch.climateLatitudeMode === undefined) patch.climateLatitudeMode = "custom";
  if (Object.keys(patch).length === 0) throw new Error("纬度对象缺少 mode、center 或 range 字段");
  return patch;
}

function normalizeTemperatureApiPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("温度参数必须是对象");
  const patch = {};
  assignNumberPatch(patch, value, "temperatureEquator", "equator");
  assignNumberPatch(patch, value, "temperatureEquator", "temperatureEquator");
  assignNumberPatch(patch, value, "temperatureNorthPole", "northPole");
  assignNumberPatch(patch, value, "temperatureNorthPole", "temperatureNorthPole");
  assignNumberPatch(patch, value, "temperatureSouthPole", "southPole");
  assignNumberPatch(patch, value, "temperatureSouthPole", "temperatureSouthPole");
  if (Object.keys(patch).length === 0) throw new Error("温度对象缺少 equator、northPole 或 southPole 字段");
  return patch;
}

function normalizeAtmosphereApiPatch(value) {
  if (typeof value === "string") return {atmosphereDirection: normalizeAtmosphereDirectionForApi(value)};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("大气参数必须是方向名称或对象");
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(value, "direction")) patch.atmosphereDirection = normalizeAtmosphereDirectionForApi(value.direction);
  if (Object.prototype.hasOwnProperty.call(value, "atmosphereDirection")) patch.atmosphereDirection = normalizeAtmosphereDirectionForApi(value.atmosphereDirection);
  if (Object.prototype.hasOwnProperty.call(value, "winds")) patch.winds = normalizeWindProfile(value.winds);
  if (Object.prototype.hasOwnProperty.call(value, "windProfile")) patch.winds = normalizeWindProfile(value.windProfile);
  if (patch.winds !== undefined && patch.atmosphereDirection === undefined) patch.atmosphereDirection = "customBands";
  if (Object.keys(patch).length === 0) throw new Error("大气对象缺少 direction 或 winds 字段");
  return patch;
}

function normalizeClimateLatitudeModeForApi(value) {
  const normalized = normalizeClimateLatitudeMode(value);
  if (typeof value !== "string" || normalized !== value) throw new Error(`未知纬度模式：${value}`);
  return normalized;
}

function normalizeAtmosphereDirectionForApi(value) {
  const normalized = normalizeAtmosphereDirection(value);
  if (typeof value !== "string" || normalized !== value) throw new Error(`未知大气方向：${value}`);
  return normalized;
}

function normalizeWindDirectionApiValue(value) {
  if (typeof value === "number" || typeof value === "bigint" || numericString(value)) {
    const angle = Math.round(normalizeApiNumber(value, "风向角度"));
    return ((angle % 360) + 360) % 360;
  }
  const aliases = {
    ne: "northeast",
    se: "southeast",
    nw: "northwest",
    sw: "southwest",
    northeast: "northeast",
    southeast: "southeast",
    northwest: "northwest",
    southwest: "southwest"
  };
  const key = aliases[String(value || "").trim().toLowerCase()];
  if (!key) throw new Error(`未知风带方向：${value}`);
  return windAngleFromDirection(key);
}

function assignNumberPatch(target, source, targetKey, sourceKey) {
  if (!Object.prototype.hasOwnProperty.call(source, sourceKey)) return;
  target[targetKey] = normalizeApiNumber(source[sourceKey], sourceKey);
}

function normalizeApiNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} 必须是有效数字`);
  return number;
}

function numericString(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
}

function applyClimateControls(state, documentRef, applyAction = state.runtimeActions?.climate?.apply) {
  if (!state.map) return;
  const options = normalizeOptions(readOptionsFromPanel(documentRef, state.options));
  if (typeof applyAction !== "function") throw new Error("气候 action 尚未初始化");
  return applyAction(climateOptionSnapshot(options), {force: true});
}

function applyClimateOptions(state, documentRef, options, changed = true) {
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
  markDerivedStale(state.map, CLIMATE_DERIVED_STALE_SYSTEMS);

  refreshAfterEdit(state, {
    render: "draw",
    selection: "none",
    runtimeStats: true,
    pickPanel: true,
    derived: ["cell-colors", "point-layers", "object-panels"],
    affected: objectAffected("climate", "live")
  });
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateCityPanel(state);
  updateStatePanel(state);
  updateGovernmentPanel(state);
  updateProvincePanel(state);
  return climateApiUpdateResult(state, changed);
}

function climateApiUpdateResult(state, changed) {
  const climate = state.map?.climate || {};
  const metadata = climate.metadata || {};
  return {
    changed,
    checksum: state.map?.metadata?.checksum || state.map?.summary?.checksum || "",
    options: climateOptionSnapshot(state.options),
    climate: {
      temperatureMin: metadata.temperatureMin ?? null,
      temperatureMax: metadata.temperatureMax ?? null,
      precipitationMin: metadata.precipitationMin ?? null,
      precipitationMax: metadata.precipitationMax ?? null,
      latitudeMode: metadata.latitudeMode || "",
      latitudeLabel: metadata.latitudeLabel || "",
      atmosphereDirection: metadata.atmosphereDirection || state.options?.atmosphereDirection || "",
      atmosphereLabel: metadata.atmosphereLabel || "",
      biomeCounts: {...(metadata.biomeCounts || {})}
    },
    derivedStale: [...(state.map?.metadata?.derivedStale?.systems || [])],
    effects: ["map-climate", "derived-stale", "renderer", "runtime-panel", "pick-panel", "object-panels"]
  };
}

function locateObject(state, object, documentRef, locateOptions = {}) {
  const located = object?.kind === OBJECT_KIND.MEASUREMENT
    ? locateMeasurementBounds(state, object, locateOptions)
    : object ? state.renderer.locateObject(object, locateOptions) : false;
  if (located) {
    state.selectionStore.setSelection({object});
  }
  refreshRuntimeAndPickPanels(documentRef, state);
  return located;
}

function renameSelectedObjectFromNamebase(state, documentRef, object) {
  const target = namebaseRenameTargetForObject(object);
  if (!target) {
    setFileOperationStatus(documentRef, "当前选中对象不支持按名称库重命名。");
    return;
  }
  const command = createSelectedNamebaseRenameCommand(target);
  const context = {map: state.map};
  if (!command) {
    setFileOperationStatus(documentRef, `当前选中${selectedNamebaseTargetLabel(target)}没有可按名称库更新的名称。`);
    return;
  }
  const execution = executeEditCommand(state, documentRef, command, {
    context,
    noopStatus: () => `当前选中${selectedNamebaseTargetLabel(target)}没有可按名称库更新的名称。`,
    status: executedCommand => {
      const result = executedCommand.getResult?.();
      return `已按当前名称库重命名选中${selectedNamebaseTargetLabel(target)} ${result?.renamed || 0} 个。`;
    }
  });
  if (execution.executed) updateEditingInteractionLock(state, documentRef);
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
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.state,
      prepare: () => state.panels.state.setTargetStateId(selection.object.id),
      update: () => updateStatePanel(state)
    });
  },
  [OBJECT_KIND.CITY]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.city,
      prepare: () => state.panels.city.setSelectedCityId(selection.object.id),
      update: () => updateCityPanel(state)
    });
  },
  [OBJECT_KIND.PROVINCE]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.province,
      prepare: () => state.panels.province.setSelectedProvinceId(selection.object.id),
      update: () => updateProvincePanel(state)
    });
  },
  [OBJECT_KIND.CULTURE]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.culture,
      prepare: () => state.panels.culture.setSelectedCultureId(selection.object.id),
      update: () => updateCulturePanel(state)
    });
  },
  [OBJECT_KIND.RELIGION]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.religion,
      prepare: () => state.panels.religion.setSelectedReligionId(selection.object.id),
      update: () => updateReligionPanel(state)
    });
  },
  [OBJECT_KIND.RIVER]: (state, selection, editingObject, context) => {
    if (context.suppressNextRiverPanelOpen) {
      state.panels.objectDetails.clear();
      context.clearRiverSuppressor();
      return true;
    }
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.river,
      update: () => updateRiverPanel(state)
    });
  },
  [OBJECT_KIND.LAKE]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.lake,
      update: () => updateLakePanel(state)
    });
  },
  [OBJECT_KIND.ZONE]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.zone,
      prepare: () => state.panels.zone.setSelection(selection),
      update: () => updateZonePanel(state)
    });
  },
  [OBJECT_KIND.ROUTE]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.route,
      prepare: () => state.panels.route.setSelectedRouteId(selection.object.id),
      update: () => updateRoutePanel(state)
    });
  },
  [OBJECT_KIND.TRADE_FLOW]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.economy,
      prepare: () => state.panels.economy.setSelectedDealId?.(selection.object.id),
      update: () => updateEconomyPanel(state)
    });
  },
  [OBJECT_KIND.DIPLOMACY_RELATION]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.diplomacy,
      prepare: () => state.panels.diplomacy?.setRelation?.(selection.object.subjectId, selection.object.objectId),
      update: () => updateDiplomacyPanel(state)
    });
  },
  [OBJECT_KIND.MARKER]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.marker,
      prepare: () => state.panels.marker.setSelectedMarkerId(selection.object.id),
      update: () => updateMarkerPanel(state)
    });
  },
  [OBJECT_KIND.LABEL]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.labelNaming,
      prepare: () => state.panels.labelNaming.setSelectedLabelKey(labelKeyForObject(selection.object)),
      update: () => updateLabelNamingPanel(state)
    });
  },
  [OBJECT_KIND.NOTE]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.notes,
      prepare: () => state.panels.notes.setSelectedNoteId(selection.object.noteId),
      update: () => updateNotesPanel(state)
    });
  },
  [OBJECT_KIND.MEASUREMENT]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.measurement,
      prepare: () => state.panels.measurement?.setSelectedMeasurementId?.(selection.object.id),
      update: () => updateMeasurementPanel(state)
    });
  },
  [OBJECT_KIND.MILITARY]: (state, selection, editingObject, context) => {
    return routeSelectionToPanel(state, selection, context, {
      panel: state.panels.military,
      prepare: () => state.panels.military.setSelectedRegimentId(selection.object.id),
      update: () => updateMilitaryPanel(state)
    });
  }
});

function routeSelectionToPanel(state, selection, context, {panel, prepare = null, update = null}) {
  const binding = SELECTION_PANEL_BINDINGS[selection.object.kind];
  const route = decideSelectionPanelRoute({
    binding,
    sourcePanelId: context?.sourcePanelId || null,
    panelOpen: Boolean(panel?.isOpen?.())
  });
  if (route === SELECTION_PANEL_ROUTE.OBJECT_DETAILS) return false;
  state.panels.objectDetails.clear();
  if (route === SELECTION_PANEL_ROUTE.SOURCE_PANEL) return true;
  prepare?.();
  update?.();
  return true;
}

function openSelectionAwarePanelForState(state, {kind = null, beforeOpen = null, open, afterOpen = null} = {}) {
  const object = kind && state.selection?.object?.kind === kind ? state.selection.object : null;
  if (object) beforeOpen?.(object);
  open?.(object);
  if (object) afterOpen?.(object);
  return object;
}

function wrapControlPanelChildOpeners(handlers, panelManager) {
  for (const name of CONTROL_PANEL_CHILD_OPEN_HANDLERS) {
    const open = handlers[name];
    if (typeof open !== "function") continue;
    handlers[name] = event => {
      const sourcePanelId = event?.currentTarget?.closest?.(".floating-panel")?.dataset?.panelId || null;
      const returnParentId = sourcePanelId === "generation-panel" ? sourcePanelId : null;
      return panelManager.withReturnParent(returnParentId, () => open(event));
    };
  }
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

function executeDeleteWithPreflight(state, documentRef, {
  kind,
  ids,
  createCommand,
  label,
  options = {},
  confirmation = "native",
  executeOptions = {}
}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("删除参数必须是对象");
  const preview = inspectDeleteImpact(state.map, kind, ids);
  if (!preview.valid) {
    setFileOperationStatus(documentRef, preview.summary);
    return {executed: false, cancelled: false, inspectOnly: Boolean(options.inspectOnly), preview, result: null};
  }
  if (options.inspectOnly === true) {
    return {executed: false, cancelled: false, inspectOnly: true, preview, result: null};
  }
  if (preview.requiresConfirm && options.confirm !== true) {
    if (confirmation === "explicit") throw createDeleteConfirmationRequiredError(preview);
    const confirmed = requestDeleteConfirmation(preview, message => documentRef.defaultView?.confirm?.(message));
    if (!confirmed) {
      setFileOperationStatus(documentRef, `已取消：${preview.summary}`);
      return {executed: false, cancelled: true, inspectOnly: false, preview, result: null};
    }
  }
  const command = createDeleteBatchCommand({kind, ids, createCommand, label});
  const execution = executeEditCommand(state, documentRef, command, {
    ...executeOptions,
    context: {map: state.map},
    status: executeOptions.status || (executed => {
      const result = executed.getResult?.();
      return `已完成删除：${result?.deleted || 0} 个对象，跳过 ${result?.skipped?.length || 0} 项。`;
    }),
    noopStatus: executeOptions.noopStatus || "没有可删除的对象。",
    throwOnError: false
  });
  return {executed: execution.executed, cancelled: false, inspectOnly: false, preview, result: command.getResult?.() || null, execution};
}

function deleteApiResult(state, deletion) {
  const base = deletion.execution
    ? editApiResult(state, deletion.execution)
    : {
        executed: false,
        noop: false,
        label: "",
        result: null,
        affected: [],
        stale: [],
        effects: {render: "none", selection: "none", runtimeStats: false, pickPanel: false, derived: []},
        error: null,
        history: state.editHistory.getStats()
      };
  const summary = deletion.result;
  const legacyResult = summary?.subresults?.length === 1 ? summary.subresults[0].result : base.result;
  return {
    ...base,
    result: legacyResult,
    preview: deletion.preview,
    deleteSummary: summary,
    inspectOnly: Boolean(deletion.inspectOnly),
    cancelled: Boolean(deletion.cancelled)
  };
}

function executeEditCommand(state, documentRef, command, options = {}) {
  const context = options.context || {map: state.map};
  if (!command) return {executed: false, command: null, result: null, error: null};
  try {
    if (command.isNoop?.(context)) {
      if (options.noopStatus) setFileOperationStatus(documentRef, messageFromOption(options.noopStatus, command));
      return {executed: false, command, result: null, error: null};
    }
    const executedCommand = state.editHistory.execute(command, context);
    const result = readEditCommandResult(executedCommand);
    const refresh = options.refresh || refreshAfterEdit;
    let highlightsChanged = false;
    state.selectionStore.batch(() => {
      options.preparePanelRefresh?.(state, executedCommand, result);
      highlightsChanged = reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false}).changed;
      refresh(state, executedCommand);
    });
    if (options.refreshPanels !== false) {
      refreshPanelsForEdit(state, highlightsChanged ? {derived: ["object-panels"]} : executedCommand);
    }
    if (options.status) setFileOperationStatus(documentRef, messageFromOption(options.status, executedCommand));
    return {executed: true, command: executedCommand, result, error: null};
  } catch (error) {
    if (options.errorStatus) setFileOperationStatus(documentRef, messageFromOption(options.errorStatus, command));
    if (options.throwOnError === false) return {executed: false, command, result: null, error};
    throw error;
  }
}

export function executeHistoryCommand(state, documentRef, action, options = {}) {
  const command = action === "redo"
    ? state.editHistory.redo({map: state.map})
    : state.editHistory.undo({map: state.map});
  if (!command) {
    return {
      executed: false,
      action,
      label: "",
      history: state.editHistory.getStats()
    };
  }
  const refresh = options.refresh || refreshAfterEdit;
  state.selectionStore.batch(() => {
    if (command.domain === "state-topology") synchronizeStateTopologyHistoryUi(state, command, action);
    if (command.domain === "feature-topology") synchronizeFeatureTopologyHistoryUi(state, command, action);
    reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false});
    refresh(state, command);
  });
  if (options.refreshPanels !== false) refreshPanelsForEdit(state, {derived: ["object-panels"]});
  options.afterRefresh?.(state, command);
  if (command.effects?.derived?.includes("labels")) syncLabelStylesUi(state, documentRef);
  (options.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return {
    executed: true,
    action,
    label: command.label || "",
    history: state.editHistory.getStats()
  };
}

function synchronizeFeatureTopologyHistoryUi(state, command, action) {
  const snapshot = FEATURE_TOPOLOGY_UI_HISTORY.get(command);
  if (!snapshot) return;
  const featureId = action === "redo" ? snapshot.redoFeatureId : snapshot.undoFeatureId;
  state.panels?.feature?.setSelectedFeatureId?.(featureId);
}

function resolveObjectViaApi(state, object) {
  const target = normalizeApiObjectIdentifier(object);
  if (!Object.values(OBJECT_KIND).includes(target.kind)) throw new Error(`未知对象类型：${target.kind}`);
  const resolved = resolveObject(state.map, target);
  if (!resolved || resolved === target) throw new Error(`找不到对象：${target.kind} #${target.id ?? target.targetId ?? ""}`);
  return resolved;
}

function selectObjectViaApi(state, object) {
  const resolved = resolveObjectViaApi(state, object);
  state.selectionStore.setSelection({object: resolved});
  return {
    object: resolved,
    selection: state.selectionStore.getSnapshot().selection
  };
}

function clearSelectionViaApi(state) {
  state.selectionStore.clear();
  return state.selectionStore.getSnapshot();
}

function locateObjectViaApi(state, documentRef, object, options = {}) {
  const resolved = resolveObjectViaApi(state, object);
  const locateOptions = normalizeApiLocateOptions(options);
  const located = options.locateObject
    ? options.locateObject(resolved, locateOptions)
    : locateObject(state, resolved, documentRef, locateOptions);
  const rendererStats = state.renderer?.getStats?.() || {};
  return {
    located,
    object: resolved,
    selection: state.selectionStore.getSnapshot().selection,
    camera: {...(rendererStats.camera || {})},
    locateStatus: rendererStats.locateStatus || ""
  };
}

function flashObjectViaApi(state, documentRef, object) {
  const resolved = resolveObjectViaApi(state, object);
  state.selectionStore.setSelection({object: resolved});
  if (typeof state.renderer?.startLocateFlash !== "function") throw new Error("当前 renderer 不支持临时高亮");
  state.renderer.startLocateFlash(resolved);
  if (resolved.kind === OBJECT_KIND.MEASUREMENT) updateMeasurementOverlay(state, documentRef);
  const rendererStats = state.renderer.getStats?.() || {};
  return {
    flashed: true,
    object: resolved,
    selection: state.selectionStore.getSnapshot().selection,
    highlightMode: rendererStats.selectionHighlightMode || ""
  };
}

function highlightObjectsViaApi(state, documentRef, objects, options = {}) {
  const targets = Array.isArray(objects) ? objects : [objects];
  if (!targets.length || targets.some(target => target === null || target === undefined)) throw new Error("缺少高亮对象");
  if (targets.length > MAX_PERSISTENT_OBJECT_HIGHLIGHTS) throw new Error(`最多同时高亮 ${MAX_PERSISTENT_OBJECT_HIGHLIGHTS} 个对象`);
  if (typeof state.renderer?.setObjectHighlights !== "function") throw new Error("当前 renderer 不支持多对象高亮");
  const resolved = targets.map(target => resolveObjectViaApi(state, target));
  const unsupported = resolved.filter(object => !isPersistentHighlightObjectKind(object.kind));
  if (unsupported.length) {
    const kinds = [...new Set(unsupported.map(object => object.kind))].join("、");
    throw new Error(`当前 renderer 不支持高亮对象类型：${kinds}`);
  }
  setPersistentObjectHighlights(state, documentRef, resolved, {...options, strictLimit: true});
  const rendererStats = state.renderer.getStats?.() || {};
  return {
    highlighted: rendererStats.objectHighlightCount || 0,
    requested: targets.length,
    appended: options.append === true,
    mode: "persistent-object-highlight",
    objects: (rendererStats.objectHighlights || []).map(item => ({...item})),
    highlightMode: rendererStats.selectionHighlightMode || ""
  };
}

function clearObjectHighlightsViaApi(state, documentRef) {
  if (typeof state.renderer?.clearObjectHighlights !== "function") throw new Error("当前 renderer 不支持清除对象高亮");
  const previous = state.renderer.getStats?.()?.objectHighlightCount || 0;
  clearPersistentObjectHighlights(state, documentRef);
  return {
    cleared: previous,
    highlighted: state.renderer.getStats?.()?.objectHighlightCount || 0,
    mode: "none"
  };
}

function setPersistentObjectHighlights(state, documentRef, objects, options = {}) {
  if (typeof state.renderer?.setObjectHighlights !== "function") return 0;
  const current = options.append === true ? state.renderer.objectHighlights || [] : [];
  const normalized = normalizePersistentHighlights(state.map, [...current, ...(Array.isArray(objects) ? objects : [])]);
  const requested = normalized.highlights;
  if (requested.length > MAX_PERSISTENT_OBJECT_HIGHLIGHTS && options.strictLimit === true) {
    throw new Error(`最多同时高亮 ${MAX_PERSISTENT_OBJECT_HIGHLIGHTS} 个对象`);
  }
  const next = requested.slice(0, MAX_PERSISTENT_OBJECT_HIGHLIGHTS);
  state.renderer.setObjectHighlights(next);
  refreshPersistentHighlightUi(state, documentRef);
  const count = persistentObjectHighlightCount(state);
  const truncated = requested.length > next.length;
  const skipped = normalized.rejected.length;
  const duplicates = normalized.duplicates;
  setFileOperationStatus(documentRef, truncated
    ? `已高亮前 ${count} 个地图对象；单次最多 ${MAX_PERSISTENT_OBJECT_HIGHLIGHTS} 个。`
    : skipped
      ? `已高亮 ${count} 个地图对象；跳过 ${skipped} 个无效或不支持对象。`
      : duplicates
        ? `已高亮 ${count} 个地图对象；已去重 ${duplicates} 个重复对象。`
        : `已高亮 ${count} 个地图对象。`);
  return count;
}

function clearPersistentObjectHighlights(state, documentRef) {
  if (typeof state.renderer?.clearObjectHighlights !== "function") return 0;
  const previous = persistentObjectHighlightCount(state);
  state.renderer.clearObjectHighlights();
  refreshPersistentHighlightUi(state, documentRef);
  setFileOperationStatus(documentRef, previous ? `已清除 ${previous} 个地图对象高亮。` : "当前没有地图对象高亮。");
  return 0;
}

function persistentObjectHighlightCount(state) {
  return Math.max(0, Number(state.renderer?.getStats?.()?.objectHighlightCount) || 0);
}

function reconcilePersistentObjectHighlights(state, documentRef, {refreshUi = true} = {}) {
  const current = Array.isArray(state.renderer?.objectHighlights) ? state.renderer.objectHighlights : [];
  if (!current.length || typeof state.renderer?.setObjectHighlights !== "function") return {count: 0, changed: false};
  const next = normalizePersistentHighlights(state.map, current).highlights;
  const changed = !samePersistentHighlightMembership(current, next);
  state.renderer.setObjectHighlights(next);
  if (refreshUi && changed) refreshPersistentHighlightUi(state, documentRef);
  return {count: next.length, changed};
}

function refreshPersistentHighlightUi(state, documentRef) {
  updateRuntimePanel(documentRef, state);
  updateStatePanel(state);
  updateProvincePanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateRoutePanel(state);
  updateRiverPanel(state);
  updateLakePanel(state);
  updateCityPanel(state);
  updateMarkerPanel(state);
  updateMilitaryPanel(state);
  updateZonePanel(state);
  updateLabelNamingPanel(state);
  updateNotesPanel(state);
  updateGovernmentPanel(state);
  updateMeasurementPanel(state);
  updateMeasurementOverlay(state, documentRef);
  updateDiplomacyPanel(state);
  updateEconomyPanel(state);
}

function startEditingObjectViaApi(state, object, options = {}) {
  const resolved = resolveObjectViaApi(state, object);
  const started = state.startObjectEditing?.(resolved, {select: options.select !== false}) === true;
  return {
    started,
    object: resolved,
    ...state.selectionStore.getSnapshot()
  };
}

function stopEditingObjectViaApi(state, options = {}) {
  const before = state.selectionStore.getSnapshot().editingObject;
  const stopped = state.stopObjectEditing?.({ifKind: options.ifKind}) === true;
  const snapshot = state.selectionStore.getSnapshot();
  return {
    stopped,
    previousEditingObject: before,
    ...snapshot
  };
}

function toggleEditingObjectViaApi(state, object, options = {}) {
  const resolved = resolveObjectViaApi(state, object);
  state.toggleObjectEditing?.(resolved, {select: options.select !== false});
  const snapshot = state.selectionStore.getSnapshot();
  return {
    editing: Boolean(snapshot.editingObject),
    object: resolved,
    ...snapshot
  };
}

function pickClientPointViaApi(state, documentRef, clientX, clientY) {
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("clientX / clientY 必须是有限数");
  const pick = state.renderer?.pickClientPoint?.(x, y) || null;
  state.pick = pick;
  updatePickPanel(documentRef, state);
  return pick;
}

function normalizeApiLocateOptions(options = {}) {
  const normalized = {};
  for (const key of ["padding", "minScale", "maxScale"]) {
    if (options[key] === undefined || options[key] === null) continue;
    const value = Number(options[key]);
    if (!Number.isFinite(value)) throw new Error(`定位选项 ${key} 必须是有限数`);
    normalized[key] = value;
  }
  if (normalized.padding !== undefined && (normalized.padding < 0 || normalized.padding >= 0.95)) {
    throw new Error("定位选项 padding 必须大于等于 0 且小于 0.95");
  }
  for (const key of ["minScale", "maxScale"]) {
    if (normalized[key] !== undefined && normalized[key] <= 0) throw new Error(`定位选项 ${key} 必须大于 0`);
  }
  if (
    normalized.minScale !== undefined &&
    normalized.maxScale !== undefined &&
    normalized.minScale > normalized.maxScale
  ) {
    throw new Error("定位选项 minScale 不能大于 maxScale");
  }
  return normalized;
}

function normalizeApiObjectIdentifier(object) {
  if (!object || typeof object !== "object") throw new Error("对象标识必须是对象");
  const kind = typeof object.kind === "string" ? object.kind.trim() : "";
  if (!kind) throw new Error("缺少对象 kind");
  const id = object.id ?? object.i ?? object.targetId;
  if (id === undefined || id === null || id === "") throw new Error("缺少对象 id");
  return {...object, kind, id: Number.isFinite(Number(id)) ? Number(id) : id};
}

function deleteNoteViaApi(state, documentRef, noteId, options = {}) {
  const id = String(noteId || "").trim();
  const name = String(options.name || id);
  const command = createDeleteNoteCommand(id, {name});
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "备注不存在或已被删除。",
    status: `已删除备注 ${name || id}。`,
    throwOnError: false
  });
  updateEditingInteractionLock(state, documentRef);
  return {
    executed: result.executed,
    label: result.command?.label || "",
    result: result.result,
    error: result.error ? {
      name: result.error.name || "Error",
      message: result.error.message || String(result.error)
    } : null,
    history: state.editHistory.getStats()
  };
}

function importNotesViaApi(state, documentRef, document, options = {}) {
  const command = createImportNotesCommand(document, {
    mode: options.mode,
    label: options.label || "导入备注摘要"
  });
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "导入备注与当前地图一致。",
    status: executed => `已${options.mode === "replace" ? "替换" : "追加"}导入 ${executed.getResult?.()?.valid || 0} 条备注。`,
    throwOnError: false
  });
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteNotesBatchViaApi(state, documentRef, noteIds, options = {}) {
  if (!Array.isArray(noteIds)) throw new Error("批量删除备注必须提供 noteIds 数组");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("批量删除备注参数必须是对象");
  const preview = {
    kind: OBJECT_KIND.NOTE,
    kindLabel: "备注",
    valid: noteIds.length > 0,
    requestedCount: noteIds.length,
    objectCount: noteIds.length,
    validIds: [...noteIds],
    deleteIds: [...noteIds],
    cascadeIds: [],
    cascadeCount: 0,
    dependencies: {},
    skipped: [],
    requiresConfirm: noteIds.length > 0,
    impactLevel: "high",
    summary: `批量删除 ${noteIds.length} 条备注。`,
    confirmationMessage: `确定批量删除 ${noteIds.length} 条备注？确认后可通过一次撤销恢复。`
  };
  if (options.inspectOnly === true) return namebaseInspectionResult(state, preview);
  if (preview.requiresConfirm && options.confirm !== true) throw createDeleteConfirmationRequiredError(preview);
  const command = createDeleteNotesBatchCommand(noteIds, {label: options.label || "批量删除备注"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "没有可删除的备注。",
    status: executed => `已批量删除 ${executed.getDeletedCount?.() || 0} 条备注。`,
    throwOnError: false
  });
  updateEditingInteractionLock(state, documentRef);
  return {...editApiResult(state, result), preview};
}

function saveMeasurementViaApi(state, documentRef, points, options = {}) {
  const payload = normalizeApiMeasurementOptions(options, {defaultRouteFit: MEASUREMENT_ROUTE_FIT_NONE});
  const command = createSaveMeasurementCommand(points, {
    name: payload.name,
    routeFit: payload.routeFit,
    drawMode: payload.drawMode,
    closed: payload.closed,
    smooth: payload.smooth,
    sampling: payload.sampling,
    label: payload.label || "保存测量对象"
  });
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "至少需要 2 个有效测量点才能保存。",
    status: command => {
      const measurement = command.getMeasurement?.();
      return `已保存测量对象 ${measurement?.name || measurement?.id || ""}。`;
    },
    preparePanelRefresh: (targetState, executed) => {
      const created = executed.getMeasurement?.();
      if (created?.id) targetState.panels.measurement?.setSelectedMeasurementId?.(created.id);
    },
    throwOnError: false
  });
  updateMeasurementOverlay(state, documentRef);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameMeasurementViaApi(state, documentRef, measurementId, name) {
  const id = String(measurementId || "").trim();
  const nextName = String(name || "").trim();
  const command = createRenameMeasurementCommand(id, nextName, {label: `重命名测量对象 ${id}`});
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "测量对象不存在或名称未变化。",
    status: `已重命名测量对象 ${nextName || id}。`,
    throwOnError: false
  });
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function updateMeasurementPointsViaApi(state, documentRef, measurementId, points, options = {}) {
  const id = String(measurementId || "").trim();
  const payload = normalizeApiMeasurementOptions(options, {defaultRouteFit: null});
  const command = createUpdateMeasurementPointsCommand(id, points, {
    routeFit: payload.routeFit,
    drawMode: payload.drawMode,
    closed: payload.closed,
    smooth: payload.smooth,
    sampling: payload.sampling,
    label: payload.label || `更新测量对象 ${id}`
  });
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "测量对象不存在、点列无效或形状未变化。",
    status: `已更新测量对象 ${id}。`,
    preparePanelRefresh: targetState => targetState.panels.measurement?.setSelectedMeasurementId?.(id),
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteMeasurementViaApi(state, documentRef, measurementId) {
  const id = String(measurementId || "").trim();
  const command = createDeleteMeasurementCommand(id, {label: `删除测量对象 ${id}`});
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "测量对象不存在或已被删除。",
    status: `已删除测量对象 ${id}。`,
    throwOnError: false
  });
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function importMeasurementsViaApi(state, documentRef, input) {
  const measurements = Array.isArray(input) ? input : input?.measurements;
  if (!Array.isArray(measurements)) throw new Error("测量导入内容必须是数组或包含 measurements 数组的对象");
  const command = createImportMeasurementsCommand(measurements, {label: "API 导入测量对象"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    preparePanelRefresh: (targetState, executed, imported) => {
      targetState.measurement.points = [];
      targetState.measurement.editingMeasurementId = null;
      targetState.measurement.active = false;
      if (imported?.[0]?.id) targetState.panels.measurement?.setSelectedMeasurementId?.(imported[0].id);
    },
    noopStatus: "没有可导入的测量对象。",
    status: executed => `已通过 API 导入 ${executed.getResult?.().length || 0} 个测量对象。`,
    throwOnError: false
  });
  updateMeasurementOverlay(state, documentRef);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function normalizeApiMeasurementOptions(options = {}, {defaultRouteFit = MEASUREMENT_ROUTE_FIT_NONE} = {}) {
  const preserve = defaultRouteFit === null;
  if (options === null || options === undefined) return {name: "", routeFit: defaultRouteFit, drawMode: preserve ? null : undefined, closed: preserve ? null : undefined, smooth: preserve ? null : undefined, sampling: preserve ? null : undefined, label: ""};
  if (typeof options !== "object") throw new Error("测量对象选项必须是对象");
  const drawMode = options.drawMode === undefined
    ? preserve ? null : undefined
    : normalizeApiMeasurementDrawMode(options.drawMode);
  return {
    name: typeof options.name === "string" ? options.name.trim() : "",
    routeFit: options.routeFit === undefined ? defaultRouteFit : normalizeMeasurementRouteFit(options.routeFit),
    drawMode,
    closed: options.closed === undefined ? preserve ? null : undefined : Boolean(options.closed),
    smooth: options.smooth === undefined ? preserve ? null : undefined : Boolean(options.smooth),
    sampling: options.sampling === undefined ? preserve ? null : undefined : normalizeApiMeasurementSampling(options.sampling),
    label: typeof options.label === "string" ? options.label.trim() : ""
  };
}

function normalizeApiMeasurementDrawMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if ([MEASUREMENT_DRAW_RULER, MEASUREMENT_DRAW_CURVE, MEASUREMENT_DRAW_ROUTE, MEASUREMENT_DRAW_AREA].includes(mode)) return mode;
  throw new Error("测量 drawMode 必须是 ruler、curve、route 或 area");
}

function normalizeApiMeasurementSampling(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("测量 sampling 必须是对象");
  return {...value};
}

function setObjectNoteViaApi(state, documentRef, object, body, options = {}) {
  const target = normalizeApiObjectIdentifier(object);
  const command = createSetObjectNoteCommand(target, body, {name: options.name || ""});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "对象不存在或备注未变化。",
    status: `已更新 ${target.kind}#${target.id} 备注。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function createStandaloneNoteViaApi(state, documentRef, options = {}) {
  if (!options || typeof options !== "object") throw new Error("独立备注创建参数必须是对象");
  const command = createStandaloneNoteCommand(options);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: "已新增独立备注。",
    preparePanelRefresh: (targetState, executed, created) => {
      if (!created?.objectId) return;
      targetState.panels.notes?.setSelectedNoteId(created.id);
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.NOTE, id: created.objectId}});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function createRouteViaApi(state, documentRef, options = {}) {
  if (!options || typeof options !== "object") throw new Error("路线创建参数必须是对象");
  const command = createAddRouteCommand(options);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => `已绘制路线 #${executed.getResult?.().routeId ?? ""}。`,
    preparePanelRefresh: (targetState, executed, created) => {
      if (!Number.isInteger(created?.routeId)) return;
      targetState.panels.route?.setSelectedRouteId(created.routeId);
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.ROUTE, id: created.routeId}});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function inspectRouteEditViaApi(state, routeId, patch = {}) {
  assertMapAvailable(state);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("路线编辑预检参数必须是对象");
  return inspectRouteEdit(state.map, normalizeApiInteger(routeId, "路线 ID"), patch);
}

function updateRouteViaApi(state, documentRef, routeId, patch = {}) {
  assertMapAvailable(state);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("路线编辑参数必须是对象");
  const id = normalizeApiInteger(routeId, "路线 ID");
  const command = createEditRouteCommand(id, patch, {label: "API 编辑路线"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: `已通过 API 更新路线 #${id}。`,
    noopStatus: "路线编辑没有变化。",
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteRouteViaApi(state, documentRef, routeId, options = {}) {
  const id = normalizeApiInteger(routeId, "路线 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.ROUTE,
    ids: [id],
    createCommand: targetId => createDeleteRouteCommand(targetId, {label: `删除路线 #${targetId}`}),
    label: "API 删除路线",
    options,
    confirmation: "explicit",
    executeOptions: {noopStatus: "路线不存在或已被删除。"}
  });
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function createRiverViaApi(state, documentRef, options = {}) {
  if (!options || typeof options !== "object") throw new Error("河流创建参数必须是对象");
  const command = createAddRiverCommand(options);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => `已新增河流 #${executed.getResult?.().riverId ?? ""}。`,
    preparePanelRefresh: (targetState, executed, created) => {
      if (!Number.isInteger(created?.riverId)) return;
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.RIVER, id: created.riverId}});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setRouteNoteViaApi(state, documentRef, routeId, body, options = {}) {
  const id = normalizeApiInteger(routeId, "路线 ID");
  const route = state.map?.settlements?.routes?.find(item => item.id === id);
  const command = createSetRouteNoteCommand(id, body, {
    name: options.name || routeDisplayName(state.map, route, id)
  });
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "路线不存在或备注未变化。",
    status: `已更新路线 #${id} 备注。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameRiverViaApi(state, documentRef, riverId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.RIVER, riverId, name, {
    idLabel: "河流 ID",
    noopStatus: "河流不存在或名称未变化。",
    status: id => `已重命名河流 #${id}。`
  });
}

function createLakeViaApi(state, documentRef, options = {}) {
  if (!options || typeof options !== "object") throw new Error("湖泊创建参数必须是对象");
  const command = createExcavateLakeCommand(options);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => `已开挖湖泊 #${executed.getResult?.().lakeId ?? ""}。`,
    preparePanelRefresh: (targetState, executed, created) => {
      if (!Number.isInteger(created?.lakeId)) return;
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.LAKE, id: created.lakeId}});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function inspectLakeOutletViaApi(state, lakeId, outletRiverId) {
  assertMapAvailable(state);
  return inspectLakeOutletChange(state.map, normalizeApiInteger(lakeId, "湖泊 ID"), normalizeApiInteger(outletRiverId ?? 0, "河流 ID"));
}

function setLakeOutletViaApi(state, documentRef, lakeId, outletRiverId) {
  assertMapAvailable(state);
  const id = normalizeApiInteger(lakeId, "湖泊 ID");
  const outlet = normalizeApiInteger(outletRiverId ?? 0, "河流 ID");
  const command = createSetLakeOutletCommand(id, outlet, {label: "API 编辑湖泊出口"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: outlet ? `已将湖泊 #${id} 出口设为河流 #${outlet}。` : `已清除湖泊 #${id} 出口。`,
    noopStatus: "湖泊出口没有变化。",
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function inspectFeaturePatchViaApi(state, options = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("局部水陆修正预检参数必须是对象");
  return inspectFeaturePatch(state.map, options);
}

function applyFeaturePatchViaApi(state, documentRef, options = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("局部水陆修正参数必须是对象");
  const command = createApplyFeaturePatchCommand(options, {label: "API 局部水陆修正"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => {
      const applied = executed.getResult?.();
      return `已修正湖泊 #${applied?.lakeId ?? options.lakeId} 周边 ${applied?.packCells || 0} 个 pack cells。`;
    },
    noopStatus: "局部水陆修正没有变化。",
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

export function inspectFeatureTopologyViaApi(state, options = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Feature 拓扑预检参数必须是对象");
  return inspectFeatureTopology(state.map, options);
}

export function applyFeatureTopologyViaApi(state, documentRef, options = {}, runtimeUi = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Feature 拓扑编辑参数必须是对象");
  if (options.confirm !== true) throw new Error("Feature 拓扑编辑会改写水陆连通和岸线，需要显式传入 {confirm: true}");
  if (state.canvasToolModes?.getActive?.()?.id === CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT) {
    cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, "topology-apply");
  } else {
    clearFeatureTopologyPreview(state);
  }
  const commandOptions = {...options};
  delete commandOptions.confirm;
  const undoFeatureId = state.panels?.feature?.getSelectedFeatureId?.() ?? null;
  const command = createApplyFeatureTopologyCommand(commandOptions, {label: "编辑海岸"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    preparePanelRefresh: (targetState, executed, topologyResult) => {
      const featureId = Number(topologyResult?.selectionTarget?.id);
      if (Number.isInteger(featureId) && featureId > 0) targetState.panels?.feature?.setSelectedFeatureId?.(featureId);
    },
    status: "已完成海岸修改，可通过撤销恢复。",
    noopStatus: "海岸没有变化。",
    throwOnError: false
  });
  if (result.executed) {
    FEATURE_TOPOLOGY_UI_HISTORY.set(result.command, {
      undoFeatureId,
      redoFeatureId: state.panels?.feature?.getSelectedFeatureId?.() ?? null
    });
    state.panels?.feature?.clearTopologyDraft?.();
  }
  (runtimeUi.updateRuntimePanel || updateRuntimePanel)(documentRef, state);
  (runtimeUi.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return editApiResult(state, result);
}

function deleteRiverViaApi(state, documentRef, riverId, options = {}) {
  const id = normalizeApiInteger(riverId, "河流 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.RIVER,
    ids: [id],
    createCommand: targetId => createDeleteRiverCommand(targetId),
    label: "API 删除河流",
    options,
    confirmation: "explicit",
    executeOptions: {noopStatus: "河流不存在，未执行删除。"}
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function setRiverWidthFactorViaApi(state, documentRef, riverId, widthFactor) {
  const id = normalizeApiInteger(riverId, "河流 ID");
  const numeric = Number(widthFactor);
  if (!Number.isFinite(numeric)) throw new Error("河流宽度因子必须是有效数字");
  const command = createSetRiverWidthFactorCommand(id, numeric);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "河流不存在或宽度因子未变化。",
    status: `已更新河流 #${id} 宽度因子。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setRiverNoteViaApi(state, documentRef, riverId, body, options = {}) {
  const id = normalizeApiInteger(riverId, "河流 ID");
  const river = state.map?.rivers?.rivers?.find(item => item.id === id);
  const command = createSetRiverNoteCommand(id, body, {name: options.name || river?.name || `河流 #${id}`});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "河流不存在或备注未变化。",
    status: `已更新河流 #${id} 备注。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameLakeViaApi(state, documentRef, lakeId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.LAKE, lakeId, name, {
    idLabel: "湖泊 ID",
    noopStatus: "湖泊不存在或名称未变化。",
    status: id => `已重命名湖泊 #${id}。`
  });
}

function deleteLakeViaApi(state, documentRef, lakeId, options = {}) {
  const id = normalizeApiInteger(lakeId, "湖泊 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.LAKE,
    ids: [id],
    createCommand: targetId => createDeleteLakeCommand(targetId),
    label: "API 填平并删除湖泊",
    options,
    confirmation: "explicit",
    executeOptions: {noopStatus: "湖泊不存在，未执行删除。"}
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function addCityViaApi(state, documentRef, gridCell) {
  const targetGridCell = normalizeApiInteger(gridCell, "grid cell");
  const command = createAddCityAtCellCommand(targetGridCell);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "目标 grid cell 无效、不是陆地或已存在城市。",
    status: command => {
      const created = command.getResult?.();
      return Number.isInteger(created?.cityId)
        ? `已新增城市 #${created.cityId}。`
        : "已新增城市。";
    },
    preparePanelRefresh: (targetState, executed, created) => {
      if (!Number.isInteger(created?.cityId)) return;
      targetState.cityEdit.lastCreatedCityId = created.cityId;
      targetState.panels.city?.setSelectedCityId(created.cityId);
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.CITY, id: created.cityId}});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteCityViaApi(state, documentRef, cityId, options = {}) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.CITY,
    ids: [id],
    createCommand: targetId => createDeleteCityCommand(targetId),
    label: "API 删除城市",
    options,
    confirmation: "explicit",
    executeOptions: {
      noopStatus: "城市不存在或已被删除。",
      preparePanelRefresh: targetState => {
        targetState.selectionStore.clear();
        targetState.panels.city?.setSelectedCityId(null);
      }
    }
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function inspectCityMoveViaApi(state, cityId, target) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  return inspectCityMove(state.map, id, target);
}

function moveCityViaApi(state, documentRef, cityId, target) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  const command = createMoveCityCommand(id, target);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: `城市 #${id} 已位于目标 cell。`,
    status: `已移动城市 #${id}。`,
    preparePanelRefresh: targetState => {
      targetState.panels.city?.setSelectedCityId(id);
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.CITY, id}});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function addProvinceViaApi(state, documentRef, gridCell) {
  const targetGridCell = normalizeApiInteger(gridCell, "grid cell");
  const command = createAddProvinceAtCellCommand(targetGridCell);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "目标 grid cell 无效、不是陆地或不在已有国家内。",
    status: command => {
      const created = command.getResult?.();
      return Number.isInteger(created?.provinceId)
        ? `已新增省份 #${created.provinceId}。`
        : "已新增省份。";
    },
    refresh: refreshAfterProvinceEdit,
    preparePanelRefresh: (targetState, executed, created) => {
      targetState.provinceEdit.addMode = false;
      targetState.provinceEdit.lastAffected = created?.cells || 0;
      targetState.provinceEdit.sourceProvinceId = created?.provinceId || null;
      if (!Number.isInteger(created?.provinceId)) return;
      targetState.panels.province?.setSelectedProvinceId(created.provinceId);
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.PROVINCE, id: created.provinceId}});
    },
    throwOnError: false
  });
  state.panels.province?.updateAddMode?.(false);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteProvinceViaApi(state, documentRef, provinceId, options = {}) {
  const id = normalizeApiInteger(provinceId, "省份 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.PROVINCE,
    ids: [id],
    createCommand: targetId => createDeleteProvinceCommand(targetId),
    label: "API 删除省份",
    options,
    confirmation: "explicit",
    executeOptions: {
      noopStatus: "省份不存在、为中立省份或已被删除。",
      refresh: refreshAfterProvinceEdit,
      preparePanelRefresh: targetState => {
        targetState.provinceEdit.deleteMode = false;
        targetState.provinceEdit.lastAffected = 0;
        targetState.selectionStore.clear();
        targetState.panels.province?.setSelectedProvinceId(0);
      }
    }
  });
  if (deletion.executed) state.panels.province?.updateDeleteMode?.(false);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function addStateViaApi(state, documentRef, gridCell) {
  const targetGridCell = normalizeApiInteger(gridCell, "grid cell");
  const command = createAddStateAtCellCommand(targetGridCell);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: current => current.getInspection?.()?.summary || "目标 grid cell 无效或不能创建国家。",
    status: command => {
      const created = command.getResult?.();
      return Number.isInteger(created?.stateId)
        ? `已新增国家 #${created.stateId}。`
        : "已新增国家。";
    },
    refresh: refreshAfterStateEdit,
    preparePanelRefresh: (targetState, executed, created) => {
      targetState.stateEdit.addMode = false;
      targetState.stateEdit.lastAffected = created?.cells || 0;
      targetState.stateEdit.sourceStateId = created?.stateId || null;
      if (!Number.isInteger(created?.stateId)) return;
      const object = resolveObject(targetState.map, {kind: OBJECT_KIND.STATE, id: created.stateId}) || {kind: OBJECT_KIND.STATE, id: created.stateId};
      targetState.panels.state?.setTargetStateId(created.stateId);
      targetState.selectionStore.setSelection({object});
    },
    throwOnError: false
  });
  state.panels.state?.updateAddMode?.(false);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteStateViaApi(state, documentRef, stateId, options = {}) {
  const id = normalizeApiInteger(stateId, "国家 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.STATE,
    ids: [id],
    createCommand: targetId => createDeleteStateCommand(targetId),
    label: "API 删除国家",
    options,
    confirmation: "explicit",
    executeOptions: {
      noopStatus: "国家不存在、为中立国家或已被删除。",
      refresh: refreshAfterStateEdit,
      preparePanelRefresh: targetState => {
        targetState.stateEdit.deleteMode = false;
        targetState.stateEdit.lastAffected = 0;
        targetState.selectionStore.clear();
        targetState.panels.state?.setTargetStateId(0);
      }
    }
  });
  if (deletion.executed) state.panels.state?.updateDeleteMode?.(false);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function inspectStateMergeViaApi(state, options = {}) {
  assertMapAvailable(state);
  return decorateStateTopologyInspection(state.map, inspectStateMerge(state.map, options));
}

function inspectStateSplitViaApi(state, options = {}) {
  assertMapAvailable(state);
  return decorateStateTopologyInspection(state.map, inspectStateSplit(state.map, options));
}

function mergeStatesViaApi(state, documentRef, options = {}) {
  return executeStateTopologyViaApi(state, documentRef, "merge", options);
}

function splitStateViaApi(state, documentRef, options = {}) {
  return executeStateTopologyViaApi(state, documentRef, "split", options);
}

export function executeStateTopologyViaApi(state, documentRef, operation, options, runtimeUi = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("国家拓扑参数必须是对象");
  if (options.confirm !== true) throw new Error(`${operation === "merge" ? "合并" : "拆分"}国家需要显式传入 {confirm: true}`);
  const {confirm, ...commandOptions} = options;
  const command = operation === "merge" ? createMergeStatesCommand(commandOptions) : createSplitStateCommand(commandOptions);
  const beforeUi = captureStateTopologyUiHistory(state);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit,
    preparePanelRefresh: (targetState, executed, topologyResult) => applyStateTopologyUiResult(targetState, documentRef, topologyResult),
    noopStatus: operation === "merge" ? "国家合并预检未通过。" : "国家拆分预检未通过。",
    status: executed => executed.getResult?.()?.selectionTarget?.id
      ? `${operation === "merge" ? "国家合并" : "国家拆分"}完成，当前国家 #${executed.getResult().selectionTarget.id}。`
      : `${operation === "merge" ? "国家合并" : "国家拆分"}完成。`,
    errorStatus: operation === "merge" ? "国家合并失败，地图与界面已保持执行前状态。" : "国家拆分失败，地图与界面已保持执行前状态。",
    throwOnError: false
  });
  if (result.executed) {
    STATE_TOPOLOGY_UI_HISTORY.set(result.command, {
      undo: beforeUi,
      redo: captureStateTopologyUiHistory(state)
    });
  }
  (runtimeUi.updateRuntimePanel || updateRuntimePanel)(documentRef, state);
  (runtimeUi.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return editApiResult(state, result);
}

function applyStateTopologyUiResult(state, documentRef, result) {
  if (!result?.selectionTarget) return;
  const redirects = new Map((result.redirects || []).map(item => [`${item.kind}:${item.from}`, item]));
  const redirectObject = object => {
    const redirect = object ? redirects.get(`${object.kind}:${object.id}`) : null;
    return redirect ? {...object, id: redirect.to} : object;
  };
  if (Array.isArray(state.renderer?.objectHighlights) && redirects.size && typeof state.renderer?.setObjectHighlights === "function") {
    state.renderer.setObjectHighlights(state.renderer.objectHighlights.map(redirectObject));
  }
  if (state.editingObject) {
    const redirectedEditing = redirectObject(state.editingObject);
    if (redirectedEditing !== state.editingObject) state.selectionStore.startEditing(redirectedEditing, {select: false});
  }
  const target = resolveObject(state.map, result.selectionTarget) || result.selectionTarget;
  state.panels.state?.setTargetStateId(result.selectionTarget.id);
  state.selectionStore.setSelection({object: target});
  state.stateEdit.sourceStateId = result.selectionTarget.id;
  const topologyRefresh = result.topologyRefresh || {};
  state.stateEdit.lastAffected = (topologyRefresh.gridCells?.length || 0) + (topologyRefresh.packCells?.length || 0);
  reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false});
}

function synchronizeStateTopologyHistoryUi(state, command, action) {
  if (command?.domain !== "state-topology") return;
  const stored = STATE_TOPOLOGY_UI_HISTORY.get(command)?.[action === "redo" ? "redo" : "undo"];
  if (stored) {
    restoreStateTopologyUiHistory(state, stored);
    return;
  }
  const inspection = command.getInspection?.();
  const result = command.getResult?.();
  const stateId = action === "redo"
    ? result?.selectionTarget?.id
    : inspection?.operation === "split" ? inspection.sourceStateId : inspection?.survivorStateId;
  if (!Number.isInteger(stateId) || !state.map?.politics?.states?.[stateId] || state.map.politics.states[stateId].removed) return;
  state.panels.state?.setTargetStateId(stateId);
  state.selectionStore.setSelection({object: resolveObject(state.map, {kind: OBJECT_KIND.STATE, id: stateId}) || {kind: OBJECT_KIND.STATE, id: stateId}});
  state.stateEdit.sourceStateId = stateId;
  if (state.editingObject && !resolveObject(state.map, state.editingObject)) {
    state.selectionStore.startEditing({kind: OBJECT_KIND.STATE, id: stateId}, {select: false});
  }
}

function captureStateTopologyUiHistory(state) {
  const selection = state.selectionStore.getSnapshot();
  return {
    selection: cloneStateTopologySelection(selection.selection),
    editingObject: cloneStateTopologyObject(selection.editingObject),
    objectHighlights: Array.isArray(state.renderer?.objectHighlights)
      ? state.renderer.objectHighlights.map(cloneStateTopologyObject).filter(Boolean)
      : [],
    panelStateId: state.panels.state?.getBrush?.().targetStateId ?? null,
    sourceStateId: state.stateEdit.sourceStateId ?? null
  };
}

function restoreStateTopologyUiHistory(state, snapshot) {
  if (snapshot.selection) state.selectionStore.setSelection(cloneStateTopologySelection(snapshot.selection));
  else state.selectionStore.clear();
  if (snapshot.editingObject) state.selectionStore.startEditing(cloneStateTopologyObject(snapshot.editingObject), {select: false});
  else state.selectionStore.stopEditing();
  if (typeof state.renderer?.setObjectHighlights === "function") {
    state.renderer.setObjectHighlights((snapshot.objectHighlights || []).map(cloneStateTopologyObject).filter(Boolean));
  }
  if (Number.isInteger(snapshot.panelStateId)) state.panels.state?.setTargetStateId(snapshot.panelStateId);
  state.stateEdit.sourceStateId = snapshot.sourceStateId ?? null;
}

function cloneStateTopologySelection(selection) {
  return selection?.object ? {...selection, object: cloneStateTopologyObject(selection.object)} : null;
}

function cloneStateTopologyObject(object) {
  return object?.kind ? {...object} : null;
}

function decorateStateTopologyInspection(map, inspection) {
  if (!inspection?.valid) {
    return {
      ...inspection,
      rejection: {code: inspection?.code || "invalid", reason: inspection?.summary || "国家拓扑预检未通过"},
      preview: null
    };
  }
  const stateIds = inspection.operation === "merge"
    ? [inspection.survivorStateId, inspection.victimStateId]
    : [inspection.sourceStateId];
  const stateIdSet = new Set(stateIds);
  const affectedProvinceIds = new Set(inspection.affectedOldProvinceIds || []);
  const military = stateIds.reduce((sum, id) => sum + (map.politics?.states?.[id]?.military?.length || 0), 0);
  const wars = stateIds.reduce((sum, id) => sum + (map.politics?.states?.[id]?.campaigns || []).filter(item => item && !item.ended && !item.end).length, 0);
  const markets = (map.pack?.markets || map.economy?.markets || []).filter(item => item && stateIdSet.has(Number(item.state))).length;
  const routes = (map.settlements?.routes || []).filter(route => {
    if (!route) return false;
    if (stateIdSet.has(Number(route.state))) return true;
    const fromState = map.settlements?.cities?.[route.from]?.state;
    const toState = map.settlements?.cities?.[route.to]?.state;
    return stateIdSet.has(Number(fromState)) || stateIdSet.has(Number(toState));
  }).length;
  const notes = (map.notes?.notes || []).filter(note => note && (
    (note.kind === "state" && stateIdSet.has(Number(note.objectId ?? note.targetId)))
    || (note.kind === "province" && affectedProvinceIds.has(Number(note.objectId ?? note.targetId)))
  )).length;
  const capital = inspection.operation === "merge"
    ? stateTopologyCityName(map, inspection.capitalCityId)
    : `${stateTopologyCityName(map, inspection.sourceCapitalCityId)} / ${stateTopologyCityName(map, inspection.newCapitalCityId)}`;
  const preview = {
    capital,
    oldProvinceCount: inspection.affectedOldProvinceIds?.length || 0,
    newProvinceCount: inspection.newProvinceIds?.length || 0,
    military,
    wars,
    markets,
    routes,
    notes,
    staleSystems: ["economy", "diplomacy", "military", "zones", "state-markers"]
  };
  preview.rows = [
    {label: "首都", value: preview.capital},
    {label: "旧省 / 新省", value: `${preview.oldProvinceCount} / ${preview.newProvinceCount}`},
    {label: "军团 / 活动战争", value: `${preview.military} / ${preview.wars}`},
    {label: "市场 / 路线 / 备注", value: `${preview.markets} / ${preview.routes} / ${preview.notes}`},
    {label: "标记待派生", value: preview.staleSystems.join("、")}
  ];
  return {...inspection, preview};
}

function stateTopologyCityName(map, cityId) {
  const city = (map.settlements?.cities || []).find(item => item?.id === cityId);
  return city?.name || (Number.isInteger(cityId) ? `城市 #${cityId}` : "无");
}

function renameCityViaApi(state, documentRef, cityId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.CITY, cityId, name, {
    idLabel: "城市 ID",
    noopStatus: "城市不存在或名称未变化。",
    status: id => `已重命名城市 #${id}。`
  });
}

function setCityPopulationViaApi(state, documentRef, cityId, population) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  const command = createSetCityPopulationCommand(id, population);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "城市不存在或人口未变化。",
    status: `已更新城市 #${id} 人口。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function syncCityOwnerViaApi(state, documentRef, cityId) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  const command = createSyncCityOwnerToCellCommand(id);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "城市不存在或归属已经与所在 cell 一致。",
    status: `已同步城市 #${id} 归属。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setCityVisualViaApi(state, documentRef, cityId, patch) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("城市剪影参数必须是对象");
  const command = createSetCityVisualCommand(id, patch);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "城市不存在、剪影参数无效或未变化。",
    status: `已更新城市 #${id} 剪影。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function resetCityVisualViaApi(state, documentRef, cityId) {
  const id = normalizeApiInteger(cityId, "城市 ID");
  const command = createResetCityVisualCommand(id);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "城市不存在或已经使用自动剪影。",
    status: `已恢复城市 #${id} 自动剪影。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameProvinceViaApi(state, documentRef, provinceId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.PROVINCE, provinceId, name, {
    idLabel: "省份 ID",
    refresh: refreshAfterProvinceEdit,
    noopStatus: "省份不存在或名称未变化。",
    status: id => `已重命名省份 #${id}。`
  });
}

function setProvinceColorViaApi(state, documentRef, provinceId, color) {
  const id = normalizeApiInteger(provinceId, "省份 ID");
  const nextColor = normalizeApiHexColor(color, "省份颜色");
  const province = state.map?.politics?.provinces?.[id] || state.map?.pack?.provinces?.[id];
  const command = createSetProvinceColorCommand(id, nextColor, {beforeColor: province?.color || null});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterProvinceEdit,
    noopStatus: "省份不存在或颜色未变化。",
    status: `已更新省份 #${id} 颜色。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function applyProvinceChangesViaApi(state, documentRef, changes) {
  const normalized = normalizeApiGridChanges(state.map, changes, {field: "province", valueKeys: ["after", "provinceId"], label: "省份", targetKind: "province"});
  const command = createApplyProvinceBrushCommand(normalized, {label: "API 省份归属"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterProvinceEdit,
    noopStatus: "没有需要更新的省份归属。",
    status: `已通过 API 更新 ${normalized.length} 个 grid cells 的省份归属。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameStateViaApi(state, documentRef, stateId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.STATE, stateId, name, {
    idLabel: "国家 ID",
    refresh: refreshAfterStateEdit,
    noopStatus: "国家不存在或名称未变化。",
    status: id => `已重命名国家 #${id}。`
  });
}

function setStateColorViaApi(state, documentRef, stateId, color) {
  const id = normalizeApiInteger(stateId, "国家 ID");
  const nextColor = normalizeApiHexColor(color, "国家颜色");
  const beforeColor = state.map?.politics?.states?.[id]?.color || null;
  const command = createSetStateColorCommand(id, nextColor, {beforeColor});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit,
    noopStatus: "国家不存在或颜色未变化。",
    status: `已更新国家 #${id} 颜色。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setStateGovernmentViaApi(state, documentRef, stateId, governmentKey, options = {}) {
  const id = normalizeApiInteger(stateId, "国家 ID");
  const key = String(governmentKey || "").trim();
  if (!key) throw new Error("政体 key 不能为空");
  const command = createSetStateGovernmentCommand(id, key, {formName: options?.formName});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit,
    noopStatus: "国家不存在、政体无效或政体未变化。",
    status: `已更新国家 #${id} 政体。`,
    throwOnError: false
  });
  if (result.executed) refreshGenerationSummary(state.map);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setStateCapitalViaApi(state, documentRef, stateId, cityId) {
  const id = normalizeApiInteger(stateId, "国家 ID");
  const capitalId = normalizeApiInteger(cityId, "城市 ID");
  const city = state.map?.settlements?.cities?.[capitalId];
  const burgId = Number(city?.burgId ?? city?.burg ?? capitalId);
  const command = createSetStateCapitalCommand(id, burgId);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit,
    noopStatus: "国家或城市不存在、城市不属于该国或已经是首都。",
    status: `已把城市 #${capitalId} 设为国家 #${id} 首都。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setStatesGovernmentBatchViaApi(state, documentRef, stateIds, governmentKey) {
  if (!Array.isArray(stateIds)) throw new Error("国家 ID 必须是数组");
  const ids = [...new Set(stateIds.map(value => normalizeApiInteger(value, "国家 ID")))];
  const key = String(governmentKey || "").trim();
  if (!key) throw new Error("政体 key 不能为空");
  const command = createSetStatesGovernmentBatchCommand(ids, key);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit,
    noopStatus: "没有可调整政体的国家。",
    status: `已批量更新 ${ids.length} 个国家的政体。`,
    throwOnError: false
  });
  if (result.executed) refreshGenerationSummary(state.map);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function applyStateChangesViaApi(state, documentRef, changes) {
  const normalized = normalizeApiGridChanges(state.map, changes, {field: "state", valueKeys: ["after", "stateId"], label: "国家", targetKind: "state"});
  const command = createApplyStateBrushCommand(normalized, {label: "API 国家归属"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit,
    noopStatus: "没有需要更新的国家归属。",
    status: `已通过 API 更新 ${normalized.length} 个 grid cells 的国家归属。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function applyHeightChangesViaApi(state, documentRef, changes, options = {}) {
  const normalized = normalizeApiGridChanges(state.map, changes, {field: "h", valueKeys: ["after", "height"], label: "高度", clamp: [0, 100]});
  const label = String(options.label || "API 高度编辑").trim() || "API 高度编辑";
  const command = createApplyHeightBrushCommand(normalized, {label});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    noopStatus: "没有需要更新的高度。",
    status: `已通过 API 更新 ${normalized.length} 个 grid cells 的高度。`,
    throwOnError: false
  });
  if (state.heightEdit) {
    state.heightEdit.lastAffected = result.executed ? normalized.length : 0;
    state.heightEdit.lastHeight = result.executed ? summarizeChangedHeights(normalized) : "none";
    state.heightEdit.lastDelta = result.executed ? summarizeChangedHeightDelta(normalized) : "none";
  }
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function assignBiomeCellsViaApi(state, documentRef, biomeId, gridCellIds, options = {}) {
  assertMapAvailable(state);
  if (!Array.isArray(gridCellIds)) throw new Error("生物群系 grid cells 必须是数组");
  const target = normalizeApiInteger(biomeId, "生物群系 ID");
  const changes = buildBiomeAssignmentChanges(state.map, target, gridCellIds, options);
  const command = createApplyBiomeAssignmentCommand(changes, {label: "API 生物群系归属"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => `已通过 API 更新 ${executed.getResult?.().gridCells || 0} 个 grid cells 的生物群系。`,
    noopStatus: "生物群系归属没有变化。",
    throwOnError: false
  });
  state.biomeEdit.lastAffected = result.executed ? changes.length : 0;
  state.biomeEdit.preview = null;
  updateBiomePanel(state);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

export function inspectSuitabilityViaApi(state, gridCellIds, options = {}) {
  assertMapAvailable(state);
  if (!Array.isArray(gridCellIds)) throw new Error("适居度 grid cells 必须是数组");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("适居度预检参数必须是对象");
  return inspectSuitabilityEdit(state.map, gridCellIds, options);
}

export function applySuitabilityViaApi(state, documentRef, gridCellIds, options = {}, runtimeUi = {}) {
  assertMapAvailable(state);
  if (!Array.isArray(gridCellIds)) throw new Error("适居度 grid cells 必须是数组");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("适居度编辑参数必须是对象");
  const changes = buildSuitabilityChanges(state.map, gridCellIds, options);
  const command = createApplySuitabilityCommand(changes, {label: options.label || "API 数值适居度"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    ...(runtimeUi.refresh ? {refresh: runtimeUi.refresh} : {}),
    ...(runtimeUi.refreshPanels !== undefined ? {refreshPanels: runtimeUi.refreshPanels} : {}),
    status: executed => {
      const summary = executed.getResult?.();
      return `已通过 API 更新 ${summary?.gridCells || 0} 个 grid cells 的数值适居度。`;
    },
    noopStatus: "数值适居度没有变化。",
    throwOnError: false
  });
  state.suitabilityEdit.lastAffected = result.executed ? changes.length : 0;
  state.suitabilityEdit.preview = null;
  (runtimeUi.updateBiomePanel || updateBiomePanel)(state);
  (runtimeUi.updateRuntimePanel || updateRuntimePanel)(documentRef, state);
  (runtimeUi.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return editApiResult(state, result);
}

export function inspectPopulationAdjustmentViaApi(state, target, options = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("人口调整预检参数必须是对象");
  return inspectPopulationAdjustment(state.map, target, options);
}

export function applyPopulationAdjustmentViaApi(state, documentRef, target, options = {}, runtimeUi = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("人口调整参数必须是对象");
  const plan = buildPopulationAdjustmentPlan(state.map, target, options);
  const command = createApplyPopulationAdjustmentCommand(plan, {label: options.label || "区域人口增减"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    ...(runtimeUi.refresh ? {refresh: runtimeUi.refresh} : {}),
    ...(runtimeUi.refreshPanels !== undefined ? {refreshPanels: runtimeUi.refreshPanels} : {}),
    status: executed => {
      const summary = executed.getResult?.();
      return `已调整 ${summary?.packCells || 0} 个人口 cells 和 ${summary?.cities || 0} 个城市。`;
    },
    noopStatus: "区域人口没有变化。",
    throwOnError: false
  });
  (runtimeUi.updatePopulationPanel || updatePopulationPanel)(state);
  (runtimeUi.updateRuntimePanel || updateRuntimePanel)(documentRef, state);
  (runtimeUi.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return editApiResult(state, result);
}

export function inspectPopulationTransferViaApi(state, source, target, options = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("人口转移预检参数必须是对象");
  return inspectPopulationTransfer(state.map, source, target, options);
}

export function applyPopulationTransferViaApi(state, documentRef, source, target, options = {}, runtimeUi = {}) {
  assertMapAvailable(state);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("人口转移参数必须是对象");
  if (options.confirm !== true) throw new Error("区域人口转移会同时改写两个区域，需要显式传入 {confirm: true}");
  const plan = buildPopulationTransferPlan(state.map, source, target, options);
  const command = createApplyPopulationTransferCommand(plan, {label: options.label || "区域人口转移"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    ...(runtimeUi.refresh ? {refresh: runtimeUi.refresh} : {}),
    ...(runtimeUi.refreshPanels !== undefined ? {refreshPanels: runtimeUi.refreshPanels} : {}),
    status: executed => {
      const summary = executed.getResult?.();
      return `已转移 ${summary?.amount || 0} 人口，更新 ${summary?.packCells || 0} 个人口 cells 和 ${summary?.cities || 0} 个城市。`;
    },
    noopStatus: "区域人口没有变化。",
    throwOnError: false
  });
  (runtimeUi.updatePopulationPanel || updatePopulationPanel)(state);
  (runtimeUi.updateRuntimePanel || updateRuntimePanel)(documentRef, state);
  (runtimeUi.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return editApiResult(state, result);
}

function rebuildHeightDerivedViaAction(state, documentRef, scope, options = {}) {
  assertMapAvailable(state);
  if (options?.confirm !== true) throw new Error("高度派生重建会改写当前地图派生数据，需要显式传入 {confirm: true}");
  const before = regenerationApiSummary(state.map);
  const kinds = scope === "all"
    ? [...HEIGHT_BASE_REBUILD_STEPS, ...HEIGHT_DOWNSTREAM_REBUILD_STEPS]
    : scope === "base"
      ? [...HEIGHT_BASE_REBUILD_STEPS]
      : [...HEIGHT_DOWNSTREAM_REBUILD_STEPS];
  const transaction = executeMapSnapshotTransaction({
    map: state.map,
    editHistory: state.editHistory,
    label: `高度${scope === "all" ? "全部" : scope === "base" ? "基础" : "下游"}派生重建`,
    domain: "height-derived",
    effects: {
      ...REGENERATION_TRANSACTION_EFFECTS,
      affected: kinds.map(id => ({kind: "system", id}))
    },
    execute: () => {
      const regenerate = kind => regenerateMapAttributeCoreViaApi(state, documentRef, kind, {confirm: true});
      return scope === "all"
        ? rebuildHeightAllDerived(regenerate)
        : scope === "base"
          ? rebuildHeightBaseDerived(regenerate)
          : rebuildHeightDownstreamDerived(regenerate);
    },
    executeCommand: command => executeEditCommand(state, documentRef, command, {
      context: {map: state.map},
      refresh: () => {},
      refreshPanels: false
    }),
    onRestore: () => refreshMapMutationRollback(state, documentRef)
  });
  const result = transaction.result;
  updateRegenerationSection(documentRef, result);
  updateHeightPanel(state);
  updateEditingInteractionLock(state, documentRef);
  return {
    ...result,
    scope,
    before,
    after: regenerationApiSummary(state.map),
    staleSystems: [...(state.map?.metadata?.derivedStale?.systems || [])],
    history: state.editHistory.getStats(),
    effects: ["map-derived", "renderer", "runtime-panel", "height-panel", "object-index"]
  };
}

function inspectMarketAssignmentViaApi(state, marketId, packCellIds) {
  assertMapAvailable(state);
  const changes = buildMarketAssignmentChanges(state.map, marketId, packCellIds);
  return {
    marketId: Number(marketId),
    packCellIds: changes.map(change => change.packCell),
    ...inspectMarketAssignment(state.map, changes)
  };
}

function assignMarketCellsViaApi(state, documentRef, marketId, packCellIds, options = {}) {
  assertMapAvailable(state);
  const changes = buildMarketAssignmentChanges(state.map, marketId, packCellIds);
  const preview = inspectMarketAssignment(state.map, changes);
  if (!preview.valid) throw new Error(`市场归属预检失败：无效市场 ${preview.invalidMarketCells}，水域 ${preview.waterCells}`);
  if (options?.confirm !== true) throw new Error(`市场归属会重算经济链（跨国 ${preview.crossStateCells} cells、无国家 ${preview.unassignedStateCells} cells），需要显式传入 {confirm: true}`);
  const command = createApplyMarketAssignmentCommand(changes, {label: options.label || "API 市场归属"});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    afterRefresh: () => refreshGenerationSummary(state.map),
    noopStatus: "没有需要更新的市场归属。",
    status: `已通过 API 更新 ${changes.length} 个 pack cells 的市场归属并重算经济链。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return {...editApiResult(state, result), preview};
}

function rebuildEconomyViaApi(state, documentRef, options = {}) {
  assertMapAvailable(state);
  if (options?.confirm !== true) throw new Error("经济链重算会改写生产、交易、价格压力和财政，需要显式传入 {confirm: true}");
  return editApiResult(state, rebuildEconomyViaAction(state, documentRef, {label: options.label || "API 重算经济链"}));
}

function setGoodDisplayViaApi(state, documentRef, goodId, patch = {}) {
  assertMapAvailable(state);
  const id = normalizeApiInteger(goodId, "商品 ID");
  const result = executeEditCommand(state, documentRef, createSetGoodDisplayCommand(id, patch), {
    context: {map: state.map},
    noopStatus: "商品展示属性没有变化。",
    status: `已更新商品 #${id} 的展示属性。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setMarketDisplayViaApi(state, documentRef, marketId, patch = {}) {
  assertMapAvailable(state);
  const id = normalizeApiInteger(marketId, "市场 ID");
  const result = executeEditCommand(state, documentRef, createSetMarketDisplayCommand(id, patch), {
    context: {map: state.map},
    noopStatus: "市场展示属性没有变化。",
    status: `已更新市场 #${id} 的展示属性。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setDiplomacyRelationViaApi(state, documentRef, subjectId, objectId, relation, options = {}) {
  const subject = normalizeApiInteger(subjectId, "外交主体国家 ID");
  const object = normalizeApiInteger(objectId, "外交对象国家 ID");
  const command = createSetDiplomacyRelationCommand(subject, object, relation, {reason: options.reason});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "国家不存在、关系无效或关系未变化。",
    status: `已更新国家 #${subject} 与 #${object} 的外交关系。`,
    throwOnError: false
  });
  if (result.executed) refreshGenerationSummary(state.map);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setMilitaryRatiosViaApi(state, documentRef, stateId, ratios) {
  const id = normalizeApiInteger(stateId, "国家 ID");
  if (!ratios || typeof ratios !== "object" || Array.isArray(ratios)) throw new Error("兵种比例必须是对象");
  return executeMilitaryCommandViaApi(state, documentRef, createSetMilitaryRatiosCommand(id, ratios), `update military ratios: state=${id}`);
}

function setMilitaryStatusViaApi(state, documentRef, target, status) {
  const nextStatus = normalizeApiMilitaryStatus(status);
  return executeMilitaryCommandViaApi(state, documentRef, createSetMilitaryStatusCommand(target, nextStatus), `update military status: regiment=${target?.id || ""}, status=${nextStatus}`);
}

function setMilitaryStatusBatchViaApi(state, documentRef, targets, status) {
  if (!Array.isArray(targets)) throw new Error("军团目标必须是数组");
  const nextStatus = normalizeApiMilitaryStatus(status);
  return executeMilitaryCommandViaApi(state, documentRef, createSetMilitaryStatusBatchCommand(targets, nextStatus), `batch update military status: count=${targets.length}, status=${nextStatus}`);
}

function moveMilitaryStationViaApi(state, documentRef, target, destination) {
  if (!destination || typeof destination !== "object" || Array.isArray(destination)) throw new Error("军团驻地目标必须是对象");
  return executeMilitaryCommandViaApi(state, documentRef, createMoveMilitaryStationCommand(target, destination), `move military station: regiment=${target?.id || ""}, cell=${destination.cell ?? destination.packCell ?? ""}`);
}

function setMilitaryBaseViaApi(state, documentRef, target) {
  return executeMilitaryCommandViaApi(state, documentRef, createSetMilitaryBaseCommand(target), `set military base: regiment=${target?.id || ""}`);
}

function recordMilitaryBattleEventViaApi(state, documentRef, target, event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("战斗事件必须是对象");
  return executeMilitaryCommandViaApi(state, documentRef, createRecordMilitaryBattleEventCommand(target, event), `record military battle event: regiment=${target?.id || ""}, type=${event.type || ""}, outcome=${event.outcome || ""}`);
}

function importMilitaryBattleEventsViaApi(state, documentRef, document) {
  if (!document || typeof document !== "object") throw new Error("战斗事件导入文档必须是对象或数组");
  return executeMilitaryCommandViaApi(state, documentRef, createImportMilitaryBattleEventsCommand(document), "import military battle events");
}

function clearMilitaryBattleEventsViaApi(state, documentRef, target, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("清空战斗事件参数必须是对象");
  const eventIds = options.eventIds === undefined || options.eventIds === null ? null : options.eventIds;
  if (eventIds !== null && !Array.isArray(eventIds)) throw new Error("eventIds 必须是数组");
  const preview = {
    kind: OBJECT_KIND.MILITARY,
    kindLabel: "战斗事件",
    valid: Boolean(target),
    requestedCount: eventIds?.length || 1,
    objectCount: eventIds?.length || 1,
    validIds: eventIds ? [...eventIds] : [target?.id].filter(Boolean),
    deleteIds: eventIds ? [...eventIds] : [target?.id].filter(Boolean),
    cascadeIds: [],
    cascadeCount: 0,
    dependencies: {},
    skipped: [],
    requiresConfirm: Boolean(target),
    impactLevel: "high",
    summary: eventIds?.length ? `清空筛选出的 ${eventIds.length} 条战斗事件。` : "清空当前军团的全部战斗事件。",
    confirmationMessage: eventIds?.length
      ? `确定清空筛选出的 ${eventIds.length} 条战斗事件？确认后可通过一次撤销恢复。`
      : "确定清空当前军团的全部战斗事件？确认后可通过一次撤销恢复。"
  };
  if (options.inspectOnly === true) return namebaseInspectionResult(state, preview);
  if (preview.requiresConfirm && options.confirm !== true) throw createDeleteConfirmationRequiredError(preview);
  const command = createClearMilitaryBattleEventsCommand(target, {
    eventIds,
    label: eventIds?.length ? "清空筛选战斗事件" : "清空军团战斗事件"
  });
  return {
    ...executeMilitaryCommandViaApi(state, documentRef, command, `clear military battle events: regiment=${target?.id || ""}, scope=${eventIds?.length ? "filtered" : "selected"}`),
    preview
  };
}

function renameMilitaryRegimentViaApi(state, documentRef, target, name) {
  const nextName = String(name || "").trim();
  if (!nextName) throw new Error("军团名称不能为空");
  return executeMilitaryCommandViaApi(state, documentRef, createRenameMilitaryRegimentCommand(target, nextName), `rename military regiment: regiment=${target?.id || ""}`);
}

function executeMilitaryCommandViaApi(state, documentRef, command, logMessage) {
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "军事数据不存在或未发生变化。",
    throwOnError: false
  });
  if (result.executed) {
    markDerivedFresh(state.map, ["military"]);
    refreshGenerationSummary(state.map);
    appendGenerationLog(state.map, logMessage);
  }
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setZoneStyleViaApi(state, documentRef, zoneId, patch) {
  const id = normalizeApiInteger(zoneId, "地区 ID");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("地区样式必须是对象");
  const command = createSetZoneStyleCommand(id, patch);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "地区不存在、样式无效或未变化。",
    status: `已更新地区 #${id} 样式。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function createZoneViaApi(state, documentRef, options = {}) {
  if (!options || typeof options !== "object") throw new Error("地区创建参数必须是对象");
  const command = createAddZoneCommand(options);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => `已新增地区 #${executed.getResult?.().zoneId ?? ""}。`,
    preparePanelRefresh: (targetState, executed, created) => {
      if (!Number.isInteger(created?.zoneId)) return;
      const object = {kind: OBJECT_KIND.ZONE, id: created.zoneId};
      targetState.panels.zone?.setSelection({object});
      targetState.selectionStore.setSelection({object});
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteZoneViaApi(state, documentRef, zoneId) {
  const id = normalizeApiInteger(zoneId, "地区 ID");
  const result = executeEditCommand(state, documentRef, createDeleteZoneCommand(id), {
    context: {map: state.map},
    noopStatus: "地区不存在或已被删除。",
    status: `已删除地区 #${id}。`,
    preparePanelRefresh: targetState => {
      const selected = targetState.selectionStore.getSnapshot().selection?.object;
      if (selected?.kind === OBJECT_KIND.ZONE && Number(selected.id) === id) targetState.selectionStore.clear();
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameObjectViaApi(state, documentRef, kind, objectId, name, options = {}) {
  const id = normalizeApiInteger(objectId, options.idLabel || "对象 ID");
  const nextName = String(name || "").trim();
  if (!nextName) throw new Error("名称不能为空");
  const command = createRenameObjectCommand({kind, id}, nextName);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: options.refresh,
    noopStatus: options.noopStatus || "对象不存在或名称未变化。",
    status: typeof options.status === "function" ? options.status(id) : options.status,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function addCultureViaApi(state, documentRef, options = {}) {
  const payload = normalizeApiObjectOptions(options);
  const command = createAddCultureCommand({name: payload.name});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "当前地图没有文化数据。",
    status: command => {
      const cultureId = command.getCultureId?.();
      return cultureId ? `已新增空文化 #${cultureId}。` : "已新增空文化。";
    },
    preparePanelRefresh: (targetState, executed) => {
      const cultureId = executed.getCultureId?.();
      if (!cultureId) return;
      targetState.panels.culture?.setSelectedCultureId(cultureId);
      targetState.selectionStore.setSelection({
        object: {kind: OBJECT_KIND.CULTURE, id: cultureId, name: payload.name || `新文化 ${cultureId}`}
      });
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteCultureViaApi(state, documentRef, cultureId, options = {}) {
  const id = normalizeApiInteger(cultureId, "文化 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.CULTURE,
    ids: [id],
    createCommand: targetId => createDeleteCultureCommand(targetId),
    label: "API 删除文化",
    options,
    confirmation: "explicit",
    executeOptions: {
      noopStatus: "文化不存在或已删除。",
      preparePanelRefresh: targetState => {
        const selectedObject = targetState.selectionStore.getSnapshot().selection?.object;
        if (selectedObject?.kind !== OBJECT_KIND.CULTURE || Number(selectedObject.id) !== id) return;
        targetState.selectionStore.clear();
        targetState.panels.culture?.setSelectedCultureId(null);
      }
    }
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function assignSocialCellsViaApi(state, documentRef, kind, targetId, gridCellIds) {
  const label = kind === "culture" ? "文化" : "宗教";
  const id = normalizeApiInteger(targetId, `${label} ID`);
  const store = kind === "culture"
    ? state.map?.society?.cultures || state.map?.pack?.cultures
    : state.map?.society?.religions || state.map?.pack?.religions;
  if (id > 0 && (!store?.[id] || store[id].removed)) throw new Error(`${label}不存在或已删除`);
  if (!Array.isArray(gridCellIds)) throw new Error("gridCellIds 必须是数组");
  const field = kind === "culture" ? "culture" : "religion";
  const cells = state.map?.grid?.cells;
  const changes = [...new Set(gridCellIds.map(value => normalizeApiInteger(value, "grid cell ID")))]
    .filter(gridCell => gridCell >= 0 && gridCell < (cells?.[field]?.length || 0) && isGridLandCell(state.map, gridCell))
    .filter(gridCell => Number(cells[field][gridCell] || 0) !== id)
    .map(gridCell => ({gridCell, before: Number(cells[field][gridCell] || 0), after: id}));
  const command = kind === "culture"
    ? createApplyCultureAssignmentCommand(changes)
    : createApplyReligionAssignmentCommand(changes);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    noopStatus: `没有需要更新的${label}归属。`,
    status: `已更新 ${changes.length} 个 grid cells 的${label}归属。`,
    preparePanelRefresh: targetState => {
      targetState[`${kind}Edit`].lastAffected = changes.length;
    },
    throwOnError: false
  });
  if (!result.executed) {
    state[`${kind}Edit`].lastAffected = 0;
    refreshPanelsForEdit(state, {affected: [{kind, id}]});
  }
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

export function inspectSocialExpansionViaApi(state, kind, objectId, options = {}) {
  assertMapAvailable(state);
  const label = kind === "culture" ? "文化" : "宗教";
  const id = normalizeApiInteger(objectId, `${label} ID`);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error(`${label}扩张预检参数必须是对象`);
  return inspectSocialExpansion(state.map, {...options, kind, id});
}

export function applySocialExpansionViaApi(state, documentRef, kind, objectId, options = {}, runtimeUi = {}) {
  assertMapAvailable(state);
  const label = kind === "culture" ? "文化" : "宗教";
  const id = normalizeApiInteger(objectId, `${label} ID`);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error(`${label}扩张编辑参数必须是对象`);
  if (options.mode === "reexpand" && options.confirm !== true) throw new Error(`${label}重新扩张需要显式传入 {confirm: true}`);
  const inspection = inspectSocialExpansion(state.map, {...options, kind, id});
  if (!inspection.valid) throw new Error(inspection.reason);
  const command = createApplySocialExpansionCommand({...options, kind, id}, {label: `${label}${options.mode === "reexpand" ? "重新扩张" : "中心与参数"}`});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    ...(runtimeUi.refresh ? {refresh: runtimeUi.refresh} : {}),
    ...(runtimeUi.refreshPanels !== undefined ? {refreshPanels: runtimeUi.refreshPanels} : {}),
    status: executed => {
      const applied = executed.getResult?.();
      return applied?.mode === "reexpand"
        ? `已重新扩张${label}，更新 ${applied.changedPackCells || 0} 个 pack cells。`
        : `已保存${label}中心与扩张参数。`;
    },
    noopStatus: `${label}中心、参数和覆盖均未变化。`,
    throwOnError: false
  });
  (runtimeUi.updateRuntimePanel || updateRuntimePanel)(documentRef, state);
  (runtimeUi.updateEditingInteractionLock || updateEditingInteractionLock)(state, documentRef);
  return editApiResult(state, result);
}

function renameCultureViaApi(state, documentRef, cultureId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.CULTURE, cultureId, name, {
    idLabel: "文化 ID",
    noopStatus: "文化不存在或名称未变化。",
    status: id => `已重命名文化 #${id}。`
  });
}

function setCultureColorViaApi(state, documentRef, cultureId, color) {
  const id = normalizeApiInteger(cultureId, "文化 ID");
  const nextColor = normalizeApiHexColor(color, "文化颜色");
  const culture = state.map?.society?.cultures?.[id] || state.map?.pack?.cultures?.[id];
  const command = createSetCultureColorCommand(id, nextColor, {beforeColor: culture?.color ?? null});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "文化不存在或颜色未变化。",
    status: `已更新文化 #${id} 颜色。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setCultureParentViaApi(state, documentRef, cultureId, parentId) {
  const id = normalizeApiInteger(cultureId, "文化 ID");
  const parent = normalizeApiInteger(parentId, "文化父级 ID");
  const culture = state.map?.society?.cultures?.[id] || state.map?.pack?.cultures?.[id];
  const command = createSetCultureParentCommand(id, parent, {beforeParent: culture?.parent ?? 0});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "文化不存在、父级无效或继承未变化。",
    status: `已更新文化 #${id} 继承父级。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function addReligionViaApi(state, documentRef, options = {}) {
  const payload = normalizeApiObjectOptions(options);
  const command = createAddReligionCommand({name: payload.name});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "当前地图没有宗教数据。",
    status: command => {
      const religionId = command.getReligionId?.();
      return religionId ? `已新增空宗教 #${religionId}。` : "已新增空宗教。";
    },
    preparePanelRefresh: (targetState, executed) => {
      const religionId = executed.getReligionId?.();
      if (!religionId) return;
      targetState.panels.religion?.setSelectedReligionId(religionId);
      targetState.selectionStore.setSelection({
        object: {kind: OBJECT_KIND.RELIGION, id: religionId, name: payload.name || `新宗教 ${religionId}`}
      });
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteReligionViaApi(state, documentRef, religionId, options = {}) {
  const id = normalizeApiInteger(religionId, "宗教 ID");
  const deletion = executeDeleteWithPreflight(state, documentRef, {
    kind: OBJECT_KIND.RELIGION,
    ids: [id],
    createCommand: targetId => createDeleteReligionCommand(targetId),
    label: "API 删除宗教",
    options,
    confirmation: "explicit",
    executeOptions: {
      noopStatus: "宗教不存在或已删除。",
      preparePanelRefresh: targetState => {
        const selectedObject = targetState.selectionStore.getSnapshot().selection?.object;
        if (selectedObject?.kind !== OBJECT_KIND.RELIGION || Number(selectedObject.id) !== id) return;
        targetState.selectionStore.clear();
        targetState.panels.religion?.setSelectedReligionId(null);
      }
    }
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return deleteApiResult(state, deletion);
}

function renameReligionViaApi(state, documentRef, religionId, name) {
  return renameObjectViaApi(state, documentRef, OBJECT_KIND.RELIGION, religionId, name, {
    idLabel: "宗教 ID",
    noopStatus: "宗教不存在或名称未变化。",
    status: id => `已重命名宗教 #${id}。`
  });
}

function setReligionColorViaApi(state, documentRef, religionId, color) {
  const id = normalizeApiInteger(religionId, "宗教 ID");
  const nextColor = normalizeApiHexColor(color, "宗教颜色");
  const religion = state.map?.society?.religions?.[id] || state.map?.pack?.religions?.[id];
  const command = createSetReligionColorCommand(id, nextColor, {beforeColor: religion?.color ?? null});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "宗教不存在或颜色未变化。",
    status: `已更新宗教 #${id} 颜色。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setReligionParentViaApi(state, documentRef, religionId, parentId) {
  const id = normalizeApiInteger(religionId, "宗教 ID");
  const parent = normalizeApiInteger(parentId, "宗教父级 ID");
  const religion = state.map?.society?.religions?.[id] || state.map?.pack?.religions?.[id];
  const command = createSetReligionParentCommand(id, parent, {beforeParent: religion?.parent ?? 0});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "宗教不存在、父级无效或继承未变化。",
    status: `已更新宗教 #${id} 继承父级。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function applyLabelLayoutPatch(state, documentRef, object, patch) {
  if (!state.map) return null;
  const command = createPatchLabelLayoutCommand(object, patch);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "标签布局没有变化。",
    status: `已更新标签 ${object.targetKind} #${object.targetId ?? object.id} 的显示布局。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return result;
}

function toggleLabelPositionLock(state, documentRef, object) {
  const targetId = Number(object?.targetId ?? object?.id);
  const targetKind = object?.targetKind;
  const override = readLabelLayoutOverride(state.map, targetKind, targetId);
  if (override.position) return applyLabelLayoutPatch(state, documentRef, object, {position: null});
  const rendered = state.renderer?.getLabelLayoutSnapshot?.(targetKind, targetId);
  const x = Number(rendered?.x ?? object?.x);
  const y = Number(rendered?.y ?? object?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    setFileOperationStatus(documentRef, `标签 ${targetKind} #${targetId} 当前没有可锁定的世界锚点。`);
    return null;
  }
  const result = applyLabelLayoutPatch(state, documentRef, object, {position: {x, y}});
  if (result?.executed && targetKind === LABEL_TARGET_KIND.CUSTOM && state.pendingCustomLabelPlacement?.labelId === targetId) {
    state.pendingCustomLabelPlacement = null;
  }
  return result;
}

function getRuntimeLabelStyles(state) {
  if (!state.map) return {version: 1, overrides: {}, styles: {}};
  const store = ensureLabelStore(state.map).styles;
  const styles = Object.fromEntries(LABEL_STYLE_TYPES.map(styleType => [styleType, {
    styleType,
    override: readLabelStyleOverride(store, styleType),
    resolved: {...resolveLabelStyle(store, styleType, state.renderer?.visualTheme)}
  }]));
  return {
    version: store.version,
    overrides: Object.fromEntries(Object.entries(store.overrides).map(([key, value]) => [key, {...value}])),
    styles
  };
}

function syncLabelStylesUi(state, documentRef) {
  documentRef.dispatchEvent(new CustomEvent("webgl-generator-label-styles-changed", {detail: getRuntimeLabelStyles(state)}));
}

function setLabelStyleViaApi(state, documentRef, styleType, patch) {
  return executeLabelStyleCommand(state, documentRef, createPatchLabelStyleCommand(styleType, patch));
}

function resetLabelStyleViaApi(state, documentRef, styleType) {
  return executeLabelStyleCommand(state, documentRef, createResetLabelStyleCommand(styleType));
}

function resetAllLabelStylesViaApi(state, documentRef) {
  return executeLabelStyleCommand(state, documentRef, createResetAllLabelStylesCommand());
}

function executeLabelStyleCommand(state, documentRef, command) {
  if (!state.map) throw new Error("当前没有可编辑的地图");
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    refreshPanels: false
  });
  syncLabelStylesUi(state, documentRef);
  return editApiResult(state, result);
}

function addCustomLabelViaApi(state, documentRef, options = {}) {
  const payload = normalizeApiCustomLabelOptions(options);
  const command = createAddCustomLabelCommand(payload);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "标签文字或坐标无效，无法新增手工标签。",
    status: command => {
      const created = command.getCreatedLabel?.();
      return created ? `已新增手工标签 #${created.id}。` : "已新增手工标签。";
    },
    preparePanelRefresh: (targetState, executed) => {
      const created = executed.getCreatedLabel?.();
      if (!created) return;
      const object = {
        kind: OBJECT_KIND.LABEL,
        id: created.id,
        targetKind: LABEL_TARGET_KIND.CUSTOM,
        targetId: created.id,
        text: created.text,
        targetName: created.text
      };
      targetState.selectionStore.setSelection({object});
      targetState.panels.labelNaming?.setSelectedLabelKey?.(labelKeyForObject(object));
    },
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function deleteLabelViaApi(state, documentRef, label) {
  const target = normalizeApiLabelTarget(label);
  const command = createDeleteLabelCommand(target);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "标签不存在或已被隐藏。",
    status: `已删除或隐藏标签 ${formatApiLabelTarget(target)}。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function moveCustomLabelViaApi(state, documentRef, labelId, point) {
  const id = normalizeApiInteger(labelId, "手工标签 ID");
  const nextPoint = normalizeApiPoint(point, "手工标签坐标");
  const current = ensureLabelStore(state.map).custom.find(item => item.id === id);
  const command = createMoveCustomLabelCommand(id, nextPoint, {
    previousPoint: current ? {x: current.x, y: current.y} : null
  });
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "手工标签不存在、坐标无效或位置未变化。",
    status: `已移动手工标签 #${id}。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function renameCustomLabelViaApi(state, documentRef, labelId, text) {
  const id = normalizeApiInteger(labelId, "手工标签 ID");
  const command = createRenameCustomLabelCommand(id, text);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "手工标签不存在、文字为空或名称未变化。",
    status: `已重命名手工标签 #${id}。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setLabelNoteViaApi(state, documentRef, label, body, options = {}) {
  const target = normalizeApiLabelTarget(label);
  const noteOptions = {
    ...options,
    name: options.name || label?.targetName || label?.text || `标签 ${formatApiLabelTarget(target)}`
  };
  const command = createSetLabelNoteCommand(target, body, noteOptions);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "标签不存在或备注未变化。",
    status: `已更新标签备注 ${formatApiLabelTarget(target)}。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function restoreGeneratedLabelViaApi(state, documentRef, label) {
  const target = normalizeApiLabelTarget(label);
  const command = createRestoreGeneratedLabelCommand(target);
  const result = executeEditCommand(state, documentRef, command, {
    noopStatus: "生成标签不存在或未隐藏。",
    status: `已恢复生成标签 ${formatApiLabelTarget(target)}。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function normalizeApiCustomLabelOptions(options) {
  if (!options || typeof options !== "object") throw new Error("手工标签选项必须是对象");
  return {
    text: typeof options.text === "string" ? options.text.trim() : "",
    ...normalizeApiPoint(options, "手工标签坐标")
  };
}

function normalizeApiPoint(point, name = "坐标") {
  if (!point || typeof point !== "object") throw new Error(`${name} 必须是对象`);
  return {
    x: normalizeApiNumber(point.x, `${name}.x`),
    y: normalizeApiNumber(point.y, `${name}.y`)
  };
}

function normalizeApiLabelTarget(label) {
  const id = Number(label?.targetId ?? label?.id);
  if (!Number.isFinite(id)) throw new Error("缺少标签 ID");
  const targetKind = label?.targetKind || LABEL_TARGET_KIND.CITY;
  if (![LABEL_TARGET_KIND.CITY, LABEL_TARGET_KIND.STATE, LABEL_TARGET_KIND.CUSTOM].includes(targetKind)) {
    throw new Error(`未知标签类型：${targetKind}`);
  }
  return {id, targetId: id, targetKind};
}

function formatApiLabelTarget(target) {
  return `${target.targetKind} #${target.id}`;
}

function addMarkerViaApi(state, documentRef, options = {}) {
  const targetPackCell = normalizeApiInteger(options?.packCell, "pack cell");
  const command = createAddMarkerCommand({
    id: options?.id,
    type: options?.type,
    packCell: targetPackCell,
    name: options?.name
  });
  const result = executeMarkerCollectionApiCommand(state, documentRef, command, {
    noopStatus: "目标 pack cell 无效，无法新增标记。",
    status: `已新增标记到 pack cell ${targetPackCell}。`,
    includeCreatedMarker: true,
    selectCreated: true
  });
  return editApiResult(state, result);
}

function deleteMarkerViaApi(state, documentRef, markerId) {
  const id = normalizeApiInteger(markerId, "标记 ID");
  const command = createDeleteMarkerCommand(id);
  const result = executeMarkerCollectionApiCommand(state, documentRef, command, {
    noopStatus: "标记不存在或已被删除。",
    status: `已删除标记 #${id}。`,
    clearSelectedMarkerId: id,
    clearMarkerEditId: id
  });
  return editApiResult(state, result);
}

function moveMarkerViaApi(state, documentRef, markerId, packCell) {
  const id = normalizeApiInteger(markerId, "标记 ID");
  const targetPackCell = normalizeApiInteger(packCell, "pack cell");
  const command = createMoveMarkerCommand(id, targetPackCell);
  const result = executeMarkerCollectionApiCommand(state, documentRef, command, {
    noopStatus: "标记不存在、目标 pack cell 无效或位置未变化。",
    status: `已移动标记 #${id} 到 pack cell ${targetPackCell}。`,
    selectMarkerId: id
  });
  return editApiResult(state, result);
}

function setMarkerNoteViaApi(state, documentRef, markerId, body, options = {}) {
  const id = normalizeApiInteger(markerId, "标记 ID");
  const marker = (state.map?.markers?.markers || []).find(item => item?.id === id);
  const command = createSetMarkerNoteCommand(id, body, {
    ...options,
    name: options.name || marker?.name || marker?.label || `标记 #${id}`
  });
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "标记不存在或备注未变化。",
    status: `已更新标记 #${id} 备注。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function setMarkerVisualViaApi(state, documentRef, markerId, patch) {
  const id = normalizeApiInteger(markerId, "标记 ID");
  const visualPatch = normalizeApiMarkerVisualPatch(patch);
  const command = createSetMarkerVisualCommand(id, visualPatch);
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    noopStatus: "标记不存在、视觉参数为空或未变化。",
    status: `已更新标记 #${id} 图标。`,
    throwOnError: false
  });
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return editApiResult(state, result);
}

function executeMarkerCollectionApiCommand(state, documentRef, command, options = {}) {
  const context = {map: state.map};
  if (!state.map || !command) return {executed: false, command, result: null, error: null};
  try {
    const execution = executeEditCommand(state, documentRef, command, {
      context,
      noopStatus: options.noopStatus,
      refresh: (targetState, executedCommand) => {
        markDerivedFresh(targetState.map, ["markers", "economy"]);
        markDerivedStale(targetState.map, ["military", "diplomacy"]);
        refreshGenerationSummary(targetState.map);
        refreshAfterEdit(targetState, executedCommand);
      },
      preparePanelRefresh: targetState => {
        if (
          Number.isInteger(options.clearMarkerEditId) &&
          targetState.markerEdit.markerId === options.clearMarkerEditId
        ) {
          clearMarkerEditMode(targetState);
        }
        const selectedObject = targetState.selectionStore.getSnapshot().selection?.object;
        if (
          Number.isInteger(options.clearSelectedMarkerId) &&
          selectedObject?.kind === OBJECT_KIND.MARKER &&
          Number(selectedObject.id) === options.clearSelectedMarkerId
        ) {
          targetState.selectionStore.clear();
          targetState.panels.marker?.setSelectedMarkerId(null);
          return;
        }
        const createdMarker = options.selectCreated ? command.getCreatedMarker?.() : null;
        const markerId = Number.isInteger(options.selectMarkerId) ? options.selectMarkerId : createdMarker?.id;
        if (!Number.isInteger(markerId) || !(targetState.map.markers?.markers || []).some(marker => marker?.id === markerId)) return;
        targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.MARKER, id: markerId}});
        targetState.panels.marker?.setSelectedMarkerId(markerId);
      },
      throwOnError: false
    });
    if (!execution.executed) return execution;
    const activeModeId = state.canvasToolModes.getActive()?.id;
    if (
      Number.isInteger(options.clearMarkerEditId) &&
      [CANVAS_TOOL_MODE.MARKER_ADD, CANVAS_TOOL_MODE.MARKER_MOVE].includes(activeModeId)
    ) {
      cancelCanvasToolMode(state, documentRef, activeModeId, "target-deleted");
    }
    const createdMarker = options.selectCreated ? command.getCreatedMarker?.() : null;
    updateRuntimePanel(documentRef, state);
    updateEditingInteractionLock(state, documentRef);
    if (options.status) setFileOperationStatus(documentRef, messageFromOption(options.status, execution.command));
    const result = options.includeCreatedMarker && createdMarker
      ? {createdMarker}
      : execution.result;
    return {executed: true, command: execution.command, result, error: null};
  } catch (error) {
    return {executed: false, command, result: null, error};
  }
}

function normalizeApiInteger(value, name) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new Error(`${name} 必须是整数`);
  return numeric;
}

function normalizeApiGridChanges(map, changes, {field, valueKeys, label, clamp = null, targetKind = null}) {
  if (!Array.isArray(changes)) throw new Error(`${label} changes 必须是数组`);
  const values = map?.grid?.cells?.[field];
  if (!values) throw new Error(`当前地图缺少 grid.cells.${field}`);
  const targets = targetKind === "state"
    ? map?.politics?.states || map?.pack?.states
    : targetKind === "province"
      ? map?.politics?.provinces || map?.pack?.provinces
      : null;
  const byCell = new Map();
  for (const source of changes) {
    if (!source || typeof source !== "object") throw new Error(`${label} change 必须是对象`);
    const gridCell = normalizeApiInteger(source.gridCell ?? source.cell, `${label} grid cell ID`);
    if (gridCell < 0 || gridCell >= values.length) throw new Error(`${label} grid cell ID 越界：${gridCell}`);
    const rawAfter = valueKeys.find(key => source[key] !== undefined);
    if (!rawAfter) throw new Error(`${label} change 缺少 ${valueKeys.join(" / ")}`);
    let after = Number(source[rawAfter]);
    if (!Number.isFinite(after)) throw new Error(`${label}目标值必须是有限数`);
    if (clamp) after = Math.max(clamp[0], Math.min(clamp[1], Math.round(after)));
    else if (!Number.isInteger(after) || after < 0) throw new Error(`${label}目标 ID 必须是非负整数`);
    if (targets && after > 0 && (!targets[after] || targets[after].removed)) throw new Error(`找不到${label} #${after}`);
    const before = Number(values[gridCell] || 0);
    if (before === after) {
      byCell.delete(gridCell);
      continue;
    }
    byCell.set(gridCell, {gridCell, before, after});
  }
  return [...byCell.values()];
}

function normalizeApiMilitaryStatus(status) {
  const value = String(status || "").trim();
  if (!Object.prototype.hasOwnProperty.call(MILITARY_STATUSES, value)) throw new Error(`未知军团态势：${status}`);
  return value;
}

function normalizeApiObjectOptions(options) {
  if (options === null || options === undefined) return {};
  if (typeof options === "string") return {name: options.trim()};
  if (typeof options !== "object") throw new Error("对象选项必须是对象");
  return {
    ...options,
    name: typeof options.name === "string" ? options.name.trim() : ""
  };
}

function normalizeApiHexColor(color, name = "颜色") {
  if (typeof color !== "string") throw new Error(`${name} 必须是 #rrggbb`);
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) throw new Error(`${name} 必须是 #rrggbb`);
  return `#${match[1].toLowerCase()}`;
}

function normalizeApiMarkerVisualPatch(patch) {
  if (!patch || typeof patch !== "object") throw new Error("标记视觉参数必须是对象");
  const next = {};
  for (const key of ["symbol", "palette", "shape", "cultureStyle"]) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== "string" || !patch[key].trim()) throw new Error(`标记视觉参数 ${key} 必须是非空字符串`);
    next[key] = patch[key].trim();
  }
  if (!Object.keys(next).length) throw new Error("标记视觉参数不能为空");
  return next;
}

function editApiResult(state, result) {
  const effects = result.command?.effects || {};
  const derived = Array.isArray(effects.derived) ? effects.derived : [];
  return {
    executed: result.executed,
    noop: !result.executed && !result.error,
    label: result.command?.label || "",
    result: result.result,
    affected: Array.isArray(effects.affected) ? effects.affected.map(item => ({...item})) : [],
    stale: derived.filter(item => typeof item === "string" && item.startsWith("defer:")).map(item => item.slice(6)),
    effects: {
      render: effects.render || "none",
      selection: effects.selection || "none",
      runtimeStats: Boolean(effects.runtimeStats),
      pickPanel: Boolean(effects.pickPanel),
      derived: [...derived]
    },
    error: result.error ? {
      name: result.error.name || "Error",
      message: result.error.message || String(result.error)
    } : null,
    history: state.editHistory.getStats()
  };
}

function readEditCommandResult(command) {
  return typeof command?.getResult === "function" ? command.getResult() : null;
}

function refreshPanelsForEdit(state, commandOrEffects) {
  const effects = commandOrEffects?.effects || commandOrEffects || {};
  const affected = Array.isArray(effects.affected) ? effects.affected : [];
  const kinds = new Set(affected.map(item => item?.kind).filter(Boolean));
  const derived = Array.isArray(effects.derived) ? effects.derived : [];
  if (!kinds.size && !derived.length) {
    updateAllObjectPanels(state);
    return;
  }
  if (derived.includes("object-panels")) {
    updateAllObjectPanels(state);
    return;
  }
  for (const kind of kinds) {
    updatePanelForAffectedKind(state, kind);
  }
}

function updatePanelForAffectedKind(state, kind) {
  switch (kind) {
    case OBJECT_KIND.STATE:
      updateStatePanel(state);
      updateGovernmentPanel(state);
      updateProvincePanel(state);
      updateCityPanel(state);
      updateDiplomacyPanel(state);
      updateEconomyPanel(state);
      updateMilitaryPanel(state);
      break;
    case OBJECT_KIND.PROVINCE:
      updateProvincePanel(state);
      updateCityPanel(state);
      break;
    case OBJECT_KIND.CITY:
      updateCityPanel(state);
      updateStatePanel(state);
      updateProvincePanel(state);
      break;
    case OBJECT_KIND.CULTURE:
      updateCulturePanel(state);
      break;
    case OBJECT_KIND.RELIGION:
      updateReligionPanel(state);
      break;
    case OBJECT_KIND.RIVER:
      updateRiverPanel(state);
      break;
    case "ocean-current":
      updateOceanCurrentPanel(state);
      break;
    case OBJECT_KIND.LAKE:
      updateLakePanel(state);
      break;
    case OBJECT_KIND.ROUTE:
      updateRoutePanel(state);
      break;
    case OBJECT_KIND.MARKER:
      updateMarkerPanel(state);
      break;
    case OBJECT_KIND.LABEL:
      updateLabelNamingPanel(state);
      break;
    case OBJECT_KIND.ZONE:
      updateZonePanel(state);
      break;
    case "note":
      updateNotesPanel(state);
      break;
    case "measurement":
      updateMeasurementPanel(state);
      break;
    case "namebase":
    case "namebase-binding":
      updateNamebasePanel(state);
      break;
    default:
      break;
  }
}

function messageFromOption(message, command) {
  return typeof message === "function" ? message(command) : message;
}

function refreshAfterStateEdit(state, commandOrEffects) {
  updateStatePickAtLastPointer(state);
  refreshAfterEdit(state, commandOrEffects);
}

function refreshAfterProvinceEdit(state, commandOrEffects) {
  updateProvincePickAtLastPointer(state);
  refreshAfterEdit(state, commandOrEffects);
}

function regenerateMapAttribute(state, kind, documentRef, options = {}) {
  if (!state.map) return regenerationResult(kind, "未执行", "当前没有可重算的地图。");
  switch (kind) {
    case "features":
      return regenerateFeatures(state, documentRef);
    case "routes":
      return regenerateRoutes(state, documentRef);
    case "rivers":
      return regenerateRivers(state, documentRef);
    case "cities":
      return regenerateCities(state, documentRef, options);
    case "states":
      return regenerateStates(state, documentRef);
    case "provinces":
      return regenerateProvinces(state, documentRef, options);
    case "markers":
      return regenerateMarkerResources(state, documentRef);
    case "diplomacy":
      return regenerateDiplomacy(state, documentRef);
    case "religions":
      return regenerateReligions(state, documentRef);
    case "military":
      return regenerateMilitary(state, documentRef);
    case "zones":
      return regenerateZones(state, documentRef);
    default:
      break;
  }

  return regenerationResult(kind, "暂未执行", "该属性尚未接入受约束重算。");
}

function regenerateFeatures(state, documentRef) {
  const map = state.map;
  const before = map.features?.metadata?.featureCount || 0;
  const result = rebuildFeatureTopology(map);
  markDerivedFresh(map, ["features"]);
  markDerivedStale(map, ["rivers", "routes", "biomes", "cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate features: ${before} -> ${map.features?.metadata?.featureCount || 0}, removed=${result.removedFeatureIds.length}`);
  refreshRegeneratedLayers(state, documentRef, {
    derived: ["terrain-caches", "height-field", "cell-colors", "line-layers", "point-layers", "labels", "object-panels", "object-index"],
    affected: systemAffected("features", result.activeFeatureIds.map(id => ({kind: "feature", id})))
  });
  return regenerationResult(
    "features",
    `Feature 与岸线已按当前海平面重建：${before} -> ${map.features?.metadata?.featureCount || 0}`,
    "已先刷新水陆连通、岸线、haven / harbor 和 Feature 身份；河流、道路、国家、省份等后续步骤将继续按顺序重算。"
  );
}

function regenerateMapAttributeViaApi(state, documentRef, kind, options = {}) {
  assertMapAvailable(state);
  if (options?.confirm !== true) throw new Error("受约束重算会改写当前地图派生数据，需要显式传入 {confirm: true}");
  const targetKind = normalizeApiRegenerationKind(kind);
  const transaction = executeMapSnapshotTransaction({
    map: state.map,
    editHistory: state.editHistory,
    label: `受约束重生成 ${targetKind}`,
    domain: "regeneration",
    effects: {
      ...REGENERATION_TRANSACTION_EFFECTS,
      affected: [{kind: "system", id: targetKind}]
    },
    execute: () => regenerateMapAttributeCoreViaApi(state, documentRef, targetKind, options),
    executeCommand: command => executeEditCommand(state, documentRef, command, {
      context: {map: state.map},
      refresh: () => {},
      refreshPanels: false
    }),
    onRestore: () => refreshMapMutationRollback(state, documentRef)
  });
  return {
    ...transaction.result,
    history: state.editHistory.getStats()
  };
}

function regenerateMapAttributeCoreViaApi(state, documentRef, kind, options = {}) {
  assertMapAvailable(state);
  const targetKind = normalizeApiRegenerationKind(kind);
  const before = regenerationApiSummary(state.map);
  const scope = normalizeRegenerationScope(state.map, targetKind, options);
  const result = regenerateMapAttribute(state, targetKind, documentRef, scope);
  updateRegenerationSection(documentRef, result);
  updateEditingInteractionLock(state, documentRef);
  return {
    kind: targetKind,
    action: result.action || targetKind,
    executed: Boolean(result.executed),
    status: result.status || "",
    constraint: result.constraint || "",
    details: result.details || null,
    before,
    after: regenerationApiSummary(state.map),
    staleSystems: [...(state.map?.metadata?.derivedStale?.systems || [])],
    history: state.editHistory.getStats(),
    effects: ["map-derived", "renderer", "runtime-panel", "object-panels", "object-index"]
  };
}

function refreshMapMutationRollback(state, documentRef) {
  state.options = state.map.options;
  state.renderer?.refreshObjectPickingIndex?.();
  const effects = {effects: REGENERATION_TRANSACTION_EFFECTS};
  state.selectionStore.batch(() => {
    reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false});
    refreshAfterEdit(state, effects);
  });
  refreshPanelsForEdit(state, effects);
  updateHeightPanel(state);
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
}

function normalizeApiRegenerationKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  if (["feature", "features", "shore", "shoreline"].includes(value)) return "features";
  if (["route", "routes", "road", "roads"].includes(value)) return "routes";
  if (["river", "rivers", "hydro", "hydrology"].includes(value)) return "rivers";
  if (["city", "cities", "settlement", "settlements", "burg", "burgs"].includes(value)) return "cities";
  if (["state", "states", "country", "countries", "nation", "nations"].includes(value)) return "states";
  if (["province", "provinces"].includes(value)) return "provinces";
  if (["marker", "markers", "resource", "resources"].includes(value)) return "markers";
  if (["diplomacy", "diplomatic", "relations"].includes(value)) return "diplomacy";
  if (["religion", "religions"].includes(value)) return "religions";
  if (["military", "army", "armies"].includes(value)) return "military";
  if (["zone", "zones", "region-event", "region-events"].includes(value)) return "zones";
  throw new Error("受约束重算类型必须是 features / routes / rivers / cities / states / provinces / markers / diplomacy / religions / military / zones");
}

function normalizeRegenerationScope(map, kind, options = {}) {
  const rawScope = typeof options?.scope === "object" ? options.scope?.kind : options?.scope ?? options?.regenerationScope;
  const scopeKind = String(rawScope || "all").trim().toLowerCase();
  if (scopeKind === "all") return {kind: "all"};
  if (!["provinces", "cities"].includes(kind)) throw new Error(`${kind} 暂不支持局部重设`);
  if (kind === "provinces" && scopeKind !== "state") throw new Error("省份只能按全图或国家范围重设");
  if (kind === "cities" && !["state", "province"].includes(scopeKind)) throw new Error("城镇只能按全图、国家或省份范围重设");

  const objectScope = typeof options?.scope === "object" ? options.scope : null;
  const id = Number(scopeKind === "state"
    ? options?.stateId ?? objectScope?.id ?? options?.id
    : options?.provinceId ?? objectScope?.id ?? options?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`按${scopeKind === "state" ? "国家" : "省份"}重设时必须指定有效编号`);
  const collection = scopeKind === "state" ? map?.politics?.states : map?.politics?.provinces;
  const record = collection?.[id];
  if (!record || record.removed || Number(record.i ?? record.id) !== id) {
    throw new Error(`${scopeKind === "state" ? "国家" : "省份"} #${id} 不存在或已移除`);
  }
  return {kind: scopeKind, id};
}

function regenerationScopeLabel(map, scope) {
  if (scope.kind === "all") return "全图";
  const collection = scope.kind === "state" ? map?.politics?.states : map?.politics?.provinces;
  const record = collection?.[scope.id];
  return `“${record?.fullName || record?.name || `${scope.kind === "state" ? "国家" : "省份"} #${scope.id}`}”`;
}

function regenerationScopeLog(scope) {
  return scope.kind === "all" ? "all" : `${scope.kind}:${scope.id}`;
}

function settlementScopeContainsCity(map, scope, city) {
  if (scope.kind === "state") return Number(city.state) === scope.id;
  const packCell = Number(city.packCell);
  return Number(city.province) === scope.id || (Number.isInteger(packCell) && Number(map?.pack?.cells?.province?.[packCell]) === scope.id);
}

function regenerationApiSummary(map) {
  return {
    checksum: map?.metadata?.checksum || map?.summary?.checksum || "",
    states: countPoliticalItems(map?.politics?.states || []),
    provinces: countPoliticalItems(map?.politics?.provinces || []),
    cities: map?.settlements?.cities?.filter(Boolean).length || 0,
    routes: map?.settlements?.routes?.filter(Boolean).length || 0,
    rivers: map?.rivers?.rivers?.filter(Boolean).length || 0,
    markers: map?.markers?.markers?.filter(Boolean).length || 0,
    resourceMarkers: Number(map?.markers?.metadata?.resourceMarkers) || 0,
    religions: Number(map?.society?.metadata?.religions) || 0,
    militaryRegiments: Number(map?.military?.metadata?.regiments) || 0,
    militaryFronts: Number(map?.military?.metadata?.fronts) || map?.military?.fronts?.length || 0,
    militaryCampaigns: Number(map?.military?.metadata?.campaigns) || map?.military?.campaigns?.length || 0,
    zones: Number(map?.zones?.metadata?.zones) || 0,
    economyDeals: Number(map?.economy?.metadata?.deals) || 0,
    diplomacyPairs: Number(map?.diplomacy?.metadata?.pairs) || 0,
    diplomacyEnemies: Number(map?.diplomacy?.metadata?.enemies) || 0
  };
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
    affected: systemAffected("states", [
      ...collectionAffected(OBJECT_KIND.STATE, map.politics?.states, {includeZero: false}),
      ...collectionAffected(OBJECT_KIND.PROVINCE, map.politics?.provinces, {includeZero: false}),
      ...collectionAffected(OBJECT_KIND.CITY, map.settlements?.cities),
      ...collectionAffected(OBJECT_KIND.ROUTE, map.settlements?.routes)
    ])
  });

  return regenerationResult(
    "states",
    `国家已重选首都并按当前文化、人口和地形约束重算（扰动 #${stateSalt}）：${beforeStates} -> ${map.politics.metadata.states}；省份 ${beforeProvinces} -> ${map.politics.metadata.provinces}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已刷新国家/省份归属、城市政区、路线、标签、边界和对象索引；宗教、标记、区域、军事、经济已标记为待派生。"
  );
}

function regenerateProvinces(state, documentRef, scope = {kind: "all"}) {
  const map = state.map;
  const beforeProvinces = map.politics?.metadata?.provinces || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const provinceSalt = nextRegenerationSalt(map, "provinces");
  const result = scope.kind === "state"
    ? regenerateProvincesForStates(map, [scope.id])
    : regeneratePackProvincesWithinStates(map.grid, map.society, {...map.options, namebases: map.namebases}, map.pack, {salt: provinceSalt});
  if (!result) return regenerationResult("provinces", "未执行", "当前地图缺少可用国家或 pack 语义图，无法在国家内重建省份。");

  if (scope.kind === "all") applyPoliticsRegenerationResult(map, result);
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...map.options, namebases: map.namebases, routeRegenerationSalt: provinceSalt});
  markDerivedFresh(map, ["provinces", "cities"]);
  markDerivedStale(map, ["markers", "zones", "military", "economy", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate provinces: scope=${regenerationScopeLog(scope)}, salt=${provinceSalt}, provinces=${map.politics.metadata.provinces}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["cell-colors", "political-boundaries", "point-layers", "labels", "route-mesh", "object-panels", "object-index"],
    affected: systemAffected("provinces", [
      ...collectionAffected(OBJECT_KIND.PROVINCE, map.politics?.provinces, {includeZero: false}),
      ...collectionAffected(OBJECT_KIND.CITY, map.settlements?.cities),
      ...collectionAffected(OBJECT_KIND.ROUTE, map.settlements?.routes)
    ])
  });

  return regenerationResult(
    "provinces",
    `省份已在${regenerationScopeLabel(map, scope)}内重算（扰动 #${provinceSalt}）：${beforeProvinces} -> ${map.politics.metadata.provinces}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`,
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
    affected: systemAffected("routes", collectionAffected(OBJECT_KIND.ROUTE, map.settlements?.routes))
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
  markDerivedFresh(map, ["rivers", "routes", "biomes"]);
  markDerivedStale(map, ["cities", "provinces", "states", "religions", "markers", "zones", "military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate rivers: salt=${riverOptions.riverRegenerationSalt}, rivers=${map.rivers.metadata.rivers}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale.systems.join(",")}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["river-mesh", "river-width-stats", "route-mesh", "cell-colors", "point-layers", "object-panels", "object-index"],
    affected: systemAffected("rivers", [
      ...collectionAffected(OBJECT_KIND.RIVER, map.rivers?.rivers),
      ...collectionAffected(OBJECT_KIND.ROUTE, map.settlements?.routes)
    ])
  });

  return regenerationResult(
    "rivers",
    `河流已按当前高度、降水和湖泊约束重算（扰动 #${riverOptions.riverRegenerationSalt}）：${beforeRivers} -> ${map.rivers.metadata.rivers}；道路同步重算：${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已刷新水文通量、生物群系/人口评分、河流 mesh、道路 mesh 和对象索引；城镇、省份、国家、宗教、标记、区域、军事仍标记为待派生。"
  );
}

function regenerateCities(state, documentRef, scope = {kind: "all"}) {
  const map = state.map;
  const beforeCities = map.settlements?.cities?.filter(city => city && !city.removed).length || 0;
  const beforePorts = map.settlements?.cities?.filter(city => city?.port).length || 0;
  const beforeRoutes = map.settlements?.routes?.length || 0;
  const citySalt = nextRegenerationSalt(map, "cities");

  const settlementScope = scope.kind === "all" ? null : {kind: scope.kind, id: scope.id};
  const targetCityIds = settlementScope
    ? map.settlements.cities.filter(city => city && !city.removed && settlementScopeContainsCity(map, settlementScope, city)).map(city => city.id)
    : null;
  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: citySalt,
    routeRegenerationSalt: citySalt,
    settlementScope
  });
  clearGeneratedCityLabelHides(map, targetCityIds);
  markDerivedFresh(map, ["cities"]);
  markDerivedStale(map, ["provinces", "states", "religions", "markers", "zones", "military", "diplomacy"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate settlements: scope=${regenerationScopeLog(scope)}, salt=${citySalt}, cities=${map.settlements.metadata.cities}, ports=${map.settlements.metadata.ports}, routes=${map.settlements.metadata.routes}, stale=${map.metadata.derivedStale?.systems?.join(",") || "none"}`);

  refreshRegeneratedLayers(state, documentRef, {
    derived: ["point-layers", "labels", "route-mesh", "object-panels", "object-index"],
    affected: systemAffected("cities", [
      ...collectionAffected(OBJECT_KIND.CITY, map.settlements?.cities),
      ...collectionAffected(OBJECT_KIND.ROUTE, map.settlements?.routes)
    ])
  });

  return regenerationResult(
    "cities",
    `${regenerationScopeLabel(map, scope)}城镇已按当前适居度、文化、政区、港口和间距约束重算（扰动 #${citySalt}）：${beforeCities} -> ${map.settlements.metadata.cities}；港口 ${beforePorts} -> ${map.settlements.metadata.ports}；道路 ${beforeRoutes} -> ${map.settlements.metadata.routes}`,
    "已保留目标范围内的国家首都、省会锚点与目标范围外城镇身份，只替换目标范围内普通城镇；道路按全图关系同步重建。"
  );
}

function regenerateReligions(state, documentRef) {
  const map = state.map;
  if (!map?.pack?.cells?.s || !map?.society || !map?.settlements) return regenerationResult("religions", "未执行", "当前地图缺少 pack 社会、文化或城镇数据，无法重新扩张宗教。");
  const before = Number(map.society?.metadata?.religions) || 0;
  const salt = nextRegenerationSalt(map, "religions");
  const seed = `${map.options?.seed || "map"}:regenerate-religions:${salt}`;
  finalizeSocietyReligions(map.grid, map.society, map.pack, createRandom(seed), map.settlements, {...map.options, namebases: map.namebases, seed});
  markDerivedFresh(map, ["religions"]);
  markDerivedStale(map, ["diplomacy", "military", "zones"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate religions: salt=${salt}, religions=${map.society.metadata.religions}`);
  refreshRegeneratedLayers(state, documentRef, {
    derived: ["cell-colors", "object-panels", "object-index"],
    affected: systemAffected("religions", collectionAffected(OBJECT_KIND.RELIGION, map.society?.religions, {includeZero: false}))
  });
  return regenerationResult("religions", `宗教已按当前文化、城镇和人口重新扩张（扰动 #${salt}）：${before} -> ${map.society.metadata.religions}`, "已刷新宗教归属、覆盖统计和对象索引；外交、军事和地区仍标记为待派生。");
}

function regenerateMilitary(state, documentRef) {
  const map = state.map;
  const validStates = (map?.pack?.states || []).filter(state => state?.i && !state.removed);
  if (!map?.pack?.cells?.i?.length || !validStates.length) return regenerationResult("military", "未执行", "当前地图缺少 pack cells 或有效国家数据，无法重建军事。");
  const before = militaryRegenerationCounts(map);
  const beforeSnapshot = snapshotMilitaryVariation(map);
  const previousEvents = Array.isArray(map.military?.events) ? map.military.events : [];
  const eventSequence = Number(map.military?.metadata?.eventSequence) || 0;
  const salt = nextRegenerationSalt(map, "military");
  const archivedEvents = previousEvents.map(event => ({
    ...event,
    archived: true,
    archiveReason: "military-regeneration",
    archiveGeneration: salt
  }));
  const seed = `${map.options?.seed || "map"}:regenerate-military:${salt}`;
  let variation;
  let attempts = 0;
  do {
    attempts += 1;
    const attemptSeed = attempts === 1 ? seed : `${seed}:retry:${attempts}`;
    map.military = buildMilitary(map.pack, {...map.options, seed: attemptSeed});
    syncMilitaryStateMirrors(map);
    variation = compareMilitaryVariation(beforeSnapshot, snapshotMilitaryVariation(map));
  } while (!variation.changed && attempts < 6);
  map.military.events = archivedEvents;
  map.military.metadata.events = archivedEvents.length;
  map.military.metadata.eventSequence = eventSequence;
  markDerivedFresh(map, ["military"]);
  markDerivedStale(map, ["zones"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate military: salt=${salt}, attempts=${attempts}, changed=${variation.changedRegiments}, regiments=${map.military.metadata.regiments}, troops=${map.military.metadata.troops}`);
  const affected = systemAffected("military", collectionAffected(OBJECT_KIND.MILITARY, militaryRegiments(map)));
  refreshRegeneratedLayers(state, documentRef, {
    derived: ["point-layers", "line-layers", "labels", "object-panels", "object-index"],
    affected
  });
  const after = militaryRegenerationCounts(map);
  return regenerationResult(
    "military",
    `军事已按当前国家、人口、经济和外交重算（扰动 #${salt}）：变化军团 ${variation.changedRegiments}；兵力 ${variation.troopChanges}；编成 ${variation.compositionChanges}；态势 ${variation.statusChanges}；驻地 ${variation.positionChanges}`,
    `军团 ${before.regiments} -> ${after.regiments}；战线 ${before.fronts} -> ${after.fronts}；战役 ${before.campaigns} -> ${after.campaigns}。已刷新军事图标、标签、战线和对象索引；地区仍标记为待派生。`,
    {
      regenerationSalt: salt,
      attempts,
      variation,
      before,
      after,
      preservedBattleEvents: archivedEvents.length,
      affected: {
        summary: state.lastEditRefresh?.affected || "none",
        count: state.lastEditRefresh?.affectedCount || affected.length,
        kinds: state.lastEditRefresh?.affectedKinds || []
      }
    }
  );
}

function militaryRegenerationCounts(map) {
  return {
    regiments: Number(map?.military?.metadata?.regiments) || militaryRegiments(map).length,
    fronts: Number(map?.military?.metadata?.fronts) || map?.military?.fronts?.length || 0,
    campaigns: Number(map?.military?.metadata?.campaigns) || map?.military?.campaigns?.length || 0
  };
}

function regenerateZones(state, documentRef) {
  const map = state.map;
  if (!map?.pack?.cells?.i?.length) return regenerationResult("zones", "未执行", "当前地图缺少 pack cells，无法重建地区。");
  const before = Number(map.zones?.metadata?.zones) || 0;
  const salt = nextRegenerationSalt(map, "zones");
  const seed = `${map.options?.seed || "map"}:regenerate-zones:${salt}`;
  map.zones = buildZones(map.pack, {...map.options, seed});
  markDerivedFresh(map, ["zones"]);
  refreshGenerationSummary(map);
  appendGenerationLog(map, `regenerate zones: salt=${salt}, zones=${map.zones.metadata.zones}, cells=${map.zones.metadata.cells}`);
  refreshRegeneratedLayers(state, documentRef, {
    derived: ["cell-colors", "object-panels", "object-index"],
    affected: systemAffected("zones", collectionAffected(OBJECT_KIND.ZONE, map.zones?.zones))
  });
  return regenerationResult("zones", `地区已按当前战争、宗教、军事与地形上下文重算（扰动 #${salt}）：${before} -> ${map.zones.metadata.zones}`, "已刷新地区覆盖、统计和对象索引。");
}

function regenerateMarkerResources(state, documentRef, {deferRefresh = false} = {}) {
  const map = state.map;
  const beforeResources = map.markers?.metadata?.resourceMarkers || 0;
  const beforePotential = map.markers?.metadata?.resourcePotential || 0;
  const salt = nextRegenerationSalt(map, "markers");
  const command = createRegenerateResourceMarkersCommand({salt});
  const executed = deferRefresh
    ? executeDeferredMarkerRegeneration(state, command)
    : applyMarkerCollectionCommand(state, documentRef, command);
  if (!executed) return regenerationResult("markers", "未执行", "当前地图缺少可用 pack 语义图或标记集合，无法重生成资源点。");

  appendGenerationLog(map, `regenerate resources: salt=${salt}, resources=${map.markers.metadata.resourceMarkers}, resourcePotential=${map.markers.metadata.resourcePotential}, markerResourceDeals=${map.economy?.metadata?.resourceTrade?.markerResourceDeals || 0}`);
  return regenerationResult(
    "markers",
    `资源点已按当前地形、河流、生物群系、温度和降水约束重算（扰动 #${salt}）：${beforeResources} -> ${map.markers.metadata.resourceMarkers}；资源潜力 ${beforePotential} -> ${map.markers.metadata.resourcePotential}`,
    "已刷新资源 marker、正式货物来源、市场库存、交易、国家/省份资源潜力、点图层、对象索引和统计；军事与外交已标记为待派生。"
  );
}

function executeDeferredMarkerRegeneration(state, command) {
  if (command.isNoop?.({map: state.map})) return null;
  state.editHistory.execute(command, {map: state.map});
  markDerivedFresh(state.map, ["markers", "economy"]);
  markDerivedStale(state.map, ["military", "diplomacy"]);
  refreshGenerationSummary(state.map);
  return command;
}

function militaryRegiments(map) {
  return (map?.pack?.states || map?.politics?.states || []).flatMap(state => state?.military || []);
}

function regenerateDiplomacy(state, documentRef) {
  const map = state.map;
  const beforePairs = map.diplomacy?.metadata?.pairs || 0;
  const beforeEnemies = map.diplomacy?.metadata?.enemies || 0;
  const salt = nextRegenerationSalt(map, "diplomacy");
  const command = createRegenerateDiplomacyCommand({salt});
  const result = executeEditCommand(state, documentRef, command, {
    context: {map},
    refresh: refreshAfterEdit,
    preparePanelRefresh: targetState => {
      markDerivedFresh(targetState.map, ["diplomacy"]);
      refreshGenerationSummary(targetState.map);
    }
  });
  if (!result.executed) return regenerationResult("diplomacy", "未执行", "当前地图至少需要两个有效国家才能重生成外交。");
  appendGenerationLog(map, `regenerate diplomacy: salt=${salt}, pairs=${map.diplomacy.metadata.pairs}, enemies=${map.diplomacy.metadata.enemies}`);
  updateRuntimePanel(documentRef, state);

  return regenerationResult(
    "diplomacy",
    `外交已按当前国家邻接、文化、宗教、国力、资源竞争和海洋势力重算（扰动 #${salt}）：关系 ${beforePairs} -> ${map.diplomacy.metadata.pairs}；战争 ${beforeEnemies} -> ${map.diplomacy.metadata.enemies}`,
    "外交重算不会改写国家边界、城镇、经济或军队；战争状态只保留为外交记录和静态军事摘要上下文。"
  );
}

function refreshRegeneratedLayers(state, documentRef, {derived, affected}) {
  state.renderer.refreshObjectPickingIndex?.();
  const highlightsChanged = reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false}).changed;
  refreshAfterEdit(state, {
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived,
    affected
  });
  refreshPanelsForEdit(state, highlightsChanged ? {derived: ["object-panels"]} : {derived, affected});
  updateHeightPanel(state);
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

function clearGeneratedCityLabelHides(map, cityIds = null) {
  const store = ensureLabelStore(map);
  if (Array.isArray(cityIds)) {
    const targets = new Set(cityIds.map(Number));
    store.hidden[LABEL_TARGET_KIND.CITY] = store.hidden[LABEL_TARGET_KIND.CITY].filter(id => !targets.has(Number(id)));
  } else {
    store.hidden[LABEL_TARGET_KIND.CITY] = [];
  }
  store.metadata = {
    custom: store.custom.length,
    hidden: store.hidden[LABEL_TARGET_KIND.CITY].length + store.hidden[LABEL_TARGET_KIND.STATE].length
  };
}

function regenerationResult(kind, status, constraint, details = null) {
  const result = createRegenerationResult(kind, status, constraint);
  return details ? {...result, details} : result;
}

function shouldSwitchDiplomacySubjectForSelection(state) {
  return state.renderer?.getStats?.().colorMode === "diplomacy";
}

function registerCanvasToolModes(state, documentRef, {stopObjectEditing} = {}) {
  const register = (modeId, panelId, hooks = {}) => {
    const exit = payload => {
      state.brushCursorPreview?.clear();
      hooks.onExit?.(payload);
    };
    state.canvasToolModes.register(modeId, {
      locksInteraction: hooks.locksInteraction,
      allowedPanelIds: panelId ? [panelId] : [],
      onEnter: hooks.onEnter,
      onRepeat: hooks.onRepeat,
      onCancel: exit,
      onComplete: exit,
      onError: hooks.onError
    });
  };

  register(CANVAS_TOOL_MODE.HEIGHT_BRUSH, "height-panel", {
    onEnter: () => {
      state.panels.height?.setActive(true);
      activateCanvasToolTheme(state, documentRef, "height");
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, "height");
      state.panels.height?.setActive(false);
      cancelHeightLine(state, documentRef);
      cancelHeightSelectionBox(state, documentRef);
      cancelHeightSelectionPoint(state);
      cancelHeightSelectionPaint(state);
      clearHeightTransformPreview(state);
      updateHeightPanel(state);
    }
  });

  register(CANVAS_TOOL_MODE.STATE_BRUSH, "state-panel", {
    onEnter: () => {
      state.stateEdit.addMode = false;
      state.stateEdit.deleteMode = false;
      state.panels.state?.setActive(true);
      syncPoliticalModePanel(state, "state");
      activateCanvasToolTheme(state, documentRef, "states");
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, "state");
      state.panels.state?.setActive(false);
      stopObjectEditing?.({ifKind: OBJECT_KIND.STATE});
      syncPoliticalModePanel(state, "state");
    }
  });
  registerPoliticalOneShotMode(state, documentRef, register, {
    modeId: CANVAS_TOOL_MODE.STATE_ADD,
    kind: "state",
    flag: "addMode",
    panelId: "state-panel",
    colorMode: "states",
    objectKind: OBJECT_KIND.STATE,
    stopObjectEditing
  });
  registerPoliticalOneShotMode(state, documentRef, register, {
    modeId: CANVAS_TOOL_MODE.STATE_DELETE,
    kind: "state",
    flag: "deleteMode",
    panelId: "state-panel",
    colorMode: "states",
    objectKind: OBJECT_KIND.STATE,
    stopObjectEditing
  });

  register(CANVAS_TOOL_MODE.PROVINCE_BRUSH, "province-panel", {
    onEnter: () => {
      state.provinceEdit.addMode = false;
      state.provinceEdit.deleteMode = false;
      state.panels.province?.setActive(true);
      syncPoliticalModePanel(state, "province");
      activateCanvasToolTheme(state, documentRef, "provinces");
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, "province");
      state.panels.province?.setActive(false);
      stopObjectEditing?.({ifKind: OBJECT_KIND.PROVINCE});
      syncPoliticalModePanel(state, "province");
    }
  });
  registerPoliticalOneShotMode(state, documentRef, register, {
    modeId: CANVAS_TOOL_MODE.PROVINCE_ADD,
    kind: "province",
    flag: "addMode",
    panelId: "province-panel",
    colorMode: "provinces",
    objectKind: OBJECT_KIND.PROVINCE,
    stopObjectEditing
  });
  registerPoliticalOneShotMode(state, documentRef, register, {
    modeId: CANVAS_TOOL_MODE.PROVINCE_DELETE,
    kind: "province",
    flag: "deleteMode",
    panelId: "province-panel",
    colorMode: "provinces",
    objectKind: OBJECT_KIND.PROVINCE,
    stopObjectEditing
  });

  registerCityOneShotMode(state, documentRef, register, CANVAS_TOOL_MODE.CITY_ADD, "addMode");
  registerCityOneShotMode(state, documentRef, register, CANVAS_TOOL_MODE.CITY_DELETE, "deleteMode");
  register(CANVAS_TOOL_MODE.CITY_MOVE, "city-panel", {
    onEnter: ({context}) => {
      const cityId = Number(context.cityId);
      if (!Number.isInteger(cityId) || cityId < 0) throw new Error("移动城市前必须选择城市");
      state.cityEdit.addMode = false;
      state.cityEdit.deleteMode = false;
      state.cityEdit.moveMode = true;
      state.cityEdit.moveCityId = cityId;
      state.cityEdit.movePreview = null;
      state.panels.city?.updateAddMode?.(false);
      state.panels.city?.updateDeleteMode?.(false);
      state.panels.city?.updateMoveMode?.(true, cityId);
      state.panels.city?.updateMovePreview?.(null);
      activateCanvasToolTheme(state, documentRef, "states");
    },
    onExit: () => {
      state.cityEdit.dragController?.cancel("mode-exit", false);
      if (state.cityEdit.activeDrag) releasePointer(state.renderer?.canvas, state.cityEdit.activeDrag.pointerId);
      state.cityEdit.activeDrag = null;
      state.cityEdit.moveMode = false;
      state.cityEdit.moveCityId = null;
      state.cityEdit.movePreview = null;
      state.panels.city?.updateMoveMode?.(false, null);
      state.panels.city?.updateMovePreview?.(null);
    }
  });
  registerSocialAssignmentMode(state, documentRef, register, "culture");
  registerSocialAssignmentMode(state, documentRef, register, "religion");
  registerSocialCenterMode(state, documentRef, register, "culture");
  registerSocialCenterMode(state, documentRef, register, "religion");
  register(CANVAS_TOOL_MODE.BIOME_ASSIGN, "biome-panel", {
    onEnter: () => {
      state.biomeEdit.activeStroke = null;
      state.biomeEdit.preview = null;
      state.panels.biome?.setAssignmentActive(true);
      activateCanvasToolTheme(state, documentRef, "biomes");
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, "biome");
      state.biomeEdit.preview = null;
      state.panels.biome?.setAssignmentActive(false);
      state.panels.biome?.updateAssignment({preview: null});
    }
  });
  register(CANVAS_TOOL_MODE.SUITABILITY_PAINT, "biome-panel", {
    onEnter: () => {
      state.suitabilityEdit.activeStroke = null;
      state.suitabilityEdit.preview = null;
      state.panels.biome?.setSuitabilityActive(true);
      state.panels.biome?.updateSuitability({preview: null});
      activateCanvasToolTheme(state, documentRef, "population");
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, "suitability");
      state.suitabilityEdit.preview = null;
      state.panels.biome?.setSuitabilityActive(false);
      state.panels.biome?.updateSuitability({preview: null});
    }
  });
  register(CANVAS_TOOL_MODE.MARKET_ASSIGN, "economy-panel", {
    onEnter: () => {
      state.economyEdit.activeStroke = null;
      state.economyEdit.originals = new Map();
      state.economyEdit.preview = null;
      state.panels.economy?.setMarketAssignmentActive(true);
      state.panels.economy?.updateMarketAssignmentPreview(null);
    },
    onExit: () => {
      cancelMarketAssignmentPreview(state);
      state.panels.economy?.setMarketAssignmentActive(false);
    }
  });

  register(CANVAS_TOOL_MODE.MEASUREMENT_DRAW, "measurement-panel", {
    locksInteraction: false,
    onEnter: () => {
      state.measurement.active = true;
      state.measurement.pointer = null;
      state.measurement.notice = "";
      updateMeasurementOverlay(state, documentRef);
    },
    onExit: ({reason}) => {
      state.measurement.active = false;
      state.measurement.pointer = null;
      cancelMeasurementDrag(state, documentRef);
      if (["switch", "panel-close", "map-replace", "enter-error"].includes(reason)) {
        state.measurement.points = [];
        state.measurement.editingMeasurementId = null;
        state.measurement.notice = "";
      }
      updateMeasurementOverlay(state, documentRef);
    }
  });

  register(CANVAS_TOOL_MODE.MARKER_ADD, "marker-panel", {
    onEnter: ({context}) => activateMarkerModeState(state, {mode: "add", ...context}),
    onRepeat: ({context}) => activateMarkerModeState(state, {mode: "add", ...context}),
    onExit: () => clearMarkerModeState(state)
  });
  register(CANVAS_TOOL_MODE.MARKER_MOVE, "marker-panel", {
    onEnter: ({context}) => activateMarkerModeState(state, {mode: "move", ...context}),
    onRepeat: ({context}) => activateMarkerModeState(state, {mode: "move", ...context}),
    onExit: () => clearMarkerModeState(state)
  });
  register(CANVAS_TOOL_MODE.ROUTE_DRAW, "route-panel", {
    onEnter: ({context}) => {
      state.routeCreate.active = true;
      state.routeCreate.type = context.type || "road";
      state.routeCreate.startPackCell = null;
      state.panels.route?.setCreateMode(true);
    },
    onExit: () => {
      state.routeCreate.active = false;
      state.routeCreate.startPackCell = null;
      state.panels.route?.setCreateMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, "route-panel", {
    onEnter: ({context}) => {
      state.routeEdit.waypointRouteId = Number(context.routeId);
      state.panels.route?.setWaypointMode(true);
    },
    onExit: () => {
      state.routeEdit.waypointRouteId = null;
      state.panels.route?.setWaypointMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.RIVER_ADD, "river-panel", {
    onEnter: () => {
      state.riverCreate.active = true;
      state.panels.river?.setCreateMode(true);
    },
    onExit: () => {
      state.riverCreate.active = false;
      state.panels.river?.setCreateMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.LAKE_EXCAVATE, "lake-panel", {
    onEnter: ({context}) => {
      state.lakeCreate.active = true;
      state.lakeCreate.radius = Number(context.radius) || 0;
      state.panels.lake?.setCreateMode(true);
    },
    onExit: () => {
      state.lakeCreate.active = false;
      state.panels.lake?.setCreateMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, "lake-panel", {
    onEnter: ({context}) => {
      state.featurePatch.active = true;
      state.featurePatch.draft = {...context};
      state.panels.lake?.setPatchSelectMode(true);
    },
    onRepeat: ({context}) => {
      state.featurePatch.draft = {...context};
      state.panels.lake?.setPatchSelectMode(true);
    },
    onExit: () => {
      state.featurePatch.active = false;
      state.featurePatch.draft = null;
      state.panels.lake?.setPatchSelectMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, "feature-panel", {
    onEnter: ({context}) => {
      state.featureTopology.active = true;
      state.panels.feature?.setTopologySelectMode(true);
      previewFeatureTopologyDraft(state, context);
    },
    onRepeat: ({context}) => {
      state.featureTopology.active = true;
      state.panels.feature?.setTopologySelectMode(true);
      previewFeatureTopologyDraft(state, context);
    },
    onExit: () => {
      state.featureTopology.active = false;
      clearFeatureTopologyPreview(state);
      state.panels.feature?.setTopologySelectMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.ZONE_ADD, "zone-panel", {
    onEnter: ({context}) => {
      state.zoneCreate.active = true;
      state.zoneCreate.type = context.type || "Disaster";
      state.zoneCreate.radius = Number.isInteger(Number(context.radius)) ? Number(context.radius) : 1;
      state.panels.zone?.setCreateMode(true, state.zoneCreate.type);
    },
    onRepeat: ({context}) => {
      state.zoneCreate.type = context.type || state.zoneCreate.type;
      state.panels.zone?.setCreateMode(true, state.zoneCreate.type);
    },
    onExit: () => {
      state.zoneCreate.active = false;
      state.panels.zone?.setCreateMode(false);
    }
  });
  register(CANVAS_TOOL_MODE.NOTE_ADD, "notes-panel", {
    onEnter: () => {
      state.noteCreate.active = true;
      state.panels.notes?.setCreateMode(true);
    },
    onExit: () => {
      state.noteCreate.active = false;
      state.panels.notes?.setCreateMode(false);
    }
  });
}

function registerPoliticalOneShotMode(state, documentRef, register, {modeId, kind, flag, panelId, colorMode, objectKind, stopObjectEditing}) {
  register(modeId, panelId, {
    onEnter: () => {
      const editState = state[`${kind}Edit`];
      editState.addMode = flag === "addMode";
      editState.deleteMode = flag === "deleteMode";
      state.panels[kind]?.setActive(false);
      stopObjectEditing?.({ifKind: objectKind});
      syncPoliticalModePanel(state, kind);
      activateCanvasToolTheme(state, documentRef, colorMode);
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, kind);
      state[`${kind}Edit`][flag] = false;
      syncPoliticalModePanel(state, kind);
    }
  });
}

function registerCityOneShotMode(state, documentRef, register, modeId, flag) {
  register(modeId, "city-panel", {
    onEnter: () => {
      state.cityEdit.addMode = flag === "addMode";
      state.cityEdit.deleteMode = flag === "deleteMode";
      state.cityEdit.moveMode = false;
      state.cityEdit.moveCityId = null;
      state.cityEdit.movePreview = null;
      state.panels.city?.updateAddMode?.(state.cityEdit.addMode);
      state.panels.city?.updateDeleteMode?.(state.cityEdit.deleteMode);
      state.panels.city?.updateMoveMode?.(false, null);
      state.panels.city?.updateMovePreview?.(null);
      activateCanvasToolTheme(state, documentRef, "states");
    },
    onExit: () => {
      state.cityEdit[flag] = false;
      state.panels.city?.updateAddMode?.(state.cityEdit.addMode);
      state.panels.city?.updateDeleteMode?.(state.cityEdit.deleteMode);
    }
  });
}

function registerSocialAssignmentMode(state, documentRef, register, kind) {
  const modeId = kind === "culture" ? CANVAS_TOOL_MODE.CULTURE_ASSIGN : CANVAS_TOOL_MODE.RELIGION_ASSIGN;
  register(modeId, `${kind}-panel`, {
    onEnter: () => {
      state[`${kind}Edit`].activeStroke = null;
      state.panels[kind]?.setAssignmentActive(true);
      activateCanvasToolTheme(state, documentRef, `${kind}s`);
    },
    onExit: () => {
      rollbackCanvasToolStroke(state, kind);
      state.panels[kind]?.setAssignmentActive(false);
    }
  });
}

function registerSocialCenterMode(state, documentRef, register, kind) {
  const modeId = kind === "culture" ? CANVAS_TOOL_MODE.CULTURE_CENTER : CANVAS_TOOL_MODE.RELIGION_CENTER;
  register(modeId, `${kind}-panel`, {
    onEnter: () => {
      state.panels[kind]?.setCenterPickActive?.(true);
      activateCanvasToolTheme(state, documentRef, `${kind}s`);
    },
    onExit: () => state.panels[kind]?.setCenterPickActive?.(false)
  });
}

function activateCanvasToolTheme(state, documentRef, colorMode) {
  state.renderer?.setColorMode(colorMode);
  setActiveModeButton(documentRef, colorMode);
}

function syncPoliticalModePanel(state, kind) {
  const editState = state[`${kind}Edit`];
  state.panels[kind]?.updateAddMode?.(editState.addMode);
  state.panels[kind]?.updateDeleteMode?.(editState.deleteMode);
}

function activateMarkerModeState(state, {mode, type = "mines", markerId = null} = {}) {
  state.markerEdit.mode = mode || null;
  state.markerEdit.type = type || state.markerEdit.type || "mines";
  state.markerEdit.markerId = Number.isInteger(markerId) ? markerId : null;
  state.markerEdit.lastPackCell = null;
  updateMarkerPanel(state);
}

function clearMarkerModeState(state) {
  clearMarkerEditMode(state);
  updateMarkerPanel(state);
}

function enterCanvasToolMode(state, documentRef, modeId, context = {}) {
  try {
    return state.canvasToolModes.enter(modeId, context);
  } finally {
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    state.brushCursorPreview?.scheduleRefresh();
  }
}

function cancelCanvasToolMode(state, documentRef, modeId, reason = "cancel") {
  try {
    return state.canvasToolModes.cancel(modeId, reason);
  } finally {
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    state.brushCursorPreview?.scheduleRefresh();
  }
}

function completeCanvasToolMode(state, documentRef, modeId, detail = {}) {
  try {
    return state.canvasToolModes.complete(modeId, detail);
  } finally {
    updateEditingInteractionLock(state, documentRef);
    updateRuntimePanel(documentRef, state);
    state.brushCursorPreview?.scheduleRefresh();
  }
}

function rollbackCanvasToolStroke(state, kind) {
  const editState = state[`${kind}Edit`];
  const stroke = editState?.activeStroke;
  if (!stroke) return false;
  if (kind === "height") cancelScheduledHeightBrush(state, state.renderer?.canvas?.ownerDocument);
  editState.activeStroke = null;
  releasePointer(state.renderer?.canvas, stroke.pointerId);
  if (!stroke.originals?.size || !state.map) return false;
  if (kind === "suitability") {
    const changes = buildSuitabilityStrokeChanges(state.map, stroke.originals);
    if (!changes.length) return false;
    restoreSuitabilityPreview(state.map, changes);
    state.editRefreshScheduler?.run(SUITABILITY_PREVIEW_EFFECTS);
    state.suitabilityEdit.preview = null;
    state.panels.biome?.updateSuitability({preview: null});
    return true;
  }
  const restored = restoreCanvasToolStrokePreview(state.map, kind, stroke);
  if (!restored.restoredGridCells) return false;
  if (kind === "height") state.editRefreshScheduler?.run(EDIT_REFRESH_PRESETS.HEIGHT_BRUSH_PREVIEW);
  else if (kind === "state") state.editRefreshScheduler?.run(STATE_BRUSH_PREVIEW_EFFECTS);
  else if (kind === "province") state.editRefreshScheduler?.run(PROVINCE_BRUSH_PREVIEW_EFFECTS);
  else if (kind === "biome") {
    state.editRefreshScheduler?.run(BIOME_ASSIGNMENT_PREVIEW_EFFECTS);
    state.biomeEdit.preview = null;
    state.panels.biome?.updateAssignment({preview: null});
  }
  else state.editRefreshScheduler?.run(SOCIAL_ASSIGNMENT_PREVIEW_EFFECTS);
  return true;
}

function previewFeatureTopologyDraft(state, draft = {}) {
  const gridCells = [...new Set((draft.gridCells || []).map(Number).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < (state.map?.grid?.cells?.h?.length || 0)))].sort((a, b) => a - b);
  if (!gridCells.length || !state.map) {
    state.renderer?.clearHeightTransformPreview?.({draw: false});
    state.renderer?.clearHeightCellSelection?.();
    return 0;
  }
  const fillHeight = [FEATURE_TOPOLOGY_MODE.RECLAIM_COAST, FEATURE_TOPOLOGY_MODE.CLOSE_STRAIT].includes(draft.mode) ? 20 : 19;
  const changes = gridCells.map(gridCell => {
    const before = Number(state.map.grid.cells.h[gridCell]);
    return {gridCell, before, after: fillHeight};
  });
  state.renderer?.setHeightTransformPreview?.(changes, {draw: false});
  state.renderer?.setHeightCellSelection?.(gridCells);
  return gridCells.length;
}

function clearFeatureTopologyPreview(state) {
  state.renderer?.clearHeightTransformPreview?.({draw: false});
  state.renderer?.clearHeightCellSelection?.();
}

function startMeasurementMode(state, documentRef, {status = "已进入测量模式。"} = {}) {
  enterCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MEASUREMENT_DRAW);
  if (status) setFileOperationStatus(documentRef, status);
}

function stopMeasurementMode(state, documentRef, reason = "toggle-off") {
  cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MEASUREMENT_DRAW, reason);
}

function bindMeasurementTool(canvas, state, documentRef) {
  const toggle = documentRef.getElementById("toggle-measurement");
  const clear = documentRef.getElementById("measurement-clear");
  const undo = documentRef.getElementById("measurement-undo");
  const exportButton = documentRef.getElementById("measurement-export");
  const saveButton = documentRef.getElementById("measurement-save");
  const objectsButton = documentRef.getElementById("measurement-objects");
  const routeFitButton = documentRef.getElementById("measurement-route-fit");
  const drawModeButton = documentRef.getElementById("measurement-draw-mode");
  const smoothCloseButton = documentRef.getElementById("measurement-smooth-close");
  toggle?.addEventListener("click", () => {
    if (state.measurement.active) stopMeasurementMode(state, documentRef);
    else startMeasurementMode(state, documentRef, {status: ""});
  });
  clear?.addEventListener("click", () => {
    cancelMeasurementDrag(state, documentRef);
    state.measurement.points = [];
    state.measurement.editingMeasurementId = null;
    state.measurement.sampling = {...state.measurement.sampling, rawPointCount: 0};
    state.measurement.notice = "";
    updateMeasurementOverlay(state, documentRef);
  });
  undo?.addEventListener("click", () => undoMeasurementPoint(state, documentRef));
  exportButton?.addEventListener("click", () => exportMeasurement(state, documentRef));
  saveButton?.addEventListener("click", () => saveCurrentMeasurement(state, documentRef));
  objectsButton?.addEventListener("click", () => state.panels.measurement?.open(state.map, state.editHistory.getStats()));
  routeFitButton?.addEventListener("click", () => {
    state.measurement.routeFit = measurementRouteFitActive(state) ? MEASUREMENT_ROUTE_FIT_NONE : MEASUREMENT_ROUTE_FIT_ROADS;
    state.measurement.sampling = {...state.measurement.sampling, mode: measurementRouteFitActive(state) ? "click" : state.measurement.drawMode === MEASUREMENT_DRAW_CURVE ? "continuous" : "click", rawPointCount: 0};
    state.measurement.notice = "";
    updateMeasurementOverlay(state, documentRef);
  });
  drawModeButton?.addEventListener("click", () => {
    if (measurementRouteFitActive(state)) return;
    const modes = [MEASUREMENT_DRAW_AREA, MEASUREMENT_DRAW_RULER, MEASUREMENT_DRAW_CURVE];
    const current = modes.indexOf(state.measurement.drawMode);
    state.measurement.drawMode = modes[(current + 1) % modes.length];
    state.measurement.closed = state.measurement.drawMode === MEASUREMENT_DRAW_AREA;
    state.measurement.smooth = state.measurement.drawMode === MEASUREMENT_DRAW_CURVE;
    state.measurement.sampling = {...state.measurement.sampling, mode: state.measurement.drawMode === MEASUREMENT_DRAW_CURVE ? "continuous" : "click", rawPointCount: 0};
    state.measurement.notice = "";
    updateMeasurementOverlay(state, documentRef);
  });
  smoothCloseButton?.addEventListener("click", () => {
    if (measurementRouteFitActive(state) || state.measurement.drawMode === MEASUREMENT_DRAW_RULER) return;
    if (state.measurement.drawMode === MEASUREMENT_DRAW_CURVE) {
      state.measurement.closed = !state.measurement.closed;
      state.measurement.smooth = true;
    } else {
      state.measurement.closed = true;
      state.measurement.smooth = !state.measurement.smooth;
    }
    state.measurement.notice = "";
    updateMeasurementOverlay(state, documentRef);
  });

  canvas.addEventListener("pointerdown", event => {
    if (!state.measurement.active || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const continuous = measurementContinuousSamplingActive(state);
    const measurementPoint = continuous ? measurementPointFromPointer(state, documentRef, event) : null;
    if (continuous && !measurementPoint) return;
    const sampling = state.measurement.sampling || {};
    state.measurement.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      continuous,
      strokeStartIndex: state.measurement.points.length,
      rawPointCount: continuous ? 1 : 0,
      simplifyTolerance: continuous ? measurementPixelDistanceInWorld(state, event, 2) : 0,
      minDistancePx: Math.max(1, Number(sampling.minDistancePx) || 4)
    };
    if (measurementPoint) {
      state.measurement.points.push(measurementPoint);
      updateMeasurementOverlay(state, documentRef);
    }
    capturePointer(canvas, event.pointerId);
  }, true);

  canvas.addEventListener("pointermove", event => {
    const pointer = state.measurement.pointer;
    if (!state.measurement.active || !pointer || pointer.id !== event.pointerId) return;
    if (pointer.continuous) {
      if (Math.hypot(event.clientX - pointer.lastX, event.clientY - pointer.lastY) >= pointer.minDistancePx) {
        const point = measurementPointFromPointer(state, documentRef, event);
        if (point) {
          state.measurement.points.push(point);
          pointer.lastX = event.clientX;
          pointer.lastY = event.clientY;
          pointer.rawPointCount++;
          pointer.moved = true;
          updateMeasurementOverlay(state, documentRef);
        }
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
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
    if (pointer.continuous) {
      finishContinuousMeasurementStroke(state, pointer, event, documentRef);
      return;
    }
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
    if (pointer.continuous) state.measurement.points.splice(pointer.strokeStartIndex);
    state.measurement.pointer = null;
    releasePointer(canvas, event.pointerId);
    updateMeasurementOverlay(state, documentRef);
  }, true);
}

function measurementContinuousSamplingActive(state) {
  return !measurementRouteFitActive(state) && state.measurement.drawMode === MEASUREMENT_DRAW_CURVE;
}

function finishContinuousMeasurementStroke(state, pointer, event, documentRef) {
  if (Math.hypot(event.clientX - pointer.lastX, event.clientY - pointer.lastY) >= 1) {
    const point = measurementPointFromPointer(state, documentRef, event);
    if (point) {
      state.measurement.points.push(point);
      pointer.rawPointCount++;
    }
  }
  const start = pointer.strokeStartIndex;
  const rawPoints = state.measurement.points.slice(start);
  const simplified = simplifyMeasurementPoints(rawPoints, pointer.simplifyTolerance, {closed: false});
  state.measurement.points.splice(start, rawPoints.length, ...simplified);
  state.measurement.sampling = {
    mode: "continuous",
    minDistancePx: pointer.minDistancePx,
    simplifyTolerance: roundMeasurementExport(pointer.simplifyTolerance),
    rawPointCount: pointer.rawPointCount,
    segmentsPerSpan: Math.max(2, Number(state.measurement.sampling?.segmentsPerSpan) || 6)
  };
  state.measurement.notice = `连续采样 ${pointer.rawPointCount} 点，简化为 ${simplified.length} 点`;
  updateMeasurementOverlay(state, documentRef);
}

function measurementPixelDistanceInWorld(state, event, pixels) {
  if (!state.renderer) return Number(pixels) || 0;
  const start = state.renderer.screenToWorld(event.clientX, event.clientY);
  const end = state.renderer.screenToWorld(event.clientX + pixels, event.clientY);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return Number.isFinite(distance) && distance > 0 ? distance : Number(pixels) || 0;
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
  const drawModeButton = documentRef.getElementById("measurement-draw-mode");
  const smoothCloseButton = documentRef.getElementById("measurement-smooth-close");
  const toggle = documentRef.getElementById("toggle-measurement");
  const canvas = documentRef.getElementById("map-canvas");
  if (!overlay || !svg || !readout || !summary || !clear || !undo || !exportButton || !saveButton || !routeFitButton || !drawModeButton || !smoothCloseButton || !toggle || !canvas) return;

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
  routeFitButton.title = measurementRouteFitActive(state) ? "点击道路附近添加测量点" : "自由折线、曲线或面积测量";
  const drawMode = activeMeasurementDrawMode(state);
  const closed = activeMeasurementClosed(state);
  drawModeButton.disabled = measurementRouteFitActive(state);
  drawModeButton.classList.toggle("active", drawMode === MEASUREMENT_DRAW_CURVE);
  drawModeButton.setAttribute("aria-pressed", drawMode === MEASUREMENT_DRAW_CURVE ? "true" : "false");
  drawModeButton.textContent = measurementDrawModeLabel(drawMode);
  drawModeButton.title = measurementRouteFitActive(state) ? "贴路模式固定使用路线尺" : "切换面积尺、折线尺和连续采样曲线尺";
  smoothCloseButton.disabled = measurementRouteFitActive(state) || drawMode === MEASUREMENT_DRAW_RULER;
  smoothCloseButton.classList.toggle("active", Boolean(state.measurement.smooth && closed));
  smoothCloseButton.setAttribute("aria-pressed", state.measurement.smooth && closed ? "true" : "false");
  smoothCloseButton.textContent = measurementClosureLabel(state, drawMode, closed);
  smoothCloseButton.title = drawMode === MEASUREMENT_DRAW_AREA ? "切换直线闭合或平滑闭合" : "切换开放曲线或平滑闭合曲线";
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
  if (closed && screenPoints.length >= 3) {
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
  const distance = measurementDistance(displayPoints, {closed});
  const area = closed && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0;
  const notice = state.measurement.notice ? `${state.measurement.notice} / ` : "";
  summary.textContent = `${notice}${measurementSummary(points.length, distance, area, units, editingMeasurementLabel(state), measurementDrawModeLabel(drawMode))}`;
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
    const shapeClass = baseClass => measurementShapeClass(baseClass, state.renderer.objectHighlights, state.renderer.locateFlash, item.id);
    const displayPoints = measurementDisplayPoints(item, state.map);
    const screenPoints = displayPoints.map(point => state.renderer.worldToScreen(point.x, point.y, rect));
    if (screenPoints.length === 1 || item.type === "point") {
      const point = screenPoints[0];
      if (!point) continue;
      const circle = documentRef.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", shapeClass("measurement-object-point"));
      circle.dataset.measurementObject = String(item.id || "");
      circle.setAttribute("cx", roundMeasurementDisplay(point.x));
      circle.setAttribute("cy", roundMeasurementDisplay(point.y));
      circle.setAttribute("r", "4.8");
      svg.append(circle);
      continue;
    }
    if (screenPoints.length >= 3 && normalizeMeasurementRouteFit(item.routeFit) !== MEASUREMENT_ROUTE_FIT_ROADS && (item.closed || item.type === "polygon")) {
      const polygon = documentRef.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("class", shapeClass("measurement-object-area"));
      polygon.dataset.measurementObject = String(item.id || "");
      polygon.setAttribute("points", screenPoints.map(point => `${roundMeasurementDisplay(point.x)},${roundMeasurementDisplay(point.y)}`).join(" "));
      svg.append(polygon);
    }
    const polyline = documentRef.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("class", shapeClass("measurement-object-path"));
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

function activeMeasurementDrawMode(state) {
  return measurementRouteFitActive(state) ? MEASUREMENT_DRAW_ROUTE : state.measurement.drawMode || MEASUREMENT_DRAW_AREA;
}

function activeMeasurementClosed(state) {
  return !measurementRouteFitActive(state) && state.measurement.points?.length >= 3 && Boolean(state.measurement.closed);
}

function activeMeasurementObjectOptions(state) {
  const routeFit = normalizeMeasurementRouteFit(state.measurement.routeFit);
  const drawMode = activeMeasurementDrawMode(state);
  return {
    routeFit,
    drawMode,
    closed: activeMeasurementClosed(state),
    smooth: routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? false : Boolean(state.measurement.smooth),
    sampling: {
      ...(state.measurement.sampling || {}),
      mode: drawMode === MEASUREMENT_DRAW_CURVE ? "continuous" : "click",
      rawPointCount: Math.max(state.measurement.points?.length || 0, Number(state.measurement.sampling?.rawPointCount) || 0)
    }
  };
}

function measurementDrawModeLabel(drawMode) {
  if (drawMode === MEASUREMENT_DRAW_ROUTE) return "路线尺";
  if (drawMode === MEASUREMENT_DRAW_CURVE) return "曲线尺";
  if (drawMode === MEASUREMENT_DRAW_RULER) return "折线尺";
  return "面积尺";
}

function measurementClosureLabel(state, drawMode, closed) {
  if (drawMode === MEASUREMENT_DRAW_ROUTE) return "路线开放";
  if (drawMode === MEASUREMENT_DRAW_RULER) return "开放折线";
  if (drawMode === MEASUREMENT_DRAW_CURVE) return closed ? "平滑闭合" : "开放曲线";
  return state.measurement.smooth ? "平滑闭合" : "直线闭合";
}

function activeMeasurementDisplayPoints(state) {
  const points = state.measurement.points || [];
  const routeFit = normalizeMeasurementRouteFit(state.measurement.routeFit);
  const cellStops = routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? normalizeMeasurementCellStops([], points, points) : [];
  return measurementDisplayPoints({
    points,
    routeFit,
    cellStops,
    drawMode: activeMeasurementDrawMode(state),
    closed: activeMeasurementClosed(state),
    smooth: Boolean(state.measurement.smooth),
    sampling: state.measurement.sampling
  }, state.map);
}

function exportMeasurement(state, documentRef) {
  if (!state.map || !state.measurement.points?.length) return;
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const options = activeMeasurementObjectOptions(state);
  const {routeFit, drawMode, closed, smooth, sampling} = options;
  const cellStops = routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? normalizeMeasurementCellStops([], state.measurement.points, state.measurement.points) : [];
  const points = state.measurement.points.map((point, index) => ({
    index,
    x: roundMeasurementExport(point.x),
    y: roundMeasurementExport(point.y)
  }));
  const displayPoints = measurementDisplayPoints({points: state.measurement.points, routeFit, cellStops, drawMode, closed, smooth, sampling}, state.map);
  const distance = measurementDistance(displayPoints, {closed});
  const area = closed && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0;
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
      drawMode,
      closed,
      smooth,
      sampling,
      routeStopCount: cellStops.filter(Boolean).length
    },
    units: {
      distanceUnit: units.distanceUnit,
      areaUnit: units.areaUnit,
      mapScaleKmPerCm: units.mapScaleKmPerCm,
      customUnits: units.customUnits
    },
    summary: {
      distanceMapUnits: roundMeasurementExport(distance),
      distanceLabel: formatDisplayDistance(distance, units),
      areaMapUnits: roundMeasurementExport(area),
      areaLabel: area ? formatDisplayArea(area, units) : ""
    },
    points,
    cellStops,
    drawMode,
    closed,
    smooth,
    sampling
  };
  downloadText(documentRef, JSON.stringify(payload, null, 2), `${mapFileBaseName(state.map)}.measurement.json`, "application/json;charset=utf-8");
}

function saveCurrentMeasurement(state, documentRef) {
  if (!state.map || !state.measurement.points?.length) return;
  const context = {map: state.map};
  const options = activeMeasurementObjectOptions(state);
  if (state.measurement.editingMeasurementId) {
    const measurementId = state.measurement.editingMeasurementId;
    const command = createUpdateMeasurementPointsCommand(measurementId, state.measurement.points, options);
    const result = executeEditCommand(state, documentRef, command, {
      context,
      noopStatus: "测量对象没有可保存的形状变化，或点数不足。",
      preparePanelRefresh: targetState => {
        targetState.measurement.editingMeasurementId = null;
        targetState.measurement.points = [];
        targetState.measurement.sampling = {...targetState.measurement.sampling, rawPointCount: 0};
        targetState.panels.measurement?.setSelectedMeasurementId?.(measurementId);
      }
    });
    if (!result.executed) return;
    cancelMeasurementDrag(state, documentRef);
    updateMeasurementOverlay(state, documentRef);
    setFileOperationStatus(documentRef, `已更新测量对象 ${measurementId}。`);
    return;
  }

  const command = createSaveMeasurementCommand(state.measurement.points, options);
  const result = executeEditCommand(state, documentRef, command, {
    context,
    noopStatus: "至少需要 2 个测量点才能保存。",
    preparePanelRefresh: (targetState, executed, created) => {
      targetState.measurement.points = [];
      targetState.measurement.sampling = {...targetState.measurement.sampling, rawPointCount: 0};
      targetState.panels.measurement?.setSelectedMeasurementId?.(created?.id);
    }
  });
  if (!result.executed) return;
  const created = result.result;
  cancelMeasurementDrag(state, documentRef);
  updateMeasurementOverlay(state, documentRef);
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
  state.measurement.drawMode = item.drawMode || (item.closed ? MEASUREMENT_DRAW_AREA : MEASUREMENT_DRAW_RULER);
  state.measurement.closed = Boolean(item.closed);
  state.measurement.smooth = Boolean(item.smooth);
  state.measurement.sampling = {...state.measurement.sampling, ...(item.sampling || {}), rawPointCount: item.sampling?.rawPointCount || item.points.length};
  startMeasurementMode(state, documentRef, {status: ""});
  state.panels.measurement?.setSelectedMeasurementId?.(item.id);
  locateMeasurement(state, {...row, points: item.points}, documentRef);
  updateMeasurementOverlay(state, documentRef);
  setFileOperationStatus(documentRef, `正在编辑测量对象 ${item.name || item.id}，拖动、插入或删除节点后可保存修改。`);
}

function locateMeasurement(state, row, documentRef) {
  const object = measurementObject(row);
  const locate = () => locateMeasurementBounds(state, row);
  if (typeof state.locateAndSelectObject === "function") {
    return state.locateAndSelectObject("measurement-panel", object, {
      locate,
      afterSelect: () => state.panels.measurement?.setSelectedMeasurementId?.(row.id)
    });
  }
  const located = locate();
  if (located) state.selectionStore?.setSelection({object});
  refreshRuntimeAndPickPanels(documentRef, state);
  return located;
}

function locateMeasurementBounds(state, row, options = {}) {
  const bounds = measurementBounds(row, 48, state.map);
  return bounds ? state.renderer.locateBounds(bounds, {
    status: `measurement ${row.id}`,
    padding: options.padding,
    minScale: options.minScale ?? (row.pointCount <= 2 ? 2.2 : 1.4),
    maxScale: options.maxScale ?? 18
  }) : false;
}

function measurementObject(row) {
  return measurementHighlightObject(row);
}

function exportMeasurementObjects(state, documentRef, rows, exportAction = state.runtimeActions?.data?.exportMeasurements) {
  try {
    const measurementIds = (rows || []).map(row => String(row?.id || "")).filter(Boolean);
    const result = exportAction({measurementIds, download: true, includeText: false});
    setFileOperationStatus(documentRef, `测量对象已导出，共 ${result.metadata.measurements} 条。`);
    return result;
  } catch (error) {
    reportFileOperationError(documentRef, "测量对象导出失败", error);
    return null;
  }
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

function measurementSummary(pointCount, distance, area, units, editingLabel = "", modeLabel = "") {
  const prefix = editingLabel ? `编辑 ${editingLabel} / ` : "";
  const mode = modeLabel ? `${modeLabel} / ` : "";
  if (pointCount === 0) return `${prefix}${mode}${modeLabel === "曲线尺" ? "按住并拖动地图连续采样" : "点击地图添加起点"}`;
  if (pointCount === 1) return `${prefix}${mode}${modeLabel === "曲线尺" ? "继续拖动采样曲线" : "继续点击添加测量点"}`;
  const distanceText = `${mode}${pointCount} 点 / 总长 ${formatDisplayDistance(distance, units)}`;
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
    const brush = state.panels.height?.getBrush();
    if (!brush?.active || !state.map) return;
    if (!isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.heightEdit.terrainSelectionBox) {
      handleHeightSelectionBoxClick(state, event, documentRef);
      return;
    }
    if (state.heightEdit.terrainSelectionPoint) {
      handleHeightSelectionPointClick(state, event, documentRef);
      return;
    }
    if (state.heightEdit.terrainSelectionPaintPending) {
      startHeightSelectionPaint(state, event, documentRef, canvas);
      return;
    }
    clearHeightTransformPreview(state);
    if (brush.action === "line") {
      handleHeightLineClick(state, event, brush, documentRef);
      return;
    }
    if (brush.action === "fill") {
      state.heightEdit.fillHoverCell = null;
      state.heightEdit.fillPreview = null;
    }
    state.heightEdit.activeStroke = {
      pointerId: event.pointerId,
      originals: new Map(),
      seed: ++state.heightEdit.strokeSeed,
      iteration: 0
    };
    capturePointer(canvas, event.pointerId);
    applyHeightBrushAtEvent(state, event, documentRef);
  }, true);

  canvas.addEventListener("pointermove", event => {
    const brush = state.panels.height?.getBrush();
    if (state.heightEdit.terrainSelectionPaint?.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      scheduleHeightSelectionPaintAtEvent(state, event, documentRef);
      return;
    }
    if (!state.heightEdit.activeStroke && brush?.active) {
      state.pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
      updatePickPanel(documentRef, state);
    }
    if (state.heightEdit.terrainSelectionBox?.start) {
      updateHeightSelectionBoxPreview(documentRef, state.heightEdit.terrainSelectionBox.start, event.clientX, event.clientY);
      return;
    }
    if (!state.heightEdit.activeStroke && brush?.active && brush.action === "fill") {
      updateHeightFillPreviewAtEvent(state, event, brush, documentRef);
      return;
    }
    if (!state.heightEdit.activeStroke && brush?.active && brush.action === "line" && state.heightEdit.lineStart) {
      updateHeightLinePreview(documentRef, state.heightEdit.lineStart, event.clientX, event.clientY);
      return;
    }
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    scheduleHeightBrushAtEvent(state, event, documentRef);
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (state.heightEdit.terrainSelectionPaint?.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      flushScheduledHeightSelectionPaint(state, documentRef, event);
      finishHeightSelectionPaint(state, documentRef);
      releasePointer(canvas, event.pointerId);
      return;
    }
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    flushScheduledHeightBrush(state, documentRef, event);
    finishHeightStroke(state, documentRef);
    releasePointer(canvas, event.pointerId);
    updateHeightPanel(state);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (state.heightEdit.terrainSelectionPaint?.pointerId === event.pointerId) {
      cancelScheduledHeightSelectionPaint(state, documentRef);
      cancelHeightSelectionPaint(state);
      releasePointer(canvas, event.pointerId);
      updateHeightPanel(state);
      updateEditingInteractionLock(state, documentRef);
      return;
    }
    if (!state.heightEdit.activeStroke || state.heightEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelScheduledHeightBrush(state, documentRef);
    rollbackCanvasToolStroke(state, "height");
    releasePointer(canvas, event.pointerId);
    updateHeightPanel(state);
  }, true);

  canvas.addEventListener("pointerleave", () => {
    const brush = state.panels.height?.getBrush();
    if (!state.heightEdit.activeStroke && brush?.active) {
      state.pick = null;
      updatePickPanel(documentRef, state);
    }
    if (state.heightEdit.activeStroke || !brush?.active || brush.action !== "fill") return;
    state.heightEdit.fillHoverCell = null;
    state.heightEdit.fillPreview = null;
    state.panels.height?.updateFillPreview?.(null);
  }, true);
}

function updateHeightFillPreviewAtEvent(state, event, brush, documentRef) {
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  state.pick = pick;
  updatePickPanel(documentRef, state);
  const gridCell = Number.isInteger(pick?.gridCell) && pick.gridCell >= 0 ? pick.gridCell : null;
  if (state.heightEdit.fillHoverCell === gridCell) return;
  state.heightEdit.fillHoverCell = gridCell;
  state.heightEdit.fillPreview = inspectHeightFillTarget(state.map, gridCell, brush);
  state.panels.height?.updateFillPreview?.(state.heightEdit.fillPreview);
}

function handleHeightLineClick(state, event, brush, documentRef) {
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const start = state.heightEdit.lineStart;
  if (!start) {
    state.heightEdit.lineStart = {point, clientX: event.clientX, clientY: event.clientY};
    state.heightEdit.lastNotice = "已选择线段起点，移动指针预览并单击终点。";
    updateHeightLinePreview(documentRef, state.heightEdit.lineStart, event.clientX, event.clientY);
    updateHeightPanel(state, {includeMapSummary: false});
    return;
  }

  const stroke = {originals: new Map()};
  const changes = getHeightLineChanges(state.map, start.point, point, brush, stroke);
  cancelHeightLine(state, documentRef);
  state.heightEdit.lastNotice = stroke.notice || "";
  if (!changes.length) {
    state.heightEdit.lastAffected = 0;
    state.heightEdit.lastHeight = "none";
    state.heightEdit.lastDelta = "none";
    updateHeightPanel(state, {includeMapSummary: false});
    return;
  }

  state.heightEdit.lastAffected = changes.length;
  state.heightEdit.lastHeight = summarizeChangedHeights(changes);
  state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
  const label = Number(brush.linePower) < 0 ? "线段沟槽" : "线段山脊";
  executeEditCommand(state, documentRef, createApplyHeightBrushCommand(changes, {label}), {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    refreshPanels: false
  });
  updateHeightPanel(state, {includeMapSummary: false});
}

function updateHeightLinePreview(documentRef, start, clientX, clientY) {
  const stage = documentRef.querySelector(".map-stage");
  if (!stage || !start) return;
  let line = stage.querySelector(".height-line-preview");
  if (!line) {
    line = documentRef.createElement("div");
    line.className = "height-line-preview";
    stage.append(line);
  }
  const rect = stage.getBoundingClientRect();
  const x1 = start.clientX - rect.left;
  const y1 = start.clientY - rect.top;
  const x2 = clientX - rect.left;
  const y2 = clientY - rect.top;
  line.style.left = `${x1}px`;
  line.style.top = `${y1}px`;
  line.style.width = `${Math.hypot(x2 - x1, y2 - y1)}px`;
  line.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
}

function handleHeightSelectionBoxClick(state, event, documentRef) {
  const pending = state.heightEdit.terrainSelectionBox;
  if (!pending) return;
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  if (!pending.start) {
    pending.start = {point, clientX: event.clientX, clientY: event.clientY};
    state.heightEdit.lastNotice = "已选择矩形起角，移动指针预览并单击对角。";
    updateHeightSelectionBoxPreview(documentRef, pending.start, event.clientX, event.clientY);
    updateHeightPanel(state);
    updateEditingInteractionLock(state, documentRef);
    return;
  }
  const selection = composeHeightCellSelection(state.map, state.heightEdit.terrainSelection?.cellIds, {
    ...pending.request,
    fromPoint: pending.start.point,
    toPoint: point
  });
  cancelHeightSelectionBox(state, documentRef);
  if (!selection.summary.valid) {
    state.heightEdit.lastNotice = selection.summary.notice;
    updateHeightPanel(state);
    updateEditingInteractionLock(state, documentRef);
    return;
  }
  const summary = commitHeightTerrainSelection(state, selection);
  state.heightEdit.lastNotice = summary.notice;
  updateHeightPanel(state);
  updateEditingInteractionLock(state, documentRef);
}

function handleHeightSelectionPointClick(state, event, documentRef) {
  const pending = state.heightEdit.terrainSelectionPoint;
  if (!pending) return;
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  const selection = composeHeightCellSelection(state.map, state.heightEdit.terrainSelection?.cellIds, {
    ...pending.request,
    centerCell: pick?.gridCell
  });
  cancelHeightSelectionPoint(state);
  if (!selection.summary.valid) {
    state.heightEdit.lastNotice = selection.summary.notice;
    updateHeightPanel(state);
    updateEditingInteractionLock(state, documentRef);
    return;
  }
  state.pick = pick;
  updatePickPanel(documentRef, state);
  const summary = commitHeightTerrainSelection(state, selection);
  state.heightEdit.lastNotice = summary.notice;
  updateHeightPanel(state);
  updateEditingInteractionLock(state, documentRef);
}

function startHeightSelectionPaint(state, event, documentRef, canvas) {
  const pending = state.heightEdit.terrainSelectionPaintPending;
  if (!pending) return;
  state.heightEdit.terrainSelectionPaintPending = null;
  state.heightEdit.terrainSelectionPaint = {
    request: pending.request,
    pointerId: event.pointerId,
    candidateCellIds: new Set(),
    stampCount: 0,
    lastCenterCell: null,
    lastCenterPoint: null,
    previewSelection: null,
    invalidNotice: ""
  };
  capturePointer(canvas, event.pointerId);
  applyHeightSelectionPaintAtEvent(state, event, documentRef);
  updateEditingInteractionLock(state, documentRef);
}

function scheduleHeightSelectionPaintAtEvent(state, event, documentRef) {
  state.heightEdit.pendingSelectionPaintPointer = {pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY};
  if (state.heightEdit.selectionPaintFrame) return;
  const view = documentRef.defaultView;
  const run = () => {
    state.heightEdit.selectionPaintFrame = 0;
    const pointer = state.heightEdit.pendingSelectionPaintPointer;
    state.heightEdit.pendingSelectionPaintPointer = null;
    if (!pointer || state.heightEdit.terrainSelectionPaint?.pointerId !== pointer.pointerId) return;
    applyHeightSelectionPaintAtEvent(state, pointer, documentRef);
  };
  state.heightEdit.selectionPaintFrame = typeof view?.requestAnimationFrame === "function" ? view.requestAnimationFrame(run) : view?.setTimeout?.(run, 0) || 0;
}

function flushScheduledHeightSelectionPaint(state, documentRef, finalPointer = null) {
  const pointer = state.heightEdit.pendingSelectionPaintPointer;
  cancelScheduledHeightSelectionPaint(state, documentRef);
  const resolvedPointer = finalPointer && state.heightEdit.terrainSelectionPaint?.pointerId === finalPointer.pointerId ? finalPointer : pointer;
  if (resolvedPointer && state.heightEdit.terrainSelectionPaint?.pointerId === resolvedPointer.pointerId) applyHeightSelectionPaintAtEvent(state, resolvedPointer, documentRef);
}

function cancelScheduledHeightSelectionPaint(state, documentRef) {
  const frame = state.heightEdit.selectionPaintFrame;
  const view = documentRef?.defaultView;
  if (frame && typeof view?.cancelAnimationFrame === "function") view.cancelAnimationFrame(frame);
  else if (frame) view?.clearTimeout?.(frame);
  state.heightEdit.selectionPaintFrame = 0;
  state.heightEdit.pendingSelectionPaintPointer = null;
}

function applyHeightSelectionPaintAtEvent(state, event, documentRef) {
  const active = state.heightEdit.terrainSelectionPaint;
  if (!active) return;
  const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  state.pick = pick;
  updatePickPanel(documentRef, state);
  const gridCell = Number.isInteger(pick?.gridCell) && pick.gridCell >= 0 ? pick.gridCell : null;
  const centerPoint = state.renderer.screenToWorld(event.clientX, event.clientY);
  if (gridCell === null || !Number.isFinite(centerPoint?.x) || !Number.isFinite(centerPoint?.y)) return;
  if (active.lastCenterPoint && Math.hypot(centerPoint.x - active.lastCenterPoint.x, centerPoint.y - active.lastCenterPoint.y) < 0.01) return;
  active.lastCenterCell = gridCell;
  active.lastCenterPoint = centerPoint;
  const stamp = createHeightCursorRadiusSelection(state.map, gridCell, {
    scope: active.request.scope,
    radius: active.request.radius,
    centerPoint
  });
  if (!stamp.summary.valid) {
    active.invalidNotice = stamp.summary.notice;
    state.heightEdit.lastNotice = stamp.summary.notice;
    updateHeightPanel(state, {includeMapSummary: false});
    return;
  }
  const previousCount = active.candidateCellIds.size;
  for (const cellId of stamp.cellIds) active.candidateCellIds.add(cellId);
  if (active.candidateCellIds.size === previousCount) return;
  active.stampCount += 1;
  const selection = composeHeightCellSelection(state.map, state.heightEdit.terrainSelection?.cellIds, {
    ...active.request,
    candidateCellIds: active.candidateCellIds,
    stampCount: active.stampCount
  });
  if (!selection.summary.valid) {
    active.previewSelection = null;
    active.invalidNotice = selection.summary.notice;
    restoreHeightTerrainSelectionBuffer(state);
    state.heightEdit.lastNotice = selection.summary.notice;
    updateHeightPanel(state, {includeMapSummary: false});
    return;
  }
  active.previewSelection = selection;
  active.invalidNotice = "";
  const feather = createHeightCellSelectionFeather(state.map, selection.cellIds, {rings: state.heightEdit.terrainSelectionFeather});
  const rendererPreview = state.renderer?.setHeightCellSelection?.(selection.cellIds, {weights: feather.summary.valid ? feather.weights : null}) || null;
  state.heightEdit.lastNotice = `画笔选区预览 ${selection.summary.count} cells（${active.stampCount} stamps${rendererPreview ? ` / GPU ${rendererPreview.triangleCount} triangles` : ""}）。`;
  updateHeightPanel(state, {includeMapSummary: false});
}

function finishHeightSelectionPaint(state, documentRef) {
  const active = state.heightEdit.terrainSelectionPaint;
  state.heightEdit.terrainSelectionPaint = null;
  state.brushCursorPreview?.clear();
  if (!active?.previewSelection?.summary.valid || active.invalidNotice) {
    restoreHeightTerrainSelectionBuffer(state);
    state.heightEdit.lastNotice = active?.invalidNotice || "画笔没有形成有效选区，未提交。";
    updateHeightPanel(state);
    updateEditingInteractionLock(state, documentRef);
    return false;
  }
  const summary = commitHeightTerrainSelection(state, active.previewSelection);
  state.heightEdit.lastNotice = summary.notice;
  updateHeightPanel(state);
  updateEditingInteractionLock(state, documentRef);
  return true;
}

function updateHeightSelectionBoxPreview(documentRef, start, clientX, clientY) {
  const stage = documentRef.querySelector(".map-stage");
  if (!stage || !start) return;
  let box = stage.querySelector(".height-selection-box-preview");
  if (!box) {
    box = documentRef.createElement("div");
    box.className = "height-selection-box-preview";
    stage.append(box);
  }
  const rect = stage.getBoundingClientRect();
  const x1 = start.clientX - rect.left;
  const y1 = start.clientY - rect.top;
  const x2 = clientX - rect.left;
  const y2 = clientY - rect.top;
  box.style.left = `${Math.min(x1, x2)}px`;
  box.style.top = `${Math.min(y1, y2)}px`;
  box.style.width = `${Math.abs(x2 - x1)}px`;
  box.style.height = `${Math.abs(y2 - y1)}px`;
}

function cancelHeightSelectionBox(state, documentRef) {
  state.heightEdit.terrainSelectionBox = null;
  documentRef.querySelector(".height-selection-box-preview")?.remove();
}

function cancelHeightSelectionPoint(state) {
  state.heightEdit.terrainSelectionPoint = null;
}

function cancelHeightSelectionPaint(state) {
  const active = state.heightEdit.terrainSelectionPaint;
  const hadPreview = Boolean(active?.previewSelection);
  cancelScheduledHeightSelectionPaint(state, state.renderer?.canvas?.ownerDocument);
  if (active) releasePointer(state.renderer?.canvas, active.pointerId);
  state.heightEdit.terrainSelectionPaintPending = null;
  state.heightEdit.terrainSelectionPaint = null;
  state.brushCursorPreview?.clear();
  if (hadPreview) restoreHeightTerrainSelectionBuffer(state);
}

function cancelHeightLine(state, documentRef) {
  state.heightEdit.lineStart = null;
  state.heightEdit.fillHoverCell = null;
  state.heightEdit.fillPreview = null;
  clearHeightTransformPreview(state);
  cancelHeightSelectionBox(state, documentRef);
  cancelHeightSelectionPoint(state);
  cancelHeightSelectionPaint(state);
  documentRef.querySelector(".height-line-preview")?.remove();
}

function clearHeightTransformPreview(state, {draw = true} = {}) {
  state.panels.height?.updateConditionalTransformPreview?.(null);
  state.panels.height?.updateGlobalToolPreview?.(null);
  state.panels.height?.updateTerrainTemplatePreview?.(null);
  state.panels.height?.updateTerrainProgramPreview?.(null);
  state.panels.height?.updateSeafloorResetPreview?.(null);
  state.renderer?.clearHeightTransformPreview?.({draw});
}

function clearHeightTerrainSelection(state, {draw = true} = {}) {
  state.heightEdit.terrainSelection = null;
  state.panels.height?.updateTerrainSelection?.(null, false);
  state.renderer?.clearHeightCellSelection?.({draw});
}

function commitHeightTerrainSelection(state, selection, {useForTools = true, featherRings = state.heightEdit.terrainSelectionFeather} = {}) {
  clearHeightTransformPreview(state, {draw: false});
  const cellSet = createHeightCellSelectionSet(selection.cellIds);
  const feather = createHeightCellSelectionFeather(state.map, selection.cellIds, {rings: featherRings});
  const featherWeights = feather.summary.valid ? feather.weights : new Map([...cellSet].map(gridCell => [gridCell, 1]));
  const rendererSelection = state.renderer?.setHeightCellSelection?.(selection.cellIds, {weights: featherWeights}) || null;
  const summary = {...selection.summary, feather: feather.summary, rendererSelection};
  state.heightEdit.terrainSelection = {cellIds: selection.cellIds, cellSet, featherWeights, featherRings: feather.summary.rings, summary, useForTools: Boolean(useForTools)};
  state.panels.height?.updateTerrainSelection?.(summary, useForTools);
  return summary;
}

function updateHeightTerrainSelectionFeather(state, rings) {
  const selection = state.heightEdit.terrainSelection;
  if (!selection?.cellIds?.length) return null;
  const feather = createHeightCellSelectionFeather(state.map, selection.cellIds, {rings});
  if (!feather.summary.valid) return feather.summary;
  const rendererSelection = state.renderer?.setHeightCellSelection?.(selection.cellIds, {weights: feather.weights}) || null;
  selection.featherWeights = feather.weights;
  selection.featherRings = feather.summary.rings;
  selection.summary = {...selection.summary, feather: feather.summary, rendererSelection};
  state.panels.height?.updateTerrainSelection?.(selection.summary, selection.useForTools);
  return feather.summary;
}

function clearSavedHeightTerrainSelection(state) {
  state.heightEdit.terrainSelectionSaved = null;
  state.panels.height?.updateTerrainSelectionSaved?.(null);
}

function restoreHeightTerrainSelectionBuffer(state) {
  const selection = state.heightEdit.terrainSelection;
  if (selection?.cellIds?.length) return state.renderer?.setHeightCellSelection?.(selection.cellIds, {weights: selection.featherWeights}) || null;
  return state.renderer?.clearHeightCellSelection?.() || null;
}

function heightToolAllowedCells(state) {
  const selection = state.heightEdit.terrainSelection;
  if (!selection?.useForTools) return null;
  return selection.featherRings > 0 ? selection.featherWeights : selection.cellSet;
}

function heightTemplateAllowedCells(state) {
  const selection = state.heightEdit.terrainSelection;
  if (!selection) return null;
  return selection.featherRings > 0 ? selection.featherWeights : selection.cellSet;
}

function resolveHeightSelectionCenterCell(state, canvas, documentRef) {
  if (Number.isInteger(state.pick?.gridCell) && state.pick.gridCell >= 0) return state.pick.gridCell;
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  const pick = state.renderer?.pickClientPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2) || null;
  state.pick = pick;
  updatePickPanel(documentRef, state);
  return Number.isInteger(pick?.gridCell) && pick.gridCell >= 0 ? pick.gridCell : null;
}

function bindStateEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (state.stateEdit.deleteMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const stateId = getStateIdAtEvent(state, event);
      if (!Number.isInteger(stateId) || stateId <= 0) return;
      const targetDocument = canvas.ownerDocument || document;
      const result = executeDeleteWithPreflight(state, targetDocument, {
        kind: OBJECT_KIND.STATE,
        ids: [stateId],
        createCommand: id => createDeleteStateCommand(id),
        label: "画布删除国家",
        executeOptions: {
          refresh: refreshAfterStateEdit,
          preparePanelRefresh: targetState => {
            targetState.stateEdit.deleteMode = false;
            targetState.stateEdit.lastAffected = 0;
            targetState.selectionStore.clear();
            targetState.panels.state?.setTargetStateId(0);
          }
        }
      });
      if (!result.executed) return;
      completeCanvasToolMode(state, targetDocument, CANVAS_TOOL_MODE.STATE_DELETE, {command: result.execution?.command});
      return;
    }
    if (state.stateEdit.addMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
      if (!Number.isInteger(pick?.gridCell) || pick.gridCell < 0) return;
      const command = createAddStateAtCellCommand(pick.gridCell);
      const execution = executeEditCommand(state, canvas.ownerDocument || document, command, {
        context: {map: state.map},
        noopStatus: current => current.getInspection?.()?.summary || "目标 grid cell 无效或不能创建国家。",
        refresh: refreshAfterStateEdit,
        preparePanelRefresh: (targetState, executed, result) => {
          targetState.stateEdit.addMode = false;
          targetState.stateEdit.lastAffected = result?.cells || 0;
          targetState.stateEdit.sourceStateId = result?.stateId || null;
          if (!Number.isInteger(result?.stateId)) return;
          const stateObject = resolveObject(targetState.map, {kind: OBJECT_KIND.STATE, id: result.stateId}) || {kind: OBJECT_KIND.STATE, id: result.stateId};
          targetState.panels.state?.setTargetStateId(result.stateId);
          targetState.selectionStore.setSelection({object: stateObject});
        },
        throwOnError: false
      });
      if (!execution.executed) return;
      completeCanvasToolMode(state, canvas.ownerDocument || document, CANVAS_TOOL_MODE.STATE_ADD, {command: execution.command});
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
    finishStateStroke(state, documentRef);
    releasePointer(canvas, event.pointerId);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.stateEdit.activeStroke || state.stateEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rollbackCanvasToolStroke(state, "state");
    releasePointer(canvas, event.pointerId);
  }, true);
}

function bindProvinceEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (state.provinceEdit.deleteMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const provinceId = getProvinceIdAtEvent(state, event);
      if (!Number.isInteger(provinceId) || provinceId <= 0) return;
      const targetDocument = canvas.ownerDocument || document;
      const result = executeDeleteWithPreflight(state, targetDocument, {
        kind: OBJECT_KIND.PROVINCE,
        ids: [provinceId],
        createCommand: id => createDeleteProvinceCommand(id),
        label: "画布删除省份",
        executeOptions: {
          refresh: refreshAfterProvinceEdit,
          preparePanelRefresh: targetState => {
            targetState.provinceEdit.deleteMode = false;
            targetState.provinceEdit.lastAffected = 0;
            targetState.selectionStore.clear();
            targetState.panels.province?.setSelectedProvinceId(0);
          }
        }
      });
      if (!result.executed) return;
      completeCanvasToolMode(state, targetDocument, CANVAS_TOOL_MODE.PROVINCE_DELETE, {command: result.execution?.command});
      return;
    }
    if (state.provinceEdit.addMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
      if (!Number.isInteger(pick?.gridCell) || pick.gridCell < 0) return;
      const command = createAddProvinceAtCellCommand(pick.gridCell);
      const execution = executeEditCommand(state, canvas.ownerDocument || document, command, {
        context: {map: state.map},
        refresh: refreshAfterProvinceEdit,
        preparePanelRefresh: (targetState, executed, result) => {
          targetState.provinceEdit.addMode = false;
          targetState.provinceEdit.lastAffected = result?.cells || 0;
          targetState.provinceEdit.sourceProvinceId = result?.provinceId || null;
          if (!Number.isInteger(result?.provinceId)) return;
          targetState.panels.province?.setSelectedProvinceId(result.provinceId);
          targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.PROVINCE, id: result.provinceId}});
        }
      });
      if (!execution.executed) return;
      completeCanvasToolMode(state, canvas.ownerDocument || document, CANVAS_TOOL_MODE.PROVINCE_ADD, {command: execution.command});
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
    finishProvinceStroke(state, documentRef);
    releasePointer(canvas, event.pointerId);
  }, true);

  canvas.addEventListener("pointercancel", event => {
    if (!state.provinceEdit.activeStroke || state.provinceEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rollbackCanvasToolStroke(state, "province");
    releasePointer(canvas, event.pointerId);
  }, true);
}

function bindSocialAssignmentEditing(canvas, state, documentRef, kind) {
  const editState = state[`${kind}Edit`];
  const panel = () => state.panels[kind];
  canvas.addEventListener("pointerdown", event => {
    const brush = panel()?.getBrush?.();
    if (!brush?.active || !state.map || !isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    editState.activeStroke = {pointerId: event.pointerId, originals: new Map()};
    capturePointer(canvas, event.pointerId);
    applySocialAssignmentAtEvent(state, event, kind);
  }, true);
  canvas.addEventListener("pointermove", event => {
    if (!editState.activeStroke || editState.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applySocialAssignmentAtEvent(state, event, kind);
  }, true);
  canvas.addEventListener("pointerup", event => {
    if (!editState.activeStroke || editState.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishSocialAssignmentStroke(state, documentRef, kind);
    releasePointer(canvas, event.pointerId);
  }, true);
  canvas.addEventListener("pointercancel", event => {
    if (!editState.activeStroke || editState.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rollbackCanvasToolStroke(state, kind);
    releasePointer(canvas, event.pointerId);
  }, true);
}

function bindBiomeAssignmentEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    const brush = state.panels.biome?.getBrush?.();
    if (!brush?.active || !state.map || !isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const picked = state.renderer.pickClientPoint(event.clientX, event.clientY);
    const preview = inspectBiomeAssignment(state.map, brush.targetId, [picked?.gridCell], {scope: brush.scope});
    if (!preview.valid) {
      state.biomeEdit.preview = preview;
      state.panels.biome?.updateAssignment({preview});
      return;
    }
    state.biomeEdit.activeStroke = {pointerId: event.pointerId, originals: new Map()};
    capturePointer(canvas, event.pointerId);
    applyBiomeAssignmentAtEvent(state, event);
  }, true);
  canvas.addEventListener("pointermove", event => {
    if (!state.biomeEdit.activeStroke || state.biomeEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyBiomeAssignmentAtEvent(state, event);
  }, true);
  canvas.addEventListener("pointerup", event => {
    if (!state.biomeEdit.activeStroke || state.biomeEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishBiomeAssignmentStroke(state, documentRef);
    releasePointer(canvas, event.pointerId);
  }, true);
  canvas.addEventListener("pointercancel", event => {
    if (!state.biomeEdit.activeStroke || state.biomeEdit.activeStroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rollbackCanvasToolStroke(state, "biome");
    state.biomeEdit.preview = null;
    state.panels.biome?.updateAssignment({preview: null});
    releasePointer(canvas, event.pointerId);
  }, true);
}

function bindSuitabilityEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    const brush = state.panels.biome?.getSuitabilityBrush?.();
    if (!brush?.active || !state.map || !isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const picked = state.renderer.pickClientPoint(event.clientX, event.clientY);
    const preview = inspectSuitabilityEdit(state.map, [picked?.gridCell], brush);
    if (!preview.valid) {
      state.suitabilityEdit.preview = preview;
      state.panels.biome?.updateSuitability({preview});
      return;
    }
    state.suitabilityEdit.activeStroke = {pointerId: event.pointerId, originals: new Map()};
    capturePointer(canvas, event.pointerId);
    applySuitabilityAtEvent(state, event);
  }, true);
  canvas.addEventListener("pointermove", event => {
    if (state.suitabilityEdit.activeStroke?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applySuitabilityAtEvent(state, event);
  }, true);
  canvas.addEventListener("pointerup", event => {
    if (state.suitabilityEdit.activeStroke?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishSuitabilityStroke(state, documentRef);
    releasePointer(canvas, event.pointerId);
  }, true);
  canvas.addEventListener("pointercancel", event => {
    if (state.suitabilityEdit.activeStroke?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rollbackCanvasToolStroke(state, "suitability");
    releasePointer(canvas, event.pointerId);
  }, true);
}

function bindMarketAssignmentEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    const brush = state.panels.economy?.getMarketBrush?.();
    if (!brush?.active || !state.map || !isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.economyEdit.activeStroke = {pointerId: event.pointerId};
    capturePointer(canvas, event.pointerId);
    applyMarketAssignmentAtEvent(state, event);
  }, true);
  canvas.addEventListener("pointermove", event => {
    if (state.economyEdit.activeStroke?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyMarketAssignmentAtEvent(state, event);
  }, true);
  canvas.addEventListener("pointerup", event => {
    if (state.economyEdit.activeStroke?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.economyEdit.activeStroke = null;
    releasePointer(canvas, event.pointerId);
    updateMarketAssignmentPreview(state);
    updateEconomyPanel(state);
  }, true);
  canvas.addEventListener("pointercancel", event => {
    if (state.economyEdit.activeStroke?.pointerId !== event.pointerId) return;
    state.economyEdit.activeStroke = null;
    releasePointer(canvas, event.pointerId);
    updateMarketAssignmentPreview(state);
  }, true);
}

function bindCityEditing(canvas, state, documentRef) {
  state.cityEdit.dragController = bindCityRelocationDrag(canvas, {
    isActive: () => Boolean(state.cityEdit.moveMode && state.map),
    isPrimaryPointerDown,
    getCityId: event => getCityIdAtEvent(state, event),
    getSelectedCityId: () => state.cityEdit.moveCityId,
    getTarget: event => cityMoveTargetAtEvent(state, event),
    inspect: (cityId, target) => inspectCityMove(state.map, cityId, target),
    capturePointer: pointerId => capturePointer(canvas, pointerId),
    releasePointer: pointerId => releasePointer(canvas, pointerId),
    onDragChange: drag => {
      state.cityEdit.activeDrag = drag;
    },
    onPreview: preview => {
      state.cityEdit.movePreview = preview;
      state.panels.city?.updateMovePreview?.(preview);
    },
    onInvalid: preview => setFileOperationStatus(documentRef, preview.summary),
    onCancel: reason => cancelCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_MOVE, reason),
    onCommit: (cityId, target) => {
      const command = createMoveCityCommand(cityId, target);
      const execution = executeEditCommand(state, documentRef, command, {
        context: {map: state.map},
        status: `已移动城市 #${cityId}。`,
        errorStatus: `城市 #${cityId} 移动失败。`,
        preparePanelRefresh: targetState => {
          targetState.panels.city?.setSelectedCityId(cityId);
          targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.CITY, id: cityId}});
        },
        throwOnError: false
      });
      if (execution.executed) completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_MOVE, {command: execution.command});
    }
  });
  canvas.addEventListener("pointerdown", event => {
    if (state.cityEdit.moveMode && state.map) return;
    if (state.cityEdit.deleteMode && state.map) {
      if (!isPrimaryPointerDown(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const cityId = getCityIdAtEvent(state, event);
      if (!Number.isInteger(cityId) || cityId < 0) return;
      const execution = executeDeleteWithPreflight(state, documentRef, {
        kind: OBJECT_KIND.CITY,
        ids: [cityId],
        createCommand: id => createDeleteCityCommand(id),
        label: "画布删除城市",
        executeOptions: {
          preparePanelRefresh: targetState => {
            targetState.cityEdit.deleteMode = false;
            targetState.selectionStore.clear();
            targetState.panels.city?.setSelectedCityId(null);
          }
        }
      });
      if (!execution.executed) return;
      completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_DELETE, {command: execution.execution?.command});
      return;
    }
    if (!state.cityEdit.addMode || !state.map) return;
    if (!isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
    if (!Number.isInteger(pick?.gridCell) || pick.gridCell < 0) return;
    const command = createAddCityAtCellCommand(pick.gridCell);
    const execution = executeEditCommand(state, documentRef, command, {
      context: {map: state.map},
      preparePanelRefresh: (targetState, executed, result) => {
        targetState.cityEdit.addMode = false;
        targetState.cityEdit.lastCreatedCityId = result?.cityId ?? null;
        if (!Number.isInteger(result?.cityId)) return;
        targetState.panels.city?.setSelectedCityId(result.cityId);
        targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.CITY, id: result.cityId}});
      }
    });
    if (!execution.executed) return;
    completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.CITY_ADD, {command: execution.command});
  }, true);
}

function cityMoveTargetAtEvent(state, event) {
  const pick = state.renderer?.pickClientPoint?.(event.clientX, event.clientY) || {};
  return {gridCell: pick.gridCell, packCell: pick.packCell};
}

function bindMarkerEditing(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    if (!state.markerEdit.mode || !state.map) return;
    if (!isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const packCell = getMarkerPackCellAtEvent(state, event);
    if (!Number.isInteger(packCell)) return;

    const activeModeId = state.markerEdit.mode === "move" ? CANVAS_TOOL_MODE.MARKER_MOVE : CANVAS_TOOL_MODE.MARKER_ADD;
    const command = state.markerEdit.mode === "move"
      ? createMoveMarkerCommand(state.markerEdit.markerId, packCell)
      : createAddMarkerCommand({type: state.markerEdit.type, packCell});
    const selectedMarkerId = state.markerEdit.mode === "move" ? state.markerEdit.markerId : null;
    const executed = applyMarkerCollectionCommand(state, documentRef, command, {selectCreated: state.markerEdit.mode !== "move", selectMarkerId: selectedMarkerId});
    if (!executed) return;
    state.markerEdit.lastPackCell = packCell;
    completeCanvasToolMode(state, documentRef, activeModeId, {command: executed});
  }, true);
}

function bindObjectCreationTools(canvas, state, documentRef) {
  canvas.addEventListener("pointerdown", event => {
    const activeMode = state.canvasToolModes.getActive()?.id;
    if (![CANVAS_TOOL_MODE.ROUTE_DRAW, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, CANVAS_TOOL_MODE.RIVER_ADD, CANVAS_TOOL_MODE.LAKE_EXCAVATE, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT, CANVAS_TOOL_MODE.CULTURE_CENTER, CANVAS_TOOL_MODE.RELIGION_CENTER, CANVAS_TOOL_MODE.ZONE_ADD, CANVAS_TOOL_MODE.NOTE_ADD].includes(activeMode) || !state.map || !isPrimaryPointerDown(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (activeMode === CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT) {
      const pick = state.renderer?.pickClientPoint?.(event.clientX, event.clientY) || {};
      if (!Number.isInteger(pick.gridCell) || pick.gridCell < 0) return;
      const added = state.panels.feature?.setTopologyCell?.(pick.gridCell);
      if (added) setFileOperationStatus(documentRef, "已将一处地图区域加入海岸编辑选区。");
      updateRuntimePanel(documentRef, state);
      return;
    }
    const packCell = getMarkerPackCellAtEvent(state, event);
    if (!Number.isInteger(packCell)) return;

    if (activeMode === CANVAS_TOOL_MODE.CULTURE_CENTER || activeMode === CANVAS_TOOL_MODE.RELIGION_CENTER) {
      const kind = activeMode === CANVAS_TOOL_MODE.CULTURE_CENTER ? "culture" : "religion";
      state.panels[kind]?.setExpansionCenter?.(packCell);
      setFileOperationStatus(documentRef, `${kind === "culture" ? "文化" : "宗教"}中心已拾取 pack cell #${packCell}，请先预检再保存。`);
      completeCanvasToolMode(state, documentRef, activeMode, {packCell});
      return;
    }

    if (activeMode === CANVAS_TOOL_MODE.ROUTE_DRAW) {
      if (!Number.isInteger(state.routeCreate.startPackCell)) {
        state.routeCreate.startPackCell = packCell;
        setFileOperationStatus(documentRef, `路线起点已选 pack cell #${packCell}，请选择终点。`);
        updateRuntimePanel(documentRef, state);
        return;
      }
      const result = state.runtimeActions.edit.routes.create({
        startPackCell: state.routeCreate.startPackCell,
        endPackCell: packCell,
        type: state.routeCreate.type
      });
      if (result?.executed) completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_DRAW, {result});
      return;
    }

    if (activeMode === CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT) {
      state.panels.route?.setEditWaypoint(packCell);
      setFileOperationStatus(documentRef, `路线改线点已选 pack cell #${packCell}。`);
      completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ROUTE_EDIT_WAYPOINT, {packCell, routeId: state.routeEdit.waypointRouteId});
      updateRuntimePanel(documentRef, state);
      return;
    }

    if (activeMode === CANVAS_TOOL_MODE.RIVER_ADD) {
      const result = state.runtimeActions.edit.rivers.create({sourcePackCell: packCell});
      if (result?.executed) completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.RIVER_ADD, {result});
      return;
    }

    if (activeMode === CANVAS_TOOL_MODE.LAKE_EXCAVATE) {
      const result = state.runtimeActions.edit.lakes.create({packCell, radius: state.lakeCreate.radius});
      if (result?.executed) completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.LAKE_EXCAVATE, {result});
      return;
    }

    if (activeMode === CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT) {
      state.panels.lake?.setPatchCell(packCell);
      setFileOperationStatus(documentRef, `局部水陆修正中心已选 pack cell #${packCell}。`);
      completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.FEATURE_PATCH_SELECT, {packCell});
      updateRuntimePanel(documentRef, state);
      return;
    }

    if (activeMode === CANVAS_TOOL_MODE.ZONE_ADD) {
      const result = state.runtimeActions.edit.zones.create({centerPackCell: packCell, radius: state.zoneCreate.radius, type: state.zoneCreate.type});
      if (result?.executed) completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.ZONE_ADD, {result});
      return;
    }

    const result = state.runtimeActions.edit.notes.createStandalone({packCell, name: "独立备注", body: "新建独立备注"});
    if (result?.executed) completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.NOTE_ADD, {result});
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
    if (readLabelLayoutOverride(state.map, LABEL_TARGET_KIND.CUSTOM, label.id).position) {
      state.pendingCustomLabelPlacement = null;
      setFileOperationStatus(documentRef, `手工标签 #${label.id} 已锁定位置；已结束待放置状态。`);
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
    if (node.dataset.labelPositionLocked === "true") {
      event.preventDefault();
      event.stopPropagation();
      setFileOperationStatus(documentRef, `手工标签 #${labelId} 已锁定位置；请先在标签管理中解锁。`);
      return;
    }
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
  const result = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit
  });
  if (!result.executed) {
    state.renderer.refreshLabels?.();
    updateLabelNamingPanel(state);
  }
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
  const modeId = mode === "move" ? CANVAS_TOOL_MODE.MARKER_MOVE : CANVAS_TOOL_MODE.MARKER_ADD;
  enterCanvasToolMode(state, documentRef, modeId, {type, markerId});
}

function stopMarkerEditMode(state, documentRef, reason = "cancel") {
  const modeId = state.markerEdit.mode === "move" ? CANVAS_TOOL_MODE.MARKER_MOVE : CANVAS_TOOL_MODE.MARKER_ADD;
  cancelCanvasToolMode(state, documentRef, modeId, reason);
}

function clearMarkerEditMode(state) {
  state.markerEdit.mode = null;
  state.markerEdit.markerId = null;
  state.markerEdit.lastPackCell = null;
}

function applyMarkerCollectionCommand(state, documentRef, command, {selectCreated = false, selectMarkerId = null} = {}) {
  if (!state.map || !command) return null;
  const execution = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: (targetState, executedCommand) => {
      markDerivedFresh(targetState.map, ["markers", "economy"]);
      markDerivedStale(targetState.map, ["military", "diplomacy"]);
      refreshGenerationSummary(targetState.map);
      refreshAfterEdit(targetState, executedCommand);
    },
    preparePanelRefresh: targetState => {
      const created = selectCreated ? command.getCreatedMarker?.() : null;
      const markerId = Number.isInteger(selectMarkerId) ? selectMarkerId : created?.id;
      if (!Number.isInteger(markerId) || !(targetState.map.markers?.markers || []).some(marker => marker?.id === markerId)) return;
      targetState.selectionStore.setSelection({object: {kind: OBJECT_KIND.MARKER, id: markerId}});
      targetState.panels.marker?.setSelectedMarkerId(markerId);
    },
    throwOnError: false
  });
  if (!execution.executed) return null;
  updateRuntimePanel(documentRef, state);
  updateEditingInteractionLock(state, documentRef);
  return execution.command;
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

function scheduleHeightBrushAtEvent(state, event, documentRef) {
  state.heightEdit.pendingBrushPointer = {pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp};
  if (state.heightEdit.brushFrame) return;
  const view = documentRef.defaultView;
  const run = () => {
    state.heightEdit.brushFrame = 0;
    const pointer = state.heightEdit.pendingBrushPointer;
    state.heightEdit.pendingBrushPointer = null;
    if (!pointer || state.heightEdit.activeStroke?.pointerId !== pointer.pointerId) return;
    applyHeightBrushAtEvent(state, pointer, documentRef);
  };
  state.heightEdit.brushFrame = typeof view?.requestAnimationFrame === "function" ? view.requestAnimationFrame(run) : view?.setTimeout?.(run, 0) || 0;
}

function flushScheduledHeightBrush(state, documentRef, finalPointer = null) {
  const pointer = state.heightEdit.pendingBrushPointer;
  cancelScheduledHeightBrush(state, documentRef);
  const resolvedPointer = finalPointer && state.heightEdit.activeStroke?.pointerId === finalPointer.pointerId ? finalPointer : pointer;
  if (resolvedPointer && state.heightEdit.activeStroke?.pointerId === resolvedPointer.pointerId) applyHeightBrushAtEvent(state, resolvedPointer, documentRef, {force: true});
}

function cancelScheduledHeightBrush(state, documentRef) {
  const frame = state.heightEdit.brushFrame;
  const view = documentRef?.defaultView;
  if (frame && typeof view?.cancelAnimationFrame === "function") view.cancelAnimationFrame(frame);
  else if (frame) view?.clearTimeout?.(frame);
  state.heightEdit.brushFrame = 0;
  state.heightEdit.pendingBrushPointer = null;
}

function applyHeightBrushAtEvent(state, event, documentRef, {force = false} = {}) {
  const brush = state.panels.height.getBrush();
  const stroke = state.heightEdit.activeStroke;
  if (!brush.active || !stroke) return;

  if (!acceptHeightBrushSample(stroke, event, {force})) return;

  state.pick = state.renderer.pickClientPoint(event.clientX, event.clientY);
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getHeightBrushChanges(state.map, point, brush, stroke);
  if (!changes.length) {
    if (brush.action === "fill" && !stroke.originals.size) {
      state.heightEdit.lastAffected = 0;
      state.heightEdit.lastHeight = "none";
      state.heightEdit.lastDelta = "none";
      state.heightEdit.lastNotice = stroke.notice || "未找到可填充的连通区域。";
      updateHeightPanel(state);
    }
    updatePickPanel(documentRef, state);
    return;
  }

  applyHeightBrushPreview(state.map, changes);
  state.heightEdit.lastAffected = changes.length;
  state.heightEdit.lastHeight = summarizeChangedHeights(changes);
  state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
  state.heightEdit.lastNotice = stroke.notice || "";
  state.editRefreshScheduler.run({...EDIT_REFRESH_PRESETS.HEIGHT_BRUSH_PREVIEW, changedGridCells: changes.map(change => change.gridCell)});
  updatePickPanel(documentRef, state);
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

function applySocialAssignmentAtEvent(state, event, kind) {
  const brush = state.panels[kind]?.getBrush?.();
  const editState = state[`${kind}Edit`];
  if (!brush?.active || !editState.activeStroke || brush.targetId < 0) return;
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getSocialAssignmentChanges(state.map, point, brush, editState.activeStroke.originals, kind);
  if (!changes.length) return;
  applySocialAssignmentPreview(state.map, kind, changes);
  editState.lastAffected = changes.length;
  state.editRefreshScheduler.run(SOCIAL_ASSIGNMENT_PREVIEW_EFFECTS);
  kind === "culture" ? updateCulturePanel(state) : updateReligionPanel(state);
}

function applyBiomeAssignmentAtEvent(state, event) {
  const brush = state.panels.biome?.getBrush?.();
  const stroke = state.biomeEdit.activeStroke;
  if (!brush?.active || !stroke || brush.targetId < 0) return;
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getBiomeBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;
  applyBiomeAssignmentPreview(state.map, changes);
  const gridCells = [...stroke.originals.keys()];
  const preview = inspectBiomeAssignment(state.map, brush.targetId, gridCells, {scope: brush.scope});
  if (preview.valid) {
    preview.changed = true;
    preview.changedGridCells = gridCells;
    preview.changedPackCells = gridCells.flatMap(gridCell => stroke.originals.get(gridCell)?.packBefore?.map(entry => entry.packCell) || []);
  }
  state.biomeEdit.lastAffected = gridCells.length;
  state.biomeEdit.preview = preview;
  state.editRefreshScheduler.run(BIOME_ASSIGNMENT_PREVIEW_EFFECTS);
  updateBiomePanel(state);
}

function applySuitabilityAtEvent(state, event) {
  const brush = state.panels.biome?.getSuitabilityBrush?.();
  const stroke = state.suitabilityEdit.activeStroke;
  if (!brush?.active || !stroke) return;
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getSuitabilityBrushChanges(state.map, point, brush, stroke.originals);
  if (!changes.length) return;
  applySuitabilityPreview(state.map, changes);
  const strokeChanges = buildSuitabilityStrokeChanges(state.map, stroke.originals);
  const changedGridCells = strokeChanges.map(change => change.gridCell);
  const changedPackCells = strokeChanges.flatMap(change => change.packChanges.map(entry => entry.packCell));
  const preview = {
    valid: true,
    code: "ok",
    reason: "",
    changed: changedPackCells.length > 0,
    mode: brush.mode,
    scope: brush.scope,
    value: brush.mode === "reset" ? null : brush.value,
    changedGridCells,
    changedPackCells
  };
  state.suitabilityEdit.lastAffected = changedGridCells.length;
  state.suitabilityEdit.preview = preview;
  state.editRefreshScheduler.run(SUITABILITY_PREVIEW_EFFECTS);
  state.panels.biome?.updateSuitability({lastAffected: changedGridCells.length, preview});
}

function applyMarketAssignmentAtEvent(state, event) {
  const brush = state.panels.economy?.getMarketBrush?.();
  if (!brush?.active || !state.economyEdit.activeStroke) return;
  const point = state.renderer.screenToWorld(event.clientX, event.clientY);
  const changes = getMarketAssignmentBrushChanges(state.map, point, brush, state.economyEdit.originals);
  if (!changes.length) return;
  applyMarketAssignmentPreview(state.map, changes);
  state.editRefreshScheduler.run(MARKET_ASSIGNMENT_PREVIEW_EFFECTS);
  updateMarketAssignmentSelection(state);
  updateMarketAssignmentPreview(state);
}

function pendingMarketAssignmentChanges(state) {
  const values = state.map?.pack?.cells?.market;
  if (!values) return [];
  return [...state.economyEdit.originals.entries()]
    .map(([packCell, before]) => ({packCell, before: Number(before || 0), after: Number(values[packCell] || 0)}))
    .filter(change => change.before !== change.after)
    .sort((a, b) => a.packCell - b.packCell);
}

function updateMarketAssignmentPreview(state) {
  const changes = pendingMarketAssignmentChanges(state);
  const preview = changes.length ? inspectMarketAssignment(state.map, changes) : null;
  state.economyEdit.preview = preview;
  state.panels.economy?.updateMarketAssignmentPreview(preview);
  return preview;
}

function updateMarketAssignmentSelection(state) {
  const gridCells = [...state.economyEdit.originals.keys()]
    .map(packCell => Number(state.map?.pack?.cells?.g?.[packCell]))
    .filter(cell => Number.isInteger(cell) && cell >= 0);
  state.renderer?.setHeightCellSelection?.(gridCells);
}

function cancelMarketAssignmentPreview(state) {
  const changes = pendingMarketAssignmentChanges(state);
  if (changes.length) restoreMarketAssignmentPreview(state.map, changes);
  state.economyEdit.activeStroke = null;
  state.economyEdit.originals = new Map();
  state.economyEdit.preview = null;
  state.renderer?.clearHeightCellSelection?.();
  state.panels.economy?.updateMarketAssignmentPreview(null);
  if (changes.length) {
    state.editRefreshScheduler?.run(MARKET_ASSIGNMENT_PREVIEW_EFFECTS);
    updateEconomyPanel(state);
  }
  return changes.length;
}

function applyPendingMarketAssignment(state, documentRef) {
  const changes = pendingMarketAssignmentChanges(state);
  const preview = changes.length ? inspectMarketAssignment(state.map, changes) : null;
  if (!preview?.valid) {
    setFileOperationStatus(documentRef, preview?.waterCells || preview?.invalidMarketCells
      ? "市场归属预览含水域或无效市场，无法应用。"
      : "当前没有可应用的市场归属变化。");
    return {executed: false, reason: "invalid-preview", preview};
  }
  restoreMarketAssignmentPreview(state.map, changes);
  const command = createApplyMarketAssignmentCommand(changes);
  const execution = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    afterRefresh: () => refreshGenerationSummary(state.map),
    status: executed => `已应用 ${executed.getResult?.().changed || 0} 个市场归属并重算经济链。`,
    noopStatus: "市场归属没有变化。"
  });
  if (execution.executed) {
    state.economyEdit.originals = new Map();
    state.economyEdit.preview = null;
    state.renderer?.clearHeightCellSelection?.();
    completeCanvasToolMode(state, documentRef, CANVAS_TOOL_MODE.MARKET_ASSIGN, {command: execution.command});
  } else applyMarketAssignmentPreview(state.map, changes);
  return execution;
}

function rebuildEconomyViaAction(state, documentRef, {label = "重算经济链", deferRefresh = false} = {}) {
  const command = createRebuildEconomyCommand({label});
  const execution = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    afterRefresh: () => refreshGenerationSummary(state.map),
    refresh: deferRefresh ? () => {} : undefined,
    refreshPanels: !deferRefresh,
    status: executed => `已重算经济链：${executed.getResult?.().deals || 0} 笔交易。`,
    noopStatus: "当前地图没有可重算的市场。"
  });
  if (!deferRefresh) updateEditingInteractionLock(state, documentRef);
  return execution;
}

function finishSocialAssignmentStroke(state, documentRef, kind) {
  const editState = state[`${kind}Edit`];
  const stroke = editState.activeStroke;
  editState.activeStroke = null;
  if (!stroke?.originals?.size) return;
  const values = state.map.grid.cells[kind];
  const changes = [];
  for (const [gridCell, original] of stroke.originals) {
    const before = original.gridBefore;
    const after = Number(values[gridCell] || 0);
    if (before !== after) changes.push({gridCell, before, after, packBefore: original.packBefore});
  }
  const command = kind === "culture"
    ? createApplyCultureAssignmentCommand(changes)
    : createApplyReligionAssignmentCommand(changes);
  if (command.isNoop({map: state.map})) return;
  editState.lastAffected = changes.length;
  executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit
  });
}

function finishBiomeAssignmentStroke(state, documentRef) {
  const stroke = state.biomeEdit.activeStroke;
  state.biomeEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;
  const changes = [];
  for (const [gridCell, original] of stroke.originals) {
    const after = Number(state.map.grid.cells.biome?.[gridCell]) || 0;
    if (original.gridBefore !== after || original.packBefore.some(entry => entry.before !== after)) {
      changes.push({gridCell, before: original.gridBefore, after, packBefore: original.packBefore});
    }
  }
  restoreCanvasToolStrokePreview(state.map, "biome", stroke);
  state.editRefreshScheduler.run(BIOME_ASSIGNMENT_PREVIEW_EFFECTS);
  const command = createApplyBiomeAssignmentCommand(changes);
  const execution = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => {
      const result = executed.getResult?.();
      return `已更新 ${result?.gridCells || 0} 个 grid cells 的生物群系${result?.warningCells ? `，其中 ${result.warningCells} 个存在气候或高度异常` : ""}。`;
    },
    noopStatus: "生物群系归属没有变化。"
  });
  state.biomeEdit.lastAffected = execution.executed ? changes.length : 0;
  state.biomeEdit.preview = null;
  updateBiomePanel(state);
}

function finishSuitabilityStroke(state, documentRef) {
  const stroke = state.suitabilityEdit.activeStroke;
  state.suitabilityEdit.activeStroke = null;
  if (!stroke?.originals?.size) return;
  const changes = buildSuitabilityStrokeChanges(state.map, stroke.originals);
  restoreSuitabilityPreview(state.map, changes);
  state.editRefreshScheduler.run(SUITABILITY_PREVIEW_EFFECTS);
  const command = createApplySuitabilityCommand(changes);
  const execution = executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    status: executed => {
      const result = executed.getResult?.();
      return `已更新 ${result?.gridCells || 0} 个 grid cells、${result?.packCells || 0} 个 pack cells 的数值适居度。`;
    },
    noopStatus: "数值适居度没有变化。"
  });
  state.suitabilityEdit.lastAffected = execution.executed ? changes.length : 0;
  state.suitabilityEdit.preview = null;
  state.panels.biome?.updateSuitability({lastAffected: state.suitabilityEdit.lastAffected, preview: null});
  updateBiomePanel(state);
}

function finishHeightStroke(state, documentRef) {
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
  state.heightEdit.lastDelta = summarizeChangedHeightDelta(changes);
  executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterEdit,
    refreshPanels: false
  });
  updateHeightPanel(state, {includeMapSummary: false});
}

function finishStateStroke(state, documentRef) {
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
  executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterStateEdit
  });
}

function finishProvinceStroke(state, documentRef) {
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
  executeEditCommand(state, documentRef, command, {
    context: {map: state.map},
    refresh: refreshAfterProvinceEdit
  });
}

function getStateBrushChanges(map, point, brush, originals) {
  const radius = normalizeBrushRadius(BRUSH_RADIUS_ID.STATE, brush?.radius);
  const radiusSq = radius * radius;
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
  const radius = normalizeBrushRadius(BRUSH_RADIUS_ID.PROVINCE, brush?.radius);
  const radiusSq = radius * radius;
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

function getSocialAssignmentChanges(map, point, brush, originals, kind) {
  const radiusId = kind === "religion" ? BRUSH_RADIUS_ID.RELIGION : BRUSH_RADIUS_ID.CULTURE;
  const radius = normalizeBrushRadius(radiusId, brush?.radius);
  const radiusSq = radius * radius;
  const cells = map.grid.cells;
  const values = cells[kind];
  const affected = [];
  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    if (!isGridLandCell(map, gridCell)) continue;
    const cellPoint = map.grid.points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    if (dx * dx + dy * dy > radiusSq || Number(values[gridCell] || 0) === brush.targetId) continue;
    if (!originals.has(gridCell)) {
      const packBefore = [];
      for (let packCell = 0; packCell < (map.pack?.cells?.g?.length || 0); packCell++) {
        if (Number(map.pack.cells.g[packCell]) !== gridCell || Number(map.pack.cells.h?.[packCell]) < 20) continue;
        packBefore.push({packCell, before: Number(map.pack.cells[kind]?.[packCell]) || 0});
      }
      originals.set(gridCell, {gridBefore: Number(values[gridCell] || 0), packBefore});
    }
    affected.push({gridCell, before: originals.get(gridCell).gridBefore, after: brush.targetId});
  }
  return affected;
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

function updateHeightPanel(state, {includeMapSummary = true} = {}) {
  const update = {
    lastAffected: state.heightEdit.lastAffected,
    lastHeight: state.heightEdit.lastHeight,
    lastDelta: state.heightEdit.lastDelta,
    lastNotice: state.heightEdit.lastNotice,
    fillPreview: state.heightEdit.fillPreview,
    terrainSelection: state.heightEdit.terrainSelection?.summary || null,
    terrainSelectionSaved: state.heightEdit.terrainSelectionSaved?.summary || null,
    terrainSelectionFeather: state.heightEdit.terrainSelectionFeather,
    terrainSelectionPaintState: state.heightEdit.terrainSelectionPaint ? "painting" : state.heightEdit.terrainSelectionPaintPending ? "pending" : null,
    useTerrainSelection: Boolean(state.heightEdit.terrainSelection?.useForTools),
    graphWidth: state.options?.graphWidth,
    graphHeight: state.options?.graphHeight,
    derivedStaleSystems: heightDerivedStaleSystems(state.map),
    history: state.editHistory.getStats()
  };
  if (includeMapSummary) {
    update.currentHeightStats = summarizeCurrentHeightStats(state.map);
    update.currentHeightPreview = buildCurrentHeightPreview(state.map);
  }
  state.panels.height?.update(update);
}

function heightDerivedStaleSystems(map) {
  return [...(map?.metadata?.derivedStale?.systems || [])];
}

function summarizeCurrentHeightStats(map) {
  const heights = map?.grid?.cells?.h;
  if (!heights?.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let water = 0;
  let land = 0;
  let lowland = 0;
  let hill = 0;
  let mountain = 0;
  let seaLevelBand = 0;
  let sum = 0;
  for (const height of heights) {
    const value = Number(height) || 0;
    if (value < min) min = value;
    if (value > max) max = value;
    if (value < 20) water += 1;
    else {
      land += 1;
      if (value < 45) lowland += 1;
      else if (value < 65) hill += 1;
      else mountain += 1;
    }
    if (value >= 18 && value <= 22) seaLevelBand += 1;
    sum += value;
  }
  const total = heights.length;
  return {
    min: Math.round(min),
    max: Math.round(max),
    water,
    land,
    lowland,
    hill,
    mountain,
    seaLevelBand,
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

function updateClimatePanel(state) {
  if (!isPanelOpen(state.panels.climate)) return;
  state.panels.climate?.update(state.map, state.editHistory.getStats());
}

function updateBiomePanel(state) {
  if (!isPanelOpen(state.panels.biome)) return;
  state.panels.biome?.update(state.map, state.editHistory.getStats(), {
    active: state.panels.biome?.getBrush?.().active,
    lastAffected: state.biomeEdit.lastAffected,
    preview: state.biomeEdit.preview
  }, {
    active: state.panels.biome?.getSuitabilityBrush?.().active,
    lastAffected: state.suitabilityEdit.lastAffected,
    preview: state.suitabilityEdit.preview
  });
}

function updatePopulationPanel(state) {
  if (!isPanelOpen(state.panels.population)) return;
  state.panels.population?.update(state.map, state.editHistory.getStats());
}

function updateEmblemPanel(state) {
  if (!isPanelOpen(state.panels.emblem)) return;
  state.panels.emblem?.update(state.map, state.editHistory.getStats());
}

function updateFeaturePanel(state) {
  if (!isPanelOpen(state.panels.feature)) return;
  state.panels.feature?.update(state.map, state.editHistory.getStats());
}

function updateCulturePanel(state) {
  if (!isPanelOpen(state.panels.culture)) return;
  state.panels.culture?.update(state.map, state.selection, state.editHistory.getStats(), {
    active: state.panels.culture?.getBrush?.().active,
    lastAffected: state.cultureEdit.lastAffected
  });
}

function updateReligionPanel(state) {
  if (!isPanelOpen(state.panels.religion)) return;
  state.panels.religion?.update(state.map, state.selection, state.editHistory.getStats(), {
    active: state.panels.religion?.getBrush?.().active,
    lastAffected: state.religionEdit.lastAffected
  });
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
  updateClimatePanel(state);
  updateBiomePanel(state);
  updatePopulationPanel(state);
  updateEmblemPanel(state);
  updateFeaturePanel(state);
  updateCulturePanel(state);
  updateReligionPanel(state);
  updateDiplomacyPanel(state);
  updateEconomyPanel(state);
  updateMilitaryPanel(state);
  updateMarkerPanel(state);
  updateLabelNamingPanel(state);
  updateNamebasePanel(state);
  updateRoutePanel(state);
  updateRiverPanel(state);
  updateOceanCurrentPanel(state);
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

function updateNamebasePanel(state) {
  if (isPanelOpen(state.panels.namebase)) state.panels.namebase?.update(state.map, state.editHistory.getStats());
}

function updateRoutePanel(state) {
  if (isPanelOpen(state.panels.route)) state.panels.route?.update(state.map, state.selection, state.editHistory.getStats());
}

function updateRiverPanel(state) {
  if (isPanelOpen(state.panels.river)) state.panels.river?.update(state.map, state.selection, state.editHistory.getStats(), state.editingObject);
}

function updateOceanCurrentPanel(state) {
  if (isPanelOpen(state.panels.oceanCurrent)) state.panels.oceanCurrent?.update(state.map, state.editHistory.getStats());
}

function isPanelOpen(panel) {
  return Boolean(panel?.isOpen?.());
}

function refreshRuntimeAndPickPanels(documentRef, state) {
  updateRuntimePanel(documentRef, state);
  updatePickPanel(documentRef, state);
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
  return Boolean(state.canvasToolModes.getActive()?.locksInteraction || state.editingObject);
}

function getAllowedEditingPanelIds(state) {
  const activeMode = state.canvasToolModes.getActive();
  if (activeMode?.locksInteraction) return activeMode.allowedPanelIds;
  if (state.editingObject?.kind === OBJECT_KIND.RIVER) return ["river-panel"];
  if (state.editingObject) return ["object-details"];
  return [];
}

function buildEditorStateSnapshot(state, interactionLocked, allowedPanelIds) {
  const heightBrush = state.panels.height?.getBrush?.() || {};
  const stateBrush = state.panels.state?.getBrush?.() || {};
  const provinceBrush = state.panels.province?.getBrush?.() || {};
  return {
    activeEditor: getActiveEditorKind(state),
    canvasToolMode: state.canvasToolModes.getSnapshot(),
    interactionLocked,
    allowedPanelIds,
    editingObject: state.editingObject ? {...state.editingObject} : null,
    height: {
      active: Boolean(heightBrush.active),
      action: heightBrush.action || "raise",
      scope: heightBrush.scope || "all",
      radius: Number(heightBrush.radius) || 0,
      strength: Number(heightBrush.strength) || 0,
      fillTolerance: Number(heightBrush.fillTolerance) || 0,
      lineWidth: Number(heightBrush.lineWidth) || 0,
      linePower: Number(heightBrush.linePower) || 0,
      falloff: Boolean(heightBrush.falloff),
      globalToolSeed: state.heightEdit.globalToolSeed,
      lineStart: state.heightEdit.lineStart ? {x: Math.round(state.heightEdit.lineStart.point.x), y: Math.round(state.heightEdit.lineStart.point.y)} : null,
      lastAffected: state.heightEdit.lastAffected,
      lastHeight: state.heightEdit.lastHeight,
      lastDelta: state.heightEdit.lastDelta,
      lastNotice: state.heightEdit.lastNotice,
      fillPreview: state.heightEdit.fillPreview ? {...state.heightEdit.fillPreview} : null,
      terrainSelectionBox: state.heightEdit.terrainSelectionBox ? {
        operation: state.heightEdit.terrainSelectionBox.request?.operation || "replace",
        start: state.heightEdit.terrainSelectionBox.start ? {
          x: Math.round(state.heightEdit.terrainSelectionBox.start.point.x * 10) / 10,
          y: Math.round(state.heightEdit.terrainSelectionBox.start.point.y * 10) / 10
        } : null
      } : null,
      terrainSelectionPoint: state.heightEdit.terrainSelectionPoint ? {
        operation: state.heightEdit.terrainSelectionPoint.request?.operation || "replace",
        source: state.heightEdit.terrainSelectionPoint.request?.source || "connected-height"
      } : null,
      terrainSelectionPaint: state.heightEdit.terrainSelectionPaint ? {
        active: true,
        operation: state.heightEdit.terrainSelectionPaint.request?.operation || "replace",
        stampCount: state.heightEdit.terrainSelectionPaint.stampCount,
        candidateCount: state.heightEdit.terrainSelectionPaint.candidateCellIds.size
      } : state.heightEdit.terrainSelectionPaintPending ? {
        active: false,
        operation: state.heightEdit.terrainSelectionPaintPending.request?.operation || "replace",
        stampCount: 0,
        candidateCount: 0
      } : null
    },
    conditionalHeightTransform: state.panels.height?.getConditionalTransformSnapshot?.() || null,
    globalHeightToolPreview: state.panels.height?.getGlobalToolPreview?.() || null,
    terrainHeightTemplate: state.panels.height?.getTerrainTemplateSnapshot?.() || null,
    terrainHeightSelection: state.panels.height?.getTerrainSelectionSnapshot?.() || null,
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

function conditionalHeightTransformLabel(operator) {
  if (operator === "add") return "条件加高";
  if (operator === "subtract") return "条件降低";
  if (operator === "multiply") return "条件乘算";
  if (operator === "divide") return "条件除算";
  return "条件指数变换";
}

function getActiveEditorKind(state) {
  const modeId = state.canvasToolModes.getActive()?.id;
  if (modeId === CANVAS_TOOL_MODE.HEIGHT_BRUSH) return "height";
  if (modeId === CANVAS_TOOL_MODE.STATE_BRUSH) return "state";
  if (modeId === CANVAS_TOOL_MODE.PROVINCE_BRUSH) return "province";
  if (modeId === CANVAS_TOOL_MODE.CULTURE_ASSIGN) return "culture";
  if (modeId === CANVAS_TOOL_MODE.RELIGION_ASSIGN) return "religion";
  if (modeId === CANVAS_TOOL_MODE.BIOME_ASSIGN) return "biome";
  if (modeId === CANVAS_TOOL_MODE.SUITABILITY_PAINT) return "suitability";
  if (modeId === CANVAS_TOOL_MODE.MARKET_ASSIGN) return "economy";
  if (modeId === CANVAS_TOOL_MODE.MEASUREMENT_DRAW) return "measurement";
  if (modeId) return modeId;
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

function summarizeChangedHeightDelta(changes) {
  if (!changes.length) return "none";
  const average = changes.reduce((sum, change) => sum + change.after - change.before, 0) / changes.length;
  const rounded = Math.round(average * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
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
