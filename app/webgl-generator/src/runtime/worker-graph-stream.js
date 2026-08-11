export const WORKER_GRAPH_STREAM_PROTOCOL = "webgl-generator-worker-graph";
export const WORKER_GRAPH_STREAM_VERSION = 1;

const SPECIAL_VALUE = "special";
const REFERENCE_VALUE = "reference";
const DEFAULT_PACKET_UNITS = 4096;
const DEFAULT_RECORD_UNITS = 512;
const DEFAULT_NUMERIC_BATCH_VALUES = 256 * 1024;

export async function* encodeWorkerGraph(value, options = {}) {
  const streamId = String(options.streamId || createStreamId());
  const signal = options.signal || null;
  const packetUnits = Math.max(16, Number(options.packetUnits) || DEFAULT_PACKET_UNITS);
  const recordUnits = Math.max(8, Math.min(packetUnits, Number(options.recordUnits) || DEFAULT_RECORD_UNITS));
  const sliceBytes = Math.max(16 * 1024, Number(options.sliceBytes) || 256 * 1024);
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const report = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const ids = new Map();
  const nodes = [];
  let deadline = now() + budgetMs;
  let discoveredEntries = 0;

  const checkpoint = async (force = false) => {
    throwIfAborted(signal);
    if (!force && now() < deadline) return;
    await yieldToMain();
    throwIfAborted(signal);
    deadline = now() + budgetMs;
  };

  const encodeValue = source => {
    if (source === undefined) return {type: SPECIAL_VALUE, value: "undefined"};
    if (typeof source === "number") {
      if (Number.isNaN(source)) return {type: SPECIAL_VALUE, value: "nan"};
      if (source === Infinity) return {type: SPECIAL_VALUE, value: "infinity"};
      if (source === -Infinity) return {type: SPECIAL_VALUE, value: "-infinity"};
      if (Object.is(source, -0)) return {type: SPECIAL_VALUE, value: "-0"};
      return source;
    }
    if (typeof source === "bigint") return {type: SPECIAL_VALUE, value: "bigint", data: source.toString()};
    if (source === null || typeof source === "string" || typeof source === "boolean") return source;
    if (typeof source !== "object") throw graphError("worker_graph_value_unsupported", `Worker 图不支持 ${typeof source} 值`);
    let id = ids.get(source);
    if (id === undefined) {
      id = nodes.length;
      ids.set(source, id);
      nodes.push({id, source, kind: classifyNode(source)});
    }
    return {type: REFERENCE_VALUE, id};
  };

  const root = encodeValue(value);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const source = node.source;
    if (node.kind === "view") {
      node.buffer = encodeValue(source.buffer).id;
    } else if (node.kind === "object" || node.kind === "array") {
      let denseNumeric = node.kind === "array";
      let denseNumericEntries = 0;
      for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        const item = source[key];
        if (denseNumeric && isCanonicalArrayIndex(key, source.length) && typeof item === "number") denseNumericEntries += 1;
        else denseNumeric = false;
        encodeValue(item);
        discoveredEntries += 1;
        await checkpoint();
      }
      if (denseNumeric && denseNumericEntries === source.length) node.kind = "numeric-array";
    } else if (node.kind === "map") {
      for (const [key, item] of source) {
        encodeValue(key);
        encodeValue(item);
        discoveredEntries += 1;
        await checkpoint();
      }
    } else if (node.kind === "set") {
      for (const item of source) {
        encodeValue(item);
        discoveredEntries += 1;
        await checkpoint();
      }
    }
  }
  report("discover", {nodes: nodes.length, entries: discoveredEntries});
  await checkpoint(true);

  let sequence = 0;
  let records = [];
  let units = 0;
  const makePacket = (transferables = [], done = false) => {
    const message = {
      protocol: WORKER_GRAPH_STREAM_PROTOCOL,
      version: WORKER_GRAPH_STREAM_VERSION,
      streamId,
      sequence: sequence++,
      records,
      done
    };
    records = [];
    units = 0;
    return {message, transferables};
  };
  const addRecord = (record, cost = 1) => {
    records.push(record);
    units += Math.max(1, cost);
  };

  let bufferTransfers = [];
  let bufferTransferBytes = 0;
  for (const node of nodes) {
    if (node.kind !== "buffer") continue;
    const buffer = await copyArrayBuffer(node.source, sliceBytes, checkpoint);
    addRecord({type: "buffer", id: node.id, buffer});
    bufferTransfers.push(buffer);
    bufferTransferBytes += buffer.byteLength;
    if (bufferTransfers.length >= 64 || bufferTransferBytes >= 1024 * 1024 || units >= packetUnits) {
      yield makePacket(bufferTransfers);
      bufferTransfers = [];
      bufferTransferBytes = 0;
    }
    await checkpoint();
  }
  if (bufferTransfers.length || records.length) yield makePacket(bufferTransfers);

  const numericBatchValues = Math.max(1024, Number(options.numericBatchValues) || DEFAULT_NUMERIC_BATCH_VALUES);
  let numericBatch = [];
  let numericValues = 0;
  for (const node of nodes) {
    if (node.kind !== "numeric-array") continue;
    if (numericBatch.length && numericValues + node.source.length > numericBatchValues) {
      const packed = await packNumericArrays(numericBatch, checkpoint);
      addRecord(packed.record, numericBatch.length);
      yield makePacket([packed.buffer]);
      numericBatch = [];
      numericValues = 0;
    }
    numericBatch.push(node);
    numericValues += node.source.length;
    if (numericValues >= numericBatchValues || numericBatch.length >= packetUnits) {
      const packed = await packNumericArrays(numericBatch, checkpoint);
      addRecord(packed.record, numericBatch.length);
      yield makePacket([packed.buffer]);
      numericBatch = [];
      numericValues = 0;
    }
    await checkpoint();
  }
  if (numericBatch.length) {
    const packed = await packNumericArrays(numericBatch, checkpoint);
    addRecord(packed.record, numericBatch.length);
    yield makePacket([packed.buffer]);
  }

  for (const node of nodes) {
    if (node.kind === "buffer" || node.kind === "view" || node.kind === "numeric-array") continue;
    addRecord(createDefinitionRecord(node));
    if (units >= packetUnits) yield makePacket();
    await checkpoint();
  }
  for (const node of nodes) {
    if (node.kind !== "view") continue;
    addRecord(createViewRecord(node));
    if (units >= packetUnits) yield makePacket();
    await checkpoint();
  }
  if (records.length) yield makePacket();
  report("definitions", {nodes: nodes.length});

  for (const node of nodes) {
    const source = node.source;
    if (node.kind === "object" || node.kind === "array") {
      let entries = [];
      for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        entries.push([key, encodeValue(source[key])]);
        if (entries.length >= recordUnits) {
          addRecord({type: "properties", id: node.id, entries}, entries.length);
          entries = [];
          if (units >= packetUnits) yield makePacket();
          await checkpoint();
        }
      }
      if (entries.length) addRecord({type: "properties", id: node.id, entries}, entries.length);
    } else if (node.kind === "map") {
      let entries = [];
      for (const [key, item] of source) {
        entries.push([encodeValue(key), encodeValue(item)]);
        if (entries.length >= recordUnits) {
          addRecord({type: "map-entries", id: node.id, entries}, entries.length);
          entries = [];
          if (units >= packetUnits) yield makePacket();
          await checkpoint();
        }
      }
      if (entries.length) addRecord({type: "map-entries", id: node.id, entries}, entries.length);
    } else if (node.kind === "set") {
      let entries = [];
      for (const item of source) {
        entries.push(encodeValue(item));
        if (entries.length >= recordUnits) {
          addRecord({type: "set-values", id: node.id, entries}, entries.length);
          entries = [];
          if (units >= packetUnits) yield makePacket();
          await checkpoint();
        }
      }
      if (entries.length) addRecord({type: "set-values", id: node.id, entries}, entries.length);
    }
    if (units >= packetUnits) yield makePacket();
    await checkpoint();
  }
  addRecord({type: "root", value: root});
  addRecord({type: "end", nodes: nodes.length, entries: discoveredEntries});
  yield makePacket([], true);
  report("complete", {nodes: nodes.length, entries: discoveredEntries, packets: sequence});
}

