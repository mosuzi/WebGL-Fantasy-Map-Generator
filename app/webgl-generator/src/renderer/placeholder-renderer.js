import {buildObjectPickingIndex, pickCity, pickGridCell, pickMarker, pickPoliticalObject, pickRiver, pickRoute} from "./picking.js";
import {LABEL_TARGET_KIND, OBJECT_KIND, POLITICAL_OBJECT_FIELD, isPointObjectKind, isPoliticalObjectKind} from "../runtime/object-kinds.js";
import {isGeneratedLabelHidden} from "../runtime/label-edit-commands.js";
import {createRandom} from "../generator/random.js";
import Delaunator from "../vendor/delaunator.js";

export class PlaceholderMapRenderer {
  constructor(canvas, onViewChange = () => {}, onHover = () => {}, onSelect = () => {}) {
    this.canvas = canvas;
    this.overlay = canvas.parentElement?.querySelector("#map-overlay") || null;
    this.onViewChange = onViewChange;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.canvasSize = lockCanvasToInitialDisplaySize(canvas, this.overlay);
    this.gl = canvas.getContext("webgl2", {antialias: true});
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL2");

    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.locations = {
      position: this.gl.getAttribLocation(this.program, "a_position"),
      color: this.gl.getAttribLocation(this.program, "a_color"),
      scale: this.gl.getUniformLocation(this.program, "u_scale"),
      offset: this.gl.getUniformLocation(this.program, "u_offset")
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
    this.selection = null;
    this.selectionMarker = null;
    this.objectPickingIndex = null;
    this.lastObjectCandidateCount = 0;
    this.routeBuildMs = 0;
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
    this.viewOptions = {showOceanHeight: false, smoothCellBorders: true};
    this.labelOptions = {maxCityLabels: 5000};
    this.layerVisibility = {
      routes: true,
      rivers: true,
      cities: true,
      labels: true,
      stateLabels: true,
      population: true,
      markers: true,
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
    this.map = map;
    this.objectPickingIndex = buildObjectPickingIndex(map);
    this.rebuildCellVisualMesh();
    this.rebuildShoreVisualCache();
    this.rebuildStateVisualCache();
    this.rebuildProvinceVisualCache();
    this.rebuildPoliticalVisualMeshes();
    const vertices = buildPlaceholderVertices(map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh);
    const lineVertices = buildLineVertices(map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions);
    const pointVertices = buildPointVertices(map, this.layerVisibility);
    this.vertexCount = vertices.length / 6;
    this.routeVertexCount = 0;
    this.lineVertexCount = lineVertices.length / 6;
    this.pointVertexCount = pointVertices.length / 6;
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
    this.buildLabels(map);
    this.markAllDynamicBuffersDirty();
    this.fitToView();
  }

  fitToView() {
    this.camera.scale = 1;
    this.camera.offsetX = 0;
    this.camera.offsetY = 0;
    this.markViewportBuffersDirty();
    this.draw();
    this.onViewChange();
  }

  setColorMode(mode) {
    this.colorMode = mode;
    if (!this.map) return;
    this.refreshCellSurface();
    this.refreshLineLayers();
  }

  setViewOptions(options = {}) {
    const shouldRefreshLineLayers = Object.prototype.hasOwnProperty.call(options, "smoothCellBorders");
    this.viewOptions = {...this.viewOptions, ...options};
    if (!this.map) return;
    this.refreshCellSurface();
    if (shouldRefreshLineLayers) this.refreshLineLayers();
  }

  setLabelOptions(options = {}) {
    const maxCityLabels = normalizeMaxCityLabels(options.maxCityLabels, this.labelOptions.maxCityLabels);
    if (maxCityLabels === this.labelOptions.maxCityLabels) return;
    this.labelOptions = {...this.labelOptions, maxCityLabels};
    if (!this.map) return;
    this.refreshLabels();
  }

  refreshCellSurface() {
    if (!this.map) return;
    this.rebuildStateVisualCache();
    this.rebuildProvinceVisualCache();
    this.rebuildPoliticalVisualMeshes();
    const vertices = buildPlaceholderVertices(this.map, this.colorMode, this.viewOptions, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.politicalVisualMeshes, this.cellVisualMesh);
    this.vertexCount = vertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.draw();
  }

  refreshLabels() {
    if (!this.map) return;
    this.buildLabels(this.map);
    this.updateLabels();
  }

  refreshLineLayers({draw = true} = {}) {
    if (!this.map) return;
    this.rebuildStateVisualCache();
    this.rebuildProvinceVisualCache();
    const lineVertices = buildLineVertices(this.map, this.layerVisibility, this.colorMode, this.shoreVisualPaths, this.stateVisualPaths, this.provinceVisualPaths, this.cellVisualMesh, this.viewOptions);
    this.lineVertexCount = lineVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, lineVertices, this.gl.STATIC_DRAW);
    if (draw) this.draw();
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

  setPoliticalMeshDebugMode(mode = "none") {
    const nextMode = normalizePoliticalMeshDebugMode(mode);
    if (this.politicalMeshDebugMode === nextMode) return;
    this.politicalMeshDebugMode = nextMode;
    this.updatePoliticalMeshDebugBuffer();
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
    if (layer === "cities" || layer === "population" || layer === "markers") this.refreshPointLayers({draw: false});
    if (layers.some(item => item === "coastline" || item === "lakeShore" || item === "stateBorders" || item === "provinceBorders")) this.refreshLineLayers({draw: false});
    this.draw();
  }

  draw() {
    if (!this.map || !this.vertexCount) return;
    const startedAt = performance.now();
    if (this.dynamicBuffersDirty.routes) this.updateRouteBuffer();
    if (this.dynamicBuffersDirty.rivers) this.updateRiverBuffer();
    if (this.dynamicBuffersDirty.selection || this.locateFlash) this.updateSelectionBuffer();

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...this.map.layers.background);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
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
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.offset, this.camera.offsetX, this.camera.offsetY);
    bindVertexBuffer(gl, this.locations);
    gl.drawArrays(gl.POINTS, 0, this.pointVertexCount);

    this.lastDraw = {
      drawMs: roundMs(performance.now() - startedAt),
      glError: gl.getError()
    };
    this.updateLabels();
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
      markerCount: this.map?.markers?.metadata?.markers || 0,
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
    const world = this.screenToWorld(clientX, clientY);
    const result = pickGridCell(this.map, world.x, world.y);
    const cityObject = pickCity(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(9));
    const marker = pickMarker(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(8));
    const route = pickRoute(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(7));
    const river = pickRiver(this.map, this.objectPickingIndex, world.x, world.y, this.pickThresholdWorld(7));
    const politicalObject = pickPoliticalObject(this.map, result, this.colorMode);
    const object = label || cityObject || marker || route || river || politicalObject;
    this.lastObjectCandidateCount = (label ? 1 : 0) + (cityObject?.candidateCount || 0) + (marker?.candidateCount || 0) + (route?.candidateCount || 0) + (river?.candidateCount || 0) + (politicalObject ? 1 : 0);
    return result ? {...result, label, cityObject, marker, route, river, politicalObject, object, objectCandidates: this.lastObjectCandidateCount, worldX: roundValue(result.worldX), worldY: roundValue(result.worldY)} : null;
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
    const routeVertices = buildRouteMeshVertices(this.map, this.camera, this.canvas, this.selection);
    this.routeVertexCount = routeVertices.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.routeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, routeVertices, this.gl.DYNAMIC_DRAW);
    this.routeBuildMs = roundMs(performance.now() - startedAt);
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
    const [ndcX, ndcY] = worldToNdcPoint([centerX, centerY], this.map);

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
      this.labelCount = 0;
      this.visibleLabelCount = 0;
      this.cityLabelCount = 0;
      this.visibleCityLabelCount = 0;
      this.stateLabelCount = 0;
      this.visibleStateLabelCount = 0;
      return;
    }
    this.overlay.replaceChildren();
    this.labelItems = [...getLabelStates(map), ...getLabelCities(map, this.labelOptions), ...getCustomLabels(map)].map(item => {
      const node = document.createElement("span");
      node.className = labelClassName(item);
      node.textContent = item.text;
      this.overlay.append(node);
      return {...item, node, box: null, visible: false};
    });
    this.selectionMarker = document.createElement("span");
    this.selectionMarker.className = "selection-marker";
    this.selectionMarker.style.display = "none";
    this.overlay.append(this.selectionMarker);
    this.labelCount = this.labelItems.length;
    this.cityLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.CITY).length;
    this.stateLabelCount = this.labelItems.filter(item => item.targetKind === LABEL_TARGET_KIND.STATE).length;
    this.visibleLabelCount = 0;
    this.visibleCityLabelCount = 0;
    this.visibleStateLabelCount = 0;
  }

  updateLabels() {
    if (!this.overlay || !this.map || !this.labelItems.length) return;
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
      const screen = this.worldToScreen(item.x, item.y, rect);
      item.node.classList.toggle("selected", isSelectedLabelItem(this.selection, item));
      const box = labelBoxForItem(item, screen);
      const onScreen = box.right > 8 && box.bottom > 8 && box.left < rect.width - 8 && box.top < rect.height - 8;
      const stateLabel = item.targetKind === LABEL_TARGET_KIND.STATE;
      const blocked = stateLabel
        ? occupiedStates.some(other => boxesOverlap(box, other, padding))
        : (stateLabelScale.blocksCities && occupiedStates.some(other => boxesOverlap(box, other, padding))) || occupied.some(other => boxesOverlap(box, other, padding));
      const withinLimit = item.targetKind === LABEL_TARGET_KIND.CITY ? visibleCities < maxVisible : true;
      const shouldShow = this.isLabelItemLayerVisible(item) && withinLimit && scale >= item.minScale && (!stateLabel || stateLabelScale.visible) && onScreen && !blocked;
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
    this.updateSelectionMarker(rect);
  }

  isLabelItemLayerVisible(item) {
    if (item.targetKind === LABEL_TARGET_KIND.STATE) return this.layerVisibility.stateLabels !== false && this.colorMode === "states";
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

  pickLabel(clientX, clientY) {
    if (!this.overlay || !this.labelItems.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const item of this.labelItems) {
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
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", event => {
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!dragging) {
      onHover(event);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.hypot(dx, dy) > 3) moved = true;
    lastX = event.clientX;
    lastY = event.clientY;
    camera.offsetX += (dx / rect.width) * 2;
    camera.offsetY -= (dy / rect.height) * 2;
    onChange();
    onHover(event);
  });

  canvas.addEventListener("pointerup", event => {
    dragging = false;
    if (!moved) onSelect(event);
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", () => {
    dragging = false;
    moved = false;
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

function buildPlaceholderVertices(map, colorMode, viewOptions, shoreVisualPaths = null, stateVisualPaths = null, provinceVisualPaths = null, politicalVisualMeshes = null, cellVisualMesh = null) {
  const vertices = [];
  const shorePaths = shoreVisualPaths || buildShoreVisualPaths(map);
  const statePaths = stateVisualPaths || buildStateVisualPaths(map);
  const provincePaths = provinceVisualPaths || buildProvinceVisualPaths(map);
  const politicalSurface = politicalSurfaceMeshForMode(colorMode, politicalVisualMeshes);
  const smoothCellBorders = viewOptions.smoothCellBorders !== false;
  const useCellVisualMesh = smoothCellBorders && cellVisualMesh?.cells?.length;
  const usePoliticalSurface = smoothCellBorders && politicalSurface;

  if (useCellVisualMesh) {
    pushCellVisualGridCells(vertices, map, colorMode, viewOptions, cellVisualMesh);
  } else if (usePoliticalSurface) {
    pushGridCells(vertices, map, colorMode, viewOptions, cellIndex => shouldDrawGridCellUnderPoliticalMesh(map, colorMode, cellIndex));
    pushMeshSurfaceVertices(vertices, politicalSurface);
  } else {
    pushGridCells(vertices, map, colorMode, viewOptions);
  }
  pushShoreVisualBands(vertices, map, colorMode, viewOptions, shorePaths);
  if (smoothCellBorders && !useCellVisualMesh) {
    if (colorMode === "states") pushPoliticalVisualBands(vertices, map, statePaths, STATE_VISUAL_STYLE);
    if (colorMode === "provinces") pushPoliticalVisualBands(vertices, map, provincePaths, PROVINCE_VISUAL_STYLE);
  }

  return new Float32Array(vertices);
}

function pushCellVisualGridCells(vertices, map, colorMode, viewOptions, cellVisualMesh) {
  for (const cellMesh of cellVisualMesh.cells || []) {
    if (!cellMesh?.points?.length) continue;
    const color = colorForCell(cellMesh.cell, map, colorMode, viewOptions);
    for (let index = 0; index < cellMesh.points.length; index++) {
      const nextIndex = (index + 1) % cellMesh.points.length;
      pushWorldVertex(vertices, cellMesh.center, map, color);
      pushWorldVertex(vertices, cellMesh.points[index], map, color);
      pushWorldVertex(vertices, cellMesh.points[nextIndex], map, color);
    }
  }
}

function politicalSurfaceMeshForMode(colorMode, meshes) {
  if (colorMode === "states" && meshes?.states?.surfaceVertices?.length) return meshes.states;
  if (colorMode === "provinces" && meshes?.provinces?.surfaceVertices?.length) return meshes.provinces;
  return null;
}

function shouldDrawGridCellUnderPoliticalMesh(map, colorMode, cellIndex) {
  if (!isLandCell(cellIndex, map)) return true;
  const field = colorMode === "states" ? "state" : colorMode === "provinces" ? "province" : null;
  return !field || !(map.grid.cells[field]?.[cellIndex] || 0);
}

function pushMeshSurfaceVertices(vertices, mesh) {
  for (const value of mesh.surfaceVertices || []) vertices.push(value);
}

function buildLineVertices(map, visibility = {}, colorMode = "height", shoreVisualPaths = null, stateVisualPaths = null, provinceVisualPaths = null, cellVisualMesh = null, viewOptions = {}) {
  const vertices = [];
  const shorePaths = shoreVisualPaths || buildShoreVisualPaths(map);
  const statePaths = stateVisualPaths || buildStateVisualPaths(map);
  const provincePaths = provinceVisualPaths || buildProvinceVisualPaths(map);
  if (visibility.coastline !== false) pushOriginalShoreContourLines(vertices, shorePaths.coastline, map, SHORE_VISUAL_STYLE.coastlineStroke, SHORE_VISUAL_STYLE.coastlineWidthWorld);
  if (visibility.lakeShore !== false) pushOriginalShoreContourLines(vertices, shorePaths.lakeShore, map, SHORE_VISUAL_STYLE.lakeShoreStroke, SHORE_VISUAL_STYLE.lakeShoreWidthWorld);
  if (visibility.provinceBorders !== false) pushPoliticalRoundJoinLines(vertices, provincePaths, map, colorMode === "provinces" ? PROVINCE_VISUAL_STYLE.borderStroke : [0.18, 0.2, 0.22, 0.34], PROVINCE_VISUAL_STYLE.borderWidthWorld);
  if (visibility.stateBorders !== false) pushPoliticalRoundJoinLines(vertices, statePaths, map, colorMode === "states" ? STATE_VISUAL_STYLE.borderStroke : [0.04, 0.05, 0.06, 0.62], STATE_VISUAL_STYLE.borderWidthWorld);
  return new Float32Array(vertices);
}

const SHORE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 13,
  smoothing: Object.freeze({iterations: 2, factor: 0.22}),
  coastlineWidthWorld: 0.42,
  lakeShoreWidthWorld: 0.34,
  coastlineStroke: Object.freeze([0.88, 0.84, 0.63, 0.68]),
  lakeShoreStroke: Object.freeze([0.58, 0.78, 0.84, 0.64])
});

