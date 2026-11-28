const ALL_MAP_CHANGES = "*";

// 编辑历史拥有规范地图。这里仅发布已经落定的修订及其影响，不保存地图副本。
export function createMapStatePublication({readCurrent, canPublish, onError}) {
  const subscriptions = new Map();
  let pending = [];
  let scheduled = false;
  let published = {mapIdentity: null, mapRevision: 0};

  function schedule() {
    if (scheduled || !pending.length || !canPublish()) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  function flush() {
    scheduled = false;
    if (!canPublish() || !pending.length) return;
    const {map, revision} = readCurrent();
    const changes = pending.filter(({after}) => after.mapIdentity === revision.mapIdentity
      && after.mapRevision <= revision.mapRevision);
    pending = [];
    if (!changes.length) return;
    const replaced = published.mapIdentity !== revision.mapIdentity || changes.some(change => change.action === "replace");
    const keys = new Set([ALL_MAP_CHANGES]);
    const listeners = new Set(subscriptions.get(ALL_MAP_CHANGES));
    for (const change of changes) {
      if (change.domain) keys.add(change.domain);
      for (const tag of change.effects?.derived || []) keys.add(tag);
      for (const target of change.effects?.affected || []) keys.add(target.kind);
    }
    for (const key of replaced ? subscriptions.keys() : keys) {
      for (const listener of subscriptions.get(key) || []) listeners.add(listener);
    }
    const event = {map, before: published, after: revision, replaced, changes, keys};
    published = revision;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        onError(error);
      }
    }
  }

  return {
    subscribe(keys, listener) {
      const sets = [...new Set(keys)].map(key => {
        if (!subscriptions.has(key)) subscriptions.set(key, new Set());
        return subscriptions.get(key);
      });
      for (const set of sets) set.add(listener);
      return () => {
        for (const set of sets) set.delete(listener);
      };
    },
    record({action, command}, before, after) {
      pending.push({action, domain: command.domain, effects: command.effects, before, after});
      schedule();
    },
    restore(revision) {
      pending = pending.filter(({after}) => after.mapIdentity === revision.mapIdentity
        && after.mapRevision <= revision.mapRevision);
    },
    replace(after) {
      pending = [{action: "replace", before: published, after}];
      schedule();
    },
    schedule
  };
}
