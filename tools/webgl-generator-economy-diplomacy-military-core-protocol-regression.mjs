#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {validateEconomyDiplomacyMilitaryWorkerOutput} = await vite.ssrLoadModule("/src/domains/economy/worker-runtime.ts");
  const {ECONOMY_WORKER_WRITE_SET, economyManifest} = await vite.ssrLoadModule("/src/domains/economy/manifest.ts");
  const {DIPLOMACY_WORKER_WRITE_SET, diplomacyManifest} = await vite.ssrLoadModule("/src/domains/diplomacy/manifest.ts");
  const {MILITARY_POLICY_WORKER_WRITE_SET, MILITARY_REGENERATION_WORKER_WRITE_SET, militaryManifest} = await vite.ssrLoadModule("/src/domains/military/manifest.ts");
  const {createFoundationWorkerBinding} = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {generatePlaceholderMap} = await vite.ssrLoadModule("/src/generator/index.js");
  const {normalizeUnitRatios} = await vite.ssrLoadModule("/src/generator/military.js");
  const {runRegenerationWorkerTask, getRegenerationPatchPolicy} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const {runEconomyWorkerTask, getEconomyWorkerPatchPolicy} = await vite.ssrLoadModule("/src/runtime/economy-worker-task.js");
  const {runMilitaryPolicyWorkerTask, getMilitaryPolicyWorkerPatchPolicy} = await vite.ssrLoadModule("/src/runtime/military-policy-worker-task.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");
  const {createRenderResourceBinding} = await vite.ssrLoadModule("/src/renderer/render-resource-binding.js");

  assert.deepEqual(economyManifest.workerTasks[0].writeSet, ECONOMY_WORKER_WRITE_SET);
  assert.deepEqual(diplomacyManifest.workerTasks[0].writeSet, DIPLOMACY_WORKER_WRITE_SET);
  assert.deepEqual(militaryManifest.workerTasks[0].writeSet, MILITARY_REGENERATION_WORKER_WRITE_SET);
  assert.deepEqual(militaryManifest.workerTasks[1].writeSet, MILITARY_POLICY_WORKER_WRITE_SET);
  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  const economyWorkerEntry = appSource.slice(appSource.indexOf("async function applyEconomyMutationViaWorker"), appSource.indexOf("function attachEconomyWorkerHistory"));
  assert.match(economyWorkerEntry, /assertOutput: \(\{state: currentState, sourceMap, binding, renderBinding, output\}\) =>/, "经济正式 pre-commit 回调必须分别接收 compute 与 render binding");
  assert.match(appSource, /\["diplomacy", "military"\]\.includes\(targetKind\)[\s\S]*?validateEconomyDiplomacyMilitaryWorkerOutput/u, "外交 / 军事重生成未接统一 pre-commit validator");
  assert.match(appSource, /kind: "economy"[\s\S]*?getEconomyWorkerPatchPolicy/u, "经济 Worker 未接统一 pre-commit validator");
  assert.match(appSource, /kind: "military-policy"[\s\S]*?getMilitaryPolicyWorkerPatchPolicy/u, "军事策略 Worker 未接统一 pre-commit validator");

  const owner = new MapRevisionTracker({identityFactory: () => "world-systems-map"});
  owner.replaceMap(); owner.advance();
  const binding = createFoundationWorkerBinding({revision: owner.getCoreSnapshot(), generationToken: 12, lockFingerprint: "world-systems-locks", operation: {id: 51, name: "world-systems-regression"}});
  const renderBinding = createRenderResourceBinding({
    mapIdentity: binding.mapIdentity,
    sourceRevision: binding.mapRevision + 1,
    topologyRevision: binding.topologyRevision + 1
  }, {renderPreparationId: "world-systems:render:1", renderGeneration: 2});
  const outputs = {};

  for (const kind of ["diplomacy", "military"]) {
    const sourceMap = generatePlaceholderMap({seed: `world-systems-${kind}`, cellsTarget: 10000, heightmapTemplate: "continents"});
    if (kind === "military") {
      sourceMap.military.events = [{id: "protocol:event:1", stateId: 1, regimentId: 0, kind: "battle"}];
      sourceMap.military.metadata.events = 1;
      sourceMap.military.metadata.eventSequence = 9;
      sourceMap.pack.military = sourceMap.military;
    }
    const workerMap = structuredClone(sourceMap);
    const render = kind === "diplomacy" ? renderRequest(renderBinding) : null;
    const output = await runRegenerationWorkerTask({map: workerMap, kind, ...(render ? {render} : {})}, context(binding));
    const policy = getRegenerationPatchPolicy(kind);
    const validated = validateEconomyDiplomacyMilitaryWorkerOutput({kind, sourceMap, binding, ...(render ? {renderBinding} : {}), output, policy});
    assert.deepEqual([...validated.writeSet].sort(), [...output.patch.writeSet].sort());
    if (kind === "diplomacy") assert.equal(Object.hasOwn(operation(output.patch, "military").value.metadata, "stale"), false, "fresh 外交结果不应把缺失 stale 规范化为 false");
    if (kind === "military") {
      const militaryResult = operation(output.patch, "military").value;
      assert.equal(militaryResult.events[0].archiveReason, "military-regeneration");
      assert.equal(militaryResult.metadata.eventSequence, 9);
    }
    outputs[kind] = {sourceMap, output, policy, ...(render ? {renderBinding} : {})};
  }

  const staleMilitaryChainMap = generatePlaceholderMap({seed: "worker-regeneration-browser-chain", cellsTarget: 10000, heightmapTemplate: "continents"});
  for (const kind of ["features", "states", "provinces", "cities", "routes", "rivers", "markers"]) {
    await runRegenerationWorkerTask({map: staleMilitaryChainMap, kind}, context(binding));
  }
  const staleMilitaryStates = staleMilitaryChainMap.pack.states.filter(item => item?.i && !item.removed);
  assert.ok(staleMilitaryStates.length >= 2, "外交 stale 军事链缺少活动国家");
  assert.ok(staleMilitaryStates.every(state => !Array.isArray(state.military)), "外交 stale 军事链没有形成国家重生成后的缺失军团数组");
  assert.equal(staleMilitaryChainMap.military.metadata.stale, true, "外交 stale 军事链没有保持军事待派生状态");
  const staleMilitarySource = structuredClone(staleMilitaryChainMap);
  const staleMilitaryOutput = await runRegenerationWorkerTask({map: staleMilitaryChainMap, kind: "diplomacy"}, context(binding));
  const staleMilitaryPolicy = getRegenerationPatchPolicy("diplomacy");
  validateEconomyDiplomacyMilitaryWorkerOutput({kind: "diplomacy", sourceMap: staleMilitarySource, binding, output: staleMilitaryOutput, policy: staleMilitaryPolicy});
  assert.equal(operation(staleMilitaryOutput.patch, "military").value.metadata.stale, true, "外交重生成错误刷新了 stale 军事数据");

  const staleMilitaryStateDrift = structuredClone(staleMilitaryOutput);
  const staleStateId = staleMilitaryStates[0].i;
  operation(staleMilitaryStateDrift.patch, "pack.states").value[staleStateId].military = [];
  operation(staleMilitaryStateDrift.patch, "politics.states").value[staleStateId].military = [];
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "diplomacy", sourceMap: staleMilitarySource, binding, output: staleMilitaryStateDrift, policy: staleMilitaryPolicy}), "diplomacy-military-state-scope-invalid");

  const staleMilitaryMetadataDrift = structuredClone(staleMilitaryOutput);
  operation(staleMilitaryMetadataDrift.patch, "military").value.metadata.troops += 1;
  operation(staleMilitaryMetadataDrift.patch, "pack.military").value.metadata.troops += 1;
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "diplomacy", sourceMap: staleMilitarySource, binding, output: staleMilitaryMetadataDrift, policy: staleMilitaryPolicy}), "diplomacy-military-metadata-scope-invalid");

  const staleMilitaryFreshDrift = structuredClone(staleMilitaryOutput);
  operation(staleMilitaryFreshDrift.patch, "military").value.metadata.stale = false;
  operation(staleMilitaryFreshDrift.patch, "pack.military").value.metadata.stale = false;
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "diplomacy", sourceMap: staleMilitarySource, binding, output: staleMilitaryFreshDrift, policy: staleMilitaryPolicy}), "diplomacy-military-stale-scope-invalid");

  const undefinedStaleDrift = structuredClone(outputs.diplomacy.output);
  operation(undefinedStaleDrift.patch, "military").value.metadata.stale = 0;
  operation(undefinedStaleDrift.patch, "pack.military").value.metadata.stale = 0;
  assertProtocol(() => validate("diplomacy", undefinedStaleDrift), "diplomacy-military-stale-scope-invalid");

  const falseStaleSource = structuredClone(outputs.diplomacy.sourceMap);
  falseStaleSource.military.metadata.stale = false;
  falseStaleSource.pack.military.metadata.stale = false;
  const falseStaleDrift = structuredClone(outputs.diplomacy.output);
  operation(falseStaleDrift.patch, "military").value.metadata.stale = null;
  operation(falseStaleDrift.patch, "pack.military").value.metadata.stale = null;
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "diplomacy", sourceMap: falseStaleSource, binding, renderBinding, output: falseStaleDrift, policy: outputs.diplomacy.policy}), "diplomacy-military-stale-scope-invalid");

  const trueStaleValidSource = structuredClone(outputs.diplomacy.sourceMap);
  trueStaleValidSource.military.metadata.stale = true;
  trueStaleValidSource.pack.military.metadata.stale = true;
  const trueStaleTypeDrift = structuredClone(outputs.diplomacy.output);
  operation(trueStaleTypeDrift.patch, "military").value.metadata.stale = 1;
  operation(trueStaleTypeDrift.patch, "pack.military").value.metadata.stale = 1;
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "diplomacy", sourceMap: trueStaleValidSource, binding, renderBinding, output: trueStaleTypeDrift, policy: outputs.diplomacy.policy}), "diplomacy-military-stale-scope-invalid");

  const economySource = generatePlaceholderMap({seed: "world-systems-economy", cellsTarget: 10000, heightmapTemplate: "continents"});
  const economyMap = structuredClone(economySource);
  const economyOutput = await runEconomyWorkerTask({map: economyMap, request: {kind: "rebuild", confirm: true}, binding}, context(binding));
  const economyPolicy = getEconomyWorkerPatchPolicy(economySource, economyOutput.patch);
  const economySourceBeforeValidation = structuredClone(economySource);
  const economyValidationStartedAt = performance.now();
  validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: economySource, binding, output: economyOutput, policy: economyPolicy});
  const economyValidationMs = Math.round((performance.now() - economyValidationStartedAt) * 10) / 10;
  assert.deepEqual(economySource, economySourceBeforeValidation, "经济 pre-commit validator 不得改写 sourceMap");
  outputs.economy = {sourceMap: economySource, output: economyOutput, policy: economyPolicy};

  const policySource = generatePlaceholderMap({seed: "world-systems-military-policy", cellsTarget: 10000, heightmapTemplate: "continents"});
  policySource.politics.states = structuredClone(policySource.pack.states);
  const state = policySource.pack.states.find(item => item?.i && !item.removed && item.military?.length);
  assert.ok(state, "军事策略协议缺少活动军团样本");
  const preservedPolicyEvent = {id: "military-policy:preserved-event", kind: "battle", stateId: state.i, sequence: 7};
  policySource.military.events = [structuredClone(preservedPolicyEvent)];
  policySource.military.metadata.events = 1;
  policySource.military.metadata.eventSequence = 7;
  policySource.military.metadata.eventArchiveGeneration = 3;
  policySource.military.metadata.stale = false;
  policySource.pack.military = policySource.military;
  const ratios = normalizeUnitRatios(state.militaryPolicy?.unitRatios || {});
  const request = {stateId: state.i, ratios: normalizeUnitRatios({...ratios, infantry: ratios.infantry + 0.7, cavalry: ratios.cavalry * 0.35}), confirm: true};
  const policyMap = structuredClone(policySource);
  const policyOutput = await runMilitaryPolicyWorkerTask({map: policyMap, request, binding}, context(binding));
  assert.deepEqual(policyMap.military.events, policySource.military.events, "军事策略 Worker 改写了既有战报 archive");
  for (const field of ["events", "eventSequence", "eventArchiveGeneration"]) {
    assert.equal(policyMap.military.metadata[field], policySource.military.metadata[field], `军事策略 Worker 改写了战报元数据 ${field}`);
  }
  assert.equal(Object.hasOwn(policyMap.military.metadata, "stale"), true, "军事策略 Worker 丢失了 stale 键形状");
  assert.equal(policyMap.military.metadata.stale, policySource.military.metadata.stale, "军事策略 Worker 改写了 stale 值");
  const militaryPolicy = getMilitaryPolicyWorkerPatchPolicy(policySource, policyOutput.patch, request.stateId);
  validateEconomyDiplomacyMilitaryWorkerOutput({kind: "military-policy", sourceMap: policySource, binding, output: policyOutput, policy: militaryPolicy, expectation: {stateId: request.stateId}});
  outputs["military-policy"] = {sourceMap: policySource, output: policyOutput, policy: militaryPolicy, expectation: {stateId: request.stateId}};

  const stale = structuredClone(outputs.diplomacy.output);
  stale.binding.mapRevision += 1;
  assertProtocol(() => validate("diplomacy", stale), "world-systems-worker-binding-stale");

  const staleRender = structuredClone(outputs.diplomacy.output);
  staleRender.preparedRender.binding.topologyRevision += 1;
  assertProtocol(() => validate("diplomacy", staleRender), "world-systems-render-binding-stale");

  const incompleteRender = structuredClone(outputs.diplomacy.output);
  delete incompleteRender.preparedRender.binding.topologyRevision;
  assertProtocol(() => validate("diplomacy", incompleteRender), "world-systems-render-binding-invalid");

  const missingRenderBinding = structuredClone(outputs.diplomacy.output);
  delete missingRenderBinding.preparedRender.binding;
  assertProtocol(() => validate("diplomacy", missingRenderBinding), "world-systems-render-binding-invalid");

  const nullRenderRevision = structuredClone(outputs.diplomacy.output);
  nullRenderRevision.preparedRender.binding.topologyRevision = null;
  assertProtocol(() => validate("diplomacy", nullRenderRevision), "world-systems-render-binding-invalid");

  const stringRenderRevision = structuredClone(outputs.diplomacy.output);
  stringRenderRevision.preparedRender.binding.mapRevision = String(binding.mapRevision);
  assertProtocol(() => validate("diplomacy", stringRenderRevision), "world-systems-render-binding-invalid");

  const partial = structuredClone(outputs.military.output);
  partial.patch.writeSet.pop(); partial.patch.operations.pop();
  assertProtocol(() => validate("military", partial), "world-systems-worker-write-set-incomplete");

  const requiredDelete = structuredClone(outputs.diplomacy.output);
  const generationLog = operation(requiredDelete.patch, "generationLog");
  generationLog.exists = false;
  delete generationLog.value;
  assertProtocol(() => validate("diplomacy", requiredDelete), "world-systems-worker-operation-value-invalid");

  const generationLogShape = structuredClone(outputs.diplomacy.output);
  operation(generationLogShape.patch, "generationLog").value = "not-an-array";
  assertProtocol(() => validate("diplomacy", generationLogShape), "world-systems-worker-array-invalid");

  const generationLogPrefix = structuredClone(outputs.diplomacy.output);
  const generationLogPrefixValue = operation(generationLogPrefix.patch, "generationLog").value;
  generationLogPrefixValue[0] = `${generationLogPrefixValue[0]}-changed`;
  assertProtocol(() => validate("diplomacy", generationLogPrefix), "world-systems-worker-generation-log-invalid");

  const generationCounter = structuredClone(outputs.military.output);
  operation(generationCounter.patch, "metadata.regeneration.military").value = "2";
  assertProtocol(() => validate("military", generationCounter), "world-systems-worker-generation-counter-invalid");

  const escape = structuredClone(outputs.economy.output);
  escape.patch.writeSet.push("pack.cells.h");
  escape.patch.operations.push({path: ["pack", "cells", "h"], exists: true, value: new Uint8Array(1)});
  const escapePolicy = structuredClone(outputs.economy.policy);
  escapePolicy.allowedPaths.push("pack.cells.h");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: outputs.economy.sourceMap, binding, output: escape, policy: escapePolicy}), "world-systems-worker-write-set-incomplete");

  const dataView = structuredClone(outputs.economy.output);
  const dataViewOperation = dataView.patch.operations[0];
  dataViewOperation.value = new DataView(new ArrayBuffer(8));
  assertProtocol(() => validate("economy", dataView), "world-systems-worker-operation-value-invalid");

  const economyMirror = structuredClone(outputs.economy.output);
  const marketOperation = economyMirror.patch.operations.find(row => row.path.join(".").startsWith("pack.markets."));
  assert.ok(marketOperation, "经济协议负例缺少市场 patch");
  marketOperation.value = typeof marketOperation.value === "number" ? marketOperation.value + 1 : "mirror-drift";
  const splitEconomySource = structuredClone(outputs.economy.sourceMap);
  splitEconomySource.economy.markets = structuredClone(splitEconomySource.economy.markets);
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: splitEconomySource, binding, output: economyMirror, policy: outputs.economy.policy}), "economy-market-mirror-invalid");

  const economyIdentity = structuredClone(outputs.economy.output);
  const sourceMarket = structuredClone(outputs.economy.sourceMap.pack.markets[1]);
  assert.ok(sourceMarket, "经济协议身份负例缺少市场 #1");
  sourceMarket.i = sourceMarket.id = 999999;
  for (const root of ["pack.markets", "economy.markets"]) {
    const pathValue = `${root}.1`;
    economyIdentity.patch.writeSet.push(pathValue);
    economyIdentity.patch.operations.push({path: pathValue.split("."), exists: true, value: structuredClone(sourceMarket)});
  }
  const economyIdentityPolicy = structuredClone(outputs.economy.policy);
  economyIdentityPolicy.allowedPaths.push("pack.markets.1", "economy.markets.1");
  assert.throws(() => getEconomyWorkerPatchPolicy(outputs.economy.sourceMap, economyIdentity.patch), error => error?.code === "economy-worker-policy-path-invalid");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: outputs.economy.sourceMap, binding, output: economyIdentity, policy: economyIdentityPolicy}), "world-systems-worker-operation-value-invalid");

  const economyReference = structuredClone(outputs.economy.output);
  const invalidMarketReference = structuredClone(outputs.economy.sourceMap.pack.markets[1]);
  invalidMarketReference.centerBurgId = 999999;
  for (const root of ["pack.markets", "economy.markets"]) {
    const pathValue = `${root}.1`;
    economyReference.patch.writeSet.push(pathValue);
    economyReference.patch.operations.push({path: pathValue.split("."), exists: true, value: structuredClone(invalidMarketReference)});
  }
  const economyReferencePolicy = structuredClone(outputs.economy.policy);
  economyReferencePolicy.allowedPaths.push("pack.markets.1", "economy.markets.1");
  assert.throws(() => getEconomyWorkerPatchPolicy(outputs.economy.sourceMap, economyReference.patch), error => error?.code === "economy-worker-policy-path-invalid");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: outputs.economy.sourceMap, binding, output: economyReference, policy: economyReferencePolicy}), "world-systems-worker-operation-value-invalid");

  const economyUnknownField = structuredClone(outputs.economy.output);
  for (const root of ["pack.markets", "economy.markets"]) {
    const pathValue = `${root}.1.protocolDrift`;
    economyUnknownField.patch.writeSet.push(pathValue);
    economyUnknownField.patch.operations.push({path: pathValue.split("."), exists: true, value: true});
  }
  const economyUnknownPolicy = structuredClone(outputs.economy.policy);
  economyUnknownPolicy.allowedPaths.push("pack.markets.1.protocolDrift", "economy.markets.1.protocolDrift");
  assert.throws(() => getEconomyWorkerPatchPolicy(outputs.economy.sourceMap, economyUnknownField.patch), error => error?.code === "economy-worker-policy-path-invalid");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: outputs.economy.sourceMap, binding, output: economyUnknownField, policy: economyUnknownPolicy}), "world-systems-worker-operation-value-invalid");

  const economyDealField = structuredClone(outputs.economy.output);
  const packDeals = operation(economyDealField.patch, "pack.deals").value;
  const economyDeals = operation(economyDealField.patch, "economy.deals").value;
  const dealId = packDeals.findIndex(Boolean);
  assert.ok(dealId >= 0, "经济交易字段负例缺少交易");
  packDeals[dealId].protocolDrift = economyDeals[dealId].protocolDrift = true;
  assertProtocol(() => validate("economy", economyDealField), "economy-deal-field-invalid");

  const economyMetadataField = structuredClone(outputs.economy.output);
  operation(economyMetadataField.patch, "economy.metadata").value.protocolDrift = true;
  assertProtocol(() => validate("economy", economyMetadataField), "economy-metadata-field-invalid");

  const economyCollection = structuredClone(outputs.economy.output);
  const economyCollectionPath = "pack.markets";
  economyCollection.patch.writeSet.push(economyCollectionPath);
  economyCollection.patch.operations.push({path: economyCollectionPath.split("."), exists: true, value: structuredClone(outputs.economy.sourceMap.pack.markets)});
  const economyCollectionPolicy = structuredClone(outputs.economy.policy);
  economyCollectionPolicy.allowedPaths.push(economyCollectionPath);
  assert.throws(() => getEconomyWorkerPatchPolicy(outputs.economy.sourceMap, economyCollection.patch), error => error?.code === "economy-worker-policy-path-invalid");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: outputs.economy.sourceMap, binding, output: economyCollection, policy: economyCollectionPolicy}), "world-systems-worker-operation-value-invalid");

  const economyBurgObject = structuredClone(outputs.economy.output);
  const burgId = outputs.economy.sourceMap.pack.burgs.find(item => item?.i && !item.removed)?.i;
  assert.ok(burgId, "经济整对象负例缺少城市");
  const burgObjectPath = `pack.burgs.${burgId}`;
  const burgObject = structuredClone(outputs.economy.sourceMap.pack.burgs[burgId]);
  burgObject.name = "request-scope-drift";
  economyBurgObject.patch.writeSet.push(burgObjectPath);
  economyBurgObject.patch.operations.push({path: burgObjectPath.split("."), exists: true, value: burgObject});
  const economyBurgObjectPolicy = structuredClone(outputs.economy.policy);
  economyBurgObjectPolicy.allowedPaths.push(burgObjectPath);
  assert.throws(() => getEconomyWorkerPatchPolicy(outputs.economy.sourceMap, economyBurgObject.patch), error => error?.code === "economy-worker-policy-path-invalid");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: outputs.economy.sourceMap, binding, output: economyBurgObject, policy: economyBurgObjectPolicy}), "world-systems-worker-operation-value-invalid");

  const diplomacyMirror = structuredClone(outputs.diplomacy.output);
  const diplomacyPackStates = operation(diplomacyMirror.patch, "pack.states");
  diplomacyPackStates.value = structuredClone(diplomacyPackStates.value);
  diplomacyPackStates.value[1].name = "mirror-drift";
  assertProtocol(() => validate("diplomacy", diplomacyMirror), "diplomacy-state-mirror-invalid");

  const diplomacyCompactZones = structuredClone(outputs.diplomacy.output);
  const diplomacyCompactStore = operation(diplomacyCompactZones.patch, "zones").value;
  const diplomacyCompactRows = diplomacyCompactStore.zones;
  const diplomacyCompactPackRows = operation(diplomacyCompactZones.patch, "pack.zones").value;
  assert.ok(diplomacyCompactRows.length > 1, "外交地区紧凑身份正例缺少多个地区");
  diplomacyCompactRows.shift();
  if (diplomacyCompactPackRows !== diplomacyCompactRows) diplomacyCompactPackRows.shift();
  assert.notEqual(Number(diplomacyCompactRows[0]?.i ?? diplomacyCompactRows[0]?.id), 0, "外交地区紧凑身份正例首 id 没有形成非零值");
  updateZoneMetadata(diplomacyCompactStore.metadata, diplomacyCompactRows, outputs.diplomacy.sourceMap.pack.cells);
  validate("diplomacy", diplomacyCompactZones);

  const diplomacyRelation = structuredClone(outputs.diplomacy.output);
  const relationStates = operation(diplomacyRelation.patch, "pack.states").value;
  const relationPolitics = operation(diplomacyRelation.patch, "politics.states").value;
  const pair = findActivePair(relationStates);
  relationStates[pair.left].diplomacy[pair.right] = relationPolitics[pair.left].diplomacy[pair.right] = "Friendly";
  relationStates[pair.right].diplomacy[pair.left] = relationPolitics[pair.right].diplomacy[pair.left] = "Rival";
  assertProtocol(() => validate("diplomacy", diplomacyRelation), "diplomacy-relation-mirror-invalid");

  const diplomacyWarzone = structuredClone(outputs.diplomacy.output);
  const zoneRows = operation(diplomacyWarzone.patch, "zones").value.zones;
  const packZoneRows = operation(diplomacyWarzone.patch, "pack.zones").value;
  const invalidWarzone = {i: zoneRows.length, type: "Warzone", cells: [999999], attacker: 999998, defender: 999999};
  zoneRows.push(structuredClone(invalidWarzone));
  if (packZoneRows !== zoneRows) packZoneRows.push(structuredClone(invalidWarzone));
  assertProtocol(() => validate("diplomacy", diplomacyWarzone), "zone-cells-invalid");

  const diplomacyWarzoneState = structuredClone(outputs.diplomacy.output);
  const stateZoneRows = operation(diplomacyWarzoneState.patch, "zones").value.zones;
  const statePackZoneRows = operation(diplomacyWarzoneState.patch, "pack.zones").value;
  const invalidWarzoneState = {i: stateZoneRows.length, type: "Warzone", cells: [0], attacker: 999998, defender: 999999};
  stateZoneRows.push(structuredClone(invalidWarzoneState));
  if (statePackZoneRows !== stateZoneRows) statePackZoneRows.push(structuredClone(invalidWarzoneState));
  assertProtocol(() => validate("diplomacy", diplomacyWarzoneState), "diplomacy-warzone-reference-invalid");

  const diplomacyThirdStateCell = structuredClone(outputs.diplomacy.output);
  const thirdStateStore = operation(diplomacyThirdStateCell.patch, "zones").value;
  const thirdStateZoneRows = thirdStateStore.zones;
  const thirdStatePackRows = operation(diplomacyThirdStateCell.patch, "pack.zones").value;
  const thirdStateRows = operation(diplomacyThirdStateCell.patch, "pack.states").value;
  const thirdStatePoliticsRows = operation(diplomacyThirdStateCell.patch, "politics.states").value;
  const enemyPair = findActivePair(thirdStateRows);
  thirdStateRows[enemyPair.left].diplomacy[enemyPair.right] = thirdStatePoliticsRows[enemyPair.left].diplomacy[enemyPair.right] = "Enemy";
  thirdStateRows[enemyPair.right].diplomacy[enemyPair.left] = thirdStatePoliticsRows[enemyPair.right].diplomacy[enemyPair.left] = "Enemy";
  const thirdCell = outputs.diplomacy.sourceMap.pack.cells.i.find(cell => {
    const stateId = Number(outputs.diplomacy.sourceMap.pack.cells.state[cell]);
    return stateId > 0 && stateId !== enemyPair.left && stateId !== enemyPair.right;
  });
  assert.ok(Number.isSafeInteger(thirdCell), "外交第三国 cell 负例缺少样本");
  const thirdStateWarzone = {i: thirdStateZoneRows.length, type: "Warzone", cells: [thirdCell], attacker: enemyPair.left, defender: enemyPair.right};
  thirdStateZoneRows.push(structuredClone(thirdStateWarzone));
  if (thirdStatePackRows !== thirdStateZoneRows) thirdStatePackRows.push(structuredClone(thirdStateWarzone));
  updateZoneMetadata(thirdStateStore.metadata, thirdStateZoneRows, outputs.diplomacy.sourceMap.pack.cells);
  assertProtocol(() => validate("diplomacy", diplomacyThirdStateCell), "diplomacy-warzone-cell-state-invalid");

  const diplomacyZoneMetadata = structuredClone(outputs.diplomacy.output);
  operation(diplomacyZoneMetadata.patch, "zones").value.metadata.zones += 1;
  assertProtocol(() => validate("diplomacy", diplomacyZoneMetadata), "diplomacy-zone-metadata-invalid");

  const militaryMirror = structuredClone(outputs.military.output);
  const militaryPack = operation(militaryMirror.patch, "pack.military");
  militaryPack.value = structuredClone(militaryPack.value);
  militaryPack.value.metadata.regiments += 1;
  assertProtocol(() => validate("military", militaryMirror), "military-pack-mirror-invalid");

  const militaryReference = structuredClone(outputs.military.output);
  const militaryPackStates = operation(militaryReference.patch, "pack.states");
  militaryPackStates.value = structuredClone(militaryPackStates.value);
  const packStates = militaryPackStates.value;
  const politicsStates = operation(militaryReference.patch, "politics.states").value;
  const regimentState = packStates.find(item => item?.i && item.military?.length);
  assert.ok(regimentState, "军事协议负例缺少军团");
  const regimentIndex = packStates[regimentState.i].military.findIndex(item => item?.id === regimentState.military[0].id);
  packStates[regimentState.i].military[regimentIndex].state = politicsStates[regimentState.i].military[regimentIndex].state = 999999;
  assertProtocol(() => validate("military", militaryReference), "military-regiment-reference-invalid");

  const militaryEvent = structuredClone(outputs.military.output);
  const eventMilitary = operation(militaryEvent.patch, "military");
  const eventPackMilitary = operation(militaryEvent.patch, "pack.military");
  eventMilitary.value = structuredClone(eventMilitary.value);
  eventPackMilitary.value = structuredClone(eventPackMilitary.value);
  eventMilitary.value.events[0].archived = eventPackMilitary.value.events[0].archived = false;
  assertProtocol(() => validate("military", militaryEvent), "military-event-archive-invalid");

  const militaryEventContent = structuredClone(outputs.military.output);
  const contentMilitary = operation(militaryEventContent.patch, "military");
  const contentPackMilitary = operation(militaryEventContent.patch, "pack.military");
  contentMilitary.value = structuredClone(contentMilitary.value);
  contentPackMilitary.value = structuredClone(contentPackMilitary.value);
  contentMilitary.value.events[0].kind = contentPackMilitary.value.events[0].kind = "forged-battle";
  assertProtocol(() => validate("military", militaryEventContent), "military-event-archive-invalid");

  const militaryEventGeneration = structuredClone(outputs.military.output);
  const generationMilitary = operation(militaryEventGeneration.patch, "military");
  const generationPackMilitary = operation(militaryEventGeneration.patch, "pack.military");
  generationMilitary.value = structuredClone(generationMilitary.value);
  generationPackMilitary.value = structuredClone(generationPackMilitary.value);
  generationMilitary.value.metadata.eventArchiveGeneration = generationPackMilitary.value.metadata.eventArchiveGeneration = 999999;
  assertProtocol(() => validate("military", militaryEventGeneration), "military-event-archive-generation-invalid");

  const militaryEventItemGeneration = structuredClone(outputs.military.output);
  const itemGenerationMilitary = operation(militaryEventItemGeneration.patch, "military");
  const itemGenerationPackMilitary = operation(militaryEventItemGeneration.patch, "pack.military");
  itemGenerationMilitary.value = structuredClone(itemGenerationMilitary.value);
  itemGenerationPackMilitary.value = structuredClone(itemGenerationPackMilitary.value);
  itemGenerationMilitary.value.events[0].archiveGeneration = itemGenerationPackMilitary.value.events[0].archiveGeneration = 999999;
  assertProtocol(() => validate("military", militaryEventItemGeneration), "military-event-archive-invalid");

  const militaryEventSequence = structuredClone(outputs.military.output);
  const sequenceMilitary = operation(militaryEventSequence.patch, "military");
  const sequencePackMilitary = operation(militaryEventSequence.patch, "pack.military");
  sequenceMilitary.value = structuredClone(sequenceMilitary.value);
  sequencePackMilitary.value = structuredClone(sequencePackMilitary.value);
  sequenceMilitary.value.metadata.eventSequence = sequencePackMilitary.value.metadata.eventSequence = 10;
  assertProtocol(() => validate("military", militaryEventSequence), "military-event-sequence-invalid");

  const policyMirror = structuredClone(outputs["military-policy"].output);
  const policyPack = policyMirror.patch.operations.find(row => /^pack\.states\.\d+\.(?:alert|military|militaryPolicy|militaryDiagnostics)$/u.test(row.path.join(".")));
  assert.ok(policyPack, "军事策略负例缺少 pack state patch");
  policyPack.value = structuredClone(policyPack.value);
  policyPack.value = typeof policyPack.value === "number" ? policyPack.value + 1 : {...policyPack.value, protocolDrift: true};
  assertProtocol(() => validate("military-policy", policyMirror), "military-state-mirror-invalid");

  const policyCrossState = structuredClone(outputs["military-policy"].output);
  const otherState = policySource.pack.states.find(item => item?.i && !item.removed && item.i !== request.stateId);
  assert.ok(otherState, "军事策略跨国家负例缺少第二国家");
  for (const root of ["pack.states", "politics.states"]) {
    const pathValue = `${root}.${otherState.i}.alert`;
    policyCrossState.patch.writeSet.push(pathValue);
    policyCrossState.patch.operations.push({path: pathValue.split("."), exists: true, value: 12345});
  }
  const policyCrossStatePolicy = structuredClone(outputs["military-policy"].policy);
  policyCrossStatePolicy.allowedPaths.push(`pack.states.${otherState.i}.alert`, `politics.states.${otherState.i}.alert`);
  assert.throws(() => getMilitaryPolicyWorkerPatchPolicy(policySource, policyCrossState.patch, request.stateId), error => error?.code === "military-policy-worker-policy-state-invalid");
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "military-policy", sourceMap: policySource, binding, output: policyCrossState, policy: policyCrossStatePolicy, expectation: {stateId: request.stateId}}), "world-systems-worker-operation-value-invalid");

  const policyWrongResult = structuredClone(outputs["military-policy"].output);
  policyWrongResult.result.stateId = policyWrongResult.plan.request.stateId = otherState.i;
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "military-policy", sourceMap: policySource, binding, output: policyWrongResult, policy: outputs["military-policy"].policy, expectation: {stateId: request.stateId}}), "military-policy-worker-state-mismatch");

  const policyEvent = structuredClone(outputs["military-policy"].output);
  const policyEventMilitary = operation(policyEvent.patch, "military").value;
  const policyEventPackMilitary = operation(policyEvent.patch, "pack.military").value;
  const appendedEvent = {id: "policy:unrelated-event", kind: "battle", stateId: otherState.i};
  policyEventMilitary.events.push(structuredClone(appendedEvent));
  policyEventPackMilitary.events.push(structuredClone(appendedEvent));
  policyEventMilitary.metadata.events = policyEventPackMilitary.metadata.events = policyEventMilitary.events.length;
  assertProtocol(() => validate("military-policy", policyEvent), "military-policy-events-invalid");

  const policyRootField = structuredClone(outputs["military-policy"].output);
  operation(policyRootField.patch, "military").value.protocolDrift = true;
  operation(policyRootField.patch, "pack.military").value.protocolDrift = true;
  assertProtocol(() => validate("military-policy", policyRootField), "military-policy-root-scope-invalid");

  const policyMetadataSummary = structuredClone(outputs["military-policy"].output);
  operation(policyMetadataSummary.patch, "military").value.metadata.troops = 999999999;
  operation(policyMetadataSummary.patch, "pack.military").value.metadata.troops = 999999999;
  assertProtocol(() => validate("military-policy", policyMetadataSummary), "military-metadata-count-invalid");

  const policyCampaign = structuredClone(outputs["military-policy"].output);
  const policyCampaignMilitary = operation(policyCampaign.patch, "military").value;
  const policyCampaignPackMilitary = operation(policyCampaign.patch, "pack.military").value;
  const invalidCampaign = {id: "policy:unrelated-campaign", attacker: otherState.i, defender: 999999, frontIds: []};
  policyCampaignMilitary.campaigns.push(structuredClone(invalidCampaign));
  policyCampaignPackMilitary.campaigns.push(structuredClone(invalidCampaign));
  policyCampaignMilitary.metadata.campaigns = policyCampaignPackMilitary.metadata.campaigns = policyCampaignMilitary.campaigns.length;
  assertProtocol(() => validate("military-policy", policyCampaign), "military-campaign-reference-invalid");

  const policyFront = structuredClone(outputs["military-policy"].output);
  const policyFrontMilitary = operation(policyFront.patch, "military").value;
  const policyFrontPackMilitary = operation(policyFront.patch, "pack.military").value;
  const sourceFront = policyFrontMilitary.fronts[0];
  if (sourceFront) {
    sourceFront.borderCells = [999999];
    policyFrontPackMilitary.fronts[0].borderCells = [999999];
  } else {
    const invalidFront = {id: "policy:unrelated-front", attacker: otherState.i, defender: 999999, borderCells: [999999], borderCellPairs: []};
    policyFrontMilitary.fronts.push(structuredClone(invalidFront));
    policyFrontPackMilitary.fronts.push(structuredClone(invalidFront));
    policyFrontMilitary.metadata.fronts = policyFrontPackMilitary.metadata.fronts = policyFrontMilitary.fronts.length;
  }
  assertProtocol(() => validate("military-policy", policyFront), "military-front-reference-invalid");

  const unrelatedSource = generatePlaceholderMap({seed: "policy-valid-unrelated", cellsTarget: 10000, heightmapTemplate: "continents"});
  unrelatedSource.politics.states = structuredClone(unrelatedSource.pack.states);
  const unrelatedTarget = unrelatedSource.pack.states.find(item => item?.i && !item.removed && item.military?.length);
  assert.ok(unrelatedTarget, "军事策略非目标战线负例缺少目标国家");
  const unrelatedRatios = normalizeUnitRatios(unrelatedTarget.militaryPolicy?.unitRatios || {});
  const unrelatedRequest = {stateId: unrelatedTarget.i, ratios: normalizeUnitRatios({...unrelatedRatios, infantry: unrelatedRatios.infantry + 0.7, cavalry: unrelatedRatios.cavalry * 0.35}), confirm: true};
  const unrelatedOutput = await runMilitaryPolicyWorkerTask({map: structuredClone(unrelatedSource), request: unrelatedRequest, binding}, context(binding));
  const unrelatedPolicy = getMilitaryPolicyWorkerPatchPolicy(unrelatedSource, unrelatedOutput.patch, unrelatedRequest.stateId);
  const unrelatedFrontOutput = structuredClone(unrelatedOutput);
  const unrelatedMilitary = operation(unrelatedFrontOutput.patch, "military").value;
  const unrelatedPackMilitary = operation(unrelatedFrontOutput.patch, "pack.military").value;
  const unrelatedFrontIndex = unrelatedMilitary.fronts.findIndex(front => Number(front.attacker) !== unrelatedRequest.stateId && Number(front.defender) !== unrelatedRequest.stateId);
  assert.ok(unrelatedFrontIndex >= 0, "军事策略非目标战线负例缺少真实战线");
  unrelatedMilitary.fronts[unrelatedFrontIndex].label = "request-scope-drift";
  unrelatedPackMilitary.fronts[unrelatedFrontIndex].label = "request-scope-drift";
  assertProtocol(() => validateEconomyDiplomacyMilitaryWorkerOutput({kind: "military-policy", sourceMap: unrelatedSource, binding, output: unrelatedFrontOutput, policy: unrelatedPolicy, expectation: {stateId: unrelatedRequest.stateId}}), "military-policy-front-scope-invalid");

  console.log(JSON.stringify({ok: true, manifests: ["economy", "diplomacy", "military"], workers: ["economy.compute", "regeneration.compute:diplomacy", "regeneration.compute:military", "military-policy.compute"], writes: {economyRoots: ECONOMY_WORKER_WRITE_SET.length, diplomacy: DIPLOMACY_WORKER_WRITE_SET.length, military: MILITARY_REGENERATION_WORKER_WRITE_SET.length, militaryPolicyRoots: MILITARY_POLICY_WORKER_WRITE_SET.length}, performance: {economyOperations: economyOutput.patch.operations.length, economyValidationMs}, rejected: ["stale-binding", "stale-render-binding", "incomplete-render-binding", "missing-render-binding", "partial-write-set", "required-delete", "generation-log-shape", "generation-log-prefix", "generation-counter", "path-escape", "data-view", "economy-mirror", "economy-item-replacement", "economy-item-reference-replacement", "economy-unknown-field", "economy-deal-field", "economy-metadata-field", "economy-collection-replacement", "economy-burg-object-replacement", "diplomacy-mirror", "diplomacy-relation", "diplomacy-stale-military-state-scope", "diplomacy-stale-military-metadata-scope", "diplomacy-stale-military-freshness-scope", "diplomacy-warzone-cell", "diplomacy-warzone-state", "diplomacy-warzone-third-state-cell", "diplomacy-zone-metadata", "military-mirror", "military-reference", "military-event-archive", "military-event-content", "military-event-generation", "military-event-item-generation", "military-event-sequence", "military-policy-mirror", "military-policy-cross-state", "military-policy-result-state", "military-policy-event-scope", "military-policy-root-scope", "military-policy-metadata-summary", "military-policy-campaign-reference", "military-policy-front-reference", "military-policy-unrelated-front"], browserRuns: 0}, null, 2));

  function validate(kind, output) {
    return validateEconomyDiplomacyMilitaryWorkerOutput({kind, sourceMap: outputs[kind].sourceMap, binding, renderBinding: outputs[kind].renderBinding, output, policy: outputs[kind].policy, expectation: outputs[kind].expectation});
  }
} finally {
  await vite.close();
}

