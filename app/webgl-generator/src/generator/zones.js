import {createRandom} from "./random.js";
import {isActiveEnemyPair} from "./war-consistency.js";
import {rebuildWildernessZones} from "../runtime/zone-wilderness.js";

const ZONE_TYPES = [
  "Warzone",
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
  Warzone: "url(#hatch3)",
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
  const persistent = (pack.zones || []).filter(zone => zone && (zone.category && zone.category !== "event" || zone.source === "manual"));
  const zones = uniqueZones([...(options.preservedZones || []), ...persistent]).map(zone => structuredClone(zone));
  const occupied = new Set(zones.filter(zone => (zone.coverage || (zone.category === "event" ? "overlay" : "base")) === "overlay").flatMap(zone => zone?.cells || []).filter(Number.isInteger));
  const reservedIds = new Set(zones.map(zone => Number(zone?.i ?? zone?.id)).filter(Number.isInteger));
  let eventCount = zones.filter(zone => !zone.category || zone.category === "event").length;

  for (const type of types) {
    if (eventCount >= target) break;
    const zone = createZone(type, pack, random, occupied, nextZoneId(reservedIds));
    if (!zone?.cells?.length) continue;
    for (const cell of zone.cells) occupied.add(cell);
    zones.push(zone);
    eventCount += 1;
    reservedIds.add(Number(zone.i));
  }

  const finalZones = rebuildWildernessZones(pack, zones, {preservedZones: options.preservedZones || []});
  pack.zones = finalZones;
  return createZonesResult(pack, finalZones, startedAt, target);
}

function nextZoneId(reservedIds) {
  let id = 0;
  while (reservedIds.has(id)) id += 1;
  return id;
}

function uniqueZones(zones) {
  const result = [];
  const ids = new Set();
  for (const zone of zones) {
    const id = Number(zone?.i ?? zone?.id);
    if (!Number.isInteger(id) || ids.has(id)) continue;
    ids.add(id);
    result.push(zone);
  }
  return result;
}

function createZone(type, pack, random, occupied, id) {
  const factory = {
    Warzone: createWarzoneZone,
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

  const zone = {
    i: id,
    name: result.name || `${type} ${id + 1}`,
    type,
    category: "event",
    source: "generated",
    customTypeName: "",
    description: "",
    coverage: "overlay",
    effects: {habitability: 0, movementCost: 1, economy: 1, defense: 0},
    cells: result.cells.filter(cell => isValidCell(pack.cells, cell)),
    color: ZONE_COLORS[type] || "url(#hatch5)",
    pattern: result.pattern || patternForZoneType(type),
    hexColor: result.hexColor || colorForZoneType(type),
    hidden: false,
    context: result.context || {status: "incomplete", participants: []}
  };
  if (Number(result.attacker) > 0) zone.attacker = Number(result.attacker);
  if (Number(result.defender) > 0) zone.defender = Number(result.defender);
  return zone;
}

function createWarzoneZone(pack, random, occupied) {
  const front = pick((pack.military?.fronts || []).filter(item =>
    item?.borderCellPairs?.length && isActiveEnemyPair(pack.states, item.attacker, item.defender)
  ), random);
  if (front) {
    const pair = pick(front.borderCellPairs || [], random);
    const start = pair ? pick(pair.filter(Number.isInteger), random) : null;
    if (Number.isInteger(start)) {
      const attacker = pack.states?.[front.attacker];
      const defender = pack.states?.[front.defender];
      const allowedStates = new Set([front.attacker, front.defender].map(Number).filter(Boolean));
      const cells = collectRegion(pack, start, random, {
        maxCells: random.integer(8, 26),
        occupied,
        allow: cell => isLand(pack.cells, cell) && allowedStates.has(Number(pack.cells.state?.[cell] || 0))
      });
      return {name: `${stateName(attacker)}-${stateName(defender)}战区`, cells, pattern: "cross", hexColor: "#d65a42", attacker: front.attacker, defender: front.defender, context: eventContext([
        participant("attacker", "state", front.attacker, stateName(attacker)),
        participant("defender", "state", front.defender, stateName(defender))
      ])};
    }
  }

  const border = enemyBorderCells(pack).filter(cell => !occupied.has(cell));
  const start = pick(border, random);
  if (!Number.isInteger(start)) return null;
  const stateId = pack.cells.state[start];
  const enemyId = (pack.cells.c[start] || []).map(cell => pack.cells.state[cell]).find(id => id && id !== stateId && isActiveEnemyPair(pack.states, stateId, id));
  if (!enemyId) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(8, 24),
    occupied,
    allow: cell => isLand(pack.cells, cell) && (pack.cells.state[cell] === stateId || pack.cells.state[cell] === enemyId)
  });
  return {name: `${stateName(pack.states?.[stateId])}-${stateName(pack.states?.[enemyId])}战区`, cells, pattern: "cross", hexColor: "#d65a42", attacker: stateId, defender: enemyId, context: eventContext([
    participant("attacker", "state", stateId, stateName(pack.states?.[stateId])),
    participant("defender", "state", enemyId, stateName(pack.states?.[enemyId]))
  ])};
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
  return {name: `${stateName(attacker)} Invasion`, cells, attacker: attackerId, defender: defender?.i, context: eventContext([
    participant("invader", "state", attackerId, stateName(attacker)),
    participant("defender", "state", defender?.i, stateName(defender))
  ])};
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
  const rebel = rebelParticipant(pack, state, cells, start);
  return {name: `${stateName(state)} Rebels`, cells, context: eventContext([
    rebel,
    participant("ruler", "state", state.i, stateName(state))
  ])};
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
  return {name: `${religionName(sourceReligion)} Proselytism`, cells, context: eventContext([
    participant("source-religion", "religion", sourceReligion?.i, sourceReligion?.name),
    participant("target-religion", "religion", targetReligion, pack.religions?.[targetReligion]?.name)
  ])};
}

