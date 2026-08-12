export const DOMAIN_PATCH_VERSION = 1;

export function createDomainPatch(domain, writeSet, source) {
  const operations = normalizeWriteSet(writeSet).map(path => {
    const captured = readPath(source, path);
    return {path, exists: captured.exists, value: captured.value};
  });
  return {version: DOMAIN_PATCH_VERSION, domain: String(domain || ""), writeSet: operations.map(item => item.path.join(".")), operations};
}

export function createDomainPatchCommand({patch, policy, label, historyDomain, effects, result}) {
  assertDomainPatch(patch);
  assertDomainPatchPolicy(patch, policy);
  let applied = false;
  let reverse = null;
  return {
    label: String(label || `应用 ${patch.domain} Worker 补丁`),
    domain: String(historyDomain || `worker-${patch.domain}`),
    effects,
    apply(context) {
      reverse = swapPatch(context.map, patch, reverse);
      applied = true;
    },
    revert(context) {
      if (!applied || !reverse) throw new Error("Worker 补丁缺少可撤销状态");
      reverse = swapPatch(context.map, reverse, patch);
      applied = false;
    },
    getHistoryPatch(action) {
      if (action === "undo") {
        if (!applied || !reverse) throw new Error("Worker 补丁缺少可撤销状态");
        return exportPatch(reverse);
      }
      if (action === "redo") {
        if (applied) throw new Error("Worker 补丁当前不能重做");
        return exportPatch(patch);
      }
      throw new Error(`未知历史动作：${action}`);
    },
    isNoop() {
      return patch.operations.length === 0;
    },
    getResult() {
      return result;
    }
  };
}

function exportPatch(patch) {
  return {
    version: patch.version,
    domain: patch.domain,
    writeSet: [...patch.writeSet],
    operations: patch.operations.map(operation => ({
      path: [...operation.path],
      exists: operation.exists,
      value: operation.value
    }))
  };
}

export function createMapReplacementCommand({replacementMap, label, historyDomain, effects, result, afterSwap}) {
  if (!replacementMap || typeof replacementMap !== "object" || Array.isArray(replacementMap)) {
    throw patchError("worker_replacement_invalid", "Worker 地图替换结果无效");
  }
  let alternate = replacementMap;
  let applied = false;
  return {
    label: String(label || "应用地图替换结果"),
    domain: String(historyDomain || "worker-map-replacement"),
    effects,
    apply(context) {
      alternate = swapObjectContents(context.map, alternate, afterSwap);
      applied = true;
    },
    revert(context) {
      if (!applied) throw patchError("worker_replacement_revert_invalid", "地图替换结果尚未应用，无法撤销");
      alternate = swapObjectContents(context.map, alternate, afterSwap);
      applied = false;
    },
    isNoop() {
      return false;
    },
    getResult() {
      return result;
    }
  };
}

export function assertDomainPatch(patch) {
  if (!patch || patch.version !== DOMAIN_PATCH_VERSION || !patch.domain || !Array.isArray(patch.writeSet) || !Array.isArray(patch.operations)) {
    throw patchError("worker_patch_invalid", "Worker 领域补丁无效");
  }
  const seen = new Set();
  for (const operation of patch.operations) {
    if (Object.prototype.hasOwnProperty.call(operation || {}, "prune")) {
      throw patchError("worker_patch_invalid", "Worker 补丁不得携带内部 prune 状态");
    }
    if (!Array.isArray(operation?.path) || !operation.path.length || operation.path.some(part => typeof part !== "string" || !part || part.includes("."))) {
      throw patchError("worker_patch_invalid", "Worker 补丁路径无效");
    }
    if (typeof operation.exists !== "boolean") throw patchError("worker_patch_invalid", "Worker 补丁 exists 必须为布尔值");
    if (operation.path.some(part => ["__proto__", "prototype", "constructor"].includes(part))) {
      throw patchError("worker_patch_invalid", "Worker 补丁路径包含禁止的原型字段");
    }
    const key = operation.path.join(".");
    if (seen.has(key)) throw patchError("worker_patch_invalid", `Worker 补丁路径重复：${key}`);
    seen.add(key);
  }
  const sortedPaths = [...seen].sort();
  for (let index = 1; index < sortedPaths.length; index++) {
    if (sortedPaths[index].startsWith(`${sortedPaths[index - 1]}.`)) {
      throw patchError("worker_patch_invalid", `Worker 补丁路径相互覆盖：${sortedPaths[index]}`);
    }
  }
  if (patch.writeSet.length !== seen.size
    || patch.writeSet.some(path => typeof path !== "string" || !seen.has(path))
    || new Set(patch.writeSet).size !== patch.writeSet.length) {
    throw patchError("worker_patch_invalid", "Worker 补丁 writeSet 与 operations 不一致");
  }
  return patch;
}

