import assert from "node:assert/strict";
import {
  compactRiverPoliticalBoundaryDiagnostics,
  createRiverPoliticalBarrier,
  describeRiverPoliticalBoundaries,
  deriveRiverOrders,
  inspectRiverPoliticalBoundaries,
  riverPoliticalTransition,
  summarizeRiverPoliticalBarrier
} from "../app/webgl-generator/src/generator/river-political-barrier.js";
import {assignConnectedProvinces} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const base = fixture();
const context = createRiverPoliticalBarrier(base);
const summary = summarizeRiverPoliticalBarrier(context);
assert.deepEqual([...deriveRiverOrders(base.rivers)].sort((a, b) => a[0] - b[0]), [[1, 2], [2, 1], [3, 1], [4, 1]]);
assert.equal(summary.candidates, 4);
assert.equal(summary.rivers[0].order, 2);
assert(summary.rivers[0].strength >= context.strongThreshold, "主河未达到强河阈值");
assert(summary.rivers[3].strength < context.weakThreshold, "短弱支流不应成为强阻隔");

const strong = riverPoliticalTransition(context, 9, 5, {level: "state"});
const weak = riverPoliticalTransition(context, 9, 8, {level: "state"});
assert(strong.cost > weak.cost * 3, "强河与弱河增量成本没有拉开");
assert(strong.strong, "强河转移未标强");
assert(!weak.strong, "弱河转移误标强");

const along = riverPoliticalTransition(context, 2, 3, {level: "province"});
assert(along.cost < riverPoliticalTransition(context, 0, 1, {level: "province"}).cost, "沿河移动不应重复承担完整过河成本");

const roadMap = fixture();
roadMap.cells.routes = {1: {2: 1}, 2: {1: 1}};
roadMap.routes = [null, {i: 1, group: "roads"}];
const road = riverPoliticalTransition(createRiverPoliticalBarrier(roadMap), 1, 2, {level: "state"});
assert.equal(road.corridor, "road");
assert(road.cost < strong.cost, "道路应适度降低河障成本");
assert(road.cost > 0, "道路不得把强河变成零成本通道");
const roadDiagnostics = describeRiverPoliticalBoundaries(createRiverPoliticalBarrier(roadMap), new Uint16Array(10).fill(1), new Uint16Array(10).fill(1));
assert(roadDiagnostics.provinces.corridors.road > 0, "道路渡河走廊没有进入结构化诊断");
assert(roadDiagnostics.provinces.rivers.some(river => river.adoptionReason === "corridor-crossing"));
assert.equal(Object.hasOwn(compactRiverPoliticalBoundaryDiagnostics(roadDiagnostics), "rivers"), false, "紧凑诊断不得持有逐河数组");

const portMap = fixture();
portMap.cells.burg = new Uint16Array(10);
portMap.cells.burg[1] = 1;
portMap.burgs = [null, {i: 1, port: 3}];
const port = riverPoliticalTransition(createRiverPoliticalBarrier(portMap), 1, 2, {level: "province"});
assert.equal(port.corridor, "port");
assert(port.cost > 0 && port.cost < riverPoliticalTransition(context, 1, 2, {level: "province"}).cost);

const noRiver = createRiverPoliticalBarrier({...fixture(), rivers: []});
assert.deepEqual(riverPoliticalTransition(noRiver, 1, 2), {riverIds: [], strength: 0, effectiveStrength: 0, cost: 0, strong: false, corridor: "none", corridorMultiplier: 1});

const owners = new Uint16Array([1, 1, 2, 2, 2, 2, 1, 1, 1, 1]);
const inspected = inspectRiverPoliticalBoundaries(context, owners);
assert(inspected.eligibleCells > 0);
assert(inspected.adoptedCells > 0);

const symmetric = symmetricRiverFixture({strong: true});
const symmetricContext = createRiverPoliticalBarrier(symmetric);
const symmetricAssignment = assignConnectedProvinces(symmetric.cells, symmetric.cells.i, [{cell: 6, provinceId: 1}, {cell: 8, provinceId: 2}], new Map(), new Set(), symmetricContext);
const symmetricOwners = Uint16Array.from(symmetric.cells.i, cell => symmetricAssignment.get(cell) || 0);
const symmetricInspection = inspectRiverPoliticalBoundaries(symmetricContext, symmetricOwners);
assert(symmetricInspection.adoptionRate >= 0.7, `强河合格段边界采用率不足：${symmetricInspection.adoptionRate}`);
assert.equal(ownerChecksum(symmetricOwners), 6811943, "对称强河归属 checksum 漂移");
assertOwnersConnected(symmetric.cells, symmetricOwners, [1, 2]);

