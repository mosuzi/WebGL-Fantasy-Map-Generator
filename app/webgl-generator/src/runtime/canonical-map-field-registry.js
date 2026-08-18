export const CANONICAL_MAP_FIELD_REGISTRY_VERSION = 2;

export const CANONICAL_MAP_ENCODINGS = Object.freeze([
  "structured",
  "dense",
  "bitset",
  "csr",
  "coordinate-pairs",
  "fixed-tuples",
  "string-dictionary",
  "object-table"
]);

export const CANONICAL_MAP_PATCH_MODES = Object.freeze([
  "replace",
  "ranges",
  "sparse-values",
  "table-rows"
]);

export const CANONICAL_MAP_STATE_KINDS = Object.freeze(["canonical", "persisted-presentation"]);

const descriptorRows = [
  ["metadata", "metadata", "structured", "replace"],
  ["options", "options", "structured", "replace"],
  ["layers", "layers", "structured", "replace", {stateKind: "persisted-presentation"}],
  ["heightmap", "heightmap", "structured", "replace"],
  ["grid", "grid", "structured", "replace"],
  ["climate", "climate", "structured", "replace"],
  ["ocean-currents", "oceanCurrents", "structured", "replace"],
  ["map-coordinates", "mapCoordinates", "structured", "replace"],
  ["society", "society", "structured", "replace"],
  ["politics", "politics", "structured", "replace"],
  ["settlements", "settlements", "structured", "replace"],
  ["economy", "economy", "structured", "replace"],
  ["diplomacy", "diplomacy", "structured", "replace"],
  ["military", "military", "structured", "replace"],
  ["markers", "markers", "structured", "replace"],
  ["zones", "zones", "structured", "replace"],
  ["pack", "pack", "structured", "replace"],
  ["features", "features", "structured", "replace"],
  ["rivers", "rivers", "structured", "replace"],
  ["regeneration-locks", "regenerationLocks", "object-table", "table-rows"],
  ["namebases", "namebases", "object-table", "table-rows", {optional: true}],
  ["summary", "summary", "structured", "replace"],
  ["generation-log", "generationLog", "string-dictionary", "replace"],
  ["status", "status", "structured", "replace"],
  // Keep new top-level sections after the original 24 entries so existing webfmg v3 section ids stay stable.
  ["notes", "notes", "structured", "replace"],
  ["measurements", "measurements", "structured", "replace"],
  ["labels", "labels", "structured", "replace"],
  ["visual-theme", "visualTheme", "structured", "replace", {stateKind: "persisted-presentation"}],
  ["display", "display", "structured", "replace", {optional: true, stateKind: "persisted-presentation"}],
  ["options-visual-theme", "options.visualTheme", "structured", "replace", {stateKind: "persisted-presentation"}],

  ["grid-cells-v", "grid.cells.v", "csr", "replace", {valueType: "uint32", item: "cell-polygon"}],
  ["grid-cells-c", "grid.cells.c", "csr", "replace", {valueType: "uint32", item: "cell-neighbors"}],
  ["grid-cells-b", "grid.cells.b", "bitset", "sparse-values"],
  ["grid-cells-p", "grid.cells.p", "coordinate-pairs", "ranges", {valueType: "float64"}],
  ["grid-points", "grid.points", "coordinate-pairs", "ranges", {valueType: "float64"}],
  ["grid-vertices-p", "grid.vertices.p", "coordinate-pairs", "ranges", {valueType: "float64"}],
  ["grid-vertices-v", "grid.vertices.v", "csr", "replace", {valueType: "uint32", item: "vertex-neighbors"}],
  ["grid-vertices-c", "grid.vertices.c", "csr", "replace", {valueType: "uint32", item: "vertex-cells"}],

  ["pack-cells-v", "pack.cells.v", "csr", "replace", {valueType: "uint32", item: "cell-polygon"}],
  ["pack-cells-c", "pack.cells.c", "csr", "replace", {valueType: "uint32", item: "cell-neighbors"}],
  ["pack-cells-b", "pack.cells.b", "bitset", "sparse-values"],
  ["pack-cells-p", "pack.cells.p", "coordinate-pairs", "ranges", {valueType: "float64"}],
  ["pack-cells-type", "pack.cells.type", "string-dictionary", "sparse-values"],
  ["pack-cells-routes", "pack.cells.routes", "structured", "replace"],
  ["pack-vertices-p", "pack.vertices.p", "coordinate-pairs", "ranges", {valueType: "float64"}],
  ["pack-vertices-v", "pack.vertices.v", "csr", "replace", {valueType: "uint32", item: "vertex-neighbors"}],
  ["pack-vertices-c", "pack.vertices.c", "csr", "replace", {valueType: "uint32", item: "vertex-cells"}],

  ["grid-cell-columns", "grid.cells.*", "dense", "ranges", {valueType: "range-audited"}],
  ["pack-cell-columns", "pack.cells.*", "dense", "ranges", {valueType: "runtime-or-range-audited"}],

  ["society-cultures", "society.cultures", "object-table", "table-rows"],
  ["society-religions", "society.religions", "object-table", "table-rows"],
  ["politics-states", "politics.states", "object-table", "table-rows"],
  ["politics-provinces", "politics.provinces", "object-table", "table-rows"],
  ["politics-regions", "politics.regions", "object-table", "table-rows"],
  ["settlement-cities", "settlements.cities", "object-table", "table-rows"],
  ["settlement-routes", "settlements.routes", "object-table", "table-rows"],
  ["economy-goods", "economy.goods", "object-table", "table-rows"],
  ["economy-markets", "economy.markets", "object-table", "table-rows"],
  ["economy-deals", "economy.deals", "object-table", "table-rows"],
  ["military-regiments", "military.regiments", "object-table", "table-rows", {optional: true}],
  ["marker-records", "markers.markers", "object-table", "table-rows"],
  ["zone-records", "zones.zones", "object-table", "table-rows"],
  ["feature-records", "features.features", "object-table", "table-rows"],
  ["feature-coastline", "features.shore.coastline", "fixed-tuples", "replace", {valueType: "uint32", item: "segment-2x2"}],
  ["feature-lake-shore", "features.shore.lakeShore", "fixed-tuples", "replace", {valueType: "uint32", item: "segment-2x2"}],
  ["river-records", "rivers.rivers", "object-table", "table-rows"]
];

