export type ExecutionProfile = "interactive" | "headless" | "worker-only";
export type CapabilityRequirement = "required" | "optional" | "not-required";
export type RegenerationCapability = "required" | "optional" | "unsupported";
export type UndoPolicy = "required" | "not-supported";
export type WorkerBindingPolicy = "pre-commit" | "committed-projection";
export type WorkerPatchPolicy = "domain-policy-required" | "replace-only" | "read-only";

export interface DerivedSystemDescriptor {
  readonly id: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly invalidatedBy: readonly string[];
  readonly invalidates: readonly string[];
  readonly scope: "affected-objects" | "affected-cells" | "full-map";
  readonly rebuild: "worker" | "main-thread" | "gpu-patch";
  readonly reuseAcrossPresentation: boolean;
  readonly verify: string;
}

export interface CommandDescriptor {
  readonly id: string;
  readonly writeSet: readonly string[];
  readonly undoPolicy: UndoPolicy;
  readonly reason?: string;
  readonly profiles: readonly ExecutionProfile[];
}

export interface RegenerationDescriptor {
  readonly id: string;
  readonly writeSet: readonly string[];
  readonly sourceRevision: "required";
  readonly binding: "required";
  readonly lockPolicy: string;
  readonly replacementPolicy: "from-empty" | "repair" | "localized" | "mixed";
}

export interface WorkerTaskDescriptor {
  readonly id: string;
  readonly task: string;
  readonly resultKinds: readonly string[];
  readonly writeSet: readonly string[];
  readonly bindingPolicy: WorkerBindingPolicy;
  readonly patchPolicy: WorkerPatchPolicy;
}

export interface QueryDescriptor {
  readonly id: string;
  readonly reads: readonly string[];
  readonly profiles: readonly ExecutionProfile[];
}

export interface ViewDescriptor {
  readonly id: string;
  readonly reads: readonly string[];
  readonly presentationOnly: true;
}

export interface RenderLayerDescriptor {
  readonly id: string;
  readonly reads: readonly string[];
  readonly geometrySource: "none" | "canonical" | "derived";
  readonly picking: boolean;
  readonly export: boolean;
}

export interface PanelDescriptor {
  readonly id: string;
  readonly commands: readonly string[];
  readonly queries: readonly string[];
  readonly selectionKind: string;
}

export interface PersistenceDescriptor {
  readonly schemaVersion: number;
  readonly migration: string;
  readonly backfill: string;
  readonly oldSample: string;
}

export interface ApiMethodDescriptor {
  readonly id: string;
  readonly method: string;
  readonly target: string;
  readonly schemaVersion: string;
  readonly capability: "query" | "command" | "regeneration";
  readonly capabilityGroup: string;
  readonly mutates: string;
  readonly undoable: boolean;
  readonly requiresConfirm: boolean;
  readonly errorCodes: readonly string[];
  readonly documentation: "api-description-registry";
}

export interface ApiDescriptor {
  readonly methods: readonly ApiMethodDescriptor[];
}

export interface LockDescriptor {
  readonly kinds: readonly string[];
  readonly policy: string;
}

export type RegressionCoverage = "save" | "undo" | "worker" | "regeneration" | "view" | "layer" | "failure";

export interface RegressionDescriptor {
  readonly gates: readonly string[];
  readonly coverage: readonly RegressionCoverage[];
}

export interface DomainCapabilities {
  readonly worker: CapabilityRequirement;
  readonly regeneration: RegenerationCapability;
  readonly view: CapabilityRequirement;
  readonly renderLayer: CapabilityRequirement;
}

export interface DomainModuleManifest {
  readonly id: string;
  readonly version: number;
  readonly status: "shadow" | "active";
  readonly canonicalSections: readonly string[];
  readonly derivedSystems: readonly DerivedSystemDescriptor[];
  readonly commands: readonly CommandDescriptor[];
  readonly regeneration?: RegenerationDescriptor;
  readonly workerTasks?: readonly WorkerTaskDescriptor[];
  readonly queries?: readonly QueryDescriptor[];
  readonly views?: readonly ViewDescriptor[];
  readonly layers?: readonly RenderLayerDescriptor[];
  readonly panels?: readonly PanelDescriptor[];
  readonly persistence: PersistenceDescriptor;
  readonly api?: ApiDescriptor;
  readonly locks?: LockDescriptor;
  readonly regression: RegressionDescriptor;
  readonly capabilities: DomainCapabilities;
  readonly capabilityReasons: Readonly<Partial<Record<keyof DomainCapabilities, string>>>;
}
