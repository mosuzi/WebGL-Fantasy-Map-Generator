import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {validatePreparedWorkerRenderBinding} from "../worker-render-binding.js";
import {SOCIETY_POLITICS_WRITE_SETS, societyPoliticsManifest} from "./manifest.js";

type UnknownRecord = Record<string, unknown>;
export type SocietyPoliticsWorkerKind = keyof typeof SOCIETY_POLITICS_WRITE_SETS;

type LegacyBinding = Readonly<{
  mapIdentity: string;
  mapRevision: number;
  topologyRevision: number;
  generationToken: number;
  lockFingerprint: string;
  operationId: number;
  operationName: string;
}>;

const workerTask = societyPoliticsManifest.workerTasks[0];

export function validateSocietyPoliticsWorkerOutput(input: {
  readonly kind: SocietyPoliticsWorkerKind;
  readonly binding: unknown;
  readonly renderBinding?: unknown;
  readonly output: unknown;
  readonly policy: unknown;
  readonly sourceMap: unknown;
}): Readonly<{binding: ComputeOperationBinding; kind: SocietyPoliticsWorkerKind; writeSet: readonly string[]}>
{
  const expectedPaths = SOCIETY_POLITICS_WRITE_SETS[input.kind];
  if (!expectedPaths || !workerTask.resultKinds.includes(input.kind)) {
    throw protocolError("society-politics-worker-kind-invalid", `社会行政 Worker 不支持 ${String(input.kind || "(empty)")}`);
  }
  const sourceBinding = validateLegacyBinding(input.binding, "society-politics.request.binding");
  const output = record(input.output, "society-politics.output");
  if (output.kind !== input.kind) throw protocolError("society-politics-worker-kind-mismatch", "社会行政 Worker 结果类型与请求不一致");
  assertSameBinding(output.binding, sourceBinding, "society-politics.output.binding");
  validatePreparedWorkerRenderBinding(output.preparedRender, input.renderBinding, {
    path: "society-politics.output.preparedRender",
    schemaCode: "society-politics-render-schema-invalid",
    invalidCode: "society-politics-render-binding-invalid",
    staleCode: "society-politics-render-binding-stale",
    label: "社会行政"
  });
  const result = record(output.result, "society-politics.output.result");
  if (typeof result.executed !== "boolean") throw protocolError("society-politics-worker-result-invalid", "社会行政 Worker 缺少 executed 结果");
  const writeSet = validatePatch(output.patch, input.kind, expectedPaths, input.policy, result.executed);
  if (result.executed) validateMirrors(input.kind, output.patch, input.sourceMap);
  return Object.freeze({binding: adaptBinding(sourceBinding), kind: input.kind, writeSet});
}

function adaptBinding(source: LegacyBinding): ComputeOperationBinding {
  const operationId = `society-politics:${source.operationId}`;
  return validateOperationBinding({
    bindingPhase: "pre-commit",
    bindingKind: "compute",
    operationId,
    transactionId: `${source.mapIdentity}:${operationId}:${source.mapRevision}:${source.topologyRevision}:${source.generationToken}`,
    operationName: source.operationName || "society-politics.regenerate",
    sourceRevision: adaptLegacyInteractiveRevision({
      mapIdentity: source.mapIdentity,
      mapRevision: source.mapRevision,
      topologyRevision: source.topologyRevision,
      domainRevisions: {"society-politics": source.mapRevision}
    }),
    generationToken: source.generationToken,
    lockFingerprint: source.lockFingerprint
  }, "society-politics.binding.core") as ComputeOperationBinding;
}

