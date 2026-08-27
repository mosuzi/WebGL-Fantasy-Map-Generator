import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {createRiverLakeDrainageExpectations, createRiverLakeDrainageExpectationsAsync} from "../../generator/rivers.js";
import {validatePreparedWorkerRenderBinding} from "../worker-render-binding.js";
import {validateSettlementCityMirrors, validateSettlementRouteMirrors} from "../settlements/worker-runtime.js";
import {FEATURES_WORKER_WRITE_SET, featuresManifest} from "./manifest.js";
import {ROUTES_WORKER_WRITE_SET, routesManifest} from "../routes/manifest.js";
import {RIVERS_WORKER_WRITE_SET, riversManifest} from "../rivers/manifest.js";
import {MARKERS_WORKER_WRITE_SET, markersManifest} from "../markers/manifest.js";
import {isRegenerationLocked, regenerationLockedIds} from "../regeneration-validation-locks.js";

type UnknownRecord = Record<string, unknown>;
export type FeaturesNetworksResourcesWorkerKind = "features" | "routes" | "rivers" | "markers";

type FeaturesNetworksResourcesWorkerValidationInput = Readonly<{
  kind: FeaturesNetworksResourcesWorkerKind;
  binding: unknown;
  renderBinding?: unknown;
  output: unknown;
  policy: unknown;
  sourceMap: unknown;
}>;

type FeaturesNetworksResourcesWorkerValidationReceipt = Readonly<{
  binding: ComputeOperationBinding;
  kind: FeaturesNetworksResourcesWorkerKind;
  writeSet: readonly string[];
}>;

type AsyncRiverValidationControl = Readonly<{
  yieldToMain?: (stage: Readonly<{id: string}>) => void | Promise<void>;
  assertCurrent?: (stage: Readonly<{id: string}>) => void;
}>;

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

export function validateFeaturesNetworksResourcesWorkerOutput(input: FeaturesNetworksResourcesWorkerValidationInput): FeaturesNetworksResourcesWorkerValidationReceipt {
  const prepared = prepareFeaturesNetworksResourcesWorkerOutput(input);
  if (prepared.executed) validateDomainMirrors(input.kind, prepared.values, input.sourceMap);
  return createFeaturesNetworksResourcesWorkerValidationReceipt(input.kind, prepared.sourceBinding, prepared.values);
}

export async function validateFeaturesNetworksResourcesWorkerOutputAsync(
  input: FeaturesNetworksResourcesWorkerValidationInput,
  control: AsyncRiverValidationControl = {}
): Promise<FeaturesNetworksResourcesWorkerValidationReceipt> {
  const prepared = prepareFeaturesNetworksResourcesWorkerOutput(input);
  if (prepared.executed) {
    if (input.kind === "rivers") await validateRiverMirrorsAsync(prepared.values, input.sourceMap, control);
    else validateDomainMirrors(input.kind, prepared.values, input.sourceMap);
  }
  return createFeaturesNetworksResourcesWorkerValidationReceipt(input.kind, prepared.sourceBinding, prepared.values);
}

