#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {auditRiverNetwork, snapshotGeneratedMap} from "../prototype/river-network-lab/src/audit.js";
import {analyzeParentGraph, runDAGCandidate} from "../prototype/river-network-lab/src/algorithms.js";
import {FIXTURES} from "../prototype/river-network-lab/src/fixtures.js";

const fixedCases = FIXTURES.map(fixture => {
  const result = auditRiverNetwork(fixture);
  const before = digest(fixture);
  const graph = analyzeParentGraph(fixture);
  const candidate = runDAGCandidate(fixture);
  const found = new Set(result.issues.map(issue => issue.id));
  for (const expectedId of fixture.expectedIssueIds) assert(found.has(expectedId), `${fixture.id} 未命中预期诊断 ${expectedId}`);
  assert.equal(digest(fixture), before, `${fixture.id} DAG 候选改变了固定夹具`);
  if (fixture.id === "parent-cycle") assert.equal(candidate.accepted, false, "循环夹具没有被DAG候选拒绝");
  if (fixture.id === "valid-confluence") assert.equal(candidate.accepted, true, "合法汇流被DAG候选拒绝");
  return {
    id: fixture.id,
    expected: fixture.expectedIssueIds,
    found: [...found].sort(),
    metrics: result.metrics,
    issueEvidence: result.issues,
    parentGraph: graph.metrics,
    dagCandidate: {accepted: candidate.accepted, topologicalOrder: candidate.topologicalOrder, rejection: candidate.rejection}
  };
});

const generatedCases = [];
for (const cellsTarget of [10000, 50000, 100000]) {
  const seed = `304-river-network-lab-${cellsTarget}`;
  const firstMap = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  const first = snapshotGeneratedMap(firstMap);
  const before = digest(first);
  const firstAudit = auditRiverNetwork(first);
  const firstGraph = analyzeParentGraph(first);
  const firstCandidate = runDAGCandidate(first);
  const secondMap = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  const second = snapshotGeneratedMap(secondMap);
  const secondAudit = auditRiverNetwork(second);
  const secondGraph = analyzeParentGraph(second);
  assert.equal(digest(first), before, `${cellsTarget} 快照审计改变了输入快照`);
  assert.equal(digest(first.rivers), digest(second.rivers), `${cellsTarget} 固定 seed 河网快照不稳定`);
  assert.deepEqual(diagnosticDigest(firstAudit), diagnosticDigest(secondAudit), `${cellsTarget} 诊断不稳定`);
  assert.deepEqual(firstGraph.metrics, secondGraph.metrics, `${cellsTarget} 父子图诊断不稳定`);
  generatedCases.push({
    cellsTarget,
    seed,
    metadata: first.metadata,
    metrics: firstAudit.metrics,
    parentGraph: firstGraph.metrics,
    dagAccepted: firstCandidate.accepted,
    issueCounts: issueCounts(firstAudit),
    issueEvidence: issueEvidence(firstAudit),
    networkChecksum: digest(first.rivers),
    formalMapChecksums: [first.metadata.checksum, second.metadata.checksum]
  });
}

console.log(JSON.stringify({
  ok: true,
  mode: "304-A 只读河流网络实验室回归",
  formalGeneratorWrite: false,
  userMapWrite: false,
  fixedFixtures: fixedCases,
  generatedCases
}, null, 2));

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function diagnosticDigest(result) {
  return result.issues.map(issue => ({
    id: issue.id,
    severity: issue.severity,
    riverIds: issue.riverIds,
    cells: issue.cells,
    metrics: issue.metrics
  }));
}

function issueCounts(result) {
  return Object.fromEntries(Object.entries(result.byIssue).map(([id, values]) => [id, values.length]));
}

function issueEvidence(result) {
  return Object.fromEntries(Object.entries(result.byIssue).map(([id, values]) => [id, values[0]]));
}
