import {createRandom} from "./random.js";
import {getGovernmentEffects} from "./governments.js";

export const MILITARY_UNITS = Object.freeze([
  {name: "infantry", label: "步兵", icon: "infantry", rural: 0.25, urban: 0.2, baseRatio: 0.46, type: "melee", separate: 0, speed: 0.78},
  {name: "archers", label: "弓兵", icon: "archers", rural: 0.12, urban: 0.2, baseRatio: 0.22, type: "ranged", separate: 0, speed: 0.82},
  {name: "cavalry", label: "骑兵", icon: "cavalry", rural: 0.12, urban: 0.03, baseRatio: 0.16, type: "mounted", separate: 0, speed: 1.22},
  {name: "artillery", label: "器械", icon: "artillery", rural: 0, urban: 0.03, baseRatio: 0.06, type: "machinery", separate: 0, speed: 0.48},
  {name: "fleet", label: "舰队", icon: "fleet-small", rural: 0, urban: 0.015, baseRatio: 0.1, type: "naval", separate: 1, speed: 0.9}
]);

export const MILITARY_STATUSES = Object.freeze({
  patrolling: {value: "patrolling", label: "巡逻中"},
  marching: {value: "marching", label: "行军中"},
  resting: {value: "resting", label: "修整中"},
  mustering: {value: "mustering", label: "集结中"},
  routed: {value: "routed", label: "败逃中"},
  garrisoned: {value: "garrisoned", label: "驻防中"}
});

const STATE_MODIFIERS = {
  melee: {Nomadic: 0.5, Highland: 1.2, Lake: 1, Naval: 0.7, Hunting: 1.2, River: 1.1, Generic: 1},
  ranged: {Nomadic: 0.9, Highland: 1.3, Lake: 1, Naval: 0.8, Hunting: 2, River: 0.8, Generic: 1},
  mounted: {Nomadic: 2.3, Highland: 0.6, Lake: 0.7, Naval: 0.3, Hunting: 0.7, River: 0.8, Generic: 1},
  machinery: {Nomadic: 0.8, Highland: 1.4, Lake: 1.1, Naval: 1.4, Hunting: 0.4, River: 1.1, Generic: 1},
  naval: {Nomadic: 0.5, Highland: 0.5, Lake: 1.2, Naval: 1.8, Hunting: 0.7, River: 1.2, Generic: 1}
};

const TERRAIN_MODIFIERS = {
  generic: {melee: 1, ranged: 1, mounted: 1, machinery: 1, naval: 1},
  nomadic: {melee: 0.2, ranged: 0.5, mounted: 3, machinery: 0.4, naval: 0.3},
  wetland: {melee: 0.8, ranged: 2, mounted: 0.3, machinery: 1.2, naval: 1},
  highland: {melee: 1.2, ranged: 1.6, mounted: 0.3, machinery: 3, naval: 1}
};

const CIVILIZATION_CAP_RATIOS = Object.freeze({
  nomadic: 0.075,
  frontier: 0.06,
  hunting: 0.05,
  highland: 0.045,
  marine: 0.04,
  agrarian: 0.035,
  merchant: 0.032
});

const CIVILIZATION_RECRUITMENT = Object.freeze({
  nomadic: 1.42,
  frontier: 1.28,
  hunting: 1.12,
  highland: 1.04,
  marine: 1,
  agrarian: 0.92,
  merchant: 0.82
});

const CIVILIZATION_RATIO_MODIFIERS = Object.freeze({
  nomadic: {infantry: 0.65, archers: 0.92, cavalry: 2.2, artillery: 0.42, fleet: 0.36},
  agrarian: {infantry: 1.18, archers: 1.08, cavalry: 0.92, artillery: 0.82, fleet: 0.62},
  hunting: {infantry: 0.92, archers: 1.75, cavalry: 0.58, artillery: 0.38, fleet: 0.55},
  marine: {infantry: 0.9, archers: 0.86, cavalry: 0.48, artillery: 1.08, fleet: 2.35},
  merchant: {infantry: 0.95, archers: 0.95, cavalry: 0.82, artillery: 1.55, fleet: 1.25},
  highland: {infantry: 1.25, archers: 1.45, cavalry: 0.42, artillery: 1.1, fleet: 0.36},
  frontier: {infantry: 1.18, archers: 1.22, cavalry: 1.12, artillery: 0.62, fleet: 0.48}
});

const WAR_RELATIONS = new Set(["Enemy", "Rival", "Suspicion"]);
const REGIMENT_ICON_LABELS = Object.freeze({
  "fleet-large": "大舰队",
  "fleet-small": "小舰队",
  "archers": "弓兵",
  "archers-heavy": "重装弓兵",
  "cavalry": "骑兵",
  "cavalry-heavy": "重骑兵",
  "infantry": "步兵",
  "infantry-heavy": "重步兵",
  "mountain": "山地兵",
  "artillery": "器械"
});

