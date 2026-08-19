export const SURFACE_SOURCE_FLOATS_PER_VERTEX = 6;
export const SURFACE_SOURCE_FLOATS_PER_TRIANGLE = SURFACE_SOURCE_FLOATS_PER_VERTEX * 3;
export const SURFACE_BASE_WORDS_PER_VERTEX = 3;
export const SURFACE_BASE_WORDS_PER_TRIANGLE = SURFACE_BASE_WORDS_PER_VERTEX * 3;
export const SURFACE_BASE_MAX_SEGMENT_BYTES = 8 * 1024 * 1024;
export const SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES = 4 * 1024 * 1024;
export const SURFACE_BASE_INVALID_CELL_ID = 0x3fffffff;
export const SURFACE_BASE_MAX_SEGMENT_VERTICES = Math.floor(
  SURFACE_BASE_MAX_SEGMENT_BYTES / Float32Array.BYTES_PER_ELEMENT / SURFACE_BASE_WORDS_PER_TRIANGLE
) * 3;
export const SURFACE_BASE_FLOATS_PER_TRIANGLE = SURFACE_SOURCE_FLOATS_PER_TRIANGLE;
export const SURFACE_BASE_MAX_SEGMENT_FLOATS = SURFACE_BASE_MAX_SEGMENT_VERTICES * SURFACE_SOURCE_FLOATS_PER_VERTEX;

export function createSurfaceResourceOwner(binding, options = {}) {
  const mapIdentity = String(binding?.mapIdentity ?? "");
  const mapRevision = Number(binding?.mapRevision ?? 0);
  const topologyRevision = Number(binding?.topologyRevision ?? 0);
  const surfaceFloatLength = Number(options.surfaceFloatLength ?? 0);
  const correctionWordLength = Number(options.correctionWordLength ?? 0);
  if (!mapIdentity || !Number.isSafeInteger(mapRevision) || mapRevision < 0
    || !Number.isSafeInteger(topologyRevision) || topologyRevision < 0
    || !Number.isSafeInteger(surfaceFloatLength) || surfaceFloatLength < 0
    || surfaceFloatLength % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0
    || !Number.isSafeInteger(correctionWordLength) || correctionWordLength < 0 || correctionWordLength % 9 !== 0) {
    throw new TypeError("surface resource owner 绑定无效");
  }
  return Object.freeze({
    mapIdentity,
    mapRevision,
    topologyRevision,
    surfaceFloatLength,
    correctionWordLength,
    rangeFingerprint: fingerprintSurfaceCellRanges(options.surfaceCellRanges, surfaceFloatLength)
  });
}

