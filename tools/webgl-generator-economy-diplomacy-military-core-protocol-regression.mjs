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

  assert.deepEqual(economyManifest.workerTasks[0].writeSet, ECONOMY_WORKER_WRITE_SET);
  assert.deepEqual(diplomacyManifest.workerTasks[0].writeSet, DIPLOMACY_WORKER_WRITE_SET);
  assert.deepEqual(militaryManifest.workerTasks[0].writeSet, MILITARY_REGENERATION_WORKER_WRITE_SET);
  assert.deepEqual(militaryManifest.workerTasks[1].writeSet, MILITARY_POLICY_WORKER_WRITE_SET);
  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  assert.match(appSource, /\["diplomacy", "military"\]\.includes\(targetKind\)[\s\S]*?validateEconomyDiplomacyMilitaryWorkerOutput/u, "外交 / 军事重生成未接统一 pre-commit validator");
  assert.match(appSource, /kind: "economy"[\s\S]*?getEconomyWorkerPatchPolicy/u, "经济 Worker 未接统一 pre-commit validator");
  assert.match(appSource, /kind: "military-policy"[\s\S]*?getMilitaryPolicyWorkerPatchPolicy/u, "军事策略 Worker 未接统一 pre-commit validator");

  const owner = new MapRevisionTracker({identityFactory: () => "world-systems-map"});
  owner.replaceMap(); owner.advance();
  const binding = createFoundationWorkerBinding({revision: owner.getCoreSnapshot(), generationToken: 12, lockFingerprint: "world-systems-locks", operation: {id: 51, name: "world-systems-regression"}});
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
    const output = await runRegenerationWorkerTask({map: workerMap, kind}, context(binding));
    const policy = getRegenerationPatchPolicy(kind);
    const validated = validateEconomyDiplomacyMilitaryWorkerOutput({kind, sourceMap, binding, output, policy});
    assert.deepEqual([...validated.writeSet].sort(), [...output.patch.writeSet].sort());
    if (kind === "military") {
      const militaryResult = operation(output.patch, "military").value;
      assert.equal(militaryResult.events[0].archiveReason, "military-regeneration");
      assert.equal(militaryResult.metadata.eventSequence, 9);
    }
    outputs[kind] = {sourceMap, output, policy};
  }

  const economySource = generatePlaceholderMap({seed: "world-systems-economy", cellsTarget: 10000, heightmapTemplate: "continents"});
  const economyMap = structuredClone(economySource);
  const economyOutput = await runEconomyWorkerTask({map: economyMap, request: {kind: "rebuild", confirm: true}, binding}, context(binding));
  const economyPolicy = getEconomyWorkerPatchPolicy(economySource, economyOutput.patch);
  validateEconomyDiplomacyMilitaryWorkerOutput({kind: "economy", sourceMap: economySource, binding, output: economyOutput, policy: economyPolicy});
  outputs.economy = {sourceMap: economySource, output: economyOutput, policy: economyPolicy};

  const policySource = generatePlaceholderMap({seed: "world-systems-military-policy", cellsTarget: 10000, heightmapTemplate: "continents"});
  policySource.politics.states = structuredClone(policySource.pack.states);
  const state = policySource.pack.states.find(item => item?.i && !item.removed && item.military?.length);
  assert.ok(state, "军事策略协议缺少活动军团样本");
  const ratios = normalizeUnitRatios(state.militaryPolicy?.unitRatios || {});
  const request = {stateId: state.i, ratios: normalizeUnitRatios({...ratios, infantry: ratios.infantry + 0.7, cavalry: ratios.cavalry * 0.35}), confirm: true};
  const policyMap = structuredClone(policySource);
  const policyOutput = await runMilitaryPolicyWorkerTask({map: policyMap, request, binding}, context(binding));
  const militaryPolicy = getMilitaryPolicyWorkerPatchPolicy(policySource, policyOutput.patch);
  validateEconomyDiplomacyMilitaryWorkerOutput({kind: "military-policy", sourceMap: policySource, binding, output: policyOutput, policy: militaryPolicy});
  outputs["military-policy"] = {sourceMap: policySource, output: policyOutput, policy: militaryPolicy};

  const stale = structuredClone(outputs.diplomacy.output);
  stale.binding.mapRevision += 1;
  assertProtocol(() => validate("diplomacy", stale), "world-systems-worker-binding-stale");

  const partial = structuredClone(outputs.military.output);
  partial.patch.writeSet.pop(); partial.patch.operations.pop();
  assertProtocol(() => validate("military", partial), "world-systems-worker-write-set-incomplete");

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

  const diplomacyMirror = structuredClone(outputs.diplomacy.output);
  const diplomacyPackStates = operation(diplomacyMirror.patch, "pack.states");
  diplomacyPackStates.value = structuredClone(diplomacyPackStates.value);
  diplomacyPackStates.value[1].name = "mirror-drift";
  assertProtocol(() => validate("diplomacy", diplomacyMirror), "diplomacy-state-mirror-invalid");

  const diplomacyRelation = structuredClone(outputs.diplomacy.output);
  const relationStates = operation(diplomacyRelation.patch, "pack.states").value;
  const relationPolitics = operation(diplomacyRelation.patch, "politics.states").value;
  const pair = findActivePair(relationStates);
  relationStates[pair.left].diplomacy[pair.right] = relationPolitics[pair.left].diplomacy[pair.right] = "Friendly";
  relationStates[pair.right].diplomacy[pair.left] = relationPolitics[pair.right].diplomacy[pair.left] = "Rival";
  assertProtocol(() => validate("diplomacy", diplomacyRelation), "diplomacy-relation-mirror-invalid");

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

  console.log(JSON.stringify({ok: true, manifests: ["economy", "diplomacy", "military"], workers: ["economy.compute", "regeneration.compute:diplomacy", "regeneration.compute:military", "military-policy.compute"], writes: {economyRoots: ECONOMY_WORKER_WRITE_SET.length, diplomacy: DIPLOMACY_WORKER_WRITE_SET.length, military: MILITARY_REGENERATION_WORKER_WRITE_SET.length, militaryPolicyRoots: MILITARY_POLICY_WORKER_WRITE_SET.length}, rejected: ["stale-binding", "partial-write-set", "path-escape", "data-view", "economy-mirror", "diplomacy-mirror", "diplomacy-relation", "military-mirror", "military-reference", "military-event-archive", "military-event-sequence", "military-policy-mirror"], browserRuns: 0}, null, 2));

  function validate(kind, output) {
    return validateEconomyDiplomacyMilitaryWorkerOutput({kind, sourceMap: outputs[kind].sourceMap, binding, output, policy: outputs[kind].policy});
  }
} finally {
  await vite.close();
}

function context(binding) { return {binding, checkpoint() {}, report() {}}; }
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
function assertProtocol(callback, code) {
  assert.throws(callback, error => error?.code === code, `应拒绝 ${code}`);
}