const STATE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 7,
  smoothing: Object.freeze({iterations: 1, factor: 0.18}),
  borderWidthWorld: 0.36,
  borderStroke: Object.freeze([0.03, 0.035, 0.04, 0.5]),
  meshAlpha: 0.72,
  colorForValue: colorForState
});

const PROVINCE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 4,
  smoothing: Object.freeze({iterations: 1, factor: 0.14}),
  borderWidthWorld: 0.24,
  borderStroke: Object.freeze([0.08, 0.09, 0.1, 0.32]),
  meshAlpha: 0.68,
  colorForValue: colorForProvince
});

const LINE_SMOOTHING = Object.freeze({
  river: Object.freeze({iterations: 1, factor: 0.2}),
  route: Object.freeze({iterations: 1, factor: 0.16}),
  riverSelection: Object.freeze({iterations: 1, factor: 0.18})
});

const CELL_VISUAL_STYLE = Object.freeze({
  segmentsPerEdge: 3,
  curveFactor: 0.08,
  maxOffsetWorld: 0.9,
  noiseScaleWorld: 44
});

function buildCellVisualMesh(map) {
  const startedAt = performance.now();
  const cells = [];
  const edgeCurves = new Map();
  let boundaryPoints = 0;
  let skippedCells = 0;

  for (const cell of map?.grid?.cells?.i || []) {
    const points = buildCellVisualBoundary(map, cell, edgeCurves);
    if (points.length < 3) {
      skippedCells++;
      continue;
    }
    const center = cellCenterPoint(map.grid, cell);
    cells.push({cell, center, points});
    boundaryPoints += points.length;
  }

  return {
    cells,
    edgeCurves,
    cellCount: cells.length,
    skippedCells,
    boundaryPoints,
    edgeCurveCount: edgeCurves.size,
    style: CELL_VISUAL_STYLE,
    buildMs: roundMs(performance.now() - startedAt)
  };
}

function buildCellVisualBoundary(map, cell, edgeCurves) {
  const vertexIds = map?.grid?.cells?.v?.[cell] || [];
  if (vertexIds.length < 3) return [];
  const points = [];

  for (let index = 0; index < vertexIds.length; index++) {
    const a = vertexIds[index];
    const b = vertexIds[(index + 1) % vertexIds.length];
    const curve = cellVisualEdgeCurve(map, a, b, edgeCurves);
    const directed = a <= b ? curve : [...curve].reverse();
    for (let pointIndex = 0; pointIndex < directed.length; pointIndex++) {
      if (points.length && pointIndex === 0) continue;
      points.push(directed[pointIndex]);
    }
  }

  if (points.length > 1 && pointsNear(points[0], points[points.length - 1])) points.pop();
  return points;
}

function cellVisualEdgeCurve(map, a, b, edgeCurves) {
  const first = Math.min(a, b);
  const second = Math.max(a, b);
  const key = `${first}:${second}`;
  const cached = edgeCurves.get(key);
  if (cached) return cached;

  const start = map?.grid?.vertices?.p?.[first];
  const end = map?.grid?.vertices?.p?.[second];
  if (!isWorldPoint(start) || !isWorldPoint(end)) {
    const fallback = [];
    edgeCurves.set(key, fallback);
    return fallback;
  }

  const length = worldDistance(start, end);
  if (length <= 0.001) {
    const point = [[start[0], start[1]]];
    edgeCurves.set(key, point);
    return point;
  }

  const normal = normalizeWorldVector(-(end[1] - start[1]), end[0] - start[0]);
  const mid = midpoint(start, end);
  const offset = cellVisualEdgeOffset(key, mid, length);
  const control = [mid[0] + normal.x * offset, mid[1] + normal.y * offset];
  const curve = sampleQuadraticWorldPath(start, control, end, CELL_VISUAL_STYLE.segmentsPerEdge);
  edgeCurves.set(key, curve);
  return curve;
}

function cellVisualEdgeOffset(key, mid, length) {
  const coherent = coherentCellVisualNoise(mid[0], mid[1], CELL_VISUAL_STYLE.noiseScaleWorld);
  const local = cellVisualEdgeNoise(key) * 2 - 1;
  const signedNoise = coherent * 0.82 + local * 0.18;
  return signedNoise * Math.min(length * CELL_VISUAL_STYLE.curveFactor, CELL_VISUAL_STYLE.maxOffsetWorld);
}

function coherentCellVisualNoise(x, y, scale) {
  const safeScale = Math.max(1, scale);
  const gx = x / safeScale;
  const gy = y / safeScale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smoothUnitStep(gx - x0);
  const ty = smoothUnitStep(gy - y0);
  const a = gridCellVisualNoise(x0, y0);
  const b = gridCellVisualNoise(x0 + 1, y0);
  const c = gridCellVisualNoise(x0, y0 + 1);
  const d = gridCellVisualNoise(x0 + 1, y0 + 1);
  return mixValue(mixValue(a, b, tx), mixValue(c, d, tx), ty);
}

function smoothUnitStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mixValue(a, b, t) {
  return a + (b - a) * t;
}

function gridCellVisualNoise(x, y) {
  let hash = 2166136261;
  hash ^= x | 0;
  hash = Math.imul(hash, 16777619);
  hash ^= y | 0;
  hash = Math.imul(hash, 16777619);
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

function sampleQuadraticWorldPath(start, control, end, segments) {
  const points = [];
  const safeSegments = Math.max(1, segments);
  for (let index = 0; index <= safeSegments; index++) {
    const t = index / safeSegments;
    const inv = 1 - t;
    points.push([
      inv * inv * start[0] + 2 * inv * t * control[0] + t * t * end[0],
      inv * inv * start[1] + 2 * inv * t * control[1] + t * t * end[1]
    ]);
  }
  return points;
}

function cellVisualEdgeNoise(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function emptyCellVisualMesh() {
  return {
    cells: [],
    edgeCurves: new Map(),
    cellCount: 0,
    skippedCells: 0,
    boundaryPoints: 0,
    edgeCurveCount: 0,
    style: CELL_VISUAL_STYLE,
    buildMs: 0
  };
}

function summarizeCellVisualMesh(mesh) {
  return {
    cellCount: mesh?.cellCount || 0,
    skippedCells: mesh?.skippedCells || 0,
    boundaryPoints: mesh?.boundaryPoints || 0,
    averageBoundaryPoints: roundRatio(mesh?.boundaryPoints || 0, mesh?.cellCount || 0),
    edgeCurveCount: mesh?.edgeCurveCount || 0,
    style: {...CELL_VISUAL_STYLE},
    buildMs: mesh?.buildMs || 0
  };
}

function boundaryLineModeForOptions(viewOptions, cellVisualMesh) {
  return "original-coastline + round-join-political";
}

function pushCellVisualShoreLines(vertices, map, cellVisualMesh, targetType, color) {
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c) return;
  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if ((targetType === "ocean" && !isOcean) || (targetType === "lake" && isOcean)) continue;
      pushWorldPolylineLines(vertices, visualSharedCellEdge(map, cell, neighbor, cellVisualMesh), map, color);
    }
  }
}

function pushCellVisualPoliticalLines(vertices, map, field, cellVisualMesh, color) {
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c || !cells?.[field]) return;
  for (const cell of cells.i || []) {
    if (!isLandCell(cell, map)) continue;
    const ownValue = cells[field][cell] || 0;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell || !isLandCell(neighbor, map)) continue;
      const neighborValue = cells[field][neighbor] || 0;
      if (neighborValue === ownValue) continue;
      if (field !== "state" && (!ownValue || !neighborValue)) continue;
      if (field === "state" && !ownValue && !neighborValue) continue;
      pushWorldPolylineLines(vertices, visualSharedCellEdge(map, cell, neighbor, cellVisualMesh), map, color);
    }
  }
}

function pushHardShoreLines(vertices, map, targetType, color) {
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c) return;
  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if ((targetType === "ocean" && !isOcean) || (targetType === "lake" && isOcean)) continue;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (edge) pushWorldLine(vertices, edge, map, color);
    }
  }
}

function visualSharedCellEdge(map, cell, neighbor, cellVisualMesh) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return [];
  const first = Math.min(shared[0], shared[1]);
  const second = Math.max(shared[0], shared[1]);
  const curve = cellVisualMesh?.edgeCurves?.get(`${first}:${second}`);
  if (curve?.length) return shared[0] <= shared[1] ? curve : [...curve].reverse();
  return shared.map(vertex => map.grid.vertices.p[vertex]).filter(isWorldPoint);
}

function pushWorldPolylineLines(vertices, points, map, color) {
  if (!Array.isArray(points) || points.length < 2) return;
  for (let index = 0; index < points.length - 1; index++) {
    pushWorldLine(vertices, [points[index], points[index + 1]], map, color);
  }
}

function pushPoliticalBoundaryLines(vertices, map, field, color) {
  const cells = map?.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.[field]) return;
  for (const cell of cells.i || []) {
    if (!isLandCell(cell, map)) continue;
    const ownValue = cells[field][cell] || 0;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell || !isLandCell(neighbor, map)) continue;
      const neighborValue = cells[field][neighbor] || 0;
      if (neighborValue === ownValue) continue;
      if (field !== "state" && (!ownValue || !neighborValue)) continue;
      if (field === "state" && !ownValue && !neighborValue) continue;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (edge) pushWorldLine(vertices, edge, map, color);
    }
  }
}