function validatePatch(value: unknown, kind: SocietyPoliticsWorkerKind, expectedPaths: readonly string[], policyValue: unknown, executed: boolean): readonly string[] {
  const patch = record(value, "society-politics.patch");
  const policy = record(policyValue, "society-politics.policy");
  if (patch.version !== 1 || patch.domain !== kind || policy.domain !== kind) {
    throw protocolError("society-politics-worker-patch-invalid", "社会行政 Worker patch 版本或领域无效");
  }
  const allowedPaths = stringArray(policy.allowedPaths, "society-politics.policy.allowedPaths");
  if (!sameStringSet(allowedPaths, expectedPaths)) {
    throw protocolError("society-politics-worker-policy-drift", `${kind} 主线程 policy 与 Manifest 写集漂移`);
  }
  const writeSet = stringArray(patch.writeSet, "society-politics.patch.writeSet", {allowEmpty: true});
  const operations = array(patch.operations, "society-politics.patch.operations");
  const operationPaths = operations.map((operation, index) => {
    const row = record(operation, `society-politics.patch.operations.${index}`);
    const parts = stringArray(row.path, `society-politics.patch.operations.${index}.path`);
    if (row.exists !== true && row.exists !== false || parts.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) {
      throw protocolError("society-politics-worker-operation-invalid", "社会行政 Worker patch operation 结构无效");
    }
    const path = parts.join(".");
    if (executed && (row.exists !== true || row.value === undefined || !validOperationValue(path, row.value))) {
      throw protocolError("society-politics-worker-operation-value-invalid", `社会行政 Worker patch 的 ${path} 缺少现存的合法值`);
    }
    return path;
  });
  if (!sameStringSet(writeSet, operationPaths) || new Set(writeSet).size !== writeSet.length) {
    throw protocolError("society-politics-worker-write-set-mismatch", "社会行政 Worker patch writeSet 与 operations 不一致");
  }
  if (executed ? !sameStringSet(writeSet, expectedPaths) : writeSet.length !== 0) {
    throw protocolError("society-politics-worker-write-set-incomplete", `${kind} patch 没有完整覆盖正式写集`);
  }
  return Object.freeze([...writeSet]);
}

function validateMirrors(kind: SocietyPoliticsWorkerKind, patchValue: unknown, sourceMapValue: unknown): void {
  const patch = record(patchValue, "society-politics.patch");
  const values = new Map<string, unknown>();
  for (const operation of array(patch.operations, "society-politics.patch.operations")) {
    const row = record(operation, "society-politics.patch.operation");
    values.set(stringArray(row.path, "society-politics.patch.operation.path").join("."), row.value);
  }
  if (kind === "religions") {
    assertDeepEqual(values.get("society.religions"), values.get("pack.religions"), "society-politics-religion-mirror-invalid", "society / pack religion 镜像不一致");
    return;
  }
  const politics = record(values.get("politics"), "society-politics.patch.politics");
  const states = array(politics.states, "society-politics.patch.politics.states");
  const provinces = array(politics.provinces, "society-politics.patch.politics.provinces");
  const packStates = array(values.get("pack.states"), "society-politics.patch.pack.states");
  const packProvinces = array(values.get("pack.provinces"), "society-politics.patch.pack.provinces");
  assertDeepEqual(states, packStates, "society-politics-state-mirror-invalid", "politics / pack state 镜像不一致");
  assertDeepEqual(provinces, packProvinces, "society-politics-province-mirror-invalid", "politics / pack province 镜像不一致");
  validateSocietyPoliticsAdministrativeReferences({
    states,
    provinces,
    settlements: values.get("settlements"),
    burgs: values.get("pack.burgs"),
    sourceMap: sourceMapValue
  });
}

export function validateSocietyPoliticsAdministrativeReferences(input: {
  readonly states: unknown;
  readonly provinces: unknown;
  readonly settlements: unknown;
  readonly burgs: unknown;
  readonly sourceMap: unknown;
  readonly allowUnclaimedZeroCapital?: boolean;
}): void {
  const values = new Map<string, unknown>([
    ["settlements", input.settlements],
    ["pack.burgs", input.burgs]
  ]);
  validateAdministrativeReferences(
    array(input.states, "society-politics.patch.politics.states"),
    array(input.provinces, "society-politics.patch.politics.provinces"),
    values,
    input.sourceMap,
    Boolean(input.allowUnclaimedZeroCapital)
  );
}

