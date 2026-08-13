const STRONG_RIVER_THRESHOLD = 0.65;
const WEAK_RIVER_THRESHOLD = 0.35;

export const RIVER_POLITICAL_BARRIER_VERSION = 1;

export function createRiverPoliticalBarrier(pack, options = {}) {
  const cells = pack?.cells || {};
  const rivers = normalizeRivers(options.rivers || pack?.rivers || [], options.cellPathKey || "cells");
  const orders = deriveRiverOrders(rivers);
  const riverById = new Map();
  const strengthById = new Map();
  const riverAtCell = new Uint32Array(cells.i?.length || cells.h?.length || 0);

  for (const river of rivers) {
    const order = orders.get(river.id) || 1;
    const score = riverBarrierScore(river, order);
    const descriptor = Object.freeze({...river, order, ...score});
    riverById.set(river.id, descriptor);
    strengthById.set(river.id, score.strength);
    for (const cell of river.cells) if (cell >= 0 && cell < riverAtCell.length) {
      const previous = riverAtCell[cell];
      if (!previous || score.strength > (strengthById.get(previous) || 0) || score.strength === strengthById.get(previous) && river.id < previous) {
        riverAtCell[cell] = river.id;
      }
    }
  }

  return Object.freeze({
    version: RIVER_POLITICAL_BARRIER_VERSION,
    cells,
    burgs: pack?.burgs || [],
    routes: pack?.routes || [],
    riverAtCell,
    riverById,
    strengthById,
    strongThreshold: STRONG_RIVER_THRESHOLD,
    weakThreshold: WEAK_RIVER_THRESHOLD
  });
}

export function riverPoliticalTransition(context, from, to, {level = "province"} = {}) {
  if (!context || from === to) return emptyTransition();
  const fromCandidate = context.riverAtCell[from] || Number(context.cells.r?.[from]) || 0;
  const toCandidate = context.riverAtCell[to] || Number(context.cells.r?.[to]) || 0;
  const fromRiver = context.strengthById.has(fromCandidate) ? fromCandidate : 0;
  const toRiver = context.strengthById.has(toCandidate) ? toCandidate : 0;
  if (!fromRiver && !toRiver) return emptyTransition();

  const fromStrength = context.strengthById.get(fromRiver) || 0;
  const toStrength = context.strengthById.get(toRiver) || 0;
  const sameRiver = Boolean(fromRiver && fromRiver === toRiver);
  const lower = Math.min(fromStrength, toStrength);
  const strength = sameRiver
    ? Math.max(fromStrength, toStrength) * 0.15
    : Math.min(1, Math.max(fromStrength, toStrength) + lower * 0.15);
  const corridor = politicalCorridor(context, from, to);
  const multiplier = Math.max(0.25, corridor.multiplier);
  const effectiveStrength = strength * multiplier;
  const scale = level === "state" ? 60 : 45;
  const cost = scale * effectiveStrength ** 2;
  return {
    riverIds: [...new Set([fromRiver, toRiver].filter(Boolean))].sort(ascending),
    strength: round(strength),
    effectiveStrength: round(effectiveStrength),
    cost: round(cost),
    strong: strength >= context.strongThreshold,
    corridor: corridor.reason,
    corridorMultiplier: round(multiplier)
  };
}

export function summarizeRiverPoliticalBarrier(context) {
  const rivers = [...(context?.riverById?.values?.() || [])].sort((a, b) => a.id - b.id);
  return {
    version: RIVER_POLITICAL_BARRIER_VERSION,
    candidates: rivers.length,
    strong: rivers.filter(river => river.strength >= STRONG_RIVER_THRESHOLD).length,
    weak: rivers.filter(river => river.strength < WEAK_RIVER_THRESHOLD).length,
    rivers: rivers.map(river => ({
      id: river.id,
      parent: river.parent,
      order: river.order,
      cells: river.cells.length,
      flux: river.flux,
      width: river.width,
      length: river.length,
      strength: river.strength,
      components: river.components
    }))
  };
}

