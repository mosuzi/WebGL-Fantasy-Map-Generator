import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import type {CommitEnvelope, CommitKind, CommitSource} from "../../core/contracts/commit.js";
import type {CommitId, LockFingerprint, OperationId, TransactionId} from "../../core/contracts/identity.js";
import type {GenerationToken, InteractiveRevisionVector} from "../../core/contracts/revision.js";
import {createMapCoreEngine} from "../../core/map-core-engine.js";
import {createMapRuntimeCoordinator} from "../../core/map-runtime-coordinator.js";

export const NOTES_COMMAND_IDS = Object.freeze([
  "notes.createStandalone",
  "notes.set",
  "notes.delete",
  "notes.import",
  "notes.deleteBatch"
] as const);

type NotesCommandId = (typeof NOTES_COMMAND_IDS)[number];
type LegacyRevisionSnapshot = Readonly<{
  mapIdentity: string | null;
  mapRevision: number;
  topologyRevision?: number;
}>;
type AffectedTarget = Readonly<{kind: string; id: string | number}>;
type LegacyCommand = {
  readonly label?: string;
  readonly effects?: Readonly<{affected?: readonly AffectedTarget[]}>;
  readonly getResult?: () => unknown;
};
type LegacyExecution = Readonly<{
  executed: boolean;
  command?: LegacyCommand | null;
  result?: unknown;
  error?: unknown;
}>;
type NotesStore = Readonly<{
  notes: readonly Readonly<Record<string, unknown>>[];
  metadata: Readonly<Record<string, unknown>>;
}>;

