import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {validatePreparedWorkerRenderBinding} from "../worker-render-binding.js";
import {SETTLEMENTS_WORKER_WRITE_SET, settlementsManifest} from "./manifest.js";
import {ZONES_WORKER_WRITE_SET, zonesManifest} from "../zones/manifest.js";
import {isRegenerationLocked, regenerationLockedIds} from "../regeneration-validation-locks.js";

type UnknownRecord = Record<string, unknown>;
export type SettlementZoneWorkerKind = "cities" | "zones";

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
  cities: settlementsManifest.workerTasks[0],
  zones: zonesManifest.workerTasks[0]
});
const writeSetByKind = Object.freeze({cities: SETTLEMENTS_WORKER_WRITE_SET, zones: ZONES_WORKER_WRITE_SET});

export function validateSettlementZoneWorkerOutput(input: {
  readonly kind: SettlementZoneWorkerKind;
  readonly binding: unknown;
  readonly renderBinding?: unknown;
  readonly output: unknown;
  readonly policy: unknown;
  readonly sourceMap: unknown;
}): Readonly<{binding: ComputeOperationBinding; kind: SettlementZoneWorkerKind; writeSet: readonly string[]}> {
  const descriptor = descriptorByKind[input.kind];
  const expectedPaths = writeSetByKind[input.kind];
  if (!descriptor || !expectedPaths || !descriptor.resultKinds.includes(input.kind as never)) {
    throw protocolError("settlement-zone-worker-kind-invalid", `城镇地区 Worker 不支持 ${String(input.kind || "(empty)")}`);
  }
  const sourceBinding = validateLegacyBinding(input.binding, "settlement-zone.request.binding");
  const output = record(input.output, "settlement-zone.output");
  if (output.kind !== input.kind) throw protocolError("settlement-zone-worker-kind-mismatch", "城镇地区 Worker 结果类型与请求不一致");
  assertSameBinding(output.binding, sourceBinding, "settlement-zone.output.binding");
  validatePreparedWorkerRenderBinding(output.preparedRender, input.renderBinding, {
    path: "settlement-zone.preparedRender",
    schemaCode: "settlement-zone-render-schema-invalid",
    invalidCode: "settlement-zone-render-binding-invalid",
    staleCode: "settlement-zone-render-binding-stale",
    label: "城镇地区"
  });
  const result = record(output.result, "settlement-zone.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("settlement-zone-worker-result-invalid", "城镇地区 Worker 缺少 executed 结果");
  const values = validatePatch(output.patch, input.kind, expectedPaths, input.policy, result.executed);
  if (result.executed) input.kind === "cities" ? validateSettlementCityMirrors(values, input.sourceMap) : validateZoneMirrors(values, input.sourceMap);
  return Object.freeze({binding: adaptBinding(input.kind, sourceBinding), kind: input.kind, writeSet: Object.freeze([...values.keys()])});
}

function adaptBinding(kind: SettlementZoneWorkerKind, source: LegacyBinding): ComputeOperationBinding {
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
  }, "settlement-zone.binding.core") as ComputeOperationBinding;
}

function validatePatch(value: unknown, kind: SettlementZoneWorkerKind, expectedPaths: readonly string[], policyValue: unknown, executed: boolean): Map<string, unknown> {
  const patch = record(value, "settlement-zone.patch");
  const policy = record(policyValue, "settlement-zone.policy");
  if (patch.version !== 1 || patch.domain !== kind || policy.domain !== kind) {
    throw protocolError("settlement-zone-worker-patch-invalid", "城镇地区 Worker patch 版本或领域无效");
  }
  const allowedPaths = stringArray(policy.allowedPaths, "settlement-zone.policy.allowedPaths");
  if (!sameStringSet(allowedPaths, expectedPaths)) {
    throw protocolError("settlement-zone-worker-policy-drift", `${kind} 主线程 policy 与 Manifest 写集漂移`);
  }
  const writeSet = stringArray(patch.writeSet, "settlement-zone.patch.writeSet", true);
  const operations = array(patch.operations, "settlement-zone.patch.operations");
  const values = new Map<string, unknown>();
  for (let index = 0; index < operations.length; index++) {
    const row = record(operations[index], `settlement-zone.patch.operations.${index}`);
    const parts = stringArray(row.path, `settlement-zone.patch.operations.${index}.path`);
    if (row.exists !== true && row.exists !== false || parts.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) {
      throw protocolError("settlement-zone-worker-operation-invalid", "城镇地区 Worker patch operation 结构无效");
    }
    const path = parts.join(".");
    if (executed && !validOperationValue(path, row.exists, row.value)) {
      throw protocolError("settlement-zone-worker-operation-value-invalid", `城镇地区 Worker patch 的 ${path} 值或容器无效`);
    }
    values.set(path, row.value);
  }
  if (!sameStringSet(writeSet, [...values.keys()]) || values.size !== writeSet.length) {
    throw protocolError("settlement-zone-worker-write-set-mismatch", "城镇地区 Worker patch writeSet 与 operations 不一致");
  }
  const requiredPaths = kind === "zones" ? expectedPaths.filter(path => path !== "zones.metadata.stale") : expectedPaths;
  if (executed ? !sameStringSet(writeSet, requiredPaths) : writeSet.length !== 0) {
    throw protocolError("settlement-zone-worker-write-set-incomplete", `${kind} patch 没有完整覆盖正式写集`);
  }
  return values;
}

