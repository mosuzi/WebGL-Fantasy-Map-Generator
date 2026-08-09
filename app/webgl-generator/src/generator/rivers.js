import {defineFeatureGroups} from "./pack.js";
import {createChineseNameGenerator} from "./names.js";
import {createStageProfile} from "./profile.js";
import {MinPriorityQueue} from "./priority-queue.js";
import {createRandom} from "./random.js";
import {applyRiverNetworkCandidate} from "./river-network-candidate.js";
import {normalizeRiverNetwork} from "./river-network.js";
import {
  assertFrozenRiverState,
  frozenLakeGuard,
  initializeGuardedLakeReferences,
  isFrozenRiverCell,
  nextAvailableRiverId,
  prepareRiverRegenerationLocks,
  seedFrozenRiverCells,
  seedFrozenRiverState
} from "./river-regeneration-locks.js";
import {
  activateOverflowRoute,
  applyLakeOverflowDiagnostics,
  applyOverflowRouteOrdering,
  buildLakeEscapeField,
  createLakeOverflowPlan,
  evaluateLakeOverflow,
  lakeIncisionBudget
} from "./lake-overflow.js";

const WATER_LEVEL = 20;
const MIN_FLUX_TO_FORM_RIVER = 30;
const MIN_RIVER_CELLS = 3;
const MAX_DEPRESSION_ITERATIONS = 250;
const LAKE_ELEVATION_LIMIT = 20;
const HEIGHT_EXPONENT = 2;

export function buildRivers(grid, features, pack, options = {}) {
  if (!pack?.cells?.t) return buildEmptyRivers();

  const profile = createStageProfile();
  const nameGenerator = profile.stage("name-generator", "初始化河流命名器", () => createChineseNameGenerator(getHydronymSeed(options), {namebases: options.namebases}));
  const cells = pack.cells;
  const lockContext = prepareRiverRegenerationLocks(pack, options.lockedRivers);
  const riverPaths = new Map();
  const riverParents = new Map();
  let incisedTransitions = 0;
  const variation = profile.stage("variation", "生成河流扰动", () => createRiverVariation(cells, options));
  let effectiveHeights = profile.stage("alter-heights", "构建河流有效高度", () => alterHeights(cells, variation));
  profile.stage("detect-closed-lakes", "识别闭合湖泊", () => detectCloseLakes(pack, effectiveHeights));
  const depressionMode = normalizeDepressionMode(options.riverDepressionMode);
  effectiveHeights = profile.stage("resolve-depressions", "消解洼地", () => resolveDepressions(pack, effectiveHeights, variation, {mode: depressionMode}));

  profile.stage("init-buffers", "初始化河流 buffer", () => {
    cells.fl = new Uint16Array(cells.i.length);
    cells.r = new Uint16Array(cells.i.length);
    cells.conf = new Uint8Array(cells.i.length);
    seedFrozenRiverState(lockContext, cells, riverPaths, riverParents);
  });
  const hydrology = profile.stage("init-hydrology", "初始化河流水文诊断", () => createHydrologyBuffers(cells));
  const lakeDrainage = profile.stage("lake-climate", "计算湖泊水文与溢流路径", () => defineLakeClimateData(grid, pack, effectiveHeights, options, variation));
  initializeGuardedLakeReferences(pack, lockContext);

  const cellsNumberModifier = Math.max(1, (Number(options.cellsTarget || grid.metadata.cellsDesired || grid.points.length) / 10000) ** 0.25);
  const land = profile.stage("sort-land", "按高度排序陆地 cell", () => Array.from(cells.i)
    .filter(cell => cells.h[cell] >= WATER_LEVEL)
    .sort((a, b) => lakeDrainage.processingHeights[b] - lakeDrainage.processingHeights[a]));

  profile.stage("flow-accumulation", "累计降水并追踪河道", () => {
    const reservedRiverIds = new Set(lockContext.frozenIds);
    const blockedRiverIds = new Set();
    let nextRiverId = 1;
    for (const cell of land) {
      if (isFrozenRiverCell(lockContext, cell)) continue;
      const precipitation = getCellPrecipitation(grid, cells, cell, variation);
      addCellHydrology(hydrology, cells, cell, precipitation);
      addFlux(cells.fl, cell, precipitation / cellsNumberModifier);

      const outletLakes = (lakeDrainage.plansByOutCell.get(cell) || [])
        .filter(entry => entry.evaluation.overflows);

      for (const {lake, plan} of outletLakes) {
        const lakeCell = (cells.c[cell] || []).find(neighbor => effectiveHeights[neighbor] < WATER_LEVEL && cells.f[neighbor] === lake.i);
        if (lakeCell === undefined) continue;
        activateOverflowRoute(lakeDrainage.activeDownstream, plan);
        if (isFrozenRiverCell(lockContext, lakeCell)) {
          flowDown(pack, riverPaths, riverParents, cell, cells.fl[lakeCell], cells.r[lakeCell], hydrology, lakeCell, lockContext, blockedRiverIds);
          continue;
        }

        addFlux(cells.fl, lakeCell, Math.max(lake.flux - lake.evaporation, 0));
        addLakeHydrology(hydrology, grid, cells, lakeCell, lake, variation);

        if (cells.r[lakeCell] !== lake.river) {
          const sameRiver = (cells.c[lakeCell] || []).some(neighbor => cells.r[neighbor] === lake.river);

          if (sameRiver) {
            cells.r[lakeCell] = lake.river;
            addCellToRiver(riverPaths, lake.river, lakeCell);
          } else {
            const allocatedId = nextAvailableRiverId(reservedRiverIds, nextRiverId);
            cells.r[lakeCell] = allocatedId;
            nextRiverId = allocatedId + 1;
          }
        }

        const lakeGuard = frozenLakeGuard(lockContext, lake);
        if (!lakeGuard?.outlet) lake.outlet = cells.r[lakeCell];
        flowDown(pack, riverPaths, riverParents, cell, cells.fl[lakeCell], lake.outlet, hydrology, lakeCell, lockContext, blockedRiverIds);
      }

      if (cells.b[cell] && cells.r[cell]) {
        addCellToRiver(riverPaths, cells.r[cell], -1);
        continue;
      }

      const downhill = getDownhillCell(pack, effectiveHeights, cell, lakeDrainage.activeDownstream, outletLakes);
      if (downhill === null || (!lakeDrainage.activeDownstream.has(cell) && effectiveHeights[cell] <= effectiveHeights[downhill])) continue;

      if (cells.fl[cell] < MIN_FLUX_TO_FORM_RIVER) {
        if (cells.h[downhill] >= WATER_LEVEL) {
          transferHydrology(hydrology, cell, downhill);
          addFlux(cells.fl, downhill, cells.fl[cell]);
        }
        continue;
      }

      const rawRise = Math.max(0, Number(cells.h[downhill]) - Number(cells.h[cell]));
      if (rawRise > 0 && !lakeDrainage.activeDownstream.has(cell) && rawRise > lakeIncisionBudget(cells.fl[cell])) continue;
      if (rawRise > 0) incisedTransitions++;

      if (!cells.r[cell]) {
        const allocatedId = nextAvailableRiverId(reservedRiverIds, nextRiverId);
        cells.r[cell] = allocatedId;
        addCellToRiver(riverPaths, allocatedId, cell);
        nextRiverId = allocatedId + 1;
      }

      flowDown(pack, riverPaths, riverParents, downhill, cells.fl[cell], cells.r[cell], hydrology, cell, lockContext, blockedRiverIds);
    }
    discardBlockedRiverCandidates(cells, riverPaths, riverParents, blockedRiverIds);
  });

  const definedRivers = profile.stage("define-rivers", "构建河流对象", () =>
    defineRivers({grid, pack, riverPaths, riverParents, options, nameGenerator, hydrology, lockContext}));
  const normalizedNetwork = profile.stage("normalize-river-network", "校验河流干流关系", () =>
    normalizeRiverNetwork(definedRivers, pack, {dropIncomplete: true, frozenIds: lockContext.frozenIds}));
  const candidateNetwork = profile.stage("apply-river-network-candidate", "应用河网汇流曲线与水文单调", () =>
    options.riverNetworkCandidate === false
      ? disabledRiverNetworkCandidate(normalizedNetwork.rivers)
      : applyRiverNetworkCandidate(normalizedNetwork.rivers, pack, grid, {
        frozenIds: lockContext.frozenIds,
        metadata: {seed: options.seed || "", cellsTarget: options.cellsTarget || grid.metadata.cellsDesired || grid.points.length}
      }));
  const rivers = candidateNetwork.rivers;
  profile.stage("mark-confluences", "标记河流 cell 与汇流", () => {
    cells.r = new Uint16Array(cells.i.length);
    cells.conf = new Uint16Array(cells.i.length);
    seedFrozenRiverCells(lockContext, cells);
    markRiverCells(cells, rivers, lockContext);
    calculateConfluenceFlux(cells, effectiveHeights, lockContext);
  });
  pack.rivers = rivers;
  profile.stage("cleanup-lakes", "清理湖泊水文状态", () => cleanupLakeData(pack, lockContext));
  profile.stage("lake-names", "命名湖泊", () => defineLakeNames(pack, nameGenerator));
  profile.stage("feature-groups", "更新 feature 分组", () => defineFeatureGroups(pack, grid));
  const timing = profile.finish();
  assertFrozenRiverState(pack, rivers, lockContext);

  return {
    rivers,
    timing,
    metadata: {
      rivers: rivers.length,
      segments: rivers.reduce((sum, river) => sum + Math.max(0, river.points.length - 1), 0),
      sources: rivers.length,
      longest: rivers.reduce((max, river) => Math.max(max, river.cells.length), 0),
      maxFlux: maxValue(cells.fl),
      confluences: countPositive(cells.conf),
      cellsWithRiver: countPositive(cells.r),
      flowModel: variation ? "source-pack-flux-regenerated-variation" : "source-pack-flux-first-pass",
      depressionMode,
      variationSalt: variation?.salt || null,
      networkDiagnostics: normalizedNetwork.diagnostics,
      networkCandidate: candidateNetwork.metadata,
      incisedTransitions,
      lakeOverflow: summarizeLakeOverflow(pack.features),
      buildMs: timing.totalMs
    }
  };
}

