import {
  decodeWebfmgV3DocumentChunksAsync,
  encodeWebfmgV3Document,
  inspectWebfmgV3Container
} from "./webfmg-v3-container.js";
import {applyMainThreadMapProjection} from "./main-thread-map-projection.js";
import {migrateMapDocument} from "./map-file-io.js";

export const MAP_ADOPTION_HANDOFF_KIND = "map-adoption-v3-sections";
export const MAP_ADOPTION_HANDOFF_CHUNK_BYTES = 256 * 1024;

export function createMapAdoptionHandoff(document) {
  const bytes = encodeWebfmgV3Document(document);
  return createMapAdoptionHandoffFromBytes(bytes);
}

export function createMapAdoptionHandoffFromBytes(source, {remigrate = false} = {}) {
  const bytes = normalizeBytes(source);
  const container = inspectWebfmgV3Container(bytes);
  return {
    kind: MAP_ADOPTION_HANDOFF_KIND,
    encoding: "webfmg-v3",
    byteLength: bytes.byteLength,
    chunks: splitBytes(bytes),
    sections: container.sections,
    schemaVersion: container.schemaVersion,
    remigrate: Boolean(remigrate)
  };
}

export async function materializeMapAdoptionHandoff(handoff, options = {}) {
  if (!handoff || handoff.kind !== MAP_ADOPTION_HANDOFF_KIND || handoff.encoding !== "webfmg-v3") {
    throw handoffError("map_adoption_handoff_invalid", "Worker 地图 adoption handoff 无效");
  }
  if (!Array.isArray(handoff.chunks) || !handoff.chunks.length) {
    throw handoffError("map_adoption_handoff_invalid", "Worker 地图 adoption handoff 缺少分区字节");
  }
  const chunks = handoff.chunks.map(normalizeBytes);
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (byteLength !== Number(handoff.byteLength) || chunks.some((chunk, index) => chunk.byteLength > MAP_ADOPTION_HANDOFF_CHUNK_BYTES || (!chunk.byteLength && index < chunks.length - 1))) {
    throw handoffError("map_adoption_handoff_mismatch", "Worker 地图 adoption handoff 分片长度不一致");
  }
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  try {
    const decoded = await decodeWebfmgV3DocumentChunksAsync(handoff.chunks, {
      ...options,
      byteLength,
      expectedSections: Number(handoff.sections),
      expectedSchemaVersion: Number(handoff.schemaVersion),
      consumeChunks: true,
      yieldToMain
    });
    const document = handoff.remigrate === true ? migrateMapDocument(decoded) : decoded;
    applyMainThreadMapProjection(document.map);
    return document;
  } finally {
    handoff.chunks.fill(null);
  }
}

function splitBytes(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.byteLength; offset += MAP_ADOPTION_HANDOFF_CHUNK_BYTES) {
    chunks.push(bytes.subarray(offset, Math.min(bytes.byteLength, offset + MAP_ADOPTION_HANDOFF_CHUNK_BYTES)));
  }
  return chunks.length ? chunks : [new Uint8Array(0)];
}

function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw handoffError("map_adoption_handoff_invalid", "Worker 地图 adoption handoff 缺少字节");
}

function handoffError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function defaultYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}