function validateAdministrativeReferences(states: unknown[], provinces: unknown[], values: Map<string, unknown>, sourceMapValue: unknown, allowUnclaimedZeroCapital = false): void {
  const sourceMap = record(sourceMapValue, "society-politics.sourceMap");
  const sourcePolitics = record(sourceMap.politics, "society-politics.sourceMap.politics");
  const sourceStates = indexAdministrativeRows(array(sourcePolitics.states, "society-politics.sourceMap.politics.states"));
  const sourceProvinces = indexAdministrativeRows(array(sourcePolitics.provinces, "society-politics.sourceMap.politics.provinces"));
  const settlements = record(values.get("settlements"), "society-politics.patch.settlements");
  const cities = array(settlements.cities, "society-politics.patch.settlements.cities");
  const burgs = array(values.get("pack.burgs"), "society-politics.patch.pack.burgs");
  const cityByBurg = new Map<number, UnknownRecord>();
  const stateCityClaims = new Map<number, UnknownRecord[]>();
  const provinceCityClaims = new Map<number, UnknownRecord[]>();
  const stateBurgClaims = new Map<number, UnknownRecord[]>();
  const provinceBurgClaims = new Map<number, UnknownRecord[]>();
  for (const value of cities) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const city = value as UnknownRecord;
    if (city.removed || !Number.isSafeInteger(Number(city.burgId))) continue;
    const burgId = Number(city.burgId);
    if (cityByBurg.has(burgId)) throw protocolError("society-politics-capital-identity-invalid", `burg #${burgId} 被多个 city 身份占用`);
    cityByBurg.set(burgId, city);
    if (Boolean(city.capital)) addClaim(stateCityClaims, Number(city.state), city);
    if (Boolean(city.provincial)) addClaim(provinceCityClaims, Number(city.province), city);
  }
  for (const value of burgs) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const burg = value as UnknownRecord;
    if (burg.removed) continue;
    if (Boolean(burg.capital)) addClaim(stateBurgClaims, Number(burg.state), burg);
    if (Boolean(burg.provincial)) addClaim(provinceBurgClaims, Number(burg.province), burg);
  }
  const activeStates = indexAdministrativeRows(states);
  const activeProvinces = indexAdministrativeRows(provinces);
  for (const value of states) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const state = value as UnknownRecord;
    const id = Number(state.i ?? state.id);
    const burgId = Number(state.capital || 0);
    if (!id || state.removed) continue;
    const cityClaims = stateCityClaims.get(id) || [];
    const burgClaims = stateBurgClaims.get(id) || [];
    if (!burgId) {
      const source = sourceStates.get(id);
      if (cityClaims.length || burgClaims.length || !allowUnclaimedZeroCapital && Number(source?.capital || 0) !== 0) {
        throw protocolError("society-politics-state-capital-invalid", `国家 #${id} 的零首都缺少受锁 before-image 或仍有首都反向引用`);
      }
      continue;
    }
    const city = cityByBurg.get(burgId);
    const burg = burgs[burgId] as UnknownRecord | null;
    if (!city || !burg || cityClaims.length !== 1 || burgClaims.length !== 1 || cityClaims[0] !== city || burgClaims[0] !== burg
      || Number(city.state) !== id || Number(burg.state) !== id || !Boolean(city.capital) || !Boolean(burg.capital)
      || Number(state.center) !== Number(city.packCell) || Number(state.gridCenter) !== Number(city.cell)) {
      throw protocolError("society-politics-state-capital-invalid", `国家 #${id} 的首都与 city / burg / center 镜像不一致`);
    }
  }
  for (const value of provinces) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const province = value as UnknownRecord;
    const id = Number(province.i ?? province.id);
    const burgId = Number(province.burg || 0);
    if (!id || province.removed) continue;
    const cityClaims = provinceCityClaims.get(id) || [];
    const burgClaims = provinceBurgClaims.get(id) || [];
    if (!burgId) {
      const source = sourceProvinces.get(id);
      if (cityClaims.length || burgClaims.length || !allowUnclaimedZeroCapital && Number(source?.burg || 0) !== 0) {
        throw protocolError("society-politics-province-capital-invalid", `省份 #${id} 的零省会缺少受锁 before-image 或仍有省会反向引用`);
      }
      continue;
    }
    const city = cityByBurg.get(burgId);
    const burg = burgs[burgId] as UnknownRecord | null;
    if (!city || !burg || cityClaims.length !== 1 || burgClaims.length !== 1 || cityClaims[0] !== city || burgClaims[0] !== burg
      || Number(city.province) !== id || Number(burg.province) !== id || !Boolean(city.provincial) || !Boolean(burg.provincial)
      || Number(province.state) !== Number(city.state) || Number(province.center) !== Number(city.packCell)
      || Number(province.gridCenter) !== Number(city.cell)) {
      throw protocolError("society-politics-province-capital-invalid", `省份 #${id} 的省会与 city / burg / center 镜像不一致`);
    }
  }
  assertNoOrphanClaims(stateCityClaims, activeStates, "capital", "society-politics-state-capital-invalid");
  assertNoOrphanClaims(stateBurgClaims, activeStates, "capital", "society-politics-state-capital-invalid");
  assertNoOrphanClaims(provinceCityClaims, activeProvinces, "burg", "society-politics-province-capital-invalid");
  assertNoOrphanClaims(provinceBurgClaims, activeProvinces, "burg", "society-politics-province-capital-invalid");
}

