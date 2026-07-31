#!/usr/bin/env node
import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {gzipSync} from "node:zlib";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createHeadlessWriteSession} from "../app/webgl-generator/src/runtime/headless-write-api.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {inspectPopulationAdjustment} from "../app/webgl-generator/src/runtime/population-adjustment-commands.js";

const map = generatePlaceholderMap({seed: "headless-write-regression", cellsTarget: 3000, heightmapTemplate: "continents", culturesNumber: 7, religionsNumber: 5});
const document = createMapDocument(map, map.options);
const sourceText = stringifyMapDocument(document);
const sourceHash = hash(sourceText);
const session = createHeadlessWriteSession(parseMapDocument(sourceText));
const documentId = session.documentId;
const locksBefore = JSON.stringify(session.getDocument().map.regenerationLocks);

const populationTarget = findPopulationTarget(session.getDocument().map);
assert(populationTarget, "缺少可用的人口调整国家");
const populationArgs = [populationTarget, {delta: 125}];
const populationInspection = session.inspect("edit.population.inspectAdjustment", populationArgs);
assert.equal(populationInspection.ok, true);
assert.equal(populationInspection.data.valid, true, populationInspection.data.reason);
assert.equal(populationInspection.data.documentId, documentId);
const populationBefore = populationInspection.data.totalBefore;
const populationApply = session.apply("edit.population.applyAdjustment", populationArgs, auth(populationInspection.data, "population-1"));
assert.equal(populationApply.ok, true, populationApply.error?.message);
assert.equal(populationApply.data.revisionAfter, 1);
const populationAfter = inspectPopulationAdjustment(session.getDocument().map, populationTarget, {delta: 1}).totalBefore;
assert(Math.abs(populationAfter - (populationBefore + 125)) < 0.05, "人口调整结果不准确");

const replay = session.apply("edit.population.applyAdjustment", populationArgs, auth(populationInspection.data, "population-1"));
assert.equal(replay.ok, true);
assert.equal(replay.data.replayed, true);
assert.equal(session.revision, 1, "幂等重放推进了 revision");
const conflict = session.apply("edit.population.applyAdjustment", [populationTarget, {delta: 126}], auth(populationInspection.data, "population-1"));
assert.equal(conflict.error.code, "headless_request_id_conflict");

const smoothingArgs = [findSmoothingOptions(session.getDocument().map)];
const smoothingInspection = session.inspect("edit.height.inspectSelectionSmoothing", smoothingArgs);
assert.equal(smoothingInspection.ok, true);
assert.equal(smoothingInspection.data.valid, true, smoothingInspection.data.reason);
const heightsBefore = Array.from(session.getDocument().map.grid.cells.h);
const smoothingApply = session.apply("edit.height.applySelectionSmoothing", smoothingArgs, auth(smoothingInspection.data, "height-1"));
assert.equal(smoothingApply.ok, true, smoothingApply.error?.message);
assert.equal(smoothingApply.data.revisionAfter, 2);
const heightsAfter = Array.from(session.getDocument().map.grid.cells.h);
assert.notDeepEqual(heightsAfter, heightsBefore, "高度平滑没有改变高度");
for (const cell of smoothingArgs[0].cellIds) assert(heightsAfter[cell] >= 20, "高度平滑越过海平面");
for (const system of ["features", "rivers", "routes", "biomes", "cities", "states", "provinces"]) {
  assert(session.getDocument().map.metadata.derivedStale.systems.includes(system), `高度平滑缺少 ${system} stale`);
}

const city = session.getDocument().map.settlements.cities.find(item => item && !item.removed);
assert(city, "缺少可重命名城市");
const feature = session.getDocument().map.pack.features.find(item => item && !item.removed);
assert(feature, "缺少不受支持的对象类型样本");
const unsupportedRename = session.inspect("edit.objects.inspectRename", [{kind: "feature", id: feature.id}, "不应写入"]);
assert.equal(unsupportedRename.data.valid, false);
assert.equal(unsupportedRename.data.code, "headless_object_kind_unsupported");
const renameArgs = [{kind: "city", id: city.id}, `${city.name}·无头验收`];
const renameInspection = session.inspect("edit.objects.inspectRename", renameArgs);
assert.equal(renameInspection.data.valid, true, renameInspection.data.reason);
const renameApply = session.apply("edit.objects.applyRename", renameArgs, auth(renameInspection.data, "rename-1"));
assert.equal(renameApply.ok, true, renameApply.error?.message);
assert.equal(renameApply.data.revisionAfter, 3);
assert.equal(session.getReadApi().objects.get({kind: "city", id: city.id}).data.name, renameArgs[1]);
assert.equal(session.history.getStats().transactions, 3);

