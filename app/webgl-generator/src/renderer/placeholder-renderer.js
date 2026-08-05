import {buildObjectPickingIndex, pickCity, pickGridCell, pickMarker, pickMilitary, pickPoliticalObject, pickRiver, pickRoute} from "./picking.js";
import {goodDisplayName} from "../generator/economy-display-properties.js";
import {bindVertexBuffer, createProgram} from "./gl-utils.js";
import {createRenderContext, worldToNdcPoint, worldToScreenPixel} from "./render-context.js";
import {colorForCell, isLandCell} from "./color-modes.js";
import {politicalSurfaceMeshForMode, pushGridCells, pushMeshSurfaceVertices, shouldDrawGridCellUnderPoliticalMesh} from "./cell-surface-layer.js";
import {buildCellVisualGridVertices, buildCellVisualMesh, emptyCellVisualMesh, summarizeCellVisualMesh} from "./cell-visual-layer.js";
import {buildSelectionMeshVertices, selectionHighlightMode} from "./selection-layer.js";
import {buildHeightCellSelectionMesh, buildHeightTransformPreviewMesh, emptyHeightCellSelectionStats, emptyHeightTransformPreviewStats} from "./height-transform-preview-layer.js";
import {pushZoneTextureLayer} from "./zone-layer.js";
import {
  pushScreenPolyline,
  pushVariableScreenPolyline,
  pushWorldPolylineMesh,
  pushWorldVertex
} from "./mesh-writer.js";
import {
  clamp,
  isWorldPoint,
  mix,
  smoothWorldPath,
  smoothWorldPathWithValues,
} from "./geometry.js";
import {
  boundaryLineModeForOptions,
  buildShoreSurfaceVertexLayers,
  buildShoreVisualPaths,
  emptyShoreVisualPaths,
  pushShoreLineLayers,
  summarizeShoreVisualPaths
} from "./shore-layer.js";
import {withSurfaceSideAlpha} from "./surface-side-depth.js";
import {
  PROVINCE_VISUAL_STYLE,
  STATE_VISUAL_STYLE,
  buildPoliticalVisualMeshCache,
  buildProvinceVisualPaths,
  buildStateVisualPaths,
  emptyPoliticalVisualMeshes,
  emptyPoliticalVisualPaths,
  normalizePoliticalMeshDebugMode,
  politicalMeshDebugCache,
  pushPoliticalBoundaryStrokes,
  pushPoliticalVisualBands,
  summarizePoliticalVisualMeshes,
  summarizePoliticalVisualPaths
} from "./political-layer.js";
import {LABEL_TARGET_KIND, OBJECT_KIND, POLITICAL_OBJECT_FIELD, isPointObjectKind, isPoliticalObjectKind} from "../runtime/object-kinds.js";
import {markDynamicCanvasTextNode, semanticLabelClassName, setDynamicCanvasTextContent} from "../runtime/canvas-text-contract.js";
import {compositeConnectorPoints, pickCompositeConnector} from "./composite-connectors.js";
import {
  cityRoleKeys,
  cityRoleScaleLabel,
  createCityScaleContext,
  deriveCityScale,
  resolveCityVisual
} from "../runtime/city-visuals.js";
import {isGeneratedLabelHidden} from "../runtime/label-edit-commands.js";
import {estimateLabelTextBox, hasVisibleLabelShadow, labelStyleTypeForTarget, resolveLabelStyle} from "../runtime/label-style-registry.js";
import {createDefaultLayerVisibility, DEFAULT_MAX_CITY_LABELS} from "../runtime/display-defaults.js";
import {hasManualLabelPriorities, resolveLabelLayout, sortLabelItemsByPriority} from "../runtime/label-layout-registry.js";
import {
  PROVINCE_COLLISION_OPACITY,
  automaticPoliticalLabelOrder,
  resolvePoliticalLabelPlacement
} from "./political-label-layout.js";
import {resolveStateLabelPlacement} from "./state-label-territory.js";
import {formatMilitary, normalizeUnitPreferences} from "../ui/display-units.js";
import {militaryIconLabelForVariant, normalizeMilitaryIconVariant} from "./military-icon-assets.js";
import {
  markerIconSvg as renderMarkerIconSvg,
  militaryIconDataUrl,
  resolveMarkerIconVisual
} from "./canvas-icon-registry.js";
import {
  CITY_ICON_BASE_CSS_SIZE,
  CITY_ICON_SCALE_FADE_WIDTH,
  CITY_ICON_VISIBILITY_TRANSITION_MS,
  cityIconCssSize,
  cityIconMaxSizeFactor,
  cityIconScaleVisibility,
  createCityIconWebglLayer
} from "./city-icon-layer.js";
import {resizeCanvasToDisplaySize} from "./canvas-display-size.js";
import {resolveMilitaryLabelPalette} from "./military-label-palette.js";
import {MILITARY_CITY_LABEL_AVOID_SCALE, militaryLabelBox, resolveMilitaryLabelPlacement} from "./military-label-layout.js";
import {cityLabelAnchorOffset} from "./city-label-icon-layout.js";
import {isSelectionForLabelItem, shouldShowDefaultSelectionMarker} from "./selection-marker-policy.js";
import {DEFAULT_VISUAL_THEME_ID, resolveVisualTheme} from "./themes.js";
import {drawRouteMeshBatches, emptyRouteDrawRanges, resolveRouteStyle, SELECTED_ROUTE_COLOR} from "./route-style.js";
import {emptyOceanCurrentLayerStats, pushOceanCurrentLayer} from "./ocean-current-layer.js";
import {pushMilitaryFrontLayer} from "./military-front-layer.js";
import {snapshotViewportCamera, viewportBufferTransform} from "./viewport-buffer-transform.js";
import {wildernessLabelAnchor} from "../runtime/zone-wilderness.js";
import {
  buildGridCellDiagnosticHighlight,
  buildGridCellDiagnostics,
  gridCellBounds,
  gridCellCenter
} from "./grid-cell-diagnostics-layer.js";
import {
  ROUTE_SELECTION_HALO_CSS_PX,
  createLineWidthProjection,
  projectWorldLineWidth,
  riverWorldWidth,
  withProjectedLineAlpha
} from "./line-width-projection.js";

const MARKER_ICON_MIN_SCALE = 2.15;
const MARKER_ICON_RELAXED_SCALE = 4.4;
const MARKER_ICON_BASE_WIDTH = 28;
const MARKER_ICON_BASE_HEIGHT = 32;
const CITY_ICON_MIN_SCALE = 1.05;
const CITY_ICON_RELAXED_SCALE = 3.8;
const CITY_ICON_BASE_WIDTH = CITY_ICON_BASE_CSS_SIZE.width;
const CITY_ICON_BASE_HEIGHT = CITY_ICON_BASE_CSS_SIZE.height;
const MILITARY_ICON_MIN_SCALE = 0.76;
const MILITARY_ICON_RELAXED_SCALE = 2.6;
const MILITARY_ICON_BASE_WIDTH = 58;
const MILITARY_ICON_BASE_HEIGHT = 24;
const POPULATION_UNIT_PEOPLE = 1000;
const MAX_OVERLAY_COLLISION_BOXES = 900;
const ROUTE_BUILD_SLICE_MS = 5;
const RIVER_BUILD_SLICE_MS = 5;
const MAX_ROUTE_RENDER_POINTS_PER_ROUTE = 4096;
const MAX_ROUTE_RENDER_POINTS_TOTAL = 90000;
const MAX_ROUTE_RENDER_VERTICES = 900000;
const MAX_ROUTE_DASH_PIECES = 20000;
const MAX_TRADE_FLOW_LINES = 180;
const MAX_TRADE_FLOW_VERTICES = 18000;
const OVERLAY_LABEL_PREWARM_RATIO = 0.5;
const OVERLAY_LABEL_PREWARM_MIN_CSS_PX = 192;
const OVERLAY_LABEL_PREWARM_MAX_CSS_PX = 720;
const PROVINCE_LABEL_PREWARM_MAX_CSS_PX = 384;
const OVERLAY_ICON_PREWARM_RATIO = 0.5;
const OVERLAY_ICON_PREWARM_MIN_CSS_PX = 192;
const OVERLAY_ICON_PREWARM_MAX_CSS_PX = 720;
const CITY_ICON_PREWARM_RATIO = 0.5;
const CITY_ICON_PREWARM_MIN_CSS_PX = 256;
const CITY_ICON_PREWARM_MAX_CSS_PX = 720;
const VIEWPORT_LINE_OVERSCAN_RATIO = 0.5;
const VIEWPORT_LINE_OVERSCAN_MIN_CSS_PX = 256;
const VIEWPORT_LINE_OVERSCAN_MAX_CSS_PX = 720;
const RETIRED_MAP_LAYERS = new Set(["tradeFlows"]);
const MAP_EDGE_FADE_RATIO = 0.055;
const MAP_EDGE_FADE_MIN_WORLD = 28;
const MAP_EDGE_FADE_MAX_WORLD = 96;
const MAP_EDGE_FADE_ALPHA = 0.9;
const MAX_INCREMENTAL_SURFACE_GAP_FLOATS = 4096;
const GRID_CELL_ID_LABEL_BUDGET = 240;
const RENDERER_EVENT_HISTORY_LIMIT = 512;

const MARKER_ICON_PALETTES = Object.freeze({
  natural: {fill: "#7aa35f", stroke: "#203717", symbol: "#f6ffe8"},
  water: {fill: "#3a91d8", stroke: "#12365c", symbol: "#eff9ff"},
  resource: {fill: "#33a96b", stroke: "#123b25", symbol: "#f4ffe9"},
  infrastructure: {fill: "#d18b35", stroke: "#4c2f12", symbol: "#fff5dc"},
  trade: {fill: "#d7a52d", stroke: "#4a3410", symbol: "#fff8d8"},
  hazard: {fill: "#c84b3e", stroke: "#4b1817", symbol: "#fff0e8"},
  culture: {fill: "#8264c5", stroke: "#2d204d", symbol: "#fbf2ff"},
  settlement: {fill: "#cf6f4b", stroke: "#4b271b", symbol: "#fff1e8"},
  mystery: {fill: "#715cc7", stroke: "#271f51", symbol: "#f7f1ff"}
});