export function buildMilitary(pack, options = {}) {
  const startedAt = performance.now();
  const states = pack?.states || [];
  const cells = pack?.cells;
  if (!cells?.i || !states.length) return emptyMilitaryResult(startedAt);

  const random = createRandom(`${options.seed}:military`);
  const validStates = states.filter(state => state?.i && !state.removed);
  const averageArea = average(validStates.map(state => state.area || 0)) || 1;
  const averageExpansion = average(validStates.map(state => state.expansionism || 1)) || 1;
  const stateCells = collectStateCells(cells, validStates);
  const stateBurgs = collectStateBurgs(pack.burgs || [], validStates);
  const densityFactor = getRegimentDensityFactor(cells);
  const spatialMerge = shouldUseSpatialRegimentMerging(options);

  for (const state of states) {
    if (!state) continue;
    state.military = [];
  }

  for (const state of validStates) {
    const diplomacyPressure = getStateDiplomacyPressure(state, states);
    const resourcePressure = getStateResourcePressure(state, states);
    const alert = getStateAlert(state, averageArea, averageExpansion, diplomacyPressure);
    state.alert = alert;
    const cellsForState = stateCells.get(state.i) || [];
    const burgsForState = stateBurgs.get(state.i) || [];
    const policy = buildMilitaryPolicy({state, burgsForState, diplomacyPressure, resourcePressure, alert});
    state.militaryPolicy = policy;
    const targetDetails = getStateRegimentTargetDetails(state, cellsForState, burgsForState, alert, densityFactor, options, policy);
    const target = targetDetails.finalTarget;
    const nodes = createMilitaryNodes({pack, state, cellsForState, burgsForState, target, alert, policy, random});
    state.military = createRegiments({pack, state, nodes, target, spatialMerge, policy, random});
    state.militaryPolicy.generatedTroops = round(sumRegimentTroops(state.military));
    state.militaryDiagnostics = describeStateMilitaryFunnel({
      pack,
      state,
      cellsForState,
      burgsForState,
      targetDetails,
      nodes,
      regiments: state.military,
      spatialMerge
    });
  }

  const fronts = buildMilitaryFronts(pack, validStates);
  const campaigns = buildMilitaryCampaigns(pack, validStates, fronts);
  const regiments = validStates.flatMap(state => state.military || []);
  const result = {
    campaigns,
    fronts,
    metadata: {
      statesWithMilitary: validStates.filter(state => state.military?.length).length,
      regiments: regiments.length,
      troops: round(regiments.reduce((sum, regiment) => sum + (regiment.a || 0), 0)),
      navalRegiments: regiments.filter(regiment => regiment.n).length,
      campaigns: campaigns.length,
      fronts: fronts.length,
      statuses: countRegimentStatuses(regiments),
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
  if (pack) pack.military = result;
  return result;
}

function createMilitaryNodes({pack, state, cellsForState, burgsForState, target, alert, policy, random}) {
  const nodes = [];
  const sortedBurgs = [...burgsForState].sort((a, b) => (b.population || 0) - (a.population || 0));
  const sortedCells = [...cellsForState]
    .filter(cell => (pack.cells.pop?.[cell] || 0) > 0 && !pack.cells.burg?.[cell])
    .sort((a, b) => (pack.cells.pop?.[b] || 0) - (pack.cells.pop?.[a] || 0));
  const {burgLimit, ruralLimit} = getMilitaryNodeLimits(sortedBurgs.length, sortedCells.length, target);

  for (const burg of sortedBurgs.slice(0, burgLimit)) {
    for (const unit of MILITARY_UNITS) {
      const total = getUrbanTroops(pack, state, burg, unit, alert, random, policy);
      if (total <= 0) continue;
      nodes.push(createNode(pack, burg.cell, burg.x, burg.y, unit, total, Boolean(unit.type === "naval" && burg.port)));
    }
  }

  for (const cell of sortedCells.slice(0, ruralLimit)) {
    for (const unit of MILITARY_UNITS) {
      const total = getRuralTroops(pack, state, cell, unit, alert, random, policy);
      if (total <= 0) continue;
      nodes.push(createNode(pack, cell, pack.cells.p[cell][0], pack.cells.p[cell][1], unit, total, false));
    }
  }

  return nodes.sort((a, b) => b.t - a.t);
}

function getMilitaryNodeLimits(burgs, ruralCells, target) {
  return {
    burgLimit: Math.min(burgs, Math.ceil(target * 1.4)),
    ruralLimit: Math.min(ruralCells, Math.ceil(target * 1.8))
  };
}

function createNode(pack, cell, x, y, unit, total, naval) {
  if (naval && pack.cells.haven?.[cell] !== undefined) {
    const haven = pack.cells.haven[cell];
    if (pack.cells.p[haven]) {
      x = pack.cells.p[haven][0];
      y = pack.cells.p[haven][1];
    }
  }
  return {
    cell,
    a: total,
    t: total,
    x,
    y,
    u: unit.name,
    n: naval ? 1 : 0,
    s: unit.separate,
    type: unit.type
  };
}

function createRegiments({pack, state, nodes, target, spatialMerge, policy, random}) {
  if (!nodes.length || target <= 0) return [];
  const regiments = [];
  const landNodes = nodes.filter(node => !node.n);
  const navalNodes = nodes.filter(node => node.n);
  const {landTarget, navalTarget} = getRegimentSplitTargets(nodes, target);
  const expectedSize = getExpectedRegimentSize();
  const grouped = [
    ...groupNodes(landNodes, landTarget, expectedSize, spatialMerge),
    ...groupNodes(navalNodes, navalTarget, expectedSize, spatialMerge)
  ];

  for (const group of grouped) {
    if (!group.length) continue;
    const lead = group.sort((a, b) => b.t - a.t)[0];
    const units = {};
    let total = 0;
    for (const node of group) {
      units[node.u] = (units[node.u] || 0) + node.a;
      total += node.a;
    }
    const id = regiments.length;
    const unitMap = roundUnitMap(units);
    const dominantUnit = dominantUnitName(unitMap);
    const status = getRegimentStatus(pack, state, lead, dominantUnit, policy, random);
    const terrainType = getCellType(pack.cells, lead.cell);
    const suitability = getCellSuitability(pack, lead.cell, dominantUnit, total);
    const unitDefinition = unitByName(dominantUnit);
    const regiment = {
      i: id,
      id: `${state.i}:${id}`,
      a: round(total),
      cell: lead.cell,
      x: round(lead.x, 2),
      y: round(lead.y, 2),
      bx: round(lead.x, 2),
      by: round(lead.y, 2),
      u: unitMap,
      n: lead.n,
      s: lead.s,
      type: lead.n ? "fleet" : "regiment",
      dominantUnit,
      dominantUnitLabel: unitDefinition.label,
      status,
      statusLabel: MILITARY_STATUSES[status]?.label || status,
      order: getRegimentOrder(pack, state, lead, status),
      suitability,
      terrainType,
      movementSpeed: round((unitDefinition.speed || 0.8) * suitability.total, 2),
      pressure: {
        front: round(policy.diplomacyPressure || 1, 2),
        supply: round(getStateSupplyModifier(state, unitDefinition.type), 2)
      },
      name: getRegimentName(pack, state, lead, id, regiments),
      state: state.i
    };
    regiments.push(applyRegimentIconProfile(regiment));
  }

  return scaleRegimentsToPolicy(regiments, policy);
}

function getRegimentSplitTargets(nodes, target) {
  const landNodes = nodes.filter(node => !node.n);
  const navalNodes = nodes.filter(node => node.n);
  const navalTarget = navalNodes.length ? clamp(Math.round(target * (navalNodes.length / nodes.length)), 1, Math.min(navalNodes.length, 5)) : 0;
  const landTarget = Math.max(landNodes.length ? 1 : 0, target - navalTarget);
  return {landTarget, navalTarget};
}

function groupNodes(nodes, target, expectedSize, spatialMerge) {
  if (!nodes.length || target <= 0) return [];
  if (!spatialMerge) return distributeNodesByTarget(nodes, target);

  const sorted = [...nodes].sort((a, b) => a.a - b.a);

  for (const node of sorted) {
    if (!node.t) continue;
    const overlap = findClosestMergeCandidate(sorted, node, 20);
    if (overlap && mergeableNodes(node, overlap)) {
      mergeNode(node, overlap);
      continue;
    }

    if (node.t > expectedSize) continue;
    const radius = (expectedSize - node.t) / (node.s ? 40 : 20);
    const candidates = findMergeCandidates(sorted, node, radius);
    for (const candidate of candidates) {
      if (candidate.t < expectedSize && mergeableNodes(node, candidate)) {
        mergeNode(node, candidate);
        break;
      }
    }
  }

  return sorted.filter(node => node.t > 0).sort((a, b) => b.t - a.t).map(node => [node, ...(node.children || [])]);
}

function distributeNodesByTarget(nodes, target) {
  const maxRegiments = Math.max(1, Math.min(target, nodes.length));
  const grouped = new Array(maxRegiments).fill(null).map(() => []);

  for (let index = 0; index < nodes.length; index++) grouped[index % maxRegiments].push(nodes[index]);
  return grouped;
}

function getExpectedRegimentSize() {
  return 3000;
}

function mergeableNodes(node, candidate) {
  return (!node.s && !candidate.s) || node.u === candidate.u;
}

function mergeNode(node, parent) {
  if (!parent.children) parent.children = [];
  parent.children.push(node);
  if (node.children) parent.children.push(...node.children);
  parent.t += node.t;
  node.t = 0;
}

function findClosestMergeCandidate(nodes, node, radius) {
  let best = null;
  let bestDistance = radius * radius;
  for (const candidate of nodes) {
    if (candidate === node || !candidate.t) continue;
    const distance = squaredDistance(node, candidate);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function findMergeCandidates(nodes, node, radius) {
  const limit = radius * radius;
  return nodes
    .filter(candidate => candidate !== node && candidate.t && squaredDistance(node, candidate) <= limit)
    .sort((a, b) => squaredDistance(node, a) - squaredDistance(node, b));
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function getUrbanTroops(pack, state, burg, unit, alert, random, policy) {
  if (unit.urban <= 0) return 0;
  if (unit.type === "naval" && (!burg.port || pack.cells.haven?.[burg.cell] === undefined)) return 0;
  const terrain = getCellType(pack.cells, burg.cell);
  const terrainModifier = TERRAIN_MODIFIERS[terrain]?.[unit.type] || 1;
  const stateModifier = STATE_MODIFIERS[unit.type]?.[state.type || "Generic"] || 1;
  const capitalModifier = burg.capital ? 1.25 : 1;
  const civilizationModifier = getCivilizationRecruitmentModifier(burg.civilizationType);
  const ratioModifier = getPolicyUnitMultiplier(policy, unit);
  const cultureModifier = burg.culture === state.culture ? 1 : 0.55;
  const supplyModifier = getStateSupplyModifier(state, unit.type);
  const population = burg.population || 0;
  const variance = random.range(0.78, 1.28);
  return round(population * unit.urban * 420 * alert * stateModifier * terrainModifier * capitalModifier * civilizationModifier * ratioModifier * cultureModifier * supplyModifier * variance);
}

function getRuralTroops(pack, state, cell, unit, alert, random, policy) {
  if (unit.rural <= 0 || unit.type === "naval") return 0;
  const terrain = getCellType(pack.cells, cell);
  const terrainModifier = TERRAIN_MODIFIERS[terrain]?.[unit.type] || 1;
  const stateModifier = STATE_MODIFIERS[unit.type]?.[state.type || "Generic"] || 1;
  const ratioModifier = getPolicyUnitMultiplier(policy, unit);
  const cultureModifier = pack.cells.culture?.[cell] === state.culture ? 1 : 0.5;
  const supplyModifier = getStateSupplyModifier(state, unit.type);
  const population = pack.cells.pop?.[cell] || 0;
  const variance = random.range(0.72, 1.2);
  return round(population * unit.rural * 18 * alert * stateModifier * terrainModifier * ratioModifier * cultureModifier * supplyModifier * variance);
}

function getStateRegimentTargetDetails(state, cellsForState, burgsForState, alert, densityFactor = 1, options = {}, policy = null) {
  const burgFactor = Math.sqrt(Math.max(1, burgsForState.length)) * 2.5;
  const cellFactor = Math.sqrt(Math.max(1, cellsForState.length)) * 0.18;
  const areaFactor = Math.sqrt(Math.max(1, state.area || 1)) * 0.02;
  const economicTargetModifier = getStateEconomicTargetModifier(state);
  const governmentTargetModifier = getGovernmentEffects(state).militaryTarget;
  const minimum = burgsForState.length ? 1 : 0;
  const rawTarget = Math.round((burgFactor + cellFactor + areaFactor) * Math.sqrt(alert) * densityFactor * economicTargetModifier * governmentTargetModifier);
  const troopTarget = policy?.finalTroops ? Math.ceil(policy.finalTroops / getExpectedRegimentSize()) : 0;
  const burgBackedTarget = getBurgBackedRegimentTarget(burgsForState.length, options);
  const desiredTarget = Math.max(rawTarget, troopTarget);
  const finalTarget = clamp(Math.min(desiredTarget, burgBackedTarget), minimum, 26);
  return {rawTarget, troopTarget, burgBackedTarget, finalTarget, minimum, densityFactor, economicTargetModifier, governmentTargetModifier};
}

function describeStateMilitaryFunnel({pack, state, cellsForState, burgsForState, targetDetails, nodes, regiments, spatialMerge}) {
  const sortedCells = cellsForState.filter(cell => (pack.cells.pop?.[cell] || 0) > 0 && !pack.cells.burg?.[cell]);
  const {burgLimit, ruralLimit} = getMilitaryNodeLimits(burgsForState.length, sortedCells.length, targetDetails.finalTarget);
  const landNodes = nodes.filter(node => !node.n);
  const navalNodes = nodes.filter(node => node.n);
  const {landTarget, navalTarget} = getRegimentSplitTargets(nodes, targetDetails.finalTarget);
  return {
    state: state.i,
    alert: round(state.alert || 0, 2),
    landCells: cellsForState.length,
    burgs: burgsForState.length,
    ports: burgsForState.filter(burg => burg.port).length,
    rawTarget: targetDetails.rawTarget,
    troopTarget: targetDetails.troopTarget,
    burgBackedTarget: targetDetails.burgBackedTarget,
    finalTarget: targetDetails.finalTarget,
    minimumTarget: targetDetails.minimum,
    densityFactor: round(targetDetails.densityFactor, 3),
    economicPower: round(state.economicPower || 0, 2),
    resourcePotential: round(state.resourcePotential || 0, 2),
    economicTargetModifier: round(targetDetails.economicTargetModifier || 1, 3),
    governmentTargetModifier: round(targetDetails.governmentTargetModifier || 1, 3),
    militarySupply: round(state.militarySupply || 1, 3),
    government: state.governmentLabel || state.governmentKey || "none",
    civilizationType: state.civilizationType || "agrarian",
    diplomacyPressure: round(state.militaryPolicy?.diplomacyPressure || 1, 3),
    resourcePressure: round(state.militaryPolicy?.resourcePressure || 1, 3),
    troopCapRatio: round(state.militaryPolicy?.troopCapRatio || 0, 4),
    desiredTroops: round(state.militaryPolicy?.desiredTroops || 0),
    finalTroops: round(state.militaryPolicy?.finalTroops || 0),
    generatedTroops: round(state.militaryPolicy?.generatedTroops || 0),
    spatialMerge: Boolean(spatialMerge),
    mergeExpectedSize: getExpectedRegimentSize(),
    burgLimit,
    ruralLimit,
    nodes: nodes.length,
    landNodes: landNodes.length,
    navalNodes: navalNodes.length,
    urbanNodes: nodes.filter(node => Boolean(pack.cells.burg?.[node.cell])).length,
    ruralNodes: nodes.filter(node => !pack.cells.burg?.[node.cell]).length,
    landTarget,
    navalTarget,
    regiments: regiments.length,
    landRegiments: regiments.filter(regiment => !regiment.n).length,
    navalRegiments: regiments.filter(regiment => regiment.n).length
  };
}

function buildMilitaryPolicy({state, burgsForState, diplomacyPressure, resourcePressure, alert}) {
  const populationPeople = Math.max(0, (Number(state.rural || 0) + Number(state.urban || 0)) * 1000);
  const dominantCivilization = state.civilizationType || dominantCivilizationFromBurgs(burgsForState);
  const governmentEffects = getGovernmentEffects(state);
  const troopCapRatio = getTroopCapRatio(state, dominantCivilization, governmentEffects);
  const recruitment = 0.012 * (CIVILIZATION_RECRUITMENT[dominantCivilization] || 1) * governmentEffects.militaryRecruitment;
  const economicModifier = getStateEconomicRecruitmentModifier(state);
  const desiredTroops = round(populationPeople * recruitment * economicModifier * diplomacyPressure * resourcePressure);
  const capTroops = round(populationPeople * troopCapRatio);
  const finalTroops = round(Math.min(desiredTroops, capTroops));
  const existingRatios = validUnitRatios(state.militaryPolicy?.unitRatios);
  const unitRatios = existingRatios || buildDefaultUnitRatios(state, burgsForState, dominantCivilization);
  return {
    state: state.i,
    populationPeople: round(populationPeople),
    troopCapRatio: round(troopCapRatio, 4),
    desiredTroops,
    capTroops,
    finalTroops,
    generatedTroops: 0,
    alert: round(alert, 2),
    unitRatios,
    dominantCivilization,
    civilizationLabel: state.civilizationLabel || dominantCivilization,
    civilizationProfile: {...(state.civilizationProfile || {})},
    government: {
      key: state.governmentKey || "monarchy",
      label: state.governmentLabel || "君主制",
      recruitmentModifier: round(governmentEffects.militaryRecruitment || 1, 3),
      capAdd: round(governmentEffects.militaryCapAdd || 0, 4)
    },
    posture: militaryPosture(diplomacyPressure),
    diplomacyPressure: round(diplomacyPressure, 3),
    resourcePressure: round(resourcePressure, 3)
  };
}

function buildDefaultUnitRatios(state, burgsForState, dominantCivilization) {
  const ratios = Object.fromEntries(MILITARY_UNITS.map(unit => [unit.name, unit.baseRatio]));
  applyRatioModifier(ratios, CIVILIZATION_RATIO_MODIFIERS[dominantCivilization]);
  applyRatioModifier(ratios, CIVILIZATION_RATIO_MODIFIERS[state.type?.toLowerCase?.()]);
  applyRatioModifier(ratios, getGovernmentEffects(state).unitRatios);
  const ports = burgsForState.filter(burg => burg.port).length;
  if (!ports && state.type !== "Naval") ratios.fleet *= 0.15;
  if (ports >= Math.max(1, burgsForState.length * 0.25)) ratios.fleet *= 1.45;
  if (Number(state.resourcePotential || 0) > 120) ratios.artillery *= 1.18;
  if (Number(state.economicPower || 0) > 220) ratios.artillery *= 1.16;
  return normalizeUnitRatios(ratios);
}

export function normalizeUnitRatios(ratios = {}) {
  const result = {};
  let total = 0;
  for (const unit of MILITARY_UNITS) {
    const value = Math.max(0, Number(ratios[unit.name] ?? unit.baseRatio));
    result[unit.name] = value;
    total += value;
  }
  if (total <= 0) return Object.fromEntries(MILITARY_UNITS.map(unit => [unit.name, unit.baseRatio]));
  for (const unit of MILITARY_UNITS) result[unit.name] = round(result[unit.name] / total, 4);
  return result;
}

function validUnitRatios(ratios) {
  if (!ratios || typeof ratios !== "object") return null;
  const normalized = normalizeUnitRatios(ratios);
  const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  return total > 0 ? normalized : null;
}

function applyRatioModifier(ratios, modifiers) {
  if (!modifiers) return;
  for (const [unit, modifier] of Object.entries(modifiers)) {
    if (ratios[unit] !== undefined) ratios[unit] *= modifier;
  }
}

function getTroopCapRatio(state, civilization, governmentEffects = null) {
  let cap = CIVILIZATION_CAP_RATIOS[civilization] || CIVILIZATION_CAP_RATIOS.agrarian;
  if (state.type === "Nomadic") cap += 0.015;
  if (state.type === "Hunting") cap += 0.008;
  if (state.type === "Naval") cap += 0.004;
  if ((state.diplomacySummary?.Enemy || 0) > 0) cap += 0.006;
  if ((state.diplomacySummary?.Rival || 0) > 1) cap += 0.004;
  cap += governmentEffects?.militaryCapAdd || 0;
  return clamp(cap, 0.018, 0.095);
}

function getStateEconomicRecruitmentModifier(state) {
  const economicPower = Number(state.economicPower || state.treasury || 0);
  const resourcePotential = Number(state.resourcePotential || 0);
  const supply = Number(state.militarySupply || 1);
  return clamp(0.86 + Math.sqrt(Math.max(0, economicPower)) / 170 + resourcePotential / 1100 + (supply - 1) * 0.35, 0.7, 1.48);
}

function militaryPosture(diplomacyPressure) {
  if (diplomacyPressure >= 1.45) return "mobilized";
  if (diplomacyPressure >= 1.18) return "guarded";
  if (diplomacyPressure <= 0.92) return "relaxed";
  return "watchful";
}

function dominantCivilizationFromBurgs(burgs) {
  const weights = {};
  for (const burg of burgs) {
    const type = burg.civilizationType || "agrarian";
    weights[type] = (weights[type] || 0) + Math.max(0.1, Number(burg.population || 0));
  }
  return Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] || "agrarian";
}

function getPolicyUnitMultiplier(policy, unit) {
  const ratio = Number(policy?.unitRatios?.[unit.name] || unit.baseRatio);
  return clamp(ratio / Math.max(0.001, unit.baseRatio), 0.05, 4);
}

function getCivilizationRecruitmentModifier(civilization) {
  return clamp(CIVILIZATION_RECRUITMENT[civilization] || 1, 0.72, 1.5);
}

function getStateEconomicTargetModifier(state) {
  const economicPower = Number(state.economicPower || state.treasury || 0);
  const resourcePotential = Number(state.resourcePotential || 0);
  return 1 + clamp(Math.sqrt(Math.max(0, economicPower)) / 260, 0, 0.12) + clamp(resourcePotential / 460, 0, 0.1);
}

function getStateSupplyModifier(state, unitType) {
  const base = Number(state.militarySupply || 1);
  const resourcePotential = Number(state.resourcePotential || 0);
  const resourceBonus = unitType === "machinery" || unitType === "naval"
    ? clamp(resourcePotential / 420, 0, 0.08)
    : 0;
  return clamp(base + resourceBonus, 0.9, 1.32);
}

function shouldUseSpatialRegimentMerging(options = {}) {
  const cellsTarget = Number(options.cellsTarget || 100000);
  return options.heightmapTemplate === "highIsland" && cellsTarget >= 100000;
}

function getRegimentDensityFactor(cells) {
  let land = 0;
  for (const cell of cells.i) if ((cells.h[cell] || 0) >= 20) land++;
  const landRatio = land / Math.max(1, cells.i.length);
  return clamp((landRatio - 0.5) / 0.45, 0.25, 1);
}

function getBurgBackedRegimentTarget(burgs, options) {
  if (!burgs) return 0;
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  const scale = Math.sqrt(clamp(cellsTarget / 100000, 0.01, 1));
  const burgRate = (0.1 + 0.14 * scale) * (0.75 + 0.25 * scale);
  return Math.max(1, Math.ceil(burgs * burgRate));
}

function getStateAlert(state, averageArea, averageExpansion, diplomacyPressure = 1) {
  const expansionRate = (state.expansionism || 1) / averageExpansion;
  const areaRate = Math.sqrt((state.area || averageArea) / averageArea);
  const neighborRate = 0.7 + Math.min(1.8, (state.neighbors?.length || 0) * 0.18);
  return clamp(round(expansionRate * areaRate * neighborRate * diplomacyPressure, 2), 0.25, 4.2);
}

function getStateDiplomacyPressure(state, states) {
  const summary = state.diplomacySummary || countRelations(state.diplomacy);
  const ownPower = Number(state.powerScore || state.economicPower || 1);
  let strongHostiles = 0;
  for (const id of state.neighbors || []) {
    const neighbor = states[id];
    const relation = state.diplomacy?.[id] || "Unknown";
    if (!neighbor?.i || !WAR_RELATIONS.has(relation)) continue;
    if (Number(neighbor.powerScore || neighbor.economicPower || 0) > ownPower * 1.2) strongHostiles++;
  }
  return clamp(
    1
    + Number(summary.Enemy || 0) * 0.28
    + Number(summary.Rival || 0) * 0.16
    + Number(summary.Suspicion || 0) * 0.05
    + strongHostiles * 0.12,
    0.82,
    2.2
  );
}

function getStateResourcePressure(state, states) {
  let pressure = 1;
  for (const id of state.neighbors || []) {
    const neighbor = states[id];
    if (!neighbor?.i) continue;
    const relation = state.diplomacy?.[id] || "Unknown";
    const shared = sharedResourceKeys(state, neighbor).length;
    if (!shared) continue;
    pressure += shared * (relation === "Enemy" ? 0.08 : relation === "Rival" ? 0.055 : relation === "Suspicion" ? 0.028 : 0.012);
  }
  return clamp(pressure, 0.95, 1.35);
}

function countRelations(relations = []) {
  const counts = {};
  for (const relation of relations) counts[relation] = (counts[relation] || 0) + 1;
  return counts;
}

function sharedResourceKeys(a, b) {
  const aTypes = Object.entries(a.resourceTypes || {}).filter(([, value]) => Number(value) > 0).map(([key]) => key);
  const bTypes = new Set(Object.entries(b.resourceTypes || {}).filter(([, value]) => Number(value) > 0).map(([key]) => key));
  return aTypes.filter(key => bTypes.has(key));
}

function collectStateCells(cells, states) {
  const result = new Map(states.map(state => [state.i, []]));
  for (const cell of cells.i) {
    const state = cells.state?.[cell] || 0;
    if (!result.has(state) || cells.h[cell] < 20) continue;
    result.get(state).push(cell);
  }
  return result;
}

function collectStateBurgs(burgs, states) {
  const result = new Map(states.map(state => [state.i, []]));
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !result.has(burg.state)) continue;
    result.get(burg.state).push(burg);
  }
  return result;
}

function getCellType(cells, cell) {
  const biome = cells.biome?.[cell];
  if ([1, 2, 3, 4].includes(biome)) return "nomadic";
  if ([7, 8, 9, 12].includes(biome)) return "wetland";
  if ((cells.h[cell] || 0) >= 70) return "highland";
  return "generic";
}

function getCellSuitability(pack, cell, unitName, troops = 0) {
  const unit = unitByName(unitName);
  const cells = pack.cells;
  const terrain = getCellType(cells, cell);
  const terrainScore = clamp(((TERRAIN_MODIFIERS[terrain]?.[unit.type] || 1) + 0.35) / 1.8, 0.22, 1.18);
  const temp = Number(cells.temp?.[cell] ?? cells.temperature?.[cell] ?? 12);
  const climateScore = climateSuitability(temp, unit.type);
  const biomeScore = biomeSuitability(cells.biome?.[cell], unit.type);
  const localPopulation = Number(cells.pop?.[cell] || 0) + Number(pack.burgs?.[cells.burg?.[cell]]?.population || 0) * 12;
  const capacityScore = clamp((Math.sqrt(localPopulation + 1) + 1.5) / Math.sqrt(Math.max(1, troops / 900)), 0.28, 1.12);
  return {
    total: round(clamp(terrainScore * climateScore * biomeScore * capacityScore, 0.15, 1.2), 2),
    terrain: round(terrainScore, 2),
    climate: round(climateScore, 2),
    biome: round(biomeScore, 2),
    capacity: round(capacityScore, 2)
  };
}

function climateSuitability(temp, unitType) {
  if (!Number.isFinite(temp)) return 1;
  if (unitType === "mounted" && temp < -5) return 0.58;
  if (unitType === "machinery" && temp < -8) return 0.68;
  if (temp < -15) return 0.48;
  if (temp < -5) return 0.72;
  if (temp > 35) return 0.64;
  if (temp > 30) return 0.78;
  return 1;
}

function biomeSuitability(biome, unitType) {
  if ([7, 8, 9, 12].includes(biome) && unitType === "mounted") return 0.48;
  if ([10, 11, 12].includes(biome) && unitType === "machinery") return 0.62;
  if ([1, 2, 3, 4].includes(biome) && unitType === "mounted") return 1.22;
  if ([7, 8, 9, 10, 11, 12].includes(biome) && unitType === "ranged") return 1.12;
  return 1;
}

function getRegimentStatus(pack, state, lead, dominantUnit, policy, random) {
  const hasWar = (state.diplomacySummary?.Enemy || 0) > 0;
  const suitability = getCellSuitability(pack, lead.cell, dominantUnit, lead.t);
  const border = isBorderCell(pack, state, lead.cell);
  const burg = pack.burgs?.[pack.cells.burg?.[lead.cell]];
  if (hasWar && random.next() < 0.035) return "routed";
  if (hasWar && border && random.next() < 0.5) return "marching";
  if (hasWar && (burg?.capital || policy.posture === "mobilized") && random.next() < 0.55) return "mustering";
  if (suitability.total < 0.42) return "resting";
  if (burg?.capital || burg?.group === "fort") return "garrisoned";
  if (border || policy.diplomacyPressure > 1.2 || policy.resourcePressure > 1.08) return "patrolling";
  return random.next() < 0.28 ? "resting" : "garrisoned";
}

function getRegimentOrder(pack, state, lead, status) {
  if (status === "marching" || status === "mustering") {
    const target = firstEnemyTarget(pack, state);
    if (target) return {kind: status === "marching" ? "advance" : "muster", targetCell: target.center, targetName: target.name};
  }
  if (status === "patrolling") return {kind: "patrol", targetCell: lead.cell, targetName: pack.provinces?.[pack.cells.province?.[lead.cell]]?.name || state.name};
  if (status === "resting") return {kind: "rest", targetCell: lead.cell, targetName: pack.burgs?.[pack.cells.burg?.[lead.cell]]?.name || state.name};
  if (status === "routed") return {kind: "retreat", targetCell: state.center, targetName: state.name};
  return {kind: "garrison", targetCell: lead.cell, targetName: pack.burgs?.[pack.cells.burg?.[lead.cell]]?.name || state.name};
}

function firstEnemyTarget(pack, state) {
  const enemyId = (state.diplomacy || []).findIndex(relation => relation === "Enemy");
  return enemyId > 0 ? pack.states?.[enemyId] || null : null;
}

function isBorderCell(pack, state, cell) {
  const stateId = state.i;
  for (const neighbor of pack.cells.c?.[cell] || []) {
    if ((pack.cells.state?.[neighbor] || 0) !== stateId && (pack.cells.h?.[neighbor] || 0) >= 20) return true;
  }
  return false;
}

function scaleRegimentsToPolicy(regiments, policy) {
  const target = Number(policy?.finalTroops || 0);
  const total = sumRegimentTroops(regiments);
  if (!target || !total) return regiments;
  const scale = target / total;
  for (const regiment of regiments) {
    const units = {};
    for (const [unit, value] of Object.entries(regiment.u || {})) units[unit] = Math.max(0, round(Number(value || 0) * scale));
    regiment.u = units;
    regiment.a = round(Object.values(units).reduce((sum, value) => sum + value, 0));
    applyRegimentIconProfile(regiment);
  }
  return regiments.filter(regiment => regiment.a > 0);
}

function buildMilitaryCampaigns(pack, states, fronts = []) {
  const campaigns = [];
  const seen = new Set();
  for (const attacker of states) {
    for (const campaign of attacker.campaigns || []) {
      if (campaign.attacker !== attacker.i) continue;
      const defender = pack.states?.[campaign.defender];
      if (!defender?.i || defender.removed) continue;
      const key = campaignIdentity(campaign);
      if (seen.has(key)) continue;
      seen.add(key);
      const matchingFronts = fronts.filter(front =>
        Number(front.attacker) === Number(campaign.attacker)
        && Number(front.defender) === Number(campaign.defender)
        && String(front.campaign || "") === String(campaign.name || "")
      );
      const attackerRegiments = attacker.military || [];
      const defenderRegiments = defender.military || [];
      const attackerTroops = sumRegimentTroops(attackerRegiments);
      const defenderTroops = sumRegimentTroops(defenderRegiments);
      campaigns.push({
        id: `campaign:${slugText(key)}`,
        key,
        chainKey: `campaign:${slugText(key)}`,
        name: campaign.name || `${attacker.name}-${defender.name}之战`,
        start: campaign.start || null,
        status: "active",
        attacker: attacker.i,
        attackerName: stateDisplayName(attacker),
        defender: defender.i,
        defenderName: stateDisplayName(defender),
        cause: campaign.cause || "rivalry",
        causeLabel: campaign.causeLabel || "战争原因",
        causeDetail: campaign.causeDetail || "",
        resourceKeys: Array.isArray(campaign.resourceKeys) ? [...campaign.resourceKeys] : [],
        fronts: matchingFronts.length,
        frontIds: matchingFronts.map(front => front.id),
        hasSharedLandFront: matchingFronts.length > 0,
        attackerRegiments: attackerRegiments.length,
        defenderRegiments: defenderRegiments.length,
        attackerTroops: round(attackerTroops),
        defenderTroops: round(defenderTroops),
        troopBalance: round(attackerTroops - defenderTroops),
        phaseKey: "mobilizing",
        phaseLabel: "动员对峙",
        momentumKey: "balanced",
        momentumLabel: "均势",
        progress: 0,
        progressLabel: "0%"
      });
    }
  }
  return campaigns;
}

function campaignIdentity(campaign = {}) {
  return campaign.id ?? campaign.i ?? campaign.key ?? `${campaign.attacker}:${campaign.defender}:${campaign.start || ""}:${campaign.cause || campaign.causeLabel || campaign.name || "campaign"}`;
}

function stateDisplayName(state) {
  return state?.fullName || state?.name || (state?.i ? `国家 #${state.i}` : "");
}

function slugText(value) {
  return String(value || "campaign").trim().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5:-]/g, "").slice(0, 48) || "campaign";
}

