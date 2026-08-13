export const MAP_REPLICA_PATCH_VERSION = 1;

export function createMapReplicaJournal({mapIdentity, revision = 0, checksum = null, limit = 128} = {}) {
  const identity = String(mapIdentity || "");
  if (!identity) throw replicaError("map_replica_identity_invalid", "地图副本日志缺少 mapIdentity");
  let currentRevision = requireRevision(revision, "revision");
  let currentChecksum = normalizeChecksum(checksum);
  const maxEntries = Math.max(1, Math.trunc(Number(limit) || 128));
  const entries = [];
  const acknowledgements = new Map();

  return Object.freeze({append, acknowledge, compactThrough, getSnapshot, getEntriesAfter, reset});

  function append(patch) {
    const normalized = normalizeMapReplicaPatch(patch);
    if (normalized.mapIdentity !== identity) throw replicaError("map_replica_identity_mismatch", "地图副本 patch 属于另一张地图");
    if (normalized.baseRevision !== currentRevision || normalized.targetRevision !== currentRevision + 1) {
      throw replicaError("map_replica_revision_gap", "地图副本 patch revision 不连续");
    }
    if (normalized.baseChecksum !== null && currentChecksum !== null && normalized.baseChecksum !== currentChecksum) {
      throw replicaError("map_replica_checksum_mismatch", "地图副本 patch 基线 checksum 不一致");
    }
    if (entries.some(entry => entry.patchId === normalized.patchId)) throw replicaError("map_replica_patch_duplicate", "地图副本 patchId 重复");
    entries.push(normalized);
    currentRevision = normalized.targetRevision;
    currentChecksum = normalized.targetChecksum;
    if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
    return normalized;
  }

  function acknowledge(replicaId, acknowledgement) {
    const id = String(replicaId || "");
    if (!id) throw replicaError("map_replica_ack_invalid", "地图副本 ACK 缺少 replicaId");
    const revisionValue = requireRevision(acknowledgement?.revision, "ack.revision");
    const checksumValue = normalizeChecksum(acknowledgement?.checksum);
    if (revisionValue > currentRevision) throw replicaError("map_replica_ack_ahead", "地图副本 ACK 超前于权威 revision");
    if (revisionValue === currentRevision && currentChecksum !== null && checksumValue !== currentChecksum) {
      throw replicaError("map_replica_checksum_mismatch", "地图副本 ACK checksum 不一致");
    }
    const previous = acknowledgements.get(id);
    if (previous && revisionValue < previous.revision) throw replicaError("map_replica_ack_regressed", "地图副本 ACK revision 回退");
    const value = Object.freeze({revision: revisionValue, checksum: checksumValue});
    acknowledgements.set(id, value);
    return value;
  }

  function compactThrough(revisionValue) {
    const through = requireRevision(revisionValue, "compact revision");
    let removed = 0;
    while (entries.length && entries[0].targetRevision <= through) {
      entries.shift();
      removed += 1;
    }
    return removed;
  }

  function getEntriesAfter(revisionValue) {
    const after = requireRevision(revisionValue, "after revision");
    if (after > currentRevision) throw replicaError("map_replica_revision_ahead", "请求的副本 revision 超前");
    if (after === currentRevision) return [];
    const first = entries[0];
    if (!first || after < first.baseRevision) throw replicaError("map_replica_resync_required", "副本落后于可用 journal，必须完整重同步");
    return entries.filter(entry => entry.targetRevision > after);
  }

  function reset({revision: nextRevision = 0, checksum: nextChecksum = null} = {}) {
    currentRevision = requireRevision(nextRevision, "revision");
    currentChecksum = normalizeChecksum(nextChecksum);
    entries.length = 0;
    acknowledgements.clear();
    return getSnapshot();
  }

  function getSnapshot() {
    return Object.freeze({
      mapIdentity: identity,
      revision: currentRevision,
      checksum: currentChecksum,
      entries: entries.length,
      oldestBaseRevision: entries[0]?.baseRevision ?? currentRevision,
      acknowledgements: Object.freeze(Object.fromEntries(acknowledgements))
    });
  }
}

export function createMapReplicaPatch({mapIdentity, patchId, baseRevision, targetRevision, baseChecksum = null, targetChecksum = null, writes = []} = {}) {
  return normalizeMapReplicaPatch({mapIdentity, patchId, baseRevision, targetRevision, baseChecksum, targetChecksum, writes});
}

