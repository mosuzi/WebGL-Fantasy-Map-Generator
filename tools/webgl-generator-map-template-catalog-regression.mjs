import assert from "node:assert/strict";
import {
  MAP_TEMPLATE_CATALOG_VERSION,
  MAP_TEMPLATE_MANIFESTS,
  MAP_TEMPLATE_SOURCES,
  getMapTemplateManifest,
  listMapTemplateManifests,
  normalizeMapTemplateRequest
} from "../app/webgl-generator/src/generator/map-template-catalog.js";

const expectedIds = [
  "world", "china", "europe", "north-america", "south-america", "africa", "asia", "east-asia",
  "australia-oceania", "antarctica", "central-plains", "honshu", "korean-peninsula", "middle-east",
  "holy-roman-empire-1789", "roman-empire-117"
];

assert.equal(MAP_TEMPLATE_CATALOG_VERSION, "1.0.0");
assert.deepEqual(MAP_TEMPLATE_MANIFESTS.map(item => item.id), expectedIds);
assert.strictEqual(listMapTemplateManifests(), MAP_TEMPLATE_MANIFESTS);
assert.equal(new Set(expectedIds).size, 16);
assert.deepEqual(Object.keys(MAP_TEMPLATE_SOURCES).sort(), [
  "gebco-2026", "holy-roman-empire-1789-commons", "natural-earth-5.1.2", "roman-empire-117-commons"
]);

for (const [index, manifest] of MAP_TEMPLATE_MANIFESTS.entries()) {
  assert.equal(manifest.order, index, `${manifest.id} 顺序错误`);
  assert.equal(manifest.catalogVersion, MAP_TEMPLATE_CATALOG_VERSION);
  assert.strictEqual(getMapTemplateManifest(manifest.id), manifest);
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.bounds));
  assert.ok(Object.isFrozen(manifest.protectedAnchors));
  assert.deepEqual(manifest.recommendedCells, [10_000, 50_000, 100_000]);
  assertBounds(manifest);
  assert.deepEqual(manifest.layers.slice(0, 4), ["land", "elevation", "hydrology", "region-mask"]);
  assert.ok(manifest.sourceIds.every(sourceId => MAP_TEMPLATE_SOURCES[sourceId]), `${manifest.id} 存在未知来源`);
  assert.ok(manifest.sourceIds.includes("natural-earth-5.1.2"));
  assert.ok(manifest.sourceIds.includes("gebco-2026"));
  assert.equal(new Set(manifest.protectedAnchors.map(anchor => anchor.id)).size, manifest.protectedAnchors.length);
  for (const anchor of manifest.protectedAnchors) assertAnchor(manifest, anchor);
  if (manifest.category === "historical") {
    assert.ok(Number.isInteger(manifest.snapshotYear));
    assert.ok(manifest.layers.includes("political"));
    assert.ok(manifest.resourceKeys.political);
    assert.ok(manifest.humanPreset);
  } else {
    assert.equal(manifest.snapshotYear, null);
    assert.equal(manifest.resourceKeys.political, null);
    assert.equal(manifest.humanPreset, null);
  }
}

assert.equal(getMapTemplateManifest("missing"), null);
assert.deepEqual(normalizeMapTemplateRequest({templateId: "world", cellsTarget: -1, seed: "a"}), {
  templateId: "world", templateVersion: "1.0.0", cellsTarget: 1, seed: "a"
});
assert.equal(normalizeMapTemplateRequest({templateId: "world", cellsTarget: 10_000}).cellsTarget, 10_000);
assert.equal(normalizeMapTemplateRequest({templateId: "world", cellsTarget: 100_000}).cellsTarget, 100_000);
assert.equal(normalizeMapTemplateRequest({templateId: "world", cellsTarget: 200_000}).cellsTarget, 100_000);
assert.throws(() => normalizeMapTemplateRequest({templateId: "missing", cellsTarget: 10_000}), /未知地图模板/u);

const chinaAnchors = new Set(getMapTemplateManifest("china").protectedAnchors.map(anchor => anchor.id));
for (const id of ["south-tibet", "aksai-chin", "taiwan", "paracel-islands", "spratly-islands", "diaoyu-islands"]) {
  assert.ok(chinaAnchors.has(id), `中国模板缺少 ${id}`);
}
assert.deepEqual(getMapTemplateManifest("east-asia").bounds, {west: 66, south: 19, east: 147, north: 57});
assert.deepEqual(getMapTemplateManifest("australia-oceania").protectedAnchors.map(anchor => anchor.id), ["australia", "new-guinea", "new-zealand"]);
assert.equal(getMapTemplateManifest("holy-roman-empire-1789").snapshotYear, 1789);
assert.equal(getMapTemplateManifest("roman-empire-117").snapshotYear, 117);

for (const source of Object.values(MAP_TEMPLATE_SOURCES)) {
  assert.match(source.url, /^https:\/\//u);
  assert.match(source.licenseUrl, /^https:\/\//u);
  assert.ok(source.license === "Public Domain" || source.license === "CC0-1.0");
  assert.ok(source.attribution);
}

console.log(JSON.stringify({
  ok: true,
  templates: MAP_TEMPLATE_MANIFESTS.length,
  sources: Object.keys(MAP_TEMPLATE_SOURCES).length,
  historical: MAP_TEMPLATE_MANIFESTS.filter(item => item.category === "historical").map(item => `${item.id}:${item.snapshotYear}`)
}));

function assertBounds(manifest) {
  const {west, south, east, north} = manifest.bounds;
  assert.ok(Number.isFinite(west) && west >= -180 && west <= 180);
  assert.ok(Number.isFinite(east) && east >= -180 && east <= 180);
  assert.ok(Number.isFinite(south) && south >= -90 && south <= 90);
  assert.ok(Number.isFinite(north) && north >= -90 && north <= 90);
  assert.ok(west < east && south < north, `${manifest.id} bbox 无效`);
  assert.ok(["equal-earth", "regional-equirectangular", "south-polar-stereographic"].includes(manifest.projection.id));
}

function assertAnchor(manifest, anchor) {
  assert.ok(anchor.id && anchor.name && anchor.kind);
  assert.ok(Number.isFinite(anchor.longitude) && Number.isFinite(anchor.latitude));
  assert.ok(anchor.longitude >= manifest.bounds.west && anchor.longitude <= manifest.bounds.east, `${manifest.id}/${anchor.id} 经度越界`);
  assert.ok(anchor.latitude >= manifest.bounds.south && anchor.latitude <= manifest.bounds.north, `${manifest.id}/${anchor.id} 纬度越界`);
  assert.ok(Number.isInteger(anchor.minCells) && anchor.minCells >= 1 && anchor.minCells <= 100_000);
}
