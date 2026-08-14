import {listCanonicalMapSections} from "./canonical-map-field-registry.js";
import {decodeCompactBinaryValue, decodeCompactBinaryValueAsync, encodeCompactBinaryValue} from "./compact-binary-value-codec.js";

export const WEBFMG_V3_CONTAINER_VERSION = 3;
export const WEBFMG_V3_MIME_TYPE = "application/x-webfmg-v3";

const MAGIC = new Uint8Array([0x57, 0x45, 0x42, 0x46, 0x4d, 0x47, 0x33, 0x00]);
const HEADER_BYTES = 16;
const DIRECTORY_BYTES = 24;
const CODEC_COMPACT_VALUE = 1;
const TOPOLOGY_MARKER = "webfmg-derived-vertex-topology-v1";
const KNOWN_ALIASES = Object.freeze([
  ["pack.deals", "economy.deals"], ["pack.markets", "economy.markets"], ["pack.goods", "economy.goods"],
  ["pack.states", "politics.states"], ["pack.provinces", "politics.provinces"],
  ["pack.rivers", "rivers.rivers"], ["pack.markers", "markers.markers"], ["pack.zones", "zones.zones"],
  ["pack.cultures", "society.cultures"], ["pack.religions", "society.religions"],
  ["grid.points", "grid.cells.p"]
]);

export function encodeWebfmgV3Document(document) {
  if (!document?.map || typeof document.map !== "object") throw containerError("webfmg_v3_document_invalid", "v3 地图文档缺少 map");
  const sections = listCanonicalMapSections();
  const aliases = collectAliases(document.map);
  const header = {...document, map: undefined, aliases};
  delete header.map;
  const entries = [{id: 0, name: "document", payload: encodeCompactBinaryValue(header)}];
  for (let index = 0; index < sections.length; index += 1) {
    const descriptor = sections[index];
    if (!Object.hasOwn(document.map, descriptor.path)) continue;
    const sectionValue = prepareSectionForEncoding(descriptor.path, document.map[descriptor.path], aliases);
    entries.push({id: index + 1, name: descriptor.path, payload: encodeCompactBinaryValue(sectionValue)});
  }
  const directorySize = entries.length * DIRECTORY_BYTES;
  const totalBytes = HEADER_BYTES + directorySize + entries.reduce((total, entry) => total + entry.payload.byteLength, 0);
  if (totalBytes > 0xffffffff) throw containerError("webfmg_v3_too_large", "v3 地图容器超过 4GiB");
  const output = new Uint8Array(totalBytes);
  output.set(MAGIC, 0);
  const view = new DataView(output.buffer);
  view.setUint16(8, WEBFMG_V3_CONTAINER_VERSION, true);
  view.setUint16(10, Number(document?.metadata?.mapSchemaVersion || document?.map?.metadata?.schemaVersion || 0), true);
  view.setUint32(12, entries.length, true);
  let payloadOffset = HEADER_BYTES + directorySize;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const directoryOffset = HEADER_BYTES + index * DIRECTORY_BYTES;
    view.setUint16(directoryOffset, entry.id, true);
    view.setUint16(directoryOffset + 2, CODEC_COMPACT_VALUE, true);
    view.setUint32(directoryOffset + 4, payloadOffset, true);
    view.setUint32(directoryOffset + 8, entry.payload.byteLength, true);
    view.setUint32(directoryOffset + 12, entry.payload.byteLength, true);
    view.setUint32(directoryOffset + 16, checksumBytes(entry.payload), true);
    view.setUint32(directoryOffset + 20, 0, true);
    output.set(entry.payload, payloadOffset);
    payloadOffset += entry.payload.byteLength;
  }
  return output;
}

