import {MinPriorityQueue} from "./priority-queue.js";
import {chooseStateGovernment, applyStateGovernment, summarizeStateGovernments} from "./governments.js";
import {createChineseNameGenerator, getStateFullName, isAncientStateNameRoot} from "./names.js";
import {createStageProfile} from "./profile.js";
import {createRandom} from "./random.js";

const STATE_ROOTS = ["昭宁", "雁川", "青岚", "星渚", "南衡", "白麓", "清河", "苍原", "岚湾", "云麓", "河洛", "云渡", "栖梧", "北辰", "东衡", "西麓", "南浦", "霜川", "泽阳", "柏原", "海津", "长岚", "玄丘", "玉津"];
const PROVINCE_SUFFIXES = ["郡", "州", "道", "府", "领", "司"];
const REGION_NAMES = ["北境", "南陆", "西岭", "东湾", "中原", "湖泽"];
const STATE_CARDINAL_PREFIXES = ["东", "西", "南", "北"];
const STATE_NEUTRAL_VARIANT_PREFIXES = ["新", "古", "上", "中"];
const BIOME_COST = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150];
const STATE_COLOR_PALETTE = [
  "#b7c8f3", "#f6b6c8", "#abe7c1", "#f8dda1", "#cbbdf1", "#aee3e8",
  "#f3b7a8", "#d5eda2", "#e9b9db", "#b6d7a8", "#c5d8f2", "#ffd0a6",
  "#b6e3d4", "#e8d1a6", "#d4c2ea", "#f1c0b9", "#c8e6a0", "#b9d2dc",
  "#e5c3a6", "#c7bfdc", "#f7c7dc", "#bde7ef", "#e8eca8", "#d0e0bd",
  "#d7c2a7", "#c7d6ee", "#f0c0a8", "#bee1c8", "#e2c3d7", "#cfd2b5"
];

export function buildPolitics(grid, features, society, rivers, random, options, pack) {
  if (pack?.burgs?.some?.(burg => burg?.capital)) return buildPackPolitics(grid, features, society, rivers, random, options, pack);

  const profile = createStageProfile();
  const landCells = profile.stage("land-cells", "收集陆地 cell", () => grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell)));
  const settledCells = profile.stage("settled-cells", "收集已定居 cell", () => landCells.filter(item => (grid.cells.culture?.[item.cell] || 0) > 0 && (grid.cells.pop?.[item.cell] || 0) > 0));
  const politicalCells = settledCells.length ? settledCells : landCells;
  const riverCells = profile.stage("river-cell-index", "建立河流 cell 索引", () => new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells)));

  const states = profile.stage("states-build", "生成国家中心", () => buildStates(grid, politicalCells, society, random));
  grid.cells.state = profile.stage("states-expand", "扩张国家", () => expandStates(grid, features, states, riverCells));
  profile.stage("states-neighbors", "计算国家相邻关系", () => findGridStateNeighbors(grid, states));
  profile.stage("states-governments", "定义国家政体与国号", () => defineStateGovernments(states, options));
  profile.stage("states-colors", "分配国家颜色", () => assignStateColors(states));

  const provinces = profile.stage("provinces-build", "生成省份中心", () => buildProvinces(grid, politicalCells, states, society, random));
  grid.cells.province = profile.stage("provinces-expand", "扩张省份", () => expandProvinces(grid, features, provinces, riverCells));
  profile.stage("provinces-neighbors", "计算省份相邻关系", () => findGridProvinceNeighbors(grid, provinces));
  profile.stage("provinces-colors", "分配省份颜色", () => assignProvinceColors(provinces));

  const regions = profile.stage("regions-build", "生成区域定义", () => buildRegions());
  grid.cells.region = profile.stage("regions-expand", "扩张区域", () => assignRegions(grid, features, regions, riverCells, options));
  const timing = profile.finish();

  return {
    states,
    provinces,
    regions,
    timing,
    metadata: {
      states: states.length,
      provinces: provinces.length,
      regions: regions.length,
      stateNames: states.map(state => state.fullName || state.name),
      stateGovernments: summarizeStateGovernments(states),
      provinceNames: provinces.map(province => province.name),
      regionNames: regions.map(region => region.name)
    }
  };
}

export function regeneratePackStatesAndProvinces(grid, society, options, pack, settlements, {salt = 0} = {}) {
  if (!pack?.cells?.i?.length || !pack?.burgs?.length) return null;
  const profile = createStageProfile();
  const random = profile.stage("random-states", "初始化国家重算随机源", () => createRandom(regenerationSeed(options, "regenerate-states", salt)));
  const nameGenerator = profile.stage("name-generator", "初始化政区命名器", () => createChineseNameGenerator(regenerationSeed(options, "regenerate-politics-names", salt), {namebases: options.namebases}));

  const selectedCapitals = profile.stage("capitals-select", "重新选择国家首都", () => selectRegeneratedCapitalBurgs(pack, settlements, options, random));
  if (!selectedCapitals.length) return null;

  const states = profile.stage("states-build", "生成国家对象", () => buildPackStates(pack, society, random, nameGenerator));
  profile.stage("states-expand", "扩张 pack 国家", () => expandPackStates(pack, states, society));
  profile.stage("states-normalize", "整理国家边界", () => normalizePackStates(pack, states));
  profile.stage("states-claim-neutral", "吸收已定居中立 cell", () => claimInhabitedNeutralCells(pack, states));
  profile.stage("states-smooth-spikes", "吸收国家边界毛刺", () => smoothPackStateBoundarySpikes(pack, states));
  profile.stage("states-sync-burgs", "同步城市国家归属", () => syncBurgStates(pack));
  profile.stage("states-statistics", "统计国家数据", () => collectStateStatistics(pack, states));
  profile.stage("states-name-orientation", "校正国家方位名", () => orientPackStateDirectionalNames(pack, states));
  profile.stage("states-neighbors", "计算国家相邻关系", () => findStateNeighbors(pack, states));
  profile.stage("states-governments", "定义国家政体与国号", () => defineStateGovernments(states, options));
  profile.stage("states-colors", "分配国家颜色", () => assignStateColors(states));
  grid.cells.state = profile.stage("states-mirror-grid", "镜像国家到 grid", () => mirrorPackStateToGrid(grid, pack));

  const provinces = profile.stage("provinces-rebuild", "重建 pack 省份", () => buildPackProvinces(pack, society, createRandom(regenerationSeed(options, "regenerate-provinces", salt)), options, nameGenerator));
  grid.cells.province = profile.stage("provinces-mirror-grid", "镜像省份到 grid", () => mirrorPackProvinceToGrid(grid, pack));

  const timing = profile.finish();
  return {
    states,
    provinces,
    timing,
    provinceTiming: provinces.timing || null,
    metadata: createPackPoliticsMetadata(states, provinces)
  };
}