export function inspectRiverPoliticalBoundaries(context, owners) {
  const adopted = new Map();
  const crossings = new Map();
  for (const river of context?.riverById?.values?.() || []) {
    let boundaryCells = 0;
    let sameOwnerCrossings = 0;
    for (const cell of river.cells) {
      const neighboringOwners = new Set([owners?.[cell], ...(context.cells.c?.[cell] || []).map(neighbor => owners?.[neighbor])].filter(value => Number(value) > 0));
      if (neighboringOwners.size > 1) boundaryCells++;
      else if (neighboringOwners.size === 1) sameOwnerCrossings++;
    }
    adopted.set(river.id, boundaryCells);
    crossings.set(river.id, sameOwnerCrossings);
  }
  const rivers = [...context.riverById.values()];
  const eligibleCells = rivers.filter(river => river.strength >= STRONG_RIVER_THRESHOLD).reduce((sum, river) => sum + river.cells.length, 0);
  const adoptedCells = rivers.filter(river => river.strength >= STRONG_RIVER_THRESHOLD).reduce((sum, river) => sum + (adopted.get(river.id) || 0), 0);
  return {
    version: RIVER_POLITICAL_BARRIER_VERSION,
    eligibleCells,
    adoptedCells,
    adoptionRate: eligibleCells ? round(adoptedCells / eligibleCells) : 0,
    rivers: rivers.map(river => ({
      id: river.id,
      strength: river.strength,
      boundaryCells: adopted.get(river.id) || 0,
      sameOwnerCrossings: crossings.get(river.id) || 0
    }))
  };
}

export function deriveRiverOrders(rivers = []) {
  const byId = new Map(rivers.map(river => [Number(river.id ?? river.i), river]).filter(([id]) => id > 0));
  const children = new Map();
  for (const [id, river] of byId) {
    const parent = Number(river.parent) || 0;
    if (!parent || parent === id || !byId.has(parent)) continue;
    const list = children.get(parent) || [];
    list.push(id);
    children.set(parent, list);
  }
  const cache = new Map();
  const visiting = new Set();
  const orderFor = id => {
    if (cache.has(id)) return cache.get(id);
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const childOrders = (children.get(id) || []).sort(ascending).map(orderFor).sort((a, b) => b - a);
    const order = !childOrders.length ? 1 : childOrders.length > 1 && childOrders[0] === childOrders[1] ? childOrders[0] + 1 : childOrders[0];
    visiting.delete(id);
    cache.set(id, order);
    return order;
  };
  for (const id of [...byId.keys()].sort(ascending)) orderFor(id);
  return cache;
}

function normalizeRivers(rivers, cellPathKey) {
  return rivers
    .filter(river => Number(river?.id ?? river?.i) > 0)
    .map(river => ({
      id: Number(river.id ?? river.i),
      parent: Number(river.parent) || 0,
      flux: Math.max(0, Number(river.flux ?? river.discharge) || 0),
      width: Math.max(0, Number(river.width) || 0),
      length: Math.max(0, Number(river.length) || 0),
      cells: [...new Set((river[cellPathKey] || river.cells || []).map(Number).filter(Number.isInteger))]
    }))
    .sort((a, b) => a.id - b.id);
}

function riverBarrierScore(river, order) {
  const flux = normalizeLog(river.flux, 4000);
  const width = normalizeLog(river.width, 12);
  const hierarchy = clamp((order - 1) / 3, 0, 1);
  const continuous = clamp(normalizeLog(river.length, 900) * 0.6 + normalizeLog(river.cells.length, 180) * 0.4, 0, 1);
  return {
    strength: round(clamp(flux * 0.38 + width * 0.22 + hierarchy * 0.16 + continuous * 0.24, 0, 1)),
    components: Object.freeze({flux: round(flux), width: round(width), order: round(hierarchy), continuous: round(continuous)})
  };
}

function politicalCorridor(context, from, to) {
  const routeId = Number(context.cells.routes?.[from]?.[to] ?? context.cells.routes?.[String(from)]?.[String(to)]) || 0;
  const route = context.routes?.[routeId];
  const group = String(route?.group || route?.type || "").toLowerCase();
  if (group === "roads" || group === "road") return {multiplier: 0.35, reason: "road"};
  if (group === "trails" || group === "trail") return {multiplier: 0.55, reason: "trail"};
  const burgIds = [context.cells.burg?.[from], context.cells.burg?.[to]].map(Number).filter(Boolean);
  if (burgIds.some(id => context.burgs?.[id]?.port)) return {multiplier: 0.45, reason: "port"};
  if (burgIds.some(id => context.burgs?.[id]?.capital || context.burgs?.[id]?.provincial)) return {multiplier: 0.55, reason: "administrative-center"};
  if (burgIds.length) return {multiplier: 0.7, reason: "settlement"};
  return {multiplier: 1, reason: "none"};
}

function emptyTransition() {
  return {riverIds: [], strength: 0, effectiveStrength: 0, cost: 0, strong: false, corridor: "none", corridorMultiplier: 1};
}

function normalizeLog(value, reference) {
  return clamp(Math.log1p(Math.max(0, value)) / Math.log1p(reference), 0, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function ascending(a, b) {
  return a - b;
}
