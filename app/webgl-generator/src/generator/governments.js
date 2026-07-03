import {getStateFullName} from "./names.js";
import {createRandom} from "./random.js";

const BASE_EFFECTS = Object.freeze({
  economyMultiplier: 1,
  taxMultiplier: 1,
  tradeMultiplier: 1,
  diplomacyAffinity: 0,
  diplomacyAggression: 0,
  vassalization: 1,
  militaryRecruitment: 1,
  militaryCapAdd: 0,
  militaryTarget: 1,
  unitRatios: Object.freeze({})
});

const SIZE_LABELS = Object.freeze({
  small: "小国",
  medium: "中等国家",
  large: "大国"
});

export const GOVERNMENT_TYPES = Object.freeze([
  {
    key: "monarchy",
    label: "君主制",
    category: "专制集权",
    era: "古代",
    family: "autocracy",
    legacyForm: "Monarchy",
    weight: 6,
    effects: {
      economyMultiplier: 1.02,
      taxMultiplier: 1.03,
      diplomacyAggression: 0.03,
      vassalization: 1.06,
      militaryRecruitment: 1.02,
      militaryCapAdd: 0.003,
      militaryTarget: 1.02,
      unitRatios: {infantry: 1.04, cavalry: 1.06}
    }
  },
  {
    key: "imperial_bureaucracy",
    label: "帝制官僚",
    category: "专制集权",
    era: "古代",
    family: "autocracy",
    legacyForm: "Monarchy",
    weight: 2.8,
    effects: {
      economyMultiplier: 1.08,
      taxMultiplier: 1.08,
      tradeMultiplier: 0.96,
      diplomacyAggression: 0.08,
      vassalization: 1.16,
      militaryRecruitment: 1.04,
      militaryCapAdd: 0.006,
      militaryTarget: 1.08,
      unitRatios: {infantry: 1.1, artillery: 1.12}
    }
  },
  {
    key: "feudal_monarchy",
    label: "封建王权",
    category: "分封君主",
    era: "古代",
    family: "monarchy",
    legacyForm: "Monarchy",
    weight: 4,
    effects: {
      economyMultiplier: 0.99,
      taxMultiplier: 0.97,
      diplomacyAffinity: 0.03,
      diplomacyAggression: 0.04,
      vassalization: 1.08,
      militaryRecruitment: 1.05,
      militaryCapAdd: 0.004,
      unitRatios: {cavalry: 1.18, infantry: 1.02}
    }
  },
  {
    key: "republic",
    label: "共和制",
    category: "共和政体",
    era: "近代",
    family: "republic",
    legacyForm: "Republic",
    weight: 2.3,
    effects: {
      economyMultiplier: 1.05,
      taxMultiplier: 0.98,
      tradeMultiplier: 1.08,
      diplomacyAffinity: 0.08,
      diplomacyAggression: -0.02,
      vassalization: 0.9,
      militaryRecruitment: 0.97,
      militaryCapAdd: -0.002,
      militaryTarget: 0.97,
      unitRatios: {archers: 1.08, artillery: 1.06}
    }
  },
  {
    key: "merchant_republic",
    label: "商业共和国",
    category: "共和政体",
    era: "近代",
    family: "republic",
    legacyForm: "Republic",
    weight: 1.8,
    effects: {
      economyMultiplier: 1.12,
      taxMultiplier: 0.95,
      tradeMultiplier: 1.18,
      diplomacyAffinity: 0.1,
      diplomacyAggression: -0.04,
      vassalization: 0.82,
      militaryRecruitment: 0.93,
      militaryCapAdd: -0.004,
      militaryTarget: 0.95,
      unitRatios: {fleet: 1.28, artillery: 1.18, cavalry: 0.84}
    }
  },
  {
    key: "federation",
    label: "联邦制",
    category: "复合国家",
    era: "近代",
    family: "republic",
    legacyForm: "Republic",
    weight: 1.7,
    effects: {
      economyMultiplier: 1.07,
      taxMultiplier: 0.96,
      tradeMultiplier: 1.12,
      diplomacyAffinity: 0.1,
      diplomacyAggression: -0.01,
      vassalization: 0.86,
      militaryRecruitment: 0.98,
      militaryCapAdd: 0.002,
      militaryTarget: 1.01,
      unitRatios: {infantry: 1.02, artillery: 1.08}
    }
  },
  {
    key: "confederation",
    label: "邦联制",
    category: "复合国家",
    era: "古代/近代",
    family: "league",
    legacyForm: "Union",
    weight: 1.3,
    effects: {
      economyMultiplier: 0.96,
      taxMultiplier: 0.88,
      tradeMultiplier: 1.08,
      diplomacyAffinity: 0.07,
      diplomacyAggression: -0.03,
      vassalization: 0.74,
      militaryRecruitment: 0.94,
      militaryCapAdd: -0.004,
      militaryTarget: 0.92,
      unitRatios: {infantry: 0.96, archers: 1.08}
    }
  },
  {
    key: "theocracy",
    label: "神权制",
    category: "宗教政体",
    era: "古代/近代",
    family: "theocracy",
    legacyForm: "Theocracy",
    weight: 1.5,
    effects: {
      economyMultiplier: 0.98,
      taxMultiplier: 1.02,
      diplomacyAffinity: 0.06,
      diplomacyAggression: 0.05,
      vassalization: 0.96,
      militaryRecruitment: 1.04,
      militaryCapAdd: 0.003,
      militaryTarget: 1.03,
      unitRatios: {infantry: 1.05, archers: 1.08}
    }
  },
  {
    key: "khanate",
    label: "汗廷",
    category: "草原君主",
    era: "古代",
    family: "autocracy",
    legacyForm: "Monarchy",
    weight: 1.2,
    effects: {
      economyMultiplier: 0.93,
      taxMultiplier: 0.92,
      tradeMultiplier: 0.98,
      diplomacyAggression: 0.13,
      vassalization: 1.08,
      militaryRecruitment: 1.16,
      militaryCapAdd: 0.012,
      militaryTarget: 1.12,
      unitRatios: {cavalry: 1.78, fleet: 0.62, artillery: 0.72}
    }
  },
  {
    key: "tribal_league",
    label: "部盟",
    category: "部族联盟",
    era: "古代",
    family: "league",
    legacyForm: "Tribal",
    weight: 1.4,
    effects: {
      economyMultiplier: 0.9,
      taxMultiplier: 0.82,
      diplomacyAffinity: 0.04,
      diplomacyAggression: 0.04,
      vassalization: 0.7,
      militaryRecruitment: 1.08,
      militaryCapAdd: 0.006,
      militaryTarget: 0.9,
      unitRatios: {archers: 1.16, cavalry: 1.08, artillery: 0.58}
    }
  },
  {
    key: "military_governorate",
    label: "军府",
    category: "军政体制",
    era: "古代/近代",
    family: "autocracy",
    legacyForm: "Military",
    weight: 1.1,
    effects: {
      economyMultiplier: 0.94,
      taxMultiplier: 1.04,
      tradeMultiplier: 0.9,
      diplomacyAggression: 0.12,
      vassalization: 1.02,
      militaryRecruitment: 1.2,
      militaryCapAdd: 0.014,
      militaryTarget: 1.2,
      unitRatios: {infantry: 1.16, cavalry: 1.08, artillery: 1.1}
    }
  },
  {
    key: "oligarchy",
    label: "寡头制",
    category: "贵族寡头",
    era: "古代/近代",
    family: "oligarchy",
    legacyForm: "Oligarchy",
    weight: 1.6,
    effects: {
      economyMultiplier: 1.04,
      taxMultiplier: 1,
      tradeMultiplier: 1.1,
      diplomacyAffinity: 0.03,
      diplomacyAggression: 0.02,
      vassalization: 0.94,
      militaryRecruitment: 0.96,
      militaryCapAdd: -0.001,
      militaryTarget: 0.98,
      unitRatios: {artillery: 1.08, cavalry: 1.04}
    }
  }
]);

