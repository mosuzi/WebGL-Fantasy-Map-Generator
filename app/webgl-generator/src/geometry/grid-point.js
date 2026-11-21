// 同一套多边形与细分格查找用于地图拾取和城镇落点。
export function locateGridPoint(grid, x, y, bounds = grid.metadata) {
  const {columns, rows} = grid.metadata;
  if (!columns || !rows || !bounds?.graphWidth || !bounds?.graphHeight) return {cell: null, candidates: 0};
  const column = Math.max(0, Math.min(columns - 1, Math.floor(x / bounds.graphWidth * columns)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(y / bounds.graphHeight * rows)));
  const candidates = expandRefinedCandidateCells(grid, candidateCells(column, row, columns, rows));
  const cell = candidates.find(id => pointInGridCell(grid, id, x, y)) ?? nearestCandidateCell(grid, candidates, x, y);
  return {cell, candidates: candidates.length};
}

function nearestCandidateCell(grid, candidates, x, y) {
  let nearest = null;
  let distance = Infinity;
  for (const cell of candidates) {
    const point = grid?.points?.[cell];
    if (!point) continue;
    const next = (Number(point[0]) - x) ** 2 + (Number(point[1]) - y) ** 2;
    if (next >= distance) continue;
    nearest = cell;
    distance = next;
  }
  return nearest;
}

function expandRefinedCandidateCells(grid, sourceCandidates) {
  const children = grid?.refinement?.children;
  if (!children?.length) return sourceCandidates;
  const expanded = [];
  const seen = new Set();
  for (const mother of sourceCandidates) {
    const group = children[mother];
    const candidates = group?.length ? group : [mother];
    for (const value of candidates) {
      const cell = Number(value);
      if (!Number.isInteger(cell) || cell < 0 || seen.has(cell)) continue;
      seen.add(cell);
      expanded.push(cell);
    }
  }
  return expanded;
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

export function pointInGridCell(grid, cell, x, y) {
  const vertexIds = grid?.cells?.v?.[cell];
  const vertices = grid?.vertices?.p;
  if (!vertexIds || vertexIds.length < 3 || !vertices) return false;
  let inside = false;
  for (let index = 0, previous = vertexIds.length - 1; index < vertexIds.length; previous = index++) {
    const a = vertices[vertexIds[index]];
    const b = vertices[vertexIds[previous]];
    if (!a || !b) return false;
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}
