#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {auditRiverNetwork, semanticSnapshotPayload, snapshotGeneratedMap} from "../prototype/river-network-lab/src/audit.js";
import {analyzeConfluences, analyzeHydrology, analyzeParentGraph, compareConfluenceCandidate, inspectConfluenceCurveSafety, inspectProtectedMouthSafety, runConfluenceCandidate, runDAGCandidate, runHydrologyCandidate} from "../prototype/river-network-lab/src/algorithms.js";
import {FIXTURES, SAFETY_FIXTURES} from "../prototype/river-network-lab/src/fixtures.js";

const fixedCases = FIXTURES.map(fixture => {
  const result = auditRiverNetwork(fixture);
  const before = digest(fixture);
  const graph = analyzeParentGraph(fixture);
  const candidate = runDAGCandidate(fixture);
  const confluence = analyzeConfluences(fixture);
  const confluenceCandidate = runConfluenceCandidate(fixture);
  const hydrology = analyzeHydrology(fixture);
  const hydrologyCandidate = runHydrologyCandidate(fixture);
  const found = issueCounts(result);
  assert.deepEqual(found, normalizeCounts(fixture.acceptance.issueCounts), `${fixture.id} 诊断集合或数量不精确`);
  assertStage(fixture.id, "dag", candidate, fixture.acceptance.stages.dag);
  assertStage(fixture.id, "confluence", confluenceCandidate, fixture.acceptance.stages.confluence);
  assertStage(fixture.id, "hydrology", hydrologyCandidate, fixture.acceptance.stages.hydrology);
  if (!confluenceCandidate.accepted) assert.notEqual(hydrologyCandidate.status, "accepted", `${fixture.id} 汇流失败后水文不得整体接受`);
  assertRelationEvidence(fixture.id, confluenceCandidate);
  assert.equal(digest(fixture), before, `${fixture.id} DAG 候选改变了固定夹具`);
  if (fixture.id === "tributary-over-parent") assert.equal(hydrologyCandidate.metrics.dischargeAfter + hydrologyCandidate.metrics.widthAfter, 0, "支流越级没有被水文候选收敛");
  if (fixture.id === "tributary-unattached") {
    const relation = confluenceCandidate.relations[0];
    assert.equal(relation.status, "accepted", "可修复未接入支流没有被候选接受");
    assert.ok(relation.distance > 12 && relation.distance <= relation.tolerance.total, "未接入正例没有同时跨过旧阈值并落在局部安全容差内");
    assert.equal(relation.curve?.kind, "cubic-hermite-bezier", "未接入正例没有生成三次汇流段");
    assert.ok(relation.curve.curvature > 0.5, "未接入正例仍接近直线连接");
    assert.deepEqual(relation.safety.gates, {overshoot: true, selfIntersection: true, backtracking: true, water: true, nonConfluenceCrossing: true}, "未接入正例没有通过完整曲线安全门");
  }
  if (fixture.id === "isolated-thin-fragment") assert.equal(hydrologyCandidate.fragmentPolicies[0].policy, "hide-visual-only", "孤立细碎片没有得到只读视觉策略");
  if (fixture.id === "border-ocean-mouth") assert.equal(hydrologyCandidate.fragmentPolicies[0].policy, "preserve-protected-outlet", "河口保护出口被错误降级");
  return {
    id: fixture.id,
    expected: normalizeCounts(fixture.acceptance.issueCounts),
    found,
    metrics: result.metrics,
    issueEvidence: result.issues,
    parentGraph: graph.metrics,
    dagCandidate: {accepted: candidate.accepted, topologicalOrder: candidate.topologicalOrder, rejection: candidate.rejection},
    confluence: confluence.metrics,
    confluenceCandidate: {accepted: confluenceCandidate.accepted, rejection: confluenceCandidate.rejection},
    hydrology: hydrology.metrics,
    hydrologyCandidate: {accepted: hydrologyCandidate.accepted, rejection: hydrologyCandidate.rejection}
  };
});