function sharedVoronoiEdge(map, cell, neighbor) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return null;
  return [map.grid.vertices.p[shared[0]], map.grid.vertices.p[shared[1]]];
}

function sharedVoronoiEdgeVertexIds(map, cell, neighbor) {
  const ownVertices = map.grid.cells.v[cell] || [];
  const neighborVertices = new Set(map.grid.cells.v[neighbor] || []);
  const shared = ownVertices.filter(vertex => neighborVertices.has(vertex));
  if (shared.length < 2) return null;
  return [shared[0], shared[1]];
}

function pushShoreVisualBands(vertices, map, colorMode, viewOptions, paths) {
  for (const path of paths.coastline) pushShoreVisualBand(vertices, path, map, colorMode, viewOptions);
  for (const path of paths.lakeShore) pushShoreVisualBand(vertices, path, map, colorMode, viewOptions);
}

function pushShoreVisualBand(vertices, path, map, colorMode, viewOptions) {
  const visual = buildSmoothedShoreVisual(path, map, colorMode, viewOptions);
  if (!visual || visual.land.points.length < 2 || visual.water.points.length !== visual.land.points.length) return;

  for (let index = 0; index < visual.land.points.length - 1; index++) {
    const landA = visual.land.points[index];
    const landB = visual.land.points[index + 1];
    const waterA = visual.water.points[index];
    const waterB = visual.water.points[index + 1];
    const centerA = midpoint(landA, waterA);
    const centerB = midpoint(landB, waterB);
    const landColorA = visual.land.colors[index];
    const landColorB = visual.land.colors[index + 1];
    const waterColorA = visual.water.colors[index];
    const waterColorB = visual.water.colors[index + 1];
    pushWorldVertex(vertices, centerA, map, waterColorA);
    pushWorldVertex(vertices, waterA, map, waterColorA);
    pushWorldVertex(vertices, waterB, map, waterColorB);
    pushWorldVertex(vertices, centerA, map, waterColorA);
    pushWorldVertex(vertices, waterB, map, waterColorB);
    pushWorldVertex(vertices, centerB, map, waterColorB);
    pushWorldVertex(vertices, centerA, map, landColorA);
    pushWorldVertex(vertices, centerB, map, landColorB);
    pushWorldVertex(vertices, landB, map, landColorB);
    pushWorldVertex(vertices, centerA, map, landColorA);
    pushWorldVertex(vertices, landB, map, landColorB);
    pushWorldVertex(vertices, landA, map, landColorA);
  }
}

function pushShoreVisualLines(vertices, paths, map, color) {
  for (const path of paths) {
    const visual = buildSmoothedShoreVisual(path, map, "height", {});
    if (!visual || visual.land.points.length < 2 || visual.water.points.length !== visual.land.points.length) continue;
    for (let index = 0; index < visual.land.points.length - 1; index++) {
      pushWorldLine(vertices, [midpoint(visual.land.points[index], visual.water.points[index]), midpoint(visual.land.points[index + 1], visual.water.points[index + 1])], map, color);
    }
  }
}

function pushOriginalShoreContourLines(vertices, paths, map, color, widthWorld) {
  for (const path of paths || []) {
    const points = path.originalCoastlinePoints?.length ? path.originalCoastlinePoints : path.points;
    pushWorldPolylineMesh(vertices, points, map, color, widthWorld, {closed: pointsNear(points?.[0], points?.[points.length - 1])});
  }
}

function pushPoliticalRoundJoinLines(vertices, paths, map, color, widthWorld) {
  for (const path of paths?.boundaries || []) {
    pushWorldPolylineMesh(vertices, path.points, map, color, widthWorld, {closed: pointsNear(path.points?.[0], path.points?.[path.points.length - 1])});
  }
}

function buildSmoothedShoreVisual(path, map, colorMode, viewOptions) {
  if (!path.points?.length || path.points.length !== path.sideVectors?.length) return null;
  const halfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const renderPoints = path.originalCoastlinePoints?.length ? path.originalCoastlinePoints : path.points;
  const landPoints = [];
  const waterPoints = [];
  const landColors = [];
  const waterColors = [];

  for (let index = 0; index < renderPoints.length; index++) {
    const point = renderPoints[index];
    const sourceIndex = nearestPathSourceIndex(point, path.points);
    const side = path.sideVectors[sourceIndex] || {x: 0, y: 0};
    landPoints.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
    waterPoints.push([point[0] - side.x * halfWidth, point[1] - side.y * halfWidth]);
    landColors.push(colorForCell(path.landCells[sourceIndex], map, colorMode, viewOptions));
    waterColors.push(colorForCell(path.waterCells[sourceIndex], map, colorMode, viewOptions));
  }

  return {
    land: smoothWorldPathAndColors(landPoints, landColors, SHORE_VISUAL_STYLE.smoothing),
    water: smoothWorldPathAndColors(waterPoints, waterColors, SHORE_VISUAL_STYLE.smoothing)
  };
}

function nearestPathSourceIndex(point, sourcePoints = []) {
  if (!isWorldPoint(point) || !sourcePoints.length) return 0;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < sourcePoints.length; index++) {
    const source = sourcePoints[index];
    if (!isWorldPoint(source)) continue;
    const distance = (point[0] - source[0]) ** 2 + (point[1] - source[1]) ** 2;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    bestIndex = index;
  }
  return bestIndex;
}

function buildShoreVisualPaths(map) {
  const edges = collectShoreVisualEdges(map);
  const paths = {
    coastline: buildShorePathsFromEdges(edges.coastline),
    lakeShore: buildShorePathsFromEdges(edges.lakeShore)
  };
  attachOriginalCoastlinePoints(paths.coastline, map, "coastline");
  attachOriginalCoastlinePoints(paths.lakeShore, map, "lake");
  return paths;
}

function attachOriginalCoastlinePoints(paths, map, featureType) {
  for (let index = 0; index < paths.length; index++) {
    paths[index].originalCoastlinePoints = buildOriginalCoastlineRenderPoints(paths[index].points, map, featureType, index);
  }
}

const ORIGINAL_COASTLINE_STYLE = Object.freeze({
  enabled: true,
  maxDepth: 4,
  baseAmplitude: 1.5,
  amplitudeDecay: 0.9,
  minEdge: 1,
  smoothThreshold: 0.25,
  roughnessContrast: 1.5,
  profileHarmonics: 4,
  lakeSmoothThreshMult: 2,
  simplifyTolerance: 0.3,
  smoothSamples: 4,
  jaggedSamples: 4
});

const COASTLINE_PROFILE_SIZE = 256;

function buildOriginalCoastlineRenderPoints(points, map, featureType, pathIndex) {
  const source = normalizeWorldPathPoints(points);
  if (source.length < 3 || !ORIGINAL_COASTLINE_STYLE.enabled) return source;
  const closed = pointsNear(source[0], source[source.length - 1]);
  const ring = closed ? source.slice(0, -1) : source;
  const simplified = simplifyWorldPath(ring, ORIGINAL_COASTLINE_STYLE.simplifyTolerance);
  if (simplified.length < 3) return source;
  const seed = `${map?.metadata?.seed || "map"}:coastline:${featureType}:${pathIndex}`;
  const random = createRandom(seed);
  const shape = fractalizeOriginalCoastline(simplified, map, featureType, random, closed);
  return buildOriginalCoastlineCurvePoints(shape, closed);
}

function normalizeWorldPathPoints(points) {
  const result = [];
  for (const point of points || []) {
    if (!isWorldPoint(point)) continue;
    const previous = result[result.length - 1];
    if (previous && pointsNear(previous, point)) continue;
    result.push([point[0], point[1]]);
  }
  if (result.length > 2 && pointsNear(result[0], result[result.length - 1])) result[result.length - 1] = result[0];
  return result;
}

function simplifyWorldPath(points, tolerance) {
  if (!points?.length || points.length <= 2 || tolerance <= 0) return points || [];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifyWorldPathSection(points, 0, points.length - 1, tolerance * tolerance, keep);
  return points.filter((_, index) => keep[index]);
}

function simplifyWorldPathSection(points, first, last, toleranceSquared, keep) {
  if (last <= first + 1) return;
  let maxDistance = 0;
  let split = -1;
  for (let index = first + 1; index < last; index++) {
    const distance = pointSegmentDistanceSquared(points[index], points[first], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      split = index;
    }
  }
  if (maxDistance <= toleranceSquared || split === -1) return;
  keep[split] = 1;
  simplifyWorldPathSection(points, first, split, toleranceSquared, keep);
  simplifyWorldPathSection(points, split, last, toleranceSquared, keep);
}

function pointSegmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return (point[0] - a[0]) ** 2 + (point[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  const x = a[0] + dx * t;
  const y = a[1] + dy * t;
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}

function fractalizeOriginalCoastline(points, map, featureType, random, closed) {
  const settings = featureType === "lake"
    ? {...ORIGINAL_COASTLINE_STYLE, smoothThreshold: Math.min(1, ORIGINAL_COASTLINE_STYLE.smoothThreshold * ORIGINAL_COASTLINE_STYLE.lakeSmoothThreshMult)}
    : ORIGINAL_COASTLINE_STYLE;
  const profile = makeCoastlineRoughnessProfile(() => random.next(), settings.roughnessContrast, settings.profileHarmonics);
  const segments = closed ? points.length : points.length - 1;
  let perimeter = 0;
  const lengths = new Array(segments);
  for (let index = 0; index < segments; index++) {
    lengths[index] = worldDistance(points[index], points[(index + 1) % points.length]);
    perimeter += lengths[index];
  }
  if (perimeter <= 0.000001) return {points, origIndices: points.map((_, index) => index)};

  let cumulative = 0;
  const tParams = new Array(points.length);
  for (let index = 0; index < points.length; index++) {
    tParams[index] = cumulative / perimeter;
    if (index < lengths.length) cumulative += lengths[index];
  }

  const result = [];
  const origIndices = [];
  for (let index = 0; index < points.length; index++) {
    origIndices.push(result.length);
    result.push(points[index]);
    if (!closed && index === points.length - 1) break;
    const nextIndex = (index + 1) % points.length;
    if (isOnMapBorderPoint(points[index], map) && isOnMapBorderPoint(points[nextIndex], map)) continue;
    subdivideOriginalCoastlineEdge(points[index], points[nextIndex], tParams[index], tParams[nextIndex] ?? 1, settings.maxDepth, settings.baseAmplitude, profile, () => random.next(), result, settings);
  }

  return {points: result, origIndices};
}

function makeCoastlineRoughnessProfile(rand, contrast, harmonics = 4) {
  const profile = new Float32Array(COASTLINE_PROFILE_SIZE);
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    const amplitude = rand();
    const phase = rand() * Math.PI * 2;
    for (let index = 0; index < COASTLINE_PROFILE_SIZE; index++) {
      profile[index] += amplitude * Math.cos((2 * Math.PI * harmonic * index) / COASTLINE_PROFILE_SIZE + phase);
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const value of profile) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min || 1;
  for (let index = 0; index < COASTLINE_PROFILE_SIZE; index++) profile[index] = ((profile[index] - min) / range) ** contrast;
  return profile;
}

function sampleCoastlineProfile(profile, t) {
  const position = (((t % 1) + 1) % 1) * COASTLINE_PROFILE_SIZE;
  const index = Math.floor(position) % COASTLINE_PROFILE_SIZE;
  const f = position - Math.floor(position);
  return profile[index] * (1 - f) + profile[(index + 1) % COASTLINE_PROFILE_SIZE] * f;
}

function coastlineMidT(a, b) {
  const diff = b - a;
  if (Math.abs(diff) <= 0.5) return a + diff / 2;
  return ((a + (diff - Math.sign(diff)) / 2) % 1 + 1) % 1;
}

function subdivideOriginalCoastlineEdge(a, b, t0, t1, depth, amplitude, profile, rand, result, settings) {
  const length = worldDistance(a, b);
  if (depth === 0 || length < settings.minEdge) return;
  const tm = coastlineMidT(t0, t1);
  const roughness = sampleCoastlineProfile(profile, tm);
  if (roughness < settings.smoothThreshold) return;
  const normal = normalizeWorldVector(-(b[1] - a[1]), b[0] - a[0]);
  const displacement = (rand() - 0.5) * Math.sqrt(length) * amplitude * roughness;
  const middle = [(a[0] + b[0]) / 2 + normal.x * displacement, (a[1] + b[1]) / 2 + normal.y * displacement];
  const nextAmplitude = amplitude * settings.amplitudeDecay;
  subdivideOriginalCoastlineEdge(a, middle, t0, tm, depth - 1, nextAmplitude, profile, rand, result, settings);
  result.push(middle);
  subdivideOriginalCoastlineEdge(middle, b, tm, t1, depth - 1, nextAmplitude, profile, rand, result, settings);
}

function isOnMapBorderPoint(point, map) {
  const width = map?.metadata?.graphWidth || 0;
  const height = map?.metadata?.graphHeight || 0;
  return point[0] <= 0 || point[1] <= 0 || point[0] >= width || point[1] >= height;
}

function buildOriginalCoastlineCurvePoints(shape, closed) {
  if (!closed) return sampleCatmullRomWorldPath(shape.points, false, ORIGINAL_COASTLINE_STYLE.jaggedSamples);
  const {points, origIndices} = shape;
  const count = points.length;
  const originalCount = origIndices.length;
  if (count < 3 || originalCount < 3) return points;

  const smooth = new Array(originalCount);
  for (let index = 0; index < originalCount; index++) {
    const a = origIndices[index];
    const b = origIndices[(index + 1) % originalCount];
    smooth[index] = (b > a ? b - a : b + count - a) === 1;
  }

  const output = [];
  const first = points[origIndices[0]];
  const last = points[origIndices[originalCount - 1]];
  let atMid = smooth[originalCount - 1];
  output.push(atMid ? midpoint(last, first) : first);

  for (let index = 0; index < originalCount; index++) {
    const currentIndex = origIndices[index];
    const nextIndex = origIndices[(index + 1) % originalCount];
    const current = points[currentIndex];
    if (smooth[index]) {
      const next = points[nextIndex];
      const end = midpoint(current, next);
      if (atMid) appendQuadraticSamples(output, current, end, ORIGINAL_COASTLINE_STYLE.smoothSamples);
      else appendPointIfDistinct(output, end);
      atMid = true;
      continue;
    }

    if (atMid) appendPointIfDistinct(output, current);
    const end = nextIndex > currentIndex ? nextIndex : nextIndex + count;
    for (let sampleIndex = currentIndex; sampleIndex < end; sampleIndex++) {
      const a = points[sampleIndex % count];
      const b = points[(sampleIndex + 1) % count];
      const previous = points[(sampleIndex - 1 + count) % count];
      const next = points[(sampleIndex + 2) % count];
      const cp1 = [a[0] + (b[0] - previous[0]) / 8, a[1] + (b[1] - previous[1]) / 8];
      const cp2 = [b[0] - (next[0] - a[0]) / 8, b[1] - (next[1] - a[1]) / 8];
      appendCubicSamples(output, cp1, cp2, b, ORIGINAL_COASTLINE_STYLE.jaggedSamples);
    }
    atMid = false;
  }

  appendPointIfDistinct(output, output[0]);
  return output;
}

function sampleCatmullRomWorldPath(points, closed, samplesPerSegment) {
  if (points.length < 3) return points;
  const output = [points[0]];
  const end = closed ? points.length : points.length - 1;
  for (let index = 0; index < end; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const previous = points[(index - 1 + points.length) % points.length] || a;
    const next = points[(index + 2) % points.length] || b;
    const cp1 = [a[0] + (b[0] - previous[0]) / 8, a[1] + (b[1] - previous[1]) / 8];
    const cp2 = [b[0] - (next[0] - a[0]) / 8, b[1] - (next[1] - a[1]) / 8];
    appendCubicSamples(output, cp1, cp2, b, samplesPerSegment);
  }
  return output;
}

function appendQuadraticSamples(output, control, end, samples) {
  const start = output[output.length - 1];
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const mt = 1 - t;
    appendPointIfDistinct(output, [
      mt * mt * start[0] + 2 * mt * t * control[0] + t * t * end[0],
      mt * mt * start[1] + 2 * mt * t * control[1] + t * t * end[1]
    ]);
  }
}

