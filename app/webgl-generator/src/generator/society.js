const CULTURE_NAMES = ["昭宁", "雁川", "栖梧", "青岚", "星渚", "南衡", "白麓", "清河"];
const RELIGION_NAMES = ["天衡道", "星渚教", "青岚信会", "白麓礼", "南明祀", "清河宗"];

export function buildSociety(grid, features, climate, random) {
  const landCells = grid.points
    .map((point, cell) => ({cell, height: grid.cells.h[cell], biome: grid.cells.biome[cell]}))
    .filter(item => features.features[grid.cells.f[item.cell]]?.type === "land");
  const cultureCenters = pickCenters(landCells, random, CULTURE_NAMES.length, grid);
  const religionCenters = pickCenters(landCells, random, RELIGION_NAMES.length, grid);
  const cultures = cultureCenters.map((center, index) => ({id: index, name: `${CULTURE_NAMES[index]}文化`, center: center.cell}));
  const religions = religionCenters.map((center, index) => ({id: index, name: RELIGION_NAMES[index], center: center.cell}));

  grid.cells.culture = assignNearestCenter(grid, cultureCenters);
  grid.cells.religion = assignNearestCenter(grid, religionCenters);

  return {
    cultures,
    religions,
    metadata: {
      cultures: cultures.length,
      religions: religions.length,
      cultureNames: cultures.map(culture => culture.name),
      religionNames: religions.map(religion => religion.name)
    }
  };
}

function pickCenters(landCells, random, limit, grid) {
  const candidates = landCells
    .map(item => ({
      ...item,
      score: item.height + (grid.cells.prec[item.cell] || 0) * 0.35 + random.range(0, 18)
    }))
    .sort((a, b) => b.score - a.score);
  const centers = [];
  const minDistance = Math.max(grid.metadata.columns, grid.metadata.rows) / 5;

  for (const candidate of candidates) {
    if (centers.length >= limit) break;
    const point = grid.points[candidate.cell];
    const tooClose = centers.some(center => distance(point, grid.points[center.cell]) < minDistance);
    if (!tooClose) centers.push(candidate);
  }

  return centers.length ? centers : candidates.slice(0, limit);
}

function assignNearestCenter(grid, centers) {
  return grid.points.map(point => {
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < centers.length; index++) {
      const nextDistance = distance(point, grid.points[centers[index].cell]);
      if (nextDistance < bestDistance) {
        best = index;
        bestDistance = nextDistance;
      }
    }
    return best;
  });
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