function summarizeLakeOverflow(features) {
  const summary = {
    lakes: 0,
    naturalOutlets: 0,
    overflowChannels: 0,
    balancedTerminals: 0,
    incisionLimited: 0,
    noEscape: 0
  };
  for (const feature of features || []) {
    if (!feature || feature.type !== "lake") continue;
    summary.lakes++;
    if (feature.overflow?.status === "natural-outlet") summary.naturalOutlets++;
    else if (feature.overflow?.status === "overflow-channel") summary.overflowChannels++;
    else if (feature.overflow?.status === "balanced-terminal") summary.balancedTerminals++;
    else if (feature.overflow?.status === "incision-limited") summary.incisionLimited++;
    else if (feature.overflow?.status === "no-escape") summary.noEscape++;
  }
  return summary;
}

export function renameHydronymsByCulture(rivers, pack, options = {}) {
  const nameGenerator = createChineseNameGenerator(getHydronymSeed(options), {namebases: options.namebases});
  const frozenIds = new Set(options.frozenRiverIds || options.lockedRiverIds || []);
  for (const river of rivers.rivers || []) {
    if (!river?.i) continue;
    if (frozenIds.has(Number(river.i))) continue;
    const cultureId = pack.cells.culture?.[river.source] || 0;
    const culture = pack.cultures?.[cultureId];
    river.name = nameGenerator.makeRiverName({
      id: river.i,
      cell: river.source,
      culture: cultureId,
      cultureType: culture?.nameStyle || culture?.type,
      flux: river.discharge || river.flux,
      type: river.parent ? "branch" : "river"
    });
  }
  defineLakeNames(pack, nameGenerator);
}

