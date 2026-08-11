import {LABEL_TARGET_KIND} from "../runtime/object-kinds.js";
import {collectLabelLayoutItems} from "./placeholder-renderer.js";

export const LABEL_LAYOUT_DESCRIPTOR_SCHEMA_VERSION = 1;
export const LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE = 10;
const LABEL_LAYOUT_DESCRIPTOR_KINDS = new Set(Object.values(LABEL_TARGET_KIND));

export function buildLabelLayoutDescriptors(map, options = {}) {
  return packLabelLayoutDescriptors(collectLabelLayoutItems(map, options));
}

export function unpackLabelLayoutDescriptors(dto, map = null) {
  const validation = assertLabelDescriptorDto(dto);
  validateLabelDescriptorDto(dto, validation);
  const items = [];
  for (let index = 0; index < dto.count; index++) {
    const offset = index * dto.numericStride;
    const componentStart = dto.componentCellOffsets[index];
    const componentEnd = dto.componentCellOffsets[index + 1];
    const componentCells = Array.from(dto.componentCells.slice(componentStart, componentEnd));
    const item = {
      targetKind: dto.kindTable[dto.kindIndexes[index]],
      targetId: dto.idTypes[index] === 1 ? Number(dto.ids[index]) : dto.ids[index],
      text: dto.texts[index],
      x: dto.numeric[offset],
      y: dto.numeric[offset + 1],
      minScale: dto.numeric[offset + 2],
      priority: dto.numeric[offset + 3],
      rank: dto.numeric[offset + 4],
      rotation: dto.numeric[offset + 5],
      metrics: {width: dto.numeric[offset + 6], height: dto.numeric[offset + 7]},
      anchorCell: dto.numeric[offset + 8] >= 0 ? dto.numeric[offset + 8] : null,
      autoPriority: dto.numeric[offset + 9],
      styleType: dto.styleTypes[index],
      resolvedStyle: structuredClone(dto.styleTable[dto.styleIndexes[index]]),
      layout: {
        key: `${dto.kindTable[dto.kindIndexes[index]]}:${dto.ids[index]}`,
        priority: dto.numeric[offset + 3],
        autoPriority: dto.numeric[offset + 9],
        manualPriority: Boolean(dto.flags[index] & 1),
        locked: Boolean(dto.flags[index] & 2),
        position: {x: dto.numeric[offset], y: dto.numeric[offset + 1]},
        minScale: dto.numeric[offset + 2]
      },
      componentCells,
      componentCellSet: new Set(componentCells),
      placementSource: dto.placementSources[index] || null
    };
    rebindLabelDescriptorObject(item, map);
    assertReboundLabelDescriptorObject(item, map);
    items.push(item);
  }
  return items;
}

export async function unpackLabelLayoutDescriptorsInChunks(dto, map = null, options = {}) {
  const validation = assertLabelDescriptorDto(dto);
  const gate = createLabelChunkGate(options);
  await validateLabelDescriptorDtoInChunks(dto, validation, gate);
  const items = [];
  for (let index = 0; index < dto.count; index++) {
    const offset = index * dto.numericStride;
    const componentStart = dto.componentCellOffsets[index];
    const componentEnd = dto.componentCellOffsets[index + 1];
    const componentCells = [];
    for (let cellIndex = componentStart; cellIndex < componentEnd; cellIndex++) {
      componentCells.push(dto.componentCells[cellIndex]);
      if (((cellIndex - componentStart) & 255) === 255 || cellIndex + 1 === componentEnd) {
        await gate.checkpoint("component-cells", cellIndex - componentStart + 1, componentEnd - componentStart);
      }
    }
    const item = unpackLabelDescriptorItem(dto, index, offset, componentCells);
    rebindLabelDescriptorObject(item, map);
    assertReboundLabelDescriptorObject(item, map);
    items.push(item);
    await gate.checkpoint("labels", index + 1, dto.count);
  }
  gate.assertCurrent();
  return items;
}

