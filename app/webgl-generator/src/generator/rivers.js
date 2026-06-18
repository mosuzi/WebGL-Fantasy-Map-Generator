const SOURCE_LIMIT = 16;
const MIN_SOURCE_HEIGHT = 46;
const MIN_CHANNEL_FLUX = 240;
const MIN_RIVER_LENGTH = 5;
const MAX_TRACE_STEPS = 220;

export function buildRivers(grid, features) {
  const flow = buildFlowField(grid, features);
  const sources = selectSources(grid, flow);
  const rivers = [];
  const assigned = new Map();

  for (const source of sources) {
    const river = traceRiver(source, grid, features, flow, assigned, rivers.length + 1);
    if (river.cells.length >= MIN_RIVER_LENGTH) {
      rivers.push(river);
      for (const cell of river.cells) assigned.set(cell, river.id);
    }
  }

  return {
    rivers,
    metadata: {
      rivers: rivers.length,
      segments: rivers.reduce((sum, river) => sum + Math.max(0, river.points.length - 1), 0),
      sources: sources.length,
      longest: rivers.reduce((max, river) => Math.max(max, river.cells.length), 0),
      maxFlux: Math.round(Math.max(...flow.flux)),
      flowModel: "acyclic-flux-downhill"
    }
  };
}

function buildFlowField(grid, features) {
  const cellCount = grid.points.length;
  const downstream = new Array(cellCount).fill(null);
  const flux = new Array(cellCount).fill(0);
  const effectiveHeight = resolveDepressions(grid, features);
  const order = Array.from({length: cellCount}, (_, cell) => cell).sort((a, b) => effectiveHeight[b] - effectiveHeight[a]);

  for (const cell of order) {
    const feature = features.features[grid.cells.f[cell]];
    if (feature?.type !== "land") continue;
    flux[cell] += Math.max(1, grid.cells.prec?.[cell] ?? 40) + Math.max(0, grid.cells.h[cell] - 24) * 1.5;
    const next = chooseDownstream(cell, grid, features, effectiveHeight);
    downstream[cell] = next;
    if (next !== null) flux[next] += flux[cell] * 0.985;
  }

  return {downstream, flux, effectiveHeight};
}

function resolveDepressions(grid, features) {
  const effective = grid.cells.h.map(height => height);
  const land = Array.from({length: grid.points.length}, (_, cell) => cell)
    .filter(cell => features.features[grid.cells.f[cell]]?.type === "land")
    .sort((a, b) => effective[a] - effective[b]);

  for (let iteration = 0; iteration < 8; iteration++) {
    let changed = 0;
    for (const cell of land) {
      if (isBorderCell(cell, grid.metadata)) continue;
      const neighbors = getNeighbors(cell, grid.metadata);
      if (neighbors.some(neighbor => features.features[grid.cells.f[neighbor]]?.type !== "land")) continue;
      const minNeighbor = Math.min(...neighbors.map(neighbor => effective[neighbor]));
      if (effective[cell] <= minNeighbor) {
        effective[cell] = minNeighbor + 0.12;
        changed++;
      }
    }
    if (!changed) break;
  }

  return effective;
}

function chooseDownstream(cell, grid, features, effectiveHeight) {
  const currentHeight = effectiveHeight[cell];
  const currentPoint = grid.points[cell];
  const neighbors = getNeighbors(cell, grid.metadata)
    .map(neighbor => {
      const feature = features.features[grid.cells.f[neighbor]];
      const waterBonus = feature?.type === "ocean" || feature?.type === "lake" ? -18 : 0;
      const distancePenalty = Math.hypot(currentPoint[0] - grid.points[neighbor][0], currentPoint[1] - grid.points[neighbor][1]) * 0.012;
      return {
        cell: neighbor,
        height: effectiveHeight[neighbor],
        score: effectiveHeight[neighbor] + waterBonus + distancePenalty
      };
    })
    .sort((a, b) => a.score - b.score);

  const water = neighbors.find(neighbor => {
    const feature = features.features[grid.cells.f[neighbor.cell]];
    return feature?.type === "ocean" || feature?.type === "lake";
  });
  if (water && grid.cells.h[cell] < 38) return water.cell;

  const downhill = neighbors.find(neighbor => neighbor.height < currentHeight - 0.001);
  if (downhill) return downhill.cell;

  return null;
}

