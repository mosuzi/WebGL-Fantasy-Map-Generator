import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";
import {systemAffected} from "./edit-command-effects.js";

const WATER_LEVEL = 20;
const UNASSIGNED = 255;
const SEAFLOOR_STALE_SYSTEMS = Object.freeze([
  "climate",
  "rivers",
  "biomes",
  "cities",
  "states",
  "provinces",
  "cultures",
  "religions",
  "routes",
  "markers",
  "economy",
  "diplomacy",
  "military",
  "zones"
]);

export function inspectSeafloorReset(map, {seed} = {}) {
  const plan = buildSeafloorResetPlan(map, {seed});
  return summarizePlan(plan);
}

export function buildSeafloorResetPlan(map, {seed} = {}) {
  assertSeafloorInput(map);
  const normalizedSeed = normalizeSeed(seed ?? `${map.metadata?.seed || map.options?.seed || "map"}|seafloor`);
  const {grid, pack} = map;
  const openOcean = collectOpenOceanCells(map);
  if (!openOcean.length) return emptyPlan(normalizedSeed, topologyChecksum(map));

  const oceanMask = new Uint8Array(grid.cells.h.length);
  for (const cell of openOcean) oceanMask[cell] = 1;
  const coastDistance = buildCoastDistance(grid.cells.c, oceanMask, grid.cells.h);
  const plates = buildTectonicPlates(grid, openOcean, coastDistance, normalizedSeed);
  const generated = generateSeafloorHeights(grid, openOcean, oceanMask, coastDistance, plates, normalizedSeed);
  const gridCells = Uint32Array.from(openOcean);
  const gridBefore = new Uint8Array(openOcean.length);
  const gridAfter = new Uint8Array(openOcean.length);
  const afterByGrid = new Uint8Array(grid.cells.h.length);
  afterByGrid.fill(UNASSIGNED);
  let changedCells = 0;

  for (let index = 0; index < openOcean.length; index++) {
    const cell = openOcean[index];
    const before = clampHeight(grid.cells.h[cell]);
    const after = generated.heights[cell];
    gridBefore[index] = before;
    gridAfter[index] = after;
    afterByGrid[cell] = after;
    if (before !== after) changedCells++;
  }

  const packSnapshot = buildPackSnapshot(map, afterByGrid);
  const byteLength = gridCells.byteLength + gridBefore.byteLength + gridAfter.byteLength
    + packSnapshot.cells.byteLength + packSnapshot.before.byteLength + packSnapshot.after.byteLength;
  const plan = {
    version: 1,
    seed: normalizedSeed,
    topologyChecksum: topologyChecksum(map),
    resultChecksum: heightChecksum(gridCells, gridAfter),
    grid: {cells: gridCells, before: gridBefore, after: gridAfter},
    pack: packSnapshot,
    stats: {
      oceanCells: openOcean.length,
      packCells: packSnapshot.cells.length,
      changedCells,
      plateCount: plates.seeds.length,
      shelfCells: generated.stats.shelfCells,
      slopeCells: generated.stats.slopeCells,
      basinCells: generated.stats.basinCells,
      ridgeCells: generated.stats.ridgeCells,
      trenchCells: generated.stats.trenchCells,
      minHeight: generated.stats.minHeight,
      maxHeight: generated.stats.maxHeight,
      byteLength
    }
  };
  return plan;
}

export function createResetSeafloorCommand(plan) {
  validatePlan(plan);
  let staleBefore = null;
  let staleAfter = null;
  return {
    label: `重设海底 ${plan.stats.oceanCells} cells`,
    domain: "height",
    effects: {
      ...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY,
      derived: [
        ...EDIT_REFRESH_PRESETS.HEIGHT_SURFACE_ONLY.derived,
        ...SEAFLOOR_STALE_SYSTEMS.map(system => `defer:${system}`)
      ],
      affected: systemAffected("seafloor-reset", [{kind: "grid-cells", id: plan.stats.oceanCells}])
    },
    apply(context) {
      if (!staleBefore) staleBefore = captureStaleState(context.map);
      applyPlanHeights(context.map, plan, "after");
      if (staleAfter) restoreStaleState(context.map, staleAfter);
      else {
        markSeafloorDerivedStale(context.map);
        staleAfter = captureStaleState(context.map);
      }
    },
    revert(context) {
      applyPlanHeights(context.map, plan, "before");
      restoreStaleState(context.map, staleBefore);
    },
    isNoop() {
      return plan.stats.changedCells === 0;
    },
    getResult() {
      return summarizePlan(plan);
    },
    getPlan() {
      return plan;
    }
  };
}

