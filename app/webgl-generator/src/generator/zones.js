import {createRandom} from "./random.js";

const ZONE_TYPES = [
  "Invasion",
  "Rebels",
  "Proselytism",
  "Crusade",
  "Disease",
  "Disaster",
  "Eruption",
  "Avalanche",
  "Fault",
  "Flood",
  "Tsunami"
];

const EXTRA_TYPES = ["Disease", "Flood", "Proselytism", "Disaster", "Invasion"];

const ZONE_COLORS = {
  Invasion: "url(#hatch1)",
  Rebels: "url(#hatch3)",
  Proselytism: "url(#hatch6)",
  Crusade: "url(#hatch6)",
  Disease: "url(#hatch12)",
  Disaster: "url(#hatch5)",
  Eruption: "url(#hatch7)",
  Avalanche: "url(#hatch5)",
  Fault: "url(#hatch2)",
  Flood: "url(#hatch13)",
  Tsunami: "url(#hatch13)"
};

export function buildZones(pack, options = {}) {
  const startedAt = performance.now();
  const cells = pack?.cells;
  if (!cells?.i?.length) return emptyZonesResult(startedAt, pack);

  const random = createRandom(`${options.seed}:zones`);
  const target = getTargetZoneCount(pack);
  const types = getZoneTypePlan(target);
  const occupied = new Set();
  const zones = [];

  for (const type of types) {
    const zone = createZone(type, pack, random, occupied, zones.length);
    if (!zone?.cells?.length) continue;
    for (const cell of zone.cells) occupied.add(cell);
    zones.push(zone);
    if (zones.length >= target) break;
  }

  pack.zones = zones;
  return createZonesResult(pack, zones, startedAt, target);
}

function createZone(type, pack, random, occupied, id) {
  const factory = {
    Invasion: createInvasionZone,
    Rebels: createRebelsZone,
    Proselytism: createProselytismZone,
    Crusade: createCrusadeZone,
    Disease: createDiseaseZone,
    Disaster: createDisasterZone,
    Eruption: createEruptionZone,
    Avalanche: createAvalancheZone,
    Fault: createFaultZone,
    Flood: createFloodZone,
    Tsunami: createTsunamiZone
  }[type];
  const result = factory?.(pack, random, occupied);
  if (!result?.cells?.length) return null;

  return {
    i: id,
    name: result.name || `${type} ${id + 1}`,
    type,
    cells: result.cells.filter(cell => isValidCell(pack.cells, cell)),
    color: ZONE_COLORS[type] || "url(#hatch5)",
    hidden: false
  };
}

function createInvasionZone(pack, random, occupied) {
  const border = stateBorderCells(pack).filter(cell => !occupied.has(cell));
  const start = pick(border, random);
  if (!Number.isInteger(start)) return null;
  const defender = pack.states?.[pack.cells.state[start]];
  const attackerId = pick((pack.cells.c[start] || []).map(cell => pack.cells.state[cell]).filter(state => state && state !== pack.cells.state[start]), random);
  const attacker = pack.states?.[attackerId];
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(5, 30),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.state[cell] === defender?.i
  });
  return {name: `${stateName(attacker)} Invasion`, cells};
}

function createRebelsZone(pack, random, occupied) {
  const state = pick((pack.states || []).filter(item => item?.i && !item.removed && item.neighbors?.some(Boolean)), random);
  if (!state) return null;
  const start = pick(
    pack.cells.i.filter(
      cell =>
        !occupied.has(cell) &&
        isLand(pack.cells, cell) &&
        pack.cells.state[cell] === state.i &&
        (pack.cells.c[cell] || []).some(neighbor => pack.cells.state[neighbor] && pack.cells.state[neighbor] !== state.i)
    ),
    random
  );
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(10, 30),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.state[cell] === state.i
  });
  return {name: `${stateName(state)} Rebels`, cells};
}

function createProselytismZone(pack, random, occupied) {
  const starts = pack.cells.i.filter(cell => {
    if (occupied.has(cell) || !isPopulatedLand(pack.cells, cell)) return false;
    const religion = pack.cells.religion?.[cell] || 0;
    return (pack.cells.c[cell] || []).some(neighbor => isPopulatedLand(pack.cells, neighbor) && pack.cells.religion?.[neighbor] && pack.cells.religion[neighbor] !== religion);
  });
  const start = pick(starts, random);
  if (!Number.isInteger(start)) return null;
  const targetReligion = pack.cells.religion?.[start] || 0;
  const sourceReligion = pack.religions?.[(pack.cells.c[start] || []).map(cell => pack.cells.religion?.[cell]).find(id => id && id !== targetReligion)];
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(10, 30),
    occupied,
    allow: cell => isPopulatedLand(pack.cells, cell) && (pack.cells.religion?.[cell] || 0) === targetReligion
  });
  return {name: `${religionName(sourceReligion)} Proselytism`, cells};
}