const partialSnapshot = {rivers: [
  {id: 1, parent: 0, width: 0.4, discharge: 40, cells: [1, 2], points: [[0, 100], [100, 100], [200, 100]]},
  {id: 2, parent: 1, width: 0.1, discharge: 5, cells: [3, 4], points: [[50, 10], [50, 60], [50, 95]]},
  {id: 3, parent: 1, width: 0.1, discharge: 5, cells: [5, 6], points: [[150, 10], [150, 30]]}
]};
const partialCandidate = runConfluenceCandidate(partialSnapshot);
const partialHydrology = runHydrologyCandidate(partialSnapshot);
assert.equal(partialCandidate.status, "partial", "单条关系失败不得吞回其它可接受关系");
assert.deepEqual(partialCandidate.relations.map(relation => [relation.childId, relation.status]), [[2, "accepted"], [3, "rejected"]]);
assert.ok(partialCandidate.candidateRivers.find(river => river.id === 2).points.length > partialSnapshot.rivers[1].points.length, "可接受关系没有应用三次汇流段");
assert.deepEqual(partialCandidate.candidateRivers.find(river => river.id === 3).points, partialSnapshot.rivers[2].points, "被拒绝关系没有保留原几何");
assert.equal(partialHydrology.status, "partial", "局部汇流失败被水文阶段错误标为整体接受或整体吞回");

const safetyCases = SAFETY_FIXTURES.map(fixture => {
  if (fixture.kind === "curve") {
    const safety = inspectConfluenceCurveSafety(fixture.snapshot, fixture.childId, fixture.parentId, fixture.sampledPoints);
    assert.equal(safety.accepted, false, `${fixture.id} 安全反例没有被拒绝`);
    assert.equal(safety.reason, fixture.expectedReason, `${fixture.id} 拒绝原因不精确`);
    return {id: fixture.id, status: "rejected", reason: safety.reason, gates: safety.gates};
  }
  if (fixture.kind === "protected-mouth") {
    const safety = inspectProtectedMouthSafety(fixture.before, fixture.after);
    assert.equal(safety.accepted, false, `${fixture.id} 保护河口漂移没有被拒绝`);
    assert.equal(safety.reason, fixture.expectedReason);
    return {id: fixture.id, status: "rejected", reason: safety.reason, drift: safety.drift};
  }
  const candidate = runConfluenceCandidate(fixture.snapshot);
  const relation = candidate.relations[0];
  assert.equal(candidate.status, "rejected", `${fixture.id} 超长显示桥被错误接受`);
  assert.equal(relation.reason, fixture.expectedReason);
  assert.ok(relation.distance >= 500 && relation.hydrologyDistance === 0 && relation.distance > relation.tolerance.total, `${fixture.id} 没有固定共享 cell 与真实长桥反例`);
  return {id: fixture.id, status: candidate.status, reason: relation.reason, distance: relation.distance, hydrologyDistance: relation.hydrologyDistance, tolerance: relation.tolerance.total};
});

