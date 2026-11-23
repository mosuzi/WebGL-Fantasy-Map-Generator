import {getCellSuitability, MILITARY_UNITS} from "./military.js";

// 每千名居民可供手动征募的人数。分兵种极限可以重叠，但共用总动员上限。
const PER_THOUSAND = {
  Generic: {total: 60, infantry: 48, archers: 30, cavalry: 15, artillery: 6, fleet: 10},
  Nomadic: {total: 95, infantry: 40, archers: 42, cavalry: 75, artillery: 3, fleet: 4},
  Hunting: {total: 65, infantry: 42, archers: 46, cavalry: 12, artillery: 3, fleet: 6},
  Highland: {total: 60, infantry: 48, archers: 40, cavalry: 8, artillery: 6, fleet: 4},
  River: {total: 60, infantry: 42, archers: 32, cavalry: 12, artillery: 7, fleet: 22},
  Lake: {total: 60, infantry: 42, archers: 30, cavalry: 11, artillery: 7, fleet: 26},
  Naval: {total: 60, infantry: 36, archers: 28, cavalry: 8, artillery: 9, fleet: 38}
};
// 宗教组织仅轻调专长兵种，总动员资格相同。未识别的旧档类型沿用基础值。
const RELIGION_SPECIALTIES = {
  Folk: {archers: 1.04, cavalry: 1.04},
  Organized: {artillery: 1.05, fleet: 1.05},
  Cult: {archers: 1.03},
  Heresy: {infantry: 1.03}
};

const unitNames = MILITARY_UNITS.map(unit => unit.name);
const limitKeys = ["total", ...unitNames];
const sum = units => Object.values(units).reduce((total, value) => total + Number(value || 0), 0);

export function regimentManpower(regiment) {
  if (Object.keys(regiment.u || {}).length) return {...regiment.u};
  const fallback = regiment.dominantUnit || (regiment.n || regiment.type === "fleet" ? "fleet" : "infantry");
  return {[fallback]: Number(regiment.a) || 0};
}

export function editableMilitaryUnits(regiment) {
  const naval = Boolean(regiment.n || regiment.type === "fleet");
  return MILITARY_UNITS.filter(unit => (unit.name === "fleet") === naval || Number(regiment.u?.[unit.name]) > 0);
}

export function manpowerBudget(pack, state) {
  const cells = pack.cells || {};
  const cohorts = new Map();
  const sampled = {rural: 0, urban: 0};
  function add(source, population, culture, religion) {
    if (!(population > 0)) return;
    const key = `${culture}:${religion}`;
    let group = cohorts.get(key);
    if (!group) {
      group = {culture, religion, rural: 0, urban: 0};
      cohorts.set(key, group);
    }
    group[source] += population;
    sampled[source] += population;
  }
  for (let cell = 0; cell < (cells.state?.length || 0); cell++) {
    if (cells.state[cell] === state.i) add("rural", Number(cells.pop?.[cell]), cells.culture?.[cell], cells.religion?.[cell]);
  }
  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed || (burg.state ?? cells.state?.[burg.cell]) !== state.i) continue;
    add("urban", Number(burg.population), burg.culture ?? cells.culture?.[burg.cell], burg.religion ?? cells.religion?.[burg.cell]);
  }
  const limits = Object.fromEntries(limitKeys.map(key => [key, 0]));
  const totals = {};
  for (const source of ["rural", "urban"]) {
    totals[source] = Math.max(0, Number(state[source] ?? sampled[source]) || 0);
    // 少数旧档只有国家人口总数，没有该类人口的分布。
    if (!sampled[source]) add(source, totals[source], state.culture, state.religion);
  }
  for (const cohort of cohorts.values()) {
    const population = cohort.rural * totals.rural / (sampled.rural || 1) + cohort.urban * totals.urban / (sampled.urban || 1);
    const culture = pack.cultures?.[cohort.culture];
    const type = culture && !culture.removed ? culture.type : state.type;
    const profile = Object.hasOwn(PER_THOUSAND, type) ? PER_THOUSAND[type] : PER_THOUSAND.Generic;
    const religion = pack.religions?.[cohort.religion];
    const specialty = !religion?.removed && Object.hasOwn(RELIGION_SPECIALTIES, religion?.type) ? RELIGION_SPECIALTIES[religion.type] : null;
    for (const key of limitKeys) limits[key] += population * profile[key] * (specialty?.[key] ?? 1);
  }
  for (const key of limitKeys) limits[key] = Math.floor(limits[key] + 1e-8);
  return {population: Math.round((totals.rural + totals.urban) * 1000), limits};
}

export function manpowerContext(pack, state, regiment) {
  const budget = manpowerBudget(pack, state);
  const others = {};
  for (const other of state.military || []) {
    if (other.i === regiment.i) continue;
    for (const [key, value] of Object.entries(regimentManpower(other))) others[key] = (others[key] || 0) + Number(value);
  }
  return {...budget, others, otherTotal: sum(others), current: regimentManpower(regiment), editable: editableMilitaryUnits(regiment)};
}

export function inspectManpower(context, draft) {
  const {limits, current, others, otherTotal, editable} = context;
  const units = {...current};
  for (const key of Object.keys(draft)) {
    if (!editable.some(unit => unit.name === key)) return {error: "此军团不能编入该兵种。"};
    const value = draft[key];
    if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
      return {error: "人数须为零或正整数。"};
    }
    if (Number(value) || Object.hasOwn(current, key)) units[key] = Number(value);
  }
  const total = sum(units);
  const national = {...others};
  for (const [key, value] of Object.entries(units)) national[key] = (national[key] || 0) + Number(value);
  const nationalTotal = otherTotal + total;
  let error = "";
  for (const unit of editable) {
    const key = unit.name;
    const available = Math.max(0, limits[key] - (others[key] || 0));
    if (units[key] > Math.max(current[key] || 0, available)) {
      error = `全国${unit.label}额度不足，本军团最多可编入 ${available.toLocaleString("zh-CN")} 人。`;
      break;
    }
  }
  if (!error && nationalTotal > limits.total && total > sum(current)) error = "全国总兵力将超过动员上限，请减少人数。";
  return {error, units, total, national, nationalTotal, changed: editable.some(({name}) => (units[name] || 0) !== (current[name] || 0))};
}

function loadFactor(used, limit) {
  const pressure = Math.max(0, Math.min(1, 2 * used / Math.max(1, limit) - 1));
  return 1 - 0.8 * pressure ** 2;
}

export function manpowerFitness(pack, regiment, units, limits, national, nationalTotal) {
  const total = sum(units);
  const dominant = Object.keys(units).reduce((best, key) => units[key] > (units[best] || 0) ? key : best, regiment.dominantUnit || (regiment.n ? "fleet" : "infantry"));
  const unit = MILITARY_UNITS.find(({name}) => name === dominant) || MILITARY_UNITS[0];
  const local = getCellSuitability(pack, regiment.cell, unit.name, total);
  const weighted = Object.entries(units).reduce((score, [key, count]) =>
    score + count * (limits[key] === undefined ? 1 : loadFactor(national[key], limits[key])), 0);
  const factor = total ? Math.min(loadFactor(nationalTotal, limits.total), weighted / total) : 0;
  const suitability = {...local, total: Math.round(100 * Math.min(1, local.total) * factor) / 100};
  return {suitability, dominantUnit: dominant, dominantUnitLabel: unit.label, movementSpeed: Math.round(100 * unit.speed * suitability.total) / 100};
}