function prepareFeaturesNetworksResourcesWorkerOutput(input: FeaturesNetworksResourcesWorkerValidationInput): Readonly<{
  executed: boolean;
  sourceBinding: LegacyBinding;
  values: Map<string, unknown>;
}> {
  const descriptor = descriptorByKind[input.kind];
  const expectedPaths = writeSetByKind[input.kind];
  if (!descriptor || !expectedPaths || !descriptor.resultKinds.includes(input.kind as never)) {
    throw protocolError("geography-worker-kind-invalid", `地理网络 Worker 不支持 ${String(input.kind || "(empty)")}`);
  }
  const sourceBinding = validateLegacyBinding(input.binding, "geography.request.binding");
  const output = record(input.output, "geography.output");
  if (output.kind !== input.kind) throw protocolError("geography-worker-kind-mismatch", "地理网络 Worker 结果类型与请求不一致");
  assertSameBinding(output.binding, sourceBinding, "geography.output.binding");
  validatePreparedWorkerRenderBinding(output.preparedRender, input.renderBinding, {
    path: "geography.preparedRender",
    schemaCode: "geography-render-schema-invalid",
    invalidCode: "geography-render-binding-invalid",
    staleCode: "geography-render-binding-stale",
    label: "地理网络"
  });
  const result = record(output.result, "geography.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("geography-worker-result-invalid", "地理网络 Worker 缺少 executed 结果");
  const values = validatePatch(output.patch, input.kind, expectedPaths, input.policy, result.executed);
  return Object.freeze({executed: result.executed, sourceBinding, values});
}

function createFeaturesNetworksResourcesWorkerValidationReceipt(
  kind: FeaturesNetworksResourcesWorkerKind,
  sourceBinding: LegacyBinding,
  values: Map<string, unknown>
): FeaturesNetworksResourcesWorkerValidationReceipt {
  return Object.freeze({binding: adaptBinding(kind, sourceBinding), kind, writeSet: Object.freeze([...values.keys()])});
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
  const gridFeatures = array(values.get("grid.features"), "geography.patch.grid.features");
  const packFeatures = array(values.get("pack.features"), "geography.patch.pack.features");
  const lockedFeatureIds = regenerationLockedIds(sourceMapValue, "feature");
  array(featureDocument.features, "geography.patch.features.features");
  validateIdentitySlots(gridFeatures, "feature-grid-identity-invalid", lockedFeatureIds);
  validateIdentitySlots(packFeatures, "feature-pack-identity-invalid", lockedFeatureIds);
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
  validateCellFeatureReferences(gridF, gridFeatures, "feature-grid-cell-reference-invalid", lockedFeatureIds);
  validateCellFeatureReferences(packF, packFeatures, "feature-pack-cell-reference-invalid", lockedFeatureIds);
}

function unlockedIdentityRows(values: unknown[], lockedIds: ReadonlySet<string>): unknown[] {
  return values.map((value, index) => isRegenerationLocked(lockedIds, index) ? null : value);
}

function validateFeatureObjectMirrors(values: Map<string, unknown>, sourceMap: UnknownRecord, packFeatures: unknown[]): void {
  const settlements = record(values.get("settlements"), "geography.patch.settlements");
  const cities = denseArray(settlements.cities, "geography.patch.settlements.cities");
  const routes = denseArray(settlements.routes, "geography.patch.settlements.routes");
  const burgs = denseArray(values.get("pack.burgs"), "geography.patch.pack.burgs");
  const packRoutes = denseArray(values.get("pack.routes"), "geography.patch.pack.routes");
  const markers = denseArray(values.get("markers.markers"), "geography.patch.markers.markers");
  const packMarkers = denseArray(values.get("pack.markers"), "geography.patch.pack.markers");
  const sourceGrid = record(record(sourceMap.grid, "geography.sourceMap.grid").cells, "geography.sourceMap.grid.cells");
  const sourcePack = record(record(sourceMap.pack, "geography.sourceMap.pack").cells, "geography.sourceMap.pack.cells");
  const gridCount = indexedLength(sourceGrid.i ?? record(sourceMap.grid, "geography.sourceMap.grid").points, "geography.sourceMap.grid.cells.i");
  const packCount = indexedLength(sourcePack.i, "geography.sourceMap.pack.cells.i");
  validateSettlementRouteMirrors(routes, packRoutes);
  assertDeepEqual(markers, packMarkers, "feature-marker-mirror-invalid", "markers / pack marker 镜像不一致");
  const claimedBurgs = new Set<number>();
  for (let cityId = 0; cityId < cities.length; cityId++) {
    const value = cities[cityId];
    if (!value) continue;
    const city = record(value, `geography.city.${cityId}`);
    if (city.removed) continue;
    const burgId = Number(city.burgId);
    const gridCell = Number(city.cell);
    const packCell = Number(city.packCell);
    if (Number(city.id) !== cityId || !Number.isSafeInteger(burgId) || burgId < 0 || claimedBurgs.has(burgId)
      || !Number.isSafeInteger(gridCell) || gridCell < 0 || gridCell >= gridCount
      || !Number.isSafeInteger(packCell) || packCell < 0 || packCell >= packCount) {
      throw protocolError("feature-city-identity-invalid", `city #${cityId} 身份或 cell 无效`);
    }
    const burg = record(burgs[burgId], `geography.burg.${burgId}`);
    if (Number(burg.i) !== burgId || Number(burg.id) !== burgId || Number(burg.cityId) !== cityId || Number(burg.cell) !== packCell) {
      throw protocolError("feature-city-burg-mirror-invalid", `city #${cityId} 与 burg #${burgId} 身份镜像不一致`);
    }
    for (const key of ["name", "state", "province", "population", "capital", "provincial", "port"] as const) {
      const cityValue = ["capital", "provincial", "port"].includes(key) ? Number(city[key] || 0) : city[key];
      const burgValue = ["capital", "provincial", "port"].includes(key) ? Number(burg[key] || 0) : burg[key];
      if (cityValue !== burgValue) throw protocolError("feature-city-burg-mirror-invalid", `city #${cityId} 与 burg #${burgId} 的 ${key} 镜像不一致`);
    }
    claimedBurgs.add(burgId);
  }
  for (let burgId = 1; burgId < burgs.length; burgId++) {
    const value = burgs[burgId];
    if (!value) continue;
    const burg = record(value, `geography.burg.${burgId}`);
    if (burg.removed) continue;
    if (!claimedBurgs.has(burgId) || !cities[Number(burg.cityId)]) throw protocolError("feature-burg-city-mirror-invalid", `burg #${burgId} 没有唯一 city 镜像`);
  }
  const sourceSettlements = record(sourceMap.settlements, "geography.sourceMap.settlements");
  const sourcePackDocument = record(sourceMap.pack, "geography.sourceMap.pack");
  assertDeepEqual(cityIdentityRecords(cities), cityIdentityRecords(array(sourceSettlements.cities, "geography.sourceMap.settlements.cities")), "feature-settlement-identity-drift", "Feature Worker 改写了 city 身份或 cell");
  assertDeepEqual(burgIdentityRecords(burgs), burgIdentityRecords(array(sourcePackDocument.burgs, "geography.sourceMap.pack.burgs")), "feature-settlement-identity-drift", "Feature Worker 改写了 burg 身份或 cell");
  validateFeatureMarkerIdentity(markers, sourceMap, gridCount, packCount);
  const output = outputFeatureCollections(values);
  for (const [collection, object] of featureReferenceObjects(output)) {
    for (const [field, rawId] of [["feature", object.feature], ["port", object.port], ["data.feature", (object.data as UnknownRecord | undefined)?.feature]] as const) {
      if (rawId === undefined || rawId === null || rawId === "") continue;
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id < 0 || id > 0 && (!packFeatures[id] || record(packFeatures[id], `geography.feature.${id}`).removed)) {
        throw protocolError("feature-object-reference-invalid", `${collection} 的 ${field} 指向无效 Feature #${String(rawId)}`);
      }
    }
  }
}

