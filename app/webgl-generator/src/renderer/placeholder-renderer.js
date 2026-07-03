import {buildObjectPickingIndex, pickCity, pickGridCell, pickMarker, pickMilitary, pickPoliticalObject, pickRiver, pickRoute} from "./picking.js";
import {bindVertexBuffer, createProgram} from "./gl-utils.js";
import {createRenderContext, worldToNdcPoint, worldToScreenPixel} from "./render-context.js";
import {isLandCell} from "./color-modes.js";
import {politicalSurfaceMeshForMode, pushGridCells, pushMeshSurfaceVertices, shouldDrawGridCellUnderPoliticalMesh} from "./cell-surface-layer.js";
import {buildCellVisualGridVertices, buildCellVisualMesh, emptyCellVisualMesh, summarizeCellVisualMesh} from "./cell-visual-layer.js";
import {buildSelectionMeshVertices, selectionHighlightMode} from "./selection-layer.js";
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
  buildShoreVisualPaths,
  emptyShoreVisualPaths,
  pushShoreLineLayers,
  pushShoreVisualBands,
  summarizeShoreVisualPaths
} from "./shore-layer.js";
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
import {CITY_ICON_PALETTES, resolveCityVisual} from "../runtime/city-visuals.js";
import {isGeneratedLabelHidden} from "../runtime/label-edit-commands.js";
import {militaryIconLabelForVariant, militaryIconUrlForVariant, normalizeMilitaryIconVariant} from "./military-icon-assets.js";

const MARKER_ICON_MIN_SCALE = 2.15;
const MARKER_ICON_RELAXED_SCALE = 4.4;
const MARKER_ICON_BASE_WIDTH = 28;
const MARKER_ICON_BASE_HEIGHT = 32;
const CITY_ICON_MIN_SCALE = 1.05;
const CITY_ICON_RELAXED_SCALE = 3.8;
const CITY_ICON_BASE_WIDTH = 34;
const CITY_ICON_BASE_HEIGHT = 26;
const MILITARY_ICON_MIN_SCALE = 0.76;
const MILITARY_ICON_RELAXED_SCALE = 2.6;
const MILITARY_ICON_BASE_WIDTH = 58;
const MILITARY_ICON_BASE_HEIGHT = 24;
const POPULATION_UNIT_PEOPLE = 1000;
const MAX_OVERLAY_COLLISION_BOXES = 900;
const ROUTE_BUILD_SLICE_MS = 10;
const MAX_ROUTE_RENDER_POINTS_PER_ROUTE = 4096;
const MAX_ROUTE_RENDER_POINTS_TOTAL = 90000;
const MAX_ROUTE_RENDER_VERTICES = 900000;
const MAX_ROUTE_DASH_PIECES = 20000;

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

const MARKER_ICON_SYMBOLS = Object.freeze({
  mine: '<path d="M9.2 17.7 18 8.9"/><path d="M16.2 7.8c1.6.1 2.7.5 3.6 1.4-.8.2-1.6.6-2.5 1.4"/><path d="m9 9 10 9"/>',
  salt: '<path class="fill" d="M11 10.1h2.7v2.7H11zM15.1 12.4h2.3v2.3h-2.3zM10.2 15.1h2.2v2.2h-2.2z"/><path d="M9.2 18.4h9.6"/>',
  life: '<path d="M10.1 17.8c5.7-.6 8.1-4.4 8.5-8.2-4.5.1-8.2 2.2-8.6 7.6"/><path d="M10.3 17.6c1.4-2.3 3.2-4.1 5.5-5.4"/><path d="M8.7 10.4l.9 1.4 1.5.6-1.5.6-.9 1.4-.7-1.4-1.5-.6 1.5-.6z"/>',
  gem: '<path class="fill" d="m14 7.4 6.5 4.7-2.7 7.5h-7.6l-2.7-7.5z"/><path d="M7.7 12.1h12.6M11.2 8.3l2.8 11.3 2.8-11.3"/>',
  spring: '<path d="M9.1 11.2c1.7-1.4 3.4-1.4 5 0 1.6 1.3 3.2 1.3 4.8 0"/><path d="M9.1 14.6c1.7-1.4 3.4-1.4 5 0 1.6 1.3 3.2 1.3 4.8 0"/><path d="M11.1 18.1h5.8"/>',
  drop: '<path class="fill" d="M14 7.7c3.2 3.8 4.8 6.4 4.8 8.1a4.8 4.8 0 0 1-9.6 0c0-1.7 1.6-4.3 4.8-8.1z"/>',
  volcano: '<path class="fill" d="M7.8 19.2 12.4 8.6h3.2l4.6 10.6z"/><path d="m12 10.4 2 2.2 2-2.2M10.2 19.2h7.6"/>',
  bridge: '<path d="M7.7 18.7h12.6M9 18.6c.7-4.2 2.3-6.3 5-6.3s4.3 2.1 5 6.3M10.2 14.2h7.6"/>',
  inn: '<path class="fill" d="M9.4 10.4h9.2v8H9.4z"/><path d="M8.2 11.1 14 7.5l5.8 3.6M12 18.3v-4h4v4"/>',
  tower: '<path class="fill" d="M10.4 9.2h7.2v10h-7.2z"/><path d="M10 9.1V7.7h1.8v1.4h4.4V7.7H18v1.4M12.4 19.1v-4h3.2v4"/>',
  ruin: '<path d="M8.7 18.8h10.6M10 10.1h8M11.1 10.2v8.2M14 10.2v8.2M16.9 10.2v8.2"/><path class="fill" d="m9.5 8.1 4.5-1.5 4.5 1.5z"/>',
  book: '<path d="M8.5 9.1h4.7c.7 0 1.1.4 1.1 1.1v8.1c0-.7-.5-1.1-1.2-1.1H8.5z"/><path d="M19.5 9.1h-4.7c-.7 0-1.1.4-1.1 1.1v8.1c0-.7.5-1.1 1.2-1.1h4.6z"/>',
  market: '<path d="M8.5 11.2h11M9.6 11.4l1-3h6.8l1 3"/><path class="fill" d="M10 13.2h8v5.7h-8z"/><path d="M12.8 18.8v-3.1h2.4v3.1"/>',
  danger: '<path class="fill" d="m14 7.6 6 11H8z"/><path d="M14 11.3v3.6M14 17.4h.1"/>',
  star: '<path class="fill" d="m14 7.6 1.7 4 4.2.4-3.2 2.8.9 4.2-3.6-2.2-3.6 2.2.9-4.2L8.1 12l4.2-.4z"/>',
  marker: '<circle class="fill" cx="14" cy="13.8" r="4.5"/><path d="M14 9.3v9"/>'
});