function appendCubicSamples(output, controlA, controlB, end, samples) {
  const start = output[output.length - 1];
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const mt = 1 - t;
    appendPointIfDistinct(output, [
      mt ** 3 * start[0] + 3 * mt * mt * t * controlA[0] + 3 * mt * t * t * controlB[0] + t ** 3 * end[0],
      mt ** 3 * start[1] + 3 * mt * mt * t * controlA[1] + 3 * mt * t * t * controlB[1] + t ** 3 * end[1]
    ]);
  }
}

function appendPointIfDistinct(points, point) {
  const previous = points[points.length - 1];
  if (!previous || !pointsNear(previous, point)) points.push(point);
}

function emptyShoreVisualPaths() {
  return {coastline: [], lakeShore: []};
}

function summarizeShoreVisualPaths(paths) {
  const coastlinePoints = countPathPoints(paths?.coastline);
  const lakeShorePoints = countPathPoints(paths?.lakeShore);
  return {
    coastlinePaths: paths?.coastline?.length || 0,
    lakeShorePaths: paths?.lakeShore?.length || 0,
    coastlinePoints,
    lakeShorePoints,
    bandWidthWorld: SHORE_VISUAL_STYLE.bandWidthWorld,
    smoothing: {...SHORE_VISUAL_STYLE.smoothing},
    coastlineStroke: [...SHORE_VISUAL_STYLE.coastlineStroke],
    lakeShoreStroke: [...SHORE_VISUAL_STYLE.lakeShoreStroke]
  };
}

function countPathPoints(paths = []) {
  return paths.reduce((sum, path) => sum + (path.points?.length || 0), 0);
}

function pushPoliticalVisualBands(vertices, map, paths, style) {
  for (const path of paths.boundaries) pushPoliticalVisualBand(vertices, path, map, style);
}

function pushPoliticalVisualBand(vertices, path, map, style) {
  const visual = buildSmoothedPoliticalVisual(path, map, style);
  if (!visual || visual.a.points.length < 2 || visual.b.points.length !== visual.a.points.length) return;

  for (let index = 0; index < visual.a.points.length - 1; index++) {
    const a0 = visual.a.points[index];
    const a1 = visual.a.points[index + 1];
    const b0 = visual.b.points[index];
    const b1 = visual.b.points[index + 1];
    const colorA0 = visual.a.colors[index];
    const colorA1 = visual.a.colors[index + 1];
    const colorB0 = visual.b.colors[index];
    const colorB1 = visual.b.colors[index + 1];
    pushWorldVertex(vertices, a0, map, colorA0);
    pushWorldVertex(vertices, b0, map, colorB0);
    pushWorldVertex(vertices, b1, map, colorB1);
    pushWorldVertex(vertices, a0, map, colorA0);
    pushWorldVertex(vertices, b1, map, colorB1);
    pushWorldVertex(vertices, a1, map, colorA1);
  }
}

function pushPoliticalVisualLines(vertices, paths, map, style) {
  for (const path of paths.boundaries) {
    const visual = buildSmoothedPoliticalVisual(path, map, style);
    if (!visual || visual.a.points.length < 2 || visual.b.points.length !== visual.a.points.length) continue;
    for (let index = 0; index < visual.a.points.length - 1; index++) {
      pushWorldLine(vertices, [midpoint(visual.a.points[index], visual.b.points[index]), midpoint(visual.a.points[index + 1], visual.b.points[index + 1])], map, style.borderStroke);
    }
  }
}

function buildSmoothedPoliticalVisual(path, map, style) {
  if (!path.points?.length || path.points.length !== path.sideVectors?.length) return null;
  const halfWidth = style.bandWidthWorld / 2;
  const pointsA = [];
  const pointsB = [];
  const colorsA = [];
  const colorsB = [];

  for (let index = 0; index < path.points.length; index++) {
    const point = path.points[index];
    const side = path.sideVectors[index] || {x: 0, y: 0};
    pointsA.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
    pointsB.push([point[0] - side.x * halfWidth, point[1] - side.y * halfWidth]);
    colorsA.push(style.colorForValue(path.valuesA[index], map));
    colorsB.push(style.colorForValue(path.valuesB[index], map));
  }

  return {
    a: smoothWorldPathAndColors(pointsA, colorsA, style.smoothing),
    b: smoothWorldPathAndColors(pointsB, colorsB, style.smoothing)
  };
}

function buildStateVisualPaths(map) {
  return {
    boundaries: buildPoliticalPathsFromEdges(collectPoliticalVisualEdges(map, "state"))
  };
}

function buildProvinceVisualPaths(map) {
  return {
    boundaries: buildPoliticalPathsFromEdges(collectPoliticalVisualEdges(map, "province"))
  };
}

function emptyPoliticalVisualPaths() {
  return {boundaries: []};
}

function summarizePoliticalVisualPaths(paths, style) {
  return {
    paths: paths?.boundaries?.length || 0,
    points: countPathPoints(paths?.boundaries),
    bandWidthWorld: style.bandWidthWorld,
    smoothing: {...style.smoothing},
    borderStroke: [...style.borderStroke]
  };
}

function buildPoliticalVisualMeshCache(map, field, paths, shorePaths, style) {
  const startedAt = performance.now();
  const groups = collectPoliticalVisualMeshGroups(map, field, paths, shorePaths, style);
  const vertices = [];
  const surfaceVertices = [];
  const quality = createPoliticalMeshQualityStats(map);
  let pointCount = 0;
  let candidateTriangles = 0;
  let keptTriangles = 0;
  let rejectedTriangles = 0;
  let longEdgeFilteredTriangles = 0;
  let skinnyFilteredTriangles = 0;
  let sampleFilteredTriangles = 0;
  let skippedGroups = 0;
  const groupStats = [];

  for (const group of groups.values()) {
    pointCount += group.points.length;
    if (group.points.length < 3) {
      skippedGroups++;
      groupStats.push({value: group.value, points: group.points.length, candidateTriangles: 0, keptTriangles: 0, rejectedTriangles: 0, skipped: true});
      continue;
    }

    const delaunay = Delaunator.from(group.points);
    const candidate = Math.floor(delaunay.triangles.length / 3);
    let kept = 0;
    let rejected = 0;
    let longEdgeFiltered = 0;
    let skinnyFiltered = 0;
    let sampleFiltered = 0;
    const groupQuality = createPoliticalMeshGroupQualityStats();
    for (let index = 0; index < delaunay.triangles.length; index += 3) {
      const a = group.points[delaunay.triangles[index]];
      const b = group.points[delaunay.triangles[index + 1]];
      const c = group.points[delaunay.triangles[index + 2]];
      const maxEdgeWorld = triangleMaxEdgeWorld(a, b, c);
      if (maxEdgeWorld > quality.longEdgeThresholdWorld) {
        longEdgeFiltered++;
        rememberPoliticalMeshNotableTriangle(quality, group.value, a, b, c, maxEdgeWorld, false, false, "long");
        continue;
      }
      if (shouldFilterPoliticalMeshSkinnyTriangle(quality, a, b, c, maxEdgeWorld)) {
        skinnyFiltered++;
        rememberPoliticalMeshNotableTriangle(quality, group.value, a, b, c, maxEdgeWorld, false, false, "skinny");
        continue;
      }
      const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      const picked = pickGridCell(map, centroid[0], centroid[1]);
      if (picked?.gridCell !== null && picked?.gridCell !== undefined && isLandCell(picked.gridCell, map) && (map.grid.cells[field]?.[picked.gridCell] || 0) === group.value) {
        const sampleStatus = inspectPoliticalMeshTriangleSamples(map, field, group.value, a, b, c);
        if (shouldFilterPoliticalMeshSampleTriangle(quality, maxEdgeWorld, sampleStatus)) {
          sampleFiltered++;
          rememberPoliticalMeshNotableTriangle(quality, group.value, a, b, c, maxEdgeWorld, sampleStatus.boundaryMismatch, sampleStatus.waterSample, "sample");
          continue;
        }
        kept++;
        addPoliticalMeshTriangleQuality(quality, groupQuality, map, field, group.value, a, b, c, maxEdgeWorld, sampleStatus);
        const surfaceColor = style.colorForValue(group.value, map);
        const debugColor = withAlpha(surfaceColor, style.meshAlpha ?? 0.7);
        pushWorldVertex(surfaceVertices, a, map, surfaceColor);
        pushWorldVertex(surfaceVertices, b, map, surfaceColor);
        pushWorldVertex(surfaceVertices, c, map, surfaceColor);
        pushWorldVertex(vertices, a, map, debugColor);
        pushWorldVertex(vertices, b, map, debugColor);
        pushWorldVertex(vertices, c, map, debugColor);
      } else {
        rejected++;
      }
    }

    candidateTriangles += candidate;
    keptTriangles += kept;
    rejectedTriangles += rejected;
    longEdgeFilteredTriangles += longEdgeFiltered;
    skinnyFilteredTriangles += skinnyFiltered;
    sampleFilteredTriangles += sampleFiltered;
    groupStats.push({
      value: group.value,
      points: group.points.length,
      candidateTriangles: candidate,
      keptTriangles: kept,
      rejectedTriangles: rejected,
      longEdgeFilteredTriangles: longEdgeFiltered,
      skinnyFilteredTriangles: skinnyFiltered,
      sampleFilteredTriangles: sampleFiltered,
      skipped: false,
      maxEdgeWorld: roundValue(groupQuality.maxEdgeWorld),
      longTriangleCount: groupQuality.longTriangleCount,
      boundaryMismatchTriangleCount: groupQuality.boundaryMismatchTriangleCount,
      waterSampleTriangleCount: groupQuality.waterSampleTriangleCount
    });
  }

  groupStats.sort((a, b) => b.keptTriangles - a.keptTriangles);
  return {
    field,
    groups: groups.size,
    pointCount,
    candidateTriangles,
    keptTriangles,
    rejectedTriangles,
    longEdgeFilteredTriangles,
    skinnyFilteredTriangles,
    sampleFilteredTriangles,
    skippedGroups,
    vertices: new Float32Array(vertices),
    surfaceVertices: new Float32Array(surfaceVertices),
    vertexCount: surfaceVertices.length / 6,
    quality: summarizePoliticalMeshQualityStats(quality, keptTriangles),
    buildMs: roundMs(performance.now() - startedAt),
    largestGroups: groupStats.slice(0, 8)
  };
}