function cityIdentityRecords(values: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!isPlainRecord(value) || value.removed) continue;
    result.push({index, id: value.id, burgId: value.burgId, cell: value.cell, packCell: value.packCell});
  }
  return result;
}

function burgIdentityRecords(values: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!isPlainRecord(value) || value.removed) continue;
    result.push({index, i: value.i, id: value.id, cityId: value.cityId, cell: value.cell});
  }
  return result;
}

function validateFeatureMarkerIdentity(markers: unknown[], sourceMap: UnknownRecord, gridCount: number, packCount: number): void {
  const ids = new Set<string>();
  const identities: unknown[] = [];
  for (let index = 0; index < markers.length; index++) {
    const value = markers[index];
    if (!value) continue;
    const marker = record(value, `geography.feature-marker.${index}`);
    if (marker.removed) continue;
    const id = String(marker.id ?? marker.i ?? "");
    const cell = Number(marker.cell);
    const packCell = Number(marker.packCell);
    if (!id || ids.has(id) || !Number.isSafeInteger(cell) || cell < 0 || cell >= gridCount || !Number.isSafeInteger(packCell) || packCell < 0 || packCell >= packCount) {
      throw protocolError("feature-marker-identity-invalid", `marker #${id || index} 身份重复或 cell 越界`);
    }
    ids.add(id);
    identities.push({index, id, cell, packCell});
  }
  const sourceMarkersDocument = record(sourceMap.markers, "geography.sourceMap.markers");
  const sourceMarkers = array(sourceMarkersDocument.markers, "geography.sourceMap.markers.markers");
  const sourceIdentities = sourceMarkers.flatMap((value, index) => isPlainRecord(value) && !value.removed
    ? [{index, id: String(value.id ?? value.i ?? ""), cell: Number(value.cell), packCell: Number(value.packCell)}]
    : []);
  assertDeepEqual(identities, sourceIdentities, "feature-marker-identity-drift", "Feature Worker 改写了 marker 身份或 cell");
}

