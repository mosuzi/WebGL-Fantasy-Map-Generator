import type {ProjectionStatus} from "./contracts/commit.js";
import type {DerivedSystemDescriptor, DomainModuleManifest} from "./contracts/domain-module.js";

type ProjectionName = ProjectionStatus["projection"];
type AffectedRecord = Readonly<Record<string, readonly string[]>>;

export type DependencyPlanMode = "exact" | "local" | "presentation-only" | "full-rebuild";

export interface DependencyPlan {
  readonly mode: DependencyPlanMode;
  readonly systems: readonly string[];
  readonly invalidated: readonly string[];
  readonly scheduledRebuilds: readonly string[];
  readonly projections: readonly ProjectionName[];
  readonly fallbackReasons: readonly string[];
  readonly reusedAcrossPresentation: readonly string[];
}

export class DependencyRegistryError extends Error {
  readonly code: "DEPENDENCY_INVALID" | "DEPENDENCY_DUPLICATE_DOMAIN" | "DEPENDENCY_DUPLICATE_SYSTEM";

  constructor(code: DependencyRegistryError["code"], message: string) {
    super(message);
    this.name = "DependencyRegistryError";
    this.code = code;
  }
}

export function createDependencyRegistry(options: {
  readonly invalidationTargets?: Readonly<Record<string, readonly ProjectionName[]>>;
} = {}) {
  const systems = new Map<string, Readonly<{domain: string; descriptor: DerivedSystemDescriptor}>>();
  const domains = new Set<string>();
  const knownWrites = new Set<string>();
  const targets = normalizeTargets(options.invalidationTargets);
  return Object.freeze({register, planCanonical, planPresentation, snapshot});

  function register(manifest: DomainModuleManifest): void {
    if (!manifest?.id) throw new DependencyRegistryError("DEPENDENCY_INVALID", "dependency manifest 缺少领域 id");
    if (domains.has(manifest.id)) throw new DependencyRegistryError("DEPENDENCY_DUPLICATE_DOMAIN", `dependency domain ${manifest.id} 重复`);
    const staged: Array<Readonly<{domain: string; descriptor: DerivedSystemDescriptor}>> = [];
    for (const descriptor of manifest.derivedSystems || []) {
      validateDescriptor(descriptor, manifest.id);
      if (systems.has(descriptor.id) || staged.some(item => item.descriptor.id === descriptor.id)) {
        throw new DependencyRegistryError("DEPENDENCY_DUPLICATE_SYSTEM", `derived system ${descriptor.id} 重复`);
      }
      staged.push(Object.freeze({domain: manifest.id, descriptor: freezeDescriptor(descriptor)}));
    }
    for (const command of manifest.commands || []) for (const path of command.writeSet) knownWrites.add(path);
    for (const task of manifest.workerTasks || []) for (const path of task.writeSet) knownWrites.add(path);
    for (const path of manifest.regeneration?.writeSet || []) knownWrites.add(path);
    for (const item of staged) {
      systems.set(item.descriptor.id, item);
      for (const path of item.descriptor.writes) knownWrites.add(path);
    }
    domains.add(manifest.id);
  }

  function planCanonical(input: {
    readonly writeSet: readonly string[];
    readonly affected?: AffectedRecord;
    readonly affectedCells?: readonly number[];
  }): DependencyPlan {
    const writeSet = uniqueNonEmpty(input?.writeSet, "dependency writeSet");
    const fallbackReasons: string[] = [];
    const unknown = writeSet.filter(path => ![...knownWrites].some(known => overlaps(path, known)));
    if (unknown.length) fallbackReasons.push(`未声明写路径：${unknown.join(", ")}`);

    const selected = new Map<string, Readonly<{domain: string; descriptor: DerivedSystemDescriptor}>>();
    const frontier = [...writeSet];
    for (let index = 0; index < frontier.length; index++) {
      const changed = frontier[index];
      for (const item of systems.values()) {
        if (selected.has(item.descriptor.id) || !item.descriptor.invalidatedBy.some(path => overlaps(path, changed))) continue;
        selected.set(item.descriptor.id, item);
        frontier.push(...item.descriptor.writes);
      }
    }

    const invalidated = new Set<string>();
    const projections = new Set<ProjectionName>(["persistence", "ui"]);
    let requiresFull = fallbackReasons.length > 0;
    for (const {descriptor} of selected.values()) {
      if (descriptor.scope === "full-map") requiresFull = true;
      if (descriptor.scope === "affected-objects" && !hasAffectedObjects(input.affected)) {
        requiresFull = true;
        fallbackReasons.push(`${descriptor.id} 缺少 affected objects`);
      }
      if (descriptor.scope === "affected-cells" && !input.affectedCells?.length) {
        requiresFull = true;
        fallbackReasons.push(`${descriptor.id} 缺少 affected cells`);
      }
      if (descriptor.rebuild === "worker") projections.add("worker");
      if (descriptor.rebuild === "gpu-patch") projections.add("renderer");
      for (const id of descriptor.invalidates) {
        invalidated.add(id);
        const mapped = targets[id];
        if (!mapped?.length) {
          requiresFull = true;
          fallbackReasons.push(`${descriptor.id} 的 invalidation ${id} 未登记 projection`);
          continue;
        }
        for (const projection of mapped) projections.add(projection);
      }
    }
    if (requiresFull) for (const projection of ["worker", "renderer", "persistence", "ui"] as const) projections.add(projection);
    const mode: DependencyPlanMode = requiresFull ? "full-rebuild" : selected.size ? "local" : "exact";
    return freezePlan({
      mode,
      systems: [...selected.keys()],
      invalidated: [...invalidated],
      scheduledRebuilds: [...selected.keys()],
      projections: [...projections],
      fallbackReasons,
      reusedAcrossPresentation: []
    });
  }

  function planPresentation(input: {readonly changes: readonly string[]}): DependencyPlan {
    const changes = uniqueNonEmpty(input?.changes, "presentation changes");
    return freezePlan({
      mode: "presentation-only",
      systems: [],
      invalidated: changes,
      scheduledRebuilds: [],
      projections: ["renderer", "ui"],
      fallbackReasons: [],
      reusedAcrossPresentation: [...systems.values()].filter(item => item.descriptor.reuseAcrossPresentation).map(item => item.descriptor.id)
    });
  }

  function snapshot() {
    return Object.freeze({domains: domains.size, systems: systems.size, ids: Object.freeze([...systems.keys()].sort()), knownWrites: Object.freeze([...knownWrites].sort())});
  }
}