export function regeneratePackProvincesWithinStates(grid, society, options, pack, {salt = 0} = {}) {
  if (!pack?.cells?.i?.length || !pack?.states?.some?.(state => state?.i)) return null;
  const profile = createStageProfile();
  const random = profile.stage("random-provinces", "初始化省份重算随机源", () => createRandom(regenerationSeed(options, "regenerate-provinces", salt)));
  const nameGenerator = profile.stage("name-generator", "初始化省份命名器", () => createChineseNameGenerator(regenerationSeed(options, "regenerate-province-names", salt), {namebases: options.namebases}));
  const provinces = profile.stage("provinces-rebuild", "重建 pack 省份", () => buildPackProvinces(pack, society, random, options, nameGenerator));
  grid.cells.province = profile.stage("provinces-mirror-grid", "镜像省份到 grid", () => mirrorPackProvinceToGrid(grid, pack));
  const timing = profile.finish();
  return {
    provinces,
    timing,
    provinceTiming: provinces.timing || null,
    metadata: {
      provinces: provinces.filter(province => province?.i).length,
      provinceNames: provinces.filter(province => province?.i).map(province => province.fullName || province.name)
    }
  };
}

function buildPackPolitics(grid, features, society, rivers, random, options, pack) {
  const profile = createStageProfile();
  const riverCells = profile.stage("river-cell-index", "建立河流 cell 索引", () => new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells)));

  const nameGenerator = profile.stage("name-generator", "初始化政区命名器", () => createChineseNameGenerator(options.seed, {namebases: options.namebases}));
  const states = profile.stage("states-build", "生成国家对象", () => buildPackStates(pack, society, random, nameGenerator));
  profile.stage("states-expand", "扩张 pack 国家", () => expandPackStates(pack, states, society));
  profile.stage("states-normalize", "整理国家边界", () => normalizePackStates(pack, states));
  profile.stage("states-claim-neutral", "吸收已定居中立 cell", () => claimInhabitedNeutralCells(pack, states));
  profile.stage("states-smooth-spikes", "吸收国家边界毛刺", () => smoothPackStateBoundarySpikes(pack, states));
  profile.stage("states-sync-burgs", "同步城市国家归属", () => syncBurgStates(pack));
  profile.stage("states-statistics", "统计国家数据", () => collectStateStatistics(pack, states));
  profile.stage("states-name-orientation", "校正国家方位名", () => orientPackStateDirectionalNames(pack, states));
  profile.stage("states-neighbors", "计算国家相邻关系", () => findStateNeighbors(pack, states));
  profile.stage("states-governments", "定义国家政体与国号", () => defineStateGovernments(states, options));
  profile.stage("states-colors", "分配国家颜色", () => assignStateColors(states));
  grid.cells.state = profile.stage("states-mirror-grid", "镜像国家到 grid", () => mirrorPackStateToGrid(grid, pack));

  const provinces = profile.stage("provinces-build", "生成 pack 省份", () => buildPackProvinces(pack, society, createRandom(options.seed), options, nameGenerator));
  grid.cells.province = profile.stage("provinces-mirror-grid", "镜像省份到 grid", () => mirrorPackProvinceToGrid(grid, pack));

  const regions = profile.stage("regions-build", "生成区域定义", () => buildRegions());
  grid.cells.region = profile.stage("regions-expand", "扩张区域", () => assignRegions(grid, features, regions, riverCells, options));

  const validStates = states.filter(state => state?.i);
  const timing = profile.finish();
  return {
    states,
    provinces,
    regions,
    timing,
    provinceTiming: provinces.timing || null,
    metadata: {
      states: validStates.length,
      provinces: provinces.filter(province => province?.i).length,
      regions: regions.length,
      stateNames: validStates.map(state => state.fullName || state.name),
      stateGovernments: summarizeStateGovernments(validStates),
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
    const formName = id % 5 === 0 ? "王国" : "国";
    return {
      id,
      name: root,
      form: "Monarchy",
      formName,
      fullName: getStateFullName(root, formName),
      center: center.cell,
      culture: grid.cells.culture[center.cell],
      religion: grid.cells.religion[center.cell]
    };
  });
}