function createPoliticalMeshQualityStats(map) {
  const averageGridSpacingWorld = estimateGridSpacingWorld(map);
  const longEdgeThresholdWorld = Math.max(averageGridSpacingWorld * 4.5, SHORE_VISUAL_STYLE.bandWidthWorld * 3);
  return {
    averageGridSpacingWorld,
    longEdgeThresholdWorld,
    maxEdgeWorld: 0,
    filteredLongTriangleCount: 0,
    filteredSkinnyTriangleCount: 0,
    filteredSampleTriangleCount: 0,
    longTriangleCount: 0,
    boundaryMismatchTriangleCount: 0,
    waterSampleTriangleCount: 0,
    notableTriangles: []
  };
}

function createPoliticalMeshGroupQualityStats() {
  return {
    maxEdgeWorld: 0,
    longTriangleCount: 0,
    boundaryMismatchTriangleCount: 0,
    waterSampleTriangleCount: 0
  };
}

function addPoliticalMeshTriangleQuality(quality, groupQuality, map, field, value, a, b, c, maxEdgeWorld = triangleMaxEdgeWorld(a, b, c), sampleStatus = inspectPoliticalMeshTriangleSamples(map, field, value, a, b, c)) {
  quality.maxEdgeWorld = Math.max(quality.maxEdgeWorld, maxEdgeWorld);
  groupQuality.maxEdgeWorld = Math.max(groupQuality.maxEdgeWorld, maxEdgeWorld);
  if (maxEdgeWorld > quality.longEdgeThresholdWorld) {
    quality.longTriangleCount++;
    groupQuality.longTriangleCount++;
  }

  const {boundaryMismatch, waterSample} = sampleStatus;

  if (boundaryMismatch) {
    quality.boundaryMismatchTriangleCount++;
    groupQuality.boundaryMismatchTriangleCount++;
  }
  if (waterSample) {
    quality.waterSampleTriangleCount++;
    groupQuality.waterSampleTriangleCount++;
  }
  if (maxEdgeWorld > quality.longEdgeThresholdWorld || boundaryMismatch || waterSample) {
    rememberPoliticalMeshNotableTriangle(quality, value, a, b, c, maxEdgeWorld, boundaryMismatch, waterSample, false);
  }
}

function inspectPoliticalMeshTriangleSamples(map, field, value, a, b, c) {
  const samples = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
  let boundaryMismatch = false;
  let waterSample = false;
  for (const sample of samples) {
    const picked = pickGridCell(map, sample[0], sample[1]);
    const cell = picked?.gridCell;
    if (cell === null || cell === undefined || !isLandCell(cell, map)) {
      waterSample = true;
      continue;
    }
    if ((map.grid.cells[field]?.[cell] || 0) !== value) boundaryMismatch = true;
  }
  return {boundaryMismatch, waterSample};
}

function shouldFilterPoliticalMeshSkinnyTriangle(quality, a, b, c, maxEdgeWorld) {
  const minAltitude = triangleMinAltitudeWorld(a, b, c, maxEdgeWorld);
  return maxEdgeWorld > quality.averageGridSpacingWorld * 1.5 && minAltitude < quality.averageGridSpacingWorld * 0.25;
}

function shouldFilterPoliticalMeshSampleTriangle(quality, maxEdgeWorld, sampleStatus) {
  const sampleThreshold = quality.averageGridSpacingWorld * 2.5;
  const waterThreshold = quality.averageGridSpacingWorld * 3.2;
  return (sampleStatus.boundaryMismatch && maxEdgeWorld > sampleThreshold) || (sampleStatus.waterSample && maxEdgeWorld > waterThreshold);
}

function triangleMaxEdgeWorld(a, b, c) {
  return Math.max(worldDistance(a, b), worldDistance(b, c), worldDistance(c, a));
}

function triangleMinAltitudeWorld(a, b, c, maxEdgeWorld = triangleMaxEdgeWorld(a, b, c)) {
  if (!maxEdgeWorld) return 0;
  return triangleDoubleAreaWorld(a, b, c) / maxEdgeWorld;
}

function triangleDoubleAreaWorld(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function rememberPoliticalMeshNotableTriangle(quality, value, a, b, c, maxEdgeWorld, boundaryMismatch, waterSample, filterReason) {
  if (filterReason === "long") quality.filteredLongTriangleCount++;
  if (filterReason === "skinny") quality.filteredSkinnyTriangleCount++;
  if (filterReason === "sample") quality.filteredSampleTriangleCount++;
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  const filtered = Boolean(filterReason);
  const score = maxEdgeWorld + (boundaryMismatch ? quality.longEdgeThresholdWorld : 0) + (waterSample ? quality.longEdgeThresholdWorld * 0.5 : 0) + (filtered ? quality.longEdgeThresholdWorld : 0);
  const item = {
    value,
    x: roundValue(centroid[0]),
    y: roundValue(centroid[1]),
    maxEdgeWorld: roundValue(maxEdgeWorld),
    boundaryMismatch,
    waterSample,
    filtered,
    filterReason: filterReason || null,
    score: roundValue(score)
  };
  quality.notableTriangles.push(item);
  quality.notableTriangles.sort((aItem, bItem) => bItem.score - aItem.score);
  if (quality.notableTriangles.length > 8) quality.notableTriangles.length = 8;
}

function summarizePoliticalMeshQualityStats(quality, keptTriangles) {
  return {
    averageGridSpacingWorld: roundValue(quality.averageGridSpacingWorld),
    longEdgeThresholdWorld: roundValue(quality.longEdgeThresholdWorld),
    maxEdgeWorld: roundValue(quality.maxEdgeWorld),
    filteredLongTriangleCount: quality.filteredLongTriangleCount,
    filteredSkinnyTriangleCount: quality.filteredSkinnyTriangleCount,
    filteredSampleTriangleCount: quality.filteredSampleTriangleCount,
    longTriangleCount: quality.longTriangleCount,
    longTriangleRatio: roundRatio(quality.longTriangleCount, keptTriangles),
    boundaryMismatchTriangleCount: quality.boundaryMismatchTriangleCount,
    boundaryMismatchRatio: roundRatio(quality.boundaryMismatchTriangleCount, keptTriangles),
    waterSampleTriangleCount: quality.waterSampleTriangleCount,
    waterSampleRatio: roundRatio(quality.waterSampleTriangleCount, keptTriangles),
    notableTriangles: quality.notableTriangles
  };
}

function estimateGridSpacingWorld(map) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  if (!cells?.i || !cells?.c || !points) return Math.sqrt((map?.metadata?.graphWidth || 1) * (map?.metadata?.graphHeight || 1) / 10000);
  let total = 0;
  let count = 0;
  for (const cell of cells.i) {
    const center = cellCenterPoint(map.grid, cell);
    if (!isWorldPoint(center)) continue;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const neighborCenter = cellCenterPoint(map.grid, neighbor);
      if (!isWorldPoint(neighborCenter)) continue;
      total += worldDistance(center, neighborCenter);
      count++;
      if (count >= 6000) return total / count;
    }
  }
  return count ? total / count : Math.sqrt((map?.metadata?.graphWidth || 1) * (map?.metadata?.graphHeight || 1) / Math.max(1, cells.i.length || 1));
}

function worldDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function collectPoliticalVisualMeshGroups(map, field, paths, shorePaths, style) {
  const groups = new Map();
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.[field]) return groups;

  for (const cell of cells.i) {
    if (!isLandCell(cell, map)) continue;
    const value = cells[field][cell] || 0;
    if (!value) continue;
    addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, value), cellCenterPoint(map.grid, cell));
  }

  for (const path of paths?.boundaries || []) {
    const visual = buildSmoothedPoliticalVisual(path, map, style);
    if (!visual) continue;
    const valueA = path.valuesA?.[0] || 0;
    const valueB = path.valuesB?.[0] || 0;
    if (valueA) for (const point of visual.a.points) addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, valueA), point);
    if (valueB) for (const point of visual.b.points) addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, valueB), point);
  }

  addShoreVisualMeshPoints(groups, map, field, shorePaths);

  return groups;
}

function addShoreVisualMeshPoints(groups, map, field, shorePaths) {
  for (const path of [...(shorePaths?.coastline || []), ...(shorePaths?.lakeShore || [])]) {
    const points = buildSmoothedShoreBoundaryPoints(path);
    for (const point of points) {
      const picked = pickGridCell(map, point[0], point[1]);
      const cell = picked?.gridCell;
      const value = cell !== null && cell !== undefined ? map.grid.cells[field]?.[cell] || 0 : 0;
      if (value) addPoliticalVisualMeshPoint(ensurePoliticalVisualMeshGroup(groups, value), point);
    }
  }
}

function buildSmoothedShoreBoundaryPoints(path) {
  if (!path?.points?.length || path.points.length !== path.sideVectors?.length) return [];
  const halfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const renderPoints = path.originalCoastlinePoints?.length ? path.originalCoastlinePoints : path.points;
  const points = [];

  for (let index = 0; index < renderPoints.length; index++) {
    const point = renderPoints[index];
    const sourceIndex = nearestPathSourceIndex(point, path.points);
    const side = path.sideVectors[sourceIndex] || {x: 0, y: 0};
    points.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
  }

  return smoothWorldPath(points, SHORE_VISUAL_STYLE.smoothing);
}

function ensurePoliticalVisualMeshGroup(groups, value) {
  if (!groups.has(value)) groups.set(value, {value, points: [], pointKeys: new Set()});
  return groups.get(value);
}

function addPoliticalVisualMeshPoint(group, point) {
  if (!isWorldPoint(point)) return;
  const key = `${Math.round(point[0] * 100)}:${Math.round(point[1] * 100)}`;
  if (group.pointKeys.has(key)) return;
  group.pointKeys.add(key);
  group.points.push([point[0], point[1]]);
}

function emptyPoliticalVisualMeshes() {
  return {
    states: emptyPoliticalVisualMeshCache("state"),
    provinces: emptyPoliticalVisualMeshCache("province")
  };
}

function emptyPoliticalVisualMeshCache(field) {
  return {
    field,
    groups: 0,
    pointCount: 0,
    candidateTriangles: 0,
    keptTriangles: 0,
    rejectedTriangles: 0,
    longEdgeFilteredTriangles: 0,
    skinnyFilteredTriangles: 0,
    sampleFilteredTriangles: 0,
    skippedGroups: 0,
    vertices: new Float32Array(),
    surfaceVertices: new Float32Array(),
    vertexCount: 0,
    quality: summarizePoliticalMeshQualityStats(createPoliticalMeshQualityStats(null), 0),
    buildMs: 0,
    largestGroups: []
  };
}

function summarizePoliticalVisualMeshes(meshes) {
  return {
    states: summarizePoliticalVisualMeshCache(meshes?.states),
    provinces: summarizePoliticalVisualMeshCache(meshes?.provinces)
  };
}

