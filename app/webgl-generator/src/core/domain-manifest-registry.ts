import type {
  ApiDescriptor,
  ApiMethodDescriptor,
  CommandDescriptor,
  DerivedSystemDescriptor,
  DomainCapabilities,
  DomainModuleManifest,
  ExecutionProfile,
  PanelDescriptor,
  QueryDescriptor,
  RegressionCoverage,
  RegressionDescriptor,
  RegenerationDescriptor,
  RenderLayerDescriptor,
  ViewDescriptor,
  WorkerTaskDescriptor
} from "./contracts/domain-module.js";

type UnknownRecord = Record<string, unknown>;

export type DomainManifestErrorCode =
  | "MANIFEST_INVALID"
  | "MANIFEST_DUPLICATE_ID"
  | "MANIFEST_FIELD_UNREGISTERED"
  | "MANIFEST_REFERENCE_MISSING"
  | "MANIFEST_CAPABILITY_MISMATCH"
  | "MANIFEST_WORKER_TASK_UNKNOWN";

export interface DomainManifestValidationContext {
  readonly resolveCanonicalPath: (path: string) => unknown | null;
  readonly hasWorkerTask: (task: string) => boolean;
  readonly hasRegressionGate: (gate: string) => boolean;
  readonly resolveApiMethod: (method: string) => unknown | null;
}

export class DomainManifestError extends Error {
  readonly code: DomainManifestErrorCode;
  readonly path: string;

  constructor(code: DomainManifestErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "DomainManifestError";
    this.code = code;
    this.path = path;
  }
}