export function createWorkerGraphDecoder(options = {}) {
  const expectedStreamId = options.streamId === undefined ? null : String(options.streamId);
  const nodes = new Map();
  let streamId = expectedStreamId;
  let nextSequence = 0;
  let root;
  let rootReceived = false;
  let ended = false;
  let expectedNodes = null;
  let decodedEntries = 0;
  let failure = null;

  return Object.freeze({push, finish, get complete() { return ended && !failure; }});

  function push(packet) {
    if (failure) throw poisonedError(failure);
    try {
      assertPacket(packet);
      if (streamId === null) streamId = packet.streamId;
      if (packet.streamId !== streamId) throw graphError("worker_graph_stream_mismatch", "Worker 图数据流标识不匹配");
      if (packet.sequence !== nextSequence) throw graphError("worker_graph_sequence_invalid", "Worker 图数据包乱序或缺失");
      nextSequence += 1;
      if (ended) throw graphError("worker_graph_already_complete", "Worker 图数据流已结束");
      for (let index = 0; index < packet.records.length; index += 1) {
        const record = packet.records[index];
        if (record?.type === "end" && index !== packet.records.length - 1) {
          throw graphError("worker_graph_end_not_last", "Worker 图 end 必须是最后一条记录");
        }
        applyRecord(record);
      }
      if (packet.done && !ended) throw graphError("worker_graph_end_missing", "Worker 图结束包缺少 end 记录");
      if (!packet.done && ended) throw graphError("worker_graph_done_flag_missing", "Worker 图 end 记录缺少完成标记");
      return ended;
    } catch (error) {
      failure = error;
      throw error;
    }
  }

  function finish() {
    if (failure) throw poisonedError(failure);
    if (!ended || !rootReceived) throw graphError("worker_graph_incomplete", "Worker 图数据流尚未完整接收");
    if (expectedNodes !== null && nodes.size !== expectedNodes) {
      throw graphError("worker_graph_node_count_invalid", "Worker 图节点数量不匹配");
    }
    return root;
  }

  function applyRecord(record) {
    if (!record || typeof record !== "object") throw graphError("worker_graph_record_invalid", "Worker 图记录必须是对象");
    if (record.type === "buffer") {
      defineNode(record.id, assertArrayBuffer(record.buffer));
      return;
    }
    if (record.type === "object") {
      defineNode(record.id, record.prototype === "null" ? Object.create(null) : {});
      return;
    }
    if (record.type === "array") {
      defineNode(record.id, new Array(assertLength(record.length)));
      return;
    }
    if (record.type === "map") {
      defineNode(record.id, new Map());
      return;
    }
    if (record.type === "set") {
      defineNode(record.id, new Set());
      return;
    }
    if (record.type === "date") {
      defineNode(record.id, new Date(Number(record.value)));
      return;
    }
    if (record.type === "regexp") {
      const value = new RegExp(String(record.source || ""), String(record.flags || ""));
      value.lastIndex = Number(record.lastIndex) || 0;
      defineNode(record.id, value);
      return;
    }
    if (record.type === "view") {
      const buffer = getNode(record.buffer);
      if (!(buffer instanceof ArrayBuffer)) throw graphError("worker_graph_view_buffer_invalid", "Worker 图视图缺少 ArrayBuffer");
      defineNode(record.id, createView(record, buffer));
      return;
    }
    if (record.type === "numeric-arrays") {
      const buffer = assertArrayBuffer(record.buffer);
      const entries = record.entries;
      if (!Array.isArray(entries) || entries.length % 3 !== 0) {
        throw graphError("worker_graph_numeric_arrays_invalid", "Worker 图数值数组索引无效");
      }
      const values = new Float64Array(buffer);
      for (let index = 0; index < entries.length; index += 3) {
        const id = assertId(entries[index]);
        const offset = assertLength(entries[index + 1]);
        const length = assertLength(entries[index + 2]);
        if (offset + length > values.length) throw graphError("worker_graph_numeric_arrays_invalid", "Worker 图数值数组越界");
        const target = new Array(length);
        for (let item = 0; item < length; item += 1) target[item] = values[offset + item];
        defineNode(id, target);
        decodedEntries += length;
      }
      return;
    }
    if (record.type === "properties") {
      const target = getNode(record.id);
      if (!Array.isArray(record.entries)) throw graphError("worker_graph_entries_invalid", "Worker 图属性记录无效");
      for (const entry of record.entries) {
        if (!Array.isArray(entry) || entry.length !== 2) throw graphError("worker_graph_entry_invalid", "Worker 图属性项无效");
        defineEnumerableProperty(target, String(entry[0]), decodeValue(entry[1]));
      }
      decodedEntries += record.entries.length;
      return;
    }
    if (record.type === "map-entries") {
      const target = getNode(record.id);
      if (!(target instanceof Map) || !Array.isArray(record.entries)) throw graphError("worker_graph_entries_invalid", "Worker 图 Map 记录无效");
      for (const entry of record.entries) {
        if (!Array.isArray(entry) || entry.length !== 2) throw graphError("worker_graph_entry_invalid", "Worker 图 Map 项无效");
        target.set(decodeValue(entry[0]), decodeValue(entry[1]));
      }
      decodedEntries += record.entries.length;
      return;
    }
    if (record.type === "set-values") {
      const target = getNode(record.id);
      if (!(target instanceof Set) || !Array.isArray(record.entries)) throw graphError("worker_graph_entries_invalid", "Worker 图 Set 记录无效");
      for (const entry of record.entries) target.add(decodeValue(entry));
      decodedEntries += record.entries.length;
      return;
    }
    if (record.type === "root") {
      if (rootReceived) throw graphError("worker_graph_root_duplicate", "Worker 图根记录重复");
      root = decodeValue(record.value);
      rootReceived = true;
      return;
    }
    if (record.type === "end") {
      if (ended) throw graphError("worker_graph_end_duplicate", "Worker 图结束记录重复");
      if (!rootReceived) throw graphError("worker_graph_root_missing", "Worker 图必须在 end 前提供根记录");
      expectedNodes = assertLength(record.nodes);
      if (assertLength(record.entries) !== decodedEntries) {
        throw graphError("worker_graph_entry_count_invalid", "Worker 图条目数量不匹配");
      }
      ended = true;
      return;
    }
    throw graphError("worker_graph_record_type_invalid", `未知 Worker 图记录 ${record.type}`);
  }

  function defineNode(id, value) {
    id = assertId(id);
    if (nodes.has(id)) throw graphError("worker_graph_node_duplicate", "Worker 图节点重复");
    nodes.set(id, value);
  }

  function getNode(id) {
    id = assertId(id);
    if (!nodes.has(id)) throw graphError("worker_graph_reference_missing", `Worker 图引用 ${id} 尚未定义`);
    return nodes.get(id);
  }

  function decodeValue(value) {
    if (!value || typeof value !== "object") return value;
    if (value.type === REFERENCE_VALUE) return getNode(value.id);
    if (value.type !== SPECIAL_VALUE) throw graphError("worker_graph_encoded_value_invalid", "Worker 图编码值无效");
    if (value.value === "undefined") return undefined;
    if (value.value === "nan") return NaN;
    if (value.value === "infinity") return Infinity;
    if (value.value === "-infinity") return -Infinity;
    if (value.value === "-0") return -0;
    if (value.value === "bigint") return BigInt(String(value.data));
    throw graphError("worker_graph_special_value_invalid", "Worker 图特殊值无效");
  }
}