function buildPackStates(pack, society, random, nameGenerator) {
  const states = [{id: 0, i: 0, name: "中立", center: 0, culture: 0, type: "Neutral", expansionism: 0}];
  const capitals = pack.burgs.filter(burg => burg?.i && burg.capital && !burg.removed);

  for (const burg of capitals) {
    const culture = society.cultures[burg.culture];
    const root = nameGenerator.makeStateRoot({
      id: burg.i,
      cell: burg.cell,
      culture: burg.culture,
      cultureRoot: culture?.root || culture?.name,
      cultureType: culture?.nameStyle || culture?.type,
      capitalName: burg.name,
      allowCapitalName: false,
      type: culture?.type || "Generic"
    }) || culture?.name?.replace("文化", "") || STATE_ROOTS[burg.i % STATE_ROOTS.length];
    const id = burg.i;
    states[id] = {
      id,
      i: id,
      name: root,
      center: burg.cell,
      gridCenter: pack.cells.g[burg.cell],
      capital: burg.i,
      culture: burg.culture,
      religion: pack.cells.religion?.[burg.cell] ?? 0,
      type: culture?.type || "Generic",
      nameStyle: culture?.nameStyle || null,
      expansionism: round(random.range(1, 2), 1),
      cells: 0,
      area: 0,
      burgs: 0,
      rural: 0,
      urban: 0,
      neighbors: [],
      coa: nameGenerator.makeEmblem({
        id,
        kind: "state",
        cell: burg.cell,
        culture: burg.culture,
        type: culture?.type || "Generic",
        x: burg.x,
        y: burg.y
      })
    };
  }

  pack.states = states;
  return states;
}

function selectRegeneratedCapitalBurgs(pack, settlements, options, random) {
  const aliveBurgs = (pack.burgs || []).filter(burg => burg?.i && !burg.removed && pack.cells.h?.[burg.cell] >= 20);
  const currentCapitals = aliveBurgs.filter(burg => burg.capital);
  const target = clamp(currentCapitals.length || Number(options.statesNumber) || 12, 1, Math.min(aliveBurgs.length, 40));
  if (!target) return [];

  const candidates = aliveBurgs
    .map(burg => ({
      burg,
      score: getCapitalCandidateScore(pack, burg, random)
    }))
    .sort((a, b) => b.score - a.score || a.burg.i - b.burg.i)
    .map(item => item.burg);
  const selected = pickSpacedCapitalBurgs(pack, candidates, target);
  applyCapitalSelection(pack, settlements, new Set(selected.map(burg => burg.i)));
  return selected;
}

function getCapitalCandidateScore(pack, burg, random) {
  const cell = burg.cell;
  const suitability = pack.cells.s?.[cell] || 0;
  const population = burg.population || 0;
  const portBonus = burg.port ? 8 : 0;
  const cultureSpread = pack.cells.culture?.[cell] ? 4 : 0;
  return population * random.range(70, 130) + suitability * random.range(2, 5) + portBonus + cultureSpread + random.range(0, 30);
}

function pickSpacedCapitalBurgs(pack, candidates, target) {
  const selected = [];
  let spacing = estimateCapitalSpacing(pack, target);

  while (selected.length < target && spacing > 1) {
    let added = false;
    const cultureCounts = countSelectedCapitalCultures(pack, selected);
    for (const burg of candidates) {
      if (selected.includes(burg)) continue;
      if (selected.length >= target) break;
      const culture = pack.cells.culture?.[burg.cell] || 0;
      const cultureSoftCap = Math.max(1, Math.ceil(target / 4));
      if ((cultureCounts.get(culture) || 0) >= cultureSoftCap && selected.length < Math.ceil(target * 0.75)) continue;
      if (selected.some(item => distance(pack.cells.p[item.cell], pack.cells.p[burg.cell]) < spacing)) continue;
      selected.push(burg);
      cultureCounts.set(culture, (cultureCounts.get(culture) || 0) + 1);
      added = true;
    }
    spacing *= added ? 0.86 : 0.72;
  }

  for (const burg of candidates) {
    if (selected.length >= target) break;
    if (!selected.includes(burg)) selected.push(burg);
  }
  return selected;
}

function countSelectedCapitalCultures(pack, selected) {
  const counts = new Map();
  for (const burg of selected) {
    const culture = pack.cells.culture?.[burg.cell] || 0;
    counts.set(culture, (counts.get(culture) || 0) + 1);
  }
  return counts;
}

function estimateCapitalSpacing(pack, target) {
  const points = (pack.burgs || []).filter(burg => burg?.i && !burg.removed && pack.cells.p?.[burg.cell]).map(burg => pack.cells.p[burg.cell]);
  if (!points.length) return 1;
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return Math.max(1, (width + height) / 2 / Math.max(1, target));
}

function applyCapitalSelection(pack, settlements, selectedBurgIds) {
  const citiesByBurg = new Map((settlements?.cities || []).map(city => [city.burgId, city]));
  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const selected = selectedBurgIds.has(burg.i);
    burg.capital = selected ? 1 : 0;
    burg.group = selected ? "capital" : burg.port ? "city" : burg.population >= 5 ? "city" : burg.population <= 0.1 ? "hamlet" : "town";
    const city = citiesByBurg.get(burg.i);
    if (!city) continue;
    city.capital = selected;
    city.group = selected ? "capital" : city.port ? "city" : city.population >= 5 ? "city" : city.population <= 0.1 ? "hamlet" : "town";
  }
}

function createPackPoliticsMetadata(states, provinces, regions = []) {
  const validStates = states.filter(state => state?.i && !state.removed);
  const validProvinces = provinces.filter(province => province?.i && !province.removed);
  return {
    states: validStates.length,
    provinces: validProvinces.length,
    regions: regions.length,
    stateNames: validStates.map(state => state.fullName || state.name),
    stateGovernments: summarizeStateGovernments(validStates),
    provinceNames: validProvinces.map(province => province.fullName || province.name),
    regionNames: regions.map(region => region.name)
  };
}