function validateRouteDomain(values: Map<string, unknown>, sourceMap: unknown): void {
  const settlements = record(values.get("settlements"), "geography.patch.settlements");
  const routes = array(settlements.routes, "geography.patch.settlements.routes");
  const cities = array(settlements.cities, "geography.patch.settlements.cities");
  const sourcePack = record(record(sourceMap, "geography.sourceMap").pack, "geography.sourceMap.pack");
  const sourceCells = record(sourcePack.cells, "geography.sourceMap.pack.cells");
  const packCount = indexedLength(sourceCells.i, "geography.sourceMap.pack.cells.i");
  const heights = indexedValues(sourceCells.h, "geography.sourceMap.pack.cells.h");
  const lockedRouteIds = regenerationLockedIds(sourceMap, "route");
  for (const value of routes) {
    if (!value) continue;
    const route = record(value, "geography.route");
    if (isRegenerationLocked(lockedRouteIds, route.id, route.i)) continue;
    if (route.removed) continue;
    const from = Number(route.from);
    const to = Number(route.to);
    if (![from, to].every(endpoint => Number.isSafeInteger(endpoint) && endpoint >= -1 && (endpoint === -1 || Boolean(cities[endpoint]) && !record(cities[endpoint], `geography.city.${endpoint}`).removed))) throw protocolError("route-endpoint-invalid", `route #${String(route.id)} 端点无效`);
    const cells = array(route.packCells, "geography.route.packCells").map(Number);
    if (cells.length < 2 || cells.some(cell => !Number.isSafeInteger(cell) || cell < 0 || cell >= packCount)) throw protocolError("route-cell-invalid", `route #${String(route.id)} pack cell 无效`);
    if (route.type !== "searoute" && cells.some(cell => Number(heights[cell]) < 20)) throw protocolError("route-regeneration-path-invalid", `新生成陆路 #${String(route.id)} 穿越水域`);
    const points = array(route.points, "geography.route.points");
    if (points.length !== cells.length || points.some(point => !Array.isArray(point) || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1])))) {
      throw protocolError("regeneration-geometry-invalid", `新生成 route #${String(route.id)} 坐标无效`);
    }
    for (let index = 1; index < cells.length; index++) {
      if (cells[index] === cells[index - 1]) continue;
      const neighbors = sourceCells.c as unknown[] | undefined;
      if (!Array.isArray(neighbors?.[cells[index - 1]]) || !(neighbors?.[cells[index - 1]] as unknown[]).map(Number).includes(cells[index])) throw protocolError("route-topology-invalid", `route #${String(route.id)} 路径不连续`);
    }
  }
}

