import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {getMapTemplateManifest} from "../app/webgl-generator/src/generator/map-template-catalog.js";
import {parseMapTemplateHistoricalResource} from "../app/webgl-generator/src/generator/map-template-historical-resource.js";
import {parseMapTemplatePhysicalResource} from "../app/webgl-generator/src/generator/map-template-physical-resource.js";
import {runGenerationWorkerTask} from "../app/webgl-generator/src/runtime/generation-worker-task.js";

const root = new URL("../app/webgl-generator/public/assets/map-templates/", import.meta.url);
const physicalMetadata = JSON.parse(await readFile(new URL("world-physical-2026-v1.json", root), "utf8"));
const physicalResource = parseMapTemplatePhysicalResource(physicalMetadata, await readFile(new URL("world-physical-2026-v1.bin", root)));
const fixtures = [
  {id: "roman-empire-117", year: 117, name: "罗马帝国", coreClasses: [1, 2], clientClass: 3},
  {id: "holy-roman-empire-1789", year: 1789, name: "神圣罗马帝国", coreClasses: [1], clientClass: 0}
];
const summaries = [];

for (const fixture of fixtures) {
  const historicalId = `${fixture.id}-political-v1`;
  const historicalMetadata = JSON.parse(await readFile(new URL(`${historicalId}.json`, root), "utf8"));
  const historicalResource = parseMapTemplateHistoricalResource(historicalMetadata, await readFile(new URL(`${historicalId}.bin`, root)));
  const result = await runGenerationWorkerTask({
    options: {
      seed: `task324-${fixture.id}`,
      cellsTarget: 10_000,
      graphWidth: 720,
      graphHeight: 480,
      statesNumber: 12,
      provincesRatio: 30,
      religionsNumber: 4,
      culturesNumber: 8
    },
    mapTemplate: {manifest: getMapTemplateManifest(fixture.id), resource: physicalResource, historicalResource}
  }, {checkpoint: () => true});
  const map = result.map;
  const preset = map.metadata.mapTemplate?.humanPreset;
  assert.equal(map.metadata.mapTemplate.id, fixture.id);
  assert.equal(preset.snapshotYear, fixture.year);
  assert.equal(preset.politicalResourceChecksum, historicalMetadata.sha256);
  assert.equal(map.politics.states[preset.coreStateId].fullName, fixture.name);
  assert.ok(map.politics.states[preset.coreStateId].capital > 0);
  assert.equal(map.pack.burgs[map.politics.states[preset.coreStateId].capital].state, preset.coreStateId);
  assert.ok(preset.coreCells > 100);
  if (fixture.clientClass) {
    assert.ok(preset.clientStateId > 0);
    assert.ok(preset.clientCells > 0);
    assert.equal(map.politics.states[preset.clientStateId].fullName, "罗马属邦");
  } else {
    assert.equal(preset.clientStateId, null);
    assert.equal(preset.clientCells, 0);
  }
  assertPoliticalOwnership(map, fixture, preset);
  assert.ok(map.politics.provinces.filter(Boolean).every(province => map.politics.states[province.state] && !map.politics.states[province.state].removed));
  assert.ok(map.settlements.cities.filter(city => city && !city.removed).every(city => city.state === map.pack.cells.state[city.packCell]));
  assert.equal(map.metadata.mapTemplate.humanPreset.id, `${fixture.id}-human-v1`);
  assert.equal(Object.hasOwn(map, "mapTemplateBinding"), false, "历史模板创建后不得保留持续绑定");
  summaries.push({id: fixture.id, checksum: map.summary.checksum, cells: map.grid.points.length, coreCells: preset.coreCells, clientCells: preset.clientCells});
}

console.log(JSON.stringify({ok: true, presets: summaries}));

function assertPoliticalOwnership(map, fixture, preset) {
  let core = 0;
  let clients = 0;
  for (const cell of map.pack.cells.i) {
    if (map.pack.cells.h[cell] < 20) continue;
    const politicalClass = map.grid.cells.templatePolitical[map.pack.cells.g[cell]] || 0;
    const state = map.pack.cells.state[cell];
    if (fixture.coreClasses.includes(politicalClass)) {
      assert.equal(state, preset.coreStateId);
      core++;
    } else if (fixture.clientClass && politicalClass === fixture.clientClass) {
      assert.equal(state, preset.clientStateId);
      clients++;
    } else assert.equal(state, 0);
  }
  assert.equal(core, preset.coreCells);
  assert.equal(clients, preset.clientCells);
}
