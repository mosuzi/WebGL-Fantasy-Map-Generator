const REGION_OPERATIONS = new Set(["union", "intersection", "difference"]);

export function defineAnalysisRegion(map, specification = {}) {
  assertMap(map);
  const cells = resolveRegionCells(map, specification);
  return {
    specification: normalizeRegionSpec(specification),
    space: "pack",
    cells,
    count: cells.length,
    checksum: map.metadata?.checksum || map.summary?.checksum || ""
  };
}

export function describeAnalysisRegion(map, specification = {}, options = {}) {
  const region = defineAnalysisRegion(map, specification);
  const records = region.cells.map(id => buildCellRecord(map, id));
  return {
    region,
    metrics: summarizeRecords(records),
    evidence: selectEvidence(records, Number(options.evidenceLimit) || 12)
  };
}

export function compareAnalysisRegions(map, left, right, options = {}) {
  const leftDescription = describeAnalysisRegion(map, left, options);
  const rightDescription = describeAnalysisRegion(map, right, options);
  return {
    left: leftDescription,
    right: rightDescription,
    delta: metricDelta(leftDescription.metrics, rightDescription.metrics),
    interpretation: buildComparisonInterpretation(leftDescription.metrics, rightDescription.metrics)
  };
}

export function explainRegionPrecipitation(map, specification = {}, options = {}) {
  const description = describeAnalysisRegion(map, specification, options);
  const records = description.region.cells.map(id => buildCellRecord(map, id));
  const dry = records.filter(record => Number.isFinite(record.precipitation)).sort((a, b) => a.precipitation - b.precipitation);
  const barriers = records.filter(record => record.height >= 50 || record.slope >= 15).sort((a, b) => (b.height + b.slope) - (a.height + a.slope));
  return {
    ...description,
    diagnosis: {
      code: dry.length ? "precipitation-profile-ready" : "precipitation-data-missing",
      dryCells: dry.slice(0, 12).map(evidenceCell),
      barrierCells: barriers.slice(0, 12).map(evidenceCell),
      note: "该结果识别降水低值与潜在地形屏障的空间共现；风向和迎风 / 背风因果需结合 climate.atmosphere 与相邻区域比较确认。"
    }
  };
}

export function diagnoseRegionPopulation(map, specification = {}, options = {}) {
  const description = describeAnalysisRegion(map, specification, options);
  const records = description.region.cells.map(id => buildCellRecord(map, id));
  const candidates = records
    .map(record => ({...record, capacityScore: populationCapacityScore(record)}))
    .sort((a, b) => b.capacityScore - a.capacityScore);
  return {
    ...description,
    diagnosis: {
      code: candidates.length ? "population-capacity-ready" : "empty-region",
      candidateCells: candidates.slice(0, 16).map(record => ({...evidenceCell(record), capacityScore: record.capacityScore})),
      limitingFactors: populationLimitingFactors(description.metrics),
      note: "capacityScore 是只读比较指标，不等同于人口写入值；实际修改仍需人口规则事务、道路与城市约束预检。"
    }
  };
}

export function compareRegionPower(map, left, right, options = {}) {
  const comparison = compareAnalysisRegions(map, left, right, options);
  const leftPower = powerScore(comparison.left.metrics);
  const rightPower = powerScore(comparison.right.metrics);
  return {
    ...comparison,
    power: {
      left: leftPower,
      right: rightPower,
      ratio: rightPower === 0 ? null : leftPower / rightPower,
      components: ["population.total", "population.urban", "cities", "routes", "suitability.mean"],
      note: "这是用于方案比较的透明代理指标，不替代军事、经济、外交等领域的正式规则结果。"
    }
  };
}

export function diagnoseRegionTerrain(map, specification = {}, options = {}) {
  const description = describeAnalysisRegion(map, specification, options);
  const records = description.region.cells.map(id => buildCellRecord(map, id));
  const rough = records.filter(record => Number.isFinite(record.roughness)).sort((a, b) => b.roughness - a.roughness);
  const abrupt = records.filter(record => record.slope >= 15).sort((a, b) => b.slope - a.slope);
  return {
    ...description,
    diagnosis: {
      code: records.length ? "terrain-gradient-ready" : "empty-region",
      roughCells: rough.slice(0, 16).map(evidenceCell),
      abruptCells: abrupt.slice(0, 16).map(evidenceCell),
      suggestedTargets: {
        preserveSeaLevel: 20,
        preserveRelativeRelief: true,
        slopeP90AtMost: Math.max(8, round((description.metrics.slope.p90 || 0) * 0.75)),
        roughnessP90AtMost: Math.max(5, round((description.metrics.roughness.p90 || 0) * 0.7))
      },
      note: "建议目标只描述验收口径；高度平滑写入必须另走可撤销事务并重新构建水文等派生系统。"
    }
  };
}