export class PlaceholderMapRenderer {
  constructor(canvas, onViewChange = () => {}, onHover = () => {}, onSelect = () => {}) {
    this.canvas = canvas;
    this.stage = canvas.closest?.(".map-stage") || canvas.parentElement || null;
    this.overlay = canvas.parentElement?.querySelector("#map-overlay") || null;
    this.onViewChange = onViewChange;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.canvasSize = resizeCanvasToDisplaySize(canvas, this.overlay, this.stage).size;
    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      powerPreference: "high-performance",
      stencil: false
    });
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL2");

    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.cityIconLayer = createCityIconWebglLayer(this.gl);
    this.locations = {
      position: this.gl.getAttribLocation(this.program, "a_position"),
      color: this.gl.getAttribLocation(this.program, "a_color"),
      scale: this.gl.getUniformLocation(this.program, "u_scale"),
      offset: this.gl.getUniformLocation(this.program, "u_offset"),
      pointMode: this.gl.getUniformLocation(this.program, "u_pointMode"),
      surfaceSideMode: this.gl.getUniformLocation(this.program, "u_surfaceSideMode")
    };
    this.vertexBuffer = this.gl.createBuffer();
    this.landCorrectionBuffer = this.gl.createBuffer();
    this.waterCorrectionBuffer = this.gl.createBuffer();
    this.landCoverBuffer = this.gl.createBuffer();
    this.waterCoverBuffer = this.gl.createBuffer();
    this.routeBuffer = this.gl.createBuffer();
    this.tradeFlowBuffer = this.gl.createBuffer();
    this.riverBuffer = this.gl.createBuffer();
    this.selectionBuffer = this.gl.createBuffer();
    this.heightTransformPreviewBuffer = this.gl.createBuffer();
    this.heightCellSelectionBuffer = this.gl.createBuffer();
    this.oceanCurrentBuffer = this.gl.createBuffer();
    this.lineBuffer = this.gl.createBuffer();
    this.pointBuffer = this.gl.createBuffer();
    this.politicalMeshDebugBuffer = this.gl.createBuffer();
    this.gridCellDiagnosticsBuffer = this.gl.createBuffer();
    this.gridCellDiagnosticFillBuffer = this.gl.createBuffer();
    this.gridCellDiagnosticLineBuffer = this.gl.createBuffer();
    this.vertexCount = 0;
    this.surfaceVertices = new Float32Array();
    this.landCorrectionVertices = new Float32Array();
    this.waterCorrectionVertices = new Float32Array();
    this.landCoverVertices = new Float32Array();
    this.waterCoverVertices = new Float32Array();
    this.landCorrectionVertexCount = 0;
    this.waterCorrectionVertexCount = 0;
    this.landCoverVertexCount = 0;
    this.waterCoverVertexCount = 0;
    this.surfaceCellRanges = new Map();
    this.routeVertexCount = 0;
    this.routeDrawRanges = emptyRouteDrawRanges();
    this.tradeFlowVertexCount = 0;
    this.tradeFlowPickItems = [];
    this.riverVertexCount = 0;
    this.selectionVertexCount = 0;
    this.heightTransformPreviewVertexCount = 0;
    this.heightTransformPreviewBuildMs = 0;
    this.heightTransformPreviewStats = emptyHeightTransformPreviewStats();
    this.heightCellSelectionVertexCount = 0;
    this.heightCellSelectionBuildMs = 0;
    this.heightCellSelectionStats = emptyHeightCellSelectionStats();
    this.oceanCurrentVertexCount = 0;
    this.lineVertexCount = 0;
    this.pointVertexCount = 0;
    this.politicalMeshDebugMode = "none";
    this.politicalMeshDebugVertexCount = 0;
    this.gridCellDiagnosticsVertexCount = 0;
    this.gridCellDiagnosticFillVertexCount = 0;
    this.gridCellDiagnosticLineVertexCount = 0;
    this.gridCellDiagnosticsGeneration = 0;
    this.gridCellDiagnostics = emptyGridCellDiagnosticsStats();
    this.gridCellDiagnosticHighlight = null;
    this.gridCellDiagnosticFrame = 0;
    this.gridCellIdLayer = null;
    this.labelCount = 0;
    this.visibleLabelCount = 0;
    this.cityLabelCount = 0;
    this.visibleCityLabelCount = 0;
    this.stateLabelCount = 0;
    this.visibleStateLabelCount = 0;
    this.provinceLabelCount = 0;
    this.visibleProvinceLabelCount = 0;
    this.labelItems = [];
    this.cityIconItems = [];
    this.cityIconCount = 0;
    this.visibleCityIconCount = 0;
    this.cityIconScaleThreshold = CITY_ICON_MIN_SCALE;
    this.cityIconAnimationFrame = 0;
    this.cityIconAnimationUntil = 0;
    this.markerIconItems = [];
    this.markerIconCount = 0;
    this.visibleMarkerIconCount = 0;
    this.markerIconScaleThreshold = MARKER_ICON_MIN_SCALE;
    this.militaryIconItems = [];
    this.militaryIconCount = 0;
    this.visibleMilitaryIconCount = 0;
    this.selection = null;
    this.objectHighlights = [];
    this.riverWaypointPreview = null;
    this.riverWaypointPreviewRevision = 0;
    this.selectionMarker = null;
    this.objectPickingIndex = null;
    this.lastObjectCandidateCount = 0;
    this.routeBuildMs = 0;
    this.routeRenderStats = normalizeRouteRenderStats(emptyRouteRenderStats());
    this.tradeFlowBuildMs = 0;
    this.tradeFlowRenderStats = emptyTradeFlowRenderStats();
    this.riverBuildMs = 0;
    this.selectionBuildMs = 0;
    this.routeWidthMode = "world-space projected";
    this.riverWidthMode = "world-space flux projected";
    this.riverWidthStats = emptyRiverWidthStats();
    this.cellVisualMesh = emptyCellVisualMesh();
    this.shoreVisualPaths = emptyShoreVisualPaths();
    this.stateVisualPaths = emptyPoliticalVisualPaths();
    this.provinceVisualPaths = emptyPoliticalVisualPaths();
    this.politicalVisualMeshes = emptyPoliticalVisualMeshes();
    this.oceanCurrentHighlights = new Set();
    this.oceanCurrentLayerStats = emptyOceanCurrentLayerStats();
    this.locateStatus = "none";
    this.locateFlash = null;
    this.locateFlashFrame = 0;
    this.colorMode = "height";
    this.visualTheme = resolveVisualTheme(DEFAULT_VISUAL_THEME_ID);
    this.viewOptions = {showOceanHeight: false, smoothCellBorders: true, diplomacySubjectId: null, visualTheme: this.visualTheme};
    this.labelOptions = {maxCityLabels: DEFAULT_MAX_CITY_LABELS};
    this.unitPreferences = normalizeUnitPreferences();
    this.layerVisibility = createDefaultLayerVisibility();
    this.camera = {scale: 1, offsetX: 0, offsetY: 0};
    this.routeBufferCamera = snapshotViewportCamera(this.camera);
    this.riverBufferCamera = snapshotViewportCamera(this.camera);
    this.dynamicBuffersDirty = {
      routes: true,
      tradeFlows: false,
      rivers: true,
      selection: true
    };
    this.lastDraw = {sequence: 0, drawMs: 0};
    this.lastLoad = emptyRendererLoadStats();
    this.lastOverlayUpdate = emptyOverlayUpdateStats();
    this.performanceEvents = createRendererPerformanceEvents();
    this.overlayInteractionSuspended = false;
    this.viewportInteractionKind = null;
    this.viewportPointerInteractionKind = null;
    this.overlayCommittedCamera = snapshotViewportCamera(this.camera);
    this.overlayPreviewTransform = {scale: 1, translateX: 0, translateY: 0};
    this.viewportPreviewFrame = 0;
    this.viewportPreviewRequests = 0;
    this.viewportPreviewCoalesced = 0;
    this.viewportCommitTimer = 0;
    this.viewportCommitVersion = 0;
    this.viewportCommitEvent = null;
    installCanvasInteractions(this.canvas, this.camera, interaction => {
      this.requestViewportPreview(interaction);
    }, event => {
      this.onHover(this.pickClientPoint(event.clientX, event.clientY));
    }, event => {
      this.onSelect(this.pickClientPoint(event.clientX, event.clientY));
    }, interaction => {
      this.beginViewportPointerInteraction(interaction);
    }, interaction => {
      this.endViewportPointerInteraction(interaction);
    });
    this.installDisplayResizeObserver();
  }

  beginPerformanceEvent(key, details = {}, startedAt = performance.now()) {
    return beginRendererPerformanceEvent(this.performanceEvents[key], details, startedAt);
  }

  queuePerformanceEvent(key, details = {}, queuedAt = performance.now()) {
    return queueRendererPerformanceEvent(this.performanceEvents[key], details, queuedAt);
  }

  startQueuedPerformanceEvent(token, startedAt = performance.now()) {
    return startQueuedRendererPerformanceEvent(token, startedAt);
  }

  completePerformanceEvent(token, details = {}, completedAt = performance.now()) {
    return completeRendererPerformanceEvent(token, details, completedAt);
  }

  cancelPerformanceEvent(token, reason, details = {}, canceledAt = performance.now()) {
    return cancelRendererPerformanceEvent(token, reason, details, canceledAt);
  }

  failPerformanceEvent(token, error, details = {}, failedAt = performance.now()) {
    return failRendererPerformanceEvent(token, error, details, failedAt);
  }

  recordBufferUpload(action, task, details = {}) {
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("bufferUpload", {action, timingBoundary: "cpu-webgl-call", ...details}, startedAt);
    try {
      const result = task();
      const completed = this.completePerformanceEvent(event, {}, performance.now());
      return {result, ms: completed.ms};
    } catch (error) {
      this.failPerformanceEvent(event, error, {}, performance.now());
      throw error;
    }
  }

  getPerformanceEvents({includeRecent = false} = {}) {
    return snapshotRendererPerformanceEvents(this.performanceEvents, {includeRecent});
  }

  installDisplayResizeObserver() {
    const view = this.canvas.ownerDocument?.defaultView;
    if (!view) return;
    this.resizeFrame = 0;
    this.handleDisplayResize = () => {
      if (this.resizeFrame) return;
      this.resizeFrame = view.requestAnimationFrame(() => {
        this.resizeFrame = 0;
        this.resizeToDisplaySize();
      });
    };
    const ResizeObserverCtor = view.ResizeObserver;
    if (ResizeObserverCtor && this.stage) {
      this.resizeObserver = new ResizeObserverCtor(this.handleDisplayResize);
      this.resizeObserver.observe(this.stage);
    }
    view.addEventListener("resize", this.handleDisplayResize, {passive: true});
  }

  resizeToDisplaySize({draw = true} = {}) {
    const result = resizeCanvasToDisplaySize(this.canvas, this.overlay, this.stage);
    this.canvasSize = result.size;
    if (!result.changed) return false;
    this.markViewportBuffersDirty();
    if (draw) {
      this.draw();
      this.onViewChange();
    }
    return true;
  }

  loadMap(map) {
    const profile = createRendererLoadProfile();
    this.map = map;
    this.invalidateGridCellDiagnostics();
    this.objectHighlights = [];
    this.oceanCurrentHighlights = new Set();
    applyMapStageBackground(this.stage, map, this.visualTheme);
    this.objectPickingIndex = profile.stage("object-picking-index", "构建对象索引", () => buildObjectPickingIndex(map));
    profile.stage("cell-visual-mesh", "构建视觉 cell mesh", () => this.rebuildCellVisualMesh());
    profile.stage("shore-cache", "构建水陆线缓存", () => this.rebuildShoreVisualCache());
    profile.stage("state-boundaries", "构建国家边界缓存", () => this.rebuildStateVisualCache());
    profile.stage("province-boundaries", "构建省份边界缓存", () => this.rebuildProvinceVisualCache());
    profile.stage("political-meshes", "构建政治视觉 mesh", () => this.rebuildPoliticalVisualMeshesIfNeeded());
    const surfaceBundle = profile.stage("surface-vertices", "构建 surface 顶点", () => buildPlaceholderSurfaceBundle(map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh));
    const vertices = surfaceBundle.base;
    const lineLayer = profile.stage("line-vertices", "构建线层顶点", () => buildLineVertices(map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions));
    const lineVertices = lineLayer.vertices;
    const oceanCurrentVertices = lineLayer.oceanCurrentVertices;
    this.oceanCurrentLayerStats = lineLayer.oceanCurrents;
    const pointVertices = profile.stage("point-vertices", "构建点图层顶点", () => buildPointVertices(map, this.layerVisibility));
    this.surfaceVertices = vertices;
    this.landCorrectionVertices = surfaceBundle.landCorrections;
    this.waterCorrectionVertices = surfaceBundle.waterCorrections;
    this.landCoverVertices = surfaceBundle.landCovers;
    this.waterCoverVertices = surfaceBundle.waterCovers;
    this.surfaceCellRanges = buildSurfaceCellRanges(this.colorMode, this.viewOptions, this.cellVisualMesh, vertices.length);
    this.vertexCount = vertices.length / 6;
    this.landCorrectionVertexCount = surfaceBundle.landCorrections.length / 6;
    this.waterCorrectionVertexCount = surfaceBundle.waterCorrections.length / 6;
    this.landCoverVertexCount = surfaceBundle.landCovers.length / 6;
    this.waterCoverVertexCount = surfaceBundle.waterCovers.length / 6;
    this.routeVertexCount = 0;
    this.routeDrawRanges = emptyRouteDrawRanges();
    this.riverVertexCount = 0;
    this.tradeFlowVertexCount = 0;
    this.tradeFlowPickItems = [];
    this.tradeFlowBuildMs = 0;
    this.tradeFlowRenderStats = emptyTradeFlowRenderStats();
    this.heightTransformPreviewVertexCount = 0;
    this.heightTransformPreviewBuildMs = 0;
    this.heightTransformPreviewStats = emptyHeightTransformPreviewStats();
    this.heightCellSelectionVertexCount = 0;
    this.heightCellSelectionBuildMs = 0;
    this.heightCellSelectionStats = emptyHeightCellSelectionStats();
    this.oceanCurrentVertexCount = oceanCurrentVertices.length / 6;
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
    profile.stage("gpu-upload", "上传静态 GPU buffer", () => {
      this.recordBufferUpload("load-map-static", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        uploadShoreSurfaceBuffers(this.gl, this, surfaceBundle);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.tradeFlowBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.selectionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heightTransformPreviewBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heightCellSelectionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.oceanCurrentBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, oceanCurrentVertices, this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
        this.updatePoliticalMeshDebugBuffer();
      }, {bufferGroup: "static-map"});
    });
    profile.stage("labels", "构建标签", () => this.buildLabels(map));
    this.markAllDynamicBuffersDirty();
    profile.stage("fit-draw", "适配视图并绘制", () => this.fitToView({quick: true}));
    profile.stage("route-screen-mesh", "构建道路屏幕 mesh", () => {
      if (this.layerVisibility.routes) this.updateRouteBuffer();
      else this.clearRouteBuffer();
    });
    profile.stage("river-screen-mesh", "构建河流屏幕 mesh", () => {
      if (this.layerVisibility.rivers) this.updateRiverBuffer();
    });
    profile.stage("overlay-draw", "刷新标签和图标", () => this.draw({updateDynamicBuffers: false, updateOverlay: true}));
    this.lastLoad = profile.finish();
  }

  async loadMapAsync(map, {onStage = () => {}, onStageEnd = () => {}, yieldToBrowser = () => Promise.resolve()} = {}) {
    const profile = createRendererLoadProfile();
    const stage = async (id, label, task) => {
      const startedAt = performance.now();
      onStage({id, label});
      await yieldToBrowser({debugDelay: true, stageId: id});
      try {
        const result = await profile.stageAsync(id, label, task);
        onStageEnd({id, label, ms: roundMs(performance.now() - startedAt)});
        await yieldToBrowser({debugDelay: true, stageId: id});
        return result;
      } catch (error) {
        onStageEnd({id, label, ms: roundMs(performance.now() - startedAt), error});
        throw error;
      }
    };

    this.map = map;
    this.invalidateGridCellDiagnostics();
    this.objectHighlights = [];
    this.oceanCurrentHighlights = new Set();
    applyMapStageBackground(this.stage, map, this.visualTheme);
    this.objectPickingIndex = await stage("object-picking-index", "构建对象索引", () => buildObjectPickingIndex(map));
    await stage("cell-visual-mesh", "构建视觉 cell mesh", () => this.rebuildCellVisualMesh());
    await stage("shore-cache", "构建水陆线缓存", () => this.rebuildShoreVisualCache());
    await stage("state-boundaries", "构建国家边界缓存", () => this.rebuildStateVisualCache());
    await stage("province-boundaries", "构建省份边界缓存", () => this.rebuildProvinceVisualCache());
    await stage("political-meshes", "构建政治视觉 mesh", () => this.rebuildPoliticalVisualMeshesIfNeeded());
    const surfaceBundle = await stage("surface-vertices", "构建 surface 顶点", () => buildPlaceholderSurfaceBundle(map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh));
    const vertices = surfaceBundle.base;
    const lineLayer = await stage("line-vertices", "构建线层顶点", () => buildLineVertices(map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions));
    const lineVertices = lineLayer.vertices;
    const oceanCurrentVertices = lineLayer.oceanCurrentVertices;
    this.oceanCurrentLayerStats = lineLayer.oceanCurrents;
    const pointVertices = await stage("point-vertices", "构建点图层顶点", () => buildPointVertices(map, this.layerVisibility));
    this.surfaceVertices = vertices;
    this.landCorrectionVertices = surfaceBundle.landCorrections;
    this.waterCorrectionVertices = surfaceBundle.waterCorrections;
    this.landCoverVertices = surfaceBundle.landCovers;
    this.waterCoverVertices = surfaceBundle.waterCovers;
    this.surfaceCellRanges = buildSurfaceCellRanges(this.colorMode, this.viewOptions, this.cellVisualMesh, vertices.length);
    this.vertexCount = vertices.length / 6;
    this.landCorrectionVertexCount = surfaceBundle.landCorrections.length / 6;
    this.waterCorrectionVertexCount = surfaceBundle.waterCorrections.length / 6;
    this.landCoverVertexCount = surfaceBundle.landCovers.length / 6;
    this.waterCoverVertexCount = surfaceBundle.waterCovers.length / 6;
    this.routeVertexCount = 0;
    this.routeDrawRanges = emptyRouteDrawRanges();
    this.riverVertexCount = 0;
    this.tradeFlowVertexCount = 0;
    this.tradeFlowPickItems = [];
    this.tradeFlowBuildMs = 0;
    this.tradeFlowRenderStats = emptyTradeFlowRenderStats();
    this.heightTransformPreviewVertexCount = 0;
    this.heightTransformPreviewBuildMs = 0;
    this.heightTransformPreviewStats = emptyHeightTransformPreviewStats();
    this.heightCellSelectionVertexCount = 0;
    this.heightCellSelectionBuildMs = 0;
    this.heightCellSelectionStats = emptyHeightCellSelectionStats();
    this.oceanCurrentVertexCount = oceanCurrentVertices.length / 6;
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
    await stage("gpu-upload", "上传静态 GPU buffer", () => {
      this.recordBufferUpload("load-map-static", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        uploadShoreSurfaceBuffers(this.gl, this, surfaceBundle);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.tradeFlowBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.selectionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heightTransformPreviewBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heightCellSelectionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.oceanCurrentBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, oceanCurrentVertices, this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
        this.updatePoliticalMeshDebugBuffer();
      }, {bufferGroup: "static-map"});
    });
    await stage("labels", "构建标签", () => this.buildLabels(map));
    this.markAllDynamicBuffersDirty();
    await stage("fit-draw", "适配视图并绘制", () => this.fitToView({quick: true}));
    await stage("route-screen-mesh", "构建道路屏幕 mesh", () => {
      if (this.layerVisibility.routes) return this.updateRouteBufferAsync({yieldToBrowser});
      this.clearRouteBuffer();
      return null;
    });
    await stage("river-screen-mesh", "构建河流屏幕 mesh", () => {
      if (this.layerVisibility.rivers) this.updateRiverBuffer();
    });
    await stage("overlay-draw", "刷新标签和图标", () => this.draw({updateDynamicBuffers: false, updateOverlay: true}));
    this.lastLoad = profile.finish();
  }

  fitToView({quick = false} = {}) {
    this.camera.scale = 1;
    this.camera.offsetX = 0;
    this.camera.offsetY = 0;
    if (quick) {
      this.markViewportBuffersDirty();
      this.draw({updateDynamicBuffers: false, updateOverlay: false});
      this.onViewChange();
      return;
    }
    this.drawViewportPreview();
  }

  setColorMode(mode) {
    if (this.colorMode === mode) return;
    this.colorMode = mode;
    if (!this.map) return;
    this.refreshCellSurface({draw: false});
    this.draw();
  }

  setDiplomacySubjectId(stateId) {
    const nextId = normalizePositiveId(stateId);
    if (this.viewOptions.diplomacySubjectId === nextId) return;
    this.viewOptions = {...this.viewOptions, diplomacySubjectId: nextId};
    if (!this.map || this.colorMode !== "diplomacy") return;
    this.refreshCellSurface({draw: false});
    this.draw();
  }

  setViewOptions(options = {}) {
    const shouldRefreshLineLayers = Object.prototype.hasOwnProperty.call(options, "smoothCellBorders");
    this.viewOptions = {...this.viewOptions, ...options};
    if (!this.map) return;
    this.refreshCellSurface({draw: false});
    if (shouldRefreshLineLayers) this.refreshLineLayers({draw: false});
    this.draw();
  }

  setVisualTheme(themeId, {force = false} = {}) {
    const theme = resolveVisualTheme(themeId);
    if (!force && this.visualTheme.id === theme.id) return;
    this.visualTheme = theme;
    this.viewOptions = {...this.viewOptions, visualTheme: theme};
    if (this.map) applyMapStageBackground(this.stage, this.map, theme);
    if (!this.map) return;
    this.refreshCellSurface({draw: false});
    this.refreshLineLayers({draw: false});
    this.dynamicBuffersDirty.routes = true;
    this.refreshLabels();
    this.draw();
  }

  setLabelOptions(options = {}) {
    const maxCityLabels = normalizeMaxCityLabels(options.maxCityLabels, this.labelOptions.maxCityLabels);
    if (maxCityLabels === this.labelOptions.maxCityLabels) return;
    this.labelOptions = {...this.labelOptions, maxCityLabels};
    if (!this.map) return;
    this.refreshLabels();
  }

  refreshCellSurface({draw = true} = {}) {
    if (!this.map) return;
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("surfaceRefresh", {drawRequested: draw, colorMode: this.colorMode}, startedAt);
    try {
      const geometryReused = canReuseCellVisualSurfaceGeometry(this);
      const surfaceBundle = geometryReused
        ? recolorCellVisualSurfaceBundle(this)
        : buildPlaceholderSurfaceBundle(this.map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh);
      const vertices = surfaceBundle.base;
      this.surfaceVertices = vertices;
      this.landCorrectionVertices = surfaceBundle.landCorrections;
      this.waterCorrectionVertices = surfaceBundle.waterCorrections;
      this.landCoverVertices = surfaceBundle.landCovers;
      this.waterCoverVertices = surfaceBundle.waterCovers;
      this.surfaceCellRanges = buildSurfaceCellRanges(this.colorMode, this.viewOptions, this.cellVisualMesh, vertices.length);
      this.vertexCount = vertices.length / 6;
      this.landCorrectionVertexCount = surfaceBundle.landCorrections.length / 6;
      this.waterCorrectionVertexCount = surfaceBundle.waterCorrections.length / 6;
      this.landCoverVertexCount = surfaceBundle.landCovers.length / 6;
      this.waterCoverVertexCount = surfaceBundle.waterCovers.length / 6;
      const upload = this.recordBufferUpload("surface-refresh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        uploadShoreSurfaceBuffers(this.gl, this, surfaceBundle);
      }, {bufferGroup: "surface"});
      if (draw) this.draw();
      this.completePerformanceEvent(event, {uploadMs: upload.ms, vertexCount: this.vertexCount, geometryReused}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {}, performance.now());
      throw error;
    }
  }

  refreshHeightCells(gridCells, {draw = true} = {}) {
    const normalizedCells = [...new Set((gridCells || []).map(Number).filter(cell => Number.isInteger(cell) && cell >= 0))].sort((a, b) => a - b);
    if (!this.map || !normalizedCells.length) return {incremental: false, cells: 0, spans: 0};
    if (this.colorMode !== "height" || !(this.surfaceVertices instanceof Float32Array) || !this.surfaceCellRanges.size) {
      this.refreshCellSurface({draw});
      return {incremental: false, cells: normalizedCells.length, spans: 1};
    }
    const shoreCells = collectShoreVisualCells(this.shoreVisualPaths);
    const requiresShoreRebuild = normalizedCells.some(gridCell => {
      const range = this.surfaceCellRanges.get(gridCell);
      const storedSide = range ? this.surfaceVertices[range.start + 5] : null;
      const currentSide = Number(this.map.grid.cells.h[gridCell]) >= 20 ? 0.25 : 0.75;
      return shoreCells.has(gridCell) || storedSide !== currentSide;
    });
    if (requiresShoreRebuild) {
      this.rebuildCellVisualMesh();
      this.rebuildShoreVisualCache();
      this.refreshCellSurface({draw});
      return {incremental: false, cells: normalizedCells.length, spans: 1, reason: "shore-or-land-water-change"};
    }

    const spans = [];
    let changedCells = 0;
    for (const gridCell of normalizedCells) {
      const range = this.surfaceCellRanges.get(gridCell);
      if (!range) continue;
      const color = colorForCell(gridCell, this.map, this.colorMode, this.viewOptions);
      for (let offset = range.start; offset < range.end; offset += 6) {
        this.surfaceVertices[offset + 2] = color[0];
        this.surfaceVertices[offset + 3] = color[1];
        this.surfaceVertices[offset + 4] = color[2];
      }
      spans.push(range);
      changedCells++;
    }
    if (!spans.length) return {incremental: true, cells: 0, spans: 0};

    const merged = mergeSurfaceRanges(spans);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    for (const range of merged) this.gl.bufferSubData(this.gl.ARRAY_BUFFER, range.start * Float32Array.BYTES_PER_ELEMENT, this.surfaceVertices.subarray(range.start, range.end));
    if (draw) this.draw();
    return {incremental: true, cells: changedCells, spans: merged.length};
  }

  refreshLabels() {
    if (!this.map) return;
    this.buildLabels(this.map);
    this.updateLabels();
  }

  getLabelLayoutSnapshot(targetKind, targetId) {
    const id = Number(targetId);
    const item = this.labelItems.find(label => label.targetKind === targetKind && label.targetId === id);
    if (!item) return null;
    return {
      targetKind: item.targetKind,
      targetId: item.targetId,
      x: item.x,
      y: item.y,
      priority: item.layout.priority,
      manualPriority: item.layout.manualPriority,
      locked: item.layout.locked,
      minScale: item.minScale,
      visible: item.visible
    };
  }

  refreshTerrainCaches({draw = true} = {}) {
    if (!this.map) return;
    this.rebuildCellVisualMesh();
    this.rebuildShoreVisualCache();
    this.rebuildStateVisualCache();
    this.rebuildProvinceVisualCache();
    this.rebuildPoliticalVisualMeshesIfNeeded();
    this.refreshCellSurface({draw: false});
    this.refreshLineLayers({draw: false});
    if (draw) this.draw();
  }

  setUnitPreferences(preferences = {}) {
    const next = normalizeUnitPreferences(preferences);
    if (JSON.stringify(next) === JSON.stringify(this.unitPreferences)) return;
    this.unitPreferences = next;
    this.refreshMilitaryIconLabels();
  }

  refreshMilitaryIconLabels() {
    if (!this.overlay || !this.map) return;
    for (const item of this.militaryIconItems) {
      const troopLabel = formatMilitaryTroops(item.troops, this.unitPreferences);
      const tooltip = militaryIconTooltip(item.regiment || item, this.map, this.unitPreferences);
      item.rendererUnitPreferences = this.unitPreferences;
      const count = item.node?.querySelector?.(".military-map-icon-count");
      if (count) setDynamicCanvasTextContent(count, "military-count", troopLabel);
      if (item.node) {
        item.node.title = tooltip;
        item.node.setAttribute("aria-label", tooltip);
      }
      item.tooltip = tooltip;
    }
    this.updateLabels();
  }

  updateCustomLabelPosition(labelId, point) {
    if (!this.overlay || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    for (const item of this.labelItems) {
      if (item.targetKind !== LABEL_TARGET_KIND.CUSTOM || item.targetId !== labelId) continue;
      item.x = point.x;
      item.y = point.y;
      break;
    }
    this.updateLabels();
  }

  refreshLineLayers({draw = true} = {}) {
    if (!this.map) return;
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("lineRefresh", {drawRequested: draw}, startedAt);
    try {
      const lineLayer = buildLineVertices(this.map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions, this.oceanCurrentHighlights);
      const lineVertices = lineLayer.vertices;
      const oceanCurrentVertices = lineLayer.oceanCurrentVertices;
      this.oceanCurrentLayerStats = lineLayer.oceanCurrents;
      this.oceanCurrentVertexCount = oceanCurrentVertices.length / 6;
      this.lineVertexCount = lineVertices.length / 6;
      const upload = this.recordBufferUpload("line-refresh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.oceanCurrentBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, oceanCurrentVertices, this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
      }, {bufferGroup: "line-and-ocean-current"});
      if (draw) this.draw();
      this.completePerformanceEvent(event, {uploadMs: upload.ms, lineVertexCount: this.lineVertexCount, oceanCurrentVertexCount: this.oceanCurrentVertexCount}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {}, performance.now());
      throw error;
    }
  }

  refreshPoliticalVisualCaches() {
    if (!this.map) return;
    this.rebuildStateVisualCache();
    this.rebuildProvinceVisualCache();
    this.rebuildPoliticalVisualMeshesIfNeeded();
  }

  refreshPointLayers({draw = true} = {}) {
    if (!this.map) return;
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("pointRefresh", {drawRequested: draw}, startedAt);
    try {
      const pointVertices = buildPointVertices(this.map, this.layerVisibility);
      this.pointVertexCount = pointVertices.length / 6;
      const upload = this.recordBufferUpload("point-refresh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
      }, {bufferGroup: "point"});
      if (draw) this.draw();
      this.completePerformanceEvent(event, {uploadMs: upload.ms, pointVertexCount: this.pointVertexCount}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {}, performance.now());
      throw error;
    }
  }

  setOceanCurrentHighlights(ids, {draw = true} = {}) {
    this.oceanCurrentHighlights = new Set((ids || []).map(String));
    this.refreshLineLayers({draw});
  }

  refreshObjectPickingIndex() {
    if (!this.map) return;
    this.objectPickingIndex = buildObjectPickingIndex(this.map);
  }

  rebuildCellVisualMesh() {
    this.cellVisualMesh = this.map ? buildCellVisualMesh(this.map) : emptyCellVisualMesh();
  }

  rebuildShoreVisualCache() {
    this.shoreVisualPaths = this.map ? buildShoreVisualPaths(this.map) : emptyShoreVisualPaths();
  }

  rebuildStateVisualCache() {
    this.stateVisualPaths = this.map ? buildStateVisualPaths(this.map) : emptyPoliticalVisualPaths();
  }

  rebuildProvinceVisualCache() {
    this.provinceVisualPaths = this.map ? buildProvinceVisualPaths(this.map) : emptyPoliticalVisualPaths();
  }

  rebuildPoliticalVisualMeshes() {
    if (!this.map) {
      this.politicalVisualMeshes = emptyPoliticalVisualMeshes();
      this.updatePoliticalMeshDebugBuffer();
      return;
    }
    this.politicalVisualMeshes = {
      states: buildPoliticalVisualMeshCache(this.map, "state", this.stateVisualPaths, this.shoreVisualPaths, STATE_VISUAL_STYLE),
      provinces: buildPoliticalVisualMeshCache(this.map, "province", this.provinceVisualPaths, this.shoreVisualPaths, PROVINCE_VISUAL_STYLE)
    };
    this.updatePoliticalMeshDebugBuffer();
  }

  rebuildPoliticalVisualMeshesIfNeeded() {
    if (!this.map || !this.shouldBuildPoliticalVisualMeshes()) {
      this.politicalVisualMeshes = emptyPoliticalVisualMeshes();
      this.updatePoliticalMeshDebugBuffer();
      return;
    }
    this.rebuildPoliticalVisualMeshes();
  }

  shouldBuildPoliticalVisualMeshes() {
    if (this.politicalMeshDebugMode !== "none") return true;
    return this.viewOptions.smoothCellBorders !== false && !this.cellVisualMesh?.cells?.length;
  }

  setPoliticalMeshDebugMode(mode = "none") {
    const nextMode = normalizePoliticalMeshDebugMode(mode);
    if (this.politicalMeshDebugMode === nextMode) return;
    this.politicalMeshDebugMode = nextMode;
    this.rebuildPoliticalVisualMeshesIfNeeded();
    if (this.map) this.draw();
  }

  updatePoliticalMeshDebugBuffer() {
    if (!this.gl || !this.politicalMeshDebugBuffer) return;
    const cache = politicalMeshDebugCache(this.politicalVisualMeshes, this.politicalMeshDebugMode);
    const vertices = cache?.vertices || new Float32Array();
    this.politicalMeshDebugVertexCount = vertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.politicalMeshDebugBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
  }

  setLayerVisible(layer, visible) {
    return this.setLayersVisible([[layer, visible]]);
  }

  setLayersVisible(entries = []) {
    const requested = new Map();
    for (const entry of entries || []) {
      const [layer, visible] = Array.isArray(entry) ? entry : [entry?.layer, entry?.visible];
      if (!(layer in this.layerVisibility)) continue;
      const nextVisible = RETIRED_MAP_LAYERS.has(layer) ? false : Boolean(visible);
      requested.set(layer, nextVisible);
      if (layer === "coastline") requested.set("lakeShore", nextVisible);
    }
    const changed = [];
    for (const [layer, visible] of requested) {
      if (this.layerVisibility[layer] === visible) continue;
      this.layerVisibility[layer] = visible;
      changed.push(layer);
    }
    if (!changed.length) return [];
    if (changed.includes("gridCells") && this.layerVisibility.gridCells) void this.ensureGridCellDiagnosticsBuffer();
    if (changed.includes("tradeFlows")) {
      if (this.layerVisibility.tradeFlows) this.dynamicBuffersDirty.tradeFlows = true;
      else this.clearTradeFlowBuffer();
    }
    if (changed.some(layer => layer === "cities" || layer === "population" || layer === "markers" || layer === "resources" || layer === "military")) {
      this.refreshPointLayers({draw: false});
    }
    if (changed.some(layer => layer === "coastline" || layer === "lakeShore" || layer === "stateBorders" || layer === "provinceBorders" || layer === "warFronts" || layer === "zones" || layer === "zoneEvents" || layer === "zoneNatural" || layer === "zoneWilderness" || layer === "oceanCurrents")) {
      this.refreshLineLayers({draw: false});
    }
    this.draw();
    return changed;
  }

  async ensureGridCellDiagnosticsBuffer(options = {}) {
    if (!this.map || this.gridCellDiagnostics.ready) return this.gridCellDiagnostics.ready;
    if (this.gridCellDiagnostics.building) return this.gridCellDiagnostics.buildPromise;
    const map = this.map;
    const generation = this.gridCellDiagnosticsGeneration;
    const buildPromise = buildGridCellDiagnostics(map, {
      yieldToBrowser: options.yieldToBrowser,
      sliceMs: options.sliceMs,
      shouldContinue: () => this.map === map && this.gridCellDiagnosticsGeneration === generation
    }).then(result => {
      if (result.aborted || this.map !== map || this.gridCellDiagnosticsGeneration !== generation) return false;
      this.gridCellDiagnosticsVertexCount = result.vertices.length / 6;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gridCellDiagnosticsBuffer);
      const uploadStartedAt = performance.now();
      this.gl.bufferData(this.gl.ARRAY_BUFFER, result.vertices, this.gl.STATIC_DRAW);
      this.gridCellDiagnostics = {
        ready: true,
        building: false,
        edges: result.edgeCount,
        vertexCount: this.gridCellDiagnosticsVertexCount,
        buildMs: result.buildMs,
        uploadMs: roundMs(performance.now() - uploadStartedAt),
        maxSliceMs: result.maxSliceMs,
        bufferBytes: result.bufferBytes,
        visibleIds: 0,
        packCounts: result.packCounts,
        buildPromise: null
      };
      this.draw({updateDynamicBuffers: false});
      return true;
    }).catch(error => {
      if (this.gridCellDiagnosticsGeneration === generation) {
        this.gridCellDiagnostics = {...emptyGridCellDiagnosticsStats(), error: String(error?.message || error)};
      }
      throw error;
    });
    this.gridCellDiagnostics = {...this.gridCellDiagnostics, building: true, buildPromise};
    return buildPromise;
  }

  invalidateGridCellDiagnostics() {
    this.gridCellDiagnosticsGeneration++;
    this.gridCellDiagnosticsVertexCount = 0;
    this.gridCellDiagnostics = emptyGridCellDiagnosticsStats();
    this.clearGridCellDiagnosticHighlight({draw: false});
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gridCellDiagnosticsBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.STATIC_DRAW);
    if (this.gridCellIdLayer) this.gridCellIdLayer.replaceChildren();
  }

  locateCell(reference, options = {}) {
    if (!this.map) return {found: false, code: "map-not-ready"};
    const space = String(reference?.space || "");
    const id = Number(reference?.id);
    const gridCell = space === "pack" ? Number(this.map.pack?.cells?.g?.[id]) : id;
    const bounds = Number.isInteger(gridCell) ? gridCellBounds(this.map, gridCell) : null;
    if (!bounds) return {found: false, code: "cell-not-found", ref: {space, id}};
    const before = {...this.camera};
    if (options.openLayer !== false) {
      this.layerVisibility.gridCells = true;
      void this.ensureGridCellDiagnosticsBuffer();
    }
    if (options.fit !== false) this.locateBounds(bounds, {status: `grid cell #${gridCell}`, minScale: options.minScale ?? 6});
    if (options.flash !== false) this.startGridCellDiagnosticHighlight(gridCell);
    else this.draw();
    return {
      found: true,
      code: "cell-located",
      ref: {space, id},
      gridRef: {space: "grid", id: gridCell},
      camera: {before, after: {...this.camera}},
      layerVisible: this.layerVisibility.gridCells,
      highlighted: options.flash !== false
    };
  }

  getViewportWorldBounds(marginPx = 0) {
    return this.map ? viewportWorldBounds(this.map, this.camera, this.canvas, marginPx) : null;
  }

  startGridCellDiagnosticHighlight(gridCell) {
    this.gridCellDiagnosticHighlight = {gridCell, until: performance.now() + 2600};
    this.updateGridCellDiagnosticHighlightBuffer();
    if (!this.gridCellDiagnosticFrame) this.animateGridCellDiagnosticHighlight();
  }

  clearGridCellDiagnosticHighlight({draw = true} = {}) {
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    if (this.gridCellDiagnosticFrame && typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(this.gridCellDiagnosticFrame);
    this.gridCellDiagnosticFrame = 0;
    this.gridCellDiagnosticHighlight = null;
    this.gridCellDiagnosticFillVertexCount = 0;
    this.gridCellDiagnosticLineVertexCount = 0;
    for (const buffer of [this.gridCellDiagnosticFillBuffer, this.gridCellDiagnosticLineBuffer]) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
    }
    if (draw && this.map) this.draw();
  }

  animateGridCellDiagnosticHighlight() {
    if (!this.gridCellDiagnosticHighlight || performance.now() > this.gridCellDiagnosticHighlight.until) {
      this.clearGridCellDiagnosticHighlight();
      return;
    }
    this.updateGridCellDiagnosticHighlightBuffer();
    this.draw({updateDynamicBuffers: false});
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    this.gridCellDiagnosticFrame = view.requestAnimationFrame(() => this.animateGridCellDiagnosticHighlight());
  }

  updateGridCellDiagnosticHighlightBuffer() {
    if (!this.map || !this.gridCellDiagnosticHighlight) return;
    const pulse = (Math.sin(performance.now() / 125) + 1) / 2;
    const mesh = buildGridCellDiagnosticHighlight(this.map, this.gridCellDiagnosticHighlight.gridCell, pulse);
    this.gridCellDiagnosticFillVertexCount = mesh.fill.length / 6;
    this.gridCellDiagnosticLineVertexCount = mesh.line.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gridCellDiagnosticFillBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, mesh.fill, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gridCellDiagnosticLineBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, mesh.line, this.gl.DYNAMIC_DRAW);
  }

  draw({updateDynamicBuffers = true, updateOverlay = true, drawDirtyDynamicBuffers = true, drawCityIcons = true} = {}) {
    if (!this.map || !this.vertexCount) return;
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("draw", {updateDynamicBuffers, updateOverlay, drawDirtyDynamicBuffers}, startedAt);
    try {
    if (updateDynamicBuffers && this.dynamicBuffersDirty.routes && this.layerVisibility.routes) this.updateRouteBuffer();
    if (updateDynamicBuffers && this.dynamicBuffersDirty.tradeFlows && this.layerVisibility.tradeFlows) this.updateTradeFlowBuffer();
    if (updateDynamicBuffers && this.dynamicBuffersDirty.rivers && this.layerVisibility.rivers) this.updateRiverBuffer();
    if (updateDynamicBuffers && this.dynamicBuffersDirty.selection) this.updateSelectionBuffer();

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...(this.visualTheme?.canvas?.background || this.map.layers.background));
    gl.depthMask(true);
    gl.clearDepth(0.5);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1i(this.locations.pointMode, 0);
    gl.uniform1i(this.locations.surfaceSideMode, 1);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    gl.enable(gl.DEPTH_TEST);
    drawSurfaceDepthBatch(gl, this, this.vertexBuffer, this.vertexCount, gl.ALWAYS);
    drawSurfaceDepthBatch(gl, this, this.landCorrectionBuffer, this.landCorrectionVertexCount, gl.LESS);
    drawSurfaceDepthBatch(gl, this, this.waterCorrectionBuffer, this.waterCorrectionVertexCount, gl.GREATER);
    drawSurfaceDepthBatch(gl, this, this.landCoverBuffer, this.landCoverVertexCount, gl.LESS);
    drawSurfaceDepthBatch(gl, this, this.waterCoverBuffer, this.waterCoverVertexCount, gl.GREATER);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.uniform1i(this.locations.surfaceSideMode, 0);
    const layerOrder = ["surface"];
    if (this.oceanCurrentVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.oceanCurrentBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this.oceanCurrentVertexCount);
      gl.disable(gl.BLEND);
      layerOrder.push("oceanCurrents");
    }
    if (this.heightCellSelectionVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.heightCellSelectionBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this.heightCellSelectionVertexCount);
      gl.disable(gl.BLEND);
    }
    if (this.heightTransformPreviewVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.heightTransformPreviewBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this.heightTransformPreviewVertexCount);
      gl.disable(gl.BLEND);
    }
    if (this.politicalMeshDebugVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.politicalMeshDebugBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this.politicalMeshDebugVertexCount);
      gl.disable(gl.BLEND);
    }
    const routePreviewTransform = viewportBufferTransform(this.routeBufferCamera, this.camera);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeBuffer);
    gl.uniform1f(this.locations.scale, routePreviewTransform.scale);
    gl.uniform2f(this.locations.offset, routePreviewTransform.offsetX, routePreviewTransform.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (this.layerVisibility.routes) {
      drawRouteMeshBatches(gl, this.routeDrawRanges);
      if (this.routeVertexCount > 0) layerOrder.push("routes");
    }
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tradeFlowBuffer);
    gl.uniform1f(this.locations.scale, 1);
    gl.uniform2f(this.locations.offset, 0, 0);
    bindVertexBuffer(gl, this.locations);
    if (this.layerVisibility.tradeFlows && (drawDirtyDynamicBuffers || !this.dynamicBuffersDirty.tradeFlows)) gl.drawArrays(gl.TRIANGLES, 0, this.tradeFlowVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.lineVertexCount);
    if (this.lineVertexCount > 0) layerOrder.push("lines");
    gl.disable(gl.BLEND);
    const riverPreviewTransform = viewportBufferTransform(this.riverBufferCamera, this.camera);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.riverBuffer);
    gl.uniform1f(this.locations.scale, riverPreviewTransform.scale);
    gl.uniform2f(this.locations.offset, riverPreviewTransform.offsetX, riverPreviewTransform.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (this.layerVisibility.rivers) {
      gl.drawArrays(gl.TRIANGLES, 0, this.riverVertexCount);
      if (this.riverVertexCount > 0) layerOrder.push("rivers");
    }
    gl.disable(gl.BLEND);
    let gridCellsDrawCalls = 0;
    if (this.layerVisibility.gridCells && this.gridCellDiagnostics.ready && this.gridCellDiagnosticsVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridCellDiagnosticsBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.lineWidth(1);
      gl.drawArrays(gl.LINES, 0, this.gridCellDiagnosticsVertexCount);
      gl.disable(gl.BLEND);
      gridCellsDrawCalls = 1;
      layerOrder.push("gridCells");
    }
    if (this.gridCellDiagnosticFillVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridCellDiagnosticFillBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this.gridCellDiagnosticFillVertexCount);
      gl.disable(gl.BLEND);
    }
    if (this.gridCellDiagnosticLineVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridCellDiagnosticLineBuffer);
      gl.uniform1f(this.locations.scale, this.camera.scale);
      gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
      bindVertexBuffer(gl, this.locations);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.lineWidth(2);
      gl.drawArrays(gl.LINES, 0, this.gridCellDiagnosticLineVertexCount);
      gl.disable(gl.BLEND);
      layerOrder.push("gridCellHighlight");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.selectionBuffer);
    gl.uniform1f(this.locations.scale, 1);
    gl.uniform2f(this.locations.offset, 0, 0);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (drawDirtyDynamicBuffers || !this.dynamicBuffersDirty.selection) gl.drawArrays(gl.TRIANGLES, 0, this.selectionVertexCount);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    gl.uniform1i(this.locations.pointMode, 1);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.pointVertexCount);
    gl.disable(gl.BLEND);
    gl.uniform1i(this.locations.pointMode, 0);

    const cityIconInstances = this.cityIconLayer.draw({
      mapSize: this.map.metadata,
      camera: this.camera,
      canvas: this.canvas,
      timeMs: performance.now(),
      layerVisible: drawCityIcons && this.layerVisibility.cities !== false
    });
    if (cityIconInstances > 0) layerOrder.push("cityIcons");

    const oceanCurrentProjection = createLineWidthProjection({map: this.map, camera: this.camera, canvas: this.canvas});
    const drawMs = roundMs(performance.now() - startedAt);
    const glError = gl.getError();
    this.lastDraw = {
      sequence: event.sequence,
      drawMs,
      glError,
      layerOrder,
      gridCellsDrawCalls,
      cityIconInstances,
      cityIconDrawCalls: cityIconInstances > 0 ? 1 : 0,
      oceanCurrentScale: this.camera.scale,
      oceanCurrentScreenWidth: {
        min: projectWorldLineWidth(this.oceanCurrentLayerStats.minWidth, oceanCurrentProjection).backingWidth,
        max: projectWorldLineWidth(this.oceanCurrentLayerStats.maxWidth, oceanCurrentProjection).backingWidth
      }
    };
    this.completePerformanceEvent(event, {ms: drawMs, glError, layerOrder: [...layerOrder]}, performance.now());
    if (updateOverlay) this.updateLabels();
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  getStats() {
    return {
      metadata: this.map?.metadata,
      grid: this.map?.grid?.metadata,
      pack: this.map?.pack?.metadata,
      features: this.map?.features?.metadata,
      vertexCount: this.vertexCount,
      shoreSurfaceDepth: {
        baseVertexCount: this.vertexCount,
        landCorrectionVertexCount: this.landCorrectionVertexCount,
        waterCorrectionVertexCount: this.waterCorrectionVertexCount,
        landCoverVertexCount: this.landCoverVertexCount,
        waterCoverVertexCount: this.waterCoverVertexCount,
        drawCount: 5,
        clearDepth: 0.5
      },
      routeVertexCount: this.routeVertexCount,
      routeTriangleCount: this.routeVertexCount / 3,
      routeBuildMs: this.routeBuildMs,
      routeRenderStats: {...this.routeRenderStats},
      routeWidthMode: this.routeWidthMode,
      routeStyleMode: "primary/secondary road + solid trail",
      tradeFlowVertexCount: this.tradeFlowVertexCount,
      tradeFlowTriangleCount: this.tradeFlowVertexCount / 3,
      tradeFlowBuildMs: this.tradeFlowBuildMs,
      tradeFlowRenderStats: {...this.tradeFlowRenderStats},
      tradeFlowPickItemCount: this.tradeFlowPickItems.length,
      riverVertexCount: this.riverVertexCount,
      riverTriangleCount: this.riverVertexCount / 3,
      riverBuildMs: this.riverBuildMs,
      riverWidthMode: this.riverWidthMode,
      riverWidthStats: this.riverWidthStats,
      selectionVertexCount: this.selectionVertexCount,
      selectionTriangleCount: this.selectionVertexCount / 3,
      selectionBuildMs: this.selectionBuildMs,
      selectionHighlightMode: selectionHighlightMode(this.selection, this.locateFlash, this.objectHighlights),
      heightTransformPreview: {
        ...this.heightTransformPreviewStats,
        buildMs: this.heightTransformPreviewBuildMs
      },
      heightCellSelection: {
        ...this.heightCellSelectionStats,
        buildMs: this.heightCellSelectionBuildMs
      },
      objectHighlightCount: this.objectHighlights.length,
      objectHighlights: this.objectHighlights.map(summarizeObjectHighlight),
      locateStatus: this.locateStatus,
      objectPickingIndex: this.objectPickingIndex ? {
        buckets: this.objectPickingIndex.bucketCount,
        bucketSize: roundValue(this.objectPickingIndex.bucketSize),
        cities: this.objectPickingIndex.cityCount,
        markers: this.objectPickingIndex.markerCount,
        routeSegments: this.objectPickingIndex.routeSegmentCount,
        riverSegments: this.objectPickingIndex.riverSegmentCount,
        maxBucketItems: this.objectPickingIndex.maxBucketItems
      } : null,
      objectCandidateCount: this.lastObjectCandidateCount,
      lineVertexCount: this.lineVertexCount,
      lineTriangleCount: this.lineVertexCount / 3,
      oceanCurrentVertexCount: this.oceanCurrentVertexCount,
      cellVisualMesh: summarizeCellVisualMesh(this.cellVisualMesh),
      cellSurfaceMode: this.viewOptions.smoothCellBorders !== false ? "visual-cells" : "hard-cells",
      boundaryLineMode: boundaryLineModeForOptions(this.viewOptions, this.cellVisualMesh, this.shoreVisualPaths),
      shoreVisual: summarizeShoreVisualPaths(this.shoreVisualPaths),
      stateVisual: summarizePoliticalVisualPaths(this.stateVisualPaths, STATE_VISUAL_STYLE),
      provinceVisual: summarizePoliticalVisualPaths(this.provinceVisualPaths, PROVINCE_VISUAL_STYLE),
      politicalVisualMeshes: summarizePoliticalVisualMeshes(this.politicalVisualMeshes),
      politicalMeshDebug: {
        mode: this.politicalMeshDebugMode,
        vertexCount: this.politicalMeshDebugVertexCount,
        triangleCount: this.politicalMeshDebugVertexCount / 3
      },
      diagnostics: {
        gridCells: summarizeGridCellDiagnostics(this.gridCellDiagnostics)
      },
      pointVertexCount: this.pointVertexCount,
      cityIconCount: this.cityIconCount,
      visibleCityIconCount: this.visibleCityIconCount,
      cityIconScaleThreshold: this.cityIconScaleThreshold,
      markerCount: this.map?.markers?.metadata?.markers || 0,
      markerIconCount: this.markerIconCount,
      visibleMarkerIconCount: this.visibleMarkerIconCount,
      markerIconScaleThreshold: this.markerIconScaleThreshold,
      militaryIconCount: this.militaryIconCount,
      visibleMilitaryIconCount: this.visibleMilitaryIconCount,
      labelCount: this.labelCount,
      visibleLabelCount: this.visibleLabelCount,
      cityLabelCount: this.cityLabelCount,
      visibleCityLabelCount: this.visibleCityLabelCount,
      stateLabelCount: this.stateLabelCount,
      visibleStateLabelCount: this.visibleStateLabelCount,
      provinceLabelCount: this.provinceLabelCount,
      visibleProvinceLabelCount: this.visibleProvinceLabelCount,
      colorMode: this.colorMode,
      canvasFilter: this.visualTheme?.effects?.canvasFilter || "none",
      viewOptions: {...this.viewOptions},
      unitPreferences: {...this.unitPreferences},
      labelOptions: {...this.labelOptions},
      layerVisibility: {...this.layerVisibility},
      oceanCurrentLayer: {...this.oceanCurrentLayerStats, minWidth: Number.isFinite(this.oceanCurrentLayerStats.minWidth) ? this.oceanCurrentLayerStats.minWidth : 0},
      canvasSize: {...this.canvasSize},
      camera: {...this.camera},
      performanceEvents: this.getPerformanceEvents(),
      loadMap: this.lastLoad,
      draw: this.lastDraw,
      overlay: {
        childCount: this.overlay?.childElementCount || 0,
        update: {...this.lastOverlayUpdate},
        interactionSuspended: this.overlayInteractionSuspended,
        committedCamera: {...this.overlayCommittedCamera},
        previewTransform: {...this.overlayPreviewTransform}
      },
      cityIconWebgl: this.cityIconLayer.snapshot(),
      viewportPreview: {
        pendingFrame: Boolean(this.viewportPreviewFrame),
        requests: this.viewportPreviewRequests,
        coalesced: this.viewportPreviewCoalesced
      },
      dynamicMeshCache: {
        routesDirty: this.dynamicBuffersDirty.routes,
        tradeFlowsDirty: this.dynamicBuffersDirty.tradeFlows,
        riversDirty: this.dynamicBuffersDirty.rivers,
        selectionDirty: this.dynamicBuffersDirty.selection,
        routeBufferCamera: {...this.routeBufferCamera},
        routeDrawRanges: structuredClone(this.routeDrawRanges),
        riverBufferCamera: {...this.riverBufferCamera},
        routePreviewTransform: viewportBufferTransform(this.routeBufferCamera, this.camera),
        riverPreviewTransform: viewportBufferTransform(this.riverBufferCamera, this.camera)
      },
      webgl2: true
    };
  }

  pickClientPoint(clientX, clientY) {
    if (!this.map) return null;
    const label = this.pickLabel(clientX, clientY);
    const markerIcon = this.pickMarkerIcon(clientX, clientY);
    const militaryIcon = this.pickMilitaryIcon(clientX, clientY);
    const world = this.screenToWorld(clientX, clientY);
    if (isUndevelopedWorldPoint(this.map, world)) {
      this.lastObjectCandidateCount = 0;
      return buildUndevelopedPickResult(this.map, world, "outside-map");
    }
    const result = pickGridCell(this.map, world.x, world.y);
    if (!result || result.gridCell === null) {
      this.lastObjectCandidateCount = 0;
      return buildUndevelopedPickResult(this.map, world, "no-cell", result?.candidates || 0);
    }
    const cityObject = this.layerVisibility.cities || this.layerVisibility.population
      ? pickCity(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(9))
      : null;
    const marker = markerIcon || pickMarker(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(8), item => isMarkerLayerVisible(item, this.layerVisibility));
    const military = militaryIcon || (this.layerVisibility.military !== false ? pickMilitary(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(13)) : null);
    const highlightedConnector = this.pickHighlightedConnector(world.x, world.y, this.pickThresholdWorld(9));
    const tradeFlow = this.layerVisibility.tradeFlows
      ? this.pickTradeFlow(world.x, world.y, this.pickThresholdWorld(9))
      : highlightedConnector?.kind === OBJECT_KIND.TRADE_FLOW ? highlightedConnector : null;
    const diplomacyRelation = highlightedConnector?.kind === OBJECT_KIND.DIPLOMACY_RELATION ? highlightedConnector : null;
    const route = this.layerVisibility.routes ? pickRoute(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(7)) : null;
    const river = this.layerVisibility.rivers ? pickRiver(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(9)) : null;
    const lake = pickLakeObject(this.map, result);
    const politicalObject = pickPoliticalObject(this.map, result, this.colorMode);
    const object = militaryIcon || markerIcon || label || diplomacyRelation || tradeFlow || lake || cityObject || marker || military || river || route || politicalObject;
    this.lastObjectCandidateCount = (label ? 1 : 0) + (cityObject?.candidateCount || 0) + (marker?.candidateCount || 0) + (military?.candidateCount || 0) + (highlightedConnector?.candidateCount || tradeFlow?.candidateCount || 0) + (route?.candidateCount || 0) + (river?.candidateCount || 0) + (lake ? 1 : 0) + (politicalObject ? 1 : 0);
    const gridPackCellCount = Number.isInteger(result.gridCell)
      ? Number(this.gridCellDiagnostics.packCounts?.[result.gridCell] || 0)
      : 0;
    return result ? {...result, gridPackCellCount, label, cityObject, marker, military, tradeFlow, diplomacyRelation, route, river, lake, politicalObject, object, objectCandidates: this.lastObjectCandidateCount, worldX: roundValue(result.worldX), worldY: roundValue(result.worldY)} : null;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const mapX = (((ndcX - this.camera.offsetX) / this.camera.scale + 1) / 2) * this.map.metadata.graphWidth;
    const mapY = ((1 - (ndcY - this.camera.offsetY) / this.camera.scale) / 2) * this.map.metadata.graphHeight;
    return {x: mapX, y: mapY};
  }

  updateRouteBuffer() {
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("routeMesh", {mode: "sync"}, startedAt);
    try {
      const camera = snapshotCamera(this.camera);
      const {vertices: routeVertices, stats, drawRanges} = buildRouteMeshVertices(this.map, camera, this.canvas, this.selection, this.objectHighlights, this.visualTheme);
      this.routeVertexCount = routeVertices.length / 6;
      this.routeDrawRanges = drawRanges;
      this.routeRenderStats = stats;
      const upload = this.recordBufferUpload("route-screen-mesh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, routeVertices, this.gl.DYNAMIC_DRAW);
      }, {bufferGroup: "route"});
      this.routeBufferCamera = snapshotViewportCamera(camera);
      this.routeBuildMs = roundMs(performance.now() - startedAt);
      this.dynamicBuffersDirty.routes = false;
      this.completePerformanceEvent(event, {ms: this.routeBuildMs, uploadMs: upload.ms, vertexCount: this.routeVertexCount, aborted: false}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  async updateRouteBufferAsync({yieldToBrowser = () => Promise.resolve(), sliceMs = ROUTE_BUILD_SLICE_MS, shouldContinue = () => true} = {}) {
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("routeMesh", {mode: "async", sliceMs}, startedAt);
    try {
      const camera = snapshotCamera(this.camera);
      const selection = this.selection ? {...this.selection} : null;
      const objectHighlights = this.objectHighlights.map(item => ({...item}));
      const {vertices: routeVertices, stats, drawRanges} = await buildRouteMeshVerticesAsync(this.map, camera, this.canvas, selection, objectHighlights, {
        yieldToBrowser,
        sliceMs,
        shouldContinue
      }, this.visualTheme);
      if (stats.aborted || !shouldContinue()) {
        this.cancelPerformanceEvent(event, stats.aborted ? "builder-aborted" : "viewport-superseded", {ms: roundMs(performance.now() - startedAt), aborted: Boolean(stats.aborted)}, performance.now());
        return false;
      }
      this.routeVertexCount = routeVertices.length / 6;
      this.routeDrawRanges = drawRanges;
      this.routeRenderStats = stats;
      const upload = this.recordBufferUpload("route-screen-mesh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, routeVertices, this.gl.DYNAMIC_DRAW);
      }, {bufferGroup: "route"});
      this.routeBufferCamera = snapshotViewportCamera(camera);
      this.routeBuildMs = roundMs(performance.now() - startedAt);
      this.dynamicBuffersDirty.routes = false;
      this.completePerformanceEvent(event, {ms: this.routeBuildMs, uploadMs: upload.ms, vertexCount: this.routeVertexCount, aborted: false}, performance.now());
      return true;
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  clearRouteBuffer() {
    this.routeVertexCount = 0;
    this.routeDrawRanges = emptyRouteDrawRanges();
    this.routeRenderStats = normalizeRouteRenderStats(emptyRouteRenderStats());
    this.recordBufferUpload("route-clear", () => {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
    }, {bufferGroup: "route"});
    this.routeBufferCamera = snapshotViewportCamera(this.camera);
    this.routeBuildMs = 0;
    this.dynamicBuffersDirty.routes = false;
  }

  clearTradeFlowBuffer() {
    this.tradeFlowVertexCount = 0;
    this.tradeFlowPickItems = [];
    this.tradeFlowRenderStats = emptyTradeFlowRenderStats();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.tradeFlowBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
    this.tradeFlowBuildMs = 0;
    this.dynamicBuffersDirty.tradeFlows = false;
  }

  updateTradeFlowBuffer() {
    const startedAt = performance.now();
    const {vertices, stats, pickItems} = buildTradeFlowMeshVertices(this.map, this.camera, this.canvas);
    this.tradeFlowVertexCount = vertices.length / 6;
    this.tradeFlowPickItems = pickItems;
    this.tradeFlowRenderStats = stats;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.tradeFlowBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.tradeFlowBuildMs = roundMs(performance.now() - startedAt);
    this.dynamicBuffersDirty.tradeFlows = false;
  }

  pickTradeFlow(worldX, worldY, maxDistance) {
    if (!this.tradeFlowPickItems.length) return null;
    let best = null;
    let candidateCount = 0;
    for (const item of this.tradeFlowPickItems) {
      candidateCount++;
      const distance = distanceToWorldSegment(worldX, worldY, item.from, item.to);
      if (distance > maxDistance || (best && distance >= best.distance)) continue;
      best = {
        kind: OBJECT_KIND.TRADE_FLOW,
        id: item.dealId,
        goodId: item.goodId,
        goodName: item.goodName,
        sellerType: item.sellerType,
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        buyerType: item.buyerType,
        buyerId: item.buyerId,
        buyerName: item.buyerName,
        units: item.units,
        basePrice: item.basePrice,
        price: item.price,
        effectivePrice: item.effectivePrice,
        priceDelta: item.priceDelta,
        pricePressure: item.pricePressure,
        priceSignalLabel: item.priceSignalLabel,
        value: item.value,
        tradeDistance: item.tradeDistance,
        distanceCost: item.distanceCost,
        distanceMultiplier: item.distanceMultiplier,
        source: item.source,
        sourceLabel: item.sourceLabel,
        distance,
        candidateCount
      };
    }
    if (best) best.candidateCount = candidateCount;
    return best;
  }

  pickHighlightedConnector(worldX, worldY, maxDistance) {
    return pickCompositeConnector(this.map, [this.selection, ...this.objectHighlights], worldX, worldY, maxDistance);
  }

  updateRiverBuffer() {
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("riverMesh", {mode: "sync"}, startedAt);
    try {
      const camera = snapshotCamera(this.camera);
      const {vertices, stats} = buildRiverMeshVertices(this.map, camera, this.canvas);
      this.riverVertexCount = vertices.length / 6;
      this.riverWidthStats = stats;
      const upload = this.recordBufferUpload("river-screen-mesh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
      }, {bufferGroup: "river"});
      this.riverBufferCamera = snapshotViewportCamera(camera);
      this.riverBuildMs = roundMs(performance.now() - startedAt);
      this.dynamicBuffersDirty.rivers = false;
      this.completePerformanceEvent(event, {ms: this.riverBuildMs, uploadMs: upload.ms, vertexCount: this.riverVertexCount, aborted: false}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  async updateRiverBufferAsync({yieldToBrowser = () => Promise.resolve(), sliceMs = RIVER_BUILD_SLICE_MS, shouldContinue = () => true} = {}) {
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("riverMesh", {mode: "async", sliceMs}, startedAt);
    try {
      const camera = snapshotCamera(this.camera);
      const {vertices, stats} = await buildRiverMeshVerticesAsync(this.map, camera, this.canvas, {
        yieldToBrowser,
        sliceMs,
        shouldContinue
      });
      if (stats.aborted || !shouldContinue()) {
        this.cancelPerformanceEvent(event, stats.aborted ? "builder-aborted" : "viewport-superseded", {ms: roundMs(performance.now() - startedAt), aborted: Boolean(stats.aborted)}, performance.now());
        return false;
      }
      this.riverVertexCount = vertices.length / 6;
      this.riverWidthStats = stats;
      const upload = this.recordBufferUpload("river-screen-mesh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
      }, {bufferGroup: "river"});
      this.riverBufferCamera = snapshotViewportCamera(camera);
      this.riverBuildMs = roundMs(performance.now() - startedAt);
      this.dynamicBuffersDirty.rivers = false;
      this.completePerformanceEvent(event, {ms: this.riverBuildMs, uploadMs: upload.ms, vertexCount: this.riverVertexCount, aborted: false}, performance.now());
      return true;
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  updateSelectionBuffer() {
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("selectionMesh", {mode: "sync"}, startedAt);
    try {
      const selectionVertices = buildSelectionMeshVertices(this.map, this.camera, this.canvas, this.selection, this.locateFlash, this.objectHighlights, this.riverWaypointPreview);
      this.selectionVertexCount = selectionVertices.length / 6;
      const upload = this.recordBufferUpload("selection-screen-mesh", () => {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.selectionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, selectionVertices, this.gl.DYNAMIC_DRAW);
      }, {bufferGroup: "selection"});
      this.selectionBuildMs = roundMs(performance.now() - startedAt);
      this.dynamicBuffersDirty.selection = false;
      this.completePerformanceEvent(event, {ms: this.selectionBuildMs, uploadMs: upload.ms, vertexCount: this.selectionVertexCount}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  pickThresholdWorld(pixels) {
    const rect = this.canvas.getBoundingClientRect();
    const worldPerPixelX = this.map.metadata.graphWidth / Math.max(1, rect.width * this.camera.scale);
    const worldPerPixelY = this.map.metadata.graphHeight / Math.max(1, rect.height * this.camera.scale);
    return Math.max(worldPerPixelX, worldPerPixelY) * pixels;
  }

  setSelection(object, {draw = true} = {}) {
    const previous = this.selection;
    const next = object || null;
    if (sameSelectionTarget(previous, next)) {
      const sameReference = previous === next;
      this.selection = next;
      if (!sameReference && !this.overlayInteractionSuspended) this.dynamicBuffersDirty.selection = true;
      if (draw && this.dynamicBuffersDirty.selection && !this.overlayInteractionSuspended) {
        this.draw();
        return true;
      }
      return false;
    }
    this.selection = next;
    this.dynamicBuffersDirty.selection = true;
    if (previous?.kind === OBJECT_KIND.ROUTE || this.selection?.kind === OBJECT_KIND.ROUTE) {
      this.dynamicBuffersDirty.routes = true;
    }
    if (!draw) return true;
    if (this.overlayInteractionSuspended) {
      this.draw({updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false});
      return true;
    }
    this.draw();
    return true;
  }

  setObjectHighlights(objects, {draw = true} = {}) {
    const previousHasRoutes = this.objectHighlights.some(item => item.kind === OBJECT_KIND.ROUTE);
    this.objectHighlights = deduplicateObjectHighlights(objects);
    const nextHasRoutes = this.objectHighlights.some(item => item.kind === OBJECT_KIND.ROUTE);
    this.dynamicBuffersDirty.selection = true;
    if (previousHasRoutes || nextHasRoutes) this.dynamicBuffersDirty.routes = true;
    if (!draw) return;
    this.draw();
  }

  clearObjectHighlights(options = {}) {
    this.setObjectHighlights([], options);
  }

  setRiverWaypointPreview(preview, {draw = true} = {}) {
    this.riverWaypointPreview = preview?.valid ? preview : null;
    this.riverWaypointPreviewRevision++;
    this.dynamicBuffersDirty.selection = true;
    if (draw) this.draw();
  }

  clearRiverWaypointPreview(options = {}) {
    this.setRiverWaypointPreview(null, options);
  }

  setHeightTransformPreview(changes, {draw = true} = {}) {
    const startedAt = performance.now();
    const {vertices, stats} = buildHeightTransformPreviewMesh(this.map, changes);
    this.heightTransformPreviewVertexCount = vertices.length / 6;
    this.heightTransformPreviewStats = stats;
    this.heightTransformPreviewBuildMs = roundMs(performance.now() - startedAt);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heightTransformPreviewBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    if (draw) this.draw();
    return {...stats, buildMs: this.heightTransformPreviewBuildMs};
  }

  clearHeightTransformPreview(options = {}) {
    if (!this.heightTransformPreviewVertexCount && !this.heightTransformPreviewStats.cells) {
      return {...this.heightTransformPreviewStats, buildMs: this.heightTransformPreviewBuildMs};
    }
    return this.setHeightTransformPreview([], options);
  }

  setHeightCellSelection(cellIds, {draw = true, weights = null} = {}) {
    const startedAt = performance.now();
    const {vertices, stats} = buildHeightCellSelectionMesh(this.map, cellIds, weights);
    this.heightCellSelectionVertexCount = vertices.length / 6;
    this.heightCellSelectionStats = stats;
    this.heightCellSelectionBuildMs = roundMs(performance.now() - startedAt);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heightCellSelectionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    if (draw) this.draw();
    return {...stats, buildMs: this.heightCellSelectionBuildMs};
  }

  clearHeightCellSelection(options = {}) {
    if (!this.heightCellSelectionVertexCount && !this.heightCellSelectionStats.cells) {
      return {...this.heightCellSelectionStats, buildMs: this.heightCellSelectionBuildMs};
    }
    return this.setHeightCellSelection([], options);
  }

  invalidateDynamicBuffers(parts = {}) {
    if (parts.viewport) this.markViewportBuffersDirty();
    if (parts.routes) this.dynamicBuffersDirty.routes = true;
    if (parts.tradeFlows) this.clearTradeFlowBuffer();
    if (parts.rivers) this.dynamicBuffersDirty.rivers = true;
    if (parts.selection) this.dynamicBuffersDirty.selection = true;
  }

  markViewportBuffersDirty() {
    this.dynamicBuffersDirty.routes = true;
    this.dynamicBuffersDirty.tradeFlows = false;
    this.dynamicBuffersDirty.rivers = true;
    this.dynamicBuffersDirty.selection = true;
  }

  markAllDynamicBuffersDirty() {
    this.dynamicBuffersDirty.routes = true;
    this.dynamicBuffersDirty.tradeFlows = false;
    this.dynamicBuffersDirty.rivers = true;
    this.dynamicBuffersDirty.selection = true;
  }

  requestViewportPreview(interaction = null) {
    if (!this.map) return;
    this.viewportPreviewRequests += 1;
    this.prepareViewportPreview(interaction?.kind);
    if (this.viewportPreviewFrame) {
      this.viewportPreviewCoalesced += 1;
      return;
    }
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    const requestFrame = typeof view.requestAnimationFrame === "function"
      ? view.requestAnimationFrame.bind(view)
      : callback => setTimeout(callback, 0);
    this.viewportPreviewFrame = requestFrame(() => {
      this.viewportPreviewFrame = 0;
      this.flushViewportPreview();
    });
  }

  drawViewportPreview() {
    if (!this.map) return;
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    if (this.viewportPreviewFrame) {
      if (typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(this.viewportPreviewFrame);
      else if (typeof view.clearTimeout === "function") view.clearTimeout(this.viewportPreviewFrame);
      this.viewportPreviewFrame = 0;
    }
    this.viewportPreviewRequests += 1;
    this.prepareViewportPreview();
    this.flushViewportPreview();
  }

  prepareViewportPreview(interactionKind = null) {
    const committedScale = Number(this.overlayCommittedCamera?.scale ?? this.camera.scale);
    const nextKind = interactionKind || (Math.abs(this.camera.scale - committedScale) < 0.000001 ? "pan" : "zoom");
    if (!this.overlayInteractionSuspended) this.viewportInteractionKind = nextKind;
    else if (nextKind === "zoom") this.viewportInteractionKind = "zoom";
    this.viewportCommitVersion += 1;
    this.suspendOverlayForInteraction();
    this.updateOverlayPreviewTransform();
    this.markViewportBuffersDirty();
    if (!this.viewportPointerInteractionKind) {
      this.scheduleViewportCommit({delayMs: nextKind === "zoom" ? 180 : 120});
    }
  }

  beginViewportPointerInteraction(interaction = null) {
    if (interaction?.kind !== "pan") return;
    this.viewportPointerInteractionKind = "pan";
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    if (this.viewportCommitTimer && typeof view.clearTimeout === "function") {
      view.clearTimeout(this.viewportCommitTimer);
      this.viewportCommitTimer = 0;
      if (this.viewportCommitEvent) {
        this.cancelPerformanceEvent(this.viewportCommitEvent, "pointer-interaction", {version: this.viewportCommitEvent.details.version}, performance.now());
        this.viewportCommitEvent = null;
      }
    }
    if (this.overlayInteractionSuspended) this.viewportCommitVersion += 1;
  }

  endViewportPointerInteraction(interaction = null) {
    if (interaction?.kind !== "pan" || this.viewportPointerInteractionKind !== "pan") return;
    this.viewportPointerInteractionKind = null;
    if (this.overlayInteractionSuspended) this.scheduleViewportCommit({delayMs: 24});
  }

  flushViewportPreview() {
    if (!this.map) return;
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("viewportPreview", {
      version: this.viewportCommitVersion,
      requests: this.viewportPreviewRequests,
      coalesced: this.viewportPreviewCoalesced
    }, startedAt);
    try {
      this.updateOverlayPreviewTransform();
      this.draw({updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false});
      this.onViewChange({phase: "preview"});
      this.completePerformanceEvent(event, {
        version: this.viewportCommitVersion,
        requests: this.viewportPreviewRequests,
        coalesced: this.viewportPreviewCoalesced,
        overlayTransform: {...this.overlayPreviewTransform}
      }, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {version: this.viewportCommitVersion}, performance.now());
      throw error;
    }
  }

  suspendOverlayForInteraction() {
    if (this.overlayInteractionSuspended) return;
    this.overlayInteractionSuspended = true;
    this.stage?.classList.add("map-stage--interaction-transform");
    this.overlay?.classList.add("map-overlay--interaction-transform");
  }

  resumeOverlayAfterInteraction() {
    if (!this.overlayInteractionSuspended) return;
    this.overlayInteractionSuspended = false;
    this.stage?.classList.remove("map-stage--interaction-transform");
    this.overlay?.classList.remove("map-overlay--interaction-transform");
    this.stage?.style.removeProperty("--map-interaction-transform");
    this.stage?.style.removeProperty("--map-interaction-inverse-scale");
    this.stage?.style.removeProperty("--state-label-preview-opacity");
    this.overlayPreviewTransform = {scale: 1, translateX: 0, translateY: 0};
  }

  updateOverlayPreviewTransform() {
    if (!this.overlayInteractionSuspended || !this.stage) return;
    const from = this.overlayCommittedCamera || snapshotViewportCamera(this.camera);
    const to = this.camera;
    const width = Math.max(1, this.canvas.getBoundingClientRect().width);
    const height = Math.max(1, this.canvas.getBoundingClientRect().height);
    const scale = to.scale / Math.max(0.000001, from.scale);
    const translateX = width * 0.5 * (1 - scale + to.offsetX - scale * from.offsetX);
    const translateY = height * 0.5 * (1 - scale - to.offsetY + scale * from.offsetY);
    this.overlayPreviewTransform = {
      scale: roundTransformScale(scale),
      translateX: snapCssPixel(translateX, this.canvasSize?.pixelRatio),
      translateY: snapCssPixel(translateY, this.canvasSize?.pixelRatio)
    };
    const preview = this.overlayPreviewTransform;
    this.stage.style.setProperty("--map-interaction-transform", `matrix(${preview.scale}, 0, 0, ${preview.scale}, ${preview.translateX}, ${preview.translateY})`);
    this.stage.style.setProperty("--map-interaction-inverse-scale", String(roundTransformScale(1 / Math.max(0.000001, preview.scale))));
    this.stage.style.setProperty("--state-label-preview-opacity", String(stateLabelScaleBehavior(to.scale).opacity));
  }

  scheduleViewportCommit({delayMs = 120} = {}) {
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    if (this.viewportCommitTimer && typeof view.clearTimeout === "function") {
      view.clearTimeout(this.viewportCommitTimer);
      this.viewportCommitTimer = 0;
    }
    if (this.viewportCommitEvent) this.cancelPerformanceEvent(this.viewportCommitEvent, "superseded", {version: this.viewportCommitEvent.details.version}, performance.now());
    const setTimer = typeof view.setTimeout === "function" ? view.setTimeout.bind(view) : setTimeout;
    const version = this.viewportCommitVersion;
    const event = this.queuePerformanceEvent("viewportCommit", {version, delayMs}, performance.now());
    this.viewportCommitEvent = event;
    try {
      this.viewportCommitTimer = setTimer(() => {
        this.viewportCommitTimer = 0;
        this.startQueuedPerformanceEvent(event, performance.now());
        void this.commitViewportAfterInteraction(version, event);
      }, delayMs);
    } catch (error) {
      this.viewportCommitTimer = 0;
      if (this.viewportCommitEvent === event) this.viewportCommitEvent = null;
      this.failPerformanceEvent(event, error, {version, phase: "timer-install"}, performance.now());
      throw error;
    }
  }

  async commitViewportAfterInteraction(version, scheduledEvent = null) {
    const event = scheduledEvent || this.beginPerformanceEvent("viewportCommit", {version, delayMs: 0}, performance.now());
    if (!this.map) {
      this.cancelPerformanceEvent(event, "map-unavailable", {version}, performance.now());
      if (this.viewportCommitEvent === event) this.viewportCommitEvent = null;
      this.resumeOverlayAfterInteraction();
      return;
    }
    const shouldContinue = () => this.viewportCommitVersion === version;
    try {
      const rebuilt = await this.rebuildViewportDynamicBuffersAsync(shouldContinue);
      if (!rebuilt || !shouldContinue()) {
        this.cancelPerformanceEvent(event, "superseded", {version}, performance.now());
        return;
      }
      this.resumeOverlayAfterInteraction();
      this.draw({updateDynamicBuffers: false});
      this.overlayCommittedCamera = snapshotViewportCamera(this.camera);
      this.onViewChange({phase: "commit"});
      if (this.locateFlash && !this.locateFlashFrame) this.animateLocateFlash();
      this.completePerformanceEvent(event, {version}, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {version}, performance.now());
      throw error;
    } finally {
      if (this.viewportCommitEvent === event) this.viewportCommitEvent = null;
      if (this.viewportCommitVersion === version) this.viewportInteractionKind = null;
    }
  }

  async rebuildViewportDynamicBuffersAsync(shouldContinue) {
    if (!this.map) return false;
    if (!shouldContinue()) return false;
    if (this.dynamicBuffersDirty.routes && this.layerVisibility.routes) {
      const routesReady = await this.updateRouteBufferAsync({
        yieldToBrowser: () => this.yieldViewportCommitFrame(),
        sliceMs: ROUTE_BUILD_SLICE_MS,
        shouldContinue
      });
      if (!routesReady || !shouldContinue()) return false;
      await this.yieldViewportCommitFrame();
    }
    if (!shouldContinue()) return false;
    if (this.dynamicBuffersDirty.rivers && this.layerVisibility.rivers) {
      const riversReady = await this.updateRiverBufferAsync({
        yieldToBrowser: () => this.yieldViewportCommitFrame(),
        sliceMs: RIVER_BUILD_SLICE_MS,
        shouldContinue
      });
      if (!riversReady || !shouldContinue()) return false;
      await this.yieldViewportCommitFrame();
    }
    if (!shouldContinue()) return false;
    if (this.dynamicBuffersDirty.selection) {
      this.updateSelectionBuffer();
      if (!shouldContinue()) return false;
    }
    return true;
  }

  async yieldViewportCommitFrame() {
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    if (typeof view.requestAnimationFrame === "function") {
      await new Promise(resolve => view.requestAnimationFrame(() => resolve()));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  locateObject(object, options = {}) {
    const bounds = getObjectBounds(this.map, object);
    if (!bounds) {
      this.locateStatus = "not found";
      return false;
    }

    const padding = options.padding ?? 0.22;
    const minScale = options.minScale ?? defaultLocateMinScale(object);
    const maxScale = options.maxScale ?? 18;
    const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
    const ndcWidth = (boundsWidth / this.map.metadata.graphWidth) * 2;
    const ndcHeight = (boundsHeight / this.map.metadata.graphHeight) * 2;
    const available = 2 * (1 - padding);
    const nextScale = clamp(Math.min(available / ndcWidth, available / ndcHeight), minScale, maxScale);
    const focus = object.kind === OBJECT_KIND.ZONE ? selectionPoint(this.map, object) : null;
    const centerX = focus?.x ?? (bounds.minX + bounds.maxX) / 2;
    const centerY = focus?.y ?? (bounds.minY + bounds.maxY) / 2;
    const [ndcX, ndcY] = worldToNdcPoint(createRenderContext(this.map), [centerX, centerY]);

    this.camera.scale = nextScale;
    this.camera.offsetX = -ndcX * nextScale;
    this.camera.offsetY = -ndcY * nextScale;
    this.locateStatus = `${object.kind} #${object.id}`;
    this.startLocateFlash(object, {deferAnimation: true});
    this.setSelection(object, {draw: false});
    this.drawViewportPreview();
    return true;
  }

  locateBounds(bounds, options = {}) {
    if (!this.map || !bounds) {
      this.locateStatus = "not found";
      return false;
    }

    const padding = options.padding ?? 0.22;
    const minScale = options.minScale ?? 1.4;
    const maxScale = options.maxScale ?? 18;
    const boundsWidth = Math.max(1, Number(bounds.maxX) - Number(bounds.minX));
    const boundsHeight = Math.max(1, Number(bounds.maxY) - Number(bounds.minY));
    const ndcWidth = (boundsWidth / this.map.metadata.graphWidth) * 2;
    const ndcHeight = (boundsHeight / this.map.metadata.graphHeight) * 2;
    const available = 2 * (1 - padding);
    const nextScale = clamp(Math.min(available / ndcWidth, available / ndcHeight), minScale, maxScale);
    const centerX = (Number(bounds.minX) + Number(bounds.maxX)) / 2;
    const centerY = (Number(bounds.minY) + Number(bounds.maxY)) / 2;
    const [ndcX, ndcY] = worldToNdcPoint(createRenderContext(this.map), [centerX, centerY]);

    this.camera.scale = nextScale;
    this.camera.offsetX = -ndcX * nextScale;
    this.camera.offsetY = -ndcY * nextScale;
    this.locateStatus = options.status || "bounds";
    this.drawViewportPreview();
    return true;
  }

  startLocateFlash(object, {deferAnimation = false} = {}) {
    this.locateFlash = {
      kind: object.kind,
      id: object.id,
      until: performance.now() + 2600,
      phase: -1
    };
    this.dynamicBuffersDirty.selection = true;
    if (deferAnimation && this.locateFlashFrame) {
      const view = this.canvas.ownerDocument?.defaultView || globalThis;
      if (typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(this.locateFlashFrame);
      this.locateFlashFrame = 0;
    }
    if (deferAnimation) return;
    if (!this.locateFlashFrame) this.animateLocateFlash();
  }

  animateLocateFlash() {
    if (this.overlayInteractionSuspended) {
      this.locateFlashFrame = requestAnimationFrame(() => this.animateLocateFlash());
      return;
    }
    if (!this.locateFlash || performance.now() > this.locateFlash.until) {
      this.locateFlash = null;
      this.locateFlashFrame = 0;
      this.dynamicBuffersDirty.selection = true;
      this.draw({updateOverlay: false});
      this.onViewChange({phase: "commit"});
      return;
    }
    const phase = Math.floor((this.locateFlash.until - performance.now()) / 180);
    if (phase !== this.locateFlash.phase) {
      this.locateFlash.phase = phase;
      this.dynamicBuffersDirty.selection = true;
      this.draw({updateOverlay: false});
    }
    this.locateFlashFrame = requestAnimationFrame(() => this.animateLocateFlash());
  }

  buildLabels(map) {
    if (!this.overlay) {
      this.gridCellIdLayer = null;
      this.labelItems = [];
      this.cityIconItems = [];
      this.cityIconItemsById = new Map();
      this.cityIconLayer.setInstances([]);
      this.markerIconItems = [];
      this.militaryIconItems = [];
      this.labelCount = 0;
      this.visibleLabelCount = 0;
      this.cityLabelCount = 0;
      this.visibleCityLabelCount = 0;
      this.stateLabelCount = 0;
      this.visibleStateLabelCount = 0;
      this.provinceLabelCount = 0;
      this.visibleProvinceLabelCount = 0;
      this.cityIconCount = 0;
      this.visibleCityIconCount = 0;
      this.markerIconCount = 0;
      this.visibleMarkerIconCount = 0;
      this.militaryIconCount = 0;
      this.visibleMilitaryIconCount = 0;
      return;
    }
    this.overlay.replaceChildren();
    const documentRef = this.overlay.ownerDocument || document;
    const fragment = documentRef.createDocumentFragment();
    const labels = [...getLabelStates(map), ...getLabelProvinces(map), ...getLabelCities(map, this.labelOptions), ...getLabelZones(map), ...getCustomLabels(map)].map(item => {
      const node = documentRef.createElement("span");
      const styleType = labelStyleTypeForTarget(item.targetKind, item.city);
      node.className = semanticLabelClassName(item.targetKind, item.city);
      markDynamicCanvasTextNode(node, styleType);
      const {contentNode, glyphNodes} = appendLabelNodeText(node, item, documentRef, styleType);
      node.dataset.labelTargetKind = item.targetKind;
      node.dataset.labelTargetId = String(item.targetId);
      if (item.targetKind === LABEL_TARGET_KIND.ZONE) node.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        this.onSelect({object: {kind: OBJECT_KIND.ZONE, id: item.targetId}});
      });
      const resolvedStyle = resolveLabelStyle(map, styleType, this.visualTheme);
      const layout = resolveLabelLayout(map, item.targetKind, item.targetId, item.city, {
        x: item.x,
        y: item.y,
        priority: item.priority,
        minScale: item.minScale
      });
      node.dataset.labelStyleType = styleType;
      node.dataset.labelPriority = String(layout.priority);
      node.dataset.labelPriorityMode = layout.manualPriority ? "manual" : "auto";
      node.dataset.labelPositionLocked = String(layout.locked);
      node.classList.toggle("position-locked", layout.locked);
      applyResolvedLabelStyle(node, resolvedStyle);
      fragment.append(node);
      return {...item, x: layout.position.x, y: layout.position.y, minScale: layout.minScale, styleType, resolvedStyle, layout, metrics: estimateLabelTextBox(item.text, resolvedStyle), node, contentNode, glyphNodes, box: null, visible: false, buffered: false, politicalCandidateIndex: null};
    });
    this.labelItems = hasManualLabelPriorities(map) ? sortLabelItemsByPriority(labels) : labels;
    const cityLabelWidths = new Map(labels
      .filter(item => item.targetKind === LABEL_TARGET_KIND.CITY)
      .map(item => [String(item.targetId), item.metrics?.width]));
    this.cityIconItems = getCityIconItems(map).map(item => ({
      ...item,
      nameWidthCss: cityLabelWidths.get(String(item.id)),
      maxSizeFactor: cityIconMaxSizeFactor({
        silhouette: item.silhouette,
        roles: item.roles,
        nameWidthCss: cityLabelWidths.get(String(item.id))
      }),
      box: null,
      visible: false,
      buffered: false,
      visibilityTarget: 0,
      selected: false
    }));
    this.cityIconItemsById = new Map(this.cityIconItems.map(item => [String(item.id), item]));
    this.cityIconLayer.setInstances(this.cityIconItems, {nowMs: performance.now()});
    this.markerIconItems = getMarkerIconItems(map).map(item => {
      const node = documentRef.createElement("span");
      node.className = markerIconClassName(item);
      node.title = item.tooltip;
      node.setAttribute("aria-label", item.tooltip);
      node.dataset.markerId = String(item.id);
      node.dataset.markerCategory = item.category || "marker";
      applyMarkerIconPalette(node, item);
      const content = documentRef.createElement("span");
      content.className = "marker-map-icon-content map-overlay-fixed-content";
      content.innerHTML = markerIconSvg(item);
      node.append(content);
      fragment.append(node);
      return {...item, node, box: null, visible: false, buffered: false};
    });
    this.militaryIconItems = getMilitaryIconItems(map, this.unitPreferences).map(item => {
      const node = documentRef.createElement("span");
      node.className = militaryIconClassName(item);
      node.title = item.tooltip;
      node.setAttribute("aria-label", item.tooltip);
      node.dataset.militaryId = String(item.id);
      node.dataset.stateId = String(item.stateId);
      const symbol = documentRef.createElement("span");
      symbol.className = "military-map-icon-symbol";
      const icon = documentRef.createElement("img");
      icon.className = "military-map-icon-image";
      icon.src = militaryIconDataUrl(item.iconVariant);
      icon.alt = item.iconLabel || item.dominantUnitLabel || "军种";
      icon.decoding = "async";
      icon.draggable = false;
      symbol.append(icon);
      const count = documentRef.createElement("span");
      count.className = "military-map-icon-count";
      setDynamicCanvasTextContent(count, "military-count", formatMilitaryTroops(item.troops, this.unitPreferences));
      const content = documentRef.createElement("span");
      content.className = "military-map-icon-content map-overlay-fixed-content";
      content.append(symbol, count);
      node.append(content);
      fragment.append(node);
      return {...item, node, box: null, visible: false, buffered: false};
    });
    this.selectionMarker = documentRef.createElement("span");
    this.selectionMarker.className = "selection-marker";
    this.selectionMarker.style.display = "none";
    fragment.append(this.selectionMarker);
    this.gridCellIdLayer = documentRef.createElement("div");
    this.gridCellIdLayer.className = "grid-cell-diagnostic-label-layer";
    markDynamicCanvasTextNode(this.gridCellIdLayer, "grid-cell-id");
    fragment.append(this.gridCellIdLayer);
    this.overlay.append(fragment);
    this.labelCount = this.labelItems.length;
    this.cityLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.CITY).length;
    this.stateLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.STATE).length;
    this.provinceLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.PROVINCE).length;
    this.cityIconCount = this.cityIconItems.length;
    this.markerIconCount = this.markerIconItems.length;
    this.militaryIconCount = this.militaryIconItems.length;
    this.visibleLabelCount = 0;
    this.visibleCityLabelCount = 0;
    this.visibleStateLabelCount = 0;
    this.visibleProvinceLabelCount = 0;
    this.visibleCityIconCount = 0;
    this.visibleMarkerIconCount = 0;
    this.visibleMilitaryIconCount = 0;
  }

  updateLabels() {
    if (!this.overlay || !this.map) {
      this.lastOverlayUpdate = emptyOverlayUpdateStats();
      return;
    }
    const startedAt = performance.now();
    const event = this.beginPerformanceEvent("overlay", {interactionSuspended: this.overlayInteractionSuspended}, startedAt);
    try {
    const rect = this.canvas.getBoundingClientRect();
    const occupied = [];
    const occupiedCityLabels = [];
    const occupiedStates = [];
    const occupiedProvinces = [];
    const occupiedByPriority = [];
    let visible = 0;
    let visibleCities = 0;
    let visibleStates = 0;
    let visibleProvinces = 0;
    let fallbackProvinces = 0;
    let stateCityOverlaps = 0;
    const scale = this.camera.scale;
    const preservePoliticalCandidate = this.viewportInteractionKind === "pan" || this.viewportInteractionKind === "zoom";
    const maxVisible = labelLimitForScale(scale, this.labelOptions.maxCityLabels);
    const padding = labelPaddingForScale(scale);
    const labelPrewarm = overlayLabelPrewarmCssPx(rect);
    const stateLabelScale = stateLabelScaleBehavior(scale);
    const priorityLayout = hasManualLabelPriorities(this.map);
    const labelItems = priorityLayout ? this.labelItems : automaticPoliticalLabelOrder(this.labelItems);

    const labelStartedAt = performance.now();
    for (const item of labelItems) {
      const selected = isSelectionForLabelItem(this.selection, item) || this.objectHighlights.some(highlight => isSelectionForLabelItem(highlight, item));
      const zoneLabel = item.targetKind === LABEL_TARGET_KIND.ZONE;
      const forceVisible = selected && (item.targetKind === LABEL_TARGET_KIND.CUSTOM || zoneLabel);
      item.node.classList.toggle("selected", selected);
      const stateLabel = item.targetKind === LABEL_TARGET_KIND.STATE;
      const provinceLabel = item.targetKind === LABEL_TARGET_KIND.PROVINCE;
      const politicalLabel = stateLabel || provinceLabel;
      const layerVisible = this.isLabelItemLayerVisible(item);
      const withinLimit = item.targetKind === LABEL_TARGET_KIND.CITY ? visibleCities < maxVisible : true;
      if (!layerVisible || (!forceVisible && (!withinLimit || scale < item.minScale || (stateLabel && !stateLabelScale.visible)))) {
        item.node.classList.toggle("visible", false);
        item.node.classList.toggle("buffered", false);
        item.node.classList.toggle("viewport-entering", false);
        item.node.classList.toggle("scale-entering", false);
        item.visible = false;
        item.buffered = false;
        item.box = null;
        item.node.classList.remove("collision-fallback", "city-overlap");
        continue;
      }
      const baseScreen = this.worldToScreen(item.x, item.y, rect);
      const politicalPrewarm = provinceLabel ? Math.min(labelPrewarm, PROVINCE_LABEL_PREWARM_MAX_CSS_PX) : labelPrewarm;
      let politicalPlacement = politicalLabel ? resolvePoliticalLabelPlacement({
        item,
        screen: baseScreen,
        obstacles: occupied,
        peers: stateLabel ? occupiedStates : [...occupiedStates, ...occupiedProvinces],
        viewport: expandedViewport(rect, politicalPrewarm),
        padding,
        locked: item.layout?.locked,
        preferredCandidateIndex: item.politicalCandidateIndex,
        retainPreferred: preservePoliticalCandidate && (item.visible || item.buffered),
        anchorAllowed: stateLabel && !item.layout?.locked && item.componentCellSet?.size
          ? anchor => stateLabelAnchorAllowed(this, item, anchor, rect)
          : null
      }) : null;
      if (politicalPlacement && preservePoliticalCandidate && (item.visible || item.buffered)) {
        politicalPlacement = retainPoliticalPlacementOffset(item, politicalPlacement, baseScreen);
      }
      const screen = politicalPlacement?.anchor || baseScreen;
      const labelAnchor = politicalLabel ? screen : overlayLabelAnchor(this, item, screen, scale);
      const box = politicalPlacement?.box || labelBoxForItem(item, screen, labelAnchor);
      const onScreen = box.right > 8 && box.bottom > 8 && box.left < rect.width - 8 && box.top < rect.height - 8;
      const prewarm = politicalLabel ? politicalPrewarm : labelPrewarm;
      const canBuffer = box.right > -prewarm && box.bottom > -prewarm && box.left < rect.width + prewarm && box.top < rect.height + prewarm;
      const canRender = onScreen || canBuffer;
      const blocked = canRender && (priorityLayout
        ? boxesOverlapAny(occupiedByPriority, box, padding)
        : stateLabel
        ? Boolean(politicalPlacement?.peerCollides)
        : provinceLabel
          ? false
          : (stateLabelScale.blocksCities && boxesOverlapAny(occupiedStates, box, padding)) || boxesOverlapAny(occupiedProvinces, box, padding) || boxesOverlapAny(occupied, box, padding));
      const shouldRender = canRender && (forceVisible || !blocked);
      const shouldShow = onScreen && shouldRender;
      const shouldBuffer = !onScreen && shouldRender;
      const wasRendered = item.visible || item.buffered;
      const entering = shouldShow && !wasRendered;
      const scaleEntering = entering && this.viewportInteractionKind === "zoom";
      const viewportEntering = entering && !scaleEntering;
      item.node.classList.toggle("visible", shouldShow);
      item.node.classList.toggle("buffered", shouldBuffer);
      item.node.classList.toggle("viewport-entering", viewportEntering);
      item.node.classList.toggle("scale-entering", scaleEntering);
      if (viewportEntering) clearOverlayEnteringClassNextFrame(item.node, "viewport-entering");
      if (scaleEntering) clearOverlayEnteringClassNextFrame(item.node, "scale-entering");
      item.visible = shouldShow;
      item.buffered = shouldBuffer;
      item.box = shouldRender ? box : null;
      if (!shouldRender) {
        if (wasRendered) {
          if (politicalPlacement) applyPoliticalLabelPlacement(item, politicalPlacement, baseScreen);
          else applyFixedScreenLabelPlacement(item.node, baseScreen, labelAnchor);
        }
        continue;
      }
      if (politicalPlacement) {
        item.politicalCandidateIndex = politicalPlacement.candidateIndex;
        applyPoliticalLabelPlacement(item, politicalPlacement, baseScreen);
      }
      else applyFixedScreenLabelPlacement(item.node, baseScreen, labelAnchor);
      item.node.style.setProperty("--label-rotation", `${politicalPlacement ? 0 : item.rotation || 0}deg`);
      const provinceFallback = provinceLabel && Boolean(politicalPlacement?.collides);
      const stateCityOverlap = stateLabel && Boolean(politicalPlacement?.cityCollides);
      item.node.classList.toggle("collision-fallback", provinceFallback);
      item.node.classList.toggle("city-overlap", stateCityOverlap);
      item.node.dataset.labelPath = politicalPlacement?.bend ? "quadratic" : "line";
      item.node.dataset.labelCandidate = String(politicalPlacement?.candidateIndex ?? 0);
      item.node.style.setProperty("--province-label-collision-opacity", String(PROVINCE_COLLISION_OPACITY));
      if (stateLabel) item.node.style.setProperty("--state-label-opacity", String(stateLabelScale.opacity));
      if (stateLabel) occupiedStates.push(box);
      else if (provinceLabel) occupiedProvinces.push(box);
      else {
        occupied.push(box);
        if (item.targetKind === LABEL_TARGET_KIND.CITY) occupiedCityLabels.push(box);
      }
      if (priorityLayout) occupiedByPriority.push(box);
      if (shouldShow) visible++;
      if (shouldShow && item.targetKind === LABEL_TARGET_KIND.CITY) visibleCities++;
      if (shouldShow && item.targetKind === LABEL_TARGET_KIND.STATE) visibleStates++;
      if (shouldShow && item.targetKind === LABEL_TARGET_KIND.PROVINCE) {
        visibleProvinces++;
        if (provinceFallback) fallbackProvinces++;
      }
      if (shouldShow && stateCityOverlap) stateCityOverlaps++;
    }

    this.visibleLabelCount = visible;
    this.visibleCityLabelCount = visibleCities;
    this.visibleStateLabelCount = visibleStates;
    this.visibleProvinceLabelCount = visibleProvinces;
    const labelsMs = roundMs(performance.now() - labelStartedAt);
    const cityStartedAt = performance.now();
    const cityIconBoxes = this.updateCityIcons(rect, [...occupiedStates, ...occupiedProvinces]);
    const cityIconsMs = roundMs(performance.now() - cityStartedAt);
    const markerStartedAt = performance.now();
    this.updateMarkerIcons(rect, [...occupied, ...occupiedStates, ...occupiedProvinces, ...cityIconBoxes], cityIconBoxes);
    const markerIconsMs = roundMs(performance.now() - markerStartedAt);
    const militaryStartedAt = performance.now();
    const cityCollisionBoxes = occupiedCityLabels.slice(-MAX_OVERLAY_COLLISION_BOXES);
    this.updateMilitaryIcons(rect, [...occupied, ...occupiedStates, ...occupiedProvinces, ...cityIconBoxes], cityCollisionBoxes);
    const militaryIconsMs = roundMs(performance.now() - militaryStartedAt);
    const selectionStartedAt = performance.now();
    this.updateSelectionMarker(rect);
    const selectionMs = roundMs(performance.now() - selectionStartedAt);
    const gridCellIdsStartedAt = performance.now();
    this.updateGridCellIdLabels(rect);
    const gridCellIdsMs = roundMs(performance.now() - gridCellIdsStartedAt);
    this.lastOverlayUpdate = {
      sequence: event.sequence,
      totalMs: roundMs(performance.now() - startedAt),
      labelsMs,
      cityIconsMs,
      markerIconsMs,
      militaryIconsMs,
      selectionMs,
      gridCellIdsMs,
      overlayChildren: this.overlay.childElementCount,
      labelItems: this.labelItems.length,
      visibleLabels: this.visibleLabelCount,
      visibleStateLabels: visibleStates,
      visibleProvinceLabels: visibleProvinces,
      fallbackProvinceLabels: fallbackProvinces,
      stateCityOverlapLabels: stateCityOverlaps,
      cityIconItems: this.cityIconItems.length,
      visibleCityIcons: this.visibleCityIconCount,
      markerIconItems: this.markerIconItems.length,
      visibleMarkerIcons: this.visibleMarkerIconCount,
      militaryIconItems: this.militaryIconItems.length,
      visibleMilitaryIcons: this.visibleMilitaryIconCount
    };
    if (!this.overlayInteractionSuspended) this.overlayCommittedCamera = snapshotViewportCamera(this.camera);
    this.completePerformanceEvent(event, {
      ms: this.lastOverlayUpdate.totalMs,
      labelsMs,
      cityIconsMs,
      markerIconsMs,
      militaryIconsMs,
      selectionMs,
      gridCellIdsMs,
      interactionSuspended: this.overlayInteractionSuspended,
      overlayChildren: this.overlay.childElementCount
    }, performance.now());
    } catch (error) {
      this.failPerformanceEvent(event, error, {ms: roundMs(performance.now() - startedAt)}, performance.now());
      throw error;
    }
  }

  updateGridCellIdLabels(rect) {
    if (!this.gridCellIdLayer || !this.map || this.layerVisibility.gridCells !== true) {
      if (this.gridCellIdLayer) this.gridCellIdLayer.replaceChildren();
      this.gridCellDiagnostics.visibleIds = 0;
      return;
    }
    const forcedCell = this.gridCellDiagnosticHighlight?.gridCell;
    const minimumScale = gridCellIdMinimumScale(this.map);
    if (this.camera.scale < minimumScale && !Number.isInteger(forcedCell)) {
      this.gridCellIdLayer.replaceChildren();
      this.gridCellDiagnostics.visibleIds = 0;
      return;
    }
    const documentRef = this.gridCellIdLayer.ownerDocument;
    const fragment = documentRef.createDocumentFragment();
    const cells = this.map.grid?.cells?.i || [];
    let visible = 0;
    for (const value of cells) {
      const gridCell = Number(value);
      const forced = gridCell === forcedCell;
      if (!forced && this.camera.scale < minimumScale) continue;
      const center = gridCellCenter(this.map, gridCell);
      if (!center) continue;
      const screen = this.worldToScreen(center.x, center.y, rect);
      if (!forced && (screen.x < 8 || screen.y < 8 || screen.x > rect.width - 8 || screen.y > rect.height - 8)) continue;
      const node = documentRef.createElement("span");
      node.className = `grid-cell-diagnostic-label${forced ? " forced" : ""}`;
      node.dataset.gridCellId = String(gridCell);
      setDynamicCanvasTextContent(node, "grid-cell-id", `#${gridCell}`);
      setOverlayNodePosition(node, screen.x, screen.y);
      fragment.append(node);
      visible++;
      if (!forced && visible >= GRID_CELL_ID_LABEL_BUDGET) break;
    }
    this.gridCellIdLayer.replaceChildren(fragment);
    this.gridCellDiagnostics.visibleIds = visible;
  }

  isLabelItemLayerVisible(item) {
    if (item.targetKind === LABEL_TARGET_KIND.STATE) return this.layerVisibility.stateLabels !== false;
    if (item.targetKind === LABEL_TARGET_KIND.PROVINCE) return this.layerVisibility.provinceLabels !== false;
    if (item.targetKind === LABEL_TARGET_KIND.ZONE) return this.layerVisibility.zones !== false && this.layerVisibility.zoneLabels !== false && zoneLabelLayerVisible(item.zone, this.layerVisibility);
    if (item.targetKind === LABEL_TARGET_KIND.CUSTOM) return this.layerVisibility.labels !== false;
    return this.layerVisibility.labels !== false;
  }

  updateSelectionMarker(rect) {
    const shouldShow = shouldShowDefaultSelectionMarker(this.selection, {
      labels: this.labelItems,
      cities: this.cityIconItems,
      markers: this.markerIconItems,
      military: this.militaryIconItems
    });
    if (!this.selectionMarker || !shouldShow) {
      if (this.selectionMarker) this.selectionMarker.style.display = "none";
      return;
    }
    const point = selectionPoint(this.map, this.selection);
    if (!point) {
      this.selectionMarker.style.display = "none";
      return;
    }
    const screen = this.worldToScreen(point.x, point.y, rect);
    this.selectionMarker.style.display = "block";
    setOverlayNodePosition(this.selectionMarker, screen.x, screen.y);
  }

  updateCityIcons(rect, occupiedLabels = []) {
    if (!this.cityIconItems.length) {
      this.visibleCityIconCount = 0;
      return [];
    }

    const scale = this.camera.scale;
    const iconPadding = scale >= CITY_ICON_RELAXED_SCALE ? 2 : 5;
    const occupiedIcons = [];
    const collisionIcons = [];
    const stateChanges = [];
    const prewarm = cityIconPrewarmCssPx(rect);
    const nowMs = performance.now();
    let visible = 0;

    for (const item of this.cityIconItems) {
      const selected = isSelectedOrHighlighted(this.selection, this.objectHighlights, OBJECT_KIND.CITY, item.id);
      const screen = this.worldToScreen(item.x, item.y, rect);
      const sizeScale = cityIconScale(scale, item);
      const box = cityIconBoxForItem(item, screen, sizeScale);
      const onScreen = box.right > 4 && box.bottom > 4 && box.left < rect.width - 4 && box.top < rect.height - 4;
      const inPrewarm = box.right > -prewarm && box.bottom > -prewarm && box.left < rect.width + prewarm && box.top < rect.height + prewarm;
      const scaleVisible = cityIconScaleVisibility(scale, item.minScale, CITY_ICON_SCALE_FADE_WIDTH) > 0;
      const canRender = this.layerVisibility.cities !== false && scaleVisible && inPrewarm;
      const blocked = canRender && scale < CITY_ICON_RELAXED_SCALE && (
        boxesOverlapAny(occupiedLabels, box, iconPadding) ||
        boxesOverlapAny(collisionIcons, box, iconPadding)
      );
      const visibilityTarget = canRender && !blocked ? 1 : 0;
      const shouldShow = onScreen && visibilityTarget === 1;
      if (visibilityTarget === 1) collisionIcons.push(box);
      if (visibilityTarget !== item.visibilityTarget || selected !== item.selected) {
        stateChanges.push({id: item.id, visibilityTarget, selected});
      }
      item.visibilityTarget = visibilityTarget;
      item.selected = selected;
      item.visible = shouldShow;
      item.buffered = !onScreen && visibilityTarget === 1;
      item.box = shouldShow ? box : null;
      if (!shouldShow) continue;
      occupiedIcons.push(box);
      visible++;
    }

    if (stateChanges.length) {
      this.cityIconLayer.updateInstanceStates(stateChanges, {nowMs});
      this.scheduleCityIconAnimation(nowMs);
    }

    this.visibleCityIconCount = visible;
    return occupiedIcons;
  }

  scheduleCityIconAnimation(nowMs = performance.now()) {
    this.cityIconAnimationUntil = Math.max(this.cityIconAnimationUntil, nowMs + CITY_ICON_VISIBILITY_TRANSITION_MS + 34);
    this.requestCityIconAnimationFrame();
  }

  requestCityIconAnimationFrame() {
    if (this.cityIconAnimationFrame) return;
    const view = this.canvas.ownerDocument?.defaultView || globalThis;
    const requestFrame = typeof view.requestAnimationFrame === "function"
      ? view.requestAnimationFrame.bind(view)
      : callback => setTimeout(() => callback(performance.now()), 16);
    this.cityIconAnimationFrame = requestFrame(timestamp => {
      this.cityIconAnimationFrame = 0;
      if (!this.map) return;
      this.draw({updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false});
      if (timestamp < this.cityIconAnimationUntil) this.requestCityIconAnimationFrame();
    });
  }

  updateMarkerIcons(rect, occupiedLabels = [], cityIconBoxes = []) {
    if (!this.markerIconItems.length) {
      this.visibleMarkerIconCount = 0;
      return;
    }

    const scale = this.camera.scale;
    const iconsEnabled = scale >= this.markerIconScaleThreshold;
    const iconPadding = scale >= MARKER_ICON_RELAXED_SCALE ? 2 : 6;
    const prewarm = overlayIconPrewarmCssPx(rect);
    const occupiedIcons = [];
    let visible = 0;

    for (const item of this.markerIconItems) {
      const layerVisible = isMarkerLayerVisible(item, this.layerVisibility);
      if (!iconsEnabled || !layerVisible) {
        item.node.classList.toggle("visible", false);
        item.node.classList.toggle("buffered", false);
        item.node.classList.toggle("viewport-entering", false);
        item.node.classList.toggle("city-overlap", false);
        item.node.classList.toggle("selected", isSelectedOrHighlighted(this.selection, this.objectHighlights, OBJECT_KIND.MARKER, item.id));
        item.visible = false;
        item.buffered = false;
        item.box = null;
        continue;
      }
      const screen = this.worldToScreen(item.x, item.y, rect);
      const box = markerIconBoxForItem(item, screen, scale);
      const onScreen = box.right > 4 && box.bottom > 4 && box.left < rect.width - 4 && box.top < rect.height - 4;
      const canRender = box.right > -prewarm && box.bottom > -prewarm && box.left < rect.width + prewarm && box.top < rect.height + prewarm;
      const blocked = canRender && scale < MARKER_ICON_RELAXED_SCALE && (
        boxesOverlapAny(occupiedLabels, box, iconPadding) ||
        boxesOverlapAny(occupiedIcons, box, iconPadding)
      );
      const shouldRender = canRender && !blocked;
      const shouldShow = onScreen && shouldRender;
      const shouldBuffer = !onScreen && shouldRender;
      const wasRendered = item.visible || item.buffered;
      const entering = shouldShow && !wasRendered;
      const cityOverlap = shouldShow && item.category === "resource" && boxesOverlapAny(cityIconBoxes, box, 0);
      item.node.classList.toggle("visible", shouldShow);
      item.node.classList.toggle("buffered", shouldBuffer);
      item.node.classList.toggle("viewport-entering", entering);
      if (entering) clearOverlayEnteringClassNextFrame(item.node, "viewport-entering");
      item.node.classList.toggle("city-overlap", cityOverlap);
      item.node.classList.toggle("selected", isSelectedOrHighlighted(this.selection, this.objectHighlights, OBJECT_KIND.MARKER, item.id));
      item.visible = shouldShow;
      item.buffered = shouldBuffer;
      item.box = shouldRender ? box : null;
      if (!shouldRender) {
        if (wasRendered) setOverlayNodePosition(item.node, screen.x, screen.y);
        continue;
      }
      setOverlayNodePosition(item.node, screen.x, screen.y);
      item.node.style.setProperty("--marker-icon-scale", String(markerIconScale(scale)));
      occupiedIcons.push(box);
      if (shouldShow) visible++;
    }

    this.visibleMarkerIconCount = visible;
  }

  updateMilitaryIcons(rect, occupiedLabels = [], cityLabelBoxes = []) {
    if (!this.militaryIconItems.length) {
      this.visibleMilitaryIconCount = 0;
      return;
    }

    const scale = this.camera.scale;
    const iconPadding = scale >= MILITARY_ICON_RELAXED_SCALE ? 2 : 6;
    const prewarm = overlayIconPrewarmCssPx(rect);
    const placementViewport = expandedViewport(rect, prewarm);
    const occupiedIcons = [];
    let visible = 0;

    for (const item of this.militaryIconItems) {
      const selected = isSelectedOrHighlighted(this.selection, this.objectHighlights, OBJECT_KIND.MILITARY, item.id);
      applyMilitaryLabelStatePalette(item, this.map);
      if (this.layerVisibility.military === false || scale < item.minScale) {
        if (item.visible !== false) item.node.classList.toggle("visible", false);
        item.node.classList.toggle("buffered", false);
        item.node.classList.toggle("viewport-entering", false);
        setOverlayItemClassFlag(item, "selectedClass", "selected", selected);
        setOverlayItemClassFlag(item, "fleetClass", "military-map-icon--fleet", item.type === "fleet");
        item.visible = false;
        item.buffered = false;
        item.box = null;
        continue;
      }
      const screen = this.worldToScreen(item.x, item.y, rect);
      const sizeScale = militaryIconScale(scale, item);
      const width = (item.boxBaseWidth || MILITARY_ICON_BASE_WIDTH) * sizeScale;
      const height = MILITARY_ICON_BASE_HEIGHT * sizeScale;
      const placement = scale >= MILITARY_CITY_LABEL_AVOID_SCALE
        ? resolveMilitaryLabelPlacement({
            screen,
            width,
            height,
            cityLabelBoxes,
            viewport: placementViewport,
            padding: iconPadding,
            item
          })
        : {screen, box: militaryLabelBox(screen, width, height, item), avoided: false, blocked: false};
      const box = placement.box;
      const onScreen = box.right > 4 && box.bottom > 4 && box.left < rect.width - 4 && box.top < rect.height - 4;
      const canRender = box.right > -prewarm && box.bottom > -prewarm && box.left < rect.width + prewarm && box.top < rect.height + prewarm;
      const blocked = canRender && !selected && (
        placement.blocked ||
        scale < MILITARY_ICON_RELAXED_SCALE && (
          boxesOverlapAny(occupiedLabels, box, iconPadding) ||
          boxesOverlapAny(occupiedIcons, box, iconPadding)
        )
      );
      const shouldRender = canRender && !blocked;
      const shouldShow = onScreen && shouldRender;
      const shouldBuffer = !onScreen && shouldRender;
      const wasRendered = item.visible || item.buffered;
      const entering = shouldShow && !wasRendered;
      if (item.visible !== shouldShow) item.node.classList.toggle("visible", shouldShow);
      item.node.classList.toggle("buffered", shouldBuffer);
      item.node.classList.toggle("viewport-entering", entering);
      if (entering) clearOverlayEnteringClassNextFrame(item.node, "viewport-entering");
      setOverlayItemClassFlag(item, "selectedClass", "selected", selected);
      setOverlayItemClassFlag(item, "fleetClass", "military-map-icon--fleet", item.type === "fleet");
      setOverlayItemClassFlag(item, "cityAvoidedClass", "city-label-avoided", placement.avoided);
      item.node.dataset.cityLabelAvoided = String(placement.avoided);
      item.visible = shouldShow;
      item.buffered = shouldBuffer;
      item.box = shouldRender ? box : null;
      if (!shouldRender) {
        if (wasRendered) {
          setOverlayNodePosition(
            item.node,
            screen.x + (item.placementOffsetX || 0),
            screen.y + (item.placementOffsetY || 0)
          );
        }
        continue;
      }
      setOverlayNodePosition(item.node, placement.screen.x, placement.screen.y);
      item.placementOffsetX = placement.screen.x - screen.x;
      item.placementOffsetY = placement.screen.y - screen.y;
      setOverlayItemStyleValue(item, "scaleValue", "--military-icon-scale", String(sizeScale));
      occupiedIcons.push(box);
      if (shouldShow) visible++;
    }

    this.visibleMilitaryIconCount = visible;
  }

  pickLabel(clientX, clientY) {
    if (!this.overlay || !this.labelItems.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const item of this.labelItems) {
      if (item.targetKind === LABEL_TARGET_KIND.CITY) continue;
      if (!item.visible || !item.box) continue;
      if (x < item.box.left || x > item.box.right || y < item.box.top || y > item.box.bottom) continue;
      return {
        kind: OBJECT_KIND.LABEL,
        id: item.targetId,
        text: item.text,
        targetKind: item.targetKind,
        targetId: item.targetId,
        targetName: item.text,
        rank: item.rank
      };
    }
    return null;
  }

  pickMarkerIcon(clientX, clientY) {
    if (!this.overlay || !this.markerIconItems.length) return null;
    for (let index = this.markerIconItems.length - 1; index >= 0; index--) {
      const item = this.markerIconItems[index];
      if (!item.visible || !isMarkerLayerVisible(item, this.layerVisibility)) continue;
      const rect = item.node.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      return markerObjectFromIconItem(item);
    }
    return null;
  }

  pickMilitaryIcon(clientX, clientY) {
    if (!this.overlay || !this.militaryIconItems.length || this.layerVisibility.military === false) return null;
    for (let index = this.militaryIconItems.length - 1; index >= 0; index--) {
      const item = this.militaryIconItems[index];
      if (!item.visible) continue;
      const rect = item.node.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      return militaryObjectFromIconItem(item);
    }
    return null;
  }

  worldToScreen(x, y, rect) {
    const ndcX = ((x / this.map.metadata.graphWidth) * 2 - 1) * this.camera.scale + this.camera.offsetX;
    const ndcY = (1 - (y / this.map.metadata.graphHeight) * 2) * this.camera.scale + this.camera.offsetY;
    return {
      x: ((ndcX + 1) / 2) * rect.width,
      y: ((1 - ndcY) / 2) * rect.height
    };
  }
}

function collectShoreVisualCells(paths) {
  const cells = new Set();
  for (const path of [...(paths?.coastline || []), ...(paths?.lakeShore || [])]) {
    for (const cell of [...(path.landCells || []), ...(path.waterCells || [])]) {
      if (Number.isInteger(cell)) cells.add(cell);
    }
  }
  return cells;
}

function isUndevelopedWorldPoint(map, world) {
  const width = Number(map?.metadata?.graphWidth) || 0;
  const height = Number(map?.metadata?.graphHeight) || 0;
  return !Number.isFinite(world?.x)
    || !Number.isFinite(world?.y)
    || world.x < 0
    || world.y < 0
    || world.x > width
    || world.y > height;
}

function buildUndevelopedPickResult(map, world, reason, candidates = 0) {
  return {
    invalidMapArea: true,
    invalidReason: reason,
    gridCell: null,
    packCell: null,
    worldX: roundValue(world?.x ?? 0),
    worldY: roundValue(world?.y ?? 0),
    graphWidth: map?.metadata?.graphWidth || 0,
    graphHeight: map?.metadata?.graphHeight || 0,
    candidates
  };
}

function applyMapStageBackground(stage, map, theme) {
  const background = theme?.canvas?.background || map?.layers?.background;
  if (!stage) return;
  if (background) stage.style.backgroundColor = rgbaCss(background);
  applyVisualThemeCssVariables(stage, theme);
}

function applyVisualThemeCssVariables(stage, theme) {
  const labels = theme?.labels || {};
  const legend = theme?.legend || {};
  const scaleBar = theme?.scaleBar || {};
  const canvasFilter = theme?.effects?.canvasFilter || "none";
  stage.style.setProperty("--theme-canvas-filter", canvasFilter);
  setThemeCssColor(stage, "--theme-legend-bg", legend.background);
  setThemeCssColor(stage, "--theme-legend-border", legend.border);
  setThemeCssColor(stage, "--theme-legend-text", legend.text);
  setThemeCssColor(stage, "--theme-legend-muted", legend.muted);
  setThemeCssColor(stage, "--theme-legend-swatch-border", legend.swatchBorder);
  setThemeCssColor(stage, "--theme-scale-bg", scaleBar.background);
  setThemeCssColor(stage, "--theme-scale-border", scaleBar.border);
  setThemeCssColor(stage, "--theme-scale-line", scaleBar.foreground);
  setThemeCssColor(stage, "--theme-scale-text", scaleBar.text);
  setThemeCssColor(stage, "--theme-city-label", labels.city);
  setThemeCssColor(stage, "--theme-city-label-halo", labels.cityHalo);
  setThemeCssColor(stage, "--theme-city-label-halo-soft", labels.cityHalo);
  setThemeCssColor(stage, "--theme-state-label", labels.state);
  setThemeCssColor(stage, "--theme-state-label-shadow", labels.stateShadow);
  setThemeCssColor(stage, "--theme-state-label-glow", labels.stateShadow);
  setThemeCssColor(stage, "--theme-custom-label", labels.custom);
  setThemeCssColor(stage, "--theme-custom-label-bg", labels.customBackground);
  setThemeCssColor(stage, "--theme-custom-label-border", labels.customBorder);
}

function setThemeCssColor(stage, property, color) {
  if (Array.isArray(color)) stage.style.setProperty(property, rgbaCss(color));
  else stage.style.removeProperty(property);
}

function rgbaCss(color) {
  const channel = value => Math.max(0, Math.min(255, Math.round((Number(value) || 0) * 255)));
  const alpha = Math.max(0, Math.min(1, Number(color?.[3] ?? 1)));
  return `rgba(${channel(color?.[0])}, ${channel(color?.[1])}, ${channel(color?.[2])}, ${alpha})`;
}

function defaultLocateMinScale(object) {
  return isPointObjectKind(object?.kind) ? 1.25 : 0.35;
}

function selectionPoint(map, selection) {
  if (selection?.kind === OBJECT_KIND.ZONE || selection?.kind === OBJECT_KIND.LABEL && selection.targetKind === LABEL_TARGET_KIND.ZONE) {
    const zone = (map?.zones?.zones || map?.pack?.zones || []).find(item => Number(item?.i ?? item?.id) === Number(selection.targetId ?? selection.id));
    return wildernessLabelAnchor(map.pack, zone);
  }
  if (selection?.kind === OBJECT_KIND.LABEL && selection.targetKind === LABEL_TARGET_KIND.STATE) {
    const state = map.politics.states[selection.targetId ?? selection.id];
    const placement = stateLabelPlacement(map, state, state?.fullName || state?.name || "");
    return placement ? {x: placement.x, y: placement.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.LABEL && selection.targetKind === LABEL_TARGET_KIND.PROVINCE) {
    const province = map.politics.provinces[selection.targetId ?? selection.id];
    const placement = provinceLabelPlacement(map, province);
    return placement ? {x: placement.x, y: placement.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.LABEL && selection.targetKind === LABEL_TARGET_KIND.CUSTOM) {
    const label = (map.labels?.custom || []).find(item => item.id === (selection.targetId ?? selection.id));
    return label ? {x: label.x, y: label.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.CITY || selection?.kind === OBJECT_KIND.LABEL) {
    const city = map.settlements.cities[selection.id];
    return city ? {x: city.x, y: city.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.MARKER) {
    const marker = (map.markers?.markers || []).find(item => Number(item?.id) === Number(selection.id));
    return marker ? {x: marker.x, y: marker.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.NOTE) {
    const note = (map?.notes?.notes || []).find(item => item?.kind === OBJECT_KIND.NOTE && String(item.objectId) === String(selection.id));
    return note && Number.isFinite(Number(note.x)) && Number.isFinite(Number(note.y)) ? {x: Number(note.x), y: Number(note.y)} : null;
  }
  if (selection?.kind === OBJECT_KIND.MILITARY) {
    const regiment = findRegiment(map, selection);
    return regiment ? {x: regiment.x, y: regiment.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.LAKE) {
    return lakeFeatureCenter(map, selection.id);
  }
  return null;
}

function getObjectBounds(map, object) {
  if (!map || !object) return null;
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.STATE) {
    return politicalBounds(map, {kind: OBJECT_KIND.STATE, id: object.targetId ?? object.id}, 48);
  }
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.PROVINCE) {
    return politicalBounds(map, {kind: OBJECT_KIND.PROVINCE, id: object.targetId ?? object.id}, 42);
  }
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.ZONE) {
    return zoneBounds(map, object.targetId ?? object.id, 42);
  }
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.CUSTOM) {
    const label = (map.labels?.custom || []).find(item => item.id === (object.targetId ?? object.id));
    return label ? pointBounds(label.x, label.y, 42) : null;
  }
  if (object.kind === OBJECT_KIND.CITY || object.kind === OBJECT_KIND.LABEL) {
    const city = map.settlements.cities[object.id];
    return city ? pointBounds(city.x, city.y, 42) : null;
  }
  if (object.kind === OBJECT_KIND.MARKER) {
    const marker = (map.markers?.markers || []).find(item => Number(item?.id) === Number(object.id));
    return marker ? pointBounds(marker.x, marker.y, 42) : null;
  }
  if (object.kind === OBJECT_KIND.NOTE) {
    const note = (map?.notes?.notes || []).find(item => item?.kind === OBJECT_KIND.NOTE && String(item.objectId) === String(object.id));
    return note && Number.isFinite(Number(note.x)) && Number.isFinite(Number(note.y)) ? pointBounds(Number(note.x), Number(note.y), 42) : null;
  }
  if (object.kind === OBJECT_KIND.MILITARY) {
    const regiment = findRegiment(map, object);
    return regiment ? pointBounds(regiment.x, regiment.y, 58) : null;
  }
  if (object.kind === OBJECT_KIND.ROUTE) {
    const route = map.settlements.routes.find(item => item.id === object.id);
    return route ? pointsBounds(route.points, 36) : null;
  }
  if (object.kind === OBJECT_KIND.TRADE_FLOW) {
    const points = tradeFlowBoundsPoints(map, object);
    return points ? pointsBounds(points, 60) : null;
  }
  if (object.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    const points = compositeConnectorPoints(map, object);
    return points ? pointsBounds(points, 60) : null;
  }
  if (object.kind === OBJECT_KIND.RIVER) {
    const river = map.rivers.rivers.find(item => item.id === object.id);
    return river ? pointsBounds(river.points, 42) : null;
  }
  if (object.kind === OBJECT_KIND.LAKE) {
    return lakeFeatureBounds(map, object.id, 42);
  }
  if (object.kind === OBJECT_KIND.ZONE) {
    return zoneBounds(map, object.id, 48);
  }
  if (isPoliticalObjectKind(object.kind)) {
    return politicalBounds(map, object, 48);
  }
  return null;
}

function zoneBounds(map, zoneId, padding = 0) {
  const zone = (map?.zones?.zones || map?.pack?.zones || []).find(item => Number(item?.i ?? item?.id) === Number(zoneId));
  const points = (zone?.cells || []).map(cell => map?.pack?.cells?.p?.[cell]).filter(isWorldPoint);
  return points.length ? pointsBounds(points, padding) : null;
}

function pickLakeObject(map, pickResult) {
  const feature = lakeFeatureFromPickResult(map, pickResult);
  if (!feature) return null;
  const id = feature.i ?? feature.id;
  return {
    kind: OBJECT_KIND.LAKE,
    id,
    name: feature.name || `湖泊 #${id}`,
    type: feature.group || feature.type || "lake",
    area: feature.area || 0,
    cells: feature.cells || 0,
    height: feature.height,
    flux: feature.flux,
    evaporation: feature.evaporation,
    firstCell: feature.firstCell,
    packCell: pickResult.packCell,
    gridCell: pickResult.gridCell
  };
}

function lakeFeatureFromPickResult(map, pickResult) {
  if (!pickResult || pickResult.packCell === null || pickResult.packCell === undefined) return null;
  const featureId = map?.pack?.cells?.f?.[pickResult.packCell];
  const feature = map?.pack?.features?.[featureId];
  return feature?.type === "lake" ? feature : null;
}

function lakeFeature(map, featureId) {
  const id = Number(featureId);
  return (map?.pack?.features || []).find(feature => feature?.type === "lake" && Number(feature.i ?? feature.id) === id) || null;
}

function lakeFeaturePoints(map, featureId) {
  const feature = lakeFeature(map, featureId);
  if (!feature) return [];
  const id = Number(feature.i ?? feature.id);
  const cells = map?.pack?.cells;
  const points = [];
  for (let cell = 0; cell < (cells?.p?.length || 0); cell++) {
    if (Number(cells.f?.[cell]) !== id) continue;
    const point = cells.p[cell];
    if (isWorldPoint(point)) points.push(point);
  }
  const fallback = cells?.p?.[feature.firstCell];
  if (!points.length && isWorldPoint(fallback)) points.push(fallback);
  return points;
}

function lakeFeatureCenter(map, featureId) {
  const points = lakeFeaturePoints(map, featureId);
  if (!points.length) return null;
  const sum = points.reduce((total, point) => ({x: total.x + point[0], y: total.y + point[1]}), {x: 0, y: 0});
  return {x: sum.x / points.length, y: sum.y / points.length};
}

function lakeFeatureBounds(map, featureId, padding) {
  const points = lakeFeaturePoints(map, featureId);
  return points.length ? pointsBounds(points, padding) : null;
}

function politicalBounds(map, object, padding) {
  const field = POLITICAL_OBJECT_FIELD[object.kind] || POLITICAL_OBJECT_FIELD[OBJECT_KIND.REGION];
  let bounds = null;
  for (let cellIndex = 0; cellIndex < map.grid.cells.p.length; cellIndex++) {
    if (map.grid.cells[field][cellIndex] !== object.id) continue;
    const point = map.grid.points[map.grid.cells.p[cellIndex]];
    bounds = includePoint(bounds, point[0], point[1]);
  }
  return bounds ? expandBounds(bounds, padding) : null;
}

function pointsBounds(points, padding) {
  let bounds = null;
  for (const point of points) {
    if (!isWorldPoint(point)) continue;
    bounds = includePoint(bounds, point[0], point[1]);
  }
  return bounds ? expandBounds(bounds, padding) : null;
}

function tradeFlowBoundsPoints(map, object) {
  if (isWorldPoint(object.from) && isWorldPoint(object.to)) return [object.from, object.to];
  const deal = (map?.pack?.deals || []).find(item => item?.i === Number(object.id));
  if (!deal) return null;
  const seller = tradePartyInfo(map, deal.sellerType, deal.seller).point;
  const buyer = tradePartyInfo(map, deal.buyerType, deal.buyer).point;
  return isWorldPoint(seller) && isWorldPoint(buyer) ? [seller, buyer] : null;
}

function pointBounds(x, y, padding) {
  return expandBounds({minX: x, minY: y, maxX: x, maxY: y}, padding);
}

function setOverlayNodePosition(node, x, y) {
  setStylePropertyIfChanged(node, "--overlay-x", overlayCoordinateValue(x));
  setStylePropertyIfChanged(node, "--overlay-y", overlayCoordinateValue(y));
}

function clearOverlayEnteringClassNextFrame(node, className) {
  const view = node?.ownerDocument?.defaultView;
  if (!view?.requestAnimationFrame) {
    node?.classList.remove(className);
    return;
  }
  view.requestAnimationFrame(() => node.classList.remove(className));
}

function overlayLabelPrewarmCssPx(rect) {
  return clamp(Math.max(rect.width, rect.height) * OVERLAY_LABEL_PREWARM_RATIO, OVERLAY_LABEL_PREWARM_MIN_CSS_PX, OVERLAY_LABEL_PREWARM_MAX_CSS_PX);
}

function overlayIconPrewarmCssPx(rect) {
  return clamp(Math.max(rect.width, rect.height) * OVERLAY_ICON_PREWARM_RATIO, OVERLAY_ICON_PREWARM_MIN_CSS_PX, OVERLAY_ICON_PREWARM_MAX_CSS_PX);
}

function expandedViewport(rect, padding) {
  return {left: -padding, top: -padding, right: rect.width + padding, bottom: rect.height + padding};
}

function appendLabelNodeText(node, item, documentRef, styleType) {
  const political = item.targetKind === LABEL_TARGET_KIND.STATE || item.targetKind === LABEL_TARGET_KIND.PROVINCE;
  const contentNode = documentRef.createElement("span");
  contentNode.className = `map-label-content${political ? " map-label-content--political" : ""}`;
  node.append(contentNode);
  if (!political) {
    setDynamicCanvasTextContent(contentNode, styleType, item.text);
    return {contentNode, glyphNodes: []};
  }
  node.setAttribute("aria-label", item.text);
  const glyphNodes = Array.from(item.text || "").map(character => {
    const glyph = documentRef.createElement("span");
    glyph.className = "political-label-glyph";
    glyph.setAttribute("aria-hidden", "true");
    setDynamicCanvasTextContent(glyph, styleType, character);
    contentNode.append(glyph);
    return glyph;
  });
  return {contentNode, glyphNodes};
}

function applyPoliticalLabelPlacement(item, placement, baseScreen = placement.anchor) {
  applyFixedScreenLabelPlacement(item.node, baseScreen, placement.anchor);
  item.politicalOffsetX = placement.anchor.x - baseScreen.x;
  item.politicalOffsetY = placement.anchor.y - baseScreen.y;
  item.politicalPlacementSnapshot = {
    candidateIndex: placement.candidateIndex,
    bend: placement.bend,
    rootSize: placement.rootSize,
    glyphs: placement.glyphs,
    boxOffset: {
      left: placement.box.left - placement.anchor.x,
      right: placement.box.right - placement.anchor.x,
      top: placement.box.top - placement.anchor.y,
      bottom: placement.box.bottom - placement.anchor.y
    },
    collides: placement.collides,
    cityCollides: placement.cityCollides
  };
  setStylePropertyIfChanged(item.node, "--label-box-width", `${placement.rootSize.width}px`);
  setStylePropertyIfChanged(item.node, "--label-box-height", `${placement.rootSize.height}px`);
  for (let index = 0; index < item.glyphNodes.length; index++) {
    const glyph = item.glyphNodes[index];
    const layout = placement.glyphs[index];
    if (!layout) continue;
    setStylePropertyIfChanged(glyph, "--glyph-x", overlayCoordinateValue(layout.x));
    setStylePropertyIfChanged(glyph, "--glyph-y", overlayCoordinateValue(layout.y));
    setStylePropertyIfChanged(glyph, "--label-rotation", `${layout.angle}deg`);
  }
}

function retainPoliticalPlacementOffset(item, placement, baseScreen) {
  const snapshot = item.politicalPlacementSnapshot;
  if (!snapshot || !Number.isFinite(item.politicalOffsetX) || !Number.isFinite(item.politicalOffsetY)) return placement;
  const anchor = {
    x: baseScreen.x + item.politicalOffsetX,
    y: baseScreen.y + item.politicalOffsetY
  };
  return {
    ...placement,
    anchor,
    candidateIndex: snapshot.candidateIndex,
    bend: snapshot.bend,
    rootSize: snapshot.rootSize,
    glyphs: snapshot.glyphs,
    box: {
      ...placement.box,
      left: anchor.x + snapshot.boxOffset.left,
      right: anchor.x + snapshot.boxOffset.right,
      top: anchor.y + snapshot.boxOffset.top,
      bottom: anchor.y + snapshot.boxOffset.bottom
    },
    collides: snapshot.collides,
    cityCollides: snapshot.cityCollides,
    peerCollides: false
  };
}

function applyFixedScreenLabelPlacement(node, baseScreen, visualAnchor) {
  setOverlayNodePosition(node, baseScreen.x, baseScreen.y);
  setStylePropertyIfChanged(node, "--label-offset-x", overlayCoordinateValue(visualAnchor.x - baseScreen.x));
  setStylePropertyIfChanged(node, "--label-offset-y", overlayCoordinateValue(visualAnchor.y - baseScreen.y));
}

function setOverlayItemClassFlag(item, cacheKey, className, enabled) {
  if (item[cacheKey] === enabled) return;
  item.node.classList.toggle(className, enabled);
  item[cacheKey] = enabled;
}

function setOverlayItemStyleValue(item, cacheKey, name, value) {
  if (item[cacheKey] === value) return;
  item.node.style.setProperty(name, value);
  item[cacheKey] = value;
}

function setStylePropertyIfChanged(node, name, value) {
  if (node.style.getPropertyValue(name) === value) return;
  node.style.setProperty(name, value);
}

function overlayCoordinateValue(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}

function includePoint(bounds, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return bounds;
  if (!bounds) return {minX: x, minY: y, maxX: x, maxY: y};
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
  return bounds;
}

function expandBounds(bounds, padding) {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding
  };
}

function getLabelCities(map, labelOptions = {}) {
  const maxCityLabels = normalizeMaxCityLabels(labelOptions.maxCityLabels, DEFAULT_MAX_CITY_LABELS);
  const candidates = [...map.settlements.cities]
    .filter(city => city && Number.isInteger(city.id))
    .filter(city => !isGeneratedLabelHidden(map, LABEL_TARGET_KIND.CITY, city.id))
    .map(city => {
      const priority = scoreCityLabel(city);
      return {
        city,
        priority,
        layout: resolveLabelLayout(map, LABEL_TARGET_KIND.CITY, city.id, city, {x: city.x, y: city.y, priority})
      };
    });
  const ranked = hasManualLabelPriorities(map)
    ? sortLabelItemsByPriority(candidates)
    : candidates.sort((a, b) => b.priority - a.priority);
  return ranked
    .slice(0, maxCityLabels)
    .map((item, rank) => ({
      targetKind: LABEL_TARGET_KIND.CITY,
      targetId: item.city.id,
      text: item.city.name,
      x: item.city.x,
      y: item.city.y,
      priority: item.priority,
      city: item.city,
      rank,
      minScale: minLabelScale(item.city, rank, maxCityLabels)
    }));
}

function getLabelStates(map) {
  return (map?.politics?.states || [])
    .filter(state => state && (state.i || state.id) && !state.removed)
    .filter(state => !isGeneratedLabelHidden(map, LABEL_TARGET_KIND.STATE, state.i ?? state.id))
    .map((state, rank) => {
      const text = state.fullName || state.name || `国家 #${state.i ?? state.id}`;
      const placement = stateLabelPlacement(map, state, text);
      return placement ? {
        targetKind: LABEL_TARGET_KIND.STATE,
        targetId: state.i ?? state.id,
        text,
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation,
        componentCells: placement.componentCells,
        componentCellSet: placement.componentCellSet,
        placementSource: placement.source,
        anchorCell: placement.cell,
        priority: Number(state.area || 0) + Number(state.burgs || 0) * 100,
        state,
        rank,
        minScale: 0.5
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
}

function getLabelProvinces(map) {
  return (map?.politics?.provinces || [])
    .filter(province => province && (province.i || province.id) && !province.removed)
    .filter(province => !isGeneratedLabelHidden(map, LABEL_TARGET_KIND.PROVINCE, province.i ?? province.id))
    .map((province, rank) => {
      const text = province.fullName || province.name || `省份 #${province.i ?? province.id}`;
      const placement = provinceLabelPlacement(map, province);
      return placement ? {
        targetKind: LABEL_TARGET_KIND.PROVINCE,
        targetId: province.i ?? province.id,
        text,
        x: placement.x,
        y: placement.y,
        rotation: 0,
        priority: Number(province.area || 0) + Number(province.burgs || 0) * 40,
        province,
        rank,
        minScale: 0.8
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
}

function getLabelZones(map) {
  return (map?.zones?.zones || map?.pack?.zones || [])
    .filter(zone => zone && !zone.hidden && zone.name)
    .map((zone, rank) => {
      const anchor = wildernessLabelAnchor(map.pack, zone);
      return anchor ? {
        targetKind: LABEL_TARGET_KIND.ZONE,
        targetId: Number(zone.i ?? zone.id),
        text: zone.name,
        x: anchor.x,
        y: anchor.y,
        anchorCell: anchor.cell,
        priority: 80 + Math.min(120, zone.cells?.length || 0),
        zone,
        rank,
        minScale: 0.65
      } : null;
    })
    .filter(Boolean);
}

function zoneLabelLayerVisible(zone, visibility) {
  if (zone?.source === "auto-wilderness") return visibility.zoneWilderness !== false;
  if ((zone?.category || "event") === "event") return visibility.zoneEvents !== false;
  return visibility.zoneNatural !== false;
}

function getCustomLabels(map) {
  return (map?.labels?.custom || [])
    .filter(label => label && Number.isFinite(label.x) && Number.isFinite(label.y) && label.text)
    .map((label, rank) => ({
      targetKind: LABEL_TARGET_KIND.CUSTOM,
      targetId: label.id,
      text: label.text,
      x: label.x,
      y: label.y,
      priority: 90000 - rank,
      custom: label,
      rank,
      minScale: 0.25
    }));
}

function getCityIconItems(map) {
  const cities = [...(map?.settlements?.cities || [])];
  const scaleContext = createCityScaleContext(cities, map?.pack?.burgs);
  return cities
    .filter(city => city && Number.isInteger(city.id) && Number.isFinite(city.x) && Number.isFinite(city.y))
    .map(city => ({city, priority: scoreCityIcon(city)}))
    .sort((a, b) => b.priority - a.priority)
    .map(({city, priority}, rank) => {
      const culture = map?.society?.cultures?.[city.culture] || map?.pack?.cultures?.[city.culture] || null;
      const burg = map?.pack?.burgs?.[city.burgId] || null;
      const scale = deriveCityScale(city, scaleContext, burg);
      const roles = cityRoleKeys(city, burg);
      const visual = resolveCityVisual(city, culture, burg?.visual, scaleContext, burg);
      const silhouette = visual.manual ? visual.silhouette : cityRoleSilhouette(roles, visual.silhouette);
      return {
        id: city.id,
        city,
        name: city.name || `城镇 #${city.id + 1}`,
        kind: scale,
        scale,
        roles,
        silhouette,
        tooltip: cityIconTooltip(city, cityRoleScaleLabel(city, scaleContext, burg)),
        priority,
        rank,
        population: Number(city.population || 0),
        cultureId: Number.isInteger(city.culture) ? city.culture : null,
        visual,
        x: city.x,
        y: city.y,
        minScale: cityIconMinScale(city, scale, rank)
      };
    });
}

function cityRoleSilhouette(roles, fallback) {
  return ["capital", "provincial", "port"].find(role => roles.includes(role)) || fallback;
}

function scoreCityIcon(city) {
  return (city.capital ? 800 : 0) + (city.provincial ? 320 : 0) + (city.port ? 120 : 0) + Number(city.population || 0) * 2;
}

function cityIconMinScale(city, scale, _rank) {
  const scaleThreshold = scale === "city" ? 1.45 : scale === "town" ? 1.9 : scale === "village" ? 2.15 : 2.35;
  const roleThreshold = city.capital ? 0.95 : city.provincial ? 1.2 : city.port ? 1.45 : scaleThreshold;
  return Math.min(scaleThreshold, roleThreshold);
}

function cityIconTooltip(city, roleScaleLabel) {
  const population = Number(city.population || 0);
  const populationText = population > 0 ? `，人口 ${formatPopulationPeople(population)}` : "";
  return `${city.name || "城镇"} / ${roleScaleLabel}${populationText}`;
}

function cityIconBoxForItem(item, screen, sizeScale) {
  const width = CITY_ICON_BASE_WIDTH * sizeScale;
  const height = CITY_ICON_BASE_HEIGHT * sizeScale;
  return {
    left: screen.x - width / 2,
    right: screen.x + width / 2,
    top: screen.y - height * 0.82,
    bottom: screen.y + height * 0.18,
    item
  };
}

function cityIconScale(scale, item) {
  return cityIconCssSize(scale, item.scale, CITY_ICON_BASE_CSS_SIZE, item.maxSizeFactor).factor;
}

function cityIconPrewarmCssPx(rect) {
  return clamp(Math.max(rect.width, rect.height) * CITY_ICON_PREWARM_RATIO, CITY_ICON_PREWARM_MIN_CSS_PX, CITY_ICON_PREWARM_MAX_CSS_PX);
}

function overlayLabelAnchor(renderer, item, screen, _scale) {
  if (item.targetKind !== LABEL_TARGET_KIND.CITY) return {x: screen.x, y: screen.y - 6};
  const cityIcon = renderer.cityIconItemsById?.get(String(item.targetId));
  const iconVisible = Boolean(cityIcon) && renderer.layerVisibility.cities !== false;
  const iconScale = cityIcon ? cityIconScale(12, cityIcon) : 0;
  const offsetY = cityLabelAnchorOffset({
    iconVisible,
    iconHeight: CITY_ICON_BASE_HEIGHT,
    iconScale
  });
  item.node.dataset.cityIconClearance = String(Math.round(-offsetY * 100) / 100);
  return {x: screen.x, y: screen.y + offsetY};
}

function getMarkerIconItems(map) {
  return [...(map?.markers?.markers || [])]
    .filter(marker => marker && Number.isFinite(marker.x) && Number.isFinite(marker.y))
    .sort((a, b) => markerIconPriority(b) - markerIconPriority(a))
    .map(marker => {
      const visual = resolveMarkerIconVisual(marker.type, marker.visual || marker.data?.visual || {});
      return {
        id: marker.id,
        marker,
        type: marker.type,
        label: marker.label,
        name: marker.name || marker.label || `标记 #${marker.id + 1}`,
        tooltip: markerIconTooltip(marker),
        category: marker.category || visual.category,
        resourceKey: marker.resourceKey || null,
        economicValue: Number(marker.economicValue || 0),
        visual,
        x: marker.x,
        y: marker.y
      };
    });
}

function markerIconPriority(marker) {
  const categoryScore = marker.category === "resource" ? 1000 : marker.category === "infrastructure" || marker.category === "trade" ? 400 : 0;
  return categoryScore + Number(marker.economicValue || 0) * 12 + (marker.type === "water-sources" ? 80 : 0);
}

function markerIconTooltip(marker) {
  const value = Number(marker.economicValue || 0);
  const valueText = value > 0 ? `，潜力 ${roundValue(value)}` : "";
  return `${marker.name || marker.label || "标记"} / ${marker.categoryLabel || marker.category || "标记"}${valueText}`;
}

function markerObjectFromIconItem(item) {
  const marker = item.marker || {};
  return {
    kind: OBJECT_KIND.MARKER,
    id: marker.id ?? item.id,
    type: marker.type || item.type,
    label: marker.label || item.label,
    icon: marker.icon,
    category: marker.category || item.category,
    categoryLabel: marker.categoryLabel,
    resourceKey: marker.resourceKey || item.resourceKey,
    resourceLabel: marker.resourceLabel,
    economicValue: marker.economicValue ?? item.economicValue,
    name: marker.name || item.name,
    cell: marker.cell,
    packCell: marker.packCell,
    data: marker.data,
    distance: 0,
    candidateCount: 1
  };
}

function markerIconClassName(item) {
  const classes = ["marker-map-icon"];
  if (item.category) classes.push(`marker-map-icon--${item.category}`);
  if (item.resourceKey) classes.push("marker-map-icon--resource");
  return classes.join(" ");
}

function getMilitaryIconItems(map, unitPreferences = {}) {
  return militaryRegiments(map)
    .sort((a, b) => Number(b.a || 0) - Number(a.a || 0))
    .map(regiment => {
      const iconVariant = militaryIconForRegiment(regiment);
      const troops = Number(regiment.a || 0);
      const troopTextWidth = Math.min(18, String(formatMilitaryTroops(troops, unitPreferences)).length * 3);
      return {
        id: regiment.id ?? `${regiment.state}:${regiment.i}`,
        regiment,
        stateId: regiment.state,
        regimentId: regiment.i,
        type: regiment.type,
        name: regiment.name || `军团 #${regiment.i}`,
        stateName: regiment.stateName || map?.politics?.states?.[regiment.state]?.name || "none",
        icon: iconVariant,
        iconVariant,
        iconLabel: regiment.iconLabel || militaryIconLabelForVariant(iconVariant),
        troops,
        boxBaseWidth: MILITARY_ICON_BASE_WIDTH + troopTextWidth,
        status: regiment.status,
        statusLabel: regiment.statusLabel,
        dominantUnit: regiment.dominantUnit,
        dominantUnitLabel: regiment.dominantUnitLabel,
        tooltip: militaryIconTooltip(regiment, map, unitPreferences),
        rendererUnitPreferences: unitPreferences,
        minScale: regiment.a >= 8000 ? MILITARY_ICON_MIN_SCALE * 0.82 : MILITARY_ICON_MIN_SCALE,
        x: regiment.x,
        y: regiment.y
      };
    });
}

function militaryRegiments(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({
      ...regiment,
      stateName: state.name || state.fullName || `国家 #${state.i}`,
      state: regiment.state ?? state.i
    })))
    .filter(regiment => Number.isFinite(regiment.x) && Number.isFinite(regiment.y));
}

function militaryIconTooltip(regiment, map, unitPreferences = {}) {
  const state = map?.politics?.states?.[regiment.state] || map?.pack?.states?.[regiment.state];
  return `${state?.name || "国家"} / ${regiment.name || "军团"} / ${regiment.statusLabel || "待命"} / ${formatMilitaryTroops(regiment.a, unitPreferences)}`;
}

function militaryIconClassName(item) {
  const classes = ["military-map-icon"];
  if (item.type === "fleet") classes.push("military-map-icon--fleet");
  const iconVariant = normalizeMilitaryIconVariant(item.iconVariant || item.icon, militaryIconVariantForUnit(item.dominantUnit));
  if (iconVariant) classes.push(`military-map-icon--${iconVariant}`);
  return classes.join(" ");
}

function applyMilitaryLabelStatePalette(item, map) {
  const state = map?.politics?.states?.[item.stateId] || map?.pack?.states?.[item.stateId];
  const palette = resolveMilitaryLabelPalette(state?.color);
  if (item.stateColorValue === palette.stateColor) return;
  item.node.style.setProperty("--military-label-bg", palette.background);
  item.node.style.setProperty("--military-label-border", palette.border);
  item.node.dataset.stateColor = palette.stateColor;
  item.stateColorValue = palette.stateColor;
}

function militaryObjectFromIconItem(item) {
  const regiment = item.regiment || {};
  return {
    kind: OBJECT_KIND.MILITARY,
    id: item.id,
    regimentId: regiment.i ?? item.regimentId,
    stateId: regiment.state ?? item.stateId,
    name: regiment.name || item.name,
    state: item.stateName,
    type: regiment.type || item.type,
    status: regiment.status || item.status,
    statusLabel: regiment.statusLabel || item.statusLabel,
    dominantUnit: regiment.dominantUnit || item.dominantUnit,
    dominantUnitLabel: regiment.dominantUnitLabel || item.dominantUnitLabel,
    troops: regiment.a ?? item.troops,
    units: regiment.u,
    icon: item.iconVariant || item.icon,
    iconVariant: item.iconVariant,
    iconLabel: item.iconLabel,
    cell: regiment.cell,
    x: regiment.x,
    y: regiment.y,
    distance: 0,
    candidateCount: 1
  };
}

function militaryIconScale(scale, item) {
  const troopBonus = item.troops >= 10000 ? 0.08 : item.troops >= 4000 ? 0.04 : 0;
  return clamp(0.82 + troopBonus + (scale - item.minScale) * 0.04, 0.78, 1.16);
}

function militaryIconForUnit(unit) {
  return militaryIconVariantForUnit(unit);
}

function militaryIconForRegiment(regiment = {}) {
  const fallback = militaryIconVariantForUnit(regiment.dominantUnit);
  return normalizeMilitaryIconVariant(regiment.iconVariant || regiment.icon, fallback);
}

function militaryIconVariantForUnit(unit) {
  if (unit === "archers") return "archers";
  if (unit === "cavalry") return "cavalry";
  if (unit === "artillery") return "artillery";
  if (unit === "fleet") return "fleet-small";
  return "infantry";
}

function formatMilitaryTroops(value, unitPreferences = {}) {
  return formatMilitary(value, unitPreferences);
}

function colorForRegiment(regiment) {
  if (regiment.type === "fleet" || regiment.dominantUnit === "fleet") return [0.32, 0.68, 0.92, 0.92];
  if (regiment.dominantUnit === "cavalry") return [0.86, 0.66, 0.34, 0.94];
  if (regiment.dominantUnit === "archers") return [0.48, 0.74, 0.46, 0.94];
  if (regiment.dominantUnit === "artillery") return [0.82, 0.46, 0.34, 0.94];
  return [0.86, 0.82, 0.62, 0.94];
}

function findRegiment(map, object) {
  const idParts = String(object.id ?? "").split(":");
  const stateId = Number(object.stateId ?? object.state ?? idParts[0]);
  const regimentId = Number(object.regimentId ?? object.i ?? idParts[1]);
  const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
  return (state?.military || []).find(regiment => regiment.i === regimentId || regiment.id === object.id) || null;
}

function applyMarkerIconPalette(node, item) {
  const palette = markerIconPalette(item);
  node.style.setProperty("--marker-fill", palette.fill);
  node.style.setProperty("--marker-stroke", palette.stroke);
  node.style.setProperty("--marker-symbol", palette.symbol);
}

function markerIconPalette(item) {
  const visual = item.visual || {};
  const categoryColor = normalizedCssColor(visual.categoryColor);
  const palette = MARKER_ICON_PALETTES[visual.palette] || MARKER_ICON_PALETTES[item.category] || MARKER_ICON_PALETTES.mystery;
  return categoryColor ? {...palette, fill: categoryColor} : palette;
}

function normalizedCssColor(color) {
  if (!Array.isArray(color) || color.length < 3) return null;
  const [r, g, b] = color.map(value => Math.round(clamp(value, 0, 1) * 255));
  return `rgb(${r} ${g} ${b})`;
}

function markerIconSvg(item) {
  return renderMarkerIconSvg(item);
}

function markerIconBoxForItem(item, screen, scale) {
  const sizeScale = markerIconScale(scale);
  const width = MARKER_ICON_BASE_WIDTH * sizeScale;
  const height = MARKER_ICON_BASE_HEIGHT * sizeScale;
  return {
    left: screen.x - width / 2,
    right: screen.x + width / 2,
    top: screen.y - height,
    bottom: screen.y + 3 * sizeScale,
    item
  };
}

function markerIconScale(scale) {
  return clamp(0.86 + (scale - MARKER_ICON_MIN_SCALE) * 0.06, 0.86, 1.12);
}

function stateLabelPlacement(map, state, text = "") {
  return resolveStateLabelPlacement(map, state, text);
}

function provinceLabelPlacement(map, province) {
  if (!province) return null;
  if (isWorldPoint(province.pole)) return {x: province.pole[0], y: province.pole[1], rotation: 0};
  const center = Number.isInteger(province.center) ? province.center : null;
  const point = center === null ? null : map?.pack?.cells?.p?.[center];
  return isWorldPoint(point) ? {x: point[0], y: point[1], rotation: 0} : null;
}

function stateLabelAnchorAllowed(renderer, item, anchor, rect) {
  const world = renderer.screenToWorld(rect.left + anchor.x, rect.top + anchor.y);
  const picked = pickGridCell(renderer.map, world.x, world.y);
  return Number.isInteger(picked?.packCell) && item.componentCellSet.has(picked.packCell);
}

function isSelectedOrHighlighted(selection, highlights, kind, id) {
  if (selection?.kind === kind && String(selection.id) === String(id)) return true;
  return highlights.some(item => item?.kind === kind && String(item.id) === String(id));
}

function sameSelectionTarget(previous, next) {
  if (previous === next) return true;
  if (!previous || !next || previous.kind !== next.kind) return false;
  if (String(previous.id ?? "") !== String(next.id ?? "")) return false;
  if (String(previous.targetKind ?? "") !== String(next.targetKind ?? "")) return false;
  return String(previous.targetId ?? "") === String(next.targetId ?? "");
}

function deduplicateObjectHighlights(objects) {
  const seen = new Set();
  const highlights = [];
  for (const object of Array.isArray(objects) ? objects : []) {
    if (!object?.kind) continue;
    const key = objectHighlightKey(object);
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push({...object});
  }
  return highlights;
}

function objectHighlightKey(object) {
  const targetKind = object.targetKind || "";
  const targetId = object.targetId ?? object.id ?? "";
  return `${object.kind}:${targetKind}:${targetId}`;
}

function summarizeObjectHighlight(object) {
  return {
    kind: object.kind,
    id: object.id,
    ...(object.targetKind ? {targetKind: object.targetKind} : {}),
    ...(object.targetId !== undefined ? {targetId: object.targetId} : {}),
    name: object.name || ""
  };
}

function installCanvasInteractions(canvas, camera, onChange, onHover, onSelect, onInteractionStart, onInteractionEnd) {
  let activePointer = null;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;

  canvas.addEventListener("pointerdown", event => {
    const mode = pointerInteractionMode(event);
    if (!mode) return;
    if (mode === "pan") event.preventDefault();
    activePointer = {
      id: event.pointerId,
      mode,
      moved: false
    };
    if (mode === "pan") onInteractionStart?.({kind: "pan", pointerId: event.pointerId});
    lastX = event.clientX;
    lastY = event.clientY;
    startX = event.clientX;
    startY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!activePointer || activePointer.id !== event.pointerId) {
      onHover(event);
      return;
    }
    if (activePointer.mode === "select") {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 3) activePointer.moved = true;
      onHover(event);
      return;
    }
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 3) activePointer.moved = true;
    lastX = event.clientX;
    lastY = event.clientY;
    camera.offsetX += (dx / rect.width) * 2;
    camera.offsetY -= (dy / rect.height) * 2;
    onChange({kind: "pan"});
    onHover(event);
  });

  canvas.addEventListener("pointerup", event => {
    if (!activePointer || activePointer.id !== event.pointerId) return;
    const pointer = activePointer;
    activePointer = null;
    if (pointer.mode === "select" && !pointer.moved) onSelect(event);
    if (pointer.mode === "pan") onInteractionEnd?.({kind: "pan", pointerId: event.pointerId});
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", event => {
    if (activePointer?.mode === "pan") onInteractionEnd?.({kind: "pan", pointerId: event.pointerId});
    activePointer = null;
  });

  canvas.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  canvas.addEventListener("auxclick", event => {
    if (event.button === 1 || event.button === 2) event.preventDefault();
  });

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const cursorY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      const previousScale = camera.scale;
      const nextScale = Math.max(0.5, Math.min(12, previousScale * Math.exp(-event.deltaY * 0.001)));
      const worldX = (cursorX - camera.offsetX) / previousScale;
      const worldY = (cursorY - camera.offsetY) / previousScale;
      camera.scale = nextScale;
      camera.offsetX = cursorX - worldX * nextScale;
      camera.offsetY = cursorY - worldY * nextScale;
      onChange({kind: "zoom"});
    },
    {passive: false}
  );
}

function pointerInteractionMode(event) {
  if (event.pointerType === "mouse") {
    if (event.button === 0) return "select";
    if (event.button === 1) return "pan";
    if (event.button === 2) return "pan";
    return null;
  }
  return event.button === 0 ? "pan" : null;
}

function buildPlaceholderSurfaceBundle(map, colorMode, viewOptions, shoreVisualPaths = null, stateVisualPaths = null, provinceVisualPaths = null, politicalVisualMeshes = null, cellVisualMesh = null) {
  const context = createRenderContext(map);
  const statePaths = stateVisualPaths || buildStateVisualPaths(map);
  const provincePaths = provinceVisualPaths || buildProvinceVisualPaths(map);
  const politicalSurface = politicalSurfaceMeshForMode(colorMode, politicalVisualMeshes);
  const smoothCellBorders = viewOptions.smoothCellBorders !== false;
  const useCellVisualMesh = smoothCellBorders && cellVisualMesh?.cells?.length;
  const usePoliticalSurface = smoothCellBorders && politicalSurface;
  const vertices = useCellVisualMesh ? buildCellVisualGridVertices(context, colorMode, viewOptions, cellVisualMesh) : [];
  if (useCellVisualMesh) encodeCellVisualSurfaceSides(vertices, cellVisualMesh, map);

  if (!useCellVisualMesh && usePoliticalSurface) {
    pushGridCells(
      vertices,
      context,
      colorMode,
      viewOptions,
      cellIndex => shouldDrawGridCellUnderPoliticalMesh(map, colorMode, cellIndex),
      (color, cellIndex) => withSurfaceSideAlpha(color, Number(map.grid.cells.h[cellIndex]) >= 20 ? "land" : "water")
    );
    pushMeshSurfaceVertices(vertices, politicalSurface, color => withSurfaceSideAlpha(color, "land"));
  } else if (!useCellVisualMesh) {
    pushGridCells(
      vertices,
      context,
      colorMode,
      viewOptions,
      () => true,
      (color, cellIndex) => withSurfaceSideAlpha(color, Number(map.grid.cells.h[cellIndex]) >= 20 ? "land" : "water")
    );
  }
  const shoreLayers = smoothCellBorders && shouldDrawShoreVisualBands(colorMode) && shoreVisualPaths
    ? buildShoreSurfaceVertexLayers(context, colorMode, viewOptions, shoreVisualPaths)
    : emptyShoreSurfaceVertexLayers();
  if (smoothCellBorders && !useCellVisualMesh) {
    const politicalBandStart = vertices.length;
    if (colorMode === "states") pushPoliticalVisualBands(vertices, context, statePaths, STATE_VISUAL_STYLE);
    if (colorMode === "provinces") pushPoliticalVisualBands(vertices, context, provincePaths, PROVINCE_VISUAL_STYLE);
    for (let offset = politicalBandStart; offset < vertices.length; offset += 6) vertices[offset + 5] = 0.25;
  }

  return {
    base: vertices instanceof Float32Array ? vertices : new Float32Array(vertices),
    ...shoreLayers
  };
}

function canReuseCellVisualSurfaceGeometry(renderer) {
  if (renderer.viewOptions?.smoothCellBorders === false || !renderer.cellVisualMesh?.cells?.length) return false;
  if (!(renderer.surfaceVertices instanceof Float32Array) || !renderer.surfaceVertices.length) return false;
  if (!(renderer.surfaceCellRanges instanceof Map) || renderer.surfaceCellRanges.size !== renderer.cellVisualMesh.cells.length) return false;
  const lastCell = renderer.cellVisualMesh.cells.at(-1);
  const lastRange = lastCell ? renderer.surfaceCellRanges.get(lastCell.cell) : null;
  return lastRange?.end === renderer.surfaceVertices.length;
}

function recolorCellVisualSurfaceBundle(renderer) {
  const {map, colorMode, viewOptions, cellVisualMesh, surfaceVertices, surfaceCellRanges} = renderer;
  for (const cellMesh of cellVisualMesh.cells) {
    const range = surfaceCellRanges.get(cellMesh.cell);
    if (!range) continue;
    const color = colorForCell(cellMesh.cell, map, colorMode, viewOptions);
    const side = Number(map.grid.cells.h[cellMesh.cell]) >= 20 ? 0.25 : 0.75;
    for (let offset = range.start; offset < range.end; offset += 6) {
      surfaceVertices[offset + 2] = color[0];
      surfaceVertices[offset + 3] = color[1];
      surfaceVertices[offset + 4] = color[2];
      surfaceVertices[offset + 5] = side;
    }
  }
  const shoreLayers = shouldDrawShoreVisualBands(colorMode)
    ? buildShoreSurfaceVertexLayers(createRenderContext(map), colorMode, viewOptions, renderer.shoreVisualPaths)
    : emptyShoreSurfaceVertexLayers();
  return {base: surfaceVertices, ...shoreLayers};
}

function encodeCellVisualSurfaceSides(vertices, cellVisualMesh, map) {
  let offset = 0;
  for (const cellMesh of cellVisualMesh?.cells || []) {
    const alpha = Number(map.grid.cells.h[cellMesh.cell]) >= 20 ? 0.25 : 0.75;
    const vertexCount = (cellMesh?.ndcTriangles?.length || 0) / 2;
    for (let vertex = 0; vertex < vertexCount; vertex++) vertices[offset + vertex * 6 + 5] = alpha;
    offset += vertexCount * 6;
  }
}

function emptyShoreSurfaceVertexLayers() {
  return {
    landCorrections: new Float32Array(),
    waterCorrections: new Float32Array(),
    landCovers: new Float32Array(),
    waterCovers: new Float32Array()
  };
}

function buildSurfaceCellRanges(colorMode, viewOptions, cellVisualMesh, surfaceFloatLength) {
  if (viewOptions?.smoothCellBorders === false || !cellVisualMesh?.cells?.length || !Number.isFinite(surfaceFloatLength)) return new Map();
  const ranges = new Map();
  let start = 0;
  for (const cellMesh of cellVisualMesh.cells) {
    const length = ((cellMesh?.ndcTriangles?.length || 0) / 2) * 6;
    if (!length) continue;
    ranges.set(cellMesh.cell, {start, end: start + length});
    start += length;
  }
  if (start > surfaceFloatLength || !colorMode) return new Map();
  return ranges;
}

function mergeSurfaceRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start - previous.end <= MAX_INCREMENTAL_SURFACE_GAP_FLOATS) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }
    merged.push({...range});
  }
  return merged;
}

export function shouldDrawShoreVisualBands(colorMode) {
  return colorMode === "height" || colorMode === "states" || colorMode === "provinces";
}

function combineVertexBuffers(primary, extra) {
  const primaryBuffer = primary instanceof Float32Array ? primary : new Float32Array(primary);
  if (!extra?.length) return primaryBuffer;
  const result = new Float32Array(primaryBuffer.length + extra.length);
  result.set(primaryBuffer, 0);
  result.set(extra, primaryBuffer.length);
  return result;
}

function uploadShoreSurfaceBuffers(gl, renderer, bundle) {
  for (const [buffer, vertices] of [
    [renderer.landCorrectionBuffer, bundle.landCorrections],
    [renderer.waterCorrectionBuffer, bundle.waterCorrections],
    [renderer.landCoverBuffer, bundle.landCovers],
    [renderer.waterCoverBuffer, bundle.waterCovers]
  ]) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }
}

function drawSurfaceDepthBatch(gl, renderer, buffer, vertexCount, depthFunction) {
  if (!vertexCount) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  bindVertexBuffer(gl, renderer.locations);
  gl.depthFunc(depthFunction);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

function buildLineVertices(map, visibility = {}, colorMode = "height", shoreVisualPaths = null, stateVisualPaths = null, provinceVisualPaths = null, cellVisualMesh = null, viewOptions = {}, oceanCurrentHighlights = new Set()) {
  const context = createRenderContext(map);
  const vertices = [];
  const oceanCurrentVertices = [];
  const statePaths = stateVisualPaths || buildStateVisualPaths(map);
  const provincePaths = provinceVisualPaths || buildProvinceVisualPaths(map);
  const themeLines = viewOptions.visualTheme?.lines || {};
  pushMapEdgeFade(vertices, context, map, viewOptions.visualTheme);
  pushShoreLineLayers(vertices, context, visibility, cellVisualMesh, viewOptions, shoreVisualPaths);
  pushZoneTextureLayer(vertices, context, map, visibility);
  const oceanCurrents = pushOceanCurrentLayer(oceanCurrentVertices, context, map, visibility, oceanCurrentHighlights);
  if (visibility.provinceBorders !== false) pushPoliticalBoundaryStrokes(vertices, provincePaths, context, themeLines.provinceBorder || PROVINCE_VISUAL_STYLE.borderStroke, PROVINCE_VISUAL_STYLE.borderWidthWorld, PROVINCE_VISUAL_STYLE.borderDashWorld);
  if (visibility.stateBorders !== false) pushPoliticalBoundaryStrokes(vertices, statePaths, context, themeLines.stateBorder || STATE_VISUAL_STYLE.borderStroke, STATE_VISUAL_STYLE.borderWidthWorld);
  if (visibility.warFronts !== false) pushMilitaryFrontLayer(vertices, context, map);
  return {vertices: new Float32Array(vertices), oceanCurrentVertices: new Float32Array(oceanCurrentVertices), oceanCurrents};
}

function pushMapEdgeFade(vertices, context, map, visualTheme) {
  const width = Number(map?.metadata?.graphWidth) || 0;
  const height = Number(map?.metadata?.graphHeight) || 0;
  if (width <= 0 || height <= 0) return;
  const fade = clamp(Math.min(width, height) * MAP_EDGE_FADE_RATIO, MAP_EDGE_FADE_MIN_WORLD, MAP_EDGE_FADE_MAX_WORLD);
  const outer = withAlpha(visualTheme?.canvas?.background || map.layers?.background || [0.36, 0.49, 0.64, 1], 1);
  const edge = withAlpha(outer, MAP_EDGE_FADE_ALPHA);
  const inner = withAlpha(outer, 0);
  pushGradientQuad(vertices, context, [-fade, -fade], [0, -fade], [0, height + fade], [-fade, height + fade], outer, edge, edge, outer);
  pushGradientQuad(vertices, context, [0, -fade], [fade, -fade], [fade, height + fade], [0, height + fade], edge, inner, inner, edge);
  pushGradientQuad(vertices, context, [width, -fade], [width + fade, -fade], [width + fade, height + fade], [width, height + fade], edge, outer, outer, edge);
  pushGradientQuad(vertices, context, [width - fade, -fade], [width, -fade], [width, height + fade], [width - fade, height + fade], inner, edge, edge, inner);
  pushGradientQuad(vertices, context, [-fade, -fade], [width + fade, -fade], [width + fade, 0], [-fade, 0], outer, outer, edge, edge);
  pushGradientQuad(vertices, context, [-fade, 0], [width + fade, 0], [width + fade, fade], [-fade, fade], edge, edge, inner, inner);
  pushGradientQuad(vertices, context, [-fade, height], [width + fade, height], [width + fade, height + fade], [-fade, height + fade], edge, edge, outer, outer);
  pushGradientQuad(vertices, context, [-fade, height - fade], [width + fade, height - fade], [width + fade, height], [-fade, height], inner, inner, edge, edge);
}

function pushGradientQuad(vertices, context, a, b, c, d, colorA, colorB, colorC, colorD) {
  pushGradientTriangle(vertices, context, a, b, c, colorA, colorB, colorC);
  pushGradientTriangle(vertices, context, a, c, d, colorA, colorC, colorD);
}

function pushGradientTriangle(vertices, context, a, b, c, colorA, colorB, colorC) {
  pushWorldVertex(vertices, context, a, colorA);
  pushWorldVertex(vertices, context, b, colorB);
  pushWorldVertex(vertices, context, c, colorC);
}

const LINE_SMOOTHING = Object.freeze({
  river: Object.freeze({iterations: 1, factor: 0.2}),
  route: Object.freeze({iterations: 1, factor: 0.16}),
  riverSelection: Object.freeze({iterations: 1, factor: 0.18})
});

function viewportWorldBounds(map, camera, canvas, marginPx = 0) {
  if (!map?.metadata || !camera || !canvas) return null;
  const width = Math.max(1, canvas.width || canvas.clientWidth || 1);
  const height = Math.max(1, canvas.height || canvas.clientHeight || 1);
  const points = [
    screenPixelToWorldPoint(map, camera, width, height, 0, 0),
    screenPixelToWorldPoint(map, camera, width, height, width, 0),
    screenPixelToWorldPoint(map, camera, width, height, width, height),
    screenPixelToWorldPoint(map, camera, width, height, 0, height)
  ];
  const marginWorldX = (map.metadata.graphWidth / Math.max(1, width * Math.max(0.0001, camera.scale))) * marginPx;
  const marginWorldY = (map.metadata.graphHeight / Math.max(1, height * Math.max(0.0001, camera.scale))) * marginPx;
  return {
    minX: Math.min(...points.map(point => point[0])) - marginWorldX,
    maxX: Math.max(...points.map(point => point[0])) + marginWorldX,
    minY: Math.min(...points.map(point => point[1])) - marginWorldY,
    maxY: Math.max(...points.map(point => point[1])) + marginWorldY
  };
}

function viewportLineOverscanBackingPx(canvas) {
  const width = Math.max(1, canvas?.width || 1);
  const height = Math.max(1, canvas?.height || 1);
  const cssWidth = Math.max(1, canvas?.clientWidth || width);
  const backingPerCss = width / cssWidth;
  const cssOverscan = clamp(Math.max(cssWidth, canvas?.clientHeight || height / backingPerCss) * VIEWPORT_LINE_OVERSCAN_RATIO, VIEWPORT_LINE_OVERSCAN_MIN_CSS_PX, VIEWPORT_LINE_OVERSCAN_MAX_CSS_PX);
  return cssOverscan * backingPerCss;
}

function screenPixelToWorldPoint(map, camera, width, height, x, y) {
  const clipX = (x / width) * 2 - 1;
  const clipY = 1 - (y / height) * 2;
  const ndcX = (clipX - camera.offsetX) / Math.max(0.0001, camera.scale);
  const ndcY = (clipY - camera.offsetY) / Math.max(0.0001, camera.scale);
  return [
    ((ndcX + 1) / 2) * map.metadata.graphWidth,
    ((1 - ndcY) / 2) * map.metadata.graphHeight
  ];
}

function worldPathIntersectsBounds(points, bounds) {
  if (!bounds || !Array.isArray(points) || points.length < 2) return true;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!isWorldPoint(point)) continue;
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }
  if (minX === Infinity) return false;
  return maxX >= bounds.minX && minX <= bounds.maxX && maxY >= bounds.minY && minY <= bounds.maxY;
}