export function decodeWebfmgV3Document(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (!isWebfmgV3Bytes(bytes)) throw containerError("webfmg_v3_magic_invalid", "文件不是 `.webfmg v3` 容器");
  if (bytes.byteLength < HEADER_BYTES) throw containerError("webfmg_v3_truncated", "v3 地图容器头被截断");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  if (version !== WEBFMG_V3_CONTAINER_VERSION) throw containerError("webfmg_v3_version_unsupported", `不支持 v3 容器版本 ${version}`);
  const count = view.getUint32(12, true);
  if (!count || HEADER_BYTES + count * DIRECTORY_BYTES > bytes.byteLength) throw containerError("webfmg_v3_directory_invalid", "v3 地图分区目录无效");
  const descriptors = listCanonicalMapSections();
  const seen = new Set();
  let header = null;
  const map = {};
  for (let index = 0; index < count; index += 1) {
    const offset = HEADER_BYTES + index * DIRECTORY_BYTES;
    const id = view.getUint16(offset, true);
    const codec = view.getUint16(offset + 2, true);
    const start = view.getUint32(offset + 4, true);
    const length = view.getUint32(offset + 8, true);
    const rawLength = view.getUint32(offset + 12, true);
    const checksum = view.getUint32(offset + 16, true);
    if (seen.has(id) || codec !== CODEC_COMPACT_VALUE || rawLength !== length || start < HEADER_BYTES + count * DIRECTORY_BYTES || start + length > bytes.byteLength) {
      throw containerError("webfmg_v3_directory_invalid", `v3 地图分区目录项无效：${id}`);
    }
    seen.add(id);
    const payload = bytes.subarray(start, start + length);
    if (checksumBytes(payload) !== checksum) throw containerError("webfmg_v3_checksum_mismatch", `v3 地图分区 checksum 不一致：${id}`);
    const value = decodeCompactBinaryValue(payload);
    if (id === 0) header = value;
    else {
      const descriptor = descriptors[id - 1];
      if (!descriptor) throw containerError("webfmg_v3_section_unknown", `v3 地图分区 ID 未登记：${id}`);
      map[descriptor.path] = restoreDecodedSection(descriptor.path, value);
    }
  }
  if (!header || !seen.has(0)) throw containerError("webfmg_v3_document_invalid", "v3 地图容器缺少文档头");
  applyAliases(map, header.aliases || []);
  const document = {...header, map};
  delete document.aliases;
  return document;
}

export async function decodeWebfmgV3DocumentAsync(source, options = {}) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (!isWebfmgV3Bytes(bytes)) throw containerError("webfmg_v3_magic_invalid", "文件不是 `.webfmg v3` 容器");
  if (bytes.byteLength < HEADER_BYTES) throw containerError("webfmg_v3_truncated", "v3 地图容器头被截断");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  if (version !== WEBFMG_V3_CONTAINER_VERSION) throw containerError("webfmg_v3_version_unsupported", `不支持 v3 容器版本 ${version}`);
  const count = view.getUint32(12, true);
  if (!count || HEADER_BYTES + count * DIRECTORY_BYTES > bytes.byteLength) throw containerError("webfmg_v3_directory_invalid", "v3 地图分区目录无效");
  const descriptors = listCanonicalMapSections();
  const seen = new Set();
  const checkpoint = createAsyncCheckpoint(options);
  let header = null;
  const map = {};
  for (let index = 0; index < count; index += 1) {
    const offset = HEADER_BYTES + index * DIRECTORY_BYTES;
    const id = view.getUint16(offset, true);
    const codec = view.getUint16(offset + 2, true);
    const start = view.getUint32(offset + 4, true);
    const length = view.getUint32(offset + 8, true);
    const rawLength = view.getUint32(offset + 12, true);
    const checksum = view.getUint32(offset + 16, true);
    if (seen.has(id) || codec !== CODEC_COMPACT_VALUE || rawLength !== length || start < HEADER_BYTES + count * DIRECTORY_BYTES || start + length > bytes.byteLength) {
      throw containerError("webfmg_v3_directory_invalid", `v3 地图分区目录项无效：${id}`);
    }
    seen.add(id);
    const payload = bytes.subarray(start, start + length);
    if (await checksumBytesAsync(payload, checkpoint) !== checksum) throw containerError("webfmg_v3_checksum_mismatch", `v3 地图分区 checksum 不一致：${id}`);
    const value = await decodeCompactBinaryValueAsync(payload, options);
    if (id === 0) header = value;
    else {
      const descriptor = descriptors[id - 1];
      if (!descriptor) throw containerError("webfmg_v3_section_unknown", `v3 地图分区 ID 未登记：${id}`);
      map[descriptor.path] = await restoreDecodedSectionAsync(descriptor.path, value, checkpoint);
    }
    await checkpoint(true);
  }
  if (!header || !seen.has(0)) throw containerError("webfmg_v3_document_invalid", "v3 地图容器缺少文档头");
  applyAliases(map, header.aliases || []);
  const document = {...header, map};
  delete document.aliases;
  return document;
}

