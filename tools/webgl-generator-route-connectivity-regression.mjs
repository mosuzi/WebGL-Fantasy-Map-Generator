#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";

const cases = [
  {cellsTarget: 10000, seed: "route-connectivity-10k"},
  {cellsTarget: 50000, seed: "route-connectivity-50k"},
  {cellsTarget: 100000, seed: "route-connectivity-100k"}
];
const report = [];

for (const testCase of cases) {
  const started = performance.now();
  const map = generatePlaceholderMap({...testCase, heightmapTemplate: "continents"});
  const audit = auditLandRoutes(map);

  assert(audit.routeCount > 0, `${testCase.cellsTarget} 应生成陆路`);
  assert.equal(audit.waterCellRoutes.length, 0, `${testCase.cellsTarget} 陆路不得经过水域`);
  assert.equal(audit.crossFeatureRoutes.length, 0, `${testCase.cellsTarget} 陆路不得跨越 land feature`);
  assert.equal(audit.fragmentedFeatures.length, 0, `${testCase.cellsTarget} 同一 land feature 的陆路必须连通：${JSON.stringify(audit.fragmentedFeatures)}`);

  report.push({
    ...testCase,
    gridCells: map.grid.cells.i.length,
    packCells: map.pack.cells.i.length,
    routeCount: audit.routeCount,
    routeEdges: audit.routeEdges,
    landFeaturesWithRoutes: audit.featureComponents.size,
    maxComponentsPerFeature: Math.max(...audit.featureComponents.values()),
    durationMs: Number((performance.now() - started).toFixed(1))
  });
}

console.log(JSON.stringify({ok: true, cases: report}, null, 2));

function auditLandRoutes(map) {
  const routes = map.settlements.routes.filter(route => route && route.type !== "searoute");
  const parent = new Map();
  const featureCells = new Map();
  const waterCellRoutes = [];
  const crossFeatureRoutes = [];
  let routeEdges = 0;

  for (const route of routes) {
    const cells = route.packCells || [];
    const features = new Set(cells.map(cell => Number(map.pack.cells.f[cell]) || 0));
    if (cells.some(cell => map.pack.cells.h[cell] < 20)) waterCellRoutes.push(route.id);
    if (features.size !== 1) crossFeatureRoutes.push(route.id);

    for (const cell of cells) {
      ensure(parent, cell);
      const feature = Number(map.pack.cells.f[cell]) || 0;
      if (!featureCells.has(feature)) featureCells.set(feature, new Set());
      featureCells.get(feature).add(cell);
    }
    for (let index = 0; index < cells.length - 1; index++) {
      union(parent, cells[index], cells[index + 1]);
      routeEdges++;
    }
  }

  const featureComponents = new Map();
  for (const [feature, cells] of featureCells) {
    featureComponents.set(feature, new Set([...cells].map(cell => find(parent, cell))).size);
  }
  const fragmentedFeatures = [...featureComponents].filter(([, components]) => components > 1);
  return {routeCount: routes.length, routeEdges, featureComponents, fragmentedFeatures, waterCellRoutes, crossFeatureRoutes};
}

function ensure(parent, cell) {
  if (!parent.has(cell)) parent.set(cell, cell);
}

function find(parent, cell) {
  const current = parent.get(cell);
  if (current === cell) return cell;
  const root = find(parent, current);
  parent.set(cell, root);
  return root;
}

function union(parent, left, right) {
  ensure(parent, left);
  ensure(parent, right);
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
}
