const HEIGHTMAP_TEMPLATES = {
  continents: {
    name: "大陆",
    waterRatio: 0.4345,
    distribution: [[0, 0], [0.4345, 19], [0.6806, 38], [0.8529, 55], [0.9591, 72], [0.992, 86], [1, 96]],
    template: `Hill 1 80-85 60-80 40-60
      Hill 1 80-85 20-30 40-60
      Hill 6-7 15-30 25-75 15-85
      Multiply 0.6 land 0 0
      Hill 8-10 5-10 15-85 20-80
      Range 1-2 30-60 5-15 25-75
      Range 1-2 30-60 80-95 25-75
      Range 0-3 30-60 80-90 20-80
      Strait 2 vertical 0 0
      Strait 1 vertical 0 0
      Smooth 3 0 0 0
      Trough 3-4 15-20 15-85 20-80
      Trough 3-4 5-10 45-55 45-55
      Pit 3-4 10-20 15-85 20-80
      Mask 4 0 0 0`
  },
  mediterranean: {
    name: "地中海",
    waterRatio: 0.42,
    distribution: [[0, 0], [0.42, 19], [0.63, 38], [0.8, 55], [0.94, 72], [0.99, 86], [1, 97]],
    template: `Range 4-6 30-80 0-100 0-10
      Range 4-6 30-80 0-100 90-100
      Hill 6-8 30-50 10-90 0-5
      Hill 6-8 30-50 10-90 95-100
      Multiply 0.9 land 0 0
      Mask -2 0 0 0
      Smooth 1 0 0 0
      Hill 2-3 30-70 0-5 20-80
      Hill 2-3 30-70 95-100 20-80
      Trough 3-6 40-50 0-100 0-10
      Trough 3-6 40-50 0-100 90-100`
  },
  highIsland: {
    name: "高山岛屿",
    waterRatio: 0.56,
    distribution: [[0, 0], [0.56, 19], [0.69, 38], [0.82, 55], [0.94, 72], [0.985, 88], [1, 100]],
    template: `Hill 1 90-100 65-75 47-53
      Add 7 all 0 0
      Hill 5-6 20-30 25-55 45-55
      Range 1 40-50 45-55 45-55
      Multiply 0.8 land 0 0
      Mask 3 0 0 0
      Smooth 2 0 0 0
      Trough 2-3 20-30 20-30 20-30
      Trough 2-3 20-30 60-80 70-80
      Hill 1 10-15 60-60 50-50
      Hill 1.5 13-16 15-20 20-75
      Range 1.5 30-40 15-85 30-40
      Range 1.5 30-40 15-85 60-70
      Pit 3-5 10-30 15-85 20-80`
  },
  lowIsland: {
    name: "平原岛屿",
    waterRatio: 0.52,
    distribution: [[0, 0], [0.52, 19], [0.78, 38], [0.94, 55], [0.99, 72], [1, 82]],
    template: `Hill 1 90-99 60-80 45-55
      Hill 1-2 20-30 10-30 10-90
      Smooth 2 0 0 0
      Hill 6-7 25-35 20-70 30-70
      Range 1 40-50 45-55 45-55
      Trough 2-3 20-30 15-85 20-30
      Trough 2-3 20-30 15-85 70-80
      Hill 1.5 10-15 5-15 20-80
      Hill 1 10-15 85-95 70-80
      Pit 5-7 15-25 15-85 20-80
      Multiply 0.4 20-100 0 0
      Mask 4 0 0 0`
  },
  peninsula: {
    name: "一侧大陆",
    waterRatio: 0.47,
    distribution: [[0, 0], [0.47, 19], [0.69, 38], [0.86, 55], [0.96, 72], [0.992, 86], [1, 95]],
    template: `Range 2-3 20-35 40-50 0-15
      Add 5 all 0 0
      Hill 1 90-100 10-90 0-5
      Add 13 all 0 0
      Hill 3-4 3-5 5-95 80-100
      Hill 1-2 3-5 5-95 40-60
      Trough 5-6 10-25 5-95 5-95
      Smooth 3 0 0 0
      Invert 0.4 both 0 0`
  },
  pangea: {
    name: "盘古大陆",
    waterRatio: 0.32,
    distribution: [[0, 0], [0.32, 19], [0.58, 38], [0.78, 55], [0.93, 72], [0.985, 86], [1, 96]],
    template: `Hill 1-2 25-40 15-50 0-10
      Hill 1-2 5-40 50-85 0-10
      Hill 1-2 25-40 50-85 90-100
      Hill 1-2 5-40 15-50 90-100
      Hill 8-12 20-40 20-80 48-52
      Smooth 2 0 0 0
      Multiply 0.7 land 0 0
      Trough 3-4 25-35 5-95 10-20
      Trough 3-4 25-35 5-95 80-90
      Range 5-6 30-40 10-90 35-65`
  },
  archipelago: {
    name: "群岛",
    waterRatio: 0.64,
    distribution: [[0, 0], [0.64, 19], [0.81, 38], [0.93, 55], [0.985, 72], [0.998, 86], [1, 94]],
    template: `Add 11 all 0 0
      Range 2-3 40-60 20-80 20-80
      Hill 5 15-20 10-90 30-70
      Hill 2 10-15 10-30 20-80
      Hill 2 10-15 60-90 20-80
      Smooth 3 0 0 0
      Trough 10 20-30 5-95 5-95
      Strait 2 vertical 0 0
      Strait 2 horizontal 0 0`
  }
};

