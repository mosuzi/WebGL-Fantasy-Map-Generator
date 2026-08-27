#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {validateSocietyPoliticsWorkerOutput} = await vite.ssrLoadModule("/src/domains/society-politics/worker-runtime.ts");
  const {SOCIETY_POLITICS_WRITE_SETS, societyPoliticsManifest} = await vite.ssrLoadModule("/src/domains/society-politics/manifest.ts");
  const {generatePlaceholderMap} = await vite.ssrLoadModule("/src/generator/index.js");
  const {DEFAULT_OPTIONS} = await vite.ssrLoadModule("/src/generator/options.js");
  const {createFoundationWorkerBinding} = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {runRegenerationWorkerTask, getRegenerationPatchPolicy} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const {createDomainPatchCommand} = await vite.ssrLoadModule("/src/runtime/domain-patch.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");
  const {EditHistory} = await vite.ssrLoadModule("/src/runtime/edit-history.js");
  const {createRenderResourceBinding} = await vite.ssrLoadModule("/src/renderer/render-resource-binding.js");

  assert.deepEqual(societyPoliticsManifest.workerTasks[0].resultKinds, ["religions", "states", "provinces"]);
  const owner = new MapRevisionTracker({identityFactory: () => "society-politics-map"});
  owner.replaceMap();
  owner.advance();
  const binding = createFoundationWorkerBinding({
    revision: owner.getCoreSnapshot(),
    generationToken: 3,
    lockFingerprint: "society-politics-locks",
    operation: {id: 17, name: "society-politics-regression"}
  });
  const cases = {};
  const outputs = {};
  for (const kind of ["religions", "states", "provinces"]) {
    const sourceMap = generatePlaceholderMap({seed: `society-politics-${kind}`, cellsTarget: 2000, heightmapTemplate: "continents"});
    if (kind === "provinces") {
      sourceMap.politics.states = structuredClone(sourceMap.politics.states);
      sourceMap.politics.provinces = structuredClone(sourceMap.politics.provinces);
      assert.notEqual(sourceMap.politics.states, sourceMap.pack.states, "省份夹具必须覆盖非同引用国家镜像");
      assert.notEqual(sourceMap.politics.provinces, sourceMap.pack.provinces, "省份夹具必须覆盖非同引用省份镜像");
    }
    const sourceBefore = structuredClone(sourceMap);
    const workerMap = structuredClone(sourceMap);
    const output = await runRegenerationWorkerTask({map: workerMap, kind}, {binding, checkpoint() {}, report() {}});
    const policy = getRegenerationPatchPolicy(kind);
    assert.deepEqual(sourceMap, sourceBefore, `${kind} Worker 执行前后改写了 canonical source`);
    const validated = validateSocietyPoliticsWorkerOutput({kind, sourceMap, binding, output, policy});
    assert.deepEqual(sourceMap, sourceBefore, `${kind} pre-commit validator 改写了 canonical source`);
    assert.deepEqual([...validated.writeSet].sort(), [...SOCIETY_POLITICS_WRITE_SETS[kind]].sort(), `${kind} validator 写集与 Manifest 不一致`);
    assert.equal(validated.binding.sourceRevision.topologyRevision, 1, `${kind} core binding 丢失 topology revision`);
    cases[kind] = {
      writes: validated.writeSet.length,
      states: workerMap.politics.states.filter(Boolean).length,
      provinces: workerMap.politics.provinces.filter(Boolean).length,
      religions: workerMap.society.religions.filter(Boolean).length
    };
    outputs[kind] = {output, policy, sourceMap};
  }
  const renderBinding = createRenderResourceBinding({
    mapIdentity: binding.mapIdentity,
    sourceRevision: binding.mapRevision + 1,
    topologyRevision: binding.topologyRevision + 1
  }, {renderPreparationId: "society-politics:render:1", renderGeneration: 3});
  const renderedStates = structuredClone(outputs.states.output);
  renderedStates.preparedRender = {schemaVersion: 1, binding: renderBinding, layers: {}};
  validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, renderBinding, output: renderedStates, policy: outputs.states.policy});
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, output: renderedStates, policy: outputs.states.policy}), "society-politics-render-binding-invalid");
  const staleRenderedStates = structuredClone(renderedStates);
  staleRenderedStates.preparedRender.binding.renderPreparationId = "society-politics:forged";
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, renderBinding, output: staleRenderedStates, policy: outputs.states.policy}), "society-politics-render-binding-stale");

  const chainMap = generatePlaceholderMap({...DEFAULT_OPTIONS, seed: "states-chain-seed-5", cellsTarget: 2000, heightmapTemplate: "continents"});
  await runRegenerationWorkerTask({map: chainMap, kind: "features"}, {binding, checkpoint() {}, report() {}});
  const chainStatesSource = structuredClone(chainMap);
  const chainStatesOutput = await runRegenerationWorkerTask({map: chainMap, kind: "states"}, {binding, checkpoint() {}, report() {}});
  validateSocietyPoliticsWorkerOutput({
    kind: "states",
    sourceMap: chainStatesSource,
    binding,
    output: chainStatesOutput,
    policy: getRegenerationPatchPolicy("states")
  });
  const chainCities = operationValue(chainStatesOutput.patch, "settlements").cities;
  const chainBurgs = operationValue(chainStatesOutput.patch, "pack.burgs");
  const sourceCitiesByBurg = new Map(chainStatesSource.settlements.cities.filter(Boolean).map(city => [Number(city.burgId), city]));
  const clearedOrphanProvincial = chainCities.find(city => {
    const sourceCity = sourceCitiesByBurg.get(Number(city?.burgId));
    return city && !city.removed && sourceCity?.provincial && Number(sourceCity.province) > 0
      && Number(city.province) === 0 && city.provincial === false;
  });
  assert(clearedOrphanProvincial, "features → states 连续夹具没有覆盖旧省会归入中立省份后的标记清理");
  assert.equal(Number(chainBurgs[clearedOrphanProvincial.burgId]?.province), 0, "中立省份 burg 归属没有同步清零");
  assert.equal(Number(chainBurgs[clearedOrphanProvincial.burgId]?.provincial), 0, "中立省份 burg 仍残留省会标记");

  assertProtocol(() => validateSocietyPoliticsWorkerOutput({
    kind: "religions",
    sourceMap: outputs.religions.sourceMap,
    binding,
    output: {...outputs.religions.output, binding: {...binding, topologyRevision: 2}},
    policy: outputs.religions.policy
  }), "society-politics-worker-binding-stale");

  const partial = structuredClone(outputs.states.output);
  partial.patch.writeSet.pop();
  partial.patch.operations.pop();
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, output: partial, policy: outputs.states.policy}), "society-politics-worker-write-set-incomplete");

  const deleted = structuredClone(outputs.religions.output);
  for (const item of deleted.patch.operations) {
    item.exists = false;
    delete item.value;
  }
  const deletedSourceBefore = JSON.stringify(outputs.religions.sourceMap);
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "religions", sourceMap: outputs.religions.sourceMap, binding, output: deleted, policy: outputs.religions.policy}), "society-politics-worker-operation-value-invalid");
  assert.equal(JSON.stringify(outputs.religions.sourceMap), deletedSourceBefore, "删除型 patch 的 pre-commit 拒绝改写了 canonical source");

  const undefinedValue = structuredClone(outputs.states.output);
  undefinedValue.patch.operations[0].value = undefined;
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, output: undefinedValue, policy: outputs.states.policy}), "society-politics-worker-operation-value-invalid");

  const dataViewValue = structuredClone(outputs.religions.output);
  operation(dataViewValue.patch, "grid.cells.religion").value = new DataView(new ArrayBuffer(8));
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "religions", sourceMap: outputs.religions.sourceMap, binding, output: dataViewValue, policy: outputs.religions.policy}), "society-politics-worker-operation-value-invalid");

  const typedRecordValue = structuredClone(outputs.states.output);
  operation(typedRecordValue.patch, "politics").value = new Uint8Array(8);
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, output: typedRecordValue, policy: outputs.states.policy}), "society-politics-worker-operation-value-invalid");

  const mapRecordValue = structuredClone(outputs.provinces.output);
  operation(mapRecordValue.patch, "settlements").value = new Map([["cities", []]]);
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "provinces", sourceMap: outputs.provinces.sourceMap, binding, output: mapRecordValue, policy: outputs.provinces.policy}), "society-politics-worker-operation-value-invalid");

  const religionMirror = structuredClone(outputs.religions.output);
  const religionMirrorOperation = operation(religionMirror.patch, "pack.religions");
  religionMirrorOperation.value = structuredClone(religionMirrorOperation.value).slice(0, -1);
  assert.doesNotThrow(() => validateSocietyPoliticsWorkerOutput({kind: "religions", sourceMap: outputs.religions.sourceMap, binding, output: religionMirror, policy: outputs.religions.policy}));

  const provinceMirror = structuredClone(outputs.provinces.output);
  const provinceMirrorOperation = operation(provinceMirror.patch, "pack.provinces");
  provinceMirrorOperation.value = structuredClone(provinceMirrorOperation.value);
  provinceMirrorOperation.value[1].name = "镜像漂移";
  assert.doesNotThrow(() => validateSocietyPoliticsWorkerOutput({kind: "provinces", sourceMap: outputs.provinces.sourceMap, binding, output: provinceMirror, policy: outputs.provinces.policy}));

  const capitalMirror = structuredClone(outputs.states.output);
  const politics = operationValue(capitalMirror.patch, "politics");
  const activeState = politics.states.find(state => state?.i && !state.removed && Number(state.capital) > 0);
  assert(activeState, "states Worker 结果缺少首都引用样本");
  activeState.capital = 999999;
  operationValue(capitalMirror.patch, "pack.states")[activeState.i].capital = activeState.capital;
  assert.doesNotThrow(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, output: capitalMirror, policy: outputs.states.policy}));

  const clearedCapital = structuredClone(outputs.states.output);
  const clearedPolitics = operationValue(clearedCapital.patch, "politics");
  const clearedState = clearedPolitics.states.find(state => state?.i && !state.removed && Number(state.capital) > 0);
  assert(clearedState, "states Worker 结果缺少首都清零反例");
  clearedState.capital = 0;
  operationValue(clearedCapital.patch, "pack.states")[clearedState.i].capital = 0;
  assert.doesNotThrow(() => validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: outputs.states.sourceMap, binding, output: clearedCapital, policy: outputs.states.policy}));

  const lockedZeroSource = structuredClone(outputs.provinces.sourceMap);
  const lockedZeroOutput = structuredClone(outputs.provinces.output);
  const lockedZeroPolitics = operationValue(lockedZeroOutput.patch, "politics");
  const lockedZeroProvince = lockedZeroPolitics.provinces.find(province => {
    if (!province?.i || province.removed || Number(province.burg || 0) <= 0) return false;
    const state = lockedZeroPolitics.states[province.state];
    return Number(state?.capital || 0) !== Number(province.burg) && lockedZeroSource.politics.provinces[province.i];
  });
  assert(lockedZeroProvince, "provinces Worker 结果缺少锁国零省会正例");
  const lockedZeroProvinceId = Number(lockedZeroProvince.i);
  const lockedZeroStateId = Number(lockedZeroProvince.state);
  lockedZeroSource.politics.provinces[lockedZeroProvinceId].burg = 0;
  lockedZeroSource.pack.provinces[lockedZeroProvinceId].burg = 0;
  lockedZeroSource.regenerationLocks = {version: 1, entries: [{kind: "state", id: lockedZeroStateId}]};
  lockedZeroProvince.burg = 0;
  operationValue(lockedZeroOutput.patch, "pack.provinces")[lockedZeroProvinceId].burg = 0;
  for (const city of operationValue(lockedZeroOutput.patch, "settlements").cities) {
    if (!city || city.removed || Number(city.province) !== lockedZeroProvinceId) continue;
    city.provincial = false;
    const burg = operationValue(lockedZeroOutput.patch, "pack.burgs")[city.burgId];
    if (burg) burg.provincial = 0;
  }
  assert.doesNotThrow(() => validateSocietyPoliticsWorkerOutput({kind: "provinces", sourceMap: lockedZeroSource, binding, output: lockedZeroOutput, policy: outputs.provinces.policy}));

  const policyDrift = structuredClone(outputs.provinces.policy);
  policyDrift.allowedPaths.pop();
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "provinces", sourceMap: outputs.provinces.sourceMap, binding, output: outputs.provinces.output, policy: policyDrift}), "society-politics-worker-policy-drift");

  const canonical = generatePlaceholderMap({seed: "society-politics-commit", cellsTarget: 2000, heightmapTemplate: "continents"});
  const commitOutput = await runRegenerationWorkerTask({map: structuredClone(canonical), kind: "states"}, {binding, checkpoint() {}, report() {}});
  validateSocietyPoliticsWorkerOutput({kind: "states", sourceMap: canonical, binding, output: commitOutput, policy: getRegenerationPatchPolicy("states")});
  const history = new EditHistory({onMutation: () => owner.advance(), onSnapshot: () => owner.createSnapshot(), onRestore: snapshot => owner.restoreSnapshot(snapshot)});
  const command = createDomainPatchCommand({
    patch: commitOutput.patch,
    policy: getRegenerationPatchPolicy("states"),
    label: "社会行政 Worker 提交",
    historyDomain: "society-politics",
    result: commitOutput.result
  });
  history.execute(command, {map: canonical});
  assert.equal(history.getStats().undo, 1, "社会行政 Worker 成功提交没有形成单条历史");
  assert.equal(owner.getCoreSnapshot().mapRevision, 2, "社会行政 Worker 成功提交没有推进 revision");
  assert.deepEqual(canonical.politics.states, canonical.pack.states, "提交后 state mirror 不一致");
  assert.deepEqual(canonical.politics.provinces, canonical.pack.provinces, "提交后 province mirror 不一致");
  const committed = structuredClone(canonical);
  history.undo({map: canonical});
  assert.equal(history.getStats().redo, 1, "社会行政 Worker 撤销没有进入 redo");
  history.redo({map: canonical});
  assert.deepEqual(canonical, committed, "社会行政 Worker 重做没有恢复提交结果");

  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  assert.match(appSource, /\["religions", "states", "provinces"\]\.includes\(targetKind\)[\s\S]*?validateSocietyPoliticsWorkerOutput/u, "正式社会行政 Worker 入口未接统一 pre-commit validator");
  assert.match(appSource, /repairInconsistentProvincialCapitals: true/u, "主动世界重生成未声明旧省会镜像修复策略");

  console.log(JSON.stringify({
    ok: true,
    manifest: societyPoliticsManifest.id,
    cases,
    commit: {revision: owner.getCoreSnapshot(), history: history.getStats()},
    chain: {kind: "features->states", clearedOrphanProvincial: clearedOrphanProvincial.burgId},
    acceptedSoftRelations: ["religion-mirror", "province-mirror", "capital-reference", "capital-clear"],
    rejected: ["stale-binding", "partial-write-set", "delete-write", "undefined-write", "data-view", "typed-record", "map-record", "policy-drift"],
    lockedZeroProvince: {state: lockedZeroStateId, province: lockedZeroProvinceId},
    browserRuns: 0
  }, null, 2));
} finally {
  await vite.close();
}

function operationValue(patch, pathValue) {
  return operation(patch, pathValue).value;
}

function operation(patch, pathValue) {
  const matchedOperation = patch.operations.find(item => item.path.join(".") === pathValue);
  assert(matchedOperation, `patch 缺少 ${pathValue}`);
  return matchedOperation;
}

function assertProtocol(callback, code) {
  assert.throws(callback, error => error?.code === code);
}