export const GOVERNMENT_BY_KEY = Object.freeze(Object.fromEntries(GOVERNMENT_TYPES.map(item => [item.key, item])));

export const GOVERNMENT_OPTIONS = Object.freeze(
  GOVERNMENT_TYPES.map(item => Object.freeze({
    value: item.key,
    label: item.label,
    category: item.category,
    era: item.era
  }))
);

export function chooseStateGovernment(state, context = {}) {
  const size = context.size || classifyStateSize(state, context);
  const random = context.random || createGovernmentRandom(state, context);
  const definition = weightedGovernment(random, buildGovernmentWeights(state, size));
  const selfStyledGreat = shouldSelfStyleGreat(state, size, random, definition);
  const formName = chooseGovernmentSuffix(definition, {state, size, selfStyledGreat, random});
  return {
    key: definition.key,
    size,
    selfStyledGreat,
    formName
  };
}

export function applyStateGovernment(state, governmentChoice, context = {}) {
  if (!state) return null;
  const choice = typeof governmentChoice === "string" ? {key: governmentChoice} : governmentChoice || {};
  const definition = GOVERNMENT_BY_KEY[choice.key] || GOVERNMENT_BY_KEY.monarchy;
  const size = choice.size || classifyStateSize(state, context);
  const random = context.random || createGovernmentRandom(state, {...context, governmentKey: definition.key});
  const selfStyledGreat = choice.selfStyledGreat ?? shouldSelfStyleGreat(state, size, random, definition);
  const formName = choice.formName || chooseGovernmentSuffix(definition, {state, size, selfStyledGreat, random});
  const effects = normalizeEffects(definition.effects);
  state.name = stripStateSuffix(state.name) || state.name;

  state.governmentKey = definition.key;
  state.governmentLabel = definition.label;
  state.governmentFamily = definition.family;
  state.governmentCategory = definition.category;
  state.governmentEra = definition.era;
  state.governmentSize = size;
  state.selfStyledGreat = Boolean(selfStyledGreat);
  state.form = definition.legacyForm;
  state.formName = formName;
  state.fullName = getStateFullName(state.name, state.formName);
  state.government = {
    key: definition.key,
    label: definition.label,
    category: definition.category,
    family: definition.family,
    era: definition.era,
    legacyForm: definition.legacyForm,
    size,
    sizeLabel: SIZE_LABELS[size] || size,
    selfStyledGreat: Boolean(selfStyledGreat),
    suffix: formName,
    effects
  };
  return state.government;
}

