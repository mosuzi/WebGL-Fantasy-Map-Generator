import {
  REGENERATION_LOCK_VERSION,
  assertRegenerationLockKind,
  ensureRegenerationLockStore,
  normalizeRegenerationLockReferences,
  normalizeRegenerationLockStore,
  regenerationLockKey
} from "./regeneration-locks.js";

const REGENERATION_LOCK_LIFECYCLE = Symbol("regeneration-lock-lifecycle");

export function createSetRegenerationLockCommand(reference, locked, options = {}) {
  return createSetRegenerationLocksCommand([reference], locked, {
    label: options.label || (locked ? "锁定重生成对象" : "解除重生成对象锁定")
  });
}

export function createSetRegenerationLocksCommand(references, locked, {label = locked ? "批量锁定重生成对象" : "批量解除重生成对象锁定"} = {}) {
  let before = null;
  let result = null;
  return {
    label,
    domain: "regeneration-locks",
    effects: {
      render: "none",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: false,
      derived: ["object-panels"],
      affected: []
    },
    isNoop({map}) {
      const normalized = normalizeRegenerationLockReferences(references, map);
      const current = new Set(ensureRegenerationLockStore(map).entries.map(regenerationLockKey));
      return normalized.every(reference => current.has(regenerationLockKey(reference)) === Boolean(locked));
    },
    apply({map}) {
      const normalized = normalizeRegenerationLockReferences(references, map);
      before = cloneStore(ensureRegenerationLockStore(map));
      const currentKeys = new Set(before.entries.map(regenerationLockKey));
      const changedReferences = normalized.filter(reference => currentKeys.has(regenerationLockKey(reference)) !== Boolean(locked));
      const keys = new Set(normalized.map(regenerationLockKey));
      const retained = before.entries.filter(entry => !keys.has(regenerationLockKey(entry)));
      const entries = locked ? [...retained, ...normalized] : retained;
      map.regenerationLocks = normalizeRegenerationLockStore({version: REGENERATION_LOCK_VERSION, entries}, map, {strict: true}).store;
      this.effects.affected = changedReferences.map(entry => ({...entry}));
      result = {
        changed: changedReferences.length,
        unchanged: normalized.length - changedReferences.length,
        locked: Boolean(locked),
        references: normalized.map(entry => ({...entry}))
      };
    },
    revert({map}) {
      map.regenerationLocks = cloneStore(before);
    },
    getResult() {
      return result;
    }
  };
}

export function createClearRegenerationLocksCommand(kind, {label = "清除领域重生成锁定"} = {}) {
  const normalizedKind = assertRegenerationLockKind(kind);
  let before = null;
  let result = null;
  return {
    label,
    domain: "regeneration-locks",
    effects: {
      render: "none",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: false,
      derived: ["object-panels"],
      affected: []
    },
    isNoop({map}) {
      return !ensureRegenerationLockStore(map).entries.some(entry => entry.kind === normalizedKind);
    },
    apply({map}) {
      before = cloneStore(ensureRegenerationLockStore(map));
      const removed = before.entries.filter(entry => entry.kind === normalizedKind);
      map.regenerationLocks = {
        version: REGENERATION_LOCK_VERSION,
        entries: before.entries.filter(entry => entry.kind !== normalizedKind).map(entry => ({...entry}))
      };
      this.effects.affected = removed.map(entry => ({...entry}));
      result = {changed: removed.length, unchanged: 0, kind: normalizedKind, references: removed.map(entry => ({...entry}))};
    },
    revert({map}) {
      map.regenerationLocks = cloneStore(before);
    },
    getResult() {
      return result;
    }
  };
}

export function attachRegenerationLockDeletionLifecycle(command) {
  if (!command || command[REGENERATION_LOCK_LIFECYCLE] || !/(删除|移除)/.test(String(command.label || ""))) return command;
  const apply = command.apply.bind(command);
  const revert = command.revert.bind(command);
  let beforeLocks = null;
  command.apply = context => {
    beforeLocks = context?.map?.regenerationLocks ? cloneStore(ensureRegenerationLockStore(context.map)) : null;
    apply(context);
    if (beforeLocks) context.map.regenerationLocks = normalizeRegenerationLockStore(context.map.regenerationLocks, context.map).store;
  };
  command.revert = context => {
    revert(context);
    if (beforeLocks) context.map.regenerationLocks = cloneStore(beforeLocks);
  };
  Object.defineProperty(command, REGENERATION_LOCK_LIFECYCLE, {value: true});
  return command;
}

function cloneStore(store) {
  return {
    version: REGENERATION_LOCK_VERSION,
    entries: (store?.entries || []).map(entry => ({...entry}))
  };
}
