import {MinPriorityQueue} from "./priority-queue.js";
import {chooseStateGovernment, applyStateGovernment, summarizeStateGovernments} from "./governments.js";
import {createChineseNameGenerator, getStateFullName, isAncientStateNameRoot} from "./names.js";
import {legacyProvinceForm, provinceFormForState} from "./province-naming.js";
import {createStageProfile} from "./profile.js";
import {createRandom} from "./random.js";
import {createCityScaleContext, deriveCityScale} from "../runtime/city-visuals.js";
import {
  compactRiverPoliticalBoundaryDiagnostics,
  createRiverPoliticalBarrier,
  describeRiverPoliticalBoundaries,
  riverPoliticalTransition
} from "./river-political-barrier.js";

const STATE_ROOTS = ["昭宁", "雁川", "青岚", "星渚", "南衡", "白麓", "清河", "苍原", "岚湾", "云麓", "河洛", "云渡", "栖梧", "北辰", "东衡", "西麓", "南浦", "霜川", "泽阳", "柏原", "海津", "长岚", "玄丘", "玉津"];
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
  const riverBarrier = profile.stage("river-political-barrier", "建立大河政治阻隔", () => createRiverPoliticalBarrier({cells: grid.cells, rivers: rivers.rivers}, {cellPathKey: "gridCells"}));

  const states = profile.stage("states-build", "生成国家中心", () => buildStates(grid, politicalCells, society, random));
  grid.cells.state = profile.stage("states-expand", "扩张国家", () => expandStates(grid, features, states, riverCells, riverBarrier));
  profile.stage("states-neighbors", "计算国家相邻关系", () => findGridStateNeighbors(grid, states));
  profile.stage("states-governments", "定义国家政体与国号", () => defineStateGovernments(states, options));
  profile.stage("states-colors", "分配国家颜色", () => assignStateColors(states));

  const provinces = profile.stage("provinces-build", "生成省份中心", () => buildProvinces(grid, politicalCells, states, society, random));
  grid.cells.province = profile.stage("provinces-expand", "扩张省份", () => expandProvinces(grid, features, provinces, riverCells, riverBarrier));
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
      regionNames: regions.map(region => region.name),
      riverBoundaries: politicalRiverBoundaryDiagnostics(riverBarrier, grid.cells.state, grid.cells.province)
    }
  };
}

export function applyMapTemplateHistoricalPolitics(grid, society, settlements, politics, pack, options = {}) {
  const template = grid.metadata?.mapTemplate;
  const political = grid.cells?.templatePolitical;
  if (!template?.politicalResourceId || !political?.some?.(Boolean) || !pack?.cells?.i?.length) return null;
  const definition = historicalPresetDefinition(template.id);
  if (!definition) return null;

  const coreBurg = selectHistoricalCapital(pack, political, definition.coreClasses);
  if (!coreBurg) throw new Error(`${definition.name}缺少历史疆域内的首都候选`);
  const selectedCapitals = [coreBurg.i];
  const coreStateId = positiveStateId(coreBurg.state, 1);
  let clientStateId = 0;
  let clientBurg = null;
  if (definition.clientClasses.length) {
    clientBurg = selectHistoricalCapital(pack, political, definition.clientClasses, new Set([coreBurg.i]));
    if (clientBurg) {
      clientStateId = positiveStateId(clientBurg.state, nextAvailableStateId(pack.states, new Set([coreStateId])));
      if (clientStateId === coreStateId) clientStateId = nextAvailableStateId(pack.states, new Set([coreStateId]));
      selectedCapitals.push(clientBurg.i);
    }
  }

  const previousStates = pack.states || [];
  const states = [{id: 0, i: 0, name: "中立", center: 0, culture: 0, type: "Neutral", expansionism: 0}];
  states[coreStateId] = createHistoricalState(previousStates[coreStateId], coreStateId, coreBurg, pack.cells.g[coreBurg.cell], definition.name, definition.formName);
  if (clientStateId) states[clientStateId] = createHistoricalState(previousStates[clientStateId], clientStateId, clientBurg, pack.cells.g[clientBurg.cell], definition.clientName, "属邦");
  pack.states = states;
  politics.states = states;

  let coreCells = 0;
  let clientCells = 0;
  for (const cell of pack.cells.i) {
    if (pack.cells.h[cell] < 20) {
      pack.cells.state[cell] = 0;
      continue;
    }
    const value = political[pack.cells.g[cell]] || 0;
    if (definition.coreClasses.includes(value)) {
      pack.cells.state[cell] = coreStateId;
      coreCells++;
    } else if (clientStateId && definition.clientClasses.includes(value)) {
      pack.cells.state[cell] = clientStateId;
      clientCells++;
    } else pack.cells.state[cell] = 0;
  }
  if (!coreCells) throw new Error(`${definition.name}没有映射到有效陆地 cell`);

  applyCapitalSelection(pack, settlements, new Set(selectedCapitals));
  syncBurgStates(pack);
  collectStateStatistics(pack, states);
  findStateNeighbors(pack, states);
  assignStateColors(states);
  grid.cells.state = mirrorPackStateToGrid(grid, pack);

  const nameGenerator = createChineseNameGenerator(`${options.seed}|${template.id}|${template.snapshotYear}`, {namebases: options.namebases});
  const provinces = buildPackProvinces(pack, society, createRandom(`${options.seed}|${template.id}|provinces`), options, nameGenerator, null, new Set(), createRiverPoliticalBarrier(pack));
  grid.cells.province = mirrorPackProvinceToGrid(grid, pack);
  politics.provinces = provinces;
  politics.metadata = {
    ...createPackPoliticsMetadata(states, provinces, politics.regions, createRiverPoliticalBarrier(pack), pack.cells),
    historicalPreset: {
      id: `${template.id}-human-v1`,
      snapshotYear: template.snapshotYear,
      politicalResourceId: template.politicalResourceId,
      politicalResourceChecksum: template.politicalResourceChecksum,
      coreStateId,
      clientStateId: clientStateId || null,
      coreCells,
      clientCells
    }
  };
  return politics.metadata.historicalPreset;
}

function historicalPresetDefinition(templateId) {
  if (templateId === "roman-empire-117") return {name: "罗马", formName: "帝国", coreClasses: [1, 2], clientClasses: [3], clientName: "罗马"};
  if (templateId === "holy-roman-empire-1789") return {name: "神圣罗马", formName: "帝国", coreClasses: [1], clientClasses: [], clientName: ""};
  return null;
}

function selectHistoricalCapital(pack, political, classes, excluded = new Set()) {
  return (pack.burgs || [])
    .filter(burg => burg?.i && !burg.removed && !excluded.has(burg.i) && classes.includes(political[pack.cells.g[burg.cell]] || 0))
    .sort((left, right) => Number(right.population || 0) - Number(left.population || 0) || left.i - right.i)[0] || null;
}

function createHistoricalState(source, id, burg, gridCenter, name, formName) {
  return {
    ...(source || {}),
    id,
    i: id,
    name,
    form: "Empire",
    formName,
    fullName: `${name}${formName}`,
    center: burg.cell,
    gridCenter,
    capital: burg.i,
    culture: burg.culture,
    religion: burg.religion || 0,
    type: source?.type || "Generic",
    expansionism: source?.expansionism || 1,
    removed: false,
    provinces: []
  };
}

function positiveStateId(value, fallback) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : fallback;
}

function nextAvailableStateId(states = [], excluded = new Set()) {
  let id = 1;
  while (states[id] || excluded.has(id)) id++;
  return id;
}