export function setStateGovernment(map, stateId, governmentKey, context = {}) {
  const id = Number(stateId);
  const state = map?.politics?.states?.[id] || map?.pack?.states?.[id];
  if (!state?.i && !state?.id) return false;
  const states = map?.politics?.states || map?.pack?.states || [];
  applyStateGovernment(state, governmentKey, {...context, states});
  const packState = map?.pack?.states?.[id];
  if (packState && packState !== state) applyStateGovernment(packState, governmentKey, {...context, states});
  return true;
}

export function getGovernmentEffects(state) {
  const definition = GOVERNMENT_BY_KEY[state?.governmentKey] || GOVERNMENT_TYPES.find(item => item.legacyForm === state?.form) || GOVERNMENT_BY_KEY.monarchy;
  return normalizeEffects({...definition.effects, ...(state?.government?.effects || {})});
}

export function summarizeStateGovernments(states = []) {
  const summary = {};
  for (const state of states) {
    if (!state || state.removed || !(state.i > 0 || (state.i === undefined && Number.isInteger(state.id)))) continue;
    const label = state.governmentLabel || GOVERNMENT_BY_KEY[state.governmentKey]?.label || "未定义";
    summary[label] = (summary[label] || 0) + 1;
  }
  return summary;
}

export function governmentLabel(key) {
  return GOVERNMENT_BY_KEY[key]?.label || "未定义";
}

export function classifyStateSize(state, context = {}) {
  const states = (context.states || []).filter(item => item?.i && !item.removed);
  const areas = states.length
    ? states.map(item => Number(item.area || item.cells || 0)).filter(value => value > 0).sort((a, b) => a - b)
    : [];
  const area = Number(state?.area || state?.cells || 0);
  const medianArea = Number(context.medianArea || areas[Math.floor(areas.length / 2)] || area || 1);
  const largeAreas = [...areas].sort((a, b) => b - a);
  const empireThreshold = Number(context.empireThreshold || largeAreas[Math.max(0, Math.ceil(areas.length ** 0.4) - 2)] || medianArea * 2.5);
  if (area >= empireThreshold * 0.92 || area >= medianArea * 2.7) return "large";
  if (area >= medianArea * 0.82) return "medium";
  return "small";
}

function buildGovernmentWeights(state, size) {
  const weights = Object.fromEntries(GOVERNMENT_TYPES.map(item => [item.key, item.weight || 1]));
  const type = state?.type || "Generic";
  if (type === "Nomadic") multiply(weights, {khanate: 7, tribal_league: 2.6, military_governorate: 1.5, merchant_republic: 0.25, federation: 0.35});
  if (type === "Naval") multiply(weights, {merchant_republic: 4.6, republic: 2.1, federation: 1.5, monarchy: 1.25, khanate: 0.25});
  if (type === "Lake" || type === "River") multiply(weights, {merchant_republic: 2, federation: 1.45, theocracy: 1.25, imperial_bureaucracy: 1.2});
  if (type === "Highland") multiply(weights, {feudal_monarchy: 2, tribal_league: 1.8, theocracy: 1.3, merchant_republic: 0.55});
  if (type === "Hunting") multiply(weights, {tribal_league: 3.4, theocracy: 1.35, feudal_monarchy: 1.3, imperial_bureaucracy: 0.35});
  if (type === "Desert") multiply(weights, {theocracy: 2.2, monarchy: 1.8, khanate: 1.35, merchant_republic: 0.8});
  if (size === "large") multiply(weights, {imperial_bureaucracy: 3.6, monarchy: 1.35, federation: 1.6, republic: 1.25, tribal_league: 0.45, confederation: 0.65});
  if (size === "small") multiply(weights, {imperial_bureaucracy: 0.36, federation: 0.7, merchant_republic: 1.2, oligarchy: 1.35, tribal_league: 1.35});
  if (Number(state?.expansionism || 1) > 1.65) multiply(weights, {imperial_bureaucracy: 1.7, khanate: 1.5, military_governorate: 1.45, republic: 0.8});
  return weights;
}