export function applyRegimentIconProfile(regiment) {
  const profile = getRegimentIconProfile(regiment);
  regiment.icon = profile.icon;
  regiment.iconVariant = profile.variant;
  regiment.iconLabel = profile.label;
  return regiment;
}

function getRegimentIconProfile(regiment) {
  const dominantUnit = regiment.dominantUnit || dominantUnitName(regiment.u);
  const troops = Math.max(0, Number(regiment.a || sumUnitTroops(regiment.u)));
  const unitTroops = Math.max(0, Number(regiment.u?.[dominantUnit] || 0));
  const share = troops > 0 ? unitTroops / troops : 0;
  if (regiment.type === "fleet" || regiment.n || dominantUnit === "fleet") {
    const large = troops >= 8000 || Number(regiment.u?.fleet || 0) >= 6000;
    return iconProfile(large ? "fleet-large" : "fleet-small");
  }
  if (isMountainRegiment(regiment, dominantUnit, share)) return iconProfile("mountain");
  if (dominantUnit === "archers") {
    const heavy = isHeavyRegiment(regiment, "archers", share);
    return iconProfile(heavy ? "archers-heavy" : "archers");
  }
  if (dominantUnit === "cavalry") {
    const heavy = isHeavyRegiment(regiment, "cavalry", share);
    return iconProfile(heavy ? "cavalry-heavy" : "cavalry");
  }
  if (dominantUnit === "artillery") return iconProfile("artillery");
  const heavy = isHeavyRegiment(regiment, "infantry", share);
  return iconProfile(heavy ? "infantry-heavy" : "infantry");
}