export function seafloorResetPreviewChanges(plan) {
  validatePlan(plan);
  const changes = [];
  for (let index = 0; index < plan.grid.cells.length; index++) {
    const before = plan.grid.before[index];
    const after = plan.grid.after[index];
    if (before === after) continue;
    changes.push({gridCell: plan.grid.cells[index], before, after});
  }
  return changes;
}

function collectOpenOceanCells(map) {
  const features = map.features?.features || map.grid?.features || [];
  const featureIds = map.grid.cells.f;
  const result = [];
  for (let cell = 0; cell < map.grid.cells.h.length; cell++) {
    if (map.grid.cells.h[cell] >= WATER_LEVEL) continue;
    if (features[featureIds[cell]]?.type !== "ocean") continue;
    result.push(cell);
  }
  return result;
}

function buildCoastDistance(neighbors, oceanMask, heights) {
  const distance = new Uint16Array(oceanMask.length);
  const queue = new Uint32Array(oceanMask.length);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < oceanMask.length; cell++) {
    if (!oceanMask[cell]) continue;
    const touchesLand = (neighbors[cell] || []).some(neighbor => heights[neighbor] >= WATER_LEVEL);
    if (!touchesLand) continue;
    distance[cell] = 1;
    queue[tail++] = cell;
  }
  if (!tail) {
    for (let cell = 0; cell < oceanMask.length; cell++) {
      if (!oceanMask[cell]) continue;
      distance[cell] = 7;
    }
    return distance;
  }
  while (head < tail) {
    const cell = queue[head++];
    for (const neighbor of neighbors[cell] || []) {
      if (!oceanMask[neighbor] || distance[neighbor]) continue;
      distance[neighbor] = Math.min(65535, distance[cell] + 1);
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function buildTectonicPlates(grid, openOcean, coastDistance, seed) {
  const candidates = openOcean.filter(cell => coastDistance[cell] >= 5);
  const source = candidates.length ? candidates : openOcean;
  const plateCount = clamp(Math.round(Math.sqrt(openOcean.length) / 55), 2, 18);
  const seeds = [];
  let first = source[0];
  let firstScore = -1;
  for (const cell of source) {
    const score = hash32(seed, cell, 17);
    if (score <= firstScore) continue;
    first = cell;
    firstScore = score;
  }
  seeds.push(first);
  while (seeds.length < Math.min(plateCount, source.length)) {
    let bestCell = source[0];
    let bestScore = -1;
    for (const cell of source) {
      const point = pointForCell(grid, cell);
      let nearest = Infinity;
      for (const seedCell of seeds) nearest = Math.min(nearest, squaredDistance(point, pointForCell(grid, seedCell)));
      const jitter = 0.85 + (hash32(seed, cell, seeds.length) / 0xffffffff) * 0.3;
      const score = nearest * jitter;
      if (score <= bestScore) continue;
      bestCell = cell;
      bestScore = score;
    }
    if (seeds.includes(bestCell)) break;
    seeds.push(bestCell);
  }

  const assignment = new Uint8Array(grid.cells.h.length);
  assignment.fill(UNASSIGNED);
  const drift = seeds.map((_, index) => {
    const angle = (hash32(seed, index, 41) / 0xffffffff) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)];
  });
  for (const cell of openOcean) {
    const point = pointForCell(grid, cell);
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let index = 0; index < seeds.length; index++) {
      const distance = squaredDistance(point, pointForCell(grid, seeds[index]));
      if (distance >= nearestDistance) continue;
      nearestIndex = index;
      nearestDistance = distance;
    }
    assignment[cell] = nearestIndex;
  }
  return {seeds, assignment, drift};
}

