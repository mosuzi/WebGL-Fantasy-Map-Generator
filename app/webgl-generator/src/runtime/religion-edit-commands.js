import {canAssignInheritanceParent, setInheritanceParent, summarizeInheritanceTree} from "../generator/inheritance.js";
import {newObjectAffected, objectAffected} from "./edit-command-effects.js";
import {createApplySocialAssignmentCommand, createDeleteSocialObjectCommand} from "./social-ownership-edit-commands.js";

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
      this.effects.affected = objectAffected("religion", religionId);
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
  return createDeleteSocialObjectCommand("religion", religionId, {label});
}

export function createApplyReligionAssignmentCommand(changes, options = {}) {
  return createApplySocialAssignmentCommand("religion", changes, options);
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
      affected: objectAffected("religion", normalizedReligionId)
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
      affected: objectAffected("religion", normalizedReligionId)
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