function freezeDescriptor(value: DerivedSystemDescriptor): DerivedSystemDescriptor {
  return Object.freeze({
    ...value,
    reads: Object.freeze([...value.reads]),
    writes: Object.freeze([...value.writes]),
    invalidatedBy: Object.freeze([...value.invalidatedBy]),
    invalidates: Object.freeze([...value.invalidates])
  });
}

function normalizeTargets(value: Readonly<Record<string, readonly ProjectionName[]>> | undefined): Readonly<Record<string, readonly ProjectionName[]>> {
  const allowed = new Set<ProjectionName>(["worker", "renderer", "persistence", "ui"]);
  const result: Record<string, readonly ProjectionName[]> = {};
  for (const [id, projections] of Object.entries(value || {})) {
    if (!id.trim() || !Array.isArray(projections) || !projections.length || projections.some(item => !allowed.has(item)) || new Set(projections).size !== projections.length) {
      throw new DependencyRegistryError("DEPENDENCY_INVALID", `invalidation target ${id || "<empty>"} 无效`);
    }
    result[id] = Object.freeze([...projections]);
  }
  return Object.freeze(result);
}

function validateDescriptor(descriptor: DerivedSystemDescriptor, domain: string): void {
  if (!descriptor?.id || !descriptor.reads?.length || !descriptor.invalidatedBy?.length || !descriptor.invalidates?.length || !descriptor.verify) {
    throw new DependencyRegistryError("DEPENDENCY_INVALID", `${domain} derived system 声明不完整`);
  }
  if (!descriptor.invalidatedBy.every(path => descriptor.reads.some(read => overlaps(path, read)))) {
    throw new DependencyRegistryError("DEPENDENCY_INVALID", `${descriptor.id} invalidatedBy 必须由 reads 覆盖`);
  }
}

function uniqueNonEmpty(value: readonly string[] | undefined, label: string): string[] {
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new DependencyRegistryError("DEPENDENCY_INVALID", `${label} 必须是非空字符串数组`);
  }
  const normalized = value.map(item => item.trim());
  if (new Set(normalized).size !== normalized.length) throw new DependencyRegistryError("DEPENDENCY_INVALID", `${label} 不得重复`);
  return normalized;
}

function overlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function hasAffectedObjects(value: AffectedRecord | undefined): boolean {
  return Boolean(value && Object.values(value).some(ids => Array.isArray(ids) && ids.length));
}

function freezePlan(value: DependencyPlan): DependencyPlan {
  return Object.freeze({
    ...value,
    systems: Object.freeze([...value.systems]),
    invalidated: Object.freeze([...new Set(value.invalidated)]),
    scheduledRebuilds: Object.freeze([...new Set(value.scheduledRebuilds)]),
    projections: Object.freeze([...new Set(value.projections)]),
    fallbackReasons: Object.freeze([...new Set(value.fallbackReasons)]),
    reusedAcrossPresentation: Object.freeze([...new Set(value.reusedAcrossPresentation)])
  });
}