export class PlaceholderMapRenderer {
  constructor(canvas, onViewChange = () => {}, onHover = () => {}, onSelect = () => {}) {
    this.canvas = canvas;
    this.overlay = canvas.parentElement?.querySelector("#map-overlay") || null;
    this.onViewChange = onViewChange;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.canvasSize = lockCanvasToInitialDisplaySize(canvas, this.overlay);
    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      stencil: false
    });
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL2");

    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.locations = {
      position: this.gl.getAttribLocation(this.program, "a_position"),
      color: this.gl.getAttribLocation(this.program, "a_color"),
      scale: this.gl.getUniformLocation(this.program, "u_scale"),
      offset: this.gl.getUniformLocation(this.program, "u_offset"),
      pointMode: this.gl.getUniformLocation(this.program, "u_pointMode")
    };
    this.vertexBuffer = this.gl.createBuffer();
    this.routeBuffer = this.gl.createBuffer();
    this.riverBuffer = this.gl.createBuffer();
    this.selectionBuffer = this.gl.createBuffer();
    this.lineBuffer = this.gl.createBuffer();
    this.pointBuffer = this.gl.createBuffer();
    this.politicalMeshDebugBuffer = this.gl.createBuffer();
    this.vertexCount = 0;
    this.routeVertexCount = 0;
    this.riverVertexCount = 0;
    this.selectionVertexCount = 0;
    this.lineVertexCount = 0;
    this.pointVertexCount = 0;
    this.politicalMeshDebugMode = "none";
    this.politicalMeshDebugVertexCount = 0;
    this.labelCount = 0;
    this.visibleLabelCount = 0;
    this.cityLabelCount = 0;
    this.visibleCityLabelCount = 0;
    this.stateLabelCount = 0;
    this.visibleStateLabelCount = 0;
    this.labelItems = [];
    this.cityIconItems = [];
    this.cityIconCount = 0;
    this.visibleCityIconCount = 0;
    this.cityIconScaleThreshold = CITY_ICON_MIN_SCALE;
    this.markerIconItems = [];
    this.markerIconCount = 0;
    this.visibleMarkerIconCount = 0;
    this.markerIconScaleThreshold = MARKER_ICON_MIN_SCALE;
    this.militaryIconItems = [];
    this.militaryIconCount = 0;
    this.visibleMilitaryIconCount = 0;
    this.selection = null;
    this.selectionMarker = null;
    this.objectPickingIndex = null;
    this.lastObjectCandidateCount = 0;
    this.routeBuildMs = 0;
    this.routeRenderStats = emptyRouteRenderStats();
    this.riverBuildMs = 0;
    this.selectionBuildMs = 0;
    this.routeWidthMode = "screen-space";
    this.riverWidthMode = "screen-space flux mesh";
    this.riverWidthStats = emptyRiverWidthStats();
    this.cellVisualMesh = emptyCellVisualMesh();
    this.shoreVisualPaths = emptyShoreVisualPaths();
    this.stateVisualPaths = emptyPoliticalVisualPaths();
    this.provinceVisualPaths = emptyPoliticalVisualPaths();
    this.politicalVisualMeshes = emptyPoliticalVisualMeshes();
    this.locateStatus = "none";
    this.locateFlash = null;
    this.locateFlashFrame = 0;
    this.colorMode = "height";
    this.viewOptions = {showOceanHeight: false, smoothCellBorders: true, diplomacySubjectId: null};
    this.labelOptions = {maxCityLabels: 5000};
    this.layerVisibility = {
      routes: true,
      rivers: true,
      cities: true,
      labels: true,
      stateLabels: true,
      population: true,
      markers: true,
      resources: true,
      military: true,
      warFronts: true,
      scaleBar: true,
      coastline: true,
      lakeShore: true,
      stateBorders: true,
      provinceBorders: true
    };
    this.camera = {scale: 1, offsetX: 0, offsetY: 0};
    this.dynamicBuffersDirty = {
      routes: true,
      rivers: true,
      selection: true
    };
    this.lastDraw = {drawMs: 0};
    this.lastLoad = emptyRendererLoadStats();
    installCanvasInteractions(this.canvas, this.camera, () => {
      this.markViewportBuffersDirty();
      this.draw();
      this.onViewChange();
    }, event => {
      this.onHover(this.pickClientPoint(event.clientX, event.clientY));
    }, event => {
      this.onSelect(this.pickClientPoint(event.clientX, event.clientY));
    });
  }

  loadMap(map) {
    const profile = createRendererLoadProfile();
    this.map = map;
    this.objectPickingIndex = profile.stage("object-picking-index", "构建对象索引", () => buildObjectPickingIndex(map));
    profile.stage("cell-visual-mesh", "构建视觉 cell mesh", () => this.rebuildCellVisualMesh());
    profile.stage("shore-cache", "构建水陆线缓存", () => this.rebuildShoreVisualCache());
    profile.stage("state-boundaries", "构建国家边界缓存", () => this.rebuildStateVisualCache());
    profile.stage("province-boundaries", "构建省份边界缓存", () => this.rebuildProvinceVisualCache());
    profile.stage("political-meshes", "构建政治视觉 mesh", () => this.rebuildPoliticalVisualMeshesIfNeeded());
    const vertices = profile.stage("surface-vertices", "构建 surface 顶点", () => buildPlaceholderVertices(map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh));
    const lineVertices = profile.stage("line-vertices", "构建线层顶点", () => buildLineVertices(map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions));
    const pointVertices = profile.stage("point-vertices", "构建点图层顶点", () => buildPointVertices(map, this.layerVisibility));
    this.vertexCount = vertices.length / 6;
    this.routeVertexCount = 0;
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
    profile.stage("gpu-upload", "上传静态 GPU buffer", () => {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.selectionBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
      this.updatePoliticalMeshDebugBuffer();
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
    this.objectPickingIndex = await stage("object-picking-index", "构建对象索引", () => buildObjectPickingIndex(map));
    await stage("cell-visual-mesh", "构建视觉 cell mesh", () => this.rebuildCellVisualMesh());
    await stage("shore-cache", "构建水陆线缓存", () => this.rebuildShoreVisualCache());
    await stage("state-boundaries", "构建国家边界缓存", () => this.rebuildStateVisualCache());
    await stage("province-boundaries", "构建省份边界缓存", () => this.rebuildProvinceVisualCache());
    await stage("political-meshes", "构建政治视觉 mesh", () => this.rebuildPoliticalVisualMeshesIfNeeded());
    const vertices = await stage("surface-vertices", "构建 surface 顶点", () => buildPlaceholderVertices(map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh));
    const lineVertices = await stage("line-vertices", "构建线层顶点", () => buildLineVertices(map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions));
    const pointVertices = await stage("point-vertices", "构建点图层顶点", () => buildPointVertices(map, this.layerVisibility));
    this.vertexCount = vertices.length / 6;
    this.routeVertexCount = 0;
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
    await stage("gpu-upload", "上传静态 GPU buffer", () => {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.selectionBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
      this.updatePoliticalMeshDebugBuffer();
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
    this.markViewportBuffersDirty();
    this.draw({updateDynamicBuffers: !quick, updateOverlay: !quick});
    this.onViewChange();
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

  setLabelOptions(options = {}) {
    const maxCityLabels = normalizeMaxCityLabels(options.maxCityLabels, this.labelOptions.maxCityLabels);
    if (maxCityLabels === this.labelOptions.maxCityLabels) return;
    this.labelOptions = {...this.labelOptions, maxCityLabels};
    if (!this.map) return;
    this.refreshLabels();
  }

  refreshCellSurface({draw = true} = {}) {
    if (!this.map) return;
    const vertices = buildPlaceholderVertices(this.map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh);
    this.vertexCount = vertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    if (draw) this.draw();
  }

  refreshLabels() {
    if (!this.map) return;
    this.buildLabels(this.map);
    this.updateLabels();
  }

  refreshLineLayers({draw = true} = {}) {
    if (!this.map) return;
    const lineVertices = buildLineVertices(this.map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions);
    this.lineVertexCount = lineVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
    if (draw) this.draw();
  }

  refreshPoliticalVisualCaches() {
    if (!this.map) return;
    this.rebuildStateVisualCache();
    this.rebuildProvinceVisualCache();
    this.rebuildPoliticalVisualMeshesIfNeeded();
  }

  refreshPointLayers({draw = true} = {}) {
    if (!this.map) return;
    const pointVertices = buildPointVertices(this.map, this.layerVisibility);
    this.pointVertexCount = pointVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, pointVertices, this.gl.STATIC_DRAW);
    if (draw) this.draw();
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
    if (!(layer in this.layerVisibility)) return;
    const nextVisible = Boolean(visible);
    const layers = layer === "coastline" ? ["coastline", "lakeShore"] : [layer];
    let changed = false;
    for (const item of layers) {
      if (!(item in this.layerVisibility) || this.layerVisibility[item] === nextVisible) continue;
      this.layerVisibility[item] = nextVisible;
      changed = true;
    }
    if (!changed) return;
    if (layer === "cities" || layer === "population" || layer === "markers" || layer === "resources" || layer === "military") this.refreshPointLayers({draw: false});
    if (layers.some(item => item === "coastline" || item === "lakeShore" || item === "stateBorders" || item === "provinceBorders" || item === "warFronts")) this.refreshLineLayers({draw: false});
    this.draw();
  }

  draw({updateDynamicBuffers = true, updateOverlay = true} = {}) {
    if (!this.map || !this.vertexCount) return;
    const startedAt = performance.now();
    if (updateDynamicBuffers && this.dynamicBuffersDirty.routes && this.layerVisibility.routes) this.updateRouteBuffer();
    if (updateDynamicBuffers && this.dynamicBuffersDirty.rivers && this.layerVisibility.rivers) this.updateRiverBuffer();
    if (updateDynamicBuffers && (this.dynamicBuffersDirty.selection || this.locateFlash)) this.updateSelectionBuffer();

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...this.map.layers.background);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1i(this.locations.pointMode, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
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
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeBuffer);
    gl.uniform1f(this.locations.scale, 1);
    gl.uniform2f(this.locations.offset, 0, 0);
    bindVertexBuffer(gl, this.locations);
    if (this.layerVisibility.routes) gl.drawArrays(gl.TRIANGLES, 0, this.routeVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.lineVertexCount);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.riverBuffer);
    gl.uniform1f(this.locations.scale, 1);
    gl.uniform2f(this.locations.offset, 0, 0);
    bindVertexBuffer(gl, this.locations);
    if (this.layerVisibility.rivers) gl.drawArrays(gl.TRIANGLES, 0, this.riverVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.selectionBuffer);
    gl.uniform1f(this.locations.scale, 1);
    gl.uniform2f(this.locations.offset, 0, 0);
    bindVertexBuffer(gl, this.locations);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.selectionVertexCount);
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

    this.lastDraw = {
      drawMs: roundMs(performance.now() - startedAt),
      glError: gl.getError()
    };
    if (updateOverlay) this.updateLabels();
  }

  getStats() {
    return {
      metadata: this.map?.metadata,
      grid: this.map?.grid?.metadata,
      pack: this.map?.pack?.metadata,
      features: this.map?.features?.metadata,
      vertexCount: this.vertexCount,
      routeVertexCount: this.routeVertexCount,
      routeTriangleCount: this.routeVertexCount / 3,
      routeBuildMs: this.routeBuildMs,
      routeRenderStats: {...this.routeRenderStats},
      routeWidthMode: this.routeWidthMode,
      routeStyleMode: "primary/secondary road + continuous trail dashed",
      riverVertexCount: this.riverVertexCount,
      riverTriangleCount: this.riverVertexCount / 3,
      riverBuildMs: this.riverBuildMs,
      riverWidthMode: this.riverWidthMode,
      riverWidthStats: this.riverWidthStats,
      selectionVertexCount: this.selectionVertexCount,
      selectionTriangleCount: this.selectionVertexCount / 3,
      selectionBuildMs: this.selectionBuildMs,
      selectionHighlightMode: selectionHighlightMode(this.selection, this.locateFlash),
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
      cellVisualMesh: summarizeCellVisualMesh(this.cellVisualMesh),
      cellSurfaceMode: this.viewOptions.smoothCellBorders !== false ? "visual-cells" : "hard-cells",
      boundaryLineMode: boundaryLineModeForOptions(this.viewOptions, this.cellVisualMesh),
      shoreVisual: summarizeShoreVisualPaths(this.shoreVisualPaths),
      stateVisual: summarizePoliticalVisualPaths(this.stateVisualPaths, STATE_VISUAL_STYLE),
      provinceVisual: summarizePoliticalVisualPaths(this.provinceVisualPaths, PROVINCE_VISUAL_STYLE),
      politicalVisualMeshes: summarizePoliticalVisualMeshes(this.politicalVisualMeshes),
      politicalMeshDebug: {
        mode: this.politicalMeshDebugMode,
        vertexCount: this.politicalMeshDebugVertexCount,
        triangleCount: this.politicalMeshDebugVertexCount / 3
      },
      pointVertexCount: this.pointVertexCount,
      cityIconCount: this.cityIconCount,
      visibleCityIconCount: this.visibleCityIconCount,
      cityIconScaleThreshold: this.cityIconScaleThreshold,
      markerCount: this.map?.markers?.metadata?.markers || 0,
      markerIconCount: this.markerIconCount,
      visibleMarkerIconCount: this.visibleMarkerIconCount,
      markerIconScaleThreshold: this.markerIconScaleThreshold,
      labelCount: this.labelCount,
      visibleLabelCount: this.visibleLabelCount,
      cityLabelCount: this.cityLabelCount,
      visibleCityLabelCount: this.visibleCityLabelCount,
      stateLabelCount: this.stateLabelCount,
      visibleStateLabelCount: this.visibleStateLabelCount,
      colorMode: this.colorMode,
      viewOptions: {...this.viewOptions},
      labelOptions: {...this.labelOptions},
      layerVisibility: {...this.layerVisibility},
      canvasSize: {...this.canvasSize},
      camera: {...this.camera},
      loadMap: this.lastLoad,
      draw: this.lastDraw,
      dynamicMeshCache: {
        routesDirty: this.dynamicBuffersDirty.routes,
        riversDirty: this.dynamicBuffersDirty.rivers,
        selectionDirty: this.dynamicBuffersDirty.selection
      },
      webgl2: true
    };
  }

  pickClientPoint(clientX, clientY) {
    const label = this.pickLabel(clientX, clientY);
    const markerIcon = this.pickMarkerIcon(clientX, clientY);
    const militaryIcon = this.pickMilitaryIcon(clientX, clientY);
    const world = this.screenToWorld(clientX, clientY);
    const result = pickGridCell(this.map, world.x, world.y);
    const cityObject = this.layerVisibility.cities || this.layerVisibility.population
      ? pickCity(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(9))
      : null;
    const marker = markerIcon || pickMarker(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(8), item => isMarkerLayerVisible(item, this.layerVisibility));
    const military = militaryIcon || (this.layerVisibility.military !== false ? pickMilitary(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(13)) : null);
    const route = this.layerVisibility.routes ? pickRoute(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(7)) : null;
    const river = this.layerVisibility.rivers ? pickRiver(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(9)) : null;
    const politicalObject = pickPoliticalObject(this.map, result, this.colorMode);
    const object = militaryIcon || markerIcon || label || cityObject || marker || military || river || route || politicalObject;
    this.lastObjectCandidateCount = (label ? 1 : 0) + (cityObject?.candidateCount || 0) + (marker?.candidateCount || 0) + (military?.candidateCount || 0) + (route?.candidateCount || 0) + (river?.candidateCount || 0) + (politicalObject ? 1 : 0);
    return result ? {...result, label, cityObject, marker, military, route, river, politicalObject, object, objectCandidates: this.lastObjectCandidateCount, worldX: roundValue(result.worldX), worldY: roundValue(result.worldY)} : null;
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
    const {vertices: routeVertices, stats} = buildRouteMeshVertices(this.map, this.camera, this.canvas, this.selection);
    this.routeVertexCount = routeVertices.length / 6;
    this.routeRenderStats = stats;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, routeVertices, this.gl.DYNAMIC_DRAW);
    this.routeBuildMs = roundMs(performance.now() - startedAt);
    this.dynamicBuffersDirty.routes = false;
  }

  async updateRouteBufferAsync({yieldToBrowser = () => Promise.resolve(), sliceMs = ROUTE_BUILD_SLICE_MS} = {}) {
    const startedAt = performance.now();
    const {vertices: routeVertices, stats} = await buildRouteMeshVerticesAsync(this.map, this.camera, this.canvas, this.selection, {
      yieldToBrowser,
      sliceMs
    });
    this.routeVertexCount = routeVertices.length / 6;
    this.routeRenderStats = stats;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, routeVertices, this.gl.DYNAMIC_DRAW);
    this.routeBuildMs = roundMs(performance.now() - startedAt);
    this.dynamicBuffersDirty.routes = false;
  }

  clearRouteBuffer() {
    this.routeVertexCount = 0;
    this.routeRenderStats = emptyRouteRenderStats();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(), this.gl.DYNAMIC_DRAW);
    this.routeBuildMs = 0;
    this.dynamicBuffersDirty.routes = false;
  }

  updateRiverBuffer() {
    const startedAt = performance.now();
    const {vertices, stats} = buildRiverMeshVertices(this.map, this.camera, this.canvas);
    this.riverVertexCount = vertices.length / 6;
    this.riverWidthStats = stats;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.riverBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.riverBuildMs = roundMs(performance.now() - startedAt);
    this.dynamicBuffersDirty.rivers = false;
  }

  updateSelectionBuffer() {
    const startedAt = performance.now();
    const selectionVertices = buildSelectionMeshVertices(this.map, this.camera, this.canvas, this.selection, this.locateFlash);
    this.selectionVertexCount = selectionVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.selectionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, selectionVertices, this.gl.DYNAMIC_DRAW);
    this.selectionBuildMs = roundMs(performance.now() - startedAt);
    this.dynamicBuffersDirty.selection = false;
  }

  pickThresholdWorld(pixels) {
    const rect = this.canvas.getBoundingClientRect();
    const worldPerPixelX = this.map.metadata.graphWidth / Math.max(1, rect.width * this.camera.scale);
    const worldPerPixelY = this.map.metadata.graphHeight / Math.max(1, rect.height * this.camera.scale);
    return Math.max(worldPerPixelX, worldPerPixelY) * pixels;
  }

  setSelection(object) {
    const previous = this.selection;
    this.selection = object || null;
    this.dynamicBuffersDirty.selection = true;
    if (previous?.kind === OBJECT_KIND.ROUTE || this.selection?.kind === OBJECT_KIND.ROUTE) {
      this.dynamicBuffersDirty.routes = true;
    }
    this.draw();
  }

  invalidateDynamicBuffers(parts = {}) {
    if (parts.viewport) this.markViewportBuffersDirty();
    if (parts.routes) this.dynamicBuffersDirty.routes = true;
    if (parts.rivers) this.dynamicBuffersDirty.rivers = true;
    if (parts.selection) this.dynamicBuffersDirty.selection = true;
  }

  markViewportBuffersDirty() {
    this.dynamicBuffersDirty.routes = true;
    this.dynamicBuffersDirty.rivers = true;
    this.dynamicBuffersDirty.selection = true;
  }

  markAllDynamicBuffersDirty() {
    this.dynamicBuffersDirty.routes = true;
    this.dynamicBuffersDirty.rivers = true;
    this.dynamicBuffersDirty.selection = true;
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
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const [ndcX, ndcY] = worldToNdcPoint(createRenderContext(this.map), [centerX, centerY]);

    this.camera.scale = nextScale;
    this.camera.offsetX = -ndcX * nextScale;
    this.camera.offsetY = -ndcY * nextScale;
    this.markViewportBuffersDirty();
    this.locateStatus = `${object.kind} #${object.id}`;
    this.startLocateFlash(object);
    this.setSelection(object);
    this.onViewChange();
    return true;
  }

  startLocateFlash(object) {
    this.locateFlash = {
      kind: object.kind,
      id: object.id,
      until: performance.now() + 2600
    };
    if (!this.locateFlashFrame) this.animateLocateFlash();
  }

  animateLocateFlash() {
    if (!this.locateFlash || performance.now() > this.locateFlash.until) {
      this.locateFlash = null;
      this.locateFlashFrame = 0;
      this.draw();
      this.onViewChange();
      return;
    }
    this.draw();
    this.locateFlashFrame = requestAnimationFrame(() => this.animateLocateFlash());
  }

  buildLabels(map) {
    if (!this.overlay) {
      this.labelItems = [];
      this.cityIconItems = [];
      this.markerIconItems = [];
      this.militaryIconItems = [];
      this.labelCount = 0;
      this.visibleLabelCount = 0;
      this.cityLabelCount = 0;
      this.visibleCityLabelCount = 0;
      this.stateLabelCount = 0;
      this.visibleStateLabelCount = 0;
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
    this.labelItems = [...getLabelStates(map), ...getLabelCities(map, this.labelOptions), ...getCustomLabels(map)].map(item => {
      const node = documentRef.createElement("span");
      node.className = labelClassName(item);
      node.textContent = item.text;
      fragment.append(node);
      return {...item, node, box: null, visible: false};
    });
    this.cityIconItems = getCityIconItems(map).map(item => {
      const node = documentRef.createElement("span");
      node.className = cityIconClassName(item);
      node.title = item.tooltip;
      node.setAttribute("aria-label", item.tooltip);
      node.dataset.cityId = String(item.id);
      node.dataset.cityKind = item.kind;
      applyCityIconPalette(node, item);
      node.innerHTML = cityIconSvg(item);
      fragment.append(node);
      return {...item, node, box: null, visible: false};
    });
    this.markerIconItems = getMarkerIconItems(map).map(item => {
      const node = documentRef.createElement("span");
      node.className = markerIconClassName(item);
      node.title = item.tooltip;
      node.setAttribute("aria-label", item.tooltip);
      node.dataset.markerId = String(item.id);
      node.dataset.markerCategory = item.category || "marker";
      applyMarkerIconPalette(node, item);
      node.innerHTML = markerIconSvg(item);
      fragment.append(node);
      return {...item, node, box: null, visible: false};
    });
    this.militaryIconItems = getMilitaryIconItems(map).map(item => {
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
      icon.src = item.iconUrl;
      icon.alt = item.iconLabel || item.dominantUnitLabel || "军种";
      icon.decoding = "async";
      icon.draggable = false;
      symbol.append(icon);
      const count = documentRef.createElement("span");
      count.className = "military-map-icon-count";
      count.textContent = formatMilitaryTroops(item.troops);
      node.append(symbol, count);
      fragment.append(node);
      return {...item, node, box: null, visible: false};
    });
    this.selectionMarker = documentRef.createElement("span");
    this.selectionMarker.className = "selection-marker";
    this.selectionMarker.style.display = "none";
    fragment.append(this.selectionMarker);
    this.overlay.append(fragment);
    this.labelCount = this.labelItems.length;
    this.cityLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.CITY).length;
    this.stateLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.STATE).length;
    this.cityIconCount = this.cityIconItems.length;
    this.markerIconCount = this.markerIconItems.length;
    this.militaryIconCount = this.militaryIconItems.length;
    this.visibleLabelCount = 0;
    this.visibleCityLabelCount = 0;
    this.visibleStateLabelCount = 0;
    this.visibleCityIconCount = 0;
    this.visibleMarkerIconCount = 0;
    this.visibleMilitaryIconCount = 0;
  }

  updateLabels() {
    if (!this.overlay || !this.map) return;
    const rect = this.canvas.getBoundingClientRect();
    const occupied = [];
    const occupiedStates = [];
    let visible = 0;
    let visibleCities = 0;
    let visibleStates = 0;
    const scale = this.camera.scale;
    const maxVisible = labelLimitForScale(scale, this.labelOptions.maxCityLabels);
    const padding = labelPaddingForScale(scale);
    const stateLabelScale = stateLabelScaleBehavior(scale);
    const labelItems = stateLabelScale.blocksCities
      ? this.labelItems
      : [
        ...this.labelItems.filter(item => item.targetKind !== LABEL_TARGET_KIND.STATE),
        ...this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.STATE)
      ];

    for (const item of labelItems) {
      item.node.classList.toggle("selected", isSelectedLabelItem(this.selection, item));
      const stateLabel = item.targetKind === LABEL_TARGET_KIND.STATE;
      const layerVisible = this.isLabelItemLayerVisible(item);
      const withinLimit = item.targetKind === LABEL_TARGET_KIND.CITY ? visibleCities < maxVisible : true;
      if (!layerVisible || !withinLimit || scale < item.minScale || (stateLabel && !stateLabelScale.visible)) {
        item.node.classList.toggle("visible", false);
        item.visible = false;
        item.box = null;
        continue;
      }
      const screen = this.worldToScreen(item.x, item.y, rect);
      const box = labelBoxForItem(item, screen);
      const onScreen = box.right > 8 && box.bottom > 8 && box.left < rect.width - 8 && box.top < rect.height - 8;
      const canShow = onScreen;
      const blocked = canShow && (stateLabel
        ? boxesOverlapAny(occupiedStates, box, padding)
        : (stateLabelScale.blocksCities && boxesOverlapAny(occupiedStates, box, padding)) || boxesOverlapAny(occupied, box, padding));
      const shouldShow = canShow && !blocked;
      item.node.classList.toggle("visible", shouldShow);
      item.visible = shouldShow;
      item.box = shouldShow ? box : null;
      if (!shouldShow) continue;
      item.node.style.left = `${screen.x}px`;
      item.node.style.top = `${stateLabel ? screen.y : screen.y - 6}px`;
      item.node.style.setProperty("--label-rotation", `${item.rotation || 0}deg`);
      if (stateLabel) item.node.style.setProperty("--state-label-opacity", String(stateLabelScale.opacity));
      if (stateLabel) occupiedStates.push(box);
      else occupied.push(box);
      visible++;
      if (item.targetKind === LABEL_TARGET_KIND.CITY) visibleCities++;
      if (item.targetKind === LABEL_TARGET_KIND.STATE) visibleStates++;
    }

    this.visibleLabelCount = visible;
    this.visibleCityLabelCount = visibleCities;
    this.visibleStateLabelCount = visibleStates;
    const cityIconBoxes = this.updateCityIcons(rect, occupiedStates);
    this.updateMarkerIcons(rect, [...occupied, ...occupiedStates, ...cityIconBoxes], cityIconBoxes);
    this.updateMilitaryIcons(rect, [...occupied, ...occupiedStates, ...cityIconBoxes]);
    this.updateSelectionMarker(rect);
  }

  isLabelItemLayerVisible(item) {
    if (item.targetKind === LABEL_TARGET_KIND.STATE) return this.layerVisibility.stateLabels !== false;
    if (item.targetKind === LABEL_TARGET_KIND.CUSTOM) return this.layerVisibility.labels !== false;
    return this.layerVisibility.labels !== false;
  }

  updateSelectionMarker(rect) {
    if (!this.selectionMarker || !isPointObjectKind(this.selection?.kind)) {
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
    this.selectionMarker.style.left = `${screen.x}px`;
    this.selectionMarker.style.top = `${screen.y}px`;
  }

  updateCityIcons(rect, occupiedLabels = []) {
    if (!this.cityIconItems.length) {
      this.visibleCityIconCount = 0;
      return [];
    }

    const scale = this.camera.scale;
    const iconPadding = scale >= CITY_ICON_RELAXED_SCALE ? 2 : 5;
    const occupiedIcons = [];
    let visible = 0;

    for (const item of this.cityIconItems) {
      if (this.layerVisibility.cities === false || scale < item.minScale) {
        item.node.classList.toggle("visible", false);
        item.node.classList.toggle("selected", this.selection?.kind === OBJECT_KIND.CITY && this.selection.id === item.id);
        item.visible = false;
        item.box = null;
        continue;
      }
      const screen = this.worldToScreen(item.x, item.y, rect);
      const sizeScale = cityIconScale(scale, item);
      const box = cityIconBoxForItem(item, screen, sizeScale);
      const onScreen = box.right > 4 && box.bottom > 4 && box.left < rect.width - 4 && box.top < rect.height - 4;
      const canShow = onScreen;
      const blocked = canShow && scale < CITY_ICON_RELAXED_SCALE && (
        boxesOverlapAny(occupiedLabels, box, iconPadding) ||
        boxesOverlapAny(occupiedIcons, box, iconPadding)
      );
      const shouldShow = canShow && !blocked;
      item.node.classList.toggle("visible", shouldShow);
      item.node.classList.toggle("selected", this.selection?.kind === OBJECT_KIND.CITY && this.selection.id === item.id);
      item.visible = shouldShow;
      item.box = shouldShow ? box : null;
      if (!shouldShow) continue;
      item.node.style.left = `${screen.x}px`;
      item.node.style.top = `${screen.y}px`;
      item.node.style.setProperty("--city-icon-scale", String(sizeScale));
      occupiedIcons.push(box);
      visible++;
    }

    this.visibleCityIconCount = visible;
    return occupiedIcons;
  }

  updateMarkerIcons(rect, occupiedLabels = [], cityIconBoxes = []) {
    if (!this.markerIconItems.length) {
      this.visibleMarkerIconCount = 0;
      return;
    }

    const scale = this.camera.scale;
    const iconsEnabled = scale >= this.markerIconScaleThreshold;
    const iconPadding = scale >= MARKER_ICON_RELAXED_SCALE ? 2 : 6;
    const occupiedIcons = [];
    let visible = 0;

    for (const item of this.markerIconItems) {
      const layerVisible = isMarkerLayerVisible(item, this.layerVisibility);
      if (!iconsEnabled || !layerVisible) {
        item.node.classList.toggle("visible", false);
        item.node.classList.toggle("city-overlap", false);
        item.node.classList.toggle("selected", this.selection?.kind === OBJECT_KIND.MARKER && this.selection.id === item.id);
        item.visible = false;
        item.box = null;
        continue;
      }
      const screen = this.worldToScreen(item.x, item.y, rect);
      const box = markerIconBoxForItem(item, screen, scale);
      const onScreen = box.right > 4 && box.bottom > 4 && box.left < rect.width - 4 && box.top < rect.height - 4;
      const canShow = onScreen;
      const blocked = canShow && scale < MARKER_ICON_RELAXED_SCALE && (
        boxesOverlapAny(occupiedLabels, box, iconPadding) ||
        boxesOverlapAny(occupiedIcons, box, iconPadding)
      );
      const shouldShow = canShow && !blocked;
      const cityOverlap = shouldShow && item.category === "resource" && boxesOverlapAny(cityIconBoxes, box, 0);
      item.node.classList.toggle("visible", shouldShow);
      item.node.classList.toggle("city-overlap", cityOverlap);
      item.node.classList.toggle("selected", this.selection?.kind === OBJECT_KIND.MARKER && this.selection.id === item.id);
      item.visible = shouldShow;
      item.box = shouldShow ? box : null;
      if (!shouldShow) continue;
      item.node.style.left = `${screen.x}px`;
      item.node.style.top = `${screen.y}px`;
      item.node.style.setProperty("--marker-icon-scale", String(markerIconScale(scale)));
      occupiedIcons.push(box);
      visible++;
    }

    this.visibleMarkerIconCount = visible;
  }

  updateMilitaryIcons(rect, occupiedLabels = []) {
    if (!this.militaryIconItems.length) {
      this.visibleMilitaryIconCount = 0;
      return;
    }

    const scale = this.camera.scale;
    const iconPadding = scale >= MILITARY_ICON_RELAXED_SCALE ? 2 : 6;
    const occupiedIcons = [];
    let visible = 0;

    for (const item of this.militaryIconItems) {
      const selected = this.selection?.kind === OBJECT_KIND.MILITARY && this.selection.id === item.id;
      if (this.layerVisibility.military === false || scale < item.minScale) {
        item.node.classList.toggle("visible", false);
        item.node.classList.toggle("selected", selected);
        item.node.classList.toggle("military-map-icon--fleet", item.type === "fleet");
        item.visible = false;
        item.box = null;
        continue;
      }
      const screen = this.worldToScreen(item.x, item.y, rect);
      const sizeScale = militaryIconScale(scale, item);
      const box = militaryIconBoxForItem(item, screen, sizeScale);
      const onScreen = box.right > 4 && box.bottom > 4 && box.left < rect.width - 4 && box.top < rect.height - 4;
      const canShow = onScreen;
      const blocked = canShow && !selected && scale < MILITARY_ICON_RELAXED_SCALE && (
        boxesOverlapAny(occupiedLabels, box, iconPadding) ||
        boxesOverlapAny(occupiedIcons, box, iconPadding)
      );
      const shouldShow = canShow && !blocked;
      item.node.classList.toggle("visible", shouldShow);
      item.node.classList.toggle("selected", selected);
      item.node.classList.toggle("military-map-icon--fleet", item.type === "fleet");
      item.visible = shouldShow;
      item.box = shouldShow ? box : null;
      if (!shouldShow) continue;
      item.node.style.left = `${screen.x}px`;
      item.node.style.top = `${screen.y}px`;
      item.node.style.setProperty("--military-icon-scale", String(sizeScale));
      occupiedIcons.push(box);
      visible++;
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

function defaultLocateMinScale(object) {
  return isPointObjectKind(object?.kind) ? 1.25 : 0.35;
}

function selectionPoint(map, selection) {
  if (selection?.kind === OBJECT_KIND.LABEL && selection.targetKind === LABEL_TARGET_KIND.STATE) {
    const state = map.politics.states[selection.targetId ?? selection.id];
    const placement = stateLabelPlacement(map, state, state?.fullName || state?.name || "");
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
    const marker = map.markers.markers[selection.id];
    return marker ? {x: marker.x, y: marker.y} : null;
  }
  if (selection?.kind === OBJECT_KIND.MILITARY) {
    const regiment = findRegiment(map, selection);
    return regiment ? {x: regiment.x, y: regiment.y} : null;
  }
  return null;
}

function getObjectBounds(map, object) {
  if (!map || !object) return null;
  if (object.kind === OBJECT_KIND.LABEL && object.targetKind === LABEL_TARGET_KIND.STATE) {
    return politicalBounds(map, {kind: OBJECT_KIND.STATE, id: object.targetId ?? object.id}, 48);
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
    const marker = map.markers.markers[object.id];
    return marker ? pointBounds(marker.x, marker.y, 42) : null;
  }
  if (object.kind === OBJECT_KIND.MILITARY) {
    const regiment = findRegiment(map, object);
    return regiment ? pointBounds(regiment.x, regiment.y, 58) : null;
  }
  if (object.kind === OBJECT_KIND.ROUTE) {
    const route = map.settlements.routes.find(item => item.id === object.id);
    return route ? pointsBounds(route.points, 36) : null;
  }
  if (object.kind === OBJECT_KIND.RIVER) {
    const river = map.rivers.rivers.find(item => item.id === object.id);
    return river ? pointsBounds(river.points, 42) : null;
  }
  if (isPoliticalObjectKind(object.kind)) {
    return politicalBounds(map, object, 48);
  }
  return null;
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

function pointBounds(x, y, padding) {
  return expandBounds({minX: x, minY: y, maxX: x, maxY: y}, padding);
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
  const maxCityLabels = normalizeMaxCityLabels(labelOptions.maxCityLabels, 5000);
  return [...map.settlements.cities]
    .filter(city => city && Number.isInteger(city.id))
    .filter(city => !isGeneratedLabelHidden(map, LABEL_TARGET_KIND.CITY, city.id))
    .map(city => ({city, priority: scoreCityLabel(city)}))
    .sort((a, b) => b.priority - a.priority)
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
        priority: Number(state.area || 0) + Number(state.burgs || 0) * 100,
        state,
        rank,
        minScale: 0.5
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
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
  return [...(map?.settlements?.cities || [])]
    .filter(city => city && Number.isInteger(city.id) && Number.isFinite(city.x) && Number.isFinite(city.y))
    .map(city => ({city, priority: scoreCityIcon(city)}))
    .sort((a, b) => b.priority - a.priority)
    .map(({city, priority}, rank) => {
      const kind = cityIconKind(city);
      const culture = map?.society?.cultures?.[city.culture] || map?.pack?.cultures?.[city.culture] || null;
      const burg = map?.pack?.burgs?.[city.burgId] || null;
      const visual = resolveCityVisual(city, culture, burg?.visual);
      return {
        id: city.id,
        city,
        name: city.name || `城镇 #${city.id + 1}`,
        kind,
        silhouette: visual.silhouette,
        tooltip: cityIconTooltip(city, kind),
        priority,
        rank,
        population: Number(city.population || 0),
        cultureId: Number.isInteger(city.culture) ? city.culture : null,
        visual,
        x: city.x,
        y: city.y,
        minScale: cityIconMinScale(city, kind, rank)
      };
    });
}

function scoreCityIcon(city) {
  return (city.capital ? 800 : 0) + (city.provincial ? 320 : 0) + (city.port ? 120 : 0) + Number(city.population || 0) * 2;
}

function cityIconKind(city) {
  const population = Number(city.population || 0);
  if (city.capital) return "capital";
  if (city.provincial) return "provincial";
  if (city.port) return "port";
  if (population >= 64) return "city";
  if (population < 8) return "hamlet";
  return "town";
}

function cityIconMinScale(city, kind, rank) {
  if (kind === "capital") return 0.95;
  if (kind === "provincial") return 1.2;
  if (kind === "city" || kind === "port") return rank < 18 ? 1.45 : 1.65;
  if (kind === "town") return rank < 36 ? 1.9 : 2.25;
  return rank < 72 ? 2.35 : 2.85;
}

function cityIconTooltip(city, kind) {
  const kindLabel = {
    capital: "都城",
    provincial: "省会",
    port: "港镇",
    city: "城市",
    town: "城镇",
    hamlet: "村落"
  }[kind] || "城镇";
  const population = Number(city.population || 0);
  const populationText = population > 0 ? `，人口 ${formatPopulationPeople(population)}` : "";
  return `${city.name || "城镇"} / ${kindLabel}${populationText}`;
}

function cityIconClassName(item) {
  return `city-map-icon city-map-icon--${item.silhouette} city-map-icon--style-${item.visual.cultureStyle}`;
}

function applyCityIconPalette(node, item) {
  const palette = cityIconPalette(item);
  node.style.setProperty("--city-wall", palette.wall);
  node.style.setProperty("--city-roof", palette.roof);
  node.style.setProperty("--city-stroke", palette.stroke);
  node.style.setProperty("--city-accent", palette.accent);
  node.style.setProperty("--city-water", palette.water);
}

function cityIconPalette(item) {
  const visual = item.visual || {};
  return CITY_ICON_PALETTES[visual.palette] || CITY_ICON_PALETTES[item.silhouette] || CITY_ICON_PALETTES[item.kind] || CITY_ICON_PALETTES.town;
}

function cityIconSvg(item) {
  if (item.silhouette === "capital") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.2" rx="13.6" ry="2.3"/>
    <ellipse class="city-icon-ground" cx="17" cy="21.1" rx="13.1" ry="2.1"/>
    <path class="city-icon-fill" d="M5 20.1v-7.8l2.4-1.3 2.4 1.3 2.4-1.3 2.4 1.3 2.4-1.3 2.4 1.3 2.4-1.3 2.4 1.3 2.4-1.3 2.4 1.3v7.8z"/>
    <path class="city-icon-roof" d="m9.2 11.8 4.2-4 4.2 4zm8.8.1 4.2-4.9 4.2 4.9z"/>
    <path class="city-icon-accent" d="M6.9 20.1v-8.8h3.7v8.8zm16.5 0v-8.8h3.7v8.8z"/>
    <path class="city-icon-window" d="M12.3 15.2h2.2v4.9h-2.2zm7.3-.1h2.2v5h-2.2z"/>
    <path class="city-icon-stroke" d="M4.2 20.1h25.6"/>
  </svg>`;
  if (item.silhouette === "provincial") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.3" rx="12.4" ry="2.1"/>
    <ellipse class="city-icon-ground" cx="17" cy="21.1" rx="12" ry="1.9"/>
    <path class="city-icon-fill" d="M9.2 20.2v-8.8l1.8-.9 1.8.9 1.8-.9 1.8.9 1.8-.9 1.8.9 1.8-.9 1.8.9v8.8z"/>
    <path class="city-icon-roof" d="m7.4 14.1 5.3-4.5 5.3 4.5zm10.2-.4 4.4-3.7 4.4 3.7z"/>
    <path class="city-icon-accent" d="M14 20.2v-11h6v11z"/>
    <path class="city-icon-window" d="M16 12.2h2v2.2h-2zm.1 4.1h1.8v3.9h-1.8z"/>
    <path class="city-icon-stroke" d="M6.7 20.2h20.6"/>
  </svg>`;
  if (item.silhouette === "port") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="16.5" cy="22.1" rx="12.5" ry="2.1"/>
    <path class="city-icon-water" d="M4.8 21.1c2.5-1.1 4.9-1.1 7.4 0s4.9 1.1 7.4 0 5-1.1 7.5 0"/>
    <path class="city-icon-fill" d="M7.6 20v-6h8.6v6z"/>
    <path class="city-icon-roof" d="m6.3 14.2 5.6-4 5.6 4z"/>
    <path class="city-icon-accent" d="M21.5 7.3v12.8"/>
    <path class="city-icon-sail" d="M22.3 8.2c3 2 4.6 4.7 4.9 8.1h-4.9z"/>
    <path class="city-icon-window" d="M10.7 16h2.4v4h-2.4z"/>
  </svg>`;
  if (item.silhouette === "fort") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.2" rx="12.6" ry="2.1"/>
    <ellipse class="city-icon-ground" cx="17" cy="21" rx="12" ry="1.8"/>
    <path class="city-icon-fill" d="M6.4 20.2v-7.5l1.6-.8 1.6.8 1.6-.8 1.6.8 1.6-.8 1.6.8 1.6-.8 1.6.8 1.6-.8 1.6.8 1.6-.8 1.6.8v7.5z"/>
    <path class="city-icon-accent" d="M12.1 20.2v-10h4.2v10zm5.7 0v-11.8h4.6v11.8z"/>
    <path class="city-icon-roof" d="m11.1 10.4 3.1-3.2 3.1 3.2zm5.7-1.9 3.3-3.5 3.3 3.5z"/>
    <path class="city-icon-window" d="M13.5 14.2H15v6h-1.5zm5.8-2h1.6v2.1h-1.6zm.1 4.1h1.4v3.9h-1.4z"/>
    <path class="city-icon-stroke" d="M5.6 20.2h22.8"/>
  </svg>`;
  if (item.silhouette === "camp") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.2" rx="11.8" ry="2"/>
    <ellipse class="city-icon-ground" cx="17" cy="21.1" rx="11.2" ry="1.7"/>
    <path class="city-icon-tent" d="M7.8 20.2 13 9.2l5.2 11z"/>
    <path class="city-icon-tent city-icon-tent--main" d="M13.2 20.2 20 7.3l6.8 12.9z"/>
    <path class="city-icon-roof" d="M20 7.3v12.9"/>
    <path class="city-icon-window" d="M18.3 16.4 20 13.2l1.7 3.2v3.8h-3.4z"/>
    <path class="city-icon-stroke" d="M6.9 20.2h21.2"/>
  </svg>`;
  if (item.silhouette === "hamlet") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.2" rx="9.4" ry="1.8"/>
    <ellipse class="city-icon-ground" cx="17" cy="21.1" rx="9" ry="1.6"/>
    <path class="city-icon-fill" d="M10.4 20.3v-7.2h13.2v7.2z"/>
    <path class="city-icon-roof" d="M8.7 13.6 17 7.7l8.3 5.9z"/>
    <path class="city-icon-window" d="M15.3 16.1h3.4v4.2h-3.4z"/>
    <path class="city-icon-stroke" d="M9.2 20.3h15.6"/>
  </svg>`;
  if (item.silhouette === "city") return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.2" rx="12.9" ry="2.2"/>
    <ellipse class="city-icon-ground" cx="17" cy="21.1" rx="12.2" ry="1.9"/>
    <path class="city-icon-fill" d="M5.8 20.2v-6.9h8.2v6.9zm9.2 0v-8.2h8.4v8.2zm9.2 0v-6.1h4.2v6.1z"/>
    <path class="city-icon-roof" d="m4.7 13.5 5.2-4.1 5.2 4.1zm8.7-1.1 5.8-4.6 5.8 4.6zm9.4 1.9 3.5-2.8 3.5 2.8z"/>
    <path class="city-icon-window" d="M8.7 16h2.1v4.2H8.7zm18 1h1.2v3.2h-1.2zm-9.4-1.6h3v4.8h-3z"/>
  </svg>`;
  return `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false">
    <ellipse class="city-icon-shadow" cx="17" cy="22.2" rx="11.4" ry="2"/>
    <ellipse class="city-icon-ground" cx="17" cy="21.1" rx="10.8" ry="1.7"/>
    <path class="city-icon-fill" d="M7.9 20.2v-6.8h8.7v6.8zm9.8 0v-7.6h8.4v7.6z"/>
    <path class="city-icon-roof" d="m6.7 13.8 5.5-4.2 5.5 4.2zm9.6-.8 5.5-4.3 5.5 4.3z"/>
    <path class="city-icon-window" d="M11.1 16.2h2.2v4h-2.2zm9.7-.3h2.3v4.3h-2.3z"/>
    <path class="city-icon-stroke" d="M7.1 20.2h20"/>
  </svg>`;
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
  const kindBonus = item.kind === "capital" ? 0.16 : item.kind === "provincial" ? 0.1 : item.kind === "city" || item.kind === "port" ? 0.06 : 0;
  return clamp(0.72 + kindBonus + (scale - item.minScale) * 0.055, 0.72, 1.18);
}

function getMarkerIconItems(map) {
  return [...(map?.markers?.markers || [])]
    .filter(marker => marker && Number.isFinite(marker.x) && Number.isFinite(marker.y))
    .sort((a, b) => markerIconPriority(b) - markerIconPriority(a))
    .map(marker => ({
      id: marker.id,
      marker,
      type: marker.type,
      label: marker.label,
      name: marker.name || marker.label || `标记 #${marker.id + 1}`,
      tooltip: markerIconTooltip(marker),
      category: marker.category || "marker",
      resourceKey: marker.resourceKey || null,
      economicValue: Number(marker.economicValue || 0),
      visual: marker.visual || marker.data?.visual || {},
      x: marker.x,
      y: marker.y
    }));
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

function getMilitaryIconItems(map) {
  return militaryRegiments(map)
    .sort((a, b) => Number(b.a || 0) - Number(a.a || 0))
    .map(regiment => {
      const iconVariant = militaryIconForRegiment(regiment);
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
        iconUrl: militaryIconUrlForVariant(iconVariant),
        iconLabel: regiment.iconLabel || militaryIconLabelForVariant(iconVariant),
        troops: Number(regiment.a || 0),
        status: regiment.status,
        statusLabel: regiment.statusLabel,
        dominantUnit: regiment.dominantUnit,
        dominantUnitLabel: regiment.dominantUnitLabel,
        tooltip: militaryIconTooltip(regiment, map),
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

function militaryIconTooltip(regiment, map) {
  const state = map?.politics?.states?.[regiment.state] || map?.pack?.states?.[regiment.state];
  return `${state?.name || "国家"} / ${regiment.name || "军团"} / ${regiment.statusLabel || "待命"} / ${formatMilitaryTroops(regiment.a)}`;
}

function militaryIconClassName(item) {
  const classes = ["military-map-icon"];
  if (item.type === "fleet") classes.push("military-map-icon--fleet");
  const iconVariant = normalizeMilitaryIconVariant(item.iconVariant || item.icon, militaryIconVariantForUnit(item.dominantUnit));
  if (iconVariant) classes.push(`military-map-icon--${iconVariant}`);
  return classes.join(" ");
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

function militaryIconBoxForItem(item, screen, sizeScale) {
  const width = (MILITARY_ICON_BASE_WIDTH + Math.min(18, String(formatMilitaryTroops(item.troops)).length * 3)) * sizeScale;
  const height = MILITARY_ICON_BASE_HEIGHT * sizeScale;
  return {
    left: screen.x - width / 2,
    right: screen.x + width / 2,
    top: screen.y - height * 0.55,
    bottom: screen.y + height * 0.45,
    item
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

function formatMilitaryTroops(value) {
  const troops = Math.max(0, Number(value || 0));
  if (troops >= 10000) return `${roundValue(troops / 10000)}万`;
  if (troops >= 1000) return `${roundValue(troops / 1000)}千`;
  return String(Math.round(troops));
}

function colorForRegiment(regiment) {
  if (regiment.type === "fleet" || regiment.dominantUnit === "fleet") return [0.32, 0.68, 0.92, 0.92];
  if (regiment.dominantUnit === "cavalry") return [0.86, 0.66, 0.34, 0.94];
  if (regiment.dominantUnit === "archers") return [0.48, 0.74, 0.46, 0.94];
  if (regiment.dominantUnit === "artillery") return [0.82, 0.46, 0.34, 0.94];
  return [0.86, 0.82, 0.62, 0.94];
}

function pushMilitaryFrontLines(vertices, context, map, visibility) {
  const width = Math.max(1.2, Math.max(map.metadata.graphWidth, map.metadata.graphHeight) / 1900);
  for (const front of map?.military?.fronts || []) {
    const points = front.points || [[front.from?.x, front.from?.y], [front.to?.x, front.to?.y]];
    const color = front.stance === "defense" ? [0.34, 0.64, 0.92, 0.72] : [0.92, 0.38, 0.25, 0.78];
    pushWorldPolylineMesh(vertices, context, points, color, width, {joinSegments: 8, joinMode: "caps"});
  }
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
  const visual = item.visual || {};
  const symbol = MARKER_ICON_SYMBOLS[visual.symbol] || MARKER_ICON_SYMBOLS.marker;
  return `<svg viewBox="0 0 28 32" aria-hidden="true" focusable="false">
    <path class="marker-icon-shadow" d="M14 30.8c2.3-1.9 11.6-10.3 11.6-18.1C25.6 6 20.8 1.7 14 1.7S2.4 6 2.4 12.7c0 7.8 9.3 16.2 11.6 18.1z"/>
    <path class="marker-icon-body" d="M14 30.8c2.3-1.9 11.6-10.3 11.6-18.1C25.6 6 20.8 1.7 14 1.7S2.4 6 2.4 12.7c0 7.8 9.3 16.2 11.6 18.1z"/>
    <circle class="marker-icon-plate" cx="14" cy="13.6" r="8.7"/>
    <g class="marker-icon-symbol" transform="translate(0 .2)">${symbol}</g>
  </svg>`;
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
  if (!state) return null;
  const stateId = state.i ?? state.id;
  const cells = map?.pack?.cells;
  if (Number.isInteger(stateId) && cells?.p && cells?.state) {
    const centroid = stateCentroid(cells, stateId);
    if (centroid) return {...centroid, rotation: stateLabelRotation(cells, stateId, centroid, text)};
  }

  const center = Number.isInteger(state.center) ? state.center : null;
  if (center !== null && map?.pack?.cells?.p?.[center]) {
    const [x, y] = map.pack.cells.p[center];
    return {x, y, rotation: 0};
  }
  const gridCenter = Number.isInteger(state.gridCenter) ? state.gridCenter : null;
  if (gridCenter !== null) {
    const point = map?.grid?.points?.[map.grid.cells.p?.[gridCenter]];
    return point ? {x: point[0], y: point[1], rotation: 0} : null;
  }
  return null;
}

function stateCentroid(cells, stateId) {
  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;

  for (const cell of cells.i || []) {
    if (cells.state[cell] !== stateId || cells.h[cell] < 20 || !isWorldPoint(cells.p[cell])) continue;
    const weight = Math.max(0.0001, cells.area?.[cell] || 1);
    weightSum += weight;
    xSum += cells.p[cell][0] * weight;
    ySum += cells.p[cell][1] * weight;
  }

  if (!weightSum) return null;
  return {x: xSum / weightSum, y: ySum / weightSum};
}

function stateLabelRotation(cells, stateId, centroid, text) {
  if (Array.from(text || "").length < 5) return 0;

  let weightSum = 0;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const cell of cells.i || []) {
    if (cells.state[cell] !== stateId || cells.h[cell] < 20 || !isWorldPoint(cells.p[cell])) continue;
    const weight = Math.max(0.0001, cells.area?.[cell] || 1);
    const dx = cells.p[cell][0] - centroid.x;
    const dy = cells.p[cell][1] - centroid.y;
    weightSum += weight;
    xx += dx * dx * weight;
    yy += dy * dy * weight;
    xy += dx * dy * weight;
  }

  if (!weightSum) return 0;
  const radians = 0.5 * Math.atan2(2 * xy, xx - yy);
  const angle = clampLabelAngle((radians * 180) / Math.PI);
  return Math.abs(angle) >= 8 ? angle : (stateId % 2 ? -12 : 12);
}

function clampLabelAngle(angle) {
  let value = angle;
  while (value > 90) value -= 180;
  while (value < -90) value += 180;
  if (value > 45) value -= 90;
  if (value < -45) value += 90;
  return Math.round(Math.max(-28, Math.min(28, value)) * 10) / 10;
}

function labelClassName(item) {
  if (item.targetKind === LABEL_TARGET_KIND.STATE) return "state-label";
  if (item.targetKind === LABEL_TARGET_KIND.CUSTOM) return "custom-label";
  const city = item.city || {};
  return `city-label${city.capital ? " capital" : ""}`;
}

function isSelectedLabelItem(selection, item) {
  if (!selection) return false;
  if (selection.kind === item.targetKind && selection.id === item.targetId) return true;
  if (selection.kind !== OBJECT_KIND.LABEL) return false;
  const targetKind = selection.targetKind || LABEL_TARGET_KIND.CITY;
  const targetId = selection.targetId ?? selection.id;
  return targetKind === item.targetKind && targetId === item.targetId;
}

function installCanvasInteractions(canvas, camera, onChange, onHover, onSelect) {
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
    onChange();
    onHover(event);
  });

  canvas.addEventListener("pointerup", event => {
    if (!activePointer || activePointer.id !== event.pointerId) return;
    const pointer = activePointer;
    activePointer = null;
    if (pointer.mode === "select" && !pointer.moved) onSelect(event);
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", () => {
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
      onChange();
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

function buildPlaceholderVertices(map, colorMode, viewOptions, shoreVisualPaths = null, stateVisualPaths = null, provinceVisualPaths = null, politicalVisualMeshes = null, cellVisualMesh = null) {
  const context = createRenderContext(map);
  const statePaths = stateVisualPaths || buildStateVisualPaths(map);
  const provincePaths = provinceVisualPaths || buildProvinceVisualPaths(map);
  const politicalSurface = politicalSurfaceMeshForMode(colorMode, politicalVisualMeshes);
  const smoothCellBorders = viewOptions.smoothCellBorders !== false;
  const useCellVisualMesh = smoothCellBorders && cellVisualMesh?.cells?.length;
  const usePoliticalSurface = smoothCellBorders && politicalSurface;
  const vertices = useCellVisualMesh ? buildCellVisualGridVertices(context, colorMode, viewOptions, cellVisualMesh) : [];

  if (!useCellVisualMesh && usePoliticalSurface) {
    pushGridCells(vertices, context, colorMode, viewOptions, cellIndex => shouldDrawGridCellUnderPoliticalMesh(map, colorMode, cellIndex));
    pushMeshSurfaceVertices(vertices, politicalSurface);
  } else if (!useCellVisualMesh) {
    pushGridCells(vertices, context, colorMode, viewOptions);
  }
  const shoreVertices = [];
  if (shouldDrawShoreVisualBands(colorMode) && shoreVisualPaths) pushShoreVisualBands(shoreVertices, context, colorMode, viewOptions, shoreVisualPaths);
  if (smoothCellBorders && !useCellVisualMesh) {
    if (colorMode === "states") pushPoliticalVisualBands(vertices, context, statePaths, STATE_VISUAL_STYLE);
    if (colorMode === "provinces") pushPoliticalVisualBands(vertices, context, provincePaths, PROVINCE_VISUAL_STYLE);
  }

  return combineVertexBuffers(vertices, shoreVertices);
}

function shouldDrawShoreVisualBands(colorMode) {
  return false;
}

function combineVertexBuffers(primary, extra) {
  const primaryBuffer = primary instanceof Float32Array ? primary : new Float32Array(primary);
  if (!extra?.length) return primaryBuffer;
  const result = new Float32Array(primaryBuffer.length + extra.length);
  result.set(primaryBuffer, 0);
  result.set(extra, primaryBuffer.length);
  return result;
}

function buildLineVertices(map, visibility = {}, colorMode = "height", shoreVisualPaths = null, stateVisualPaths = null, provinceVisualPaths = null, cellVisualMesh = null, viewOptions = {}) {
  const context = createRenderContext(map);
  const vertices = [];
  const statePaths = stateVisualPaths || buildStateVisualPaths(map);
  const provincePaths = provinceVisualPaths || buildProvinceVisualPaths(map);
  pushShoreLineLayers(vertices, context, visibility, cellVisualMesh, viewOptions);
  if (visibility.provinceBorders !== false) pushPoliticalBoundaryStrokes(vertices, provincePaths, context, PROVINCE_VISUAL_STYLE.borderStroke, PROVINCE_VISUAL_STYLE.borderWidthWorld);
  if (visibility.stateBorders !== false) pushPoliticalBoundaryStrokes(vertices, statePaths, context, STATE_VISUAL_STYLE.borderStroke, STATE_VISUAL_STYLE.borderWidthWorld);
  if (visibility.warFronts !== false) pushMilitaryFrontLines(vertices, context, map, visibility);
  return new Float32Array(vertices);
}

const LINE_SMOOTHING = Object.freeze({
  river: Object.freeze({iterations: 1, factor: 0.2}),
  route: Object.freeze({iterations: 1, factor: 0.16}),
  riverSelection: Object.freeze({iterations: 1, factor: 0.18})
});

function buildRiverMeshVertices(map, camera, canvas) {
  const context = createRenderContext(map, {camera, canvas});
  const vertices = [];
  const stats = {
    rivers: 0,
    segments: 0,
    minWidthPx: Infinity,
    maxWidthPx: 0,
    minFlux: Infinity,
    maxFlux: 0
  };
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);

  for (const river of map.rivers.rivers) {
    if (!Array.isArray(river.points) || river.points.length < 2) continue;
    const {points, widths} = getRiverRenderPath(river, map, pixelRatio, stats);
    if (points.length < 2) continue;
    const before = vertices.length;
    pushVariableScreenPolyline(vertices, context, points, widths, riverRenderColor(river));
    if (vertices.length === before) continue;
    stats.rivers++;
    stats.segments += points.length - 1;
  }

  return {
    vertices: new Float32Array(vertices),
    stats: normalizeRiverWidthStats(stats)
  };
}

function getRiverRenderPath(river, map, pixelRatio, stats) {
  const points = river.points.filter(isWorldPoint);
  const cells = Array.isArray(river.cells) ? river.cells : [];
  const widths = [];
  let runningFlux = 0;

  for (let index = 0; index < points.length; index++) {
    const cell = sampleRiverCell(cells, index, points.length);
    runningFlux = Math.max(runningFlux, riverPointFlux(points[index], map.pack.cells, cell, river));
    const widthCss = riverWidthCssPx(river, runningFlux, index);
    widths.push(widthCss * pixelRatio);
    stats.minWidthPx = Math.min(stats.minWidthPx, widthCss);
    stats.maxWidthPx = Math.max(stats.maxWidthPx, widthCss);
    stats.minFlux = Math.min(stats.minFlux, runningFlux);
    stats.maxFlux = Math.max(stats.maxFlux, runningFlux);
  }

  return smoothWorldPathWithValues(points, widths, LINE_SMOOTHING.river);
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

function riverWidthCssPx(river, flux, pointIndex) {
  const widthFactor = river.widthFactor || 1;
  const sourceWidth = river.sourceWidth || 0.05;
  const offset = getRiverRenderOffset(flux, pointIndex, widthFactor, sourceWidth);
  const sourceLikeWidth = getRiverRenderWidth(offset);
  return clamp(sourceLikeWidth * 6 + 1.1, 1.1, 9.5);
}

function getRiverRenderOffset(flux, pointIndex, widthFactor, startingWidth) {
  const lengthProgression = [1, 1, 2, 3, 5, 8, 13, 21, 34].map(value => value / 200);
  const fluxWidth = Math.min((flux || 0) ** 0.7 / 500, 1);
  const lengthWidth = pointIndex / 200 + (lengthProgression[pointIndex] || lengthProgression[lengthProgression.length - 1]);
  return widthFactor * (lengthWidth + fluxWidth) + startingWidth;
}

function getRiverRenderWidth(offset) {
  return (offset / 1.5) ** 1.8;
}

function normalizeRiverWidthStats(stats) {
  return {
    rivers: stats.rivers,
    segments: stats.segments,
    minWidthPx: stats.minWidthPx === Infinity ? 0 : roundValue(stats.minWidthPx),
    maxWidthPx: roundValue(stats.maxWidthPx),
    minFlux: stats.minFlux === Infinity ? 0 : roundValue(stats.minFlux),
    maxFlux: roundValue(stats.maxFlux)
  };
}

function emptyRiverWidthStats() {
  return {
    rivers: 0,
    segments: 0,
    minWidthPx: 0,
    maxWidthPx: 0,
    minFlux: 0,
    maxFlux: 0
  };
}

function riverRenderColor(river) {
  const width = Math.min(1, Math.max(0, (river.width || 0) / 8));
  return mix([0.18, 0.45, 0.78, 0.95], [0.34, 0.68, 0.96, 1], width);
}

function buildRouteMeshVertices(map, camera, canvas, selection) {
  const build = createRouteMeshBuild(map, camera, canvas, selection);
  for (const route of map.settlements.routes) {
    if (!pushRouteMesh(build, route)) break;
  }
  return finalizeRouteMeshBuild(build);
}

async function buildRouteMeshVerticesAsync(map, camera, canvas, selection, {yieldToBrowser = () => Promise.resolve(), sliceMs = ROUTE_BUILD_SLICE_MS} = {}) {
  const build = createRouteMeshBuild(map, camera, canvas, selection);
  let sliceStartedAt = performance.now();
  for (const route of map.settlements.routes) {
    if (!pushRouteMesh(build, route)) break;
    if (performance.now() - sliceStartedAt < sliceMs) continue;
    await yieldToBrowser();
    sliceStartedAt = performance.now();
  }
  return finalizeRouteMeshBuild(build);
}

function createRouteMeshBuild(map, camera, canvas, selection) {
  const context = createRenderContext(map, {camera, canvas});
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  return {
    context,
    pixelRatio,
    selection,
    vertices: [],
    stats: emptyRouteRenderStats()
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
  const selected = build.selection?.kind === OBJECT_KIND.ROUTE && build.selection.id === route.id;
  const style = routeStyle(route);
  const color = selected ? [1, 0.82, 0.34, 1] : style.color;
  const baseWidth = style.width;
  const widthPx = (selected ? baseWidth + 2.4 : baseWidth) * build.pixelRatio;
  const dash = !selected && style.dash ? {
    dashPx: style.dash[0] * build.pixelRatio,
    gapPx: style.dash[1] * build.pixelRatio,
    maxPieces: MAX_ROUTE_DASH_PIECES
  } : null;
  const smoothed = smoothWorldPath(points, LINE_SMOOTHING.route);
  build.stats.smoothedPoints += smoothed.length;
  const before = build.vertices.length;
  pushScreenPolyline(build.vertices, build.context, smoothed, color, widthPx, dash);
  const addedVertices = (build.vertices.length - before) / 6;
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
  return {
    vertices: new Float32Array(build.vertices),
    stats: build.stats
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

function emptyRouteRenderStats() {
  return {
    routes: 0,
    renderedRoutes: 0,
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
    pointBudgetExceeded: false,
    vertexBudgetExceeded: false
  };
}

function routeStyle(route) {
  if (route.level === "primary") return {color: [0.68, 0.49, 0.24, 1], width: 3.8};
  if (route.level === "secondary") return {color: [0.58, 0.42, 0.24, 0.98], width: 2.8};
  return {color: [0.45, 0.35, 0.22, 0.94], width: 2.1, dash: [9, 6]};
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

function labelLimitForScale(scale, maxCityLabels = 5000) {
  const limit = normalizeMaxCityLabels(maxCityLabels, 5000);
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

function labelBoxForItem(item, screen) {
  if (item.targetKind === LABEL_TARGET_KIND.STATE) {
    const estimatedWidth = Math.max(72, Math.min(280, 22 + Array.from(item.text || "").length * 22));
    const estimatedHeight = 36;
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
  const city = item.city || {};
  const text = item.text || city.name || "";
  const estimatedWidth = city.capital
    ? Math.max(48, Math.min(168, 18 + text.length * 16))
    : Math.max(34, Math.min(132, 14 + text.length * 13));
  const estimatedHeight = city.capital ? 27 : 18;
  return {
    left: screen.x - estimatedWidth / 2,
    right: screen.x + estimatedWidth / 2,
    top: screen.y - estimatedHeight - 8,
    bottom: screen.y + 2
  };
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

function lockCanvasToInitialDisplaySize(canvas, overlay = null) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || canvas.parentElement?.clientWidth || 1));
  const cssHeight = Math.max(1, Math.round(rect.height || canvas.clientHeight || canvas.parentElement?.clientHeight || 1));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = width;
  canvas.height = height;

  if (overlay) {
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
    overlay.style.width = `${cssWidth}px`;
    overlay.style.height = `${cssHeight}px`;
  }

  return {cssWidth, cssHeight, width, height, pixelRatio};
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

function roundValue(value) {
  return Math.round(value * 10) / 10;
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
out vec4 v_color;

void main() {
  v_color = a_color;
  gl_PointSize = 4.0;
  gl_Position = vec4(a_position * u_scale + u_offset, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec4 v_color;
uniform bool u_pointMode;
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

  outColor = v_color;
}`;