function weightedGovernment(random, weights) {
  const entries = GOVERNMENT_TYPES.map(item => [item, Math.max(0, Number(weights[item.key] || 0))]).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return entries[0]?.[0] || GOVERNMENT_BY_KEY.monarchy;
}

function chooseGovernmentSuffix(definition, {state, size, selfStyledGreat, random}) {
  switch (definition.key) {
    case "imperial_bureaucracy":
      if (size === "large" || selfStyledGreat) return "帝国";
      return size === "medium" && random.next() < 0.28 ? "帝国" : "国";
    case "monarchy":
      if (size === "large" || selfStyledGreat) return random.next() < 0.78 ? "帝国" : "王国";
      if (size === "medium") return random.next() < 0.56 ? "王国" : "国";
      return random.next() < foreignKingdomRate(state) ? "王国" : "国";
    case "feudal_monarchy":
      if (size === "large" && (selfStyledGreat || random.next() < 0.35)) return "帝国";
      return size === "small" && random.next() < 0.62 ? "国" : "王国";
    case "republic":
      if (size === "small" && !selfStyledGreat) return random.next() < 0.62 ? "国" : "共和国";
      return "共和国";
    case "merchant_republic":
      if (size === "small" && !selfStyledGreat) return random.next() < 0.44 ? "国" : "共和国";
      return "共和国";
    case "federation":
      if (size === "large" || selfStyledGreat) return "联邦共和国";
      return size === "small" && random.next() < 0.46 ? "国" : "联邦";
    case "confederation":
      return size === "small" && random.next() < 0.58 ? "国" : "邦联";
    case "theocracy":
      return size === "small" && random.next() < 0.48 ? "国" : "教国";
    case "khanate":
      return size === "small" && random.next() < 0.22 ? "国" : "汗国";
    case "tribal_league":
      return size === "small" && random.next() < 0.52 ? "国" : "部盟";
    case "military_governorate":
      return size === "large" && selfStyledGreat ? "帝国" : "国";
    case "oligarchy":
      if (size === "large" || selfStyledGreat) return random.next() < 0.62 ? "共和国" : "国";
      return size === "medium" && random.next() < 0.35 ? "共和国" : "国";
    default:
      return "国";
  }
}

function shouldSelfStyleGreat(state, size, random, definition) {
  if (size === "large") return true;
  const expansion = Number(state?.expansionism || 1);
  const base = size === "medium" ? 0.1 : 0.035;
  const ambition = Math.max(0, expansion - 1.35) * 0.14;
  const autocracy = definition.family === "autocracy" ? 0.055 : 0;
  return random.next() < base + ambition + autocracy;
}

function foreignKingdomRate(state) {
  if (state?.type === "Naval" || state?.type === "Desert") return 0.28;
  if (state?.type === "Highland") return 0.2;
  return 0.12;
}

function multiply(weights, modifiers) {
  for (const [key, modifier] of Object.entries(modifiers)) {
    if (weights[key] !== undefined) weights[key] *= modifier;
  }
}

function normalizeEffects(effects = {}) {
  return {
    ...BASE_EFFECTS,
    ...effects,
    unitRatios: {
      ...(BASE_EFFECTS.unitRatios || {}),
      ...(effects.unitRatios || {})
    }
  };
}

function createGovernmentRandom(state, context = {}) {
  return createRandom([
    context.seed || "government",
    context.salt ?? "",
    context.governmentKey || "",
    state?.i ?? state?.id ?? "",
    state?.name || "",
    state?.type || "",
    state?.culture ?? "",
    state?.religion ?? ""
  ].join(":"));
}

function stripStateSuffix(name) {
  return String(name || "").replace(/(联邦共和国|共和国|王国|帝国|公国|侯国|伯国|海国|山国|泽国|河国|沙国|林国|教国|汗国|邦联|联邦|诸州|诸港|诸帐|诸部|部盟|林盟|海邦|湖邦|山邦|河邦|自由邦|邦|王朝|朝|国)$/u, "");
}