function validOperationValue(path: string, exists: unknown, value: unknown): boolean {
  if (exists === false) return path === "metadata.derivedStale" && value === undefined;
  if (exists !== true || value === undefined) return false;
  if (path.endsWith(".metadata.stale")) return typeof value === "boolean";
  if (path.startsWith("metadata.regeneration.")) return typeof value === "number" && Number.isFinite(value);
  if (path === "generationLog" || ["pack.burgs", "pack.routes", "pack.states", "pack.provinces", "pack.zones"].includes(path)) return Array.isArray(value);
  if (["grid.cells.burg", "pack.cells.burg", "pack.cells.state", "pack.cells.province"].includes(path)) return Array.isArray(value) || isTypedArray(value);
  return isPlainRecord(value);
}

export function validateSettlementCityMirrors(values: Map<string, unknown>, sourceMapValue: unknown): void {
  const settlements = record(values.get("settlements"), "settlement-zone.patch.settlements");
  const cities = array(settlements.cities, "settlement-zone.patch.settlements.cities");
  array(values.get("pack.burgs"), "settlement-zone.patch.pack.burgs");
  const gridBurgs = indexedValues(values.get("grid.cells.burg"), "settlement-zone.patch.grid.cells.burg");
  const packBurgs = indexedValues(values.get("pack.cells.burg"), "settlement-zone.patch.pack.cells.burg");
  const sourceMap = record(sourceMapValue, "settlement-zone.sourceMap");
  const sourceGrid = record(sourceMap.grid, "settlement-zone.sourceMap.grid");
  const sourceGridCells = record(sourceGrid.cells, "settlement-zone.sourceMap.grid.cells");
  const sourcePack = record(sourceMap.pack, "settlement-zone.sourceMap.pack");
  const sourcePackCells = record(sourcePack.cells, "settlement-zone.sourceMap.pack.cells");
  const gridCellCount = indexedLength(sourceGridCells.i ?? sourceGrid.points, "settlement-zone.sourceMap.grid.cells.i");
  const packCellCount = indexedLength(sourcePackCells.i, "settlement-zone.sourceMap.pack.cells.i");
  const lockedCityIds = regenerationLockedIds(sourceMapValue, "city");
  if (gridBurgs.length !== gridCellCount || packBurgs.length !== packCellCount) {
    throw protocolError("settlement-cell-mirror-length-invalid", "城镇单元镜像长度与源拓扑不一致");
  }
  const claimedBurgs = new Set<number>();
  for (let cityId = 0; cityId < cities.length; cityId++) {
    const value = cities[cityId];
    if (!value) continue;
    if (isRegenerationLocked(lockedCityIds, cityId)) continue;
    const city = record(value, `settlement-zone.city.${cityId}`);
    if (city.removed) continue;
    const burgId = Number(city.burgId);
    if (Number(city.id) !== cityId || !Number.isSafeInteger(burgId) || burgId < 0 || claimedBurgs.has(burgId)) {
      throw protocolError("settlement-city-identity-invalid", `city #${cityId} 身份槽或 burg 引用无效`);
    }
    const gridCell = Number(city.cell);
    const packCell = Number(city.packCell);
    const x = Number(city.x);
    const y = Number(city.y);
    if (!Number.isSafeInteger(gridCell) || gridCell < 0 || gridCell >= gridCellCount
      || !Number.isSafeInteger(packCell) || packCell < 0 || packCell >= packCellCount) throw protocolError("regeneration-geometry-invalid", `新生成 city #${cityId} cell 无效`);
    if (Number(indexedValues(sourcePackCells.h, "settlement-zone.sourceMap.pack.cells.h")[packCell]) < 20) {
      throw protocolError("city-regeneration-water-anchor", `新生成 city #${cityId} 位于水域`);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw protocolError("regeneration-geometry-invalid", `新生成 city #${cityId} 坐标无效`);
    claimedBurgs.add(burgId);
  }
}

export function validateSettlementRouteMirrors(routes: unknown[], packRoutes: unknown[], lockedIds: ReadonlySet<string> = new Set()): void {
  for (let index = 0; index < routes.length; index++) {
    if (isRegenerationLocked(lockedIds, index)) continue;
    const routeValue = routes[index];
    const packValue = packRoutes[index];
    if (!routeValue && !packValue) continue;
    const route = record(routeValue, `settlement-zone.route.${index}`);
    const pack = record(packValue, `settlement-zone.packRoute.${index}`);
    if (route.removed || pack.removed) {
      if (Boolean(route.removed) !== Boolean(pack.removed)) throw protocolError("settlement-route-mirror-invalid", `route #${index} 删除标记不一致`);
      continue;
    }
    if (Number(route.id) !== index || Number(pack.i) !== index
      || normalRouteType(route.type) !== normalRouteType(pack.group)
      || Number(route.from) !== Number(pack.from) || Number(route.to) !== Number(pack.to)
      || Number(route.feature || 0) !== Number(pack.feature || 0)
      || Number(route.state || 0) !== Number(pack.state || 0)
      || Number(route.province || 0) !== Number(pack.province || 0)
      || Boolean(route.fromProvincial) !== Boolean(pack.fromProvincial)
      || Boolean(route.toProvincial) !== Boolean(pack.toProvincial)
      || String(route.administrativePriority || "") !== String(pack.administrativePriority || "")
      || Number(route.resourceCells || 0) !== Number(pack.resourceCells || 0)
      || Number(route.markerResourceCells || 0) !== Number(pack.markerResourceCells || 0)) {
      throw protocolError("settlement-route-mirror-invalid", `route #${index} 身份或端点镜像不一致`);
    }
    const points = array(route.points, `settlement-zone.route.${index}.points`);
    const packPoints = array(pack.points, `settlement-zone.packRoute.${index}.points`);
    const packCells = array(route.packCells, `settlement-zone.route.${index}.packCells`);
    if (points.length !== packPoints.length || points.length !== packCells.length) throw protocolError("settlement-route-mirror-invalid", `route #${index} 几何长度不一致`);
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      const point = array(points[pointIndex], `settlement-zone.route.${index}.points.${pointIndex}`);
      const packPoint = array(packPoints[pointIndex], `settlement-zone.packRoute.${index}.points.${pointIndex}`);
      if (Number(point[0]) !== Number(packPoint[0]) || Number(point[1]) !== Number(packPoint[1]) || Number(packCells[pointIndex]) !== Number(packPoint[2])) {
        throw protocolError("settlement-route-mirror-invalid", `route #${index} 几何镜像不一致`);
      }
    }
  }
}