function buildRiverMeshVertices(map, camera, canvas) {
  const build = createRiverMeshBuild(map, camera, canvas);
  for (const river of map.rivers.rivers) {
    pushRiverMesh(build, river);
  }
  return finalizeRiverMeshBuild(build);
}

async function buildRiverMeshVerticesAsync(map, camera, canvas, {yieldToBrowser = () => Promise.resolve(), sliceMs = RIVER_BUILD_SLICE_MS, shouldContinue = () => true} = {}) {
  const build = createRiverMeshBuild(map, camera, canvas);
  let sliceStartedAt = performance.now();
  for (const river of map.rivers.rivers) {
    if (!shouldContinue()) {
      build.stats.aborted = true;
      break;
    }
    pushRiverMesh(build, river);
    if (performance.now() - sliceStartedAt < sliceMs) continue;
    await yieldToBrowser();
    if (!shouldContinue()) {
      build.stats.aborted = true;
      break;
    }
    sliceStartedAt = performance.now();
  }
  return finalizeRiverMeshBuild(build);
}

function createRiverMeshBuild(map, camera, canvas) {
  const context = createRenderContext(map, {camera, canvas});
  const projection = createLineWidthProjection({map, camera, canvas});
  return {
    map,
    context,
    projection,
    viewportBounds: viewportWorldBounds(map, camera, canvas, viewportLineOverscanBackingPx(canvas)),
    vertices: [],
    stats: emptyRiverBuildStats(projection)
  };
}