const stale = session.apply("edit.objects.applyRename", renameArgs, {...auth(renameInspection.data, "stale-1"), expectedRevision: 2});
assert.equal(stale.error.code, "headless_revision_mismatch");
const wrongDocument = session.apply("edit.objects.applyRename", renameArgs, {...auth(renameInspection.data, "wrong-document"), documentId: "other"});
assert.equal(wrongDocument.error.code, "headless_document_mismatch");
const wrongToken = session.apply("edit.objects.applyRename", renameArgs, {...auth(renameInspection.data, "wrong-token"), expectedRevision: 3, inspectionToken: "bad"});
assert.equal(wrongToken.error.code, "headless_inspection_stale");
const unsupported = session.invoke("edit.states.delete", [1], {documentId, expectedRevision: 3, inspectionToken: "x", requestId: "unsupported"});
assert.equal(unsupported.error.code, "headless_method_unsupported");
const inspectThroughApply = session.apply("edit.objects.inspectRename", renameArgs, auth(renameInspection.data, "inspect-via-apply"));
assert.equal(inspectThroughApply.error.code, "headless_method_unsupported");
assert.equal(JSON.stringify(session.getDocument().map.regenerationLocks), locksBefore, "无头写入改变了再生成锁");

const rollbackSource = session.getDocument();
const rollbackSession = createHeadlessWriteSession(rollbackSource, {faultInjector: stage => {
  if (stage === "after-command") throw Object.assign(new Error("注入事务故障"), {code: "headless_test_fault"});
}});
const rollbackCity = rollbackSession.getReadApi().objects.get({kind: "city", id: city.id}).data;
const rollbackArgs = [{kind: "city", id: city.id}, `${rollbackCity.name}·回滚`];
const rollbackInspection = rollbackSession.inspect("edit.objects.inspectRename", rollbackArgs);
const rollbackBefore = stringifyMapDocument(rollbackSession.getDocument());
const rollbackResult = rollbackSession.apply("edit.objects.applyRename", rollbackArgs, auth(rollbackInspection.data, "rollback-1"));
assert.equal(rollbackResult.error.code, "headless_test_fault");
assert.equal(stringifyMapDocument(rollbackSession.getDocument()), rollbackBefore, "注入故障后文档没有完整回滚");
assert.equal(rollbackSession.revision, 3);

const outputDocument = session.getDocument();
const roundtrip = createHeadlessWriteSession(parseMapDocument(stringifyMapDocument(outputDocument)));
assert.equal(roundtrip.documentId, documentId);
assert.equal(roundtrip.revision, 3);
assert.equal(roundtrip.history.getStats().transactions, 3);
assert.equal(hash(sourceText), sourceHash, "会话修改了输入文档文本");

