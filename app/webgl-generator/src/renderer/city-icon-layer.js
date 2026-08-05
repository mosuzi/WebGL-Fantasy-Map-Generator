import {createProgram} from "./gl-utils.js";

export const CITY_ICON_SHAPE_IDS = Object.freeze({
  hamlet: 0,
  village: 1,
  town: 2,
  city: 3,
  capital: 4,
  provincial: 5,
  port: 6,
  fort: 7,
  camp: 8
});

export const CITY_ICON_ROLE_BITS = Object.freeze({
  capital: 1,
  provincial: 2,
  port: 4
});

export const CITY_ICON_TIER_SCALES = Object.freeze({
  hamlet: 0.62,
  village: 0.76,
  town: 0.92,
  city: 1.1
});

export const CITY_ICON_BASE_CSS_SIZE = Object.freeze({width: 12.5, height: 9.5});
export const CITY_ICON_VISIBILITY_TRANSITION_MS = 150;
export const CITY_ICON_SCALE_FADE_WIDTH = 0.24;
export const CITY_ICON_MIN_OUTLINE_CSS_PX = 4.8;
export const CITY_ICON_MAX_OUTLINE_CSS_PX = 10.5;
export const CITY_ICON_OUTLINE_STROKE_CSS_PX = 2;

export const CITY_ICON_INSTANCE_FLOATS = 11;
export const CITY_ICON_INSTANCE_STRIDE_BYTES = CITY_ICON_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const INSTANCE_FLOATS = CITY_ICON_INSTANCE_FLOATS;
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const INSTANCE_STRIDE_BYTES = CITY_ICON_INSTANCE_STRIDE_BYTES;
const DARK_OUTLINE = Object.freeze([0.055, 0.075, 0.085, 1]);
const WHITE_INNER_LINE = Object.freeze([0.985, 0.992, 1, 1]);
const SELECTED_INNER_LINE = Object.freeze([1, 0.86, 0.32, 1]);
const ROLE_OUTLINE_EXTENT = 0.879;
const SHAPE_OUTLINE_EXTENTS = Object.freeze({
  hamlet: 0.48,
  village: 0.84,
  town: 0.84,
  city: 0.8,
  capital: 0.84,
  provincial: 0.84,
  port: 0.7,
  fort: 0.84,
  camp: 0.76
});

export function cityIconCameraSizeFactor(scale) {
  const normalizedScale = Math.max(0, Number(scale) || 0);
  return 0.72 + 2.15 * (1 - Math.exp(-0.18 * Math.max(0, normalizedScale - 0.5)));
}

export function cityIconTierScale(tier) {
  return CITY_ICON_TIER_SCALES[tier] || CITY_ICON_TIER_SCALES.town;
}

export function cityIconOutlineCssLimit(nameWidthCss) {
  const width = Number(nameWidthCss);
  if (!Number.isFinite(width)) return CITY_ICON_MAX_OUTLINE_CSS_PX;
  return Math.max(CITY_ICON_MIN_OUTLINE_CSS_PX, Math.min(CITY_ICON_MAX_OUTLINE_CSS_PX, width * 0.5 - 1));
}

export function cityIconOutlineExtent(silhouette, roles = []) {
  const normalized = Object.hasOwn(SHAPE_OUTLINE_EXTENTS, silhouette) ? silhouette : "town";
  const shape = CITY_ICON_SHAPE_IDS[normalized];
  const roleBits = additionalRoleBits(shape, roles);
  return roleBits ? Math.max(SHAPE_OUTLINE_EXTENTS[normalized], ROLE_OUTLINE_EXTENT) : SHAPE_OUTLINE_EXTENTS[normalized];
}

export function cityIconMaxSizeFactor({silhouette, roles = [], nameWidthCss, baseSize = CITY_ICON_BASE_CSS_SIZE} = {}) {
  const outlineLimit = cityIconOutlineCssLimit(nameWidthCss);
  const extent = cityIconOutlineExtent(silhouette, roles);
  const usableOutline = Math.max(1, outlineLimit - CITY_ICON_OUTLINE_STROKE_CSS_PX);
  return usableOutline / (positiveNumber(baseSize?.height, CITY_ICON_BASE_CSS_SIZE.height) * extent);
}