export async function decodeWebfmgV3DocumentChunksAsync(sourceChunks, options = {}) {
  if (!Array.isArray(sourceChunks) || !sourceChunks.length) throw containerError("webfmg_v3_truncated", "v3 地图容器缺少分片");
  const chunks = sourceChunks.map(normalizeContainerChunk);
  const offsets = [0];
  for (const chunk of chunks) offsets.push(offsets[offsets.length - 1] + chunk.byteLength);
  const byteLength = offsets[offsets.length - 1];
  if (Number.isFinite(Number(options.byteLength)) && Number(options.byteLength) !== byteLength) {
    throw containerError("webfmg_v3_truncated", "v3 地图容器分片长度不一致");
  }
  const headerBytes = readChunkRange(chunks, offsets, 0, HEADER_BYTES);
  if (!isWebfmgV3Bytes(headerBytes)) throw containerError("webfmg_v3_magic_invalid", "文件不是 `.webfmg v3` 容器");
  const headerView = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  const version = headerView.getUint16(8, true);
  if (version !== WEBFMG_V3_CONTAINER_VERSION) throw containerError("webfmg_v3_version_unsupported", `不支持 v3 容器版本 ${version}`);
  const schemaVersion = headerView.getUint16(10, true);
  const count = headerView.getUint32(12, true);
  const directoryEnd = HEADER_BYTES + count * DIRECTORY_BYTES;
  if (!count || directoryEnd > byteLength) throw containerError("webfmg_v3_directory_invalid", "v3 地图分区目录无效");
  if (Number.isFinite(Number(options.expectedSections)) && Number(options.expectedSections) !== count) {
    throw containerError("webfmg_v3_directory_invalid", "v3 地图分区数量与 handoff 不一致");
  }
  if (Number.isFinite(Number(options.expectedSchemaVersion)) && Number(options.expectedSchemaVersion) !== schemaVersion) {
    throw containerError("webfmg_v3_version_unsupported", "v3 地图 schema 与 handoff 不一致");
  }

  const directoryBytes = readChunkRange(chunks, offsets, 0, directoryEnd);
  const directoryView = new DataView(directoryBytes.buffer, directoryBytes.byteOffset, directoryBytes.byteLength);
  const descriptors = listCanonicalMapSections();
  const seen = new Set();
  const entries = [];
  const chunkUses = new Uint32Array(chunks.length);
  for (let index = 0; index < count; index += 1) {
    const offset = HEADER_BYTES + index * DIRECTORY_BYTES;
    const entry = {
      id: directoryView.getUint16(offset, true),
      codec: directoryView.getUint16(offset + 2, true),
      start: directoryView.getUint32(offset + 4, true),
      length: directoryView.getUint32(offset + 8, true),
      rawLength: directoryView.getUint32(offset + 12, true),
      checksum: directoryView.getUint32(offset + 16, true)
    };
    if (seen.has(entry.id) || entry.codec !== CODEC_COMPACT_VALUE || entry.rawLength !== entry.length || entry.start < directoryEnd || entry.start + entry.length > byteLength) {
      throw containerError("webfmg_v3_directory_invalid", `v3 地图分区目录项无效：${entry.id}`);
    }
    seen.add(entry.id);
    entries.push(entry);
    forEachChunkRange(offsets, entry.start, entry.start + entry.length, chunkIndex => { chunkUses[chunkIndex]++; });
  }

  const checkpoint = createAsyncCheckpoint(options);
  let documentHeader = null;
  const map = {};
  releaseUnusedChunks(chunks, sourceChunks, chunkUses, options.consumeChunks === true);
  for (const entry of entries) {
    const payload = readChunkRange(chunks, offsets, entry.start, entry.start + entry.length);
    if (await checksumBytesAsync(payload, checkpoint) !== entry.checksum) {
      throw containerError("webfmg_v3_checksum_mismatch", `v3 地图分区 checksum 不一致：${entry.id}`);
    }
    const value = await decodeCompactBinaryValueAsync(payload, options);
    if (entry.id === 0) documentHeader = value;
    else {
      const descriptor = descriptors[entry.id - 1];
      if (!descriptor) throw containerError("webfmg_v3_section_unknown", `v3 地图分区 ID 未登记：${entry.id}`);
      map[descriptor.path] = await restoreDecodedSectionAsync(descriptor.path, value, checkpoint);
    }
    forEachChunkRange(offsets, entry.start, entry.start + entry.length, chunkIndex => {
      chunkUses[chunkIndex]--;
      if (!chunkUses[chunkIndex]) releaseChunk(chunks, sourceChunks, chunkIndex, options.consumeChunks === true);
    });
    await checkpoint(true);
  }
  if (!documentHeader || !seen.has(0)) throw containerError("webfmg_v3_document_invalid", "v3 地图容器缺少文档头");
  applyAliases(map, documentHeader.aliases || []);
  const document = {...documentHeader, map};
  delete document.aliases;
  return document;
}