function summarizePoliticalVisualMeshCache(cache) {
  const safeCache = cache || emptyPoliticalVisualMeshCache("unknown");
  return {
    field: safeCache.field,
    groups: safeCache.groups,
    pointCount: safeCache.pointCount,
    candidateTriangles: safeCache.candidateTriangles,
    keptTriangles: safeCache.keptTriangles,
    rejectedTriangles: safeCache.rejectedTriangles,
    longEdgeFilteredTriangles: safeCache.longEdgeFilteredTriangles || 0,
    skinnyFilteredTriangles: safeCache.skinnyFilteredTriangles || 0,
    sampleFilteredTriangles: safeCache.sampleFilteredTriangles || 0,
    skippedGroups: safeCache.skippedGroups,
    vertexCount: safeCache.vertexCount,
    quality: safeCache.quality,
    buildMs: safeCache.buildMs,
    largestGroups: safeCache.largestGroups
  };
}

function normalizePoliticalMeshDebugMode(mode) {
  if (mode === "states" || mode === "state") return "states";
  if (mode === "provinces" || mode === "province") return "provinces";
  return "none";
}

function politicalMeshDebugCache(meshes, mode) {
  if (mode === "states") return meshes?.states;
  if (mode === "provinces") return meshes?.provinces;
  return null;
}

function collectPoliticalVisualEdges(map, field) {
  const edges = [];
  const cells = map?.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.[field]) return edges;

  for (const cell of cells.i || []) {
    if (!isLandCell(cell, map)) continue;
    const valueA = cells[field][cell] || 0;
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell || !isLandCell(neighbor, map)) continue;
      const valueB = cells[field][neighbor] || 0;
      if (valueA === valueB || (!valueA && !valueB)) continue;
      if (field !== "state" && (!valueA || !valueB)) continue;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (!edge) continue;
      const centerA = cellCenterPoint(map.grid, cell);
      const centerB = cellCenterPoint(map.grid, neighbor);
      const firstValue = Math.min(valueA, valueB);
      const secondValue = Math.max(valueA, valueB);
      const side = valueA === firstValue
        ? normalizeWorldVector(centerA[0] - centerB[0], centerA[1] - centerB[1])
        : normalizeWorldVector(centerB[0] - centerA[0], centerB[1] - centerA[1]);
      edges.push({
        a: edge[0],
        b: edge[1],
        pair: `${firstValue}:${secondValue}`,
        valueA: firstValue,
        valueB: secondValue,
        side
      });
    }
  }

  return edges;
}

function buildPoliticalPathsFromEdges(edges) {
  const graph = buildPoliticalGraph(edges);
  const paths = [];
  const visited = new Uint8Array(graph.edges.length);

  for (const node of graph.nodes.values()) {
    if (node.edges.length === 2) continue;
    for (const edgeIndex of node.edges) {
      if (visited[edgeIndex]) continue;
      paths.push(createPoliticalPath(graph, walkPoliticalPath(graph, node.key, edgeIndex, visited)));
    }
  }

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    if (visited[edgeIndex]) continue;
    paths.push(createPoliticalPath(graph, walkPoliticalPath(graph, graph.edges[edgeIndex].a, edgeIndex, visited)));
  }

  return paths.filter(path => path.points.length >= 2);
}

function buildPoliticalGraph(edges) {
  const nodes = new Map();
  const graphEdges = [];
  for (const edge of edges) {
    if (!isWorldPoint(edge.a) || !isWorldPoint(edge.b)) continue;
    const a = shorePointKey(edge.a);
    const b = shorePointKey(edge.b);
    if (a === b) continue;
    const edgeIndex = graphEdges.length;
    ensureShoreNode(nodes, a, edge.a).edges.push(edgeIndex);
    ensureShoreNode(nodes, b, edge.b).edges.push(edgeIndex);
    graphEdges.push({...edge, a, b});
  }
  return {nodes, edges: graphEdges};
}

function walkPoliticalPath(graph, startKey, firstEdgeIndex, visited) {
  const pair = graph.edges[firstEdgeIndex]?.pair;
  const keys = [startKey];
  const edgeIndexes = [];
  let currentKey = startKey;
  let edgeIndex = firstEdgeIndex;

  while (edgeIndex !== -1 && !visited[edgeIndex]) {
    visited[edgeIndex] = 1;
    edgeIndexes.push(edgeIndex);
    const edge = graph.edges[edgeIndex];
    const nextKey = edge.a === currentKey ? edge.b : edge.a;
    keys.push(nextKey);
    const nextNode = graph.nodes.get(nextKey);
    if (!nextNode || (nextNode.edges.length !== 2 && nextKey !== startKey)) break;
    currentKey = nextKey;
    edgeIndex = nextNode.edges.find(index => !visited[index] && graph.edges[index]?.pair === pair) ?? -1;
  }

  return {keys, edgeIndexes};
}

function createPoliticalPath(graph, walk) {
  const points = [];
  const sideVectors = [];
  const valuesA = [];
  const valuesB = [];

  for (let index = 0; index < walk.keys.length; index++) {
    const node = graph.nodes.get(walk.keys[index]);
    const adjacentEdges = [
      walk.edgeIndexes[index - 1],
      walk.edgeIndexes[index]
    ].filter(edgeIndex => edgeIndex !== undefined);
    const edge = graph.edges[adjacentEdges[0]] || graph.edges[walk.edgeIndexes[0]];
    points.push(node.point);
    sideVectors.push(averageEdgeSide(graph, adjacentEdges));
    valuesA.push(edge?.valueA ?? 0);
    valuesB.push(edge?.valueB ?? 0);
  }

  return {points, sideVectors, valuesA, valuesB};
}

function collectShoreVisualEdges(map) {
  const coastline = [];
  const lakeShore = [];
  const cells = map?.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.h) return {coastline, lakeShore};

  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const landCell = cellLand ? cell : neighbor;
      const waterCell = cellLand ? neighbor : cell;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (!edge) continue;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const target = waterFeature?.type === "ocean" ? coastline : lakeShore;
      const landCenter = cellCenterPoint(map.grid, landCell);
      const waterCenter = cellCenterPoint(map.grid, waterCell);
      const side = normalizeWorldVector(landCenter[0] - waterCenter[0], landCenter[1] - waterCenter[1]);
      target.push({
        a: edge[0],
        b: edge[1],
        landCell,
        waterCell,
        side
      });
    }
  }

  return {coastline, lakeShore};
}

function buildShorePathsFromEdges(edges) {
  const graph = buildShoreGraph(edges);
  const paths = [];
  const visited = new Uint8Array(graph.edges.length);

  for (const node of graph.nodes.values()) {
    if (node.edges.length === 2) continue;
    for (const edgeIndex of node.edges) {
      if (visited[edgeIndex]) continue;
      paths.push(createShorePath(graph, walkShorePath(graph, node.key, edgeIndex, visited)));
    }
  }

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    if (visited[edgeIndex]) continue;
    paths.push(createShorePath(graph, walkShorePath(graph, graph.edges[edgeIndex].a, edgeIndex, visited)));
  }

  return paths.filter(path => path.points.length >= 2);
}

function buildShoreGraph(edges) {
  const nodes = new Map();
  const graphEdges = [];
  for (const edge of edges) {
    if (!isWorldPoint(edge.a) || !isWorldPoint(edge.b)) continue;
    const a = shorePointKey(edge.a);
    const b = shorePointKey(edge.b);
    if (a === b) continue;
    const edgeIndex = graphEdges.length;
    ensureShoreNode(nodes, a, edge.a).edges.push(edgeIndex);
    ensureShoreNode(nodes, b, edge.b).edges.push(edgeIndex);
    graphEdges.push({...edge, a, b});
  }
  return {nodes, edges: graphEdges};
}

function ensureShoreNode(nodes, key, point) {
  if (!nodes.has(key)) nodes.set(key, {key, point: [point[0], point[1]], edges: []});
  return nodes.get(key);
}

function shorePointKey(point) {
  return `${Math.round(point[0] * 1000)}:${Math.round(point[1] * 1000)}`;
}

function walkShorePath(graph, startKey, firstEdgeIndex, visited) {
  const keys = [startKey];
  const edgeIndexes = [];
  let currentKey = startKey;
  let edgeIndex = firstEdgeIndex;

  while (edgeIndex !== -1 && !visited[edgeIndex]) {
    visited[edgeIndex] = 1;
    edgeIndexes.push(edgeIndex);
    const edge = graph.edges[edgeIndex];
    const nextKey = edge.a === currentKey ? edge.b : edge.a;
    keys.push(nextKey);
    const nextNode = graph.nodes.get(nextKey);
    if (!nextNode || (nextNode.edges.length !== 2 && nextKey !== startKey)) break;
    currentKey = nextKey;
    edgeIndex = nextNode.edges.find(index => !visited[index]) ?? -1;
  }

  return {keys, edgeIndexes};
}

function createShorePath(graph, walk) {
  const points = [];
  const sideVectors = [];
  const landCells = [];
  const waterCells = [];

  for (let index = 0; index < walk.keys.length; index++) {
    const node = graph.nodes.get(walk.keys[index]);
    const adjacentEdges = [
      walk.edgeIndexes[index - 1],
      walk.edgeIndexes[index]
    ].filter(edgeIndex => edgeIndex !== undefined);
    const edge = graph.edges[adjacentEdges[0]] || graph.edges[walk.edgeIndexes[0]];
    points.push(node.point);
    sideVectors.push(averageEdgeSide(graph, adjacentEdges));
    landCells.push(edge?.landCell ?? 0);
    waterCells.push(edge?.waterCell ?? 0);
  }

  return {points, sideVectors, landCells, waterCells};
}

function averageEdgeSide(graph, edgeIndexes) {
  let x = 0;
  let y = 0;
  for (const edgeIndex of edgeIndexes) {
    const side = graph.edges[edgeIndex]?.side;
    if (!side) continue;
    x += side.x;
    y += side.y;
  }
  return normalizeWorldVector(x, y);
}

function cellCenterPoint(grid, cell) {
  return grid.points[grid.cells.p?.[cell]] || [0, 0];
}

function normalizeWorldVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.000001) return {x: 0, y: 0};
  return {x: x / length, y: y / length};
}

function interpolatePoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function pointsNear(a, b) {
  if (!isWorldPoint(a) || !isWorldPoint(b)) return false;
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.001;
}

function smoothWorldPath(points, options) {
  return smoothWorldPathWithValues(points, null, options).points;
}

function smoothWorldPathAndColors(points, colors, {iterations = 1, factor = 0.2} = {}) {
  if (points.length < 3 || iterations <= 0) return {
    points,
    colors
  };

  const closed = pointsNear(points[0], points[points.length - 1]);
  let resultPoints = closed ? points.slice(0, -1) : [...points];
  let resultColors = closed ? colors.slice(0, -1) : [...colors];
  if (resultPoints.length < 3) return {points, colors};

  for (let index = 0; index < iterations; index++) {
    const result = chaikinWorldPathAndColors(resultPoints, resultColors, factor, closed);
    resultPoints = result.points;
    resultColors = result.colors;
    if (resultPoints.length < 3) break;
  }

  if (closed) {
    resultPoints = [...resultPoints, resultPoints[0]];
    resultColors = [...resultColors, resultColors[0]];
  }

  return {
    points: resultPoints,
    colors: resultColors
  };
}

function chaikinWorldPathAndColors(points, colors, factor, closed) {
  const nextPoints = [];
  const nextColors = [];
  const count = points.length;
  if (!closed) {
    nextPoints.push(points[0]);
    nextColors.push(colors[0]);
  }

  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index++) {
    const a = points[index];
    const b = points[(index + 1) % count];
    const colorA = colors[index];
    const colorB = colors[(index + 1) % count];
    nextPoints.push(interpolateWorldPoint(a, b, factor));
    nextPoints.push(interpolateWorldPoint(a, b, 1 - factor));
    nextColors.push(interpolateColor(colorA, colorB, factor));
    nextColors.push(interpolateColor(colorA, colorB, 1 - factor));
  }

  if (!closed) {
    nextPoints.push(points[count - 1]);
    nextColors.push(colors[count - 1]);
  }

  return {points: nextPoints, colors: nextColors};
}

function smoothWorldPathWithValues(points, values, {iterations = 1, factor = 0.2} = {}) {
  const sourcePoints = (points || []).filter(isWorldPoint);
  if (sourcePoints.length < 3 || iterations <= 0) return {
    points: sourcePoints,
    widths: values || []
  };

  let resultPoints = sourcePoints.map(point => Array.isArray(point) ? [...point] : point);
  let resultValues = Array.isArray(values) ? [...values] : null;

  for (let index = 0; index < iterations; index++) {
    const result = chaikinOpenWorldPath(resultPoints, resultValues, factor);
    resultPoints = result.points;
    resultValues = result.values;
    if (resultPoints.length < 3) break;
  }

  return {
    points: resultPoints,
    widths: resultValues || values || []
  };
}

