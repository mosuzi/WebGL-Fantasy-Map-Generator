#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runHundredThousandAsyncRiver = process.argv.includes("--100k-async-river");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {
    validateFeaturesNetworksResourcesWorkerOutput,
    validateFeaturesNetworksResourcesWorkerOutputAsync
  } = await vite.ssrLoadModule("/src/domains/features/worker-runtime.ts");
  const {FEATURES_WORKER_WRITE_SET, featuresManifest} = await vite.ssrLoadModule("/src/domains/features/manifest.ts");
  const {ROUTES_WORKER_WRITE_SET, ROUTE_PATH_WORKER_WRITE_SET, routesManifest} = await vite.ssrLoadModule("/src/domains/routes/manifest.ts");
  const {RIVERS_WORKER_WRITE_SET, riversManifest} = await vite.ssrLoadModule("/src/domains/rivers/manifest.ts");
  const {MARKERS_WORKER_WRITE_SET, markersManifest} = await vite.ssrLoadModule("/src/domains/markers/manifest.ts");
  const {generatePlaceholderMap} = await vite.ssrLoadModule("/src/generator/index.js");
  const {
    createRiverLakeDrainageExpectations,
    createRiverLakeDrainageExpectationsAsync
  } = await vite.ssrLoadModule("/src/generator/rivers.js");
  const {createFoundationWorkerBinding} = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {runRegenerationWorkerTask, getRegenerationPatchPolicy} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const {createRegenerateResourceMarkersCommand, regenerateResourceMarkersInChunks} = await vite.ssrLoadModule("/src/runtime/marker-edit-commands.js");
  const {createDomainPatchCommand} = await vite.ssrLoadModule("/src/runtime/domain-patch.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");
  const {EditHistory} = await vite.ssrLoadModule("/src/runtime/edit-history.js");
  const {createRenderResourceBinding} = await vite.ssrLoadModule("/src/renderer/render-resource-binding.js");

  const manifests = {features: featuresManifest, routes: routesManifest, rivers: riversManifest, markers: markersManifest};
  const writes = {features: FEATURES_WORKER_WRITE_SET, routes: ROUTES_WORKER_WRITE_SET, rivers: RIVERS_WORKER_WRITE_SET, markers: MARKERS_WORKER_WRITE_SET};
  for (const [kind, manifest] of Object.entries(manifests)) {
    assert.equal(manifest.workerTasks[0].task, "regeneration.compute", `${kind} 未绑定真实 regeneration transport`);
    assert.deepEqual(manifest.workerTasks[0].resultKinds, [kind], `${kind} result owner 漂移`);
    assert.deepEqual(manifest.workerTasks[0].writeSet, writes[kind], `${kind} Manifest 写集漂移`);
  }
  assert.equal(routesManifest.workerTasks[1].task, "route-path.compute");
  assert.deepEqual(routesManifest.workerTasks[1].writeSet, ROUTE_PATH_WORKER_WRITE_SET, "route-path Manifest 写集漂移");

  const owner = new MapRevisionTracker({identityFactory: () => "geography-map"});
  owner.replaceMap();
  owner.advance();
  const binding = createFoundationWorkerBinding({revision: owner.getCoreSnapshot(), generationToken: 9, lockFingerprint: "geography-locks", operation: {id: 41, name: "geography-regression"}});
  const outputs = {};
  for (const kind of Object.keys(manifests)) {
    const sourceMap = generatePlaceholderMap({seed: `geography-${kind}`, cellsTarget: 2000, heightmapTemplate: "continents"});
    if (kind === "markers") {
      sourceMap.politics.states = structuredClone(sourceMap.pack.states);
      sourceMap.politics.provinces = structuredClone(sourceMap.pack.provinces);
      assert.notStrictEqual(sourceMap.politics.states, sourceMap.pack.states, "资源点夹具必须分离国家镜像引用");
      assert.notStrictEqual(sourceMap.politics.provinces, sourceMap.pack.provinces, "资源点夹具必须分离省份镜像引用");
    }
    const workerMap = structuredClone(sourceMap);
    const output = await runRegenerationWorkerTask({map: workerMap, kind}, {binding, checkpoint() {}, report() {}});
    const policy = getRegenerationPatchPolicy(kind);
    const validated = validateFeaturesNetworksResourcesWorkerOutput({kind, sourceMap, binding, output, policy});
    const expected = kind === "markers" ? writes[kind].filter(pathValue => !["markers.metadata.stale", "economy.metadata.stale"].includes(pathValue)) : writes[kind];
    assert.deepEqual([...validated.writeSet].sort(), [...expected].sort(), `${kind} 实际 patch 写集不符合领域契约`);
    outputs[kind] = {sourceMap, output, policy};
  }
  const asyncRiverStages = [];
  const asyncRiverCurrentChecks = [];
  const asyncRiverValidated = await validateFeaturesNetworksResourcesWorkerOutputAsync({
    kind: "rivers",
    sourceMap: outputs.rivers.sourceMap,
    binding,
    output: outputs.rivers.output,
    policy: outputs.rivers.policy
  }, {
    yieldToMain: ({id}) => asyncRiverStages.push(id),
    assertCurrent: ({id}) => asyncRiverCurrentChecks.push(id)
  });
  assert.deepEqual(asyncRiverValidated, validateFeaturesNetworksResourcesWorkerOutput({
    kind: "rivers",
    sourceMap: outputs.rivers.sourceMap,
    binding,
    output: outputs.rivers.output,
    policy: outputs.rivers.policy
  }), "异步 river validator 回执与同步兼容入口不一致");
  assert.deepEqual(asyncRiverStages, ["before-clone", "after-clone", "after-variation", "after-effective-heights", "after-closed-lakes", "after-depressions", "after-lake-drainage", "after-expectations"], "异步 river validator 分段契约漂移");
  assert.deepEqual(asyncRiverCurrentChecks, asyncRiverStages, "异步 river validator 未在每次恢复后复核 current");

  const asyncExpectationStages = [];
  const syncExpectations = createRiverLakeDrainageExpectations(outputs.rivers.sourceMap.grid, outputs.rivers.sourceMap.pack, {...outputs.rivers.sourceMap.options, riverRegenerationSalt: 1});
  const asyncExpectations = await createRiverLakeDrainageExpectationsAsync(outputs.rivers.sourceMap.grid, outputs.rivers.sourceMap.pack, {...outputs.rivers.sourceMap.options, riverRegenerationSalt: 1}, {
    yieldToMain: ({id}) => asyncExpectationStages.push(id),
    assertCurrent() {}
  });
  assert.deepEqual(asyncExpectations, syncExpectations, "异步 lake drainage expectations 与完整同步语义不一致");
  assert.equal(asyncExpectationStages.length, 8, "异步 lake drainage expectations 缺少固定分段");
  const cancellationSourceFingerprint = JSON.stringify(outputs.rivers.sourceMap.pack.features);
  await assert.rejects(createRiverLakeDrainageExpectationsAsync(outputs.rivers.sourceMap.grid, outputs.rivers.sourceMap.pack, {...outputs.rivers.sourceMap.options, riverRegenerationSalt: 1}, {
    yieldToMain() {},
    assertCurrent: ({id}) => {
      if (id === "after-effective-heights") {
        const error = new Error("river validator stale fixture");
        error.code = "operation_obsolete";
        throw error;
      }
    }
  }), error => error?.code === "operation_obsolete");
  assert.equal(JSON.stringify(outputs.rivers.sourceMap.pack.features), cancellationSourceFingerprint, "异步 lake drainage 取消路径改写了源地图");
  let hundredThousandAsyncRiver = null;
  if (runHundredThousandAsyncRiver) {
    const sourceMap = generatePlaceholderMap({seed: "worker-session-100k", cellsTarget: 100000, heightmapTemplate: "continents"});
    const output = await runRegenerationWorkerTask({map: structuredClone(sourceMap), kind: "rivers"}, {binding, checkpoint() {}, report() {}});
    const slices = [];
    let sliceStartedAt = performance.now();
    const validationStartedAt = sliceStartedAt;
    await validateFeaturesNetworksResourcesWorkerOutputAsync({
      kind: "rivers",
      sourceMap,
      binding,
      output,
      policy: getRegenerationPatchPolicy("rivers")
    }, {
      yieldToMain: async ({id}) => {
        const sliceEndedAt = performance.now();
        slices.push({id, computeMs: Number((sliceEndedAt - sliceStartedAt).toFixed(1))});
        await new Promise(resolve => setImmediate(resolve));
        sliceStartedAt = performance.now();
      },
      assertCurrent() {}
    });
    slices.push({id: "river-mirror-final", computeMs: Number((performance.now() - sliceStartedAt).toFixed(1))});
    const maxSliceMs = Math.max(...slices.map(stage => stage.computeMs));
    assert.ok(maxSliceMs < 200, `100k 异步 river validator 仍有超过 200ms 的单段：${JSON.stringify(slices)}`);
    hundredThousandAsyncRiver = {
      cells: sourceMap.pack.cells.i.length,
      totalMs: Number((performance.now() - validationStartedAt).toFixed(1)),
      maxSliceMs,
      slices
    };
  }
  const renderBinding = createRenderResourceBinding({
    mapIdentity: binding.mapIdentity,
    sourceRevision: binding.mapRevision + 1,
    topologyRevision: binding.topologyRevision + 1
  }, {renderPreparationId: "geography:features:render:1", renderGeneration: 3});
  const renderedFeaturesSource = generatePlaceholderMap({seed: "geography-render-binding", cellsTarget: 2000, heightmapTemplate: "continents"});
  const renderedFeaturesOutput = await runRegenerationWorkerTask({
    map: structuredClone(renderedFeaturesSource),
    kind: "features",
    render: pointRenderRequest(renderBinding)
  }, {binding, checkpoint() {}, report() {}});
  validateFeaturesNetworksResourcesWorkerOutput({
    kind: "features",
    sourceMap: renderedFeaturesSource,
    binding,
    renderBinding,
    output: renderedFeaturesOutput,
    policy: getRegenerationPatchPolicy("features")
  });
  assertProtocol(() => validateFeaturesNetworksResourcesWorkerOutput({
    kind: "features",
    sourceMap: renderedFeaturesSource,
    binding,
    output: renderedFeaturesOutput,
    policy: getRegenerationPatchPolicy("features")
  }), "geography-render-binding-invalid");
  const staleRenderedFeatures = structuredClone(renderedFeaturesOutput);
  staleRenderedFeatures.preparedRender.binding.renderPreparationId = "geography:features:forged";
  assertProtocol(() => validateFeaturesNetworksResourcesWorkerOutput({
    kind: "features",
    sourceMap: renderedFeaturesSource,
    binding,
    renderBinding,
    output: staleRenderedFeatures,
    policy: getRegenerationPatchPolicy("features")
  }), "geography-render-binding-stale");
  let lakeOutletFixture = null;
  for (const seed of ["river-owner-a", "river-owner-b", "river-owner-c", "worker-session-river-fault-10k"]) {
    const sourceMap = generatePlaceholderMap({seed, cellsTarget: 10000, heightmapTemplate: "continents"});
    const output = await runRegenerationWorkerTask({map: structuredClone(sourceMap), kind: "rivers"}, {binding, checkpoint() {}, report() {}});
    validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap, binding, output, policy: getRegenerationPatchPolicy("rivers")});
    if (seed === "worker-session-river-fault-10k") {
      const transition = findDeclaredLakeOutletTransition(sourceMap, output);
      assert(transition, "固定 river fault seed 未覆盖声明式湖泊出口");
      lakeOutletFixture = {sourceMap, output, transition};
    }
  }
  assert(lakeOutletFixture, "缺少湖泊出口固定夹具");
  const variationSourceMap = generatePlaceholderMap({seed: "lake-contract-141", cellsTarget: 2000, heightmapTemplate: "continents"});
  const variationExpectations = createRiverLakeDrainageExpectations(variationSourceMap.grid, variationSourceMap.pack, {...variationSourceMap.options, riverRegenerationSalt: 1});
  const variationLake = variationSourceMap.pack.features[7];
  const variationExpectation = variationExpectations.lakes.get(7);
  const rawMinimum = [...variationLake.shoreline].sort((left, right) => variationSourceMap.pack.cells.h[left] - variationSourceMap.pack.cells.h[right])[0];
  assert.equal(rawMinimum, 499, "扰动变更最低岸格夹具的原始最低格漂移");
  assert.equal(variationExpectation.outCell, 561, "正式有效高度最低岸格漂移");
  assert.notEqual(rawMinimum, variationExpectation.outCell, "夹具必须覆盖扰动改变最低岸格");
  const variationOutput = await runRegenerationWorkerTask({map: structuredClone(variationSourceMap), kind: "rivers"}, {binding, checkpoint() {}, report() {}});
  validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap: variationSourceMap, binding, output: variationOutput, policy: getRegenerationPatchPolicy("rivers")});
  const variationTransition = findDeclaredLakeOutletTransition(variationSourceMap, variationOutput, 7);
  assert(variationTransition, "扰动变更最低岸格夹具未形成正式湖泊出口河");

  const terminalSourceMap = generatePlaceholderMap({seed: "lake-contract-28", cellsTarget: 2000, heightmapTemplate: "continents"});
  const terminalExpectations = createRiverLakeDrainageExpectations(terminalSourceMap.grid, terminalSourceMap.pack, {...terminalSourceMap.options, riverRegenerationSalt: 1});
  const terminalExpectation = terminalExpectations.lakes.get(6);
  assert.deepEqual({closed: terminalExpectation.closed, overflows: terminalExpectation.overflows, status: terminalExpectation.status, outCell: terminalExpectation.outCell}, {closed: true, overflows: false, status: "incision-limited", outCell: 409}, "闭流但不足以溢流的固定夹具漂移");
  const terminalOutput = await runRegenerationWorkerTask({map: structuredClone(terminalSourceMap), kind: "rivers"}, {binding, checkpoint() {}, report() {}});
  validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap: terminalSourceMap, binding, output: terminalOutput, policy: getRegenerationPatchPolicy("rivers")});
  const forgedTerminalOutlet = forgeLakeOutletTransition(terminalSourceMap, terminalOutput, 6, terminalExpectation.outCell);
  assertProtocol(
    () => validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap: terminalSourceMap, binding, output: forgedTerminalOutlet, policy: getRegenerationPatchPolicy("rivers")}),
    "river-water-tail-invalid"
  );

  const forgedLakeOutlet = structuredClone(lakeOutletFixture.output);
  operationValue(forgedLakeOutlet.patch, "pack.features")[lakeOutletFixture.transition.lakeId].outlet = 0;
  assertProtocol(
    () => validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap: lakeOutletFixture.sourceMap, binding, output: forgedLakeOutlet, policy: getRegenerationPatchPolicy("rivers")}),
    "river-water-tail-invalid"
  );
  for (const [label, mutate] of [
    ["lake-id-missing", lake => { delete lake.i; delete lake.id; }],
    ["lake-id-string", lake => { lake.i = String(lake.i); }],
    ["lake-id-null", lake => { lake.i = null; }],
    ["lake-outlet-null", lake => { lake.outlet = null; }],
    ["lake-outlet-boolean", lake => { lake.outlet = true; }],
    ["lake-spill-string", lake => { lake.overflow.spillCell = String(lake.overflow.spillCell); }],
    ["lake-spill-boolean", lake => { lake.overflow.spillCell = false; }]
  ]) {
    const forged = structuredClone(lakeOutletFixture.output);
    mutate(operationValue(forged.patch, "pack.features")[lakeOutletFixture.transition.lakeId]);
    assertProtocol(
      () => validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap: lakeOutletFixture.sourceMap, binding, output: forged, policy: getRegenerationPatchPolicy("rivers")}),
      "river-water-tail-invalid"
    );
    assert(label);
  }
  const forgedLakeSpill = structuredClone(lakeOutletFixture.output);
  operationValue(forgedLakeSpill.patch, "pack.features")[lakeOutletFixture.transition.lakeId].overflow.spillCell = lakeOutletFixture.transition.previous;
  assertProtocol(
    () => validateFeaturesNetworksResourcesWorkerOutput({kind: "rivers", sourceMap: lakeOutletFixture.sourceMap, binding, output: forgedLakeSpill, policy: getRegenerationPatchPolicy("rivers")}),
    "river-water-tail-invalid"
  );

  const stale = structuredClone(outputs.routes.output);
  stale.binding.mapRevision += 1;
  assertProtocol(() => validate("routes", stale), "geography-worker-binding-stale");

  const partial = structuredClone(outputs.rivers.output);
  partial.patch.writeSet.pop();
  partial.patch.operations.pop();
  assertProtocol(() => validate("rivers", partial), "geography-worker-write-set-incomplete");

  const dataView = structuredClone(outputs.markers.output);
  operation(dataView.patch, "pack.cells.good").value = new DataView(new ArrayBuffer(8));
  assertProtocol(() => validate("markers", dataView), "geography-worker-operation-value-invalid");

  const policyDrift = structuredClone(outputs.features.policy);
  policyDrift.allowedPaths.pop();
  assertProtocol(() => validateFeaturesNetworksResourcesWorkerOutput({kind: "features", sourceMap: outputs.features.sourceMap, binding, output: outputs.features.output, policy: policyDrift}), "geography-worker-policy-drift");

  const featureMirror = structuredClone(outputs.features.output);
  operation(featureMirror.patch, "grid.features").value = structuredClone(operationValue(featureMirror.patch, "grid.features"));
  operationValue(featureMirror.patch, "grid.features")[1].type = "mirror-drift";
  assertProtocol(() => validate("features", featureMirror), "feature-grid-mirror-invalid");

  const featureCell = structuredClone(outputs.features.output);
  operationValue(featureCell.patch, "pack.cells.f")[0] = operationValue(featureCell.patch, "pack.features").length + 1;
  assertProtocol(() => validate("features", featureCell), "feature-pack-cell-reference-invalid");

  const lockedFeatureMap = generatePlaceholderMap({seed: "geography-locked-feature", cellsTarget: 2000, heightmapTemplate: "continents"});
  const lockedFeature = lockedFeatureMap.pack.features.find(feature => feature?.i && !feature.removed);
  lockedFeatureMap.regenerationLocks = {version: 1, entries: [{kind: "feature", id: lockedFeature.i}]};
  const lockedFeatureOutput = await runRegenerationWorkerTask({map: lockedFeatureMap, kind: "features"}, {binding, checkpoint() {}, report() {}});
  validateFeaturesNetworksResourcesWorkerOutput({kind: "features", sourceMap: lockedFeatureMap, binding, output: lockedFeatureOutput, policy: getRegenerationPatchPolicy("features")});
  const lockedCells = structuredClone(lockedFeatureOutput);
  const lockedPackCells = operationValue(lockedCells.patch, "pack.cells.f");
  const foreignCell = lockedPackCells.findIndex(value => Number(value) !== Number(lockedFeature.i));
  assert(foreignCell >= 0, "锁定 Feature 夹具缺少非锁定 pack cell");
  lockedPackCells[foreignCell] = Number(lockedFeature.i);
  assertProtocol(() => validateFeaturesNetworksResourcesWorkerOutput({kind: "features", sourceMap: lockedFeatureMap, binding, output: lockedCells, policy: getRegenerationPatchPolicy("features")}), "feature-lock-cells-invalid");
  const lockedReference = structuredClone(lockedFeatureOutput);
  const referencedBurg = operationValue(lockedReference.patch, "pack.burgs").find(burg => burg && Number(burg.port) === Number(lockedFeature.i));
  assert(referencedBurg, "锁定 Feature 夹具缺少 burg 直接引用");
  referencedBurg.port = 0;
  operationValue(lockedReference.patch, "settlements").cities[referencedBurg.cityId].port = 0;
  assertProtocol(() => validateFeaturesNetworksResourcesWorkerOutput({kind: "features", sourceMap: lockedFeatureMap, binding, output: lockedReference, policy: getRegenerationPatchPolicy("features")}), "feature-lock-references-invalid");

  const featureRouteReference = structuredClone(outputs.features.output);
  const featureRoute = operationValue(featureRouteReference.patch, "settlements").routes.find(route => route && !route.removed);
  const featurePackRoute = operationValue(featureRouteReference.patch, "pack.routes")[featureRoute.id];
  featureRoute.feature = featurePackRoute.feature = operationValue(featureRouteReference.patch, "pack.features").length + 1;
  assertProtocol(() => validate("features", featureRouteReference), "feature-object-reference-invalid");

  const featureMarkerMirror = structuredClone(outputs.features.output);
  operation(featureMarkerMirror.patch, "pack.markers").value = structuredClone(operationValue(featureMarkerMirror.patch, "pack.markers"));
  const featurePackMarker = operationValue(featureMarkerMirror.patch, "pack.markers").find(marker => marker && !marker.removed);
  assert(featurePackMarker, "Feature 夹具缺少 marker 镜像");
  featurePackMarker.name = "镜像漂移";
  assertProtocol(() => validate("features", featureMarkerMirror), "feature-marker-mirror-invalid");

  const featureCityIdentity = structuredClone(outputs.features.output);
  const movedCity = operationValue(featureCityIdentity.patch, "settlements").cities.find(city => city && !city.removed);
  movedCity.cell = (Number(movedCity.cell) + 1) % outputs.features.sourceMap.grid.cells.i.length;
  assertProtocol(() => validate("features", featureCityIdentity), "feature-settlement-identity-drift");

  const featureMarkerCell = structuredClone(outputs.features.output);
  const movedMarker = operationValue(featureMarkerCell.patch, "markers.markers").find(marker => marker && !marker.removed);
  const movedPackMarker = operationValue(featureMarkerCell.patch, "pack.markers").find(marker => marker && String(marker.id ?? marker.i) === String(movedMarker.id ?? movedMarker.i));
  movedMarker.packCell = movedPackMarker.packCell = outputs.features.sourceMap.pack.cells.i.length;
  assertProtocol(() => validate("features", featureMarkerCell), "feature-marker-identity-invalid");

  const routeMirror = structuredClone(outputs.routes.output);
  operationValue(routeMirror.patch, "pack.routes")[0].to += 1;
  assertProtocol(() => validate("routes", routeMirror), "settlement-route-mirror-invalid");

  const routeEndpoint = structuredClone(outputs.routes.output);
  const route = operationValue(routeEndpoint.patch, "settlements").routes[0];
  const packRoute = operationValue(routeEndpoint.patch, "pack.routes")[0];
  route.from = packRoute.from = operationValue(routeEndpoint.patch, "pack.burgs").length + 3;
  assertProtocol(() => validate("routes", routeEndpoint), "route-endpoint-invalid");

  const routeCellLinks = structuredClone(outputs.routes.output);
  operation(routeCellLinks.patch, "pack.cells.routes").value = {};
  assertProtocol(() => validate("routes", routeCellLinks), "route-cell-link-mirror-invalid");

  const riverMirror = structuredClone(outputs.rivers.output);
  operation(riverMirror.patch, "pack.rivers").value = structuredClone(operationValue(riverMirror.patch, "pack.rivers"));
  operationValue(riverMirror.patch, "pack.rivers")[0].name = "镜像漂移";
  assertProtocol(() => validate("rivers", riverMirror), "river-pack-mirror-invalid");

  const riverParent = structuredClone(outputs.rivers.output);
  const river = operationValue(riverParent.patch, "rivers").rivers[0];
  river.parent = operationValue(riverParent.patch, "pack.rivers")[0].parent = 999999;
  assertProtocol(() => validate("rivers", riverParent), "river-parent-invalid");

  const riverTopology = structuredClone(outputs.rivers.output);
  const topologyCells = outputs.rivers.sourceMap.pack.cells;
  const nonAdjacent = findNonAdjacentCells(topologyCells);
  const topologyRiver = operationValue(riverTopology.patch, "rivers").rivers[0];
  const topologyPackRiver = operationValue(riverTopology.patch, "pack.rivers")[0];
  topologyRiver.cells = topologyPackRiver.cells = nonAdjacent;
  assertProtocol(() => validate("rivers", riverTopology), "river-topology-invalid");

  const riverWaterTail = structuredClone(outputs.rivers.output);
  const landWaterLand = findLandWaterLand(outputs.rivers.sourceMap.pack.cells);
  const waterTailRiver = operationValue(riverWaterTail.patch, "rivers").rivers[0];
  const waterTailRiverId = Number(waterTailRiver.i);
  waterTailRiver.cells = landWaterLand;
  operationValue(riverWaterTail.patch, "pack.rivers")[0].cells = [...landWaterLand];
  const waterTailOwners = operationValue(riverWaterTail.patch, "pack.cells.r");
  for (let cell = 0; cell < waterTailOwners.length; cell++) if (Number(waterTailOwners[cell]) === waterTailRiverId) waterTailOwners[cell] = 0;
  waterTailOwners[landWaterLand[0]] = waterTailRiverId;
  assertProtocol(() => validate("rivers", riverWaterTail), "river-water-tail-invalid");

  const riverChildOverlap = structuredClone(outputs.rivers.output);
  const childOverlap = findExtendableChildConfluence(operationValue(riverChildOverlap.patch, "rivers").rivers);
  const childRiver = operationValue(riverChildOverlap.patch, "rivers").rivers.find(river => Number(river.i) === childOverlap.childId);
  const childPackRiver = operationValue(riverChildOverlap.patch, "pack.rivers").find(river => Number(river.i) === childOverlap.childId);
  const extendedChildCells = [...childRiver.cells, childOverlap.nextCell];
  childRiver.cells = extendedChildCells;
  childPackRiver.cells = [...extendedChildCells];
  assertProtocol(() => validate("rivers", riverChildOverlap), "river-cell-mirror-invalid");

  const riverCellReference = structuredClone(outputs.rivers.output);
  operationValue(riverCellReference.patch, "pack.cells.r")[0] = 65535;
  assertProtocol(() => validate("rivers", riverCellReference), "river-cell-reference-invalid");

  const riverCellMirror = structuredClone(outputs.rivers.output);
  const mirrorRiverId = Number(operationValue(riverCellMirror.patch, "rivers").rivers[0].i);
  const riverAssignments = operationValue(riverCellMirror.patch, "pack.cells.r");
  let keptAssignment = false;
  for (let cell = 0; cell < riverAssignments.length; cell++) if (Number(riverAssignments[cell]) === mirrorRiverId) {
    if (!keptAssignment) keptAssignment = true;
    else riverAssignments[cell] = 0;
  }
  assert(keptAssignment, "河流镜像负例缺少 owner assignment");
  assertProtocol(() => validate("rivers", riverCellMirror), "river-cell-mirror-invalid");

  const markerMirror = structuredClone(outputs.markers.output);
  operation(markerMirror.patch, "pack.markers").value = structuredClone(operationValue(markerMirror.patch, "pack.markers"));
  operationValue(markerMirror.patch, "pack.markers")[0].name = "镜像漂移";
  assertProtocol(() => validate("markers", markerMirror), "marker-pack-mirror-invalid");

  const markerCell = structuredClone(outputs.markers.output);
  operationValue(markerCell.patch, "markers").markers[0].packCell = outputs.markers.sourceMap.pack.cells.i.length;
  operationValue(markerCell.patch, "pack.markers")[0].packCell = outputs.markers.sourceMap.pack.cells.i.length;
  assertProtocol(() => validate("markers", markerCell), "marker-identity-invalid");

  const economyMirror = structuredClone(outputs.markers.output);
  operation(economyMirror.patch, "pack.goods").value = structuredClone(operationValue(economyMirror.patch, "pack.goods"));
  operationValue(economyMirror.patch, "pack.goods")[1].name = "镜像漂移";
  assertProtocol(() => validate("markers", economyMirror), "marker-goods-mirror-invalid");

  const markerPatchMap = structuredClone(outputs.markers.sourceMap);
  const markerPatchBefore = markerDomainFingerprint(markerPatchMap);
  const markerPatchHistory = new EditHistory();
  markerPatchHistory.execute(createDomainPatchCommand({patch: outputs.markers.output.patch, policy: outputs.markers.policy, label: "资源点 Worker 提交", historyDomain: "markers", result: outputs.markers.output.result}), {map: markerPatchMap});
  assert.deepEqual(markerPatchMap.politics.states, markerPatchMap.pack.states, "资源点 Worker 提交后国家镜像未闭合");
  assert.deepEqual(markerPatchMap.politics.provinces, markerPatchMap.pack.provinces, "资源点 Worker 提交后省份镜像未闭合");
  const markerPatchAfter = markerDomainFingerprint(markerPatchMap);
  markerPatchHistory.undo({map: markerPatchMap});
  assert.equal(markerDomainFingerprint(markerPatchMap), markerPatchBefore, "资源点 Worker 撤销未恢复分离镜像地图");
  assert.notStrictEqual(markerPatchMap.politics.states, markerPatchMap.pack.states, "资源点 Worker 撤销错误合并国家镜像引用");
  assert.notStrictEqual(markerPatchMap.politics.provinces, markerPatchMap.pack.provinces, "资源点 Worker 撤销错误合并省份镜像引用");
  markerPatchHistory.redo({map: markerPatchMap});
  assert.equal(markerDomainFingerprint(markerPatchMap), markerPatchAfter, "资源点 Worker 重做未恢复双镜像提交结果");

  const directMarkerMap = detachedMarkerPoliticalMirrors(generatePlaceholderMap({seed: "geography-marker-direct-history", cellsTarget: 2000, heightmapTemplate: "continents"}));
  const directMarkerBefore = markerDomainFingerprint(directMarkerMap);
  const directMarkerHistory = new EditHistory();
  directMarkerHistory.execute(createRegenerateResourceMarkersCommand({salt: 7}), {map: directMarkerMap});
  assert.deepEqual(directMarkerMap.politics.states, directMarkerMap.pack.states, "直接资源点命令未闭合国家镜像");
  assert.deepEqual(directMarkerMap.politics.provinces, directMarkerMap.pack.provinces, "直接资源点命令未闭合省份镜像");
  const directMarkerAfter = markerDomainFingerprint(directMarkerMap);
  directMarkerHistory.undo({map: directMarkerMap});
  assert.equal(markerDomainFingerprint(directMarkerMap), directMarkerBefore, "直接资源点命令撤销未恢复分离镜像地图");
  assert.notStrictEqual(directMarkerMap.politics.states, directMarkerMap.pack.states, "直接资源点命令撤销错误合并国家镜像引用");
  assert.notStrictEqual(directMarkerMap.politics.provinces, directMarkerMap.pack.provinces, "直接资源点命令撤销错误合并省份镜像引用");
  directMarkerHistory.redo({map: directMarkerMap});
  assert.equal(markerDomainFingerprint(directMarkerMap), directMarkerAfter, "直接资源点命令重做未恢复双镜像提交结果");

  const chunkedMarkerMap = detachedMarkerPoliticalMirrors(generatePlaceholderMap({seed: "geography-marker-chunked", cellsTarget: 2000, heightmapTemplate: "continents"}));
  const chunkedMarkerResult = await regenerateResourceMarkersInChunks(chunkedMarkerMap, {salt: 8});
  assert.equal(chunkedMarkerResult.executed, true, "分块资源点命令未执行");
  assert.deepEqual(chunkedMarkerMap.politics.states, chunkedMarkerMap.pack.states, "分块资源点命令未闭合国家镜像");
  assert.deepEqual(chunkedMarkerMap.politics.provinces, chunkedMarkerMap.pack.provinces, "分块资源点命令未闭合省份镜像");

  const failingChunkedMarkerMap = detachedMarkerPoliticalMirrors(generatePlaceholderMap({seed: "geography-marker-chunked-failure", cellsTarget: 2000, heightmapTemplate: "continents"}));
  const failingChunkedMarkerBefore = markerDomainFingerprint(failingChunkedMarkerMap);
  await assert.rejects(regenerateResourceMarkersInChunks(failingChunkedMarkerMap, {
    salt: 9,
    yieldToMain: ({id}) => {
      if (id === "build-economy") throw new Error("marker detached rollback fixture");
    }
  }), /marker detached rollback fixture/u);
  assert.equal(markerDomainFingerprint(failingChunkedMarkerMap), failingChunkedMarkerBefore, "分块资源点失败未恢复分离镜像地图");
  assert.notStrictEqual(failingChunkedMarkerMap.politics.states, failingChunkedMarkerMap.pack.states, "分块资源点失败错误合并国家镜像引用");
  assert.notStrictEqual(failingChunkedMarkerMap.politics.provinces, failingChunkedMarkerMap.pack.provinces, "分块资源点失败错误合并省份镜像引用");

  const canonical = generatePlaceholderMap({seed: "geography-commit", cellsTarget: 2000, heightmapTemplate: "continents"});
  const commitOutput = await runRegenerationWorkerTask({map: structuredClone(canonical), kind: "routes"}, {binding, checkpoint() {}, report() {}});
  validateFeaturesNetworksResourcesWorkerOutput({kind: "routes", sourceMap: canonical, binding, output: commitOutput, policy: getRegenerationPatchPolicy("routes")});
  const history = new EditHistory({onMutation: () => owner.advance(), onSnapshot: () => owner.createSnapshot(), onRestore: snapshot => owner.restoreSnapshot(snapshot)});
  history.execute(createDomainPatchCommand({patch: commitOutput.patch, policy: getRegenerationPatchPolicy("routes"), label: "路线 Worker 提交", historyDomain: "routes", result: commitOutput.result}), {map: canonical});
  const committed = structuredClone(canonical);
  history.undo({map: canonical});
  history.redo({map: canonical});
  assert.deepEqual(canonical, committed, "路线 Worker 重做没有恢复提交结果");

  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  assert.match(appSource, /\["features", "routes", "rivers", "markers"\]\.includes\(targetKind\)[\s\S]*?validateFeaturesNetworksResourcesWorkerOutput/u, "正式地理网络 Worker 入口未接统一 pre-commit validator");
  assert.match(appSource, /targetKind === "rivers"[\s\S]*?validateFeaturesNetworksResourcesWorkerOutputAsync/u, "正式 rivers Worker 未接异步 pre-commit validator");
  assert.match(appSource, /validateFeaturesNetworksResourcesWorkerOutputAsync\([\s\S]*?yieldToMain: \(\) => yieldToBrowser\(documentRef\)[\s\S]*?assertCurrent: \(\) => assertWorkerRegenerationOutputCurrent/u, "正式 rivers 异步 validator 未同时接浏览器让出与 current 复核");
  assert.match(appSource, /assertRenderPreparationBinding\(output\.preparedRender, renderRequest\.binding\)/u, "通用 Worker pre-commit 未精确核对完整 render resource binding");
  assert.match(appSource, /await mutation\.assertOutput\(\{state, sourceMap, binding, renderBinding: renderRequest\.binding, output, operation\}\)/u, "领域 validator 未收到独立 render binding");

  console.log(JSON.stringify({ok: true, manifests: Object.keys(manifests), writes: Object.fromEntries(Object.entries(writes).map(([kind, paths]) => [kind, paths.length])), routePathWrites: ROUTE_PATH_WORKER_WRITE_SET.length, riverOwnershipSeeds: 4, asyncRiverValidator: {stages: asyncRiverStages.length, currentChecks: asyncRiverCurrentChecks.length, syncParity: true, cancellation: true, hundredThousand: hundredThousandAsyncRiver}, declaredLakeOutlet: lakeOutletFixture.transition, lakeDrainageContract: {variationTransition, terminal: {lakeId: 6, ...terminalExpectation}}, markerDetachedMirrors: {workerHistory: true, directHistory: true, chunked: true, failureRollback: true}, tombstones: 16, commit: {revision: owner.getCoreSnapshot(), history: history.getStats()}, rejected: ["stale-binding", "partial-write-set", "data-view", "policy-drift", "feature-mirror", "feature-cell", "feature-lock-cells", "feature-lock-reference", "feature-route-reference", "feature-marker-mirror", "feature-city-identity", "feature-marker-cell", "route-mirror", "route-endpoint", "route-cell-links", "river-mirror", "river-parent", "river-topology", "river-water-tail", "river-lake-outlet", "river-lake-spill", "river-lake-terminal", "river-lake-coercions", "river-child-overlap", "river-cell-reference", "river-cell-mirror", "marker-mirror", "marker-cell", "economy-mirror"], browserRuns: 0}, null, 2));

  function validate(kind, output) {
    return validateFeaturesNetworksResourcesWorkerOutput({kind, sourceMap: outputs[kind].sourceMap, binding, output, policy: outputs[kind].policy});
  }
} finally {
  await vite.close();
}

