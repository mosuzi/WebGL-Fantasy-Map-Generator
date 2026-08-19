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
  const {createFoundationWorkerBinding} = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {runRegenerationWorkerTask, getRegenerationPatchPolicy} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const {createDomainPatchCommand} = await vite.ssrLoadModule("/src/runtime/domain-patch.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");
  const {EditHistory} = await vite.ssrLoadModule("/src/runtime/edit-history.js");

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
    const workerMap = generatePlaceholderMap({seed: `society-politics-${kind}`, cellsTarget: 2000, heightmapTemplate: "continents"});
    const output = await runRegenerationWorkerTask({map: workerMap, kind}, {binding, checkpoint() {}, report() {}});
    const policy = getRegenerationPatchPolicy(kind);
    const validated = validateSocietyPoliticsWorkerOutput({kind, binding, output, policy});
    assert.deepEqual([...validated.writeSet].sort(), [...SOCIETY_POLITICS_WRITE_SETS[kind]].sort(), `${kind} validator 写集与 Manifest 不一致`);
    assert.equal(validated.binding.sourceRevision.topologyRevision, 1, `${kind} core binding 丢失 topology revision`);
    cases[kind] = {
      writes: validated.writeSet.length,
      states: workerMap.politics.states.filter(Boolean).length,
      provinces: workerMap.politics.provinces.filter(Boolean).length,
      religions: workerMap.society.religions.filter(Boolean).length
    };
    outputs[kind] = {output, policy};
  }

  assertProtocol(() => validateSocietyPoliticsWorkerOutput({
    kind: "religions",
    binding,
    output: {...outputs.religions.output, binding: {...binding, topologyRevision: 2}},
    policy: outputs.religions.policy
  }), "society-politics-worker-binding-stale");

  const partial = structuredClone(outputs.states.output);
  partial.patch.writeSet.pop();
  partial.patch.operations.pop();
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", binding, output: partial, policy: outputs.states.policy}), "society-politics-worker-write-set-incomplete");

  const religionMirror = structuredClone(outputs.religions.output);
  const religionMirrorOperation = operation(religionMirror.patch, "pack.religions");
  religionMirrorOperation.value = structuredClone(religionMirrorOperation.value).slice(0, -1);
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "religions", binding, output: religionMirror, policy: outputs.religions.policy}), "society-politics-religion-mirror-invalid");

  const provinceMirror = structuredClone(outputs.provinces.output);
  const provinceMirrorOperation = operation(provinceMirror.patch, "pack.provinces");
  provinceMirrorOperation.value = structuredClone(provinceMirrorOperation.value);
  provinceMirrorOperation.value[1].name = "镜像漂移";
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "provinces", binding, output: provinceMirror, policy: outputs.provinces.policy}), "society-politics-province-mirror-invalid");

  const capitalMirror = structuredClone(outputs.states.output);
  const politics = operationValue(capitalMirror.patch, "politics");
  const activeState = politics.states.find(state => state?.i && !state.removed && Number(state.capital) > 0);
  assert(activeState, "states Worker 结果缺少首都引用样本");
  activeState.center += 1;
  operationValue(capitalMirror.patch, "pack.states")[activeState.i].center = activeState.center;
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "states", binding, output: capitalMirror, policy: outputs.states.policy}), "society-politics-state-capital-invalid");

  const policyDrift = structuredClone(outputs.provinces.policy);
  policyDrift.allowedPaths.pop();
  assertProtocol(() => validateSocietyPoliticsWorkerOutput({kind: "provinces", binding, output: outputs.provinces.output, policy: policyDrift}), "society-politics-worker-policy-drift");

  const canonical = generatePlaceholderMap({seed: "society-politics-commit", cellsTarget: 2000, heightmapTemplate: "continents"});
  const commitOutput = await runRegenerationWorkerTask({map: structuredClone(canonical), kind: "states"}, {binding, checkpoint() {}, report() {}});
  validateSocietyPoliticsWorkerOutput({kind: "states", binding, output: commitOutput, policy: getRegenerationPatchPolicy("states")});
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
    rejected: ["stale-binding", "partial-write-set", "religion-mirror", "province-mirror", "capital-reference", "policy-drift"],
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
