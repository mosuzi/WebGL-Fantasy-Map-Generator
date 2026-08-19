import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {ComputeOperationBinding} from "../../core/contracts/operation.js";
import {validateOperationBinding} from "../../core/contracts/runtime-validators.js";
import {listCanonicalMapSections} from "../../runtime/canonical-map-field-registry.js";
import {foundationManifest} from "./manifest.js";

type UnknownRecord = Record<string, unknown>;

export type LegacyFoundationWorkerBinding = Readonly<{
  mapIdentity: string;
  mapRevision: number;
  topologyRevision: number;
  generationToken: number;
  lockFingerprint: string;
  operationId: number;
  operationName: string;
  sourceFingerprint?: string;
}>;

const taskById = new Map<string, (typeof foundationManifest.workerTasks)[number]>(foundationManifest.workerTasks.map(task => [task.id, task]));
const patchDomainByTask = Object.freeze({
  "height-derived.compute": "height-derived",
  "climate-downstream.compute": "climate-downstream"
} as const);
const requiredFoundationReplacementSections = Object.freeze(listCanonicalMapSections().filter(section => !section.optional).map(section => section.path));

export function createFoundationWorkerBinding(input: {
  readonly revision: unknown;
  readonly generationToken: number;
  readonly lockFingerprint: string;
  readonly operation?: Readonly<{id?: number; name?: string}> | null;
}): LegacyFoundationWorkerBinding {
  const revision = record(input.revision, "foundation.binding.revision");
  return validateLegacyBinding({
    mapIdentity: revision.mapIdentity,
    mapRevision: revision.mapRevision,
    topologyRevision: revision.topologyRevision,
    generationToken: input.generationToken,
    lockFingerprint: input.lockFingerprint,
    operationId: Number(input.operation?.id) || 0,
    operationName: String(input.operation?.name || "")
  }, "foundation.binding");
}

export function adaptFoundationWorkerBinding(task: string, value: unknown): ComputeOperationBinding {
  const descriptor = requireTask(task);
  const legacy = validateLegacyBinding(value, `${descriptor.id}.binding`);
  const operationId = `foundation:${descriptor.id}:${legacy.operationId}`;
  const binding = validateOperationBinding({
    bindingPhase: "pre-commit",
    bindingKind: "compute",
    operationId,
    transactionId: `${legacy.mapIdentity}:${operationId}:${legacy.mapRevision}:${legacy.topologyRevision}:${legacy.generationToken}`,
    operationName: legacy.operationName || descriptor.id,
    sourceRevision: adaptLegacyInteractiveRevision({
      mapIdentity: legacy.mapIdentity,
      mapRevision: legacy.mapRevision,
      topologyRevision: legacy.topologyRevision,
      domainRevisions: {foundation: legacy.mapRevision}
    }),
    generationToken: legacy.generationToken,
    lockFingerprint: legacy.lockFingerprint
  }, `${descriptor.id}.binding.core`);
  return binding as ComputeOperationBinding;
}

export function validateFoundationWorkerOutput(input: {
  readonly task: string;
  readonly binding: unknown;
  readonly output: unknown;
}): Readonly<{
  task: string;
  binding: ComputeOperationBinding;
  resultKind: string;
  writeSet: readonly string[];
  replacement: boolean;
}> {
  const descriptor = requireTask(input.task);
  const legacyBinding = validateLegacyBinding(input.binding, `${descriptor.id}.request.binding`);
  const binding = adaptFoundationWorkerBinding(descriptor.id, legacyBinding);
  const output = record(input.output, `${descriptor.id}.output`);
  if (typeof output.kind !== "string" || !descriptor.resultKinds.includes(output.kind as never)) {
    throw protocolError("foundation-worker-result-kind-invalid", `${descriptor.id} 返回了未登记结果类型`);
  }
  assertSameLegacyBinding(output.binding, legacyBinding, `${descriptor.id}.output.binding`);
  validatePreparedRenderBinding(output.preparedRender, legacyBinding, descriptor.id);

  const result = record(output.result, `${descriptor.id}.output.result`);
  const executed = result.executed === true || output.executed === true;
  if (descriptor.patchPolicy === "domain-policy-required") {
    const expectedDomain = patchDomainByTask[descriptor.id as keyof typeof patchDomainByTask];
    const writeSet = validateFoundationWorkerPatch(output.patch, descriptor.id, expectedDomain);
    if (!executed && writeSet.length) {
      throw protocolError("foundation-worker-noop-write-invalid", `${descriptor.id} 未执行结果不得携带写入`);
    }
    if (output.replacementMap !== undefined && output.replacementMap !== null) {
      throw protocolError("foundation-worker-patch-replacement-conflict", `${descriptor.id} patch 任务不得同时替换地图`);
    }
    return Object.freeze({task: descriptor.id, binding, resultKind: output.kind, writeSet, replacement: false});
  }

  if (output.patch !== undefined && output.patch !== null) {
    throw protocolError("foundation-worker-replacement-patch-conflict", `${descriptor.id} replacement 任务不得携带 patch`);
  }
  if (executed) validateFoundationDocumentShape(output.replacementMap, {allowLegacy: false});
  else if (output.replacementMap !== null) throw protocolError("foundation-worker-noop-replacement-invalid", `${descriptor.id} 未执行结果必须返回 null replacementMap`);
  return Object.freeze({task: descriptor.id, binding, resultKind: output.kind, writeSet: Object.freeze([]), replacement: executed});
}

