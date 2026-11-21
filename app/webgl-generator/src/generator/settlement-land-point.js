import {locateGridPoint, pointInGridCell} from "../geometry/grid-point.js";

export function settlementLandPoint(grid, owner, point) {
  const center = grid?.points?.[owner];
  if (!center || !(grid.cells.h?.[owner] >= 20) || !grid.metadata || !grid.vertices?.p || !point?.every(Number.isFinite)) return point;
  if (pointInGridCell(grid, owner, ...point)) return point;
  const {cell} = locateGridPoint(grid, ...point);
  if (cell === null || !(grid.cells.h[cell] < 20)) return point;
  // pack 的海岸偏移可能跨过真正绘制的 grid 岸线。保留合法的手动落点，只纠正水格。
  if (pointInGridCell(grid, owner, ...center)) return [...center];
  const ring = grid.cells.v?.[owner];
  if (!ring?.length) return point;
  const middle = [0, 0];
  for (const vertex of ring) {
    const xy = grid.vertices.p[vertex];
    if (!xy) return point;
    middle[0] += xy[0] / ring.length;
    middle[1] += xy[1] / ring.length;
  }
  return pointInGridCell(grid, owner, ...middle) ? middle : point;
}

// 旧档可能分别保存各份镜像。按原位置及身份识别随城市移动的点，保留手调路线。
export function repairSettlementLandPoints(map) {
  const moves = new Map();
  const cities = map.settlements?.cities;
  if (!cities?.length) return map;
  const repairedCities = cities.map(city => {
    if (!city || city.removed) return city;
    const before = [city.x, city.y];
    const after = settlementLandPoint(map.grid, city.cell, before);
    if (before === after) return city;
    moves.set(city.burgId, {before, after, packCell: city.packCell});
    return movedRecord(city, before, after);
  });
  if (!moves.size) return map;
  const byCell = new Map();
  for (const move of moves.values()) {
    if (!byCell.has(move.packCell)) byCell.set(move.packCell, []);
    byCell.get(move.packCell).push(move);
  }
  const repairBurgs = burgs => burgs.map(burg => {
    const move = burg && moves.get(burg.i ?? burg.id);
    return move ? movedRecord(burg, move.before, move.after) : burg;
  });
  const repairRoutes = routes => routes.map(route => {
    if (!route?.points) return route;
    let updated;
    route.points.forEach((point, i) => {
      if (!point) return;
      const packCell = route.packCells?.[i] ?? point[2];
      const move = byCell.get(packCell)?.find(({before}) => point[0] === before[0] && point[1] === before[1]);
      if (!move) return;
      updated ??= route.points.slice();
      updated[i] = [...move.after, ...point.slice(2)];
    });
    return updated ? {...route, points: updated} : route;
  });
  const repairMarkets = markets => markets.map(market => {
    const move = market && moves.get(market.centerBurgId);
    return move ? {...market, x: move.after[0], y: move.after[1]} : market;
  });
  const economyMarkets = map.economy?.markets;
  const markets = economyMarkets && repairMarkets(economyMarkets);
  const repairStore = store => ({
    ...store,
    ...(store.burgs && {burgs: repairBurgs(store.burgs)}),
    ...(store.routes && {routes: repairRoutes(store.routes)})
  });
  return {
    ...map,
    settlements: {...repairStore(map.settlements), cities: repairedCities},
    ...(map.economy && markets && {economy: {...map.economy, markets}}),
    ...(map.pack && {pack: {...repairStore(map.pack), ...(map.pack.markets && {
      markets: map.pack.markets === economyMarkets ? markets : repairMarkets(map.pack.markets)
    })}}),
    ...(map.routes?.routes && {routes: repairStore(map.routes)})
  };
}

function movedRecord(record, before, [x, y]) {
  const coa = record.coa;
  return {...record, x, y, ...(coa?.x === before[0] && coa?.y === before[1] && {coa: {...coa, x, y}})};
}
