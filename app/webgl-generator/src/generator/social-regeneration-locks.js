export function createRegenerationLockConflict(reason, details = {}) {
  const error = new Error(`regeneration_lock_conflict: ${reason}`);
  error.code = "regeneration_lock_conflict";
  error.details = details;
  return error;
}

export function prepareSocialRegenerationLocks({grid, pack, objects = [], field, plural, label}) {
  const sourceStore = pack?.[plural];
  const packValues = pack?.cells?.[field];
  const gridValues = grid?.cells?.[field];
  const packLength = pack?.cells?.i?.length || packValues?.length || 0;
  const gridLength = grid?.points?.length || gridValues?.length || 0;
  const explicitIds = new Set();
  const snapshots = new Map();

  for (const object of objects || []) {
    const id = socialObjectId(object);
    if (!Number.isInteger(id) || id <= 0) throw createRegenerationLockConflict(`${label}锁包含非法 ID`, {field, id});
    if (explicitIds.has(id)) continue;
    const mirror = sourceStore?.[id];
    if (!mirror || mirror.removed) throw createRegenerationLockConflict(`${label} #${id} 不存在`, {field, id});
    if (!sameSocialLockObject(object, mirror)) throw createRegenerationLockConflict(`${label} #${id} 的 society / pack 镜像不一致`, {field, id});
    explicitIds.add(id);
    snapshots.set(id, clonePlain(object));
  }

  const protectedIds = new Set(explicitIds);
  const queue = [...explicitIds];
  while (queue.length) {
    const id = queue.shift();
    const object = snapshots.get(id) || sourceStore?.[id];
    for (const reference of inheritanceReferences(object)) {
      if (reference === 0) continue;
      const dependency = sourceStore?.[reference];
      if (!dependency || dependency.removed) {
        throw createRegenerationLockConflict(`${label} #${id} 引用了不存在的继承对象 #${reference}`, {field, id, reference});
      }
      if (!protectedIds.has(reference)) {
        protectedIds.add(reference);
        snapshots.set(reference, clonePlain(dependency));
        queue.push(reference);
      }
    }
  }

  validateInheritanceGraph(snapshots, protectedIds, label, field);
  const usedCenters = new Map();
  for (const id of protectedIds) {
    if (!explicitIds.has(id)) continue;
    const object = snapshots.get(id);
    const center = Number(object?.center);
    if (!Number.isInteger(center) || center < 0 || center >= packLength) {
      throw createRegenerationLockConflict(`${label} #${id} 的中心越界`, {field, id, center});
    }
    if (Number(pack?.cells?.h?.[center]) < 20) {
      throw createRegenerationLockConflict(`${label} #${id} 的中心位于水域`, {field, id, center});
    }
    if (Number(packValues?.[center]) !== id) {
      throw createRegenerationLockConflict(`${label} #${id} 的中心归属镜像矛盾`, {field, id, center, owner: Number(packValues?.[center]) || 0});
    }
    const previous = usedCenters.get(center);
    if (previous) throw createRegenerationLockConflict(`${label} #${id} 与 #${previous} 的中心重叠`, {field, id, previous, center});
    usedCenters.set(center, id);
    const gridCenter = Number(object?.gridCenter);
    const mirroredGridCenter = Number(pack?.cells?.g?.[center]);
    if (Number.isInteger(gridCenter) && gridCenter >= 0 && Number.isInteger(mirroredGridCenter) && gridCenter !== mirroredGridCenter) {
      throw createRegenerationLockConflict(`${label} #${id} 的 grid 中心镜像矛盾`, {field, id, center, gridCenter, mirroredGridCenter});
    }
  }

  const packOwners = new Uint32Array(packLength);
  const packFixed = new Uint8Array(packLength);
  for (let cell = 0; cell < packLength; cell++) {
    const owner = Number(packValues?.[cell]) || 0;
    if (!protectedIds.has(owner)) continue;
    packOwners[cell] = owner;
    packFixed[cell] = 1;
  }

  const gridOwners = new Uint32Array(gridLength);
  const gridFixed = new Uint8Array(gridLength);
  for (let cell = 0; cell < gridLength; cell++) {
    const owner = Number(gridValues?.[cell]) || 0;
    if (!protectedIds.has(owner)) continue;
    gridOwners[cell] = owner;
    gridFixed[cell] = 1;
  }

  return {
    field,
    plural,
    label,
    explicitIds,
    protectedIds,
    snapshots,
    packOwners,
    packFixed,
    gridOwners,
    gridFixed
  };
}