export function cityIconSizeFactor(scale, tier, maxSizeFactor = Number.POSITIVE_INFINITY) {
  const tierScale = cityIconTierScale(tier);
  const cap = positiveNumber(maxSizeFactor, Number.POSITIVE_INFINITY);
  const cameraFactor = Math.min(cityIconCameraSizeFactor(scale), cap / CITY_ICON_TIER_SCALES.city);
  return cameraFactor * tierScale;
}

export function cityIconCssSize(scale, tier, baseSize = CITY_ICON_BASE_CSS_SIZE, maxSizeFactor = Number.POSITIVE_INFINITY) {
  const factor = cityIconSizeFactor(scale, tier, maxSizeFactor);
  return {width: baseSize.width * factor, height: baseSize.height * factor, factor};
}

export function cityIconScaleVisibility(scale, minScale, fadeWidth = CITY_ICON_SCALE_FADE_WIDTH) {
  return smoothstep(Number(minScale) - fadeWidth, Number(minScale) + fadeWidth, Number(scale));
}

export function cityIconRoleBits(roles = []) {
  if (Number.isInteger(roles)) return roles & 7;
  if (!roles || typeof roles[Symbol.iterator] !== "function") return 0;
  return [...roles].reduce((bits, role) => bits | (CITY_ICON_ROLE_BITS[role] || 0), 0);
}

export class CityIconWebglLayer {
  constructor(gl, options = {}) {
    if (!gl) throw new Error("城镇 WebGL 图标层需要有效的 WebGL2 context");
    this.gl = gl;
    this.baseSize = normalizeBaseSize(options.baseSize);
    this.transitionMs = positiveNumber(options.transitionMs, CITY_ICON_VISIBILITY_TRANSITION_MS);
    this.scaleFadeWidth = positiveNumber(options.scaleFadeWidth, CITY_ICON_SCALE_FADE_WIDTH);
    this.program = createProgram(gl, CITY_ICON_VERTEX_SHADER_SOURCE, CITY_ICON_FRAGMENT_SHADER_SOURCE);
    this.vao = gl.createVertexArray();
    this.quadBuffer = gl.createBuffer();
    this.instanceBuffer = gl.createBuffer();
    this.instances = [];
    this.instanceIndexById = new Map();
    this.instanceData = new Float32Array();
    this.stats = {
      instanceCount: 0,
      modelUploads: 0,
      stateUploads: 0,
      uploadedBytes: 0,
      drawCalls: 0,
      lastDrawInstances: 0,
      uniformOnlyCameraFrames: 0
    };
    this.locations = {
      mapSize: gl.getUniformLocation(this.program, "u_mapSize"),
      viewportBacking: gl.getUniformLocation(this.program, "u_viewportBacking"),
      pixelRatio: gl.getUniformLocation(this.program, "u_pixelRatio"),
      baseSizeCss: gl.getUniformLocation(this.program, "u_baseSizeCss"),
      cameraScale: gl.getUniformLocation(this.program, "u_cameraScale"),
      cameraOffset: gl.getUniformLocation(this.program, "u_cameraOffset"),
      timeMs: gl.getUniformLocation(this.program, "u_timeMs"),
      transitionMs: gl.getUniformLocation(this.program, "u_transitionMs"),
      scaleFadeWidth: gl.getUniformLocation(this.program, "u_scaleFadeWidth"),
      darkOutline: gl.getUniformLocation(this.program, "u_darkOutline"),
      whiteInner: gl.getUniformLocation(this.program, "u_whiteInner"),
      selectedInner: gl.getUniformLocation(this.program, "u_selectedInner")
    };
    configureCityIconVertexArray(gl, this.vao, this.quadBuffer, this.instanceBuffer);
  }

  setInstances(items = [], {nowMs = 0} = {}) {
    const packed = packCityIconInstances(items, {nowMs});
    this.instances = packed.instances;
    this.instanceIndexById = new Map(this.instances.map((item, index) => [String(item.id), index]));
    this.instanceData = packed.data;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
    this.stats.instanceCount = this.instances.length;
    this.stats.modelUploads += 1;
    this.stats.uploadedBytes += this.instanceData.byteLength;
    return this.instances.length;
  }