export async function cloneWorkerGraphByPackets(value, options = {}) {
  const decoder = createWorkerGraphDecoder({streamId: options.streamId});
  const packetStats = [];
  for await (const packet of encodeWorkerGraph(value, options)) {
    const startedAt = now();
    const cloned = structuredClone(packet.message, packet.transferables.length ? {transfer: packet.transferables} : undefined);
    decoder.push(cloned);
    packetStats.push({records: packet.message.records.length, durationMs: now() - startedAt});
  }
  return {value: decoder.finish(), packetStats};
}

function classifyNode(value) {
  if (value instanceof ArrayBuffer) return "buffer";
  if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) {
    throw graphError("worker_graph_shared_buffer_unsupported", "Worker 图不支持 SharedArrayBuffer");
  }
  if (ArrayBuffer.isView(value)) return "view";
  if (Array.isArray(value)) return "array";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regexp";
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null || prototype === Object.prototype) return "object";
  throw graphError("worker_graph_prototype_unsupported", `Worker 图不支持 ${prototype?.constructor?.name || "unknown"} 原型`);
}

function createDefinitionRecord(node) {
  if (node.kind === "object") {
    return {type: "object", id: node.id, prototype: Object.getPrototypeOf(node.source) === null ? "null" : "object"};
  }
  if (node.kind === "array") return {type: "array", id: node.id, length: node.source.length};
  if (node.kind === "map") return {type: "map", id: node.id};
  if (node.kind === "set") return {type: "set", id: node.id};
  if (node.kind === "date") return {type: "date", id: node.id, value: node.source.getTime()};
  if (node.kind === "regexp") {
    return {type: "regexp", id: node.id, source: node.source.source, flags: node.source.flags, lastIndex: node.source.lastIndex};
  }
  throw graphError("worker_graph_definition_invalid", `无法定义 Worker 图节点 ${node.kind}`);
}

