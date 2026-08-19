#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {validateFeaturesNetworksResourcesWorkerOutput} = await vite.ssrLoadModule("/src/domains/features/worker-runtime.ts");
  const {FEATURES_WORKER_WRITE_SET, featuresManifest} = await vite.ssrLoadModule("/src/domains/features/manifest.ts");
  const {ROUTES_WORKER_WRITE_SET, ROUTE_PATH_WORKER_WRITE_SET, routesManifest} = await vite.ssrLoadModule("/src/domains/routes/manifest.ts");
  const {RIVERS_WORKER_WRITE_SET, riversManifest} = await vite.ssrLoadModule("/src/domains/rivers/manifest.ts");
  const {MARKERS_WORKER_WRITE_SET, markersManifest} = await vite.ssrLoadModule("/src/domains/markers/manifest.ts");
  const {generatePlaceholderMap} = await vite.ssrLoadModule("/src/generator/index.js");
  const {createFoundationWorkerBinding} = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {runRegenerationWorkerTask, getRegenerationPatchPolicy} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const {createDomainPatchCommand} = await vite.ssrLoadModule("/src/runtime/domain-patch.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");
  const {EditHistory} = await vite.ssrLoadModule("/src/runtime/edit-history.js");

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
    const output = await runRegenerationWorkerTask({map: sourceMap, kind}, {binding, checkpoint() {}, report() {}});
    const policy = getRegenerationPatchPolicy(kind);
    const validated = validateFeaturesNetworksResourcesWorkerOutput({kind, sourceMap, binding, output, policy});
    const expected = kind === "markers" ? writes[kind].filter(pathValue => !["markers.metadata.stale", "economy.metadata.stale"].includes(pathValue)) : writes[kind];
    assert.deepEqual([...validated.writeSet].sort(), [...expected].sort(), `${kind} 实际 patch 写集不符合领域契约`);
    outputs[kind] = {sourceMap, output, policy};
  }

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

  const riverCellReference = structuredClone(outputs.rivers.output);
  operationValue(riverCellReference.patch, "pack.cells.r")[0] = 65535;
  assertProtocol(() => validate("rivers", riverCellReference), "river-cell-reference-invalid");

  const riverCellMirror = structuredClone(outputs.rivers.output);
  const mirrorRiverId = Number(operationValue(riverCellMirror.patch, "rivers").rivers[0].i);
  const riverAssignments = operationValue(riverCellMirror.patch, "pack.cells.r");
  for (let cell = 0; cell < riverAssignments.length; cell++) if (Number(riverAssignments[cell]) === mirrorRiverId) riverAssignments[cell] = 0;
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

  console.log(JSON.stringify({ok: true, manifests: Object.keys(manifests), writes: Object.fromEntries(Object.entries(writes).map(([kind, paths]) => [kind, paths.length])), routePathWrites: ROUTE_PATH_WORKER_WRITE_SET.length, tombstones: 16, commit: {revision: owner.getCoreSnapshot(), history: history.getStats()}, rejected: ["stale-binding", "partial-write-set", "data-view", "policy-drift", "feature-mirror", "feature-cell", "feature-lock-cells", "feature-lock-reference", "feature-route-reference", "feature-marker-mirror", "route-mirror", "route-endpoint", "route-cell-links", "river-mirror", "river-parent", "river-topology", "river-cell-reference", "river-cell-mirror", "marker-mirror", "marker-cell", "economy-mirror"], browserRuns: 0}, null, 2));

  function validate(kind, output) {
    return validateFeaturesNetworksResourcesWorkerOutput({kind, sourceMap: outputs[kind].sourceMap, binding, output, policy: outputs[kind].policy});
  }
} finally {
  await vite.close();
}

function operationValue(patch, pathValue) { return operation(patch, pathValue).value; }
function operation(patch, pathValue) { const matched = patch.operations.find(item => item.path.join(".") === pathValue); assert(matched, `patch 缺少 ${pathValue}`); return matched; }
function assertProtocol(callback, code) { assert.throws(callback, error => error?.code === code); }
function findNonAdjacentCells(cells) {
  const count = cells.i.length;
  for (let left = 0; left < count; left++) for (let right = count - 1; right >= 0; right--) {
    if (left !== right && !cells.c[left]?.includes(right)) return [left, right];
  }
  throw new Error("河流拓扑负例缺少不相邻 cell");
}
