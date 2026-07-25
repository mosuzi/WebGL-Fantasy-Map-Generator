#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ALGORITHMS, DEFAULT_OPTIONS, samePoint} from "../prototype/boundary-topology-lab/src/algorithms.js";
import {FIXTURES} from "../prototype/boundary-topology-lab/src/fixtures.js";
import {buildIndependentComparison, buildSharedSnapshot, composeRawRing, measureIndependentSeamError, measureIndependentSeamErrorDetails, sharedArcRefs} from "../prototype/boundary-topology-lab/src/topology.js";
import {analyzeBandTriangleGeometry, analyzeCellFanGeometry, analyzePixelParityGeometry, analyzeVertexCollapseGeometry, bidirectionalHausdorff, HAUSDORFF_LIMITS, inspectRingGeometry, runAllFixtures, validateFixture} from "../prototype/boundary-topology-lab/src/validation.js";
import {collectShapeDiagnostics, maximumDeviationZoomViewBox, mergeVisualDiagnostics, resolveComparisonPresentation} from "../prototype/boundary-topology-lab/src/visual-diagnostics.js";

const expectedCases = new Map([
  ["single-island", "coast"],
  ["island-with-hole", "ring"],
  ["narrow-strait", "clearance"],
  ["lake-sea-connection", "connectivity"],
  ["tri-state-junction", "junction"],
  ["cross-state-province", "hierarchy"],
  ["map-boundary", "frame"],
  ["closed-loop", "closed-loop"],
  ["coast-fill-stroke-separation", "surface-parity"],
  ["coast-band-triangle-flip", "surface-triangulation"],
  ["coast-xor-subpixel-needle", "surface-triangulation"],
  ["coast-voronoi-vertex-collapse", "surface-precision"],
  ["coast-pixel-parity-residuals", "surface-pixel-parity"]
]);
const options = {...DEFAULT_OPTIONS};
const expectedAlgorithmPasses = new Map([
  ["raw", 13],
  ["douglas-peucker", 13],
  ["visvalingam", 13],
  ["chaikin", 13],
  ["catmull-rom", 13],
  ["b-spline", 12],
  ["recommended", 13]
]);

assert.equal(FIXTURES.length, 13, "必须固定覆盖十三类拓扑夹具");
assert.deepEqual(new Map(FIXTURES.map(fixture => [fixture.id, fixture.category])), expectedCases, "夹具 id 与案例分类必须保持稳定");
assert.deepEqual(ALGORITHMS.map(algorithm => algorithm.id), ["raw", "douglas-peucker", "visvalingam", "chaikin", "catmull-rom", "b-spline", "recommended"], "算法矩阵不完整");