export function assertDomainPatchPolicy(patch, policy) {
  if (!policy || policy.domain !== patch.domain || !Array.isArray(policy.allowedPaths)) {
    throw patchError("worker_patch_policy_missing", `Worker 补丁缺少 ${patch.domain} 主线程写集策略`);
  }
  const allowed = new Set(policy.allowedPaths.map(normalizePolicyPath));
  const forbidden = (policy.forbiddenPaths || []).map(normalizePolicyPath);
  for (const operation of patch.operations) {
    const key = operation.path.join(".");
    const permitted = allowed.has(key);
    if (!permitted) throw patchError("worker_patch_write_set_violation", `Worker 补丁越过 ${patch.domain} 写集：${key}`);
    const denied = forbidden.find(root => key === root || key.startsWith(`${root}.`) || root.startsWith(`${key}.`));
    if (denied) throw patchError("worker_patch_write_set_violation", `Worker 补丁触碰 ${patch.domain} 禁区：${key} -> ${denied}`);
  }
  return true;
}

function swapPatch(map, forward, priorReverse) {
  for (const operation of forward.operations) preflightWritePath(map, operation);
  const reverseOperations = forward.operations.map(operation => {
    const current = readPath(map, operation.path);
    return {path: operation.path, exists: current.exists, value: current.value, prune: []};
  });
  let applied = 0;
  try {
    for (let index = 0; index < forward.operations.length; index++) {
      reverseOperations[index].prune = writePath(map, forward.operations[index]);
      applied = index + 1;
    }
    pruneEmptyPaths(map, forward.operations.flatMap(operation => operation.prune || []));
  } catch (error) {
    try {
      for (let index = applied - 1; index >= 0; index--) writePath(map, reverseOperations[index]);
    } catch (rollbackError) {
      const combined = patchError("worker_patch_rollback_failed", `Worker 补丁应用失败且回滚失败：${error?.message || error}`);
      combined.cause = rollbackError;
      throw combined;
    }
    throw error;
  }
  return {
    version: DOMAIN_PATCH_VERSION,
    domain: forward.domain,
    writeSet: reverseOperations.map(item => item.path.join(".")),
    operations: reverseOperations
  };
}

function readPath(root, path) {
  let owner = root;
  for (let index = 0; index < path.length - 1; index++) {
    if (!owner || !Object.prototype.hasOwnProperty.call(owner, path[index])) return {exists: false, value: undefined};
    owner = owner[path[index]];
  }
  const key = path.at(-1);
  return {
    exists: Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key)),
    value: owner?.[key]
  };
}

function writePath(root, operation) {
  let owner = root;
  const createdPaths = [];
  try {
    for (let index = 0; index < operation.path.length - 1; index++) {
      const key = operation.path[index];
      if (!Object.prototype.hasOwnProperty.call(owner, key)) {
        if (!operation.exists) return [];
        defineOwnValue(owner, key, {});
        createdPaths.push(operation.path.slice(0, index + 1));
      } else if (!owner[key] || typeof owner[key] !== "object") {
        throw patchError("worker_patch_parent_invalid", `Worker 补丁父路径不是对象：${operation.path.slice(0, index + 1).join(".")}`);
      }
      owner = owner[key];
    }
    const key = operation.path.at(-1);
    if (operation.exists) defineOwnValue(owner, key, operation.value);
    else delete owner[key];
    pruneEmptyPaths(root, operation.prune);
    return createdPaths;
  } catch (error) {
    pruneEmptyPaths(root, createdPaths);
    throw error;
  }
}

