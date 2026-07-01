import {MinPriorityQueue} from "./priority-queue.js";
import {createStageProfile} from "./profile.js";
import {normalizeInheritanceMode, rebuildInheritanceTree, summarizeInheritanceTree} from "./inheritance.js";

const CULTURE_ROOTS = ["昭宁", "雁川", "栖梧", "青岚", "星渚", "南衡", "白麓", "清河", "苍原", "岚湾", "云麓", "河洛", "北辰", "东衡", "西陵", "海澜", "赤原", "沙洲", "霜庭", "松岳", "月湾", "石原", "晴川", "夜渡", "金台", "雨林", "岭南", "北海", "东渚", "朱明", "玄岭", "素川"];
const RELIGION_ROOTS = ["天衡", "星渚", "青岚", "白麓", "南明", "清河", "玄曜", "苍极", "云章", "赤霄", "静澜", "昭灵"];
const RELIGION_FORMS = {
  Folk: ["民俗", "祖灵崇拜", "山川祭", "万灵信仰", "图腾礼"],
  Organized: ["圣教", "正信", "大寺", "神道", "明教", "法门", "天律"],
  Cult: ["秘仪", "隐修会", "密教", "幽社"],
  Heresy: ["异端", "新派", "裂教", "旁门"]
};
const BIOME_COST = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150];
const CULTURE_TYPES = {
  generic: "Generic",
  lake: "Lake",
  naval: "Naval",
  river: "River",
  nomadic: "Nomadic",
  hunting: "Hunting",
  highland: "Highland"
};

export function buildSociety(grid, features, climate, rivers, random, pack, options = {}) {
  const startedAt = performance.now();
  const cultureResult = pack?.cells?.s ? buildPackCultures(grid, pack, random, options) : buildGridFallbackCultures(grid, features, rivers, random, options);
  const religionResult = pack?.cells?.s ? initializePackReligions(grid, pack) : buildGridReligions(grid, features, rivers, random, options);

  return {
    cultures: cultureResult.cultures,
    religions: religionResult.religions,
    metadata: {
      religions: religionResult.count,
      cultures: cultureResult.count,
      cultureNames: cultureResult.cultures.filter(culture => culture?.i).map(culture => culture.name),
      religionNames: religionResult.religions.filter(religion => religion?.i).map(religion => religion.name),
      cultureTree: summarizeInheritanceTree(cultureResult.cultures),
      religionTree: summarizeInheritanceTree(religionResult.religions),
      cultureCenters: cultureResult.centers,
      religionCenters: religionResult.centers,
      culturedPackCells: cultureResult.packCells,
      culturedGridCells: cultureResult.gridCells,
      religionPackCells: religionResult.packCells,
      religionGridCells: religionResult.gridCells,
      cultureTiming: cultureResult.timing || null,
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
}

export function finalizeSocietyReligions(grid, society, pack, random, settlements, options = {}) {
  if (!pack?.cells?.s) return society;
  const startedAt = performance.now();
  const result = buildPackReligions(grid, pack, society, random, settlements, options);

  society.religions = result.religions;
  society.metadata.religions = result.count;
  society.metadata.religionNames = result.religions.filter(religion => religion?.i).map(religion => religion.name);
  society.metadata.religionTree = summarizeInheritanceTree(result.religions);
  society.metadata.religionCenters = result.centers;
  society.metadata.religionPackCells = result.packCells;
  society.metadata.religionGridCells = result.gridCells;
  society.metadata.religionBuildMs = roundMs(performance.now() - startedAt);
  society.metadata.buildMs = roundMs((society.metadata.buildMs || 0) + society.metadata.religionBuildMs);
  return society;
}

function buildPackCultures(grid, pack, random, options) {
  const profile = createStageProfile();
  const {cells} = pack;
  const populated = profile.stage("collect-populated", "收集文化候选地", () => cells.i.filter(cell => isPopulatedPackCell(cells, cell)));
  const defaultDefinitions = getDefaultCultureDefinitions(options);
  let count = Math.min(defaultDefinitions.length, Math.max(0, Math.floor(options.culturesNumber ?? 12)), Math.max(1, Math.floor(options.culturesSetMax ?? 32)));
  if (populated.length < count * 25) count = Math.floor(populated.length / 50);
  const cultureIds = new Uint16Array(cells.i.length);

  if (!count) {
    cells.culture = cultureIds;
    grid.cells.culture = new Array(grid.points.length).fill(0);
    pack.cultures = [createWildlandsCulture()];
    rebuildInheritanceTree(pack.cultures);
    return {cultures: pack.cultures, centers: [], packCells: 0, gridCells: 0, timing: profile.finish()};
  }

  const context = profile.stage("create-context", "准备文化选址上下文", () => createCultureContext(grid, pack, populated));
  const selected = profile.stage("select-definitions", "选择文化定义", () =>
    options.culturesSet === "antique" ? defaultDefinitions.slice(0, count) : selectCultureDefinitions(defaultDefinitions, count, random)
  );
  const cultures = [createWildlandsCulture()];
  const centers = [];
  let spacing = (grid.metadata.graphWidth + grid.metadata.graphHeight) / 2 / count;
  const rankScores = new Float64Array(cells.i.length);

  profile.stage("place-centers", "放置文化中心", () => {
    for (let index = 0; index < selected.length; index++) {
      const definition = selected[index];
      const sort = definition.sort || ((cell, context) => context.pack.cells.s[cell] || 0);
      const ranked = rankCultureCandidates(populated, context, sort, rankScores);
      const center = placeCultureCenter({cells, ranked, centers, spacing, random, cultureIds});
      if (center === -1) continue;

      const cultureId = cultures.length;
      const type = defineCultureType(pack, center, random);
      const culture = {
        id: cultureId,
        i: cultureId,
        name: `${definition.root}文化`,
        root: definition.root,
        nameStyle: definition.nameStyle || null,
        center,
        gridCenter: cells.g[center],
        type,
        expansionism: defineExpansionism(type, random, options.sizeVariety),
        colorIndex: index,
        cells: 0,
        area: 0,
        rural: 0,
        origins: [0]
      };

      cultures.push(culture);
      centers.push({cell: center, cultureId, point: cells.p[center]});
      cultureIds[center] = cultureId;
    }
  });

  const populatedMask = profile.stage("create-populated-mask", "建立人口 cell 掩码", () => createCellMask(cells.i.length, populated));
  profile.stage("expand-cultures", "扩张文化", () => expandPackCultures(pack, cultures, centers, cultureIds, populatedMask));
  if (shouldFillUnassignedPopulatedCultures(options, pack)) {
    profile.stage("fill-unassigned", "补齐未归属文化人口", () => fillUnassignedPopulatedCultures(pack, cultures, centers, cultureIds, populatedMask));
  }
  cells.culture = cultureIds;
  profile.stage("summarize", "汇总文化覆盖", () => summarizeCultureCoverage(pack, cultures));
  profile.stage("inheritance", "构建文化继承树", () => applyCultureInheritance(cultures, pack, random, options));
  const gridCells = profile.stage("mirror-grid", "同步文化到 grid", () => mirrorPackCultureToGrid(grid, pack));
  pack.cultures = cultures;

  return {
    cultures,
    count: cultures.filter(culture => culture?.i && !culture.removed).length,
    centers: centers.map(center => center.cell),
    packCells: countPositive(cultureIds),
    gridCells,
    timing: profile.finish()
  };
}

function buildGridFallbackCultures(grid, features, rivers, random, options) {
  const landCells = grid.points
    .map((point, cell) => ({cell, height: grid.cells.h[cell], biome: grid.cells.biome[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell));
  const riverCells = new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells));
  const cultureCenters = pickGridCenters(landCells, random, Math.min(8, CULTURE_DEFINITIONS.length), grid);
  const cultures = [
    createWildlandsCulture(),
    ...cultureCenters.map((center, index) => ({
      id: index + 1,
      i: index + 1,
      name: `${CULTURE_DEFINITIONS[index].root}文化`,
      root: CULTURE_DEFINITIONS[index].root,
      nameStyle: CULTURE_DEFINITIONS[index].nameStyle || null,
      center: center.cell,
      gridCenter: center.cell,
      type: CULTURE_TYPES.generic,
      expansionism: 1
    }))
  ];

  const expanded = expandGridCenters(grid, features, cultureCenters, (from, to, owner) =>
    cultureGridCost(grid, riverCells, from, to, cultureCenters[owner].cell)
  );
  grid.cells.culture = expanded.map(value => value + 1);
  applyCultureInheritance(cultures, null, random, options);

  return {
    cultures,
    count: cultures.filter(culture => culture?.i && !culture.removed).length,
    centers: cultureCenters.map(center => center.cell),
    packCells: 0,
    gridCells: countPositive(grid.cells.culture)
  };
}

function initializePackReligions(grid, pack) {
  pack.cells.religion = new Uint16Array(pack.cells.i.length);
  pack.religions = [createNoReligion()];
  rebuildInheritanceTree(pack.religions);
  grid.cells.religion = new Array(grid.points.length).fill(0);
  return {religions: pack.religions, count: 0, centers: [], packCells: 0, gridCells: 0};
}

function buildGridReligions(grid, features, rivers, random, options) {
  const riverCells = new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells));
  const religionCells = getGridReligionCells(grid, features);
  const religionCenters = pickGridCenters(religionCells, random, Math.min(RELIGION_ROOTS.length, 6), grid);
  const religions = [
    createNoReligion(),
    ...religionCenters.map((center, index) => ({
      id: index + 1,
      i: index + 1,
      name: `${RELIGION_ROOTS[index]}${RELIGION_FORMS.Organized[index % RELIGION_FORMS.Organized.length]}`,
      type: "Organized",
      form: RELIGION_FORMS.Organized[index % RELIGION_FORMS.Organized.length],
      culture: grid.cells.culture?.[center.cell] || 0,
      center: center.cell,
      gridCenter: center.cell,
      expansion: "global",
      expansionism: 1
    }))
  ];

  const expanded = expandGridCenters(grid, features, religionCenters, (from, to, owner) =>
    religionCost(grid, riverCells, from, to, religionCenters[owner].cell)
  );
  grid.cells.religion = expanded.map((value, cell) => (isLandFeature(features, grid, cell) && religionCenters[value] ? value + 1 : 0));
  applyReligionInheritance(religions, {cultures: []}, null, random, options);

  return {
    religions,
    count: religions.length - 1,
    centers: religionCenters.map(center => center.cell),
    packCells: 0,
    gridCells: countPositive(grid.cells.religion)
  };
}

