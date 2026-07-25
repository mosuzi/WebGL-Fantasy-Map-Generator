#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {validateCapabilityMatrix} from "./webgl-generator-api-full-capability-matrix.mjs";

const matrix = JSON.parse(await readFile(new URL("../docs/audits/console-api-full-capability-matrix.json", import.meta.url), "utf8"));
const totals = validateCapabilityMatrix(matrix);
assert.equal(totals.gap, 0, "全量能力矩阵仍有真实 API gap");
assert.equal(totals.unknown, 0, "全量能力矩阵仍有未知状态");
assert.equal(totals.unclassified, 0, "全量能力矩阵仍有未分类来源");
assert.equal(totals.unownedParameterizableGap, 0, "全量能力矩阵仍有未归属参数化缺口");
assert.ok(matrix.denominator.interactionSurfaces >= 103, "交互表面分母回退");
assert.ok(matrix.denominator.canvasModes >= 28, "画布模式分母回退");
assert.ok(matrix.denominator.publicApiMethods >= 208, "公共 API 分母回退");
assert.ok(matrix.rows.some(row => row.status === "deferred-owned" && row.owner === "权威任务第 195 项"), "Cell 专项没有明确归属第 195 项");

const syntheticGap = structuredClone(matrix);
syntheticGap.rows.push({
  matrixId: "synthetic:gap",
  capabilityId: "synthetic.gap",
  title: "合成未覆盖能力",
  sourceKind: "synthetic",
  sourceFiles: [],
  uiEntry: "",
  action: "",
  commandOrInspector: "",
  apiMethods: [],
  inputSpace: "options",
  mutates: "map-data",
  preflight: "missing",
  businessCodes: [],
  confirm: false,
  undoOrRollback: "missing",
  async: false,
  compatibility: "",
  evidence: [],
  status: "gap",
  owner: "",
  exclusionReason: "synthetic"
});
assert.throws(() => validateCapabilityMatrix(syntheticGap), /真实 gap|未归属/, "合成未覆盖能力没有触发矩阵失败");

console.log(JSON.stringify({
  ok: true,
  denominator: matrix.denominator,
  totals
}, null, 2));
