#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {finalizeSettlements, regenerateSettlementsWithinPolitics, selectRouteEdges} from "../app/webgl-generator/src/generator/settlements.js";

const points = Array.from({length: 21}, (_, index) => [index, 0]);
const edges = Array.from({length: 20}, (_, index) => [0, index + 1]);
const selected = selectRouteEdges(edges, points, true);

assert.equal(selected.length, 13, "水域候选边应保留 65%");
assert.deepEqual(selected, edges.slice(0, 13), "水域候选边必须优先保留相近港口");
assert.strictEqual(selectRouteEdges(edges, points, false), edges, "陆路候选边不得套用海路筛选");

const options = {
  seed: "searoute-locality-regeneration",
  cellsTarget: 6000,
  graphWidth: 1200,
  graphHeight: 760,
  heightmapTemplate: "continents"
};
const map = generatePlaceholderMap(options);
const initial = auditSeaRoutes(map);

regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
  ...map.options,
  namebases: map.namebases,
  settlementRegenerationSalt: 41,
  routeRegenerationSalt: 41
});
const afterCities = auditSeaRoutes(map);

finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
  ...map.options,
  routeRegenerationSalt: 43
});
const afterRivers = auditSeaRoutes(map);

for (const [stage, audit] of Object.entries({initial, afterCities, afterRivers})) {
  assert(audit.count > 0, `${stage} 应保留海路`);
}

console.log(JSON.stringify({
  ok: true,
  pureCandidateSelection: selected.map(edge => edge[1]),
  initial,
  afterCities,
  afterRivers
}, null, 2));

function auditSeaRoutes(map) {
  const routes = map.settlements.routes.filter(route => route?.type === "searoute");
  const endpointDistances = routes.map(route => {
    const start = route.points?.[0];
    const end = route.points?.at(-1);
    return Math.hypot((end?.[0] ?? 0) - (start?.[0] ?? 0), (end?.[1] ?? 0) - (start?.[1] ?? 0));
  });
  return {
    count: routes.length,
    maxEndpointDistance: Number(Math.max(...endpointDistances).toFixed(3))
  };
}
