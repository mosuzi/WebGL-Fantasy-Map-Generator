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
    cellsDesired: options.cellsTarget,
    template: id,
    name: template.name,
    waterRatio: template.waterRatio,
    distribution: template.distribution,
    steps: parseTemplateSteps(template.template)
  };
}

export function createSampledHeightmap(options, source) {
  const descriptor = {
    seaLevel: 20,
    graphWidth: options.graphWidth,
    graphHeight: options.graphHeight,
    cellsDesired: options.cellsTarget,
    template: source.template || "grayscale-import",
    name: source.name || "灰度高度图",
    waterRatio: null,
    distribution: [],
    steps: [],
    source: {
      kind: source.kind || "image-grayscale",
      filename: source.filename || "",
      width: source.width || 0,
      height: source.height || 0,
      brightnessMin: round(source.brightnessMin || 0, 3),
      brightnessMax: round(source.brightnessMax || 0, 3),
      heightMin: source.heightMin ?? 0,
      heightMax: source.heightMax ?? 100,
      invert: Boolean(source.invert),
      fitMode: source.fitMode || "stretch",
      mappingMode: source.mappingMode || "grayscale",
      colorLimit: source.colorLimit ?? 0,
      unassignedHeight: source.unassignedHeight ?? 0,
      unassignedStrategy: source.unassignedStrategy || "fixed-height",
      unassignedBuckets: source.unassignedBuckets ?? 0,
      unassignedPixels: source.unassignedPixels ?? 0,
      assignments: Array.isArray(source.assignments) ? source.assignments.map(normalizeHeightmapAssignment) : [],
      normalization: source.normalization || "image-min-max"
    }
  };
  Object.defineProperty(descriptor, "sampleHeight", {
    value: source.sampleHeight,
    enumerable: false
  });
  return descriptor;
}

export function createSampledHeightmapFromPayload(options, payload = {}) {
  const sampleWidth = Math.max(1, Number(payload.sampleWidth) || Number(options.graphWidth) || 1);
  const sampleHeight = Math.max(1, Number(payload.sampleHeight) || Number(options.graphHeight) || 1);
  const samples = payload.samples || new Uint8Array(sampleWidth * sampleHeight);
  return createSampledHeightmap(options, {
    ...(payload.source || {}),
    sampleHeight: point => {
      const x = clamp(Math.round(point[0]), 0, sampleWidth - 1);
      const y = clamp(Math.round(point[1]), 0, sampleHeight - 1);
      return samples[y * sampleWidth + x] ?? 0;
    }
  });
}

function normalizeHeightmapAssignment(assignment) {
  return {
    key: assignment.key,
    color: assignment.color || "",
    height: assignment.height ?? 0,
    autoHeight: assignment.autoHeight ?? assignment.height ?? 0,
    pixels: assignment.pixels ?? 0,
    manual: Boolean(assignment.manual)
  };
}

export function applyHeightmap(heightmap, grid, layout, random) {
  if (typeof heightmap?.sampleHeight === "function") {
    applySampledHeightmap(heightmap, grid);
    return;
  }

  const context = createHeightmapContext(heightmap, grid, layout, random);

  for (const step of heightmap.steps) addStep(context, step);

  grid.cells.h = Array.from(context.heights, height => clamp(height, 0, 100));
}

function applySampledHeightmap(heightmap, grid) {
  grid.cells.h = grid.points.map((point, cell) => clamp(Math.round(heightmap.sampleHeight(point, cell, grid)), 0, 100));
}