function createCrusadeZone(pack, random, occupied) {
  const heresies = (pack.religions || []).filter(religion => religion?.i && !religion.removed && religion.type === "Heresy");
  const religion = pick(heresies, random) || pick((pack.religions || []).filter(item => item?.i && !item.removed && item.type !== "Folk"), random);
  if (!religion) return null;
  const religionCells = pack.cells.i.filter(cell => !occupied.has(cell) && isPopulatedLand(pack.cells, cell) && pack.cells.religion?.[cell] === religion.i);
  const maxCells = religion.type === "Heresy" ? Math.max(20, Math.min(religionCells.length, random.integer(24, 72))) : random.integer(15, 45);
  const start = pick(religionCells, random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells,
    occupied,
    allow: cell => isPopulatedLand(pack.cells, cell) && pack.cells.religion?.[cell] === religion.i
  });
  const targetReligion = religion.type === "Heresy" ? religion : neighboringReligion(pack, cells, religion.i);
  const initiatorReligion = religion.type === "Heresy" ? pack.religions?.[religion.parent] : religion;
  return {name: `${religionName(religion)} Crusade`, cells, context: eventContext([
    participant("initiator-religion", "religion", initiatorReligion?.i, initiatorReligion?.name),
    participant("target-religion", "religion", targetReligion?.i, targetReligion?.name)
  ])};
}

function createDiseaseZone(pack, random, occupied) {
  const burg = pick(validBurgs(pack).filter(item => !occupied.has(item.cell)), random);
  if (!burg) return null;
  const cells = collectRegion(pack, burg.cell, random, {
    maxCells: random.integer(20, 40),
    occupied,
    allow: cell => isPopulatedLand(pack.cells, cell)
  });
  return {name: `${burg.name || "City"} Plague`, cells, context: hazardContext(
    participant("origin", "burg", burg.i, burg.name),
    affectedParticipants(pack, cells)
  )};
}

function createDisasterZone(pack, random, occupied) {
  const burg = pick(validBurgs(pack).filter(item => !occupied.has(item.cell)), random);
  if (!burg) return null;
  const cells = collectRegion(pack, burg.cell, random, {
    maxCells: random.integer(5, 25),
    occupied,
    allow: cell => isLand(pack.cells, cell) && ((pack.cells.pop?.[cell] || 0) > 0 || pack.cells.burg?.[cell])
  });
  return {name: `${burg.name || "Local"} Disaster`, cells, context: hazardContext(
    participant("origin", "burg", burg.i, burg.name),
    affectedParticipants(pack, cells)
  )};
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
  return {name: `${cultureName(pack, start)} Eruption`, cells, context: hazardContext(
    marker ? participant("origin", "marker", marker.id ?? marker.i, marker.name || marker.label || "火山") : participant("origin", "feature", pack.cells.f?.[start], "高地火山"),
    affectedParticipants(pack, cells)
  )};
}

function createAvalancheZone(pack, random, occupied) {
  const start = pick(pack.cells.i.filter(cell => !occupied.has(cell) && isLand(pack.cells, cell) && pack.cells.h[cell] >= 70), random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(3, 15),
    occupied,
    allow: cell => isLand(pack.cells, cell) && pack.cells.h[cell] >= 65
  });
  return {name: `${cultureName(pack, start)} Avalanche`, cells, context: hazardContext(
    participant("origin", "region", `cell:${start}`, `${cultureName(pack, start)}高地`),
    affectedParticipants(pack, cells)
  )};
}

