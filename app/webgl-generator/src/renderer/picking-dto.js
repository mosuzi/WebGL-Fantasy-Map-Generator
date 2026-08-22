import {buildObjectPickingIndex, OBJECT_PICKING_COMPONENTS, riverPickingPoints} from "./picking.js";
import {assertCacheBinding} from "./render-cache-dto.js";
import {markerPresentationRecords} from "../domains/markers/presentation.js";
import {normalizeRenderResourceBinding} from "./render-resource-binding.js";

export const PICKING_DTO_SCHEMA_VERSION = 1;

export function buildObjectPickingDto(map, binding = {}, components = null) {
  return packObjectPickingIndex(buildObjectPickingIndex(map, {components}), binding);
}

export function rebuildObjectPickingIndexFromDto(dto, map, expectedBinding = null) {
  const validation = assertPickingDtoShape(dto, expectedBinding);
  const rebuilt = buildObjectPickingIndex(map, {components: validation.components});
  for (const field of ["bucketSize", "columns", "rows"]) {
    if (rebuilt[field] !== dto[field]) {
      throw pickingDtoError("picking-dto-shape", `picking ${field} 与地图重建结果不一致`, {expected: dto[field], actual: rebuilt[field]});
    }
  }
  for (const field of ["bucketCount", "cityCount", "markerCount", "militaryCount", "routeSegmentCount", "riverSegmentCount", "maxBucketItems"]) {
    if (rebuilt[field] !== dto.stats[field]) {
      throw pickingDtoError("picking-dto-shape", `picking stats.${field} 与地图重建结果不一致`, {expected: dto.stats[field], actual: rebuilt[field]});
    }
  }
  return rebuilt;
}

export function packObjectPickingIndex(index, binding = {}) {
  const bucketEntries = [...(index?.buckets || new Map()).entries()].sort((left, right) => left[0] - right[0]);
  return {
    schemaVersion: PICKING_DTO_SCHEMA_VERSION,
    binding: normalizeBinding(binding),
    components: normalizePickingComponents(index?.components),
    bucketSize: Number(index?.bucketSize) || 1,
    columns: Number(index?.columns) || 1,
    rows: Number(index?.rows) || 1,
    bucketIds: Uint32Array.from(bucketEntries.map(([id]) => id)),
    cities: packPointReferences(bucketEntries, "cities", item => item?.id),
    markers: packPointReferences(bucketEntries, "markers", item => item?.id),
    military: packPointReferences(bucketEntries, "military", item => item?.id ?? `${item?.state ?? item?.stateId}:${item?.i}`),
    routeSegments: packSegmentReferences(bucketEntries, "routeSegments", segment => segment?.route?.id),
    riverSegments: packSegmentReferences(bucketEntries, "riverSegments", segment => segment?.river?.id ?? segment?.river?.i),
    stats: {
      bucketCount: Number(index?.bucketCount) || 0,
      cityCount: Number(index?.cityCount) || 0,
      markerCount: Number(index?.markerCount) || 0,
      militaryCount: Number(index?.militaryCount) || 0,
      routeSegmentCount: Number(index?.routeSegmentCount) || 0,
      riverSegmentCount: Number(index?.riverSegmentCount) || 0,
      maxBucketItems: Number(index?.maxBucketItems) || 0
    }
  };
}

export function rebindObjectPickingDto(dto, map, expectedBinding = null) {
  const validation = assertPickingDtoShape(dto, expectedBinding);
  validatePickingDto(dto, validation);
  const objects = canonicalPickingObjects(map);
  const buckets = new Map();
  for (let bucketIndex = 0; bucketIndex < dto.bucketIds.length; bucketIndex++) {
    const bucket = {cities: [], markers: [], military: [], routeSegments: [], riverSegments: []};
    rebindPointReferences(bucket.cities, dto.cities, bucketIndex, objects.cities, "city");
    rebindPointReferences(bucket.markers, dto.markers, bucketIndex, objects.markers, "marker");
    rebindPointReferences(bucket.military, dto.military, bucketIndex, objects.military, "military");
    rebindSegmentReferences(bucket.routeSegments, dto.routeSegments, bucketIndex, objects.routes, route => route.points || [], "route");
    rebindSegmentReferences(bucket.riverSegments, dto.riverSegments, bucketIndex, objects.rivers, riverPickingPoints, "river");
    buckets.set(dto.bucketIds[bucketIndex], bucket);
  }
  return {
    bucketSize: dto.bucketSize,
    columns: dto.columns,
    rows: dto.rows,
    buckets,
    components: validation.components,
    ...dto.stats
  };
}