export function validateDomainModuleManifest(value: unknown, context: DomainManifestValidationContext): DomainModuleManifest {
  validateContext(context);
  const source = record(value, "manifest");
  const id = identifier(source.id, "manifest.id");
  const version = positiveInteger(source.version, "manifest.version");
  const status = enumValue(source.status, ["shadow", "active"] as const, "manifest.status");
  const canonicalSections = uniqueStrings(source.canonicalSections, "manifest.canonicalSections", {nonEmpty: true});
  for (const path of canonicalSections) assertRegisteredPath(path, context, `manifest.canonicalSections.${path}`);
  const derivedSystems = descriptors(source.derivedSystems, "manifest.derivedSystems", validateDerivedSystem);
  const commands = descriptors(source.commands, "manifest.commands", validateCommand);
  const regeneration = source.regeneration === undefined ? undefined : validateRegeneration(source.regeneration, "manifest.regeneration");
  const workerTasks = source.workerTasks === undefined ? undefined : descriptors(source.workerTasks, "manifest.workerTasks", validateWorkerTask);
  const queries = source.queries === undefined ? undefined : descriptors(source.queries, "manifest.queries", validateQuery);
  const views = source.views === undefined ? undefined : descriptors(source.views, "manifest.views", validateView);
  const layers = source.layers === undefined ? undefined : descriptors(source.layers, "manifest.layers", validateLayer);
  const panels = source.panels === undefined ? undefined : descriptors(source.panels, "manifest.panels", validatePanel);
  const persistence = validatePersistence(source.persistence, "manifest.persistence");
  const api = source.api === undefined ? undefined : validateApi(source.api, "manifest.api");
  const locks = source.locks === undefined ? undefined : validateLocks(source.locks, "manifest.locks");
  const regression = validateRegression(source.regression, "manifest.regression");
  for (const gate of regression.gates) {
    if (!context.hasRegressionGate(gate)) manifestError("MANIFEST_REFERENCE_MISSING", `${id}.regression.gates.${gate}`, "package scripts 中不存在该回归门");
  }
  for (const system of derivedSystems) {
    if (!regression.gates.includes(system.verify)) {
      manifestError("MANIFEST_REFERENCE_MISSING", `${id}.derivedSystems.${system.id}.verify`, `verifier ${system.verify} 未进入本领域 regression gates`);
    }
  }
  const capabilities = validateCapabilities(source.capabilities, "manifest.capabilities");
  const capabilityReasons = validateCapabilityReasons(source.capabilityReasons, "manifest.capabilityReasons");

  for (const item of [...derivedSystems, ...commands, ...(workerTasks || []), ...(queries || []), ...(views || []), ...(layers || [])]) {
    for (const path of [...("reads" in item ? item.reads : []), ...("writes" in item ? item.writes : []), ...("invalidatedBy" in item ? item.invalidatedBy : []), ...("writeSet" in item ? item.writeSet : [])]) {
      assertRegisteredPath(path, context, `${id}.${item.id}.${path}`);
      if (!canonicalSections.some(section => covers(section, path))) {
        manifestError("MANIFEST_FIELD_UNREGISTERED", `${id}.${item.id}.${path}`, "路径未包含在本领域 canonicalSections");
      }
    }
  }
  if (regeneration) for (const path of regeneration.writeSet) assertDomainPath(id, regeneration.id, path, canonicalSections, context);
  for (const task of workerTasks || []) {
    if (!context.hasWorkerTask(task.task)) {
      manifestError("MANIFEST_WORKER_TASK_UNKNOWN", `${id}.workerTasks.${task.id}.task`, `Worker registry 中不存在任务 ${task.task}`);
    }
  }

  const commandIds = new Set(commands.map(item => item.id));
  const queryIds = new Set((queries || []).map(item => item.id));
  const regenerationIds = new Set(regeneration ? [regeneration.id] : []);
  for (const panel of panels || []) {
    for (const command of panel.commands) if (!commandIds.has(command)) manifestError("MANIFEST_REFERENCE_MISSING", `${id}.panels.${panel.id}.commands`, `未注册 command ${command}`);
    for (const query of panel.queries) if (!queryIds.has(query)) manifestError("MANIFEST_REFERENCE_MISSING", `${id}.panels.${panel.id}.queries`, `未注册 query ${query}`);
  }
  for (const method of api?.methods || []) {
    validateApiEvidence(id, method, context.resolveApiMethod(method.method));
    const targets = method.capability === "command" ? commandIds : method.capability === "query" ? queryIds : regenerationIds;
    if (!targets.has(method.target)) manifestError("MANIFEST_REFERENCE_MISSING", `${id}.api.${method.id}.target`, `未注册 ${method.capability} ${method.target}`);
  }

  enforceCapability(id, "worker", capabilities.worker, workerTasks, capabilityReasons.worker);
  enforceCapability(id, "regeneration", capabilities.regeneration, regeneration ? [regeneration] : undefined, capabilityReasons.regeneration);
  enforceCapability(id, "view", capabilities.view, views, capabilityReasons.view);
  enforceCapability(id, "renderLayer", capabilities.renderLayer, layers, capabilityReasons.renderLayer);
  enforceRegressionCoverage(id, regression, {commands, regeneration, workerTasks, views, layers});

  return deepFreeze({
    id,
    version,
    status,
    canonicalSections,
    derivedSystems,
    commands,
    ...(regeneration ? {regeneration} : {}),
    ...(workerTasks ? {workerTasks} : {}),
    ...(queries ? {queries} : {}),
    ...(views ? {views} : {}),
    ...(layers ? {layers} : {}),
    ...(panels ? {panels} : {}),
    persistence,
    ...(api ? {api} : {}),
    ...(locks ? {locks} : {}),
    regression,
    capabilities,
    capabilityReasons
  }) as DomainModuleManifest;
}

export function createDomainManifestRegistry(context: DomainManifestValidationContext) {
  const manifests = new Map<string, DomainModuleManifest>();
  const globalIds = new Map<string, string>();
  const workerResultOwners = new Map<string, string>();
  return Object.freeze({register, get, list, snapshot});

  function register(value: unknown): DomainModuleManifest {
    const manifest = validateDomainModuleManifest(value, context);
    if (manifests.has(manifest.id)) manifestError("MANIFEST_DUPLICATE_ID", `manifest.${manifest.id}`, "领域 id 重复");
    const registrations: Array<readonly [string, string]> = [];
    const workerClaims: Array<readonly [string, string]> = [];
    const pendingWorkerClaims = new Set<string>();
    for (const [category, items] of descriptorGroups(manifest)) {
      for (const item of items) {
        const key = `${category}:${item.id}`;
        const owner = globalIds.get(key);
        if (owner) manifestError("MANIFEST_DUPLICATE_ID", `${manifest.id}.${category}.${item.id}`, `与 ${owner} 重复`);
        registrations.push([key, manifest.id]);
      }
    }
    for (const task of manifest.workerTasks || []) for (const resultKind of task.resultKinds) {
      const key = `${task.task}:${resultKind}`;
      const owner = workerResultOwners.get(key);
      if (owner || pendingWorkerClaims.has(key)) manifestError("MANIFEST_DUPLICATE_ID", `${manifest.id}.worker.${task.task}.${resultKind}`, `Worker result kind 已由 ${owner || manifest.id} 拥有`);
      workerClaims.push([key, manifest.id]);
      pendingWorkerClaims.add(key);
    }
    for (const [key, owner] of registrations) globalIds.set(key, owner);
    for (const [key, owner] of workerClaims) workerResultOwners.set(key, owner);
    manifests.set(manifest.id, manifest);
    return manifest;
  }

  function get(id: string): DomainModuleManifest | null {
    return manifests.get(String(id || "")) || null;
  }

  function list(): readonly DomainModuleManifest[] {
    return Object.freeze([...manifests.values()]);
  }

  function snapshot() {
    return Object.freeze({domains: manifests.size, ids: Object.freeze([...manifests.keys()].sort()), descriptors: globalIds.size});
  }
}