export function regeneratePackStatesAndProvinces(grid, society, options, pack, settlements, {salt = 0} = {}) {
  if (!pack?.cells?.i?.length || !pack?.burgs?.length) return null;
  const profile = createStageProfile();
  const random = profile.stage("random-states", "初始化国家重算随机源", () => createRandom(regenerationSeed(options, "regenerate-states", salt)));
  const nameGenerator = profile.stage("name-generator", "初始化政区命名器", () => createChineseNameGenerator(regenerationSeed(options, "regenerate-politics-names", salt), {namebases: options.namebases}));
  const supportingProvinces = profile.stage("states-province-support", "收集锁国与锁定省会支撑快照", () => [
    ...collectLockedStateProvinceSnapshots(pack, options),
    ...collectLockedCityProvinceSnapshots(pack, options)
  ]);
  const lockedProvinces = profile.stage("provinces-locks", "校验锁定省份", () => prepareLockedProvinces(grid, pack, options, supportingProvinces));
  const lockedStates = profile.stage("states-locks", "校验锁定国家", () => prepareLockedStates(grid, pack, options, lockedProvinces));
  const riverBarrier = profile.stage("river-political-barrier", "建立大河政治阻隔", () => createRiverPoliticalBarrier(pack));

  const selectedCapitals = profile.stage("capitals-select", "重新选择国家首都", () => selectRegeneratedCapitalBurgs(pack, settlements, options, random, lockedStates));
  if (!selectedCapitals.length) return null;

  const states = profile.stage("states-build", "生成国家对象", () => buildPackStates(pack, society, random, nameGenerator, lockedStates));
  profile.stage("states-expand", "扩张 pack 国家", () => expandPackStates(pack, states, society, null, lockedStates, riverBarrier));
  profile.stage("states-normalize", "整理国家边界", () => normalizePackStates(pack, states, lockedStates.packCells, lockedStates.ids, riverBarrier));
  profile.stage("states-claim-neutral", "吸收已定居中立 cell", () => claimInhabitedNeutralCells(pack, states, lockedStates.ids));
  profile.stage("states-smooth-spikes", "吸收国家边界毛刺", () => smoothPackStateBoundarySpikes(pack, states, lockedStates.packCells, lockedStates.ids, riverBarrier));
  profile.stage("states-connectivity", "修复国家连通性", () => repairDisconnectedPoliticalComponents(pack.cells, pack.cells.state, states, {
    level: "state",
    riverBarrier,
    protectedCells: lockedStates.packCells,
    protectedIds: lockedStates.ids
  }));
  profile.stage("states-sync-burgs", "同步城市国家归属", () => syncBurgStates(pack, lockedStates.protectedBurgIds));
  profile.stage("states-statistics", "统计国家数据", () => collectStateStatistics(pack, states, lockedStates.ids));
  profile.stage("states-name-orientation", "校正国家方位名", () => orientPackStateDirectionalNames(pack, states, lockedStates.ids));
  profile.stage("states-neighbors", "计算国家相邻关系", () => findStateNeighbors(pack, states, lockedStates.ids));
  profile.stage("states-governments", "定义国家政体与国号", () => defineStateGovernments(states, options, lockedStates.ids));
  profile.stage("states-colors", "分配国家颜色", () => assignStateColors(states, lockedStates.ids));
  grid.cells.state = profile.stage("states-mirror-grid", "镜像国家到 grid", () => mirrorPackStateToGrid(grid, pack, lockedStates.gridOwners, lockedStates.ids));

  const provinces = profile.stage("provinces-rebuild", "重建 pack 省份", () => buildPackProvinces(pack, society, createRandom(regenerationSeed(options, "regenerate-provinces", salt)), options, nameGenerator, lockedProvinces, lockedStates.ids, riverBarrier));
  grid.cells.province = profile.stage("provinces-mirror-grid", "镜像省份到 grid", () => mirrorPackProvinceToGrid(grid, pack, lockedProvinces.gridOwners, lockedProvinces.ids));

  const timing = profile.finish();
  return {
    states,
    provinces,
    timing,
    provinceTiming: provinces.timing || null,
    metadata: createPackPoliticsMetadata(states, provinces, [], riverBarrier, pack.cells),
    riverBoundaries: describeRiverPoliticalBoundaries(riverBarrier, pack.cells.state, pack.cells.province)
  };
}

export function regeneratePackProvincesWithinStates(grid, society, options, pack, {salt = 0} = {}) {
  if (!pack?.cells?.i?.length || !pack?.states?.some?.(state => state?.i)) return null;
  const profile = createStageProfile();
  const random = profile.stage("random-provinces", "初始化省份重算随机源", () => createRandom(regenerationSeed(options, "regenerate-provinces", salt)));
  const nameGenerator = profile.stage("name-generator", "初始化省份命名器", () => createChineseNameGenerator(regenerationSeed(options, "regenerate-province-names", salt), {namebases: options.namebases}));
  const locked = profile.stage("provinces-locks", "校验锁定省份", () => prepareLockedProvinces(
    grid,
    pack,
    options,
    collectLockedCityProvinceSnapshots(pack, options)
  ));
  const riverBarrier = profile.stage("river-political-barrier", "建立大河政治阻隔", () => createRiverPoliticalBarrier(pack));
  const provinces = profile.stage("provinces-rebuild", "重建 pack 省份", () => buildPackProvinces(pack, society, random, options, nameGenerator, locked, new Set(), riverBarrier));
  grid.cells.province = profile.stage("provinces-mirror-grid", "镜像省份到 grid", () => mirrorPackProvinceToGrid(grid, pack, locked.gridOwners, locked.ids));
  const timing = profile.finish();
  return {
    states: pack.states,
    provinces,
    timing,
    provinceTiming: provinces.timing || null,
    riverBoundaries: describeRiverPoliticalBoundaries(riverBarrier, pack.cells.state, pack.cells.province),
    metadata: {
      provinces: provinces.filter(province => province?.i).length,
      provinceNames: provinces.filter(province => province?.i).map(province => province.fullName || province.name),
      riverBoundaries: politicalRiverBoundaryDiagnostics(riverBarrier, pack.cells.state, pack.cells.province)
    }
  };
}

export function reexpandPackPoliticsPreservingIdentity(grid, society, pack, settlements, options = {}) {
  const states = pack?.states;
  const provinces = pack?.provinces;
  if (!pack?.cells?.i?.length || !Array.isArray(states) || !Array.isArray(provinces)) return null;
  const supportingProvinces = collectLockedStateProvinceSnapshots(pack, options);
  const lockedProvinces = prepareLockedProvinces(grid, pack, options, supportingProvinces);
  const lockedStates = prepareLockedStates(grid, pack, options, lockedProvinces);
  const stateIdentity = snapshotPoliticalIdentity(states);
  const provinceIdentity = snapshotPoliticalIdentity(provinces);
  repairStateCapitalAnchors(pack, states, lockedStates.ids);
  const stateAnchors = preservedProvinceStateAnchors(pack, provinces);
  const protectedStateCells = new Set([...stateAnchors.cells, ...lockedStates.packCells]);
  expandPackStates(pack, states, society, stateAnchors, lockedStates);
  normalizePackStates(pack, states, protectedStateCells, lockedStates.ids);
  claimInhabitedNeutralCells(pack, states, lockedStates.ids);
  smoothPackStateBoundarySpikes(pack, states, protectedStateCells, lockedStates.ids);
  syncBurgStates(pack, lockedStates.protectedBurgIds);
  collectStateStatistics(pack, states, lockedStates.ids);
  findStateNeighbors(pack, states, lockedStates.ids);
  grid.cells.state = mirrorPackStateToGrid(grid, pack, lockedStates.gridOwners, lockedStates.ids);

  const provinceIds = seedPreservedProvinceCenters(pack, states, provinces, lockedProvinces, lockedStates);
  expandPackProvinces(pack, provinces, provinceIds, Infinity, lockedProvinces.packOwners);
  fillPreservedProvinceGaps(pack, provinces, provinceIds);
  justifyPackProvinces(pack, provinces, provinceIds, lockedProvinces.packOwners);
  smoothPackProvinceBoundarySpikes(pack, provinces, provinceIds, lockedProvinces.packOwners);
  collectProvinceStatistics(pack, provinces, provinceIds, lockedProvinces.ids);
  assignProvincePoles(pack, provinces, provinceIds, lockedProvinces.ids);
  findPackProvinceNeighbors(pack, provinces, provinceIds, lockedProvinces.ids);
  pack.cells.province = provinceIds;
  pack.provinces = provinces;
  grid.cells.province = mirrorPackProvinceToGrid(grid, pack, lockedProvinces.gridOwners, lockedProvinces.ids);
  syncBurgProvinces(pack);
  assertPoliticalIdentity(states, stateIdentity, "国家");
  assertPoliticalIdentity(provinces, provinceIdentity, "省份");
  assertProtectedPoliticalSnapshots(states, options.lockedStates, "国家");
  assertProtectedPoliticalSnapshots(provinces, options.lockedProvinces, "省份");
  return {
    states,
    provinces,
    metadata: {
      states: states.filter(state => state?.i && !state.removed).length,
      provinces: provinces.filter(province => province?.i && !province.removed).length,
      stateNames: states.filter(state => state?.i && !state.removed).map(state => state.fullName || state.name),
      provinceNames: provinces.filter(province => province?.i && !province.removed).map(province => province.fullName || province.name),
      preservedStateIds: stateIdentity.size,
      preservedProvinceIds: provinceIdentity.size
    }
  };
}

function preservedProvinceStateAnchors(pack, provinces) {
  const anchors = [];
  const cells = new Set();
  for (const province of provinces) {
    const cell = Number(province?.center);
    if (!province?.i || province.removed || !Number.isInteger(cell) || pack.cells.h?.[cell] < 20 || cells.has(cell)) continue;
    anchors.push({cell, stateId: Number(province.state)});
    cells.add(cell);
  }
  return {anchors, cells};
}

function repairStateCapitalAnchors(pack, states, protectedIds = new Set()) {
  const oldStateByBurg = new Map((pack.burgs || []).filter(burg => burg?.i && !burg.removed).map(burg => [burg.i, Number(burg.state) || 0]));
  const used = new Set();
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    if (protectedIds.has(Number(state.i))) {
      used.add(Number(state.center));
      continue;
    }
    if (Number(state.capital) === 0 && validEmptyStateCenter(pack, state, used)) {
      used.add(Number(state.center));
      continue;
    }
    let capital = pack.burgs?.[state.capital];
    if (!capital?.i || capital.removed || pack.cells.h[capital.cell] < 20 || used.has(capital.cell)) {
      capital = (pack.burgs || [])
        .filter(burg => burg?.i && !burg.removed && pack.cells.h[burg.cell] >= 20 && !used.has(burg.cell) && oldStateByBurg.get(burg.i) === state.i)
        .sort((a, b) => Number(b.population || 0) - Number(a.population || 0))[0];
    }
    if (!capital) throw new Error(`国家 #${state.i} 没有可保留的首都锚点`);
    state.capital = capital.i;
    state.center = capital.cell;
    state.gridCenter = pack.cells.g?.[capital.cell] ?? state.gridCenter;
    capital.capital = 1;
    used.add(capital.cell);
  }
}

