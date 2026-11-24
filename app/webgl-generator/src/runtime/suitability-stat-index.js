import {SUITABILITY_OVERRIDE_UNSET} from "../generator/suitability.js";

const blockSize = 256;
const indexes = new WeakMap();
const ownerFields = ["state", "province", "culture", "religion"];

export function invalidateSuitabilityStats(map) {
  indexes.delete(map);
}

export function touchSuitabilityStats(map, gridIds, packIds) {
  const index = indexes.get(map);
  if (!index) return;
  for (const cell of gridIds) index.gridDirty.add(Math.floor(cell / blockSize));
  for (const cell of packIds) index.packDirty.add(Math.floor(cell / blockSize));
}

// 每块保留未舍入的所属人口。最大值下降和同一地区连续编辑都能精确汇总。
export function readEditedSuitabilityStats(map, gridIds, packIds, owners) {
  const cells = map.pack.cells;
  const refs = [map.grid.cells.pop, cells.pop, cells.s, cells.suitabilityOverride, ...ownerFields.map(key => cells[key])];
  let index = indexes.get(map);
  if (!index || refs.some((ref, i) => index.refs[i] !== ref)) {
    index = {refs, grid: [], pack: [], gridDirty: new Set(), packDirty: new Set()};
    for (let i = 0; i < map.grid.cells.pop.length; i += blockSize) index.gridDirty.add(i / blockSize);
    for (let i = 0; i < cells.pop.length; i += blockSize) index.packDirty.add(i / blockSize);
    indexes.set(map, index);
  } else {
    touchSuitabilityStats(map, gridIds, packIds);
  }
  for (const block of index.gridDirty) {
    let populated = 0;
    for (let i = block * blockSize; i < Math.min((block + 1) * blockSize, map.grid.cells.pop.length); i++) {
      if (map.grid.cells.pop[i] > 0) populated++;
    }
    index.grid[block] = populated;
  }
  for (const block of index.packDirty) index.pack[block] = summarizePackBlock(cells, block);
  index.gridDirty.clear();
  index.packDirty.clear();

  const summary = {manualCells: 0, positiveSuitabilityCells: 0, positivePopulationCells: 0, maxSuitability: 0, maxPopulation: 0};
  for (const block of index.pack) {
    summary.manualCells += block.manualCells;
    summary.positiveSuitabilityCells += block.positiveSuitabilityCells;
    summary.positivePopulationCells += block.positivePopulationCells;
    summary.maxSuitability = Math.max(summary.maxSuitability, block.maxSuitability);
    summary.maxPopulation = Math.max(summary.maxPopulation, block.maxPopulation);
    for (const {field, totals} of owners) {
      for (const [id, total] of totals) totals.set(id, total + (block.rural[field].get(id) || 0));
    }
  }
  return {summary, gridPopulated: index.grid.reduce((sum, count) => sum + count, 0)};
}

function summarizePackBlock(cells, block) {
  const rural = Object.fromEntries(ownerFields.map(field => [field, new Map()]));
  const result = {rural, manualCells: 0, positiveSuitabilityCells: 0, positivePopulationCells: 0, maxSuitability: 0, maxPopulation: 0};
  const end = Math.min((block + 1) * blockSize, cells.pop.length);
  for (let cell = block * blockSize; cell < end; cell++) {
    const pop = Number(cells.pop[cell]) || 0;
    const s = Number(cells.s[cell]) || 0;
    if (cells.suitabilityOverride[cell] !== SUITABILITY_OVERRIDE_UNSET) result.manualCells++;
    if (s > 0) result.positiveSuitabilityCells++;
    if (pop > 0) result.positivePopulationCells++;
    result.maxSuitability = Math.max(result.maxSuitability, s);
    result.maxPopulation = Math.max(result.maxPopulation, pop);
    for (const field of ownerFields) {
      const id = Number(cells[field]?.[cell]) || 0;
      rural[field].set(id, (rural[field].get(id) || 0) + pop);
    }
  }
  return result;
}