function chaikinOpenWorldPath(points, values, factor) {
  const nextPoints = [points[0]];
  const nextValues = values ? [values[0]] : null;

  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    nextPoints.push(interpolateWorldPoint(a, b, factor));
    nextPoints.push(interpolateWorldPoint(a, b, 1 - factor));
    if (nextValues) {
      nextValues.push(interpolateValue(values[index], values[index + 1], factor));
      nextValues.push(interpolateValue(values[index], values[index + 1], 1 - factor));
    }
  }

  nextPoints.push(points[points.length - 1]);
  if (nextValues) nextValues.push(values[values.length - 1]);
  return {points: nextPoints, values: nextValues};
}

function interpolateWorldPoint(a, b, t) {
  const point = interpolatePoint(a, b, t);
  if (Number.isFinite(a?.[2]) || Number.isFinite(b?.[2])) point[2] = interpolateValue(a?.[2], b?.[2], t);
  return point;
}

function interpolateValue(a, b, t) {
  const av = Number.isFinite(a) ? a : b;
  const bv = Number.isFinite(b) ? b : a;
  if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
  if (!Number.isFinite(av)) return bv;
  if (!Number.isFinite(bv)) return av;
  return av + (bv - av) * t;
}

function buildRiverMeshVertices(map, camera, canvas) {
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
    pushVariableScreenPolyline(vertices, points, widths, map, camera, canvas, riverRenderColor(river));
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
  const vertices = [];
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  for (const route of map.settlements.routes) {
    const selected = selection?.kind === OBJECT_KIND.ROUTE && selection.id === route.id;
    const style = routeStyle(route);
    const color = selected ? [1, 0.82, 0.34, 1] : style.color;
    const baseWidth = style.width;
    const widthPx = (selected ? baseWidth + 2.4 : baseWidth) * pixelRatio;
    const dash = !selected && style.dash ? {dashPx: style.dash[0] * pixelRatio, gapPx: style.dash[1] * pixelRatio} : null;
    pushScreenPolyline(vertices, smoothWorldPath(route.points, LINE_SMOOTHING.route), map, camera, canvas, color, widthPx, dash);
  }
  return new Float32Array(vertices);
}

function routeStyle(route) {
  if (route.level === "primary") return {color: [0.68, 0.49, 0.24, 1], width: 3.8};
  if (route.level === "secondary") return {color: [0.58, 0.42, 0.24, 0.98], width: 2.8};
  return {color: [0.45, 0.35, 0.22, 0.94], width: 2.1, dash: [9, 6]};
}

const SELECTION_HIGHLIGHT_COLORS = Object.freeze({
  [OBJECT_KIND.STATE]: [1, 0.86, 0.28, 0.3],
  [OBJECT_KIND.PROVINCE]: [0.9, 0.7, 0.28, 0.34],
  [OBJECT_KIND.CULTURE]: [0.72, 0.95, 0.62, 0.3],
  [OBJECT_KIND.RELIGION]: [0.96, 0.68, 0.95, 0.3],
  [OBJECT_KIND.REGION]: [0.65, 0.9, 1, 0.28]
});

const SELECTION_HIGHLIGHT_MODES = Object.freeze({
  [OBJECT_KIND.RIVER]: "river screen-space mesh",
  [OBJECT_KIND.STATE]: "state translucent cells",
  [OBJECT_KIND.PROVINCE]: "province translucent cells",
  [OBJECT_KIND.CULTURE]: "culture translucent cells",
  [OBJECT_KIND.RELIGION]: "religion translucent cells",
  [OBJECT_KIND.REGION]: "region translucent cells"
});

function buildSelectionMeshVertices(map, camera, canvas, selection, locateFlash) {
  const vertices = [];
  if (isPoliticalObjectKind(selection?.kind)) {
    pushPoliticalSelectionMesh(vertices, map, camera, canvas, selection, locateFlash);
    return new Float32Array(vertices);
  }
  if (selection?.kind !== OBJECT_KIND.RIVER) return new Float32Array(vertices);
  const river = map.rivers.rivers.find(item => item.id === selection.id);
  if (!river || river.points.length < 2) return new Float32Array(vertices);
  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  const maxFlux = Math.max(1, map.rivers.metadata.maxFlux || river.flux || 1);
  const fluxFactor = Math.sqrt(Math.max(0, river.flux || 0) / maxFlux);
  const widthPx = (4.2 + fluxFactor * 2.4) * pixelRatio;
  const color = locateFlashColor(selection, locateFlash) || [0.62, 0.88, 1, 1];
  pushScreenPolyline(vertices, smoothWorldPath(river.points, LINE_SMOOTHING.riverSelection), map, camera, canvas, color, widthPx);
  return new Float32Array(vertices);
}

function pushPoliticalSelectionMesh(vertices, map, camera, canvas, selection, locateFlash) {
  const field = POLITICAL_OBJECT_FIELD[selection.kind] || POLITICAL_OBJECT_FIELD[OBJECT_KIND.REGION];
  const color = locateFlashColor(selection, locateFlash) || SELECTION_HIGHLIGHT_COLORS[selection.kind] || SELECTION_HIGHLIGHT_COLORS[OBJECT_KIND.REGION];
  for (let cellIndex = 0; cellIndex < map.grid.cells.v.length; cellIndex++) {
    if (map.grid.cells[field][cellIndex] !== selection.id) continue;
    const vertexIds = map.grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const center = worldToScreenPixel(map.grid.points[map.grid.cells.p[cellIndex]], map, camera, canvas);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushScreenTriangle(vertices, center, worldToScreenPixel(map.grid.vertices.p[vertexIds[index]], map, camera, canvas), worldToScreenPixel(map.grid.vertices.p[vertexIds[nextIndex]], map, camera, canvas), canvas, color);
    }
  }
}

function selectionHighlightMode(selection, locateFlash = null) {
  if (!selection) return "none";
  if (isLocateFlashActive(selection, locateFlash)) return `${selection.kind} red flash`;
  return SELECTION_HIGHLIGHT_MODES[selection.kind] || selection.kind;
}

function locateFlashColor(selection, locateFlash) {
  if (!isLocateFlashActive(selection, locateFlash)) return null;
  const phase = (performance.now() / 180) % 2;
  const alpha = phase < 1 ? 1 : 0.38;
  return [1, 0.12, 0.08, alpha];
}

function isLocateFlashActive(selection, locateFlash) {
  return Boolean(selection && locateFlash && selection.kind === locateFlash.kind && selection.id === locateFlash.id && performance.now() <= locateFlash.until);
}

function buildPointVertices(map, visibility = {}) {
  const vertices = [];
  if (visibility.population !== false) {
    for (const point of map.settlements.populationPoints) {
      const alpha = Math.min(0.8, 0.25 + point.population / Math.max(1, map.settlements.metadata.maxPopulation));
      pushWorldVertex(vertices, point.point, map, [0.25, 0.42, 0.24, alpha]);
    }
  }
  if (visibility.cities !== false) {
    for (const city of map.settlements.cities) {
      const color = city.capital ? [0.98, 0.82, 0.32, 1] : city.port ? [0.35, 0.72, 0.95, 1] : [0.92, 0.72, 0.38, 1];
      pushWorldVertex(vertices, [city.x, city.y], map, color);
    }
  }
  if (visibility.markers !== false) {
    for (const marker of map.markers.markers) {
      pushWorldVertex(vertices, [marker.x, marker.y], map, colorForMarker(marker));
    }
  }
  return new Float32Array(vertices);
}

function colorForMarker(marker) {
  if (marker.type === "peak") return [0.94, 0.94, 0.88, 1];
  if (marker.type === "river-source") return [0.5, 0.82, 1, 1];
  if (marker.type === "state-center") return [1, 0.68, 0.28, 1];
  return [0.9, 0.9, 0.9, 1];
}

function pushRect(vertices, left, bottom, right, top, color) {
  pushVertex(vertices, left, bottom, color);
  pushVertex(vertices, right, bottom, color);
  pushVertex(vertices, right, top, color);
  pushVertex(vertices, left, bottom, color);
  pushVertex(vertices, right, top, color);
  pushVertex(vertices, left, top, color);
}

function pushGridCells(vertices, map, colorMode, viewOptions, shouldDrawCell = () => true) {
  const grid = map.grid;
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
    if (!shouldDrawCell(cellIndex)) continue;
    const vertexIds = grid.cells.v[cellIndex];
    if (vertexIds.length < 3) continue;
    const center = grid.points[grid.cells.p[cellIndex]];
    const color = colorForCell(cellIndex, map, colorMode, viewOptions);
    for (let index = 0; index < vertexIds.length; index++) {
      const nextIndex = (index + 1) % vertexIds.length;
      pushWorldVertex(vertices, center, map, color);
      pushWorldVertex(vertices, grid.vertices.p[vertexIds[index]], map, color);
      pushWorldVertex(vertices, grid.vertices.p[vertexIds[nextIndex]], map, color);
    }
  }
}

function pushWorldLine(vertices, segment, map, color) {
  pushWorldVertex(vertices, segment[0], map, color);
  pushWorldVertex(vertices, segment[1], map, color);
}

function pushWorldPolylineMesh(vertices, points, map, color, widthWorld, {closed = false, joinSegments = 10} = {}) {
  const source = normalizeWorldPathPoints(points);
  if (source.length < 2) return;
  const ringClosed = closed && source.length > 2;
  const path = ringClosed && pointsNear(source[0], source[source.length - 1]) ? source.slice(0, -1) : source;
  const radius = Math.max(0.05, widthWorld / 2);
  const segmentCount = ringClosed ? path.length : path.length - 1;

  for (let index = 0; index < segmentCount; index++) {
    const start = path[index];
    const end = path[(index + 1) % path.length];
    pushWorldLineQuad(vertices, start, end, map, color, radius);
  }

  for (let index = 0; index < path.length; index++) {
    const isCap = !ringClosed && (index === 0 || index === path.length - 1);
    pushWorldCircle(vertices, path[index], radius, map, color, isCap ? Math.max(8, joinSegments) : joinSegments);
  }
}

function pushWorldLineQuad(vertices, start, end, map, color, halfWidth) {
  if (!isWorldPoint(start) || !isWorldPoint(end)) return;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return;
  const nx = -dy / length;
  const ny = dx / length;
  const a = [start[0] + nx * halfWidth, start[1] + ny * halfWidth];
  const b = [end[0] + nx * halfWidth, end[1] + ny * halfWidth];
  const c = [end[0] - nx * halfWidth, end[1] - ny * halfWidth];
  const d = [start[0] - nx * halfWidth, start[1] - ny * halfWidth];
  pushWorldVertex(vertices, a, map, color);
  pushWorldVertex(vertices, b, map, color);
  pushWorldVertex(vertices, c, map, color);
  pushWorldVertex(vertices, a, map, color);
  pushWorldVertex(vertices, c, map, color);
  pushWorldVertex(vertices, d, map, color);
}

function pushWorldCircle(vertices, center, radius, map, color, segments = 10) {
  if (!isWorldPoint(center)) return;
  const count = Math.max(6, Math.round(segments));
  for (let index = 0; index < count; index++) {
    const a = (index / count) * Math.PI * 2;
    const b = ((index + 1) / count) * Math.PI * 2;
    pushWorldVertex(vertices, center, map, color);
    pushWorldVertex(vertices, [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius], map, color);
    pushWorldVertex(vertices, [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius], map, color);
  }
}

function pushScreenPolyline(vertices, points, map, camera, canvas, color, widthPx, dash = null) {
  const screenPoints = points
    .map(point => worldToScreenPixel(point, map, camera, canvas))
    .filter((point, index, list) => index === 0 || Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) > 0.5);
  if (screenPoints.length < 2) return;
  if (dash) {
    pushDashedScreenPolyline(vertices, screenPoints, canvas, color, widthPx, dash);
    return;
  }
  pushSolidScreenPolyline(vertices, screenPoints, canvas, color, widthPx);
}

function pushVariableScreenPolyline(vertices, points, widths, map, camera, canvas, color) {
  const screenPoints = [];
  const screenWidths = [];
  for (let index = 0; index < points.length; index++) {
    const screenPoint = worldToScreenPixel(points[index], map, camera, canvas);
    const previous = screenPoints[screenPoints.length - 1];
    if (previous && Math.hypot(screenPoint.x - previous.x, screenPoint.y - previous.y) <= 0.5) continue;
    screenPoints.push(screenPoint);
    screenWidths.push(widths[index] || widths[widths.length - 1] || 1);
  }
  if (screenPoints.length < 2) return;
  pushVariableSolidScreenPolyline(vertices, screenPoints, screenWidths, canvas, color);
}