export function validateZoneMirrors(values: Map<string, unknown>, sourceMapValue: unknown): void {
  const zones = record(values.get("zones"), "settlement-zone.patch.zones");
  const rows = array(zones.zones, "settlement-zone.patch.zones.zones");
  const packRows = array(values.get("pack.zones"), "settlement-zone.patch.pack.zones");
  const sourceMap = record(sourceMapValue, "settlement-zone.sourceMap");
  const sourcePack = record(sourceMap.pack, "settlement-zone.sourceMap.pack");
  const sourcePackCells = record(sourcePack.cells, "settlement-zone.sourceMap.pack.cells");
  const packCellCount = indexedLength(sourcePackCells.i, "settlement-zone.sourceMap.pack.cells.i");
  const lockedZoneIds = regenerationLockedIds(sourceMapValue, "zone");
  const zoneIds = new Set<number>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row) continue;
    const zone = record(row, `settlement-zone.zone.${index}`);
    if (isRegenerationLocked(lockedZoneIds, zone.i, zone.id, index)) continue;
    if (zone.removed) continue;
    const hasZoneI = zone.i !== undefined;
    const hasZoneId = zone.id !== undefined;
    if ((!hasZoneI && !hasZoneId)
      || hasZoneI && (typeof zone.i !== "number" || !Number.isSafeInteger(zone.i) || zone.i < 0)
      || hasZoneId && (typeof zone.id !== "number" || !Number.isSafeInteger(zone.id) || zone.id < 0)) {
      throw protocolError("zone-identity-invalid", `zone row #${index} 身份无效`);
    }
    const zoneId = (hasZoneI ? zone.i : zone.id) as number;
    if (zoneIds.has(zoneId) || hasZoneI && hasZoneId && zone.i !== zone.id) {
      throw protocolError("zone-identity-invalid", `zone row #${index} 身份无效`);
    }
    zoneIds.add(zoneId);
    if (!Array.isArray(zone.cells) || new Set(zone.cells.map(Number)).size !== zone.cells.length
      || zone.cells.some(cell => !Number.isSafeInteger(Number(cell)) || Number(cell) < 0 || Number(cell) >= packCellCount)) {
      throw protocolError("zone-cells-invalid", `zone #${index} cells 无效`);
    }
  }
}