function operationValue(patch, pathValue) { return operation(patch, pathValue).value; }
function operation(patch, pathValue) { const matched = patch.operations.find(item => item.path.join(".") === pathValue); assert(matched, `patch 缺少 ${pathValue}`); return matched; }
function assertProtocol(callback, code) { assert.throws(callback, error => error?.code === code); }
function pointRenderRequest(binding) {
  return {
    binding,
    layers: ["point"],
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 800, height: 600, clientWidth: 800, clientHeight: 600},
    selection: null,
    objectHighlights: [],
    visualTheme: {},
    unitPreferences: {},
    politicalMeshDebugMode: "none",
    visibility: {},
    colorMode: "height",
    viewOptions: {},
    labelOptions: {}
  };
}
function detachedMarkerPoliticalMirrors(map) {
  map.politics.states = structuredClone(map.pack.states);
  map.politics.provinces = structuredClone(map.pack.provinces);
  assert.notStrictEqual(map.politics.states, map.pack.states);
  assert.notStrictEqual(map.politics.provinces, map.pack.provinces);
  return map;
}
function markerDomainFingerprint(map) {
  const serialized = JSON.stringify({
    markers: map.markers,
    packMarkers: map.pack.markers,
    packGoods: map.pack.goods,
    packMarkets: map.pack.markets,
    packDeals: map.pack.deals,
    packBurgs: map.pack.burgs,
    packStates: map.pack.states,
    packProvinces: map.pack.provinces,
    packMetadata: map.pack.metadata,
    packCells: {
      good: [...(map.pack.cells.good || [])],
      goodSupply: [...(map.pack.cells.goodSupply || [])],
      goodSource: [...(map.pack.cells.goodSource || [])],
      market: [...(map.pack.cells.market || [])],
      pop: [...(map.pack.cells.pop || [])],
      s: [...(map.pack.cells.s || [])],
      suitabilityBase: [...(map.pack.cells.suitabilityBase || [])],
      suitabilityOverride: [...(map.pack.cells.suitabilityOverride || [])]
    },
    politics: map.politics,
    economy: map.economy
  });
  return createHash("sha256").update(serialized).digest("hex");
}
function findNonAdjacentCells(cells) {
  const count = cells.i.length;
  for (let left = 0; left < count; left++) for (let right = count - 1; right >= 0; right--) {
    if (left !== right && !cells.c[left]?.includes(right)) return [left, right];
  }
  throw new Error("河流拓扑负例缺少不相邻 cell");
}
function findLandWaterLand(cells) {
  for (let water = 0; water < cells.i.length; water++) {
    if (Number(cells.h[water]) >= 20) continue;
    const land = (cells.c[water] || []).filter(cell => Number(cells.h[cell]) >= 20);
    if (land.length >= 2 && cells.c[land[0]]?.includes(water) && cells.c[water]?.includes(land[1])) return [land[0], water, land[1]];
  }
  throw new Error("河流水域尾缀负例缺少陆水陆邻接夹具");
}
function findDeclaredLakeOutletTransition(sourceMap, output, expectedLakeId = null) {
  const rivers = operationValue(output.patch, "rivers").rivers;
  const features = operationValue(output.patch, "pack.features");
  const cells = sourceMap.pack.cells;
  for (const river of rivers) {
    if (!river || river.removed) continue;
    for (let index = 1; index < river.cells.length; index++) {
      const previous = Number(river.cells[index - 1]);
      const current = Number(river.cells[index]);
      if (previous < 0 || current < 0 || Number(cells.h[previous]) >= 20 || Number(cells.h[current]) < 20) continue;
      const lakeId = Number(cells.f[previous]);
      if (expectedLakeId !== null && lakeId !== expectedLakeId) continue;
      const lake = features[lakeId];
      if (lake?.type === "lake" && Number(lake.outlet) === Number(river.i) && Number(lake.overflow?.spillCell) === current) {
        return {riverId: Number(river.i), lakeId, previous, current};
      }
    }
  }
  return null;
}
function forgeLakeOutletTransition(sourceMap, output, lakeId, outCell) {
  const forged = structuredClone(output);
  const cells = sourceMap.pack.cells;
  const lakeCell = (cells.c[outCell] || []).find(cell => Number(cells.h[cell]) < 20 && Number(cells.f[cell]) === lakeId);
  assert.notEqual(lakeCell, undefined, "闭流湖负例缺少与溢流岸格相邻的湖格");
  const rivers = operationValue(forged.patch, "rivers").rivers;
  const packRivers = operationValue(forged.patch, "pack.rivers");
  const river = rivers.find(Boolean);
  const packRiver = packRivers.find(item => Number(item?.i) === Number(river.i));
  const riverId = Number(river.i);
  river.cells = [outCell, lakeCell, outCell];
  packRiver.cells = [...river.cells];
  const owners = operationValue(forged.patch, "pack.cells.r");
  for (let cell = 0; cell < owners.length; cell++) if (Number(owners[cell]) === riverId) owners[cell] = 0;
  owners[outCell] = riverId;
  const lake = operationValue(forged.patch, "pack.features")[lakeId];
  lake.outlet = riverId;
  return forged;
}
function findExtendableChildConfluence(rivers) {
  const byId = new Map(rivers.filter(Boolean).map(river => [Number(river.i), river]));
  for (const child of byId.values()) {
    const parent = byId.get(Number(child.parent));
    if (!parent || child.cells.length < 2) continue;
    const confluence = Number(child.cells.at(-1));
    const parentIndex = parent.cells.map(Number).indexOf(confluence);
    if (parentIndex >= 0 && parentIndex < parent.cells.length - 1) return {childId: Number(child.i), nextCell: Number(parent.cells[parentIndex + 1])};
  }
  throw new Error("河流 child owner 负例缺少可延长汇流夹具");
}
