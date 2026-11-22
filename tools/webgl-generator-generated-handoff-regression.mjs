import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createCanonicalMapAdoptionPackage, createGeneratedMapAdoptionPackage, generatedHandoffDigest, materializeMapAdoptionHandoff} from "../app/webgl-generator/src/runtime/map-adoption-handoff.js";
import {decodeWebfmgV3Document, encodeWebfmgV3Document} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";
import {applyMainThreadMapProjection} from "../app/webgl-generator/src/runtime/main-thread-map-projection.js";

const map = generatePlaceholderMap({cellsTarget: 3000, seed: "generated-handoff-parity"});
const document = createMapDocument(map, map.options);
const expected = createCanonicalMapAdoptionPackage(document).document;
const generated = createGeneratedMapAdoptionPackage(document);
const received = structuredClone(generated.handoff);
const digest = await generatedHandoffDigest(generated.handoff);
assert.equal(await generatedHandoffDigest(received), digest);
const copy = await materializeMapAdoptionHandoff(received, {yieldToMain: async () => {}});
for (const result of [copy, generated.document]) {
  assert.deepEqual(result, expected);
  assert.equal(result.map.pack.states === result.map.politics.states, expected.map.pack.states === expected.map.politics.states);
  assert.equal(result.map.pack.deals === result.map.economy.deals, expected.map.pack.deals === expected.map.economy.deals);
  assert.equal(result.map.grid.features === result.map.features.features, expected.map.grid.features === expected.map.features.features);
  const saved = decodeWebfmgV3Document(encodeWebfmgV3Document(result));
  applyMainThreadMapProjection(saved.map);
  assert.deepEqual(saved, expected);
}
const invalid = structuredClone(generated.handoff);
invalid.geometry[0].ends[0] = 0xffffffff;
assert.notEqual(await generatedHandoffDigest(invalid), digest);
await assert.rejects(materializeMapAdoptionHandoff(invalid), {code: "map_adoption_geometry_invalid"});
console.log("新图主副本、传输校验、存档回读及损坏拒绝通过");