export function fingerprintSurfaceCellRanges(ranges, floatLength) {
  if (!(ranges instanceof Map)) throw new TypeError("surface resource owner 缺少 cell ranges");
  let hash = 0x811c9dc5;
  const mix = value => {
    hash ^= Number(value) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  mix(floatLength);
  mix(ranges.size);
  const entries = [...ranges].map(([cellId, range]) => [Number(cellId), Number(range?.start), Number(range?.end)])
    .sort((left, right) => left[0] - right[0]);
  for (const [cellId, start, end] of entries) {
    if (!Number.isSafeInteger(cellId) || cellId < 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end < start || end > floatLength) {
      throw new RangeError("surface resource owner cell range 无效");
    }
    mix(cellId);
    mix(start);
    mix(end);
  }
  return hash.toString(16).padStart(8, "0");
}

export function createSurfaceBaseBufferSet(gl, vertices, options = {}) {
  const source = assertSurfaceVertices(vertices);
  const spans = normalizeCellRanges(options.surfaceCellRanges, source.length);
  const usage = options.usage ?? gl?.STATIC_DRAW;
  const segments = [];
  try {
    for (const range of surfaceBaseSegmentRanges(source.length)) {
      segments.push(uploadSegment(gl, materializeSegment(source, range, spans), range, usage));
    }
    return buildBufferSet(source.length, segments, options.owner || null);
  } catch (error) {
    deleteBuffers(gl, segments.flatMap(segmentBuffers));
    throw error;
  }
}

export async function createSurfaceBaseBufferSetAsync(gl, vertices, options = {}) {
  const source = assertSurfaceVertices(vertices);
  const spans = normalizeCellRanges(options.surfaceCellRanges, source.length);
  const usage = options.usage ?? gl?.STATIC_DRAW;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const assertCurrent = typeof options.assertCurrent === "function" ? options.assertCurrent : () => {};
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const uploadSliceBytes = Math.max(256 * 1024, Number(options.uploadSliceBytes) || SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES);
  const ranges = surfaceBaseSegmentRanges(source.length);
  const segments = [];
  try {
    for (let index = 0; index < ranges.length; index++) {
      assertCurrent();
      const materialized = await materializeSegmentAsync(source, ranges[index], spans, {yieldToMain, assertCurrent});
      const segment = await uploadSegmentAsync(gl, materialized, ranges[index], usage, {
        uploadSliceBytes,
        yieldToMain,
        assertCurrent
      });
      segments.push(segment);
      onProgress?.({completed: index + 1, total: ranges.length, floatEnd: segment.floatEnd, floatLength: source.length});
      assertCurrent();
      if (index + 1 < ranges.length) {
        await yieldToMain();
        assertCurrent();
      }
    }
    return buildBufferSet(source.length, segments, options.owner || null);
  } catch (error) {
    deleteBuffers(gl, segments.flatMap(segmentBuffers));
    throw error;
  }
}

export function replaceSurfaceBaseBufferSet(gl, current, replacement) {
  assertBufferSet(replacement);
  if (current === replacement) return replacement;
  const keep = new Set(flattenSurfaceBaseBufferSet(replacement));
  deleteSurfaceBaseBufferSet(gl, current, {preserve: keep});
  return replacement;
}

export function uploadSurfaceBaseBufferSetRanges(gl, bufferSet, vertices, ranges) {
  const set = assertBufferSet(bufferSet);
  const source = assertSurfaceVertices(vertices);
  if (source.length !== set.floatLength) throw new RangeError("surface base 顶点长度与 buffer set 不一致");
  const normalized = normalizeRanges(ranges, source.length);
  let uploads = 0;
  let sourceFloats = 0;
  let bytes = 0;
  for (const range of normalized) {
    for (const segment of set.segments) {
      const start = Math.max(range.start, segment.floatStart);
      const end = Math.min(range.end, segment.floatEnd);
      if (end <= start) continue;
      const colors = materializeColors(source, start, end);
      const vertexOffset = (start - segment.floatStart) / SURFACE_SOURCE_FLOATS_PER_VERTEX;
      gl.bindBuffer(gl.ARRAY_BUFFER, segment.colorBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, vertexOffset * 3 * Float32Array.BYTES_PER_ELEMENT, colors);
      uploads++;
      sourceFloats += end - start;
      bytes += colors.byteLength;
    }
  }
  return {ranges: normalized.length, uploads, floats: sourceFloats, bytes};
}

export function flattenSurfaceBaseBufferSet(bufferSet) {
  if (!bufferSet?.segments) return [];
  const seen = new Set();
  const buffers = [];
  for (const segment of bufferSet.segments) {
    for (const buffer of segmentBuffers(segment)) {
      if (!buffer || seen.has(buffer)) continue;
      seen.add(buffer);
      buffers.push(buffer);
    }
  }
  return buffers;
}

export function deleteSurfaceBaseBufferSet(gl, bufferSet, {preserve = null} = {}) {
  const protectedBuffers = preserve instanceof Set ? preserve : new Set(preserve || []);
  const buffers = flattenSurfaceBaseBufferSet(bufferSet).filter(buffer => !protectedBuffers.has(buffer));
  deleteBuffers(gl, buffers);
  return buffers.length;
}

export function summarizeSurfaceBaseBufferSet(bufferSet) {
  const set = assertBufferSet(bufferSet);
  return {
    segmentCount: set.segments.length,
    floatLength: set.floatLength,
    byteLength: set.byteLength,
    colorByteLength: set.colorByteLength,
    totalGpuByteLength: set.totalGpuByteLength,
    vertexCount: set.vertexCount,
    triangleCount: set.triangleCount,
    maxSegmentBytes: set.maxSegmentBytes,
    segmentByteLengths: set.segments.map(segment => segment.byteLength),
    segmentColorByteLengths: set.segments.map(segment => segment.colorByteLength)
  };
}

export function isSurfaceBaseBufferSetForVertices(bufferSet, vertices, owner = null) {
  if (!(vertices instanceof Float32Array)) return false;
  try {
    const set = assertBufferSet(bufferSet);
    return (!owner || set.owner === owner)
      && set.floatLength === vertices.length
      && set.vertexCount === vertices.length / SURFACE_SOURCE_FLOATS_PER_VERTEX;
  } catch {
    return false;
  }
}

export function unpackSurfaceBaseIdentity(word) {
  const value = Number(word) >>> 0;
  return {cellId: value >>> 1, water: Boolean(value & 1)};
}

function surfaceBaseSegmentRanges(floatLength) {
  if (floatLength === 0) return [{start: 0, end: 0}];
  const sourceFloatsPerSegment = SURFACE_BASE_MAX_SEGMENT_VERTICES * SURFACE_SOURCE_FLOATS_PER_VERTEX;
  const ranges = [];
  for (let start = 0; start < floatLength; start += sourceFloatsPerSegment) {
    ranges.push({start, end: Math.min(floatLength, start + sourceFloatsPerSegment)});
  }
  return ranges;
}

function uploadSegment(gl, materialized, range, usage) {
  assertGl(gl, false);
  const geometryBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  if (!geometryBuffer || !colorBuffer) {
    deleteBuffers(gl, [geometryBuffer, colorBuffer]);
    throw new Error("无法创建 surface base GPU buffer");
  }
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, materialized.geometry, usage);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, materialized.colors, usage);
    return createSegmentDescriptor(range, geometryBuffer, colorBuffer);
  } catch (error) {
    deleteBuffers(gl, [geometryBuffer, colorBuffer]);
    throw error;
  }
}