export async function rebindObjectPickingDtoInChunks(dto, map, expectedBinding = null, options = {}) {
  const validation = assertPickingDtoShape(dto, expectedBinding);
  const objects = canonicalPickingObjects(map);
  const buckets = new Map();
  const gate = createPickingChunkGate(options);
  assertPointReferenceCounts(dto);
  for (const entry of validation.entries) validatePackedIdTable(entry);
  let previousBucket = -1;
  let maxBucketItems = 0;
  const routeSegments = createSegmentReferenceTracker();
  const riverSegments = createSegmentReferenceTracker();
  for (let bucketIndex = 0; bucketIndex < dto.bucketIds.length; bucketIndex++) {
    const bucketId = dto.bucketIds[bucketIndex];
    validateBucketId(bucketId, previousBucket, validation.maxBucketId, bucketIndex);
    previousBucket = bucketId;
    for (const entry of validation.entries) validatePackedBucketRange(entry, bucketIndex);
    const bucket = {cities: [], markers: [], military: [], routeSegments: [], riverSegments: []};
    await rebindPointReferencesInChunks(bucket.cities, dto.cities, bucketIndex, objects.cities, "city", gate);
    await rebindPointReferencesInChunks(bucket.markers, dto.markers, bucketIndex, objects.markers, "marker", gate);
    await rebindPointReferencesInChunks(bucket.military, dto.military, bucketIndex, objects.military, "military", gate);
    await rebindSegmentReferencesInChunks(bucket.routeSegments, dto.routeSegments, bucketIndex, objects.routes, route => route.points || [], "route", routeSegments, gate);
    await rebindSegmentReferencesInChunks(bucket.riverSegments, dto.riverSegments, bucketIndex, objects.rivers, riverPickingPoints, "river", riverSegments, gate);
    maxBucketItems = Math.max(maxBucketItems, bucket.cities.length + bucket.markers.length + bucket.military.length + bucket.routeSegments.length + bucket.riverSegments.length);
    buckets.set(bucketId, bucket);
    const pending = gate.checkpoint(bucketIndex + 1, dto.bucketIds.length);
    if (pending) await pending;
  }
  if (maxBucketItems !== dto.stats.maxBucketItems) {
    throw pickingDtoError("picking-dto-shape", "picking maxBucketItems 与 bucket 内容不一致", {expected: maxBucketItems, actual: dto.stats.maxBucketItems});
  }
  assertReboundUniqueSegmentCount(routeSegments, dto.stats.routeSegmentCount, "route");
  assertReboundUniqueSegmentCount(riverSegments, dto.stats.riverSegmentCount, "river");
  gate.assertCurrent();
  return {
    bucketSize: dto.bucketSize,
    columns: dto.columns,
    rows: dto.rows,
    buckets,
    components: validation.components,
    ...dto.stats
  };
}

export function assertPickingDto(dto, expectedBinding = null) {
  const validation = assertPickingDtoShape(dto, expectedBinding);
  validatePickingDto(dto, validation);
  return dto;
}