function context(binding) { return {binding, checkpoint() {}, report() {}}; }
function renderRequest(binding) {
  return {
    binding,
    layers: ["picking"],
    pickingComponents: ["military"],
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
function operation(patch, pathValue) {
  const row = patch.operations.find(item => item.path.join(".") === pathValue);
  assert.ok(row, `缺少 patch operation ${pathValue}`);
  return row;
}
function findActivePair(states) {
  const ids = states.filter(item => item?.i && !item.removed).map(item => Number(item.i));
  assert.ok(ids.length >= 2, "外交协议负例缺少两个活动国家");
  return {left: ids[0], right: ids[1]};
}
function updateZoneMetadata(metadata, zones, cells) {
  const types = {};
  let cellCount = 0;
  let invalidCells = 0;
  for (const zone of zones) {
    types[zone.type] = (types[zone.type] || 0) + 1;
    cellCount += zone.cells?.length || 0;
    for (const cell of zone.cells || []) if (!Number.isInteger(cell) || cell < 0 || cell >= (cells?.i?.length || 0)) invalidCells += 1;
  }
  metadata.zones = zones.length;
  metadata.types = types;
  metadata.cells = cellCount;
  metadata.hidden = zones.filter(zone => zone.hidden).length;
  metadata.invalidCells = invalidCells;
}
function assertProtocol(callback, code) {
  assert.throws(callback, error => error?.code === code, `应拒绝 ${code}`);
}
