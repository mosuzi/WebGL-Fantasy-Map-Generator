import {canAssignInheritanceParent, setInheritanceParent, summarizeInheritanceTree} from "../generator/inheritance.js";

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

export function createSetCultureColorCommand(cultureId, color, {beforeColor = null, label = "文化颜色"} = {}) {
  const normalizedCultureId = Number(cultureId);
  const after = normalizeHexColor(color);
  let before = beforeColor;
  let hadBeforeColor = beforeColor !== null && beforeColor !== undefined;

  return {
    label: `${label} #${normalizedCultureId}`,
    effects: {
      ...CULTURE_COLOR_EFFECTS,
      affected: [{kind: "culture", id: normalizedCultureId}]
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
    effects: {
      ...CULTURE_PARENT_EFFECTS,
      affected: [{kind: "culture", id: normalizedCultureId}]
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

function updateCultureTreeMetadata(map, cultures) {
  if (map?.society?.metadata) map.society.metadata.cultureTree = summarizeInheritanceTree(cultures);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