function iconProfile(variant) {
  return {icon: variant, variant, label: REGIMENT_ICON_LABELS[variant] || variant};
}

function isMountainRegiment(regiment, dominantUnit, share) {
  if (!["infantry", "archers"].includes(dominantUnit)) return false;
  return regiment.terrainType === "highland" && share >= 0.34;
}

function isHeavyRegiment(regiment, unit, share) {
  const unitTroops = Number(regiment.u?.[unit] || 0);
  const thresholds = {infantry: 5200, archers: 3600, cavalry: 2800};
  const threshold = thresholds[unit] || 5000;
  return (unitTroops >= threshold && share >= 0.42) || (unitTroops >= threshold * 1.55 && share >= 0.32);
}

function sumRegimentTroops(regiments = []) {
  return regiments.reduce((sum, regiment) => sum + Number(regiment.a || 0), 0);
}

function sumUnitTroops(units = {}) {
  return Object.values(units).reduce((sum, value) => sum + Number(value || 0), 0);
}

function dominantUnitName(units) {
  let best = "infantry";
  let bestValue = -1;
  for (const [unit, value] of Object.entries(units || {})) {
    if (value > bestValue) {
      best = unit;
      bestValue = value;
    }
  }
  return best;
}

function unitByName(name) {
  return MILITARY_UNITS.find(unit => unit.name === name) || MILITARY_UNITS[0];
}

