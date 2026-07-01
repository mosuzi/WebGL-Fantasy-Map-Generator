import {canAssignInheritanceParent, setInheritanceParent, summarizeInheritanceTree} from "../generator/inheritance.js";

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

export function createSetReligionColorCommand(religionId, color, {beforeColor = null, label = "宗教颜色"} = {}) {
  const normalizedReligionId = Number(religionId);
  const after = normalizeHexColor(color);
  let before = beforeColor;
  let hadBeforeColor = beforeColor !== null && beforeColor !== undefined;

  return {
    label: `${label} #${normalizedReligionId}`,
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

function updateReligionTreeMetadata(map, religions) {
  if (map?.society?.metadata) map.society.metadata.religionTree = summarizeInheritanceTree(religions);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
