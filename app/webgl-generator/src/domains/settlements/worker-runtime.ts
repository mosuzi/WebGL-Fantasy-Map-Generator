import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {SETTLEMENTS_WORKER_WRITE_SET, settlementsManifest} from "./manifest.js";
import {ZONES_WORKER_WRITE_SET, zonesManifest} from "../zones/manifest.js";

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
  readonly output: unknown;
  readonly policy: unknown;
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
  validatePreparedRender(output.preparedRender, sourceBinding);
  const result = record(output.result, "settlement-zone.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("settlement-zone-worker-result-invalid", "城镇地区 Worker 缺少 executed 结果");
  const values = validatePatch(output.patch, input.kind, expectedPaths, input.policy, result.executed);
  if (result.executed) input.kind === "cities" ? validateCityMirrors(values) : validateZoneMirrors(values);
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

function validateCityMirrors(values: Map<string, unknown>): void {
  const settlements = record(values.get("settlements"), "settlement-zone.patch.settlements");
  const politics = record(values.get("politics"), "settlement-zone.patch.politics");
  const cities = denseArray(settlements.cities, "settlement-zone.patch.settlements.cities");
  const routes = denseArray(settlements.routes, "settlement-zone.patch.settlements.routes");
  const burgs = denseArray(values.get("pack.burgs"), "settlement-zone.patch.pack.burgs");
  validateRouteMirrors(routes, denseArray(values.get("pack.routes"), "settlement-zone.patch.pack.routes"));
  assertDeepEqual(politics.states, values.get("pack.states"), "settlement-politics-mirror-invalid", "politics / pack state 镜像不一致");
  assertDeepEqual(politics.provinces, values.get("pack.provinces"), "settlement-politics-mirror-invalid", "politics / pack province 镜像不一致");
  const claimedBurgs = new Set<number>();
  for (let cityId = 0; cityId < cities.length; cityId++) {
    const value = cities[cityId];
    if (!value) continue;
    const city = record(value, `settlement-zone.city.${cityId}`);
    if (city.removed) continue;
    const burgId = Number(city.burgId);
    if (Number(city.id) !== cityId || !Number.isSafeInteger(burgId) || burgId < 0 || claimedBurgs.has(burgId)) {
      throw protocolError("settlement-city-identity-invalid", `city #${cityId} 身份槽或 burg 引用无效`);
    }
    const burg = record(burgs[burgId], `settlement-zone.burg.${burgId}`);
    if (Number(burg.i) !== burgId || Number(burg.id) !== burgId || Number(burg.cityId) !== cityId || Number(city.packCell) !== Number(burg.cell)) {
      throw protocolError("settlement-city-burg-mirror-invalid", `city #${cityId} 与 burg #${burgId} 身份镜像不一致`);
    }
    for (const key of ["name", "state", "province", "population", "capital", "provincial", "port"] as const) {
      const cityValue = ["capital", "provincial", "port"].includes(key) ? Number(city[key] || 0) : city[key];
      const burgValue = ["capital", "provincial", "port"].includes(key) ? Number(burg[key] || 0) : burg[key];
      if (cityValue !== burgValue) {
        throw protocolError("settlement-city-burg-mirror-invalid", `city #${cityId} 与 burg #${burgId} 的 ${key} 镜像不一致`);
      }
    }
    claimedBurgs.add(burgId);
  }
  for (let burgId = 0; burgId < burgs.length; burgId++) {
    const value = burgs[burgId];
    if (!value || burgId === 0) continue;
    const burg = record(value, `settlement-zone.burg.${burgId}`);
    if (burg.removed) continue;
    const cityId = Number(burg.cityId);
    if (!Number.isSafeInteger(cityId) || cityId < 0 || !cities[cityId] || !claimedBurgs.has(burgId)) {
      throw protocolError("settlement-burg-city-mirror-invalid", `burg #${burgId} 没有唯一 city 身份镜像`);
    }
  }
}

function validateRouteMirrors(routes: unknown[], packRoutes: unknown[]): void {
  if (routes.length !== packRoutes.length) throw protocolError("settlement-route-mirror-invalid", "settlements / pack route 槽数不一致");
  for (let index = 0; index < routes.length; index++) {
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
      || Number(route.from) !== Number(pack.from) || Number(route.to) !== Number(pack.to)) {
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

function validateZoneMirrors(values: Map<string, unknown>): void {
  const zones = record(values.get("zones"), "settlement-zone.patch.zones");
  const rows = denseArray(zones.zones, "settlement-zone.patch.zones.zones");
  const packRows = denseArray(values.get("pack.zones"), "settlement-zone.patch.pack.zones");
  assertDeepEqual(rows, packRows, "zone-pack-mirror-invalid", "zones / pack zone 镜像不一致");
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row) continue;
    const zone = record(row, `settlement-zone.zone.${index}`);
    if (zone.removed) continue;
    if (Number(zone.i) !== index) throw protocolError("zone-identity-invalid", `zone #${index} 身份槽无效`);
    if (!Array.isArray(zone.cells) || zone.cells.some(cell => !Number.isSafeInteger(Number(cell)) || Number(cell) < 0)) {
      throw protocolError("zone-cells-invalid", `zone #${index} cells 无效`);
    }
  }
}

function validatePreparedRender(value: unknown, expected: LegacyBinding): void {
  if (value === undefined || value === null) return;
  const prepared = record(value, "settlement-zone.preparedRender");
  if (prepared.schemaVersion !== 1) throw protocolError("settlement-zone-render-schema-invalid", "城镇地区 renderer source schema 无效");
  const binding = record(prepared.binding, "settlement-zone.preparedRender.binding");
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision"] as const) {
    if ((binding[key] ?? "") !== (expected[key] ?? "")) throw protocolError("settlement-zone-render-binding-stale", `renderer source ${key} 与请求不一致`);
  }
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