function buildPackReligions(grid, pack, society, random, settlements, options) {
  const {cells} = pack;
  const folkReligions = createFolkReligions(pack, society, random);
  const organizedReligions = createOrganizedReligions(pack, society, random, Math.max(0, Math.floor(options.religionsNumber ?? 6)));
  const religions = combinePackReligions([...folkReligions, ...organizedReligions]);
  applyReligionInheritance(religions, society, pack, random, options);
  const religionIds = expandPackReligions(pack, religions);

  cells.religion = religionIds;
  checkReligionCenters(pack, religions);
  summarizeReligionCoverage(pack, religions);
  const gridCells = mirrorPackReligionToGrid(grid, pack);
  syncReligionsToSettlementsAndPolitics(pack, settlements);
  pack.religions = religions;

  return {
    religions,
    count: religions.filter(religion => religion?.i && !religion.removed).length,
    centers: religions.filter(religion => religion?.i && !religion.removed).map(religion => religion.center),
    packCells: countPositive(religionIds),
    gridCells
  };
}

function applyCultureInheritance(cultures, pack, random, options = {}) {
  const mode = normalizeInheritanceMode(options?.cultureInheritanceMode);
  for (const culture of cultures || []) {
    if (!culture) continue;
    culture.parent = Number.isInteger(culture.parent) ? culture.parent : 0;
  }

  if (mode !== "flat") {
    const rootsChance = mode === "regional" ? 0.52 : 0.28;
    const previous = [];
    for (const culture of (cultures || []).filter(item => item?.i && !item.removed).sort((a, b) => a.i - b.i)) {
      if (!previous.length || random.next() < rootsChance) culture.parent = 0;
      else culture.parent = pickCultureParent(culture, previous, pack, random, mode);
      previous.push(culture);
    }
  } else {
    for (const culture of cultures || []) if (culture?.i) culture.parent = 0;
  }

  rebuildInheritanceTree(cultures);
}

function pickCultureParent(culture, previous, pack, random, mode) {
  const scored = previous
    .map(parent => ({
      parent,
      score: cultureParentScore(culture, parent, pack)
    }))
    .sort((a, b) => a.score - b.score);
  const limit = Math.min(scored.length, mode === "regional" ? 2 : 4);
  return scored[Math.floor(random.next() * limit)]?.parent?.i || 0;
}

