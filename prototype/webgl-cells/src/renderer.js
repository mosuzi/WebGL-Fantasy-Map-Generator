import {bindAttribute, buildCellBuffers, disposeBuffers, updateThemeColorBuffer, uploadBuffers} from "./buffers.js";
import {MapCamera} from "./camera.js";
import {createLayerState, getDrawableLayers, getLayerVisibility, setLayerVisible} from "./layers.js";
import {pickCellAtPoint} from "./picking.js";
import {getThemeDefinition, getThemeIds, getThemeLabel} from "./themes.js";
import {roundMs} from "./utils.js";

export class GraphicsMapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {antialias: true});
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL2");

    this.mode = "height";
    this.themeIds = getThemeIds();
    this.layers = createLayerState();
    this.viewListeners = new Set();
    this.cameraController = new MapCamera(canvas, () => this.draw());
    this.camera = this.cameraController.state;
    this.buffers = null;
    this.performance = {};
    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.locations = getLocations(this.gl, this.program);
  }

  loadSnapshot(snapshot) {
    this.setData(snapshot);
  }

  setData(snapshot) {
    const buildStartedAt = performance.now();
    const buffers = buildCellBuffers(snapshot, this.mode);
    this.performance = {buildMs: roundMs(performance.now() - buildStartedAt)};

    disposeBuffers(this.gl, this.buffers);
    this.snapshot = snapshot;
    this.buffers = buffers;

    const uploadStartedAt = performance.now();
    uploadBuffers(this.gl, this.buffers);
    this.performance.uploadMs = roundMs(performance.now() - uploadStartedAt);
    this.fitToView();
  }

  setColorMode(mode) {
    this.setMode(mode);
  }

  setMode(mode) {
    if (mode === "state") mode = "states";
    if (!this.themeIds.includes(mode)) throw new Error(`未知专题: ${mode}`);
    this.mode = mode;
    if (this.buffers && this.snapshot) {
      const updateStartedAt = performance.now();
      updateThemeColorBuffer(this.gl, this.buffers, this.snapshot, mode);
      this.performance.themeUpdateMs = roundMs(performance.now() - updateStartedAt);
    }
    this.draw();
  }

  setLayerVisible(layerId, visible) {
    setLayerVisible(this.layers, layerId, visible);
    this.draw();
  }

  setBordersVisible(visible) {
    this.setLayerVisible("borders", visible);
  }

  setRiversVisible(visible) {
    this.setLayerVisible("rivers", visible);
  }

  setCamera(camera) {
    this.cameraController.setCamera(camera);
  }

  fitToView() {
    this.cameraController.fitToView(this.snapshot?.metadata);
  }

  resize() {
    this.cameraController.resize(this.snapshot?.metadata);
  }

  pan(deltaX, deltaY) {
    this.cameraController.pan(deltaX, deltaY);
  }

  zoomAt(clientX, clientY, factor) {
    this.cameraController.zoomAt(clientX, clientY, factor);
  }

  clientToWorld(clientX, clientY) {
    return this.cameraController.clientToWorld(clientX, clientY);
  }

  screenToWorld(screenX, screenY) {
    return this.cameraController.screenToWorld(screenX, screenY);
  }

  clientToCanvas(clientX, clientY) {
    return this.cameraController.clientToCanvas(clientX, clientY);
  }

  pick(screenX, screenY) {
    return this.pickCell(screenX, screenY);
  }

  pickCell(clientX, clientY) {
    if (!this.snapshot || !this.buffers) return null;
    const point = this.clientToWorld(clientX, clientY);
    const {hit, lastPick} = pickCellAtPoint(this.snapshot, this.buffers, point);
    this.lastPick = lastPick;
    return hit;
  }

  draw() {
    if (!this.buffers) return;

    const gl = this.gl;
    const drawStartedAt = performance.now();
    const errorBefore = gl.getError();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.075, 0.192, 0.298, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.locations.scale, this.camera.scale);
    gl.uniform2f(this.locations.translate, this.camera.x, this.camera.y);

    for (const layerId of getDrawableLayers(this.layers)) {
      this.drawLayer(layerId);
    }

    this.performance.drawMs = roundMs(performance.now() - drawStartedAt);
    this.lastDraw = {
      camera: {...this.camera},
      canvas: {width: this.canvas.width, height: this.canvas.height},
      mode: this.mode,
      theme: getThemeDefinition(this.mode),
      layers: this.getLayerVisibility(),
      vertexCount: this.buffers.vertexCount,
      stateBorderVertexCount: this.buffers.stateBorderVertexCount,
      provinceBorderVertexCount: this.buffers.provinceBorderVertexCount,
      routeVertexCount: this.buffers.routeVertexCount,
      riverVertexCount: this.buffers.riverVertexCount,
      precipitationPointCount: this.buffers.precipitationPointCount,
      populationPointCount: this.buffers.populationPointCount,
      burgIconPointCount: this.buffers.burgIconPointCount,
      markerPointCount: this.buffers.markerPointCount,
      lakeVertexCount: this.buffers.lakeVertexCount,
      lakeIslandVertexCount: this.buffers.lakeIslandVertexCount,
      coastlineVertexCount: this.buffers.coastlineVertexCount,
      lakeShoreVertexCount: this.buffers.lakeShoreVertexCount,
      errorBefore,
      errorAfter: gl.getError(),
      drawMs: this.performance.drawMs
    };
    this.notifyViewListeners();
  }

  addViewListener(listener) {
    this.viewListeners.add(listener);
    if (this.buffers) listener(this.getViewState());
    return () => this.viewListeners.delete(listener);
  }

  getViewState() {
    return {
      camera: {...this.camera},
      canvas: {width: this.canvas.width, height: this.canvas.height},
      cssSize: this.canvas.getBoundingClientRect(),
      snapshot: this.snapshot
    };
  }

  notifyViewListeners() {
    const state = this.getViewState();
    for (const listener of this.viewListeners) listener(state);
  }

  drawLayer(layerId) {
    const gl = this.gl;

    if (layerId === "landmass" && this.buffers.landVertexCount) {
      this.drawColoredTriangles(this.buffers.landPositionBuffer, this.buffers.landColorBuffer, this.buffers.landVertexCount);
      return;
    }

    if (layerId === "cells") {
      this.disablePointAttributes();
      gl.uniform1i(this.locations.pointLayer, 0);
      bindAttribute(gl, this.locations.position, this.buffers.positionBuffer, 2);
      bindAttribute(gl, this.locations.color, this.buffers.themeColorBuffer, 3);
      gl.drawArrays(gl.TRIANGLES, 0, this.buffers.vertexCount);
      return;
    }

    if (layerId === "lakes" && this.buffers.lakeVertexCount) {
      this.drawColoredTriangles(this.buffers.lakePositionBuffer, this.buffers.lakeColorBuffer, this.buffers.lakeVertexCount);
      this.drawColoredTriangles(
        this.buffers.lakeIslandPositionBuffer,
        this.buffers.lakeIslandColorBuffer,
        this.buffers.lakeIslandVertexCount
      );
      return;
    }

    if (layerId === "coastline") {
      this.drawColoredLines(this.buffers.coastlinePositionBuffer, this.buffers.coastlineColorBuffer, this.buffers.coastlineVertexCount);
      this.drawColoredLines(this.buffers.lakeShorePositionBuffer, this.buffers.lakeShoreColorBuffer, this.buffers.lakeShoreVertexCount);
      return;
    }

    const lineLayer = this.buffers.lineBuffers.layers[layerId];
    if (lineLayer?.vertexCount) {
      if (lineLayer.primitive === "triangles") {
        this.drawColoredTriangles(lineLayer.positionBuffer, lineLayer.colorBuffer, lineLayer.vertexCount);
        return;
      }
      this.drawColoredLines(lineLayer.positionBuffer, lineLayer.colorBuffer, lineLayer.vertexCount);
      return;
    }

    const pointLayer = this.buffers.pointBuffers.layers[layerId];
    if (pointLayer?.instanceCount) {
      this.drawColoredPoints(pointLayer.positionBuffer, pointLayer.colorBuffer, pointLayer.sizeBuffer, pointLayer.instanceCount);
    }
  }

  drawColoredTriangles(positionBuffer, colorBuffer, vertexCount) {
    if (!vertexCount) return;
    const gl = this.gl;
    this.disablePointAttributes();
    gl.uniform1i(this.locations.pointLayer, 0);
    bindAttribute(gl, this.locations.position, positionBuffer, 2);
    bindAttribute(gl, this.locations.color, colorBuffer, 3);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  }

  drawColoredLines(positionBuffer, colorBuffer, vertexCount) {
    if (!vertexCount) return;
    const gl = this.gl;
    this.disablePointAttributes();
    gl.uniform1i(this.locations.pointLayer, 0);
    bindAttribute(gl, this.locations.position, positionBuffer, 2);
    bindAttribute(gl, this.locations.color, colorBuffer, 3);
    gl.drawArrays(gl.LINES, 0, vertexCount);
  }

  drawColoredPoints(positionBuffer, colorBuffer, sizeBuffer, instanceCount) {
    if (!instanceCount) return;
    const gl = this.gl;
    gl.uniform1i(this.locations.pointLayer, 1);
    bindAttribute(gl, this.locations.position, positionBuffer, 2);
    bindAttribute(gl, this.locations.color, colorBuffer, 3);
    bindAttribute(gl, this.locations.size, sizeBuffer, 1);
    gl.drawArrays(gl.POINTS, 0, instanceCount);
    gl.uniform1i(this.locations.pointLayer, 0);
  }

  disablePointAttributes() {
    const gl = this.gl;
    if (this.locations.size < 0) return;
    gl.disableVertexAttribArray(this.locations.size);
    gl.vertexAttrib1f(this.locations.size, 1);
  }

  getLayerVisibility() {
    return getLayerVisibility(this.layers);
  }

  getStats() {
    if (!this.snapshot || !this.buffers) return null;
    const picking = this.buffers.pickingIndex.stats;
    const lineStats = this.buffers.lineStats;
    return {
      metadata: this.snapshot.metadata,
      geometry: {
        renderSource: this.buffers.renderSource,
        renderCellCount: this.buffers.renderCellCount,
        renderVertexCount: this.buffers.renderVertexCount,
        triangles: this.buffers.vertexCount / 3,
        vertexCount: this.buffers.vertexCount,
        landTriangles: this.buffers.landVertexCount / 3,
        lakeTriangles: this.buffers.lakeVertexCount / 3,
        lakeIslandTriangles: this.buffers.lakeIslandVertexCount / 3,
        coastlineSegments: this.buffers.coastlineVertexCount / 2,
        lakeShoreSegments: this.buffers.lakeShoreVertexCount / 2,
        featureStats: this.buffers.featureStats,
        stateBorderSegments: lineStats.stateBorderSegments,
        provinceBorderSegments: lineStats.provinceBorderSegments,
        borderSegments: lineStats.stateBorderSegments,
        routeCount: lineStats.routeCount,
        routeSegments: lineStats.routeSegments,
        routeTriangles: lineStats.routeTriangles,
        routeGroups: lineStats.routeGroups,
        riverCount: this.buffers.riverCount,
        riverSegments: lineStats.riverSegments,
        riverTriangles: lineStats.riverTriangles,
        riverMouthsClipped: lineStats.riverMouthsClipped,
        riverOpenEnds: lineStats.riverOpenEnds,
        riverMinWidth: lineStats.riverMinWidth,
        riverMaxWidth: lineStats.riverMaxWidth,
        riverFallback: lineStats.riverFallback,
        pointStats: this.buffers.pointStats
      },
      picking,
      performance: {...this.performance},
      theme: {
        id: this.mode,
        label: getThemeLabel(this.mode),
        source: getThemeDefinition(this.mode).source,
        geometryReuse: "position buffer 复用，切换仅更新专题颜色 buffer",
        colorBufferVertices: this.buffers.themeColors.length / 3,
        stats: this.buffers.themeStats[this.mode]
      },
      layers: this.getLayerVisibility(),
      camera: {...this.camera}
    };
  }
}