function orientPackStateDirectionalNames(pack, states) {
  const groups = new Map();
  const validStates = states.filter(state => state?.i && !state.removed);
  for (const state of validStates) {
    const parsed = parseDirectionalStateName(state.name);
    if (!parsed?.directional) continue;
    if (!groups.has(parsed.base)) groups.set(parsed.base, []);
    groups.get(parsed.base).push({...parsed, state, point: stateNamePoint(pack, state)});
  }

  if (!groups.size) return;

  for (const state of validStates) {
    const name = String(state.name || "");
    if (!groups.has(name)) continue;
    groups.get(name).push({base: name, prefix: "", directional: false, state, point: stateNamePoint(pack, state)});
  }

  for (const [base, members] of groups) {
    const directionalMembers = members.filter(member => member.directional);
    if (!directionalMembers.length) continue;
    const pointMembers = members.filter(member => member.point);
    if (members.length === 1) {
      applyStateRootName(directionalMembers[0].state, neutralStateDirectionalName(base, directionalMembers[0].state, validStates), "isolated-directional");
      continue;
    }
    if (pointMembers.length < 2) {
      for (const member of directionalMembers) applyStateRootName(member.state, neutralStateDirectionalName(base, member.state, validStates), "unresolved-directional");
      continue;
    }

    const bounds = stateNameBounds(pointMembers);
    const used = new Set();
    for (const member of directionalMembers.sort((a, b) => directionStrength(b.point, bounds) - directionStrength(a.point, bounds))) {
      const prefix = preferredStateDirection(member.point, bounds, used);
      if (!prefix) continue;
      used.add(prefix);
      applyStateRootName(member.state, `${prefix}${base}`, "relative-directional");
    }
  }
}

function parseDirectionalStateName(name) {
  const rawName = String(name || "").trim();
  const chars = Array.from(rawName);
  if (chars.length < 2) return null;
  const prefix = chars[0];
  if (!STATE_CARDINAL_PREFIXES.includes(prefix)) return isAncientStateNameRoot(rawName) ? {base: rawName, prefix: "", directional: false} : null;
  const base = chars.slice(1).join("");
  if (!base) return null;
  return {base, prefix, directional: true};
}

function neutralStateDirectionalName(base, state, states) {
  const usedNames = new Set(states.filter(item => item !== state).map(item => item.name).filter(Boolean));
  const candidates = [base, ...STATE_NEUTRAL_VARIANT_PREFIXES.map(prefix => `${prefix}${base}`)];
  return candidates.find(candidate => candidate && !usedNames.has(candidate)) || `${base}${state.i}`;
}

function stateNamePoint(pack, state) {
  const cellPoint = pack?.cells?.p?.[state.center];
  if (Array.isArray(cellPoint)) return {x: Number(cellPoint[0]) || 0, y: Number(cellPoint[1]) || 0};
  const capital = pack?.burgs?.[state.capital];
  if (capital && Number.isFinite(capital.x) && Number.isFinite(capital.y)) return {x: capital.x, y: capital.y};
  return null;
}

function stateNameBounds(members) {
  const xs = members.map(member => member.point.x);
  const ys = members.map(member => member.point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function preferredStateDirection(point, bounds, used) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const dx = (point.x - centerX) / width;
  const dy = (point.y - centerY) / height;
  const horizontal = dx < 0 ? "西" : "东";
  const vertical = dy < 0 ? "北" : "南";
  const secondaryHorizontal = horizontal === "西" ? "东" : "西";
  const secondaryVertical = vertical === "北" ? "南" : "北";
  const preferences = Math.abs(dx) >= Math.abs(dy)
    ? [horizontal, vertical, secondaryHorizontal, secondaryVertical]
    : [vertical, horizontal, secondaryVertical, secondaryHorizontal];
  return preferences.find(prefix => !used.has(prefix)) || "";
}

function directionStrength(point, bounds) {
  if (!point) return 0;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return Math.max(Math.abs((point.x - centerX) / width), Math.abs((point.y - centerY) / height));
}

function applyStateRootName(state, nextName, reason) {
  if (!state || !nextName || state.name === nextName) return;
  const previousName = state.name;
  state.name = nextName;
  if (state.formName) state.fullName = getStateFullName(nextName, state.formName);
  state.nameOrientation = {from: previousName, to: nextName, reason};
}

function defineStateGovernments(states, options = {}) {
  const validStates = states.filter(state => state && !state.removed && (state.i > 0 || (state.i === undefined && Number.isInteger(state.id))));
  if (!validStates.length) return;
  const areas = validStates.map(state => state.area || 0).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)] || 1;
  const empireThreshold = [...areas].sort((a, b) => b - a)[Math.max(Math.ceil(validStates.length ** 0.4) - 2, 0)] || medianArea;

  for (const state of validStates) {
    const government = chooseStateGovernment(state, {
      seed: options.seed,
      medianArea,
      empireThreshold,
      states: validStates
    });
    applyStateGovernment(state, government, {
      seed: options.seed,
      medianArea,
      empireThreshold,
      states: validStates
    });
  }
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

function smoothPackStateBoundarySpikes(pack, states) {
  const {cells, burgs} = pack;
  const protectedCells = new Set(
    burgs
      .filter(burg => burg?.i && !burg.removed && cells.h[burg.cell] >= 20)
      .map(burg => burg.cell)
  );

  absorbBoundarySpikes(cells, cells.state, {
    passes: 3,
    protectedCells,
    canInspect: cell => cells.h[cell] >= 20 && Boolean(states[cells.state[cell]]),
    canUseNeighbor: neighbor => cells.h[neighbor] >= 20,
    canAbsorbTo: value => value > 0 && Boolean(states[value])
  });
}