export function createHeightmap(options) {
  const id = HEIGHTMAP_TEMPLATES[options.heightmapTemplate] ? options.heightmapTemplate : "continents";
  const template = HEIGHTMAP_TEMPLATES[id];
  return {
    seaLevel: 20,
    graphWidth: options.graphWidth,
    graphHeight: options.graphHeight,
    template: id,
    name: template.name,
    waterRatio: template.waterRatio,
    distribution: template.distribution,
    steps: parseTemplateSteps(template.template)
  };
}

export function applyHeightmap(heightmap, grid, layout, random) {
  const heights = new Array(grid.points.length).fill(0);
  const neighbors = createHeightNeighbors(layout);
  const context = {
    heightmap,
    grid,
    layout,
    random,
    heights,
    neighbors,
    ridgeCells: new Uint8Array(heights.length),
    ridgeInfluence: new Float32Array(heights.length),
    blobPower: getBlobPower(grid.points.length),
    linePower: getLinePower(grid.points.length)
  };

  for (const step of heightmap.steps) addStep(context, step);
  smooth(context, 2);
  rebalanceHeights(context, heightmap.waterRatio);
  accentuateRidges(context);
  matchHeightDistribution(context, heightmap.distribution);

  grid.cells.h = heights.map(height => clamp(Math.round(height), 0, 100));
}

function parseTemplateSteps(template) {
  return template
    .trim()
    .split("\n")
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts.length >= 2);
}

function addStep(context, [tool, a2, a3, a4, a5]) {
  if (tool === "Hill") return addHill(context, a2, a3, a4, a5);
  if (tool === "Pit") return addPit(context, a2, a3, a4, a5);
  if (tool === "Range") return addRange(context, a2, a3, a4, a5);
  if (tool === "Trough") return addTrough(context, a2, a3, a4, a5);
  if (tool === "Strait") return addStrait(context, a2, a3);
  if (tool === "Smooth") return smooth(context, Number.parseFloat(a2) || 1);
  if (tool === "Mask") return mask(context, Number.parseFloat(a2) || 1);
  if (tool === "Add") return modify(context, a3, Number.parseFloat(a2) || 0, 1);
  if (tool === "Multiply") return modify(context, a3, 0, Number.parseFloat(a2) || 1);
  if (tool === "Invert") return invert(context, Number.parseFloat(a2) || 0, a3 || "both");
}