  updateInstanceStates(changes = [], {nowMs = 0} = {}) {
    const normalizedChanges = changes instanceof Map
      ? [...changes].map(([id, state]) => ({id, ...state}))
      : Array.isArray(changes) ? changes : Object.entries(changes).map(([id, state]) => ({id, ...state}));
    const changedIndices = [];
    for (const change of normalizedChanges) {
      const index = this.instanceIndexById.get(String(change?.id));
      if (!Number.isInteger(index)) continue;
      const item = this.instances[index];
      let changed = false;
      if (Object.hasOwn(change, "visibilityTarget") || Object.hasOwn(change, "visible")) {
        const target = clamp01(Object.hasOwn(change, "visibilityTarget") ? change.visibilityTarget : change.visible ? 1 : 0);
        if (target !== item.visibilityTarget) {
          item.visibilityFrom = transitionedVisibility(item, nowMs, this.transitionMs);
          item.visibilityTarget = target;
          item.visibilityStartedMs = Number(nowMs) || 0;
          changed = true;
        }
      }
      if (Object.hasOwn(change, "selected")) {
        const selected = change.selected ? 1 : 0;
        if (selected !== item.selected) {
          item.selected = selected;
          changed = true;
        }
      }
      if (Object.hasOwn(change, "roles") || Object.hasOwn(change, "roleBits")) {
        const roleBits = additionalRoleBits(item.shape, Object.hasOwn(change, "roleBits") ? change.roleBits : change.roles);
        if (roleBits !== item.roleBits) {
          item.roleBits = roleBits;
          changed = true;
        }
      }
      if (!changed) continue;
      writeInstanceData(this.instanceData, index, item);
      changedIndices.push(index);
    }
    if (!changedIndices.length) return 0;
    uploadChangedInstanceRanges(this.gl, this.instanceBuffer, this.instanceData, changedIndices);
    this.stats.stateUploads += 1;
    this.stats.uploadedBytes += changedIndices.length * INSTANCE_STRIDE_BYTES;
    return changedIndices.length;
  }

  draw({mapSize, camera, canvas, timeMs = 0, layerVisible = true, restoreState = true} = {}) {
    if (!layerVisible || !this.instances.length) {
      this.stats.lastDrawInstances = 0;
      return 0;
    }
    const width = positiveNumber(canvas?.width, 1);
    const height = positiveNumber(canvas?.height, 1);
    const cssWidth = positiveNumber(canvas?.clientWidth, width);
    const pixelRatio = width / cssWidth;
    const mapWidth = positiveNumber(mapSize?.width ?? mapSize?.graphWidth, 1);
    const mapHeight = positiveNumber(mapSize?.height ?? mapSize?.graphHeight, 1);
    const scale = positiveNumber(camera?.scale, 1);
    const offsetX = Number(camera?.offsetX) || 0;
    const offsetY = Number(camera?.offsetY) || 0;
    const gl = this.gl;
    const previous = restoreState ? captureGlState(gl) : null;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.locations.mapSize, mapWidth, mapHeight);
    gl.uniform2f(this.locations.viewportBacking, width, height);
    gl.uniform1f(this.locations.pixelRatio, pixelRatio);
    gl.uniform2f(this.locations.baseSizeCss, this.baseSize.width, this.baseSize.height);
    gl.uniform1f(this.locations.cameraScale, scale);
    gl.uniform2f(this.locations.cameraOffset, offsetX, offsetY);
    gl.uniform1f(this.locations.timeMs, Number(timeMs) || 0);
    gl.uniform1f(this.locations.transitionMs, this.transitionMs);
    gl.uniform1f(this.locations.scaleFadeWidth, this.scaleFadeWidth);
    gl.uniform4fv(this.locations.darkOutline, DARK_OUTLINE);
    gl.uniform4fv(this.locations.whiteInner, WHITE_INNER_LINE);
    gl.uniform4fv(this.locations.selectedInner, SELECTED_INNER_LINE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instances.length);

    if (previous) restoreGlState(gl, previous);
    this.stats.drawCalls += 1;
    this.stats.lastDrawInstances = this.instances.length;
    this.stats.uniformOnlyCameraFrames += 1;
    return this.instances.length;
  }

  snapshot() {
    return {...this.stats};
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.instances = [];
    this.instanceIndexById.clear();
    this.instanceData = new Float32Array();
  }
}

export function createCityIconWebglLayer(gl, options = {}) {
  return new CityIconWebglLayer(gl, options);
}

