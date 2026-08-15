import {colorForCell} from "./color-modes.js";

export const CELL_ATTRIBUTE_CHANNELS = 4;
export const CELL_ATTRIBUTE_PALETTE_MODES = Object.freeze(["states", "provinces", "biomes", "cultures", "religions"]);
const cellTextures = new WeakSet();
const cellAttributeStoreOwners = new WeakMap();

export function buildCellAttributeSnapshot(map) {
  const cells = map?.grid?.cells;
  const cellCount = Number(cells?.i?.length || cells?.h?.length || 0);
  if (!Number.isInteger(cellCount) || cellCount < 1) throw new TypeError("cell attribute store 缺少有效地图 cells");
  const identities = new Uint32Array(cellCount * CELL_ATTRIBUTE_CHANNELS);
  const terrain = new Uint32Array(cellCount * CELL_ATTRIBUTE_CHANNELS);
  const numeric = new Float32Array(cellCount * CELL_ATTRIBUTE_CHANNELS);
  for (let cell = 0; cell < cellCount; cell++) writeCellAttributes(map, cell, identities, terrain, numeric, cell * CELL_ATTRIBUTE_CHANNELS);
  const palettes = Object.fromEntries(CELL_ATTRIBUTE_PALETTE_MODES.map(mode => [mode, buildPalette(map, mode, cellCount)]));
  return Object.freeze({mapIdentity: String(map.metadata?.mapIdentity || map.metadata?.id || ""), cellCount, identities, terrain, numeric, palettes: Object.freeze(palettes)});
}

export function createCellAttributeStore(gl, mapOrSnapshot) {
  const snapshot = mapOrSnapshot?.identities instanceof Uint32Array ? assertSnapshot(mapOrSnapshot) : buildCellAttributeSnapshot(mapOrSnapshot);
  const layout = textureLayout(gl, snapshot.cellCount);
  const textures = {};
  try {
    textures.identities = uploadTexture(gl, snapshot.identities, layout, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT);
    textures.terrain = uploadTexture(gl, snapshot.terrain, layout, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT);
    textures.numeric = uploadTexture(gl, snapshot.numeric, layout, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    textures.palettes = Object.fromEntries(CELL_ATTRIBUTE_PALETTE_MODES.map(mode => {
      const palette = snapshot.palettes[mode];
      return [mode, uploadTexture(gl, palette, {width: palette.length / 4, height: 1, texelCount: palette.length / 4}, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)];
    }));
    return Object.freeze({snapshot, layout: Object.freeze(layout), textures: Object.freeze({...textures, palettes: Object.freeze(textures.palettes)})});
  } catch (error) {
    deleteTextures(gl, collectTextures(textures));
    throw error;
  }
}

export function restoreCellAttributeStore(gl, snapshot) {
  return createCellAttributeStore(gl, assertSnapshot(snapshot));
}

export function prepareCellAttributePatch(store, map, changedCells) {
  const current = assertStore(store);
  const cells = [...new Set((changedCells || []).map(Number))].sort((left, right) => left - right);
  if (!cells.length) throw new RangeError("cell attribute patch 不能为空");
  if (cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= current.snapshot.cellCount)) throw new RangeError("cell attribute patch 包含越界 cell");
  if (String(map?.metadata?.mapIdentity || map?.metadata?.id || "") !== current.snapshot.mapIdentity) throw new Error("cell attribute patch 地图 identity 已变化");
  const before = captureCells(current.snapshot, cells);
  const after = createPatchValues(map, cells);
  return Object.freeze({store: current, map, cells: Uint32Array.from(cells), before, after, applied: {value: false}});
}

export function applyCellAttributePatch(gl, patch) {
  return writeCellAttributePatch(gl, patch, patch.after, true);
}

export function rollbackCellAttributePatch(gl, patch) {
  return writeCellAttributePatch(gl, patch, patch.before, false);
}

export function deleteCellAttributeStore(gl, store, {preserve = null} = {}) {
  if (!store) return 0;
  const protectedTextures = preserve instanceof Set ? preserve : new Set(collectCellAttributeTextures(preserve));
  const textures = collectCellAttributeTextures(store).filter(texture => !protectedTextures.has(texture));
  deleteTextures(gl, textures);
  return textures.length;
}

export function retainCellAttributeStore(store) {
  if (!store) return 0;
  assertStore(store);
  const owners = (cellAttributeStoreOwners.get(store) || 0) + 1;
  cellAttributeStoreOwners.set(store, owners);
  return owners;
}