function claimInhabitedNeutralCells(pack, states) {
  const {cells} = pack;
  if (!cells?.state) return;
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new MinPriorityQueue();

  for (const cell of cells.i) {
    const stateId = cells.state[cell] || 0;
    if (!stateId || !states[stateId]) continue;
    costs[cell] = 0;
    queue.push({cell, stateId, cost: 0}, 0);
  }

  while (queue.length) {
    const {cell, stateId, cost} = queue.pop();
    if (cost > costs[cell]) continue;

    for (const neighbor of cells.c[cell] || []) {
      if (cells.state[neighbor]) continue;
      if (!isInhabitedNeutralCell(cells, neighbor)) continue;
      const step = distance(cells.p[cell], cells.p[neighbor]) * (1 + Math.max((cells.h?.[neighbor] || 20) - 55, 0) / 45);
      const nextCost = cost + step;
      if (nextCost >= costs[neighbor]) continue;
      cells.state[neighbor] = stateId;
      costs[neighbor] = nextCost;
      queue.push({cell: neighbor, stateId, cost: nextCost}, nextCost);
    }
  }

  claimIsolatedInhabitedNeutralCells(pack, states);
}

function isInhabitedNeutralCell(cells, cell) {
  if (cells.h?.[cell] < 20) return false;
  if (cells.burg?.[cell]) return true;
  return (cells.s?.[cell] || 0) > 0 && (cells.culture?.[cell] || 0) > 0;
}

function claimIsolatedInhabitedNeutralCells(pack, states) {
  const {cells} = pack;
  const centers = states
    .filter(state => state?.i && cells.p?.[state.center])
    .map(state => ({stateId: state.i, point: cells.p[state.center]}));
  if (!centers.length) return;

  for (const cell of cells.i) {
    if (cells.state[cell] || !isInhabitedNeutralCell(cells, cell)) continue;
    let bestState = 0;
    let bestDistance = Infinity;
    for (const center of centers) {
      const nextDistance = distance(cells.p[cell], center.point);
      if (nextDistance >= bestDistance) continue;
      bestState = center.stateId;
      bestDistance = nextDistance;
    }
    if (bestState) cells.state[cell] = bestState;
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
  const validStates = states.filter(isStateColorTarget);
  const coloredStates = [];
  const usedColors = new Set();
  const ordered = [...validStates].sort((a, b) => {
    const degree = (b.neighbors?.length || 0) - (a.neighbors?.length || 0);
    return degree || (b.area || 0) - (a.area || 0) || stateColorId(a) - stateColorId(b);
  });

  for (const state of ordered) {
    state.color = chooseStateColor(state, states, coloredStates.length, usedColors);
    coloredStates.push(state);
    usedColors.add(state.color);
  }
}

function findGridStateNeighbors(grid, states) {
  const neighbors = states.map(() => new Set());
  const cells = grid.cells;

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const stateId = cells.state[cell];
    if (!states[stateId]) continue;
    for (const neighbor of cells.c[cell] || []) {
      const neighborState = cells.state[neighbor];
      if (cells.h[neighbor] < 20 || neighborState === stateId || !states[neighborState]) continue;
      neighbors[stateId].add(neighborState);
    }
  }

  for (const state of states) {
    if (!state) continue;
    const id = stateColorId(state);
    state.neighbors = Array.from(neighbors[id] || []);
  }
}

function chooseStateColor(state, states, coloredCount, usedColors) {
  const neighborColors = (state.neighbors || []).map(id => states[id]?.color).filter(Boolean);
  const globalColors = Array.from(usedColors);
  const fallbackIndex = coloredCount % STATE_COLOR_PALETTE.length;
  let bestColor = STATE_COLOR_PALETTE[fallbackIndex];
  let bestScore = -Infinity;

  for (let index = 0; index < STATE_COLOR_PALETTE.length; index++) {
    const color = STATE_COLOR_PALETTE[(fallbackIndex + index) % STATE_COLOR_PALETTE.length];
    const sameAsNeighbor = neighborColors.includes(color);
    const unusedBonus = usedColors.has(color) ? 0 : 0.05;
    const neighborDistance = minColorDistance(color, neighborColors, 2);
    const globalDistance = minColorDistance(color, globalColors, 1);
    const score = neighborDistance * 4 + globalDistance * 0.6 + unusedBonus - (sameAsNeighbor ? 10000 : 0) - index * 0.001;
    if (score <= bestScore) continue;
    bestScore = score;
    bestColor = color;
  }

  return bestColor;
}

function minColorDistance(color, colors, emptyValue) {
  if (!colors.length) return emptyValue;
  return Math.min(...colors.map(other => colorDistance(color, other)));
}

function colorDistance(a, b) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb) / Math.sqrt(3);
}