function seedPreservedProvinceCenters(pack, states, provinces, lockedProvinces = null, lockedStates = null) {
  const provinceIds = new Uint16Array(pack.cells.i.length);
  const used = new Set();
  for (const [cell, provinceId] of lockedProvinces?.packOwners || []) provinceIds[cell] = provinceId;
  for (const provinceId of lockedProvinces?.ids || []) {
    const center = Number(provinces[provinceId]?.center);
    if (Number.isInteger(center)) used.add(center);
  }
  const landCellsByState = new Map();
  for (const cell of pack.cells.i) {
    const stateId = pack.cells.state[cell];
    if (pack.cells.h[cell] < 20 || !stateId) continue;
    if (!landCellsByState.has(stateId)) landCellsByState.set(stateId, []);
    landCellsByState.get(stateId).push(cell);
  }
  for (const state of states) {
    if (state?.i && !state.removed && !lockedStates?.ids?.has(Number(state.i))) state.provinces = [];
  }
  for (const province of provinces) {
    if (!province?.i || province.removed) continue;
    if (lockedProvinces?.ids?.has(Number(province.i))) continue;
    const stateCells = (landCellsByState.get(province.state) || []).filter(cell => !used.has(cell));
    if (!stateCells.length) throw new Error(`省份 #${province.i} 的所属国家没有可用中心`);
    const originalPoint = pack.cells.p?.[province.center] || pack.cells.p?.[states[province.state]?.center] || [0, 0];
    const center = stateCells.includes(province.center)
      ? province.center
      : stateCells.reduce((best, cell) => provinceCenterScore(pack, cell, originalPoint) > provinceCenterScore(pack, best, originalPoint) ? cell : best, stateCells[0]);
    province.center = center;
    province.gridCenter = pack.cells.g?.[center] ?? province.gridCenter;
    province.burg = pack.cells.burg?.[center] || 0;
    provinceIds[center] = province.i;
    if (!lockedStates?.ids?.has(Number(province.state))) states[province.state]?.provinces?.push(province.i);
    used.add(center);
  }
  return provinceIds;
}

function provinceCenterScore(pack, cell, origin) {
  const point = pack.cells.p[cell];
  const proximity = -distanceSquared(point, origin);
  const burg = pack.burgs?.[pack.cells.burg?.[cell]];
  return proximity + Number(pack.cells.s?.[cell] || 0) * 20 + Number(burg?.population || 0) * 0.05;
}

function fillPreservedProvinceGaps(pack, provinces, provinceIds) {
  const centersByState = new Map();
  for (const province of provinces) {
    if (!province?.i || province.removed) continue;
    if (!centersByState.has(province.state)) centersByState.set(province.state, []);
    centersByState.get(province.state).push(province);
  }
  for (const cell of pack.cells.i) {
    const stateId = pack.cells.state[cell];
    if (pack.cells.h[cell] < 20 || !stateId || provinceIds[cell]) continue;
    const candidates = centersByState.get(stateId) || [];
    if (!candidates.length) continue;
    let best = candidates[0];
    let bestDistance = distanceSquared(pack.cells.p[cell], pack.cells.p[best.center]);
    for (const province of candidates.slice(1)) {
      const nextDistance = distanceSquared(pack.cells.p[cell], pack.cells.p[province.center]);
      if (nextDistance >= bestDistance) continue;
      best = province;
      bestDistance = nextDistance;
    }
    provinceIds[cell] = best.i;
  }
}

function syncBurgProvinces(pack) {
  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    burg.province = pack.cells.province?.[burg.cell] || 0;
  }
}

function snapshotPoliticalIdentity(items) {
  return new Map(items.filter(item => item?.i && !item.removed).map(item => [item.i, {name: item.name, fullName: item.fullName, formName: item.formName}]));
}

function assertPoliticalIdentity(items, snapshot, label) {
  for (const [id, identity] of snapshot) {
    const item = items[id];
    if (!item || item.removed) throw new Error(`${label} #${id} 的稳定身份在重算中丢失`);
    if (item.name !== identity.name || item.fullName !== identity.fullName || item.formName !== identity.formName) throw new Error(`${label} #${id} 的名称在重算中被改写`);
  }
}

function assertProtectedPoliticalSnapshots(items, snapshots = [], label) {
  for (const snapshot of snapshots || []) {
    const id = Number(snapshot?.i ?? snapshot?.id);
    if (JSON.stringify(items[id]) !== JSON.stringify(snapshot)) {
      const conflict = label === "省份" ? provinceLockConflict : stateLockConflict;
      throw conflict(`锁定${label} #${id} 的完整快照在重扩张中被改写`, {
        reason: "locked-snapshot-changed",
        id
      });
    }
  }
}

function buildPackPolitics(grid, features, society, rivers, random, options, pack) {
  const profile = createStageProfile();
  const riverCells = profile.stage("river-cell-index", "建立河流 cell 索引", () => new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells)));
  const riverBarrier = profile.stage("river-political-barrier", "建立大河政治阻隔", () => createRiverPoliticalBarrier(pack));

  const nameGenerator = profile.stage("name-generator", "初始化政区命名器", () => createChineseNameGenerator(options.seed, {namebases: options.namebases}));
  const states = profile.stage("states-build", "生成国家对象", () => buildPackStates(pack, society, random, nameGenerator));
  profile.stage("states-expand", "扩张 pack 国家", () => expandPackStates(pack, states, society, null, null, riverBarrier));
  profile.stage("states-normalize", "整理国家边界", () => normalizePackStates(pack, states, new Set(), new Set(), riverBarrier));
  profile.stage("states-claim-neutral", "吸收已定居中立 cell", () => claimInhabitedNeutralCells(pack, states));
  profile.stage("states-smooth-spikes", "吸收国家边界毛刺", () => smoothPackStateBoundarySpikes(pack, states, new Set(), new Set(), riverBarrier));
  profile.stage("states-connectivity", "修复国家连通性", () => repairDisconnectedPoliticalComponents(pack.cells, pack.cells.state, states, {level: "state", riverBarrier}));
  profile.stage("states-sync-burgs", "同步城市国家归属", () => syncBurgStates(pack));
  profile.stage("states-statistics", "统计国家数据", () => collectStateStatistics(pack, states));
  profile.stage("states-name-orientation", "校正国家方位名", () => orientPackStateDirectionalNames(pack, states));
  profile.stage("states-neighbors", "计算国家相邻关系", () => findStateNeighbors(pack, states));
  profile.stage("states-governments", "定义国家政体与国号", () => defineStateGovernments(states, options));
  profile.stage("states-colors", "分配国家颜色", () => assignStateColors(states));
  grid.cells.state = profile.stage("states-mirror-grid", "镜像国家到 grid", () => mirrorPackStateToGrid(grid, pack));

  const provinces = profile.stage("provinces-build", "生成 pack 省份", () => buildPackProvinces(pack, society, createRandom(options.seed), options, nameGenerator, null, new Set(), riverBarrier));
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
      regionNames: regions.map(region => region.name),
      riverBoundaries: politicalRiverBoundaryDiagnostics(riverBarrier, pack.cells.state, pack.cells.province)
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

