import {MinPriorityQueue} from "../generator/priority-queue.js";
import {isSettlementWaterRoutePathValid} from "../generator/settlements.js";

const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const pointValid = p => p?.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
export async function diagnoseTradePath(map, dealId, isCurrent = () => true) {
  const pack = map?.pack, cells = pack?.cells;
  const deal = pack?.deals?.find(item => item && String(item.i ?? item.id) === String(dealId));
  const unknown = message => ({status: "unknown", message});
  if (!deal || !cells?.p || !cells?.h || !cells?.c) return unknown("交易或道路格资料不足，无法判断。");
  const party = (type, id) => {
    if (type === "market") {
      const market = pack.markets?.find(item => item && !item.removed && Number(item.i ?? item.id) === Number(id));
      return market ? pack.burgs?.[market.centerBurgId] : null;
    }
    return type === "burg" ? pack.burgs?.[id] : null;
  };
  const from = party(deal.sellerType, deal.seller), to = party(deal.buyerType, deal.buyer);
  const validBurg = burg => burg && !burg.removed && Number.isInteger(burg.cell) && cells.h[burg.cell] >= 20 && pointValid(cells.p[burg.cell]);
  if (!validBurg(from) || !validBurg(to)) return unknown("交易两端的城市或市场中心缺失，无法判断。");
  const graph = new Map();
  let invalid = 0, missing = 0, deadline = performance.now() + 8;
  const edge = (a, b, length, routeId) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!graph.has(x)) graph.set(x, new Map());
      const previous = graph.get(x).get(y);
      if (!previous || length < previous.length) graph.get(x).set(y, {length, routeId});
    }
  };
  for (const route of map.settlements?.routes || []) {
    if (!route || route.removed) continue;
    if (performance.now() > deadline) { await pause(); if (!isCurrent()) return {stale: true}; deadline = performance.now() + 8; }
    const path = route.packCells;
    if (!Array.isArray(path) || path.length < 2) { missing++; continue; }
    const water = route.type === "searoute", prefix = water ? "w:" : "l:";
    const valid = path.every(cell => Number.isInteger(cell) && cell >= 0 && pointValid(cells.p[cell]) && Number.isFinite(cells.h[cell]))
      && path.slice(1).every((cell, index) => cells.c[path[index]]?.includes(cell))
      && (water ? isSettlementWaterRoutePathValid(pack, path) : path.every(cell => cells.h[cell] >= 20));
    if (!valid) { invalid++; continue; }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], p = cells.p[a], q = cells.p[b];
      edge(prefix + a, prefix + b, Math.hypot(p[0] - q[0], p[1] - q[1]), route.id);
    }
  }
  for (const burg of pack.burgs || []) {
    if (!validBurg(burg) || !burg.port) continue;
    const feature = pack.features?.[burg.port];
    if (!feature || feature.removed || feature.land || !["ocean", "lake"].includes(feature.type)) continue;
    const cell = burg.cell, haven = cells.haven?.[cell];
    const waterNode = `w:${cell}`;
    // A port can transfer only along a verified existing water edge, never at a visual crossing.
    if (graph.has(waterNode)) {
      const legal = [...graph.get(waterNode).keys()].some(key => {
        const next = Number(key.slice(2));
        return cells.h[next] < 20 ? next === haven && Number(cells.f?.[next]) === Number(burg.port) : Boolean(cells.r?.[cell] && cells.r?.[next]);
      });
      if (legal) edge(`l:${cell}`, waterNode, 0, null);
    } else if (Number.isInteger(haven) && cells.c[cell]?.includes(haven) && cells.h[haven] < 20 && Number(cells.f?.[haven]) === Number(burg.port) && graph.has(`w:${haven}`)) {
      const a = cells.p[cell], b = cells.p[haven];
      edge(`l:${cell}`, `w:${haven}`, Math.hypot(a[0] - b[0], a[1] - b[1]), null);
    }
  }
  const start = `l:${from.cell}`, end = `l:${to.cell}`;
  const queue = new MinPriorityQueue(), distances = new Map([[start, 0]]), previous = new Map(), visited = new Set();
  queue.push(start, 0);
  while (queue.length) {
    if (performance.now() > deadline) { await pause(); if (!isCurrent()) return {stale: true}; deadline = performance.now() + 8; }
    const current = queue.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === end) break;
    for (const [next, info] of graph.get(current) || []) {
      const distance = distances.get(current) + info.length;
      if (distance >= (distances.get(next) ?? Infinity)) continue;
      distances.set(next, distance); previous.set(next, {current, ...info}); queue.push(next, distance);
    }
  }
  if (!isCurrent()) return {stale: true};
  const diagnostics = {invalid, missing, visited: visited.size};
  if (!visited.has(end)) return {status: invalid || missing ? "unknown" : "unreachable", ...diagnostics,
    message: invalid || missing ? `未找到完整路径；${invalid} 条道路资料损坏，${missing} 条缺少道路格，暂不能确定不可达。` : "当前道路、支路与海路没有连接交易两端。"};
  const path = [], routes = new Set();
  for (let at = end; at !== start;) { path.push(at); const step = previous.get(at); if (step.routeId != null) routes.add(step.routeId); at = step.current; }
  path.push(start); path.reverse();
  return {status: "reachable", ...diagnostics, length: distances.get(end), path, routes: [...routes],
    message: `已有路径，经过 ${routes.size} 条道路；沿道路格中心距离 ${distances.get(end).toFixed(1)} 地图单位。${invalid || missing ? "部分其它道路资料不完整，本路径仍有效，未保证全网最短。" : ""}`};
}