function validateDerivedSystem(value: unknown, path: string): DerivedSystemDescriptor {
  const source = record(value, path);
  const reads = uniqueStrings(source.reads, `${path}.reads`, {nonEmpty: true});
  const invalidatedBy = uniqueStrings(source.invalidatedBy, `${path}.invalidatedBy`, {nonEmpty: true});
  if (invalidatedBy.some(invalidation => !reads.some(read => covers(read, invalidation)))) {
    manifestError("MANIFEST_INVALID", `${path}.invalidatedBy`, "invalidatedBy 必须由 reads 覆盖");
  }
  return {
    id: identifier(source.id, `${path}.id`),
    reads,
    writes: uniqueStrings(source.writes, `${path}.writes`),
    invalidatedBy,
    invalidates: uniqueStrings(source.invalidates, `${path}.invalidates`, {nonEmpty: true}),
    scope: enumValue(source.scope, ["affected-objects", "affected-cells", "full-map"] as const, `${path}.scope`),
    rebuild: enumValue(source.rebuild, ["worker", "main-thread", "gpu-patch"] as const, `${path}.rebuild`),
    reuseAcrossPresentation: booleanValue(source.reuseAcrossPresentation, `${path}.reuseAcrossPresentation`),
    verify: nonEmptyString(source.verify, `${path}.verify`)
  };
}

function validateCommand(value: unknown, path: string): CommandDescriptor {
  const source = record(value, path);
  const undoPolicy = enumValue(source.undoPolicy, ["required", "not-supported"] as const, `${path}.undoPolicy`);
  const reason = source.reason === undefined ? undefined : nonEmptyString(source.reason, `${path}.reason`);
  if (undoPolicy === "not-supported" && !reason) manifestError("MANIFEST_INVALID", `${path}.reason`, "不可撤销 command 必须说明原因");
  return {id: identifier(source.id, `${path}.id`), writeSet: uniqueStrings(source.writeSet, `${path}.writeSet`, {nonEmpty: true}), undoPolicy, ...(reason ? {reason} : {}), profiles: profiles(source.profiles, `${path}.profiles`)};
}

function validateRegeneration(value: unknown, path: string): RegenerationDescriptor {
  const source = record(value, path);
  if (source.sourceRevision !== "required" || source.binding !== "required") manifestError("MANIFEST_INVALID", path, "regeneration 必须声明 source revision 与 binding");
  return {id: identifier(source.id, `${path}.id`), writeSet: uniqueStrings(source.writeSet, `${path}.writeSet`, {nonEmpty: true}), sourceRevision: "required", binding: "required", lockPolicy: nonEmptyString(source.lockPolicy, `${path}.lockPolicy`), replacementPolicy: enumValue(source.replacementPolicy, ["from-empty", "repair", "localized", "mixed"] as const, `${path}.replacementPolicy`)};
}

function validateWorkerTask(value: unknown, path: string): WorkerTaskDescriptor {
  const source = record(value, path);
  return {id: identifier(source.id, `${path}.id`), task: identifier(source.task, `${path}.task`), resultKinds: uniqueStrings(source.resultKinds, `${path}.resultKinds`, {nonEmpty: true}), writeSet: uniqueStrings(source.writeSet, `${path}.writeSet`, {nonEmpty: true}), bindingPolicy: enumValue(source.bindingPolicy, ["pre-commit", "committed-projection"] as const, `${path}.bindingPolicy`), patchPolicy: enumValue(source.patchPolicy, ["domain-policy-required", "replace-only", "read-only"] as const, `${path}.patchPolicy`)};
}