function pushRiverMesh(build, river) {
  const sourcePoints = Array.isArray(river.points) ? river.points.filter(isWorldPoint) : [];
  if (sourcePoints.length < 2) return;
  if (!worldPathIntersectsBounds(sourcePoints, build.viewportBounds)) {
    build.stats.culledRivers++;
    return;
  }
  const {points, widths, colors} = getRiverRenderPath(river, build.map, build.projection, build.stats, sourcePoints);
  if (points.length < 2) return;
  const before = build.vertices.length;
  pushVariableScreenPolyline(build.vertices, build.context, points, widths, riverRenderColor(river), colors);
  if (build.vertices.length === before) return;
  build.stats.rivers++;
  build.stats.segments += points.length - 1;
}

function finalizeRiverMeshBuild(build) {
  return {
    vertices: new Float32Array(build.vertices),
    stats: normalizeRiverWidthStats(build.stats)
  };
}

function emptyRiverBuildStats(projection = null) {
  return {
    rivers: 0,
    culledRivers: 0,
    segments: 0,
    scale: projection?.scale || 0,
    cssPerWorld: projection?.cssPerWorld || 0,
    backingPerCss: projection?.backingPerCss || 0,
    minWorldWidth: Infinity,
    maxWorldWidth: 0,
    minCssWidth: Infinity,
    maxCssWidth: 0,
    minBackingWidth: Infinity,
    maxBackingWidth: 0,
    minWidthPx: Infinity,
    maxWidthPx: 0,
    minFlux: Infinity,
    maxFlux: 0,
    alphaTotal: 0,
    widthSamples: 0,
    lod: {hidden: 0, faint: 0, subpixel: 0, full: 0},
    aborted: false
  };
}