export function traceHeightmapSteps(heightmap, grid, layout, random, inspectStep) {
  const context = createHeightmapContext(heightmap, grid, layout, random);
  const steps = [];

  for (const step of heightmap.steps) {
    const originalNext = context.random.next.bind(context.random);
    const randomLog = {count: 0, first: []};
    context.random.next = () => {
      const value = originalNext();
      randomLog.count++;
      if (randomLog.first.length < 20) randomLog.first.push(round(value, 12));
      return value;
    };

    addStep(context, step);
    context.random.next = originalNext;
    const inspection = typeof inspectStep === "function" ? inspectStep({step, context, heights: context.heights}) : {};
    steps.push({
      raw: step.join(" "),
      stats: describeHeights(context.heights),
      sample: Array.from(context.heights.slice(0, 20)),
      random: randomLog,
      ...inspection
    });
  }

  return {
    steps,
    heights: Array.from(context.heights)
  };
}

function createHeightmapContext(heightmap, grid, layout, random) {
  const heights = new Uint8Array(grid.points.length);
  const neighbors = createHeightNeighbors(grid, layout);
  return {
    heightmap,
    grid,
    layout,
    random,
    heights,
    neighbors,
    ridgeCells: new Uint8Array(heights.length),
    ridgeInfluence: new Float32Array(heights.length),
    blobPower: getBlobPower(heightmap.cellsDesired),
    linePower: getLinePower(heightmap.cellsDesired)
  };
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
    const change = new Uint8Array(context.heights.length);
    let limit = 0;
    let start = 0;
    const h = clamp(getNumberInRange(context.random, height), 0, 100);

    do {
      start = getCellInRange(context, rangeX, rangeY);
      limit++;
    } while (context.heights[start] + h > 90 && limit < 50);

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
    let limit = 0;
    let start = 0;
    let h = clamp(getNumberInRange(context.random, height), 0, 100);

    do {
      start = getCellInRange(context, rangeX, rangeY);
      limit++;
    } while (context.heights[start] < 20 && limit < 50);

    const queue = [start];

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
    const used = new Uint8Array(context.heights.length);
    let h = getNumberInRange(context.random, height);
    const startX = getPointInRange(context.random, rangeX, context.heightmap.graphWidth);
    const startY = getPointInRange(context.random, rangeY, context.heightmap.graphHeight);
    let dist = 0;
    let limit = 0;
    let endX = 0;
    let endY = 0;

    do {
      endX = context.random.next() * context.heightmap.graphWidth * 0.8 + context.heightmap.graphWidth * 0.1;
      endY = context.random.next() * context.heightmap.graphHeight * 0.7 + context.heightmap.graphHeight * 0.15;
      dist = Math.abs(endY - startY) + Math.abs(endX - startX);
      limit++;
    } while ((dist < context.heightmap.graphWidth / 8 || dist > context.heightmap.graphWidth / 3) && limit < 50);

    const start = getClosestCell(context, startX, startY);
    const end = getClosestCell(context, endX, endY);
    const ridge = getPath(context, start, end, used, 0.85);
    let frontier = ridge.slice();
    let spread = 0;

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
    const used = new Uint8Array(context.heights.length);
    let h = getNumberInRange(context.random, height);
    let limit = 0;
    let startX = 0;
    let startY = 0;
    let start = 0;
    let dist = 0;
    let endX = 0;
    let endY = 0;

    do {
      startX = getPointInRange(context.random, rangeX, context.heightmap.graphWidth);
      startY = getPointInRange(context.random, rangeY, context.heightmap.graphHeight);
      start = getClosestCell(context, startX, startY);
      limit++;
    } while (context.heights[start] < 20 && limit < 50);

    limit = 0;
    do {
      endX = context.random.next() * context.heightmap.graphWidth * 0.8 + context.heightmap.graphWidth * 0.1;
      endY = context.random.next() * context.heightmap.graphHeight * 0.7 + context.heightmap.graphHeight * 0.15;
      dist = Math.abs(endY - startY) + Math.abs(endX - startX);
      limit++;
    } while ((dist < context.heightmap.graphWidth / 8 || dist > context.heightmap.graphWidth / 2) && limit < 50);

    const end = getClosestCell(context, endX, endY);
    const trench = getPath(context, start, end, used, 0.8);
    let frontier = trench.slice();
    let spread = 0;

    while (frontier.length) {
      const currentFrontier = frontier;
      frontier = [];
      spread++;

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

    addProminences(context, trench, spread);
  });
}

