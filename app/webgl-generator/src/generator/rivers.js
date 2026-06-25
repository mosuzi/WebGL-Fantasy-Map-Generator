import {defineFeatureGroups} from "./pack.js";
import {createChineseNameGenerator} from "./names.js";

const WATER_LEVEL = 20;
const MIN_FLUX_TO_FORM_RIVER = 30;
const MIN_RIVER_CELLS = 3;
const MAX_DEPRESSION_ITERATIONS = 250;
const LAKE_ELEVATION_LIMIT = 20;
const HEIGHT_EXPONENT = 2;

export function buildRivers(grid, features, pack, options = {}) {
  if (!pack?.cells?.t) return buildEmptyRivers();

  const startedAt = performance.now();
  const nameGenerator = createChineseNameGenerator(options.seed);
  const cells = pack.cells;
  const riverPaths = new Map();
  const riverParents = new Map();
  let effectiveHeights = alterHeights(cells);
  detectCloseLakes(pack, effectiveHeights);
  effectiveHeights = resolveDepressions(pack, effectiveHeights);

  cells.fl = new Uint16Array(cells.i.length);
  cells.r = new Uint16Array(cells.i.length);
  cells.conf = new Uint8Array(cells.i.length);
  const lakeOutCells = defineLakeClimateData(grid, pack, effectiveHeights, options);

  const cellsNumberModifier = Math.max(1, (Number(options.cellsTarget || grid.metadata.cellsDesired || grid.points.length) / 10000) ** 0.25);
  const land = Array.from(cells.i)
    .filter(cell => cells.h[cell] >= WATER_LEVEL)
    .sort((a, b) => effectiveHeights[b] - effectiveHeights[a]);

  let nextRiverId = 1;

  for (const cell of land) {
    addFlux(cells.fl, cell, (grid.cells.prec?.[cells.g[cell]] || 0) / cellsNumberModifier);

    const outletLakes = lakeOutCells[cell]
      ? (pack.features || []).filter(feature => feature && cell === feature.outCell && feature.flux > feature.evaporation)
      : [];

    for (const lake of outletLakes) {
      const lakeCell = (cells.c[cell] || []).find(neighbor => effectiveHeights[neighbor] < WATER_LEVEL && cells.f[neighbor] === lake.i);
      if (lakeCell === undefined) continue;

      addFlux(cells.fl, lakeCell, Math.max(lake.flux - lake.evaporation, 0));

      if (cells.r[lakeCell] !== lake.river) {
        const sameRiver = (cells.c[lakeCell] || []).some(neighbor => cells.r[neighbor] === lake.river);

        if (sameRiver) {
          cells.r[lakeCell] = lake.river;
          addCellToRiver(riverPaths, lake.river, lakeCell);
        } else {
          cells.r[lakeCell] = nextRiverId;
          addCellToRiver(riverPaths, nextRiverId, lakeCell);
          nextRiverId++;
        }
      }

      lake.outlet = cells.r[lakeCell];
      flowDown(pack, riverPaths, riverParents, cell, cells.fl[lakeCell], lake.outlet);
    }

    const outlet = outletLakes[0]?.outlet;
    for (const lake of outletLakes) {
      if (!Array.isArray(lake.inlets)) continue;
      for (const inlet of lake.inlets) riverParents.set(inlet, outlet);
    }

    if (cells.b[cell] && cells.r[cell]) {
      addCellToRiver(riverPaths, cells.r[cell], -1);
      continue;
    }

    const downhill = getDownhillCell(pack, effectiveHeights, cell, lakeOutCells, outletLakes);
    if (downhill === null || effectiveHeights[cell] <= effectiveHeights[downhill]) continue;

    if (cells.fl[cell] < MIN_FLUX_TO_FORM_RIVER) {
      if (cells.h[downhill] >= WATER_LEVEL) addFlux(cells.fl, downhill, cells.fl[cell]);
      continue;
    }

    if (!cells.r[cell]) {
      cells.r[cell] = nextRiverId;
      addCellToRiver(riverPaths, nextRiverId, cell);
      nextRiverId++;
    }

    flowDown(pack, riverPaths, riverParents, downhill, cells.fl[cell], cells.r[cell]);
  }

  const rivers = defineRivers({grid, pack, riverPaths, riverParents, options, nameGenerator});
  cells.r = new Uint16Array(cells.i.length);
  cells.conf = new Uint16Array(cells.i.length);
  markRiverCells(cells, rivers);
  calculateConfluenceFlux(cells, effectiveHeights);
  pack.rivers = rivers;
  cleanupLakeData(pack);
  defineLakeNames(pack, nameGenerator);
  defineFeatureGroups(pack, grid);

  return {
    rivers,
    metadata: {
      rivers: rivers.length,
      segments: rivers.reduce((sum, river) => sum + Math.max(0, river.points.length - 1), 0),
      sources: rivers.length,
      longest: rivers.reduce((max, river) => Math.max(max, river.cells.length), 0),
      maxFlux: maxValue(cells.fl),
      confluences: countPositive(cells.conf),
      cellsWithRiver: countPositive(cells.r),
      flowModel: "source-pack-flux-first-pass",
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
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
      flowModel: "empty"
    }
  };
}