function preflightWritePath(root, operation) {
  let owner = root;
  for (let index = 0; index < operation.path.length - 1; index++) {
    const key = operation.path[index];
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (!descriptor) {
      if (!operation.exists) return true;
      if (!Object.isExtensible(owner)) throw patchError("worker_patch_target_unsafe", `Worker 补丁父路径不可扩展：${operation.path.slice(0, index).join(".") || "<root>"}`);
      owner = {};
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      throw patchError("worker_patch_target_unsafe", `Worker 补丁拒绝访问器父路径：${operation.path.slice(0, index + 1).join(".")}`);
    }
    owner = descriptor.value;
    if (!owner || typeof owner !== "object") {
      throw patchError("worker_patch_parent_invalid", `Worker 补丁父路径不是对象：${operation.path.slice(0, index + 1).join(".")}`);
    }
  }
  const key = operation.path.at(-1);
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (!descriptor) {
    if (operation.exists && !Object.isExtensible(owner)) {
      throw patchError("worker_patch_target_unsafe", `Worker 补丁目标不可扩展：${operation.path.join(".")}`);
    }
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw patchError("worker_patch_target_unsafe", `Worker 补丁拒绝访问器目标：${operation.path.join(".")}`);
  }
  if (operation.exists && descriptor.writable === false) {
    throw patchError("worker_patch_target_unsafe", `Worker 补丁目标只读：${operation.path.join(".")}`);
  }
  if (!operation.exists && descriptor.configurable === false) {
    throw patchError("worker_patch_target_unsafe", `Worker 补丁目标不可删除：${operation.path.join(".")}`);
  }
  return true;
}

function defineOwnValue(owner, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (descriptor) {
    Object.defineProperty(owner, key, {...descriptor, value});
    return;
  }
  Object.defineProperty(owner, key, {value, writable: true, enumerable: true, configurable: true});
}

function pruneEmptyPaths(root, paths = []) {
  for (const path of [...paths].sort((left, right) => right.length - left.length)) {
    let owner = root;
    for (let index = 0; index < path.length - 1; index++) owner = owner?.[path[index]];
    const key = path.at(-1);
    const value = owner?.[key];
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) delete owner[key];
  }
}

function normalizeWriteSet(writeSet) {
  const paths = (writeSet || []).map(path => Array.isArray(path) ? [...path] : String(path || "").split(".").filter(Boolean));
  paths.sort((left, right) => left.join(".").localeCompare(right.join(".")));
  const accepted = new Set();
  const result = [];
  for (const path of paths) {
    const key = path.join(".");
    if (accepted.has(key)) continue;
    let parent = "";
    let covered = false;
    for (let index = 0; index < path.length - 1; index++) {
      parent = parent ? `${parent}.${path[index]}` : path[index];
      if (accepted.has(parent)) {
        covered = true;
        break;
      }
    }
    if (covered) continue;
    accepted.add(key);
    result.push(path);
  }
  return result;
}

function swapObjectContents(target, replacement, afterSwap) {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw patchError("worker_replacement_target_invalid", "地图替换目标无效");
  }
  const targetDescriptors = Object.getOwnPropertyDescriptors(target);
  const replacementDescriptors = Object.getOwnPropertyDescriptors(replacement);
  preflightObjectReplacement(target, replacementDescriptors);
  preflightObjectReplacement(replacement, targetDescriptors);
  try {
    replaceOwnProperties(target, replacementDescriptors);
    replaceOwnProperties(replacement, targetDescriptors);
    afterSwap?.(target);
  } catch (error) {
    const rollbackFailures = [];
    try {
      replaceOwnProperties(target, targetDescriptors);
    } catch (failure) {
      rollbackFailures.push(failure);
    }
    try {
      replaceOwnProperties(replacement, replacementDescriptors);
    } catch (failure) {
      rollbackFailures.push(failure);
    }
    if (rollbackFailures.length) {
      const combined = patchError("worker_replacement_rollback_failed", `地图替换失败且回滚失败：${error?.message || error}`);
      combined.cause = new AggregateError([error, ...rollbackFailures], "地图替换与回滚均存在错误");
      throw combined;
    }
    throw error;
  }
  return replacement;
}

function preflightObjectReplacement(target, nextDescriptors) {
  for (const key of Reflect.ownKeys(target)) {
    if (Object.getOwnPropertyDescriptor(target, key)?.configurable === false) {
      throw patchError("worker_replacement_target_unsafe", `地图替换目标包含不可配置字段：${String(key)}`);
    }
  }
  if (!Object.isExtensible(target)) {
    const currentKeys = new Set(Reflect.ownKeys(target));
    const added = Reflect.ownKeys(nextDescriptors).find(key => !currentKeys.has(key));
    if (added !== undefined) throw patchError("worker_replacement_target_unsafe", `地图替换目标不可扩展：${String(added)}`);
  }
}

function replaceOwnProperties(target, descriptors) {
  for (const key of Reflect.ownKeys(target)) delete target[key];
  Object.defineProperties(target, descriptors);
}

function patchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePolicyPath(path) {
  const key = Array.isArray(path) ? path.join(".") : String(path || "").trim();
  if (!key) throw patchError("worker_patch_policy_invalid", "Worker 补丁策略包含空路径");
  return key;
}