export function normalizeMapReplicaPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw replicaError("map_replica_patch_invalid", "地图副本 patch 必须是对象");
  const mapIdentity = String(patch.mapIdentity || "");
  const patchId = String(patch.patchId || "");
  if (!mapIdentity || !patchId) throw replicaError("map_replica_patch_invalid", "地图副本 patch 缺少 identity 或 patchId");
  const baseRevision = requireRevision(patch.baseRevision, "baseRevision");
  const targetRevision = requireRevision(patch.targetRevision, "targetRevision");
  if (targetRevision !== baseRevision + 1) throw replicaError("map_replica_revision_gap", "地图副本 patch 必须恰好推进一个 revision");
  if (!Array.isArray(patch.writes) || !patch.writes.length) throw replicaError("map_replica_patch_empty", "地图副本 patch 不得为空");
  const paths = new Set();
  const writes = patch.writes.map((write, index) => normalizeWrite(write, index, paths));
  return Object.freeze({
    version: MAP_REPLICA_PATCH_VERSION,
    mapIdentity,
    patchId,
    baseRevision,
    targetRevision,
    baseChecksum: normalizeChecksum(patch.baseChecksum),
    targetChecksum: normalizeChecksum(patch.targetChecksum),
    writes: Object.freeze(writes)
  });
}

export function applyMapReplicaPatch(map, patch) {
  if (!map || typeof map !== "object") throw replicaError("map_replica_target_invalid", "地图副本目标无效");
  const normalized = normalizeMapReplicaPatch(patch);
  for (const write of normalized.writes) validateWriteTarget(map, write);
  for (const write of normalized.writes) applyWrite(map, write);
  return map;
}

function normalizeWrite(write, index, paths) {
  if (!write || typeof write !== "object" || Array.isArray(write)) throw replicaError("map_replica_write_invalid", `地图副本 write ${index} 无效`);
  const path = normalizePath(write.path);
  if (!path || paths.has(path)) throw replicaError("map_replica_write_duplicate", `地图副本 write path 重复或为空：${path}`);
  paths.add(path);
  const mode = String(write.mode || "replace");
  if (mode === "replace") return Object.freeze({path, mode, value: write.value});
  if (mode === "ranges") {
    if (!Array.isArray(write.ranges) || !write.ranges.length) throw replicaError("map_replica_ranges_invalid", `地图副本 ranges 为空：${path}`);
    const ranges = write.ranges.map(range => {
      const start = requireRevision(range?.start, "range.start");
      const values = ArrayBuffer.isView(range?.values) && !(range.values instanceof DataView)
        ? range.values
        : Array.isArray(range?.values) ? range.values : null;
      if (!values?.length) throw replicaError("map_replica_ranges_invalid", `地图副本 range values 为空：${path}`);
      return Object.freeze({start, values});
    });
    return Object.freeze({path, mode, ranges: Object.freeze(ranges)});
  }
  throw replicaError("map_replica_write_mode_invalid", `地图副本 write mode 不支持：${mode}`);
}

function applyWrite(map, write) {
  const {parent, key} = resolveParent(map, write.path);
  if (write.mode === "replace") {
    parent[key] = write.value;
    return;
  }
  const target = parent[key];
  for (const range of write.ranges) {
    if (typeof target.set === "function") target.set(range.values, range.start);
    else for (let offset = 0; offset < range.values.length; offset += 1) target[range.start + offset] = range.values[offset];
  }
}

function validateWriteTarget(map, write) {
  const {parent, key} = resolveParent(map, write.path);
  if (write.mode === "replace") return;
  const target = parent[key];
  if ((!Array.isArray(target) && !ArrayBuffer.isView(target)) || target instanceof DataView) {
    throw replicaError("map_replica_range_target_invalid", `地图副本 range 目标不是数值列：${write.path}`);
  }
  for (const range of write.ranges) {
    if (range.start + range.values.length > target.length) throw replicaError("map_replica_range_bounds", `地图副本 range 越界：${write.path}`);
  }
}

function resolveParent(root, path) {
  const parts = path.split(".");
  const key = parts.pop();
  let parent = root;
  for (const part of parts) {
    if (!parent?.[part] || typeof parent[part] !== "object") throw replicaError("map_replica_path_invalid", `地图副本 path 不存在：${path}`);
    parent = parent[part];
  }
  if (!Object.hasOwn(parent, key)) throw replicaError("map_replica_path_invalid", `地图副本 path 不存在：${path}`);
  return {parent, key};
}

function normalizePath(value) {
  const path = String(value || "").trim();
  if (!path || path.startsWith(".") || path.endsWith(".") || path.split(".").some(part => !/^[A-Za-z0-9_-]+$/u.test(part))) {
    throw replicaError("map_replica_path_invalid", `地图副本 path 无效：${path}`);
  }
  return path;
}

function requireRevision(value, label) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw replicaError("map_replica_revision_invalid", `地图副本 ${label} 无效`);
  return revision;
}

function normalizeChecksum(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function replicaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