function assertPickingDtoShape(dto, expectedBinding = null) {
  if (!dto || Number(dto.schemaVersion) !== PICKING_DTO_SCHEMA_VERSION) throw pickingDtoError("picking-dto-version", "picking DTO 版本无效");
  if (expectedBinding !== null && expectedBinding !== undefined) {
    assertCacheBinding({...dto, schemaVersion: 1}, expectedBinding, "picking");
  }
  if (!Number.isFinite(dto.bucketSize) || dto.bucketSize <= 0) throw pickingDtoError("picking-dto-shape", "picking bucketSize 无效");
  if (!Number.isSafeInteger(dto.columns) || dto.columns <= 0 || !Number.isSafeInteger(dto.rows) || dto.rows <= 0) {
    throw pickingDtoError("picking-dto-shape", "picking 网格尺寸无效");
  }
  assertTypedArray(dto.bucketIds, Uint32Array, "bucketIds");
  const components = normalizePickingComponents(dto.components);
  const bucketCount = dto.bucketIds.length;
  const entries = [
    assertPackedPointReferences(dto.cities, bucketCount, "cities"),
    assertPackedPointReferences(dto.markers, bucketCount, "markers"),
    assertPackedPointReferences(dto.military, bucketCount, "military"),
    assertPackedSegmentReferences(dto.routeSegments, bucketCount, "route"),
    assertPackedSegmentReferences(dto.riverSegments, bucketCount, "river")
  ];
  if (!dto.stats || typeof dto.stats !== "object" || Array.isArray(dto.stats)) {
    throw pickingDtoError("picking-dto-shape", "picking stats 结构无效");
  }
  for (const field of ["bucketCount", "cityCount", "markerCount", "militaryCount", "routeSegmentCount", "riverSegmentCount", "maxBucketItems"]) {
    if (!Number.isSafeInteger(dto.stats[field]) || dto.stats[field] < 0) {
      throw pickingDtoError("picking-dto-shape", `picking stats.${field} 无效`);
    }
  }
  if (dto.stats.bucketCount !== bucketCount) {
    throw pickingDtoError("picking-dto-shape", "picking bucketCount 与 bucketIds 不一致", {expected: bucketCount, actual: dto.stats.bucketCount});
  }
  return {entries, bucketCount, maxBucketId: dto.columns * dto.rows, components};
}

function normalizePickingComponents(components) {
  if (components === undefined || components === null) return [...OBJECT_PICKING_COMPONENTS];
  if (!Array.isArray(components) || !components.length) throw pickingDtoError("picking-dto-shape", "picking components 无效");
  const requested = new Set(components.map(String));
  if (requested.size !== components.length || [...requested].some(component => !OBJECT_PICKING_COMPONENTS.includes(component))) {
    throw pickingDtoError("picking-dto-shape", "picking components 含重复或未知对象族");
  }
  return OBJECT_PICKING_COMPONENTS.filter(component => requested.has(component));
}

function assertPackedPointReferences(packed, bucketCount, kind) {
  return assertPackedReferences(packed, bucketCount, kind, false);
}

function assertPackedSegmentReferences(packed, bucketCount, kind) {
  const entry = assertPackedReferences(packed, bucketCount, kind, true);
  assertTypedArrayLength(packed.segments, Int32Array, packed.idIndexes.length, `${kind}.segments`);
  return entry;
}

function assertPackedReferences(packed, bucketCount, kind, segment) {
  if (!packed || typeof packed !== "object" || packed.kind !== kind) {
    throw pickingDtoError("picking-dto-shape", `picking ${kind} 引用结构无效`);
  }
  if (!Array.isArray(packed.idTable)) throw pickingDtoError("picking-dto-shape", `picking ${kind}.idTable 无效`);
  assertTypedArray(packed.idIndexes, Uint32Array, `${kind}.idIndexes`);
  assertTypedArrayLength(packed.offsets, Uint32Array, bucketCount + 1, `${kind}.offsets`);
  if (packed.offsets[0] !== 0 || packed.offsets[bucketCount] !== packed.idIndexes.length) {
    throw pickingDtoError("picking-dto-shape", `picking ${kind}.offsets 起止无效`, {
      expected: packed.idIndexes.length,
      actual: packed.offsets[bucketCount]
    });
  }
  return {packed, kind, segment};
}

function validatePickingDto(dto, validation) {
  validateBucketIds(dto.bucketIds, validation.maxBucketId);
  for (const entry of validation.entries) validatePackedReferences(entry);
  validatePickingStats(dto);
}