function resolveRegionCells(map, spec) {
  const normalized = normalizeRegionSpec(spec);
  if (normalized.operation) {
    const groups = normalized.regions.map(region => new Set(resolveRegionCells(map, region)));
    if (normalized.operation === "union") return sortedUnique(groups.flatMap(group => [...group]));
    if (!groups.length) return [];
    if (normalized.operation === "intersection") return [...groups[0]].filter(id => groups.slice(1).every(group => group.has(id))).sort(numberSort);
    return [...groups[0]].filter(id => groups.slice(1).every(group => !group.has(id))).sort(numberSort);
  }
  if (normalized.cells) return validPackCells(map, normalized.cells);
  if (normalized.kind === "state") return cellsMatching(map, "state", normalized.id);
  if (normalized.kind === "province") return cellsMatching(map, "province", normalized.id);
  if (normalized.kind === "zone") return validPackCells(map, findById(map.zones?.zones, normalized.id)?.cells || []);
  if (normalized.kind === "all-land") return cellIndexes(map).filter(id => Number(map.pack.cells.h?.[id]) >= 20);
  throw codedError("invalid_region", "区域必须提供 cells、state / province / zone 引用、all-land 或集合运算");
}

function normalizeRegionSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw codedError("invalid_region", "区域定义必须是对象");
  if (spec.operation) {
    const operation = String(spec.operation);
    if (!REGION_OPERATIONS.has(operation)) throw codedError("invalid_region_operation", `未知区域运算：${operation}`);
    if (!Array.isArray(spec.regions) || !spec.regions.length) throw codedError("invalid_region", "区域运算至少需要一个 regions 项");
    return {operation, regions: spec.regions.map(normalizeRegionSpec)};
  }
  if (Array.isArray(spec.cells)) return {cells: sortedUnique(spec.cells.map(Number))};
  const kind = String(spec.kind || "");
  if (kind === "all-land") return {kind};
  return {kind, id: Number(spec.id)};
}

function buildCellRecord(map, id) {
  const cells = map.pack.cells;
  const gridId = Number(cells.g?.[id] ?? id);
  const height = numeric(cells.h?.[id] ?? map.grid?.cells?.h?.[gridId]);
  const neighbors = Array.from(cells.c?.[id] || []).filter(Number.isInteger);
  const neighborHeights = neighbors.map(cell => numeric(cells.h?.[cell] ?? map.grid?.cells?.h?.[Number(cells.g?.[cell] ?? cell)])).filter(Number.isFinite);
  const differences = neighborHeights.map(value => Math.abs(value - height));
  const burgId = Number(cells.burg?.[id] || 0);
  const burg = findById(map.settlements?.burgs, burgId);
  return {
    id,
    gridId,
    height,
    precipitation: numeric(map.grid?.cells?.prec?.[gridId] ?? map.grid?.cells?.precipitation?.[gridId]),
    temperature: numeric(map.grid?.cells?.temp?.[gridId] ?? map.grid?.cells?.temperature?.[gridId]),
    ruralPopulation: numeric(cells.pop?.[id], 0),
    urbanPopulation: numeric(burg?.population ?? burg?.pop, 0),
    suitability: numeric(cells.s?.[id] ?? cells.suitability?.[id]),
    slope: differences.length ? Math.max(...differences) : 0,
    roughness: differences.length ? average(differences) : 0,
    stateId: Number(cells.state?.[id] || 0),
    provinceId: Number(cells.province?.[id] || 0),
    burgId,
    route: Boolean(cells.routes?.[id]?.length || cells.road?.[id])
  };
}

function summarizeRecords(records) {
  const urban = records.map(record => record.urbanPopulation);
  const rural = records.map(record => record.ruralPopulation);
  return {
    cells: records.length,
    height: summary(records.map(record => record.height)),
    precipitation: summary(records.map(record => record.precipitation)),
    temperature: summary(records.map(record => record.temperature)),
    suitability: summary(records.map(record => record.suitability)),
    slope: summary(records.map(record => record.slope)),
    roughness: summary(records.map(record => record.roughness)),
    population: {rural: sum(rural), urban: sum(urban), total: sum(rural) + sum(urban)},
    cities: records.filter(record => record.burgId > 0).length,
    routes: records.filter(record => record.route).length,
    states: [...new Set(records.map(record => record.stateId).filter(Boolean))],
    provinces: [...new Set(records.map(record => record.provinceId).filter(Boolean))]
  };
}