const tempRoot = mkdtempSync(join(tmpdir(), "fmg-headless-write-"));
try {
  const input = join(tempRoot, "input.webgl-map.json");
  const inputGzip = join(tempRoot, "input.webgl-map.json.gz");
  const output = join(tempRoot, "output.webgl-map.json");
  const outputGzip = join(tempRoot, "output.webgl-map.json.gz");
  const legacyInput = join(tempRoot, "legacy-v1.webgl-map.json");
  const legacyOutput = join(tempRoot, "legacy-v1-output.webgl-map.json");
  writeFileSync(input, sourceText);
  writeFileSync(inputGzip, gzipSync(sourceText));
  const inputBytesBefore = readFileSync(input);

  const cliInspection = runCli(["inspect", input, "edit.objects.inspectRename", JSON.stringify(renameArgs)]);
  assert.equal(cliInspection.ok, true);
  const cliApply = runCli([
    "apply", input, output, "edit.objects.applyRename", JSON.stringify(renameArgs),
    "--document-id", cliInspection.data.documentId,
    "--expected-revision", String(cliInspection.data.revision),
    "--inspection-token", cliInspection.data.inspectionToken,
    "--request-id", "cli-rename-1"
  ]);
  assert.equal(cliApply.ok, true);
  assert.equal(cliApply.output.inputUnchanged, true);
  assert.deepEqual(readFileSync(input), inputBytesBefore, "CLI 改写了输入文件");
  const cliVerify = runCli(["verify", output]);
  assert.equal(cliVerify.ok, true);
  assert.equal(cliVerify.data.revision, 1);
  assert.equal(cliVerify.data.mapSummary.ready, true);

  const gzipInspection = runCli(["inspect", inputGzip, "edit.objects.inspectRename", JSON.stringify(renameArgs)]);
  const gzipApply = runCli([
    "apply", inputGzip, outputGzip, "edit.objects.applyRename", JSON.stringify(renameArgs),
    "--document-id", gzipInspection.data.documentId,
    "--expected-revision", "0",
    "--inspection-token", gzipInspection.data.inspectionToken,
    "--request-id", "cli-gzip-rename"
  ]);
  assert.equal(gzipApply.ok, true);
  assert.equal(runCli(["verify", outputGzip]).data.revision, 1);

  const legacy = JSON.parse(sourceText);
  legacy.version = 1;
  delete legacy.metadata.mapSchemaVersion;
  writeFileSync(legacyInput, JSON.stringify(legacy));
  const legacyInspection = runCli(["inspect", legacyInput, "edit.objects.inspectRename", JSON.stringify(renameArgs)]);
  const legacyApply = runCli([
    "apply", legacyInput, legacyOutput, "edit.objects.applyRename", JSON.stringify(renameArgs),
    "--document-id", legacyInspection.data.documentId,
    "--expected-revision", "0",
    "--inspection-token", legacyInspection.data.inspectionToken,
    "--request-id", "cli-legacy-rename"
  ]);
  assert.equal(legacyApply.ok, true);
  assert.equal(JSON.parse(readFileSync(legacyOutput, "utf8")).version, 2, "v1 输出没有迁移为 v2");

  const overwriteDenied = spawnSync(process.execPath, ["--no-warnings", "tools/webgl-generator-headless-write.mjs", "apply", input, input, "edit.objects.applyRename", JSON.stringify(renameArgs)], {cwd: resolve("."), encoding: "utf8"});
  assert.notEqual(overwriteDenied.status, 0);
  assert.match(overwriteDenied.stderr, /headless_overwrite_confirmation_required/);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}

console.log("无头写入 API 回归通过：人口、高度平滑、对象重命名、inspectionToken、revision、幂等、全事务回滚、JSON/gzip/v1、CLI 安全输出与输入不变均符合预期。");

function findPopulationTarget(map) {
  for (const state of map.politics.states || []) {
    const id = Number(state?.i ?? state?.id);
    if (!state || state.removed || !Number.isInteger(id) || id <= 0) continue;
    const target = {scope: "state", id};
    if (inspectPopulationAdjustment(map, target, {delta: 125}).valid) return target;
  }
  return null;
}

function findSmoothingOptions(map) {
  const heights = map.grid.cells.h;
  const adjacency = map.grid.cells.c;
  for (let cell = 0; cell < heights.length; cell += 1) {
    if (Number(heights[cell]) < 20) continue;
    const neighbors = (adjacency[cell] || []).filter(neighbor => Number(heights[neighbor]) >= 20);
    for (const neighbor of neighbors) {
      if (Math.abs(Number(heights[cell]) - Number(heights[neighbor])) < 3) continue;
      return {cellIds: [cell, neighbor], smoothness: 1};
    }
  }
  throw new Error("缺少可平滑的陆地高度样本");
}

function auth(inspection, requestId) {
  return {
    documentId: inspection.documentId,
    expectedRevision: inspection.revision,
    inspectionToken: inspection.inspectionToken,
    requestId
  };
}

function runCli(args) {
  return JSON.parse(execFileSync(process.execPath, ["--no-warnings", "tools/webgl-generator-headless-write.mjs", ...args], {cwd: resolve("."), encoding: "utf8"}));
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
