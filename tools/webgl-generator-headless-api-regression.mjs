import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gzipSync} from "node:zlib";
import {createHeadlessMapApi, loadHeadlessMapDocument, loadHeadlessMapDocumentPayload} from "../app/webgl-generator/src/runtime/headless-map-api.js";

const fixturePath = new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url);
const source = readFileSync(fixturePath, "utf8");
const sourceBefore = Buffer.from(source);
const document = loadHeadlessMapDocument(source);
const api = createHeadlessMapApi(document);

const summary = api.info.mapSummary();
assert.equal(summary.ok, true);
assert.equal(summary.data.checksum, "legacy-checksum");
assert.equal(summary.data.gridCells, 3);
assert.equal(summary.metadata.runtime, "headless");
assert.equal(summary.metadata.mutates, "none");

const terrain = api.terrain.get();
assert.deepEqual(terrain.data.height, {count: 3, min: 12, max: 48, mean: 80 / 3, p50: 20, p90: 48, total: 80});
assert.equal(terrain.data.landCells, 2);
assert.equal(terrain.data.waterCells, 1);

const planner = api.planner.listRecipes();
assert.equal(planner.ok, true);
assert.ok(planner.data.length >= 10);

assert.equal(typeof api.analysis.defineRegion, "function");

const clientPoint = api.cells.getAtPoint({coordinateSpace: "client", x: 1, y: 1});
assert.equal(clientPoint.ok, false);
assert.equal(clientPoint.error.code, "unsupported_coordinate_space");

const gzip = gzipSync(sourceBefore);
const base64Document = await loadHeadlessMapDocumentPayload({encoding: "gzip-base64", data: gzip.toString("base64")});
assert.equal(base64Document.metadata.checksum, "legacy-checksum");
assert.deepEqual(Array.from(base64Document.map.grid.cells.h), [12, 20, 48]);

const gzipPath = join(tmpdir(), `fmg-headless-${process.pid}.json.gz`);
try {
  writeFileSync(gzipPath, gzip);
  const stdout = execFileSync(process.execPath, ["--no-warnings", "tools/webgl-generator-headless-api.mjs", gzipPath, "terrain.get"], {cwd: new URL("..", import.meta.url), encoding: "utf8"});
  const cli = JSON.parse(stdout);
  assert.equal(cli.ok, true);
  assert.equal(cli.data.height.count, 3);
} finally {
  rmSync(gzipPath, {force: true});
}

assert.deepEqual(Buffer.from(readFileSync(fixturePath)), sourceBefore);
console.log("无浏览器只读 API 回归通过：JSON、gzip、base64、迁移、typed array、CLI 与只读约束均符合预期。");