function cultureParentScore(culture, parent, pack) {
  let score = 0;
  if (culture.type !== parent.type) score += 70;
  if (culture.nameStyle !== parent.nameStyle) score += 24;
  score += Math.abs((Number(culture.expansionism) || 0) - (Number(parent.expansionism) || 0)) * 12;

  const culturePoint = packCellPoint(pack, culture.center);
  const parentPoint = packCellPoint(pack, parent.center);
  if (culturePoint && parentPoint) score += distance(culturePoint, parentPoint) / 12;
  return score;
}

function applyReligionInheritance(religions, society, pack, random, options = {}) {
  const mode = normalizeInheritanceMode(options?.religionInheritanceMode);
  for (const religion of religions || []) {
    if (!religion) continue;
    religion.parent = Number.isInteger(religion.parent) ? religion.parent : 0;
  }

  if (mode === "flat") {
    for (const religion of religions || []) if (religion?.i) religion.parent = 0;
    rebuildInheritanceTree(religions);
    return;
  }

  const folkByCulture = new Map(
    (religions || []).filter(religion => religion?.i && religion.type === "Folk" && !religion.removed).map(religion => [Number(religion.culture) || 0, religion.i])
  );
  const previous = [];

  for (const religion of (religions || []).filter(item => item?.i && !item.removed).sort((a, b) => a.i - b.i)) {
    const cultureId = Number(religion.culture) || 0;
    if (religion.type === "Folk") {
      const culture = society?.cultures?.[cultureId];
      const parentCultureId = Number(culture?.parent) || 0;
      religion.parent = parentCultureId && folkByCulture.has(parentCultureId) ? folkByCulture.get(parentCultureId) : 0;
    } else {
      religion.parent = pickReligionParent(religion, previous, folkByCulture, pack, random, mode);
    }
    previous.push(religion);
  }

  rebuildInheritanceTree(religions);
}

function pickReligionParent(religion, previous, folkByCulture, pack, random, mode) {
  const localFolk = folkByCulture.get(Number(religion.culture) || 0) || 0;
  if (localFolk && (religion.type === "Cult" || religion.type === "Heresy" || random.next() < 0.55)) return localFolk;

  const scored = previous
    .filter(parent => parent.type !== "Folk" || mode === "branching")
    .map(parent => ({
      parent,
      score: religionParentScore(religion, parent, pack)
    }))
    .sort((a, b) => a.score - b.score);
  const limit = Math.min(scored.length, mode === "regional" ? 2 : 4);
  return scored[Math.floor(random.next() * limit)]?.parent?.i || localFolk || 0;
}

function religionParentScore(religion, parent, pack) {
  let score = 0;
  if (religion.culture !== parent.culture) score += 60;
  if (religion.type !== parent.type) score += parent.type === "Folk" ? 18 : 32;
  if (religion.form !== parent.form) score += 12;
  score += Math.abs((Number(religion.expansionism) || 0) - (Number(parent.expansionism) || 0)) * 8;

  const religionPoint = packCellPoint(pack, religion.center);
  const parentPoint = packCellPoint(pack, parent.center);
  if (religionPoint && parentPoint) score += distance(religionPoint, parentPoint) / 14;
  return score;
}

function packCellPoint(pack, cell) {
  return Number.isInteger(cell) ? pack?.cells?.p?.[cell] || null : null;
}

function createFolkReligions(pack, society, random) {
  return (society.cultures || [])
    .filter(culture => culture?.i && !culture.removed && Number.isInteger(culture.center))
    .map(culture => {
      const form = pick(RELIGION_FORMS.Folk, random);
      return {
        type: "Folk",
        form,
        culture: culture.i,
        center: culture.center,
        name: `${culture.root || culture.name?.replace("文化", "") || "本土"}${form}`,
        deity: null,
        expansion: "culture",
        expansionism: 0,
        color: createReligionColor(culture.i, "Folk")
      };
    });
}

function createOrganizedReligions(pack, society, random, target) {
  const candidateCells = getReligionCandidateCells(pack, target);
  const centers = placePackReligionCenters(pack, candidateCells, target);
  const cultsCount = Math.floor((random.integer(1, 4) / 10) * centers.length);
  const heresiesCount = Math.floor((random.integer(0, 3) / 10) * centers.length);
  const organizedCount = centers.length - cultsCount - heresiesCount;

  return centers.map((center, index) => {
    const type = index < organizedCount ? "Organized" : index < organizedCount + cultsCount ? "Cult" : "Heresy";
    const cultureId = pack.cells.culture?.[center] || 0;
    const culture = society.cultures?.[cultureId];
    const form = pick(RELIGION_FORMS[type], random);
    const root = RELIGION_ROOTS[index % RELIGION_ROOTS.length];
    const expansion = defineReligionExpansion(pack, center, type, random);
    const stateId = pack.cells.state?.[center] || 0;

    return {
      type,
      form,
      culture: cultureId,
      center,
      gridCenter: pack.cells.g[center],
      name: createPackReligionName({root, culture, form, type, stateId}),
      deity: type === "Cult" ? `${root}秘主` : type === "Heresy" ? `${root}异说` : `${root}上灵`,
      expansion,
      expansionism: defineReligionExpansionism(type, random),
      color: createReligionColor(cultureId, type)
    };
  });
}

function getReligionCandidateCells(pack, required) {
  const burgs = (pack.burgs || []).filter(burg => burg?.i && !burg.removed && isValidReligionCenter(pack.cells, burg.cell));
  if (burgs.length >= required) return burgs.sort((a, b) => (b.population || 0) - (a.population || 0)).map(burg => burg.cell);
  return pack.cells.i
    .filter(cell => isValidReligionCenter(pack.cells, cell) && (pack.cells.s[cell] || 0) > 2)
    .sort((a, b) => (pack.cells.s[b] || 0) - (pack.cells.s[a] || 0));
}

function placePackReligionCenters(pack, candidateCells, target) {
  const centers = [];
  const [width, height] = getPackExtent(pack);
  const spacing = Math.max(1, (width + height) / 2 / target);

  for (const cell of candidateCells) {
    if (centers.length >= target) break;
    const point = pack.cells.p[cell];
    const tooClose = centers.some(center => distance(point, pack.cells.p[center]) < spacing);
    if (!tooClose) centers.push(cell);
  }

  if (centers.length >= target) return centers;
  for (const cell of candidateCells) {
    if (centers.length >= target) break;
    if (!centers.includes(cell)) centers.push(cell);
  }
  return centers;
}

