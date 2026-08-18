import {
  CANONICAL_MAP_FIELD_REGISTRY,
  CANONICAL_MAP_FIELD_REGISTRY_VERSION,
  listCanonicalMapSections
} from "./canonical-map-field-registry.js";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MIX_OFFSET = 0x9e3779b9;
const MIX_PRIME = 0x85ebca6b;
const checksumCache = new WeakMap();

export async function computeCanonicalMapReplicaChecksum(map, {revision = 0, budgetMs = 4, yieldToMain = defaultYield, signal = null} = {}) {
  if (!map || typeof map !== "object") throw checksumError("map_replica_checksum_target_invalid", "地图副本 checksum 目标无效");
  const key = Number(revision);
  const checksumOptions = {budgetMs, yieldToMain, signal};
  const presentationChecksum = await computePersistedPresentationChecksum(map, checksumOptions);
  const cached = checksumCache.get(map);
  if (cached?.revision === key && cached.presentationChecksum === presentationChecksum) return cached.promise;
  const promise = computeChecksum([
    "canonical-map",
    CANONICAL_MAP_FIELD_REGISTRY_VERSION,
    ...listCanonicalMapSections().flatMap(descriptor => [descriptor.path, map[descriptor.path]])
  ], checksumOptions);
  checksumCache.set(map, {revision: key, presentationChecksum, promise});
  try {
    return await promise;
  } catch (error) {
    if (checksumCache.get(map)?.promise === promise) checksumCache.delete(map);
    throw error;
  }
}

function computePersistedPresentationChecksum(map, options) {
  return computeChecksum([
    "persisted-presentation",
    CANONICAL_MAP_FIELD_REGISTRY_VERSION,
    ...CANONICAL_MAP_FIELD_REGISTRY
      .filter(descriptor => descriptor.stateKind === "persisted-presentation")
      .flatMap(descriptor => [descriptor.path, resolveOptionalPath(map, descriptor.path)])
  ], options);
}

export async function computeMapReplicaPatchTargetChecksum(baseChecksum, writes, options = {}) {
  const base = normalizeChecksum(baseChecksum);
  if (!base) throw checksumError("map_replica_checksum_missing", "地图副本 patch 缺少基线 checksum");
  return computeChecksum(["canonical-patch", base, writes], options);
}

export async function computeAppliedMapReplicaPatchTargetChecksum(map, patch, options = {}) {
  const writes = patch.writes.map(write => {
    const value = resolvePath(map, write.path);
    if (write.mode === "replace") return {path: write.path, mode: write.mode, value};
    return {
      path: write.path,
      mode: write.mode,
      ranges: write.ranges.map(range => ({
        start: range.start,
        values: typeof value.slice === "function"
          ? value.slice(range.start, range.start + range.values.length)
          : Array.from(value).slice(range.start, range.start + range.values.length)
      }))
    };
  });
  return computeMapReplicaPatchTargetChecksum(patch.baseChecksum, writes, options);
}

async function computeChecksum(value, {budgetMs = 4, yieldToMain = defaultYield, signal = null} = {}) {
  const state = {hash: FNV_OFFSET, mix: MIX_OFFSET, seen: new Map(), budgetMs: Math.max(1, Number(budgetMs) || 4), deadline: 0, yieldToMain, signal};
  state.deadline = now() + state.budgetMs;
  await hashValue(state, value);
  return `r1:${(state.hash >>> 0).toString(16).padStart(8, "0")}${(state.mix >>> 0).toString(16).padStart(8, "0")}`;
}

async function hashValue(state, value) {
  throwIfAborted(state.signal);
  if (value === null) return hashText(state, "null;");
  const type = typeof value;
  if (type === "undefined") return hashText(state, "undefined;");
  if (type === "string") return hashText(state, `string:${value.length}:${value};`);
  if (type === "boolean") return hashText(state, value ? "true;" : "false;");
  if (type === "number") return hashNumber(state, value);
  if (type === "bigint") return hashText(state, `bigint:${value};`);
  if (type !== "object") throw checksumError("map_replica_checksum_value_unsupported", `地图副本 checksum 不支持 ${type}`);
  const seenId = state.seen.get(value);
  if (seenId !== undefined) return hashText(state, `ref:${seenId};`);
  const id = state.seen.size;
  state.seen.set(value, id);
  if (value instanceof ArrayBuffer) {
    hashText(state, `buffer:${id}:${value.byteLength}:`);
    await hashBytes(state, new Uint8Array(value));
    return hashText(state, ";");
  }
  if (ArrayBuffer.isView(value)) {
    hashText(state, `view:${id}:${value.constructor.name}:${value.byteOffset}:${value.byteLength}:`);
    await hashBytes(state, new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return hashText(state, ";");
  }
  if (value instanceof Map) {
    hashText(state, `map:${id}:${value.size}:`);
    for (const [key, item] of value) {
      await hashValue(state, key);
      await hashValue(state, item);
      await checkpoint(state);
    }
    return hashText(state, ";");
  }
  if (value instanceof Set) {
    hashText(state, `set:${id}:${value.size}:`);
    for (const item of value) {
      await hashValue(state, item);
      await checkpoint(state);
    }
    return hashText(state, ";");
  }
  const keys = Object.keys(value).sort();
  hashText(state, `${Array.isArray(value) ? "array" : "object"}:${id}:${keys.length}:`);
  for (const key of keys) {
    hashText(state, `key:${key.length}:${key}:`);
    await hashValue(state, value[key]);
    await checkpoint(state);
  }
  return hashText(state, ";");
}

async function hashBytes(state, bytes) {
  for (let start = 0; start < bytes.length; start += 64 * 1024) {
    const end = Math.min(bytes.length, start + 64 * 1024);
    for (let index = start; index < end; index += 1) hashByte(state, bytes[index]);
    await checkpoint(state);
  }
}

function hashNumber(state, value) {
  if (Number.isNaN(value)) return hashText(state, "number:nan;");
  if (value === Infinity) return hashText(state, "number:infinity;");
  if (value === -Infinity) return hashText(state, "number:-infinity;");
  if (Object.is(value, -0)) return hashText(state, "number:-0;");
  return hashText(state, `number:${value};`);
}

function hashText(state, value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hashByte(state, code & 0xff);
    hashByte(state, code >>> 8);
  }
}

function hashByte(state, value) {
  state.hash ^= value;
  state.hash = Math.imul(state.hash, FNV_PRIME) >>> 0;
  state.mix ^= value;
  state.mix = Math.imul(state.mix, MIX_PRIME) >>> 0;
}

async function checkpoint(state) {
  if (now() < state.deadline) return;
  await state.yieldToMain();
  throwIfAborted(state.signal);
  state.deadline = now() + state.budgetMs;
}

function resolvePath(root, path) {
  let value = root;
  for (const part of String(path || "").split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) throw checksumError("map_replica_path_invalid", `地图副本 path 不存在：${path}`);
    value = value[part];
  }
  return value;
}

function resolveOptionalPath(root, path) {
  let value = root;
  for (const part of String(path || "").split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function normalizeChecksum(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("地图副本 checksum 已取消");
  error.name = "AbortError";
  error.code = "operation_cancelled";
  throw error;
}

function checksumError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function defaultYield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
