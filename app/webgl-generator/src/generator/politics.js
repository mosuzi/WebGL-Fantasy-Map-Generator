const STATE_ROOTS = ["昭宁", "雁川", "青岚", "星渚", "南衡", "白麓", "清河", "苍原", "岚湾", "云麓"];
const PROVINCE_SUFFIXES = ["郡", "州", "道", "府", "领", "司"];
const REGION_NAMES = ["北境", "南陆", "西岭", "东湾", "中原", "湖泽"];

export function buildPolitics(grid, features, society, random, options) {
  const landCells = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => features.features[grid.cells.f[item.cell]]?.type === "land");

  const states = buildStates(grid, landCells, society, random);
  grid.cells.state = assignNearestCenter(grid, landCells, states.map(state => state.center), -1);

  const provinces = buildProvinces(grid, landCells, states, society, random);
  grid.cells.province = assignProvinces(grid, landCells, provinces);

  const regions = buildRegions();
  grid.cells.region = assignRegions(grid, features, regions, options);

  return {
    states,
    provinces,
    regions,
    metadata: {
      states: states.length,
      provinces: provinces.length,
      regions: regions.length,
      stateNames: states.map(state => state.name),
      provinceNames: provinces.map(province => province.name),
      regionNames: regions.map(region => region.name)
    }
  };
}

function buildStates(grid, landCells, society, random) {
  if (!landCells.length) return [];
  const target = clamp(Math.round(Math.sqrt(landCells.length) / 14), 3, Math.min(STATE_ROOTS.length, 9));
  const candidates = landCells
    .map(item => ({
      ...item,
      score: item.height * 0.45 + item.prec * 0.55 + random.range(0, 22)
    }))
    .sort((a, b) => b.score - a.score);
  const minDistance = Math.max(grid.metadata.columns, grid.metadata.rows) / 4;
  const centers = pickSpacedCenters(candidates, grid, target, minDistance);

  return centers.map((center, id) => {
    const culture = society.cultures[grid.cells.culture[center.cell]];
    const root = culture?.name?.replace("文化", "") || STATE_ROOTS[id % STATE_ROOTS.length];
    return {
      id,
      name: `${root}${id % 3 === 0 ? "国" : id % 3 === 1 ? "邦" : "王国"}`,
      center: center.cell,
      culture: grid.cells.culture[center.cell],
      religion: grid.cells.religion[center.cell]
    };
  });
}

function buildProvinces(grid, landCells, states, society, random) {
  const provinces = [];
  for (const state of states) {
    const stateCells = landCells.filter(item => grid.cells.state[item.cell] === state.id);
    const target = clamp(Math.round(stateCells.length / 850), 2, 5);
    const candidates = stateCells
      .map(item => ({
        ...item,
        score: item.prec * 0.35 + Math.max(0, 70 - Math.abs(item.height - 42)) + random.range(0, 20)
      }))
      .sort((a, b) => b.score - a.score);
    const minDistance = Math.max(grid.metadata.columns, grid.metadata.rows) / 8;
    const centers = pickSpacedCenters(candidates, grid, target, minDistance);

    for (const center of centers) {
      const id = provinces.length;
      const cultureRoot = society.cultures[grid.cells.culture[center.cell]]?.name?.replace("文化", "") || STATE_ROOTS[id % STATE_ROOTS.length];
      provinces.push({
        id,
        name: `${cultureRoot}${PROVINCE_SUFFIXES[id % PROVINCE_SUFFIXES.length]}`,
        state: state.id,
        center: center.cell
      });
    }
  }
  return provinces;
}

function buildRegions() {
  return REGION_NAMES.map((name, id) => ({id, name}));
}

function assignNearestCenter(grid, landCells, centers, emptyValue) {
  const values = new Array(grid.points.length).fill(emptyValue);
  for (const item of landCells) {
    let best = emptyValue;
    let bestDistance = Infinity;
    for (let index = 0; index < centers.length; index++) {
      const nextDistance = distance(item.point, grid.points[centers[index]]);
      if (nextDistance < bestDistance) {
        best = index;
        bestDistance = nextDistance;
      }
    }
    values[item.cell] = best;
  }
  return values;
}

function assignProvinces(grid, landCells, provinces) {
  const values = new Array(grid.points.length).fill(-1);
  const byState = new Map();
  for (const province of provinces) {
    if (!byState.has(province.state)) byState.set(province.state, []);
    byState.get(province.state).push(province);
  }

  for (const item of landCells) {
    const state = grid.cells.state[item.cell];
    const candidates = byState.get(state) || [];
    let best = -1;
    let bestDistance = Infinity;
    for (const province of candidates) {
      const nextDistance = distance(item.point, grid.points[province.center]);
      if (nextDistance < bestDistance) {
        best = province.id;
        bestDistance = nextDistance;
      }
    }
    values[item.cell] = best;
  }
  return values;
}

function assignRegions(grid, features, regions, options) {
  return grid.points.map((point, cell) => {
    const feature = features.features[grid.cells.f[cell]];
    if (feature?.type !== "land") return -1;
    const x = point[0] / options.graphWidth;
    const y = point[1] / options.graphHeight;
    if (grid.cells.h[cell] > 66) return 2;
    if (Math.abs(x - 0.5) < 0.2 && Math.abs(y - 0.5) < 0.22) return 4;
    if (grid.cells.prec[cell] > 72) return 5;
    if (y < 0.34) return 0;
    if (y > 0.66) return 1;
    if (x < 0.43) return 2;
    if (x > 0.57) return 3;
    return Math.min(4, regions.length - 1);
  });
}

function pickSpacedCenters(candidates, grid, target, minDistance) {
  const centers = [];
  for (const candidate of candidates) {
    if (centers.length >= target) break;
    const tooClose = centers.some(center => distance(grid.points[candidate.cell], grid.points[center.cell]) < minDistance);
    if (!tooClose) centers.push(candidate);
  }
  return centers.length ? centers : candidates.slice(0, target);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
