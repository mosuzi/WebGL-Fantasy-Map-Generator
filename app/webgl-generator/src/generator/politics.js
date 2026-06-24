import {MinPriorityQueue} from "./priority-queue.js";
import {createRandom} from "./random.js";

const STATE_ROOTS = ["昭宁", "雁川", "青岚", "星渚", "南衡", "白麓", "清河", "苍原", "岚湾", "云麓", "河洛", "云渡", "栖梧", "北辰", "东衡", "西麓", "南浦", "霜川", "泽阳", "柏原", "海津", "长岚", "玄丘", "玉津"];
const PROVINCE_SUFFIXES = ["郡", "州", "道", "府", "领", "司"];
const REGION_NAMES = ["北境", "南陆", "西岭", "东湾", "中原", "湖泽"];
const BIOME_COST = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150];

export function buildPolitics(grid, features, society, rivers, random, options, pack) {
  if (pack?.burgs?.some?.(burg => burg?.capital)) return buildPackPolitics(grid, features, society, rivers, random, options, pack);

  const landCells = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell));
  const settledCells = landCells.filter(item => (grid.cells.culture?.[item.cell] || 0) > 0 && (grid.cells.pop?.[item.cell] || 0) > 0);
  const politicalCells = settledCells.length ? settledCells : landCells;
  const riverCells = new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells));

  const states = buildStates(grid, politicalCells, society, random);
  grid.cells.state = expandStates(grid, features, states, riverCells);

  const provinces = buildProvinces(grid, politicalCells, states, society, random);
  grid.cells.province = expandProvinces(grid, features, provinces, riverCells);

  const regions = buildRegions();
  grid.cells.region = assignRegions(grid, features, regions, riverCells, options);

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