function addHill(context, count, height, rangeX, rangeY) {
  repeat(context, count, () => {
    const change = new Array(context.heights.length).fill(0);
    const h = getNumberInRange(context.random, height);
    let start = getCellInRange(context, rangeX, rangeY);
    let limit = 0;

    while (context.heights[start] + h > 90 && limit < 50) {
      start = getCellInRange(context, rangeX, rangeY);
      limit++;
    }

    change[start] = h;
    const queue = [start];

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      for (const neighbor of context.neighbors[cell]) {
        if (change[neighbor]) continue;
        change[neighbor] = change[cell] ** context.blobPower * context.random.range(0.9, 1.1);
        if (change[neighbor] > 1) queue.push(neighbor);
      }
    }

    for (let cell = 0; cell < context.heights.length; cell++) {
      context.heights[cell] = clamp(context.heights[cell] + change[cell], 0, 100);
    }
  });
}

function addPit(context, count, height, rangeX, rangeY) {
  repeat(context, count, () => {
    const used = new Uint8Array(context.heights.length);
    let start = getCellInRange(context, rangeX, rangeY);
    let h = getNumberInRange(context.random, height);
    let limit = 0;

    while (context.heights[start] < 20 && limit < 50) {
      start = getCellInRange(context, rangeX, rangeY);
      limit++;
    }

    const queue = [start];
    used[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      h = h ** context.blobPower * context.random.range(0.9, 1.1);
      if (h < 1) break;

      for (const neighbor of context.neighbors[cell]) {
        if (used[neighbor]) continue;
        context.heights[neighbor] = clamp(context.heights[neighbor] - h * context.random.range(0.9, 1.1), 0, 100);
        used[neighbor] = 1;
        queue.push(neighbor);
      }
    }
  });
}

function addRange(context, count, height, rangeX, rangeY) {
  repeat(context, count, () => {
    const start = getCellInRange(context, rangeX, rangeY);
    const end = getRangeEndCell(context, start, context.heightmap.graphWidth * 0.58, true);
    const ridge = getPath(context, start, end, 0.15);
    const used = new Uint8Array(context.heights.length);
    let frontier = ridge.slice();
    let h = getNumberInRange(context.random, height);
    let spread = 0;

    for (const cell of ridge) used[cell] = 1;
    markRidgeInfluence(context, ridge);

    while (frontier.length) {
      const currentFrontier = frontier;
      frontier = [];
      spread++;

      for (const cell of currentFrontier) {
        context.heights[cell] = clamp(context.heights[cell] + h * context.random.range(0.85, 1.15), 0, 100);
      }

      h = h ** context.linePower - 1;
      if (h < 2) break;

      for (const cell of currentFrontier) {
        for (const neighbor of context.neighbors[cell]) {
          if (used[neighbor]) continue;
          used[neighbor] = 1;
          frontier.push(neighbor);
        }
      }
    }

    addProminences(context, ridge, spread);
  });
}

function addTrough(context, count, height, rangeX, rangeY) {
  repeat(context, count, () => {
    const start = getLandCellInRange(context, rangeX, rangeY);
    const end = getRangeEndCell(context, start, context.heightmap.graphWidth / 2);
    const trench = getPath(context, start, end, 0.2);
    const used = new Uint8Array(context.heights.length);
    let frontier = trench.slice();
    let h = getNumberInRange(context.random, height);

    for (const cell of trench) used[cell] = 1;

    while (frontier.length) {
      const currentFrontier = frontier;
      frontier = [];

      for (const cell of currentFrontier) {
        context.heights[cell] = clamp(context.heights[cell] - h * context.random.range(0.85, 1.15), 0, 100);
      }

      h = h ** context.linePower - 1;
      if (h < 2) break;

      for (const cell of currentFrontier) {
        for (const neighbor of context.neighbors[cell]) {
          if (used[neighbor]) continue;
          used[neighbor] = 1;
          frontier.push(neighbor);
        }
      }
    }
  });
}