function addStrait(context, width, direction = "vertical") {
  const desiredWidth = Math.min(getNumberInRange(context.random, width), context.layout.columns / 3);
  if (desiredWidth < 1 && probability(context.random, desiredWidth)) return;
  const vertical = direction === "vertical";
  const startX = vertical ? Math.floor(context.random.next() * context.heightmap.graphWidth * 0.4 + context.heightmap.graphWidth * 0.3) : 5;
  const startY = vertical ? 5 : Math.floor(context.random.next() * context.heightmap.graphHeight * 0.4 + context.heightmap.graphHeight * 0.3);
  const endX = vertical
    ? Math.floor(context.heightmap.graphWidth - startX - context.heightmap.graphWidth * 0.1 + context.random.next() * context.heightmap.graphWidth * 0.2)
    : context.heightmap.graphWidth - 5;
  const endY = vertical
    ? context.heightmap.graphHeight - 5
    : Math.floor(context.heightmap.graphHeight - startY - context.heightmap.graphHeight * 0.1 + context.random.next() * context.heightmap.graphHeight * 0.2);

  let frontier = getOpenPath(context, getClosestCell(context, startX, startY), getClosestCell(context, endX, endY), 0.8);
  const used = new Uint8Array(context.heights.length);
  const query = [];
  const step = 0.1 / desiredWidth;

  for (let widthStep = 0; widthStep < desiredWidth; widthStep++) {
    const currentFrontier = frontier;
    const remainingWidth = desiredWidth - widthStep;
    const exponent = 0.9 - step * remainingWidth;

    for (const cell of currentFrontier) {
      for (const neighbor of context.neighbors[cell]) {
        if (used[neighbor]) continue;
        used[neighbor] = 1;
        query.push(neighbor);
        context.heights[neighbor] = clamp(context.heights[neighbor] ** exponent, 0, 100);
        if (context.heights[neighbor] > 100) context.heights[neighbor] = 5;
      }
    }

    frontier = query.slice();
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
  context.heights = next;
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
  const next = new Uint8Array(context.heights.length);

  for (let cell = 0; cell < context.heights.length; cell++) {
    const column = cell % context.layout.columns;
    const row = Math.floor(cell / context.layout.columns);
    const nextColumn = invertX ? context.layout.columns - column - 1 : column;
    const nextRow = invertY ? context.layout.rows - row - 1 : row;
    next[cell] = context.heights[nextRow * context.layout.columns + nextColumn];
  }

  context.heights = next;
}

function rebalanceHeights(context, targetWaterRatio) {
  const adjusted = context.heights.map((height, cell) => {
    const [x, y] = context.grid.points[cell];
    return height + (hashNoise(cell + 7919, x, y) - 0.5) * 0.9;
  });
  const sorted = adjusted.slice().sort((a, b) => a - b);
  const seaIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * targetWaterRatio)));
  let offset = sorted[seaIndex] - 19;

  for (let cell = 0; cell < context.heights.length; cell++) {
    context.heights[cell] = clamp(adjusted[cell] - offset, 0, 100);
  }

  const minLandCells = Math.round(context.heights.length * Math.max(0.08, (1 - targetWaterRatio) * 0.35));
  let landCells = context.heights.reduce((sum, height) => sum + (height >= 20 ? 1 : 0), 0);
  while (landCells < minLandCells && offset > -20) {
    offset -= 1;
    landCells = 0;
    for (let cell = 0; cell < context.heights.length; cell++) {
      context.heights[cell] = clamp(adjusted[cell] - offset, 0, 100);
      if (context.heights[cell] >= 20) landCells++;
    }
  }
}