export const CANONICAL_MAP_FIELD_REGISTRY = Object.freeze(descriptorRows.map(createDescriptor));

const descriptorById = new Map(CANONICAL_MAP_FIELD_REGISTRY.map(descriptor => [descriptor.id, descriptor]));
const descriptorsBySpecificity = [...CANONICAL_MAP_FIELD_REGISTRY].sort((left, right) => specificity(right.path) - specificity(left.path));

export function getCanonicalMapFieldDescriptor(id) {
  return descriptorById.get(String(id || "")) || null;
}

export function resolveCanonicalMapFieldDescriptor(path) {
  const normalized = normalizePath(path);
  return descriptorsBySpecificity.find(descriptor => pathMatches(descriptor.path, normalized)) || null;
}

export function resolveCanonicalMapWriteDescriptor(path) {
  const normalized = normalizePath(path);
  return descriptorsBySpecificity.find(descriptor => (
    pathMatches(descriptor.path, normalized)
    || (!descriptor.path.includes("*") && normalized.startsWith(`${descriptor.path}.`))
  )) || null;
}

export function listCanonicalMapSections() {
  return CANONICAL_MAP_FIELD_REGISTRY.filter(descriptor => !descriptor.path.includes(".") && !descriptor.path.includes("*"));
}

export function validateCanonicalMapFieldRegistry(registry = CANONICAL_MAP_FIELD_REGISTRY) {
  if (!Array.isArray(registry) || !registry.length) throw new Error("canonical 地图字段 registry 不能为空");
  const ids = new Set();
  const paths = new Set();
  for (const descriptor of registry) {
    if (!descriptor || typeof descriptor !== "object" || Object.isFrozen(descriptor) !== true) throw new Error("字段 descriptor 必须冻结");
    if (!/^[a-z0-9-]+$/u.test(descriptor.id)) throw new Error(`字段 id 无效：${descriptor.id}`);
    if (ids.has(descriptor.id)) throw new Error(`字段 id 重复：${descriptor.id}`);
    ids.add(descriptor.id);
    if (!descriptor.path || descriptor.path.startsWith(".") || descriptor.path.endsWith(".")) throw new Error(`字段 path 无效：${descriptor.path}`);
    if (paths.has(descriptor.path)) throw new Error(`字段 path 重复：${descriptor.path}`);
    paths.add(descriptor.path);
    if (!CANONICAL_MAP_ENCODINGS.includes(descriptor.encoding)) throw new Error(`字段 encoding 无效：${descriptor.encoding}`);
    if (!CANONICAL_MAP_PATCH_MODES.includes(descriptor.patchMode)) throw new Error(`字段 patch mode 无效：${descriptor.patchMode}`);
    if (!CANONICAL_MAP_STATE_KINDS.includes(descriptor.stateKind)) throw new Error(`字段 state kind 无效：${descriptor.stateKind}`);
    if (descriptor.encoding === "csr" && descriptor.patchMode !== "replace") throw new Error(`CSR 字段首期必须整体替换：${descriptor.path}`);
  }
  return Object.freeze({version: CANONICAL_MAP_FIELD_REGISTRY_VERSION, fields: registry.length, sections: listCanonicalMapSections().length});
}

function createDescriptor([id, path, encoding, patchMode, options = {}]) {
  return Object.freeze({
    id,
    path,
    encoding,
    patchMode,
    persistence: "map-document",
    stateKind: options.stateKind || "canonical",
    optional: options.optional === true,
    ...(options.valueType ? {valueType: options.valueType} : {}),
    ...(options.item ? {item: options.item} : {})
  });
}

function normalizePath(path) {
  return Array.isArray(path) ? path.map(String).join(".") : String(path || "").trim();
}

function pathMatches(pattern, path) {
  const expected = pattern.split(".");
  const actual = path.split(".");
  if (expected.length !== actual.length) return false;
  return expected.every((part, index) => part === "*" || part === actual[index]);
}

function specificity(path) {
  return path.split(".").reduce((score, part) => score + (part === "*" ? 0 : 2), 0);
}
