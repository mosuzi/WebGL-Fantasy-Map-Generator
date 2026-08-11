export const SURFACE_BASE_FLOATS_PER_VERTEX = 6;
export const SURFACE_BASE_FLOATS_PER_TRIANGLE = SURFACE_BASE_FLOATS_PER_VERTEX * 3;
export const SURFACE_BASE_MAX_SEGMENT_BYTES = 8 * 1024 * 1024;
export const SURFACE_BASE_MAX_SEGMENT_FLOATS = Math.floor(
  SURFACE_BASE_MAX_SEGMENT_BYTES / Float32Array.BYTES_PER_ELEMENT / SURFACE_BASE_FLOATS_PER_TRIANGLE
) * SURFACE_BASE_FLOATS_PER_TRIANGLE;

export function createSurfaceBaseBufferSet(gl, vertices, options = {}) {
  const source = assertSurfaceVertices(vertices);
  const usage = options.usage ?? gl?.STATIC_DRAW;
  const segments = [];
  try {
    for (const range of surfaceBaseSegmentRanges(source.length)) {
      segments.push(uploadSegment(gl, source, range, usage));
    }
    return buildBufferSet(source.length, segments);
  } catch (error) {
    deleteBuffers(gl, segments.map(segment => segment.buffer));
    throw error;
  }
}

export async function createSurfaceBaseBufferSetAsync(gl, vertices, options = {}) {
  const source = assertSurfaceVertices(vertices);
  const usage = options.usage ?? gl?.STATIC_DRAW;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const assertCurrent = typeof options.assertCurrent === "function" ? options.assertCurrent : () => {};
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const ranges = surfaceBaseSegmentRanges(source.length);
  const segments = [];
  try {
    for (let index = 0; index < ranges.length; index++) {
      assertCurrent();
      const segment = uploadSegment(gl, source, ranges[index], usage);
      segments.push(segment);
      onProgress?.({completed: index + 1, total: ranges.length, floatEnd: segment.floatEnd, floatLength: source.length});
      assertCurrent();
      if (index + 1 < ranges.length) {
        await yieldToMain();
        assertCurrent();
      }
    }
    return buildBufferSet(source.length, segments);
  } catch (error) {
    deleteBuffers(gl, segments.map(segment => segment.buffer));
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
  let floats = 0;
  for (const range of normalized) {
    for (const segment of set.segments) {
      const start = Math.max(range.start, segment.floatStart);
      const end = Math.min(range.end, segment.floatEnd);
      if (end <= start) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, segment.buffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        (start - segment.floatStart) * Float32Array.BYTES_PER_ELEMENT,
        source.subarray(start, end)
      );
      uploads++;
      floats += end - start;
    }
  }
  return {ranges: normalized.length, uploads, floats, bytes: floats * Float32Array.BYTES_PER_ELEMENT};
}

export function flattenSurfaceBaseBufferSet(bufferSet) {
  if (!bufferSet?.segments) return [];
  const seen = new Set();
  const buffers = [];
  for (const segment of bufferSet.segments) {
    if (!segment?.buffer || seen.has(segment.buffer)) continue;
    seen.add(segment.buffer);
    buffers.push(segment.buffer);
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
    vertexCount: set.vertexCount,
    triangleCount: set.triangleCount,
    maxSegmentBytes: set.maxSegmentBytes,
    segmentByteLengths: set.segments.map(segment => segment.byteLength)
  };
}

export function isSurfaceBaseBufferSetForVertices(bufferSet, vertices) {
  if (!(vertices instanceof Float32Array)) return false;
  try {
    const set = assertBufferSet(bufferSet);
    return set.floatLength === vertices.length
      && set.vertexCount === vertices.length / SURFACE_BASE_FLOATS_PER_VERTEX;
  } catch {
    return false;
  }
}

function surfaceBaseSegmentRanges(floatLength) {
  if (floatLength === 0) return [{start: 0, end: 0}];
  const ranges = [];
  for (let start = 0; start < floatLength; start += SURFACE_BASE_MAX_SEGMENT_FLOATS) {
    ranges.push({start, end: Math.min(floatLength, start + SURFACE_BASE_MAX_SEGMENT_FLOATS)});
  }
  return ranges;
}