function buildPackPolitics(grid, features, society, rivers, random, options, pack) {
  const landCells = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell));
  const settledCells = landCells.filter(item => (grid.cells.culture?.[item.cell] || 0) > 0 && (grid.cells.pop?.[item.cell] || 0) > 0);
  const politicalCells = settledCells.length ? settledCells : landCells;
  const riverCells = new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells));

  const states = buildPackStates(pack, society, random);
  expandPackStates(pack, states, society);
  normalizePackStates(pack, states);
  syncBurgStates(pack);
  collectStateStatistics(pack, states);
  findStateNeighbors(pack, states);
  assignStateColors(states);
  grid.cells.state = mirrorPackStateToGrid(grid, pack);

  const provinces = buildPackProvinces(pack, society, createRandom(options.seed), options);
  grid.cells.province = mirrorPackProvinceToGrid(grid, pack);

  const regions = buildRegions();
  grid.cells.region = assignRegions(grid, features, regions, riverCells, options);

  const validStates = states.filter(state => state?.i);
  return {
    states,
    provinces,
    regions,
    metadata: {
      states: validStates.length,
      provinces: provinces.filter(province => province?.i).length,
      regions: regions.length,
      stateNames: validStates.map(state => state.name),
      provinceNames: provinces.filter(province => province?.i).map(province => province.name),
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
  const minDistance = Math.min(grid.metadata.graphWidth, grid.metadata.graphHeight) / 3.5;
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

function buildPackStates(pack, society, random) {
  const states = [{id: 0, i: 0, name: "中立", center: 0, culture: 0, type: "Neutral", expansionism: 0}];
  const capitals = pack.burgs.filter(burg => burg?.i && burg.capital && !burg.removed);

  for (const burg of capitals) {
    const culture = society.cultures[burg.culture];
    const root = culture?.name?.replace("文化", "") || STATE_ROOTS[burg.i % STATE_ROOTS.length];
    const id = burg.i;
    states[id] = {
      id,
      i: id,
      name: `${root}${id % 3 === 0 ? "国" : id % 3 === 1 ? "邦" : "王国"}`,
      center: burg.cell,
      gridCenter: pack.cells.g[burg.cell],
      capital: burg.i,
      culture: burg.culture,
      religion: pack.cells.religion?.[burg.cell] ?? 0,
      type: culture?.type || "Generic",
      expansionism: round(random.range(1, 2), 1),
      cells: 0,
      area: 0,
      burgs: 0,
      rural: 0,
      urban: 0,
      neighbors: []
    };
  }

  pack.states = states;
  return states;
}

function expandPackStates(pack, states, society) {
  const {cells, burgs} = pack;
  cells.state = new Uint16Array(cells.i.length);
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new MinPriorityQueue();
  const growthRate = cells.i.length / 2;

  for (const state of states) {
    if (!state?.i) continue;
    const capital = burgs[state.capital];
    const capitalCell = capital.cell;
    const cultureCenter = society.cultures[state.culture]?.center ?? capitalCell;
    const nativeBiome = cells.biome[cultureCenter] ?? cells.biome[capitalCell];
    cells.state[capitalCell] = state.i;
    costs[capitalCell] = 1;
    queue.push({cell: state.center, stateId: state.i, nativeBiome, cost: 0}, 0);
  }

  while (queue.length) {
    const {cell, stateId, nativeBiome, cost} = queue.pop();
    if (cost > costs[cell] && costs[cell] !== 1) continue;
    const state = states[stateId];
    if (!state) continue;

    for (const neighbor of cells.c[cell] || []) {
      const occupiedState = states[cells.state[neighbor]];
      if (cells.state[neighbor] && neighbor === occupiedState?.center) continue;

      const cultureCost = state.culture === cells.culture[neighbor] ? -9 : 100;
      const populationCost = cells.h[neighbor] < 20 ? 0 : cells.s[neighbor] ? Math.max(20 - cells.s[neighbor], 0) : 5000;
      const biomeCost = getStateBiomeCost(nativeBiome, cells.biome[neighbor], state.type);
      const heightCost = getStateHeightCost(pack.features[cells.f[neighbor]], cells.h[neighbor], state.type);
      const riverCost = getStateRiverCost(cells.r?.[neighbor], cells.fl?.[neighbor], state.type);
      const typeCost = getStateTypeCost(cells.t[neighbor], state.type);
      const cellCost = Math.max(cultureCost + populationCost + biomeCost + heightCost + riverCost + typeCost, 0);
      const totalCost = cost + 10 + cellCost / Math.max(0.1, state.expansionism || 1);

      if (totalCost > growthRate || totalCost >= costs[neighbor]) continue;
      if (cells.h[neighbor] >= 20) cells.state[neighbor] = stateId;
      costs[neighbor] = totalCost;
      queue.push({cell: neighbor, stateId, nativeBiome, cost: totalCost}, totalCost);
    }
  }

  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    burg.state = cells.state[burg.cell];
  }
}

function normalizePackStates(pack, states) {
  const {cells, burgs} = pack;

  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || cells.burg[cell]) continue;
    if ((cells.c[cell] || []).some(neighbor => burgs[cells.burg[neighbor]]?.capital)) continue;
    const landNeighbors = (cells.c[cell] || []).filter(neighbor => cells.h[neighbor] >= 20);
    const adversaries = landNeighbors.filter(neighbor => cells.state[neighbor] !== cells.state[cell]);
    if (adversaries.length < 2) continue;
    const buddies = landNeighbors.filter(neighbor => cells.state[neighbor] === cells.state[cell]);
    if (buddies.length > 2 || adversaries.length <= buddies.length) continue;
    cells.state[cell] = cells.state[adversaries[0]];
  }

  for (const state of states) {
    if (state?.i) state.center = pack.burgs[state.capital].cell;
  }
}

function syncBurgStates(pack) {
  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    burg.state = pack.cells.state[burg.cell];
  }
}

function collectStateStatistics(pack, states) {
  const {cells, burgs} = pack;
  for (const state of states) {
    if (!state) continue;
    state.cells = 0;
    state.area = 0;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
  }

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const state = states[cells.state[cell]];
    if (!state) continue;
    state.cells++;
    state.area += cells.area[cell] || 0;
    state.rural += cells.pop?.[cell] || 0;
    const burg = burgs[cells.burg?.[cell]];
    if (burg?.i) {
      state.urban += burg.population || 0;
      state.burgs++;
    }
  }

  for (const state of states) {
    if (!state) continue;
    state.area = round(state.area || 0, 2);
    state.rural = round(state.rural || 0, 2);
    state.urban = round(state.urban || 0, 2);
  }
}