function validOperationValue(path: string, value: unknown): boolean {
  if (path.endsWith(".metadata.stale")) return typeof value === "boolean";
  if (path.startsWith("metadata.regeneration.")) return typeof value === "number" && Number.isFinite(value);
  if (["generationLog", "society.religions", "pack.religions", "pack.states", "pack.provinces", "pack.burgs", "pack.routes"].includes(path)) return Array.isArray(value);
  if (path.startsWith("grid.cells.") || path.startsWith("pack.cells.") && path !== "pack.cells.routes") return Array.isArray(value) || isTypedArray(value);
  return isPlainRecord(value);
}

function isTypedArray(value: unknown): boolean {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function indexAdministrativeRows(rows: unknown[]): Map<number, UnknownRecord> {
  const indexed = new Map<number, UnknownRecord>();
  for (const value of rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as UnknownRecord;
    const id = Number(row.i ?? row.id);
    if (id > 0 && !row.removed) indexed.set(id, row);
  }
  return indexed;
}

function addClaim(target: Map<number, UnknownRecord[]>, id: number, value: UnknownRecord): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw protocolError("society-politics-capital-reference-invalid", "首府标记缺少有效行政归属");
  const claims = target.get(id) || [];
  claims.push(value);
  target.set(id, claims);
}

function assertNoOrphanClaims(claims: Map<number, UnknownRecord[]>, rows: Map<number, UnknownRecord>, field: "capital" | "burg", code: string): void {
  for (const [id, values] of claims) {
    if (!rows.has(id) || values.length !== 1 || Number(rows.get(id)?.[field] || 0) <= 0) {
      throw protocolError(code, `行政对象 #${id} 存在孤立或重复首府反向引用`);
    }
  }
}

function validateLegacyBinding(value: unknown, path: string): LegacyBinding {
  const source = record(value, path);
  const binding = {
    mapIdentity: typeof source.mapIdentity === "string" ? source.mapIdentity : "",
    mapRevision: Number(source.mapRevision),
    topologyRevision: Number(source.topologyRevision),
    generationToken: Number(source.generationToken),
    lockFingerprint: typeof source.lockFingerprint === "string" ? source.lockFingerprint : "",
    operationId: Number(source.operationId),
    operationName: typeof source.operationName === "string" ? source.operationName : ""
  };
  if (!binding.mapIdentity || !Number.isSafeInteger(binding.mapRevision) || binding.mapRevision < 0
    || !Number.isSafeInteger(binding.topologyRevision) || binding.topologyRevision < 0
    || !Number.isSafeInteger(binding.generationToken) || binding.generationToken < 0
    || !Number.isSafeInteger(binding.operationId) || binding.operationId < 0 || !binding.lockFingerprint) {
    throw protocolError("society-politics-worker-binding-invalid", `${path} 缺少 identity / revision / topology / token / lock 指纹`);
  }
  return Object.freeze(binding);
}

function assertSameBinding(value: unknown, expected: LegacyBinding, path: string): void {
  const actual = validateLegacyBinding(value, path);
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision", "generationToken", "lockFingerprint", "operationId", "operationName"] as const) {
    if (actual[key] !== expected[key]) throw protocolError("society-politics-worker-binding-stale", `${path}.${key} 与请求不一致`);
  }
}

function assertDeepEqual(left: unknown, right: unknown, code: string, message: string): void {
  if (stable(left) !== stable(right)) throw protocolError(code, message);
}

function stable(value: unknown): string {
  return JSON.stringify(sortPlain(value)) ?? "undefined";
}

function sortPlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPlain);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as UnknownRecord).sort().map(key => [key, sortPlain((value as UnknownRecord)[key])]));
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw protocolError("society-politics-record-required", `${path} 必须是对象`);
  return value as UnknownRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw protocolError("society-politics-array-required", `${path} 必须是数组`);
  return value;
}

function stringArray(value: unknown, path: string, options: {allowEmpty?: boolean} = {}): string[] {
  const values = array(value, path);
  if (!options.allowEmpty && !values.length || values.some(item => typeof item !== "string" || !item)) {
    throw protocolError("society-politics-string-array-required", `${path} 必须是${options.allowEmpty ? "" : "非空"}字符串数组`);
  }
  return values as string[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value));
}

function protocolError(code: string, message: string): Error & {code: string} {
  return Object.assign(new Error(message), {code});
}
