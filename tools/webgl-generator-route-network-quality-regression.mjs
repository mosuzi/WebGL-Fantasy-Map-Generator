#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildRivers} from "../app/webgl-generator/src/generator/rivers.js";
import {
  finalizeSettlements,
  regenerateSettlementsWithinPolitics,
  routeNetworkEndpointBudget,
  selectSeaRouteNetworkBurgs,
  selectTrailRouteNetworkBurgs,
  selectSparseRouteNetworkEdges
} from "../app/webgl-generator/src/generator/settlements.js";

const cases = [
  {cellsTarget: 10000, seed: "route-network-quality-10k"},
  {cellsTarget: 50000, seed: "route-network-quality-50k"},
  {cellsTarget: 100000, seed: "route-network-quality-100k"}
];
const previous10kObserved = {roads: [5, 28], trails: [430, 564], searoutes: [73, 136]};
const report = [];

auditPureSparseSelection();

for (const testCase of cases) {
  const startedAt = performance.now();
  const map = generatePlaceholderMap({...testCase, heightmapTemplate: "continents"});
  const stages = {initial: auditRouteNetwork(map, `${testCase.cellsTarget}:initial`)};

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: 31,
    routeRegenerationSalt: 31,
    reassessProvincialCapitals: true
  });
  stages.afterCities = auditRouteNetwork(map, `${testCase.cellsTarget}:cities`);

  map.rivers = buildRivers(map.grid, map.features, map.pack, {...map.options, riverRegenerationSalt: 37});
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, map.options);
  stages.afterRivers = auditRouteNetwork(map, `${testCase.cellsTarget}:rivers`);

  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    routeRegenerationSalt: 41
  });
  stages.afterRoutes = auditRouteNetwork(map, `${testCase.cellsTarget}:routes`);

  const caseReport = {
    ...testCase,
    gridCells: map.grid.cells.i.length,
    packCells: map.pack.cells.i.length,
    durationMs: Number((performance.now() - startedAt).toFixed(1)),
    stages
  };
  if (testCase.cellsTarget === 10000) {
    const afterMax = {
      trails: Math.max(...Object.values(stages).map(stage => stage.trails)),
      searoutes: Math.max(...Object.values(stages).map(stage => stage.searoutes))
    };
    assert(afterMax.trails < previous10kObserved.trails[0], "10k trail 数量必须显著低于修复前失败基线");
    assert(afterMax.searoutes < previous10kObserved.searoutes[0], "10k 海路数量必须低于修复前失败基线");
    caseReport.beforeAfter = {beforeObserved: previous10kObserved, afterMax};
  }
  report.push(caseReport);
}

console.log(JSON.stringify({ok: true, cases: report}, null, 2));

function auditPureSparseSelection() {
  const points = Array.from({length: 25}, (_, index) => [index % 5, Math.floor(index / 5)]);
  const edges = [];
  for (let from = 0; from < points.length; from++) {
    for (let to = from + 1; to < points.length; to++) edges.push([to, from]);
  }
  const selected = selectSparseRouteNetworkEdges(edges, points);
  const repeated = selectSparseRouteNetworkEdges([...edges].reverse(), points);
  const degree = countDegrees(selected, points.length);
  assert.deepEqual(repeated, selected, "稀疏路线候选不得受输入边顺序影响");
  assert.equal(countComponents(selected, points.length), 1, "稀疏路线候选必须保留连通骨架");
  assert(selected.length >= points.length - 1, "稀疏路线候选不得少于生成树骨架");
  assert(selected.length <= points.length - 1 + 4, "稀疏路线候选只能增加少量局部冗余边");
  assert(Math.max(...degree) <= 6, "稀疏路线候选端点度数不得超过 6");
  assert.equal(routeNetworkEndpointBudget(100, "trail"), 40, "trail 端点预算必须按城市数亚线性增长");
  assert.equal(routeNetworkEndpointBudget(100, "searoute"), 30, "海路端点预算必须低于候选港口总量");
  auditPairedGroupSelection();

  const disconnected = selectSparseRouteNetworkEdges([[0, 1], [2, 3]], points.slice(0, 4));
  assert.equal(countComponents(disconnected, 4), 1, "退化候选图必须确定性补齐最近分量连接");
}

