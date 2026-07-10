import {canAssignInheritanceParent, setInheritanceParent, summarizeInheritanceTree} from "../generator/inheritance.js";
import {newObjectAffected} from "./edit-command-effects.js";

const RELIGION_COLOR_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["religion-color", "cell-colors", "object-panels"])
});

const RELIGION_PARENT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["religion-inheritance", "object-panels"])
});

const RELIGION_STRUCTURE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["religion-structure", "cell-colors", "object-index", "object-panels"])
});

export function createAddReligionCommand({name = "", label = "新增宗教"} = {}) {
  let religionId = null;
  const normalizedName = String(name || "").trim();

  return {
    label,
    domain: "religion",
    effects: {
      ...RELIGION_STRUCTURE_EFFECTS,
      affected: newObjectAffected("religion")
    },
    apply(context) {
      const stores = getReligionStores(context.map);
      const primary = stores[0];
      if (!primary) throw new Error("当前地图没有宗教数据");
      if (!religionId) religionId = nextReligionId(primary);
      const religion = createEmptyReligion(religionId, normalizedName || `新宗教 ${religionId}`);
      for (const store of stores) {
        if (store[religionId] && !store[religionId].removed) throw new Error(`宗教 #${religionId} 已存在`);
        store[religionId] = {...religion};
      }
      updateReligionTreeMetadata(context.map, primary);
      this.effects.affected = [{kind: "religion", id: religionId}];
    },
    revert(context) {
      if (!religionId) return;
      for (const store of getReligionStores(context.map)) {
        if (store[religionId]) delete store[religionId];
      }
      updateReligionTreeMetadata(context.map, getReligions(context.map));
    },
    isNoop(context) {
      return !getReligionStores(context.map).length;
    },
    getReligionId() {
      return religionId;
    }
  };
}

export function createDeleteReligionCommand(religionId, {label = "删除宗教"} = {}) {
  const normalizedReligionId = Number(religionId);
  let snapshots = null;

  return {
    label: `${label} #${normalizedReligionId}`,
    domain: "religion",
    effects: {
      ...RELIGION_STRUCTURE_EFFECTS,
      affected: [{kind: "religion", id: normalizedReligionId}]
    },
    apply(context) {
      const stores = getReligionStores(context.map);
      if (!stores.length) throw new Error("当前地图没有宗教数据");
      const primary = stores[0];
      const religion = primary?.[normalizedReligionId];
      if (!religion || religion.removed) throw new Error(`找不到宗教 #${normalizedReligionId}`);
      const blockers = religionDeleteBlockers(context.map, normalizedReligionId);
      if (blockers.length) throw new Error(`只能删除空宗教：${blockers.join("、")}`);
      snapshots ??= stores.map(store => ({store, value: cloneReligion(store[normalizedReligionId])}));
      for (const {store} of snapshots) {
        if (store[normalizedReligionId]) store[normalizedReligionId].removed = true;
      }
      updateReligionTreeMetadata(context.map, primary);
    },
    revert(context) {
      if (!snapshots) return;
      for (const {store, value} of snapshots) {
        store[normalizedReligionId] = cloneReligion(value);
      }
      updateReligionTreeMetadata(context.map, getReligions(context.map));
    },
    isNoop(context) {
      const religion = getReligions(context.map)?.[normalizedReligionId];
      return !religion || religion.removed || religionDeleteBlockers(context.map, normalizedReligionId).length > 0;
    }
  };
}

export function createSetReligionColorCommand(religionId, color, {beforeColor = null, label = "宗教颜色"} = {}) {
  const normalizedReligionId = Number(religionId);
  const after = normalizeHexColor(color);
  let before = beforeColor;
  let hadBeforeColor = beforeColor !== null && beforeColor !== undefined;

  return {
    label: `${label} #${normalizedReligionId}`,
    domain: "religion",
    effects: {
      ...RELIGION_COLOR_EFFECTS,
      affected: [{kind: "religion", id: normalizedReligionId}]
    },
    apply(context) {
      if (!after) throw new Error("宗教颜色必须是 #rrggbb");
      const religion = findReligion(context.map, normalizedReligionId);
      if (!religion) throw new Error(`找不到宗教 #${normalizedReligionId}`);
      if (before === null || before === undefined) {
        hadBeforeColor = Object.prototype.hasOwnProperty.call(religion, "color");
        before = religion.color ?? null;
      }
      religion.color = after;
    },
    revert(context) {
      const religion = findReligion(context.map, normalizedReligionId);
      if (!religion) throw new Error(`找不到宗教 #${normalizedReligionId}`);
      if (hadBeforeColor) religion.color = before;
      else delete religion.color;
    },
    isNoop(context) {
      const religion = findReligion(context.map, normalizedReligionId);
      return !religion || !after || religion.color === after;
    }
  };
}

