import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {validateSettlementCityMirrors} from "../settlements/worker-runtime.js";
import {FEATURES_WORKER_WRITE_SET, featuresManifest} from "./manifest.js";
import {ROUTES_WORKER_WRITE_SET, routesManifest} from "../routes/manifest.js";
import {RIVERS_WORKER_WRITE_SET, riversManifest} from "../rivers/manifest.js";
import {MARKERS_WORKER_WRITE_SET, markersManifest} from "../markers/manifest.js";

type UnknownRecord = Record<string, unknown>;
export type FeaturesNetworksResourcesWorkerKind = "features" | "routes" | "rivers" | "markers";

type LegacyBinding = Readonly<{
  mapIdentity: string;
  mapRevision: number;
  topologyRevision: number;
  generationToken: number;
  lockFingerprint: string;
  operationId: number;
  operationName: string;
}>;

const descriptorByKind = Object.freeze({
  features: featuresManifest.workerTasks[0],
  routes: routesManifest.workerTasks[0],
  rivers: riversManifest.workerTasks[0],
  markers: markersManifest.workerTasks[0]
});
const writeSetByKind = Object.freeze({
  features: FEATURES_WORKER_WRITE_SET,
  routes: ROUTES_WORKER_WRITE_SET,
  rivers: RIVERS_WORKER_WRITE_SET,
  markers: MARKERS_WORKER_WRITE_SET
});