function pushDashedScreenPolyline(vertices, screenPoints, canvas, color, widthPx, dash) {
  const pattern = dash.dashPx + dash.gapPx;
  let phase = 0;
  for (let index = 0; index < screenPoints.length - 1; index++) {
    const start = screenPoints[index];
    const end = screenPoints[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.5) continue;
    let position = 0;
    while (position < length) {
      const phaseInPattern = phase % pattern;
      const drawing = phaseInPattern < dash.dashPx;
      const remainingPattern = (drawing ? dash.dashPx : pattern) - phaseInPattern;
      const step = Math.min(remainingPattern, length - position);
      if (drawing && step > 0.5) {
        pushSolidScreenPolyline(vertices, [
          interpolateScreenPoint(start, dx, dy, position / length),
          interpolateScreenPoint(start, dx, dy, (position + step) / length)
        ], canvas, color, widthPx);
      }
      position += step;
      phase += step;
    }
  }
}

function pushSolidScreenPolyline(vertices, screenPoints, canvas, color, widthPx) {
  const half = widthPx / 2;
  const left = [];
  const right = [];

  for (let index = 0; index < screenPoints.length; index++) {
    const previous = screenPoints[Math.max(0, index - 1)];
    const current = screenPoints[index];
    const next = screenPoints[Math.min(screenPoints.length - 1, index + 1)];
    const before = normalizeScreenVector(current.x - previous.x, current.y - previous.y);
    const after = normalizeScreenVector(next.x - current.x, next.y - current.y);
    const blended = normalizeScreenVector(before.x + after.x, before.y + after.y);
    const tangent = index === 0 ? after : index === screenPoints.length - 1 ? before : (blended.x || blended.y ? blended : after);
    const normalBefore = normalForVector(before.x || after.x, before.y || after.y);
    const normalAfter = normalForVector(after.x || before.x, after.y || before.y);
    const miter = normalForVector(tangent.x, tangent.y);
    const dot = Math.max(0.3, Math.abs(miter.x * normalAfter.x + miter.y * normalAfter.y));
    const length = Math.min(half / dot, half * 2.6);
    const capShift = index === 0 ? -half : index === screenPoints.length - 1 ? half : 0;
    const capBase = {
      x: current.x + tangent.x * capShift,
      y: current.y + tangent.y * capShift
    };
    const normal = index === 0 ? normalAfter : index === screenPoints.length - 1 ? normalBefore : miter;
    left.push({x: capBase.x + normal.x * length, y: capBase.y + normal.y * length});
    right.push({x: capBase.x - normal.x * length, y: capBase.y - normal.y * length});
  }

  for (let index = 0; index < left.length - 1; index++) {
    pushScreenTriangle(vertices, left[index], left[index + 1], right[index + 1], canvas, color);
    pushScreenTriangle(vertices, left[index], right[index + 1], right[index], canvas, color);
  }
}

function pushVariableSolidScreenPolyline(vertices, screenPoints, widthPxByPoint, canvas, color) {
  const left = [];
  const right = [];

  for (let index = 0; index < screenPoints.length; index++) {
    const half = Math.max(0.5, widthPxByPoint[index] / 2);
    const previous = screenPoints[Math.max(0, index - 1)];
    const current = screenPoints[index];
    const next = screenPoints[Math.min(screenPoints.length - 1, index + 1)];
    const before = normalizeScreenVector(current.x - previous.x, current.y - previous.y);
    const after = normalizeScreenVector(next.x - current.x, next.y - current.y);
    const blended = normalizeScreenVector(before.x + after.x, before.y + after.y);
    const tangent = index === 0 ? after : index === screenPoints.length - 1 ? before : (blended.x || blended.y ? blended : after);
    const normalBefore = normalForVector(before.x || after.x, before.y || after.y);
    const normalAfter = normalForVector(after.x || before.x, after.y || before.y);
    const miter = normalForVector(tangent.x, tangent.y);
    const dot = Math.max(0.3, Math.abs(miter.x * normalAfter.x + miter.y * normalAfter.y));
    const length = Math.min(half / dot, half * 2.6);
    const capShift = index === 0 ? -half : index === screenPoints.length - 1 ? half : 0;
    const capBase = {
      x: current.x + tangent.x * capShift,
      y: current.y + tangent.y * capShift
    };
    const normal = index === 0 ? normalAfter : index === screenPoints.length - 1 ? normalBefore : miter;
    left.push({x: capBase.x + normal.x * length, y: capBase.y + normal.y * length});
    right.push({x: capBase.x - normal.x * length, y: capBase.y - normal.y * length});
  }

  for (let index = 0; index < left.length - 1; index++) {
    pushScreenTriangle(vertices, left[index], left[index + 1], right[index + 1], canvas, color);
    pushScreenTriangle(vertices, left[index], right[index + 1], right[index], canvas, color);
  }
}

function interpolateScreenPoint(start, dx, dy, t) {
  return {
    x: start.x + dx * t,
    y: start.y + dy * t
  };
}

function pushScreenTriangle(vertices, a, b, c, canvas, color) {
  pushScreenVertex(vertices, a, canvas, color);
  pushScreenVertex(vertices, b, canvas, color);
  pushScreenVertex(vertices, c, canvas, color);
}

function pushScreenVertex(vertices, point, canvas, color) {
  const clip = screenPixelToClip(point, canvas);
  pushVertex(vertices, clip[0], clip[1], color);
}

function worldToScreenPixel(point, map, camera, canvas) {
  const [x, y] = worldToNdcPoint(point, map);
  const clipX = x * camera.scale + camera.offsetX;
  const clipY = y * camera.scale + camera.offsetY;
  return {
    x: ((clipX + 1) / 2) * canvas.width,
    y: ((1 - clipY) / 2) * canvas.height
  };
}

function screenPixelToClip(point, canvas) {
  return [(point.x / canvas.width) * 2 - 1, 1 - (point.y / canvas.height) * 2];
}

function normalizeScreenVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.000001) return {x: 0, y: 0};
  return {x: x / length, y: y / length};
}

function normalForVector(x, y) {
  const vector = normalizeScreenVector(x, y);
  return {x: -vector.y, y: vector.x};
}

function pushVertex(vertices, x, y, color) {
  vertices.push(x, y, color[0], color[1], color[2], color[3]);
}

function pushWorldVertex(vertices, point, map, color) {
  const [x, y] = worldToNdcPoint(point, map);
  pushVertex(vertices, x, y, color);
}

function worldToNdcPoint(point, map) {
  const x = (point[0] / map.metadata.graphWidth) * 2 - 1;
  const y = 1 - (point[1] / map.metadata.graphHeight) * 2;
  return [x, y];
}

function isWorldPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function colorForCell(cellIndex, map, colorMode, viewOptions = {}) {
  if (colorMode !== "height" && colorMode !== "temperature" && !isLandCell(cellIndex, map)) {
    return colorForHeight(map.grid.cells.h[cellIndex], map.layers);
  }
  if (colorMode === "temperature") return colorForTemperature(map.grid.cells.temp[cellIndex]);
  if (colorMode === "precipitation") return colorForPrecipitation(map.grid.cells.prec[cellIndex]);
  if (colorMode === "biomes") return colorForBiome(map.grid.cells.biome[cellIndex], map);
  if (colorMode === "cultures") return colorForCulture(map.grid.cells.culture[cellIndex], map);
  if (colorMode === "religions") return colorForReligion(map.grid.cells.religion[cellIndex], map);
  if (colorMode === "states") return colorForState(map.grid.cells.state[cellIndex], map);
  if (colorMode === "provinces") return colorForProvince(map.grid.cells.province[cellIndex], map);
  if (colorMode === "regions") return indexedColorOrWater(map.grid.cells.region[cellIndex], 0.77, map.layers.ocean);
  if (colorMode === "population") return colorForPopulation(map.grid.cells.pop[cellIndex], map);
  return colorForHeight(map.grid.cells.h[cellIndex], map.layers, viewOptions);
}

function isLandCell(cellIndex, map) {
  const featureId = map.grid.cells.f?.[cellIndex];
  return Boolean(map.features.features[featureId]?.land);
}

function colorForHeight(height, layers, viewOptions = {}) {
  if (height < 20) return viewOptions.showOceanHeight ? colorForOceanHeight(height, layers) : layers.ocean;
  if (height < 36) return mix([0.33, 0.52, 0.32, 1], [0.52, 0.61, 0.38, 1], (height - 20) / 16);
  if (height < 56) return mix([0.52, 0.61, 0.38, 1], [0.64, 0.6, 0.43, 1], (height - 36) / 20);
  if (height < 76) return mix([0.64, 0.6, 0.43, 1], [0.7, 0.66, 0.54, 1], (height - 56) / 20);
  if (height < 92) return mix([0.7, 0.66, 0.54, 1], [0.77, 0.75, 0.68, 1], (height - 76) / 16);
  return mix([0.77, 0.75, 0.68, 1], [0.83, 0.82, 0.78, 1], Math.min(1, (height - 92) / 8));
}

function colorForOceanHeight(height, layers) {
  const t = Math.max(0, Math.min(1, height / 20));
  const deep = mix(layers.ocean, [0.01, 0.04, 0.14, 1], 0.72);
  const shelf = mix(layers.ocean, [0.38, 0.68, 0.82, 1], 0.42);
  return mix(deep, shelf, t ** 0.75);
}

function colorForTemperature(temp) {
  const t = Math.max(0, Math.min(1, (temp + 18) / 54));
  return mix([0.2, 0.38, 0.72, 1], [0.82, 0.32, 0.2, 1], t);
}

function colorForPrecipitation(prec) {
  const t = Math.max(0, Math.min(1, prec / 100));
  return mix([0.72, 0.62, 0.36, 1], [0.16, 0.48, 0.68, 1], t);
}

function colorForBiome(biomeId, map) {
  return map.climate.biomes[biomeId]?.color || [0.5, 0.5, 0.5, 1];
}

function colorForState(stateId, map) {
  if (stateId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  if (!stateId) return [0.58, 0.6, 0.58, 1];
  return hexToRgba(map.politics.states[stateId]?.color) || indexedColor(stateId, 0.12);
}

function colorForCulture(cultureId, map) {
  if (cultureId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  return hexToRgba(map.society.cultures[cultureId]?.color) || indexedColor(cultureId, 0.31);
}

function colorForReligion(religionId, map) {
  if (religionId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  return hexToRgba(map.society.religions[religionId]?.color) || indexedColor(religionId, 0.63);
}

function colorForProvince(provinceId, map) {
  if (provinceId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  if (!provinceId) return [0.58, 0.6, 0.58, 1];
  return hexToRgba(map.politics.provinces[provinceId]?.color) || indexedColor(provinceId, 0.46);
}

function colorForPopulation(population, map) {
  if (!population) return mix(map.layers.ocean, [0.06, 0.1, 0.08, 1], 0.4);
  const t = Math.min(1, population / Math.max(1, map.settlements.metadata.maxPopulation));
  return mix([0.2, 0.36, 0.24, 1], [0.92, 0.72, 0.34, 1], Math.sqrt(t));
}

function indexedColor(index, offset) {
  const hue = (index * 0.61803398875 + offset) % 1;
  return hslToRgb(hue, 0.42, 0.56);
}

function indexedColorOrWater(index, offset, waterColor) {
  if (index < 0) return mix(waterColor, [0.05, 0.08, 0.1, 1], 0.3);
  return indexedColor(index, offset);
}

function hexToRgba(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
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

function hslToRgb(h, s, l) {
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3), 1];
}

function bindVertexBuffer(gl, locations) {
  const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.color);
  gl.vertexAttribPointer(locations.color, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    1
  ];
}

function withAlpha(color, alpha) {
  return [color?.[0] ?? 0, color?.[1] ?? 0, color?.[2] ?? 0, alpha];
}

function interpolateColor(a, b, t) {
  return mix(a, b, t);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
  }
  return shader;
}

function lockCanvasToInitialDisplaySize(canvas, overlay = null) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || canvas.parentElement?.clientWidth || 1));
  const cssHeight = Math.max(1, Math.round(rect.height || canvas.clientHeight || canvas.parentElement?.clientHeight || 1));
  const pixelRatio = window.devicePixelRatio || 1;
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

function roundValue(value) {
  return Math.round(value * 10) / 10;
}

function roundRatio(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 1000;
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec4 a_color;
uniform float u_scale;
uniform vec2 u_offset;
out vec4 v_color;

void main() {
  v_color = a_color;
  gl_PointSize = 4.0;
  gl_Position = vec4(a_position * u_scale + u_offset, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}`;