function assertLabelDescriptorDto(dto) {
  if (!dto || Number(dto.schemaVersion) !== LABEL_LAYOUT_DESCRIPTOR_SCHEMA_VERSION || Number(dto.numericStride) !== LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE) {
    throw labelDescriptorError("label-descriptor-version", "标签布局 descriptor 版本无效");
  }
  const count = Number(dto.count);
  if (!Number.isSafeInteger(count) || count < 0) throw labelDescriptorError("label-descriptor-shape", "标签 descriptor count 无效");
  assertArray(dto.kindTable, "kindTable");
  assertArray(dto.ids, "ids", count);
  assertArray(dto.texts, "texts", count);
  assertArray(dto.styleTypes, "styleTypes", count);
  assertArray(dto.styleTable, "styleTable");
  assertArray(dto.placementSources, "placementSources", count);
  assertTypedArrayLength(dto.kindIndexes, Uint8Array, count, "kindIndexes");
  assertTypedArrayLength(dto.idTypes, Uint8Array, count, "idTypes");
  assertTypedArrayLength(dto.styleIndexes, Uint16Array, count, "styleIndexes");
  assertTypedArrayLength(dto.numeric, Float64Array, count * LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE, "numeric");
  assertTypedArrayLength(dto.flags, Uint8Array, count, "flags");
  assertTypedArrayLength(dto.componentCellOffsets, Uint32Array, count + 1, "componentCellOffsets");
  assertTypedArray(dto.componentCells, Int32Array, "componentCells");
  if (dto.componentCellOffsets[0] !== 0 || dto.componentCellOffsets[count] !== dto.componentCells.length) {
    throw labelDescriptorError("label-descriptor-shape", "标签 component cell offset 起止无效", {
      expected: dto.componentCells.length,
      actual: dto.componentCellOffsets[count]
    });
  }
  for (let index = 0; index < dto.kindTable.length; index++) {
    if (typeof dto.kindTable[index] !== "string" || !LABEL_LAYOUT_DESCRIPTOR_KINDS.has(dto.kindTable[index])) {
      throw labelDescriptorError("label-descriptor-shape", "标签 kindTable 含不支持的对象类型", {index, kind: dto.kindTable[index]});
    }
  }
  return {count};
}

function validateLabelDescriptorDto(dto, validation) {
  let previous = dto.componentCellOffsets[0];
  for (let index = 0; index < validation.count; index++) {
    validateLabelDescriptorItem(dto, index);
    const current = dto.componentCellOffsets[index + 1];
    if (current < previous) throw labelDescriptorError("label-descriptor-shape", "标签 component cell offset 非单调", {index, previous, current});
    previous = current;
  }
}

async function validateLabelDescriptorDtoInChunks(dto, validation, gate) {
  let previous = dto.componentCellOffsets[0];
  for (let index = 0; index < validation.count; index++) {
    validateLabelDescriptorItem(dto, index);
    const current = dto.componentCellOffsets[index + 1];
    if (current < previous) throw labelDescriptorError("label-descriptor-shape", "标签 component cell offset 非单调", {index, previous, current});
    previous = current;
    await gate.checkpoint("descriptor-shape", index + 1, validation.count);
  }
  gate.assertCurrent();
}

function validateLabelDescriptorItem(dto, index) {
  const kindIndex = dto.kindIndexes[index];
  const styleIndex = dto.styleIndexes[index];
  if (kindIndex >= dto.kindTable.length) {
    throw labelDescriptorError("label-descriptor-shape", "标签 kind index 越界", {index, kindIndex, kindCount: dto.kindTable.length});
  }
  if (styleIndex >= dto.styleTable.length) {
    throw labelDescriptorError("label-descriptor-shape", "标签 style index 越界", {index, styleIndex, styleCount: dto.styleTable.length});
  }
  if (dto.idTypes[index] !== 0 && dto.idTypes[index] !== 1) {
    throw labelDescriptorError("label-descriptor-shape", "标签 id type 无效", {index, idType: dto.idTypes[index]});
  }
  for (const [field, value] of [["ids", dto.ids[index]], ["texts", dto.texts[index]], ["styleTypes", dto.styleTypes[index]], ["placementSources", dto.placementSources[index]]]) {
    if (typeof value !== "string") throw labelDescriptorError("label-descriptor-shape", `标签 ${field} 含非字符串值`, {index});
  }
  const numericOffset = index * LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE;
  for (let valueIndex = numericOffset; valueIndex < numericOffset + LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE; valueIndex++) {
    if (!Number.isFinite(dto.numeric[valueIndex])) {
      throw labelDescriptorError("label-descriptor-shape", "标签 numeric 含非有限值", {index, valueIndex});
    }
  }
}