const generatedCases = [];
const generatedExpectations = new Map([
  [10000, {dag: accepted(), confluence: accepted(), hydrology: accepted()}],
  [50000, {dag: accepted(), confluence: accepted(), hydrology: accepted()}],
  [100000, {dag: accepted(), confluence: accepted(), hydrology: accepted()}]
]);
for (const cellsTarget of [10000, 50000, 100000]) {
  const seed = `304-river-network-lab-${cellsTarget}`;
  const firstMap = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents", riverNetworkCandidate: false});
  const first = snapshotGeneratedMap(firstMap);
  const before = digest(first);
  const firstAudit = auditRiverNetwork(first);
  const firstGraph = analyzeParentGraph(first);
  const firstCandidate = runDAGCandidate(first);
  const firstConfluence = analyzeConfluences(first);
  const firstConfluenceCandidate = runConfluenceCandidate(first);
  const firstHydrology = analyzeHydrology(first);
  const firstHydrologyCandidate = runHydrologyCandidate(first);
  const firstComparison = compareConfluenceCandidate(first);
  const secondMap = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents", riverNetworkCandidate: false});
  const second = snapshotGeneratedMap(secondMap);
  const secondAudit = auditRiverNetwork(second);
  const secondGraph = analyzeParentGraph(second);
  const secondCandidate = runDAGCandidate(second);
  const secondConfluence = analyzeConfluences(second);
  const secondConfluenceCandidate = runConfluenceCandidate(second);
  const secondHydrology = analyzeHydrology(second);
  const secondHydrologyCandidate = runHydrologyCandidate(second);
  const secondComparison = compareConfluenceCandidate(second);
  const expected = generatedExpectations.get(cellsTarget);
  assertStage(`${cellsTarget}`, "dag", firstCandidate, expected.dag);
  assertStage(`${cellsTarget}`, "confluence", firstConfluenceCandidate, expected.confluence);
  assertStage(`${cellsTarget}`, "hydrology", firstHydrologyCandidate, expected.hydrology);
  assertStage(`${cellsTarget} second`, "dag", secondCandidate, expected.dag);
  assertStage(`${cellsTarget} second`, "confluence", secondConfluenceCandidate, expected.confluence);
  assertStage(`${cellsTarget} second`, "hydrology", secondHydrologyCandidate, expected.hydrology);
  if (!firstConfluenceCandidate.accepted) assert.notEqual(firstHydrologyCandidate.status, "accepted", `${cellsTarget} 汇流失败后水文不得整体接受`);
  assertRelationEvidence(`${cellsTarget}`, firstConfluenceCandidate);
  assertRelationEvidence(`${cellsTarget} second`, secondConfluenceCandidate);
  assert.equal(firstComparison.evidence.sameSnapshot, true, `${cellsTarget} A/B 必须复用同一快照`);
  assert.equal(firstComparison.evidence.curveKind, "cubic-hermite-bezier", `${cellsTarget} A/B 曲线算法不符`);
  assert.ok(firstComparison.evidence.baselineAlgorithmMs >= 0 && firstComparison.evidence.candidateAlgorithmMs >= 0, `${cellsTarget} A/B 算法计时缺失`);
  assert.ok(firstComparison.evidence.algorithmMs >= firstComparison.evidence.samplingMs, `${cellsTarget} 算法计时不得小于采样计时`);
  assert.ok(firstComparison.evidence.hydrologyAlgorithmMs > 0, `${cellsTarget} A/B 没有覆盖完整水文候选计时`);
  assert.deepEqual(firstComparison.evidence.gpuUpload, {applicable: false, reason: "standalone-svg-lab", baselineMs: 0, candidateMs: 0, deltaMs: 0}, `${cellsTarget} SVG 实验室必须显式声明 GPU upload 不适用`);
  assert.ok(firstComparison.evidence.candidateSegments >= firstComparison.evidence.baselineSegments, `${cellsTarget} 候选采样段数异常`);
  assert.deepEqual(comparisonSemantics(firstComparison), comparisonSemantics(secondComparison), `${cellsTarget} A/B 语义证据不稳定`);
  assert.equal(digest(first), before, `${cellsTarget} 快照审计改变了输入快照`);
  const firstNetworkChecksum = digest(first.rivers);
  const secondNetworkChecksum = digest(second.rivers);
  const firstSemanticChecksum = digest(semanticSnapshotPayload(first));
  const secondSemanticChecksum = digest(semanticSnapshotPayload(second));
  assert.equal(firstNetworkChecksum, secondNetworkChecksum, `${cellsTarget} 固定 seed 河网快照不稳定`);
  assert.equal(firstSemanticChecksum, secondSemanticChecksum, `${cellsTarget} 排除遥测后的 semantic checksum 不稳定`);
  assert.deepEqual(diagnosticDigest(firstAudit), diagnosticDigest(secondAudit), `${cellsTarget} 诊断不稳定`);
  assert.deepEqual(firstGraph.metrics, secondGraph.metrics, `${cellsTarget} 父子图诊断不稳定`);
  assert.deepEqual(firstConfluence.metrics, secondConfluence.metrics, `${cellsTarget} 汇流锚点诊断不稳定`);
  assert.deepEqual(firstHydrology.metrics, secondHydrology.metrics, `${cellsTarget} 水文候选诊断不稳定`);
  generatedCases.push({
    cellsTarget,
    seed,
    metadata: first.metadata,
    metrics: firstAudit.metrics,
    parentGraph: firstGraph.metrics,
    stages: {
      dag: candidateStatus(firstCandidate),
      confluence: candidateStatus(firstConfluenceCandidate),
      hydrology: candidateStatus(firstHydrologyCandidate)
    },
    confluence: firstConfluence.metrics,
    confluenceRelations: firstConfluenceCandidate.relations.map(relationStatus),
    comparison: firstComparison.evidence,
    hydrology: firstHydrology.metrics,
    issueCounts: issueCounts(firstAudit),
    issueEvidence: issueEvidence(firstAudit),
    semanticChecksum: firstSemanticChecksum,
    networkChecksum: firstNetworkChecksum,
    formalMapChecksums: [first.metadata.checksum, second.metadata.checksum]
  });
}

