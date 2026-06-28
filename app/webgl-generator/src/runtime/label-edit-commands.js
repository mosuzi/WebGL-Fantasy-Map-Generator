import {LABEL_TARGET_KIND, OBJECT_KIND} from "./object-kinds.js";

const LABEL_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["labels", "object-panels"])
});

export function createAddCustomLabelCommand({text, x, y}) {
  const name = normalizeLabelText(text);
  const point = normalizePoint(x, y);
  let created = null;

  return {
    label: "新增手工标签",
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
    }
  };
}

export function createRenameCustomLabelCommand(labelId, nextText) {
  const id = Number(labelId);
  const text = normalizeLabelText(nextText);
  let previous = null;

  return {
    label: `重命名手工标签 #${id}`,
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

export function createDeleteLabelCommand(label) {
  const target = normalizeLabelTarget(label);
  let previous = null;

  return {
    label: target.targetKind === LABEL_TARGET_KIND.CUSTOM ? `删除手工标签 #${target.id}` : `隐藏${formatGeneratedLabelName(target)} #${target.id}`,
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

function normalizeLabelText(text) {
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
}

function normalizePoint(x, y) {
  return {
    x: Number(x),
    y: Number(y)
  };
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