function generateSeafloorHeights(grid, openOcean, oceanMask, coastDistance, plates, seed) {
  const heights = new Uint8Array(grid.cells.h.length);
  const category = new Uint8Array(grid.cells.h.length);
  const bounds = pointBounds(grid, openOcean);
  const scale = Math.max(1, Math.max(bounds.width, bounds.height) / 7);
  const stats = {shelfCells: 0, slopeCells: 0, basinCells: 0, ridgeCells: 0, trenchCells: 0, minHeight: 19, maxHeight: 0};

  for (const cell of openOcean) {
    const distance = coastDistance[cell];
    if (distance <= 2) {
      category[cell] = 1;
      heights[cell] = distance === 1 ? 19 : 17;
      stats.shelfCells++;
      continue;
    }
    if (distance <= 6) {
      category[cell] = 2;
      heights[cell] = 17 - (distance - 2) * 2;
      stats.slopeCells++;
      continue;
    }
    category[cell] = 3;
    const [x, y] = pointForCell(grid, cell);
    const noise = valueNoise(x / scale, y / scale, seed);
    heights[cell] = clamp(Math.round(5 + noise * 2.4), 3, 8);
    stats.basinCells++;
  }

  for (const cell of openOcean) {
    if (coastDistance[cell] <= 6) continue;
    const plate = plates.assignment[cell];
    const point = pointForCell(grid, cell);
    let strongest = null;
    for (const neighbor of grid.cells.c[cell] || []) {
      if (!oceanMask[neighbor] || plates.assignment[neighbor] === plate) continue;
      const otherPlate = plates.assignment[neighbor];
      const otherPoint = pointForCell(grid, neighbor);
      const length = Math.hypot(otherPoint[0] - point[0], otherPoint[1] - point[1]) || 1;
      const nx = (otherPoint[0] - point[0]) / length;
      const ny = (otherPoint[1] - point[1]) / length;
      const relative = (plates.drift[otherPlate][0] - plates.drift[plate][0]) * nx
        + (plates.drift[otherPlate][1] - plates.drift[plate][1]) * ny;
      if (!strongest || Math.abs(relative) > Math.abs(strongest.relative)) strongest = {otherPlate, relative};
    }
    if (!strongest) continue;
    const pairNoise = hash32(seed, Math.min(plate, strongest.otherPlate), Math.max(plate, strongest.otherPlate)) / 0xffffffff;
    const segmentNoise = hash32(seed, cell, Math.min(plate, strongest.otherPlate) * 31 + Math.max(plate, strongest.otherPlate)) / 0xffffffff;
    const trenchThreshold = strongest.relative < -0.5 ? 0.72 : strongest.relative > 0.5 ? 0.22 : 0.45;
    const isTrench = segmentNoise < trenchThreshold;
    if (isTrench) {
      category[cell] = 5;
      heights[cell] = clamp(Math.round(1 + pairNoise * 2), 0, 3);
      stats.basinCells--;
      stats.trenchCells++;
    } else {
      category[cell] = 4;
      heights[cell] = clamp(Math.round(11 + pairNoise * 4), 11, 15);
      stats.basinCells--;
      stats.ridgeCells++;
    }
  }

  smoothBasinHeights(grid.cells.c, openOcean, category, heights, 2);
  for (const cell of openOcean) {
    heights[cell] = clamp(heights[cell], 0, 19);
    stats.minHeight = Math.min(stats.minHeight, heights[cell]);
    stats.maxHeight = Math.max(stats.maxHeight, heights[cell]);
  }
  return {heights, category, stats};
}

function smoothBasinHeights(neighbors, openOcean, category, heights, passes) {
  let current = heights;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8Array(current);
    for (const cell of openOcean) {
      if (category[cell] !== 3) continue;
      let sum = current[cell] * 3;
      let weight = 3;
      for (const neighbor of neighbors[cell] || []) {
        if (category[neighbor] !== 3) continue;
        sum += current[neighbor];
        weight++;
      }
      next[cell] = clamp(Math.round(sum / weight), 3, 8);
    }
    current = next;
  }
  heights.set(current);
}

function buildPackSnapshot(map, afterByGrid) {
  const cells = [];
  const before = [];
  const after = [];
  const packCells = map.pack?.cells;
  if (!packCells?.g || !packCells?.h) return {cells: new Uint32Array(), before: new Uint8Array(), after: new Uint8Array()};
  for (let packCell = 0; packCell < packCells.g.length; packCell++) {
    const gridCell = Number(packCells.g[packCell]);
    if (!Number.isInteger(gridCell) || afterByGrid[gridCell] === UNASSIGNED) continue;
    cells.push(packCell);
    before.push(clampHeight(packCells.h[packCell]));
    after.push(afterByGrid[gridCell]);
  }
  return {cells: Uint32Array.from(cells), before: Uint8Array.from(before), after: Uint8Array.from(after)};
}

function applyPlanHeights(map, plan, key) {
  if (topologyChecksum(map) !== plan.topologyChecksum) throw new Error("地图海陆拓扑已变化，请重新预览重设海底");
  const gridValues = plan.grid[key];
  for (let index = 0; index < plan.grid.cells.length; index++) map.grid.cells.h[plan.grid.cells[index]] = gridValues[index];
  const packValues = plan.pack[key];
  for (let index = 0; index < plan.pack.cells.length; index++) map.pack.cells.h[plan.pack.cells[index]] = packValues[index];
}

function markSeafloorDerivedStale(map) {
  map.metadata ||= {};
  const systems = new Set([...(map.metadata.derivedStale?.systems || []), ...SEAFLOOR_STALE_SYSTEMS]);
  map.metadata.derivedStale = {...(map.metadata.derivedStale || {}), systems: [...systems]};
  for (const system of ["markers", "economy", "diplomacy", "military", "zones"]) {
    if (map[system]?.metadata) map[system].metadata.stale = true;
  }
}

function captureStaleState(map) {
  return {
    derivedStale: map.metadata?.derivedStale ? structuredClone(map.metadata.derivedStale) : null,
    flags: Object.fromEntries(["markers", "economy", "diplomacy", "military", "zones"].map(system => [system, map[system]?.metadata?.stale]))
  };
}