function shapeLandRelief(context) {
  const landHeights = context.heights.filter(height => height >= 20);
  if (!landHeights.length) return;
  const landMax = maxValue(landHeights) - 20;
  if (landMax <= 0.05) return;
  const denominator = Math.max(landMax, 0.75);
  const targetPeak = context.heightmap.distribution.at(-1)?.[1] ?? 96;
  const reliefRange = Math.max(48, targetPeak - 20);

  for (let cell = 0; cell < context.heights.length; cell++) {
    const height = context.heights[cell];
    if (height < 20) continue;
    const normalized = clamp((height - 20) / denominator, 0, 1);
    const ridgeInfluence = context.ridgeInfluence[cell] || 0;
    const shaped = Math.pow(normalized, 1.48) * reliefRange;
    const ridgeLift = ridgeInfluence * Math.pow(normalized, 1.1) * 7;
    context.heights[cell] = clamp(20 + shaped + ridgeLift, 20, 100);
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

function softenAbruptTransitions(context) {
  for (let iteration = 0; iteration < 2; iteration++) {
    const next = context.heights.slice();

    for (let cell = 0; cell < context.heights.length; cell++) {
      const height = context.heights[cell];
      if (height < 20 || height > 76) continue;
      const neighbors = context.neighbors[cell];
      if (!neighbors.length) continue;
      const values = neighbors.map(neighbor => context.heights[neighbor]);
      const mean = (height + values.reduce((sum, value) => sum + value, 0)) / (values.length + 1);
      const min = Math.min(height, ...values);
      const max = Math.max(height, ...values);
      const localSlope = max - min;
      if (localSlope < 7) continue;

      const ridgeInfluence = context.ridgeInfluence[cell] || 0;
      const foothill = height < 58 ? 1 : clamp((76 - height) / 18, 0, 1);
      const weight = clamp((localSlope - 6) / 42, 0, 0.28) * foothill * (1 - ridgeInfluence * 0.75);
      next[cell] = clamp(height * (1 - weight) + mean * weight, 0, 100);
    }

    for (let cell = 0; cell < context.heights.length; cell++) {
      context.heights[cell] = next[cell];
    }
  }
}

function maxValue(values) {
  let max = -Infinity;
  for (const value of values) if (value > max) max = value;
  return max === -Infinity ? 0 : max;
}

function addResidualRelief(context) {
  for (let cell = 0; cell < context.heights.length; cell++) {
    const height = context.heights[cell];
    if (height < 20 || height > 64) continue;
    const [x, y] = context.grid.points[cell];
    const lowlandWeight = 1 - clamp((height - 30) / 34, 0, 1);
    const foothillWeight = clamp((height - 24) / 28, 0, 1) * (1 - clamp((height - 60) / 10, 0, 1));
    const amplitude = 0.8 + lowlandWeight * 1.1 + foothillWeight * 0.7;
    context.heights[cell] = clamp(height + (hashNoise(cell, x, y) - 0.5) * amplitude, 0, 100);
  }
}

function getPath(context, start, end, used, shortcutThreshold) {
  const path = [start];
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
      if (context.random.next() > shortcutThreshold) score *= 0.5;
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

function getOpenPath(context, start, end, shortcutThreshold) {
  const path = [];
  const points = context.grid.points;
  let current = start;

  while (current !== end && path.length < context.heights.length) {
    let best = -1;
    let bestScore = Infinity;

    for (const neighbor of context.neighbors[current]) {
      const dx = points[end][0] - points[neighbor][0];
      const dy = points[end][1] - points[neighbor][1];
      let score = dx * dx + dy * dy;
      if (context.random.next() > shortcutThreshold) score *= 0.5;
      if (score < bestScore) {
        best = neighbor;
        bestScore = score;
      }
    }

    if (best === -1) break;
    current = best;
    path.push(current);
  }

  return path;
}

function getCellInRange(context, rangeX, rangeY) {
  const x = getPointInRange(context.random, rangeX, context.heightmap.graphWidth);
  const y = getPointInRange(context.random, rangeY, context.heightmap.graphHeight);
  return getClosestCell(context, x, y);
}

function getClosestCell(context, x, y) {
  const column = Math.floor(Math.min(x / context.layout.spacing, context.layout.columns - 1));
  const row = Math.floor(Math.min(y / context.layout.spacing, context.layout.rows - 1));
  return row * context.layout.columns + column;
}

function createHeightNeighbors(grid, layout) {
  if (grid.cells.c?.length) return grid.cells.c;

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
  const min = (Number.parseInt(minText, 10) || 0) / 100;
  const max = (Number.parseInt(maxText, 10) || Number.parseInt(minText, 10) || 0) / 100;
  return rand(random, min * length, max * length);
}

function getNumberInRange(random, range) {
  const value = String(range);
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return Math.trunc(numeric) + (probability(random, numeric - Math.trunc(numeric)) ? 1 : 0);
  const sign = value[0] === "-" ? -1 : 1;
  const normalized = Number.isNaN(Number(value[0])) ? value.slice(1) : value;
  const [minText, maxText] = normalized.split("-");
  if (maxText === undefined) return 0;
  const count = rand(random, Number.parseFloat(minText) * sign, Number.parseFloat(maxText));
  if (Number.isNaN(count) || count < 0) return 0;
  return count;
}

function rand(random, min = 0, max = undefined) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.floor(random.next() * (max - min + 1)) + min;
}

function probability(random, value) {
  if (value >= 1) return true;
  if (value <= 0) return false;
  return random.next() < value;
}

function describeHeights(values) {
  const list = Array.from(values).sort((a, b) => a - b);
  const landCells = list.filter(height => height >= 20).length;
  return {
    min: list[0] ?? 0,
    p05: quantileSorted(list, 0.05),
    p25: quantileSorted(list, 0.25),
    p50: quantileSorted(list, 0.5),
    p75: quantileSorted(list, 0.75),
    p90: quantileSorted(list, 0.9),
    p95: quantileSorted(list, 0.95),
    p99: quantileSorted(list, 0.99),
    max: list[list.length - 1] ?? 0,
    mean: round(list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length), 3),
    landRatio: round(landCells / Math.max(1, list.length), 3),
    landCells
  };
}

function quantileSorted(list, percentile) {
  if (!list.length) return 0;
  const index = Math.min(list.length - 1, Math.max(0, Math.floor((list.length - 1) * percentile)));
  return list[index];
}

function getContinuousNumberInRange(random, range) {
  const value = String(range);
  const [minText, maxText] = value.split("-");
  const min = Number.parseFloat(minText) || 0;
  const max = Number.parseFloat(maxText);
  return Number.isFinite(max) ? random.range(min, max) : min;
}

function getBlobPower(cells) {
  if (cells >= 90000) return 0.9973;
  if (cells >= 80000) return 0.996;
  if (cells >= 70000) return 0.9955;
  if (cells >= 60000) return 0.995;
  if (cells >= 50000) return 0.994;
  if (cells >= 40000) return 0.993;
  if (cells >= 30000) return 0.991;
  if (cells >= 20000) return 0.99;
  if (cells >= 10000) return 0.98;
  if (cells >= 5000) return 0.97;
  if (cells >= 2000) return 0.95;
  if (cells >= 1000) return 0.93;
  return 0.95;
}

function getLinePower(cells) {
  if (cells >= 100000) return 0.93;
  if (cells >= 90000) return 0.92;
  if (cells >= 80000) return 0.91;
  if (cells >= 70000) return 0.88;
  if (cells >= 60000) return 0.87;
  if (cells >= 50000) return 0.86;
  if (cells >= 40000) return 0.84;
  if (cells >= 30000) return 0.83;
  if (cells >= 20000) return 0.82;
  if (cells >= 10000) return 0.81;
  if (cells >= 5000) return 0.79;
  return 0.77;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function hashNoise(cell, x, y) {
  const value = Math.sin(cell * 12.9898 + x * 78.233 + y * 37.719) * 43758.5453;
  return value - Math.floor(value);
}