function validateQuery(value: unknown, path: string): QueryDescriptor {
  const source = record(value, path);
  return {id: identifier(source.id, `${path}.id`), reads: uniqueStrings(source.reads, `${path}.reads`, {nonEmpty: true}), profiles: profiles(source.profiles, `${path}.profiles`)};
}

function validateView(value: unknown, path: string): ViewDescriptor {
  const source = record(value, path);
  if (source.presentationOnly !== true) manifestError("MANIFEST_INVALID", `${path}.presentationOnly`, "view 必须显式声明 presentationOnly");
  return {id: identifier(source.id, `${path}.id`), reads: uniqueStrings(source.reads, `${path}.reads`, {nonEmpty: true}), presentationOnly: true};
}

function validateLayer(value: unknown, path: string): RenderLayerDescriptor {
  const source = record(value, path);
  if (Object.hasOwn(source, "writes")) manifestError("MANIFEST_INVALID", `${path}.writes`, "render layer 不得写 canonical map");
  return {id: identifier(source.id, `${path}.id`), reads: uniqueStrings(source.reads, `${path}.reads`, {nonEmpty: true}), geometrySource: enumValue(source.geometrySource, ["none", "canonical", "derived"] as const, `${path}.geometrySource`), picking: booleanValue(source.picking, `${path}.picking`), export: booleanValue(source.export, `${path}.export`)};
}

function validatePanel(value: unknown, path: string): PanelDescriptor {
  const source = record(value, path);
  return {id: identifier(source.id, `${path}.id`), commands: uniqueStrings(source.commands, `${path}.commands`), queries: uniqueStrings(source.queries, `${path}.queries`), selectionKind: nonEmptyString(source.selectionKind, `${path}.selectionKind`)};
}

function validatePersistence(value: unknown, path: string) {
  const source = record(value, path);
  return {schemaVersion: positiveInteger(source.schemaVersion, `${path}.schemaVersion`), migration: nonEmptyString(source.migration, `${path}.migration`), backfill: nonEmptyString(source.backfill, `${path}.backfill`), oldSample: nonEmptyString(source.oldSample, `${path}.oldSample`)};
}

function validateApi(value: unknown, path: string): ApiDescriptor {
  const source = record(value, path);
  return {methods: descriptors(source.methods, `${path}.methods`, (item, itemPath): ApiMethodDescriptor => {
    const method = record(item, itemPath);
    if (method.documentation !== "api-description-registry") manifestError("MANIFEST_INVALID", `${itemPath}.documentation`, "必须绑定权威 API description registry");
    return {
      id: identifier(method.id, `${itemPath}.id`),
      method: identifier(method.method, `${itemPath}.method`),
      target: identifier(method.target, `${itemPath}.target`),
      schemaVersion: nonEmptyString(method.schemaVersion, `${itemPath}.schemaVersion`),
      capability: enumValue(method.capability, ["query", "command", "regeneration"] as const, `${itemPath}.capability`),
      capabilityGroup: nonEmptyString(method.capabilityGroup, `${itemPath}.capabilityGroup`),
      mutates: nonEmptyString(method.mutates, `${itemPath}.mutates`),
      undoable: booleanValue(method.undoable, `${itemPath}.undoable`),
      requiresConfirm: booleanValue(method.requiresConfirm, `${itemPath}.requiresConfirm`),
      errorCodes: uniqueStrings(method.errorCodes, `${itemPath}.errorCodes`, {nonEmpty: true}),
      documentation: "api-description-registry"
    };
  })};
}

