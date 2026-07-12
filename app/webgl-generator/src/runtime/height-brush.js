export function getHeightBrushChanges(map, point, brush, stroke) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const originals = stroke?.originals;
  if (!cells?.p || !cells?.h || !Array.isArray(points) || !(originals instanceof Map)) return [];
  if (brush?.action === "fill") {
    if (stroke.fillApplied) return [];
    stroke.fillApplied = true;
    return getHeightFillChanges(map, point, brush, stroke);
  }

  const radius = Math.max(1, Number(brush?.radius) || 1);
  const radiusSq = radius * radius;
  const scope = normalizeBrushScope(brush?.scope);
  const affected = [];
  let nearest = null;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const scopeHeight = originals.has(gridCell) ? originals.get(gridCell) : cells.h[gridCell];
    if (!matchesBrushScope(scopeHeight, scope)) continue;
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    const distance = Math.sqrt(distanceSq);
    const factor = brush.falloff && brush.action !== "smooth" ? brushFalloff(distance, radius) : 1;
    const item = {gridCell, factor, distanceSq};
    affected.push(item);
    if (!nearest || distanceSq < nearest.distanceSq) nearest = item;
  }

  if (!affected.length) return [];
  if (brush.action === "smooth") {
    const average = affected.reduce((sum, item) => sum + cells.h[item.gridCell], 0) / affected.length;
    return affected.map(({gridCell}) => heightChange(cells, originals, gridCell, cells.h[gridCell] * 0.62 + average * 0.38)).filter(Boolean);
  }
  if (brush.action === "flatten") {
    if (!Number.isFinite(stroke.targetHeight)) stroke.targetHeight = cells.h[nearest.gridCell];
    const targetHeight = clampHeight(stroke.targetHeight);
    const strength = Math.max(1, Number(brush.strength) || 1);
    return affected.map(({gridCell, factor}) => {
      const current = cells.h[gridCell];
      const difference = targetHeight - current;
      const step = Math.sign(difference) * Math.min(Math.abs(difference), strength * factor);
      return heightChange(cells, originals, gridCell, current + step);
    }).filter(Boolean);
  }
  if (brush.action === "disrupt") {
    const strength = Math.max(1, Number(brush.strength) || 1);
    const seed = Number.isFinite(stroke.seed) ? Math.trunc(stroke.seed) : 0;
    const iteration = Math.max(0, Math.trunc(Number(stroke.iteration) || 0));
    stroke.iteration = iteration + 1;
    return affected.map(({gridCell, factor}) => {
      const delta = stableSignedNoise(gridCell, seed, iteration) * strength * factor;
      return heightChange(cells, originals, gridCell, cells.h[gridCell] + delta);
    }).filter(Boolean);
  }

  const strength = Math.max(1, Number(brush.strength) || 1);
  const delta = brush.action === "lower" ? -strength : strength;
  return affected.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + delta * factor)).filter(Boolean);
}

export function getHeightLineChanges(map, fromPoint, toPoint, brush, stroke) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const originals = stroke?.originals;
  if (!cells?.p || !cells?.h || !Array.isArray(points) || !(originals instanceof Map)) return [];

  const fromCell = findNearestGridCell(cells, points, fromPoint);
  const toCell = findNearestGridCell(cells, points, toPoint);
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const lengthSq = dx * dx + dy * dy;
  if (fromCell === null || toCell === null || fromCell === toCell || lengthSq < 1) {
    stroke.notice = "线段起点与终点过近，未执行。";
    return [];
  }

  const power = normalizeLinePower(brush?.linePower);
  if (!power) {
    stroke.notice = "线段增量不能为 0。";
    return [];
  }
  const width = normalizeLineWidth(brush?.lineWidth);
  const scope = normalizeBrushScope(brush?.scope);
  const maxCells = heightEditMaxCells(cells);
  const selection = [];
  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const scopeHeight = originals.has(gridCell) ? originals.get(gridCell) : cells.h[gridCell];
    if (!matchesBrushScope(scopeHeight, scope)) continue;
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const distance = pointToSegmentDistance(cellPoint[0], cellPoint[1], fromPoint, toPoint, lengthSq);
    if (distance > width) continue;
    selection.push({gridCell, factor: brush?.falloff ? brushFalloff(distance, width) : 1});
    if (selection.length > maxCells) {
      stroke.notice = `线段选区超过安全上限 ${maxCells} cells，未执行。`;
      return [];
    }
  }
  if (!selection.length) {
    stroke.notice = "线段没有命中当前作用范围内的 cells。";
    return [];
  }

  const changes = selection.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + power * factor)).filter(Boolean);
  stroke.notice = changes.length ? `已生成线段地形 ${changes.length} cells。` : "线段选区高度没有变化。";
  return changes;
}