export function validateFoundationWorkerPatch(value: unknown, task: string, expectedDomain?: string): readonly string[] {
  const descriptor = requireTask(task);
  if (descriptor.patchPolicy !== "domain-policy-required") {
    throw protocolError("foundation-worker-patch-policy-invalid", `${descriptor.id} 未声明 patch policy`);
  }
  const patch = record(value, `${descriptor.id}.patch`);
  if (patch.version !== 1 || typeof patch.domain !== "string" || !patch.domain || expectedDomain && patch.domain !== expectedDomain) {
    throw protocolError("foundation-worker-patch-invalid", `${descriptor.id} patch 版本或领域无效`);
  }
  const writeSet = stringArray(patch.writeSet, `${descriptor.id}.patch.writeSet`);
  const operations = array(patch.operations, `${descriptor.id}.patch.operations`);
  const operationPaths = operations.map((operation, index) => {
    const source = record(operation, `${descriptor.id}.patch.operations.${index}`);
    const path = stringArray(source.path, `${descriptor.id}.patch.operations.${index}.path`);
    if (!path.length || source.exists !== true && source.exists !== false || path.some(part => part.includes(".") || ["__proto__", "prototype", "constructor"].includes(part))) {
      throw protocolError("foundation-worker-patch-operation-invalid", `${descriptor.id} patch operation 结构无效`);
    }
    return path.join(".");
  });
  if (!sameStringSet(writeSet, operationPaths) || new Set(writeSet).size !== writeSet.length) {
    throw protocolError("foundation-worker-patch-write-set-mismatch", `${descriptor.id} patch writeSet 与 operations 不一致或重复`);
  }
  const sorted = [...writeSet].sort();
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].startsWith(`${sorted[index - 1]}.`)) {
      throw protocolError("foundation-worker-patch-write-set-overlap", `${descriptor.id} patch 路径相互覆盖`);
    }
  }
  for (const path of writeSet) {
    if (!descriptor.writeSet.some(root => path === root || path.startsWith(`${root}.`))) {
      throw protocolError("foundation-worker-patch-write-set-violation", `${descriptor.id} patch 越过 Manifest 写集：${path}`);
    }
  }
  return Object.freeze([...writeSet]);
}

export function validateFoundationDocumentShape(value: unknown, options: {readonly allowLegacy?: boolean} = {}) {
  const map = record(value, "foundation.map");
  const grid = optionalRecord(map.grid, "foundation.map.grid");
  if (!grid || !optionalRecord(grid.cells, "foundation.map.grid.cells")) {
    throw protocolError("foundation-worker-map-grid-missing", "基础域地图缺少 grid.cells");
  }
  if (!options.allowLegacy) {
    for (const section of requiredFoundationReplacementSections) {
      if (!Object.prototype.hasOwnProperty.call(map, section) || map[section] === undefined || map[section] === null) {
        throw protocolError("foundation-worker-map-section-missing", `基础域结果缺少 ${section}`);
      }
      if (section === "generationLog") {
        if (!Array.isArray(map[section])) throw protocolError("foundation-worker-map-structure-invalid", "foundation.map.generationLog 必须是数组");
      } else {
        record(map[section], `foundation.map.${section}`);
      }
    }
    for (const [path, section, field] of [
      ["foundation.map.pack.cells", "pack", "cells"],
      ["foundation.map.society.cultures", "society", "cultures"],
      ["foundation.map.society.religions", "society", "religions"],
      ["foundation.map.politics.states", "politics", "states"],
      ["foundation.map.politics.provinces", "politics", "provinces"],
      ["foundation.map.settlements.cities", "settlements", "cities"],
      ["foundation.map.settlements.routes", "settlements", "routes"],
      ["foundation.map.features.features", "features", "features"],
      ["foundation.map.rivers.rivers", "rivers", "rivers"],
      ["foundation.map.regenerationLocks.entries", "regenerationLocks", "entries"],
      ["foundation.map.notes.notes", "notes", "notes"],
      ["foundation.map.measurements.items", "measurements", "items"],
      ["foundation.map.labels.custom", "labels", "custom"]
    ] as const) {
      const container = record(map[section], `foundation.map.${section}`);
      if (field === "cells") record(container[field], path);
      else if (!Array.isArray(container[field])) throw protocolError("foundation-worker-map-structure-invalid", `${path} 必须是数组`);
    }
  }
  return Object.freeze({
    grid: true,
    heightmap: Boolean(map.heightmap),
    climate: Boolean(map.climate),
    oceanCurrents: Boolean(map.oceanCurrents),
    pack: Boolean(map.pack),
    legacyDefaults: Object.freeze({
      heightmap: !map.heightmap,
      climate: !map.climate,
      oceanCurrents: !map.oceanCurrents,
      topologyRevision: 0
    })
  });
}

