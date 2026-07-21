#!/usr/bin/env node
import assert from "node:assert/strict";
import {ALGORITHMS, DEFAULT_OPTIONS, samePoint} from "../prototype/boundary-topology-lab/src/algorithms.js";
import {FIXTURES} from "../prototype/boundary-topology-lab/src/fixtures.js";
import {buildSharedSnapshot, sharedArcRefs} from "../prototype/boundary-topology-lab/src/topology.js";
import {bidirectionalHausdorff, HAUSDORFF_LIMITS, inspectRingGeometry, runAllFixtures, validateFixture} from "../prototype/boundary-topology-lab/src/validation.js";

const expectedCases = new Map([
  ["single-island", "coast"],
  ["island-with-hole", "ring"],
  ["narrow-strait", "clearance"],
  ["lake-sea-connection", "connectivity"],
  ["tri-state-junction", "junction"],
  ["cross-state-province", "hierarchy"],
  ["map-boundary", "frame"],
  ["closed-loop", "closed-loop"]
]);
const options = {...DEFAULT_OPTIONS};

assert.equal(FIXTURES.length, 8, "必须固定覆盖八类拓扑夹具");
assert.deepEqual(new Map(FIXTURES.map(fixture => [fixture.id, fixture.category])), expectedCases, "夹具 id 与案例分类必须保持稳定");
assert.deepEqual(ALGORITHMS.map(algorithm => algorithm.id), ["raw", "douglas-peucker", "visvalingam", "chaikin", "catmull-rom", "b-spline", "recommended"], "算法矩阵不完整");

const algorithmReports = [];
for (const algorithm of ALGORITHMS) {
  const report = runAllFixtures(FIXTURES, algorithm.id, options);
  if (algorithm.id === "recommended") assert.equal(report.ok, true, `${algorithm.name} 未通过全部夹具：${formatFailures(report)}`);
  assert.equal(report.summary.selfIntersections, 0, `${algorithm.name} 产生自交`);
  for (const result of report.results) {
    assert.equal(result.metrics.seamGap, 0, `${algorithm.name}/${result.fixtureName} 产生 seam gap`);
    assert.equal(result.metrics.coverageOverlap, 0, `${algorithm.name}/${result.fixtureName} 产生 coverage overlap`);
    assert.equal(result.metrics.validRings, true, `${algorithm.name}/${result.fixtureName} 产生非法 ring`);
  }
  algorithmReports.push({algorithm: algorithm.id, accepted: report.summary.passed, rejectedByLimits: report.summary.failed});
}

let reverseArcRefs = 0;
let expectedFailureCases = 0;
for (const fixture of FIXTURES) {
  const result = validateFixture(fixture, "recommended", options);
  const rawResult = validateFixture(fixture, "raw", options);
  assert.equal(result.ok, true, `${fixture.name} 推荐管线失败：${result.issues.join("；")}`);
  assert.equal(result.metrics.validRings, true, `${fixture.name} 存在非法 ring`);
  assert.equal(result.metrics.selfIntersections, 0, `${fixture.name} 存在自交`);
  assert.equal(result.metrics.seamGap, 0, `${fixture.name} 共享边界产生 gap`);
  assert.equal(result.metrics.seamOverlap, 0, `${fixture.name} 共享边界产生 overlap`);
  assert.equal(result.metrics.renderModelSameSnapshot, true, `${fixture.name} fill/stroke 没有使用同一快照`);
  assert.strictEqual(result.snapshot.renderModel.fillSnapshot, result.snapshot.renderModel.strokeSnapshot, `${fixture.name} fill/stroke 对象引用不一致`);
  assert.ok(result.metrics.maxDisplacement <= options.maxDisplacement + 1e-6, `${fixture.name} 超过最大位移约束`);
  assert.equal(rawResult.metrics.independentError, 0, `${fixture.name} raw 独立对照不应产生误差`);
  for (const [kind, p95] of Object.entries(result.metrics.areaP95)) {
    assert.ok(p95 <= (kind === "province" ? 1 : 0.5), `${fixture.name}/${kind} 面积 P95 超标：${p95}%`);
  }
  assert.ok(result.metrics.hausdorff >= 0, `${fixture.name} 缺少双向 Hausdorff 指标`);
  assert.equal(result.metrics.regionShapeErrors.length, fixture.regions.length, `${fixture.name} 必须逐区域计算面积与 Hausdorff`);
  for (const regionError of result.metrics.regionShapeErrors) assert.ok(regionError.hausdorff <= HAUSDORFF_LIMITS[regionError.kind], `${fixture.name}/${regionError.regionId} Hausdorff 超标`);
  assert.ok(result.metrics.caseConstraints.every(item => item.pass), `${fixture.name} 的案例约束未通过`);

  for (const rawArc of fixture.arcs) {
    const transformed = result.snapshot.arcs.get(rawArc.id).points;
    assert.ok(samePoint(rawArc.points[0], transformed[0]), `${fixture.name}/${rawArc.id} 起点未锁定`);
    assert.ok(samePoint(rawArc.points.at(-1), transformed.at(-1)), `${fixture.name}/${rawArc.id} 终点未锁定`);
  }

  const sharedRefs = sharedArcRefs(fixture);
  reverseArcRefs += sharedRefs.filter(arcRef => arcRef.reversed).length;
  if (result.comparison.expectedFailure) {
    expectedFailureCases++;
    assert.ok(result.metrics.independentError > 0.01, `${fixture.name} 的独立 polygon 对照没有出现预期误差`);
  }
}