function summary(source) {
  const values = source.filter(Number.isFinite).sort(numberSort);
  if (!values.length) return {count: 0, min: null, max: null, mean: null, p10: null, p50: null, p90: null};
  return {count: values.length, min: values[0], max: values.at(-1), mean: round(average(values)), p10: percentile(values, 0.1), p50: percentile(values, 0.5), p90: percentile(values, 0.9)};
}

function selectEvidence(records, limit) {
  return records.slice().sort((a, b) => (b.ruralPopulation + b.urbanPopulation + b.slope) - (a.ruralPopulation + a.urbanPopulation + a.slope)).slice(0, Math.max(1, Math.min(50, limit))).map(evidenceCell);
}

function evidenceCell(record) {
  return {id: record.id, gridId: record.gridId, height: record.height, precipitation: record.precipitation, population: record.ruralPopulation + record.urbanPopulation, suitability: record.suitability, slope: round(record.slope), roughness: round(record.roughness), stateId: record.stateId, provinceId: record.provinceId, burgId: record.burgId, route: record.route};
}

function metricDelta(left, right) {
  return {
    cells: left.cells - right.cells,
    precipitationMean: round((left.precipitation.mean || 0) - (right.precipitation.mean || 0)),
    heightMean: round((left.height.mean || 0) - (right.height.mean || 0)),
    suitabilityMean: round((left.suitability.mean || 0) - (right.suitability.mean || 0)),
    populationTotal: left.population.total - right.population.total,
    cities: left.cities - right.cities,
    routes: left.routes - right.routes
  };
}

function buildComparisonInterpretation(left, right) {
  return {
    wetter: compareLabel(left.precipitation.mean, right.precipitation.mean),
    morePopulous: compareLabel(left.population.total, right.population.total),
    moreSuitable: compareLabel(left.suitability.mean, right.suitability.mean),
    rougher: compareLabel(left.roughness.mean, right.roughness.mean)
  };
}

function populationCapacityScore(record) {
  return round((record.suitability || 0) * 2 + (record.precipitation || 0) - Math.max(0, record.slope - 8) * 2 + (record.route ? 20 : 0) + (record.burgId ? 15 : 0));
}

function populationLimitingFactors(metrics) {
  const factors = [];
  if ((metrics.precipitation.mean || 0) < 20) factors.push("low-precipitation");
  if ((metrics.suitability.mean || 0) <= 0) factors.push("low-suitability");
  if ((metrics.slope.p90 || 0) >= 15) factors.push("steep-terrain");
  if (!metrics.routes) factors.push("no-route-access");
  if (!metrics.cities) factors.push("no-urban-anchor");
  return factors;
}

function powerScore(metrics) {
  return round(metrics.population.total + metrics.population.urban * 0.5 + metrics.cities * 100 + metrics.routes * 20 + Math.max(0, metrics.suitability.mean || 0) * metrics.cells);
}

function cellsMatching(map, field, id) {
  if (!Number.isInteger(id) || id < 0) throw codedError("invalid_region_id", "区域对象 id 必须是非负整数");
  return cellIndexes(map).filter(cell => Number(map.pack.cells[field]?.[cell]) === id);
}

function validPackCells(map, cells) {
  const limit = cellIndexes(map).length;
  return sortedUnique(cells.map(Number).filter(id => Number.isInteger(id) && id >= 0 && id < limit));
}

function cellIndexes(map) {
  const source = map.pack?.cells?.i;
  return source ? Array.from(source, Number) : Array.from({length: Number(map.pack?.cells?.h?.length) || 0}, (_, id) => id);
}

function findById(source, id) {
  return (source || []).find(item => item && Number(item.i ?? item.id) === Number(id)) || null;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(numberSort);
}

function sum(values) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function average(values) {
  return values.length ? sum(values) / values.length : 0;
}

function percentile(values, ratio) {
  return values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * ratio)))];
}

function compareLabel(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return "balanced";
  return left > right ? "left" : "right";
}

function numeric(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function numberSort(left, right) {
  return left - right;
}

function assertMap(map) {
  if (!map?.pack?.cells) throw codedError("map_not_ready", "地图缺少 pack cells 数据");
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
