const DERIVED_PACK_GRID_COLUMNS = Object.freeze([
  Object.freeze({pack: "temp", grid: "temp"}),
  Object.freeze({pack: "prec", grid: "prec"})
]);

export function applyMainThreadMapProjection(map) {
  const packCells = map?.pack?.cells;
  const gridCells = map?.grid?.cells;
  const packToGrid = packCells?.g;
  if (!packCells || !gridCells || !packToGrid) return map;
  for (const column of DERIVED_PACK_GRID_COLUMNS) {
    const current = packCells[column.pack];
    const source = gridCells[column.grid];
    if (!isExactDerivedColumn(current, source, packToGrid)) continue;
    defineLazyDerivedColumn(packCells, column.pack, () => deriveColumn(gridCells[column.grid], packToGrid));
  }
  return map;
}

function isExactDerivedColumn(current, source, packToGrid) {
  if (!Array.isArray(current) || !source || current.length !== packToGrid.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const gridCell = Number(packToGrid[index]);
    if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= source.length || !Object.is(current[index], source[gridCell])) return false;
  }
  return true;
}

function defineLazyDerivedColumn(target, key, derive) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      const value = derive();
      replaceWithValue(target, key, value);
      return value;
    },
    set(value) {
      replaceWithValue(target, key, value);
    }
  });
}

function deriveColumn(source, packToGrid) {
  return Array.from(packToGrid, gridCell => source?.[gridCell]);
}

function replaceWithValue(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value
  });
}