function validateRouteCellLinks(routes: unknown[], linksValue: unknown, packCount: number): void {
  const expectedOwners = new Map<string, Set<number>>();
  const expectedCells = new Set<string>();
  for (const value of routes) {
    if (!value) continue;
    const route = record(value, "geography.route-link.route");
    if (route.removed) continue;
    const id = Number(route.id);
    const cells = array(route.packCells, `geography.route-link.${id}.cells`).map(Number);
    for (let index = 0; index < cells.length - 1; index++) {
      const from = cells[index];
      const to = cells[index + 1];
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < 0 || from >= packCount || to >= packCount) throw protocolError("route-cell-link-invalid", `route #${id} cell link 越界`);
      const edgeKey = from <= to ? `${from}:${to}` : `${to}:${from}`;
      const owners = expectedOwners.get(edgeKey) || new Set<number>();
      owners.add(id);
      expectedOwners.set(edgeKey, owners);
      expectedCells.add(String(from));
      expectedCells.add(String(to));
    }
  }
  const links = record(linksValue, "geography.patch.pack.cells.routes");
  const fail = (): never => { throw protocolError("route-cell-link-mirror-invalid", "pack.cells.routes 与路线边镜像不一致"); };
  const actualCells = Object.keys(links);
  if (actualCells.length !== expectedCells.size || actualCells.some(cell => !expectedCells.has(cell))) fail();
  const actualEdges = new Set<string>();
  for (const fromKey of actualCells) {
    const from = Number(fromKey);
    if (!Number.isSafeInteger(from) || from < 0 || from >= packCount) fail();
    const fromLinks = record(links[fromKey], `geography.patch.pack.cells.routes.${fromKey}`);
    for (const [toKey, ownerValue] of Object.entries(fromLinks)) {
      const to = Number(toKey);
      const owner = Number(ownerValue);
      if (!Number.isSafeInteger(to) || to < 0 || to >= packCount || typeof ownerValue !== "number" || !Number.isSafeInteger(owner)) fail();
      const edgeKey = from <= to ? `${from}:${to}` : `${to}:${from}`;
      const owners = expectedOwners.get(edgeKey);
      if (!owners?.has(owner)) fail();
      const reverse = record(links[toKey], `geography.patch.pack.cells.routes.${toKey}`);
      if (reverse[fromKey] !== ownerValue) fail();
      actualEdges.add(edgeKey);
    }
  }
  if (actualEdges.size !== expectedOwners.size || [...expectedOwners.keys()].some(edgeKey => !actualEdges.has(edgeKey))) fail();
}

async function validateRiverMirrorsAsync(values: Map<string, unknown>, sourceMapValue: unknown, control: AsyncRiverValidationControl): Promise<void> {
  const expectationInput = createRiverLakeDrainageExpectationInput(values, sourceMapValue);
  const lakeExpectations = await createRiverLakeDrainageExpectationsAsync(
    expectationInput.sourceGrid,
    expectationInput.sourcePack,
    {...expectationInput.sourceOptions, riverRegenerationSalt: expectationInput.expectedRiverSalt},
    control
  );
  validateRiverMirrors(values, sourceMapValue, lakeExpectations.lakes as Map<number, UnknownRecord>);
}