function prepareLockedStates(grid, pack, options = {}, lockedProvinces = null) {
  const provided = options.lockedStates ?? options.preservedStates ?? [];
  if (!Array.isArray(provided)) throw stateLockConflict("锁定国家约束必须是数组", {reason: "invalid-constraint"});

  const neutral = {id: 0, i: 0, name: "中立", center: 0, culture: 0, type: "Neutral", expansionism: 0};
  const states = [neutral];
  const ids = new Set();
  const requiredIds = new Set();
  const centers = new Set();
  const capitalBurgIds = new Set();
  const lockedCapitalBurgIds = new Set();
  const lockedCities = options.lockedCities ?? options.preservedCities ?? [];
  if (!Array.isArray(lockedCities)) throw stateLockConflict("锁定城市约束必须是数组", {reason: "invalid-city-constraint"});
  const protectedBurgIds = new Set(lockedCities.map(city => Number(city?.burgId)).filter(id => Number.isInteger(id) && id > 0));
  const capitalToState = new Map();
  const packOwners = new Map();
  const gridOwners = new Map();
  const previous = pack.states || [];

  const addState = (source, {locked = false} = {}) => {
    const state = structuredClone(source);
    const id = Number(state.id ?? state.i);
    const center = Number(state.center);
    const capital = Number(state.capital);
    if (!Number.isInteger(id) || id <= 0 || id > 65535 || requiredIds.has(id)) {
      throw stateLockConflict("锁定国家缺少唯一的正整数 ID", {reason: "invalid-id", id});
    }
    const existing = previous[id];
    if (!existing || existing.removed || Number(existing.id ?? existing.i) !== id) {
      throw stateLockConflict(`锁定国家 #${id} 缺少原对象`, {reason: "missing-state", id});
    }
    const burg = pack.burgs?.[capital];
    const emptyState = capital === 0;
    if (!emptyState && (!Number.isInteger(capital) || capital <= 0 || !burg || burg.removed || !burg.capital)) {
      throw stateLockConflict(`锁定国家 #${id} 缺少有效首都`, {reason: "invalid-capital", id, capital});
    }
    if (!Number.isInteger(center) || center < 0 || center >= pack.cells.i.length || pack.cells.h?.[center] < 20) {
      throw stateLockConflict(`锁定国家 #${id} 引用了无效或水域中心`, {reason: "invalid-center", id, center});
    }
    if ((!emptyState && Number(burg.cell) !== center) || Number(pack.cells.state?.[center]) !== id) {
      throw stateLockConflict(`锁定国家 #${id} 的首都、中心或领土镜像不一致`, {reason: "capital-center-mismatch", id, capital, center});
    }
    if (centers.has(center) || !emptyState && capitalBurgIds.has(capital)) {
      throw stateLockConflict(`锁定国家 #${id} 与其它约束复用首都或中心`, {reason: "duplicate-capital", id, capital, center});
    }
    states[id] = state;
    requiredIds.add(id);
    if (locked) ids.add(id);
    centers.add(center);
    if (!emptyState) {
      capitalBurgIds.add(capital);
      if (locked) lockedCapitalBurgIds.add(capital);
      capitalToState.set(capital, id);
    }
  };

  for (const source of provided) addState(source, {locked: true});

  for (const provinceId of lockedProvinces?.ids || []) {
    const province = lockedProvinces.provinces[provinceId];
    const stateId = Number(province?.state);
    if (!Number.isInteger(stateId) || stateId <= 0 || !previous[stateId] || previous[stateId].removed) {
      throw stateLockConflict(`锁定省份 #${provinceId} 的父国不存在`, {reason: "locked-province-parent-missing", provinceId, stateId});
    }
    if (!requiredIds.has(stateId)) addState(previous[stateId]);
  }

  for (const cell of pack.cells.i) {
    const stateId = Number(pack.cells.state?.[cell]) || 0;
    if (!ids.has(stateId)) continue;
    if (pack.cells.h?.[cell] < 20 || packOwners.has(cell)) {
      throw stateLockConflict(`锁定国家 #${stateId} 包含水域或重叠领土`, {reason: "overlapping-territory", stateId, cell});
    }
    packOwners.set(cell, stateId);
  }
  for (const [cell, provinceId] of lockedProvinces?.packOwners || []) {
    const stateId = Number(lockedProvinces.provinces[provinceId]?.state);
    const current = packOwners.get(cell);
    if (current && current !== stateId) {
      throw stateLockConflict(`锁定省份 #${provinceId} 与锁国领土冲突`, {reason: "overlapping-territory", provinceId, stateId, cell});
    }
    packOwners.set(cell, stateId);
  }

  for (let gridCell = 0; gridCell < (grid.cells.state?.length || 0); gridCell++) {
    const stateId = Number(grid.cells.state[gridCell]) || 0;
    if (ids.has(stateId)) gridOwners.set(gridCell, stateId);
  }
  for (const [gridCell, provinceId] of lockedProvinces?.gridOwners || []) {
    const stateId = Number(lockedProvinces.provinces[provinceId]?.state);
    const current = gridOwners.get(gridCell);
    if (ids.has(stateId) && current === undefined) continue;
    if (current && current !== stateId) {
      throw stateLockConflict(`锁定省份 #${provinceId} 与锁国 grid 领土冲突`, {reason: "overlapping-grid-territory", provinceId, stateId, gridCell});
    }
    gridOwners.set(gridCell, stateId);
  }

  return {
    states,
    ids,
    requiredIds,
    packOwners,
    packCells: new Set(packOwners.keys()),
    gridOwners,
    capitalBurgIds,
    lockedCapitalBurgIds,
    protectedBurgIds: new Set([...protectedBurgIds, ...lockedCapitalBurgIds]),
    capitalToState
  };
}

function stateLockConflict(message, details = {}) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "state", ...details};
  return error;
}