export function inspectHeightFillTarget(map, gridCell, brush = {}) {
  const {selection, ...summary} = analyzeHeightFillTarget(map, gridCell, brush);
  return summary;
}

export function getGlobalHeightChanges(map, {action, scope: scopeValue, seed = 0} = {}) {
  const cells = map?.grid?.cells;
  if (!cells?.h || !Array.isArray(cells.c)) return [];
  if (action !== "smooth" && action !== "disrupt") return [];
  const scope = normalizeBrushScope(scopeValue);
  const heights = Array.from(cells.h, value => Number(value) || 0);
  const changes = [];

  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const before = heights[gridCell];
    if (!matchesBrushScope(before, scope)) continue;
    let next = before;
    if (action === "smooth") {
      const neighbors = (cells.c[gridCell] || []).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < heights.length && matchesBrushScope(heights[cell], scope));
      if (!neighbors.length) continue;
      const neighborMean = neighbors.reduce((sum, cell) => sum + heights[cell], 0) / neighbors.length;
      next = (before * 3 + neighborMean + 1.5) / 4;
    } else {
      if (before < 15) continue;
      next = before + 0.5 + stableSignedNoise(gridCell, Math.trunc(Number(seed) || 0), 0) * 2;
    }
    const after = clampHeightToScope(next, scope);
    if (after !== before) changes.push({gridCell, before, after});
  }

  return changes;
}

function getHeightFillChanges(map, point, brush, stroke) {
  const {cells, points} = map.grid;
  const start = findNearestGridCell(cells, points, point);
  const analysis = analyzeHeightFillTarget(map, start, brush);
  stroke.notice = analysis.notice;
  if (!analysis.valid) return [];
  const changes = applyConeToSelection(cells, analysis.selection, analysis.water, analysis.startHeight, brush.strength, stroke.originals);
  stroke.notice = changes.length ? `已锥形填充 ${changes.length} cells。` : "连通区域高度没有变化。";
  return changes;
}

function analyzeHeightFillTarget(map, gridCell, brush) {
  const cells = map?.grid?.cells;
  const maxCells = cells?.h ? heightEditMaxCells(cells) : 0;
  if (!cells?.h || !Array.isArray(cells.c)) return fillAnalysis({gridCell, maxCells, notice: "当前 grid 缺少连通邻接，无法执行填充。"});
  if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= cells.h.length) return fillAnalysis({gridCell: null, maxCells, notice: "当前指针没有命中可填充的 grid cell。"});

  const scope = normalizeBrushScope(brush.scope);
  const startHeight = cells.h[gridCell];
  const water = startHeight < 20;
  const tolerance = water ? 0 : normalizeFillTolerance(brush.fillTolerance);
  if (!matchesBrushScope(startHeight, scope)) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, notice: "落点不属于当前笔刷作用范围。"});
  if (water && !cells.b) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, notice: "当前 grid 缺少边界标记，无法确认水域是否封闭。"});

  const {selection, reachedBorder, exceededLimit} = collectFillSelection(cells, gridCell, water, startHeight, tolerance, maxCells);
  if (exceededLimit) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, notice: `连通区域超过安全上限 ${maxCells} cells，未执行填充。`});
  if (selection.length < 3) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, notice: "连通区域少于 3 cells，未执行填充。"});
  if (water && reachedBorder) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, reachedBorder, notice: "水域连通到地图边界，开放海域不能执行填充。"});
  const label = water ? "封闭水域" : `陆地高度 ${startHeight}±${tolerance}`;
  return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, reachedBorder, valid: true, notice: `可填充 ${selection.length} cells（${label}）。`});
}

function fillAnalysis({gridCell = null, startHeight = null, water = false, tolerance = 0, maxCells = 0, selection = [], reachedBorder = false, valid = false, notice = ""}) {
  return {
    gridCell,
    startHeight,
    terrain: water ? "water" : "land",
    water,
    tolerance,
    maxCells,
    selection,
    selectionCount: selection.length,
    reachedBorder,
    valid,
    notice
  };
}

function findNearestGridCell(cells, points, point) {
  let nearest = null;
  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (!nearest || distanceSq < nearest.distanceSq) nearest = {gridCell, distanceSq};
  }
  return nearest?.gridCell ?? null;
}