function createViewRecord(node) {
  const source = node.source;
  if (source instanceof DataView) {
    return {type: "view", id: node.id, constructor: "DataView", buffer: node.buffer, byteOffset: source.byteOffset, byteLength: source.byteLength};
  }
  const constructorName = source.constructor?.name;
  assertTypedArrayConstructor(constructorName);
  return {type: "view", id: node.id, constructor: constructorName, buffer: node.buffer, byteOffset: source.byteOffset, length: source.length};
}

function createView(record, buffer) {
  const byteOffset = assertLength(record.byteOffset);
  if (record.constructor === "DataView") return new DataView(buffer, byteOffset, assertLength(record.byteLength));
  const Constructor = assertTypedArrayConstructor(record.constructor);
  return new Constructor(buffer, byteOffset, assertLength(record.length));
}

function assertTypedArrayConstructor(name) {
  const constructors = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    ...(typeof BigInt64Array === "function" ? {BigInt64Array} : {}),
    ...(typeof BigUint64Array === "function" ? {BigUint64Array} : {})
  };
  const Constructor = constructors[String(name || "")];
  if (!Constructor) throw graphError("worker_graph_view_constructor_invalid", `Worker 图视图类型 ${name} 不受支持`);
  return Constructor;
}

async function copyArrayBuffer(source, sliceBytes, checkpoint) {
  const output = new ArrayBuffer(source.byteLength);
  const input = new Uint8Array(source);
  const target = new Uint8Array(output);
  for (let offset = 0; offset < input.length; offset += sliceBytes) {
    target.set(input.subarray(offset, Math.min(input.length, offset + sliceBytes)), offset);
    await checkpoint();
  }
  return output;
}