async function uploadSegmentAsync(gl, materialized, range, usage, {uploadSliceBytes, yieldToMain, assertCurrent}) {
  assertGl(gl, true);
  const geometryBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  if (!geometryBuffer || !colorBuffer) {
    deleteBuffers(gl, [geometryBuffer, colorBuffer]);
    throw new Error("无法创建 surface base GPU buffer");
  }
  try {
    await uploadTypedArrayAsync(gl, geometryBuffer, materialized.geometry, usage, uploadSliceBytes, yieldToMain, assertCurrent);
    await yieldToMain();
    assertCurrent();
    await uploadTypedArrayAsync(gl, colorBuffer, materialized.colors, usage, uploadSliceBytes, yieldToMain, assertCurrent);
    return createSegmentDescriptor(range, geometryBuffer, colorBuffer);
  } catch (error) {
    deleteBuffers(gl, [geometryBuffer, colorBuffer]);
    throw error;
  }
}

async function uploadTypedArrayAsync(gl, buffer, source, usage, uploadSliceBytes, yieldToMain, assertCurrent) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, source.byteLength, usage);
  const valuesPerSlice = Math.max(1, Math.floor(uploadSliceBytes / source.BYTES_PER_ELEMENT));
  for (let offset = 0; offset < source.length; offset += valuesPerSlice) {
    assertCurrent();
    const end = Math.min(source.length, offset + valuesPerSlice);
    gl.bufferSubData(gl.ARRAY_BUFFER, offset * source.BYTES_PER_ELEMENT, source.subarray(offset, end));
    if (end < source.length) {
      await yieldToMain();
      assertCurrent();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    }
  }
}

function createSegmentDescriptor(range, geometryBuffer, colorBuffer) {
  const vertexCount = (range.end - range.start) / SURFACE_SOURCE_FLOATS_PER_VERTEX;
  return Object.freeze({
    buffer: geometryBuffer,
    geometryBuffer,
    colorBuffer,
    floatStart: range.start,
    floatEnd: range.end,
    floatLength: range.end - range.start,
    byteLength: vertexCount * SURFACE_BASE_WORDS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
    colorByteLength: vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT,
    totalGpuByteLength: vertexCount * (SURFACE_BASE_WORDS_PER_VERTEX + 3) * Float32Array.BYTES_PER_ELEMENT,
    vertexCount,
    triangleCount: vertexCount / 3
  });
}