export {GraphicsMapRenderer as CellWebGLRenderer};

export function installCanvasInteractions(renderer, {onHover} = {}) {
  const canvas = renderer.canvas;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", event => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (dragging) {
      renderer.pan(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }

    onHover?.(renderer.pick(event.clientX, event.clientY));
  });

  canvas.addEventListener("pointerleave", () => onHover?.(null));

  canvas.addEventListener("pointerup", event => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.001);
      renderer.zoomAt(event.clientX, event.clientY, factor);
    },
    {passive: false}
  );
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
  }
  return shader;
}

function getLocations(gl, program) {
  return {
    position: gl.getAttribLocation(program, "a_position"),
    color: gl.getAttribLocation(program, "a_color"),
    size: gl.getAttribLocation(program, "a_size"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    scale: gl.getUniformLocation(program, "u_scale"),
    translate: gl.getUniformLocation(program, "u_translate"),
    pointLayer: gl.getUniformLocation(program, "u_point_layer")
  };
}

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec3 a_color;
in float a_size;

uniform vec2 u_resolution;
uniform float u_scale;
uniform vec2 u_translate;

out vec3 v_color;

void main() {
  vec2 screen = a_position * u_scale + u_translate;
  vec2 clip = vec2((screen.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y / u_resolution.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = max(a_size, 1.0);
  v_color = a_color;
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 v_color;
uniform bool u_point_layer;
out vec4 outColor;

void main() {
  if (u_point_layer) {
    vec2 delta = gl_PointCoord - vec2(0.5);
    if (dot(delta, delta) > 0.25) discard;
  }
  outColor = vec4(v_color, 1.0);
}`;