function collectFillSelection(cells, start, water, targetHeight, tolerance, maxCells) {
  const visited = new Uint8Array(cells.h.length);
  const stack = [start];
  const selection = [];
  let reachedBorder = false;
  while (stack.length) {
    const cell = stack.pop();
    if (visited[cell]) continue;
    visited[cell] = 1;
    const matches = water ? cells.h[cell] < 20 : Math.abs(cells.h[cell] - targetHeight) <= tolerance;
    if (!matches) continue;
    selection.push(cell);
    if (selection.length > maxCells) return {selection, reachedBorder, exceededLimit: true};
    if (cells.b?.[cell]) reachedBorder = true;
    for (const next of cells.c[cell] || []) {
      if (!visited[next]) stack.push(next);
    }
  }
  return {selection, reachedBorder, exceededLimit: false};
}

function normalizeFillTolerance(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(12, Math.round(numeric))) : 6;
}

function normalizeLinePower(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(-30, Math.min(30, Math.round(numeric))) : 12;
}

function normalizeLineWidth(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0.5, Math.min(96, numeric)) : 12;
}

function heightEditMaxCells(cells) {
  return Math.max(64, Math.min(5000, Math.floor(cells.h.length * 0.2)));
}

function pointToSegmentDistance(x, y, fromPoint, toPoint, lengthSq) {
  const projection = ((x - fromPoint.x) * (toPoint.x - fromPoint.x) + (y - fromPoint.y) * (toPoint.y - fromPoint.y)) / lengthSq;
  const t = Math.max(0, Math.min(1, projection));
  const closestX = fromPoint.x + (toPoint.x - fromPoint.x) * t;
  const closestY = fromPoint.y + (toPoint.y - fromPoint.y) * t;
  return Math.hypot(x - closestX, y - closestY);
}

function applyConeToSelection(cells, selection, water, targetHeight, strengthValue, originals) {
  const inSelection = new Uint8Array(cells.h.length);
  const edgeDistance = new Uint16Array(cells.h.length);
  for (const cell of selection) inSelection[cell] = 1;

  const queue = [];
  for (const cell of selection) {
    const neighbors = cells.c[cell] || [];
    if (!cells.b?.[cell] && !neighbors.some(next => !inSelection[next])) continue;
    inSelection[cell] = 2;
    queue.push(cell);
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const nextDistance = edgeDistance[cell] + 1;
    for (const next of cells.c[cell] || []) {
      if (inSelection[next] !== 1) continue;
      inSelection[next] = 2;
      edgeDistance[next] = nextDistance;
      queue.push(next);
    }
  }

  let maxDistance = 0;
  for (const cell of selection) maxDistance = Math.max(maxDistance, edgeDistance[cell]);
  const peakRise = Math.max(1, Number(strengthValue) || 1) * 3;
  const baseHeight = water ? 20 : targetHeight;
  return selection.map(cell => {
    const ratio = maxDistance ? edgeDistance[cell] / maxDistance : 1;
    const rise = Math.max(1, Math.round(peakRise * ratio));
    return heightChange(cells, originals, cell, Math.max(cells.h[cell], baseHeight + rise));
  }).filter(Boolean);
}

function normalizeBrushScope(scope) {
  return scope === "land" || scope === "water" ? scope : "all";
}

function matchesBrushScope(height, scope) {
  if (scope === "land") return height >= 20;
  if (scope === "water") return height < 20;
  return true;
}

function stableSignedNoise(gridCell, seed, iteration) {
  let value = Math.imul(gridCell + 1, 0x9e3779b1) ^ Math.imul(seed + 1, 0x85ebca6b) ^ Math.imul(iteration + 1, 0xc2b2ae35);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0xffffffff * 2 - 1;
}

function heightChange(cells, originals, gridCell, nextValue) {
  const after = clampHeight(nextValue);
  if (after === cells.h[gridCell]) return null;
  if (!originals.has(gridCell)) originals.set(gridCell, cells.h[gridCell]);
  return {
    gridCell,
    before: originals.get(gridCell),
    after
  };
}

function brushFalloff(distance, radius) {
  const t = Math.max(0, Math.min(1, 1 - distance / Math.max(1, radius)));
  return t * t * (3 - 2 * t);
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function clampHeightToScope(value, scope) {
  const height = clampHeight(value);
  if (scope === "land") return Math.max(20, height);
  if (scope === "water") return Math.min(19, height);
  return height;
}