function getPackExtent(pack) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of pack.cells.p) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX)) return [1, 1];
  return [Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
}

function combinePackReligions(rawReligions) {
  const religions = [createNoReligion()];
  const usedNames = new Set(["No religion"]);

  for (const religion of rawReligions) {
    const i = religions.length;
    const name = uniqueName(religion.name, usedNames);
    religions.push({
      ...religion,
      id: i,
      i,
      name,
      code: createReligionCode(name, i),
      origins: religion.type === "Folk" ? [0] : []
    });
  }

  return religions;
}

function expandPackReligions(pack, religions) {
  const {cells} = pack;
  const religionIds = spreadFolkReligions(pack, religions);
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new MinPriorityQueue();
  const maxExpansionCost = cells.i.length / 20;

  for (const religion of religions) {
    if (!religion?.i || religion.type === "Folk" || religion.removed) continue;
    religionIds[religion.center] = religion.i;
    costs[religion.center] = 1;
    queue.push({cell: religion.center, religionId: religion.i, state: cells.state?.[religion.center] || 0, priority: 0}, 0);
  }

  while (queue.length) {
    const {cell, religionId, state, priority} = queue.pop();
    if (priority > costs[cell]) continue;
    const religion = religions[religionId];
    if (!religion) continue;

    for (const next of cells.c[cell] || []) {
      if (religion.expansion === "culture" && religion.culture !== cells.culture?.[next]) continue;
      if (religion.expansion === "state" && state !== (cells.state?.[next] || 0)) continue;

      const cultureCost = religion.culture !== (cells.culture?.[next] || 0) ? 10 : 0;
      const stateCost = state !== (cells.state?.[next] || 0) ? 10 : 0;
      const passageCost = getReligionPassageCost(pack, cell, next);
      const total = priority + 10 + (cultureCost + stateCost + passageCost) / Math.max(0.1, religion.expansionism || 1);

      if (total > maxExpansionCost || total >= costs[next]) continue;
      if (cells.culture?.[next]) religionIds[next] = religionId;
      costs[next] = total;
      queue.push({cell: next, religionId, state, priority: total}, total);
    }
  }

  return religionIds;
}

function spreadFolkReligions(pack, religions) {
  const religionIds = new Uint16Array(pack.cells.i.length);
  const cultureToReligion = new Map(
    religions.filter(religion => religion.type === "Folk" && !religion.removed).map(religion => [religion.culture, religion.i])
  );

  for (const cell of pack.cells.i) {
    const cultureId = pack.cells.culture?.[cell] || 0;
    religionIds[cell] = cultureToReligion.get(cultureId) || 0;
  }
  return religionIds;
}

function getReligionPassageCost(pack, from, to) {
  const route = getRouteBetween(pack, from, to);
  if (pack.cells.h[from] < 20) return route ? 50 : 500;

  const biomeCost = BIOME_COST[pack.cells.biome?.[to]] ?? 50;
  if (route?.group === "roads") return 1;
  if (route) return biomeCost / 3;
  return biomeCost;
}

function getRouteBetween(pack, from, to) {
  const routeId = pack.cells.routes?.[from]?.[to];
  if (!Number.isInteger(routeId)) return null;
  return pack.routes?.[routeId] || null;
}

function checkReligionCenters(pack, religions) {
  for (const religion of religions) {
    if (!religion?.i || religion.removed) continue;
    if (pack.cells.religion[religion.center] === religion.i) continue;
    const firstCell = pack.cells.i.find(cell => pack.cells.religion[cell] === religion.i);
    const cultureCenter = pack.cultures?.[religion.culture]?.center;
    if (Number.isInteger(firstCell)) religion.center = firstCell;
    else if (religion.type === "Folk" && Number.isInteger(cultureCenter)) religion.center = cultureCenter;
  }
}

function summarizeReligionCoverage(pack, religions) {
  for (const religion of religions) {
    if (!religion) continue;
    religion.cells = 0;
    religion.area = 0;
    religion.rural = 0;
    religion.urban = 0;
  }

  for (const cell of pack.cells.i) {
    const religion = religions[pack.cells.religion[cell]];
    if (!religion) continue;
    religion.cells++;
    religion.area = round((religion.area || 0) + (pack.cells.area?.[cell] || 0), 2);
    religion.rural = round((religion.rural || 0) + (pack.cells.pop?.[cell] || 0), 2);
  }

  for (const burg of pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const religion = religions[pack.cells.religion[burg.cell]];
    if (religion) religion.urban = round((religion.urban || 0) + (burg.population || 0), 2);
  }
}

function mirrorPackReligionToGrid(grid, pack) {
  const values = new Array(grid.points.length).fill(0);
  const bestScore = new Float32Array(grid.points.length).fill(-1);

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    const score = pack.cells.pop?.[packCell] || pack.cells.s?.[packCell] || pack.cells.h?.[packCell] || 0;
    if (score < bestScore[gridCell]) continue;
    values[gridCell] = pack.cells.religion[packCell] || 0;
    bestScore[gridCell] = score;
  }

  grid.cells.religion = values;
  return countPositive(values);
}

function syncReligionsToSettlementsAndPolitics(pack, settlements) {
  for (const burg of pack.burgs || []) {
    if (!burg?.i) continue;
    burg.religion = pack.cells.religion[burg.cell] || 0;
  }
  for (const city of settlements?.cities || []) {
    if (!Number.isInteger(city.packCell)) continue;
    city.religion = pack.cells.religion[city.packCell] || 0;
  }
  for (const state of pack.states || []) {
    if (!state?.i) continue;
    const capitalCell = pack.burgs?.[state.capital]?.cell ?? state.center;
    state.religion = pack.cells.religion[capitalCell] || 0;
  }
  for (const province of pack.provinces || []) {
    if (!province?.i) continue;
    province.religion = pack.cells.religion[province.center] || 0;
  }
}

function defineReligionExpansion(pack, center, type, random) {
  if (type === "Cult" || type === "Heresy") return random.next() < 0.35 ? "culture" : "global";
  const stateId = pack.cells.state?.[center] || 0;
  if (stateId && random.next() < 0.35) return "state";
  return random.next() < 0.45 ? "culture" : "global";
}