function getRiverRenderPath(river, map, projection, stats, sourcePoints = null) {
  const points = sourcePoints || river.points.filter(isWorldPoint);
  const cells = Array.isArray(river.cells) ? river.cells : [];
  const widths = [];
  const alphas = [];
  let runningFlux = 0;

  for (let index = 0; index < points.length; index++) {
    const cell = sampleRiverCell(cells, index, points.length);
    runningFlux = Math.max(runningFlux, riverPointFlux(points[index], map.pack.cells, cell, river));
    const projected = projectWorldLineWidth(riverWorldWidth({
      flux: runningFlux,
      pointIndex: index,
      widthFactor: river.widthFactor,
      sourceWidth: river.sourceWidth
    }), projection);
    widths.push(projected.backingWidth);
    alphas.push(projected.alpha);
    recordProjectedWidth(stats, projected);
    stats.minFlux = Math.min(stats.minFlux, runningFlux);
    stats.maxFlux = Math.max(stats.maxFlux, runningFlux);
  }

  const smoothedPath = smoothWorldPathWithValues(points, widths, LINE_SMOOTHING.river);
  const smoothedAlphas = smoothWorldPathWithValues(points, alphas, LINE_SMOOTHING.river).widths;
  const baseColor = riverRenderColor(river);
  return {
    ...smoothedPath,
    colors: smoothedAlphas.map(alpha => withProjectedLineAlpha(baseColor, alpha))
  };
}