function hexToRgb(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function isStateColorTarget(state) {
  return Boolean(state && !state.removed && (state.i > 0 || (state.i === undefined && Number.isInteger(state.id))));
}

function stateColorId(state) {
  return state.i ?? state.id;
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

  smoothMirroredGridStates(grid, pack, values);
  return values;
}

function smoothMirroredGridStates(grid, pack, values) {
  const protectedCells = protectedGridCellsForPackBurgs(pack, {capitalsOnly: true});
  absorbBoundarySpikes(grid.cells, values, {
    passes: 3,
    protectedCells,
    canInspect: cell => grid.cells.h[cell] >= 20 && values[cell] > 0,
    canUseNeighbor: neighbor => grid.cells.h[neighbor] >= 20,
    canAbsorbTo: value => value > 0
  });
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

function buildPackProvinces(pack, society, random, options, nameGenerator) {
  const profile = createStageProfile();
  const {cells, states, burgs} = pack;
  const provinces = [null];
  const provinceIds = new Uint16Array(cells.i.length);
  const provincesRatio = Math.max(0, Math.min(100, Number(options.provincesRatio ?? 20)));
  const maxGrowth = provincesRatio === 100 ? 1000 : gauss(random, 20, 5, 5, 100) * Math.sqrt(provincesRatio);

  profile.stage("seed-provinces", "选择省份中心", () => {
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
        const sourceRoot = (index % 2 === 0 || culture?.nameStyle ? burg.name : culture?.name?.replace("文化", "")) || STATE_ROOTS[provinceId % STATE_ROOTS.length];
        const provinceName = nameGenerator.makeProvinceName({
          id: provinceId,
          cell: burg.cell,
          culture: burg.culture,
          cultureType: culture?.nameStyle || culture?.type,
          state: state.i,
          baseName: sourceRoot
        });
        const province = {
          id: provinceId,
          i: provinceId,
          state: state.i,
          center: burg.cell,
          gridCenter: cells.g[burg.cell],
          burg: burg.i,
          name: provinceName.name,
          formName: provinceName.formName,
          fullName: provinceName.fullName,
          color: state.color,
          cells: 0,
          area: 0
        };
        provinces.push(province);
        state.provinces.push(provinceId);
        provinceIds[burg.cell] = provinceId;
      }
    }
  });

  profile.stage("expand-provinces", "扩张省份", () => expandPackProvinces(pack, provinces, provinceIds, maxGrowth));
  profile.stage("justify-provinces", "整理省份边界", () => justifyPackProvinces(pack, provinces, provinceIds));
  profile.stage("fill-unassigned", "填充未归属省份 cell", () => fillUnassignedProvinceCells(pack, provinces, provinceIds, random, maxGrowth, nameGenerator));
  profile.stage("smooth-spikes", "吸收省份边界毛刺", () => smoothPackProvinceBoundarySpikes(pack, provinces, provinceIds));
  profile.stage("statistics", "统计省份数据", () => collectProvinceStatistics(pack, provinces, provinceIds));
  profile.stage("assign-poles", "计算省份 pole", () => assignProvincePoles(pack, provinces, provinceIds));
  profile.stage("neighbors", "计算省份相邻关系", () => findPackProvinceNeighbors(pack, provinces, provinceIds));
  profile.stage("colors", "分配省份颜色", () => assignProvinceColors(provinces));
  cells.province = provinceIds;
  pack.provinces = provinces;
  provinces.timing = profile.finish();
  return provinces;
}

function findPackProvinceNeighbors(pack, provinces, provinceIds) {
  const neighbors = provinces.map(() => new Set());
  const {cells} = pack;

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const provinceId = provinceIds[cell];
    if (!provinces[provinceId]) continue;
    for (const neighbor of cells.c[cell] || []) {
      const neighborProvince = provinceIds[neighbor];
      if (cells.h[neighbor] < 20 || neighborProvince === provinceId || !provinces[neighborProvince]) continue;
      neighbors[provinceId].add(neighborProvince);
    }
  }

  for (const province of provinces) {
    if (!province) continue;
    const id = provinceColorId(province);
    province.neighbors = Array.from(neighbors[id] || []);
  }
}

function findGridProvinceNeighbors(grid, provinces) {
  const neighbors = provinces.map(() => new Set());
  const cells = grid.cells;

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const provinceId = cells.province[cell];
    if (!provinces[provinceId]) continue;
    for (const neighbor of cells.c[cell] || []) {
      const neighborProvince = cells.province[neighbor];
      if (cells.h[neighbor] < 20 || neighborProvince === provinceId || !provinces[neighborProvince]) continue;
      neighbors[provinceId].add(neighborProvince);
    }
  }

  for (const province of provinces) {
    if (!province) continue;
    const id = provinceColorId(province);
    province.neighbors = Array.from(neighbors[id] || []);
  }
}

function assignProvinceColors(provinces) {
  const validProvinces = provinces.filter(isProvinceColorTarget);
  const coloredProvinces = [];
  const usedColors = new Set();
  const ordered = [...validProvinces].sort((a, b) => {
    const degree = (b.neighbors?.length || 0) - (a.neighbors?.length || 0);
    return degree || (b.area || 0) - (a.area || 0) || provinceColorId(a) - provinceColorId(b);
  });

  for (const province of ordered) {
    province.color = chooseProvinceColor(province, provinces, coloredProvinces.length, usedColors);
    coloredProvinces.push(province);
    usedColors.add(province.color);
  }
}

function chooseProvinceColor(province, provinces, coloredCount, usedColors) {
  const neighborColors = (province.neighbors || []).map(id => provinces[id]?.color).filter(Boolean);
  const globalColors = Array.from(usedColors);
  const fallbackIndex = coloredCount % STATE_COLOR_PALETTE.length;
  let bestColor = STATE_COLOR_PALETTE[fallbackIndex];
  let bestScore = -Infinity;

  for (let index = 0; index < STATE_COLOR_PALETTE.length; index++) {
    const color = STATE_COLOR_PALETTE[(fallbackIndex + index) % STATE_COLOR_PALETTE.length];
    const sameAsNeighbor = neighborColors.includes(color);
    const unusedBonus = usedColors.has(color) ? 0 : 0.05;
    const neighborDistance = minColorDistance(color, neighborColors, 2);
    const globalDistance = minColorDistance(color, globalColors, 1);
    const score = neighborDistance * 4 + globalDistance * 0.6 + unusedBonus - (sameAsNeighbor ? 10000 : 0) - index * 0.001;
    if (score <= bestScore) continue;
    bestScore = score;
    bestColor = color;
  }

  return bestColor;
}