export function isWebfmgV3Bytes(source) {
  const bytes = source instanceof Uint8Array ? source : source instanceof ArrayBuffer ? new Uint8Array(source) : null;
  return Boolean(bytes && bytes.byteLength >= MAGIC.length && MAGIC.every((byte, index) => bytes[index] === byte));
}

export function inspectWebfmgV3Container(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (!isWebfmgV3Bytes(bytes)) throw containerError("webfmg_v3_magic_invalid", "文件不是 `.webfmg v3` 容器");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(12, true);
  return Object.freeze({version: view.getUint16(8, true), schemaVersion: view.getUint16(10, true), sections: count, bytes: bytes.byteLength});
}

export async function gzipWebfmgV3Bytes(source, view = globalThis) {
  if (typeof view.CompressionStream !== "function") throw containerError("webfmg_v3_gzip_unavailable", "当前环境不支持 gzip 压缩");
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const blob = await new view.Response(new view.Blob([bytes]).stream().pipeThrough(new view.CompressionStream("gzip"))).blob();
  return new Uint8Array(await blob.arrayBuffer());
}

export async function gunzipWebfmgV3Bytes(source, view = globalThis) {
  if (typeof view.DecompressionStream !== "function") throw containerError("webfmg_v3_gzip_unavailable", "当前环境不支持 gzip 解压");
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const blob = await new view.Response(new view.Blob([bytes]).stream().pipeThrough(new view.DecompressionStream("gzip"))).blob();
  return new Uint8Array(await blob.arrayBuffer());
}

function prepareSectionForEncoding(name, value, aliases) {
  let section = value;
  if (name === "pack") {
    section = {...value};
    for (const [target] of aliases) {
      if (target.startsWith("pack.") && !target.slice(5).includes(".")) delete section[target.slice(5)];
    }
  }
  if (name === "grid" && aliases.some(([target]) => target === "grid.points")) {
    section = {...section};
    delete section.points;
  }
  if ((name === "grid" || name === "pack") && section?.cells?.v && section?.vertices?.c && section?.vertices?.v) {
    section = {
      ...section,
      vertices: {
        ...section.vertices,
        c: encodeDerivedVertexRows(section.cells.v, section.vertices.c, "cells"),
        v: encodeDerivedVertexRows(section.cells.v, section.vertices.v, "vertices")
      }
    };
  }
  return section;
}

function normalizeContainerChunk(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw containerError("webfmg_v3_truncated", "v3 地图容器分片无效");
}

function readChunkRange(chunks, offsets, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > offsets[offsets.length - 1]) {
    throw containerError("webfmg_v3_truncated", "v3 地图容器读取范围无效");
  }
  const length = end - start;
  if (!length) return new Uint8Array(0);
  let first = 0;
  while (first < chunks.length && offsets[first + 1] <= start) first++;
  if (first >= chunks.length || !chunks[first]) throw containerError("webfmg_v3_truncated", "v3 地图容器分片已缺失");
  if (end <= offsets[first + 1]) return chunks[first].subarray(start - offsets[first], end - offsets[first]);
  const output = new Uint8Array(length);
  let outputOffset = 0;
  for (let index = first; index < chunks.length && offsets[index] < end; index += 1) {
    const chunk = chunks[index];
    if (!chunk) throw containerError("webfmg_v3_truncated", "v3 地图容器分片已缺失");
    const localStart = Math.max(start, offsets[index]) - offsets[index];
    const localEnd = Math.min(end, offsets[index + 1]) - offsets[index];
    output.set(chunk.subarray(localStart, localEnd), outputOffset);
    outputOffset += localEnd - localStart;
  }
  return output;
}

function forEachChunkRange(offsets, start, end, callback) {
  if (end <= start) return;
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1] <= start) index++;
  while (index + 1 < offsets.length && offsets[index] < end) callback(index++);
}

