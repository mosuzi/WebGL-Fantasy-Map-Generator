#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";

const scales = [10_000, 50_000, 100_000];
const minimums = new Map([
  [10_000, {features: 12, cities: 650, states: 10, provinces: 140, routes: 220, rivers: 140, markers: 30, religions: 15, military: 75, zones: 3, markets: 20, deals: 10_000, currents: 4}],
  [50_000, {features: 65, cities: 900, states: 11, provinces: 210, routes: 310, rivers: 360, markers: 150, religions: 13, military: 160, zones: 3, markets: 30, deals: 15_000, currents: 6}],
  [100_000, {features: 150, cities: 950, states: 12, provinces: 250, routes: 380, rivers: 550, markers: 300, religions: 15, military: 180, zones: 4, markets: 30, deals: 16_000, currents: 8}]
]);
const reports = [];

for (const cellsTarget of scales) {
  const startedAt = performance.now();
  const map = generatePlaceholderMap({
    seed: `task-365-ordinary-generation-${cellsTarget}`,
    cellsTarget,
    heightmapTemplate: "continents"
  });
  const counts = domainCounts(map);
  assertOrdinaryGenerationHardGates(map);
  for (const [kind, minimum] of Object.entries(minimums.get(cellsTarget))) assert(counts[kind] >= minimum, `${cellsTarget} cells 普通生成 ${kind} 丰富度 ${counts[kind]} 低于冻结下限 ${minimum}`);
  reports.push({cellsTarget, actualCells: map.grid.cells.i.length, ms: Math.round((performance.now() - startedAt) * 10) / 10, counts});
}

console.log(JSON.stringify({ok: true, reports}, null, 2));

function domainCounts(map) {
  const active = rows => (rows || []).filter(item => item && !item.removed);
  return {
    features: active(map.pack?.features).length,
    cities: active(map.settlements?.cities).length,
    states: active(map.politics?.states).filter(state => Number(state.i) > 0).length,
    provinces: active(map.politics?.provinces).filter(province => Number(province.i) > 0).length,
    routes: active(map.settlements?.routes).length,
    rivers: active(map.rivers?.rivers).length,
    markers: active(map.markers?.markers).length,
    religions: active(map.society?.religions).filter(religion => Number(religion.i) > 0).length,
    military: active(map.pack?.states).flatMap(state => active(state.military)).length,
    zones: active(map.zones?.zones).length,
    markets: active(map.pack?.markets).filter(market => Number(market.i) > 0).length,
    deals: active(map.pack?.deals).length,
    currents: active(map.oceanCurrents?.currents).length
  };
}

function assertOrdinaryGenerationHardGates(map) {
  const cells = map.pack.cells;
  const count = cells.i.length;
  const active = rows => (rows || []).filter(item => item && !item.removed);
  const finitePoint = object => Number.isFinite(Number(object?.x)) && Number.isFinite(Number(object?.y));
  const land = cell => Number(cells.h[cell]) >= 20;
  const validCell = cell => Number.isSafeInteger(Number(cell)) && Number(cell) >= 0 && Number(cell) < count;

  const cityIds = new Set();
  const burgIds = new Set();
  for (const city of active(map.settlements?.cities)) {
    assert(!cityIds.has(String(city.id)) && !burgIds.has(Number(city.burgId)), `普通生成城镇 ${city.id} 身份重复`);
    assert(validCell(city.packCell) && land(city.packCell) && finitePoint(city), `普通生成城镇 ${city.id} 违反陆地或有限坐标硬门`);
    cityIds.add(String(city.id));
    burgIds.add(Number(city.burgId));
  }

  const routeIds = new Set();
  for (const route of active(map.settlements?.routes)) {
    assert(!routeIds.has(String(route.id)), `普通生成路线 ${route.id} 身份重复`);
    assert(Array.isArray(route.packCells) && route.packCells.length >= 2 && route.packCells.every(validCell), `普通生成路线 ${route.id} cell 无效`);
    assert(Array.isArray(route.points) && route.points.length === route.packCells.length && route.points.every(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))), `普通生成路线 ${route.id} 坐标无效`);
    for (let index = 1; index < route.packCells.length; index++) {
      const previous = Number(route.packCells[index - 1]);
      const current = Number(route.packCells[index]);
      assert(previous === current || cells.c[previous]?.includes(current), `普通生成路线 ${route.id} 非邻接`);
    }
    if (route.type !== "searoute") assert(route.packCells.every(land), `普通生成陆路 ${route.id} 穿越水域`);
    routeIds.add(String(route.id));
  }

  const riverIds = new Set();
  for (const river of active(map.rivers?.rivers)) {
    const id = Number(river.id ?? river.i);
    assert(Number.isSafeInteger(id) && id > 0 && !riverIds.has(id), `普通生成河流 ${id} 身份无效或重复`);
    assert(Array.isArray(river.cells) && river.cells.some(cell => Number(cell) >= 0), `普通生成河流 ${id} 路径为空`);
    const realCells = river.cells.filter(cell => Number(cell) >= 0).map(Number);
    assert(realCells.every(validCell), `普通生成河流 ${id} cell 越界`);
    for (let index = 1; index < realCells.length; index++) assert(cells.c[realCells[index - 1]]?.includes(realCells[index]), `普通生成河流 ${id} 非邻接`);
    if (realCells.length && !land(realCells[0])) assert(map.pack.features?.[Number(cells.f[realCells[0]])]?.type === "lake", `普通生成河流 ${id} 从海洋起流`);
    riverIds.add(id);
  }

  for (const state of active(map.politics?.states).filter(state => Number(state.i) > 0)) assert(validCell(state.center) && land(state.center), `普通生成国家 ${state.i} 中心不在陆地`);
  for (const province of active(map.politics?.provinces).filter(province => Number(province.i) > 0)) {
    assert(validCell(province.center) && land(province.center), `普通生成省份 ${province.i} 中心不在陆地`);
    assert(Number(cells.state[province.center]) === Number(province.state), `普通生成省份 ${province.i} 中心不属于父国`);
  }
  for (const religion of active(map.society?.religions).filter(religion => Number(religion.i) > 0)) assert(validCell(religion.center), `普通生成宗教 ${religion.i} 中心无效`);
  for (const marker of active(map.markers?.markers)) assert(validCell(marker.packCell) && finitePoint(marker), `普通生成标记 ${marker.id ?? marker.i} 违反 cell 或有限坐标硬门`);
  for (const market of active(map.pack?.markets).filter(market => Number(market.i) > 0)) assert(validCell(market.cell) && finitePoint(market), `普通生成市场 ${market.i} 违反 cell 或有限坐标硬门`);
  for (const state of active(map.pack?.states)) for (const regiment of active(state.military)) assert(validCell(regiment.cell) && finitePoint(regiment), `普通生成军团 ${regiment.id ?? regiment.i} 违反 cell 或有限坐标硬门`);

  for (const [kind, rows] of Object.entries({features: map.pack?.features, cities: map.settlements?.cities, states: map.politics?.states, provinces: map.politics?.provinces, routes: map.settlements?.routes, rivers: map.rivers?.rivers, markers: map.markers?.markers, religions: map.society?.religions, markets: map.pack?.markets, currents: map.oceanCurrents?.currents})) {
    assert(active(rows).length > 0, `普通生成 ${kind} 意外为空`);
  }
}