function uploadSegment(gl, source, range, usage) {
  if (!gl?.createBuffer || !gl?.bindBuffer || !gl?.bufferData) throw new TypeError("surface base 缺少有效 WebGL context");
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("无法创建 surface base GPU buffer");
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, source.subarray(range.start, range.end), usage);
    return Object.freeze({
      buffer,
      floatStart: range.start,
      floatEnd: range.end,
      floatLength: range.end - range.start,
      byteLength: (range.end - range.start) * Float32Array.BYTES_PER_ELEMENT,
      vertexCount: (range.end - range.start) / SURFACE_BASE_FLOATS_PER_VERTEX,
      triangleCount: (range.end - range.start) / SURFACE_BASE_FLOATS_PER_TRIANGLE
    });
  } catch (error) {
    gl.deleteBuffer?.(buffer);
    throw error;
  }
}

function buildBufferSet(floatLength, segments) {
  return Object.freeze({
    segments: Object.freeze([...segments]),
    floatLength,
    byteLength: floatLength * Float32Array.BYTES_PER_ELEMENT,
    vertexCount: floatLength / SURFACE_BASE_FLOATS_PER_VERTEX,
    triangleCount: floatLength / SURFACE_BASE_FLOATS_PER_TRIANGLE,
    maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES
  });
}

function normalizeRanges(ranges, floatLength) {
  const normalized = [...(ranges || [])].map(range => {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > floatLength
      || start % SURFACE_BASE_FLOATS_PER_TRIANGLE !== 0 || end % SURFACE_BASE_FLOATS_PER_TRIANGLE !== 0) {
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
  if (!(vertices instanceof Float32Array) || vertices.length % SURFACE_BASE_FLOATS_PER_TRIANGLE !== 0) {
    throw new TypeError("surface base 顶点必须是 18-float 对齐的 Float32Array");
  }
  return vertices;
}

function assertBufferSet(bufferSet) {
  if (!bufferSet || !Array.isArray(bufferSet.segments)
    || !Number.isInteger(bufferSet.floatLength) || bufferSet.floatLength < 0
    || bufferSet.floatLength % SURFACE_BASE_FLOATS_PER_TRIANGLE !== 0
    || bufferSet.byteLength !== bufferSet.floatLength * Float32Array.BYTES_PER_ELEMENT
    || bufferSet.vertexCount !== bufferSet.floatLength / SURFACE_BASE_FLOATS_PER_VERTEX
    || bufferSet.triangleCount !== bufferSet.floatLength / SURFACE_BASE_FLOATS_PER_TRIANGLE
    || bufferSet.segments.length < 1) {
    throw new TypeError("surface base buffer set 结构无效");
  }
  let cursor = 0;
  for (const segment of bufferSet.segments) {
    if (!segment?.buffer || segment.floatStart !== cursor || segment.floatEnd < segment.floatStart
      || segment.floatEnd > bufferSet.floatLength
      || segment.floatStart % SURFACE_BASE_FLOATS_PER_TRIANGLE !== 0
      || segment.floatEnd % SURFACE_BASE_FLOATS_PER_TRIANGLE !== 0
      || segment.floatLength !== segment.floatEnd - segment.floatStart
      || segment.byteLength !== (segment.floatEnd - segment.floatStart) * Float32Array.BYTES_PER_ELEMENT
      || segment.vertexCount !== (segment.floatEnd - segment.floatStart) / SURFACE_BASE_FLOATS_PER_VERTEX
      || segment.triangleCount !== (segment.floatEnd - segment.floatStart) / SURFACE_BASE_FLOATS_PER_TRIANGLE
      || segment.byteLength > SURFACE_BASE_MAX_SEGMENT_BYTES) {
      throw new TypeError("surface base buffer segment 结构无效");
    }
    cursor = segment.floatEnd;
  }
  if (cursor !== bufferSet.floatLength) throw new TypeError("surface base buffer segments 未完整覆盖顶点");
  return bufferSet;
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
