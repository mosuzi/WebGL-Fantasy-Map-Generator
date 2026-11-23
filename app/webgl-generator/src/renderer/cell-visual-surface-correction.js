import {createRenderContext, worldToNdcPoint} from "./render-context.js";
import {SURFACE_BASE_INVALID_CELL_ID} from "./surface-base-buffer-set.js";
import {createCellVisualEdgeCurve, visitCellVisualCorrectionEdges} from "./cell-visual-layer.js";

export const CELL_VISUAL_CORRECTION_WORDS_PER_VERTEX = 3;
export const CELL_VISUAL_CORRECTION_WORDS_PER_TRIANGLE = 9;
export const CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES = 8 * 1024 * 1024;
const CANONICAL_OWNER_COLOR_MODES = new Set(["states", "provinces", "governments", "diplomacy"]);
const identityWordBuffer = new ArrayBuffer(4);
const identityUintView = new Uint32Array(identityWordBuffer);
const identityFloatView = new Float32Array(identityWordBuffer);

export function shouldDrawCellVisualCorrection(colorMode, viewOptions) {
  // 归属和拾取使用原始 cell 边界；修正三角跨过该边界会留下无法用画笔点中的异色碎片。
  return viewOptions?.smoothCellBorders !== false && !CANONICAL_OWNER_COLOR_MODES.has(colorMode);
}

export function buildCellVisualSurfaceCorrection(map, cellVisualMesh) {
  const context = createRenderContext(map);
  const owners = collectEdgeOwners(map);
  const centers = new Map((cellVisualMesh?.cells || []).map(cell => [Number(cell.cell), cell.center]));
  const shoreEdges = cellVisualMesh?.shoreEdges instanceof Set ? cellVisualMesh.shoreEdges : new Set();
  const triangles = [];
  for (const [key, curve] of cellVisualMesh?.edgeCurves || []) {
    if (shoreEdges.has(key) || !Array.isArray(curve) || curve.length < 3) continue;
    const edgeOwners = owners.get(key);
    if (edgeOwners?.length !== 2) continue;
    const targetCell = correctionTargetCell(curve, edgeOwners, cell => centers.get(cell));
    if (!Number.isInteger(targetCell)) continue;
    const water = Number(map?.grid?.cells?.h?.[targetCell]) < 20;
    const identity = packCellVisualCorrectionIdentity(targetCell, water);
    const start = worldToNdcPoint(context, curve[0]);
    for (let index = 1; index + 1 < curve.length; index++) {
      pushPackedTriangle(triangles, start, worldToNdcPoint(context, curve[index]), worldToNdcPoint(context, curve[index + 1]), identity);
    }
  }
  return new Float32Array(triangles);
}

export function buildCellVisualSurfaceCorrectionFromMap(map) {
  const context = createRenderContext(map);
  const triangles = [];
  const centerForCell = cell => map?.grid?.points?.[map?.grid?.cells?.p?.[cell]] || [0, 0];
  visitCellVisualCorrectionEdges(map, (_key, curve, owners) => {
    const targetCell = correctionTargetCell(curve, owners, centerForCell);
    if (!Number.isInteger(targetCell)) return;
    const water = Number(map?.grid?.cells?.h?.[targetCell]) < 20;
    const identity = packCellVisualCorrectionIdentity(targetCell, water);
    const start = worldToNdcPoint(context, curve[0]);
    for (let index = 1; index + 1 < curve.length; index++) {
      pushPackedTriangle(triangles, start, worldToNdcPoint(context, curve[index]), worldToNdcPoint(context, curve[index + 1]), identity);
    }
  });
  return new Float32Array(triangles);
}