export function releaseCellAttributeStore(store) {
  if (!store) return 0;
  const owners = Math.max(0, (cellAttributeStoreOwners.get(store) || 0) - 1);
  if (owners) cellAttributeStoreOwners.set(store, owners);
  else cellAttributeStoreOwners.delete(store);
  return owners;
}

export function deleteUnownedCellAttributeStore(gl, store, currentStore = null) {
  if (!store || store === currentStore || (cellAttributeStoreOwners.get(store) || 0) > 0) return 0;
  return deleteCellAttributeStore(gl, store, {preserve: currentStore});
}

export function collectCellAttributeTextures(store) {
  return collectTextures(store?.textures || {});
}

export function summarizeCellAttributeStore(store) {
  const current = assertStore(store);
  const paletteBytes = CELL_ATTRIBUTE_PALETTE_MODES.reduce((total, mode) => total + current.snapshot.palettes[mode].byteLength, 0);
  return {
    cellCount: current.snapshot.cellCount,
    width: current.layout.width,
    height: current.layout.height,
    identityBytes: current.snapshot.identities.byteLength,
    terrainBytes: current.snapshot.terrain.byteLength,
    numericBytes: current.snapshot.numeric.byteLength,
    paletteBytes,
    textureCount: collectCellAttributeTextures(current).length
  };
}

function writeCellAttributePatch(gl, patch, values, applied) {
  const store = assertStore(patch?.store);
  if (patch.applied.value === applied) return false;
  if (applied && patch.applied.value) throw new Error("cell attribute patch 已应用");
  if (!applied && !patch.applied.value) return false;
  const fallback = applied ? patch.before : patch.after;
  try {
    uploadPatchValues(gl, store, patch.cells, values);
  } catch (error) {
    try { uploadPatchValues(gl, store, patch.cells, fallback); } catch {}
    throw error;
  }
  writePatchArrays(store.snapshot, patch.cells, values);
  patch.applied.value = applied;
  return true;
}

function uploadPatchValues(gl, store, cells, values) {
  for (const [key, format, type] of [
    ["identities", gl.RGBA_INTEGER, gl.UNSIGNED_INT],
    ["terrain", gl.RGBA_INTEGER, gl.UNSIGNED_INT],
    ["numeric", gl.RGBA, gl.FLOAT]
  ]) uploadPatchRuns(gl, store.textures[key], store.layout, cells, values[key], format, type);
}

function uploadPatchRuns(gl, texture, layout, cells, values, format, type) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  let valueOffset = 0;
  for (const run of textureRuns(cells, layout.width)) {
    const length = run.endIndex - run.startIndex;
    const source = values.subarray(valueOffset * CELL_ATTRIBUTE_CHANNELS, (valueOffset + length) * CELL_ATTRIBUTE_CHANNELS);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, run.x, run.y, length, 1, format, type, source);
    valueOffset += length;
  }
}

function textureRuns(cells, width) {
  const runs = [];
  let startIndex = 0;
  while (startIndex < cells.length) {
    const first = cells[startIndex];
    const y = Math.floor(first / width);
    let endIndex = startIndex + 1;
    while (endIndex < cells.length && cells[endIndex] === cells[endIndex - 1] + 1 && Math.floor(cells[endIndex] / width) === y) endIndex++;
    runs.push({startIndex, endIndex, x: first % width, y});
    startIndex = endIndex;
  }
  return runs;
}