const hundredK = generatedCases.find(item => item.cellsTarget === 100000);
const repairedRelation = hundredK.confluenceRelations.find(item => item.childId === 760 && item.parentId === 5);
assert.equal(repairedRelation?.status, "accepted", "100k 公开 seed 的真实阻断关系没有修复为 accepted");
assert.equal(repairedRelation?.attachmentSource, "shared-hydrology-cell", "100k 修复必须使用水文共享 cell，而非放宽显示末端吸附");
assert.ok(repairedRelation.distance > 12 && repairedRelation.distance <= repairedRelation.tolerance && repairedRelation.hydrologyDistance < repairedRelation.tolerance, "100k 水文证据与真实显示桥没有同时通过局部容差");
assert.ok(repairedRelation.curvature > 0.5, "100k 汇流段仍接近直线，没有形成可见三次曲线");
assert.equal(hundredK.comparison.baselineDecision.status, "blocked", "100k A/B baseline 没有保留旧阻断证据");

const generatedRejected = generatedCases.filter(item => Object.values(item.stages).some(stage => stage.status !== "accepted"));
const candidateDecision = generatedRejected.length
  ? {status: "blocked", accepted: false, reason: "generated-stage-rejected", cases: generatedRejected.map(item => ({cellsTarget: item.cellsTarget, stages: item.stages}))}
  : {status: "accepted", accepted: true, reason: null, cases: []};

console.log(JSON.stringify({
  ok: true,
  evidenceOk: true,
  candidateDecision,
  mode: "304-G 水文汇流三次曲线候选",
  formalGeneratorWrite: false,
  userMapWrite: false,
  fixedFixtures: fixedCases,
  partialRelationEvidence: {status: partialCandidate.status, relations: partialCandidate.relations.map(relationStatus), hydrologyStatus: partialHydrology.status},
  safetyCases,
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
  return normalizeCounts(Object.fromEntries(Object.entries(result.byIssue).map(([id, values]) => [id, values.length])));
}

function issueEvidence(result) {
  return Object.fromEntries(Object.entries(result.byIssue).map(([id, values]) => [id, values[0]]));
}

function assertStage(caseId, stage, actual, expected) {
  assert.equal(actual.status, expected.status, `${caseId} ${stage} 状态不符`);
  assert.equal(Boolean(actual.accepted), expected.status === "accepted", `${caseId} ${stage} accepted 与状态冲突`);
  assert.equal(actual.rejection?.reason || null, expected.reason, `${caseId} ${stage} 拒绝原因不符`);
}

function candidateStatus(candidate) {
  return {status: candidate.status, accepted: candidate.accepted, reason: candidate.rejection?.reason || null};
}

function assertRelationEvidence(caseId, candidate) {
  for (const relation of candidate.relations || []) {
    assert.ok(["accepted", "rejected", "protected"].includes(relation.status), `${caseId} 关系状态不明确`);
    assert.equal(Object.hasOwn(relation.curve || {}, "controlPoints"), false, `${caseId} 不得从 controlPoints 构造汇流段`);
    if (relation.status !== "accepted") continue;
    assert.ok(["already-attached", "cubic-hermite-bezier"].includes(relation.curve.kind), `${caseId} 接受关系曲线策略不明确`);
    if (relation.curve.kind === "cubic-hermite-bezier") assert.equal(relation.curve.linear, false, `${caseId} 发生几何变化的关系被标为直线`);
    assert.deepEqual(relation.safety.gates, {overshoot: true, selfIntersection: true, backtracking: true, water: true, nonConfluenceCrossing: true}, `${caseId} 曲线安全门未全通过`);
  }
  assert.equal(candidate.metrics.protectedMouthDrift || 0, 0, `${caseId} 保护河口发生漂移`);
}

function comparisonSemantics(comparison) {
  const evidence = comparison.evidence;
  return {sameSnapshot: evidence.sameSnapshot, curveKind: evidence.curveKind, baselineDecision: evidence.baselineDecision, baselineSegments: evidence.baselineSegments, candidateSegments: evidence.candidateSegments, sampledPoints: evidence.sampledPoints, changedRelations: evidence.changedRelations};
}

function relationStatus(relation) {
  return {childId: relation.childId, parentId: relation.parentId, status: relation.status, reason: relation.reason, attachmentSource: relation.attachmentSource, attachmentMode: relation.attachmentMode, distance: relation.distance, hydrologyDistance: relation.hydrologyDistance, tolerance: relation.tolerance.total, curvature: relation.curve?.curvature || 0, safety: relation.safety?.gates || null};
}

function normalizeCounts(counts) {
  return Object.fromEntries(Object.entries(counts || {}).sort(([left], [right]) => left.localeCompare(right)));
}

function accepted() {
  return {status: "accepted", reason: null};
}

function rejected(reason) {
  return {status: "rejected", reason};
}