function indexedValues(value: unknown, path: string): ArrayLike<unknown> {
  if (!Array.isArray(value) && !isTypedArray(value)) throw protocolError("settlement-zone-indexed-values-required", `${path} 必须是数组或 TypedArray`);
  return value as ArrayLike<unknown>;
}

function indexedLength(value: unknown, path: string): number {
  return indexedValues(value, path).length;
}

function validateLegacyBinding(value: unknown, path: string): LegacyBinding {
  const source = record(value, path);
  const binding = {
    mapIdentity: typeof source.mapIdentity === "string" ? source.mapIdentity : "",
    mapRevision: Number(source.mapRevision), topologyRevision: Number(source.topologyRevision), generationToken: Number(source.generationToken),
    lockFingerprint: typeof source.lockFingerprint === "string" ? source.lockFingerprint : "",
    operationId: Number(source.operationId), operationName: typeof source.operationName === "string" ? source.operationName : ""
  };
  if (!binding.mapIdentity || !binding.lockFingerprint || ![binding.mapRevision, binding.topologyRevision, binding.generationToken, binding.operationId].every(item => Number.isSafeInteger(item) && item >= 0)) {
    throw protocolError("settlement-zone-worker-binding-invalid", `${path} 缺少 identity / revision / topology / token / lock 指纹`);
  }
  return Object.freeze(binding);
}

function assertSameBinding(value: unknown, expected: LegacyBinding, path: string): void {
  const actual = validateLegacyBinding(value, path);
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision", "generationToken", "lockFingerprint", "operationId", "operationName"] as const) {
    if (actual[key] !== expected[key]) throw protocolError("settlement-zone-worker-binding-stale", `${path}.${key} 与请求不一致`);
  }
}

function normalRouteType(value: unknown): string {
  const text = String(value || "").toLowerCase();
  if (text === "road") return "roads";
  if (text === "trail") return "trails";
  if (text === "sea" || text === "searoute") return "searoutes";
  return text;
}

function isTypedArray(value: unknown): boolean {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value: unknown, path: string): UnknownRecord {
  if (!isPlainRecord(value)) throw protocolError("settlement-zone-record-required", `${path} 必须是普通对象`);
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw protocolError("settlement-zone-array-required", `${path} 必须是数组`);
  return value;
}

function denseArray(value: unknown, path: string): unknown[] {
  const rows = array(value, path);
  for (let index = 0; index < rows.length; index++) if (!Object.prototype.hasOwnProperty.call(rows, index)) throw protocolError("settlement-zone-array-hole-invalid", `${path} 存在 hole #${index}`);
  return rows;
}

function stringArray(value: unknown, path: string, allowEmpty = false): string[] {
  const values = array(value, path);
  if (!allowEmpty && !values.length || values.some(item => typeof item !== "string" || !item)) throw protocolError("settlement-zone-string-array-required", `${path} 必须是${allowEmpty ? "" : "非空"}字符串数组`);
  return values as string[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value));
}

function assertDeepEqual(left: unknown, right: unknown, code: string, message: string): void {
  if ((JSON.stringify(left) ?? "undefined") !== (JSON.stringify(right) ?? "undefined")) throw protocolError(code, message);
}

function protocolError(code: string, message: string): Error & {code: string} {
  return Object.assign(new Error(message), {code});
}