function releaseUnusedChunks(chunks, sourceChunks, chunkUses, consume) {
  for (let index = 0; index < chunks.length; index += 1) {
    if (!chunkUses[index]) releaseChunk(chunks, sourceChunks, index, consume);
  }
}

function releaseChunk(chunks, sourceChunks, index, consume) {
  chunks[index] = null;
  if (consume) sourceChunks[index] = null;
}

function restoreDecodedSection(name, value) {
  if ((name === "grid" || name === "pack") && value?.cells?.v) {
    value.vertices.c = decodeDerivedVertexRows(value.cells.v, value.vertices.c, "cells", value.vertices.p?.length || 0);
    value.vertices.v = decodeDerivedVertexRows(value.cells.v, value.vertices.v, "vertices", value.vertices.p?.length || 0);
  }
  return value;
}

async function restoreDecodedSectionAsync(name, value, checkpoint) {
  if ((name === "grid" || name === "pack") && value?.cells?.v) {
    value.vertices.c = await decodeDerivedVertexRowsAsync(value.cells.v, value.vertices.c, "cells", value.vertices.p?.length || 0, checkpoint);
    value.vertices.v = await decodeDerivedVertexRowsAsync(value.cells.v, value.vertices.v, "vertices", value.vertices.p?.length || 0, checkpoint);
  }
  return value;
}

function encodeDerivedVertexRows(cellVertices, rows, kind) {
  const derived = deriveVertexRows(cellVertices, rows.length, kind);
  const permutations = new Uint8Array(rows.length).fill(255);
  const exceptions = [];
  for (let index = 0; index < rows.length; index += 1) {
    const base = derived[index];
    const row = rows[index];
    const permutation = permutationRank(row, base);
    if (permutation < 0 || permutation > 254) exceptions.push({index, row});
    else permutations[index] = permutation;
  }
  return {format: TOPOLOGY_MARKER, kind, rows: rows.length, permutations, exceptions};
}

function decodeDerivedVertexRows(cellVertices, descriptor, kind, rows) {
  if (descriptor?.format !== TOPOLOGY_MARKER || descriptor.kind !== kind || descriptor.rows !== rows) {
    throw containerError("webfmg_v3_topology_invalid", `v3 ${kind} 拓扑描述无效`);
  }
  const output = deriveVertexRows(cellVertices, rows, kind);
  const exceptions = new Map(descriptor.exceptions.map(entry => [entry.index, entry.row]));
  for (let index = 0; index < output.length; index += 1) {
    if (descriptor.permutations[index] === 255) {
      const row = exceptions.get(index);
      if (!row) throw containerError("webfmg_v3_topology_invalid", `v3 ${kind} 拓扑例外缺失：${index}`);
      output[index] = row;
    } else output[index] = applyPermutationRank(output[index], descriptor.permutations[index]);
  }
  if (exceptions.size !== descriptor.exceptions.length) throw containerError("webfmg_v3_topology_invalid", `v3 ${kind} 拓扑例外重复`);
  return output;
}

async function decodeDerivedVertexRowsAsync(cellVertices, descriptor, kind, rows, checkpoint) {
  if (descriptor?.format !== TOPOLOGY_MARKER || descriptor.kind !== kind || descriptor.rows !== rows) {
    throw containerError("webfmg_v3_topology_invalid", `v3 ${kind} 拓扑描述无效`);
  }
  const output = await deriveVertexRowsAsync(cellVertices, rows, kind, checkpoint);
  const exceptions = new Map(descriptor.exceptions.map(entry => [entry.index, entry.row]));
  for (let index = 0; index < output.length; index += 1) {
    if (descriptor.permutations[index] === 255) {
      const row = exceptions.get(index);
      if (!row) throw containerError("webfmg_v3_topology_invalid", `v3 ${kind} 拓扑例外缺失：${index}`);
      output[index] = row;
    } else output[index] = applyPermutationRank(output[index], descriptor.permutations[index]);
    if (!(index & 1023)) await checkpoint();
  }
  if (exceptions.size !== descriptor.exceptions.length) throw containerError("webfmg_v3_topology_invalid", `v3 ${kind} 拓扑例外重复`);
  return output;
}