export function createNotesDomainRuntime<TMap>(options: {
  readonly getMap: () => TMap;
  readonly getLegacyRevision: () => LegacyRevisionSnapshot;
  readonly getHistoryFingerprint: () => string;
  readonly createOperationId?: () => string;
  readonly createTransactionId?: () => string;
  readonly createCommitId?: () => string;
}) {
  let sequence = 0;
  const commandBindings = new WeakMap<object, NotesCommandId>();
  const committedCommands = new WeakSet<object>();
  const core = createMapCoreEngine({
    owner: {
      getMap: options.getMap,
      getRevision: currentRevision,
      getHistoryFingerprint: options.getHistoryFingerprint
    },
    createCommitId: () => (options.createCommitId?.() || `notes-commit-${++sequence}`) as CommitId
  });
  const coordinator = createMapRuntimeCoordinator({core});

  return Object.freeze({
    executeCommand,
    executeHistory,
    ownsCommand,
    list: listNotes,
    get: getNote,
    persistenceSnapshot,
    getLastCommit: core.getLastCommit,
    getOperation: core.getOperation,
    snapshot: () => Object.freeze({core: core.snapshot(), coordinator: coordinator.snapshot()})
  });

  function ownsCommand(command: unknown): command is LegacyCommand {
    return Boolean(command && typeof command === "object" && commandBindings.has(command));
  }

  function executeCommand(input: {
    readonly commandId: NotesCommandId;
    readonly command: LegacyCommand;
    readonly source?: CommitSource;
    readonly execute: () => LegacyExecution;
  }): LegacyExecution {
    if (!NOTES_COMMAND_IDS.includes(input.commandId)) throw new Error(`notes command 未登记：${input.commandId}`);
    if (!input.command || typeof input.command !== "object") throw new Error("notes command 必须是对象");
    commandBindings.set(input.command, input.commandId);
    try {
      const result = observeLegacyMutation({
        operationName: input.commandId,
        command: input.command,
        kind: "edit",
        source: input.source || "api",
        execute: input.execute
      });
      if (!result.executed) commandBindings.delete(input.command);
      return result;
    } catch (error) {
      if (!committedCommands.has(input.command)) commandBindings.delete(input.command);
      throw error;
    }
  }

  function executeHistory(input: {
    readonly action: "undo" | "redo";
    readonly command: LegacyCommand;
    readonly source?: CommitSource;
    readonly execute: () => LegacyExecution;
  }): LegacyExecution {
    if (!ownsCommand(input.command)) throw new Error("notes history command 未由 notes runtime 接纳");
    return observeLegacyMutation({
      operationName: `notes.history.${input.action}`,
      command: input.command,
      kind: input.action,
      source: input.source || "ui",
      execute: input.execute
    });
  }

  function observeLegacyMutation(input: {
    readonly operationName: string;
    readonly command: LegacyCommand;
    readonly kind: CommitKind;
    readonly source: CommitSource;
    readonly execute: () => LegacyExecution;
  }): LegacyExecution {
    const before = currentRevision();
    const operationId = (options.createOperationId?.() || `notes-operation-${++sequence}`) as OperationId;
    const binding = {
      bindingPhase: "pre-commit" as const,
      bindingKind: "compute" as const,
      operationId,
      transactionId: (options.createTransactionId?.() || `notes-transaction-${sequence}`) as TransactionId,
      operationName: input.operationName,
      sourceRevision: before,
      generationToken: 0 as GenerationToken,
      lockFingerprint: "notes:none" as LockFingerprint
    };
    core.beginShadowOperation({binding, kind: input.kind, source: input.source, projections: ["persistence", "ui"]});
    core.observeComputed(operationId);
    core.observeValidated(operationId);
    core.observeProjectionsPrepared(operationId);
    const notesBefore = notesFingerprint();
    const historyBefore = options.getHistoryFingerprint();
    const startedAt = now();
    let result: LegacyExecution;
    try {
      result = input.execute();
    } catch (error) {
      const committedAfter = detectCommittedTransition(before, historyBefore);
      if (committedAfter) {
        const commit = observeCommittedMutation(operationId, input, committedAfter, startedAt);
        settleProjections(commit, error);
        throw error;
      }
      assertUnchangedAfterRejectedMutation(notesBefore);
      core.observeRollback(operationId, `legacy ${input.operationName} rejected`);
      throw error;
    }
    if (!result?.executed) {
      const committedAfter = detectCommittedTransition(before, historyBefore);
      if (committedAfter) {
        const commit = observeCommittedMutation(operationId, input, committedAfter, startedAt);
        settleProjections(commit, result?.error || new Error(`legacy ${input.operationName} projection failed`));
        return {
          ...result,
          executed: true,
          command: result.command || input.command,
          result: result.result ?? input.command.getResult?.() ?? null
        };
      }
      assertUnchangedAfterRejectedMutation(notesBefore);
      core.observeRollback(operationId, result?.error ? `legacy ${input.operationName} failed` : `legacy ${input.operationName} noop`);
      return result;
    }
    const after = currentRevision();
    const commit = observeCommittedMutation(operationId, input, after, startedAt);
    settleProjections(commit);
    return result;
  }

  function observeCommittedMutation(
    operationId: OperationId,
    input: {readonly command: LegacyCommand; readonly operationName: string},
    after: InteractiveRevisionVector,
    startedAt: number
  ): CommitEnvelope {
    const commit = core.observeCanonicalCommit(operationId, {
      after,
      writeSet: ["notes"],
      affected: affectedRecord(input.command.effects?.affected),
      invalidated: ["object-panels"],
      rebuilt: [],
      timings: {legacyCommit: Math.max(0, now() - startedAt)}
    });
    committedCommands.add(input.command);
    core.observePublished(commit.commitId);
    return commit;
  }

  function settleProjections(commit: CommitEnvelope, uiError?: unknown): void {
    coordinator.attach(commit.commitId);
    try {
      persistenceSnapshot();
      coordinator.transition(commit.commitId, "persistence", "ready");
    } catch (error) {
      coordinator.transition(commit.commitId, "persistence", "degraded", error instanceof Error ? error.message : String(error));
    }
    if (uiError) coordinator.transition(commit.commitId, "ui", "degraded", uiError instanceof Error ? uiError.message : String(uiError));
    else coordinator.transition(commit.commitId, "ui", "ready");
  }

  function detectCommittedTransition(before: InteractiveRevisionVector, historyBefore: string): InteractiveRevisionVector | null {
    const after = currentRevision();
    const revisionChanged = !sameInteractiveRevision(before, after);
    const historyChanged = options.getHistoryFingerprint() !== historyBefore;
    if (revisionChanged !== historyChanged) throw new Error("notes legacy mutation 只推进了 revision 或 history 之一");
    return revisionChanged ? after : null;
  }

  function currentRevision(): InteractiveRevisionVector {
    const revision = options.getLegacyRevision();
    return adaptLegacyInteractiveRevision({
      ...revision,
      topologyRevision: revision.topologyRevision ?? 0,
      domainRevisions: {notes: revision.mapRevision}
    });
  }

  function listNotes(): readonly Readonly<Record<string, unknown>>[] {
    const serialized = core.readCanonical(map => JSON.stringify(readNotesArray(map)));
    return Object.freeze((JSON.parse(serialized) as Record<string, unknown>[]).map(note => Object.freeze(note)));
  }

  function getNote(id: string): Readonly<Record<string, unknown>> | null {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    return listNotes().find(note => note.id === normalizedId) || null;
  }

  function persistenceSnapshot(): NotesStore {
    const serialized = core.readCanonical(map => JSON.stringify(readNotesStore(map)));
    const source = JSON.parse(serialized) as {notes?: unknown; metadata?: unknown};
    const notes = Array.isArray(source.notes) ? source.notes : [];
    const metadata = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata) ? source.metadata as Record<string, unknown> : {};
    return Object.freeze({
      notes: Object.freeze(notes.map(note => Object.freeze(note as Record<string, unknown>))),
      metadata: Object.freeze({...metadata, notes: notes.length, formatVersion: 1})
    });
  }

  function notesFingerprint(): string {
    return core.readCanonical(map => JSON.stringify(readNotesStore(map)));
  }

  function assertUnchangedAfterRejectedMutation(before: string): void {
    if (notesFingerprint() !== before) throw new Error("notes legacy mutation 在未提交 history 时改写了 canonical owner");
  }
}

function affectedRecord(affected: readonly AffectedTarget[] | undefined): Readonly<Record<string, readonly string[]>> {
  const grouped: Record<string, string[]> = {};
  for (const target of affected || []) {
    const kind = String(target?.kind || "note").trim() || "note";
    const id = String(target?.id ?? "").trim();
    if (!id) continue;
    (grouped[kind] ||= []).push(id);
  }
  return Object.freeze(Object.fromEntries(Object.entries(grouped).map(([kind, ids]) => [kind, Object.freeze([...new Set(ids)])])));
}

function readNotesStore(map: unknown): unknown {
  if (!map || typeof map !== "object") return {notes: [], metadata: {notes: 0, formatVersion: 1}};
  const source = (map as {notes?: unknown}).notes;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {notes: [], metadata: {notes: 0, formatVersion: 1}};
  return source;
}

function readNotesArray(map: unknown): unknown[] {
  const store = readNotesStore(map) as {notes?: unknown};
  return Array.isArray(store.notes) ? store.notes : [];
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function sameInteractiveRevision(left: InteractiveRevisionVector, right: InteractiveRevisionVector): boolean {
  return left.runtimeMapSessionId === right.runtimeMapSessionId
    && left.canonicalRevision === right.canonicalRevision
    && left.topologyRevision === right.topologyRevision
    && left.domainRevisions.notes === right.domainRevisions.notes;
}