function validateRiverMirrors(values: Map<string, unknown>, sourceMapValue: unknown, providedLakeExpectations: Map<number, UnknownRecord> | null = null): void {
  const riversDocument = record(values.get("rivers"), "geography.patch.rivers");
  const rivers = array(riversDocument.rivers, "geography.patch.rivers.rivers");
  const packRivers = array(values.get("pack.rivers"), "geography.patch.pack.rivers");
  const lockedRiverIds = regenerationLockedIds(sourceMapValue, "river");
  void packRivers;
  const sourceMap = record(sourceMapValue, "geography.sourceMap");
  const sourceGrid = record(sourceMap.grid, "geography.sourceMap.grid");
  const sourceGridCells = record(sourceGrid.cells, "geography.sourceMap.grid.cells");
  const sourcePack = record(sourceMap.pack, "geography.sourceMap.pack");
  const sourcePackCells = record(sourcePack.cells, "geography.sourceMap.pack.cells");
  const outputPackFeatures = array(values.get("pack.features"), "geography.patch.pack.features");
  const packNeighbors = sourcePackCells.c as unknown[] | undefined;
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
    if (isRegenerationLocked(lockedRiverIds, id)) continue;
    if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) throw protocolError("river-identity-invalid", "河流 ID 无效或重复");
    ids.add(id);
    const cells = array(river.cells, `geography.river.${id}.cells`).map(Number);
    if (!cells.some(cell => cell >= 0) || cells.some((cell, index) => !Number.isSafeInteger(cell) || cell < -1 || cell >= packCount || cell === -1 && index !== cells.length - 1)) throw protocolError("river-cell-invalid", `river #${id} cell 无效`);
    for (let index = 1; index < cells.length; index++) {
      const previous = cells[index - 1];
      const current = cells[index];
      if (current === -1) continue;
      if (previous < 0 || !Array.isArray(packNeighbors?.[previous]) || !(packNeighbors[previous] as unknown[]).map(Number).includes(current)) throw protocolError("river-topology-invalid", `river #${id} 路径不连续`);
    }
    const parent = Number(river.parent || 0);
    if (parent) parents.set(id, parent);
  }
  const cellRivers = indexedValues(values.get("pack.cells.r"), "geography.patch.pack.cells.r");
  const riverCells = new Map<number, Set<number>>();
  const riverCellSequences = new Map<number, number[]>();
  for (const value of rivers) {
    if (!value) continue;
    const river = record(value, "geography.river.mirror");
    if (river.removed) continue;
    const id = Number(river.i ?? river.id);
    if (isRegenerationLocked(lockedRiverIds, id)) continue;
    const cells = array(river.cells, "geography.river.mirror.cells").map(Number);
    riverCells.set(id, new Set(cells.filter(cell => cell >= 0)));
    riverCellSequences.set(id, cells);
  }
  const heights = indexedValues(sourcePackCells.h, "geography.sourceMap.pack.cells.h");
  const featureIds = indexedValues(sourcePackCells.f, "geography.sourceMap.pack.cells.f");
  const expectationInput = createRiverLakeDrainageExpectationInput(values, sourceMapValue);
  const lakeExpectations = providedLakeExpectations || createRiverLakeDrainageExpectations(
    expectationInput.sourceGrid,
    expectationInput.sourcePack,
    {...expectationInput.sourceOptions, riverRegenerationSalt: expectationInput.expectedRiverSalt}
  ).lakes as Map<number, UnknownRecord>;
  for (const [id, cells] of riverCellSequences) {
    const firstCell = cells.find(cell => cell >= 0);
    if (firstCell !== undefined && Number(heights[firstCell]) < 20) {
      const firstFeature = outputPackFeatures[Number(featureIds[firstCell])];
      if (!isPlainRecord(firstFeature) || firstFeature.type !== "lake") throw protocolError("river-regeneration-path-invalid", `新生成 river #${id} 从海洋水域起流`);
    }
    let enteredWaterTail = false;
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      if (cell < 0) continue;
      const water = Number(heights[cell]) < 20;
      if (water) enteredWaterTail = true;
      else if (enteredWaterTail) {
        const previousCell = cells[index - 1];
        const lakeId = Number(featureIds[previousCell]);
        const outputLake = isPlainRecord(outputPackFeatures[lakeId]) ? outputPackFeatures[lakeId] as UnknownRecord : null;
        const overflow = outputLake && isPlainRecord(outputLake.overflow) ? outputLake.overflow as UnknownRecord : null;
        const expectation = lakeExpectations.get(lakeId);
        const validLakeOutlet = Number.isSafeInteger(previousCell)
          && previousCell >= 0
          && outputLake?.type === "lake"
          && hasStrictIdentity(outputLake, lakeId)
          && expectation?.overflows === true
          && expectation.outCell === cell
          && outputLake.outlet === id
          && typeof outputLake.outlet === "number"
          && Number.isSafeInteger(outputLake.outlet)
          && overflow?.spillCell === cell
          && typeof overflow.spillCell === "number"
          && Number.isSafeInteger(overflow.spillCell)
          && JSON.stringify(normalizeValue(overflow)) === JSON.stringify(normalizeValue(expectation.overflow));
        if (!validLakeOutlet) throw protocolError("river-water-tail-invalid", `river #${id} 从水域重新进入陆地`);
        enteredWaterTail = false;
      }
    }
  }
}

