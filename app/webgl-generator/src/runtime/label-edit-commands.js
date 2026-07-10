import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";

const LABEL_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["labels", "object-panels"])
});

const LABEL_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

export function createAddCustomLabelCommand({text, x, y}) {
  const name = normalizeLabelText(text);
  const point = normalizePoint(x, y);
  let created = null;

  return {
    label: "新增手工标签",
    domain: OBJECT_KIND.LABEL,
    effects: {
      ...LABEL_EFFECTS,
      affected: []
    },
    apply(context) {
      if (!name) throw new Error("标签文字不能为空");
      const store = ensureLabelStore(context.map);
      created ??= {
        id: nextCustomLabelId(store),
        text: name,
        x: point.x,
        y: point.y,
        createdAt: new Date().toISOString()
      };
      store.custom.push({...created});
      updateLabelMetadata(store);
      this.effects.affected = [{kind: OBJECT_KIND.LABEL, id: created.id}];
    },
    revert(context) {
      const store = ensureLabelStore(context.map);
      store.custom = store.custom.filter(label => label.id !== created?.id);
      updateLabelMetadata(store);
    },
    isNoop() {
      return !name || !Number.isFinite(point.x) || !Number.isFinite(point.y);
    },
    getCreatedLabel() {
      return created ? {...created} : null;
    },
    setCreatedPoint(nextPoint) {
      if (!created) return;
      const normalized = normalizePoint(nextPoint?.x, nextPoint?.y);
      if (!Number.isFinite(normalized.x) || !Number.isFinite(normalized.y)) return;
      created.x = normalized.x;
      created.y = normalized.y;
    }
  };
}