function sampleRiverCell(cells, pointIndex, pointsLength) {
  if (!cells.length) return -1;
  const ratio = pointsLength <= 1 ? 0 : pointIndex / (pointsLength - 1);
  const index = Math.max(0, Math.min(cells.length - 1, Math.round(ratio * (cells.length - 1))));
  return cells[index];
}

function riverCellFlux(cells, cell, river) {
  if (cell === undefined || cell < 0) return river.discharge || river.flux || river.width || 1;
  return cells.fl?.[cell] || river.discharge || river.flux || river.width || 1;
}

function riverPointFlux(point, cells, cell, river) {
  if (Number.isFinite(point?.[2]) && point[2] > 0) return point[2];
  return riverCellFlux(cells, cell, river);
}

function normalizeRiverWidthStats(stats) {
  return {
    rivers: stats.rivers,
    culledRivers: stats.culledRivers || 0,
    segments: stats.segments,
    scale: roundValue(stats.scale),
    cssPerWorld: roundValue(stats.cssPerWorld),
    backingPerCss: roundValue(stats.backingPerCss),
    minWorldWidth: finiteWidthStat(stats.minWorldWidth),
    maxWorldWidth: roundValue(stats.maxWorldWidth),
    minCssWidth: finiteWidthStat(stats.minCssWidth),
    maxCssWidth: roundValue(stats.maxCssWidth),
    minBackingWidth: finiteWidthStat(stats.minBackingWidth),
    maxBackingWidth: roundValue(stats.maxBackingWidth),
    minWidthPx: finiteWidthStat(stats.minCssWidth),
    maxWidthPx: roundValue(stats.maxCssWidth),
    minFlux: stats.minFlux === Infinity ? 0 : roundValue(stats.minFlux),
    maxFlux: roundValue(stats.maxFlux),
    averageAlpha: stats.widthSamples ? roundValue(stats.alphaTotal / stats.widthSamples) : 0,
    lod: {...stats.lod},
    aborted: Boolean(stats.aborted)
  };
}