function addStrait(context, width, direction = "vertical") {
  const desiredWidth = Math.min(Math.max(1, Math.round(getNumberInRange(context.random, width))), context.layout.columns / 3);
  const vertical = direction === "vertical";
  const startX = vertical ? context.random.range(context.heightmap.graphWidth * 0.3, context.heightmap.graphWidth * 0.7) : 5;
  const startY = vertical ? 5 : context.random.range(context.heightmap.graphHeight * 0.3, context.heightmap.graphHeight * 0.7);
  const endX = vertical
    ? context.heightmap.graphWidth - startX - context.heightmap.graphWidth * 0.1 + context.random.range(0, context.heightmap.graphWidth * 0.2)
    : context.heightmap.graphWidth - 5;
  const endY = vertical
    ? context.heightmap.graphHeight - 5
    : context.heightmap.graphHeight - startY - context.heightmap.graphHeight * 0.1 + context.random.range(0, context.heightmap.graphHeight * 0.2);

  let frontier = getPath(context, getClosestCell(context, startX, startY), getClosestCell(context, endX, endY), 0.2);
  const used = new Uint8Array(context.heights.length);

  for (let widthStep = 0; widthStep < desiredWidth; widthStep++) {
    const currentFrontier = frontier;
    frontier = [];
    const exponent = 0.86 - widthStep * 0.03;

    for (const cell of currentFrontier) {
      for (const neighbor of context.neighbors[cell]) {
        if (used[neighbor]) continue;
        used[neighbor] = 1;
        frontier.push(neighbor);
        context.heights[neighbor] = clamp(context.heights[neighbor] ** exponent, 0, 100);
      }
    }
  }
}

function addProminences(context, ridge, spread) {
  for (let index = 0; index < ridge.length; index += 6) {
    let current = ridge[index];
    for (let step = 0; step < spread; step++) {
      const lowest = context.neighbors[current].reduce((best, neighbor) =>
        context.heights[neighbor] < context.heights[best] ? neighbor : best
      );
      context.heights[lowest] = (context.heights[current] * 2 + context.heights[lowest]) / 3;
      current = lowest;
    }
  }
}

function modify(context, range, add, multiplier) {
  const limits = getHeightRange(range);
  for (let cell = 0; cell < context.heights.length; cell++) {
    const height = context.heights[cell];
    if (height < limits.min || height > limits.max) continue;
    let next = height;
    if (add) next = limits.isLand ? Math.max(next + add, 20) : next + add;
    if (multiplier !== 1) next = limits.isLand ? (next - 20) * multiplier + 20 : next * multiplier;
    context.heights[cell] = clamp(next, 0, 100);
  }
}

function getHeightRange(range) {
  if (range === "land") return {min: 20, max: 100, isLand: true};
  if (range === "all") return {min: 0, max: 100, isLand: false};
  const [minText, maxText] = String(range).split("-");
  const min = Number.parseFloat(minText);
  const max = Number.parseFloat(maxText);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 100,
    isLand: Number.isFinite(min) && min >= 20
  };
}

function smooth(context, factor = 2) {
  const next = context.heights.slice();
  for (let cell = 0; cell < context.heights.length; cell++) {
    const values = [context.heights[cell], ...context.neighbors[cell].map(neighbor => context.heights[neighbor])];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    next[cell] = clamp((context.heights[cell] * (factor - 1) + mean) / factor, 0, 100);
  }
  context.heights.splice(0, context.heights.length, ...next);
}

function mask(context, power = 1) {
  const factor = Math.abs(power) || 1;
  for (let cell = 0; cell < context.grid.points.length; cell++) {
    const [x, y] = context.grid.points[cell];
    const nx = (2 * x) / context.heightmap.graphWidth - 1;
    const ny = (2 * y) / context.heightmap.graphHeight - 1;
    let distance = (1 - nx * nx) * (1 - ny * ny);
    if (power < 0) distance = 1 - distance;
    const masked = context.heights[cell] * distance;
    context.heights[cell] = clamp((context.heights[cell] * (factor - 1) + masked) / factor, 0, 100);
  }
}

function invert(context, probability, axes) {
  if (probability > 0 && probability < 1 && context.random.next() > probability) return;
  const invertX = axes !== "y";
  const invertY = axes !== "x";
  const next = new Array(context.heights.length);

  for (let cell = 0; cell < context.heights.length; cell++) {
    const column = cell % context.layout.columns;
    const row = Math.floor(cell / context.layout.columns);
    const nextColumn = invertX ? context.layout.columns - column - 1 : column;
    const nextRow = invertY ? context.layout.rows - row - 1 : row;
    next[cell] = context.heights[nextRow * context.layout.columns + nextColumn];
  }

  context.heights.splice(0, context.heights.length, ...next);
}