export function backfillRiverHydrology(grid, features, pack, rivers, options = {}) {
  const targetRivers = rivers?.rivers || [];
  if (!targetRivers.length || targetRivers.every(river => validRiverHydrology(river?.hydrology))) {
    return {changed: 0, total: targetRivers.length, regenerated: 0};
  }
  if (!grid?.cells?.prec || !pack?.cells?.i?.length) {
    return {changed: 0, total: targetRivers.length, regenerated: 0, reason: "missing-grid-or-pack"};
  }

  const diagnosticPack = clonePackForHydrology(pack);
  const rebuilt = buildRivers(grid, diagnosticPack.features || features, diagnosticPack, options);
  const byId = new Map((rebuilt.rivers || []).map(river => [river.i ?? river.id, river]));
  const byEndpoints = new Map((rebuilt.rivers || []).map(river => [riverEndpointKey(river), river]));
  let changed = 0;

  for (const river of targetRivers) {
    if (!river || validRiverHydrology(river.hydrology)) continue;
    const candidate = byId.get(river.i ?? river.id) || byEndpoints.get(riverEndpointKey(river));
    const hydrology = validRiverHydrology(candidate?.hydrology)
      ? {...candidate.hydrology}
      : approximateRiverPathHydrology(grid, pack, river);
    if (!validRiverHydrology(hydrology)) continue;
    river.hydrology = hydrology;
    changed++;
  }

  if (changed && rivers.metadata) {
    rivers.metadata.hydrologyBackfilled = changed;
    rivers.metadata.hydrologyBackfillSource = "diagnostic-regeneration";
  }
  return {changed, total: targetRivers.length, regenerated: rebuilt.rivers?.length || 0};
}


function buildEmptyRivers() {
  return {
    rivers: [],
    metadata: {
      rivers: 0,
      segments: 0,
      sources: 0,
      longest: 0,
      maxFlux: 0,
      confluences: 0,
      cellsWithRiver: 0,
      flowModel: "empty",
      networkCandidate: {
        algorithm: "river-network-candidate-v1",
        status: "accepted",
        accepted: true,
        rivers: 0,
        relations: 0,
        acceptedRelations: 0,
        rejectedRelations: 0,
        protectedRelations: 0,
        appliedRivers: 0,
        appliedCurves: 0,
        hydrologyUpdates: 0,
        frozenSkipped: 0,
        dischargeViolations: 0,
        widthViolations: 0,
        hiddenFragmentSuggestions: 0,
        rejectionExamples: [],
        performance: null
      }
    }
  };
}

function disabledRiverNetworkCandidate(rivers) {
  return {
    rivers,
    metadata: {
      algorithm: "river-network-candidate-v1",
      status: "disabled-diagnostic-baseline",
      accepted: false,
      rivers: rivers.length,
      relations: rivers.filter(river => river.parent).length,
      acceptedRelations: 0,
      rejectedRelations: 0,
      protectedRelations: 0,
      appliedRivers: 0,
      appliedCurves: 0,
      hydrologyUpdates: 0,
      frozenSkipped: 0,
      dischargeViolations: 0,
      widthViolations: 0,
      hiddenFragmentSuggestions: 0,
      rejectionExamples: [],
      performance: null
    }
  };
}

function clonePackForHydrology(pack) {
  return {
    ...pack,
    cells: {...(pack.cells || {})},
    features: (pack.features || []).map(feature => feature && typeof feature === "object" ? {...feature} : feature),
    rivers: []
  };
}

function validRiverHydrology(hydrology) {
  return Number.isFinite(hydrology?.catchmentArea) &&
    hydrology.catchmentArea > 0 &&
    Number.isFinite(hydrology.catchmentCells) &&
    hydrology.catchmentCells > 0 &&
    Number.isFinite(hydrology.averagePrecipitation);
}

function riverEndpointKey(river = {}) {
  return `${river.source ?? ""}:${river.mouth ?? ""}`;
}

function approximateRiverPathHydrology(grid, pack, river = {}) {
  const cells = pack?.cells;
  const riverCells = (river.cells || []).filter(cell => cell >= 0 && cells?.h?.[cell] >= WATER_LEVEL);
  if (!cells || !riverCells.length) return null;
  let area = 0;
  let precipitationArea = 0;
  for (const cell of riverCells) {
    const cellAreaValue = cellArea(cells, cell);
    const precipitation = getCellPrecipitation(grid, cells, cell);
    area += cellAreaValue;
    precipitationArea += precipitation * cellAreaValue;
  }
  if (area <= 0) return null;
  return {
    catchmentArea: round(area, 2),
    catchmentCells: riverCells.length,
    averagePrecipitation: round(precipitationArea / area, 2),
    method: "river-path-fallback"
  };
}

function createRiverVariation(cells, options = {}) {
  const salt = options.riverRegenerationSalt;
  if (salt === undefined || salt === null || salt === "") return null;
  const random = createRandom(`${options.seed}:river-regeneration:${salt}`);
  const height = new Float32Array(cells.i.length);
  const precipitation = new Float32Array(cells.i.length);

  for (const cell of cells.i) {
    height[cell] = random.range(-0.08, 0.08);
    precipitation[cell] = random.range(0.72, 1.28);
  }

  return {salt: String(salt), height, precipitation};
}

function getHydronymSeed(options = {}) {
  return options.riverRegenerationSalt === undefined || options.riverRegenerationSalt === null || options.riverRegenerationSalt === ""
    ? options.seed
    : `${options.seed}:rivers:${options.riverRegenerationSalt}`;
}

function getCellPrecipitation(grid, cells, cell, variation = null) {
  const precipitation = grid.cells.prec?.[cells.g[cell]] || 0;
  return variation ? precipitation * (variation.precipitation?.[cell] || 1) : precipitation;
}

function createHydrologyBuffers(cells) {
  return {
    area: new Float64Array(cells.i.length),
    cells: new Uint32Array(cells.i.length),
    precipitationArea: new Float64Array(cells.i.length)
  };
}

function addCellHydrology(hydrology, cells, cell, precipitation) {
  if (!hydrology || cell === undefined || cell < 0) return;
  const area = cellArea(cells, cell);
  hydrology.area[cell] += area;
  hydrology.cells[cell] += 1;
  hydrology.precipitationArea[cell] += precipitation * area;
}

