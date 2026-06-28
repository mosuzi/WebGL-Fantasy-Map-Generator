const CULTURE_COLOR_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["culture-color", "cell-colors", "object-panels"])
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

function findCulture(map, cultureId) {
  return map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