function rebalanceHeights(context, targetWaterRatio) {
  const sorted = context.heights.slice().sort((a, b) => a - b);
  const seaIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * targetWaterRatio)));
  const offset = sorted[seaIndex] - 19;

  for (let cell = 0; cell < context.heights.length; cell++) {
    let height = context.heights[cell] - offset;
    if (height >= 20) {
      const land = height - 20;
      const ridgeInfluence = context.ridgeInfluence[cell] || 0;
      height = 20 + land * 1.18 + Math.pow(clamp(land / 70, 0, 1), 1.7) * 8;
      if (height > 72) height = 72 + (height - 72) * (0.3 + ridgeInfluence * 0.7);
      if (height > 90) height = 90 + (height - 90) * 0.35;
    }
    context.heights[cell] = clamp(height, 0, 100);
  }
}

function markRidgeInfluence(context, ridge) {
  for (const cell of ridge) {
    context.ridgeCells[cell] = 1;
    context.ridgeInfluence[cell] = Math.max(context.ridgeInfluence[cell], 1);

    for (const neighbor of context.neighbors[cell]) {
      context.ridgeInfluence[neighbor] = Math.max(context.ridgeInfluence[neighbor], 0.45);
      for (const next of context.neighbors[neighbor]) {
        context.ridgeInfluence[next] = Math.max(context.ridgeInfluence[next], 0.16);
      }
    }
  }
}

function accentuateRidges(context) {
  const boost = new Array(context.heights.length).fill(0);

  for (let cell = 0; cell < context.ridgeCells.length; cell++) {
    if (!context.ridgeCells[cell] || context.heights[cell] < 52) continue;
    boost[cell] = Math.max(boost[cell], 5.6);

    for (const neighbor of context.neighbors[cell]) {
      boost[neighbor] = Math.max(boost[neighbor], 2.2);
      for (const next of context.neighbors[neighbor]) {
        boost[next] = Math.max(boost[next], 0.8);
      }
    }
  }

  for (let cell = 0; cell < context.heights.length; cell++) {
    if (context.heights[cell] < 20 || !boost[cell]) continue;
    const terrain = clamp((context.heights[cell] - 20) / 70, 0, 1);
    context.heights[cell] = clamp(context.heights[cell] + boost[cell] * (0.4 + terrain * 0.65), 0, 100);
  }

  smooth(context, 8);
}

function matchHeightDistribution(context, stops) {
  const order = context.heights
    .map((height, cell) => ({height, cell}))
    .sort((a, b) => a.height - b.height);
  const last = Math.max(1, order.length - 1);

  for (let rank = 0; rank < order.length; rank++) {
    const percentile = rank / last;
    const value = sampleDistributionStops(stops, percentile);
    context.heights[order[rank].cell] = value;
  }
}

function sampleDistributionStops(stops, percentile) {
  for (let index = 1; index < stops.length; index++) {
    const [previousPercentile, previousHeight] = stops[index - 1];
    const [nextPercentile, nextHeight] = stops[index];
    if (percentile > nextPercentile) continue;
    const local = (percentile - previousPercentile) / Math.max(0.0001, nextPercentile - previousPercentile);
    return previousHeight + (nextHeight - previousHeight) * local;
  }

  return stops[stops.length - 1][1];
}

function getPath(context, start, end, shortcutChance) {
  const path = [start];
  const used = new Uint8Array(context.heights.length);
  const points = context.grid.points;
  let current = start;
  used[current] = 1;

  while (current !== end && path.length < context.heights.length) {
    let best = -1;
    let bestScore = Infinity;

    for (const neighbor of context.neighbors[current]) {
      if (used[neighbor]) continue;
      const dx = points[end][0] - points[neighbor][0];
      const dy = points[end][1] - points[neighbor][1];
      let score = dx * dx + dy * dy;
      if (context.random.next() < shortcutChance) score *= 0.5;
      if (score < bestScore) {
        best = neighbor;
        bestScore = score;
      }
    }

    if (best === -1) break;
    current = best;
    used[current] = 1;
    path.push(current);
  }

  return path;
}

