export const SUITABILITY_VALUE_RANGE = Object.freeze({min: 0, max: 100, step: 1, defaultValue: 25});
export const SUITABILITY_OVERRIDE_UNSET = -1;

export function ensureSuitabilityStores(pack) {
  const cells = pack?.cells;
  const length = cells?.i?.length || cells?.s?.length || 0;
  if (!cells || !length) return {base: null, overrides: null};
  if (!cells.s || cells.s.length !== length) cells.s = normalizeBaseStore(cells.s, cells.suitabilityBase, length);
  if (!cells.pop || cells.pop.length !== length) cells.pop = normalizePopulationStore(cells.pop, length);
  cells.suitabilityBase = normalizeBaseStore(cells.suitabilityBase, cells.s, length);
  cells.suitabilityOverride = normalizeOverrideStore(cells.suitabilityOverride, length);
  return {base: cells.suitabilityBase, overrides: cells.suitabilityOverride};
}

export function captureSuitabilityBase(pack) {
  const cells = pack?.cells;
  const length = cells?.i?.length || cells?.s?.length || 0;
  if (!cells || !length) return null;
  const overrides = normalizeOverrideStore(cells.suitabilityOverride, length);
  cells.suitabilityBase = normalizeBaseStore(cells.s, cells.s, length);
  cells.suitabilityOverride = overrides;
  return cells.suitabilityBase;
}

export function restoreSuitabilityBase(pack) {
  const cells = pack?.cells;
  const {base} = ensureSuitabilityStores(pack);
  if (!base) return 0;
  const meanArea = average(cells.area) || 1;
  for (let cell = 0; cell < base.length; cell++) {
    const value = normalizeBaseValue(base[cell]);
    cells.s[cell] = value;
    cells.pop[cell] = populationForSuitability(cells, cell, value, meanArea);
  }
  return base.length;
}

export function applySuitabilityOverrides(pack) {
  const cells = pack?.cells;
  const {base, overrides} = ensureSuitabilityStores(pack);
  if (!base || !overrides) return {manualCells: 0, meanArea: 1};
  const meanArea = average(cells.area) || 1;
  let manualCells = 0;
  for (let cell = 0; cell < base.length; cell++) {
    const override = Number(overrides[cell]);
    const manual = override >= SUITABILITY_VALUE_RANGE.min;
    const value = manual ? normalizeOverrideValue(override) : normalizeBaseValue(base[cell]);
    if (manual) manualCells++;
    cells.s[cell] = value;
    cells.pop[cell] = populationForSuitability(cells, cell, value, meanArea);
  }
  return {manualCells, meanArea};
}

export function mirrorSuitabilityPopulationToGrid(grid, pack) {
  const length = grid?.points?.length || grid?.cells?.h?.length || 0;
  if (!grid?.cells || !pack?.cells || !length) return {suitability: [], population: []};
  const suitability = new Array(length).fill(0);
  const population = new Array(length).fill(0);
  for (const packCell of pack.cells.i || []) {
    const gridCell = Number(pack.cells.g?.[packCell]);
    if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= length) continue;
    suitability[gridCell] = Math.max(suitability[gridCell], Number(pack.cells.s?.[packCell]) || 0);
    population[gridCell] = Math.max(population[gridCell], round(Number(pack.cells.pop?.[packCell]) || 0, 3));
  }
  grid.cells.s = suitability;
  grid.cells.pop = population;
  return {suitability, population};
}

export function populationForSuitability(cells, cell, suitability, meanArea = average(cells?.area) || 1) {
  const value = Number(suitability) || 0;
  if (Number(cells?.h?.[cell]) < 20 || value <= 0) return 0;
  return (value * (Number(cells?.area?.[cell]) || 0)) / Math.max(1e-6, meanArea);
}

function normalizeBaseStore(source, fallback, length) {
  const values = new Int16Array(length);
  for (let index = 0; index < length; index++) values[index] = normalizeBaseValue(source?.[index] ?? fallback?.[index]);
  return values;
}

function normalizeOverrideStore(source, length) {
  const values = new Int16Array(length);
  values.fill(SUITABILITY_OVERRIDE_UNSET);
  for (let index = 0; index < length; index++) {
    const value = Number(source?.[index]);
    if (Number.isFinite(value) && value >= SUITABILITY_VALUE_RANGE.min) values[index] = normalizeOverrideValue(value);
  }
  return values;
}

function normalizePopulationStore(source, length) {
  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) values[index] = Number(source?.[index]) || 0;
  return values;
}

function normalizeBaseValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(32767, Math.round(number)));
}

function normalizeOverrideValue(value) {
  return Math.max(SUITABILITY_VALUE_RANGE.min, Math.min(SUITABILITY_VALUE_RANGE.max, Math.round(Number(value) || 0)));
}

function average(values = []) {
  const length = values?.length || 0;
  if (!length) return 0;
  let total = 0;
  for (const value of values) total += Number(value) || 0;
  return total / length;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
