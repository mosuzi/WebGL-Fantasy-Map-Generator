import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  parseMapTemplateHistoricalResource,
  sampleMapTemplateHistoricalResource,
  verifyMapTemplateHistoricalResourceChecksum
} from "../app/webgl-generator/src/generator/map-template-historical-resource.js";

const root = new URL("../app/webgl-generator/public/assets/map-templates/", import.meta.url);
const cases = [
  {id: "roman-empire-117-political-v1", year: 117, inside: [[-4, 40], [12.5, 41.9], [31.2, 30]], outside: [[-9, 53], [42, 48]]},
  {id: "holy-roman-empire-1789-political-v1", year: 1789, inside: [[8.7, 50.1], [11.6, 48.1], [16.4, 48.2]], outside: [[-3, 52], [2.35, 48.85]]}
];
const summaries = [];

for (const fixture of cases) {
  const metadata = JSON.parse(await readFile(new URL(`${fixture.id}.json`, root), "utf8"));
  const bytes = await readFile(new URL(`${fixture.id}.bin`, root));
  assert.equal(metadata.snapshotYear, fixture.year);
  assert.equal(metadata.byteLength, 16 + metadata.width * metadata.height);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.sha256);
  await verifyMapTemplateHistoricalResourceChecksum(metadata, bytes);
  const resource = parseMapTemplateHistoricalResource(metadata, bytes);
  for (const coordinate of fixture.inside) assert.ok(neighborhoodHasValue(resource, coordinate[0], coordinate[1]), `${fixture.id} 缺少历史疆域 ${coordinate}`);
  for (const coordinate of fixture.outside) assert.equal(sampleMapTemplateHistoricalResource(resource, coordinate[0], coordinate[1]), 0, `${fixture.id} 不应覆盖 ${coordinate}`);
  const tampered = Uint8Array.from(bytes);
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(() => verifyMapTemplateHistoricalResourceChecksum(metadata, tampered), /校验失败/u);
  summaries.push({id: fixture.id, year: fixture.year, sha256: metadata.sha256, classPixels: metadata.classPixels});
}

console.log(JSON.stringify({ok: true, resources: summaries}));

function neighborhoodHasValue(resource, longitude, latitude) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (sampleMapTemplateHistoricalResource(resource, longitude + dx * 0.2, latitude + dy * 0.2)) return true;
  }
  return false;
}
