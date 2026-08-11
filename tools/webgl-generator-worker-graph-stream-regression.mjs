import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  cloneWorkerGraphByPackets,
  createWorkerGraphDecoder,
  encodeWorkerGraph
} from "../app/webgl-generator/src/runtime/worker-graph-stream.js";

const sharedBuffer = new ArrayBuffer(96);
const firstView = new Uint16Array(sharedBuffer, 8, 12);
const secondView = new Float32Array(sharedBuffer, 16, 8);
firstView.set([7, 11, 13, 17]);
const sparse = new Array(9);
sparse[2] = "two";
sparse.extra = "extra";
const nullPrototype = Object.create(null);
Object.defineProperty(nullPrototype, "__proto__", {value: "safe-own-key", enumerable: true, writable: true, configurable: true});
const fixture = {
  undefined,
  nan: NaN,
  positiveInfinity: Infinity,
  negativeInfinity: -Infinity,
  negativeZero: -0,
  bigint: 12345678901234567890n,
  denseNumbers: [0, -0, NaN, Infinity, -Infinity, 9007199254740991],
  sparse,
  firstView,
  secondView,
  dataView: new DataView(sharedBuffer, 4, 24),
  date: new Date("2026-08-10T00:00:00.000Z"),
  regexp: /worker-stream/giu,
  map: new Map(),
  set: new Set(),
  nullPrototype
};
fixture.alias = fixture.map;
fixture.self = fixture;
fixture.map.set(fixture, fixture.set);
fixture.set.add(fixture.map);

const fixtureClone = await cloneWorkerGraphByPackets(fixture, {
  streamId: "fixture",
  packetUnits: 16,
  recordUnits: 8,
  yieldToMain: async () => {}
});
assert.deepEqual(fixtureClone.value, fixture);
assert.equal(fixtureClone.value.self, fixtureClone.value);
assert.equal(fixtureClone.value.alias, fixtureClone.value.map);
assert.equal(fixtureClone.value.map.get(fixtureClone.value), fixtureClone.value.set);
assert.equal(fixtureClone.value.firstView.buffer, fixtureClone.value.secondView.buffer);
assert.equal(fixtureClone.value.firstView.buffer, fixtureClone.value.dataView.buffer);
assert.equal(fixtureClone.value.firstView.byteOffset, 8);
assert.equal(fixtureClone.value.secondView.byteOffset, 16);
assert.equal(Object.getPrototypeOf(fixtureClone.value.nullPrototype), null);
assert.equal(Object.prototype.hasOwnProperty.call(fixtureClone.value.nullPrototype, "__proto__"), true);
assert.equal({}.safeOwnKey, undefined);
assert.ok(fixtureClone.packetStats.every(item => item.records <= 16));
assert.equal(sharedBuffer.byteLength, 96, "正式输入 buffer 不得被转移或脱离");

const numericBatchValues = 32 * 1024;
const numericGroups = Array.from({length: 12}, (_, group) => Array.from(
  {length: 24_577},
  (_, index) => group * 100_000 + index / 8
));
numericGroups[0][0] = -0;
numericGroups[0][1] = NaN;
numericGroups[0][2] = Infinity;
numericGroups[0][3] = -Infinity;
const numericFixture = {
  groups: numericGroups,
  alias: numericGroups[4],
  nested: {alias: numericGroups[4]},
  undefined,
  bigint: 9876543210123456789n
};
numericFixture.self = numericFixture;
assert.ok(numericGroups.every(group => group.length < numericBatchValues), "数值分组夹具单组必须小于 32k");
assert.ok(numericGroups.reduce((sum, group) => sum + group.length, 0) > 256 * 1024, "数值分组夹具合计必须大于 256k");
const numericDecoder = createWorkerGraphDecoder({streamId: "numeric-batches-32k"});
let numericPackets = 0;
let maxNumericPacketValues = 0;
for await (const packet of encodeWorkerGraph(numericFixture, {
  streamId: "numeric-batches-32k",
  numericBatchValues,
  yieldToMain: async () => {}
})) {
  const cloned = structuredClone(packet.message, packet.transferables.length ? {transfer: packet.transferables} : undefined);
  for (const record of cloned.records) {
    if (record.type !== "numeric-arrays") continue;
    const values = new Float64Array(record.buffer);
    numericPackets += 1;
    maxNumericPacketValues = Math.max(maxNumericPacketValues, values.length);
    assert.ok(values.length <= numericBatchValues, `numeric packet 超过 32k：${values.length}`);
  }
  numericDecoder.push(cloned);
}
const numericClone = numericDecoder.finish();
assert.deepEqual(numericClone, numericFixture, "32k 数值分包必须完整往返数组与特殊值");
assert.equal(numericClone.self, numericClone, "32k 数值分包必须保留根循环引用");
assert.equal(numericClone.alias, numericClone.groups[4], "32k 数值分包必须保留数组引用");
assert.equal(numericClone.nested.alias, numericClone.groups[4], "32k 数值分包必须保留嵌套引用");
assert.ok(numericPackets > 1, "32k 数值分包夹具未实际分包");

