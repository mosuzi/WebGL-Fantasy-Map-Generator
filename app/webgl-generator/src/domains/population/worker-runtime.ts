import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {populationManifest} from "./manifest.js";

type UnknownRecord = Record<string, unknown>;

export type LegacyPopulationWorkerBinding = Readonly<{
  mapIdentity: string;
  mapRevision: number;
  generationToken: number;
  lockFingerprint: string;
  operationId: number;
  operationName: string;
}>;

export type PopulationWorkerExpectation = Readonly<{
  kind: "population";
  requestKind: "adjustment" | "transfer";
  sourceFingerprint: string;
}> | Readonly<{
  kind: "population-history";
  requestKind: "adjustment" | "transfer";
  action: "undo" | "redo";
}>;

const workerTask = populationManifest.workerTasks[0];
const manifestWriteSet = Object.freeze([...workerTask.writeSet]);

export function adaptPopulationWorkerBinding(value: unknown): ComputeOperationBinding {
  const legacy = validateLegacyBinding(value, "population.binding");
  const operationId = `population:${legacy.operationId}`;
  const binding = validateOperationBinding({
    bindingPhase: "pre-commit",
    bindingKind: "compute",
    operationId,
    transactionId: `${legacy.mapIdentity}:${operationId}:${legacy.mapRevision}:${legacy.generationToken}`,
    operationName: legacy.operationName,
    sourceRevision: adaptLegacyInteractiveRevision({
      mapIdentity: legacy.mapIdentity,
      mapRevision: legacy.mapRevision,
      topologyRevision: 0,
      domainRevisions: {population: legacy.mapRevision}
    }),
    generationToken: legacy.generationToken,
    lockFingerprint: legacy.lockFingerprint
  }, "population.binding.core");
  if (binding.bindingPhase !== "pre-commit" || binding.bindingKind !== "compute") {
    throw protocolError("population-worker-core-binding-invalid", "人口 Worker 必须适配为 compute pre-commit binding");
  }
  return binding as ComputeOperationBinding;
}

export function validatePopulationWorkerOutput(input: {
  readonly binding: unknown;
  readonly output: unknown;
  readonly expectation: PopulationWorkerExpectation;
}): Readonly<{
  binding: ComputeOperationBinding;
  resultKind: PopulationWorkerExpectation["kind"];
  writeSet: readonly string[];
}> {
  const legacyBinding = validateLegacyBinding(input.binding, "population.request.binding");
  const coreBinding = adaptPopulationWorkerBinding(legacyBinding);
  const output = record(input.output, "population.output");
  if (output.kind !== input.expectation.kind || !workerTask.resultKinds.includes(input.expectation.kind)) {
    throw protocolError("population-worker-result-kind-invalid", `人口 Worker 结果类型应为 ${input.expectation.kind}`);
  }
  assertSameLegacyBinding(output.binding, legacyBinding, "population.output.binding");

  if (input.expectation.kind === "population-history") {
    const history = record(output.history, "population.output.history");
    if (history.action !== input.expectation.action || history.kind !== input.expectation.requestKind) {
      throw protocolError("population-worker-history-result-invalid", "人口 Worker 历史结果与请求动作不一致");
    }
    return Object.freeze({binding: coreBinding, resultKind: input.expectation.kind, writeSet: Object.freeze([])});
  }

  const plan = record(output.plan, "population.output.plan");
  assertSameLegacyBinding(plan.binding, legacyBinding, "population.output.plan.binding");
  const request = record(plan.request, "population.output.plan.request");
  if (request.kind !== input.expectation.requestKind) {
    throw protocolError("population-worker-request-kind-mismatch", "人口 Worker 计划与原请求类型不一致");
  }
  if (typeof plan.sourceFingerprint !== "string" || !plan.sourceFingerprint) {
    throw protocolError("population-worker-source-fingerprint-missing", "人口 Worker 计划缺少来源指纹");
  }
  if (plan.sourceFingerprint !== input.expectation.sourceFingerprint) {
    throw protocolError("population-worker-source-stale", "人口 Worker 计划来源指纹与主线程请求快照不一致");
  }
  const writeSet = validatePopulationWorkerPatch(output.patch);
  const result = record(output.result, "population.output.result");
  if (result.sourceFingerprint !== plan.sourceFingerprint) {
    throw protocolError("population-worker-source-fingerprint-mismatch", "人口 Worker 结果与计划来源指纹不一致");
  }
  const changedPaths = stringArray(result.changedPaths, "population.output.result.changedPaths");
  if (!sameStringSet(changedPaths, writeSet)) {
    throw protocolError("population-worker-result-write-set-mismatch", "人口 Worker 结果 changedPaths 与 patch writeSet 不一致");
  }
  return Object.freeze({binding: coreBinding, resultKind: input.expectation.kind, writeSet});
}