const singleSide = symmetricRiverFixture({strong: false});
const singleSideContext = createRiverPoliticalBarrier(singleSide);
const singleSideAssignment = assignConnectedProvinces(singleSide.cells, singleSide.cells.i, [{cell: 6, provinceId: 1}], new Map(), new Set(), singleSideContext);
const singleSideOwners = Uint16Array.from(singleSide.cells.i, cell => singleSideAssignment.get(cell) || 0);
assert(singleSideOwners.every(owner => owner === 1), "弱河或单侧无中心时不应制造政治碎片");
assert.equal(inspectRiverPoliticalBoundaries(singleSideContext, singleSideOwners).adoptionRate, 0);

const lockedAssignment = assignConnectedProvinces(symmetric.cells, symmetric.cells.i, [{cell: 6, provinceId: 1}, {cell: 8, provinceId: 2}], new Map([[11, 1]]), new Set([1]), symmetricContext);
assert.equal(lockedAssignment.get(11), 1, "锁定归属必须优先于强河软阻隔");

const repeated = summarizeRiverPoliticalBarrier(createRiverPoliticalBarrier(fixture()));
assert.deepEqual(repeated, summary, "相同河网的评分不确定");
assert.equal(JSON.stringify(base), JSON.stringify(fixture()), "河障模型改写了输入");

console.log(JSON.stringify({
  ok: true,
  strong: strong.strength,
  weak: weak.strength,
  roadMultiplier: road.corridorMultiplier,
  adoptionRate: symmetricInspection.adoptionRate,
  checksum: ownerChecksum(symmetricOwners)
}));

function fixture() {
  return {
    cells: {
      i: Array.from({length: 10}, (_, index) => index),
      h: new Uint8Array(10).fill(30),
      c: [[1], [0, 2, 6], [1, 3, 6], [2, 4], [3, 5], [4], [1, 2, 7], [6, 8], [7, 9], [8]],
      r: new Uint16Array([0, 1, 1, 1, 1, 1, 2, 4, 4, 0]),
      fl: new Uint16Array([0, 2600, 3000, 3400, 3600, 3900, 800, 4, 5, 0]),
      burg: new Uint16Array(10),
      routes: {}
    },
    rivers: [
      {i: 1, parent: 0, flux: 3900, width: 11, length: 850, cells: [1, 2, 3, 4, 5]},
      {i: 2, parent: 1, flux: 800, width: 4, length: 240, cells: [6, 2]},
      {i: 3, parent: 1, flux: 750, width: 4, length: 210, cells: [0, 1]},
      {i: 4, parent: 0, flux: 5, width: 0.15, length: 12, cells: [7, 8]}
    ],
    routes: [],
    burgs: []
  };
}

function symmetricRiverFixture({strong}) {
  const columns = 3;
  const rows = 5;
  const count = columns * rows;
  const c = Array.from({length: count}, () => []);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cell = row * columns + column;
    if (column > 0) c[cell].push(cell - 1);
    if (column + 1 < columns) c[cell].push(cell + 1);
    if (row > 0) c[cell].push(cell - columns);
    if (row + 1 < rows) c[cell].push(cell + columns);
  }
  const riverCells = Array.from({length: rows}, (_, row) => row * columns + 1);
  const r = new Uint16Array(count);
  for (const cell of riverCells) r[cell] = 1;
  return {
    cells: {
      i: Array.from({length: count}, (_, index) => index),
      h: new Uint8Array(count).fill(30),
      c,
      r,
      burg: new Uint16Array(count),
      routes: {}
    },
    rivers: [{i: 1, flux: strong ? 4000 : 8, width: strong ? 12 : 0.2, length: strong ? 900 : 20, cells: riverCells}],
    routes: [],
    burgs: []
  };
}

function ownerChecksum(values) {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= value;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function assertOwnersConnected(cells, owners, ownerIds) {
  for (const owner of ownerIds) {
    const owned = cells.i.filter(cell => owners[cell] === owner);
    assert(owned.length, `行政区 ${owner} 没有归属 cell`);
    const visited = new Set([owned[0]]);
    const queue = [owned[0]];
    while (queue.length) {
      const cell = queue.pop();
      for (const neighbor of cells.c[cell] || []) {
        if (owners[neighbor] !== owner || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    assert.equal(visited.size, owned.length, `行政区 ${owner} 被竞争队列拆成多个分量`);
  }
}