const manySmallBuffers = Array.from({length: 2048}, (_, index) => new Uint8Array([index & 255, (index >> 8) & 255]));
let smallBufferYields = 0;
const smallBufferClone = await cloneWorkerGraphByPackets(manySmallBuffers, {
  streamId: "many-small-buffers",
  budgetMs: 20,
  yieldToMain: () => new Promise(resolve => setTimeout(() => {
    smallBufferYields += 1;
    resolve();
  }, 0))
});
assert.deepEqual(smallBufferClone.value, manySmallBuffers);
assert.ok(smallBufferYields < 128, `小 buffer 不得逐个强制让步：${smallBufferYields}`);
assert.ok(manySmallBuffers.every(view => view.byteLength === 2), "小 buffer 正式输入不得 detach");

const cellsTarget = Math.max(1000, Number(process.env.FMG_WORKER_GRAPH_CELLS) || 10000);
const map = generatePlaceholderMap({seed: "worker-graph-stream", cellsTarget, heightmapTemplate: "continents"});
const sourceGridBuffer = map.grid.cells.i.buffer;
const packetDurations = [];
const decoder = createWorkerGraphDecoder({streamId: `map-${cellsTarget}`});
let packets = 0;
let maxRecords = 0;
let yields = 0;
let phase = "discover";
const yieldsByPhase = {discover: 0, definitions: 0, properties: 0};
let eventLoopTicks = 0;
const eventLoopTimer = setInterval(() => { eventLoopTicks += 1; }, 0);
for await (const packet of encodeWorkerGraph({map, kind: "zones"}, {
  streamId: `map-${cellsTarget}`,
  packetUnits: 4096,
  recordUnits: 512,
  sliceBytes: 128 * 1024,
  budgetMs: 3,
  yieldToMain: () => new Promise(resolve => setTimeout(() => {
    yields += 1;
    yieldsByPhase[phase] += 1;
    resolve();
  }, 0)),
  onProgress: stage => {
    if (stage === "discover") phase = "definitions";
    else if (stage === "definitions") phase = "properties";
  }
})) {
  const startedAt = performance.now();
  const cloned = structuredClone(packet.message, packet.transferables.length ? {transfer: packet.transferables} : undefined);
  packetDurations.push(performance.now() - startedAt);
  decoder.push(cloned);
  packets += 1;
  maxRecords = Math.max(maxRecords, packet.message.records.length);
}
clearInterval(eventLoopTimer);
const clonedPayload = decoder.finish();
assert.deepEqual(clonedPayload, {map, kind: "zones"}, `${cellsTarget} 地图分包往返必须保持语义`);
assert.equal(clonedPayload.map.grid.cells.i.buffer === sourceGridBuffer, false, "Worker 快照必须使用独立 buffer");
assert.equal(sourceGridBuffer.byteLength, map.grid.cells.i.byteLength, "正式地图 buffer 不得脱离");
assert.ok(packets > 20, `10k 地图不得退化为少量大包：${packets}`);
assert.ok(maxRecords <= 4096, `单包记录数超限：${maxRecords}`);
assert.ok(yields > 0, "图发现与 buffer 复制必须向主线程让步");
assert.ok(yieldsByPhase.definitions > 0, "节点定义编码阶段必须向浏览器宏任务让步");
assert.ok(eventLoopTicks > 0, "图流编码期间事件循环必须获得执行窗口");

const malformedDecoder = createWorkerGraphDecoder({streamId: "malformed"});
assert.throws(() => malformedDecoder.push({
  protocol: "webgl-generator-worker-graph",
  version: 1,
  streamId: "malformed",
  sequence: 0,
  done: true,
  records: [
    {type: "object", id: 0, prototype: "object"},
    {type: "root", value: {type: "reference", id: 0}},
    {type: "end", nodes: 1, entries: 99},
    {type: "properties", id: 0, entries: [["late", true]]}
  ]
}), error => error?.code === "worker_graph_end_not_last");
assert.throws(() => malformedDecoder.finish(), error => error?.code === "worker_graph_decoder_poisoned");

const malformedMapDecoder = createWorkerGraphDecoder({streamId: "malformed-map"});
assert.throws(() => malformedMapDecoder.push({
  protocol: "webgl-generator-worker-graph",
  version: 1,
  streamId: "malformed-map",
  sequence: 0,
  done: true,
  records: [
    {type: "map", id: 0},
    {type: "map-entries", id: 0, entries: [42]},
    {type: "root", value: {type: "reference", id: 0}},
    {type: "end", nodes: 1, entries: 1}
  ]
}), error => error?.code === "worker_graph_entry_invalid");

const abortController = new AbortController();
let abortYields = 0;
await assert.rejects(async () => {
  for await (const packet of encodeWorkerGraph(map, {
    signal: abortController.signal,
    budgetMs: 1,
    yieldToMain: async () => {
      abortYields += 1;
      abortController.abort("fixture-cancel");
    }
  })) void packet;
}, error => error?.name === "AbortError");
assert.ok(abortYields > 0);

const maxPacketDurationMs = Math.max(...packetDurations);
console.log(JSON.stringify({
  status: "PASS",
  cellsTarget,
  fixturePackets: fixtureClone.packetStats.length,
  numericPackets,
  maxNumericPacketValues,
  smallBufferYields,
  mapPackets: packets,
  maxRecords,
  yields,
  yieldsByPhase,
  eventLoopTicks,
  maxPacketDurationMs: Number(maxPacketDurationMs.toFixed(3))
}, null, 2));