function auditPairedGroupSelection() {
  const seaBurgs = [
    {i: 1, port: 10, population: 4}, {i: 2, port: 10, population: 3},
    {i: 3, port: 20, capital: 1, population: 2}, {i: 4, port: 20, population: 1},
    {i: 5, port: 30, provincial: true, population: 2}, {i: 6, port: 30, population: 1}
  ];
  const selectedSea = selectSeaRouteNetworkBurgs(seaBurgs, 4);
  assert.deepEqual(selectedSea.map(burg => burg.port), [20, 20, 30, 30], "海路预算不足时必须按角色优先整组配对，不得留下单港水体");
  assert.deepEqual(selectSeaRouteNetworkBurgs(seaBurgs, 6).map(burg => burg.port).sort((a, b) => a - b), [10, 10, 20, 20, 30, 30], "海路预算足够时必须覆盖全部双港水体");

  const trailBurgs = [
    {i: 1, province: 1, cell: 0, population: 4}, {i: 2, province: 1, cell: 1, population: 3},
    {i: 3, province: 2, cell: 2, capital: 1, population: 2}, {i: 4, province: 2, cell: 3, population: 1},
    {i: 5, province: 3, cell: 4, provincial: true, population: 2}, {i: 6, province: 3, cell: 5, population: 1}
  ];
  const pack = {cells: {h: [30, 30, 30, 30, 30, 30], f: [1, 1, 1, 1, 1, 1]}};
  const selectedTrail = selectTrailRouteNetworkBurgs(trailBurgs, pack, 4);
  assert.deepEqual(countBy(selectedTrail, burg => burg.province), new Map([[2, 2], [3, 2], [1, 2]]), "trail 预算不足时仍必须覆盖每个可路由省份的成对骨架");
}

function auditRouteNetwork(map, label) {
  const routes = (map.settlements?.routes || []).filter(Boolean);
  const errors = {
    adjacency: [],
    landInWater: [],
    seaCell: [],
    repeatedCell: [],
    cellsMirror: [],
    pointsMirror: [],
    packRouteMirror: [],
    packCellLinks: [],
    capitalRoad: []
  };
  const riverEdges = collectRiverEdges(map.pack.rivers || []);
  const pathRatios = [];

  for (const route of routes) {
    const cells = route.packCells || [];
    if (new Set(cells).size !== cells.length) errors.repeatedCell.push(route.id);
    if (route.cells?.length !== cells.length) errors.cellsMirror.push(route.id);
    if (route.points?.length !== cells.length) errors.pointsMirror.push(route.id);
    const packMirror = map.pack.routes?.[route.id];
    if (!packMirror || packMirror.points?.length !== cells.length) errors.packRouteMirror.push(route.id);

    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      if (route.cells?.[index] !== map.pack.cells.g[cell]) errors.cellsMirror.push(route.id);
      const expectedPoint = routePoint(map.pack, cell);
      if (!samePoint(route.points?.[index], expectedPoint)) errors.pointsMirror.push(route.id);
      if (!sameMirrorPoint(packMirror?.points?.[index], expectedPoint, cell)) errors.packRouteMirror.push(route.id);

      if (route.type !== "searoute" && map.pack.cells.h[cell] < 20) errors.landInWater.push({route: route.id, cell});
      if (route.type === "searoute" && map.pack.cells.h[cell] >= 20) {
        const endpoint = index === 0 || index === cells.length - 1;
        const navigable = isNavigableRiverCell(map.pack.cells, cell);
        if (!navigable && !(endpoint && isPortCell(map.pack, cell))) errors.seaCell.push({route: route.id, cell, endpoint});
      }

      if (index === 0) continue;
      const previous = cells[index - 1];
      if (!(map.pack.cells.c?.[previous] || []).includes(cell)) errors.adjacency.push({route: route.id, from: previous, to: cell});
      if (map.pack.cells.routes?.[previous]?.[cell] !== route.id || map.pack.cells.routes?.[cell]?.[previous] !== route.id) {
        errors.packCellLinks.push({route: route.id, from: previous, to: cell});
      }
      if (route.type === "searoute" && (map.pack.cells.h[previous] >= 20 || map.pack.cells.h[cell] >= 20)) {
        const landCell = map.pack.cells.h[previous] >= 20 ? previous : cell;
        if (isNavigableRiverCell(map.pack.cells, landCell) && !riverEdges.has(edgeKey(previous, cell))) {
          errors.seaCell.push({route: route.id, from: previous, to: cell, reason: "river-edge"});
        }
      }
    }

    if (cells.length > 1) pathRatios.push({
      route: route.id,
      type: route.type,
      ratio: routePathRatio(route.points),
      cells: cells.length,
      fromCell: cells[0],
      toCell: cells.at(-1),
      fromPoint: route.points[0],
      toPoint: route.points.at(-1)
    });
  }

  errors.capitalRoad.push(...auditCapitalRoadConnectivity(map, routes));
  const landCoverage = auditRequiredLandRouteCoverage(map, routes);
  assert.deepEqual(landCoverage.missingRoles, [], `${label} 合法首都/省会必须参与 road 或 trail：${JSON.stringify(landCoverage.missingRoles.slice(0, 8))}`);
  assert.deepEqual(landCoverage.starvedGroups, [], `${label} 可路由省份-陆地组不得被预算饿死：${JSON.stringify(landCoverage.starvedGroups.slice(0, 8))}`);

  for (const [kind, values] of Object.entries(errors)) {
    assert.equal(values.length, 0, `${label} ${kind} 失败：${JSON.stringify(values.slice(0, 8))}`);
  }

  const sparse = auditSparseGroups(map, routes, label);
  const activeBurgs = (map.pack.burgs || []).filter(burg => burg?.i && !burg.removed);
  const ports = activeBurgs.filter(burg => burg.port);
  const trailEndpointBudget = routeNetworkEndpointBudget(activeBurgs.length, "trail");
  const seaEndpointBudget = routeNetworkEndpointBudget(ports.length, "searoute");
  const trailSelectedEndpoints = selectTrailRouteNetworkBurgs(activeBurgs, map.pack, trailEndpointBudget).length;
  const sparseRouteCount = routes.filter(route => route.type === "trail" || route.type === "searoute").length;
  const sparseRouteLimit = trailSelectedEndpoints + seaEndpointBudget + 16;
  assert(sparseRouteCount <= sparseRouteLimit, `${label} trail / searoute ${sparseRouteCount} 超过城市规模密度门 ${sparseRouteLimit}`);
  const finiteRatios = pathRatios.filter(item => Number.isFinite(item.ratio)).sort((a, b) => a.ratio - b.ratio);
  const worstPath = finiteRatios.at(-1) || {ratio: 1};
  const maxPathRatio = worstPath.ratio;
  assert(maxPathRatio <= 12, `${label} 路线实际路径 / 弦长比 ${maxPathRatio.toFixed(3)} 超过 12：${JSON.stringify(worstPath)}`);

  return {
    routes: routes.length,
    roads: routes.filter(route => route.type === "road").length,
    trails: routes.filter(route => route.type === "trail").length,
    searoutes: routes.filter(route => route.type === "searoute").length,
    activeBurgs: activeBurgs.length,
    ports: ports.length,
    trailEndpointBudget,
    trailSelectedEndpoints,
    seaEndpointBudget,
    sparseRouteLimit,
    maxPathRatio: Number(maxPathRatio.toFixed(3)),
    p95PathRatio: Number(percentile(finiteRatios.map(item => item.ratio), 0.95).toFixed(3)),
    ...sparse
  };
}