export function combineLockedSocialOptions(options, primaryKey, aliasKey) {
  const objects = [];
  const seen = new Set();
  for (const source of [options?.[primaryKey], options?.[aliasKey]]) {
    for (const object of source || []) {
      const id = socialObjectId(object);
      if (seen.has(id)) continue;
      seen.add(id);
      objects.push(object);
    }
  }
  return objects;
}

export function seedLockedSocialStore(rootObject, lockContext) {
  const store = [];
  store[0] = rootObject;
  for (const [id, snapshot] of lockContext.snapshots) store[id] = clonePlain(snapshot);
  return store;
}

export function nextAvailableSocialId(store, reservedIds = new Set()) {
  let id = 1;
  while (store[id] || reservedIds.has(id)) id++;
  return id;
}

export function restoreLockedSocialStructure(store, lockContext) {
  for (const [id, snapshot] of lockContext.snapshots) {
    const object = store?.[id];
    if (!object) throw createRegenerationLockConflict(`${lockContext.label} #${id} 在生成过程中丢失`, {field: lockContext.field, id});
    const structuralKeys = ["center", "gridCenter", "parent", "origins", "culture"];
    if (lockContext.explicitIds.has(id)) structuralKeys.push("children");
    for (const key of structuralKeys) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) object[key] = clonePlain(snapshot[key]);
      else delete object[key];
    }
  }
}

export function applyFixedOwnership(values, owners, fixed) {
  for (let cell = 0; cell < fixed.length; cell++) if (fixed[cell]) values[cell] = owners[cell];
  return values;
}

export function clearExplicitOwnershipOutsideFixed(values, explicitIds, fixed) {
  for (let cell = 0; cell < values.length; cell++) {
    if (!fixed[cell] && explicitIds.has(Number(values[cell]))) values[cell] = 0;
  }
  return values;
}

export function assertFixedOwnership(values, owners, fixed, label) {
  for (let cell = 0; cell < fixed.length; cell++) {
    if (!fixed[cell]) continue;
    if (Number(values?.[cell]) !== Number(owners[cell])) {
      throw createRegenerationLockConflict(`${label}固定归属发生变化`, {cell, expected: Number(owners[cell]), actual: Number(values?.[cell]) || 0});
    }
  }
}

function validateInheritanceGraph(snapshots, protectedIds, label, field) {
  for (const id of protectedIds) {
    const object = snapshots.get(id);
    const parent = Number(object?.parent) || 0;
    if (parent === id) throw createRegenerationLockConflict(`${label} #${id} 的父引用指向自身`, {field, id, parent});
    if (parent && !snapshots.has(parent)) throw createRegenerationLockConflict(`${label} #${id} 的父引用缺失`, {field, id, parent});
    const visited = new Set([id]);
    let cursor = parent;
    while (cursor) {
      if (visited.has(cursor)) throw createRegenerationLockConflict(`${label} #${id} 的父引用形成循环`, {field, id, cursor});
      visited.add(cursor);
      cursor = Number(snapshots.get(cursor)?.parent) || 0;
    }
  }
}

function inheritanceReferences(object) {
  const references = [];
  const parent = Number(object?.parent);
  if (Number.isInteger(parent) && parent >= 0) references.push(parent);
  for (const child of object?.children || []) {
    const id = Number(child);
    if (Number.isInteger(id) && id >= 0) references.push(id);
  }
  for (const origin of object?.origins || []) {
    const id = Number(origin);
    if (Number.isInteger(id) && id >= 0) references.push(id);
  }
  return references;
}

function socialObjectId(object) {
  return Number(object?.i ?? object?.id);
}

function sameSocialLockObject(left, right) {
  const derived = new Set(["children", "depth", "lineage", "cells", "area", "rural", "urban"]);
  const normalize = object => Object.fromEntries(
    Object.entries(object || {}).filter(([key]) => !derived.has(key)).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  );
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
}