function isProvinceColorTarget(province) {
  return Boolean(province && !province.removed && Number.isInteger(provinceColorId(province)));
}

function provinceColorId(province) {
  return province.i ?? province.id;
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

function smoothPackProvinceBoundarySpikes(pack, provinces, provinceIds) {
  const {cells} = pack;
  const protectedCells = new Set();
  for (const province of provinces) {
    if (province?.i && cells.h[province.center] >= 20) protectedCells.add(province.center);
  }
  for (const cell of cells.i) {
    if (cells.burg[cell] && cells.h[cell] >= 20) protectedCells.add(cell);
  }

  absorbBoundarySpikes(cells, provinceIds, {
    passes: 3,
    protectedCells,
    canInspect: cell => cells.h[cell] >= 20 && Boolean(provinces[provinceIds[cell]]),
    canUseNeighbor: (neighbor, cell) => cells.h[neighbor] >= 20 && cells.state[neighbor] === cells.state[cell],
    canAbsorbTo: value => value > 0 && Boolean(provinces[value])
  });
}

function absorbBoundarySpikes(cells, values, {passes = 1, protectedCells = new Set(), canInspect, canUseNeighbor, canAbsorbTo}) {
  if (!cells?.i || !cells?.c || !values) return 0;
  let totalChanged = 0;

  for (let pass = 0; pass < passes; pass++) {
    const changes = [];

    for (const cell of cells.i) {
      if (protectedCells.has(cell) || !canInspect(cell)) continue;
      const nextValue = boundarySpikeAbsorptionValue(cells, values, cell, canUseNeighbor, canAbsorbTo);
      if (nextValue !== null && nextValue !== values[cell]) changes.push([cell, nextValue]);
    }

    if (!changes.length) break;
    for (const [cell, value] of changes) values[cell] = value;
    totalChanged += changes.length;
  }

  return totalChanged;
}

function boundarySpikeAbsorptionValue(cells, values, cell, canUseNeighbor, canAbsorbTo) {
  const ownValue = values[cell] || 0;
  if (!ownValue) return null;
  const counts = new Map();
  let ownNeighbors = 0;
  let inspectedNeighbors = 0;

  for (const neighbor of cells.c[cell] || []) {
    if (!canUseNeighbor(neighbor, cell)) continue;
    inspectedNeighbors++;
    const neighborValue = values[neighbor] || 0;
    if (neighborValue === ownValue) {
      ownNeighbors++;
      continue;
    }
    if (!canAbsorbTo(neighborValue)) continue;
    counts.set(neighborValue, (counts.get(neighborValue) || 0) + 1);
  }

  if (inspectedNeighbors < 3 || !counts.size) return null;
  let bestValue = 0;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count <= bestCount) continue;
    bestValue = value;
    bestCount = count;
  }

  if (bestCount < 2) return null;
  if (ownNeighbors === 0) return bestValue;
  if (ownNeighbors === 1 && bestCount >= 2) return bestValue;
  if (ownNeighbors <= 2 && bestCount >= ownNeighbors + 1) return bestValue;
  return null;
}

function fillUnassignedProvinceCells(pack, provinces, provinceIds, random, maxGrowth, nameGenerator) {
  const {cells, states, burgs} = pack;
  const unassignedByState = collectUnassignedProvinceCellsByState(cells, states, provinceIds);
  const remaining = new Uint8Array(cells.i.length);
  for (const stateCells of unassignedByState) {
    if (!stateCells) continue;
    for (const cell of stateCells) remaining[cell] = 1;
  }
  const costs = new Float64Array(cells.i.length);
  const seen = new Uint32Array(cells.i.length);
  const queue = new MinPriorityQueue();
  let runId = 0;

  for (const state of states) {
    if (!state?.i || !state.provinces?.length) continue;
    const stateUnassigned = unassignedByState[state.i] || [];
    let remainingCount = stateUnassigned.length;

    while (remainingCount) {
      const center = pickUnassignedProvinceCenter(stateUnassigned, remaining, cells.burg);
      if (center === -1) break;
      const provinceId = provinces.length;
      const burgId = cells.burg[center] || 0;
      const burg = burgs[burgId];
      const provinceName = nameGenerator.makeProvinceName({
        id: provinceId,
        cell: center,
        culture: burg?.culture || state.culture,
        cultureType: pack.cultures?.[burg?.culture || state.culture]?.nameStyle || pack.cultures?.[burg?.culture || state.culture]?.type,
        state: state.i,
        baseName: burg?.name || state.name
      });
      if (!burg) provinceName.formName = "边地";
      provinceName.fullName = `${provinceName.name}${provinceName.formName}`;
      const province = {
        id: provinceId,
        i: provinceId,
        state: state.i,
        center,
        gridCenter: cells.g[center],
        burg: burgId,
        name: provinceName.name,
        formName: provinceName.formName,
        fullName: provinceName.fullName,
        color: state.color,
        cells: 0,
        area: 0
      };
      provinces.push(province);
      state.provinces.push(provinceId);

      runId++;
      costs[center] = 0;
      seen[center] = runId;
      provinceIds[center] = provinceId;
      remaining[center] = 0;
      remainingCount--;
      queue.push({cell: center, cost: 0}, 0);

      while (queue.length) {
        const {cell, cost} = queue.pop();
        if (seen[cell] !== runId || cost !== costs[cell]) continue;
        for (const neighbor of cells.c[cell] || []) {
          if (provinceIds[neighbor]) continue;
          if (cells.state[neighbor] && cells.state[neighbor] !== state.i) continue;
          const land = cells.h[neighbor] >= 20;
          const step = land ? (cells.state[neighbor] === state.i ? 3 : 20) : cells.t[neighbor] ? 10 : 30;
          const nextCost = cost + step;
          const currentCost = seen[neighbor] === runId ? costs[neighbor] : Infinity;
          if (nextCost > maxGrowth || nextCost >= currentCost) continue;
          if (land && cells.state[neighbor] === state.i) {
            provinceIds[neighbor] = provinceId;
            if (remaining[neighbor]) {
              remaining[neighbor] = 0;
              remainingCount--;
            }
          }
          costs[neighbor] = nextCost;
          seen[neighbor] = runId;
          queue.push({cell: neighbor, cost: nextCost}, nextCost);
        }
      }
    }
  }
}