function buildBufferSet(floatLength, segments, owner) {
  const vertexCount = floatLength / SURFACE_SOURCE_FLOATS_PER_VERTEX;
  const byteLength = segments.reduce((total, segment) => total + segment.byteLength, 0);
  const colorByteLength = segments.reduce((total, segment) => total + segment.colorByteLength, 0);
  return Object.freeze({
    owner,
    segments: Object.freeze([...segments]),
    floatLength,
    byteLength,
    colorByteLength,
    totalGpuByteLength: byteLength + colorByteLength,
    vertexCount,
    triangleCount: vertexCount / 3,
    maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES
  });
}

function materializeSegment(source, range, spans) {
  const vertexCount = (range.end - range.start) / SURFACE_SOURCE_FLOATS_PER_VERTEX;
  const geometry = new Float32Array(vertexCount * SURFACE_BASE_WORDS_PER_VERTEX);
  const identities = new Uint32Array(geometry.buffer);
  const colors = new Float32Array(vertexCount * 3);
  let spanIndex = findSpanIndex(spans, range.start);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const sourceOffset = range.start + vertex * SURFACE_SOURCE_FLOATS_PER_VERTEX;
    while (spanIndex < spans.length && spans[spanIndex].end <= sourceOffset) spanIndex++;
    writeMaterializedVertex(source, sourceOffset, geometry, identities, colors, vertex, spans[spanIndex]);
  }
  return {geometry, colors};
}

async function materializeSegmentAsync(source, range, spans, {yieldToMain, assertCurrent}) {
  const vertexCount = (range.end - range.start) / SURFACE_SOURCE_FLOATS_PER_VERTEX;
  const geometry = new Float32Array(vertexCount * SURFACE_BASE_WORDS_PER_VERTEX);
  const identities = new Uint32Array(geometry.buffer);
  const colors = new Float32Array(vertexCount * 3);
  let spanIndex = findSpanIndex(spans, range.start);
  const sliceVertices = 32 * 1024;
  for (let startVertex = 0; startVertex < vertexCount; startVertex += sliceVertices) {
    assertCurrent();
    const endVertex = Math.min(vertexCount, startVertex + sliceVertices);
    for (let vertex = startVertex; vertex < endVertex; vertex++) {
      const sourceOffset = range.start + vertex * SURFACE_SOURCE_FLOATS_PER_VERTEX;
      while (spanIndex < spans.length && spans[spanIndex].end <= sourceOffset) spanIndex++;
      writeMaterializedVertex(source, sourceOffset, geometry, identities, colors, vertex, spans[spanIndex]);
    }
    if (endVertex < vertexCount) {
      await yieldToMain();
      assertCurrent();
    }
  }
  return {geometry, colors};
}

function writeMaterializedVertex(source, sourceOffset, geometry, identities, colors, vertex, span) {
  const geometryOffset = vertex * SURFACE_BASE_WORDS_PER_VERTEX;
  geometry[geometryOffset] = source[sourceOffset];
  geometry[geometryOffset + 1] = source[sourceOffset + 1];
  const cellId = span && sourceOffset >= span.start && sourceOffset < span.end ? span.cellId : SURFACE_BASE_INVALID_CELL_ID;
  const water = source[sourceOffset + 5] >= 0.5 ? 1 : 0;
  identities[geometryOffset + 2] = ((cellId & SURFACE_BASE_INVALID_CELL_ID) << 1 | water) >>> 0;
  const colorOffset = vertex * 3;
  colors[colorOffset] = source[sourceOffset + 2];
  colors[colorOffset + 1] = source[sourceOffset + 3];
  colors[colorOffset + 2] = source[sourceOffset + 4];
}

function materializeColors(source, start, end) {
  const vertexCount = (end - start) / SURFACE_SOURCE_FLOATS_PER_VERTEX;
  const colors = new Float32Array(vertexCount * 3);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const sourceOffset = start + vertex * SURFACE_SOURCE_FLOATS_PER_VERTEX;
    const colorOffset = vertex * 3;
    colors[colorOffset] = source[sourceOffset + 2];
    colors[colorOffset + 1] = source[sourceOffset + 3];
    colors[colorOffset + 2] = source[sourceOffset + 4];
  }
  return colors;
}