function addLakeHydrology(hydrology, grid, cells, lakeCell, lake, variation = null) {
  if (!hydrology || lakeCell === undefined || lakeCell < 0 || !Array.isArray(lake?.shoreline)) return;
  for (const cell of lake.shoreline) {
    const precipitation = getCellPrecipitation(grid, cells, cell, variation);
    const area = cellArea(cells, cell);
    hydrology.area[lakeCell] += area;
    hydrology.cells[lakeCell] += 1;
    hydrology.precipitationArea[lakeCell] += precipitation * area;
  }
}

function transferHydrology(hydrology, fromCell, toCell) {
  if (!hydrology || fromCell === undefined || toCell === undefined || fromCell < 0 || toCell < 0) return;
  hydrology.area[toCell] += hydrology.area[fromCell];
  hydrology.cells[toCell] += hydrology.cells[fromCell];
  hydrology.precipitationArea[toCell] += hydrology.precipitationArea[fromCell];
}

function riverHydrology(hydrology, mouth) {
  if (!hydrology || mouth === undefined || mouth < 0) return null;
  const area = hydrology.area[mouth] || 0;
  const catchmentCells = hydrology.cells[mouth] || 0;
  const averagePrecipitation = area > 0 ? hydrology.precipitationArea[mouth] / area : 0;
  return {
    catchmentArea: round(area, 2),
    catchmentCells,
    averagePrecipitation: round(averagePrecipitation, 2)
  };
}

function cellArea(cells, cell) {
  const area = cells.area?.[cell];
  if (Number.isFinite(area) && area > 0) return area;
  return 1;
}

function alterHeights(cells, variation = null) {
  return Array.from(cells.h).map((height, cell) => {
    if (height < WATER_LEVEL || cells.t[cell] < 1) return height;
    const neighbors = cells.c[cell] || [];
    const meanType = neighbors.length ? neighbors.reduce((sum, neighbor) => sum + (cells.t[neighbor] || 0), 0) / neighbors.length : 0;
    return height + cells.t[cell] / 100 + meanType / 10000 + (variation?.height?.[cell] || 0);
  });
}

function detectCloseLakes(pack, heights) {
  const {cells, features} = pack;

  for (const feature of features || []) {
    if (!feature || feature.type !== "lake") continue;
    delete feature.closed;
    if (!feature.shoreline?.length) {
      feature.closed = false;
      continue;
    }

    const maxElevation = feature.height + LAKE_ELEVATION_LIMIT;
    if (maxElevation > 99) {
      feature.closed = false;
      continue;
    }

    let isDeep = true;
    const lowestShorelineCell = minHeightCell(feature.shoreline, heights);
    const queue = [lowestShorelineCell];
    const checked = [];
    checked[lowestShorelineCell] = true;

    while (queue.length && isDeep) {
      const cell = queue.pop();

      for (const neighbor of cells.c[cell] || []) {
        if (checked[neighbor]) continue;
        if (heights[neighbor] >= maxElevation) continue;

        if (heights[neighbor] < WATER_LEVEL) {
          const neighborFeature = features[cells.f[neighbor]];
          if (neighborFeature?.type === "ocean" || feature.height > (neighborFeature?.height ?? WATER_LEVEL)) isDeep = false;
        }

        checked[neighbor] = true;
        queue.push(neighbor);
      }
    }

    feature.closed = isDeep;
  }
}

function normalizeDepressionMode(mode) {
  return mode === "source-like" ? "source-like" : "optimized";
}

function resolveDepressions(pack, heights, variation = null, options = {}) {
  if (options.mode === "source-like") return resolveDepressionsSourceLike(pack, heights, variation);

  const {cells, features} = pack;
  const checkLakeMaxIteration = MAX_DEPRESSION_ITERATIONS * 0.85;
  const elevateLakeMaxIteration = MAX_DEPRESSION_ITERATIONS * 0.75;
  const land = Array.from(cells.i)
    .filter(cell => cells.h[cell] >= WATER_LEVEL && !cells.b[cell])
    .sort((a, b) => heights[a] - heights[b]);
  const landMask = buildCellMask(cells.i.length, land);

  const progress = [];
  let depressions = Infinity;
  let previousDepressions = null;
  let activeLand = land;

  for (let iteration = 0; depressions && iteration < MAX_DEPRESSION_ITERATIONS; iteration++) {
    if (progress.length > 5 && progress.reduce((sum, value) => sum + value, 0) > 0) {
      heights = alterHeights(cells, variation);
      depressions = progress[0];
      break;
    }

    depressions = 0;
    const lakeChangedCells = [];

    if (iteration < checkLakeMaxIteration) {
      for (const lake of features || []) {
        if (!lake || lake.type !== "lake" || lake.closed || !lake.shoreline?.length) continue;
        const minHeight = minHeightValue(lake.shoreline, heights);
        if (minHeight >= 100 || lake.height > minHeight) continue;

        if (iteration > elevateLakeMaxIteration) {
          for (const cell of lake.shoreline) heights[cell] = cells.h[cell];
          lake.height = minHeightValue(lake.shoreline, heights) - 1;
          lake.closed = true;
          lakeChangedCells.push(...lake.shoreline);
          continue;
        }

        lake.height = minHeight + 0.2;
        lakeChangedCells.push(...lake.shoreline);
        depressions++;
      }
    }

    if (activeLand.length) depressions += resolveLandDepressions(pack, heights, activeLand, landMask);
    activeLand = collectActiveLandAroundCells(pack, lakeChangedCells, landMask);

    if (!depressions) break;
    if (previousDepressions !== null) progress.push(depressions - previousDepressions);
    previousDepressions = depressions;
  }

  return heights;
}