assert.ok(reverseArcRefs > 0, "测试矩阵必须实际覆盖反向 ArcRef");
assert.ok(expectedFailureCases >= 3, "独立 polygon 失败对照覆盖不足");

const immutableSnapshot = buildSharedSnapshot(FIXTURES[0], "recommended", options);
assert.ok(Object.isFrozen(immutableSnapshot.arcs), "snapshot.arcs facade 必须冻结");
assert.equal(immutableSnapshot.arcs.set, undefined, "snapshot.arcs 不得暴露 set");
assert.equal(immutableSnapshot.arcs.delete, undefined, "snapshot.arcs 不得暴露 delete");
assert.equal(immutableSnapshot.arcs.clear, undefined, "snapshot.arcs 不得暴露 clear");
assert.throws(() => { immutableSnapshot.arcs.set = () => {}; }, TypeError, "snapshot.arcs 不应允许注入写方法");
assert.ok(Object.isFrozen(immutableSnapshot.arcs.get("coast")), "snapshot arc 值必须不可变");

assert.ok(bidirectionalHausdorff([[0, 0], [5, 5], [10, 0]], [[0, 0], [10, 0]]) >= 5, "双向 Hausdorff 必须捕获被简化线遗漏的峰值");
const aggressive = runAllFixtures(FIXTURES, "recommended", {threshold: 5, smoothness: 0.22, maxDisplacement: 7});
assert.equal(aggressive.ok, false, "面积阈值必须拦截过强的推荐平滑参数");
assert.ok(aggressive.results.some(result => result.issues.some(issue => issue.includes("Hausdorff"))), "Hausdorff 分层门槛必须拦截超标参数");

assertBrokenConstraint("single-island", "island-ring", fixture => { fixture.arcs[0].closed = false; });
assertBrokenConstraint("island-with-hole", "hole-direction", fixture => { fixture.regions[0].rings[1][0].reversed = false; });
assertBrokenConstraint("narrow-strait", "strait-open", fixture => {
  const west = fixture.arcs.find(arc => arc.id === "west-coast");
  fixture.arcs.find(arc => arc.id === "east-coast").points = west.points.map(([x, y]) => [x + 2, y]);
});
assertBrokenConstraint("lake-sea-connection", "mouth-open", fixture => {
  const mouth = fixture.arcs.find(arc => arc.id === "locked-mouth");
  mouth.points[mouth.points.length - 1] = [mouth.points[0][0] - 2, mouth.points[0][1]];
});
assertBrokenConstraint("tri-state-junction", "tri-node", fixture => {
  fixture.arcs.find(arc => arc.id === "southwest-border").points.at(-1)[0] -= 3;
});
assertBrokenConstraint("cross-state-province", "province-state-lock", fixture => {
  fixture.arcs.find(arc => arc.id === "province-west").points.at(-1)[0] -= 3;
});
assertBrokenConstraint("map-boundary", "frame-lock", fixture => {
  fixture.arcs.find(arc => arc.id === "top-left").points.splice(1, 0, [80, 5]);
});
assertBrokenConstraint("closed-loop", "synthetic-anchor", fixture => {
  fixture.arcs.find(arc => arc.id === "stable-loop").syntheticAnchor = false;
});

const brokenDirection = cloneFixture("tri-state-junction");
brokenDirection.regions.find(region => region.id === "northeast").rings[0].find(ref => ref.arcId === "north-border").reversed = false;
assert.ok(validateFixture(brokenDirection, "recommended", options).issues.some(issue => issue.includes("方向没有相反")), "共享 ArcRef 同向反例必须失败");

const brokenArcIdentity = cloneFixture("tri-state-junction");
const duplicatedArc = structuredClone(brokenArcIdentity.arcs.find(arc => arc.id === "north-border"));
duplicatedArc.id = "north-border-copy";
brokenArcIdentity.arcs.push(duplicatedArc);
brokenArcIdentity.regions.find(region => region.id === "northeast").rings[0].find(ref => ref.arcId === "north-border").arcId = duplicatedArc.id;
assert.ok(validateFixture(brokenArcIdentity, "recommended", options).issues.some(issue => issue.includes("不同 arcId")), "共享几何使用不同 arcId 的反例必须失败");

