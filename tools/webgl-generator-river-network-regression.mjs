#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {describeRiverRelation, normalizeRiverNetwork} from "../app/webgl-generator/src/generator/river-network.js";
import {createMapDocument, parseMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";

const seedResults = [];
for (const seed of ["a", "b", "c", "d", "e"]) {
  const map = generatePlaceholderMap({seed, cellsTarget: 10000, heightmapTemplate: "continents"});
  const audit = auditNetwork(map);
  assert.equal(audit.missingParents, 0, `${seed}: 不得存在缺失父河`);
  assert.equal(audit.selfParents, 0, `${seed}: 不得存在自指父河`);
  assert.equal(audit.disconnectedParents, 0, `${seed}: 支流必须在陆地汇流点接入干流`);
  assert.equal(audit.cycles, 0, `${seed}: 父河链不得成环`);
  assert.equal(audit.disconnectedPaths, 0, `${seed}: 河道相邻 cell 不得跳跃`);
  assert.equal(audit.invalidRootOutlets, 0, `${seed}: 根干流必须拥有合法出口`);
  assert.equal(audit.orphaned, 0, `${seed}: 新生成地图不得保留陆地孤立河段`);
  assert.ok(audit.branches > 0, `${seed}: 固定样本应包含支流以覆盖父河关系`);
  seedResults.push({
    seed,
    rivers: map.rivers.rivers.length,
    branches: audit.branches,
    lakeInlets: map.rivers.rivers.filter(river => river.networkStatus === "lake-inlet").length,
    dropped: map.rivers.metadata.networkDiagnostics?.dropped || 0
  });
}

const synthetic = createSyntheticNetwork();
const syntheticNormalized = normalizeRiverNetwork(synthetic.rivers, synthetic.pack, {dropIncomplete: false});
assert.equal(syntheticNormalized.rivers.length, 7, "旧图归一化不得删除河流几何");
assert.deepEqual(relation(syntheticNormalized.rivers, 2), {
  parent: 1,
  basin: 1,
  confluence: 1,
  outletKind: "confluence",
  networkStatus: "valid"
});
assert.deepEqual(relation(syntheticNormalized.rivers, 3), {
  parent: 0,
  basin: 3,
  confluence: -1,
  outletKind: "lake",
  networkStatus: "lake-inlet"
});
assert.deepEqual(relation(syntheticNormalized.rivers, 4), {
  parent: 0,
  basin: 4,
  confluence: -1,
  outletKind: "border",
  networkStatus: "border-outlet"
});
assert.deepEqual(relation(syntheticNormalized.rivers, 5), {
  parent: 0,
  basin: 5,
  confluence: -1,
  outletKind: "inland",
  networkStatus: "orphaned"
});
assert.deepEqual(relation(syntheticNormalized.rivers, 6), {
  parent: 0,
  basin: 6,
  confluence: -1,
  outletKind: "inland",
  networkStatus: "orphaned"
});
assert.equal(syntheticNormalized.rivers.find(river => river.id === 6).networkIssue, "disconnected-path");
assert.equal(syntheticNormalized.rivers.find(river => river.id === 7).networkStatus, "orphaned");
assert.equal(syntheticNormalized.rivers.find(river => river.id === 7).networkIssue, "invalid-downstream-basin");

const badGeometry = normalizeRiverNetwork([
  {...river(8, 0, [0, 1], "伪岸线河"), mouth: 1, points: [[5, 5], [20, 20]]}
], createGeometryOutletPack(), {dropIncomplete: false});
assert.equal(badGeometry.rivers[0].networkStatus, "orphaned");
assert.equal(badGeometry.rivers[0].networkIssue, "invalid-water-outlet");
const goodGeometry = normalizeRiverNetwork([
  {...river(9, 0, [0, 1], "真实岸线河"), mouth: 1, points: [[5, 5], [0, 5]]}
], createGeometryOutletPack(), {dropIncomplete: false});
assert.equal(goodGeometry.rivers[0].networkStatus, "ocean-mouth");

const compatibilityMap = generatePlaceholderMap({seed: "river-network-old-map", cellsTarget: 3000, heightmapTemplate: "continents"});
const originalCount = compatibilityMap.rivers.rivers.length;
const waterOutlet = compatibilityMap.rivers.rivers.find(river => Number(compatibilityMap.pack.cells.h[river.mouth]) < 20);
assert.ok(waterOutlet, "旧图夹具需要至少一条入水河流");
waterOutlet.parent = 9999;
waterOutlet.basin = 9999;
const oldDocument = createMapDocument(compatibilityMap);
const imported = parseMapDocument(JSON.stringify(oldDocument)).map;
const importedWaterOutlet = imported.rivers.rivers.find(river => river.id === waterOutlet.id);
assert.equal(imported.rivers.rivers.length, originalCount, "旧图往返不得丢失河流");
assert.equal(importedWaterOutlet.parent, 0, "入水河流的缺失父河应解除");
assert.ok(["lake-inlet", "ocean-mouth"].includes(importedWaterOutlet.networkStatus));
assert.equal(imported.pack.rivers, imported.rivers.rivers, "pack 河流镜像应与主仓共用归一化数组");

const resolvedBranch = resolveObject({
  rivers: {rivers: syntheticNormalized.rivers}
}, {kind: "river", id: 2});
assert.equal(resolvedBranch.parentName, "主河");
assert.equal(resolvedBranch.basinName, "主河");
assert.equal(resolvedBranch.confluence, 1);
assert.equal(describeRiverRelation(syntheticNormalized.rivers[1], syntheticNormalized.rivers).networkStatus, "valid");

console.log(JSON.stringify({
  ok: true,
  fixedSeeds: seedResults,
  legacy: {
    preserved: syntheticNormalized.rivers.length,
    repaired: syntheticNormalized.diagnostics.repaired,
    lakeInlets: syntheticNormalized.diagnostics.lakeInlets,
    orphaned: syntheticNormalized.diagnostics.orphaned
  },
  roundtrip: {
    rivers: imported.rivers.rivers.length,
    correctedRiverId: importedWaterOutlet.id,
    networkStatus: importedWaterOutlet.networkStatus
  }
}, null, 2));

function auditNetwork(map) {
  const rivers = map.rivers.rivers;
  const byId = new Map(rivers.map(river => [river.id, river]));
  let missingParents = 0;
  let selfParents = 0;
  let disconnectedParents = 0;
  let disconnectedPaths = 0;
  let invalidRootOutlets = 0;
  let cycles = 0;

  for (const river of rivers) {
    const path = river.cells || [];
    for (let index = 0; index < path.length - 1; index++) {
      const from = path[index];
      const to = path[index + 1];
      if (to === -1) {
        if (index !== path.length - 2 || !Number(map.pack.cells.b[from])) disconnectedPaths++;
        continue;
      }
      if (!(map.pack.cells.c[from] || []).includes(to)) disconnectedPaths++;
    }
    if (!river.parent && !["lake-inlet", "ocean-mouth", "border-outlet"].includes(river.networkStatus)) invalidRootOutlets++;
    if (!river.parent) continue;
    const parent = byId.get(river.parent);
    if (!parent) {
      missingParents++;
      continue;
    }
    if (river.parent === river.id) selfParents++;
    const index = parent.cells.lastIndexOf(river.mouth);
    if (Number(map.pack.cells.h[river.mouth]) < 20 || index < 0 || index >= parent.cells.length - 1) disconnectedParents++;
    const seen = new Set([river.id]);
    let current = parent;
    while (current?.parent) {
      if (seen.has(current.id)) {
        cycles++;
        break;
      }
      seen.add(current.id);
      current = byId.get(current.parent);
    }
  }

  return {
    branches: rivers.filter(river => river.parent).length,
    missingParents,
    selfParents,
    disconnectedParents,
    disconnectedPaths,
    invalidRootOutlets,
    cycles,
    orphaned: rivers.filter(river => river.networkStatus === "orphaned").length
  };
}

function createSyntheticNetwork() {
  const rivers = [
    river(1, 0, [0, 1, 2, 10], "主河"),
    river(2, 999, [3, 1], "支流"),
    river(3, 1, [4, 5], "入湖河"),
    river(4, 4, [6, 7, -1], "出界河"),
    river(5, 999, [8, 9], "孤立旧河"),
    river(6, 0, [11, 12], "伪入海河"),
    river(7, 6, [13, 11], "伪入海支流")
  ];
  return {
    rivers,
    pack: {
      features: [
        {i: 0, type: "ocean", border: true},
        {i: 1, type: "lake"}
      ],
      cells: {
        h: Uint8Array.from([50, 40, 30, 60, 55, 10, 70, 65, 80, 75, 10, 55, 10, 60]),
        f: Uint16Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
        b: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]),
        c: [
          [1],
          [0, 2, 3],
          [1, 10],
          [1],
          [5],
          [4],
          [7],
          [6],
          [9],
          [8],
          [2],
          [13],
          [],
          [11]
        ]
      }
    }
  };
}

function river(id, parent, cells, name) {
  const mouth = [...cells].reverse().find(cell => cell >= 0);
  return {
    id,
    i: id,
    parent,
    basin: parent || id,
    mouth,
    name,
    cells,
    points: cells.filter(cell => cell >= 0).map((cell, index) => [index * 10, id * 10]),
    flux: 100 - id
  };
}

function createGeometryOutletPack() {
  return {
    features: [{i: 0, type: "ocean", border: true}],
    vertices: {p: [[0, 0], [0, 10]]},
    cells: {
      h: Uint8Array.from([40, 10]),
      f: Uint16Array.from([0, 0]),
      b: Uint8Array.from([0, 0]),
      c: [[1], [0]],
      v: [[0, 1], [0, 1]]
    }
  };
}

function relation(rivers, id) {
  const river = rivers.find(item => item.id === id);
  return {
    parent: river.parent,
    basin: river.basin,
    confluence: river.confluence,
    outletKind: river.outletKind,
    networkStatus: river.networkStatus
  };
}