function resolveDepressionsSourceLike(pack, heights, variation = null) {
  const {cells, features} = pack;
  const checkLakeMaxIteration = MAX_DEPRESSION_ITERATIONS * 0.85;
  const elevateLakeMaxIteration = MAX_DEPRESSION_ITERATIONS * 0.75;
  const land = Array.from(cells.i)
    .filter(cell => cells.h[cell] >= WATER_LEVEL && !cells.b[cell])
    .sort((a, b) => heights[a] - heights[b]);

  const progress = [];
  let depressions = Infinity;
  let previousDepressions = null;

  for (let iteration = 0; depressions && iteration < MAX_DEPRESSION_ITERATIONS; iteration++) {
    if (progress.length > 5 && progress.reduce((sum, value) => sum + value, 0) > 0) {
      heights = alterHeights(cells, variation);
      depressions = progress[0];
      break;
    }

    depressions = 0;

    if (iteration < checkLakeMaxIteration) {
      for (const lake of features || []) {
        if (!lake || lake.type !== "lake" || lake.closed || !lake.shoreline?.length) continue;
        const minHeight = minHeightValue(lake.shoreline, heights);
        if (minHeight >= 100 || lake.height > minHeight) continue;

        if (iteration > elevateLakeMaxIteration) {
          for (const cell of lake.shoreline) heights[cell] = cells.h[cell];
          lake.height = minHeightValue(lake.shoreline, heights) - 1;
          lake.closed = true;
          continue;
        }

        lake.height = minHeight + 0.2;
        depressions++;
      }
    }

    for (const cell of land) {
      const minHeight = minEffectiveNeighborHeight(pack, heights, cell);
      if (minHeight >= 100 || heights[cell] > minHeight) continue;

      heights[cell] = minHeight + 0.1;
      depressions++;
    }

    if (previousDepressions !== null) progress.push(depressions - previousDepressions);
    previousDepressions = depressions;
  }

  return heights;
}

function resolveLandDepressions(pack, heights, land, landMask) {
  const queue = new MinPriorityQueue();
  const queued = new Uint8Array(pack.cells.i.length);
  let depressions = 0;

  for (const cell of land) enqueueDepressionCell(queue, queued, heights, cell);

  while (queue.length) {
    const cell = queue.pop();
    queued[cell] = 0;
    if (!landMask[cell]) continue;

    const minHeight = minEffectiveNeighborHeight(pack, heights, cell);
    if (minHeight >= 100 || heights[cell] > minHeight) continue;

    heights[cell] = minHeight + 0.1;
    depressions++;

    for (const neighbor of pack.cells.c[cell] || []) {
      if (landMask[neighbor]) enqueueDepressionCell(queue, queued, heights, neighbor);
    }
  }

  return depressions;
}

function enqueueDepressionCell(queue, queued, heights, cell) {
  if (queued[cell]) return;
  queued[cell] = 1;
  queue.push(cell, heights[cell]);
}

function buildCellMask(length, cells) {
  const mask = new Uint8Array(length);
  for (const cell of cells) mask[cell] = 1;
  return mask;
}

function collectActiveLandAroundCells(pack, cells, landMask) {
  if (!cells.length) return [];
  const active = new Set();
  for (const cell of cells) {
    if (landMask[cell]) active.add(cell);
    for (const neighbor of pack.cells.c[cell] || []) {
      if (landMask[neighbor]) active.add(neighbor);
    }
  }
  return Array.from(active).sort((a, b) => pack.cells.h[a] - pack.cells.h[b]);
}

function defineLakeClimateData(grid, pack, heights, options = {}, variation = null) {
  const {cells, features} = pack;
  const exponent = options.heightExponent ?? HEIGHT_EXPONENT;
  const processingHeights = Array.from(heights);
  const plansByOutCell = new Map();
  const activeDownstream = new Map();
  const escapeField = buildLakeEscapeField(pack, heights);

  for (const feature of features || []) {
    if (!feature || feature.type !== "lake") continue;

    feature.flux = getLakeFlux(grid, cells, feature, variation);
    feature.temp = getLakeTemperature(grid, cells, feature);
    feature.evaporation = getLakeEvaporation(feature, exponent);
    if (!feature.shoreline?.length) {
      applyLakeOverflowDiagnostics(feature, null, evaluateLakeOverflow(feature, null));
      continue;
    }

    const plan = feature.closed
      ? createLakeOverflowPlan(pack, heights, feature, escapeField, {heightExponent: exponent})
      : createNaturalLakeOverflowPlan(feature, minHeightCell(feature.shoreline, heights), heights);
    if (!plan) {
      applyLakeOverflowDiagnostics(feature, null, evaluateLakeOverflow(feature, null));
      continue;
    }

    feature.outCell = plan.outCell;
    const evaluation = evaluateLakeOverflow(feature, plan);
    applyLakeOverflowDiagnostics(feature, plan, evaluation);
    const entries = plansByOutCell.get(plan.outCell) || [];
    entries.push({lake: feature, plan, evaluation});
    plansByOutCell.set(plan.outCell, entries);
    if (plan.geomorphicClosed && evaluation.overflows) applyOverflowRouteOrdering(processingHeights, plan, feature.height);
  }

  return {processingHeights, plansByOutCell, activeDownstream};
}

function createNaturalLakeOverflowPlan(lake, outCell, heights) {
  if (!Number.isInteger(outCell) || outCell < 0) return null;
  const spillElevation = Number(heights?.[outCell]);
  return {
    lakeId: Number(lake.i ?? lake.id ?? 0),
    outCell,
    route: [outCell],
    terminalCell: null,
    spillElevation: Number.isFinite(spillElevation) ? round(spillElevation, 3) : null,
    spillRise: 0,
    spillRiseMeters: 0,
    storageCapacity: 0,
    requiredIncision: 0,
    geomorphicClosed: false,
    method: "natural-gradient"
  };
}

function getLakeFlux(grid, cells, lake, variation = null) {
  return (lake.shoreline || []).reduce((sum, cell) => sum + getCellPrecipitation(grid, cells, cell, variation), 0);
}

function getLakeTemperature(grid, cells, lake) {
  if (lake.cells < 6) return grid.cells.temp?.[cells.g[lake.firstCell]] || 0;
  const shoreline = lake.shoreline || [];
  if (!shoreline.length) return 0;
  return round(shoreline.reduce((sum, cell) => sum + (grid.cells.temp?.[cells.g[cell]] || 0), 0) / shoreline.length, 1);
}

function getLakeEvaporation(lake, exponent) {
  const height = (lake.height - 18) ** exponent;
  const evaporation = ((700 * (lake.temp + 0.006 * height)) / 50 + 75) / (80 - lake.temp);
  return round(evaporation * lake.cells);
}

