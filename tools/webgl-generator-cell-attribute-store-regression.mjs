import assert from "node:assert/strict";
import {
  applyCellAttributePatch,
  buildCellAttributeSnapshot,
  collectCellAttributeTextures,
  createCellAttributeStore,
  deleteCellAttributeStore,
  prepareCellAttributePatch,
  restoreCellAttributeStore,
  rollbackCellAttributePatch,
  summarizeCellAttributeStore
} from "../app/webgl-generator/src/renderer/cell-attribute-store.js";

class FakeGl {
  constructor({maxTextureSize = 4} = {}) {
    Object.assign(this, {
      TEXTURE_2D: 0x0de1, MAX_TEXTURE_SIZE: 0x0d33, RGBA32UI: 0x8d70, RGBA_INTEGER: 0x8d99,
      UNSIGNED_INT: 0x1405, RGBA32F: 0x8814, RGBA: 0x1908, FLOAT: 0x1406, RGBA8: 0x8058,
      UNSIGNED_BYTE: 0x1401, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, NEAREST: 0x2600, CLAMP_TO_EDGE: 0x812f
    });
    this.maxTextureSize = maxTextureSize;
    this.textures = [];
    this.boundTexture = null;
    this.subImageCalls = [];
    this.failSubImageAt = 0;
  }

  getParameter(name) { return name === this.MAX_TEXTURE_SIZE ? this.maxTextureSize : null; }
  createTexture() { const texture = {id: this.textures.length + 1, deleted: false, values: null}; this.textures.push(texture); return texture; }
  bindTexture(target, texture) { assert.equal(target, this.TEXTURE_2D); this.boundTexture = texture; }
  texParameteri() {}
  texImage2D(target, level, internalFormat, width, height, border, format, type, source) {
    assert.equal(target, this.TEXTURE_2D); assert.equal(level, 0); assert.equal(border, 0); assert.ok(this.boundTexture);
    Object.assign(this.boundTexture, {internalFormat, width, height, format, type, values: new source.constructor(source)});
  }
  texSubImage2D(target, level, x, y, width, height, format, type, source) {
    assert.equal(target, this.TEXTURE_2D); assert.equal(level, 0); assert.equal(height, 1); assert.ok(this.boundTexture);
    this.subImageCalls.push({texture: this.boundTexture, x, y, width, format, type, source: new source.constructor(source)});
    if (this.failSubImageAt && this.subImageCalls.length === this.failSubImageAt) throw new Error("task335-cell-texture-fault");
    this.boundTexture.values.set(source, (y * this.boundTexture.width + x) * 4);
  }
  deleteTexture(texture) { if (texture.deleted) throw new Error(`double-delete:${texture.id}`); texture.deleted = true; }
}

const map = createMap();
const snapshot = buildCellAttributeSnapshot(map);
assert.equal(snapshot.cellCount, 7);
assert.deepEqual([...snapshot.identities.subarray(0, 8)], [0, 1, 1, 1, 2, 2, 2, 2]);
assert.deepEqual([...snapshot.terrain.subarray(0, 8)], [10, 0, 1, 0, 30, 1, 2, 1]);
assert.deepEqual([...snapshot.numeric.subarray(0, 8)], [0, -2, 10, 0, 5, 3, 20, 1]);
assert.equal(snapshot.palettes.states.length, 16);
assert.deepEqual([...snapshot.palettes.states.subarray(8, 12)], [17, 34, 51, 255]);

const gl = new FakeGl();
const store = createCellAttributeStore(gl, snapshot);
assert.deepEqual(summarizeCellAttributeStore(store), {
  cellCount: 7, width: 3, height: 3,
  identityBytes: 112, terrainBytes: 112, numericBytes: 112,
  paletteBytes: Object.values(snapshot.palettes).reduce((total, palette) => total + palette.byteLength, 0), textureCount: 8
});
assert.equal(collectCellAttributeTextures(store).length, 8);
assert.deepEqual([...store.textures.identities.values.subarray(0, snapshot.identities.length)], [...snapshot.identities]);

const before = cloneArrays(snapshot);
for (const cell of [1, 2, 3, 6]) {
  map.grid.cells.state[cell] = 2;
  map.grid.cells.province[cell] = 2;
  map.grid.cells.biome[cell] = 2;
  map.grid.cells.h[cell] += 7;
  map.grid.cells.pop[cell] += 2.5;
}
const patch = prepareCellAttributePatch(store, map, [6, 2, 1, 3, 2]);
assert.deepEqual([...patch.cells], [1, 2, 3, 6]);
assert.equal(applyCellAttributePatch(gl, patch), true);
assert.equal(applyCellAttributePatch(gl, patch), false);
assert.equal(gl.subImageCalls.length, 9, "四个cell跨三行、三张纹理必须精确拆成9次更新");
assert.deepEqual([...snapshot.identities.subarray(4, 8)], [3, 3, 2, 2]);
assert.equal(snapshot.terrain[4], 37);
assert.equal(snapshot.numeric[4], 7.5);
assert.equal(rollbackCellAttributePatch(gl, patch), true);
assert.equal(rollbackCellAttributePatch(gl, patch), false);
assertArraysEqual(snapshot, before);

