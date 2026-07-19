export function inspectHeightSelectionSmoothing(map, options = {}) {
  const {changes, ...inspection} = analyzeHeightSelectionSmoothing(map, options);
  return inspection;
}

export function getHeightSelectionSmoothingChanges(map, options = {}) {
  return analyzeHeightSelectionSmoothing(map, options).changes;
}

function analyzeHeightSelectionSmoothing(map, {cellIds = [], smoothness = 0} = {}) {
  const heights = map?.grid?.cells?.h;
  const adjacency = map?.grid?.cells?.c;
  const amount = normalizeSmoothness(smoothness);
  const selected = new Set(uniqueCells(cellIds, heights?.length || 0));
  const base = {
    valid: false,
    smoothness: amount,
    selectedCount: selected.size,
    transitionCount: 0,
    changeCount: 0,
    raisedCount: 0,
    loweredCount: 0,
    beforeRange: null,
    afterRange: null,
    notice: "",
    changes: []
  };
  if (!heights?.length || !Array.isArray(adjacency)) return {...base, notice: "当前地图缺少高度或邻接数据。"};
  if (!selected.size) return {...base, notice: "请先在地图上选择需要平滑的陆地范围。"};
  if ([...selected].some(cell => Number(heights[cell]) < 20)) return {...base, notice: "平滑范围只能包含陆地，请重新选择。"};

  const candidates = new Map();
  for (const cell of selected) {
    const neighbors = validNeighbors(adjacency[cell], heights.length);
    const boundary = neighbors.some(neighbor => !selected.has(neighbor));
    candidates.set(cell, boundary ? "boundary" : "interior");
    for (const neighbor of neighbors) {
      if (!selected.has(neighbor) && sameSurface(heights[cell], heights[neighbor])) candidates.set(neighbor, "transition");
    }
  }

  const changes = [];
  let transitionCount = 0;
  let raisedCount = 0;
  let loweredCount = 0;
  let minBefore = Infinity;
  let maxBefore = -Infinity;
  let minAfter = Infinity;
  let maxAfter = -Infinity;
  for (const [cell, role] of candidates) {
    const before = Number(heights[cell]) || 0;
    const neighbors = validNeighbors(adjacency[cell], heights.length)
      .filter(neighbor => sameSurface(before, heights[neighbor]));
    if (!neighbors.length) continue;
    if (role === "transition") transitionCount += 1;
    const neighborMean = neighbors.reduce((sum, neighbor) => sum + Number(heights[neighbor] || 0), 0) / neighbors.length;
    const factor = smoothingFactor(role, amount);
    const localValues = [before, ...neighbors.map(neighbor => Number(heights[neighbor]) || 0)];
    const localMin = Math.min(...localValues);
    const localMax = Math.max(...localValues);
    const target = clamp(neighborMean, localMin, localMax);
    const after = clampHeightToSurface(Math.round(before + (target - before) * factor), before);
    minBefore = Math.min(minBefore, before);
    maxBefore = Math.max(maxBefore, before);
    minAfter = Math.min(minAfter, after);
    maxAfter = Math.max(maxAfter, after);
    if (after === before) continue;
    if (after > before) raisedCount += 1;
    else loweredCount += 1;
    changes.push({gridCell: cell, before, after});
  }

  const inspection = {
    ...base,
    valid: changes.length > 0,
    transitionCount,
    changeCount: changes.length,
    raisedCount,
    loweredCount,
    beforeRange: minBefore === Infinity ? null : [minBefore, maxBefore],
    afterRange: minAfter === Infinity ? null : [minAfter, maxAfter],
    changes
  };
  inspection.notice = changes.length
    ? `将平滑 ${changes.length} 处陆地，其中 ${transitionCount} 处用于边缘过渡。`
    : "所选范围已经足够平滑，无需修改。";
  return inspection;
}

function smoothingFactor(role, smoothness) {
  if (role === "interior") return 0.68 * smoothness;
  if (role === "transition") return 0.12 + 0.18 * smoothness;
  return 0.28 + 0.52 * smoothness;
}

function uniqueCells(values, count) {
  return [...new Set((values || []).map(Number).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < count))].sort((a, b) => a - b);
}

function validNeighbors(values, count) {
  return [...new Set((values || []).map(Number).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < count))];
}

function sameSurface(left, right) {
  return (Number(left) < 20) === (Number(right) < 20);
}

function clampHeightToSurface(value, sourceHeight) {
  return Number(sourceHeight) < 20 ? clamp(value, 0, 19) : clamp(value, 20, 100);
}

function normalizeSmoothness(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(clamp(numeric, 0, 1) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