function getDownhillCell(pack, heights, cell, activeDownstream, outletLakes) {
  const {cells, features} = pack;
  if (activeDownstream.has(cell)) return activeDownstream.get(cell);

  if (outletLakes.length) {
    const outletLakeIds = new Set(outletLakes.map(entry => entry.lake.i));
    const downhill = minNeighborHeightCell(cells.c[cell] || [], heights, neighbor => !outletLakeIds.has(features[cells.f[neighbor]]?.i));
    return downhill ?? null;
  }

  if (cells.haven[cell]) return cells.haven[cell];
  const neighbors = cells.c[cell] || [];
  if (!neighbors.length) return null;
  return minNeighborHeightCell(neighbors, heights);
}

function minHeightCell(cells, heights) {
  let bestCell = null;
  let bestHeight = Infinity;
  for (const cell of cells || []) {
    const height = heights[cell];
    if (height >= bestHeight) continue;
    bestCell = cell;
    bestHeight = height;
  }
  return bestCell;
}

function minHeightValue(cells, heights) {
  const cell = minHeightCell(cells, heights);
  return cell === null ? Infinity : heights[cell];
}

function minEffectiveNeighborHeight(pack, heights, cell) {
  let minHeight = Infinity;
  for (const neighbor of pack.cells.c[cell] || []) {
    const height = effectiveHeightForCell(pack, heights, neighbor);
    if (height < minHeight) minHeight = height;
  }
  return minHeight;
}

function minNeighborHeightCell(neighbors, heights, predicate = null) {
  let bestCell = null;
  let bestHeight = Infinity;
  for (const neighbor of neighbors || []) {
    if (predicate && !predicate(neighbor)) continue;
    const height = heights[neighbor];
    if (height >= bestHeight) continue;
    bestCell = neighbor;
    bestHeight = height;
  }
  return bestCell;
}

function effectiveHeightForCell(pack, heights, cell) {
  const feature = pack.features?.[pack.cells.f[cell]];
  return feature?.height || heights[cell];
}

function flowDown(pack, riverPaths, riverParents, toCell, fromFlux, riverId, hydrology = null, fromCell = null, lockContext = null, blockedRiverIds = null) {
  const {cells, features} = pack;
  const toFlux = cells.fl[toCell] - cells.conf[toCell];
  const toRiver = cells.r[toCell];
  const toLand = cells.h[toCell] >= WATER_LEVEL;

  if (isFrozenRiverCell(lockContext, toCell)) {
    if (!lockContext.frozenIds.has(Number(riverId))) blockedRiverIds?.add(Number(riverId));
    return;
  }

  if (toLand) transferHydrology(hydrology, fromCell, toCell);

  if (toRiver) {
    if (fromFlux > toFlux) {
      addFlux(cells.conf, toCell, cells.fl[toCell]);
      if (cells.h[toCell] >= WATER_LEVEL) riverParents.set(toRiver, riverId);
      cells.r[toCell] = riverId;
    } else {
      addFlux(cells.conf, toCell, fromFlux);
      if (cells.h[toCell] >= WATER_LEVEL) riverParents.set(riverId, toRiver);
    }
  } else {
    cells.r[toCell] = riverId;
  }

  if (!toLand) {
    const waterBody = features[cells.f[toCell]];
    if (waterBody?.type === "lake") {
      const lakeGuard = frozenLakeGuard(lockContext, waterBody);
      if (!lakeGuard?.river && (!waterBody.river || fromFlux > (waterBody.enteringFlux || 0))) {
        waterBody.river = riverId;
        waterBody.enteringFlux = fromFlux;
      }
      waterBody.flux = (waterBody.flux || 0) + fromFlux;
      waterBody.inlets = waterBody.inlets || [];
      waterBody.inlets.push(riverId);
    }
  } else {
    addFlux(cells.fl, toCell, fromFlux);
  }

  addCellToRiver(riverPaths, riverId, toCell);
}

function defineRivers({grid, pack, riverPaths, riverParents, options, nameGenerator, hydrology, lockContext}) {
  const rivers = (lockContext?.frozenRivers || []).map(river => structuredClone(river));
  const cells = pack.cells;
  const defaultWidthFactor = round(1 / Math.max(1, (Number(options.cellsTarget || grid.metadata.cellsDesired || grid.points.length) / 10000) ** 0.25), 2);
  const mainStemWidthFactor = defaultWidthFactor * 1.2;

  for (const [riverId, rawCells] of riverPaths) {
    if (lockContext?.frozenIds?.has(Number(riverId))) continue;
    const riverCells = dedupeConsecutive(rawCells);
    if (riverCells.length < MIN_RIVER_CELLS && !(riverCells.length >= 2 && isLakeOutletRiver(pack, riverId))) continue;
    const source = riverCells[0];
    if (source < 0 || cells.h[source] < WATER_LEVEL) continue;
    const mouth = getRiverMouth(riverCells);
    const hydrologyMouth = getRiverHydrologyMouth(riverCells, cells);
    const parent = riverParents.get(riverId) || 0;
    const widthFactor = !parent || parent === riverId ? mainStemWidthFactor : defaultWidthFactor;
    const points = addMeandering(pack, riverCells, riverId);
    const discharge = cells.fl[mouth] || cells.fl[source] || 1;
    const length = getApproximateLength(points);
    const sourceWidth = getSourceWidth(cells.fl[source]);
    const width = getWidth(getRiverOffset(discharge, points.length, widthFactor, sourceWidth));
    const cultureId = cells.culture?.[source] || 0;
    const culture = pack.cultures?.[cultureId];

    rivers.push({
      id: riverId,
      i: riverId,
      source,
      sourceGrid: cells.g[source],
      mouth,
      mouthGrid: mouth >= 0 ? cells.g[mouth] : -1,
      parent,
      basin: parent || riverId,
      discharge,
      flux: discharge,
      length,
      width,
      widthFactor,
      sourceWidth,
      hydrology: riverHydrology(hydrology, hydrologyMouth),
      cells: riverCells,
      gridCells: riverCells.filter(cell => cell >= 0).map(cell => cells.g[cell]),
      points,
      type: parent ? "Branch" : "River",
      name: nameGenerator.makeRiverName({
        id: riverId,
        cell: source,
        culture: cultureId,
        cultureType: culture?.nameStyle || culture?.type,
        flux: discharge,
        type: parent ? "branch" : "river"
      })
    });
  }

  return rivers.sort((a, b) => Number(a.i ?? a.id) - Number(b.i ?? b.id));
}