function selectSources(grid, flow) {
  const channelCells = new Set(flow.flux.map((value, cell) => (value >= MIN_CHANNEL_FLUX ? cell : -1)).filter(cell => cell >= 0));

  return grid.points
    .map((point, cell) => ({
      cell,
      score: flow.flux[cell] * 1.2 + grid.cells.h[cell] * 2 + (grid.cells.prec?.[cell] || 0)
    }))
    .filter(source => channelCells.has(source.cell))
    .filter(source => grid.cells.h[source.cell] >= MIN_SOURCE_HEIGHT)
    .filter(source => estimateFlowLength(source.cell, flow) >= MIN_RIVER_LENGTH)
    .sort((a, b) => b.score - a.score)
    .filter((source, index, list) => {
      const column = source.cell % grid.metadata.columns;
      const row = Math.floor(source.cell / grid.metadata.columns);
      return !list.slice(0, index).some(other => {
        const otherColumn = other.cell % grid.metadata.columns;
        const otherRow = Math.floor(other.cell / grid.metadata.columns);
        return Math.abs(column - otherColumn) + Math.abs(row - otherRow) < 16;
      });
    })
    .slice(0, SOURCE_LIMIT)
    .map(source => source.cell);
}

function estimateFlowLength(source, flow) {
  const visited = new Set([source]);
  let current = source;
  for (let length = 1; length < MAX_TRACE_STEPS; length++) {
    const next = flow.downstream[current];
    if (next === null || visited.has(next)) return length;
    visited.add(next);
    current = next;
  }
  return MAX_TRACE_STEPS;
}

function traceRiver(source, grid, features, flow, assigned, riverId) {
  const cells = [source];
  const points = [grid.points[source]];
  const visited = new Set([source]);
  let current = source;
  let parent = 0;

  for (let step = 0; step < MAX_TRACE_STEPS; step++) {
    const next = flow.downstream[current];
    if (next === null || visited.has(next)) break;

    const assignedRiver = assigned.get(next);
    if (assignedRiver && assignedRiver !== riverId) {
      parent = assignedRiver;
      break;
    }

    cells.push(next);
    points.push(grid.points[next]);
    visited.add(next);

    const feature = features.features[grid.cells.f[next]];
    if (feature?.type === "ocean" || feature?.type === "lake" || isBorderCell(next, grid.metadata)) break;
    current = next;
  }

  return {
    id: riverId,
    cells,
    points: simplifyRiverPoints(points),
    source,
    mouth: cells[cells.length - 1],
    parent,
    flux: Math.round(flow.flux[cells[cells.length - 1]] || flow.flux[source])
  };
}

function simplifyRiverPoints(points) {
  if (points.length <= 3) return points;
  const simplified = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const angle = turnAngle(previous, current, next);
    const distance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (angle > 0.18 || distance > 18) simplified.push(current);
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

function turnAngle(a, b, c) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const bcx = c[0] - b[0];
  const bcy = c[1] - b[1];
  const cross = Math.abs(abx * bcy - aby * bcx);
  const dot = abx * bcx + aby * bcy;
  return Math.atan2(cross, dot);
}

function getNeighbors(cell, metadata) {
  const {columns, rows} = metadata;
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      neighbors.push(nextRow * columns + nextColumn);
    }
  }
  return neighbors;
}

function isBorderCell(cell, metadata) {
  const column = cell % metadata.columns;
  const row = Math.floor(cell / metadata.columns);
  return column === 0 || row === 0 || column === metadata.columns - 1 || row === metadata.rows - 1;
}