function createCrusadeZone(pack, random, occupied) {
  const heresies = (pack.religions || []).filter(religion => religion?.i && !religion.removed && religion.type === "Heresy");
  const religion = pick(heresies, random) || pick((pack.religions || []).filter(item => item?.i && !item.removed && item.type !== "Folk"), random);
  if (!religion) return null;
  const religionCells = pack.cells.i.filter(cell => !occupied.has(cell) && isPopulatedLand(pack.cells, cell) && pack.cells.religion?.[cell] === religion.i);
  const maxCells = religion.type === "Heresy" ? Math.max(20, Math.min(religionCells.length, random.integer(200, 3600))) : random.integer(15, 45);
  const start = pick(religionCells, random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells,
    occupied,
    allow: cell => isPopulatedLand(pack.cells, cell) && pack.cells.religion?.[cell] === religion.i
  });
  return {name: `${religionName(religion)} Crusade`, cells};
}

function createDiseaseZone(pack, random, occupied) {
  const burg = pick(validBurgs(pack).filter(item => !occupied.has(item.cell)), random);
  if (!burg) return null;
  const cells = collectRegion(pack, burg.cell, random, {
    maxCells: random.integer(20, 40),
    occupied,
    allow: cell => isPopulatedLand(pack.cells, cell)
  });
  return {name: `${burg.name || "City"} Plague`, cells};
}

function createDisasterZone(pack, random, occupied) {
  const burg = pick(validBurgs(pack).filter(item => !occupied.has(item.cell)), random);
  if (!burg) return null;
  const cells = collectRegion(pack, burg.cell, random, {
    maxCells: random.integer(5, 25),
    occupied,
    allow: cell => isLand(pack.cells, cell) && ((pack.cells.pop?.[cell] || 0) > 0 || pack.cells.burg?.[cell])
  });
  return {name: `${burg.name || "Local"} Disaster`, cells};
}

function createEruptionZone(pack, random, occupied) {
  const marker = pick((pack.markers || []).filter(item => item.type === "volcanoes" && Number.isInteger(item.packCell) && !occupied.has(item.packCell)), random);
  const start = marker?.packCell ?? pick(pack.cells.i.filter(cell => !occupied.has(cell) && pack.cells.h[cell] >= 70), random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(10, 30),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.h[cell] >= 45
  });
  return {name: `${cultureName(pack, start)} Eruption`, cells};
}

function createAvalancheZone(pack, random, occupied) {
  const start = pick(pack.cells.i.filter(cell => !occupied.has(cell) && isLand(pack.cells, cell) && pack.cells.h[cell] >= 70), random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(3, 15),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.h[cell] >= 65
  });
  return {name: `${cultureName(pack, start)} Avalanche`, cells};
}

function createFaultZone(pack, random, occupied) {
  const start = pick(pack.cells.i.filter(cell => !occupied.has(cell) && pack.cells.h[cell] > 50 && pack.cells.h[cell] < 70 && !pack.cells.r?.[cell]), random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(3, 15),
    occupied,
    allow: cell => isLand(pack.cells, cell) && !pack.cells.r?.[cell] && pack.cells.h[cell] > 30
  });
  return {name: `${cultureName(pack, start)} Fault`, cells};
}

function createFloodZone(pack, random, occupied) {
  const riverCells = pack.cells.i.filter(cell => !occupied.has(cell) && isLand(pack.cells, cell) && pack.cells.r?.[cell] && pack.cells.fl?.[cell] > 0);
  if (!riverCells.length) return null;
  const flux = riverCells.map(cell => pack.cells.fl[cell] || 0);
  const threshold = quantile(flux, 0.72);
  const start = pick(riverCells.filter(cell => (pack.cells.fl[cell] || 0) >= threshold && (pack.cells.pop?.[cell] || pack.cells.burg?.[cell])), random) ?? pick(riverCells, random);
  if (!Number.isInteger(start)) return null;
  const riverId = pack.cells.r[start];
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(5, 30),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.h[cell] < 55 && pack.cells.r?.[cell] === riverId
  });
  const burg = pack.burgs?.[pack.cells.burg?.[start]];
  return {name: `${burg?.name || cultureName(pack, start)} Flood`, cells};
}