function findStateNeighbors(pack, states) {
  const {cells} = pack;
  const neighbors = states.map(() => new Set());

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const stateId = cells.state[cell];
    if (!states[stateId]) continue;
    for (const neighbor of cells.c[cell] || []) {
      if (cells.h[neighbor] < 20 || cells.state[neighbor] === stateId) continue;
      neighbors[stateId].add(cells.state[neighbor]);
    }
  }

  for (const state of states) {
    if (!state) continue;
    state.neighbors = Array.from(neighbors[state.i] || []).filter(id => id !== undefined);
  }
}

function assignStateColors(states) {
  const colors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f"];
  for (const state of states) {
    if (!state?.i) continue;
    state.color = colors[(state.i - 1) % colors.length];
  }
}

function mirrorPackStateToGrid(grid, pack) {
  const values = new Array(grid.points.length).fill(0);
  const bestScore = new Float32Array(grid.points.length).fill(-1);

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    const score = pack.cells.pop?.[packCell] || pack.cells.s?.[packCell] || 0;
    if (score < bestScore[gridCell]) continue;
    values[gridCell] = pack.cells.state[packCell] || 0;
    bestScore[gridCell] = score;
  }

  return values;
}

function getStateBiomeCost(nativeBiome, biome, type) {
  if (nativeBiome === biome) return 10;
  const cost = BIOME_COST[biome] ?? 50;
  if (type === "Hunting") return cost * 2;
  if (type === "Nomadic" && biome > 4 && biome < 10) return cost * 3;
  return cost;
}

function getStateHeightCost(feature, height, type) {
  if (type === "Lake" && feature?.type === "lake") return 10;
  if (type === "Naval" && height < 20) return 300;
  if (type === "Nomadic" && height < 20) return 10000;
  if (height < 20) return 1000;
  if (type === "Highland" && height < 62) return 1100;
  if (type === "Highland") return 0;
  if (height >= 67) return 2200;
  if (height >= 44) return 300;
  return 0;
}

function getStateRiverCost(riverId, flux, type) {
  if (type === "River") return riverId ? 0 : 100;
  if (!riverId) return 0;
  return clamp((flux || 0) / 10, 20, 100);
}

function getStateTypeCost(distanceFromCoast, type) {
  if (distanceFromCoast === 1) return type === "Naval" || type === "Lake" ? 0 : type === "Nomadic" ? 60 : 20;
  if (distanceFromCoast === 2) return type === "Naval" || type === "Nomadic" ? 30 : 0;
  if (distanceFromCoast !== -1) return type === "Naval" || type === "Lake" ? 100 : 0;
  return 0;
}

