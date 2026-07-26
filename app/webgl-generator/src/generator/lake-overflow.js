import {MinPriorityQueue} from "./priority-queue.js";

const WATER_LEVEL = 20;
const PASSIVE_LAKE_RISE_LIMIT = 6;
const MAX_INCISION_BUDGET = 24;
const NO_CELL = -2;

export const LAKE_OVERFLOW_MODEL_VERSION = 1;

export function buildLakeEscapeField(pack, heights) {
  const cells = pack?.cells;
  const count = cells?.i?.length || 0;
  const barrier = new Float64Array(count);
  const distance = new Uint32Array(count);
  const next = new Int32Array(count);
  const waterExit = new Int32Array(count);
  barrier.fill(Infinity);
  distance.fill(0xffffffff);
  next.fill(NO_CELL);
  waterExit.fill(NO_CELL);

  const queue = new MinPriorityQueue();
  for (const cell of cells?.i || []) {
    if (cells.h[cell] < WATER_LEVEL) continue;
    const oceanCell = findOceanNeighbor(pack, cell);
    if (!cells.b?.[cell] && oceanCell === null) continue;
    const cellBarrier = finiteHeight(heights?.[cell], cells.h[cell]);
    barrier[cell] = cellBarrier;
    distance[cell] = 0;
    next[cell] = -1;
    waterExit[cell] = oceanCell ?? -1;
    queue.push({cell, barrier: cellBarrier, distance: 0}, escapePriority(cellBarrier, 0));
  }

  while (queue.length) {
    const current = queue.pop();
    if (!sameEscapeCost(current, barrier[current.cell], distance[current.cell])) continue;

    for (const neighbor of cells.c?.[current.cell] || []) {
      if (cells.h[neighbor] < WATER_LEVEL) continue;
      const neighborHeight = finiteHeight(heights?.[neighbor], cells.h[neighbor]);
      const candidateBarrier = Math.max(current.barrier, neighborHeight);
      const candidateDistance = current.distance + 1;
      if (!betterEscapeCost(candidateBarrier, candidateDistance, barrier[neighbor], distance[neighbor])) continue;

      barrier[neighbor] = candidateBarrier;
      distance[neighbor] = candidateDistance;
      next[neighbor] = current.cell;
      waterExit[neighbor] = waterExit[current.cell];
      queue.push(
        {cell: neighbor, barrier: candidateBarrier, distance: candidateDistance},
        escapePriority(candidateBarrier, candidateDistance)
      );
    }
  }

  return {barrier, distance, next, waterExit};
}

export function createLakeOverflowPlan(pack, heights, lake, escapeField, options = {}) {
  if (!lake?.shoreline?.length || !escapeField?.barrier) return null;

  let outCell = null;
  let bestBarrier = Infinity;
  let bestDistance = 0xffffffff;
  for (const cell of lake.shoreline) {
    const barrier = escapeField.barrier[cell];
    const distance = escapeField.distance[cell];
    if (!Number.isFinite(barrier)) continue;
    if (!betterEscapeCost(barrier, distance, bestBarrier, bestDistance)) continue;
    outCell = cell;
    bestBarrier = barrier;
    bestDistance = distance;
  }
  if (outCell === null) return null;

  const route = [];
  const seen = new Set();
  let current = outCell;
  while (current >= 0 && route.length <= escapeField.next.length) {
    if (seen.has(current)) return null;
    seen.add(current);
    route.push(current);
    current = escapeField.next[current];
  }
  if (!route.length || current !== -1) return null;

  const heightExponent = Number(options.heightExponent) || 2;
  const lakeHeight = finiteHeight(lake.height, WATER_LEVEL);
  const spillElevation = Math.max(lakeHeight, bestBarrier);
  const spillRise = Math.max(0, spillElevation - lakeHeight);
  const spillRiseMeters = Math.max(0, heightUnitsToMeters(spillElevation, heightExponent) - heightUnitsToMeters(lakeHeight, heightExponent));
  const storageArea = positiveNumber(lake.area) || positiveNumber(lake.cells) || 1;
  const storageCapacity = storageArea * spillRiseMeters;
  const requiredIncision = Math.max(0, spillRise - PASSIVE_LAKE_RISE_LIMIT);
  const terminalCell = escapeField.waterExit[outCell];

  return {
    lakeId: Number(lake.i ?? lake.id ?? 0),
    outCell,
    route,
    terminalCell,
    spillElevation: round(spillElevation, 3),
    spillRise: round(spillRise, 3),
    spillRiseMeters: round(spillRiseMeters, 2),
    storageCapacity: round(storageCapacity, 2),
    requiredIncision: round(requiredIncision, 3),
    geomorphicClosed: Boolean(lake.closed),
    method: "minimum-spill-barrier"
  };
}