function buildPackStates(pack, society, random, nameGenerator, locked = null) {
  const constraints = locked || {
    states: [{id: 0, i: 0, name: "中立", center: 0, culture: 0, type: "Neutral", expansionism: 0}],
    requiredIds: new Set(),
    capitalToState: new Map()
  };
  const states = constraints.states.slice();
  const capitals = pack.burgs.filter(burg => burg?.i && burg.capital && !burg.removed);
  let nextStateId = 1;
  const allocateStateId = preferred => {
    if (Number.isInteger(preferred) && preferred > 0 && !states[preferred] && !constraints.requiredIds.has(preferred)) return preferred;
    while (states[nextStateId] || constraints.requiredIds.has(nextStateId)) nextStateId++;
    return nextStateId++;
  };

  for (const burg of capitals) {
    if (constraints.capitalToState.has(burg.i)) continue;
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
    const id = allocateStateId(burg.i);
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

function selectRegeneratedCapitalBurgs(pack, settlements, options, random, locked = null) {
  const aliveBurgs = (pack.burgs || []).filter(burg => burg?.i && !burg.removed && pack.cells.h?.[burg.cell] >= 20);
  const requiredCapitals = aliveBurgs.filter(burg => locked?.capitalBurgIds?.has(burg.i));
  const requested = Number(options.statesNumber);
  const target = clamp(Math.max(Number.isFinite(requested) && requested > 0 ? requested : 12, requiredCapitals.length), 1, Math.min(aliveBurgs.length, 40));
  if (!target) return [];

  const candidates = aliveBurgs
    .filter(burg => requiredCapitals.includes(burg) || !locked?.protectedBurgIds?.has(burg.i))
    .map(burg => ({
      burg,
      score: getCapitalCandidateScore(pack, burg, random)
    }))
    .sort((a, b) => b.score - a.score || a.burg.i - b.burg.i)
    .map(item => item.burg);
  const selected = pickSpacedCapitalBurgs(pack, candidates, target, requiredCapitals);
  applyCapitalSelection(pack, settlements, new Set(selected.map(burg => burg.i)), locked?.protectedBurgIds);
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

function pickSpacedCapitalBurgs(pack, candidates, target, initial = []) {
  const selected = initial.slice();
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

function applyCapitalSelection(pack, settlements, selectedBurgIds, protectedBurgIds = new Set()) {
  const citiesByBurg = new Map((settlements?.cities || []).filter(Boolean).map(city => [city.burgId, city]));
  const scaleContext = createCityScaleContext(settlements?.cities, pack?.burgs);
  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const selected = selectedBurgIds.has(burg.i);
    if (protectedBurgIds.has(burg.i)) continue;
    burg.capital = selected ? 1 : 0;
    const city = citiesByBurg.get(burg.i);
    const scale = deriveCityScale(city || burg, scaleContext, burg);
    burg.group = scale;
    if (!city) continue;
    city.capital = selected;
    city.group = scale;
  }
}

function createPackPoliticsMetadata(states, provinces, regions = [], riverBarrier = null, cells = null) {
  const validStates = states.filter(state => state?.i && !state.removed);
  const validProvinces = provinces.filter(province => province?.i && !province.removed);
  return {
    states: validStates.length,
    provinces: validProvinces.length,
    regions: regions.length,
    stateNames: validStates.map(state => state.fullName || state.name),
    stateGovernments: summarizeStateGovernments(validStates),
    provinceNames: validProvinces.map(province => province.fullName || province.name),
    regionNames: regions.map(region => region.name),
    ...(riverBarrier && cells ? {riverBoundaries: politicalRiverBoundaryDiagnostics(riverBarrier, cells.state, cells.province)} : {})
  };
}

function politicalRiverBoundaryDiagnostics(riverBarrier, stateOwners, provinceOwners) {
  return compactRiverPoliticalBoundaryDiagnostics(describeRiverPoliticalBoundaries(riverBarrier, stateOwners, provinceOwners));
}

function isStrongRiverPoliticalTransition(riverBarrier, from, to, level) {
  return riverPoliticalTransition(riverBarrier, from, to, {level}).strong;
}

function orientPackStateDirectionalNames(pack, states, protectedIds = new Set()) {
  const groups = new Map();
  const validStates = states.filter(state => state?.i && !state.removed && !protectedIds.has(state.i));
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

function defineStateGovernments(states, options = {}, protectedIds = new Set()) {
  const validStates = states.filter(state => state && !state.removed && !protectedIds.has(stateColorId(state)) && (state.i > 0 || (state.i === undefined && Number.isInteger(state.id))));
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

function expandPackStates(pack, states, society, preservedAnchors = null, locked = null, riverBarrier = null) {
  const {cells, burgs} = pack;
  cells.state = new Uint16Array(cells.i.length);
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const settled = new Uint8Array(cells.i.length);
  const protectedCenters = new Map();
  const queue = new MinPriorityQueue();
  const growthRate = cells.i.length / 2;

  const nativeBiomes = new Map();
  for (const state of states) {
    if (!state?.i) continue;
    const capital = burgs[state.capital];
    const capitalCell = capital?.i && !capital.removed ? capital.cell : Number(state.center);
    if (!Number.isInteger(capitalCell) || cells.h?.[capitalCell] < 20) throw new Error(`国家 #${state.i} 缺少合法扩张中心`);
    const cultureCenter = society.cultures[state.culture]?.center ?? capitalCell;
    const nativeBiome = cells.biome[cultureCenter] ?? cells.biome[capitalCell];
    nativeBiomes.set(state.i, nativeBiome);
    cells.state[capitalCell] = state.i;
    costs[capitalCell] = 0;
    protectedCenters.set(capitalCell, state.i);
    queue.push({cell: capitalCell, stateId: state.i, nativeBiome, cost: 0, growthCost: 0}, 0);
  }
  for (const anchor of preservedAnchors?.anchors || []) {
    const state = states[anchor.stateId];
    if (!state?.i || state.removed || cells.h[anchor.cell] < 20) continue;
    cells.state[anchor.cell] = state.i;
    costs[anchor.cell] = 0;
    protectedCenters.set(anchor.cell, state.i);
    queue.push({cell: anchor.cell, stateId: state.i, nativeBiome: nativeBiomes.get(state.i) ?? cells.biome[anchor.cell], cost: 0, growthCost: 0}, 0);
  }
  for (const [cell, stateId] of locked?.packOwners || []) {
    const state = states[stateId];
    if (!state?.i || state.removed || cells.h[cell] < 20) continue;
    cells.state[cell] = stateId;
    costs[cell] = 0;
    protectedCenters.set(cell, stateId);
    queue.push({cell, stateId, nativeBiome: nativeBiomes.get(stateId) ?? cells.biome[cell], cost: 0, growthCost: 0}, 0);
  }

  while (queue.length) {
    const {cell, stateId, nativeBiome, cost, growthCost} = queue.pop();
    if (settled[cell] || cost !== costs[cell] || cells.state[cell] !== stateId) continue;
    settled[cell] = 1;
    const state = states[stateId];
    if (!state) continue;

    for (const neighbor of cells.c[cell] || []) {
      if (settled[neighbor]) continue;
      const fixedOwner = locked?.packOwners?.get(neighbor);
      if (locked?.ids?.has(stateId) && fixedOwner !== stateId) continue;
      if (fixedOwner && fixedOwner !== stateId) continue;
      const protectedOwner = protectedCenters.get(neighbor);
      if (protectedOwner && protectedOwner !== stateId) continue;

      const cultureCost = state.culture === cells.culture[neighbor] ? -9 : 100;
      const populationCost = cells.h[neighbor] < 20 ? 0 : cells.s[neighbor] ? Math.max(20 - cells.s[neighbor], 0) : 5000;
      const biomeCost = getStateBiomeCost(nativeBiome, cells.biome[neighbor], state.type);
      const heightCost = getStateHeightCost(pack.features[cells.f[neighbor]], cells.h[neighbor], state.type);
      const riverCost = riverBarrier
        ? riverPoliticalTransition(riverBarrier, cell, neighbor, {level: "state"}).cost
        : getStateRiverCost(cells.r?.[neighbor], cells.fl?.[neighbor], state.type);
      const typeCost = getStateTypeCost(cells.t[neighbor], state.type);
      const expansionism = Math.max(0.1, state.expansionism || 1);
      const baseCellCost = Math.max(cultureCost + populationCost + biomeCost + heightCost + typeCost, 0);
      const nextGrowthCost = growthCost + 10 + baseCellCost / expansionism;
      const totalCost = cost + 10 + (baseCellCost + riverCost) / expansionism;

      if (nextGrowthCost > growthRate || totalCost >= costs[neighbor]) continue;
      if (cells.h[neighbor] >= 20) cells.state[neighbor] = stateId;
      costs[neighbor] = totalCost;
      queue.push({cell: neighbor, stateId, nativeBiome, cost: totalCost, growthCost: nextGrowthCost}, totalCost);
    }
  }

  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    if (locked?.lockedCapitalBurgIds?.has(burg.i)) continue;
    burg.state = cells.state[burg.cell];
  }
}

function normalizePackStates(pack, states, protectedCells = new Set(), protectedIds = new Set(), riverBarrier = null) {
  const {cells, burgs} = pack;

  for (const cell of cells.i) {
    if (protectedCells.has(cell)) continue;
    if (cells.h[cell] < 20 || cells.burg[cell]) continue;
    if ((cells.c[cell] || []).some(neighbor => burgs[cells.burg[neighbor]]?.capital)) continue;
    const landNeighbors = (cells.c[cell] || []).filter(neighbor => cells.h[neighbor] >= 20 && !isStrongRiverPoliticalTransition(riverBarrier, cell, neighbor, "state"));
    const adversaries = landNeighbors.filter(neighbor => cells.state[neighbor] !== cells.state[cell]);
    if (adversaries.length < 2) continue;
    const buddies = landNeighbors.filter(neighbor => cells.state[neighbor] === cells.state[cell]);
    if (buddies.length > 2 || adversaries.length <= buddies.length) continue;
    const nextState = cells.state[adversaries[0]];
    if (!protectedIds.has(nextState)) cells.state[cell] = nextState;
  }

  for (const state of states) {
    if (!state?.i || protectedIds.has(state.i)) continue;
    const capital = pack.burgs[state.capital];
    if (capital?.i && !capital.removed) state.center = capital.cell;
    else if (cells.h?.[state.center] < 20 || Number(cells.state?.[state.center]) !== Number(state.i)) {
      const fallback = cells.i.find(cell => cells.h[cell] >= 20 && Number(cells.state?.[cell]) === Number(state.i));
      if (Number.isInteger(fallback)) state.center = fallback;
    }
  }
}

function validEmptyStateCenter(pack, state, used = new Set()) {
  const center = Number(state?.center);
  return Number.isInteger(center)
    && center >= 0
    && center < Number(pack?.cells?.i?.length || 0)
    && pack.cells.h?.[center] >= 20
    && Number(pack.cells.state?.[center]) === Number(state.i)
    && !used.has(center);
}

function smoothPackStateBoundarySpikes(pack, states, additionalProtectedCells = new Set(), protectedIds = new Set(), riverBarrier = null) {
  const {cells, burgs} = pack;
  const protectedCells = new Set(
    burgs
      .filter(burg => burg?.i && !burg.removed && cells.h[burg.cell] >= 20)
      .map(burg => burg.cell)
  );
  for (const cell of additionalProtectedCells) protectedCells.add(cell);

  absorbBoundarySpikes(cells, cells.state, {
    passes: 3,
    protectedCells,
    canInspect: cell => cells.h[cell] >= 20 && Boolean(states[cells.state[cell]]),
    canUseNeighbor: (neighbor, cell) => cells.h[neighbor] >= 20 && !isStrongRiverPoliticalTransition(riverBarrier, cell, neighbor, "state"),
    canAbsorbTo: value => value > 0 && Boolean(states[value]) && !protectedIds.has(value)
  });
}

function claimInhabitedNeutralCells(pack, states, protectedIds = new Set()) {
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
    if (protectedIds.has(stateId)) continue;

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

}

function isInhabitedNeutralCell(cells, cell) {
  if (cells.h?.[cell] < 20) return false;
  if (cells.burg?.[cell]) return true;
  return (cells.s?.[cell] || 0) > 0 && (cells.culture?.[cell] || 0) > 0;
}

function syncBurgStates(pack, protectedBurgIds = new Set()) {
  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    if (protectedBurgIds.has(burg.i)) continue;
    burg.state = pack.cells.state[burg.cell];
  }
}

function collectStateStatistics(pack, states, protectedIds = new Set()) {
  const {cells, burgs} = pack;
  for (const state of states) {
    if (!state || protectedIds.has(stateColorId(state))) continue;
    state.cells = 0;
    state.area = 0;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
  }

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const state = states[cells.state[cell]];
    if (!state || protectedIds.has(stateColorId(state))) continue;
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
    if (!state || protectedIds.has(stateColorId(state))) continue;
    state.area = round(state.area || 0, 2);
    state.rural = round(state.rural || 0, 2);
    state.urban = round(state.urban || 0, 2);
  }
}

function findStateNeighbors(pack, states, protectedIds = new Set()) {
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
    if (!state || protectedIds.has(stateColorId(state))) continue;
    state.neighbors = Array.from(neighbors[state.i] || []).filter(id => id !== undefined);
  }
}

function assignStateColors(states, protectedIds = new Set()) {
  const validStates = states.filter(state => isStateColorTarget(state) && !protectedIds.has(stateColorId(state)));
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

function mirrorPackStateToGrid(grid, pack, fixedOwners = new Map(), immutableIds = new Set()) {
  const values = new Array(grid.points.length).fill(0);
  const bestScore = new Float32Array(grid.points.length).fill(-1);
  const fallbackValues = new Array(grid.points.length).fill(0);
  const fallbackScore = new Float32Array(grid.points.length).fill(-1);

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    const score = pack.cells.pop?.[packCell] || pack.cells.s?.[packCell] || 0;
    const stateId = pack.cells.state[packCell] || 0;
    if (!immutableIds.has(stateId) && score >= fallbackScore[gridCell]) {
      fallbackValues[gridCell] = stateId;
      fallbackScore[gridCell] = score;
    }
    if (score < bestScore[gridCell]) continue;
    values[gridCell] = stateId;
    bestScore[gridCell] = score;
  }

  for (let gridCell = 0; gridCell < values.length; gridCell++) {
    if (!fixedOwners.has(gridCell) && immutableIds.has(values[gridCell])) values[gridCell] = fallbackValues[gridCell];
  }
  for (const [gridCell, stateId] of fixedOwners) values[gridCell] = stateId;
  smoothMirroredGridStates(grid, pack, values, fixedOwners, immutableIds);
  return values;
}

function smoothMirroredGridStates(grid, pack, values, fixedOwners = new Map(), immutableIds = new Set()) {
  const protectedCells = protectedGridCellsForPackBurgs(pack, {capitalsOnly: true});
  for (const gridCell of fixedOwners.keys()) protectedCells.add(gridCell);
  absorbBoundarySpikes(grid.cells, values, {
    passes: 3,
    protectedCells,
    canInspect: cell => grid.cells.h[cell] >= 20 && values[cell] > 0,
    canUseNeighbor: neighbor => grid.cells.h[neighbor] >= 20,
    canAbsorbTo: value => value > 0 && !immutableIds.has(value)
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
    const provinceForm = provinceFormForState(state, society.cultures) || legacyProvinceForm(provinces.length);

    for (const center of centers) {
      const id = provinces.length;
      const cultureRoot = society.cultures[grid.cells.culture[center.cell]]?.name?.replace("文化", "") || STATE_ROOTS[id % STATE_ROOTS.length];
      provinces.push({
        id,
        name: cultureRoot,
        formName: provinceForm,
        fullName: `${cultureRoot}${provinceForm}`,
        state: state.id,
        center: center.cell
      });
    }
  }
  return provinces;
}

function collectLockedStateProvinceSnapshots(pack, options = {}) {
  const provided = options.lockedStates ?? options.preservedStates ?? [];
  if (!Array.isArray(provided)) return [];
  const snapshots = [];
  const seen = new Set();
  for (const source of provided) {
    const stateId = Number(source?.id ?? source?.i);
    const state = pack.states?.[stateId];
    if (!state || state.removed) continue;
    for (const provinceId of source.provinces || state.provinces || []) {
      const id = Number(provinceId);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      const province = pack.provinces?.[id];
      if (!province || province.removed || Number(province.state) !== stateId) {
        throw stateLockConflict(`锁定国家 #${stateId} 引用了缺失或父国不一致的省份 #${id}`, {
          reason: "locked-state-province-missing",
          stateId,
          provinceId: id
        });
      }
      snapshots.push(structuredClone(province));
      seen.add(id);
    }
  }
  return snapshots;
}

function prepareLockedProvinces(grid, pack, options = {}, supporting = []) {
  const requested = options.lockedProvinces ?? options.preservedProvinces ?? [];
  if (!Array.isArray(requested)) throw provinceLockConflict("锁定省份约束必须是数组", {reason: "invalid-constraint"});
  const provided = requested.slice();
  const requestedIds = new Set(requested.map(province => Number(province?.id ?? province?.i)).filter(Number.isInteger));
  for (const province of supporting) {
    const id = Number(province?.id ?? province?.i);
    if (!requestedIds.has(id)) provided.push(province);
  }

  const provinces = [null];
  const ids = new Set();
  const centers = new Set();
  const burgIds = new Set();
  const packOwners = new Map();
  const gridOwners = new Map();
  const previous = pack.provinces || [];

  for (const source of provided) {
    if (!source || typeof source !== "object") throw provinceLockConflict("锁定省份约束包含空对象", {reason: "invalid-province"});
    const province = structuredClone(source);
    const id = Number(province.id ?? province.i);
    const stateId = Number(province.state);
    const center = Number(province.center);
    const burgId = Number(province.burg || 0);
    if (!Number.isInteger(id) || id <= 0 || id > 65535 || ids.has(id)) {
      throw provinceLockConflict("锁定省份缺少唯一的正整数 ID", {reason: "invalid-id", id});
    }
    const existing = previous[id];
    if (!existing || existing.removed || Number(existing.id ?? existing.i) !== id) {
      throw provinceLockConflict(`锁定省份 #${id} 缺少原对象`, {reason: "missing-province", id});
    }
    if (!Number.isInteger(stateId) || stateId <= 0 || !pack.states?.[stateId] || pack.states[stateId].removed) {
      throw provinceLockConflict(`锁定省份 #${id} 引用了无效父国`, {reason: "invalid-parent-state", id, stateId});
    }
    if (!Number.isInteger(center) || center < 0 || center >= pack.cells.i.length || pack.cells.h?.[center] < 20) {
      throw provinceLockConflict(`锁定省份 #${id} 引用了无效或水域中心`, {reason: "invalid-center", id, center});
    }
    if (Number(pack.cells.state?.[center]) !== stateId) {
      throw provinceLockConflict(`锁定省份 #${id} 的中心不属于父国`, {reason: "center-parent-mismatch", id, stateId, center});
    }
    if (centers.has(center)) {
      throw provinceLockConflict(`锁定省份 #${id} 与其它锁省中心重叠`, {reason: "overlapping-center", id, center});
    }
    if (burgId) {
      const burg = pack.burgs?.[burgId];
      if (!Number.isInteger(burgId) || burgId <= 0 || !burg || burg.removed || Number(burg.cell) !== center) {
        throw provinceLockConflict(`锁定省份 #${id} 缺少一致的省会 burg`, {reason: "invalid-burg", id, burgId, center});
      }
      if (burgIds.has(burgId)) {
        throw provinceLockConflict(`锁定省份 #${id} 与其它锁省复用省会 burg`, {reason: "overlapping-burg", id, burgId});
      }
      burgIds.add(burgId);
    }

    let cellCount = 0;
    for (const cell of pack.cells.i) {
      if (Number(pack.cells.province?.[cell]) !== id) continue;
      if (pack.cells.h?.[cell] < 20 || Number(pack.cells.state?.[cell]) !== stateId) {
        throw provinceLockConflict(`锁定省份 #${id} 包含水域或跨国 cell`, {reason: "invalid-territory", id, cell, stateId});
      }
      if (packOwners.has(cell)) {
        throw provinceLockConflict(`锁定省份 #${id} 与其它锁省领土重叠`, {reason: "overlapping-territory", id, cell});
      }
      packOwners.set(cell, id);
      cellCount++;
    }
    if (!cellCount || Number(pack.cells.province?.[center]) !== id) {
      throw provinceLockConflict(`锁定省份 #${id} 缺少包含中心的领土镜像`, {reason: "missing-territory", id, center});
    }

    provinces[id] = province;
    ids.add(id);
    centers.add(center);
  }

  for (let gridCell = 0; gridCell < (grid.cells.province?.length || 0); gridCell++) {
    const id = Number(grid.cells.province[gridCell]);
    if (!ids.has(id)) continue;
    if (grid.cells.h?.[gridCell] < 20) {
      throw provinceLockConflict(`锁定省份 #${id} 的 grid 镜像落在水域`, {reason: "invalid-grid-territory", id, gridCell});
    }
    gridOwners.set(gridCell, id);
  }

  return {provinces, ids, centers, burgIds, packOwners, gridOwners};
}

function collectLockedCityProvinceSnapshots(pack, options = {}) {
  const lockedCities = options.lockedCities ?? options.preservedCities ?? [];
  if (!Array.isArray(lockedCities)) throw provinceLockConflict("锁定城市约束必须是数组", {reason: "invalid-city-constraint"});
  const snapshots = [];
  const seen = new Set();
  for (const city of lockedCities) {
    const provinceId = Number(city?.province || 0);
    const burgId = Number(city?.burgId || 0);
    const province = pack?.provinces?.[provinceId];
    if (!province?.i || province.removed || seen.has(provinceId)) continue;
    if (!city?.provincial && Number(province.burg || 0) !== burgId) continue;
    if (!lockedCityProvinceAnchorConsistent(pack, city, province)) continue;
    snapshots.push(structuredClone(province));
    seen.add(provinceId);
  }
  return snapshots;
}

function lockedCityProvinceAnchorConsistent(pack, city, province) {
  const provinceId = Number(province?.i ?? province?.id);
  const center = Number(province?.center);
  return Number(province?.burg || 0) === Number(city?.burgId || 0)
    && center === Number(city?.packCell)
    && Number(province?.state) === Number(city?.state)
    && Number(pack?.cells?.province?.[center]) === provinceId
    && Number(pack?.cells?.state?.[center]) === Number(province?.state);
}

function provinceLockConflict(message, details = {}) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "province", ...details};
  return error;
}