export function createSetReligionParentCommand(religionId, parentId, {beforeParent = null, label = "宗教继承"} = {}) {
  const normalizedReligionId = Number(religionId);
  const after = Number(parentId) || 0;
  let before = beforeParent;

  return {
    label: `${label} #${normalizedReligionId}`,
    domain: "religion",
    effects: {
      ...RELIGION_PARENT_EFFECTS,
      affected: [{kind: "religion", id: normalizedReligionId}]
    },
    apply(context) {
      const religions = getReligions(context.map);
      const religion = religions?.[normalizedReligionId];
      if (!religion) throw new Error(`找不到宗教 #${normalizedReligionId}`);
      before ??= Number(religion.parent) || 0;
      if (!setInheritanceParent(religions, normalizedReligionId, after)) throw new Error("无法设置宗教继承父级");
      updateReligionTreeMetadata(context.map, religions);
    },
    revert(context) {
      const religions = getReligions(context.map);
      if (!religions?.[normalizedReligionId]) throw new Error(`找不到宗教 #${normalizedReligionId}`);
      if (!setInheritanceParent(religions, normalizedReligionId, before || 0)) throw new Error("无法恢复宗教继承父级");
      updateReligionTreeMetadata(context.map, religions);
    },
    isNoop(context) {
      const religions = getReligions(context.map);
      const religion = religions?.[normalizedReligionId];
      return !religion || (Number(religion.parent) || 0) === after || !canAssignInheritanceParent(religions, normalizedReligionId, after);
    }
  };
}

function findReligion(map, religionId) {
  return map?.society?.religions?.[religionId] || map?.pack?.religions?.[religionId] || null;
}

function getReligions(map) {
  return map?.society?.religions || map?.pack?.religions || [];
}

function getReligionStores(map) {
  const stores = [map?.society?.religions, map?.pack?.religions]
    .filter(store => Array.isArray(store));
  return stores.filter((store, index) => stores.indexOf(store) === index);
}

function nextReligionId(religions) {
  let maxId = 0;
  for (const religion of religions || []) {
    const id = Number(religion?.i ?? religion?.id);
    if (Number.isInteger(id)) maxId = Math.max(maxId, id);
  }
  return maxId + 1;
}

function createEmptyReligion(religionId, name) {
  return {
    i: religionId,
    id: religionId,
    name,
    type: "Organized",
    form: "Folk",
    deity: "none",
    expansion: "culture",
    expansionism: 1,
    culture: 0,
    parent: 0,
    children: [],
    depth: 0,
    center: -1,
    gridCenter: -1,
    cells: 0,
    area: 0,
    rural: 0,
    color: null,
    userCreated: true
  };
}

function religionDeleteBlockers(map, religionId) {
  const blockers = [];
  const religion = getReligions(map)?.[religionId];
  if (Number(religion?.cells) > 0 || packCellUsage(map, religionId) > 0 || gridCellUsage(map, religionId) > 0) blockers.push("仍有覆盖 cells");
  if ((religion?.children || []).some(childId => getReligions(map)?.[childId] && !getReligions(map)?.[childId]?.removed)) blockers.push("仍有子宗教");
  if ((map?.settlements?.cities || []).some(city => Number(city?.religion) === religionId)) blockers.push("仍有关联城市");
  if ((map?.pack?.burgs || []).some(burg => burg?.i && !burg.removed && Number(burg?.religion) === religionId)) blockers.push("仍有关联城镇");
  if ((map?.politics?.states || map?.pack?.states || []).some(state => state?.i && !state.removed && Number(state?.religion) === religionId)) blockers.push("仍有关联国家");
  return blockers;
}

function packCellUsage(map, religionId) {
  return countTypedArrayValue(map?.pack?.cells?.religion, religionId);
}

function gridCellUsage(map, religionId) {
  return countTypedArrayValue(map?.grid?.cells?.religion, religionId);
}

function countTypedArrayValue(values, target) {
  if (!values) return 0;
  let count = 0;
  for (const value of values) {
    if (Number(value) === target) count++;
  }
  return count;
}

function cloneReligion(religion) {
  return religion ? {...religion, children: Array.isArray(religion.children) ? [...religion.children] : []} : null;
}

function updateReligionTreeMetadata(map, religions) {
  if (map?.society?.metadata) map.society.metadata.religionTree = summarizeInheritanceTree(religions);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