export function evaluateLakeOverflow(lake, plan) {
  const flux = nonNegativeNumber(lake?.flux);
  const evaporation = nonNegativeNumber(lake?.evaporation);
  const netFlux = flux - evaporation;
  const incisionBudget = lakeIncisionBudget(netFlux);
  const storageCapacity = nonNegativeNumber(plan?.storageCapacity);
  const estimatedFillTime = netFlux > 0 ? storageCapacity / netFlux : null;

  let status = "no-escape";
  let overflows = false;
  if (plan && netFlux <= 0) status = "balanced-terminal";
  else if (plan && plan.requiredIncision > incisionBudget) status = "incision-limited";
  else if (plan) {
    status = plan.geomorphicClosed ? "overflow-channel" : "natural-outlet";
    overflows = true;
  }

  return {
    overflows,
    status,
    flux: round(flux, 2),
    evaporation: round(evaporation, 2),
    netFlux: round(netFlux, 2),
    storageCapacity: round(storageCapacity, 2),
    estimatedFillTime: estimatedFillTime === null ? null : round(estimatedFillTime, 3),
    incisionBudget: round(incisionBudget, 3)
  };
}

export function applyLakeOverflowDiagnostics(lake, plan, evaluation) {
  if (!lake) return null;
  const diagnostics = {
    version: LAKE_OVERFLOW_MODEL_VERSION,
    status: evaluation?.status || "unknown",
    geomorphicClosed: Boolean(plan?.geomorphicClosed ?? lake.closed),
    flux: nonNegativeNumber(evaluation?.flux ?? lake.flux),
    evaporation: nonNegativeNumber(evaluation?.evaporation ?? lake.evaporation),
    netFlux: finiteNumberOrNull(evaluation?.netFlux),
    storageCapacity: finiteNumberOrNull(plan?.storageCapacity ?? evaluation?.storageCapacity),
    estimatedFillTime: finiteNumberOrNull(evaluation?.estimatedFillTime),
    spillElevation: finiteNumberOrNull(plan?.spillElevation),
    spillRise: finiteNumberOrNull(plan?.spillRise),
    spillRiseMeters: finiteNumberOrNull(plan?.spillRiseMeters),
    spillCell: integerOrNull(plan?.outCell),
    pathCells: Array.isArray(plan?.route) ? plan.route.length : 0,
    requiredIncision: finiteNumberOrNull(plan?.requiredIncision),
    incisionBudget: finiteNumberOrNull(evaluation?.incisionBudget),
    method: plan?.method || "unknown"
  };
  lake.overflow = diagnostics;
  return diagnostics;
}