function captureCells(snapshot, cells) {
  const result = {identities: new Uint32Array(cells.length * 4), terrain: new Uint32Array(cells.length * 4), numeric: new Float32Array(cells.length * 4)};
  for (let index = 0; index < cells.length; index++) {
    const sourceOffset = cells[index] * 4;
    const targetOffset = index * 4;
    result.identities.set(snapshot.identities.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    result.terrain.set(snapshot.terrain.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    result.numeric.set(snapshot.numeric.subarray(sourceOffset, sourceOffset + 4), targetOffset);
  }
  return Object.freeze(result);
}

function createPatchValues(map, cells) {
  const result = {identities: new Uint32Array(cells.length * 4), terrain: new Uint32Array(cells.length * 4), numeric: new Float32Array(cells.length * 4)};
  for (let index = 0; index < cells.length; index++) writeCellAttributes(map, cells[index], result.identities, result.terrain, result.numeric, index * 4);
  return Object.freeze(result);
}

function writePatchArrays(snapshot, cells, values) {
  for (let index = 0; index < cells.length; index++) {
    const targetOffset = cells[index] * 4;
    const sourceOffset = index * 4;
    snapshot.identities.set(values.identities.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    snapshot.terrain.set(values.terrain.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    snapshot.numeric.set(values.numeric.subarray(sourceOffset, sourceOffset + 4), targetOffset);
  }
}

function writeCellAttributes(map, cell, identities, terrain, numeric, offset) {
  const cells = map.grid.cells;
  identities.set([
    encodeSignedId(cells.state?.[cell]), encodeSignedId(cells.province?.[cell]),
    encodeSignedId(cells.culture?.[cell]), encodeSignedId(cells.religion?.[cell])
  ], offset);
  const feature = Number(cells.f?.[cell]);
  const land = Boolean(map.features?.features?.[feature]?.land) || Number(cells.h?.[cell]) >= 20;
  terrain.set([toUint(cells.h?.[cell]), toUint(cells.biome?.[cell]), encodeSignedId(feature), land ? 1 : 0], offset);
  numeric.set([
    finite(cells.pop?.[cell]), finite(cells.temp?.[cell]), finite(cells.prec?.[cell]), finite(cells.region?.[cell])
  ], offset);
}

function buildPalette(map, mode, cellCount) {
  const field = ({states: "state", provinces: "province", biomes: "biome", cultures: "culture", religions: "religion"})[mode];
  const ids = map.grid.cells[field] || [];
  let maxId = 0;
  const representative = new Map();
  for (let cell = 0; cell < cellCount; cell++) {
    const id = Number(ids[cell]);
    if (!Number.isInteger(id)) continue;
    maxId = Math.max(maxId, id);
    if (!representative.has(id)) representative.set(id, cell);
  }
  const palette = new Uint8Array((maxId + 2) * 4);
  for (let id = -1; id <= maxId; id++) {
    const cell = representative.get(id);
    const color = cell === undefined ? [0.5, 0.5, 0.5, 1] : colorForCell(cell, map, mode);
    for (let channel = 0; channel < 4; channel++) palette[(id + 1) * 4 + channel] = colorByte(color[channel]);
  }
  return palette;
}

function uploadTexture(gl, source, layout, internalFormat, format, type) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("无法创建 cell attribute texture");
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const padded = source.length === layout.width * layout.height * 4 ? source : padTextureSource(source, layout.width * layout.height * 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, layout.width, layout.height, 0, format, type, padded);
    cellTextures.add(texture);
    return texture;
  } catch (error) {
    gl.deleteTexture?.(texture);
    throw error;
  }
}

function padTextureSource(source, length) {
  const padded = new source.constructor(length);
  padded.set(source);
  return padded;
}

function textureLayout(gl, cellCount) {
  const maxSize = Math.max(1, Number(gl.getParameter?.(gl.MAX_TEXTURE_SIZE)) || 2048);
  const width = Math.min(maxSize, Math.max(1, Math.ceil(Math.sqrt(cellCount))));
  const height = Math.ceil(cellCount / width);
  if (height > maxSize) throw new RangeError("cell attribute texture 超出 WebGL2 尺寸上限");
  return {width, height, texelCount: width * height};
}

function assertSnapshot(snapshot) {
  const length = Number(snapshot?.cellCount) * 4;
  if (!Number.isInteger(snapshot?.cellCount) || snapshot.cellCount < 1
    || !(snapshot.identities instanceof Uint32Array) || snapshot.identities.length !== length
    || !(snapshot.terrain instanceof Uint32Array) || snapshot.terrain.length !== length
    || !(snapshot.numeric instanceof Float32Array) || snapshot.numeric.length !== length
    || CELL_ATTRIBUTE_PALETTE_MODES.some(mode => !(snapshot.palettes?.[mode] instanceof Uint8Array) || snapshot.palettes[mode].length < 4 || snapshot.palettes[mode].length % 4)) {
    throw new TypeError("cell attribute snapshot 结构无效");
  }
  return snapshot;
}

function assertStore(store) {
  if (!store?.layout || !store?.textures) throw new TypeError("cell attribute store 结构无效");
  assertSnapshot(store.snapshot);
  if (collectCellAttributeTextures(store).length !== 8) throw new TypeError("cell attribute store texture 不完整");
  return store;
}

function collectTextures(value) {
  const seen = new Set();
  const result = [];
  const visit = current => {
    if (!current || typeof current !== "object") return;
    if (cellTextures.has(current)) {
      if (!seen.has(current)) { seen.add(current); result.push(current); }
      return;
    }
    for (const nested of Object.values(current)) visit(nested);
  };
  visit(value);
  return result;
}

function deleteTextures(gl, textures) {
  for (const texture of new Set(textures || [])) gl?.deleteTexture?.(texture);
}

function encodeSignedId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id >= -1 ? id + 1 : 1;
}

function toUint(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) >>> 0 : 0;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function colorByte(value) {
  return Math.max(0, Math.min(255, Math.round((Number(value) || 0) * 255)));
}