function deriveVertexRows(cellVertices, count, kind) {
  const sets = Array.from({length: count}, () => new Set());
  for (let cell = 0; cell < cellVertices.length; cell += 1) {
    const vertices = cellVertices[cell];
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index];
      if (!sets[vertex]) continue;
      if (kind === "cells") sets[vertex].add(cell);
      else {
        sets[vertex].add(vertices[(index + vertices.length - 1) % vertices.length]);
        sets[vertex].add(vertices[(index + 1) % vertices.length]);
      }
    }
  }
  return sets.map(set => {
    const row = [...set].sort((left, right) => left - right);
    if (kind === "vertices" && row.length === 2) row.unshift(-1);
    return row;
  });
}

async function deriveVertexRowsAsync(cellVertices, count, kind, checkpoint) {
  const sets = Array.from({length: count}, () => new Set());
  for (let cell = 0; cell < cellVertices.length; cell += 1) {
    const vertices = cellVertices[cell];
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index];
      if (!sets[vertex]) continue;
      if (kind === "cells") sets[vertex].add(cell);
      else {
        sets[vertex].add(vertices[(index + vertices.length - 1) % vertices.length]);
        sets[vertex].add(vertices[(index + 1) % vertices.length]);
      }
    }
    if (!(cell & 1023)) await checkpoint();
  }
  const output = new Array(sets.length);
  for (let index = 0; index < sets.length; index += 1) {
    const row = [...sets[index]].sort((left, right) => left - right);
    if (kind === "vertices" && row.length === 2) row.unshift(-1);
    output[index] = row;
    if (!(index & 1023)) await checkpoint();
  }
  return output;
}

function permutationRank(row, sorted) {
  if (!Array.isArray(row) || row.length !== sorted.length || row.length > 6) return -1;
  const available = [...sorted];
  let rank = 0;
  for (let index = 0; index < row.length; index += 1) {
    const position = available.indexOf(row[index]);
    if (position < 0) return -1;
    rank += position * factorial(row.length - index - 1);
    available.splice(position, 1);
  }
  return rank;
}

function applyPermutationRank(sorted, rank) {
  const available = [...sorted];
  const output = [];
  let remaining = rank;
  for (let index = 0; index < sorted.length; index += 1) {
    const factor = factorial(sorted.length - index - 1);
    const position = factor ? Math.floor(remaining / factor) : 0;
    remaining = factor ? remaining % factor : 0;
    if (position >= available.length) throw containerError("webfmg_v3_topology_invalid", "v3 拓扑顺序码无效");
    output.push(available.splice(position, 1)[0]);
  }
  return output;
}

function factorial(value) {
  let output = 1;
  for (let index = 2; index <= value; index += 1) output *= index;
  return output;
}

function collectAliases(map) {
  return KNOWN_ALIASES.filter(([target, source]) => readPath(map, target) === readPath(map, source));
}

function applyAliases(map, aliases) {
  for (const pair of aliases) {
    if (!Array.isArray(pair) || pair.length !== 2 || !KNOWN_ALIASES.some(known => known[0] === pair[0] && known[1] === pair[1])) {
      throw containerError("webfmg_v3_alias_invalid", "v3 地图 alias 未登记");
    }
    writePath(map, pair[0], readPath(map, pair[1]));
  }
}

function readPath(root, path) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

function writePath(root, path, value) {
  const parts = path.split(".");
  const key = parts.pop();
  let owner = root;
  for (const part of parts) {
    if (!owner?.[part] || typeof owner[part] !== "object") throw containerError("webfmg_v3_alias_invalid", `v3 地图 alias 目标不存在：${path}`);
    owner = owner[part];
  }
  owner[key] = value;
}

function checksumBytes(bytes) {
  let checksum = 0x811c9dc5;
  for (const byte of bytes) {
    checksum ^= byte;
    checksum = Math.imul(checksum, 0x01000193) >>> 0;
  }
  return checksum;
}

async function checksumBytesAsync(bytes, checkpoint) {
  let checksum = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    checksum ^= bytes[index];
    checksum = Math.imul(checksum, 0x01000193) >>> 0;
    if (!(index & 0x3ffff)) await checkpoint();
  }
  return checksum;
}

function createAsyncCheckpoint(options) {
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultAsyncYield;
  let deadline = containerNow() + budgetMs;
  return async (force = false) => {
    if (!force && containerNow() < deadline) return;
    await yieldToMain();
    deadline = containerNow() + budgetMs;
  };
}

function defaultAsyncYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function containerNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function containerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
