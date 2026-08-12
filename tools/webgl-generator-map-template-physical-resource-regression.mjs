import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  parseMapTemplatePhysicalResource,
  sampleMapTemplatePhysicalResource,
  verifyMapTemplatePhysicalResourceChecksum
} from "../app/webgl-generator/src/generator/map-template-physical-resource.js";

const root = new URL("../app/webgl-generator/public/assets/map-templates/", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("world-physical-2026-v1.json", root), "utf8"));
const bytes = await readFile(new URL("world-physical-2026-v1.bin", root));

assert.equal(metadata.id, "world-physical-2026-v1");
assert.equal(metadata.width, 720);
assert.equal(metadata.height, 360);
assert.equal(metadata.binaryFormatVersion, 2);
assert.equal(metadata.byteLength, 16 + metadata.width * metadata.height * 4);
assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.sha256);
assert.equal(await verifyMapTemplatePhysicalResourceChecksum(metadata, bytes), metadata.sha256);

const resource = parseMapTemplatePhysicalResource(metadata, bytes);
assert.deepEqual(sample(resource, 31.2, 30), {land: true, elevationSign: 1}, "开罗应落在陆地");
assert.deepEqual(sample(resource, -30, 0), {land: false, elevationSign: -1}, "大西洋应落在海洋");
assert.deepEqual(sample(resource, 140, -25), {land: true, elevationSign: 1}, "澳大利亚内陆应落在陆地");
assert.deepEqual(sample(resource, 86.9, 28), {land: true, elevationSign: 1}, "喜马拉雅应为正高程陆地");
assert.deepEqual(sample(resource, 0, -80), {land: true, elevationSign: 1}, "南极洲应落在陆地");
assert.equal(sampleMapTemplatePhysicalResource(resource, -87.5, 47.7).land, false, "苏必利尔湖应从陆地掩膜扣除");
assert.equal(sampleMapTemplatePhysicalResource(resource, 33, -1).land, false, "维多利亚湖应从陆地掩膜扣除");
assert.equal(sampleMapTemplatePhysicalResource(resource, 108, 53.5).land, false, "贝加尔湖应从陆地掩膜扣除");
assert.ok(metadata.hydrologyPixels > 1_000, "全球水文掩膜不应为空");
assert.ok(resource.hydrologyMask.some(Boolean), "水文像素应成功解析");

const tampered = Uint8Array.from(bytes);
tampered[tampered.length - 1] ^= 1;
await assert.rejects(() => verifyMapTemplatePhysicalResourceChecksum(metadata, tampered), /校验失败/u);
assert.throws(() => parseMapTemplatePhysicalResource(metadata, bytes.subarray(0, -1)), /长度无效/u);

console.log(JSON.stringify({
  ok: true,
  id: resource.id,
  bytes: bytes.byteLength,
  sha256: metadata.sha256,
  landPixels: metadata.landPixels,
  hydrologyPixels: metadata.hydrologyPixels,
  elevationRange: [metadata.elevationMin, metadata.elevationMax]
}));

function sample(resource, longitude, latitude) {
  const value = sampleMapTemplatePhysicalResource(resource, longitude, latitude);
  return {land: value.land, elevationSign: Math.sign(value.elevation)};
}