function defineReligionExpansionism(type, random) {
  if (type === "Organized") return round(random.range(3, 8), 1);
  if (type === "Cult") return round(random.range(0.3, 1.4), 1);
  if (type === "Heresy") return round(random.range(0.6, 1.8), 1);
  return 0;
}

function createPackReligionName({root, culture, form, type, stateId}) {
  const cultureRoot = culture?.root || culture?.name?.replace("文化", "") || root;
  if (type === "Folk") return `${cultureRoot}${form}`;
  if (type === "Cult") return `${root}${form}`;
  if (type === "Heresy") return `${cultureRoot}${form}`;
  if (stateId && form.endsWith("教")) return `${root}${stateId % 2 ? "正" : "明"}${form}`;
  return `${root}${form}`;
}

function createReligionColor(cultureId, type) {
  const hue = (cultureId * 47 + (type === "Heresy" ? 25 : type === "Cult" ? 320 : type === "Organized" ? 12 : 0)) % 360;
  const saturation = type === "Folk" ? 48 : type === "Cult" ? 54 : type === "Heresy" ? 50 : 58;
  const lightness = type === "Folk" ? 48 : type === "Cult" ? 38 : type === "Heresy" ? 43 : 45;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function isValidReligionCenter(cells, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < cells.i.length && cells.h[cell] >= 20 && (cells.culture?.[cell] || 0) > 0;
}

function pick(values, random) {
  return values[Math.floor(random.next() * values.length)] || values[0];
}

function createNoReligion() {
  return {
    id: 0,
    i: 0,
    name: "No religion",
    type: "None",
    culture: 0,
    center: 0,
    parent: null,
    children: [],
    depth: 0,
    lineage: [],
    origins: [null],
    cells: 0,
    area: 0,
    rural: 0,
    urban: 0
  };
}

function createReligionCode(name, index) {
  const ascii = String(index).padStart(2, "0");
  const initials = Array.from(name).slice(0, 2).join("");
  return `${initials}${ascii}`;
}

function uniqueName(name, usedNames) {
  let candidate = name;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${name}${suffix}`;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

function getDefaultCultureDefinitions(options) {
  if (options.culturesSet === "english") return createGenericCultureDefinitions(10);
  if (options.culturesSet === "antique") return createAntiqueCultureDefinitions();
  if (options.culturesSet === "european") return createEuropeanCultureDefinitions();
  if (options.culturesSet === "world") return createWorldCultureDefinitions();
  return createWorldCultureDefinitions();
}

function selectCultureDefinitions(definitions, count, random) {
  if (count >= definitions.length) return definitions.slice(0, count);
  if (definitions.every(definition => (definition.odd ?? 1) === 1)) return definitions.slice(0, count);

  const available = definitions.slice();
  const selected = [];
  let attempts = 0;
  while (selected.length < count && available.length) {
    const index = Math.floor(random.next() * available.length);
    const definition = available[index];
    attempts++;
    if (attempts < 200 && random.next() >= (definition.odd ?? 1)) continue;
    selected.push(definition);
    available.splice(index, 1);
  }

  return selected;
}

function cultureDefinition(index, sort, odd = 1, nameStyle = null) {
  const root = CULTURE_ROOTS[index % CULTURE_ROOTS.length];
  return {root, sort, odd, nameStyle};
}

function createGenericCultureDefinitions(count, nameStyle = null) {
  return Array.from({length: count}, (_, index) => cultureDefinition(index, null, 1, nameStyle));
}

function createEuropeanCultureDefinitions() {
  return [
    cultureDefinition(0, createCultureSort({temperature: 10, biomes: [6, 8]})),
    cultureDefinition(1, createCultureSort({temperature: 10, seaCoast: true})),
    cultureDefinition(2, createCultureSort({temperature: 12, biomes: [6, 8]})),
    cultureDefinition(3, createCultureSort({temperature: 15})),
    cultureDefinition(4, createCultureSort({temperature: 16})),
    cultureDefinition(5, createCultureSort({temperature: 6, multiplyType: true})),
    cultureDefinition(6, createCultureSort({temperature: 5})),
    cultureDefinition(7, createCultureSort({temperature: 18, multiplyHeight: true})),
    cultureDefinition(8, createCultureSort({temperature: 15, divideType: true}), 0.2),
    cultureDefinition(9, createCultureSort({temperature: 5, biomes: [9], multiplyType: true})),
    cultureDefinition(10, createCultureSort({temperature: 17, seaCoast: true})),
    cultureDefinition(11, createCultureSort({temperature: 11, biomes: [4], multiplyType: true})),
    cultureDefinition(12, createCultureSort({temperature: 14}), 0.05),
    cultureDefinition(13, createCultureSort({temperature: 15, multiplyHeight: true}), 0.05),
    cultureDefinition(14, createCultureSort({temperature: 11, biomes: [6, 8], multiplyType: true}), 0.05)
  ];
}

function createAntiqueCultureDefinitions() {
  return [
    cultureDefinition(0, createCultureSort({temperature: 14, divideType: true}), 1),
    cultureDefinition(1, createCultureSort({temperature: 15, seaCoast: true}), 1),
    cultureDefinition(2, createCultureSort({temperature: 16, seaCoast: true}), 1),
    cultureDefinition(3, createCultureSort({temperature: 17, divideType: true}), 1),
    cultureDefinition(4, createCultureSort({temperature: 18, seaCoast: true, multiplyHeight: true}), 1),
    cultureDefinition(5, createCultureSort({temperature: 19, seaCoast: true, multiplyHeight: true}), 1),
    cultureDefinition(6, createCultureSort({temperature: 12, multiplyHeight: true}), 0.5),
    cultureDefinition(7, createCultureSort({temperature: 11, temperaturePower: 0.5, biomes: [6, 8]}), 1),
    cultureDefinition(8, createCultureSort({temperature: 10, temperaturePower: 0.5, biomes: [6, 8]}), 1),
    cultureDefinition(9, createCultureSort({temperature: 18, multiplyHeight: true}), 0.8),
    cultureDefinition(10, createCultureSort({temperature: 11, temperaturePower: 0.5, biomes: [4]}), 0.5),
    cultureDefinition(11, createCultureSort({temperature: 16, multiplyHeight: true}), 0.5),
    cultureDefinition(12, createCultureSort({temperature: 5, multiplyType: true}), 0.2),
    cultureDefinition(13, createCultureSort({temperature: 20, seaCoast: true}), 0.3),
    cultureDefinition(14, createCultureSort({temperature: 19, multiplySeaCoast: true}), 0.2),
    cultureDefinition(15, createCultureSort({temperature: 22, biomes: [1, 2, 3]}), 0.2)
  ];
}

function createWorldCultureDefinitions() {
  return [
    cultureDefinition(0, createCultureSort({temperature: 10, biomes: [6, 8]}), 0.7),
    cultureDefinition(1, createCultureSort({temperature: 10, seaCoast: true}), 1),
    cultureDefinition(2, createCultureSort({temperature: 12, biomes: [6, 8]}), 0.6),
    cultureDefinition(3, createCultureSort({temperature: 15}), 0.6),
    cultureDefinition(4, createCultureSort({temperature: 16}), 0.6),
    cultureDefinition(5, createCultureSort({temperature: 6, multiplyType: true}), 0.7),
    cultureDefinition(6, createCultureSort({temperature: 5}), 0.7),
    cultureDefinition(7, createCultureSort({temperature: 18, multiplyHeight: true}), 0.7),
    cultureDefinition(8, createCultureSort({temperature: 15}), 0.7),
    cultureDefinition(9, createCultureSort({temperature: 5, biomes: [9], multiplyType: true}), 0.3),
    cultureDefinition(10, createCultureSort({temperature: 12, divideType: true}), 0.1),
    cultureDefinition(11, createCultureSort({temperature: 13}), 0.1),
    cultureDefinition(12, createCultureSort({temperature: 15, divideType: true}), 0.1),
    cultureDefinition(13, createCultureSort({temperature: 17, seaCoast: true}), 0.4),
    cultureDefinition(14, createCultureSort({temperature: 18, biomes: [7], heightScore: true}), 0.1),
    cultureDefinition(15, createCultureSort({temperature: 11, biomes: [4], multiplyType: true}), 0.2),
    cultureDefinition(16, createCultureSort({temperature: 13}), 0.2),
    cultureDefinition(17, createCultureSort({temperature: 19, biomes: [1, 2, 3], biomeFee: 7, multiplyType: true}), 0.1),
    cultureDefinition(18, createCultureSort({temperature: 26, biomes: [1, 2], biomeFee: 7, multiplyType: true}), 0.2),
    cultureDefinition(19, createCultureSort({temperature: -1, biomes: [10, 11], seaCoast: true}), 0.05),
    cultureDefinition(20, createCultureSort({temperature: 15, multiplyHeight: true}), 0.05),
    cultureDefinition(21, createCultureSort({temperature: 15, biomes: [5, 7]}), 0.05),
    cultureDefinition(22, createCultureSort({temperature: 11, biomes: [6, 8], multiplyType: true}), 0.05),
    cultureDefinition(23, createCultureSort({temperature: 22, multiplyType: true}), 0.05),
    cultureDefinition(24, createCultureSort({temperature: 18, multiplyHeight: true}), 0.1),
    cultureDefinition(25, createCultureSort({temperature: 24, seaCoast: true, divideType: true}), 0.05),
    cultureDefinition(26, createCultureSort({temperature: 26}), 0.05),
    cultureDefinition(27, createCultureSort({temperature: 13, heightScore: true}), 0.05),
    cultureDefinition(28, createCultureSort({temperature: 18, biomes: [5, 7, 8]}), 0.05),
    cultureDefinition(29, createCultureSort({temperature: 21, biomes: [5, 7], multiplyType: true}), 0.05),
    cultureDefinition(30, createCultureSort({temperature: 17}), 0.05),
    cultureDefinition(31, createCultureSort({temperature: 8, multiplyType: true}), 0.05)
  ];
}

function createCultureContext(grid, pack, populated) {
  const {cells} = pack;
  const maxSuitability = populated.reduce((max, cell) => Math.max(max, cells.s[cell] || 0), 1);
  return {
    grid,
    pack,
    maxSuitability,
    normalized(cell) {
      return Math.max(1, Math.ceil(((cells.s[cell] || 0) / maxSuitability) * 3));
    },
    temperatureDifference(cell, goal) {
      const difference = Math.abs((grid.cells.temp?.[cells.g[cell]] || 0) - goal);
      return difference ? difference + 1 : 1;
    },
    biomeDifference(cell, biomes, fee = 4) {
      return biomes.includes(cells.biome[cell]) ? 1 : fee;
    },
    seaCoastFactor(cell, fee = 4) {
      const haven = cells.haven?.[cell];
      const feature = Number.isInteger(haven) ? pack.features?.[cells.f?.[haven]] : null;
      return haven && feature?.type !== "lake" ? 1 : fee;
    }
  };
}

function createCultureSort({
  temperature,
  temperaturePower = 1,
  biomes,
  biomeFee = 4,
  seaCoast = false,
  multiplySeaCoast = false,
  multiplyType = false,
  divideType = false,
  multiplyHeight = false,
  heightScore = false
}) {
  return (cell, context) => {
    let score = heightScore ? context.pack.cells.h[cell] : context.normalized(cell);
    if (temperature !== undefined) score /= context.temperatureDifference(cell, temperature) ** temperaturePower;
    if (biomes) score /= context.biomeDifference(cell, biomes, biomeFee);
    if (seaCoast) score /= context.seaCoastFactor(cell);
    if (multiplySeaCoast) score *= context.seaCoastFactor(cell);
    if (multiplyType) score *= context.pack.cells.t[cell];
    if (divideType) score /= Math.max(1, context.pack.cells.t[cell]);
    if (multiplyHeight) score *= Math.max(1, context.pack.cells.h[cell]);
    return score;
  };
}

function rankCultureCandidates(populated, context, sort, scores) {
  const ranked = populated.slice();
  for (const cell of populated) scores[cell] = sort(cell, context);
  ranked.sort((a, b) => scores[b] - scores[a] || a - b);
  return ranked;
}

function createCellMask(length, cells) {
  const mask = new Uint8Array(length);
  for (const cell of cells) mask[cell] = 1;
  return mask;
}

function placeCultureCenter({cells, ranked, centers, spacing, random, cultureIds}) {
  const maxIndex = Math.max(0, Math.floor(ranked.length / 2));
  let currentSpacing = spacing;

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = ranked[biasedIndex(random, maxIndex, 5)];
    currentSpacing *= 0.9;
    if (candidate === undefined || cultureIds[candidate]) continue;
    const tooClose = centers.some(center => distance(cells.p[candidate], center.point) < currentSpacing);
    if (!tooClose) return candidate;
  }

  return ranked.find(cell => !cultureIds[cell] && !centers.some(center => center.cell === cell)) ?? -1;
}

function defineCultureType(pack, cell, random) {
  const {cells, features} = pack;
  const biome = cells.biome[cell];

  if (cells.h[cell] < 70 && [1, 2, 4].includes(biome)) return CULTURE_TYPES.nomadic;
  if (cells.h[cell] > 50) return CULTURE_TYPES.highland;

  const haven = cells.haven?.[cell];
  const havenFeature = Number.isInteger(haven) ? features?.[cells.f?.[haven]] : null;
  const cellFeature = features?.[cells.f?.[cell]];

  if (havenFeature?.type === "lake" && havenFeature.cells > 5) return CULTURE_TYPES.lake;
  if (
    (cells.harbor[cell] && havenFeature?.type !== "lake" && random.next() < 0.1) ||
    (cells.harbor[cell] === 1 && random.next() < 0.6) ||
    (cellFeature?.group === "isle" && random.next() < 0.4)
  ) {
    return CULTURE_TYPES.naval;
  }
  if (cells.r[cell] && cells.fl[cell] > 100) return CULTURE_TYPES.river;
  if (cells.t[cell] > 2 && [3, 7, 8, 9, 10, 12].includes(biome)) return CULTURE_TYPES.hunting;
  return CULTURE_TYPES.generic;
}

function defineExpansionism(type, random, sizeVariety = 4) {
  let base = 1;
  if (type === CULTURE_TYPES.lake) base = 0.8;
  else if (type === CULTURE_TYPES.naval) base = 1.5;
  else if (type === CULTURE_TYPES.river) base = 0.9;
  else if (type === CULTURE_TYPES.nomadic) base = 1.5;
  else if (type === CULTURE_TYPES.hunting) base = 0.7;
  else if (type === CULTURE_TYPES.highland) base = 1.2;
  return round(((random.next() * sizeVariety) / 2 + 1) * base, 1);
}

function expandPackCultures(pack, cultures, centers, cultureIds, populatedMask) {
  const {cells} = pack;
  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new MinPriorityQueue();
  const maxExpansionCost = cells.i.length * 0.6;

  for (const center of centers) {
    costs[center.cell] = 0;
    cultureIds[center.cell] = center.cultureId;
    queue.push({cell: center.cell, cultureId: center.cultureId, priority: 0}, 0);
  }

  while (queue.length) {
    const {cell, cultureId, priority} = queue.pop();
    if (priority !== costs[cell]) continue;

    for (const neighbor of cells.c[cell] || []) {
      const step = packCultureStepCost(pack, cultures[cultureId], cell, neighbor);
      const total = priority + step;
      if (!Number.isFinite(total) || total > maxExpansionCost || total >= costs[neighbor]) continue;

      costs[neighbor] = total;
      if (populatedMask[neighbor]) cultureIds[neighbor] = cultureId;
      queue.push({cell: neighbor, cultureId, priority: total}, total);
    }
  }
}

function shouldFillUnassignedPopulatedCultures(options = {}, pack) {
  return !(options.heightmapTemplate === "archipelago" && options.cellsTarget <= 10000 && (pack?.cells?.i?.length || 0) < 3500);
}

function fillUnassignedPopulatedCultures(pack, cultures, centers, cultureIds, populatedMask) {
  const {cells} = pack;
  if (!hasUnassignedPopulatedCulture(cultureIds, populatedMask)) return;

  const costs = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new MinPriorityQueue();
  const maxCompletionCost = cells.i.length * 0.9;

  for (const center of centers) {
    costs[center.cell] = 0;
    queue.push({cell: center.cell, cultureId: center.cultureId, priority: 0}, 0);
  }

  while (queue.length) {
    const {cell, cultureId, priority} = queue.pop();
    if (priority !== costs[cell]) continue;

    if (!cultureIds[cell] && populatedMask[cell]) cultureIds[cell] = cultureId;

    for (const neighbor of cells.c[cell] || []) {
      const step = packCultureStepCost(pack, cultures[cultureId], cell, neighbor);
      const total = priority + step;
      if (!Number.isFinite(total) || total > maxCompletionCost || total >= costs[neighbor]) continue;

      costs[neighbor] = total;
      queue.push({cell: neighbor, cultureId, priority: total}, total);
    }
  }
}

function hasUnassignedPopulatedCulture(cultureIds, populatedMask) {
  for (let cell = 0; cell < populatedMask.length; cell++) {
    if (populatedMask[cell] && !cultureIds[cell]) return true;
  }
  return false;
}

function packCultureStepCost(pack, culture, from, to) {
  const {cells} = pack;
  const type = culture.type || CULTURE_TYPES.generic;
  const biome = cells.biome[to];
  const biomeCost = getBiomeCost(cells, culture.center, biome, type);
  // Source currently compares the target biome to itself, so culture growth has no biome-transition surcharge.
  const biomeChangeCost = 0;
  const heightCost = getHeightCost(pack, to, cells.h[to], type);
  const riverCost = getRiverCost(cells.r[to], cells.fl[to], type);
  const typeCost = getTypeCost(cells.t[to], type);
  return (biomeCost + biomeChangeCost + heightCost + riverCost + typeCost) / Math.max(0.1, culture.expansionism || 1);
}

function getBiomeCost(cells, center, biome, type) {
  if (cells.biome[center] === biome) return 10;
  const cost = BIOME_COST[biome] ?? 50;
  if (type === CULTURE_TYPES.hunting) return cost * 5;
  if (type === CULTURE_TYPES.nomadic && biome > 4 && biome < 10) return cost * 10;
  return cost * 2;
}

function getHeightCost(pack, cell, height, type) {
  const {cells, features} = pack;
  const feature = features?.[cells.f?.[cell]];
  const area = cells.area[cell] || 1;

  if (type === CULTURE_TYPES.lake && feature?.type === "lake") return 10;
  if (type === CULTURE_TYPES.naval && height < 20) return area * 2;
  if (type === CULTURE_TYPES.nomadic && height < 20) return area * 50;
  if (height < 20) return area * 6;
  if (type === CULTURE_TYPES.highland && height < 44) return 3000;
  if (type === CULTURE_TYPES.highland && height < 62) return 200;
  if (type === CULTURE_TYPES.highland) return 0;
  if (height >= 67) return 200;
  if (height >= 44) return 30;
  return 0;
}

function getRiverCost(riverId, flux, type) {
  if (type === CULTURE_TYPES.river) return riverId ? 0 : 100;
  if (!riverId) return 0;
  return clamp((flux || 0) / 10, 20, 100);
}

function getTypeCost(distanceFromCoast, type) {
  if (distanceFromCoast === 1) return type === CULTURE_TYPES.naval || type === CULTURE_TYPES.lake ? 0 : type === CULTURE_TYPES.nomadic ? 60 : 20;
  if (distanceFromCoast === 2) return type === CULTURE_TYPES.naval || type === CULTURE_TYPES.nomadic ? 30 : 0;
  if (distanceFromCoast !== -1) return type === CULTURE_TYPES.naval || type === CULTURE_TYPES.lake ? 100 : 0;
  return 0;
}

function summarizeCultureCoverage(pack, cultures) {
  const {cells} = pack;
  for (const cell of cells.i) {
    const culture = cultures[cells.culture[cell]];
    if (!culture) continue;
    culture.cells = (culture.cells || 0) + 1;
    culture.area = round((culture.area || 0) + (cells.area[cell] || 0), 2);
    culture.rural = round((culture.rural || 0) + (cells.pop[cell] || 0), 2);
  }
}

function mirrorPackCultureToGrid(grid, pack) {
  const values = new Array(grid.points.length).fill(0);
  const bestScore = new Float32Array(grid.points.length).fill(-1);

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    const score = pack.cells.pop?.[packCell] || pack.cells.s?.[packCell] || 0;
    if (score < bestScore[gridCell]) continue;
    values[gridCell] = pack.cells.culture[packCell] || 0;
    bestScore[gridCell] = score;
  }

  grid.cells.culture = values;
  return countPositive(values);
}

function mirrorGridFieldToPack(grid, pack, field, fallback) {
  pack.cells[field] = Array.from(pack.cells.i, packCell => grid.cells[field]?.[pack.cells.g[packCell]] ?? fallback);
}

function getGridReligionCells(grid, features) {
  const cells = grid.points
    .map((point, cell) => ({cell, height: grid.cells.h[cell], biome: grid.cells.biome[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell) && (grid.cells.pop?.[item.cell] || 0) > 0);
  if (cells.length) return cells;
  return grid.points
    .map((point, cell) => ({cell, height: grid.cells.h[cell], biome: grid.cells.biome[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell));
}

function pickGridCenters(landCells, random, limit, grid) {
  const candidates = landCells
    .map(item => ({
      ...item,
      score: (grid.cells.pop?.[item.cell] || 0) + item.height + (grid.cells.prec[item.cell] || 0) * 0.35 + random.range(0, 18)
    }))
    .sort((a, b) => b.score - a.score);
  const centers = [];
  const minDistance = Math.min(grid.metadata.graphWidth, grid.metadata.graphHeight) / 5;

  for (const candidate of candidates) {
    if (centers.length >= limit) break;
    const point = grid.points[candidate.cell];
    const tooClose = centers.some(center => distance(point, grid.points[center.cell]) < minDistance);
    if (!tooClose) centers.push(candidate);
  }

  return centers.length ? centers : candidates.slice(0, limit);
}

function expandGridCenters(grid, features, centers, costFn) {
  const values = new Array(grid.points.length).fill(0);
  if (!centers.length) return values;

  const costs = new Float64Array(grid.points.length).fill(Infinity);
  const queue = new MinPriorityQueue();

  centers.forEach((center, owner) => {
    values[center.cell] = owner;
    costs[center.cell] = 0;
    queue.push({cell: center.cell, owner, cost: 0}, 0);
  });

  while (queue.length) {
    const {cell, owner, cost} = queue.pop();
    if (cost !== costs[cell] || owner !== values[cell]) continue;
    if (!isLandFeature(features, grid, cell)) continue;

    for (const neighbor of getGridNeighbors(grid, cell)) {
      if (!isLandFeature(features, grid, neighbor)) continue;
      const nextCost = costs[cell] + costFn(cell, neighbor, owner);
      if (nextCost >= costs[neighbor]) continue;
      costs[neighbor] = nextCost;
      values[neighbor] = owner;
      queue.push({cell: neighbor, owner, cost: nextCost}, nextCost);
    }
  }

  return values;
}

function cultureGridCost(grid, riverCells, from, to, center) {
  const length = distance(grid.points[from], grid.points[to]);
  const height = grid.cells.h[to];
  const slope = Math.abs(height - grid.cells.h[from]);
  const centerBiome = grid.cells.biome[center];
  const biomeCost = grid.cells.biome[to] === centerBiome ? 2 : 22;
  const heightCost = height > 66 ? (height - 66) * 2.8 : height > 50 ? (height - 50) * 0.8 : 0;
  const riverCost = riverCells.has(to) && !riverCells.has(from) ? 18 : 0;
  return length + biomeCost + heightCost + slope * 2.5 + riverCost;
}

function religionCost(grid, riverCells, from, to, center) {
  const base = cultureGridCost(grid, riverCells, from, to, center);
  const climateDrift = Math.abs((grid.cells.prec[to] || 0) - (grid.cells.prec[center] || 0)) * 0.28;
  return base * 0.82 + climateDrift;
}

function isPopulatedPackCell(cells, cell) {
  return cells.h[cell] >= 20 && (cells.s?.[cell] || 0) > 0 && (cells.pop?.[cell] || 0) > 0;
}

function createWildlandsCulture() {
  return {
    id: 0,
    i: 0,
    name: "荒野",
    root: "荒野",
    type: "Wildlands",
    expansionism: 0,
    parent: null,
    children: [],
    depth: 0,
    lineage: [],
    origins: [null],
    cells: 0,
    area: 0,
    rural: 0
  };
}

function getGridNeighbors(grid, cell) {
  const sharedEdgeNeighbors = grid.cells.c?.[cell];
  if (sharedEdgeNeighbors?.length) return sharedEdgeNeighbors;
  return [];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function biasedIndex(random, max, exponent) {
  return Math.min(max, Math.round(random.next() ** exponent * max));
}

function countPositive(values = []) {
  let count = 0;
  for (const value of values) if (value > 0) count++;
  return count;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isLandFeature(features, grid, cell) {
  return Boolean(features.features[grid.cells.f[cell]]?.land);
}
