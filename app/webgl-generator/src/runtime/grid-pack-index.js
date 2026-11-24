// 多个细分格可能落在同一网格里。重新剖分会替换映射列，旧索引随旧列回收。
const indexes = new WeakMap();

export function packCellsByGrid(map, legacyKey) {
  const mapping = map?.pack?.cells?.g;
  if (!mapping) return null;
  let byGrid = indexes.get(mapping);
  if (!byGrid) {
    byGrid = new Map();
    for (let cell = 0; cell < mapping.length; cell++) {
      const gridCell = Number(mapping[cell]);
      if (!Number.isInteger(gridCell) || gridCell < 0) continue;
      if (!byGrid.has(gridCell)) byGrid.set(gridCell, []);
      byGrid.get(gridCell).push(cell);
    }
    indexes.set(mapping, byGrid);
  }
  if (legacyKey && Object.hasOwn(map, legacyKey) && map[legacyKey] !== byGrid) {
    Object.defineProperty(map, legacyKey, {value: byGrid, configurable: true, writable: true, enumerable: false});
  }
  return byGrid;
}

export function packCellsForGrid(map, gridCells) {
  const index = packCellsByGrid(map);
  const result = [];
  for (const gridCell of new Set(gridCells)) {
    for (const cell of index?.get(gridCell) || []) result.push(cell);
  }
  return result.sort((a, b) => a - b);
}
