import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapDocument, migrateMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {decodeCompactBinaryValue, decodeCompactBinaryValueAsync, encodeCompactBinaryValue} from "../app/webgl-generator/src/runtime/compact-binary-value-codec.js";
import {createMapAdoptionHandoff, materializeMapAdoptionHandoff} from "../app/webgl-generator/src/runtime/map-adoption-handoff.js";
import {applyMainThreadMapProjection} from "../app/webgl-generator/src/runtime/main-thread-map-projection.js";
import {
  decodeWebfmgV3Document,
  decodeWebfmgV3DocumentAsync,
  decodeWebfmgV3DocumentChunksAsync,
  encodeWebfmgV3Document,
  gzipWebfmgV3Bytes,
  inspectWebfmgV3Container,
  isWebfmgV3Bytes
} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";

const target = Math.max(1000, Number(process.env.FMG_WEBFMG_V3_CELLS) || 10000);
const fixture = {
  sparse: [0, 0, 0, 0, 12, 0, 0, -3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  decimals: [1.25, -2.5, 17.75, 0],
  ragged: [[1, 7, 4], [8, 3], [], [12, 11, 13, 9]],
  points: [[1.25, 2.5], [3.75, 4], [-1.5, 9.25], [0, 0]],
  typed: new Uint16Array([0, 0, 2, 65535, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  table: [
    {id: 1, name: "甲", price: 1.25}, {id: 2, name: "乙", price: 2.5},
    {id: 3, name: "甲", price: 3.75}, {id: 4, name: "乙", price: 4}
  ]
};
assert.deepEqual(decodeCompactBinaryValue(encodeCompactBinaryValue(fixture)), fixture);
assert.deepEqual(await decodeCompactBinaryValueAsync(encodeCompactBinaryValue(fixture)), fixture);
assert.throws(() => encodeCompactBinaryValue(new Array(8)), error => error?.code === "compact_binary_holey_array");

const map = generatePlaceholderMap({seed: `canonical-map-registry-${target}`, cellsTarget: target, heightmapTemplate: "continents"});
const document = createMapDocument(map, map.options);
const startedAt = performance.now();
const raw = encodeWebfmgV3Document(document);
const encodedAt = performance.now();
const gzip = await gzipWebfmgV3Bytes(raw);
const decoded = decodeWebfmgV3Document(raw);
let asyncYields = 0;
const decodedAsync = await decodeWebfmgV3DocumentAsync(raw, {yieldToMain: async () => { asyncYields++; }});
assert.deepEqual(decodedAsync, decoded, "v3 async decode 必须与同步兼容入口同源");
assert.ok(asyncYields > 0, "v3 async decode 没有执行有界让步");
const handoff = createMapAdoptionHandoff(document);
assert.ok(handoff.chunks.length > 1 && handoff.chunks.every(chunk => chunk.byteLength <= 256 * 1024), "adoption handoff 必须使用独立有界分片");
const materialized = await materializeMapAdoptionHandoff(handoff);
for (const key of ["temp", "prec"]) assert.equal(typeof Object.getOwnPropertyDescriptor(materialized.map.pack.cells, key)?.get, "function", `main-thread ${key} 派生列必须保持惰性`);
assert.deepEqual(materialized, decoded, "adoption handoff materialize 漂移");
for (const key of ["temp", "prec"]) assert.ok(Array.isArray(Object.getOwnPropertyDescriptor(materialized.map.pack.cells, key)?.value), `main-thread ${key} 首次读取后必须精确物化`);
assert.ok(handoff.chunks.every(chunk => chunk === null), "adoption handoff 解码后必须释放全部 chunk 引用");
const divergent = {grid: {cells: {temp: [1, 2], prec: [3, 4]}}, pack: {cells: {g: [0, 1], temp: [1, 9], prec: [3, 4]}}};
applyMainThreadMapProjection(divergent);
assert.equal(Object.getOwnPropertyDescriptor(divergent.pack.cells, "temp")?.get, undefined, "非同源 pack 派生列不得被惰性投影掩盖");
const directChunkBytes = 1021;
const directChunks = Array.from({length: Math.ceil(raw.byteLength / directChunkBytes)}, (_, index) => raw.slice(index * directChunkBytes, Math.min(raw.byteLength, (index + 1) * directChunkBytes)));
assert.deepEqual(await decodeWebfmgV3DocumentChunksAsync(directChunks, {byteLength: raw.byteLength}), decoded, "任意边界 v3 chunks 解码漂移");
await assert.rejects(() => decodeWebfmgV3DocumentChunksAsync([raw.slice(0, raw.byteLength - 1)], {byteLength: raw.byteLength}), error => error?.code === "webfmg_v3_truncated");
const corruptedHandoff = createMapAdoptionHandoff(document);
const corruptedChunk = corruptedHandoff.chunks.at(-1);
corruptedChunk[corruptedChunk.byteLength - 1] ^= 1;
await assert.rejects(() => materializeMapAdoptionHandoff(corruptedHandoff), error => error?.code === "webfmg_v3_checksum_mismatch");
assert.ok(corruptedHandoff.chunks.every(chunk => chunk === null), "adoption handoff 失败后必须释放全部 chunk 引用");
const migrated = migrateMapDocument(decoded);
const legacyExpected = parseMapDocument(stringifyMapDocument(document));
const completedAt = performance.now();

assert.equal(isWebfmgV3Bytes(raw), true);
assert.deepEqual(migrated, legacyExpected, "v3 必须精确 round-trip 既有存档合同中的全部 canonical 字段");
for (const [target, source, label] of [
  [decoded.map.pack.deals, decoded.map.economy.deals, "pack/economy"],
  [decoded.map.pack.states, decoded.map.politics.states, "pack/politics"],
  [decoded.map.grid.points, decoded.map.grid.cells.p, "grid points"]
]) {
  const originalTarget = label === "pack/economy" ? document.map.pack.deals : label === "pack/politics" ? document.map.pack.states : document.map.grid.points;
  const originalSource = label === "pack/economy" ? document.map.economy.deals : label === "pack/politics" ? document.map.politics.states : document.map.grid.cells.p;
  if (originalTarget === originalSource) assert.equal(target, source, `${label} alias 必须在迁移前恢复`);
}
assert.deepEqual(migrated.map.grid.vertices.c, document.map.grid.vertices.c, "Grid vertex-cell 拓扑顺序漂移");
assert.deepEqual(migrated.map.grid.vertices.v, document.map.grid.vertices.v, "Grid vertex-neighbor 拓扑顺序漂移");
assert.deepEqual(migrated.map.pack.vertices.c, document.map.pack.vertices.c, "Pack vertex-cell 拓扑顺序漂移");
assert.deepEqual(migrated.map.pack.vertices.v, document.map.pack.vertices.v, "Pack vertex-neighbor 拓扑顺序漂移");

const inspection = inspectWebfmgV3Container(raw);
assert.equal(inspection.version, 3);
assert.ok(inspection.sections >= 20);
if (target >= 100000) {
  assert.ok(raw.byteLength <= 16 * 1024 * 1024, `100k v3 raw 超过 16MiB：${raw.byteLength}`);
  assert.ok(gzip.byteLength <= 8 * 1024 * 1024, `100k v3 gzip 超过 8MiB：${gzip.byteLength}`);
}

const corrupt = raw.slice();
corrupt[corrupt.length - 1] ^= 1;
assert.throws(() => decodeWebfmgV3Document(corrupt), error => error?.code === "webfmg_v3_checksum_mismatch");
const invalidDirectory = raw.slice();
new DataView(invalidDirectory.buffer).setUint32(20, raw.byteLength + 1, true);
assert.throws(() => decodeWebfmgV3Document(invalidDirectory), error => error?.code === "webfmg_v3_directory_invalid");

console.log(JSON.stringify({
  ok: true,
  requestedCells: target,
  actualCells: map.grid.metadata.actualCells,
  rawBytes: raw.byteLength,
  gzipBytes: gzip.byteLength,
  sections: inspection.sections,
  encodeMs: Math.round((encodedAt - startedAt) * 10) / 10,
  totalMs: Math.round((completedAt - startedAt) * 10) / 10
}, null, 2));
