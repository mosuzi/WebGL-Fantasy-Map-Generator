// 发展量使用当前已生成结果；人口潜力和军队不参与，避免重复兑现潜力或生成反馈循环。
export function cityPowerContribution(burg, connections = 0) {
  const facility = (burg.capital ? .25 : 0) + (burg.plaza ? .25 : 0) + (burg.citadel ? .30 : 0)
    + (burg.walls ? .15 : 0) + (burg.port ? .20 : 0) + (burg.temple ? .10 : 0);
  const transport = (connections & 1 ? .25 : 0) + (connections & 2 ? .10 : 0) + (burg.port && connections & 4 ? .20 : 0);
  return 1 + Math.min(1.5, .15 * Math.log1p(nonnegative(burg.population)))
    + Math.min(2, .20 * Math.log1p(nonnegative(burg.product)))
    + Math.min(1, .10 * Math.log1p(nonnegative(burg.treasury))) + facility + transport;
}

export function collectCityPower(pack) {
  const byCell = new Map(), seen = new Set(), burgs = [];
  for (const burg of pack?.burgs || []) {
    if (!burg || burg.removed || !Number.isInteger(burg.i) || burg.i <= 0 || seen.has(burg.i)) continue;
    seen.add(burg.i);
    burgs.push(burg);
    if (Number.isInteger(burg.cell) && burg.cell >= 0) byCell.set(burg.cell, 0);
  }
  for (const route of pack?.routes || []) {
    if (!route || route.removed) continue;
    const kind = route.group || route.type;
    const bit = kind === "roads" || kind === "road" ? 1 : kind === "trails" || kind === "trail" ? 2 : kind === "searoutes" || kind === "searoute" ? 4 : 0;
    if (!bit) continue;
    const cells = route.packCells || (route.points || []).map(point => point?.[2]);
    for (const cell of cells) if (byCell.has(cell)) byCell.set(cell, byCell.get(cell) | bit);
  }
  const states = new Map(), provinces = new Map();
  for (const burg of burgs) {
    const weight = cityPowerContribution(burg, byCell.get(burg.cell) || 0);
    add(states, burg.state ?? pack.cells?.state?.[burg.cell], weight);
    add(provinces, burg.province ?? pack.cells?.province?.[burg.cell], weight);
  }
  return {states, provinces};
}

function add(groups, value, weight) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return;
  const group = groups.get(id) || {count: 0, weight: 0};
  group.count++;
  group.weight += weight;
  groups.set(id, group);
}
function nonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
