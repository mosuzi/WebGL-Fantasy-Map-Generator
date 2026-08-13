import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapDocument, migrateMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {decodeCompactBinaryValue, encodeCompactBinaryValue} from "../app/webgl-generator/src/runtime/compact-binary-value-codec.js";
import {
  decodeWebfmgV3Document,
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
assert.throws(() => encodeCompactBinaryValue(new Array(8)), error => error?.code === "compact_binary_holey_array");

const map = generatePlaceholderMap({seed: `canonical-map-registry-${target}`, cellsTarget: target, heightmapTemplate: "continents"});
const document = createMapDocument(map, map.options);
const startedAt = performance.now();
const raw = encodeWebfmgV3Document(document);
const encodedAt = performance.now();
const gzip = await gzipWebfmgV3Bytes(raw);
const decoded = decodeWebfmgV3Document(raw);
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