function validateApiEvidence(domain: string, method: ApiMethodDescriptor, value: unknown): void {
  const path = `${domain}.api.${method.id}`;
  if (!value) manifestError("MANIFEST_REFERENCE_MISSING", `${path}.method`, `公开 API 中不存在 ${method.method}`);
  const evidence = record(value, `${path}.evidence`);
  if (evidence.schemaVersion !== method.schemaVersion) manifestError("MANIFEST_CAPABILITY_MISMATCH", `${path}.schemaVersion`, "与权威 API schema version 不一致");
  if (evidence.documentation !== true) manifestError("MANIFEST_REFERENCE_MISSING", `${path}.documentation`, "权威 API description registry 中没有文档记录");
  const metadata = record(evidence.metadata, `${path}.evidence.metadata`);
  if (metadata.capabilityGroup !== method.capabilityGroup || metadata.mutates !== method.mutates || metadata.undoable !== method.undoable || metadata.requiresConfirm !== method.requiresConfirm) {
    manifestError("MANIFEST_CAPABILITY_MISMATCH", `${path}.capability`, "与权威 API capability metadata 不一致");
  }
  if (method.capability === "query" ? method.mutates !== "none" : method.mutates === "none") manifestError("MANIFEST_CAPABILITY_MISMATCH", `${path}.capability`, "query / mutation 语义与 mutates 不一致");
  const businessCodes = uniqueStrings(evidence.businessCodes, `${path}.evidence.businessCodes`, {nonEmpty: true});
  if (!sameStrings(method.errorCodes, businessCodes)) manifestError("MANIFEST_CAPABILITY_MISMATCH", `${path}.errorCodes`, "与权威 API business codes 不一致");
}

function validateLocks(value: unknown, path: string) {
  const source = record(value, path);
  return {kinds: uniqueStrings(source.kinds, `${path}.kinds`, {nonEmpty: true}), policy: nonEmptyString(source.policy, `${path}.policy`)};
}

function validateRegression(value: unknown, path: string): RegressionDescriptor {
  const source = record(value, path);
  const coverage = uniqueStrings(source.coverage, `${path}.coverage`, {nonEmpty: true}).map(item => enumValue(item, ["save", "undo", "worker", "regeneration", "view", "layer", "failure"] as const, `${path}.coverage`));
  return {gates: uniqueStrings(source.gates, `${path}.gates`, {nonEmpty: true}), coverage};
}

function validateCapabilities(value: unknown, path: string): DomainCapabilities {
  const source = record(value, path);
  return {worker: enumValue(source.worker, ["required", "optional", "not-required"] as const, `${path}.worker`), regeneration: enumValue(source.regeneration, ["required", "optional", "unsupported"] as const, `${path}.regeneration`), view: enumValue(source.view, ["required", "optional", "not-required"] as const, `${path}.view`), renderLayer: enumValue(source.renderLayer, ["required", "optional", "not-required"] as const, `${path}.renderLayer`)};
}

function validateCapabilityReasons(value: unknown, path: string): Partial<Record<keyof DomainCapabilities, string>> {
  const source = record(value, path);
  const allowed = new Set<keyof DomainCapabilities>(["worker", "regeneration", "view", "renderLayer"]);
  for (const key of Object.keys(source)) if (!allowed.has(key as keyof DomainCapabilities)) manifestError("MANIFEST_INVALID", `${path}.${key}`, "未知 capability reason");
  return Object.fromEntries(Object.entries(source).map(([key, reason]) => [key, nonEmptyString(reason, `${path}.${key}`)]));
}

function enforceRegressionCoverage(domain: string, regression: RegressionDescriptor, capabilities: {
  readonly commands: readonly CommandDescriptor[];
  readonly regeneration?: RegenerationDescriptor;
  readonly workerTasks?: readonly WorkerTaskDescriptor[];
  readonly views?: readonly ViewDescriptor[];
  readonly layers?: readonly RenderLayerDescriptor[];
}): void {
  const required = new Set<RegressionCoverage>(["save", "failure"]);
  if (capabilities.commands.some(command => command.undoPolicy === "required")) required.add("undo");
  if (capabilities.regeneration) required.add("regeneration");
  if (capabilities.workerTasks?.length) required.add("worker");
  if (capabilities.views?.length) required.add("view");
  if (capabilities.layers?.length) required.add("layer");
  const actual = new Set(regression.coverage);
  for (const item of required) if (!actual.has(item)) manifestError("MANIFEST_CAPABILITY_MISMATCH", `${domain}.regression.coverage`, `缺少 ${item} 回归覆盖`);
}