export function normalizeLakeOverflowDiagnostics(pack) {
  let changed = 0;
  for (const feature of pack?.features || []) {
    if (!feature || feature.type !== "lake") continue;
    if (!feature.overflow || Number(feature.overflow.version) !== LAKE_OVERFLOW_MODEL_VERSION) {
      feature.overflow = {
        version: LAKE_OVERFLOW_MODEL_VERSION,
        status: feature.outlet ? "legacy-outlet" : "unknown-legacy",
        geomorphicClosed: null,
        flux: nonNegativeNumber(feature.flux),
        evaporation: nonNegativeNumber(feature.evaporation),
        netFlux: Number.isFinite(Number(feature.flux)) && Number.isFinite(Number(feature.evaporation))
          ? round(Number(feature.flux) - Number(feature.evaporation), 2)
          : null,
        storageCapacity: null,
        estimatedFillTime: null,
        spillElevation: null,
        spillRise: null,
        spillRiseMeters: null,
        spillCell: null,
        pathCells: 0,
        requiredIncision: null,
        incisionBudget: null,
        method: "legacy-unknown"
      };
      changed++;
      continue;
    }

    feature.overflow = {
      version: LAKE_OVERFLOW_MODEL_VERSION,
      status: String(feature.overflow.status || "unknown"),
      geomorphicClosed: typeof feature.overflow.geomorphicClosed === "boolean" ? feature.overflow.geomorphicClosed : null,
      flux: nonNegativeNumber(feature.overflow.flux ?? feature.flux),
      evaporation: nonNegativeNumber(feature.overflow.evaporation ?? feature.evaporation),
      netFlux: finiteNumberOrNull(feature.overflow.netFlux),
      storageCapacity: finiteNumberOrNull(feature.overflow.storageCapacity),
      estimatedFillTime: finiteNumberOrNull(feature.overflow.estimatedFillTime),
      spillElevation: finiteNumberOrNull(feature.overflow.spillElevation),
      spillRise: finiteNumberOrNull(feature.overflow.spillRise),
      spillRiseMeters: finiteNumberOrNull(feature.overflow.spillRiseMeters),
      spillCell: integerOrNull(feature.overflow.spillCell),
      pathCells: Math.max(0, Math.trunc(Number(feature.overflow.pathCells) || 0)),
      requiredIncision: finiteNumberOrNull(feature.overflow.requiredIncision),
      incisionBudget: finiteNumberOrNull(feature.overflow.incisionBudget),
      method: String(feature.overflow.method || "unknown")
    };
  }
  return {changed};
}

export function applyOverflowRouteOrdering(processingHeights, plan, lakeHeight) {
  if (!Array.isArray(processingHeights) || !plan?.route?.length) return;
  const step = 1 / Math.max(1000, plan.route.length * 10);
  const start = finiteHeight(lakeHeight, WATER_LEVEL) + step;
  for (let index = 0; index < plan.route.length; index++) {
    const cell = plan.route[index];
    processingHeights[cell] = Math.min(processingHeights[cell], start - step * index);
  }
}

export function activateOverflowRoute(activeDownstream, plan) {
  if (!(activeDownstream instanceof Map) || !plan?.route?.length) return;
  for (let index = 0; index < plan.route.length - 1; index++) {
    activeDownstream.set(plan.route[index], plan.route[index + 1]);
  }
  if (Number.isInteger(plan.terminalCell) && plan.terminalCell >= 0) {
    activeDownstream.set(plan.route.at(-1), plan.terminalCell);
  }
}

export function lakeIncisionBudget(netFlux) {
  const flux = Math.max(0, Number(netFlux) || 0);
  if (!flux) return 0;
  return Math.min(MAX_INCISION_BUDGET, 2 + Math.log2(1 + flux));
}

function findOceanNeighbor(pack, cell) {
  const {cells, features} = pack;
  for (const neighbor of cells.c?.[cell] || []) {
    if (cells.h[neighbor] >= WATER_LEVEL) continue;
    const feature = features?.[cells.f?.[neighbor]];
    if (feature?.type === "ocean" && feature.border !== false) return neighbor;
  }
  return null;
}

function escapePriority(barrier, distance) {
  return barrier * 1_000_000 + distance;
}

function betterEscapeCost(candidateBarrier, candidateDistance, currentBarrier, currentDistance) {
  if (candidateBarrier < currentBarrier - 1e-6) return true;
  return Math.abs(candidateBarrier - currentBarrier) <= 1e-6 && candidateDistance < currentDistance;
}

function sameEscapeCost(value, barrier, distance) {
  return Math.abs(value.barrier - barrier) <= 1e-6 && value.distance === distance;
}

function heightUnitsToMeters(value, exponent) {
  const height = finiteHeight(value, WATER_LEVEL);
  if (height < WATER_LEVEL) return 0;
  return Math.max(0, (height - 18) ** exponent);
}

function finiteHeight(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