function buildPackProvinces(pack, society, random, options, nameGenerator, locked = null, protectedStateIds = new Set(), riverBarrier = null) {
  const profile = createStageProfile();
  const {cells, states, burgs} = pack;
  const constraints = locked || {provinces: [null], ids: new Set(), centers: new Set(), burgIds: new Set(), packOwners: new Map(), gridOwners: new Map()};
  const provinces = constraints.provinces.slice();
  const provinceIds = new Uint16Array(cells.i.length);
  for (const [cell, provinceId] of constraints.packOwners) provinceIds[cell] = provinceId;
  const provincesRatio = Math.max(0, Math.min(100, Number(options.provincesRatio ?? 20)));
  const maxGrowth = provincesRatio === 100 ? 1000 : gauss(random, 20, 5, 5, 100) * Math.sqrt(provincesRatio);
  let nextProvinceId = 1;
  const allocateProvinceId = () => {
    while (provinces[nextProvinceId] || constraints.ids.has(nextProvinceId)) nextProvinceId++;
    return nextProvinceId++;
  };

  profile.stage("seed-provinces", "选择省份中心", () => {
    for (const state of states) {
      if (!state?.i) continue;
      const lockedStateProvinces = Array.from(constraints.ids).filter(id => Number(provinces[id]?.state) === state.i);
      if (!protectedStateIds.has(state.i)) state.provinces = lockedStateProvinces.slice();
      const stateBurgs = burgs
        .filter(burg => burg?.i && !burg.removed && burg.state === state.i && !constraints.burgIds.has(burg.i) && !constraints.packOwners.has(burg.cell))
        .sort((a, b) => b.population * gauss(random, 1, 0.2, 0.5, 1.5, 3) - a.population)
        .sort((a, b) => Number(b.capital) - Number(a.capital));
      if (stateBurgs.length + lockedStateProvinces.length < 2) continue;
      const provinceForm = provinceFormForState(state, society.cultures || pack.cultures);

      const totalBurgs = stateBurgs.length + lockedStateProvinces.length;
      const provincesNumber = Math.max(Math.ceil((totalBurgs * provincesRatio) / 100), 2);
      const generatedNumber = Math.max(0, Math.min(stateBurgs.length, provincesNumber - lockedStateProvinces.length));
      for (let index = 0; index < generatedNumber; index++) {
        const burg = stateBurgs[index];
        const provinceId = allocateProvinceId();
        const culture = society.cultures[burg.culture];
        const sourceRoot = (index % 2 === 0 || culture?.nameStyle ? burg.name : culture?.name?.replace("文化", "")) || STATE_ROOTS[provinceId % STATE_ROOTS.length];
        const provinceName = nameGenerator.makeProvinceName({
          id: provinceId,
          cell: burg.cell,
          culture: burg.culture,
          cultureType: culture?.nameStyle || culture?.type,
          state: state.i,
          baseName: sourceRoot,
          formName: provinceForm
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
        provinces[provinceId] = province;
        if (!protectedStateIds.has(state.i)) state.provinces.push(provinceId);
        provinceIds[burg.cell] = provinceId;
      }
    }
  });

  profile.stage("expand-provinces", "扩张省份", () => expandPackProvinces(pack, provinces, provinceIds, maxGrowth, constraints.packOwners, riverBarrier));
  profile.stage("justify-provinces", "整理省份边界", () => justifyPackProvinces(pack, provinces, provinceIds, constraints.packOwners, riverBarrier));
  profile.stage("fill-unassigned", "填充未归属省份 cell", () => fillUnassignedProvinceCells(pack, provinces, provinceIds, random, maxGrowth, nameGenerator, allocateProvinceId, protectedStateIds, riverBarrier));
  profile.stage("smooth-spikes", "吸收省份边界毛刺", () => smoothPackProvinceBoundarySpikes(pack, provinces, provinceIds, constraints.packOwners, riverBarrier));
  profile.stage("province-connectivity", "修复省份连通性", () => repairDisconnectedPoliticalComponents(cells, provinceIds, provinces, {
    level: "province",
    riverBarrier,
    protectedCells: new Set(constraints.packOwners.keys()),
    protectedIds: constraints.ids
  }));
  profile.stage("statistics", "统计省份数据", () => collectProvinceStatistics(pack, provinces, provinceIds, constraints.ids));
  profile.stage("assign-poles", "计算省份 pole", () => assignProvincePoles(pack, provinces, provinceIds, constraints.ids));
  profile.stage("neighbors", "计算省份相邻关系", () => findPackProvinceNeighbors(pack, provinces, provinceIds, constraints.ids));
  profile.stage("colors", "分配省份颜色", () => assignProvinceColors(provinces, constraints.ids));
  cells.province = provinceIds;
  pack.provinces = provinces;
  provinces.timing = profile.finish();
  return provinces;
}

function findPackProvinceNeighbors(pack, provinces, provinceIds, protectedIds = new Set()) {
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
    if (!province || protectedIds.has(provinceColorId(province))) continue;
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

function assignProvinceColors(provinces, protectedIds = new Set()) {
  const validProvinces = provinces.filter(province => isProvinceColorTarget(province) && !protectedIds.has(provinceColorId(province)));
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

function expandPackProvinces(pack, provinces, provinceIds, maxGrowth, fixedOwners = new Map(), riverBarrier = null) {
  const {cells} = pack;
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const settled = new Uint8Array(cells.i.length);
  const tentativeOwners = new Uint16Array(cells.i.length);
  const queue = new MinPriorityQueue();
  const fixedProvinceIds = new Set(fixedOwners.values());

  for (const province of provinces) {
    if (!province?.i) continue;
    const fixedCells = [];
    for (const [cell, owner] of fixedOwners) {
      if (owner === province.i) fixedCells.push(cell);
    }
    for (const cell of fixedCells.length ? fixedCells : [province.center]) {
      costs[cell] = 0;
      tentativeOwners[cell] = province.i;
      queue.push({cell, province: province.i, state: province.state, cost: 0, growthCost: 0}, 0);
    }
  }

  while (queue.length) {
    const {cell, province, state, cost, growthCost} = queue.pop();
    if (settled[cell] || cost !== costs[cell] || tentativeOwners[cell] !== province) continue;
    settled[cell] = 1;
    if (cells.h[cell] >= 20) provinceIds[cell] = province;

    for (const neighbor of cells.c[cell] || []) {
      if (settled[neighbor]) continue;
      const fixedOwner = fixedOwners.get(neighbor);
      if (fixedProvinceIds.has(province) && fixedOwner !== province) continue;
      if (fixedOwner && fixedOwner !== province) continue;
      const land = cells.h[neighbor] >= 20;
      if (!land && !cells.t[neighbor]) continue;
      if (land && cells.state[neighbor] !== state) continue;
      const elevationCost = cells.h[neighbor] >= 70 ? 100 : cells.h[neighbor] >= 50 ? 30 : cells.h[neighbor] >= 20 ? 10 : 100;
      const nextGrowthCost = growthCost + elevationCost;
      const totalCost = cost + elevationCost + riverPoliticalTransition(riverBarrier, cell, neighbor, {level: "province"}).cost;
      if (nextGrowthCost > maxGrowth || totalCost >= costs[neighbor]) continue;
      tentativeOwners[neighbor] = province;
      costs[neighbor] = totalCost;
      queue.push({cell: neighbor, province, state, cost: totalCost, growthCost: nextGrowthCost}, totalCost);
    }
  }
}

function justifyPackProvinces(pack, provinces, provinceIds, fixedOwners = new Map(), riverBarrier = null) {
  const {cells} = pack;
  const fixedProvinceIds = new Set(fixedOwners.values());
  for (const cell of cells.i) {
    if (fixedOwners.has(cell)) continue;
    if (cells.burg[cell]) continue;
    const sameStateNeighbors = (cells.c[cell] || []).filter(neighbor => cells.state[neighbor] === cells.state[cell] && !isStrongRiverPoliticalTransition(riverBarrier, cell, neighbor, "province"));
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
    if (bestProvince && !fixedProvinceIds.has(bestProvince)) provinceIds[cell] = bestProvince;
  }
}

function smoothPackProvinceBoundarySpikes(pack, provinces, provinceIds, fixedOwners = new Map(), riverBarrier = null) {
  const {cells} = pack;
  const protectedCells = new Set();
  const fixedProvinceIds = new Set(fixedOwners.values());
  for (const province of provinces) {
    if (province?.i && cells.h[province.center] >= 20) protectedCells.add(province.center);
  }
  for (const cell of cells.i) {
    if (cells.burg[cell] && cells.h[cell] >= 20) protectedCells.add(cell);
  }
  for (const cell of fixedOwners.keys()) protectedCells.add(cell);

  absorbBoundarySpikes(cells, provinceIds, {
    passes: 3,
    protectedCells,
    canInspect: cell => cells.h[cell] >= 20 && Boolean(provinces[provinceIds[cell]]),
    canUseNeighbor: (neighbor, cell) => cells.h[neighbor] >= 20 && cells.state[neighbor] === cells.state[cell] && !isStrongRiverPoliticalTransition(riverBarrier, cell, neighbor, "province"),
    canAbsorbTo: value => value > 0 && Boolean(provinces[value]) && !fixedProvinceIds.has(value)
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

function repairDisconnectedPoliticalComponents(cells, values, records, {
  level,
  riverBarrier = null,
  protectedCells = new Set(),
  protectedIds = new Set()
} = {}) {
  let changed = 0;
  for (let pass = 0; pass < values.length; pass++) {
    const groups = collectPoliticalComponents(cells, values, records);
    let repaired = false;
    for (const [key, components] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      if (components.length < 2) continue;
      const owner = Number(key.split(":", 1)[0]);
      if (protectedIds.has(owner)) continue;
      const center = Number(records?.[owner]?.center);
      const anchor = components.find(component => component.includes(center))
        || [...components].sort((a, b) => b.length - a.length || a[0] - b[0])[0];
      for (const component of components) {
        if (component === anchor || component.some(cell => protectedCells.has(cell))) continue;
        const target = connectedComponentAbsorptionTarget(cells, values, records, component, owner, level, riverBarrier, protectedIds);
        if (!target) continue;
        for (const cell of component) values[cell] = target;
        changed += component.length;
        repaired = true;
        break;
      }
      if (repaired) break;
    }
    if (!repaired) break;
  }
  return changed;
}

function collectPoliticalComponents(cells, values, records) {
  const groups = new Map();
  const visited = new Uint8Array(values.length);
  for (const start of cells.i || []) {
    const owner = Number(values[start]) || 0;
    if (visited[start] || cells.h[start] < 20 || !records?.[owner] || records[owner].removed) continue;
    const feature = Number(cells.f?.[start]) || 0;
    const component = [];
    const queue = [start];
    visited[start] = 1;
    while (queue.length) {
      const cell = queue.pop();
      component.push(cell);
      for (const neighbor of cells.c?.[cell] || []) {
        if (visited[neighbor] || cells.h[neighbor] < 20 || Number(values[neighbor]) !== owner || (Number(cells.f?.[neighbor]) || 0) !== feature) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    const key = `${owner}:${feature}`;
    const list = groups.get(key) || [];
    list.push(component.sort((a, b) => a - b));
    groups.set(key, list);
  }
  return groups;
}

function connectedComponentAbsorptionTarget(cells, values, records, component, owner, level, riverBarrier, protectedIds) {
  const candidates = new Map();
  const componentSet = new Set(component);
  const feature = Number(cells.f?.[component[0]]) || 0;
  for (const cell of component) for (const neighbor of cells.c?.[cell] || []) {
    if (componentSet.has(neighbor) || cells.h[neighbor] < 20 || (Number(cells.f?.[neighbor]) || 0) !== feature) continue;
    const target = Number(values[neighbor]) || 0;
    if (!target || target === owner || protectedIds.has(target) || !records?.[target] || records[target].removed) continue;
    if (level === "province" && Number(records[target].state) !== Number(records[owner]?.state)) continue;
    const entry = candidates.get(target) || {edges: 0, cost: 0};
    entry.edges++;
    entry.cost += riverPoliticalTransition(riverBarrier, cell, neighbor, {level}).cost;
    candidates.set(target, entry);
  }
  return [...candidates]
    .sort((a, b) => a[1].cost / a[1].edges - b[1].cost / b[1].edges || b[1].edges - a[1].edges || a[0] - b[0])[0]?.[0] || 0;
}

function fillUnassignedProvinceCells(pack, provinces, provinceIds, random, maxGrowth, nameGenerator, allocateProvinceId = () => provinces.length, protectedStateIds = new Set(), riverBarrier = null) {
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
      const burgId = cells.burg[center] || 0;
      const burg = burgs[burgId];
      const attachedProvinceId = burg ? 0 : nearestExistingProvinceId(cells, provinces, provinceIds, state, center);
      const provinceId = attachedProvinceId || allocateProvinceId();
      if (!attachedProvinceId) {
        const provinceName = nameGenerator.makeProvinceName({
          id: provinceId,
          cell: center,
          culture: burg?.culture || state.culture,
          cultureType: pack.cultures?.[burg?.culture || state.culture]?.nameStyle || pack.cultures?.[burg?.culture || state.culture]?.type,
          state: state.i,
          baseName: burg?.name || state.name,
          formName: provinceFormForState(state, pack.cultures)
        });
        provinceName.fullName = `${provinceName.name}${provinceName.formName}`;
        provinces[provinceId] = {
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
        if (!protectedStateIds.has(state.i)) state.provinces.push(provinceId);
      }

      runId++;
      costs[center] = 0;
      seen[center] = runId;
      provinceIds[center] = provinceId;
      remaining[center] = 0;
      remainingCount--;
      queue.push({cell: center, cost: 0, growthCost: 0}, 0);

      while (queue.length) {
        const {cell, cost, growthCost} = queue.pop();
        if (seen[cell] !== runId || cost !== costs[cell]) continue;
        for (const neighbor of cells.c[cell] || []) {
          if (provinceIds[neighbor]) continue;
          if (cells.state[neighbor] && cells.state[neighbor] !== state.i) continue;
          const land = cells.h[neighbor] >= 20;
          const step = land ? (cells.state[neighbor] === state.i ? 3 : 20) : cells.t[neighbor] ? 10 : 30;
          const nextGrowthCost = growthCost + step;
          const nextCost = cost + step + riverPoliticalTransition(riverBarrier, cell, neighbor, {level: "province"}).cost;
          const currentCost = seen[neighbor] === runId ? costs[neighbor] : Infinity;
          if (nextGrowthCost > maxGrowth || nextCost >= currentCost) continue;
          if (land && cells.state[neighbor] === state.i) {
            provinceIds[neighbor] = provinceId;
            if (remaining[neighbor]) {
              remaining[neighbor] = 0;
              remainingCount--;
            }
          }
          costs[neighbor] = nextCost;
          seen[neighbor] = runId;
          queue.push({cell: neighbor, cost: nextCost, growthCost: nextGrowthCost}, nextCost);
        }
      }
    }
  }
}

function nearestExistingProvinceId(cells, provinces, provinceIds, state, center) {
  const direct = (cells.c?.[center] || []).map(neighbor => Number(provinceIds?.[neighbor]) || 0).filter(id => Number(provinces[id]?.state) === Number(state.i));
  if (direct.length) return Math.min(...direct);
  const point = cells.p?.[center];
  if (!point) return 0;
  let bestId = 0;
  let bestDistance = Infinity;
  for (const province of provinces) {
    if (!province?.i || Number(province.state) !== Number(state.i) || !cells.p?.[province.center]) continue;
    const [x, y] = cells.p[province.center];
    const squared = (point[0] - x) ** 2 + (point[1] - y) ** 2;
    if (squared > bestDistance || squared === bestDistance && province.i >= bestId) continue;
    bestId = province.i;
    bestDistance = squared;
  }
  return bestId;
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

function collectProvinceStatistics(pack, provinces, provinceIds, protectedIds = new Set()) {
  for (const province of provinces) {
    if (!province || protectedIds.has(provinceColorId(province))) continue;
    province.cells = 0;
    province.area = 0;
  }

  for (const cell of pack.cells.i) {
    const province = provinces[provinceIds[cell]];
    if (!province || protectedIds.has(provinceColorId(province)) || pack.cells.h[cell] < 20) continue;
    province.cells++;
    province.area += pack.cells.area[cell] || 0;
  }

  for (const province of provinces) {
    if (!province || protectedIds.has(provinceColorId(province))) continue;
    province.area = round(province.area || 0, 2);
  }
}

function assignProvincePoles(pack, provinces, provinceIds, protectedIds = new Set()) {
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
    if (!province?.i || province.removed || protectedIds.has(province.i)) continue;
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

function mirrorPackProvinceToGrid(grid, pack, fixedOwners = new Map(), protectedIds = new Set(fixedOwners.values())) {
  const values = new Array(grid.points.length).fill(0);
  const bestScore = new Float32Array(grid.points.length).fill(-1);
  const fallbackValues = new Array(grid.points.length).fill(0);
  const fallbackScore = new Float32Array(grid.points.length).fill(-1);
  const fixedProvinceIds = protectedIds;

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    const score = pack.cells.pop?.[packCell] || pack.cells.s?.[packCell] || 0;
    const provinceId = pack.cells.province?.[packCell] || 0;
    if (!fixedProvinceIds.has(provinceId) && score >= fallbackScore[gridCell]) {
      fallbackValues[gridCell] = provinceId;
      fallbackScore[gridCell] = score;
    }
    if (score < bestScore[gridCell]) continue;
    values[gridCell] = provinceId;
    bestScore[gridCell] = score;
  }

  for (let gridCell = 0; gridCell < values.length; gridCell++) {
    if (!fixedOwners.has(gridCell) && fixedProvinceIds.has(values[gridCell])) values[gridCell] = fallbackValues[gridCell];
  }
  for (const [gridCell, provinceId] of fixedOwners) values[gridCell] = provinceId;
  smoothMirroredGridProvinces(grid, pack, values, fixedOwners, protectedIds);
  return values;
}

function smoothMirroredGridProvinces(grid, pack, values, fixedOwners = new Map(), protectedIds = new Set(fixedOwners.values())) {
  const protectedCells = protectedGridCellsForPackBurgs(pack, {capitalsOnly: true});
  const fixedProvinceIds = protectedIds;
  for (const province of pack.provinces || []) {
    const gridCenter = Number.isInteger(province?.gridCenter) ? province.gridCenter : Number.isInteger(province?.center) ? pack.cells.g?.[province.center] : null;
    if (Number.isInteger(gridCenter) && grid.cells.h[gridCenter] >= 20) protectedCells.add(gridCenter);
  }
  for (const gridCell of fixedOwners.keys()) protectedCells.add(gridCell);

  absorbBoundarySpikes(grid.cells, values, {
    passes: 3,
    protectedCells,
    canInspect: cell => grid.cells.h[cell] >= 20 && values[cell] > 0,
    canUseNeighbor: (neighbor, cell) => grid.cells.h[neighbor] >= 20 && grid.cells.state?.[neighbor] === grid.cells.state?.[cell],
    canAbsorbTo: value => value > 0 && !fixedProvinceIds.has(value)
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

function expandStates(grid, features, states, riverCells, riverBarrier = null) {
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
    const riverCost = riverBarrier
      ? riverPoliticalTransition(riverBarrier, from, to, {level: "state"}).cost
      : riverCells.has(to) && !riverCells.has(from) ? 28 : 0;
    return Math.max(6, distance(grid.points[from], grid.points[to]) + cultureCost + religionCost + mountainCost + slope * 4 + riverCost);
  });
}

function expandProvinces(grid, features, provinces, riverCells, riverBarrier = null) {
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
      const riverCost = riverBarrier
        ? riverPoliticalTransition(riverBarrier, from, to, {level: "province"}).cost
        : riverCells.has(to) && !riverCells.has(from) ? 20 : 0;
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
  const settled = new Uint8Array(grid.points.length);
  const queue = new MinPriorityQueue();

  for (const center of centers) {
    if (center.cell < 0) continue;
    values[center.cell] = center.id;
    costs[center.cell] = 0;
    queue.push({cell: center.cell, center, cost: 0}, 0);
  }

  while (queue.length) {
    const {cell, center, cost} = queue.pop();
    if (settled[cell] || cost !== costs[cell] || values[cell] !== center.id) continue;
    settled[cell] = 1;
    if (!isLandFeature(features, grid, cell)) continue;

    for (const neighbor of getCellNeighbors(grid, cell)) {
      if (settled[neighbor] || !isLandFeature(features, grid, neighbor)) continue;
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
