#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {auditRiverNetwork, snapshotGeneratedMap} from "../prototype/river-network-lab/src/audit.js";
import {FIXTURES} from "../prototype/river-network-lab/src/fixtures.js";

const fixedCases = FIXTURES.map(fixture => {
  const result = auditRiverNetwork(fixture);
  const found = new Set(result.issues.map(issue => issue.id));
  for (const expectedId of fixture.expectedIssueIds) assert(found.has(expectedId), `${fixture.id} 未命中预期诊断 ${expectedId}`);
  return {
    id: fixture.id,
    expected: fixture.expectedIssueIds,
    found: [...found].sort(),
    metrics: result.metrics,
    issueEvidence: result.issues
  };
});

const generatedCases = [];
for (const cellsTarget of [10000, 50000, 100000]) {
  const seed = `304-river-network-lab-${cellsTarget}`;
  const firstMap = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  const first = snapshotGeneratedMap(firstMap);
  const before = digest(first);
  const firstAudit = auditRiverNetwork(first);
  const secondMap = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  const second = snapshotGeneratedMap(secondMap);
  const secondAudit = auditRiverNetwork(second);
  assert.equal(digest(first), before, `${cellsTarget} 快照审计改变了输入快照`);
  assert.equal(digest(first.rivers), digest(second.rivers), `${cellsTarget} 固定 seed 河网快照不稳定`);
  assert.deepEqual(diagnosticDigest(firstAudit), diagnosticDigest(secondAudit), `${cellsTarget} 诊断不稳定`);
  generatedCases.push({
    cellsTarget,
    seed,
    metadata: first.metadata,
    metrics: firstAudit.metrics,
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
