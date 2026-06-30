import {createRandom} from "./random.js";

const UNITS = [
  {name: "infantry", rural: 0.25, urban: 0.2, type: "melee", separate: 0},
  {name: "archers", rural: 0.12, urban: 0.2, type: "ranged", separate: 0},
  {name: "cavalry", rural: 0.12, urban: 0.03, type: "mounted", separate: 0},
  {name: "artillery", rural: 0, urban: 0.03, type: "machinery", separate: 0},
  {name: "fleet", rural: 0, urban: 0.015, type: "naval", separate: 1}
];

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

  for (const state of states) if (state) state.military = [];

  for (const state of validStates) {
    const alert = getStateAlert(state, averageArea, averageExpansion);
    state.alert = alert;
    const cellsForState = stateCells.get(state.i) || [];
    const burgsForState = stateBurgs.get(state.i) || [];
    const target = getStateRegimentTarget(state, cellsForState, burgsForState, alert, densityFactor);
    const nodes = createMilitaryNodes({pack, state, cellsForState, burgsForState, target, alert, random});
    state.military = createRegiments({pack, state, nodes, target});
  }

  const regiments = validStates.flatMap(state => state.military || []);
  return {
    metadata: {
      statesWithMilitary: validStates.filter(state => state.military?.length).length,
      regiments: regiments.length,
      troops: round(regiments.reduce((sum, regiment) => sum + (regiment.a || 0), 0)),
      navalRegiments: regiments.filter(regiment => regiment.n).length,
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
}

function createMilitaryNodes({pack, state, cellsForState, burgsForState, target, alert, random}) {
  const nodes = [];
  const sortedBurgs = [...burgsForState].sort((a, b) => (b.population || 0) - (a.population || 0));
  const sortedCells = [...cellsForState]
    .filter(cell => (pack.cells.pop?.[cell] || 0) > 0 && !pack.cells.burg?.[cell])
    .sort((a, b) => (pack.cells.pop?.[b] || 0) - (pack.cells.pop?.[a] || 0));
  const burgLimit = Math.min(sortedBurgs.length, Math.ceil(target * 1.4));
  const ruralLimit = Math.min(sortedCells.length, Math.ceil(target * 1.8));

  for (const burg of sortedBurgs.slice(0, burgLimit)) {
    for (const unit of UNITS) {
      const total = getUrbanTroops(pack, state, burg, unit, alert, random);
      if (total <= 0) continue;
      nodes.push(createNode(pack, burg.cell, burg.x, burg.y, unit, total, Boolean(unit.type === "naval" && burg.port)));
    }
  }

  for (const cell of sortedCells.slice(0, ruralLimit)) {
    for (const unit of UNITS) {
      const total = getRuralTroops(pack, state, cell, unit, alert, random);
      if (total <= 0) continue;
      nodes.push(createNode(pack, cell, pack.cells.p[cell][0], pack.cells.p[cell][1], unit, total, false));
    }
  }

  return nodes.sort((a, b) => b.t - a.t);
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

function createRegiments({pack, state, nodes, target}) {
  if (!nodes.length || target <= 0) return [];
  const regiments = [];
  const landNodes = nodes.filter(node => !node.n);
  const navalNodes = nodes.filter(node => node.n);
  const navalTarget = navalNodes.length ? clamp(Math.round(target * (navalNodes.length / nodes.length)), 1, Math.min(navalNodes.length, 5)) : 0;
  const landTarget = Math.max(landNodes.length ? 1 : 0, target - navalTarget);
  const grouped = [...groupNodes(landNodes, landTarget), ...groupNodes(navalNodes, navalTarget)];

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
    const regiment = {
      i: id,
      a: round(total),
      cell: lead.cell,
      x: round(lead.x, 2),
      y: round(lead.y, 2),
      bx: round(lead.x, 2),
      by: round(lead.y, 2),
      u: roundUnitMap(units),
      n: lead.n,
      s: lead.s,
      type: lead.n ? "fleet" : "regiment",
      name: getRegimentName(pack, state, lead, id, regiments),
      state: state.i
    };
    regiments.push(regiment);
  }

  return regiments;
}

function groupNodes(nodes, target) {
  if (!nodes.length || target <= 0) return [];
  const maxRegiments = Math.max(1, Math.min(target, nodes.length));
  const grouped = new Array(maxRegiments).fill(null).map(() => []);

  for (let index = 0; index < nodes.length; index++) grouped[index % maxRegiments].push(nodes[index]);
  return grouped;
}

function getUrbanTroops(pack, state, burg, unit, alert, random) {
  if (unit.urban <= 0) return 0;
  if (unit.type === "naval" && (!burg.port || pack.cells.haven?.[burg.cell] === undefined)) return 0;
  const terrain = getCellType(pack.cells, burg.cell);
  const terrainModifier = TERRAIN_MODIFIERS[terrain]?.[unit.type] || 1;
  const stateModifier = STATE_MODIFIERS[unit.type]?.[state.type || "Generic"] || 1;
  const capitalModifier = burg.capital ? 1.25 : 1;
  const cultureModifier = burg.culture === state.culture ? 1 : 0.55;
  const population = burg.population || 0;
  const variance = random.range(0.78, 1.28);
  return round(population * unit.urban * 420 * alert * stateModifier * terrainModifier * capitalModifier * cultureModifier * variance);
}

function getRuralTroops(pack, state, cell, unit, alert, random) {
  if (unit.rural <= 0 || unit.type === "naval") return 0;
  const terrain = getCellType(pack.cells, cell);
  const terrainModifier = TERRAIN_MODIFIERS[terrain]?.[unit.type] || 1;
  const stateModifier = STATE_MODIFIERS[unit.type]?.[state.type || "Generic"] || 1;
  const cultureModifier = pack.cells.culture?.[cell] === state.culture ? 1 : 0.5;
  const population = pack.cells.pop?.[cell] || 0;
  const variance = random.range(0.72, 1.2);
  return round(population * unit.rural * 18 * alert * stateModifier * terrainModifier * cultureModifier * variance);
}

function getStateRegimentTarget(state, cellsForState, burgsForState, alert, densityFactor = 1) {
  const burgFactor = Math.sqrt(Math.max(1, burgsForState.length)) * 2.5;
  const cellFactor = Math.sqrt(Math.max(1, cellsForState.length)) * 0.18;
  const areaFactor = Math.sqrt(Math.max(1, state.area || 1)) * 0.02;
  const minimum = burgsForState.length ? 1 : 0;
  return clamp(Math.round((burgFactor + cellFactor + areaFactor) * Math.sqrt(alert) * densityFactor), minimum, 26);
}

function getRegimentDensityFactor(cells) {
  let land = 0;
  for (const cell of cells.i) if ((cells.h[cell] || 0) >= 20) land++;
  const landRatio = land / Math.max(1, cells.i.length);
  return clamp((landRatio - 0.5) / 0.45, 0.25, 1);
}

function getStateAlert(state, averageArea, averageExpansion) {
  const expansionRate = (state.expansionism || 1) / averageExpansion;
  const areaRate = Math.sqrt((state.area || averageArea) / averageArea);
  const neighborRate = 0.7 + Math.min(1.8, (state.neighbors?.length || 0) * 0.18);
  return clamp(round(expansionRate * areaRate * neighborRate, 2), 0.25, 3.5);
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

function getRegimentName(pack, state, node, id, regiments) {
  const proper = node.n
    ? null
    : pack.cells.province?.[node.cell] && pack.provinces?.[pack.cells.province[node.cell]]
      ? pack.provinces[pack.cells.province[node.cell]].name
      : pack.cells.burg?.[node.cell] && pack.burgs?.[pack.cells.burg[node.cell]]
        ? pack.burgs[pack.cells.burg[node.cell]].name
        : state.name;
  const number = regiments.filter(regiment => regiment.n === node.n && regiment.i < id).length + 1;
  const form = node.n ? "Fleet" : "Regiment";
  return `${number}${proper ? ` (${proper}) ` : " "}${form}`;
}

function roundUnitMap(units) {
  const result = {};
  for (const [unit, value] of Object.entries(units)) result[unit] = round(value);
  return result;
}

function emptyMilitaryResult(startedAt) {
  return {
    metadata: {
      statesWithMilitary: 0,
      regiments: 0,
      troops: 0,
      navalRegiments: 0,
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
}

function average(values) {
  const filtered = values.filter(value => Number.isFinite(value) && value > 0);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