function normalizeCellRanges(ranges, floatLength) {
  if (!(ranges instanceof Map) || !ranges.size) return [];
  const spans = [...ranges].map(([cellId, range]) => ({
    cellId: Number(cellId),
    start: Number(range?.start),
    end: Number(range?.end)
  })).sort((left, right) => left.start - right.start || left.end - right.end || left.cellId - right.cellId);
  let cursor = 0;
  for (const span of spans) {
    if (!Number.isInteger(span.cellId) || span.cellId < 0 || span.cellId >= SURFACE_BASE_INVALID_CELL_ID
      || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < cursor || span.end <= span.start
      || span.end > floatLength || span.start % SURFACE_SOURCE_FLOATS_PER_VERTEX !== 0
      || span.end % SURFACE_SOURCE_FLOATS_PER_VERTEX !== 0) {
      throw new RangeError("surface base cell range 无效");
    }
    cursor = span.end;
  }
  return spans;
}

function findSpanIndex(spans, offset) {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (spans[middle].end <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function normalizeRanges(ranges, floatLength) {
  const normalized = [...(ranges || [])].map(range => {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > floatLength
      || start % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0 || end % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0) {
      throw new RangeError("surface base range 必须是有效的 18-float 对齐区间");
    }
    return {start, end};
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({...range});
  }
  return merged;
}

function assertSurfaceVertices(vertices) {
  if (!(vertices instanceof Float32Array) || vertices.length % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0) {
    throw new TypeError("surface base 顶点必须是 18-float 对齐的 Float32Array");
  }
  return vertices;
}

function assertBufferSet(bufferSet) {
  if (!bufferSet || !Array.isArray(bufferSet.segments)
    || !Number.isInteger(bufferSet.floatLength) || bufferSet.floatLength < 0
    || bufferSet.floatLength % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0
    || bufferSet.vertexCount !== bufferSet.floatLength / SURFACE_SOURCE_FLOATS_PER_VERTEX
    || bufferSet.triangleCount !== bufferSet.vertexCount / 3
    || bufferSet.segments.length < 1) {
    throw new TypeError("surface base buffer set 结构无效");
  }
  let cursor = 0;
  let geometryBytes = 0;
  let colorBytes = 0;
  for (const segment of bufferSet.segments) {
    if (!segment?.geometryBuffer || segment.buffer !== segment.geometryBuffer || !segment.colorBuffer
      || segment.floatStart !== cursor || segment.floatEnd < segment.floatStart || segment.floatEnd > bufferSet.floatLength
      || segment.floatStart % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0
      || segment.floatEnd % SURFACE_SOURCE_FLOATS_PER_TRIANGLE !== 0
      || segment.floatLength !== segment.floatEnd - segment.floatStart
      || segment.vertexCount !== segment.floatLength / SURFACE_SOURCE_FLOATS_PER_VERTEX
      || segment.triangleCount !== segment.vertexCount / 3
      || segment.byteLength !== segment.vertexCount * SURFACE_BASE_WORDS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT
      || segment.colorByteLength !== segment.vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT
      || segment.totalGpuByteLength !== segment.byteLength + segment.colorByteLength
      || segment.byteLength > SURFACE_BASE_MAX_SEGMENT_BYTES) {
      throw new TypeError("surface base buffer segment 结构无效");
    }
    cursor = segment.floatEnd;
    geometryBytes += segment.byteLength;
    colorBytes += segment.colorByteLength;
  }
  if (cursor !== bufferSet.floatLength || bufferSet.byteLength !== geometryBytes
    || bufferSet.colorByteLength !== colorBytes || bufferSet.totalGpuByteLength !== geometryBytes + colorBytes) {
    throw new TypeError("surface base buffer segments 未完整覆盖顶点");
  }
  return bufferSet;
}

function segmentBuffers(segment) {
  return [segment?.geometryBuffer || segment?.buffer, segment?.colorBuffer].filter(Boolean);
}

function assertGl(gl, asyncUpload) {
  if (!gl?.createBuffer || !gl?.bindBuffer || !gl?.bufferData || (asyncUpload && !gl?.bufferSubData)) {
    throw new TypeError("surface base 缺少有效 WebGL context");
  }
}

function deleteBuffers(gl, buffers) {
  const seen = new Set();
  for (const buffer of buffers) {
    if (!buffer || seen.has(buffer)) continue;
    seen.add(buffer);
    gl?.deleteBuffer?.(buffer);
  }
}

function defaultYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}