function emptyRiverWidthStats() {
  return {
    rivers: 0,
    culledRivers: 0,
    segments: 0,
    scale: 0,
    cssPerWorld: 0,
    backingPerCss: 0,
    minWorldWidth: 0,
    maxWorldWidth: 0,
    minCssWidth: 0,
    maxCssWidth: 0,
    minBackingWidth: 0,
    maxBackingWidth: 0,
    minWidthPx: 0,
    maxWidthPx: 0,
    minFlux: 0,
    maxFlux: 0,
    averageAlpha: 0,
    lod: {hidden: 0, faint: 0, subpixel: 0, full: 0},
    aborted: false
  };
}

function riverRenderColor(river) {
  const width = Math.min(1, Math.max(0, (river.width || 0) / 8));
  return mix([0.36, 0.58, 0.72, 0.82], [0.56, 0.74, 0.82, 0.9], width);
}

function buildTradeFlowMeshVertices(map, camera, canvas) {
  const context = createRenderContext(map, {camera, canvas});
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  const vertices = [];
  const pickItems = [];
  const stats = emptyTradeFlowRenderStats();
  const deals = topTradeFlowDeals(map);

  for (const deal of deals) {
    const seller = tradePartyInfo(map, deal.sellerType, deal.seller);
    const buyer = tradePartyInfo(map, deal.buyerType, deal.buyer);
    if (!seller.point || !buyer.point) {
      stats.invalidDeals++;
      continue;
    }
    const distance = Math.hypot(seller.point[0] - buyer.point[0], seller.point[1] - buyer.point[1]);
    if (!Number.isFinite(distance) || distance <= 1) {
      stats.shortDeals++;
      continue;
    }
    const before = vertices.length;
    const widthPx = tradeFlowWidthPx(deal) * pixelRatio;
    const priceSignal = tradeFlowPriceSignal(map, deal);
    pushScreenPolyline(vertices, context, [seller.point, buyer.point], tradeFlowColor(deal, priceSignal), widthPx);
    const addedVertices = (vertices.length - before) / 6;
    if (addedVertices <= 0) continue;
    stats.renderedDeals++;
    if (Math.abs(Number(priceSignal?.priceDelta || 0)) > 0.05) stats.priceSignalDeals++;
    stats.vertices += addedVertices;
    stats.tradeValue = roundValue(stats.tradeValue + tradeDealValue(deal));
    pickItems.push(tradeFlowPickItem(map, deal, seller, buyer, priceSignal));
    if (stats.vertices > MAX_TRADE_FLOW_VERTICES) {
      stats.vertexBudgetExceeded = true;
      break;
    }
  }

  return {
    vertices: new Float32Array(vertices),
    stats,
    pickItems
  };
}

function topTradeFlowDeals(map) {
  return (map?.pack?.deals || [])
    .filter(deal => Number.isInteger(deal?.i) && tradeDealValue(deal) > 0)
    .sort((a, b) => tradeDealValue(b) - tradeDealValue(a) || a.i - b.i)
    .slice(0, MAX_TRADE_FLOW_LINES);
}

function tradePartyInfo(map, type, id) {
  if (type === "burg") {
    const burg = map?.pack?.burgs?.[id] || map?.settlements?.cities?.find(city => city?.burgId === id || city?.id === id);
    return {
      name: burg?.name || `城镇 #${id}`,
      point: Number.isFinite(burg?.x) && Number.isFinite(burg?.y) ? [burg.x, burg.y] : null
    };
  }
  const market = map?.pack?.markets?.[id];
  const center = map?.pack?.burgs?.[market?.centerBurgId];
  const x = Number.isFinite(market?.x) ? market.x : center?.x;
  const y = Number.isFinite(market?.y) ? market.y : center?.y;
  return {
    name: market?.name || `市场 #${id}`,
    point: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  };
}

function tradeFlowPickItem(map, deal, seller, buyer, priceSignal = null) {
  const good = (map?.pack?.goods || []).find(item => item?.i === deal.good) || map?.pack?.goods?.[deal.good];
  return {
    dealId: deal.i,
    goodId: deal.good,
    goodName: good ? goodDisplayName(good) : `商品 #${deal.good}`,
    sellerType: deal.sellerType,
    sellerId: deal.seller,
    sellerName: seller.name,
    buyerType: deal.buyerType,
    buyerId: deal.buyer,
    buyerName: buyer.name,
    units: Number(deal.units || 0),
    basePrice: Number(deal.basePrice ?? deal.price ?? 0),
    price: Number(deal.price || 0),
    effectivePrice: Number(priceSignal?.effectivePrice ?? deal.price ?? 0),
    priceDelta: Number(priceSignal?.priceDelta || 0),
    pricePressure: Number(priceSignal?.pricePressure || 0),
    priceSignalLabel: tradeFlowPriceSignalLabel(priceSignal),
    value: tradeDealValue(deal),
    tradeDistance: Number.isFinite(deal.distance) ? Number(deal.distance) : roundValue(Math.hypot(seller.point[0] - buyer.point[0], seller.point[1] - buyer.point[1]), 2),
    distanceCost: Number(deal.distanceCost || 0),
    distanceMultiplier: Number(deal.distanceMultiplier || 1),
    source: deal.source || "scheduled",
    sourceLabel: tradeSourceLabel(deal.source),
    from: seller.point,
    to: buyer.point
  };
}

function tradeDealValue(deal) {
  return Number(deal?.units || 0) * Number(deal?.price || 0);
}

function tradeFlowWidthPx(deal) {
  return clamp(1.1 + Math.sqrt(tradeDealValue(deal)) * 0.32, 1.2, 5.2);
}

function tradeFlowColor(deal, priceSignal = null) {
  const base = tradeFlowBaseColor(deal);
  const delta = Number(priceSignal?.priceDelta || 0);
  if (delta > 0.05) return mix(base, [0.96, 0.34, 0.24, 0.72], clamp(delta / 4, 0.18, 0.72));
  if (delta < -0.05) return mix(base, [0.26, 0.72, 0.95, 0.66], clamp(Math.abs(delta) / 2, 0.18, 0.64));
  return base;
}

function tradeFlowBaseColor(deal) {
  if (deal.sellerType === "market" && deal.buyerType === "market") return [0.95, 0.66, 0.2, 0.5];
  if (deal.source === "marker-resource") return [0.36, 0.9, 0.5, 0.56];
  if (deal.source === "market-resource") return [0.56, 0.78, 0.38, 0.52];
  return [0.92, 0.8, 0.46, 0.46];
}

function tradeFlowPriceSignal(map, deal) {
  const buyerMarketId = tradePartyMarketId(map, deal.buyerType, deal.buyer);
  const sellerMarketId = tradePartyMarketId(map, deal.sellerType, deal.seller);
  const market = map?.pack?.markets?.[buyerMarketId] || map?.pack?.markets?.[sellerMarketId];
  const record = market?.goods?.[deal.good];
  if (!record) return null;
  return {
    marketId: market.i,
    effectivePrice: Number(record.effectivePrice ?? record.price ?? deal.price ?? 0),
    priceDelta: Number(record.priceDelta || 0),
    pricePressure: Number(record.pricePressure || 0)
  };
}