async function validatePickingDtoInChunks(dto, validation, gate) {
  let completed = 0;
  const total = dto.bucketIds.length + validation.entries.reduce((sum, entry) => (
    sum + entry.packed.offsets.length + entry.packed.idTable.length + entry.packed.idIndexes.length
  ), 0);
  let previousBucket = -1;
  for (let index = 0; index < dto.bucketIds.length; index++) {
    const bucketId = dto.bucketIds[index];
    validateBucketId(bucketId, previousBucket, validation.maxBucketId, index);
    previousBucket = bucketId;
    const pending = gate.checkpoint(++completed, total);
    if (pending) await pending;
  }
  for (const entry of validation.entries) {
    let previous = entry.packed.offsets[0];
    for (let index = 1; index < entry.packed.offsets.length; index++) {
      const current = entry.packed.offsets[index];
      if (current < previous) throw pickingDtoError("picking-dto-shape", `picking ${entry.kind}.offsets 非单调`, {index, previous, current});
      previous = current;
      const pending = gate.checkpoint(++completed, total);
      if (pending) await pending;
    }
    for (let index = 0; index < entry.packed.idTable.length; index++) {
      if (typeof entry.packed.idTable[index] !== "string") {
        throw pickingDtoError("picking-dto-shape", `picking ${entry.kind}.idTable 含非字符串 ID`, {index});
      }
      const pending = gate.checkpoint(++completed, total);
      if (pending) await pending;
    }
    for (let index = 0; index < entry.packed.idIndexes.length; index++) {
      validatePackedReferenceIndex(entry, index);
      const pending = gate.checkpoint(++completed, total);
      if (pending) await pending;
    }
  }
  await validatePickingStatsInChunks(dto, gate);
  gate.assertCurrent();
}

function validateBucketIds(bucketIds, maxBucketId) {
  let previous = -1;
  for (let index = 0; index < bucketIds.length; index++) {
    const bucketId = bucketIds[index];
    validateBucketId(bucketId, previous, maxBucketId, index);
    previous = bucketId;
  }
}

function validateBucketId(bucketId, previous, maxBucketId, index) {
  if (bucketId >= maxBucketId || bucketId <= previous) {
    throw pickingDtoError("picking-dto-shape", "picking bucket ID 越界或非严格递增", {index, bucketId, previous, maxBucketId});
  }
}

function validatePackedReferences(entry) {
  let previous = entry.packed.offsets[0];
  for (let index = 1; index < entry.packed.offsets.length; index++) {
    const current = entry.packed.offsets[index];
    if (current < previous) throw pickingDtoError("picking-dto-shape", `picking ${entry.kind}.offsets 非单调`, {index, previous, current});
    previous = current;
  }
  for (let index = 0; index < entry.packed.idTable.length; index++) {
    if (typeof entry.packed.idTable[index] !== "string") {
      throw pickingDtoError("picking-dto-shape", `picking ${entry.kind}.idTable 含非字符串 ID`, {index});
    }
  }
  for (let index = 0; index < entry.packed.idIndexes.length; index++) validatePackedReferenceIndex(entry, index);
}

function validatePackedReferenceIndex(entry, index) {
  const idIndex = entry.packed.idIndexes[index];
  if (idIndex >= entry.packed.idTable.length) {
    throw pickingDtoError("picking-dto-shape", `picking ${entry.kind} ID index 越界`, {index, idIndex, idCount: entry.packed.idTable.length});
  }
  if (entry.segment && entry.packed.segments[index] < 0) {
    throw pickingDtoError("picking-dto-shape", `picking ${entry.kind} segment index 无效`, {index, segment: entry.packed.segments[index]});
  }
}

function validatePickingStats(dto) {
  assertPointReferenceCounts(dto);
  let maxBucketItems = 0;
  for (let bucketIndex = 0; bucketIndex < dto.bucketIds.length; bucketIndex++) {
    maxBucketItems = Math.max(maxBucketItems, countBucketReferences(dto, bucketIndex));
  }
  if (maxBucketItems !== dto.stats.maxBucketItems) {
    throw pickingDtoError("picking-dto-shape", "picking maxBucketItems 与 bucket 内容不一致", {expected: maxBucketItems, actual: dto.stats.maxBucketItems});
  }
  assertUniqueSegmentCount(dto.routeSegments, dto.stats.routeSegmentCount, "route");
  assertUniqueSegmentCount(dto.riverSegments, dto.stats.riverSegmentCount, "river");
}

async function validatePickingStatsInChunks(dto, gate) {
  assertPointReferenceCounts(dto);
  let maxBucketItems = 0;
  for (let bucketIndex = 0; bucketIndex < dto.bucketIds.length; bucketIndex++) {
    maxBucketItems = Math.max(maxBucketItems, countBucketReferences(dto, bucketIndex));
    const pending = gate.checkpoint(bucketIndex + 1, dto.bucketIds.length);
    if (pending) await pending;
  }
  if (maxBucketItems !== dto.stats.maxBucketItems) {
    throw pickingDtoError("picking-dto-shape", "picking maxBucketItems 与 bucket 内容不一致", {expected: maxBucketItems, actual: dto.stats.maxBucketItems});
  }
  await assertUniqueSegmentCountInChunks(dto.routeSegments, dto.stats.routeSegmentCount, "route", gate);
  await assertUniqueSegmentCountInChunks(dto.riverSegments, dto.stats.riverSegmentCount, "river", gate);
}