function restoreStaleState(map, snapshot) {
  if (!snapshot) return;
  map.metadata ||= {};
  if (snapshot.derivedStale) map.metadata.derivedStale = structuredClone(snapshot.derivedStale);
  else delete map.metadata.derivedStale;
  for (const [system, stale] of Object.entries(snapshot.flags)) {
    if (!map[system]?.metadata) continue;
    if (stale === undefined) delete map[system].metadata.stale;
    else map[system].metadata.stale = stale;
  }
}

function summarizePlan(plan) {
  return {
    valid: plan.stats.oceanCells > 0 && plan.stats.changedCells > 0,
    seed: plan.seed,
    topologyChecksum: plan.topologyChecksum,
    resultChecksum: plan.resultChecksum,
    ...plan.stats,
    notice: plan.stats.oceanCells
      ? plan.stats.changedCells
        ? `可重设 ${plan.stats.oceanCells} 处开放海洋，形成大陆架、陆坡、洋中脊与海沟。`
        : "当前海底无需调整。"
      : "当前地图没有可重设的开放海洋。"
  };
}

function emptyPlan(seed, topology) {
  return {
    version: 1,
    seed,
    topologyChecksum: topology,
    resultChecksum: "00000000",
    grid: {cells: new Uint32Array(), before: new Uint8Array(), after: new Uint8Array()},
    pack: {cells: new Uint32Array(), before: new Uint8Array(), after: new Uint8Array()},
    stats: {oceanCells: 0, packCells: 0, changedCells: 0, plateCount: 0, shelfCells: 0, slopeCells: 0, basinCells: 0, ridgeCells: 0, trenchCells: 0, minHeight: 0, maxHeight: 0, byteLength: 0}
  };
}

function topologyChecksum(map) {
  let hash = 2166136261;
  const heights = map.grid.cells.h;
  const featureIds = map.grid.cells.f;
  const features = map.features?.features || map.grid?.features || [];
  for (let cell = 0; cell < heights.length; cell++) {
    hash ^= heights[cell] >= WATER_LEVEL ? 1 : 0;
    hash = Math.imul(hash, 16777619);
    hash ^= Number(featureIds[cell]) || 0;
    hash = Math.imul(hash, 16777619);
  }
  for (let id = 0; id < features.length; id++) {
    const feature = features[id];
    if (!feature) continue;
    hash ^= hashText(`${id}|${feature.type}|${feature.group || ""}|${feature.land ? 1 : 0}`);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function heightChecksum(cells, heights) {
  let hash = 2166136261;
  for (let index = 0; index < cells.length; index++) {
    hash ^= cells[index];
    hash = Math.imul(hash, 16777619);
    hash ^= heights[index];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function pointForCell(grid, cell) {
  return grid.points[grid.cells.p?.[cell] ?? cell] || grid.points[cell] || [cell, 0];
}

function pointBounds(grid, cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const [x, y] = pointForCell(grid, cell);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {width: maxX - minX, height: maxY - minY};
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothStep(x - x0);
  const ty = smoothStep(y - y0);
  const a = unitHash(seed, x0, y0);
  const b = unitHash(seed, x0 + 1, y0);
  const c = unitHash(seed, x0, y0 + 1);
  const d = unitHash(seed, x0 + 1, y0 + 1);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty) * 2 - 1;
}

function unitHash(seed, a, b) {
  return hash32(seed, a, b) / 0xffffffff;
}

function hash32(seed, a, b) {
  let hash = (Number(seed) ^ Math.imul(Number(a) | 0, 0x9e3779b1) ^ Math.imul(Number(b) | 0, 0x85ebca77)) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeSeed(value) {
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric) && numeric >= 0) return numeric || 1;
  return hashText(value) || 1;
}

function validatePlan(plan) {
  if (!plan?.grid?.cells || !plan?.grid?.before || !plan?.grid?.after || !plan?.pack?.cells) throw new Error("重设海底方案无效");
  if (plan.grid.cells.length !== plan.grid.before.length || plan.grid.cells.length !== plan.grid.after.length) throw new Error("重设海底 grid 历史长度不一致");
  if (plan.pack.cells.length !== plan.pack.before.length || plan.pack.cells.length !== plan.pack.after.length) throw new Error("重设海底 pack 历史长度不一致");
}

function assertSeafloorInput(map) {
  if (!map?.grid?.points?.length || !map.grid.cells?.h || !map.grid.cells?.f || !map.grid.cells?.c) throw new Error("地图缺少重设海底所需的网格与 Feature 数据");
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, value) {
  return a + (b - a) * value;
}

function clampHeight(value) {
  return clamp(Math.round(Number(value) || 0), 0, 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