export function packCityIconInstances(items = [], {nowMs = 0} = {}) {
  const instances = items.map(item => normalizeCityIconInstance(item, nowMs)).filter(Boolean);
  const data = new Float32Array(instances.length * INSTANCE_FLOATS);
  for (let index = 0; index < instances.length; index++) writeInstanceData(data, index, instances[index]);
  return {instances, data};
}

function configureCityIconVertexArray(gl, vao, quadBuffer, instanceBuffer) {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  configureInstanceAttribute(gl, 1, 2, 0);
  for (let location = 2; location <= 10; location++) configureInstanceAttribute(gl, location, 1, location);
  gl.bindVertexArray(null);
}

function configureInstanceAttribute(gl, location, size, floatOffset) {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, INSTANCE_STRIDE_BYTES, floatOffset * FLOAT_BYTES);
  gl.vertexAttribDivisor(location, 1);
}

function normalizeCityIconInstance(item, nowMs) {
  const x = Number(item?.x);
  const y = Number(item?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const silhouette = Object.hasOwn(CITY_ICON_SHAPE_IDS, item?.silhouette) ? item.silhouette : "town";
  const shape = CITY_ICON_SHAPE_IDS[silhouette];
  const target = clamp01(Object.hasOwn(item, "visibilityTarget") ? item.visibilityTarget : item?.visible === false ? 0 : 1);
  return {
    id: item.id,
    x,
    y,
    shape,
    tierScale: positiveNumber(item.tierScale, cityIconTierScale(item.scale || item.kind)),
    minScale: Math.max(0, Number(item.minScale) || 0),
    visibilityFrom: target,
    visibilityTarget: target,
    visibilityStartedMs: Number(item.visibilityStartedMs ?? nowMs) || 0,
    roleBits: additionalRoleBits(shape, Object.hasOwn(item, "roleBits") ? item.roleBits : item.roles),
    selected: item.selected ? 1 : 0,
    maxSizeFactor: positiveNumber(item.maxSizeFactor, 1000000)
  };
}

function additionalRoleBits(shape, roles) {
  let bits = cityIconRoleBits(roles);
  if (shape === CITY_ICON_SHAPE_IDS.capital) bits &= ~CITY_ICON_ROLE_BITS.capital;
  if (shape === CITY_ICON_SHAPE_IDS.provincial) bits &= ~CITY_ICON_ROLE_BITS.provincial;
  if (shape === CITY_ICON_SHAPE_IDS.port) bits &= ~CITY_ICON_ROLE_BITS.port;
  return bits;
}

function writeInstanceData(data, index, item) {
  const offset = index * INSTANCE_FLOATS;
  data[offset] = item.x;
  data[offset + 1] = item.y;
  data[offset + 2] = item.shape;
  data[offset + 3] = item.tierScale;
  data[offset + 4] = item.minScale;
  data[offset + 5] = item.visibilityFrom;
  data[offset + 6] = item.visibilityTarget;
  data[offset + 7] = item.visibilityStartedMs;
  data[offset + 8] = item.roleBits;
  data[offset + 9] = item.selected;
  data[offset + 10] = item.maxSizeFactor;
}

function uploadChangedInstanceRanges(gl, buffer, data, indices) {
  const sorted = [...new Set(indices)].sort((left, right) => left - right);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  let start = sorted[0];
  let end = start;
  const upload = () => {
    const from = start * INSTANCE_FLOATS;
    const to = (end + 1) * INSTANCE_FLOATS;
    gl.bufferSubData(gl.ARRAY_BUFFER, from * FLOAT_BYTES, data.subarray(from, to));
  };
  for (const index of sorted.slice(1)) {
    if (index === end + 1) {
      end = index;
      continue;
    }
    upload();
    start = index;
    end = index;
  }
  upload();
}

function transitionedVisibility(item, nowMs, durationMs) {
  const progress = smoothstep(0, durationMs, (Number(nowMs) || 0) - item.visibilityStartedMs);
  return item.visibilityFrom + (item.visibilityTarget - item.visibilityFrom) * progress;
}

function smoothstep(edge0, edge1, value) {
  const width = Math.max(0.000001, edge1 - edge0);
  const t = clamp01((value - edge0) / width);
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeBaseSize(value) {
  return {
    width: positiveNumber(value?.width, CITY_ICON_BASE_CSS_SIZE.width),
    height: positiveNumber(value?.height, CITY_ICON_BASE_CSS_SIZE.height)
  };
}

function captureGlState(gl) {
  return {
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    blend: gl.isEnabled(gl.BLEND),
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    depthWrite: gl.getParameter(gl.DEPTH_WRITEMASK),
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA)
  };
}

function restoreGlState(gl, state) {
  gl.bindVertexArray(state.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
  gl.useProgram(state.program);
  gl.blendFuncSeparate(state.blendSrcRgb, state.blendDstRgb, state.blendSrcAlpha, state.blendDstAlpha);
  if (state.blend) gl.enable(gl.BLEND);
  else gl.disable(gl.BLEND);
  if (state.depthTest) gl.enable(gl.DEPTH_TEST);
  else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(state.depthWrite);
}

export const CITY_ICON_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_world;
layout(location = 2) in float a_shape;
layout(location = 3) in float a_tierScale;
layout(location = 4) in float a_minScale;
layout(location = 5) in float a_visibilityFrom;
layout(location = 6) in float a_visibilityTarget;
layout(location = 7) in float a_visibilityStartedMs;
layout(location = 8) in float a_roleBits;
layout(location = 9) in float a_selected;
layout(location = 10) in float a_maxSizeFactor;

uniform vec2 u_mapSize;
uniform vec2 u_viewportBacking;
uniform float u_pixelRatio;
uniform vec2 u_baseSizeCss;
uniform float u_cameraScale;
uniform vec2 u_cameraOffset;

out vec2 v_iconUv;
flat out float v_sizeFactor;
flat out float v_minScale;
flat out float v_visibilityFrom;
flat out float v_visibilityTarget;
flat out float v_visibilityStartedMs;
flat out int v_shape;
flat out int v_roleBits;
flat out float v_selected;

float cameraSizeFactor(float scale) {
  return 0.72 + 2.15 * (1.0 - exp(-0.18 * max(0.0, scale - 0.5)));
}

void main() {
  vec2 centerNdc = vec2(a_world.x / u_mapSize.x * 2.0 - 1.0, 1.0 - a_world.y / u_mapSize.y * 2.0);
  vec2 centerClip = centerNdc * u_cameraScale + u_cameraOffset;
  v_sizeFactor = min(cameraSizeFactor(u_cameraScale), a_maxSizeFactor / 1.10) * a_tierScale;
  vec2 sizeBacking = u_baseSizeCss * u_pixelRatio * v_sizeFactor;
  vec2 anchorBacking = vec2(0.0, sizeBacking.y * 0.32);
  vec2 clipOffset = (a_corner * sizeBacking + anchorBacking) / u_viewportBacking * 2.0;
  gl_Position = vec4(centerClip + clipOffset, 0.0, 1.0);
  v_iconUv = a_corner * 2.0;
  v_minScale = a_minScale;
  v_visibilityFrom = a_visibilityFrom;
  v_visibilityTarget = a_visibilityTarget;
  v_visibilityStartedMs = a_visibilityStartedMs;
  v_shape = int(a_shape + 0.5);
  v_roleBits = int(a_roleBits + 0.5);
  v_selected = a_selected;
}`;

export const CITY_ICON_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_baseSizeCss;
uniform float u_pixelRatio;
uniform float u_cameraScale;
uniform float u_timeMs;
uniform float u_transitionMs;
uniform float u_scaleFadeWidth;
uniform vec4 u_darkOutline;
uniform vec4 u_whiteInner;
uniform vec4 u_selectedInner;

in vec2 v_iconUv;
flat in float v_sizeFactor;
flat in float v_minScale;
flat in float v_visibilityFrom;
flat in float v_visibilityTarget;
flat in float v_visibilityStartedMs;
flat in int v_shape;
flat in int v_roleBits;
flat in float v_selected;
out vec4 outColor;

const float PI = 3.141592653589793;

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  return length(p - (a + ab * t));
}

vec2 polygonVertex(int index, int count, float rotation, float innerRadius) {
  float radius = innerRadius > 0.0 && index % 2 == 1 ? innerRadius : 0.84;
  float angle = rotation + float(index) / float(count) * PI * 2.0;
  return vec2(cos(angle), sin(angle)) * radius;
}

float polygonOutlineDistance(vec2 p, int count, float rotation, float innerRadius) {
  float distanceValue = 1000.0;
  for (int index = 0; index < 10; index++) {
    if (index >= count) break;
    vec2 a = polygonVertex(index, count, rotation, innerRadius);
    vec2 b = polygonVertex((index + 1) % count, count, rotation, innerRadius);
    distanceValue = min(distanceValue, segmentDistance(p, a, b));
  }
  return distanceValue;
}

float portOutlineDistance(vec2 p) {
  float ring = abs(length(p) - 0.7);
  if (abs(p.x) < 0.18 && abs(p.y) > 0.53) ring = 1000.0;
  float waterGap = segmentDistance(p, vec2(-0.24, -0.68), vec2(0.24, -0.68));
  return min(ring, waterGap);
}

float tentOutlineDistance(vec2 p) {
  float leftSide = segmentDistance(p, vec2(-0.72, -0.68), vec2(0.0, 0.76));
  float rightSide = segmentDistance(p, vec2(0.0, 0.76), vec2(0.72, -0.68));
  float base = segmentDistance(p, vec2(-0.42, -0.68), vec2(0.42, -0.68));
  return min(min(leftSide, rightSide), base);
}

float mainShapeDistance(vec2 p, int shape) {
  if (shape == 0) return abs(length(p) - 0.48);
  if (shape == 1) return polygonOutlineDistance(p, 3, PI * 0.5, 0.0);
  if (shape == 2) return polygonOutlineDistance(p, 4, 0.0, 0.0);
  if (shape == 3) return min(abs(length(p) - 0.8), abs(length(p) - 0.44));
  if (shape == 4) return polygonOutlineDistance(p, 10, PI * 0.5, 0.38);
  if (shape == 5) return polygonOutlineDistance(p, 6, 0.0, 0.0);
  if (shape == 6) return portOutlineDistance(p);
  if (shape == 7) return polygonOutlineDistance(p, 4, PI * 0.25, 0.0);
  return tentOutlineDistance(p);
}

float roleShapeDistance(vec2 p, int roleBits, int baseShape) {
  float distanceValue = 1000.0;
  if ((roleBits & 1) != 0 && baseShape != 4) {
    vec2 rolePoint = (p - vec2(-0.66, 0.68)) / 0.26;
    distanceValue = min(distanceValue, polygonOutlineDistance(rolePoint, 10, PI * 0.5, 0.38) * 0.26);
  }
  if ((roleBits & 2) != 0 && baseShape != 5) {
    vec2 rolePoint = (p - vec2(0.66, 0.68)) / 0.24;
    distanceValue = min(distanceValue, polygonOutlineDistance(rolePoint, 6, 0.0, 0.0) * 0.24);
  }
  if ((roleBits & 4) != 0 && baseShape != 6) {
    vec2 rolePoint = (p - vec2(0.66, -0.66)) / 0.24;
    distanceValue = min(distanceValue, portOutlineDistance(rolePoint) * 0.24);
  }
  return distanceValue;
}

void main() {
  vec2 iconPoint = vec2(v_iconUv.x * u_baseSizeCss.x / u_baseSizeCss.y, v_iconUv.y);
  float normalizedDistance = min(mainShapeDistance(iconPoint, v_shape), roleShapeDistance(iconPoint, v_roleBits, v_shape));
  float halfMinCss = min(u_baseSizeCss.x, u_baseSizeCss.y) * v_sizeFactor * 0.5;
  float distancePx = normalizedDistance * halfMinCss;
  float antialiasWidth = max(fwidth(distancePx) * 0.5, 0.22 / max(u_pixelRatio, 1.0));
  float outerCoverage = 1.0 - smoothstep(1.0 - antialiasWidth, 1.0 + antialiasWidth, distancePx);
  float innerCoverage = 1.0 - smoothstep(0.5 - antialiasWidth, 0.5 + antialiasWidth, distancePx);
  float scaleVisibility = smoothstep(v_minScale - u_scaleFadeWidth, v_minScale + u_scaleFadeWidth, u_cameraScale);
  float transitionProgress = smoothstep(0.0, max(1.0, u_transitionMs), u_timeMs - v_visibilityStartedMs);
  float targetVisibility = mix(v_visibilityFrom, v_visibilityTarget, transitionProgress);
  float alpha = outerCoverage * scaleVisibility * targetVisibility;
  if (alpha <= 0.001) discard;
  vec4 innerColor = v_selected > 0.5 ? u_selectedInner : u_whiteInner;
  vec3 color = mix(u_darkOutline.rgb, innerColor.rgb, innerCoverage);
  outColor = vec4(color, alpha);
}`;