function buildMilitaryFronts(pack, states) {
  const fronts = [];
  const seen = new Set();
  for (const attacker of states) {
    for (const campaign of attacker.campaigns || []) {
      if (campaign.attacker !== attacker.i) continue;
      const defender = pack.states?.[campaign.defender];
      if (!defender?.i || defender.removed) continue;
      const key = `${campaign.attacker}:${campaign.defender}:${campaign.start}:${campaign.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const attackLine = createFrontLine(pack, campaign, attacker, defender, "attack");
      const defenseLine = createFrontLine(pack, campaign, defender, attacker, "defense");
      if (attackLine) fronts.push(attackLine);
      if (defenseLine) fronts.push(defenseLine);
    }
  }
  return fronts;
}

function createFrontLine(pack, campaign, fromState, toState, stance) {
  const fromPoint = regimentOrStatePoint(pack, fromState);
  const toPoint = statePoint(pack, toState);
  if (!fromPoint || !toPoint) return null;
  const frontSegment = findSharedLandFrontSegment(pack, fromState.i, toState.i, fromPoint, toPoint);
  if (!frontSegment) return null;
  return {
    id: `${campaign.attacker}:${campaign.defender}:${stance}:${campaign.start}`,
    campaign: campaign.name,
    attacker: campaign.attacker,
    defender: campaign.defender,
    fromState: fromState.i,
    toState: toState.i,
    stance,
    cause: campaign.cause || "rivalry",
    causeLabel: campaign.causeLabel || "战争原因",
    causeDetail: campaign.causeDetail || "",
    label: `${stance === "attack" ? "进攻" : "防守"}：${fromState.name} -> ${toState.name}`,
    from: fromPoint,
    to: toPoint,
    borderCells: frontSegment.cells,
    borderCellPairs: frontSegment.cellPairs,
    direction: frontSegment.direction,
    length: frontSegment.length,
    maxLength: frontSegment.maxLength,
    points: orientFrontSegment(frontSegment.points, fromPoint, toPoint)
  };
}

function findSharedLandFrontSegment(pack, fromStateId, toStateId, fromPoint, toPoint) {
  const {cells} = pack || {};
  if (!cells?.i || !cells?.c || !cells?.state || !cells?.h) return null;
  const targetMid = [(fromPoint.x + toPoint.x) / 2, (fromPoint.y + toPoint.y) / 2];
  const edges = [];
  const seen = new Set();

  for (const cell of cells.i) {
    if (cells.state[cell] !== fromStateId || cells.h[cell] < 20) continue;
    for (const neighbor of cells.c[cell] || []) {
      if (cells.state[neighbor] !== toStateId || cells.h[neighbor] < 20) continue;
      const edge = sharedPackEdge(pack, cell, neighbor);
      if (!edge) continue;
      const key = edge.vertices.slice().sort((a, b) => a - b).join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const mid = [(edge.points[0][0] + edge.points[1][0]) / 2, (edge.points[0][1] + edge.points[1][1]) / 2];
      const length = distance(edge.points[0], edge.points[1]);
      const score = distance(mid, targetMid) - length * 1.8;
      edges.push({score, points: edge.points, vertices: edge.vertices, cells: [cell, neighbor], length});
    }
  }

  if (!edges.length) return null;
  const best = edges.reduce((current, edge, index) => !current || edge.score < current.edge.score ? {edge, index} : current, null);
  return selectFrontBoundarySegment(pack, edges, best.index, frontMaxBoundaryLength(pack, fromPoint, toPoint));
}

function sharedPackEdge(pack, cellA, cellB) {
  const verticesA = pack.cells.v?.[cellA] || [];
  const verticesB = new Set(pack.cells.v?.[cellB] || []);
  const shared = verticesA.filter(vertex => verticesB.has(vertex));
  if (shared.length < 2) return null;
  const first = pack.vertices?.p?.[shared[0]];
  const second = pack.vertices?.p?.[shared[1]];
  return first && second ? {points: [first, second], vertices: [shared[0], shared[1]]} : null;
}

function selectFrontBoundarySegment(pack, edges, startIndex, maxLength) {
  const selected = new Set([startIndex]);
  const start = edges[startIndex];
  if (start.length > maxLength) {
    const points = clipFrontEdgePoints(start.points, maxLength);
    return {
      points,
      cells: Array.from(new Set(start.cells)),
      cellPairs: [start.cells],
      direction: frontDirectionFromCellPairs(pack, [start.cells]),
      length: round(frontPointPathLength(points), 2),
      maxLength: round(maxLength, 2)
    };
  }
  const path = start.vertices.slice();
  let length = start.length;

  while (length < maxLength) {
    const extension = bestFrontBoundaryExtension(edges, selected, path, maxLength - length);
    if (!extension) break;
    selected.add(extension.index);
    length += extension.length;
    if (extension.partialPoint) {
      if (extension.side === "start") path.unshift(extension.partialPoint);
      else path.push(extension.partialPoint);
      break;
    }
    if (extension.side === "start") path.unshift(extension.nextVertex);
    else path.push(extension.nextVertex);
  }

  const selectedEdges = Array.from(selected).map(index => edges[index]);
  let points = path.map(item => Array.isArray(item) ? item : pack.vertices?.p?.[item]).filter(Boolean);
  if (points.length < 3 && selectedEdges.length > 1) points = farthestFrontEdgePoints(selectedEdges);
  const cellPairs = selectedEdges.map(edge => edge.cells);
  const cells = cellPairs.flat();
  return {
    points: points.length >= 2 ? points : start.points,
    cells: Array.from(new Set(cells)),
    cellPairs,
    direction: frontDirectionFromCellPairs(pack, cellPairs),
    length: round(frontPointPathLength(points.length >= 2 ? points : start.points), 2),
    maxLength: round(maxLength, 2)
  };
}

function frontPointPathLength(points = []) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    total += distance(points[index], points[index + 1]);
  }
  return total;
}

function clipFrontEdgePoints(points, maxLength) {
  const [start, end] = points || [];
  if (!start || !end) return points;
  const length = distance(start, end);
  if (!Number.isFinite(length) || length <= maxLength || length <= 0.000001) return points;
  const halfRatio = (maxLength / length) / 2;
  const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return [
    [mid[0] - dx * halfRatio, mid[1] - dy * halfRatio],
    [mid[0] + dx * halfRatio, mid[1] + dy * halfRatio]
  ];
}

function frontDirectionFromCellPairs(pack, cellPairs) {
  let fromX = 0;
  let fromY = 0;
  let toX = 0;
  let toY = 0;
  let count = 0;
  for (const [fromCell, toCell] of cellPairs) {
    const from = pack.cells.p?.[fromCell];
    const to = pack.cells.p?.[toCell];
    if (!from || !to) continue;
    fromX += from[0];
    fromY += from[1];
    toX += to[0];
    toY += to[1];
    count++;
  }
  if (!count) return null;
  const dx = toX / count - fromX / count;
  const dy = toY / count - fromY / count;
  const length = Math.hypot(dx, dy);
  return length > 0.000001 ? {x: round(dx / length, 4), y: round(dy / length, 4)} : null;
}

function farthestFrontEdgePoints(edges) {
  const points = edges.flatMap(edge => edge.points || []).filter(Boolean);
  let best = null;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const length = distance(points[a], points[b]);
      if (!best || length > best.length) best = {length, points: [points[a], points[b]]};
    }
  }
  return best?.points || points.slice(0, 2);
}

function bestFrontBoundaryExtension(edges, selected, path, remainingLength) {
  const startVertex = path[0];
  const endVertex = path[path.length - 1];
  let best = null;
  for (let index = 0; index < edges.length; index++) {
    if (selected.has(index)) continue;
    const edge = edges[index];
    if (edge.length > remainingLength) continue;
    const [a, b] = edge.vertices;
    const match =
      a === startVertex ? {side: "start", nextVertex: b} :
        b === startVertex ? {side: "start", nextVertex: a} :
          a === endVertex ? {side: "end", nextVertex: b} :
            b === endVertex ? {side: "end", nextVertex: a} :
              null;
    if (!match) continue;
    const length = Math.min(edge.length, remainingLength);
    if (edge.length > remainingLength) {
      if (remainingLength < Math.min(2, edge.length * 0.2)) continue;
      match.partialPoint = partialFrontEdgePoint(edge, match.side === "start" ? startVertex : endVertex, match.nextVertex, remainingLength);
      if (!match.partialPoint) continue;
    }
    const candidate = {index, edge, length, ...match};
    if (!best || edge.score < best.edge.score) best = candidate;
  }
  return best;
}

function partialFrontEdgePoint(edge, anchorVertex, nextVertex, length) {
  if (!edge?.points || !edge?.vertices || edge.length <= 0.000001) return null;
  const anchorIndex = edge.vertices[0] === anchorVertex && edge.vertices[1] === nextVertex ? 0 :
    edge.vertices[1] === anchorVertex && edge.vertices[0] === nextVertex ? 1 : -1;
  if (anchorIndex < 0) return null;
  const start = edge.points[anchorIndex];
  const end = edge.points[anchorIndex ? 0 : 1];
  const ratio = clamp(length / edge.length, 0, 1);
  return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
}

function frontMaxBoundaryLength(pack, fromPoint, toPoint) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of pack?.cells?.p || []) {
    if (!Number.isFinite(point?.[0]) || !Number.isFinite(point?.[1])) continue;
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }
  const width = Number.isFinite(minX) ? maxX - minX : 1440;
  const height = Number.isFinite(minY) ? maxY - minY : 720;
  const span = Math.max(width, height);
  return clamp(Math.min(distance([fromPoint.x, fromPoint.y], [toPoint.x, toPoint.y]) * 0.025, span / 96), 6, span / 80);
}

function orientFrontSegment(points, fromPoint, toPoint) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const [a, b] = points;
  const edgeX = b[0] - a[0];
  const edgeY = b[1] - a[1];
  const targetX = toPoint.x - fromPoint.x;
  const targetY = toPoint.y - fromPoint.y;
  return edgeX * targetX + edgeY * targetY < 0 ? points.slice().reverse() : points;
}

function regimentOrStatePoint(pack, state) {
  const regiment = [...(state.military || [])].sort((a, b) => Number(b.a || 0) - Number(a.a || 0))[0];
  if (regiment) return {x: regiment.x, y: regiment.y, cell: regiment.cell, name: regiment.name};
  return statePoint(pack, state);
}

function statePoint(pack, state) {
  const cell = Number.isInteger(state.center) ? state.center : Number.isInteger(state.gridCenter) ? pack.cells.pack?.[state.gridCenter] : null;
  const point = Number.isInteger(cell) ? pack.cells.p?.[cell] : null;
  if (point) return {x: point[0], y: point[1], cell, name: state.name};
  const capital = pack.burgs?.[state.capital];
  if (capital) return {x: capital.x, y: capital.y, cell: capital.cell, name: capital.name};
  return null;
}

function getRegimentName(pack, state, node, id, regiments) {
  const proper = node.n
    ? null
    : pack.cells.province?.[node.cell] && pack.provinces?.[pack.cells.province[node.cell]]
      ? pack.provinces[pack.cells.province[node.cell]].name
      : pack.cells.burg?.[node.cell] && pack.burgs?.[pack.cells.burg[node.cell]]
        ? pack.burgs[pack.cells.burg[node.cell]].name
        : state.name;
  const number = regiments.filter(regiment => regiment.n === node.n && regiment.i < id).length + 1;
  const form = node.n ? "舰队" : "军团";
  return `${number}${proper ? `（${proper}）` : ""}${form}`;
}

function roundUnitMap(units) {
  const result = {};
  for (const unit of MILITARY_UNITS) result[unit.name] = round(units[unit.name] || 0);
  return result;
}

function countRegimentStatuses(regiments) {
  const counts = {};
  for (const regiment of regiments) counts[regiment.status] = (counts[regiment.status] || 0) + 1;
  return counts;
}

function emptyMilitaryResult(startedAt) {
  const result = {
    fronts: [],
    metadata: {
      statesWithMilitary: 0,
      regiments: 0,
      troops: 0,
      navalRegiments: 0,
      fronts: 0,
      statuses: {},
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
  return result;
}

function average(values) {
  const filtered = values.filter(value => Number.isFinite(value) && value > 0);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