function createFaultZone(pack, random, occupied) {
  const start = pick(pack.cells.i.filter(cell => !occupied.has(cell) && pack.cells.h[cell] > 50 && pack.cells.h[cell] < 70 && !pack.cells.r?.[cell]), random);
  if (!Number.isInteger(start)) return null;
  const cells = collectRegion(pack, start, random, {
    maxCells: random.integer(3, 15),
    occupied,
    allow: cell => isLand(pack.cells, cell) && !pack.cells.r?.[cell] && pack.cells.h[cell] > 30
  });
  return {name: `${cultureName(pack, start)} Fault`, cells, context: hazardContext(
    participant("origin", "region", `cell:${start}`, `${cultureName(pack, start)}断层`),
    affectedParticipants(pack, cells)
  )};
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
  const river = (pack.rivers || []).find(item => Number(item?.i ?? item?.id) === Number(riverId));
  return {name: `${burg?.name || cultureName(pack, start)} Flood`, cells, context: hazardContext(
    participant("origin", "river", riverId, river?.name || `河流 #${riverId}`),
    affectedParticipants(pack, cells)
  )};
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
  return {name: `${cultureName(pack, start)} Tsunami`, cells, context: hazardContext(
    participant("origin", "region", `cell:${start}`, `${cultureName(pack, start)}近海`),
    affectedParticipants(pack, cells)
  )};
}

function eventContext(participants) {
  const normalized = participants.filter(Boolean);
  return {status: normalized.length === participants.length ? "active" : "incomplete", participants: normalized};
}

function hazardContext(origin, affected) {
  return eventContext([origin, ...affected]);
}

function participant(role, kind, id, nameSnapshot) {
  if (id === undefined || id === null || id === "" || Number.isNaN(id)) return null;
  return {role, ref: {kind, id, ...(nameSnapshot ? {nameSnapshot: String(nameSnapshot)} : {})}};
}

function affectedParticipants(pack, cells) {
  const result = [];
  const seen = new Set();
  for (const cell of cells || []) {
    const burgId = Number(pack.cells.burg?.[cell] || 0);
    const stateId = Number(pack.cells.state?.[cell] || 0);
    const candidate = burgId
      ? participant("affected", "burg", burgId, pack.burgs?.[burgId]?.name)
      : stateId ? participant("affected", "state", stateId, stateName(pack.states?.[stateId])) : null;
    if (!candidate) continue;
    const key = `${candidate.ref.kind}:${candidate.ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
    if (result.length >= 8) break;
  }
  return result;
}

function rebelParticipant(pack, state, cells, start) {
  const cultureId = dominantDifferentValue(cells, pack.cells.culture, state.culture);
  if (cultureId) return participant("rebel", "culture", cultureId, pack.cultures?.[cultureId]?.name);
  const religionId = dominantDifferentValue(cells, pack.cells.religion, state.religion);
  if (religionId) return participant("rebel", "religion", religionId, pack.religions?.[religionId]?.name);
  const provinceId = dominantDifferentValue(cells, pack.cells.province, 0);
  if (provinceId) return participant("rebel", "province", provinceId, pack.provinces?.[provinceId]?.name);
  return participant("rebel", "faction", `zone:${state.i}:${start}`, `${cultureName(pack, start)}地区叛军`);
}

function dominantDifferentValue(cells, values, excluded) {
  const counts = new Map();
  for (const cell of cells || []) {
    const value = Number(values?.[cell] || 0);
    if (!value || value === Number(excluded || 0)) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] || 0;
}

function neighboringReligion(pack, cells, excluded) {
  for (const cell of cells || []) {
    for (const neighbor of pack.cells.c?.[cell] || []) {
      const religionId = Number(pack.cells.religion?.[neighbor] || 0);
      if (religionId && religionId !== Number(excluded)) return pack.religions?.[religionId];
    }
  }
  return null;
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
  return clamp(Math.round(2 + Math.sqrt(pack.cells.i.length) / 95), 2, 6);
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

function enemyBorderCells(pack) {
  return stateBorderCells(pack).filter(cell => {
    const stateId = pack.cells.state?.[cell];
    const state = pack.states?.[stateId];
    return (pack.cells.c[cell] || []).some(neighbor => {
      const neighborState = pack.cells.state?.[neighbor];
      return neighborState && neighborState !== stateId && isActiveEnemyPair(pack.states, state?.i, neighborState);
    });
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

function patternForZoneType(type) {
  if (type === "Warzone" || type === "Rebels" || type === "Crusade" || type === "Eruption" || type === "Tsunami") return "cross";
  if (type === "Disease" || type === "Flood" || type === "Proselytism") return "dots";
  return "diagonal";
}

function colorForZoneType(type) {
  return {
    Warzone: "#d65a42",
    Invasion: "#d98238",
    Rebels: "#c79735",
    Proselytism: "#9b76d6",
    Crusade: "#b48be2",
    Disease: "#668f5a",
    Disaster: "#b26852",
    Eruption: "#c85b38",
    Avalanche: "#c4ced2",
    Fault: "#8d7d70",
    Flood: "#4e9ac9",
    Tsunami: "#4a9dbe"
  }[type] || "#b26852";
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