function createRiverLakeDrainageExpectationInput(values: Map<string, unknown>, sourceMapValue: unknown): Readonly<{
  expectedRiverSalt: number;
  sourceGrid: UnknownRecord;
  sourceOptions: UnknownRecord;
  sourcePack: UnknownRecord;
}> {
  const sourceMap = record(sourceMapValue, "geography.sourceMap");
  const sourceGrid = record(sourceMap.grid, "geography.sourceMap.grid");
  const sourcePack = record(sourceMap.pack, "geography.sourceMap.pack");
  const sourceRegeneration = isPlainRecord(sourceMap.metadata) && isPlainRecord(sourceMap.metadata.regeneration) ? sourceMap.metadata.regeneration as UnknownRecord : {};
  const expectedRiverSalt = (Number(sourceRegeneration.rivers) || 0) + 1;
  const outputRiverSalt = values.get("metadata.regeneration.rivers");
  if (typeof outputRiverSalt !== "number" || !Number.isSafeInteger(outputRiverSalt) || outputRiverSalt !== expectedRiverSalt) throw protocolError("river-regeneration-salt-invalid", "河流重生成扰动序号与源地图不一致");
  const sourceOptions = isPlainRecord(sourceMap.options) ? sourceMap.options : {};
  return Object.freeze({expectedRiverSalt, sourceGrid, sourceOptions, sourcePack});
}

function hasStrictIdentity(value: UnknownRecord, expected: number): boolean {
  const hasI = Object.prototype.hasOwnProperty.call(value, "i");
  const hasId = Object.prototype.hasOwnProperty.call(value, "id");
  if (!hasI && !hasId) return false;
  if (hasI && (typeof value.i !== "number" || !Number.isSafeInteger(value.i) || value.i < 0 || value.i !== expected)) return false;
  if (hasId && (typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id < 0 || value.id !== expected)) return false;
  return true;
}

function lastRealCell(cells: number[] | undefined): number {
  if (!cells) return -1;
  for (let index = cells.length - 1; index >= 0; index--) if (cells[index] >= 0) return cells[index];
  return -1;
}