function isLakeOutletRiver(pack, riverId) {
  return (pack.features || []).some(feature => feature?.type === "lake" && Number(feature.outlet) === Number(riverId));
}

function defineLakeNames(pack, nameGenerator) {
  for (const feature of pack.features || []) {
    if (!feature || feature.type !== "lake") continue;
    const cultureId = pack.cells.culture?.[feature.firstCell] || 0;
    const culture = pack.cultures?.[cultureId];
    feature.name = nameGenerator.makeLakeName({
      id: feature.i,
      cell: feature.firstCell,
      culture: cultureId,
      cultureType: culture?.nameStyle || culture?.type,
      type: feature.group || "lake",
      major: (feature.cells || 0) >= 10,
      preferCommonSuffix: true
    });
  }
}

function markRiverCells(cells, rivers, lockContext = null) {
  for (const river of rivers) {
    for (const cell of river.cells) {
      if (cell < 0 || cells.h[cell] < WATER_LEVEL) continue;
      if (isFrozenRiverCell(lockContext, cell)) continue;
      if (cells.r[cell]) cells.conf[cell] = Math.max(cells.conf[cell], 1);
      else cells.r[cell] = river.i;
    }
  }
}

function calculateConfluenceFlux(cells, heights, lockContext = null) {
  for (const cell of cells.i) {
    if (isFrozenRiverCell(lockContext, cell)) continue;
    if (!cells.conf[cell]) continue;
    const sortedInflux = (cells.c[cell] || [])
      .filter(neighbor => cells.r[neighbor] && heights[neighbor] > heights[cell])
      .map(neighbor => cells.fl[neighbor])
      .sort((a, b) => b - a);
    cells.conf[cell] = sortedInflux.reduce((sum, flux, index) => (index ? sum + flux : sum), 0);
  }
}

function cleanupLakeData(pack, lockContext = null) {
  const lakesById = new Map((pack.features || [])
    .filter(feature => feature?.type === "lake")
    .map(feature => [Number(feature.i ?? feature.id), feature]));
  const validInletsByLake = new Map();
  for (const river of pack.rivers || []) {
    if (river?.outletKind !== "lake") continue;
    const lakeId = Number(river.outletFeatureId);
    if (!lakesById.has(lakeId)) continue;
    if (!validInletsByLake.has(lakeId)) validInletsByLake.set(lakeId, []);
    validInletsByLake.get(lakeId).push(Number(river.i ?? river.id));
  }
  for (const feature of pack.features || []) {
    if (!feature || feature.type !== "lake") continue;
    const guard = frozenLakeGuard(lockContext, feature);
    if (!guard?.river) delete feature.river;
    delete feature.enteringFlux;
    delete feature.outCell;
    delete feature.closed;
    feature.height = round(feature.height, 3);
    const lakeId = Number(feature.i ?? feature.id);
    const validInlets = validInletsByLake.get(lakeId) || [];
    const validIds = new Set(validInlets);
    feature.inlets = [...new Set([
      ...(feature.inlets || []).map(Number).filter(id => validIds.has(id)),
      ...validInlets
    ])];
    if (!feature.inlets?.length) delete feature.inlets;
    if (!guard?.outlet && feature.outlet && !pack.rivers?.some(river => river.i === feature.outlet)) delete feature.outlet;
  }
}

function discardBlockedRiverCandidates(cells, riverPaths, riverParents, blockedRiverIds) {
  if (!blockedRiverIds?.size) return;
  for (const id of blockedRiverIds) {
    riverPaths.delete(id);
    riverParents.delete(id);
  }
  for (const cell of cells.i) {
    if (!blockedRiverIds.has(Number(cells.r[cell]))) continue;
    cells.r[cell] = 0;
    cells.conf[cell] = 0;
  }
}

function addCellToRiver(paths, riverId, cell) {
  if (!paths.has(riverId)) paths.set(riverId, [cell]);
  else paths.get(riverId).push(cell);
}

function addFlux(array, cell, value) {
  array[cell] += value;
}

function getRiverMouth(riverCells) {
  if (riverCells.length < 2) return riverCells[0];
  const last = riverCells[riverCells.length - 1];
  if (last < 0) return riverCells[riverCells.length - 2];
  return last;
}

function getRiverHydrologyMouth(riverCells, cells) {
  for (let index = riverCells.length - 1; index >= 0; index--) {
    const cell = riverCells[index];
    if (cell >= 0 && cells.h[cell] >= WATER_LEVEL) return cell;
  }
  return getRiverMouth(riverCells);
}

function addMeandering(pack, riverCells, riverId) {
  const points = getRiverPoints(pack, riverCells);
  if (points.length <= 2) return points;
  const meandered = [points[0]];

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = distance(start, end);
    const dist2 = length ** 2;
    if (isRiverMouthSegment(pack.cells, riverCells, index)) {
      meandered.push(end);
      continue;
    }

    const step = index + 10;
    const meander = 0.5 + 1 / step + Math.max(0.5 - step / 100, 0);
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    const sinMeander = Math.sin(angle) * meander;
    const cosMeander = Math.cos(angle) * meander;

    if (dist2 > 64 || (dist2 > 36 && riverCells.length < 5)) {
      meandered.push(
        withRiverPointFlux([(start[0] * 2 + end[0]) / 3 - sinMeander, (start[1] * 2 + end[1]) / 3 + cosMeander], interpolateFlux(start, end, 1 / 3)),
        withRiverPointFlux([(start[0] + end[0] * 2) / 3 + sinMeander / 2, (start[1] + end[1] * 2) / 3 - cosMeander / 2], interpolateFlux(start, end, 2 / 3))
      );
    } else if (dist2 > 25 || riverCells.length < 6) {
      const wave = Math.sin((riverId * 17.17 + index * 7.31) * Math.PI);
      meandered.push(withRiverPointFlux([(start[0] + end[0]) / 2 - sinMeander * wave, (start[1] + end[1]) / 2 + cosMeander * wave], interpolateFlux(start, end, 0.5)));
    }

    meandered.push(end);
  }

  return simplifyRiverPoints(meandered);
}