function assertPointReferenceCounts(dto) {
  for (const [field, expected] of [["cities", dto.stats.cityCount], ["markers", dto.stats.markerCount], ["military", dto.stats.militaryCount]]) {
    const actual = dto[field].idIndexes.length;
    if (actual !== expected) {
      throw pickingDtoError("picking-dto-shape", `picking ${field} 引用数与 stats 不一致`, {expected, actual});
    }
  }
}

function countBucketReferences(dto, bucketIndex) {
  let count = 0;
  for (const field of ["cities", "markers", "military", "routeSegments", "riverSegments"]) {
    count += dto[field].offsets[bucketIndex + 1] - dto[field].offsets[bucketIndex];
  }
  return count;
}

function assertUniqueSegmentCount(packed, expected, kind) {
  const unique = new Set();
  for (let index = 0; index < packed.idIndexes.length; index++) unique.add(`${packed.idIndexes[index]}:${packed.segments[index]}`);
  if (unique.size !== expected) {
    throw pickingDtoError("picking-dto-shape", `picking ${kind} segment 统计与唯一引用不一致`, {expected, actual: unique.size});
  }
}

async function assertUniqueSegmentCountInChunks(packed, expected, kind, gate) {
  const unique = new Set();
  for (let index = 0; index < packed.idIndexes.length; index++) {
    unique.add(`${packed.idIndexes[index]}:${packed.segments[index]}`);
    const pending = gate.checkpoint(index + 1, packed.idIndexes.length);
    if (pending) await pending;
  }
  if (unique.size !== expected) {
    throw pickingDtoError("picking-dto-shape", `picking ${kind} segment 统计与唯一引用不一致`, {expected, actual: unique.size});
  }
}

function assertTypedArray(value, Type, field) {
  if (!(value instanceof Type)) throw pickingDtoError("picking-dto-shape", `picking ${field} 必须为 ${Type.name}`);
}

function assertTypedArrayLength(value, Type, length, field) {
  assertTypedArray(value, Type, field);
  if (value.length !== length) throw pickingDtoError("picking-dto-shape", `picking ${field} 长度无效`, {expected: length, actual: value.length});
}

function packPointReferences(bucketEntries, key, getId) {
  const lists = bucketEntries.map(([, bucket]) => bucket?.[key] || []);
  const offsets = offsetsForLengths(lists.map(list => list.length));
  const idTable = uniqueIdTable(lists.flat().map(getId));
  const idIndexes = new Uint32Array(offsets.at(-1));
  const idLookup = new Map(idTable.map((id, index) => [id, index]));
  let offset = 0;
  for (const list of lists) {
    for (const item of list) idIndexes[offset++] = idLookup.get(String(getId(item)));
  }
  return {kind: key, offsets, idTable, idIndexes};
}

function packSegmentReferences(bucketEntries, key, getId) {
  const lists = bucketEntries.map(([, bucket]) => bucket?.[key] || []);
  const offsets = offsetsForLengths(lists.map(list => list.length));
  const idTable = uniqueIdTable(lists.flat().map(getId));
  const idIndexes = new Uint32Array(offsets.at(-1));
  const segments = new Int32Array(offsets.at(-1));
  const idLookup = new Map(idTable.map((id, index) => [id, index]));
  let offset = 0;
  for (const list of lists) {
    for (const segment of list) {
      idIndexes[offset] = idLookup.get(String(getId(segment)));
      segments[offset] = Number(segment?.index) || 0;
      offset++;
    }
  }
  return {kind: key === "routeSegments" ? "route" : "river", offsets, idTable, idIndexes, segments};
}

function rebindPointReferences(target, packed, bucketIndex, objects, kind, validateIndexes = false) {
  for (let index = packed.offsets[bucketIndex]; index < packed.offsets[bucketIndex + 1]; index++) {
    if (validateIndexes) validatePackedReferenceIndex({packed, kind, segment: false}, index);
    const id = packed.idTable[packed.idIndexes[index]];
    const object = objects.get(id);
    if (!object) throw pickingDtoError("picking-rebind-missing", `picking ${kind} #${id} 已不存在`, {kind, id});
    target.push(object);
  }
}