const algorithmReports = [];
for (const algorithm of ALGORITHMS) {
  const report = runAllFixtures(FIXTURES, algorithm.id, options);
  assert.equal(report.summary.passed, expectedAlgorithmPasses.get(algorithm.id), `${algorithm.name} 默认通过数变化：${formatFailures(report)}`);
  if (algorithm.id === "recommended") assert.equal(report.ok, true, `${algorithm.name} 未通过全部夹具：${formatFailures(report)}`);
  assert.equal(report.summary.selfIntersections, 0, `${algorithm.name} 产生自交`);
  for (const result of report.results) {
    assert.equal(result.metrics.seamGap, 0, `${algorithm.name}/${result.fixtureName} 产生 seam gap`);
    assert.equal(result.metrics.coverageOverlap, 0, `${algorithm.name}/${result.fixtureName} 产生 coverage overlap`);
    assert.equal(result.metrics.validRings, true, `${algorithm.name}/${result.fixtureName} 产生非法 ring`);
  }
  algorithmReports.push({algorithm: algorithm.id, accepted: report.summary.passed, rejected: report.summary.failed});
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
  for (const regionError of result.metrics.regionShapeErrors) {
    if (regionError.kind !== "coast") assert.ok(regionError.hausdorff <= HAUSDORFF_LIMITS[regionError.kind], `${fixture.name}/${regionError.regionId} 行政边界 Hausdorff 超标`);
  }
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

const protectedFixtureIds = ["single-island", "narrow-strait", "lake-sea-connection"];
for (const fixtureId of protectedFixtureIds) {
  const fixture = FIXTURES.find(item => item.id === fixtureId);
  assert.deepEqual(
    [fixture.protectedObjects.towns.length, fixture.protectedObjects.roads.length, fixture.protectedObjects.rivers.length],
    [1, 1, 1],
    `${fixture.name} 必须各含一个城镇、道路和河流保护样本`
  );
  const result = validateFixture(fixture, "recommended", options);
  const objectConstraints = result.metrics.caseConstraints.filter(item => /^(town|road|river):/.test(item.id));
  assert.equal(objectConstraints.length, 4, `${fixture.name} 缺少保护对象约束`);
  assert.ok(objectConstraints.every(item => item.pass), `${fixture.name} 正常保护对象未通过：${objectConstraints.filter(item => !item.pass).map(item => item.id).join("、")}`);
}

const triStateFixture = FIXTURES.find(fixture => fixture.id === "tri-state-junction");
const triStateComparison = buildIndependentComparison(triStateFixture, "recommended", options);
assert.ok(triStateComparison.maximumDeviation, "三国交界必须提供结构化最大偏差详情");
assert.equal(triStateComparison.seamError, triStateComparison.maximumDeviation.distance, "seamError 必须与结构化最大偏差保持兼容");
assert.ok(triStateComparison.maximumDeviation.distance > 0.01, "结构化最大偏差必须捕获独立处理错位");
assert.ok(triStateComparison.usages.has(triStateComparison.maximumDeviation.arcId), "最大偏差必须指向实际共享 arc");
assert.notEqual(triStateComparison.maximumDeviation.first.regionId, triStateComparison.maximumDeviation.second.regionId, "最大偏差必须标明共享边两侧区域");
assert.equal(triStateComparison.maximumDeviation.first.point.length, 2, "最大偏差第一侧必须包含二维坐标");
assert.equal(triStateComparison.maximumDeviation.second.point.length, 2, "最大偏差第二侧必须包含二维坐标");
assert.ok(triStateComparison.maximumDeviation.ratio >= 0 && triStateComparison.maximumDeviation.ratio <= 1, "最大偏差采样比例越界");

const singleIslandComparison = buildIndependentComparison(FIXTURES.find(fixture => fixture.id === "single-island"), "recommended", options);
assert.equal(singleIslandComparison.seamError, 0, "零共享 arc 案例必须保留 seamError = 0");
assert.equal(singleIslandComparison.maximumDeviation, null, "零共享 arc 案例不得伪造最大偏差");

const sharedPresentation = resolveComparisonPresentation(3);
assert.deepEqual([sharedPresentation.kind, sharedPresentation.firstMode, sharedPresentation.secondMode], ["shared", "independent", "shared"], "共享案例必须使用独立/共享对照模式");
const shapePresentation = resolveComparisonPresentation(0);
assert.deepEqual([shapePresentation.kind, shapePresentation.firstMode, shapePresentation.secondMode], ["shape", "raw", "processed"], "零共享案例必须使用原始/处理后形状对照模式");
const surfacePresentation = resolveComparisonPresentation(0, true);
assert.deepEqual(
  [surfacePresentation.kind, surfacePresentation.firstMode, surfacePresentation.secondMode],
  ["surface", "legacy-surface", "shared-surface"],
  "填色—描边夹具必须使用旧策略/同源策略对照模式"
);
const bandPresentation = resolveComparisonPresentation(0, "band");
assert.deepEqual(
  [bandPresentation.kind, bandPresentation.firstMode, bandPresentation.secondMode],
  ["band", "legacy-band", "exact-surface"],
  "过渡带翻面夹具必须使用旧四三角/精确填色对照模式"
);
const cellFanPresentation = resolveComparisonPresentation(0, "cell-fan");
assert.deepEqual(
  [cellFanPresentation.kind, cellFanPresentation.firstMode, cellFanPresentation.secondMode],
  ["cell-fan", "legacy-cell-fan", "earcut-cell-surface"],
  "正式单元夹具必须使用中心扇形/Earcut 边界三角化对照模式"
);
const vertexCollapsePresentation = resolveComparisonPresentation(0, "vertex-collapse");
assert.deepEqual(
  [vertexCollapsePresentation.kind, vertexCollapsePresentation.firstMode, vertexCollapsePresentation.secondMode],
  ["vertex-collapse", "collapsed-grid-surface", "resolved-grid-surface"],
  "正式顶点坍缩夹具必须使用旧存储坐标/精确回算坐标对照模式"
);
const pixelParityPresentation = resolveComparisonPresentation(0, "pixel-parity");
assert.deepEqual(
  [pixelParityPresentation.kind, pixelParityPresentation.firstMode, pixelParityPresentation.secondMode],
  ["pixel-parity", "legacy-pixel-seams", "exact-pixel-parity"],
  "正式像素残余夹具必须使用旧长针浅边/边缘覆盖细描边对照模式"
);

const vertexCollapseFixture = FIXTURES.find(fixture => fixture.id === "coast-voronoi-vertex-collapse");
const vertexCollapseGeometry = analyzeVertexCollapseGeometry(vertexCollapseFixture);
assert.deepEqual(vertexCollapseGeometry.source.cells, [6255, 6378], "实验室必须固定用户当前现场的两个正式水面 cell");
assert.deepEqual(vertexCollapseGeometry.source.vertices, [5331, 5519], "实验室必须固定用户当前现场的两个坍缩 Voronoi 顶点");
assert.equal(vertexCollapseGeometry.storedEdgeLength, 0, "实验室旧侧必须原样复现零长度共享边");
assert.ok(vertexCollapseGeometry.resolvedEdgeLength > 0.1 && vertexCollapseGeometry.resolvedEdgeLength < 0.2, "实验室最终侧必须恢复精确共享边");
assert.ok(vertexCollapseGeometry.projectedCssLength >= 0.9, "实验室最终侧必须覆盖当前 12x 现场可见的约 1 CSS px 接缝");

const pixelParityFixture = FIXTURES.find(fixture => fixture.id === "coast-pixel-parity-residuals");
const pixelParityResult = validateFixture(pixelParityFixture, "recommended", options);
const pixelParityGeometry = analyzePixelParityGeometry(pixelParityFixture);
assert.deepEqual(
  [pixelParityGeometry.lakeNeedle.landCell, pixelParityGeometry.lakeNeedle.waterCell],
  [6496, 6617],
  "实验室必须固定用户第五次截图的正式湖岸单元"
);
assert.deepEqual(
  [pixelParityGeometry.coastStroke.landCell, pixelParityGeometry.coastStroke.waterCell],
  [6377, 6378],
  "实验室必须固定用户第五次截图的正式海岸单元"
);
assert.equal(pixelParityGeometry.legacyUncoveredBoundaryEdges, 1, "旧侧必须稳定复现一条无覆盖的修补面边缘");
assert.equal(pixelParityGeometry.finalUncoveredBoundaryEdges, 0, "最终侧必须以同色边缘覆盖消除像素针");
assert.equal(pixelParityGeometry.finalBoundaryCoverWorld, 0.18, "最终侧必须固定 0.18 世界单位的边缘覆盖");
assert.ok(pixelParityGeometry.legacyProjectedStrokeCss > 4.5, "旧海岸线必须在截图投影下稳定复现宽浅色带");
assert.ok(pixelParityGeometry.finalProjectedStrokeCss <= 1.5, "最终海岸线必须在截图投影下收敛到 1.5 CSS px 内");
assert.ok(pixelParityResult.metrics.caseConstraints.every(item => item.pass), "正式像素残余夹具的两项硬门禁必须通过");
assert.ok(mergeVisualDiagnostics(pixelParityResult).some(item => item.message.includes("#6496/#6617")), "实验室必须提供正式湖岸单元的可定位诊断");
assert.ok(mergeVisualDiagnostics(pixelParityResult).some(item => item.message.includes("#6377/#6378")), "实验室必须提供正式海岸单元的可定位诊断");

const surfaceFixture = FIXTURES.find(fixture => fixture.id === "coast-fill-stroke-separation");
const surfaceResult = validateFixture(surfaceFixture, "recommended", options);
assert.ok(surfaceResult.metrics.surfaceClassification.xorSamples > 0, "填色—描边夹具必须实际产生 raw XOR processed 二维差异");
assert.ok(
  surfaceResult.metrics.surfaceClassification.legacyMismatchSamples >= surfaceFixture.surfaceComparison.minimumLegacyMismatchSamples,
  "旧策略必须留下达到门槛的未覆盖二维采样"
);
assert.equal(surfaceResult.metrics.surfaceClassification.sharedMismatchSamples, 0, "同源策略不得留下二维分类错分");
assert.ok(surfaceResult.metrics.surfaceClassification.correctionTriangleCount > 0, "实验室必须生成并重放实际 XOR 修补三角形");
assert.equal(surfaceResult.metrics.surfaceClassification.correctionVerificationStep, 0.5, "实验室必须用不同于构建过程的 0.5px 错相位细采样独立重放");
assert.equal(surfaceResult.metrics.surfaceClassification.correctionDegenerateTriangles, 0, "实验室 XOR 修补不得产生退化三角形");
assert.equal(surfaceResult.metrics.surfaceClassification.correctionMultiCoveredSamples, 0, "实验室 XOR 修补不得产生内部重复覆盖");
assert.equal(surfaceResult.metrics.surfaceClassification.correctionConflictingSamples, 0, "实验室 XOR 修补不得产生陆水冲突覆盖");
assert.equal(surfaceResult.metrics.caseConstraints.find(item => item.id === "legacy-surface-exposes-wedge")?.pass, true, "旧策略外露楔形必须作为固定预期失败被定位");
assert.equal(surfaceResult.metrics.caseConstraints.find(item => item.id === "shared-surface-classification")?.pass, true, "同源填色与描边硬门禁必须通过");
assert.ok(mergeVisualDiagnostics(surfaceResult).some(item => item.message.includes("左图红色区域可定位")), "旧策略外露楔形必须提供可定位视觉诊断");

const bandFixture = FIXTURES.find(fixture => fixture.id === "coast-band-triangle-flip");
const bandResult = validateFixture(bandFixture, "recommended", options);
const bandGeometry = analyzeBandTriangleGeometry(bandFixture);
assert.deepEqual(
  bandGeometry.legacySignedAreas.map(area => Number(area.toFixed(2))),
  [1147.17, 2479.37, 3126.37, -2633.01],
  "固定反例必须保持与正式 writer 相同的四三角拆分和一个反向面"
);
assert.equal(bandGeometry.legacyOppositeWindingCount, 1, "固定反例必须稳定暴露一个与其余三角面相反的三角扇");
assert.equal(bandGeometry.finalTriangleCount, 0, "精确 XOR 填色路径不得再提交冗余过渡带三角面");
assert.equal(bandResult.metrics.caseConstraints.find(item => item.id === "legacy-band-opposite-winding")?.pass, true, "旧四三角过渡带必须稳定复现翻面");
assert.equal(bandResult.metrics.caseConstraints.find(item => item.id === "exact-surface-retires-band")?.pass, true, "最终精确填色必须停用冗余过渡带");
assert.ok(mergeVisualDiagnostics(bandResult).some(item => item.message.includes("红色三角扇可定位")), "过渡带翻面必须提供可定位视觉诊断");

const cellFanFixture = FIXTURES.find(fixture => fixture.id === "coast-xor-subpixel-needle");
const cellFanResult = validateFixture(cellFanFixture, "recommended", options);
const cellFanGeometry = analyzeCellFanGeometry(cellFanFixture);
assert.deepEqual(cellFanGeometry.cases.map(item => item.cell), [1061, 8832], "实验室必须固定引用正式地图的两个原始 cell");
assert.deepEqual(cellFanGeometry.cases.map(item => item.height), [19, 20], "正式反例必须覆盖海平线两侧高度");
assert.deepEqual(cellFanGeometry.cases.map(item => item.legacyLeakCount), [2, 3], "旧中心扇形必须稳定复现 2 + 3 个越界三角");
assert.deepEqual(cellFanGeometry.sides.sort(), ["land", "water"], "正式反例必须同时覆盖陆色入水与水色入陆");
assert.equal(cellFanGeometry.legacyLeakCount, 5, "实验室必须复现正式 writer 的五个海岸越界三角");
assert.deepEqual(cellFanGeometry.cases.map(item => item.legacyRasterLeakSamples), [37, 22], "实验室 0.1 世界单位采样必须与正式生成器反例逐点一致");
assert.equal(cellFanGeometry.finalLeakCount, 0, "边界 Earcut 三角化不得留下越界填色");
assert.equal(cellFanGeometry.finalRasterLeakSamples, 0, "边界 Earcut 三角化不得留下像素级异侧填色");
assert.equal(cellFanResult.metrics.caseConstraints.find(item => item.id === "formal-cell-fan-leaks-reproduced")?.pass, true, "正式中心扇形反例门禁必须通过");
assert.equal(cellFanResult.metrics.caseConstraints.find(item => item.id === "earcut-boundary-contained")?.pass, true, "边界 Earcut 包含性门禁必须通过");
assert.ok(mergeVisualDiagnostics(cellFanResult).some(item => item.message.includes("原始单元")), "正式单元反例必须提供可定位视觉诊断");

const narrowStraitFixture = FIXTURES.find(fixture => fixture.id === "narrow-strait");
const catmullStrait = validateFixture(narrowStraitFixture, "catmull-rom", options);
const catmullDiagnostics = mergeVisualDiagnostics(catmullStrait);
assert.ok(catmullDiagnostics.some(item => item.message.includes("面积 P95 13.269%")), "Catmull-Rom 狭窄海峡必须显示面积 P95 13.269% 观察项");
assert.ok(catmullDiagnostics.some(item => item.message.includes("Hausdorff")), "Catmull-Rom 狭窄海峡必须同时显示 Hausdorff 原因");
assert.equal(catmullStrait.ok, true, "海岸形变诊断不得单独让 Catmull-Rom 狭窄海峡失败");
assert.equal(catmullStrait.issues.some(issue => issue.includes("面积 P95") || issue.includes("Hausdorff")), false, "海岸形状观察项不得写回 issues");
assert.ok(catmullStrait.metrics.shapeDiagnostics.filter(item => item.kind === "coast" && item.exceeded).every(item => item.policy === "notice"), "海岸超限必须保持结构化仅提示策略");
assert.ok(collectShapeDiagnostics(catmullStrait.metrics).every(item => item.source === "shape" && item.message.includes("仅提示")), "海岸形状提示必须具有独立提示语义");
const rawNarrowRing = composeRawRing(narrowStraitFixture.regions[0].rings[0], narrowStraitFixture);
const processedNarrowRing = catmullStrait.snapshot.regions[0].rings[0];
assert.equal(catmullStrait.metrics.sharedArcCount, 0, "狭窄海峡必须覆盖零共享 shape 模式");
assert.ok(bidirectionalHausdorff(rawNarrowRing, processedNarrowRing) > 0.01, "零共享 shape 模式的原始/处理后轮廓必须确有差异");

const reverseSameShape = new Map([["shared", [
  {regionId: "first", reversed: false, points: [[0, 0], [10, 0]]},
  {regionId: "second", reversed: true, points: [[10, 0], [0, 0]]}
]]]);
assert.equal(measureIndependentSeamError(reverseSameShape), 0, "纯反向但同形的共享边 seam 必须为 0");
const reverseOffset = new Map([["shared", [
  {regionId: "first", reversed: false, points: [[0, 0], [10, 0]]},
  {regionId: "second", reversed: true, points: [[10, 0], [5, 3], [0, 0]]}
]]]);
const reverseOffsetMaximum = measureIndependentSeamErrorDetails(reverseOffset);
assert.equal(reverseOffsetMaximum.distance, 3, "反向错位最大偏差距离错误");
assert.deepEqual(reverseOffsetMaximum.first.point, [5, 0], "反向错位第一侧最大偏差坐标错误");
assert.deepEqual(reverseOffsetMaximum.second.point, [5, 3], "反向错位第二侧最大偏差坐标错误");
const zoomViewBox = maximumDeviationZoomViewBox(reverseOffsetMaximum);
assert.ok(zoomViewBox && [zoomViewBox.minX, zoomViewBox.minY, zoomViewBox.width, zoomViewBox.height].every(Number.isFinite), "最大偏差 zoom viewBox 必须全为有限数");
assert.ok(zoomViewBox.width > 0 && zoomViewBox.height > 0, "最大偏差 zoom viewBox 必须为正尺寸");
assert.ok(zoomViewBox.viewBox.split(" ").map(Number).every(Number.isFinite), "最大偏差 zoom viewBox 字符串必须可解析");
assert.equal(maximumDeviationZoomViewBox({distance: 1, first: {point: []}, second: {point: [0, 0]}}), null, "空坐标数组必须拒绝生成 zoom viewBox");
assert.equal(maximumDeviationZoomViewBox({distance: 1, first: {point: [0, 0]}, second: {point: [1]}}), null, "单元素坐标数组必须拒绝生成 zoom viewBox");
assert.equal(maximumDeviationZoomViewBox({distance: 1, first: {point: [Number.NaN, 0]}, second: {point: [0, 0]}}), null, "NaN 坐标必须拒绝生成 zoom viewBox");
const normalizedDistanceZoom = maximumDeviationZoomViewBox({distance: Number.NaN, first: {point: [0, 0, Number.NaN]}, second: {point: [3, 4, Number.NaN]}});
assert.ok(normalizedDistanceZoom, "合法 x/y 不应受额外坐标分量影响");
assert.equal(normalizedDistanceZoom.distance, 5, "非有限声明距离必须归一化为有限实测距离");
assert.ok([normalizedDistanceZoom.distance, normalizedDistanceZoom.minX, normalizedDistanceZoom.minY, normalizedDistanceZoom.width, normalizedDistanceZoom.height].every(Number.isFinite), "归一化 zoom model 必须全为有限数");
assert.ok(normalizedDistanceZoom.width > 0 && normalizedDistanceZoom.height > 0, "归一化 zoom viewBox 必须为正尺寸");

const indexSource = readFileSync(new URL("../prototype/boundary-topology-lab/index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../prototype/boundary-topology-lab/src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../prototype/boundary-topology-lab/src/styles.css", import.meta.url), "utf8");
for (const contract of ["id=\"independent-title\"", "id=\"shared-status\"", "id=\"visual-legend\"", "id=\"current-issues\"", "绿色仅表示共享同源", "受保护城镇", "受保护道路", "受保护河流", "锚定河口", "海岸形状超限仅提示"]) {
  assert.ok(indexSource.includes(contract), `静态 UI 缺少契约：${contract}`);
}
for (const contract of ["fixtureId: \"tri-state-junction\"", "resolveComparisonPresentation(", "mergeVisualDiagnostics(", "maximumDeviationZoomViewBox(", "deviationMarkup(result.comparison)", "protectedObjectsMarkup(fixture)", "surfaceMismatchMarkup(", "bandTriangleMarkup(", "cellFanMarkup(", "legacy-surface", "legacy-band", "legacy-cell-fan", "earcut-cell-surface", "metrics.shapePolicy === \"notice\"", "当前验收与形状诊断", "result.ok ? \"pass\" : \"fail\""]) {
  assert.ok(appSource.includes(contract), `交互逻辑缺少契约：${contract}`);
}
assert.ok(appSource.includes("zoom.distance.toFixed(2)"), "UI 最大偏差文案必须使用归一化有限距离");
assert.equal(appSource.includes("maximum.distance.toFixed"), false, "UI 不得直接显示未经归一化的最大偏差距离");
for (const contract of [".usage-side.side-first", ".usage-side.side-second", ".same-source-line", ".deviation-connector", ".zoom-shell", ".result-card.fail", ".protected-town", ".protected-road", ".protected-river", ".protected-mouth", ".legacy-repair-band", ".surface-mismatch", ".band-triangle.flipped", ".band-centerline", ".cell-fan-triangle.leaked", ".cell-fan-boundary", ".cell-fan-status.fail", ".metric.notice"]) {
  assert.ok(styleSource.includes(contract), `诊断样式缺少契约：${contract}`);
}

const immutableSnapshot = buildSharedSnapshot(FIXTURES[0], "recommended", options);
assert.ok(Object.isFrozen(immutableSnapshot.arcs), "snapshot.arcs facade 必须冻结");
assert.equal(immutableSnapshot.arcs.set, undefined, "snapshot.arcs 不得暴露 set");
assert.equal(immutableSnapshot.arcs.delete, undefined, "snapshot.arcs 不得暴露 delete");
assert.equal(immutableSnapshot.arcs.clear, undefined, "snapshot.arcs 不得暴露 clear");
assert.throws(() => { immutableSnapshot.arcs.set = () => {}; }, TypeError, "snapshot.arcs 不应允许注入写方法");
assert.ok(Object.isFrozen(immutableSnapshot.arcs.get("coast")), "snapshot arc 值必须不可变");

assert.ok(bidirectionalHausdorff([[0, 0], [5, 5], [10, 0]], [[0, 0], [10, 0]]) >= 5, "双向 Hausdorff 必须捕获被简化线遗漏的峰值");
const aggressive = runAllFixtures(FIXTURES, "recommended", {threshold: 5, smoothness: 0.22, maxDisplacement: 7});
assert.equal(aggressive.ok, false, "行政边界门槛必须拦截过强的推荐平滑参数");
assert.ok(aggressive.results.some(result => result.issues.some(issue => issue.includes("Hausdorff"))), "国界 / 省界 Hausdorff 分层门槛必须拦截超标参数");

const stateAreaFixture = cloneFixture("single-island");
stateAreaFixture.id = "state-area-counterexample";
stateAreaFixture.arcs[0].id = "boundary-alpha";
stateAreaFixture.arcs[0].kind = "state";
stateAreaFixture.regions[0].rings[0][0].arcId = "boundary-alpha";
delete stateAreaFixture.protectedObjects;
const stateAreaResult = validateFixture(stateAreaFixture, "recommended", {threshold: 5, smoothness: 0.22, maxDisplacement: 7});
assert.ok(stateAreaResult.issues.some(issue => issue.includes("state 面积 P95")), "推荐管线必须保留国界面积 P95 硬门槛");

const provinceAreaFixture = cloneFixture("single-island");
provinceAreaFixture.id = "province-area-counterexample";
provinceAreaFixture.arcs[0].id = "boundary-beta";
provinceAreaFixture.arcs[0].kind = "province";
provinceAreaFixture.regions[0].rings[0][0].arcId = "boundary-beta";
delete provinceAreaFixture.protectedObjects;
const provinceAreaResult = validateFixture(provinceAreaFixture, "recommended", {threshold: 5, smoothness: 0.22, maxDisplacement: 7});
assert.ok(provinceAreaResult.issues.some(issue => issue.includes("province 面积 P95")), "推荐管线必须按 arc.kind 保留省界面积 P95 硬门槛");

const bSplineStateResult = validateFixture(FIXTURES.find(fixture => fixture.id === "map-boundary"), "b-spline", options);
assert.equal(bSplineStateResult.ok, false, "B-spline 国界 Hausdorff 超限必须失败");
assert.ok(bSplineStateResult.issues.some(issue => issue.includes("Hausdorff")), "国界 Hausdorff 超限必须写入 issues");
assert.ok(bSplineStateResult.metrics.shapeDiagnostics.some(item => item.kind === "state" && item.metric === "hausdorff" && item.exceeded && item.policy === "acceptance"), "国界 Hausdorff 必须保留结构化硬验收诊断");

const brokenTownRegion = cloneFixture("single-island");
brokenTownRegion.protectedObjects.towns[0].regionId = "missing-land";
assertDefinitionRejected(brokenTownRegion, "不存在的 region", "城镇坏 region 引用");

const brokenMouthArc = cloneFixture("single-island");
brokenMouthArc.protectedObjects.rivers[0].mouth.arcId = "missing-coast";
assertDefinitionRejected(brokenMouthArc, "不存在的 arc", "河口坏 arc 引用");

const brokenRegionArc = cloneFixture("single-island");
brokenRegionArc.regions[0].rings[0][0].arcId = "missing-boundary";
assertDefinitionRejected(brokenRegionArc, "不存在的 arc", "区域坏 arc 引用");

const nonFiniteObject = cloneFixture("single-island");
nonFiniteObject.protectedObjects.roads[0].points[1][0] = Number.NaN;
assertDefinitionRejected(nonFiniteObject, "不是有限二维点", "保护对象非有限坐标");

const nonCoastMouth = cloneFixture("single-island");
nonCoastMouth.arcs.find(arc => arc.id === "coast").kind = "state";
assertDefinitionRejected(nonCoastMouth, "不是海岸", "河口非海岸 ArcRef");

const invalidTownCollection = cloneFixture("single-island");
invalidTownCollection.protectedObjects.towns = {};
assertDefinitionRejected(invalidTownCollection, "protectedObjects.towns 必须是数组", "城镇集合非数组");

const nullArcDefinition = cloneFixture("single-island");
nullArcDefinition.arcs.push(null);
assertDefinitionRejected(nullArcDefinition, "缺失或重复 arc id", "空 arc 定义");

const townAcrossCoast = cloneFixture("single-island");
townAcrossCoast.protectedObjects.towns[0].point = [32, 116];
assertBrokenObjectConstraint(townAcrossCoast, "town:island-town:land-region", "城镇越岸");

const roadInWater = cloneFixture("single-island");
roadInWater.protectedObjects.roads[0].points[1] = [32, 116];
assertBrokenObjectConstraint(roadInWater, "road:island-road:land", "道路入水");

const driftingMouth = cloneFixture("single-island");
driftingMouth.protectedObjects.rivers[0].points.at(-1)[0] += 3;
const driftingMouthResult = validateFixture(driftingMouth, "raw", options);
assert.equal(driftingMouthResult.metrics.caseConstraints.find(item => item.id === "river:island-river:mouth-lock")?.pass, false, "河口漂移必须触发 mouth-lock");
assert.equal(driftingMouthResult.metrics.caseConstraints.some(item => item.id === "river:island-river:land-side"), false, "河口未锁定时不得追加 land-side 假失败");
assert.equal(driftingMouthResult.issues.filter(issue => issue.includes("案例约束失败")).length, 1, "纯河口漂移只能报告一条对象失败原因");

const earlyCoastCrossing = cloneFixture("single-island");
earlyCoastCrossing.protectedObjects.rivers[0].points[1] = [32, 100];
const earlyCrossingResult = validateFixture(earlyCoastCrossing, "raw", options);
assert.equal(earlyCrossingResult.metrics.caseConstraints.find(item => item.id === "river:island-river:mouth-lock")?.pass, true, "提前穿岸反例必须保持河口锚定，避免混淆失败原因");
assertBrokenObjectConstraint(earlyCoastCrossing, "river:island-river:land-side", "河流提前穿岸");

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
assertBrokenConstraint("coast-fill-stroke-separation", "shared-surface-classification", fixture => {
  fixture.surfaceComparison.correctionMode = "disabled";
});
assertBrokenConstraint("coast-xor-subpixel-needle", "formal-cell-fan-leaks-reproduced", fixture => {
  fixture.cellFanComparison.cases[0].expectedLegacyLeaks = 99;
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
  structuredMaximumDeviation: true,
  seamErrorCompatibility: true,
  zeroSharedArcComparison: true,
  comparisonPresentationModes: [sharedPresentation.kind, shapePresentation.kind, surfacePresentation.kind, bandPresentation.kind, cellFanPresentation.kind],
  mergedShapeDiagnostics: true,
  reverseSameShapeSeam: 0,
  reverseOffsetMaximum: reverseOffsetMaximum.distance,
  finiteZoomViewBox: true,
  invalidZoomInputsRejected: 3,
  normalizedZoomDistance: normalizedDistanceZoom.distance,
  staticUiContracts: true,
  destructiveCounterexamples: 10,
  sharedArcIdentityCounterexample: true,
  sharedArcDirectionCounterexample: true,
  regionCrossingCounterexample: true,
  coverageOverlapCounterexample: true,
  ringContinuityCounterexample: true,
  channelShapeCounterexample: true,
  degenerateRingCounterexamples: 4,
  coastShapeNoticePolicy: true,
  administrativeShapeHardGates: true,
  protectedFixtures: protectedFixtureIds.length,
  protectedObjectTypes: ["town", "road", "river", "mouth"],
  protectedObjectDefinitionCounterexamples: 7,
  protectedObjectDestructiveCounterexamples: 4,
  bidirectionalHausdorffCounterexample: true,
  readonlyArcFacade: true,
  endpointLock: true,
  fillStrokeSameSnapshot: true,
  surfaceClassificationGate: true,
  bandTriangleWindingGate: true,
  legacyOppositeWindingTriangles: bandGeometry.legacyOppositeWindingCount,
  finalBandTriangleCount: bandGeometry.finalTriangleCount,
  reproducedFormalCellFanLeaks: cellFanGeometry.legacyLeakCount,
  finalResidualCellFanLeaks: cellFanGeometry.finalLeakCount,
  legacyMismatchSamples: surfaceResult.metrics.surfaceClassification.legacyMismatchSamples,
  legacyMismatchArea: surfaceResult.metrics.surfaceClassification.legacyMismatchArea,
  correctionTriangleCount: surfaceResult.metrics.surfaceClassification.correctionTriangleCount,
  correctionVerificationStep: surfaceResult.metrics.surfaceClassification.correctionVerificationStep,
  correctionDegenerateTriangles: surfaceResult.metrics.surfaceClassification.correctionDegenerateTriangles,
  correctionMultiCoveredSamples: surfaceResult.metrics.surfaceClassification.correctionMultiCoveredSamples,
  correctionConflictingSamples: surfaceResult.metrics.surfaceClassification.correctionConflictingSamples,
  sharedMismatchSamples: surfaceResult.metrics.surfaceClassification.sharedMismatchSamples,
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

function assertDefinitionRejected(fixture, issueText, label) {
  const result = validateFixture(fixture, "raw", options);
  assert.equal(result.ok, false, `${label}必须被定义校验拒绝`);
  assert.ok(result.issues.some(issue => issue.includes(issueText)), `${label}缺少明确失败原因：${result.issues.join("；")}`);
  assert.equal(result.snapshot, null, `${label}不得进入拓扑快照构建`);
}

function assertBrokenObjectConstraint(fixture, constraintId, label) {
  const result = validateFixture(fixture, "raw", options);
  const constraint = result.metrics.caseConstraints.find(item => item.id === constraintId);
  assert.ok(constraint, `${label}缺少案例约束 ${constraintId}`);
  assert.equal(constraint.pass, false, `${label}破坏反例未被拦截`);
  assert.equal(result.ok, false, `${label}必须进入夹具硬失败判定`);
}

function cloneFixture(fixtureId) {
  return structuredClone(FIXTURES.find(fixture => fixture.id === fixtureId));
}

function formatFailures(report) {
  return report.results.filter(result => !result.ok).map(result => `${result.fixtureName}(${result.issues.join("；")})`).join("，");
}