function getRiverPoints(pack, riverCells) {
  const points = [];
  const cells = pack.cells;

  for (let index = 0; index < riverCells.length; index++) {
    const cell = riverCells[index];
    const previousCell = riverCells[index - 1];

    if (cell === -1) {
      const borderPoint = getBorderPoint(pack, previousCell);
      if (borderPoint) points.push(withRiverPointFlux(borderPoint, getCellFlux(cells, previousCell)));
      break;
    }

    const point = cells.p[cell];
    if (!point) continue;
    const height = cells.h[cell] ?? 100;
    if (height >= WATER_LEVEL || !points.length) {
      points.push(withRiverPointFlux(point, getCellFlux(cells, cell)));
      continue;
    }

    const previousPoint = points[points.length - 1] || cells.p[previousCell];
    const mouthPoint = getCellSharedEdgeMouthPoint(pack, previousCell, cell, previousPoint, point) || getHeightInterpolatedMouthPoint(cells, previousCell, cell, previousPoint, point);
    if (mouthPoint) points.push(withRiverPointFlux(mouthPoint, getCellFlux(cells, previousCell)));
    break;
  }

  return points;
}

function getCellFlux(cells, cell) {
  if (cell === undefined || cell < 0) return 0;
  return cells.fl?.[cell] || 0;
}

function withRiverPointFlux(point, flux) {
  return [round(point[0], 2), round(point[1], 2), Math.max(0, Math.round(flux || 0))];
}

function interpolateFlux(start, end, amount) {
  return (start[2] || 0) + ((end[2] || 0) - (start[2] || 0)) * amount;
}

function getBorderPoint(pack, cell) {
  if (cell === undefined || cell < 0 || !pack.cells.p[cell]) return null;
  const [x, y] = pack.cells.p[cell];
  const width = 1440;
  const height = 960;
  const min = Math.min(y, height - y, x, width - x);
  if (min === y) return [x, 0];
  if (min === height - y) return [x, height];
  if (min === x) return [0, y];
  return [width, y];
}

function isRiverMouthSegment(cells, riverCells, segmentIndex) {
  const from = riverCells[segmentIndex];
  const to = riverCells[segmentIndex + 1];
  if (to === -1) return true;
  if (from === undefined || to === undefined || from < 0 || to < 0) return false;
  return (cells.h[from] ?? 100) >= WATER_LEVEL && (cells.h[to] ?? 100) < WATER_LEVEL;
}

function getCellSharedEdgeMouthPoint(pack, landCellId, waterCellId, landPoint, waterPoint) {
  const edge = getCellSharedEdgePoints(pack, landCellId, waterCellId);
  if (!edge) return null;
  const intersection = getSegmentIntersection(landPoint, waterPoint, edge[0], edge[1]);
  if (intersection) return intersection;
  return getMidpoint(edge[0], edge[1]);
}

function getCellSharedEdgePoints(pack, cellA, cellB) {
  const verticesA = pack.cells.v?.[cellA];
  const verticesB = pack.cells.v?.[cellB];
  if (!Array.isArray(verticesA) || !Array.isArray(verticesB)) return null;

  const verticesBSet = new Set(verticesB);
  const shared = verticesA.filter(vertexId => verticesBSet.has(vertexId));
  if (shared.length < 2) return null;
  const first = pack.vertices?.p?.[shared[0]];
  const second = pack.vertices?.p?.[shared[1]];
  return first && second ? [first, second] : null;
}

function getHeightInterpolatedMouthPoint(cells, landCellId, waterCellId, landPoint, waterPoint) {
  if (!landPoint || !waterPoint) return landPoint || waterPoint;
  const landHeight = cells.h?.[landCellId] ?? WATER_LEVEL;
  const waterHeight = cells.h?.[waterCellId] ?? 0;
  const amount = landHeight === waterHeight ? 0.5 : Math.min(Math.max((landHeight - WATER_LEVEL) / (landHeight - waterHeight), 0), 1);
  return lerpPoint(landPoint, waterPoint, amount);
}

function getSegmentIntersection(a, b, c, d) {
  if (!a || !b || !c || !d) return null;
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-8) return null;
  const ca = [c[0] - a[0], c[1] - a[1]];
  const t = cross(ca, s) / denominator;
  const u = cross(ca, r) / denominator;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return lerpPoint(a, b, Math.min(Math.max(t, 0), 1));
}

function lerpPoint(a, b, amount) {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

function getMidpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

function simplifyRiverPoints(points) {
  if (points.length <= 3) return points;
  const simplified = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const angle = turnAngle(previous, current, next);
    const segment = distance(previous, current);
    if (angle > 0.18 || segment > 18) simplified.push(current);
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

function turnAngle(a, b, c) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const bcx = c[0] - b[0];
  const bcy = c[1] - b[1];
  return Math.atan2(Math.abs(abx * bcy - aby * bcx), abx * bcx + aby * bcy);
}

function dedupeConsecutive(values) {
  const result = [];
  for (const value of values) {
    if (result[result.length - 1] !== value) result.push(value);
  }
  return result;
}

function getApproximateLength(points) {
  return round(points.reduce((sum, point, index) => (index ? sum + distance(point, points[index - 1]) : sum), 0), 2);
}

function getSourceWidth(flux) {
  return round(Math.min(flux ** 0.9 / 500, 1), 2);
}

function getRiverOffset(flux, pointIndex, widthFactor, startingWidth) {
  const lengthProgression = [1, 1, 2, 3, 5, 8, 13, 21, 34].map(value => value / 200);
  const fluxWidth = Math.min(flux ** 0.7 / 500, 1);
  const lengthWidth = pointIndex / 200 + (lengthProgression[pointIndex] || lengthProgression[lengthProgression.length - 1]);
  return widthFactor * (lengthWidth + fluxWidth) + startingWidth;
}

function getWidth(offset) {
  return round((offset / 1.5) ** 1.8, 2);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function maxValue(values) {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

function countPositive(values) {
  let count = 0;
  for (const value of values) if (value > 0) count++;
  return count;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