function auditRequiredLandRouteCoverage(map, routes) {
  const routeCells = new Set(routes.filter(route => route.type === "road" || route.type === "trail").flatMap(route => route.packCells || []));
  const burgs = (map.pack.burgs || []).filter(burg => burg?.i && !burg.removed && map.pack.cells.h?.[burg.cell] >= 20);
  const featureCounts = countBy(burgs, burg => Number(map.pack.cells.f?.[burg.cell]) || 0);
  const missingRoles = burgs
    .filter(burg => (burg.capital || burg.provincial) && (featureCounts.get(Number(map.pack.cells.f?.[burg.cell]) || 0) || 0) >= 2 && !routeCells.has(burg.cell))
    .map(burg => ({burg: burg.i, capital: Boolean(burg.capital), provincial: Boolean(burg.provincial)}));
  const starvedGroups = [];
  const groups = new Map();
  for (const burg of burgs) {
    const province = Number(burg.province) || Number(burg.state) || 0;
    const feature = Number(map.pack.cells.f?.[burg.cell]) || 0;
    if (!province || !feature) continue;
    const key = `${province}:${feature}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(burg);
  }
  for (const [key, groupBurgs] of groups) {
    if (groupBurgs.length < 2) continue;
    if (groupBurgs.filter(burg => routeCells.has(burg.cell)).length < 2) starvedGroups.push({key, burgs: groupBurgs.length});
  }
  return {missingRoles, starvedGroups};
}

function auditCapitalRoadConnectivity(map, routes) {
  const parent = new Map();
  const ensure = cell => {
    if (!parent.has(cell)) parent.set(cell, cell);
  };
  const find = cell => {
    ensure(cell);
    const current = parent.get(cell);
    if (current === cell) return cell;
    const root = find(current);
    parent.set(cell, root);
    return root;
  };
  for (const route of routes) {
    if (route.type !== "road") continue;
    const cells = route.packCells || [];
    for (const cell of cells) ensure(cell);
    for (let index = 1; index < cells.length; index++) {
      const leftRoot = find(cells[index - 1]);
      const rightRoot = find(cells[index]);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    }
  }

  const byFeature = new Map();
  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed || !burg.capital || map.pack.cells.h?.[burg.cell] < 20) continue;
    const feature = Number(map.pack.cells.f?.[burg.cell]) || 0;
    if (!byFeature.has(feature)) byFeature.set(feature, []);
    byFeature.get(feature).push(burg.cell);
  }
  const failures = [];
  for (const [feature, cells] of byFeature) {
    if (cells.length < 2) continue;
    const roots = new Set(cells.map(cell => parent.has(cell) ? find(cell) : `missing:${cell}`));
    if (roots.size > 1) failures.push({feature, capitals: cells.length, components: roots.size});
  }
  return failures;
}

function auditSparseGroups(map, routes, label) {
  const aliveBurgs = (map.pack.burgs || []).filter(burg => burg?.i && !burg.removed);
  const trailBurgs = selectTrailRouteNetworkBurgs(aliveBurgs, map.pack, routeNetworkEndpointBudget(aliveBurgs.length, "trail"));
  const ports = aliveBurgs.filter(burg => burg.port);
  const seaBurgs = selectSeaRouteNetworkBurgs(ports, routeNetworkEndpointBudget(ports.length, "searoute"));
  const endpointCounts = new Map();
  for (const burg of seaBurgs) increment(endpointCounts, `searoute:${burg.port}`);
  for (const burg of trailBurgs) {
    const province = Number(burg.province) || Number(burg.state) || 0;
    const feature = map.pack.cells.h?.[burg.cell] >= 20 ? Number(map.pack.cells.f?.[burg.cell]) || 0 : 0;
    if (province && feature) increment(endpointCounts, `trail:${province}:${feature}`);
  }

  const groupRoutes = new Map();
  const endpointDegree = new Map();
  for (const route of routes) {
    if (route.type !== "trail" && route.type !== "searoute") continue;
    const key = route.type === "searoute"
      ? `searoute:${route.feature}`
      : `trail:${Number(route.province) || Number(route.state) || 0}:${route.feature}`;
    increment(groupRoutes, key);
    for (const cell of [route.packCells?.[0], route.packCells?.at(-1)]) {
      if (!Number.isInteger(cell) || !map.pack.cells.burg?.[cell]) continue;
      increment(endpointDegree, `${route.type}:${cell}`);
    }
  }

  const overfullGroups = [];
  for (const [key, count] of groupRoutes) {
    const endpoints = endpointCounts.get(key) || 0;
    const limit = Math.max(1, endpoints) + 6;
    if (count > limit) overfullGroups.push({key, count, endpoints, limit});
  }
  const maxEndpointDegree = Math.max(0, ...endpointDegree.values());
  assert.equal(overfullGroups.length, 0, `${label} 稀疏组路线数超限：${JSON.stringify(overfullGroups.slice(0, 8))}`);
  assert(maxEndpointDegree <= 6, `${label} trail / searoute 城镇端点度数 ${maxEndpointDegree} 超过 6`);
  return {sparseGroups: groupRoutes.size, maxEndpointDegree, maxGroupRoutes: Math.max(0, ...groupRoutes.values())};
}

function routePoint(pack, cell) {
  const burg = pack.burgs?.[pack.cells.burg?.[cell]];
  return burg ? [burg.x, burg.y] : pack.cells.p[cell];
}

function isPortCell(pack, cell) {
  const burg = pack.burgs?.[pack.cells.burg?.[cell]];
  return Boolean(burg?.i && burg.port && burg.cell === cell);
}

function isNavigableRiverCell(cells, cell) {
  return Boolean(cells.r?.[cell]) && (cells.fl?.[cell] || 0) >= 100;
}

function collectRiverEdges(rivers) {
  const edges = new Set();
  for (const river of rivers) {
    for (let index = 1; index < (river?.cells?.length || 0); index++) {
      const from = river.cells[index - 1];
      const to = river.cells[index];
      if (from >= 0 && to >= 0) edges.add(edgeKey(from, to));
    }
  }
  return edges;
}

function routePathRatio(points) {
  let length = 0;
  for (let index = 1; index < points.length; index++) length += distance(points[index - 1], points[index]);
  return length / Math.max(distance(points[0], points.at(-1)), 1e-6);
}

function samePoint(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left[0] === right[0] && left[1] === right[1];
}

function sameMirrorPoint(point, expected, cell) {
  return Array.isArray(point) && point[0] === expected[0] && point[1] === expected[1] && point[2] === cell;
}

function distance(left, right) {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function edgeKey(left, right) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function countBy(values, keyFn) {
  const counts = new Map();
  for (const value of values) increment(counts, keyFn(value));
  return counts;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function countDegrees(edges, count) {
  const degree = new Uint16Array(count);
  for (const [from, to] of edges) {
    degree[from]++;
    degree[to]++;
  }
  return degree;
}

function countComponents(edges, count) {
  const parent = Array.from({length: count}, (_, index) => index);
  const find = node => parent[node] === node ? node : (parent[node] = find(parent[node]));
  for (const [left, right] of edges) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  }
  return new Set(parent.map((_, index) => find(index))).size;
}
