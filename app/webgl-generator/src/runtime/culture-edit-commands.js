import {canAssignInheritanceParent, setInheritanceParent, summarizeInheritanceTree} from "../generator/inheritance.js";
import {newObjectAffected, objectAffected} from "./edit-command-effects.js";
import {createApplySocialAssignmentCommand, createDeleteSocialObjectCommand} from "./social-ownership-edit-commands.js";

const CULTURE_COLOR_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["culture-color", "cell-colors", "object-panels"])
});

const CULTURE_PARENT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["culture-inheritance", "object-panels"])
});

const CULTURE_STRUCTURE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["culture-structure", "cell-colors", "object-index", "object-panels"])
});

export function createAddCultureCommand({name = "", label = "新增文化"} = {}) {
  let cultureId = null;
  const normalizedName = String(name || "").trim();

  return {
    label,
    domain: "culture",
    effects: {
      ...CULTURE_STRUCTURE_EFFECTS,
      affected: newObjectAffected("culture")
    },
    apply(context) {
      const stores = getCultureStores(context.map);
      const primary = stores[0];
      if (!primary) throw new Error("当前地图没有文化数据");
      if (!cultureId) cultureId = nextCultureId(primary);
      const culture = createEmptyCulture(cultureId, normalizedName || `新文化 ${cultureId}`);
      for (const store of stores) {
        if (store[cultureId] && !store[cultureId].removed) throw new Error(`文化 #${cultureId} 已存在`);
        store[cultureId] = {...culture};
      }
      updateCultureTreeMetadata(context.map, primary);
      this.effects.affected = objectAffected("culture", cultureId);
    },
    revert(context) {
      if (!cultureId) return;
      for (const store of getCultureStores(context.map)) {
        if (store[cultureId]) delete store[cultureId];
      }
      updateCultureTreeMetadata(context.map, getCultures(context.map));
    },
    isNoop(context) {
      return !getCultureStores(context.map).length;
    },
    getCultureId() {
      return cultureId;
    }
  };
}

export function createDeleteCultureCommand(cultureId, {label = "删除文化"} = {}) {
  return createDeleteSocialObjectCommand("culture", cultureId, {label});
}

export function createApplyCultureAssignmentCommand(changes, options = {}) {
  return createApplySocialAssignmentCommand("culture", changes, options);
}

export function createSetCultureColorCommand(cultureId, color, {beforeColor = null, label = "文化颜色"} = {}) {
  const normalizedCultureId = Number(cultureId);
  const after = normalizeHexColor(color);
  let before = beforeColor;
  let hadBeforeColor = beforeColor !== null && beforeColor !== undefined;

  return {
    label: `${label} #${normalizedCultureId}`,
    domain: "culture",
    effects: {
      ...CULTURE_COLOR_EFFECTS,
      affected: objectAffected("culture", normalizedCultureId)
    },
    apply(context) {
      if (!after) throw new Error("文化颜色必须是 #rrggbb");
      const culture = findCulture(context.map, normalizedCultureId);
      if (!culture) throw new Error(`找不到文化 #${normalizedCultureId}`);
      if (before === null || before === undefined) {
        hadBeforeColor = Object.prototype.hasOwnProperty.call(culture, "color");
        before = culture.color ?? null;
      }
      culture.color = after;
    },
    revert(context) {
      const culture = findCulture(context.map, normalizedCultureId);
      if (!culture) throw new Error(`找不到文化 #${normalizedCultureId}`);
      if (hadBeforeColor) culture.color = before;
      else delete culture.color;
    },
    isNoop(context) {
      const culture = findCulture(context.map, normalizedCultureId);
      return !culture || !after || culture.color === after;
    }
  };
}

export function createSetCultureParentCommand(cultureId, parentId, {beforeParent = null, label = "文化继承"} = {}) {
  const normalizedCultureId = Number(cultureId);
  const after = Number(parentId) || 0;
  let before = beforeParent;

  return {
    label: `${label} #${normalizedCultureId}`,
    domain: "culture",
    effects: {
      ...CULTURE_PARENT_EFFECTS,
      affected: objectAffected("culture", normalizedCultureId)
    },
    apply(context) {
      const cultures = getCultures(context.map);
      const culture = cultures?.[normalizedCultureId];
      if (!culture) throw new Error(`找不到文化 #${normalizedCultureId}`);
      before ??= Number(culture.parent) || 0;
      if (!setInheritanceParent(cultures, normalizedCultureId, after)) throw new Error("无法设置文化继承父级");
      updateCultureTreeMetadata(context.map, cultures);
    },
    revert(context) {
      const cultures = getCultures(context.map);
      if (!cultures?.[normalizedCultureId]) throw new Error(`找不到文化 #${normalizedCultureId}`);
      if (!setInheritanceParent(cultures, normalizedCultureId, before || 0)) throw new Error("无法恢复文化继承父级");
      updateCultureTreeMetadata(context.map, cultures);
    },
    isNoop(context) {
      const cultures = getCultures(context.map);
      const culture = cultures?.[normalizedCultureId];
      return !culture || (Number(culture.parent) || 0) === after || !canAssignInheritanceParent(cultures, normalizedCultureId, after);
    }
  };
}

function findCulture(map, cultureId) {
  return map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
}

function getCultures(map) {
  return map?.society?.cultures || map?.pack?.cultures || [];
}

function getCultureStores(map) {
  const stores = [map?.society?.cultures, map?.pack?.cultures]
    .filter(store => Array.isArray(store));
  return stores.filter((store, index) => stores.indexOf(store) === index);
}

function nextCultureId(cultures) {
  let maxId = 0;
  for (const culture of cultures || []) {
    const id = Number(culture?.i ?? culture?.id);
    if (Number.isInteger(id)) maxId = Math.max(maxId, id);
  }
  return maxId + 1;
}

function createEmptyCulture(cultureId, name) {
  return {
    i: cultureId,
    id: cultureId,
    name,
    root: name.replace(/文化$/, ""),
    type: "Generic",
    nameStyle: "default",
    expansionism: 1,
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

function cloneCulture(culture) {
  return culture ? {...culture, children: Array.isArray(culture.children) ? [...culture.children] : []} : null;
}

function updateCultureTreeMetadata(map, cultures) {
  if (map?.society?.metadata) map.society.metadata.cultureTree = summarizeInheritanceTree(cultures);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