const brokenCrossing = cloneFixture("tri-state-junction");
brokenCrossing.arcs.find(arc => arc.id === "top-left").points.splice(1, 0, [230, 165]);
assert.ok(validateFixture(brokenCrossing, "raw", options).metrics.seamOverlap > 0, "区域新增交叉反例必须被计数");

const nestedCoverage = cloneFixture("narrow-strait");
nestedCoverage.arcs.find(arc => arc.id === "east-coast").points = [[44, 70], [76, 70], [76, 112], [44, 112], [44, 70]];
const nestedCoverageResult = validateFixture(nestedCoverage, "raw", options);
assert.ok(nestedCoverageResult.metrics.coverageOverlap > 0 && !nestedCoverageResult.ok, "完整嵌套区域必须被判为 coverage overlap");

const brokenRingGap = cloneFixture("map-boundary");
brokenRingGap.arcs.find(arc => arc.id === "shared").points[0] = [160, 5];
const brokenRingGapResult = validateFixture(brokenRingGap, "raw", options);
assert.ok(brokenRingGapResult.metrics.seamGap >= 5 && !brokenRingGapResult.ok, "ring 相邻 ArcRef 端点断裂必须产生 seamGap");

const flattenedChannel = cloneFixture("lake-sea-connection");
const channel = flattenedChannel.arcs.find(arc => arc.id === "locked-mouth");
channel.points = [channel.points[0], channel.points.at(-1)];
const flattenedChannelResult = validateFixture(flattenedChannel, "raw", options);
for (const id of ["channel-depth", "channel-length", "lake-basin"]) {
  assert.equal(flattenedChannelResult.metrics.caseConstraints.find(item => item.id === id)?.pass, false, `湖海连接直线反例必须触发 ${id}`);
}

assertBrokenRing([[0, 0], [2, 0], [2, 0], [0, 2], [0, 0]], "zeroLengthEdges", "零长边");
assertBrokenRing([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 1], [0, 0]], "selfTouches", "非相邻顶点自接触");
assertBrokenRing([[0, 0], [3, 0], [1, 0], [3, 2], [0, 2], [0, 0]], "backtracks", "共线折返");
assertBrokenRing([[0, 0], [3, 0], [3, 2], [1, 2], [1, 0], [2, 0], [2, 3], [0, 3], [0, 0]], "collinearOverlaps", "共线重叠");

console.log(JSON.stringify({
  ok: true,
  fixtures: FIXTURES.length,
  caseCategories: [...expectedCases.values()],
  algorithms: algorithmReports,
  reverseArcRefs,
  expectedFailureCases,
  destructiveCounterexamples: 8,
  sharedArcIdentityCounterexample: true,
  sharedArcDirectionCounterexample: true,
  regionCrossingCounterexample: true,
  coverageOverlapCounterexample: true,
  ringContinuityCounterexample: true,
  channelShapeCounterexample: true,
  degenerateRingCounterexamples: 4,
  aggressiveAreaCounterexample: true,
  bidirectionalHausdorffCounterexample: true,
  readonlyArcFacade: true,
  endpointLock: true,
  fillStrokeSameSnapshot: true,
  seamGap: 0,
  seamOverlap: 0,
  selfIntersections: 0,
  ringsValid: true
}, null, 2));

function assertBrokenConstraint(fixtureId, constraintId, mutate) {
  const fixture = cloneFixture(fixtureId);
  mutate(fixture);
  const result = validateFixture(fixture, "recommended", options);
  const constraint = result.metrics.caseConstraints.find(item => item.id === constraintId);
  assert.ok(constraint, `${fixtureId} 缺少案例约束 ${constraintId}`);
  assert.equal(constraint.pass, false, `${fixtureId}/${constraintId} 的破坏反例未被拦截`);
}

function assertBrokenRing(points, property, issueText) {
  assert.ok(inspectRingGeometry(points)[property] > 0, `${issueText}纯函数反例必须失败`);
  const fixture = cloneFixture("single-island");
  fixture.arcs.find(arc => arc.id === "coast").points = points;
  const result = validateFixture(fixture, "raw", options);
  assert.ok(!result.ok && result.issues.some(issue => issue.includes(issueText)), `${issueText}必须进入夹具 ok 判定`);
}

function cloneFixture(fixtureId) {
  return structuredClone(FIXTURES.find(fixture => fixture.id === fixtureId));
}

function formatFailures(report) {
  return report.results.filter(result => !result.ok).map(result => `${result.fixtureName}(${result.issues.join("；")})`).join("，");
}