function rebindSegmentReferences(target, packed, bucketIndex, objects, getPoints, kind, unique = null, validateIndexes = false) {
  for (let index = packed.offsets[bucketIndex]; index < packed.offsets[bucketIndex + 1]; index++) {
    if (validateIndexes) validatePackedReferenceIndex({packed, kind, segment: true}, index);
    const id = packed.idTable[packed.idIndexes[index]];
    const object = objects.get(id);
    const segment = packed.segments[index];
    if (!object) throw pickingDtoError("picking-rebind-missing", `picking ${kind} #${id} 已不存在`, {kind, id, segment});
    const points = getPoints(object);
    if (!Array.isArray(points?.[segment]) || !Array.isArray(points?.[segment + 1])) {
      throw pickingDtoError("picking-rebind-segment", `picking ${kind} #${id} 的 segment 已失效`, {kind, id, segment});
    }
    unique?.add(`${packed.idIndexes[index]}:${segment}`);
    target.push({kind, [kind]: object, index: segment, a: points[segment], b: points[segment + 1]});
  }
}

async function rebindPointReferencesInChunks(target, packed, bucketIndex, objects, kind, gate) {
  const start = packed.offsets[bucketIndex];
  const end = packed.offsets[bucketIndex + 1];
  for (let index = start; index < end; index++) {
    validatePackedReferenceIndex({packed, kind, segment: false}, index);
    const id = packed.idTable[packed.idIndexes[index]];
    const object = objects.get(id);
    if (!object) throw pickingDtoError("picking-rebind-missing", `picking ${kind} #${id} 已不存在`, {kind, id});
    target.push(object);
    if ((index - start + 1) % 256 === 0 || index + 1 === end) {
      const pending = gate.checkpoint(index - start + 1, end - start);
      if (pending) await pending;
    }
  }
}

async function rebindSegmentReferencesInChunks(target, packed, bucketIndex, objects, getPoints, kind, unique, gate) {
  const start = packed.offsets[bucketIndex];
  const end = packed.offsets[bucketIndex + 1];
  for (let index = start; index < end; index++) {
    validatePackedReferenceIndex({packed, kind, segment: true}, index);
    const id = packed.idTable[packed.idIndexes[index]];
    const object = objects.get(id);
    const segment = packed.segments[index];
    if (!object) throw pickingDtoError("picking-rebind-missing", `picking ${kind} #${id} 已不存在`, {kind, id, segment});
    const points = getPoints(object);
    if (!Array.isArray(points?.[segment]) || !Array.isArray(points?.[segment + 1])) {
      throw pickingDtoError("picking-rebind-segment", `picking ${kind} #${id} 的 segment 已失效`, {kind, id, segment});
    }
    unique.add(packed.idIndexes[index], segment, points.length - 1);
    target.push({kind, [kind]: object, index: segment, a: points[segment], b: points[segment + 1]});
    if ((index - start + 1) % 256 === 0 || index + 1 === end) {
      const pending = gate.checkpoint(index - start + 1, end - start);
      if (pending) await pending;
    }
  }
}

function createSegmentReferenceTracker() {
  const referencesByObject = [];
  let size = 0;
  return {
    add(objectIndex, segment, segmentCount) {
      let references = referencesByObject[objectIndex];
      if (!references) {
        references = new Uint8Array(segmentCount);
        referencesByObject[objectIndex] = references;
      }
      if (references[segment]) return;
      references[segment] = 1;
      size++;
    },
    get size() {
      return size;
    }
  };
}

function validatePackedIdTable(entry) {
  for (let index = 0; index < entry.packed.idTable.length; index++) {
    if (typeof entry.packed.idTable[index] !== "string") {
      throw pickingDtoError("picking-dto-shape", `picking ${entry.kind}.idTable 含非字符串 ID`, {index});
    }
  }
}

function validatePackedBucketRange(entry, bucketIndex) {
  const start = entry.packed.offsets[bucketIndex];
  const end = entry.packed.offsets[bucketIndex + 1];
  if (end < start) throw pickingDtoError("picking-dto-shape", `picking ${entry.kind}.offsets 非单调`, {index: bucketIndex + 1, previous: start, current: end});
}