function assertArray(value, field, length = null) {
  if (!Array.isArray(value) || (length !== null && value.length !== length)) {
    throw labelDescriptorError("label-descriptor-shape", `标签 ${field} 长度无效`, {expected: length, actual: value?.length});
  }
}

function assertTypedArray(value, Type, field) {
  if (!(value instanceof Type)) throw labelDescriptorError("label-descriptor-shape", `标签 ${field} 必须为 ${Type.name}`);
}

function assertTypedArrayLength(value, Type, length, field) {
  assertTypedArray(value, Type, field);
  if (value.length !== length) throw labelDescriptorError("label-descriptor-shape", `标签 ${field} 长度无效`, {expected: length, actual: value.length});
}

function unpackLabelDescriptorItem(dto, index, offset, componentCells) {
  return {
    targetKind: dto.kindTable[dto.kindIndexes[index]],
    targetId: dto.idTypes[index] === 1 ? Number(dto.ids[index]) : dto.ids[index],
    text: dto.texts[index],
    x: dto.numeric[offset],
    y: dto.numeric[offset + 1],
    minScale: dto.numeric[offset + 2],
    priority: dto.numeric[offset + 3],
    rank: dto.numeric[offset + 4],
    rotation: dto.numeric[offset + 5],
    metrics: {width: dto.numeric[offset + 6], height: dto.numeric[offset + 7]},
    anchorCell: dto.numeric[offset + 8] >= 0 ? dto.numeric[offset + 8] : null,
    autoPriority: dto.numeric[offset + 9],
    styleType: dto.styleTypes[index],
    resolvedStyle: structuredClone(dto.styleTable[dto.styleIndexes[index]]),
    layout: {
      key: `${dto.kindTable[dto.kindIndexes[index]]}:${dto.ids[index]}`,
      priority: dto.numeric[offset + 3],
      autoPriority: dto.numeric[offset + 9],
      manualPriority: Boolean(dto.flags[index] & 1),
      locked: Boolean(dto.flags[index] & 2),
      position: {x: dto.numeric[offset], y: dto.numeric[offset + 1]},
      minScale: dto.numeric[offset + 2]
    },
    componentCells,
    componentCellSet: new Set(componentCells),
    placementSource: dto.placementSources[index] || null
  };
}

function packLabelLayoutDescriptors(items) {
  const kindTable = [...new Set(items.map(item => String(item.targetKind)))];
  const kindLookup = new Map(kindTable.map((value, index) => [value, index]));
  const styleTable = [];
  const styleLookup = new Map();
  for (const item of items) {
    const key = JSON.stringify(item.resolvedStyle);
    if (styleLookup.has(key)) continue;
    styleLookup.set(key, styleTable.length);
    styleTable.push(structuredClone(item.resolvedStyle));
  }
  const numeric = new Float64Array(items.length * LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE);
  const flags = new Uint8Array(items.length);
  const componentCellOffsets = new Uint32Array(items.length + 1);
  const componentCells = new Int32Array(items.reduce((sum, item) => sum + (item.componentCells?.length || 0), 0));
  let componentOffset = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const offset = index * LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE;
    numeric.set([
      Number(item.x) || 0,
      Number(item.y) || 0,
      Number(item.minScale) || 0,
      Number(item.layout?.priority ?? item.priority) || 0,
      Number(item.rank) || 0,
      Number(item.rotation) || 0,
      Number(item.metrics?.width) || 0,
      Number(item.metrics?.height) || 0,
      Number.isInteger(Number(item.anchorCell)) ? Number(item.anchorCell) : -1,
      Number(item.layout?.autoPriority ?? item.priority) || 0
    ], offset);
    flags[index] = (item.layout?.manualPriority ? 1 : 0) | (item.layout?.locked ? 2 : 0);
    componentCellOffsets[index] = componentOffset;
    const cells = item.componentCells || [];
    componentCells.set(cells.map(Number), componentOffset);
    componentOffset += cells.length;
  }
  componentCellOffsets[items.length] = componentOffset;
  return {
    schemaVersion: LABEL_LAYOUT_DESCRIPTOR_SCHEMA_VERSION,
    count: items.length,
    numericStride: LABEL_LAYOUT_DESCRIPTOR_NUMERIC_STRIDE,
    kindTable,
    kindIndexes: Uint8Array.from(items.map(item => kindLookup.get(String(item.targetKind)))),
    ids: items.map(item => String(item.targetId)),
    idTypes: Uint8Array.from(items.map(item => typeof item.targetId === "number" ? 1 : 0)),
    texts: items.map(item => String(item.text || "")),
    styleTypes: items.map(item => String(item.styleType || "")),
    styleTable,
    styleIndexes: Uint16Array.from(items.map(item => styleLookup.get(JSON.stringify(item.resolvedStyle)))),
    numeric,
    flags,
    componentCellOffsets,
    componentCells,
    placementSources: items.map(item => String(item.placementSource || ""))
  };
}