export function validatePopulationWorkerPatch(value: unknown): readonly string[] {
  const patch = record(value, "population.patch");
  if (patch.version !== 1 || patch.domain !== "population-mutation") {
    throw protocolError("population-worker-patch-invalid", "人口 Worker patch 版本或领域无效");
  }
  const writeSet = stringArray(patch.writeSet, "population.patch.writeSet");
  const operations = array(patch.operations, "population.patch.operations");
  const operationPaths = operations.map((operation, index) => {
    const source = record(operation, `population.patch.operations.${index}`);
    const path = stringArray(source.path, `population.patch.operations.${index}.path`);
    if (!path.length || source.exists !== true && source.exists !== false) {
      throw protocolError("population-worker-patch-operation-invalid", "人口 Worker patch operation 结构无效");
    }
    if (path.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) {
      throw protocolError("population-worker-patch-operation-invalid", "人口 Worker patch operation 含不安全路径字段");
    }
    return path.join(".");
  });
  if (!sameStringSet(writeSet, operationPaths) || new Set(writeSet).size !== writeSet.length) {
    throw protocolError("population-worker-patch-write-set-mismatch", "人口 Worker patch writeSet 与 operations 不一致或重复");
  }
  const sorted = [...writeSet].sort();
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].startsWith(`${sorted[index - 1]}.`)) {
      throw protocolError("population-worker-patch-write-set-overlap", `人口 Worker patch 路径相互覆盖：${sorted[index]}`);
    }
  }
  for (const path of writeSet) {
    if (!manifestWriteSet.some(root => path === root || path.startsWith(`${root}.`))) {
      throw protocolError("population-worker-patch-write-set-violation", `人口 Worker patch 越过 manifest 写集：${path}`);
    }
  }
  return Object.freeze([...writeSet]);
}

function validateLegacyBinding(value: unknown, path: string): LegacyPopulationWorkerBinding {
  const source = record(value, path);
  const binding = {
    mapIdentity: typeof source.mapIdentity === "string" ? source.mapIdentity : "",
    mapRevision: Number(source.mapRevision),
    generationToken: Number(source.generationToken),
    lockFingerprint: typeof source.lockFingerprint === "string" ? source.lockFingerprint : "",
    operationId: Number(source.operationId),
    operationName: typeof source.operationName === "string" ? source.operationName : ""
  };
  if (!binding.mapIdentity || !Number.isSafeInteger(binding.mapRevision) || binding.mapRevision < 0
    || !Number.isSafeInteger(binding.generationToken) || binding.generationToken < 0
    || !Number.isSafeInteger(binding.operationId) || binding.operationId < 0
    || !binding.lockFingerprint || !binding.operationName) {
    throw protocolError("population-worker-binding-invalid", `${path} 缺少完整 identity / revision / token / operation / lock 指纹`);
  }
  return Object.freeze(binding);
}

function assertSameLegacyBinding(value: unknown, expected: LegacyPopulationWorkerBinding, path: string): void {
  const actual = validateLegacyBinding(value, path);
  for (const key of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"] as const) {
    if (actual[key] !== expected[key]) {
      throw protocolError("population-worker-binding-stale", `${path}.${key} 与请求绑定不一致`);
    }
  }
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw protocolError("population-worker-protocol-record-required", `${path} 必须是对象`);
  }
  return value as UnknownRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw protocolError("population-worker-protocol-array-required", `${path} 必须是数组`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  const values = array(value, path);
  if (values.some(item => typeof item !== "string" || !item)) {
    throw protocolError("population-worker-protocol-string-array-required", `${path} 必须是非空字符串数组`);
  }
  return values as string[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value));
}

function protocolError(code: string, message: string): Error & {code: string} {
  return Object.assign(new Error(message), {code});
}