function tradePartyMarketId(map, type, id) {
  if (type === "market") return Number(id || 0);
  if (type === "burg") return Number(map?.pack?.burgs?.[id]?.market || 0);
  return 0;
}

function tradeFlowPriceSignalLabel(priceSignal) {
  const delta = Number(priceSignal?.priceDelta || 0);
  if (delta > 0.05) return "涨价";
  if (delta < -0.05) return "降价";
  return "平稳";
}

function tradeSourceLabel(source) {
  return {
    scheduled: "计划交易",
    "market-resource": "市场资源",
    "marker-resource": "资源点"
  }[source] || source || "计划交易";
}

function distanceToWorldSegment(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return Math.hypot(x - a[0], y - a[1]);
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared, 0, 1);
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

function emptyTradeFlowRenderStats() {
  return {
    renderedDeals: 0,
    invalidDeals: 0,
    shortDeals: 0,
    vertices: 0,
    tradeValue: 0,
    priceSignalDeals: 0,
    maxDeals: MAX_TRADE_FLOW_LINES,
    vertexBudgetExceeded: false
  };
}

export function buildRouteMeshVertices(map, camera, canvas, selection, objectHighlights, visualTheme) {
  const build = createRouteMeshBuild(map, camera, canvas, selection, objectHighlights, visualTheme);
  for (const route of map.settlements.routes) {
    if (!pushRouteMesh(build, route)) break;
  }
  return finalizeRouteMeshBuild(build);
}

async function buildRouteMeshVerticesAsync(map, camera, canvas, selection, objectHighlights, {yieldToBrowser = () => Promise.resolve(), sliceMs = ROUTE_BUILD_SLICE_MS, shouldContinue = () => true} = {}, visualTheme) {
  const build = createRouteMeshBuild(map, camera, canvas, selection, objectHighlights, visualTheme);
  let sliceStartedAt = performance.now();
  for (const route of map.settlements.routes) {
    if (!shouldContinue()) {
      build.stats.aborted = true;
      break;
    }
    if (!pushRouteMesh(build, route)) break;
    if (performance.now() - sliceStartedAt < sliceMs) continue;
    await yieldToBrowser();
    if (!shouldContinue()) {
      build.stats.aborted = true;
      break;
    }
    sliceStartedAt = performance.now();
  }
  return finalizeRouteMeshBuild(build);
}

function createRouteMeshBuild(map, camera, canvas, selection, objectHighlights, visualTheme) {
  const context = createRenderContext(map, {camera, canvas});
  const projection = createLineWidthProjection({map, camera, canvas});
  return {
    context,
    projection,
    viewportBounds: viewportWorldBounds(map, camera, canvas, viewportLineOverscanBackingPx(canvas)),
    visualTheme,
    selection,
    objectHighlights,
    vertices: [],
    seaLandVertices: [],
    seaWaterVertices: [],
    stats: emptyRouteRenderStats(projection)
  };
}

function pushRouteMesh(build, route) {
  if (build.stats.vertexBudgetExceeded || build.stats.pointBudgetExceeded) return false;
  build.stats.routes++;
  const points = normalizeRouteRenderPath(route.points, build.stats);
  if (points.length < 2) {
    build.stats.skippedRoutes++;
    return true;
  }
  if (!worldPathIntersectsBounds(points, build.viewportBounds)) {
    build.stats.culledRoutes++;
    return true;
  }
  const selected = isSelectedOrHighlighted(build.selection, build.objectHighlights, OBJECT_KIND.ROUTE, route.id);
  const style = resolveRouteStyle(route, build.visualTheme);
  const baseProjection = projectWorldLineWidth(style.worldWidth, build.projection);
  const renderedProjection = selected
    ? projectWorldLineWidth(style.worldWidth, build.projection, {haloCssPx: ROUTE_SELECTION_HALO_CSS_PX})
    : baseProjection;
  const color = selected ? SELECTED_ROUTE_COLOR : withProjectedLineAlpha(style.color, baseProjection.alpha);
  const widthPx = renderedProjection.backingWidth;
  recordProjectedWidth(build.stats, baseProjection);
  if (selected) build.stats.selectedHaloRoutes++;
  const dash = !selected && style.dash ? {
    dashPx: style.dash[0] * build.projection.backingPerCss,
    gapPx: style.dash[1] * build.projection.backingPerCss,
    maxPieces: MAX_ROUTE_DASH_PIECES
  } : null;
  const smoothed = smoothWorldPath(points, LINE_SMOOTHING.route);
  build.stats.smoothedPoints += smoothed.length;
  const isMaskedSeaRoute = route.type === "searoute" && !selected;
  const target = isMaskedSeaRoute ? build.seaLandVertices : build.vertices;
  const before = target.length;
  pushScreenPolyline(target, build.context, smoothed, color, widthPx, dash);
  let addedVertices = (target.length - before) / 6;
  if (isMaskedSeaRoute && addedVertices > 0) {
    const seaBefore = build.seaWaterVertices.length;
    const seaColor = withProjectedLineAlpha(style.seaColor, baseProjection.alpha);
    pushScreenPolyline(build.seaWaterVertices, build.context, smoothed, seaColor, widthPx, dash);
    addedVertices += (build.seaWaterVertices.length - seaBefore) / 6;
    build.stats.maskedSeaRoutes++;
  }
  if (addedVertices <= 0) return true;
  build.stats.renderedRoutes++;
  build.stats.vertices += addedVertices;
  if (build.stats.vertices > MAX_ROUTE_RENDER_VERTICES) {
    build.stats.vertexBudgetExceeded = true;
    build.stats.truncatedRoutes++;
    return false;
  }
  return true;
}

function finalizeRouteMeshBuild(build) {
  const ordinaryCount = build.vertices.length / 6;
  const seaLandCount = build.seaLandVertices.length / 6;
  const seaWaterCount = build.seaWaterVertices.length / 6;
  return {
    vertices: new Float32Array([...build.vertices, ...build.seaLandVertices, ...build.seaWaterVertices]),
    drawRanges: {
      ordinary: {first: 0, count: ordinaryCount},
      seaLand: {first: ordinaryCount, count: seaLandCount},
      seaWater: {first: ordinaryCount + seaLandCount, count: seaWaterCount}
    },
    stats: normalizeRouteRenderStats(build.stats)
  };
}

function normalizeRouteRenderPath(points, stats) {
  if (!Array.isArray(points) || points.length < 2) return [];
  stats.sourcePoints += points.length;
  const normalized = [];
  let previous = null;
  for (const point of points) {
    if (!isWorldPoint(point)) {
      stats.invalidPoints++;
      continue;
    }
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) <= 0.001) {
      stats.duplicatePoints++;
      continue;
    }
    normalized.push(point);
    previous = point;
  }
  if (normalized.length < 2) return [];

  const remaining = MAX_ROUTE_RENDER_POINTS_TOTAL - stats.renderPoints;
  if (remaining < 2) {
    stats.pointBudgetExceeded = true;
    stats.truncatedRoutes++;
    return [];
  }

  const limit = Math.min(MAX_ROUTE_RENDER_POINTS_PER_ROUTE, remaining);
  const result = normalized.length > limit ? decimateRoutePath(normalized, limit) : normalized;
  if (result.length < normalized.length) {
    stats.decimatedRoutes++;
    stats.decimatedPoints += normalized.length - result.length;
    if (remaining <= MAX_ROUTE_RENDER_POINTS_PER_ROUTE) stats.pointBudgetExceeded = true;
  }
  stats.renderPoints += result.length;
  return result;
}

function decimateRoutePath(points, limit) {
  if (points.length <= limit) return points;
  const count = Math.max(2, Math.round(limit));
  const result = [];
  const last = points.length - 1;
  for (let index = 0; index < count; index++) {
    result.push(points[Math.round((index / (count - 1)) * last)]);
  }
  return result;
}

function emptyRouteRenderStats(projection = null) {
  return {
    routes: 0,
    renderedRoutes: 0,
    culledRoutes: 0,
    skippedRoutes: 0,
    truncatedRoutes: 0,
    decimatedRoutes: 0,
    sourcePoints: 0,
    renderPoints: 0,
    smoothedPoints: 0,
    decimatedPoints: 0,
    duplicatePoints: 0,
    invalidPoints: 0,
    vertices: 0,
    scale: projection?.scale || 0,
    cssPerWorld: projection?.cssPerWorld || 0,
    backingPerCss: projection?.backingPerCss || 0,
    minWorldWidth: Infinity,
    maxWorldWidth: 0,
    minCssWidth: Infinity,
    maxCssWidth: 0,
    minBackingWidth: Infinity,
    maxBackingWidth: 0,
    alphaTotal: 0,
    widthSamples: 0,
    lod: {hidden: 0, faint: 0, subpixel: 0, full: 0},
    selectedHaloCssPx: ROUTE_SELECTION_HALO_CSS_PX,
    selectedHaloRoutes: 0,
    maskedSeaRoutes: 0,
    pointBudgetExceeded: false,
    vertexBudgetExceeded: false,
    aborted: false
  };
}

function normalizeRouteRenderStats(stats) {
  const normalized = {
    ...stats,
    scale: roundValue(stats.scale),
    cssPerWorld: roundValue(stats.cssPerWorld),
    backingPerCss: roundValue(stats.backingPerCss),
    minWorldWidth: finiteWidthStat(stats.minWorldWidth),
    maxWorldWidth: roundValue(stats.maxWorldWidth),
    minCssWidth: finiteWidthStat(stats.minCssWidth),
    maxCssWidth: roundValue(stats.maxCssWidth),
    minBackingWidth: finiteWidthStat(stats.minBackingWidth),
    maxBackingWidth: roundValue(stats.maxBackingWidth),
    averageAlpha: stats.widthSamples ? roundValue(stats.alphaTotal / stats.widthSamples) : 0,
    lod: {...stats.lod},
    aborted: Boolean(stats.aborted)
  };
  delete normalized.alphaTotal;
  delete normalized.widthSamples;
  return normalized;
}

function recordProjectedWidth(stats, projected) {
  stats.minWorldWidth = Math.min(stats.minWorldWidth, projected.worldWidth);
  stats.maxWorldWidth = Math.max(stats.maxWorldWidth, projected.worldWidth);
  stats.minCssWidth = Math.min(stats.minCssWidth, projected.baseCssWidth);
  stats.maxCssWidth = Math.max(stats.maxCssWidth, projected.baseCssWidth);
  const baseBackingWidth = projected.baseCssWidth * (stats.backingPerCss || 1);
  stats.minBackingWidth = Math.min(stats.minBackingWidth, baseBackingWidth);
  stats.maxBackingWidth = Math.max(stats.maxBackingWidth, baseBackingWidth);
  stats.alphaTotal += projected.alpha;
  stats.widthSamples++;
  stats.lod[projected.lod] = (stats.lod[projected.lod] || 0) + 1;
}

function finiteWidthStat(value) {
  return value === Infinity ? 0 : roundValue(value);
}

function buildPointVertices(map, visibility = {}) {
  const context = createRenderContext(map);
  const vertices = [];
  if (visibility.population !== false) {
    for (const point of map.settlements.populationPoints) {
      const alpha = Math.min(0.8, 0.25 + point.population / Math.max(1, map.settlements.metadata.maxPopulation));
      pushWorldVertex(vertices, context, point.point, [0.25, 0.42, 0.24, alpha]);
    }
  }
  if (visibility.cities !== false) {
    for (const city of map.settlements.cities) {
      if (!city) continue;
      const color = city.capital ? [0.98, 0.82, 0.32, 1] : city.port ? [0.35, 0.72, 0.95, 1] : [0.92, 0.72, 0.38, 1];
      pushWorldVertex(vertices, context, [city.x, city.y], color);
    }
  }
  if (visibility.markers !== false || visibility.resources !== false) {
    for (const marker of map.markers.markers) {
      if (!isMarkerLayerVisible(marker, visibility)) continue;
      pushWorldVertex(vertices, context, [marker.x, marker.y], colorForMarker(marker));
    }
  }
  if (visibility.military !== false) {
    for (const regiment of militaryRegiments(map)) pushWorldVertex(vertices, context, [regiment.x, regiment.y], colorForRegiment(regiment));
  }
  return new Float32Array(vertices);
}

function isMarkerLayerVisible(marker, visibility = {}) {
  if (marker.category === "resource") return visibility.resources !== false;
  return visibility.markers !== false;
}

function colorForMarker(marker) {
  if (Array.isArray(marker.color) && marker.color.length >= 4) return marker.color;
  if (marker.category === "resource") return [0.22, 0.74, 0.46, 1];
  if (marker.category === "water") return [0.32, 0.66, 0.95, 1];
  if (marker.category === "natural") return [0.68, 0.78, 0.45, 1];
  if (marker.category === "infrastructure") return [0.9, 0.6, 0.24, 1];
  if (marker.category === "trade") return [0.96, 0.76, 0.26, 1];
  if (marker.category === "hazard") return [0.9, 0.28, 0.22, 1];
  if (marker.category === "culture") return [0.64, 0.48, 0.86, 1];
  if (marker.category === "settlement") return [0.94, 0.56, 0.38, 1];
  if (marker.type === "peak" || marker.type === "volcanoes") return [0.94, 0.94, 0.88, 1];
  if (marker.type === "river-source" || marker.type === "water-sources") return [0.5, 0.82, 1, 1];
  if (marker.type === "state-center" || marker.type === "statues") return [1, 0.68, 0.28, 1];
  return [0.55, 0.44, 0.86, 1];
}

function scoreCityLabel(city) {
  return (city.capital ? 320 : 0) + (city.provincial ? 150 : 0) + (city.port ? 28 : 0) + city.population;
}

function minLabelScale(city, rank, totalLabels = 48) {
  if (city.capital) return 0.45;
  if (city.provincial) return 0.68;
  const total = Math.max(1, totalLabels - 1);
  const rankRatio = Math.max(0, Math.min(1, rank / total));
  if (rank < 12) return 0.72 + rankRatio * 0.22;
  if (city.population >= 72) return 1.02 + rankRatio * 0.82;
  return 0.9 + rankRatio ** 0.72 * 5.2;
}

function labelLimitForScale(scale, maxCityLabels = DEFAULT_MAX_CITY_LABELS) {
  const limit = normalizeMaxCityLabels(maxCityLabels, DEFAULT_MAX_CITY_LABELS);
  const t = smoothStep(0.55, 6.2, scale);
  return Math.min(limit, Math.max(8, Math.round(8 + (limit - 8) * t)));
}

function labelPaddingForScale(scale) {
  if (scale < 0.85) return 14;
  if (scale < 1.6) return 9;
  return 5;
}

function stateLabelScaleBehavior(scale) {
  const rawOpacity = 1 - smootherStep(1.55, 3.95, scale);
  const opacity = rawOpacity < 0.004 ? 0 : clamp(rawOpacity, 0, 1);
  return {
    blocksCities: scale < 1.55,
    visible: opacity > 0,
    opacity
  };
}

function labelBoxForItem(item, screen, anchor = null) {
  const metrics = item.metrics || estimateLabelTextBox(item.text, item.resolvedStyle);
  if (item.targetKind === LABEL_TARGET_KIND.STATE || item.targetKind === LABEL_TARGET_KIND.PROVINCE) {
    const estimatedWidth = metrics.width;
    const estimatedHeight = metrics.height;
    const radians = Math.abs((item.rotation || 0) * Math.PI / 180);
    const boxWidth = estimatedWidth * Math.cos(radians) + estimatedHeight * Math.sin(radians);
    const boxHeight = estimatedWidth * Math.sin(radians) + estimatedHeight * Math.cos(radians);
    return {
      left: screen.x - boxWidth / 2,
      right: screen.x + boxWidth / 2,
      top: screen.y - boxHeight / 2,
      bottom: screen.y + boxHeight / 2
    };
  }
  const estimatedWidth = metrics.width;
  const estimatedHeight = metrics.height;
  if (item.targetKind === LABEL_TARGET_KIND.CITY) {
    const anchorY = anchor?.y ?? screen.y - 6;
    return {
      left: screen.x - estimatedWidth / 2,
      right: screen.x + estimatedWidth / 2,
      top: anchorY - estimatedHeight,
      bottom: anchorY
    };
  }
  return {
    left: screen.x - estimatedWidth / 2,
    right: screen.x + estimatedWidth / 2,
    top: screen.y - estimatedHeight - 8,
    bottom: screen.y + 2
  };
}

function applyResolvedLabelStyle(node, style) {
  node.style.setProperty("--label-font-family", style.fontFamily);
  node.style.setProperty("--label-font-size", `${style.fontSize}px`);
  node.style.setProperty("--label-font-weight", String(style.fontWeight));
  node.style.setProperty("--label-font-style", style.italic ? "italic" : "normal");
  node.style.setProperty("--label-letter-spacing", `${style.letterSpacing}px`);
  node.style.setProperty("--label-color", style.color);
  node.style.setProperty("--label-opacity", String(style.opacity));
  node.style.setProperty("--label-stroke-color", style.strokeColor);
  node.style.setProperty("--label-stroke-width", `${style.strokeWidth}px`);
  node.style.setProperty("--label-shadow-color", hasVisibleLabelShadow(style) ? style.shadowColor : "transparent");
  node.style.setProperty("--label-shadow-offset-x", `${style.shadowOffsetX}px`);
  node.style.setProperty("--label-shadow-offset-y", `${style.shadowOffsetY}px`);
  node.style.setProperty("--label-shadow-blur", `${style.shadowBlur}px`);
}

function normalizeMaxCityLabels(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(8, Math.min(5000, Math.round(number)));
}

function normalizePositiveId(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function smoothStep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.000001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function smootherStep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.000001, edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function boxesOverlap(a, b, padding) {
  return a.left - padding < b.right && a.right + padding > b.left && a.top - padding < b.bottom && a.bottom + padding > b.top;
}

function boxesOverlapAny(boxes, box, padding) {
  const start = Math.max(0, boxes.length - MAX_OVERLAY_COLLISION_BOXES);
  for (let index = boxes.length - 1; index >= start; index--) {
    if (boxesOverlap(box, boxes[index], padding)) return true;
  }
  return false;
}

function withAlpha(color, alpha) {
  return [color?.[0] ?? 0, color?.[1] ?? 0, color?.[2] ?? 0, alpha];
}

function snapshotCamera(camera) {
  return {
    scale: Number(camera?.scale) || 1,
    offsetX: Number(camera?.offsetX) || 0,
    offsetY: Number(camera?.offsetY) || 0
  };
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function createRendererLoadProfile() {
  const startedAt = performance.now();
  const stages = [];
  return {
    stage(id, label, task) {
      const started = performance.now();
      const result = task();
      stages.push({id, label, ms: roundMs(performance.now() - started)});
      return result;
    },
    async stageAsync(id, label, task) {
      const started = performance.now();
      const result = await task();
      stages.push({id, label, ms: roundMs(performance.now() - started)});
      return result;
    },
    finish() {
      const totalMs = roundMs(performance.now() - startedAt);
      const slowest = stages.reduce((best, stage) => stage.ms > (best?.ms ?? -1) ? stage : best, null);
      return {totalMs, stages, slowest: slowest ? {...slowest} : null};
    }
  };
}

function emptyRendererLoadStats() {
  return {totalMs: 0, stages: [], slowest: null};
}

function createRendererPerformanceEvents() {
  return Object.fromEntries([
    "draw",
    "overlay",
    "routeMesh",
    "riverMesh",
    "selectionMesh",
    "surfaceRefresh",
    "lineRefresh",
    "pointRefresh",
    "bufferUpload",
    "viewportPreview",
    "viewportCommit"
  ].map(key => [key, createRendererPerformanceEventChannel()]));
}

function createRendererPerformanceEventChannel() {
  return {
    sequence: 0,
    pending: false,
    running: false,
    pendingCount: 0,
    runningCount: 0,
    scheduled: 0,
    started: 0,
    completed: 0,
    canceled: 0,
    failed: 0,
    ms: 0,
    last: null,
    recent: []
  };
}

function beginRendererPerformanceEvent(channel, details, startedAt) {
  const token = createRendererPerformanceEventToken(channel, details, startedAt, "running");
  channel.started += 1;
  channel.runningCount += 1;
  updateRendererPerformanceEventState(channel);
  channel.last = rendererPerformanceEventSnapshot(token, "running", startedAt, 0);
  return token;
}

function queueRendererPerformanceEvent(channel, details, queuedAt) {
  const token = createRendererPerformanceEventToken(channel, details, queuedAt, "pending");
  channel.pendingCount += 1;
  updateRendererPerformanceEventState(channel);
  channel.last = rendererPerformanceEventSnapshot(token, "pending", queuedAt, 0);
  return token;
}

function createRendererPerformanceEventToken(channel, details, timestamp, phase) {
  channel.sequence += 1;
  channel.scheduled += 1;
  return {
    channel,
    sequence: channel.sequence,
    details: {...details},
    queuedAt: timestamp,
    startedAt: phase === "running" ? timestamp : null,
    phase,
    finalized: false
  };
}

function startQueuedRendererPerformanceEvent(token, startedAt) {
  if (!token || token.finalized || token.phase !== "pending") return token;
  token.channel.pendingCount = Math.max(0, token.channel.pendingCount - 1);
  token.channel.runningCount += 1;
  token.channel.started += 1;
  token.startedAt = startedAt;
  token.phase = "running";
  updateRendererPerformanceEventState(token.channel);
  if ((token.channel.last?.sequence || 0) <= token.sequence) token.channel.last = rendererPerformanceEventSnapshot(token, "running", startedAt, 0);
  return token;
}

function completeRendererPerformanceEvent(token, details, completedAt) {
  return finalizeRendererPerformanceEvent(token, "completed", details, completedAt);
}

function cancelRendererPerformanceEvent(token, reason, details, canceledAt) {
  return finalizeRendererPerformanceEvent(token, "canceled", {reason, ...details}, canceledAt);
}

function failRendererPerformanceEvent(token, error, details, failedAt) {
  return finalizeRendererPerformanceEvent(token, "failed", {error: error instanceof Error ? error.message : String(error), ...details}, failedAt);
}

function finalizeRendererPerformanceEvent(token, status, details, timestamp) {
  if (!token || token.finalized) return token?.channel?.last || null;
  token.finalized = true;
  if (token.phase === "pending") token.channel.pendingCount = Math.max(0, token.channel.pendingCount - 1);
  if (token.phase === "running") token.channel.runningCount = Math.max(0, token.channel.runningCount - 1);
  token.phase = status;
  token.channel[status] += 1;
  updateRendererPerformanceEventState(token.channel);
  const startedAt = token.startedAt ?? token.queuedAt;
  const event = rendererPerformanceEventSnapshot(token, status, timestamp, roundMs(timestamp - startedAt), details);
  token.channel.ms = event.ms;
  if ((token.channel.last?.sequence || 0) <= token.sequence) token.channel.last = event;
  token.channel.recent.push(event);
  if (token.channel.recent.length > RENDERER_EVENT_HISTORY_LIMIT) token.channel.recent.splice(0, token.channel.recent.length - RENDERER_EVENT_HISTORY_LIMIT);
  return event;
}

function rendererPerformanceEventSnapshot(token, status, timestamp, ms, details = {}) {
  return {
    sequence: token.sequence,
    status,
    queuedAt: roundMs(token.queuedAt),
    startedAt: token.startedAt === null ? null : roundMs(token.startedAt),
    timestamp: roundMs(timestamp),
    pendingMs: token.startedAt === null ? roundMs(timestamp - token.queuedAt) : roundMs(token.startedAt - token.queuedAt),
    ms: Object.prototype.hasOwnProperty.call(details, "ms") ? roundMs(details.ms) : roundMs(ms),
    ...token.details,
    ...details
  };
}

function updateRendererPerformanceEventState(channel) {
  channel.pending = channel.pendingCount > 0;
  channel.running = channel.runningCount > 0;
}

function snapshotRendererPerformanceEvents(events, {includeRecent = false} = {}) {
  return Object.fromEntries(Object.entries(events).map(([key, channel]) => [key, {
    sequence: channel.sequence,
    pending: channel.pending,
    running: channel.running,
    pendingCount: channel.pendingCount,
    runningCount: channel.runningCount,
    scheduled: channel.scheduled,
    started: channel.started,
    completed: channel.completed,
    canceled: channel.canceled,
    failed: channel.failed,
    ms: channel.ms,
    last: channel.last ? {...channel.last} : null,
    historyLimit: RENDERER_EVENT_HISTORY_LIMIT,
    recentCount: channel.recent.length,
    ...(includeRecent ? {recent: channel.recent.map(event => ({...event}))} : {})
  }]));
}

function emptyOverlayUpdateStats() {
  return {
    sequence: 0,
    totalMs: 0,
    labelsMs: 0,
    cityIconsMs: 0,
    markerIconsMs: 0,
    militaryIconsMs: 0,
    selectionMs: 0,
    gridCellIdsMs: 0,
    overlayChildren: 0,
    labelItems: 0,
    visibleLabels: 0,
    visibleStateLabels: 0,
    visibleProvinceLabels: 0,
    fallbackProvinceLabels: 0,
    stateCityOverlapLabels: 0,
    cityIconItems: 0,
    visibleCityIcons: 0,
    markerIconItems: 0,
    visibleMarkerIcons: 0,
    militaryIconItems: 0,
    visibleMilitaryIcons: 0
  };
}

function emptyGridCellDiagnosticsStats() {
  return {
    ready: false,
    building: false,
    edges: 0,
    vertexCount: 0,
    buildMs: 0,
    uploadMs: 0,
    maxSliceMs: 0,
    bufferBytes: 0,
    visibleIds: 0,
    packCounts: new Uint32Array(),
    buildPromise: null
  };
}

function summarizeGridCellDiagnostics(stats = {}) {
  return {
    ready: Boolean(stats.ready),
    building: Boolean(stats.building),
    edges: Number(stats.edges) || 0,
    vertexCount: Number(stats.vertexCount) || 0,
    buildMs: Number(stats.buildMs) || 0,
    uploadMs: Number(stats.uploadMs) || 0,
    maxSliceMs: Number(stats.maxSliceMs) || 0,
    bufferBytes: Number(stats.bufferBytes) || 0,
    visibleIds: Number(stats.visibleIds) || 0,
    ...(stats.error ? {error: String(stats.error)} : {})
  };
}

function gridCellIdMinimumScale(map) {
  const cells = Number(map?.grid?.cells?.i?.length || 0);
  if (cells <= 12000) return 6;
  if (cells <= 55000) return 10;
  return 14;
}

function roundValue(value) {
  return Math.round(value * 10) / 10;
}

function roundTransformScale(value) {
  return Math.round(value * 1e6) / 1e6;
}

function snapCssPixel(value, pixelRatio = 1) {
  const ratio = Math.max(1, Number(pixelRatio) || 1);
  return Math.round(value * ratio) / ratio;
}

function formatPopulationPeople(value) {
  return `${Math.round(Number(value || 0) * POPULATION_UNIT_PEOPLE).toLocaleString("zh-CN")} 人`;
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec4 a_color;
uniform float u_scale;
uniform vec2 u_offset;
uniform bool u_pointMode;
uniform bool u_surfaceSideMode;
out vec4 v_color;

void main() {
  v_color = a_color;
  gl_PointSize = 4.0;
  float z = u_surfaceSideMode ? (a_color.a < 0.5 ? -0.5 : 0.5) : 0.0;
  gl_Position = vec4(a_position * u_scale + u_offset, z, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec4 v_color;
uniform bool u_pointMode;
uniform bool u_surfaceSideMode;
out vec4 outColor;

void main() {
  if (u_pointMode) {
    vec2 coord = gl_PointCoord * 2.0 - 1.0;
    float distanceFromCenter = length(coord);
    if (distanceFromCenter > 1.0) discard;
    float alpha = 1.0 - smoothstep(0.72, 1.0, distanceFromCenter);
    outColor = vec4(v_color.rgb, v_color.a * alpha);
    return;
  }

  outColor = u_surfaceSideMode ? vec4(v_color.rgb, 1.0) : v_color;
}`;