function rebindLabelDescriptorObject(item, map) {
  if (!map) return item;
  const id = item.targetId;
  if (item.targetKind === LABEL_TARGET_KIND.CITY) item.city = (map?.settlements?.cities || []).find(value => value && String(value.id) === String(id)) || null;
  if (item.targetKind === LABEL_TARGET_KIND.STATE) item.state = (map?.politics?.states || []).find(value => value && String(value.i ?? value.id) === String(id)) || null;
  if (item.targetKind === LABEL_TARGET_KIND.PROVINCE) item.province = (map?.politics?.provinces || []).find(value => value && String(value.i ?? value.id) === String(id)) || null;
  if (item.targetKind === LABEL_TARGET_KIND.ZONE) item.zone = (map?.zones?.zones || map?.pack?.zones || []).find(value => value && String(value.i ?? value.id) === String(id)) || null;
  if (item.targetKind === LABEL_TARGET_KIND.CUSTOM) item.custom = (map?.labels?.custom || []).find(value => value && String(value.id) === String(id)) || null;
  return item;
}

function assertReboundLabelDescriptorObject(item, map) {
  if (!map) return item;
  const field = {
    [LABEL_TARGET_KIND.CITY]: "city",
    [LABEL_TARGET_KIND.STATE]: "state",
    [LABEL_TARGET_KIND.PROVINCE]: "province",
    [LABEL_TARGET_KIND.ZONE]: "zone",
    [LABEL_TARGET_KIND.CUSTOM]: "custom"
  }[item.targetKind];
  if (!field || !item[field]) {
    throw labelDescriptorError("label-descriptor-rebind-missing", `标签 ${item.targetKind} #${item.targetId} 已不存在`, {
      kind: item.targetKind,
      id: item.targetId
    });
  }
  return item;
}

function createLabelChunkGate(options = {}) {
  const signal = options.signal || null;
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const requestedChunkUnits = Number(options.chunkUnits);
  const chunkUnits = Number.isFinite(requestedChunkUnits) && requestedChunkUnits > 0
    ? Math.max(1, Math.floor(requestedChunkUnits))
    : Number.POSITIVE_INFINITY;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultLabelYield;
  let units = 0;
  let deadline = labelNow() + budgetMs;
  return {checkpoint, assertCurrent};

  async function checkpoint(stage, completed, total) {
    assertCurrent();
    units++;
    const current = labelNow();
    const finished = Number(total) > 0 && Number(completed) >= Number(total);
    const chunkBoundary = units >= chunkUnits;
    const report = finished || chunkBoundary || current >= deadline;
    if (report) options.onProgress?.(stage, {completed, total});
    if (chunkBoundary) {
      units = 0;
      await yieldToMain();
      assertCurrent();
      deadline = labelNow() + budgetMs;
      return;
    }
    if (current < deadline) {
      return;
    }
    units = 0;
    await yieldToMain();
    assertCurrent();
    deadline = labelNow() + budgetMs;
  }

  function assertCurrent() {
    if (!signal?.aborted && (!isCurrent || isCurrent() === true)) return true;
    const error = new Error(signal?.aborted ? "标签 descriptor 回绑已取消" : "标签 descriptor 回绑结果已过期");
    error.name = signal?.aborted ? "AbortError" : "Error";
    error.code = signal?.aborted ? "label-descriptor-rebind-aborted" : "label-descriptor-rebind-obsolete";
    throw error;
  }
}

function defaultLabelYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function labelNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function labelDescriptorError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