function alterHeights(cells) {
  return Array.from(cells.h).map((height, cell) => {
    if (height < WATER_LEVEL || cells.t[cell] < 1) return height;
    const neighbors = cells.c[cell] || [];
    const meanType = neighbors.length ? neighbors.reduce((sum, neighbor) => sum + (cells.t[neighbor] || 0), 0) / neighbors.length : 0;
    return height + cells.t[cell] / 100 + meanType / 10000;
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
    const lowestShorelineCell = [...feature.shoreline].sort((a, b) => heights[a] - heights[b])[0];
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

function resolveDepressions(pack, heights) {
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
      heights = alterHeights(cells);
      depressions = progress[0];
      break;
    }

    depressions = 0;

    if (iteration < checkLakeMaxIteration) {
      for (const lake of features || []) {
        if (!lake || lake.type !== "lake" || lake.closed || !lake.shoreline?.length) continue;
        const minHeight = Math.min(...lake.shoreline.map(cell => heights[cell]));
        if (minHeight >= 100 || lake.height > minHeight) continue;

        if (iteration > elevateLakeMaxIteration) {
          for (const cell of lake.shoreline) heights[cell] = cells.h[cell];
          lake.height = Math.min(...lake.shoreline.map(cell => heights[cell])) - 1;
          lake.closed = true;
          continue;
        }

        lake.height = minHeight + 0.2;
        depressions++;
      }
    }

    for (const cell of land) {
      const minHeight = Math.min(...(cells.c[cell] || []).map(neighbor => effectiveHeightForCell(pack, heights, neighbor)));
      if (minHeight >= 100 || heights[cell] > minHeight) continue;
      heights[cell] = minHeight + 0.1;
      depressions++;
    }

    if (!depressions) break;
    if (previousDepressions !== null) progress.push(depressions - previousDepressions);
    previousDepressions = depressions;
  }

  return heights;
}

function defineLakeClimateData(grid, pack, heights, options = {}) {
  const {cells, features} = pack;
  const lakeOutCells = new Uint16Array(cells.i.length);
  const exponent = options.heightExponent ?? HEIGHT_EXPONENT;

  for (const feature of features || []) {
    if (!feature || feature.type !== "lake") continue;

    feature.flux = getLakeFlux(grid, cells, feature);
    feature.temp = getLakeTemperature(grid, cells, feature);
    feature.evaporation = getLakeEvaporation(feature, exponent);
    if (feature.closed || !feature.shoreline?.length) continue;

    feature.outCell = [...feature.shoreline].sort((a, b) => heights[a] - heights[b])[0];
    lakeOutCells[feature.outCell] = feature.i;
  }

  return lakeOutCells;
}

function getLakeFlux(grid, cells, lake) {
  return (lake.shoreline || []).reduce((sum, cell) => sum + (grid.cells.prec?.[cells.g[cell]] || 0), 0);
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

function getDownhillCell(pack, heights, cell, lakeOutCells, outletLakes) {
  const {cells, features} = pack;
  if (lakeOutCells[cell]) {
    const outletLakeIds = new Set(outletLakes.map(lake => lake.i));
    const filtered = (cells.c[cell] || []).filter(neighbor => !outletLakeIds.has(features[cells.f[neighbor]]?.i));
    if (!filtered.length) return null;
    return filtered.sort((a, b) => heights[a] - heights[b])[0];
  }

  if (cells.haven[cell]) return cells.haven[cell];
  const neighbors = cells.c[cell] || [];
  if (!neighbors.length) return null;
  return neighbors.sort((a, b) => heights[a] - heights[b])[0];
}

function effectiveHeightForCell(pack, heights, cell) {
  const feature = pack.features?.[pack.cells.f[cell]];
  return feature?.height || heights[cell];
}

function flowDown(pack, riverPaths, riverParents, toCell, fromFlux, riverId) {
  const {cells, features} = pack;
  const toFlux = cells.fl[toCell] - cells.conf[toCell];
  const toRiver = cells.r[toCell];

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

  if (cells.h[toCell] < WATER_LEVEL) {
    const waterBody = features[cells.f[toCell]];
    if (waterBody?.type === "lake") {
      if (!waterBody.river || fromFlux > (waterBody.enteringFlux || 0)) {
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

function defineRivers({grid, pack, riverPaths, riverParents, options, nameGenerator}) {
  const rivers = [];
  const cells = pack.cells;
  const defaultWidthFactor = round(1 / Math.max(1, (Number(options.cellsTarget || grid.metadata.cellsDesired || grid.points.length) / 10000) ** 0.25), 2);
  const mainStemWidthFactor = defaultWidthFactor * 1.2;

  for (const [riverId, rawCells] of riverPaths) {
    const riverCells = dedupeConsecutive(rawCells);
    if (riverCells.length < MIN_RIVER_CELLS) continue;
    const source = riverCells[0];
    if (source < 0 || cells.h[source] < WATER_LEVEL) continue;
    const mouth = getRiverMouth(riverCells);
    const parent = riverParents.get(riverId) || 0;
    const widthFactor = !parent || parent === riverId ? mainStemWidthFactor : defaultWidthFactor;
    const points = addMeandering(pack, riverCells, riverId);
    const discharge = cells.fl[mouth] || cells.fl[source] || 1;
    const length = getApproximateLength(points);
    const sourceWidth = getSourceWidth(cells.fl[source]);
    const width = getWidth(getRiverOffset(discharge, points.length, widthFactor, sourceWidth));

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
      cells: riverCells,
      gridCells: riverCells.filter(cell => cell >= 0).map(cell => cells.g[cell]),
      points,
      type: parent ? "Branch" : "River",
      name: nameGenerator.makeRiverName({id: riverId, cell: source, flux: discharge, type: parent ? "branch" : "river"})
    });
  }

  return rivers;
}

function defineLakeNames(pack, nameGenerator) {
  for (const feature of pack.features || []) {
    if (!feature || feature.type !== "lake") continue;
    feature.name = nameGenerator.makeLakeName({
      id: feature.i,
      cell: feature.firstCell,
      type: feature.group || "lake",
      major: (feature.cells || 0) >= 10
    });
  }
}

function markRiverCells(cells, rivers) {
  for (const river of rivers) {
    for (const cell of river.cells) {
      if (cell < 0 || cells.h[cell] < WATER_LEVEL) continue;
      if (cells.r[cell]) cells.conf[cell] = Math.max(cells.conf[cell], 1);
      else cells.r[cell] = river.i;
    }
  }
}

function calculateConfluenceFlux(cells, heights) {
  for (const cell of cells.i) {
    if (!cells.conf[cell]) continue;
    const sortedInflux = (cells.c[cell] || [])
      .filter(neighbor => cells.r[neighbor] && heights[neighbor] > heights[cell])
      .map(neighbor => cells.fl[neighbor])
      .sort((a, b) => b - a);
    cells.conf[cell] = sortedInflux.reduce((sum, flux, index) => (index ? sum + flux : sum), 0);
  }
}

function cleanupLakeData(pack) {
  for (const feature of pack.features || []) {
    if (!feature || feature.type !== "lake") continue;
    delete feature.river;
    delete feature.enteringFlux;
    delete feature.outCell;
    delete feature.closed;
    feature.height = round(feature.height, 3);
    if (feature.inlets) feature.inlets = [...new Set(feature.inlets.filter(id => pack.rivers?.some(river => river.i === id)))];
    if (!feature.inlets?.length) delete feature.inlets;
    if (feature.outlet && !pack.rivers?.some(river => river.i === feature.outlet)) delete feature.outlet;
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

function addMeandering(pack, riverCells, riverId) {
  const points = getRiverPoints(pack, riverCells);
  if (points.length <= 2) return points;
  const meandered = [points[0]];

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = distance(start, end);
    const dist2 = length ** 2;
    const step = index + 10;
    const meander = 0.5 + 1 / step + Math.max(0.5 - step / 100, 0);
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    const sinMeander = Math.sin(angle) * meander;
    const cosMeander = Math.cos(angle) * meander;

    if (dist2 > 64 || (dist2 > 36 && riverCells.length < 5)) {
      meandered.push(
        [(start[0] * 2 + end[0]) / 3 - sinMeander, (start[1] * 2 + end[1]) / 3 + cosMeander],
        [(start[0] + end[0] * 2) / 3 + sinMeander / 2, (start[1] + end[1] * 2) / 3 - cosMeander / 2]
      );
    } else if (dist2 > 25 || riverCells.length < 6) {
      const wave = Math.sin((riverId * 17.17 + index * 7.31) * Math.PI);
      meandered.push([(start[0] + end[0]) / 2 - sinMeander * wave, (start[1] + end[1]) / 2 + cosMeander * wave]);
    }

    meandered.push(end);
  }

  return simplifyRiverPoints(meandered);
}

function getRiverPoints(pack, riverCells) {
  return riverCells.map((cell, index) => (cell === -1 ? getBorderPoint(pack, riverCells[index - 1]) : pack.cells.p[cell]));
}

function getBorderPoint(pack, cell) {
  const [x, y] = pack.cells.p[cell];
  const width = 1440;
  const height = 960;
  const min = Math.min(y, height - y, x, width - x);
  if (min === y) return [x, 0];
  if (min === height - y) return [x, height];
  if (min === x) return [0, y];
  return [width, y];
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