function buildProvinces(grid, landCells, states, society, random) {
  const provinces = [];
  for (const state of states) {
    if (!state) continue;
    if (state.i === 0) continue;
    const stateCells = landCells.filter(item => grid.cells.state[item.cell] === state.id);
    const target = clamp(Math.round(stateCells.length / 850), 2, 5);
    const candidates = stateCells
      .map(item => ({
        ...item,
        score: item.prec * 0.35 + Math.max(0, 70 - Math.abs(item.height - 42)) + random.range(0, 20)
      }))
      .sort((a, b) => b.score - a.score);
    const minDistance = Math.min(grid.metadata.graphWidth, grid.metadata.graphHeight) / 9;
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

function buildPackProvinces(pack, society, random, options) {
  const {cells, states, burgs} = pack;
  const provinces = [null];
  const provinceIds = new Uint16Array(cells.i.length);
  const provincesRatio = Math.max(0, Math.min(100, Number(options.provincesRatio ?? 20)));
  const maxGrowth = provincesRatio === 100 ? 1000 : gauss(random, 20, 5, 5, 100) * Math.sqrt(provincesRatio);

  for (const state of states) {
    if (!state?.i) continue;
    state.provinces = [];
    const stateBurgs = burgs
      .filter(burg => burg?.i && !burg.removed && burg.state === state.i)
      .sort((a, b) => b.population * gauss(random, 1, 0.2, 0.5, 1.5, 3) - a.population)
      .sort((a, b) => Number(b.capital) - Number(a.capital));
    if (stateBurgs.length < 2) continue;

    const provincesNumber = Math.max(Math.ceil((stateBurgs.length * provincesRatio) / 100), 2);
    for (let index = 0; index < provincesNumber; index++) {
      const burg = stateBurgs[index];
      const provinceId = provinces.length;
      const culture = society.cultures[burg.culture];
      const root = (index % 2 === 0 ? burg.name : culture?.name?.replace("文化", "")) || STATE_ROOTS[provinceId % STATE_ROOTS.length];
      const formName = PROVINCE_SUFFIXES[provinceId % PROVINCE_SUFFIXES.length];
      const province = {
        id: provinceId,
        i: provinceId,
        state: state.i,
        center: burg.cell,
        gridCenter: cells.g[burg.cell],
        burg: burg.i,
        name: root,
        formName,
        fullName: `${root}${formName}`,
        color: state.color,
        cells: 0,
        area: 0
      };
      provinces.push(province);
      state.provinces.push(provinceId);
      provinceIds[burg.cell] = provinceId;
    }
  }

  expandPackProvinces(pack, provinces, provinceIds, maxGrowth);
  justifyPackProvinces(pack, provinces, provinceIds);
  fillUnassignedProvinceCells(pack, provinces, provinceIds, random, maxGrowth);
  collectProvinceStatistics(pack, provinces, provinceIds);
  cells.province = provinceIds;
  pack.provinces = provinces;
  return provinces;
}

function expandPackProvinces(pack, provinces, provinceIds, maxGrowth) {
  const {cells} = pack;
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new MinPriorityQueue();

  for (const province of provinces) {
    if (!province?.i) continue;
    costs[province.center] = 1;
    queue.push({cell: province.center, province: province.i, state: province.state, cost: 0}, 0);
  }

  while (queue.length) {
    const {cell, province, state, cost} = queue.pop();
    if (cost > costs[cell] && costs[cell] !== 1) continue;

    for (const neighbor of cells.c[cell] || []) {
      const land = cells.h[neighbor] >= 20;
      if (!land && !cells.t[neighbor]) continue;
      if (land && cells.state[neighbor] !== state) continue;
      const elevationCost = cells.h[neighbor] >= 70 ? 100 : cells.h[neighbor] >= 50 ? 30 : cells.h[neighbor] >= 20 ? 10 : 100;
      const totalCost = cost + elevationCost;
      if (totalCost > maxGrowth || totalCost >= costs[neighbor]) continue;
      if (land) provinceIds[neighbor] = province;
      costs[neighbor] = totalCost;
      queue.push({cell: neighbor, province, state, cost: totalCost}, totalCost);
    }
  }
}

function justifyPackProvinces(pack, provinces, provinceIds) {
  const {cells} = pack;
  for (const cell of cells.i) {
    if (cells.burg[cell]) continue;
    const sameStateNeighbors = (cells.c[cell] || []).filter(neighbor => cells.state[neighbor] === cells.state[cell]);
    const neighborProvinces = sameStateNeighbors.map(neighbor => provinceIds[neighbor]);
    const adversaries = neighborProvinces.filter(province => province !== provinceIds[cell]);
    if (adversaries.length < 2) continue;
    const buddies = neighborProvinces.filter(province => province === provinceIds[cell]).length;
    if (buddies > 2) continue;

    let bestProvince = provinceIds[cell];
    let bestCount = buddies;
    for (const province of adversaries) {
      const count = adversaries.filter(value => value === province).length;
      if (count <= bestCount) continue;
      bestProvince = province;
      bestCount = count;
    }
    if (bestProvince) provinceIds[cell] = bestProvince;
  }
}

function fillUnassignedProvinceCells(pack, provinces, provinceIds, random, maxGrowth) {
  const {cells, states, burgs} = pack;
  const queue = new MinPriorityQueue();

  for (const state of states) {
    if (!state?.i || !state.provinces?.length) continue;
    let unassigned = cells.i.filter(cell => cells.state[cell] === state.i && cells.h[cell] >= 20 && !provinceIds[cell]);

    while (unassigned.length) {
      const center = unassigned.find(cell => cells.burg[cell]) || unassigned[0];
      const provinceId = provinces.length;
      const burgId = cells.burg[center] || 0;
      const burg = burgs[burgId];
      const root = burg?.name || `${state.name}${PROVINCE_SUFFIXES[provinceId % PROVINCE_SUFFIXES.length]}`;
      const formName = burg ? PROVINCE_SUFFIXES[provinceId % PROVINCE_SUFFIXES.length] : "边地";
      const province = {
        id: provinceId,
        i: provinceId,
        state: state.i,
        center,
        gridCenter: cells.g[center],
        burg: burgId,
        name: root,
        formName,
        fullName: `${root}${formName}`,
        color: state.color,
        cells: 0,
        area: 0
      };
      provinces.push(province);
      state.provinces.push(provinceId);

      const costs = new Float64Array(cells.i.length).fill(Infinity);
      costs[center] = 0;
      provinceIds[center] = provinceId;
      queue.push({cell: center, cost: 0}, 0);

      while (queue.length) {
        const {cell, cost} = queue.pop();
        if (cost !== costs[cell]) continue;
        for (const neighbor of cells.c[cell] || []) {
          if (provinceIds[neighbor]) continue;
          if (cells.state[neighbor] && cells.state[neighbor] !== state.i) continue;
          const land = cells.h[neighbor] >= 20;
          const step = land ? (cells.state[neighbor] === state.i ? 3 : 20) : cells.t[neighbor] ? 10 : 30;
          const nextCost = cost + step;
          if (nextCost > maxGrowth || nextCost >= costs[neighbor]) continue;
          if (land && cells.state[neighbor] === state.i) provinceIds[neighbor] = provinceId;
          costs[neighbor] = nextCost;
          queue.push({cell: neighbor, cost: nextCost}, nextCost);
        }
      }

      unassigned = cells.i.filter(cell => cells.state[cell] === state.i && cells.h[cell] >= 20 && !provinceIds[cell]);
    }
  }
}

function collectProvinceStatistics(pack, provinces, provinceIds) {
  for (const province of provinces) {
    if (!province) continue;
    province.cells = 0;
    province.area = 0;
  }

  for (const cell of pack.cells.i) {
    const province = provinces[provinceIds[cell]];
    if (!province || pack.cells.h[cell] < 20) continue;
    province.cells++;
    province.area += pack.cells.area[cell] || 0;
  }

  for (const province of provinces) {
    if (!province) continue;
    province.area = round(province.area || 0, 2);
  }
}

function mirrorPackProvinceToGrid(grid, pack) {
  const values = new Array(grid.points.length).fill(0);
  const bestScore = new Float32Array(grid.points.length).fill(-1);

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    const score = pack.cells.pop?.[packCell] || pack.cells.s?.[packCell] || 0;
    if (score < bestScore[gridCell]) continue;
    values[gridCell] = pack.cells.province?.[packCell] || 0;
    bestScore[gridCell] = score;
  }

  return values;
}

function buildRegions() {
  return REGION_NAMES.map((name, id) => ({id, name}));
}

function expandStates(grid, features, states, riverCells) {
  const centers = states.map(state => ({
    id: state.id,
    cell: state.center,
    culture: state.culture,
    religion: state.religion
  }));
  return expandPoliticalCenters(grid, features, centers, -1, (from, to, center) => {
    const height = grid.cells.h[to];
    const slope = Math.abs(height - grid.cells.h[from]);
    const cultureCost = grid.cells.culture[to] === center.culture ? -8 : 72;
    const religionCost = grid.cells.religion[to] === center.religion ? 0 : 18;
    const mountainCost = height > 72 ? (height - 72) * 8 : height > 58 ? (height - 58) * 2 : 0;
    const riverCost = riverCells.has(to) && !riverCells.has(from) ? 28 : 0;
    return Math.max(6, distance(grid.points[from], grid.points[to]) + cultureCost + religionCost + mountainCost + slope * 4 + riverCost);
  });
}

function expandProvinces(grid, features, provinces, riverCells) {
  const values = new Array(grid.points.length).fill(-1);
  const byState = new Map();
  for (const province of provinces) {
    if (!byState.has(province.state)) byState.set(province.state, []);
    byState.get(province.state).push({id: province.id, cell: province.center, state: province.state});
  }

  for (const [state, centers] of byState.entries()) {
    const expanded = expandPoliticalCenters(grid, features, centers, -1, (from, to, center) => {
      if (grid.cells.state[to] !== state) return Infinity;
      const height = grid.cells.h[to];
      const slope = Math.abs(height - grid.cells.h[from]);
      const riverCost = riverCells.has(to) && !riverCells.has(from) ? 20 : 0;
      return distance(grid.points[from], grid.points[to]) + Math.max(0, height - 60) * 2.5 + slope * 3 + riverCost;
    });

    for (let cell = 0; cell < expanded.length; cell++) {
      if (expanded[cell] !== -1) values[cell] = expanded[cell];
    }
  }

  return values;
}

function assignRegions(grid, features, regions, riverCells, options) {
  const anchors = [
    [0.5, 0.18],
    [0.5, 0.82],
    [0.18, 0.52],
    [0.82, 0.52],
    [0.5, 0.5],
    [0.42, 0.38]
  ];
  const centers = regions.map((region, id) => ({
    id,
    cell: closestLandCell(grid, features, anchors[id][0] * options.graphWidth, anchors[id][1] * options.graphHeight)
  }));

  return expandPoliticalCenters(grid, features, centers, -1, (from, to, center) => {
    const height = grid.cells.h[to];
    const slope = Math.abs(height - grid.cells.h[from]);
    const wetlandCost = center.id === 5 ? Math.max(0, 70 - (grid.cells.prec[to] || 0)) * 0.45 : 0;
    const highlandCost = center.id === 2 ? Math.max(0, 58 - height) * 0.65 : Math.max(0, height - 72) * 4;
    const riverCost = riverCells.has(to) && !riverCells.has(from) ? 12 : 0;
    return distance(grid.points[from], grid.points[to]) + wetlandCost + highlandCost + slope * 1.8 + riverCost;
  });
}

function expandPoliticalCenters(grid, features, centers, emptyValue, costFn) {
  const values = new Array(grid.points.length).fill(emptyValue);
  if (!centers.length) return values;

  const costs = new Float64Array(grid.points.length).fill(Infinity);
  const queue = new MinPriorityQueue();

  for (const center of centers) {
    if (center.cell < 0) continue;
    values[center.cell] = center.id;
    costs[center.cell] = 0;
    queue.push({cell: center.cell, center, cost: 0}, 0);
  }

  while (queue.length) {
    const {cell, center, cost} = queue.pop();
    if (cost !== costs[cell] || values[cell] !== center.id) continue;
    if (!isLandFeature(features, grid, cell)) continue;

    for (const neighbor of getCellNeighbors(grid, cell)) {
      if (!isLandFeature(features, grid, neighbor)) continue;
      const step = costFn(cell, neighbor, center);
      if (!Number.isFinite(step)) continue;
      const nextCost = costs[cell] + step;
      if (nextCost >= costs[neighbor]) continue;
      costs[neighbor] = nextCost;
      values[neighbor] = center.id;
      queue.push({cell: neighbor, center, cost: nextCost}, nextCost);
    }
  }

  return values;
}

function closestLandCell(grid, features, x, y) {
  let best = -1;
  let bestDistance = Infinity;

  for (let cell = 0; cell < grid.points.length; cell++) {
    if (!isLandFeature(features, grid, cell)) continue;
    const nextDistance = distance(grid.points[cell], [x, y]);
    if (nextDistance >= bestDistance) continue;
    best = cell;
    bestDistance = nextDistance;
  }

  return best;
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

function getCellNeighbors(grid, cell) {
  const sharedEdgeNeighbors = grid.cells.c?.[cell];
  if (sharedEdgeNeighbors?.length) return sharedEdgeNeighbors;
  return [];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function gaussian(random, mean, stdev, min, max, skew = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random.next();
  while (v === 0) v = random.next();
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const value = mean + (normal * stdev) / 3;
  const skewed = value < mean ? mean - (mean - value) * skew : mean + (value - mean) / Math.max(1, skew);
  return clamp(skewed, min, max);
}

function gauss(random, expected = 100, deviation = 30, min = 0, max = 300, digits = 0) {
  const value = randomNormal(random, expected, deviation);
  return round(Math.min(Math.max(value, min), max), digits);
}

function randomNormal(random, mean, deviation) {
  let x;
  let y;
  let radius;

  do {
    x = random.next() * 2 - 1;
    y = random.next() * 2 - 1;
    radius = x * x + y * y;
  } while (!radius || radius > 1);

  return mean + deviation * y * Math.sqrt((-2 * Math.log(radius)) / radius);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isLandFeature(features, grid, cell) {
  return Boolean(features.features[grid.cells.f[cell]]?.land);
}
