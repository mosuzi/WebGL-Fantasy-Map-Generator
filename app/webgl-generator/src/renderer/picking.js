export function pickGridCell(map, worldX, worldY) {
  if (!map || worldX < 0 || worldY < 0 || worldX > map.metadata.graphWidth || worldY > map.metadata.graphHeight) {
    return null;
  }

  const {columns, rows} = map.grid.metadata;
  const column = Math.max(0, Math.min(columns - 1, Math.floor((worldX / map.metadata.graphWidth) * columns)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((worldY / map.metadata.graphHeight) * rows)));
  const candidates = candidateCells(column, row, columns, rows);

  for (const cell of candidates) {
    if (pointInCell(map, cell, worldX, worldY)) return buildPickResult(map, cell, worldX, worldY, candidates.length);
  }

  return {
    gridCell: null,
    packCell: null,
    worldX,
    worldY,
    candidates: candidates.length
  };
}

function candidateCells(column, row, columns, rows) {
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      cells.push(nextRow * columns + nextColumn);
    }
  }
  return cells;
}

function pointInCell(map, cell, x, y) {
  const vertexIds = map.grid.cells.v[cell];
  let inside = false;
  for (let index = 0, previous = vertexIds.length - 1; index < vertexIds.length; previous = index++) {
    const a = map.grid.vertices.p[vertexIds[index]];
    const b = map.grid.vertices.p[vertexIds[previous]];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function buildPickResult(map, gridCell, worldX, worldY, candidates) {
  const packCell = map.grid.cells.pack[gridCell];
  const featureId = map.pack.cells.f[packCell];
  const feature = map.features.features[featureId];
  return {
    gridCell,
    packCell,
    featureId,
    featureType: feature?.type || "unknown",
    height: map.grid.cells.h[gridCell],
    temperature: map.grid.cells.temp[gridCell],
    precipitation: map.grid.cells.prec[gridCell],
    biome: map.climate.biomes[map.grid.cells.biome[gridCell]]?.name || "unknown",
    culture: map.society.cultures[map.grid.cells.culture[gridCell]]?.name || "unknown",
    religion: map.society.religions[map.grid.cells.religion[gridCell]]?.name || "unknown",
    state: map.politics.states[map.grid.cells.state[gridCell]]?.name || "none",
    province: map.politics.provinces[map.grid.cells.province[gridCell]]?.name || "none",
    region: map.politics.regions[map.grid.cells.region[gridCell]]?.name || "none",
    city: map.settlements.cities[map.grid.cells.burg[gridCell]]?.name || "none",
    population: map.grid.cells.pop[gridCell] || 0,
    worldX,
    worldY,
    candidates
  };
}