export function createMoveCustomLabelCommand(labelId, nextPoint, {previousPoint = null} = {}) {
  const id = Number(labelId);
  const next = normalizePoint(nextPoint?.x, nextPoint?.y);
  let previous = previousPoint ? normalizePoint(previousPoint.x, previousPoint.y) : null;

  return {
    label: `移动手工标签 #${id}`,
    domain: OBJECT_KIND.LABEL,
    effects: {
      ...LABEL_EFFECTS,
      affected: [{kind: OBJECT_KIND.LABEL, id}]
    },
    apply(context) {
      const label = findCustomLabel(context.map, id);
      if (!label) throw new Error(`找不到手工标签 #${id}`);
      previous ??= {x: label.x, y: label.y};
      label.x = next.x;
      label.y = next.y;
    },
    revert(context) {
      const label = findCustomLabel(context.map, id);
      if (!label || !previous) throw new Error(`无法恢复手工标签 #${id}`);
      label.x = previous.x;
      label.y = previous.y;
    },
    isNoop(context) {
      if (!Number.isInteger(id) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return true;
      const label = findCustomLabel(context.map, id);
      if (!label) return true;
      const base = previous || label;
      return samePoint(base, next);
    }
  };
}

export function createRenameCustomLabelCommand(labelId, nextText) {
  const id = Number(labelId);
  const text = normalizeLabelText(nextText);
  let previous = null;

  return {
    label: `重命名手工标签 #${id}`,
    domain: OBJECT_KIND.LABEL,
    effects: {
      ...LABEL_EFFECTS,
      affected: [{kind: OBJECT_KIND.LABEL, id}]
    },
    apply(context) {
      if (!text) throw new Error("标签文字不能为空");
      const label = findCustomLabel(context.map, id);
      if (!label) throw new Error(`找不到手工标签 #${id}`);
      previous ??= {...label};
      label.text = text;
    },
    revert(context) {
      const label = findCustomLabel(context.map, id);
      if (!label || !previous) throw new Error(`无法恢复手工标签 #${id}`);
      Object.assign(label, previous);
    },
    isNoop(context) {
      const label = findCustomLabel(context.map, id);
      return !label || !text || label.text === text;
    }
  };
}

export function createSetLabelNoteCommand(label, body, {name = ""} = {}) {
  const target = normalizeLabelTarget(label);
  const noteTarget = labelNoteTarget(target);
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑标签备注 #${target.targetKind}:${target.id}` : `清空标签备注 #${target.targetKind}:${target.id}`,
    domain: OBJECT_KIND.LABEL,
    effects: {
      ...LABEL_NOTE_EFFECTS,
      affected: [{kind: OBJECT_KIND.LABEL, id: target.id}]
    },
    apply(context) {
      const currentName = readLabelName(context.map, target);
      if (!currentName) throw new Error(`找不到标签 #${target.targetKind}:${target.id}`);
      previous ??= cloneObjectNote(readObjectNote(context.map, noteTarget));
      if (!normalizedBody) {
        deleteObjectNote(context.map, noteTarget);
        return;
      }
      next ??= createLabelNoteSnapshot(noteTarget, normalizedBody, {
        name: name || currentName,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, noteTarget);
    },
    isNoop(context) {
      if (!readLabelName(context.map, target)) return true;
      const current = readObjectNote(context.map, noteTarget)?.body || "";
      return current === normalizedBody;
    }
  };
}

export function createDeleteLabelCommand(label) {
  const target = normalizeLabelTarget(label);
  let previous = null;

  return {
    label: target.targetKind === LABEL_TARGET_KIND.CUSTOM ? `删除手工标签 #${target.id}` : `隐藏${formatGeneratedLabelName(target)} #${target.id}`,
    domain: OBJECT_KIND.LABEL,
    effects: {
      ...LABEL_EFFECTS,
      affected: [{kind: OBJECT_KIND.LABEL, id: target.id}]
    },
    apply(context) {
      const store = ensureLabelStore(context.map);
      if (target.targetKind === LABEL_TARGET_KIND.CUSTOM) {
        const index = store.custom.findIndex(item => item.id === target.id);
        if (index < 0) throw new Error(`找不到手工标签 #${target.id}`);
        previous ??= {index, label: {...store.custom[index]}};
        store.custom.splice(index, 1);
        updateLabelMetadata(store);
        return;
      }

      const hidden = ensureHiddenList(store, target.targetKind);
      previous ??= {wasHidden: hidden.includes(target.id)};
      if (!hidden.includes(target.id)) hidden.push(target.id);
      updateLabelMetadata(store);
    },
    revert(context) {
      const store = ensureLabelStore(context.map);
      if (target.targetKind === LABEL_TARGET_KIND.CUSTOM) {
        if (!previous?.label) throw new Error(`缺少手工标签 #${target.id} 快照`);
        store.custom.splice(Math.min(previous.index, store.custom.length), 0, {...previous.label});
        updateLabelMetadata(store);
        return;
      }

      const hidden = ensureHiddenList(store, target.targetKind);
      if (!previous?.wasHidden) removeId(hidden, target.id);
      updateLabelMetadata(store);
    },
    isNoop(context) {
      const store = ensureLabelStore(context.map);
      if (target.targetKind === LABEL_TARGET_KIND.CUSTOM) return !store.custom.some(item => item.id === target.id);
      return ensureHiddenList(store, target.targetKind).includes(target.id);
    }
  };
}

export function createRestoreGeneratedLabelCommand(label) {
  const target = normalizeLabelTarget(label);

  return {
    label: `恢复${formatGeneratedLabelName(target)} #${target.id}`,
    domain: OBJECT_KIND.LABEL,
    effects: {
      ...LABEL_EFFECTS,
      affected: [{kind: OBJECT_KIND.LABEL, id: target.id}]
    },
    apply(context) {
      const store = ensureLabelStore(context.map);
      removeId(ensureHiddenList(store, target.targetKind), target.id);
      updateLabelMetadata(store);
    },
    revert(context) {
      const store = ensureLabelStore(context.map);
      const hidden = ensureHiddenList(store, target.targetKind);
      if (!hidden.includes(target.id)) hidden.push(target.id);
      updateLabelMetadata(store);
    },
    isNoop(context) {
      const store = ensureLabelStore(context.map);
      return target.targetKind === LABEL_TARGET_KIND.CUSTOM || !ensureHiddenList(store, target.targetKind).includes(target.id);
    }
  };
}

export function ensureLabelStore(map) {
  if (!map.labels) map.labels = {};
  if (!Array.isArray(map.labels.custom)) map.labels.custom = [];
  if (!map.labels.hidden || typeof map.labels.hidden !== "object") map.labels.hidden = {};
  if (!Array.isArray(map.labels.hidden[LABEL_TARGET_KIND.CITY])) map.labels.hidden[LABEL_TARGET_KIND.CITY] = [];
  if (!Array.isArray(map.labels.hidden[LABEL_TARGET_KIND.STATE])) map.labels.hidden[LABEL_TARGET_KIND.STATE] = [];
  map.labels.metadata = {
    custom: map.labels.custom.length,
    hidden: map.labels.hidden[LABEL_TARGET_KIND.CITY].length + map.labels.hidden[LABEL_TARGET_KIND.STATE].length
  };
  return map.labels;
}

export function isGeneratedLabelHidden(map, targetKind, targetId) {
  const hidden = map?.labels?.hidden?.[targetKind];
  return Array.isArray(hidden) && hidden.includes(Number(targetId));
}

function findCustomLabel(map, id) {
  return ensureLabelStore(map).custom.find(label => label.id === id) || null;
}

function nextCustomLabelId(store) {
  return store.custom.reduce((max, label) => Math.max(max, Number(label?.id) || 0), 0) + 1;
}

function ensureHiddenList(store, targetKind) {
  if (!Array.isArray(store.hidden[targetKind])) store.hidden[targetKind] = [];
  return store.hidden[targetKind];
}

function normalizeLabelTarget(label) {
  return {
    id: Number(label?.targetId ?? label?.id),
    targetKind: label?.targetKind || LABEL_TARGET_KIND.CITY
  };
}

function labelNoteTarget(target) {
  return {
    kind: OBJECT_KIND.LABEL,
    id: `${target.targetKind}:${target.id}`
  };
}

function readLabelName(map, target) {
  if (target.targetKind === LABEL_TARGET_KIND.CUSTOM) {
    return findCustomLabel(map, target.id)?.text || "";
  }
  if (target.targetKind === LABEL_TARGET_KIND.STATE) {
    const state = map?.politics?.states?.[target.id];
    return state?.fullName || state?.name || "";
  }
  const city = map?.settlements?.cities?.[target.id];
  return city?.name || "";
}

function normalizeLabelText(text) {
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
}

function createLabelNoteSnapshot(target, body, {name, previous = null} = {}) {
  const now = new Date().toISOString();
  return {
    id: objectNoteId(target),
    kind: target.kind,
    objectId: target.id,
    name,
    body,
    format: "plain",
    pinned: previous?.pinned || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}

function normalizePoint(x, y) {
  return {
    x: Number(x),
    y: Number(y)
  };
}

function samePoint(a, b) {
  return Math.abs(Number(a?.x) - Number(b?.x)) < 0.01 && Math.abs(Number(a?.y) - Number(b?.y)) < 0.01;
}

function removeId(list, id) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
}

function updateLabelMetadata(store) {
  store.metadata = {
    custom: store.custom.length,
    hidden: store.hidden[LABEL_TARGET_KIND.CITY].length + store.hidden[LABEL_TARGET_KIND.STATE].length
  };
}

function formatGeneratedLabelName(target) {
  return target.targetKind === LABEL_TARGET_KIND.STATE ? "国家名称" : "城市标签";
}