function createTsunamiZone(pack, random, occupied) {
  const start = pick(
    pack.cells.i.filter(cell => {
      if (occupied.has(cell) || pack.cells.t?.[cell] !== 1) return false;
      return (pack.cells.c[cell] || []).some(neighbor => pack.cells.t?.[neighbor] === -1 && pack.features?.[pack.cells.f?.[neighbor]]?.type !== "lake");
    }),
    random
  );
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(10, 30),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.t?.[cell] <= 2
  });
  return {name: `${cultureName(pack, start)} Tsunami`, cells};
}

function collectRegion(pack, start, random, {maxCells, occupied, allow}) {
  if (!isValidCell(pack.cells, start) || !allow(start)) return [];
  const result = [];
  const queue = [start];
  const queued = new Set([start]);

  while (queue.length && result.length < maxCells) {
    const index = random.next() < 0.45 ? 0 : queue.length - 1;
    const cell = queue.splice(index, 1)[0];
    if (!isValidCell(pack.cells, cell) || occupied.has(cell) || !allow(cell)) continue;
    result.push(cell);

    for (const neighbor of shuffle(pack.cells.c[cell] || [], random)) {
      if (queued.has(neighbor) || occupied.has(neighbor) || !allow(neighbor)) continue;
      queued.add(neighbor);
      queue.push(neighbor);
    }
  }

  return result;
}

function getZoneTypePlan(target) {
  const plan = [];
  const plannedAttempts = Math.max(target, ZONE_TYPES.length + target * 2);
  for (const type of ZONE_TYPES) {
    if (plan.length >= plannedAttempts) return plan;
    plan.push(type);
  }
  for (let index = 0; plan.length < plannedAttempts; index++) plan.push(EXTRA_TYPES[index % EXTRA_TYPES.length]);
  return plan;
}

function getTargetZoneCount(pack) {
  return clamp(Math.round(8 + pack.cells.i.length / 10000), 7, 20);
}

function createZonesResult(pack, zones, startedAt, target) {
  return {
    zones,
    metadata: {
      zones: zones.length,
      target,
      types: countByType(zones),
      cells: zones.reduce((sum, zone) => sum + zone.cells.length, 0),
      hidden: zones.filter(zone => zone.hidden).length,
      invalidCells: countInvalidZoneCells(pack, zones),
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
}

function emptyZonesResult(startedAt, pack) {
  if (pack) pack.zones = [];
  return {
    zones: [],
    metadata: {
      zones: 0,
      target: 0,
      types: {},
      cells: 0,
      hidden: 0,
      invalidCells: 0,
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
}

function stateBorderCells(pack) {
  return pack.cells.i.filter(cell => {
    if (!isLand(pack.cells, cell) || !pack.cells.state?.[cell]) return false;
    return (pack.cells.c[cell] || []).some(neighbor => isLand(pack.cells, neighbor) && pack.cells.state?.[neighbor] && pack.cells.state[neighbor] !== pack.cells.state[cell]);
  });
}

function validBurgs(pack) {
  return (pack.burgs || []).filter(burg => burg?.i && !burg.removed && isValidCell(pack.cells, burg.cell) && isLand(pack.cells, burg.cell));
}

function isPopulatedLand(cells, cell) {
  return isLand(cells, cell) && ((cells.pop?.[cell] || 0) > 0 || (cells.s?.[cell] || 0) > 0 || cells.burg?.[cell]);
}

function isLand(cells, cell) {
  return isValidCell(cells, cell) && cells.h[cell] >= 20;
}

function isValidCell(cells, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < cells.i.length;
}

function stateName(state) {
  return state?.name || state?.fullName || "Foreign";
}

function religionName(religion) {
  return religion?.name?.split(" ")[0] || "Sacred";
}

function cultureName(pack, cell) {
  const culture = pack.cultures?.[pack.cells.culture?.[cell]];
  return culture?.root || culture?.name?.replace("文化", "") || "Local";
}

function pick(values, random) {
  if (!values?.length) return undefined;
  return values[Math.floor(random.next() * values.length)];
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random.next() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function quantile(values, q) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  return list[Math.floor((list.length - 1) * q)];
}

function countByType(zones) {
  const counts = {};
  for (const zone of zones) counts[zone.type] = (counts[zone.type] || 0) + 1;
  return counts;
}

function countInvalidZoneCells(pack, zones) {
  let invalid = 0;
  for (const zone of zones) {
    for (const cell of zone.cells || []) if (!isValidCell(pack.cells, cell)) invalid++;
  }
  return invalid;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