const callsBeforeReject = gl.subImageCalls.length;
assert.throws(() => prepareCellAttributePatch(store, map, [-1]), /越界/);
const wrongMap = createMap(); wrongMap.metadata.mapIdentity = "other";
assert.throws(() => prepareCellAttributePatch(store, wrongMap, [1]), /identity/);
assert.equal(gl.subImageCalls.length, callsBeforeReject);

const faultMap = createMap(); faultMap.grid.cells.h[2] = 88;
const faultPatch = prepareCellAttributePatch(store, faultMap, [2]);
const cpuBeforeFault = cloneArrays(snapshot);
const gpuBeforeFault = store.textures.identities.values.slice();
gl.failSubImageAt = gl.subImageCalls.length + 2;
assert.throws(() => applyCellAttributePatch(gl, faultPatch), /task335-cell-texture-fault/);
gl.failSubImageAt = 0;
assertArraysEqual(snapshot, cpuBeforeFault);
assert.deepEqual(store.textures.identities.values, gpuBeforeFault);

const restoredGl = new FakeGl({maxTextureSize: 8});
const restored = restoreCellAttributeStore(restoredGl, snapshot);
assert.deepEqual(summarizeCellAttributeStore(restored), {...summarizeCellAttributeStore(store), width: 3, height: 3});
for (const key of ["identities", "terrain", "numeric"]) assert.deepEqual(restored.textures[key].values.subarray(0, snapshot[key].length), snapshot[key]);

const preserved = new Set(collectCellAttributeTextures(restored));
assert.equal(deleteCellAttributeStore(restoredGl, restored, {preserve: preserved}), 0);
assert.equal(deleteCellAttributeStore(restoredGl, restored), 8);
assert.ok(collectCellAttributeTextures(restored).every(texture => texture.deleted));
assert.throws(() => createCellAttributeStore(new FakeGl({maxTextureSize: 1}), snapshot), /尺寸上限/);

console.log(JSON.stringify({ok: true, cells: snapshot.cellCount, textures: 8, patchRuns: 9, contextRestore: true}));

function createMap() {
  return {
    metadata: {mapIdentity: "task335-cell-attributes"},
    grid: {cells: {
      i: Uint32Array.from([0, 1, 2, 3, 4, 5, 6]), h: Uint8Array.from([10, 30, 40, 50, 60, 70, 80]),
      biome: Uint8Array.from([0, 1, 1, 2, 2, 1, 0]), f: Int16Array.from([0, 1, 1, 1, 2, 2, 0]),
      state: Int16Array.from([-1, 1, 1, 1, 2, 2, 0]), province: Int16Array.from([0, 1, 1, 2, 2, 2, 0]),
      culture: Int16Array.from([0, 1, 1, 1, 2, 2, 0]), religion: Int16Array.from([0, 1, 1, 2, 2, 2, 0]),
      pop: Float32Array.from([0, 5, 7, 8, 9, 4, 0]), temp: Int8Array.from([-2, 3, 4, 5, 6, 7, 8]),
      prec: Uint8Array.from([10, 20, 30, 40, 50, 60, 70]), region: Int16Array.from([0, 1, 1, 2, 2, 3, 3])
    }},
    features: {features: [{land: false}, {land: true}, {land: true}]},
    politics: {states: [{i: 0}, {i: 1, color: "#112233"}, {i: 2, color: "#445566"}], provinces: [{i: 0}, {i: 1, color: "#778899"}, {i: 2, color: "#aabbcc"}]},
    society: {cultures: [{i: 0}, {i: 1, color: "#123456"}, {i: 2, color: "#654321"}], religions: [{i: 0}, {i: 1, color: "#223344"}, {i: 2, color: "#443322"}]},
    climate: {biomes: [{i: 0, color: [0.1, 0.2, 0.3, 1]}, {i: 1, color: [0.3, 0.4, 0.5, 1]}, {i: 2, color: [0.5, 0.6, 0.7, 1]}]},
    layers: {ocean: [0.2, 0.4, 0.6, 1]}, settlements: {metadata: {maxPopulation: 10}}
  };
}

function cloneArrays(snapshot) {
  return {identities: snapshot.identities.slice(), terrain: snapshot.terrain.slice(), numeric: snapshot.numeric.slice()};
}

function assertArraysEqual(snapshot, expected) {
  for (const key of ["identities", "terrain", "numeric"]) assert.deepEqual(snapshot[key], expected[key]);
}