async function packNumericArrays(nodes, checkpoint) {
  const entries = [];
  const total = nodes.reduce((sum, node) => sum + node.source.length, 0);
  const values = new Float64Array(total);
  let offset = 0;
  for (const node of nodes) {
    entries.push(node.id, offset, node.source.length);
    for (let index = 0; index < node.source.length; index += 1) {
      values[offset + index] = node.source[index];
      if ((index & 2047) === 2047) await checkpoint();
    }
    offset += node.source.length;
    await checkpoint();
  }
  return {record: {type: "numeric-arrays", entries, buffer: values.buffer}, buffer: values.buffer};
}

function isCanonicalArrayIndex(key, length) {
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function defineEnumerableProperty(target, key, value) {
  Object.defineProperty(target, key, {value, enumerable: true, configurable: true, writable: true});
}

function assertPacket(packet) {
  if (!packet || typeof packet !== "object") throw graphError("worker_graph_packet_invalid", "Worker 图数据包必须是对象");
  if (packet.protocol !== WORKER_GRAPH_STREAM_PROTOCOL || packet.version !== WORKER_GRAPH_STREAM_VERSION) {
    throw graphError("worker_graph_version_mismatch", "Worker 图数据流版本不匹配");
  }
  if (!packet.streamId || !Number.isSafeInteger(packet.sequence) || packet.sequence < 0 || !Array.isArray(packet.records) || typeof packet.done !== "boolean") {
    throw graphError("worker_graph_packet_invalid", "Worker 图数据包字段无效");
  }
}

function poisonedError(cause) {
  const error = graphError("worker_graph_decoder_poisoned", "Worker 图解码器已因先前错误失效");
  error.cause = cause;
  return error;
}

function assertArrayBuffer(value) {
  if (!(value instanceof ArrayBuffer)) throw graphError("worker_graph_buffer_invalid", "Worker 图 buffer 记录无效");
  return value;
}

function assertId(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw graphError("worker_graph_id_invalid", "Worker 图节点 ID 无效");
  return value;
}

function assertLength(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw graphError("worker_graph_length_invalid", "Worker 图长度无效");
  return value;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw new DOMException(String(signal.reason || "Worker 图数据流已取消"), "AbortError");
}

function graphError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createStreamId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
