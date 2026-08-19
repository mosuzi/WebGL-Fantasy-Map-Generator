import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import {extname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const appRoot = join(root, "app", "webgl-generator", "src");
const toolsRoot = join(root, "tools");
const appSources = readSources(appRoot);
const toolSources = readSources(toolsRoot);
for (const path of [...toolSources.keys()]) if (path.replaceAll("\\", "/").endsWith("tools/webgl-generator-legacy-core-path-audit.mjs")) toolSources.delete(path);
const appSource = sourceBySuffix(appSources, "runtime/app.js");
assert.ok(appSource, "缺少 runtime/app.js");

const adapterNames = [
  "adaptLegacyInteractiveRevision",
  "adaptHeadlessDocumentRevision",
  "adaptPersistedDocumentBinding",
  "adaptLegacyPresentationBinding",
  "adaptLegacyRenderResourceBinding"
];
const adapterMatrix = Object.fromEntries(adapterNames.map(name => [name, {
  productReferences: referenceCount(appSources, name) - definitionCount(appSources, name),
  testReferences: referenceCount(toolSources, name)
}]));
assert.ok(adapterMatrix.adaptLegacyInteractiveRevision.productReferences >= 7, "interactive revision adapter 未覆盖正式领域入口");
for (const name of adapterNames.slice(1)) {
  assert.equal(adapterMatrix[name].productReferences, 0, `${name} 出现未登记产品接线`);
  assert.ok(adapterMatrix[name].testReferences >= 1, `${name} 缺少跨 profile 契约门`);
}
assert.equal(referenceCount(appSources, "revisionProfile") + referenceCount(toolSources, "revisionProfile"), 0, "已证冗余 revisionProfile 又被引入");

assert.equal(matches(appSource, /new MapRevisionTracker\(/gu), 1, "正式 app 必须只有一个 MapRevisionTracker owner");
assert.equal(matches(appSource, /new EditHistory\(/gu), 1, "正式 app 必须只有一个 EditHistory owner");
assert.equal(matches(appSource, /mapRevision\.advance\(/gu), 1, "canonical revision 只能由 EditHistory onMutation 推进一次");
assert.equal(matches(appSource, /state\.mapRevision\.replaceMap\(/gu), 1, "整图接纳只能在 loadMapIntoRuntime 替换一次 revision session");
assert.match(appSource, /onSnapshot: \(\) => mapRevision\.createSnapshot\(\)[\s\S]*onRestore: snapshot => mapRevision\.restoreSnapshot\(snapshot\)/u, "history snapshot / restore 必须复用同一 revision owner");

const coreRuntimeImports = [...appSources.entries()].filter(([path, source]) => path.replaceAll("\\", "/").includes("/core/")
  && /runtime\/(?:map-revision|edit-history)\.js/u.test(source.replaceAll("\\", "/")));
assert.deepEqual(coreRuntimeImports, [], "core 不得反向持有 legacy revision / history owner");

const engineSource = sourceBySuffix(appSources, "core/map-core-engine.ts");
assert.ok(engineSource, "缺少 MapCoreEngine");
for (const forbidden of ["setMap", "replaceMap", "advanceRevision", "executeCommand"]) {
  assert.doesNotMatch(engineSource, new RegExp(`\\b${forbidden}\\b`, "u"), `MapCoreEngine shadow facade 不得暴露 ${forbidden}`);
}
for (const suffix of ["domains/notes/runtime.ts", "domains/markers/runtime.ts"]) {
  const source = sourceBySuffix(appSources, suffix);
  assert.ok(source, `缺少 ${suffix}`);
  assert.doesNotMatch(source, /(?:state|owner)\.map\s*=|getMap\(\)\s*=/u, `${suffix} shadow observer 不得成为第二 canonical writer`);
}

const manifestFiles = [...appSources.entries()].filter(([path]) => /domains[\\/][^\\/]+[\\/]manifest\.ts$/u.test(path));
assert.ok(manifestFiles.length >= 14, "领域 Manifest 分母异常");
const activeManifests = manifestFiles.filter(([, source]) => /status:\s*"active"/u.test(source)).map(([path]) => path.replaceAll("\\", "/"));
assert.deepEqual(activeManifests.map(path => path.match(/domains\/([^/]+)\/manifest\.ts$/u)?.[1]), ["notes"], "只有完整接管 command/history 的 notes Manifest 可以 active");
for (const [path, source] of manifestFiles) {
  if (path.replaceAll("\\", "/").endsWith("domains/notes/manifest.ts")) continue;
  assert.match(source, /status:\s*"shadow"/u, `${path} 未经 owner 切换不得宣称 active`);
}

for (const validator of [
  "validateFoundationWorkerOutput",
  "validatePopulationWorkerOutput",
  "validateSocietyPoliticsWorkerOutput",
  "validateSettlementZoneWorkerOutput",
  "validateFeaturesNetworksResourcesWorkerOutput",
  "validateEconomyDiplomacyMilitaryWorkerOutput",
  "validateWholeMapAdoptionEnvelope",
  "validateWholeMapExportResult"
]) assert.ok(matches(appSource, new RegExp(`\\b${validator}\\(`, "gu")) >= 1, `正式入口缺少 ${validator}`);

const mapFileWorker = sourceBySuffix(appSources, "runtime/map-file-io-worker-task.js");
assert.doesNotMatch(mapFileWorker, /function mapDocumentMetadata\(/u, "map-file Worker 不得恢复与整图 receipt 重复的 metadata builder");

console.log(JSON.stringify({
  status: "pass",
  removed: ["revisionProfile"],
  retainedAdapters: adapterMatrix,
  canonicalOwners: {revision: 1, history: 1, map: "state.map"},
  manifests: {active: activeManifests.length, shadow: manifestFiles.length - activeManifests.length},
  preCommitValidators: 8,
  browserRuns: 0
}, null, 2));

function readSources(directory) {
  const sources = new Map();
  for (const file of sourceFiles(directory)) sources.set(relative(root, file), readFileSync(file, "utf8"));
  return sources;
}

function sourceFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if ([".js", ".mjs", ".ts"].includes(extname(path))) files.push(path);
  }
  return files;
}

function referenceCount(sources, name) {
  const pattern = new RegExp(`\\b${name}\\b`, "gu");
  return [...sources.values()].reduce((sum, source) => sum + matches(source, pattern), 0);
}

function definitionCount(sources, name) {
  const pattern = new RegExp(`export function ${name}\\b`, "gu");
  return [...sources.values()].reduce((sum, source) => sum + matches(source, pattern), 0);
}

function matches(source, pattern) {
  return (String(source || "").match(pattern) || []).length;
}

function sourceBySuffix(sources, suffix) {
  const normalized = suffix.replaceAll("\\", "/");
  for (const [path, source] of sources) if (path.replaceAll("\\", "/").endsWith(normalized)) return source;
  return "";
}