function enforceCapability(domain: string, key: keyof DomainCapabilities, requirement: string, descriptorsValue: readonly unknown[] | undefined, reason: string | undefined): void {
  const count = descriptorsValue?.length || 0;
  const unavailable = requirement === "not-required" || requirement === "unsupported";
  if (requirement === "required" && count === 0) manifestError("MANIFEST_CAPABILITY_MISMATCH", `${domain}.capabilities.${key}`, "required capability 缺少 descriptor");
  if (unavailable && count > 0) manifestError("MANIFEST_CAPABILITY_MISMATCH", `${domain}.capabilities.${key}`, "未要求能力不得注册 descriptor");
  if (unavailable && !reason) manifestError("MANIFEST_CAPABILITY_MISMATCH", `${domain}.capabilityReasons.${key}`, "未要求能力必须说明原因");
}

function assertDomainPath(domain: string, descriptor: string, path: string, sections: readonly string[], context: DomainManifestValidationContext): void {
  assertRegisteredPath(path, context, `${domain}.${descriptor}.${path}`);
  if (!sections.some(section => covers(section, path))) manifestError("MANIFEST_FIELD_UNREGISTERED", `${domain}.${descriptor}.${path}`, "路径未包含在本领域 canonicalSections");
}

function assertRegisteredPath(path: string, context: DomainManifestValidationContext, errorPath: string): void {
  if (!context?.resolveCanonicalPath?.(path)) manifestError("MANIFEST_FIELD_UNREGISTERED", errorPath, "canonical field registry 未登记该路径");
}

function descriptorGroups(manifest: DomainModuleManifest): Array<[string, readonly {readonly id: string}[]]> {
  return [["derived", manifest.derivedSystems], ["command", manifest.commands], ["regeneration", manifest.regeneration ? [manifest.regeneration] : []], ["worker", manifest.workerTasks || []], ["query", manifest.queries || []], ["view", manifest.views || []], ["layer", manifest.layers || []], ["panel", manifest.panels || []], ["api", manifest.api?.methods || []]];
}

function validateContext(value: unknown): asserts value is DomainManifestValidationContext {
  const context = record(value, "context");
  for (const resolver of ["resolveCanonicalPath", "hasWorkerTask", "hasRegressionGate", "resolveApiMethod"] as const) {
    if (typeof context[resolver] !== "function") manifestError("MANIFEST_INVALID", `context.${resolver}`, "必须提供权威 resolver");
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function descriptors<T>(value: unknown, path: string, validate: (item: unknown, path: string) => T): readonly T[] {
  if (!Array.isArray(value)) manifestError("MANIFEST_INVALID", path, "必须是数组");
  const result = value.map((item, index) => validate(item, `${path}[${index}]`));
  const ids = new Set<string>();
  for (const item of result as Array<T & {id?: string}>) {
    if (!item.id) continue;
    if (ids.has(item.id)) manifestError("MANIFEST_DUPLICATE_ID", `${path}.${item.id}`, "descriptor id 重复");
    ids.add(item.id);
  }
  return result;
}

function profiles(value: unknown, path: string): readonly ExecutionProfile[] {
  return uniqueStrings(value, path, {nonEmpty: true}).map(profile => enumValue(profile, ["interactive", "headless", "worker-only"] as const, path));
}

function uniqueStrings(value: unknown, path: string, {nonEmpty = false} = {}): readonly string[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) manifestError("MANIFEST_INVALID", path, nonEmpty ? "必须是非空数组" : "必须是数组");
  const result = value.map((item, index) => nonEmptyString(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) manifestError("MANIFEST_DUPLICATE_ID", path, "包含重复值");
  return result;
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) manifestError("MANIFEST_INVALID", path, "必须是对象");
  return value as UnknownRecord;
}

function identifier(value: unknown, path: string): string {
  const id = nonEmptyString(value, path);
  if (!/^[a-z][a-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)*$/u.test(id)) manifestError("MANIFEST_INVALID", path, "id 格式无效");
  return id;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) manifestError("MANIFEST_INVALID", path, "必须是非空字符串");
  return value.trim();
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) manifestError("MANIFEST_INVALID", path, "必须是正整数");
  return Number(value);
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") manifestError("MANIFEST_INVALID", path, "必须是布尔值");
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) manifestError("MANIFEST_INVALID", path, `必须是 ${values.join(" / ")} 之一`);
  return value as T[number];
}

function covers(section: string, path: string): boolean {
  return path === section || path.startsWith(`${section}.`);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value as UnknownRecord)) deepFreeze(item);
  return value;
}

function manifestError(code: DomainManifestErrorCode, path: string, message: string): never {
  throw new DomainManifestError(code, path, message);
}
