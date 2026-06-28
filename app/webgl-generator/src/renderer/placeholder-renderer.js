import {buildObjectPickingIndex, pickCity, pickGridCell, pickMarker, pickPoliticalObject, pickRiver, pickRoute} from "./picking.js";
import {LABEL_TARGET_KIND, OBJECT_KIND, POLITICAL_OBJECT_FIELD, isPointObjectKind, isPoliticalObjectKind} from "../runtime/object-kinds.js";
import {isGeneratedLabelHidden} from "../runtime/label-edit-commands.js";

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
    this.vertexCount = 0;
    this.routeVertexCount = 0;
    this.riverVertexCount = 0;
    this.selectionVertexCount = 0;
    this.lineVertexCount = 0;
    this.pointVertexCount = 0;
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
    this.shoreVisualPaths = emptyShoreVisualPaths();
    this.locateStatus = "none";
    this.locateFlash = null;
    this.locateFlashFrame = 0;
    this.colorMode = "height";
    this.viewOptions = {showOceanHeight: false};
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
    this.rebuildShoreVisualCache();
    const vertices = buildPlaceholderVertices(map, this.colorMode, this.viewOptions, this.shoreVisualPaths);
    const lineVertices = buildLineVertices(map, this.layerVisibility, this.shoreVisualPaths);
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
  }

  setViewOptions(options = {}) {
    this.viewOptions = {...this.viewOptions, ...options};
    if (!this.map) return;
    this.refreshCellSurface();
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
    const vertices = buildPlaceholderVertices(this.map, this.colorMode, this.viewOptions, this.shoreVisualPaths);
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
    const lineVertices = buildLineVertices(this.map, this.layerVisibility, this.shoreVisualPaths);
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

  rebuildShoreVisualCache() {
    this.shoreVisualPaths = this.map ? buildShoreVisualPaths(this.map) : emptyShoreVisualPaths();
  }

  setLayerVisible(layer, visible) {
    if (!(layer in this.layerVisibility)) return;
    const nextVisible = Boolean(visible);
    if (this.layerVisibility[layer] === nextVisible) return;
    this.layerVisibility[layer] = nextVisible;
    if (layer === "cities" || layer === "population" || layer === "markers") this.refreshPointLayers({draw: false});
    if (layer === "coastline" || layer === "lakeShore" || layer === "stateBorders" || layer === "provinceBorders") this.refreshLineLayers({draw: false});
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
    gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
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
      shoreVisual: summarizeShoreVisualPaths(this.shoreVisualPaths),
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

function buildPlaceholderVertices(map, colorMode, viewOptions, shoreVisualPaths = null) {
  const vertices = [];
  const paths = shoreVisualPaths || buildShoreVisualPaths(map);

  pushGridCells(vertices, map, colorMode, viewOptions);
  pushShoreVisualBands(vertices, map, colorMode, viewOptions, paths);

  return new Float32Array(vertices);
}

function buildLineVertices(map, visibility = {}, shoreVisualPaths = null) {
  const vertices = [];
  const paths = shoreVisualPaths || buildShoreVisualPaths(map);
  if (visibility.coastline !== false) pushShoreVisualLines(vertices, paths.coastline, map, SHORE_VISUAL_STYLE.coastlineStroke);
  if (visibility.lakeShore !== false) pushShoreVisualLines(vertices, paths.lakeShore, map, SHORE_VISUAL_STYLE.lakeShoreStroke);
  if (visibility.provinceBorders !== false) pushPoliticalBoundaryLines(vertices, map, "province", [0.18, 0.2, 0.22, 0.34]);
  if (visibility.stateBorders !== false) pushPoliticalBoundaryLines(vertices, map, "state", [0.04, 0.05, 0.06, 0.62]);
  return new Float32Array(vertices);
}

const SHORE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 5.5,
  smoothing: Object.freeze({iterations: 2, factor: 0.22}),
  coastlineStroke: Object.freeze([0.88, 0.84, 0.63, 0.68]),
  lakeShoreStroke: Object.freeze([0.58, 0.78, 0.84, 0.64])
});

const LINE_SMOOTHING = Object.freeze({
  river: Object.freeze({iterations: 1, factor: 0.2}),
  route: Object.freeze({iterations: 1, factor: 0.16}),
  riverSelection: Object.freeze({iterations: 1, factor: 0.18})
});

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
  const ownVertices = map.grid.cells.v[cell] || [];
  const neighborVertices = new Set(map.grid.cells.v[neighbor] || []);
  const shared = ownVertices.filter(vertex => neighborVertices.has(vertex));
  if (shared.length < 2) return null;
  return [map.grid.vertices.p[shared[0]], map.grid.vertices.p[shared[1]]];
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
    const landColorA = visual.land.colors[index];
    const landColorB = visual.land.colors[index + 1];
    const waterColorA = visual.water.colors[index];
    const waterColorB = visual.water.colors[index + 1];
    pushWorldVertex(vertices, landA, map, landColorA);
    pushWorldVertex(vertices, waterA, map, waterColorA);
    pushWorldVertex(vertices, waterB, map, waterColorB);
    pushWorldVertex(vertices, landA, map, landColorA);
    pushWorldVertex(vertices, waterB, map, waterColorB);
    pushWorldVertex(vertices, landB, map, landColorB);
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

function buildSmoothedShoreVisual(path, map, colorMode, viewOptions) {
  if (!path.points?.length || path.points.length !== path.sideVectors?.length) return null;
  const halfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const landPoints = [];
  const waterPoints = [];
  const landColors = [];
  const waterColors = [];

  for (let index = 0; index < path.points.length; index++) {
    const point = path.points[index];
    const side = path.sideVectors[index] || {x: 0, y: 0};
    landPoints.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
    waterPoints.push([point[0] - side.x * halfWidth, point[1] - side.y * halfWidth]);
    landColors.push(colorForCell(path.landCells[index], map, colorMode, viewOptions));
    waterColors.push(colorForCell(path.waterCells[index], map, colorMode, viewOptions));
  }

  return {
    land: smoothWorldPathAndColors(landPoints, landColors, SHORE_VISUAL_STYLE.smoothing),
    water: smoothWorldPathAndColors(waterPoints, waterColors, SHORE_VISUAL_STYLE.smoothing)
  };
}

function buildShoreVisualPaths(map) {
  const edges = collectShoreVisualEdges(map);
  return {
    coastline: buildShorePathsFromEdges(edges.coastline),
    lakeShore: buildShorePathsFromEdges(edges.lakeShore)
  };
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

function pushGridCells(vertices, map, colorMode, viewOptions) {
  const grid = map.grid;
  for (let cellIndex = 0; cellIndex < grid.cells.v.length; cellIndex++) {
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
