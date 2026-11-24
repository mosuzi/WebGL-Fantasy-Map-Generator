// 保持原先的遍历顺序和逐格舍入，使后台结果与立即撤销、重做采用同一统计口径。
export function socialCoverageInput(map, field) {
  const cells = map.pack?.cells || {};
  return {
    owners: cells[field] || [], grid: map.grid?.cells?.[field] || [], area: cells.area, pop: cells.pop, h: cells.h, s: cells.s,
    burgs: (map.pack?.burgs || []).filter(burg => burg?.i && !burg.removed).map(burg => [burg.cell, burg.population])
  };
}
export function summarizeSocialCoverage(input) {
  const rows = new Map();
  const row = id => {
    if (!rows.has(id)) rows.set(id, {cells: 0, area: 0, rural: 0, urban: 0, best: -1});
    return rows.get(id);
  };
  const add = (a, b) => Math.round((a + (Number(b) || 0)) * 100) / 100;
  let packCount = 0, gridCount = 0;
  for (let cell = 0; cell < input.owners.length; cell++) {
    const id = Number(input.owners[cell]) || 0;
    if (id <= 0) continue;
    packCount++;
    const item = row(id);
    item.cells++;
    item.area = add(item.area, input.area?.[cell]);
    item.rural = add(item.rural, input.pop?.[cell]);
    if (Number(input.h?.[cell]) < 20) continue;
    const best = item.best;
    const population = (Number(input.pop?.[cell]) || 0) - (Number(input.pop?.[best]) || 0);
    if (best < 0 || population > 0 || (population === 0 && (Number(input.s?.[cell]) || 0) > (Number(input.s?.[best]) || 0))) item.best = cell;
  }
  // 历史存档中零号条目的城镇人口在原值上逐城舍入。
  const neutralBurgs = [];
  for (const [cell, population] of input.burgs) {
    const id = Number(input.owners[cell]) || 0;
    if (id === 0) neutralBurgs.push(population);
    else row(id).urban = add(row(id).urban, population);
  }
  for (const id of input.grid) if (Number(id) > 0) gridCount++;
  return {rows, neutralBurgs, packCount, gridCount};
}
