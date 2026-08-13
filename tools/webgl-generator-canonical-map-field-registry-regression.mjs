import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  CANONICAL_MAP_FIELD_REGISTRY,
  getCanonicalMapFieldDescriptor,
  listCanonicalMapSections,
  resolveCanonicalMapFieldDescriptor,
  validateCanonicalMapFieldRegistry
} from "../app/webgl-generator/src/runtime/canonical-map-field-registry.js";

const cellsTarget = Math.max(1000, Number(process.env.FMG_CANONICAL_MAP_CELLS) || 10000);
const map = generatePlaceholderMap({seed: `canonical-map-registry-${cellsTarget}`, cellsTarget, heightmapTemplate: "continents"});
const validation = validateCanonicalMapFieldRegistry();

assert.equal(validation.version, 1);
assert.equal(validation.fields, CANONICAL_MAP_FIELD_REGISTRY.length);
assert.equal(getCanonicalMapFieldDescriptor("grid-cells-v")?.encoding, "csr");
assert.equal(resolveCanonicalMapFieldDescriptor("grid.cells.v")?.id, "grid-cells-v");
assert.equal(resolveCanonicalMapFieldDescriptor("grid.cells.state")?.id, "grid-cell-columns");
assert.equal(resolveCanonicalMapFieldDescriptor("pack.cells.type")?.encoding, "string-dictionary");
assert.equal(resolveCanonicalMapFieldDescriptor("economy.deals")?.encoding, "object-table");
assert.equal(resolveCanonicalMapFieldDescriptor("unknown.path"), null);

const sectionPaths = new Set(listCanonicalMapSections().map(descriptor => descriptor.path));
const uncoveredSections = Object.keys(map).filter(key => !sectionPaths.has(key));
assert.deepEqual(uncoveredSections, [], `canonical 顶层 section 未登记：${uncoveredSections.join(", ")}`);

const dominantPaths = [
  "grid.cells.v", "grid.cells.c", "grid.cells.p", "grid.vertices.v", "grid.vertices.c", "grid.vertices.p",
  "pack.cells.v", "pack.cells.c", "pack.cells.p", "pack.cells.type", "pack.vertices.v", "pack.vertices.c", "pack.vertices.p",
  "economy.deals", "settlements.cities", "settlements.routes", "features.features", "rivers.rivers"
];
for (const path of dominantPaths) {
  const descriptor = resolveCanonicalMapFieldDescriptor(path);
  assert.ok(descriptor && descriptor.encoding !== "structured", `高体积字段不得退回 structured：${path}`);
}

const report = auditValue(map);
const typedArrayBytes = report.typedArrayBuffers.reduce((total, entry) => total + entry.byteLength, 0);
const jsonBytes = Buffer.byteLength(JSON.stringify(map, typedArrayReplacer));
const structureBytes = Buffer.byteLength(JSON.stringify(map, typedArrayDescriptorReplacer));
const sparseCandidates = report.arrays
  .filter(entry => entry.length >= 1000 && entry.numeric && entry.defaultRatio >= 0.5)
  .sort((left, right) => right.estimatedSparseSaving - left.estimatedSparseSaving)
  .slice(0, 20);

for (const entry of report.raggedArrays.filter(entry => entry.length >= 1000)) {
  const descriptor = resolveCanonicalMapFieldDescriptor(entry.path);
  assert.ok(["csr", "coordinate-pairs", "fixed-tuples"].includes(descriptor?.encoding), `大型嵌套数组必须登记紧凑形状：${entry.path}`);
}
assert.equal(resolveCanonicalMapFieldDescriptor("grid.cells.b")?.encoding, "bitset");
assert.equal(resolveCanonicalMapFieldDescriptor("pack.cells.b")?.encoding, "bitset");
assert.equal(resolveCanonicalMapFieldDescriptor("grid.points")?.encoding, "coordinate-pairs");
assert.equal(resolveCanonicalMapFieldDescriptor("features.shore.coastline")?.encoding, "fixed-tuples");
assert.equal(resolveCanonicalMapFieldDescriptor("features.shore.lakeShore")?.encoding, "fixed-tuples");
for (const entry of report.arrays.filter(entry => entry.length >= 1000 && hasArrayHoles(entry.value))) {
  assert.fail(`canonical 地图不得依赖 JS holey array：${entry.path}`);
}

const output = {
  ok: true,
  requestedCells: cellsTarget,
  actualCells: map.grid.metadata.actualCells,
  registry: validation,
  jsonBytes,
  structureBytes,
  typedArrayBytes,
  ragged: report.raggedArrays.filter(entry => entry.length >= 1000).map(({path, length, values}) => ({path, length, values})),
  sparseCandidates: sparseCandidates.map(({path, length, defaultValue, defaultRatio, estimatedSparseSaving}) => ({
    path, length, defaultValue, defaultRatio: round(defaultRatio), estimatedSparseSaving
  }))
};

console.log(JSON.stringify(output, null, 2));

function auditValue(root) {
  const arrays = [];
  const raggedArrays = [];
  const typedArrayBuffers = [];
  const seenBuffers = new Set();
  const stack = [{path: "", value: root}];
  while (stack.length) {
    const {path, value} = stack.pop();
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      if (!seenBuffers.has(value.buffer)) {
        seenBuffers.add(value.buffer);
        typedArrayBuffers.push({path, byteLength: value.buffer.byteLength});
      }
      continue;
    }
    if (Array.isArray(value)) {
      const numeric = value.every(item => typeof item === "number");
      const nested = value.every(item => Array.isArray(item));
      if (nested && value.length) raggedArrays.push({path, length: value.length, values: value.reduce((total, item) => total + item.length, 0)});
      const profile = numeric ? profileNumericArray(value) : null;
      const entry = {path, value, length: value.length, numeric, ...(profile || {})};
      arrays.push(entry);
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (value[index] && typeof value[index] === "object") stack.push({path: `${path}.${index}`, value: value[index]});
      }
      continue;
    }
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) stack.push({path: path ? `${path}.${key}` : key, value: child});
  }
  return {arrays, raggedArrays, typedArrayBuffers};
}

function profileNumericArray(value) {
  const counts = new Map();
  for (const item of value) counts.set(item, (counts.get(item) || 0) + 1);
  const [defaultValue, defaultCount] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] || [0, 0];
  const present = value.length - defaultCount;
  const denseBytes = value.length * 4;
  const sparseBytes = Math.ceil(value.length / 8) + present * 4;
  return {defaultValue, defaultRatio: value.length ? defaultCount / value.length : 0, estimatedSparseSaving: Math.max(0, denseBytes - sparseBytes)};
}

function hasArrayHoles(value) {
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) return true;
  return false;
}

function typedArrayReplacer(_key, value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
    ? {type: value.constructor.name, data: Array.from(value)}
    : value;
}

function typedArrayDescriptorReplacer(_key, value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
    ? {type: value.constructor.name, length: value.length}
    : value;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