function validateMarkerResourceMirrors(values: Map<string, unknown>, sourceMapValue: unknown): void {
  const markersDocument = record(values.get("markers"), "geography.patch.markers");
  const markers = array(markersDocument.markers, "geography.patch.markers.markers");
  const sourcePackCells = record(record(record(sourceMapValue, "geography.sourceMap").pack, "geography.sourceMap.pack").cells, "geography.sourceMap.pack.cells");
  const sourceGrid = record(record(sourceMapValue, "geography.sourceMap").grid, "geography.sourceMap.grid");
  const sourceGridCells = record(sourceGrid.cells, "geography.sourceMap.grid.cells");
  const packCount = indexedLength(sourcePackCells.i, "geography.sourceMap.pack.cells.i");
  const gridCount = indexedLength(sourceGridCells.i ?? sourceGrid.points, "geography.sourceMap.grid.cells.i");
  for (const path of ["pack.cells.good", "pack.cells.goodSupply", "pack.cells.goodSource", "pack.cells.market", "pack.cells.pop", "pack.cells.s", "pack.cells.suitabilityBase", "pack.cells.suitabilityOverride"]) if (indexedLength(values.get(path), `geography.patch.${path}`) !== packCount) throw protocolError("marker-cell-length-invalid", `${path} 长度与源拓扑不一致`);
  const markerIds = new Set<string>();
  const lockedMarkerIds = regenerationLockedIds(sourceMapValue, "marker");
  for (const value of markers) {
    if (!value) continue;
    const marker = record(value, "geography.marker");
    if (marker.removed) continue;
    const id = String(marker.id ?? marker.i ?? "");
    if (isRegenerationLocked(lockedMarkerIds, id)) continue;
    const cell = Number(marker.cell);
    const packCell = Number(marker.packCell);
    if (!id || markerIds.has(id) || !Number.isSafeInteger(cell) || cell < 0 || cell >= gridCount || !Number.isSafeInteger(packCell) || packCell < 0 || packCell >= packCount) throw protocolError("marker-identity-invalid", "marker ID 重复或 cell 越界");
    if (!Number.isFinite(Number(marker.x)) || !Number.isFinite(Number(marker.y))) throw protocolError("regeneration-geometry-invalid", `新生成 marker #${id} 坐标无效`);
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

function featureReferenceObjects(map: UnknownRecord): Array<readonly [string, UnknownRecord]> {
  const pack = isPlainRecord(map.pack) ? map.pack : {};
  const settlements = isPlainRecord(map.settlements) ? map.settlements : {};
  const markers = isPlainRecord(map.markers) ? map.markers : {};
  const portDiagnostics = isPlainRecord(pack.portDiagnostics) ? pack.portDiagnostics : {};
  const collections: Array<readonly [string, unknown]> = [
    ["pack.burgs", pack.burgs], ["settlements.cities", settlements.cities], ["pack.routes", pack.routes],
    ["settlements.routes", settlements.routes], ["markers.markers", markers.markers], ["pack.portDiagnostics.features", portDiagnostics.features]
  ];
  const objects: Array<readonly [string, UnknownRecord]> = [];
  for (const [collection, value] of collections) for (const object of Array.isArray(value) ? value : []) if (isPlainRecord(object)) objects.push([collection, object]);
  return objects;
}

function validateIdentitySlots(rows: unknown[], code: string, lockedIds: ReadonlySet<string> = new Set()): void {
  for (let index = 0; index < rows.length; index++) {
    const value = rows[index];
    if (!value) continue;
    if (isRegenerationLocked(lockedIds, index)) continue;
    const row = record(value, `geography.identity.${index}`);
    if (row.removed) continue;
    if (Number(row.i ?? row.id) !== index) throw protocolError(code, `对象槽 #${index} 身份无效`);
  }
}

function validateCellFeatureReferences(cells: ArrayLike<unknown>, features: unknown[], code: string, lockedIds: ReadonlySet<string> = new Set()): void {
  for (let cell = 0; cell < cells.length; cell++) {
    const id = Number(cells[cell]);
    if (isRegenerationLocked(lockedIds, id)) continue;
    if (!Number.isSafeInteger(id) || id < 0 || id >= features.length || id > 0 && (!features[id] || record(features[id], `geography.feature.${id}`).removed)) throw protocolError(code, `cell #${cell} 指向无效 Feature #${id}`);
  }
}

function unlockedObjectRows(values: unknown[], lockedIds: ReadonlySet<string>): unknown[] {
  return values.map((value, index) => {
    if (!isPlainRecord(value)) return value;
    return isRegenerationLocked(lockedIds, value.i, value.id, index) ? null : value;
  });
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