function assertReboundUniqueSegmentCount(unique, expected, kind) {
  if (unique.size !== expected) {
    throw pickingDtoError("picking-dto-shape", `picking ${kind} segment 统计与唯一引用不一致`, {expected, actual: unique.size});
  }
}

function canonicalPickingObjects(map) {
  const cities = new Map((map?.settlements?.cities || []).filter(Boolean).map(item => [String(item.id), item]));
  const markers = new Map(markerPresentationRecords(map).map(item => [String(item.id), item]));
  const routes = new Map((map?.settlements?.routes || []).filter(Boolean).map(item => [String(item.id), item]));
  const rivers = new Map((map?.rivers?.rivers || []).filter(Boolean).map(item => [String(item.id ?? item.i), item]));
  const militaryItems = (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({...regiment, stateId: state.i, stateName: state.name || state.fullName})))
    .filter(regiment => Number.isFinite(regiment.x) && Number.isFinite(regiment.y));
  const military = new Map(militaryItems.map(item => [String(item.id ?? `${item.state ?? item.stateId}:${item.i}`), item]));
  return {cities, markers, military, routes, rivers};
}

function uniqueIdTable(values) {
  return [...new Set(values.map(value => String(value)))].sort(compareStableId);
}

function compareStableId(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber || left.localeCompare(right);
  return left.localeCompare(right);
}

function offsetsForLengths(lengths) {
  const offsets = new Uint32Array(lengths.length + 1);
  for (let index = 0; index < lengths.length; index++) offsets[index + 1] = offsets[index] + Math.max(0, Number(lengths[index]) || 0);
  return offsets;
}

function normalizeBinding(value = {}) {
  return normalizeRenderResourceBinding(value, "picking.binding");
}

function createPickingChunkGate(options = {}) {
  const signal = options.signal || null;
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const requestedChunkUnits = Number(options.chunkUnits);
  const chunkUnits = Number.isFinite(requestedChunkUnits) && requestedChunkUnits > 0
    ? Math.max(1, Math.floor(requestedChunkUnits))
    : Number.POSITIVE_INFINITY;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultPickingYield;
  let units = 0;
  let deadline = pickingNow() + budgetMs;
  return {
    checkpoint(completed, total) {
      assertCurrent();
      units++;
      const current = pickingNow();
      const finished = Number(total) > 0 && Number(completed) >= Number(total);
      const chunkBoundary = units >= chunkUnits;
      const report = finished || chunkBoundary || current >= deadline;
      if (report) options.onProgress?.("picking-rebind", {completed, total});
      if (chunkBoundary) {
        units = 0;
        return Promise.resolve(yieldToMain()).then(() => {
          assertCurrent();
          deadline = pickingNow() + budgetMs;
        });
      }
      if (current < deadline) {
        return null;
      }
      units = 0;
      return Promise.resolve(yieldToMain()).then(() => {
        assertCurrent();
        deadline = pickingNow() + budgetMs;
      });
    },
    assertCurrent
  };

  function assertCurrent() {
    if (!signal?.aborted && (!isCurrent || isCurrent() === true)) return true;
    const error = new Error(signal?.aborted ? "picking DTO 回绑已取消" : "picking DTO 回绑结果已过期");
    error.name = signal?.aborted ? "AbortError" : "Error";
    error.code = signal?.aborted ? "picking-rebind-aborted" : "picking-rebind-obsolete";
    throw error;
  }
}

function defaultPickingYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  if (typeof globalThis.MessageChannel === "function") return yieldPickingWithMessageChannel();
  return new Promise(resolve => setTimeout(resolve, 0));
}

let pickingYieldChannel = null;
const pickingYieldQueue = [];

function yieldPickingWithMessageChannel() {
  if (!pickingYieldChannel) {
    pickingYieldChannel = new globalThis.MessageChannel();
    pickingYieldChannel.port1.onmessage = () => {
      const resolve = pickingYieldQueue.shift();
      resolve?.();
      if (pickingYieldQueue.length) pickingYieldChannel.port2.postMessage(null);
    };
    pickingYieldChannel.port1.unref?.();
    pickingYieldChannel.port2.unref?.();
  }
  return new Promise(resolve => {
    const isFirst = pickingYieldQueue.length === 0;
    pickingYieldQueue.push(resolve);
    if (isFirst) pickingYieldChannel.port2.postMessage(null);
  });
}

function pickingNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function pickingDtoError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