function requireTask(task: string) {
  const descriptor = taskById.get(String(task || ""));
  if (!descriptor) throw protocolError("foundation-worker-task-unknown", `未登记基础域 Worker task ${String(task || "(empty)")}`);
  return descriptor;
}

function validatePreparedRenderBinding(value: unknown, expected: LegacyFoundationWorkerBinding, task: string): void {
  if (value === undefined || value === null) return;
  const prepared = record(value, `${task}.preparedRender`);
  if (prepared.schemaVersion !== 1) throw protocolError("foundation-worker-render-schema-invalid", `${task} renderer source schema 无效`);
  const binding = record(prepared.binding, `${task}.preparedRender.binding`);
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision"] as const) {
    if ((binding[key] ?? "") !== (expected[key] ?? "")) {
      throw protocolError("foundation-worker-render-binding-stale", `${task} renderer source ${key} 与 Worker 请求不一致`);
    }
  }
}

function validateLegacyBinding(value: unknown, path: string): LegacyFoundationWorkerBinding {
  const source = record(value, path);
  const binding = {
    mapIdentity: typeof source.mapIdentity === "string" ? source.mapIdentity : "",
    mapRevision: Number(source.mapRevision),
    topologyRevision: Number(source.topologyRevision),
    generationToken: Number(source.generationToken),
    lockFingerprint: typeof source.lockFingerprint === "string" ? source.lockFingerprint : "",
    operationId: Number(source.operationId),
    operationName: typeof source.operationName === "string" ? source.operationName : "",
    ...(typeof source.sourceFingerprint === "string" && source.sourceFingerprint ? {sourceFingerprint: source.sourceFingerprint} : {})
  };
  if (!binding.mapIdentity || !Number.isSafeInteger(binding.mapRevision) || binding.mapRevision < 0
    || !Number.isSafeInteger(binding.topologyRevision) || binding.topologyRevision < 0
    || !Number.isSafeInteger(binding.generationToken) || binding.generationToken < 0
    || !Number.isSafeInteger(binding.operationId) || binding.operationId < 0
    || !binding.lockFingerprint) {
    throw protocolError("foundation-worker-binding-invalid", `${path} 缺少 identity / revision / topology / token / lock 指纹`);
  }
  return Object.freeze(binding);
}

function assertSameLegacyBinding(value: unknown, expected: LegacyFoundationWorkerBinding, path: string): void {
  const actual = validateLegacyBinding(value, path);
  for (const key of ["mapIdentity", "mapRevision", "topologyRevision", "generationToken", "lockFingerprint", "operationId", "operationName", "sourceFingerprint"] as const) {
    if ((actual[key] ?? "") !== (expected[key] ?? "")) {
      throw protocolError("foundation-worker-binding-stale", `${path}.${key} 与请求绑定不一致`);
    }
  }
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw protocolError("foundation-worker-record-required", `${path} 必须是对象`);
  return value as UnknownRecord;
}

function optionalRecord(value: unknown, path: string): UnknownRecord | null {
  if (value === undefined || value === null) return null;
  return record(value, path);
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw protocolError("foundation-worker-array-required", `${path} 必须是数组`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  const values = array(value, path);
  if (values.some(item => typeof item !== "string" || !item)) throw protocolError("foundation-worker-string-array-required", `${path} 必须是非空字符串数组`);
  return values as string[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value));
}

function protocolError(code: string, message: string): Error & {code: string} {
  return Object.assign(new Error(message), {code});
}