function collectUnassignedProvinceCellsByState(cells, states, provinceIds) {
  const byState = states.map(() => []);
  for (const cell of cells.i) {
    const stateId = cells.state[cell];
    if (!states[stateId]?.i || cells.h[cell] < 20 || provinceIds[cell]) continue;
    byState[stateId].push(cell);
  }
  return byState;
}

function pickUnassignedProvinceCenter(stateUnassigned, remaining, burgsByCell) {
  for (const cell of stateUnassigned) {
    if (remaining[cell] && burgsByCell[cell]) return cell;
  }
  for (const cell of stateUnassigned) {
    if (remaining[cell]) return cell;
  }
  return -1;
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

function assignProvincePoles(pack, provinces, provinceIds) {
  const provinceCells = new Map();
  const provinceBoundaryCells = new Map();
  const {cells} = pack;

  for (const cell of cells.i) {
    const provinceId = provinceIds[cell];
    if (!provinceId || cells.h[cell] < 20) continue;
    if (!provinceCells.has(provinceId)) provinceCells.set(provinceId, []);
    provinceCells.get(provinceId).push(cell);

    const isBoundary = (cells.c[cell] || []).some(neighbor => cells.h[neighbor] < 20 || provinceIds[neighbor] !== provinceId);
    if (isBoundary) {
      if (!provinceBoundaryCells.has(provinceId)) provinceBoundaryCells.set(provinceId, []);
      provinceBoundaryCells.get(provinceId).push(cell);
    }
  }

  for (const province of provinces) {
    if (!province?.i || province.removed) continue;
    const ownCells = provinceCells.get(province.i) || [];
    if (!ownCells.length) {
      province.pole = cells.p[province.center] ? cells.p[province.center].map(value => round(value, 2)) : [0, 0];
      continue;
    }

    const boundaryCells = provinceBoundaryCells.get(province.i) || ownCells;
    const poleCell = findPoleCell(cells, ownCells, boundaryCells, province.center);
    province.pole = cells.p[poleCell].map(value => round(value, 2));
  }
}

function findPoleCell(cells, ownCells, boundaryCells, fallbackCell) {
  if (ownCells.length <= 2) return fallbackCell && ownCells.includes(fallbackCell) ? fallbackCell : ownCells[0];

  let bestCell = ownCells[0];
  let bestScore = -Infinity;
  for (const cell of ownCells) {
    const minBoundaryDistance = getMinDistanceSquared(cells.p[cell], boundaryCells, cells);
    const populationScore = cells.pop?.[cell] || cells.s?.[cell] || 0;
    const burgScore = cells.burg?.[cell] ? 5 : 0;
    const score = minBoundaryDistance + populationScore * 0.02 + burgScore;
    if (score <= bestScore) continue;
    bestCell = cell;
    bestScore = score;
  }
  return bestCell;
}

function getMinDistanceSquared(point, boundaryCells, cells) {
  let min = Infinity;
  for (const cell of boundaryCells) {
    const next = distanceSquared(point, cells.p[cell]);
    if (next < min) min = next;
  }
  return Number.isFinite(min) ? min : 0;
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

  smoothMirroredGridProvinces(grid, pack, values);
  return values;
}

function smoothMirroredGridProvinces(grid, pack, values) {
  const protectedCells = protectedGridCellsForPackBurgs(pack, {capitalsOnly: true});
  for (const province of pack.provinces || []) {
    const gridCenter = Number.isInteger(province?.gridCenter) ? province.gridCenter : Number.isInteger(province?.center) ? pack.cells.g?.[province.center] : null;
    if (Number.isInteger(gridCenter) && grid.cells.h[gridCenter] >= 20) protectedCells.add(gridCenter);
  }

  absorbBoundarySpikes(grid.cells, values, {
    passes: 3,
    protectedCells,
    canInspect: cell => grid.cells.h[cell] >= 20 && values[cell] > 0,
    canUseNeighbor: (neighbor, cell) => grid.cells.h[neighbor] >= 20 && grid.cells.state?.[neighbor] === grid.cells.state?.[cell],
    canAbsorbTo: value => value > 0
  });
}

function protectedGridCellsForPackBurgs(pack, {capitalsOnly = false} = {}) {
  const protectedCells = new Set();
  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    if (capitalsOnly && !burg.capital) continue;
    const gridCell = pack.cells.g?.[burg.cell];
    if (Number.isInteger(gridCell)) protectedCells.add(gridCell);
  }
  return protectedCells;
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

function distanceSquared(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function regenerationSeed(options = {}, scope, salt) {
  const seed = options.seed || "map";
  return salt === undefined || salt === null || salt === "" ? `${seed}:${scope}` : `${seed}:${scope}:${salt}`;
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