// 在已上传的平滑边上覆盖变动部分；撤销回原始海陆时，直接移除相应覆盖。
export function updateEditedCellVisualEdges(map, state, crossings, gl, buffer) {
  const cells = map.grid.cells;
  const center = cell => map.grid.points[cells.p[cell]];
  const context = createRenderContext(map);
  for (const cell of crossings) {
    if (state.flipped.has(cell)) state.flipped.delete(cell);
    else state.flipped.add(cell);
  }
  const visited = new Set();
  const patches = new Map();
  for (const cell of crossings) for (const neighbor of cells.c[cell] || []) {
    const pair = cell < neighbor ? [cell, neighbor] : [neighbor, cell];
    const key = pair.join(":");
    if (visited.has(key)) continue;
    visited.add(key);
    if (!state.flipped.has(cell) && !state.flipped.has(neighbor)) {
      const slot = state.slots.get(key);
      if (slot !== undefined) {
        state.slots.delete(key);
        state.free.push(slot);
        patches.set(slot, null);
      }
      continue;
    }
    const vertices = cells.v[cell].filter(vertex => cells.v[neighbor].includes(vertex));
    if (vertices.length !== 2) continue;
    const first = Math.min(...vertices), last = Math.max(...vertices);
    const curve = createCellVisualEdgeCurve(map, first, last, `${first}:${last}`, false);
    if (curve.length < 3) continue;
    let owner = correctionTargetCell(curve, pair, center);
    if (owner === null) continue;
    // 跨海陆时恢复直边，修正区域重新使用直边原本所在格的颜色和深度。
    if ((cells.h[cell] < 20) !== (cells.h[neighbor] < 20)) owner = owner === cell ? neighbor : cell;
    const identity = packCellVisualCorrectionIdentity(owner, cells.h[owner] < 20);
    const points = curve.map(point => worldToNdcPoint(context, point));
    const triangles = [];
    for (let i = 1; i + 1 < points.length; i++) pushPackedTriangle(triangles, points[0], points[i], points[i + 1], identity);
    state.wordsPerEdge ||= triangles.length;
    if (!state.slots.has(key)) state.slots.set(key, state.free.pop() ?? state.nextSlot++);
    patches.set(state.slots.get(key), triangles);
  }
  const required = state.nextSlot * state.wordsPerEdge;
  const grow = required > state.geometry.length;
  if (grow) {
    const geometry = new Float32Array(Math.max(required, state.geometry.length * 2));
    geometry.set(state.geometry);
    state.geometry = geometry;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [slot, triangles] of patches) {
    const start = slot * state.wordsPerEdge, end = start + state.wordsPerEdge;
    if (triangles) state.geometry.set(triangles, start);
    else state.geometry.fill(0, start, end);
    if (!grow) gl.bufferSubData(gl.ARRAY_BUFFER, start * 4, state.geometry.subarray(start, end));
  }
  if (grow) gl.bufferData(gl.ARRAY_BUFFER, state.geometry, gl.DYNAMIC_DRAW);
  state.vertexCount = state.slots.size ? required / 3 : 0;
}

export function createCellVisualCorrectionBufferSet(gl, geometry, usageOrOptions = gl?.STATIC_DRAW) {
  const options = usageOrOptions && typeof usageOrOptions === "object" ? usageOrOptions : {usage: usageOrOptions};
  return createBufferSet(gl, geometry, options.usage ?? gl?.STATIC_DRAW, options.owner || null);
}