export function validateFeaturesNetworksResourcesWorkerOutput(input: {
  readonly kind: FeaturesNetworksResourcesWorkerKind;
  readonly binding: unknown;
  readonly output: unknown;
  readonly policy: unknown;
  readonly sourceMap: unknown;
}): Readonly<{binding: ComputeOperationBinding; kind: FeaturesNetworksResourcesWorkerKind; writeSet: readonly string[]}> {
  const descriptor = descriptorByKind[input.kind];
  const expectedPaths = writeSetByKind[input.kind];
  if (!descriptor || !expectedPaths || !descriptor.resultKinds.includes(input.kind as never)) {
    throw protocolError("geography-worker-kind-invalid", `地理网络 Worker 不支持 ${String(input.kind || "(empty)")}`);
  }
  const sourceBinding = validateLegacyBinding(input.binding, "geography.request.binding");
  const output = record(input.output, "geography.output");
  if (output.kind !== input.kind) throw protocolError("geography-worker-kind-mismatch", "地理网络 Worker 结果类型与请求不一致");
  assertSameBinding(output.binding, sourceBinding, "geography.output.binding");
  validatePreparedRender(output.preparedRender, sourceBinding);
  const result = record(output.result, "geography.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("geography-worker-result-invalid", "地理网络 Worker 缺少 executed 结果");
  const values = validatePatch(output.patch, input.kind, expectedPaths, input.policy, result.executed);
  if (result.executed) validateDomainMirrors(input.kind, values, input.sourceMap);
  return Object.freeze({binding: adaptBinding(input.kind, sourceBinding), kind: input.kind, writeSet: Object.freeze([...values.keys()])});
}

function adaptBinding(kind: FeaturesNetworksResourcesWorkerKind, source: LegacyBinding): ComputeOperationBinding {
  const operationId = `${kind}:${source.operationId}`;
  return validateOperationBinding({
    bindingPhase: "pre-commit",
    bindingKind: "compute",
    operationId,
    transactionId: `${source.mapIdentity}:${operationId}:${source.mapRevision}:${source.topologyRevision}:${source.generationToken}`,
    operationName: source.operationName || `${kind}.regenerate`,
    sourceRevision: adaptLegacyInteractiveRevision({
      mapIdentity: source.mapIdentity,
      mapRevision: source.mapRevision,
      topologyRevision: source.topologyRevision,
      domainRevisions: {[kind]: source.mapRevision}
    }),
    generationToken: source.generationToken,
    lockFingerprint: source.lockFingerprint
  }, "geography.binding.core") as ComputeOperationBinding;
}

function validatePatch(value: unknown, kind: FeaturesNetworksResourcesWorkerKind, expectedPaths: readonly string[], policyValue: unknown, executed: boolean): Map<string, unknown> {
  const patch = record(value, "geography.patch");
  const policy = record(policyValue, "geography.policy");
  if (patch.version !== 1 || patch.domain !== kind || policy.domain !== kind) throw protocolError("geography-worker-patch-invalid", "地理网络 Worker patch 版本或领域无效");
  const allowedPaths = stringArray(policy.allowedPaths, "geography.policy.allowedPaths");
  if (!sameStringSet(allowedPaths, expectedPaths)) throw protocolError("geography-worker-policy-drift", `${kind} 主线程 policy 与 Manifest 写集漂移`);
  const forbiddenPaths = stringArray(policy.forbiddenPaths, "geography.policy.forbiddenPaths", true);
  if (kind === "rivers" && !sameStringSet(forbiddenPaths, ["settlements.routes", "pack.routes", "pack.cells.routes"])) {
    throw protocolError("geography-worker-policy-drift", "rivers 禁止写集与正式策略漂移");
  }
  const writeSet = stringArray(patch.writeSet, "geography.patch.writeSet", true);
  const operations = array(patch.operations, "geography.patch.operations");
  const values = new Map<string, unknown>();
  for (let index = 0; index < operations.length; index++) {
    const row = record(operations[index], `geography.patch.operations.${index}`);
    const parts = stringArray(row.path, `geography.patch.operations.${index}.path`);
    if (row.exists !== true && row.exists !== false || parts.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) {
      throw protocolError("geography-worker-operation-invalid", "地理网络 Worker patch operation 结构无效");
    }
    const path = parts.join(".");
    if (executed && !validOperationValue(path, row.exists, row.value)) {
      throw protocolError("geography-worker-operation-value-invalid", `地理网络 Worker patch 的 ${path} 值或容器无效`);
    }
    values.set(path, row.value);
  }
  if (!sameStringSet(writeSet, [...values.keys()]) || values.size !== writeSet.length) throw protocolError("geography-worker-write-set-mismatch", "地理网络 Worker patch writeSet 与 operations 不一致");
  const requiredPaths = kind === "markers" ? expectedPaths.filter(path => !["markers.metadata.stale", "economy.metadata.stale"].includes(path)) : expectedPaths;
  if (executed ? !sameStringSet(writeSet, requiredPaths) : writeSet.length !== 0) throw protocolError("geography-worker-write-set-incomplete", `${kind} patch 没有完整覆盖正式写集`);
  return values;
}

function validOperationValue(path: string, exists: unknown, value: unknown): boolean {
  if (exists === false) return path === "metadata.derivedStale" && value === undefined;
  if (exists !== true || value === undefined) return false;
  if (path.endsWith(".metadata.stale")) return typeof value === "boolean";
  if (path.startsWith("metadata.regeneration.")) return typeof value === "number" && Number.isFinite(value);
  if (path === "generationLog" || ["grid.features", "pack.features", "pack.burgs", "pack.routes", "pack.markers", "markers.markers", "pack.portDiagnostics.features", "pack.rivers", "pack.goods", "economy.goods", "climate.biomes", "pack.markets", "economy.markets", "pack.deals", "pack.states", "pack.provinces"].includes(path)) return Array.isArray(value);
  if (path.startsWith("grid.cells.") || path.startsWith("pack.cells.") && path !== "pack.cells.routes") return Array.isArray(value) || isTypedArray(value);
  return isPlainRecord(value);
}

function validateDomainMirrors(kind: FeaturesNetworksResourcesWorkerKind, values: Map<string, unknown>, sourceMap: unknown): void {
  if (kind === "features") return validateFeatureMirrors(values, sourceMap);
  if (kind === "routes") return validateRouteDomain(values, sourceMap);
  if (kind === "rivers") return validateRiverMirrors(values, sourceMap);
  validateMarkerResourceMirrors(values, sourceMap);
}

function validateFeatureMirrors(values: Map<string, unknown>, sourceMapValue: unknown): void {
  const sourceMap = record(sourceMapValue, "geography.sourceMap");
  const sourceGrid = record(sourceMap.grid, "geography.sourceMap.grid");
  const sourcePack = record(sourceMap.pack, "geography.sourceMap.pack");
  const featureDocument = record(values.get("features"), "geography.patch.features");
  const gridFeatures = denseArray(values.get("grid.features"), "geography.patch.grid.features");
  const packFeatures = denseArray(values.get("pack.features"), "geography.patch.pack.features");
  assertDeepEqual(featureDocument.features, gridFeatures, "feature-grid-mirror-invalid", "features / grid Feature 镜像不一致");
  validateIdentitySlots(gridFeatures, "feature-grid-identity-invalid");
  validateIdentitySlots(packFeatures, "feature-pack-identity-invalid");
  const gridF = indexedValues(values.get("grid.cells.f"), "geography.patch.grid.cells.f");
  const gridT = indexedValues(values.get("grid.cells.t"), "geography.patch.grid.cells.t");
  const packF = indexedValues(values.get("pack.cells.f"), "geography.patch.pack.cells.f");
  const packT = indexedValues(values.get("pack.cells.t"), "geography.patch.pack.cells.t");
  const packHaven = indexedValues(values.get("pack.cells.haven"), "geography.patch.pack.cells.haven");
  const packHarbor = indexedValues(values.get("pack.cells.harbor"), "geography.patch.pack.cells.harbor");
  const packType = indexedValues(values.get("pack.cells.type"), "geography.patch.pack.cells.type");
  const gridCount = indexedLength(record(sourceGrid.cells, "geography.sourceMap.grid.cells").i ?? sourceGrid.points, "geography.sourceMap.grid.cells.i");
  const packCount = indexedLength(record(sourcePack.cells, "geography.sourceMap.pack.cells").i, "geography.sourceMap.pack.cells.i");
  if ([gridF.length, gridT.length].some(length => length !== gridCount) || [packF.length, packT.length, packHaven.length, packHarbor.length, packType.length].some(length => length !== packCount)) {
    throw protocolError("feature-cell-length-invalid", "Feature cell 镜像长度与源拓扑不一致");
  }
  validateCellFeatureReferences(gridF, gridFeatures, "feature-grid-cell-reference-invalid");
  validateCellFeatureReferences(packF, packFeatures, "feature-pack-cell-reference-invalid");
  validateLockedFeatureEnvelope(sourceMap, values);
}

function validateRouteDomain(values: Map<string, unknown>, sourceMap: unknown): void {
  validateSettlementCityMirrors(values, sourceMap);
  const economyMarkets = denseArray(values.get("economy.markets"), "geography.patch.economy.markets");
  assertDeepEqual(economyMarkets, values.get("pack.markets"), "route-market-mirror-invalid", "economy / pack market 镜像不一致");
  const settlements = record(values.get("settlements"), "geography.patch.settlements");
  const routes = denseArray(settlements.routes, "geography.patch.settlements.routes");
  const cities = denseArray(settlements.cities, "geography.patch.settlements.cities");
  const sourcePack = record(record(sourceMap, "geography.sourceMap").pack, "geography.sourceMap.pack");
  const sourceCells = record(sourcePack.cells, "geography.sourceMap.pack.cells");
  const packCount = indexedLength(sourceCells.i, "geography.sourceMap.pack.cells.i");
  for (const value of routes) {
    if (!value) continue;
    const route = record(value, "geography.route");
    if (route.removed) continue;
    const from = Number(route.from);
    const to = Number(route.to);
    if (![from, to].every(endpoint => Number.isSafeInteger(endpoint) && endpoint >= -1 && (endpoint === -1 || Boolean(cities[endpoint]) && !record(cities[endpoint], `geography.city.${endpoint}`).removed))) throw protocolError("route-endpoint-invalid", `route #${String(route.id)} 端点无效`);
    const cells = array(route.packCells, "geography.route.packCells").map(Number);
    if (cells.length < 2 || cells.some(cell => !Number.isSafeInteger(cell) || cell < 0 || cell >= packCount)) throw protocolError("route-cell-invalid", `route #${String(route.id)} pack cell 无效`);
    for (let index = 1; index < cells.length; index++) {
      if (cells[index] === cells[index - 1]) continue;
      const neighbors = sourceCells.c as unknown[] | undefined;
      if (!Array.isArray(neighbors?.[cells[index - 1]]) || !(neighbors?.[cells[index - 1]] as unknown[]).map(Number).includes(cells[index])) throw protocolError("route-topology-invalid", `route #${String(route.id)} 路径不连续`);
    }
  }
}

function validateRiverMirrors(values: Map<string, unknown>, sourceMapValue: unknown): void {
  const riversDocument = record(values.get("rivers"), "geography.patch.rivers");
  const rivers = denseArray(riversDocument.rivers, "geography.patch.rivers.rivers");
  const packRivers = denseArray(values.get("pack.rivers"), "geography.patch.pack.rivers");
  assertDeepEqual(rivers, packRivers, "river-pack-mirror-invalid", "rivers / pack river 镜像不一致");
  assertDeepEqual(values.get("economy.goods"), values.get("pack.goods"), "river-goods-mirror-invalid", "economy / pack goods 镜像不一致");
  const sourceMap = record(sourceMapValue, "geography.sourceMap");
  const sourceGridCells = record(record(sourceMap.grid, "geography.sourceMap.grid").cells, "geography.sourceMap.grid.cells");
  const sourcePackCells = record(record(sourceMap.pack, "geography.sourceMap.pack").cells, "geography.sourceMap.pack.cells");
  const gridCount = indexedLength(sourceGridCells.i, "geography.sourceMap.grid.cells.i");
  const packCount = indexedLength(sourcePackCells.i, "geography.sourceMap.pack.cells.i");
  for (const path of ["grid.cells.biome", "grid.cells.s", "grid.cells.pop"]) if (indexedLength(values.get(path), `geography.patch.${path}`) !== gridCount) throw protocolError("river-cell-length-invalid", `${path} 长度与源拓扑不一致`);
  for (const path of ["pack.cells.fl", "pack.cells.r", "pack.cells.conf", "pack.cells.biome", "pack.cells.s", "pack.cells.pop", "pack.cells.good", "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride"]) if (indexedLength(values.get(path), `geography.patch.${path}`) !== packCount) throw protocolError("river-cell-length-invalid", `${path} 长度与源拓扑不一致`);
  const ids = new Set<number>();
  const parents = new Map<number, number>();
  for (const value of rivers) {
    if (!value) continue;
    const river = record(value, "geography.river");
    if (river.removed) continue;
    const id = Number(river.i ?? river.id);
    if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) throw protocolError("river-identity-invalid", "河流 ID 无效或重复");
    ids.add(id);
    const cells = array(river.cells, `geography.river.${id}.cells`).map(Number);
    if (!cells.some(cell => cell >= 0) || cells.some(cell => !Number.isSafeInteger(cell) || cell < -1 || cell >= packCount)) throw protocolError("river-cell-invalid", `river #${id} cell 无效`);
    const parent = Number(river.parent || 0);
    if (parent) parents.set(id, parent);
  }
  for (const parent of parents.values()) if (!ids.has(parent)) throw protocolError("river-parent-invalid", `河流父引用 #${parent} 不存在`);
  for (const id of ids) {
    const visited = new Set<number>();
    for (let cursor = id; parents.has(cursor); cursor = parents.get(cursor) as number) if (visited.has(cursor)) throw protocolError("river-cycle-invalid", `河流 #${id} 父链成环`); else visited.add(cursor);
  }
  const cellRivers = indexedValues(values.get("pack.cells.r"), "geography.patch.pack.cells.r");
  for (let cell = 0; cell < cellRivers.length; cell++) {
    const id = Number(cellRivers[cell]);
    if (id && !ids.has(id)) throw protocolError("river-cell-reference-invalid", `pack cell #${cell} 指向不存在 river #${id}`);
  }
}