function getRangeEndCell(context, start, maxDistance, directional = false) {
  const [sx, sy] = context.grid.points[start];
  let end = start;
  let distance = 0;
  let limit = 0;

  while ((distance < context.heightmap.graphWidth / 7 || distance > maxDistance) && limit < 50) {
    let minX = context.heightmap.graphWidth * 0.1;
    let maxX = context.heightmap.graphWidth * 0.9;
    if (directional && sx < context.heightmap.graphWidth * 0.35) minX = context.heightmap.graphWidth * 0.35;
    if (directional && sx > context.heightmap.graphWidth * 0.65) maxX = context.heightmap.graphWidth * 0.65;
    const x = context.random.range(minX, maxX);
    const y = context.random.range(context.heightmap.graphHeight * 0.15, context.heightmap.graphHeight * 0.85);
    end = getClosestCell(context, x, y);
    const [ex, ey] = context.grid.points[end];
    distance = Math.abs(ex - sx) + Math.abs(ey - sy);
    limit++;
  }

  return end;
}

function getCellInRange(context, rangeX, rangeY) {
  const x = getPointInRange(context.random, rangeX, context.heightmap.graphWidth);
  const y = getPointInRange(context.random, rangeY, context.heightmap.graphHeight);
  return getClosestCell(context, x, y);
}

function getLandCellInRange(context, rangeX, rangeY) {
  let cell = getCellInRange(context, rangeX, rangeY);
  let limit = 0;
  while (context.heights[cell] < 20 && limit < 50) {
    cell = getCellInRange(context, rangeX, rangeY);
    limit++;
  }
  return cell;
}

function getClosestCell(context, x, y) {
  const column = clamp(Math.round((x / context.heightmap.graphWidth) * (context.layout.columns - 1)), 0, context.layout.columns - 1);
  const row = clamp(Math.round((y / context.heightmap.graphHeight) * (context.layout.rows - 1)), 0, context.layout.rows - 1);
  return row * context.layout.columns + column;
}

function createHeightNeighbors(layout) {
  const neighbors = [];
  for (let cell = 0; cell < layout.columns * layout.rows; cell++) {
    const list = [];
    const column = cell % layout.columns;
    const row = Math.floor(cell / layout.columns);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextColumn >= layout.columns || nextRow < 0 || nextRow >= layout.rows) continue;
        list.push(nextRow * layout.columns + nextColumn);
      }
    }
    neighbors.push(list);
  }
  return neighbors;
}

function repeat(context, count, callback) {
  const desired = getNumberInRange(context.random, count);
  for (let index = 0; index < desired; index++) callback();
}

function getPointInRange(random, range, length) {
  const value = String(range);
  const [minText, maxText] = value.split("-");
  const min = (Number.parseFloat(minText) || 0) / 100;
  const max = (Number.parseFloat(maxText) || Number.parseFloat(minText) || 0) / 100;
  return random.range(min * length, max * length);
}

function getNumberInRange(random, range) {
  const value = String(range);
  const [minText, maxText] = value.split("-");
  const min = Number.parseFloat(minText) || 0;
  const max = Number.parseFloat(maxText);
  return Number.isFinite(max) ? random.range(min, max) : min;
}

function getBlobPower(cells) {
  if (cells >= 90000) return 0.9973;
  if (cells >= 50000) return 0.994;
  if (cells >= 20000) return 0.99;
  if (cells >= 10000) return 0.98;
  if (cells >= 5000) return 0.97;
  return 0.95;
}

function getLinePower(cells) {
  if (cells >= 90000) return 0.92;
  if (cells >= 50000) return 0.86;
  if (cells >= 20000) return 0.82;
  if (cells >= 10000) return 0.81;
  if (cells >= 5000) return 0.79;
  return 0.77;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