export async function createCellVisualCorrectionBufferSetAsync(gl, geometry, options = {}) {
  const source = assertGeometry(geometry);
  assertGl(gl);
  const usage = options.usage ?? gl?.STATIC_DRAW;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const assertCurrent = typeof options.assertCurrent === "function" ? options.assertCurrent : () => {};
  const ranges = segmentRanges(source.length);
  const segments = [];
  try {
    for (let index = 0; index < ranges.length; index++) {
      assertCurrent();
      const range = ranges[index];
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("无法创建平滑边界 correction buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, source.subarray(range.start, range.end), usage);
      segments.push(segmentDescriptor(buffer, range));
      options.onProgress?.({completed: index + 1, total: ranges.length, wordEnd: range.end, wordLength: source.length});
      if (index + 1 < ranges.length) await yieldToMain();
    }
    return freezeBufferSet(source.length, segments, options.owner || null);
  } catch (error) {
    deleteCellVisualCorrectionBufferSet(gl, {segments});
    throw error;
  }
}

export function flattenCellVisualCorrectionBufferSet(bufferSet) {
  return [...new Set((bufferSet?.segments || []).map(segment => segment?.buffer).filter(Boolean))];
}

export function deleteCellVisualCorrectionBufferSet(gl, bufferSet, {preserve = null} = {}) {
  const keep = preserve instanceof Set ? preserve : new Set(preserve || []);
  const buffers = flattenCellVisualCorrectionBufferSet(bufferSet).filter(buffer => !keep.has(buffer));
  for (const buffer of buffers) gl.deleteBuffer(buffer);
  return buffers.length;
}

export function replaceCellVisualCorrectionBufferSet(gl, current, replacement) {
  assertBufferSet(replacement);
  if (current === replacement) return replacement;
  deleteCellVisualCorrectionBufferSet(gl, current, {preserve: flattenCellVisualCorrectionBufferSet(replacement)});
  return replacement;
}

export function rebindCellVisualCorrectionBufferSetOwner(bufferSet, owner) {
  const current = assertBufferSet(bufferSet);
  if (!owner || typeof owner !== "object") throw new TypeError("平滑边界 correction owner 无效");
  if (current.owner === owner) return current;
  return freezeBufferSet(current.wordLength, current.segments, owner);
}

export function summarizeCellVisualCorrectionBufferSet(bufferSet) {
  const set = assertBufferSet(bufferSet);
  return {segmentCount: set.segments.length, vertexCount: set.vertexCount, triangleCount: set.triangleCount, byteLength: set.byteLength, maxSegmentBytes: CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES};
}

export function packCellVisualCorrectionIdentity(cellId, water = false) {
  if (!Number.isInteger(cellId) || cellId < 0 || cellId >= SURFACE_BASE_INVALID_CELL_ID) throw new RangeError("平滑边界 correction cellId 无效");
  return ((cellId & SURFACE_BASE_INVALID_CELL_ID) << 1 | Number(Boolean(water))) >>> 0;
}

function createBufferSet(gl, geometry, usage, owner) {
  const source = assertGeometry(geometry);
  assertGl(gl);
  const segments = [];
  try {
    for (const range of segmentRanges(source.length)) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("无法创建平滑边界 correction buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, source.subarray(range.start, range.end), usage);
      segments.push(segmentDescriptor(buffer, range));
    }
    return freezeBufferSet(source.length, segments, owner);
  } catch (error) {
    deleteCellVisualCorrectionBufferSet(gl, {segments});
    throw error;
  }
}

function collectEdgeOwners(map) {
  const result = new Map();
  for (const cell of map?.grid?.cells?.i || []) {
    const vertices = map.grid.cells.v?.[cell] || [];
    for (let index = 0; index < vertices.length; index++) {
      const first = Number(vertices[index]), second = Number(vertices[(index + 1) % vertices.length]);
      const key = `${Math.min(first, second)}:${Math.max(first, second)}`;
      const cells = result.get(key) || [];
      if (!cells.includes(Number(cell))) cells.push(Number(cell));
      result.set(key, cells);
    }
  }
  return result;
}

function correctionTargetCell(curve, owners, centerForCell) {
  const start = curve[0], end = curve[curve.length - 1], middle = curve[Math.floor(curve.length / 2)];
  const curveSide = Math.sign(cross(start, end, middle));
  if (!curveSide) return null;
  const firstSide = Math.sign(cross(start, end, centerForCell(owners[0])));
  const secondSide = Math.sign(cross(start, end, centerForCell(owners[1])));
  if (!firstSide || !secondSide || firstSide === secondSide) return null;
  return firstSide === curveSide ? owners[1] : owners[0];
}

function cross(start, end, point) {
  if (!Array.isArray(point) || point.length < 2) return 0;
  return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
}

function pushPackedTriangle(target, first, second, third, identity) {
  identityUintView[0] = identity;
  const packed = identityFloatView[0];
  target.push(first[0], first[1], packed, second[0], second[1], packed, third[0], third[1], packed);
}

function segmentRanges(wordLength) {
  if (!wordLength) return [{start: 0, end: 0}];
  const maxWords = Math.floor(CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES / 4 / CELL_VISUAL_CORRECTION_WORDS_PER_TRIANGLE) * CELL_VISUAL_CORRECTION_WORDS_PER_TRIANGLE;
  const ranges = [];
  for (let start = 0; start < wordLength; start += maxWords) ranges.push({start, end: Math.min(wordLength, start + maxWords)});
  return ranges;
}

function segmentDescriptor(buffer, range) {
  const vertexCount = (range.end - range.start) / CELL_VISUAL_CORRECTION_WORDS_PER_VERTEX;
  return Object.freeze({buffer, wordStart: range.start, wordEnd: range.end, wordLength: range.end - range.start, vertexCount, triangleCount: vertexCount / 3, byteLength: (range.end - range.start) * 4});
}

function freezeBufferSet(wordLength, segments, owner) {
  return Object.freeze({owner, segments: Object.freeze([...segments]), wordLength, vertexCount: wordLength / 3, triangleCount: wordLength / 9, byteLength: wordLength * 4});
}

function assertGeometry(value) {
  if (!(value instanceof Float32Array) || value.length % CELL_VISUAL_CORRECTION_WORDS_PER_TRIANGLE) throw new TypeError("平滑边界 correction geometry 必须是完整三角 Float32Array");
  return value;
}

function assertBufferSet(value) {
  if (!value || !Array.isArray(value.segments) || !Number.isInteger(value.vertexCount)) throw new TypeError("平滑边界 correction buffer set 无效");
  return value;
}

function assertGl(gl) {
  if (!gl?.createBuffer || !gl?.bindBuffer || !gl?.bufferData || !gl?.deleteBuffer) throw new TypeError("缺少 WebGL buffer 接口");
}

function defaultYield() {
  return globalThis.scheduler?.yield ? globalThis.scheduler.yield() : Promise.resolve();
}