function validateMarkerResourceMirrors(values: Map<string, unknown>, sourceMapValue: unknown): void {
  const markersDocument = record(values.get("markers"), "geography.patch.markers");
  const markers = denseArray(markersDocument.markers, "geography.patch.markers.markers");
  assertDeepEqual(markers, values.get("pack.markers"), "marker-pack-mirror-invalid", "markers / pack marker 镜像不一致");
  const economy = record(values.get("economy"), "geography.patch.economy");
  const politics = record(values.get("politics"), "geography.patch.politics");
  for (const [left, right, code] of [[economy.goods, values.get("pack.goods"), "marker-goods-mirror-invalid"], [economy.markets, values.get("pack.markets"), "marker-market-mirror-invalid"], [economy.deals, values.get("pack.deals"), "marker-deal-mirror-invalid"], [politics.states, values.get("pack.states"), "marker-state-mirror-invalid"], [politics.provinces, values.get("pack.provinces"), "marker-province-mirror-invalid"]] as const) assertDeepEqual(left, right, code, `${code} 镜像不一致`);
  const sourcePackCells = record(record(record(sourceMapValue, "geography.sourceMap").pack, "geography.sourceMap.pack").cells, "geography.sourceMap.pack.cells");
  const sourceGrid = record(record(sourceMapValue, "geography.sourceMap").grid, "geography.sourceMap.grid");
  const sourceGridCells = record(sourceGrid.cells, "geography.sourceMap.grid.cells");
  const packCount = indexedLength(sourcePackCells.i, "geography.sourceMap.pack.cells.i");
  const gridCount = indexedLength(sourceGridCells.i ?? sourceGrid.points, "geography.sourceMap.grid.cells.i");
  for (const path of ["pack.cells.good", "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.market", "pack.cells.pop", "pack.cells.s", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride"]) if (indexedLength(values.get(path), `geography.patch.${path}`) !== packCount) throw protocolError("marker-cell-length-invalid", `${path} 长度与源拓扑不一致`);
  const markerIds = new Set<string>();
  for (const value of markers) {
    if (!value) continue;
    const marker = record(value, "geography.marker");
    if (marker.removed) continue;
    const id = String(marker.id ?? marker.i ?? "");
    const cell = Number(marker.cell);
    const packCell = Number(marker.packCell);
    if (!id || markerIds.has(id) || !Number.isSafeInteger(cell) || cell < 0 || cell >= gridCount || !Number.isSafeInteger(packCell) || packCell < 0 || packCell >= packCount) throw protocolError("marker-identity-invalid", "marker ID 重复或 cell 越界");
    markerIds.add(id);
  }
}

function validateLockedFeatureEnvelope(sourceMap: UnknownRecord, values: Map<string, unknown>): void {
  const locks = sourceMap.regenerationLocks && isPlainRecord(sourceMap.regenerationLocks) ? sourceMap.regenerationLocks : null;
  const entries = locks && Array.isArray(locks.entries) ? locks.entries : [];
  const ids = entries.filter(entry => isPlainRecord(entry) && entry.kind === "feature").map(entry => Number((entry as UnknownRecord).id)).filter(id => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return;
  const output = outputFeatureCollections(values);
  for (const id of ids) {
    const sourcePackFeature = (record(sourceMap.pack, "geography.sourceMap.pack").features as unknown[] | undefined)?.[id];
    const outputPackFeature = (values.get("pack.features") as unknown[] | undefined)?.[id];
    assertDeepEqual(outputPackFeature, sourcePackFeature, "feature-lock-envelope-invalid", `锁定 Feature #${id} 对象被改写`);
    for (const [label, sourceCells, outputCells] of [
      ["grid", record(record(sourceMap.grid, "geography.sourceMap.grid").cells, "geography.sourceMap.grid.cells").f, values.get("grid.cells.f")],
      ["pack", record(record(sourceMap.pack, "geography.sourceMap.pack").cells, "geography.sourceMap.pack.cells").f, values.get("pack.cells.f")]
    ] as const) {
      assertDeepEqual(cellsForFeature(sourceCells, id), cellsForFeature(outputCells, id), "feature-lock-cells-invalid", `锁定 Feature #${id} 的 ${label} cell 归属被改写`);
    }
    assertDeepEqual(captureDirectFeatureReferences(sourceMap, id), captureDirectFeatureReferences(output, id), "feature-lock-references-invalid", `锁定 Feature #${id} 直接引用集合被改写`);
  }
}

function cellsForFeature(value: unknown, id: number): number[] {
  const cells = indexedValues(value, "geography.feature-lock.cells");
  const result: number[] = [];
  for (let index = 0; index < cells.length; index++) if (Number(cells[index]) === id) result.push(index);
  return result;
}

function outputFeatureCollections(values: Map<string, unknown>): UnknownRecord {
  const settlements = record(values.get("settlements"), "geography.patch.settlements");
  const markers = record(values.get("markers.markers") === undefined ? {markers: []} : {markers: values.get("markers.markers")}, "geography.patch.markers");
  const packMetadata = record(values.get("pack.metadata"), "geography.patch.pack.metadata");
  return {
    pack: {burgs: values.get("pack.burgs"), routes: values.get("pack.routes"), portDiagnostics: {features: values.get("pack.portDiagnostics.features")}, metadata: packMetadata},
    settlements,
    markers
  };
}

function captureDirectFeatureReferences(map: UnknownRecord, id: number): unknown[] {
  const pack = isPlainRecord(map.pack) ? map.pack : {};
  const settlements = isPlainRecord(map.settlements) ? map.settlements : {};
  const markers = isPlainRecord(map.markers) ? map.markers : {};
  const portDiagnostics = isPlainRecord(pack.portDiagnostics) ? pack.portDiagnostics : {};
  const collections: Array<readonly [string, unknown]> = [
    ["pack.burgs", pack.burgs], ["settlements.cities", settlements.cities], ["pack.routes", pack.routes],
    ["settlements.routes", settlements.routes], ["markers.markers", markers.markers], ["pack.portDiagnostics.features", portDiagnostics.features]
  ];
  const references: unknown[] = [];
  for (const [collection, value] of collections) {
    const objects = Array.isArray(value) ? value : [];
    for (let index = 0; index < objects.length; index++) {
      const object = objects[index];
      if (!isPlainRecord(object) || Number(object.feature) !== id && Number(object.port) !== id && Number((object.data as UnknownRecord | undefined)?.feature) !== id) continue;
      references.push({collection, id: object.id ?? object.i ?? null, feature: object.feature, port: object.port, dataFeature: (object.data as UnknownRecord | undefined)?.feature, ...(!["pack.routes", "settlements.routes", "markers.markers"].includes(collection) ? {index} : {})});
    }
  }
  return references;
}

function validateIdentitySlots(rows: unknown[], code: string): void {
  for (let index = 0; index < rows.length; index++) {
    const value = rows[index];
    if (!value) continue;
    const row = record(value, `geography.identity.${index}`);
    if (row.removed) continue;
    if (Number(row.i ?? row.id) !== index) throw protocolError(code, `对象槽 #${index} 身份无效`);
  }
}

function validateCellFeatureReferences(cells: ArrayLike<unknown>, features: unknown[], code: string): void {
  for (let cell = 0; cell < cells.length; cell++) {
    const id = Number(cells[cell]);
    if (!Number.isSafeInteger(id) || id < 0 || id >= features.length || id > 0 && (!features[id] || record(features[id], `geography.feature.${id}`).removed)) throw protocolError(code, `cell #${cell} 指向无效 Feature #${id}`);
  }
}

function validatePreparedRender(value: unknown, expected: LegacyBinding): void {
  if (value === undefined || value === null) return;
  const prepared = record(value, "geography.preparedRender");
  if (prepared.schemaVersion !== 1) throw protocolError("geography-render-schema-invalid", "地理网络 renderer source schema 无效");
  const binding = record(prepared.binding, "geography.preparedRender.binding");
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision"] as const) if ((binding[key] ?? "") !== (expected[key] ?? "")) throw protocolError("geography-render-binding-stale", `renderer source ${key} 与请求不一致`);
}

function validateLegacyBinding(value: unknown, path: string): LegacyBinding {
  const source = record(value, path);
  const binding = {mapIdentity: typeof source.mapIdentity === "string" ? source.mapIdentity : "", mapRevision: Number(source.mapRevision), topologyRevision: Number(source.topologyRevision), generationToken: Number(source.generationToken), lockFingerprint: typeof source.lockFingerprint === "string" ? source.lockFingerprint : "", operationId: Number(source.operationId), operationName: typeof source.operationName === "string" ? source.operationName : ""};
  if (!binding.mapIdentity || !binding.lockFingerprint || ![binding.mapRevision, binding.topologyRevision, binding.generationToken, binding.operationId].every(item => Number.isSafeInteger(item) && item >= 0)) throw protocolError("geography-worker-binding-invalid", `${path} 缺少 identity / revision / topology / token / lock 指纹`);
  return Object.freeze(binding);
}

function assertSameBinding(value: unknown, expected: LegacyBinding, path: string): void {
  const actual = validateLegacyBinding(value, path);
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision", "generationToken", "lockFingerprint", "operationId", "operationName"] as const) if (actual[key] !== expected[key]) throw protocolError("geography-worker-binding-stale", `${path}.${key} 与请求不一致`);
}

function indexedValues(value: unknown, path: string): ArrayLike<unknown> {
  if (!Array.isArray(value) && !isTypedArray(value)) throw protocolError("geography-indexed-values-required", `${path} 必须是数组或 TypedArray`);
  return value as ArrayLike<unknown>;
}

function indexedLength(value: unknown, path: string): number { return indexedValues(value, path).length; }
function isTypedArray(value: unknown): boolean { return ArrayBuffer.isView(value) && !(value instanceof DataView); }
function isPlainRecord(value: unknown): value is UnknownRecord { if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function record(value: unknown, path: string): UnknownRecord { if (!isPlainRecord(value)) throw protocolError("geography-record-required", `${path} 必须是普通对象`); return value; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw protocolError("geography-array-required", `${path} 必须是数组`); return value; }
function denseArray(value: unknown, path: string): unknown[] { const rows = array(value, path); for (let index = 0; index < rows.length; index++) if (!Object.prototype.hasOwnProperty.call(rows, index)) throw protocolError("geography-array-hole-invalid", `${path} 存在 hole #${index}`); return rows; }
function stringArray(value: unknown, path: string, allowEmpty = false): string[] { const values = array(value, path); if (!allowEmpty && !values.length || values.some(item => typeof item !== "string" || !item)) throw protocolError("geography-string-array-required", `${path} 必须是${allowEmpty ? "" : "非空"}字符串数组`); return values as string[]; }
function sameStringSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value)); }
function assertDeepEqual(left: unknown, right: unknown, code: string, message: string): void { if (JSON.stringify(normalizeValue(left)) !== JSON.stringify(normalizeValue(right))) throw protocolError(code, message); }
function normalizeValue(value: unknown): unknown { if (isTypedArray(value)) return Array.from(value as unknown as ArrayLike<unknown>); if (Array.isArray(value)) return value.map(normalizeValue); if (isPlainRecord(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeValue(value[key])])); return value; }
function protocolError(code: string, message: string): Error & {code: string} { return Object.assign(new Error(message), {code}); }
